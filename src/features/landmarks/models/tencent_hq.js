// feature/famous-landmarks: Tencent Seafront Towers (Tencent Binhai Mansion), Shenzhen China — 1:1.
// Twin 248m (50-story North) & 194m (39-story South) glass skyscrapers dramatically linked by THREE
// multi-story horizontal interconnected-network skybridges at the 3rd, 22nd, and 35th floors!

export const lodDist = 2800;
export const fineDist = 650;
export const glowStrength = 2.0;

const GLASS = 0x3b5b78, GLASS_LT = 0x6f9ec4, STEEL = 0xe2e7ed, FIN_SILVER = 0xc5cfd9;
const BRIDGE_W = 0xf0f4f8, BRIDGE_WARM = 0xffdca8, TENCENT_BLUE = 0x0052d9, TENCENT_CYAN = 0x26a6ff;
const PLAZA = 0xd6d2c8, LAWN = 0x4b8a44, LIT = 0xe8f4ff;

export const colliders = [
  { x: -34, z: -8, hw: 24, hd: 20, h: 248 },
  { x: 34, z: 8, hw: 24, hd: 20, h: 194 },
  { x: 0, z: 0, hw: 38, hd: 16, h: 168 },
];

function seafrontTower(k, tx, tz, H) {
  const hi = k.hi;
  k.push().translate(tx, 0, tz);

  k.glow(false).color(GLASS).taper(0, 0.4, 0, 44, 36, 40, 33, H - 4.0, 0, 0);
  k.color(STEEL).taper(0, H - 3.6, 0, 40.4, 33.4, 34, 28, 3.6, 0, 0);
  k.glow(true).color(TENCENT_CYAN).box(0, H - 1.8, 0, 38, 1.4, 31);

  k.color(LIT);
  const step = hi ? 9.5 : 19;
  for (let y = 18; y < H - 10; y += step) {
    const s = 1 - (y / H) * 0.08;
    k.box(0, y, 0, 44.3 * s, 2.6, 36.3 * s);
  }
  k.glow(false);

  if (hi) {
    k.color(FIN_SILVER);
    for (let x = -18; x <= 18; x += 6) {
      k.strut([x, 0.4, -18.2], [x * 0.91, H - 3.6, -16.7], 0.36);
      k.strut([x, 0.4, 18.2], [x * 0.91, H - 3.6, 16.7], 0.36);
    }
  }
  k.pop();
}

function linkBridge(k, y0, h, zOffset, hasRoofGarden = false) {
  const hi = k.hi;
  k.push().translate(0, 0, zOffset).rotateY(-0.23);

  k.glow(false).color(BRIDGE_W);
  k.box(0, y0, 0, 96, 1.8, 22);
  k.box(0, y0 + h - 1.6, 0, 96, 1.6, 22);

  k.color(GLASS_LT).box(0, y0 + 1.8, 0, 94, h - 3.4, 20.5);
  k.glow(true).color(BRIDGE_WARM).box(0, y0 + 3.2, 0, 94.5, h - 6.2, 21.0);
  k.color(TENCENT_CYAN).box(0, y0 + 0.2, 0, 96.4, 0.8, 22.4);

  if (hi) {
    k.glow(false).color(STEEL);
    for (let x = -42; x < 42; x += 14) {
      k.strut([x, y0 + 1.0, -10.6], [x + 7, y0 + h - 1.0, -10.6], 0.65);
      k.strut([x + 7, y0 + h - 1.0, -10.6], [x + 14, y0 + 1.0, -10.6], 0.65);
      k.strut([x, y0 + 1.0, 10.6], [x + 7, y0 + h - 1.0, 10.6], 0.65);
      k.strut([x + 7, y0 + h - 1.0, 10.6], [x + 14, y0 + 1.0, 10.6], 0.65);
    }
  }

  if (hasRoofGarden) {
    k.glow(false).color(LAWN).box(0, y0 + h, 0, 62, 0.45, 16);
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  k.glow(false).color(PLAZA).box(0, -2.5, 0, 155, 2.9, 125);
  k.color(LAWN).box(-45, 0.4, 34, 42, 0.25, 26).box(45, 0.4, -34, 42, 0.25, 26);

  seafrontTower(k, -34, -8, 248);
  seafrontTower(k, 34, 8, 194);

  // THREE Iconic Multi-Story Horizontal Skybridges (Culture Link, Health Link, Knowledge Link)
  linkBridge(k, 6.0, 16.0, 2.0, true);
  linkBridge(k, 88.0, 22.0, 0.0, true);
  linkBridge(k, 144.0, 20.0, -2.0, true);

  k.glow(false).color(0x1f2833).box(0, 0.4, 44, 22, 1.4, 3.2);
  k.glow(true).color(TENCENT_BLUE).box(0, 1.8, 44, 18, 4.2, 1.6);
  k.color(BRIDGE_W).box(0, 3.0, 44, 14, 1.8, 1.9);
  k.glow(false);
}
