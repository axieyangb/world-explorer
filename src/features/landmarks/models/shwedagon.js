// feature/famous-landmarks: Shwedagon Pagoda, Yangon — 1:1 (99 m above the hilltop platform).
// The gilded zedi on its redented square plinth: plinth terraces, octagonal terraces, the great bell,
// turban bands, inverted alms bowl, double lotus-petal ring, the long banana bud and the jewelled hti
// umbrella with vane and diamond orb; a ring of small gilded stupas on the plinth edge with four larger
// ones at the corners, and four tiered pyatthat shrines at the cardinal stairheads. The OSM shrines
// around the platform stay. Gold glows warmly when floodlit at night.
const GOLD = 0xd6a633, GOLD_DK = 0xb3861e, GOLD_LT = 0xeac25c, WHITE = 0xece6d6, PLINTH = 0xdcd3bf;
const RED = 0x9b2a1e, JEWEL = 0xfff1c8;

export const lodDist = 1500;
export const glowStrength = 0.7;

const PH = 7;    // plinth top
const OT = 14;   // octagonal terraces top

export const colliders = [
  { x: 0, z: 0, hw: 57, hd: 57, h: PH },
  { x: 0, z: 0, r: 44, h: OT },
  { x: 0, z: 0, r: 30, h: 42 },
  { x: 0, z: 0, r: 14, h: 60 },
  { x: 0, z: 0, r: 5, h: 90 },
];

/** Redented square (cross-cornered) outline, half width h, notch n. */
function redent(h, n) {
  const q = [[h, -(h - 2 * n)], [h, h - 2 * n], [h - n, h - 2 * n], [h - n, h - n], [h - 2 * n, h - n], [h - 2 * n, h]];
  const out = [];
  for (let r = 0; r < 4; r++) {
    const a = (r * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    for (const [x, z] of q.slice(r === 0 ? 0 : 1)) out.push([x * c - z * s, x * s + z * c]);
  }
  out.pop();
  return out;
}

/** Small gilded stupa (bell + bud + hti), base width w, height h. */
function minizedi(k, x, y0, z, w, h, hi) {
  const seg = hi ? 10 : 6;
  k.color(WHITE).box(x, y0, z, w, h * 0.12, w);
  k.color(GOLD).lathe(x, y0 + h * 0.12, z, [
    [w * 0.45, 0], [w * 0.47, h * 0.08], [w * 0.4, h * 0.22], [w * 0.28, h * 0.36], [w * 0.22, h * 0.42],
    [w * 0.2, h * 0.5], [w * 0.12, h * 0.66], [w * 0.05, h * 0.82], [0, h * 0.88],
  ], seg);
}

/** Tiered pyatthat shrine roof (red with gilded eaves) on a hall, facing the centre. */
function pyatthat(k, x, z, rot, hi) {
  k.push().translate(x, PH, z).rotateY(rot);
  k.color(WHITE).box(0, 0, 0, 12, 6, 10);
  const tiers = hi ? 5 : 3;
  for (let t = 0; t < tiers; t++) {
    const s = 1 - t * 0.17, y = 6 + t * 2.6;
    k.color(t % 2 ? GOLD : RED).taper(0, y, 0, 14 * s, 12 * s, 9 * s, 7.5 * s, 1.6);
    k.color(GOLD_DK).box(0, y + 1.6, 0, 8 * s, 1.0, 6.5 * s);
  }
  k.color(GOLD).cyl(0, 6 + tiers * 2.6, 0, 1.2, 0.1, 5, hi ? 8 : 4);
  k.pop();
}

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 48 : 16;
  // plinth: three redented square terraces
  for (let i = 0; i < 3; i++) {
    const h = 57 - i * 4;
    k.color(i === 2 ? GOLD_DK : PLINTH).extrude(redent(h, 5 - i), (i * PH) / 3, PH / 3);
  }
  // octagonal terraces
  k.glow(true);
  for (let i = 0; i < 3; i++) {
    const r = 44 - i * 4;
    k.color(i % 2 ? GOLD_DK : GOLD).cyl(0, PH + (i * (OT - PH)) / 3, 0, r, r - 0.6, (OT - PH) / 3, 8, { phase: Math.PI / 8, smooth: false });
  }
  // bell, turban bands, alms bowl, lotus petals, banana bud
  k.color(GOLD).lathe(0, OT, 0, [
    [31, 0], [32, 2.5], [31, 6], [28.5, 11], [25, 16], [21.5, 21], [18.5, 25.5], [16.5, 28], [15.5, 30],
  ], seg);
  const B = OT + 30;
  for (let i = 0; i < 3; i++) k.color(i % 2 ? GOLD_LT : GOLD_DK).cyl(0, B + i * 1.7, 0, 15.5 - i * 1.0, 15.2 - i * 1.0, 1.7, seg);
  const AB = B + 5.1;
  k.color(GOLD).lathe(0, AB, 0, [[12.5, 0], [13.2, 1.5], [12.6, 3.6], [10.5, 5.6], [8.6, 6.8]], seg);
  const L = AB + 6.8;
  // lotus petals: down-turned then up-turned rings
  k.color(GOLD_LT).cyl(0, L, 0, 8.6, 9.6, 1.6, seg).cyl(0, L + 1.6, 0, 9.6, 7.8, 1.4, seg);
  k.color(GOLD).cyl(0, L + 3.0, 0, 7.8, 8.8, 1.6, seg).cyl(0, L + 4.6, 0, 8.8, 7.2, 1.2, seg);
  if (hi) {
    k.color(GOLD_DK);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.box(Math.cos(a) * 9.3, L + 0.3, Math.sin(a) * 9.3, 0.6, 2.4, 0.6);
    }
  }
  const BB = L + 5.8;
  k.color(GOLD_LT).lathe(0, BB, 0, [[7.2, 0], [7.0, 4], [6.2, 9], [4.8, 14], [3.2, 19], [1.9, 23], [1.3, 25]], seg);
  k.glow(false);
  // hti: stacked umbrella rings, vane, orb
  const H = BB + 25;
  const ht = hi ? 7 : 3;
  for (let i = 0; i < ht; i++) {
    const r = 2.6 - i * (2.0 / ht);
    k.color(i % 2 ? GOLD_DK : GOLD).cyl(0, H + i * (8 / ht), 0, r, r * 0.8, 8 / ht, hi ? 12 : 6);
  }
  k.color(GOLD).cyl(0, H + 8, 0, 0.35, 0.25, 3.8, 6);
  if (hi) k.color(GOLD_LT).quad2([0, H + 9.0, 0], [1.6, H + 9.6, 0], [1.6, H + 10.8, 0], [0, H + 10.6, 0]);
  k.glow(true).color(JEWEL).sphere(0, H + 12, 0, 0.55, 8, 4).glow(false);
  // four larger corner stupas and the ring of small gilded stupas on the plinth edge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) minizedi(k, sx * 48, PH, sz * 48, 8, 22, hi);
  const n = hi ? 48 : 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const c = Math.cos(a), s = Math.sin(a);
    const m = Math.max(Math.abs(c), Math.abs(s));
    if (Math.abs(Math.abs(c) - Math.abs(s)) < 0.12) continue; // corners hold the big ones
    if (Math.min(Math.abs(c), Math.abs(s)) < 0.1) continue;    // keep the cardinal axes free for the shrines
    minizedi(k, (c / m) * 50.5, PH, (s / m) * 50.5, 3.2, 9, hi);
  }
  // cardinal shrines at the stairheads, facing the zedi
  pyatthat(k, 0, -50, 0, hi);
  pyatthat(k, 0, 50, Math.PI, hi);
  pyatthat(k, -50, 0, Math.PI / 2, hi);
  pyatthat(k, 50, 0, -Math.PI / 2, hi);
}
