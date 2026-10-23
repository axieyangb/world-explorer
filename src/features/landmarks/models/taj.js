// feature/famous-landmarks: Taj Mahal, Agra — 1:1 (ground to finial 73 m).
// Red-sandstone terrace, 95 m square white-marble plinth (6.7 m), chamfered-square mausoleum (56.6 m)
// with four 33 m pishtaq portals, drum + onion dome + lotus + gilded finial, four corner chhatris and
// four 40 m minarets on the plinth corners. Front (-Z) faces the garden to the south (heading 180).
import { Kit } from "../kit.js";

const MARBLE = 0xf4f0e6, MARBLE_DK = 0xdcd5c6, MARBLE_SH = 0xc5bdac, RECESS = 0x8f877a, RECESS_DK = 0x6c655b;
const INLAY = 0xb9ab92, SAND = 0xa9573d, SAND_DK = 0x8c4430, GOLD = 0xc9a24a;
const PL = 6.7;         // plinth top
const ROOF = 33.0;      // main block roof

export const lodDist = 1500;
export const colliders = [
  { x: 0, z: 0, hw: 47.5, hd: 47.5, h: PL },
  { x: 0, z: 0, hw: 28.3, hd: 28.3, h: ROOF },
  { x: 0, z: 0, r: 13.5, h: 64 },
  { x: 42.6, z: 42.6, r: 3.2, h: 46 }, { x: -42.6, z: 42.6, r: 3.2, h: 46 },
  { x: 42.6, z: -42.6, r: 3.2, h: 46 }, { x: -42.6, z: -42.6, r: 3.2, h: 46 },
];

/** Pointed (Mughal) arch outline as a flat panel facing -Z at z, centred x, from y0, width w, height h. */
function archPanel(k, x, y0, z, w, h, col) {
  const spring = h - w * 0.62; // straight jambs up to the springing line
  const hw = w / 2;
  k.color(col);
  k.quad([x - hw, y0, z], [x + hw, y0, z], [x + hw, y0 + spring, z], [x - hw, y0 + spring, z]);
  const n = k.hi ? 6 : 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 at jamb, 1 at apex
    const a = t * (Math.PI / 2);
    pts.push([hw * Math.cos(a) * (1 - 0.35 * t), spring + (h - spring) * Math.sin(a)]);
  }
  pts[n] = [0, h];
  for (let i = 0; i < n; i++) {
    const [r0, y0a] = pts[i], [r1, y1a] = pts[i + 1];
    k.quad([x - r0, y0 + y0a, z], [x + r0, y0 + y0a, z], [x + r1, y0 + y1a, z], [x - r1, y0 + y1a, z]);
  }
}

/** One facade face: centred at local origin facing -Z, half-width hw. Built in the face frame. */
function mainFace(k) {
  const hi = k.hi;
  // pishtaq frame (projects 1.4 m, rises above the parapet)
  k.color(MARBLE).box(0, PL, -28.3 - 0.7, 26, 31, 1.4);
  archPanel(k, 0, PL, -29.45, 17, 24.5, RECESS);
  if (hi) {
    // calligraphy frame around the arch
    k.color(INLAY);
    k.box(0, PL + 26.6, -29.42, 21.5, 0.6, 0.1);
    k.box(-10.5, PL, -29.42, 0.6, 27.2, 0.1);
    k.box(10.5, PL, -29.42, 0.6, 27.2, 0.1);
    // inner arch (door + window grille) inside the recess
    archPanel(k, 0, PL, -29.5, 7.5, 12, RECESS_DK);
    archPanel(k, 0, PL + 13.5, -29.5, 7.5, 8, RECESS_DK);
    // parapet crenellation on the pishtaq top
    k.color(MARBLE_DK);
    for (let i = -6; i <= 6; i++) k.box(i * 2, PL + 31, -28.9, 1.0, 0.9, 0.6);
    // slender guldasta pinnacles at the pishtaq corners
    for (const sx of [-13.2, 13.2]) {
      k.color(MARBLE).cyl(sx, PL, -29.2, 0.75, 0.6, 33.6, 8);
      k.color(MARBLE_DK).sphere(sx, PL + 34.3, -29.2, 0.9, 8, 4, 1.4);
      k.color(GOLD).cyl(sx, PL + 35.3, -29.2, 0.12, 0.05, 1.4, 4);
    }
  }
  // flanking two-storey niches
  for (const sx of [-1, 1]) {
    const cx = sx * 20.5;
    archPanel(k, cx, PL + 1.2, -28.35, 7.0, 10.8, RECESS);
    archPanel(k, cx, PL + 14.0, -28.35, 7.0, 10.8, RECESS);
    if (hi) {
      k.color(INLAY).box(cx, PL + 12.9, -28.33, 9.6, 0.4, 0.1);
      k.color(INLAY).box(cx, PL + 25.6, -28.33, 9.6, 0.4, 0.1);
    }
  }
}

function chamferFace(k) {
  // chamfer face centre is at distance d along the diagonal; built facing -Z in its own frame
  archPanel(k, 0, PL + 1.2, -0.05, 7.0, 10.8, RECESS);
  archPanel(k, 0, PL + 14.0, -0.05, 7.0, 10.8, RECESS);
}

function minaret(k, x, z) {
  const hi = k.hi, seg = hi ? 16 : 8;
  k.color(MARBLE_DK).cyl(x, PL, z, 3.6, 3.6, 1.2, 8);
  k.color(MARBLE).lathe(x, PL + 1.2, z, [[3.0, 0], [2.85, 11], [2.65, 22], [2.45, 32.5]], seg);
  for (const y of [PL + 12.2, PL + 23.2, PL + 33.7]) {
    k.color(MARBLE_DK).cyl(x, y - 1.0, z, 2.9, 3.9, 1.0, seg);
    k.color(MARBLE).cyl(x, y, z, 3.9, 3.9, 0.9, seg, { caps: false });
    k.color(MARBLE_DK).cyl(x, y + 0.9, z, 3.95, 3.95, 0.15, seg);
  }
  if (hi) {
    k.color(MARBLE_SH);
    for (let i = 0; i < 4; i++) k.cyl(x, PL + 1.2 + i * 11 + 5.4, z, 2.98 - i * 0.2, 2.94 - i * 0.2, 0.25, seg, { caps: false });
  }
  // top chhatri
  const yb = PL + 34.75;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (hi) k.color(MARBLE).cyl(x + Math.cos(a) * 1.9, yb, z + Math.sin(a) * 1.9, 0.2, 0.2, 2.6, 5, { caps: false });
  }
  if (!hi) k.color(MARBLE_SH).cyl(x, yb, z, 1.8, 1.8, 2.6, 6);
  k.color(MARBLE).cyl(x, yb + 2.6, z, 2.4, 2.4, 0.5, seg);
  k.color(MARBLE).lathe(x, yb + 3.1, z, [[2.0, 0], [2.2, 0.8], [1.9, 1.8], [1.1, 2.6], [0.3, 3.1], [0, 3.2]], seg);
  k.color(GOLD).cyl(x, yb + 6.2, z, 0.14, 0.04, 1.7, 4);
}

function chhatri(k, x, z) {
  const hi = k.hi, seg = hi ? 16 : 8;
  k.color(MARBLE_DK).extrude(Kit.ngon(8, 4.4, Math.PI / 8, x, z), ROOF, 1.6);
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.color(MARBLE).cyl(x + Math.cos(a) * 3.7, ROOF + 1.6, z + Math.sin(a) * 3.7, 0.38, 0.38, 4.6, 6, { caps: false });
    }
    k.color(RECESS).cyl(x, ROOF + 1.6, z, 2.3, 2.3, 4.6, 8);
  } else k.color(MARBLE_SH).cyl(x, ROOF + 1.6, z, 3.7, 3.7, 4.6, 8);
  k.color(MARBLE).extrude(Kit.ngon(8, 4.7, Math.PI / 8, x, z), ROOF + 6.2, 0.9);
  k.color(MARBLE).cyl(x, ROOF + 7.1, z, 3.4, 3.4, 1.0, seg);
  k.color(MARBLE).lathe(x, ROOF + 8.1, z, [[3.4, 0], [3.8, 1.2], [3.5, 2.7], [2.4, 4.0], [1.0, 4.9], [0.25, 5.3], [0, 5.35]], seg);
  k.color(GOLD).cyl(x, ROOF + 13.3, z, 0.18, 0.05, 2.0, 4);
}

export function build(k) {
  const hi = k.hi, seg = hi ? 36 : 14;
  // red sandstone terrace + steps out to the garden
  k.color(SAND).box(0, -1.5, 0, 112, 2.3, 112);
  k.color(SAND_DK).box(0, -1.5, -64, 40, 1.6, 16);
  // marble plinth with blind arcade
  k.color(MARBLE).box(0, 0.8, 0, 95, PL - 0.8, 95);
  k.color(MARBLE_DK).box(0, PL - 0.6, 0, 95.6, 0.6, 95.6);
  if (hi) {
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (let i = -10; i <= 10; i++) archPanel(k, i * 4.3, 1.6, -47.53, 2.6, 4.0, MARBLE_SH);
      k.pop();
    }
  }
  // mausoleum: chamfered square
  const S = 28.3, C = 9.2;
  const oct = [[-S + C, -S], [S - C, -S], [S, -S + C], [S, S - C], [S - C, S], [-S + C, S], [-S, S - C], [-S, -S + C]];
  k.color(MARBLE).extrude(oct, PL, ROOF - PL);
  k.color(MARBLE_DK).extrude(oct.map(([x, z]) => [x * 1.012, z * 1.012]), ROOF - 0.8, 0.8);
  if (hi) {
    k.color(MARBLE_DK);
    for (let i = 0; i < 8; i++) {
      const a = oct[i], b = oct[(i + 1) % 8];
      const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.2));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        k.box(a[0] + (b[0] - a[0]) * t, ROOF, a[1] + (b[1] - a[1]) * t, 0.9, 0.9, 0.9);
      }
    }
  }
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    mainFace(k);
    // chamfer face between this side and the next (at the -X,-Z corner of the face frame)
    const mx = -S + C / 2, mz = -S + C / 2;
    k.push().translate(mx, 0, mz).rotateY(Math.PI / 4);
    chamferFace(k);
    k.pop();
    k.pop();
  }
  // drum, onion dome, lotus, finial
  k.color(MARBLE_DK).cyl(0, ROOF, 0, 13.2, 13.2, 1.2, seg);
  k.color(MARBLE).cyl(0, ROOF + 1.2, 0, 11.7, 11.7, 7.6, seg, { caps: false });
  if (hi) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.push().translate(Math.cos(a) * 11.72, 0, Math.sin(a) * 11.72).rotateY(-a - Math.PI / 2);
      archPanel(k, 0, ROOF + 2.4, 0, 2.4, 4.6, MARBLE_SH);
      k.pop();
    }
    k.color(MARBLE_DK).cyl(0, ROOF + 8.4, 0, 12.0, 12.0, 0.5, seg, { caps: false });
  }
  const D = ROOF + 8.8;
  k.color(MARBLE).lathe(0, D, 0, [
    [11.7, 0], [12.9, 1.8], [13.7, 4.4], [13.8, 6.6], [13.4, 9.4], [12.4, 12.2], [10.6, 15.0],
    [8.2, 17.4], [5.6, 19.4], [3.2, 20.9], [1.7, 21.7], [1.1, 22.2],
  ], hi ? 40 : 14);
  // inverted-lotus crown
  k.color(MARBLE_DK).lathe(0, D + 22.2, 0, [[1.1, 0], [2.4, 0.5], [2.0, 1.1], [0.8, 1.5]], hi ? 16 : 6);
  // gilded finial: stacked bulbs + crescent
  const F = D + 23.7;
  k.color(GOLD);
  k.cyl(0, F, 0, 0.5, 0.35, 1.2, 8);
  k.sphere(0, F + 1.7, 0, 0.8, 8, 5);
  k.cyl(0, F + 2.4, 0, 0.3, 0.25, 1.0, 6);
  k.sphere(0, F + 3.9, 0, 0.65, 8, 5);
  k.cyl(0, F + 4.4, 0, 0.18, 0.12, 2.6, 6);
  if (hi) {
    // crescent finial
    k.push().translate(0, F + 7.6, 0);
    for (let i = 0; i < 6; i++) {
      const a0 = -1.1 + (i / 6) * 2.2, a1 = -1.1 + ((i + 1) / 6) * 2.2;
      k.pipe([Math.sin(a0) * 0.9, -Math.cos(a0) * 0.9 + 0.9, 0], [Math.sin(a1) * 0.9, -Math.cos(a1) * 0.9 + 0.9, 0], 0.12, 4);
    }
    k.pop();
  } else k.cyl(0, F + 7.0, 0, 0.3, 0.0, 2.0, 4);
  // corner chhatris
  for (const [x, z] of [[15.8, 15.8], [-15.8, 15.8], [15.8, -15.8], [-15.8, -15.8]]) chhatri(k, x, z);
  // minarets
  for (const [x, z] of [[42.6, 42.6], [-42.6, 42.6], [42.6, -42.6], [-42.6, -42.6]]) minaret(k, x, z);
}
