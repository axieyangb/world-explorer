// feature/famous-landmarks: El Castillo (Temple of Kukulcán), Chichén Itzá — 1:1 (30 m).
// Maya step pyramid: nine sloped terraces on a 55.3 m square base rising to the 24 m platform, a staircase of 91
// steps on each side (364 + the platform = 365), balustrades, the feathered-serpent heads at the foot of the
// north stair, and the temple on top (three-opening north entrance with serpent columns, single doors elsewhere).
// Floodlit at night (the evening light show). Local: -Z = north staircase (heading 23.5 from the OSM square).
const STONE = 0xc2b9a6, STONE_DK = 0xa59b86, STONE_SH = 0x8d846f, MOSS = 0x7f7a63, HOLE = 0x2c2924;
const B0 = 55.3, BT = 19.5, N = 9, TOP = 24, TH = 2.67;   // base, top platform, terraces, platform height
const SW = 8.8, BW = 1.3;                                // stair width, balustrade width

export const lodDist = 1200;
export const glowStrength = 1.0;
export const colliders = [
  { x: 0, z: 0, hw: 27.6, hd: 27.6, h: 7 },
  { x: 0, z: 0, hw: 20, hd: 20, h: 16 },
  { x: 0, z: 0, hw: 11, hd: 11, h: TOP },
  { x: 0, z: 0, hw: 6.5, hd: 6.5, h: 30 },
];

const w = (i) => B0 - (i * (B0 - BT)) / N;

// staircase on the -Z face (rotated per side): stepped ramp from the ground to the platform, with balustrades
function stair(k, north) {
  const hi = k.hi, z0 = -B0 / 2 - 0.6, z1 = -BT / 2, n = hi ? 46 : 6;
  k.glow(true).color(STONE);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const za = z0 + (z1 - z0) * t0, y1 = TOP * t1;
    k.box(0, 0, (za + z1) / 2, SW, y1, z1 - za);        // each step's riser block back to the core
  }
  // balustrades (sloped), slightly darker
  k.color(STONE_DK);
  for (const sx of [-1, 1]) {
    const x = sx * (SW / 2 + BW / 2);
    k.quad2([x - BW / 2, 0, z0], [x + BW / 2, 0, z0], [x + BW / 2, TOP + 0.6, z1], [x - BW / 2, TOP + 0.6, z1]);
    k.push().translate(x, 0, 0);
    k.strut([0, 0.6, z0 + 0.4], [0, TOP + 0.6, z1], BW);
    k.pop();
  }
  if (north) {
    // feathered-serpent heads at the foot of the north balustrades
    k.color(STONE_SH);
    for (const sx of [-1, 1]) {
      const x = sx * (SW / 2 + BW / 2);
      k.box(x, 0, z0 - 1.4, 1.9, 1.7, 2.6);
      k.box(x, 0.2, z0 - 2.9, 1.5, 1.0, 1.0);             // open jaws
      if (hi) k.color(HOLE).box(x, 0.75, z0 - 2.75, 1.2, 0.35, 1.0).color(STONE_SH);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  // nine terraces: sloped talud, with recessed panels on the faces
  for (let i = 0; i < N; i++) {
    const a = w(i), b = a - 2.2, y = i * TH;
    k.glow(true).color(i % 2 ? STONE : STONE_DK).taper(0, y, 0, a, a, b, b, TH);
    if (hi) {
      k.color(STONE_SH);
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        k.push().rotateY(r);
        const zf = -(a + b) / 4 - 0.25, half = a / 2 - 2;
        for (let p = 0; p < 6; p++) {
          const px = -half + (p + 0.5) * ((2 * half) / 6);
          if (Math.abs(px) < SW / 2 + BW + 1) continue;     // no panels behind the staircase
          k.box(px, y + 0.7, zf, (2 * half) / 6 - 1.4, TH - 1.4, 0.4);
        }
        k.pop();
      }
    }
  }
  k.glow(true).color(STONE).box(0, TOP - 0.03, 0, BT, 0.4, BT);   // platform
  // four staircases, the north one with the serpent heads
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(r);
    stair(k, r === 0);
    k.pop();
  }
  // temple: walls, doors, frieze band, flat roof with small roof crest
  const T = TOP + 0.37, tw = 13.4, th = 6.0;
  k.glow(true).color(STONE).box(0, T, 0, tw, th - 1.6, tw);
  k.color(STONE_DK).box(0, T + th - 1.6, 0, tw + 0.5, 1.2, tw + 0.5);  // frieze
  k.color(STONE).box(0, T + th - 0.4, 0, tw, 0.4, tw);
  if (hi) {
    k.color(STONE_SH);
    for (let i = 0; i < 8; i++) for (const [x, z, sx, sz] of [[0, -tw / 2 - 0.3, 1, 0], [0, tw / 2 + 0.3, 1, 0], [-tw / 2 - 0.3, 0, 0, 1], [tw / 2 + 0.3, 0, 0, 1]])
      k.box(x + sx * (-tw / 2 + 0.8 + i * ((tw - 1.6) / 7)), T + th - 1.4, z + sz * (-tw / 2 + 0.8 + i * ((tw - 1.6) / 7)), sx ? 0.7 : 0.25, 0.7, sz ? 0.7 : 0.25);
  }
  k.glow(false).color(HOLE);
  // north: three openings divided by two serpent columns
  for (const x of [-3.2, 0, 3.2]) k.quad([x + 1.0, T, -tw / 2 - 0.05], [x - 1.0, T, -tw / 2 - 0.05], [x - 1.0, T + 3.0, -tw / 2 - 0.05], [x + 1.0, T + 3.0, -tw / 2 - 0.05]);
  for (const r of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(r).quad([1.1, T, -tw / 2 - 0.05], [-1.1, T, -tw / 2 - 0.05], [-1.1, T + 3.0, -tw / 2 - 0.05], [1.1, T + 3.0, -tw / 2 - 0.05]).pop();
  }
  k.glow(true).color(STONE_SH);
  for (const x of [-1.6, 1.6]) { k.cyl(x, T, -tw / 2 + 0.2, 0.45, 0.45, 3.0, 8); k.box(x, T, -tw / 2 - 0.35, 0.9, 0.8, 1.2); }
  // weathering streaks (hi)
  if (hi) {
    k.glow(false).color(MOSS);
    for (let i = 0; i < 4; i++) {
      k.push().rotateY((i * Math.PI) / 2);
      const x = 15 + (i % 2) * 3;
      k.quad([x + 1.2, 0.2, -B0 / 2 - 0.02], [x - 1.2, 0.2, -B0 / 2 - 0.02], [x - 0.8, 2.4, -B0 / 2 + 1.2], [x + 0.8, 2.4, -B0 / 2 + 1.2]);
      k.pop();
    }
  }
  k.glow(false);
}
