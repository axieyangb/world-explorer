// feature/famous-landmarks: Stanford Main Quad, Memorial Church & Hoover Tower, Stanford CA — 1:1.
// Iconic Richardsonian Romanesque buff-sandstone arcaded Main Quad with red mission-tile roofs,
// Memorial Church with its golden mosaic gable facade, and the 87m Hoover Tower with red-tiled dome cupola.

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.7;

const SANDSTONE = 0xd9bf96, SAND_LT = 0xe8d3b0, SAND_SH = 0xb89c72;
const TILE_RED = 0xb8462c, TILE_DK = 0x8f331e;
const MOSAIC_GOLD = 0xe8bc48, MOSAIC_BLUE = 0x2f5f9e, MOSAIC_RED = 0xc93b2b;
const GLASS = 0x323c46, PAVE = 0xd6cfc2, LAWN = 0x4f8a45, PALM = 0x3b7838, LIT = 0xffe8b6, BRONZE = 0x3e483c;

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

  // Crossing clerestory drum & red-tiled pyramidal cupola (36m)
  k.glow(false).color(SAND_LT).box(0, 18.9, cz - 4, 20, 8.5, 20);
  k.glow(true).color(LIT).box(0, 21.0, cz - 4, 20.4, 3.8, 20.4);
  if (hi) {
    // Clerestory arched window colonnettes around the crossing drum
    k.glow(false).color(SANDSTONE);
    for (let i = -3; i <= 3; i++) {
      k.box(i * 2.6, 20.6, cz - 14.3, 0.65, 4.4, 0.4).box(i * 2.6, 20.6, cz + 6.3, 0.65, 4.4, 0.4);
      k.box(-10.3, 20.6, cz - 4 + i * 2.6, 0.4, 4.4, 0.65).box(10.3, 20.6, cz - 4 + i * 2.6, 0.4, 4.4, 0.65);
    }
    // Corner turrets at the 4 corners of the crossing drum
    for (const sx of [-9.8, 9.8]) for (const sz of [-13.8, 5.8]) {
      k.color(SAND_LT).cyl(sx, 18.9, cz + sz, 1.3, 1.3, 9.2, 8);
      k.color(TILE_RED).cone(sx, 28.1, cz + sz, 1.5, 2.6, 8);
    }
  }
  k.glow(false).color(TILE_RED).pyramid(0, 27.4, cz - 4, 22.5, 22.5, 8.2);
  k.color(MOSAIC_GOLD).cyl(0, 35.4, cz - 4, 0.4, 0.15, 2.8, 8).box(0, 37.2, cz - 4, 1.4, 0.28, 0.28);

  // Famous South Gable Facade (at z = cz + 28 = 0) with golden Venetian mosaic ("Sermon on the Mount") & rose window
  const fz = cz + 28.2;
  k.color(SAND_LT).tri([-13.2, 18.5, fz], [13.2, 18.5, fz], [0, 25.0, fz]);
  k.glow(true).color(MOSAIC_GOLD).tri([-11.2, 18.8, fz + 0.15], [11.2, 18.8, fz + 0.15], [0, 24.1, fz + 0.15]);
  if (hi) {
    // Rich Venetian mosaic figures, golden aureoles, blue sky band & raking sandstone coping with cross finial
    k.color(MOSAIC_BLUE).box(0, 19.1, fz + 0.2, 16.5, 1.3, 0.12);
    const mFigs = [-7.2, -5.2, -3.4, -1.7, 0, 1.7, 3.4, 5.2, 7.2];
    for (let i = 0; i < mFigs.length; i++) {
      const fx = mFigs[i], isCenter = i === 4;
      const fh = isCenter ? 3.2 : 2.3 - Math.abs(i - 4) * 0.22;
      k.color(isCenter ? 0xffffff : (i % 2 ? MOSAIC_RED : MOSAIC_BLUE));
      k.box(fx, 19.0, fz + 0.25, 0.95, fh, 0.14);
      k.color(MOSAIC_GOLD).sphere(fx, 19.0 + fh + 0.22, fz + 0.26, 0.32, 8, 6);
    }
    // Sandstone gable raking cornice & apex cross
    k.glow(false).color(SAND_LT);
    k.strut([-13.4, 18.5, fz + 0.2], [0, 25.2, fz + 0.2], 0.65);
    k.strut([13.4, 18.5, fz + 0.2], [0, 25.2, fz + 0.2], 0.65);
    k.box(0, 25.2, fz + 0.2, 0.45, 2.1, 0.45).box(0, 26.3, fz + 0.2, 1.35, 0.4, 0.4);
    // Carved Romanesque wheel rose window with 12 stone spokes & clock face above
    k.roseWindow(0, 13.0, fz + 0.35, 3.8, -0.45, 12, { frame: SAND_SH, glass: LIT, tracery: SAND_LT });
    k.glow(true).color(0xfff8e0).cyl(0, 17.6, fz + 0.15, 0.95, 0.95, 0.25, 12);
  } else {
    k.glow(true).color(LIT).cyl(0, 13.2, fz - 0.2, 3.6, 3.6, 0.6, 8);
  }
  // Triple Romanesque entry portals with recessed archivolts & bronze doors
  k.glow(false).color(SAND_SH);
  for (const ax of [-6.5, 0, 6.5]) {
    const pw = ax === 0 ? 4.4 : 3.4, ph = ax === 0 ? 7.2 : 6.2;
    k.color(SAND_SH).box(ax, 0.4, fz - 0.15, pw + 0.8, ph, 0.8);
    if (hi) k.color(SAND_LT).arch(ax, ph * 0.68, fz + 0.32, pw + 0.4, ph * 0.35, 0.35, 12, 8);
    k.color(BRONZE).box(ax, 0.6, fz + 0.12, pw - 0.6, ph - 1.2, 0.3);
    k.glow(true).color(LIT).box(ax, ph - 1.6, fz + 0.18, pw - 0.8, 1.1, 0.25);
    k.glow(false);
  }
}

/** 87m Hoover Tower (east of the Quad at x = 96, z = -32) with observation belvedere & red-tiled dome. */
function hooverTower(k) {
  const hi = k.hi;
  const tx = 96, tz = -32;
  k.push().translate(tx, 0, tz);

  // Monumental podium, Lou Henry Hoover Library wings & arrival steps
  k.glow(false).color(SAND_SH).box(0, -2.5, 0, 36, 3.2, 36);
  k.color(SANDSTONE).box(0, 0.7, 0, 26, 6.2, 26);
  if (hi) {
    // Grand front stair & Triple Romanesque entry portal on Hoover Tower base
    for (let s = 0; s < 5; s++) k.color(PAVE).box(0, s * 0.35, 13.5 + (4 - s) * 0.8, 14, 0.4, 1.2);
    for (const ax of [-4.2, 0, 4.2]) {
      k.color(SAND_LT).arch(ax, 4.2, 13.2, 2.8, 1.4, 0.32, 10, 6);
      k.glow(true).color(LIT).box(ax, 1.2, 13.1, 2.2, 3.2, 0.2);
      k.glow(false);
    }
  }

  // Tall octagonal-cornered sandstone shaft (6.9m to 62m)
  k.color(SAND_LT).box(0, 6.9, 0, 16.8, 55.1, 16.8);
  if (hi) {
    // Corner buttress pilasters, bevelled flutes & vertical window slits
    k.color(SANDSTONE);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(sx * 7.6, 6.9, sz * 7.6, 2.8, 55.1, 2.8);
        k.color(SAND_SH).box(sx * 8.4, 6.9, sz * 8.4, 1.6, 55.1, 1.6);
        k.color(SANDSTONE);
      }
    }
    k.glow(true).color(LIT);
    for (let y = 12; y <= 54; y += 7) {
      k.box(0, y, 0, 17.1, 2.0, 4.8).box(0, y, 0, 4.8, 2.0, 17.1);
    }
  }

  // Observation deck & 48-bell carillon belfry arches (62m to 73m)
  k.glow(false).color(SANDSTONE).box(0, 62.0, 0, 18.6, 1.4, 18.6);
  k.color(SAND_LT).box(0, 63.4, 0, 15.2, 9.2, 15.2);
  if (hi) {
    // Triple arched belfry openings on each of the 4 faces with hanging bronze carillon bells
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (const bx of [-3.6, 0, 3.6]) {
        k.glow(false).color(GLASS).box(bx, 64.2, -7.7, 2.4, 6.4, 0.3);
        k.color(SAND_SH).arch(bx, 69.4, -7.75, 2.4, 1.2, 0.28, 10, 6);
        k.glow(true).color(LIT).box(bx, 64.5, -7.6, 1.9, 5.2, 0.2);
        k.glow(false).color(MOSAIC_GOLD).cone(bx, 68.2, -7.65, 0.55, 0.9, 8); // bronze carillon bell
      }
      k.pop();
    }
  } else {
    k.glow(true).color(LIT).box(0, 65.0, 0, 15.6, 5.8, 8.2).box(0, 65.0, 0, 8.2, 5.8, 15.6);
  }

  // Octagonal drum & iconic red terracotta hemispherical dome + ribs + lantern (72.6m to 87m)
  k.glow(false).color(SANDSTONE).cyl(0, 72.6, 0, 8.4, 8.0, 3.6, hi ? 16 : 8);
  k.color(TILE_RED).sphere(0, 75.8, 0, 7.8, hi ? 24 : 10, hi ? 12 : 5, 1.08, 0.55);
  if (hi) {
    // 8 raised terracotta hip ribs up the dome
    k.color(TILE_DK);
    for (let r = 0; r < 8; r++) {
      const a = (r / 8) * Math.PI * 2;
      k.strut([Math.cos(a) * 7.8, 76.0, Math.sin(a) * 7.8], [Math.cos(a) * 2.1, 83.4, Math.sin(a) * 2.1], 0.28);
    }
  }
  // Cupola lantern & lightning finial
  k.glow(true).color(SAND_LT).cyl(0, 83.2, 0, 2.2, 2.0, 2.6, hi ? 12 : 8);
  k.glow(false).color(TILE_DK).cyl(0, 85.8, 0, 2.3, 0.1, 1.5, hi ? 12 : 8);
  if (hi) k.color(MOSAIC_GOLD).sphere(0, 87.4, 0, 0.32, 8, 6).cyl(0, 87.6, 0, 0.08, 0.02, 1.8, 6);

  k.pop();
}

export function build(k) {
  const hi = k.hi;

  // 1. Main Quad Sandstone Courtyard & Oval Palm Drive approach
  k.glow(false).color(PAVE).box(0, -2.5, 12, 245, 2.9, 175);
  // 8 circular planter islands inside the Inner Quad courtyard ("Circles of the Quad") with Canary Island Date Palms
  const circles = [[-32, -4], [-11, -4], [11, -4], [32, -4], [-32, 24], [-11, 24], [11, 24], [32, 24]];
  for (const [px, pz] of (hi ? circles : [[-28, -2], [28, -2], [-28, 26], [28, 26]])) {
    k.color(SAND_SH).cyl(px, 0.4, pz, 7.2, 7.5, 0.55, hi ? 20 : 12);
    k.color(LAWN).cyl(px, 0.85, pz, 6.5, 6.5, 0.2, hi ? 20 : 12);
    k.color(0x6e5239).cyl(px, 0.9, pz, 0.48, 0.35, 5.2, 8);
    k.color(PALM).sphere(px, 6.5, pz, 3.2, hi ? 10 : 7, 6, 0.75);
  }

  // 2. Memorial Church anchoring the North side of the Quad
  memorialChurch(k);

  // 3. West, East & South Arcaded Sandstone Quad Wings + Memorial Court arches
  missionHall(k, -64, 0.4, 8, 22, 12.5, 92, 3.8);
  missionHall(k, 64, 0.4, 8, 22, 12.5, 92, 3.8);
  missionHall(k, -42, 0.4, 52, 54, 12.5, 20, 3.8);
  missionHall(k, 42, 0.4, 52, 54, 12.5, 20, 3.8);
  // Central South Quad Entry Arch Pavilion (facing Memorial Court & Palm Drive)
  missionHall(k, 0, 0.4, 52, 24, 16.5, 24, 4.6);
  k.glow(true).color(LIT).box(0, 1.2, 52, 8.5, 10.5, 24.6);
  // Continuous glowing arcade galleries along the courtyard perimeter
  k.box(-52.5, 1.2, 8, 1.2, 5.5, 84);
  k.box(52.5, 1.2, 8, 1.2, 5.5, 84);
  k.box(0, 1.2, 41.5, 102, 5.5, 1.2);
  k.glow(false);

  if (hi) {
    // Richardsonian Romanesque sandstone colonnade piers & semicircular arches along Inner & Outer Quad arcades
    k.color(SAND_LT);
    for (let z = -30; z <= 42; z += 6.0) {
      k.box(-51.8, 0.4, z, 1.4, 7.8, 1.4);
      k.box(51.8, 0.4, z, 1.4, 7.8, 1.4);
    }
    for (let x = -48; x <= 48; x += 6.0) {
      if (Math.abs(x) < 8) continue;
      k.box(x, 0.4, 41.2, 1.4, 7.8, 1.4);
      k.box(x, 0.4, 62.8, 1.4, 7.8, 1.4);
      if (x < 42) k.color(SAND_SH).arch(x + 3.0, 5.2, 63.0, 4.6, 2.2, 0.35, 10, 6);
      k.color(SAND_LT);
    }
    // Rodin's "Burghers of Calais" bronze sculpture ensemble in Memorial Court (z = 74)
    k.color(LAWN).box(0, 0.4, 76, 52, 0.25, 22);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      const bx = Math.cos(a) * 5.2, bz = 76 + Math.sin(a) * 4.2;
      k.color(SAND_SH).box(bx, 0.65, bz, 1.2, 0.55, 1.2);
      k.color(BRONZE).cyl(bx, 1.2, bz, 0.34, 0.26, 1.85, 8).sphere(bx, 3.2, bz, 0.22, 6, 5);
    }
  }

  // 4. 87m Hoover Tower rising to the northeast
  hooverTower(k);
}
