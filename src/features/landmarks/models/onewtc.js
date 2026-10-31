// feature/famous-landmarks: One World Trade Center, Lower Manhattan — 1:1 (parapet 417 m, spire 541 m).
// 61 m square podium (57 m tall, stainless-steel prism fins), then the chamfered square-to-octagon antiprism:
// the base square's corners are cut back by eight tall isosceles triangles so the top (417 m) is the same square
// rotated 45°. Silvery-blue glass with floor bands, rooftop ring and the 124 m spire whose beacon glows.

const GLASS_A = 0xa6b8d2, GLASS_B = 0x8ea3c4, GLASS_C = 0xc4d0e0, FIN = 0xc9d1d8, PODIUM = 0xaab7c2;
const STEEL = 0xd8dde2, STEEL_DK = 0x9aa3ac, LIT = 0xdbeaff;

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

const EDGES = (() => {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const ab = Math.PI / 4 + (i * Math.PI) / 2;
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
    k.quad([A[i][0], ya, A[i][1]], [B[i][0], yb, B[i][1]], [B[j][0], yb, B[j][1]], [A[j][0], ya, A[j][1]]);
  }
}

export function build(k) {
  const hi = k.hi;
  // Granite plaza plinth
  k.glow(false).color(0xbec4ca).box(0, -2.5, 0, 82, 2.7, 82);
  // --- podium: 61 m square, 57 m tall, angled stainless-steel & laminated glass fins
  k.color(PODIUM).box(0, 0, 0, 2 * HB, Y0, 2 * HB);
  if (hi) {
    // 15m high transparent cable-net lobby glazing & projecting steel entrance portals on all 4 sides
    k.glow(true).color(LIT).box(0, 0.2, 0, 2 * HB + 0.35, 12.5, 2 * HB + 0.35).glow(false);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      // Projecting stainless steel entrance portal canopy
      k.color(STEEL).box(0, 11.8, -HB - 2.6, 22, 1.1, 5.2);
      k.color(STEEL_DK).box(-9.5, 0.2, -HB - 1.8, 0.9, 11.6, 3.6).box(9.5, 0.2, -HB - 1.8, 0.9, 11.6, 3.6);
      // Dense vertical V-angled stainless steel & glass prism fins across podium (y = 12.5 .. 57m)
      k.color(FIN);
      for (let i = 0; i < 32; i++) {
        const fx = -HB + 1.0 + i * ((2 * HB - 2.0) / 31);
        k.box(fx, 12.5, -HB - 0.35, 0.45, Y0 - 12.5, 0.85);
      }
      // Horizontal mechanical louver bands across podium
      k.color(STEEL_DK);
      for (const py of [24, 38, 51]) k.box(0, py, -HB - 0.45, 2 * HB + 0.2, 1.2, 0.9);
      k.pop();
    }
  }
  // --- the antiprism shaft (8 interlocking isosceles triangles)
  ring(k, 0, 1, 1, [GLASS_A, GLASS_B]);
  // top cap (rotated square)
  const T = sect(1);
  k.color(STEEL_DK).quad([T[0][0], Y1, T[0][1]], [T[6][0], Y1, T[6][1]], [T[4][0], Y1, T[4][1]], [T[2][0], Y1, T[2][1]]);
  k.quad([T[0][0], Y1, T[0][1]], [T[2][0], Y1, T[2][1]], [T[4][0], Y1, T[4][1]], [T[6][0], Y1, T[6][1]]);
  if (hi) {
    // Illuminated floor bands every 2 floors + One World Observatory triple-height glowing bands (floors 100-102)
    k.glow(true).color(0x88a4c4);
    const n = 48;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const isObs = t > 0.88 && t < 0.94;
      if (isObs) k.color(0xe8f4ff);
      ring(k, t, t + (isObs ? 0.009 : 0.0038), 1.004);
      if (isObs) k.color(0x88a4c4);
    }
    k.glow(false);
    // Mechanical louver bands near top (floors 91-93)
    k.color(0x52606e);
    ring(k, 0.82, 0.845, 1.006);
    ring(k, 0.955, 0.975, 1.006);
    // Crisp stainless-steel corner arrises of the 8 triangular chamfers + intermediate curtain-wall mullions
    k.color(GLASS_C);
    for (let e = 0; e < 8; e++) {
      const [b, tp] = EDGES[e];
      const [bNext, tpNext] = EDGES[(e + 1) % 8];
      k.strut([b[0], Y0, b[1]], [tp[0], Y1, tp[1]], 0.65);
      // 3 intermediate mullion lines interpolated across each triangular facet
      for (let m = 1; m <= 3; m++) {
        const u = m / 4;
        const bx = b[0] + (bNext[0] - b[0]) * u, bz = b[1] + (bNext[1] - b[1]) * u;
        const tx = tp[0] + (tpNext[0] - tp[0]) * u, tz = tp[1] + (tpNext[1] - tp[1]) * u;
        k.strut([bx * 1.003, Y0, bz * 1.003], [tx * 1.003, Y1, tz * 1.003], 0.24);
      }
    }
    // podium-to-tower transition ledge & corner stainless-steel caps
    k.color(FIN).box(0, Y0, 0, 2 * HB + 0.8, 1.4, 2 * HB + 0.8);
  }
  // --- rooftop: parapet ring, communications ring, diagonal Kevlar guy-struts, and the 124 m 18-section spire
  k.color(STEEL).cyl(0, Y1, 0, 11.5, 10.2, 3.5, hi ? 24 : 8);
  if (hi) {
    // Sculpted open steel communications ring & lattice platform at 420.5m
    k.color(STEEL).torus(0, Y1 + 3.6, 0, 16.5, 0.85, 32, 10);
    k.color(STEEL_DK).torus(0, Y1 + 5.2, 0, 14.2, 0.55, 32, 8);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.color(STEEL).strut([Math.cos(a) * 16.5, Y1 + 3.6, Math.sin(a) * 16.5], [Math.cos(a) * 3.8, Y1 + 16, Math.sin(a) * 3.8], 0.55);
      k.color(STEEL_DK).strut([Math.cos(a) * 16.5, Y1 + 3.6, Math.sin(a) * 16.5], [Math.cos(a) * 10.2, Y1, Math.sin(a) * 10.2], 0.45);
    }
  }
  k.color(STEEL).lathe(0, Y1 + 3, 0, [[4.2, 0], [3.6, 30], [2.6, 70], [1.6, 100], [0.9, 113]], hi ? 20 : 6);
  if (hi) {
    // 8 microwave radome rings & LED sleeve bands along the 124m spire
    for (const [y, isLit] of [[432, true], [444, false], [456, true], [468, false], [480, true], [492, false], [504, true], [516, false]]) {
      const r = 4.2 - ((y - Y1 - 3) / 113) * 3.3;
      k.glow(isLit).color(isLit ? LIT : STEEL_DK);
      k.lathe(0, y, 0, [[r + 0.95, 0], [r + 1.1, 0.8], [r + 0.95, 1.6]], 20);
    }
    k.glow(false);
  }
  // Rotating LED beacon housing at 533-541m (1776 ft)
  k.glow(true).color(0xf4f8ff).cyl(0, 533, 0, 1.15, 0.25, 8.2, hi ? 16 : 4);
  if (hi) k.color(0xff3322).sphere(0, 541.4, 0, 0.42, 10, 6);
  k.glow(false);
}
