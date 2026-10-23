// feature/famous-landmarks: Tokyo Tower — 1:1 (333 m). Eiffel-like four-legged lattice painted in
// international orange / white bands, ~80 m square base with arched openings, FootTown building
// between the legs, two-storey Main Deck at 145-155 m, Top Deck at ~250 m, banded antenna mast.
// At night the whole lattice glows warm orange ("Landmark Light").
const ORANGE = 0xe8541c, WHITE = 0xf2f0ea, DECK = 0xe9e6de, GLASS = 0x56626c, LIT = 0xffe2b0, FOOT = 0xd8d4cc;

export const lodDist = 1500;
export const glowStrength = 1.7;

export const colliders = [
  { x: 33, z: 33, hw: 9, hd: 9, h: 45 },
  { x: -33, z: 33, hw: 9, hd: 9, h: 45 },
  { x: 33, z: -33, hw: 9, hd: 9, h: 45 },
  { x: -33, z: -33, hw: 9, hd: 9, h: 45 },
  { x: 0, z: 0, hw: 28, hd: 28, h: 20 },
  { x: 0, z: 0, hw: 19, hd: 19, h: 100 },
  { x: 0, z: 0, hw: 17, hd: 17, h: 157 },
  { x: 0, z: 0, hw: 8, hd: 8, h: 253 },
  { x: 0, z: 0, r: 1.5, h: 333 },
];

// outer half-width of the tower at height y
const HW = [[0, 41], [15, 35.5], [30, 30.5], [50, 25.3], [75, 20.5], [100, 16.8], [125, 13.9], [145, 11.9], [175, 9.4], [210, 6.9], [250, 4.4], [258, 3.3], [300, 1.6]];
function hw(y) {
  for (let i = 0; i < HW.length - 1; i++) {
    const [y0, a] = HW[i], [y1, b] = HW[i + 1];
    if (y <= y1) return a + (b - a) * (y - y0) / (y1 - y0);
  }
  return HW[HW.length - 1][1];
}
// paint bands (white bands; everything else orange)
const WB = [[93, 112], [168, 186], [204, 222], [236, 248], [262, 272], [282, 291], [300, 308], [316, 322]];
const band = (y) => (WB.some(([a, b]) => y >= a && y < b) ? WHITE : ORANGE);

function legs(k, y0, y1, levels, chord, diag) {
  // each leg: 4 chords; outer corner at (hw,hw), leg width lw(y)
  const lw = (y) => 13 - (y / 60) * 4;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ring = (y) => { const o = hw(y), i = o - lw(y); return [[sx * o, y, sz * o], [sx * i, y, sz * o], [sx * i, y, sz * i], [sx * o, y, sz * i]]; };
    let prev = ring(y0);
    for (let l = 1; l <= levels; l++) {
      const y = y0 + ((y1 - y0) * l) / levels;
      const cur = ring(y);
      k.color(band(y));
      for (let c = 0; c < 4; c++) {
        const n = (c + 1) % 4;
        k.strut(prev[c], cur[c], chord);
        if (k.hi) { k.strut(prev[c], cur[n], diag); k.strut(prev[n], cur[c], diag); k.strut(cur[c], cur[n], diag * 0.8); }
      }
      prev = cur;
    }
  }
}

function shaft(k, y0, y1, levels, chord, diag) {
  const ring = (y) => { const o = hw(y); return [[o, y, o], [-o, y, o], [-o, y, -o], [o, y, -o]]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let prev = ring(y0);
  for (let l = 1; l <= levels; l++) {
    const y = y0 + ((y1 - y0) * l) / levels;
    const cur = ring(y);
    k.color(band((y + y0 + ((y1 - y0) * (l - 1)) / levels) / 2));
    for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      k.strut(prev[c], cur[c], chord);
      if (k.hi) {
        const panels = Math.max(1, Math.round((hw(y) * 2) / 9));
        for (let p = 0; p < panels; p++) {
          const a0 = lerp(prev[c], prev[n], p / panels), a1 = lerp(prev[c], prev[n], (p + 1) / panels);
          const b0 = lerp(cur[c], cur[n], p / panels), b1 = lerp(cur[c], cur[n], (p + 1) / panels);
          k.strut(a0, b1, diag); k.strut(a1, b0, diag);
        }
        k.strut(cur[c], cur[n], diag * 0.9);
      }
    }
    prev = cur;
  }
}

export function build(k) {
  const hi = k.hi;
  k.glow(true);
  if (hi) {
    legs(k, 0, 45, 6, 1.9, 0.7);
    shaft(k, 45, 145, 14, 1.6, 0.55);
    shaft(k, 157, 248, 14, 1.1, 0.45);
    shaft(k, 253, 300, 9, 0.7, 0.3);
    // base arches on each face
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, x = -26 + 52 * t;
        const y = 40 - 26 * Math.pow(Math.abs(2 * t - 1), 2.4);
        pts.push([x, y, -hw(y) + 0.8]);
      }
      k.color(ORANGE).tube(pts, 0.8, 5);
      for (let i = 1; i < 14; i += 2) k.strut(pts[i], [pts[i][0], 45, -hw(45) + 0.8], 0.35);
      k.pop();
    }
  } else {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const o0 = hw(0), o1 = hw(45);
      k.color(ORANGE).taper(sx * (o0 - 6), 0, sz * (o0 - 6), 12, 12, 9, 9, 45, sx * ((o1 - 4.5) - (o0 - 6)), sz * ((o1 - 4.5) - (o0 - 6)));
    }
    const seg = [[45, 93], [93, 112], [112, 145], [157, 168], [168, 186], [186, 204], [204, 222], [222, 236], [236, 248], [253, 262], [262, 272], [272, 300]];
    for (const [a, b] of seg) k.color(band((a + b) / 2)).taper(0, a, 0, hw(a) * 1.7, hw(a) * 1.7, hw(b) * 1.7, hw(b) * 1.7, b - a);
  }
  // antenna mast with bands
  for (let y = 300, i = 0; y < 333; i++) {
    const h = Math.min(8, 333 - y);
    k.color(i % 2 ? WHITE : ORANGE).cyl(0, y, 0, 1.3 - (y - 300) * 0.03, 1.3 - (y + h - 300) * 0.03, h, hi ? 8 : 4);
    y += h;
  }
  k.glow(false);

  // FootTown (between the legs)
  k.color(FOOT).box(0, 0, 0, 52, 18, 52);
  if (hi) {
    k.glow(true).color(LIT);
    for (let f = 0; f < 4; f++) { k.push().rotateY((f * Math.PI) / 2); for (let s = 0; s < 4; s++) k.box(0, 2.5 + s * 4, -26.05, 48, 1.6, 0.2); k.pop(); }
    k.glow(false);
  }
  // Main Deck: two-storey octagon 145-157 m
  const oct = (r) => { const p = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
  k.color(DECK).extrude(oct(18), 143, 2);
  k.glow(true).color(LIT).extrude(oct(17.6), 145, 4.2, false);
  k.glow(false).color(DECK).extrude(oct(18), 149.2, 1);
  k.glow(true).color(LIT).extrude(oct(17.4), 150.2, 4.2, false);
  k.glow(false).color(DECK).extrude(oct(17.8), 154.4, 2.6);
  if (hi) k.color(ORANGE).extrude(oct(16), 157, 1.2);
  // Top Deck ~250 m
  k.color(DECK).extrude(oct(6.6), 247.5, 1);
  k.glow(true).color(LIT).extrude(oct(6.4), 248.5, 3, false);
  k.glow(false).color(DECK).extrude(oct(6.6), 251.5, 1.5);
  if (hi) {
    // aviation lights
    k.glow(true).color(0xff3020);
    for (const y of [160, 253, 300, 332]) k.sphere(0, y, -hw(y) - 0.4, 0.7, 6, 3);
    k.glow(false);
  }
}

/** Warm orange floodlight tint for the glowing lattice. */
export function setup({ mats }) {
  if (mats && mats.glow) mats.glow.emissive.setHex(0xffb070);
  return null;
}
