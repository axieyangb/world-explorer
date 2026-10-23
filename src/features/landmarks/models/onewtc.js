// feature/famous-landmarks: One World Trade Center, Lower Manhattan — 1:1 (parapet 417 m, spire 541 m).
// 61 m square podium (57 m tall, glass fins), then the chamfered square-to-octagon antiprism: the base
// square's corners are cut back by eight tall isosceles triangles so the top (417 m) is the same square
// rotated 45°. Silvery-blue glass with floor bands, rooftop ring and the 124 m spire whose beacon glows.

const GLASS_A = 0xa6b8d2, GLASS_B = 0x8ea3c4, GLASS_C = 0xc4d0e0, FIN = 0xc9d1d8, PODIUM = 0xaab7c2;
const STEEL = 0xd8dde2, STEEL_DK = 0x9aa3ac;

export const lodDist = 2000;
export const glowStrength = 2.4;

const HB = 30.5;            // half base width (61 m)
const Y0 = 57, Y1 = 417;    // antiprism from podium top to parapet

export const colliders = [
  { x: 0, z: 0, hw: HB, hd: HB, h: Y0 },
  { x: 0, z: 0, hw: 27, hd: 27, h: 160 },
  { x: 0, z: 0, r: 27, h: 290 },
  { x: 0, z: 0, hw: 22, hd: 22, h: Y1, rot: 45 },
  { x: 0, z: 0, r: 4, h: 530 },
];

// eight slanted edges, ordered around: each = [bottom point (base corner), top point (top-square vertex)]
const EDGES = (() => {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const ab = Math.PI / 4 + (i * Math.PI) / 2;               // base corner angle
    const B = [Math.cos(ab) * HB * Math.SQRT2, Math.sin(ab) * HB * Math.SQRT2];
    const T0 = [Math.cos(ab - Math.PI / 4) * HB, Math.sin(ab - Math.PI / 4) * HB];
    const T1 = [Math.cos(ab + Math.PI / 4) * HB, Math.sin(ab + Math.PI / 4) * HB];
    out.push([B, T0], [B, T1]);
  }
  return out;
})();
const sect = (t, s = 1) => EDGES.map(([b, tp]) => [(b[0] + (tp[0] - b[0]) * t) * s, (b[1] + (tp[1] - b[1]) * t) * s]);
const Yt = (t) => Y0 + (Y1 - Y0) * t;

/** Band between section t0 and t1 (outward faces), optional scale. */
function ring(k, t0, t1, s = 1, colors = null) {
  const A = sect(t0, s), B = sect(t1, s), ya = Yt(t0), yb = Yt(t1);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    if (colors) k.color(colors[i % colors.length]);
    // winding: CCW seen from outside (EDGES go counter-clockwise in x/z, which is clockwise seen from +Y)
    k.quad([A[i][0], ya, A[i][1]], [B[i][0], yb, B[i][1]], [B[j][0], yb, B[j][1]], [A[j][0], ya, A[j][1]]);
  }
}

export function build(k) {
  const hi = k.hi;
  // --- podium: 61 m square, 57 m tall, vertical glass fins
  k.color(PODIUM).box(0, 0, 0, 2 * HB, Y0, 2 * HB);
  if (hi) {
    k.glow(true).color(0x8a9aa8).box(0, 0, 0, 2 * HB + 0.3, 6, 2 * HB + 0.3).glow(false);   // lobby glazing
    k.color(FIN);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (let i = 0; i < 26; i++) k.box(-HB + 1.2 + i * ((2 * HB - 2.4) / 25), 6, -HB - 0.25, 0.5, Y0 - 6, 0.5);
      k.pop();
    }
  }
  // --- the antiprism shaft (planar faces: one band is exact; hi detail adds floor bands)
  ring(k, 0, 1, 1, [GLASS_A, GLASS_B]);
  // top cap (rotated square)
  const T = sect(1);
  k.color(STEEL_DK).quad([T[0][0], Y1, T[0][1]], [T[6][0], Y1, T[6][1]], [T[4][0], Y1, T[4][1]], [T[2][0], Y1, T[2][1]]);
  k.quad([T[0][0], Y1, T[0][1]], [T[2][0], Y1, T[2][1]], [T[4][0], Y1, T[4][1]], [T[6][0], Y1, T[6][1]]);
  if (hi) {
    // floor bands (thin outset strips) every ~4 floors, lit at night
    k.glow(true).color(0x6f8193);
    const n = 24;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ring(k, t, t + 0.0035, 1.004);
    }
    k.glow(false);
    // bright corner arrises of the chamfers
    k.color(GLASS_C);
    for (const [b, tp] of EDGES) k.strut([b[0], Y0, b[1]], [tp[0], Y1, tp[1]], 0.6);
    // podium-to-tower transition ledge
    k.color(FIN).box(0, Y0, 0, 2 * HB + 0.6, 1.2, 2 * HB + 0.6);
  }
  // --- rooftop: parapet ring, spire base and the 124 m spire
  k.color(STEEL).cyl(0, Y1, 0, 10, 9, 3, hi ? 20 : 8);
  if (hi) {
    k.color(STEEL_DK).lathe(0, Y1 + 3, 0, [[16, 0], [16, 1.2]], 24);      // communications ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.strut([Math.cos(a) * 16, Y1 + 3.6, Math.sin(a) * 16], [Math.cos(a) * 3, Y1 + 14, Math.sin(a) * 3], 0.7);
    }
  }
  k.color(STEEL).lathe(0, Y1 + 3, 0, [[4.2, 0], [3.6, 30], [2.6, 70], [1.6, 100], [0.9, 113]], hi ? 12 : 6);
  if (hi) {
    k.color(STEEL_DK);
    for (const y of [440, 462, 484, 505]) {
      const r = 4.2 - ((y - Y1 - 3) / 113) * 3.3;
      k.lathe(0, y, 0, [[r + 0.9, 0], [r + 0.9, 1.4]], 12);
    }
  }
  k.glow(true).color(0xf4f8ff).cyl(0, 533, 0, 1.1, 0.25, 8, hi ? 8 : 4);   // beacon
  k.glow(false);
}
