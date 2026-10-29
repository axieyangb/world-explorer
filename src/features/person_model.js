// Shared person model (pedestrians + legacy player avatar fallback). Depends only on THREE.
// Local frame: +Z forward (face, shoe toes, cap brim), +Y up, feet at y = 0, about 1.75 m tall.
//
// The body is lofted from smooth elliptical cross-sections (rounded limbs, hands with thumbs, shoes with
// soles, a sculpted head with face, ears and nose, hair grown from the scalp). Every part carries:
//   part  rigid animation group for the legacy avatar (STATIC/LLEG/RLEG/LARM/RARM),
//   joint skeleton segment for the pedestrian vertex shader (J.*): thigh/shin/foot and upper arm/forearm
//         are separate so the shader can bend knees, ankles and elbows,
//   mat   colour slot, opt optional style bit (0 = always), rgb fixed colour (mat FIXED).
// All geometry is built in the rest pose (arms hanging, legs straight). PERSON_*_GLSL poses it per
// instance: a procedural walk/run gait (hip rotation, pelvis sway/drop, knee + ankle via two-bone IK with
// planted feet, counter-swinging arms with elbow bend, shoulder counter-rotation, torso lean, stabilised
// head, bob lowest at contact) plus idle poses (weight shift, looking around, crossed arms, phone, umbrella).
import * as THREE from '../../vendor/three.module.js';

export const PART = { STATIC: 0, LLEG: 1, RLEG: 2, LARM: 3, RARM: 4 };
export const MAT = { SKIN: 0, TOP: 1, PANTS: 2, FIXED: 3, HAIR: 4, ACC: 5 };
// Optional parts; style bitmask bit = 1 << (opt - 1). Bits 13+ are body/outfit switches read by the shader.
export const OPT = {
  HAIR_SHORT: 1, HAIR_LONG: 2, PONYTAIL: 3, CAP: 4, GLASSES: 5, BACKPACK: 6,
  BAG: 7, UMBRELLA: 8, COAT: 9, VNECK: 10, ZIPPER: 11, BEARD: 12,
  FEMALE: 13, SKIRT: 14, SHORTS: 15, TSHIRT: 16, WHITE_SHOES: 17, PHONE: 18, BUN: 19,
};
export const bit = (opt) => 1 << (opt - 1);
export const HIP_Y = 0.9;
export const SHOULDER_Y = 1.45;

// Skeleton segments (aInfo.w). TORSO blends pelvis -> chest by height, NECK blends chest -> head.
export const J = {
  TORSO: 0, NECK: 1, HEAD: 2, LTHIGH: 3, LSHIN: 4, LFOOT: 5, RTHIGH: 6, RSHIN: 7, RFOOT: 8,
  LUPPER: 9, LFORE: 10, RUPPER: 11, RFORE: 12, CHEST: 13, PELVIS: 14, SKIRT: 15,
};
// Rest skeleton (must match the GLSL constants below).
const HIP_X = 0.09, KNEE_Y = 0.48, ANKLE_Y = 0.08;
const SH_X = 0.2, SH_Y = 1.42, ELBOW_Y = 1.13, WRIST_Y = 0.88;
const HEAD_C = [0, 1.635, 0.012];
const HEAD_R = [0.084, 0.112, 0.1];

const DARK = [0.06, 0.05, 0.05];
const WHITE = [0.93, 0.92, 0.9];
const SHOE = [0.13, 0.13, 0.14];
const SOLE = [0.05, 0.05, 0.05];

// ---------------- geometry helpers (indexed, position + normal) ----------------
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
// Catmull-Rom resampling of key rows (every column interpolated), `sub` samples per key interval.
function resample(keys, sub) {
  if (sub <= 1) return keys;
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(keys.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) out.push(b.map((_, k) => cr(a[k], b[k], c[k], d[k], s / sub)));
  }
  out.push(keys[keys.length - 1]);
  return out;
}

// Tube along an axis with elliptical rings and pole caps. Rows: [t, rx, ra, rb, cx, cy/cz].
//   axis 'y': ring in XZ at y = t, x half-width rx, +Z half-depth ra, -Z half-depth rb, centre (cx, cz).
//   axis 'z': ring in XY at z = t, x half-width rx, +Y half-height ra, -Y half-height rb, centre (cx, cy).
function tubeGeo(keys, { axis = 'y', m = 10, sub = 2, x = 0, off = 0 } = {}) {
  const rows = resample(keys.map((k) => [k[0], k[1], k[2], k[3], k[4] || 0, k[5] || 0]), sub);
  const n = rows.length, pos = [], idx = [];
  for (const [t, rx, ra, rb, c1, c2] of rows) {
    for (let j = 0; j < m; j++) {
      const th = (j / m) * Math.PI * 2, u = Math.cos(th), w = Math.sin(th);
      const r2 = (w >= 0 ? ra : rb) * w;
      if (axis === 'y') pos.push(x + c1 + rx * u, t, off + c2 + r2);
      else pos.push(x + c1 + rx * u, off + c2 + r2, t);
    }
  }
  const ctr = (r) => (axis === 'y' ? [x + r[4], r[0], off + r[5]] : [x + r[4], off + r[5], r[0]]);
  const ia = n * m, ib = ia + 1;
  pos.push(...ctr(rows[0]), ...ctr(rows[n - 1]));
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + ((j + 1) % m), c = a + m, d = b + m;
      idx.push(a, b, c, b, d, c);
    }
  }
  for (let j = 0; j < m; j++) {
    idx.push(ia, (j + 1) % m, j);
    idx.push(ib, (n - 1) * m + j, (n - 1) * m + ((j + 1) % m));
  }
  return finish(pos, idx, (i) => ctr(rows[Math.min(n - 1, Math.floor(i / m))]));
}

// Builds an indexed geometry, computes normals and flips the winding if they point inward.
function finish(pos, idx, centreOf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  let dot = 0;
  const cnt = Math.min(pos.length / 3 - 2, 200);
  for (let i = 0; i < cnt; i++) {
    const c = centreOf(i);
    dot += nrm[i * 3] * (pos[i * 3] - c[0]) + nrm[i * 3 + 1] * (pos[i * 3 + 1] - c[1]) + nrm[i * 3 + 2] * (pos[i * 3 + 2] - c[2]);
  }
  if (dot < 0) {
    for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function prim(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  g.deleteAttribute('uv');
  if (rx || ry || rz) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
const ellip = (rx, ry, rz, ws, hs) => { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; };
const quad = (w, h, x, y, z) => prim(new THREE.PlaneGeometry(w, h), x, y, z); // faces +Z

// Rounded box from a subdivided box pushed onto a radius-r shell.
function rbox(w, h, d, r, n = 2) {
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position;
  const half = [w / 2, h / 2, d / 2];
  const v = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    for (let c = 0; c < 3; c++) {
      const u = pos.getComponent(i, c) * 2, hi = half[c] - r;
      v[c] = u * half[c];
      inner[c] = Math.max(-hi, Math.min(hi, u * hi));
    }
    const dx = v[0] - inner[0], dy = v[1] - inner[1], dz = v[2] - inner[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    pos.setXYZ(i, inner[0] + (dx / L) * r, inner[1] + (dy / L) * r, inner[2] + (dz / L) * r);
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVerts(g);
  m.computeVertexNormals();
  return m;
}
// Welds coincident vertices (box faces) so normals come out smooth.
function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), pos = [], remap = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    remap.push(j);
  }
  const idx = Array.from(g.index.array, (i) => remap[i]);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// ---------------- head ----------------
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);

// Head surface for a unit-sphere direction (head-local, centre of the skull).
function headPoint(ux, uy, uz) {
  let x = ux * HEAD_R[0], y = uy * HEAD_R[1], z = uz * HEAD_R[2];
  if (uz < 0) z *= 1 + 0.1 * smooth(-0.5, 0.4, uy);                 // occiput
  if (uy < 0) {                                                     // jaw and chin taper
    const j = smooth(0, 1, -uy);
    x *= 1 - 0.32 * j * j;
    z *= uz < 0 ? 1 - 0.3 * j : 1 - 0.08 * j;
  }
  if (uz > 0) z *= 1 - 0.12 * smooth(0.3, 1, Math.abs(ux));         // flatter cheeks
  const f = smooth(0.4, 0.8, uz);
  z += f * (0.016 * gauss(x, y, 0, -0.004, 0.009, 0.022)            // nose
    + 0.006 * gauss(Math.abs(x), y, 0.03, 0.032, 0.022, 0.008)       // brow ridge
    - 0.006 * gauss(Math.abs(x), y, 0.032, 0.012, 0.012, 0.009)      // eye sockets
    + 0.004 * gauss(x, y, 0, -0.088, 0.02, 0.01));                    // chin
  return [x, y, z];
}

function headSurface(ws, hs, keep, offset = 0) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  const pts = [];
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = headPoint(p.getX(i), p.getY(i), p.getZ(i));
    const L = Math.hypot(x, y, z) || 1, o = typeof offset === 'function' ? offset(p.getX(i), p.getY(i), p.getZ(i)) : offset;
    pts.push(x + (x / L) * o, y + (y / L) * o, z + (z / L) * o);
  }
  const idx = [];
  const src = g.index.array;
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t], b = src[t + 1], c = src[t + 2];
    if (!keep || (keep(p.getX(a), p.getY(a), p.getZ(a)) && keep(p.getX(b), p.getY(b), p.getZ(b)) && keep(p.getX(c), p.getY(c), p.getZ(c)))) idx.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  out.translate(...HEAD_C);
  return compact(out);
}
// Drops unreferenced vertices (after triangle filtering).
function compact(g) {
  const p = g.attributes.position, n = g.attributes.normal, map = new Map(), pos = [], nor = [], idx = [];
  for (const i of g.index.array) {
    let j = map.get(i);
    if (j === undefined) { j = pos.length / 3; map.set(i, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
const headZ = (x, y) => {
  // front surface z at head-local (x, y): iterate the sphere direction
  let ux = x / HEAD_R[0], uy = y / HEAD_R[1], q = null;
  for (let i = 0; i < 10; i++) {
    const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    q = headPoint(ux, uy, uz);
    ux += (x - q[0]) / HEAD_R[0]; uy += (y - q[1]) / HEAD_R[1];
  }
  return q[2];
};

// Scalp masks (unit-sphere direction): hairline high on the forehead, over the ears, down to the nape.
// Continuous masks (1 inside, 0 outside): the shell sinks under the skin outside, so the edge where it
// meets the head is a smooth curve instead of a jagged triangle border.
const hairline = (ux, uz) => (uz > 0 ? 0.42 + 0.2 * smooth(0.55, 0.95, uz) - 0.55 * smooth(0.45, 0.95, Math.abs(ux)) * (1 - smooth(0.5, 0.9, uz)) : -0.3 + 0.3 * smooth(0.0, 0.8, uz) - 0.28 * smooth(-1, -0.6, uz));
const scalpW = (ux, uy, uz) => smooth(-0.04, 0.06, uy - hairline(ux, uz));
const beardW = (ux, uy, uz) => smooth(-0.02, 0.06, -0.06 - uy) * smooth(-0.35, -0.15, uz) * smooth(-0.995, -0.93, uy) * (1 - smooth(-0.05, 0.05, 0.3 - Math.abs(ux)) * smooth(-0.05, 0.05, uy + 0.62) * smooth(0.0, 0.08, -0.22 - uy) * smooth(0.75, 0.85, uz));
const shellOff = (w, thick) => (ux, uy, uz) => { const m = w(ux, uy, uz); return -0.006 + m * (0.006 + thick(ux, uy, uz)); };

/**
 * Returns [{ geom, part, joint, mat, opt, rgb }]. Geometries are non-indexed unless `indexed` is set.
 * lod 0 = near (about 2.5k triangles with every option), 1 = far (about 0.6k).
 */
export function personParts({ indexed = false, lod = 0 } = {}) {
  const P = [];
  const far = lod > 0;
  const M = far ? 4 : 9;            // ring segments for limbs
  const SUB = 1;
  const add = (geom, part, joint, mat, opt = 0, rgb = DARK) => P.push({ geom, part, joint, mat, opt, rgb });
  // Far figure: every other interior profile key, and the small optional details are left out.
  const tube = (keys, o) => tubeGeo(far && keys.length > 4 ? keys.filter((k, i) => i === 0 || i === keys.length - 1 || i % 2 === 1) : keys, o);
  const FAR_SKIP = new Set([OPT.BEARD, OPT.GLASSES, OPT.BUN, OPT.ZIPPER, OPT.VNECK, OPT.PHONE]);

  // ---- head ----
  add(headSurface(far ? 7 : 14, far ? 5 : 11, null), PART.STATIC, J.HEAD, MAT.SKIN);
  const [hx, hy, hz] = HEAD_C;
  for (const s of [-1, 1]) {
    if (!far) add(prim(ellip(0.012, 0.027, 0.019, 6, 5), hx + s * 0.083, hy - 0.004, hz - 0.012, 0, s * 0.35, 0), PART.STATIC, J.HEAD, MAT.SKIN);
    if (!far) {
      const ex = s * 0.031, ey = 0.014, ez = headZ(ex, ey) + 0.001;
      add(quad(0.026, 0.014, hx + ex, hy + ey, hz + ez), PART.STATIC, J.HEAD, MAT.FIXED, 0, WHITE);
      add(quad(0.012, 0.013, hx + ex, hy + ey, hz + ez + 0.0012), PART.STATIC, J.HEAD, MAT.FIXED, 0, [0.12, 0.08, 0.06]);
      const bz = headZ(s * 0.031, 0.034) + 0.001;
      add(prim(rbox(0.03, 0.007, 0.006, 0.0025, 1), hx + s * 0.031, hy + 0.034, hz + bz - 0.002, 0, 0, -s * 0.1), PART.STATIC, J.HEAD, MAT.HAIR);
      for (const o of [OPT.GLASSES]) {
        add(prim(new THREE.TorusGeometry(0.017, 0.0025, 3, 8), hx + ex, hy + ey, hz + ez + 0.012), PART.STATIC, J.HEAD, MAT.FIXED, o, [0.06, 0.06, 0.07]);
        add(quad(0.032, 0.03, hx + ex, hy + ey, hz + ez + 0.011), PART.STATIC, J.HEAD, MAT.FIXED, o, [0.12, 0.14, 0.16]);
        add(prim(rbox(0.004, 0.004, 0.11, 0.0015, 1), hx + s * 0.075, hy + ey + 0.004, hz - 0.03), PART.STATIC, J.HEAD, MAT.FIXED, o, [0.06, 0.06, 0.07]);
      }
    }
  }
  if (!far) {
    add(quad(0.03, 0.006, hx, hy - 0.052, hz + headZ(0, -0.052) + 0.001), PART.STATIC, J.HEAD, MAT.FIXED, 0, [0.55, 0.28, 0.26]);
    add(prim(rbox(0.016, 0.004, 0.004, 0.0015, 1), hx, hy + 0.016, hz + headZ(0, 0.016) + 0.002), PART.STATIC, J.HEAD, MAT.FIXED, OPT.GLASSES, [0.06, 0.06, 0.07]);
  }
  // ---- hair (grown from the scalp, thicker on the crown) ----
  const hw = far ? 8 : 18, hh = far ? 6 : 13;
  add(headSurface(hw, hh, null, shellOff(scalpW, (ux, uy) => 0.005 + 0.012 * smooth(-0.2, 0.9, uy))), PART.STATIC, J.HEAD, MAT.HAIR, OPT.HAIR_SHORT);
  add(headSurface(far ? 8 : 14, far ? 6 : 11, (ux, uy) => uy < 0.2, shellOff(beardW, () => 0.006)), PART.STATIC, J.HEAD, MAT.HAIR, OPT.BEARD);
  // Long hair: a rounded drape from the crown down the back to the shoulders.
  add(tube([
    [hy + 0.08, 0.05, 0.03, 0.02], [hy + 0.03, 0.098, 0.03, 0.07], [hy - 0.06, 0.1, 0.03, 0.06],
    [hy - 0.16, 0.098, 0.02, 0.045], [hy - 0.25, 0.085, 0.012, 0.03], [hy - 0.29, 0.06, 0.008, 0.012],
  ], { m: far ? 5 : 10, sub: SUB, off: hz - 0.05 }), PART.STATIC, J.HEAD, MAT.HAIR, OPT.HAIR_LONG);
  // Ponytail: tie at the back of the crown, tapering down.
  add(tube([
    [hy + 0.04, 0.02, 0.02, 0.02, 0, -0.105], [hy + 0.02, 0.028, 0.028, 0.028, 0, -0.118], [hy - 0.06, 0.032, 0.03, 0.03, 0, -0.13],
    [hy - 0.15, 0.024, 0.022, 0.022, 0, -0.125], [hy - 0.2, 0.008, 0.008, 0.008, 0, -0.118],
  ], { m: far ? 5 : 8, sub: SUB, off: hz }), PART.STATIC, J.HEAD, MAT.HAIR, OPT.PONYTAIL);
  add(prim(ellip(0.042, 0.038, 0.04, far ? 5 : 8, far ? 4 : 6), hx, hy + 0.075, hz - 0.085), PART.STATIC, J.HEAD, MAT.HAIR, OPT.BUN);
  // Cap: crown dome + curved brim.
  add(headSurface(far ? 10 : 16, far ? 7 : 11, (ux, uy) => uy > -0.1, shellOff((ux, uy) => smooth(0.2, 0.3, uy), (ux, uy) => 0.016 + 0.006 * uy)), PART.STATIC, J.HEAD, MAT.ACC, OPT.CAP);
  add(tube([[hz + 0.06, 0.07, 0.004, 0.004, 0, 0.0], [hz + 0.12, 0.075, 0.004, 0.004, 0, -0.008], [hz + 0.17, 0.05, 0.004, 0.004, 0, -0.022]],
    { axis: 'z', m: far ? 6 : 10, sub: SUB, off: hy + 0.05 }), PART.STATIC, J.HEAD, MAT.ACC, OPT.CAP);

  // ---- neck + torso ----
  add(tube([[1.44, 0.058, 0.055, 0.06], [1.52, 0.05, 0.05, 0.054, 0, -0.004], [1.6, 0.047, 0.047, 0.05, 0, -0.004]], { m: M, sub: SUB }),
    PART.STATIC, J.NECK, MAT.SKIN);
  // Pelvis/trousers (seat at the back), then the shirt from the waist over the chest to rounded shoulders.
  add(tube([
    [0.8, 0.07, 0.05, 0.06], [0.83, 0.16, 0.09, 0.105], [0.9, 0.175, 0.1, 0.12], [0.96, 0.168, 0.097, 0.103], [1.02, 0.15, 0.09, 0.09],
  ], { m: far ? 7 : 14, sub: SUB }), PART.STATIC, J.TORSO, MAT.PANTS);
  add(tube([
    [0.965, 0.166, 0.104, 0.108], [0.985, 0.17, 0.106, 0.11], [1.06, 0.152, 0.097, 0.094], [1.18, 0.158, 0.105, 0.095], [1.28, 0.175, 0.115, 0.1],
    [1.37, 0.19, 0.11, 0.1], [1.44, 0.18, 0.09, 0.088], [1.49, 0.125, 0.07, 0.072], [1.515, 0.06, 0.055, 0.058],
  ], { m: far ? 7 : 16, sub: SUB }), PART.STATIC, J.TORSO, MAT.TOP);
  // Shirt front cues: V-neck skin wedge, jacket zipper + collar.
  {
    const vz = 0.112;
    const v = new THREE.BufferGeometry();
    v.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 1.47, 0.085, 0, 1.38, vz + 0.004, 0.06, 1.47, 0.085], 3));
    v.setIndex([0, 1, 2]);
    v.computeVertexNormals();
    if (v.attributes.normal.getZ(0) < 0) v.setIndex([0, 2, 1]), v.computeVertexNormals();
    add(v, PART.STATIC, J.CHEST, MAT.SKIN, OPT.VNECK);
  }
  if (!far) add(prim(rbox(0.012, 0.42, 0.01, 0.004, 1), 0, 1.22, 0.112, 0.06, 0, 0), PART.STATIC, J.TORSO, MAT.FIXED, OPT.ZIPPER, [0.16, 0.16, 0.18]);
  add(tube([[1.46, 0.1, 0.08, 0.085], [1.5, 0.085, 0.07, 0.075], [1.53, 0.075, 0.065, 0.07]], { m: M, sub: 1 }), PART.STATIC, J.CHEST, MAT.TOP, OPT.ZIPPER);
  // Coat: longer, flared skirt of the jacket over the hips.
  add(tube([
    [0.66, 0.2, 0.135, 0.15], [0.78, 0.19, 0.125, 0.14], [0.92, 0.182, 0.114, 0.13], [1.02, 0.174, 0.11, 0.114],
  ], { m: far ? 7 : 14, sub: SUB }), PART.STATIC, J.TORSO, MAT.TOP, OPT.COAT);
  // Skirt / dress: A-line from the waist, bent per side by the shader as the thighs swing.
  add(tube([
    [0.56, 0.235, 0.17, 0.18], [0.7, 0.21, 0.14, 0.15], [0.85, 0.185, 0.115, 0.125], [0.95, 0.176, 0.11, 0.116], [1.0, 0.17, 0.108, 0.112],
  ], { m: far ? 7 : 16, sub: SUB }), PART.STATIC, J.SKIRT, MAT.TOP, OPT.SKIRT);
  // Backpack (body, lid, straps) and a shoulder bag on the hip with a diagonal strap.
  add(prim(rbox(0.28, 0.36, 0.13, 0.04, far ? 1 : 2), 0, 1.22, -0.165), PART.STATIC, J.CHEST, MAT.ACC, OPT.BACKPACK);
  if (!far) {
    add(prim(rbox(0.2, 0.12, 0.04, 0.015, 1), 0, 1.13, -0.24), PART.STATIC, J.CHEST, MAT.ACC, OPT.BACKPACK);
    // Shoulder straps hugging the chest from the top of the shoulder down to under the arm.
    for (const s of [-1, 1]) {
      add(tube([[1.12, 0.016, 0.004, 0.004, 0, 0.095], [1.22, 0.018, 0.004, 0.004, 0, 0.112], [1.32, 0.018, 0.004, 0.004, 0, 0.122],
        [1.41, 0.018, 0.004, 0.004, 0, 0.098], [1.47, 0.018, 0.004, 0.004, 0, 0.04], [1.475, 0.018, 0.004, 0.004, 0, -0.04]],
      { m: 4, sub: 1, x: s * 0.1 }), PART.STATIC, J.CHEST, MAT.ACC, OPT.BACKPACK);
    }
  }
  add(prim(rbox(0.07, 0.22, 0.26, 0.03, far ? 1 : 2), -0.245, 0.9, 0.02), PART.STATIC, J.PELVIS, MAT.ACC, OPT.BAG);
  {
    // Cross-body strap: a flat loop around the torso from the right shoulder down to the bag on the left hip.
    const strap = new THREE.TorusGeometry(1, 0.03, 2, far ? 10 : 20);
    strap.rotateX(Math.PI / 2);
    strap.scale(0.29, 1, 0.128);
    strap.rotateZ(0.88);
    add(prim(strap, 0, 1.2, 0), PART.STATIC, J.CHEST, MAT.ACC, OPT.BAG);
  }

  // ---- legs ----
  for (const s of [-1, 1]) {
    const part = s < 0 ? PART.LLEG : PART.RLEG, x = s * HIP_X;
    const jT = s < 0 ? J.LTHIGH : J.RTHIGH, jS = s < 0 ? J.LSHIN : J.RSHIN, jF = s < 0 ? J.LFOOT : J.RFOOT;
    add(tube([
      [0.97, 0.03, 0.03, 0.03], [0.94, 0.082, 0.085, 0.09], [0.84, 0.084, 0.085, 0.092], [0.7, 0.072, 0.074, 0.074], [0.605, 0.066, 0.067, 0.066], [0.595, 0.063, 0.064, 0.063],
      [0.56, 0.06, 0.06, 0.058], [0.48, 0.055, 0.056, 0.053], [0.44, 0.03, 0.03, 0.03],
    ], { m: M, sub: SUB, x }), part, jT, MAT.PANTS);
    add(tube([
      [0.52, 0.03, 0.03, 0.03], [0.49, 0.054, 0.055, 0.055], [0.4, 0.053, 0.048, 0.066], [0.3, 0.046, 0.042, 0.054],
      [0.18, 0.038, 0.038, 0.04], [0.11, 0.036, 0.036, 0.038], [0.07, 0.02, 0.02, 0.02],
    ], { m: M, sub: SUB, x }), part, jS, MAT.PANTS);
    // Shoe upper (heel counter to rounded toe box), then the sole.
    add(tube([
      [-0.08, 0.02, 0.03, 0.01, 0, 0.065], [-0.065, 0.042, 0.055, 0.04, 0, 0.065], [-0.02, 0.048, 0.07, 0.045, 0, 0.06],
      [0.05, 0.05, 0.045, 0.035, 0, 0.045], [0.12, 0.05, 0.03, 0.026, 0, 0.034], [0.18, 0.04, 0.022, 0.018, 0, 0.03], [0.2, 0.015, 0.01, 0.01, 0, 0.028],
    ], { axis: 'z', m: M, sub: SUB, x }), part, jF, MAT.FIXED, 0, SHOE);
    add(prim(rbox(0.1, 0.022, 0.29, 0.009, 1), x, 0.011, 0.058), part, jF, MAT.FIXED, 0, SOLE);
  }

  // ---- arms + hands (palm faces the thigh, thumb forward) ----
  for (const s of [-1, 1]) {
    const part = s < 0 ? PART.LARM : PART.RARM, x = s * SH_X;
    const jU = s < 0 ? J.LUPPER : J.RUPPER, jF = s < 0 ? J.LFORE : J.RFORE;
    add(tube([
      [1.465, 0.026, 0.03, 0.03], [1.445, 0.05, 0.054, 0.054], [1.38, 0.054, 0.055, 0.053], [1.305, 0.051, 0.052, 0.049], [1.295, 0.047, 0.048, 0.045], [1.22, 0.045, 0.047, 0.044],
      [1.16, 0.043, 0.043, 0.043], [1.1, 0.025, 0.025, 0.025],
    ], { m: M, sub: SUB, x }), part, jU, MAT.TOP);
    add(tube([
      [1.17, 0.025, 0.025, 0.025], [1.14, 0.042, 0.043, 0.043], [1.06, 0.043, 0.042, 0.045], [0.96, 0.034, 0.036, 0.036],
      [0.9, 0.028, 0.033, 0.031], [0.87, 0.02, 0.02, 0.02],
    ], { m: M, sub: SUB, x }), part, jF, MAT.TOP);
    // Hand: palm and loosely curled fingers in one loft (thin across X, wide along Z), plus a thumb.
    add(tube([
      [0.895, 0.016, 0.022, 0.022], [0.87, 0.02, 0.036, 0.034, -s * 0.002, 0.002], [0.82, 0.018, 0.042, 0.038, -s * 0.004, 0.006],
      [0.78, 0.016, 0.036, 0.03, -s * 0.006, 0.014], [0.75, 0.012, 0.022, 0.018, -s * 0.008, 0.024], [0.735, 0.006, 0.01, 0.008, -s * 0.009, 0.03],
    ], { m: far ? 4 : 8, sub: 1, x }), part, jF, MAT.SKIN);
    if (!far) add(tube([[0.865, 0.009, 0.01, 0.01, -s * 0.006, 0.03], [0.83, 0.009, 0.009, 0.009, -s * 0.012, 0.046], [0.8, 0.006, 0.006, 0.006, -s * 0.014, 0.05]],
      { m: 6, sub: 1, x }), part, jF, MAT.SKIN);
  }
  // Phone in the right hand (screen faces the palm side's front once the forearm is raised).
  add(prim(rbox(0.04, 0.14, 0.01, 0.004, 1), SH_X - 0.022, 0.81, 0.03), PART.RARM, J.RFORE, MAT.FIXED, OPT.PHONE, [0.05, 0.06, 0.08]);
  // Umbrella held in the right fist: in the rest frame the shaft points forward (+Z); the umbrella arm pose
  // raises the forearm so it stands upright over the head.
  {
    const ux = SH_X - 0.01, uy = 0.81;
    const lean = -0.13; // shaft direction (swing 0.6 + elbow 1.1 raise the forearm 1.7 rad) in the rest frame: (0, sin(lean), cos(lean))
    const dy = Math.sin(lean), dz = Math.cos(lean), tilt = Math.PI / 2 - lean;
    const shaft = prim(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 5), 0, 0, 0, tilt, 0, 0);
    shaft.translate(ux, uy + dy * 0.38, dz * 0.38);
    add(shaft, PART.RARM, J.RFORE, MAT.FIXED, OPT.UMBRELLA, [0.15, 0.15, 0.16]);
    const cone = prim(new THREE.ConeGeometry(0.6, 0.24, far ? 8 : 12, 1), 0, 0, 0, tilt, 0, 0);
    cone.translate(ux, uy + dy * 0.8, dz * 0.8);
    add(cone, PART.RARM, J.RFORE, MAT.ACC, OPT.UMBRELLA);
  }

  if (far) {
    for (let i = P.length - 1; i >= 0; i--) if (FAR_SKIP.has(P[i].opt)) { P[i].geom.dispose(); P.splice(i, 1); }
  }
  if (indexed) return P;
  for (const p of P) {
    const n = p.geom.index ? p.geom.toNonIndexed() : p.geom;
    if (n !== p.geom) p.geom.dispose();
    p.geom = n;
  }
  return P;
}

// ---------------- appearance ----------------
const C = (h) => new THREE.Color(h);
const pick = (a) => a[(Math.random() * a.length) | 0];
const TOPS = {
  cold: [0x1b1f2a, 0x2f3542, 0x4a4e57, 0x6b4f3a, 0xa47148, 0x3b4a3a, 0x7a1f2b, 0x222222, 0x8a8f99, 0x1d3557].map(C),
  mild: [0x2b2d42, 0x8d99ae, 0xedf2f4, 0xd90429, 0x264653, 0x2a9d8f, 0xe9c46a, 0x1d3557, 0x6d597a, 0x3a3a3a, 0xffffff, 0x588157].map(C),
  warm: [0xffffff, 0xf1faee, 0xa8dadc, 0xffd166, 0xef476f, 0x06d6a0, 0x8ecae6, 0xffb4a2, 0xe9edc9, 0x457b9d, 0xf4a261].map(C),
};
const DRESS = [0x1b1b1e, 0x7a1f2b, 0x1d3557, 0x2a9d8f, 0xe9c46a, 0xef476f, 0x6d597a, 0xf1faee, 0x8ecae6].map(C);
const PANTS = [0x1b1b1e, 0x22223b, 0x2f3e46, 0x3d405b, 0x4a4e69, 0x5c4033, 0xa39171, 0x14213d, 0x335c81].map(C);
const PANTS_WARM = [0xe9e4d4, 0xa39171, 0x335c81, 0x2f3e46, 0xc2b280, 0x1b1b1e].map(C);
const TIGHTS = [0x111114, 0x1e1a1c, 0x3a2e2a].map(C);
const HAIR = { asia: [0x0d0b0a, 0x0d0b0a, 0x0d0b0a, 0x1c1410, 0x2a1d15, 0x5a3c26], africa: [0x0b0a09, 0x14100d], any: [0x0d0b0a, 0x2a1d15, 0x4a3020, 0x7a5230, 0xc8a165, 0x8a3b1e] };
const GRAY = [0x9a9a9a, 0xc9c9c9, 0x6e6e6e].map(C);
const SKIN = {
  asia: [0xf1d3b3, 0xeac4a0, 0xe0b48f, 0xf5d7bd],
  africa: [0x8d5524, 0x6b3e1f, 0x5a3418, 0xa0673a],
  south: [0xc68642, 0xa86b3c, 0xd8a26e, 0x8d5524],
  any: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5cfa0, 0xead0b8],
};
const ACC = [0x111111, 0x2b2d42, 0x1d3557, 0x7a1f2b, 0x3b4a3a, 0x6b4f3a, 0xb3261e, 0xe9c46a, 0x8d99ae].map(C);

function region(lat, lon) {
  if (lat > 18 && lat < 46 && lon > 95 && lon < 146) return 'asia';
  if (lat > -35 && lat < 15 && lon > -18 && lon < 52) return 'africa';
  if (lat > 5 && lat < 35 && lon > 60 && lon < 95) return 'south';
  return 'any';
}

/**
 * Random appearance + gait for a pedestrian at the given world origin.
 * Gait: gaitStride (stride multiplier), gaitArm (arm swing), posture (0 upright .. 1 stooped),
 * idleMode (0 look around, 1 crossed arms, 2 hands at rest/shifting), clock (idle animation offset).
 */
export function randomPersonLook(lat = 40, lon = 0) {
  const absLat = Math.abs(Number(lat) || 0);
  const climate = absLat > 45 ? 'cold' : absLat < 26 ? 'warm' : 'mild';
  const reg = region(lat, lon);
  const female = Math.random() < 0.5;
  const older = Math.random() < 0.13;
  let style = female ? bit(OPT.FEMALE) : 0;
  const r = Math.random();
  if (female) style |= r < 0.4 ? bit(OPT.HAIR_SHORT) | bit(OPT.HAIR_LONG) : r < 0.65 ? bit(OPT.HAIR_SHORT) | bit(OPT.PONYTAIL) : r < 0.78 ? bit(OPT.HAIR_SHORT) | bit(OPT.BUN) : r < 0.95 ? bit(OPT.HAIR_SHORT) : bit(OPT.HAIR_SHORT) | bit(OPT.CAP);
  else style |= r < 0.68 ? bit(OPT.HAIR_SHORT) : r < 0.8 ? 0 : bit(OPT.HAIR_SHORT) | bit(OPT.CAP);
  if (Math.random() < (older ? 0.45 : 0.16)) style |= bit(OPT.GLASSES);
  if (!female && Math.random() < (older ? 0.3 : 0.12)) style |= bit(OPT.BEARD);
  const b = Math.random();
  if (b < 0.22) style |= bit(OPT.BACKPACK);
  else if (b < 0.4) style |= bit(OPT.BAG);
  const coat = Math.random() < (climate === 'cold' ? 0.55 : climate === 'mild' ? 0.2 : 0);
  const skirt = female && !coat && Math.random() < (climate === 'cold' ? 0.12 : 0.32);
  if (coat) style |= bit(OPT.COAT);
  if (skirt) style |= bit(OPT.SKIRT);
  const t = Math.random();
  if (t < (climate === 'warm' ? 0.15 : 0.45)) style |= bit(OPT.ZIPPER);
  else if (t < 0.8) style |= bit(OPT.VNECK);
  if (!coat && !(style & bit(OPT.ZIPPER)) && Math.random() < (climate === 'warm' ? 0.75 : climate === 'mild' ? 0.35 : 0.05)) style |= bit(OPT.TSHIRT);
  if (!skirt && !older && Math.random() < (climate === 'warm' ? 0.4 : climate === 'mild' ? 0.1 : 0)) style |= bit(OPT.SHORTS);
  if (Math.random() < 0.35) style |= bit(OPT.WHITE_SHOES);
  if (!older && Math.random() < 0.1) style |= bit(OPT.PHONE);
  const hairPal = HAIR[reg] || HAIR.any;
  const skin = C(pick(SKIN[reg] || SKIN.any));
  const brisk = !older && Math.random() < 0.2;
  return {
    style,
    top: skirt ? pick(DRESS) : pick(coat ? TOPS.cold : TOPS[climate]),
    pants: skirt ? (Math.random() < 0.6 ? skin.clone().multiplyScalar(0.95) : pick(TIGHTS)) : pick(climate === 'warm' ? PANTS_WARM : PANTS),
    skin,
    hair: older ? pick(GRAY) : C(pick(hairPal)),
    acc: pick(ACC),
    hScale: female ? 0.9 + Math.random() * 0.1 : 0.96 + Math.random() * 0.12,
    wScale: female ? 0.9 + Math.random() * 0.1 : 0.96 + Math.random() * 0.14,
    umbRoll: Math.random(),
    speedMul: older ? 0.72 + Math.random() * 0.12 : brisk ? 1.15 + Math.random() * 0.15 : 1,
    older,
    gaitStride: older ? 0.8 + Math.random() * 0.08 : brisk ? 1.06 + Math.random() * 0.06 : 0.94 + Math.random() * 0.12,
    gaitArm: older ? 0.45 + Math.random() * 0.25 : (female ? 0.8 : 0.9) + Math.random() * 0.45,
    posture: older ? 0.45 + Math.random() * 0.45 : Math.random() * 0.22,
    idleMode: (Math.random() * 3) | 0,
    clock: Math.random() * 100,
  };
}

// ---------------- vertex shader ----------------
// Instance inputs: iAnim = (gait phase [rad, one cycle = 2 pi, advanced by distance walked], amplitude
// (0 standing, 0.5 walking, 0.95 running), style bits); iGait = (stride per cycle in local units, arm swing,
// idle/action pose mode (0 look around, 1 crossed arms, 2 relaxed, 3 wave, 4 phone call) + posture fraction,
// clock seconds). Vertex input aInfo = (part, mat, opt, joint).
export const PERSON_COMMON_GLSL = `
  mat3 pRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c); }
  mat3 pRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 pRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  // Planted stance foot: contact point moves back under the hip; the foot rolls heel -> flat -> toe, and
  // the heel lifts as far as the leg needs to reach (toe-off). Returns (ankle z, ankle y, foot pitch).
  vec3 pStance(float s, float zf, float trav, float run, vec2 hip, float mov) {
    float zc = zf - trav * s;
    float p = mov * (mix(0.32, 0.06, run) * (1.0 - smoothstep(0.0, 0.2, s)) - mix(0.15, 0.7, run) * smoothstep(mix(0.55, 0.3, run), 1.0, s));
    vec2 a = vec2(0.0);
    for (int i = 0; i < 3; i++) {
      float c = cos(p), sn = sin(p);
      // heel pivot (toes up) or ball pivot (heel up); rest offsets heel->ankle (0.06, 0.08), ball->ankle (-0.14, 0.08)
      a = p > 0.0 ? vec2(zc - 0.06 + (-0.08 * sn + 0.06 * c), 0.08 * c + 0.06 * sn)
                  : vec2(zc + 0.14 + (-0.08 * sn - 0.14 * c), 0.08 * c - 0.14 * sn);
      float d = length(a - hip) - 0.815;
      if (d > 0.0 && zc < hip.x + 0.05) p = max(p - d * 7.0, -1.25);
    }
    return vec3(a, p);
  }
  vec3 pFoot(float u, float S, float run, vec2 hip, float mov) {
    float beta = mix(0.6, 0.36, run);
    float trav = S * beta;
    float zf = trav * mix(0.36, 0.42, run) + 0.01;
    if (u < beta) return pStance(u / beta, zf, trav, run, hip, mov);
    float w = (u - beta) / (1.0 - beta);
    vec3 a = pStance(1.0, zf, trav, run, hip, mov);
    vec3 b = pStance(0.0, zf, trav, run, hip, mov);
    float e = smoothstep(mix(0.0, 0.2, run), 1.0, w);
    float lift = mov * mix(0.07, 0.34, run) * sin(3.14159 * pow(w, mix(0.9, 0.55, run)));
    float z = mix(a.x, b.x, e) - run * 0.12 * sin(3.14159 * min(1.0, w * 1.6)) * mov;
    float p = w < 0.5 ? mix(a.z, 0.12 * mov, smoothstep(0.0, 0.5, w)) : mix(0.12 * mov, b.z, smoothstep(0.5, 1.0, w));
    return vec3(z, mix(a.y, b.y, w) + lift, p);
  }
`;

export const PERSON_ANIM_GLSL = `
  int pStyle = int(iAnim.z + 0.5);
  int pOpt = int(aInfo.z + 0.5);
  float pJ = aInfo.w;
  bool pUmb = ((pStyle >> 7) & 1) == 1;
  bool pFem = ((pStyle >> 12) & 1) == 1;
  bool pPhone = ((pStyle >> 17) & 1) == 1 && !pUmb;
  vec3 pP = position;
  vec3 pN = objectNormal;
  {
    const float TAU = 6.2831853;
    float amp = iAnim.y;
    float run = smoothstep(0.62, 0.9, amp);
    float mov = clamp(amp * 2.0, 0.0, 1.0);
    float idle = 1.0 - mov;
    float S = max(iGait.x, 0.2) * mov;
    float armK = iGait.y;
    float mode = floor(iGait.z);
    float posture = fract(iGait.z);
    float tm = iGait.w;
    bool isL = (pJ > 2.5 && pJ < 5.5) || pJ == 9.0 || pJ == 10.0;
    bool isR = (pJ > 5.5 && pJ < 8.5) || pJ == 11.0 || pJ == 12.0;
    float side = isL ? -1.0 : isR ? 1.0 : (pP.x < 0.0 ? -1.0 : 1.0);
    // body shape: narrower shoulders, wider hips, bust for the female build
    if (pFem) {
      if (pJ < 1.5 || pJ > 12.5) {
        pP.x *= mix(1.06, 0.9, smoothstep(0.98, 1.3, pP.y));
        if (pJ == 0.0 && pP.z > 0.0) pP.z += 0.026 * exp(-pow((pP.y - 1.3) / 0.065, 2.0)) * smoothstep(0.17, 0.03, abs(abs(pP.x) - 0.075));
      } else if (pJ > 8.5 && pJ < 12.5) pP.x -= side * 0.02;
      else if (pJ > 2.5 && pJ < 8.5) pP.x += side * 0.006;
    }
    float uL = fract(iAnim.x / TAU);
    float u = side < 0.0 ? uL : fract(uL + 0.5);
    float c1 = cos(TAU * uL), s1 = sin(TAU * uL);
    // slow idle drifts (weight shift, looking around, breathing)
    float ws = sin(tm * 0.42) * 0.8 + sin(tm * 0.17 + 1.3) * 0.2;
    float breath = sin(tm * 1.7);

    // ---- pelvis ----
    float bob = mov * mix(-0.02 * cos(2.0 * TAU * uL) - 0.026, -0.03 * cos(2.0 * TAU * (uL - 0.18)) - 0.02, run);
    float swayX = mov * -0.022 * s1 * (1.0 - run * 0.6) + idle * 0.03 * ws;
    float yawP = mov * mix(0.1, 0.07, run) * c1;
    float rollP = mov * -0.045 * s1 * (1.0 - run * 0.5) + idle * 0.045 * ws;
    mat3 Rp = pRotY(yawP) * pRotZ(rollP);
    vec3 C0 = vec3(0.0, 0.95, 0.0), offP = vec3(swayX, bob - posture * 0.03, 0.0);
    // ---- chest: counter-rotation, lean (posture, running, phone), breathing ----
    float lean = 0.04 + posture * 0.32 + run * 0.26 + (pPhone ? 0.05 : 0.0);
    float yawC = -mov * mix(0.09, 0.17, run) * c1 * sqrt(armK) + idle * 0.05 * sin(tm * 0.31);
    mat3 Rc = pRotY(yawC) * pRotX(-lean) * pRotZ(-rollP * 0.6);
    vec3 W0 = vec3(0.0, 1.02, 0.0);
    vec3 Wp = Rp * (W0 - C0) + C0 + offP + vec3(0.0, 0.003 * breath, 0.0);
    // ---- head: stabilised (cancels chest yaw and most of the lean), looks around when idle, phone nod ----
    float look = idle * (mode < 0.5 ? 0.75 : 0.3) * smoothstep(0.35, 0.8, abs(sin(tm * 0.23))) * sign(sin(tm * 0.23))
      + mov * 0.2 * smoothstep(0.85, 1.0, sin(tm * 0.19));
    float nod = pPhone && mode < 3.5 ? 0.5 : (idle * (mode > 1.5 && mode < 2.5 ? 0.12 : 0.0));
    mat3 Rh = pRotY(look) * pRotX(-(lean * 0.35 + nod - posture * 0.1));
    vec3 N0 = vec3(0.0, 1.52, 0.0);
    vec3 Np = Wp + Rc * (N0 - W0);

    vec3 outP = pP, outN = pN;
    if (pJ < 1.5 || pJ > 12.5) {
      // torso/neck/chest/pelvis/skirt: blend between the segment transforms by height (no seams)
      vec3 pPel = Rp * (pP - C0) + C0 + offP;
      vec3 nPel = Rp * pN;
      vec3 pCh = Wp + Rc * (pP - W0) + vec3(0.0, 0.004 * breath * smoothstep(1.2, 1.45, pP.y), 0.0);
      vec3 nCh = Rc * pN;
      if (pJ == 1.0) {
        float w = smoothstep(1.49, 1.6, pP.y);
        outP = mix(pCh, Np + Rh * (pP - N0), w); outN = mix(nCh, Rh * pN, w);
      } else if (pJ == 13.0) { outP = pCh; outN = nCh; }
      else if (pJ == 14.0) { outP = pPel; outN = nPel; }
      else if (pJ == 15.0) {
        // skirt: each side follows its thigh (approximate: hip swing from the gait phase)
        float sw = mov * (mix(0.32, 0.6, run)) * cos(TAU * u) * smoothstep(0.0, 0.12, abs(pP.x));
        float k = clamp((0.97 - pP.y) / 0.4, 0.0, 1.0);
        vec3 H0 = vec3(side * 0.09, 0.95, 0.0);
        mat3 Rs = pRotX(sw * k * 0.8);
        outP = Rp * (H0 + Rs * (pP - H0) - C0) + C0 + offP; outN = Rp * Rs * pN;
      } else {
        float w = smoothstep(0.95, 1.15, pP.y);
        outP = mix(pPel, pCh, w); outN = mix(nPel, nCh, w);
      }
    } else if (pJ == 2.0) {
      outP = Np + Rh * (pP - N0); outN = Rh * pN;
    } else if (pJ < 8.5) {
      // ---- leg: planted-foot gait + two-bone IK (thigh 0.42, shin 0.40) ----
      vec3 H0 = vec3(side * 0.09 * (pFem ? 1.06 : 1.0), 0.9, 0.0);
      vec3 Hp = Rp * (H0 - C0) + C0 + offP;
      vec3 F = pFoot(u, S, run, Hp.zy, mov);
      vec2 A = F.xy;
      vec2 d = A - Hp.zy;
      float D = clamp(length(d), 0.2, 0.819);
      float dir = atan(d.x, -d.y);
      float a1 = dir + acos(clamp((0.1764 + D * D - 0.16) / (0.84 * D), -1.0, 1.0));
      float a2 = dir - acos(clamp((0.16 + D * D - 0.1764) / (0.8 * D), -1.0, 1.0));
      vec3 K = Hp + vec3(0.0, -0.42 * cos(a1), 0.42 * sin(a1));
      vec3 Ap = K + vec3(0.0, -0.4 * cos(a2), 0.4 * sin(a2));
      float shear = (Hp.x - H0.x);
      if (pJ == 3.0 || pJ == 6.0) { mat3 R = pRotX(a1); outP = Hp + R * (pP - H0); outN = R * pN; }
      else if (pJ == 4.0 || pJ == 7.0) { mat3 R = pRotX(a2); outP = K + R * (pP - vec3(H0.x, 0.48, 0.0)); outN = R * pN; }
      else { mat3 R = pRotX(F.z); outP = Ap + R * (pP - vec3(H0.x, 0.08, 0.0)); outN = R * pN; }
      outP.x -= shear * (1.0 - clamp(outP.y / max(Hp.y, 0.5), 0.0, 1.0));
    } else {
      // ---- arm: counter-swing with elbow bend; run = pumping; special poses ----
      vec3 S0 = vec3(side * 0.2, 1.42, 0.0);
      vec3 Sp = Wp + Rc * (S0 - W0) + vec3(0.0, 0.004 * breath, 0.0);
      float A = armK * mix(0.3, 0.75, run) * mov;
      float sw = -A * cos(TAU * u - 0.3);
      float swN = A > 0.01 ? sw / A : 0.0;
      float swing = sw + run * 0.15;
      float abd = 0.1 + run * 0.06;
      float inY = -side * 0.3 * run;
      float elbow = mix(mix(0.12, 0.2 + 0.32 * smoothstep(-0.4, 1.0, swN), mov), 1.5 + 0.3 * swN, run);
      // idle: relaxed arms or crossed arms
      float crossW = idle * (mode > 0.5 && mode < 1.5 ? 1.0 : 0.0);
      swing = mix(swing, 0.2, crossW); elbow = mix(elbow, 1.6, crossW); inY = mix(inY, -side * 0.95, crossW); abd = mix(abd, 0.2, crossW);
      if (side > 0.0 && mode > 2.5 && mode < 3.5) { swing = 0.2; abd = 2.45; inY = 0.0; elbow = 0.5 + 0.35 * sin(tm * 9.0); } // wave
      else if (side > 0.0 && mode > 3.5) { swing = 0.45; abd = 0.5; inY = -0.2; elbow = 2.55; } // phone call: hand to the ear
      else if (side > 0.0 && pUmb) { swing = 0.6; elbow = 1.1; inY = -0.12; abd = 0.04; }
      else if (side > 0.0 && pPhone) { swing = 0.28; elbow = 1.55; inY = -0.5; abd = 0.08; }
      mat3 Ru = Rc * pRotZ(side * abd) * pRotY(inY) * pRotX(swing);
      vec3 E0 = vec3(S0.x, 1.13, 0.0);
      if (pJ == 9.0 || pJ == 11.0) { outP = Sp + Ru * (pP - S0); outN = Ru * pN; }
      else { mat3 R = Ru * pRotX(elbow); outP = Sp + Ru * (E0 - S0) + R * (pP - E0); outN = R * pN; }
    }
    pP = outP; pN = normalize(outN);
  }
  objectNormal = pN;
`;
export const PERSON_BEGIN_GLSL = `
  transformed = pP;
  if (pOpt > 0 && ((pStyle >> (pOpt - 1)) & 1) == 0) transformed = vec3(0.0, 1.1, 0.0);
`;
// Colour slot -> instance colour, with outfit switches (shorts / short sleeves show skin, white shoes).
export const PERSON_COLOR_GLSL = `
  {
    float m = aInfo.y;
    float jj = aInfo.w;
    int st = int(iAnim.z + 0.5);
    vec3 c = m < 0.5 ? iSkin : m < 1.5 ? iShirt : m < 2.5 ? iPants : m < 3.5 ? vColor.rgb : m < 4.5 ? iHair : iAcc;
    if (m > 1.5 && m < 2.5 && ((st >> 14) & 1) == 1 && ((jj == 3.0 || jj == 6.0) && position.y < 0.6 || jj == 4.0 || jj == 7.0)) c = iSkin;
    if (m > 0.5 && m < 1.5 && ((st >> 15) & 1) == 1 && ((jj == 9.0 || jj == 11.0) && position.y < 1.3 || jj == 10.0 || jj == 12.0)) c = iSkin;
    if (m > 2.5 && m < 3.5 && (jj == 5.0 || jj == 8.0) && vColor.r > 0.1 && ((st >> 16) & 1) == 1) c = vec3(0.86, 0.86, 0.84);
    vColor.rgb = c;
  }
`;

// ---------------- Ragdoll Detached Body Parts ----------------
// Each detached body part is centered around (0, 0, 0) in its own local space so it can
// tumble in 3D and settle horizontally on the ground when a pedestrian is hit. Built from the same
// sculpted parts as the walking figure (far detail level).
// aSlot: 0 = fixed vertex color, 1 = primary instance color (iColA), 2 = secondary instance color (iColB).
export const RAGDOLL_PART_SPECS = [
  { name: 'head', ox: 0.0, oy: 1.62, oz: 0.0, r: 0.14 },
  { name: 'torso', ox: 0.0, oy: 1.15, oz: 0.0, r: 0.16 },
  { name: 'armL', ox: -0.2, oy: 1.12, oz: 0.0, r: 0.12 },
  { name: 'armR', ox: 0.2, oy: 1.12, oz: 0.0, r: 0.12 },
  { name: 'legL', ox: -0.09, oy: 0.47, oz: 0.0, r: 0.12 },
  { name: 'legR', ox: 0.09, oy: 0.47, oz: 0.0, r: 0.12 },
  { name: 'accessory', ox: 0.0, oy: 1.22, oz: -0.165, r: 0.12 },
];

function buildPartBuffer(pieces, spec) {
  const pos = [], nor = [], col = [], slot = [], idx = [];
  for (const pc of pieces) {
    const g = pc.geom;
    const p = g.attributes.position, n = g.attributes.normal;
    const rgb = pc.rgb || DARK;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i) - spec.ox, p.getY(i) - spec.oy, p.getZ(i) - spec.oz);
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(rgb[0], rgb[1], rgb[2]);
      slot.push(pc.slot || 0);
    }
    if (g.index) for (const i of g.index.array) idx.push(base + i);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
  geom.setIndex(idx);
  geom.computeBoundingSphere();
  return geom;
}

export function createRagdollPartGeometries() {
  const parts = personParts({ indexed: true, lod: 1 });
  const groups = { head: [], torso: [], armL: [], armR: [], legL: [], legR: [], accessory: [] };
  const keepOpt = new Set([0, OPT.HAIR_SHORT, OPT.BACKPACK]);
  for (const pt of parts) {
    if (!keepOpt.has(pt.opt)) { pt.geom.dispose(); continue; }
    const j = pt.joint;
    let name = null, slot = 0;
    if (pt.opt === OPT.BACKPACK) { name = 'accessory'; slot = 1; }
    else if (j === J.HEAD || j === J.NECK) { name = 'head'; slot = pt.mat === MAT.HAIR ? 2 : pt.mat === MAT.FIXED ? 0 : 1; }
    else if (j === J.TORSO || j === J.CHEST || j === J.PELVIS) { name = 'torso'; slot = pt.mat === MAT.PANTS ? 2 : pt.mat === MAT.FIXED ? 0 : 1; }
    else if (j === J.LUPPER || j === J.LFORE) { name = 'armL'; slot = pt.mat === MAT.SKIN ? 2 : 1; }
    else if (j === J.RUPPER || j === J.RFORE) { name = 'armR'; slot = pt.mat === MAT.SKIN ? 2 : 1; }
    else if (j >= J.LTHIGH && j <= J.LFOOT) { name = 'legL'; slot = pt.mat === MAT.FIXED ? 0 : 1; }
    else if (j >= J.RTHIGH && j <= J.RFOOT) { name = 'legR'; slot = pt.mat === MAT.FIXED ? 0 : 1; }
    if (!name) { pt.geom.dispose(); continue; }
    groups[name].push({ geom: pt.geom, slot, rgb: pt.rgb });
  }
  const out = {};
  for (const spec of RAGDOLL_PART_SPECS) out[spec.name] = buildPartBuffer(groups[spec.name], spec);
  return out;
}
