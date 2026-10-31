// feature/famous-landmarks: Oriental Pearl Tower, Shanghai — 1:1 (468 m).
// Three 9 m concrete columns + three inclined 7 m legs, central glazed high-speed elevator tube,
// lower sphere (50 m dia, centre ~93 m) with geodesic triangular cladding ribs, five small "space hotel"
// spheres with K-braced connecting rings, upper sphere (45 m dia, centre ~263 m) with the 259 m
// cantilevered transparent Glass-Bottom Skywalk ring, single shaft to the space-module sphere (~350 m)
// and the stepped antenna mast, atop the Shanghai History Museum colonnaded base plinth.
const COL = 0xd6d3cf, COL_DK = 0xb5b1ac, PINK = 0xc8427e, PINK_LT = 0xe07aa6, BAND = 0x8a8f96, LIT = 0xffd0e6, MAST = 0xcfd2d6;
const GLASS_SKY = 0x9ce2f4;

export const lodDist = 1800;
export const glowStrength = 1.6;

export const colliders = [
  { x: 0, z: 0, r: 16, h: 68 },
  { x: 0, z: 0, r: 25, h: 118 },
  { x: 0, z: 0, r: 15.5, h: 240 },
  { x: 0, z: 0, r: 22.5, h: 286 },
  { x: 0, z: 0, r: 7.5, h: 358 },
  { x: 0, z: 0, r: 2.5, h: 468 },
];

const SEG = (k) => (k.hi ? 28 : 12);

function pinkSphere(k, y, r, rings) {
  // glassy pink sphere with dark horizontal mullion bands and meridian seam ribs
  const seg = SEG(k);
  k.glow(true).color(PINK).sphere(0, y, 0, r, seg, rings);
  k.glow(false);
  if (k.hi) {
    k.color(BAND);
    for (const f of [-0.68, -0.4, -0.15, 0.15, 0.4, 0.68]) {
      const yy = y + f * r, rr = Math.sqrt(Math.max(0, r * r - (f * r) ** 2)) + 0.15;
      k.lathe(0, yy - 0.32, 0, [[rr, 0], [rr, 0.64]], seg, { caps: false });
    }
    // Geodesic meridian ribs on the main spheres (r >= 20)
    if (r >= 20) {
      for (let m = 0; m < 12; m++) {
        const a = (m / 12) * Math.PI * 2;
        const pts = [];
        for (let s = -4; s <= 4; s++) {
          const ph = (s / 5) * (Math.PI / 2);
          const rr = (r + 0.18) * Math.cos(ph), yy = y + (r + 0.18) * Math.sin(ph);
          pts.push([Math.cos(a) * rr, yy, Math.sin(a) * rr]);
        }
        k.color(COL).tube(pts, 0.22, 4);
      }
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const seg = SEG(k);
  // three vertical columns, ground -> 285 m
  k.color(COL);
  const cols = [0, 1, 2].map((i) => -Math.PI / 2 + (i * 2 * Math.PI) / 3);
  for (const a of cols) k.cyl(Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5, 4.5, 4.5, 285, hi ? 16 : 6);
  // Central vertical transparent high-speed elevator shaft (y = 5 .. 260 m)
  if (hi) {
    k.color(BAND).cyl(0, 5, 0, 2.4, 2.4, 255, 12);
    k.glow(true).color(LIT);
    for (let y = 18; y < 66; y += 8) k.cyl(0, y, 0, 2.52, 2.52, 2.5, 10);
    k.glow(false);
  }
  // three inclined legs reaching the lower sphere
  for (const a0 of cols) {
    const a = a0 + Math.PI / 3;
    k.color(COL).pipe([Math.cos(a) * 40, 0, Math.sin(a) * 40], [Math.cos(a) * 11, 76, Math.sin(a) * 11], 3.5, hi ? 12 : 6);
    if (hi) {
      k.color(COL_DK).cyl(Math.cos(a) * 40, 0, Math.sin(a) * 40, 5.8, 4.4, 4.2, 12);
      // Joint collar rings along the 7 m inclined legs
      for (const f of [0.25, 0.5, 0.75]) {
        const lx = Math.cos(a) * (40 - 29 * f), ly = 76 * f, lz = Math.sin(a) * (40 - 29 * f);
        k.sphere(lx, ly, lz, 3.85, 8, 5);
      }
      k.color(COL);
    }
  }
  // connecting rings between columns + diagonal steel cross-bracing
  if (hi) {
    const ringYs = [30, 52, 135, 150, 165, 180, 195, 210, 225];
    for (const y of ringYs) {
      k.color(COL_DK).lathe(0, y, 0, [[15.6, 0], [15.6, 2.2]], 3, { caps: false, phase: -Math.PI / 2 });
      // Radial tie beams to central elevator core
      for (const a of cols) {
        k.strut([0, y + 1.1, 0], [Math.cos(a) * 10.5, y + 1.1, Math.sin(a) * 10.5], 0.85);
      }
    }
    k.color(COL);
  }
  // base plinth (Shanghai Municipal History Museum rotunda with radial stairs & colonnade)
  k.color(0xc8c4bc).cyl(0, 0, 0, 32, 29, 5.5, hi ? 36 : 12);
  if (hi) {
    // Museum colonnade & radial ceremonial grand staircases between the 3 inclined legs
    k.color(COL).cyl(0, 5.5, 0, 27, 25, 3.2, 36);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.color(COL_DK).cyl(Math.cos(a) * 28.5, 0, Math.sin(a) * 28.5, 0.42, 0.42, 5.5, 6);
    }
    for (const a of cols) {
      k.push().rotateY(-a - Math.PI / 2);
      for (let s = 0; s < 5; s++) {
        k.color(s % 2 ? COL : COL_DK).box(0, 0, -31.5 - s * 1.4, 11.0, 5.5 - s * 1.0, 1.5);
      }
      k.pop();
    }
    k.glow(true).color(PINK_LT);
    for (const a of cols) k.sphere(Math.cos(a + Math.PI / 3) * 20, 5.5, Math.sin(a + Math.PI / 3) * 20, 4.5, 14, 7, 1, 0.5);
    k.glow(false);
  }
  // lower sphere (50 m dia, 68-118 m) + sightseeing deck ring at equator (90 m)
  pinkSphere(k, 93, 25, hi ? 16 : 8);
  if (hi) {
    k.glow(true).color(LIT).lathe(0, 91.5, 0, [[25.3, 0], [25.3, 3.0]], seg, { caps: false }).glow(false);
  }
  // five small space-hotel spheres between the big ones
  for (let i = 0; i < 5; i++) {
    const y = 140 + i * 18;
    const a = cols[i % 3] + Math.PI / 3;
    pinkSphere(k, y, 5.5, hi ? 8 : 4);
    if (!hi) continue;
    for (const ac of cols) {
      k.color(COL_DK).pipe([0, y, 0], [Math.cos(ac) * 10.5, y, Math.sin(ac) * 10.5], 1.1, 6);
    }
    k.color(COL_DK).pipe([0, y, 0], [Math.cos(a) * 10.5, y, Math.sin(a) * 10.5], 1.2, 6);
  }
  // upper sphere (45 m dia, centre 263 m) with its observation deck ring (263 m) & 259 m Transparent Glass Skywalk
  pinkSphere(k, 263, 22.5, hi ? 16 : 8);
  k.glow(true).color(LIT).lathe(0, 262, 0, [[22.8, 0], [22.8, 3]], seg, { caps: false });
  k.glow(false);
  if (hi) {
    // Iconic 259 m Cantilevered Transparent Glass-Bottom Skywalk Ring + Radial Steel Outrigger Brackets
    k.glow(true).color(GLASS_SKY).cyl(0, 258.5, 0, 24.4, 24.4, 0.35, seg);
    k.lathe(0, 258.85, 0, [[24.4, 0], [24.4, 1.2]], seg, { caps: false });
    k.glow(false);
    k.color(BAND);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.strut([Math.cos(a) * 21.8, 257.2, Math.sin(a) * 21.8], [Math.cos(a) * 24.4, 258.6, Math.sin(a) * 24.4], 0.22);
    }
  }
  // single shaft to the space module
  k.color(COL).cyl(0, 283, 0, 6, 5, 60, hi ? 16 : 8);
  if (hi) {
    // Vertical structural ribs up the upper single shaft
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.color(COL_DK).strut([Math.cos(a) * 6.05, 284, Math.sin(a) * 6.05], [Math.cos(a) * 5.05, 342, Math.sin(a) * 5.05], 0.35);
    }
  }
  // space module sphere (~14 m dia, 350 m)
  pinkSphere(k, 350, 7.5, hi ? 10 : 5);
  // stepped antenna mast (356 .. 468 m)
  k.color(MAST);
  k.cyl(0, 356, 0, 3.2, 3.0, 30, hi ? 10 : 5);
  k.cyl(0, 386, 0, 2.6, 2.2, 32, hi ? 10 : 5);
  k.cyl(0, 418, 0, 1.6, 1.2, 28, hi ? 8 : 4);
  k.cyl(0, 446, 0, 0.9, 0.3, 22, hi ? 6 : 4);
  if (hi) {
    k.color(COL_DK);
    for (const y of [370, 386, 402, 418, 432, 446]) k.cyl(0, y - 0.8, 0, 3.4 - (y - 370) * 0.02, 3.4 - (y - 370) * 0.02, 0.8, 10);
    k.glow(true).color(0xff3020);
    for (const y of [400, 430, 467.4]) k.sphere(0, y, 0, y > 460 ? 0.6 : 1.6, 6, 3);
    k.glow(false);
  }
}

/** Magenta night tint for the glowing spheres. */
export function setup({ mats }) {
  if (mats && mats.glow) mats.glow.emissive.setHex(0xff9ad0);
  return null;
}
