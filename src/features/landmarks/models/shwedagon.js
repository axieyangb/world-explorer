// feature/famous-landmarks: Shwedagon Pagoda, Yangon — 1:1 (99 m above the hilltop platform).
// The gilded zedi on its redented square plinth: plinth terraces, octagonal terraces, the great bell
// with gold-plate bands, turban bands, inverted alms bowl, sculpted double lotus-petal ring, banana bud,
// 7-tier jewelled hti umbrella with hanging bells, vane and 76-carat diamond orb (Seinbu); 64 perimeter
// gilded stupas, 4 corner stupas, 4 cardinal pyatthat shrines, 4 Zaungdan stairways guarded by giant
// white-and-gold Chinthe lions, Bell Pavilions, and the SE Hintha Tagundaing flagpole.
const GOLD = 0xd6a633, GOLD_DK = 0xb3861e, GOLD_LT = 0xeac25c, WHITE = 0xece6d6, PLINTH = 0xdcd3bf;
const RED = 0x9b2a1e, JEWEL = 0xfff1c8, BRONZE = 0x6b5328;

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
  if (hi) {
    k.color(GOLD_LT).cyl(x, y0 + h * 0.86, z, w * 0.12, w * 0.04, h * 0.12, 6);
  }
}

/** Tiered pyatthat shrine roof (red with gilded eaves & carved flame-gables) on a hall, facing the centre. */
function pyatthat(k, x, z, rot, hi) {
  k.push().translate(x, PH, z).rotateY(rot);
  k.color(WHITE).box(0, 0, 0, 12, 6, 10);
  if (hi) {
    // Gilded pillars & seated golden Buddha image visible inside the cardinal shrine
    for (const px of [-4.8, -1.8, 1.8, 4.8]) k.color(GOLD).cyl(px, 0, 4.9, 0.26, 0.26, 5.8, 6);
    k.glow(true).color(GOLD_LT).cyl(0, 0.5, 1.5, 1.4, 0.9, 2.8, 8).sphere(0, 3.8, 1.5, 0.65, 6, 4).glow(false);
  }
  const tiers = hi ? 5 : 3;
  for (let t = 0; t < tiers; t++) {
    const s = 1 - t * 0.17, y = 6 + t * 2.6;
    k.color(t % 2 ? GOLD : RED).taper(0, y, 0, 14 * s, 12 * s, 9 * s, 7.5 * s, 1.6);
    k.color(GOLD_DK).box(0, y + 1.6, 0, 8 * s, 1.0, 6.5 * s);
    if (hi) {
      // Burmese gilded flame-antefix gables at corners and mid-eaves
      k.color(GOLD_LT);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.box(sx * 6.8 * s, y + 0.2, sz * 5.8 * s, 0.4, 1.4, 0.4);
      }
      k.tri([-1.8 * s, y, 6.1 * s], [1.8 * s, y, 6.1 * s], [0, y + 2.4 * s, 6.1 * s]);
    }
  }
  k.color(GOLD).cyl(0, 6 + tiers * 2.6, 0, 1.2, 0.1, 5, hi ? 8 : 4);
  k.pop();
}

/** Burmese Chinthe guardian lion statue at Zaungdan stairway foot. */
function chinthe(k, x, z, rot) {
  k.push().translate(x, 0, z).rotateY(rot);
  // Stepped white plinth
  k.color(PLINTH).box(0, 0, 0, 3.6, 1.4, 4.8);
  // Seated white body & haunches
  k.color(WHITE).box(0, 1.4, 0.6, 2.6, 3.2, 2.8);
  k.cyl(0, 1.4, -0.8, 1.35, 1.1, 4.4, 8);
  // Front legs & paws
  for (const sx of [-0.85, 0.85]) {
    k.color(WHITE).cyl(sx, 1.4, -1.6, 0.38, 0.34, 2.8, 6);
    k.box(sx, 1.4, -2.0, 0.65, 0.45, 0.9);
  }
  // Golden mane, chest breastplate & crowned head
  k.color(GOLD).sphere(0, 5.8, -0.9, 1.25, 8, 6);
  k.color(WHITE).box(0, 5.4, -1.85, 1.2, 1.0, 1.0); // snout
  k.color(RED).box(0, 5.2, -2.36, 0.75, 0.45, 0.15); // open mouth
  k.color(GOLD_LT).cyl(0, 6.8, -0.9, 0.65, 0.12, 1.8, 6); // spire crown
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
  if (hi) {
    // Moulded horizontal gold-plate bands on the great bell
    k.color(GOLD_LT);
    for (const [dy, rr] of [[2.5, 32.15], [9.5, 29.35], [18.0, 23.7], [26.0, 18.2]]) {
      k.cyl(0, OT + dy, 0, rr, rr, 0.45, seg);
    }
  }
  const B = OT + 30;
  for (let i = 0; i < 3; i++) k.color(i % 2 ? GOLD_LT : GOLD_DK).cyl(0, B + i * 1.7, 0, 15.5 - i * 1.0, 15.2 - i * 1.0, 1.7, seg);
  const AB = B + 5.1;
  k.color(GOLD).lathe(0, AB, 0, [[12.5, 0], [13.2, 1.5], [12.6, 3.6], [10.5, 5.6], [8.6, 6.8]], seg);
  if (hi) {
    // Vertical ribs on the inverted alms bowl (Thabeik)
    k.color(GOLD_DK);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      k.strut([Math.cos(a) * 13.1, AB + 1.2, Math.sin(a) * 13.1], [Math.cos(a) * 9.0, AB + 6.4, Math.sin(a) * 9.0], 0.25);
    }
  }
  const L = AB + 6.8;
  // lotus petals: down-turned then up-turned rings
  k.color(GOLD_LT).cyl(0, L, 0, 8.6, 9.6, 1.6, seg).cyl(0, L + 1.6, 0, 9.6, 7.8, 1.4, seg);
  k.color(GOLD).cyl(0, L + 3.0, 0, 7.8, 8.8, 1.6, seg).cyl(0, L + 4.6, 0, 8.8, 7.2, 1.2, seg);
  if (hi) {
    // 32 sculpted lotus-petal tips on both lower & upper lotus rings
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      k.color(GOLD_DK).box(Math.cos(a) * 9.5, L + 0.3, Math.sin(a) * 9.5, 0.55, 2.4, 0.55);
      k.color(GOLD_LT).box(Math.cos(a + Math.PI / 32) * 8.7, L + 3.2, Math.sin(a + Math.PI / 32) * 8.7, 0.5, 2.1, 0.5);
    }
  }
  const BB = L + 5.8;
  k.color(GOLD_LT).lathe(0, BB, 0, [[7.2, 0], [7.0, 4], [6.2, 9], [4.8, 14], [3.2, 19], [1.9, 23], [1.3, 25]], seg);
  k.glow(false);
  // hti: stacked umbrella rings, hanging bells, vane, diamond orb
  const H = BB + 25;
  const ht = hi ? 7 : 3;
  for (let i = 0; i < ht; i++) {
    const r = 2.6 - i * (2.0 / ht);
    const ry = H + i * (8 / ht);
    k.color(i % 2 ? GOLD_DK : GOLD).cyl(0, ry, 0, r, r * 0.8, 8 / ht, hi ? 16 : 6);
    if (hi && i < 5) {
      // Hanging golden bells around each Hti tier
      k.color(GOLD_LT);
      for (let b = 0; b < 8; b++) {
        const ab = (b / 8) * Math.PI * 2 + i * 0.4;
        k.cyl(Math.cos(ab) * (r + 0.12), ry - 0.35, Math.sin(ab) * (r + 0.12), 0.08, 0.14, 0.35, 5);
      }
    }
  }
  k.color(GOLD).cyl(0, H + 8, 0, 0.35, 0.25, 3.8, 6);
  if (hi) {
    // Jewelled weather vane (Hnetmana)
    k.color(GOLD_LT).quad2([0, H + 9.0, 0], [1.8, H + 9.6, 0], [2.1, H + 10.9, 0], [0, H + 10.6, 0]);
    k.color(JEWEL).sphere(1.8, H + 10.2, 0, 0.22, 6, 4);
  }
  k.glow(true).color(JEWEL).sphere(0, H + 12, 0, 0.55, 8, 4).glow(false);
  // four larger corner stupas and the ring of small gilded stupas on the plinth edge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) minizedi(k, sx * 48, PH, sz * 48, 8, 22, hi);
  const n = hi ? 64 : 12;
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

  if (hi) {
    // 4 Cardinal Zaungdan Covered Stairways & Twin Chinthe Guardian Lions
    for (let d = 0; d < 4; d++) {
      k.push().rotateY((d * Math.PI) / 2);
      // Covered stepped roof descending from z = -55 to -66
      k.color(WHITE).taper(0, 0, -61, 8.4, 12, 7.6, 2, PH);
      for (let s = 0; s < 3; s++) {
        const sy = 2.5 + s * 2.2, sz = -64 + s * 3.5;
        k.color(RED).taper(0, sy + 2.8, sz, 9.6, 5.2, 6.2, 3.8, 1.8);
        k.color(GOLD).box(0, sy + 2.6, sz, 9.8, 0.3, 5.4);
      }
      // Twin Chinthe Guardian Lions flanking the stairway foot
      chinthe(k, -6.8, -64.5, 0);
      chinthe(k, 6.8, -64.5, 0);
      k.pop();
    }
    // NW Maha Gandha Bell Pavilion & NE Tharrawaddy Min Bell Pavilion on the platform
    for (const [bx, bz] of [[-41, -41], [41, -41]]) {
      k.color(WHITE).box(bx, PH, bz, 7.5, 0.5, 7.5);
      for (const dx of [-3.0, 3.0]) for (const dz of [-3.0, 3.0]) {
        k.color(RED).cyl(bx + dx, PH + 0.5, bz + dz, 0.28, 0.25, 4.2, 6);
      }
      k.color(RED).taper(bx, PH + 4.7, bz, 8.6, 8.6, 4.5, 4.5, 2.0);
      k.color(GOLD).taper(bx, PH + 6.7, bz, 5.2, 5.2, 0.5, 0.5, 2.4);
      // Giant bronze bell suspended on crossbeam
      k.color(GOLD_DK).box(bx, PH + 3.8, bz, 4.6, 0.4, 0.4);
      k.color(BRONZE).cyl(bx, PH + 1.2, bz, 1.35, 0.95, 2.4, 10);
    }
    // SE Sacred Tagundaing Flagpole crowned with the Golden Hintha Bird (x = 41, z = 41)
    k.color(GOLD).box(41, PH, 41, 3.6, 1.6, 3.6);
    k.color(GOLD_LT).cyl(41, PH + 1.6, 41, 0.45, 0.22, 22, 8);
    k.color(GOLD).sphere(41, PH + 24.0, 41, 0.55, 6, 4); // Hintha bird finial
  }
}
