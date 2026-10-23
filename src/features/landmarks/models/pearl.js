// feature/famous-landmarks: Oriental Pearl Tower, Shanghai — 1:1 (468 m).
// Three 9 m concrete columns + three inclined 7 m legs, lower sphere (50 m dia, centre ~93 m),
// five small "space hotel" spheres, upper sphere (45 m dia, centre ~263 m), single shaft to the
// space-module sphere (~350 m) and the stepped antenna mast. Pink/magenta spheres glow at night.
const COL = 0xd6d3cf, COL_DK = 0xb5b1ac, PINK = 0xc8427e, PINK_LT = 0xe07aa6, BAND = 0x8a8f96, LIT = 0xffd0e6, MAST = 0xcfd2d6;

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
  // glassy pink sphere with dark horizontal mullion bands
  const seg = SEG(k);
  k.glow(true).color(PINK).sphere(0, y, 0, r, seg, rings);
  k.glow(false);
  if (k.hi) {
    k.color(BAND);
    for (const f of [-0.55, -0.2, 0.2, 0.55]) {
      const yy = y + f * r, rr = Math.sqrt(r * r - (f * r) ** 2) + 0.15;
      k.lathe(0, yy - 0.35, 0, [[rr, 0], [rr, 0.7]], seg, { caps: false });
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const seg = SEG(k);
  // three vertical columns, ground -> 285 m
  k.color(COL);
  const cols = [0, 1, 2].map((i) => -Math.PI / 2 + (i * 2 * Math.PI) / 3);
  for (const a of cols) k.cyl(Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5, 4.5, 4.5, 285, hi ? 14 : 6);
  // three inclined legs reaching the lower sphere
  for (const a0 of cols) {
    const a = a0 + Math.PI / 3;
    k.pipe([Math.cos(a) * 40, 0, Math.sin(a) * 40], [Math.cos(a) * 11, 76, Math.sin(a) * 11], 3.5, hi ? 12 : 6);
    if (hi) k.color(COL_DK).cyl(Math.cos(a) * 40, 0, Math.sin(a) * 40, 5, 4.2, 3, 12).color(COL);
  }
  // connecting rings between columns
  if (hi) {
    k.color(COL_DK);
    for (const y of [30, 135, 150, 165, 180, 195, 210, 225]) k.lathe(0, y, 0, [[15.6, 0], [15.6, 2]], 3, { caps: false, phase: -Math.PI / 2 });
    k.color(COL);
  }
  // base plinth
  k.color(0xc8c4bc).cyl(0, 0, 0, 30, 28, 5, hi ? 32 : 12);
  if (hi) {
    k.glow(true).color(PINK_LT);
    for (const a of cols) k.sphere(Math.cos(a + Math.PI / 3) * 20, 5, Math.sin(a + Math.PI / 3) * 20, 4.5, 14, 7, 1, 0.5);
    k.glow(false);
  }
  // lower sphere (50 m dia, 68-118 m)
  pinkSphere(k, 93, 25, hi ? 16 : 8);
  // five small space-hotel spheres between the big ones
  for (let i = 0; i < 5; i++) {
    const y = 140 + i * 18;
    const a = cols[i % 3] + Math.PI / 3;
    pinkSphere(k, y, 5.5, hi ? 8 : 4);
    if (!hi) continue;
    k.color(COL_DK).pipe([0, y, 0], [Math.cos(a) * 10.5, y, Math.sin(a) * 10.5], 1.2, 6);
  }
  // upper sphere (45 m dia, centre 263 m) with its observation deck ring
  pinkSphere(k, 263, 22.5, hi ? 16 : 8);
  k.glow(true).color(LIT).lathe(0, 262, 0, [[22.8, 0], [22.8, 3]], seg, { caps: false });
  k.glow(false);
  // single shaft to the space module
  k.color(COL).cyl(0, 283, 0, 6, 5, 60, hi ? 16 : 8);
  // space module sphere (~14 m dia)
  pinkSphere(k, 350, 7.5, hi ? 10 : 5);
  // stepped antenna mast
  k.color(MAST);
  k.cyl(0, 356, 0, 3.2, 3.0, 30, hi ? 10 : 5);
  k.cyl(0, 386, 0, 2.6, 2.2, 32, hi ? 10 : 5);
  k.cyl(0, 418, 0, 1.6, 1.2, 28, hi ? 8 : 4);
  k.cyl(0, 446, 0, 0.9, 0.3, 22, hi ? 6 : 4);
  if (hi) {
    k.color(COL_DK);
    for (const y of [386, 418, 446]) k.cyl(0, y - 1, 0, 3.4, 3.4, 1, 10);
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
