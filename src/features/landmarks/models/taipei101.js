// feature/famous-landmarks: Taipei 101 — 1:1 (roof 449 m, spire tip 508 m).
// Double-notched square plan ("sawtooth" corners) throughout: a truncated-pyramid pedestal (floors
// 1–26) with a giant ruyi coin medallion on each face, eight stacked eight-storey modules flaring
// outward like a bamboo stalk / pagoda (floors 27–90), the stepped top floors and the pinnacle spire.
// Blue-green glass with pale mullions; at night the module rims and window bands are lit. The mall
// podium beside it stays OSM. Front (-Z) = Xinyi Road side (north).
const GLASS = 0x67958f, GLASS_DK = 0x4f7d78, FIN = 0xa8c0bc, FRAME = 0xcfd9d6;
const RIM = 0xffe6a8, BAND = 0x6f9c8f, GOLD = 0xc9a24a, SPIRE = 0xb9c2c4;

export const lodDist = 2400;
export const glowStrength = 2.0;

const PED = 109;         // pedestal top (floor 26)
const MOD = 34;          // module height (8 floors)
const M0 = PED + 2;      // first module base
const TOP = M0 + 8 * MOD; // 383: base of the top floors
const ROOF = 449;
const N = 0.075;         // corner notch step (fraction of the half width)

export const colliders = [
  { x: 0, z: 0, hw: 27, hd: 27, h: PED },
  { x: 0, z: 0, hw: 23, hd: 23, h: TOP },
  { x: 0, z: 0, hw: 16, hd: 16, h: ROOF },
];

/** Unit double-notched square (half width 1), counter-clockwise from +x. */
const PLAN = (() => {
  const q = [[1, -(1 - 2 * N)], [1, 1 - 2 * N], [1 - N, 1 - 2 * N], [1 - N, 1 - N], [1 - 2 * N, 1 - N], [1 - 2 * N, 1]];
  const out = [];
  for (let r = 0; r < 4; r++) {
    const a = (r * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    for (const [x, z] of q.slice(r === 0 ? 0 : 1)) out.push([x * c - z * s, x * s + z * c]);
  }
  out.pop(); // last corner point closes onto the first
  return out;
})();

/** Lofted band of the plan from half width h0 at y0 to h1 at y1 (+ optional flat cap). */
function loft(k, y0, h0, y1, h1, cap = true) {
  const n = PLAN.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = PLAN[i], [bx, bz] = PLAN[(i + 1) % n];
    k.quad([ax * h0, y0, az * h0], [ax * h1, y1, az * h1], [bx * h1, y1, bz * h1], [bx * h0, y0, bz * h0]);
  }
  if (cap) {
    k.push().scale(h1, 1, h1);
    k.extrude(PLAN, y1 - 0.15, 0.15);
    k.pop();
  }
}

/** Ruyi medallion (coin with a square hole) on the face facing -Z at distance d, centre height y. */
function ruyi(k, y, d, r) {
  const hi = k.hi;
  const seg = hi ? 20 : 8;
  k.push().translate(0, y, -d).rotateX(Math.PI / 2);
  k.color(GOLD).cyl(0, -0.6, 0, r, r, 1.2, seg);
  k.color(GLASS_DK).box(0, -0.75, 0, r * 0.62, 1.5, r * 0.62);
  if (hi) {
    // ruyi cloud lobes above the coin
    k.color(GOLD);
    for (const sx of [-1, 0, 1]) k.cyl(sx * r * 0.55, -0.5, -r * (sx ? 0.95 : 1.15), r * 0.32, r * 0.32, 1.0, 10);
  }
  k.pop();
}

export function build(k) {
  const hi = k.hi;
  // pedestal: slight inward taper, with a lit stripe per floor pair
  k.color(GLASS);
  loft(k, 0, 28.5, PED, 24.2);
  if (hi) {
    k.color(FIN);
    for (let y = 8; y < PED - 2; y += 8.4) {
      const f = y / PED, h = 28.5 + (24.2 - 28.5) * f;
      loft(k, y, h + 0.15, y + 0.6, h + 0.12, false);
    }
  }
  // ruyi medallions on all four faces of the pedestal top
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    ruyi(k, PED - 10, 25.2, 7.0);
    k.pop();
  }
  // collar between pedestal and first module
  k.color(FRAME);
  loft(k, PED, 23, M0, 23);
  // eight flaring modules
  for (let m = 0; m < 8; m++) {
    const y0 = M0 + m * MOD, y1 = y0 + MOD;
    k.color(m % 2 ? GLASS : GLASS_DK);
    loft(k, y0, 20.5, y1 - 1.6, 24.5);
    // overhanging rim at the module top
    k.color(FRAME);
    loft(k, y1 - 1.6, 24.5, y1 - 0.5, 24.9);
    loft(k, y1 - 0.5, 24.9, y1, 21);
    if (hi) {
      // floor lines (pale mullion bands)
      k.color(FIN);
      for (let j = 1; j < 8; j++) {
        const y = y0 + j * 4.05, f = (y - y0) / (MOD - 1.6), h = 20.5 + 4 * f;
        loft(k, y, h + 0.1, y + 0.45, h + 0.16, false);
      }
      // window glow bands
      k.glow(true).color(BAND);
      for (let j = 0; j < 8; j++) {
        const y = y0 + j * 4.05 + 1.2, f = (y - y0) / (MOD - 1.6), h = 20.5 + 4 * f;
        loft(k, y, h + 0.05, y + 2.0, h + 0.06 + 4 * 2 / MOD, false);
      }
      k.glow(false);
    }
    // lit rim
    k.glow(true).color(RIM);
    loft(k, y1 - 1.4, 24.62, y1 - 0.7, 24.82, false);
    k.glow(false);
    if (hi) {
      // small ruyi corner ornaments at each module's top corners
      k.color(GOLD);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.box(sx * 22.4, y1 - 3.6, sz * 22.4, 1.6, 2.2, 1.6);
    }
  }
  // top floors (91–101): stepped setbacks
  k.color(GLASS_DK);
  loft(k, TOP, 19, TOP + 16, 18);
  k.color(FRAME);
  loft(k, TOP + 16, 19, TOP + 17.5, 19);
  k.color(GLASS);
  loft(k, TOP + 17.5, 15.5, TOP + 40, 14.5);
  k.color(FRAME);
  loft(k, TOP + 40, 15.5, TOP + 41.5, 15.5);
  k.color(GLASS_DK);
  loft(k, TOP + 41.5, 11.5, TOP + 58, 10.5);
  k.color(FRAME);
  loft(k, TOP + 58, 9.5, ROOF, 7.5);
  k.glow(true).color(RIM);
  loft(k, TOP + 16.2, 19.08, TOP + 17.3, 19.08, false);
  loft(k, TOP + 40.2, 15.58, TOP + 41.3, 15.58, false);
  k.glow(false);
  // pinnacle spire 449 -> 508 m
  const seg = hi ? 12 : 6;
  k.color(SPIRE).lathe(0, ROOF, 0, [[3.4, 0], [3.0, 14], [2.2, 30], [1.4, 45], [0.6, 55], [0.15, 59]], seg);
  if (hi) {
    k.color(FRAME);
    for (const [y, r] of [[ROOF + 8, 3.6], [ROOF + 22, 3.0], [ROOF + 36, 2.2]]) k.cyl(0, y, 0, r, r, 1.0, seg);
  }
  k.glow(true).color(0xfff4dc).cyl(0, ROOF + 46, 0, 1.2, 1.0, 2.0, seg);
  k.glow(false);
}
