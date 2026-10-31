// feature/famous-landmarks: Chrysler Building, Manhattan — 1:1 (roof 282 m, spire tip 319 m).
// Brick podium filling the Lexington / 42nd St lot with setbacks to the 31st floor (winged radiator-cap
// ornaments & automotive wheel frieze), white-brick shaft with dark window columns, 61st-floor Niazi steel
// eagle gargoyles, then the seven terraced stainless-steel sunburst arches with triangular windows (lit at night) and the needle.

const BRICK = 0xd9d6cf, BRICK2 = 0xcfcbc2, GREY = 0x4b4f55, STEEL = 0xd6dbe1, STEEL_DK = 0xaab1b9;
const WIN = 0x3f4247, TRI = 0xffeeb8, GOLD_LIT = 0xffdd94;

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
    // Black Shastone granite ground-floor base & 3-story stepped Art Deco Lexington Ave entrance portal
    k.color(0x26292e).box(0, 0, 0, 60.4, 7.5, 54.4);
    k.glow(true).color(GOLD_LIT).box(0, 0.8, 0, 60.6, 5.2, 54.6).glow(false);
    // Stepped Art Deco granite & nickel-chrome Lexington Ave Entrance Portal (-Z face)
    k.color(0x1e2126).box(0, 0, -27.4, 15.5, 14.5, 1.4);
    k.color(STEEL).box(0, 0, -27.7, 12.2, 12.8, 1.2).box(0, 0, -28.0, 9.2, 10.8, 1.0);
    k.glow(true).color(GOLD_LIT).box(0, 0.5, -28.2, 7.4, 9.4, 0.8).glow(false);
    // 24th-floor pineapple finials & setback corner piers
    k.color(STEEL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.cyl(sx * 22.8, 92, sz * 21.8, 0.9, 0.4, 3.2, 8);
    }

    k.glow(true).color(WIN);
    strips(k, 60, 54, 8, Y_POD - 10, 3.2, 1.5);
    tiers.forEach(([w, d, y0, y1]) => strips(k, w, d, y0 + 1, y1 - y0 - 2.5, 3.0, 1.4));
    k.glow(false);
    // dark brick bands at setbacks and the 31st-floor automotive wheel & hubcap frieze
    k.color(GREY);
    for (const [w, d, , y1] of tiers) k.box(0, y1 - 1.6, 0, w + 0.4, 1.6, d + 0.4);
    k.box(0, Y_POD - 1.6, 0, 60.4, 1.6, 54.4);
    // 31st-floor white-and-grey brick racing-car wheel hubcaps + winged 1929 Chrysler radiator-cap corner ornaments
    for (let f = 0; f < 4; f++) {
      const W = f % 2 ? 36 : 38, D = f % 2 ? 38 : 36;
      k.push().rotateY((f * Math.PI) / 2);
      for (let x = -W * 0.36; x <= W * 0.36; x += 4.5) {
        k.color(STEEL).cyl(x, Y31 - 1.4, -D / 2 - 0.25, 0.85, 0.85, 0.25, 10);
      }
      k.pop();
    }
    k.color(STEEL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.push().translate(sx * 19, Y31 - 3.2, sz * 18).rotateY(Math.atan2(sx, sz));
      k.cyl(0, 1.2, 1.2, 1.1, 1.1, 1.8, 10); // radiator cap drum
      // Outstretched silver Mercury wings flanking the cap
      k.strut([0, 1.8, 1.2], [-2.8, 3.2, 3.6], 0.55);
      k.strut([0, 1.8, 1.2], [2.8, 3.2, 3.6], 0.55);
      k.strut([0, 1.2, 1.2], [-2.4, 2.2, 3.2], 0.45);
      k.strut([0, 1.2, 1.2], [2.4, 2.2, 3.2], 0.45);
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
    for (const y of [Y31 + 4, 152, 180, 208, Y_SHAFT - 6]) k.extrude(notched(SW + 0.5, SW + 0.5, N), y, 1.2);
    // 8 Iconic 61st-floor Stainless Steel Art Deco Eagle Gargoyles projecting from the corners
    k.color(STEEL);
    for (let c = 0; c < 4; c++) {
      const a = Math.PI / 4 + (c * Math.PI) / 2;
      const r0 = SW / 2 * Math.SQRT2 - N * 0.7;
      for (const da of [-0.14, 0.14]) {
        const ang = a + da;
        const p0 = [Math.cos(ang) * r0, Y_SHAFT - 4.2, Math.sin(ang) * r0];
        const pMid = [Math.cos(ang) * (r0 + 3.2), Y_SHAFT - 3.0, Math.sin(ang) * (r0 + 3.2)];
        const pTip = [Math.cos(ang) * (r0 + 5.8), Y_SHAFT - 3.6, Math.sin(ang) * (r0 + 5.8)];
        k.strut(p0, pMid, 1.35);
        k.strut(pMid, pTip, 0.75); // hooked eagle beak
      }
    }
  }
  k.color(BRICK2).box(0, Y_SHAFT, 0, 27, Y_CROWN - Y_SHAFT, 27);
}

function crown(k) {
  const hi = k.hi, an = hi ? 20 : 6;
  // seven telescoping tiers; each = a cross vault whose four faces are sunburst arches with raised stainless ribs
  let topY = Y_CROWN;
  for (let i = 0; i < 7; i++) {
    const w = 26 - i * 3.2, ys = Y_CROWN + i * 5.2, rise = w * 0.46;
    k.color(i % 2 ? STEEL : STEEL_DK).box(0, i ? ys - 5.2 : Y_CROWN, 0, w, i ? 5.2 : 0.01, w);
    const pts = archPts(w, rise, an);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2).translate(0, ys, 0).rotateX(-Math.PI / 2);
      k.color(i % 2 ? STEEL_DK : STEEL).extrude(pts, 0, w / 2);
      k.pop();
      if (hi) {
        // Raised stainless-steel sunburst arch rim rib & radial seam ribs
        k.push().rotateY((f * Math.PI) / 2);
        k.color(0xeef2f6).arch(0, ys, -w / 2 - 0.06, w + 0.3, rise + 0.15, 0.22, 16, 6);
        k.pop();
      }
    }
    topY = ys + rise;
    // triangular windows radiating along each arch (glow warm white-gold at night, framed in dark steel)
    const nTri = hi ? (7 - Math.floor(i * 0.4)) : 0;
    if (nTri) {
      for (let f = 0; f < 4; f++) {
        k.push().rotateY((f * Math.PI) / 2).translate(0, ys, -w / 2);
        for (let j = 0; j < nTri; j++) {
          const a = Math.PI * (0.08 + (0.84 * (j + 0.5)) / nTri);
          const ca = Math.cos(a), sa = Math.sin(a);
          const ax = ca * (w / 2), ay = sa * rise;
          const nx = ca * rise, ny = sa * (w / 2); const nl = Math.hypot(nx, ny);
          const ux = nx / nl, uy = ny / nl;
          const tx = -uy, ty = ux;
          const L = Math.min(2.7, rise * 0.44), hw = Math.min(0.95, w * 0.062);
          const bx = ax - ux * (L + 0.45), by = ay - uy * (L + 0.45);
          const px = ax - ux * 0.42, py = ay - uy * 0.42;
          // Outer dark stainless window recess frame
          k.glow(false).color(GREY);
          const zf0 = -0.06;
          k.tri([bx - tx * hw * 1.22, by - ty * hw * 1.22, zf0], [bx + tx * hw * 1.22, by + ty * hw * 1.22, zf0], [px + ux * 0.18, py + uy * 0.18, zf0]);
          // Inner glowing sunburst triangular window
          k.glow(true).color(TRI);
          const zf = -0.10;
          k.tri([bx - tx * hw, by - ty * hw, zf], [bx + tx * hw, by + ty * hw, zf], [px, py, zf]);
        }
        k.pop();
      }
      k.glow(false);
    }
  }
  // Octagonal stainless-steel spire base & 37 m pyramidal needle with horizontal seam collars
  k.color(STEEL).taper(0, topY - 2, 0, 5.2, 5.2, 2.6, 2.6, 282 - topY + 2);
  k.color(STEEL).lathe(0, 282, 0, [[1.5, 0], [1.1, 10], [0.6, 25], [0.08, 37]], hi ? 16 : 4);
  if (hi) {
    k.color(STEEL_DK);
    for (let sy = 285; sy < 314; sy += 4.5) {
      const sr = 1.5 * (1 - (sy - 282) / 38) + 0.08;
      k.torus(0, sy, 0, sr, 0.08, 12, 6);
    }
    k.glow(true).color(0xff5a4a).sphere(0, 318.4, 0, 0.38, 8, 6).glow(false);
  }
}

export function build(k) {
  body(k);
  crown(k);
}
