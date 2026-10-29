// feature/famous-landmarks: Amazon Spheres & Doppler Tower, Seattle WA — 1:1 (Doppler 160m, Spheres R=14m, 20m, 16m).
// Three intersecting white-steel & glass geodesic pentakis-dodecahedron biospheres with visible lush green
// indoor cloud-forest trees and Living Wall inside, alongside the 37-story bronze-glass Amazon Doppler tower.

export const lodDist = 2000;
export const fineDist = 550;
export const glowStrength = 1.8;

const STEEL_W = 0xf2f5f8, STEEL_SH = 0xd2d8e0, GLASS_SPH = 0x8cb8c8;
const BRONZE_GL = 0x5c5346, BRONZE_LT = 0x8a7b66, BRONZE_MULL = 0x3b352c;
const TREE_DK = 0x2d6a32, TREE_MD = 0x3f8a42, TREE_LT = 0x5ca856, TRUNK = 0x6b4c35;
const PLAZA = 0xd8d4cc, LAWN = 0x4d8844, LIT_WARM = 0xffe8b8, LIT_OFFICE = 0xffeed2;
const AMZ_ORANGE = 0xff9900;

export const colliders = [
  { x: 0, z: 12, r: 21, h: 29 },
  { x: -24, z: 18, r: 15, h: 22 },
  { x: 25, z: 6, r: 17, h: 25 },
  { x: -18, z: -38, hw: 28, hd: 22, h: 160 },
];

/** Geodesic biosphere with indoor cloud forest and white Catalan-solid steel hex/pentagon lattice. */
function biosphere(k, cx, cz, R, hasLivingWall = false) {
  const hi = k.hi, fine = k.fine;
  const cy = R * 0.42; // sphere centre above ground so ~71% rises above plaza
  const seg = hi ? 20 : 10, rings = hi ? 10 : 6;

  // Concrete & dark steel ring foundation
  k.glow(false).color(BRONZE_MULL).cyl(cx, -2.0, cz, R * 0.92, R * 0.95, 2.5, seg);

  // Indoor lush cloud forest (visible inside & through the geodesic framing)
  k.color(LAWN).cyl(cx, 0.3, cz, R * 0.85, R * 0.85, 0.5, seg);
  if (hasLivingWall) {
    // 4-story vertical living fern wall rising through the center of the main sphere
    k.color(TREE_DK).box(cx, 0.8, cz - 2, R * 0.72, R * 1.15, 2.4);
    k.color(TREE_LT).box(cx, 2.0, cz - 2, R * 0.65, R * 0.95, 2.7);
  }
  // Indoor canopy trees at varying heights
  const trees = [
    [0, 3, R * 0.34, R * 0.85],
    [-R * 0.35, -R * 0.2, R * 0.28, R * 0.65],
    [R * 0.35, R * 0.15, R * 0.26, R * 0.70],
    [-R * 0.18, R * 0.38, R * 0.24, R * 0.58],
    [R * 0.22, -R * 0.32, R * 0.25, R * 0.62],
  ];
  for (let i = 0; i < trees.length; i++) {
    const [tx, tz, tr, th] = trees[i];
    k.color(TRUNK).cyl(cx + tx, 0.8, cz + tz, 0.45, 0.28, th * 0.55, 6);
    k.color(i % 2 === 0 ? TREE_MD : TREE_LT).sphere(cx + tx, 0.8 + th * 0.62, cz + tz, tr, hi ? 10 : 6, hi ? 6 : 4, 0.85);
  }

  // Warm interior botanical glow core at night
  k.glow(true).color(LIT_WARM).sphere(cx, cy * 0.85, cz, R * 0.72, hi ? 12 : 8, hi ? 6 : 4, 0.9, 0.78);

  // Outer faceted glass dome shell
  k.glow(false).color(GLASS_SPH).sphere(cx, cy, cz, R, seg, rings, 1.0, 0.76);

  // White-painted pentakis-dodecahedron geodesic steel lattice ribs over the sphere surface
  if (hi) {
    k.color(STEEL_W);
    const latSteps = fine ? 7 : 5;
    const lonSteps = fine ? 16 : 12;
    const aMin = -0.22 * Math.PI, aMax = 0.48 * Math.PI;
    const ptOnSphere = (latA, lonA) => {
      const rCos = Math.cos(latA) * (R + 0.22);
      return [cx + Math.cos(lonA) * rCos, cy + Math.sin(latA) * (R + 0.22), cz + Math.sin(lonA) * rCos];
    };
    for (let i = 0; i < latSteps; i++) {
      const a0 = aMin + (i / latSteps) * (aMax - aMin);
      const a1 = aMin + ((i + 1) / latSteps) * (aMax - aMin);
      for (let j = 0; j < lonSteps; j++) {
        const b0 = (j / lonSteps) * Math.PI * 2 + (i % 2) * (Math.PI / lonSteps);
        const b1 = ((j + 1) / lonSteps) * Math.PI * 2 + (i % 2) * (Math.PI / lonSteps);
        const bm = (b0 + b1) * 0.5;
        const p00 = ptOnSphere(a0, b0), p01 = ptOnSphere(a0, b1);
        const p10 = ptOnSphere(a1, bm);
        if (p00[1] > 0.2 && p01[1] > 0.2) k.strut(p00, p01, 0.34);
        if (p00[1] > 0.2 && p10[1] > 0.2) k.strut(p00, p10, 0.36);
        if (p01[1] > 0.2 && p10[1] > 0.2) k.strut(p01, p10, 0.36);
      }
    }
    // Crown apex ring
    const aTop = aMax;
    for (let j = 0; j < lonSteps; j++) {
      const b0 = (j / lonSteps) * Math.PI * 2, b1 = ((j + 1) / lonSteps) * Math.PI * 2;
      k.strut(ptOnSphere(aTop, b0), ptOnSphere(aTop, b1), 0.38);
      k.strut(ptOnSphere(aTop, b0), [cx, cy + R + 0.24, cz], 0.32);
    }
  }
}

/** 37-story Amazon Doppler Tower (160m tall faceted bronze-glass skyscraper + podium). */
function dopplerTower(k) {
  const hi = k.hi;
  const tx = -18, tz = -38;
  // 5-story angular retail/meeting podium
  k.glow(false).color(BRONZE_MULL).box(tx, -2.5, tz, 58, 2.8, 46);
  k.color(BRONZE_GL).box(tx, 0.3, tz, 54, 20.0, 42);
  k.color(BRONZE_LT).box(tx, 20.3, tz, 55.2, 1.2, 43.2);

  // Main 37-story bronze glass tower with subtlechamfered upper setback
  k.color(BRONZE_GL).taper(tx, 21.5, tz, 46, 36, 44, 34, 88, 0, 0);
  k.color(BRONZE_LT).taper(tx, 109.5, tz, 43, 33, 39, 30, 46.5, 1.2, 0.8);
  // Rooftop mechanical screen & architectural crown
  k.color(BRONZE_MULL).box(tx + 1.2, 156.0, tz + 0.8, 34, 4.0, 25);

  // Night-glowing office floor bands + vertical bronze curtain-wall mullions
  k.glow(true).color(LIT_OFFICE);
  const flStep = hi ? 7.5 : 15;
  for (let y = 6; y < 152; y += flStep) {
    const w = y < 109 ? 46.3 : 41.5, d = y < 109 ? 36.3 : 32.0;
    const ox = y < 109 ? 0 : 1.0, oz = y < 109 ? 0 : 0.6;
    k.box(tx + ox, y, tz + oz, w, 2.2, d);
  }
  // Glowing Amazon smile orange beacon strip at the crown
  k.color(AMZ_ORANGE).box(tx + 1.2, 155.2, tz + 0.8, 39.6, 1.1, 30.6);
  k.glow(false);

  if (hi) {
    k.color(BRONZE_LT);
    for (let x = -20; x <= 20; x += 8) {
      k.strut([tx + x, 21.5, tz - 18.2], [tx + x, 109.5, tz - 17.2], 0.42);
      k.strut([tx + x, 21.5, tz + 18.2], [tx + x, 109.5, tz + 17.2], 0.42);
    }
  }
}

export function build(k) {
  // 1. Landscaped urban plaza & dog park lawn between Doppler and The Spheres
  k.glow(false).color(PLAZA).box(0, -2.5, -8, 124, 2.8, 132);
  k.color(LAWN).box(24, 0.3, -24, 36, 0.3, 32);

  // 2. Three intersecting Amazon Spheres along Lenora St (West R=14m, Center R=20m, East R=16m)
  biosphere(k, -24, 18, 14, false);
  biosphere(k, 0, 12, 20, true);
  biosphere(k, 25, 6, 16, false);

  // Glazed collar tunnels connecting the three spheres
  k.glow(false).color(STEEL_SH);
  k.pipe([-14, 7, 15], [-9, 7, 13.5], 5.5, 10);
  k.pipe([11, 7.5, 9.5], [16, 7.5, 8], 6.0, 10);

  // 3. Amazon Doppler 37-story headquarters tower immediately north
  dopplerTower(k);

  // 4. Amazon Smile / Spheres entry plaza monument
  k.glow(false).color(BRONZE_MULL).box(20, 0.3, 34, 12, 1.2, 2.2);
  k.glow(true).color(AMZ_ORANGE).box(20, 1.5, 34, 9.5, 2.4, 1.4);
  k.glow(false);
}
