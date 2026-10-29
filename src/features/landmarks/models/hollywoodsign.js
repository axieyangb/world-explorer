// feature/famous-landmarks: The Hollywood Sign, Mount Lee, Los Angeles — 1:1 (34.1341, -118.3215).
// Iconic 14m-tall (45 ft) crisp white 3D block letters "H O L L Y W O O D" spanning ~110 m across the
// steep south face of Mount Lee ridge, complete with rear structural steel A-frame support towers,
// horizontal catwalk girders, concrete hillside footings, floodlight banks, and the Mount Lee
// communications tower atop the ridge behind the sign.

const WHITE = 0xfafbfd, WHITE_SH = 0xe2e6ec;
const STEEL = 0x7e8791, STEEL_DK = 0x525a63;
const CONC = 0xa9a499, ROCK = 0x8d7f6a, FLOOD = 0xfff5dc, RED = 0xff3b2f;

export const lodDist = 3800; // visible from far across the Los Angeles basin
export const fineDist = 800;
export const glowStrength = 2.5;

const LETTERS = ["H", "O", "L", "L", "Y", "W", "O", "O", "D"];
// Slight natural vertical & Z-depth contour along the Mount Lee hillside ridge
const OFF_Y = [1.2, 0.4, -0.6, -1.2, -0.2, 0.8, 0.2, -0.5, 0.6];
const OFF_Z = [-1.5, 0.5, 1.8, 2.4, 0.8, -0.8, -1.6, -0.4, 1.2];

export const colliders = [
  { x: 0, z: 0, hw: 62, hd: 9, h: 18 },
  { x: 18, z: 32, r: 6, h: 46 },
];

/** Renders a single 3D white block letter (height H = 14.5m) + rear steel lattice frame. */
function buildHollywoodLetter(k, ch, cx, y0, cz, W, H, D) {
  const hi = k.hi;
  const T = W * 0.23; // stroke width (~2.3m)

  // Concrete hillside footing piers reaching down into the slope
  k.glow(false).color(CONC);
  k.box(cx - W * 0.32, y0 - 7, cz + 0.8, 1.6, 7.4, 2.8);
  k.box(cx + W * 0.32, y0 - 7, cz + 0.8, 1.6, 7.4, 2.8);

  // Upward floodlight bar in front of the letter base
  k.glow(true).color(FLOOD).box(cx, y0 - 0.4, cz - 2.6, W * 0.7, 0.45, 0.55);

  // Crisp floodlit 3D white block letter
  k.glow(true).color(WHITE);
  if (ch === "H") {
    k.box(cx - W / 2 + T / 2, y0, cz, T, H, D);
    k.box(cx + W / 2 - T / 2, y0, cz, T, H, D);
    k.box(cx, y0 + (H - T) * 0.5, cz, W, T, D);
  } else if (ch === "O") {
    k.box(cx - W / 2 + T / 2, y0, cz, T, H, D);
    k.box(cx + W / 2 - T / 2, y0, cz, T, H, D);
    k.box(cx, y0 + H - T, cz, W, T, D);
    k.box(cx, y0, cz, W, T, D);
  } else if (ch === "L") {
    k.box(cx - W / 2 + T / 2, y0, cz, T, H, D);
    k.box(cx, y0, cz, W, T, D);
  } else if (ch === "Y") {
    k.box(cx, y0, cz, T, H * 0.52, D);
    k.strut([cx, y0 + H * 0.48, cz], [cx - W / 2 + T * 0.5, y0 + H, cz], T);
    k.strut([cx, y0 + H * 0.48, cz], [cx + W / 2 - T * 0.5, y0 + H, cz], T);
  } else if (ch === "W") {
    const wW = W * 1.18;
    const x0 = cx - wW * 0.5, x1 = cx - wW * 0.24, x2 = cx, x3 = cx + wW * 0.24, x4 = cx + wW * 0.5;
    k.strut([x0, y0 + H, cz], [x1, y0, cz], T * 0.88);
    k.strut([x1, y0, cz], [x2, y0 + H * 0.65, cz], T * 0.82);
    k.strut([x2, y0 + H * 0.65, cz], [x3, y0, cz], T * 0.82);
    k.strut([x3, y0, cz], [x4, y0 + H, cz], T * 0.88);
  } else if (ch === "D") {
    k.box(cx - W / 2 + T / 2, y0, cz, T, H, D);
    k.box(cx - T * 0.25, y0 + H - T, cz, W * 0.8, T, D);
    k.box(cx - T * 0.25, y0, cz, W * 0.8, T, D);
    k.box(cx + W / 2 - T / 2, y0 + T * 0.85, cz, T, H - T * 1.7, D);
  }

  // Rear structural steel A-frame support struts & horizontal bracing (on the +Z uphill side)
  k.glow(false).color(STEEL);
  const zBack = cz + D * 0.5 + 0.2, zAnchor = cz + 5.8;
  for (const sx of [-1, 1]) {
    const px = cx + sx * (W * 0.32);
    // Vertical mast behind letter
    k.box(px, y0 - 1.5, zBack + 0.25, 0.42, H + 1.2, 0.42);
    // Angled raker strut into the Mount Lee hillside behind
    k.strut([px, y0 + H * 0.85, zBack + 0.3], [px, y0 - 1.2, zAnchor], 0.38);
    if (hi) {
      k.strut([px, y0 + H * 0.45, zBack + 0.3], [px, y0 - 1.2, zAnchor], 0.32);
    }
  }
  if (hi) {
    k.color(STEEL_DK);
    k.box(cx, y0 + H * 0.35, zBack + 0.4, W * 0.86, 0.35, 0.35);
    k.box(cx, y0 + H * 0.72, zBack + 0.4, W * 0.86, 0.35, 0.35);
  }
}

function mountLeeTower(k) {
  const hi = k.hi;
  // Mount Lee summit communications building & red-white lattice tower behind the sign (+Z)
  k.push().translate(18, 8, 32);
  k.glow(false).color(CONC).box(0, -4, 0, 18, 7.5, 12);
  k.color(WHITE_SH).box(0, 3.5, 0, 15, 4.2, 9.5);
  // Lattice radio mast
  k.color(STEEL).taper(0, 7.7, 0, 4.4, 4.4, 1.2, 1.2, 34);
  if (hi) {
    k.color(WHITE);
    for (const dishY of [16, 23, 30]) {
      k.cyl(-1.8, dishY, -1.8, 1.4, 0.4, 0.8, 8);
      k.cyl(1.8, dishY + 2, -1.8, 1.2, 0.3, 0.8, 8);
    }
  }
  k.glow(true).color(RED).sphere(0, 42.4, 0, 0.85, 8, 5);
  k.glow(false);
  k.pop();
}

export function build(k) {
  // Stepped chaparral hillside ledge along Mount Lee so the sign never floats on coarse DEM
  k.glow(false).color(ROCK).box(0, -8.5, 2, 134, 8.2, 18);

  const W = 9.8, H = 14.5, D = 1.45, GAP = 12.8;
  const startX = -((LETTERS.length - 1) * GAP) * 0.5;
  for (let i = 0; i < LETTERS.length; i++) {
    const cx = startX + i * GAP + (LETTERS[i] === "W" ? 0.4 : 0);
    buildHollywoodLetter(k, LETTERS[i], cx, OFF_Y[i], OFF_Z[i], W, H, D);
  }
  mountLeeTower(k);
  k.glow(false);
}
