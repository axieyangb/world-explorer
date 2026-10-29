// feature/famous-landmarks: Microsoft Redmond Campus & Commons, Redmond WA — 1:1.
// Modern X-wing / courtyard glass campus buildings surrounded by lush Pacific Northwest Douglas firs,
// central pedestrian plaza with sports courts, and the iconic 4-square Microsoft monument
// (Red #F25022, Green #7FBA00, Blue #00A4EF, Yellow #FFB900).

export const lodDist = 2200;
export const fineDist = 600;
export const glowStrength = 1.9;

const GLASS = 0x45627c, GLASS_LT = 0x7ba1c2, STEEL = 0xdce2e8, CONCRETE = 0xd8d4cb;
const ROOF_DK = 0x28323c, SOLAR = 0x1e2836, WOOD = 0xb58654;
const LAWN = 0x4b8742, PINE_DK = 0x25582c, PINE_LT = 0x35723c, COURT_GRN = 0x2e7d52, COURT_BLU = 0x2b659e;
const MS_RED = 0xf25022, MS_GREEN = 0x7fba00, MS_BLUE = 0x00a4ef, MS_YELLOW = 0xffb900;
const LIT = 0xfff3d4;

export const colliders = [
  { x: -72, z: -48, hw: 44, hd: 36, h: 20 },
  { x: 72, z: -48, hw: 44, hd: 36, h: 20 },
  { x: -72, z: 52, hw: 44, hd: 36, h: 20 },
  { x: 72, z: 52, hw: 44, hd: 36, h: 20 },
  { x: 0, z: -4, hw: 34, hd: 22, h: 16 },
];

/** Modern 4-story Microsoft X-wing / H-courtyard glass building with timber overhangs & rooftop solar. */
function xWingBuilding(k, cx, cz, rot = 0) {
  const hi = k.hi;
  k.push().translate(cx, 0, cz).rotateY(rot);

  // Concrete podium & central connectors
  k.glow(false).color(CONCRETE).box(0, -2.5, 0, 86, 2.8, 68);
  // Central atrium core
  k.color(GLASS_LT).box(0, 0.3, 0, 28, 18.5, 24);
  k.color(STEEL).box(0, 18.8, 0, 30, 1.0, 26);

  // 4 angled X-wing arms radiating from the central atrium
  const arms = [
    [-24, -16, 0.38],
    [24, -16, -0.38],
    [-24, 16, -0.38],
    [24, 16, 0.38],
  ];
  for (const [ax, az, aRot] of arms) {
    k.push().translate(ax, 0, az).rotateY(aRot);
    k.glow(false).color(GLASS).box(0, 0.3, 0, 44, 17.2, 18);
    // Cantilevered warm wood & steel floor sunshades
    for (const flY of [4.6, 8.9, 13.2, 17.5]) {
      k.glow(false).color(flY > 16 ? STEEL : WOOD).box(0, flY, 0, 45.6, 0.65, 19.6);
    }
    // Night-lit continuous office bands
    k.glow(true).color(LIT);
    for (const flY of [1.5, 5.6, 9.9, 14.2]) {
      k.box(0, flY, 0, 44.3, 2.4, 18.3);
    }
    // Rooftop solar array
    k.glow(false).color(ROOF_DK).box(0, 18.1, 0, 42, 0.5, 16);
    if (hi) k.color(SOLAR).box(0, 18.6, 0, 36, 0.3, 12);
    k.pop();
  }

  // Skylight lantern on the central hub
  k.glow(true).color(LIT).box(0, 19.8, 0, 16, 1.8, 12);
  k.glow(false);
  k.pop();
}

/** Pacific Northwest Douglas Fir conifer tree. */
function pnwPine(k, x, z, h = 18, r = 5.2) {
  const seg = k.hi ? 8 : 5;
  k.glow(false).color(0x5a3e28).cyl(x, 0, z, 0.65, 0.35, h * 0.35, 5);
  k.color(PINE_DK).cyl(x, h * 0.22, z, r, r * 0.18, h * 0.48, seg);
  k.color(PINE_LT).cyl(x, h * 0.48, z, r * 0.78, 0.1, h * 0.52, seg);
}

export function build(k) {
  const hi = k.hi;

  // 1. Campus park lawn & pedestrian Commons spine
  k.glow(false).color(LAWN).box(0, -2.5, 0, 270, 2.8, 210);
  k.color(CONCRETE).box(0, 0.3, 0, 96, 0.25, 195);
  k.color(CONCRETE).box(0, 0.3, 0, 240, 0.25, 42);

  // 2. Four signature X-Wing / Courtyard Campus Buildings around the Commons
  xWingBuilding(k, -72, -48, 0.08);
  xWingBuilding(k, 72, -48, -0.08);
  xWingBuilding(k, -72, 52, -0.08);
  xWingBuilding(k, 72, 52, 0.08);

  // 3. The Commons central glass & timber pavilion + elevated pedestrian skybridge
  k.glow(false).color(GLASS_LT).box(0, 0.4, -22, 54, 12.5, 28);
  k.color(WOOD).box(0, 12.9, -22, 58, 1.1, 32);
  k.glow(true).color(LIT).box(0, 2.0, -22, 54.4, 3.8, 28.4).box(0, 7.6, -22, 54.4, 3.6, 28.4);
  // Elevated glass skybridge connecting East & West campuses
  k.glow(false).color(STEEL).box(0, 8.5, 16, 110, 1.0, 6.5).box(0, 13.0, 16, 110, 0.8, 6.8);
  k.glow(true).color(GLASS_LT).box(0, 9.5, 16, 108, 3.5, 5.8);
  k.glow(false);

  // 4. Sports courts in the Commons (soccer pitch & basketball court)
  k.color(COURT_GRN).box(-22, 0.56, 44, 26, 0.15, 38);
  k.color(STEEL).box(-22, 0.65, 44, 24, 0.12, 0.4); // mid-field line
  k.color(COURT_BLU).box(22, 0.56, 44, 20, 0.15, 32);

  // 5. Iconic 4-Square Microsoft Monument in the south entry plaza (z = 82)
  k.push().translate(0, 0, 80);
  k.glow(false).color(ROOF_DK).box(0, 0.4, 0, 28, 1.6, 5.5);
  // 4 glowing Microsoft window squares: Red (top-left), Green (top-right), Blue (bottom-left), Yellow (bottom-right)
  const sq = 4.6, gap = 0.6, yBase = 2.4;
  k.glow(true);
  k.color(MS_BLUE).box(-sq * 0.5 - gap * 0.5, yBase, 0, sq, sq, 1.8);
  k.color(MS_YELLOW).box(sq * 0.5 + gap * 0.5, yBase, 0, sq, sq, 1.8);
  k.color(MS_RED).box(-sq * 0.5 - gap * 0.5, yBase + sq + gap, 0, sq, sq, 1.8);
  k.color(MS_GREEN).box(sq * 0.5 + gap * 0.5, yBase + sq + gap, 0, sq, sq, 1.8);
  // Crisp white monument backing frame
  k.glow(false).color(STEEL).box(0, 2.0, -1.1, 11.4, 11.0, 0.6);
  k.pop();

  // 6. Lush Pacific Northwest Douglas Fir groves around the campus perimeter & courtyard
  const pines = [
    [-122, -82, 22], [-126, -10, 20], [-122, 75, 23],
    [122, -82, 21], [126, -10, 24], [122, 75, 20],
    [-38, -82, 18], [38, -82, 19], [-36, 82, 17], [36, 82, 18],
    [-18, -56, 16], [18, -56, 17],
  ];
  for (const [px, pz, ph] of pines) pnwPine(k, px, pz, ph, ph * 0.28);
}
