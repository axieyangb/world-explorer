// feature/famous-landmarks: New York Stock Exchange & Federal Hall, Wall Street NY — 1:1.
// Iconic 6-column Corinthian Georgia-marble NYSE facade with sculpted triangular pediment and giant
// red-white-and-blue American Flag banner draped across the columns, plus adjacent Federal Hall steps & George Washington statue!

export const lodDist = 1800;
export const fineDist = 500;
export const glowStrength = 1.8;

const MARBLE = 0xf2efe8, MARBLE_SH = 0xd6d0c4, GRANITE = 0xb8b2a6;
const GLASS = 0x2f3b48, BRONZE = 0x4a3b2a, STATUE_BRONZE = 0x5c4c38;
const FLAG_RED = 0xb22234, FLAG_WHITE = 0xfafbfd, FLAG_BLUE = 0x1a2d5a;
const LIT = 0xffecc4;

export const colliders = [
  { x: -16, z: 6, hw: 24, hd: 26, h: 42 },
  { x: 26, z: -12, hw: 18, hd: 24, h: 24 },
];

function americanFlagBanner(k, cx, yBot, yTop, zPlane, width) {
  const wHalf = width * 0.5;
  const h = yTop - yBot;
  const cantonW = width * 0.42, cantonH = h * 0.54;
  k.glow(true);
  k.color(FLAG_BLUE).box(cx - wHalf + cantonW * 0.5, yTop - cantonH, zPlane, cantonW, cantonH, 0.25);

  const nStripes = 13, sh = h / nStripes;
  for (let i = 0; i < nStripes; i++) {
    const sy = yTop - (i + 1) * sh;
    const isUpper = i < 7;
    const xStart = isUpper ? cx - wHalf + cantonW : cx - wHalf;
    const sw = isUpper ? width - cantonW : width;
    k.color(i % 2 === 0 ? FLAG_RED : FLAG_WHITE);
    k.box(xStart + sw * 0.5, sy, zPlane, sw, sh * 0.96, 0.22);
  }

  if (k.hi) {
    k.color(FLAG_WHITE);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const sx = cx - wHalf + 1.6 + c * (cantonW - 3.2) / 4;
        const sy = yTop - 1.4 - r * (cantonH - 2.6) / 3;
        k.box(sx, sy, zPlane + 0.14, 0.48, 0.48, 0.08);
      }
    }
  }
  k.glow(false);
}

function nyseBuilding(k) {
  const hi = k.hi;
  const bx = -16, bz = 6;
  k.push().translate(bx, 0, bz);

  k.glow(false).color(MARBLE_SH).box(0, -2.5, 0, 46, 3.0, 50);
  k.color(MARBLE).box(0, 0.5, 0, 44, 9.0, 48);
  k.color(MARBLE_SH).box(0, 9.5, 0, 45.6, 1.0, 49.6);

  k.color(MARBLE).box(0, 10.5, 2, 42, 22.0, 44);
  k.color(MARBLE_SH).box(0, 32.5, 4, 36, 9.5, 36);

  const fz = -22.2;
  k.glow(true).color(LIT).box(0, 11.2, fz + 1.5, 34, 18.2, 0.8);
  k.glow(false).color(BRONZE);
  for (let x = -14; x <= 14; x += 7) k.box(x, 11.0, fz + 1.2, 0.45, 18.6, 0.5);

  const colSeg = hi ? 14 : 8;
  for (let i = 0; i < 6; i++) {
    const cx = -16.5 + i * 6.6;
    k.glow(false).color(MARBLE).cyl(cx, 10.5, fz, 1.05, 0.92, 18.5, colSeg);
    k.color(MARBLE_SH).box(cx, 29.0, fz, 2.5, 1.4, 2.5);
  }

  americanFlagBanner(k, 0, 13.5, 26.8, fz - 1.15, 24.5);

  // Classical Entablature & Sculpted Triangular Pediment
  k.glow(false).color(MARBLE).box(0, 30.4, fz - 0.2, 44.5, 2.4, 5.2);
  const pz0 = fz - 2.6, pz1 = fz + 2.2;
  k.color(MARBLE_SH);
  k.tri([-22.8, 32.8, pz0], [22.8, 32.8, pz0], [0, 40.2, pz0]);
  k.tri([22.8, 32.8, pz1], [-22.8, 32.8, pz1], [0, 40.2, pz1]);
  k.color(MARBLE);
  k.quadN([-22.8, 32.8, pz0], [0, 40.2, pz0], [0, 40.2, pz1], [-22.8, 32.8, pz1], [-0.4, 1, 0]);
  k.quadN([0, 40.2, pz0], [22.8, 32.8, pz0], [22.8, 32.8, pz1], [0, 40.2, pz1], [0.4, 1, 0]);

  if (hi) {
    const figX = [-12, -7.5, -3.5, 0, 3.5, 7.5, 12];
    const figH = [2.4, 3.4, 4.4, 5.6, 4.4, 3.4, 2.4];
    k.glow(true).color(MARBLE);
    for (let i = 0; i < figX.length; i++) {
      k.box(figX[i], 33.0, pz0 - 0.35, 1.5, figH[i], 0.6);
    }
    k.glow(false);
  }

  k.pop();
}

function federalHall(k) {
  const hi = k.hi;
  const fx = 26, fz = -12;
  k.push().translate(fx, 0, fz);

  k.glow(false).color(GRANITE);
  for (let s = 0; s < 5; s++) {
    k.box(0, s * 0.75, -18 - (4 - s) * 1.6, 28, 0.85, 3.6);
  }
  k.color(MARBLE_SH).box(0, 2.2, -21.5, 2.8, 3.2, 2.8);
  k.color(STATUE_BRONZE).cyl(0, 5.4, -21.5, 0.65, 0.55, 3.4, 8);
  k.sphere(0, 9.1, -21.5, 0.52, 6, 5);

  k.color(MARBLE).box(0, 3.6, 2, 30, 14.5, 38);
  const colSeg = hi ? 12 : 6;
  for (let i = 0; i < 8; i++) {
    const cx = -12.6 + i * 3.6;
    k.cyl(cx, 3.6, -17.5, 0.85, 0.72, 13.2, colSeg);
  }
  k.color(MARBLE_SH).box(0, 16.8, 0, 31.2, 2.0, 42);
  k.color(MARBLE).tri([-15.6, 18.8, -21.0], [15.6, 18.8, -21.0], [0, 23.2, -21.0]);
  k.color(GRANITE).sphere(0, 18.5, 2, 10.5, hi ? 16 : 8, 6, 0.45, 0.5);

  k.pop();
}

export function build(k) {
  k.glow(false).color(GRANITE).box(4, -2.5, -2, 105, 3.0, 88);
  nyseBuilding(k);
  federalHall(k);
}
