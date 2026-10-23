// Kaiju Defense: procedural giant reptile. Geometry (lofted, noise-sculpted, one skinned body mesh + one
// skinned plate mesh sharing a 29-bone skeleton), scale shader, pose rig, and the breath beam visual.
import * as THREE from "../../../vendor/three.module.js";

export const NOMINAL_HEIGHT = 68; // model-space height (head top / tallest plates) at scale 1

export const PALETTES = [
  { name: "charcoal", body: 0x333336, belly: 0x55504a, plate: 0x6b6862, glow: 0x8fd4ff, eye: 0xffd889 },
  { name: "green", body: 0x24301d, belly: 0x56603c, plate: 0x667058, glow: 0x7dffc4, eye: 0xfff08a },
  { name: "blue", body: 0x1a2232, belly: 0x3e485a, plate: 0x5b6680, glow: 0x5fd6ff, eye: 0xd0f4ff },
  { name: "red", body: 0x2f1913, belly: 0x5f3727, plate: 0x7a5544, glow: 0xff7a2c, eye: 0xffc24a },
];
const ENRAGE_GLOW = new THREE.Color(0xff3218);

// ---------------------------------------------------------------- skeleton
const TAIL_PTS = [
  [0, 25, -9], [0, 22, -16], [0, 18.5, -23], [0, 14.8, -30], [0, 11.4, -37],
  [0, 8.4, -44], [0, 6, -51], [0, 4.3, -58], [0, 3.2, -65], [0, 2.6, -72], [0, 2.3, -79],
];
const BONE_DEFS = [
  ["root", null, 0, 0, 0],
  ["pelvis", "root", 0, 29, 0],
  ["spine", "pelvis", 0, 40, 5],
  ["chest", "spine", 0, 50, 9.5],
  ["neck", "chest", 0, 56.5, 13.5],
  ["head", "neck", 0, 61, 19.5],
  ["jaw", "head", 0, 59.6, 21.5],
];
for (const s of [1, -1]) {
  const k = s > 0 ? "L" : "R";
  BONE_DEFS.push(["thigh" + k, "pelvis", 8.5 * s, 28, 1], ["shin" + k, "thigh" + k, 10.6 * s, 15.5, 4.5], ["foot" + k, "shin" + k, 10.5 * s, 4.2, 0.6]);
  BONE_DEFS.push(["arm" + k, "chest", 9 * s, 48.5, 10.5], ["fore" + k, "arm" + k, 11.5 * s, 42, 15.5], ["hand" + k, "fore" + k, 10 * s, 39.5, 20]);
}
for (let i = 0; i < 10; i++) BONE_DEFS.push(["tail" + i, i === 0 ? "pelvis" : "tail" + (i - 1), ...TAIL_PTS[i]]);
const NB = BONE_DEFS.length;
const BI = {};
BONE_DEFS.forEach((d, i) => { BI[d[0]] = i; });

function W(...pairs) {
  const w = new Float32Array(NB);
  for (let i = 0; i < pairs.length; i += 2) w[BI[pairs[i]]] += pairs[i + 1];
  return w;
}

// ---------------------------------------------------------------- noise (geometry only)
function h3(ix, iy, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz
  );
}
function fbm(x, y, z) {
  return (vnoise(x, y, z) - 0.5) * 1.2 + (vnoise(x * 2.1, y * 2.1, z * 2.1) - 0.5) * 0.55 + (vnoise(x * 4.3, y * 4.3, z * 4.3) - 0.5) * 0.25;
}

// ---------------------------------------------------------------- geometry accumulator
class Acc {
  constructor(extraSize) {
    this.pos = []; this.si = []; this.sw = []; this.ex = []; this.idx = []; this.n = 0; this.extraSize = extraSize;
  }
  // w: Float32Array(NB) weights; ex: array of extraSize
  v(x, y, z, w, ex) {
    this.pos.push(x, y, z);
    pushSkin(this.si, this.sw, w);
    for (let i = 0; i < this.extraSize; i++) this.ex.push(ex[i]);
    return this.n++;
  }
  t(a, b, c) { this.idx.push(a, b, c); }
  build(extraName) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.ex, this.extraSize));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const _top = [0, 0, 0, 0], _topW = [0, 0, 0, 0];
function pushSkin(si, sw, w) {
  _top.fill(0); _topW.fill(0);
  for (let b = 0; b < NB; b++) {
    const x = w[b];
    if (x <= 0) continue;
    for (let k = 0; k < 4; k++) {
      if (x > _topW[k]) {
        for (let m = 3; m > k; m--) { _topW[m] = _topW[m - 1]; _top[m] = _top[m - 1]; }
        _topW[k] = x; _top[k] = b;
        break;
      }
    }
  }
  const s = _topW[0] + _topW[1] + _topW[2] + _topW[3] || 1;
  si.push(_top[0], _top[1], _top[2], _top[3]);
  sw.push(_topW[0] / s, _topW[1] / s, _topW[2] / s, _topW[3] / s);
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Lofted tube through key rings ({c:[x,y,z], rx, ry, w}). Returns the expanded ring frames.
// o: { sub, seg, side:[x,y,z], prof(a,t,ring)->mult, mask(a,t,out4), noise (fraction of radius), nf (freq), capStart, capEnd }
function loft(acc, keys, o) {
  const sub = o.sub || 4, seg = o.seg || 24;
  const rings = [];
  const cr = (a, b, c, d, f) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  for (let k = 0; k < keys.length - 1; k++) {
    const p0 = keys[Math.max(0, k - 1)], p1 = keys[k], p2 = keys[k + 1], p3 = keys[Math.min(keys.length - 1, k + 2)];
    for (let j = 0; j < sub; j++) {
      const f = j / sub;
      const w = new Float32Array(NB);
      for (let b = 0; b < NB; b++) w[b] = p1.w[b] * (1 - f) + p2.w[b] * f;
      rings.push({
        c: V(cr(p0.c[0], p1.c[0], p2.c[0], p3.c[0], f), cr(p0.c[1], p1.c[1], p2.c[1], p3.c[1], f), cr(p0.c[2], p1.c[2], p2.c[2], p3.c[2], f)),
        rx: Math.max(0.05, cr(p0.rx, p1.rx, p2.rx, p3.rx, f)),
        ry: Math.max(0.05, cr(p0.ry, p1.ry, p2.ry, p3.ry, f)),
        w,
      });
    }
  }
  const lk = keys[keys.length - 1];
  rings.push({ c: V(...lk.c), rx: lk.rx, ry: lk.ry, w: lk.w });
  const side = V(...(o.side || [1, 0, 0]));
  let len = 0;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
    r.T = b.clone().sub(a).normalize();
    r.S = side.clone().addScaledVector(r.T, -side.dot(r.T)).normalize();
    r.N = new THREE.Vector3().crossVectors(r.T, r.S);
    if (i > 0) len += r.c.distanceTo(rings[i - 1].c);
    r.len = len;
  }
  const m4 = [0, 0, 0, 0];
  const base = acc.n;
  const amp = o.noise ?? 0.05, nf = o.nf ?? 0.12;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i], t = len > 0 ? r.len / len : 0;
    r.t = t;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const m = o.prof ? o.prof(a, t, r) : 1;
      d.copy(r.S).multiplyScalar(ca * r.rx).addScaledVector(r.N, sa * r.ry);
      p.copy(r.c).addScaledVector(d, m);
      const rr = Math.min(r.rx, r.ry);
      p.addScaledVector(d.normalize(), fbm(p.x * nf, p.y * nf, p.z * nf) * amp * rr * 2);
      m4[0] = m4[1] = m4[2] = m4[3] = 0;
      if (o.mask) o.mask(a, t, m4, r);
      acc.v(p.x, p.y, p.z, r.w, m4);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = base + i * seg + j, b = base + i * seg + ((j + 1) % seg);
      const c = a + seg, dd = b + seg;
      acc.t(a, b, c); acc.t(b, dd, c);
    }
  }
  const z4 = [0, 0, 0, 0];
  if (o.capStart !== false) {
    const r = rings[0];
    const cI = acc.v(r.c.x - r.T.x * r.rx * 0.35, r.c.y - r.T.y * r.rx * 0.35, r.c.z - r.T.z * r.rx * 0.35, r.w, o.capMask || z4);
    for (let j = 0; j < seg; j++) acc.t(cI, base + ((j + 1) % seg), base + j);
  }
  if (o.capEnd !== false) {
    const r = rings[rings.length - 1], b0 = base + (rings.length - 1) * seg;
    const e = o.capLen ?? r.rx * 0.45;
    const cI = acc.v(r.c.x + r.T.x * e, r.c.y + r.T.y * e, r.c.z + r.T.z * e, r.w, o.capMask || z4);
    for (let j = 0; j < seg; j++) acc.t(cI, b0 + j, b0 + ((j + 1) % seg));
  }
  rings.totalLen = len;
  return rings;
}

// Deformed ellipsoid. o: { c, r:[rx,ry,rz], rot:[x,y,z], w, mask, noise, nf, ws, hs, floorY }
function blob(acc, o) {
  const g = new THREE.SphereGeometry(1, o.ws || 18, o.hs || 12);
  const m = new THREE.Matrix4().compose(V(...o.c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))), V(...o.r));
  const pa = g.attributes.position, base = acc.n;
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const amp = o.noise ?? 0.06, nf = o.nf ?? 0.3, rr = Math.min(...o.r);
  for (let i = 0; i < pa.count; i++) {
    q.fromBufferAttribute(pa, i);
    p.copy(q).applyMatrix4(m);
    const n = fbm(p.x * nf, p.y * nf, p.z * nf) * amp * rr * 2;
    p.add(q.transformDirection(m).multiplyScalar(n));
    if (o.floorY !== undefined && p.y < o.floorY) p.y = o.floorY;
    acc.v(p.x, p.y, p.z, o.w, o.mask || [0, 0, 0, 0]);
  }
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) acc.t(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
  g.dispose();
}

// Curved tapered spike (claws, teeth, toes): from p0 along dir, bending by `curl` toward `bend` dir.
function spike(acc, p0, dir, len, r0, w, mask, bend = [0, -1, 0], curl = 0.25, seg = 7, n = 4, rEnd = 0.04) {
  const keys = [];
  const P = V(...p0), D = V(...dir).normalize(), Bd = V(...bend).normalize();
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const dd = D.clone().addScaledVector(Bd, curl * f * f).normalize();
    keys.push({ c: [P.x, P.y, P.z], rx: r0 * (1 - f) + rEnd * f, ry: r0 * (1 - f) + rEnd * f, w });
    P.addScaledVector(dd, len / n);
  }
  const side = Math.abs(D.y) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  loft(acc, keys, { sub: 1, seg, side, noise: 0, mask: (a, t, m) => { m[0] = mask[0]; m[1] = mask[1]; m[2] = mask[2]; m[3] = mask[3]; }, capMask: mask, capLen: 0.02 });
}

// ---------------------------------------------------------------- body geometry
function buildBody() {
  const acc = new Acc(4); // aMask: belly, ivory, eye, mouth
  const IVORY = [0, 1, 0, 0], EYE = [0, 0, 1, 0];

  // spine loft: tail tip -> neck
  const keys = [];
  for (let i = 10; i >= 0; i--) {
    const r = 0.45 + 7.6 * Math.pow(1 - i / 10, 1.25);
    const w = i === 10 ? W("tail9", 1) : i === 0 ? W("pelvis", 0.5, "tail0", 0.5) : W("tail" + (i - 1), 0.5, "tail" + i, 0.5);
    keys.push({ c: TAIL_PTS[i], rx: r * 0.92, ry: r * 1.08, w });
  }
  keys.push(
    { c: [0, 27.5, -3.5], rx: 10, ry: 9.8, w: W("pelvis", 1) },
    { c: [0, 30, 1], rx: 11.5, ry: 11.2, w: W("pelvis", 1) },
    { c: [0, 35, 3.5], rx: 12, ry: 11.6, w: W("pelvis", 0.5, "spine", 0.5) },
    { c: [0, 40.5, 5.5], rx: 11.6, ry: 11, w: W("spine", 1) },
    { c: [0, 46, 7.5], rx: 11, ry: 10.5, w: W("spine", 0.5, "chest", 0.5) },
    { c: [0, 51, 9.8], rx: 10, ry: 9.4, w: W("chest", 1) },
    { c: [0, 55, 12.5], rx: 8, ry: 8, w: W("chest", 0.5, "neck", 0.5) },
    { c: [0, 58, 15.5], rx: 6.4, ry: 6.6, w: W("neck", 1) },
    { c: [0, 60.5, 19], rx: 5.3, ry: 5.5, w: W("neck", 0.5, "head", 0.5) }
  );
  const spineRings = loft(acc, keys, {
    sub: 4, seg: 36, noise: 0.035, nf: 0.09,
    prof: (a, t) => {
      const s = Math.sin(a);
      return 1 + 0.05 * s + 0.07 * Math.exp(-(((a - Math.PI / 2) / 0.22) ** 2)) - (s < -0.6 ? 0.04 : 0);
    },
    mask: (a, t, m) => {
      const s = Math.sin(a);
      const k = Math.min(1, Math.max(0, (-s - 0.35) / 0.5));
      m[0] = k * (t > 0.62 ? 1 : 0.55);
    },
  });

  // shoulders / traps
  for (const s of [1, -1]) {
    const k = s > 0 ? "L" : "R";
    blob(acc, { c: [7.6 * s, 49.5, 9.5], r: [5.2, 6.6, 5.8], rot: [0.3, 0, -0.25 * s], w: W("chest", 0.7, "arm" + k, 0.3), noise: 0.05, nf: 0.2 });
    blob(acc, { c: [6.5 * s, 31, 3], r: [6.5, 7.5, 7.5], rot: [0.2, 0, 0.15 * s], w: W("pelvis", 0.6, "thigh" + k, 0.4), noise: 0.05, nf: 0.2 });
  }

  // head (cranium + upper jaw)
  const hk = [
    { c: [0, 61, 17.5], rx: 5.3, ry: 5.5, w: W("neck", 0.5, "head", 0.5) },
    { c: [0, 62, 20.5], rx: 5.6, ry: 5.2, w: W("head", 1) },
    { c: [0, 62.4, 23.5], rx: 5.1, ry: 4.5, w: W("head", 1) },
    { c: [0, 62.4, 26.5], rx: 4.2, ry: 3.6, w: W("head", 1) },
    { c: [0, 62.1, 29.2], rx: 3.5, ry: 2.9, w: W("head", 1) },
    { c: [0, 61.7, 31.6], rx: 2.9, ry: 2.3, w: W("head", 1) },
    { c: [0, 61.3, 33.3], rx: 1.9, ry: 1.6, w: W("head", 1) },
  ];
  const supE = (a, n) => 1 / Math.pow(Math.abs(Math.cos(a)) ** n + Math.abs(Math.sin(a)) ** n, 1 / n);
  loft(acc, hk, {
    sub: 4, seg: 32, noise: 0.03, nf: 0.25,
    prof: (a, t) => {
      const s = Math.sin(a);
      let m = supE(a, 3);
      if (s < 0) m *= 1 - 0.38 * Math.min(1, -s * 1.6) * Math.min(1, t * 4);
      m += 0.08 * Math.exp(-(((a - Math.PI / 2) / 0.25) ** 2)) * t;
      return m;
    },
    mask: (a, t, m) => { if (Math.sin(a) < -0.62 && t > 0.2) m[3] = 1; },
  });
  // lower jaw
  const jk = [
    { c: [0, 59.0, 20.6], rx: 4.9, ry: 2.8, w: W("jaw", 0.7, "head", 0.3) },
    { c: [0, 58.9, 24], rx: 4.5, ry: 2.6, w: W("jaw", 1) },
    { c: [0, 59.1, 27.5], rx: 3.7, ry: 2.1, w: W("jaw", 1) },
    { c: [0, 59.4, 30.3], rx: 3.0, ry: 1.7, w: W("jaw", 1) },
    { c: [0, 59.8, 32.6], rx: 2.0, ry: 1.1, w: W("jaw", 1) },
  ];
  loft(acc, jk, {
    sub: 3, seg: 28, noise: 0.03, nf: 0.3,
    prof: (a) => { const s = Math.sin(a); return supE(a, 2.6) * (s > 0 ? 1 - 0.45 * Math.min(1, s * 1.5) : 1); },
    mask: (a, t, m) => { const s = Math.sin(a); if (s > 0.55 && t > 0.08) m[3] = 1; if (s < -0.5) m[0] = 0.6; },
  });
  // brow ridges, eyes, cheek spikes
  for (const s of [1, -1]) {
    blob(acc, { c: [3.0 * s, 64.2, 25.0], r: [1.7, 1.15, 3.6], rot: [-0.12, 0.28 * s, 0.2 * s], w: W("head", 1), noise: 0.12, nf: 0.9, ws: 12, hs: 8 });
    blob(acc, { c: [3.95 * s, 63.2, 26.6], r: [0.6, 0.45, 0.8], w: W("head", 1), mask: EYE, noise: 0, ws: 10, hs: 8 });
    for (let k = 0; k < 3; k++) {
      spike(acc, [4.4 * s, 61.8 - k * 1.2, 20.5 - k * 0.8], [0.45 * s, -0.1, -1], 2.4 - k * 0.5, 0.65 - k * 0.12, W("head", 1), [0, 0.2, 0, 0], [0, 1, 0], 0.15, 6, 2);
    }
  }
  // snout ridge bumps
  for (let k = 0; k < 4; k++) blob(acc, { c: [0, 64.6 - k * 0.65, 23.5 + k * 2.3], r: [0.9, 0.55, 1.1], w: W("head", 1), noise: 0.1, nf: 1, ws: 8, hs: 6 });

  // teeth
  const lerpKeys = (ks, z, f) => {
    for (let i = 0; i < ks.length - 1; i++) {
      if (z <= ks[i + 1].c[2]) { const u = (z - ks[i].c[2]) / (ks[i + 1].c[2] - ks[i].c[2]); return f(ks[i]) * (1 - u) + f(ks[i + 1]) * u; }
    }
    return f(ks[ks.length - 1]);
  };
  for (const s of [1, -1]) {
    for (let k = 0; k < 8; k++) {
      const z = 22.8 + k * 1.3;
      const rx = lerpKeys(hk, z, (q) => q.rx) * 0.8;
      const yb = lerpKeys(hk, z, (q) => q.c[1] - q.ry * 0.62) + 0.25;
      const L = k === 6 ? 1.9 : 1.15 + 0.06 * k;
      spike(acc, [rx * s, yb, z], [0.05 * s, -1, 0.12], L, 0.34, W("head", 1), IVORY, [0, 0, -1], 0.25, 5, 2);
      const zj = z + 0.6;
      if (zj < 32.2) {
        const rxj = lerpKeys(jk, zj, (q) => q.rx) * 0.78;
        const yj = lerpKeys(jk, zj, (q) => q.c[1] + q.ry * 0.55) - 0.2;
        spike(acc, [rxj * s, yj, zj], [0.04 * s, 1, 0.1], k === 6 ? 1.5 : 0.95, 0.3, W("jaw", 1), IVORY, [0, 0, -1], 0.2, 5, 2);
      }
    }
  }

  // legs
  for (const s of [1, -1]) {
    const k = s > 0 ? "L" : "R";
    const T = "thigh" + k, S = "shin" + k, F = "foot" + k;
    loft(acc, [
      { c: [8.5 * s, 31, 0], rx: 9, ry: 9, w: W("pelvis", 0.6, T, 0.4) },
      { c: [9.4 * s, 26, 1.2], rx: 8.9, ry: 9.2, w: W(T, 1) },
      { c: [10.2 * s, 21, 2.9], rx: 7.6, ry: 8, w: W(T, 1) },
      { c: [10.6 * s, 16.5, 4.4], rx: 6.0, ry: 6.3, w: W(T, 0.5, S, 0.5) },
      { c: [10.6 * s, 12, 3.6], rx: 5.2, ry: 5.6, w: W(S, 1) },
      { c: [10.5 * s, 8, 2.0], rx: 4.6, ry: 5.0, w: W(S, 1) },
      { c: [10.5 * s, 4.6, 0.7], rx: 4.2, ry: 4.6, w: W(S, 0.5, F, 0.5) },
      { c: [10.5 * s, 2.6, 0.4], rx: 4.3, ry: 4.7, w: W(F, 1) },
    ], {
      sub: 3, seg: 26, noise: 0.05, nf: 0.16, capStart: false,
      prof: (a, t) => 1 + 0.12 * Math.exp(-(((a + Math.PI / 2) / 0.6) ** 2)) * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.45) / 0.45))) + 0.08 * Math.exp(-(((a - Math.PI / 2) / 0.7) ** 2)) * (t < 0.45 ? 1 : 0),
    });
    // foot
    blob(acc, { c: [10.5 * s, 1.9, 2.4], r: [4.9, 2.2, 6.3], w: W(F, 1), noise: 0.06, nf: 0.35, floorY: 0.15 });
    for (const yaw of [-0.38, 0, 0.38]) {
      const yw = yaw + 0.06 * s;
      const bx = 10.5 * s + Math.sin(yw) * 3.2, bz = 2.4 + Math.cos(yw) * 4.4;
      spike(acc, [bx, 1.6, bz], [Math.sin(yw), -0.12, Math.cos(yw)], 3.4, 1.45, W(F, 1), [0, 0, 0, 0], [0, -1, 0], 0.15, 10, 2, 0.95);
      const tx = bx + Math.sin(yw) * 3.2, tz = bz + Math.cos(yw) * 3.2;
      spike(acc, [tx, 1.35, tz], [Math.sin(yw), 0.05, Math.cos(yw)], 2.4, 0.85, W(F, 1), IVORY, [0, -1, 0], 0.9, 7, 4);
    }
    spike(acc, [10.5 * s, 1.6, -2.8], [0.3 * s, -0.25, -1], 2.2, 0.8, W(F, 1), IVORY, [0, -1, 0], 0.6, 6, 3);
  }

  // arms
  for (const s of [1, -1]) {
    const k = s > 0 ? "L" : "R";
    const A = "arm" + k, Fo = "fore" + k, H = "hand" + k;
    loft(acc, [
      { c: [8.6 * s, 49, 9.6], rx: 3.8, ry: 3.8, w: W("chest", 0.5, A, 0.5) },
      { c: [10.6 * s, 45.5, 13], rx: 3.1, ry: 3.2, w: W(A, 1) },
      { c: [11.5 * s, 42.2, 15.4], rx: 2.5, ry: 2.6, w: W(A, 0.5, Fo, 0.5) },
      { c: [11 * s, 40.8, 17.8], rx: 2.25, ry: 2.3, w: W(Fo, 1) },
      { c: [10.2 * s, 39.6, 19.8], rx: 2.0, ry: 2.0, w: W(Fo, 0.5, H, 0.5) },
    ], { sub: 3, seg: 16, noise: 0.05, nf: 0.3, capStart: false });
    blob(acc, { c: [10 * s, 39.1, 20.9], r: [1.7, 2.0, 1.5], w: W(H, 1), noise: 0.06, nf: 0.6, ws: 12, hs: 8 });
    for (let f = 0; f < 4; f++) {
      spike(acc, [10 * s + (f - 1.5) * 0.85, 38.4, 21.6], [(f - 1.5) * 0.15, -0.55, 0.85], 2.6, 0.5, W(H, 1), IVORY, [0, -1, -0.3], 0.8, 6, 3);
    }
  }
  return { geom: acc.build("aMask"), spineRings };
}

// ---------------------------------------------------------------- plates (+ chest core)
function plateShape() {
  const pts = [
    [-0.42, 0], [-0.5, 0.2], [-0.74, 0.33], [-0.47, 0.42], [-0.62, 0.62], [-0.32, 0.63], [-0.3, 0.86], [-0.08, 0.79],
    [0.03, 1.0], [0.15, 0.77], [0.38, 0.8], [0.29, 0.57], [0.57, 0.5], [0.36, 0.35], [0.52, 0.18], [0.42, 0],
  ];
  const sh = new THREE.Shape();
  pts.forEach(([u, v], i) => { const x = u - 0.22 * v; if (i === 0) sh.moveTo(x, v); else sh.lineTo(x, v); });
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 1, curveSegments: 1 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i);
    p.setZ(i, (p.getZ(i) - 0.06) * (1 - 0.72 * Math.min(1, Math.max(0, v))));
  }
  return g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g;
}

function sampleRings(rings, L) {
  let i = 1;
  while (i < rings.length - 1 && rings[i].len < L) i++;
  const a = rings[i - 1], b = rings[i];
  const f = Math.min(1, Math.max(0, (L - a.len) / Math.max(1e-6, b.len - a.len)));
  const w = new Float32Array(NB);
  for (let k = 0; k < NB; k++) w[k] = a.w[k] * (1 - f) + b.w[k] * f;
  return {
    c: a.c.clone().lerp(b.c, f), T: a.T.clone().lerp(b.T, f).normalize(), S: a.S.clone().lerp(b.S, f).normalize(),
    N: a.N.clone().lerp(b.N, f).normalize(), rx: a.rx + (b.rx - a.rx) * f, ry: a.ry + (b.ry - a.ry) * f, w,
  };
}

function buildPlates(spineRings) {
  const acc = new Acc(3); // aGlow: spine t (0 tail .. 1 head), kind (0 plate, 1..3 weak plate, 4 core), height in plate
  const shape = plateShape();
  const sp = shape.attributes.position;
  const total = spineRings.totalLen;
  const sizeAt = (s) => (s < 0.84 ? 1.6 + 10.4 * Math.pow(s / 0.84, 1.5) : 12 - ((s - 0.84) / 0.16) * 7.5);
  const weakS = [0.735, 0.79, 0.845];
  const weak = [];
  const tmp = new THREE.Vector3();
  const place = (smp, size, tilt, offs, kind, sNorm) => {
    const N = smp.N.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(smp.S, Math.sin(tilt)).normalize();
    const S = new THREE.Vector3().crossVectors(N, smp.T).normalize();
    const base = smp.c.clone().addScaledVector(smp.N, smp.ry * 0.78).addScaledVector(smp.S, offs);
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      tmp.copy(base).addScaledVector(smp.T, x * size * 0.95).addScaledVector(N, y * size).addScaledVector(S, z * size);
      const ix = acc.v(tmp.x, tmp.y, tmp.z, smp.w, [sNorm, kind, y]);
      if (i % 3 === 2) acc.t(ix - 2, ix - 1, ix);
    }
    return base.clone().addScaledVector(N, size * 0.5);
  };
  // center row from neck backward
  let L = total * 0.985;
  const centers = [];
  while (L > 1.2) {
    const s = L / total;
    centers.push(L);
    L -= Math.max(1.6, sizeAt(s) * 0.42);
  }
  const weakIdx = weakS.map((ws) => {
    let best = 0;
    centers.forEach((c, i) => { if (Math.abs(c / total - ws) < Math.abs(centers[best] / total - ws)) best = i; });
    return best;
  });
  centers.forEach((Lc, i) => {
    const s = Lc / total, smp = sampleRings(spineRings, Lc);
    const wk = weakIdx.indexOf(i);
    const size = sizeAt(s) * (wk >= 0 ? 1.22 : 1);
    const c = place(smp, size, 0, 0, wk >= 0 ? wk + 1 : 0, s);
    if (wk >= 0) weak[wk] = { center: c, radius: size * 0.42, w: smp.w };
    // side rows, offset half a step
    if (s > 0.3 && i + 1 < centers.length) {
      const Lm = (Lc + centers[i + 1]) * 0.5, sm = Lm / total, sm2 = sampleRings(spineRings, Lm);
      const ss = sizeAt(sm) * 0.58;
      for (const sd of [1, -1]) place(sm2, ss, 0.42 * sd, sd * sm2.rx * 0.36, 0, sm);
    }
  });
  // chest core: on the front of the chest
  const coreW = W("spine", 0.4, "chest", 0.6);
  const coreC = [0, 44.5, 16.3];
  const g = new THREE.IcosahedronGeometry(1, 3);
  const gp = g.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
    const ix = acc.v(coreC[0] + x * 2.4, coreC[1] + y * 3.4, coreC[2] + z * 1.5, coreW, [1, 4, 1]);
    if (i % 3 === 2) acc.t(ix - 2, ix - 1, ix);
  }
  g.dispose();
  shape.dispose();
  const geom = acc.build("aGlow");
  return { geom, weak, core: { center: V(...coreC), w: coreW } };
}

// ---------------------------------------------------------------- materials
const GLSL_NOISE = `
float kjH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kjN3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kjH3(i), kjH3(i + vec3(1,0,0)), f.x), mix(kjH3(i + vec3(0,1,0)), kjH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(kjH3(i + vec3(0,0,1)), kjH3(i + vec3(1,0,1)), f.x), mix(kjH3(i + vec3(0,1,1)), kjH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

function bodyMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aMask;\nvarying vec3 vKjObj;\nvarying vec4 vKjMask;\nvarying float vKjBone;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKjObj = position; vKjMask = aMask; vKjBone = skinIndex.x;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uBody, uBelly, uIvory, uEye, uMouth, uRim, uFlashCol;
uniform float uEyeGlow, uFlash, uFlashBone, uBump;
varying vec3 vKjObj; varying vec4 vKjMask; varying float vKjBone;
${GLSL_NOISE}
vec3 kjVor(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k - (k / 3) * 3), float((k / 3) - (k / 9) * 3), float(k / 9)) - 1.0;
    vec3 o = vec3(kjH3(i + g), kjH3(i + g + 17.3), kjH3(i + g + 41.7));
    vec3 r = g + o * 0.85 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
vec3 kjPerturb(vec3 sp, vec3 sn, vec2 dh, float fd){
  vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn); vec3 r2 = cross(sn, sx); float det = dot(sx, r1) * fd;
  vec3 gr = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * sn - gr);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
vec3 kjP = vKjObj * mix(1.35, 0.8, vKjMask.r);
vec3 kjV = kjVor(kjP);
float kjFw = length(fwidth(kjP));
float kjDet = 1.0 - smoothstep(0.18, 0.6, kjFw);
float kjEdge = smoothstep(0.0, 0.32, kjV.y);
float kjBig = kjN3(vKjObj * 0.16) * 0.65 + kjN3(vKjObj * 0.42) * 0.35;
float kjRidge = 1.0 - abs(kjN3(vKjObj * vec3(0.5, 0.9, 0.5)) * 2.0 - 1.0);
float kjSoft = 1.0 - vKjMask.g - vKjMask.b;
float kjHgt = ((kjEdge * 0.5 - kjV.x * 0.25) * kjDet + kjBig * 2.2 + kjRidge * 0.9) * kjSoft;
vec3 kjCol = mix(uBody, uBelly, vKjMask.r);
kjCol *= 0.78 + 0.45 * kjBig + 0.18 * (kjV.z - 0.5) * kjDet;
kjCol *= mix(1.0, mix(0.55, 1.05, kjEdge), kjDet * (1.0 - vKjMask.a));
kjCol *= 0.8 + 0.4 * kjRidge;
kjCol = mix(kjCol, uMouth * (0.6 + 0.6 * kjBig), vKjMask.a);
kjCol = mix(kjCol, uIvory, vKjMask.g);
kjCol = mix(kjCol, vec3(0.02), vKjMask.b);
diffuseColor.rgb = kjCol;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(mix(0.96, 0.62, kjEdge * kjDet), 0.35, vKjMask.g + vKjMask.b * 2.0);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = kjPerturb(-vViewPosition, normal, vec2(dFdx(kjHgt), dFdy(kjHgt)) * uBump, faceDirection);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
float kjRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
totalEmissiveRadiance += uRim * kjRim * (1.0 - vKjMask.b) * (0.5 + 0.5 * kjEdge);
totalEmissiveRadiance += uEye * vKjMask.b * uEyeGlow;
totalEmissiveRadiance += uFlashCol * uFlash * (1.0 - step(0.5, abs(vKjBone - uFlashBone)));`);
  };
  m.customProgramCacheKey = () => "kaiju_body_v1";
  return m;
}

function plateMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05, flatShading: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aGlow;\nvarying vec3 vKjGlow;\nvarying vec3 vKjObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKjGlow = aGlow; vKjObj = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uPlate, uGlow; uniform float uCharge, uBase, uTime, uFade, uActive; uniform vec4 uWeakFlash;
varying vec3 vKjGlow; varying vec3 vKjObj;
${GLSL_NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
float kjK = vKjGlow.y; float kjTip = smoothstep(0.12, 1.0, vKjGlow.z);
float kjCore = step(3.5, kjK);
float kjN = kjN3(vKjObj * 1.7);
diffuseColor.rgb = mix(uPlate * (0.55 + 0.6 * vKjGlow.z) * (0.8 + 0.4 * kjN), uGlow * 0.15, kjCore);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
float kjLit = smoothstep(vKjGlow.x - 0.03, vKjGlow.x + 0.09, uCharge * 1.15);
float kjWeak = step(0.5, kjK) * (1.0 - kjCore);
float kjPulse = 0.5 + 0.5 * sin(uTime * 3.2 - vKjGlow.x * 9.0);
float kjE = (uBase * (0.7 + 0.6 * kjN) + kjLit * 2.6 + uActive * 3.2) * kjTip * (0.65 + 0.35 * kjPulse);
kjE += kjWeak * (1.0 + 0.6 * kjPulse) * (0.35 + kjTip);
float kjVein = pow(1.0 - abs(kjN3(vKjObj * 2.2 + uTime * 0.3) * 2.0 - 1.0), 5.0);
kjE += kjCore * (0.25 + 1.6 * kjVein) * (0.8 + 0.3 * sin(uTime * 4.0));
float kjFl = kjK < 0.5 ? 0.0 : kjK < 1.5 ? uWeakFlash.x : kjK < 2.5 ? uWeakFlash.y : kjK < 3.5 ? uWeakFlash.z : uWeakFlash.w;
totalEmissiveRadiance += uGlow * kjE * uFade + vec3(1.0, 0.95, 0.9) * kjFl * 3.0;`);
  };
  m.customProgramCacheKey = () => "kaiju_plate_v1";
  return m;
}

// ---------------------------------------------------------------- model
export class KaijuModel {
  constructor(palette) {
    this.palette = palette;
    this.group = new THREE.Group();
    this.group.name = "kaiju";
    this.group.rotation.order = "YZX";
    // bones
    this.bones = [];
    this.b = {};
    this.rest = [];
    for (const [name, parent, x, y, z] of BONE_DEFS) {
      const bone = new THREE.Bone();
      bone.name = name;
      const pd = parent ? BONE_DEFS[BI[parent]] : null;
      bone.position.set(x - (pd ? pd[2] : 0), y - (pd ? pd[3] : 0), z - (pd ? pd[4] : 0));
      if (parent) this.b[parent].add(bone);
      this.bones.push(bone);
      this.b[name] = bone;
      this.rest.push(bone.position.clone());
    }
    this.group.add(this.b.root);
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);

    const body = buildBody();
    const plates = buildPlates(body.spineRings);
    const glow = new THREE.Color(palette.glow);
    this.glowBase = glow.clone();
    this.U = {
      uBody: { value: new THREE.Color(palette.body) },
      uBelly: { value: new THREE.Color(palette.belly) },
      uIvory: { value: new THREE.Color(0xb8ab8e) },
      uEye: { value: new THREE.Color(palette.eye) },
      uMouth: { value: new THREE.Color(0x4a1414) },
      uRim: { value: new THREE.Color(palette.glow).multiplyScalar(0.025).add(new THREE.Color(0.03, 0.032, 0.036)) },
      uFlashCol: { value: new THREE.Color(1.0, 0.55, 0.3) },
      uEyeGlow: { value: 0.9 },
      uFlash: { value: 0 },
      uFlashBone: { value: -10 },
      uBump: { value: 0.9 },
    };
    this.PU = {
      uPlate: { value: new THREE.Color(palette.plate) },
      uGlow: { value: glow },
      uCharge: { value: 0 },
      uBase: { value: 0.35 },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uActive: { value: 0 },
      uWeakFlash: { value: new THREE.Vector4() },
    };
    this.bodyMat = bodyMaterial(this.U);
    this.plateMat = plateMaterial(this.PU);
    this.body = new THREE.SkinnedMesh(body.geom, this.bodyMat);
    this.plates = new THREE.SkinnedMesh(plates.geom, this.plateMat);
    for (const m of [this.body, this.plates]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      m.bind(this.skeleton);
    }

    // anchor points (bone index + local offset), all in model rest space
    const anchor = (bone, x, y, z) => {
      const d = BONE_DEFS[BI[bone]];
      return { bone: this.b[bone], off: V(x - d[2], y - d[3], z - d[4]) };
    };
    const topBone = (w) => { let bi = 0; for (let k = 1; k < NB; k++) if (w[k] > w[bi]) bi = k; return BONE_DEFS[bi][0]; };
    this.mouth = anchor("head", 0, 60.3, 32.5);
    this.soles = [anchor("footL", 10.5, 0.4, 3.0), anchor("footR", -10.5, 0.4, 3.0)];
    const hd = (name, bone, x, y, z, r, weak = false) => ({ name, r, weak, ...anchor(bone, x, y, z) });
    this.hitDefs = [
      hd("head", "head", 0, 62.2, 26, 6.2),
      hd("jaw", "jaw", 0, 59, 28, 3.6),
      hd("neck", "neck", 0, 57.5, 15, 7),
      hd("core", topBone(plates.core.w), plates.core.center.x, plates.core.center.y, plates.core.center.z, 4.6, true),
      hd("chest", "chest", 0, 49, 9, 10.2),
      hd("belly", "spine", 0, 39, 5, 11.2),
      hd("hips", "pelvis", 0, 29, 0, 11),
      hd("thighL", "thighL", 9.8, 22, 2.5, 8), hd("thighR", "thighR", -9.8, 22, 2.5, 8),
      hd("shinL", "shinL", 10.5, 9, 2.2, 5.2), hd("shinR", "shinR", -10.5, 9, 2.2, 5.2),
      hd("tail1", "tail1", ...TAIL_PTS[1], 7), hd("tail2", "tail3", ...TAIL_PTS[3], 5.5),
      hd("tail3", "tail5", ...TAIL_PTS[5], 4), hd("tail4", "tail8", ...TAIL_PTS[8], 2.6),
    ];
    plates.weak.forEach((wp, i) => this.hitDefs.push(hd("plate" + (i + 1), topBone(wp.w), wp.center.x, wp.center.y, wp.center.z, wp.radius, true)));
    this.tailTip = anchor("tail9", ...TAIL_PTS[10]);
    this.tailMid = anchor("tail4", ...TAIL_PTS[5]);
    this._tmp = new THREE.Vector3();
    this.flash = 0;
    this.weakFlash = new THREE.Vector4();
  }

  boneIndex(bone) { return this.bones.indexOf(bone); }

  // world position of an anchor (requires updated matrices)
  anchorWorld(a, out) { return out.copy(a.off).applyMatrix4(a.bone.matrixWorld); }

  setEnraged(k) {
    this.PU.uGlow.value.copy(this.glowBase).lerp(ENRAGE_GLOW, k * 0.75);
    this.U.uEye.value.set(this.palette.eye).lerp(ENRAGE_GLOW, k * 0.8);
    this.U.uEyeGlow.value = 0.9 + k * 1.2;
  }

  // P: pose params (see Kaiju), t: time
  applyPose(P) {
    const b = this.b, R = this.rest;
    for (let i = 0; i < this.bones.length; i++) { this.bones[i].position.copy(R[i]); this.bones[i].rotation.set(0, 0, 0); }
    const wa = P.walkAmt, A = 0.28 * wa;
    let stanceFwd = 0;
    const legs = [[b.thighL, b.shinL, b.footL, 0], [b.thighR, b.shinR, b.footR, 0.5]];
    for (const [th, sh, ft, off] of legs) {
      const p = (P.walkPhase + off) % 1;
      let fwd, knee, toe = 0;
      if (p < 0.5) {
        const u = p / 0.5;
        fwd = A * (1 - 2 * u);
        knee = 0.06 * wa * Math.sin(Math.PI * u);
        stanceFwd = fwd;
      } else {
        const u = (p - 0.5) / 0.5, e = u * u * (3 - 2 * u), s = Math.sin(Math.PI * u);
        fwd = -A + 2 * A * e + 0.3 * wa * s;
        knee = 0.95 * wa * s;
        toe = 0.35 * wa * s;
      }
      th.rotation.x = -fwd - P.crouch * 0.55;
      sh.rotation.x = knee + P.crouch * 1.0;
      ft.rotation.x = -(th.rotation.x + sh.rotation.x) + toe;
    }
    const ph = P.walkPhase * Math.PI * 2;
    b.pelvis.position.y -= 27 * (1 - Math.cos(stanceFwd)) + P.crouch * 7 + 0.35 * wa * Math.max(0, Math.cos(ph * 2));
    b.pelvis.position.x += 1.0 * wa * Math.sin(ph);
    b.pelvis.rotation.y = -0.07 * wa * Math.cos(ph);
    b.pelvis.rotation.z = -0.03 * wa * Math.sin(ph);
    b.spine.rotation.x = 0.04 * wa + P.lean;
    b.chest.rotation.y = 0.06 * wa * Math.cos(ph);
    b.chest.rotation.z = 0.025 * wa * Math.sin(ph);
    // arms
    for (const [arm, fore, s, o] of [[b.armL, b.foreL, 1, 0], [b.armR, b.foreR, -1, Math.PI]]) {
      arm.rotation.x = 0.12 * wa * Math.sin(ph + o) - 0.35 * P.roar;
      arm.rotation.z = (0.08 + 0.45 * P.roar) * s;
      fore.rotation.x = -0.15 - 0.35 * P.roar - 0.1 * P.charge;
    }
    // head / neck
    const hy = P.headYaw, hp = P.headPitch;
    b.neck.rotation.y = hy * 0.4;
    b.head.rotation.y = hy * 0.6;
    b.neck.rotation.x = hp * 0.45 - 0.3 * P.roar + 0.12 * P.death;
    b.head.rotation.x = hp * 0.55 - 0.38 * P.roar + 0.25 * P.death;
    b.chest.rotation.x = -0.12 * P.roar - 0.07 * P.charge + 0.05 * P.breath;
    b.spine.rotation.x -= 0.08 * P.roar;
    b.jaw.rotation.x = 0.72 * Math.max(P.jaw, P.roar * 0.95, P.breath * 0.62);
    // flinch
    if (P.flinch > 0) {
      const f = P.flinch, s = P.flinchSide;
      b.spine.rotation.x -= 0.1 * f;
      b.chest.rotation.z += 0.1 * f * s;
      b.neck.rotation.y += 0.25 * f * s;
      b.head.rotation.z += 0.2 * f * s;
      b.jaw.rotation.x = Math.max(b.jaw.rotation.x, 0.35 * f);
    }
    // tail
    const t = P.t;
    for (let i = 0; i < 10; i++) {
      const bone = b["tail" + i];
      bone.rotation.y = P.tailSway * (0.025 + 0.012 * i) * Math.sin(t * 1.15 - i * 0.48) + P.tailBend * (0.04 + 0.014 * i);
      bone.rotation.x = 0.012 * wa * Math.sin(ph * 2 - i * 0.6) - P.tailLift * 0.03 + P.death * 0.03;
    }
  }

  updateUniforms(dt, time, charge, active, fade) {
    this.PU.uTime.value = time;
    this.PU.uCharge.value = charge;
    this.PU.uActive.value = active;
    this.PU.uFade.value = fade;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.U.uFlash.value = this.flash;
    const wf = this.weakFlash;
    wf.multiplyScalar(Math.max(0, 1 - dt * 5));
    this.PU.uWeakFlash.value.copy(wf);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.body.geometry.dispose();
    this.plates.geometry.dispose();
    this.bodyMat.dispose();
    this.plateMat.dispose();
    this.skeleton.dispose();
  }
}

// ---------------------------------------------------------------- breath beam
const BEAM_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vUv = uv; vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `
uniform float uTime, uInt, uLen, uSpeed, uFreq, uSoft; uniform vec3 uC0, uC1, uC2;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
${GLSL_NOISE}
void main(){
  float ang = vUv.x * 6.2831853;
  vec3 q = vec3(cos(ang) * 1.6, sin(ang) * 1.6, vUv.y * uLen * uFreq - uTime * uSpeed);
  float n = kjN3(q) * 0.6 + kjN3(q * 2.3 + 7.0) * 0.4;
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(facing, uSoft) * smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
  a *= 0.08 + 1.5 * smoothstep(0.3, 0.85, n);
  vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.3, vUv.y + (n - 0.5) * 0.15));
  col = mix(col, uC2, smoothstep(0.3, 0.85, vUv.y + (n - 0.5) * 0.3));
  gl_FragColor = vec4(col * a * uInt, 1.0);
}`;

export class BreathBeam {
  constructor(palette) {
    this.group = new THREE.Group();
    this.group.name = "kaijuBreath";
    const glow = new THREE.Color(palette.glow);
    const mk = (startR, c0, c1, c2, speed, freq, soft) => {
      const g = new THREE.CylinderGeometry(1, startR, 1, 28, 1, true);
      g.translate(0, 0.5, 0);
      g.rotateX(Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uInt: { value: 0 }, uLen: { value: 400 }, uSpeed: { value: speed }, uFreq: { value: freq }, uSoft: { value: soft },
          uC0: { value: c0 }, uC1: { value: c1 }, uC2: { value: c2 },
        },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      return mesh;
    };
    const white = new THREE.Color(1, 1, 1);
    const orange = new THREE.Color(0xff7a2a);
    this.outer = mk(0.04, glow.clone().lerp(white, 0.45).multiplyScalar(1.4), glow.clone().multiplyScalar(1.3), glow.clone().lerp(orange, 0.65).multiplyScalar(0.9), 9, 0.025, 1.6);
    this.inner = mk(0.12, white.clone().multiplyScalar(2.2), glow.clone().lerp(white, 0.6).multiplyScalar(2.0), glow.clone().multiplyScalar(1.4), 16, 0.06, 2.5);
    // mouth glow ball
    const gm = new THREE.ShaderMaterial({
      uniforms: { uC: { value: glow.clone().lerp(white, 0.35) }, uInt: { value: 0 } },
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 uC; uniform float uInt; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uC * f * uInt, 1.0); }",
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), gm);
    this.ball.frustumCulled = false;
    this.ball.renderOrder = 11;
    this.object = new THREE.Group(); // add this to the scene
    this.object.add(this.group, this.ball);
    this._q = new THREE.Quaternion();
    this._z = new THREE.Vector3(0, 0, 1);
  }

  // origin/dir: world; len: beam length; halfAngle: rad; intensity 0..1; glowCharge 0..1 for the mouth ball
  update(origin, dir, len, halfAngle, intensity, time, glowCharge, scale) {
    const on = intensity > 0.001;
    if (!on) {
      this.group.position.copy(origin);
      this.outer.scale.setScalar(1e-4);
      this.inner.scale.setScalar(1e-4);
      this.outer.material.uniforms.uInt.value = 0;
      this.inner.material.uniforms.uInt.value = 0;
    } else {
      this.group.position.copy(origin);
      this.group.quaternion.copy(this._q.setFromUnitVectors(this._z, dir));
      const R = Math.tan(halfAngle) * len;
      this.outer.scale.set(R, R, len);
      this.inner.scale.set(R * 0.32, R * 0.32, len * 0.92);
      for (const m of [this.outer, this.inner]) {
        m.material.uniforms.uTime.value = time;
        m.material.uniforms.uLen.value = len;
      }
      this.outer.material.uniforms.uInt.value = intensity * 0.5;
      this.inner.material.uniforms.uInt.value = intensity * 0.7;
    }
    const g = Math.max(glowCharge, intensity);
    this.ball.position.copy(origin);
    if (g <= 0.01) {
      this.ball.scale.setScalar(1e-4);
      this.ball.material.uniforms.uInt.value = 0;
    } else {
      this.ball.scale.setScalar((1.5 + 3.5 * g) * scale * (0.9 + 0.1 * Math.sin(time * 30)));
      this.ball.material.uniforms.uInt.value = 0.6 + 1.6 * g;
    }
  }

  dispose() {
    this.object.parent?.remove(this.object);
    for (const m of [this.outer, this.inner, this.ball]) { m.geometry.dispose(); m.material.dispose(); }
  }
}
