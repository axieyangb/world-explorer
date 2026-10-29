// [ui-mobile] Graphics quality tiers (Auto / High / Medium / Low) and a frame-time governor.
//
// QUALITY is a plain settings object the renderers read directly (traffic counts, prop / tree / label
// draw distances, chunk-detail distances, shadow size, DPR cap). Systems never cache these values, so a
// tier change takes effect on their next refresh. Only the cheap surface shaders and the chunk streaming
// radius are fixed at page load (they need a shader recompile / a different stream).
//
// Auto picks the tier from the device (phone -> Low, tablet / low-memory / weak GPU -> Medium, otherwise
// High), then a governor watches the frame time: sustained slow frames lower the render resolution step by
// step, and on touch / low devices also drop one tier; sustained fast frames undo it (asymmetric windows
// and thresholds, so it does not oscillate). High / Medium / Low pin the tier and leave only the resolution
// governor off. ?quality=auto|high|medium|low overrides the saved choice for one visit.
import { isTouchDevice } from './touch_controls.js';
import { getLang } from '../i18n.js';

const TIERS = {
  //        DPR cap/min    shadow map/dist     traffic, peds, car shadows   prop, places, trees(near/mid/far)          chunk detail distances (m, from the chunk edge)                    min fog   labels
  high: { dprCap: 1.5, dprMin: 0.85, shadowMap: 2048, shadowDist: 1.0, traffic: 1.0, peds: 1.0, carShadows: true, props: 1.0, places: 1.0, treeNear: 1.0, treeMid: 1.0, treeFar: 1.0, markingsM: Infinity, wear: true, roadsM: Infinity, buildingsM: Infinity, landcoverM: Infinity, horizonDetail: true, fogMin: 0, labels: 10 },
  medium: { dprCap: 1.5, dprMin: 1.0, shadowMap: 1536, shadowDist: 0.8, traffic: 0.55, peds: 0.7, carShadows: true, props: 0.75, places: 0.7, treeNear: 0.85, treeMid: 0.8, treeFar: 0.8, markingsM: 650, wear: true, roadsM: 1300, buildingsM: Infinity, landcoverM: 1100, horizonDetail: true, fogMin: 0.00028, labels: 8 },
  low: { dprCap: 1.25, dprMin: 0.9, shadowMap: 1024, shadowDist: 0.6, traffic: 0.18, peds: 0.35, carShadows: false, props: 0.55, places: 0.3, treeNear: 0.7, treeMid: 0.5, treeFar: 0.45, markingsM: 360, wear: false, roadsM: 850, buildingsM: 950, landcoverM: 650, horizonDetail: false, fogMin: 0.00055, labels: 6 },
};
const ORDER = ['low', 'medium', 'high'];
const MODES = ['auto', 'high', 'medium', 'low'];
const STORE_KEY = 'we-quality';

function urlChoice() {
  try {
    const q = new URLSearchParams(window.location.search).get('quality');
    return q && MODES.includes(q.toLowerCase()) ? q.toLowerCase() : null;
  } catch (e) { return null; }
}
function savedChoice() {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    return MODES.includes(v) ? v : null;
  } catch (e) { return null; }
}

const WEAK_GPU_RE = /swiftshader|llvmpipe|software|mali-[gt]?\d{2,3}\b|adreno[^0-9]*[1-5]\d\d\b|powervr|intel.*(hd|uhd) graphics( \d{3})?\b/i;

// What the device can take, before any frame has been measured.
// NOTE: We do NOT create a throwaway WebGL context here at module import time,
// as allocating and losing a context right before Three.js starts causes WebGL creation
// failures on macOS Safari/Chrome under context limits. Weak GPU is checked post-init.
function detectTier() {
  if (typeof window === 'undefined') return 'high';
  const touch = isTouchDevice();
  const mem = navigator.deviceMemory || 8; // GB, Chrome only (capped at 8)
  const cores = navigator.hardwareConcurrency || 8;
  const scr = window.screen || { width: 1920, height: 1080 };
  const phone = touch && Math.min(scr.width, scr.height) < 600;
  if (phone || mem <= 2) return 'low';
  if (touch || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

const choice = (typeof window !== 'undefined' && (urlChoice() || savedChoice())) || 'auto';
const deviceTier = detectTier();

/** Live settings; read these, never copy them. */
export const QUALITY = {
  mode: choice, // 'auto' | 'high' | 'medium' | 'low'
  tier: choice === 'auto' ? deviceTier : choice,
  baseTier: choice === 'auto' ? deviceTier : choice,
  deviceTier,
  version: 0, // bumps on every tier change
  ...TIERS[choice === 'auto' ? deviceTier : choice],
};

// Fixed for the session (shader variants): the page loaded on Low, or on Medium with a touch screen.
const LITE_SURFACES = QUALITY.tier === 'low' || (typeof window !== 'undefined' && isTouchDevice() && QUALITY.tier !== 'high');
export function liteSurfaces() {
  return LITE_SURFACES;
}

const LABELS = {
  en: { title: 'Graphics', auto: 'Auto', high: 'High', medium: 'Med', low: 'Low' },
  zh: { title: '画质', auto: '自动', high: '高', medium: '中', low: '低' },
};

export class QualityManager {
  constructor(app) {
    this.app = app;
    this.resScale = 1;
    this._ema = 16.7;
    this._slowT = 0;
    this._fastT = 0;
    this._cullT = 0;
    this._shadowSize = 0;
    this._carShadows = null;
    this._hzShown = true;
    this.applyPixelRatio();
    this._bindMenu();

    // Inspect the already-created WebGL context for weak GPUs without creating a throwaway context
    try {
      const gl = app.renderer && app.renderer.getContext && app.renderer.getContext();
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
        if (WEAK_GPU_RE.test(gpu) && QUALITY.deviceTier === 'high') {
          QUALITY.deviceTier = 'medium';
          if (QUALITY.mode === 'auto') {
            QUALITY.baseTier = 'medium';
            this._setTier('medium');
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  describe() {
    return { mode: QUALITY.mode, tier: QUALITY.tier, device: QUALITY.deviceTier, res: +this.resScale.toFixed(2), ms: +this._ema.toFixed(1) };
  }

  _targetDpr() {
    const dev = window.devicePixelRatio || 1;
    const cap = Math.min(dev, QUALITY.dprCap);
    return Math.max(Math.min(QUALITY.dprMin, cap), cap * this.resScale);
  }

  applyPixelRatio() {
    const r = this.app.renderer;
    const want = Math.round(this._targetDpr() * 100) / 100;
    if (Math.abs(r.getPixelRatio() - want) < 0.01) return;
    r.setPixelRatio(want);
    r.setSize(window.innerWidth, window.innerHeight);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    QUALITY.mode = mode;
    try { window.localStorage.setItem(STORE_KEY, mode); } catch (e) { /* private mode */ }
    QUALITY.baseTier = mode === 'auto' ? QUALITY.deviceTier : mode;
    this.resScale = 1;
    this._slowT = this._fastT = 0;
    this._setTier(QUALITY.baseTier);
    this._syncMenu();
  }

  _setTier(tier) {
    if (!TIERS[tier]) return;
    Object.assign(QUALITY, TIERS[tier]);
    QUALITY.tier = tier;
    QUALITY.version++;
    this.applyPixelRatio();
    this._cullT = 0; // re-cull chunks on the next frame
    if (this.app.vegetation) this.app.vegetation._forceRebuild = true;
    if (this.app.places) this.app.places.lastX = Infinity; // re-pick rooftop / roadside detail
    this._syncMenu();
  }

  // Frame-time governor (Auto only). Thresholds: slow > 22 ms (~45 fps) for 2.5 s, fast < 15 ms for 8 s.
  _govern(dtMs) {
    if (QUALITY.mode !== 'auto' || dtMs > 250 || document.hidden) return;
    this._ema += (dtMs - this._ema) * 0.05;
    const dt = dtMs / 1000;
    if (this._ema > 22) { this._slowT += dt; this._fastT = 0; }
    else if (this._ema < 15) { this._fastT += dt; this._slowT = 0; }
    else { this._slowT = Math.max(0, this._slowT - dt); this._fastT = Math.max(0, this._fastT - dt); }
    const canDropTier = QUALITY.baseTier !== 'high'; // a desktop on High only trades resolution
    if (this._slowT > 2.5) {
      this._slowT = 0;
      const floor = QUALITY.dprMin / Math.min(window.devicePixelRatio || 1, QUALITY.dprCap);
      if (this.resScale > floor + 0.01) {
        this.resScale = Math.max(floor, this.resScale - 0.1);
        this.applyPixelRatio();
      } else if (canDropTier && ORDER.indexOf(QUALITY.tier) > 0) {
        this._setTier(ORDER[ORDER.indexOf(QUALITY.tier) - 1]);
      }
    } else if (this._fastT > 8) {
      this._fastT = 0;
      if (QUALITY.tier !== QUALITY.baseTier && ORDER.indexOf(QUALITY.tier) < ORDER.indexOf(QUALITY.baseTier)) {
        this._setTier(ORDER[ORDER.indexOf(QUALITY.tier) + 1]);
      } else if (this.resScale < 1) {
        this.resScale = Math.min(1, this.resScale + 0.1);
        this.applyPixelRatio();
      }
    }
  }

  // Chunk detail by distance from the chunk's nearest edge (altitude widens it: from the air, far roads show).
  _cullChunks() {
    const app = this.app;
    const cam = app.camera.position;
    const alt = Math.max(0, cam.y - (app.pos ? app.pos.y : 0));
    const slack = alt * 1.3;
    const lv = app.layerVisibility || {};
    const S = QUALITY;
    for (const g of app.loadedChunks.values()) {
      const ud = g.userData;
      const sg = ud && ud.subGroups;
      if (!sg) continue;
      const ex = Math.max(0, Math.abs(cam.x - ud.ox) - 500), ez = Math.max(0, Math.abs(cam.z - ud.oz) - 500);
      const d = Math.hypot(ex, ez) - slack;
      const show = (k, lim) => { if (sg[k]) sg[k].visible = (lv[k] !== false) && d <= lim; };
      show('markings', S.markingsM);
      show('roads', S.roadsM);
      show('buildings', S.buildingsM);
      show('bridges', S.roadsM);
      show('facilities', S.buildingsM);
      if (sg.terrain) {
        const lc = d <= S.landcoverM;
        for (const m of sg.terrain.children) if (m.material && m.material.name === 'landcoverMat') m.visible = lc;
      }
    }
  }

  // Horizon roads / parks (thin far-away overlays on the horizon terrain): Low lets the haze have them.
  _cullHorizon() {
    const app = this.app, hr = app.horizonRoot, mats = app.mats;
    if (!hr || !mats || (QUALITY.horizonDetail && this._hzShown)) return; // only ever touch them on Low / after Low
    this._hzShown = QUALITY.horizonDetail;
    for (const m of hr.children) {
      if (m.material && (m.material === mats.roadMat || m.material === mats.parkMat)) m.visible = QUALITY.horizonDetail;
    }
  }

  /** Once per frame, after the world systems have updated and before rendering. */
  update(rawDtS) {
    const app = this.app;
    const now = performance.now();
    this._govern(this._lastT ? now - this._lastT : 16.7); // real frame interval (the app clamps its dt)
    this._lastT = now;
    this._cullT -= rawDtS;
    if (this._cullT <= 0 && app.loadedChunks) {
      this._cullT = 0.4;
      this._cullChunks();
      this._cullHorizon();
    }
    const fog = app.scene && app.scene.fog;
    if (fog && fog.density < QUALITY.fogMin) fog.density = QUALITY.fogMin; // haze hides the shorter draw distance
    const sun = app.sunLight;
    if (sun && this._shadowSize !== QUALITY.shadowMap) {
      this._shadowSize = QUALITY.shadowMap;
      sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    const tr = app.traffic;
    if (tr && tr.carMeshes && this._carShadows !== QUALITY.carShadows) {
      this._carShadows = QUALITY.carShadows;
      for (const cm of tr.carMeshes) cm.mesh.castShadow = QUALITY.carShadows;
    }
  }

  // "Graphics: Auto / High / Med / Low" row in the mode/vehicle menu (no new header button).
  _bindMenu() {
    const row = document.getElementById('graphics-row');
    if (!row) return;
    for (const btn of row.querySelectorAll('[data-quality]')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.blur();
        this.setMode(btn.dataset.quality);
      });
    }
    this._syncMenu();
  }

  syncMenu() { this._syncMenu(); }

  _syncMenu() {
    const row = document.getElementById('graphics-row');
    if (!row) return;
    const zh = getLang() === 'zh';
    const L = zh ? LABELS.zh : LABELS.en;
    const title = document.getElementById('menu-sec-graphics');
    if (title) title.firstChild.textContent = L.title;
    const hint = document.getElementById('graphics-tier-now');
    if (hint) hint.textContent = QUALITY.mode === 'auto' ? `· ${L[QUALITY.tier]}` : '';
    for (const btn of row.querySelectorAll('[data-quality]')) {
      btn.textContent = L[btn.dataset.quality];
      btn.classList.toggle('active', btn.dataset.quality === QUALITY.mode);
    }
  }
}
