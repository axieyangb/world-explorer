// feature/famous-landmarks: Stanford Main Quad, Memorial Church & Hoover Tower, Stanford CA — 1:1.
// Iconic Richardsonian Romanesque buff-sandstone arcaded Main Quad with red mission-tile roofs,
// Memorial Church with its golden mosaic gable facade, and the 87m Hoover Tower with red-tiled dome cupola.

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.7;

const SANDSTONE = 0xd9bf96, SAND_LT = 0xe8d3b0, SAND_SH = 0xb89c72;
const TILE_RED = 0xb8462c, TILE_DK = 0x8f331e;
const MOSAIC_GOLD = 0xe8bc48, MOSAIC_BLUE = 0x2f5f9e, MOSAIC_RED = 0xc93b2b;
const GLASS = 0x323c46, PAVE = 0xd6cfc2, LAWN = 0x4f8a45, PALM = 0x3b7838, LIT = 0xffe8b6;

export const colliders = [
  { x: 0, z: -28, hw: 26, hd: 32, h: 36 },
  { x: -64, z: 4, hw: 20, hd: 58, h: 16 },
  { x: 64, z: 4, hw: 20, hd: 58, h: 16 },
  { x: 0, z: 54, hw: 78, hd: 16, h: 16 },
  { x: 96, z: -32, hw: 13, hd: 13, h: 87 },
];

/** Mission-style hipped red terracotta roof over a rectangular hall. */
function missionHall(k, x, y0, z, w, h, d, roofH = 4.2) {
  k.glow(false).color(SANDSTONE).box(x, y0, z, w, h, d);
  k.color(SAND_LT).box(x, y0 + h - 0.6, z, w + 0.8, 0.7, d + 0.8);
  const rw = w + 1.8, rd = d + 1.8;
  const topW = w >= d ? Math.max(2, rw - rd * 0.85) : 1.2;
  const topD = d > w ? Math.max(2, rd - rw * 0.85) : 1.2;
  k.color(TILE_RED).taper(x, y0 + h, z, rw, rd, topW, topD, roofH);
}

/** Stanford Memorial Church at the heart of the Quad (z = -28) with colorful mosaic pediment. */
function memorialChurch(k) {
  const hi = k.hi;
  const cz = -28;
  // Cruciform nave & transepts
  missionHall(k, 0, 0.4, cz, 26, 18.5, 56, 6.2);
  missionHall(k, 0, 0.4, cz - 4, 50, 17.5, 24, 5.8);

  // Crossing clerestory drum & red-tiled pyramidal cupola (34m)
  k.glow(false).color(SAND_LT).box(0, 18.9, cz - 4, 20, 8.5, 20);
  k.glow(true).color(LIT).box(0, 21.0, cz - 4, 20.4, 3.8, 20.4);
  k.glow(false).color(TILE_RED).pyramid(0, 27.4, cz - 4, 22.5, 22.5, 8.2);
  k.color(MOSAIC_GOLD).cyl(0, 35.4, cz - 4, 0.4, 0.15, 2.6, 6);

  // Famous South Gable Facade (at z = cz + 28 = 0) with golden Venetian mosaic & rose window
  const fz = cz + 28.2;
  // Gable triangle wall
  k.color(SAND_LT).tri([-13.2, 18.5, fz], [13.2, 18.5, fz], [0, 25.0, fz]);
  // Colorful mosaic mural bands across the gable
  k.glow(true).color(MOSAIC_GOLD).tri([-11.2, 18.8, fz + 0.15], [11.2, 18.8, fz + 0.15], [0, 24.1, fz + 0.15]);
  if (hi) {
    k.color(MOSAIC_BLUE).box(0, 19.3, fz + 0.22, 14, 1.4, 0.15);
    k.color(MOSAIC_RED).box(-3.8, 19.4, fz + 0.26, 2.2, 2.4, 0.15).box(3.8, 19.4, fz + 0.26, 2.2, 2.4, 0.15);
    k.color(MOSAIC_GOLD).box(0, 21.2, fz + 0.26, 2.6, 2.4, 0.15);
  }
  // Central stained-glass rose window + triple Romanesque entry arches
  k.glow(true).color(LIT).cyl(0, 13.2, fz - 0.2, 3.6, 3.6, 0.6, hi ? 16 : 8);
  k.glow(false).color(SAND_SH);
  for (const ax of [-6.5, 0, 6.5]) {
    k.box(ax, 0.4, fz - 0.2, 3.8, 6.8, 0.8);
    k.glow(true).color(LIT).box(ax, 1.0, fz + 0.1, 2.6, 5.2, 0.3);
    k.glow(false).color(SAND_SH);
  }
}

/** 87m Hoover Tower (east of the Quad at x = 96, z = -32) with observation belvedere & red-tiled dome. */
function hooverTower(k) {
  const hi = k.hi;
  const tx = 96, tz = -32;
  k.push().translate(tx, 0, tz);

  // Monumental podium & arrival steps
  k.glow(false).color(SAND_SH).box(0, -2.5, 0, 32, 3.2, 32);
  k.color(SANDSTONE).box(0, 0.7, 0, 24, 5.8, 24);

  // Tall octagonal-cornered sandstone shaft (6.5m to 62m)
  k.color(SAND_LT).box(0, 6.5, 0, 16.8, 55.5, 16.8);
  if (hi) {
    // Corner buttress pilasters & vertical window slits
    k.color(SANDSTONE);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(sx * 7.6, 6.5, sz * 7.6, 2.8, 55.5, 2.8);
      }
    }
    k.glow(true).color(LIT);
    for (let y = 14; y <= 54; y += 10) k.box(0, y, 0, 17.1, 2.2, 5.2).box(0, y, 0, 5.2, 2.2, 17.1);
  }

  // Observation deck & carillon belfry arches (62m to 73m)
  k.glow(false).color(SANDSTONE).box(0, 62.0, 0, 18.2, 1.4, 18.2);
  k.color(SAND_LT).box(0, 63.4, 0, 15.2, 9.2, 15.2);
  // Glowing belfry arch openings on all 4 faces
  k.glow(true).color(LIT);
  k.box(0, 65.0, 0, 15.6, 5.8, 8.2).box(0, 65.0, 0, 8.2, 5.8, 15.6);

  // Octagonal drum & iconic red terracotta hemispherical dome + lantern (72.6m to 87m)
  k.glow(false).color(SANDSTONE).cyl(0, 72.6, 0, 8.4, 8.0, 3.6, hi ? 16 : 8);
  k.color(TILE_RED).sphere(0, 75.8, 0, 7.8, hi ? 16 : 10, hi ? 8 : 5, 1.08, 0.55);
  // Cupola lantern & finial
  k.glow(true).color(SAND_LT).cyl(0, 83.2, 0, 2.2, 2.0, 2.6, 8);
  k.glow(false).color(TILE_DK).cyl(0, 85.8, 0, 2.3, 0.1, 1.5, 8);

  k.pop();
}

export function build(k) {
  const hi = k.hi;

  // 1. Main Quad Sandstone Courtyard & Oval Palm Drive approach
  k.glow(false).color(PAVE).box(0, -2.5, 12, 245, 2.9, 175);
  // 8 circular planter islands inside the Inner Quad courtyard
  for (const px of [-28, 28]) {
    for (const pz of [-2, 26]) {
      k.color(SAND_SH).cyl(px, 0.4, pz, 9.5, 9.8, 0.6, 12);
      k.color(LAWN).cyl(px, 0.9, pz, 8.6, 8.6, 0.2, 12);
      k.color(PALM).sphere(px, 5.2, pz, 3.8, 7, 5, 0.9);
    }
  }

  // 2. Memorial Church anchoring the North side of the Quad
  memorialChurch(k);

  // 3. West, East & South Arcaded Sandstone Quad Wings + Memorial Court arches
  missionHall(k, -64, 0.4, 8, 22, 12.5, 92, 3.8);
  missionHall(k, 64, 0.4, 8, 22, 12.5, 92, 3.8);
  missionHall(k, -42, 0.4, 52, 54, 12.5, 20, 3.8);
  missionHall(k, 42, 0.4, 52, 54, 12.5, 20, 3.8);
  // Central South Quad Entry Arch Pavilion (facing Palm Drive)
  missionHall(k, 0, 0.4, 52, 24, 16.5, 24, 4.6);
  k.glow(true).color(LIT).box(0, 1.2, 52, 8.5, 10.5, 24.6);
  // Continuous glowing arcade galleries along the courtyard perimeter
  k.box(-52.5, 1.2, 8, 1.2, 5.5, 84);
  k.box(52.5, 1.2, 8, 1.2, 5.5, 84);
  k.box(0, 1.2, 41.5, 102, 5.5, 1.2);
  k.glow(false);

  if (hi) {
    // Romanesque stone colonnade piers along the Inner & Outer Quad arcades
    k.color(SAND_LT);
    for (let z = -30; z <= 44; z += 7.4) {
      k.box(-52, 0.4, z, 1.8, 8.5, 1.8);
      k.box(52, 0.4, z, 1.8, 8.5, 1.8);
    }
    for (let x = -48; x <= 48; x += 8.0) {
      if (Math.abs(x) < 8) continue;
      k.box(x, 0.4, 63, 1.8, 8.5, 1.8);
    }
  }

  // 4. 87m Hoover Tower rising to the northeast
  hooverTower(k);
}
