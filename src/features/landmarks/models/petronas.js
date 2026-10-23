// feature/famous-landmarks: Petronas Twin Towers, Kuala Lumpur — 1:1 (pinnacle tips 451.9 m).
// Two towers on an 8-point-star (Rub el Hizb) plan with lobes filling the inner corners, stainless
// steel with continuous glass ribbon windows, stacked setback tiers tapering into the crown, the
// 73 m pinnacles with ring and mast ball, the 44-storey round "bustle" annexes and the double-deck
// skybridge at levels 41/42 (170 m) carried by the two-hinged A-frame legs. Towers lie on local X.

const STEEL = 0xcfd5db, STEEL2 = 0xbcc4cc, GLASS = 0x5f7486, PODIUM = 0xb7b2a6, BRIDGE = 0xa9b2bb;

export const lodDist = 2200;
export const glowStrength = 2.5;

const CX = 50.5;                 // tower centre offset (bridge spans ~58 m between faces)
const R = 23.5;                  // star outer radius at the base (≈ 47 m across the points)

export const colliders = [
  { x: 0, z: 0, hw: 80, hd: 32, h: 12 },
  { x: -CX, z: 0, r: 22, h: 250 }, { x: CX, z: 0, r: 22, h: 250 },
  { x: -CX, z: 0, r: 15, h: 375 }, { x: CX, z: 0, r: 15, h: 375 },
  { x: -CX - 30, z: 8, r: 11, h: 175 }, { x: CX + 30, z: 8, r: 11, h: 175 },
  { x: 0, z: 0, hw: 30, hd: 3, h: 179 },
];

/** Star plan: 8 points (two squares at 45°) with a round lobe in each inner corner. */
function starPlan(r, lobe) {
  const pts = [];
  const ri = r * 0.78;                   // inner corner radius of the two-square star
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    // lobe between this point and the next: small arc bulging out from the inner corner
    const am = a + Math.PI / 8;
    for (let j = 0; j < lobe; j++) {
      const f = (j + 1) / (lobe + 1);
      const aa = a + (Math.PI / 4) * f;
      const bulge = Math.sin(f * Math.PI) * 0.1 * r;
      const base = r + (ri - r) * (1 - Math.abs(aa - am) / (Math.PI / 8));
      pts.push([Math.cos(aa) * (base + bulge), Math.sin(aa) * (base + bulge)]);
    }
  }
  return pts;
}

/** Lofted band between two scaled copies of plan P (centred at cx,cz). */
function loft(k, P, cx, cz, y0, s0, y1, s1) {
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = [cx + P[i][0] * s0, y0, cz + P[i][1] * s0], b0 = [cx + P[j][0] * s0, y0, cz + P[j][1] * s0];
    const a1 = [cx + P[i][0] * s1, y1, cz + P[i][1] * s1], b1 = [cx + P[j][0] * s1, y1, cz + P[j][1] * s1];
    k.quad(a0, a1, b1, b0);
  }
}

// stacked tiers: [y0, y1, scale0, scale1]
const TIERS = [
  [0, 245, 1.0, 1.0],
  [245, 252, 0.93, 0.93],
  [252, 290, 0.9, 0.9],
  [290, 296, 0.83, 0.83],
  [296, 322, 0.8, 0.8],
  [322, 327, 0.72, 0.72],
  [327, 345, 0.69, 0.66],
  [345, 350, 0.6, 0.6],
  [350, 362, 0.57, 0.5],
  [362, 367, 0.44, 0.44],
  [367, 377, 0.4, 0.3],
];

function tower(k, cx, side) {
  const hi = k.hi;
  const P = starPlan(R, hi ? 3 : 1);
  TIERS.forEach(([y0, y1, s0, s1], i) => {
    k.color(i % 2 ? STEEL2 : STEEL);
    loft(k, P, cx, 0, y0, s0, y1, s1);
    // roof cap of each tier
    k.push().translate(cx, 0, 0).scale(s1, 1, s1);
    k.extrude(P, y1 - 0.2, 0.2);
    k.pop();
  });
  if (hi) {
    // glass ribbon windows (outset bands every floor pair) — lit at night
    k.glow(true).color(GLASS);
    for (const [y0, y1, s0, s1] of TIERS) {
      if (y1 - y0 < 8) continue;
      for (let y = y0 + 2; y < y1 - 2; y += 4.1) {
        const f0 = (y - y0) / (y1 - y0), f1 = (y + 2.2 - y0) / (y1 - y0);
        loft(k, P, cx, 0, y, (s0 + (s1 - s0) * f0) * 1.006, y + 2.2, (s0 + (s1 - s0) * f1) * 1.006);
      }
    }
    k.glow(false);
  }
  // crown & pinnacle (377 -> 451.9 m)
  const seg = hi ? 16 : 8;
  k.color(STEEL).lathe(cx, 377, 0, [[6.5, 0], [5.2, 6], [4.6, 10]], seg);
  k.color(STEEL2).lathe(cx, 387, 0, [[4.4, 0], [3.6, 14], [2.6, 26]], seg);
  k.color(STEEL).sphere(cx, 405, 0, hi ? 3.0 : 2.8, seg, 6);                       // ring ball
  if (hi) {
    k.color(STEEL2);
    for (const [y, r] of [[392, 6.2], [398, 5.0], [412, 3.6]]) k.lathe(cx, y, 0, [[r, 0], [r, 0.9]], seg);
    // eight ring-spikes around the pinnacle base
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.strut([cx + Math.cos(a) * 5.5, 383, Math.sin(a) * 5.5], [cx + Math.cos(a) * 1.5, 404, Math.sin(a) * 1.5], 0.5);
    }
  }
  k.color(STEEL).lathe(cx, 408, 0, [[1.8, 0], [1.2, 18], [0.6, 36], [0.08, 43.9]], hi ? 10 : 5);
  k.glow(true).color(0xfff2d8).lathe(cx, 377, 0, [[6.6, 0], [6.0, 4]], seg);         // lit crown band
  k.color(0xffffff).sphere(cx, 405, 0, hi ? 3.15 : 2.95, seg, 6, 1, 0.5);
  k.glow(false);
  // bustle annex (44 floors) on the outer side, stepped round top
  const bx = cx + side * 30, bz = 8;
  k.color(STEEL2).lathe(bx, 0, bz, [[12, 0], [12, 150], [10.5, 150], [10.5, 162], [8.5, 162], [8.5, 172], [6, 172], [6, 178]], hi ? 24 : 10, { smooth: true });
  if (hi) {
    k.glow(true).color(GLASS);
    for (let y = 4; y < 148; y += 4.1) k.lathe(bx, y, bz, [[12.08, 0], [12.08, 2.2]], 24, { caps: false });
    k.glow(false);
  }
}

export function build(k) {
  const hi = k.hi;
  // podium (Suria KLCC base)
  k.color(PODIUM).box(0, 0, 4, 170, 12, 64);
  tower(k, -CX, -1);
  tower(k, CX, 1);
  // skybridge at levels 41/42 between the faces
  const xf = CX - R * 0.92;
  k.color(BRIDGE).box(0, 170, 0, 2 * xf + 2, 9, 5.5);
  if (hi) {
    k.glow(true).color(GLASS).box(0, 171.2, 0, 2 * xf + 1.4, 2.4, 5.8).box(0, 175.2, 0, 2 * xf + 1.4, 2.4, 5.8).glow(false);
    k.color(STEEL).box(0, 179, 0, 2 * xf + 2, 0.8, 6.2);
  }
  // A-frame legs from level 29 (~120 m) of each tower to the bridge centre
  k.color(STEEL2);
  for (const sz of [-1.6, 1.6]) {
    k.strut([-xf + 1, 121, sz], [-1.2, 169.5, sz], 1.4);
    k.strut([xf - 1, 121, sz], [1.2, 169.5, sz], 1.4);
  }
  k.box(0, 168.5, 0, 4, 1.6, 5.2);
}
