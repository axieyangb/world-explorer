// feature/famous-landmarks: Louvre Pyramid & Cour Napoleon Palace Wings, Paris France — 1:1.
// I. M. Pei 21.6m glass-and-steel diamond lattice Louvre Pyramid surrounded by triangular reflecting pools
// and the three smaller Pyramions, framed by the ornate French Renaissance limestone Palace Wings (Richelieu, Sully, Denon)!

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.9;

const LIMESTONE = 0xe4dccb, LIME_SH = 0xc9bfa8, SLATE = 0x454f5b, SLATE_DK = 0x2e3640;
const PYR_GLASS = 0x8bb6cc, STEEL = 0xdfe6ee, GOLD_GLOW = 0xffdd94;
const WATER = 0x286988, PAVE = 0xd6cfc0, WINDOW = 0x2a323b;

export const colliders = [
  { x: 0, z: 4, hw: 18, hd: 18, h: 22 },
  { x: 0, z: -64, hw: 92, hd: 16, h: 29 },
  { x: -78, z: 4, hw: 16, hd: 68, h: 29 },
  { x: 78, z: 4, hw: 16, hd: 68, h: 29 },
];

/** I. M. Pei Louvre Glass Pyramid (base 35.4m x 35.4m, height 21.6m) with diamond steel lattice & golden underground glow. */
function peiGlassPyramid(k, px, pz) {
  const hi = k.hi, fine = k.fine;
  const hw = 17.7, H = 21.6;
  k.push().translate(px, 0, pz);

  // Triangular reflecting basins framing the North, East, and West sides of the Main Pyramid
  k.glow(false).color(LIME_SH).box(0, 0.4, 0, 58, 0.55, 58);
  k.color(WATER);
  k.tri([-19, 1.0, -19], [19, 1.0, -19], [0, 1.0, -38]);
  k.tri([-19, 1.0, 19], [-19, 1.0, -19], [-38, 1.0, 0]);
  k.tri([19, 1.0, -19], [19, 1.0, 19], [38, 1.0, 0]);

  // Three smaller satellite glass pyramids (Pyramions: base 8m, height 4.8m)
  for (const [sx, sz] of [[0, -28], [-28, 0], [28, 0]]) {
    k.glow(true).color(GOLD_GLOW).pyramid(sx, 0.9, sz, 6.2, 6.2, 3.8);
    k.glow(false).color(PYR_GLASS).pyramid(sx, 0.9, sz, 7.6, 7.6, 4.8);
  }

  // Warm golden illuminated subterranean Hall Napoleon glowing inside the main pyramid
  k.glow(true).color(GOLD_GLOW).pyramid(0, 0.9, 0, hw * 1.72, hw * 1.72, H * 0.85);

  // Translucent blue-green glass pyramid faces
  k.glow(false).color(PYR_GLASS).pyramid(0, 0.9, 0, hw * 2, hw * 2, H);

  // Iconic I. M. Pei Diamond / Rhombus Stainless-Steel Space-Frame Lattice across all 4 faces
  const nGrid = fine ? 9 : hi ? 6 : 3;
  const corners = [
    [-hw, -hw],
    [hw, -hw],
    [hw, hw],
    [-hw, hw],
  ];
  const apex = [0, 0.9 + H + 0.12, 0];
  k.color(STEEL);
  for (let f = 0; f < 4; f++) {
    const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
    // Ridge strut
    k.strut([ax, 0.9, az], apex, 0.34);
    // Diagonal diamond lattice lines across face f
    for (let i = 1; i < nGrid; i++) {
      const t = i / nGrid;
      // Line 1: from left ridge point (at fraction t from base to apex) to base point (at fraction t from A to B)
      const rL = [ax * (1 - t), 0.9 + H * t, az * (1 - t)];
      const bM = [ax + (bx - ax) * t, 0.9, az + (bz - az) * t];
      // Line 2: from right ridge point (at fraction t from base to apex) to base point (at fraction 1-t from A to B)
      const rR = [bx * (1 - t), 0.9 + H * t, bz * (1 - t)];
      const bM2 = [bx + (ax - bx) * t, 0.9, bz + (az - bz) * t];
      k.strut(rL, bM, 0.22);
      k.strut(rR, bM2, 0.22);
    }
  }
  k.pop();
}

/** French Renaissance Louvre Palace Wing with Mansard slate roofs, end/center pavilions & arched galleries. */
function palaceWing(k, cx, cz, len, depth, rotY = 0) {
  const hi = k.hi;
  k.push().translate(cx, 0, cz).rotateY(rotY);

  // 3-story limestone gallery body + steep Mansard slate roof
  k.glow(false).color(LIMESTONE).box(0, 0.4, 0, len, 18.5, depth);
  k.color(LIME_SH).box(0, 9.2, 0, len + 0.8, 0.8, depth + 0.8).box(0, 18.9, 0, len + 1.2, 1.0, depth + 1.2);
  k.color(SLATE).taper(0, 19.9, 0, len + 0.4, depth + 0.4, len - 5.0, depth - 5.5, 5.2);

  // Central & Corner Domed Renaissance Pavilions (Pavillon de l Horloge, Richelieu, Denon)
  for (const px of [-len * 0.44, 0, len * 0.44]) {
    const pw = px === 0 ? 24 : 20, pd = depth + 3.6;
    k.glow(false).color(LIMESTONE).box(px, 0.4, 0, pw, 21.5, pd);
    k.color(LIME_SH).box(px, 21.9, 0, pw + 1.2, 1.1, pd + 1.2);
    // Square-domed Second Empire Mansard pavilion crown
    k.color(SLATE_DK).taper(px, 23.0, 0, pw + 0.4, pd + 0.4, pw * 0.56, pd * 0.56, 6.2);
    k.color(LIME_SH).box(px, 29.2, 0, pw * 0.58, 0.8, pd * 0.58);
  }

  // Warm floodlit palace arcade & gallery windows
  k.glow(true).color(GOLD_GLOW);
  const step = hi ? 8.5 : 17.0;
  for (let x = -len * 0.46; x <= len * 0.46; x += step) {
    k.box(x, 1.6, -depth * 0.5 - 0.15, 3.4, 5.8, 0.35);
    k.box(x, 1.6, depth * 0.5 + 0.15, 3.4, 5.8, 0.35);
    k.box(x, 10.8, -depth * 0.5 - 0.15, 2.8, 5.5, 0.35);
    k.box(x, 10.8, depth * 0.5 + 0.15, 2.8, 5.5, 0.35);
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  // 1. Cour Napoleon Cobblestone Courtyard
  k.glow(false).color(PAVE).box(0, -2.5, 0, 210, 2.9, 175);

  // 2. I. M. Pei Glass Pyramid & Reflecting Pools in the center of Cour Napoleon
  peiGlassPyramid(k, 0, 8);

  // 3. Three U-Shaped Louvre Palace Wings framing Cour Napoleon:
  // East Sully Wing (at z = -64), North Richelieu Wing (at x = -78), South Denon Wing (at x = 78)
  palaceWing(k, 0, -64, 178, 26, 0);
  palaceWing(k, -78, 6, 136, 26, Math.PI / 2);
  palaceWing(k, 78, 6, 136, 26, Math.PI / 2);
}
