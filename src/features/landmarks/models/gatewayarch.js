// feature/famous-landmarks: Gateway Arch, St. Louis — 1:1 (192 m tall, 192 m outer span).
// Weighted catenary (NPS centroid formula, feet): y = 693.8597 - 68.7672 cosh(0.0100333 x), |x| <= 299.2239.
// Hollow equilateral-triangle section, 16.5 m sides at the feet tapering to 5.2 m at the top; flat face
// on the outside (extrados), sharp edge on the inside. Stainless steel; floodlit at night.
const STEEL = 0xc9ced3, STEEL_DK = 0x9ea4aa;

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
  const N = hi ? 72 : 24;
  // centroid points + tangent-based frames
  const sec = [];
  for (let i = 0; i <= N; i++) {
    // denser sampling near the feet is unnecessary: uniform in x reads fine
    const xf = -XMAX + (2 * XMAX * i) / N;
    const x = xf * FT, y = cy(xf);
    // in-plane normal pointing outward (away from the arch interior)
    const dy = -FT * 68.7672 * 0.0100333 * Math.sinh(0.0100333 * xf); // dy/dx (both in m since FT cancels for slope)
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
    // landscaped mounds / plinth around the feet
    k.color(0xb9b4aa);
    for (const sx of [-1, 1]) k.cyl(sx * 91.2, 0, 0, 13, 11, 0.6, 12);
  }
}
