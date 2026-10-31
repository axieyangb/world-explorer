// feature/famous-landmarks: Tokyo Tower — 1:1 (333 m). Eiffel-like four-legged lattice painted in
// international orange / white bands, ~80 m square base with arched openings, FootTown building
// between the legs with entrance canopy & rooftop pergola, central high-speed elevator shaft +
// 600-step open-air red staircase, two-storey Main Deck at 145-155 m with Sky Walk lookdown glass
// floors & microwave dishes, Top Deck at ~250 m, and banded antenna mast.
// At night the whole lattice glows warm orange ("Landmark Light").
const ORANGE = 0xe8541c, WHITE = 0xf2f0ea, DECK = 0xe9e6de, GLASS = 0x56626c, LIT = 0xffe2b0, FOOT = 0xd8d4cc;
const CORE = 0x424a52, STAIR_RED = 0xd4381c;

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
    if (y <= y1) return a + ((b - a) * (y - y0)) / (y1 - y0);
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
    // Concrete diagonal leg foundation shoes at ground level
    k.glow(false).color(FOOT);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      k.taper(sx * 36.5, 0, sz * 36.5, 13.5, 13.5, 11.5, 11.5, 3.8);
    }
    // Central high-speed elevator lattice shaft (y = 18 .. 248 m) + glowing glass elevator cabs
    k.color(CORE);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      k.strut([sx * 2.8, 18, sz * 2.8], [sx * 2.8, 143, sz * 2.8], 0.35);
      k.strut([sx * 1.8, 157, sz * 1.8], [sx * 1.8, 248, sz * 1.8], 0.25);
    }
    for (let y = 24; y < 142; y += 9) {
      k.color(CORE).box(0, y, 0, 5.8, 0.3, 5.8);
    }
    // 600-step Red Open-Air External Staircase zig-zagging up the central shaft from FootTown (18 m) to Main Deck (143 m)
    for (let y = 18, step = 0; y < 140; y += 6, step++) {
      const side = step % 2 ? 1 : -1;
      k.color(STAIR_RED).strut([side * -2.6, y, 3.1], [side * 2.6, y + 6, 3.1], 0.42);
      k.color(WHITE).strut([side * -2.6, y + 0.9, 3.3], [side * 2.6, y + 6.9, 3.3], 0.12);
    }
    // Three glowing glass elevator cars at different heights
    k.glow(true).color(LIT);
    k.box(0, 62, -2.9, 2.2, 3.8, 1.4);
    k.box(2.9, 108, 0, 1.4, 3.8, 2.2);
    k.box(0, 198, -1.9, 1.6, 3.4, 1.2);
  } else {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const o0 = hw(0), o1 = hw(45);
      k.color(ORANGE).taper(sx * (o0 - 6), 0, sz * (o0 - 6), 12, 12, 9, 9, 45, sx * (o1 - 4.5 - (o0 - 6)), sz * (o1 - 4.5 - (o0 - 6)));
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
    // FootTown rooftop mechanical penthouse & amusement deck pergolas
    k.color(DECK).box(0, 18, 0, 48, 0.8, 48);
    k.color(ORANGE).box(-14, 18.8, -14, 12, 3.2, 12).box(14, 18.8, -14, 12, 3.2, 12);
    // Front entrance canopy (-Z) & glowing TOKYO TOWER sign
    k.color(ORANGE).box(0, 5.2, -29.0, 18, 0.6, 6.2);
    for (const x of [-7.5, -2.5, 2.5, 7.5]) k.color(WHITE).cyl(x, 0, -31.5, 0.25, 0.25, 5.2, 6);
    k.glow(true).color(LIT);
    k.box(0, 15.2, -26.2, 22, 1.8, 0.3); // TOKYO TOWER illuminated sign band
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (let s = 0; s < 3; s++) k.box(0, 2.5 + s * 4, -26.05, 48, 1.6, 0.2);
      k.pop();
    }
    k.glow(false);
  }
  // Main Deck: two-storey octagon 145-157 m
  const oct = (r) => { const p = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
  k.color(DECK).extrude(oct(18), 143, 2);
  k.glow(true).color(LIT).extrude(oct(17.6), 145, 4.2, false);
  k.glow(false).color(DECK).extrude(oct(18), 149.2, 1);
  k.glow(true).color(LIT).extrude(oct(17.4), 150.2, 4.2, false);
  k.glow(false).color(DECK).extrude(oct(17.8), 154.4, 2.6);
  if (hi) {
    k.color(ORANGE).extrude(oct(16), 157, 1.2);
    // Vertical window mullions & Sky Walk Lookdown Glass Floor bays on Main Deck
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.color(DECK).strut([Math.cos(a) * 17.7, 145, Math.sin(a) * 17.7], [Math.cos(a) * 17.5, 154.4, Math.sin(a) * 17.5], 0.25);
    }
    // 4 Sky Walk lookdown glass floor boxes protruding from the Main Deck soffit (y = 142.2)
    k.glow(true).color(0x9be4ff);
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      k.box(Math.cos(a) * 15.2, 142.3, Math.sin(a) * 15.2, 3.2, 0.7, 3.2);
    }
    k.glow(false);
    // Microwave relay parabolic dishes on the Main Deck roof ring (y = 158.5)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.push().translate(Math.cos(a) * 14.5, 159.2, Math.sin(a) * 14.5).rotateY(-a + Math.PI / 2).rotateX(Math.PI / 2);
      k.color(WHITE).cyl(0, 0, 0, 1.35, 0.8, 0.55, 10);
      k.pop();
    }
  }
  // Top Deck ~250 m
  k.color(DECK).extrude(oct(6.6), 247.5, 1);
  k.glow(true).color(LIT).extrude(oct(6.4), 248.5, 3, false);
  k.glow(false).color(DECK).extrude(oct(6.6), 251.5, 1.5);
  if (hi) {
    // Top Deck angled steel ribs & upper broadcast dishes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.color(DECK).strut([Math.cos(a) * 6.5, 248.5, Math.sin(a) * 6.5], [Math.cos(a) * 6.5, 251.5, Math.sin(a) * 6.5], 0.18);
      if (i % 2 === 0) {
        k.push().translate(Math.cos(a) * 5.6, 253.8, Math.sin(a) * 5.6).rotateY(-a + Math.PI / 2).rotateX(Math.PI / 2);
        k.color(WHITE).cyl(0, 0, 0, 0.9, 0.5, 0.4, 8);
        k.pop();
      }
    }
    // VHF/UHF dipole rings on the upper antenna mast (y = 306 .. 328 m)
    k.color(WHITE);
    for (const y of [306, 314, 322, 328]) {
      k.cyl(0, y, 0, 1.8, 1.8, 0.25, 8);
    }
    // aviation lights
    k.glow(true).color(0xff3020);
    for (const y of [160, 253, 300, 333.2]) k.sphere(0, y, y > 330 ? 0 : -hw(y) - 0.4, 0.7, 6, 3);
    k.glow(false);
  }
}

/** Warm orange floodlight tint for the glowing lattice. */
export function setup({ mats }) {
  if (mats && mats.glow) mats.glow.emissive.setHex(0xffb070);
  return null;
}
