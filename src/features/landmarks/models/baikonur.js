// feature/famous-landmarks: Baikonur Cosmodrome Site 1/5 ("Gagarin's Start" / Гагаринский старт), Kazakhstan — 1:1.
// Iconic deep stepped concrete flame canyon pit, 4 olive-green counterweighted tulip suspension truss arms,
// twin yellow/grey service masts, and the legendary R-7 Soyuz-2 + Soyuz MS rocket (46m) with 4 conical
// Korolev-cross strap-on boosters and bright orange interstage ring on pad (0, 0)!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.0;

const STEPPE_APRON = 0xc8beaa, CONCRETE = 0xbab6ac, CANYON_DK = 0x262a30, RAIL_DK = 0x3a4048;
const TULIP_GREEN = 0x4e5e3a, TULIP_DK = 0x384528, COUNTERWEIGHT = 0x7c786e;
const MAST_YELLOW = 0xe6ad22, MAST_GREY = 0x8a929a;
const SOYUZ_GREY = 0x767d85, SOYUZ_WHITE = 0xf4f6f9, SOYUZ_ORANGE = 0xe86a17, ENGINE_DK = 0x282c32;
const FLAME_GLOW = 0xff9e3b, LIT = 0xfff0cc, BEACON_RED = 0xff2a1c;

export const colliders = [
  { x: 0, z: 0, r: 8, h: 48 },
  { x: 0, z: -12, hw: 14, hd: 10, h: 42 },
  { x: 0, z: 8, hw: 38, hd: 44, h: 10 },
  { x: -55, z: -42, hw: 24, hd: 16, h: 18 },
];

function buildFlameCanyonAndTable(k) {
  // Kazakh steppe concrete apron & rail transporter spur leading to pad
  k.glow(false).color(STEPPE_APRON).box(0, -2.5, 0, 190, 2.8, 175);
  k.color(RAIL_DK).box(0, 0.3, -46, 3.2, 0.35, 76);

  // Stepped concrete canyon perimeter & deep flame pit beneath the launch ring
  k.color(CONCRETE)
    .box(-26, 0.3, 6, 16, 6.5, 68)
    .box(26, 0.3, 6, 16, 6.5, 68)
    .box(0, 0.3, -24, 68, 6.5, 16);
  k.color(CANYON_DK).box(0, -2.0, 12, 36, 6.2, 56);

  // Circular steel launch table ring suspended over the canyon pit at (0, 0)
  k.color(TULIP_DK).cyl(0, 4.0, 0, 9.5, 10.5, 3.2, k.hi ? 20 : 12);
  k.color(CONCRETE).box(0, 5.2, -14, 18, 2.0, 18);
}

function buildTulipArmsAndServiceMasts(k) {
  const hi = k.hi;

  // 4 Iconic Olive-Green Counterweighted Tulip Suspension Truss Arms around (0, 0)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ca = Math.cos(a), sa = Math.sin(a);
    // Heavy counterweight box at base outside the ring (r = 12m)
    k.glow(false).color(COUNTERWEIGHT);
    k.push().translate(ca * 12.2, 6.2, sa * 12.2).rotateY(-a);
    k.box(0, 0, 0, 4.2, 3.6, 3.2);
    k.pop();

    // Tilted olive-green truss arm reaching up to waist of Soyuz rocket (y = 21m)
    k.color(TULIP_GREEN)
      .strut([ca * 10.5, 7.2, sa * 10.5], [ca * 3.8, 21.5, sa * 3.8], 1.35)
      .strut([ca * 11.8, 8.8, sa * 11.8], [ca * 4.5, 20.5, sa * 4.5], 0.95);
    if (hi) {
      k.color(TULIP_DK).strut([ca * 8.2, 12.0, sa * 8.2], [ca * 6.0, 16.5, sa * 6.0], 0.65);
    }
  }

  // Twin Yellow & Grey Service Masts flanking the rocket (opened to ±11m along X)
  for (const sx of [-11.5, 11.5]) {
    k.color(MAST_GREY).box(sx, 6.8, -2.5, 3.2, 3.5, 3.2);
    // Slightly tilted yellow lattice mast with upper service cage
    k.color(MAST_YELLOW)
      .strut([sx, 10.0, -2.5], [sx * 1.15, 42.0, -2.5], 1.45)
      .strut([sx * 0.92, 10.0, -2.5], [sx * 1.05, 42.0, -2.5], 1.1);
    k.color(MAST_GREY).box(sx * 1.08, 36.5, -2.5, 3.6, 7.5, 3.6);
  }

  // Tall Umbilical Cable Mast behind rocket (z = -9.5)
  k.color(TULIP_GREEN).strut([0, 7.2, -9.5], [0, 41.0, -7.2], 1.25);
  for (const yArm of [18.0, 29.0, 38.0]) {
    k.color(MAST_YELLOW).strut([0, yArm, -7.8], [0, yArm, -1.8], 0.65);
  }

  // 4 Perimeter Lightning & Floodlight Towers (60m tall)
  for (const [lx, lz] of [[-42, -34], [42, -34], [-42, 38], [42, 38]]) {
    k.color(MAST_GREY).cyl(lx, 0.3, lz, 1.2, 0.35, 58, 8);
    k.glow(true).color(LIT).box(lx, 52, lz, 3.2, 1.8, 3.2);
    k.color(BEACON_RED).sphere(lx, 59.0, lz, 0.75, 6, 4);
    k.glow(false);
  }
}

function buildSoyuzRocket(k, rx, rz) {
  const hi = k.hi;
  const seg = hi ? 20 : 12;
  const y0 = 7.2; // suspended in launch ring at (0, 0)

  // RD-107A / RD-108 vernier & main engine clusters + ignition glow
  k.glow(true).color(FLAME_GLOW).cyl(rx, y0 - 1.6, rz, 3.4, 2.4, 1.2, 12);
  k.glow(false).color(ENGINE_DK).cyl(rx, y0 - 0.8, rz, 1.4, 1.1, 1.0, seg);

  // Central Core Stage (Block A) — olive-grey lower body, white upper body
  k.color(SOYUZ_GREY).cyl(rx, y0, rz, 1.48, 1.48, 19.5, seg);
  k.color(SOYUZ_WHITE).cyl(rx, y0 + 19.5, rz, 1.48, 1.48, 8.2, seg);

  // Iconic 4 Tapered Conical Strap-On Boosters (Blocks B, V, G, D) around core
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const bx = rx + Math.cos(a) * 2.25, bz = rz + Math.sin(a) * 2.25;
    k.color(ENGINE_DK).cyl(bx, y0 - 0.8, bz, 1.15, 0.85, 0.9, 10);
    // Grey conical booster body with orange top trim
    k.color(SOYUZ_GREY).lathe(bx, y0, bz, [
      [1.38, 0],
      [1.32, 8.5],
      [0.82, 16.5],
      [0.25, 19.2],
      [0.0, 19.8],
    ], hi ? 14 : 8);
    k.color(SOYUZ_ORANGE).cyl(bx, y0 + 16.0, bz, 0.86, 0.45, 1.6, hi ? 12 : 8);
  }

  // Iconic Bright Orange Interstage Lattice Skirt & Third Stage (Block I)
  k.color(SOYUZ_ORANGE).cyl(rx, y0 + 27.7, rz, 1.52, 1.52, 2.8, seg);
  k.color(SOYUZ_GREY).cyl(rx, y0 + 30.5, rz, 1.5, 1.5, 4.2, seg);

  // White Soyuz MS Spacecraft Fairing with upper folding grid panels & SAS Escape Tower
  k.color(SOYUZ_WHITE).lathe(rx, y0 + 34.7, rz, [
    [1.5, 0],
    [1.62, 1.2],
    [1.62, 6.8],
    [0.95, 9.5],
    [0.35, 10.6],
  ], seg);
  k.color(SOYUZ_ORANGE).cyl(rx, y0 + 36.2, rz, 1.65, 1.65, 0.75, seg);

  // SAS Launch Escape System needle tower at apex (reaches ~46m above pad)
  k.color(SOYUZ_WHITE).lathe(rx, y0 + 45.3, rz, [
    [0.38, 0],
    [0.38, 3.8],
    [0.14, 5.2],
    [0.0, 6.8],
  ], 10);
}

export function build(k) {
  buildFlameCanyonAndTable(k);
  buildTulipArmsAndServiceMasts(k);
  buildSoyuzRocket(k, 0, 0);

  // Telemetry & launch control bunker complex to the northwest
  k.glow(false).color(CONCRETE).box(-55, 0.3, -42, 46, 12.0, 30);
  k.color(TULIP_GREEN).box(-55, 12.3, -42, 47, 1.6, 31);
}
