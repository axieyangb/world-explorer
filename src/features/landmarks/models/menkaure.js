// feature/famous-landmarks: Pyramid of Menkaure, Giza — 1:1 (102.2 x 104.6 m base, 61 m today,
// 65.5 m original). Stepped limestone core, lowest courses still cased in rough red Aswan granite,
// and the great vertical gash cut into the north face (front, -Z) in 1196 by al-Aziz Uthman.
const W = 102.2, D = 104.6, H0 = 65.5, H = 61, GRAN = 7, BURY = 16;
const SHADES = [0xd9b98c, 0xd0b082, 0xdfc297, 0xc9a777, 0xd5b588];
const GRANITE = 0x9a5a47, GRANITE_DK = 0x80493a, GASH = 0x907658, DARK = 0x3b2f24;

export const lodDist = 1800;
export const glowStrength = 0.42;

const fx = (y) => 1 - y / H0;
export const colliders = Array.from({ length: 6 }, (_, j) => {
  const f = fx(((j + 0.5) * H) / 6);
  return { x: 0, z: 0, hw: (W / 2) * f, hd: (D / 2) * f, h: ((j + 1) * H) / 6 };
});

function hash(i) { const s = Math.sin(i * 57.7 + 3.3) * 43758.5453; return s - Math.floor(s); }

export function build(k) {
  k.glow(true);
  // granite casing band (proud of the core)
  const g0 = fx(0), g1 = fx(GRAN);
  const gb = fx(-BURY);
  k.color(GRANITE).taper(0, -BURY, 0, W * gb + 1.2, D * gb + 1.2, W * g0 + 1.2, D * g0 + 1.2, BURY);
  k.taper(0, 0, 0, W * g0 + 1.2, D * g0 + 1.2, W * g1 + 1.2, D * g1 + 1.2, GRAN);
  if (!k.hi) {
    k.color(SHADES[0]).taper(0, GRAN, 0, W * g1, D * g1, W * fx(H), D * fx(H), H - GRAN);
    k.glow(false);
    return;
  }
  // patchy granite: darker blocks on the band
  k.color(GRANITE_DK);
  for (let f = 0; f < 4; f++) {
    const hw = f % 2 ? D / 2 : W / 2;
    const other = f % 2 ? W / 2 : D / 2;
    k.push().rotateY((f * Math.PI) / 2);
    for (let j = 0; j < 9; j++) {
      const y0 = 0.4 + hash(f * 20 + j) * 4.5, x = (hash(f * 30 + j) - 0.5) * 2 * (other * fx(y0) - 6);
      k.box(x, y0, -hw * fx(y0) - 0.5, 3 + hash(j) * 5, 1.4, 1.4);
    }
    k.pop();
  }
  const n = 56, hs = (H - GRAN) / n;
  for (let i = 0; i < n; i++) {
    const y0 = GRAN + i * hs, f = fx(y0 + hs * 0.5);
    k.color(SHADES[Math.floor(hash(i) * SHADES.length)]).box(0, y0, 0, W * f, hs, D * f);
  }
  k.glow(false);
  // the gash on the north face: tapering darker scar with a dark cavity at its foot
  const zf = (y) => -(D / 2) * fx(y) - 0.8;
  k.color(GASH);
  k.quad([7.5, 3, zf(3)], [-7.5, 3, zf(3)], [-3.5, 29, zf(29)], [3.5, 29, zf(29)]);
  k.color(DARK);
  const zd = (y) => zf(y) - 0.15;
  k.quad([3, 3.5, zd(3.5)], [-3, 3.5, zd(3.5)], [-2.2, 9, zd(9)], [2.2, 9, zd(9)]);
  // original entrance (granite-framed) low on the north face
  k.quad([1.0, 1.0, zd(1.0)], [-1.0, 1.0, zd(1.0)], [-1.0, 2.6, zd(2.6)], [1.0, 2.6, zd(2.6)]);
}
