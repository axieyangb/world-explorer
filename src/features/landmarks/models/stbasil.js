// feature/famous-landmarks: St Basil's Cathedral (Pokrovsky Sobor), Red Square, Moscow — 1:1 (47.5 m).
// Red-brick gallery podium, central octagonal tower + tent spire with a gilded cupola, four large axial
// chapels and four smaller diagonal chapels crowned with striped / zig-zag / diamond onion domes, and the
// detached tented bell tower to the south-east. Front (-Z) faces Red Square (north).
import { Kit } from "../kit.js";

const BRICK = 0xa9412c, BRICK_DK = 0x8a3323, WHITE = 0xeee8da, CREAM = 0xe8d7a8, GOLD = 0xd6a93e, GREEN = 0x2f8a52;
const PL = 6.5; // gallery / podium top

export const lodDist = 1300;
export const glowStrength = 0.65; // floodlit domes at night
export const colliders = [
  { x: 0, z: 0, hw: 24, hd: 24, h: PL },
  { x: 0, z: 0, r: 7.5, h: 40 },
  { x: 0, z: -15, r: 4.8, h: 30 }, { x: 0, z: 15, r: 4.8, h: 30 },
  { x: -15, z: 0, r: 4.8, h: 30 }, { x: 15, z: 0, r: 4.8, h: 30 },
  { x: 25, z: 21, hw: 4, hd: 4, h: 30 },
];

const ONION = [[0.72, 0], [0.92, 0.07], [1.0, 0.18], [0.99, 0.29], [0.9, 0.41], [0.74, 0.53], [0.55, 0.64], [0.36, 0.75], [0.2, 0.85], [0.09, 0.93], [0.03, 1.0]];

/** Onion dome with a painted pattern. pat: "spiral" | "vstripe" | "zigzag" | "diamond" | "plain". */
function onion(k, x, y, z, R, H, pal, pat, twist = 2) {
  const hi = k.hi;
  const seg = hi ? 24 : 10;
  const prof = ONION;
  k.glow(true);
  for (let i = 0; i < prof.length - 1; i++) {
    const r0 = prof[i][0] * R, h0 = prof[i][1] * H, r1 = prof[i + 1][0] * R, h1 = prof[i + 1][1] * H;
    const dr = r1 - r0, dy = h1 - h0, ln = Math.hypot(dr, dy) || 1;
    const pnr = dy / ln, pny = -dr / ln;
    for (let s = 0; s < seg; s++) {
      const t0 = (s / seg) * Math.PI * 2, t1 = ((s + 1) / seg) * Math.PI * 2;
      let ci = 0;
      if (hi) {
        if (pat === "spiral") ci = Math.floor((s + i * twist) / 2) % pal.length;
        else if (pat === "vstripe") ci = Math.floor(s / 2) % pal.length;
        else if (pat === "zigzag") ci = Math.floor((i + (s % 4 < 2 ? s % 2 : 1 - (s % 2))) ) % pal.length;
        else if (pat === "diamond") ci = (Math.floor(s / 2) + i) % pal.length;
      }
      k.color(pal[(ci + pal.length) % pal.length]);
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const p00 = [x + r0 * c0, y + h0, z + r0 * s0], p01 = [x + r0 * c1, y + h0, z + r0 * s1];
      const p10 = [x + r1 * c0, y + h1, z + r1 * s0], p11 = [x + r1 * c1, y + h1, z + r1 * s1];
      const n0 = [pnr * c0, pny, pnr * s0], n1 = [pnr * c1, pny, pnr * s1];
      k._emit(p00, p10, p01, n0, n0, n1);
      k._emit(p01, p10, p11, n1, n0, n1);
    }
  }
  k.glow(false);
  // gilded cross
  k.color(GOLD).cyl(x, y + H - 0.1, z, 0.12, 0.12, 2.4, 4);
  if (hi) k.box(x, y + H + 1.4, z, 1.2, 0.14, 0.14);
}

/** Octagonal tower with white cornice bands and kokoshnik gables. */
function tower(k, x, z, r, y0, y1, drumR, drumH) {
  const hi = k.hi;
  k.color(BRICK).extrude(Kit.ngon(8, r, Math.PI / 8, x, z), y0, y1 - y0);
  k.color(WHITE).extrude(Kit.ngon(8, r * 1.06, Math.PI / 8, x, z), y1 - 0.6, 0.6);
  if (hi) {
    k.color(WHITE);
    for (const yb of [y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.7]) k.extrude(Kit.ngon(8, r * 1.03, Math.PI / 8, x, z), yb, 0.35);
    // windows
    k.color(0x3a2a22);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      const rr = r * Math.cos(Math.PI / 8) + 0.03;
      k.push().translate(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
      k.box(0, y0 + (y1 - y0) * 0.45, 0, r * 0.28, (y1 - y0) * 0.16, 0.08);
      k.pop();
    }
    // kokoshnik gables (pointed white-trimmed arches) ringing the top
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      const rr = r * Math.cos(Math.PI / 8);
      const w = 2 * r * Math.sin(Math.PI / 8) * 0.95;
      k.push().translate(x + Math.cos(a) * rr, y1, z + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
      k.color(WHITE).tri([-w / 2, 0, 0.02], [w / 2, 0, 0.02], [0, w * 0.75, 0.02]);
      k.color(BRICK).tri([-w / 2, 0, 0.02], [0, w * 0.75, 0.02], [0, w * 0.75, -0.8]).tri([w / 2, 0, 0.02], [0, w * 0.75, -0.8], [0, w * 0.75, 0.02]);
      k.color(CREAM).tri([-w * 0.36, 0.15, -0.0], [w * 0.36, 0.15, -0.0], [0, w * 0.6, -0.0]);
      k.pop();
    }
  }
  // drum
  k.color(BRICK).cyl(x, y1, z, drumR, drumR, drumH, hi ? 16 : 8);
  k.color(WHITE).cyl(x, y1 + drumH - 0.4, z, drumR * 1.08, drumR * 1.08, 0.4, hi ? 16 : 8);
  if (hi) k.color(CREAM).cyl(x, y1 + drumH * 0.4, z, drumR * 1.02, drumR * 1.02, 0.4, 16, { caps: false });
}

export function build(k) {
  const hi = k.hi;
  // gallery podium (cross-shaped octagon) with white arcade
  const pod = [[-10, -24], [10, -24], [24, -10], [24, 10], [10, 24], [-10, 24], [-24, 10], [-24, -10]];
  k.color(BRICK_DK).extrude(pod, 0, PL);
  k.color(WHITE).extrude(pod.map(([x, z]) => [x * 1.01, z * 1.01]), PL - 0.5, 0.5);
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = pod[i], b = pod[(i + 1) % 8];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const n = Math.floor(len / 3.2);
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        k.push().translate(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t).rotateY(-ang);
        k.color(0x4a2a20).box(0, 1.6, -0.05, 1.5, 2.6, 0.2);
        k.color(WHITE).box(0, 4.2, -0.06, 1.8, 0.3, 0.22);
        k.pop();
      }
    }
    // grand staircase toward Red Square (north-west) and toward the river (south)
    k.color(BRICK_DK).taper(-14, 0, -27, 6, 8, 6, 2, PL - 0.6);
    k.color(BRICK).box(-14, PL - 0.6, -25, 6.5, 6.2, 2.4);
    k.color(GREEN).taper(-14, PL + 5.6, -25, 7.2, 3.2, 1.2, 0.8, 2.6);
  }
  // central tower + tent spire (47.5 m)
  tower(k, 0, 0, 7.6, PL, 23, 6.3, 3.8);
  const T0 = 23 + 3.8;
  k.color(WHITE).extrude(Kit.ngon(8, 6.8, Math.PI / 8), T0, 0.7);
  // tent: banded octagonal pyramid (cream / red / green diamonds)
  const tent = [[6.0, 0], [5.0, 3.5], [4.0, 7], [3.0, 10.5], [2.0, 13.2], [1.25, 15.0]];
  const pal = [CREAM, BRICK, WHITE, GREEN];
  for (let i = 0; i < tent.length - 1; i++) {
    const [r0, h0] = tent[i], [r1, h1] = tent[i + 1];
    for (let s = 0; s < 8; s++) {
      const a0 = Math.PI / 8 + (s / 8) * Math.PI * 2, a1 = Math.PI / 8 + ((s + 1) / 8) * Math.PI * 2;
      k.color(hi ? pal[(i + s) % 2 === 0 ? 0 : (i % 2 ? 1 : 3)] : CREAM);
      k.quad([Math.cos(a0) * r0, T0 + 0.7 + h0, Math.sin(a0) * r0], [Math.cos(a0) * r1, T0 + 0.7 + h1, Math.sin(a0) * r1],
        [Math.cos(a1) * r1, T0 + 0.7 + h1, Math.sin(a1) * r1], [Math.cos(a1) * r0, T0 + 0.7 + h0, Math.sin(a1) * r0]);
    }
    if (hi) k.color(WHITE).extrude(Kit.ngon(8, r1 * 1.06, Math.PI / 8), T0 + 0.7 + h1 - 0.2, 0.25);
  }
  const TT = T0 + 0.7 + 15.0;
  k.color(BRICK).cyl(0, TT, 0, 1.0, 1.0, 0.6, hi ? 12 : 6);
  onion(k, 0, TT + 0.6, 0, 1.5, 2.1, [GOLD], "plain");
  // four large axial chapels (N, E, S, W) — distinctive domes
  const big = [
    [0, -15, [0x2e8b4f, 0xe8c64a], "spiral", 3],          // north: green / gold spiral
    [15, 0, [0xc23a2b, 0xf1ece0, 0x2e8b4f], "diamond", 0], // east: red / white / green diamonds
    [0, 15, [0x2f6fb0, 0xf1ece0], "zigzag", 0],           // south: blue / white zig-zag
    [-15, 0, [0xc23a2b, 0xf0e6c0], "spiral", 2],          // west: red / white spiral
  ];
  for (const [x, z, pal2, pat, tw] of big) {
    tower(k, x, z, 4.7, PL, 22.5, 3.3, 3.0);
    onion(k, x, 25.5, z, 4.4, 7.6, pal2, pat, tw);
  }
  // four smaller diagonal chapels
  const d = 11.2;
  const small = [
    [-d, -d, [0x2a8a8a, 0xeee3b0], "vstripe"],
    [d, -d, [0xe0b23c, 0x2e8b4f], "spiral"],
    [d, d, [0x2e8b4f, 0xc23a2b], "diamond"],
    [-d, d, [0xd8a22e, 0xc23a2b, 0x2e8b4f], "vstripe"],
  ];
  for (const [x, z, pal2, pat] of small) {
    tower(k, x, z, 3.3, PL, 17.5, 2.3, 2.4);
    onion(k, x, 19.9, z, 3.1, 5.5, pal2, pat, 2);
  }
  // detached bell tower (south-east): square base, octagonal belfry arcade, green tent + small dome
  const bx = 25, bz = 21;
  k.color(BRICK).box(bx, 0, bz, 7.6, 12, 7.6);
  k.color(WHITE).box(bx, 12, bz, 8.0, 0.6, 8.0);
  k.color(hi ? 0xe9e1cf : WHITE).extrude(Kit.ngon(8, 3.8, Math.PI / 8, bx, bz), 12.6, 6.0);
  if (hi) {
    k.color(0x3a2a22);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      const rr = 3.8 * Math.cos(Math.PI / 8) + 0.03;
      k.push().translate(bx + Math.cos(a) * rr, 0, bz + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
      k.box(0, 13.2, 0, 1.6, 4.2, 0.08);
      k.pop();
    }
  }
  k.color(WHITE).extrude(Kit.ngon(8, 4.2, Math.PI / 8, bx, bz), 18.6, 0.6);
  k.color(GREEN).lathe(bx, 19.2, bz, [[3.6, 0], [0.9, 9.0]], 8, { smooth: false });
  onion(k, bx, 28.2, bz, 1.2, 1.9, [GOLD], "plain");
}
