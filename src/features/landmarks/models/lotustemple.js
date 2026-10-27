// feature/famous-landmarks: Lotus Temple (Baha'i House of Worship), New Delhi — 1:1 (34.3 m).
// 27 free-standing white-marble petals in three rings of nine on a nine-sided podium: nine inner
// petals rising almost closed around the skylight, nine outer petals between them, and nine
// entrance petals curling outward as canopies over the doors. Nine lotus-leaf pools ring the
// podium (the pools themselves are OSM water). Nine-fold symmetric; front (-Z) = one entrance (N).
const MARBLE = 0xf3f1ea, MARBLE_IN = 0xd9d5c9, MARBLE_DK = 0xc4bfb2, HALL = 0x5f6a70;
const POD = 0xe2ddd0, POD_DK = 0xbdb6a6;
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
 * spine normal), pointed tip. Outer face white, inner face shaded.
 */
function petal(k, a, p0, p1, p2, W, cup) {
  const nt = k.hi ? 10 : 4, ns = k.hi ? 6 : 2;
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
    // thin marble edge rib along both rims
    k.color(MARBLE_DK);
    for (let i = 0; i < nt; i++) {
      k.strut(G[i][0], G[i + 1][0], 0.35);
      k.strut(G[i][ns], G[i + 1][ns], 0.35);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 27 : 9;
  // nine-sided podium with steps
  k.color(POD).extrude(Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i + 0.5) * (TAU / 9);
    return [Math.cos(a) * 38, Math.sin(a) * 38];
  }), 0, PT);
  k.color(POD_DK).cyl(0, PT, 0, 33, 33, 0.3, seg, { phase: -Math.PI / 2 });
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + i * (TAU / 9);
    k.push().rotateY(-a - Math.PI / 2);
    for (let s = 0; s < (hi ? 4 : 1); s++) k.color(s % 2 ? POD : POD_DK).box(0, 0, -36.5 - s * 1.2, 9, PT - s * 0.8, 1.4);
    k.pop();
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
  // skylight crown at the centre
  k.color(MARBLE_DK).cyl(0, 30, 0, 3.4, 1.4, 3.6, 9);
  if (hi) {
    // door portals under the entrance canopies
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + i * (TAU / 9);
      k.push().rotateY(-a - Math.PI / 2);
      k.color(HALL).box(0, PT, -21.2, 5, 6.5, 0.6);
      k.pop();
    }
  }
}
