/**
 * [live-ships] Procedural vessel models. One merged, indexed BufferGeometry per (type, lod), origin at the
 * waterline centre, bow toward +Z, +X = port, drawn with one InstancedMesh each.
 *
 * Hulls are lofted from stations along the length: a plan-view deck line with a rounded or fine bow and a
 * transom stern, a narrower waterline (so the bow flares above it), a bilge / deadrise section below the
 * waterline, a raked stem with a cut-away forefoot and a keel line that rises into the stern run. Rows sit
 * exactly at the boot-top band and the sheer stripe, so the antifouling, boot top, topside paint and
 * stripe meet on clean lines (colour is assigned per quad by row, never by normal). Superstructures,
 * windows, rails, lifeboats, cranes, containers and pipework are merged primitives on top.
 *
 * Per-vertex `aInfo` = (paint, emit):
 *   paint 0 baked colour, 1 per-instance hull colour, 2 per-instance accent (funnel band / stripe / livery),
 *         3.xxx container: colour picked per instance from a palette, the fraction is the box id
 *   emit  0 none, 1 window lit at night, 2 glass (unlit), 3 red / 4 green / 5 white navigation light,
 *         6 blue police light
 * `lod` 1 is the far version: coarse hull, block superstructure, merged container stacks (~1-3k triangles).
 */
import * as THREE from '../../../vendor/three.module.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P_HULL = 1, P_ACC = 2, P_BOX = 3;
const E_LIT = 1, E_GLASS = 2, E_RED = 3, E_GREEN = 4, E_WHITE = 5, E_BLUE = 6;

const COLS = new Map();
function C(hex) {
  let c = COLS.get(hex);
  if (!c) { c = new THREE.Color(hex); COLS.set(hex, c); }
  return c;
}
const WHITE = 0xeef0ee, OFFWHITE = 0xdcdfdc, GLASS = 0x3a5068, STEEL = 0x8a8f94, DARK = 0x2a2c2f, BLACK = 0x16171a;
const ANTIFOUL = 0x8a2a22, BOOT = 0x1d1f22, DECK_GREEN = 0x56654c, DECK_RED = 0x7a3a2c, DECK_GREY = 0x6e7276;
const ORANGE = 0xe8661c, TEAK = 0xa47a4c, RUBBER = 0x1a1a1a, SAIL = 0xf6f5ef, YELLOW = 0xd9a21b;

const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Unit primitives as flat triangle arrays (cached).
// CRITICAL Smooth-Normal Rule: computeVertexNormals() is called BEFORE .toNonIndexed()
// so CylinderGeometry, SphereGeometry, CapsuleGeometry, TorusGeometry, etc. preserve smooth vertex normals.
const UNIT = new Map();
function unit(key, make) {
  let u = UNIT.get(key);
  if (!u) {
    let g = make();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) g = g.toNonIndexed();
    u = { p: g.attributes.position.array, n: g.attributes.normal.array };
    UNIT.set(key, u);
    g.dispose();
  }
  return u;
}
const uBox = () => unit('box', () => new THREE.BoxGeometry(1, 1, 1));
const uCyl = (seg, top = 1, open = false) => unit(`c${seg}_${top}_${open}`, () => new THREE.CylinderGeometry(top, 1, 1, seg, 1, open));
const uSph = (w, h) => unit(`s${w}_${h}`, () => new THREE.SphereGeometry(1, w, h));
const uCap = (seg) => unit(`cap${seg}`, () => new THREE.CapsuleGeometry(0.5, 1, 3, seg));
const uTor = (r, tubeR, rs = 6, ts = 12) => unit(`tor_${r}_${tubeR}_${rs}_${ts}`, () => new THREE.TorusGeometry(r, tubeR, rs, ts));

/** Triangle accumulator. Every triangle is wound to agree with its normals, so the hull loft can't flip. */
class Acc {
  constructor(lod, seed = 1) {
    this.lod = lod;
    this.rnd = rng(seed);
    this.p = []; this.n = []; this.c = []; this.i = [];
  }
  _v(x, y, z, nx, ny, nz, c, pa, em) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.i.push(pa, em);
  }
  tri(a, b, c, na, nb, nc, hex, pa = 0, em = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * gx + gy * gy + gz * gz < 1e-10) return;
    const sx = na[0] + nb[0] + nc[0], sy = na[1] + nb[1] + nc[1], sz = na[2] + nb[2] + nc[2];
    const col = C(hex);
    if (gx * sx + gy * sy + gz * sz < 0) { const t = b; b = c; c = t; const tn = nb; nb = nc; nc = tn; }
    this._v(a[0], a[1], a[2], na[0], na[1], na[2], col, pa, em);
    this._v(b[0], b[1], b[2], nb[0], nb[1], nb[2], col, pa, em);
    this._v(c[0], c[1], c[2], nc[0], nc[1], nc[2], col, pa, em);
  }
  quad(a, b, c, d, na, nb, nc, nd, hex, pa, em) {
    this.tri(a, b, c, na, nb, nc, hex, pa, em);
    this.tri(a, c, d, na, nc, nd, hex, pa, em);
  }
  /** Flat quad with one normal; `two` adds the back face too (sails, flags). */
  fquad(a, b, c, d, n, hex, pa = 0, em = 0, two = false) {
    this.quad(a, b, c, d, n, n, n, n, hex, pa, em);
    if (two) { const m = [-n[0], -n[1], -n[2]]; this.quad(a, b, c, d, m, m, m, m, hex, pa, em); }
  }
  unit(u, m, hex, pa = 0, em = 0) {
    _nm.getNormalMatrix(m);
    const e = m.elements, ne = _nm.elements, col = C(hex);
    const flip = m.determinant() < 0;
    const P = u.p, N = u.n;
    for (let t = 0; t < P.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        const o = t + (flip ? (k === 0 ? 0 : k === 1 ? 6 : 3) : k * 3);
        const x = P[o], y = P[o + 1], z = P[o + 2];
        const nx = N[o], ny = N[o + 1], nz = N[o + 2];
        let mx = ne[0] * nx + ne[3] * ny + ne[6] * nz, my = ne[1] * nx + ne[4] * ny + ne[7] * nz, mz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(mx, my, mz) || 1;
        mx /= l; my /= l; mz /= l;
        this._v(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], mx, my, mz, col, pa, em);
      }
    }
  }
  /** Box with its base at y. o: { rx, ry, rz, pa, em } */
  box(w, h, d, x, y, z, hex, o = {}) {
    this.unit(uBox(), M(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0, w, h, d), hex, o.pa || 0, o.em || 0);
  }
  /** Vertical cylinder from y to y + h. o: { top (radius ratio), seg, open, pa, em, sx (x squash) } */
  cyl(r, h, x, y, z, hex, o = {}) {
    const seg = o.seg || (this.lod ? 6 : 12);
    this.unit(uCyl(seg, o.top ?? 1, !!o.open), M(x, y + h / 2, z, 0, o.ry || 0, 0, r * (o.sx || 1), h, r), hex, o.pa || 0, o.em || 0);
  }
  /** Cylinder between two points. */
  rod(a, b, r, hex, seg = 6, o = {}) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _a.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(_UP, _a.multiplyScalar(1 / len));
    _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(r, len, r));
    this.unit(uCyl(seg, o.top ?? 1, !!o.open), _m, hex, o.pa || 0, o.em || 0);
  }
  sphere(rx, ry, rz, x, y, z, hex, o = {}) {
    const w = o.w || (this.lod ? 6 : 12), h = o.h || (this.lod ? 4 : 8);
    this.unit(uSph(w, h), M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, rx, ry, rz), hex, o.pa || 0, o.em || 0);
  }
  /** Capsule lying along Z (length = overall length). */
  capsule(r, len, x, y, z, hex, o = {}) {
    this.unit(uCap(o.seg || (this.lod ? 6 : 10)), M(x, y, z, Math.PI / 2, o.ry || 0, 0, r * 2 * (o.sx || 1), len / 2, r * 2 * (o.sy || 1)), hex, o.pa || 0, o.em || 0);
  }
  /** Torus (for lifebuoys, tire fenders, steering wheels). */
  torus(r, tubeR, x, y, z, hex, o = {}) {
    this.unit(uTor(r, tubeR, o.rs || 6, o.ts || 12), M(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, 1, 1, 1), hex, o.pa || 0, o.em || 0);
  }
  /**
   * Vertical prism over a plan polygon [[x, z], ...] from y to y + h. o: { taper (top scale), top (cap colour),
   * bottom, pa, topPa, em, dx/dz (top offset, raked funnels), smooth (smooth normals across gentle corners) }
   */
  prism(pts, y, h, hex, o = {}) {
    const n = pts.length;
    let cx = 0, cz = 0, area = 0;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      cx += a[0]; cz += a[1];
      area += a[0] * b[1] - b[0] * a[1];
    }
    cx /= n; cz /= n;
    const tp = o.taper ?? 1, dx = o.dx || 0, dz = o.dz || 0;
    const top = pts.map((p) => [cx + (p[0] - cx) * tp + dx, cz + (p[1] - cz) * tp + dz]);
    const sgn = area > 0 ? 1 : -1;
    const edgeNrm = [];
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      edgeNrm.push([(-ez / l) * sgn, 0, (ex / l) * sgn]);
    }
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n], at = top[k], bt = top[(k + 1) % n];
      const nCur = edgeNrm[k];
      const nPrev = edgeNrm[(k + n - 1) % n];
      const nNext = edgeNrm[(k + 1) % n];
      let na = nCur, nb = nCur;
      if (o.smooth !== false) {
        if (nCur[0] * nPrev[0] + nCur[2] * nPrev[2] > 0.65) {
          const sx = nCur[0] + nPrev[0], sz = nCur[2] + nPrev[2], sl = Math.hypot(sx, sz) || 1;
          na = [sx / sl, 0, sz / sl];
        }
        if (nCur[0] * nNext[0] + nCur[2] * nNext[2] > 0.65) {
          const sx = nCur[0] + nNext[0], sz = nCur[2] + nNext[2], sl = Math.hypot(sx, sz) || 1;
          nb = [sx / sl, 0, sz / sl];
        }
      }
      this.quad([a[0], y, a[1]], [b[0], y, b[1]], [bt[0], y + h, bt[1]], [at[0], y + h, at[1]], na, nb, nb, na, hex, o.pa || 0, o.em || 0);
    }
    const contour = top.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const up = [0, 1, 0], dn = [0, -1, 0];
    const capHex = o.top ?? hex, capPa = o.topPa ?? o.pa ?? 0;
    for (const t of tris) {
      const A = top[t[0]], B = top[t[1]], Cc = top[t[2]];
      this.tri([A[0], y + h, A[1]], [B[0], y + h, B[1]], [Cc[0], y + h, Cc[1]], up, up, up, capHex, capPa, 0);
      if (o.bottom) this.tri([pts[t[0]][0], y, pts[t[0]][1]], [pts[t[1]][0], y, pts[t[1]][1]], [pts[t[2]][0], y, pts[t[2]][1]], dn, dn, dn, hex, o.pa || 0, 0);
    }
  }
  /** Vertical window / panel quad centred at (x, y, z) facing yaw `ang` (0 = +Z). tilt leans the top back. */
  panel(x, y, z, w, h, ang, hex, em = 0, tilt = 0, pa = 0) {
    const fx = Math.sin(ang), fz = Math.cos(ang), tx = Math.cos(ang), tz = -Math.sin(ang);
    const hw = w / 2, hh = h / 2, bk = tilt * hh;
    const a = [x - tx * hw + fx * bk, y - hh, z - tz * hw + fz * bk];
    const b = [x + tx * hw + fx * bk, y - hh, z + tz * hw + fz * bk];
    const c = [x + tx * hw - fx * bk, y + hh, z + tz * hw - fz * bk];
    const d = [x - tx * hw - fx * bk, y + hh, z - tz * hw - fz * bk];
    const l = Math.hypot(1, tilt);
    this.fquad(a, b, c, d, [fx / l, tilt / l, fz / l], hex, pa, em);
  }
  /** Row of windows along a wall at constant x (side = +1 port / -1 starboard) from z0 to z1. */
  winX(x, side, z0, z1, y, w, h, pitch, lit = 0.55, hex = GLASS) {
    const n = Math.max(1, Math.floor((z1 - z0) / pitch));
    const off = (z1 - z0 - (n - 1) * pitch) / 2;
    for (let k = 0; k < n; k++) {
      this.panel(x + side * 0.03, y, z0 + off + k * pitch, w, h, side > 0 ? Math.PI / 2 : -Math.PI / 2, hex, this.rnd() < lit ? E_LIT : E_GLASS);
    }
  }
  /** Row of windows along a wall at constant z (dir = +1 facing bow, -1 facing stern) from x0 to x1. */
  winZ(z, dir, x0, x1, y, w, h, pitch, lit = 0.55, hex = GLASS, tilt = 0) {
    const n = Math.max(1, Math.floor((x1 - x0) / pitch));
    const off = (x1 - x0 - (n - 1) * pitch) / 2;
    for (let k = 0; k < n; k++) {
      this.panel(x0 + off + k * pitch, y, z + dir * 0.03, w, h, dir > 0 ? 0 : Math.PI, hex, this.rnd() < lit ? E_LIT : E_GLASS, tilt);
    }
  }
  /** Guard rail along a polyline of deck points [[x, y, z], ...]: posts, top and mid rails. */
  rail(pts, h = 1.1, hex = WHITE, step = 2.2) {
    if (this.lod) return;
    const r = 0.035;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      this.rod([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], r, hex, 4);
      this.rod([a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], r * 0.7, hex, 4);
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(L / step));
      for (let s = 0; s < n; s++) {
        const t = s / n;
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        this.rod([x, y, z], [x, y + h, z], r, hex, 4);
      }
    }
    const e = pts[pts.length - 1];
    this.rod([e[0], e[1], e[2]], [e[0], e[1] + h, e[2]], r, hex, 4);
  }
  build() {
    const P = this.p, N = this.n, Cc = this.c, I = this.i;
    const map = new Map(), idx = [];
    const op = [], on = [], oc = [], oi = [];
    const q = (v, s) => Math.round(v * s);
    for (let v = 0; v < P.length / 3; v++) {
      const v3 = v * 3, v2 = v * 2;
      const key = `${q(P[v3], 500)},${q(P[v3 + 1], 500)},${q(P[v3 + 2], 500)},${q(N[v3], 64)},${q(N[v3 + 1], 64)},${q(N[v3 + 2], 64)},${q(Cc[v3], 255)},${q(Cc[v3 + 1], 255)},${q(Cc[v3 + 2], 255)},${I[v2]},${I[v2 + 1]}`;
      let k = map.get(key);
      if (k === undefined) {
        k = op.length / 3;
        map.set(key, k);
        op.push(P[v3], P[v3 + 1], P[v3 + 2]); on.push(N[v3], N[v3 + 1], N[v3 + 2]); oc.push(Cc[v3], Cc[v3 + 1], Cc[v3 + 2]); oi.push(I[v2], I[v2 + 1]);
      }
      idx.push(k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(on, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(oc, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(oi, 2));
    g.setIndex(op.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Lofted hull with smooth flared bow stem, red anti-fouling lower hull, boot-top stripe,
 * waterline/sheer rubbing strake, and framed stern transom.
 */
function hull(A, s) {
  const lod = A.lod;
  const { L, B, T, D } = s;
  const hb = B / 2, bow = s.bow ?? 0.2, stern = s.stern ?? 0.14, tr = s.transom ?? 0.75;
  const deckY = (u) => D - T + (s.sheerF || 0) * Math.pow(Math.max(0, (u - 0.45) / 0.55), 2) + (s.sheerA || 0) * Math.pow(Math.max(0, (0.45 - u) / 0.45), 2);
  const keelY = (u) => {
    let k = -T;
    const run = s.run ?? 0.12;
    if (u < run) k += T * (s.runRise ?? 0.8) * sm((run - u) / run);
    const ff = s.ff ?? 0.07;
    if (u > 1 - ff) k += T * (s.ffRise ?? 0.45) * Math.pow((u - (1 - ff)) / ff, 2);
    return k;
  };
  const hbDeck = (u) => {
    if (u > 1 - bow) { const t = (u - (1 - bow)) / bow; return hb * Math.pow(Math.max(0, 1 - Math.pow(t, s.bowP ?? 2.2)), s.bowQ ?? 0.6); }
    if (u < stern) { const t = 1 - u / stern; return hb * (1 - (1 - tr) * t * t); }
    return hb;
  };
  const hbWL = (u) => {
    const b2 = Math.min(0.6, bow * (s.entry ?? 1.25));
    let w = hb * (s.wlB ?? 1);
    if (u > 1 - b2) { const t = (u - (1 - b2)) / b2; w *= Math.pow(Math.max(0, 1 - Math.pow(t, s.wlP ?? 1.7)), s.wlQ ?? 0.8); }
    const st = stern * 1.7;
    if (u < st) { const t = 1 - u / st; w *= 1 - (1 - (s.trW ?? tr * 0.8)) * t * t; }
    return Math.min(w, hbDeck(u));
  };
  const width = (u, y) => {
    const k = keelY(u), wl = hbWL(u);
    if (y <= 0) {
      const yn = k >= -1e-3 ? 1 : clamp01((y - k) / -k);
      const q = s.q ?? 5, f = s.flat ?? 0.55;
      return wl * (f + (1 - f) * Math.pow(1 - Math.pow(1 - yn, q), 1 / q));
    }
    const yn = Math.min(1, y / deckY(u));
    return wl + (hbDeck(u) - wl) * Math.pow(yn, s.flareP ?? 1.5);
  };
  const zAt = (u, y) => {
    let z = -L / 2 + u * L;
    z += (s.rake ?? 0.3) * y * sm((u - (1 - bow)) / bow);
    z -= (s.sRake ?? 0.1) * y * sm((stern * 0.5 - u) / (stern * 0.5));
    return z;
  };
  const [bLo, bHi] = s.boot || [Math.min(1.2, T * 0.12), Math.min(1.0, (D - T) * 0.1)];
  const rowsB = lod ? [0, 0.35, 1] : [0, 0.04, 0.12, 0.25, 0.45, 0.72, 1];
  const rows = [];
  const reg = [];
  for (let k = 0; k < rowsB.length; k++) {
    const f = rowsB[k];
    rows.push((u) => Math.max(keelY(u), -T + f * (T - bLo)));
    reg.push(k === rowsB.length - 1 ? 'boot' : 'bottom');
  }
  rows.push(() => 0); reg.push('boot');
  rows.push(() => bHi); reg.push('top');
  const fr = lod ? [0.5] : [0.2, 0.42, 0.62, 0.8];
  let fa = fr.slice();
  if (s.stripe) fa.push(s.stripe[0], s.stripe[1]);
  fa = [...new Set(fa)].sort((a, b) => a - b);
  for (const f of fa) {
    rows.push((u) => bHi + f * (deckY(u) - bHi));
    reg.push(s.stripe && f >= s.stripe[0] && f < s.stripe[1] ? 'stripe' : 'top');
  }
  rows.push((u) => deckY(u)); reg.push('none');
  const nU = lod ? (s.nUf || 16) : (s.nU || 56);
  const us = [];
  for (let i = 0; i < nU; i++) { const t = i / (nU - 1); us.push(0.3 * t + 0.7 * (0.5 - 0.5 * Math.cos(Math.PI * t))); }
  const R = rows.length;
  const G = us.map((u) => rows.map((f) => { const y = f(u); return [width(u, y), y, zAt(u, y)]; }));
  // Smooth normals: area-weighted over the starboard-side grid.
  const Nn = us.map(() => rows.map(() => [0, 0, 0]));
  const acc = (n, x, y, z) => { n[0] += x; n[1] += y; n[2] += z; };
  for (let i = 0; i < nU - 1; i++) {
    for (let j = 0; j < R - 1; j++) {
      const a = G[i][j], b = G[i + 1][j], c = G[i + 1][j + 1], d = G[i][j + 1];
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) acc(Nn[ii][jj], nx, ny, nz);
    }
  }
  const mi = Math.floor(nU / 2), mj = Math.floor(R / 2);
  const sg = Nn[mi][mj][0] < 0 ? -1 : 1;
  for (const col of Nn) for (const n of col) { const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] *= sg / l; n[1] *= sg / l; n[2] *= sg / l; }
  const top = s.topPa ?? P_HULL;
  const regCol = (r) => r === 'bottom' ? [s.bottom ?? ANTIFOUL, 0] : r === 'boot' ? [s.bootC ?? BOOT, 0] : r === 'stripe' ? [s.stripeC ?? WHITE, s.stripePa ?? P_ACC] : [s.topC ?? WHITE, top];
  for (const side of [1, -1]) {
    const X = (p) => [p[0] * side, p[1], p[2]];
    const Nx = (n) => [n[0] * side, n[1], n[2]];
    for (let i = 0; i < nU - 1; i++) {
      for (let j = 0; j < R - 1; j++) {
        const [hex, pa] = regCol(reg[j]);
        A.quad(X(G[i][j]), X(G[i + 1][j]), X(G[i + 1][j + 1]), X(G[i][j + 1]), Nx(Nn[i][j]), Nx(Nn[i + 1][j]), Nx(Nn[i + 1][j + 1]), Nx(Nn[i][j + 1]), hex, pa, 0);
      }
    }
  }
  const up = [0, 1, 0], dn = [0, -1, 0], aft = [0, 0, -1];
  const deckHex = s.deck ?? DECK_GREY;
  for (let i = 0; i < nU - 1; i++) {
    const a = G[i][R - 1], b = G[i + 1][R - 1];
    A.fquad([-a[0], a[1], a[2]], [a[0], a[1], a[2]], [b[0], b[1], b[2]], [-b[0], b[1], b[2]], up, deckHex);
    const c = G[i][0], d = G[i + 1][0];
    A.fquad([-c[0], c[1], c[2]], [c[0], c[1], c[2]], [d[0], d[1], d[2]], [-d[0], d[1], d[2]], dn, s.bottom ?? ANTIFOUL);
  }
  for (let j = 0; j < R - 1; j++) {
    const a = G[0][j], b = G[0][j + 1];
    const [hex, pa] = regCol(reg[j]);
    A.fquad([-a[0], a[1], a[2]], [a[0], a[1], a[2]], [b[0], b[1], b[2]], [-b[0], b[1], b[2]], aft, hex, pa);
  }
  // Stern transom top coaming lip & sheer rubbing strake on lod 0
  if (!lod) {
    const stTop = G[0][R - 1];
    const rStrake = Math.max(0.035, Math.min(0.22, B * 0.006));
    const strakeCol = s.strakeC ?? (s.topC === WHITE ? BOOT : WHITE);
    A.rod([-stTop[0], stTop[1] - rStrake, stTop[2] - rStrake * 0.4], [stTop[0], stTop[1] - rStrake, stTop[2] - rStrake * 0.4], rStrake, strakeCol, 5);
    for (const side of [1, -1]) {
      for (let i = 0; i < nU - 1; i += 2) {
        const a = G[i][R - 1], b = G[Math.min(nU - 1, i + 2)][R - 1];
        A.rod([a[0] * side, a[1] - rStrake * 1.2, a[2]], [b[0] * side, b[1] - rStrake * 1.2, b[2]], rStrake * 0.75, strakeCol, 4);
      }
    }
  }
  const ez = G.map((c) => c[R - 1][2]), ex = G.map((c) => c[R - 1][0]), ey = G.map((c) => c[R - 1][1]);
  const edge = (z) => {
    if (z <= ez[0]) return [ex[0], ey[0]];
    for (let i = 0; i < nU - 1; i++) {
      if (z <= ez[i + 1]) { const t = (z - ez[i]) / (ez[i + 1] - ez[i] || 1); return [ex[i] + (ex[i + 1] - ex[i]) * t, ey[i] + (ey[i + 1] - ey[i]) * t]; }
    }
    return [0, ey[nU - 1]];
  };
  const H = { edge, deckY: (z) => edge(z)[1], zBow: ez[nU - 1], zStern: ez[0], G, R };
  if (s.bulwark) bulwark(A, H, s.bulwark, s);
  return H;
}

/** Bulwark (solid deck-edge wall) from deck station z0 to z1, outer face in hull paint. */
function bulwark(A, H, bw, s) {
  const { G, R } = H;
  const h = bw.h, inner = bw.inner ?? OFFWHITE, t = bw.t ?? 0.25;
  const pts = [];
  for (const c of G) { const p = c[R - 1]; if (p[2] >= bw.from && p[2] <= (bw.to ?? 1e9)) pts.push(p); }
  for (const side of [1, -1]) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const ax = a[0] * side, bx = b[0] * side;
      const dzx = b[2] - a[2], dxx = bx - ax, l = Math.hypot(dzx, dxx) || 1;
      let nx = dzx / l * side, nz = -dxx / l * side;
      if (nx * side < 0) { nx = -nx; nz = -nz; }
      const ia = Math.max(0, a[0] - t) * side, ib = Math.max(0, b[0] - t) * side;
      A.fquad([ax, a[1], a[2]], [bx, b[1], b[2]], [bx, b[1] + h, b[2]], [ax, a[1] + h, a[2]], [nx, 0, nz], s.topC ?? WHITE, s.topPa ?? P_HULL);
      A.fquad([ia, a[1], a[2]], [ib, b[1], b[2]], [ib, b[1] + h, b[2]], [ia, a[1] + h, a[2]], [-nx, 0, -nz], inner);
      A.fquad([ax, a[1] + h, a[2]], [bx, b[1] + h, b[2]], [ib, b[1] + h, b[2]], [ia, a[1] + h, a[2]], [0, 1, 0], bw.cap ?? inner);
    }
  }
}

// ------------------------------------------------------------------ shared parts

/** Plan outline of a deckhouse: rectangle with chamfered (or rounded) forward corners. */
function housePts(hw, z0, z1, ch = 0, round = 0) {
  if (round > 0) {
    const pts = [[-hw, z0], [hw, z0]];
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI / 2;
      pts.push([hw - round + Math.cos(a) * round, z1 - round + Math.sin(a) * round]);
    }
    for (let k = 0; k <= n; k++) {
      const a = Math.PI / 2 + (k / n) * Math.PI / 2;
      pts.push([-hw + round + Math.cos(a) * round, z1 - round + Math.sin(a) * round]);
    }
    return pts;
  }
  return ch > 0 ? [[-hw, z0], [hw, z0], [hw, z1 - ch], [hw - ch, z1], [-hw + ch, z1], [-hw, z1 - ch]] : [[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]];
}

/** White spherical satellite communications radome on a pedestal base. */
function satcom(A, x, y, z, r = 0.85) {
  if (A.lod) return;
  A.cyl(r * 0.48, r * 0.55, x, y, z, OFFWHITE, { seg: 8, top: 0.85 });
  A.sphere(r, r * 1.02, r, x, y + r * 1.32, z, WHITE, { w: 12, h: 10 });
}

/** Orange/white life-ring buoy mounted on a railing or bulkhead. */
function lifebuoy(A, x, y, z, yaw = 0, r = 0.36) {
  if (A.lod) return;
  A.torus(r, r * 0.28, x, y, z, ORANGE, { ry: yaw, rs: 6, ts: 10 });
}

/** White cylindrical inflatable liferaft canister in a deck cradle. */
function liferaft(A, x, y, z, r = 0.45, len = 1.35) {
  if (A.lod) return;
  A.box(r * 1.4, r * 0.5, len * 0.7, x, y, z, STEEL);
  A.capsule(r, len, x, y + r * 1.15, z, WHITE, { seg: 8 });
  A.box(r * 2.05, r * 2.05, 0.08, x, y + r * 0.15, z, BLACK);
}

/**
 * Accommodation block: `tiers` decks of height th on y, each with a row of windows on all four sides,
 * a deck-edge lip per tier, exterior inclined companionway ladders on the aft face, and an optional bridge on top.
 */
function accommodation(A, o) {
  const { hw, z0, z1, y, tiers, th } = o;
  const hex = o.hex ?? WHITE, pa = o.pa ?? 0;
  const lod = A.lod;
  for (let t = 0; t < tiers; t++) {
    const yy = y + t * th;
    const ins = (o.step || 0) * t;
    const pts = housePts(hw - ins * 0.3, z0 + ins * 0.5, z1 - ins, o.ch || 0);
    A.prism(pts, yy, th, hex, { pa, top: o.deck ?? DECK_GREY });
    const zz0 = z0 + ins * 0.5, zz1 = z1 - ins, hh = hw - ins * 0.3;
    if (lod) {
      for (const sd of [1, -1]) A.box(0.05, th * 0.32, (zz1 - zz0) * 0.9, sd * (hh + 0.02), yy + th * 0.42, (zz0 + zz1) / 2, GLASS, { em: t % 2 ? E_LIT : E_GLASS });
      A.box(hh * 2 * 0.85, th * 0.32, 0.05, 0, yy + th * 0.42, zz1 + 0.02, GLASS, { em: E_LIT });
      A.box(hh * 2 + 0.3, 0.18, zz1 - zz0 + 0.3, 0, yy + th - 0.05, (zz0 + zz1) / 2, hex, { pa });
      continue;
    }
    const wy = yy + th * 0.55, wh = th * 0.36, ww = Math.min(1.4, th * 0.45);
    for (const sd of [1, -1]) A.winX(sd * hh, sd, zz0 + 1, zz1 - 1 - (o.ch || 0), wy, ww, wh, ww * 1.9, o.lit ?? 0.55);
    A.winZ(zz1, 1, -hh + 1 + (o.ch || 0), hh - 1 - (o.ch || 0), wy, ww, wh, ww * 1.9, o.lit ?? 0.55);
    A.winZ(zz0, -1, -hh + 1, hh - 1, wy, ww, wh, ww * 1.9, o.lit ?? 0.55);
    A.box(hh * 2 + 0.3, 0.18, zz1 - zz0 + 0.3, 0, yy + th - 0.05, (zz0 + zz1) / 2, hex, { pa });
    const sx = (t % 2 ? 1 : -1) * (hh * 0.55);
    A.rod([sx - 0.7, yy, zz0 - 0.45], [sx + 0.7, yy + th, zz0 - 0.45], 0.09, STEEL, 4);
    if (t === 1) {
      for (const sd of [1, -1]) liferaft(A, sd * (hh - 0.6), yy + th, zz0 + 1.5, 0.48, 1.4);
    }
  }
  const yb = y + tiers * th;
  if (o.bridge) bridge(A, { ...o, y: yb, z0: o.bz0 ?? z0 + (z1 - z0) * 0.25, z1: z1 - (o.step || 0) * tiers, hw: hw - (o.step || 0) * tiers * 0.3 });
  return yb;
}

/** Wheelhouse with a raked wrap-around window band, enclosed/open bridge wings, satcom radomes, and radar mast. */
function bridge(A, o) {
  const { hw, z0, z1, y } = o;
  const h = o.bh ?? 3.2, hex = o.hex ?? WHITE, pa = o.pa ?? 0;
  A.prism(housePts(hw, z0, z1, o.ch ?? 1.2), y, h, hex, { pa, top: o.roof ?? OFFWHITE });
  const wy = y + h * 0.62, wh = h * 0.42;
  if (A.lod) {
    A.box(hw * 2 * 0.9, wh, 0.06, 0, wy - wh / 2, z1 + 0.03, GLASS, { em: E_LIT });
  } else {
    const n = Math.max(3, Math.round(hw * 2 / 1.6));
    const w = (hw * 2 - 2 * (o.ch ?? 1.2)) / n;
    for (let k = 0; k < n; k++) A.panel(-hw + (o.ch ?? 1.2) + w * (k + 0.5), wy, z1 + 0.05, w * 0.9, wh, 0, GLASS, E_LIT, -0.18);
    for (const sd of [1, -1]) A.winX(sd * hw, sd, z0 + 1, z1 - (o.ch ?? 1.2) - 0.4, wy, 1.3, wh, 1.6, 0.8);
    A.box(hw * 2 + 0.6, 0.25, z1 - z0 + 0.6, 0, y + h, (z0 + z1) / 2, hex, { pa });
    const rSat = Math.max(0.45, Math.min(1.05, hw * 0.07));
    for (const sd of [1, -1]) satcom(A, sd * hw * 0.62, y + h + 0.25, (z0 + z1) / 2 + 0.4, rSat);
  }
  const wing = o.wing ?? hw;
  if (wing > hw + 0.5) {
    for (const sd of [1, -1]) {
      const wl = wing - hw;
      A.box(wl, 0.35, 3.2, sd * (hw + wl / 2), y - 0.35, z1 - 1.8, hex, { pa });
      A.prism([[sd * hw, z1 - 2.2], [sd * (wing - 0.3), z1 - 2.2], [sd * hw, z1 - 1.4]], y - 2.1, 1.75, hex, { pa });
      if (!A.lod) {
        A.box(0.12, 1.1, 3.2, sd * (wing - 0.06), y, z1 - 1.8, hex, { pa });
        A.panel(sd * (hw + wl * 0.5), y + 1.45, z1 - 0.2, wl * 0.92, 0.72, 0, GLASS, E_GLASS, -0.15);
        A.rail([[sd * hw, y, z1 - 0.2], [sd * (wing - 0.1), y, z1 - 0.2]], 1.1, hex);
        A.rail([[sd * hw, y, z1 - 3.4], [sd * (wing - 0.1), y, z1 - 3.4]], 1.1, hex);
        A.box(0.8, 1.2, 0.8, sd * (wing - 0.7), y, z1 - 1.8, DARK);
        A.cyl(0.22, 0.35, sd * (wing - 1.5), y + 0.8, z1 - 1.0, STEEL, { seg: 8 });
        A.box(0.25, 0.25, 0.25, sd * (wing - 0.1), y + 1.3, z1 - 0.9, sd > 0 ? 0xc02020 : 0x20a040, { em: sd > 0 ? E_RED : E_GREEN });
      }
    }
  }
  if (o.mast !== false) mast(A, 0, y + h + 0.2, (z0 + z1) / 2 - 1, o.mastH ?? 6, hw);
}

function mast(A, x, y, z, h, span = 3) {
  A.cyl(0.22, h, x, y, z, OFFWHITE, { top: 0.6, seg: 10 });
  A.box(Math.min(span * 1.4, 7), 0.2, 0.3, x, y + h * 0.6, z, OFFWHITE);
  A.sphere(0.25, 0.25, 0.25, x, y + h + 0.2, z, 0xffffff, { em: E_WHITE });
  if (!A.lod) {
    for (const [dz, len, hh] of [[1.5, 4.2, h * 0.35], [-1.2, 3.0, h * 0.75]]) {
      A.cyl(0.18, 0.6, x, y + hh, z + dz, DARK, { seg: 8 });
      A.box(len, 0.22, 0.35, x, y + hh + 0.6, z + dz, WHITE);
    }
    if (h >= 5) satcom(A, x, y + h * 0.48, z + 0.9, Math.min(0.55, span * 0.12));
    A.rod([x, y + h * 0.6, z], [x + 1.2, y + h * 0.85, z - 0.2], 0.04, DARK, 4);
    A.rod([x, y + h * 0.6, z], [x - 1.2, y + h * 0.95, z - 0.2], 0.04, DARK, 4);
  }
}

/** Funnel: raked, smooth stadium-section stack with shipping-line accent band, side louvers, and exhaust pipes. */
function funnel(A, x, y, z, w, d, h, o = {}) {
  const pts = [];
  const r = w / 2, n = A.lod ? 4 : 8;
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI; pts.push([x + Math.cos(a) * r, z + (d / 2 - r) + Math.sin(a) * r]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI + (k / n) * Math.PI; pts.push([x + Math.cos(a) * r, z - (d / 2 - r) + Math.sin(a) * r]); }
  const rk = o.rake ?? 0.12;
  const hb = h * 0.68, hc = h * 0.22;
  A.prism(pts, y, hb, o.hex ?? WHITE, { taper: 0.97, dz: -hb * rk, pa: o.pa ?? 0, smooth: true });
  const p2 = pts.map((p) => [x + (p[0] - x) * 0.97, p[1] - hb * rk]);
  A.prism(p2, y + hb, hc, o.band ?? 0x1f5fa8, { taper: 0.98, dz: -hc * rk, pa: o.bandPa ?? P_ACC, smooth: true });
  const p3 = p2.map((p) => [x + (p[0] - x) * 0.98, p[1] - hc * rk]);
  A.prism(p3, y + hb + hc, h - hb - hc, BLACK, { taper: 0.98, dz: -(h - hb - hc) * rk, smooth: true });
  if (!A.lod) {
    const zt = z - h * rk;
    for (const dx of [-w * 0.18, w * 0.18]) {
      A.cyl(Math.min(0.6, w * 0.11), 1.6, x + dx, y + h - 0.2, zt + 0.6, DARK, { seg: 10 });
      A.cyl(Math.min(0.45, w * 0.08), 1.3, x + dx * 0.5, y + h - 0.2, zt - 0.8, DARK, { seg: 8 });
    }
    for (const sd of [1, -1]) {
      A.panel(x + sd * (r * 0.98), y + hb * 0.55, z - hb * rk * 0.5, d * 0.35, hb * 0.28, sd * Math.PI / 2, DARK);
    }
  }
}

/** Enclosed lifeboat (orange hull, white canopy) with gravity davits; side = +1 port / -1 starboard. */
function lifeboat(A, x, y, z, len, side, davit = true) {
  const r = len * 0.17;
  A.capsule(r, len, x, y + r, z, ORANGE, { sy: 0.8, seg: A.lod ? 6 : 12 });
  if (!A.lod) {
    A.capsule(r * 0.82, len * 0.86, x, y + r * 1.35, z, WHITE, { sy: 0.7, seg: 10 });
    A.box(r * 0.9, r * 0.6, len * 0.22, x, y + r * 1.9, z - len * 0.18, ORANGE);
    A.box(r * 0.92, r * 0.25, len * 0.18, x, y + r * 2.1, z - len * 0.18, GLASS, { em: E_GLASS });
  }
  if (davit && !A.lod) {
    for (const dz of [-len * 0.32, len * 0.32]) {
      A.rod([x - side * r * 1.6, y - 1.2, z + dz], [x - side * r * 1.6, y + r * 3.2, z + dz], 0.12, OFFWHITE, 6);
      A.rod([x - side * r * 1.6, y + r * 3.2, z + dz], [x, y + r * 3.4, z + dz], 0.1, OFFWHITE, 6);
      A.rod([x, y + r * 3.4, z + dz], [x, y + r * 2.2, z + dz], 0.025, DARK, 4);
    }
  }
}

/** Deck crane: pedestal, slewing house, lattice/box boom raised at `lift`, luffing/hoist wires & hook block. */
function crane(A, x, y, z, o = {}) {
  const h = o.h ?? 6, boom = o.boom ?? 22, yaw = o.yaw ?? 0, lift = o.lift ?? 0.6, hex = o.hex ?? YELLOW;
  A.cyl(o.r ?? 1.3, h, x, y, z, hex, { seg: 12, pa: o.pa ?? 0 });
  const yh = y + h;
  A.prism(housePts(1.6, -1.8, 1.8, 0.4).map((p) => [x + p[0] * Math.cos(yaw) + p[1] * Math.sin(yaw), z - p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw)]), yh, 2.6, hex, { pa: o.pa ?? 0 });
  if (!A.lod) A.panel(x + Math.sin(yaw) * 1.85, yh + 1.7, z + Math.cos(yaw) * 1.85, 1.6, 0.9, yaw, GLASS, E_LIT, -0.1);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), tx = Math.cos(yaw), tz = -Math.sin(yaw);
  const ca = Math.cos(lift), sa = Math.sin(lift);
  const tip = [x + fx * boom * ca, yh + 1.2 + boom * sa, z + fz * boom * ca];
  for (const sd of [-0.45, 0.45]) {
    A.rod([x + tx * sd + fx * 0.8, yh + 1.0, z + tz * sd + fz * 0.8], [tip[0] + tx * sd * 0.4, tip[1], tip[2] + tz * sd * 0.4], 0.22, hex, A.lod ? 4 : 6, { pa: o.pa ?? 0 });
  }
  if (!A.lod) {
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const px = x + fx * (0.8 + (boom - 0.8) * t * ca), py = yh + 1.0 + boom * sa * t, pz = z + fz * (0.8 + (boom - 0.8) * t * ca);
      A.rod([px + tx * 0.45 * (1 - t * 0.6), py, pz + tz * 0.45 * (1 - t * 0.6)], [px - tx * 0.45 * (1 - t * 0.6), py, pz - tz * 0.45 * (1 - t * 0.6)], 0.07, hex, 4);
    }
    A.rod([x, yh + 2.6, z], tip, 0.04, DARK, 4);
    A.rod(tip, [tip[0], tip[1] - (o.drop ?? 8), tip[2]], 0.03, DARK, 4);
    A.box(0.65, 0.85, 0.65, tip[0], tip[1] - (o.drop ?? 8) - 0.85, tip[2], DARK);
  }
}

/** Navigation lights: port red / starboard green sidelights and a stern light. */
function navLights(A, hw, y, z, zs, ys, k = 0.3) {
  if (A.lod) return;
  A.box(k * 0.6, k, k, hw, y, z, 0xc02020, { em: E_RED });
  A.box(k * 0.6, k, k, -hw, y, z, 0x20a040, { em: E_GREEN });
  A.box(k, k, k, 0, ys, zs, 0xffffff, { em: E_WHITE });
}

/** Mooring deck gear on a forecastle / poop: windlasses, anchor chains, bitts, fairleads. */
function mooring(A, H, z, dir, n = 2) {
  if (A.lod) return;
  const [hb, y] = H.edge(z);
  for (const sd of [1, -1]) {
    const x = sd * hb * 0.42;
    A.cyl(0.9, 1.2, x, y, z, DARK, { seg: 10 });
    A.box(1.6, 1.0, 1.8, x, y, z - dir * 1.6, 0x3a6a4a);
    A.rod([x, y + 0.6, z], [sd * hb * 0.62, y + 0.1, z + dir * 4.5], 0.16, BLACK, 5);
    for (let k = 0; k < n; k++) {
      const zz = z - dir * (4 + k * 5);
      const [hb2, y2] = H.edge(zz);
      for (const dx of [-0.5, 0.5]) A.cyl(0.32, 0.9, sd * (hb2 - 1.4) + dx, y2, zz, BLACK, { seg: 8 });
    }
  }
}

/** Anchors stowed in their hawse pockets on both bow flanks; k = size scale (1 ~ a 200 m ship). */
function anchors(A, H, z, k) {
  if (A.lod) return;
  const [hb, y] = H.edge(z);
  const yy = y - 3.2 * k;
  for (const sd of [1, -1]) {
    const x = sd * (hb + 0.05);
    A.sphere(0.32 * k, 1.15 * k, 1.05 * k, x, yy, z, 0x1a1c1e, { w: 10, h: 8 });
    A.cyl(0.55 * k, 0.18 * k, x, yy, z, WHITE, { rz: Math.PI / 2, seg: 10 });
    A.box(0.3 * k, 1.65 * k, 0.35 * k, x + sd * 0.16 * k, yy - 0.6 * k, z, 0x1a1b1d);
    A.box(0.32 * k, 0.38 * k, 1.55 * k, x + sd * 0.16 * k, yy - 1.4 * k, z, 0x1a1b1d);
  }
}

/** Rudder and propeller under the stern (seen when a ship rolls over and sinks). */
function sternGear(A, H, T, k, twin = false) {
  if (A.lod) return;
  const z = H.zStern + 2.5 * k;
  A.box(0.5 * k, T * 0.7, 3.2 * k, 0, -T * 0.85, z - 1.0 * k, ANTIFOUL);
  for (const x of twin ? [-2.2 * k, 2.2 * k] : [0]) {
    const zp = z + 2.4 * k, yp = -T * 0.6, r = T * 0.32;
    A.rod([x, yp, zp - 0.5 * k], [x, yp, zp + 0.6 * k], 0.35 * k, 0x9c7a3c, 8);
    for (let b = 0; b < 4; b++) {
      const a = b * Math.PI / 2 + 0.3;
      A.box(0.12 * k, r, 0.9 * k, x + Math.sin(a) * r * 0.5, yp - r * 0.5 + Math.cos(a) * r * 0.5, zp, 0x9c7a3c, { rz: -a });
    }
  }
}

// ------------------------------------------------------------------ vessel types

function containerShip(A) {
  const L = 300, B = 48;
  const H = hull(A, {
    L, B, T: 13, D: 25, bow: 0.2, stern: 0.13, transom: 0.72, bowP: 2.0, bowQ: 0.55, entry: 1.3, wlP: 1.5, q: 6, flat: 0.75,
    sheerF: 3.5, rake: 0.55, ffRise: 0.35, ff: 0.05, run: 0.14, runRise: 0.85, boot: [1.6, 1.2],
    stripe: [0.95, 0.985], stripeC: WHITE, stripePa: 0, bottom: ANTIFOUL, topC: 0x1f3550, deck: DECK_GREY, bulwark: { from: 112, h: 2.2, inner: 0x2b3f58 }, nU: 64,
  });
  A.sphere(4.5, 4.2, 14, 0, -8.2, 141, ANTIFOUL);
  const yD = H.deckY(0);
  const zT0 = -104, zT1 = -92;
  const yb = accommodation(A, { hw: 16, z0: zT0, z1: zT1, y: yD, tiers: 7, th: 2.9, hex: WHITE, bridge: true, bz0: zT0 + 2, wing: B / 2 + 0.5, bh: 3.2, mastH: 7, lit: 0.45 });
  for (const sd of [1, -1]) lifeboat(A, sd * 17.3, yD + 2.9 * 2, -98, 8.5, sd);
  funnel(A, 0, yD, -123, 9, 13, 18, { band: 0xb5371f });
  if (!A.lod) mast(A, 0, H.deckY(122), 122, 9, 4);
  mooring(A, H, 128, 1);
  mooring(A, H, -138, -1, 1);
  anchors(A, H, 136, 1.4);
  sternGear(A, H, 13, 1.4);
  navLights(A, B / 2 - 0.5, yb, -92, -148, yD + 4);
  const r = A.rnd;
  const bayL = 12.4, rowW = 2.5, tierH = 2.62;
  const hatchY = yD + 1.6;
  const bays = [];
  for (let z = -86; z <= 116; z += bayL + 0.9) bays.push(z);
  for (let z = -145 + 5; z <= -128; z += bayL + 0.9) bays.push(z);
  let id = 0;
  for (const zc of bays) {
    const [hb] = H.edge(zc + bayL / 2);
    const [hb2] = H.edge(zc - bayL / 2);
    const half = Math.min(hb, hb2) - 1.2;
    const rows = Math.max(2, Math.floor((half * 2) / rowW));
    const x0 = -(rows * rowW) / 2 + rowW / 2;
    A.box(rows * rowW + 0.6, 1.6, bayL + 0.4, 0, yD, zc, 0x47586a);
    const baseTiers = 3 + Math.floor(r() * 4);
    if (A.lod) {
      const grp = 4;
      for (let g0 = 0; g0 < rows; g0 += grp) {
        const n = Math.min(grp, rows - g0);
        const tiers = Math.max(2, baseTiers - (g0 === 0 || g0 + n >= rows ? 1 : 0));
        A.box(n * rowW - 0.15, tiers * tierH, bayL, x0 + (g0 + (n - 1) / 2) * rowW, hatchY, zc, 0x888888, { pa: P_BOX + ((id++ % 400) / 1000) });
      }
      continue;
    }
    for (let k = 0; k < rows; k++) {
      const edgeDrop = (k === 0 || k === rows - 1) ? 1 + Math.floor(r() * 2) : r() < 0.2 ? 1 : 0;
      const tiers = Math.max(1, baseTiers - edgeDrop + (r() < 0.15 ? 1 : 0));
      const x = x0 + k * rowW;
      for (let t = 0; t < tiers; t++) {
        const y = hatchY + t * tierH;
        const two20 = r() < 0.18;
        const boxPa = P_BOX + ((id++ % 400) / 1000);
        if (two20) {
          for (const dz of [-3.1, 3.1]) A.box(2.42, 2.56, 6.0, x, y, zc + dz, 0x888888, { pa: P_BOX + ((id++ % 400) / 1000) });
        } else {
          A.box(2.42, 2.56, 12.18, x, y, zc, 0x888888, { pa: boxPa });
          if (k === 0 || k === rows - 1 || t === tiers - 1) {
            for (const rz of [-4.2, -1.4, 1.4, 4.2]) {
              A.box(2.46, 2.59, 0.45, x, y, zc + rz, 0x767676, { pa: boxPa });
            }
          }
          A.panel(x, y + 1.28, zc - 6.1, 2.25, 2.35, Math.PI, 0x30343a);
        }
      }
    }
    const zl = zc - bayL / 2 - 0.45;
    const span = rows * rowW + 0.8;
    A.box(span, 0.18, 0.9, 0, yD + 1.6 + tierH * 1, zl, 0xc9a227);
    A.box(span, 0.18, 0.9, 0, yD + 1.6 + tierH * 2, zl, 0xc9a227);
    for (let k = 0; k <= rows; k += 2) A.box(0.25, tierH * 2, 0.25, x0 - rowW / 2 + k * rowW, yD + 1.6, zl, 0xc9a227);
  }
  A.prism([[-B / 2 + 4, 112], [B / 2 - 4, 112], [B / 2 - 6, 115], [-B / 2 + 6, 115]], H.deckY(113), 5.5, WHITE);
  if (!A.lod) A.rail([[-15, yD + 2.2, -146], [15, yD + 2.2, -146]], 1.1, WHITE);
}

function tanker(A) {
  const L = 250, B = 44;
  const H = hull(A, {
    L, B, T: 14, D: 24, bow: 0.16, stern: 0.12, transom: 0.7, bowP: 2.2, bowQ: 0.5, entry: 1.2, wlP: 1.7, q: 7, flat: 0.8,
    sheerF: 2.5, rake: 0.35, ff: 0.05, ffRise: 0.3, run: 0.12, runRise: 0.85, boot: [1.4, 1.0],
    topC: 0x2a2f33, deck: DECK_RED, bulwark: { from: 100, h: 1.8, inner: 0x9a5040 }, nU: 60,
  });
  A.sphere(4.6, 4.5, 13, 0, -8.8, 117, ANTIFOUL);
  const yD = H.deckY(0);
  const yb = accommodation(A, { hw: 15, z0: -112, z1: -96, y: yD, tiers: 5, th: 2.9, bridge: true, bz0: -110, wing: B / 2 + 0.5, mastH: 8, lit: 0.45 });
  for (const sd of [1, -1]) lifeboat(A, sd * 16.3, yD + 2.9, -104, 8, sd);
  funnel(A, 0, yD, -117, 8, 9, 21, { band: 0x1f5fa8 });
  if (!A.lod) {
    A.box(4, 0.4, 10, 0, yD + 6, -121, STEEL, { rx: 0.5 });
    A.capsule(1.6, 9, 0, yD + 8, -121, ORANGE, { sy: 0.9 });
  }
  navLights(A, B / 2 - 0.5, yb, -96, -124, yD + 3);
  mooring(A, H, 110, 1);
  anchors(A, H, 114, 1.3);
  sternGear(A, H, 14, 1.3);
  const z0 = -90, z1 = 104;
  const pipes = A.lod ? [-4, 0, 4] : [-6.5, -5.2, -3.9, -2.6, 2.6, 3.9, 5.2, 6.5];
  for (let pi = 0; pi < pipes.length; pi++) {
    const x = pipes[pi];
    const pCol = pi % 3 === 0 ? 0x2e7d47 : x < 0 ? 0xb8bcc0 : 0x9aa0a6;
    A.rod([x, yD + 1.2, z0], [x, yD + 1.2, z1], 0.42, pCol, A.lod ? 4 : 8);
  }
  if (!A.lod) {
    for (let z = z0; z <= z1; z += 8) {
      A.box(15.0, 0.8, 0.4, 0, yD, z, STEEL);
      A.box(0.3, 3.4, 0.3, -0.8, yD, z, STEEL);
      A.box(0.3, 3.4, 0.3, 0.8, yD, z, STEEL);
    }
    A.box(1.9, 0.22, z1 - z0, 0, yD + 3.4, (z0 + z1) / 2, 0x3b7a4a);
    A.rail([[-0.9, yD + 3.6, z0], [-0.9, yD + 3.6, z1]], 1.0, 0xd8d8d0, 4);
    A.rail([[0.9, yD + 3.6, z0], [0.9, yD + 3.6, z1]], 1.0, 0xd8d8d0, 4);
    for (let z = z0 + 10; z < z1 - 5; z += 18) {
      for (const sd of [1, -1]) {
        A.cyl(1.0, 0.9, sd * 11, yD, z, 0x2e7d47, { seg: 10 });
        A.cyl(0.45, 0.4, sd * 11, yD + 0.9, z, STEEL, { seg: 8 });
        A.cyl(0.18, 2.8, sd * 13.5, yD, z + 4, STEEL, { seg: 6 });
        A.box(0.6, 0.5, 0.6, sd * 13.5, yD + 2.8, z + 4, ORANGE);
      }
    }
  }
  const zm = 5;
  for (const dz of A.lod ? [0] : [-3.2, -1.6, 0, 1.6, 3.2]) {
    const mCol = Math.abs(dz) > 2 ? 0x2e7d47 : 0xb8bcc0;
    A.rod([-B / 2 + 2.5, yD + 1.6, zm + dz], [B / 2 - 2.5, yD + 1.6, zm + dz], 0.38, mCol, A.lod ? 4 : 8);
    if (!A.lod) {
      for (const sd of [1, -1]) {
        A.cyl(0.55, 0.5, sd * (B / 2 - 4), yD + 1.35, zm + dz, 0xb5371f, { seg: 8 });
        A.cyl(0.42, 0.15, sd * (B / 2 - 5.5), yD + 1.85, zm + dz, 0x2e7d47, { seg: 8 });
      }
    }
  }
  A.box(B - 6, 0.4, 10, 0, yD + 0.6, zm, STEEL);
  for (const sd of [1, -1]) crane(A, sd * 9, yD, zm + 10, { h: 5, boom: 14, yaw: sd * 1.3, lift: 0.5, hex: WHITE, drop: 4 });
  A.prism([[-B / 2 + 5, 100], [B / 2 - 5, 100], [B / 2 - 7, 102.5], [-B / 2 + 7, 102.5]], H.deckY(101), 3.5, WHITE);
}

function bulkCarrier(A) {
  const L = 190, B = 32;
  const H = hull(A, {
    L, B, T: 11, D: 18, bow: 0.18, stern: 0.13, transom: 0.72, bowP: 2.1, bowQ: 0.55, entry: 1.25, wlP: 1.6, q: 6, flat: 0.75,
    sheerF: 3.0, rake: 0.4, ff: 0.05, ffRise: 0.35, run: 0.13, runRise: 0.85, boot: [1.3, 1.0],
    topC: 0x2d4a3a, deck: DECK_RED, bulwark: { from: 76, h: 1.8, inner: 0x9a5040 }, nU: 56,
  });
  A.sphere(3.2, 3.2, 9, 0, -7, 91, ANTIFOUL);
  const yD = H.deckY(0);
  const yb = accommodation(A, { hw: 12, z0: -86, z1: -74, y: yD, tiers: 5, th: 2.8, bridge: true, bz0: -84, wing: B / 2 + 0.4, mastH: 6, lit: 0.45 });
  for (const sd of [1, -1]) lifeboat(A, sd * 13.2, yD + 2.8, -80, 7, sd);
  funnel(A, 0, yD, -90, 6, 7, 17, { band: 0xd9a21b });
  navLights(A, B / 2 - 0.4, yb, -74, -94, yD + 3);
  mooring(A, H, 82, 1);
  anchors(A, H, 86, 1.0);
  sternGear(A, H, 11, 1.0);
  const hz = [-55, -28, -1, 26, 53];
  for (const z of hz) {
    A.box(19, 1.8, 18, 0, yD, z, 0x6a3a2c);
    A.box(18.4, 0.9, 17.4, 0, yD + 1.8, z, 0x7a2f26, { pa: P_ACC });
    if (!A.lod) {
      for (let k = -7; k <= 7; k += 1.75) A.box(18.6, 0.25, 0.25, 0, yD + 2.7, z + k, 0x7a2f26, { pa: P_ACC });
      A.box(0.4, 0.3, 17.6, 0, yD + 2.7, z, DARK);
      for (const sd of [1, -1]) A.cyl(0.45, 1.5, sd * 11.2, yD, z, WHITE, { seg: 8, top: 1.35 });
    }
  }
  for (let k = 0; k < 4; k++) {
    const z = (hz[k] + hz[k + 1]) / 2;
    crane(A, (k % 2 ? 1 : -1) * 2, yD, z, { h: 8, boom: 24, yaw: k % 2 ? 0.25 : Math.PI - 0.25, lift: 0.45, hex: YELLOW, drop: 9 });
  }
  A.prism([[-B / 2 + 3, 76], [B / 2 - 3, 76], [B / 2 - 5, 78.5], [-B / 2 + 5, 78.5]], H.deckY(77), 3, WHITE);
}

function carFerry(A) {
  const L = 150, B = 26;
  const H = hull(A, {
    L, B, T: 6, D: 15, bow: 0.22, stern: 0.08, transom: 0.86, bowP: 2.0, bowQ: 0.55, entry: 1.25, wlP: 1.6, wlB: 0.97, q: 4, flat: 0.6,
    sheerF: 1.2, rake: 0.6, ff: 0.07, ffRise: 0.4, run: 0.1, runRise: 0.75, sRake: 0.05, boot: [0.8, 0.7],
    stripe: [0.12, 0.3], topC: WHITE, stripeC: 0x1d6fb8, deck: DECK_GREY, nU: 56,
  });
  A.sphere(1.9, 2.0, 6, 0, -3.6, 74, ANTIFOUL);
  const yD = H.deckY(0);
  const lod = A.lod;
  if (!lod) {
    // Hull portholes along the car deck (upper freeboard).
    for (const sd of [1, -1]) {
      for (let z = -66; z < 48; z += 2.4) {
        const [hb] = H.edge(z);
        A.panel(sd * (hb + 0.03), yD - 2.0, z, 1.2, 0.8, sd > 0 ? Math.PI / 2 : -Math.PI / 2, GLASS, A.rnd() < 0.5 ? E_LIT : E_GLASS);
      }
    }
    // Articulated bow Ro-Ro visor seam & hinge arms + stern vehicle ramp door with hydraulic cylinders & ribs.
    const zb = 60;
    for (const sd of [1, -1]) {
      const [hb, y] = H.edge(zb);
      A.rod([sd * (hb + 0.03), 1.2, zb], [sd * (hb + 0.03), y, zb + 2], 0.08, 0x7d8890, 5);
      A.rod([sd * (hb + 0.03), 1.2, zb], [sd * (hb * 0.45), 1.2, zb + 11], 0.07, 0x7d8890, 5);
    }
    A.box(10.5, 7.2, 0.18, 0, 1.3, H.zStern - 0.08, 0x9aa3aa);
    for (let ry = 2.2; ry <= 7.8; ry += 1.4) A.box(10.7, 0.16, 0.24, 0, ry, H.zStern - 0.12, 0x60686e);
    for (const sx of [-4.8, 4.8]) A.rod([sx, 8.6, H.zStern + 0.2], [sx, 4.2, H.zStern - 0.22], 0.12, STEEL, 6);
  }
  // Superstructure: four passenger promenade decks, smooth rounded front, stepped aft.
  const sz0 = -54, sz1 = 57;
  const decks = 4, th = 3.0;
  for (let t = 0; t < decks; t++) {
    const y = yD + t * th;
    const z1 = sz1 - t * 1.5 - (t === decks - 1 ? 8 : 0), z0 = sz0 + t * 7;
    const hw = B / 2 - 0.6 - t * 0.3;
    A.prism(housePts(hw, z0, z1, 0, 8 - t * 0.6), y, th, WHITE, { top: DECK_GREY, smooth: true });
    A.box(hw * 2 + 0.4, 0.2, z1 - z0 + 0.4, 0, y + th - 0.05, (z0 + z1) / 2, WHITE);
    if (lod) {
      for (const sd of [1, -1]) A.box(0.06, th * 0.45, z1 - z0 - 6, sd * (hw + 0.02), y + th * 0.3, (z0 + z1) / 2 - 2, GLASS, { em: E_LIT });
      continue;
    }
    const big = t === 1 || t === 2;
    for (const sd of [1, -1]) A.winX(sd * hw, sd, z0 + 1.5, z1 - 6, y + th * 0.55, big ? 2.2 : 1.3, big ? th * 0.55 : th * 0.4, big ? 2.6 : 1.9, 0.65);
    for (let k = -4; k <= 4; k++) A.panel(k * (hw - 6) / 4.5, y + th * 0.55, z1 + 0.03, (hw - 4) / 4.6, th * 0.55, 0, GLASS, E_LIT, -0.1);
    A.winZ(z0, -1, -hw + 1, hw - 1, y + th * 0.55, 1.6, th * 0.45, 2.4, 0.5);
    if (t > 0) {
      A.rail([[-hw, y, z0 - 6.5], [hw, y, z0 - 6.5]], 1.1, WHITE);
      for (const bx of [-hw * 0.55, 0, hw * 0.55]) A.box(2.2, 0.5, 0.7, bx, y, z0 - 3.2, TEAK);
      for (const sd of [-1, 1]) lifebuoy(A, sd * (hw - 0.1), y + 0.65, z0 - 3.5, Math.PI / 2, 0.4);
    }
  }
  const yTop = yD + decks * th;
  // Bridge forward on the top deck with full-beam wings; twin radar masts; lifeboats along deck 2; twin funnels aft.
  bridge(A, { hw: 8, z0: 36, z1: 44, y: yTop, wing: B / 2 + 0.3, bh: 3, mast: false });
  mast(A, -2.6, yTop + 3.2, 39, 6.8, 4.5);
  mast(A, 2.6, yTop + 3.2, 39, 6.8, 4.5);
  for (const sd of [1, -1]) {
    for (const z of [-34, -22, -10, 2, 14]) lifeboat(A, sd * (B / 2 - 0.4), yD + th * 2 - 0.4, z, 7.5, sd);
    for (const z of [-28, -16, -4, 8]) liferaft(A, sd * (B / 2 - 0.6), yD + th * 2, z, 0.45, 1.3);
  }
  for (const sd of [1, -1]) funnel(A, sd * 4.5, yTop, -20, 3.4, 7, 7, { hex: 0x1d6fb8, pa: P_ACC, band: WHITE, bandPa: 0 });
  // Upper sun-deck benches & life-ring buoys along the railings.
  if (!lod) {
    const hw = B / 2 - 0.6 - (decks - 1) * 0.3;
    A.rail([[hw - 0.3, yTop, sz0 + 21], [hw - 0.3, yTop, 36]], 1.1, WHITE);
    A.rail([[-hw + 0.3, yTop, sz0 + 21], [-hw + 0.3, yTop, 36]], 1.1, WHITE);
    for (let z = -8; z <= 28; z += 6) {
      for (const sx of [-hw * 0.55, hw * 0.55]) {
        A.box(2.4, 0.45, 0.75, sx, yTop, z, TEAK);
        A.box(2.4, 0.45, 0.14, sx, yTop + 0.45, z - 0.3, WHITE);
      }
      for (const sd of [-1, 1]) lifebuoy(A, sd * (hw - 0.25), yTop + 0.6, z, Math.PI / 2, 0.38);
    }
  }
  navLights(A, B / 2, yTop + 1.2, 42, H.zStern + 1, yD + 2);
  mooring(A, H, 66, 1);
  anchors(A, H, 68, 0.8);
  sternGear(A, H, 6, 0.8, true);
  A.rail([[-8, yD, 72], [-3, yD + 0.8, 74], [0, H.deckY(74.5), 74.5], [3, yD + 0.8, 74], [8, yD, 72]], 1.1, WHITE);
}

function catamaranFerry(A) {
  // Fast passenger/vehicle catamaran: two slender demihulls, open bow/stern vehicle ramp visors,
  // multi-deck promenade windows, upper sun-deck benches & life-ring buoys, twin radar masts, and twin funnels!
  const L = 40, B = 12;
  const yD = 2.4;
  for (const x of [-4.3, 4.3]) {
    const sub = new Acc(A.lod, 7);
    hull(sub, {
      L, B: 3.3, T: 1.5, D: 3.9, bow: 0.4, stern: 0.05, transom: 0.85, bowP: 1.6, bowQ: 0.8, entry: 1.1, wlP: 1.4, q: 1.5, flat: 0.25,
      sheerF: 0.5, rake: 0.5, ff: 0.12, ffRise: 0.2, run: 0.05, runRise: 0.2, sRake: 0, boot: [0.25, 0.2],
      stripe: [0.25, 0.55], topC: WHITE, stripeC: 0x1d6fb8, deck: WHITE, nU: 34, nUf: 10,
    });
    for (let k = 0; k < sub.p.length; k += 3) { A.p.push(sub.p[k] + x, sub.p[k + 1], sub.p[k + 2]); A.n.push(sub.n[k], sub.n[k + 1], sub.n[k + 2]); A.c.push(sub.c[k], sub.c[k + 1], sub.c[k + 2]); }
    for (const v of sub.i) A.i.push(v);
  }
  const lod = A.lod;
  A.box(B - 0.2, 0.9, L * 0.86, 0, yD - 0.5, -1.5, WHITE, { pa: P_HULL });             // bridging wet deck
  A.box(B + 0.05, 0.5, L * 0.82, 0, yD - 0.15, -1.5, 0x1d6fb8, { pa: P_ACC });       // livery band
  // Bow & stern vehicle/passenger ramp visors between the demihulls
  if (!lod) {
    A.box(5.2, 0.18, 2.8, 0, yD + 0.2, 16.5, STEEL, { rx: -0.18 });
    A.box(5.4, 1.8, 0.16, 0, yD + 0.3, -18.6, STEEL, { rx: 0.15 });
    for (const sx of [-2.5, 2.5]) A.rod([sx, yD + 2.4, -17.5], [sx, yD + 1.6, -18.6], 0.06, STEEL, 4);
  }
  const hw = B / 2 - 0.4, z0 = -14, z1 = 12;
  A.prism(housePts(hw, z0, z1, 0, 3.2), yD + 0.4, 2.8, WHITE, { pa: P_HULL, top: DECK_GREY, smooth: true });
  if (lod) {
    for (const sd of [1, -1]) A.box(0.06, 1.3, 22, sd * (hw + 0.02), yD + 1.3, -1.5, GLASS, { em: E_LIT });
  } else {
    for (const sd of [1, -1]) A.winX(sd * hw, sd, z0 + 0.8, z1 - 3, yD + 2.0, 1.7, 1.4, 1.95, 0.7);
    for (let k = -3; k <= 3; k++) A.panel(k * 1.25, yD + 2.0, z1 + 0.03, 1.15, 1.4, 0, GLASS, E_LIT, -0.25);
    A.winZ(z0, -1, -hw + 1, hw - 1, yD + 2.0, 1.4, 1.5, 1.8, 0.6);
    A.rail([[-hw, yD + 0.4, z0], [-hw, yD + 0.4, -18.5], [hw, yD + 0.4, -18.5], [hw, yD + 0.4, z0]], 1.0, 0xc9cdd0, 1.5);
    for (const sd of [-1, 1]) {
      liferaft(A, sd * (hw - 0.45), yD + 0.4, -16.2, 0.38, 1.1);
      lifebuoy(A, sd * (hw - 0.02), yD + 1.0, -15.2, Math.PI / 2, 0.32);
    }
  }
  // Upper deck: panoramic wheelhouse & passenger lounge forward, sun-deck benches, twin funnels & twin radar masts.
  const y2 = yD + 3.2;
  A.prism(housePts(3.8, -3.5, 7.2, 0, 1.6), y2, 2.3, WHITE, { pa: P_HULL, top: OFFWHITE, smooth: true });
  if (!lod) {
    for (let k = -2; k <= 2; k++) A.panel(k * 1.2, y2 + 1.45, 7.23, 1.08, 1.1, 0, GLASS, E_LIT, -0.3);
    for (const sd of [1, -1]) A.winX(sd * 3.8, sd, -3.0, 5.2, y2 + 1.45, 1.2, 1.0, 1.5, 0.8);
    A.rail([[-hw + 0.3, y2, -13.2], [hw - 0.3, y2, -13.2], [hw - 0.3, y2, -3.5], [-hw + 0.3, y2, -3.5], [-hw + 0.3, y2, -13.2]], 1.0, 0xc9cdd0, 1.5);
    // Sun-deck benches & life-ring buoys
    for (const z of [-10.5, -8.2, -5.8]) {
      for (const sx of [-2.4, 0, 2.4]) {
        A.box(1.5, 0.36, 0.55, sx, y2, z, TEAK);
        A.box(1.5, 0.38, 0.10, sx, y2 + 0.36, z - 0.22, WHITE);
      }
      for (const sd of [-1, 1]) lifebuoy(A, sd * (hw - 0.28), y2 + 0.55, z, Math.PI / 2, 0.3);
    }
  }
  // Twin radar masts on wheelhouse roof + twin raked funnels aft on upper deck
  for (const sd of [-1, 1]) {
    mast(A, sd * 1.35, y2 + 2.3, 2.2, 3.1, 1.6);
    funnel(A, sd * 3.6, y2, -11.5, 1.2, 2.4, 2.8, { hex: 0x1d6fb8, pa: P_ACC, band: WHITE, bandPa: 0 });
  }
  satcom(A, 0, y2 + 2.3, 3.8, 0.42);
  navLights(A, 3.85, y2 + 1.7, 5.8, -19.5, yD + 0.8, 0.2);
  if (!lod) for (const x of [-4.3, 4.3]) A.box(1.4, 0.85, 1.5, x, -0.4, -20.3, DARK);
}

function tug(A) {
  const L = 30, B = 11;
  const H = hull(A, {
    L, B, T: 3.2, D: 5.3, bow: 0.38, stern: 0.2, transom: 0.82, bowP: 1.7, bowQ: 0.75, entry: 1.0, wlP: 1.4, wlB: 0.94, q: 2.2, flat: 0.3,
    sheerF: 1.4, sheerA: 0.2, rake: 0.35, ff: 0.15, ffRise: 0.4, run: 0.2, runRise: 0.55, boot: [0.35, 0.3],
    topC: 0x8e2a22, deck: DECK_GREY, bulwark: { from: -15, h: 0.9, inner: 0xd8d8d0 }, nU: 44,
  });
  const lod = A.lod;
  // Heavy rubber D-fender along the sheer, cylindrical bow pushing fender + side & stern rubber tire fenders!
  const segs = [];
  for (let z = -14.6; z <= 14.6; z += lod ? 3 : 1) { const [hb, y] = H.edge(z); segs.push([hb + 0.25, y - 0.35, z]); }
  for (const sd of [1, -1]) for (let k = 0; k < segs.length - 1; k++) A.rod([segs[k][0] * sd, segs[k][1], segs[k][2]], [segs[k + 1][0] * sd, segs[k + 1][1], segs[k + 1][2]], 0.36, RUBBER, lod ? 4 : 8);
  if (!lod) {
    // Stacked cylindrical bow fenders + vertical pushing knees
    for (let k = 0; k < 4; k++) A.rod([-1.8, 0.3 + k * 0.6, 15.2 - k * 0.1], [1.8, 0.3 + k * 0.6, 15.2 - k * 0.1], 0.34, RUBBER, 8);
    for (const sx of [-1.1, 1.1]) A.cyl(0.38, 2.3, sx, 0.2, 15.15, RUBBER, { seg: 8 });
    // Side & stern rubber tire fenders
    for (const z of [-10, -6, -2, 2, 6, 10]) {
      const [hb, y] = H.edge(z);
      for (const sd of [1, -1]) A.torus(0.55, 0.22, sd * (hb + 0.22), y - 0.55, z, RUBBER, { ry: Math.PI / 2, rs: 6, ts: 10 });
    }
    for (const x of [-3, -1, 1, 3]) A.torus(0.52, 0.21, x, 1.3, -15.3, RUBBER, { rs: 6, ts: 10 });
  }
  const yD = H.deckY(0);
  // Deckhouse, raised 360-deg glass wheelhouse, twin exhaust stacks, fire-fighting water monitors.
  A.prism(housePts(3.6, -4, 6, 1.0), yD, 2.4, WHITE, { top: DECK_GREY });
  if (!lod) {
    for (const sd of [1, -1]) {
      A.winX(sd * 3.6, sd, -3, 4.5, yD + 1.5, 0.7, 0.7, 1.6, 0.5);
      lifebuoy(A, sd * 3.65, yD + 1.2, -3.2, Math.PI / 2, 0.35);
      liferaft(A, sd * 3.2, yD + 2.4, -2.8, 0.38, 1.05);
    }
  }
  const yw = yD + 2.4;
  A.prism(housePts(3.0, -1.5, 4.5, 0.9), yw, 2.5, WHITE, { top: OFFWHITE });
  if (lod) {
    A.box(6.1, 1.1, 6.1, 0, yw + 1.0, 1.5, GLASS, { em: E_LIT });
  } else {
    for (let k = -2; k <= 2; k++) A.panel(k * 0.85, yw + 1.55, 4.53, 0.78, 1.2, 0, GLASS, E_LIT, -0.2);
    for (const sd of [1, -1]) A.winX(sd * 3.0, sd, -1.1, 3.4, yw + 1.55, 1.0, 1.2, 1.15, 0.9);
    A.winZ(-1.5, -1, -2.4, 2.4, yw + 1.55, 0.9, 1.2, 1.2, 0.9);
    A.box(6.6, 0.15, 6.6, 0, yw + 2.5, 1.5, WHITE); // visor
    // Twin red fire-fighting water cannons on the forward monkey island
    for (const sx of [-1.8, 1.8]) {
      A.cyl(0.14, 0.7, sx, yw + 2.65, 4.0, 0xc02020, { seg: 8 });
      A.rod([sx, yw + 3.25, 4.0], [sx, yw + 3.55, 4.7], 0.09, 0xc02020, 6);
    }
  }
  for (const sd of [1, -1]) {
    A.prism(housePts(0.5, -5.6, -4.2, 0.2).map((p) => [p[0] + sd * 2.0, p[1]]), yD + 2.4, 3.2, 0x8e2a22, { pa: P_HULL, top: BLACK, dz: -0.4 });
    if (!lod) A.cyl(0.24, 0.9, sd * 2.0, yD + 5.5, -5.3, STEEL, { seg: 8 });
  }
  mast(A, 0, yw + 2.6, 1, 3.5, 2.2);
  if (!lod) {
    A.rail([[-3.1, yw + 2.65, -1.4], [3.1, yw + 2.65, -1.4], [3.1, yw + 2.65, 4.4], [-3.1, yw + 2.65, 4.4], [-3.1, yw + 2.65, -1.4]], 0.8, WHITE, 1.2);
    // Towing winch, staple and H-bitts aft; forward H-bitt & capstan on forecastle.
    A.rod([-2.2, yD + 1.0, -8], [2.2, yD + 1.0, -8], 0.9, 0x3a6a4a, 12);
    A.box(5.6, 1.6, 1.8, 0, yD, -8, 0x3a6a4a);
    A.rod([-3.2, yD, -11.5], [-3.2, yD + 3.2, -11.5], 0.18, DARK, 6);
    A.rod([3.2, yD, -11.5], [3.2, yD + 3.2, -11.5], 0.18, DARK, 6);
    A.rod([-3.2, yD + 3.2, -11.5], [3.2, yD + 3.2, -11.5], 0.18, DARK, 6);
    for (const x of [-1, 1]) A.cyl(0.3, 1.1, x, yD, -13, BLACK, { seg: 8 });
    A.box(1.8, 0.3, 0.4, 0, yD + 0.8, -13, BLACK);
    A.cyl(0.6, 0.9, 0, H.deckY(11), 11, DARK, { seg: 10 });
  }
  navLights(A, 3.1, yw + 1.8, 4, -14.9, yD + 1, 0.22);
}

function fishingBoat(A) {
  const L = 26, B = 7.6;
  const H = hull(A, {
    L, B, T: 2.8, D: 4.6, bow: 0.36, stern: 0.16, transom: 0.78, bowP: 1.7, bowQ: 0.7, entry: 1.0, wlP: 1.4, wlB: 0.93, q: 1.8, flat: 0.25,
    sheerF: 1.8, sheerA: 0.4, rake: 0.3, ff: 0.15, ffRise: 0.4, run: 0.18, runRise: 0.5, boot: [0.3, 0.25],
    stripe: [0.6, 0.78], topC: 0x1f4f7a, stripeC: WHITE, stripePa: 0, deck: DECK_GREY, bulwark: { from: -13, h: 1.0, inner: 0xd8d8d0 }, nU: 40,
  });
  const lod = A.lod;
  const yD = H.deckY(0);
  // Wheelhouse forward of midships + whaleback shelter deck ahead of it.
  A.prism(housePts(2.6, 2, 7.5, 0.8), yD, 2.4, WHITE, { top: OFFWHITE });
  A.prism(housePts(2.2, 3, 7, 0.7), yD + 2.4, 2.1, WHITE, { top: OFFWHITE });
  if (lod) {
    A.box(4.5, 0.9, 4.1, 0, yD + 3.3, 5, GLASS, { em: E_LIT });
  } else {
    for (let k = -2; k <= 2; k++) A.panel(k * 0.75, yD + 3.55, 7.03, 0.7, 0.9, 0, GLASS, E_LIT, -0.25);
    for (const sd of [1, -1]) A.winX(sd * 2.2, sd, 3.3, 6.0, yD + 3.55, 0.8, 0.8, 1.0, 0.8);
    for (const sd of [1, -1]) A.winX(sd * 2.6, sd, 2.5, 6.5, yD + 1.4, 0.5, 0.5, 1.4, 0.4);
    for (const sd of [1, -1]) lifebuoy(A, sd * 2.65, yD + 1.4, 3.2, Math.PI / 2, 0.32);
    liferaft(A, 0, yD + 4.5, 3.8, 0.35, 0.95);
    // Exhaust stack behind wheelhouse
    A.cyl(0.22, 2.6, -1.6, yD + 2.4, 2.4, DARK, { seg: 8 });
  }
  A.prism([[-B / 2 + 0.6, 8.5], [B / 2 - 0.6, 8.5], [1.0, 12.4], [-1.0, 12.4]], H.deckY(10), 1.1, WHITE); // whaleback
  mast(A, 0, yD + 4.6, 5, 4.2, 1.8);
  // Heavy A-frame stern trawl gantry + diagonal braces, trawl blocks, net drum winch, outrigger booms & floats!
  const g = 0xd9a21b;
  for (const sd of [1, -1]) {
    A.rod([sd * 3.3, H.deckY(-11), -11.6], [sd * 2.0, yD + 6.5, -10.8], 0.18, g, lod ? 4 : 8, { pa: P_ACC });
    if (!lod) {
      // Forward diagonal gantry brace & hanging trawl block pulley
      A.rod([sd * 3.2, yD, -7.8], [sd * 2.2, yD + 4.8, -11.0], 0.12, g, 6, { pa: P_ACC });
      A.cyl(0.28, 0.18, sd * 1.4, yD + 5.8, -10.8, DARK, { rz: Math.PI / 2, seg: 8 });
      // Otter trawl doors stowed at the stern gallows
      A.box(0.14, 1.5, 2.1, sd * 3.45, yD + 0.8, -11.2, STEEL);
    }
  }
  A.rod([-2.1, yD + 6.5, -10.8], [2.1, yD + 6.5, -10.8], 0.18, g, lod ? 4 : 8, { pa: P_ACC });
  // Hydraulic net winch drum & trawl warps
  A.rod([-1.6, yD + 1.4, -6], [1.6, yD + 1.4, -6], 1.0, 0x2a5a8a, lod ? 6 : 14);
  if (!lod) {
    for (const x of [-1.7, 1.7]) A.box(0.28, 1.95, 1.7, x, yD, -6, DARK);
    A.rod([-1.5, yD + 1.4, -6], [1.5, yD + 1.4, -6], 1.14, 0x3b7a3a, 14); // green trawl net wound on drum
    for (const sx of [-1.2, 1.2]) A.rod([sx, yD + 2.1, -6], [sx * 1.15, yD + 5.9, -10.8], 0.025, STEEL, 4); // trawl warps
    for (const sd of [1, -1]) {
      // Outrigger boom, topping lift stay, and paravane stabilizer
      A.rod([sd * 0.3, yD + 4.4, 1.5], [sd * 7.8, yD + 9.2, 0], 0.09, g, 6);
      A.rod([0, yD + 8.4, 5], [sd * 7.8, yD + 9.2, 0], 0.02, DARK, 4);
      A.rod([sd * 7.8, yD + 9.2, 0], [sd * 7.8, yD + 3.8, 0], 0.015, DARK, 4);
      A.box(0.55, 0.35, 0.85, sd * 7.8, yD + 3.5, 0, ORANGE);
      for (let k = 0; k < 4; k++) A.sphere(0.30, 0.30, 0.30, sd * (B / 2 - 0.2), yD + 0.65, -2.2 - k * 1.3, ORANGE, { w: 8, h: 6 });
    }
    A.box(2.4, 0.9, 2.0, 0, yD, -1.5, 0x3a3f45);     // fish hold hatch
    A.box(1.3, 1.0, 1.1, 2.3, yD, -2.5, 0x2a7ab5);   // insulated fish tubs
    A.box(1.3, 0.5, 1.1, -2.3, yD, -2.5, 0xd9a21b);
  }
  navLights(A, 2.3, yD + 3.6, 6.5, -12.9, yD + 1.4, 0.2);
}

function sailboat(A) {
  const L = 12, B = 3.8;
  const H = hull(A, {
    L, B, T: 0.55, D: 1.55, bow: 0.5, stern: 0.12, transom: 0.72, bowP: 1.5, bowQ: 0.85, entry: 1.0, wlP: 1.3, wlB: 0.9, q: 1.4, flat: 0.15,
    sheerF: 0.25, sheerA: 0.1, rake: 1.2, ff: 0.3, ffRise: 0.3, run: 0.35, runRise: 0.7, sRake: -0.6, boot: [0.08, 0.1],
    stripe: [0.55, 0.7], topC: WHITE, stripeC: 0x1d3f6e, deck: OFFWHITE, nU: 40, nUf: 12,
  });
  const lod = A.lod;
  const yD = H.deckY(0);
  // Fin keel with lead bulb, spade rudder.
  A.prism([[-0.12, -0.6], [0.12, -0.6], [0.08, 0.6], [-0.08, 0.6]], -2.1, 1.6, DARK);
  A.capsule(0.22, 1.6, 0, -2.1, 0.1, DARK);
  A.prism([[-0.06, -4.6], [0.06, -4.6], [0.04, -4.1], [-0.04, -4.1]], -1.4, 1.0, DARK);
  // Cabin coachroof with bevelled portholes & skylight hatches, teak-planked cockpit deck & benches, winches & helm wheel.
  A.prism(housePts(1.25, -1.5, 2.7, 0, 0.85), yD, 0.46, OFFWHITE, { taper: 0.92, top: OFFWHITE, smooth: true });
  if (!lod) {
    for (const sd of [1, -1]) {
      A.winX(sd * 1.21, sd, -1.1, 2.1, yD + 0.26, 0.78, 0.17, 0.95, 0.4);
      // Teak grab rails on coachroof
      A.rod([sd * 0.78, yD + 0.50, -1.1], [sd * 0.68, yD + 0.50, 2.0], 0.022, TEAK, 4);
      // Sheet winches on cockpit coaming
      A.cyl(0.11, 0.18, sd * 0.98, yD + 0.35, -2.6, 0xc9cbd0, { seg: 8 });
    }
    // Foredeck & coachroof translucent skylight hatches
    A.box(0.58, 0.06, 0.58, 0, yD + 0.45, 1.4, GLASS, { em: E_GLASS });
    A.box(0.52, 0.06, 0.52, 0, H.deckY(3.5), 3.5, GLASS, { em: E_GLASS });
    // Teak-planked cockpit sole, seats, and folding cockpit table with caulking strip details
    A.box(1.9, 0.08, 3.0, 0, yD - 0.04, -3.4, TEAK);
    for (const sx of [-0.35, 0, 0.35]) A.box(0.025, 0.09, 2.9, sx, yD - 0.04, -3.4, DARK);
    for (const sd of [1, -1]) {
      A.box(0.08, 0.35, 3.1, sd * 0.98, yD, -3.4, OFFWHITE); // coaming
      A.box(0.44, 0.06, 2.8, sd * 0.72, yD + 0.18, -3.4, TEAK); // teak seats
    }
    A.box(0.45, 0.42, 0.95, 0, yD + 0.04, -3.2, TEAK); // teak cockpit table
    A.box(1.9, 0.5, 0.08, 0, yD + 0.4, -1.65, 0x1d3f6e, { rx: -0.5 }); // sprayhood dodger
    // Binnacle pedestal, compass dome & spoked stainless helm wheel
    A.cyl(0.11, 0.58, 0, yD, -4.32, OFFWHITE, { seg: 8 });
    A.sphere(0.11, 0.09, 0.11, 0, yD + 0.62, -4.32, DARK, { w: 8, h: 6 });
    A.torus(0.42, 0.025, 0, yD + 0.48, -4.42, 0xc9cbd0, { rs: 6, ts: 14 });
  }
  // Tapered aluminum mast, boom with boom vang, double swept spreaders, main & jib sails, standing rigging.
  const mz = 1.2, mh = 15.5;
  A.cyl(0.085, mh, 0, yD + 0.45, mz, 0xc9cbd0, { top: 0.65, seg: 10 });
  A.rod([0, yD + 1.2, mz], [0, yD + 1.4, mz - 4.6], 0.065, 0xc9cbd0, 8);      // boom
  A.rod([0, yD + 0.65, mz], [0, yD + 1.28, mz - 1.4], 0.035, 0x9a9da2, 6);    // rigid boom vang
  A.box(1.9, 0.045, 0.06, 0, yD + 0.45 + mh * 0.42, mz - 0.08, 0xc9cbd0);     // lower spreaders
  A.box(1.3, 0.04, 0.05, 0, yD + 0.45 + mh * 0.72, mz - 0.06, 0xc9cbd0);      // upper spreaders
  sail(A, [0, yD + 1.5, mz - 0.15], [0, yD + mh * 0.97, mz - 0.1], [0, yD + 1.55, mz - 4.5], 0.10, lod ? 4 : 10);
  sail(A, [0, yD + 0.5, 5.35], [0, yD + mh * 0.86, mz + 0.15], [0, yD + 0.7, mz + 0.25], -0.08, lod ? 3 : 8);
  if (!lod) {
    const top = [0, yD + mh, mz];
    A.rod([0, yD + 0.1, 5.6], [0, yD + mh * 0.86, mz + 0.1], 0.016, 0x9a9da2, 4);        // roller-furling forestay
    A.rod([0, H.deckY(-5.8), -5.8], top, 0.012, 0x9a9da2, 4);                              // backstay
    for (const sd of [1, -1]) {
      A.rod([sd * 1.5, yD, mz - 0.3], [sd * 0.92, yD + mh * 0.42, mz], 0.014, 0x9a9da2, 4); // shrouds
      A.rod([sd * 0.92, yD + mh * 0.42, mz], [sd * 0.62, yD + mh * 0.72, mz], 0.012, 0x9a9da2, 4);
      A.rod([sd * 0.62, yD + mh * 0.72, mz], [0, yD + mh * 0.97, mz], 0.012, 0x9a9da2, 4);
    }
    // Stainless bow pulpit rail, stern pushpit & lifelines.
    const pts = [];
    for (let z = -5.6; z <= 5.5; z += 1.1) { const [hb, y] = H.edge(z); pts.push([hb - 0.08, y, z]); }
    for (const sd of [1, -1]) A.rail(pts.map((p) => [p[0] * sd, p[1], p[2]]), 0.62, 0xc9cbd0, 1.1);
    A.rail([[-0.65, H.deckY(5.2), 5.2], [0, H.deckY(5.85), 5.95], [0.65, H.deckY(5.2), 5.2]], 0.65, 0xc9cbd0, 0.8);
    lifebuoy(A, 0.95, yD + 0.35, -5.5, Math.PI / 2, 0.24);
  }
  A.sphere(0.06, 0.06, 0.06, 0, yD + mh + 0.05, mz, 0xffffff, { em: E_WHITE, w: 6, h: 4 });
}

/** Cambered triangular sail from tack -> head -> clew, `camber` as a fraction of the foot length. */
function sail(A, tack, head, clew, camber, n) {
  const P = (u, v) => {
    const lx = tack[0] + (head[0] - tack[0]) * u, ly = tack[1] + (head[1] - tack[1]) * u, lz = tack[2] + (head[2] - tack[2]) * u;
    const lx2 = clew[0] + (head[0] - clew[0]) * u, ly2 = clew[1] + (head[1] - clew[1]) * u, lz2 = clew[2] + (head[2] - clew[2]) * u;
    const x = lx + (lx2 - lx) * v, y = ly + (ly2 - ly) * v, z = lz + (lz2 - lz) * v;
    const chord = Math.hypot(lx2 - lx, lz2 - lz);
    return [x + camber * chord * Math.sin(Math.PI * v) * (1 - u * 0.6), y, z];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = P(i / n, j / n), b = P(i / n, (j + 1) / n), c = P((i + 1) / n, (j + 1) / n), d = P((i + 1) / n, j / n);
      const nx = Math.sign(camber) || 1;
      const nrm = [nx, 0, 0];
      A.fquad(a, b, c, d, nrm, SAIL, 0, 0, true);
    }
  }
}

function speedboat(A) {
  const L = 9, B = 2.8;
  const H = hull(A, {
    L, B, T: 0.45, D: 1.35, bow: 0.42, stern: 0.04, transom: 0.95, bowP: 1.7, bowQ: 0.7, entry: 0.95, wlP: 1.3, wlB: 0.9, q: 1.0, flat: 0.05,
    sheerF: 0.3, rake: 1.0, ff: 0.35, ffRise: 0.7, run: 0.02, runRise: 0.1, sRake: 0.15, boot: [0.06, 0.12],
    stripe: [0.3, 0.55], topC: WHITE, stripeC: 0x1d3f6e, deck: OFFWHITE, nU: 36, nUf: 10,
  });
  const lod = A.lod;
  const yD = H.deckY(0);
  // Metallic rubbing strake, teak cockpit sole & swim platform, raked metallic windshield frame, two-tone upholstery, twin outboards!
  if (!lod) {
    const pts = [];
    for (let z = -4.5; z <= 4.3; z += 0.5) { const [hb, y] = H.edge(z); pts.push([hb + 0.04, y - 0.05, z]); }
    for (const sd of [1, -1]) for (let k = 0; k < pts.length - 1; k++) A.rod([pts[k][0] * sd, pts[k][1], pts[k][2]], [pts[k + 1][0] * sd, pts[k + 1][1], pts[k + 1][2]], 0.05, 0xc9cbd0, 5);
  }
  A.box(2.0, 0.12, 4.4, 0, yD - 0.35, -1.4, TEAK);                   // teak cockpit sole
  A.box(2.2, 0.10, 0.65, 0, 0.18, -4.65, TEAK);                      // teak stern swim platform
  A.box(0.9, 0.85, 0.9, 0.38, yD - 0.35, 0.6, WHITE);                 // helm console
  if (!lod) {
    A.torus(0.18, 0.02, 0.38, yD + 0.25, 0.12, 0xc9cbd0, { rx: 0.45, rs: 6, ts: 10 }); // steering wheel
    A.rod([0.65, yD + 0.3, 0.3], [0.65, yD + 0.52, 0.38], 0.02, 0xc9cbd0, 5);          // throttle lever
  }
  // Raked wrap-around metallic windshield frame + tinted glass panes.
  A.panel(0, yD + 0.32, 1.25, 1.56, 0.56, 0, 0x1e3348, E_GLASS, -0.9);
  for (const sd of [1, -1]) {
    A.panel(sd * 0.96, yD + 0.32, 0.95, 0.64, 0.52, sd * 1.0, 0x1e3348, E_GLASS, -0.5);
    if (!lod) {
      A.rod([sd * 0.78, yD + 0.05, 1.50], [sd * 0.76, yD + 0.56, 1.05], 0.032, 0xc9cbd0, 5);
      A.rod([sd * 0.76, yD + 0.56, 1.05], [sd * 1.12, yD + 0.48, 0.52], 0.03, 0xc9cbd0, 5);
    }
  }
  A.rod([-0.76, yD + 0.56, 1.05], [0.76, yD + 0.56, 1.05], 0.034, 0xc9cbd0, 6);
  A.rod([0, yD, -4.3], [0, yD + 1.3, -4.3], 0.025, 0xc9cbd0, 4); // stern light pole
  // Two-tone luxury upholstery: cream cushions (`0xebe5d8`) with cognac/navy bolster trim (`0x8c5332` / `0x1d3f6e`)
  const CUSHION = 0xebe5d8, BOLSTER = 0x9a5b36;
  for (const x of [-0.55, 0.55]) {
    A.box(0.62, 0.45, 0.62, x, yD - 0.35, -0.6, CUSHION);
    A.box(0.64, 0.14, 0.64, x, yD - 0.02, -0.6, BOLSTER);
    A.box(0.62, 0.62, 0.16, x, yD + 0.1, -0.95, CUSHION, { rx: -0.2 });
    A.box(0.56, 0.18, 0.17, x, yD + 0.55, -1.02, BOLSTER, { rx: -0.2 });
  }
  // Two-tone aft bench & sun pad
  A.box(2.12, 0.42, 1.25, 0, yD - 0.35, -3.55, CUSHION);
  A.box(2.14, 0.18, 0.25, 0, yD + 0.05, -2.98, BOLSTER);
  for (const sx of [-0.55, 0, 0.55]) A.box(0.44, 0.06, 1.1, sx, yD + 0.06, -3.58, BOLSTER);
  // Two-tone bow sun-pad lounger
  A.box(1.8, 0.32, 1.65, 0, yD - 0.05, 3.0, CUSHION);
  A.box(1.6, 0.14, 0.32, 0, yD + 0.22, 2.25, BOLSTER);
  // Twin rear outboard motors with sculpted cowlings, silver accent band, lower leg & bronze propellers
  for (const x of [-0.48, 0.48]) {
    A.box(0.44, 0.88, 0.62, x, 0.12, -4.82, BLACK, { rx: 0.08 });
    A.box(0.46, 0.16, 0.64, x, 0.62, -4.82, 0xc9cbd0, { rx: 0.08 });
    A.box(0.16, 0.92, 0.32, x, -0.72, -4.82, DARK);
    if (!lod) A.cyl(0.16, 0.18, x, -0.58, -5.02, 0x9c7a3c, { rx: Math.PI / 2, seg: 8 });
  }
  if (!lod) A.rail([[-0.75, yD, 3.5], [0, yD, 4.4], [0.75, yD, 3.5]], 0.45, 0xc9cbd0, 0.8);
  navLights(A, 0.9, yD + 0.05, 3.6, -4.3, yD + 1.3, 0.1);
}

function patrolBoat(A) {
  const L = 32, B = 7;
  const H = hull(A, {
    L, B, T: 1.8, D: 4.2, bow: 0.42, stern: 0.05, transom: 0.92, bowP: 1.6, bowQ: 0.8, entry: 1.0, wlP: 1.4, wlB: 0.92, q: 1.3, flat: 0.12,
    sheerF: 1.0, rake: 0.6, ff: 0.2, ffRise: 0.4, run: 0.04, runRise: 0.3, sRake: 0.05, boot: [0.25, 0.2],
    stripe: [0.25, 0.6], topC: 0x8e959b, stripeC: 0xd23a2a, deck: 0x5c6166, nU: 44,
  });
  const lod = A.lod;
  const yD = H.deckY(0);
  // Grey naval stealth faceted superstructure with raked pilothouse windows & bridge wing stations.
  A.prism([[-2.9, -7], [2.9, -7], [2.9, 3.5], [1.6, 6.5], [-1.6, 6.5], [-2.9, 3.5]], yD, 2.6, 0x8e959b, { pa: P_HULL, top: 0x6d747a, taper: 0.92, smooth: false });
  A.prism([[-2.5, -3.5], [2.5, -3.5], [2.5, 2.5], [1.4, 5], [-1.4, 5], [-2.5, 2.5]], yD + 2.6, 2.3, 0x8e959b, { pa: P_HULL, top: 0x6d747a, taper: 0.90, smooth: false });
  if (lod) {
    A.box(5.1, 1.0, 8.6, 0, yD + 3.4, 0.7, GLASS, { em: E_LIT });
  } else {
    for (let k = -1; k <= 1; k++) A.panel(k * 0.95, yD + 3.95, 5.03, 0.9, 1.0, 0, GLASS, E_LIT, -0.35);
    for (const sd of [1, -1]) {
      A.panel(sd * 1.97, yD + 3.95, 3.77, 1.3, 1.0, sd * 0.43, GLASS, E_LIT, -0.3);
      A.winX(sd * 2.5, sd, -3, 2.2, yD + 3.95, 1.1, 0.9, 1.3, 0.8);
      A.winX(sd * 2.9, sd, -6.5, 3, yD + 1.5, 0.5, 0.45, 1.6, 0.4);
      liferaft(A, sd * 2.45, yD + 2.6, -5.2, 0.42, 1.15);
      lifebuoy(A, sd * 2.85, yD + 1.3, -5.8, Math.PI / 2, 0.34);
    }
  }
  // Lattice mast with spherical radar dome, surface-search scanner, EO/IR turret & blue strobe lightbar.
  const ym = yD + 4.9;
  for (const [x, z] of [[-0.6, -1.5], [0.6, -1.5], [0, 0.2]]) A.rod([x, ym, z], [0, ym + 4.5, -0.8], 0.08, 0xd0d4d8, 6);
  A.box(2.6, 0.12, 0.32, 0, ym + 3.0, -0.8, 0xd0d4d8);
  A.sphere(0.68, 0.55, 0.68, 0, ym + 4.95, -0.8, WHITE, { w: 12, h: 10 });
  A.cyl(0.62, 0.14, 0, ym + 4.4, -0.8, WHITE, { seg: 10 });
  A.box(1.8, 0.26, 0.32, 0, ym, 2.5, 0x1840d0, { em: E_BLUE });
  if (!lod) {
    A.cyl(0.22, 0.45, 0, ym, 3.5, 0x6d747a, { seg: 8 });
    A.sphere(0.26, 0.26, 0.26, 0, ym + 0.55, 3.5, DARK, { w: 10, h: 8 }); // EO/IR sensor ball
  }
  A.sphere(0.12, 0.12, 0.12, 0, ym + 5.55, -0.8, 0xffffff, { em: E_WHITE });
  // Detailed bow naval autocannon gun mount (pedestal, faceted stealth turret cupola, barrel & muzzle brake).
  const yb = H.deckY(10);
  A.cyl(0.68, 0.72, 0, yb, 10, 0x6d747a, { seg: 12 });
  A.prism([[-0.65, 9.3], [0.65, 9.3], [0.72, 10.2], [0.42, 10.8], [-0.42, 10.8], [-0.72, 10.2]], yb + 0.72, 0.68, 0x6d747a, { taper: 0.78, smooth: false });
  A.rod([0, yb + 1.05, 10.5], [0, yb + 1.12, 13.0], 0.075, DARK, 8);
  if (!lod) A.cyl(0.11, 0.28, 0, yb + 0.98, 12.95, DARK, { seg: 8 });
  // Inflatable RIB tender on aft deck cradle with sponsons, center console, outboard motor & launch crane davit.
  A.capsule(0.62, 5.4, 0, yD + 0.65, -11, 0x2e3136, { sy: 0.8, sx: 1.25, seg: 10 });
  A.box(1.4, 0.3, 4.2, 0, yD + 0.75, -11, 0x7a7d80);
  if (!lod) {
    A.box(0.55, 0.65, 0.55, 0, yD + 0.95, -10.5, OFFWHITE);           // RIB center console
    A.box(0.32, 0.55, 0.38, 0, yD + 0.65, -13.6, BLACK);              // RIB outboard motor
    crane(A, 2.2, yD, -8.2, { r: 0.28, h: 1.8, boom: 3.6, yaw: -2.4, lift: 0.35, hex: 0x6d747a, drop: 1.6 }); // RIB launch davit crane
  }
  if (!lod) {
    const pts = [];
    for (let z = -15.4; z <= 13; z += 1.6) { const [hb, y] = H.edge(z); pts.push([hb - 0.1, y, z]); }
    for (const sd of [1, -1]) A.rail(pts.map((p) => [p[0] * sd, p[1], p[2]]), 0.9, 0xc9cdd0, 1.5);
  }
  navLights(A, 2.95, yD + 2.3, 3.2, -15.8, yD + 1, 0.2);
}

/** type -> spec. length / beam / height (m, nominal) are what live AIS dimensions are scaled against. */
export const VESSEL_TYPES = {
  container: { make: containerShip, length: 300, beam: 48, height: 40, hp: 12, draft: 13 },
  tanker: { make: tanker, length: 250, beam: 44, height: 38, hp: 10, draft: 14 },
  cargo: { make: bulkCarrier, length: 190, beam: 32, height: 32, hp: 9, draft: 11 },
  carferry: { make: carFerry, length: 150, beam: 26, height: 30, hp: 8, draft: 6 },
  ferry: { make: catamaranFerry, length: 40, beam: 12, height: 12, hp: 4, draft: 1.5 },
  tug: { make: tug, length: 30, beam: 11, height: 14, hp: 2, draft: 3.2 },
  fishing: { make: fishingBoat, length: 26, beam: 7.6, height: 13, hp: 1.6, draft: 2.8 },
  sailboat: { make: sailboat, length: 12, beam: 3.8, height: 17, hp: 0.6, draft: 2.1 },
  speedboat: { make: speedboat, length: 9, beam: 2.8, height: 2.6, hp: 0.4, draft: 0.5 },
  patrol: { make: patrolBoat, length: 32, beam: 7, height: 12, hp: 3, draft: 1.8 },
};

const GEO_CACHE = new Map();
/** Merged geometry for a vessel type (lod 0 near, 1 far), built on first use and cached. */
export function buildVesselGeometry(type, lod = 0) {
  const key = `${type}:${lod}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    const A = new Acc(lod, 7 + type.length * 13);
    VESSEL_TYPES[type].make(A);
    g = A.build();
    GEO_CACHE.set(key, g);
  }
  return g;
}

// Container colours (linear): typical box liveries.
const BOX_COLS = [0xb5371f, 0x1f5fa8, 0xd9a21b, 0x2f7d3c, 0x8c8f94, 0xe06a1b, 0x5a2d82, 0xc7c9cc, 0x2a8c8c, 0x7a1f1f, 0x1d2f4f, 0xa04a2a];
const uBoxCols = BOX_COLS.map((h) => new THREE.Color(h));

/**
 * Vessel material: vertex colours with per-instance hull / accent paint and container colours, glossy glass,
 * lit windows and navigation lights at night (`uniforms.uLights` 0..1), charring when damaged.
 * Instance attributes: iPaint (rgb hull), iAccent (rgb), iState (seed, char 0..1).
 */
export function createVesselMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.uniforms.uBoxCols = { value: uBoxCols };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aInfo;
attribute vec3 iPaint;
attribute vec3 iAccent;
attribute vec2 iState;
uniform vec3 uBoxCols[${BOX_COLS.length}];
varying float vEmit;
varying float vChar;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
  {
    float pc = floor(aInfo.x + 0.001);
    if (pc > 0.5 && pc < 1.5) vColor.rgb = iPaint;
    else if (pc > 1.5 && pc < 2.5) vColor.rgb = iAccent;
    else if (pc > 2.5) {
      float h = fract(sin(fract(aInfo.x) * 1000.0 * 12.9898 + iState.x * 78.233) * 43758.5453);
      int k = int(h * ${BOX_COLS.length}.0);
      float shade = 0.82 + 0.18 * fract(h * 17.0);
      vColor.rgb = uBoxCols[k] * shade;
    }
    vChar = iState.y;
    vColor.rgb *= 1.0 - 0.85 * vChar;
    vEmit = aInfo.y;
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLights;
varying float vEmit;
varying float vChar;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float vGlass = step(0.5, vEmit) * step(vEmit, 2.5);
  roughnessFactor = mix(roughnessFactor, 0.16, vGlass);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.2, step(0.5, vEmit) * step(vEmit, 2.5));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float alive = 1.0 - step(0.3, vChar);
    float lit = step(0.5, vEmit) * step(vEmit, 1.5);
    float red = step(2.5, vEmit) * step(vEmit, 3.5);
    float green = step(3.5, vEmit) * step(vEmit, 4.5);
    float white = step(4.5, vEmit) * step(vEmit, 5.5);
    float blue = step(5.5, vEmit);
    totalEmissiveRadiance += alive * (
      lit * vec3(1.0, 0.72, 0.4) * uLights * 1.6 +
      red * vec3(1.0, 0.08, 0.05) * (0.2 + uLights * 2.5) +
      green * vec3(0.1, 1.0, 0.25) * (0.2 + uLights * 2.5) +
      white * vec3(1.0, 0.95, 0.85) * (0.15 + uLights * 2.5) +
      blue * vec3(0.15, 0.3, 1.0) * (0.3 + uLights * 2.0));
  }`);
  };
  mat.customProgramCacheKey = () => 'we-vessel-v1';
  return mat;
}

/** Fresh geometry wrapper sharing the cached buffers, with its own per-instance attributes. */
export function vesselInstanceGeometry(type, lod, capacity) {
  const base = buildVesselGeometry(type, lod);
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aInfo']) g.setAttribute(k, base.attributes[k]);
  g.setIndex(base.index);
  g.boundingSphere = base.boundingSphere;
  const mk = (n, fill = 0) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n).fill(fill), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  g.setAttribute('iPaint', mk(3, 1));
  g.setAttribute('iAccent', mk(3, 1));
  g.setAttribute('iState', mk(2));
  return g;
}

let wakeTex = null;
/** Soft V-shaped foam wake texture (bow at v = 1, fading astern). */
export function wakeTexture() {
  if (wakeTex || typeof document === 'undefined') return wakeTex;
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);            // 0 = bow, 1 = far astern
    const spread = 0.08 + t * 0.42;   // half-width of the V at this distance
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5);
      const arm = Math.exp(-Math.pow((u - spread) / (0.025 + t * 0.05), 2));
      const centre = Math.exp(-Math.pow(u / (0.05 + t * 0.06), 2)) * 0.8;
      const a = Math.min(1, arm * 0.9 + centre) * Math.pow(1 - t, 1.4) * (u < spread + 0.1 ? 1 : 0.3);
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  wakeTex = new THREE.CanvasTexture(c);
  wakeTex.colorSpace = THREE.SRGBColorSpace;
  return wakeTex;
}
