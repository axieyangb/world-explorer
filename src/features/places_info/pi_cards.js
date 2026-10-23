// places-info: landmark info cards. When the player is near / looking at a notable place, a small,
// quiet card shows its title + one-line description; click expands a short extract + thumbnail.
// Source: Wikipedia GeoSearch + REST page summary (keyless, CORS via origin=*), cached and
// rate-limited (one request in flight, >= 1.2 s apart). Wikipedia articles whose title matches a
// named POI in the loaded chunks are preferred; if Wikipedia is unreachable, notable named POIs
// (museums, stadiums, campuses, ...) still get a plain card. One card at a time; it auto-hides
// when you move away (or after a while if left collapsed).
import { getLang } from '../../i18n.js';
import { getBeijingTerrainElevation } from '../../environment.js';

const MIN_GAP_MS = 1200;
const SEEN_COOLDOWN_MS = 10 * 60 * 1000;
const COLLAPSED_TTL = 22;
const TYPE_LABEL = {
  en: { museum: 'Museum', attraction: 'Attraction', stadium: 'Stadium', college: 'University', place_of_worship: 'Place of worship', monument: 'Monument', theatre: 'Theatre', castle: 'Castle', library: 'Library', town_hall: 'Civic building', zoo: 'Zoo', aquarium: 'Aquarium' },
  zh: { museum: '博物馆', attraction: '景点', stadium: '体育场', college: '大学', place_of_worship: '宗教场所', monument: '纪念碑', theatre: '剧院', castle: '城堡', library: '图书馆', town_hall: '市政建筑', zoo: '动物园', aquarium: '水族馆' },
};
const STRONG_POI = new Set(['museum', 'attraction', 'stadium', 'college', 'monument', 'castle', 'zoo', 'aquarium', 'theatre']);

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

export class InfoCards {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.queue = [];
    this.busy = false;
    this.lastReq = 0;
    this.cells = new Map();     // lang:cell -> [{title, lat, lon}] | 'pending' | 'fail'
    this.summaries = new Map(); // lang:title -> summary | 'pending' | null
    this.seen = new Map();      // id -> timestamp hidden
    this.cur = null;            // {id, title, x, z, R, shownAt, summary, wiki}
    this.wikiDown = false;
    this.el = null;
    this.stats = { requests: 0, cacheHits: 0, shown: 0 };
  }

  // ------------------------------------------------------------------ network (rate-limited)
  _enqueue(url, cb) {
    this.queue.push([url, cb]);
    this._pump();
  }
  _pump() {
    if (this.busy || !this.queue.length) return;
    const wait = Math.max(0, this.lastReq + MIN_GAP_MS - performance.now());
    if (wait > 0) { setTimeout(() => this._pump(), wait + 5); return; }
    const [url, cb] = this.queue.shift();
    this.busy = true;
    this.lastReq = performance.now();
    this.stats.requests++;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { this.wikiDown = false; cb(j); }, () => { cb(null); })
      .finally(() => { this.busy = false; this._pump(); });
  }

  _lang() { return getLang() === 'zh' ? 'zh' : 'en'; }

  _cellResults(lat, lon, coarse) {
    const step = coarse ? 0.015 : 0.004;
    const radius = coarse ? 1800 : 520;
    const cy = Math.round(lat / step), cx = Math.round(lon / step);
    const lang = this._lang();
    const key = `${lang}:${coarse ? 'c' : 'f'}:${cy}:${cx}`;
    const hit = this.cells.get(key);
    if (hit !== undefined) {
      if (Array.isArray(hit)) this.stats.cacheHits++;
      return Array.isArray(hit) ? hit : [];
    }
    this.cells.set(key, 'pending');
    if (this.cells.size > 240) this.cells.delete(this.cells.keys().next().value);
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${(cy * step).toFixed(5)}%7C${(cx * step).toFixed(5)}` +
      `&gsradius=${radius}&gslimit=40&gsprimary=primary&format=json&origin=*`;
    this._enqueue(url, (j) => {
      const list = j && j.query && Array.isArray(j.query.geosearch) ? j.query.geosearch : null;
      if (!list) { this.cells.set(key, 'fail'); this.wikiDown = true; setTimeout(() => this.cells.delete(key), 60000); return; }
      this.cells.set(key, list
        .filter((g) => g && g.title && !/^(List of|Timeline of|Outline of)/i.test(g.title))
        .map((g) => ({ title: g.title, lat: g.lat, lon: g.lon })));
    });
    return [];
  }

  _summary(title, cb) {
    const lang = this._lang();
    const key = `${lang}:${title}`;
    const hit = this.summaries.get(key);
    if (hit === 'pending') return;
    if (hit !== undefined) { cb(hit); return; }
    this.summaries.set(key, 'pending');
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    this._enqueue(url, (j) => {
      const s = j && j.type !== 'disambiguation' && (j.extract || j.description)
        ? {
          title: j.title || title,
          desc: j.description || '',
          extract: j.extract || '',
          thumb: (j.thumbnail && j.thumbnail.source) || '',
          url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || '',
        }
        : null;
      this.summaries.set(key, s);
      if (this.summaries.size > 300) this.summaries.delete(this.summaries.keys().next().value);
      cb(s);
    });
  }

  // ------------------------------------------------------------------ selection
  update(dt) {
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    const app = this.app;
    const o = app.worldOrigin;
    if (!o || !o.mPerDegLat || !app.camera || !app.pos) return;
    const blocked = app.isTeleporting || (app.mapSystem && app.mapSystem.isOpen);
    if (blocked) { this._hide(false); return; }

    const P = app.pos;
    const cam = app.camera;
    const dir = cam.getWorldDirection ? cam.getWorldDirection(this._v || (this._v = cam.position.clone())) : null;
    let fx = dir ? dir.x : 0, fz = dir ? dir.z : 1;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const alt = Math.max(0, cam.position.y - getBeijingTerrainElevation(cam.position.x, cam.position.z));
    const R = alt < 60 ? 170 : Math.min(750, 170 + alt * 1.6);
    const now = performance.now();

    // Keep the current card while still near; hide when moving away.
    if (this.cur) {
      const d = Math.hypot(this.cur.x - P.x, this.cur.z - P.z);
      const age = (now - this.cur.shownAt) / 1000;
      const expanded = this.el && this.el.classList.contains('expanded');
      if (d > Math.max(R, this.cur.R) * 1.45 || (!expanded && age > COLLAPSED_TTL)) this._hide(true);
      return;
    }

    const lat = o.centerLat - P.z / o.mPerDegLat;
    const lon = o.centerLon + P.x / o.mPerDegLon;
    const toXZ = (la, lo) => [(lo - o.centerLon) * o.mPerDegLon, (o.centerLat - la) * o.mPerDegLat];
    const poiNames = this._nearPoiNames(P, R * 1.5);

    let best = null;
    const consider = (id, title, x, z, boost, extra) => {
      const seenAt = this.seen.get(id);
      if (seenAt && now - seenAt < SEEN_COOLDOWN_MS) return;
      const dx = x - P.x, dz = z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > R) return;
      const ang = d < 1 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > 0.5 && d > 45) return; // not in view and not right here
      const score = (d / R + ang / 1.0) * boost;
      if (!best || score < best.score) best = { id, title, x, z, score, ...extra };
    };
    const results = this._cellResults(lat, lon, alt > 120);
    for (const g of results) {
      const [x, z] = toXZ(g.lat, g.lon);
      const n = norm(g.title);
      let boost = 1;
      for (const pn of poiNames) if (pn.length > 3 && (n.includes(pn) || pn.includes(n))) { boost = 0.5; break; }
      consider(`w:${g.title}`, g.title, x, z, boost, { wiki: true });
    }
    if (!best && this.wikiDown) {
      for (const p of this._nearPois(P, R)) {
        if (!STRONG_POI.has(p.cls)) continue;
        consider(`p:${p.name}`, p.name, p.x, p.z, 1, { wiki: false, cls: p.cls });
      }
    }
    if (!best) return;
    const pick = { ...best, R, shownAt: now };
    if (!pick.wiki) {
      const lbl = TYPE_LABEL[this._lang()][pick.cls] || '';
      this._show(pick, { title: pick.title, desc: lbl, extract: '', thumb: '', url: '' });
      return;
    }
    this.cur = pick; // reserve while the summary loads
    this._summary(pick.title, (s) => {
      if (this.cur !== pick) return;
      if (!s) { this.cur = null; this.seen.set(pick.id, performance.now()); return; }
      this._show(pick, s);
    });
  }

  _nearPois(P, r) {
    const out = [];
    for (const g of this.app.loadedChunks.values()) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.piNotable) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(P.x - ox) > 500 + r || Math.abs(P.z - oz) > 500 + r) continue;
      for (const [x, z, cls, , name, nameEn] of pl.piNotable) {
        if (Math.hypot(x - P.x, z - P.z) > r) continue;
        out.push({ x, z, cls, name: this._lang() === 'zh' ? name : nameEn || name });
      }
    }
    return out;
  }
  _nearPoiNames(P, r) {
    return this._nearPois(P, r).map((p) => norm(p.name));
  }

  // ------------------------------------------------------------------ DOM
  _ensureEl() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'pi-card';
    el.innerHTML = '<img class="pi-card-img" alt=""><div class="pi-card-body"><div class="pi-card-title"></div>' +
      '<div class="pi-card-desc"></div><div class="pi-card-extract"></div><a class="pi-card-link" target="_blank" rel="noopener">Wikipedia</a></div>';
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'wheel', 'touchstart']) el.addEventListener(ev, stop);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target && e.target.classList.contains('pi-card-link')) return;
      if (!el.classList.contains('expandable')) return;
      el.classList.toggle('expanded');
    });
    document.body.appendChild(el);
    this.el = el;
    return el;
  }

  _show(pick, s) {
    const el = this._ensureEl();
    this.cur = pick;
    pick.summary = s;
    el.classList.remove('expanded');
    el.querySelector('.pi-card-title').textContent = s.title || pick.title;
    let desc = s.desc;
    if (!desc && s.extract) desc = s.extract.split(/(?<=[.!?。])\s/)[0];
    el.querySelector('.pi-card-desc').textContent = desc || '';
    const ex = s.extract && s.extract.length > 340 ? `${s.extract.slice(0, 330).replace(/\s+\S*$/, '')}…` : s.extract || '';
    el.querySelector('.pi-card-extract').textContent = ex;
    const img = el.querySelector('.pi-card-img');
    if (s.thumb) img.src = s.thumb; else img.removeAttribute('src');
    img.style.display = s.thumb ? '' : 'none';
    const link = el.querySelector('.pi-card-link');
    link.style.display = s.url ? '' : 'none';
    if (s.url) link.href = s.url;
    el.classList.toggle('expandable', Boolean(ex || s.thumb));
    el.classList.add('show');
    this.stats.shown++;
  }

  _hide(markSeen) {
    if (this.cur && markSeen) this.seen.set(this.cur.id, performance.now());
    if (!markSeen && this.cur && !this.cur.summary) return; // still loading; keep reservation
    this.cur = null;
    if (this.el) this.el.classList.remove('show', 'expanded');
  }

  /** Debug snapshot. */
  state() {
    return { ...this.stats, current: this.cur ? this.cur.title : '', cells: this.cells.size, summaries: this.summaries.size, wikiDown: this.wikiDown };
  }
}
