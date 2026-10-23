// feature/famous-landmarks: Great Pyramid of Khufu, Giza — 1:1 (230.3 m base, 138.5 m today vs 146.6 m
// original apex; the top ~8 m is gone, leaving a ~12 m platform). Casing stripped: the stepped core
// courses are shown as ~1.4 m terraces. Front (-Z) = north face with the original entrance under
// its chevron gable (7.3 m east of centre, ~17 m up) and al-Ma'mun's robbers' tunnel below it.
const W = 230.3, H0 = 146.6, H = 139, BURY = 30;
const SHADES = [0xdcc398, 0xd3b98d, 0xe2cba3, 0xccb083, 0xd8bf93];
const DARK = 0x3b2f24, CHEVRON = 0xdcc49a;

export const lodDist = 2600;
export const glowStrength = 0.42; // warm floodlighting (Sound & Light show)

const half = (y) => (W / 2) * (1 - y / H0);
export const colliders = Array.from({ length: 8 }, (_, j) => {
  const hw = half(((j + 0.5) * H) / 8);
  return { x: 0, z: 0, hw, hd: hw, h: ((j + 1) * H) / 8 };
});

function hash(i) { const s = Math.sin(i * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); }

// dark/light quad laid on the north (-Z) face, slightly proud of the step edges
function faceQuad(k, x0, x1, y0, y1) {
  const z0 = -half(y0) - 0.9, z1 = -half(y1) - 0.9;
  k.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z1], [x1, y1, z1]);
}

export function build(k) {
  k.glow(true);
  if (!k.hi) {
    k.color(SHADES[0]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
    k.taper(0, 0, 0, W, W, 2 * half(H), 2 * half(H), H);
    k.glow(false);
    return;
  }
  const n = 100, hs = H / n;
  for (let i = 0; i < n; i++) {
    const y0 = i * hs, w = 2 * half(y0 + hs * 0.5);
    const c = SHADES[Math.floor(hash(i) * SHADES.length)];
    k.color(c).box(0, y0, 0, w, hs, w);
  }
  // buried courses: the faces continue below ground so uneven terrain never shows a floating edge
  k.color(SHADES[1]).taper(0, -BURY, 0, W * (1 + BURY / H0), W * (1 + BURY / H0), W, W, BURY);
  // weathered corner ridges (slightly lighter arrises)
  k.color(0xdcc192);
  for (let q = 0; q < 4; q++) {
    const sx = q & 1 ? 1 : -1, sz = q & 2 ? 1 : -1;
    k.strut([sx * (W / 2 - 0.4), 0.3, sz * (W / 2 - 0.4)], [sx * (half(H) - 0.2), H - 0.3, sz * (half(H) - 0.2)], 1.2);
  }
  k.glow(false);
  // north face: original entrance + chevron gable, al-Ma'mun's tunnel
  k.color(DARK);
  faceQuad(k, 6.0, 8.6, 15.6, 18.6);
  faceQuad(k, -1.6, 1.6, 6.4, 9.6);
  k.color(CHEVRON);
  const ze = (y) => -half(y) - 1.0;
  k.strut([3.4, 18.6, ze(18.6)], [7.3, 22.0, ze(22.0)], 1.0);
  k.strut([11.2, 18.6, ze(18.6)], [7.3, 22.0, ze(22.0)], 1.0);
  k.strut([4.4, 18.8, ze(18.8)], [10.2, 18.8, ze(18.8)], 0.8);
}
