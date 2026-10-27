// feature/beijing-landmarks: CCTV Headquarters (中央广播电视总台总部大楼) — 1:1.
// 234 m continuous three-dimensional loop: an L-shaped 9-storey base, two towers leaning 6° toward the
// same corner, and an L-shaped 13-storey overhang that joins the tower tops at 162-234 m and cantilevers
// 75 m out over the open corner of the base. Grey glass skin wrapped in the irregular diagrid (denser
// where the loads gather near the tower roots and the cantilever). Flat roof, no mast.
export const lodDist = 2000;
export const glowStrength = 1.3;

const GLASS = 0x46525e, GLASS_DK = 0x37414c, GRID = 0xa3acb5, PLAZA = 0x5a6068, LIT = 0x9cc4ec;
const HW = 24;                 // tower / wing half-width
const BASE_H = 50, OV0 = 162, TOP = 234;
const A0 = [-46, -46], A1 = [-40, -30];   // tower A (NW) centres at the ground and at the overhang: leans S + E
const B0 = [46, 46], B1 = [30, 40];       // tower B (SE): leans W + N (about 6 deg)
const C = [-40, 40];                      // cantilevered overhang corner (over the open SW corner)

export const colliders = [
  { x: 0, z: -46, hw: 70, hd: HW, h: BASE_H },
  { x: 46, z: 0, hw: HW, hd: 70, h: BASE_H },
  { x: -43, z: -38, hw: HW, hd: HW, h: OV0 },
  { x: 38, z: 43, hw: HW, hd: HW, h: OV0 },
  { x: -40, z: 5, hw: HW, hd: 59, h: TOP },
  { x: -5, z: 40, hw: 59, hd: HW, h: TOP },
];

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const towerC = (P0, P1, y) => lerp(P0, P1, y / OV0);

/** Leaning square tower segment between heights y0..y1 (centre slides along the lean). */
function towerSeg(k, P0, P1, y0, y1) {
  const c0 = towerC(P0, P1, y0), c1 = towerC(P0, P1, y1);
  k.taper(c0[0], y0, c0[1], 2 * HW, 2 * HW, 2 * HW, 2 * HW, y1 - y0, c1[0] - c0[0], c1[1] - c0[1]);
}

/** Diagrid on one vertical-ish face: corners p(u, v) for u, v in 0..1; rows get denser toward dense=0 or 1. */
function diagrid(k, p, rows, cols, t, dense = -1) {
  const vs = [];
  for (let r = 0; r <= rows; r++) {
    let v = r / rows;
    if (dense >= 0) v = dense === 0 ? v * v * 0.6 + v * 0.4 : 1 - (1 - v) * (1 - v) * 0.6 - (1 - v) * 0.4;
    vs.push(v);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols;
      if ((r + c) % 2) k.strut(p(u0, vs[r]), p(u1, vs[r + 1]), t);
      else k.strut(p(u1, vs[r]), p(u0, vs[r + 1]), t);
    }
  }
  for (let r = 0; r <= rows; r += 2) k.strut(p(0, vs[r]), p(1, vs[r]), t * 0.7); // edge-beam rings
}

function towerGrid(k, P0, P1, y0, y1, rows) {
  const at = (y) => towerC(P0, P1, y);
  const o = HW + 0.35;
  // four faces: (dx, dz) offsets of the face corners from the centre
  const faces = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  for (const [[ax, az], [bx, bz]] of faces) {
    diagrid(k, (u, v) => {
      const y = y0 + (y1 - y0) * v, c = at(y);
      return [c[0] + (ax + (bx - ax) * u) * o, y, c[1] + (az + (bz - az) * u) * o];
    }, rows, 4, 0.9, 0);
  }
}

/** Box with a diagrid on its four sides. */
function gridBox(k, x, y0, z, w, h, d, rows, cols) {
  const xs = [x - w / 2 - 0.35, x + w / 2 + 0.35], zs = [z - d / 2 - 0.35, z + d / 2 + 0.35];
  const corners = [[xs[0], zs[0]], [xs[1], zs[0]], [xs[1], zs[1]], [xs[0], zs[1]]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const n = i % 2 ? Math.max(2, Math.round(cols * d / w)) : cols;
    diagrid(k, (u, v) => [a[0] + (b[0] - a[0]) * u, y0 + h * v, a[1] + (b[1] - a[1]) * u], rows, n, 0.9);
  }
}

export function build(k) {
  const hi = k.hi;
  // plaza
  k.color(PLAZA).box(0, 0, 0, 190, 0.8, 190);
  // L-shaped base: north wing + east wing through the NE corner
  // (near: dark glass, the diagrid carries the night lighting; far impostor: the glass itself glows)
  k.glow(!hi).color(GLASS_DK);
  k.box(0, 0.8, -46, 140, BASE_H - 0.8, 2 * HW);
  k.box(46, 0.8, 0, 2 * HW, BASE_H - 0.8, 140);
  // two leaning towers from the base roof up to the underside of the overhang
  k.color(GLASS);
  towerSeg(k, A0, A1, 0.8, OV0);
  towerSeg(k, B0, B1, 0.8, OV0);
  // L-shaped overhang joining the tower tops through the cantilevered SW corner
  k.color(GLASS);
  k.box(C[0], OV0, (A1[1] + C[1]) / 2, 2 * HW, TOP - OV0, C[1] - A1[1] + 2 * HW);
  k.box((C[0] + B1[0]) / 2, OV0, C[1], B1[0] - C[0] + 2 * HW, TOP - OV0, 2 * HW);
  k.glow(false);
  // roof parapets
  k.color(GRID);
  k.box(C[0], TOP, (A1[1] + C[1]) / 2, 2 * HW + 0.8, 1.2, C[1] - A1[1] + 2 * HW + 0.8);
  k.box((C[0] + B1[0]) / 2, TOP, C[1], B1[0] - C[0] + 2 * HW + 0.8, 1.2, 2 * HW + 0.8);
  k.box(0, BASE_H, -46, 140.8, 1.0, 2 * HW + 0.8).box(46, BASE_H, 0, 2 * HW + 0.8, 1.0, 140.8);
  if (!hi) return;
  // the irregular diagrid: denser low on the towers, over the base and around the overhang
  k.glow(true).color(GRID);
  towerGrid(k, A0, A1, BASE_H, OV0, 9);
  towerGrid(k, B0, B1, BASE_H, OV0, 9);
  gridBox(k, 0, 0.8, -46, 140, BASE_H - 0.8, 2 * HW, 4, 10);
  gridBox(k, 46, 0.8, 0, 2 * HW, BASE_H - 0.8, 140, 4, 3);
  gridBox(k, C[0], OV0, (A1[1] + C[1]) / 2, 2 * HW, TOP - OV0, C[1] - A1[1] + 2 * HW, 6, 3);
  gridBox(k, (C[0] + B1[0]) / 2, OV0, C[1], B1[0] - C[0] + 2 * HW, TOP - OV0, 2 * HW, 6, 7);
  // lit soffit of the cantilever (viewing platform glass floors) and the lobby glazing
  k.color(LIT);
  k.box(C[0], OV0 - 0.4, C[1], 2 * HW - 4, 0.4, 2 * HW - 4);
  k.box(0, 0.8, -46 - HW - 0.4, 120, 5, 0.3);
  k.glow(false);
}
