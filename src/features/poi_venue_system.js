// [venues-poi] Main-thread side of the everyday venues built by poi_venues.js (worker):
//   - distance-LOD InstancedMesh pools for the repeated detailed props (near model, optional cheap far model),
//     parked cars drawn with the traffic car geometry (shared GPU buffers, own instance attributes),
//   - sign texts (fuel canopies, price pylons, shop fascias, supermarket towers ...) from one canvas atlas, lit at night,
//   - gameplay: a nitro tank that drains while boosting and refills when you stop under a fuel canopy, car washes that
//     spin their brushes and polish the car (full gloss, grime gone, damage repaired), and fuel pumps that explode
//     (shots, splash, kaiju, hard rams) with chain reactions through the shared KaijuFx pools.
// Hooked from main.js: construct once, `update(dt)` per frame; the drive loop asks `nitroEmpty` before boosting.
import * as THREE from '../../vendor/three.module.js';
import { getLang } from '../i18n.js';
import { getPoiVenueModel } from './poi_venue_models.js';
import { createCarMaterial, CAR_TYPES, attachCarGlass } from './traffic_models.js'; // [drivers] +glass
import { showVehicleToast } from './vehicles.js';
import { getWeaponSfx } from './weapon_sfx.js';

const STRIDE = 8;
// instance kind -> [near model, near distance, far model, far distance, initial capacity, casts shadow]
const KINDS = {
  pump: ['pump', 150, 'pumpFar', 520, 96, true],
  bollard: ['bollard', 70, null, 0, 160, false],
  islandBin: ['islandBin', 70, null, 0, 96, false],
  iceChest: ['iceChest', 110, null, 0, 64, true],
  airPump: ['airPump', 90, null, 0, 32, true],
  vacuum: ['vacuum', 120, null, 0, 48, true],
  payKiosk: ['payKiosk', 110, null, 0, 32, true],
  brushV: ['brushV', 150, null, 0, 32, true],
  brushH: ['brushH', 150, null, 0, 16, true],
  atm: ['atm', 80, null, 0, 64, false],
  newsRack: ['newsRack', 60, null, 0, 64, false],
  shopBin: ['shopBin', 60, null, 0, 48, false],
  cart: ['cart', 85, null, 0, 160, false],
  lotLamp: ['lotLamp', 200, 'lotLampFar', 650, 96, true],
  cartReturn: ['cartReturn', 150, null, 0, 32, true],
  menuBoard: ['menuBoard', 170, null, 0, 24, true],
  greenCross: ['greenCross', 260, null, 0, 48, false],
  trailer: ['trailer', 280, 'trailerFar', 750, 16, true],
};
const CAR_NEAR = 110, CAR_FAR = 520, CAR_NEAR_MAX = 40;
const SIGN_MAX = 64, SIGN_RANGE = 260;
const CELL_W = 512, CELL_H = 128, COLS = 4, ROWS = SIGN_MAX / COLS;
const NITRO_DRAIN = 1 / 11, NITRO_REGEN = 1 / 120, NITRO_FILL = 0.55;
const PUMP_HP = 3, PUMP_R = 0.8;

const TXT = {
  en: {
    stop: 'Stop under the canopy to refill nitro', refill: 'Nitro refilled', empty: 'Nitro empty', emptySub: 'refill at a gas station',
    wash: 'Car wash', clean: 'Squeaky clean!', cleanSub: 'paint polished · damage repaired', boom: 'Gas pump explosion!', n2o: 'N2O',
  },
  zh: {
    stop: '在加油棚下停车即可补充氮气', refill: '氮气已加满', empty: '氮气耗尽', emptySub: '去加油站补充',
    wash: '洗车中', clean: '洗得锃亮！', cleanSub: '车漆抛光 · 损伤已修复', boom: '加油机爆炸！', n2o: '氮气',
  },
};
const tr = (k) => (TXT[getLang() === 'zh' ? 'zh' : 'en'][k] || TXT.en[k]);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3();

function patchVenueMaterial(mat, U) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPvNight = U.uPvNight;
    shader.uniforms.uPvTime = U.uPvTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 pvm;\nattribute vec3 iTint;\nvarying vec4 vPvm;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = mix(color.rgb, color.rgb * iTint, pvm.w);\n  vPvm = pvm;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPvNight;\nuniform float uPvTime;\nvarying vec4 vPvm;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPvm.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPvm.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float g = vPvm.z;
    float e = g <= 1.0 ? g * (0.45 + 1.2 * uPvNight) : g <= 2.0 ? (g - 1.0) * (0.06 + 2.2 * uPvNight)
      : (g - 2.0) * (0.25 + 2.0 * uPvNight) * (0.35 + 0.65 * step(0.0, sin(uPvTime * 3.3)));
    totalEmissiveRadiance += diffuseColor.rgb * e;
  }`);
  };
  mat.customProgramCacheKey = () => 'poi-venue-props-v1';
}

export class PoiVenueSystem {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.root = new THREE.Group();
    this.root.name = 'poi_venues';
    this.scene.add(this.root);
    this.U = { uPvNight: { value: 0 }, uPvTime: { value: 0 } };
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    patchVenueMaterial(this.mat, this.U);
    // model name -> { mesh, cap, src: [] }; created on first use so a city without venues pays nothing
    this.pools = {};
    this.poolCfg = { carFar: [128, false] };
    for (const [, [nearM, , farM, , cap, shadow]] of Object.entries(KINDS)) {
      this.poolCfg[nearM] = [cap, shadow];
      if (farM) this.poolCfg[farM] = [cap, false];
    }
    this.carPools = null; // lazily from the traffic geometry
    this._initSigns();
    this._initHud();
    this.tracked = new Set();
    this.lastX = Infinity; this.lastZ = Infinity;
    this.signTimer = 0;
    this.rebuildTimer = 0;
    this.lang = getLang();
    // gameplay state
    this.nitro = 1;
    this.nitroEmpty = false;
    this.pumpHp = new Map(); // key -> hp
    this.exploded = new Set(); // pump keys
    this.pendingBooms = [];
    this.fires = [];
    this.inFuel = null; this.fuelHinted = false; this.refillToast = false;
    this.inWash = null; this.washT = 0; this.washSpin = 0; this.washFx = 0;
    this.grime = 0; this.distAcc = 0;
    this.paintBase = new WeakMap();
    this.shine = 0;
    this.lastSpeed = 0;
    this.stats = { booms: 0, refills: 0, washes: 0 };
    this._patchedTraffic = null;
    if (typeof window !== 'undefined') window.__poiVenues = this;
  }

  _makePool(model, cap, shadow) {
    const geo = getPoiVenueModel(model).clone();
    const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    tint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iTint', tint);
    const mesh = new THREE.InstancedMesh(geo, this.mat, cap);
    mesh.name = `poi_${model}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return { mesh, cap, tint, model, shadow, src: [] };
  }
  _pool(model) {
    let p = this.pools[model];
    if (!p) { const [cap, sh] = this.poolCfg[model]; p = this.pools[model] = this._makePool(model, cap, sh); }
    return p;
  }
  _grow(pool, need) {
    let cap = pool.cap;
    while (cap < need) cap *= 2;
    this.root.remove(pool.mesh);
    pool.mesh.dispose();
    pool.mesh.geometry.dispose();
    const np = pool.isCar ? this._makeCarPool(pool.typeIdx, cap) : this._makePool(pool.model, cap, pool.shadow);
    const src = pool.src;
    Object.assign(pool, np);
    pool.src = src;
  }

  _ensureCarPools() {
    if (this.carPools) return this.carPools;
    const T = this.app.traffic;
    if (!T || !T.carMeshes) return null;
    this.carUniforms = { uLights: { value: 0 } };
    this.carMat = createCarMaterial(this.carUniforms, { parked: true }); // [drivers] empty cabins
    this.carPools = CAR_TYPES.map((t, i) => (T.carMeshes[i] ? this._makeCarPool(i, 48) : null));
    return this.carPools;
  }
  _makeCarPool(typeIdx, cap) {
    const src = this.app.traffic.carMeshes[typeIdx].mesh.geometry;
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'color', 'aPaint', 'aEmit', 'aKind', 'aSeat']) if (src.attributes[k]) geo.setAttribute(k, src.attributes[k]); // [drivers] +kind/seat
    if (src.index) geo.setIndex(src.index);
    geo.boundingSphere = src.boundingSphere;
    const iPaint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const iBrake = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    iPaint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPaint', iPaint);
    geo.setAttribute('iBrake', iBrake);
    const mesh = new THREE.InstancedMesh(geo, this.carMat, cap);
    mesh.name = `poi_car_${typeIdx}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    attachCarGlass(mesh, this.app.traffic.carMeshes[typeIdx].glassGeo, iBrake, this.carUniforms); // [drivers]
    return { mesh, cap, iPaint, isCar: true, typeIdx, src: [] };
  }

  // ------------------------------------------------------------------ signs
  _initSigns() {
    const c = document.createElement('canvas');
    c.width = CELL_W * COLS;
    c.height = CELL_H * ROWS;
    this.signCtx = c.getContext('2d');
    this.signTex = new THREE.CanvasTexture(c);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.signTex.anisotropy = 4;
    this.signMat = new THREE.MeshStandardMaterial({ map: this.signTex, emissiveMap: this.signTex, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.45, metalness: 0 });
    this.signMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uvRect.zw + uvRect.xy;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = uv * uvRect.zw + uvRect.xy;\n#endif');
    };
    this.signMat.customProgramCacheKey = () => 'poi-signs-v1';
    const geo = new THREE.PlaneGeometry(1, 1);
    this.signRect = new THREE.InstancedBufferAttribute(new Float32Array(SIGN_MAX * 4), 4);
    this.signRect.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('uvRect', this.signRect);
    this.signMesh = new THREE.InstancedMesh(geo, this.signMat, SIGN_MAX);
    this.signMesh.name = 'poi_signs';
    this.signMesh.count = 0;
    this.signMesh.frustumCulled = false;
    this.root.add(this.signMesh);
    this.cellOf = new Map();
    this.cellKey = new Array(SIGN_MAX).fill(null);
  }
  _drawCell(cell, s, text, aspect) {
    const ctx = this.signCtx;
    const x0 = (cell % COLS) * CELL_W, y0 = Math.floor(cell / COLS) * CELL_H;
    const hex = (v) => '#' + (v >>> 0).toString(16).padStart(6, '0');
    const style = s[6] | 0, bg = hex(s[9] ?? 0x202020), fg = hex(s[10] ?? 0xffffff);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, CELL_W, CELL_H);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, CELL_W, CELL_H);
    const cellAspect = CELL_W / CELL_H;
    const kx = cellAspect / Math.max(0.5, Math.min(16, aspect));
    const fam = style === 4 ? '"Times New Roman", Georgia, "Noto Serif CJK SC", serif' : '"Helvetica Neue", Arial, "PingFang SC", "Noto Sans CJK SC", sans-serif';
    const weight = style === 4 ? '600' : style === 2 ? 'italic 800' : '800';
    const avail = (CELL_W * 0.9) / kx;
    let size = style === 6 ? 110 : 92;
    ctx.font = `${weight} ${size}px ${fam}`;
    const tw = ctx.measureText(text).width;
    if (tw > avail) size = Math.max(18, Math.floor(size * (avail / tw)));
    ctx.font = `${weight} ${size}px ${fam}`;
    ctx.translate(x0 + CELL_W / 2, y0 + CELL_H / 2 + size * 0.04);
    ctx.scale(kx, 1);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0, avail);
    ctx.restore();
  }
  _updateSigns(cam) {
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const zh = getLang() === 'zh';
    const near = [];
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv || !pv.signs || !pv.signs.length) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(cx - ox) > 500 + SIGN_RANGE || Math.abs(cz - oz) > 500 + SIGN_RANGE) continue;
      for (const s of pv.signs) {
        const d = Math.hypot(s[0] - cx, s[1] - cy, s[2] - cz);
        if (d > SIGN_RANGE + s[4] * 6) continue;
        const text = String((zh ? s[7] || s[8] : s[8] || s[7]) || '').trim();
        if (!text) continue;
        near.push([d - s[4] * 6, s, text]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    if (near.length > SIGN_MAX) near.length = SIGN_MAX;
    const want = near.map(([, s, text]) => `${text}|${s[6]}|${s[9]}|${s[10]}|${Math.round((s[4] / s[5]) * 2) / 2}`);
    const keep = new Set(want);
    for (let i = 0; i < SIGN_MAX; i++) {
      const k = this.cellKey[i];
      if (k && !keep.has(k)) { this.cellOf.delete(k); this.cellKey[i] = null; }
    }
    let drew = false, n = 0;
    const mArr = this.signMesh.instanceMatrix.array, rArr = this.signRect.array;
    for (let i = 0; i < near.length; i++) {
      const [, s, text] = near[i];
      const key = want[i];
      let cell = this.cellOf.get(key);
      if (cell === undefined) {
        cell = this.cellKey.indexOf(null);
        if (cell < 0) continue;
        this.cellKey[cell] = key;
        this.cellOf.set(key, cell);
        this._drawCell(cell, s, text, s[4] / s[5]);
        drew = true;
      }
      const w = s[4], h = s[5], c = Math.cos(s[3]), sn = Math.sin(s[3]);
      const o = n * 16;
      mArr[o] = c * w; mArr[o + 1] = 0; mArr[o + 2] = -sn * w; mArr[o + 3] = 0;
      mArr[o + 4] = 0; mArr[o + 5] = h; mArr[o + 6] = 0; mArr[o + 7] = 0;
      mArr[o + 8] = sn; mArr[o + 9] = 0; mArr[o + 10] = c; mArr[o + 11] = 0;
      mArr[o + 12] = s[0]; mArr[o + 13] = s[1]; mArr[o + 14] = s[2]; mArr[o + 15] = 1;
      rArr[n * 4] = (cell % COLS) / COLS;
      rArr[n * 4 + 1] = 1 - (Math.floor(cell / COLS) + 1) / ROWS;
      rArr[n * 4 + 2] = 1 / COLS;
      rArr[n * 4 + 3] = 1 / ROWS;
      n++;
    }
    this.signMesh.count = n;
    this.signMesh.instanceMatrix.needsUpdate = true;
    this.signRect.needsUpdate = true;
    if (drew) this.signTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ HUD (nitro gauge under the speed bar)
  _initHud() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('hud-speedometer');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = 'poi-nitro-gauge';
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:5px;font:700 9px/1 system-ui,-apple-system,sans-serif;letter-spacing:0.08em;color:rgba(255,255,255,0.72);';
    const label = document.createElement('span');
    label.style.cssText = 'min-width:24px;text-align:right;';
    const track = document.createElement('div');
    track.style.cssText = 'width:138px;height:4px;border-radius:999px;background:rgba(255,255,255,0.14);overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,#7048e8 0%,#4dabf7 60%,#99e9f2 100%);transition:width 0.1s linear;';
    track.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(track);
    host.appendChild(wrap);
    this.hud = { wrap, label, fill, shown: null, pct: -1, lang: '' };
  }
  _updateHud() {
    const H = this.hud;
    if (!H) return;
    const show = this.app.mode === 'drive';
    if (show !== H.shown) { H.wrap.style.display = show ? 'flex' : 'none'; H.shown = show; }
    if (!show) return;
    const pct = Math.round(this.nitro * 100);
    if (pct !== H.pct) {
      H.fill.style.width = `${pct}%`;
      H.fill.style.background = this.nitroEmpty ? 'rgba(255,90,70,0.85)' : 'linear-gradient(90deg,#7048e8 0%,#4dabf7 60%,#99e9f2 100%)';
      H.pct = pct;
    }
    const lang = getLang();
    if (lang !== H.lang) { H.label.textContent = tr('n2o'); H.lang = lang; }
  }

  // ------------------------------------------------------------------ instance pools
  _rebuild(px, pz) {
    for (const p of Object.values(this.pools)) p.src.length = 0;
    const cars = this._ensureCarPools();
    if (cars) for (const p of cars) if (p) p.src.length = 0;
    const maxFar = 750;
    const nearCars = [];
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv || !pv.inst) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(px - ox) > 500 + maxFar || Math.abs(pz - oz) > 500 + maxFar) continue;
      for (const [kind, a] of Object.entries(pv.inst)) {
        if (kind === 'car') {
          for (let i = 0; i < a.length; i += STRIDE) {
            const d2 = (a[i] - px) ** 2 + (a[i + 2] - pz) ** 2;
            if (d2 < CAR_NEAR * CAR_NEAR && cars && cars[a[i + 4] | 0]) nearCars.push([d2, a, i]);
            else if (d2 < CAR_FAR * CAR_FAR) this._pool('carFar').src.push(a, i);
          }
          continue;
        }
        const cfg = KINDS[kind];
        if (!cfg) continue;
        const [nearM, nd, farM, fd] = cfg;
        const nd2 = nd * nd, fd2 = fd * fd;
        const isPump = kind === 'pump';
        for (let i = 0; i < a.length; i += STRIDE) {
          if (isPump && this.exploded.has(this._key(a[i], a[i + 2]))) continue;
          if (kind === 'islandBin' && this.exploded.size && this._nearBoom(a[i], a[i + 2], 2.5)) continue;
          const d2 = (a[i] - px) ** 2 + (a[i + 2] - pz) ** 2;
          if (d2 < nd2) this._pool(nearM).src.push(a, i);
          else if (farM && d2 < fd2) this._pool(farM).src.push(a, i);
        }
      }
    }
    // full traffic-model cars only for the nearest few (a multi-storey car park holds hundreds); the rest are boxes
    nearCars.sort((u, v) => u[0] - v[0]);
    for (let k = 0; k < nearCars.length; k++) {
      const [, a, i] = nearCars[k];
      if (k < CAR_NEAR_MAX) cars[a[i + 4] | 0].src.push(a, i);
      else this._pool('carFar').src.push(a, i);
    }
    for (const p of Object.values(this.pools)) this._writePool(p);
    if (cars) for (const p of cars) if (p) this._writePool(p);
  }
  _writePool(p) {
    const n = p.src.length / 2;
    if (n > p.cap) this._grow(p, n);
    const mArr = p.mesh.instanceMatrix.array;
    const tArr = p.isCar ? p.iPaint.array : p.tint.array;
    const isCarFar = p.model === 'carFar';
    for (let k = 0; k < n; k++) {
      const a = p.src[k * 2], i = p.src[k * 2 + 1];
      const rot = a[i + 3], c = Math.cos(rot), s = Math.sin(rot);
      const sx = p.isCar || isCarFar ? 1 : a[i + 4], sy = p.isCar || isCarFar ? 1 : a[i + 5], sz = p.isCar || isCarFar ? 1 : a[i + 6];
      const o = k * 16;
      mArr[o] = c * sx; mArr[o + 1] = 0; mArr[o + 2] = -s * sx; mArr[o + 3] = 0;
      mArr[o + 4] = 0; mArr[o + 5] = sy; mArr[o + 6] = 0; mArr[o + 7] = 0;
      mArr[o + 8] = s * sz; mArr[o + 9] = 0; mArr[o + 10] = c * sz; mArr[o + 11] = 0;
      mArr[o + 12] = a[i]; mArr[o + 13] = a[i + 1]; mArr[o + 14] = a[i + 2]; mArr[o + 15] = 1;
      const rgb = a[i + 7] | 0;
      const r = ((rgb >> 16) & 255) / 255, g = ((rgb >> 8) & 255) / 255, b = (rgb & 255) / 255;
      if (p.isCar) { tArr[k * 4] = r * r; tArr[k * 4 + 1] = g * g; tArr[k * 4 + 2] = b * b; tArr[k * 4 + 3] = 1; }
      else { tArr[k * 3] = r * r; tArr[k * 3 + 1] = g * g; tArr[k * 3 + 2] = b * b; }
    }
    p.mesh.count = n;
    p.mesh.instanceMatrix.needsUpdate = true;
    (p.isCar ? p.iPaint : p.tint).needsUpdate = true;
  }
  _key(x, z) { return `${Math.round(x * 2)}|${Math.round(z * 2)}`; }
  _nearBoom(x, z, r) {
    for (const k of this.exploded) {
      const [a, b] = k.split('|');
      if (Math.hypot(a / 2 - x, b / 2 - z) < r) return true;
    }
    return false;
  }

  /** Debug / perf counters. */
  debugStats() {
    const out = { signs: this.signMesh.count, nitro: +this.nitro.toFixed(2), grime: +this.grime.toFixed(2), ...this.stats };
    let draws = 0, inst = 0;
    for (const [k, p] of Object.entries(this.pools)) { if (p.mesh.count) { out[k] = p.mesh.count; draws++; inst += p.mesh.count; } }
    if (this.carPools) for (const p of this.carPools) if (p && p.mesh.count) { out[`car${p.typeIdx}`] = p.mesh.count; draws++; inst += p.mesh.count; }
    out.draws = draws + (this.signMesh.count ? 1 : 0);
    out.instances = inst;
    return out;
  }
  /** All venue zones in the loaded chunks (test hook). */
  list() {
    const out = { fuel: [], wash: [], pumps: 0, signs: [] };
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv) continue;
      for (const f of pv.zones.fuel) out.fuel.push(f);
      for (const w of pv.zones.wash) out.wash.push(w);
      out.pumps += pv.zones.pumps.length;
      for (const s of pv.signs) out.signs.push([Math.round(s[0]), Math.round(s[2]), s[8]]);
    }
    return out;
  }

  // ------------------------------------------------------------------ gameplay
  _fx() {
    const D = this.app.vehicleDamage;
    return D && typeof D._fx === 'function' ? D._fx() : null;
  }
  _patchTraffic() {
    const T = this.app.traffic;
    if (!T || this._patchedTraffic === T || typeof T.triggerImpactSphere !== 'function') return;
    const orig = T.triggerImpactSphere;
    const self = this;
    T.triggerImpactSphere = function (x, y, z, radius, opts, ...rest) {
      try { self.onImpact(x, y, z, radius, opts); } catch (_) { /* venue hits are cosmetic */ }
      return orig.call(this, x, y, z, radius, opts, ...rest);
    };
    this._patchedTraffic = T;
  }
  /** Any impact sphere (weapons, explosions, kaiju, heli) damages fuel pumps inside it. */
  onImpact(x, y, z, radius, opts) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(radius > 0)) return;
    const r = radius + PUMP_R;
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv || !pv.zones.pumps.length) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(x - ox) > 520 + r || Math.abs(z - oz) > 520 + r) continue;
      for (const p of pv.zones.pumps) {
        const d = Math.hypot(p[0] - x, p[2] - z);
        if (d > r || (Number.isFinite(y) && Math.abs(p[1] + 1 - y) > Math.max(4, radius))) continue;
        const k = this._key(p[0], p[2]);
        if (this.exploded.has(k)) continue;
        const src = opts && typeof opts === 'object' ? opts.source : '';
        const dmg = src === 'pumpChain' ? 99 : Math.max(1, (opts && opts.damage) || (/missile|rocket|stomp|tail|breath|kaijuBody|carExplosion|explosion/.test(src || '') ? 3 : 1));
        const hp = (this.pumpHp.has(k) ? this.pumpHp.get(k) : PUMP_HP) - dmg;
        this.pumpHp.set(k, hp);
        const fx = this._fx();
        if (hp > 0) { if (fx) fx.spawn('spark', _v.set(p[0], p[1] + 1.2, p[2]), { count: 8, scale: 0.8 }); continue; }
        this._queueBoom(p, src === 'pumpChain' ? 0.25 + Math.random() * 0.5 : 0.05);
      }
    }
  }
  _queueBoom(p, delay) {
    const k = this._key(p[0], p[2]);
    if (this.exploded.has(k) || this.pendingBooms.some((b) => b.k === k)) return;
    this.pendingBooms.push({ k, p, t: delay });
  }
  _boom(b) {
    const [x, y, z] = b.p;
    this.exploded.add(b.k);
    this.stats.booms++;
    const fx = this._fx();
    if (fx) {
      fx.spawn('bigExplosion', _v.set(x, y + 1.3, z), { scale: 0.85 });
      fx.spawn('explosion', _v.set(x + 1.5, y + 3.2, z - 1), { scale: 0.9 });
      fx.spawn('dustRing', _v.set(x, y, z), { scale: 0.7 });
      fx.spawn('spark', _v.set(x, y + 1.5, z), { count: 30, scale: 1.4 });
      fx.spawn('debris', _v.set(x, y + 1.2, z), { count: 14, scale: 0.7 });
    }
    try { getWeaponSfx(this.app).play('explosion', { pos: _v.set(x, y, z), gain: 1.0 }); } catch (_) { /* audio optional */ }
    const D = this.app.vehicleDamage;
    if (D) {
      if (typeof D._scorchAt === 'function') D._scorchAt(x, y, z, 9);
      if (typeof D.applyExplosionSplash === 'function') D.applyExplosionSplash({ x, y, z }, 12, 6);
    }
    const cam = this.app.camera;
    if (cam && this.app.collision) {
      const d = Math.hypot(cam.position.x - x, cam.position.y - y, cam.position.z - z);
      if (d < 120) this.app.collision.shake = Math.min(1, Math.max(this.app.collision.shake || 0, (1 - d / 120) * 0.85));
    }
    this.fires.push({ x, y, z, t: 0, life: 14 + Math.random() * 6, acc: 0 });
    if (this.fires.length > 10) this.fires.shift();
    // chain reaction through the neighbouring pumps
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv) continue;
      for (const p of pv.zones.pumps) if (Math.hypot(p[0] - x, p[2] - z) < 9.5) this._queueBoom(p, 0.35 + Math.random() * 0.6);
    }
    if (Math.hypot(this.app.pos.x - x, this.app.pos.z - z) < 90 && this.stats.booms - (this._boomToast || 0) >= 1) {
      this._boomToast = this.stats.booms + 8;
      showVehicleToast(tr('boom'));
    }
    this.lastX = Infinity; // rebuild pools without the pump
  }
  _updateBooms(dt) {
    for (let i = this.pendingBooms.length - 1; i >= 0; i--) {
      const b = this.pendingBooms[i];
      b.t -= dt;
      if (b.t <= 0) { this.pendingBooms.splice(i, 1); this._boom(b); }
    }
    if (!this.fires.length) return;
    const fx = this._fx();
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t > f.life) { this.fires.splice(i, 1); continue; }
      f.acc += dt * (f.t < 3 ? 12 : 6);
      while (fx && f.acc >= 1) {
        f.acc -= 1;
        fx.spawn('fire', _v.set(f.x + (Math.random() - 0.5) * 1.6, f.y + 0.6, f.z + (Math.random() - 0.5) * 1.6), { scale: f.t < 4 ? 0.9 : 0.6 });
        if (Math.random() < 0.35) fx.spawn('smoke', _v.set(f.x, f.y + 3, f.z), { scale: 0.5, speed: 4, life: 7 });
      }
    }
  }

  _zoneAt(list, x, z, pad) {
    for (const zn of list) {
      const dx = x - zn[0], dz = z - zn[2];
      const u = dx * zn[3] + dz * zn[4], v = -dx * zn[4] + dz * zn[3];
      if (Math.abs(u) <= zn[5] + pad && Math.abs(v) <= zn[6] + pad) return zn;
    }
    return null;
  }
  _zones(kind, x, z, pad) {
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv || !pv.zones[kind].length) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(x - ox) > 560 || Math.abs(z - oz) > 560) continue;
      const zn = this._zoneAt(pv.zones[kind], x, z, pad);
      if (zn) return zn;
    }
    return null;
  }

  _updateNitro(dt, driving) {
    const app = this.app;
    if (!driving) return;
    if (app.nitroActive) this.nitro = Math.max(0, this.nitro - NITRO_DRAIN * dt);
    else this.nitro = Math.min(1, this.nitro + NITRO_REGEN * dt);
    if (!this.nitroEmpty && this.nitro <= 0.001) {
      this.nitroEmpty = true;
      showVehicleToast(tr('empty'), tr('emptySub'));
    } else if (this.nitroEmpty && this.nitro >= 0.2) this.nitroEmpty = false;
    // fuel canopy: stop underneath to refill
    const zn = this._zones('fuel', app.pos.x, app.pos.z, 0.6);
    if (zn !== this.inFuel) {
      this.inFuel = zn;
      this.refillToast = false;
      if (zn && this.nitro < 0.98) showVehicleToast('⛽ ' + tr('stop'));
    }
    if (zn && Math.abs(app.speed) < 1.5 && this.nitro < 1) {
      this.nitro = Math.min(1, this.nitro + NITRO_FILL * dt);
      if (this.nitro >= 0.2) this.nitroEmpty = false;
      if (this.nitro >= 1 && !this.refillToast) { this.refillToast = true; this.stats.refills++; showVehicleToast('⛽ ' + tr('refill'), '100%'); }
    }
  }

  _paintMats() {
    const mesh = this.app.vehicleMesh;
    const pm = mesh && mesh.userData && mesh.userData.paintMeshes;
    if (!pm) return [];
    const out = [];
    for (const m of pm) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (!this.paintBase.has(mat)) this.paintBase.set(mat, { r: mat.roughness ?? 0.3, cc: mat.clearcoat ?? 0, ccr: mat.clearcoatRoughness ?? 0.1, env: mat.envMapIntensity ?? 1 });
        out.push(mat);
      }
    }
    return out;
  }
  _applyPaint() {
    const g = this.grime, sh = this.shine;
    for (const mat of this._paintMats()) {
      const b = this.paintBase.get(mat);
      if (mat.roughness !== undefined) mat.roughness = Math.min(1, b.r + g * 0.42 - sh * 0.08);
      if (mat.clearcoat !== undefined) mat.clearcoat = Math.min(1, b.cc * (1 - g * 0.75) + sh * 0.35);
      if (mat.clearcoatRoughness !== undefined) mat.clearcoatRoughness = Math.max(0, b.ccr + g * 0.35 - sh * 0.05);
      if (mat.envMapIntensity !== undefined) mat.envMapIntensity = b.env * (1 - g * 0.5) + sh * 0.6;
    }
  }
  _updateWash(dt, driving) {
    const app = this.app;
    // grime builds up with distance driven and damage taken
    if (driving) {
      this.distAcc += Math.abs(app.speed) * dt;
      if (this.distAcc > 50) { this.grime = Math.min(1, this.grime + this.distAcc / 18000); this.distAcc = 0; }
      const P = app.vehicleDamage && app.vehicleDamage.player;
      if (P) {
        if (this._lastHp !== undefined && P.hp < this._lastHp) this.grime = Math.min(1, this.grime + (this._lastHp - P.hp) * 0.08);
        this._lastHp = P.hp;
      }
    }
    const zn = driving ? this._zones('wash', app.pos.x, app.pos.z, -0.3) : null;
    if (zn && !this.inWash) { this.washT = 0; showVehicleToast('🧽 ' + tr('wash')); }
    if (zn) {
      this.washT += dt;
      this.washSpin = Math.min(1, this.washSpin + dt * 2);
      const fx = this._fx();
      this.washFx += dt * 14;
      while (fx && this.washFx >= 1) {
        this.washFx -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        fx.spawn('smoke', _v.set(app.pos.x + (Math.random() - 0.5) * 3, app.pos.y + 1.0 + Math.random() * 1.5, app.pos.z + (Math.random() - 0.5) * 3), { scale: 0.18, speed: 0.6 * side, life: 1.4, light: true });
      }
      if (this.washT > 0.8) this.grime = Math.max(0, this.grime - dt * 0.9);
    } else {
      this.washSpin = Math.max(0, this.washSpin - dt * 0.6);
    }
    if (this.inWash && !zn && this.washT > 0.8) {
      this.grime = 0;
      this.shine = 1;
      this.stats.washes++;
      const P = app.vehicleDamage && app.vehicleDamage.player;
      if (P && !P.dead) { P.hp = Math.max(P.hp, 8); this._lastHp = P.hp; }
      showVehicleToast('✨ ' + tr('clean'), tr('cleanSub'));
      const fx = this._fx();
      if (fx) for (let i = 0; i < 4; i++) fx.spawn('spark', _v.set(app.pos.x, app.pos.y + 1.2, app.pos.z), { count: 6, scale: 0.4, speed: 6, life: 0.6, color: new THREE.Color(0.8, 0.9, 1.0) });
    }
    this.inWash = zn;
    this.shine = Math.max(0, this.shine - dt / 6);
    this._applyPaint();
    // spin the brushes of the bay we are in (and let them coast down afterwards)
    if (this.washSpin > 0.01) this._spinBrushes(dt, zn || this._lastWash);
    if (zn) this._lastWash = zn;
  }
  _spinBrushes(dt, zn) {
    if (!zn) return;
    this.spinA = (this.spinA || 0) + dt * this.washSpin * 9;
    for (const [name, axis] of [['brushV', 'y'], ['brushH', 'z']]) {
      const p = this.pools[name];
      if (!p) continue;
      const mArr = p.mesh.instanceMatrix.array;
      let touched = false;
      for (let k = 0; k < p.mesh.count; k++) {
        const a = p.src[k * 2], i = p.src[k * 2 + 1];
        if (Math.hypot(a[i] - zn[0], a[i + 2] - zn[2]) > zn[5] + 3) continue;
        _q.setFromAxisAngle(_up, a[i + 3]);
        if (axis === 'y') _q2.setFromAxisAngle(_up, this.spinA * (k % 2 ? 1 : -1));
        else _q2.setFromAxisAngle(_ax, this.spinA);
        _q.multiply(_q2);
        _m.compose(_p.set(a[i], a[i + 1], a[i + 2]), _q, _s.set(a[i + 4], a[i + 5], a[i + 6]));
        _m.toArray(mArr, k * 16);
        touched = true;
      }
      if (touched) p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // Pumps are solid; a hard hit sets them off
  _updateRam(dt, driving) {
    const app = this.app;
    const spd = Math.abs(app.speed);
    if (!driving) { this.lastSpeed = spd; return; }
    const fx = Math.sin(app.yaw), fz = Math.cos(app.yaw);
    for (const g of this.tracked) {
      const pv = g.userData && g.userData.poiVenues;
      if (!pv || !pv.zones.pumps.length) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(app.pos.x - ox) > 520 || Math.abs(app.pos.z - oz) > 520) continue;
      for (const p of pv.zones.pumps) {
        if (Math.abs(p[0] - app.pos.x) > 5 || Math.abs(p[2] - app.pos.z) > 5) continue;
        const k = this._key(p[0], p[2]);
        if (this.exploded.has(k)) continue;
        for (const off of [1.45, 0, -1.45]) {
          const cx = app.pos.x + fx * off, cz = app.pos.z + fz * off;
          const dx = cx - p[0], dz = cz - p[2], d = Math.hypot(dx, dz);
          const rr = 0.95 + PUMP_R;
          if (d >= rr) continue;
          if (Math.max(spd, this.lastSpeed) > 12) { this._queueBoom(p, 0.02); app.speed *= 0.55; break; }
          const push = (rr - d) / Math.max(d, 1e-3);
          app.pos.x += dx * push; app.pos.z += dz * push;
          app.speed *= 0.3;
          break;
        }
      }
    }
    this.lastSpeed = spd;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const app = this.app, cam = app.camera;
    if (!cam) return;
    this._patchTraffic();
    const nu = app.mats && app.mats.wfcBldgMat && app.mats.wfcBldgMat.userData.nightUniforms;
    const night = nu ? Math.max(0, Math.min(1, (nu.uNightEmissive.value - 0.1) / 1.6)) : 0;
    this.U.uPvNight.value = night;
    this.U.uPvTime.value += dt;
    this.signMat.emissiveIntensity = 0.12 + 1.05 * night;
    if (this.carUniforms) this.carUniforms.uLights.value = 0;
    const chunks = app.loadedChunks;
    let dirty = chunks.size !== this.tracked.size;
    if (!dirty) for (const g of chunks.values()) if (!this.tracked.has(g)) { dirty = true; break; }
    if (dirty) this.tracked = new Set(chunks.values());
    const px = cam.position.x, pz = cam.position.z;
    this.rebuildTimer -= dt;
    if (dirty || Math.hypot(px - this.lastX, pz - this.lastZ) > 10 || this.rebuildTimer <= 0) {
      this.lastX = px; this.lastZ = pz;
      this.rebuildTimer = 2;
      this._rebuild(px, pz);
      this.signTimer = 0;
    }
    this.signTimer -= dt;
    const lang = getLang();
    if (this.signTimer <= 0 || lang !== this.lang) {
      this.lang = lang;
      this.signTimer = 0.5;
      this._updateSigns(cam);
    }
    const driving = app.mode === 'drive' && !(app.vehicleDamage && app.vehicleDamage.player && app.vehicleDamage.player.dead);
    this._updateNitro(dt, driving);
    this._updateWash(dt, driving);
    this._updateRam(dt, driving);
    this._updateBooms(dt);
    this._updateHud();
  }
}
