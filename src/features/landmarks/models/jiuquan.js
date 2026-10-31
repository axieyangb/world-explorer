// feature/famous-landmarks: Jiuquan Satellite Launch Center (东风航天城) Pad 921 & VAB, Gansu / Inner Mongolia — 1:1.
// Iconic 75m sky-blue steel space-frame Umbilical Service Tower with twin upper rotating clamshell gantry arms & yellow crane,
// Long March 2F (CZ-2F / Shenzhou, 62m) on pad (0, 0) with 4 liquid strap-on boosters, grid fins & Launch Escape Tower,
// plus the tall white-and-blue Vertical Assembly Building (垂直总装测试厂房) with red Chinese banner and Gobi oasis windbreaks!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.1;

const GOBI_APRON = 0xd2c7b4, CONCRETE = 0xc8c4bc, TRENCH_DK = 0x2b3038;
const JIUQUAN_BLUE = 0x3b86d6, JIUQUAN_BLUE_DK = 0x265fa3, GANTRY_WHITE = 0xf2f5f9;
const CRANE_YELLOW = 0xf2b718, CN_RED = 0xd9241b, CN_GOLD = 0xffd633;
const ROCKET_WHITE = 0xf6f8fb, CMS_BLUE = 0x1d5eb8, ENGINE_DK = 0x2c323b, FLAME_GLOW = 0xff9e3b;
const VAB_WHITE = 0xf0f2f5, VAB_GLASS = 0x395570, POPLAR_GREEN = 0x4e8a42, POPLAR_TRUNK = 0x6b533b;
const LIT = 0xfff2d0, BEACON_RED = 0xff2a1c;

export const colliders = [
  { x: 0, z: 0, r: 7, h: 62 },
  { x: 0, z: -11, hw: 8.5, hd: 7.5, h: 78 },
  { x: -95, z: -65, hw: 28, hd: 24, h: 96 },
  { x: 52, z: -18, hw: 18, hd: 12, h: 16 },
];

function buildPadAndFlameTrench(k) {
  // Gobi Desert concrete launch apron + rail track from VAB
  k.glow(false).color(GOBI_APRON).box(0, -2.5, 0, 196, 2.8, 168);
  k.color(CONCRETE).box(0, 0.3, 0, 74, 1.2, 74);
  // Dual wide-gauge umbilical transfer rails leading toward VAB
  k.color(ENGINE_DK).box(-45, 0.4, -32, 95, 0.35, 1.2).box(-45, 0.4, -22, 95, 0.35, 1.2);

  // Raised concrete launch table with deep bilateral flame deflector trench
  k.color(CONCRETE).box(0, 1.5, 0, 26, 4.5, 26);
  k.color(TRENCH_DK).box(0, 0.6, 0, 9.5, 5.5, 36);
}

function buildBlueUmbilicalTower(k, tx, tz) {
  const hi = k.hi;
  const yBase = 1.5, H = 75.0, hw = 6.8, hd = 5.6;

  // Base concrete pedestal
  k.glow(false).color(CONCRETE).box(tx, yBase, tz, 18, 4.0, 15);

  // 4 main sky-blue steel corner columns + central elevator shaft
  k.color(JIUQUAN_BLUE);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(tx + sx * hw, yBase + 4.0, tz + sz * hd, 1.35, H - 4.0, 1.35);
    }
  }
  k.color(JIUQUAN_BLUE_DK).box(tx, yBase + 4.0, tz - 1.0, 5.2, H - 5.0, 4.8);

  // 11 sky-blue work platforms + cross bracing
  const bays = hi ? 11 : 6;
  const bh = (H - 4.0) / bays;
  for (let b = 0; b <= bays; b++) {
    const y0 = yBase + 4.0 + b * bh, y1 = y0 + bh;
    k.color(JIUQUAN_BLUE).box(tx, y0, tz, hw * 2 + 1.8, 0.85, hd * 2 + 1.8);
    if (b < bays && hi) {
      k.color(JIUQUAN_BLUE_DK);
      for (const s of [-1, 1]) {
        k.strut([tx - hw, y0, tz + s * hd], [tx + hw, y1, tz + s * hd], 0.42);
        k.strut([tx + hw, y0, tz + s * hd], [tx - hw, y1, tz + s * hd], 0.42);
        k.strut([tx + s * hw, y0, tz - hd], [tx + s * hw, y1, tz + hd], 0.42);
      }
    }
  }

  // Twin upper rotating clamshell service gantry arms (open slightly around rocket at z=0)
  for (const sx of [-1, 1]) {
    // Lower & upper enclosed blue/white clamshell work shells
    k.color(JIUQUAN_BLUE).box(tx + sx * 6.2, 24.0, tz + hd + 4.2, 4.2, 18.0, 7.5);
    k.color(GANTRY_WHITE).box(tx + sx * 6.2, 44.0, tz + hd + 4.5, 4.4, 21.0, 8.2);
    k.color(JIUQUAN_BLUE_DK).strut([tx + sx * hw, 23.0, tz + hd], [tx + sx * 5.2, 23.0, -1.5], 0.9);
    k.strut([tx + sx * hw, 43.0, tz + hd], [tx + sx * 5.2, 43.0, -1.5], 0.9);
  }

  // Umbilical swing bridges connecting to Long March 2F core
  for (const yArm of [16.0, 32.0, 48.0]) {
    k.color(JIUQUAN_BLUE).strut([tx, yArm, tz + hd], [0, yArm, -2.0], 1.1);
  }

  // Red banner plaque near top of tower + yellow hammerhead crane boom on roof
  k.color(CN_RED).box(tx, H - 3.5, tz + hd + 1.0, 12.5, 2.6, 0.5);
  k.glow(true).color(CN_GOLD).box(tx, H - 3.0, tz + hd + 1.3, 10.2, 1.4, 0.35);
  k.glow(false);

  // Yellow top crane boom
  k.color(CRANE_YELLOW)
    .cyl(tx, H + 1.5, tz, 1.4, 1.2, 4.5, 8)
    .strut([tx, H + 5.2, tz - 4.0], [tx, H + 6.8, tz + 14.5], 1.1)
    .strut([tx, H + 8.5, tz], [tx, H + 6.5, tz + 12.0], 0.55);

  k.glow(true).color(LIT);
  for (let y = 18; y <= 68; y += 12) {
    k.box(tx + hw + 0.6, y, tz, 0.4, 1.5, 6.0).box(tx - hw - 0.6, y, tz, 0.4, 1.5, 6.0);
  }
  k.color(BEACON_RED).sphere(tx, H + 9.2, tz, 0.75, 6, 4);
  k.glow(false);
}

function buildLongMarch2F(k, rx, rz) {
  const hi = k.hi;
  const seg = hi ? 20 : 12;
  const y0 = 6.0; // atop launch table at (0, 0)

  // Engine exhaust glow + 4 core engines
  k.glow(true).color(FLAME_GLOW).cyl(rx, y0 - 1.2, rz, 2.8, 2.2, 1.0, 12);
  k.glow(false).color(ENGINE_DK).cyl(rx, y0 - 0.8, rz, 1.65, 1.4, 1.0, seg);

  // Crisp white cylindrical Core Stage (r = 1.68m, h = 38m)
  k.color(ROCKET_WHITE).cyl(rx, y0, rz, 1.68, 1.68, 38.0, seg);

  // Blue "中国航天" / CMS circumferential ring markings & Red Five-Star Flag accent
  k.color(CMS_BLUE)
    .cyl(rx, y0 + 14.0, rz, 1.72, 1.72, 1.1, seg)
    .cyl(rx, y0 + 27.5, rz, 1.72, 1.72, 1.2, seg)
    .box(rx, y0 + 18.0, rz + 1.66, 1.1, 7.5, 0.25);
  k.color(CN_RED).box(rx, y0 + 31.2, rz + 1.66, 1.6, 1.1, 0.25);

  // 4 strapped-on liquid boosters (at ±2.8m along X/Z axes) with sloped nose cones
  const bPos = [
    [-2.75, 0],
    [2.75, 0],
    [0, -2.75],
    [0, 2.75],
  ];
  for (const [bx, bz] of bPos) {
    k.color(ENGINE_DK).cyl(rx + bx, y0 - 0.8, rz + bz, 0.95, 0.65, 0.9, 10);
    k.color(ROCKET_WHITE).cyl(rx + bx, y0, rz + bz, 1.12, 1.12, 15.5, hi ? 14 : 8);
    k.color(CMS_BLUE).cyl(rx + bx, y0 + 13.5, rz + bz, 1.15, 1.15, 0.7, hi ? 14 : 8);
    // Sloped conical booster nose cone
    k.color(ROCKET_WHITE).lathe(rx + bx, y0 + 15.5, rz + bz, [
      [1.12, 0],
      [0.65, 2.6],
      [0.0, 4.8],
    ], hi ? 12 : 8);
  }

  // Shenzhou payload fairing (slightly wider diameter r = 1.9m) + 4 lattice grid fins
  k.color(ROCKET_WHITE).lathe(rx, y0 + 38.0, rz, [
    [1.68, 0],
    [1.92, 1.5],
    [1.92, 10.5],
    [1.1, 13.8],
    [0.38, 15.2],
  ], seg);

  // 4 White/Grey Grid Fins mounted on the fairing
  k.color(ENGINE_DK);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.push().translate(rx + Math.cos(a) * 2.25, y0 + 42.5, rz + Math.sin(a) * 2.25).rotateY(-a);
    k.box(0, 0, 0, 1.8, 2.2, 0.22);
    k.pop();
  }

  // Needle-tipped Launch Escape System (LES) tower at top (reaches 62m total height)
  k.color(ROCKET_WHITE).lathe(rx, y0 + 53.2, rz, [
    [0.42, 0],
    [0.42, 4.5],
    [0.18, 6.2],
    [0.0, 8.8],
  ], hi ? 16 : 10);
  if (hi) {
    // 4 Angled escape-motor nozzle cluster & booster attachment struts
    k.color(ENGINE_DK).cyl(rx, y0 + 55.2, rz, 0.58, 0.44, 0.9, 12);
    for (const [bx, bz] of bPos) {
      k.strut([rx + bx * 0.85, y0 + 2.8, rz + bz * 0.85], [rx + bx * 0.55, y0 + 3.4, rz + bz * 0.55], 0.28);
      k.strut([rx + bx * 0.85, y0 + 14.5, rz + bz * 0.85], [rx + bx * 0.55, y0 + 15.2, rz + bz * 0.55], 0.28);
    }
  }
}

function buildJiuquanVABAndTrees(k, vx, vz) {
  // Tall White & Blue Vertical Assembly Building (垂直总装测试厂房)
  k.push().translate(vx, 0, vz);
  const W = 52, D = 44, H = 94;
  k.glow(false).color(VAB_WHITE).box(0, 0.3, 0, W, H, D);

  // Sky-blue architectural side bands & horizontal crown trim
  k.color(JIUQUAN_BLUE)
    .box(-W / 2 + 6, 0.3, D / 2 + 0.3, 8, H, 0.6)
    .box(W / 2 - 6, 0.3, D / 2 + 0.3, 8, H, 0.6)
    .box(0, H - 6, 0, W + 0.8, 6.2, D + 0.8);

  // Tall vertical assembly rolling door facing pad
  k.color(VAB_GLASS).box(0, 0.3, D / 2 + 0.4, 18, 76, 0.6);

  // Iconic Red Chinese Banner Header across top facade
  k.color(CN_RED).box(0, H - 14, D / 2 + 0.6, 36, 5.5, 0.6);
  k.glow(true).color(CN_GOLD).box(0, H - 12.5, D / 2 + 0.95, 30, 2.4, 0.4);
  k.color(BEACON_RED).sphere(-W / 2, H + 1.8, D / 2, 0.8, 6, 4).sphere(W / 2, H + 1.8, D / 2, 0.8, 6, 4);
  k.glow(false);
  k.pop();

  // Gobi Oasis Poplar Windbreak Trees along perimeter road
  for (let i = 0; i < 8; i++) {
    const px = -75 + i * 18, pz = 58;
    k.color(POPLAR_TRUNK).cyl(px, 0.3, pz, 0.35, 0.25, 3.2, 6);
    k.color(POPLAR_GREEN).cyl(px, 2.8, pz, 1.8, 0.3, 9.5, 7);
  }
}

export function build(k) {
  buildPadAndFlameTrench(k);
  buildBlueUmbilicalTower(k, 0, -11);
  buildLongMarch2F(k, 0, 0);
  buildJiuquanVABAndTrees(k, -95, -65);

  // Propellant support bunker to the east
  k.glow(false).color(VAB_WHITE).box(52, 0.3, -18, 34, 12, 22);
  k.color(JIUQUAN_BLUE).box(52, 12.3, -18, 35, 1.8, 23);
}
