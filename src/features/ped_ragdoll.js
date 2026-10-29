// [drivers] Connected pedestrian ragdoll: 11 Verlet points (head, neck, pelvis, shoulders, hands, hips, feet)
// held together by distance constraints (a rigid torso box, rigid head, one-piece arms and legs, a few
// minimum distances so limbs do not fold through the chest). The body tumbles and lies down as ONE body:
// each rigid part mesh (RAGDOLL_PART_SPECS in person_model.js) is posed from its points every frame.
// Parts carry pt.q (quaternion) + pt.x/y/z for city_traffic's _writeInstances. No allocations per frame.
import * as THREE from '../../vendor/three.module.js';
import { RAGDOLL_PART_SPECS } from './person_model.js';

// Rest pose, person frame (x right, y up, z forward), unscaled.
const H = 0, N = 1, P = 2, SL = 3, SR = 4, HL = 5, HR = 6, PL = 7, PR = 8, FL = 9, FR = 10, NP = 11;
const REST = [
  [0, 1.62, 0], [0, 1.42, 0], [0, 0.95, 0], [-0.2, 1.4, 0], [0.2, 1.4, 0],
  [-0.22, 0.84, 0.02], [0.22, 0.84, 0.02], [-0.09, 0.93, 0], [0.09, 0.93, 0], [-0.09, 0.04, 0], [0.09, 0.04, 0],
];
const RADIUS = [0.11, 0.08, 0.1, 0.07, 0.07, 0.05, 0.05, 0.08, 0.08, 0.06, 0.06];
// [a, b, kind]: 0 = fixed length, 1 = minimum distance (value in MIN_D)
const LINKS = [];
{
  const torso = [N, P, SL, SR, PL, PR];
  for (let i = 0; i < torso.length; i++) for (let j = i + 1; j < torso.length; j++) LINKS.push([torso[i], torso[j], 0]);
  LINKS.push([H, N, 0], [H, SL, 0], [H, SR, 0], [SL, HL, 0], [SR, HR, 0], [PL, FL, 0], [PR, FR, 0]);
  LINKS.push([HL, SR, 1, 0.26], [HR, SL, 1, 0.26], [HL, HR, 1, 0.12], [FL, FR, 1, 0.12], [FL, N, 1, 0.62], [FR, N, 1, 0.62], [HL, H, 1, 0.18], [HR, H, 1, 0.18]);
}
// Part frames: [anchor, y from -> y to, x from -> x to]
const FRAMES = {
  torso: [P, P, N, SL, SR],
  head: [N, N, H, SL, SR],
  armL: [SL, HL, SL, SL, SR],
  armR: [SR, HR, SR, SL, SR],
  legL: [PL, FL, PL, PL, PR],
  legR: [PR, FR, PR, PL, PR],
  accessory: [P, P, N, SL, SR],
};

const STEP = 1 / 120, ITERS = 6, GRAV = 20;
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// Orthonormal frame from point array A (stride 3) for a part spec; writes quaternion to q. Falls back to
// the torso's forward when the x reference lines up with the limb.
function frame(A, f, q) {
  const [, ya, yb, xa, xb] = f;
  _y.set(A[yb * 3] - A[ya * 3], A[yb * 3 + 1] - A[ya * 3 + 1], A[yb * 3 + 2] - A[ya * 3 + 2]).normalize();
  _x.set(A[xb * 3] - A[xa * 3], A[xb * 3 + 1] - A[xa * 3 + 1], A[xb * 3 + 2] - A[xa * 3 + 2]).normalize();
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_x.lengthSq() < 0.04) {
    _z.set(A[N * 3] - A[P * 3], A[N * 3 + 1] - A[P * 3 + 1], A[N * 3 + 2] - A[P * 3 + 2]);
    _x.crossVectors(_y, _z);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.addScaledVector(_y, -_x.dot(_y));
  }
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return q.setFromRotationMatrix(_m);
}

/**
 * Start a ragdoll for a walking pedestrian. look: { wScale, hScale }; (vx, vy, vz) launch velocity of the
 * body; (dx, dz) unit push direction (the feet are swept along it, the body tumbles over them).
 * Returns the parts array (one entry per RAGDOLL_PART_SPECS with pose fields and pt.q).
 */
export function startRagdoll(ped, L, groundY, vx, vy, vz, dx, dz, spin) {
  const ws = L.wScale || 1, hs = L.hScale || 1;
  const cy = Math.cos(ped.ryaw || 0), sy = Math.sin(ped.ryaw || 0);
  const X = new Float32Array(NP * 3), O = new Float32Array(NP * 3), R = new Float32Array(NP * 3);
  // body-local rest (scaled) and world positions; mid-stride limbs from the walk phase
  const sw = Math.sin(ped.phase || 0) * (ped.amp || 0) * 0.5;
  for (let i = 0; i < NP; i++) {
    let [lx, ly, lz] = REST[i];
    if (i === FL || i === FR) lz += (i === FL ? sw : -sw) * 0.9;
    if (i === HL || i === HR) lz += (i === HL ? -sw : sw) * 0.5;
    lx *= ws; ly *= hs; lz *= ws;
    R[i * 3] = REST[i][0] * ws; R[i * 3 + 1] = REST[i][1] * hs; R[i * 3 + 2] = REST[i][2] * ws;
    X[i * 3] = ped.x + lx * cy + lz * sy;
    X[i * 3 + 1] = groundY + ly;
    X[i * 3 + 2] = ped.z - lx * sy + lz * cy;
  }
  // velocity = launch + spin about the horizontal axis across the push (feet swept forward)
  const ax = -dz * spin, az = dx * spin, comY = groundY + 0.95 * hs;
  for (let i = 0; i < NP; i++) {
    const ry = X[i * 3 + 1] - comY;
    // omega x r with omega = (ax, 0, az), r = (rx, ry, rz) ~ (0, ry, 0)
    const wx = -az * ry, wz = ax * ry;
    const jit = 0.4;
    O[i * 3] = X[i * 3] - (vx + wx + (Math.random() - 0.5) * jit) * STEP;
    O[i * 3 + 1] = X[i * 3 + 1] - (vy + (Math.random() - 0.5) * jit) * STEP;
    O[i * 3 + 2] = X[i * 3 + 2] - (vz + wz + (Math.random() - 0.5) * jit) * STEP;
  }
  // constraint rest lengths from the scaled rest pose
  const len = new Float32Array(LINKS.length);
  for (let k = 0; k < LINKS.length; k++) {
    const [a, b, kind, d] = LINKS[k];
    len[k] = kind ? d * hs : Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
  }
  // per part: inverse rest rotation and the part origin's offset in its rest frame
  const parts = [];
  for (const spec of RAGDOLL_PART_SPECS) {
    const f = FRAMES[spec.name];
    const qr = frame(R, f, new THREE.Quaternion());
    const a = f[0];
    const off = new THREE.Vector3(spec.ox * ws - R[a * 3], spec.oy * hs - R[a * 3 + 1], spec.oz * ws - R[a * 3 + 2]).applyQuaternion(qr.clone().invert());
    parts.push({ name: spec.name, x: 0, y: 0, z: 0, q: new THREE.Quaternion(), qrInv: qr.invert(), off, f, scale: 1, visible: true, instanceIndex: -1 });
  }
  ped.rag = { X, O, len, acc: 0, calm: 0, groundY, t: 0 };
  posePartsFromPoints(ped.rag, parts);
  return parts;
}

function posePartsFromPoints(rag, parts) {
  const X = rag.X;
  for (const pt of parts) {
    frame(X, pt.f, _q);
    pt.q.copy(_q).multiply(pt.qrInv);
    _v.copy(pt.off).applyQuaternion(_q);
    const a = pt.f[0];
    pt.x = X[a * 3] + _v.x; pt.y = X[a * 3 + 1] + _v.y; pt.z = X[a * 3 + 2] + _v.z;
  }
}

/** Advance the ragdoll by dt; returns true once the body has come to rest. */
export function stepRagdoll(ped, dt) {
  const rag = ped.rag;
  if (!rag) return true;
  const X = rag.X, O = rag.O, g = rag.groundY;
  rag.acc = Math.min(rag.acc + dt, STEP * 6);
  rag.t += dt;
  let maxV = 0;
  while (rag.acc >= STEP) {
    rag.acc -= STEP;
    for (let i = 0; i < NP; i++) {
      const i3 = i * 3;
      for (let c = 0; c < 3; c++) {
        const x = X[i3 + c], v = (x - O[i3 + c]) * 0.995;
        O[i3 + c] = x;
        X[i3 + c] = x + v - (c === 1 ? GRAV * STEP * STEP : 0);
      }
    }
    for (let it = 0; it < ITERS; it++) {
      for (let k = 0; k < LINKS.length; k++) {
        const L = LINKS[k], a = L[0] * 3, b = L[1] * 3;
        const ex = X[b] - X[a], ey = X[b + 1] - X[a + 1], ez = X[b + 2] - X[a + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-4;
        const r = rag.len[k];
        if (L[2] === 1 && d >= r) continue;
        const s = ((d - r) / d) * 0.5;
        X[a] += ex * s; X[a + 1] += ey * s; X[a + 2] += ez * s;
        X[b] -= ex * s; X[b + 1] -= ey * s; X[b + 2] -= ez * s;
      }
      for (let i = 0; i < NP; i++) {
        const i3 = i * 3, floor = g + RADIUS[i];
        if (X[i3 + 1] < floor) {
          X[i3 + 1] = floor;
          // ground friction: bleed horizontal motion, small bounce
          O[i3] += (X[i3] - O[i3]) * 0.35;
          O[i3 + 2] += (X[i3 + 2] - O[i3 + 2]) * 0.35;
          if (O[i3 + 1] < floor) O[i3 + 1] = floor + (floor - O[i3 + 1]) * 0.15;
        }
      }
    }
  }
  for (let i = 0; i < NP * 3; i += 3) {
    const v = Math.hypot(X[i] - O[i], X[i + 1] - O[i + 1], X[i + 2] - O[i + 2]) / STEP;
    if (v > maxV) maxV = v;
  }
  rag.calm = maxV < 0.25 ? rag.calm + dt : 0;
  posePartsFromPoints(rag, ped.parts);
  return rag.calm > 0.35 || rag.t > 4.5;
}

/** Pelvis position of a ragdoll (for ped.x/z bookkeeping). */
export function ragdollCenter(ped, out) {
  const X = ped.rag.X;
  out.x = X[P * 3]; out.z = X[P * 3 + 2];
  return out;
}
