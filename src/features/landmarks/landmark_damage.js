/**
 * [landmark-damage] Weapons, explosions and the Kaiju damage the hand-built landmarks (landmark_system.js).
 *
 * - HP per landmark "section", in rocket units (same scale as KaijuDestruction.heliHp): compact landmarks are one
 *   section; long ones (bridges, palaces) are split along their long axis so each tower / wing degrades on its own.
 * - Every hit leaves a scorch / bullet mark: a small per-landmark ring buffer of world-space spheres read by a
 *   fragment-shader patch of the landmark's two materials (soot, charred core, crack network around big blasts).
 * - Stages per section (f = damage / HP): marks + cracks, then (f >= CARVE_F, explosive hits) chunks are carved out
 *   of the model's own triangles and fly off as debris, then (f >= 1) partial collapse: everything above a jagged
 *   cut plane is moved into one rigid piece that topples away from the attacker, crashes in dust and sinks into
 *   the ground, leaving a stump, rubble, fire and smoke. A section can collapse twice (second cut near the base).
 * - Bridges: nothing below the road deck (registry `deck`, or DECK_Y) is ever carved or cut, so OSM traffic and
 *   the player's car keep driving on it; only towers, arches, cables and portals come down.
 * - Aim / projectile hit testing: a lazily (time-sliced) built uniform grid of each mesh's triangles, queried with a
 *   3D DDA in mesh space; whole landmarks are rejected by their bounding sphere first.
 * - State lives on the landmark item and is dropped with it (origin change / teleport). Removed triangles are
 *   collapsed in place (degenerate), so no GPU buffers are reallocated. Particles reuse the pooled KaijuFx.
 */
import * as THREE from "../../../vendor/three.module.js";
import { getChunkTerrainMeshElevation } from "../../environment.js";
import { KaijuFx } from "../kaiju/kaiju_fx.js";

const DEG = Math.PI / 180;
const BIG_MARKS = 24, SMALL_MARKS = 40;
const CARVE_F = 0.22;           // damage fraction from which explosive hits break chunks off
const SMOKE_F = 0.5;            // damage fraction from which a damaged section smoulders
const MAX_DEBRIS = 26;          // carved pieces in flight / sinking (all landmarks)
const MAX_TRIS_PER_CHUNK = 2600;
const MAX_EMITTERS = 14;
const RUBBLE_CAP = 1400;
const GRID_RANGE = 2600;        // build hit grids for landmarks closer than this (m)
const GRID_DROP = 5200;         // and free them beyond this
const GRID_BUDGET_MS = 3;
const KAIJU_UNITS = 2.5;        // KaijuDestruction damage (1 = one ordinary building) -> rocket units
const GRAV = 22;
const DECK_Y = { harbourbridge: 49 }; // road deck (model y) of bridges without a registry `deck`
const rr = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ shader patch
const GLSL_COMMON = `
uniform vec4 uLmBig[${BIG_MARKS}];
uniform vec4 uLmSmall[${SMALL_MARKS}];
uniform int uLmNBig;
uniform int uLmNSmall;
uniform float uLmDmg;
varying vec3 vLmW;
float lmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lmNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lmHash(i), lmHash(i + vec3(1, 0, 0)), f.x), mix(lmHash(i + vec3(0, 1, 0)), lmHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lmHash(i + vec3(0, 0, 1)), lmHash(i + vec3(1, 0, 1)), f.x), mix(lmHash(i + vec3(0, 1, 1)), lmHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
const GLSL_APPLY = `
#include <color_fragment>
if (uLmNBig + uLmNSmall > 0) {
  float soot = 0.0, core = 0.0, crack = 0.0;
  for (int i = 0; i < ${BIG_MARKS}; i++) {
    if (i >= uLmNBig) break;
    vec4 m = uLmBig[i];
    float q = length(vLmW - m.xyz) / m.w;
    if (q > 2.3) continue;
    float n = lmNoise(vLmW * (2.2 / m.w) + float(i) * 7.31);
    soot = max(soot, 1.0 - smoothstep(0.3, 1.05, q + (n - 0.5) * 0.55));
    core = max(core, 1.0 - smoothstep(0.18, 0.42, q + (n - 0.5) * 0.25));
    float c = abs(lmNoise(vLmW * 0.27 + float(i) * 3.1) - lmNoise(vLmW * 0.27 - 5.7 - float(i)));
    crack = max(crack, (1.0 - smoothstep(0.0, 0.035, c)) * (1.0 - smoothstep(1.3, 2.3, q)) * smoothstep(0.35, 0.6, q));
  }
  for (int i = 0; i < ${SMALL_MARKS}; i++) {
    if (i >= uLmNSmall) break;
    vec4 m = uLmSmall[i];
    float q = length(vLmW - m.xyz) / m.w;
    if (q > 1.0) continue;
    soot = max(soot, (1.0 - smoothstep(0.25, 1.0, q)) * 0.75);
    core = max(core, 1.0 - smoothstep(0.12, 0.3, q));
  }
  diffuseColor.rgb *= 1.0 - 0.78 * soot;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.018, 0.016), max(core * 0.92, crack * 0.8));
}
if (uLmDmg > 0.0) diffuseColor.rgb *= 1.0 - min(uLmDmg, 1.0) * 0.22 * lmNoise(vLmW * 0.06);
`;

function patchMaterial(mat, U, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLmW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvLmW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_COMMON)
      .replace("#include <color_fragment>", GLSL_APPLY);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

function makeUniforms() {
  const big = [], small = [];
  for (let i = 0; i < BIG_MARKS; i++) big.push(new THREE.Vector4());
  for (let i = 0; i < SMALL_MARKS; i++) small.push(new THREE.Vector4());
  return { uLmBig: { value: big }, uLmSmall: { value: small }, uLmNBig: { value: 0 }, uLmNSmall: { value: 0 }, uLmDmg: { value: 0 } };
}

// ------------------------------------------------------------------ triangle grid (mesh space)
/** Time-sliced builder: yields every few thousand triangles; sets rec.grid when done. */
function* gridBuilder(rec) {
  const pos = rec.pos, nt = rec.nt;
  const bb = rec.geo.boundingBox;
  const ex = Math.max(1, bb.max.x - bb.min.x), ey = Math.max(1, bb.max.y - bb.min.y), ez = Math.max(1, bb.max.z - bb.min.z);
  let c = Math.max(1.5, Math.cbrt((ex * ey * ez) / Math.max(1, nt / 3)));
  let nx, ny, nz;
  for (;;) {
    nx = Math.min(256, Math.max(1, Math.ceil(ex / c)));
    ny = Math.min(256, Math.max(1, Math.ceil(ey / c)));
    nz = Math.min(256, Math.max(1, Math.ceil(ez / c)));
    if (nx * ny * nz <= 160000) break;
    c *= 1.25;
  }
  const mx = bb.min.x, my = bb.min.y, mz = bb.min.z, inv = 1 / c;
  const ncell = nx * ny * nz;
  const cnt = new Int32Array(ncell + 1);
  const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  for (let pass = 0; pass < 2; pass++) {
    const list = pass ? rec._list : null, fill = pass ? rec._fill : null;
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const x0 = Math.min(pos[o], pos[o + 3], pos[o + 6]), x1 = Math.max(pos[o], pos[o + 3], pos[o + 6]);
      const y0 = Math.min(pos[o + 1], pos[o + 4], pos[o + 7]), y1 = Math.max(pos[o + 1], pos[o + 4], pos[o + 7]);
      const z0 = Math.min(pos[o + 2], pos[o + 5], pos[o + 8]), z1 = Math.max(pos[o + 2], pos[o + 5], pos[o + 8]);
      const ia = cl(Math.floor((x0 - mx) * inv), nx), ib = cl(Math.floor((x1 - mx) * inv), nx);
      const ja = cl(Math.floor((y0 - my) * inv), ny), jb = cl(Math.floor((y1 - my) * inv), ny);
      const ka = cl(Math.floor((z0 - mz) * inv), nz), kb = cl(Math.floor((z1 - mz) * inv), nz);
      for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const idx = (k * ny + j) * nx + i;
        if (pass) list[fill[idx]++] = t; else cnt[idx + 1]++;
      }
      if ((t & 4095) === 4095) yield;
    }
    if (!pass) {
      for (let i = 0; i < ncell; i++) cnt[i + 1] += cnt[i];
      rec._list = new Int32Array(cnt[ncell]);
      rec._fill = cnt.slice(0, ncell);
      yield;
    }
  }
  rec.grid = { mx, my, mz, c, inv, nx, ny, nz, start: cnt, list: rec._list };
  rec._list = rec._fill = null;
}

// ------------------------------------------------------------------ module
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

export class LandmarkDamage {
  constructor(sys) {
    this.sys = sys;
    this.app = sys.app;
    this.items = [];
    this.frags = [];      // flying / toppling / sinking pieces
    this.emitters = [];
    this.res = { dist: 0, point: new THREE.Vector3(), ref: null };
    this._builder = null; // { rec, gen }
    this._fxSeen = -1;
    this.clock = 0;
    this.stats = { hits: 0, carves: 0, collapses: 0, gridMs: 0 };
    this._initRubble();
    this._installDebug();
  }

  // ---------------------------------------------------------------- rubble pool (instanced, ring buffer)
  _initRubble() {
    let g = new THREE.BoxGeometry(1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = Math.sin(i * 91.7 + p.getX(i) * 13.1 + p.getZ(i) * 7.3) * 43758.5453;
      const j = (h - Math.floor(h)) * 0.35;
      p.setXYZ(i, p.getX(i) * (1 - j * 0.6), p.getY(i) * (1 - j), p.getZ(i) * (1 - j * 0.4));
    }
    g = g.toNonIndexed();
    g.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.02 }), RUBBLE_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RUBBLE_CAP * 3), 3);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < RUBBLE_CAP; i++) mesh.setMatrixAt(i, zero);
    mesh.count = 1; // instance 0: degenerate, compiles the program up front
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = "landmark_rubble";
    this.rubble = mesh;
    this.rubbleNext = 1;
    this.app.scene.add(mesh);
  }

  _addRubble(x, y, z, size, r, g, b) {
    const i = this.rubbleNext;
    this.rubbleNext = i + 1 >= RUBBLE_CAP ? 1 : i + 1;
    if (this.rubble.count < RUBBLE_CAP) this.rubble.count++;
    _e.set(rr(-0.6, 0.6), rr(0, Math.PI * 2), rr(-0.6, 0.6));
    _q.setFromEuler(_e);
    _s.set(size * rr(0.6, 1.4), size * rr(0.35, 0.8), size * rr(0.6, 1.4));
    _m.compose(_v.set(x, y, z), _q, _s);
    this.rubble.setMatrixAt(i, _m);
    const v = rr(0.75, 1.1);
    this.rubble.instanceColor.setXYZ(i, r * v, g * v, b * v);
    this._rubbleDirty = true;
  }

  // ---------------------------------------------------------------- fx
  _fx() {
    const K = this.app.kaiju;
    try {
      if (K) { if (!K.fx) K.fx = new KaijuFx(K); return K.fx; }
      if (!this._ownFx) this._ownFx = new KaijuFx({ app: this.app, scene: this.app.scene, camera: this.app.camera });
      return this._ownFx;
    } catch (_) { return null; }
  }

  _emit(type, x, y, z, opts, life) {
    const fx = this._fx();
    if (!fx || !fx.addEmitter) return;
    while (this.emitters.length >= MAX_EMITTERS) { const o = this.emitters.shift(); o.h.stop && o.h.stop(); }
    opts.life = life;
    const h = fx.addEmitter(type, _v.set(x, y, z), opts);
    if (h) this.emitters.push({ h, until: this.clock + life });
  }

  // ---------------------------------------------------------------- registry
  /** Called by LandmarkSystem._build right after the LOD exists (before its first render). */
  register(it) {
    const L = it.L, lod = it.group;
    const U = makeUniforms();
    patchMaterial(it.mats.solid, U, "landmark-solid-dmg");
    patchMaterial(it.mats.glow, U, "landmark-glow-dmg");
    lod.updateMatrixWorld(true);
    const meshes = [];
    const bb = new THREE.Box3();
    lod.levels.forEach((lv, level) => {
      lv.object.traverse((o) => {
        if (!o.isMesh || !o.geometry.attributes.position) return;
        const geo = o.geometry;
        const pos = geo.attributes.position.array;
        const rec = { mesh: o, level, geo, pos, nt: pos.length / 9, dead: new Uint8Array(pos.length / 9), grid: null, main: o.parent.name === "main" };
        meshes.push(rec);
        if (level === 0) { _m.copy(o.parent.matrix); bb.union(geo.boundingBox.clone().applyMatrix4(_m)); }
      });
    });
    const deckY = L.deck ? L.deck.y : DECK_Y[L.id] ?? null;
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
    const axis = sx >= sz ? 0 : 2, len = Math.max(sx, sz), wid = Math.min(sx, sz);
    const nSec = len > 200 ? Math.max(2, Math.min(24, Math.round(len / 110))) : 1;
    const a0 = axis ? bb.min.z : bb.min.x;
    const secLen = len / nSec;
    const secs = [];
    for (let i = 0; i < nSec; i++) secs.push({ i, top: 0, hp: 1, dmg: 0, collapses: 0, dead: false, hx: 0, hz: 0, hw: 0, smoking: false, lastX: 0, lastZ: 0 });
    // section tops from the level-0 triangles (one pass)
    for (const r of meshes) {
      if (r.level) continue;
      const e = r.mesh.parent.matrix.elements, pos = r.pos;
      for (let o = 0; o < pos.length; o += 9) {
        const cx = (pos[o] + pos[o + 3] + pos[o + 6]) / 3, cy = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, cz = (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3;
        const ly = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
        const la = axis ? e[2] * cx + e[6] * cy + e[10] * cz + e[14] : e[0] * cx + e[4] * cy + e[8] * cz + e[12];
        const s = secs[Math.max(0, Math.min(nSec - 1, Math.floor((la - a0) / secLen)))];
        const ty = Math.max(pos[o + 1], pos[o + 4], pos[o + 7]) + e[13];
        if (ty > s.top) s.top = ty;
      }
    }
    for (const s of secs) {
      const h = Math.max(4, s.top - (deckY ?? 0));
      const foot = Math.sqrt(Math.max(1, wid * (nSec > 1 ? secLen : len)));
      s.hp = Math.min(30, Math.max(4, 3 + h / 16 + foot / 30));
    }
    const center = bb.getCenter(new THREE.Vector3());
    const wc = center.clone().applyMatrix4(lod.matrixWorld);
    const cols = [];
    for (const pieces of this.sys.chunkCols.values()) for (const p of pieces) if (p.landmark === L.id) cols.push(p);
    it.dmg = {
      it, U, meshes, bb, center, wc, radius: bb.getSize(_v).length() * 0.5, deckY, axis, a0, secLen, secs, cols,
      nBig: 0, nSmall: 0, hBig: 0, hSmall: 0, nextCarve: 0, gridReady: false,
    };
    this.items.push(it.dmg);
  }

  /** LandmarkSystem._clear: everything goes with the landmarks (origin change). */
  reset() {
    for (const f of this.frags) this._disposeFrag(f);
    this.frags.length = 0;
    for (const e of this.emitters) e.h.stop && e.h.stop();
    this.emitters.length = 0;
    this.items.length = 0;
    this._builder = null;
    this.rubble.count = 1;
    this.rubbleNext = 1;
  }

  // ---------------------------------------------------------------- coordinate helpers
  _toLocal(D, w, out) { _mi.copy(D.it.group.matrixWorld).invert(); return out.copy(w).applyMatrix4(_mi); }
  _secAt(D, lx, lz) {
    const a = D.axis ? lz : lx;
    return D.secs[Math.max(0, Math.min(D.secs.length - 1, Math.floor((a - D.a0) / D.secLen)))];
  }
  _ground(D, wx, wz) {
    let g = getChunkTerrainMeshElevation(wx, wz);
    if (!Number.isFinite(g)) g = D.it.baseY;
    const L = D.it.L;
    if (D.deckY != null) {
      _v3.set(wx, 0, wz);
      this._toLocal(D, _v3, _v3);
      const hw = L.deck ? L.deck.hw : D.bb.max.x * 0.45, hd = L.deck ? L.deck.hd : D.bb.max.z;
      if (Math.abs(_v3.x) < hw && Math.abs(_v3.z) < hd) g = Math.max(g, D.it.baseY + D.deckY);
    }
    return g;
  }

  // ---------------------------------------------------------------- hit testing
  _gridFor(rec) {
    if (rec.grid) return rec.grid;
    if (this._builder && this._builder.rec === rec) this._builder = null;
    const gen = gridBuilder(rec);
    while (!gen.next().done);
    return rec.grid;
  }

  _rayMesh(rec, ox, oy, oz, dx, dy, dz, best) {
    const G = this._gridFor(rec);
    const pos = rec.pos, dead = rec.dead;
    const x0 = G.mx, y0 = G.my, z0 = G.mz, x1 = x0 + G.nx * G.c, y1 = y0 + G.ny * G.c, z1 = z0 + G.nz * G.c;
    // clip to the grid box
    let t0 = 0, t1 = best;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let a = (x0 - ox) * ix, b = (x1 - ox) * ix; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b;
    a = (y0 - oy) * iy; b = (y1 - oy) * iy; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b;
    a = (z0 - oz) * iz; b = (z1 - oz) * iz; if (a > b) { const s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (!(t0 <= t1)) return -1;
    const c = G.c, inv = G.inv, nx = G.nx, ny = G.ny, nz = G.nz;
    const px = ox + dx * t0, py = oy + dy * t0, pz = oz + dz * t0;
    let i = Math.min(nx - 1, Math.max(0, Math.floor((px - x0) * inv)));
    let j = Math.min(ny - 1, Math.max(0, Math.floor((py - y0) * inv)));
    let k = Math.min(nz - 1, Math.max(0, Math.floor((pz - z0) * inv)));
    const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
    const tdx = Math.abs(c * ix), tdy = Math.abs(c * iy), tdz = Math.abs(c * iz);
    let tmx = dx !== 0 ? (x0 + (i + (dx > 0 ? 1 : 0)) * c - ox) * ix : Infinity;
    let tmy = dy !== 0 ? (y0 + (j + (dy > 0 ? 1 : 0)) * c - oy) * iy : Infinity;
    let tmz = dz !== 0 ? (z0 + (k + (dz > 0 ? 1 : 0)) * c - oz) * iz : Infinity;
    let hitT = best, hitTri = -1;
    const stamp = (this._stamp = (this._stamp || 0) + 1);
    if (!rec.stamp || rec.stamp.length !== rec.nt) rec.stamp = new Uint32Array(rec.nt);
    const st = rec.stamp;
    for (let guard = 0; guard < 2048; guard++) {
      const idx = (k * ny + j) * nx + i;
      for (let n = G.start[idx], e = G.start[idx + 1]; n < e; n++) {
        const t = G.list[n];
        if (st[t] === stamp || dead[t]) continue;
        st[t] = stamp;
        const o = t * 9;
        const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
        const e1x = pos[o + 3] - ax, e1y = pos[o + 4] - ay, e1z = pos[o + 5] - az;
        const e2x = pos[o + 6] - ax, e2y = pos[o + 7] - ay, e2z = pos[o + 8] - az;
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-9 && det < 1e-9) continue;
        const f = 1 / det;
        const sx = ox - ax, sy = oy - ay, sz = oz - az;
        const u = f * (sx * hx + sy * hy + sz * hz);
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = f * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) continue;
        const tt = f * (e2x * qx + e2y * qy + e2z * qz);
        if (tt > 0.05 && tt < hitT) { hitT = tt; hitTri = t; }
      }
      const tNext = Math.min(tmx, tmy, tmz);
      if (hitTri >= 0 && hitT <= tNext) break;
      if (tNext > t1) break;
      if (tmx === tNext) { i += si; if (i < 0 || i >= nx) break; tmx += tdx; }
      else if (tmy === tNext) { j += sj; if (j < 0 || j >= ny) break; tmy += tdy; }
      else { k += sk; if (k < 0 || k >= nz) break; tmz += tdz; }
    }
    if (hitTri < 0) return -1;
    this._hitT = hitT;
    return hitTri;
  }

  /** First landmark surface along a world ray (unit dir) closer than maxDist, or null. Result object is reused. */
  raycast(origin, dir, maxDist) {
    let best = maxDist > 0 ? maxDist : 1500, bD = null, bRec = null, bTri = -1;
    for (const D of this.items) {
      if (!D.it.group || !D.it.group.visible) continue;
      // bounding sphere reject
      const cx = D.wc.x - origin.x, cy = D.wc.y - origin.y, cz = D.wc.z - origin.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < -D.radius || along - D.radius > best) continue;
      const d2 = cx * cx + cy * cy + cz * cz - along * along;
      if (d2 > D.radius * D.radius) continue;
      for (const rec of D.meshes) {
        if (rec.level) continue;
        _mi.copy(rec.mesh.matrixWorld).invert();
        _o.copy(origin).applyMatrix4(_mi);
        _d.copy(dir).transformDirection(_mi);
        const t = this._rayMesh(rec, _o.x, _o.y, _o.z, _d.x, _d.y, _d.z, best);
        if (t >= 0 && this._hitT < best) { best = this._hitT; bD = D; bRec = rec; bTri = t; }
      }
    }
    if (!bD) return null;
    const r = this.res;
    r.dist = best;
    r.point.copy(origin).addScaledVector(dir, best);
    r.ref = { landmark: bD.it.L.id, D: bD, mr: bRec, tri: bTri }; // no `rec` / `key`: KaijuDestruction ignores this ref
    return r;
  }

  // ---------------------------------------------------------------- damage entry points
  /**
   * Weapon impact at world `p`. `hit.kind === 'landmark'` (from raycast) is a direct hit; any explosive impact
   * (splash > 0) also splashes landmarks within the radius.
   */
  impact(p, hit, units, splash) {
    if (!this.items.length || !(units > 0)) return;
    const direct = hit && hit.kind === "landmark" && hit.ref && hit.ref.D ? hit.ref.D : null;
    if (direct) this._hit(direct, p, units, splash, hit.ref);
    if (splash > 0) {
      for (const D of this.items) {
        if (D === direct || !D.it.group || p.distanceTo(D.wc) > D.radius + splash) continue;
        const dd = this._boxDist(D, p);
        if (dd > splash) continue;
        this._hit(D, p, units * 0.5 * (1 - dd / splash), splash, null);
      }
    }
  }

  /** KaijuDestruction.damageSphere: stomp / tail / body / missiles (amount 1 = one ordinary building). */
  kaijuSphere(x, y, z, r, amount, opts) {
    if (!this.items.length || !(r > 0) || !(amount > 0)) return;
    const kp = this._kp || (this._kp = new THREE.Vector3());
    kp.set(x, y, z);
    for (const D of this.items) {
      if (!D.it.group || kp.distanceTo(D.wc) > D.radius + r) continue;
      const dd = this._boxDist(D, kp);
      if (dd > r) continue;
      this._hit(D, kp, amount * KAIJU_UNITS * (1 - 0.5 * dd / r), Math.min(r * 0.6, 18), null, opts && opts.fire);
    }
  }

  /** KaijuDestruction.damageCone (breath): damage the landmarks the cone axis passes near. */
  kaijuCone(origin, dir, range, half, amount) {
    if (!this.items.length || !(range > 0)) return;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    for (const D of this.items) {
      if (!D.it.group) continue;
      const vx = D.wc.x - origin.x, vy = D.wc.y - origin.y, vz = D.wc.z - origin.z;
      const t = Math.max(0, Math.min(range, (vx * dir.x + vy * dir.y + vz * dir.z) / l));
      const kp = this._kp || (this._kp = new THREE.Vector3());
      kp.set(origin.x + (dir.x / l) * t, origin.y + (dir.y / l) * t, origin.z + (dir.z / l) * t);
      const spread = t * Math.tan(half) + 6;
      if (kp.distanceTo(D.wc) > D.radius + spread || this._boxDist(D, kp) > spread) continue;
      this._hit(D, kp, amount * KAIJU_UNITS, Math.min(spread, 16), null, true);
    }
  }

  _boxDist(D, w) {
    this._toLocal(D, w, _v3);
    const b = D.bb;
    const dx = Math.max(b.min.x - _v3.x, 0, _v3.x - b.max.x);
    const dy = Math.max(b.min.y - _v3.y, 0, _v3.y - b.max.y);
    const dz = Math.max(b.min.z - _v3.z, 0, _v3.z - b.max.z);
    return Math.hypot(dx, dy, dz);
  }

  _mark(D, p, radius) {
    const U = D.U;
    if (radius >= 1.2) {
      if (D.nBig === BIG_MARKS) this._bake(D, U.uLmBig.value[D.hBig]); // evicted scorch stays as darker vertex colours
      U.uLmBig.value[D.hBig].set(p.x, p.y, p.z, radius);
      D.hBig = (D.hBig + 1) % BIG_MARKS;
      D.nBig = Math.min(BIG_MARKS, D.nBig + 1);
      U.uLmNBig.value = D.nBig;
    } else {
      U.uLmSmall.value[D.hSmall].set(p.x, p.y, p.z, radius);
      D.hSmall = (D.hSmall + 1) % SMALL_MARKS;
      D.nSmall = Math.min(SMALL_MARKS, D.nSmall + 1);
      U.uLmNSmall.value = D.nSmall;
    }
  }

  /** Persist a scorch mark (world xyz, radius w) into the vertex colours of the level-0 meshes. */
  _bake(D, mk) {
    for (const rec of D.meshes) {
      if (rec.level || !rec.grid) continue;
      _mi.copy(rec.mesh.matrixWorld).invert();
      const m = _v3.set(mk.x, mk.y, mk.z).applyMatrix4(_mi);
      const G = rec.grid, r = mk.w, r2 = r * r, pos = rec.pos;
      const ca = rec.geo.attributes.color, col = ca.array;
      const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
      const ia = cl(Math.floor((m.x - r - G.mx) * G.inv), G.nx), ib = cl(Math.floor((m.x + r - G.mx) * G.inv), G.nx);
      const ja = cl(Math.floor((m.y - r - G.my) * G.inv), G.ny), jb = cl(Math.floor((m.y + r - G.my) * G.inv), G.ny);
      const ka = cl(Math.floor((m.z - r - G.mz) * G.inv), G.nz), kb = cl(Math.floor((m.z + r - G.mz) * G.inv), G.nz);
      const stamp = (this._stamp = (this._stamp || 0) + 1);
      if (!rec.stamp || rec.stamp.length !== rec.nt) rec.stamp = new Uint32Array(rec.nt);
      let lo = Infinity, hi = -1;
      for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const idx = (k * G.ny + j) * G.nx + i;
        for (let n = G.start[idx], e = G.start[idx + 1]; n < e; n++) {
          const t = G.list[n];
          if (rec.stamp[t] === stamp) continue;
          rec.stamp[t] = stamp;
          for (let v = t * 9; v < t * 9 + 9; v += 3) {
            const dx = pos[v] - m.x, dy = pos[v + 1] - m.y, dz = pos[v + 2] - m.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2) continue;
            const f = 0.4 + 0.6 * Math.sqrt(d2 / r2);
            col[v] *= f; col[v + 1] *= f; col[v + 2] *= f;
            if (t < lo) lo = t;
            if (t > hi) hi = t;
          }
        }
      }
      if (hi >= 0) {
        ca.addUpdateRange(lo * 9, (hi - lo + 1) * 9);
        ca.needsUpdate = true;
      }
    }
  }

  _hit(D, p, units, splash, ref, fire) {
    this.stats.hits++;
    const lp = this._toLocal(D, p, new THREE.Vector3());
    const s = this._secAt(D, lp.x, lp.z);
    const big = splash > 0;
    const scale = 1 + Math.min(1.2, (D.it.stats ? D.it.stats.modelHeight : 100) / 500);
    this._mark(D, p, big ? Math.min(14, splash * 0.42 * scale) : 0.55 + Math.random() * 0.25);
    const fx = this._fx();
    if (fx && ref) {
      fx.spawn("spark", p, { count: big ? 6 : 3, scale: 0.8 });
      if (big) fx.spawn("dust", p, { count: 4, scale: 0.6 * scale, life: 4 });
      else if (Math.random() < 0.35) fx.spawn("smoke", p, { count: 1, scale: 0.25, light: true, life: 2, speed: 1 });
    }
    if (s.dead) return;
    s.dmg += units;
    s.hx += lp.x * units; s.hz += lp.z * units; s.hw += units;
    s.lastX = lp.x; s.lastZ = lp.z;
    const f = s.dmg / s.hp;
    let mx = 0;
    for (const q of D.secs) if (!q.dead) mx = Math.max(mx, q.dmg / q.hp + q.collapses * 0.5);
    D.U.uLmDmg.value = Math.min(1.5, mx);
    if (f >= 1) { this._collapse(D, s, p); return; }
    if ((big || units >= 0.9) && f >= CARVE_F && this.clock >= D.nextCarve) {
      D.nextCarve = this.clock + 0.25;
      this._carve(D, p, lp, Math.min(9, Math.max(2.2, (splash || 6) * 0.45) * scale), ref);
    }
    if (f >= SMOKE_F && !s.smoking) {
      s.smoking = true;
      this._emit("smoke", p.x, p.y, p.z, { rate: 2.5, radius: 3 * scale, scale: 0.9 * scale }, 40);
      if (fire || big) this._emit("fire", p.x, p.y, p.z, { rate: 6, radius: 2 * scale, scale: 0.6 * scale }, 14);
    }
  }

  // ---------------------------------------------------------------- triangle surgery
  _kill(rec, tris) {
    const pos = rec.pos;
    let lo = Infinity, hi = -1;
    for (const t of tris) {
      const o = t * 9;
      pos[o + 3] = pos[o + 6] = pos[o];
      pos[o + 4] = pos[o + 7] = pos[o + 1];
      pos[o + 5] = pos[o + 8] = pos[o + 2];
      rec.dead[t] = 1;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    if (hi < 0) return;
    const a = rec.geo.attributes.position;
    a.addUpdateRange(lo * 9, (hi - lo + 1) * 9);
    a.needsUpdate = true;
  }

  /** New geometry from `tris` of rec, positions relative to (ox, oy, oz) (mesh space). Call before _kill. */
  _extract(rec, tris, ox, oy, oz, darken) {
    const n = tris.length;
    const P = new Float32Array(n * 9), N = new Float32Array(n * 9), C = new Float32Array(n * 9);
    const sp = rec.pos, sn = rec.geo.attributes.normal.array, sc = rec.geo.attributes.color.array;
    let k = 0;
    for (const t of tris) {
      const o = t * 9;
      for (let v = 0; v < 9; v += 3) {
        P[k + v] = sp[o + v] - ox; P[k + v + 1] = sp[o + v + 1] - oy; P[k + v + 2] = sp[o + v + 2] - oz;
        N[k + v] = sn[o + v]; N[k + v + 1] = sn[o + v + 1]; N[k + v + 2] = sn[o + v + 2];
        C[k + v] = sc[o + v] * darken; C[k + v + 1] = sc[o + v + 1] * darken; C[k + v + 2] = sc[o + v + 2] * darken;
      }
      k += 9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(N, 3));
    g.setAttribute("color", new THREE.BufferAttribute(C, 3));
    const la = rec.geo.attributes.lmA; // [lm-materials] library material id / baked AO travel with the debris
    if (la) { const A = new Float32Array(n * 9), sa = la.array; let q = 0; for (const t of tris) { A.set(sa.subarray(t * 9, t * 9 + 9), q); q += 9; } g.setAttribute("lmA", new THREE.BufferAttribute(A, 3)); }
    g.computeBoundingSphere();
    return g;
  }

  _protectY(D) { return D.deckY != null ? D.deckY + 2.5 : 0.8; }

  /** Chunk breaks off around world p (local lp): the model's own triangles inside the sphere fly away. */
  _carve(D, p, lp, r, ref) {
    this.stats.carves++;
    const fx = this._fx();
    const protect = this._protectY(D);
    const lodM = D.it.group.matrixWorld;
    let made = false;
    if (lp.y > protect) {
      for (const rec of D.meshes) {
        if (rec.level) continue;
        _mi.copy(rec.mesh.parent.matrix).invert();
        const m = _v2.copy(lp).applyMatrix4(_mi); // mesh space
        const G = this._gridFor(rec);
        const tris = [];
        const pos = rec.pos, r2 = r * r, maxE2 = (2.6 * r) * (2.6 * r);
        const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
        const ia = cl(Math.floor((m.x - r - G.mx) * G.inv), G.nx), ib = cl(Math.floor((m.x + r - G.mx) * G.inv), G.nx);
        const ja = cl(Math.floor((m.y - r - G.my) * G.inv), G.ny), jb = cl(Math.floor((m.y + r - G.my) * G.inv), G.ny);
        const ka = cl(Math.floor((m.z - r - G.mz) * G.inv), G.nz), kb = cl(Math.floor((m.z + r - G.mz) * G.inv), G.nz);
        const stamp = (this._stamp = (this._stamp || 0) + 1);
        if (!rec.stamp || rec.stamp.length !== rec.nt) rec.stamp = new Uint32Array(rec.nt);
        const py0 = protect - rec.mesh.parent.position.y;
        outer: for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
          const idx = (k * G.ny + j) * G.nx + i;
          for (let n = G.start[idx], e = G.start[idx + 1]; n < e; n++) {
            const t = G.list[n];
            if (rec.stamp[t] === stamp || rec.dead[t]) continue;
            rec.stamp[t] = stamp;
            const o = t * 9;
            const cx = (pos[o] + pos[o + 3] + pos[o + 6]) / 3, cy = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, cz = (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3;
            if (cy < py0) continue;
            const ddx = cx - m.x, ddy = cy - m.y, ddz = cz - m.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz > r2) continue;
            const e1 = (pos[o + 3] - pos[o]) ** 2 + (pos[o + 4] - pos[o + 1]) ** 2 + (pos[o + 5] - pos[o + 2]) ** 2;
            const e2 = (pos[o + 6] - pos[o]) ** 2 + (pos[o + 7] - pos[o + 1]) ** 2 + (pos[o + 8] - pos[o + 2]) ** 2;
            if (e1 > maxE2 || e2 > maxE2) continue; // big wall faces stay (scorch shows the blast)
            tris.push(t);
            if (tris.length >= MAX_TRIS_PER_CHUNK) break outer;
          }
        }
        if (tris.length < 4) continue;
        const geo = this._extract(rec, tris, m.x, m.y, m.z, 0.72);
        this._kill(rec, tris);
        const mesh = new THREE.Mesh(geo, rec.mesh.material);
        mesh.castShadow = true;
        const piv = new THREE.Object3D();
        _v3.set(m.x, m.y, m.z).applyMatrix4(rec.mesh.matrixWorld);
        piv.position.copy(_v3);
        rec.mesh.getWorldQuaternion(piv.quaternion);
        piv.add(mesh);
        this.app.scene.add(piv);
        // outward: away from the landmark's vertical axis, plus up
        const lc = D.center;
        _v.set(lp.x - lc.x, 0, lp.z - lc.z);
        if (_v.lengthSq() < 1e-3) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        _v.normalize().transformDirection(lodM);
        const sp = rr(7, 15);
        this._pushFrag({
          kind: "chunk", piv, mesh, D,
          vx: _v.x * sp + rr(-3, 3), vy: rr(4, 10), vz: _v.z * sp + rr(-3, 3),
          ax: rr(-1, 1), ay: rr(-1, 1), az: rr(-1, 1), w: rr(1.5, 4), t: 0, sink: 0, ground: null,
        });
        made = true;
      }
    }
    if (fx) {
      const c = this._sampleColor(ref);
      fx.spawn("debris", p, { count: made ? 6 : 10, scale: 0.9, color: c });
      fx.spawn("dust", p, { count: 6, scale: 0.8, life: 6 });
      fx.spawn("smoke", p, { count: 2, scale: 0.6, life: 7, speed: 2 });
    }
  }

  _sampleColor(ref) {
    if (!ref || !ref.mr) return _col.setRGB(0.55, 0.52, 0.48);
    const a = ref.mr.geo.attributes.color.array, o = ref.tri * 9;
    return _col.setRGB(a[o], a[o + 1], a[o + 2]);
  }

  _pushFrag(f) {
    let chunks = 0;
    for (const q of this.frags) if (q.kind === "chunk") chunks++;
    if (f.kind === "chunk" && chunks >= MAX_DEBRIS) {
      const old = this.frags.find((q) => q.kind === "chunk");
      if (old) { this._disposeFrag(old); this.frags.splice(this.frags.indexOf(old), 1); }
    }
    this.frags.push(f);
  }

  _disposeFrag(f) {
    if (f.piv.parent) f.piv.parent.remove(f.piv);
    f.mesh.geometry.dispose();
  }

  // ---------------------------------------------------------------- collapse
  _collapse(D, s, p) {
    this.stats.collapses++;
    const protect = D.deckY != null ? D.deckY + 3 : 0;
    const top = s.top;
    const first = s.collapses === 0;
    const cut = Math.max(protect + 2, top * (first ? rr(0.4, 0.55) : rr(0.12, 0.22)));
    s.collapses++;
    s.dmg = 0;
    s.hp *= 0.75;
    s.smoking = false;
    if (s.collapses >= 2 || top - cut < 6) s.dead = true;
    if (top - cut < 4) return;
    const jag = Math.min(14, Math.max(1.5, (top - cut) * 0.06));
    // region (lod space): the whole landmark, or the stretch of the long axis around the damage centroid
    const multi = D.secs.length > 1;
    const hc = s.hw > 0 ? (D.axis ? s.hz : s.hx) / s.hw : D.a0 + (s.i + 0.5) * D.secLen;
    const ra = hc - D.secLen * 0.5, rb = hc + D.secLen * 0.5;
    const thAt = (x, z) => cut + jag * (Math.sin(x * 0.37 + z * 0.11) * 0.6 + Math.sin(z * 0.29 - x * 0.17) * 0.4);
    let upperTris = 0;
    const pieces = [];
    for (const rec of D.meshes) {
      const e = rec.mesh.parent.matrix.elements, pos = rec.pos, dead = rec.dead;
      const tris = [];
      let lo = Infinity, hi = -1;
      for (let t = 0, o = 0; t < rec.nt; t++, o += 9) {
        if (dead[t]) continue;
        const cx = (pos[o] + pos[o + 3] + pos[o + 6]) / 3, cy = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, cz = (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3;
        const lx = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
        const ly = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
        const lz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
        if (multi) { const a = D.axis ? lz : lx; if (a < ra || a > rb) continue; }
        if (ly > thAt(lx, lz)) { tris.push(t); continue; }
        // kept triangle reaching above the break (tall wall faces): squash its upper vertices onto the break line
        for (let v = o; v < o + 9; v += 3) {
          const vx = e[0] * pos[v] + e[4] * pos[v + 1] + e[8] * pos[v + 2] + e[12];
          const vz = e[2] * pos[v] + e[6] * pos[v + 1] + e[10] * pos[v + 2] + e[14];
          const vy = pos[v + 1] + e[13], th = thAt(vx, vz);
          if (vy > th) { pos[v + 1] = th - e[13]; if (t < lo) lo = t; if (t > hi) hi = t; }
        }
      }
      if (hi >= 0) {
        const a = rec.geo.attributes.position;
        a.addUpdateRange(lo * 9, (hi - lo + 1) * 9);
        a.needsUpdate = true;
      }
      if (!tris.length) continue;
      if (rec.level === 0) pieces.push({ rec, tris });
      else this._kill(rec, tris);
      upperTris += tris.length;
    }
    s.top = cut;
    // topple direction (lod space): away from the last hit, across the long axis for long landmarks
    const cxL = multi ? (D.axis ? D.center.x : hc) : D.center.x, czL = multi ? (D.axis ? hc : D.center.z) : D.center.z;
    _v.set(cxL - s.lastX, 0, czL - s.lastZ);
    if (multi) { if (D.axis) _v.z = 0; else _v.x = 0; }
    if (_v.lengthSq() < 1e-4) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    _v.normalize();
    const dirL = _v.clone();
    const halfW = multi ? Math.min(D.bb.max.x - D.bb.min.x, D.bb.max.z - D.bb.min.z) * 0.25 : Math.max(D.bb.max.x - D.bb.min.x, D.bb.max.z - D.bb.min.z) * 0.18;
    const hingeL = new THREE.Vector3(cxL + dirL.x * halfW, cut, czL + dirL.z * halfW);
    const lodM = D.it.group.matrixWorld;
    const hingeW = hingeL.clone().applyMatrix4(lodM);
    const dirW = dirL.clone().transformDirection(lodM);
    const H = Math.max(6, top - cut);
    for (const { rec, tris } of pieces) {
      // geometry relative to the hinge, in mesh space
      _mi.copy(rec.mesh.parent.matrix).invert();
      const hm = hingeL.clone().applyMatrix4(_mi);
      const geo = this._extract(rec, tris, hm.x, hm.y, hm.z, 0.85);
      geo.computeBoundingBox();
      this._kill(rec, tris);
      const mesh = new THREE.Mesh(geo, rec.mesh.material);
      mesh.castShadow = true;
      const piv = new THREE.Object3D();
      piv.position.copy(hingeW);
      const q0 = new THREE.Quaternion();
      rec.mesh.getWorldQuaternion(q0);
      piv.quaternion.copy(q0);
      piv.add(mesh);
      this.app.scene.add(piv);
      this.frags.push({
        kind: "topple", piv, mesh, D, q0, axis: new THREE.Vector3(dirW.z, 0, -dirW.x).normalize(), dir: dirW.clone(),
        th: 0.05, w: 0.08, H, y0: hingeW.y, drop: 0, vx: 0, vy: 0, vz: 0, t: 0, phase: 0, landed: -1, sinkD: 10,
        mid: geo.boundingBox.getCenter(new THREE.Vector3()),
      });
    }
    // colliders: nothing stands above the cut any more
    const cutW = D.it.baseY + cut;
    for (const c of D.cols) {
      if (multi) {
        _v3.set((c.minX + c.maxX) * 0.5, 0, (c.minZ + c.maxZ) * 0.5);
        this._toLocal(D, _v3, _v3);
        const a = D.axis ? _v3.z : _v3.x;
        if (a < ra - 10 || a > rb + 10) continue;
      }
      if (c.h > cutW) c.h = Math.max(D.it.baseY + protect, cutW - jag);
    }
    // dust, debris, fire, smoke and rubble
    const fx = this._fx();
    const g = this._ground(D, hingeW.x, hingeW.z);
    const scale = Math.min(6, 1 + H / 40);
    const stumpW = _v2.set(cxL, cut, czL).applyMatrix4(lodM);
    if (fx) {
      fx.spawn("bigExplosion", stumpW, { scale: Math.min(2.2, 0.6 + H / 120) });
      fx.spawn("debris", stumpW, { count: 18, scale: scale * 0.7, color: this._sampleColor(pieces[0] ? { mr: pieces[0].rec, tri: pieces[0].tris[0] } : null) });
      fx.spawn("dust", stumpW, { count: 16, scale: scale * 0.8 });
    }
    this._emit("fire", stumpW.x, stumpW.y, stumpW.z, { rate: 10, radius: Math.min(16, halfW * 0.8 + 2), scale: Math.min(3, 0.8 + H / 80) }, 22);
    this._emit("smoke", stumpW.x, stumpW.y + 4, stumpW.z, { rate: 4, radius: Math.min(20, halfW + 3), scale: Math.min(4, 1.3 + H / 60) }, 70);
    this._emit("smoke", stumpW.x, g + 2, stumpW.z, { rate: 3, radius: Math.min(40, halfW * 2 + 6), scale: Math.min(4, 1.2 + H / 70) }, 50);
    // rubble on the stump and around the base, coloured like the model
    const pc = this._sampleColor(pieces[0] ? { mr: pieces[0].rec, tri: pieces[0].tris[(pieces[0].tris.length / 2) | 0] } : null);
    const nR = Math.min(140, 20 + Math.round(H * 0.5 + upperTris / 900));
    const spread = Math.max(8, halfW * 1.6);
    for (let i = 0; i < nR; i++) {
      const a = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * spread;
      const onStump = i < nR * 0.25;
      _v3.set(cxL + Math.cos(a) * rad * (onStump ? 0.35 : 1), 0, czL + Math.sin(a) * rad * (onStump ? 0.35 : 1)).applyMatrix4(lodM);
      const rx = _v3.x, rz = _v3.z;
      const gy = onStump ? D.it.baseY + cut - jag : this._ground(D, rx, rz);
      const sz = rr(0.8, 2.2) * Math.min(3, 1 + H / 100);
      const dark = Math.random() < 0.4 ? 0.35 : 1;
      this._addRubble(rx, gy + sz * 0.2, rz, sz, pc.r * dark, pc.g * dark, pc.b * dark);
    }
    this.app.kaiju?.shake?.(0.8, stumpW.x, stumpW.y, stumpW.z);
    if (this.app.kaiju?.crowd?.addThreat) this.app.kaiju.crowd.addThreat(stumpW.x, stumpW.z, halfW + 80, 6);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    const fx = this.items.length || this.frags.length ? this._fx() : null;
    if (fx) {
      if (fx.time === this._fxSeen) { try { fx.update(dt); } catch (_) { /* fx optional */ } }
      this._fxSeen = fx.time;
    }
    this._updateFrags(dt);
    this._buildGrids();
    if (this.emitters.length) {
      let k = 0;
      for (const e of this.emitters) if (e.until > this.clock) this.emitters[k++] = e;
      this.emitters.length = k;
    }
    if (this._rubbleDirty) {
      this._rubbleDirty = false;
      this.rubble.instanceMatrix.needsUpdate = true;
      this.rubble.instanceColor.needsUpdate = true;
    }
  }

  _updateFrags(dt) {
    const fx = this._fx();
    let w = 0;
    for (const f of this.frags) {
      f.t += dt;
      let keep = true;
      const P = f.piv.position;
      if (f.kind === "chunk") {
        if (f.ground === null) {
          f.vy -= GRAV * dt;
          P.x += f.vx * dt; P.y += f.vy * dt; P.z += f.vz * dt;
          _v.set(f.ax, f.ay, f.az).normalize();
          _q.setFromAxisAngle(_v, f.w * dt);
          f.piv.quaternion.premultiply(_q);
          const g = this._ground(f.D, P.x, P.z);
          if (P.y <= g + 0.4 || f.t > 12) {
            f.ground = g;
            if (fx && f.t < 12) fx.spawn("dustRing", P, { scale: 0.35, count: 10 });
          }
        } else {
          f.sink += dt;
          P.y -= dt * 0.7;
          if (f.sink > 5) keep = false;
        }
      } else {
        // topple: inverted-pendulum fall about the hinge, then free fall to the ground, crash, settle and sink away
        if (f.phase === 0) {
          f.w += (1.5 * GRAV / f.H) * Math.sin(f.th) * dt;
          f.th += f.w * dt;
          f.vy -= GRAV * 0.25 * dt; // the base slides down into the stump as it goes
          f.drop = Math.max(f.drop + f.vy * dt, -f.H * 0.3);
          P.y = f.y0 + f.drop;
          if (f.th >= 0.85) {
            // leaves the hinge: centre of the piece keeps its swing velocity
            f.phase = 1;
            const v = f.w * f.H * 0.5;
            f.vx = f.dir.x * Math.cos(f.th) * v; f.vz = f.dir.z * Math.cos(f.th) * v;
            f.vy = f.vy - Math.sin(f.th) * v;
          }
        } else if (f.phase === 1) {
          f.vy -= GRAV * dt;
          P.x += f.vx * dt; P.y += f.vy * dt; P.z += f.vz * dt;
          f.w *= 1 - 0.6 * dt;
          f.th = Math.min(1.62, f.th + f.w * dt);
        } else {
          const since = f.t - f.landed;
          if (since > 2.5) {
            P.y -= (f.sinkD / 12) * dt;
            if (since > 14.5) keep = false;
          }
        }
        _q.setFromAxisAngle(f.axis, f.th);
        f.piv.quaternion.copy(f.q0).premultiply(_q);
        if (f.phase < 2) {
          // lowest corner of the rotated bounds vs the ground under the piece's centre
          const bb = f.mesh.geometry.boundingBox;
          let low = Infinity;
          for (let c = 0; c < 8; c++) {
            _v.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyQuaternion(f.piv.quaternion);
            if (_v.y < low) low = _v.y;
          }
          _v.copy(f.mid).applyQuaternion(f.piv.quaternion).add(P);
          const cx = _v.x, cz = _v.z;
          const g = this._ground(f.D, cx, cz);
          if (P.y + low <= g + 0.5 || f.t > 20) {
            f.phase = 2;
            f.landed = f.t;
            P.y = Math.max(P.y, g - low - 0.5);
            const thick = (bb.max.x - bb.min.x + bb.max.z - bb.min.z) * 0.25;
            f.sinkD = Math.max(8, Math.min(f.H, thick * 1.5 + 6));
            const s = Math.min(6, 1 + f.H / 35);
            const tipX = cx + f.dir.x * f.H * 0.5, tipZ = cz + f.dir.z * f.H * 0.5;
            if (fx) {
              fx.spawn("dustRing", _v.set(cx, g, cz), { scale: s * 0.9 });
              fx.spawn("dust", _v.set(tipX, g, tipZ), { count: 22, scale: s });
              fx.spawn("dust", _v.set(cx, g, cz), { count: 18, scale: s * 0.9 });
              fx.spawn("debris", _v.set(cx, g + 2, cz), { count: 16, scale: s * 0.5 });
            }
            this._emit("dust", cx, g + 2, cz, { rate: 3, radius: f.H * 0.4, scale: Math.min(4, 1 + f.H / 50) }, 12);
            this.app.kaiju?.shake?.(1.0, cx, g, cz);
          }
        }
      }
      if (keep) this.frags[w++] = f;
      else this._disposeFrag(f);
    }
    this.frags.length = w;
  }

  /** Time-sliced hit-grid builds for nearby landmarks; grids of far ones are freed. */
  _buildGrids() {
    const cam = this.app.camera.position;
    const t0 = performance.now();
    if (!this._builder) {
      let best = null, bd = GRID_RANGE;
      for (const D of this.items) {
        const d = Math.hypot(D.wc.x - cam.x, D.wc.z - cam.z) - D.radius;
        if (d > GRID_DROP) {
          for (const r of D.meshes) r.grid = null, r.stamp = null;
          continue;
        }
        if (d > bd) continue;
        for (const r of D.meshes) if (!r.level && !r.grid) { best = r; bd = d; break; }
      }
      if (best) this._builder = { rec: best, gen: gridBuilder(best) };
    }
    while (this._builder && performance.now() - t0 < GRID_BUDGET_MS) {
      if (this._builder.gen.next().done) this._builder = null;
    }
    this.stats.gridMs += performance.now() - t0;
  }

  // ---------------------------------------------------------------- debug / verification
  _installDebug() {
    if (typeof window === "undefined") return;
    const self = this;
    window.__LMDMG__ = {
      self,
      state: (id) => {
        const D = self.items.find((d) => d.it.L.id === id);
        if (!D) return null;
        return { secs: D.secs.map((s) => ({ hp: +s.hp.toFixed(1), dmg: +s.dmg.toFixed(2), top: Math.round(s.top), collapses: s.collapses, dead: s.dead })), marks: D.nBig + D.nSmall, grids: D.meshes.filter((r) => r.grid).length + "/" + D.meshes.filter((r) => !r.level).length };
      },
      /** Damage landmark `id` at local height frac (0..1) from azimuth az: units, splash (m). */
      hitAt: (id, frac = 0.5, units = 1, splash = 10, az = 0, lx = null, lz = null) => {
        const D = self.items.find((d) => d.it.L.id === id);
        if (!D) return null;
        const it = D.it;
        const a = ((it.L.heading || 0) + az) * DEG;
        const tgt = lx == null ? D.wc.clone() : new THREE.Vector3(lx, 0, lz).applyMatrix4(it.group.matrixWorld);
        const top = lx == null ? D.bb.max.y : self._secAt(D, lx, lz).top;
        const ty = it.baseY + top * frac;
        const o = new THREE.Vector3(tgt.x + Math.sin(a) * 600, ty, tgt.z - Math.cos(a) * 600);
        const dir = new THREE.Vector3(tgt.x, ty, tgt.z).sub(o).normalize();
        const h = self.raycast(o, dir, 1400);
        if (!h) return null;
        const p = h.point.clone();
        self.impact(p, { kind: "landmark", ref: h.ref }, units, splash);
        return { x: p.x, y: p.y, z: p.z, dist: h.dist };
      },
    };
  }
}
