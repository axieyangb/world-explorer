// feature/famous-landmarks: Googleplex HQ Campus, Mountain View — 1:1 (1600 Amphitheatre Pkwy, 37.4220, -122.0841).
// Buildings 40, 41, 42 & 43 framing the central Googleplex courtyard plaza, connected by glass skybridge
// walkways, solar-panel roof canopies, a sweeping silver dragonscale pavilion canopy on the east lawn,
// colorful Google-palette (#4285F4 Blue, #EA4335 Red, #FBBC05 Yellow, #34A853 Green) architectural accents,
// outdoor cafe parasols, Stan the T-Rex sculpture, and the monumental 3D block-letter GOOGLE campus sculpture.

const G_BLUE = 0x4285f4, G_RED = 0xea4335, G_YELLOW = 0xfbbc05, G_GREEN = 0x34a853;
const G_COLS = [G_BLUE, G_RED, G_YELLOW, G_GREEN, G_BLUE, G_RED];
const WALL = 0xebe8e1, WALL_DK = 0xd4cfc5, GLASS = 0x4e6c86, GLASS_LT = 0x7fa3c2;
const SOLAR = 0x202b3a, STEEL = 0xcfd5dc, CANOPY = 0xdbe1e8, CANOPY_SH = 0xbec7d1;
const LAWN = 0x528d49, PAVE = 0xd8d3c8, WOOD = 0xb5895a, LIT = 0xfff2d2, WHITE = 0xf7f8fa;

export const lodDist = 2200;
export const fineDist = 550;
export const glowStrength = 1.85;

export const colliders = [
  { x: -58, z: -38, hw: 44, hd: 22, h: 17 }, // Building 40 (NW)
  { x: 54, z: -38, hw: 42, hd: 22, h: 17 },  // Building 41 (NE)
  { x: -56, z: 42, hw: 44, hd: 22, h: 17 },  // Building 42 (SW)
  { x: 56, z: 42, hw: 42, hd: 22, h: 17 },   // Building 43 (SE)
  { x: 0, z: -38, hw: 16, hd: 7, h: 15 },    // North Skybridge
  { x: 0, z: 0, hw: 24, hd: 8, h: 9 },       // Central Commons Pavilion
];

/** 3D block letter for "G O O G L E" centred at (cx, y0, z), facing -Z/+Z (double-readable). */
function googleLetter(k, ch, cx, y0, z, w, h, d, col) {
  const t = w * 0.24;
  k.glow(true).color(col);
  if (ch === "G") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx, y0 + h - t, z, w, t, d);
    k.box(cx, y0, z, w, t, d);
    k.box(cx + w / 2 - t / 2, y0, z, t, h * 0.54, d);
    k.box(cx + w * 0.16, y0 + h * 0.46, z, w * 0.68, t * 0.9, d);
  } else if (ch === "O") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx + w / 2 - t / 2, y0, z, t, h, d);
    k.box(cx, y0 + h - t, z, w, t, d);
    k.box(cx, y0, z, w, t, d);
  } else if (ch === "L") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx, y0, z, w, t, d);
  } else if (ch === "E") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx, y0 + h - t, z, w, t, d);
    k.box(cx - w * 0.06, y0 + (h - t) * 0.5, z, w * 0.88, t * 0.9, d);
    k.box(cx, y0, z, w, t, d);
  }
  k.glow(false);
}

/** One Googleplex courtyard wing building with sawtooth solar skylights & Google-colored sunshade fins. */
function campusWing(k, cx, cz, w, d, h, accentCol, faceInSign) {
  const hi = k.hi;
  k.push().translate(cx, 0, cz);
  // Concrete & terracotta-toned base + upper wall frame
  k.glow(false).color(WALL).box(0, -2, 0, w, h + 2, d);
  // Recessed curtain-wall glass bands on all 4 sides
  k.color(GLASS).box(0, 0.6, 0, w + 0.3, h - 1.8, d - 3.2);
  k.color(GLASS).box(0, 0.6, 0, w - 3.2, h - 1.8, d + 0.3);

  // Night-glowing horizontal office floor bands (3 stories)
  k.glow(true).color(LIT);
  for (let fl = 0; fl < 3; fl++) {
    const yf = 1.4 + fl * 4.8;
    k.box(0, yf, 0, w + 0.45, 2.4, d - 5.0);
    k.box(0, yf, 0, w - 5.0, 2.4, d + 0.45);
  }
  k.glow(false);

  // Projecting horizontal floor slab sunshades + colorful Google accent fascia band at roofline
  for (const yf of [4.8, 9.6, 14.4]) {
    k.color(WALL_DK).box(0, yf, 0, w + 1.6, 0.55, d + 1.6);
  }
  k.glow(true).color(accentCol).box(0, h - 0.9, 0, w + 2.0, 1.1, d + 2.0);
  k.glow(false);

  // Courtyard-facing entrance atrium & colored vertical fin brise-soleil
  const fz = faceInSign * (d / 2 + 0.9);
  k.glow(true).color(GLASS_LT).box(0, 0.4, fz, w * 0.34, h + 1.0, 2.4);
  k.glow(false).color(accentCol).box(0, h + 1.0, fz, w * 0.38, 0.7, 3.4);
  if (hi) {
    for (let i = -5; i <= 5; i++) {
      const fx = i * (w * 0.075);
      const col = G_COLS[Math.abs(i) % 4];
      k.color(col).box(fx, 0.8, fz - faceInSign * 0.4, 0.45, h - 1.8, 1.2);
    }
  }

  // Rooftop angled solar arrays & sawtooth skylight monitors
  const nBays = hi ? 5 : 3;
  const bayW = (w - 8) / nBays;
  for (let b = 0; b < nBays; b++) {
    const bx = -w / 2 + 4 + (b + 0.5) * bayW;
    k.color(STEEL).taper(bx, h, 0, bayW * 0.82, d - 8, bayW * 0.4, d - 10, 2.4, 0.8, 0);
    k.color(SOLAR).box(bx - 0.3, h + 2.2, 0, bayW * 0.65, 0.25, d - 9.5);
  }
  k.pop();
}

/** Sweeping catenary dragonscale canopy pavilion on the east plaza lawn. */
function dragonscalePavilion(k, cx, cz, w, d, hPeak) {
  const hi = k.hi;
  const nx = hi ? 12 : 6, nz = hi ? 10 : 5;
  k.push().translate(cx, 0, cz);
  // Recessed glass pavilion beneath the sweeping canopy
  k.glow(true).color(LIT).box(0, 0.4, 0, w * 0.74, hPeak * 0.48, d * 0.74);
  k.glow(false).color(GLASS).box(0, 0.4, 0, w * 0.76, hPeak * 0.52, d * 0.76);

  // Catenary dome surface with dragonscale roof tiles & clerestory eye windows
  const roofY = (u, v) => {
    const r2 = u * u + v * v;
    const base = 4.8 + (hPeak - 4.8) * Math.max(0, 1 - r2 * 0.88);
    const wave = 1.2 * Math.cos(u * Math.PI * 1.5) * Math.cos(v * Math.PI * 1.5);
    return base + wave;
  };
  for (let ix = 0; ix < nx; ix++) {
    const u0 = -1 + (2 * ix) / nx, u1 = -1 + (2 * (ix + 1)) / nx;
    const x0 = u0 * (w / 2), x1 = u1 * (w / 2);
    for (let iz = 0; iz < nz; iz++) {
      const v0 = -1 + (2 * iz) / nz, v1 = -1 + (2 * (iz + 1)) / nz;
      const z0 = v0 * (d / 2), z1 = v1 * (d / 2);
      const p00 = [x0, roofY(u0, v0), z0], p10 = [x1, roofY(u1, v0), z0];
      const p11 = [x1, roofY(u1, v1), z1], p01 = [x0, roofY(u0, v1), z1];
      k.color((ix + iz) % 2 === 0 ? CANOPY : CANOPY_SH);
      k.quadN(p00, p10, p11, p01, [0, 1, 0]);
    }
  }
  // Angled perimeter V-struts holding the canopy edge
  k.color(STEEL);
  for (let i = -3; i <= 3; i++) {
    const px = i * (w * 0.14);
    for (const sz of [-1, 1]) {
      const pz = sz * (d / 2);
      k.strut([px * 0.92, 0.2, pz * 0.88], [px, roofY(px / (w / 2), sz), pz], 0.55);
    }
  }
  k.pop();
}

export function build(k) {
  const hi = k.hi;

  // 1. Open central Googleplex courtyard lawn & plaza walkways (flush with ground, no perimeter wall/slab)
  k.glow(false).color(LAWN).box(0, -0.3, 0, 152, 0.36, 40);
  k.color(PAVE).box(0, -0.2, 0, 132, 0.30, 32);
  k.color(PAVE).box(0, -0.2, 0, 32, 0.30, 112);
  k.color(WOOD).cyl(0, 0.08, 0, 16, 16, 0.14, hi ? 24 : 12);

  // 2. Four main Googleplex courtyard buildings (B40, B41, B42, B43) with Google-palette accents
  campusWing(k, -58, -38, 86, 42, 15.6, G_BLUE, 1);
  campusWing(k, 54, -38, 82, 42, 15.6, G_RED, 1);
  campusWing(k, -56, 42, 86, 42, 15.6, G_YELLOW, -1);
  campusWing(k, 56, 42, 82, 42, 15.6, G_GREEN, -1);

  // 3. Elevated glass Skybridge connecting north buildings + colored structural arch
  k.glow(true).color(GLASS_LT).box(0, 9.2, -38, 32, 4.4, 9.5);
  k.glow(false).color(STEEL).box(0, 8.6, -38, 34, 0.6, 11.0).box(0, 13.6, -38, 34, 0.6, 11.0);
  k.color(G_BLUE).strut([-12, 0.2, -33], [-6, 8.8, -33], 0.9).strut([12, 0.2, -33], [6, 8.8, -33], 0.9);

  // 4. Sweeping silver dragonscale pavilion canopy on the East Courtyard lawn
  dragonscalePavilion(k, 84, 0, 44, 34, 12.5);

  // 5. Monumental 3D block-letter "G O O G L E" sculpture at the main South & Central Plaza
  const letters = ["G", "O", "O", "G", "L", "E"];
  const lw = 5.4, lh = 7.6, ld = 2.0, gap = 7.0;
  const startX = -((letters.length - 1) * gap) / 2;
  // White marble pedestal plinth
  k.glow(true).color(WHITE).box(0, 0.3, -16, 48, 1.4, 4.6);
  for (let i = 0; i < letters.length; i++) {
    googleLetter(k, letters[i], startX + i * gap, 1.7, -16, lw, lh, ld, G_COLS[i]);
  }
  // Second roadside GOOGLE monument sign at the south entrance
  k.glow(true).color(WHITE).box(0, 0.3, 66, 36, 1.1, 3.6);
  for (let i = 0; i < letters.length; i++) {
    googleLetter(k, letters[i], (-2.5 + i) * 5.2, 1.4, 66, 3.9, 5.4, 1.5, G_COLS[i]);
  }

  // 6. Colorful Google plaza parasols / umbrellas & Android green sculpture + T-Rex "Stan"
  const parasolSpots = [
    [-26, -6], [-18, 4], [-10, -5], [10, 5], [18, -4], [26, 6],
    [-32, 12], [32, -12], [-14, 14], [14, -14],
  ];
  for (let i = 0; i < parasolSpots.length; i++) {
    const [px, pz] = parasolSpots[i];
    k.glow(false).color(STEEL).cyl(px, 0.3, pz, 0.15, 0.15, 3.4, 5);
    k.glow(true).color(G_COLS[i % 4]).cyl(px, 3.4, pz, 3.2, 0.2, 1.1, hi ? 12 : 6);
  }
  // Bugdroid green lawn statue
  k.glow(true).color(G_GREEN);
  k.cyl(-36, 0.4, -14, 2.2, 2.2, 3.0, 12);
  k.sphere(-36, 3.5, -14, 2.2, 12, 6, 0.85, 0.5);
  k.glow(false);

  // "Stan" the bronze T-Rex skeleton replica in the courtyard
  if (hi) {
    k.color(0x5a4c3c);
    k.strut([34, 0.4, 12], [36, 4.2, 12], 0.55);
    k.strut([32, 0.4, 14], [35, 4.2, 14], 0.55);
    k.strut([25, 2.2, 13], [29, 3.2, 13], 0.42);
    k.strut([29, 3.2, 13], [40, 5.2, 13], 0.85);
    for (let r = 0; r < 5; r++) {
      const rx = 34.5 + r * 0.9, ry = 4.2 + r * 0.15;
      k.strut([rx, ry, 12.1], [rx, ry - 1.3, 11.7], 0.18);
      k.strut([rx, ry, 13.9], [rx, ry - 1.3, 14.3], 0.18);
    }
    k.box(41.2, 4.9, 13, 2.4, 1.2, 1.2);
    k.box(41.4, 4.2, 13, 2.1, 0.45, 1.0);
  }
}
