// feature/famous-landmarks: Samsung Town / Seocho Headquarters Towers, Seoul Korea — 1:1.
// Trio of sleek blue-glass crystalline high-rise towers (Tower C 203m, Tower B 153m, Tower A 145m)
// with geometric cantilevered sky-lounges, silver curtain-wall mullions, and sunken media plaza pavilion!

export const lodDist = 2600;
export const fineDist = 600;
export const glowStrength = 1.9;

const GLASS_BLUE = 0x2c5684, GLASS_CRYSTAL = 0x5c92c4, STEEL = 0xe2e8f0, MULLION = 0xbec9d6;
const SAMSUNG_BLUE = 0x1428a0, SAMSUNG_GLOW = 0x3b78ff;
const GRANITE = 0xd2cfc8, LAWN = 0x4b8a44, WATER = 0x2b769e, LIT = 0xebf5ff;

export const colliders = [
  { x: -42, z: -20, hw: 24, hd: 22, h: 203 },
  { x: 38, z: -22, hw: 22, hd: 20, h: 153 },
  { x: 40, z: 32, hw: 22, hd: 20, h: 145 },
];

function samsungTower(k, tx, tz, w, d, H, loungeYs) {
  const hi = k.hi;
  k.push().translate(tx, 0, tz);

  k.glow(false).color(GLASS_BLUE).box(0, 0.4, 0, w, H - 8.0, d);
  k.color(GLASS_CRYSTAL).box(0, H - 7.6, 0, w - 3.5, 7.6, d - 3.5);
  k.color(STEEL).box(0, H - 8.2, 0, w + 1.2, 1.0, d + 1.2).box(0, H, 0, w - 2.0, 1.0, d - 2.0);

  for (const ly of loungeYs) {
    k.glow(false).color(STEEL).box(w * 0.14, ly - 0.8, d * 0.14, w * 0.82, 9.6, d * 0.82);
    k.glow(true).color(GLASS_CRYSTAL).box(w * 0.15, ly, d * 0.15, w * 0.84, 8.0, d * 0.84);
  }

  k.glow(true).color(LIT);
  const step = hi ? 9.0 : 18.0;
  for (let y = 12; y < H - 12; y += step) {
    k.box(0, y, 0, w + 0.3, 2.5, d + 0.3);
  }
  k.color(SAMSUNG_GLOW).box(0, H - 2.2, 0, w - 1.4, 1.5, d - 1.4);
  k.glow(false);

  if (hi) {
    k.color(MULLION);
    for (let x = -w * 0.4; x <= w * 0.4; x += 6.5) {
      k.strut([x, 0.4, -d * 0.5 - 0.18], [x, H - 8.0, -d * 0.5 - 0.18], 0.34);
      k.strut([x, 0.4, d * 0.5 + 0.18], [x, H - 8.0, d * 0.5 + 0.18], 0.34);
    }
  }
  k.pop();
}

export function build(k) {
  const hi = k.hi;

  k.glow(false).color(GRANITE).box(0, -2.5, 6, 165, 2.9, 140);
  k.color(LAWN).box(-42, 0.4, 34, 46, 0.25, 38);
  k.color(WATER).box(-2, 0.45, 12, 26, 0.25, 56);

  samsungTower(k, -42, -20, 44, 38, 203, [58, 118, 166]);
  samsungTower(k, 38, -22, 38, 34, 153, [52, 108]);
  samsungTower(k, 40, 32, 38, 34, 145, [48, 98]);

  k.glow(false).color(GLASS_CRYSTAL).box(-4, 0.4, -22, 36, 14.5, 28);
  k.color(STEEL).box(-4, 14.9, -22, 40, 1.1, 32);
  k.glow(true).color(LIT).box(-4, 2.5, -22, 36.4, 4.5, 28.4).box(-4, 9.2, -22, 36.4, 4.2, 28.4);

  k.push().translate(-12, 0, 56);
  k.glow(false).color(0x1e2530).box(0, 0.4, 0, 22, 1.5, 3.6);
  k.push().translate(0, 4.4, 0).rotateZ(0.14);
  k.glow(true).color(SAMSUNG_BLUE).cyl(0, -1.0, 0, 8.8, 8.8, 2.0, hi ? 20 : 10);
  k.color(STEEL).box(0, -1.15, 0, 13.5, 2.3, 2.2);
  k.pop();
  k.glow(false);
  k.pop();
}
