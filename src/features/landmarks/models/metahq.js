// feature/famous-landmarks: Meta HQ — 1 Hacker Way & Frank Gehry MPK 20/21 Campus, Menlo Park — 1:1 (37.4845, -122.1477).
// Sprawling architectural pavilion with an elevated 9-acre green rooftop park (tree groves, winding pathways,
// cafe pergolas, solar canopies), white sculptural skylight cones & angled titanium-stucco facade volumes,
// Gehry zig-zag exterior staircases ascending to the roof garden, central redwood bowl courtyard,
// and the iconic Meta infinity-blue (#0081FB) monument sign at 1 Hacker Way.

const META_BLUE = 0x0081fb, META_LT = 0x3ea2ff;
const WALL = 0xf2f0eb, WALL_SH = 0xd9d5cc, TITANIUM = 0xd8dfe6;
const GLASS = 0x48647c, GLASS_LT = 0x82a6c4;
const LAWN = 0x4f8e46, TREE_A = 0x3b7536, TREE_B = 0x579145;
const PATH = 0xded9ce, WOOD = 0xb88b58, LIT = 0xfff2d4, DARK = 0x1e242b, SOLAR = 0x202d3d;

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.85;

const W = 248, D = 96, H = 14.5;

export const colliders = [
  { x: 0, z: 0, hw: W * 0.5, hd: D * 0.5, h: H },
  { x: -45, z: 0, hw: 18, hd: 16, h: H + 8 },
  { x: 38, z: 0, hw: 20, hd: 16, h: H + 9 },
];

/** 3D block letter for M E T A centred at (cx, y0, z). */
function metaLetter(k, ch, cx, y0, z, w, h, d) {
  const t = w * 0.23;
  if (ch === "M") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx + w / 2 - t / 2, y0, z, t, h, d);
    k.strut([cx - w / 2 + t / 2, y0 + h - t * 0.3, z], [cx, y0 + h * 0.35, z], t * 0.9);
    k.strut([cx + w / 2 - t / 2, y0 + h - t * 0.3, z], [cx, y0 + h * 0.35, z], t * 0.9);
  } else if (ch === "E") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx, y0 + h - t, z, w, t, d);
    k.box(cx - w * 0.06, y0 + (h - t) * 0.5, z, w * 0.88, t * 0.9, d);
    k.box(cx, y0, z, w, t, d);
  } else if (ch === "T") {
    k.box(cx, y0, z, t, h, d);
    k.box(cx, y0 + h - t, z, w, t, d);
  } else if (ch === "A") {
    k.strut([cx - w / 2 + t / 2, y0, z], [cx, y0 + h - t * 0.3, z], t);
    k.strut([cx + w / 2 - t / 2, y0, z], [cx, y0 + h - t * 0.3, z], t);
    k.box(cx, y0 + h * 0.38, z, w * 0.62, t * 0.85, d);
  }
}

function gehryBuilding(k) {
  const hi = k.hi;

  // 1. Ground plaza & parking undercroft plinth
  k.glow(false).color(PATH).box(0, -2.5, 0, W + 28, 2.9, D + 36);

  // 2. Main 3-story sprawling pavilion body with recessed glass curtain walls & night-lit bands
  k.color(GLASS).box(0, 0.4, 0, W - 4, H - 0.8, D - 4);
  k.glow(true).color(LIT);
  for (const yf of [1.5, 5.8, 10.1]) {
    k.box(0, yf, 0, W - 2.5, 2.5, D - 6);
    k.box(0, yf, 0, W - 6, 2.5, D - 2.5);
  }
  k.glow(false);

  if (hi) {
    k.color(DARK);
    for (let x = -W * 0.46; x <= W * 0.46; x += 9.5) {
      k.box(x, 0.4, -D * 0.5 + 1.2, 0.22, H - 0.8, 0.35);
      k.box(x, 0.4, D * 0.5 - 1.2, 0.22, H - 0.8, 0.35);
    }
    for (let z = -D * 0.44; z <= D * 0.44; z += 9.5) {
      k.box(-W * 0.5 + 1.2, 0.4, z, 0.35, H - 0.8, 0.22);
      k.box(W * 0.5 - 1.2, 0.4, z, 0.35, H - 0.8, 0.22);
    }
  }

  // 3. Frank Gehry sculptural angled white stucco & brushed-titanium facade bays around the perimeter
  for (let i = -5; i <= 5; i++) {
    const bx = i * 21.0;
    for (const sz of [-1, 1]) {
      const bz = sz * (D * 0.5);
      const tilt = ((i * 7) % 3 - 1) * 0.14;
      k.push().translate(bx, 0.4, bz).rotateY(tilt);
      k.color(i % 2 === 0 ? WALL : TITANIUM).box(0, 0, 0, 12.5, H + 0.6, 5.2);
      k.glow(true).color(GLASS_LT).box(0, 1.2, sz * 2.5, 8.8, H - 2.4, 0.6);
      k.glow(false);
      if (hi) {
        k.color(WALL_SH);
        for (let m = -3.5; m <= 3.5; m += 1.75) {
          k.box(m, 1.2, sz * 2.82, 0.18, H - 2.4, 0.22);
        }
        k.color(TITANIUM).box(0, H + 0.3, sz * 1.4, 13.4, 0.55, 6.4);
      }
      k.pop();
    }
  }

  // 4. Elevated 9-acre Rooftop Park slab + parapet + walking loop + lawn mounds + tree groves
  k.color(WALL_SH).box(0, H - 0.4, 0, W + 4, 1.1, D + 4);
  k.color(LAWN).box(0, H + 0.7, 0, W + 1.5, 0.55, D + 1.5);
  k.color(PATH).box(0, H + 1.26, 0, W - 18, 0.14, 7.5);
  k.color(WOOD).box(-12, H + 1.28, -18, 28, 0.3, 14).box(52, H + 1.28, 16, 26, 0.3, 14);

  if (hi) {
    k.color(GLASS_LT);
    k.box(0, H + 1.1, -D * 0.5 - 1.2, W + 2, 1.1, 0.14);
    k.box(0, H + 1.1, D * 0.5 + 1.2, W + 2, 1.1, 0.14);
    k.box(-W * 0.5 - 1.2, H + 1.1, 0, 0.14, 1.1, D + 2);
    k.box(W * 0.5 + 1.2, H + 1.1, 0, 0.14, 1.1, D + 2);

    const bwx = -16, bwz = 16;
    k.color(WOOD).cyl(bwx, H + 1.25, bwz, 13.5, 13.5, 0.25, 16);
    k.color(LAWN).cyl(bwx, H + 1.5, bwz, 8.2, 8.2, 0.15, 16);
    for (let st = 0; st < 3; st++) {
      k.color(WOOD).cyl(bwx, H + 1.35 + st * 0.35, bwz, 12.2 - st * 1.1, 11.4 - st * 1.1, 0.32, 16);
    }
    for (const [dx, dz] of [[-12, -18], [52, 16]]) {
      for (let b = -5; b <= 5; b++) {
        k.color(WOOD).box(dx + b * 2.1, H + 4.2, dz, 0.32, 0.38, 11.5);
      }
      for (const sx of [-11, 0, 11]) {
        for (const sz of [-5, 5]) {
          k.color(DARK).cyl(dx + sx, H + 1.5, dz + sz, 0.16, 0.16, 2.7, 6);
        }
      }
      k.color(SOLAR).box(dx, H + 4.6, dz, 22, 0.22, 10.5);
    }
  }

  const cones = [
    [-78, -12, 9.5, 7.5],
    [-42, 8, 11.5, 8.8],
    [4, -8, 10.5, 8.2],
    [44, 10, 12.0, 9.2],
    [82, -10, 9.5, 7.4],
  ];
  for (const [cx, cz, r, ch] of cones) {
    k.glow(false).color(WALL).cyl(cx, H + 1.2, cz, r, r * 0.48, ch, hi ? 20 : 10);
    k.glow(true).color(GLASS_LT).cyl(cx, H + 1.2 + ch * 0.55, cz, r * 0.72, r * 0.5, ch * 0.46, hi ? 20 : 10);
    if (hi) {
      k.glow(false).color(TITANIUM).cone(cx, H + 1.2 + ch, cz, r * 0.54, 1.4, 12);
      k.color(DARK);
      for (let m = 0; m < 8; m++) {
        const a = (m / 8) * Math.PI * 2;
        const r0 = r * 0.68, r1 = r * 0.51;
        k.strut(
          [cx + Math.cos(a) * r0, H + 1.2 + ch * 0.52, cz + Math.sin(a) * r0],
          [cx + Math.cos(a) * r1, H + 1.2 + ch * 0.98, cz + Math.sin(a) * r1],
          0.16
        );
      }
    }
  }
  k.glow(false);

  const nTrees = hi ? 42 : 14;
  for (let i = 0; i < nTrees; i++) {
    const tx = -W * 0.44 + ((i * 37) % Math.round(W * 0.88));
    const tz = -D * 0.38 + ((i * 23) % Math.round(D * 0.76));
    if (Math.abs(tz) < 6) continue;
    const th = 5.2 + (i % 3) * 1.4;
    k.color(0x5c4228).cyl(tx, H + 1.2, tz, 0.38, 0.25, th * 0.45, 5);
    k.color(i % 2 ? TREE_A : TREE_B).sphere(tx, H + 1.2 + th * 0.65, tz, 2.9 + (i % 3) * 0.6, hi ? 8 : 5, 5, 0.85);
  }

  // 5. Grand angled exterior staircases ascending from the Hacker Way plaza to the rooftop park
  for (const sx of [-1, 1]) {
    const xBase = sx * 68, xMid = sx * 57, xTop = sx * 46, zStair = -D * 0.5 - 6;
    k.color(WALL).strut([xBase, 0.4, zStair - 8], [xTop, H + 0.8, -D * 0.5 + 1], 4.8);
    k.color(PATH).strut([xBase, 0.9, zStair - 8], [xTop, H + 1.2, -D * 0.5 + 1], 3.8);
    if (hi) {
      k.color(WALL).box(xMid, 7.2, zStair - 3.5, 6.2, 0.8, 5.4);
      k.color(WALL_SH).cyl(xMid, 0.4, zStair - 3.5, 0.55, 0.55, 7.0, 8);
      k.color(GLASS_LT).strut([xBase, 1.7, zStair - 10.1], [xTop, H + 2.0, -D * 0.5 - 1.1], 0.16);
      k.strut([xBase, 1.7, zStair - 5.9], [xTop, H + 2.0, -D * 0.5 + 3.1], 0.16);
    }
  }
}

function hackerWaySign(k) {
  const hi = k.hi;
  k.push().translate(0, 0, -D * 0.5 - 20);
  k.glow(false).color(DARK).box(0, 0.2, 0, 44, 1.4, 4.8);
  if (hi) {
    k.color(PATH).cyl(0, 0.08, -8.5, 16.0, 16.0, 0.14, 20);
    k.glow(true).color(LIT).box(0, 1.62, -1.8, 40, 0.12, 0.35).glow(false);
  }

  const seg = hi ? 36 : 14;
  const cx = -13.5, cy = 4.8;
  k.glow(true);
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (t) => {
      const d = 1 + Math.sin(t) * Math.sin(t) * 0.35;
      return [
        cx + (5.2 * Math.cos(t)) / d,
        cy + (3.6 * Math.sin(t) * Math.cos(t)) / d,
        0.4 * Math.sin(t),
      ];
    };
    k.color(i % 2 === 0 ? META_BLUE : META_LT).strut(p(t0), p(t1), 1.05);
  }

  const word = ["M", "E", "T", "A"];
  for (let i = 0; i < word.length; i++) {
    k.color(WALL);
    metaLetter(k, word[i], -1.5 + i * 5.8, 1.6, 0, 4.2, 5.8, 1.5);
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  gehryBuilding(k);
  hackerWaySign(k);
  k.glow(false);
}
