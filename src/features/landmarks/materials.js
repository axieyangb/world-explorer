/**
 * [lm-materials] Procedural material library for the hand-built landmarks (no downloaded textures).
 *
 * - Every Kit triangle carries a library material id (attribute `lmA.x`), picked explicitly (`k.mat("marble")`,
 *   `k.color(hex, "gold")`) or mapped from the model's flat colour through material_map.js (per-model table, then
 *   a colour heuristic). The shader keeps the vertex colour as the base tint and adds the material's surface:
 *   stone coursing + joints (travertine, limestone, sandstone, marble, granite), brick, board-formed concrete,
 *   painted / rusted metal, glass curtain wall with mullions + spandrels (sky reflection from the reflection
 *   probe), gold leaf, copper patina, terracotta tile, slate, lead, stucco, stainless, stained glass, wood.
 * - No UVs: model-space mapping. Structural patterns (coursing, mullions, tiles) are projected along each facet's
 *   normal in a gravity-aligned frame (exact on planar faces of any orientation, courses stay horizontal);
 *   weathering (stains, grime, ledge dirt) is triplanar, so it runs on seamlessly across facets and curves.
 *   Joints / tiles also perturb the normal (bump from the procedural height).
 *   Pattern contrast fades with the pixel footprint, so far landmarks don't shimmer.
 * - Weathering: soot near the base, rain streaks (stronger below ledges), and ambient occlusion baked per vertex
 *   from the geometry (`lmA.y` = AO, `lmA.z` = "under a ledge"), via a coarse occupancy grid of the model.
 * - Night: lit windows on glass, glowing stained glass, and per-landmark floodlight / uplight gradients (colour,
 *   strength, falloff height) driven by the landmark system's night factor.
 * - The landmark damage shader patch (landmark_damage.js) chains after this one; debris copies `lmA`.
 */
import * as THREE from "../../../vendor/three.module.js";

export const MAT = {
  plain: 0, travertine: 1, limestone: 2, sandstone: 3, marble: 4, granite: 5, brick: 6, concrete: 7,
  painted: 8, rust: 9, glass: 10, gold: 11, copper: 12, terracotta: 13, slate: 14, stucco: 15, steel: 16,
  dark: 17, water: 18, foliage: 19, stained: 20, lead: 21, wood: 22,
};
export const STONES = ["travertine", "limestone", "sandstone", "marble", "granite"];

// ------------------------------------------------------------------ colour heuristic (fallback mapping)
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
/**
 * Library material for a flat model colour. `stone` = the model's default masonry (light neutral / warm colours),
 * `glow` = the triangle is in the night-glow bucket (lit windows / floodlit walls).
 */
export function classifyColor(hex, stone = "limestone", glow = false) {
  _c.setHex(hex).getHSL(_hsl);
  const h = _hsl.h * 360, s = _hsl.s, l = _hsl.l;
  if (l < 0.13) return glow ? MAT.dark : MAT.dark;
  if (s > 0.42 && h >= 38 && h <= 58 && l > 0.35) return MAT.gold;
  if (h >= 150 && h <= 185 && s > 0.18 && l > 0.3) return MAT.copper;
  if (h >= 70 && h < 150 && s > 0.2) return MAT.foliage;
  if (h >= 185 && h <= 215 && s > 0.45 && l > 0.3) return MAT.water;
  if (h >= 195 && h <= 235 && s > 0.08 && s <= 0.45 && l >= 0.55) return MAT.steel;
  if (h >= 195 && h <= 235 && s > 0.08 && l < 0.55) return MAT.slate;
  if ((h <= 22 || h >= 345) && s > 0.35 && l > 0.25 && l < 0.6) return s > 0.55 && l > 0.4 ? MAT.terracotta : MAT.brick;
  if (h > 22 && h < 38 && s > 0.45 && l < 0.5) return MAT.brick;
  if (s < 0.1 && l < 0.4) return MAT.slate;
  if (s < 0.08) return l > 0.75 ? MAT[stone] : MAT.concrete;
  if (l < 0.33) return MAT.wood;
  return MAT[stone];
}

// ------------------------------------------------------------------ baked occlusion (per vertex, time-sliced)
/**
 * Generator: rasterises every level-0 triangle into a coarse occupancy grid (model space), then casts a few short
 * rays per vertex to write ambient occlusion (lmA.y) and "under a ledge" (lmA.z) into each mesh's lmA attribute.
 * entries = [{ attr, pos, nrm, px, py, pz (part pivot), level }]. Yields every few thousand units of work so the
 * landmark system can spread it over frames; the landmark shows unoccluded until it finishes.
 */
function* occlusionJob(entries) {
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (const E of entries) {
    if (E.level) continue;
    const p = E.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] + E.px, y = p[i + 1] + E.py, z = p[i + 2] + E.pz;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
  }
  if (!Number.isFinite(mnx)) return;
  const pad = 2;
  mnx -= pad; mny -= pad; mnz -= pad; mxx += pad; mxy += pad; mxz += pad;
  const ex = mxx - mnx, ey = mxy - mny, ez = mxz - mnz;
  let c = Math.max(0.45, Math.cbrt((ex * ey * ez) / 3.5e6));
  let nx, ny, nz;
  for (;;) {
    nx = Math.ceil(ex / c); ny = Math.ceil(ey / c); nz = Math.ceil(ez / c);
    if (nx * ny * nz <= 4e6) break;
    c *= 1.1;
  }
  const ncell = nx * ny * nz;
  const occ = new Uint8Array(ncell);
  const inv = 1 / c, s2 = (c * 0.8) ** 2;
  const mark = (x, y, z) => { occ[(((x - mnx) * inv) | 0) + nx * ((((y - mny) * inv) | 0) + ny * (((z - mnz) * inv) | 0))] = 1; };
  const st = [];
  let work = 0;
  for (const E of entries) {
    if (E.level) continue;
    const p = E.pos, ox = E.px, oy = E.py, oz = E.pz;
    for (let t = 0; t < p.length; t += 9) {
      st.push(p[t] + ox, p[t + 1] + oy, p[t + 2] + oz, p[t + 3] + ox, p[t + 4] + oy, p[t + 5] + oz, p[t + 6] + ox, p[t + 7] + oy, p[t + 8] + oz);
      while (st.length) {
        const cz = st.pop(), cy = st.pop(), cx = st.pop(), bz = st.pop(), by = st.pop(), bx = st.pop(), az = st.pop(), ay = st.pop(), ax = st.pop();
        const ab = (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2;
        const bc = (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2;
        const ca = (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2;
        work++;
        if (ab < s2 && bc < s2 && ca < s2) {
          mark(ax, ay, az); mark(bx, by, bz); mark(cx, cy, cz);
          mark((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
          continue;
        }
        if (ab >= bc && ab >= ca) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
          st.push(ax, ay, az, mx, my, mz, cx, cy, cz, mx, my, mz, bx, by, bz, cx, cy, cz);
        } else if (bc >= ca) {
          const mx = (bx + cx) / 2, my = (by + cy) / 2, mz = (bz + cz) / 2;
          st.push(ax, ay, az, bx, by, bz, mx, my, mz, ax, ay, az, mx, my, mz, cx, cy, cz);
        } else {
          const mx = (cx + ax) / 2, my = (cy + ay) / 2, mz = (cz + az) / 2;
          st.push(ax, ay, az, bx, by, bz, mx, my, mz, mx, my, mz, bx, by, bz, cx, cy, cz);
        }
      }
      if (work > 6000) { work = 0; yield; }
    }
  }
  // ray directions in a local frame (z = normal): straight out + rings at 30 / 60 deg elevation
  const dirs = [[0, 0, 1]];
  const ring = (k, el, a0) => { for (let i = 0; i < k; i++) { const a = a0 + (i / k) * Math.PI * 2; dirs.push([Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)]); } };
  ring(6, 0.52, 0); ring(3, 1.05, 0.5);
  const R = Math.max(2 * c, Math.min(7, 7 * c));
  const S = Math.max(2, Math.ceil(R / c));
  const at = (x, y, z) => {
    const i = Math.floor((x - mnx) * inv), j = Math.floor((y - mny) * inv), k = Math.floor((z - mnz) * inv);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
    return occ[i + nx * (j + ny * k)];
  };
  const DS = Math.max(2, Math.ceil(6 / c));
  for (const E of entries) {
    const p = E.pos, nn = E.nrm, A = E.attr.array, nv = p.length / 3;
    let l0 = NaN, l1 = 0, l2 = 0, l3 = 0, l4 = 0, l5 = 0, la = 1, ld = 0;
    for (let v = 0; v < nv; v++) {
      const o = v * 3;
      const px = p[o] + E.px, py = p[o + 1] + E.py, pz = p[o + 2] + E.pz, ex = nn[o], ey = nn[o + 1], ez = nn[o + 2];
      // quads repeat their corners: reuse the previous vertex's result
      if (px === l0 && py === l1 && pz === l2 && ex === l3 && ey === l4 && ez === l5) { A[o + 1] = la; A[o + 2] = ld; continue; }
      let tx, ty, tz;
      if (Math.abs(ey) < 0.9) { tx = ez; ty = 0; tz = -ex; } else { tx = 0; ty = -ez; tz = ey; }
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = ey * tz - ez * ty, by = ez * tx - ex * tz, bz = ex * ty - ey * tx;
      const ox = px + ex * c * 1.05, oy = py + ey * c * 1.05, oz = pz + ez * c * 1.05;
      let occl = 0;
      for (const d of dirs) {
        const dx = tx * d[0] + bx * d[1] + ex * d[2], dy = ty * d[0] + by * d[1] + ey * d[2], dz = tz * d[0] + bz * d[1] + ez * d[2];
        for (let s = 1; s <= S; s++) {
          const q = s * c;
          if (at(ox + dx * q, oy + dy * q, oz + dz * q)) { occl += 1 - (s - 1) / S; break; }
        }
      }
      // big faces only have corner vertices: their AO would smear over the whole face, so it is toned down
      const t9 = ((v / 3) | 0) * 9;
      const L2 = Math.max((p[t9] - p[t9 + 3]) ** 2 + (p[t9 + 1] - p[t9 + 4]) ** 2 + (p[t9 + 2] - p[t9 + 5]) ** 2, (p[t9] - p[t9 + 6]) ** 2 + (p[t9 + 1] - p[t9 + 7]) ** 2 + (p[t9 + 2] - p[t9 + 8]) ** 2);
      const big = Math.min(1, 16 / Math.max(1, L2));
      const ao = 1 - (1 - Math.max(0.38, 1 - (occl / dirs.length) * 0.95)) * (0.25 + 0.75 * big);
      let drip = 0;
      if (Math.abs(ey) < 0.5) {
        const sx = px + ex * c * 1.6, sz = pz + ez * c * 1.6;
        for (let s = 1; s <= DS; s++) if (at(sx, py + s * c, sz)) { drip = 1 - (s - 1) / DS; break; }
      }
      A[o + 1] = ao; A[o + 2] = drip;
      l0 = px; l1 = py; l2 = pz; l3 = ex; l4 = ey; l5 = ez; la = ao; ld = drip;
      if ((v & 1023) === 1023) yield;
    }
    E.attr.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ shared noise texture
let _noise = null;
/** 256^2 tileable RGBA noise: r = fbm (8 cells/tile), g = fine value noise (64 cells), b = ridged (veins), a = 16-cell. */
export function noiseTexture() {
  if (_noise) return _noise;
  const N = 256, data = new Uint8Array(N * N * 4);
  const lattice = (cells, seed) => {
    const g = new Float32Array(cells * cells);
    let s = seed;
    for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; }
    return (x, y) => {
      const fx = (x / N) * cells, fy = (y / N) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[(ix % cells) + (iy % cells) * cells], b = g[((ix + 1) % cells) + (iy % cells) * cells];
      const c = g[(ix % cells) + ((iy + 1) % cells) * cells], d = g[((ix + 1) % cells) + ((iy + 1) % cells) * cells];
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    };
  };
  const o8 = lattice(8, 11), o16 = lattice(16, 23), o32 = lattice(32, 37), o64 = lattice(64, 51), v4 = lattice(4, 71), v8 = lattice(8, 91), v16 = lattice(16, 97);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (x + y * N) * 4;
    const f = o8(x, y) * 0.5 + o16(x, y) * 0.25 + o32(x, y) * 0.15 + o64(x, y) * 0.1;
    const rg = 1 - Math.abs(v4(x, y) * 0.6 + v8(x, y) * 0.3 + v16(x, y) * 0.1 - 0.5) * 2;
    data[i] = Math.round(f * 255);
    data[i + 1] = Math.round(o64(x, y) * 255);
    data[i + 2] = Math.round(Math.pow(Math.max(0, rg), 6) * 255);
    data[i + 3] = Math.round(o16(x, y) * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  _noise = t;
  return t;
}

// ------------------------------------------------------------------ shader
const GLSL_VERT_COMMON = `
attribute vec3 lmA;
varying vec3 vLmO;
varying vec3 vLmN;
varying vec3 vLmA;
varying float vLmH;
uniform float uLmBase;
`;
const GLSL_VERT = `
vLmO = transformed;
vLmN = objectNormal;
vLmA = lmA;
vLmH = (modelMatrix * vec4(transformed, 1.0)).y - uLmBase;
`;

const GLSL_FRAG_COMMON = `
uniform sampler2D uLmNoise;
uniform float uLmNight;
uniform vec3 uLmUp;
uniform vec3 uLmUpP;
uniform vec3 uLmWin;
varying vec3 vLmO;
varying vec3 vLmN;
varying vec3 vLmA;
varying float vLmH;
struct LmP { vec3 c; float h; float r; float m; float e; };
float lmH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 lmTex(vec2 p) { return texture2D(uLmNoise, p); }
// running-bond cells: x = distance to the nearest joint (m), y = cell hash, z = row, w = column
vec4 lmCells(vec2 uv, vec2 sz, float irr) {
  float row = floor(uv.y / sz.y);
  float off = mix(0.5 * mod(row, 2.0), lmH1(vec2(row, 3.7)), irr);
  float xs = uv.x / sz.x + off;
  float col = floor(xs);
  vec2 f = vec2(fract(xs) * sz.x, (uv.y / sz.y - row) * sz.y);
  vec2 d = min(f, sz - f);
  return vec4(min(d.x, d.y), lmH1(vec2(col, row)), row, col);
}
float lmJoint(float e, float jw, float fw) { return 1.0 - smoothstep(jw - fw * 0.5, jw + fw * 0.75, e); }

LmP lmStone(int id, vec2 uv, float top, float fw, vec2 ov) {
  vec2 sz = id == 1 ? vec2(1.25, 0.62) : id == 2 ? vec2(1.1, 0.52) : id == 3 ? vec2(0.92, 0.42) : id == 4 ? vec2(1.6, 0.8) : vec2(1.8, 0.9);
  float jw = id == 4 ? 0.006 : id == 5 ? 0.01 : 0.014;
  float vr = id == 3 ? 0.1 : id == 1 ? 0.05 : id == 4 ? 0.035 : 0.05;
  if (top > 0.5) { sz = sz.yy * vec2(1.8, 1.6); }
  vec4 cl = lmCells(uv, sz, top > 0.5 ? 1.0 : 0.85);
  float fd = 1.0 - smoothstep(sz.y * 0.08, sz.y * 0.32, fw);
  float j = lmJoint(cl.x, jw, fw) * fd;
  float bv = (cl.y - 0.5) * 2.0 * vr * fd;
  float mott = lmTex(uv * 0.11 + ov).r - 0.5;
  vec3 c = vec3(1.0 + bv + mott * 0.14);
  float h = -j;
  float r = 0.8;
  if (id == 1) {          // travertine: horizontal pits, eroded pockmarks, bedding
    if (fw < 0.12) {      // close-up only (skips the fetches further away)
      float pit = smoothstep(0.68, 0.74, lmTex(uv * vec2(0.9, 3.2) + ov + cl.y).g) * (1.0 - smoothstep(0.02, 0.08, fw));
      float pock = smoothstep(0.88, 0.93, lmTex(uv * 0.21 + ov * 3.0).a) * (1.0 - smoothstep(0.03, 0.12, fw));
      c *= 1.0 - pit * 0.18 - pock * 0.3; h -= pit * 0.25 + pock * 0.5;
    }
    c *= 1.0 + (lmTex(vec2(uv.x * 0.02, uv.y * 0.7) + ov).a - 0.5) * 0.12;
    c *= vec3(1.0, 0.985, 0.96);
  } else if (id == 2) {   // limestone: soft mottle
    c *= 1.0 + (lmTex(uv * 0.5 + ov).g - 0.5) * 0.08 * fd;
  } else if (id == 3) {   // sandstone: bedding stripes, warmer blocks
    float bed = sin(uv.y * 28.0 + lmTex(uv * 0.2 + ov).r * 9.0) * 0.5 + 0.5;
    c *= 1.0 - bed * 0.07 * fd;
    c *= mix(vec3(1.0), vec3(1.06, 0.96, 0.88), cl.y * 0.8);
  } else if (id == 4) {   // marble: veins, polished
    float vein = lmTex(uv * 0.07 + ov + cl.y * 0.37).b;
    c *= 1.0 - vein * 0.22;
    c *= vec3(1.0) + (lmTex(uv * 0.6 + ov).g - 0.5) * 0.05;
    r = 0.34;
  } else {                // granite: speckle
    if (fw < 0.05) {
      float sp = lmTex(uv * 2.7 + ov).g;
      c *= 1.0 + (sp - 0.5) * 0.38 * (1.0 - smoothstep(0.01, 0.05, fw));
      c *= 1.0 + (lmTex(uv * 9.0 + ov).g - 0.5) * 0.2 * (1.0 - smoothstep(0.004, 0.02, fw));
    }
    r = 0.6;
  }
  c = mix(c, c * 0.68, j);
  // far: the joints' average darkening
  c *= 1.0 - (1.0 - fd) * (jw * 2.0 / sz.y) * 0.5;
  return LmP(c, h, r, 0.0, 0.0);
}

LmP lmPattern(int id, vec2 uv, float top, float fw, vec2 ov) {
  if (id >= 1 && id <= 5) return lmStone(id, uv, top, fw, ov);
  if (id == 6) {   // brick (running bond), lighter mortar
    vec2 sz = vec2(0.24, 0.078);
    vec4 cl = lmCells(uv, sz, 0.0);
    float fd = 1.0 - smoothstep(0.012, 0.035, fw);
    float j = lmJoint(cl.x, 0.007, fw) * fd;
    float b = cl.y;
    vec3 c = vec3(1.0 + (b - 0.5) * 0.3 * fd) * (b > 0.88 ? 0.78 : 1.0) * mix(vec3(1.0), vec3(1.05, 0.95, 0.92), lmH1(cl.zw + 1.3) * fd);
    c *= 1.0 + (lmTex(uv * 0.15 + ov).r - 0.5) * 0.18;
    c = mix(c, vec3(1.35, 1.3, 1.22), j * 0.85);
    c *= 1.0 - (1.0 - fd) * 0.04;
    return LmP(c, -j, 0.86, 0.0, 0.0);
  }
  if (id == 7) {   // board-formed concrete: panel joints, tie holes, mottle
    vec2 sz = vec2(2.4, 1.2);
    vec4 cl = lmCells(uv, sz, 0.0);
    cl = lmCells(uv + vec2(0.5 * sz.x * mod(cl.z, 2.0), 0.0), sz, 0.0);
    float fd = 1.0 - smoothstep(0.08, 0.3, fw);
    float j = lmJoint(cl.x, 0.008, fw) * fd;
    vec2 q = mod(uv, sz) - sz * vec2(0.25, 0.5);
    vec2 q2 = mod(uv, sz) - sz * vec2(0.75, 0.5);
    float tie = (1.0 - smoothstep(0.02, 0.035, min(length(q), length(q2)))) * fd;
    vec3 c = vec3(1.0 + (cl.y - 0.5) * 0.08 + (lmTex(uv * 0.08 + ov).r - 0.5) * 0.24 + (lmTex(uv * 0.9 + ov).g - 0.5) * 0.06 * fd);
    c *= 1.0 - j * 0.25 - tie * 0.45;
    return LmP(c, -j * 0.5 - tie, 0.88, 0.0, 0.0);
  }
  if (id == 8 || id == 9) {   // painted / rusted metal: seams, chipped paint, rust blotches
    vec2 sz = vec2(3.0, 1.5);
    vec4 cl = lmCells(uv, sz, 0.0);
    float fd = 1.0 - smoothstep(0.1, 0.35, fw);
    float j = lmJoint(cl.x, 0.012, fw) * fd;
    float n = lmTex(uv * 0.12 + ov).r;
    float chip = smoothstep(0.66, 0.7, lmTex(uv * 0.55 + ov).g * 0.6 + n * 0.4) * fd;
    vec3 rust = vec3(1.25, 0.72, 0.45);
    vec3 c;
    float r, m;
    if (id == 8) {
      c = vec3(1.0 + (n - 0.5) * 0.12) * mix(vec3(1.0), rust * 0.6, chip);
      r = mix(0.5, 0.85, chip); m = mix(0.25, 0.1, chip);
    } else {
      float bl = smoothstep(0.35, 0.75, n);
      c = mix(vec3(1.0), rust * (0.75 + 0.3 * lmTex(uv * 0.7 + ov).g), bl) * (1.0 + (lmTex(uv * 2.0 + ov).g - 0.5) * 0.25 * fd);
      r = 0.85; m = 0.35;
    }
    c *= 1.0 - j * 0.35;
    return LmP(c, -j * 0.6 + chip * 0.1, r, m, 0.0);
  }
  if (id == 10) {  // glass curtain wall: mullions, floor spandrels, per-pane tint, lit rooms at night
    if (top > 0.5) return LmP(vec3(0.75), 0.0, 0.45, 0.6, 0.0);
    vec2 sz = vec2(1.5, 4.2);
    vec2 f = uv / sz;
    vec2 cell = floor(f), fr = fract(f) * sz;
    float fd = 1.0 - smoothstep(0.04, 0.14, fw);   // mullions resolvable
    float cf = 1.0 - smoothstep(0.5, 1.4, fw);     // panes resolvable
    vec2 d = min(fr, sz - fr);
    float mul = (1.0 - smoothstep(0.05, 0.05 + fw, min(d.x, d.y))) * fd;
    float span = (1.0 - smoothstep(0.9, 0.9 + fw, fr.y)) * cf;  // opaque spandrel panel at the slab
    float ph = lmH1(cell);
    vec3 c = mix(vec3(0.34 + (ph - 0.5) * 0.1), vec3(0.62), span);
    c = mix(c, vec3(1.1), mul);
    c = mix(vec3(0.4), c, cf);                     // far: the average of panes, spandrels and mullions
    float opq = max(mul, span);
    float r = mix(0.05 + ph * 0.05 * cf, 0.4, opq);
    float m = mix(0.9, 0.5, opq);
    float lit = step(0.7, lmH1(cell + 19.3)) * (0.45 + 0.55 * lmH1(cell + 3.3));
    float e = mix(0.11, lit * (1.0 - opq), cf);
    return LmP(c, -mul * 0.4, r, m, e);
  }
  if (id == 11) {  // gold leaf
    vec4 cl = lmCells(uv, vec2(0.11, 0.11), 0.3);
    float fd = 1.0 - smoothstep(0.004, 0.02, fw);
    vec3 c = vec3(1.0 + (cl.y - 0.5) * 0.1 * fd + (lmTex(uv * 0.3 + ov).r - 0.5) * 0.12);
    return LmP(c, 0.0, 0.2 + lmTex(uv * 0.5 + ov).g * 0.18, 1.0, 0.0);
  }
  if (id == 12 || id == 21) {  // copper patina / lead: standing seams, streaky patina
    float pitch = id == 12 ? 0.6 : 0.7;
    float u = uv.x / pitch;
    float fd = 1.0 - smoothstep(0.03, 0.12, fw);
    float seam = smoothstep(0.9, 1.0, abs(fract(u) - 0.5) * 2.0) * fd;
    float st = lmTex(vec2(uv.x * 0.25, uv.y * 0.015) + ov).r;
    float n = lmTex(uv * 0.1 + ov).r;
    vec3 c;
    if (id == 12) c = mix(vec3(1.0), vec3(0.72, 0.84, 0.86), smoothstep(0.4, 0.8, st)) * mix(vec3(1.0), vec3(0.85, 0.78, 0.62), smoothstep(0.62, 0.8, n) * 0.6);
    else c = vec3(1.0 + (st - 0.5) * 0.25 + (n - 0.5) * 0.12);
    c *= 1.0 + seam * 0.18;
    return LmP(c, seam, id == 12 ? 0.62 : 0.5, id == 12 ? 0.12 : 0.35, 0.0);
  }
  if (id == 13 || id == 14) {  // terracotta (barrel tiles) / slate (flat overlapping tiles)
    vec2 sz = id == 13 ? vec2(0.26, 0.34) : vec2(0.34, 0.2);
    if (top > 0.5) uv = uv.yx;
    vec4 cl = lmCells(uv, sz, id == 13 ? 0.0 : 0.5);
    float fd = 1.0 - smoothstep(sz.y * 0.1, sz.y * 0.45, fw);
    float fx = fract(uv.x / sz.x + (id == 13 ? 0.5 * mod(cl.z, 2.0) * 0.0 : 0.0));
    float fy = fract(uv.y / sz.y);
    float barrel = id == 13 ? sin(fract(uv.x / sz.x) * 3.14159) : 1.0;
    float edge = smoothstep(0.0, 0.18, fy);
    vec3 c = vec3(1.0 + (cl.y - 0.5) * (id == 13 ? 0.26 : 0.18) * fd);
    c *= mix(1.0, 0.72 + 0.28 * barrel, fd) * mix(1.0, 0.7 + 0.3 * edge, fd);
    if (id == 13) c *= mix(vec3(1.0), vec3(1.06, 0.94, 0.86), lmTex(uv * 0.2 + ov).r);
    c *= 1.0 + (lmTex(uv * 0.08 + ov).r - 0.5) * 0.15;
    return LmP(c, (barrel * 0.5 + edge * 0.5) * fd, id == 13 ? 0.72 : 0.5, id == 13 ? 0.0 : 0.08, 0.0);
  }
  if (id == 15) {  // stucco / render
    vec3 c = vec3(1.0 + (lmTex(uv * 0.06 + ov).r - 0.5) * 0.14 + (lmTex(uv * 1.3 + ov).g - 0.5) * 0.06 * (1.0 - smoothstep(0.01, 0.04, fw)));
    return LmP(c, lmTex(uv * 1.3 + ov).g * 0.3, 0.9, 0.0, 0.0);
  }
  if (id == 16) {  // stainless / brushed panels
    vec2 sz = vec2(1.5, 3.0);
    vec4 cl = lmCells(uv, sz, 0.0);
    float fd = 1.0 - smoothstep(0.05, 0.2, fw);
    float j = lmJoint(cl.x, 0.01, fw) * fd;
    float br = lmTex(vec2(uv.x * 3.0, uv.y * 0.05) + ov).g;
    vec3 c = vec3(1.0 + (br - 0.5) * 0.14 + (cl.y - 0.5) * 0.06 * fd) * (1.0 - j * 0.4);
    return LmP(c, -j, 0.28 + br * 0.1, 0.85, 0.0);
  }
  if (id == 20) {  // stained glass: leaded cells of coloured glass (glows at night)
    vec2 sz = vec2(0.32, 0.42);
    vec4 cl = lmCells(uv, sz, 0.35);
    float fd = 1.0 - smoothstep(0.02, 0.08, fw);
    float j = lmJoint(cl.x, 0.018, fw) * fd;
    float hh = cl.y;
    vec3 g = hh < 0.45 ? vec3(0.25, 0.4, 1.4) : hh < 0.7 ? vec3(1.5, 0.35, 0.3) : hh < 0.85 ? vec3(1.4, 1.1, 0.35) : vec3(0.4, 1.0, 0.5);
    g = mix(vec3(0.9, 0.85, 1.1), g, fd);
    return LmP(g * (1.0 - j * 0.85), -j, 0.12, 0.2, 1.0 - j);
  }
  if (id == 22) {  // wood planks
    vec4 cl = lmCells(uv.yx, vec2(2.4, 0.2), 0.7);
    float fd = 1.0 - smoothstep(0.02, 0.07, fw);
    float j = lmJoint(cl.x, 0.006, fw) * fd;
    float gr = lmTex(vec2(uv.x * 0.05, uv.y * 1.5) + ov + cl.y).r;
    vec3 c = vec3(1.0 + (cl.y - 0.5) * 0.25 * fd + (gr - 0.5) * 0.3) * (1.0 - j * 0.5);
    return LmP(c, -j, 0.75, 0.0, 0.0);
  }
  if (id == 19) return LmP(vec3(0.85 + lmTex(uv * 0.3 + ov).r * 0.3) * (0.9 + lmTex(uv * 2.0 + ov).g * 0.2), lmTex(uv * 2.0 + ov).g, 0.95, 0.0, 0.0);
  if (id == 18) return LmP(vec3(1.0), 0.0, 0.08, 0.3, 0.0);
  if (id == 17) return LmP(vec3(1.0), 0.0, 0.95, 0.0, 0.0);
  return LmP(vec3(1.0 + (lmTex(uv * 0.1 + ov).r - 0.5) * 0.1), 0.0, 0.75, 0.05, 0.0);
}

// how strongly weathering marks each material
float lmWeather(int id) {
  if (id == 10 || id == 20) return 0.25;
  if (id == 11) return 0.1;
  if (id == 9 || id == 16 || id == 17 || id == 18 || id == 19) return 0.3;
  if (id == 8 || id == 13 || id == 14 || id == 21) return 0.55;
  if (id == 7) return 1.2;
  return 1.0;
}

// triplanar sample of the noise texture (blend of the three axis projections, p in metres x scale)
vec4 lmTri(vec3 p, vec3 w) { return lmTex(p.zy) * w.x + lmTex(p.xz) * w.y + lmTex(p.xy) * w.z; }

LmP lmSurface() {
  int id = int(vLmA.x + 0.5);
  vec3 p = vLmO;
  vec3 n = normalize(vLmN);
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float fw = max(length(dpx), length(dpy));
  // structure (coursing, mullions, tiles) is projected along the facet normal in a gravity-aligned frame, so it
  // lies exactly on any planar face whatever its orientation; curved (smooth) surfaces use their facets
  vec3 fn = cross(dpx, dpy);
  fn = dot(fn, fn) > 1e-14 ? normalize(fn) : n;
  if (dot(fn, n) < 0.0) fn = -fn;
  vec3 ft = abs(fn.y) > 0.97 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), fn));
  vec3 fb = cross(fn, ft);
  vec2 uv = vec2(dot(p, ft), dot(p, fb));
  float top = step(0.8, fn.y);
  LmP s = lmPattern(id, uv, top, fw, vec2(0.37, 0.11));
  // weathering (triplanar, seamless across facets): large stains, soot at the base, rain streaks (stronger under
  // ledges: lmA.z), dirt on ledges, then the baked AO
  vec3 an = abs(n);
  vec3 w = pow(an, vec3(4.0));
  w /= (w.x + w.y + w.z);
  float wk = lmWeather(id);
  float stain = lmTri(p * 0.018, w).r - 0.5;
  float vert = 1.0 - smoothstep(0.45, 0.8, an.y);
  float hu = uv.x;
  float hsoot = (1.0 - smoothstep(0.0, 3.0 + 3.0 * lmTex(vec2(hu * 0.02, 0.3)).r, vLmH)) * 0.3;
  float sn = lmTex(vec2(hu * 0.09, p.y * 0.006)).r * 0.7 + lmTex(vec2(hu * 0.4, p.y * 0.02)).g * 0.3;
  float streak = smoothstep(0.5, 0.8, sn) * (0.07 + 0.42 * vLmA.z) * vert;
  float ledge = 0.0;
  if (vert < 0.99 && n.y > 0.0) ledge = (1.0 - vert) * smoothstep(0.45, 0.75, lmTri(p * 0.05, w).r) * 0.15;
  float dirt = clamp((hsoot + streak + ledge + max(-stain, 0.0) * 0.5) * wk, 0.0, 0.6);
  s.c *= 1.0 + max(stain, 0.0) * 0.25 * min(wk, 1.0);
  s.c *= mix(vec3(1.0), vec3(0.42, 0.39, 0.36), dirt);
  s.r = min(1.0, s.r + dirt * 0.2);
  s.c *= vLmA.y < 0.01 ? 1.0 : vLmA.y; // debris without lmA keeps full light
  return s;
}

vec3 lmPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// sky probe = specular reflections only (the scene lights do the diffuse), and only a trace of it on dielectrics
const LIGHTS_MAPS = THREE.ShaderChunk.lights_fragment_maps
  .replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "")
  .replace(
    "radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );",
    "radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * mix(0.12, 1.0, smoothstep(0.1, 0.6, metalnessFactor));"
  );

/**
 * Patch a landmark MeshStandardMaterial with the library. glow = the night-glow bucket material (its emission is
 * the textured albedo x emissive x emissiveIntensity). U = shared uniforms from landmarkUniforms().
 */
export function patchLandmarkMaterial(mat, U, glow) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + GLSL_VERT_COMMON)
      .replace("#include <project_vertex>", "#include <project_vertex>\n" + GLSL_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_FRAG_COMMON)
      .replace("#include <color_fragment>", "#include <color_fragment>\nLmP lmS = lmSurface();\ndiffuseColor.rgb *= lmS.c;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = lmS.r;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = lmS.m;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = lmPerturb(-vViewPosition, normal, vec2(dFdx(lmS.h), dFdy(lmS.h)) * 0.9, faceDirection);")
      .replace("#include <lights_fragment_maps>", LIGHTS_MAPS)
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n" +
          (glow
            ? "totalEmissiveRadiance = emissive * diffuseColor.rgb;\n"
            : "") +
          // floodlight / uplight: strongest at the foot, fading with height; vertical faces catch most of it
          "{ float lmNt = smoothstep(0.05, 0.6, uLmNight); // the factor idles a little above 0 by day\n" +
          "  float upv = 1.0 - 0.6 * smoothstep(0.5, 0.95, abs(normalize(vLmN).y));\n" +
          "  float upf = uLmUpP.y + (1.0 - uLmUpP.y) * exp(-max(vLmH, 0.0) / max(uLmUpP.x, 1.0));\n" +
          "  totalEmissiveRadiance += uLmUp * diffuseColor.rgb * upf * upv * lmNt;\n" +
          "  totalEmissiveRadiance += lmS.e * mix(uLmWin, uLmWin * diffuseColor.rgb * 3.0, step(19.5, vLmA.x) * step(vLmA.x, 20.5)) * lmNt; }"
      );
  };
  mat.customProgramCacheKey = () => (glow ? "lm-lib-glow" : "lm-lib-solid");
  mat.userData.lmLib = true;
}

/** Shared per-landmark uniforms. night = { up: hex, upK, upH, upBase, win: hex, winK } (see material_map.js). */
export function landmarkUniforms(night = {}, baseY = 0) {
  const up = new THREE.Color(night.up ?? 0xffd7a0).multiplyScalar(night.upK ?? 0);
  const win = new THREE.Color(night.win ?? 0xffd49a).multiplyScalar(night.winK ?? 1.1);
  return {
    uLmNoise: { value: noiseTexture() },
    uLmNight: { value: 0 },
    uLmUp: { value: up },
    uLmUpP: { value: new THREE.Vector3(night.upH ?? 30, night.upBase ?? 0.25, 0) },
    uLmWin: { value: win },
    uLmBase: { value: baseY },
  };
}

export { occlusionJob };
