// [drivers] Detailed cabin interior + seated people for traffic and hero vehicles (hero builders with
// options.lod). Everything is plain meshes whose materials carry userData.lodKind; traffic_models.js
// flattens them into the instanced car geometry with an aKind / aSeat vertex attribute and the traffic car
// shader picks clothes, skin and hair per car and per seat (and hides empty seats).
//
// lodKind codes (shared with traffic_models.js): 1 glass, 2 tyre, 3 rim / bright metal, 4 shirt, 5 skin,
// 6 hair, 7 interior, 8 seat, 9 police uniform, 10 forearm (skin for short sleeves, else shirt).
// Seat roles (mesh.userData.lodSeat): 0 driver (always), 1 front passenger, 2 rear passenger,
// 3 bus passenger, 4 always present (police partner).
import * as THREE from '../../vendor/three.module.js';

export const KIND = { GLASS: 1, TYRE: 2, METAL: 3, SHIRT: 4, SKIN: 5, HAIR: 6, INTERIOR: 7, SEAT: 8, UNIFORM: 9, FOREARM: 10 };

const MATS = new Map();
function kindMat(kind, tone) {
  const key = tone != null ? `${kind}_${tone}` : kind;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: tone ?? (kind === KIND.INTERIOR ? 0x1b1c1f : kind === KIND.SEAT ? 0x26272b : 0x808080),
      roughness: kind === KIND.METAL ? 0.25 : 0.65,
      metalness: kind === KIND.METAL ? 0.8 : 0.1,
    });
    m.userData.lodKind = kind;
    MATS.set(key, m);
  }
  return m;
}

// Smooth cylinder segment along segment a -> b (width w) with smooth vertex normals.
function limbBox(a, b, w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(0.001, A.distanceTo(B));
  const g = new THREE.CylinderGeometry(w * 0.56, w * 0.46, len, 8, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  g.computeVertexNormals();
  return g;
}

function add(parent, geo, kind, seat, x, y, z, tone) {
  if (x || y || z) geo.translate(x, y, z);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, kindMat(kind, tone));
  if (seat != null) m.userData.lodSeat = seat;
  parent.add(m);
  return m;
}

// Sculpted anatomical head: smooth sphere split into skin face and textured hair crown,
// plus sculpted nose, ears, eyebrows, eyes, mouth, and optional cap visor.
function head(parent, seat, x, y, z, r, cap) {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.scale(0.92, 1.1, 1.02);
  const hair = [], skin = [];
  const P = g.attributes.position, idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    let cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cy += P.getY(idx[t + k]) / 3; cz += P.getZ(idx[t + k]) / 3; }
    (cy > r * 0.32 || (cz < -r * 0.18 && cy > -r * 0.48) ? hair : skin).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const hg = g.clone();
  hg.setIndex(hair);
  for (let i = 0; i < hg.attributes.position.count; i++) {
    const px = hg.attributes.position.getX(i);
    const py = hg.attributes.position.getY(i);
    const pz = hg.attributes.position.getZ(i);
    if (py > 0 || pz < 0) hg.attributes.position.setXYZ(i, px * 1.05, py * 1.06, pz * 1.05);
  }
  hg.computeVertexNormals();
  g.setIndex(skin);
  g.computeVertexNormals();
  add(parent, g, KIND.SKIN, seat, x, y, z);
  add(parent, hg, cap ? KIND.UNIFORM : KIND.HAIR, seat, x, y, z);

  // Sculpted 3D nose bridge & tip
  const nose = new THREE.ConeGeometry(r * 0.15, r * 0.34, 6);
  nose.rotateX(Math.PI * 0.42);
  nose.computeVertexNormals();
  add(parent, nose, KIND.SKIN, seat, x, y - r * 0.04, z + r * 0.96);

  // Sculpted ears, eyes, and eyebrows
  for (const sd of [-1, 1]) {
    const ear = new THREE.SphereGeometry(r * 0.17, 6, 5);
    ear.scale(0.55, 1.25, 0.85);
    ear.computeVertexNormals();
    add(parent, ear, KIND.SKIN, seat, x + sd * r * 0.88, y - r * 0.04, z - r * 0.06);

    const eye = new THREE.SphereGeometry(r * 0.085, 6, 5);
    eye.scale(1.1, 0.8, 0.5);
    eye.computeVertexNormals();
    add(parent, eye, KIND.INTERIOR, seat, x + sd * r * 0.31, y + r * 0.12, z + r * 0.89);

    const brow = new THREE.BoxGeometry(r * 0.26, r * 0.06, r * 0.06);
    brow.rotateZ(-sd * 0.08);
    brow.computeVertexNormals();
    add(parent, brow, KIND.HAIR, seat, x + sd * r * 0.31, y + r * 0.26, z + r * 0.90);
  }

  // Subtle sculpted mouth
  const mouth = new THREE.BoxGeometry(r * 0.28, r * 0.05, r * 0.05);
  mouth.computeVertexNormals();
  add(parent, mouth, KIND.INTERIOR, seat, x, y - r * 0.36, z + r * 0.88);
}

/**
 * One seated person, hip joint at (x, y, z), facing +Z; wheel: arms reach a steering wheel.
 * hand: [dy, dz] of the wheel rim from the hip; passengers have resting lap arms; uniform = police shirt and cap.
 */
export function addPerson(parent, x, y, z, seat, { wheel = false, uniform = false, scale = 1, hand = null } = {}) {
  const s = scale;
  const shirt = uniform ? KIND.UNIFORM : KIND.SHIRT;

  // Contoured torso with chest & waist taper
  const torso = new THREE.CylinderGeometry(0.188 * s, 0.145 * s, 0.50 * s, 10, 2);
  torso.scale(1.0, 1.0, 0.64);
  torso.translate(0, 0.27 * s, 0);
  torso.rotateX(-0.12);
  torso.computeVertexNormals();
  add(parent, torso, shirt, seat, x, y, z - 0.02);

  // Shirt collar / jacket lapels + center placket seam + belt & buckle
  for (const sd of [-1, 1]) {
    const lapel = new THREE.BoxGeometry(0.065 * s, 0.14 * s, 0.03 * s);
    lapel.rotateZ(sd * 0.35);
    lapel.rotateX(-0.12);
    lapel.computeVertexNormals();
    add(parent, lapel, shirt, seat, x + sd * 0.055 * s, y + 0.46 * s, z + 0.075 * s);

    // Shoulder deltoid cap
    const deltoid = new THREE.SphereGeometry(0.065 * s, 7, 6);
    deltoid.computeVertexNormals();
    add(parent, deltoid, shirt, seat, x + sd * 0.19 * s, y + 0.47 * s, z - 0.05 * s);
  }

  const buckle = new THREE.BoxGeometry(0.055 * s, 0.038 * s, 0.025 * s);
  buckle.computeVertexNormals();
  add(parent, buckle, KIND.METAL, seat, x, y + 0.08 * s, z + 0.095 * s);

  // Anatomical neck cylinder
  const neck = new THREE.CylinderGeometry(0.048 * s, 0.054 * s, 0.11 * s, 8, 1);
  neck.computeVertexNormals();
  add(parent, neck, KIND.SKIN, seat, x, y + 0.54 * s, z - 0.045 * s);

  // Sculpted head with facial micro-details
  head(parent, seat, x, y + 0.66 * s, z - 0.05, 0.105 * s, uniform);

  if (uniform) {
    // Police officer peaked cap crown, forward visor brim & metallic badge
    const capCrown = new THREE.CylinderGeometry(0.122 * s, 0.112 * s, 0.065 * s, 10, 1);
    capCrown.computeVertexNormals();
    add(parent, capCrown, KIND.UNIFORM, seat, x, y + 0.755 * s, z - 0.05);

    const visor = new THREE.CylinderGeometry(0.105 * s, 0.105 * s, 0.018 * s, 10, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
    visor.scale(1.0, 1.0, 1.25);
    visor.rotateX(0.18);
    visor.computeVertexNormals();
    add(parent, visor, KIND.INTERIOR, seat, x, y + 0.725 * s, z + 0.02 * s);

    const badge = new THREE.BoxGeometry(0.028 * s, 0.032 * s, 0.015 * s);
    badge.computeVertexNormals();
    add(parent, badge, KIND.METAL, seat, x, y + 0.758 * s, z + 0.062 * s);
  }

  if (!wheel) return;
  for (const sd of [-1, 1]) {
    const hy = hand ? Math.max(0.2, Math.min(0.5, hand[0])) : 0.36;
    const hz = hand ? Math.max(0.3, Math.min(0.55, hand[1])) : 0.42;
    const sh = [x + sd * 0.19 * s, y + 0.47 * s, z - 0.05];
    const hd = [x + sd * 0.15 * s, y + hy, z + hz];
    const el = [x + sd * 0.24 * s, (sh[1] + hd[1]) / 2 - 0.12, (sh[2] + hd[2]) / 2 - 0.02];
    add(parent, limbBox(sh, el, 0.095 * s), shirt, seat, 0, 0, 0);
    add(parent, limbBox(el, hd, 0.08 * s), uniform ? KIND.UNIFORM : KIND.FOREARM, seat, 0, 0, 0);

    // Sculpted hand gripping the wheel
    const fist = new THREE.SphereGeometry(0.038 * s, 6, 5);
    fist.scale(0.85, 1.0, 1.25);
    fist.computeVertexNormals();
    add(parent, fist, KIND.SKIN, seat, hd[0], hd[1], hd[2]);
  }
}

/**
 * Cabin for a low-detail car: a dark tub facing inward (x half-width hw, y0..y1, z0..z1), seat backs with
 * headrests at the given rows, and the occupants. seats: [{ x, y (hip), z, seat, wheel?, uniform? }];
 * tone / seatTone: colours for a lit interior (bus).
 */
export function addLodCabin(parent, { hw, y0, y1, z0, z1, backs = [], seats = [], tone, seatTone }) {
  const tub = new THREE.BoxGeometry(hw * 2, y1 - y0, z1 - z0);
  const ix = tub.index.array;
  for (let t = 0; t < ix.length; t += 3) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
  const nr = tub.attributes.normal.array;
  for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
  add(parent, tub, KIND.INTERIOR, null, 0, (y0 + y1) / 2, (z0 + z1) / 2, tone);

  for (const b of backs) {
    const g = new THREE.BoxGeometry(b.w, b.h * 0.78, 0.10);
    g.translate(0, (b.h * 0.78) / 2, 0);
    g.rotateX(-0.18);
    g.computeVertexNormals();
    add(parent, g, KIND.SEAT, null, b.x, b.y, b.z, seatTone);

    // Sculpted headrest pillow above seat back
    const hr = new THREE.BoxGeometry(b.w * 0.52, b.h * 0.24, 0.085);
    hr.translate(0, b.h * 0.90, -0.02);
    hr.rotateX(-0.18);
    hr.computeVertexNormals();
    add(parent, hr, KIND.SEAT, null, b.x, b.y, b.z, seatTone);
  }
  for (const p of seats) addPerson(parent, p.x, p.y, p.z, p.seat, p);
}
