// feature/famous-landmarks: Pyramid of Khafre, Giza — 1:1 (215.25 m base, 136 m today, 53° faces).
// Stepped, stripped core courses below; the original smooth Tura-limestone casing still caps the top
// ~30 m, overhanging the core with a ragged lip. Front (-Z) = north face (entrance low on the face).
const W = 215.25, H0 = 140, H = 136, CASE = 106, BURY = 30;
const SHADES = [0xd6bb8e, 0xceb284, 0xdcc298, 0xc6a979, 0xd3b78a];
const CASING = 0xe4d4b4, CASING_DK = 0xd6c39f, DARK = 0x3b2f24;

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
  const n = 78, hs = CASE / n;
  for (let i = 0; i < n; i++) {
    const y0 = i * hs, w = 2 * half(y0 + hs * 0.5);
    const c = SHADES[Math.floor(hash(i) * SHADES.length)];
    k.color(c).box(0, y0, 0, w, hs, w);
  }
  // buried courses: faces continue below ground so uneven terrain never shows a floating edge
  k.color(SHADES[1]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
  // smooth casing cap
  k.color(CASING).taper(0, CASE, 0, wc, wc, 2 * half(H), 2 * half(H), H - CASE);
  // ragged lower edge of the casing: a few hanging tongues of casing blocks on each face
  k.color(CASING_DK);
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    for (let j = 0; j < 7; j++) {
      const t = (j + 0.5) / 7 - 0.5, dh = 1.5 + hash(f * 10 + j) * 4.5;
      const y0 = CASE - dh, hw = half(y0) + 0.6;
      k.box(t * 2 * hw * 0.9, y0, -hw + 0.4, 2 * hw / 7 * (0.5 + hash(j + f) * 0.4), dh + 0.6, 1.4);
    }
    k.pop();
  }
  k.glow(false);
  // north entrances (upper original + lower), low on the face
  k.color(DARK);
  for (const [y0, y1] of [[11.5, 13.5], [1.0, 3.0]]) {
    const z0 = -half(y0) - 0.9, z1 = -half(y1) - 0.9;
    k.quad([1.2, y0, z0], [-1.2, y0, z0], [-1.2, y1, z1], [1.2, y1, z1]);
  }
}
