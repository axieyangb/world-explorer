// feature/famous-landmarks: MIT Great Dome & Maclaurin Buildings (Building 10 & Killian Court), Cambridge MA — 1:1.
// Neoclassical Indiana limestone Killian Court wings, monumental 10-column Ionic portico with engraved
// entablature, and the stepped limestone drum & saucer Great Dome (46m high).

export const lodDist = 2000;
export const fineDist = 550;
export const glowStrength = 1.7;

const LIMESTONE = 0xe8e4da, LIME_SH = 0xcfc9bc, DOME_STONE = 0xded9cd, COPPER_OCULUS = 0x4b7d6e;
const GLASS = 0x34424f, ROOF = 0x626a72, LAWN = 0x4f8c46, TREE = 0x3b7638, PATH = 0xd8d3c6, LIT = 0xfff0cf;

export const colliders = [
  { x: 0, z: -28, hw: 58, hd: 16, h: 46 },
  { x: -56, z: 18, hw: 15, hd: 46, h: 24 },
  { x: 56, z: 18, hw: 15, hd: 46, h: 24 },
];

export function build(k) {
  const hi = k.hi;

  // 1. Killian Court Great Lawn, marble pathways & Elm tree rows facing the Charles River (+Z)
  k.glow(false).color(PATH).box(0, -2.5, 10, 165, 2.9, 135);
  k.color(LAWN).box(0, 0.4, 24, 82, 0.3, 86);
  k.color(PATH).box(0, 0.72, 24, 9.5, 0.12, 86).box(0, 0.72, 22, 82, 0.12, 6.5);
  for (const sx of [-32, 32]) {
    for (const sz of [-2, 22, 46]) {
      k.color(0x5a4028).cyl(sx, 0.6, sz, 0.42, 0.26, 4.0, 5);
      k.color(TREE).sphere(sx, 6.2, sz, 4.5, hi ? 8 : 5, 5, 0.9);
    }
  }

  // 2. Building 10 (North Center Wing at z = -28)
  k.glow(false).color(LIMESTONE).box(0, 0.4, -28, 118, 21.5, 28);
  k.color(LIME_SH).box(0, 21.9, -28, 120, 1.4, 30);
  k.color(ROOF).box(0, 23.3, -28, 114, 0.6, 25);

  // Building 3 (West Wing) & Building 4 (East Wing) framing Killian Court
  for (const sx of [-1, 1]) {
    const wx = sx * 56;
    k.glow(false).color(LIMESTONE).box(wx, 0.4, 18, 26, 21.5, 88);
    k.color(LIME_SH).box(wx, 21.9, 18, 28, 1.4, 90);
    k.color(ROOF).box(wx, 23.3, 18, 23, 0.6, 84);

    k.glow(true).color(LIT);
    for (let z = -16; z <= 52; z += 11.2) {
      k.box(wx - sx * 13.1, 3.2, z, 0.4, 15.6, 5.2);
      k.box(wx + sx * 13.1, 3.2, z, 0.4, 15.6, 5.2);
    }
    if (hi) {
      k.glow(false).color(LIME_SH);
      for (let z = -21.6; z <= 58; z += 11.2) {
        k.box(wx - sx * 13.2, 0.4, z, 0.9, 21.2, 1.5);
      }
    }
  }

  // Night-lit tall windows along Building 10 facade
  k.glow(true).color(LIT);
  for (let x = -46; x <= 46; x += 9.2) {
    if (Math.abs(x) < 22) continue;
    k.box(x, 3.2, -13.9, 4.8, 15.6, 0.4);
    k.box(x, 3.2, -42.1, 4.8, 15.6, 0.4);
  }

  // 3. Monumental 10-Column Ionic Portico on the South Facade of Building 10 (z = -10.5)
  k.glow(false).color(LIME_SH).box(0, 0.4, -10.2, 46, 2.2, 10.5);
  k.glow(true).color(LIT).box(0, 3.2, -13.8, 38, 15.6, 0.5);
  k.glow(false).color(LIMESTONE);
  const colSeg = hi ? 12 : 6;
  for (let i = 0; i < 10; i++) {
    const cx = -20.25 + i * 4.5;
    k.cyl(cx, 2.6, -7.8, 0.88, 0.76, 16.2, colSeg);
    if (hi) k.color(LIME_SH).box(cx, 18.8, -7.8, 2.1, 0.8, 2.1).color(LIMESTONE);
  }
  // Engraved MASSACHUSETTS INSTITUTE OF TECHNOLOGY entablature frieze & attic parapet
  k.color(LIMESTONE).box(0, 19.6, -10.6, 45.5, 3.2, 7.6);
  k.color(LIME_SH).box(0, 22.8, -10.6, 46.8, 1.1, 8.4);
  k.color(LIMESTONE).box(0, 23.9, -11.2, 42.0, 2.6, 6.2);

  // 4. The MIT Great Dome (Pantheon-inspired stepped limestone drum & saucer dome, apex 46m)
  const dz = -28;
  k.glow(false).color(LIME_SH).box(0, 23.3, dz, 34, 3.5, 34);
  const dSeg = hi ? 28 : 14;
  k.color(LIMESTONE).cyl(0, 26.8, dz, 16.2, 16.0, 8.2, dSeg);
  k.glow(true).color(LIT).cyl(0, 28.2, dz, 16.3, 16.3, 4.6, dSeg);
  if (hi) {
    k.glow(false).color(LIMESTONE);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.cyl(Math.cos(a) * 16.35, 26.8, dz + Math.sin(a) * 16.35, 0.55, 0.5, 8.0, 6);
    }
  }
  // Stepped Pantheon rings & smooth limestone saucer dome (35.0m to 45.8m)
  k.glow(false).color(DOME_STONE).lathe(
    0,
    35.0,
    dz,
    [
      [16.6, 0],
      [16.6, 1.1],
      [15.4, 1.2],
      [15.4, 2.2],
      [14.0, 2.3],
      [14.0, 3.2],
      [12.4, 4.8],
      [10.2, 6.8],
      [7.4, 8.6],
      [4.2, 9.8],
      [0.1, 10.4],
    ],
    dSeg
  );
  // Glowing Barker Library oculus skylight at the apex of the Great Dome
  k.glow(true).color(LIT).cyl(0, 45.2, dz, 3.4, 3.2, 0.65, 12);
  k.glow(false).color(COPPER_OCULUS).cyl(0, 45.7, dz, 3.6, 3.6, 0.2, 12);
}
