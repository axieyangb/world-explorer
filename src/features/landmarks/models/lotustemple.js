// feature/famous-landmarks: Lotus Temple (Baha'i House of Worship), New Delhi — 1:1 (34.3 m).
// 27 free-standing white-marble petals in three rings of nine on a nine-sided red-sandstone podium:
// nine inner petals rising almost closed around the golden Baha'i nine-pointed star skylight, nine
// outer petals between them, nine entrance petals curling outward as canopies over the doors, and
// nine curved turquoise lotus-leaf reflection pools with radial marble bridges. Nine-fold symmetric;
// front (-Z) = main entrance (N).
const MARBLE = 0xf3f1ea, MARBLE_IN = 0xd9d5c9, MARBLE_DK = 0xc4bfb2, HALL = 0x5f6a70;
const POD = 0xc86d54, POD_DK = 0xa9543d, POOL = 0x26929e, POOL_RIM = 0xd8cec0, GOLD = 0xd8b24c;
const TAU = Math.PI * 2;
const PT = 3.2; // podium top

export const lodDist = 1300;
export const glowStrength = 0.45; // floodlit marble at night
export const colliders = [
  { x: 0, z: 0, r: 40, h: PT },
  { x: 0, z: 0, r: 24, h: 26 },
  { x: 0, z: 0, r: 12, h: 34 },
];

/**
 * One petal shell at azimuth a: spine = quadratic Bezier in the (radius, height) plane through
 * p0 -> p1 -> p2, width W at its widest, cupped by `cup` (fraction of the half width, toward the
 * spine normal), pointed tip. Outer face white marble with panel ribs, inner face shaded with radial ribs.
 */
function petal(k, a, p0, p1, p2, W, cup) {
  const nt = k.hi ? 12 : 4, ns = k.hi ? 8 : 2;
  const ca = Math.cos(a), sa = Math.sin(a);
  const S = (t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };
  const D = (t) => [2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])];
  const G = [];
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const [r, y] = S(t), [dr, dy] = D(t);
    const ln = Math.hypot(dr, dy) || 1;
    const nr = -dy / ln, ny = dr / ln; // spine normal (toward the inside of the curl)
    const w = 0.5 * W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)), 0.75) * (1 - 0.15 * t);
    const row = [];
    for (let j = 0; j <= ns; j++) {
      const s = -1 + (2 * j) / ns;
      const c = cup * w * (1 - s * s);
      const rr = r + nr * c, yy = y + ny * c;
      const tx = s * w; // across, along the azimuth tangent
      row.push([rr * ca - tx * sa, yy, rr * sa + tx * ca]);
    }
    G.push(row);
  }
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < ns; j++) {
      const A = G[i][j], B = G[i][j + 1], Cc = G[i + 1][j + 1], Dd = G[i + 1][j];
      k.color(MARBLE).quad(A, Dd, Cc, B);
      k.color(MARBLE_IN).quad(A, B, Cc, Dd);
    }
  }
  if (k.hi) {
    // Marble rim ribs along both outer edges and central spine rib
    k.color(MARBLE_DK);
    const mid = Math.floor(ns / 2);
    for (let i = 0; i < nt; i++) {
      k.strut(G[i][0], G[i + 1][0], 0.32);
      k.strut(G[i][ns], G[i + 1][ns], 0.32);
      k.strut(G[i][mid], G[i + 1][mid], 0.18);
    }
    // Horizontal chevron panel seams on the petal shell
    for (let i = 2; i < nt; i += 3) {
      for (let j = 0; j < ns; j++) k.strut(G[i][j], G[i][j + 1], 0.12);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 27 : 9;
  // nine-sided red-sandstone podium with marble deck
  k.color(POD).extrude(Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 9);
    return [Math.cos(a) * 38, Math.sin(a) * 38];
  }), 0, PT - 0.3);
  k.color(POOL_RIM).extrude(Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 9);
    return [Math.cos(a) * 38.2, Math.sin(a) * 38.2];
  }), PT - 0.3, 0.3);
  k.color(POD_DK).cyl(0, PT, 0, 33, 33, 0.3, seg, { phase: -Math.PI / 2 });

  // Nine curved lotus-leaf pools & radial stepped bridges around the podium
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + i * (TAU / 9);
    k.push().rotateY(-a - Math.PI / 2);
    for (let s = 0; s < (hi ? 6 : 1); s++) {
      k.color(s % 2 ? POD : POD_DK).box(0, 0, -35.8 - s * 1.1, 8.6, PT - s * 0.5, 1.2);
    }
    if (hi) {
      // Stepped bridge marble balustrades
      k.color(MARBLE);
      for (const sx of [-4.4, 4.4]) {
        k.strut([sx, PT + 0.9, -35.2], [sx, 0.9, -42.5], 0.24);
        for (let s = 0; s < 5; s++) k.box(sx, PT - s * 0.55, -35.8 - s * 1.4, 0.25, 0.9, 0.25);
      }
    }
    k.pop();

    if (hi) {
      // Lotus-leaf pool centered between bridges (at azimuth a + TAU/18)
      const ap = a + TAU / 18;
      const poolPoly = [
        [25.5, -5.2], [35.5, -8.5], [44.5, -5.0], [47.5, 0], [44.5, 5.0], [35.5, 8.5], [25.5, 5.2],
      ].map(([r, t]) => {
        const ca = Math.cos(ap), sa = Math.sin(ap);
        return [r * ca - t * sa, r * sa + t * ca];
      });
      k.color(POOL_RIM).extrude(poolPoly, 0, 0.75);
      const innerPoly = [
        [26.2, -4.6], [35.5, -7.8], [43.8, -4.4], [46.6, 0], [43.8, 4.4], [35.5, 7.8], [26.2, 4.6],
      ].map(([r, t]) => {
        const ca = Math.cos(ap), sa = Math.sin(ap);
        return [r * ca - t * sa, r * sa + t * ca];
      });
      k.color(POOL).extrude(innerPoly, 0.05, 0.76);
    }
  }

  // Podium perimeter balustrade between entrance bridges
  if (hi) {
    for (let i = 0; i < 9; i++) {
      const a0 = -Math.PI / 2 + i * (TAU / 9) + 0.14;
      const a1 = -Math.PI / 2 + (i + 1) * (TAU / 9) - 0.14;
      const p0 = [Math.cos(a0) * 35.5, PT + 0.95, Math.sin(a0) * 35.5];
      const p1 = [Math.cos(a1) * 35.5, PT + 0.95, Math.sin(a1) * 35.5];
      k.color(MARBLE).strut(p0, p1, 0.22);
      for (let j = 0; j <= 4; j++) {
        const t = j / 4, ax = p0[0] + (p1[0] - p0[0]) * t, az = p0[2] + (p1[2] - p0[2]) * t;
        k.box(ax, PT, az, 0.25, 0.95, 0.25);
      }
    }
  }

  // hall drum under the petals (dark glazed gaps)
  k.color(HALL).cyl(0, PT, 0, 21, 19, 9, seg, { phase: -Math.PI / 2 });
  k.color(MARBLE_DK).cyl(0, PT + 9, 0, 21.5, 21.5, 0.6, seg, { phase: -Math.PI / 2 });
  k.glow(true);
  // inner petals: rise from r 17 to the skylight at the top
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + i * (TAU / 9);
    petal(k, a, [16.5, PT + 9], [15.5, 24], [3.2, 34.3], 13.5, 0.35);
  }
  // outer petals: between the inner ones, leaning in, tips curling slightly out
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 9);
    petal(k, a, [23.5, PT], [21, 22], [12.5, 27], 17, 0.4);
  }
  // entrance petals: canopies arching outward over the nine doors
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + i * (TAU / 9);
    petal(k, a, [21, PT + 1], [29, 17], [37.5, 7], 19, -0.35);
  }
  k.glow(false);
  // skylight crown at the centre + golden 9-pointed Baha'i star
  k.color(MARBLE_DK).cyl(0, 30, 0, 3.4, 1.4, 3.6, 9);
  if (hi) {
    k.glow(true).color(GOLD);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      k.strut([0, 33.8, 0], [Math.cos(a) * 2.6, 33.4, Math.sin(a) * 2.6], 0.22);
      // Interior curved concrete arch ribs visible inside the inner lotus bud
      k.color(MARBLE_IN).strut([Math.cos(a) * 15, PT + 10, Math.sin(a) * 15], [Math.cos(a) * 2.8, 33.0, Math.sin(a) * 2.8], 0.45);
      k.color(GOLD);
    }
    k.glow(false);
    // Glazed door portals with brass mullions under the 9 entrance canopies
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + i * (TAU / 9);
      k.push().rotateY(-a - Math.PI / 2);
      k.color(HALL).box(0, PT, -21.2, 5.4, 6.8, 0.6);
      k.color(GOLD);
      for (const x of [-2.6, -0.9, 0.9, 2.6]) k.box(x, PT, -21.52, 0.14, 6.8, 0.12);
      for (const y of [PT + 2.4, PT + 4.6, PT + 6.7]) k.box(0, y, -21.52, 5.4, 0.14, 0.12);
      k.pop();
    }
  }
}
