// [drivers] Physically Constrained Articulated Human Ragdoll ($m = 75\text{ kg}$, $g = -9.81\text{ m/s}^2$).
// 15-point anatomical skeleton with knees and elbows + strict physiological joint limits:
// - Body Pitch (rotX / fall angle): clamped strictly to [-88°, +88°] (never spins 360° end-over-end on the ground)
// - Hip Angle: clamped to [-35° flexion .. +15° extension] (torso and thighs NEVER fold together past 35°!)
// - Knee Angle: hinge joint clamped strictly to [0° straight .. +115° flexion] (0° hyperextension!)
// - Shoulder & Elbow Angles: clamped to [-45° .. +65°] with natural outward sprawl (±25°) on the ground.
// Parts carry pt.q (quaternion) + pt.x/y/z for city_traffic's _writeInstances. No allocations per frame.
import * as THREE from '../../vendor/three.module.js';
import { RAGDOLL_PART_SPECS } from './person_model.js';

// 15 anatomical Verlet points, person frame (+X right, +Y up, +Z forward), unscaled:
// 0:H (head), 1:N (neck), 2:P (pelvis), 3:SL (left shoulder), 4:SR (right shoulder),
// 5:EL (left elbow), 6:ER (right elbow), 7:HL (left hand), 8:HR (right hand),
// 9:PL (left hip), 10:PR (right hip), 11:KL (left knee), 12:KR (right knee),
// 13:FL (left foot), 14:FR (right foot).
const H = 0, N = 1, P = 2, SL = 3, SR = 4, EL = 5, ER = 6, HL = 7, HR = 8, PL = 9, PR = 10, KL = 11, KR = 12, FL = 13, FR = 14, NP = 15;
const REST = [
  [0, 1.635, 0.01],     // 0: H  head
  [0, 1.46, 0],         // 1: N  neck
  [0, 0.95, 0],         // 2: P  pelvis
  [-0.20, 1.42, 0],     // 3: SL left shoulder
  [0.20, 1.42, 0],      // 4: SR right shoulder
  [-0.21, 1.13, -0.01], // 5: EL left elbow
  [0.21, 1.13, -0.01],  // 6: ER right elbow
  [-0.22, 0.84, 0.03],  // 7: HL left hand
  [0.22, 0.84, 0.03],   // 8: HR right hand
  [-0.095, 0.91, 0],    // 9: PL left hip
  [0.095, 0.91, 0],     // 10: PR right hip
  [-0.095, 0.49, 0.01], // 11: KL left knee
  [0.095, 0.49, 0.01],  // 12: KR right knee
  [-0.095, 0.05, 0.02], // 13: FL left foot
  [0.095, 0.05, 0.02],  // 14: FR right foot
];
const RADIUS = [
  0.11, 0.08, 0.11,
  0.07, 0.07, 0.06, 0.06, 0.05, 0.05,
  0.09, 0.09, 0.065, 0.065, 0.06, 0.06,
];

// [a, b, kind, minD]: 0 = fixed bone length, 1 = minimum distance constraint
const LINKS = [];
{
  const torso = [N, P, SL, SR, PL, PR];
  for (let i = 0; i < torso.length; i++) {
    for (let j = i + 1; j < torso.length; j++) LINKS.push([torso[i], torso[j], 0]);
  }
  // Head & neck cage (keeps head aligned with cervical spine, no 180 deg neck snap)
  LINKS.push([H, N, 0], [H, SL, 0], [H, SR, 0], [H, P, 1, 0.64]);
  // Upper & lower limbs (articulated at elbow and knee!)
  LINKS.push(
    [SL, EL, 0], [EL, HL, 0],
    [SR, ER, 0], [ER, HR, 0],
    [PL, KL, 0], [KL, FL, 0],
    [PR, KR, 0], [KR, FR, 0]
  );
  // Self-collision & anti-folding distance clamps
  LINKS.push(
    [EL, ER, 1, 0.34],
    [HL, HR, 1, 0.18],
    [KL, KR, 1, 0.17],
    [FL, FR, 1, 0.17],
    [KL, N, 1, 0.80],
    [KR, N, 1, 0.80],
    [FL, P, 1, 0.58],
    [FR, P, 1, 0.58],
    [FL, N, 1, 1.05],
    [FR, N, 1, 1.05]
  );
}

// Part frames: [anchor, y from -> y to, x from -> x to]
const FRAMES = {
  torso: [P, P, N, SL, SR],
  head: [N, N, H, SL, SR],
  armL: [SL, EL, SL, SL, SR],
  foreL: [EL, HL, EL, SL, SR],
  armR: [SR, ER, SR, SL, SR],
  foreR: [ER, HR, ER, SL, SR],
  legL: [PL, KL, PL, PL, PR],
  shinL: [KL, FL, KL, PL, PR],
  legR: [PR, KR, PR, PL, PR],
  shinR: [KR, FR, KR, PL, PR],
  accessory: [P, P, N, SL, SR],
};

// Soldier 6-part compatibility frames (whole arm / whole leg when specs has 6 parts)
const FRAMES_WHOLE_LIMB = {
  ...FRAMES,
  armL: [SL, HL, SL, SL, SR],
  armR: [SR, HR, SR, SL, SR],
  legL: [PL, FL, PL, PL, PR],
  legR: [PR, FR, PR, PL, PR],
};

// Real-world gravity g = 9.81 m/s^2, 120 Hz substep, 8 constraint iterations
const STEP = 1 / 120, ITERS = 8, GRAV = 9.81;
const DEG = Math.PI / 180;
const MAX_BODY_PITCH = 87.5 * DEG; // [-88°, +88°] strict body pitch clamp (never spins 360°)
const HIP_MIN_FLEX = -35 * DEG;    // -35° max forward hip flexion (never fold torso & thighs!)
const HIP_MAX_EXT = 15 * DEG;      // +15° max backward hip extension
const KNEE_MAX_FLEX = 115 * DEG;   // [0° straight .. +115° flexion], 0° hyperextension!
const SHOULDER_MIN = -45 * DEG;    // [-45° .. +65°] shoulder pitch
const SHOULDER_MAX = 65 * DEG;
const ELBOW_MAX_FLEX = 65 * DEG;   // [0° .. +65°] elbow bend during ragdoll

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const _u = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

// Orthonormal frame from point array A (stride 3) for a part spec; writes quaternion to q.
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

// Compute current torso basis: _r (+X right), _u (+Y spine up P->N), _f (+Z chest forward)
function torsoBasis(X) {
  _u.set(X[N * 3] - X[P * 3], X[N * 3 + 1] - X[P * 3 + 1], X[N * 3 + 2] - X[P * 3 + 2]);
  const uLen = _u.length() || 0.51;
  _u.divideScalar(uLen);
  _r.set(X[SR * 3] - X[SL * 3], X[SR * 3 + 1] - X[SL * 3 + 1], X[SR * 3 + 2] - X[SL * 3 + 2]);
  _r.addScaledVector(_u, -_r.dot(_u));
  if (_r.lengthSq() < 1e-5) _r.set(1, 0, 0);
  else _r.normalize();
  _f.crossVectors(_r, _u).normalize();
  return uLen;
}

// Helper to shift both X[i] and O[i] by the same correction so Verlet velocity is never injected!
function setPointClamped(X, O, i3, nx, ny, nz, damp = 0.85) {
  const vx = (X[i3] - O[i3]) * damp;
  const vy = (X[i3 + 1] - O[i3 + 1]) * damp;
  const vz = (X[i3 + 2] - O[i3 + 2]) * damp;
  X[i3] = nx; X[i3 + 1] = ny; X[i3 + 2] = nz;
  O[i3] = nx - vx; O[i3 + 1] = ny - vy; O[i3 + 2] = nz - vz;
}

/**
 * Enforce strict anatomical joint limits on the 15-point skeleton:
 * 1. Body Pitch clamped to [-88°, +88°] (never flips past horizontal or spins end-over-end)
 * 2. Hip Angle clamped to [-35° flexion .. +15° extension] (total angle from spine <= 35°)
 * 3. Knee Hinge clamped strictly to [0° straight .. +115° flexion] (never bends backward!)
 * 4. Shoulder & Elbow clamped to [-45° .. +65°] with natural outward sprawl (±25°) on the ground
 */
function enforceAnatomicalJointLimits(rag) {
  const X = rag.X, O = rag.O, hs = rag.hs, ws = rag.ws;
  const spineLen = 0.51 * hs;

  // 1. Torso pitch clamp [-88°, +88°]: spine vector P -> N must keep uy >= cos(87.5°)
  let ux = X[N * 3] - X[P * 3];
  let uy = X[N * 3 + 1] - X[P * 3 + 1];
  let uz = X[N * 3 + 2] - X[P * 3 + 2];
  const minUy = Math.cos(MAX_BODY_PITCH) * spineLen;
  if (uy < minUy) {
    uy = minUy;
    const hLen = Math.hypot(ux, uz) || 1e-4;
    const maxH = Math.sin(MAX_BODY_PITCH) * spineLen;
    if (hLen > maxH) {
      ux = (ux / hLen) * maxH;
      uz = (uz / hLen) * maxH;
    }
    const cx = (X[P * 3] + X[N * 3]) * 0.5;
    const cy = (X[P * 3 + 1] + X[N * 3 + 1]) * 0.5;
    const cz = (X[P * 3 + 2] + X[N * 3 + 2]) * 0.5;
    setPointClamped(X, O, P * 3, cx - ux * 0.5, cy - uy * 0.5, cz - uz * 0.5);
    setPointClamped(X, O, N * 3, cx + ux * 0.5, cy + uy * 0.5, cz + uz * 0.5);
  }

  // Compute orthonormal torso frame (_r = right, _u = spine up, _f = chest forward)
  torsoBasis(X);

  // Rigidly anchor shoulders (SL, SR) and hips (PL, PR) to the torso frame so pelvis/shoulders never warp
  const shHalfX = 0.20 * ws, hipHalfX = 0.095 * ws, hipOffY = -0.04 * hs;
  for (let side = -1; side <= 1; side += 2) {
    const sh = (side < 0 ? SL : SR) * 3;
    const sx = X[N * 3] + _r.x * (side * shHalfX) - _u.x * (0.04 * hs);
    const sy = X[N * 3 + 1] + _r.y * (side * shHalfX) - _u.y * (0.04 * hs);
    const sz = X[N * 3 + 2] + _r.z * (side * shHalfX) - _u.z * (0.04 * hs);
    setPointClamped(X, O, sh, sx, sy, sz, 0.9);

    const hp = (side < 0 ? PL : PR) * 3;
    const hx = X[P * 3] + _r.x * (side * hipHalfX) + _u.x * hipOffY;
    const hy = X[P * 3 + 1] + _r.y * (side * hipHalfX) + _u.y * hipOffY;
    const hz = X[P * 3 + 2] + _r.z * (side * hipHalfX) + _u.z * hipOffY;
    setPointClamped(X, O, hp, hx, hy, hz, 0.9);
  }

  // Keep head aligned with spine (prevent neck folding > 22°)
  {
    const headLen = 0.175 * hs;
    const hx = X[H * 3] - X[N * 3], hy = X[H * 3 + 1] - X[N * 3 + 1], hz = X[H * 3 + 2] - X[N * 3 + 2];
    let du = hx * _u.x + hy * _u.y + hz * _u.z;
    let df = hx * _f.x + hy * _f.y + hz * _f.z;
    let dr = hx * _r.x + hy * _r.y + hz * _r.z;
    const minDu = headLen * 0.92;
    if (du < minDu) {
      du = minDu;
      const maxLat = headLen * 0.35;
      df = Math.max(-maxLat, Math.min(maxLat, df));
      dr = Math.max(-maxLat * 0.6, Math.min(maxLat * 0.6, dr));
      const L = Math.hypot(du, df, dr) || 1;
      const s = headLen / L;
      setPointClamped(
        X, O, H * 3,
        X[N * 3] + (_u.x * du + _f.x * df + _r.x * dr) * s,
        X[N * 3 + 1] + (_u.y * du + _f.y * df + _r.y * dr) * s,
        X[N * 3 + 2] + (_u.z * du + _f.z * df + _r.z * dr) * s
      );
    }
  }

  // 2. Hip & Knee Joint Limits for Left (-1) and Right (+1) Legs
  const thighLen = 0.42 * hs, shinLen = 0.44 * hs;
  const sinHipFlex = Math.sin(-HIP_MIN_FLEX); // sin(35°) = 0.5736 (forward +_f)
  const sinHipExt = Math.sin(HIP_MAX_EXT);    // sin(15°) = 0.2588 (backward -_f)
  const cosHipMaxCone = Math.cos(34.5 * DEG); // 0.8241: total hip angle from -_u strictly <= 34.5°!
  const cosKneeMax = Math.cos(KNEE_MAX_FLEX); // cos(115°) = -0.4226

  for (let side = -1; side <= 1; side += 2) {
    const hip = side < 0 ? PL : PR;
    const knee = side < 0 ? KL : KR;
    const foot = side < 0 ? FL : FR;
    const h3 = hip * 3, k3 = knee * 3, f3 = foot * 3;

    // --- Hip joint clamp: [-35° flexion .. +15° extension], total cone <= 34.5° ---
    const tx = X[k3] - X[h3], ty = X[k3 + 1] - X[h3 + 1], tz = X[k3 + 2] - X[h3 + 2];
    let down = -(tx * _u.x + ty * _u.y + tz * _u.z) / thighLen;
    let fwd = (tx * _f.x + ty * _f.y + tz * _f.z) / thighLen;
    let out = side * (tx * _r.x + ty * _r.y + tz * _r.z) / thighLen;

    let clampedHip = false;
    if (fwd > sinHipFlex) { fwd = sinHipFlex; clampedHip = true; }
    if (fwd < -sinHipExt) { fwd = -sinHipExt; clampedHip = true; }
    if (out < 0.02) { out = 0.02; clampedHip = true; }
    if (out > 0.24) { out = 0.24; clampedHip = true; }
    if (down < cosHipMaxCone) { down = cosHipMaxCone; clampedHip = true; }

    // Ensure radial component sqrt(fwd^2 + out^2) / hypot(down, fwd, out) <= sin(34.5°)
    const maxLatSq = 1 - cosHipMaxCone * cosHipMaxCone;
    const latSq = fwd * fwd + out * out;
    if (latSq > maxLatSq) {
      const sc = Math.sqrt(maxLatSq / latSq);
      fwd *= sc;
      out *= sc;
      down = cosHipMaxCone;
      clampedHip = true;
    } else if (clampedHip) {
      down = Math.sqrt(Math.max(cosHipMaxCone * cosHipMaxCone, 1 - fwd * fwd - out * out));
    }

    if (clampedHip) {
      const norm = Math.hypot(down, fwd, out) || 1;
      down /= norm; fwd /= norm; out /= norm;
      const dx = (-_u.x * down + _f.x * fwd + _r.x * (side * out)) * thighLen;
      const dy = (-_u.y * down + _f.y * fwd + _r.y * (side * out)) * thighLen;
      const dz = (-_u.z * down + _f.z * fwd + _r.z * (side * out)) * thighLen;
      setPointClamped(X, O, k3, X[h3] + dx, X[h3 + 1] + dy, X[h3 + 2] + dz);
    }

    // --- Knee hinge clamp: [0° straight .. +115° flexion] (NEVER hyperextend forward!) ---
    const ux1 = (X[k3] - X[h3]) / thighLen;
    const uy1 = (X[k3 + 1] - X[h3 + 1]) / thighLen;
    const uz1 = (X[k3 + 2] - X[h3 + 2]) / thighLen;
    const sx = X[f3] - X[k3], sy = X[f3 + 1] - X[k3 + 1], sz = X[f3 + 2] - X[k3 + 2];

    let bx = -_f.x, by = -_f.y, bz = -_f.z;
    const bDotU = bx * ux1 + by * uy1 + bz * uz1;
    bx -= ux1 * bDotU; by -= uy1 * bDotU; bz -= uz1 * bDotU;
    const bLen = Math.hypot(bx, by, bz) || 1;
    bx /= bLen; by /= bLen; bz /= bLen;

    let along = (sx * ux1 + sy * uy1 + sz * uz1) / shinLen;
    let back = (sx * bx + sy * by + sz * bz) / shinLen;
    let lat = (sx * _r.x + sy * _r.y + sz * _r.z) / shinLen;

    let clampedKnee = false;
    if (back < 0) { back = 0; clampedKnee = true; }
    if (along < cosKneeMax) { along = cosKneeMax; clampedKnee = true; }
    if (Math.abs(lat) > 0.10) { lat = Math.sign(lat) * 0.10; clampedKnee = true; }

    if (clampedKnee) {
      if (along > 0.999 && back === 0) along = 1.0;
      const n2 = Math.hypot(along, back, lat) || 1;
      along /= n2; back /= n2; lat /= n2;
      setPointClamped(
        X, O, f3,
        X[k3] + (ux1 * along + bx * back + _r.x * lat) * shinLen,
        X[k3 + 1] + (uy1 * along + by * back + _r.y * lat) * shinLen,
        X[k3 + 2] + (uz1 * along + bz * back + _r.z * lat) * shinLen
      );
    }
  }

  // 3. Shoulder & Elbow Joint Limits: [-45° .. +65°] with natural outward sprawl (±25°) on the ground
  const upperLen = 0.29 * hs, foreLen = 0.29 * hs;
  const sinShMin = Math.sin(SHOULDER_MIN);
  const sinShMax = Math.sin(SHOULDER_MAX);
  const sinElbMax = Math.sin(ELBOW_MAX_FLEX);

  for (let side = -1; side <= 1; side += 2) {
    const sh = side < 0 ? SL : SR;
    const elb = side < 0 ? EL : ER;
    const hnd = side < 0 ? HL : HR;
    const s3 = sh * 3, e3 = elb * 3, h3 = hnd * 3;

    const ax = X[e3] - X[s3], ay = X[e3 + 1] - X[s3 + 1], az = X[e3 + 2] - X[s3 + 2];
    let down = -(ax * _u.x + ay * _u.y + az * _u.z) / upperLen;
    let fwd = (ax * _f.x + ay * _f.y + az * _f.z) / upperLen;
    let out = side * (ax * _r.x + ay * _r.y + az * _r.z) / upperLen;

    let clampedSh = false;
    if (fwd < sinShMin) { fwd = sinShMin; clampedSh = true; }
    if (fwd > sinShMax) { fwd = sinShMax; clampedSh = true; }
    if (out < 0.22) { out = 0.22; clampedSh = true; }
    if (out > 0.58) { out = 0.58; clampedSh = true; }
    if (down < 0.35) { down = 0.35; clampedSh = true; }
    if (clampedSh) {
      const norm = Math.hypot(down, fwd, out) || 1;
      down /= norm; fwd /= norm; out /= norm;
      setPointClamped(
        X, O, e3,
        X[s3] + (-_u.x * down + _f.x * fwd + _r.x * (side * out)) * upperLen,
        X[s3 + 1] + (-_u.y * down + _f.y * fwd + _r.y * (side * out)) * upperLen,
        X[s3 + 2] + (-_u.z * down + _f.z * fwd + _r.z * (side * out)) * upperLen
      );
    }

    // Elbow hinge: bends forward/inward [0° .. +65°], never backward
    const ux1 = (X[e3] - X[s3]) / upperLen;
    const uy1 = (X[e3 + 1] - X[s3 + 1]) / upperLen;
    const uz1 = (X[e3 + 2] - X[s3 + 2]) / upperLen;
    const fx = X[h3] - X[e3], fy = X[h3 + 1] - X[e3 + 1], fz = X[h3 + 2] - X[e3 + 2];

    let along = (fx * ux1 + fy * uy1 + fz * uz1) / foreLen;
    let bendF = (fx * _f.x + fy * _f.y + fz * _f.z) / foreLen;
    let bendOut = side * (fx * _r.x + fy * _r.y + fz * _r.z) / foreLen;

    let clampedElb = false;
    if (along < 0.43) { along = 0.43; clampedElb = true; }
    if (bendF < -0.05) { bendF = -0.05; clampedElb = true; }
    if (bendF > sinElbMax) { bendF = sinElbMax; clampedElb = true; }
    if (bendOut < -0.22) { bendOut = -0.22; clampedElb = true; }
    if (bendOut > 0.42) { bendOut = 0.42; clampedElb = true; }
    if (clampedElb) {
      const fDirX = ux1 * along + _f.x * bendF + _r.x * (side * bendOut);
      const fDirY = uy1 * along + _f.y * bendF + _r.y * (side * bendOut);
      const fDirZ = uz1 * along + _f.z * bendF + _r.z * (side * bendOut);
      const n2 = Math.hypot(fDirX, fDirY, fDirZ) || 1;
      setPointClamped(
        X, O, h3,
        X[e3] + (fDirX / n2) * foreLen,
        X[e3 + 1] + (fDirY / n2) * foreLen,
        X[e3 + 2] + (fDirZ / n2) * foreLen
      );
    }
  }
}

/**
 * Start a physically constrained ragdoll for a pedestrian.
 * - mode = 'knockdown' (2nd melee punch / knockout): pedestrian loses footing and crumples downward
 *   under gravity (g = 9.81 m/s^2) right where they stand (vy <= 0, horizontal slide < 0.9 m),
 *   dropping to their knees first (0.18s) and then laying down flat onto the pavement (torso pitch -> ±86°).
 * - mode = 'impact' (vehicle collision / explosion): velocity capped to realistic physical bounds,
 *   high pavement friction (mu = 0.80), damped bounce restitution (e = 0.12), strict joint clamps.
 */
export function startRagdoll(ped, L, groundY, vx, vy, vz, dx, dz, spin, specs = RAGDOLL_PART_SPECS, aim = false, mode = 'impact') {
  const ws = (L && L.wScale) || 1, hs = (L && L.hScale) || 1;
  const cy = Math.cos(ped.ryaw || 0), sy = Math.sin(ped.ryaw || 0);
  const X = new Float32Array(NP * 3), O = new Float32Array(NP * 3), R = new Float32Array(NP * 3);

  const isKnockdown = mode === 'knockdown';
  if (isKnockdown) {
    // Knockout crumple: ZERO upward launch (vy <= 0), small horizontal stumble (< 1.1 m/s -> slide < 0.9 m)
    const hSpd = Math.hypot(vx, vz);
    if (hSpd > 1.1) { vx = (vx / hSpd) * 1.1; vz = (vz / hSpd) * 1.1; }
    vy = Math.min(0, vy);
    spin = Math.min(Math.abs(spin || 0.8), 1.0);
  } else {
    // Vehicle / explosion impact: realistic physical cap so humans never fly across city blocks
    const hSpd = Math.hypot(vx, vz);
    const maxH = 5.4;
    if (hSpd > maxH) { vx = (vx / hSpd) * maxH; vz = (vz / hSpd) * maxH; }
    vy = Math.max(-2.0, Math.min(1.8, vy || 0));
    spin = Math.max(-1.4, Math.min(1.4, spin || 1.0));
  }

  const sw = Math.sin(ped.phase || 0) * (ped.amp || 0) * 0.35;
  for (let i = 0; i < NP; i++) {
    let [lx, ly, lz] = REST[i];
    if (i === FL || i === FR) lz += (i === FL ? sw : -sw) * 0.6;
    if (i === KL || i === KR) lz += (i === KL ? sw : -sw) * 0.3;
    if (i === HL || i === HR) lz += (i === HL ? -sw : sw) * 0.35;
    if (aim && (i === HL || i === HR)) { ly = 1.3; lz = 0.50; lx *= 0.85; }
    if (aim && (i === EL || i === ER)) { ly = 1.24; lz = 0.24; lx *= 0.95; }
    if (i === EL || i === ER || i === HL || i === HR) {
      lx += (lx < 0 ? -0.03 : 0.03);
    }
    lx *= ws; ly *= hs; lz *= ws;
    R[i * 3] = REST[i][0] * ws; R[i * 3 + 1] = REST[i][1] * hs; R[i * 3 + 2] = REST[i][2] * ws;
    X[i * 3] = ped.x + lx * cy + lz * sy;
    X[i * 3 + 1] = groundY + ly;
    X[i * 3 + 2] = ped.z - lx * sy + lz * cy;
  }

  const ax = -dz * spin, az = dx * spin, comY = groundY + 0.95 * hs;
  for (let i = 0; i < NP; i++) {
    const ry = X[i * 3 + 1] - comY;
    const wx = -az * ry, wz = ax * ry;
    let pvx = vx + wx, pvz = vz + wz, pvy = vy;
    if (isKnockdown) {
      // Phase 1 (0..0.18s): knees buckle forward & downward under gravity while feet stay planted
      if (i === KL || i === KR) {
        pvx = vx * 0.4 + sy * 0.55;
        pvz = vz * 0.4 + cy * 0.55;
        pvy = -1.6;
      } else if (i === FL || i === FR) {
        pvx = vx * 0.1;
        pvz = vz * 0.1;
        pvy = 0;
      } else if (i === P || i === PL || i === PR) {
        pvx = vx * 0.6;
        pvz = vz * 0.6;
        pvy = -1.2;
      } else {
        pvx = vx * 0.85 + dx * 0.4;
        pvz = vz * 0.85 + dz * 0.4;
        pvy = -0.9;
      }
    }
    const jit = isKnockdown ? 0.03 : 0.08;
    O[i * 3] = X[i * 3] - (pvx + (Math.random() - 0.5) * jit) * STEP;
    O[i * 3 + 1] = X[i * 3 + 1] - (pvy + (Math.random() - 0.5) * jit) * STEP;
    O[i * 3 + 2] = X[i * 3 + 2] - (pvz + (Math.random() - 0.5) * jit) * STEP;
  }

  const len = new Float32Array(LINKS.length);
  for (let k = 0; k < LINKS.length; k++) {
    const [a, b, kind, d] = LINKS[k];
    len[k] = kind ? d * hs : Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
  }

  const hasArticulated = specs.some((s) => s.name === 'foreL' || s.name === 'shinL');
  const frameMap = hasArticulated ? FRAMES : FRAMES_WHOLE_LIMB;

  const parts = [];
  for (const spec of specs) {
    const f = frameMap[spec.name] || FRAMES[spec.name];
    if (!f) continue;
    const qr = frame(R, f, new THREE.Quaternion());
    const a = f[0];
    const off = new THREE.Vector3(spec.ox * ws - R[a * 3], spec.oy * hs - R[a * 3 + 1], spec.oz * ws - R[a * 3 + 2]).applyQuaternion(qr.clone().invert());
    parts.push({ name: spec.name, x: 0, y: 0, z: 0, q: new THREE.Quaternion(), qrInv: qr.invert(), off, f, scale: 1, visible: true, instanceIndex: -1 });
  }
  ped.rag = {
    X, O, len, acc: 0, calm: 0, groundY, t: 0,
    ws, hs, mode, dx, dz,
    originX: ped.x, originZ: ped.z,
  };
  enforceAnatomicalJointLimits(ped.rag);
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
  const isKnockdown = rag.mode === 'knockdown';
  // High pavement friction (mu = 0.82 for knockdown, mu = 0.80 for vehicle impact) and low restitution (e = 0.12)
  const frictionKeep = isKnockdown ? 0.18 : 0.20;
  const bounceRestitution = 0.12;
  const airDrag = 0.985;

  let maxV = 0;
  while (rag.acc >= STEP) {
    rag.acc -= STEP;
    const kneeDropPhase = isKnockdown && rag.t < 0.20;
    const torsoLayPhase = isKnockdown && rag.t >= 0.14 && rag.t < 0.70;

    for (let i = 0; i < NP; i++) {
      const i3 = i * 3;
      for (let c = 0; c < 3; c++) {
        const x = X[i3 + c];
        let v = (x - O[i3 + c]) * airDrag;
        if (c === 1) {
          v -= GRAV * STEP * STEP;
          if (kneeDropPhase && (i === KL || i === KR || i === P || i === PL || i === PR)) {
            v -= 5.0 * STEP * STEP;
          }
          // In knockdown, never allow upward vertical velocity!
          if (isKnockdown && v > 0) v = 0;
        } else if (torsoLayPhase && (i === N || i === H || i === SL || i === SR)) {
          const dir = c === 0 ? rag.dx : rag.dz;
          v += dir * 2.2 * STEP * STEP;
        }
        O[i3 + c] = x;
        X[i3 + c] = x + v;
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
        const dx = ex * s, dy = ey * s, dz = ez * s;
        X[a] += dx; X[a + 1] += dy; X[a + 2] += dz;
        O[a] += dx * 0.5; O[a + 1] += dy * 0.5; O[a + 2] += dz * 0.5;
        X[b] -= dx; X[b + 1] -= dy; X[b + 2] -= dz;
        O[b] -= dx * 0.5; O[b + 1] -= dy * 0.5; O[b + 2] -= dz * 0.5;
      }

      // Ground contact with high pavement friction (mu = 0.80..0.82) & damped restitution (e = 0.12)
      for (let i = 0; i < NP; i++) {
        const i3 = i * 3, floor = g + RADIUS[i];
        if (X[i3 + 1] < floor) {
          X[i3 + 1] = floor;
          const vx = X[i3] - O[i3], vz = X[i3 + 2] - O[i3 + 2];
          O[i3] = X[i3] - vx * frictionKeep;
          O[i3 + 2] = X[i3 + 2] - vz * frictionKeep;
          if (O[i3 + 1] < floor) {
            O[i3 + 1] = floor + (floor - O[i3 + 1]) * bounceRestitution;
          }
        }
      }

      // Final step of each iteration: enforce strict physiological joint limits!
      enforceAnatomicalJointLimits(rag);
    }

    // Ensure no point ever penetrates ground after joint limit projection
    for (let i = 0; i < NP; i++) {
      const i3 = i * 3, floor = g + RADIUS[i];
      if (X[i3 + 1] < floor) {
        const dy = floor - X[i3 + 1];
        X[i3 + 1] = floor;
        O[i3 + 1] += dy;
        const vx = X[i3] - O[i3], vz = X[i3 + 2] - O[i3 + 2];
        O[i3] = X[i3] - vx * frictionKeep;
        O[i3 + 2] = X[i3 + 2] - vz * frictionKeep;
      }
    }

    if (isKnockdown) {
      const px = X[P * 3] - rag.originX, pz = X[P * 3 + 2] - rag.originZ;
      const slideD = Math.hypot(px, pz);
      if (slideD > 0.78) {
        const corrX = px * (1 - 0.78 / slideD);
        const corrZ = pz * (1 - 0.78 / slideD);
        for (let i = 0; i < NP; i++) {
          X[i * 3] -= corrX; O[i * 3] -= corrX;
          X[i * 3 + 2] -= corrZ; O[i * 3 + 2] -= corrZ;
        }
      }
    }
  }

  for (let i = 0; i < NP * 3; i += 3) {
    const v = Math.hypot(X[i] - O[i], X[i + 1] - O[i + 1], X[i + 2] - O[i + 2]) / STEP;
    if (v > maxV) maxV = v;
  }
  const pelX = X[P * 3], pelY = X[P * 3 + 1], pelZ = X[P * 3 + 2];
  const wApp = typeof window !== 'undefined' ? window.app : null;
  if (wApp && wApp.water && wApp.water.isPointInWater(pelX, pelZ)) {
    const waterY = wApp.water.getWaterSurfaceY(pelX, pelZ);
    if (pelY <= waterY + 0.55) {
      ped.dead = true;
      ped.drowned = true;
      rag.inWater = true;
      rag.groundY = Math.min(rag.groundY, waterY - 0.38);
    }
  }
  rag.calm = maxV < 0.22 ? rag.calm + dt : 0;
  posePartsFromPoints(rag, ped.parts);
  return rag.calm > 0.30 || rag.t > 3.2;
}

/** Pelvis position of a ragdoll (for ped.x/z bookkeeping). */
export function ragdollCenter(ped, out) {
  const X = ped.rag.X;
  out.x = X[P * 3]; out.z = X[P * 3 + 2];
  return out;
}
