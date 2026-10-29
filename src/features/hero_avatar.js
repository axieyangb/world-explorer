// [hero-vehicles] Detailed player character: a modern soldier in olive tactical gear (high-cut helmet with
// goggles, plate carrier with pouches, assault pack, gloves, knee pads, boots). Limbs and torso are lofted
// from superellipse cross-sections along smooth radius profiles; the head is a sculpted sphere (jaw, brow,
// nose, lips, eye sockets) with vertex-coloured skin, stubble and hairline.
// Local frame matches entities.js: +Z forward, +Y up, soles at y = 0, about 1.8 m tall.
//
// Animation contract (main.js / walker_weapons.js): userData.leftLeg/rightLeg pivot at the hip and
// leftArm/rightArm at the shoulder line (x = 0, like the old model, so walker_weapons' weapon rig offset
// (0.265, -0.52, 0.06) in rightArm space still lands in the hand). The game only writes those pivots;
// everything below them is posed here, once per frame, from the pivot rotations:
//   - the hip swing is softened, the knee flexes in the swing phase (from the swing velocity), the ankle
//     keeps the sole level, and the whole body drops so the lowest sole touches y = 0 (no sinking/floating);
//   - with a weapon in the rig, a two-bone IK puts the gun hand on the pistol grip and the support hand on
//     the fore-end (elbows dropped, wrists rolled to the grip); unarmed, the elbow flexes with the swing.
// The pose runs in the root's updateMatrixWorld, i.e. right before the frame's matrices are computed, so
// shadows and the weapon see the same pose with no frame lag and main.js needs no change.
import * as THREE from '../../vendor/three.module.js';
import { curve } from './hero_vehicles.js';

const HIP_H = 0.93;       // hip pivot height
const SHOULDER_H = 1.46;  // shoulder pivot height
const THIGH = 0.43, SHIN = 0.41, ANKLE_SOLE = 0.09; // HIP_H = THIGH + SHIN + ANKLE_SOLE
const UPPER = 0.31, FORE = 0.26, GRIP = 0.075;      // shoulder->elbow, elbow->wrist, wrist->fist centre
const SHOULDER_X = 0.195;
const HEEL_Z = -0.082, TOE_Z = 0.218;

// ---------------------------------------------------------------------------------------------------
// Geometry helpers (indexed BufferGeometry, position + normal only, so parts can be merged per material).

// Closes a stack of rings (each `m` points) into a tube with pole caps, outward winding, smooth normals.
function tubeFromRings(rings, m, centers, caps = true) {
  const n = rings.length;
  const pos = new Float32Array((n * m + 2) * 3);
  for (let i = 0; i < n; i++) pos.set(rings[i], i * m * 3);
  const ia = n * m, ib = n * m + 1;
  pos.set(centers[0], ia * 3);
  pos.set(centers[n - 1], ib * 3);
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + ((j + 1) % m), c = a + m, d = b + m;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let j = 0; j < m && caps; j++) {
    idx.push(ia, j, (j + 1) % m);
    idx.push(ib, (n - 1) * m + ((j + 1) % m), (n - 1) * m + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Winding check on a mid ring: normals must point away from the ring centre.
  const k = Math.floor(n / 2), nrm = g.attributes.normal;
  let dot = 0;
  for (let j = 0; j < m; j++) {
    const v = k * m + j;
    for (let c = 0; c < 3; c++) dot += nrm.array[v * 3 + c] * (pos[v * 3 + c] - centers[k][c]);
  }
  if (dot < 0) {
    for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// Superellipse ring coordinates (exponent p: 2 = ellipse, larger = boxier).
function se(th, p) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / p;
  return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
}

// Loft along Y: at(t) -> { x, y, z, rx, rf, rb, p }. rf is the +Z (front) half-depth, rb the back.
function loftY(n, m, at) {
  const rings = [], centers = [];
  for (let i = 0; i <= n; i++) {
    const r = at(i / n), ring = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) {
      const [u, w] = se((j / m) * Math.PI * 2, r.p || 2);
      ring[j * 3] = r.x + r.rx * u;
      ring[j * 3 + 1] = r.y;
      ring[j * 3 + 2] = r.z + (w >= 0 ? r.rf : r.rb) * w;
    }
    rings.push(ring); centers.push([r.x, r.y, r.z]);
  }
  return tubeFromRings(rings, m, centers);
}

// Loft along Z (feet): at(t) -> { x, y, z, rx, rt, rb, p }; rt is the top half-height, rb the bottom.
function loftZ(n, m, at) {
  const rings = [], centers = [];
  for (let i = 0; i <= n; i++) {
    const r = at(i / n), ring = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) {
      const [u, w] = se((j / m) * Math.PI * 2, r.p || 2);
      ring[j * 3] = r.x + r.rx * u;
      ring[j * 3 + 1] = r.y + (w >= 0 ? r.rt : r.rb) * w;
      ring[j * 3 + 2] = r.z;
    }
    rings.push(ring); centers.push([r.x, r.y, r.z]);
  }
  return tubeFromRings(rings, m, centers);
}

// Profile loft: keys = [[y, rx, rf, rb], ...] from top to bottom (any order), optional x / z / p.
function limb(keys, { x = 0, z = 0, p = 2, n = 22, m = 20, zKeys = null } = {}) {
  const ys = keys.map((k) => k[0]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const fx = curve(sorted.map((k) => [k[0], k[1]]));
  const ff = curve(sorted.map((k) => [k[0], k[2]]));
  const fb = curve(sorted.map((k) => [k[0], k[3]]));
  const fz = zKeys ? curve(zKeys) : () => z;
  return loftY(n, m, (t) => {
    const y = y0 + (y1 - y0) * t;
    return { x, y, z: fz(y), rx: fx(y), rf: ff(y), rb: fb(y), p };
  });
}

// Rounded box: a subdivided box whose vertices are pushed onto a radius-r shell around an inner box.
function rbox(w, h, d, r, n = 6) {
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
  const iu = 2 / n, v = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    for (let c = 0; c < 3; c++) {
      const u = pos.getComponent(i, c) * 2, au = Math.abs(u), hi = half[c] - r;
      const cc = au <= iu + 1e-6 ? hi * (au / iu) : hi + r * Math.tan(((au - iu) / (1 - iu)) * Math.PI / 4);
      v[c] = Math.sign(u) * cc;
      inner[c] = Math.max(-hi, Math.min(hi, v[c]));
    }
    const dx = v[0] - inner[0], dy = v[1] - inner[1], dz = v[2] - inner[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    pos.setXYZ(i, inner[0] + (dx / L) * r, inner[1] + (dy / L) * r, inner[2] + (dz / L) * r);
    nrm.setXYZ(i, dx / L, dy / L, dz / L);
  }
  g.deleteAttribute('uv');
  return g;
}

// Wraps a geometry built flat (x along the arc, +z outward) around a vertical ellipse (rx, rz), so x = 0
// lands at the front (+Z). Used for the goggles and the goggle strap.
function wrapY(g, rx, rz) {
  const pos = g.attributes.position, nrm = g.attributes.normal, R = (rx + rz) / 2;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i) / R, s = Math.sin(a), c = Math.cos(a), z = pos.getZ(i);
    pos.setXYZ(i, (rx + z) * s, pos.getY(i), (rz + z) * c);
    const nx = nrm.getX(i), nz = nrm.getZ(i);
    nrm.setXYZ(i, nx * c + nz * s, nrm.getY(i), -nx * s + nz * c);
  }
  return g;
}

// Sweeps a rounded rectangle (half sizes rw x rh) along a Catmull-Rom path; rh lies along hint(p).
function sweep(points, rw, rh, hint, { n = 24, m = 12, p = 4 } = {}) {
  const path = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  const rings = [], centers = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.getPointAt(t, P); path.getTangentAt(t, T);
    B.copy(hint(P)); B.addScaledVector(T, -B.dot(T)).normalize();
    N.crossVectors(T, B).normalize();
    const ring = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) {
      const [u, w] = se((j / m) * Math.PI * 2, p);
      ring[j * 3] = P.x + N.x * rw * u + B.x * rh * w;
      ring[j * 3 + 1] = P.y + N.y * rw * u + B.y * rh * w;
      ring[j * 3 + 2] = P.z + N.z * rw * u + B.z * rh * w;
    }
    rings.push(ring); centers.push([P.x, P.y, P.z]);
  }
  return tubeFromRings(rings, m, centers);
}

function capsule(a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A), len = dir.length();
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  g.deleteAttribute('uv');
  return g;
}

function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.deleteAttribute('uv');
  return g;
}

const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  if (rx || ry || rz) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};

// Merges indexed geometries (position, normal, optional color) into one.
function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const hasCol = geos.some((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(nv * 3).fill(1) : null;
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3);
    nrm.set(g.attributes.normal.array, ov * 3);
    if (col && g.attributes.color) col.set(g.attributes.color.array, ov * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += g.attributes.position.count; oi += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Collects geometry per (parent, material) and emits one mesh per pair.
class Parts {
  constructor() { this.map = new Map(); }
  add(parent, mat, ...geos) {
    let e = this.map.get(parent);
    if (!e) { e = new Map(); this.map.set(parent, e); }
    if (!e.has(mat)) e.set(mat, []);
    e.get(mat).push(...geos);
  }
  build() {
    const meshes = [];
    for (const [parent, e] of this.map) {
      for (const [mat, geos] of e) {
        const mesh = new THREE.Mesh(merge(geos), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        meshes.push(mesh);
      }
    }
    return meshes;
  }
}

function makeMaterials() {
  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0x6a4a16, roughness: 0.06, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.04,
  });
  lens.userData.envProbe = true;
  return {
    skin: std(0xffffff, 0.62, 0, { vertexColors: true }),
    skinFlat: std(0xc89270, 0.62),
    shirt: std(0x56603f, 0.9),       // olive combat shirt
    pants: std(0x4c5238, 0.88),      // olive drab fatigue trousers
    vest: std(0x3b4430, 0.86),       // plate carrier
    webbing: std(0x2b3122, 0.8),     // straps, flaps, belt
    pack: std(0x434b35, 0.88),
    glove: std(0x262622, 0.68),
    rubber: std(0x1a1b19, 0.62),     // knee pads, knuckle guards, goggle frame
    boot: std(0x75664a, 0.82),       // coyote leather
    sole: std(0x161615, 0.9),
    helmet: std(0x4b5440, 0.62, 0.05),
    metal: std(0x2c2e2c, 0.4, 0.7),
    eyeWhite: std(0xe6e1d8, 0.35),
    iris: std(0x33241a, 0.3),
    dark: std(0x1a1310, 0.85),       // brows, mouth line
    lens,
  };
}

// ---------------------------------------------------------------------------------------------------
// Head: sculpted sphere in head-local space (centre of the skull), +Z forward.

const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HEAD_R = [0.076, 0.104, 0.093];
const EYE = { x: 0.03, y: 0.008 };
const HEAD_POS = [0, 1.684, 0.02];
const HEAD_SCALE = 1.07;

// Side profile of the face (head-local y -> z at the centreline): upright forehead, brow, flat cheeks,
// lips forward of the chin, then the flat underside of the jaw back to the neck.
const FACE_PROFILE = curve([
  [-0.104, 0.05], [-0.1, 0.072], [-0.09, 0.083], [-0.075, 0.081], [-0.055, 0.088], [-0.03, 0.088],
  [0.0, 0.09], [0.025, 0.094], [0.045, 0.088], [0.07, 0.072], [0.09, 0.045], [0.104, 0.0],
]);

// Deformed head surface point for a unit-sphere direction (ux, uy, uz).
function headPoint(ux, uy, uz) {
  let x = ux * HEAD_R[0], y = uy * HEAD_R[1], z = uz * HEAD_R[2];
  if (uz < 0) z *= 1 + 0.12 * smooth(-0.6, 0.4, uy);              // occiput
  if (uy < 0) {                                                    // jaw and chin taper
    const j = smooth(0, 1, -uy);
    x *= 1 - 0.3 * j * j;
    if (uz < 0) z *= 1 - 0.25 * j;                                 // the skull narrows into the nape
  }
  if (uz > 0) {
    // Front half follows the face profile; across the face the section is a flattened arc.
    const ring = Math.max(0.12, Math.sqrt(Math.max(0, 1 - uy * uy)));
    const ca = Math.min(1, uz / ring);
    z = FACE_PROFILE(y) * ca ** 0.75;
  }
  const front = smooth(0.25, 0.7, uz);
  const ax = Math.abs(x);
  let dz = 0;
  dz -= 0.0075 * gauss(ax, y, EYE.x, EYE.y, 0.012, 0.009);         // eye sockets
  dz += 0.005 * gauss(ax, y, 0.028, 0.03, 0.02, 0.007);             // brow ridge
  dz += 0.005 * gauss(ax, y, 0.047, -0.014, 0.014, 0.014);          // cheekbones
  dz += 0.004 * gauss(x, y, 0, -0.054, 0.016, 0.009);               // lips
  dz -= 0.002 * gauss(x, y, 0, -0.071, 0.02, 0.005);                // groove under the lower lip
  dz += 0.004 * gauss(x, y, 0, -0.09, 0.018, 0.01);                 // chin
  const t = (0.016 - y) / 0.05;                                     // nose: bridge (t = 0) to tip (t = 1)
  let a = 0.005 + 0.021 * Math.max(0, Math.min(1, t)) ** 1.4;
  if (t > 1) a *= Math.exp(-(((t - 1) / 0.12) ** 2));
  if (t < 0) a *= Math.exp(-((t / 0.35) ** 2));
  const sx = 0.0055 + 0.0075 * Math.max(0, Math.min(1, t));
  dz += a * Math.exp(-((x / sx) ** 2) / 2);
  return [x, y, z + dz * front];
}

// Front surface point at head-local (x, y), found by iterating the sphere direction.
function headAt(x, y) {
  let ux = x / HEAD_R[0], uy = y / HEAD_R[1], p = null;
  for (let i = 0; i < 12; i++) {
    const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    p = headPoint(ux, uy, uz);
    ux += (x - p[0]) / HEAD_R[0];
    uy += (y - p[1]) / HEAD_R[1];
  }
  return p;
}

function buildHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 96, 64);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(0xc89270), stub = new THREE.Color(0x8a6c58), hair = new THREE.Color(0x3b2c21);
  const lip = new THREE.Color(0xa86a5c), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i), uy = pos.getY(i), uz = pos.getZ(i);
    const [x, y, z] = headPoint(ux, uy, uz);
    pos.setXYZ(i, x, y, z);
    // Vertex colours: short hair at the back and sides, stubble on the jaw, lips.
    c.copy(skin);
    const hairW = smooth(0.0, 0.25, 0.1 - uz) * smooth(-0.6, -0.35, uy) * smooth(0.85, 0.6, Math.abs(ux) * (uz > 0 ? 1.4 : 0));
    c.lerp(hair, Math.min(1, hairW));
    c.lerp(stub, smooth(-0.2, -0.5, uy) * smooth(-0.3, 0.2, uz) * 0.38);
    c.lerp(lip, 0.75 * gauss(x, y, 0, -0.055, 0.014, 0.0065) * smooth(0.5, 0.8, uz));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildHead(P, M, parent) {
  const head = new THREE.Group();
  head.position.set(...HEAD_POS);
  head.scale.setScalar(HEAD_SCALE);
  parent.add(head);
  P.add(head, M.skin, buildHeadGeometry());
  for (const s of [-1, 1]) {
    // Eyes sit in the sockets: white, iris, and a skin lid over the top.
    const ex = s * EYE.x, ey = EYE.y, ez = headAt(ex, ey)[2] - 0.0095;
    P.add(head, M.eyeWhite, place(ellipsoid(0.0118, 0.0118, 0.0118, 14, 10), ex, ey, ez));
    P.add(head, M.iris, place(ellipsoid(0.0056, 0.0056, 0.003, 12, 8), ex, ey, ez + 0.0106));
    const lid = new THREE.SphereGeometry(0.0127, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
    lid.deleteAttribute('uv');
    P.add(head, M.skinFlat, place(lid, ex, ey + 0.0005, ez, 0.8, 0, 0));
    // Brows follow the brow ridge.
    const bz = headAt(s * 0.03, 0.027)[2];
    P.add(head, M.dark, place(rbox(0.032, 0.0055, 0.006, 0.0027, 4), s * 0.03, 0.027, bz - 0.0005, -0.2, s * 0.3, -s * 0.1));
    // Ears.
    P.add(head, M.skinFlat, place(ellipsoid(0.01, 0.028, 0.019, 12, 10), s * 0.072, -0.004, -0.012, 0, s * 0.3, s * 0.08));
    P.add(head, M.skinFlat, place(ellipsoid(0.006, 0.02, 0.012, 10, 8), s * 0.076, -0.004, -0.012, 0, s * 0.3, s * 0.08));
  }
  P.add(head, M.dark, place(rbox(0.026, 0.0018, 0.003, 0.0008, 4), 0, -0.0555, headAt(0, -0.0555)[2] - 0.0008));
  return head;
}

// High-cut helmet shell: rim height varies with azimuth (low at the back, high over the ears and brow).
function helmetShell(rx, ry, rz, rimKeys, outer) {
  const rim = curve(rimKeys);
  const m = 48, rows = 18, rings = [], centers = [];
  for (let k = 1; k <= rows; k++) {
    const ring = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) {
      const phi = (j / m) * Math.PI * 2;
      const e = (k / rows) * Math.acos(rim(Math.cos(phi)));
      ring[j * 3] = Math.sin(e) * Math.sin(phi) * rx;
      ring[j * 3 + 1] = Math.cos(e) * ry;
      ring[j * 3 + 2] = Math.sin(e) * Math.cos(phi) * rz;
    }
    rings.push(ring); centers.push([0, Math.cos((k / rows) * 1.2) * ry, 0]);
  }
  const g = tubeFromRings([new Float32Array(m * 3).fill(0).map((_, i) => (i % 3 === 1 ? ry : 0)), ...rings], m,
    [[0, ry, 0], ...centers], false);
  if (!outer) {
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    g.computeVertexNormals();
  }
  return { g, rings };
}

function buildHelmet(P, M, parent) {
  const helm = new THREE.Group();
  helm.position.set(0, 1.724, 0.006);
  helm.scale.setScalar(HEAD_SCALE);
  parent.add(helm);
  const R = [0.111, 0.108, 0.126];
  const rimKeys = [[-1, -0.4], [-0.3, -0.12], [0.2, 0.0], [0.7, 0.12], [1, 0.16]];
  const outer = helmetShell(R[0], R[1], R[2], rimKeys, true);
  const inner = helmetShell(R[0] - 0.012, R[1] - 0.012, R[2] - 0.012, rimKeys, false);
  P.add(helm, M.helmet, outer.g);
  P.add(helm, M.rubber, inner.g);
  // Rubber edge trim joining outer and inner rims.
  const o = outer.rings[outer.rings.length - 1], i = inner.rings[inner.rings.length - 1];
  const m = o.length / 3, pos = [], idx = [];
  for (let j = 0; j < m; j++) {
    for (const [arr, dy] of [[o, 0.004], [o, -0.003], [i, -0.003], [i, 0.004]]) pos.push(arr[j * 3], arr[j * 3 + 1] + dy, arr[j * 3 + 2]);
  }
  for (let j = 0; j < m; j++) {
    const a = j * 4, b = ((j + 1) % m) * 4;
    for (let r = 0; r < 3; r++) idx.push(a + r, b + r, a + r + 1, a + r + 1, b + r, b + r + 1);
  }
  const trim = new THREE.BufferGeometry();
  trim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  trim.setIndex(idx);
  trim.computeVertexNormals();
  const tm = new THREE.Mesh(trim, new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.7, side: THREE.DoubleSide }));
  tm.castShadow = true;
  helm.add(tm);
  // Side accessory rails, NVG shroud, velcro crown patch, rear counterweight pouch.
  for (const s of [-1, 1]) {
    P.add(helm, M.rubber, place(rbox(0.014, 0.022, 0.1, 0.006, 4), s * 0.106, 0.012, -0.006, 0, 0, s * 0.18));
    P.add(helm, M.metal, place(rbox(0.008, 0.012, 0.02, 0.003, 4), s * 0.112, 0.014, 0.03, 0, 0, s * 0.18));
  }
  P.add(helm, M.rubber, place(rbox(0.048, 0.03, 0.02, 0.008, 4), 0, 0.022, 0.12, -0.3, 0, 0));
  P.add(helm, M.vest, place(rbox(0.085, 0.012, 0.07, 0.005, 4), 0, 0.104, -0.012, -0.1, 0, 0));
  P.add(helm, M.vest, place(rbox(0.075, 0.045, 0.026, 0.009, 4), 0, -0.005, -0.122, -0.25, 0, 0));
  // Goggles pushed up on the helmet, tilted back with the shell: strap around it, rubber frame, one
  // wide amber lens.
  const gog = new THREE.Group();
  gog.rotation.x = -0.5;
  helm.add(gog);
  const gy = 0.035, ef = Math.sqrt(1 - (gy / R[1]) ** 2);
  const ex = R[0] * ef, ez = R[2] * ef;
  P.add(gog, M.webbing, place(wrapY(rbox(0.68, 0.022, 0.005, 0.0024, 6), ex + 0.001, ez + 0.001), 0, gy, 0));
  P.add(gog, M.rubber, place(wrapY(rbox(0.19, 0.05, 0.016, 0.008, 8), ex + 0.008, ez + 0.008), 0, gy, 0));
  P.add(gog, M.lens, place(wrapY(rbox(0.168, 0.036, 0.006, 0.005, 8), ex + 0.0165, ez + 0.0165), 0, gy, 0));
  // Chin strap: hugs the head surface from the side rails down the jaw to under the chin.
  const hx = (HEAD_POS[0] - helm.position.x) / HEAD_SCALE, hy = (HEAD_POS[1] - helm.position.y) / HEAD_SCALE;
  const hz = (HEAD_POS[2] - helm.position.z) / HEAD_SCALE;
  for (const s of [-1, 1]) {
    const pts = [];
    const dirs = [[0.98, 0.2, 0.02], [0.96, -0.2, 0.1], [0.86, -0.48, 0.17], [0.6, -0.76, 0.3], [0.3, -0.9, 0.36], [0, -0.92, 0.4]];
    for (const [ux, uy, uz] of dirs) {
      const L = Math.hypot(ux, uy, uz);
      const p = headPoint((s * ux) / L, uy / L, uz / L), r = Math.hypot(p[0], p[1], p[2]), k = 1 + 0.0045 / r;
      pts.push([p[0] * k + hx, p[1] * k + hy, p[2] * k + hz]);
    }
    pts[0] = [s * 0.1, -0.005, -0.012];
    P.add(helm, M.webbing, sweep(pts, 0.0055, 0.0016, (p) => new THREE.Vector3(p.x - hx, p.y - hy, p.z - hz).normalize(), { n: 18, m: 8 }));
  }
  return helm;
}

// ---------------------------------------------------------------------------------------------------
// Torso, vest and pack (static, body frame).

const TORSO = [
  // y,     rx,    rf,    rb
  [0.83, 0.06, 0.05, 0.06],
  [0.875, 0.15, 0.088, 0.105],
  [0.95, 0.178, 0.1, 0.123],
  [1.02, 0.166, 0.095, 0.104],
  [1.08, 0.153, 0.093, 0.09],
  [1.16, 0.151, 0.096, 0.089],
  [1.24, 0.158, 0.105, 0.096],
  [1.32, 0.166, 0.116, 0.101],
  [1.40, 0.17, 0.11, 0.1],
  [1.46, 0.158, 0.086, 0.09],
  [1.50, 0.118, 0.066, 0.072],
  [1.535, 0.058, 0.05, 0.055],
];

function torsoProfile() {
  const fx = curve(TORSO.map((k) => [k[0], k[1]])), ff = curve(TORSO.map((k) => [k[0], k[2]]));
  const fb = curve(TORSO.map((k) => [k[0], k[3]]));
  return { fx, ff, fb };
}

function buildTorso(P, M, body) {
  const { fx, ff, fb } = torsoProfile();
  const band = (y0, y1, grow, p, n, mat) => P.add(body, mat, loftY(n, 36, (t) => {
    const y = y0 + (y1 - y0) * t;
    const end = t === 0 || t === 1 ? 0.6 : 1;
    return { x: 0, y, z: 0, rx: (fx(y) + grow) * end, rf: (ff(y) + grow) * end, rb: (fb(y) + grow) * end, p };
  }));
  band(0.8, 1.03, 0, 2.3, 16, M.pants);
  band(0.99, 1.535, 0, 2.3, 30, M.shirt);
  // Collar of the combat shirt.
  P.add(body, M.shirt, limb([[1.578, 0.065, 0.061, 0.067], [1.55, 0.071, 0.067, 0.073], [1.5, 0.085, 0.075, 0.082]], { n: 6, m: 28 }));
  // Neck.
  P.add(body, M.skinFlat, limb([[1.655, 0.05, 0.05, 0.05], [1.61, 0.056, 0.057, 0.06], [1.5, 0.063, 0.059, 0.065]], { n: 10, m: 24, zKeys: [[1.5, -0.008], [1.655, 0.0]] }));
  // Belt with buckle and pouches.
  P.add(body, M.webbing, loftY(4, 40, (t) => {
    const y = 0.975 + 0.05 * t, gr = 0.012;
    return { x: 0, y, z: 0, rx: fx(y) + gr, rf: ff(y) + gr, rb: fb(y) + gr, p: 2.3 };
  }));
  P.add(body, M.metal, place(rbox(0.052, 0.04, 0.012, 0.004, 4), 0, 1.0, ff(1.0) + 0.016));
  P.add(body, M.webbing, place(rbox(0.07, 0.09, 0.05, 0.015), -0.11, 0.98, -0.135, 0, 0.5, 0));
  P.add(body, M.webbing, place(rbox(0.09, 0.07, 0.045, 0.015), 0.08, 0.985, -0.14, 0, -0.45, 0));

  // Plate carrier: front and back plate bags, cummerbund, shoulder straps.
  const fz = 0.137, bz = -0.128;
  P.add(body, M.vest, place(rbox(0.3, 0.32, 0.056, 0.022), 0, 1.275, fz, 0.07, 0, 0));
  P.add(body, M.vest, place(rbox(0.3, 0.34, 0.05, 0.02), 0, 1.285, bz, -0.04, 0, 0));
  P.add(body, M.vest, loftY(6, 40, (t) => {
    const y = 1.08 + 0.13 * t, gr = 0.024;
    return { x: 0, y, z: 0, rx: fx(y) + gr, rf: ff(y) + gr, rb: fb(y) + gr, p: 2.6 };
  }));
  for (const s of [-1, 1]) {
    const pts = [[s * 0.105, 1.41, 0.15], [s * 0.112, 1.48, 0.1], [s * 0.118, 1.522, 0.005], [s * 0.112, 1.48, -0.1], [s * 0.105, 1.41, -0.14]];
    P.add(body, M.vest, sweep(pts, 0.034, 0.008, (p) => new THREE.Vector3(0, p.y - 1.33, p.z).normalize(), { n: 22, m: 12 }));
  }
  // MOLLE rows on the front plate, triple magazine pouches with flaps, admin pouch.
  for (let r = 0; r < 3; r++) P.add(body, M.webbing, place(rbox(0.29, 0.012, 0.006, 0.003, 4), 0, 1.31 + r * 0.035, fz + 0.03 - r * 0.0024, 0.07, 0, 0));
  for (const x of [-0.088, 0, 0.088]) {
    P.add(body, M.vest, place(rbox(0.078, 0.11, 0.046, 0.012), x, 1.185, fz + 0.045, 0.07, 0, 0));
    P.add(body, M.webbing, place(rbox(0.08, 0.034, 0.05, 0.01), x, 1.235, fz + 0.05, 0.12, 0, 0));
    P.add(body, M.metal, place(rbox(0.016, 0.012, 0.006, 0.002, 4), x, 1.218, fz + 0.077, 0.07, 0, 0));
  }
  P.add(body, M.vest, place(rbox(0.16, 0.07, 0.024, 0.01), 0, 1.385, fz + 0.034, 0.07, 0, 0));
  // Radio pouch and antenna on the left side, tourniquet on the right.
  P.add(body, M.vest, place(rbox(0.05, 0.12, 0.07, 0.014), -0.185, 1.16, -0.03));
  const ant = new THREE.CylinderGeometry(0.004, 0.006, 0.36, 6);
  ant.deleteAttribute('uv');
  P.add(body, M.rubber, place(ant, -0.17, 1.39, -0.07, -0.12, 0, 0.12));
  P.add(body, M.webbing, place(rbox(0.04, 0.1, 0.045, 0.014), 0.182, 1.15, 0.02));

  // Assault pack on the back plate: body, lid, front pocket, compression straps, grab handle.
  const pz = bz - 0.025 - 0.07;
  P.add(body, M.pack, place(rbox(0.28, 0.37, 0.14, 0.04), 0, 1.255, pz));
  P.add(body, M.pack, place(rbox(0.25, 0.07, 0.12, 0.03), 0, 1.445, pz + 0.005, 0.05, 0, 0));
  P.add(body, M.pack, place(rbox(0.21, 0.17, 0.045, 0.02), 0, 1.17, pz - 0.085));
  for (const x of [-0.13, 0.13]) {
    P.add(body, M.webbing, place(rbox(0.026, 0.34, 0.006, 0.0025, 4), x, 1.25, pz - 0.071));
    P.add(body, M.metal, place(rbox(0.03, 0.02, 0.01, 0.003, 4), x, 1.3, pz - 0.076));
  }
  P.add(body, M.webbing, place(rbox(0.23, 0.02, 0.05, 0.006, 4), 0, 1.2, pz - 0.105));
  const handle = new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI);
  handle.deleteAttribute('uv');
  P.add(body, M.webbing, place(handle, 0, 1.47, pz + 0.01));
}

// ---------------------------------------------------------------------------------------------------
// Limbs (built in each segment's own frame so the pivots can bend them).

function buildLeg(P, M, pivot, s) {
  const x = s * 0.092;
  const thigh = new THREE.Group();
  pivot.add(thigh);
  P.add(thigh, M.pants, limb([
    [0.08, 0.072, 0.072, 0.072], [0.02, 0.092, 0.092, 0.097], [-0.1, 0.09, 0.093, 0.094], [-0.22, 0.081, 0.084, 0.081],
    [-0.34, 0.067, 0.069, 0.064], [-0.42, 0.058, 0.06, 0.055], [-0.47, 0.03, 0.03, 0.03],
  ], { x, n: 24, m: 22 }));
  // Cargo pocket on the outer thigh; drop-leg holster on the gun side (+X).
  if (s < 0) {
    P.add(thigh, M.pants, place(rbox(0.03, 0.14, 0.1, 0.012), x + s * 0.082, -0.24, 0.0, 0, 0, s * 0.07));
    P.add(thigh, M.webbing, place(rbox(0.032, 0.03, 0.104, 0.01), x + s * 0.085, -0.17, 0.0, 0, 0, s * 0.07));
  } else {
    P.add(thigh, M.webbing, place(rbox(0.045, 0.17, 0.095, 0.016), x + 0.092, -0.17, -0.005));
    P.add(thigh, M.rubber, place(rbox(0.032, 0.07, 0.04, 0.01), x + 0.093, -0.06, -0.025, 0.2, 0, 0));
    for (const y of [-0.13, -0.24]) {
      P.add(thigh, M.webbing, loftY(2, 26, (t) => ({ x, y: y + t * 0.024, z: 0, rx: 0.084 - y * 0.03, rf: 0.086 - y * 0.03, rb: 0.083 - y * 0.03, p: 2 })));
    }
  }
  const shin = new THREE.Group();
  shin.position.set(0, -THIGH, 0);
  thigh.add(shin);
  P.add(shin, M.pants, limb([
    [0.05, 0.046, 0.046, 0.046], [0.0, 0.058, 0.058, 0.057], [-0.08, 0.058, 0.053, 0.07], [-0.16, 0.054, 0.048, 0.065],
    [-0.26, 0.043, 0.039, 0.046], [-0.33, 0.04, 0.038, 0.04], [-0.36, 0.03, 0.03, 0.03],
  ], { x, n: 20, m: 20 }));
  // Knee pad: hard cap over a padded shell, with a strap.
  P.add(shin, M.rubber, place(ellipsoid(0.058, 0.075, 0.03, 16, 12), x, -0.01, 0.045));
  P.add(shin, M.vest, place(ellipsoid(0.042, 0.052, 0.02, 14, 10), x, -0.01, 0.065));
  P.add(shin, M.webbing, loftY(2, 24, (t) => ({ x, y: -0.07 + t * 0.022, z: 0.005, rx: 0.06, rf: 0.06, rb: 0.07, p: 2 })));
  // Boot shaft with lacing and a padded collar.
  P.add(shin, M.boot, limb([
    [-0.2, 0.055, 0.058, 0.063], [-0.23, 0.051, 0.054, 0.058], [-0.33, 0.046, 0.05, 0.05], [-0.4, 0.045, 0.06, 0.05], [-0.43, 0.035, 0.04, 0.035],
  ], { x, n: 12, m: 22 }));
  P.add(shin, M.sole, limb([[-0.195, 0.057, 0.06, 0.066], [-0.215, 0.058, 0.061, 0.067]], { x, n: 2, m: 22 }));
  P.add(shin, M.webbing, place(rbox(0.024, 0.15, 0.006, 0.003, 4), x, -0.3, 0.054, -0.08, 0, 0));
  const foot = new THREE.Group();
  foot.position.set(0, -SHIN, 0);
  shin.add(foot);
  const fk = [
    // z,     y,      rx,    rt,    rb
    [-0.075, -0.045, 0.03, 0.03, 0.03],
    [-0.06, -0.045, 0.043, 0.045, 0.04],
    [-0.02, -0.05, 0.047, 0.055, 0.037],
    [0.04, -0.058, 0.05, 0.04, 0.03],
    [0.1, -0.062, 0.052, 0.031, 0.026],
    [0.16, -0.066, 0.048, 0.027, 0.022],
    [0.2, -0.07, 0.035, 0.02, 0.018],
    [0.215, -0.07, 0.015, 0.01, 0.01],
  ];
  const fc = (c) => curve(fk.map((k) => [k[0], k[c]]));
  const fy = fc(1), frx = fc(2), frt = fc(3), frb = fc(4);
  P.add(foot, M.boot, loftZ(24, 22, (t) => {
    const z = -0.075 + 0.29 * t;
    return { x, y: fy(z), z, rx: frx(z), rt: frt(z), rb: frb(z), p: 2.2 };
  }));
  // Toe cap, sole with a heel block, lace panel.
  P.add(foot, M.boot, place(ellipsoid(0.05, 0.025, 0.05, 14, 8), x, -0.064, 0.165));
  P.add(foot, M.sole, place(rbox(0.11, 0.024, 0.3, 0.01), x, -0.078, (HEEL_Z + TOE_Z) / 2));
  P.add(foot, M.sole, place(rbox(0.1, 0.014, 0.085, 0.006, 4), x, -0.064, -0.035));
  P.add(foot, M.webbing, place(rbox(0.028, 0.008, 0.1, 0.003, 4), x, -0.022, 0.04, -0.42, 0, 0));
  return { thigh, shin, foot };
}

function buildArm(P, M, pivot, s) {
  const upper = new THREE.Group();
  upper.position.set(s * SHOULDER_X, 0, 0);
  pivot.add(upper);
  P.add(upper, M.shirt, limb([
    [0.068, 0.02, 0.02, 0.02], [0.045, 0.05, 0.05, 0.05], [0.0, 0.063, 0.06, 0.058], [-0.06, 0.058, 0.055, 0.052],
    [-0.15, 0.049, 0.053, 0.046], [-0.24, 0.044, 0.045, 0.042], [-0.3, 0.041, 0.041, 0.041], [-0.34, 0.02, 0.02, 0.02],
  ], { n: 24, m: 20 }));
  // Blank velcro patch on the shoulder.
  P.add(upper, M.vest, place(rbox(0.008, 0.05, 0.065, 0.003, 4), s * 0.058, -0.06, 0.0, 0, 0, s * 0.08));
  const fore = new THREE.Group();
  fore.position.set(0, -UPPER, 0);
  upper.add(fore);
  P.add(fore, M.shirt, limb([
    [0.04, 0.02, 0.02, 0.02], [0.0, 0.04, 0.041, 0.04], [-0.05, 0.045, 0.046, 0.044], [-0.12, 0.04, 0.043, 0.041],
    [-0.19, 0.031, 0.036, 0.034], [-0.235, 0.027, 0.033, 0.031], [-0.255, 0.018, 0.02, 0.02],
  ], { n: 20, m: 20 }));
  // Glove cuff.
  P.add(fore, M.glove, limb([[-0.19, 0.031, 0.039, 0.037], [-0.24, 0.029, 0.036, 0.034], [-0.27, 0.02, 0.022, 0.022]], { n: 6, m: 20 }));
  const hand = new THREE.Group();
  hand.position.set(0, -FORE, 0);
  fore.add(hand);
  // Gloved fist (palm faces -s*X at rest). The grip hole runs along the hand's Z axis, thumb at +Z.
  P.add(hand, M.glove, place(rbox(0.032, 0.088, 0.082, 0.013), 0, -0.048, 0));
  const zf = [0.028, 0.0095, -0.009, -0.0265], lf = [1, 1.06, 1, 0.84], rf = [0.0098, 0.0098, 0.0094, 0.0086];
  for (let i = 0; i < 4; i++) {
    const L = lf[i], z = zf[i];
    const k = [-s * 0.002, -0.089, z];
    const p1 = [k[0] - s * 0.034 * L, k[1] - 0.012 * L, z];
    const p2 = [p1[0] - s * 0.004 * L, p1[1] + 0.026 * L, z];
    const p3 = [p2[0] + s * 0.012 * L, p2[1] + 0.012 * L, z];
    P.add(hand, M.glove, capsule(k, p1, rf[i]), capsule(p1, p2, rf[i] * 0.95), capsule(p2, p3, rf[i] * 0.88));
  }
  P.add(hand, M.glove, capsule([-s * 0.008, -0.026, 0.036], [-s * 0.03, -0.054, 0.046], 0.012),
    capsule([-s * 0.03, -0.054, 0.046], [-s * 0.04, -0.077, 0.034], 0.0105));
  P.add(hand, M.rubber, place(rbox(0.012, 0.026, 0.076, 0.005, 4), s * 0.017, -0.076, 0.0));
  P.add(hand, M.rubber, place(rbox(0.01, 0.04, 0.05, 0.004, 4), s * 0.017, -0.035, 0.0));
  return { upper, fore, hand };
}

// ---------------------------------------------------------------------------------------------------
// Pose solver (no allocations per frame).

// Hand targets in each weapon's own frame (rig children: rifle, RPG, railgun, in walker_weapons order).
const GRIP_PTS = [[0, -0.095, -0.06], [0, -0.095, 0.06], [0, -0.105, 0.02]].map((p) => new THREE.Vector3(...p));
const FORE_PTS = [[0, -0.04, 0.21], [0, -0.05, 0.28], [0, -0.06, 0.3]].map((p) => new THREE.Vector3(...p));
const _T = new THREE.Vector3(), _D = new THREE.Vector3(), _U = new THREE.Vector3(), _V = new THREE.Vector3();
const _E = new THREE.Vector3(), _F = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3();
const _Z = new THREE.Vector3(), _G = new THREE.Vector3(), _pole = new THREE.Vector3();
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion();
const _eul = new THREE.Euler();

// Two-bone IK in the arm pivot frame: shoulder at arm.upper.position, target T, elbow towards pole.
function solveArm(arm, T, pole, protract = 0) {
  const S = arm.upper.position, a = UPPER, b = FORE + GRIP;
  S.set(arm.side * SHOULDER_X, 0, 0);
  if (protract > 0) {
    // Out of reach: the shoulder blade slides the joint forward/inward towards the target.
    _D.subVectors(T, S);
    const over = _D.length() - (a + b) * 0.97;
    if (over > 0) S.addScaledVector(_D.normalize(), Math.min(protract, over));
  }
  _D.subVectors(T, S);
  let d = _D.length();
  _U.copy(_D).divideScalar(d || 1);
  d = Math.max(0.15, Math.min(d, (a + b) * 0.995));
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _V.copy(pole).addScaledVector(_U, -pole.dot(_U));
  if (_V.lengthSq() < 1e-6) _V.set(0, 0, -1);
  _V.normalize();
  _E.copy(S).addScaledVector(_U, a * cosA).addScaledVector(_V, a * sinA);
  _Y.subVectors(S, _E).divideScalar(a);                      // upper arm +Y points back up to the shoulder
  _F.copy(S).addScaledVector(_U, d).sub(_E).normalize();       // forearm direction
  const bend = Math.acos(Math.max(-1, Math.min(1, -_Y.dot(_F))));
  _Z.copy(_F).addScaledVector(_Y, -_F.dot(_Y));
  if (_Z.lengthSq() < 1e-8) _Z.copy(_V).negate();
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  _M.makeBasis(_X, _Y, _Z);
  arm.upper.quaternion.setFromRotationMatrix(_M);
  arm.fore.rotation.set(-bend, 0, 0);
}

// Rolls the fist about the forearm so its grip axis (local Z) follows `axis` (arm pivot frame).
function rollHand(arm, axis) {
  _Q.copy(arm.upper.quaternion).multiply(arm.fore.quaternion).invert();
  _G.copy(axis).applyQuaternion(_Q);
  arm.hand.rotation.set(0, Math.atan2(_G.x, _G.z), 0);
}

function fkArm(arm, s, swing) {
  arm.upper.position.set(s * SHOULDER_X, 0, 0);
  // Forward swing (negative pivot x) flexes the elbow most around a jog/guard pose, straight when reaching.
  const f = -swing;
  let bend = 0.22;
  if (f > 0) bend = f < 0.6 ? 0.22 + (f / 0.6) * 1.0 : Math.max(0.06, 1.22 - ((f - 0.6) / 0.9) * 1.16);
  arm.upper.quaternion.setFromEuler(_eul.set(0, 0, s * 0.11));
  arm.fore.rotation.set(-bend, 0, 0);
  arm.hand.rotation.set(0, 0, 0);
}

// Height of the lowest sole point under the hip, for a leg at (hip t1, knee k, ankle an).
function soleLow(t1, k, an) {
  const ay = HIP_H - THIGH * Math.cos(t1) - SHIN * Math.cos(t1 + k);
  const ph = t1 + k + an, c = Math.cos(ph), sn = Math.sin(ph);
  return ay + Math.min(-ANKLE_SOLE * c - HEEL_Z * sn, -ANKLE_SOLE * c - TOE_Z * sn);
}

function poseLeg(leg, now) {
  const x = leg.pivot.rotation.x;
  let dt = (now - leg.t) / 1000;
  if (dt > 0.004) {
    if (dt > 0.25) dt = 0.25;
    const v = (x - leg.x) / dt;
    const target = Math.max(0, Math.min(1, -v / 2.5));            // swinging forward = swing phase
    leg.sp += (target - leg.sp) * Math.min(1, dt * 18);
    leg.x = x; leg.t = now;
  }
  const t1 = x * 0.76;                                             // softer hip swing than the pivot
  const bump = Math.max(0, 1 - ((t1 - 0.08) / 0.5) ** 2);
  const k = 0.05 + 0.12 * Math.max(0, -t1) / 0.5 + 1.0 * leg.sp * bump;
  const an = -(t1 + k) + 0.35 * t1;                                // heel strike toes-up, push-off toes-down
  leg.thigh.rotation.x = t1 - x;
  leg.shin.rotation.x = k;
  leg.foot.rotation.x = an;
  return soleLow(t1, k, an);
}

export function buildHeroAvatar() {
  const M = makeMaterials();
  const P = new Parts();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkPivot = (y) => { const g = new THREE.Group(); g.position.set(0, y, 0); body.add(g); return g; };
  const leftLeg = mkPivot(HIP_H), rightLeg = mkPivot(HIP_H);
  const leftArm = mkPivot(SHOULDER_H), rightArm = mkPivot(SHOULDER_H);

  buildTorso(P, M, body);
  buildHead(P, M, body);
  buildHelmet(P, M, body);
  const legs = [[leftLeg, -1], [rightLeg, 1]].map(([pivot, s]) => ({ pivot, ...buildLeg(P, M, pivot, s), x: 0, t: 0, sp: 0 }));
  const armL = { pivot: leftArm, side: -1, ...buildArm(P, M, leftArm, -1) };
  const armR = { pivot: rightArm, side: 1, ...buildArm(P, M, rightArm, 1) };
  P.build();

  const own = new Set([armR.upper]);
  const poleR = new THREE.Vector3(0.75, -0.25, -1).normalize();
  const poleL = new THREE.Vector3(-0.75, -0.25, -1).normalize();

  const pose = () => {
    const now = performance.now();
    const low = Math.min(poseLeg(legs[0], now), poseLeg(legs[1], now));
    body.position.y = -low;

    // Weapon rig = the foreign child walker_weapons adds to the right arm pivot.
    let rig = null, wi = -1;
    for (const c of rightArm.children) if (!own.has(c)) { rig = c; break; }
    if (rig && rig.visible) {
      for (let i = 0; i < rig.children.length; i++) if (rig.children[i].visible) { wi = i; break; }
    }
    if (wi < 0) {
      fkArm(armR, 1, rightArm.rotation.x);
      fkArm(armL, -1, leftArm.rotation.x);
      return;
    }
    const gi = Math.min(wi, GRIP_PTS.length - 1);
    rig.updateMatrix();
    _T.copy(GRIP_PTS[gi]).applyMatrix4(rig.matrix);
    solveArm(armR, _T, _pole.copy(poleR));
    _Q2.copy(rig.quaternion);
    rollHand(armR, _T.set(0, 1, 0).applyQuaternion(_Q2));
    // Support hand on the fore-end while walker_weapons holds the aim pose (it sets leftArm z = 0.15);
    // during a punch the left arm follows the swing instead.
    if (Math.abs(leftArm.rotation.z - 0.15) < 0.02) {
      rightArm.updateMatrix(); leftArm.updateMatrix();
      _M.multiplyMatrices(rightArm.matrix, rig.matrix);
      _M2.copy(leftArm.matrix).invert().multiply(_M);
      _T.copy(FORE_PTS[gi]).applyMatrix4(_M2);
      solveArm(armL, _T, _pole.copy(poleL), 0.07);
      _Q.copy(leftArm.quaternion).invert().multiply(rightArm.quaternion).multiply(rig.quaternion);
      rollHand(armL, _T.set(0, 0, 1).applyQuaternion(_Q));
    } else {
      fkArm(armL, -1, leftArm.rotation.x);
    }
  };
  root.updateMatrixWorld = function updateMatrixWorld(force) {
    pose();
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };

  // Kept for API compatibility with updateEntityNitroVfx (no sci-fi effects on a soldier).
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  root.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  root.userData = {
    hero: true, leftLeg, rightLeg, leftArm, rightArm, armL: leftArm, armR: rightArm, legL: leftLeg, legR: rightLeg,
    nitroVfx, vfxParts,
  };
  pose();
  return root;
}
