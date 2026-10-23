// feature/famous-landmarks: Brandenburg Gate, Berlin — 1:1 (26 m to the top of the Quadriga,
// 65.5 m wide incl. the side pavilions, 11 m deep). Twelve fluted Doric columns (6 per face, 15 m),
// five passages (middle one widest) separated by walls, entablature with triglyph frieze, stepped
// attic, and the copper-green Quadriga facing east (local -Z = Pariser Platz). Floodlit at night.
const STONE = 0xd9cfb5, STONE_DK = 0xc2b697, STONE_LT = 0xe4dbc4, SHADOW = 0x958a72, COPPER = 0x5d8c74, COPPER_DK = 0x456d5a;
const TAU = Math.PI * 2;
const D = 11, COLH = 15, BASE = 0.6;
// column centre x positions (6): passages 3.8 / 3.8 / 5.65 / 3.8 / 3.8 m between column faces
const CR = 0.875;
const XS = (() => {
  const gaps = [3.8, 3.8, 5.65, 3.8, 3.8];
  const tot = gaps.reduce((a, b) => a + b, 0) + 6 * 2 * CR;
  const out = []; let x = -tot / 2 + CR;
  for (let i = 0; i < 6; i++) { out.push(x); x += 2 * CR + (gaps[i] || 0); }
  return out;
})();
const HALF = XS[5] + CR + 2.6;   // half-width of the central gate (end pylons)
const ENT = BASE + COLH;          // entablature base

export const lodDist = 1200;
export const glowStrength = 1.0;

export const colliders = [
  ...XS.map((x) => ({ x, z: 0, hw: CR + 0.1, hd: D / 2, h: 22 })),
  { x: -(HALF + 7.2), z: 0, hw: 7.2, hd: D / 2 + 1, h: 12 },
  { x: HALF + 7.2, z: 0, hw: 7.2, hd: D / 2 + 1, h: 12 },
];

function column(k, x, z) {
  const hi = k.hi;
  const seg = hi ? 20 : 8;
  k.cyl(x, BASE, z, CR, CR * 0.82, COLH - 1.1, seg, { smooth: !hi });
  // capital: echinus + abacus
  k.cyl(x, BASE + COLH - 1.1, z, CR * 0.84, CR * 1.12, 0.55, seg);
  k.box(x, BASE + COLH - 0.55, z, CR * 2.5, 0.55, CR * 2.5);
}

function pavilion(k, sx) {
  const hi = k.hi, cx = sx * (HALF + 7.2), w = 14.4, h = 10.6;
  k.glow(true).color(STONE).box(cx, 0, 0, w, BASE, D + 2);
  // small Doric portico on the outer end: 4 columns + solid back
  k.box(cx + sx * 1.5, BASE, 0, w - 3, h - BASE, D);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    k.cyl(cx + sx * (w / 2 - 0.6), BASE, z, 0.5, 0.42, 7.6, hi ? 12 : 6);
    k.box(cx + sx * (w / 2 - 0.6), BASE + 7.6, z, 1.3, 0.35, 1.3);
  }
  k.color(STONE_DK).box(cx, BASE + 7.95, 0, w + 0.3, 1.9, D + 0.6);
  k.color(STONE_LT).box(cx, BASE + 9.85, 0, w + 0.8, 0.5, D + 1.0);
  // low pediment roof along Z
  k.color(STONE).taper(cx, h + 0.75, 0, w + 0.6, D + 0.8, w + 0.6, 0.4, 2.2);
  // front/back facade: pilaster + niche
  if (hi) {
    k.glow(false).color(SHADOW);
    for (const z of [-D / 2 - 0.05, D / 2 + 0.05]) k.box(cx - sx * 1.5, BASE + 1.5, z, 2.0, 4.5, 0.1);
  }
}

function quadriga(k, y0) {
  const hi = k.hi;
  k.glow(true).color(COPPER);
  // plinth
  k.color(STONE_LT).box(0, y0, 0, 7.6, 0.6, 5.6);
  k.color(COPPER);
  // four horses abreast, facing -Z, rearing slightly
  const hx = [-2.85, -0.95, 0.95, 2.85];
  for (let i = 0; i < 4; i++) {
    const x = hx[i], yb = y0 + 0.6;
    if (hi) {
      k.sphere(x, yb + 2.15, -0.6, 0.62, 8, 5, 0.85);          // chest/body ellipsoid
      k.push().translate(x, yb + 2.15, -0.6).scale(0.6, 0.6, 1.25);
      k.sphere(0, 0, 0, 1, 8, 5);
      k.pop();
      for (const [lx, lz, lift] of [[-0.25, -1.4, 0.6], [0.25, -1.4, 0], [-0.25, 0.3, 0], [0.25, 0.3, 0]]) {
        k.strut([x + lx, yb + 1.8, -0.6 + lz * 0.85], [x + lx, yb + lift, -0.6 + lz - lift * 0.6], 0.2);
      }
      k.strut([x, yb + 2.5, -1.6], [x, yb + 3.5, -2.1], 0.42);   // neck
      k.push().translate(x, yb + 3.55, -2.35).rotateX(0.6);
      k.box(0, -0.2, 0, 0.36, 0.38, 0.85);                         // head
      k.pop();
      k.strut([x, yb + 2.2, 0.7], [x, yb + 1.2, 1.0], 0.15);        // tail
    } else {
      k.box(x, yb + 1.5, -0.6, 1.1, 1.3, 2.8);
      k.box(x, yb + 2.6, -2.1, 0.5, 1.3, 0.7);
      k.box(x, yb, -0.6, 0.9, 1.5, 2.2);
    }
  }
  // chariot
  k.color(COPPER_DK).box(0, y0 + 0.6, 1.6, 2.6, 1.7, 1.8);
  if (hi) for (const sx of [-1, 1]) k.cyl(sx * 1.35, y0 + 0.6, 2.0, 0.85, 0.85, 0.12, 12), k.push().translate(sx * 1.4, y0 + 1.45, 2.0).rotateZ(Math.PI / 2).cyl(0, -0.06, 0, 0.85, 0.85, 0.12, 12).pop();
  // Victoria: robed figure, wings, staff with wreath, iron cross and eagle
  k.color(COPPER);
  k.cyl(0, y0 + 2.3, 1.7, 0.55, 0.3, 2.5, hi ? 10 : 5);
  k.sphere(0, y0 + 5.05, 1.7, 0.28, hi ? 8 : 4, hi ? 5 : 3);
  if (hi) {
    for (const sx of [-1, 1]) k.quad2([sx * 0.2, y0 + 4.6, 1.95], [sx * 1.3, y0 + 5.6, 2.2], [sx * 1.0, y0 + 3.4, 2.3], [sx * 0.25, y0 + 3.8, 2.0]);
    k.strut([0.45, y0 + 2.6, 1.4], [0.75, y0 + 6.3, 1.0], 0.1);  // staff
    k.cyl(0.75, y0 + 6.0, 1.0, 0.35, 0.35, 0.08, 10);             // wreath
    k.box(0.75, y0 + 6.1, 1.0, 0.1, 0.6, 0.1);
    k.box(0.75, y0 + 6.35, 1.0, 0.4, 0.1, 0.1);
    k.box(0.75, y0 + 6.6, 1.0, 0.55, 0.22, 0.12);                 // eagle
  } else {
    k.box(0.75, y0 + 2.6, 1.0, 0.2, 3.8, 0.2);
  }
}

export function build(k) {
  const hi = k.hi;
  // stylobate
  k.glow(true).color(STONE_DK).box(0, 0, 0, HALF * 2 + 0.6, BASE, D + 1.2);
  // end pylons and passage walls (between front and back columns)
  k.color(STONE);
  for (const sx of [-1, 1]) k.box(sx * (HALF - 1.3), BASE, 0, 2.6, COLH, D);
  k.color(0xb2a586); // passage walls read darker (in shade)
  for (let i = 0; i < 6; i++) k.box(XS[i], BASE, 0, 1.25, COLH - 1.1, D - 2 * CR * 2);
  // columns
  k.color(STONE_LT);
  for (const x of XS) for (const z of [-(D / 2 - CR), D / 2 - CR]) column(k, x, z);
  // entablature: architrave, triglyph frieze, cornice
  k.color(STONE).box(0, ENT, 0, HALF * 2, 1.1, D);
  k.color(STONE_DK).box(0, ENT + 1.1, 0, HALF * 2, 1.2, D);
  if (hi) {
    k.glow(false).color(SHADOW);
    for (const z of [-D / 2 - 0.04, D / 2 + 0.04]) {
      for (let x = -HALF + 0.8; x <= HALF - 0.6; x += 1.55) k.box(x, ENT + 1.2, z, 0.55, 1.0, 0.08);
    }
    k.glow(true);
  }
  k.color(STONE_LT).box(0, ENT + 2.3, 0, HALF * 2 + 1.0, 0.5, D + 1.0);
  // stepped attic with relief panel, then the quadriga pedestal
  const A0 = ENT + 2.8;
  k.color(STONE).box(0, A0, 0, HALF * 2 - 1.4, 1.6, D - 1.0);
  k.color(STONE_DK).box(0, A0 + 1.6, 0, HALF * 2 - 1.0, 0.3, D - 0.6);
  k.color(STONE).box(0, A0 + 1.9, 0, 20.5, 0.8, 8.0);
  k.color(STONE_DK).box(0, A0 + 2.7, 0, 21.1, 0.2, 8.4);
  if (hi) {
    k.color(0xb7a985);
    for (const z of [-(D - 1.0) / 2 - 0.05, (D - 1.0) / 2 + 0.05]) k.box(0, A0 + 0.3, z, 18, 1.0, 0.12);
    // attic stepped side tiers
    k.color(STONE);
    for (const sx of [-1, 1]) k.taper(sx * 14.5, A0 + 1.9, 0, 6, 8, 3, 6, 0.7);
  }
  k.push().translate(0, A0 + 2.9, 0).scale(0.7);
  quadriga(k, 0);
  k.pop();
  for (const sx of [-1, 1]) pavilion(k, sx);
  // passage shadows on the ground (darker paving)
  if (hi) {
    k.glow(false).color(0x9a9282);
    for (let i = 0; i < 5; i++) k.box((XS[i] + XS[i + 1]) / 2, BASE, 0, XS[i + 1] - XS[i] - 1.4, 0.02, D);
  }
  k.glow(false);
}
