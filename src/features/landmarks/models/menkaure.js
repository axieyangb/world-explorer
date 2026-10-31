// feature/famous-landmarks: Pyramid of Menkaure, Giza — 1:1 (102.2 x 104.6 m base, 61 m today,
// 65.5 m original). Stepped limestone core, lowest courses still cased in rough red Aswan granite,
// and the great vertical gash cut into the north face (front, -Z) in 1196 by al-Aziz Uthman,
// plus the three Queens' Pyramids (G3-a, G3-b, G3-c) along the south side and Eastern Mortuary Temple.
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
  // Undressed pillowed Aswan red-granite casing courses (16 courses at base) & smoother dressed zone around north portal
  for (let c = 0; c < 8; c++) {
    const yc = c * (GRAN / 8), fc = fx(yc + 0.4);
    k.color(c % 2 ? GRANITE : GRANITE_DK).box(0, yc, 0, W * fc + 1.35, GRAN / 8 - 0.08, D * fc + 1.35);
  }
  for (let f = 0; f < 4; f++) {
    const hw = f % 2 ? D / 2 : W / 2;
    const other = f % 2 ? W / 2 : D / 2;
    k.push().rotateY((f * Math.PI) / 2);
    for (let j = 0; j < 14; j++) {
      const y0 = 0.4 + hash(f * 20 + j) * 5.8, x = (hash(f * 30 + j) - 0.5) * 2 * (other * fx(y0) - 6);
      k.color(j % 2 ? GRANITE_DK : GRANITE).box(x, y0, -hw * fx(y0) - 0.55, 2.8 + hash(j) * 4.5, 1.3, 1.5);
    }
    k.pop();
  }
  // Stepped limestone core courses above granite zone
  const n = 60, hs = (H - GRAN) / n;
  for (let i = 0; i < n; i++) {
    const y0 = GRAN + i * hs, f = fx(y0 + hs * 0.5);
    k.color(SHADES[Math.floor(hash(i) * SHADES.length)]).box(0, y0, 0, W * f, hs, D * f);
  }
  // Eroded summit plateau blocks at y = 61m
  const topW = W * fx(H);
  for (let b = 0; b < 8; b++) {
    const bx = (hash(b * 7) - 0.5) * (topW - 2.2), bz = (hash(b * 13 + 3) - 0.5) * (topW - 2.2);
    k.color(SHADES[b % SHADES.length]).box(bx, H, bz, 1.6 + hash(b) * 1.4, 0.85, 1.6 + hash(b + 2) * 1.4);
  }
  k.glow(false);

  // Sculpted 3D recessed vertical gash on the north face (cut in 1196 by al-Aziz Uthman) with stepped rubble talus cone
  const zf = (y) => -(D / 2) * fx(y) - 0.8;
  k.color(GASH);
  k.quad([7.5, 3, zf(3)], [-7.5, 3, zf(3)], [-3.5, 29, zf(29)], [3.5, 29, zf(29)]);
  for (let s = 0; s < 14; s++) {
    const ys = 3.5 + s * 1.8, gw = 7.2 - s * 0.28, zFace = zf(ys);
    k.color(s % 2 ? GASH : DARK).box(-gw * 0.45, ys, zFace + 0.4, 1.4, 1.7, 1.8);
    k.box(gw * 0.45, ys, zFace + 0.4, 1.4, 1.7, 1.8);
    k.color(DARK).box(0, ys, zFace + 0.75, gw * 0.72, 1.5, 1.2);
  }
  // Rubble debris fan at foot of the north gash + original granite-framed north entrance
  k.color(GASH).cone(0, 0, zf(0) - 2.5, 9.5, 4.8, 10);
  k.color(GRANITE_DK).box(0, 0.8, zf(1.8) - 0.25, 3.8, 2.8, 1.2);
  k.color(DARK).box(0, 1.0, zf(1.8) - 0.45, 1.9, 2.1, 1.2);

  // Eastern Mortuary Temple ruins (+X side: megalithic limestone courtyard walls & granite pillars)
  k.color(SHADES[1]).box(66, 0, 0, 24, 3.6, 32);
  k.color(DARK).box(65, 1.2, 0, 16, 2.6, 20);
  k.color(GRANITE);
  for (let pz = -8; pz <= 8; pz += 4) {
    k.box(59, 1.2, pz, 1.2, 3.2, 1.2);
    k.box(71, 1.2, pz, 1.2, 3.2, 1.2);
  }

  // Three Queens' Pyramids along the south (+Z) side: G3-a (true pyramid, east) & G3-b, G3-c (4-stepped pyramids)
  // G3-a (East, x = 28, z = 68, 28m base, 18m tall)
  for (let s = 0; s < 12; s++) {
    const sy = s * 1.45, sw = 26 * (1 - s / 13.5);
    k.color(s < 2 ? GRANITE : SHADES[s % SHADES.length]).box(28, sy, 68, sw, 1.45, sw);
  }
  // G3-b (Center, x = 0, z = 68, 4-stepped pyramid) & G3-c (West, x = -28, z = 68, 4-stepped pyramid)
  for (const qx of [0, -28]) {
    for (let st = 0; st < 4; st++) {
      const sy = st * 3.2, sw = 24 - st * 5.2;
      k.color(SHADES[(st + 1) % SHADES.length]).box(qx, sy, 68, sw, 3.2, sw);
    }
  }
}
