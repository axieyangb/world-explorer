// feature/famous-landmarks: CERN Science Gateway & Globe of Science and Innovation, Geneva Switzerland — 1:1.
// Iconic 27m warm timber spherical Globe of Science and Innovation with 18 curved outer glulam timber arches,
// latticed spruce brise-soleil skin, internal helical ramp, Renzo Piano elevated white tubular suspension-bridge
// pavilions with stay cables & solar canopies, and the Wandering the Immeasurable ribbon sculpture in the plaza.

export const lodDist = 1800;
export const fineDist = 500;
export const glowStrength = 1.9;

const TIMBER = 0xc47e3b, TIMBER_LT = 0xdf9c55, TIMBER_DK = 0x8f5622;
const TUBE_W = 0xf4f6f9, STEEL = 0xd2dae2, GLASS = 0x456682, SOLAR = 0x1e2836;
const CERN_BLUE = 0x0053a1, LAWN = 0x4e8c45, PAVE = 0xd8d3c8, LIT_WARM = 0xffdd9e, LIT_COOL = 0xe8f4ff;
const TREE = 0x3b7638;

export const colliders = [
  { x: 26, z: 14, r: 15, h: 27 },
  { x: -12, z: -8, hw: 68, hd: 14, h: 18 },
];

function timberGlobe(k, gx, gz) {
  const hi = k.hi;
  const R = 13.5, cy = 14.0;
  const seg = hi ? 28 : 12, rings = hi ? 14 : 6;

  k.glow(false).color(0x3a4048).cyl(gx, -2.0, gz, 9.2, 8.2, 3.2, seg);
  if (hi) {
    k.color(STEEL).box(gx, 0.8, gz - 11.5, 4.2, 0.35, 9.5);
    k.color(GLASS).box(gx - 1.95, 1.15, gz - 11.5, 0.14, 1.1, 9.2).box(gx + 1.95, 1.15, gz - 11.5, 0.14, 1.1, 9.2);
  }

  k.glow(true).color(LIT_WARM).sphere(gx, cy, gz, R * 0.86, hi ? 18 : 8, hi ? 10 : 5, 1.0, 0.92);
  k.glow(false).color(TIMBER).sphere(gx, cy, gz, R, seg, rings, 1.0, 0.90);

  if (hi) {
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      for (let r = 0; r < 8; r++) {
        const lat0 = -0.38 * Math.PI + (r / 8) * 0.78 * Math.PI;
        const lat1 = -0.38 * Math.PI + ((r + 1) / 8) * 0.78 * Math.PI;
        const m0 = [
          gx + Math.cos(lat0) * Math.cos(a0) * (R + 0.38),
          cy + Math.sin(lat0) * (R + 0.38),
          gz + Math.cos(lat0) * Math.sin(a0) * (R + 0.38),
        ];
        const m1 = [
          gx + Math.cos(lat1) * Math.cos(a0) * (R + 0.38),
          cy + Math.sin(lat1) * (R + 0.38),
          gz + Math.cos(lat1) * Math.sin(a0) * (R + 0.38),
        ];
        k.color(TIMBER_DK).strut(m0, m1, 0.42);

        const lon0 = a0 + r * 0.08, lon1 = a0 + (r + 1) * 0.08;
        const p0 = [
          gx + Math.cos(lat0) * Math.cos(lon0) * (R + 0.22),
          cy + Math.sin(lat0) * (R + 0.22),
          gz + Math.cos(lat0) * Math.sin(lon0) * (R + 0.22),
        ];
        const p1 = [
          gx + Math.cos(lat1) * Math.cos(lon1) * (R + 0.22),
          cy + Math.sin(lat1) * (R + 0.22),
          gz + Math.cos(lat1) * Math.sin(lon1) * (R + 0.22),
        ];
        k.color(TIMBER_LT).strut(p0, p1, 0.30);
      }
    }
    k.color(STEEL);
    for (const latDeg of [-35, -12, 12, 35, 55]) {
      const lat = (latDeg * Math.PI) / 180;
      const rr = Math.cos(lat) * (R + 0.32), ry = cy + Math.sin(lat) * (R + 0.32);
      k.cyl(gx, ry, gz, rr, rr, 0.22, 24);
    }
  }
  k.color(TIMBER_DK).cyl(gx, cy + R * 0.92, gz, 4.6, 4.8, 0.9, 16);
  k.glow(true).color(LIT_WARM).cyl(gx, cy + R * 0.90, gz, 4.0, 4.0, 0.4, 16);
  k.glow(false);
}

function scienceGateway(k) {
  const hi = k.hi;
  const seg = hi ? 20 : 8;

  k.glow(false).color(STEEL).box(-10, 5.8, -8, 132, 1.0, 7.5).box(-10, 10.2, -8, 132, 0.8, 7.8);
  k.glow(true).color(LIT_COOL).box(-10, 6.8, -8, 130, 3.4, 6.6);
  k.glow(false);
  if (hi) {
    k.color(STEEL);
    for (let bx = -72; bx <= 52; bx += 8.0) {
      k.box(bx, 5.8, -8, 0.35, 4.8, 7.9);
      if (bx % 24 === 0) {
        k.cyl(bx, 0.4, -11.2, 0.45, 0.45, 5.6, 6);
        k.cyl(bx, 0.4, -4.8, 0.45, 0.45, 5.6, 6);
      }
    }
  }

  for (const tx of [-42, 22]) {
    k.push().translate(tx, 8.5, -18).rotateZ(Math.PI / 2);
    k.glow(false).color(TUBE_W).cyl(0, -24, 0, 5.0, 5.0, 48, seg);
    if (hi) {
      k.color(STEEL);
      for (let ty = -22; ty <= 22; ty += 4.4) {
        k.cyl(0, ty, 0, 5.18, 5.18, 0.28, seg);
      }
    }
    k.glow(true).color(CERN_BLUE).cyl(0, -24.3, 0, 4.4, 4.4, 0.4, seg).cyl(0, 23.9, 0, 4.4, 4.4, 0.4, seg);
    k.color(LIT_COOL).cyl(0, -24.5, 0, 3.2, 3.2, 0.4, seg).cyl(0, 24.1, 0, 3.2, 3.2, 0.4, seg);
    if (hi) {
      k.glow(false).color(STEEL);
      for (const ey of [-24.55, 24.15]) {
        k.box(0, ey, 0, 8.8, 0.22, 0.35).box(0, ey, 0, 0.35, 0.22, 8.8);
        k.cyl(0, ey - 0.1, 0, 1.35, 1.35, 0.35, 12);
      }
    }
    k.pop();

    k.glow(false).color(STEEL);
    for (const dx of [-14, 14]) {
      k.cyl(tx + dx, 0.4, -18, 0.7, 0.7, 5.5, 8);
      if (hi) {
        k.strut([tx + dx, 3.5, -18], [tx + dx, 7.2, -14.2], 0.55);
        k.strut([tx + dx, 3.5, -18], [tx + dx, 7.2, -21.8], 0.55);
      }
    }
  }

  for (const px of [-54, -10, 34]) {
    k.glow(false).color(GLASS).box(px, 0.4, -22, 26, 13.5, 24);
    k.glow(true).color(LIT_COOL).box(px, 2.0, -22, 26.4, 4.2, 24.4).box(px, 8.2, -22, 26.4, 3.8, 24.4);
    k.glow(false).color(STEEL);
    for (const sx of [-13, 13]) {
      for (const sz of [-13, 13]) {
        k.cyl(px + sx, 0.4, -22 + sz, 0.45, 0.45, 16.2, 6);
        if (hi) {
          k.strut([px + sx, 13.8, -22 + sz], [px + sx * 0.65, 16.4, -22 + sz * 0.65], 0.22);
        }
      }
    }
    k.color(TUBE_W).box(px, 16.4, -22, 32, 0.7, 32);
    k.color(SOLAR).box(px, 17.1, -22, 30, 0.25, 30);
    if (hi) {
      k.color(STEEL);
      for (let g = -12; g <= 12; g += 6) {
        k.box(px + g, 17.34, -22, 0.18, 0.08, 30);
        k.box(px, 17.34, -22 + g, 30, 0.08, 0.18);
      }
    }
  }
}

export function build(k) {
  const hi = k.hi;
  k.glow(false).color(PAVE).box(0, -2.5, 0, 185, 2.9, 105);
  k.color(LAWN).box(-35, 0.4, 18, 86, 0.25, 42).box(42, 0.4, -20, 62, 0.25, 36);

  timberGlobe(k, 26, 14);
  scienceGateway(k);

  k.glow(false).color(0x1f2833).box(-8, 0.4, 32, 16, 1.4, 2.8);
  k.glow(true).color(CERN_BLUE).box(-8, 1.8, 32, 12, 4.2, 1.4);
  k.color(TUBE_W).cyl(-8, 3.8, 32.8, 1.6, 1.6, 0.3, 12);
  k.glow(false);

  if (hi) {
    const sx = 6, sz = 16;
    k.color(STEEL);
    for (let i = 0; i < 20; i++) {
      const t0 = (i / 20) * Math.PI * 2.8, t1 = ((i + 1) / 20) * Math.PI * 2.8;
      const r0 = 3.2 - i * 0.09, r1 = 3.2 - (i + 1) * 0.09;
      const p0 = [sx + Math.cos(t0) * r0, 0.5 + i * 0.42, sz + Math.sin(t0) * r0];
      const p1 = [sx + Math.cos(t1) * r1, 0.5 + (i + 1) * 0.42, sz + Math.sin(t1) * r1];
      k.strut(p0, p1, 0.45);
    }
    k.color(0x3a4048).box(-34, 0.4, 10, 1.2, 1.0, 1.4).box(-24, 0.4, 10, 1.2, 1.0, 1.4);
    k.push().translate(-29, 1.9, 10).rotateZ(Math.PI / 2);
    k.color(CERN_BLUE).cyl(0, -7.2, 0, 0.72, 0.72, 14.4, 12);
    k.color(STEEL).cyl(0, -7.4, 0, 0.78, 0.78, 0.35, 12).cyl(0, 7.05, 0, 0.78, 0.78, 0.35, 12);
    k.pop();

    for (let i = 0; i < 18; i++) {
      const tx = -68 + ((i * 23) % 135);
      const tz = i % 2 === 0 ? 14 + (i % 4) * 5.5 : -36 - (i % 3) * 3.5;
      if (Math.hypot(tx - 26, tz - 14) < 18) continue;
      k.color(0x5a4028).cyl(tx, 0.5, tz, 0.32, 0.20, 3.2, 5);
      k.color(TREE).sphere(tx, 4.8, tz, 2.8 + (i % 3) * 0.5, 7, 5, 0.9);
    }
  }
}
