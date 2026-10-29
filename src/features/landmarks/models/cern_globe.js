// feature/famous-landmarks: CERN Science Gateway & Globe of Science and Innovation, Geneva Switzerland — 1:1.
// Iconic 27m warm timber spherical Globe of Science and Innovation with latticed wood brise-soleil skin,
// flanked by Renzo Piano elevated white tubular suspension-bridge pavilions and solar canopies!

export const lodDist = 1800;
export const fineDist = 500;
export const glowStrength = 1.9;

const TIMBER = 0xc47e3b, TIMBER_LT = 0xdf9c55, TIMBER_DK = 0x8f5622;
const TUBE_W = 0xf4f6f9, STEEL = 0xd2dae2, GLASS = 0x456682, SOLAR = 0x1e2836;
const CERN_BLUE = 0x0053a1, LAWN = 0x4e8c45, PAVE = 0xd8d3c8, LIT_WARM = 0xffdd9e, LIT_COOL = 0xe8f4ff;

export const colliders = [
  { x: 26, z: 14, r: 15, h: 27 },
  { x: -12, z: -8, hw: 68, hd: 14, h: 18 },
];

function timberGlobe(k, gx, gz) {
  const hi = k.hi;
  const R = 13.5, cy = 14.0;
  const seg = hi ? 24 : 12, rings = hi ? 12 : 6;

  k.glow(false).color(0x3a4048).cyl(gx, -2.0, gz, 9.2, 8.2, 3.2, seg);

  k.glow(true).color(LIT_WARM).sphere(gx, cy, gz, R * 0.88, hi ? 16 : 8, hi ? 8 : 5, 1.0, 0.92);

  k.glow(false).color(TIMBER).sphere(gx, cy, gz, R, seg, rings, 1.0, 0.90);

  if (hi) {
    k.color(TIMBER_LT);
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      for (let r = 0; r < 5; r++) {
        const lat0 = -0.35 * Math.PI + (r / 5) * 0.75 * Math.PI;
        const lat1 = -0.35 * Math.PI + ((r + 1) / 5) * 0.75 * Math.PI;
        const lon0 = a0 + r * 0.08, lon1 = a0 + (r + 1) * 0.08;
        const p0 = [
          gx + Math.cos(lat0) * Math.cos(lon0) * (R + 0.25),
          cy + Math.sin(lat0) * (R + 0.25),
          gz + Math.cos(lat0) * Math.sin(lon0) * (R + 0.25),
        ];
        const p1 = [
          gx + Math.cos(lat1) * Math.cos(lon1) * (R + 0.25),
          cy + Math.sin(lat1) * (R + 0.25),
          gz + Math.cos(lat1) * Math.sin(lon1) * (R + 0.25),
        ];
        k.strut(p0, p1, 0.36);
      }
    }
  }
  k.color(TIMBER_DK).cyl(gx, cy + R * 0.92, gz, 4.6, 4.8, 0.9, 12);
  k.glow(true).color(LIT_WARM).cyl(gx, cy + R * 0.90, gz, 4.0, 4.0, 0.4, 12);
  k.glow(false);
}

function scienceGateway(k) {
  const hi = k.hi;
  const seg = hi ? 16 : 8;

  k.glow(false).color(STEEL).box(-10, 5.8, -8, 132, 1.0, 7.5).box(-10, 10.2, -8, 132, 0.8, 7.8);
  k.glow(true).color(LIT_COOL).box(-10, 6.8, -8, 130, 3.4, 6.6);
  k.glow(false);

  for (const tx of [-42, 22]) {
    k.push().translate(tx, 8.5, -18).rotateZ(Math.PI / 2);
    k.glow(false).color(TUBE_W).cyl(0, -24, 0, 5.0, 5.0, 48, seg);
    k.glow(true).color(CERN_BLUE).cyl(0, -24.3, 0, 4.4, 4.4, 0.4, seg).cyl(0, 23.9, 0, 4.4, 4.4, 0.4, seg);
    k.color(LIT_COOL).cyl(0, -24.5, 0, 3.2, 3.2, 0.4, seg).cyl(0, 24.1, 0, 3.2, 3.2, 0.4, seg);
    k.pop();

    k.glow(false).color(STEEL);
    k.cyl(tx - 14, 0.4, -18, 0.7, 0.7, 5.5, 6);
    k.cyl(tx + 14, 0.4, -18, 0.7, 0.7, 5.5, 6);
  }

  for (const px of [-54, -10, 34]) {
    k.glow(false).color(GLASS).box(px, 0.4, -22, 26, 13.5, 24);
    k.glow(true).color(LIT_COOL).box(px, 2.0, -22, 26.4, 4.2, 24.4).box(px, 8.2, -22, 26.4, 3.8, 24.4);
    k.glow(false).color(STEEL);
    for (const sx of [-13, 13]) {
      for (const sz of [-13, 13]) {
        k.cyl(px + sx, 0.4, -22 + sz, 0.45, 0.45, 16.2, 6);
      }
    }
    k.color(TUBE_W).box(px, 16.4, -22, 32, 0.7, 32);
    k.color(SOLAR).box(px, 17.1, -22, 30, 0.25, 30);
  }
}

export function build(k) {
  k.glow(false).color(PAVE).box(0, -2.5, 0, 185, 2.9, 105);
  k.color(LAWN).box(-35, 0.4, 18, 86, 0.25, 42).box(42, 0.4, -20, 62, 0.25, 36);

  timberGlobe(k, 26, 14);
  scienceGateway(k);

  k.glow(false).color(0x1f2833).box(-8, 0.4, 32, 16, 1.4, 2.8);
  k.glow(true).color(CERN_BLUE).box(-8, 1.8, 32, 12, 4.2, 1.4);
  k.color(TUBE_W).cyl(-8, 3.8, 32.8, 1.6, 1.6, 0.3, 10);
  k.glow(false);
}
