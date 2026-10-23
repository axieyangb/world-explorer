// feature/beijing-landmarks: CITIC Tower (China Zun / 中国尊) — 1:1.
// 528 m supertall with curving profile inspired by ancient Chinese ritual bronze Zun vessel:
// 78 m base -> slender 48 m waist (y ≈ 368 m) -> flared 70 m crown rim (y = 526 m) with glowing lantern.
export const lodDist = 2200;
export const glowStrength = 2.8;

export const colliders = [
  { x: 0, z: 0, hw: 39, hd: 39, h: 528 },
];

const FRAME = 0xbecdde;
const GLASS = 0x324e70;
const MEGA_COL = 0xe8f2fc;
const LIT_WARM = 0xffe49b;
const PLAZA = 0xd4dce6;

// Profile: [y0, y1, w0, w1]
const TIERS = [
  [2.4, 56.0, 78.0, 72.0],
  [56.0, 120.0, 72.0, 66.0],
  [120.0, 188.0, 66.0, 60.5],
  [188.0, 258.0, 60.5, 55.5],
  [258.0, 328.0, 55.5, 51.0],
  [328.0, 368.0, 51.0, 48.0],
  [368.0, 418.0, 48.0, 54.5],
  [418.0, 468.0, 54.5, 62.0],
  [468.0, 504.0, 62.0, 66.5],
  [504.0, 526.0, 66.5, 70.0],
];

export function build(k) {
  const hi = k.hi;

  // 1. Granite Ground Plaza & Podium Plinth
  k.color(PLAZA);
  k.box(0, 0, 0, 92, 1.2, 92);
  k.box(0, 1.2, 0, 86, 1.2, 86);

  // 2. Main Shaft Tapering Blocks
  for (let i = 0; i < TIERS.length; i++) {
    const [y0, y1, w0, w1] = TIERS[i];
    const h = y1 - y0;
    // Glass shaft
    k.color(GLASS);
    k.taper(0, y0, 0, w0, w0, w1, w1, h);

    // Refuge / mechanical floor bands with night accent lighting
    if (i < 8) {
      k.color(0x9baa7c);
      k.box(0, y1 - 2.0, 0, w1 + 0.8, 3.6, w1 + 0.8);
      k.glow(true).color(LIT_WARM);
      k.box(0, y1 - 0.5, 0, w1 + 1.2, 0.9, w1 + 1.2);
      k.glow(false);
    }
  }

  // 3. Four Massive Curving Corner Mega-Columns
  const cornerSign = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  k.color(MEGA_COL);
  for (const [sx, sz] of cornerSign) {
    for (const [y0, y1, w0, w1] of TIERS) {
      k.strut([sx * w0, y0, sz * w0], [sx * w1, y1, sz * w1], 1.6);
    }
  }

  // 4. Facade Diagrid Exoskeleton Braces
  if (hi) {
    k.color(FRAME);
    for (let t = 0; t < 8; t++) {
      const [y0, y1, w0, w1] = TIERS[t];
      const hwA = w0 * 0.5, hwB = w1 * 0.5;
      // N & S faces
      for (const zs of [-1, 1]) {
        k.strut([-hwA, y0, zs * hwA], [hwB, y1, zs * hwB], 0.7);
        k.strut([hwA, y0, zs * hwA], [-hwB, y1, zs * hwB], 0.7);
      }
      // E & W faces
      for (const xs of [-1, 1]) {
        k.strut([xs * hwA, y0, -hwA], [xs * hwB, y1, hwB], 0.7);
        k.strut([xs * hwA, y0, hwA], [xs * hwB, y1, -hwB], 0.7);
      }
    }

    // Lobby entrance canopies (N & S)
    for (const zs of [-1, 1]) {
      k.color(FRAME);
      k.taper(0, 2.4, zs * 39.5, 46, 12, 40, 4, 18);
      k.glow(true).color(LIT_WARM);
      k.box(0, 2.4, zs * 38.0, 42, 16.0, 4);
      k.glow(false);
    }
  }

  // 5. Glowing Golden-White Lantern Crown (468 m .. 528 m)
  k.glow(true).color(0xffeedb);
  k.taper(0, 468, 0, 56, 56, 63, 63, 56);
  k.glow(false);

  // Flared rim parapet
  k.color(FRAME);
  k.box(0, 524, 0, 70.8, 2.0, 70.8);

  // Central observation skylight & beacon spire reaching 528 m
  k.glow(true).color(0xfff6d7);
  k.cyl(0, 524, 0, 6.0, 1.2, 12.0, 8);
  k.glow(false);
}
