import { getLang } from './i18n.js';
import { searchAddress, fetchDecodedMvtTile } from './global_tiles.js';

const extraGeoStore = new Map(); // "z/x/y" -> { peaks, waterNames, airports, helipads } | { pending: true }

function getExtraTileGeo(z, x, y, onReady) {
  const key = `${z}/${x}/${y}`;
  const hit = extraGeoStore.get(key);
  if (hit) return hit.pending ? null : hit;
  if (extraGeoStore.size > 260) {
    const first = extraGeoStore.keys().next().value;
    extraGeoStore.delete(first);
  }
  extraGeoStore.set(key, { pending: true });
  const n = 1 << z;
  fetchDecodedMvtTile(z, x, y, { cache: false }) // only the extracted labels are kept (extraGeoStore)
    .then((layers) => {
      const out = { peaks: [], waterNames: [], airports: [], helipads: [] };
      if (layers) {
        for (const f of layers.mountain_peak || []) {
          if (f.type !== 1 || !f.geom || !f.geom.length) continue;
          const cls = f.tags.class || 'peak';
          if (cls !== 'peak' && cls !== 'volcano' && cls !== 'saddle') continue;
          const p = f.geom[0];
          const rawEle = Number(f.tags.ele);
          const rawFt = Number(f.tags.ele_ft);
          const ele = Number.isFinite(rawEle)
            ? Math.round(rawEle)
            : Number.isFinite(rawFt)
              ? Math.round(rawFt * 0.3048)
              : null;
          out.peaks.push({
            tags: f.tags,
            ele,
            rank: f.tags.rank | 0,
            u: lonToMx(p[1]) * n - x,
            v: latToMy(p[0]) * n - y,
          });
        }
        for (const f of layers.water_name || []) {
          if ((f.type !== 1 && f.type !== 2) || !f.geom || !f.geom.length) continue;
          const g0 = f.geom[0];
          const p = f.type === 1 ? g0 : g0[Math.floor(g0.length / 2)];
          if (!p || p.length < 2) continue;
          out.waterNames.push({
            tags: f.tags,
            cls: f.tags.class || 'water',
            u: lonToMx(p[1]) * n - x,
            v: latToMy(p[0]) * n - y,
          });
        }
        for (const f of layers.aerodrome_label || []) {
          if (f.type !== 1 || !f.geom || !f.geom.length) continue;
          const p = f.geom[0];
          out.airports.push({
            tags: f.tags,
            iata: String(f.tags.iata || f.tags.icao || '').toUpperCase(),
            u: lonToMx(p[1]) * n - x,
            v: latToMy(p[0]) * n - y,
          });
        }
        for (const f of layers.aeroway || []) {
          if (f.tags.class !== 'helipad' || !f.geom || !f.geom.length) continue;
          let lat = 0, lon = 0;
          if (f.type === 1) {
            lat = f.geom[0][0];
            lon = f.geom[0][1];
          } else if (f.type === 3 && f.geom[0].outer && f.geom[0].outer.length) {
            const ring = f.geom[0].outer;
            for (const pt of ring) { lat += pt[0]; lon += pt[1]; }
            lat /= ring.length;
            lon /= ring.length;
          } else continue;
          out.helipads.push({
            u: lonToMx(lon) * n - x,
            v: latToMy(lat) * n - y,
          });
        }
      }
      extraGeoStore.set(key, out);
      if (onReady) onReady();
    })
    .catch(() => {
      extraGeoStore.set(key, { peaks: [], waterNames: [], airports: [], helipads: [] });
    });
  return null;
}
import {
  MAP_STYLE,
  DATA_MAX_Z,
  lonToMx,
  latToMy,
  mxToLon,
  myToLat,
  getRaster,
  getCachedRaster,
  getTileData,
  addTileReadyListener,
  getRoadLabelCandidates,
  getPlaceLabelCandidates,
  pickName,
} from './features/map_tiles.js';
import { formatDistance } from './navigation.js';
import { drawPlaceIcons } from './features/places_info/pi_map.js'; // places-info

const MIN_ZOOM = 3;
const MAX_ZOOM = 18.5;
const OPEN_ZOOM = 15.3;
const HALF_WORLD_M = 19900;
const MM_SIZE = 168;
const L = (en, zh) => (getLang() === 'zh' ? zh : en);

const ICON_CLOSE =
  '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_LOCATE =
  '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1.5l5.2 12.5L8 11 2.8 14z" fill="currentColor"/></svg>';

const PLACE_PRIORITY = { country: 0, state: 1, city: 2, town: 3, island: 3, suburb: 4, village: 5, islet: 5, quarter: 6, neighbourhood: 7, hamlet: 8 };
const PLACE_FONT = {
  country: '600 15px', state: '500 13px', city: '600 15px', town: '600 13px', island: '600 13px',
  suburb: '600 10.5px', village: '500 12px', islet: '600 11.5px', quarter: '600 10px', neighbourhood: '600 10px', hamlet: '500 11px',
};
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", "Noto Sans CJK SC", sans-serif';

function injectStyles() {
  if (document.getElementById('wm-styles')) return;
  const link = document.createElement('link');
  link.id = 'wm-styles';
  link.rel = 'stylesheet';
  link.href = new URL('./features/worldmap.css', import.meta.url).href;
  document.head.appendChild(link);
}

function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function distToPolyline(pts, u, v) {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1];
    const vx = pts[i + 2] - ax, vy = pts[i + 3] - ay;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - ax) * vx + (v - ay) * vy) / l2)) : 0;
    const d = Math.hypot(ax + vx * t - u, ay + vy * t - v);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Cartographic 2D world map (full screen) + heading-up radar minimap.
 * Both render cached vector-tile rasters (features/map_tiles.js); labels are
 * placed per frame in screen space with collision avoidance (full map only).
 */
export class MapSystem {
  constructor(overview, navigator, onTeleportTo, app = null) {
    this.overview = overview;
    this.navigator = navigator;
    this.onTeleportTo = onTeleportTo;
    this.app = app;
    const self = this;
    navigator.attach(
      app || {
        get worldOrigin() {
          return self.overview && self.overview.meta;
        },
      }
    );
    injectStyles();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    // Minimap
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCanvas.width = MM_SIZE * this.dpr;
    this.minimapCanvas.height = MM_SIZE * this.dpr;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.northEl = document.querySelector('#minimap-container .radar-north');
    if (this.northEl) this.northEl.classList.add('wm-north');
    this.gpsStatusEl = document.getElementById('gps-status');
    const hudRadar = document.getElementById('hud-radar');
    if (hudRadar && this.gpsStatusEl) {
      hudRadar.appendChild(this.gpsStatusEl); // one quiet line under the radar
      this.gpsStatusEl.className = 'wm-nav-line hidden';
    }
    this._mmLast = 0;
    this._mmZoom = 15.7;
    this._mmForce = true;
    this._navText = null;
    this._navTick = 0;
    this._northPos = null;

    // Full map
    this.modalEl = document.getElementById('world-map-modal');
    this._buildModal();
    this.isOpen = false;
    this.cx = 0.5;
    this.cy = 0.5;
    this.zoom = OPEN_ZOOM;
    this.targetZoom = OPEN_ZOOM;
    this.anchor = null;
    this.drag = null;
    this.pin = null;
    this._opened = false;
    this._raf = 0;
    this._openTick = 0;
    this._textW = new Map();
    this._searchSeq = 0;
    this._results = [];
    this._activeResult = -1;

    addTileReadyListener(() => {
      if (this.isOpen) this._requestRender();
      else this._mmForce = true;
    });
    this._bindEvents();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------
  _buildModal() {
    const m = this.modalEl;
    m.classList.add('wm');
    m.innerHTML = `
      <canvas id="world-map-canvas"></canvas>
      <div class="wm-search wm-glass">
        <input type="text" autocomplete="off" spellcheck="false" />
        <div class="wm-results hidden"></div>
      </div>
      <button type="button" class="wm-icon-btn wm-glass wm-close">${ICON_CLOSE}</button>
      <button type="button" class="wm-icon-btn wm-glass wm-locate">${ICON_LOCATE}</button>
      <div class="wm-card wm-glass hidden">
        <div class="wm-card-title"></div>
        <div class="wm-card-sub"></div>
        <div class="wm-card-actions">
          <button type="button" class="wm-btn" data-act="go"></button>
          <button type="button" class="wm-btn primary" data-act="route"></button>
        </div>
      </div>
      <div class="wm-route wm-glass hidden">
        <span class="wm-route-text"></span>
        <button type="button" class="wm-btn" data-act="end"></button>
      </div>
      <div class="wm-attrib">© OpenStreetMap · OpenFreeMap</div>`;
    this.worldCanvas = m.querySelector('#world-map-canvas');
    this.worldCtx = this.worldCanvas.getContext('2d');
    this.searchInput = m.querySelector('.wm-search input');
    this.resultsEl = m.querySelector('.wm-results');
    this.closeBtn = m.querySelector('.wm-close');
    this.locateBtn = m.querySelector('.wm-locate');
    this.cardEl = m.querySelector('.wm-card');
    this.cardTitle = m.querySelector('.wm-card-title');
    this.cardSub = m.querySelector('.wm-card-sub');
    this.goBtn = m.querySelector('[data-act="go"]');
    this.routeBtn = m.querySelector('[data-act="route"]');
    this.routeBar = m.querySelector('.wm-route');
    this.routeText = m.querySelector('.wm-route-text');
    this.endBtn = m.querySelector('[data-act="end"]');
    this._applyLabels();
  }

  _applyLabels() {
    this.searchInput.placeholder = L('Search', '搜索地点');
    this.goBtn.textContent = L('Go', '前往');
    this.routeBtn.textContent = L('Route', '导航');
    this.endBtn.textContent = L('End', '结束');
    this.closeBtn.title = L('Close', '关闭');
    this.locateBtn.title = L('My location', '我的位置');
  }

  _bindEvents() {
    const mm = document.getElementById('minimap-container') || document.getElementById('hud-radar');
    if (mm) mm.addEventListener('click', () => this.toggleModal(true));
    const mapBtn = document.getElementById('map-btn') || document.getElementById('btn-map-open');
    if (mapBtn) mapBtn.addEventListener('click', () => this.toggleModal(true));

    this.closeBtn.addEventListener('click', () => this.toggleModal(false));
    this.locateBtn.addEventListener('click', () => this._centerOnPlayer());
    this.goBtn.addEventListener('click', () => this._go());
    this.routeBtn.addEventListener('click', () => this._route());
    this.endBtn.addEventListener('click', () => {
      this.navigator.clearRoute();
      this._updateNavLine(performance.now(), true);
      this._requestRender();
    });

    // Search
    let debounce = 0;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => this._search(this.searchInput.value), 320);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounce);
        const fresh = this._resultsQuery === this.searchInput.value;
        const pick = fresh ? this._results[Math.max(0, this._activeResult)] : null;
        if (pick) this._pickResult(pick);
        else this._search(this.searchInput.value, true);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this._results.length) return;
        const d = e.key === 'ArrowDown' ? 1 : -1;
        this._activeResult = (this._activeResult + d + this._results.length) % this._results.length;
        this._renderResults();
      } else if (e.key === 'Escape') {
        this.resultsEl.classList.add('hidden');
      }
    });

    // Map interaction
    const cv = this.worldCanvas;
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const rate = e.ctrlKey ? 0.012 : 0.0022; // trackpad pinch arrives as ctrl+wheel
        const dz = Math.max(-1, Math.min(1, -e.deltaY * k * rate));
        this.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.targetZoom + dz));
        const sx = e.clientX;
        const sy = e.clientY;
        this.anchor = { sx, sy, mx: this._sxToMx(sx), my: this._syToMy(sy) };
        this._requestRender();
      },
      { passive: false }
    );
    // Two-finger pinch zoom (phones/tablets): finger spread maps onto the same log2 zoom scale as the wheel,
    // anchored between the fingers. A pinch cancels the one-finger drag so it never counts as a tap.
    const touches = new Map();
    let pinch = null;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const s0 = spread();
        pinch = { d: Math.max(10, s0.d), zoom: this.zoom };
        this.drag = null;
        this.anchor = { sx: s0.mx, sy: s0.my, mx: this._sxToMx(s0.mx), my: this._syToMy(s0.my) };
      }
    }, true);
    cv.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || touches.size < 2) return;
      const s1 = spread();
      this.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom + Math.log2(Math.max(10, s1.d) / pinch.d)));
      this._requestRender();
      e.stopImmediatePropagation();
    }, true);
    const liftTouch = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2 && pinch) {
        pinch = null;
        this.drag = null; // the remaining finger starts fresh, not as a tap
      }
    };
    cv.addEventListener('pointerup', liftTouch, true);
    cv.addEventListener('pointercancel', liftTouch, true);
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pinch) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
      this.anchor = null;
      this.targetZoom = this.zoom;
      this.resultsEl.classList.add('hidden');
      this.searchInput.blur();
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) {
        const ws = this._ws();
        this.cx = Math.max(0, Math.min(1, d.cx - dx / ws));
        this.cy = Math.max(0, Math.min(1, d.cy - dy / ws));
        this._requestRender();
      }
    });
    const endDrag = (e) => {
      const d = this.drag;
      this.drag = null;
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      if (d && !d.moved && e.type === 'pointerup') this._selectAt(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this._resize();
        this._requestRender();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Public API (used by main.js)
  // -------------------------------------------------------------------------
  setOverview(overview) {
    this.overview = overview;
    this._mmForce = true;
    if (this.isOpen) this._requestRender();
  }

  toggleModal(forceState) {
    const open = forceState !== undefined ? !!forceState : !this.isOpen;
    this.isOpen = open;
    this.modalEl.classList.toggle('hidden', !open);
    if (open) {
      this._resize();
      this._applyLabels();
      if (!this._opened || !this.pin) this._centerOnPlayer(!this._opened ? OPEN_ZOOM : null);
      this._opened = true;
      this._updateNavLine(performance.now(), true);
      this._requestRender();
    } else {
      this.resultsEl.classList.add('hidden');
      this.searchInput.blur();
      this._closeCard();
      this._mmForce = true;
    }
  }

  renderWorldMap() {
    this._applyLabels();
    if (this.isOpen) this._requestRender();
  }

  /** Called every frame by the game loop; minimap redraw is throttled. */
  updateMinimap(playerPos, playerYaw, loadedChunksMap) {
    this.lastPlayerPos = playerPos;
    this.lastPlayerYaw = playerYaw;
    this.lastLoadedChunks = loadedChunksMap;
    const now = performance.now();
    this.navigator.update(playerPos, now);
    this._updateNavLine(now);
    if (this.isOpen) {
      if (now - this._openTick > 250) {
        this._openTick = now;
        this._requestRender();
      }
      return;
    }
    if (!this._mmForce && now - this._mmLast < 33) return;
    this._mmLast = now;
    this._mmForce = false;
    this._drawMinimap(playerPos, playerYaw);
  }

  // -------------------------------------------------------------------------
  // Geometry helpers
  // -------------------------------------------------------------------------
  _origin() {
    return this.navigator.origin;
  }

  _playerLatLon() {
    if (!this.lastPlayerPos || !this._origin()) return null;
    return this.navigator.worldToLatLon(this.lastPlayerPos.x, this.lastPlayerPos.z);
  }

  _ws(z = this.zoom) {
    return 256 * Math.pow(2, z);
  }
  _W() {
    return this.worldCanvas.clientWidth || window.innerWidth;
  }
  _H() {
    return this.worldCanvas.clientHeight || window.innerHeight;
  }
  _sxToMx(sx) {
    return this.cx + (sx - this._W() / 2) / this._ws();
  }
  _syToMy(sy) {
    return this.cy + (sy - this._H() / 2) / this._ws();
  }
  _mxToSx(mx) {
    return this._W() / 2 + (mx - this.cx) * this._ws();
  }
  _myToSy(my) {
    return this._H() / 2 + (my - this.cy) * this._ws();
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.worldCanvas.width = Math.round(w * this.dpr);
    this.worldCanvas.height = Math.round(h * this.dpr);
  }

  _centerOnPlayer(zoom = null) {
    const ll = this._playerLatLon();
    if (ll) {
      this.cx = lonToMx(ll[1]);
      this.cy = latToMy(ll[0]);
    }
    if (zoom !== null) this.zoom = zoom;
    else this.zoom = Math.max(this.zoom, 14.5);
    this.targetZoom = this.zoom;
    this.anchor = null;
    this._requestRender();
  }

  _measure(font, text) {
    const key = font + '|' + text;
    let w = this._textW.get(key);
    if (w === undefined) {
      if (this._textW.size > 4000) this._textW.clear();
      this.worldCtx.font = font;
      w = this.worldCtx.measureText(text).width;
      this._textW.set(key, w);
    }
    return w;
  }

  _routeMerc(r) {
    if (!r._merc || r._mercSrc !== r.latlon) {
      const m = new Float64Array(r.latlon.length * 2);
      r.latlon.forEach(([lat, lon], i) => {
        m[i * 2] = lonToMx(lon);
        m[i * 2 + 1] = latToMy(lat);
      });
      r._merc = m;
      r._mercSrc = r.latlon;
    }
    return r._merc;
  }

  // -------------------------------------------------------------------------
  // Full-map rendering
  // -------------------------------------------------------------------------
  _requestRender() {
    if (!this.isOpen || this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._frame();
    });
  }

  _frame() {
    if (!this.isOpen) return;
    let again = false;
    if (Math.abs(this.targetZoom - this.zoom) > 0.002) {
      this.zoom += (this.targetZoom - this.zoom) * 0.28;
      again = true;
    } else {
      this.zoom = this.targetZoom;
    }
    if (this.anchor) {
      const ws = this._ws();
      this.cx = Math.max(0, Math.min(1, this.anchor.mx - (this.anchor.sx - this._W() / 2) / ws));
      this.cy = Math.max(0, Math.min(1, this.anchor.my - (this.anchor.sy - this._H() / 2) / ws));
      if (!again) this.anchor = null;
    }
    if (this._render()) again = true;
    if (again) this._requestRender();
  }

  /** Draws tiles into ctx (already transformed so (0,0) is the reference point). Returns true if work remains. */
  _drawTiles(ctx, refMx, refMy, zoom, halfW, halfH, budget) {
    const tz = Math.max(MIN_ZOOM, Math.min(18, Math.round(zoom)));
    const n = Math.pow(2, tz);
    const ws = this._ws(zoom);
    const tile = ws / n;
    const x0 = Math.floor((refMx - halfW / ws) * n);
    const x1 = Math.floor((refMx + halfW / ws) * n);
    const y0 = Math.max(0, Math.floor((refMy - halfH / ws) * n));
    const y1 = Math.min(n - 1, Math.floor((refMy + halfH / ws) * n));
    let missing = false;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        const dx = (tx / n - refMx) * ws;
        const dy = (ty / n - refMy) * ws;
        const r = getRaster(tz, wx, ty, budget);
        if (r) {
          ctx.drawImage(r, dx, dy, tile + 0.6, tile + 0.6);
          continue;
        }
        missing = true;
        // Fallback: scaled ancestor while this tile loads.
        for (let k = 1; k <= 6 && tz - k >= 0; k++) {
          const a = getCachedRaster(tz - k, wx >> k, ty >> k);
          if (!a) continue;
          const sub = 1 << k;
          const sz = a.width / sub;
          ctx.drawImage(a, (wx - (wx >> k) * sub) * sz, (ty - (ty >> k) * sub) * sz, sz, sz, dx, dy, tile + 0.6, tile + 0.6);
          break;
        }
      }
    }
    return missing && budget.n <= 0;
  }

  _render() {
    const ctx = this.worldCtx;
    const W = this._W();
    const H = this._H();
    const ws = this._ws();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = MAP_STYLE.land;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    const more = this._drawTiles(ctx, this.cx, this.cy, this.zoom, W / 2, H / 2, { n: 3 });
    ctx.restore();

    this._drawTrafficOverlay(ctx, (mx) => this._mxToSx(mx), (my) => this._myToSy(my), true);
    if (this.app && this.app.liveSky) this.app.liveSky.drawMap(ctx, (mx) => this._mxToSx(mx), (my) => this._myToSy(my), lonToMx, latToMy, true); // [live-sky-weather]
    this._drawRoute(ctx, (mx) => this._mxToSx(mx), (my) => this._myToSy(my), 6.5, 4, true);
    drawPlaceIcons(ctx, this, W, H); // places-info: POI icons at street zooms
    this._drawLabels(ctx, W, H, ws);

    // Search / selection pin
    if (this.pin) {
      const sx = this._mxToSx(lonToMx(this.pin.lon));
      const sy = this._myToSy(latToMy(this.pin.lat));
      this._drawPin(ctx, sx, sy);
      this._positionCard(sx, sy, W, H);
    }

    // Player
    const ll = this._playerLatLon();
    if (ll) {
      const sx = this._mxToSx(lonToMx(ll[1]));
      const sy = this._myToSy(latToMy(ll[0]));
      this._drawPlayer(ctx, sx, sy, Math.PI - (this.lastPlayerYaw || 0), 1);
    }

    // Route summary
    const txt = this.navigator.activeRoute ? this.navigator.statusText() : '';
    if (txt) this.routeText.textContent = txt;
    this.routeBar.classList.toggle('hidden', !txt);
    return more;
  }

  _drawTrafficOverlay(ctx, toSx, toSy, full = false) {
    const traffic = (this.app && this.app.traffic) || (typeof window !== 'undefined' && window.__cityTraffic);
    if (!traffic || typeof traffic.getTrafficSegments !== 'function' || !this.lastPlayerPos || !this._origin()) return;
    if (full && this.zoom < 12.5) return;
    const radius = full ? 1400 : 480;
    const segs = traffic.getTrafficSegments(this.lastPlayerPos.x, this.lastPlayerPos.z, radius);
    this._lastTrafficSegs = segs;
    if (!segs || !segs.length) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const wCasing = full ? 6.2 : 5.4;
    const wLine = full ? 4.2 : 3.6;

    // Draw moderate (#fbbc04) first, then heavy traffic jams (#ea4335) on top
    for (const pass of ['moderate', 'heavy']) {
      for (const seg of segs) {
        if (seg.level !== pass || !seg.points || seg.points.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < seg.points.length; i++) {
          const [wx, wz] = seg.points[i];
          const [lat, lon] = this.navigator.worldToLatLon(wx, wz);
          const sx = toSx(lonToMx(lon));
          const sy = toSy(latToMy(lat));
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = seg.casing || (pass === 'heavy' ? '#8c1d18' : '#b06000');
        ctx.lineWidth = wCasing;
        ctx.stroke();
        ctx.strokeStyle = seg.color || (pass === 'heavy' ? '#ea4335' : '#fbbc04');
        ctx.lineWidth = wLine;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawRoute(ctx, toSx, toSy, wCasing, wLine, full) {
    const r = this.navigator.activeRoute;
    if (!r) return;
    const m = this._routeMerc(r);
    const start = r.straight ? 0 : Math.max(0, r.progressIdx);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = start; i < m.length / 2; i++) {
      const x = toSx(m[i * 2]);
      const y = toSy(m[i * 2 + 1]);
      if (i === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (r.straight) ctx.setLineDash([wLine * 2, wLine * 2]);
    ctx.strokeStyle = MAP_STYLE.routeCasing;
    ctx.lineWidth = wCasing;
    ctx.stroke();
    ctx.strokeStyle = MAP_STYLE.route;
    ctx.lineWidth = wLine;
    ctx.stroke();
    ctx.setLineDash([]);
    // Destination
    const gx = toSx(lonToMx(r.goalLon));
    const gy = toSy(latToMy(r.goalLat));
    ctx.beginPath();
    ctx.arc(gx, gy, full ? 6.5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx, gy, full ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = MAP_STYLE.route;
    ctx.fill();
    ctx.restore();
  }

  _drawPin(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -6, -9, -11, -9, -18);
    ctx.arc(0, -18, 9, Math.PI, 0);
    ctx.bezierCurveTo(9, -11, 3, -6, 0, 0);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ff5a5f';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, -18, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  _drawPlayer(ctx, x, y, angle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, 15 * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 163, 255, 0.16)';
    ctx.fill();
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.6);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(20, 60, 110, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  _drawLabels(ctx, W, H, ws) {
    const zoom = this.zoom;
    const lang = getLang();
    const dz = Math.max(0, Math.min(DATA_MAX_Z, Math.round(zoom)));
    const n = Math.pow(2, dz);
    const ppu = ws / n;
    const x0 = Math.floor(this._sxToMx(0) * n);
    const x1 = Math.floor(this._sxToMx(W) * n);
    const y0 = Math.max(0, Math.floor(this._syToMy(0) * n));
    const y1 = Math.min(n - 1, Math.floor(this._syToMy(H) * n));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return;

    const places = [];
    const roads = [];
    const peaks = [];
    const waterNames = [];
    const airports = [];
    const helipads = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n;
        const prep = getTileData(dz, wx, ty);
        const ox = this._mxToSx(tx / n);
        const oy = this._myToSy(ty / n);
        if (prep) {
          for (const p of getPlaceLabelCandidates(prep, lang)) {
            const effMinZ = p.cls === 'quarter' ? 12.8 : p.cls === 'neighbourhood' ? 13.4 : p.minZ;
            if (zoom < effMinZ) continue;
            if ((p.cls === 'country' || p.cls === 'state') && zoom > 9) continue;
            if (p.cls === 'city' && zoom > 16.5) continue;
            places.push({ ...p, sx: ox + p.u * ppu, sy: oy + p.v * ppu });
          }
          if (zoom >= 13.4) {
            const list = getRoadLabelCandidates(prep, lang);
            for (let i = 0; i < list.length && i < 80; i++) {
              const r = list[i];
              if (zoom < 15 && r.rank < 4) continue;
              roads.push({ ...r, sx: ox + r.u * ppu, sy: oy + r.v * ppu, len: r.segLen * ppu });
            }
          }
        }
        if (dz >= 12) {
          const extra = getExtraTileGeo(dz, wx, ty, () => this._requestRender());
          if (extra) {
            if (zoom >= 10.5) {
              for (const a of extra.airports) {
                const nm = pickName(a.tags, lang);
                if (!nm && !a.iata) continue;
                const label = a.iata && nm ? (zoom >= 12.8 ? `✈ ${a.iata} · ${nm}` : `✈ ${a.iata}`) : `✈ ${a.iata || nm}`;
                airports.push({ text: label, sx: ox + a.u * ppu, sy: oy + a.v * ppu });
              }
            }
            if (zoom >= 12.5) {
              for (const pk of extra.peaks) {
                const nm = pickName(pk.tags, lang);
                if (!nm) continue;
                const text = pk.ele != null ? `▲ ${nm} · ${pk.ele}m` : `▲ ${nm}`;
                peaks.push({ text, rank: pk.rank || 9, sx: ox + pk.u * ppu, sy: oy + pk.v * ppu });
              }
              for (const wn of extra.waterNames) {
                const nm = pickName(wn.tags, lang);
                if (!nm) continue;
                waterNames.push({ text: nm, cls: wn.cls, sx: ox + wn.u * ppu, sy: oy + wn.v * ppu });
              }
            }
            if (zoom >= 14.2) {
              for (const hp of extra.helipads) {
                helipads.push({ sx: ox + hp.u * ppu, sy: oy + hp.v * ppu });
              }
            }
          }
        }
      }
    }

    // Also merge geo features from currently loaded 3D chunks (includes rooftop hospital helipads & chunk-extracted items)
    if (this.lastLoadedChunks && this._origin()) {
      const zh = lang === 'zh';
      for (const g of this.lastLoadedChunks.values()) {
        const pl = g.userData && g.userData.places;
        if (!pl || !pl.geo) continue;
        for (const item of pl.geo) {
          const [wx, , wz, kind, sub, nameZh, nameEn, extra] = item;
          const [lat, lon] = this.navigator.worldToLatLon(wx, wz);
          const sx = this._mxToSx(lonToMx(lon));
          const sy = this._myToSy(latToMy(lat));
          if (sx < -60 || sx > W + 60 || sy < -30 || sy > H + 30) continue;
          const nm = zh ? (nameZh || nameEn) : (nameEn || nameZh);
          if (kind === 'airport' && zoom >= 10.5 && nm) {
            airports.push({ text: nm, sx, sy });
          } else if (kind === 'peak' && zoom >= 12.5 && nm) {
            peaks.push({ text: nm, rank: 1, sx, sy });
          } else if (kind === 'water' && zoom >= 12.5 && nm) {
            waterNames.push({ text: nm, cls: sub, sx, sy });
          } else if (kind === 'place' && nm) {
            const effMinZ = sub === 'quarter' ? 12.8 : sub === 'neighbourhood' ? 13.4 : 11.0;
            if (zoom >= effMinZ) places.push({ name: nm, cls: sub, rank: extra || 14, sx, sy });
          } else if (kind === 'helipad' && zoom >= 14.2) {
            helipads.push({ sx, sy });
          }
        }
      }
    }

    places.sort((a, b) => (PLACE_PRIORITY[a.cls] ?? 9) - (PLACE_PRIORITY[b.cls] ?? 9) || (a.rank || 99) - (b.rank || 99));
    peaks.sort((a, b) => (a.rank || 9) - (b.rank || 9));
    roads.sort((a, b) => b.rank - a.rank || b.len - a.len);

    const boxes = [];
    const hit = (b) => {
      for (const o of boxes) {
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
      }
      return false;
    };
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(22, 24, 28, 0.92)';
    let count = 0;
    const placedText = new Set();

    // 1. Airports (✈ SFO · San Francisco International Airport)
    const airportFont = `600 12px ${FONT_FAMILY}`;
    for (const a of airports) {
      if (a.sx < -60 || a.sx > W + 60 || a.sy < -20 || a.sy > H + 20) continue;
      if (placedText.has(a.text)) continue;
      const tw = this._measure(airportFont, a.text);
      const b = [a.sx - tw / 2 - 6, a.sy - 9, a.sx + tw / 2 + 6, a.sy + 9];
      if (hit(b)) continue;
      boxes.push(b);
      placedText.add(a.text);
      count++;
      ctx.font = airportFont;
      ctx.letterSpacing = '0.3px';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(12, 20, 32, 0.94)';
      ctx.strokeText(a.text, a.sx, a.sy);
      ctx.fillStyle = '#7cc4ff';
      ctx.fillText(a.text, a.sx, a.sy);
    }

    // 2. Places & Neighborhoods (CHINATOWN, NOB HILL, NORTH BEACH, MISSION DISTRICT)
    ctx.strokeStyle = 'rgba(22, 24, 28, 0.92)';
    for (const p of places) {
      if (count > 85) break;
      if (p.sx < -50 || p.sx > W + 50 || p.sy < -20 || p.sy > H + 20) continue;
      const small = p.cls === 'suburb' || p.cls === 'quarter' || p.cls === 'neighbourhood';
      const text = small && lang !== 'zh' ? p.name.toUpperCase() : p.name;
      if (placedText.has(text)) continue;
      const font = `${PLACE_FONT[p.cls] || '500 12px'} ${FONT_FAMILY}`;
      const tw = this._measure(font, text) + (small ? text.length * 0.8 : 0);
      const th = small ? 12 : 16;
      const b = [p.sx - tw / 2 - 4, p.sy - th / 2 - 3, p.sx + tw / 2 + 4, p.sy + th / 2 + 3];
      if (hit(b)) continue;
      boxes.push(b);
      placedText.add(text);
      count++;
      ctx.font = font;
      ctx.letterSpacing = small ? '0.8px' : '0px';
      ctx.lineWidth = 3;
      ctx.strokeText(text, p.sx, p.sy);
      ctx.fillStyle = small ? '#9fa6b0' : p.cls === 'city' || p.cls === 'country' ? '#eef0f2' : '#cfd3d8';
      ctx.fillText(text, p.sx, p.sy);
    }

    // 3. Mountain Peaks (▲ Telegraph Hill · 91m)
    const peakFont = `600 11px ${FONT_FAMILY}`;
    ctx.letterSpacing = '0.2px';
    for (const pk of peaks) {
      if (count > 105) break;
      if (pk.sx < -50 || pk.sx > W + 50 || pk.sy < -20 || pk.sy > H + 20) continue;
      if (placedText.has(pk.text)) continue;
      const tw = this._measure(peakFont, pk.text);
      const b = [pk.sx - tw / 2 - 4, pk.sy - 8, pk.sx + tw / 2 + 4, pk.sy + 8];
      if (hit(b)) continue;
      boxes.push(b);
      placedText.add(pk.text);
      count++;
      ctx.font = peakFont;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(18, 22, 18, 0.94)';
      ctx.strokeText(pk.text, pk.sx, pk.sy);
      ctx.fillStyle = '#e2c799';
      ctx.fillText(pk.text, pk.sx, pk.sy);
    }

    // 4. Water Names (McCovey Cove, China Basin, Spreckels Lake)
    const waterFont = `italic 500 11.5px ${FONT_FAMILY}`;
    ctx.letterSpacing = '0.3px';
    for (const wn of waterNames) {
      if (count > 125) break;
      if (wn.sx < -50 || wn.sx > W + 50 || wn.sy < -20 || wn.sy > H + 20) continue;
      if (placedText.has(wn.text)) continue;
      const tw = this._measure(waterFont, wn.text);
      const b = [wn.sx - tw / 2 - 4, wn.sy - 8, wn.sx + tw / 2 + 4, wn.sy + 8];
      if (hit(b)) continue;
      boxes.push(b);
      placedText.add(wn.text);
      count++;
      ctx.font = waterFont;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 22, 36, 0.92)';
      ctx.strokeText(wn.text, wn.sx, wn.sy);
      ctx.fillStyle = '#6cb8f6';
      ctx.fillText(wn.text, wn.sx, wn.sy);
    }

    // 5. Helipad badges (H)
    if (helipads.length) {
      ctx.font = `700 9.5px ${FONT_FAMILY}`;
      ctx.letterSpacing = '0px';
      for (const hp of helipads) {
        if (hp.sx < -20 || hp.sx > W + 20 || hp.sy < -20 || hp.sy > H + 20) continue;
        const b = [hp.sx - 9, hp.sy - 9, hp.sx + 9, hp.sy + 9];
        if (hit(b)) continue;
        boxes.push(b);
        ctx.beginPath();
        ctx.arc(hp.sx, hp.sy, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20, 26, 32, 0.9)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#2ee66b';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText('H', hp.sx, hp.sy + 0.5);
      }
    }
    ctx.strokeStyle = 'rgba(22, 24, 28, 0.92)';

    ctx.letterSpacing = '0px';
    const roadFont = `500 11px ${FONT_FAMILY}`;
    const seen = new Map();
    for (const r of roads) {
      if (count > 140) break;
      if (r.sx < -40 || r.sx > W + 40 || r.sy < -20 || r.sy > H + 20) continue;
      const tw = this._measure(roadFont, r.name);
      if (r.len < tw * 0.9) continue;
      const prev = seen.get(r.name);
      if (prev && prev.some(([x, y]) => Math.hypot(x - r.sx, y - r.sy) < 260)) continue;
      const c = Math.abs(Math.cos(r.ang));
      const s = Math.abs(Math.sin(r.ang));
      const hw = (c * tw + s * 13) / 2 + 2;
      const hh = (s * tw + c * 13) / 2 + 2;
      const b = [r.sx - hw, r.sy - hh, r.sx + hw, r.sy + hh];
      if (hit(b)) continue;
      boxes.push(b);
      if (prev) prev.push([r.sx, r.sy]);
      else seen.set(r.name, [[r.sx, r.sy]]);
      count++;
      ctx.save();
      ctx.translate(r.sx, r.sy);
      ctx.rotate(r.ang);
      ctx.font = roadFont;
      ctx.lineWidth = 3;
      ctx.strokeText(r.name, 0, 0);
      ctx.fillStyle = r.rank >= 6 ? '#d7dade' : '#b3b8bf';
      ctx.fillText(r.name, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Selection card, search, actions
  // -------------------------------------------------------------------------
  _nameAt(sx, sy) {
    const lang = getLang();
    const mx = this._sxToMx(sx);
    const my = this._syToMy(sy);
    const dz = Math.max(3, Math.min(DATA_MAX_Z, Math.round(this.zoom)));
    const n = Math.pow(2, dz);
    const tx = Math.floor(mx * n);
    const ty = Math.floor(my * n);
    const prep = getTileData(dz, ((tx % n) + n) % n, ty);
    let road = '';
    let place = '';
    if (prep) {
      const u = mx * n - tx;
      const v = my * n - ty;
      const ppu = this._ws() / n;
      let best = 22 / ppu;
      for (const rn of prep.roadNames) {
        const d = distToPolyline(rn.pts, u, v);
        if (d < best) {
          const nm = pickName(rn.tags, lang);
          if (nm) {
            best = d;
            road = nm;
          }
        }
      }
      let bestP = Infinity;
      for (const p of prep.places) {
        const d = Math.hypot(p.u - u, p.v - v);
        if (d < bestP) {
          const nm = pickName(p.tags, lang);
          if (nm) {
            bestP = d;
            place = nm;
          }
        }
      }
    }
    return { road, place };
  }

  _selectAt(sx, sy) {
    const mx = this._sxToMx(sx);
    const my = this._syToMy(sy);
    const lat = myToLat(my);
    const lon = mxToLon(((mx % 1) + 1) % 1);
    const { road, place } = this._nameAt(sx, sy);
    const coord = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    this.pin = { lat, lon, title: road || place || coord, label: road || '', city: place || '' };
    this._showCard();
  }

  _showCard() {
    const p = this.pin;
    if (!p) return;
    this.cardTitle.textContent = p.title;
    const ll = this._playerLatLon();
    this.cardSub.textContent = ll ? formatDistance(haversine(ll[0], ll[1], p.lat, p.lon)) : p.city;
    this.goBtn.disabled = false;
    this.routeBtn.disabled = !ll;
    this.cardEl.classList.remove('hidden');
    this._requestRender();
  }

  _closeCard() {
    this.cardEl.classList.add('hidden');
    this.pin = null;
  }

  _positionCard(sx, sy, W, H) {
    if (this.cardEl.classList.contains('hidden')) return;
    const x = Math.max(150, Math.min(W - 150, sx));
    const y = Math.max(130, Math.min(H - 10, sy));
    this.cardEl.style.left = `${x}px`;
    this.cardEl.style.top = `${y - 18}px`;
  }

  _go() {
    const p = this.pin;
    if (!p) return;
    const [x, z] = this.navigator.latLonToWorld(p.lat, p.lon);
    this._closeCard();
    this.toggleModal(false);
    if (Math.abs(x) < HALF_WORLD_M && Math.abs(z) < HALF_WORLD_M) {
      this.onTeleportTo(x, z, p.label, true);
    } else if (this.app && typeof this.app.teleportToLocation === 'function') {
      this.app.teleportToLocation(p.lat, p.lon, p.city || p.title, p.label || p.title);
    }
  }

  async _route() {
    const p = this.pin;
    const ll = this._playerLatLon();
    if (!p || !ll) return;
    this.goBtn.disabled = true;
    this.routeBtn.disabled = true;
    this.cardSub.textContent = L('Finding route…', '正在规划路线…');
    const r = await this.navigator.routeTo(ll[0], ll[1], p.lat, p.lon, p.title);
    if (this.pin !== p) return;
    if (!r) {
      this.cardSub.textContent = L('Already here', '已在附近');
      this.goBtn.disabled = false;
      this.routeBtn.disabled = false;
      return;
    }
    this._closeCard();
    this._fitRoute(r);
    this._updateNavLine(performance.now(), true);
    this._requestRender();
  }

  _fitRoute(r) {
    const m = this._routeMerc(r);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < m.length; i += 2) {
      a = Math.min(a, m[i]);
      c = Math.max(c, m[i]);
      b = Math.min(b, m[i + 1]);
      d = Math.max(d, m[i + 1]);
    }
    const W = this._W();
    const H = this._H();
    const inView = a > this._sxToMx(40) && c < this._sxToMx(W - 40) && b > this._syToMy(90) && d < this._syToMy(H - 90);
    if (inView) return;
    const span = Math.max((c - a) / (W * 0.7), (d - b) / (H * 0.65), 1e-9);
    this.zoom = this.targetZoom = Math.max(MIN_ZOOM, Math.min(16.5, Math.log2(1 / (256 * span))));
    this.cx = (a + c) / 2;
    this.cy = (b + d) / 2;
    this.anchor = null;
  }

  async _search(q, pickFirst = false) {
    const seq = ++this._searchSeq;
    if (!q.trim()) {
      this._results = [];
      this._resultsQuery = q;
      this.resultsEl.classList.add('hidden');
      return;
    }
    let res = [];
    try {
      res = await searchAddress(q);
    } catch {
      res = [];
    }
    if (seq !== this._searchSeq) return;
    this._resultsQuery = q;
    this._results = (res || []).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)).slice(0, 5);
    this._activeResult = -1;
    if (pickFirst && this._results.length) {
      this._pickResult(this._results[0]);
      return;
    }
    this._renderResults();
  }

  _renderResults() {
    const el = this.resultsEl;
    el.textContent = '';
    if (!this._results.length) {
      el.classList.add('hidden');
      return;
    }
    const zh = getLang() === 'zh';
    this._results.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'wm-result' + (i === this._activeResult ? ' active' : '');
      const full = zh && r.nameZh ? r.nameZh : r.name || '';
      const [primary, ...rest] = full.split(' · ');
      row.textContent = primary;
      const sub = document.createElement('small');
      sub.textContent = rest.join(' · ') || (zh && r.cityZh ? r.cityZh : r.city) || '';
      row.appendChild(sub);
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._pickResult(r);
      });
      el.appendChild(row);
    });
    el.classList.remove('hidden');
  }

  _pickResult(r) {
    const zh = getLang() === 'zh';
    const full = zh && r.nameZh ? r.nameZh : r.name || '';
    const primary = full.split(' · ')[0];
    this.resultsEl.classList.add('hidden');
    this.searchInput.value = primary;
    this.searchInput.blur();
    this.pin = { lat: r.lat, lon: r.lon, title: primary, label: r.street || primary, city: r.city || '' };
    this.cx = lonToMx(r.lon);
    this.cy = latToMy(r.lat);
    this.zoom = this.targetZoom = Math.max(this.zoom, 15.5);
    this.anchor = null;
    this._showCard();
  }

  // -------------------------------------------------------------------------
  // HUD nav line + minimap
  // -------------------------------------------------------------------------
  _updateNavLine(now, force = false) {
    if (!force && now - this._navTick < 500) return;
    this._navTick = now;
    const txt = this.navigator.statusText(now);
    if (txt === this._navText || !this.gpsStatusEl) return;
    this._navText = txt;
    this.gpsStatusEl.textContent = txt;
    this.gpsStatusEl.classList.toggle('hidden', !txt);
  }

  _drawMinimap(playerPos, playerYaw) {
    const ctx = this.minimapCtx;
    const S = MM_SIZE;
    const origin = this._origin();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = MAP_STYLE.land;
    ctx.fillRect(0, 0, S, S);
    if (!origin) return;

    // Zoom out smoothly with speed.
    const speed = Math.abs((this.app && this.app.speed) || 0);
    const target = 15.7 - Math.min(1, speed / 38) * 1.3;
    this._mmZoom += (target - this._mmZoom) * 0.08;
    const zoom = this._mmZoom;
    const ws = this._ws(zoom);

    const [lat, lon] = this.navigator.worldToLatLon(playerPos.x, playerPos.z);
    const pmx = lonToMx(lon);
    const pmy = latToMy(lat);
    const rot = (playerYaw || 0) - Math.PI; // heading-up

    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(rot);
    const R = S * 0.72;
    if (this._drawTiles(ctx, pmx, pmy, zoom, R, R, { n: 1, shared: true })) this._mmForce = true;
    this._drawTrafficOverlay(ctx, (mx) => (mx - pmx) * ws, (my) => (my - pmy) * ws, false);
    this._drawRoute(ctx, (mx) => (mx - pmx) * ws, (my) => (my - pmy) * ws, 5.5, 3.2, false);
    if (this.app && this.app.liveSky) this.app.liveSky.drawMap(ctx, (mx) => (mx - pmx) * ws, (my) => (my - pmy) * ws, lonToMx, latToMy, false); // [live-sky-weather]
    ctx.restore();

    this._drawPlayer(ctx, S / 2, S / 2, 0, 0.85);

    if (this.northEl) {
      const nx = Math.round(S / 2 + Math.sin(rot) * 70);
      const ny = Math.round(S / 2 - Math.cos(rot) * 70);
      if (!this._northPos || this._northPos[0] !== nx || this._northPos[1] !== ny) {
        this._northPos = [nx, ny];
        this.northEl.style.left = `${nx}px`;
        this.northEl.style.top = `${ny}px`;
      }
    }
  }
}
