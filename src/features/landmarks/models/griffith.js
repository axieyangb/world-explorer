// feature/famous-landmarks: Griffith Observatory, Mount Hollywood, Los Angeles — 1:1 (34.1184, -118.3004).
// Iconic 1935 Art Deco / Beaux-Arts white concrete observatory overlooking the Los Angeles Basin:
// central rotunda crowned by the large copper-bronze Samuel Oschin Planetarium dome (R = 11.5 m),
// east & west exhibition wings terminating in twin copper-bronze telescope domes (R = 6.5 m) with
// astronomical shutter slits, south cliffside viewing terraces, Greek Revival north entrance portico,
// and the 12 m white Astronomers Monument obelisk & bronze equatorial sundial on the front north lawn.

const WHITE = 0xf1eee6, WHITE_SH = 0xd9d4c7, TRIM = 0xc7c0b0;
const COPPER = 0x7b563d, COPPER_LT = 0x996d4e, PATINA = 0x4f7d6e;
const GLASS = 0x344656, DARK = 0x22262b, LAWN = 0x508946, PAVE = 0xd6d0c2, LIT = 0xffefd0;

export const lodDist = 2600;
export const fineDist = 550;
export const glowStrength = 1.95;

export const colliders = [
  { x: 0, z: 0, hw: 44, hd: 16, h: 16 },
  { x: 0, z: 5, r: 14, h: 27 },
  { x: -34, z: -2, r: 8.5, h: 20 },
  { x: 34, z: -2, r: 8.5, h: 20 },
  { x: 0, z: -38, r: 4.5, h: 13 },
];

/** Copper-bronze observatory dome with ribbed seams and telescope shutter slit. */
function copperDome(k, cx, y0, cz, rDrum, hDrum, rDome, hasSlit) {
  const hi = k.hi, seg = hi ? 32 : 14;
  k.push().translate(cx, y0, cz);
  // White Art Deco octagonal/cylindrical drum with fluted pilasters
  k.glow(true).color(WHITE).cyl(0, 0, 0, rDrum, rDrum, hDrum, seg);
  k.color(TRIM).cyl(0, hDrum - 0.8, 0, rDrum + 0.45, rDrum + 0.45, 0.8, seg);
  if (hi) {
    const nPil = 16;
    for (let i = 0; i < nPil; i++) {
      const a = (i / nPil) * Math.PI * 2;
      k.color(WHITE_SH).box(Math.cos(a) * rDrum, 0.4, Math.sin(a) * rDrum, 0.55, hDrum - 1.2, 0.55);
    }
  }
  // Copper-bronze hemisphere with patina sheen band at base
  k.glow(false).color(PATINA).cyl(0, hDrum, 0, rDome + 0.2, rDome, 0.9, seg);
  k.color(COPPER).sphere(0, hDrum + 0.4, 0, rDome, seg, hi ? 10 : 6, 0.96, 0.5);
  if (hasSlit) {
    // Telescope shutter arch slit across the dome meridian
    k.color(COPPER_LT).box(0, hDrum + rDome * 0.48, -rDome * 0.42, 1.9, rDome * 0.95, rDome * 0.95);
    k.color(DARK).box(0, hDrum + rDome * 0.5, -rDome * 0.46, 1.1, rDome * 0.88, rDome * 0.9);
  }
  k.pop();
}

function mainBuilding(k) {
  const hi = k.hi;

  // Deep hillside foundation terrace on the south slope of Mount Hollywood
  k.glow(false).color(WHITE_SH).box(0, -9, 2, 92, 9.4, 42);
  k.color(PAVE).box(0, 0.4, -22, 78, 0.4, 52);

  // Central Rotunda Hall + East/West Gallery Wings
  k.glow(true).color(WHITE).box(0, 0.4, 0, 68, 11.2, 22);
  k.color(TRIM).box(0, 11.6, 0, 70, 0.9, 23.4);
  // Rooftop promenade parapet walls
  k.color(WHITE).box(0, 12.5, -11.0, 69, 1.2, 0.8).box(0, 12.5, 11.0, 69, 1.2, 0.8);

  // North entrance portico (facing -Z toward the Astronomers Monument lawn)
  k.color(WHITE).box(0, 0.4, -13.5, 18, 12.2, 6.5);
  k.color(TRIM).box(0, 12.6, -13.8, 19.2, 1.1, 7.2);
  // Tall bronze & glass Art Deco entrance portal + warm glowing foyer
  k.glow(false).color(DARK).box(0, 0.8, -16.8, 5.2, 7.6, 0.5);
  k.glow(true).color(LIT).box(0, 1.0, -16.9, 3.8, 6.8, 0.4);

  // Gallery windows & Art Deco vertical piers along the north and south wing facades
  for (const sx of [-1, 1]) {
    for (let i = 1; i <= 3; i++) {
      const wx = sx * (9 + i * 5.8);
      for (const sz of [-1, 1]) {
        k.glow(true).color(LIT).box(wx, 2.4, sz * 11.05, 2.4, 5.8, 0.3);
        k.glow(false).color(GLASS).box(wx, 2.6, sz * 11.12, 2.0, 5.2, 0.25);
        if (hi) {
          k.glow(true).color(WHITE_SH).box(wx + 2.9, 0.4, sz * 11.0, 0.8, 11.2, 0.6);
        }
      }
    }
  }

  // Central Samuel Oschin Planetarium dome (south-center, R_dome = 11.5m, total height ~26.5m)
  copperDome(k, 0, 11.6, 4.5, 12.2, 3.8, 11.5, false);

  // East & West Rotunda Bastions + Twin Copper Telescope Domes (R_dome = 6.5m)
  for (const sx of [-1, 1]) {
    const bx = sx * 34, bz = -1.5;
    k.glow(true).color(WHITE).cyl(bx, 0.4, bz, 9.2, 9.2, 11.8, hi ? 28 : 14);
    k.color(TRIM).cyl(bx, 12.2, bz, 9.7, 9.7, 0.8, hi ? 28 : 14);
    copperDome(k, bx, 13.0, bz, 6.8, 2.4, 6.5, true);
  }
}

function astronomersMonument(k) {
  const hi = k.hi;
  // Front North Lawn & central promenade paths leading to the Astronomers Monument
  k.glow(false).color(LAWN).box(-14, 0.45, -34, 20, 0.2, 28).box(14, 0.45, -34, 20, 0.2, 28);

  // Astronomers Monument (1934 Concrete Art Deco Obelisk with 6 carved astronomer statues & armillary sphere)
  const mz = -38;
  k.glow(true).color(PAVE).cyl(0, 0.4, mz, 6.2, 6.8, 0.9, hi ? 18 : 8);
  k.color(WHITE).cyl(0, 1.3, mz, 3.6, 3.6, 1.6, 6);
  // Fluted 6-pointed star column + upper obelisk shaft + bronze armillary sphere
  k.color(WHITE).extrude(
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 === 0 ? 2.4 : 1.5;
      return [Math.cos(a) * r, mz + Math.sin(a) * r];
    }),
    2.9,
    6.4
  );
  k.color(WHITE_SH).taper(0, 9.3, mz, 2.2, 2.2, 0.9, 0.9, 2.8);
  k.glow(false).color(COPPER_LT).sphere(0, 12.8, mz, 0.95, 10, 6);

  // Bronze Equatorial Sundial south of the monument
  k.color(WHITE).box(0, 0.4, -25, 2.6, 1.2, 2.6);
  k.color(COPPER).cyl(0, 1.6, -25, 1.1, 1.1, 0.35, 12);
}

export function build(k) {
  mainBuilding(k);
  astronomersMonument(k);
  k.glow(false);
}
