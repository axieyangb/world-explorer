// feature/famous-landmarks: ESA Guiana Space Centre ELA-4 (Ensemble de Lancement Ariane 4), Kourou, French Guiana — 1:1.
// Concrete launch table with dual symmetrical flame ducts, 70m steel umbilical mast, 4 tall 90m perimeter lightning towers,
// massive red-and-white Mobile Gantry structure set back on rails, and Ariane 6 (A64, 63m) with 4 P120C solid boosters on pad (0, 0)!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.0;

const CONCRETE = 0xcac6bc, PAD_DK = 0x525860, TRENCH_DK = 0x262a30;
const MAST_STEEL = 0x86909c, MAST_DK = 0x4e5660;
const GANTRY_WHITE = 0xf0f3f7, GANTRY_RED = 0xc82822, ESA_BLUE = 0x003399;
const ARIANE_WHITE = 0xf7f9fc, ENGINE_DK = 0x2a2f37, FLAME_GLOW = 0xff9e3b;
const JUNGLE_GREEN = 0x3b7a38, LIT = 0xfff2d0, BEACON_RED = 0xff2a1c;

export const colliders = [
  { x: 0, z: 0, r: 8, h: 65 },
  { x: 0, z: -13, hw: 6, hd: 6, h: 72 },
  { x: 0, z: 62, hw: 26, hd: 24, h: 90 },
  { x: -38, z: -38, r: 5, h: 90 },
  { x: 38, z: -38, r: 5, h: 90 },
  { x: -38, z: 38, r: 5, h: 90 },
  { x: 38, z: 38, r: 5, h: 90 },
];

function buildLaunchTableAndDucts(k) {
  // ELA-4 concrete apron & heavy gantry rail tracks
  k.glow(false).color(CONCRETE).box(0, -2.5, 10, 190, 2.8, 195);
  k.color(PAD_DK).box(-18, 0.3, 32, 2.2, 0.4, 96).box(18, 0.3, 32, 2.2, 0.4, 96);

  // Dual symmetrical flame exhaust ducts extending left & right (-X / +X)
  k.color(TRENCH_DK).box(0, -1.2, 0, 88, 5.2, 14);
  k.color(CONCRETE)
    .taper(-36, 0.3, 0, 28, 22, 18, 16, 5.5)
    .taper(36, 0.3, 0, 28, 22, 18, 16, 5.5);

  // Massive steel & concrete ELA-4 Launch Table at (0, 0)
  k.color(PAD_DK).box(0, 0.3, 0, 26, 6.2, 26);
  k.color(MAST_STEEL).box(0, 6.5, 0, 22, 1.5, 22);
}

function buildUmbilicalMastAndLightningTowers(k) {
  const hi = k.hi;
  const mx = 0, mz = -13, H = 70;

  // 70m steel Umbilical Mast behind the Ariane 6 rocket
  k.glow(false).color(MAST_STEEL).box(mx, 0.3, mz, 9.5, H, 9.5);
  k.color(MAST_DK).box(mx, 2.0, mz + 0.5, 6.8, H - 4.0, 6.8);

  // Cryogenic umbilical arms connecting to Ariane 6 core & upper stage at (0, 0)
  for (const yArm of [24.0, 44.0, 54.0]) {
    k.color(MAST_STEEL).strut([mx, yArm, mz + 4.5], [0, yArm, -2.5], 1.35);
    if (hi) {
      k.color(MAST_DK).strut([mx, yArm + 3.2, mz + 4.5], [0, yArm + 0.4, -3.2], 0.38);
      k.color(GANTRY_WHITE).cable([mx + 1.2, yArm - 0.4, mz + 4.5], [0.8, yArm - 0.6, -2.6], 0.18, 0.9, 8, 6);
    }
  }
  if (hi) {
    // ELA-4 Water Tower (Château d'eau) & deluge main pipe to launch table
    k.color(GANTRY_WHITE).cyl(44, 0.3, -12, 3.2, 2.8, 42.0, 14);
    k.sphere(44, 45.0, -12, 6.2, 16, 8, 0.85);
    k.color(ESA_BLUE).cyl(44, 44.2, -12, 6.3, 6.3, 1.4, 16);
    k.color(MAST_STEEL).pipe([41, 2.2, -12], [12, 2.2, -2], 0.55, 8);
  }

  // 4 Signature 90m Tall Perimeter Lightning Protection Towers around the pad
  const lPos = [
    [-38, -38],
    [38, -38],
    [-38, 38],
    [38, 38],
  ];
  for (const [lx, lz] of lPos) {
    k.color(MAST_STEEL).taper(lx, 0.3, lz, 6.5, 6.5, 2.2, 2.2, 74);
    k.color(GANTRY_RED).cyl(lx, 74.3, lz, 0.9, 0.2, 16.0, 8);
    k.glow(true).color(BEACON_RED).sphere(lx, 90.8, lz, 0.85, 6, 4);
    if (hi) {
      k.color(LIT).box(lx, 68, lz, 3.0, 1.6, 3.0);
    }
    k.glow(false);
  }
}

function buildAriane6Rocket(k, rx, rz) {
  const hi = k.hi;
  const seg = hi ? 22 : 12;
  const y0 = 8.0; // atop launch table at (0, 0)

  // Vulcain 2.1 main cryogenic engine + fiery exhaust glow
  k.glow(true).color(FLAME_GLOW).cyl(rx, y0 - 1.8, rz, 3.6, 2.6, 1.2, 12);
  k.glow(false).color(ENGINE_DK).cyl(rx, y0 - 1.2, rz, 1.4, 0.9, 1.4, seg);

  // White Central Cryogenic Core Stage (LLPM, r = 2.7m, h = 34m) + Upper Stage (ULPM)
  k.color(ARIANE_WHITE).cyl(rx, y0, rz, 2.7, 2.7, 42.0, seg);
  k.color(ESA_BLUE).cyl(rx, y0 + 32.0, rz, 2.75, 2.75, 1.4, seg);

  // 4 White P120C Solid Strap-On Boosters (A64 configuration) at ±4.4m
  const bPos = [
    [-4.35, 0],
    [4.35, 0],
    [0, -4.35],
    [0, 4.35],
  ];
  for (const [bx, bz] of bPos) {
    k.color(ENGINE_DK).cyl(rx + bx, y0 - 1.2, rz + bz, 1.4, 0.95, 1.3, 10);
    k.color(ARIANE_WHITE).cyl(rx + bx, y0, rz + bz, 1.7, 1.7, 19.5, hi ? 14 : 8);
    k.color(GANTRY_RED).cyl(rx + bx, y0 + 18.2, rz + bz, 1.74, 1.74, 0.8, hi ? 14 : 8);
    // Pointed P120C nose cone
    k.color(ARIANE_WHITE).lathe(rx + bx, y0 + 19.5, rz + bz, [
      [1.7, 0],
      [1.05, 2.8],
      [0.0, 5.2],
    ], hi ? 12 : 8);
  }

  // Iconic Ogive Payload Fairing (20m tall, r = 2.7m) with ESA blue accent band
  k.color(ARIANE_WHITE).lathe(rx, y0 + 42.0, rz, [
    [2.7, 0],
    [2.7, 11.5],
    [2.1, 16.0],
    [1.1, 19.2],
    [0.0, 21.0],
  ], seg);
  k.color(ESA_BLUE).cyl(rx, y0 + 48.5, rz, 2.75, 2.75, 1.8, seg);
}

function buildMobileGantry(k, gx, gz) {
  // Massive 90m tall Red-and-White Mobile Gantry rolled back on rails at z = +62
  k.push().translate(gx, 0, gz);
  const W = 48, D = 44, H = 88;
  // U-shaped gantry body open toward -Z (facing the launch pad)
  k.glow(false).color(GANTRY_WHITE)
    .box(-16, 0.4, 0, 14, H, D)
    .box(16, 0.4, 0, 14, H, D)
    .box(0, 0.4, 12, 20, H, 20);

  // Bold red structural horizontal bands & roof crown
  k.color(GANTRY_RED);
  for (const yBand of [4.0, 28.0, 54.0, 82.0]) {
    k.box(-16, yBand, 0, 14.8, 3.8, D + 0.8);
    k.box(16, yBand, 0, 14.8, 3.8, D + 0.8);
    k.box(0, yBand, 12, 22, 3.8, 20.8);
  }
  // ESA blue logo plaque on gantry facade
  k.color(ESA_BLUE).box(-16, 68, -D / 2 - 0.4, 10, 6.5, 0.6).box(16, 68, -D / 2 - 0.4, 10, 6.5, 0.6);

  k.glow(true).color(BEACON_RED)
    .sphere(-22, H + 2.0, -D / 2, 0.85, 6, 4)
    .sphere(22, H + 2.0, -D / 2, 0.85, 6, 4);
  k.glow(false);
  k.pop();

  // Tropical French Guiana treeline accent along perimeter
  for (let i = -3; i <= 3; i++) {
    k.color(JUNGLE_GREEN).sphere(i * 24, 4.5, -82, 6.5, 8, 5, 0.75);
  }
}

export function build(k) {
  buildLaunchTableAndDucts(k);
  buildUmbilicalMastAndLightningTowers(k);
  buildAriane6Rocket(k, 0, 0);
  buildMobileGantry(k, 0, 62);
}
