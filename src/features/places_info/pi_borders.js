// places-info: detects when the player crosses a country (admin_level 2) or state/province
// (admin_level 4) border from the OpenMapTiles `boundary` layer (maritime lines ignored) and shows
// a brief, quiet "Welcome to …" toast. Region names come from a keyless reverse geocoder
// (Nominatim, BigDataCloud client endpoint as fallback); country lines fall back to the tile's
// adm0_l / adm0_r codes. Teleports never trigger a toast.
import { fetchDecodedMvtTile } from '../../global_tiles.js';
import { getLang } from '../../i18n.js';

const Z = 14;
const TICK = 0.2;
const MAX_STEP_M = 1500;
const COOLDOWN_MS = 6000;

function tileOf(lat, lon) {
  const n = 1 << Z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const s = Math.sin((lat * Math.PI) / 180);
  const y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  return [x, y];
}

// Segment intersection in (lon, lat) plane. Returns cross sign of p relative to a->b or 0.
function segX(p1, p2, a, b) {
  const d = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d1 = d(a[1], a[0], b[1], b[0], p1[1], p1[0]);
  const d2 = d(a[1], a[0], b[1], b[0], p2[1], p2[0]);
  const d3 = d(p1[1], p1[0], p2[1], p2[0], a[1], a[0]);
  const d4 = d(p1[1], p1[0], p2[1], p2[0], b[1], b[0]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return d2 > 0 ? 1 : -1;
  return 0;
}

export class BorderWatch {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.prev = null;
    this.tiles = new Map(); // "x/y" -> lines | null (pending)
    this.geo = new Map();   // rounded lat/lon -> {country, state}
    this.lastToast = 0;
    this.el = null;
    this.hideTimer = 0;
  }

  _latLon() {
    const o = this.app.worldOrigin;
    const p = this.app.pos;
    if (!o || !p || !o.mPerDegLat) return null;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  _lines(x, y) {
    const key = `${x}/${y}`;
    if (this.tiles.has(key)) return this.tiles.get(key);
    this.tiles.set(key, null);
    if (this.tiles.size > 64) this.tiles.delete(this.tiles.keys().next().value);
    fetchDecodedMvtTile(Z, x, y).then((layers) => {
      const lines = [];
      for (const f of (layers && layers.boundary) || []) {
        if (f.type !== 2) continue;
        const lvl = Number(f.tags.admin_level);
        if ((lvl !== 2 && lvl !== 4) || Number(f.tags.maritime) === 1) continue;
        for (const pts of f.geom || []) if (pts.length >= 2) lines.push({ lvl, pts, l: f.tags.adm0_l || '', r: f.tags.adm0_r || '' });
      }
      this.tiles.set(key, lines);
    }).catch(() => this.tiles.set(key, []));
    return null;
  }

  update(dt) {
    this.t += dt;
    if (this.t < TICK) return;
    this.t = 0;
    if (this.app.isTeleporting) { this.prev = null; return; }
    const cur = this._latLon();
    if (!cur) return;
    if (!this.prev) { this.prev = cur; return; }
    const o = this.app.worldOrigin;
    const dm = Math.hypot((cur[0] - this.prev[0]) * o.mPerDegLat, (cur[1] - this.prev[1]) * o.mPerDegLon);
    if (dm > MAX_STEP_M) { this.prev = cur; return; }
    if (dm < 0.5) return;
    const [ax, ay] = tileOf(this.prev[0], this.prev[1]);
    const [bx, by] = tileOf(cur[0], cur[1]);
    const sets = [this._lines(ax, ay)];
    if (ax !== bx || ay !== by) sets.push(this._lines(bx, by));
    if (sets.some((s) => s === null)) return; // wait for tiles; keep prev so the whole step gets tested
    let hit = null;
    for (const lines of sets) {
      for (const ln of lines) {
        for (let i = 1; i < ln.pts.length; i++) {
          const side = segX(this.prev, cur, ln.pts[i - 1], ln.pts[i]);
          if (side && (!hit || ln.lvl < hit.lvl)) hit = { lvl: ln.lvl, code: side > 0 ? ln.l : ln.r };
        }
      }
    }
    const from = this.prev;
    this.prev = cur;
    if (!hit) return;
    const now = performance.now();
    if (now - this.lastToast < COOLDOWN_MS) return;
    this.lastToast = now;
    // Probe a little past the line so the geocoder lands inside the new region
    const k = 120 / Math.max(1, dm);
    const probe = [cur[0] + (cur[0] - from[0]) * k, cur[1] + (cur[1] - from[1]) * k];
    this._resolve(probe).then((g) => {
      const name = hit.lvl === 2 ? (g && g.country) || hit.code : (g && g.state);
      if (name) this.toast(name);
    });
  }

  async _resolve([lat, lon]) {
    const lang = getLang() === 'zh' ? 'zh' : 'en';
    const key = `${lang}:${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (this.geo.has(key)) return this.geo.get(key);
    let g = null;
    // Nominatim first (precise near borders; called only on an actual crossing), BigDataCloud as fallback.
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&lat=${lat}&lon=${lon}&accept-language=${lang}`);
      if (r.ok) {
        const j = await r.json();
        const a = (j && j.address) || {};
        if (a.country || a.state) g = { country: a.country || '', state: a.state || a.province || a.region || '' };
      }
    } catch { /* fall through */ }
    if (!g) {
      try {
        const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`);
        if (r.ok) {
          const j = await r.json();
          if (j && (j.countryName || j.principalSubdivision)) g = { country: j.countryName || '', state: j.principalSubdivision || '' };
        }
      } catch { /* offline */ }
    }
    if (g) this.geo.set(key, g);
    return g;
  }

  toast(name) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'pi-border-toast';
      document.body.appendChild(this.el);
    }
    this.el.textContent = getLang() === 'zh' ? `欢迎来到 ${name}` : `Welcome to ${name}`;
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.el && this.el.classList.remove('show'), 2600);
    this.lastName = name;
  }
}
