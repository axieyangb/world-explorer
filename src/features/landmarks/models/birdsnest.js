// feature/beijing-landmarks: Beijing National Stadium (Bird's Nest / 国家体育场) — 1:1.
// Elliptical stadium (310 x 260 m) with saddle-shaped roof (42 m N/S, 68.5 m E/W).
// Interwoven steel diagrid lattice shell with translucent ETFE membrane cushions over a glowing
// Imperial-red seating bowl, red concourse stair cascades, and full 400m Olympic running track & soccer pitch.
export const lodDist = 1800;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, hw: 160, hd: 135, h: 69.2 },
];

const STEEL_SILVER = 0xd4dce6;
const STEEL_DARK = 0x949ca8;
const STEEL_LIT = 0xf2f8ff;
const ETFE_MEMBRANE = 0xe3ebf4;
const BOWL_RED = 0xda2622;
const BOWL_DARK = 0xac1c19;
const BOWL_LANTERN = 0xff4e3e;
const PLAZA = 0xb2b6be;
const TURF = 0x2a923e;
const TRACK_RED = 0xc84632;

export function build(k) {
  const hi = k.hi;
  const nPortals = hi ? 24 : 12;
  const rxOuter = 155.0, rzOuter = 130.0;
  const rxInner = 138.0, rzInner = 116.0;
  const rxOculus = 92.0, rzOculus = 62.0;

  // 1. Elevated Elliptical Plaza Podium Base
  k.color(PLAZA);
  const segPlaza = hi ? 36 : 16;
  const baseProf = [[170, 0], [170, 3.0]];
  k.lathe(0, 0, 0, baseProf, segPlaza);
  for (const zs of [-1, 1]) {
    k.box(0, 0, zs * 156, 52, 3.0, 18);
  }

  // 2. The Red Seating Bowl, Exterior Concourse Stair Cascades & Central Olympic Track/Pitch
  k.glow(true).color(BOWL_LANTERN);
  k.cyl(0, 14, 0, 126, 135, 11, segPlaza);
  k.glow(false);
  k.color(BOWL_RED);
  k.cyl(0, 3, 0, 116, 126, 11, segPlaza);
  k.cyl(0, 25, 0, 135, 141, 9, segPlaza);

  if (hi) {
    // Glowing red diagonal concourse stair ribbons & glass VIP skybox bands wrapping the red inner bowl
    k.glow(true).color(0xffaa66);
    k.cyl(0, 22, 0, 133.5, 135.5, 2.4, segPlaza, { caps: false });
    for (let s = 0; s < 12; s++) {
      const a0 = (s / 12) * Math.PI * 2, a1 = a0 + 0.38;
      k.color(BOWL_LANTERN).strut(
        [Math.cos(a0) * 121, 4.0, Math.sin(a0) * 121],
        [Math.cos(a1) * 139, 32.0, Math.sin(a1) * 139],
        1.8
      );
    }
    k.glow(false);
  }

  // Inner amphitheater 3-tier seating bowl (sloping downward to pitch)
  k.color(BOWL_RED).cyl(0, 23, 0, 139, 112, -10, segPlaza);
  k.color(BOWL_DARK).cyl(0, 13, 0, 110, 86, -9, segPlaza);
  k.color(BOWL_RED).cyl(0, 3, 0, 84, 56, -9, segPlaza);

  // Olympic 8-Lane Red Tartan Athletics Track & Central Natural Turf Soccer Pitch
  if (hi) {
    k.color(TRACK_RED).cyl(0, 2.75, 0, 62, 62, 0.25, 32);
    k.color(0xffffff).torus(0, 3.01, 0, 54, 0.18, 32, 4).torus(0, 3.01, 0, 60, 0.18, 32, 4);
  }
  k.color(TURF).box(0, 2.8, 0, 105, 0.3, 68);
  if (hi) {
    k.color(0xffffff);
    // Touchlines, penalty boxes, goalposts & center circle
    k.box(0, 3.12, 0, 68, 0.08, 0.45);
    k.box(0, 3.12, -22, 68, 0.08, 0.45);
    k.box(0, 3.12, 22, 68, 0.08, 0.45);
    k.box(-34, 3.12, 0, 0.45, 0.08, 44);
    k.box(34, 3.12, 0, 0.45, 0.08, 44);
    k.cyl(0, 3.13, 0, 9.2, 9.2, 0.08, 16);
    k.color(TURF).cyl(0, 3.14, 0, 8.7, 8.7, 0.08, 16);
  }

  // 3. Saddle-Shaped Outer Steel Lattice Shell & Translucent White ETFE Roof Membrane Cushions
  const nodes = [];
  for (let i = 0; i < nPortals; i++) {
    const theta = (i / nPortals) * Math.PI * 2;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const saddleH = 55.25 + 13.25 * Math.cos(2.0 * theta);

    const bx = cosT * rxOuter, bz = sinT * rzOuter;
    const tx = cosT * rxInner, tz = sinT * rzInner, ty = saddleH;
    const ox = cosT * rxOculus, oz = sinT * rzOculus, oy = saddleH * 0.93;

    nodes.push({ bx, bz, tx, ty, tz, ox, oy, oz, saddleH, theta });

    // Primary portal column: inclined box girder + inner diamond leg web
    k.color(STEEL_SILVER);
    k.strut([bx, 3.0, bz], [tx, ty, tz], 2.25);
    if (hi) {
      k.color(STEEL_DARK).strut([bx * 0.94, 3.0, bz * 0.94], [tx, ty - 3.5, tz], 1.35);
    }
    // Roof cantilever girder
    k.color(STEEL_SILVER).strut([tx, ty, tz], [ox, oy, oz], 1.95);

    if (i % 2 === 0) {
      k.glow(true).color(STEEL_LIT);
      k.strut([tx, ty + 0.45, tz], [ox, oy + 0.45, oz], 0.72);
      k.glow(false);
    }
  }

  // 4. Interwoven Diagrid Steel Struts, Secondary Twigs & Translucent ETFE Roof Panels
  for (let i = 0; i < nPortals; i++) {
    const cur = nodes[i];
    const next1 = nodes[(i + 1) % nPortals];
    const next2 = nodes[(i + 2) % nPortals];
    const next3 = nodes[(i + 3) % nPortals];
    const next4 = nodes[(i + 4) % nPortals];

    // Perimeter rings
    k.color(STEEL_SILVER);
    k.strut([cur.tx, cur.ty, cur.tz], [next1.tx, next1.ty, next1.tz], 1.85);

    // Oculus rim rings & stadium floodlight banks along inner oculus truss
    k.glow(true).color(STEEL_LIT);
    k.strut([cur.ox, cur.oy, cur.oz], [next1.ox, next1.oy, next1.oz], 1.75);
    k.glow(false);
    k.color(STEEL_SILVER);
    k.strut([cur.ox, cur.oy - 2.4, cur.oz], [next1.ox, next1.oy - 2.4, next1.oz], 1.35);
    k.strut([cur.ox, cur.oy, cur.oz], [cur.ox, cur.oy - 2.4, cur.oz], 0.95);

    if (hi) {
      // Translucent white ETFE membrane pillow panels between roof girders
      k.color(ETFE_MEMBRANE);
      k.quad2(
        [cur.tx, cur.ty - 0.6, cur.tz],
        [next1.tx, next1.ty - 0.6, next1.tz],
        [next1.ox, next1.oy - 0.6, next1.oz],
        [cur.ox, cur.oy - 0.6, cur.oz]
      );

      // Facade intermediate nodal positions
      const midY1 = cur.saddleH * 0.36;
      const midX1 = cur.bx * 0.65 + cur.tx * 0.35, midZ1 = cur.bz * 0.65 + cur.tz * 0.35;
      const midY2 = cur.saddleH * 0.70;
      const midX2 = cur.bx * 0.30 + cur.tx * 0.70, midZ2 = cur.bz * 0.30 + cur.tz * 0.70;

      const next1MidY1 = next1.saddleH * 0.36;
      const next1MidX1 = next1.bx * 0.65 + next1.tx * 0.35, next1MidZ1 = next1.bz * 0.65 + next1.tz * 0.35;
      const next1MidY2 = next1.saddleH * 0.70;
      const next1MidX2 = next1.bx * 0.30 + next1.tx * 0.70, next1MidZ2 = next1.bz * 0.30 + next1.tz * 0.70;

      const next2MidY1 = next2.saddleH * 0.36;
      const next2MidX1 = next2.bx * 0.65 + next2.tx * 0.35, next2MidZ1 = next2.bz * 0.65 + next2.tz * 0.35;
      const next2MidY2 = next2.saddleH * 0.70;
      const next2MidX2 = next2.bx * 0.30 + next2.tx * 0.70, next2MidZ2 = next2.bz * 0.30 + next2.tz * 0.70;

      // Primary & secondary interwoven "Bird's Nest" diagrid struts along facade
      k.color(STEEL_DARK);
      k.strut([cur.bx, 3.0, cur.bz], [next2MidX1, next2MidY1, next2MidZ1], 1.35);
      k.strut([cur.bx, 3.0, cur.bz], [next1MidX2, next1MidY2, next1MidZ2], 0.95);
      k.color(STEEL_SILVER);
      k.strut([next2.bx, 3.0, next2.bz], [midX1, midY1, midZ1], 1.35);
      k.strut([midX1, midY1, midZ1], [next2MidX2, next2MidY2, next2MidZ2], 1.28);
      k.strut([midX1, midY1, midZ1], [next1MidX1, next1MidY1, next1MidZ1], 0.9);
      k.color(STEEL_DARK);
      k.strut([next2MidX1, next2MidY1, next2MidZ1], [midX2, midY2, midZ2], 1.28);
      k.strut([midX2, midY2, midZ2], [next1MidX2, next1MidY2, next1MidZ2], 0.9);
      k.color(STEEL_SILVER);
      k.strut([midX2, midY2, midZ2], [next3.tx, next3.ty, next3.tz], 1.25);

      // Dense tangential & counter-weaving roof chords creating the signature Bird's Nest crown pattern
      k.strut([cur.tx, cur.ty, cur.tz], [next3.ox, next3.oy, next3.oz], 1.35);
      k.strut([cur.tx, cur.ty, cur.tz], [next2.ox, next2.oy, next2.oz], 1.05);
      k.color(STEEL_DARK);
      k.strut([cur.ox, cur.oy, cur.oz], [next2.tx, next2.ty, next2.tz], 1.28);
      k.strut([cur.ox, cur.oy, cur.oz], [next4.tx, next4.ty, next4.tz], 1.05);
      const rMidX = (cur.tx + next2.ox) * 0.5, rMidY = (cur.ty + next2.oy) * 0.5 + 0.4, rMidZ = (cur.tz + next2.oz) * 0.5;
      const rMidX2 = (next1.tx + next3.ox) * 0.5, rMidY2 = (next1.ty + next3.oy) * 0.5 + 0.4, rMidZ2 = (next1.tz + next3.oz) * 0.5;
      k.color(STEEL_SILVER).strut([rMidX, rMidY, rMidZ], [rMidX2, rMidY2, rMidZ2], 1.1);
    }
  }
}
