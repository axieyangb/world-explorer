// feature/famous-landmarks: Empire State Building, Manhattan — 1:1 (roof 381 m, antenna tip 443 m).
// 5-storey base filling the 129 x 57 m lot, limestone setbacks at floors 6 / 21 / 25 / 30 / 72 / 81 / 85,
// 86th-floor observatory, art-deco mooring mast to the 102nd floor and the broadcast antenna.
// Local X = long side (along 33rd/34th St), front (-Z) faces uptown along the avenue grid (heading 29).
// At night the setbacks and the mast are floodlit in colour (separate "night" part, hidden by day).

const LIME = 0xd2c9b3, LIME2 = 0xc6bca5, LIME_LT = 0xe0d8c4;
const WIN = 0x47423a;      // window columns (glow bucket: dark by day, warm at night)
const ALU = 0xb8bdc3, ALU_DK = 0x8d939a, GLASS = 0x5b6670;

export const lodDist = 1800;
export const glowStrength = 2.0;

// y of a floor's slab (base floors are taller)
const FL = (n) => (n <= 6 ? n * 4 : 24 + (n - 6) * 3.71);
const Y21 = FL(21), Y25 = FL(25), Y30 = FL(30), Y72 = FL(72), Y81 = FL(81), Y85 = FL(85), Y86 = FL(86);

export const colliders = [
  { x: 0, z: 0, hw: 64.5, hd: 28.5, h: 24 },
  { x: 0, z: 0, hw: 52, hd: 24, h: Y21 },
  { x: 0, z: 0, hw: 31, hd: 20, h: Y72 },
  { x: 0, z: 0, hw: 25, hd: 17, h: Y86 },
  { x: 0, z: 0, r: 8, h: 381 },
];

// tier list: [w, d, y0, y1, notch]
const TIERS = [
  [104, 48, 24, Y21, 0],
  [92, 45, Y21, Y25, 0],
  [80, 43, Y25, Y30, 0],
  [62, 40, Y30, Y72, 6],
  [50, 34, Y72, Y81, 4],
  [40, 28, Y81, Y85, 0],
  [34, 24, Y85, Y86, 0],
];

function notched(w, d, n) {
  const a = w / 2, b = d / 2;
  return [[-a + n, -b], [a - n, -b], [a - n, -b + n], [a, -b + n], [a, b - n], [a - n, b - n], [a - n, b], [-a + n, b],
    [-a + n, b - n], [-a, b - n], [-a, -b + n], [-a + n, -b + n]];
}

/** Window columns: single quads just proud of the four faces of a w x d block. */
function strips(k, w, d, y0, h, sp, sw, inset = 0, piers = null) {
  for (let f = 0; f < 4; f++) {
    const W = (f % 2 ? d : w) - 2 * inset, D = f % 2 ? w : d;
    const n = Math.max(1, Math.round((W * 0.94) / sp));
    k.push().rotateY((f * Math.PI) / 2);
    const z = -D / 2 - 0.15;
    for (let i = 0; i < n; i++) {
      const x = -W * 0.47 + (i + 0.5) * ((W * 0.94) / n);
      k.quad([x + sw / 2, y0, z], [x - sw / 2, y0, z], [x - sw / 2, y0 + h, z], [x + sw / 2, y0 + h, z]);
    }
    if (piers != null) {
      // [lm-materials] limestone piers standing proud between the window columns (the deco vertical relief)
      const g = k._glow, hex = k._hex;
      k.glow(false).color(piers);
      for (let i = 0; i <= n; i++) {
        const x = -W * 0.47 + i * ((W * 0.94) / n), pw = Math.max(0.3, (W * 0.94) / n - sw);
        k.box(x, y0, z + 0.05, pw, h, 0.5);
      }
      k.glow(g).color(hex);
    }
    k.pop();
  }
}

function tower(k) {
  const hi = k.hi;
  // --- 5-storey base on the full lot
  k.color(LIME2).box(0, 0, 0, 129, 24, 57);
  if (hi) {
    k.color(LIME_LT).box(0, 23.2, 0, 129.6, 0.8, 57.6);          // cornice
    k.glow(true).color(0x6a5a40);
    strips(k, 129, 57, 7, 15, 3.6, 1.6);
    k.color(0x8a7550).box(0, 0, 0, 129.4, 5.5, 57.4);             // shopfronts (lit at night)
    k.glow(false);
    // 5th Ave / 34th St entrance canopies (front + both ends)
    k.color(ALU_DK).box(0, 5.5, -28.9, 18, 1.0, 1.6);
  }
  // --- setback tiers
  TIERS.forEach(([w, d, y0, y1, n], i) => {
    const h = y1 - y0;
    k.color(i % 2 ? LIME : LIME2);
    if (n) k.extrude(notched(w, d, n), y0, h);
    else k.box(0, y0, 0, w, h, d);
    if (hi) {
      // parapet cap on each setback
      k.color(LIME_LT).box(0, y1 - 0.6, 0, w - 2 * n + 0.6, 0.9, d + 0.6);
      if (n) k.box(0, y1 - 0.6, 0, w + 0.6, 0.9, d - 2 * n + 0.6);
      // window columns, with thin aluminium spandrel mullions between (strong vertical rhythm)
      k.glow(true).color(WIN);
      const pc = k.fine ? (i % 2 ? LIME : LIME2) : null;
      if (n) {
        strips(k, w - 2 * n, d, y0 + 0.5, h - 1.6, 3.1, 1.5, 0, pc);
        strips(k, w, d - 2 * n, y0 + 0.5, h - 1.6, 3.1, 1.5, 0, pc);
      } else strips(k, w, d, y0 + 0.5, h - 1.6, 3.1, 1.5, 0, pc);
      k.glow(false);
    }
  });
  // main-shaft corner piers (aluminium-capped ribs up the notches)
  if (hi) {
    k.color(ALU);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(sx * 25, Y30, sz * 20.2, 0.7, Y72 - Y30, 0.5);
      k.box(sx * 31.2, Y30, sz * 14, 0.5, Y72 - Y30, 0.7);
    }
  }
  // --- 86th floor observatory enclosure + terrace railing
  k.color(LIME).box(0, Y86, 0, 27, 4.6, 19);
  if (hi) {
    k.glow(true).color(0x6a6050).box(0, Y86 + 1.2, 0, 27.3, 2.4, 19.3).glow(false);
    k.color(ALU_DK);
    for (const [w, d] of [[34, 24]]) {
      k.box(0, Y86, -d / 2 + 0.2, w, 1.6, 0.3).box(0, Y86, d / 2 - 0.2, w, 1.6, 0.3);
      k.box(-w / 2 + 0.2, Y86, 0, 0.3, 1.6, d).box(w / 2 - 0.2, Y86, 0, 0.3, 1.6, d);
    }
  }
}

function mast(k) {
  const hi = k.hi, seg = hi ? 16 : 8;
  const y0 = Y86 + 4.6; // ~324.6
  // square mast base with four stepped buttresses
  k.color(LIME).taper(0, y0, 0, 18, 18, 15, 15, 11);
  k.color(ALU);
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.taper(0, y0, -9.5, 5, 4, 2.4, 1.2, 15, 0, 2.0);
    if (hi) k.taper(0, y0 + 11, -6.8, 3, 1.6, 1.4, 0.6, 12, 0, 1.0);
    k.pop();
  }
  // fluted mast shaft
  const ys = y0 + 11;
  k.color(ALU).lathe(0, ys, 0, [[7.4, 0], [7.0, 6], [6.3, 16], [5.5, 25], [4.9, 28.5]], hi ? 8 : 8, { smooth: false, phase: Math.PI / 8 });
  if (hi) {
    k.color(ALU_DK);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.strut([Math.cos(a) * 7.5, ys, Math.sin(a) * 7.5], [Math.cos(a) * 5.0, ys + 28.5, Math.sin(a) * 5.0], 0.8);
    }
    k.glow(true).color(0x5a5446);
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      k.strut([Math.cos(a) * 7.1, ys + 2, Math.sin(a) * 7.1], [Math.cos(a) * 5.2, ys + 26, Math.sin(a) * 5.2], 1.4);
    }
    k.glow(false);
  }
  // 102nd floor glass drum and cap to the 381 m roof
  const y102 = ys + 28.5;               // ~364
  k.glow(true).color(GLASS).cyl(0, y102, 0, 4.6, 4.4, 8.5, seg).glow(false);
  k.color(ALU).lathe(0, y102 + 8.5, 0, [[4.9, 0], [4.9, 1.0], [4.0, 3.5], [2.8, 6.5], [2.4, 381 - (y102 + 8.5)]], seg);
  // antenna 381 -> 443 m
  k.color(ALU_DK).cyl(0, 381, 0, 2.2, 1.6, 14, hi ? 10 : 6);
  k.color(0xc9ced4).cyl(0, 395, 0, 1.2, 0.8, 22, hi ? 8 : 5);
  if (hi) for (const y of [397, 404, 411]) k.color(ALU_DK).cyl(0, y, 0, 1.6, 1.6, 1.2, 8);
  k.color(0xd6d9de).cyl(0, 417, 0, 0.5, 0.08, 26, hi ? 6 : 4);
  k.glow(true).color(0xff5a4a).sphere(0, 425, 0, 0.7, 6, 4).glow(false);
}

/** Coloured floodlighting of the crown, only shown at night (see setup). */
function nightLights(k) {
  k.part("night");
  k.glow(true);
  const o = 0.35;
  // 72nd–85th floor setbacks: warm white
  k.color(0xfff0c8);
  k.extrude(notched(50 + o, 34 + o, 4), Y72 + 1, Y81 - Y72 - 1);
  k.color(0xffffff).box(0, Y81, 0, 40 + o, Y85 - Y81, 28 + o);
  k.color(0x7aa0ff).box(0, Y85, 0, 34 + o, Y86 - Y85 + 4.6, 24 + o);
  // mast: blue, 102nd floor + cap: red
  const y0 = Y86 + 4.6, ys = y0 + 11;
  k.color(0x3c6cff).taper(0, y0, 0, 18.5, 18.5, 15.5, 15.5, 11);
  k.color(0x3c6cff).lathe(0, ys, 0, [[7.7, 0], [7.3, 6], [6.6, 16], [5.8, 25], [5.2, 28.5]], k.hi ? 16 : 8);
  k.color(0xff3b3b).lathe(0, ys + 28.5, 0, [[4.9, 0], [4.7, 8.5], [5.2, 9.5], [4.3, 12], [3.1, 15]], k.hi ? 16 : 8);
  k.glow(false);
  k.part("main");
}

export function build(k) {
  tower(k);
  mast(k);
  nightLights(k);
}

export function setup({ parts }) {
  const lights = parts("night");
  for (const o of lights) o.visible = false;
  return {
    update(dt, t, night) {
      const on = night > 0.2;
      for (const o of lights) o.visible = on;
    },
  };
}
