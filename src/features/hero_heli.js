// [hero-vehicles] Detailed player helicopter: a light twin-turbine utility helicopter in the H145 / AW109
// class (unbranded) in a dark tactical scheme. The fuselage is one loft from the nose bubble back along the
// tail boom; each quad is given a material by where it sits (windscreen, door and cabin windows, frames,
// door gaps, pinstripe), so the glazing follows the curved skin exactly. Engine cowling is a second loft.
// Rotor blades are airfoil lofts with twist and a swept parabolic tip; the hub, swashplate and pitch links
// sit on the mast. Tail: horizontal stabiliser with endplates and a ducted fenestron fan.
// Contract (same as the box model in entities.js): local +Z forward, +Y up (+X is the pilot's left), skids at y ~ 0.08;
// userData { fuselage, mainRotor (spins about Y), tailRotor (spins about X), nitroVfx, vfxParts }.
// Cannon muzzle (0, 0.55, 2.95) and rocket pods (+-1.68, 0.85, 0.55) match heli_flight.js / kaiju weapons.
import * as THREE from '../../vendor/three.module.js';
import { curve } from './hero_vehicles.js';

const ROTOR_Y = 2.88, ROTOR_Z = -0.1, ROTOR_R = 5.4, BLADES = 5;
const FAN_Y = 2.06, FAN_Z = -6.62, FAN_R = 0.47;
const EXHAUSTS = [-1, 1].map((s) => ({ s, x: s * 0.46, y: 2.42, z: -2.28 }));

// ---------------------------------------------------------------- geometry helpers
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return geo.applyMatrix4(_m4);
}

// Collects static parts per material key and merges each set into one geometry (position + normal).
class Buckets {
  constructor() { this.map = new Map(); }
  add(key, geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(g);
    return g;
  }
  merged() {
    const out = {};
    for (const [key, list] of this.map) {
      let n = 0;
      for (const g of list) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      for (const g of list) {
        pos.set(g.attributes.position.array, o);
        nor.set(g.attributes.normal.array, o);
        o += g.attributes.position.count * 3;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      out[key] = geo;
    }
    return out;
  }
}

// Indexed geometry with one group per material key, in the order of `keys`.
function groupedGeometry(positions, indexByKey, keys) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const idx = [];
  const used = [];
  for (const k of keys) {
    const list = indexByKey.get(k);
    if (!list || !list.length) continue;
    geo.addGroup(idx.length, list.length, used.length);
    used.push(k);
    for (let i = 0; i < list.length; i++) idx.push(list[i]);
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, keys: used };
}

// Superellipse ring point at angle th (-PI/2 = keel, 0 = +X side, PI/2 = crown).
function ringX(S, th) { const c = Math.cos(th); return S.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / (Math.sin(th) > 0 ? S.pT : S.pB)); }
function ringY(S, th) {
  const s = Math.sin(th), up = s > 0;
  return S.mid + (up ? S.top - S.mid : S.mid - S.bot) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (up ? S.pT : S.pB));
}
// Right-half angle whose ring point sits at height y (y rises monotonically from keel to crown).
function thetaForY(S, y) {
  let lo = -Math.PI / 2, hi = Math.PI / 2;
  if (y <= S.bot) return lo;
  if (y >= S.top) return hi;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (ringY(S, m) < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// Cross-section loft along +Z. `sec(z)` gives { hw, top, mid, bot, pT, pB }: a superellipse whose upper
// and lower halves have their own height and exponent. Each ring is resampled by arc length (optionally
// weighted by height, to spend vertices where the glazing is) so quads stay even; vertex 0 is the keel.
// `snap` lists boundary functions g(x, y, z) (signed distance-ish, null = not applicable): vertices within
// half a cell of a boundary are moved onto it along the surface, so window and frame edges come out smooth
// instead of stair-stepped. `classify(q)` then picks a material per quad from the quad centre.
function loft(zs, sec, N, classify, { weight = null, snap = null } = {}) {
  const rows = zs.length, M = 360;
  const pos = new Float32Array(rows * N * 3);
  const vz = new Float32Array(rows * N), vt = new Float32Array(rows * N), snapped = new Int16Array(rows * N).fill(-1);
  const tk = new Float32Array(M + 1), acc = new Float32Array(M + 1);
  const secs = [];
  for (let i = 0; i < rows; i++) {
    const z = zs[i], S = sec(z);
    secs.push(S);
    let px = 0, py = 0;
    for (let k = 0; k <= M; k++) {
      const th = -Math.PI / 2 + (k / M) * Math.PI * 2;
      tk[k] = th;
      const x = ringX(S, th), y = ringY(S, th);
      acc[k] = k ? acc[k - 1] + Math.hypot(x - px, y - py) * (weight ? weight((y + py) / 2, z) : 1) : 0;
      px = x; py = y;
    }
    const L = acc[M];
    let k = 0;
    for (let j = 0; j < N; j++) {
      const o = i * N + j;
      let th = tk[0];
      if (L > 1e-6) {
        const t = (j / N) * L;
        while (k < M - 1 && acc[k + 1] < t) k++;
        th = tk[k] + (tk[k + 1] - tk[k]) * (t - acc[k]) / Math.max(1e-9, acc[k + 1] - acc[k]);
      }
      vz[o] = z; vt[o] = th;
      pos[o * 3] = ringX(S, th); pos[o * 3 + 1] = ringY(S, th); pos[o * 3 + 2] = z;
    }
  }
  if (snap) {
    const h = 1e-3;
    for (let i = 1; i < rows - 1; i++) {
      const S = secs[i], Sh = sec(zs[i] + h), z = zs[i];
      if (S.hw < 1e-3) continue;
      const dz = Math.min(z - zs[i - 1], zs[i + 1] - z) * 0.5;
      for (let j = 0; j < N; j++) {
        const o = i * N + j, th = vt[o];
        const dth = 0.5 * Math.min(Math.abs(th - vt[i * N + (j + N - 1) % N]) % (Math.PI * 2), Math.abs(vt[i * N + (j + 1) % N] - th) % (Math.PI * 2));
        const x0 = pos[o * 3], y0 = pos[o * 3 + 1];
        let best = null, bestN = 1.15, bestG = -1; // a little past half a cell so a boundary midway between two vertices still gets one
        for (let gi = 0; gi < snap.length; gi++) {
          const g = snap[gi];
          const g0 = g(x0, y0, z);
          if (g0 === null || Math.abs(g0) > 0.08) continue;
          const gz = g(ringX(Sh, th), ringY(Sh, th), z + h), gt = g(ringX(S, th + h), ringY(S, th + h), z);
          if (gz === null || gt === null) continue;
          const az = (gz - g0) / h, at = (gt - g0) / h, d2 = az * az + at * at;
          if (d2 < 1e-9) continue;
          // try along the ring, along z, and down the gradient; keep the shortest legal move
          const moves = [[-g0 * az / d2, -g0 * at / d2]];
          if (Math.abs(at) > 1e-6) moves.push([0, -g0 / at]);
          if (Math.abs(az) > 1e-6) moves.push([-g0 / az, 0]);
          for (const [mz, mt] of moves) {
            const n = Math.max(Math.abs(mz) / dz, Math.abs(mt) / dth);
            if (n < bestN) { bestN = n; best = [mz, mt]; bestG = gi; }
          }
        }
        if (!best) continue;
        const nz = z + best[0], nt = th + best[1], S2 = Math.abs(best[0]) > 1e-6 ? sec(nz) : S;
        vz[o] = nz; vt[o] = nt; snapped[o] = bestG;
        pos[o * 3] = ringX(S2, nt); pos[o * 3 + 1] = ringY(S2, nt); pos[o * 3 + 2] = nz;
      }
    }
  }
  // Quads are classified by their centre. A quad whose diagonal runs along a snapped edge (both ends on
  // the same boundary) is split along that diagonal and each triangle classified on its own, so the edge
  // follows the boundary instead of stepping a whole quad where it changes ring index.
  const byKey = new Map();
  const q = { z0: 0, z1: 0, y0: 0, y1: 0, x: 0, ax: 0, y: 0, z: 0, i: 0, j: 0, S: null };
  const fill = (i, j, ...vs) => {
    let x = 0, y = 0, z = 0, y0 = Infinity, y1 = -Infinity;
    for (const v of vs) {
      const vy = pos[v * 3 + 1];
      x += pos[v * 3]; y += vy; z += pos[v * 3 + 2];
      if (vy < y0) y0 = vy;
      if (vy > y1) y1 = vy;
    }
    const n = vs.length;
    q.z0 = zs[i]; q.z1 = zs[i + 1]; q.y0 = y0; q.y1 = y1;
    q.x = x / n; q.ax = Math.abs(q.x); q.y = y / n; q.z = z / n; q.i = i; q.j = j; q.S = secs[i];
    return classify(q);
  };
  const emit = (key, ...v) => {
    if (key === null) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(...v);
  };
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b = i * N + (j + 1) % N, c = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N;
      if (snapped[b] >= 0 && snapped[b] === snapped[c]) {
        emit(fill(i, j, a, b, c), a, b, c);
        emit(fill(i, j, b, d, c), b, d, c);
      } else if (snapped[a] >= 0 && snapped[a] === snapped[d]) {
        emit(fill(i, j, a, b, d), a, b, d);
        emit(fill(i, j, a, d, c), a, d, c);
      } else {
        const key = fill(i, j, a, b, c, d);
        emit(key, a, b, c, b, d, c);
      }
    }
  }
  return { pos, byKey };
}

// Superellipse annulus (or disc when d0 <= -min(az, ay)) laid onto a loft surface, `off` metres proud of
// it. Outline in side view (z, y): |dz / (az + d)|^p + |dy / (ay + d)|^p = 1 for d in [d0, d1].
function surfacePatch(sec, w, d0, d1, side, off, { segs = 64, rings = 3 } = {}) {
  const { cz, cy, az, ay, p = 5 } = w;
  const pos = [], idx = [];
  const n = new THREE.Vector3(), tz = new THREE.Vector3(), tt = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    const d = d0 + (d1 - d0) * (r / rings);
    const ez = Math.max(0, az + d), ey = Math.max(0, ay + d);
    for (let k = 0; k < segs; k++) {
      const ph = (k / segs) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph);
      const z = cz + ez * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), y = cy + ey * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      const S = sec(z), th = thetaForY(S, y), S1 = sec(z + 1e-3);
      const x = ringX(S, th);
      tt.set(ringX(S, th + 1e-3) - x, ringY(S, th + 1e-3) - y, 0);
      tz.set(ringX(S1, th) - x, ringY(S1, th) - y, 1e-3);
      n.crossVectors(tt, tz).normalize();
      pos.push(side * (x + n.x * off), y + n.y * off, z + n.z * off);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segs; k++) {
      const a = r * segs + k, b = r * segs + (k + 1) % segs, c = a + segs, e = b + segs;
      idx.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // face outward: compare with the direction from the section centre (x sign)
  const nz = geo.attributes.normal;
  let sum = 0;
  for (let i = 0; i < nz.count; i++) sum += nz.getX(i) * Math.sign(pos[i * 3] || side);
  if (sum < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

// Stations from `lo` to `hi` at `step`, plus tight pairs hugging every z in `cuts` (crisp panel gaps).
function stations(lo, hi, step, cuts = [], extra = []) {
  const forced = [];
  for (const c of cuts) forced.push(c - 0.011, c + 0.011);
  const out = [...forced, ...extra];
  for (let z = lo; z < hi - 1e-6; z += step) {
    if (!forced.some((f) => Math.abs(f - z) < step * 0.45)) out.push(z);
  }
  out.push(hi);
  out.sort((a, b) => a - b);
  return out.filter((z, i) => z >= lo && z <= hi && (i === 0 || z - out[i - 1] > 1e-4));
}

// Symmetric airfoil (NACA 00xx, closed trailing edge), K points around, LE first on the upper side.
function airfoilRing(K, t) {
  const pts = [];
  const half = K / 2;
  for (let k = 0; k < K; k++) {
    const up = k < half;
    const kk = up ? k : K - k;
    const u = 0.5 - 0.5 * Math.cos((kk / half) * Math.PI); // 0 at LE, 1 at TE
    const yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
    pts.push([u, up ? yt : -yt]);
  }
  return pts;
}

// Airfoil loft along +Z (span), leading edge toward +X, thickness in Y. Each station:
// { s: span z, c: chord, le: leading-edge x, y: vertical offset, tw: twist (LE up) }. Ends are capped.
function airfoilLoft(st, { K = 16, t = 0.12, classify = null } = {}) {
  const ring = airfoilRing(K, t);
  const rows = st.length;
  const pos = [];
  for (const S of st) {
    const cs = Math.cos(S.tw || 0), sn = Math.sin(S.tw || 0);
    for (const [u, yy] of ring) {
      const X = S.le - u * S.c, Y = yy * S.c;
      pos.push(X * cs - Y * sn, X * sn + Y * cs + (S.y || 0), S.s);
    }
  }
  const capA = pos.length / 3, capB = capA + 1;
  for (const r of [0, rows - 1]) {
    let cx = 0, cy = 0;
    for (let k = 0; k < K; k++) { cx += pos[(r * K + k) * 3]; cy += pos[(r * K + k) * 3 + 1]; }
    pos.push(cx / K, cy / K, st[r].s);
  }
  const byKey = new Map();
  const push = (key, ...v) => { if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(...v); };
  // Ring runs LE -> upper -> TE -> lower; with span along +Z this winding faces outward.
  for (let i = 0; i < rows - 1; i++) {
    for (let k = 0; k < K; k++) {
      const a = i * K + k, b = i * K + (k + 1) % K, c = (i + 1) * K + k, d = (i + 1) * K + (k + 1) % K;
      const key = classify ? classify(i, k, ring[k][0]) : 'main';
      push(key, a, b, c, b, d, c);
    }
  }
  const capKey = classify ? classify(-1, 0, 0.5) : 'main';
  for (let k = 0; k < K; k++) {
    push(capKey, capA, (k + 1) % K, k);
    push(capKey, capB, (rows - 1) * K + k, (rows - 1) * K + (k + 1) % K);
  }
  const keys = [...byKey.keys()];
  return groupedGeometry(new Float32Array(pos), byKey, keys);
}

function tube(points, radius, seg = 40, radial = 10, closed = false) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(c, seg, radius, radial, closed);
}

// Rod between two points.
function rod(a, b, r0, r1 = r0, seg = 8) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

// Group geometry split into one geometry per material key (for bucket merging).
function splitGroups(geo, keys) {
  const out = [];
  const nonIdx = geo.toNonIndexed();
  for (const gr of geo.groups) {
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const a = nonIdx.attributes[name];
      g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * 3, (gr.start + gr.count) * 3), 3));
    }
    out.push([keys[gr.materialIndex], g]);
  }
  return out;
}

// ---------------------------------------------------------------- fuselage shape
const C = {
  top: curve([[-6.4, 1.84], [-4.6, 1.87], [-3.2, 1.97], [-2.6, 2.1], [-1.9, 2.18], [1.3, 2.2], [1.85, 2.13], [2.35, 1.99], [2.8, 1.78], [3.32, 1.5]]),
  mid: curve([[-6.4, 1.67], [-3.3, 1.64], [-2.5, 1.5], [-1.8, 1.4], [1.6, 1.4], [2.5, 1.35], [3.32, 1.3]]),
  bot: curve([[-6.4, 1.5], [-4.6, 1.44], [-3.2, 1.33], [-2.55, 1.06], [-2.05, 0.8], [-1.65, 0.73], [1.9, 0.73], [2.5, 0.8], [2.95, 0.95], [3.32, 1.14]]),
  hw: curve([[-6.4, 0.16], [-4.6, 0.2], [-3.3, 0.26], [-2.7, 0.52], [-2.05, 0.84], [-1.6, 0.93], [1.5, 0.93], [2.2, 0.88], [2.75, 0.74], [3.32, 0.56]]),
  pT: curve([[-6.4, 2.0], [-3.2, 2.1], [-2.2, 2.7], [1.5, 2.7], [2.6, 2.3], [3.32, 2.1]]),
  pB: curve([[-6.4, 2.0], [-3.2, 2.2], [-2.2, 3.4], [1.6, 3.4], [2.6, 2.6], [3.32, 2.2]]),
};
const NOSE_Z0 = 2.72, NOSE_Z1 = 3.36;

function bodySec(z, shrink = 0) {
  let f = 1;
  if (z > NOSE_Z0) {
    const t = Math.min(1, (z - NOSE_Z0) / (NOSE_Z1 - NOSE_Z0));
    f = Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 1 / 2.1);
  }
  const mid = C.mid(z);
  return {
    hw: Math.max(0, C.hw(z) * f - shrink), mid,
    top: mid + Math.max(0, (C.top(z) - mid) * f - shrink),
    bot: mid - Math.max(0, (mid - C.bot(z)) * f - shrink),
    pT: C.pT(z), pB: C.pB(z),
  };
}

// Glazing / panel layout in side view (z, y).
const aPillar = (y) => 1.6 + (y - 1.4) * 0.27;            // windscreen rear edge, raked
const wsSill = (z) => 1.4 - 0.21 * (z - 1.6);             // windscreen lower edge, dropping to the nose
const NOSE_SEAM = 3.15;                                    // radome seam
const sblob = (z, y, cz, cy, az, ay, p = 5) => Math.pow(Math.abs(z - cz) / az, p) + Math.pow(Math.abs(y - cy) / ay, p);
const WINDOWS = [
  { cz: 1.08, cy: 1.74, az: 0.44, ay: 0.32, p: 5 },  // cockpit door
  { cz: -0.3, cy: 1.73, az: 0.52, ay: 0.3, p: 5 },   // sliding cabin door
  { cz: -1.38, cy: 1.71, az: 0.24, ay: 0.27, p: 5 }, // rear cabin
];
const STRIPE = [1.06, 1.095];  // accent pinstripe band
const CHIN = { cz: 2.55, cy: 1.0, az: 0.33, ay: 0.12, p: 4 };
const DOOR_GAPS_Z = [0.55, 0.43, -1.02, -1.86, NOSE_SEAM];
const cross = (q, v) => q.y0 < v && q.y1 > v;
const crossZ = (q, v) => q.z0 < v && q.z1 > v;
const inBlob = (w, z, y) => sblob(z, y, w.cz, w.cy, w.az, w.ay, w.p) < 1;
const blobDist = (w, z, y) => (Math.pow(sblob(z, y, w.cz, w.cy, w.az, w.ay, w.p), 1 / w.p) - 1) * Math.min(w.az, w.ay);
const nearBlob = (w, z, y) => Math.abs(z - w.cz) < w.az + 0.12 && Math.abs(y - w.cy) < w.ay + 0.12;

// Edges the fuselage vertices snap onto (see loft).
const BODY_SNAP = [
  ...WINDOWS.map((w) => (x, y, z) => (Math.abs(x) > 0.45 && nearBlob(w, z, y) ? blobDist(w, z, y) : null)),
  (x, y, z) => (Math.abs(x) > 0.08 && nearBlob(CHIN, z, y) ? blobDist(CHIN, z, y) : null),
  ...[0, 0.06].map((o) => (x, y, z) => (z > 1.3 && z < 2.3 && y > wsSill(z) - 0.1 ? z - (aPillar(y) - o) : null)),
  ...[0, 0.045].map((o) => (x, y, z) => (z > aPillar(y) - 0.15 && z < NOSE_SEAM + 0.05 ? y - (wsSill(z) - o) : null)),
  (x, y, z) => (z > 1.9 && y > wsSill(z) && Math.abs(x) < 0.15 ? Math.abs(x) - 0.04 : null),
  ...STRIPE.map((v) => (x, y, z) => (Math.abs(x) > 0.5 && z > -1.4 && z < 1.7 ? y - v : null)),
];

function bodyClass(q) {
  const { z, y, ax } = q;
  const top = q.S.top;
  // Windscreen bubble (wraps over the nose and into the roof), centre post and frame.
  if (z < NOSE_SEAM + 0.011 && z > aPillar(y) - 0.06 && y > wsSill(z) - 0.045) {
    const inner = z > aPillar(y) && y > wsSill(z) && z < NOSE_SEAM - 0.011;
    if (ax < 0.04 && z > 1.9 && inner) return 'paint';  // centre post
    if (!inner) return 'frame';
    return 'glass';
  }
  if (ax > 0.08 && inBlob(CHIN, z, y)) return 'glass';
  if (ax > 0.45 && y < top - 0.08) {
    for (const w of WINDOWS) if (inBlob(w, z, y)) return 'glass';
    // Door outlines: cockpit door (pillar to 0.55), sliding door (0.43 to -1.02) with its rails.
    const inDoorY = y > 0.84 && y < top - 0.09;
    if (inDoorY && (crossZ(q, 0.55) || crossZ(q, 0.43) || crossZ(q, -1.02))) return 'gap';
    if ((cross(q, 0.86) && z > -1.02 && z < aPillar(0.86) - 0.06) || (cross(q, top - 0.09) && z > -1.02 && z < 0.55)) return 'gap';
    if (crossZ(q, -1.86) && y > 0.8) return 'gap';
    // Thin accent pinstripe below the glazing.
    if (y > STRIPE[0] && y < STRIPE[1] && z > -1.3 && z < aPillar(1.08) - 0.08) return 'accent';
  }
  if (crossZ(q, NOSE_SEAM) && y < wsSill(z)) return 'gap';
  return 'paint';
}

// Engine cowling hump on the cabin roof.
const CW = {
  top: curve([[-2.95, 2.02], [-2.4, 2.38], [-1.5, 2.6], [0.35, 2.62], [0.8, 2.52], [1.1, 2.34]]),
  hw: curve([[-2.95, 0.22], [-2.4, 0.5], [-1.5, 0.66], [0.4, 0.66], [1.1, 0.5]]),
};
function cowlSec(z) {
  let f = 1;
  if (z > 0.72) { const t = Math.min(1, (z - 0.72) / 0.4); f = Math.pow(Math.max(0, 1 - t ** 2.4), 1 / 2.4); }
  const roof = C.top(z);
  const top = Math.max(roof + 0.02, CW.top(z));
  const mid = roof + 0.03;
  return { hw: CW.hw(z) * f, mid, top: mid + (top - mid) * f, bot: roof - 0.12, pT: 2.6, pB: 6 };
}
function cowlClass(q) {
  const { z, y } = q;
  if (crossZ(q, -0.62) || crossZ(q, -1.7)) return 'gap';
  return 'cowl';
}

// ---------------------------------------------------------------- one-time geometry kit
let KIT = null;

function buildKit() {
  const st = new Buckets();   // static (fuselage group)
  const rt = new Buckets();   // main rotor (spins)
  const ft = new Buckets();   // fenestron fan (spins)

  // Fuselage skin.
  const zs = stations(-6.4, NOSE_Z1, 0.028, DOOR_GAPS_Z.concat([-0.62]),
    Array.from({ length: 10 }, (_, k) => NOSE_Z1 - 0.32 * (k / 10) ** 2));
  // thin out the boom: it is a plain tube
  const zsAll = zs.filter((z, i) => z >= -3.4 || i % 3 === 0);
  const BN = 104;
  const body = loft(zsAll, (z) => bodySec(z), BN, bodyClass, { weight: (y) => (y > 1.0 ? 1 : 0.45), snap: BODY_SNAP });
  const BODY_KEYS = ['paint', 'glass', 'frame', 'gap', 'accent'];
  const bodyG = groupedGeometry(body.pos, body.byKey, BODY_KEYS);
  // nose tip: all vertices collapse to one point, face them forward
  {
    const n = bodyG.geo.attributes.normal, last = (zsAll.length - 1) * BN;
    for (let j = 0; j < BN; j++) n.setXYZ(last + j, 0, 0.2, 0.98);
  }

  // Interior shell (back faces) behind the glazing; windows left open so the far side reads through.
  const shellZ = stations(-2.3, 3.1, 0.12);
  const shell = loft(shellZ, (z) => bodySec(z, 0.035), 40, (q) => 'in');
  const shellG = groupedGeometry(shell.pos, shell.byKey, ['in']);

  // Cowling.
  const cz = stations(-2.95, 1.12, 0.05, [-0.62, -1.7], Array.from({ length: 6 }, (_, k) => 1.12 - 0.12 * (k / 6) ** 2));
  const cowl = loft(cz, cowlSec, 52, cowlClass);
  const cowlG = groupedGeometry(cowl.pos, cowl.byKey, ['cowl', 'paint', 'gap']);

  // Window seals over the snapped glass edges; engine intake and oil-cooler grilles on the cowling.
  for (const side of [-1, 1]) {
    for (const w of WINDOWS) st.add('frame', surfacePatch(bodySec, w, -0.012, 0.032, side, 0.004, { rings: 2 }));
    st.add('frame', surfacePatch(bodySec, CHIN, -0.012, 0.03, side, 0.004, { rings: 2 }));
    for (const w of [{ cz: 0.42, cy: 2.4, az: 0.26, ay: 0.075, p: 4 }, { cz: -1.15, cy: 2.42, az: 0.3, ay: 0.06, p: 4 }]) {
      st.add('grille', surfacePatch(cowlSec, w, -0.1, 0, side, 0.003, { rings: 2, segs: 48 }));
      st.add('frame', surfacePatch(cowlSec, w, -0.004, 0.02, side, 0.004, { rings: 1, segs: 48 }));
      for (let k = -3; k <= 3; k++) {  // louvres
        const z = w.cz + k * w.az * 0.26;
        const S = cowlSec(z), th = thetaForY(S, w.cy), x = ringX(S, th);
        st.add('dark', place(new THREE.BoxGeometry(0.012, w.ay * 1.7, 0.012), side * (x + 0.004), w.cy, z));
      }
    }
  }

  // Exhaust nozzles: flared lathe, angled back and outboard.
  for (const e of EXHAUSTS) {
    const prof = [[0.1, -0.05], [0.13, 0.0], [0.15, 0.2], [0.165, 0.34], [0.15, 0.35], [0.12, 0.2], [0.1, 0.0]].map((p) => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(prof, 18);
    // axis +Y -> back (-Z), outboard and slightly up
    const dir = new THREE.Vector3(e.s * 0.55, 0.12, -1).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(e.x, e.y, e.z);
    st.add('exhaust', g);
    const soot = new THREE.CircleGeometry(0.1, 16);
    soot.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    soot.translate(e.x + dir.x * 0.12, e.y + dir.y * 0.12, e.z + dir.z * 0.12);
    st.add('soot', soot);
    e.mouth = [e.x + dir.x * 0.35, e.y + dir.y * 0.35, e.z + dir.z * 0.35];
    e.dir = dir;
  }

  // Mast fairing, mast, stationary swashplate.
  st.add('cowl', place(new THREE.CylinderGeometry(0.2, 0.34, 0.16, 24), 0, 2.66, ROTOR_Z));
  st.add('metal', place(new THREE.CylinderGeometry(0.085, 0.095, 0.4, 16), 0, 2.78, ROTOR_Z));
  st.add('dark', place(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 24), 0, 2.735, ROTOR_Z));
  for (let k = 0; k < 3; k++) {   // servo actuators
    const a = (k / 3) * Math.PI * 2 + 0.5;
    st.add('metal', rod([Math.cos(a) * 0.17, 2.6, ROTOR_Z + Math.sin(a) * 0.17], [Math.cos(a) * 0.17, 2.72, ROTOR_Z + Math.sin(a) * 0.17], 0.018));
  }

  // Skids and arched cross tubes.
  for (const s of [-1, 1]) {
    st.add('skid', tube([[s * 1.1, 0.08, -1.9], [s * 1.1, 0.08, 0.2], [s * 1.1, 0.08, 1.62], [s * 1.1, 0.13, 1.92], [s * 1.1, 0.3, 2.08]], 0.048, 48, 10));
    st.add('skid', place(new THREE.SphereGeometry(0.048, 10, 6), s * 1.1, 0.08, -1.9));
    st.add('skid', place(new THREE.SphereGeometry(0.048, 10, 6), s * 1.1, 0.3, 2.08));
    // wear shoes and boarding step
    for (const z of [-1.2, 0.6]) st.add('dark', place(new THREE.BoxGeometry(0.07, 0.03, 0.42), s * 1.1, 0.035, z));
  }
  for (const z of [1.02, -0.98]) {
    const pts = [];
    for (const s of [-1, 1]) {
      const side = [[1.1, 0.1], [1.06, 0.36], [0.94, 0.6], [0.72, 0.71]].map(([x, y]) => [s * x, y, z]);
      if (s < 0) pts.push(...side); else pts.push(...side.reverse());
      if (s < 0) pts.push([0, 0.73, z]);
    }
    st.add('skid', tube(pts, 0.042, 64, 10));
    for (const s of [-1, 1]) st.add('dark', place(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), s * 0.68, 0.74, z, 0, 0, Math.PI / 2));
  }

  // Weapon outriggers: aero beam across the cabin floor with a 7-tube rocket pod under each end.
  for (const s of [-1, 1]) {
    const sp = [[0.7, 0.5, 0.25], [1.0, 0.46, 0.23], [1.84, 0.38, 0.19]].map(([z, c, le]) => ({ s: z * -s, c, le }));
    if (s > 0) sp.reverse();
    // span along +Z, LE +X -> rotateY(-90deg): span along -X, LE toward +Z
    const beam = airfoilLoft(sp, { K: 14, t: 0.16 }).geo;
    beam.rotateY(-Math.PI / 2);
    beam.translate(0, 1.07, 0.05);
    st.add('paint', beam);
    // pylon and pod
    st.add('dark', place(new THREE.BoxGeometry(0.08, 0.1, 0.5), s * 1.68, 1.02, 0.0));
    const prof = [[0, -0.66], [0.15, -0.66], [0.19, -0.58], [0.19, 0.5], [0.175, 0.6], [0.125, 0.65], [0, 0.65]].map((p) => new THREE.Vector2(p[0], p[1]));
    const pod = new THREE.LatheGeometry(prof, 20);
    pod.rotateX(Math.PI / 2);
    pod.translate(s * 1.68, 0.85, -0.1);
    st.add('pod', pod);
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * Math.PI * 2, r = k === 6 ? 0 : 0.085;
      st.add('soot', place(new THREE.CircleGeometry(0.036, 12), s * 1.68 + Math.cos(a) * r, 0.85 + Math.sin(a) * r, 0.552));
    }
    st.add('dark', place(new THREE.TorusGeometry(0.19, 0.012, 6, 24), s * 1.68, 0.85, 0.42));
    st.add('dark', place(new THREE.TorusGeometry(0.19, 0.012, 6, 24), s * 1.68, 0.85, -0.55));
  }

  // Chin turret with a three-barrel rotary cannon; muzzle at (0, 0.55, 2.95).
  st.add('dark', place(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 16), 0, 0.76, 2.42));
  st.add('dark', place(new THREE.SphereGeometry(0.17, 18, 12), 0, 0.64, 2.42));
  st.add('dark', place(new THREE.BoxGeometry(0.15, 0.13, 0.3), 0, 0.56, 2.56));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    st.add('gun', place(new THREE.CylinderGeometry(0.019, 0.019, 0.42, 8), Math.cos(a) * 0.034, 0.55 + Math.sin(a) * 0.034, 2.74, Math.PI / 2));
  }
  st.add('gun', place(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), 0, 0.55, 2.9, Math.PI / 2));
  st.add('gun', place(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), 0, 0.55, 2.68, Math.PI / 2));

  // Under-nose searchlight and an EO/IR sensor ball.
  st.add('dark', place(new THREE.CylinderGeometry(0.11, 0.09, 0.1, 16), -0.32, 0.74, 1.95));
  st.add('lens', place(new THREE.CircleGeometry(0.085, 16), -0.32, 0.689, 1.95, Math.PI / 2));
  st.add('dark', place(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), 0.36, 0.73, 2.2));
  st.add('pod', place(new THREE.SphereGeometry(0.13, 18, 12), 0.36, 0.62, 2.2));
  st.add('lens', place(new THREE.CircleGeometry(0.06, 16), 0.36, 0.6, 2.33));

  // Door hardware: sliding-door rails, handles, mirror on the cockpit door.
  for (const s of [-1, 1]) {
    const xr = (z) => s * (bodySec(z).hw + 0.012);
    st.add('dark', place(new THREE.BoxGeometry(0.03, 0.035, 2.0), xr(-0.6) - s * 0.03, 2.07, -0.65));
    st.add('dark', place(new THREE.BoxGeometry(0.03, 0.03, 1.7), xr(-0.6) - s * 0.06, 0.88, -0.75));
    st.add('metal', place(new THREE.BoxGeometry(0.03, 0.03, 0.16), xr(0), 1.3, 0.3));
    st.add('metal', place(new THREE.BoxGeometry(0.03, 0.03, 0.14), xr(0.7), 1.3, 0.68));
    st.add('dark', place(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), s * 1.0, 1.52, 1.72, 0, 0, s * 1.2));
    st.add('dark', place(new THREE.SphereGeometry(0.06, 10, 8), s * 1.12, 1.58, 1.72, 0, 0, 0, 1, 0.7, 0.4));
  }

  // Cockpit and cabin interior.
  st.add('seat', place(new THREE.BoxGeometry(1.5, 0.12, 0.42), 0, 1.3, 2.08, -0.4));     // glare shield
  st.add('screen', place(new THREE.PlaneGeometry(1.2, 0.2), 0, 1.31, 1.86, -0.25));       // displays
  for (const s of [-1, 1]) {
    st.add('seat', place(new THREE.BoxGeometry(0.46, 0.1, 0.48), s * 0.42, 1.05, 1.2));
    st.add('seat', place(new THREE.BoxGeometry(0.46, 0.66, 0.1), s * 0.42, 1.4, 0.92, -0.12));
    st.add('dark', rod([s * 0.42, 0.85, 1.55], [s * 0.42, 1.25, 1.62], 0.014));
    for (const x of [0.25, 0.68]) {
      st.add('seat', place(new THREE.BoxGeometry(0.4, 0.1, 0.45), s * x, 1.0, -0.55));
      st.add('seat', place(new THREE.BoxGeometry(0.4, 0.62, 0.1), s * x, 1.33, -0.82, -0.08));
    }
  }

  // Antennas.
  st.add('dark', place(new THREE.BoxGeometry(0.02, 0.22, 0.14), 0, 1.97, -3.6, -0.3));
  st.add('dark', place(new THREE.BoxGeometry(0.015, 0.12, 0.1), 0, 0.68, -0.2, 0.35));
  st.add('dark', place(new THREE.BoxGeometry(0.02, 0.16, 0.12), 0.0, 2.24, 1.5, -0.4));

  // Horizontal stabiliser with swept endplates.
  {
    const stab = airfoilLoft([
      { s: -1.3, c: 0.46, le: 0.1 }, { s: -0.2, c: 0.58, le: 0.16 }, { s: 0.2, c: 0.58, le: 0.16 }, { s: 1.3, c: 0.46, le: 0.1 },
    ], { K: 16, t: 0.13 });
    stab.geo.rotateY(-Math.PI / 2);
    stab.geo.translate(0, 1.7, -5.3);
    st.add('paint', stab.geo);
    const cyc = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    for (const s of [-1, 1]) {
      const ep = airfoilLoft([
        { s: -0.3, c: 0.5, le: 0.0 }, { s: 0.0, c: 0.56, le: 0.06 }, { s: 0.42, c: 0.38, le: -0.16 },
      ], { K: 14, t: 0.1 });
      ep.geo.applyMatrix4(cyc);
      ep.geo.translate(s * 1.31, 1.72, -5.32);
      st.add('paint', ep.geo);
    }
  }

  // Fenestron fin: extruded outline with a duct, a duct liner and lips.
  {
    const sh = new THREE.Shape();
    const P = (z, y) => new THREE.Vector2(-z, y);
    const outline = [P(-5.72, 1.84), P(-6.25, 2.62), P(-6.75, 3.12), P(-6.98, 3.38), P(-7.32, 3.42), P(-7.36, 3.2),
      P(-7.28, 2.55), P(-7.18, 2.02), P(-7.0, 1.62), P(-6.62, 1.42), P(-6.2, 1.45), P(-5.72, 1.52)];
    sh.moveTo(outline[0].x, outline[0].y);
    sh.splineThru(outline.slice(1).concat([outline[0]]));
    const hole = new THREE.Path();
    hole.absarc(-FAN_Z, FAN_Y, FAN_R + 0.03, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    const depth = 0.26;
    const fin = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 3, curveSegments: 64 });
    fin.deleteAttribute('uv');
    fin.translate(0, 0, -depth / 2);
    fin.rotateY(Math.PI / 2);  // shape x (= -z) -> world -z... x' = z, z' = -x
    st.add('paint', fin);
    const liner = new THREE.CylinderGeometry(FAN_R + 0.03, FAN_R + 0.03, 0.42, 40, 1, true);
    liner.rotateZ(Math.PI / 2);
    liner.translate(0, FAN_Y, FAN_Z);
    st.add('ductIn', liner);
    for (const s of [-1, 1]) st.add('paint', place(new THREE.TorusGeometry(FAN_R + 0.08, 0.06, 10, 48), s * 0.2, FAN_Y, FAN_Z, 0, Math.PI / 2));
    // stator: hub, gearbox and vanes (fixed, aft of the fan)
    st.add('dark', place(new THREE.CylinderGeometry(0.12, 0.14, 0.24, 20), 0.04, FAN_Y, FAN_Z, 0, 0, Math.PI / 2));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2;
      const r0 = 0.13, r1 = FAN_R + 0.03, rm = (r0 + r1) / 2;
      st.add('dark', place(new THREE.BoxGeometry(0.02, r1 - r0, 0.07), 0.12, FAN_Y + Math.sin(a) * rm, FAN_Z + Math.cos(a) * rm, -a + Math.PI / 2 + 0, 0, 0));
    }
    // fin tip cap and accent flash
    st.add('accent', place(new THREE.BoxGeometry(0.4, 0.035, 0.42), 0, 3.22, -7.12, 0.2, 0, 0, 1, 1, 1));
  }

  // Tail boom details: strake, tail bumper fairing.
  for (const s of [-1, 1]) st.add('dark', place(new THREE.BoxGeometry(0.02, 0.02, 2.2), s * 0.2, 1.78, -4.4, 0, 0, 0));

  // ---------------- main rotor (local to the rotor group, hub at origin)
  rt.add('rdark', new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24));
  rt.add('rdark', place(new THREE.SphereGeometry(0.17, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.06, 0, 0, 0, 0, 1, 0.55, 1));
  rt.add('metal', place(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 24), 0, -0.14, 0));     // rotating swashplate
  rt.add('metal', place(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), 0, 0.17, 0));       // mast nut
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2;
    const parts = [];
    // flexbeam, cuff, pitch horn + link, lag damper
    parts.push(['rdark', place(new THREE.BoxGeometry(0.15, 0.045, 0.8), 0, 0, 0.55)]);
    const cuff = new THREE.CylinderGeometry(0.09, 0.06, 0.8, 16);
    cuff.rotateX(Math.PI / 2);
    cuff.scale(1.55, 0.5, 1);
    cuff.translate(0.0, 0.0, 0.95);
    parts.push(['rdark', cuff]);
    parts.push(['metal', place(new THREE.BoxGeometry(0.16, 0.03, 0.05), 0.11, -0.01, 0.58)]);
    parts.push(['metal', rod([0.18, -0.14, 0.18], [0.18, -0.01, 0.56], 0.012)]);
    parts.push(['metal', place(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), -0.1, 0.0, 0.45, Math.PI / 2)]);
    // blade
    const stns = [];
    const span = [0.95, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.75, 4.9, 4.98, 5.06, 5.14, 5.22, 5.29, 5.35, 5.4];
    for (const r of span) {
      const u = (r - 0.95) / (ROTOR_R - 0.95);
      const tipU = Math.max(0, (r - 4.9) / 0.5);
      const c = 0.3 * (1 - 0.6 * tipU * tipU) * (r < 1.2 ? 0.85 + 0.15 * (r - 0.95) / 0.25 : 1);
      const le = 0.075 - 0.2 * tipU * tipU;
      stns.push({ s: r, c, le, y: 0.035 * u - 0.025 * tipU * tipU, tw: 0.11 - 0.14 * u });
    }
    const blade = airfoilLoft(stns, {
      K: 18, t: 0.11,
      classify: (i, k, u) => (i < 0 ? 'blade' : span[i] > 4.92 && span[i] < 5.14 ? 'tip' : u < 0.07 ? 'erosion' : 'blade'),
    });
    for (const [key, g] of splitGroups(blade.geo, blade.keys)) parts.push([key, g]);
    for (const [key, g] of parts) {
      g.rotateY(a);
      rt.add(key, g);
    }
  }

  // ---------------- fenestron fan (local to tailRotor group, spins about X)
  ft.add('rdark', place(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 20), -0.05, 0, 0, 0, 0, Math.PI / 2));
  ft.add('rdark', place(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), -0.13, 0, 0, 0, 0, Math.PI / 2, 1, 0.6, 1));
  const spacing = [0, 0.56, 1.18, 1.79, 2.44, 3.08, 3.68, 4.33, 4.94, 5.6]; // uneven, as on real fenestrons
  for (const a of spacing) {
    const g = airfoilLoft([{ s: 0.1, c: 0.1, le: 0.05, tw: 0.5 }, { s: FAN_R - 0.005, c: 0.08, le: 0.04, tw: 0.22 }], { K: 10, t: 0.1 });
    // span along +Z, chord along X; blade disc lies in the YZ plane -> chord should run along Y (spin direction)
    g.geo.rotateZ(Math.PI / 2);
    g.geo.rotateX(a);
    g.geo.translate(-0.06, 0, 0);
    ft.add('fan', g.geo);
  }

  return {
    body: bodyG, shell: shellG, cowl: cowlG,
    st: st.merged(), rt: rt.merged(), ft: ft.merged(),
    exhausts: EXHAUSTS.map((e) => ({ mouth: e.mouth, dir: e.dir })),
  };
}

// ---------------------------------------------------------------- materials (per instance; cheap)
function makeMaterials() {
  const env = (m) => { m.userData.envProbe = true; return m; };
  const paintC = 0x434b55;
  return {
    paint: env(new THREE.MeshPhysicalMaterial({ color: paintC, metalness: 0.25, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 })),
    cowl: env(new THREE.MeshPhysicalMaterial({ color: 0x31373f, metalness: 0.3, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12 })),
    glass: env(new THREE.MeshPhysicalMaterial({ color: 0x0c1824, metalness: 0.15, roughness: 0.03, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false })),
    frame: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, metalness: 0.2, roughness: 0.6 }),
    gap: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.1, roughness: 0.8 }),
    accent: env(new THREE.MeshPhysicalMaterial({ color: 0x1aa9c4, metalness: 0.35, roughness: 0.35, clearcoat: 1, emissive: 0x0a5866, emissiveIntensity: 0.35 })),
    grille: new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.4, roughness: 0.7 }),
    in: new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.9, side: THREE.BackSide }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.85 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x1f4a52 }),
    metal: env(new THREE.MeshStandardMaterial({ color: 0x8c939b, metalness: 0.95, roughness: 0.28 })),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1e22, metalness: 0.6, roughness: 0.5 }),
    rdark: env(new THREE.MeshStandardMaterial({ color: 0x23272c, metalness: 0.65, roughness: 0.4 })),
    skid: env(new THREE.MeshStandardMaterial({ color: 0x30353b, metalness: 0.7, roughness: 0.35 })),
    exhaust: env(new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.9, roughness: 0.45, side: THREE.DoubleSide })),
    soot: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    pod: env(new THREE.MeshPhysicalMaterial({ color: 0x353b33, metalness: 0.3, roughness: 0.5, clearcoat: 0.5 })),
    gun: env(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.9, roughness: 0.35 })),
    lens: env(new THREE.MeshPhysicalMaterial({ color: 0xcfd8e0, metalness: 0.9, roughness: 0.08, emissive: 0xfff4e0, emissiveIntensity: 0.15, clearcoat: 1 })),
    ductIn: new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }),
    fan: new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    blade: env(new THREE.MeshPhysicalMaterial({ color: 0x1d2025, metalness: 0.2, roughness: 0.5, clearcoat: 0.4, side: THREE.DoubleSide })),
    erosion: env(new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.3, side: THREE.DoubleSide })),
    tip: new THREE.MeshStandardMaterial({ color: 0xb9c0c6, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide }),
  };
}

// ---------------------------------------------------------------- VFX helpers (mirrors entities.js)
function flameCone(radius, length, innerHex, outerHex) {
  const group = new THREE.Group();
  const mk = (r, l, off, hex, op) => {
    const g = new THREE.ConeGeometry(r, l, 14, 1, true);
    g.rotateX(-Math.PI * 0.5);
    g.translate(0, 0, -off);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  };
  const outerMesh = mk(radius, length, length * 0.5, outerHex, 0.78);
  const innerMesh = mk(radius * 0.55, length * 0.72, length * 0.36, innerHex, 0.95);
  group.add(outerMesh, innerMesh);
  group.userData = { outerMesh, innerMesh, baseLength: length };
  return group;
}

function trailRibbon(width, length, hex, opacity) {
  const g = new THREE.PlaneGeometry(width, length, 1, 6);
  g.rotateX(-Math.PI * 0.5);
  g.translate(0, 0, -length * 0.5);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
}

let DISC_TEX = null;
function discTexture() {
  if (DISC_TEX) return DISC_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 14, 128, 128, 128);
  gr.addColorStop(0, 'rgba(30,33,38,0)');
  gr.addColorStop(0.25, 'rgba(30,33,38,0.22)');
  gr.addColorStop(0.88, 'rgba(30,33,38,0.32)');
  gr.addColorStop(0.92, 'rgba(120,126,134,0.3)');  // tip stripes smear into a faint ring
  gr.addColorStop(0.96, 'rgba(30,33,38,0.25)');
  gr.addColorStop(1, 'rgba(30,33,38,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  DISC_TEX = new THREE.CanvasTexture(cv);
  DISC_TEX.colorSpace = THREE.SRGBColorSpace;
  return DISC_TEX;
}

// Small emissive lens plus an additive glow shell.
function lamp(parent, hex, x, y, z, r = 0.045, glow = 0.22) {
  const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: hex }));
  lens.position.set(x, y, z);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 3.2, 12, 8), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: glow, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.castShadow = false;
  lens.add(halo);
  parent.add(lens);
  return { lens, halo };
}

// ---------------------------------------------------------------- builder
export function buildHeroHelicopter() {
  if (!KIT) KIT = buildKit();
  const M = makeMaterials();
  const root = new THREE.Group();
  const fuselage = new THREE.Group();
  root.add(fuselage);

  const meshOf = (g, keys) => new THREE.Mesh(g, keys.length === 1 ? M[keys[0]] : keys.map((k) => M[k]));
  fuselage.add(meshOf(KIT.body.geo, KIT.body.keys));
  fuselage.add(meshOf(KIT.shell.geo, KIT.shell.keys));
  fuselage.add(meshOf(KIT.cowl.geo, KIT.cowl.keys));
  for (const k in KIT.st) fuselage.add(new THREE.Mesh(KIT.st[k], M[k]));

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, ROTOR_Y, ROTOR_Z);
  fuselage.add(mainRotor);
  for (const k in KIT.rt) mainRotor.add(new THREE.Mesh(KIT.rt[k], M[k]));

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0, FAN_Y, FAN_Z);
  fuselage.add(tailRotor);
  for (const k in KIT.ft) tailRotor.add(new THREE.Mesh(KIT.ft[k], M[k]));

  // Rotor-disc blur: fades in with the measured spin rate of mainRotor (heli_flight drives rotation.y).
  const discGeo = new THREE.RingGeometry(0.5, ROTOR_R + 0.05, 64, 1);
  discGeo.rotateX(-Math.PI * 0.5);
  const discMat = new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const rotorDisc = new THREE.Mesh(discGeo, discMat);
  rotorDisc.position.set(0, ROTOR_Y + 0.03, ROTOR_Z);
  fuselage.add(rotorDisc);
  const spin = { a: 0, t: 0, w: 0 };
  rotorDisc.onBeforeRender = () => {
    const now = performance.now();
    const dt = (now - spin.t) / 1000;
    if (dt < 0.004) return;
    const w = dt < 0.5 ? Math.abs(mainRotor.rotation.y - spin.a) / dt : 0;
    spin.a = mainRotor.rotation.y; spin.t = now;
    spin.w += (Math.min(w, 60) - spin.w) * Math.min(1, dt * 5);
    discMat.opacity = 0.8 * Math.min(1, Math.max(0, (spin.w - 4) / 18));
  };

  // Lights: nav (port red / starboard green on the endplates, white tail), anti-collision beacons.
  // facing +Z with +Y up, the pilot's left (port) is +X
  lamp(fuselage, 0xff2a2a, 1.36, 1.72, -5.12, 0.04);
  lamp(fuselage, 0x2aff6a, -1.36, 1.72, -5.12, 0.04);
  lamp(fuselage, 0xffffff, 0, 3.0, -7.38, 0.035);
  const beacons = [lamp(fuselage, 0xff1a1a, 0, 3.47, -7.12, 0.055, 0), lamp(fuselage, 0xff1a1a, 0, 0.7, -1.3, 0.05, 0)];
  const beaconOff = new THREE.Color(0x3a0606), beaconOn = new THREE.Color(0xff2020);
  beacons[0].lens.onBeforeRender = () => {
    const t = (performance.now() / 1000) % 1.1;
    for (let i = 0; i < beacons.length; i++) {
      const ph = (t + i * 0.55) % 1.1;
      const on = ph < 0.09;
      beacons[i].lens.material.color.copy(on ? beaconOn : beaconOff);
      beacons[i].halo.material.opacity = on ? 0.8 : 0;
    }
  };

  root.traverse((obj) => {
    obj.frustumCulled = false;
    if (obj.isMesh && obj !== rotorDisc && !(obj.material && obj.material.blending === THREE.AdditiveBlending)) {
      obj.castShadow = obj.material !== M.in && obj.material !== M.glass;
      obj.receiveShadow = true;
    }
  });
  for (const b of beacons) b.lens.castShadow = false;
  // thin blades and fan vanes only cast: self-shadowing them gives acne stripes
  mainRotor.traverse((o) => { o.receiveShadow = false; });
  tailRotor.traverse((o) => { o.receiveShadow = false; });

  // Nitro VFX: turbine afterburners from the exhausts, rotor-tip halo, vortex ring, pod contrails.
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  fuselage.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };
  for (const e of KIT.exhausts) {
    const plume = flameCone(0.2, 4.6, 0xffffff, 0x00e5ff);
    plume.position.set(...e.mouth);
    plume.rotation.y = Math.atan2(-e.dir.x, -e.dir.z);
    nitroVfx.add(plume);
    vfxParts.plumes.push(plume);
  }
  const ringMat = (hex, op) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.RingGeometry(ROTOR_R - 0.35, ROTOR_R + 0.2, 64).rotateX(-Math.PI * 0.5), ringMat(0x00e5ff, 0.7));
  halo.position.set(0, ROTOR_Y + 0.04, ROTOR_Z);
  nitroVfx.add(halo);
  vfxParts.rings.push(halo);
  const vortex = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 48).rotateX(-Math.PI * 0.5), ringMat(0xffbe0b, 0.5));
  vortex.position.set(0, ROTOR_Y - 0.4, ROTOR_Z);
  nitroVfx.add(vortex);
  vfxParts.rings.push(vortex);
  for (const s of [-1, 1]) {
    const tr = trailRibbon(0.18, 12, 0x00e5ff, 0.7);
    tr.position.set(s * 1.82, 1.07, -0.2);
    nitroVfx.add(tr);
    vfxParts.trails.push(tr);
  }

  root.userData = { fuselage, mainRotor, tailRotor, nitroVfx, vfxParts, hero: true };
  return root;
}
