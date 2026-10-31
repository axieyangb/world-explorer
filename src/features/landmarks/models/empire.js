// feature/famous-landmarks: Empire State Building, Manhattan — 1:1 (roof 381 m, antenna tip 443 m).
// 5-storey base filling the 129 x 57 m lot with the iconic 3-storey Fifth Avenue Art Deco entrance portal,
// Indiana limestone setbacks at floors 6 / 21 / 25 / 30 / 72 / 81 / 85 with vertical stainless-steel/nickel
// window spandrel piers, 86th-floor open-air observatory with diamond safety mesh & binoculars, Art Deco
// airship mooring mast with 102nd & 103rd floor observation decks, and multi-tiered broadcast antenna.
const LIME = 0xd2c9b3, LIME2 = 0xc6bca5, LIME_LT = 0xe0d8c4;
const WIN = 0x47423a;      // window columns (glow bucket: dark by day, warm at night)
const ALU = 0xb8bdc3, ALU_DK = 0x8d939a, GLASS = 0x5b6670, GOLD = 0xd6b04c;

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

/** Window columns: single quads just proud of the four faces of a w x d block, plus optional limestone piers. */
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
    strips(k, 129, 57, 7, 15, 3.6, 1.6, 0, LIME);
    k.color(0x8a7550).box(0, 0, 0, 129.4, 5.5, 57.4);             // shopfronts (lit at night)
    k.glow(false);
    // Iconic 3-Storey Art Deco Entrance Portals on Fifth Avenue (+X/-X ends) & 34th/33rd Street (-Z/+Z)
    for (const sz of [-1, 1]) {
      const pz = sz * 28.6;
      k.color(LIME_LT).box(0, 0, pz, 16.5, 18.5, 1.4);
      k.color(ALU_DK).box(0, 0, pz + sz * 0.4, 11.2, 15.2, 0.8);
      k.glow(true).color(0xffe6a8).box(0, 4.8, pz + sz * 0.55, 8.8, 9.6, 0.6).glow(false);
      k.color(ALU_DK).box(0, 5.5, pz + sz * 0.8, 18, 1.0, 1.8);
      // Pair of sculpted Art Deco limestone eagles flanking the Fifth Ave / 34th St entrance piers
      for (const ex of [-6.8, 6.8]) {
        k.color(LIME_LT).box(ex, 0, pz + sz * 0.5, 1.8, 18.8, 1.2);
        k.color(ALU).box(ex, 16.5, pz + sz * 1.1, 1.2, 2.4, 0.8);
      }
      // Bronze Empire State Building medallion in the transom
      k.color(GOLD).cyl(0, 11.5, pz + sz * 0.88, 1.4, 1.4, 0.25, 12);
    }
    for (const sx of [-1, 1]) {
      const px = sx * 64.6;
      k.color(LIME_LT).box(px, 0, 0, 1.4, 19.5, 15.0);
      k.glow(true).color(0xffe6a8).box(px + sx * 0.4, 4.8, 0, 0.8, 11.2, 9.2).glow(false);
      k.color(ALU_DK).box(px + sx * 0.9, 5.2, 0, 1.8, 1.0, 14.5);
    }
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
      // window columns with limestone vertical piers in k.hi mode
      k.glow(true).color(WIN);
      const pc = i % 2 ? LIME : LIME2;
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
  // --- 86th floor observatory enclosure + terrace railing + binocular stands
  k.color(LIME).box(0, Y86, 0, 27, 4.6, 19);
  if (hi) {
    k.glow(true).color(0x6a6050).box(0, Y86 + 1.2, 0, 27.3, 2.4, 19.3).glow(false);
    k.color(ALU_DK);
    const w = 34, d = 24;
    k.box(0, Y86, -d / 2 + 0.2, w, 1.4, 0.3).box(0, Y86, d / 2 - 0.2, w, 1.4, 0.3);
    k.box(-w / 2 + 0.2, Y86, 0, 0.3, 1.4, d).box(w / 2 - 0.2, Y86, 0, 0.3, 1.4, d);
    // Iconic 86th-floor stainless-steel safety fence & Art Deco coin-operated tower viewer binoculars
    k.color(ALU);
    k.box(0, Y86 + 2.8, -d / 2 + 0.2, w, 0.18, 0.18).box(0, Y86 + 2.8, d / 2 - 0.2, w, 0.18, 0.18);
    k.box(-w / 2 + 0.2, Y86 + 2.8, 0, 0.18, 0.18, d).box(w / 2 - 0.2, Y86 + 2.8, 0, 0.18, 0.18, d);
    for (let bx = -14; bx <= 14; bx += 7) {
      for (const bz of [-d / 2 + 1.1, d / 2 - 1.1]) {
        k.color(ALU_DK).cyl(bx, Y86, bz, 0.16, 0.12, 1.45, 6);
        k.color(ALU).box(bx, Y86 + 1.45, bz, 0.35, 0.25, 0.45);
      }
    }
  }
}

function mast(k) {
  const hi = k.hi, seg = hi ? 16 : 8;
  const y0 = Y86 + 4.6; // ~324.6
  // square mast base with four stepped Art Deco aluminum wing buttresses
  k.color(LIME).taper(0, y0, 0, 18, 18, 15, 15, 11);
  k.color(ALU);
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.taper(0, y0, -9.5, 5, 4, 2.4, 1.2, 15, 0, 2.0);
    if (hi) {
      k.taper(0, y0 + 11, -6.8, 3, 1.6, 1.4, 0.6, 12, 0, 1.0);
      // Horizontal Art Deco chevrons on the 4 mast wing buttresses
      k.color(ALU_DK);
      for (let cy = y0 + 2; cy <= y0 + 12; cy += 2.5) {
        k.box(0, cy, -10.8 + (cy - y0) * 0.12, 5.2 - (cy - y0) * 0.18, 0.35, 0.45);
      }
      k.color(ALU);
    }
    k.pop();
  }
  // fluted mast shaft
  const ys = y0 + 11;
  k.color(ALU).lathe(0, ys, 0, [[7.4, 0], [7.0, 6], [6.3, 16], [5.5, 25], [4.9, 28.5]], 8, { smooth: false, phase: Math.PI / 8 });
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
  // 102nd floor glass drum, 103rd floor airship mooring balcony ring, and cap to the 381 m roof
  const y102 = ys + 28.5;               // ~364
  k.glow(true).color(GLASS).cyl(0, y102, 0, 4.6, 4.4, 8.5, seg).glow(false);
  if (hi) {
    // 102nd floor floor-to-ceiling glass mullions + 103rd floor open-air mooring balcony at y = y102 + 9.2
    k.color(ALU);
    for (let m = 0; m < 16; m++) {
      const a = (m / 16) * Math.PI * 2;
      k.strut([Math.cos(a) * 4.65, y102, Math.sin(a) * 4.65], [Math.cos(a) * 4.45, y102 + 8.5, Math.sin(a) * 4.45], 0.16);
    }
    k.color(ALU_DK).cyl(0, y102 + 9.6, 0, 5.25, 5.25, 0.85, 16, { caps: false });
  }
  k.color(ALU).lathe(0, y102 + 8.5, 0, [[4.9, 0], [4.9, 1.0], [4.0, 3.5], [2.8, 6.5], [2.4, 381 - (y102 + 8.5)]], seg);
  // antenna 381 -> 443 m with broadcast dipole arrays
  k.color(ALU_DK).cyl(0, 381, 0, 2.2, 1.6, 14, hi ? 12 : 6);
  k.color(0xc9ced4).cyl(0, 395, 0, 1.2, 0.8, 22, hi ? 10 : 5);
  if (hi) {
    for (const y of [386, 392, 397, 404, 411, 418, 426]) {
      const r = y < 395 ? 2.4 : y < 417 ? 1.6 : 0.95;
      k.color(ALU_DK).cyl(0, y, 0, r, r, 0.9, 10);
    }
  }
  k.color(0xd6d9de).cyl(0, 417, 0, 0.5, 0.08, 26, hi ? 8 : 4);
  k.glow(true).color(0xff5a4a).sphere(0, 425, 0, 0.7, 6, 4).sphere(0, 442.8, 0, 0.55, 6, 4).glow(false);
}

/** Coloured floodlighting of the crown, only shown at night (see setup). */
function nightLights(k) {
  k.part("night");
  k.glow(true);
  const o = 0.35;
  k.color(0xfff0c8);
  k.extrude(notched(50 + o, 34 + o, 4), Y72 + 1, Y81 - Y72 - 1);
  k.color(0xffffff).box(0, Y81, 0, 40 + o, Y85 - Y81, 28 + o);
  k.color(0x7aa0ff).box(0, Y85, 0, 34 + o, Y86 - Y85 + 4.6, 24 + o);
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
