// feature/famous-landmarks: St Basil's Cathedral (Pokrovsky Sobor), Red Square, Moscow — 1:1 (47.5 m).
// Red-brick gallery podium, central octagonal tower + tent spire with a gilded cupola, four large axial
// chapels and four smaller diagonal chapels crowned with striped / zig-zag / diamond onion domes, the 10th
// NE chapel of St. Basil, Monument to Minin and Pozharsky in front, and the detached tented bell tower to the SE.
// Front (-Z) faces Red Square (north).
import { Kit } from "../kit.js";

const BRICK = 0xa9412c, BRICK_DK = 0x8a3323, WHITE = 0xeee8da, CREAM = 0xe8d7a8, GOLD = 0xd6a93e, GREEN = 0x2f8a52;
const BRONZE = 0x485846, GRANITE = 0x8c463a;
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

/** Russian Orthodox 3-bar gilded cross with crescent moon & guy chains. */
function orthodoxCross(k, x, y, z, s = 1, rShoulder = 0.6) {
  const hi = k.hi;
  k.color(GOLD).cyl(x, y - 0.1, z, 0.11 * s, 0.09 * s, 2.5 * s, 4);
  if (!hi) return;
  // Upper titulus bar
  k.box(x, y + 1.95 * s, z, 0.65 * s, 0.1 * s, 0.1 * s);
  // Main horizontal bar
  k.box(x, y + 1.45 * s, z, 1.35 * s, 0.13 * s, 0.13 * s);
  // Tilted lower suppedaneum (footrest)
  k.strut([x - 0.42 * s, y + 0.65 * s, z], [x + 0.42 * s, y + 0.92 * s, z], 0.1 * s);
  // Crescent moon at base
  k.strut([x - 0.35 * s, y + 0.38 * s, z], [x, y + 0.22 * s, z], 0.09 * s);
  k.strut([x, y + 0.22 * s, z], [x + 0.35 * s, y + 0.38 * s, z], 0.09 * s);
  // 4 diagonal golden stabilization chains down to dome neck
  if (rShoulder > 0.3) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.strut([x, y + 1.45 * s, z], [x + Math.cos(a) * rShoulder, y - 0.35 * s, z + Math.sin(a) * rShoulder], 0.035 * s);
    }
  }
}

/** Onion dome with a painted pattern and 3D sculpted ribs. pat: "spiral" | "vstripe" | "zigzag" | "diamond" | "plain". */
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
        else if (pat === "zigzag") ci = Math.floor((i + (s % 4 < 2 ? s % 2 : 1 - (s % 2)))) % pal.length;
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
  // 3D sculpted ribs / pineapple bosses on domes in hi mode
  if (hi && pat !== "plain") {
    for (let s = 0; s < 12; s++) {
      k.color(pal[s % pal.length]);
      for (let i = 1; i < prof.length - 2; i++) {
        const a0 = ((s * 2 + (pat === "spiral" ? i * twist : 0)) / seg) * Math.PI * 2;
        const a1 = ((s * 2 + (pat === "spiral" ? (i + 1) * twist : 0)) / seg) * Math.PI * 2;
        const r0 = prof[i][0] * R * 1.02, h0 = prof[i][1] * H;
        const r1 = prof[i + 1][0] * R * 1.02, h1 = prof[i + 1][1] * H;
        k.strut([x + Math.cos(a0) * r0, y + h0, z + Math.sin(a0) * r0],
                [x + Math.cos(a1) * r1, y + h1, z + Math.sin(a1) * r1], R * 0.055);
      }
    }
  }
  k.glow(false);
  orthodoxCross(k, x, y + H, z, Math.max(0.65, R * 0.28), R * 0.25);
}

/** Octagonal tower with white cornice bands, pilasters, and kokoshnik gables. */
function tower(k, x, z, r, y0, y1, drumR, drumH) {
  const hi = k.hi;
  k.color(BRICK).extrude(Kit.ngon(8, r, Math.PI / 8, x, z), y0, y1 - y0);
  k.color(WHITE).extrude(Kit.ngon(8, r * 1.06, Math.PI / 8, x, z), y1 - 0.6, 0.6);
  if (hi) {
    k.color(WHITE);
    for (const yb of [y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.7]) k.extrude(Kit.ngon(8, r * 1.03, Math.PI / 8, x, z), yb, 0.35);
    // corner white pilasters on octagon vertices
    for (let i = 0; i < 8; i++) {
      const av = Math.PI / 8 + (i / 8) * Math.PI * 2;
      k.color(WHITE).cyl(x + Math.cos(av) * r, y0, z + Math.sin(av) * r, 0.22, 0.22, y1 - y0, 6);
    }
    // windows with white arched surrounds
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      const rr = r * Math.cos(Math.PI / 8) + 0.03;
      k.push().translate(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
      const wy = y0 + (y1 - y0) * 0.45, ww = r * 0.28, wh = (y1 - y0) * 0.16;
      k.color(WHITE).box(0, wy - 0.1, 0, ww + 0.22, wh + 0.25, 0.06);
      k.color(0x3a2a22).box(0, wy, 0.02, ww, wh, 0.08);
      k.pop();
    }
    // two tiers of kokoshnik gables (pointed white-trimmed arches) ringing the top
    for (let tier = 0; tier < 2; tier++) {
      const ty = y1 + tier * 0.85;
      const tr = r * (1 - tier * 0.12);
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + ((i + 0.5 + tier * 0.5) / 8) * Math.PI * 2;
        const rr = tr * Math.cos(Math.PI / 8);
        const w = 2 * tr * Math.sin(Math.PI / 8) * 0.92;
        k.push().translate(x + Math.cos(a) * rr, ty, z + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
        k.color(WHITE).tri([-w / 2, 0, 0.02], [w / 2, 0, 0.02], [0, w * 0.72, 0.02]);
        k.color(BRICK).tri([-w / 2, 0, 0.02], [0, w * 0.72, 0.02], [0, w * 0.72, -0.75]).tri([w / 2, 0, 0.02], [0, w * 0.72, -0.75], [0, w * 0.72, 0.02]);
        k.color(CREAM).tri([-w * 0.36, 0.14, 0.03], [w * 0.36, 0.14, 0.03], [0, w * 0.58, 0.03]);
        k.pop();
      }
    }
  }
  // drum with slit windows & blind arcade colonnettes
  k.color(BRICK).cyl(x, y1, z, drumR, drumR, drumH, hi ? 16 : 8);
  k.color(WHITE).cyl(x, y1 + drumH - 0.4, z, drumR * 1.08, drumR * 1.08, 0.4, hi ? 16 : 8);
  if (hi) {
    k.color(CREAM).cyl(x, y1 + drumH * 0.4, z, drumR * 1.02, drumR * 1.02, 0.35, 16, { caps: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.color(WHITE).cyl(x + Math.cos(a) * (drumR + 0.06), y1 + 0.2, z + Math.sin(a) * (drumR + 0.06), 0.12, 0.12, drumH - 0.6, 5);
      const aw = a + Math.PI / 8;
      k.color(0x2a1e18).box(x + Math.cos(aw) * (drumR + 0.02), y1 + drumH * 0.48, z + Math.sin(aw) * (drumR + 0.02), 0.28, drumH * 0.36, 0.28);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  // gallery podium (cross-shaped octagon) with white arcade & upper covered walkway
  const pod = [[-10, -24], [10, -24], [24, -10], [24, 10], [10, 24], [-10, 24], [-24, 10], [-24, -10]];
  k.color(BRICK_DK).extrude(pod, 0, PL);
  k.color(WHITE).extrude(pod.map(([x, z]) => [x * 1.01, z * 1.01]), PL - 0.5, 0.5);
  if (hi) {
    // Upper covered gallery parapet & barrel columns
    k.color(BRICK).extrude(pod.map(([x, z]) => [x * 0.96, z * 0.96]), PL, 1.1);
    k.color(WHITE).extrude(pod.map(([x, z]) => [x * 0.97, z * 0.97]), PL + 1.1, 0.25);
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
        // White potbelly column on upper gallery
        k.color(WHITE).cyl(0, PL + 1.35, 0.5, 0.28, 0.34, 1.1, 6).cyl(0, PL + 2.45, 0.5, 0.34, 0.25, 1.1, 6);
        k.pop();
      }
    }
    // Grand covered staircases toward Red Square (north-west) and south-west
    for (const sz of [-1, 1]) {
      const zp = sz * 25;
      k.color(BRICK_DK).taper(-14, 0, zp + sz * 2, 6, 8, 6, 2, PL - 0.6);
      k.color(WHITE).box(-14, PL * 0.45, zp + sz * 2, 6.4, 0.4, 6.2);
      k.color(BRICK).box(-14, PL - 0.6, zp, 6.5, 6.2, 4.8);
      k.color(WHITE).box(-14, PL + 5.2, zp, 6.9, 0.45, 5.2);
      // Green hipped tent roof over staircase porch
      k.color(GREEN).taper(-14, PL + 5.6, zp, 7.2, 5.4, 0.6, 0.6, 5.2);
      orthodoxCross(k, -14, PL + 10.8, zp, 0.5, 0);
    }

    // 10th Dome: Chapel of St. Basil the Blessed (NE corner, x = 15.5, z = -16.5)
    tower(k, 15.5, -16.5, 2.7, PL, 14.5, 1.9, 2.0);
    onion(k, 15.5, 16.5, -16.5, 2.5, 4.4, [GREEN, BRICK, GOLD], "diamond", 2);

    // Monument to Minin and Pozharsky (Red Square front, x = -2, z = -31)
    const mx = -2, mz = -31;
    k.color(WHITE).box(mx, 0, mz, 5.8, 0.45, 4.2);
    k.color(GRANITE).box(mx, 0.45, mz, 4.4, 3.4, 3.0);
    k.color(GRANITE).box(mx, 3.85, mz, 4.8, 0.35, 3.4);
    // Bronze bas-relief plaque on front of pedestal
    k.color(BRONZE).box(mx, 1.4, mz - 1.52, 3.2, 1.5, 0.12);
    // Seated Prince Pozharsky (left) with round shield & sword
    k.color(BRONZE).cyl(mx - 0.85, 4.2, mz, 0.55, 0.45, 1.9, 8);
    k.sphere(mx - 0.85, 6.35, mz, 0.28, 6, 4);
    k.cyl(mx - 1.35, 4.9, mz - 0.3, 0.5, 0.5, 0.12, 8); // shield
    // Standing Kuzma Minin (right) pointing toward the Kremlin
    k.color(BRONZE).cyl(mx + 0.85, 4.2, mz, 0.48, 0.38, 2.5, 8);
    k.sphere(mx + 0.85, 6.95, mz, 0.28, 6, 4);
    k.strut([mx + 0.85, 6.2, mz], [mx - 0.1, 6.85, mz - 0.5], 0.14); // outstretched pointing arm
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
      if (hi) {
        // White corner ribs up the 8 edges of the tent spire
        k.color(WHITE).strut([Math.cos(a0) * (r0 + 0.08), T0 + 0.7 + h0, Math.sin(a0) * (r0 + 0.08)],
                             [Math.cos(a0) * (r1 + 0.08), T0 + 0.7 + h1, Math.sin(a0) * (r1 + 0.08)], 0.16);
      }
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
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      const rr = 3.8 * Math.cos(Math.PI / 8) + 0.03;
      k.push().translate(bx + Math.cos(a) * rr, 0, bz + Math.sin(a) * rr).rotateY(-a - Math.PI / 2);
      k.color(0x3a2a22).box(0, 13.2, 0, 1.6, 4.2, 0.08);
      // Hanging bronze bell inside belfry arch
      if (i % 2 === 0) k.color(BRONZE).cyl(0, 15.2, -0.35, 0.42, 0.22, 0.85, 6);
      k.pop();
    }
    // Dormer lucarnes (slukhi) on the green bell-tower tent roof
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + ((i + 0.5) / 8) * Math.PI * 2;
      k.push().translate(bx + Math.cos(a) * 2.5, 22.2, bz + Math.sin(a) * 2.5).rotateY(-a - Math.PI / 2);
      k.color(WHITE).box(0, 0, 0, 0.85, 1.1, 0.5);
      k.color(GREEN).taper(0, 1.1, 0, 1.0, 0.6, 0.1, 0.2, 0.7);
      k.pop();
    }
  }
  k.color(WHITE).extrude(Kit.ngon(8, 4.2, Math.PI / 8, bx, bz), 18.6, 0.6);
  k.color(GREEN).lathe(bx, 19.2, bz, [[3.6, 0], [0.9, 9.0]], 8, { smooth: false });
  onion(k, bx, 28.2, bz, 1.2, 1.9, [GOLD], "plain");
}
