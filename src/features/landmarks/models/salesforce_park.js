// feature/famous-landmarks: Salesforce Park & Transit Center, San Francisco CA — 1:1.
// 300m-long elevated undulating white woven-metal architectural megastructure crowned by a lush 4-block
// rooftop botanical garden (21m high) with amphitheater, palm/redwood groves, and the iconic Gondola & Grand Hall.

export const lodDist = 2000;
export const fineDist = 550;
export const glowStrength = 1.8;

const STEEL_W = 0xf4f6f9, STEEL_SH = 0xd6dde6, GLASS = 0x567894, GLASS_LT = 0x8bb0cc;
const LAWN = 0x4d8c45, LAWN_LT = 0x62a355, TREE_A = 0x387434, TREE_B = 0x529248, REDWOOD = 0x26582a;
const PATH = 0xdcd6c8, WOOD = 0xbd8e5c, LIT = 0xfff2d2, FOUNTAIN = 0x3fa8d6;

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
      }
    }
  }

  // Rounded glass end-caps (east & west prow noses)
  for (const sx of [-1, 1]) {
    k.glow(false).color(GLASS_LT).cyl(sx * (L - 4), 0.3, 0, D - 2, D - 1, H - 0.8, hi ? 16 : 8);
    k.color(STEEL_W).cyl(sx * (L - 4), H - 1.5, 0, D + 0.5, D + 0.5, 1.8, hi ? 16 : 8);
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
  }
  // West Amphitheater lawn & stage canopy
  k.glow(false).color(LAWN_LT).box(-108, H + 0.8, 0, 32, 0.5, 28);
  k.color(STEEL_W).taper(-124, H + 0.8, 0, 10, 18, 6, 12, 6.5, 2, 0);

  // Rooftop botanical trees (Redwoods, Palms, Oaks along the 300m sky-park)
  for (let x = -92; x <= 112; x += hi ? 16 : 32) {
    const zSide = ((x / 16) | 0) % 2 === 0 ? -11 : 11;
    k.color(0x5c4028).cyl(x, H + 0.8, zSide, 0.45, 0.28, 3.8, 5);
    if (x > 75) {
      // Redwood grove at east end
      k.color(REDWOOD).cyl(x, H + 3.2, zSide, 3.2, 0.2, 9.5, 7);
    } else {
      k.color(x % 32 === 0 ? TREE_A : TREE_B).sphere(x, H + 5.2, zSide, 4.2, hi ? 8 : 5, 5, 0.85);
    }
  }
  k.glow(false);
}
