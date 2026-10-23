// feature/famous-landmarks: Chrysler Building, Manhattan — 1:1 (roof 282 m, spire tip 319 m).
// Brick podium filling the Lexington / 42nd St lot with setbacks to the 31st floor (radiator-cap
// ornaments), white-brick shaft with dark window columns, 61st-floor eagle gargoyles, then the
// seven terraced stainless-steel sunburst arches with triangular windows (lit at night) and the needle.
// Local frame: square-ish plan, front (-Z) faces up the avenue grid (heading 29 like the Manhattan grid).

const BRICK = 0xd9d6cf, BRICK2 = 0xcfcbc2, GREY = 0x4b4f55, STEEL = 0xd6dbe1, STEEL_DK = 0xaab1b9;
const WIN = 0x3f4247, TRI = 0xc8ccd0;

export const lodDist = 1600;
export const glowStrength = 2.6;

const Y_POD = 62, Y31 = 122, Y_SHAFT = 238, Y_CROWN = 242;

export const colliders = [
  { x: 0, z: 0, hw: 30, hd: 27, h: Y_POD },
  { x: 0, z: 0, hw: 22, hd: 21, h: Y31 },
  { x: 0, z: 0, hw: 15, hd: 15, h: Y_CROWN },
  { x: 0, z: 0, hw: 10, hd: 10, h: 270 },
  { x: 0, z: 0, r: 3, h: 282 },
];

function notched(w, d, n) {
  const a = w / 2, b = d / 2;
  return [[-a + n, -b], [a - n, -b], [a - n, -b + n], [a, -b + n], [a, b - n], [a - n, b - n], [a - n, b], [-a + n, b],
    [-a + n, b - n], [-a, b - n], [-a, -b + n], [-a + n, -b + n]];
}

/** Vertical window columns (single quads) just proud of the four faces of a w x d block. */
function strips(k, w, d, y0, h, sp, sw, margin = 0.03) {
  for (let f = 0; f < 4; f++) {
    const W = f % 2 ? d : w, D = f % 2 ? w : d;
    const span = W * (1 - 2 * margin);
    const n = Math.max(1, Math.round(span / sp));
    k.push().rotateY((f * Math.PI) / 2);
    const z = -D / 2 - 0.12;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i + 0.5) * (span / n);
      k.quad([x + sw / 2, y0, z], [x - sw / 2, y0, z], [x - sw / 2, y0 + h, z], [x + sw / 2, y0 + h, z]);
    }
    k.pop();
  }
}

/** Arch-topped slab outline (face plane: [x, y]): rectangle w wide, springline at 0, semi-elliptic rise. */
function archPts(w, rise, n) {
  const pts = [[-w / 2, -0.01]];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([Math.cos(a) * (w / 2), Math.sin(a) * rise]);
  }
  pts.push([w / 2, -0.01]);
  return pts;
}

function body(k) {
  const hi = k.hi;
  // --- podium (floors 1-16) on the lot, then setbacks to floor 31
  k.color(BRICK2).box(0, 0, 0, 60, Y_POD, 54);
  const tiers = [[52, 50, Y_POD, 72], [46, 44, 72, 92], [42, 40, 92, 110], [38, 36, 110, Y31]];
  tiers.forEach(([w, d, y0, y1], i) => k.color(i % 2 ? BRICK2 : BRICK).box(0, y0, 0, w, y1 - y0, d));
  if (hi) {
    k.glow(true).color(0x7b6a52).box(0, 0, 0, 60.3, 6, 54.3).glow(false);            // lobby / shopfronts
    k.color(GREY).box(0, 0, -27.4, 14, 12, 1.2);                                       // entrance portal
    k.glow(true).color(WIN);
    strips(k, 60, 54, 8, Y_POD - 10, 3.2, 1.5);
    tiers.forEach(([w, d, y0, y1]) => strips(k, w, d, y0 + 1, y1 - y0 - 2.5, 3.0, 1.4));
    k.glow(false);
    // dark brick bands at setbacks and the 31st-floor frieze
    k.color(GREY);
    for (const [w, d, , y1] of tiers) k.box(0, y1 - 1.6, 0, w + 0.4, 1.6, d + 0.4);
    k.box(0, Y_POD - 1.6, 0, 60.4, 1.6, 54.4);
    // radiator-cap ornaments at the 31st floor corners
    k.color(STEEL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.push().translate(sx * 19, Y31 - 3, sz * 18).rotateY(Math.atan2(sx, sz));
      k.box(0, 0, 1.6, 2.2, 3.4, 4.4);
      k.pop();
    }
  }
  // --- shaft (floors 31-61), notched corners with dark corner stripes
  const SW = 31, N = 3;
  k.color(BRICK).extrude(notched(SW, SW, N), Y31, Y_SHAFT - Y31);
  if (hi) {
    k.glow(true).color(WIN);
    strips(k, SW - 2 * N, SW, Y31 + 1, Y_SHAFT - Y31 - 4, 2.9, 1.4, 0.06);
    k.glow(false);
    k.color(GREY);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(sx * (SW / 2 - N / 2), Y31, sz * (SW / 2 + 0.05), N * 0.8, Y_SHAFT - Y31, 0.25);
      k.box(sx * (SW / 2 + 0.05), Y31, sz * (SW / 2 - N / 2), 0.25, Y_SHAFT - Y31, N * 0.8);
    }
    for (const y of [Y31 + 4, 180, Y_SHAFT - 6]) k.extrude(notched(SW + 0.5, SW + 0.5, N), y, 1.2);
    // 61st-floor eagle gargoyles projecting diagonally from the corners
    k.color(STEEL);
    for (let c = 0; c < 4; c++) {
      const a = Math.PI / 4 + (c * Math.PI) / 2;
      const r0 = SW / 2 * Math.SQRT2 - N * 0.7;
      k.strut([Math.cos(a) * r0, Y_SHAFT - 4, Math.sin(a) * r0], [Math.cos(a) * (r0 + 6.5), Y_SHAFT - 3.2, Math.sin(a) * (r0 + 6.5)], 1.5);
    }
  }
  k.color(BRICK2).box(0, Y_SHAFT, 0, 27, Y_CROWN - Y_SHAFT, 27);
}

function crown(k) {
  const hi = k.hi, an = hi ? 14 : 6;
  // seven telescoping tiers; each = a cross vault whose four faces are sunburst arches
  let topY = Y_CROWN;
  for (let i = 0; i < 7; i++) {
    const w = 26 - i * 3.2, ys = Y_CROWN + i * 5.2, rise = w * 0.46;
    k.color(i % 2 ? STEEL : STEEL_DK).box(0, i ? ys - 5.2 : Y_CROWN, 0, w, i ? 5.2 : 0.01, w);
    const pts = archPts(w, rise, an);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2).translate(0, ys, 0).rotateX(-Math.PI / 2);
      k.color(i % 2 ? STEEL_DK : STEEL).extrude(pts, w / 2 - w / 2, w / 2);
      k.pop();
    }
    topY = ys + rise;
    // triangular windows radiating along each arch (glow)
    const nTri = hi ? Math.max(5, Math.round(9 - i * 0.6)) : 0;
    if (nTri) {
      k.glow(true).color(TRI);
      for (let f = 0; f < 4; f++) {
        k.push().rotateY((f * Math.PI) / 2).translate(0, ys, -w / 2);
        for (let j = 0; j < nTri; j++) {
          const a = Math.PI * (0.06 + (0.88 * (j + 0.5)) / nTri);
          const ca = Math.cos(a), sa = Math.sin(a);
          // point on the arch, pulled inward along the face, triangle pointing outward
          const ax = ca * (w / 2), ay = sa * rise;
          const nx = ca * rise, ny = sa * (w / 2); const nl = Math.hypot(nx, ny);
          const ux = nx / nl, uy = ny / nl;           // outward normal in face plane
          const tx = -uy, ty = ux;                     // tangent
          const L = Math.min(2.6, rise * 0.42), hw = Math.min(0.9, w * 0.06);
          const bx = ax - ux * (L + 0.5), by = ay - uy * (L + 0.5);
          const px = ax - ux * 0.5, py = ay - uy * 0.5;
          // which arch face is this? the arch slab sits at depth z in [-w/2 .. 0]; windows sit on the face at z=-w/2 (local z = 0 after translate)
          const zf = -0.08;
          k.tri([bx - tx * hw, by - ty * hw, zf], [bx + tx * hw, by + ty * hw, zf], [px, py, zf]);
        }
        k.pop();
      }
      k.glow(false);
    }
  }
  // spire base and needle
  k.color(STEEL).taper(0, topY - 2, 0, 5.2, 5.2, 2.6, 2.6, 282 - topY + 2);
  k.color(STEEL).lathe(0, 282, 0, [[1.5, 0], [1.1, 10], [0.6, 25], [0.08, 37]], hi ? 8 : 4);
  if (hi) k.glow(true).color(0xff5a4a).sphere(0, 318.2, 0, 0.35, 5, 3).glow(false);
}

export function build(k) {
  body(k);
  crown(k);
}
