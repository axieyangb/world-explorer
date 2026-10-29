// feature/famous-landmarks: OpenAI HQ / Mission Bay Campus, San Francisco CA — 1:1.
// Sleek modern glass-and-limestone curved atrium buildings with landscaped rooftop terraces,
// warm interior studio lighting, and a sculptural OpenAI hexagonal blossom monument in the entry plaza.

export const lodDist = 1800;
export const fineDist = 500;
export const glowStrength = 1.9;

const LIMESTONE = 0xebe6dc, STONE_SH = 0xd2cbc0, GLASS = 0x3b5266, GLASS_LT = 0x6f94b0;
const DARK_METAL = 0x1e242b, EMERALD = 0x10a37f, BLOSSOM_W = 0xf8fafc;
const LAWN = 0x528f48, TREE = 0x3d7a3a, WOOD = 0xb88958, LIT = 0xfff1d0;

export const colliders = [
  { x: -34, z: -8, hw: 28, hd: 36, h: 28 },
  { x: 34, z: -8, hw: 28, hd: 36, h: 28 },
  { x: 0, z: -18, hw: 18, hd: 16, h: 24 },
  { x: 0, z: 32, r: 9, h: 11 },
];

/** Stepped glass-and-limestone wing with curved corner spandrels & landscaped roof terraces. */
function campusWing(k, cx, cz, signX) {
  const hi = k.hi;
  k.push().translate(cx, 0, cz);

  // 6-story main architectural block (26m tall)
  k.glow(false).color(STONE_SH).box(0, -2.5, 0, 52, 2.9, 68);
  k.color(GLASS).box(0, 0.4, 0, 48, 24.5, 64);

  // Horizontal warm limestone spandrel bands & cantilevered terrace slabs at every floor
  for (let fl = 0; fl <= 5; fl++) {
    const y = 0.4 + fl * 4.1;
    const isTerrace = fl >= 4;
    const w = isTerrace ? 48 - (fl - 3) * 6 : 50.4;
    const d = isTerrace ? 64 - (fl - 3) * 8 : 66.4;
    k.glow(false).color(LIMESTONE).box(-signX * (fl >= 4 ? (fl - 3) * 2.5 : 0), y, 0, w, 0.95, d);
    if (fl < 5) {
      k.glow(true).color(LIT).box(-signX * (fl >= 4 ? (fl - 3) * 2.5 : 0), y + 1.1, 0, w - 1.6, 2.5, d - 1.6);
    }
  }

  // Landscaped rooftop garden terraces on upper setbacks
  k.glow(false).color(LAWN).box(-signX * 3, 25.0, 0, 36, 0.45, 46);
  k.color(WOOD).box(signX * 14, 21.0, 0, 10, 0.4, 52);
  if (hi) {
    // Rooftop olive/bay trees & glass skylight pavilion
    for (const tz of [-16, 0, 16]) {
      k.color(TREE).sphere(signX * 14, 23.2, tz, 2.6, 8, 5, 0.85);
      k.color(TREE).sphere(-signX * 4, 27.2, tz, 2.8, 8, 5, 0.85);
    }
    // Vertical dark-bronze mullion fins
    k.color(DARK_METAL);
    for (let z = -28; z <= 28; z += 8) {
      k.strut([-24.3, 0.4, z], [-24.3, 20.9, z], 0.32);
      k.strut([24.3, 0.4, z], [24.3, 20.9, z], 0.32);
    }
  }

  k.pop();
}

/** Sculptural 6-fold OpenAI Spiral Blossom Monument in the entry courtyard. */
function openaiBlossomMonument(k, cx, cz) {
  const hi = k.hi;
  k.push().translate(cx, 0, cz);

  // Circular travertine reflection pool & dark granite plinth
  k.glow(false).color(LIMESTONE).cyl(0, 0.3, 0, 9.5, 10.2, 0.8, hi ? 24 : 12);
  k.color(0x225a6e).cyl(0, 0.9, 0, 8.4, 8.4, 0.35, hi ? 24 : 12);
  k.color(DARK_METAL).cyl(0, 1.1, 0, 3.6, 4.2, 1.4, 12);

  // Vertical 3D sculptural OpenAI 6-petal interwoven knot standing at y = 6.5m
  const cy = 6.6;
  k.push().translate(0, cy, 0);
  // Central dark background disc + glowing emerald accent ring
  k.glow(false).color(DARK_METAL). rotateX(Math.PI / 2).cyl(0, -0.45, 0, 4.3, 4.3, 0.9, hi ? 24 : 12);
  k.pop();

  // 6 interwoven white & emerald petals around the hexagonal core
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const aNext = ((i + 1) / 6) * Math.PI * 2;
    const rIn = 1.45, rMid = 3.35, rOut = 3.85;
    const p0 = [Math.cos(a) * rIn, cy + Math.sin(a) * rIn, 0.65];
    const p1 = [Math.cos(a + 0.32) * rMid, cy + Math.sin(a + 0.32) * rMid, 0.65];
    const p2 = [Math.cos(aNext + 0.15) * rOut, cy + Math.sin(aNext + 0.15) * rOut, 0.65];
    const p3 = [Math.cos(aNext) * rIn, cy + Math.sin(aNext) * rIn, 0.65];
    k.glow(true).color(BLOSSOM_W);
    k.strut(p0, p1, 0.72);
    k.strut(p1, p2, 0.72);
    k.strut(p2, p3, 0.62);
    // Back face duplicate so monument is visible from both street and courtyard
    const b0 = [p0[0], p0[1], -0.65], b1 = [p1[0], p1[1], -0.65], b2 = [p2[0], p2[1], -0.65];
    k.strut(b0, b1, 0.72);
    k.strut(b1, b2, 0.72);
  }
  // Glowing OpenAI Emerald base halo ring
  k.glow(true).color(EMERALD).cyl(0, 2.35, 0, 3.7, 3.7, 0.35, 12);
  k.glow(false);
  k.pop();
}

export function build(k) {
  // 1. Mission Bay plaza, wooden lounge decks & landscaped courtyard
  k.glow(false).color(LIMESTONE).box(0, -2.5, 0, 145, 2.9, 115);
  k.color(LAWN).box(0, 0.4, 8, 36, 0.25, 48);
  k.color(WOOD).box(0, 0.45, -2, 28, 0.3, 18);

  // 2. West & East Glass-and-Limestone Campus Wings
  campusWing(k, -38, -6, -1);
  campusWing(k, 38, -6, 1);

  // 3. Curved Central Glass Atrium & Double-Deck Skybridge linking the wings
  k.glow(false).color(GLASS_LT).box(0, 0.4, -22, 32, 21.5, 26);
  k.color(LIMESTONE).box(0, 21.9, -22, 34, 1.1, 28);
  k.glow(true).color(LIT);
  for (const y of [2.2, 7.5, 12.8, 17.6]) k.box(0, y, -22, 32.4, 2.8, 26.4);
  // South elevated glass bridge
  k.glow(false).color(LIMESTONE).box(0, 12.5, 12, 30, 1.0, 9.5).box(0, 17.2, 12, 30, 0.9, 9.5);
  k.glow(true).color(GLASS_LT).box(0, 13.5, 12, 29, 3.7, 8.8);
  k.glow(false);

  // 4. Sculptural OpenAI Blossom Monument in the front plaza
  openaiBlossomMonument(k, 0, 34);
}
