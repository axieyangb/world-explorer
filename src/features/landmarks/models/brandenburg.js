// feature/famous-landmarks: Brandenburg Gate, Berlin — 1:1 (26 m to the top of the Quadriga,
// 65.5 m wide incl. the side pavilions, 11 m deep). Twelve fluted Doric columns (6 per face, 15 m),
// five passages (middle one widest) separated by walls with coffered ceilings & Mars/Minerva reliefs,
// entablature with triglyph & carved metope frieze, stepped attic, and the copper-green Quadriga facing
// east (local -Z = Pariser Platz) with sculpted horses, reins, spoked chariot wheels, oak wreath & eagle.
const STONE = 0xd9cfb5, STONE_DK = 0xc2b697, STONE_LT = 0xe4dbc4, SHADOW = 0x958a72, COPPER = 0x5d8c74, COPPER_DK = 0x456d5a;
const GOLD = 0xd8b24c, BRONZE = 0x4a3f32, PAVE = 0xb8b0a0;
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
  // Attic base plinth & torus
  if (hi) {
    k.color(STONE_DK).box(x, BASE, z, CR * 2.25, 0.35, CR * 2.25);
    k.cyl(x, BASE + 0.35, z, CR * 1.06, CR * 1.02, 0.25, 16);
    k.color(STONE_LT);
  }
  k.cyl(x, BASE + (hi ? 0.6 : 0), z, CR, CR * 0.82, COLH - 1.1 - (hi ? 0.6 : 0), seg, { smooth: !hi });
  // 16 vertical Doric flute arris ribs along each column shaft in close-up
  if (hi) {
    k.color(STONE_DK);
    for (let f = 0; f < 16; f++) {
      const a = (f / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      k.strut(
        [x + ca * (CR + 0.02), BASE + 0.65, z + sa * (CR + 0.02)],
        [x + ca * (CR * 0.82 + 0.02), BASE + COLH - 1.15, z + sa * (CR * 0.82 + 0.02)],
        0.07
      );
    }
    k.color(STONE_LT);
  }
  // capital: necking ring, echinus + abacus
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
  // front/back facade: pilaster + niche + triglyph frieze + classical statue in niche
  if (hi) {
    k.glow(false).color(SHADOW);
    for (const z of [-D / 2 - 0.05, D / 2 + 0.05]) {
      k.box(cx - sx * 1.5, BASE + 1.2, z, 2.2, 5.2, 0.14);
      // Mars & Minerva statues standing inside the guardhouse niches
      k.glow(true).color(STONE_LT);
      k.cyl(cx - sx * 1.5, BASE + 1.4, z + (z < 0 ? -0.12 : 0.12), 0.42, 0.35, 3.4, 8);
      k.sphere(cx - sx * 1.5, BASE + 5.15, z + (z < 0 ? -0.12 : 0.12), 0.28, 6, 5);
      // Doric pilasters & window frames on the guardhouse wings
      for (const px of [-5.2, 1.8, 5.2]) {
        k.color(STONE_DK).box(cx + sx * px, BASE, z, 0.75, 7.9, 0.18);
      }
      // Triglyphs along pavilion entablature
      k.glow(false).color(SHADOW);
      for (let tx = -w / 2 + 1.0; tx <= w / 2 - 1.0; tx += 1.6) {
        k.box(cx + tx, BASE + 8.3, z * 1.04, 0.42, 0.85, 0.1);
      }
    }
    k.glow(true);
  }
}

function quadriga(k, y0) {
  const hi = k.hi;
  k.glow(true).color(COPPER);
  // plinth with moulded cornice
  k.color(STONE_LT).box(0, y0, 0, 7.6, 0.6, 5.6);
  if (hi) k.color(STONE_DK).box(0, y0 + 0.55, 0, 7.9, 0.18, 5.9);
  k.color(COPPER);
  // four horses abreast, facing -Z, rearing slightly
  const hx = [-2.85, -0.95, 0.95, 2.85];
  for (let i = 0; i < 4; i++) {
    const x = hx[i], yb = y0 + 0.6;
    if (hi) {
      k.color(COPPER);
      k.sphere(x, yb + 2.15, -0.6, 0.62, 10, 6, 0.85);          // chest/body ellipsoid
      k.push().translate(x, yb + 2.15, -0.6).scale(0.6, 0.6, 1.25);
      k.sphere(0, 0, 0, 1, 10, 6);
      k.pop();
      for (const [lx, lz, lift] of [[-0.25, -1.4, 0.65], [0.25, -1.4, 0.05], [-0.25, 0.3, 0], [0.25, 0.3, 0]]) {
        k.strut([x + lx, yb + 1.8, -0.6 + lz * 0.85], [x + lx, yb + lift, -0.6 + lz - lift * 0.6], 0.2);
      }
      const turn = (i < 2 ? -1 : 1) * 0.14;
      k.strut([x, yb + 2.5, -1.6], [x + turn * 0.3, yb + 3.55, -2.1], 0.42);   // arched neck
      // Sculpted horse mane crest & ears
      k.color(COPPER_DK).strut([x, yb + 2.65, -1.45], [x + turn * 0.3, yb + 3.7, -1.95], 0.22);
      k.color(COPPER).push().translate(x + turn * 0.3, yb + 3.55, -2.35).rotateY(turn).rotateX(0.6);
      k.box(0, -0.2, 0, 0.36, 0.38, 0.85);                         // head
      k.cone(-0.12, 0.02, 0.25, 0.07, 0.24, 4).cone(0.12, 0.02, 0.25, 0.07, 0.24, 4); // ears
      k.pop();
      k.strut([x, yb + 2.2, 0.7], [x, yb + 1.1, 1.1], 0.18);        // flowing tail
      // Bronze reins running from horse bit back to Victoria's hands
      k.color(BRONZE).strut([x + turn * 0.3, yb + 3.2, -2.4], [x * 0.22, y0 + 3.8, 1.3], 0.05);
    } else {
      k.box(x, yb + 1.5, -0.6, 1.1, 1.3, 2.8);
      k.box(x, yb + 2.6, -2.1, 0.5, 1.3, 0.7);
      k.box(x, yb, -0.6, 0.9, 1.5, 2.2);
    }
  }
  // chariot shell & 8-spoked bronze wheels
  k.color(COPPER_DK).box(0, y0 + 0.6, 1.6, 2.6, 1.7, 1.8);
  if (hi) {
    k.color(COPPER).cyl(0, y0 + 0.6, 1.0, 1.3, 1.3, 1.75, 12);
    for (const sx of [-1, 1]) {
      k.push().translate(sx * 1.42, y0 + 1.45, 2.0).rotateZ(Math.PI / 2);
      k.color(COPPER_DK).cyl(0, -0.08, 0, 0.92, 0.92, 0.16, 14);
      k.color(GOLD).cyl(0, -0.12, 0, 0.22, 0.22, 0.24, 8);
      k.pop();
    }
  }
  // Victoria: robed figure, wings, staff with oak wreath, Iron Cross and Prussian Eagle
  k.color(COPPER);
  k.cyl(0, y0 + 2.3, 1.7, 0.55, 0.3, 2.5, hi ? 12 : 5);
  k.sphere(0, y0 + 5.05, 1.7, 0.28, hi ? 8 : 4, hi ? 5 : 3);
  if (hi) {
    // Sculpted feather wings
    for (const sx of [-1, 1]) {
      k.quad2([sx * 0.2, y0 + 4.6, 1.95], [sx * 1.45, y0 + 5.75, 2.25], [sx * 1.1, y0 + 3.3, 2.35], [sx * 0.25, y0 + 3.8, 2.0]);
      for (let f = 0; f < 4; f++) {
        k.strut([sx * 0.3, y0 + 4.4 - f * 0.22, 2.0], [sx * (1.4 - f * 0.12), y0 + 5.6 - f * 0.5, 2.28], 0.10);
      }
    }
    k.color(GOLD).strut([0.45, y0 + 2.6, 1.4], [0.75, y0 + 6.5, 1.0], 0.10);  // trophy staff
    k.torus(0.75, y0 + 6.0, 1.0, 0.38, 0.08, 12, 6);                            // gilded oak-leaf wreath
    // Iron Cross inside the wreath
    k.color(BRONZE).box(0.75, y0 + 5.82, 1.0, 0.12, 0.36, 0.10).box(0.75, y0 + 5.95, 1.0, 0.36, 0.12, 0.10);
    // Crowned Prussian Eagle with spread wings atop the wreath
    k.color(GOLD).sphere(0.75, y0 + 6.55, 1.0, 0.18, 6, 5);
    k.strut([0.32, y0 + 6.72, 1.0], [0.75, y0 + 6.52, 1.0], 0.12);
    k.strut([1.18, y0 + 6.72, 1.0], [0.75, y0 + 6.52, 1.0], 0.12);
  } else {
    k.box(0.75, y0 + 2.6, 1.0, 0.2, 3.8, 0.2);
  }
}

export function build(k) {
  const hi = k.hi;
  // Pariser Platz granite cobble apron & stylobate
  if (hi) {
    k.glow(false).color(PAVE).box(0, -0.3, 0, HALF * 2 + 34, 0.32, D + 22);
    // Ornamental Schinkel cast-iron streetlamps on Pariser Platz (-Z) and Platz des 18. März (+Z)
    for (const sz of [-D / 2 - 7.5, D / 2 + 7.5]) {
      for (const lx of [-24, -10, 10, 24]) {
        k.color(BRONZE).cyl(lx, 0, sz, 0.22, 0.12, 4.8, 6);
        k.glow(true).color(0xffe7ab).sphere(lx, 5.0, sz, 0.36, 6, 5).glow(false);
      }
    }
  }
  k.glow(true).color(STONE_DK).box(0, 0, 0, HALF * 2 + 0.6, BASE, D + 1.2);
  // end pylons and passage walls (between front and back columns)
  k.color(STONE);
  for (const sx of [-1, 1]) k.box(sx * (HALF - 1.3), BASE, 0, 2.6, COLH, D);
  k.color(0xb2a586); // passage walls read darker (in shade)
  for (let i = 0; i < 6; i++) {
    k.box(XS[i], BASE, 0, 1.25, COLH - 1.1, D - 2 * CR * 2);
    if (hi) {
      // Recessed classical metope relief panels (Labours of Hercules) along the passage walls
      k.color(STONE_LT);
      for (const sz of [-1.8, 1.8]) {
        k.box(XS[i], BASE + 11.2, sz, 1.35, 1.25, 2.4);
        k.box(XS[i], BASE + 2.2, sz, 1.32, 6.2, 2.6);
      }
      k.color(0xb2a586);
    }
  }
  // Passage coffered ceilings & hanging bronze lanterns in the 5 roadways
  if (hi) {
    for (let i = 0; i < 5; i++) {
      const mx = (XS[i] + XS[i + 1]) / 2, pw = XS[i + 1] - XS[i] - 1.3;
      k.color(STONE_DK);
      for (let z = -D / 2 + 1.2; z <= D / 2 - 1.2; z += 1.8) {
        k.box(mx, BASE + COLH - 1.2, z, pw, 0.28, 0.35);
      }
      k.color(BRONZE).cyl(mx, BASE + COLH - 2.6, 0, 0.05, 0.05, 1.4, 4);
      k.glow(true).color(0xffe6a3).sphere(mx, BASE + COLH - 2.75, 0, 0.26, 6, 5);
    }
  }
  // columns (6 on East face, 6 on West face)
  k.color(STONE_LT);
  for (const x of XS) for (const z of [-(D / 2 - CR), D / 2 - CR]) column(k, x, z);
  // entablature: architrave, triglyph & carved metope frieze, cornice
  k.color(STONE).box(0, ENT, 0, HALF * 2, 1.1, D);
  k.color(STONE_DK).box(0, ENT + 1.1, 0, HALF * 2, 1.2, D);
  if (hi) {
    for (const z of [-D / 2 - 0.04, D / 2 + 0.04]) {
      let idx = 0;
      for (let x = -HALF + 0.8; x <= HALF - 0.6; x += 1.55, idx++) {
        // Triglyph block with 3 vertical glyphs
        k.glow(false).color(SHADOW).box(x, ENT + 1.2, z, 0.55, 1.0, 0.10);
        // Sculpted Centauromachy metope relief between triglyphs
        if (x + 0.78 < HALF - 0.6) {
          k.glow(true).color(STONE_LT).sphere(x + 0.78, ENT + 1.7, z, 0.26, 5, 4);
        }
      }
    }
    k.glow(true);
  }
  k.color(STONE_LT).box(0, ENT + 2.3, 0, HALF * 2 + 1.0, 0.5, D + 1.0);
  // stepped attic with relief panel (Minerva & procession of Peace), then the quadriga pedestal
  const A0 = ENT + 2.8;
  k.color(STONE).box(0, A0, 0, HALF * 2 - 1.4, 1.6, D - 1.0);
  k.color(STONE_DK).box(0, A0 + 1.6, 0, HALF * 2 - 1.0, 0.3, D - 0.6);
  k.color(STONE).box(0, A0 + 1.9, 0, 20.5, 0.8, 8.0);
  k.color(STONE_DK).box(0, A0 + 2.7, 0, 21.1, 0.2, 8.4);
  if (hi) {
    k.color(0xb7a985);
    for (const z of [-(D - 1.0) / 2 - 0.05, (D - 1.0) / 2 + 0.05]) {
      k.box(0, A0 + 0.25, z, 18, 1.1, 0.14);
      // Sculpted figures in the central attic bas-relief tablet
      k.color(STONE_LT);
      for (let fx = -7.5; fx <= 7.5; fx += 1.5) {
        k.box(fx, A0 + 0.35, z + (z < 0 ? -0.08 : 0.08), 0.45, 0.82, 0.12);
      }
      k.color(0xb7a985);
    }
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
