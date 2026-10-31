// feature/famous-landmarks: MIT Great Dome & Maclaurin Buildings (Building 10 & Killian Court), Cambridge MA — 1:1.
// Neoclassical Indiana limestone Killian Court wings, monumental 10-column Ionic portico with volute capitals,
// engraved Roman entablature frieze, stepped marble stairs, Henry Moore sculpture on Killian Lawn,
// and the Corinthian peristyle drum & stepped Pantheon saucer of the Great Dome (46m high).

export const lodDist = 2000;
export const fineDist = 550;
export const glowStrength = 1.7;

const LIMESTONE = 0xe8e4da, LIME_SH = 0xcfc9bc, DOME_STONE = 0xded9cd, COPPER_OCULUS = 0x4b7d6e;
const GLASS = 0x34424f, ROOF = 0x626a72, LAWN = 0x4f8c46, TREE = 0x3b7638, PATH = 0xd8d3c6, LIT = 0xfff0cf;
const BRONZE = 0x5c4a38, DARK = 0x252d36;

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
    for (const sz of [-2, 14, 30, 46]) {
      if (!hi && (sz === 14 || sz === 30)) continue;
      k.color(0x5a4028).cyl(sx, 0.6, sz, 0.42, 0.26, 4.0, 5);
      k.color(TREE).sphere(sx, 6.2, sz, 4.5, hi ? 8 : 5, 5, 0.9);
    }
  }

  // Close-up: Henry Moore Three-Piece Reclining Figure Draped bronze sculpture & stone benches in Killian Court
  if (hi) {
    k.color(LIME_SH).box(16, 0.7, 12, 5.2, 0.65, 2.8);
    k.color(BRONZE);
    k.sphere(14.5, 1.85, 12, 0.95, 8, 6, 0.85);
    k.strut([14.8, 1.7, 12], [16.5, 2.1, 12], 1.15);
    k.sphere(17.4, 1.65, 12, 0.75, 8, 5, 1.1);
    for (const bz of [4, 16, 28, 40]) {
      for (const bx of [-6.2, 6.2]) {
        k.color(LIMESTONE).box(bx, 0.75, bz, 0.85, 0.55, 3.2);
      }
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

    if (hi) {
      k.color(LIME_SH).box(wx, 23.3, 59.5, 24, 1.6, 5.0);
      for (let c = -1.5; c <= 1.5; c += 1) {
        k.color(LIMESTONE).cyl(wx + c * 5.8, 2.2, 62.2, 0.72, 0.64, 17.5, 8);
        k.color(LIME_SH).box(wx + c * 5.8, 19.7, 62.2, 1.6, 0.65, 1.6);
      }
    }

    k.glow(true).color(LIT);
    for (let z = -16; z <= 52; z += 11.2) {
      k.box(wx - sx * 13.1, 3.2, z, 0.4, 15.6, 5.2);
      k.box(wx + sx * 13.1, 3.2, z, 0.4, 15.6, 5.2);
      if (hi) {
        k.glow(false).color(DARK);
        for (const yh of [8.2, 13.4]) {
          k.box(wx - sx * 13.22, yh, z, 0.25, 0.65, 5.3);
          k.box(wx + sx * 13.22, yh, z, 0.25, 0.65, 5.3);
        }
        for (const dz of [-1.3, 1.3]) {
          k.box(wx - sx * 13.22, 3.2, z + dz, 0.22, 15.6, 0.22);
        }
        k.glow(true).color(LIT);
      }
    }
    if (hi) {
      k.glow(false).color(LIME_SH);
      for (let z = -21.6; z <= 58; z += 11.2) {
        k.box(wx - sx * 13.2, 0.4, z, 0.9, 21.2, 1.5);
        k.box(wx + sx * 13.2, 0.4, z, 0.9, 21.2, 1.5);
      }
    }
  }

  // Night-lit tall windows along Building 10 facade
  k.glow(true).color(LIT);
  for (let x = -46; x <= 46; x += 9.2) {
    if (Math.abs(x) < 22) continue;
    k.box(x, 3.2, -13.9, 4.8, 15.6, 0.4);
    k.box(x, 3.2, -42.1, 4.8, 15.6, 0.4);
    if (hi) {
      k.glow(false).color(DARK);
      k.box(x, 8.2, -13.75, 4.9, 0.65, 0.25).box(x, 13.4, -13.75, 4.9, 0.65, 0.25);
      k.glow(true).color(LIT);
    }
  }

  // 3. Monumental 10-Column Ionic Portico on the South Facade of Building 10 (z = -10.5)
  k.glow(false).color(LIME_SH).box(0, 0.4, -10.2, 46, 2.2, 10.5);
  if (hi) {
    for (let st = 0; st < 6; st++) {
      k.color(st % 2 ? LIMESTONE : LIME_SH).box(0, 0.4 + st * 0.36, -3.2 - st * 0.45, 44 - st * 0.8, 0.38, 2.8);
    }
  }
  k.glow(true).color(LIT).box(0, 3.2, -13.8, 38, 15.6, 0.5);
  k.glow(false).color(LIMESTONE);
  const colSeg = hi ? 14 : 6;
  for (let i = 0; i < 10; i++) {
    const cx = -20.25 + i * 4.5;
    k.cyl(cx, 2.6, -7.8, 0.88, 0.76, 16.2, colSeg);
    if (hi) {
      k.color(LIME_SH).cyl(cx, 2.6, -7.8, 1.15, 1.05, 0.65, 10);
      k.box(cx, 18.8, -7.8, 2.1, 0.65, 1.9);
      k.color(LIMESTONE).cyl(cx - 0.85, 18.55, -6.9, 0.36, 0.36, 0.45, 8);
      k.cyl(cx + 0.85, 18.55, -6.9, 0.36, 0.36, 0.45, 8);
      k.cyl(cx - 0.85, 18.55, -8.7, 0.36, 0.36, 0.45, 8);
      k.cyl(cx + 0.85, 18.55, -8.7, 0.36, 0.36, 0.45, 8);
    }
  }
  // Engraved MASSACHUSETTS INSTITUTE OF TECHNOLOGY entablature frieze & attic parapet
  k.color(LIMESTONE).box(0, 19.6, -10.6, 45.5, 3.2, 7.6);
  k.color(LIME_SH).box(0, 22.8, -10.6, 46.8, 1.1, 8.4);
  k.color(LIMESTONE).box(0, 23.9, -11.2, 42.0, 2.6, 6.2);
  if (hi) {
    k.color(LIME_SH);
    for (let dx = -22; dx <= 22; dx += 1.4) {
      k.box(dx, 22.4, -6.7, 0.65, 0.38, 0.35);
    }
    k.color(BRONZE);
    for (let lx = -18.5; lx <= 18.5; lx += 1.35) {
      k.box(lx, 20.8, -6.75, 0.75, 0.95, 0.16);
    }
  }

  // 4. The MIT Great Dome (Pantheon-inspired stepped limestone drum & saucer dome, apex 46m)
  const dz = -28;
  k.glow(false).color(LIME_SH).box(0, 23.3, dz, 34, 3.5, 34);
  if (hi) {
    for (const sx of [-15.5, 15.5]) {
      for (const sz of [-15.5, 15.5]) {
        k.color(LIMESTONE).box(sx, 26.8, dz + sz, 2.6, 1.6, 2.6);
      }
    }
  }
  const dSeg = hi ? 32 : 14;
  k.color(LIMESTONE).cyl(0, 26.8, dz, 16.2, 16.0, 8.2, dSeg);
  k.glow(true).color(LIT).cyl(0, 28.2, dz, 16.3, 16.3, 4.6, dSeg);
  if (hi) {
    k.glow(false);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const cx = Math.cos(a) * 16.45, cz = dz + Math.sin(a) * 16.45;
      k.color(LIME_SH).cyl(cx, 26.8, cz, 0.72, 0.68, 0.55, 8);
      k.color(LIMESTONE).cyl(cx, 27.35, cz, 0.56, 0.50, 7.0, 8);
      k.color(LIME_SH).cyl(cx, 34.35, cz, 0.52, 0.76, 0.65, 8);
    }
    k.color(LIME_SH).cyl(0, 34.8, dz, 17.1, 17.1, 0.55, dSeg);
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
  k.glow(true).color(LIT).cyl(0, 45.2, dz, 3.4, 3.2, 0.65, 16);
  k.glow(false).color(COPPER_OCULUS).cyl(0, 45.7, dz, 3.6, 3.6, 0.22, 16);
  if (hi) {
    k.color(COPPER_OCULUS);
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI;
      k.strut([Math.cos(a) * 3.5, 45.85, dz + Math.sin(a) * 3.5], [-Math.cos(a) * 3.5, 45.85, dz - Math.sin(a) * 3.5], 0.16);
    }
  }
}
