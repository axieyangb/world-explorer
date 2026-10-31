// feature/famous-landmarks: Space Needle, Seattle — 1:1 (184 m to the spire tip).
// Three paired steel legs pinching to an hourglass waist (~70 m), splaying out to hold the
// flying-saucer top house (The Loupe revolving glass floor restaurant + open-air tilted glass observation deck
// ~150-162 m, 36 radial steel outrigger saucer fins, halo roof ~42 m across), 3 external Otis elevators,
// 1962 World's Fair glass entry pavilion dome with spiral ramp, roof cone and spire.
const WHITE = 0xefede6, WHITE_DK = 0xd2cfc6, GLASS = 0x46535e, GLASS_LT = 0x82b2d4, CORE = 0xbdb8ae, GOLD = 0xd99a3a, LIT = 0xffe7b8;

export const lodDist = 1400;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, r: 18, h: 20 },
  { x: 0, z: 0, r: 7, h: 145 },
  { x: 0, z: 0, r: 21, h: 166 },
  { x: 0, z: 0, r: 6, h: 172 },
  { x: 0, z: 0, r: 1.5, h: 184 },
];

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
    k.color(WHITE_DK);
    for (let i = 0; i < ys.length - 1; i++) {
      if (ys[i] >= 146) break;
      k.quad2(pt(ys[i], -1), pt(ys[i], 1), pt(ys[i + 1], 1), pt(ys[i + 1], -1));
    }
    k.color(WHITE);
    if (hi) {
      k.color(WHITE_DK);
      k.box(ca * 21.2, -1.5, sa * 21.2, 7.5, 4.5, 7.5);
      k.color(WHITE);
      for (let i = 1; i < ys.length - 1; i += 1) k.strut(pt(ys[i], -1), pt(ys[i], 1), 0.6);
      for (let i = 0; i < ys.length - 1; i += 2) k.strut(pt(ys[i], -1), pt(ys[i + 1], 1), 0.35);
      for (const y of [30, 50, 70, 90, 110, 130]) {
        const r = lerpT(R, y);
        k.color(WHITE_DK).strut([ca * 2.8, y, sa * 2.8], [ca * r, y, sa * r], 0.75).color(WHITE);
      }
    }
  }
  k.color(CORE).cyl(0, 0, 0, 2.6, 2.4, 148, hi ? 12 : 6);
  if (hi) {
    const carY = [38, 86, 124];
    const carCol = [GOLD, 0x3b82c4, 0xc94234];
    for (let e = 0; e < 3; e++) {
      const a = -Math.PI / 2 + (e * 2 * Math.PI) / 3;
      const ca = Math.cos(a), sa = Math.sin(a);
      k.color(0x525a63);
      k.strut([ca * 2.65, 4, sa * 2.65], [ca * 2.5, 147, sa * 2.5], 0.55);
      const y = carY[e];
      k.color(carCol[e]).cyl(ca * 3.25, y, sa * 3.25, 1.05, 1.05, 3.8, 10);
      k.glow(true).color(LIT).cyl(ca * 3.25, y + 0.8, sa * 3.25, 1.08, 1.08, 2.1, 10).glow(false);
    }
    k.color(WHITE_DK).cyl(0, -1.5, 0, 24.5, 25.5, 1.8, 24);
    k.glow(true).color(GLASS_LT).cyl(0, 0.3, 0, 13.5, 11.2, 4.5, 24).glow(false);
    k.color(WHITE).cyl(0, 4.8, 0, 11.6, 7.2, 0.85, 24);
    for (let r = 0; r < 12; r++) {
      const a = (r / 12) * Math.PI * 2;
      k.color(WHITE).strut([Math.cos(a) * 13.7, 0.3, Math.sin(a) * 13.7], [Math.cos(a) * 11.4, 5.2, Math.sin(a) * 11.4], 0.32);
    }
    k.color(WHITE).lathe(0, 68, 0, [[5.8, 0], [5.8, 1.2]], 18, { caps: false });
    k.color(WHITE).lathe(0, 68, 0, [[4.2, 1.2], [4.2, 0]], 18, { caps: false });
  }

  const seg = hi ? 44 : 16;
  k.color(WHITE_DK).lathe(0, 0, 0, [[3.2, 140], [8, 144], [14, 148], [19.5, 151.5]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[19.5, 151.5], [20.5, 152.5], [20.5, 156.5]], seg, { caps: false });
  k.glow(false).color(WHITE).lathe(0, 0, 0, [[20.5, 156.5], [21.5, 157], [21.5, 158.2], [19, 158.4]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[19, 158.4], [18.8, 162.2]], seg, { caps: false });
  k.glow(false);
  if (hi) {
    k.glow(true).color(GLASS_LT).lathe(0, 0, 0, [[14.2, 148.1], [19.2, 151.4]], seg, { caps: false }).glow(false);
    k.color(WHITE);
    for (let f = 0; f < 36; f++) {
      const a = (f / 36) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      k.color(WHITE).strut([ca * 3.5, 140.2, sa * 3.5], [ca * 19.6, 151.5, sa * 19.6], 0.24);
      k.color(GLASS_LT).strut([ca * 21.3, 158.2, sa * 21.3], [ca * 21.75, 160.8, sa * 21.75], 0.14);
      if (f % 2 === 0) {
        k.color(WHITE_DK).strut([ca * 20.2, 165.0, sa * 20.2], [ca * 11.2, 166.1, sa * 11.2], 0.22);
      }
    }
    k.color(GLASS).lathe(0, 0, 0, [[21.3, 158.2], [21.75, 160.6]], seg, { caps: false });
    k.color(WHITE).lathe(0, 0, 0, [[21.75, 160.6], [21.55, 160.75]], seg, { caps: false });
  }
  k.color(WHITE).lathe(0, 0, 0, [[18.8, 162.2], [20.6, 163.0], [21.2, 164.2], [20.2, 165], [12, 166], [0, 166]], seg);
  k.glow(true).color(0xfff6e6).lathe(0, 0, 0, [[21.25, 163.2], [21.25, 164.0]], seg, { caps: false });
  k.glow(false);
  k.color(GOLD).cyl(0, 166, 0, 11, 7, 3, hi ? 24 : 10);
  k.color(WHITE).cyl(0, 169, 0, 6.5, 3.2, 3.5, hi ? 20 : 8);
  k.color(WHITE_DK).cyl(0, 172.5, 0, 1.4, 0.9, 6.5, hi ? 8 : 4);
  k.color(WHITE).cyl(0, 179, 0, 0.8, 0.15, 5, hi ? 6 : 4);
  if (hi) {
    k.color(GOLD);
    for (const sy of [174.5, 177.5, 180.5]) {
      k.cyl(0, sy, 0, 1.25 - (sy - 174) * 0.1, 1.25 - (sy - 174) * 0.1, 0.22, 10);
    }
  }
  k.glow(true).color(0xffffff).sphere(0, 172.8, 0, hi ? 1.2 : 1.8, hi ? 8 : 4, hi ? 4 : 2);
  k.glow(false);
  if (hi) {
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
