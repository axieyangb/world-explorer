// places-info (main thread): renders the `pi_*` instance kinds that pi_worker.js adds to each chunk's
// places payload with distance-culled, capped InstancedMesh pools, plus storefront name signs (one
// instanced quad pool reading names from a small canvas atlas; only the nearest signs get text).
import * as THREE from '../../../vendor/three.module.js';
import { getLang } from '../../i18n.js';
import { buildPiGeometries } from './pi_models.js';

const STRIDE = 8;
// kind: [cap, cull radius m, castShadow]
const KINDS = {
  school: [40, 420, true],
  campus: [30, 600, true],
  museum: [24, 800, true],
  museumSign: [24, 360, false],
  mast: [48, 1600, true],
  policeSign: [30, 380, false],
  policeCar: [30, 380, true],
  fireDoor: [30, 450, false],
  fireTruck: [30, 450, true],
  busPole: [140, 260, false],
  shelter: [70, 320, true],
  subway: [60, 360, false],
  lotL: [40, 650, false],
  lotS: [40, 650, false],
  car: [420, 380, true],
};

const SIGN_MAX = 48;
const SIGN_RANGE = 75;
const CELL_W = 512, CELL_H = 64, COLS = 2, ROWS = SIGN_MAX / COLS;
const SIGN_STYLES = [
  ['#1d2a3a', '#f3e6c8'], ['#f2efe6', '#1f2226'], ['#2b2b2b', '#ffffff'], ['#5a1f22', '#f6e7cf'],
  ['#20402f', '#f1ead8'], ['#e9dcc2', '#3a2a1c'],
];

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class PlacesInfoSystem {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'places_info';
    scene.add(this.root);
    const geoms = buildPiGeometries();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.1 });
    this.pools = {};
    for (const [kind, [cap, , cast]] of Object.entries(KINDS)) {
      const m = new THREE.InstancedMesh(geoms[kind], this.mat, cap);
      m.name = `pi_${kind}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = cast;
      m.receiveShadow = true;
      this.root.add(m);
      this.pools[kind] = m;
    }
    this._initSigns();
    this.tracked = new Set();
    this.lastX = Infinity;
    this.claimedCars = new Set();
    this.wreckedCars = new Set();
    this.carHp = new Map();
    this.lastZ = Infinity;
    this.signTimer = 0;
    this.lang = getLang();
  }

  _initSigns() {
    const c = document.createElement('canvas');
    c.width = CELL_W * COLS;
    c.height = CELL_H * ROWS;
    this.signCanvas = c;
    this.signCtx = c.getContext('2d');
    this.signTex = new THREE.CanvasTexture(c);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.signTex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: this.signTex, roughness: 0.55, metalness: 0.0, emissive: 0x2a2620 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uvRect.zw + uvRect.xy;\n#endif');
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.signRect = new THREE.InstancedBufferAttribute(new Float32Array(SIGN_MAX * 4), 4);
    this.signRect.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('uvRect', this.signRect);
    this.signMesh = new THREE.InstancedMesh(geo, mat, SIGN_MAX);
    this.signMesh.name = 'pi_storefrontNames';
    this.signMesh.count = 0;
    this.signMesh.frustumCulled = false;
    this.root.add(this.signMesh);
    this.cellOf = new Map(); // key -> cell index
    this.cellKey = new Array(SIGN_MAX).fill(null);
  }

  /** Debug / perf counters. */
  stats() {
    const out = {};
    let draws = 0;
    for (const [k, m] of Object.entries(this.pools)) {
      out[k] = m.count;
      if (m.count) draws++;
    }
    out.signs = this.signMesh.count;
    out.drawCalls = draws + (this.signMesh.count ? 1 : 0);
    return out;
  }

  update(dt, camera, loadedChunks) {
    let dirty = loadedChunks.size !== this.tracked.size;
    if (!dirty) for (const g of loadedChunks.values()) if (!this.tracked.has(g)) { dirty = true; break; }
    if (dirty) this.tracked = new Set(loadedChunks.values());
    const px = camera.position.x, pz = camera.position.z;
    if (dirty || Math.hypot(px - this.lastX, pz - this.lastZ) > 30) {
      this.lastX = px;
      this.lastZ = pz;
      this._rebuild(px, pz);
      this.signTimer = 0;
    }
    this.signTimer -= dt;
    const lang = getLang();
    if (this.signTimer <= 0 || lang !== this.lang) {
      if (lang !== this.lang) { this.lang = lang; this.cellOf.clear(); this.cellKey.fill(null); }
      this.signTimer = 0.6;
      this._updateSigns(camera);
    }
  }

  _rebuild(px, pz) {
    const counts = {};
    for (const k in this.pools) counts[k] = 0;
    for (const g of this.tracked) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.inst) continue;
      const { ox, oz } = g.userData;
      const chunkDist = Math.hypot(Math.max(0, Math.abs(px - ox) - 500), Math.max(0, Math.abs(pz - oz) - 500));
      for (const key in pl.inst) {
        if (key.charCodeAt(0) !== 112 || !key.startsWith('pi_')) continue;
        const kind = key.slice(3);
        const pool = this.pools[kind];
        if (!pool) continue;
        const [cap, r] = KINDS[kind];
        if (chunkDist > r) continue;
        const r2 = r * r;
        const a = pl.inst[key];
        const mArr = pool.instanceMatrix.array;
        const cArr = pool.instanceColor.array;
        let n = counts[kind];
        const isCarKind = kind === 'car' || kind === 'policeCar' || kind === 'fireTruck';
        for (let i = 0; i < a.length && n < cap; i += STRIDE) {
          const dx = a[i] - px, dz = a[i + 2] - pz;
          if (dx * dx + dz * dz > r2) continue;
          if (isCarKind) {
            const cKey = `${Math.round(a[i] * 2)}|${Math.round(a[i + 2] * 2)}`;
            if (this.claimedCars.has(cKey)) continue;
          }
          const c = Math.cos(a[i + 3]), s = Math.sin(a[i + 3]);
          const sx = a[i + 4], sy = a[i + 5], sz = a[i + 6];
          const o = n * 16;
          mArr[o] = c * sx; mArr[o + 1] = 0; mArr[o + 2] = -s * sx; mArr[o + 3] = 0;
          mArr[o + 4] = 0; mArr[o + 5] = sy; mArr[o + 6] = 0; mArr[o + 7] = 0;
          mArr[o + 8] = s * sz; mArr[o + 9] = 0; mArr[o + 10] = c * sz; mArr[o + 11] = 0;
          mArr[o + 12] = a[i]; mArr[o + 13] = a[i + 1]; mArr[o + 14] = a[i + 2]; mArr[o + 15] = 1;
          const rgb = a[i + 7] | 0;
          cArr[n * 3] = ((rgb >> 16) & 255) / 255;
          cArr[n * 3 + 1] = ((rgb >> 8) & 255) / 255;
          cArr[n * 3 + 2] = (rgb & 255) / 255;
          n++;
        }
        counts[kind] = n;
      }
    }
    for (const [k, pool] of Object.entries(this.pools)) {
      pool.count = counts[k];
      pool.instanceMatrix.needsUpdate = true;
      pool.instanceColor.needsUpdate = true;
    }
  }

  _carKey(x, z) { return `${Math.round(x * 2)}|${Math.round(z * 2)}`; }

  claimNearestParkedCar(px, pz, maxDist = 7.5) {
    let best = null, bestD2 = maxDist * maxDist;
    const carKinds = ['pi_car', 'pi_policeCar', 'pi_fireTruck'];
    for (const g of this.tracked) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.inst) continue;
      for (const key of carKinds) {
        const a = pl.inst[key];
        if (!a) continue;
        for (let i = 0; i < a.length; i += STRIDE) {
          const cx = a[i], cy = a[i + 1], cz = a[i + 2];
          const cKey = this._carKey(cx, cz);
          if (this.claimedCars.has(cKey) || this.wreckedCars.has(cKey)) continue;
          const d2 = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
          if (d2 < bestD2) {
            bestD2 = d2;
            best = { cKey, x: cx, y: cy, z: cz, yaw: a[i + 3], colorHex: a[i + 7] | 0, kind: key };
          }
        }
      }
    }
    if (!best) return null;
    this.claimedCars.add(best.cKey);
    if (Number.isFinite(this.lastX) && Number.isFinite(this.lastZ)) this._rebuild(this.lastX, this.lastZ);
    return best;
  }

  damageParkedCarsInRadius(wx, wz, radius = 5, damage = 45, app = null) {
    const r2 = (radius + 2.2) * (radius + 2.2);
    const carKinds = ['pi_car', 'pi_policeCar', 'pi_fireTruck'];
    let hits = 0;
    for (const g of this.tracked) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.inst) continue;
      for (const key of carKinds) {
        const a = pl.inst[key];
        if (!a) continue;
        for (let i = 0; i < a.length; i += STRIDE) {
          const cx = a[i], cy = a[i + 1], cz = a[i + 2];
          const cKey = this._carKey(cx, cz);
          if (this.claimedCars.has(cKey) || this.wreckedCars.has(cKey)) continue;
          const d2 = (cx - wx) * (cx - wx) + (cz - wz) * (cz - wz);
          if (d2 <= r2) {
            const hp = (this.carHp.has(cKey) ? this.carHp.get(cKey) : 80) - damage;
            this.carHp.set(cKey, hp);
            hits++;
            if (hp <= 0) {
              this.wreckedCars.add(cKey);
              a[i + 7] = 0x1e1e22; // Charred dark hull
              const fx = app?.vehicleDamage?._fx?.();
              if (fx) {
                fx.spawn('explosion', new THREE.Vector3(cx, cy + 1.0, cz), { scale: 0.9 });
                fx.spawn('smoke', new THREE.Vector3(cx, cy + 1.6, cz), { count: 3, scale: 0.45, life: 4 });
              }
              app?.vehicleDamage?._sfx?.('explosion', cx, cy, cz, 0.8);
            }
          }
        }
      }
    }
    if (hits > 0 && Number.isFinite(this.lastX) && Number.isFinite(this.lastZ)) {
      this._rebuild(this.lastX, this.lastZ);
    }
    return hits;
  }

  // ------------------------------------------------------------------ storefront name signs
  _updateSigns(camera) {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const zh = this.lang === 'zh';
    const near = [];
    for (const g of this.tracked) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.signTexts) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(cx - ox) > 500 + SIGN_RANGE || Math.abs(cz - oz) > 500 + SIGN_RANGE) continue;
      for (const s of pl.signTexts) {
        const d = Math.hypot(s[0] - cx, s[1] - cy, s[2] - cz);
        if (d > SIGN_RANGE) continue;
        const text = String((zh ? s[5] || s[6] : s[6] || s[5]) || '').trim();
        if (!text) continue;
        near.push([d, s, text]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    if (near.length > SIGN_MAX) near.length = SIGN_MAX;

    const want = near.map(([, s, text]) => `${text}|${Math.round((s[4] / 0.6) * 2) / 2}`);
    const keep = new Set(want);
    for (let i = 0; i < SIGN_MAX; i++) {
      const k = this.cellKey[i];
      if (k && !keep.has(k)) { this.cellOf.delete(k); this.cellKey[i] = null; }
    }
    let drew = false;
    const mArr = this.signMesh.instanceMatrix.array;
    const rArr = this.signRect.array;
    let n = 0;
    for (let i = 0; i < near.length; i++) {
      const [, s, text] = near[i];
      const key = want[i];
      let cell = this.cellOf.get(key);
      if (cell === undefined) {
        cell = this.cellKey.indexOf(null);
        if (cell < 0) continue;
        this.cellKey[cell] = key;
        this.cellOf.set(key, cell);
        this._drawCell(cell, text, s[4] / 0.6);
        drew = true;
      }
      const w = s[4], h = 0.6;
      const c = Math.cos(s[3]), sn = Math.sin(s[3]);
      const o = n * 16;
      mArr[o] = c * w; mArr[o + 1] = 0; mArr[o + 2] = -sn * w; mArr[o + 3] = 0;
      mArr[o + 4] = 0; mArr[o + 5] = h; mArr[o + 6] = 0; mArr[o + 7] = 0;
      mArr[o + 8] = sn; mArr[o + 9] = 0; mArr[o + 10] = c; mArr[o + 11] = 0;
      mArr[o + 12] = s[0]; mArr[o + 13] = s[1]; mArr[o + 14] = s[2]; mArr[o + 15] = 1;
      const col = cell % COLS, row = Math.floor(cell / COLS);
      rArr[n * 4] = col / COLS;
      rArr[n * 4 + 1] = 1 - (row + 1) / ROWS;
      rArr[n * 4 + 2] = 1 / COLS;
      rArr[n * 4 + 3] = 1 / ROWS;
      n++;
    }
    this.signMesh.count = n;
    this.signMesh.instanceMatrix.needsUpdate = true;
    this.signRect.needsUpdate = true;
    if (drew) this.signTex.needsUpdate = true;
  }

  _drawCell(cell, text, aspect) {
    const ctx = this.signCtx;
    const x0 = (cell % COLS) * CELL_W, y0 = Math.floor(cell / COLS) * CELL_H;
    const [bg, fg] = SIGN_STYLES[strHash(text) % SIGN_STYLES.length];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, CELL_W, CELL_H);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, CELL_W, CELL_H);
    // The cell (aspect 8) is mapped onto a sign of `aspect`; pre-stretch text so it reads undistorted.
    const kx = 8 / Math.max(2, Math.min(12, aspect));
    const avail = (CELL_W * 0.9) / kx;
    let size = 40;
    const family = '600 {s}px Georgia, "Times New Roman", "PingFang SC", "Noto Serif CJK SC", serif';
    ctx.font = family.replace('{s}', size);
    const tw = ctx.measureText(text).width;
    if (tw > avail) size = Math.max(14, Math.floor(size * (avail / tw)));
    ctx.font = family.replace('{s}', size);
    ctx.translate(x0 + CELL_W / 2, y0 + CELL_H / 2 + 1);
    ctx.scale(kx, 1);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0, avail);
    ctx.restore();
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 4, y0 + 4, CELL_W - 8, CELL_H - 8);
    ctx.globalAlpha = 1;
  }
}
