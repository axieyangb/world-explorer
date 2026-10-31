// feature/famous-landmarks: NASA Kennedy Space Center LC-39B & Vehicle Assembly Building (VAB), Cape Canaveral FL — 1:1.
// Iconic elevated LC-39B concrete pad with deep flame trench, 115m Mobile Launcher (ML-1) umbilical tower & swing arms,
// NASA Artemis SLS Block 1 + Orion (98m) with orange-tan core stage & twin 5-segment SRBs on pad (0, 0),
// and the colossal cubic Vehicle Assembly Building (VAB) with the giant US Flag mural & NASA Meatball emblem nearby!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.1;

const CONCRETE = 0xcac6bc, PAD_SLOPE = 0xb4afa4, TRENCH_DK = 0x2c3036, CRAWLER_TRK = 0x7e7970;
const TOWER_STEEL = 0x8e97a2, TOWER_DK = 0x4b535d, SWING_ARM = 0x626b75;
const SLS_ORANGE = 0xd96b27, SLS_ORANGE_DK = 0xb85518, SRB_WHITE = 0xf4f6f9, SRB_BLK = 0x1a1e24;
const ENGINE_BELL = 0x282d34, FLAME_GLOW = 0xff9e3b;
const VAB_WHITE = 0xebede8, VAB_BLACK = 0x1e232a, VAB_DOOR = 0x2d333b;
const FLAG_RED = 0xb22234, FLAG_BLUE = 0x0b3d91, FLAG_WHITE = 0xf8fafc;
const TANK_W = 0xf2f5f8,MAST_W = 0xe8edf2, BEACON_RED = 0xff2a1c, LIT = 0xfff2d2;

export const colliders = [
  { x: 0, z: 0, r: 10, h: 98 },
  { x: 0, z: -15, hw: 9, hd: 9, h: 115 },
  { x: 0, z: -4, hw: 44, hd: 44, h: 12 },
  { x: -120, z: -85, hw: 48, hd: 38, h: 110 },
  { x: 64, z: -22, r: 11, h: 32 },
  { x: -62, z: 24, r: 11, h: 32 },
];

function buildPadAndTrench(k) {
  const hi = k.hi;
  // Base perimeter apron & crawlerway approach
  k.glow(false).color(CONCRETE).box(0, -2.5, 0, 210, 2.8, 180);
  k.color(CRAWLER_TRK).box(0, 0.3, 48, 16, 0.35, 82).box(-14, 0.3, 48, 6, 0.35, 82).box(14, 0.3, 48, 6, 0.35, 82);

  // Elevated octagonal concrete pad mound (12m high) with sloped sides
  k.color(PAD_SLOPE).taper(0, 0.3, -4, 96, 96, 56, 56, 11.2);
  k.color(CONCRETE).box(0, 11.5, -4, 56, 1.0, 56);

  // Deep flame trench cut-out & refractory brick deflector
  k.color(TRENCH_DK).box(0, 2.0, -4, 14, 10.6, 58);
  k.color(TOWER_DK).taper(0, 2.2, 6, 13.5, 18, 13.5, 2.0, 9.5);

  // Mobile Launcher 1 (ML-1) two-story base platform sitting on pad mounts
  k.color(TOWER_STEEL).box(0, 12.5, -6, 26, 6.5, 30);
  k.color(TOWER_DK);
  for (const sx of [-11, 11]) {
    for (const sz of [-18, -6, 6]) {
      k.cyl(sx, 11.5, sz, 1.1, 1.2, 4.0, hi ? 8 : 6);
    }
  }
}

function buildMobileLauncherTower(k, tx, tz) {
  const hi = k.hi;
  const yBase = 19.0, H = 115.0, hw = 6.2;

  // 4 corner steel columns + elevator core
  k.glow(false).color(TOWER_STEEL);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(tx + sx * hw, yBase, tz + sz * hw, 1.4, H - yBase, 1.4);
    }
  }
  k.color(TOWER_DK).box(tx, yBase, tz - 1.2, 4.8, H - yBase - 3.0, 4.8);

  // Horizontal deck levels + X-bracing trusses
  const bays = hi ? 12 : 6;
  const bh = (H - yBase) / bays;
  for (let b = 0; b <= bays; b++) {
    const y0 = yBase + b * bh, y1 = y0 + bh;
    k.color(TOWER_STEEL).box(tx, y0, tz, hw * 2 + 1.6, 0.85, hw * 2 + 1.6);
    if (b < bays && hi) {
      k.color(TOWER_DK);
      for (const s of [-1, 1]) {
        k.strut([tx - hw, y0, tz + s * hw], [tx + hw, y1, tz + s * hw], 0.45);
        k.strut([tx + hw, y0, tz + s * hw], [tx - hw, y1, tz + s * hw], 0.45);
        k.strut([tx + s * hw, y0, tz - hw], [tx + s * hw, y1, tz + hw], 0.45);
      }
    }
  }

  // 3 Umbilical Swing Arms + Crew Access Arm (White Room at y = 84m) connected toward rocket at (0, 0)
  const armHeights = [36.0, 56.0, 72.0, 84.0];
  for (let i = 0; i < armHeights.length; i++) {
    const ay = armHeights[i];
    const isCrew = i === 3;
    k.color(isCrew ? SRB_WHITE : SWING_ARM);
    k.strut([tx + 2.0, ay, tz + hw], [0, ay, -3.6], isCrew ? 1.8 : 1.35);
    if (isCrew) {
      // White Room cabin at tip of Crew Access Arm
      k.color(SRB_WHITE).box(0, ay - 1.2, -3.2, 3.6, 3.2, 3.2);
    }
  }

  // Floodlight bars & top aviation beacon
  k.glow(true).color(LIT);
  for (let y = 28; y <= 108; y += 16) {
    k.box(tx, y, tz + hw + 0.6, 7.5, 1.2, 0.4);
  }
  k.color(BEACON_RED).sphere(tx, H + 2.5, tz, 0.85, 6, 4);
  k.glow(false);
}

function buildSlsRocket(k, rx, rz) {
  const hi = k.hi;
  const seg = hi ? 22 : 12;
  const y0 = 19.0; // sits atop ML-1 launch deck at (0, 0)

  // 4 RS-25 Core Stage engines + fiery launch glow
  k.glow(false).color(ENGINE_BELL);
  for (const [ex, ez] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    k.cyl(rx + ex, y0 - 2.6, rz + ez, 1.15, 0.55, 2.8, hi ? 10 : 6);
  }
  k.glow(true).color(FLAME_GLOW).cyl(rx, y0 - 2.8, rz, 3.6, 2.8, 1.0, 12);
  k.glow(false);

  // Orange-tan Liquid Hydrogen / Liquid Oxygen Core Stage (65m tall, r = 4.2m)
  k.color(SLS_ORANGE_DK).cyl(rx, y0, rz, 4.25, 4.25, 4.5, seg);
  k.color(SLS_ORANGE).cyl(rx, y0 + 4.5, rz, 4.2, 4.2, 54.0, seg);
  // Ribbed intertank band + external LOX feedline & Tail Service Masts (TSMs)
  k.color(SLS_ORANGE_DK).cyl(rx, y0 + 42.0, rz, 4.32, 4.32, 6.8, seg);
  if (hi) {
    // External LOX & Pressurization lines along the core stage
    k.color(SLS_ORANGE_DK);
    k.cyl(rx + 4.18, y0 + 3.0, rz + 0.8, 0.28, 0.28, 41.0, 8);
    k.cyl(rx - 4.18, y0 + 3.0, rz + 0.8, 0.24, 0.24, 41.0, 8);
    // Twin Tail Service Masts (TSMs) on ML-1 deck flanking the core stage base
    k.color(SRB_WHITE);
    for (const sx of [-3.4, 3.4]) {
      k.taper(rx + sx, y0, rz - 4.2, 2.2, 2.8, 1.4, 1.8, 6.2);
      k.strut([rx + sx, y0 + 4.8, rz - 3.2], [rx + sx * 0.75, y0 + 3.8, rz - 1.5], 0.55);
    }
    // Orion LAS 4-nozzle abort motor ring & Service Module RCS pods
    k.color(TOWER_DK).cyl(rx, y0 + 86.2, rz, 0.72, 0.58, 1.2, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.color(SRB_WHITE).box(rx + Math.cos(a) * 2.52, y0 + 73.0, rz + Math.sin(a) * 2.52, 0.55, 2.2, 0.55);
    }
  }

  // Twin 5-segment Solid Rocket Boosters (SRBs, 54m tall) at x = ±6.2m
  for (const sx of [-6.2, 6.2]) {
    // Aft skirt + nozzle
    k.color(ENGINE_BELL).cyl(rx + sx, y0 - 2.8, rz, 1.9, 1.2, 2.8, seg);
    k.color(SRB_WHITE).taper(rx + sx, y0, rz, 4.2, 4.2, 3.7, 3.7, 3.2);
    // Main white 5-segment casing
    k.color(SRB_WHITE).cyl(rx + sx, y0 + 3.2, rz, 1.85, 1.85, 43.0, seg);
    // Black roll-pattern bands & field joints
    k.color(SRB_BLK);
    for (const by of [11.5, 20.0, 28.5, 37.0, 44.2]) {
      k.cyl(rx + sx, y0 + by, rz, 1.89, 1.89, 0.9, seg);
    }
    // Forward frustum + pointed nose cone
    k.color(SRB_WHITE).lathe(rx + sx, y0 + 46.2, rz, [[1.85, 0], [1.2, 4.2], [0.4, 7.0], [0.0, 8.2]], seg);
    // Strut attachments to Core Stage
    k.color(TOWER_DK)
      .strut([rx + sx, y0 + 8.0, rz], [rx + Math.sign(sx) * 4.0, y0 + 8.0, rz], 0.65)
      .strut([rx + sx, y0 + 43.5, rz], [rx + Math.sign(sx) * 4.0, y0 + 43.5, rz], 0.65);
  }

  // Launch Vehicle Stage Adapter (LVSA) conical frustum + ICPS upper stage
  k.color(SRB_WHITE).lathe(rx, y0 + 58.5, rz, [
    [4.2, 0],
    [2.6, 8.5],
    [2.6, 13.5],
  ], seg);
  k.color(SRB_BLK).cyl(rx, y0 + 59.5, rz, 4.12, 3.85, 1.6, seg);

  // Orion European Service Module + Crew Module Cone + Launch Abort System (LAS) needle tower
  k.color(TOWER_STEEL).cyl(rx, y0 + 72.0, rz, 2.5, 2.5, 4.0, seg);
  k.color(SRB_WHITE).lathe(rx, y0 + 76.0, rz, [
    [2.5, 0],
    [1.1, 3.8],
    [0.55, 4.5],
    [0.55, 11.2],
    [0.18, 13.5],
    [0.0, 15.0],
  ], seg);
}

function buildLightningMastAndTanks(k) {
  const hi = k.hi;
  // Tall fiberglass lightning protection mast on steel tripod (east of pad)
  const mx = 48, mz = -18;
  k.glow(false).color(TOWER_STEEL);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.strut([mx + Math.cos(a) * 14, 0.3, mz + Math.sin(a) * 14], [mx, 92, mz], 1.1);
  }
  k.color(MAST_W).cyl(mx, 88, mz, 1.1, 0.25, 42, 8);
  k.glow(true).color(BEACON_RED).sphere(mx, 130.5, mz, 0.85, 6, 4);
  k.glow(false);

  // Spherical LH2 & LOX Cryogenic Storage Tanks at perimeter
  for (const [tx, tz] of [[64, -22], [-62, 24]]) {
    k.color(TANK_W).sphere(tx, 16.5, tz, 10.5, hi ? 16 : 10, hi ? 10 : 6);
    k.color(TOWER_STEEL);
    const legs = hi ? 8 : 4;
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2;
      k.strut([tx + Math.cos(a) * 9.2, 0.3, tz + Math.sin(a) * 9.2], [tx + Math.cos(a) * 8.6, 15.5, tz + Math.sin(a) * 8.6], 0.7);
    }
  }

  // Tall white KSC Water Tower
  const wx = 52, wz = 36;
  k.color(TANK_W).sphere(wx, 52, wz, 7.5, hi ? 14 : 8, 8, 0.85);
  k.color(SRB_WHITE);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.strut([wx + Math.cos(a) * 7.5, 0.3, wz + Math.sin(a) * 7.5], [wx + Math.cos(a) * 5.2, 48, wz + Math.sin(a) * 5.2], 0.75);
  }
}

function buildVAB(k, vx, vz) {
  k.push().translate(vx, 0, vz);
  // Iconic cubic Vehicle Assembly Building megastructure
  const W = 92, D = 74, H = 108;
  k.glow(false).color(VAB_WHITE).box(0, 0.3, 0, W, H, D);
  // Low-bay southern wing
  k.color(VAB_WHITE).box(0, 0.3, D / 2 + 14, 58, 44, 28);

  // Iconic black vertical architectural stripes on north/south/east/west faces
  k.color(VAB_BLACK);
  for (const sx of [-30, 0, 30]) {
    k.box(sx, 0.3, D / 2 + 0.3, 12, H + 0.2, 0.8);
    k.box(sx, 0.3, -D / 2 - 0.3, 12, H + 0.2, 0.8);
  }
  // High-Bay vertical slotted doors on East & West faces (facing pad)
  for (const sz of [-18, 18]) {
    k.color(VAB_BLACK).box(W / 2 + 0.3, 0.3, sz, 0.8, H - 4, 16);
    k.color(VAB_DOOR).box(W / 2 + 0.6, 0.3, sz, 0.6, 86, 11);
    k.color(VAB_BLACK).box(-W / 2 - 0.3, 0.3, sz, 0.8, H - 4, 16);
  }

  // Giant American Flag Mural on East Face (facing launch pad)
  const fx = W / 2 + 0.55, fy = 62, fz = -18, fh = 34, fw = 18;
  k.color(FLAG_WHITE).box(fx, fy, fz, 0.5, fh, fw);
  // Red vertical stripes
  k.color(FLAG_RED);
  for (let s = 0; s < 7; s++) {
    const szOff = fz - fw / 2 + 1.1 + s * (fw / 6.5);
    k.box(fx + 0.15, fy, szOff, 0.5, fh, 1.3);
  }
  // Blue Star Canton in top-left of flag
  k.color(FLAG_BLUE).box(fx + 0.28, fy + fh * 0.52, fz - fw * 0.25, 0.55, fh * 0.48, fw * 0.5);

  // Giant Blue NASA "Meatball" circular emblem beside the flag (at z = +18)
  k.color(FLAG_BLUE).push().translate(fx + 0.3, fy + 16, 18).rotateZ(Math.PI / 2);
  k.cyl(0, 0, 0, 8.5, 8.5, 0.6, 20);
  k.pop();
  // Red NASA vector chevron across the meatball
  k.color(FLAG_RED)
    .strut([fx + 0.7, fy + 11, 11], [fx + 0.7, fy + 21, 23], 1.1)
    .strut([fx + 0.7, fy + 21, 23], [fx + 0.7, fy + 14, 15], 0.9);
  k.glow(true).color(FLAG_WHITE).box(fx + 0.75, fy + 15.2, 18, 0.5, 2.2, 11.5);
  k.glow(false);

  // Roof perimeter cornice & red aircraft warning beacons
  k.color(VAB_BLACK).box(0, H, 0, W + 1.5, 2.2, D + 1.5);
  k.glow(true).color(BEACON_RED);
  for (const [bx, bz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    k.sphere(bx, H + 3.0, bz, 0.85, 6, 4);
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  buildPadAndTrench(k);
  buildMobileLauncherTower(k, 0, -15);
  buildSlsRocket(k, 0, 0);
  buildLightningMastAndTanks(k);
  buildVAB(k, -120, -85);
}
