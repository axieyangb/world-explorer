// feature/famous-landmarks: Christ the Redeemer, Corcovado, Rio — 1:1 (30 m statue on an 8 m pedestal = 38 m).
// Robed figure with arms spread 28 m (cross silhouette), wide sleeves hanging under the forearms, open
// hands, head slightly bowed; deep vertical robe folds, cord belt and the sacred heart; square Art Deco
// pedestal (chapel) on the granite summit terrace with its railings and stairs. Pale soapstone mosaic,
// floodlit white at night.
const STONE = 0xdcd9cc, STONE_SH = 0xc3c0b2, STONE_DK = 0xa9a698, PED = 0xd2cdbd, PED_DK = 0xb7b1a1;
const TERRACE = 0xb9b3a4, RAIL = 0x8f8a7e, ROCK = 0x6f6c5f, ROCK_DK = 0x5b5a4e, MOSS = 0x6d7a52;

export const lodDist = 1200;
export const glowStrength = 0.95;

export const colliders = [
  { x: 0, z: 0, hw: 17, hd: 14, h: 0.5 },
  { x: 0, z: 0, hw: 5, hd: 5, h: 8 },
  { x: 0, z: 0, r: 3.2, h: 38 },
  { x: 0, z: 0, hw: 14, hd: 1.4, h: 34.1 },
];

const BASE = 8;          // statue foot level (top of pedestal)
const SH = 32.3;         // shoulder / arm line
const AY = 32.7;         // arm axis height

/** Elliptical surface of revolution (front-back flattened by fz) around the Y axis at the origin. */
function robe(k, prof, seg, fz) {
  k.push().scale(1, 1, fz);
  k.lathe(0, 0, 0, prof, seg);
  k.pop();
}

/** Tapered round limb along +X (sx = 1) or -X (sx = -1) from x0 to x1, radius r0 -> r1, flattened vertically. */
function limb(k, sx, x0, x1, y, r0, r1, seg, fy = 0.92) {
  k.push().translate(sx * x0, y, 0).rotateZ(-sx * Math.PI / 2);
  k.push().scale(fy, 1, 1);
  k.lathe(0, 0, 0, [[r0, 0], [(r0 + r1) / 2, (x1 - x0) * 0.55], [r1, x1 - x0]], seg, { caps: true });
  k.pop();
  k.pop();
}

function summit(k) {
  const hi = k.hi;
  // granite summit outcrop, running far below grade so the steep peak never shows a gap
  k.glow(false).color(ROCK).taper(0, -40, 0, 80, 70, 36, 30, 39.2);
  if (hi) {
    // weathered boulders spilling off the outcrop edge
    k.color(ROCK_DK);
    for (const [x, z, r] of [[-17, 12, 3.6], [15, 14, 3.0], [-19, -8, 2.6], [18, -11, 3.3], [4, 16, 2.4], [-6, -15, 2.8]]) k.sphere(x, -1.2, z, r, 7, 4, 0.7);
    k.color(MOSS).taper(0, -2.2, 0, 38, 32, 34.5, 28.5, 1.6); // scrubby rim
  }
  // paved terrace with balustrade
  k.color(TERRACE).box(0, -0.9, 0, 34, 1.3, 28);
  if (hi) {
    k.color(RAIL);
    k.box(0, 0.4, -14, 34, 1.1, 0.35).box(0, 0.4, 14, 34, 1.1, 0.35);
    k.box(-17, 0.4, 0, 0.35, 1.1, 28).box(17, 0.4, 0, 0.35, 1.1, 28);
    for (let i = -8; i <= 8; i++) { k.box(i * 2.1, 0.4, -14, 0.3, 1.25, 0.5); k.box(i * 2.1, 0.4, 14, 0.3, 1.25, 0.5); }
    // stair flights rising to the pedestal on three sides
    k.color(PED_DK);
    for (let i = 0; i < 4; i++) k.box(0, 0.4 + i * 0.35, 0, 15 - i * 1.3, 0.35, 15 - i * 1.3);
  }
}

function pedestal(k) {
  const hi = k.hi;
  const p0 = hi ? 1.8 : 0.4;
  k.glow(true).color(PED);
  k.box(0, p0, 0, 9.4, BASE - p0 - 1.3, 9.4);
  k.color(PED_DK).box(0, BASE - 1.3, 0, 10.4, 0.45, 10.4);
  k.color(PED).box(0, BASE - 0.85, 0, 9.8, 0.45, 9.8);
  k.color(PED_DK).box(0, BASE - 0.4, 0, 8.6, 0.4, 8.6);
  if (!hi) return;
  // Art Deco corner piers and stepped panels on each face, chapel door at the front
  k.color(PED_DK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 4.55, p0, sz * 4.55, 0.9, BASE - p0 - 1.3, 0.9);
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.color(PED_DK).box(0, p0 + 1.0, -4.72, 5.2, 3.6, 0.12);
    k.color(PED).box(0, p0 + 1.5, -4.78, 4.0, 2.6, 0.12);
    k.pop();
  }
  k.glow(false).color(0x4a463e).box(0, p0, -4.86, 1.7, 2.6, 0.1); // chapel door
}

function statue(k) {
  const hi = k.hi;
  const seg = hi ? 22 : 8;
  k.glow(true);
  // robe: hem flare at the feet, narrow at the knees, gently widening to the chest, rounded shoulders
  k.color(STONE);
  robe(k, [[2.55, BASE], [2.75, BASE + 0.6], [2.5, BASE + 2.0], [2.3, BASE + 6], [2.3, BASE + 11], [2.45, BASE + 15.5],
    [2.75, BASE + 19.5], [3.0, BASE + 22], [2.95, SH - 0.6], [2.4, SH + 0.5], [1.3, SH + 1.2], [0.85, SH + 1.5]], seg, 0.6);
  // neck + head (bowed forward), hair falling to the shoulders
  k.color(STONE).cyl(0, SH + 1.2, -0.25, 0.82, 0.78, 1.5, hi ? 10 : 6);
  k.push().translate(0, SH + 3.75, -0.55).rotateX(0.18);
  k.color(STONE).sphere(0, 0, 0, 1.2, hi ? 14 : 6, hi ? 8 : 4, 1.42);
  k.pop();
  if (hi) {
    k.color(STONE_SH);
    k.push().translate(0, SH + 3.9, -0.38).rotateX(0.18);
    k.sphere(0, 0, 0, 1.3, 14, 6, 1.32, 0.6);      // hair cap
    k.pop();
    k.box(0, SH + 1.5, 0.3, 1.8, 2.3, 1.0);         // hair at the nape
    k.box(0, SH + 3.15, -1.74, 0.26, 0.75, 0.25); // nose
  }
  // arms: tapered round limbs, horizontal with a hint of droop, ending in open hands
  for (const sx of [-1, 1]) {
    k.color(STONE);
    k.push().translate(0, AY, 0).rotateZ(sx * -0.03).translate(0, -AY, 0);
    limb(k, sx, 1.6, 7.6, AY, 1.15, 0.95, hi ? 10 : 6);      // upper arm (in the sleeve)
    limb(k, sx, 7.4, 12.6, AY, 0.98, 0.72, hi ? 10 : 6);     // forearm
    // wide sleeve cuff
    k.color(STONE_SH);
    limb(k, sx, 10.6, 11.9, AY - 0.05, 1.25, 1.35, hi ? 10 : 6);
    // open hand, palm forward: flat block + thumb
    k.color(STONE);
    k.box(sx * 13.35, AY - 1.0, -0.05, 1.5, 1.95, 0.55);
    if (hi) {
      k.box(sx * 13.25, AY - 1.55, -0.05, 1.1, 0.5, 0.45);
      k.box(sx * 12.55, AY - 0.15, -0.35, 0.35, 0.8, 0.35);  // thumb
    }
    // hanging sleeve: drape under the arm, deepest near the elbow, folded at its lower edge
    k.color(STONE_SH);
    k.push().rotateX(Math.PI / 2);
    const dr = [[2.2, -(AY - 0.6)], [11.6, -(AY - 0.7)], [11.2, -(AY - 1.9)], [9.4, -(AY - 3.4)], [7.0, -(AY - 4.3)], [4.6, -(AY - 5.4)], [2.2, -(AY - 6.4)]]
      .map(([x, y]) => [sx * x, y]);
    k.extrude(dr, -0.55, 1.1);
    k.pop();
    k.pop();
  }
  if (!hi) { k.glow(false); return; }
  // deep vertical robe folds front and back, and the cord belt at the waist
  k.color(STONE_SH);
  for (const z of [-1, 1]) {
    for (const [x, h, w] of [[-1.55, 13.5, 0.36], [-0.55, 21.5, 0.3], [0.55, 21.5, 0.3], [1.55, 13.5, 0.36]]) {
      const zz = z * (Math.sqrt(Math.max(0, 6.0 - x * x)) * 0.6 + 0.04);
      k.box(x, BASE + 0.4, zz, w, h, 0.3);
    }
  }
  k.color(STONE_DK);
  k.push().scale(1, 1, 0.6);
  k.lathe(0, BASE + 18.4, 0, [[2.72, 0], [2.72, 0.45]], 20, { caps: false });
  k.pop();
  k.box(0.7, BASE + 13.0, -1.62, 0.25, 5.4, 0.2);   // hanging cord end
  // sacred heart on the chest and the toes showing under the hem
  k.color(0xcfc4a7).box(-0.75, SH - 3.0, -1.72, 0.65, 0.75, 0.2);
  k.color(STONE).box(-0.6, BASE, -1.62, 0.7, 0.5, 0.7).box(0.6, BASE, -1.62, 0.7, 0.5, 0.7);
  k.glow(false);
}

export function build(k) {
  summit(k);
  pedestal(k);
  statue(k);
}
