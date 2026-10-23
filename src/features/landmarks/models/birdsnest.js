// feature/beijing-landmarks: Beijing National Stadium (Bird's Nest / 国家体育场) — 1:1.
// Elliptical stadium (310 x 260 m) with saddle-shaped roof (42 m N/S, 68.5 m E/W).
// Interwoven steel diagrid lattice shell over an open red seating bowl and central pitch.
export const lodDist = 1800;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, hw: 160, hd: 135, h: 69.2 },
];

const STEEL_SILVER = 0xd4dce6;
const STEEL_DARK = 0x949ca8;
const STEEL_LIT = 0xf2f8ff;
const BOWL_RED = 0xda2622;
const BOWL_DARK = 0xac1c19;
const BOWL_LANTERN = 0xff4e3e;
const PLAZA = 0xb2b6be;
const TURF = 0x2a923e;

export function build(k) {
  const hi = k.hi;
  const nPortals = hi ? 24 : 12;
  const rxOuter = 155.0, rzOuter = 130.0;
  const rxInner = 138.0, rzInner = 116.0;
  const rxOculus = 92.0, rzOculus = 62.0;

  // 1. Elevated Elliptical Plaza Podium Base
  k.color(PLAZA);
  const segPlaza = hi ? 32 : 16;
  const baseProf = [[170, 0], [170, 3.0]];
  k.lathe(0, 0, 0, baseProf, segPlaza, { sy: 1, sx: 1 });
  // Stairs / ramps at N & S
  for (const zs of [-1, 1]) {
    k.box(0, 0, zs * 156, 52, 3.0, 18);
  }

  // 2. The Red Seating Bowl & Central Pitch
  // Outer concrete bowl wall (seen through lattice)
  k.glow(true).color(BOWL_LANTERN);
  k.cyl(0, 14, 0, 126, 135, 11, segPlaza);
  k.glow(false);
  k.color(BOWL_RED);
  k.cyl(0, 3, 0, 116, 126, 11, segPlaza);
  k.cyl(0, 25, 0, 135, 141, 9, segPlaza);

  // Inner amphitheater seating bowl (sloping downward to pitch)
  k.cyl(0, 23, 0, 139, 112, -10, segPlaza);
  k.color(BOWL_DARK);
  k.cyl(0, 13, 0, 110, 86, -9, segPlaza);
  k.color(BOWL_RED);
  k.cyl(0, 3, 0, 84, 56, -9, segPlaza);

  // Central Natural Turf Soccer Pitch
  k.color(TURF).box(0, 2.8, 0, 105, 0.3, 68);
  if (hi) {
    k.color(0xffffff);
    // Touchlines & center circle
    k.box(0, 3.12, 0, 68, 0.08, 0.45); // Center line
    k.box(0, 3.12, -22, 68, 0.08, 0.45);
    k.box(0, 3.12, 22, 68, 0.08, 0.45);
    k.box(-34, 3.12, 0, 0.45, 0.08, 44);
    k.box(34, 3.12, 0, 0.45, 0.08, 44);
    k.cyl(0, 3.13, 0, 9.2, 9.2, 0.08, 16);
    k.color(TURF).cyl(0, 3.14, 0, 8.7, 8.7, 0.08, 16);
  }

  // 3. Saddle-Shaped Outer Steel Lattice Shell
  const nodes = [];
  for (let i = 0; i < nPortals; i++) {
    const theta = (i / nPortals) * Math.PI * 2;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const saddleH = 55.25 + 13.25 * Math.cos(2.0 * theta);

    const bx = cosT * rxOuter, bz = sinT * rzOuter;
    const tx = cosT * rxInner, tz = sinT * rzInner, ty = saddleH;
    const ox = cosT * rxOculus, oz = sinT * rzOculus, oy = saddleH * 0.93;

    nodes.push({ bx, bz, tx, ty, tz, ox, oy, oz, saddleH, theta });

    // Primary portal column: inclined box girder
    k.color(STEEL_SILVER);
    k.strut([bx, 3.0, bz], [tx, ty, tz], 2.2);
    // Roof cantilever girder
    k.strut([tx, ty, tz], [ox, oy, oz], 1.9);

    // Night architectural floodlight accents along portal crowns
    if (i % 2 === 0) {
      k.glow(true).color(STEEL_LIT);
      k.strut([tx, ty + 0.45, tz], [ox, oy + 0.45, oz], 0.7);
      k.glow(false);
    }
  }

  // 4. Interwoven Diagrid Steel Struts across Facade and Roof Ring
  for (let i = 0; i < nPortals; i++) {
    const cur = nodes[i];
    const next1 = nodes[(i + 1) % nPortals];
    const next2 = nodes[(i + 2) % nPortals];
    const next3 = nodes[(i + 3) % nPortals];

    // Perimeter rings
    k.color(STEEL_SILVER);
    k.strut([cur.tx, cur.ty, cur.tz], [next1.tx, next1.ty, next1.tz], 1.8);

    // Oculus rim rings
    k.glow(true).color(STEEL_LIT);
    k.strut([cur.ox, cur.oy, cur.oz], [next1.ox, next1.oy, next1.oz], 1.7);
    k.glow(false);
    k.color(STEEL_SILVER);
    k.strut([cur.ox, cur.oy - 2.2, cur.oz], [next1.ox, next1.oy - 2.2, next1.oz], 1.3);
    k.strut([cur.ox, cur.oy, cur.oz], [cur.ox, cur.oy - 2.2, cur.oz], 0.9);

    if (hi) {
      // Facade intermediate nodal positions
      const midY1 = cur.saddleH * 0.36;
      const midX1 = cur.bx * 0.65 + cur.tx * 0.35, midZ1 = cur.bz * 0.65 + cur.tz * 0.35;
      const midY2 = cur.saddleH * 0.70;
      const midX2 = cur.bx * 0.30 + cur.tx * 0.70, midZ2 = cur.bz * 0.30 + cur.tz * 0.70;

      const nextMidY1 = next2.saddleH * 0.36;
      const nextMidX1 = next2.bx * 0.65 + next2.tx * 0.35, nextMidZ1 = next2.bz * 0.65 + next2.tz * 0.35;
      const nextMidY2 = next2.saddleH * 0.70;
      const nextMidX2 = next2.bx * 0.30 + next2.tx * 0.70, nextMidZ2 = next2.bz * 0.30 + next2.tz * 0.70;

      // Diagrid struts along facade
      k.color(STEEL_DARK);
      k.strut([cur.bx, 3.0, cur.bz], [nextMidX1, nextMidY1, nextMidZ1], 1.3);
      k.color(STEEL_SILVER);
      k.strut([next2.bx, 3.0, next2.bz], [midX1, midY1, midZ1], 1.3);
      k.strut([midX1, midY1, midZ1], [nextMidX2, nextMidY2, nextMidZ2], 1.25);
      k.color(STEEL_DARK);
      k.strut([nextMidX1, nextMidY1, nextMidZ1], [midX2, midY2, midZ2], 1.25);
      k.color(STEEL_SILVER);
      k.strut([midX2, midY2, midZ2], [next3.tx, next3.ty, next3.tz], 1.2);

      // Roof weaving chords
      k.strut([cur.tx, cur.ty, cur.tz], [next3.ox, next3.oy, next3.oz], 1.25);
      k.color(STEEL_DARK);
      k.strut([cur.ox, cur.oy, cur.oz], [next2.tx, next2.ty, next2.tz], 1.2);
    }
  }
}
