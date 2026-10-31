// feature/famous-landmarks: Pyramid of Khafre, Giza — 1:1 (215.25 m base, 136 m today, 53° faces).
// Stepped, stripped core courses below; the original smooth Tura-limestone casing still caps the top
// ~30 m, overhanging the core with a ragged lip. Front (-Z) = north face (two entrances low on the face),
// flanked by the limestone bedrock quarry enclosure walls and the Eastern Mortuary Temple ruins.
const W = 215.25, H0 = 140, H = 136, CASE = 106, BURY = 30;
const SHADES = [0xd6bb8e, 0xceb284, 0xdcc298, 0xc6a979, 0xd3b78a];
const CASING = 0xe4d4b4, CASING_DK = 0xd6c39f, GRANITE = 0x9a5a47, DARK = 0x3b2f24;

export const lodDist = 2600;
export const glowStrength = 0.42;

const half = (y) => (W / 2) * (1 - y / H0);
export const colliders = Array.from({ length: 8 }, (_, j) => {
  const hw = half(((j + 0.5) * H) / 8);
  return { x: 0, z: 0, hw, hd: hw, h: ((j + 1) * H) / 8 };
});

function hash(i) { const s = Math.sin(i * 91.3 + 17.1) * 43758.5453; return s - Math.floor(s); }

export function build(k) {
  k.glow(true);
  const wc = 2 * half(CASE) + 1.6; // casing stands proud of the eroded core
  if (!k.hi) {
    k.color(SHADES[0]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
    k.taper(0, 0, 0, W, W, 2 * half(CASE), 2 * half(CASE), CASE);
    k.color(CASING).taper(0, CASE, 0, wc, wc, 2 * half(H), 2 * half(H), H - CASE);
    k.glow(false);
    return;
  }
  // Bottom 2 courses originally cased in red Aswan granite
  k.color(GRANITE).box(0, 0, 0, W + 1.2, 2.4, W + 1.2);
  const n = 96, hs = (CASE - 2.4) / n;
  for (let i = 0; i < n; i++) {
    const y0 = 2.4 + i * hs, w = 2 * half(y0 + hs * 0.5);
    const c = SHADES[Math.floor(hash(i) * SHADES.length)];
    k.color(c).box(0, y0, 0, w, hs, w);
  }
  // buried courses: faces continue below ground so uneven terrain never shows a floating edge
  k.color(SHADES[1]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);

  // Smooth Tura limestone casing cap (y = 106 .. 136 m) with crisp horizontal masonry course seams
  k.color(CASING).taper(0, CASE, 0, wc, wc, 2 * half(H), 2 * half(H), H - CASE);
  k.color(CASING_DK);
  for (let cy = CASE + 4; cy < H - 2; cy += 4.5) {
    const cw = 2 * half(cy) + 1.5 * (1 - (cy - CASE) / (H - CASE));
    k.box(0, cy, 0, cw + 0.25, 0.35, cw + 0.25);
  }
  // Eroded apex crown courses above the casing cap (y = 134 .. 136.5 m)
  for (let s = 0; s < 4; s++) {
    const sy = H - 2.2 + s * 0.65, sw = 2 * half(sy) - s * 0.6;
    k.color(SHADES[s % SHADES.length]).box(0, sy, 0, sw, 0.65, sw);
  }

  // Ragged lower overhang lip of the casing: stepped hanging tongues of casing blocks on each face
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    for (let j = 0; j < 11; j++) {
      const t = (j + 0.5) / 11 - 0.5, dh = 1.8 + hash(f * 10 + j) * 5.2;
      const y0 = CASE - dh, hw = half(y0) + 0.65;
      k.color(j % 2 ? CASING_DK : CASING);
      k.box(t * 2 * hw * 0.92, y0, -hw + 0.35, (2 * hw / 11) * (0.65 + hash(j + f) * 0.35), dh + 0.8, 1.5);
    }
    k.pop();
  }
  k.glow(false);

  // Dual North Entrances (12.9 m east of center): Upper entrance in granite housing + Lower bedrock-cut entrance in courtyard
  const ex = -12.9;
  const zUp = -half(11.5) - 0.9;
  k.color(GRANITE).box(ex, 10.6, zUp + 0.3, 4.4, 3.8, 1.6);
  k.color(DARK).box(ex, 11.2, zUp - 0.15, 2.2, 2.4, 1.2);
  // Lower pavement-cut entrance in front of north base + wooden tourist ramp
  k.color(SHADES[2]).box(ex, 0, -W / 2 - 9.5, 5.2, 1.4, 7.5);
  k.color(DARK).box(ex, 0.2, -W / 2 - 9.5, 2.4, 1.3, 5.2);
  k.color(0xbfa47a).strut([ex, 0.3, -W / 2 - 6.0], [ex, 10.8, zUp - 0.3], 1.3);

  // Eastern Mortuary Temple megalithic ruins (+X side, 55 x 110 m courtyard with red granite pillars & causeway head)
  const tx = W / 2 + 28;
  k.color(SHADES[1]).box(tx, 0, 0, 42, 4.2, 78);
  k.color(DARK).box(tx - 2, 1.2, 0, 26, 3.2, 52);
  k.color(GRANITE);
  for (let pz = -20; pz <= 20; pz += 8) {
    k.box(tx - 12, 1.2, pz, 1.5, 3.8, 1.5);
    k.box(tx + 8, 1.2, pz, 1.5, 3.8, 1.5);
  }
  // Inclined megalithic Causeway head leading ESE toward the Sphinx & Valley Temple
  k.color(SHADES[0]).box(tx + 34, 0, 18, 28, 2.8, 8.5);
}
