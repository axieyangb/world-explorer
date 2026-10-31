// feature/famous-landmarks: Salesforce Park & Transit Center, San Francisco CA — 1:1.
// 300m-long elevated undulating white woven-metal architectural megastructure crowned by a lush 4-block
// rooftop botanical garden (21m high) with amphitheater, palm/redwood groves, arched Grand Hall skylight ribs,
// West Bus Deck cable-stayed bridge ramp, and the iconic inclined Gondola from Mission Square Plaza.

export const lodDist = 2000;
export const fineDist = 550;
export const glowStrength = 1.8;

const STEEL_W = 0xf4f6f9, STEEL_SH = 0xd6dde6, GLASS = 0x567894, GLASS_LT = 0x8bb0cc;
const LAWN = 0x4d8c45, LAWN_LT = 0x62a355, TREE_A = 0x387434, TREE_B = 0x529248, REDWOOD = 0x26582a;
const PATH = 0xdcd6c8, WOOD = 0xbd8e5c, LIT = 0xfff2d2, FOUNTAIN = 0x3fa8d6, DARK = 0x2b3440;

const L = 148, D = 26, H = 21.5;

export const colliders = [
  { x: 0, z: 0, hw: L, hd: D, h: H },
];

export function build(k) {
  const hi = k.hi;
  const segX = hi ? 24 : 10;

  // 1. Street-level plaza & bus deck columns
  k.glow(false).color(PATH).box(0, -2.5, 0, L * 2 + 12, 2.8, D * 2 + 12);
  k.color(GLASS).box(0, 0.3, 0, L * 2 - 8, H - 2.2, D * 2 - 6);

  // Night-glowing Grand Hall & Bus Concourse floor bands
  k.glow(true).color(LIT);
  k.box(0, 1.8, 0, L * 2 - 6, 4.5, D * 2 - 4);
  k.box(0, 11.2, 0, L * 2 - 5, 4.2, D * 2 - 3);
  k.glow(false);

  // 2. Undulating Pelli Clarke Pelli white perforated metal veil & diagonal structural columns
  for (let i = 0; i < segX; i++) {
    const u0 = i / segX, u1 = (i + 1) / segX;
    const x0 = -L + u0 * (2 * L), x1 = -L + u1 * (2 * L);
    const wave0 = Math.sin(u0 * Math.PI * 3) * 2.2, wave1 = Math.sin(u1 * Math.PI * 3) * 2.2;
    const zF0 = -D - wave0, zF1 = -D - wave1;
    const zB0 = D + wave0, zB1 = D + wave1;

    // White sculpted veil fascia band along the upper levels
    k.color(STEEL_W);
    k.quadN([x0, 8.5, zF0], [x1, 8.5, zF1], [x1, H, zF1], [x0, H, zF0], [0, 0, -1]);
    k.quadN([x1, 8.5, zB1], [x0, 8.5, zB0], [x0, H, zB0], [x1, H, zB1], [0, 0, 1]);

    // V-shaped architectural white steel support columns & diagonal lattice
    if (hi || i % 2 === 0) {
      k.color(STEEL_SH);
      const xm = (x0 + x1) * 0.5, zFm = (zF0 + zF1) * 0.5, zBm = (zB0 + zB1) * 0.5;
      k.strut([x0, 0.3, -D + 1.5], [xm, 8.8, zFm], 0.75);
      k.strut([x1, 0.3, -D + 1.5], [xm, 8.8, zFm], 0.75);
      k.strut([x0, 0.3, D - 1.5], [xm, 8.8, zBm], 0.75);
      k.strut([x1, 0.3, D - 1.5], [xm, 8.8, zBm], 0.75);
      if (hi) {
        k.color(STEEL_W);
        k.strut([x0, 8.8, zF0 - 0.2], [x1, H, zF1 - 0.2], 0.42);
        k.strut([x1, 8.8, zF1 - 0.2], [x0, H, zF0 - 0.2], 0.42);
        k.strut([x0, 8.8, zB0 + 0.2], [x1, H, zB1 + 0.2], 0.42);
        k.strut([x1, 8.8, zB1 + 0.2], [x0, H, zB0 + 0.2], 0.42);
        for (const yh of [8.6, 14.8, H - 0.2]) {
          k.strut([x0, yh, zF0 - 0.25], [x1, yh, zF1 - 0.25], 0.35);
          k.strut([x0, yh, zB0 + 0.25], [x1, yh, zB1 + 0.25], 0.35);
        }
      }
    }
  }

  // Rounded glass end-caps (east & west prow noses)
  for (const sx of [-1, 1]) {
    k.glow(false).color(GLASS_LT).cyl(sx * (L - 4), 0.3, 0, D - 2, D - 1, H - 0.8, hi ? 16 : 8);
    k.color(STEEL_W).cyl(sx * (L - 4), H - 1.5, 0, D + 0.5, D + 0.5, 1.8, hi ? 16 : 8);
    if (hi) {
      for (let a = 0; a < 9; a++) {
        const ang = (sx > 0 ? -Math.PI / 2 : Math.PI / 2) + (a / 8) * Math.PI;
        const px = sx * (L - 4) + Math.cos(ang) * (D - 0.8);
        const pz = Math.sin(ang) * (D - 0.8);
        k.color(STEEL_W).cyl(px, 0.3, pz, 0.32, 0.32, H - 1.2, 6);
      }
    }
  }

  // 3. Rooftop Botanical Park Deck (at y = H = 21.5m)
  k.glow(false).color(PATH).box(0, H - 0.5, 0, L * 2 - 8, 0.9, D * 2 - 2);
  k.color(LAWN).box(0, H + 0.4, 0, L * 2 - 18, 0.45, D * 2 - 8);
  // Central walking boardwalk & Bus Fountain strip
  k.color(WOOD).box(0, H + 0.85, 0, L * 2 - 26, 0.2, 5.5);
  k.glow(true).color(FOUNTAIN).box(-15, H + 0.9, 6.5, 95, 0.25, 1.8);
  // Domed glass skylights into the Grand Hall below
  k.color(GLASS_LT);
  for (const sx of [-58, 0, 58]) {
    k.sphere(sx, H + 0.5, -5.5, 7.5, hi ? 14 : 8, 5, 0.42, 0.5);
    if (hi) {
      k.glow(false).color(STEEL_W);
      for (let r = 0; r < 6; r++) {
        const ra = (r / 6) * Math.PI;
        const dx = Math.cos(ra) * 7.6, dz = Math.sin(ra) * 7.6;
        k.arch(sx, H + 0.6, -5.5, 15.2 * Math.abs(Math.cos(ra)) + 0.5, 3.3, 0.22, 8, 4);
        k.strut([sx - dx, H + 0.6, -5.5 - dz], [sx + dx, H + 0.6, -5.5 + dz], 0.24);
      }
      k.glow(true).color(GLASS_LT);
    }
  }
  // West Amphitheater lawn & stage canopy
  k.glow(false).color(LAWN_LT).box(-108, H + 0.8, 0, 32, 0.5, 28);
  k.color(STEEL_W).taper(-124, H + 0.8, 0, 10, 18, 6, 12, 6.5, 2, 0);

  // Close-up: Mission Square Inclined Gondola, Rooftop Glass Balustrade, Timber Pergolas & West Bus Ramp Bridge
  if (hi) {
    k.color(GLASS_LT);
    k.box(0, H + 0.8, -D + 1.2, L * 2 - 24, 1.1, 0.14);
    k.box(0, H + 0.8, D - 1.2, L * 2 - 24, 1.1, 0.14);

    // Salesforce Park Gondola rising at an angle from Mission Square Plaza (North-West side) to Park Deck
    const gx0 = -78, gz0 = -D - 16, gy0 = 0.3;
    const gx1 = -78, gz1 = -D + 0.5, gy1 = H + 2.2;
    k.color(STEEL_W);
    k.strut([gx0 - 1.8, gy0, gz0], [gx0 - 0.8, gy0 + 8.5, gz0 + 3.0], 0.65);
    k.strut([gx0 + 1.8, gy0, gz0], [gx0 + 0.8, gy0 + 8.5, gz0 + 3.0], 0.65);
    k.strut([gx1 - 1.4, H - 1.0, gz1], [gx1 - 0.9, gy1 + 2.6, gz1], 0.55);
    k.strut([gx1 + 1.4, H - 1.0, gz1], [gx1 + 0.9, gy1 + 2.6, gz1], 0.55);
    k.color(STEEL_SH);
    k.strut([gx0 - 0.7, gy0 + 4.0, gz0], [gx1 - 0.7, gy1 + 1.6, gz1], 0.28);
    k.strut([gx0 + 0.7, gy0 + 4.0, gz0], [gx1 + 0.7, gy1 + 1.6, gz1], 0.28);
    const cmx = gx0, cmy = (gy0 + gy1) * 0.52, cmz = (gz0 + gz1) * 0.52;
    k.color(STEEL_W).box(cmx, cmy + 2.2, cmz, 2.8, 0.4, 4.2);
    k.glow(true).color(LIT).box(cmx, cmy, cmz, 2.6, 2.2, 4.0).glow(false);
    k.color(DARK).strut([cmx, cmy + 2.6, cmz], [cmx, cmy + 3.9, cmz], 0.32);

    // Iconic West Bus Deck white cable-stayed bridge ramp curving out of the West end (x = -L)
    const rx0 = -L + 2, rx1 = -L - 26;
    k.color(STEEL_W).strut([rx0, 11.2, 4], [rx1, 9.5, 12], 7.5);
    k.color(DARK).strut([rx0, 11.6, 4], [rx1, 9.9, 12], 6.2);
    const px = -L - 12, pz = 2.0;
    k.color(STEEL_W).strut([px, 0.3, pz], [px - 3, 29.5, pz - 1.5], 1.15);
    for (let c = 0; c < 5; c++) {
      const u = (c + 0.5) / 5;
      k.color(STEEL_SH).strut([px - 3, 27.5 - c * 1.2, pz - 1.5], [rx0 + (rx1 - rx0) * u, 11.5 - u * 1.6, 4 + u * 8], 0.14);
    }

    // Central Park Cafe Pavilion & timber trellis pergolas with benches along the boardwalk
    k.color(WOOD).box(18, H + 0.85, -8.5, 16, 3.6, 8.5);
    k.glow(true).color(LIT).box(18, H + 1.1, -8.5, 14.8, 2.8, 7.6).glow(false);
    for (const pxPerg of [-36, 42, 84]) {
      for (let b = -3; b <= 3; b++) {
        k.color(WOOD).box(pxPerg + b * 1.4, H + 3.6, 0, 0.28, 0.35, 6.4);
      }
      k.color(STEEL_SH).cyl(pxPerg - 3.8, H + 0.85, -2.8, 0.16, 0.16, 2.8, 5);
      k.cyl(pxPerg + 3.8, H + 0.85, -2.8, 0.16, 0.16, 2.8, 5);
      k.cyl(pxPerg - 3.8, H + 0.85, 2.8, 0.16, 0.16, 2.8, 5);
      k.cyl(pxPerg + 3.8, H + 0.85, 2.8, 0.16, 0.16, 2.8, 5);
      k.color(WOOD).box(pxPerg, H + 0.9, -2.3, 4.2, 0.55, 0.85).box(pxPerg, H + 0.9, 2.3, 4.2, 0.55, 0.85);
    }
    // Bus Fountain vertical water-jet plumes triggered along the boardwalk
    k.glow(true).color(0xd8f3ff);
    for (let jx = -56; jx <= 26; jx += 6.5) {
      k.cyl(jx, H + 1.1, 6.5, 0.18, 0.05, 1.4 + ((jx * 7) & 1) * 0.8, 5);
    }
    k.glow(false);
  }

  // Rooftop botanical trees (Redwoods, Palms, Oaks along the 300m sky-park)
  for (let x = -92; x <= 112; x += hi ? 14 : 32) {
    const zSide = ((x / 14) | 0) % 2 === 0 ? -11 : 11;
    k.color(0x5c4028).cyl(x, H + 0.8, zSide, 0.45, 0.28, 3.8, 5);
    if (x > 75) {
      k.color(REDWOOD).cyl(x, H + 3.2, zSide, 3.2, 0.2, 9.5, 7);
    } else {
      k.color(x % 28 === 0 ? TREE_A : TREE_B).sphere(x, H + 5.2, zSide, 4.2, hi ? 8 : 5, 5, 0.85);
    }
  }
  k.glow(false);
}
