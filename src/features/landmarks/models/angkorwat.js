// feature/famous-landmarks: Angkor Wat, Siem Reap — 1:1 (central tower 65 m above the court).
// The temple-mountain proper inside the moat: the Western Sandstone Causeway with 7-headed Naga serpent
// balustrades & guardian lions, North & South Reflecting Ponds, Twin Cruciform Libraries in the outer court,
// the third gallery enclosure (187 x 215 m) with balustered windows & Khmer bas-reliefs, the raised second
// gallery, and the steep Bakan terrace carrying the quincunx of five lotus-bud prangs with golden Trisula finials.
const STONE = 0x948b7c, STONE_DK = 0x776f62, STONE_LT = 0xa79e8d, LICHEN = 0x6a665a, LATERITE = 0x8a6a4f;
const ROOF = 0x7d776c, DARK = 0x3c3832, LAMP = 0xffc77a, COURT = 0x8e9a62, WATER = 0x3b6e7c, GOLD = 0xd6ad46;

export const lodDist = 1800;
export const glowStrength = 0.9;

const Y2 = 6;    // second-gallery terrace top
const Y1 = 19;   // Bakan terrace top

export const colliders = [
  { x: 0, z: -101, hw: 94, hd: 4, h: 8 }, { x: 0, z: 107, hw: 94, hd: 4, h: 8 },
  { x: -93, z: 3, hw: 4, hd: 104, h: 8 }, { x: 93, z: 3, hw: 4, hd: 104, h: 8 },
  { x: 0, z: 0, hw: 52, hd: 58, h: Y2 + 6 },
  { x: 0, z: 0, hw: 36, hd: 36, h: Y1 + 5 },
  { x: 0, z: 0, r: 9, h: 62 },
  { x: -26, z: -26, r: 6, h: 52 }, { x: 26, z: -26, r: 6, h: 52 }, { x: -26, z: 26, r: 6, h: 52 }, { x: 26, z: 26, r: 6, h: 52 },
  { x: 0, z: -118, hw: 30, hd: 8, h: 14 },
];

/** Lotus-bud prang: cella w wide from y0, total height h, with antefix gables & golden Trisula finial. */
function prang(k, x, y0, z, w, h) {
  const hi = k.hi;
  const seg = 8, ph = Math.PI / 8;
  const cella = h * 0.27;
  k.color(STONE).box(x, y0, z, w, cella, w);
  // redented corners & projecting axial porches with Khmer pediment gables
  if (hi) {
    k.color(STONE_LT);
    for (const [dx, dz, ww, dd] of [[0, -w / 2, w * 0.55, 1.2], [0, w / 2, w * 0.55, 1.2], [-w / 2, 0, 1.2, w * 0.55], [w / 2, 0, 1.2, w * 0.55]]) {
      k.box(x + dx, y0, z + dz, ww, cella + 1.2, dd);
      k.color(STONE_DK).taper(x + dx, y0 + cella + 1.2, z + dz, ww + 0.4, dd + 0.4, ww * 0.25, dd * 0.25, 2.2).color(STONE_LT);
    }
    k.color(DARK);
    for (const [dx, dz, ww, dd] of [[0, -w / 2 - 0.62, w * 0.18, 0.1], [0, w / 2 + 0.62, w * 0.18, 0.1], [-w / 2 - 0.62, 0, 0.1, w * 0.18], [w / 2 + 0.62, 0, 0.1, w * 0.18]]) {
      k.box(x + dx, y0 + 1, z + dz, ww, cella * 0.55, dd);
    }
  }
  // bud: stacked receding tiers with a bulging lotus silhouette & corner antefix spires
  const b0 = y0 + cella, bh = h - cella;
  const R = w * 0.68;
  const tiers = hi ? 9 : 4;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1) / tiers;
    const r = (t) => R * (1 + 0.18 * Math.sin(Math.min(1, t * 2.2) * Math.PI)) * Math.pow(1 - t, 0.85) + 0.3;
    k.color(i % 2 ? STONE : STONE_DK);
    k.lathe(x, b0 + bh * t0, z, [[r(t0) * 1.04, 0], [r(t0) * 0.98, bh * (t1 - t0) * 0.7], [r(t1) * 1.02, bh * (t1 - t0)]], seg, { phase: ph, smooth: false });
    if (hi && i < 6) {
      // Carved Khmer antefix flame-gables on the 4 cardinal faces of each prang tier
      const rt = r(t0) * 0.96, ty = b0 + bh * t0;
      k.color(STONE_LT);
      for (const [ax, az] of [[0, -rt], [0, rt], [-rt, 0], [rt, 0]]) {
        k.cone(x + ax, ty, z + az, 0.55, bh * (t1 - t0) * 0.95, 4);
      }
    }
  }
  k.color(LICHEN).cyl(x, y0 + h - 1.2, z, 0.9, 0.2, 2.2, 6);
  if (hi) {
    // Golden Trisula (sacred trident) finial at the apex of each prang
    k.glow(true).color(GOLD).cyl(x, y0 + h + 0.8, z, 0.12, 0.04, 1.8, 5);
    k.box(x, y0 + h + 1.4, z, 0.75, 0.12, 0.12).glow(false);
  }
}

/**
 * Rectangular gallery enclosure (half extents hx, hz) on level y0: vaulted roof on columns outside a
 * solid inner wall, with cruciform corner pavilions & axial gopura entrances.
 */
function enclosure(k, hx, hz, y0, wd, h, pav) {
  const hi = k.hi;
  const sides = [
    [-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz],
  ];
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    k.push().translate(mx, y0, mz).rotateY(Math.atan2(ux, uz));
    // in this frame: z along the side, +x = (uz, -ux) points out of the enclosure
    k.color(STONE).box(-wd * 0.35, 0, 0, wd * 0.3, h, len);                 // solid inner wall
    k.color(STONE_DK).taper(0, h, 0, wd + 1.2, len + 1.2, 1.0, len + 1.2, h * 0.55); // corbelled vault roof
    k.color(ROOF).box(0, h - 0.4, 0, wd + 1.4, 0.6, len + 1.4);
    if (hi) {
      // Ridge cresting along the vaulted gallery roof
      k.color(STONE_LT).box(0, h + h * 0.55, 0, 0.45, 0.42, len + 0.8);
      const n = Math.floor(len / 3.2);
      for (let i = 0; i <= n; i++) {
        const pz = -len / 2 + (i * len) / n;
        k.color(STONE_LT).box(wd * 0.45, 0, pz, 0.8, h - 0.4, 0.8);
        // Outer low half-vault verifier aisle columns on the 3rd gallery
        if (pav && i % 2 === 0) {
          k.color(STONE_DK).box(wd * 0.82, 0, pz, 0.55, h * 0.68, 0.55);
        }
      }
      if (pav) {
        k.color(ROOF).taper(wd * 0.62, h * 0.68, 0, wd * 0.48, len + 1.0, 0.4, len + 1.0, h * 0.28);
      }
      k.color(DARK).box(-wd * 0.19, 0.6, 0, 0.1, h - 1.6, len - 2);  // shadowed Churning of the Ocean of Milk bas-relief wall
    } else {
      k.color(STONE_LT).box(wd * 0.45, 0, 0, 0.6, h - 0.4, len);
    }
    k.pop();
  }
  if (pav) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * hx, pz = sz * hz;
        k.color(STONE).box(px, y0, pz, wd * 2.2, h + 1.5, wd * 1.2).box(px, y0, pz, wd * 1.2, h + 1.5, wd * 2.2);
        for (let t = 0; t < (hi ? 4 : 2); t++) {
          const s = 1 - t * 0.2;
          k.color(t % 2 ? STONE_DK : ROOF).taper(px, y0 + h + 1.5 + t * 2.4, pz, wd * 2.2 * s, wd * 1.2 * s, wd * 2.0 * s, wd * 1.0 * s, 2.4);
          k.taper(px, y0 + h + 1.5 + t * 2.4, pz, wd * 1.2 * s, wd * 2.2 * s, wd * 1.0 * s, wd * 2.0 * s, 2.4);
        }
      }
    }
  }
}

/** Stepped terrace with stairways & carved stair cheek walls in the middle of each side. */
function terrace(k, hw, hd, y0, h, steps, stairW) {
  const hi = k.hi;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    k.color(i % 2 ? LATERITE : STONE_DK).box(0, y0 + h * f, 0, 2 * (hw - f * 3.5), h / steps, 2 * (hd - f * 3.5));
  }
  // steep stairs on all four sides
  const sw = stairW;
  for (const [dx, dz, w, d] of [[0, -hd - 3, sw, 6], [0, hd + 3, sw, 6], [-hw - 3, 0, 6, sw], [hw + 3, 0, 6, sw]]) {
    k.color(STONE).taper(dx, y0, dz, w, d, w * 0.9, d * 0.15, h, -dx * 0.06, -dz * 0.06);
    if (hi && dx === 0) {
      // Guardian Khmer lion statues flanking the Western & Eastern stair bases
      for (const lx of [-w * 0.52, w * 0.52]) {
        k.color(STONE_LT).box(lx, y0, dz + (dz < 0 ? -2.8 : 2.8), 0.95, 1.45, 1.25);
        k.sphere(lx, y0 + 1.65, dz + (dz < 0 ? -3.1 : 3.1), 0.42, 6, 5);
      }
    }
  }
}

export function build(k) {
  const hi = k.hi;
  // grassy court inside the third-gallery plinth
  k.color(COURT).box(0, 0, 3, 194, 1.2, 216);
  // third gallery (bas-reliefs), 187 x 215 m
  k.push().translate(0, 0, 3);
  enclosure(k, 93.5, 107.5, 1.2, 6.5, 6.2, true);
  k.pop();
  // western entrance: triple gopura with tiered roofs + cruciform cloister (Preah Poan / Hall of a Thousand Gods)
  for (const [x, w, h] of [[0, 26, 11], [-22, 12, 9], [22, 12, 9]]) {
    k.color(STONE).box(x, 0, -104.5, w, h, 12);
    k.color(STONE_DK).taper(x, h, -104.5, w + 1, 13, w * 0.5, 6, 3);
    if (x === 0) prang(k, x, h + 3, -104.5, 7, 14);
    else if (hi) prang(k, x, h + 2.5, -104.5, 4.8, 9.5);
  }
  // Western Causeway Terrace with Naga Serpent Balustrades, Twin Reflecting Ponds & Twin Libraries
  k.color(STONE).box(0, 1.2, -124, 11, 1.2, 30);
  if (hi) {
    // 7-Headed Naga Serpent Balustrades & Naga-hood fans flanking the Western Causeway
    for (const sx of [-5.2, 5.2]) {
      k.color(STONE_LT).box(sx, 2.4, -124, 0.65, 0.75, 29.5);
      // Multi-headed Naga fan hood rising at the West end of the causeway
      k.color(STONE_DK).cyl(sx, 3.4, -138.8, 1.35, 0.45, 0.55, 8);
      for (let h = -3; h <= 3; h++) {
        const a = h * 0.24;
        k.color(STONE_LT).strut([sx, 2.8, -138.8], [sx + Math.sin(a) * 1.35, 3.9 + Math.cos(a) * 0.45, -139.1], 0.22);
      }
    }
    // Iconic North & South Sunrise Reflecting Ponds in front of the Western Gallery
    for (const sx of [-38, 38]) {
      k.color(LATERITE).box(sx, 0.1, -122, 26, 0.45, 18);
      k.glow(true).color(WATER).box(sx, 0.56, -122, 24.4, 0.12, 16.4).glow(false);
    }
    // Twin Cruciform Libraries on stepped plinths flanking the inner causeway between 3rd and 2nd galleries
    for (const sx of [-28, 28]) {
      const lz = -78;
      k.color(LATERITE).box(sx, 1.2, lz, 18, 2.2, 14);
      k.color(STONE).box(sx, 3.4, lz, 14, 4.8, 8).box(sx, 3.4, lz, 8, 4.8, 14);
      k.color(STONE_DK).taper(sx, 8.2, lz, 14.8, 8.6, 14.8, 1.2, 2.8).taper(sx, 8.2, lz, 8.6, 14.8, 1.2, 14.8, 2.8);
    }
  }
  // cruciform cloister (Preah Poan) between the third and second galleries
  k.color(STONE).box(0, 1.2, -70, 40, 6, 9).box(0, 1.2, -70, 9, 6, 40);
  k.color(STONE_DK).taper(0, 7.2, -70, 41, 10, 41, 1.5, 3).taper(0, 7.2, -70, 10, 41, 1.5, 41, 3);
  // second gallery on its terrace (100 x 115 m)
  terrace(k, 52, 59, 0, Y2, hi ? 4 : 1, 10);
  enclosure(k, 50, 57, Y2, 5, 5.5, true);
  // Bakan: steep 13 m terrace with the top gallery and the five towers
  terrace(k, 36, 36, Y2, Y1 - Y2, hi ? 7 : 2, 7);
  enclosure(k, 30, 30, Y1, 4, 4.8, false);
  // cross galleries joining the central tower to the gallery mid-points
  k.color(STONE).box(0, Y1, 0, 4, 4.8, 60).box(0, Y1, 0, 60, 4.8, 4);
  k.color(STONE_DK).taper(0, Y1 + 4.8, 0, 5, 61, 1, 61, 2.4).taper(0, Y1 + 4.8, 0, 61, 5, 61, 1, 2.4);
  // quincunx: four corner towers + central tower
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prang(k, sx * 30, Y1, sz * 30, 9, 33);
  prang(k, 0, Y1 + 1, 0, 14, 45);
  // warm lamps on the western causeway landing (night)
  if (hi) {
    k.glow(true).color(LAMP);
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) k.box(sx * 5.2, 3.2, -135 + i * 4.5, 0.4, 0.6, 0.4);
    k.glow(false);
  }
}
