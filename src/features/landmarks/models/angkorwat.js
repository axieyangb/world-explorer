// feature/famous-landmarks: Angkor Wat, Siem Reap — 1:1 (central tower 65 m above the court).
// The temple-mountain proper inside the moat: the third gallery enclosure (187 x 215 m) of the bas-
// reliefs with cruciform corner pavilions and the triple western entrance, the raised second gallery,
// and the steep Bakan terrace carrying the quincunx of five lotus-bud prangs — four corner towers and
// the tall central sanctuary tower. Grey sandstone over laterite. Faces west (front, -Z).
const STONE = 0x948b7c, STONE_DK = 0x776f62, STONE_LT = 0xa79e8d, LICHEN = 0x6a665a, LATERITE = 0x8a6a4f;
const ROOF = 0x7d776c, DARK = 0x3c3832, LAMP = 0xffc77a, COURT = 0x8e9a62;

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

/** Lotus-bud prang: cella w wide from y0, total height h. */
function prang(k, x, y0, z, w, h) {
  const hi = k.hi;
  const seg = 8, ph = Math.PI / 8;
  const cella = h * 0.27;
  k.color(STONE).box(x, y0, z, w, cella, w);
  // redented corners: offset slabs on each face
  if (hi) {
    k.color(STONE_LT);
    for (const [dx, dz, ww, dd] of [[0, -w / 2, w * 0.55, 1.2], [0, w / 2, w * 0.55, 1.2], [-w / 2, 0, 1.2, w * 0.55], [w / 2, 0, 1.2, w * 0.55]]) {
      k.box(x + dx, y0, z + dz, ww, cella + 1.2, dd);
    }
    k.color(DARK);
    for (const [dx, dz, ww, dd] of [[0, -w / 2 - 0.62, w * 0.18, 0.1], [0, w / 2 + 0.62, w * 0.18, 0.1], [-w / 2 - 0.62, 0, 0.1, w * 0.18], [w / 2 + 0.62, 0, 0.1, w * 0.18]]) {
      k.box(x + dx, y0 + 1, z + dz, ww, cella * 0.55, dd);
    }
  }
  // bud: stacked receding tiers with a bulging silhouette
  const b0 = y0 + cella, bh = h - cella;
  const R = w * 0.68;
  const tiers = hi ? 9 : 4;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1) / tiers;
    const r = (t) => R * (1 + 0.18 * Math.sin(Math.min(1, t * 2.2) * Math.PI)) * Math.pow(1 - t, 0.85) + 0.3;
    k.color(i % 2 ? STONE : STONE_DK);
    k.lathe(x, b0 + bh * t0, z, [[r(t0) * 1.04, 0], [r(t0) * 0.98, bh * (t1 - t0) * 0.7], [r(t1) * 1.02, bh * (t1 - t0)]], seg, { phase: ph, smooth: false });
  }
  k.color(LICHEN).cyl(x, y0 + h - 1.2, z, 0.9, 0.2, 2.2, 6);
}

/**
 * Rectangular gallery enclosure (half extents hx, hz) on level y0: vaulted roof on columns outside a
 * solid inner wall, with cruciform corner pavilions (tiered roofs).
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
    k.color(STONE_DK).taper(0, h, 0, wd + 1.2, len + 1.2, 1.0, len + 1.2, h * 0.55); // vault roof
    k.color(ROOF).box(0, h - 0.4, 0, wd + 1.4, 0.6, len + 1.4);
    if (hi) {
      k.color(STONE_LT);
      const n = Math.floor(len / 3.2);
      for (let i = 0; i <= n; i++) k.box(wd * 0.45, 0, -len / 2 + (i * len) / n, 0.8, h - 0.4, 0.8);
      k.color(DARK).box(-wd * 0.19, 0.6, 0, 0.1, h - 1.6, len - 2);  // shadowed bas-relief wall
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

/** Stepped terrace with stairways in the middle of each side. */
function terrace(k, hw, hd, y0, h, steps, stairW) {
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    k.color(i % 2 ? LATERITE : STONE_DK).box(0, y0 + h * f, 0, 2 * (hw - f * 3.5), h / steps, 2 * (hd - f * 3.5));
  }
  // steep stairs on all four sides
  const sw = stairW;
  for (const [dx, dz, w, d] of [[0, -hd - 3, sw, 6], [0, hd + 3, sw, 6], [-hw - 3, 0, 6, sw], [hw + 3, 0, 6, sw]]) {
    k.color(STONE).taper(dx, y0, dz, w, d, w * 0.9, d * 0.15, h, -dx * 0.06, -dz * 0.06);
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
  // western entrance: triple gopura with tiered roofs + cruciform cloister
  for (const [x, w, h] of [[0, 26, 11], [-22, 12, 9], [22, 12, 9]]) {
    k.color(STONE).box(x, 0, -104.5, w, h, 12);
    k.color(STONE_DK).taper(x, h, -104.5, w + 1, 13, w * 0.5, 6, 3);
    if (x === 0) prang(k, x, h + 3, -104.5, 7, 14);
  }
  k.color(STONE).box(0, 1.2, -117, 9, 0.8, 16);
  // cruciform cloister between the third and second galleries
  k.color(STONE).box(0, 1.2, -70, 40, 6, 9).box(0, 1.2, -70, 9, 6, 40);
  k.color(STONE_DK).taper(0, 7.2, -70, 41, 10, 41, 1.5, 3).taper(0, 7.2, -70, 10, 41, 1.5, 41, 3);
  // second gallery on its terrace (100 x 115 m)
  terrace(k, 52, 59, 0, Y2, hi ? 3 : 1, 10);
  enclosure(k, 50, 57, Y2, 5, 5.5, true);
  // Bakan: steep 13 m terrace with the top gallery and the five towers
  terrace(k, 36, 36, Y2, Y1 - Y2, hi ? 6 : 2, 7);
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
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) k.box(sx * 6, 2.0, -120 + i * 4, 0.4, 0.6, 0.4);
    k.glow(false);
  }
}
