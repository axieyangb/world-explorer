// feature/beijing-landmarks: CITIC Tower (China Zun / 中国尊) — 1:1.
// 528 m supertall shaped like the ancient ritual Zun vessel: a rounded-square plan whose sides curve in
// from a 78 m base to a 54 m waist (~385 m) and flare back out to the 69 m crown, which ends flat (no
// spire). Pale silver glass with fine vertical mullions, horizontal floor spandrel bands, external Zun
// ceremonial diamond lattice bracing at base & crown, curving corner mega-columns, and the glowing lantern crown.
export const lodDist = 2200;
export const glowStrength = 1.6;

export const colliders = [
  { x: 0, z: 0, hw: 39, hd: 39, h: 300 },
  { x: 0, z: 0, hw: 30, hd: 30, h: 468 },
  { x: 0, z: 0, hw: 35, hd: 35, h: 528 },
];

const GLASS = 0x9fb1c3, GLASS_HI = 0xb6c6d5, MULLION = 0xdfe6ee, BAND = 0x6f7c8a, COLUMN = 0xe9eef3;
const LIT = 0xfff0d2, PLAZA = 0xc9cfd6, WATER = 0x3b82b8, TREE = 0x3c7638, TOP = 528;

// half-width profile (y, half-width): Zun-vessel curve
const PROF = [[0, 39], [60, 37.6], [130, 35], [200, 32.3], [270, 29.6], [330, 27.8], [385, 27.0], [430, 28.0],
  [470, 30.6], [505, 33.4], [528, 34.6]];
function halfW(y) {
  for (let i = 0; i < PROF.length - 1; i++) {
    const [y0, a] = PROF[i], [y1, b] = PROF[i + 1];
    if (y <= y1) { const t = (y - y0) / (y1 - y0), s = t * t * (3 - 2 * t); return a + (b - a) * (0.5 * t + 0.5 * s); }
  }
  return PROF[PROF.length - 1][1];
}

/** Rounded-square ring at height y (corner radius ~22% of the half-width), counter-clockwise in x/z. */
function ring(y, hw, n) {
  const r = hw * 0.22, c = hw - r, pts = [];
  const corners = [[c, c, 0], [-c, c, 0.5], [-c, -c, 1], [c, -c, 1.5]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (i / n) * 0.5) * Math.PI;
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Skin between consecutive rings (outward facing). */
function loft(k, rings, colorFn) {
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    if (colorFn) k.color(colorFn(s));
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      k.quad(A[i], B[i], B[j], A[j]);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const n = hi ? 5 : 1;
  // plaza and plinth
  k.color(PLAZA).box(0, 0, 0, 96, 1.2, 96);
  // main shaft: lofted rounded-square rings following the vessel profile
  const ys = [];
  for (let y = 1.2; y < 468; y += hi ? 16 : 52) ys.push(y);
  ys.push(468);
  const rings = ys.map((y) => ring(y, halfW(y), n));
  loft(k, rings, (s) => (s % 2 ? GLASS : GLASS_HI));
  // lantern crown 468 -> 528 (glows at night) and the flat roof
  k.glow(true);
  const crownYs = hi ? [468, 483, 498, 513, TOP] : [468, TOP];
  loft(k, crownYs.map((y) => ring(y, halfW(y), n)), (s) => (s % 2 ? 0xdde3e8 : 0xe9e6dc));
  k.glow(false);
  const roof = ring(TOP, halfW(TOP), n);
  k.color(BAND);
  for (let i = 1; i < roof.length - 1; i++) k.tri(roof[0], roof[i + 1], roof[i]);
  // roof parapet rim
  k.color(COLUMN);
  loft(k, [ring(TOP - 1.2, halfW(TOP) + 0.6, n), ring(TOP + 1.0, halfW(TOP) + 0.6, n)]);
  if (!hi) return;
  // refuge / mechanical floor bands every ~60 m (dark louvres with a lit sill)
  for (const y of [62, 124, 186, 248, 310, 372, 430]) {
    const w = halfW(y) + 0.35;
    k.color(BAND);
    loft(k, [ring(y, w, n), ring(y + 3.6, halfW(y + 3.6) + 0.35, n)]);
    k.glow(true).color(LIT);
    loft(k, [ring(y + 3.6, halfW(y + 3.6) + 0.5, n), ring(y + 4.2, halfW(y + 4.2) + 0.5, n)]);
    k.glow(false);
  }
  // fine vertical mullions: thin fins standing off each face, following the curve
  k.color(MULLION);
  const fy = [];
  for (let y = 1.2; y <= 528; y += 22) fy.push(y);
  if (fy[fy.length - 1] < 528) fy.push(528);
  for (let f = 0; f < 4; f++) {
    for (let m = -7; m <= 7; m++) {
      const u = m / 8.2;
      for (let s = 0; s < fy.length - 1; s++) {
        const pt = (y, o) => { const h = halfW(y) * 0.78, x = u * h, z = -(halfW(y) + o); return f === 0 ? [x, y, z] : f === 1 ? [-z, y, x] : f === 2 ? [-x, y, -z] : [z, y, -x]; };
        const a = fy[s], b = fy[s + 1];
        k.quad2(pt(a, 0.05), pt(b, 0.05), pt(b, 0.75), pt(a, 0.75));
      }
    }
    // External Zun-vessel diamond mega-brace lattice at the lower podium (y = 1.2..62m) & upper lantern crown (y = 468..528m)
    k.color(COLUMN);
    for (const [y0, y1] of [[1.2, 62], [468, 526]]) {
      const pt = (u, y) => {
        const h = halfW(y) * 0.76, x = u * h, z = -(halfW(y) + 0.85);
        return f === 0 ? [x, y, z] : f === 1 ? [-z, y, x] : f === 2 ? [-x, y, -z] : [z, y, -x];
      };
      const ym = (y0 + y1) * 0.5;
      for (let c = -2; c < 2; c++) {
        const u0 = c / 2, u1 = (c + 1) / 2, um = (u0 + u1) * 0.5;
        k.strut(pt(u0, y0), pt(um, ym), 0.75);
        k.strut(pt(u1, y0), pt(um, ym), 0.75);
        k.strut(pt(um, ym), pt(u0, y1), 0.75);
        k.strut(pt(um, ym), pt(u1, y1), 0.75);
      }
    }
  }
  // curving corner mega-columns
  k.color(COLUMN);
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const pts = [];
    for (let y = 1.2; y <= TOP; y += 33) { const h = halfW(y), c = (h - h * 0.22) + h * 0.22 * Math.SQRT1_2 + 0.5; pts.push([sx * c, y, sz * c]); }
    k.tube(pts, 1.5, 6);
  }
  // Rooftop Sky-Lobby / Ceremonial Zun Atrium Pavilion at 525m
  k.glow(true).color(LIT).box(0, TOP + 0.1, 0, 32, 3.2, 32).glow(false);
  k.color(COLUMN).box(0, TOP + 3.3, 0, 34, 0.8, 34);
  // Arched bamboo-rib lobby canopies on all four faces + plaza reflecting pools & trees
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.color(MULLION).box(0, 14, -41.5, 42, 1.1, 7.5);
    for (let r = -18; r <= 18; r += 6) {
      k.color(COLUMN).strut([r, 1.2, -39.2], [r, 14, -44.8], 0.42);
    }
    k.glow(true).color(LIT).box(0, 1.2, -39.3, 32, 12.8, 0.4);
    if (f % 2 === 0) {
      k.color(WATER).box(0, 1.22, -45.2, 52, 0.18, 4.2);
    }
    k.glow(false);
    for (const tx of [-34, 34]) {
      k.color(0x5a4028).cyl(tx, 1.2, -44, 0.35, 0.22, 3.2, 5);
      k.color(TREE).sphere(tx, 5.4, -44, 2.8, 7, 5, 0.85);
    }
    k.pop();
  }
}
