// feature/famous-landmarks: The Hollywood Sign, Mount Lee, Los Angeles — 1:1 (34.1341, -118.3215).
// Iconic 14.5m-tall (45 ft) crisp white 3D block letters "H O L L Y W O O D" spanning ~110 m across the
// steep south face of Mount Lee ridge, elevated on structural steel support towers & concrete pier footings
// with rear A-frame raker struts anchored into the hillside, floodlight banks, and the Mount Lee
// communications tower atop the ridge behind the sign.

const WHITE = 0xfafbfd, WHITE_SH = 0xe2e6ec;
const STEEL = 0x7e8791, STEEL_DK = 0x525a63;
const CONC = 0xa9a499, FLOOD = 0xfff5dc, RED = 0xff3b2f;

export const lodDist = 3800; // visible from far across the Los Angeles basin
export const fineDist = 800;
export const glowStrength = 2.5;

const LETTERS = ["H", "O", "L", "L", "Y", "W", "O", "O", "D"];
// All letters sit +3.2m..+5.2m above the highest ridge terrain point (`baseY`), following the natural contour
// of Mount Lee while remaining 100% above the slope surface supported on steel trestle legs reaching down to y=-24m.
const OFF_Y = [5.2, 4.5, 3.8, 3.2, 3.8, 4.6, 4.0, 3.4, 4.2];
const OFF_Z = [-1.2, 0.4, 1.5, 2.0, 0.6, -0.6, -1.4, -0.3, 1.0];

export const colliders = [
  { x: 0, z: 0, hw: 62, hd: 9, h: 22 },
  { x: 34, z: 42, r: 6, h: 56 },
];

/** Renders a single 3D white block letter (height H = 14.5m) + rear steel masts hidden behind the letter's strokes. */
function buildHollywoodLetter(k, ch, cx, y0, cz, W, H, D) {
  const hi = k.hi;
  const T = W * 0.23; // stroke width (~2.3m)
  const halfStroke = W / 2 - T / 2;

  // Align vertical steel support columns directly behind each letter's actual vertical strokes
  // so no dark bars cut across the open counter/empty space of 'O', 'L', 'Y', or 'D' when viewed from the front!
  const mastOffsets =
    ch === "Y"
      ? [0]
      : [-halfStroke, halfStroke];

  const upperMastOffsets =
    ch === "L"
      ? [halfStroke]
      : ch === "Y"
        ? [0]
        : [-halfStroke, halfStroke];

  // Deep concrete hillside pier footings & structural steel support columns extending 24m into the Mount Lee slope
  for (const lx of mastOffsets) {
    const px = cx + lx;
    k.glow(false).color(CONC);
    k.box(px, -24, cz + 0.2, 1.4, 18.0, 2.0);
    k.box(px, -24, cz + 6.0, 1.4, 21.0, 2.0);
    k.color(STEEL);
    // Front vertical steel support column up to the base of the letter (y = y0)
    k.box(px, -6.5, cz + 0.2, 0.52, y0 + 6.6, 0.52);
    // Rear vertical steel support column
    k.box(px, -4.5, cz + 6.0, 0.48, y0 + 4.8, 0.48);
    // Diagonal steel cross-bracing between front and rear legs beneath the letter
    k.strut([px, y0, cz + 0.2], [px, -5.0, cz + 6.0], 0.36);
  }
  // Horizontal steel catwalk girder under the base of the letter
  k.glow(false).color(STEEL_DK).box(cx, y0 - 0.52, cz + 0.6, W * 0.88, 0.45, 1.2);

  // Upward floodlight bar on cantilevered bracket in front (-Z = South) of the letter base
  k.glow(true).color(FLOOD).box(cx, y0 - 0.35, cz - 2.6, W * 0.72, 0.42, 0.52);

  // Crisp floodlit 3D white block letter
  k.glow(true).color(WHITE);
  if (ch === "H") {
    k.box(cx - halfStroke, y0, cz, T, H, D);
    k.box(cx + halfStroke, y0, cz, T, H, D);
    k.box(cx, y0 + (H - T) * 0.5, cz, W, T, D);
  } else if (ch === "O") {
    k.box(cx - halfStroke, y0, cz, T, H, D);
    k.box(cx + halfStroke, y0, cz, T, H, D);
    k.box(cx, y0 + H - T, cz, W, T, D);
    k.box(cx, y0, cz, W, T, D);
  } else if (ch === "L") {
    // With heading = 180 (local -Z = South/Front, local +X = West/Left, local -X = East/Right),
    // the vertical stem of 'L' on the viewer's left is at +halfStroke in local X.
    k.box(cx + halfStroke, y0, cz, T, H, D);
    k.box(cx, y0, cz, W, T, D);
  } else if (ch === "Y") {
    k.box(cx, y0, cz, T, H * 0.52, D);
    k.strut([cx, y0 + H * 0.48, cz], [cx - halfStroke, y0 + H, cz], T);
    k.strut([cx, y0 + H * 0.48, cz], [cx + halfStroke, y0 + H, cz], T);
  } else if (ch === "W") {
    const wW = W * 1.18;
    const x0 = cx - wW * 0.5, x1 = cx - wW * 0.24, x2 = cx, x3 = cx + wW * 0.24, x4 = cx + wW * 0.5;
    k.strut([x0, y0 + H, cz], [x1, y0, cz], T * 0.88);
    k.strut([x1, y0, cz], [x2, y0 + H * 0.65, cz], T * 0.82);
    k.strut([x2, y0 + H * 0.65, cz], [x3, y0, cz], T * 0.82);
    k.strut([x3, y0, cz], [x4, y0 + H, cz], T * 0.88);
  } else if (ch === "D") {
    // Vertical stem of 'D' on viewer's left is at +halfStroke in local X; curved right side is at -halfStroke
    k.box(cx + halfStroke, y0, cz, T, H, D);
    k.box(cx + T * 0.25, y0 + H - T, cz, W * 0.8, T, D);
    k.box(cx + T * 0.25, y0, cz, W * 0.8, T, D);
    k.box(cx - halfStroke, y0 + T * 0.85, cz, T, H - T * 1.7, D);
  }

  // Rear structural steel A-frame support struts aligned directly behind the vertical white strokes (+Z uphill side)
  k.glow(false).color(STEEL);
  const zBack = cz + D * 0.5 + 0.25, zAnchor = cz + 6.0;
  for (const lx of upperMastOffsets) {
    const px = cx + lx;
    const mastH = ch === "Y" ? H * 0.52 : H * 0.94;
    k.box(px, y0, zBack + 0.2, 0.44, mastH, 0.44);
    k.strut([px, y0 + mastH * 0.88, zBack + 0.25], [px, y0 + 0.2, zAnchor], 0.38);
    if (hi) {
      k.strut([px, y0 + mastH * 0.45, zBack + 0.25], [px, y0 + 0.2, zAnchor], 0.32);
      // Horizontal rear maintenance catwalk rungs on the back of the vertical stroke
      for (const frac of [0.28, 0.56, 0.82]) {
        k.box(px, y0 + mastH * frac, zBack + 0.35, T * 0.85, 0.18, 0.28);
      }
    }
  }
}

function mountLeeTower(k) {
  const hi = k.hi;
  // Mount Lee summit communications building & red-white lattice tower on the summit ridge behind the sign
  k.push().translate(34, 16, 42);
  k.glow(false).color(CONC).box(0, -24, 0, 18, 24.0, 12);
  k.color(WHITE_SH).box(0, 0, 0, 15, 4.4, 9.5);
  // Lattice radio mast
  k.color(STEEL).taper(0, 4.4, 0, 4.4, 4.4, 1.2, 1.2, 34);
  if (hi) {
    k.color(WHITE);
    for (const dishY of [13, 20, 27]) {
      k.cyl(-1.8, dishY, -1.8, 1.4, 0.4, 0.8, 8);
      k.cyl(1.8, dishY + 2, -1.8, 1.2, 0.3, 0.8, 8);
    }
  }
  k.glow(true).color(RED).sphere(0, 39.0, 0, 0.85, 8, 5);
  k.glow(false);
  k.pop();
}

export function build(k) {
  const W = 9.8, H = 14.5, D = 1.45, GAP = 12.8;
  // Because heading = 180 rotates local +X to West (-X world, viewer's left when facing North),
  // letter 0 ('H') starts at +startX (West/Left) and progresses to -startX ('D' on East/Right).
  const startX = ((LETTERS.length - 1) * GAP) * 0.5;
  for (let i = 0; i < LETTERS.length; i++) {
    const cx = startX - i * GAP - (LETTERS[i] === "W" ? 0.4 : 0);
    buildHollywoodLetter(k, LETTERS[i], cx, OFF_Y[i], OFF_Z[i], W, H, D);
  }
  mountLeeTower(k);
  k.glow(false);
}
