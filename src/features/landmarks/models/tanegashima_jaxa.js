// feature/famous-landmarks: JAXA Tanegashima Space Center (種子島宇宙センター) Yoshinobu Launch Complex, Japan — 1:1.
// Scenic Pacific coastal cliff launch platform (LP-2), open-truss umbilical service tower, red-and-white striped
// lightning towers, VAB assembly building, and JAXA H3 Rocket (63m) with orange-gold cryogenic tank & twin SRB-3 boosters on pad (0, 0)!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.0;

const CLIFF_ROCK = 0x847e72, CONCRETE = 0xcac6bc, PAD_DK = 0x4b525a, TRENCH_DK = 0x262a30;
const TOWER_STEEL = 0xd8dfe6, TOWER_RED = 0xd92b24, JAXA_BLUE = 0x004ea2;
const H3_ORANGE = 0xdc7624, H3_WHITE = 0xf5f8fb, ENGINE_DK = 0x282d35, FLAME_GLOW = 0xff9e3b;
const VAB_CREAM = 0xebe8de, TANK_W = 0xf2f5f9, LIT = 0xfff2d2, BEACON_RED = 0xff2a1c;

export const colliders = [
  { x: 0, z: 0, r: 8, h: 65 },
  { x: 0, z: -12, hw: 7, hd: 7, h: 72 },
  { x: -78, z: -52, hw: 24, hd: 22, h: 82 },
  { x: 48, z: -24, r: 10, h: 28 },
];

function buildCoastalPadPlatform(k) {
  // Coastal headland rock terrace & concrete launch complex apron
  k.glow(false).color(CLIFF_ROCK).box(0, -4.5, 0, 195, 4.8, 175);
  k.color(CONCRETE).box(0, 0.3, 0, 150, 1.2, 140);

  // Elevated LP-2 Launch Deck & flame exhaust trench pointing toward the ocean (+Z)
  k.color(PAD_DK).box(0, 1.5, 0, 32, 6.0, 36);
  k.color(TRENCH_DK).box(0, 0.8, 12, 11, 6.2, 42);
  k.color(CONCRETE).box(0, 7.5, -2, 24, 1.2, 24);
}

function buildServiceAndLightningTowers(k) {
  const hi = k.hi;
  const tx = 0, tz = -12, yBase = 7.5, H = 72.0, hw = 5.4;

  // Umbilical Service Tower with red-and-white aviation safety banding
  const bays = hi ? 10 : 5;
  const bh = (H - yBase) / bays;
  for (let b = 0; b < bays; b++) {
    const y0 = yBase + b * bh, y1 = y0 + bh;
    const col = b % 2 === 0 ? TOWER_STEEL : TOWER_RED;
    k.glow(false).color(col);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(tx + sx * hw, y0, tz + sz * hw, 1.2, bh, 1.2);
      }
    }
    k.box(tx, y1, tz, hw * 2 + 1.4, 0.8, hw * 2 + 1.4);
    if (hi) {
      for (const s of [-1, 1]) {
        k.strut([tx - hw, y0, tz + s * hw], [tx + hw, y1, tz + s * hw], 0.4);
        k.strut([tx + hw, y0, tz + s * hw], [tx - hw, y1, tz + s * hw], 0.4);
      }
    }
  }

  // Umbilical swing arms connecting to H3 rocket at (0, 0)
  for (const yArm of [24.0, 42.0, 56.0]) {
    k.color(TOWER_STEEL).strut([tx, yArm, tz + hw], [0, yArm, -2.5], 1.2);
  }
  k.glow(true).color(BEACON_RED).sphere(tx, H + 2.2, tz, 0.8, 6, 4);
  k.glow(false);

  // Twin Red-and-White Striped Lightning Protection Towers flanking the pad
  for (const [lx, lz] of [[-34, -26], [34, -26]]) {
    for (let s = 0; s < 6; s++) {
      k.color(s % 2 === 0 ? H3_WHITE : TOWER_RED).cyl(lx, 1.5 + s * 13.0, lz, 1.8 - s * 0.22, 1.58 - s * 0.22, 13.0, 8);
    }
    k.glow(true).color(BEACON_RED).sphere(lx, 80.5, lz, 0.75, 6, 4);
    k.glow(false);
  }
}

function buildH3Rocket(k, rx, rz) {
  const hi = k.hi;
  const seg = hi ? 22 : 12;
  const y0 = 8.7; // sits atop LP-2 launch mount at (0, 0)

  // Twin LE-9 first-stage liquid hydrogen engines + ignition glow
  k.glow(true).color(FLAME_GLOW).cyl(rx, y0 - 1.6, rz, 3.2, 2.4, 1.1, 12);
  k.glow(false).color(ENGINE_DK);
  if (hi) {
    for (const ex of [-0.95, 0.95]) {
      k.cyl(rx + ex, y0 - 1.2, rz, 0.88, 0.52, 1.4, 12);
    }
    // Diagonal SRB-3 thrust struts & cryogenic propellant transfer pipes from spherical tanks
    for (const sx of [-4.1, 4.1]) {
      k.strut([rx + sx, y0 + 12.2, rz], [rx + Math.sign(sx) * 2.5, y0 + 13.8, rz], 0.35);
      k.strut([rx + sx, y0 + 2.2, rz], [rx + Math.sign(sx) * 2.5, y0 + 2.2, rz], 0.35);
    }
    k.color(TOWER_STEEL).pipe([42, 3.2, -24], [11, 3.2, -8], 0.42, 8);
    k.pipe([42, 3.2, 8], [11, 3.2, 2], 0.42, 8);
  } else {
    k.cyl(rx, y0 - 1.0, rz, 1.6, 1.1, 1.2, seg);
  }

  // White Aft Engine Section + Iconic Orange-Gold Cryogenic Tank Core Stage (r = 2.6m)
  k.color(H3_WHITE).cyl(rx, y0, rz, 2.6, 2.6, 5.5, seg);
  k.color(H3_ORANGE).cyl(rx, y0 + 5.5, rz, 2.6, 2.6, 28.5, seg);
  // White interstage + second stage + JAXA blue accent band
  k.color(H3_WHITE).cyl(rx, y0 + 34.0, rz, 2.6, 2.6, 10.5, seg);
  k.color(JAXA_BLUE).cyl(rx, y0 + 39.5, rz, 2.64, 2.64, 1.4, seg);

  // Twin White SRB-3 Solid Rocket Boosters flanking the core at x = ±4.1m
  for (const sx of [-4.1, 4.1]) {
    k.color(ENGINE_DK).cyl(rx + sx, y0 - 1.1, rz, 1.1, 0.75, 1.2, 10);
    k.color(H3_WHITE).cyl(rx + sx, y0, rz, 1.28, 1.28, 14.5, hi ? 14 : 8);
    k.color(TOWER_RED).cyl(rx + sx, y0 + 13.0, rz, 1.31, 1.31, 0.7, hi ? 14 : 8);
    k.color(H3_WHITE).lathe(rx + sx, y0 + 14.5, rz, [
      [1.28, 0],
      [0.75, 2.4],
      [0.0, 4.2],
    ], hi ? 12 : 8);
  }

  // White Ogive Payload Fairing with "H3 / JAXA" blue vertical stripe (reaches 63m total)
  k.color(H3_WHITE).lathe(rx, y0 + 44.5, rz, [
    [2.6, 0],
    [2.6, 9.5],
    [1.85, 14.2],
    [0.85, 17.0],
    [0.0, 18.5],
  ], seg);
  k.color(JAXA_BLUE).box(rx, y0 + 47.0, rz + 2.55, 1.2, 6.0, 0.25);
}

function buildYoshinobuVABAndTanks(k, vx, vz) {
  // Yoshinobu Vehicle Assembly Building (VAB) set back on the cliff terrace
  k.push().translate(vx, 0, vz);
  const W = 44, D = 40, H = 80;
  k.glow(false).color(VAB_CREAM).box(0, 1.5, 0, W, H, D);
  k.color(JAXA_BLUE).box(0, H - 7.5, 0, W + 0.8, 5.5, D + 0.8);
  k.color(PAD_DK).box(0, 1.5, D / 2 + 0.4, 18, 66, 0.6);
  k.color(TOWER_RED).box(0, H - 14.0, D / 2 + 0.5, 28, 3.2, 0.5);
  k.glow(true).color(BEACON_RED).sphere(-W / 2, H + 2.2, D / 2, 0.8, 6, 4).sphere(W / 2, H + 2.2, D / 2, 0.8, 6, 4);
  k.glow(false);
  k.pop();

  // Spherical LH2 / LOX storage tanks to the east
  for (const [tx, tz] of [[48, -24], [48, 8]]) {
    k.color(TANK_W).sphere(tx, 13.5, tz, 8.5, k.hi ? 14 : 8, 8);
    k.color(TOWER_STEEL).cyl(tx, 1.5, tz, 6.5, 6.5, 6.0, 8);
  }
}

export function build(k) {
  buildCoastalPadPlatform(k);
  buildServiceAndLightningTowers(k);
  buildH3Rocket(k, 0, 0);
  buildYoshinobuVABAndTanks(k, -78, -52);
}
