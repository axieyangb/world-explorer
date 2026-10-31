// feature/famous-landmarks: Christ the Redeemer, Corcovado, Rio — 1:1 (30 m statue on an 8 m pedestal = 38 m).
// Robed figure with arms spread 28 m (cross silhouette), wide sleeves hanging under the forearms, open
// hands with sculpted fingers, head slightly bowed with Art Deco facial features; deep vertical robe folds,
// diagonal mantle drape, cord belt and the Sacred Heart; octagonal Art Deco pedestal (Chapel of Nossa Senhora Aparecida)
// on the Corcovado granite summit terrace with panoramic viewing decks and steps. Pale soapstone mosaic, floodlit white at night.
const STONE = 0xdcd9cc, STONE_SH = 0xc3c0b2, STONE_DK = 0xa9a698, PED = 0xd2cdbd, PED_DK = 0xb7b1a1;
const TERRACE = 0xb9b3a4, RAIL = 0x8f8a7e, ROCK = 0x6f6c5f, ROCK_DK = 0x5b5a4e, MOSS = 0x567042, HEART = 0xd8c89e;

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

function robe(k, prof, seg, fz) {
  k.push().scale(1, 1, fz);
  k.lathe(0, 0, 0, prof, seg);
  k.pop();
}

function limb(k, sx, x0, x1, y, r0, r1, seg, fy = 0.92) {
  k.push().translate(sx * x0, y, 0).rotateZ(-sx * Math.PI / 2);
  k.push().scale(fy, 1, 1);
  k.lathe(0, 0, 0, [[r0, 0], [(r0 + r1) / 2, (x1 - x0) * 0.55], [r1, x1 - x0]], seg, { caps: true });
  k.pop();
  k.pop();
}

function summit(k) {
  const hi = k.hi;
  // Corcovado granite peak crag, running deep below grade with lush Tijuca Atlantic rainforest foliage
  k.glow(false).color(ROCK).taper(0, -40, 0, 82, 72, 36, 30, 39.2);
  if (hi) {
    // Weathered granite crags & Tijuca rainforest canopy clusters clinging to the cliffside
    k.color(ROCK_DK);
    for (const [x, z, r] of [[-17, 12, 3.8], [15, 14, 3.2], [-19, -8, 2.8], [18, -11, 3.5], [4, 16, 2.6], [-6, -15, 3.0]]) {
      k.sphere(x, -1.2, z, r, 10, 6, 0.72);
    }
    k.color(MOSS).taper(0, -2.4, 0, 39, 33, 34.5, 28.5, 1.8);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.color(i % 2 ? MOSS : 0x3e5c32).sphere(Math.cos(a) * 19.5, -1.6, Math.sin(a) * 16.5, 2.6, 8, 5, 0.75);
    }
  }
  // Paved summit terrace + forward panoramic prow lookout (-Z facing Guanabara Bay & Sugarloaf)
  k.color(TERRACE).box(0, -0.9, 0, 34, 1.3, 28);
  if (hi) {
    k.color(TERRACE).box(0, -0.9, -16.5, 18, 1.3, 5.5); // forward viewing terrace extension
    k.color(RAIL);
    k.box(0, 0.4, -19.1, 18, 1.1, 0.35).box(-9, 0.4, -16.5, 0.35, 1.1, 5.5).box(9, 0.4, -16.5, 0.35, 1.1, 5.5);
    k.box(-13, 0.4, -14, 8, 1.1, 0.35).box(13, 0.4, -14, 8, 1.1, 0.35).box(0, 0.4, 14, 34, 1.1, 0.35);
    k.box(-17, 0.4, 0, 0.35, 1.1, 28).box(17, 0.4, 0, 0.35, 1.1, 28);
    for (let i = -8; i <= 8; i++) {
      k.box(i * 2.1, 0.4, 14, 0.3, 1.25, 0.5);
      if (Math.abs(i) >= 4) k.box(i * 2.1, 0.4, -14, 0.3, 1.25, 0.5);
    }
    // Stepped Art Deco granite stair flights rising to the pedestal
    k.color(PED_DK);
    for (let i = 0; i < 5; i++) k.box(0, 0.4 + i * 0.28, 0, 15.5 - i * 1.1, 0.28, 15.5 - i * 1.1);
    // Upward floodlight banks around the pedestal terrace
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2 + Math.PI / 8;
      const fx = Math.cos(a) * 8.2, fz = Math.sin(a) * 8.2;
      k.glow(false).color(0x3a3e42).box(fx, 1.8, fz, 0.75, 0.4, 0.75);
      k.glow(true).color(0xfff8e6).box(fx, 2.18, fz, 0.55, 0.12, 0.55);
    }
    k.glow(false);
  }
}

function pedestal(k) {
  const hi = k.hi;
  const p0 = hi ? 1.8 : 0.4;
  k.glow(true).color(PED);
  if (hi) {
    // Octagonal-chamfered Art Deco ribbed pedestal (8m tall) housing the Chapel of Our Lady of Aparecida
    k.prism(0, p0, 0, 5.4, BASE - p0 - 1.3, 8, Math.PI / 8);
    k.color(PED_DK).prism(0, BASE - 1.3, 0, 5.8, 0.45, 8, Math.PI / 8);
    k.color(PED).prism(0, BASE - 0.85, 0, 5.5, 0.45, 8, Math.PI / 8);
    k.color(PED_DK).prism(0, BASE - 0.4, 0, 4.9, 0.4, 8, Math.PI / 8);
  } else {
    k.box(0, p0, 0, 9.4, BASE - p0 - 1.3, 9.4);
    k.color(PED_DK).box(0, BASE - 1.3, 0, 10.4, 0.45, 10.4);
    k.color(PED).box(0, BASE - 0.85, 0, 9.8, 0.45, 9.8);
    k.color(PED_DK).box(0, BASE - 0.4, 0, 8.6, 0.4, 8.6);
    return;
  }
  // Art Deco vertical buttress ribs & recessed geometric panels on each face, plus Chapel arched portal at rear/front
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.color(PED_DK).box(-2.2, p0, -4.92, 0.55, BASE - p0 - 1.3, 0.35).box(2.2, p0, -4.92, 0.55, BASE - p0 - 1.3, 0.35);
    k.color(PED_DK).box(0, p0 + 0.9, -4.96, 3.6, 3.8, 0.14);
    k.color(PED).box(0, p0 + 1.3, -5.02, 2.8, 3.0, 0.14);
    k.pop();
  }
  // Bronze-framed Chapel door & cross relief
  k.glow(false).color(0x4a4238).box(0, p0, -5.08, 1.75, 2.8, 0.15);
  k.glow(true).color(HEART).box(0, p0 + 3.2, -5.08, 0.28, 1.1, 0.16).box(0, p0 + 3.85, -5.08, 0.78, 0.25, 0.16);
}

function statue(k) {
  const hi = k.hi;
  const seg = hi ? 28 : 8;
  k.glow(true);
  // robe: hem flare at the feet, narrow at the knees, gently widening to the chest, rounded shoulders
  k.color(STONE);
  robe(k, [[2.55, BASE], [2.75, BASE + 0.6], [2.5, BASE + 2.0], [2.3, BASE + 6], [2.3, BASE + 11], [2.45, BASE + 15.5],
    [2.75, BASE + 19.5], [3.0, BASE + 22], [2.95, SH - 0.6], [2.4, SH + 0.5], [1.3, SH + 1.2], [0.85, SH + 1.5]], seg, 0.62);

  // neck + head (bowed forward 10 deg to look down over Rio), Art Deco planar facial features & beard
  k.color(STONE).cyl(0, SH + 1.2, -0.25, 0.84, 0.78, 1.5, hi ? 14 : 6);
  k.push().translate(0, SH + 3.75, -0.55).rotateX(0.18);
  k.color(STONE).sphere(0, 0, 0, 1.22, hi ? 18 : 6, hi ? 10 : 4, 1.42);
  if (hi) {
    // Art Deco sculpted hair cap, center parting, brow ridge, nose, mustache & cleft beard (Paul Landowski sculpture)
    k.color(STONE_SH).sphere(0, 0.15, 0.16, 1.32, 16, 8, 1.32, 0.62);
    k.box(-1.15, -0.8, 0.05, 0.45, 2.1, 0.95).box(1.15, -0.8, 0.05, 0.45, 2.1, 0.95); // side locks
    k.color(STONE_DK).box(0, 0.35, -1.16, 1.35, 0.18, 0.22); // brow arch
    k.color(STONE).box(0, -0.15, -1.24, 0.28, 0.82, 0.28); // straight Art Deco nose bridge
    k.color(STONE_SH).box(0, -0.72, -1.18, 0.85, 0.22, 0.24); // mustache
    k.taper(0, -1.55, -0.95, 0.65, 0.5, 1.15, 0.75, 0.85); // sculpted Art Deco beard
    // Lightning rod crown spikes along top of head & arms
    k.color(RAIL).cyl(0, 1.72, 0, 0.03, 0.01, 0.55, 4);
  }
  k.pop();
  if (hi) {
    k.color(STONE_SH).box(0, SH + 1.5, 0.32, 1.85, 2.3, 1.0); // hair at the nape
  }

  // arms: tapered round limbs spanning 28 m, ending in detailed open hands with 4 fingers & thumb
  for (const sx of [-1, 1]) {
    k.color(STONE);
    k.push().translate(0, AY, 0).rotateZ(sx * -0.03).translate(0, -AY, 0);
    limb(k, sx, 1.6, 7.6, AY, 1.15, 0.95, hi ? 14 : 6);
    limb(k, sx, 7.4, 12.6, AY, 0.98, 0.72, hi ? 14 : 6);
    // wide sleeve cuff
    k.color(STONE_SH);
    limb(k, sx, 10.6, 11.9, AY - 0.05, 1.25, 1.35, hi ? 14 : 6);
    // open hand, palm forward + sculpted fingers & thumb
    k.color(STONE);
    k.box(sx * 12.9, AY - 0.85, -0.05, 1.1, 1.75, 0.52);
    if (hi) {
      // 4 distinct outstretched fingers
      for (let f = 0; f < 4; f++) {
        const fy = AY - 0.82 + f * 0.4, flen = f === 1 || f === 2 ? 1.15 : 0.95;
        k.box(sx * (13.4 + flen * 0.5), fy, -0.05, flen, 0.32, 0.38);
      }
      // Angled thumb
      k.strut([sx * 12.5, AY + 0.55, -0.15], [sx * 13.3, AY + 1.15, -0.25], 0.34);
      // Sleeve cuff inner shadow recess
      k.color(STONE_DK).box(sx * 11.92, AY - 0.85, -0.05, 0.18, 1.85, 0.95);
    }
    // hanging sleeve: Art Deco pleated drape under the arm
    k.color(STONE_SH);
    k.push().rotateX(Math.PI / 2);
    const dr = [[2.2, -(AY - 0.6)], [11.6, -(AY - 0.7)], [11.2, -(AY - 1.9)], [9.4, -(AY - 3.4)], [7.0, -(AY - 4.3)], [4.6, -(AY - 5.4)], [2.2, -(AY - 6.4)]]
      .map(([x, y]) => [sx * x, y]);
    k.extrude(dr, -0.55, 1.1);
    k.pop();
    if (hi) {
      // Vertical pleat ribs along the hanging sleeve
      k.color(STONE_DK);
      for (const px of [3.8, 5.8, 7.8, 9.8]) {
        const pyBot = AY - 6.2 + (px - 2.2) * 0.42;
        k.box(sx * px, pyBot, 0, 0.25, AY - 0.8 - pyBot, 1.18);
      }
    }
    k.pop();
  }
  if (!hi) { k.glow(false); return; }
  // Deep Art Deco vertical tunic flutes front and back + diagonal mantle sash across the chest & back
  k.color(STONE_SH);
  for (const z of [-1, 1]) {
    for (const [x, h, w] of [[-1.85, 12.0, 0.32], [-1.35, 15.5, 0.34], [-0.85, 20.5, 0.3], [-0.3, 21.8, 0.28], [0.3, 21.8, 0.28], [0.85, 20.5, 0.3], [1.35, 15.5, 0.34], [1.85, 12.0, 0.32]]) {
      const zz = z * (Math.sqrt(Math.max(0, 6.2 - x * x)) * 0.6 + 0.04);
      k.box(x, BASE + 0.4, zz, w, h, 0.28);
    }
  }
  // Diagonal mantle (toga) draped over left shoulder (-X) across chest to right hip (+X)
  k.color(STONE);
  k.pipe([-2.3, SH - 0.2, -1.25], [2.1, BASE + 17.5, -1.55], 0.58, 8);
  k.color(STONE_SH).pipe([-2.1, SH - 1.4, -1.35], [2.2, BASE + 15.8, -1.52], 0.48, 8);
  // Waist cord belt & hanging tassel ends
  k.color(STONE_DK);
  k.push().scale(1, 1, 0.62);
  k.lathe(0, BASE + 18.4, 0, [[2.74, 0], [2.74, 0.45]], 24, { caps: false });
  k.pop();
  k.box(0.7, BASE + 13.0, -1.65, 0.26, 5.4, 0.22).box(0.98, BASE + 14.2, -1.63, 0.22, 4.2, 0.2);
  // Sculpted Sacred Heart (Coração de Jesus) in high relief on the chest with cross & flame
  k.color(HEART);
  k.sphere(-0.45, SH - 2.65, -1.78, 0.46, 10, 8, 1.15);
  k.box(-0.45, SH - 2.1, -1.82, 0.14, 0.45, 0.14).box(-0.45, SH - 1.95, -1.82, 0.36, 0.12, 0.14);
  // Sandaled feet peeking under the tunic hem
  k.color(STONE).box(-0.65, BASE, -1.65, 0.72, 0.5, 0.75).box(0.65, BASE, -1.65, 0.72, 0.5, 0.75);
  k.glow(false);
}

export function build(k) {
  summit(k);
  pedestal(k);
  statue(k);
}
