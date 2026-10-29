// [drivers] Cheap cabin interior + seated people for the low-detail traffic builds (hero builders with
// options.lod). Everything is plain meshes whose materials carry userData.lodKind; traffic_models.js
// flattens them into the instanced car geometry with an aKind / aSeat vertex attribute and the traffic car
// shader picks clothes, skin and hair per car and per seat (and hides empty seats). Budget per car: a dark
// inward-facing tub (12 tris), seat backs with headrests (12 each), a driver with arms on the wheel (~80)
// and armless passengers (~48).
//
// lodKind codes (shared with traffic_models.js): 1 glass, 2 tyre, 3 rim / bright metal, 4 shirt, 5 skin,
// 6 hair, 7 interior, 8 seat, 9 police uniform, 10 forearm (skin for short sleeves, else shirt).
// Seat roles (mesh.userData.lodSeat): 0 driver (always), 1 front passenger, 2 rear passenger,
// 3 bus passenger, 4 always present (police partner).
import * as THREE from '../../vendor/three.module.js';

export const KIND = { GLASS: 1, TYRE: 2, METAL: 3, SHIRT: 4, SKIN: 5, HAIR: 6, INTERIOR: 7, SEAT: 8, UNIFORM: 9, FOREARM: 10 };

const MATS = new Map();
function kindMat(kind, tone) {
  const key = tone != null ? `${kind}-${tone}` : kind;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: tone ?? (kind === KIND.INTERIOR ? 0x1b1c1f : kind === KIND.SEAT ? 0x26272b : 0x808080) });
    m.userData.lodKind = kind;
    MATS.set(key, m);
  }
  return m;
}

// Open square prism along segment a -> b (width w), 8 tris: the ends are always inside a sleeve or a fist.
function limbBox(a, b, w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(w * 0.7, w * 0.7, len, 4, 1, true);
  g.rotateY(Math.PI / 4);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

function add(parent, geo, kind, seat, x, y, z, tone) {
  geo.translate(x, y, z);
  const m = new THREE.Mesh(geo, kindMat(kind, tone));
  if (seat != null) m.userData.lodSeat = seat;
  parent.add(m);
  return m;
}

// Head: low sphere split into a skin face and a hair cap (back and top).
function head(parent, seat, x, y, z, r, cap) {
  const g = new THREE.SphereGeometry(r, 6, 4);
  g.scale(0.92, 1.1, 1.0);
  const hair = [], skin = [];
  const P = g.attributes.position, idx = g.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    let cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cy += P.getY(idx[t + k]) / 3; cz += P.getZ(idx[t + k]) / 3; }
    (cy > r * 0.35 || (cz < -r * 0.25 && cy > -r * 0.5) ? hair : skin).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const hg = g.clone(); hg.setIndex(hair);
  g.setIndex(skin);
  add(parent, g, KIND.SKIN, seat, x, y, z);
  add(parent, hg, cap ? KIND.UNIFORM : KIND.HAIR, seat, x, y, z);
}

/**
 * One seated person, hip joint at (x, y, z), facing +Z; wheel: arms reach a steering wheel.
 * hand: [dy, dz] of the wheel rim from the hip; passengers are armless; uniform = police shirt and cap.
 */
export function addPerson(parent, x, y, z, seat, { wheel = false, uniform = false, scale = 1, hand = null } = {}) {
  const s = scale;
  const shirt = uniform ? KIND.UNIFORM : KIND.SHIRT;
  const torso = new THREE.BoxGeometry(0.36 * s, 0.5 * s, 0.22 * s);
  torso.translate(0, 0.27 * s, 0);
  torso.rotateX(-0.12);
  add(parent, torso, shirt, seat, x, y, z - 0.02);
  head(parent, seat, x, y + 0.66 * s, z - 0.05, 0.105 * s, false);
  if (uniform) add(parent, new THREE.CylinderGeometry(0.115 * s, 0.11 * s, 0.06 * s, 6, 1), KIND.UNIFORM, seat, x, y + 0.75 * s, z - 0.05);
  if (!wheel) return;
  for (const sd of [-1, 1]) {
    const hy = hand ? Math.max(0.2, Math.min(0.5, hand[0])) : 0.36, hz = hand ? Math.max(0.3, Math.min(0.55, hand[1])) : 0.42;
    const sh = [x + sd * 0.19 * s, y + 0.47 * s, z - 0.05], hd = [x + sd * 0.15 * s, y + hy, z + hz];
    const el = [x + sd * 0.24 * s, (sh[1] + hd[1]) / 2 - 0.12, (sh[2] + hd[2]) / 2 - 0.02];
    add(parent, limbBox(sh, el, 0.095 * s), shirt, seat, 0, 0, 0);
    add(parent, limbBox(el, hd, 0.08 * s), uniform ? KIND.UNIFORM : KIND.FOREARM, seat, 0, 0, 0);
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
    const g = new THREE.BoxGeometry(b.w, b.h, 0.1);
    g.translate(0, b.h / 2, 0);
    g.rotateX(-0.18);
    add(parent, g, KIND.SEAT, null, b.x, b.y, b.z, seatTone);
  }
  for (const p of seats) addPerson(parent, p.x, p.y, p.z, p.seat, p);
}
