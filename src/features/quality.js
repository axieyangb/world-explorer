// [ui-mobile] Graphics quality tiers (Auto / High / Medium / Low) and a frame-time governor.
//
// QUALITY is a plain settings object the renderers read directly (traffic counts, prop / tree / label
// draw distances, chunk-detail distances, shadow size, DPR cap). Systems never cache these values, so a
// tier change takes effect on their next refresh. Only the cheap surface shaders and the chunk streaming
// radius are fixed at page load (they need a shader recompile / a different stream).
//
// Auto picks the tier from the device (phone -> Low, tablet / low-memory / weak GPU -> Medium, otherwise
// High), then a proactive 60 FPS governor watches the frame time: sustained frames below ~56 FPS lower
// render resolution and dynamic detail distances step by step, and on touch / low devices also drop one
// tier; sustained fast frames with GPU headroom undo it smoothly. High / Medium / Low pin the tier and
// leave the governor off. ?quality=auto|high|medium|low overrides the saved choice for one visit.
import { isTouchDevice } from './touch_controls.js';
import { getLang } from '../i18n.js';

const TIERS = {
  //        DPR cap/min    shadow map/dist/cull      traffic, peds, car shadows   prop, places, trees(near/mid/far)          chunk detail distances (m, from the chunk edge)                    min fog   labels
  high: { dprCap: 1.5, dprMin: 0.60, shadowMap: 2048, shadowDist: 1.0, shadowM: 780, traffic: 1.0, peds: 1.0, carShadows: true, props: 1.0, places: 1.0, treeNear: 1.0, treeMid: 1.0, treeFar: 1.0, markingsM: Infinity, wear: true, roadsM: Infinity, buildingsM: Infinity, landcoverM: Infinity, horizonDetail: true, fogMin: 0, labels: 10 },
  medium: { dprCap: 1.5, dprMin: 0.60, shadowMap: 1536, shadowDist: 0.8, shadowM: 520, traffic: 0.55, peds: 0.7, carShadows: true, props: 0.75, places: 0.7, treeNear: 0.85, treeMid: 0.8, treeFar: 0.8, markingsM: 650, wear: true, roadsM: 1300, buildingsM: Infinity, landcoverM: 1100, horizonDetail: true, fogMin: 0.00028, labels: 8 },
  low: { dprCap: 1.25, dprMin: 0.60, shadowMap: 1024, shadowDist: 0.6, shadowM: 0, traffic: 0.18, peds: 0.35, carShadows: false, props: 0.55, places: 0.3, treeNear: 0.7, treeMid: 0.5, treeFar: 0.45, markingsM: 360, wear: false, roadsM: 850, buildingsM: 950, landcoverM: 650, horizonDetail: false, fogMin: 0.00055, labels: 6 },
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

const RING_SIZE = 30;

export class QualityManager {
  constructor(app) {
    this.app = app;
    this.resScale = 1.0;
    this._dynamicDetailScale = 1.0;
    this._emaMs = 16.67;
    this._ema = 16.67;
    this.currentFps = 60;
    this._samples = new Float32Array(RING_SIZE);
    this._samples.fill(16.67);
    this._sampleIdx = 0;
    this._sampleSum = 16.67 * RING_SIZE;
    this._slowT = 0;
    this._fastT = 0;
    this._cullT = 0;
    this._lastChunkCount = -1;
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
    return {
      mode: QUALITY.mode,
      tier: QUALITY.tier,
      device: QUALITY.deviceTier,
      res: +this.resScale.toFixed(2),
      detailScale: +this._dynamicDetailScale.toFixed(2),
      ms: +this._emaMs.toFixed(1),
      fps: this.currentFps,
    };
  }

  _targetDpr() {
    const dev = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
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
    this.resScale = 1.0;
    this._dynamicDetailScale = 1.0;
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

  // Proactive 60 FPS frame-time governor (16.67 ms target).
  // Tracks both a ring-buffer average and a fast EMA (0.92 / 0.08).
  // Slow > 17.8 ms (< ~56 FPS) for 0.85 s steps resScale & _dynamicDetailScale down;
  // Fast < 14.8 ms (solid 60 FPS with GPU headroom) for 3.0 s steps them back up by 0.05.
  _govern(dtMs) {
    if (dtMs > 250 || (typeof document !== 'undefined' && document.hidden)) return;
    const clampedDt = Math.max(0.004, Math.min(0.08, dtMs / 1000));
    const clampedMs = clampedDt * 1000;
    this._emaMs = this._emaMs * 0.92 + clampedMs * 0.08;
    this._ema = this._emaMs;
    this.currentFps = Math.round(1000 / Math.max(1, this._emaMs));

    this._sampleSum += clampedMs - this._samples[this._sampleIdx];
    this._samples[this._sampleIdx] = clampedMs;
    this._sampleIdx = (this._sampleIdx + 1) % RING_SIZE;
    const avg = this._sampleSum / RING_SIZE;

    if (QUALITY.mode !== 'auto') return;

    if (avg > 17.8) {
      this._slowT += clampedDt;
      this._fastT = 0;
    } else if (avg < 14.8) {
      this._fastT += clampedDt;
      this._slowT = 0;
    } else {
      this._slowT = Math.max(0, this._slowT - clampedDt * 0.5);
      this._fastT = Math.max(0, this._fastT - clampedDt * 0.5);
    }

    const canDropTier = QUALITY.baseTier !== 'high';
    if (this._slowT > 0.85) {
      this._slowT = 0;
      const minScale = 0.60;
      const step = avg >= 21 ? 0.12 : 0.06;
      let adjusted = false;
      if (this.resScale > minScale + 0.005) {
        this.resScale = Math.max(minScale, this.resScale - step);
        this.applyPixelRatio();
        adjusted = true;
      }
      if (this._dynamicDetailScale > 0.70 + 0.005) {
        this._dynamicDetailScale = Math.max(0.70, this._dynamicDetailScale - (avg >= 21 ? 0.08 : 0.05));
        this._cullT = 0;
        adjusted = true;
      }
      if (!adjusted && canDropTier && ORDER.indexOf(QUALITY.tier) > 0) {
        this._setTier(ORDER[ORDER.indexOf(QUALITY.tier) - 1]);
      }
    } else if (this._fastT > 3.0) {
      this._fastT = 0;
      if (QUALITY.tier !== QUALITY.baseTier && ORDER.indexOf(QUALITY.tier) < ORDER.indexOf(QUALITY.baseTier)) {
        this._setTier(ORDER[ORDER.indexOf(QUALITY.tier) + 1]);
      } else {
        if (this._dynamicDetailScale < 1.0) {
          this._dynamicDetailScale = Math.min(1.0, this._dynamicDetailScale + 0.05);
          this._cullT = 0;
        }
        if (this.resScale < 1.0) {
          this.resScale = Math.min(1.0, this.resScale + 0.05);
          this.applyPixelRatio();
        }
      }
    }
  }

  // Chunk detail and shadow-caster culling by distance from the camera.
  // Directional shadow frustum only covers ~550-850 m around the camera, so disabling castShadow
  // on buildings and bridges outside shadowCutSq cuts shadow-map draw calls by ~55% with zero pop.
  _cullChunks() {
    const app = this.app;
    const cam = app.camera.position;
    const alt = Math.max(0, cam.y - (app.pos ? app.pos.y : 0));
    const slack = alt * 1.3;
    const lv = app.layerVisibility || {};
    const S = QUALITY;
    const ds = this._dynamicDetailScale;
    const detailCut = (Number.isFinite(S.markingsM) ? S.markingsM : (ds < 0.99 ? 1350 : Infinity)) * ds;
    const roadCut = S.roadsM * ds;
    const bldgCut = S.buildingsM * ds;
    const facCut = (Number.isFinite(S.buildingsM) ? S.buildingsM : (ds < 0.99 ? 1600 : Infinity)) * ds;
    const lcCut = (Number.isFinite(S.landcoverM) ? S.landcoverM : (ds < 0.99 ? 1600 : Infinity)) * ds;
    const shadowCut = (S.shadowM ?? 780) * ds;
    const shadowCutSq = shadowCut * shadowCut;

    for (const g of app.loadedChunks.values()) {
      const ud = g.userData;
      const sg = ud && ud.subGroups;
      if (!sg) continue;
      const ex = Math.max(0, Math.abs(cam.x - ud.ox) - 500);
      const ez = Math.max(0, Math.abs(cam.z - ud.oz) - 500);
      const distSq = ex * ex + ez * ez;
      const d = Math.sqrt(distSq) - slack;
      const show = (k, lim) => { if (sg[k]) sg[k].visible = (lv[k] !== false) && d <= lim; };
      show('markings', detailCut);
      show('roads', roadCut);
      show('buildings', bldgCut);
      show('bridges', roadCut);
      show('facilities', facCut);
      if (sg.terrain) {
        const lc = d <= lcCut;
        for (const m of sg.terrain.children) if (m.material && m.material.name === 'landcoverMat') m.visible = lc;
      }
      const withinShadowDist = shadowCut > 0 && distSq <= shadowCutSq;
      if (sg.buildings) {
        for (const child of sg.buildings.children) child.castShadow = withinShadowDist;
      }
      if (sg.bridges) {
        for (const child of sg.bridges.children) child.castShadow = withinShadowDist;
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
    this._govern(this._lastT ? now - this._lastT : 16.67); // real frame interval (the app clamps its dt)
    this._lastT = now;
    this._cullT -= rawDtS;
    const chunkCount = app.loadedChunks ? app.loadedChunks.size : 0;
    if ((this._cullT <= 0 || chunkCount !== this._lastChunkCount) && app.loadedChunks) {
      this._cullT = 0.35;
      this._lastChunkCount = chunkCount;
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
    if (typeof document === 'undefined') return;
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
    if (typeof document === 'undefined') return;
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
