// Kaiju Defense: per-building destruction.
// Buildings are merged into one mesh per chunk, so each vertex carries `kBid` (= entity index + 1, written by the
// chunk worker). A small global RGBA8 "state atlas" is sampled in the building vertex shader:
//   row (slot * 2)     state: R damage, G burn (low 7 bits) | destroyed (bit 7), BA collapse start tick (16 bit)
//   row (slot * 2 + 1) info:  texel 0 = chunk ident (kx, kz mod 256), texel i+1 RG = collapse base Y (16 bit, 0.1 m)
// slot = (floor(ox / 1000) mod 8, floor(oz / 1000) mod 8) is derived from the mesh's modelMatrix, so no per-mesh
// uniforms are needed; the ident texel rejects a slot that still holds a previous chunk. The patch is compiled once at
// startup (always installed) and costs one uniform branch while nothing is damaged (uKOn = 0).
// Only changed rows are uploaded (texSubImage2D, 4 KB per row).
//
// City Damage: beginTracking() opens a CFG.CITY_TRACK_GROW_SECONDS window. Every building whose centre lies within
// the radius and whose chunk registers during that window adds its volume to the denominator; after the window the
// denominator is frozen. Buildings in chunks that register later still count towards the numerator (clamped), which
// only makes the game slightly harder.
import * as THREE from '../../../vendor/three.module.js';
import { CFG } from './kaiju_config.js';
import { getBeijingTerrainElevation } from '../../environment.js';

const TEX_W = 1024; // texels per chunk row (server caps chunks at ~420 buildings)
const SLOT_M = 8; // streaming window is at most 7x7 chunks
const TEX_H = SLOT_M * SLOT_M * 2;
const CHUNK = 1000;
const CELL = 64; // broadphase grid (m)
const TICK_HZ = 20;
const TICK_MOD = 65535; // 65535 is the "collapse finished long ago" sentinel
const F_BURN = 1, F_DEAD = 2, F_DONE = 4, F_RUBBLE = 8, F_TRACK = 16, F_DMG = 32;
const HIDE_Y = 10000;

const n = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const C = {
  get collapse() { return n(CFG.COLLAPSE_SECONDS, 2); },
  get burnMin() { return n(CFG.BURN_TO_COLLAPSE_MIN, 1); },
  get burnMax() { return n(CFG.BURN_TO_COLLAPSE_MAX, 2); },
  get smoke() { return n(CFG.RUBBLE_SMOKE_SECONDS, 45); },
  get maxRubble() { return n(CFG.MAX_RUBBLE_CHUNKS, 4000); },
  get toughH() { return n(CFG.DESTRUCTION_TOUGHNESS_HEIGHT, 150); },
  get ignite() { return n(CFG.FIRE_IGNITE_DAMAGE, 0.3); },
  get burnDps() { return n(CFG.BURN_DAMAGE_PER_SEC, 0.25); },
  get grow() { return n(CFG.CITY_TRACK_GROW_SECONDS, 10); },
  get maxEm() { return n(CFG.DESTRUCTION_MAX_EMITTERS, 36); },
  get densCell() { return n(CFG.DENSEST_CELL, 200); },
};

// ------------------------------------------------------------------ shader patch (shared, always on)
export const KAIJU_BLDG_UNIFORMS = { uKState: { value: null }, uKTick: { value: 0 }, uKOn: { value: 0 } };
let stateTex = null;
function getStateTexture() {
  if (!stateTex) {
    const data = new Uint8Array(TEX_W * TEX_H * 4);
    stateTex = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    stateTex.minFilter = THREE.NearestFilter;
    stateTex.magFilter = THREE.NearestFilter;
    stateTex.generateMipmaps = false;
    stateTex.unpackAlignment = 1;
    stateTex.needsUpdate = true;
    KAIJU_BLDG_UNIFORMS.uKState.value = stateTex;
  }
  return stateTex;
}

const GLSL_VDECL = 'attribute float kBid;\nuniform highp sampler2D uKState;\nuniform float uKTick;\nuniform float uKOn;\n';
const GLSL_VARY = 'varying vec3 vKState;\nvarying vec3 vKWorld;\n';
function glslVertex(vary) {
  return `
  ${vary ? 'vKState = vec3(0.0);' : ''}
  if (uKOn > 0.5 && kBid > 0.5 && kBid < ${TEX_W - 0.5}) {
    vec2 kOrg = floor(vec2(modelMatrix[3].x, modelMatrix[3].z) / ${CHUNK.toFixed(1)});
    vec2 kSl = mod(kOrg, ${SLOT_M.toFixed(1)});
    int kRow = int(kSl.y * ${SLOT_M.toFixed(1)} + kSl.x + 0.5) * 2;
    vec4 kId = texelFetch(uKState, ivec2(0, kRow + 1), 0) * 255.0;
    vec2 kWant = mod(kOrg, 256.0);
    if (abs(kId.x - kWant.x) < 0.5 && abs(kId.y - kWant.y) < 0.5) {
      int kX = int(kBid + 0.5);
      vec4 kS = texelFetch(uKState, ivec2(kX, kRow), 0) * 255.0;
      float kDead = step(127.5, kS.g);
      float kBurn = (kS.g - kDead * 128.0) / 127.0;
      float kP = 0.0;
      if (kDead > 0.5) {
        float kSt = floor(kS.b + 0.5) * 256.0 + floor(kS.a + 0.5);
        float kEl = kSt > 65534.5 ? 999.0 : mod(uKTick - kSt + 65535.0, 65535.0) / ${TICK_HZ.toFixed(1)};
        kP = clamp(kEl / KAIJU_COLLAPSE, 0.0, 1.0);
        vec4 kI = texelFetch(uKState, ivec2(kX, kRow + 1), 0) * 255.0;
        float kBase = (floor(kI.r + 0.5) * 256.0 + floor(kI.g + 0.5)) * 0.1 - 1000.0;
        float kH = max(0.0, transformed.y - kBase);
        float kE = kP * kP * (3.0 - 2.0 * kP);
        float kHash = fract(sin(kBid * 12.9898 + kOrg.x * 78.233 + kOrg.y * 37.719) * 43758.5453);
        float kAng = kHash * 6.2831853;
        transformed.xz += vec2(cos(kAng), sin(kAng)) * (0.24 * kE * (1.0 - kE) * kH);
        float kShake = (1.0 - kE) * step(0.0001, kP) * step(kP, 0.9999) * 0.45;
        transformed.x += sin(uKTick * 2.7 + kH * 0.35 + kHash * 40.0) * kShake;
        transformed.z += cos(uKTick * 3.1 + kH * 0.29 + kHash * 17.0) * kShake;
        transformed.y = kBase + kH * (1.0 - kE) - kE * 8.0;
      }
      ${vary ? 'vKState = vec3(kS.r / 255.0, kBurn, kP);' : ''}
    }
  }
  ${vary ? 'vKWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''}
`;
}
const GLSL_FRAG = `
  if (vKState.x + vKState.y > 0.004) {
    vec3 kq = floor(vKWorld * vec3(0.45, 0.33, 0.45));
    float kN = fract(sin(dot(kq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float kSc = clamp(vKState.x * (0.5 + 0.5 * kN) * 1.15, 0.0, 0.9);
    diffuseColor.rgb *= 1.0 - kSc;
    totalEmissiveRadiance *= 1.0 - kSc;
    if (vKState.y > 0.01) {
      float kF = 0.65 + 0.35 * sin(uKTick * 0.45 + kN * 31.0);
      totalEmissiveRadiance += vec3(1.0, 0.36, 0.07) * (vKState.y * step(0.6, kN) * kF * 2.2);
    }
  }
`;

function bindUniforms(shader) {
  getStateTexture();
  shader.uniforms.uKState = KAIJU_BLDG_UNIFORMS.uKState;
  shader.uniforms.uKTick = KAIJU_BLDG_UNIFORMS.uKTick;
  shader.uniforms.uKOn = KAIJU_BLDG_UNIFORMS.uKOn;
}

function patchVertex(shader, vary) {
  bindUniforms(shader);
  shader.vertexShader =
    `#define KAIJU_COLLAPSE ${C.collapse.toFixed(3)}\n` + GLSL_VDECL + (vary ? GLSL_VARY : '') +
    shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + glslVertex(vary));
}

/** Called from wfcBldgMat.onBeforeCompile (chunk_builder.js) after its own patch. */
export function kaijuPatchBuildingShader(shader) {
  patchVertex(shader, true);
  shader.fragmentShader =
    'uniform float uKTick;\n' + GLSL_VARY +
    shader.fragmentShader.replace('#include <lights_physical_fragment>', GLSL_FRAG + '\n#include <lights_physical_fragment>');
}

/** Shadow depth material for building meshes so collapsed buildings stop casting shadows. */
export function kaijuCreateBuildingDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.side = THREE.BackSide;
  m.onBeforeCompile = (shader) => patchVertex(shader, false);
  m.customProgramCacheKey = () => 'kaiju-bldg-depth-v1';
  return m;
}

/** Per-vertex building id attribute: ranges = [v0, v1, id, ...] (id = entityIdx + 1). */
export function kaijuBidAttribute(ranges, vertCount) {
  const a = new Uint16Array(vertCount);
  for (let i = 0; i + 2 < ranges.length; i += 3) a.fill(Math.min(65535, ranges[i + 2]), ranges[i], Math.min(vertCount, ranges[i + 1]));
  return new THREE.BufferAttribute(a, 1);
}

// ------------------------------------------------------------------ helpers
function ringArea(f) {
  let a = 0;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) a += f[j] * f[i + 1] - f[i] * f[j + 1];
  return Math.abs(a * 0.5);
}
function pointInRing(px, pz, f) {
  let inside = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const cellKey = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);
const mod256 = (k) => ((k % 256) + 256) % 256;
const originTag = (o) => (o ? `${o.centerLat},${o.centerLon},${o.name || ''}` : '');

function newState(cnt) {
  return {
    n: cnt,
    damage: new Float32Array(cnt),
    flags: new Uint8Array(cnt),
    tDestroy: new Float32Array(cnt),
    vol: new Float32Array(cnt),
  };
}

// ------------------------------------------------------------------ main class
export class KaijuDestruction {
  constructor(K) {
    this.K = K;
    this.app = K && K.app;
    this.stats = { destroyed: 0, damaged: 0, burning: 0 };
    this.onCollapse = null;
    this.tex = getStateTexture();
    this.data = this.tex.image.data;
    this.U = KAIJU_BLDG_UNIFORMS;
    this.clock = 0;
    this.recs = new Map();
    this.slots = new Array(SLOT_M * SLOT_M).fill(null);
    this.persist = new Map();
    this.origin = '';
    this.grid = new Map();
    this.stamp = 1;
    this.dirtyRows = new Uint8Array(TEX_H);
    this.anyDirty = false;
    this.burning = [];
    this.collapsing = [];
    this.jobs = [];
    this.rubbleQ = [];
    this.emitters = [];
    this.restoreColliders = [];
    this.restorePlaces = [];
    this.placesDirty = false;
    this.placesT = 0;
    this.syncT = 0;
    this.lastSize = -1;
    this.track = { on: false, x: 0, z: 0, r: 0, growUntil: 0, total: 0, dead: 0, partial: 0 };
    this.result = { dist: 0, point: new THREE.Vector3(), ref: null };
    this._dens = { x: 0, z: 0 };
    this._densMap = new Map();
    this._t0 = 0;
    this._t1 = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    // Beijing skyline LOD: instances of destroyed buildings stay hidden after their chunk unloads
    // (main.js restores a chunk's skyline instances on unload; update() re-hides ours).
    this.skyHide = [];
    this.skyKey = [];
    this.skySet = new Set();
    this._skyHidden = new THREE.Matrix4().compose(new THREE.Vector3(0, -5000, 0), new THREE.Quaternion(), new THREE.Vector3(1e-4, 1e-4, 1e-4));
    this._initRubble();
  }

  // ---------------------------------------------------------------- rubble pool
  _initRubble() {
    const cap = C.maxRubble;
    let g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.sin(i * 91.7 + p.getX(i) * 13.1 + p.getZ(i) * 7.3) * 43758.5453;
      const j = (h - Math.floor(h)) * 0.35;
      p.setXYZ(i, p.getX(i) * (1 - j * 0.6), p.getY(i) * (1 - j), p.getZ(i) * (1 - j * 0.4));
    }
    g = g.toNonIndexed();
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // Instance 0 is a degenerate (zero-scale) placeholder so the program compiles up front, not on the first collapse.
    mesh.count = 1;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'kaiju_rubble';
    this.rubble = mesh;
    this.rubbleCap = cap;
    this.rubbleNext = 1;
    this.rubbleLo = Infinity;
    this.rubbleHi = -1;
    const scene = (this.K && this.K.scene) || (this.app && this.app.scene);
    if (scene) scene.add(mesh);
  }

  _spawnRubble(rec, r, burned) {
    const st = rec.st, e = rec.ents[r];
    const w = rec.rMaxX[r] - rec.rMinX[r], d = rec.rMaxZ[r] - rec.rMinZ[r];
    const cx = (rec.rMaxX[r] + rec.rMinX[r]) * 0.5, cz = (rec.rMaxZ[r] + rec.rMinZ[r]) * 0.5;
    const ground = rec.rGround[r];
    const h = Math.max(4, rec.rTop[r] - ground);
    const foot = Math.sqrt(Math.max(1, w * d));
    const count = Math.max(6, Math.min(70, Math.round(foot * 0.6 + h * 0.12)));
    const size = Math.max(1.2, Math.min(7, foot * 0.11 + h * 0.012));
    const pileH = Math.max(1.2, Math.min(14, h * 0.06 + 1));
    const f = e.flatOuter, lx = e.ox || 0, lz = e.oz || 0;
    const m4 = this._m4, q = this._q, eu = this._e, p = this._p, s = this._s, col = this._c;
    const arr = this.rubble.instanceMatrix.array, carr = this.rubble.instanceColor.array;
    const tone = 0.32 + Math.random() * 0.2;
    for (let k = 0; k < count; k++) {
      let x = cx, z = cz;
      for (let t = 0; t < 4; t++) {
        x = cx + (Math.random() - 0.5) * w * 1.15;
        z = cz + (Math.random() - 0.5) * d * 1.15;
        if (!f || pointInRing(x - lx, z - lz, f)) break;
      }
      const dn = Math.min(1, Math.max(Math.abs(x - cx) / (w * 0.6 + 0.01), Math.abs(z - cz) / (d * 0.6 + 0.01)));
      const sc = size * (0.5 + Math.random() * 0.9);
      p.set(x, ground + pileH * (1 - dn) * (0.45 + Math.random() * 0.55) - sc * 0.25, z);
      eu.set(Math.random() * 1.2 - 0.6, Math.random() * Math.PI * 2, Math.random() * 1.2 - 0.6);
      q.setFromEuler(eu);
      s.set(sc * (0.6 + Math.random() * 0.8), sc * (0.35 + Math.random() * 0.5), sc * (0.6 + Math.random() * 0.8));
      m4.compose(p, q, s);
      const i = this.rubbleNext;
      m4.toArray(arr, i * 16);
      const v = tone + (Math.random() - 0.5) * 0.12;
      if (burned && Math.random() < 0.55) col.setRGB(v * 0.35, v * 0.32, v * 0.3);
      else col.setRGB(v * 1.02, v * 0.98, v * 0.92);
      carr[i * 3] = col.r; carr[i * 3 + 1] = col.g; carr[i * 3 + 2] = col.b;
      if (i < this.rubbleLo) this.rubbleLo = i;
      if (i > this.rubbleHi) this.rubbleHi = i;
      this.rubbleNext = i + 1 >= this.rubbleCap ? 1 : i + 1;
      if (this.rubble.count < this.rubbleCap) this.rubble.count++;
    }
    st.flags[r] |= F_RUBBLE;
  }

  _uploadRubble() {
    if (this.rubbleHi < 0) return;
    const lo = this.rubbleLo, hi = this.rubbleHi;
    const im = this.rubble.instanceMatrix, ic = this.rubble.instanceColor;
    im.clearUpdateRanges();
    im.addUpdateRange(lo * 16, (hi - lo + 1) * 16);
    im.needsUpdate = true;
    ic.clearUpdateRanges();
    ic.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
    ic.needsUpdate = true;
    this.rubbleLo = Infinity;
    this.rubbleHi = -1;
  }

  // ---------------------------------------------------------------- chunk registry
  _sync(force) {
    const app = this.app;
    const loaded = app && app.loadedChunks;
    if (!loaded) return;
    const tag = originTag(app.worldOrigin);
    if (tag !== this.origin) {
      const had = this.origin;
      this.origin = tag; // [feature/rail-transit] set first: _wipe → restoreAll → _sync(true) recursed forever on teleport
      if (had) this._wipe();
    }
    this.syncT -= 1;
    if (!force && this.syncT > 0 && loaded.size === this.lastSize) return;
    this.syncT = 15;
    this.lastSize = loaded.size;
    for (const rec of this.recs.values()) if (loaded.get(rec.key) !== rec.group) this._unregister(rec);
    const t0 = performance.now();
    for (const [key, g] of loaded) {
      if (this.recs.has(key) || !g || !g.userData || !g.userData.buildingEntities) continue;
      this._register(key, g);
      if (performance.now() - t0 > 2.0) { this.syncT = 0; break; }
    }
  }

  _register(key, g) {
    const ud = g.userData;
    const ents = ud.buildingEntities;
    const cnt = Math.min(ents.length, TEX_W - 1);
    const ox = ud.ox, oz = ud.oz;
    const kx = Math.floor(ox / CHUNK), kz = Math.floor(oz / CHUNK);
    const slot = (((kz % SLOT_M) + SLOT_M) % SLOT_M) * SLOT_M + (((kx % SLOT_M) + SLOT_M) % SLOT_M);
    if (this.slots[slot]) this._unregister(this.slots[slot]);
    const rec = {
      key, group: g, ud, ents, n: cnt, ox, oz, kx, kz, slot, dead: false,
      root: new Int32Array(cnt), mStart: new Int32Array(cnt + 1), mList: new Int32Array(cnt),
      rMinX: new Float32Array(cnt), rMaxX: new Float32Array(cnt), rMinZ: new Float32Array(cnt), rMaxZ: new Float32Array(cnt),
      rBase: new Float32Array(cnt), rTop: new Float32Array(cnt), rGround: new Float32Array(cnt),
      rVol: new Float32Array(cnt), rTough: new Float32Array(cnt), qs: new Uint32Array(cnt),
      colliders: new Array(cnt).fill(null), cells: [], st: null,
    };
    // 1. Validity + part -> parent grouping (parts collapse with the building that contains them)
    const area = new Float32Array(cnt);
    const valid = new Uint8Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const e = ents[i];
      const ok = e && e.kind === 'building' && e.flatOuter && e.flatOuter.length >= 6 &&
        !(e.styleDisplay && String(e.styleDisplay).startsWith('40 Authentic'));
      valid[i] = ok ? 1 : 0;
      rec.root[i] = ok ? i : -1;
      if (ok) area[i] = ringArea(e.flatOuter);
    }
    for (let i = 0; i < cnt; i++) {
      if (!valid[i]) continue;
      const e = ents[i];
      if (!e.isPart && !((e.minHeight || 0) > 0.5)) continue;
      const cx = (e.minX + e.maxX) * 0.5, cz = (e.minZ + e.maxZ) * 0.5;
      let best = -1, bestA = Infinity;
      for (let j = 0; j < cnt; j++) {
        if (j === i || !valid[j]) continue;
        const b = ents[j];
        if (b.isPart || (b.minHeight || 0) > 0.5) continue;
        if (cx < b.minX || cx > b.maxX || cz < b.minZ || cz > b.maxZ || area[j] >= bestA) continue;
        if (pointInRing(cx - b.ox, cz - b.oz, b.flatOuter)) { best = j; bestA = area[j]; }
      }
      if (best >= 0) rec.root[i] = best;
    }
    // 2. Member lists (CSR) + root aggregates
    const counts = rec.mStart;
    for (let i = 0; i < cnt; i++) if (rec.root[i] >= 0) counts[rec.root[i] + 1]++;
    for (let i = 0; i < cnt; i++) counts[i + 1] += counts[i];
    const fill = new Int32Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const r = rec.root[i];
      if (r < 0) continue;
      rec.mList[counts[r] + fill[r]++] = i;
    }
    for (let r = 0; r < cnt; r++) {
      if (rec.root[r] !== r) continue;
      const e0 = ents[r];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, b0 = Infinity, t1 = -Infinity, vol = 0;
      for (let k = rec.mStart[r]; k < rec.mStart[r + 1]; k++) {
        const e = ents[rec.mList[k]];
        if (e.minX < x0) x0 = e.minX; if (e.maxX > x1) x1 = e.maxX;
        if (e.minZ < z0) z0 = e.minZ; if (e.maxZ > z1) z1 = e.maxZ;
        if (e.baseY < b0) b0 = e.baseY; if (e.topY > t1) t1 = e.topY;
        vol += area[rec.mList[k]] * Math.max(1, e.topY - e.baseY);
      }
      const ground = Number.isFinite(e0.terrainY) ? Math.min(e0.terrainY, b0 + 2.5) : b0;
      rec.rMinX[r] = x0; rec.rMaxX[r] = x1; rec.rMinZ[r] = z0; rec.rMaxZ[r] = z1;
      rec.rBase[r] = b0; rec.rTop[r] = t1; rec.rGround[r] = ground; rec.rVol[r] = vol;
      rec.rTough[r] = 1 + Math.max(0, t1 - ground) / C.toughH;
    }
    // 3. Colliders (object identity survives the worker structured clone; bbox fallback)
    const cols = ud.buildingColliders || [];
    const byFlat = new Map();
    for (const c of cols) if (c && c.flatOuter) byFlat.set(c.flatOuter, c);
    for (let i = 0; i < cnt; i++) {
      if (!valid[i]) continue;
      const e = ents[i];
      let c = byFlat.get(e.flatOuter) || null;
      if (!c && !e.isPart) {
        for (const cc of cols) if (cc.minX === e.minX && cc.maxZ === e.maxZ && cc.minZ === e.minZ) { c = cc; break; }
      }
      rec.colliders[i] = c;
    }
    // 4. Broadphase grid (roots only)
    for (let r = 0; r < cnt; r++) {
      if (rec.root[r] !== r) continue;
      const ix0 = Math.floor(rec.rMinX[r] / CELL), ix1 = Math.floor(rec.rMaxX[r] / CELL);
      const iz0 = Math.floor(rec.rMinZ[r] / CELL), iz1 = Math.floor(rec.rMaxZ[r] / CELL);
      const packed = slot * TEX_W + r;
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = cellKey(ix, iz);
          let l = this.grid.get(k);
          if (!l) { l = []; this.grid.set(k, l); }
          l.push(packed);
          rec.cells.push(k);
        }
      }
    }
    // 5. Persistent state
    let st = this.persist.get(key);
    if (!st || st.n !== cnt) { st = newState(cnt); this.persist.set(key, st); }
    for (let r = 0; r < cnt; r++) if (rec.root[r] === r) st.vol[r] = rec.rVol[r];
    rec.st = st;
    this.recs.set(key, rec);
    this.slots[slot] = rec;
    // 6. Atlas rows
    const data = this.data;
    const so = slot * 2 * TEX_W * 4, io = so + TEX_W * 4;
    data.fill(0, so, so + TEX_W * 8);
    data[io] = mod256(kx); data[io + 1] = mod256(kz); data[io + 3] = 255;
    let any = false;
    for (let i = 0; i < cnt; i++) {
      const r = rec.root[i];
      if (r < 0) continue;
      const enc = Math.max(0, Math.min(65535, Math.round((rec.rGround[r] + 1000) * 10)));
      const o = io + (i + 1) * 4;
      data[o] = enc >> 8; data[o + 1] = enc & 255; data[o + 3] = 255;
      if (st.flags[r] !== 0) { this._writeTexel(rec, i); any = true; }
    }
    this._markRow(slot * 2);
    this._markRow(slot * 2 + 1);
    if (any) this.U.uKOn.value = 1;
    // 7. Re-apply destruction to a freshly loaded chunk
    for (let r = 0; r < cnt; r++) {
      if (rec.root[r] !== r || !(st.flags[r] & F_DEAD)) continue;
      if (!(st.flags[r] & F_DONE)) st.flags[r] |= F_DONE;
      this._writeRoot(rec, r);
      this._removeColliders(rec, r);
      this.jobs.push({ type: 0, rec, r });
    }
    if (this.track.on) this._trackRec(rec);
  }

  _unregister(rec) {
    rec.dead = true;
    const lo = rec.slot * TEX_W, hi = lo + TEX_W;
    for (const k of rec.cells) {
      const l = this.grid.get(k);
      if (!l) continue;
      let w = 0;
      for (let i = 0; i < l.length; i++) if (l[i] < lo || l[i] >= hi) l[w++] = l[i];
      l.length = w;
      if (!w) this.grid.delete(k);
    }
    rec.cells.length = 0;
    if (this.slots[rec.slot] === rec) this.slots[rec.slot] = null;
    if (this.recs.get(rec.key) === rec) this.recs.delete(rec.key);
  }

  // ---------------------------------------------------------------- atlas writes
  _markRow(row) {
    this.dirtyRows[row] = 1;
    this.anyDirty = true;
  }

  _tick(t) {
    return Math.floor(t * TICK_HZ) % TICK_MOD;
  }

  _writeTexel(rec, m) {
    const r = rec.root[m];
    const st = rec.st, fl = st.flags[r];
    const o = ((rec.slot * 2) * TEX_W + m + 1) * 4;
    const data = this.data;
    data[o] = Math.max(0, Math.min(255, Math.round(st.damage[r] * 255)));
    data[o + 1] = (fl & F_DEAD ? 128 : 0) + (fl & F_BURN && !(fl & F_DONE) ? 127 : 0);
    const tk = fl & F_DEAD ? (fl & F_DONE ? 65535 : this._tick(st.tDestroy[r])) : 0;
    data[o + 2] = tk >> 8;
    data[o + 3] = tk & 255;
  }

  _writeRoot(rec, r) {
    if (rec.dead) return;
    for (let k = rec.mStart[r]; k < rec.mStart[r + 1]; k++) this._writeTexel(rec, rec.mList[k]);
    this._markRow(rec.slot * 2);
  }

  _uploadRows() {
    if (!this.anyDirty) return;
    const renderer = this.app && this.app.renderer;
    if (!renderer) return;
    const props = renderer.properties.get(this.tex);
    this.anyDirty = false;
    if (!props.__webglTexture || props.__version !== this.tex.version) {
      // Not uploaded yet: three uploads the whole (tiny) array on first use.
      this.dirtyRows.fill(0);
      return;
    }
    const gl = renderer.getContext();
    renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (let row = 0; row < TEX_H; row++) {
      if (!this.dirtyRows[row]) continue;
      this.dirtyRows[row] = 0;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, TEX_W, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.data, row * TEX_W * 4);
    }
  }

  // ---------------------------------------------------------------- colliders / places
  _removeColliders(rec, r) {
    const arr = rec.ud.buildingColliders;
    if (!arr) return;
    for (let k = rec.mStart[r]; k < rec.mStart[r + 1]; k++) {
      const c = rec.colliders[rec.mList[k]];
      if (!c) continue;
      const i = arr.indexOf(c);
      if (i >= 0) {
        arr.splice(i, 1);
        this.restoreColliders.push(arr, c);
      }
    }
  }

  _hidePlaces(rec, r) {
    const pl = rec.ud.places;
    if (!pl) return;
    const x0 = rec.rMinX[r] - 1.5, x1 = rec.rMaxX[r] + 1.5, z0 = rec.rMinZ[r] - 1.5, z1 = rec.rMaxZ[r] + 1.5;
    const yMin = rec.rGround[r] + 2.5;
    let hit = false;
    if (pl.inst) {
      for (const kind in pl.inst) {
        const a = pl.inst[kind];
        if (!a || !a.length) continue;
        for (let i = 0; i + 2 < a.length; i += 8) {
          const x = a[i], z = a[i + 2];
          if (x < x0 || x > x1 || z < z0 || z > z1 || a[i + 1] < yMin || a[i + 1] > HIDE_Y * 0.5) continue;
          a[i + 1] -= HIDE_Y;
          this.restorePlaces.push(a, i + 1);
          hit = true;
        }
      }
    }
    const b = pl.beacons;
    if (b && b.length) {
      for (let i = 0; i + 2 < b.length; i += 3) {
        if (b[i] < x0 || b[i] > x1 || b[i + 2] < z0 || b[i + 2] > z1 || b[i + 1] < yMin || b[i + 1] > HIDE_Y * 0.5) continue;
        b[i + 1] -= HIDE_Y;
        this.restorePlaces.push(b, i + 1);
        hit = true;
      }
    }
    if (hit) this.placesDirty = true;
  }

  _hideSkyline(rec, r) {
    const app = this.app, sky = app.skylineInstanced, map = app.chunkToSkylineIndices, dv = app.skylineDataView;
    if (!sky || !map || !dv) return;
    const idxs = map.get(rec.key);
    if (!idxs) return;
    const kept = app.skylineKeptIndices;
    const x0 = rec.rMinX[r] - 1, x1 = rec.rMaxX[r] + 1, z0 = rec.rMinZ[r] - 1, z1 = rec.rMaxZ[r] + 1;
    for (let k = 0; k < idxs.length; k++) {
      const idx = idxs[k];
      if (this.skySet.has(idx)) continue;
      const off = 4 + (kept ? kept[idx] : idx) * 28;
      const wx = dv.getFloat32(off, true), wz = dv.getFloat32(off + 4, true);
      if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
      if (this.skyRef !== sky) { this.skyHide.length = 0; this.skyKey.length = 0; this.skySet.clear(); this.skyRef = sky; }
      this.skySet.add(idx);
      this.skyHide.push(idx);
      this.skyKey.push(rec.key);
    }
  }

  _enforceSkyline() {
    const sky = this.app.skylineInstanced;
    if (!sky || !this.skyHide.length || !sky.tiles || sky !== this.skyRef) return;
    let dirty = false;
    for (let i = 0; i < this.skyHide.length; i++) {
      const idx = this.skyHide[i];
      const tile = sky.tiles[sky.tileOf[idx]];
      if (!tile) continue;
      if (tile.instanceMatrix.array[(idx - tile.userData.start) * 16 + 13] < -4000) continue;
      sky.setMatrixAt(idx, this._skyHidden);
      dirty = true;
    }
    if (dirty) sky.instanceMatrix.needsUpdate = true;
  }

  _restoreSkyline() {
    const app = this.app, sky = app.skylineInstanced, dv = app.skylineDataView;
    if (sky && dv && this.skyHide.length && sky === this.skyRef) {
      const kept = app.skylineKeptIndices;
      const m4 = this._m4, p = this._p, s = this._s, q = this._q, eu = this._e;
      for (let i = 0; i < this.skyHide.length; i++) {
        if (app.loadedChunks && app.loadedChunks.has(this.skyKey[i])) continue; // main.js keeps loaded chunks hidden
        const idx = this.skyHide[i];
        const off = 4 + (kept ? kept[idx] : idx) * 28;
        const wx = dv.getFloat32(off, true), wz = dv.getFloat32(off + 4, true);
        const w = dv.getFloat32(off + 8, true), depth = dv.getFloat32(off + 12, true);
        const rawH = dv.getUint16(off + 16, true) * 0.1, rawMinH = dv.getUint16(off + 18, true) * 0.1;
        const yaw = dv.getInt16(off + 20, true) * 0.0001;
        const tY = getBeijingTerrainElevation(wx, wz);
        const baseH = rawMinH > 0 ? tY + rawMinH : tY - (tY > 1.5 ? 2.0 : 0.05);
        const topH = tY + rawH + (idx % 31) * 0.01;
        eu.set(0, yaw, 0);
        m4.compose(p.set(wx, baseH, wz), q.setFromEuler(eu), s.set(w, Math.max(2.0, topH - baseH), depth));
        sky.setMatrixAt(idx, m4);
      }
      sky.instanceMatrix.needsUpdate = true;
    }
    this.skyHide.length = 0;
    this.skyKey.length = 0;
    this.skySet.clear();
  }

  // ---------------------------------------------------------------- emitters
  _emit(type, x, y, z, opts, life) {
    const fx = this.K && this.K.fx;
    if (!fx || !fx.addEmitter) return null;
    while (this.emitters.length >= C.maxEm) {
      const old = this.emitters.shift();
      try { old.h && old.h.stop && old.h.stop(); } catch (_) { /* stub fx */ }
    }
    opts.life = life;
    const h = fx.addEmitter(type, new THREE.Vector3(x, y, z), opts);
    if (!h) return null;
    const rec = { h, until: this.clock + life };
    this.emitters.push(rec);
    return rec;
  }

  _stopEmitter(em) {
    if (!em) return;
    try { em.h && em.h.stop && em.h.stop(); } catch (_) { /* stub fx */ }
    em.until = -1;
  }

  // ---------------------------------------------------------------- damage core
  _damageRoot(rec, r, amt, fire) {
    const st = rec.st;
    let fl = st.flags[r];
    if (fl & F_DEAD || !(amt > 0)) return false;
    const old = st.damage[r];
    const d = old + amt / rec.rTough[r];
    if (!(fl & F_DMG)) { fl |= F_DMG; this.stats.damaged++; }
    st.flags[r] = fl;
    this.U.uKOn.value = 1;
    if (fire && !(fl & F_BURN) && d >= C.ignite && d < 1) this._ignite(rec, r);
    if (d >= 1) {
      this._destroy(st, r, rec);
      return true;
    }
    st.damage[r] = d;
    if (st.flags[r] & F_TRACK) this.track.partial += (d - old) * st.vol[r];
    if (Math.round(d * 255) !== Math.round(old * 255)) this._writeRoot(rec, r);
    return false;
  }

  _ignite(rec, r) {
    const st = rec.st;
    st.flags[r] |= F_BURN;
    this.stats.burning++;
    const cx = (rec.rMinX[r] + rec.rMaxX[r]) * 0.5, cz = (rec.rMinZ[r] + rec.rMaxZ[r]) * 0.5;
    const t = C.burnMin + Math.random() * Math.max(0, C.burnMax - C.burnMin);
    const sz = Math.max(4, Math.min(30, Math.sqrt((rec.rMaxX[r] - rec.rMinX[r]) * (rec.rMaxZ[r] - rec.rMinZ[r])) * 0.4));
    const top = rec.rTop[r];
    this.burning.push({
      key: rec.key, st, r, t,
      fire: this._emit('fire', cx, top, cz, { rate: 18, radius: sz, scale: 1 + sz / 10 }, t + 0.3),
      smoke: this._emit('smoke', cx, top + 4, cz, { rate: 6, radius: sz * 0.6, scale: 1.5 + sz / 8 }, t + 0.3),
    });
    this._writeRoot(rec, r);
  }

  _destroy(st, r, rec) {
    const fl = st.flags[r];
    if (fl & F_DEAD) return;
    const wasBurning = (fl & F_BURN) !== 0;
    if (fl & F_DMG) this.stats.damaged--;
    if (wasBurning) this.stats.burning--;
    this.stats.destroyed++;
    if (fl & F_TRACK) {
      this.track.partial -= st.damage[r] * st.vol[r];
      this.track.dead += st.vol[r];
    }
    st.damage[r] = 1;
    st.tDestroy[r] = this.clock;
    st.flags[r] = (fl | F_DEAD) & ~F_DMG;
    if (wasBurning) {
      for (let i = 0; i < this.burning.length; i++) {
        const b = this.burning[i];
        if (b.st === st && b.r === r) {
          this._stopEmitter(b.fire);
          this._stopEmitter(b.smoke);
          this.burning[i] = this.burning[this.burning.length - 1];
          this.burning.pop();
          break;
        }
      }
    }
    if (!rec || rec.dead) {
      st.flags[r] |= F_DONE;
      return;
    }
    this.U.uKOn.value = 1;
    this._writeRoot(rec, r);
    this._removeColliders(rec, r);
    this.collapsing.push({ rec, r, t: this.clock });
    this.jobs.push({ type: 0, rec, r });
    this.rubbleQ.push({ rec, r, at: this.clock + C.collapse * 0.45, burned: wasBurning });
    const cx = (rec.rMinX[r] + rec.rMaxX[r]) * 0.5, cz = (rec.rMinZ[r] + rec.rMaxZ[r]) * 0.5;
    const h = Math.max(4, rec.rTop[r] - rec.rGround[r]);
    const foot = Math.sqrt(Math.max(1, (rec.rMaxX[r] - rec.rMinX[r]) * (rec.rMaxZ[r] - rec.rMinZ[r])));
    const size = Math.max(h, foot);
    const fx = this.K && this.K.fx;
    if (fx && fx.spawn) {
      const p = this._p.set(cx, rec.rGround[r] + 1, cz);
      fx.spawn('dustRing', p, { scale: Math.max(1, foot / 12) });
      fx.spawn('dust', p.set(cx, rec.rGround[r] + h * 0.3, cz), { count: 10 + Math.min(30, foot | 0), scale: Math.max(1, foot / 10) });
      fx.spawn('debris', p.set(cx, rec.rGround[r] + h * 0.6, cz), { count: 8 + Math.min(16, (h / 10) | 0), scale: Math.max(1, foot / 20) });
    }
    if (this.K && this.K.crowd && this.K.crowd.addThreat) this.K.crowd.addThreat(cx, cz, foot * 0.5 + 40, 6);
    if (this.onCollapse) this.onCollapse(cx, cz, size);
  }

  // ---------------------------------------------------------------- public API
  beginTracking(x, z, radius) {
    const t = this.track;
    t.on = true; t.x = x; t.z = z; t.r = radius || n(CFG.CITY_TRACK_RADIUS, 2000);
    t.growUntil = this.clock + C.grow;
    t.total = 0; t.dead = 0; t.partial = 0;
    this._sync(true);
    for (const rec of this.recs.values()) this._trackRec(rec);
  }

  _trackRec(rec) {
    const t = this.track, st = rec.st, r2 = t.r * t.r, grow = this.clock <= t.growUntil;
    for (let r = 0; r < rec.n; r++) {
      if (rec.root[r] !== r || st.flags[r] & F_TRACK) continue;
      const dx = (rec.rMinX[r] + rec.rMaxX[r]) * 0.5 - t.x, dz = (rec.rMinZ[r] + rec.rMaxZ[r]) * 0.5 - t.z;
      if (dx * dx + dz * dz > r2) continue;
      st.flags[r] |= F_TRACK;
      if (grow) t.total += st.vol[r];
      if (st.flags[r] & F_DEAD) t.dead += st.vol[r];
      else t.partial += st.damage[r] * st.vol[r];
    }
  }

  getCityDamage() {
    const t = this.track;
    if (!t.on || t.total <= 0) return 0;
    const v = (t.dead + Math.max(0, t.partial)) / (t.total * n(CFG.CITY_FALL_FRACTION, 0.22));
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  damageSphere(x, y, z, r, amount, opts) {
    this.app?.landmarks?.damage?.kaijuSphere(x, y, z, r, amount, opts); // [landmark-damage]
    const fire = Boolean(opts && opts.fire);
    if (!(r > 0) || !(amount > 0)) return 0;
    let destroyed = 0;
    const stamp = ++this.stamp;
    const ix0 = Math.floor((x - r) / CELL), ix1 = Math.floor((x + r) / CELL);
    const iz0 = Math.floor((z - r) / CELL), iz1 = Math.floor((z + r) / CELL);
    const r2 = r * r;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const l = this.grid.get(cellKey(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const p = l[i];
          const rec = this.slots[(p / TEX_W) | 0];
          if (!rec) continue;
          const b = p % TEX_W;
          if (rec.qs[b] === stamp) continue;
          rec.qs[b] = stamp;
          if (rec.st.flags[b] & F_DEAD) continue;
          const dx = Math.max(rec.rMinX[b] - x, 0, x - rec.rMaxX[b]);
          const dy = Math.max(rec.rBase[b] - y, 0, y - rec.rTop[b]);
          const dz = Math.max(rec.rMinZ[b] - z, 0, z - rec.rMaxZ[b]);
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          if (this._damageRoot(rec, b, amount * (1 - 0.5 * Math.sqrt(d2) / r), fire)) destroyed++;
        }
      }
    }
    return destroyed;
  }

  damageCone(origin, dir, range, halfAngleRad, amount, opts) {
    this.app?.landmarks?.damage?.kaijuCone(origin, dir, range, halfAngleRad, amount); // [landmark-damage]
    const fire = opts && opts.fire === false ? false : true;
    if (!(range > 0) || !(amount > 0)) return 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dl, dy = dir.y / dl, dz = dir.z / dl;
    const tanH = Math.tan(Math.min(1.2, Math.max(0.01, halfAngleRad)));
    const spread = range * tanH + 20;
    const ex = ox + dx * range, ez = oz + dz * range;
    const ix0 = Math.floor((Math.min(ox, ex) - spread) / CELL), ix1 = Math.floor((Math.max(ox, ex) + spread) / CELL);
    const iz0 = Math.floor((Math.min(oz, ez) - spread) / CELL), iz1 = Math.floor((Math.max(oz, ez) + spread) / CELL);
    const L2 = dx * dx + dz * dz;
    const stamp = ++this.stamp;
    let destroyed = 0;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const l = this.grid.get(cellKey(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const p = l[i];
          const rec = this.slots[(p / TEX_W) | 0];
          if (!rec) continue;
          const b = p % TEX_W;
          if (rec.qs[b] === stamp) continue;
          rec.qs[b] = stamp;
          if (rec.st.flags[b] & F_DEAD) continue;
          const cx = (rec.rMinX[b] + rec.rMaxX[b]) * 0.5, cz = (rec.rMinZ[b] + rec.rMaxZ[b]) * 0.5;
          const vx = cx - ox, vz = cz - oz;
          const s = L2 > 1e-6 ? (vx * dx + vz * dz) / L2 : 0;
          const yAxis = oy + dy * s;
          const py = yAxis < rec.rBase[b] ? rec.rBase[b] : yAxis > rec.rTop[b] ? rec.rTop[b] : yAxis;
          const vy = py - oy;
          const t = vx * dx + vy * dy + vz * dz;
          const rad = 0.5 * Math.hypot(rec.rMaxX[b] - rec.rMinX[b], rec.rMaxZ[b] - rec.rMinZ[b]);
          if (t < -rad || t > range + rad) continue;
          const perp2 = vx * vx + vy * vy + vz * vz - t * t;
          const allow = Math.max(0, t) * tanH + rad;
          if (perp2 > allow * allow) continue;
          const fall = 1 - 0.4 * Math.max(0, Math.min(1, t / range));
          if (this._damageRoot(rec, b, amount * fall, fire)) destroyed++;
        }
      }
    }
    return destroyed;
  }

  _slab(minX, minY, minZ, maxX, maxY, maxZ, ox, oy, oz, ix, iy, iz, tMax) {
    let t0 = 0, t1 = tMax;
    let a = (minX - ox) * ix, b = (maxX - ox) * ix;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
    a = (minY - oy) * iy; b = (maxY - oy) * iy;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
    a = (minZ - oz) * iz; b = (maxZ - oz) * iz;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1 || Number.isNaN(t0)) return false;
    this._t0 = t0; this._t1 = t1;
    return true;
  }

  _rayMember(e, ox, oy, oz, dx, dy, dz, ix, iy, iz, best) {
    if (!this._slab(e.minX, e.baseY, e.minZ, e.maxX, e.topY, e.maxZ, ox, oy, oz, ix, iy, iz, best)) return Infinity;
    const t0 = this._t0, t1 = this._t1;
    const f = e.flatOuter, lx = ox - (e.ox || 0), lz = oz - (e.oz || 0);
    const base = e.baseY - 0.01, top = e.topY + 0.01;
    let tb = Infinity;
    const ty = oy + dy * (t0 + 1e-3);
    if (ty >= base && ty <= top && pointInRing(lx + dx * (t0 + 1e-3), lz + dz * (t0 + 1e-3), f)) return t0;
    if (dy < -1e-6) {
      const tt = (e.topY - oy) / dy;
      if (tt >= t0 && tt <= t1 && pointInRing(lx + dx * tt, lz + dz * tt, f)) tb = tt;
    }
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const ax = f[j], az = f[j + 1], ex = f[i] - ax, ez = f[i + 1] - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = ax - lx, wz = az - lz;
      const t = (wx * ez - wz * ex) / den;
      if (t < t0 || t > t1 || t >= tb) continue;
      const u = (wx * dz - wz * dx) / den;
      if (u < 0 || u > 1) continue;
      const py = oy + dy * t;
      if (py >= base && py <= top) tb = t;
    }
    return tb;
  }

  raycast(origin, dir, maxDist) {
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = maxDist > 0 ? maxDist : 2000;
    let bRec = null, bR = -1;
    const stamp = ++this.stamp;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tdx = adx > 1e-9 ? CELL / adx : Infinity, tdz = adz > 1e-9 ? CELL / adz : Infinity;
    let tmx = adx > 1e-9 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / adx : Infinity;
    let tmz = adz > 1e-9 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / adz : Infinity;
    let tEnter = 0;
    for (let guard = 0; guard < 512 && tEnter <= best; guard++) {
      const l = this.grid.get(cellKey(cx, cz));
      if (l) {
        for (let i = 0; i < l.length; i++) {
          const p = l[i];
          const rec = this.slots[(p / TEX_W) | 0];
          if (!rec) continue;
          const b = p % TEX_W;
          if (rec.qs[b] === stamp) continue;
          rec.qs[b] = stamp;
          if (rec.st.flags[b] & F_DEAD) continue;
          if (!this._slab(rec.rMinX[b], rec.rBase[b], rec.rMinZ[b], rec.rMaxX[b], rec.rTop[b], rec.rMaxZ[b], ox, oy, oz, ix, iy, iz, best)) continue;
          for (let k = rec.mStart[b]; k < rec.mStart[b + 1]; k++) {
            const t = this._rayMember(rec.ents[rec.mList[k]], ox, oy, oz, dx, dy, dz, ix, iy, iz, best);
            if (t < best) { best = t; bRec = rec; bR = b; }
          }
        }
      }
      if (tmx < tmz) { tEnter = tmx; tmx += tdx; cx += sx; } else { tEnter = tmz; tmz += tdz; cz += sz; }
      if (tEnter === Infinity) break;
    }
    if (!bRec) return null;
    const res = this.result;
    res.dist = best;
    res.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    res.ref = { rec: bRec, key: bRec.key, r: bR };
    return res;
  }

  /** True when (x, z) lies inside a standing building footprint (pedestrian avoidance). Allocation free. */
  isInsideBuilding(x, z) {
    const l = this.grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return false;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const rec = this.slots[(p / TEX_W) | 0];
      if (!rec) continue;
      const b = p % TEX_W;
      if (rec.st.flags[b] & F_DEAD) continue;
      if (x < rec.rMinX[b] || x > rec.rMaxX[b] || z < rec.rMinZ[b] || z > rec.rMaxZ[b]) continue;
      for (let k = rec.mStart[b]; k < rec.mStart[b + 1]; k++) {
        const e = rec.ents[rec.mList[k]];
        if (e.isPart || x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) continue;
        if (pointInRing(x - (e.ox || 0), z - (e.oz || 0), e.flatOuter)) return true;
      }
    }
    return false;
  }

  applyHit(ref, amount, opts) {
    if (!ref) return false;
    let rec = ref.rec;
    if (!rec || rec.dead) rec = this.recs.get(ref.key);
    if (!rec || ref.r >= rec.n || rec.root[ref.r] !== ref.r) return false;
    return this._damageRoot(rec, ref.r, amount, Boolean(opts && opts.fire));
  }

  // ---------------------------------------------------------------- helicopter weapons (Fly mode + Kaiju)
  /** Hit points in rockets, scaled by size: houses ~1-2 rockets (a few seconds of cannon), towers up to 10. */
  heliHp(rec, r) {
    const h = Math.max(3, rec.rTop[r] - rec.rGround[r]);
    const foot = Math.sqrt(Math.max(1, (rec.rMaxX[r] - rec.rMinX[r]) * (rec.rMaxZ[r] - rec.rMinZ[r])));
    return Math.min(10, Math.max(1, 0.5 + h / 25 + foot / 45));
  }

  _heliDamage(rec, r, units) {
    return this._damageRoot(rec, r, (units / this.heliHp(rec, r)) * rec.rTough[r], false);
  }

  /** Direct helicopter hit on a raycast `ref`, worth `units` rockets. True when the building collapses. */
  applyHeliHit(ref, units) {
    if (!ref || !(units > 0)) return false;
    let rec = ref.rec;
    if (!rec || rec.dead) rec = this.recs.get(ref.key);
    if (!rec || ref.r >= rec.n || rec.root[ref.r] !== ref.r) return false;
    return this._heliDamage(rec, ref.r, units);
  }

  /** Rocket splash: standing buildings within r (box distance) take up to `units`, fading with distance. */
  heliSplash(x, y, z, r, units, skipRef) {
    if (!(r > 0) || !(units > 0)) return 0;
    let destroyed = 0;
    const stamp = ++this.stamp;
    const r2 = r * r;
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = this.grid.get(cellKey(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const p = l[i];
          const rec = this.slots[(p / TEX_W) | 0];
          if (!rec) continue;
          const b = p % TEX_W;
          if (rec.qs[b] === stamp) continue;
          rec.qs[b] = stamp;
          if (rec.st.flags[b] & F_DEAD || rec.root[b] !== b) continue;
          if (skipRef && skipRef.key === rec.key && skipRef.r === b) continue;
          const dx = Math.max(rec.rMinX[b] - x, 0, x - rec.rMaxX[b]);
          const dy = Math.max(rec.rBase[b] - y, 0, y - rec.rTop[b]);
          const dz = Math.max(rec.rMinZ[b] - z, 0, z - rec.rMaxZ[b]);
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          if (this._heliDamage(rec, b, units * (1 - Math.sqrt(d2) / r))) destroyed++;
        }
      }
    }
    return destroyed;
  }

  getDensestTarget(fromX, fromZ) {
    const cs = C.densCell;
    const m = this._densMap;
    m.clear();
    for (const rec of this.recs.values()) {
      const st = rec.st;
      for (let r = 0; r < rec.n; r++) {
        if (rec.root[r] !== r || st.flags[r] & F_DEAD) continue;
        const x = (rec.rMinX[r] + rec.rMaxX[r]) * 0.5, z = (rec.rMinZ[r] + rec.rMaxZ[r]) * 0.5;
        const v = st.vol[r] * (1 - 0.75 * st.damage[r]);
        const k = cellKey(Math.floor(x / cs), Math.floor(z / cs));
        let c = m.get(k);
        if (!c) { c = [0, 0, 0]; m.set(k, c); }
        c[0] += v; c[1] += x * v; c[2] += z * v;
      }
    }
    let best = null, bestS = 0;
    for (const c of m.values()) {
      if (c[0] <= 0) continue;
      const x = c[1] / c[0], z = c[2] / c[0];
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d < 22) continue;
      const s = c[0] / (1 + Math.pow(d / 140, 1.65));
      if (s > bestS) { bestS = s; best = c; }
    }
    if (!best) return null;
    this._dens.x = best[1] / best[0];
    this._dens.z = best[2] / best[0];
    return this._dens;
  }

  update(dt) {
    if (!this.app) return;
    dt = dt > 0 ? Math.min(dt, 0.25) : 0;
    this.clock += dt;
    this.U.uKTick.value = (this.clock * TICK_HZ) % TICK_MOD;
    this._sync(false);
    // Burning buildings: scorch grows, then collapse
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i];
      const st = b.st, r = b.r;
      b.t -= dt;
      const rec = this.recs.get(b.key);
      const live = rec && rec.st === st ? rec : null;
      if (b.t <= 0) {
        this._destroy(st, r, live);
        continue;
      }
      const old = st.damage[r];
      const d = Math.min(0.98, old + C.burnDps * dt);
      st.damage[r] = d;
      if (st.flags[r] & F_TRACK) this.track.partial += (d - old) * st.vol[r];
      if (live && Math.round(d * 255) !== Math.round(old * 255)) this._writeRoot(live, r);
    }
    // Collapse finished -> sentinel (immune to tick wrap) + lingering smoke
    const col = this.collapsing;
    let w = 0;
    for (let i = 0; i < col.length; i++) {
      const c = col[i];
      if (this.clock - c.t < C.collapse + 0.25) { col[w++] = c; continue; }
      c.rec.st.flags[c.r] |= F_DONE;
      if (!c.rec.dead) this._writeRoot(c.rec, c.r);
    }
    col.length = w;
    // Spread side effects over frames
    const t0 = performance.now();
    while (this.rubbleQ.length && this.rubbleQ[0].at <= this.clock && performance.now() - t0 < 1.5) {
      const q = this.rubbleQ.shift();
      const st = q.rec.st;
      if (!(st.flags[q.r] & F_DEAD)) continue;
      if (!(st.flags[q.r] & F_RUBBLE)) this._spawnRubble(q.rec, q.r, q.burned);
      const rec = q.rec, r = q.r;
      const cx = (rec.rMinX[r] + rec.rMaxX[r]) * 0.5, cz = (rec.rMinZ[r] + rec.rMaxZ[r]) * 0.5;
      const foot = Math.sqrt(Math.max(1, (rec.rMaxX[r] - rec.rMinX[r]) * (rec.rMaxZ[r] - rec.rMinZ[r])));
      const g = rec.rGround[r];
      this._emit('smoke', cx, g + 3, cz, { rate: 3 + Math.min(6, foot / 8), radius: foot * 0.4, scale: 1.5 + foot / 15 }, C.smoke);
      if (q.burned) this._emit('fire', cx, g + 1, cz, { rate: 6, radius: foot * 0.35, scale: 0.8 + foot / 25 }, Math.min(15, C.smoke));
    }
    while (this.jobs.length && performance.now() - t0 < 1.5) {
      const j = this.jobs.shift();
      if (j.type === 0) { this._hidePlaces(j.rec, j.r); this._hideSkyline(j.rec, j.r); }
    }
    this._enforceSkyline();
    // Drop expired emitter handles
    if (this.emitters.length) {
      let k = 0;
      for (let i = 0; i < this.emitters.length; i++) if (this.emitters[i].until > this.clock) this.emitters[k++] = this.emitters[i];
      this.emitters.length = k;
    }
    this.placesT += dt;
    if (this.placesDirty && this.placesT > 0.3 && this.app.places) {
      this.app.places.lastX = Infinity;
      this.placesDirty = false;
      this.placesT = 0;
    }
    this._uploadRubble();
    this._uploadRows();
  }

  // Full reset of shader state, colliders, places, rubble and emitters.
  restoreAll() {
    this._sync(true);
    for (const b of this.burning) { this._stopEmitter(b.fire); this._stopEmitter(b.smoke); }
    for (const em of this.emitters) this._stopEmitter(em);
    this.burning.length = 0;
    this.emitters.length = 0;
    this.collapsing.length = 0;
    this.jobs.length = 0;
    this.rubbleQ.length = 0;
    const rc = this.restoreColliders;
    for (let i = 0; i + 1 < rc.length; i += 2) if (rc[i].indexOf(rc[i + 1]) < 0) rc[i].push(rc[i + 1]);
    rc.length = 0;
    const rp = this.restorePlaces;
    for (let i = 0; i + 1 < rp.length; i += 2) rp[i][rp[i + 1]] += HIDE_Y;
    if (rp.length) this.placesDirty = true;
    rp.length = 0;
    this._restoreSkyline();
    this.placesT = 1;
    this.rubble.count = 1;
    this.rubbleNext = 1;
    this.persist.clear();
    const data = this.data;
    for (const rec of this.recs.values()) {
      const st = newState(rec.n);
      for (let r = 0; r < rec.n; r++) if (rec.root[r] === r) st.vol[r] = rec.rVol[r];
      rec.st = st;
      this.persist.set(rec.key, st);
      const so = rec.slot * 2 * TEX_W * 4;
      data.fill(0, so, so + TEX_W * 4);
      this._markRow(rec.slot * 2);
    }
    this.stats.destroyed = 0; this.stats.damaged = 0; this.stats.burning = 0;
    const t = this.track;
    t.on = false; t.total = 0; t.dead = 0; t.partial = 0;
    this.U.uKOn.value = 0;
    if (this.app && this.app.places && this.placesDirty) { this.app.places.lastX = Infinity; this.placesDirty = false; }
    this._uploadRows();
  }

  // World origin changed (teleport to another city): state keyed by chunk index is meaningless now.
  _wipe() {
    this.restoreAll();
    for (const rec of Array.from(this.recs.values())) this._unregister(rec);
    this.persist.clear();
  }
}
