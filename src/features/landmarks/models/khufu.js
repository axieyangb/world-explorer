// feature/famous-landmarks: Great Pyramid of Khufu, Giza — 1:1 (230.3 m base, 138.5 m today vs 146.6 m
// original apex; the top ~8 m is gone, leaving a ~12 m platform). Casing stripped: the stepped core
// courses are shown as ~1.1 m terraces. Front (-Z) = north face with the original entrance under
// its double chevron limestone gable (7.3 m east of centre, ~17 m up), al-Ma'mun's robbers' tunnel below,
// surviving Tura limestone base casing blocks, three Queens' Pyramids (GI-a, GI-b, GI-c), and Solar Boat pits.
const W = 230.3, H0 = 146.6, H = 139, BURY = 30;
const SHADES = [0xdcc398, 0xd3b98d, 0xe2cba3, 0xccb083, 0xd8bf93];
const DARK = 0x3b2f24, CHEVRON = 0xe8d5b0, TURA = 0xede0c4, BASALT = 0x3d3834;

export const lodDist = 2600;
export const glowStrength = 0.42; // warm floodlighting (Sound & Light show)

const half = (y) => (W / 2) * (1 - y / H0);
export const colliders = Array.from({ length: 8 }, (_, j) => {
  const hw = half(((j + 0.5) * H) / 8);
  return { x: 0, z: 0, hw, hd: hw, h: ((j + 1) * H) / 8 };
});

function hash(i) { const s = Math.sin(i * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); }

export function build(k) {
  k.glow(true);
  if (!k.hi) {
    k.color(SHADES[0]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
    k.taper(0, 0, 0, W, W, 2 * half(H), 2 * half(H), H);
    k.glow(false);
    return;
  }
  const n = 128, hs = H / n;
  for (let i = 0; i < n; i++) {
    const y0 = i * hs, w = 2 * half(y0 + hs * 0.5);
    const c = SHADES[Math.floor(hash(i) * SHADES.length)];
    k.color(c).box(0, y0, 0, w, hs, w);
  }
  // buried courses: the faces continue below ground so uneven terrain never shows a floating edge
  k.color(SHADES[1]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
  // weathered corner ridges (slightly lighter arrises + notched NE corner socket at ~85 m)
  k.color(0xdcc192);
  for (let q = 0; q < 4; q++) {
    const sx = q & 1 ? 1 : -1, sz = q & 2 ? 1 : -1;
    k.strut([sx * (W / 2 - 0.4), 0.3, sz * (W / 2 - 0.4)], [sx * (half(H) - 0.2), H - 0.3, sz * (half(H) - 0.2)], 1.2);
  }
  // Flat summit plateau masonry courses + historic surveyor's wooden tripod mast at 146.6 m original apex
  const topW = 2 * half(H);
  for (let b = 0; b < 12; b++) {
    const bx = (hash(b * 9) - 0.5) * (topW - 2.5), bz = (hash(b * 15 + 4) - 0.5) * (topW - 2.5);
    k.color(SHADES[b % SHADES.length]).box(bx, H, bz, 1.8 + hash(b) * 1.8, 0.95, 1.8 + hash(b + 3) * 1.8);
  }
  k.glow(false);
  // Original apex height wooden sighting mast & tripod on the flat summit platform
  k.color(0x6e543b);
  k.cyl(0, H, 0, 0.14, 0.08, H0 - H, 6);
  for (let t = 0; t < 3; t++) {
    const a = (t / 3) * Math.PI * 2;
    k.strut([Math.cos(a) * 1.8, H, Math.sin(a) * 1.8], [0, H + 3.2, 0], 0.12);
  }

  // Surviving in-situ smooth Tura white-limestone base casing blocks along the center of the North (-Z) foot
  k.color(TURA);
  for (let b = -6; b <= 6; b++) {
    const bw = 2.4 + hash(b + 20) * 0.8;
    k.taper(b * 2.9, 0, -W / 2 - 0.85, bw, 2.2, bw * 0.96, 1.0, 1.5, 0, 0.6);
  }

  // North face (-Z): Original Descending Passage entrance with monumental double-tier limestone Chevron Gable (x=7.3, y=16.5..22.5)
  const ze = (y) => -half(y) - 0.95;
  k.color(SHADES[3]).box(7.3, 14.8, ze(17.5) + 0.5, 9.8, 5.2, 1.8);
  k.color(DARK).box(7.3, 15.6, ze(17.0) - 0.1, 2.8, 3.2, 1.4);
  // Double-tier megalithic angled chevron lintel blocks above original entrance
  k.color(CHEVRON);
  for (const [dy, th] of [[0, 1.15], [1.35, 1.05]]) {
    k.strut([3.1, 18.4 + dy, ze(18.4 + dy)], [7.3, 22.1 + dy, ze(22.1 + dy)], th);
    k.strut([11.5, 18.4 + dy, ze(18.4 + dy)], [7.3, 22.1 + dy, ze(22.1 + dy)], th);
  }
  k.strut([4.2, 18.5, ze(18.5)], [10.4, 18.5, ze(18.5)], 0.9);
  // Al-Ma'mun's robbers' tunnel (lower tourist entrance at x = -1.2, y = 6.8) + wooden visitor stair ramp
  k.color(DARK).box(-1.2, 6.4, ze(7.8) - 0.1, 3.2, 3.4, 1.4);
  k.color(0xbfa47a).strut([-12, 0.2, ze(0.2) - 1.2], [-1.5, 6.4, ze(6.4) - 0.4], 1.4);

  // Remains of the Black Basalt Pavement of the Eastern Mortuary Temple (+X side) & Solar Barque Pits
  k.color(BASALT).box(W / 2 + 18, 0.05, 0, 26, 0.45, 54);
  // Two elongated rock-cut Solar Boat Pits flanking the East & South base
  for (const [px, pz, pw, pd] of [[W / 2 + 16, -44, 6.5, 32], [W / 2 + 16, 44, 6.5, 32], [-28, W / 2 + 16, 34, 6.2]]) {
    k.color(SHADES[2]).box(px, 0.1, pz, pw + 2.4, 0.8, pd + 2.4);
    k.color(DARK).box(px, 0.35, pz, pw, 0.65, pd);
  }

  // Three Queens' Pyramids on the East (+X) side: GI-a (Hetepheres), GI-b (Meritites), GI-c (Henutsen)
  for (let q = 0; q < 3; q++) {
    const qz = -56 + q * 56, qx = W / 2 + 54;
    for (let s = 0; s < 14; s++) {
      const sy = s * 1.95, sw = 44 * (1 - s / 15.5);
      k.color(SHADES[(s + q) % SHADES.length]).box(qx, sy, qz, sw, 1.95, sw);
    }
  }
}
