// [hero-vehicles] [human-motion] Detailed player character: a random ordinary person generated from a seed
// (sex, build, height, skin tone, face, hair style and colour, everyday clothes: tee/shirt/hoodie/sweater/
// jacket/dress over jeans/chinos/shorts/skirt, sneakers/boots/dress shoes, optional glasses, cap, backpack
// or cross-body bag, watch). A modern soldier in tactical gear remains a rare outfit. Limbs and torso are
// lofted from superellipse cross-sections along smooth radius profiles; the head is a sculpted sphere with
// vertex-coloured skin, stubble and hairline, and hair is grown as a shell over the scalp.
// Local frame matches entities.js: +Z forward, +Y up, soles at y = 0, about 1.75 m tall.
//
// API: buildHeroAvatar({ seed }) (random seed by default). userData.look is the generated look,
// userData.reroll(seed?) rebuilds the person in place (same pivots, so attached weapons stay put).
//
// Animation contract (main.js / walker_weapons.js): userData.leftLeg/rightLeg pivot at the hip and
// leftArm/rightArm at the shoulder line (x = 0, like the old model, so walker_weapons' weapon rig offset
// (0.265, -0.52, 0.06) in rightArm space still lands in the hand). The game writes those pivots; this module
// poses everything below them once per frame (in the root's updateMatrixWorld, so shadows and the weapon
// see the same pose with no frame lag), cancelling the pivot rotation where it owns the joint:
//   - locomotion from distance travelled: walk -> run blend by speed, planted feet (two-bone leg IK, heel
//     strike / toe-off), pelvis rotation, drop and sway, bob lowest at contact, shoulder counter-rotation,
//     torso lean into acceleration, roll into turns, stabilised head;
//   - idle breathing, weight shift and looking around; jump tuck / fall / landing crouch;
//   - unarmed: relaxed counter-swinging arms with elbow bend (pumping when running), a jab/cross punch with
//     torso twist and guard hand;
//   - armed (a visible weapon in walker_weapons' rig, a foreign child of rightArm): two-bone IK puts the gun
//     hand on the pistol grip and the support hand on the fore-end; the legs keep walking/running underneath.
//     Armed/unarmed blend over 0.2 s.
// Optional motion input (main.js [human-motion] hook): userData.motion = { speed, grounded, vy, sprint,
// punch (0..1 progress or -1), punchHand ('L'|'R'), t (performance.now of the write) }.
import * as THREE from '../../vendor/three.module.js';
import { curve } from './hero_vehicles.js';

const HIP_H = 0.93;       // hip pivot height
const SHOULDER_H = 1.46;  // shoulder pivot height
const THIGH = 0.43, SHIN = 0.41, ANKLE_SOLE = 0.09; // HIP_H = THIGH + SHIN + ANKLE_SOLE
const UPPER = 0.31, FORE = 0.26, GRIP = 0.075;      // shoulder->elbow, elbow->wrist, wrist->fist centre
const SHOULDER_X = 0.195;
const HEEL_Z = -0.082, TOE_Z = 0.218;
const WAIST_Y = 1.0, NECK_Y = 1.56; // chest and head pivots

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
function loftY(n, m, at, caps = true) {
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
  return tubeFromRings(rings, m, centers, caps);
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

function makeSoldierMaterials() {
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
// Look: a deterministic random civilian from a seed.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN_TONES = [0xf3d2bd, 0xeac0a0, 0xe0b48f, 0xd9a47e, 0xc68c64, 0xa96e48, 0x8a5636, 0x6b3f26, 0x4e2c1b];
const HAIR_COLORS = [0x15100c, 0x15100c, 0x241810, 0x2b1d14, 0x3e2a1c, 0x5a3c26, 0x8a6a42, 0xc9a66b, 0x7a3a1c, 0x9c4a22];
const GREY_HAIR = [0x8f8a85, 0xb5b0aa, 0x6e6a66];
const TEE = [0xf2f2ef, 0x1d1d1f, 0x8c8f93, 0x24324f, 0xa3262a, 0x4b5a3a, 0xc9a13b, 0x2f7f86, 0x6e2238, 0xd98aa0, 0x8fb8de, 0xd8cbb0];
const HOODIE = [0x8c8f93, 0x1d1d1f, 0x24324f, 0xa3262a, 0x4b5a3a, 0xd9c7a8, 0x2f7f86, 0x6a4c93, 0xe8e6e0];
const JACKET = [0x1a1a1a, 0x3f5f86, 0x4b5338, 0x9a7650, 0x1f2a44, 0x7a2a22, 0x2d2d30];
const SHIRT = [0xf4f4f2, 0xa9c6e8, 0xe9dcc4, 0x7d8fa8, 0xd7e4d0, 0xf0d6d6, 0x2e3b55, 0x5b6b4e];
const SWEATER = [0x7a1f2b, 0x24324f, 0xc9b79c, 0x4b5a3a, 0x2b2b2e, 0x8a8f99, 0xb06a3b];
const DRESS = [0x1b1b1e, 0x7a1f2b, 0x1d3557, 0x2a9d8f, 0xe9c46a, 0xc94f6d, 0x6d597a, 0xf1faee, 0x8ecae6];
const JEANS = [0x2c3e5c, 0x34507a, 0x4a6a96, 0x1e2433, 0x5b6f8a, 0x26282e];
const CHINOS = [0xb59d75, 0xcfc0a0, 0x2a2a2c, 0x5d6168, 0x4d5536, 0x3a2f28];
const SKIRTS = [0x1b1b1e, 0x24324f, 0x7a1f2b, 0xc2a57e, 0x3d405b, 0x5c4033, 0x4a6a96];
const SNEAKERS = [0xf2f2f0, 0xf2f2f0, 0xf2f2f0, 0x1c1c1e, 0x6f7378, 0xb3261e, 0x22324f, 0xd9cbb0];
const BOOTS = [0x5a3d26, 0x1c1714, 0x7a5a3a];
const LEATHER = [0x1a1412, 0x3d2618];
const ACCENT = [0x111111, 0x2b2d42, 0x1d3557, 0x7a1f2b, 0x3b4a3a, 0x6b4f3a, 0xb3261e, 0xe9c46a, 0x8d99ae, 0xd6d2c8];

/** Deterministic random look for a seed (an unsigned 32-bit integer). */
export function heroLook(seed = (Math.random() * 4294967296) >>> 0) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const chance = (p) => r() < p;
  const L = { seed, soldier: chance(0.04) };
  if (L.soldier) return Object.assign(L, { female: false, build: 1, height: 1, skin: 0xc89270, hairColor: 0x3b2c21, hair: 'short', facial: 'stubble', eyes: 0x33241a });
  const female = (L.female = chance(0.5));
  L.older = chance(0.12);
  L.build = pick(female ? [0.92, 0.96, 1.0, 1.0, 1.08] : [0.95, 1.0, 1.0, 1.06, 1.13]);
  L.height = female ? 0.93 + r() * 0.05 : 0.97 + r() * 0.06;
  L.skin = pick(SKIN_TONES);
  L.hairColor = L.older && chance(0.7) ? pick(GREY_HAIR) : pick(HAIR_COLORS);
  L.hair = female ? pick(['long', 'long', 'ponytail', 'ponytail', 'bun', 'bob', 'bob', 'curly', 'short'])
    : pick(['short', 'short', 'short', 'buzz', 'buzz', 'curly', 'afro', 'long', 'bald']);
  if (!female && L.older && chance(0.4)) L.hair = chance(0.5) ? 'bald' : 'buzz';
  L.facial = female ? 'none' : pick(['none', 'none', 'stubble', 'stubble', 'beard']);
  L.eyes = pick([0x3b2618, 0x5a3a20, 0x2f4f6a, 0x4f6a3a, 0x1e1410]);
  L.top = female ? pick(['tee', 'tee', 'hoodie', 'jacket', 'shirt', 'sweater', 'dress', 'dress'])
    : pick(['tee', 'tee', 'hoodie', 'jacket', 'jacket', 'shirt', 'sweater']);
  L.topColor = pick({ tee: TEE, hoodie: HOODIE, jacket: JACKET, shirt: SHIRT, sweater: SWEATER, dress: DRESS }[L.top]);
  L.innerColor = pick(TEE);
  L.leather = L.top === 'jacket' && L.topColor === 0x1a1a1a;
  L.rolled = L.top === 'shirt' && chance(0.5);
  L.bottom = L.top === 'dress' ? 'dress' : female ? pick(['jeans', 'jeans', 'chinos', 'skirt', 'skirt', 'shorts'])
    : pick(['jeans', 'jeans', 'jeans', 'chinos', 'chinos', 'shorts']);
  L.bottomColor = L.bottom === 'dress' ? L.topColor : pick({ jeans: JEANS, chinos: CHINOS, shorts: [...CHINOS, ...JEANS], skirt: SKIRTS }[L.bottom]);
  L.tights = (L.bottom === 'skirt' || L.bottom === 'dress') && chance(0.45);
  L.shoes = pick(['sneaker', 'sneaker', 'sneaker', 'boot', L.top === 'shirt' || L.bottom === 'dress' ? 'dress' : 'sneaker']);
  L.shoeColor = L.shoes === 'sneaker' ? pick(SNEAKERS) : L.shoes === 'boot' ? pick(BOOTS) : pick(LEATHER);
  L.glasses = chance(L.older ? 0.5 : 0.2);
  L.sunglasses = L.glasses && chance(0.3);
  L.cap = !['bun', 'afro', 'ponytail'].includes(L.hair) && chance(0.15);
  L.capColor = pick(ACCENT);
  L.bag = pick(['none', 'none', 'none', 'backpack', 'backpack', 'crossbody']);
  L.bagColor = pick(ACCENT);
  L.watch = chance(0.4);
  return L;
}

function makeMaterials(L) {
  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const glass = new THREE.MeshPhysicalMaterial({
    color: L.sunglasses ? 0x15181c : 0xdfe8ee, roughness: 0.05, metalness: L.sunglasses ? 0.4 : 0.0,
    clearcoat: 1, clearcoatRoughness: 0.03, transparent: !L.sunglasses, opacity: L.sunglasses ? 1 : 0.22, depthWrite: !!L.sunglasses,
  });
  glass.userData.envProbe = true;
  const skin = new THREE.Color(L.skin);
  const brow = new THREE.Color(L.hairColor).multiplyScalar(0.7);
  const legs = L.tights ? std(0x1d191a, 0.62) : null;
  return {
    skin: std(0xffffff, 0.6, 0, { vertexColors: true }),
    skinFlat: std(skin, 0.62),
    eyeWhite: std(0xe6e1d8, 0.35),
    iris: std(L.eyes, 0.3),
    dark: std(brow, 0.85),
    top: std(L.topColor, L.leather ? 0.42 : L.top === 'jacket' ? 0.8 : 0.9, 0, { side: L.top === 'jacket' ? THREE.DoubleSide : THREE.FrontSide, shadowSide: THREE.BackSide }),
    topRib: std(new THREE.Color(L.topColor).multiplyScalar(0.88), 0.95),
    inner: std(L.innerColor, 0.9),
    bottom: std(L.bottomColor, L.bottom === 'jeans' ? 0.82 : 0.88),
    skirt: std(L.bottomColor, 0.86),
    legs: legs || std(skin, 0.62),
    shoe: std(L.shoeColor, L.shoes === 'dress' ? 0.32 : L.shoes === 'boot' ? 0.7 : 0.62),
    sole: std(L.shoes === 'sneaker' ? 0xf0efe9 : 0x191817, 0.85),
    lace: std(L.shoes === 'sneaker' && L.shoeColor === 0xf2f2f0 ? 0xdedcd6 : 0xe8e6e0, 0.9),
    hair: std(L.hairColor, 0.55),
    cap: std(L.capColor, 0.85),
    bag: std(L.bagColor, 0.72),
    strap: std(new THREE.Color(L.bagColor).multiplyScalar(0.6), 0.8),
    belt: std(0x2a1d16, 0.5),
    metal: std(0xa8aaad, 0.28, 0.9),
    frame: std(0x141414, 0.35, 0.2),
    glass,
  };
}

// ---------------------------------------------------------------------------------------------------
// Head: sculpted sphere in head-local space (centre of the skull), +Z forward.

const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const HEAD_R = [0.076, 0.104, 0.093];
const EYE = { x: 0.03, y: 0.008 };
const HEAD_POS = [0, 1.684, 0.02];
const HEAD_SCALE = 1.07;
// Face shape knobs, set per look before the head is built (jaw taper, brow ridge, lips).
const HP = { jaw: 0.3, brow: 0.005, lips: 0.004 };

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
    x *= 1 - HP.jaw * j * j;
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
  dz += HP.brow * gauss(ax, y, 0.028, 0.03, 0.02, 0.007);           // brow ridge
  dz += 0.005 * gauss(ax, y, 0.047, -0.014, 0.014, 0.014);          // cheekbones
  dz += HP.lips * gauss(x, y, 0, -0.054, 0.016, 0.009);             // lips
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

// Scalp hairline (unit-sphere direction): high on the forehead, receding at the temples, over the ears,
// down to the nape. hairW is a soft 0..1 mask around it.
const hairline = (ux, uz) => (uz > 0
  ? 0.5 + 0.12 * smooth(0.6, 0.95, uz) - 0.36 * smooth(0.4, 0.95, Math.abs(ux)) * (1 - smooth(0.6, 0.95, uz))
  : 0.14 - 0.72 * smooth(0, 0.85, -uz));
const hairW = (ux, uy, uz, drop = 0) => smooth(-0.03, 0.05, uy - hairline(ux, uz) + drop);

function buildHeadGeometry(L) {
  const g = new THREE.SphereGeometry(1, 96, 64);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(L.skin), hair = new THREE.Color(L.hairColor);
  const stub = skin.clone().lerp(hair, 0.45).multiplyScalar(0.85);
  const lip = skin.clone().lerp(new THREE.Color(L.female ? 0xa8424e : 0x9a5a50), L.female ? 0.55 : 0.4);
  const c = new THREE.Color();
  const scalpCol = { short: 1, buzz: 1, curly: 1, afro: 1, bob: 0.6, long: 0.6, ponytail: 0.8, bun: 0.8 }[L.hair] || 0;
  const stubW = L.facial === 'stubble' ? 0.38 : L.facial === 'beard' ? 0.5 : 0;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i), uy = pos.getY(i), uz = pos.getZ(i);
    const [x, y, z] = headPoint(ux, uy, uz);
    pos.setXYZ(i, x, y, z);
    // Vertex colours: hair tint on the scalp under the hair shell, stubble on the jaw, lips.
    c.copy(skin);
    c.lerp(hair, scalpCol * hairW(ux, uy, uz, 0.04));
    if (L.hair === 'bald') c.lerp(skin.clone().multiplyScalar(0.92), smooth(0.4, 0.9, uy));
    c.lerp(stub, smooth(-0.2, -0.5, uy) * smooth(-0.3, 0.2, uz) * stubW);
    c.lerp(lip, 0.8 * gauss(x, y, 0, -0.055, 0.014, 0.0065) * smooth(0.5, 0.8, uz));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildHead(P, M, parent, L) {
  const head = new THREE.Group();
  head.position.set(...HEAD_POS);
  head.scale.setScalar(HEAD_SCALE * (L.female ? 0.97 : 1));
  parent.add(head);
  P.add(head, M.skin, buildHeadGeometry(L));
  for (const s of [-1, 1]) {
    // Eyes sit in the sockets: white, iris, and a skin lid over the top.
    const ex = s * EYE.x, ey = EYE.y, ez = headAt(ex, ey)[2] - 0.0095;
    P.add(head, M.eyeWhite, place(ellipsoid(0.0118, 0.0118, 0.0118, 14, 10), ex, ey, ez));
    P.add(head, M.iris, place(ellipsoid(0.0056, 0.0056, 0.003, 12, 8), ex, ey, ez + 0.0106));
    const lid = new THREE.SphereGeometry(0.0127, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
    lid.deleteAttribute('uv');
    P.add(head, M.skinFlat, place(lid, ex, ey + 0.0005, ez, 0.8, 0, 0));
    // Brows follow the brow ridge (thinner and arched for the female face).
    const bz = headAt(s * 0.03, 0.027)[2];
    P.add(head, M.dark, place(rbox(0.032, L.female ? 0.0038 : 0.0055, 0.006, 0.0018, 4), s * 0.03, L.female ? 0.029 : 0.027, bz - 0.0005, -0.2, s * 0.3, -s * (L.female ? 0.2 : 0.1)));
    // Ears.
    P.add(head, M.skinFlat, place(ellipsoid(0.01, 0.028, 0.019, 12, 10), s * 0.072, -0.004, -0.012, 0, s * 0.3, s * 0.08));
    P.add(head, M.skinFlat, place(ellipsoid(0.006, 0.02, 0.012, 10, 8), s * 0.076, -0.004, -0.012, 0, s * 0.3, s * 0.08));
  }
  return head;
}

// Hair/cap shell over the head surface: inside the mask it stands `thick` off the skin, outside it sinks
// just under it, so the visible edge is the smooth curve where the two surfaces cross.
function headShell(mask, thick, ws = 64, hs = 44) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  const pos = g.attributes.position, w = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i), uy = pos.getY(i), uz = pos.getZ(i);
    const m = mask(ux, uy, uz);
    w[i] = m;
    const p = headPoint(ux, uy, uz), r = Math.hypot(p[0], p[1], p[2]) || 1;
    const o = -0.004 + m * (0.004 + thick(ux, uy, uz));
    pos.setXYZ(i, p[0] + (p[0] / r) * o, p[1] + (p[1] / r) * o, p[2] + (p[2] / r) * o);
  }
  const src = g.index.array, idx = [];
  for (let t = 0; t < src.length; t += 3) if (w[src[t]] + w[src[t + 1]] + w[src[t + 2]] > 0.002) idx.push(src[t], src[t + 1], src[t + 2]);
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const bumps = (ux, uy, uz, f) => Math.sin(ux * f + 1.3) * Math.sin(uy * f * 0.9 + 0.4) * Math.sin(uz * f * 1.1 + 2.1);

function buildHair(P, M, head, L) {
  const style = L.hair;
  if (style === 'bald') return;
  const crown = (ux, uy) => smooth(-0.3, 0.9, uy);
  // Side curtains for bob/long hair: down the back and sides to the jaw, keeping the face clear.
  const curtain = (ux, uy, uz) => Math.max(hairW(ux, uy, uz),
    smooth(-0.66, -0.55, uy) * (1 - smooth(0.25, 0.5, uz) * smooth(0.45, 0.75, 1 - Math.abs(ux))) * smooth(0.45, 0.2, uz) * smooth(-0.1, 0.3, uy + 0.65));
  if (style === 'short') P.add(head, M.hair, headShell(hairW, (ux, uy, uz) => 0.007 + 0.013 * crown(ux, uy) + 0.004 * smooth(0.5, 0.9, uz) * smooth(0.4, 0.7, uy)));
  else if (style === 'buzz') P.add(head, M.hair, headShell(hairW, () => 0.0025, 48, 32));
  else if (style === 'curly') P.add(head, M.hair, headShell((ux, uy, uz) => hairW(ux, uy, uz, 0.05), (ux, uy, uz) => 0.014 + 0.012 * crown(ux, uy) + 0.006 * bumps(ux, uy, uz, 22)));
  else if (style === 'afro') P.add(head, M.hair, headShell((ux, uy, uz) => hairW(ux, uy, uz, 0.06), (ux, uy, uz) => 0.03 + 0.03 * crown(ux, uy) + 0.007 * bumps(ux, uy, uz, 18)));
  else if (style === 'bob' || style === 'long') {
    // Fringe falls over the forehead; volume grows towards the ends.
    P.add(head, M.hair, headShell((ux, uy, uz) => Math.max(curtain(ux, uy, uz), smooth(0.2, 0.32, uy) * smooth(0.5, 0.2, Math.abs(ux)) * smooth(0.5, 0.7, uz)),
      (ux, uy, uz) => 0.01 + 0.008 * crown(ux, uy) + 0.016 * smooth(0.2, -0.6, uy)));
    if (style === 'long') {
      // Drape down the back to the shoulder blades.
      P.add(head, M.hair, limb([
        [0.02, 0.07, 0.03, 0.03], [-0.04, 0.085, 0.04, 0.05], [-0.12, 0.09, 0.035, 0.05], [-0.22, 0.085, 0.025, 0.04],
        [-0.3, 0.07, 0.018, 0.026], [-0.34, 0.04, 0.01, 0.012],
      ], { n: 16, m: 18, zKeys: [[-0.34, -0.1], [-0.2, -0.095], [-0.06, -0.085], [0.02, -0.07]] }));
    }
  } else {
    // Pulled-back hair (ponytail/bun): a tight shell.
    P.add(head, M.hair, headShell(hairW, (ux, uy) => 0.005 + 0.007 * crown(ux, uy)));
    if (style === 'ponytail') {
      const tie = new THREE.TorusGeometry(0.016, 0.006, 6, 14);
      tie.deleteAttribute('uv');
      P.add(head, M.dark, place(tie, 0, 0.03, -0.1, 0.9, 0, 0));
      P.add(head, M.hair, limb([
        [0.04, 0.012, 0.012, 0.012], [0.02, 0.022, 0.022, 0.022], [-0.06, 0.03, 0.028, 0.028], [-0.16, 0.026, 0.022, 0.022],
        [-0.24, 0.014, 0.012, 0.012], [-0.27, 0.005, 0.005, 0.005],
      ], { n: 16, m: 12, zKeys: [[-0.27, -0.13], [-0.16, -0.148], [-0.06, -0.142], [0.02, -0.118], [0.04, -0.105]] }));
    } else {
      P.add(head, M.hair, place(ellipsoid(0.04, 0.036, 0.038, 16, 12), 0, 0.08, -0.07));
      P.add(head, M.hair, place(ellipsoid(0.03, 0.03, 0.03, 12, 8), 0.0, 0.06, -0.085));
    }
  }
}

function buildCap(P, M, head) {
  // Crown panels over the skull, a stiff curved brim and the top button.
  P.add(head, M.cap, headShell((ux, uy, uz) => smooth(0.0, 0.08, uy - 0.22 - 0.22 * uz), (ux, uy) => 0.03 + 0.004 * uy, 48, 32));
  P.add(head, M.cap, loftZ(10, 18, (t) => {
    const z = 0.075 + 0.09 * t;
    return { x: 0, y: 0.04 - 0.012 * t * t, z, rx: 0.078 - 0.03 * t * t, rt: 0.0035, rb: 0.0035, p: 2.6 };
  }));
  P.add(head, M.cap, place(ellipsoid(0.008, 0.005, 0.008, 8, 6), 0, 0.118, -0.005));
}

function buildGlasses(P, M, head, L) {
  const z0 = headAt(EYE.x, EYE.y)[2] + 0.012;
  for (const s of [-1, 1]) {
    const ring = new THREE.TorusGeometry(1, 0.11, 6, 24);
    ring.deleteAttribute('uv');
    ring.scale(0.021, 0.015, 0.021);
    P.add(head, M.frame, place(ring, s * 0.031, EYE.y, z0, 0, s * 0.12, 0));
    P.add(head, M.glass, place(ellipsoid(0.02, 0.014, 0.0015, 16, 8), s * 0.031, EYE.y, z0, 0, s * 0.12, 0));
    P.add(head, M.frame, capsule([s * 0.052, EYE.y + 0.004, z0 - 0.004], [s * 0.074, EYE.y + 0.006, -0.01], 0.0022));
  }
  P.add(head, M.frame, capsule([-0.011, EYE.y + 0.006, z0 + 0.002], [0.011, EYE.y + 0.006, z0 + 0.002], 0.002));
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
// Torso (pelvis group below the waist, chest group above; the shirt hem overlaps the trousers so the two
// can counter-rotate without a visible seam).

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
const g1 = (y, c, s) => Math.exp(-(((y - c) / s) ** 2) / 2);

// Body shape per look: female = narrower shoulders and waist, wider hips and seat, bust; build scales the
// girth (heavier builds get a belly).
function torsoKeys(L) {
  return TORSO.map(([y, rx, rf, rb]) => {
    let sx = L.build, sb = L.build, f = rf * L.build;
    if (L.female) {
      sx *= (1 - 0.1 * smooth(1.26, 1.42, y)) * (1 - 0.1 * g1(y, 1.1, 0.07)) * (1 + 0.07 * g1(y, 0.92, 0.07));
      sb *= 1 + 0.1 * g1(y, 0.92, 0.07);
      f += 0.03 * g1(y, 1.3, 0.045);
    }
    if (L.build > 1.05) f += (0.04 * (L.build - 1)) / 0.13 * g1(y, 1.08, 0.08);
    return [y, rx * sx, f, rb * sb];
  });
}

function torsoProfile(keys = TORSO) {
  const fx = curve(keys.map((k) => [k[0], k[1]])), ff = curve(keys.map((k) => [k[0], k[2]]));
  const fb = curve(keys.map((k) => [k[0], k[3]]));
  return { fx, ff, fb };
}

// Open loft (front gap) for jackets: the ring runs from the front edge round the back to the other edge.
function openLoft(n, m, at, gap) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const r = at(i / n), gp = gap(r.y);
    for (let j = 0; j <= m; j++) {
      const th = Math.PI / 2 + gp + (j / m) * (Math.PI * 2 - 2 * gp);
      const [u, w] = se(th, r.p || 2);
      pos.push(r.x + r.rx * u, r.y, r.z + (w >= 0 ? r.rf : r.rb) * w);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Outward check on the middle row.
  const k = Math.floor(n / 2) * (m + 1) + Math.floor(m / 2), nr = g.attributes.normal;
  if (nr.getZ(k) * pos[k * 3 + 2] + nr.getX(k) * pos[k * 3] < 0) {
    for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

function buildCivilianTorso(P, M, pelvis, chest, L) {
  const { fx, ff, fb } = torsoProfile(torsoKeys(L));
  const band = (grp, y0, y1, grow, p, n, mat, endK = 0.6) => P.add(grp, mat, loftY(n, 36, (t) => {
    const y = y0 + (y1 - y0) * t;
    const end = t === 0 || t === 1 ? endK : 1;
    return { x: 0, y, z: 0, rx: (fx(y) + grow) * end, rf: (ff(y) + grow) * end, rb: (fb(y) + grow) * end, p };
  }));
  const skirted = L.bottom === 'skirt' || L.bottom === 'dress';
  band(pelvis, 0.8, 1.03, 0, 2.3, 16, skirted ? M.legs : M.bottom);
  if (!skirted) {
    // Belt with buckle; jeans get back pockets and a coin-pocket seam.
    P.add(pelvis, M.belt, loftY(3, 40, (t) => {
      const y = 0.985 + 0.034 * t, gr = 0.006;
      return { x: 0, y, z: 0, rx: fx(y) + gr, rf: ff(y) + gr, rb: fb(y) + gr, p: 2.3 };
    }));
    P.add(pelvis, M.metal, place(rbox(0.04, 0.03, 0.008, 0.003, 4), 0, 1.002, ff(1.0) + 0.01));
    if (L.bottom === 'jeans') {
      for (const s of [-1, 1]) P.add(pelvis, M.bottom, place(rbox(0.1, 0.11, 0.008, 0.004, 4), s * 0.075, 0.91, -fb(0.91) - 0.003, 0.25, 0, 0));
    }
  }

  // Top: hem height and layers by garment.
  const hem = { tee: 0.955, shirt: 0.945, sweater: 0.94, hoodie: 0.93, jacket: 0.955, dress: 0.98 }[L.top];
  const topMat = L.top === 'jacket' ? M.inner : M.top;
  band(chest, hem, 1.535, 0.013, 2.3, 30, topMat, 0.8);
  // Neck.
  P.add(chest, M.skinFlat, limb([[1.655, 0.05, 0.05, 0.05], [1.61, 0.056, 0.057, 0.06], [1.5, 0.063, 0.059, 0.065]].map(([y, a, b, c]) => [y, a * (L.female ? 0.86 : 1), b * (L.female ? 0.86 : 1), c * (L.female ? 0.86 : 1)]), { n: 10, m: 24, zKeys: [[1.5, -0.008], [1.655, 0.0]] }));
  const ring = (y0, y1, grow, mat, m = 40) => P.add(chest, mat, loftY(2, m, (t) => {
    const y = y0 + (y1 - y0) * t;
    return { x: 0, y, z: 0, rx: fx(y) + grow, rf: ff(y) + grow, rb: fb(y) + grow, p: 2.3 };
  }));
  // Crew neckline rib (tee, sweater, dress, jacket's inner tee).
  if (L.top !== 'shirt' && L.top !== 'hoodie') {
    P.add(chest, L.top === 'sweater' ? M.topRib : topMat, limb([[1.545, 0.068, 0.062, 0.068], [1.53, 0.08, 0.072, 0.078], [1.515, 0.088, 0.078, 0.084]], { n: 3, m: 28 }));
  }
  if (L.top === 'sweater' || L.top === 'hoodie') ring(hem, hem + 0.05, 0.012, M.topRib);
  if (L.top === 'hoodie') {
    // Hood bunched behind the neck, kangaroo pocket, drawstrings.
    const pts = [[-0.085, 1.5, 0.07], [-0.12, 1.535, -0.02], [-0.06, 1.565, -0.1], [0.0, 1.57, -0.115], [0.06, 1.565, -0.1], [0.12, 1.535, -0.02], [0.085, 1.5, 0.07]];
    P.add(chest, M.top, sweep(pts, 0.04, 0.026, (p) => new THREE.Vector3(p.x, 0.4, p.z).normalize(), { n: 30, m: 14, p: 2.2 }));
    P.add(chest, M.top, place(rbox(0.25, 0.13, 0.024, 0.01), 0, 1.06, ff(1.06) + 0.014, 0.05, 0, 0));
    for (const s of [-1, 1]) P.add(chest, M.inner, capsule([s * 0.035, 1.49, ff(1.49) + 0.012], [s * 0.042, 1.34, ff(1.34) + 0.014], 0.0035));
  }
  if (L.top === 'shirt') {
    // Collar band and points, button placket with buttons.
    P.add(chest, M.top, limb([[1.575, 0.066, 0.063, 0.07], [1.535, 0.074, 0.07, 0.076]], { n: 3, m: 28 }));
    for (const s of [-1, 1]) P.add(chest, M.top, place(rbox(0.05, 0.006, 0.042, 0.003, 4), s * 0.032, 1.53, 0.06, -0.9, s * 0.5, s * 0.35));
    const pk = [];
    for (let y = hem + 0.01; y <= 1.52; y += 0.05) pk.push([0, y, ff(y) + 0.009]);
    P.add(chest, M.top, sweep(pk, 0.013, 0.002, () => new THREE.Vector3(0, 0, 1), { n: 20, m: 8 }));
    for (let i = 0; i < 6; i++) {
      const y = 1.06 + i * 0.085;
      P.add(chest, M.frame, place(ellipsoid(0.0055, 0.0055, 0.002, 8, 6), 0, y, ff(y) + 0.0115));
    }
  }
  if (L.top === 'jacket') {
    // Open jacket: shell with a front gap that widens into lapels, collar, edge piping, pocket flaps.
    const gap = (y) => 0.2 + 0.22 * smooth(1.32, 1.5, y);
    P.add(chest, M.top, openLoft(30, 44, (t) => {
      const y = 0.9 + (1.53 - 0.9) * t, gr = 0.02 + 0.006 * smooth(1.0, 0.9, y);
      return { x: 0, y, z: 0, rx: fx(y) + gr, rf: ff(y) + gr, rb: fb(y) + gr, p: 2.3 };
    }, gap));
    for (const s of [-1, 1]) {
      const pts = [];
      for (let y = 0.9; y <= 1.531; y += 0.045) {
        const th = Math.PI / 2 - s * gap(y), [u, w] = se(th, 2.3), gr = 0.02 + 0.006 * smooth(1.0, 0.9, y);
        pts.push([(fx(y) + gr) * u, y, (ff(y) + gr) * w]);
      }
      P.add(chest, M.top, sweep(pts, 0.006, 0.006, (p) => new THREE.Vector3(p.x, 0, p.z).normalize(), { n: 24, m: 8 }));
      P.add(chest, M.top, place(rbox(0.1, 0.012, 0.03, 0.005, 4), s * 0.11, 1.03, ff(1.03) + 0.018, 0.1, -s * 0.35, 0));
    }
    P.add(chest, M.top, sweep([[-0.095, 1.49, 0.065], [-0.11, 1.56, -0.02], [0.0, 1.585, -0.085], [0.11, 1.56, -0.02], [0.095, 1.49, 0.065]],
      0.012, 0.03, (p) => new THREE.Vector3(p.x, 0.2, p.z).normalize(), { n: 26, m: 10 }));
  }
  if (skirted) buildSkirt(P, M, pelvis, L, fx, ff, fb);

  // Bags.
  if (L.bag === 'backpack') {
    const pz = -fb(1.25) - 0.08;
    P.add(chest, M.bag, place(rbox(0.29, 0.38, 0.13, 0.05), 0, 1.24, pz));
    P.add(chest, M.bag, place(rbox(0.22, 0.15, 0.05, 0.02), 0, 1.15, pz - 0.075));
    P.add(chest, M.metal, place(rbox(0.016, 0.012, 0.006, 0.002, 4), 0.07, 1.22, pz - 0.1));
    for (const s of [-1, 1]) {
      const x = s * 0.1;
      const pts = [[x, 1.08, pz + 0.05], [x * 1.25, 1.12, -fb(1.12) * 0.2], [x * 1.4, 1.2, ff(1.2) * 0.6], [x, 1.32, ff(1.32) + 0.012],
        [x, 1.45, ff(1.45) + 0.01], [x, 1.53, 0.0], [x * 0.95, 1.47, pz + 0.03]];
      P.add(chest, M.strap, sweep(pts.reverse(), 0.02, 0.005, (p) => new THREE.Vector3(p.x * 0.3, 0, p.z).normalize(), { n: 30, m: 8 }));
    }
  } else if (L.bag === 'crossbody') {
    const strap = new THREE.TorusGeometry(1, 0.08, 4, 36);
    strap.deleteAttribute('uv');
    strap.rotateX(Math.PI / 2);
    strap.scale(0.3, 0.12, 0.135 * L.build);
    strap.rotateZ(0.9);
    P.add(chest, M.strap, place(strap, 0, 1.21, 0));
    P.add(pelvis, M.bag, place(rbox(0.06, 0.18, 0.24, 0.025), -fx(0.92) - 0.045, 0.93, 0.02));
    P.add(pelvis, M.metal, place(rbox(0.008, 0.02, 0.03, 0.003, 4), -fx(0.92) - 0.077, 0.96, 0.02));
  }
}

// Skirt or dress skirt: an A-line loft from the waist; posed per frame (each side follows its thigh).
function buildSkirt(P, M, pelvis, L, fx, ff, fb) {
  const hemY = L.bottom === 'dress' ? 0.54 : 0.6;
  const g = loftY(18, 40, (t) => {
    const y = hemY + (1.0 - hemY) * t;
    const fl = (1 - t) * (1 - t) * 0.07;
    return { x: 0, y, z: 0, rx: fx(Math.max(y, 0.9)) + 0.012 + fl * 1.2, rf: ff(Math.max(y, 0.9)) + 0.012 + fl, rb: fb(Math.max(y, 0.9)) + 0.014 + fl, p: 2.2 };
  }, false);
  g.userData.skirt = true;
  P.add(pelvis, M.skirt, g);
}

// Soldier outfit torso (plate carrier, pouches, assault pack).
function buildSoldierTorso(P, M, pelvis, body) {
  const { fx, ff, fb } = torsoProfile();
  const band = (y0, y1, grow, p, n, mat, grp = body) => P.add(grp, mat, loftY(n, 36, (t) => {
    const y = y0 + (y1 - y0) * t;
    const end = t === 0 || t === 1 ? 0.6 : 1;
    return { x: 0, y, z: 0, rx: (fx(y) + grow) * end, rf: (ff(y) + grow) * end, rb: (fb(y) + grow) * end, p };
  }));
  band(0.8, 1.03, 0, 2.3, 16, M.pants, pelvis);
  band(0.99, 1.535, 0, 2.3, 30, M.shirt);
  // Collar of the combat shirt.
  P.add(body, M.shirt, limb([[1.578, 0.065, 0.061, 0.067], [1.55, 0.071, 0.067, 0.073], [1.5, 0.085, 0.075, 0.082]], { n: 6, m: 28 }));
  // Neck.
  P.add(body, M.skinFlat, limb([[1.655, 0.05, 0.05, 0.05], [1.61, 0.056, 0.057, 0.06], [1.5, 0.063, 0.059, 0.065]], { n: 10, m: 24, zKeys: [[1.5, -0.008], [1.655, 0.0]] }));
  // Belt with buckle and pouches.
  P.add(pelvis, M.webbing, loftY(4, 40, (t) => {
    const y = 0.975 + 0.05 * t, gr = 0.012;
    return { x: 0, y, z: 0, rx: fx(y) + gr, rf: ff(y) + gr, rb: fb(y) + gr, p: 2.3 };
  }));
  P.add(pelvis, M.metal, place(rbox(0.052, 0.04, 0.012, 0.004, 4), 0, 1.0, ff(1.0) + 0.016));
  P.add(pelvis, M.webbing, place(rbox(0.07, 0.09, 0.05, 0.015), -0.11, 0.98, -0.135, 0, 0.5, 0));
  P.add(pelvis, M.webbing, place(rbox(0.09, 0.07, 0.045, 0.015), 0.08, 0.985, -0.14, 0, -0.45, 0));

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
// Civilian limbs (built in each segment's own frame so the pose can bend them). One radius profile per
// segment; garments are the same profile grown a little and cut at the hem, skin continues underneath.

const THIGH_KEYS = [
  [0.08, 0.072, 0.072, 0.072], [0.02, 0.09, 0.09, 0.096], [-0.1, 0.088, 0.09, 0.092], [-0.22, 0.079, 0.081, 0.079],
  [-0.34, 0.064, 0.066, 0.061], [-0.42, 0.055, 0.057, 0.053], [-0.47, 0.03, 0.03, 0.03],
];
const SHIN_KEYS = [
  [0.05, 0.044, 0.044, 0.044], [0.0, 0.054, 0.054, 0.054], [-0.08, 0.052, 0.048, 0.066], [-0.16, 0.048, 0.043, 0.06],
  [-0.26, 0.038, 0.035, 0.042], [-0.33, 0.033, 0.033, 0.035], [-0.38, 0.033, 0.035, 0.036], [-0.42, 0.025, 0.025, 0.025],
];
const PANT_SHIN = [ // straight trouser leg falling over the shoe
  [0.05, 0.052, 0.052, 0.052], [0.0, 0.062, 0.062, 0.062], [-0.1, 0.06, 0.058, 0.066], [-0.25, 0.055, 0.054, 0.058],
  [-0.36, 0.054, 0.058, 0.056], [-0.385, 0.05, 0.054, 0.052],
];
const UPPER_KEYS = [
  [0.035, 0.02, 0.022, 0.022], [0.02, 0.045, 0.05, 0.05], [-0.01, 0.057, 0.057, 0.055], [-0.06, 0.054, 0.052, 0.05],
  [-0.15, 0.046, 0.05, 0.044], [-0.24, 0.041, 0.042, 0.04], [-0.3, 0.038, 0.038, 0.038], [-0.34, 0.02, 0.02, 0.02],
];
const FORE_KEYS = [
  [0.04, 0.02, 0.02, 0.02], [0.0, 0.038, 0.039, 0.038], [-0.05, 0.042, 0.043, 0.041], [-0.12, 0.037, 0.04, 0.038],
  [-0.19, 0.028, 0.033, 0.031], [-0.235, 0.024, 0.03, 0.028], [-0.255, 0.016, 0.018, 0.018],
];

// Loft of a key profile between y0 and y1 (top to bottom order irrelevant), scaled by k, grown by `grow`.
// endK shrinks the end rings (0.6 closes a limb end, ~0.85 reads as a garment hem).
function limbSeg(keys, y0, y1, { x = 0, k = 1, grow = 0, n = 16, m = 20, end0 = 0.6, end1 = 0.6 } = {}) {
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const fx = curve(sorted.map((q) => [q[0], q[1]])), ff = curve(sorted.map((q) => [q[0], q[2]]));
  const fb = curve(sorted.map((q) => [q[0], q[3]]));
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  return loftY(n, m, (t) => {
    const y = lo + (hi - lo) * t;
    const e = t === 0 ? end0 : t === 1 ? end1 : 1;
    return { x, y, z: 0, rx: (fx(y) * k + grow) * e, rf: (ff(y) * k + grow) * e, rb: (fb(y) * k + grow) * e, p: 2 };
  });
}

function buildCivilianLeg(P, M, pivot, s, L) {
  const x = s * 0.092;
  const k = (L.female ? 0.95 : 1) * L.build ** 0.6;
  const skirted = L.bottom === 'skirt' || L.bottom === 'dress';
  const thigh = new THREE.Group();
  pivot.add(thigh);
  const legMat = skirted ? M.legs : M.skinFlat;
  if (L.bottom === 'shorts') {
    P.add(thigh, M.bottom, limbSeg(THIGH_KEYS, 0.08, -0.25, { x, k, grow: 0.012, n: 16, end1: 0.9 }));
    P.add(thigh, legMat, limbSeg(THIGH_KEYS, -0.22, -0.47, { x, k, n: 12 }));
  } else {
    P.add(thigh, skirted ? legMat : M.bottom, limbSeg(THIGH_KEYS, 0.08, -0.47, { x, k: k * (skirted ? 0.97 : 1), grow: skirted ? 0 : 0.006, n: 22 }));
  }
  const shin = new THREE.Group();
  shin.position.set(0, -THIGH, 0);
  thigh.add(shin);
  if (L.bottom === 'jeans' || L.bottom === 'chinos') {
    P.add(shin, M.bottom, limbSeg(PANT_SHIN, 0.05, -0.385, { x, k, n: 18, end1: 0.92 }));
  } else {
    P.add(shin, legMat, limbSeg(SHIN_KEYS, 0.05, -0.42, { x, k: k * (L.female ? 0.95 : 1), n: 20 }));
  }
  const foot = new THREE.Group();
  foot.position.set(0, -SHIN, 0);
  shin.add(foot);
  buildShoe(P, M, foot, shin, x, L);
  return { thigh, shin, foot };
}

const FOOT_KEYS = [
  // z,     y,      rx,    rt,    rb
  [-0.075, -0.045, 0.03, 0.03, 0.03],
  [-0.06, -0.045, 0.043, 0.045, 0.04],
  [-0.02, -0.05, 0.046, 0.052, 0.037],
  [0.04, -0.058, 0.049, 0.036, 0.03],
  [0.1, -0.062, 0.05, 0.028, 0.026],
  [0.16, -0.066, 0.046, 0.024, 0.022],
  [0.2, -0.07, 0.034, 0.018, 0.018],
  [0.215, -0.07, 0.015, 0.01, 0.01],
];

function buildShoe(P, M, foot, shin, x, L) {
  const w = L.female ? 0.92 : 1;
  const fc = (c) => curve(FOOT_KEYS.map((q) => [q[0], q[c]]));
  const fy = fc(1), frx = fc(2), frt = fc(3), frb = fc(4);
  const low = L.shoes === 'dress' ? 0.82 : 1;
  P.add(foot, M.shoe, loftZ(24, 22, (t) => {
    const z = -0.075 + 0.29 * t;
    return { x, y: fy(z), z, rx: frx(z) * w, rt: frt(z) * low, rb: frb(z), p: 2.2 };
  }));
  if (L.shoes === 'sneaker') {
    // Cupsole midsole wrapping the edge, toe bumper, lace panel and heel tab.
    P.add(foot, M.sole, place(rbox(0.112 * w, 0.032, 0.305, 0.012), x, -0.073, (HEEL_Z + TOE_Z) / 2));
    P.add(foot, M.sole, place(ellipsoid(0.046 * w, 0.02, 0.04, 14, 8), x, -0.066, 0.17));
    P.add(foot, M.lace, place(rbox(0.032, 0.008, 0.1, 0.003, 4), x, -0.024, 0.045, -0.4, 0, 0));
    for (let i = 0; i < 4; i++) P.add(foot, M.lace, place(rbox(0.04, 0.004, 0.006, 0.002, 2), x, -0.03 - i * 0.008, 0.012 + i * 0.022, -0.4, 0, 0));
    P.add(foot, M.shoe, place(rbox(0.03, 0.04, 0.012, 0.005, 4), x, -0.012, -0.075, 0.25, 0, 0));
    P.add(foot, M.shoe, limbSeg([[0.0, 0.046, 0.05, 0.05], [-0.03, 0.05, 0.054, 0.054]], 0.0, -0.03, { x, k: w, n: 2, m: 22, end0: 0.85, end1: 0.85 }));
  } else if (L.shoes === 'boot') {
    P.add(shin, M.shoe, limbSeg([[-0.26, 0.05, 0.053, 0.058], [-0.33, 0.046, 0.05, 0.05], [-0.4, 0.045, 0.06, 0.05], [-0.43, 0.035, 0.04, 0.035]], -0.26, -0.43, { x, k: w, n: 10, m: 22, end0: 0.95 }));
    P.add(foot, M.sole, place(rbox(0.108 * w, 0.024, 0.3, 0.01), x, -0.078, (HEEL_Z + TOE_Z) / 2));
    P.add(foot, M.sole, place(rbox(0.1 * w, 0.016, 0.085, 0.006, 4), x, -0.064, -0.035));
  } else {
    // Dress shoe: thin sole, stacked heel, a welt line.
    P.add(foot, M.sole, place(rbox(0.1 * w, 0.012, 0.29, 0.005), x, -0.084, (HEEL_Z + TOE_Z) / 2 + 0.005));
    P.add(foot, M.sole, place(rbox(0.07 * w, 0.025, 0.06, 0.005, 4), x, -0.074, -0.05));
  }
}

function buildCivilianArm(P, M, pivot, s, L) {
  const k = (L.female ? 0.86 : 1) * L.build ** 0.5;
  const upper = new THREE.Group();
  upper.position.set(s * SHOULDER_X, 0, 0);
  pivot.add(upper);
  const fore = new THREE.Group();
  fore.position.set(0, -UPPER, 0);
  upper.add(fore);
  const sleeve = M.top;
  const shortSleeve = L.top === 'tee' || L.top === 'dress';
  if (shortSleeve) {
    P.add(upper, sleeve, limbSeg(UPPER_KEYS, 0.035, L.top === 'dress' ? -0.08 : -0.15, { k, grow: 0.006, n: 12, end1: 0.92 }));
    P.add(upper, M.skinFlat, limbSeg(UPPER_KEYS, -0.05, -0.34, { k, n: 16 }));
    P.add(fore, M.skinFlat, limbSeg(FORE_KEYS, 0.04, -0.255, { k, n: 18 }));
  } else {
    const g = L.top === 'jacket' ? 0.014 : 0.006;
    P.add(upper, sleeve, limbSeg(UPPER_KEYS, 0.035, -0.34, { k, grow: g, n: 22 }));
    if (L.rolled) {
      P.add(fore, sleeve, limbSeg(FORE_KEYS, 0.04, -0.1, { k, grow: 0.008, n: 8, end1: 0.95 }));
      P.add(fore, sleeve, limbSeg(FORE_KEYS, -0.08, -0.115, { k, grow: 0.016, n: 3, end0: 0.9, end1: 0.9 }));
      P.add(fore, M.skinFlat, limbSeg(FORE_KEYS, -0.06, -0.255, { k, n: 14 }));
    } else {
      P.add(fore, sleeve, limbSeg(FORE_KEYS, 0.04, -0.215, { k, grow: g, n: 18, end1: 0.9 }));
      const cuff = L.top === 'sweater' || L.top === 'hoodie' ? M.topRib : sleeve;
      P.add(fore, cuff, limbSeg(FORE_KEYS, -0.19, -0.235, { k, grow: g * 0.6, n: 3, end0: 0.95, end1: 0.85 }));
      P.add(fore, M.skinFlat, limbSeg(FORE_KEYS, -0.2, -0.255, { k, n: 4 }));
    }
  }
  if (L.watch && s < 0) {
    P.add(fore, M.belt, limbSeg(FORE_KEYS, -0.205, -0.225, { k, grow: 0.004, n: 2, end0: 0.95, end1: 0.95 }));
    P.add(fore, M.metal, place(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 16), s * 0.032, -0.215, 0.0, 0, 0, Math.PI / 2));
  }
  const hand = new THREE.Group();
  hand.position.set(0, -FORE, 0);
  fore.add(hand);
  // Fist (palm faces -s*X at rest); the grip hole runs along the hand's Z axis, thumb at +Z.
  const hk = L.female ? 0.9 : 1;
  P.add(hand, M.skinFlat, place(rbox(0.03 * hk, 0.084 * hk, 0.076 * hk, 0.013), 0, -0.046, 0));
  const zf = [0.026, 0.009, -0.008, -0.0245].map((z) => z * hk), lf = [1, 1.06, 1, 0.84], rf = [0.0092, 0.0092, 0.0088, 0.008];
  for (let i = 0; i < 4; i++) {
    const Lf = lf[i] * hk, z = zf[i];
    const kn = [-s * 0.002, -0.086 * hk, z];
    const p1 = [kn[0] - s * 0.032 * Lf, kn[1] - 0.012 * Lf, z];
    const p2 = [p1[0] - s * 0.004 * Lf, p1[1] + 0.025 * Lf, z];
    const p3 = [p2[0] + s * 0.011 * Lf, p2[1] + 0.011 * Lf, z];
    P.add(hand, M.skinFlat, capsule(kn, p1, rf[i] * hk), capsule(p1, p2, rf[i] * 0.95 * hk), capsule(p2, p3, rf[i] * 0.88 * hk));
  }
  P.add(hand, M.skinFlat, capsule([-s * 0.008, -0.026, 0.034 * hk], [-s * 0.028, -0.052, 0.044 * hk], 0.011 * hk),
    capsule([-s * 0.028, -0.052, 0.044 * hk], [-s * 0.038, -0.074, 0.032 * hk], 0.0095 * hk));
  return { upper, fore, hand };
}

// Soldier outfit limbs (knee pads, boots, gloves).
function buildSoldierLeg(P, M, pivot, s) {
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

function buildSoldierArm(P, M, pivot, s) {
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
// Pose solver for the weapon hold.

// Hand targets in each weapon's own frame (rig children: rifle, RPG, railgun, in walker_weapons order).
const GRIP_PTS = [[0, -0.095, -0.06], [0, -0.095, 0.06], [0, -0.105, 0.02]].map((p) => new THREE.Vector3(...p));
const FORE_PTS = [[0, -0.04, 0.21], [0, -0.05, 0.28], [0, -0.06, 0.3]].map((p) => new THREE.Vector3(...p));
const _T = new THREE.Vector3(), _D = new THREE.Vector3(), _U = new THREE.Vector3(), _V = new THREE.Vector3();
const _E = new THREE.Vector3(), _F = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3();
const _Z = new THREE.Vector3(), _G = new THREE.Vector3(), _pole = new THREE.Vector3();
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion();

// Two-bone IK in the arm pivot frame: shoulder at arm.upper.position, target T, elbow towards pole.
function solveArm(arm, T, pole, protract = 0) {
  const S = arm.upper.position, a = UPPER, b = FORE + GRIP;
  S.set(arm.side * (arm.shX || SHOULDER_X), arm.shY || 0, 0);
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

// ---------------------------------------------------------------------------------------------------
// Procedural locomotion (no allocations per frame). Angles in the sagittal plane are measured from
// straight down, positive forward; three.js rotation.x is the opposite sign.

const TAU = Math.PI * 2;
const BALL_Z = 0.15, HEEL_B = 0.075; // ball of the foot ahead of / heel behind the ankle
const _ik = { a1: 0, a2: 0 }, _ft = { z: 0, y: 0, p: 0 }, _ft2 = { z: 0, y: 0, p: 0 }, _ft3 = { z: 0, y: 0, p: 0 };
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3();
const _e2 = new THREE.Euler(0, 0, 0, 'YXZ');

// Two-bone leg IK: hip (hz, hy) to ankle (az, ay); thigh angle a1 and shin angle a2 (knee forward).
function legIK(hz, hy, az, ay, out) {
  const dz = az - hz, dy = ay - hy;
  const D = clamp(Math.hypot(dz, dy), 0.25, (THIGH + SHIN) * 0.999);
  const dir = Math.atan2(dz, -dy);
  out.a1 = dir + Math.acos(clamp((THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D), -1, 1));
  out.a2 = dir - Math.acos(clamp((SHIN * SHIN + D * D - THIGH * THIGH) / (2 * SHIN * D), -1, 1));
}

// Planted stance foot (s = 0 heel strike .. 1 toe-off): the contact point moves back under the hip at body
// speed; the foot rolls heel -> flat -> ball, lifting the heel as far as the leg needs to reach.
function stanceFoot(s, zf, trav, run, hz, hy, mov, out) {
  const zc = zf - trav * s;
  let p = mov * ((0.3 - 0.24 * run) * (1 - smooth(0, 0.2, s)) - (0.15 + 0.55 * run) * smooth(0.55 - 0.25 * run, 1, s));
  let az = 0, ay = 0;
  for (let i = 0; i < 3; i++) {
    const c = Math.cos(p), sn = Math.sin(p);
    if (p > 0) { az = zc - HEEL_B + (-ANKLE_SOLE * sn + HEEL_B * c); ay = ANKLE_SOLE * c + HEEL_B * sn; }
    else { az = zc + BALL_Z + (-ANKLE_SOLE * sn - BALL_Z * c); ay = ANKLE_SOLE * c - BALL_Z * sn; }
    const over = Math.hypot(az - hz, ay - hy) - (THIGH + SHIN) * 0.995;
    if (over > 0 && zc < hz + 0.05) p = Math.max(p - over * 7, -1.25);
  }
  out.z = az; out.y = ay; out.p = p;
}

// Ankle target and foot pitch for leg cycle position u (0..1, stance first).
function gaitFoot(u, S, run, hz, hy, mov, out) {
  const beta = 0.6 - 0.26 * run;
  const trav = S * beta, zf = trav * (0.36 + 0.08 * run) + 0.01;
  if (u < beta) return stanceFoot(u / beta, zf, trav, run, hz, hy, mov, out);
  const w = (u - beta) / (1 - beta);
  stanceFoot(1, zf, trav, run, hz, hy, mov, _ft2);
  stanceFoot(0, zf, trav, run, hz, hy, mov, _ft3);
  const e = smooth(0.2 * run, 1, w);
  const lift = mov * (0.07 + 0.3 * run) * Math.sin(Math.PI * w ** (0.9 - 0.35 * run));
  out.z = _ft2.z + (_ft3.z - _ft2.z) * e - run * 0.14 * Math.sin(Math.PI * Math.min(1, w * 1.6)) * mov;
  out.y = _ft2.y + (_ft3.y - _ft2.y) * w + lift;
  const mid = 0.12 * mov;
  out.p = w < 0.5 ? _ft2.p + (mid - _ft2.p) * smooth(0, 0.5, w) : mid + (_ft3.p - mid) * smooth(0.5, 1, w);
}

// Sets an arm segment chain from a body-frame upper-arm orientation and shoulder point, compensating the
// game-written pivot rotation so the pivot can stay whatever main.js / walker_weapons made it.
function setArmBody(arm, qBody, shoulder, bend) {
  _qp.copy(arm.pivot.quaternion).invert();
  arm.upper.quaternion.copy(_qp).multiply(qBody);
  arm.upper.position.copy(shoulder).sub(arm.pivot.position).applyQuaternion(_qp);
  arm.fore.rotation.set(-bend, 0, 0);
  arm.hand.rotation.set(0.12 * Math.min(1, bend), 0, 0);
}

function makePoser(R) {
  const { root, body, pelvis, chest, neck, legs, armL, armR, rightArm, leftArm, own } = R;
  const st = {
    t: 0, px: 0, pz: 0, yaw: 0, ph: 0, spd: 0, spdPrev: 0, acc: 0, turn: 0, armedW: 0, air: 0, land: 0,
    wasGrounded: true, clock: Math.random() * 100, init: false, punchW: 0,
  };
  const poleR = new THREE.Vector3(0.75, -0.25, -1).normalize();
  const poleL = new THREE.Vector3(-0.75, -0.25, -1).normalize();
  const poleOut = [new THREE.Vector3(-1, -0.6, -0.3).normalize(), new THREE.Vector3(1, -0.6, -0.3).normalize()];
  const sh = [new THREE.Vector3(), new THREE.Vector3()];
  const armQ = [new THREE.Quaternion(), new THREE.Quaternion()], armS = [new THREE.Vector3(), new THREE.Vector3()], armB = [0, 0];
  const armedQ = [new THREE.Quaternion(), new THREE.Quaternion()], armedS = [new THREE.Vector3(), new THREE.Vector3()], armedB = [0, 0];
  const armedH = [new THREE.Quaternion(), new THREE.Quaternion()];
  const thighA = [0, 0];

  return function pose() {
    const now = performance.now();
    let dt = (now - st.t) / 1000;
    if (st.init && dt < 0.002) return; // second render in the same frame: pose unchanged
    st.t = now;
    const p = root.position;
    if (!st.init) { st.init = true; st.px = p.x; st.pz = p.z; st.yaw = root.rotation.y; dt = 0.016; }
    dt = Math.min(dt, 0.1);
    st.clock += dt;
    const tm = st.clock;

    // ---- motion input ----
    let dist = Math.hypot(p.x - st.px, p.z - st.pz);
    if (dist > 4) dist = 0; // teleport
    st.px = p.x; st.pz = p.z;
    const mo = root.userData.motion;
    const fresh = mo && now - (mo.t || 0) < 250;
    const spdIn = fresh ? Math.min(mo.speed || 0, dist / dt + 0.5) : dist / dt;
    st.spd += (spdIn - st.spd) * Math.min(1, dt * 10);
    const spd = st.spd;
    st.acc += (((spd - st.spdPrev) / dt) - st.acc) * Math.min(1, dt * 6);
    st.spdPrev = spd;
    let dyaw = root.rotation.y - st.yaw;
    dyaw -= Math.round(dyaw / TAU) * TAU;
    st.yaw = root.rotation.y;
    st.turn += (clamp(dyaw / dt, -6, 6) - st.turn) * Math.min(1, dt * 6);
    const grounded = fresh ? mo.grounded !== false : true;
    const vy = fresh ? mo.vy || 0 : 0;
    if (grounded && !st.wasGrounded) st.land = 1;
    st.wasGrounded = grounded;
    st.land = Math.max(0, st.land - dt * 5);
    st.air += ((grounded ? 0 : 1) - st.air) * Math.min(1, dt * 14);
    const punch = fresh && mo.punch >= 0 ? mo.punch : -1;
    const punchSide = fresh && mo.punchHand === 'L' ? 0 : 1; // arms[] index: 0 = leftArm (x < 0), 1 = rightArm
    st.punchW += ((punch >= 0 ? 1 : 0) - st.punchW) * Math.min(1, dt * 18);

    // ---- armed? (a visible weapon in walker_weapons' rig on the right arm pivot) ----
    let rig = null, wi = -1;
    for (const c of rightArm.children) if (!own.has(c)) { rig = c; break; }
    if (rig && rig.visible) for (let i = 0; i < rig.children.length; i++) if (rig.children[i].visible) { wi = i; break; }
    st.armedW = clamp(st.armedW + (wi >= 0 ? 1 : -1) * dt / 0.2, 0, 1);
    const aw = smooth(0, 1, st.armedW);

    // ---- gait ----
    const run = smooth(2.2, 4.2, spd);
    const mov = smooth(0.1, 0.7, spd) * (1 - st.air);
    const idle = 1 - smooth(0.05, 0.5, spd);
    const walkS = clamp(0.75 + 0.42 * spd, 0.9, 1.7), runS = clamp(1.3 + 0.45 * spd, 2.2, 5.4);
    const S = (walkS + (runS - walkS) * run) * mov;
    if (grounded && S > 0.05) st.ph = (st.ph + (dist / Math.max(S, 0.5)) * TAU) % (TAU * 1000);
    const uL = (st.ph / TAU) % 1;
    const c1 = Math.cos(TAU * uL), s1 = Math.sin(TAU * uL);
    const ws = Math.sin(tm * 0.42) * 0.8 + Math.sin(tm * 0.17 + 1.3) * 0.2; // idle weight shift
    const breath = Math.sin(tm * 1.7);

    // ---- pelvis / body ----
    const bobW = -0.02 * Math.cos(2 * TAU * uL) - 0.024, bobR = -0.035 * Math.cos(2 * TAU * (uL - 0.18)) - 0.045;
    const bob = mov * (bobW + (bobR - bobW) * run) - 0.13 * smooth(0, 1, st.land) - st.air * (vy > 0 ? 0.0 : 0.02);
    const sway = mov * -0.024 * s1 * (1 - 0.6 * run) + idle * 0.024 * ws;
    const yawP = mov * (0.11 - 0.04 * run) * c1;
    const rollP = mov * -0.05 * s1 * (1 - 0.5 * run) + idle * 0.04 * ws;
    const h = body.scale.y;
    body.position.set(sway * h, bob * h, 0);
    body.rotation.set(0, 0, clamp(-st.turn * spd * 0.014, -0.3, 0.3));
    pelvis.rotation.set(0, yawP, rollP, 'YXZ');

    // ---- chest: lean, counter-rotation, punch twist, breathing ----
    const ext = punch >= 0 ? Math.sin(Math.PI * clamp((punch - 0.06) / 0.62, 0, 1)) ** 0.7 : 0;
    const pSign = punchSide === 1 ? 1 : -1;
    const lean = (0.04 + run * (0.16 - 0.08 * aw) + clamp(st.acc * 0.025, -0.08, 0.16)) * (1 - st.air * 0.5) + 0.06 * st.punchW - 0.012 * breath * idle + 0.12 * smooth(0, 1, st.land);
    const yawC = -mov * (0.1 + 0.06 * run) * c1 * (1 - 0.75 * aw) + idle * 0.04 * Math.sin(tm * 0.3) - pSign * 0.42 * ext * (1 - aw);
    chest.rotation.set(lean, yawC, -rollP * 0.6, 'YXZ');
    // ---- head: stabilised, looks around when idle, follows the aim when armed ----
    const look = idle * 0.6 * smooth(0.35, 0.8, Math.abs(Math.sin(tm * 0.23))) * Math.sign(Math.sin(tm * 0.23)) * (1 - aw);
    const aimYaw = aw * rightArm.rotation.y * 0.8;
    neck.rotation.set(-lean * 0.7 + st.air * (vy > 0 ? -0.1 : 0.12), -(yawC + yawP) * 0.85 + look + aimYaw, -body.rotation.z * 0.5 - rollP * 0.3, 'YXZ');

    // ---- legs ----
    for (let i = 0; i < 2; i++) {
      const leg = legs[i], s = i === 0 ? -1 : 1;
      const u = (uL + (i === 0 ? 0 : 0.5)) % 1;
      const hz = -s * 0.092 * Math.sin(yawP);
      gaitFoot(u, S / h, run, hz, HIP_H + bob, mov, _ft);
      legIK(hz, HIP_H, _ft.z, _ft.y - bob, _ik);
      let a1 = _ik.a1, a2 = _ik.a2, fp = _ft.p;
      if (st.air > 0.01) {
        // Airborne: tuck while rising (lead knee up, trail leg back), reach down to land while falling.
        const lead = u < 0.5 ? 1 : 0, fall = smooth(-1, -6, vy);
        const t1 = lead ? 0.95 - 0.55 * fall : -0.25 + 0.2 * fall, k = lead ? 1.5 - 1.0 * fall : 1.1 - 0.75 * fall;
        a1 += (t1 - a1) * st.air; a2 += (t1 - k - a2) * st.air; fp += (-0.35 * (1 - fall) - fp) * st.air;
      }
      thighA[i] = a1;
      const gx = leg.pivot.rotation.x;
      leg.thigh.rotation.set(-a1 - gx, 0, -sway * 1.1 + s * 0.02 * idle);
      leg.shin.rotation.set(a1 - a2, 0, 0);
      leg.foot.rotation.set(a2 - fp, 0, 0);
    }
    if (R.skirt) R.skirt(thighA[0], thighA[1]);

    // ---- arms: body-frame target pose (unarmed) ----
    chest.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1, arm = i === 0 ? armL : armR;
      sh[i].set(s * (armR.shX || SHOULDER_X), SHOULDER_H - WAIST_Y + (armR.shY || 0) + 0.004 * breath, 0).applyMatrix4(chest.matrix);
      const u = (uL + (i === 0 ? 0 : 0.5)) % 1;
      const A = (0.32 + 0.48 * run) * mov;
      const swN = -Math.cos(TAU * u - 0.3);
      let swing = A * swN + run * 0.12 * mov;
      let elbow = (0.14 + (0.26 + 0.35 * smooth(-0.4, 1, swN) - 0.14) * mov) * (1 - run) + (1.45 + 0.3 * swN) * run;
      let abd = 0.1 + run * 0.06 + idle * 0.03 + 0.03 * Math.sin(tm * 0.5 + i) * idle;
      let inY = -s * 0.25 * run * mov;
      if (st.air > 0.01) { swing += (0.55 - swing) * st.air; abd += (0.55 - abd) * st.air; elbow += (0.8 - elbow) * st.air; }
      _qa.setFromEuler(_e2.set(-swing, inY, s * abd, 'YXZ'));
      // body frame = chest rotation * local arm rotation
      _qb.setFromEuler(chest.rotation).multiply(_qa);
      armQ[i].copy(_qb); armS[i].copy(sh[i]); armB[i] = elbow;
    }
    // Punch (unarmed): the striking fist drives from the guard to full reach, the other hand guards the chin.
    if (st.punchW > 0.01 && aw < 0.99) {
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1, arm = i === 0 ? armL : armR;
        const striking = i === punchSide;
        const e = striking ? ext : 0;
        _va.set(s * 0.11, 1.5, 0.24).lerp(_vb.set(s * 0.03, 1.47, 0.68), e);
        // IK in body frame (temporarily treat the pivot as identity), then blend.
        solveBody(arm, sh[i], _va, poleOut[i]);
        _qc.slerpQuaternions(armQ[i], _qa, st.punchW);
        armQ[i].copy(_qc);
        armB[i] += (_ik.a1 - armB[i]) * st.punchW;
      }
    }
    // Apply unarmed pose (pivot-compensated).
    setArmBody(armL, armQ[0], armS[0], armB[0]);
    setArmBody(armR, armQ[1], armS[1], armB[1]);
    if (wi >= 0) st.wi = wi;
    if (aw <= 0 || !rig) return;

    // ---- armed: hands on the weapon (pivot frame IK), blended in over 0.2 s ----
    for (let i = 0; i < 2; i++) {
      const arm = i === 0 ? armL : armR;
      armedQ[i].copy(arm.upper.quaternion); armedS[i].copy(arm.upper.position); armedB[i] = -arm.fore.rotation.x;
      armedH[i].copy(arm.hand.quaternion);
    }
    const gi = Math.min(st.wi || 0, GRIP_PTS.length - 1);
    rig.updateMatrix();
    _T.copy(GRIP_PTS[gi]).applyMatrix4(rig.matrix);
    solveArm(armR, _T, _pole.copy(poleR));
    _Q2.copy(rig.quaternion);
    rollHand(armR, _T.set(0, 1, 0).applyQuaternion(_Q2));
    const leftPunch = punch >= 0 && punchSide === 0;
    if (Math.abs(leftArm.rotation.z - 0.15) < 0.02 && !leftPunch) {
      rightArm.updateMatrix(); leftArm.updateMatrix();
      _M.multiplyMatrices(rightArm.matrix, rig.matrix);
      _M2.copy(leftArm.matrix).invert().multiply(_M);
      _T.copy(FORE_PTS[gi]).applyMatrix4(_M2);
      solveArm(armL, _T, _pole.copy(poleL), 0.07);
      _Q.copy(leftArm.quaternion).invert().multiply(rightArm.quaternion).multiply(rig.quaternion);
      rollHand(armL, _T.set(0, 0, 1).applyQuaternion(_Q));
    } else {
      // left arm keeps the unarmed pose (swing / punch)
      armL.upper.quaternion.copy(armedQ[0]); armL.upper.position.copy(armedS[0]);
      armL.fore.rotation.set(-armedB[0], 0, 0); armL.hand.quaternion.copy(armedH[0]);
    }
    if (aw < 1) {
      for (let i = 0; i < 2; i++) {
        const arm = i === 0 ? armL : armR;
        arm.upper.quaternion.slerpQuaternions(armedQ[i], arm.upper.quaternion, aw);
        arm.upper.position.lerpVectors(armedS[i], arm.upper.position, aw);
        arm.fore.rotation.x = -armedB[i] + (arm.fore.rotation.x + armedB[i]) * aw;
        arm.hand.quaternion.slerpQuaternions(armedH[i], arm.hand.quaternion, aw);
      }
    }
  };

  // Two-bone IK in the body frame: shoulder S, target T, elbow towards pole. Writes the upper-arm
  // orientation to _qa and the elbow bend to _ik.a1 (no allocations).
  function solveBody(arm, S, T, pole) {
    const a = UPPER, b = FORE + GRIP;
    _D.subVectors(T, S);
    let d = _D.length();
    _U.copy(_D).divideScalar(d || 1);
    d = Math.max(0.15, Math.min(d, (a + b) * 0.995));
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    _V.copy(pole).addScaledVector(_U, -pole.dot(_U));
    if (_V.lengthSq() < 1e-6) _V.set(0, 0, -1);
    _V.normalize();
    _E.copy(S).addScaledVector(_U, a * cosA).addScaledVector(_V, a * sinA);
    _Y.subVectors(S, _E).divideScalar(a);
    _F.copy(S).addScaledVector(_U, d).sub(_E).normalize();
    _ik.a1 = Math.acos(Math.max(-1, Math.min(1, -_Y.dot(_F))));
    _Z.copy(_F).addScaledVector(_Y, -_F.dot(_Y));
    if (_Z.lengthSq() < 1e-8) _Z.copy(_V).negate();
    _Z.normalize();
    _X.crossVectors(_Y, _Z);
    _M.makeBasis(_X, _Y, _Z);
    _qa.setFromRotationMatrix(_M);
  }
}

// CPU pose for a skirt mesh: vertices below the waist turn about the hip axis with their side's thigh.
function makeSkirtPoser(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal;
  const base = pos.array.slice(), nbase = nrm.array.slice();
  pos.setUsage(THREE.DynamicDrawUsage); nrm.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return (aL, aR) => {
    const P = pos.array, N = nrm.array;
    for (let i = 0; i < P.length; i += 3) {
      const x = base[i], y = base[i + 1], z = base[i + 2];
      const k = clamp((0.98 - y) / 0.38, 0, 1) * smooth(0.0, 0.1, Math.abs(x));
      const a = (x < 0 ? aL : aR) * 0.78 * k;
      const c = Math.cos(a), s = Math.sin(a), dy = y - HIP_H;
      P[i + 1] = HIP_H + dy * c + z * s; P[i + 2] = -dy * s + z * c;
      const ny = nbase[i + 1], nz = nbase[i + 2];
      N[i + 1] = ny * c + nz * s; N[i + 2] = -ny * s + nz * c;
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;
  };
}

// ---------------------------------------------------------------------------------------------------

export function buildHeroAvatar({ seed } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // Pelvis and chest pivot at the waist, the head at the neck; inner groups keep body coordinates.
  const mkPivot = (parent, y) => {
    const g = new THREE.Group(); g.position.set(0, y, 0); parent.add(g);
    const inner = new THREE.Group(); inner.position.set(0, -y, 0); g.add(inner);
    return [g, inner];
  };
  const [pelvis, pelvisIn] = mkPivot(body, 0.95);
  const [chest, chestIn] = mkPivot(body, WAIST_Y);
  const [neck, neckIn] = mkPivot(chestIn, NECK_Y);
  const mkLimbPivot = (y) => { const g = new THREE.Group(); g.position.set(0, y, 0); body.add(g); return g; };
  const leftLeg = mkLimbPivot(HIP_H), rightLeg = mkLimbPivot(HIP_H);
  const leftArm = mkLimbPivot(SHOULDER_H), rightArm = mkLimbPivot(SHOULDER_H);

  const R = { root, body, pelvis, chest, neck, rightArm, leftArm, own: new Set(), legs: null, armL: null, armR: null, skirt: null };
  let built = { meshes: [], groups: [], mats: null };

  const build = (look) => {
    // Dispose the previous person (geometry, materials, segment groups) but keep the pivots.
    for (const m of built.meshes) { m.parent && m.parent.remove(m); m.geometry.dispose(); }
    for (const g of built.groups) g.parent && g.parent.remove(g);
    if (built.mats) for (const k in built.mats) built.mats[k].dispose && built.mats[k].dispose();
    const L = look;
    HP.jaw = L.female ? 0.38 : 0.3; HP.brow = L.female ? 0.0025 : 0.005; HP.lips = L.female ? 0.005 : 0.004;
    const M = L.soldier ? makeSoldierMaterials() : makeMaterials(L);
    const P = new Parts();
    const groups = [];
    const legs = [[leftLeg, -1], [rightLeg, 1]].map(([pivot, s]) => {
      const r = L.soldier ? buildSoldierLeg(P, M, pivot, s) : buildCivilianLeg(P, M, pivot, s, L);
      groups.push(r.thigh);
      return { pivot, ...r };
    });
    const armL = { pivot: leftArm, side: -1, ...(L.soldier ? buildSoldierArm(P, M, leftArm, -1) : buildCivilianArm(P, M, leftArm, -1, L)) };
    const armR = { pivot: rightArm, side: 1, ...(L.soldier ? buildSoldierArm(P, M, rightArm, 1) : buildCivilianArm(P, M, rightArm, 1, L)) };
    groups.push(armL.upper, armR.upper);
    if (L.soldier) {
      buildSoldierTorso(P, M, pelvisIn, chestIn);
      const head = buildHead(P, M, neckIn, L);
      groups.push(head, buildHelmet(P, M, neckIn));
    } else {
      buildCivilianTorso(P, M, pelvisIn, chestIn, L);
      const head = buildHead(P, M, neckIn, L);
      groups.push(head);
      buildHair(P, M, head, L);
      if (L.cap) buildCap(P, M, head);
      if (L.glasses) buildGlasses(P, M, head, L);
    }
    const meshes = P.build();
    body.scale.setScalar(L.height);
    armL.shX = armR.shX = L.soldier ? SHOULDER_X : SHOULDER_X * (L.female ? 0.93 : 1) * Math.sqrt(L.build);
    armL.shY = armR.shY = L.soldier ? 0 : -0.03;
    R.legs = legs; R.armL = armL; R.armR = armR;
    R.own = new Set([armR.upper]);
    const skirtMesh = !L.soldier && meshes.find((m) => m.material === M.skirt);
    if (skirtMesh) { M.skirt.side = THREE.DoubleSide; M.skirt.shadowSide = THREE.BackSide; R.skirt = makeSkirtPoser(skirtMesh); } else R.skirt = null;
    built = { meshes, groups, mats: M };
    root.userData.look = L;
    R.pose = makePoser(R);
  };

  // Kept for API compatibility with updateEntityNitroVfx (no sci-fi effects on a person).
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  root.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  root.userData = {
    hero: true, leftLeg, rightLeg, leftArm, rightArm, armL: leftArm, armR: rightArm, legL: leftLeg, legR: rightLeg,
    nitroVfx, vfxParts,
    motion: { speed: 0, grounded: true, vy: 0, sprint: false, punch: -1, punchHand: 'L', t: 0 },
    look: null,
    reroll: (s) => { build(heroLook(s == null ? undefined : s)); R.pose(); return root.userData.look; },
  };
  build(heroLook(seed == null ? undefined : seed));
  root.updateMatrixWorld = function updateMatrixWorld(force) {
    R.pose();
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
  R.pose();
  return root;
}
