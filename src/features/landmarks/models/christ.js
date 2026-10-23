// feature/famous-landmarks: Christ the Redeemer, Corcovado, Rio — 1:1 (30 m statue on an 8 m pedestal = 38 m).
// Robed figure with arms spread 28 m (cross silhouette), hanging sleeves, head slightly bowed;
// square Art Deco pedestal (chapel) on the summit terrace. Pale soapstone; floodlit white at night.
const STONE = 0xd8d5c6, STONE_SH = 0xc4c1b1, PED = 0xcfcabb, TERRACE = 0xb3ad9f, RAIL = 0x9c968a;

export const lodDist = 1200;
export const glowStrength = 0.9;

export const colliders = [
  { x: 0, z: 0, hw: 16, hd: 13, h: 0.5 },
  { x: 0, z: 0, hw: 5, hd: 5, h: 8 },
  { x: 0, z: 0, r: 3.4, h: 38 },
  { x: 0, z: 0, hw: 14, hd: 1.5, h: 33.5 },
];

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 20 : 8;
  // summit terrace (runs below grade so it never floats on the rocky peak)
  k.color(0x76805c).taper(0, -34, 0, 70, 60, 34, 28, 33.2); // granite summit outcrop
  k.color(TERRACE).box(0, -0.8, 0, 32, 1.2, 26);
  if (hi) {
    k.color(RAIL);
    k.box(0, 0.4, -13, 32, 1.1, 0.4); k.box(0, 0.4, 13, 32, 1.1, 0.4);
    k.box(-16, 0.4, 0, 0.4, 1.1, 26); k.box(16, 0.4, 0, 0.4, 1.1, 26);
    // steps up to the pedestal
    k.color(PED);
    for (let i = 0; i < 4; i++) k.box(0, 0.4 + i * 0.35, 0, 14 - i * 1.2, 0.35, 14 - i * 1.2);
  }
  k.glow(true);
  // pedestal (chapel) 8 m
  k.color(PED);
  const p0 = hi ? 1.8 : 0.4;
  k.box(0, p0, 0, 9.5, 8 - p0 - 1.2, 9.5);
  k.color(STONE_SH).box(0, 6.8, 0, 10.4, 0.6, 10.4);
  k.color(PED).box(0, 7.4, 0, 9.2, 0.6, 9.2);
  if (hi) {
    k.color(STONE_SH);
    k.box(0, p0, -4.85, 2.2, 4.2, 0.3); // chapel door frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 4.6, p0, sz * 4.6, 0.8, 8 - p0 - 1.2, 0.8);
  }
  // statue: robe (lathe, flattened front-to-back)
  k.push().scale(1, 1, 0.62);
  k.color(STONE).lathe(0, 8, 0, [[3.4, 0], [3.1, 1.2], [2.8, 4], [2.6, 9], [2.65, 14], [2.9, 18.5], [3.3, 21.5], [3.6, 23.6], [3.3, 24.6], [1.6, 25.2], [0.95, 25.6]], seg);
  // neck + head (bowed slightly forward)
  k.color(STONE).cyl(0, 33.4, -0.3, 0.95, 0.9, 1.6, hi ? 12 : 6);
  k.pop();
  k.color(STONE).sphere(0, 36.1, -0.55, 1.45, hi ? 14 : 6, hi ? 8 : 4, 1.25);
  if (hi) {
    k.color(STONE_SH).sphere(0, 36.35, -0.35, 1.5, 14, 6, 1.2, 0.55); // hair
  }
  // arms: tapered, slight droop toward the hands
  for (const sx of [-1, 1]) {
    k.push().translate(sx * 2.6, 32.4, 0).rotateZ(sx * -0.035);
    k.color(STONE);
    k.taper(sx * 5.6, -1.1, 0, 11.2, 1.9, 11.2, 1.7, 2.3); // upper+fore arm block
    k.pop();
    // hand
    k.color(STONE).box(sx * 13.4, 31.15, 0, 1.2, 1.9, 1.0);
    // hanging sleeve: a thick drape under the arm, deepest near the elbow
    k.push().rotateX(Math.PI / 2);
    const sl = sx > 0
      ? [[2.6, -31.4], [11.2, -31.0], [10.4, -29.6], [7.5, -26.6], [4.2, -24.4], [2.6, -24.2]]
      : [[-2.6, -31.4], [-2.6, -24.2], [-4.2, -24.4], [-7.5, -26.6], [-10.4, -29.6], [-11.2, -31.0]];
    k.color(STONE_SH).extrude(sl, -0.75, 1.5);
    k.pop();
  }
  if (hi) {
    // robe folds and belt
    k.push().scale(1, 1, 0.62);
    k.color(STONE_SH).lathe(0, 21.2, 0, [[2.95, 0], [2.95, 0.6]], 20, { caps: false });
    k.pop();
    k.color(STONE_SH);
    for (const sx of [-1.4, 0, 1.4]) k.box(sx, 8.4, -1.75 + Math.abs(sx) * 0.12, 0.35, 12, 0.3);
    // heart on the chest
    k.color(0xc9bfa8).box(-0.8, 28.6, -1.95, 0.6, 0.7, 0.2);
  }
  k.glow(false);
}
