// feature/famous-landmarks: Gateway of India, Mumbai — 1:1 (26 m; corner turrets ~28 m).
// Indo-Saracenic triumphal arch in honey-yellow basalt on the Apollo Bunder waterfront: the 20 m square
// central block pierced by the great pointed arch (front and back) under a pierced-stone parapet, four
// octagonal corner turrets with cupolas, the low central dome behind the parapet, and the two lower
// side wings with their own arched loggias. Front (-Z) faces the harbour (SE). Floodlit at night.
const STONE = 0xcfae78, STONE_DK = 0xae8d5b, STONE_LT = 0xdcc092, SHADOW = 0x4f4232, JALI = 0x8f7550, PAVE = 0xb9ad98;
const WARM = 0xffe0a8;

export const lodDist = 1100;
export const glowStrength = 0.4;

const CH = 22.5;   // central block parapet base
const WH = 16;     // wing roof

export const colliders = [
  { x: -6, z: 0, hw: 4, hd: 10, h: CH + 3 }, { x: 6, z: 0, hw: 4, hd: 10, h: CH + 3 },
  { x: 0, z: 0, hw: 10, hd: 10, h: CH + 3, }, // roof (walk-over)
  { x: -16.8, z: 0, hw: 6.8, hd: 7, h: WH + 2 }, { x: 16.8, z: 0, hw: 6.8, hd: 7, h: WH + 2 },
];

/** Pointed arch opening (dark recess) on a face at z, centred x, from y0, width w, total height h. */
function arch(k, x, y0, z, w, h, col, dz = -1) {
  const spring = h - w * 0.62, hw = w / 2;
  const n = k.hi ? 6 : 2;
  k.color(col);
  const Q = (a, b, c, d) => (dz > 0 ? k.quad(a, b, c, d) : k.quad(d, c, b, a));
  Q([x - hw, y0, z], [x + hw, y0, z], [x + hw, y0 + spring, z], [x - hw, y0 + spring, z]);
  let prev = [hw, spring];
  for (let i = 1; i <= n; i++) {
    const t = i / n, a = t * (Math.PI / 2);
    const cur = i === n ? [0, h] : [hw * Math.cos(a) * (1 - 0.35 * t), spring + (h - spring) * Math.sin(a)];
    Q([x - prev[0], y0 + prev[1], z], [x + prev[0], y0 + prev[1], z], [x + cur[0], y0 + cur[1], z], [x - cur[0], y0 + cur[1], z]);
    prev = cur;
  }
}

function turret(k, x, z) {
  const hi = k.hi, seg = hi ? 8 : 6;
  k.glow(true).color(STONE_LT).cyl(x, 0, z, 1.9, 1.9, CH + 1.5, 8, { phase: Math.PI / 8, smooth: false }).glow(false);
  if (hi) for (const y of [8, 15.5, CH]) k.color(STONE_DK).cyl(x, y, z, 2.15, 2.15, 0.6, 8, { phase: Math.PI / 8 });
  // open chhatri + cupola
  const y = CH + 1.5;
  if (hi) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.color(STONE).cyl(x + Math.cos(a) * 1.4, y, z + Math.sin(a) * 1.4, 0.18, 0.18, 2.0, 4, { caps: false });
    }
  } else k.color(STONE_DK).cyl(x, y, z, 1.4, 1.4, 2.0, 6);
  k.color(STONE_DK).cyl(x, y + 2.0, z, 1.9, 1.9, 0.35, seg);
  k.color(STONE_LT).lathe(x, y + 2.35, z, [[1.6, 0], [1.75, 0.6], [1.4, 1.4], [0.6, 2.1], [0.12, 2.6], [0, 2.7]], seg);
}

export function build(k) {
  const hi = k.hi;
  // waterfront plinth
  k.color(PAVE).box(0, 0, 0, 50, 0.8, 24);
  // central block: two piers (x) leaving the great passage, crown over the arch
  k.glow(true); // floodlit basalt at night
  k.color(STONE).box(-7.25, 0.8, 0, 5.5, CH - 0.8, 20);
  k.color(STONE).box(7.25, 0.8, 0, 5.5, CH - 0.8, 20);
  k.color(STONE).box(0, 17.6, 0, 9.2, CH - 17.6, 20);
  k.glow(false);
  // passage vault ceiling + great pointed arches on both faces
  k.color(SHADOW).box(0, 0.8, 0, 9.0, 16.8, 19.6);
  // stone spandrels around the pointed arch on both faces
  k.glow(true).color(STONE).box(0, 0.8, -10.05, 9.2, 16.8, 0.1).box(0, 0.8, 10.05, 9.2, 16.8, 0.1).glow(false);
  arch(k, 0, 0.8, -10.12, 9.0, 16.8, SHADOW, -1);
  arch(k, 0, 0.8, 10.12, 9.0, 16.8, SHADOW, 1);
  if (hi) {
    // arch surround mouldings + spandrel lattice panels on the front and back
    for (const sz of [-1, 1]) {
      const zf = sz * 10.08;
      k.color(STONE_LT).box(-5.0, 0.8, zf, 0.6, 16.8, 0.2).box(5.0, 0.8, zf, 0.6, 16.8, 0.2).box(0, 18.0, zf, 10.6, 0.7, 0.2);
      k.color(JALI).box(-7.3, 4, zf, 3.0, 9, 0.12).box(7.3, 4, zf, 3.0, 9, 0.12);
      k.color(STONE_DK).box(-7.3, 14.5, zf, 3.6, 0.5, 0.25).box(7.3, 14.5, zf, 3.6, 0.5, 0.25);
      for (let i = -3; i <= 3; i++) k.color(STONE_DK).box(i * 1.2, 19.4, zf, 0.5, 2.2, 0.15);
    }
    // side arches leading into the wings
    for (const sx of [-1, 1]) arch(k, sx * 10.02, 0.8, 0, 5, 10, SHADOW, 1);
  }
  // cornice + pierced parapet with pinnacles
  k.color(STONE_DK).box(0, CH, 0, 21, 0.8, 21);
  k.color(hi ? JALI : STONE).box(0, CH + 0.8, 0, 20.4, 1.8, 20.4);
  if (hi) {
    k.color(STONE_LT);
    for (let i = -4; i <= 4; i++) {
      for (const sz of [-1, 1]) k.cyl(i * 2.1, CH + 2.6, sz * 10.2, 0.25, 0.05, 1.2, 4);
      for (const sx of [-1, 1]) k.cyl(sx * 10.2, CH + 2.6, i * 2.1, 0.25, 0.05, 1.2, 4);
    }
  }
  // low central dome behind the parapet (seen from above)
  k.color(STONE_LT).sphere(0, CH + 0.8, 0, 6.5, hi ? 16 : 8, hi ? 5 : 3, 0.55, 0.5);
  // corner turrets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) turret(k, sx * 9.2, sz * 9.2);
  // side wings with front/back loggias
  for (const sx of [-1, 1]) {
    const cx = sx * 16.8;
    k.glow(true).color(STONE).box(cx, 0.8, 0, 13.4, WH - 0.8, 14).glow(false);
    k.color(STONE_DK).box(cx, WH, 0, 14, 0.7, 14.6);
    k.color(hi ? JALI : STONE).box(cx, WH + 0.7, 0, 13.4, 1.2, 14);
    for (const sz of [-1, 1]) {
      arch(k, cx, 0.8, sz * 7.02, 6.5, 11.5, SHADOW, sz);
      if (hi) {
        arch(k, cx - 4.6, 2.5, sz * 7.02, 1.8, 4.2, SHADOW, sz);
        arch(k, cx + 4.6, 2.5, sz * 7.02, 1.8, 4.2, SHADOW, sz);
        k.color(STONE_LT).box(cx, 13.2, sz * 7.15, 7.5, 0.5, 0.3);
      }
    }
    // small corner cupolas on the wings
    if (hi) {
      for (const sz of [-1, 1]) {
        const tx = cx + sx * 6.2, tz = sz * 6.5;
        k.color(STONE_LT).cyl(tx, WH + 1.9, tz, 0.9, 0.9, 1.0, 8).sphere(tx, WH + 2.9, tz, 0.95, 8, 4, 1.3, 0.5);
      }
    }
  }
  // floodlights along the plinth (night)
  k.glow(true).color(WARM);
  for (const sz of [-1, 1]) k.box(0, 0.8, sz * 11.6, 46, 0.25, 0.4);
  k.glow(false);
}
