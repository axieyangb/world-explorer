// feature/famous-landmarks: Microsoft Redmond Campus & Commons, Redmond WA — 1:1.
// Modern X-wing / courtyard glass campus buildings surrounded by lush Pacific Northwest Douglas firs,
// central pedestrian plaza with sports courts, Treehouse meeting pods, and the iconic 4-square Microsoft monument
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
    // Rooftop solar array & mechanical louvers
    k.glow(false).color(ROOF_DK).box(0, 18.1, 0, 42, 0.5, 16);
    if (hi) {
      k.color(SOLAR);
      for (let sx = -16; sx <= 16; sx += 8) {
        k.box(sx, 18.6, 0, 6.8, 0.35, 12.5);
      }
      // Vertical curtain-wall mullions along each X-wing arm
      k.color(STEEL);
      for (let mx = -18; mx <= 18; mx += 6) {
        k.strut([mx, 0.3, -9.2], [mx, 17.5, -9.2], 0.25);
        k.strut([mx, 0.3, 9.2], [mx, 17.5, 9.2], 0.25);
      }
    }
    k.pop();
  }

  // Skylight lantern on the central hub
  k.glow(true).color(LIT).box(0, 19.8, 0, 16, 1.8, 12);
  k.glow(false);
  if (hi) k.color(STEEL).box(0, 21.6, 0, 17.2, 0.4, 13.2);
  k.pop();
}

/** Pacific Northwest Douglas Fir conifer tree. */
function pnwPine(k, x, z, h = 18, r = 5.2) {
  const seg = k.hi ? 10 : 5;
  k.glow(false).color(0x5a3e28).cyl(x, 0, z, 0.65, 0.35, h * 0.35, 6);
  k.color(PINE_DK).cyl(x, h * 0.22, z, r, r * 0.22, h * 0.38, seg);
  k.color(PINE_LT).cyl(x, h * 0.45, z, r * 0.82, r * 0.16, h * 0.34, seg);
  if (k.hi) k.color(PINE_DK).cone(x, h * 0.68, z, r * 0.58, h * 0.34, seg);
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
  if (hi) {
    // Exposed Mass-Timber glulam roof beams & timber columns on The Commons Pavilion
    k.glow(false).color(WOOD);
    for (let x = -24; x <= 24; x += 6) {
      k.box(x, 0.4, -36.5, 0.55, 12.5, 0.65).box(x, 0.4, -7.5, 0.55, 12.5, 0.65);
      k.box(x, 12.5, -22, 0.5, 0.6, 33.2);
    }
  }
  // Elevated glass skybridge connecting East & West campuses
  k.glow(false).color(STEEL).box(0, 8.5, 16, 110, 1.0, 6.5).box(0, 13.0, 16, 110, 0.8, 6.8);
  k.glow(true).color(GLASS_LT).box(0, 9.5, 16, 108, 3.5, 5.8);
  k.glow(false);
  if (hi) {
    // Skybridge structural steel V-piers & diagonal truss chords
    k.color(STEEL);
    for (const px of [-36, 0, 36]) {
      k.strut([px, 0.4, 16], [px - 3.2, 8.5, 16], 0.55);
      k.strut([px, 0.4, 16], [px + 3.2, 8.5, 16], 0.55);
    }
    for (let x = -48; x < 48; x += 12) {
      k.strut([x, 9.2, 19.1], [x + 6, 12.8, 19.1], 0.25);
      k.strut([x + 6, 12.8, 19.1], [x + 12, 9.2, 19.1], 0.25);
      k.strut([x, 9.2, 12.9], [x + 6, 12.8, 12.9], 0.25);
      k.strut([x + 6, 12.8, 12.9], [x + 12, 9.2, 12.9], 0.25);
    }
  }

  // 4. Sports courts in the Commons (soccer pitch with goals & penalty boxes + basketball court with hoops)
  k.color(COURT_GRN).box(-22, 0.56, 44, 26, 0.15, 38);
  k.color(STEEL).box(-22, 0.65, 44, 24, 0.12, 0.4); // mid-field line
  k.color(COURT_BLU).box(22, 0.56, 44, 20, 0.15, 32);
  if (hi) {
    k.color(STEEL);
    // Soccer pitch center circle, penalty boxes & goalposts
    k.torus(-22, 0.68, 44, 3.8, 0.12, 16, 4);
    for (const sz of [-1, 1]) {
      k.box(-22, 0.68, 44 + sz * 15.5, 11, 0.1, 5.5);
      k.box(-22, 0.7, 44 + sz * 18.5, 4.8, 2.2, 1.2); // soccer goal frame
    }
    // Basketball court 3-point arcs, center line & backboards
    k.box(22, 0.65, 44, 18.5, 0.1, 0.3);
    for (const sz of [-1, 1]) {
      const hz = 44 + sz * 14.8;
      k.cyl(22, 0.65, hz, 0.15, 0.15, 3.2, 6);
      k.box(22, 3.2, hz - sz * 0.6, 1.8, 1.2, 0.15);
      k.color(MS_RED).torus(22, 3.05, hz - sz * 0.9, 0.28, 0.05, 8, 4);
      k.color(STEEL);
    }
    // Famous Microsoft Cedar Treehouse Meeting Pods nestled among the Douglas firs (x = -38, z = -66)
    k.color(WOOD).cyl(-38, 4.8, -66, 5.4, 5.4, 0.45, 8).cyl(-38, 5.25, -66, 4.2, 4.4, 3.6, 8);
    k.cone(-38, 8.85, -66, 5.2, 2.4, 8);
    k.glow(true).color(LIT).cyl(-38, 5.8, -66, 4.25, 4.25, 1.8, 8).glow(false);
    // Spiral timber ramp leading up to the Treehouse pod
    k.color(WOOD).strut([-30, 0.5, -66], [-34.5, 4.8, -66], 1.1);
  }

  // 5. Iconic 4-Square Microsoft Monument in the south entry plaza (z = 80)
  k.push().translate(0, 0, 80);
  k.glow(false).color(ROOF_DK).box(0, 0.4, 0, 28, 1.6, 5.5);
  const sq = 4.6, gap = 0.6, yBase = 2.4;
  k.glow(true);
  k.color(MS_BLUE).box(-sq * 0.5 - gap * 0.5, yBase, 0, sq, sq, 1.8);
  k.color(MS_YELLOW).box(sq * 0.5 + gap * 0.5, yBase, 0, sq, sq, 1.8);
  k.color(MS_RED).box(-sq * 0.5 - gap * 0.5, yBase + sq + gap, 0, sq, sq, 1.8);
  k.color(MS_GREEN).box(sq * 0.5 + gap * 0.5, yBase + sq + gap, 0, sq, sq, 1.8);
  k.glow(false).color(STEEL).box(0, 2.0, -1.1, 11.4, 11.0, 0.6);
  if (hi) {
    // 3D "Microsoft" white lettering along the dark granite monument plinth
    k.glow(true).color(0xffffff);
    for (let i = 0; i < 9; i++) {
      k.box(-6.4 + i * 1.6, 0.85, 2.8, 1.1, 0.9, 0.18);
    }
    k.glow(false);
  }
  k.pop();

  // 6. Lush Pacific Northwest Douglas Fir groves around the campus perimeter & courtyard
  const pines = [
    [-122, -82, 22], [-126, -10, 20], [-122, 75, 23],
    [122, -82, 21], [126, -10, 24], [122, 75, 20],
    [-38, -82, 18], [38, -82, 19], [-36, 82, 17], [36, 82, 18],
    [-18, -56, 16], [18, -56, 17], [-38, -66, 21],
  ];
  for (const [px, pz, ph] of pines) pnwPine(k, px, pz, ph, ph * 0.28);
}
