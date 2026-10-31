// feature/beijing-landmarks: National Aquatics Center "Water Cube" (国家游泳中心), Beijing — 1:1.
// 177 x 177 x 31 m box clad in blue ETFE cushions. The Weaire–Phelan foam structure shows on every
// face as irregular polygon bubbles: a Voronoi pattern of jittered sites, each cell an inflated
// pillow inside a pale steel frame, with recessed glazed entrance portals on all 4 sides, surrounding
// moat reflection pools, and the glowing Olympic Rings monument on the west plaza.
import { Kit } from "../kit.js";

export const lodDist = 1800;
export const glowStrength = 3.0;

const W = 177, H = 31, HW = W / 2;
const FRAME = 0xdde7ee, EDGE = 0xc9d6e0, GLASS_PORTAL = 0x1b344d, MOAT = 0x266894;
const BLUES = [0x4d9fdc, 0x5aa9e2, 0x6bb6e8, 0x4592d2, 0x79c0ec];

export const colliders = [{ x: 0, z: 0, hw: HW, hd: HW, h: H }];

// deterministic PRNG (mulberry32)
function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// clip convex polygon [[s,t]...] by half-plane n.p <= d
function clip(poly, nx, ny, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = p[0] * nx + p[1] * ny - d, dq = q[0] * nx + q[1] * ny - d;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const f = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    }
  }
  return out;
}

/** Voronoi cells of a jittered grid over [0,w]x[0,h]. */
function cells(w, h, g, seed) {
  const R = rng(seed);
  const nx = Math.max(1, Math.round(w / g)), ny = Math.max(1, Math.round(h / g));
  const gx = w / nx, gy = h / ny;
  const S = [];
  for (let j = 0; j < ny; j++) {
    S.push([]);
    for (let i = 0; i < nx; i++) {
      // mixed bubble sizes: occasional strong jitter
      const jx = (R() - 0.5) * 0.9, jy = (R() - 0.5) * 0.9;
      S[j].push([(i + 0.5 + jx) * gx, (j + 0.5 + jy) * gy]);
    }
  }
  const out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = S[j][i];
    let poly = [[0, 0], [w, 0], [w, h], [0, h]];
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      if (!a && !b) continue;
      const q = S[j + b] && S[j + b][i + a];
      if (!q) continue;
      const vx = q[0] - p[0], vy = q[1] - p[1];
      poly = clip(poly, vx, vy, (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2);
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

/** Bubble face: origin O, unit axes U (s) and V (t), outward N; w x h metres. */
function bubbleFace(k, O, U, V, N, w, h, g, seed) {
  const P = (s, t, n) => [O[0] + U[0] * s + V[0] * t + N[0] * n, O[1] + U[1] * s + V[1] * t + N[1] * n, O[2] + U[2] * s + V[2] * t + N[2] * n];
  // winding: front = +N when (U x V) . N > 0
  const cr = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
  const flip = cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2] < 0;
  const Q = (a, b, c, d) => (flip ? k.quad(d, c, b, a) : k.quad(a, b, c, d));
  const T = (a, b, c) => (flip ? k.tri(c, b, a) : k.tri(a, b, c));
  const R = rng(seed * 7 + 3);
  for (const poly of cells(w, h, g, seed)) {
    let cx = 0, cy = 0;
    for (const p of poly) { cx += p[0]; cy += p[1]; }
    cx /= poly.length; cy /= poly.length;
    const inner = poly.map(([s, t]) => {
      const dx = s - cx, dy = t - cy, l = Math.hypot(dx, dy) || 1;
      const f = Math.max(0.15, 1 - 0.42 / l);
      return [cx + dx * f, cy + dy * f];
    });
    const n = poly.length;
    k.glow(false).color(FRAME);
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], c = inner[(i + 1) % n], d = inner[i];
      Q(P(a[0], a[1], 0.35), P(b[0], b[1], 0.35), P(c[0], c[1], 0.35), P(d[0], d[1], 0.35));
    }
    let rr = 0;
    for (const p of poly) rr += Math.hypot(p[0] - cx, p[1] - cy);
    const bulge = Math.min(0.9, (rr / n) * 0.16);
    k.glow(true).color(BLUES[Math.floor(R() * BLUES.length)]);
    const C = P(cx, cy, 0.25 + bulge);
    for (let i = 0; i < n; i++) {
      const a = inner[i], b = inner[(i + 1) % n];
      T(P(a[0], a[1], 0.25), P(b[0], b[1], 0.25), C);
    }
  }
  k.glow(false);
}

export function build(k) {
  if (!k.hi) {
    // far impostor: blue box + pale edge frame
    k.glow(true).color(BLUES[1]).box(0, 0, 0, W, H, W).glow(false);
    k.color(EDGE);
    for (const [x, z] of [[-HW, -HW], [HW, -HW], [HW, HW], [-HW, HW]]) k.box(x, 0, z, 1.4, H + 0.3, 1.4);
    return;
  }
  // dark core behind the cushions (fills any slivers)
  k.color(0x2f5f86).box(0, 0, 0, W - 0.4, H - 0.2, W - 0.4);
  const g = 5.2, gr = 7.0;
  // four walls: s runs left->right seen from outside, t up
  bubbleFace(k, [-HW, 0, -HW], [1, 0, 0], [0, 1, 0], [0, 0, -1], W, H, g, 11); // north (-Z)
  bubbleFace(k, [HW, 0, HW], [-1, 0, 0], [0, 1, 0], [0, 0, 1], W, H, g, 23);   // south (+Z)
  bubbleFace(k, [HW, 0, -HW], [0, 0, 1], [0, 1, 0], [1, 0, 0], W, H, g, 37);   // east (+X)
  bubbleFace(k, [-HW, 0, HW], [0, 0, -1], [0, 1, 0], [-1, 0, 0], W, H, g, 41); // west (-X)
  bubbleFace(k, [-HW, H, -HW], [1, 0, 0], [0, 0, 1], [0, 1, 0], W, W, gr, 53); // roof
  // steel edge frame along the 12 box edges
  k.color(EDGE);
  const e = 1.2, top = H + 0.4;
  for (const [x, z] of [[-HW, -HW], [HW, -HW], [HW, HW], [-HW, HW]]) k.box(x, 0, z, e, top, e);
  k.box(0, H - 0.4, -HW, W + e, 1.2, e).box(0, H - 0.4, HW, W + e, 1.2, e);
  k.box(-HW, H - 0.4, 0, e, 1.2, W + e).box(HW, H - 0.4, 0, e, 1.2, W + e);
  // low entrance plinth band & perimeter moat reflection pools
  k.color(0x8d99a3).box(0, 0, 0, W + 3.2, 0.7, W + 3.2);
  // 4 Recessed Glazed Entrance Portals with Steel Canopies & Entry Bridges at the mid-sides
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.color(FRAME).box(0, 0.7, -HW - 1.2, 32, 8.8, 1.8);
    k.color(GLASS_PORTAL).box(0, 0.7, -HW - 1.5, 29.5, 7.6, 1.4);
    // Warm interior lobby glow & glass door mullions
    k.glow(true).color(0x9ce2ff).box(0, 0.9, -HW - 1.65, 28.0, 4.2, 0.3).glow(false);
    k.color(FRAME);
    for (let x = -12; x <= 12; x += 4) k.box(x, 0.7, -HW - 1.8, 0.25, 7.6, 0.35);
    // Entrance causeway bridge across the perimeter moat
    k.color(0xc8ced4).box(0, 0, -HW - 5.5, 26, 0.85, 8.5);
    // Perimeter reflecting moat basins flanking the entrance causeway
    for (const sx of [-52, 52]) {
      k.color(0x8d99a3).box(sx, 0, -HW - 5.5, 68, 0.65, 7.5);
      k.color(MOAT).box(sx, 0.1, -HW - 5.5, 66.5, 0.62, 6.4);
    }
    k.pop();
  }
}
