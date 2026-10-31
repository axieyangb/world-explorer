// feature/famous-landmarks: Gateway Arch, St. Louis — 1:1 (192 m tall, 192 m outer span).
// Weighted catenary (NPS centroid formula, feet): y = 693.8597 - 68.7672 cosh(0.0100333 x), |x| <= 299.2239.
// Hollow equilateral-triangle section, 16.5 m sides at the feet tapering to 5.2 m at the top; flat face
// on the outside (extrados), sharp edge on the inside. Stainless steel; floodlit at night.
const STEEL = 0xc9ced3, STEEL_DK = 0x9ea4aa, STEEL_SEAM = 0x80878f, STONE = 0xb9b4aa, STONE_DK = 0x969188, GLASS_OBS = 0xe8f4ff, LAWN = 0x4d8242;

export const lodDist = 1600;
export const glowStrength = 0.75;

const FT = 0.3048;
const XMAX = 299.2239;
const cy = (xf) => FT * (693.8597 - 68.7672 * Math.cosh(0.0100333 * xf));
const TOPC = cy(0);

export const colliders = [
  { x: -91.2, z: 0, hw: 7.5, hd: 7.5, h: 30 },
  { x: 91.2, z: 0, hw: 7.5, hd: 7.5, h: 30 },
  { x: -86, z: 0, hw: 4, hd: 5, h: 60 },
  { x: 86, z: 0, hw: 4, hd: 5, h: 60 },
];

export function build(k) {
  const hi = k.hi;
  const N = hi ? 142 : 24;
  // centroid points + tangent-based frames
  const sec = [];
  for (let i = 0; i <= N; i++) {
    const xf = -XMAX + (2 * XMAX * i) / N;
    const x = xf * FT, y = cy(xf);
    // in-plane normal pointing outward (away from the arch interior)
    const dy = -FT * 68.7672 * 0.0100333 * Math.sinh(0.0100333 * xf);
    let nx = -dy, ny = 1; const ln = Math.hypot(nx, ny); nx /= ln; ny /= ln;
    const side = 16.46 - (16.46 - 5.18) * Math.max(0, y) / TOPC;
    const a = side / Math.sqrt(3); // centroid -> vertex
    const b = side / (2 * Math.sqrt(3)); // centroid -> flat face
    // outer face edge points (front/back), inner vertex
    const o1 = [x + nx * b, y + ny * b, -side / 2];
    const o2 = [x + nx * b, y + ny * b, side / 2];
    const iv = [x - nx * a, y - ny * a, 0];
    sec.push([o1, o2, iv]);
  }
  // clamp the feet to the ground plane and run them a little below grade
  for (const s of [sec[0], sec[N]]) for (const p of s) p[1] = -2;
  k.glow(true).color(STEEL);
  for (let i = 0; i < N; i++) {
    const [a1, a2, a3] = sec[i], [b1, b2, b3] = sec[i + 1];
    k.quad(a2, b2, b1, a1);        // outer flat face
    k.color(STEEL_DK);
    k.quad(a3, b3, b2, a2);        // back face (+Z)
    k.quad(a1, b1, b3, a3);        // front face (-Z)
    k.color(STEEL);
  }
  k.glow(false);
  if (hi) {
    // 142 stainless-steel triangular weld-seam ribs & intrados knife-edge spine
    k.color(STEEL_SEAM);
    for (let i = 2; i < N - 1; i += 2) {
      const [p1, p2, p3] = sec[i];
      k.strut(p1, p2, 0.14);
      k.strut(p2, p3, 0.12);
      k.strut(p3, p1, 0.12);
    }
    // Apex observation deck viewing slit windows (16 windows per side at top crown)
    const mid = N >> 1;
    const [m1, m2, m3] = sec[mid];
    const wy = (m1[1] + m3[1]) * 0.5 - 0.4;
    k.glow(true).color(GLASS_OBS);
    for (let w = -7.5; w <= 7.5; w += 1.0) {
      const wz = (m2[2] + m3[2]) * 0.52;
      k.box(w, wy, wz, 0.55, 0.24, 0.22);
      k.box(w, wy, -wz, 0.55, 0.24, 0.22);
    }
    // Aircraft warning beacon & lightning rods at 192m apex
    k.color(0xff3322).sphere(-2.2, m1[1] + 0.6, 0, 0.25, 8, 5).sphere(2.2, m1[1] + 0.6, 0, 0.25, 8, 5);
    k.glow(false).color(STEEL_SEAM);
    for (const lx of [-3.5, 0, 3.5]) k.cyl(lx, m1[1], 0, 0.05, 0.02, 1.8, 6);

    // Subterranean Museum circular grass amphitheater & dual curved concrete entry ramps
    k.color(STONE).cyl(0, -1.8, 0, 56, 52, 2.0, 32);
    k.color(LAWN).cyl(0, 0.2, 0, 48, 44, 0.35, 32);
    k.color(STONE_DK).torus(0, 0.45, 0, 36, 1.4, 32, 8);
    k.color(STONE).cyl(0, 0.35, 0, 22, 24, 0.4, 24);
    // Underground museum skylight portal & recessed entry stairs
    k.color(0x2a3642).box(0, 0.4, 26, 24, 0.6, 8);
    k.glow(true).color(GLASS_OBS).box(0, 0.65, 26, 22, 0.35, 6.5);
    // Upward floodlight banks around both legs
    for (const sx of [-1, 1]) {
      k.glow(false).color(STONE).cyl(sx * 91.2, 0, 0, 14.5, 12.2, 0.85, 20);
      k.color(STONE_DK).torus(sx * 91.2, 0.85, 0, 12.2, 0.45, 20, 8);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const fx = sx * 91.2 + Math.cos(ang) * 13.2, fz = Math.sin(ang) * 13.2;
        k.glow(false).color(0x3a4046).box(fx, 0.85, fz, 0.9, 0.45, 0.9);
        k.glow(true).color(0xfff5e0).box(fx, 1.25, fz, 0.65, 0.15, 0.65);
      }
    }
    k.glow(false);
  }
}
