// feature/famous-landmarks: Space Needle, Seattle — 1:1 (184 m to the spire tip).
// Three paired steel legs pinching to an hourglass waist (~70 m), splaying out to hold the
// flying-saucer top house (restaurant + observation deck ~150-162 m, halo roof ~42 m across),
// roof cone and spire. Top house glass and the halo glow at night.
const WHITE = 0xefede6, WHITE_DK = 0xd2cfc6, GLASS = 0x46535e, CORE = 0xbdb8ae, GOLD = 0xd99a3a, LIT = 0xffe7b8;

export const lodDist = 1400;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, r: 18, h: 20 },
  { x: 0, z: 0, r: 7, h: 145 },
  { x: 0, z: 0, r: 21, h: 166 },
  { x: 0, z: 0, r: 6, h: 172 },
  { x: 0, z: 0, r: 1.5, h: 184 },
];

// leg centre-line radius vs height (hourglass), and half-spacing of the two columns of each leg
const R = [[0, 21], [15, 16.6], [35, 12], [55, 9.4], [70, 8.8], [90, 9.3], [115, 10.6], [135, 11.8], [146, 12.6], [152, 15], [158, 19], [164, 21]];
const S = [[0, 4.6], [35, 3.0], [70, 2.0], [110, 2.5], [146, 3.2], [164, 3.4]];
function lerpT(T, y) {
  for (let i = 0; i < T.length - 1; i++) {
    const [y0, a] = T[i], [y1, b] = T[i + 1];
    if (y <= y1) return a + (b - a) * (y - y0) / (y1 - y0);
  }
  return T[T.length - 1][1];
}

export function build(k) {
  const hi = k.hi;
  const ys = [];
  for (let y = 0; y <= 164.001; y += hi ? 6 : 16) ys.push(Math.min(y, 164));
  if (ys[ys.length - 1] < 164) ys.push(164);

  // ---- three leg pairs
  k.color(WHITE);
  for (let l = 0; l < 3; l++) {
    const a = Math.PI / 2 + (l * 2 * Math.PI) / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pt = (y, side) => {
      const r = lerpT(R, y), s = lerpT(S, y) * side;
      return [ca * r - sa * s, y, sa * r + ca * s];
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < ys.length - 1; i++) k.strut(pt(ys[i], side), pt(ys[i + 1], side), hi ? 2.0 : 3.0);
    }
    // web between the paired columns: reads as the broad white leg ribbon
    k.color(WHITE_DK);
    for (let i = 0; i < ys.length - 1; i++) {
      if (ys[i] >= 146) break;
      k.quad2(pt(ys[i], -1), pt(ys[i], 1), pt(ys[i + 1], 1), pt(ys[i + 1], -1));
    }
    k.color(WHITE);
    if (hi) {
      // cross ties between the paired columns
      for (let i = 1; i < ys.length - 1; i += 1) k.strut(pt(ys[i], -1), pt(ys[i], 1), 0.6);
      for (let i = 0; i < ys.length - 1; i += 2) k.strut(pt(ys[i], -1), pt(ys[i + 1], 1), 0.35);
      // radial ties to the core
      for (const y of [30, 70, 100, 130]) {
        const r = lerpT(R, y);
        k.color(WHITE_DK).strut([ca * 3, y, sa * 3], [ca * r, y, sa * r], 0.8).color(WHITE);
      }
    }
  }
  // ---- core (elevator shaft) and lift cars
  k.color(CORE).cyl(0, 0, 0, 2.6, 2.4, 148, hi ? 12 : 6);
  if (hi) {
    k.color(GOLD);
    k.box(0, 40, -3.6, 2.2, 3.5, 1.2);
    k.box(0, 95, 3.6, 2.2, 3.5, 1.2);
    // ground pavilion / stair base
    k.color(WHITE_DK).cyl(0, 0, 0, 7, 7, 4, 16);
    // waist ring
    k.color(WHITE).lathe(0, 68, 0, [[5.8, 0], [5.8, 1.2]], 18, { caps: false });
    k.color(WHITE).lathe(0, 68, 0, [[4.2, 1.2], [4.2, 0]], 18, { caps: false });
  }

  // ---- top house (flying saucer)
  const seg = hi ? 40 : 16;
  k.color(WHITE_DK).lathe(0, 0, 0, [[3.2, 140], [8, 144], [14, 148], [19.5, 151.5]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[19.5, 151.5], [20.5, 152.5], [20.5, 156.5]], seg, { caps: false }); // restaurant glazing
  k.glow(false).color(WHITE).lathe(0, 0, 0, [[20.5, 156.5], [21.5, 157], [21.5, 158.2], [19, 158.4]], seg, { caps: false }); // deck slab
  k.glow(true).color(LIT).lathe(0, 0, 0, [[19, 158.4], [18.8, 162.2]], seg, { caps: false }); // observation level
  k.glow(false);
  if (hi) {
    k.color(GLASS).lathe(0, 0, 0, [[21.3, 158.2], [21.3, 159.6]], seg, { caps: false }); // glass balustrade
    k.color(GLASS).lathe(0, 0, 0, [[21.3, 159.6], [21.0, 159.6]], seg, { caps: false });
  }
  // roof + halo ring
  k.color(WHITE).lathe(0, 0, 0, [[18.8, 162.2], [20.6, 163.0], [21.2, 164.2], [20.2, 165], [12, 166], [0, 166]], seg);
  k.glow(true).color(0xfff6e6).lathe(0, 0, 0, [[21.25, 163.2], [21.25, 164.0]], seg, { caps: false }); // halo lighting band
  k.glow(false);
  // roof superstructure, cone and spire
  k.color(GOLD).cyl(0, 166, 0, 11, 7, 3, hi ? 24 : 10);
  k.color(WHITE).cyl(0, 169, 0, 6.5, 3.2, 3.5, hi ? 20 : 8);
  k.color(WHITE_DK).cyl(0, 172.5, 0, 1.4, 0.9, 6.5, hi ? 8 : 4);
  k.color(WHITE).cyl(0, 179, 0, 0.8, 0.15, 5, hi ? 6 : 4);
  k.glow(true).color(0xffffff).sphere(0, 172.8, 0, hi ? 1.2 : 1.8, hi ? 8 : 4, hi ? 4 : 2); // Legacy Light beacon base
  k.glow(false);
  if (hi) {
    // leg tops piercing the saucer up to the halo: small brackets under the halo
    k.color(WHITE);
    for (let l = 0; l < 3; l++) {
      const a = Math.PI / 2 + (l * 2 * Math.PI) / 3;
      for (const side of [-1, 1]) {
        const b = a + side * 0.09;
        k.strut([Math.cos(b) * 20.5, 157, Math.sin(b) * 20.5], [Math.cos(b) * 21.2, 164, Math.sin(b) * 21.2], 0.9);
      }
    }
  }
}
