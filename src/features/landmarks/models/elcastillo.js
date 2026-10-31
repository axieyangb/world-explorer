// feature/famous-landmarks: El Castillo (Temple of Kukulcán), Chichén Itzá — 1:1 (30 m).
// Maya step pyramid: nine sloped terraces on a 55.3 m square base rising to the 24 m platform, a staircase of 91
// steps on each side (364 + the platform = 365), balustrades, the carved feathered-serpent heads (with open jaws,
// fangs, bifurcated tongues & plumed eye-rings) at the foot of the north stair, undulating equinox diamond-serpent
// body blocks along the north balustrade, Chak Mool & Red Jaguar Throne inside the upper sanctum, and Maya roof-comb
// almenas (stepped fret crenellations) crowning the temple roof.
const STONE = 0xc2b9a6, STONE_DK = 0xa59b86, STONE_SH = 0x8d846f, STONE_LT_C = 0xd4ccb8, MOSS = 0x7f7a63, HOLE = 0x2c2924;
const FANG = 0xe8e2d5, TONGUE = 0xa64b3b, JADE = 0x3b8a6b;
const B0 = 55.3, BT = 19.5, N = 9, TOP = 24, TH = 2.67;   // base, top platform, terraces, platform height
const SW = 8.8, BW = 1.3;                                // stair width, balustrade width

export const lodDist = 1200;
export const glowStrength = 0.7;
export const colliders = [
  { x: 0, z: 0, hw: 27.6, hd: 27.6, h: 7 },
  { x: 0, z: 0, hw: 20, hd: 20, h: 16 },
  { x: 0, z: 0, hw: 11, hd: 11, h: TOP },
  { x: 0, z: 0, hw: 6.5, hd: 6.5, h: 30 },
];

const w = (i) => B0 - (i * (B0 - BT)) / N;

// staircase on the -Z face (rotated per side): stepped ramp from the ground to the platform, with balustrades
function stair(k, north) {
  const hi = k.hi, z0 = -B0 / 2 - 0.6, z1 = -BT / 2, n = hi ? 91 : 8;
  k.glow(true).color(STONE);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const za = z0 + (z1 - z0) * t0, y1 = TOP * t1;
    k.box(0, 0, (za + z1) / 2, SW, y1, z1 - za);
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
    // Sculpted Kukulcán feathered-serpent heads at the foot of the north balustrades
    for (const sx of [-1, 1]) {
      const x = sx * (SW / 2 + BW / 2);
      k.color(STONE_SH);
      k.box(x, 0, z0 - 1.4, 2.05, 1.85, 2.7);
      // Upper snout & lower jaw
      k.color(STONE).box(x, 0.95, z0 - 2.95, 1.65, 0.72, 1.45);
      k.color(STONE_DK).box(x, 0.08, z0 - 2.95, 1.55, 0.42, 1.45);
      if (hi) {
        // Dark mouth cavity
        k.glow(false).color(HOLE).box(x, 0.48, z0 - 2.85, 1.32, 0.48, 1.25);
        // Carved white limestone curved fangs & molar teeth
        k.color(FANG);
        for (const fx of [-0.52, 0.52]) {
          k.cone(x + fx, 0.55, z0 - 3.45, 0.14, 0.42, 5);
          k.cone(x + fx, 0.48, z0 - 3.25, 0.11, 0.28, 5);
        }
        // Bifurcated stone serpent tongue extending onto the plaza pavement
        k.color(TONGUE);
        k.box(x, 0.04, z0 - 3.9, 0.65, 0.14, 0.95);
        k.strut([x - 0.18, 0.1, z0 - 4.3], [x - 0.42, 0.1, z0 - 4.85], 0.18);
        k.strut([x + 0.18, 0.1, z0 - 4.3], [x + 0.42, 0.1, z0 - 4.85], 0.18);
        // Sculpted plumed eye-rings, brow ridges & flared nostrils
        k.glow(true).color(STONE_LT_C);
        k.box(x, 1.68, z0 - 2.65, 1.2, 0.25, 0.65);
        for (const ex of [-1, 1]) {
          k.color(STONE).cyl(x + ex * 0.98, 1.15, z0 - 1.65, 0.42, 0.42, 0.25, 8);
          k.color(JADE).sphere(x + ex * 1.04, 1.25, z0 - 1.65, 0.22, 6, 4);
          for (let p = 0; p < 3; p++) {
            k.color(STONE_SH).box(x + ex * 1.06, 0.45 + p * 0.45, z0 - 0.55 + p * 0.25, 0.22, 0.35, 0.85);
          }
        }
        // Undulating 7 diamond-triangle serpent-body shadow blocks along the north balustrade
        for (let t = 0; t < 7; t++) {
          const u = (t + 0.6) / 7.8;
          const by = TOP * u + 0.65;
          const bz = z0 + (z1 - z0) * u;
          k.color(STONE).pyramid(x - sx * (BW * 0.52), by, bz, 0.45, 1.35, 0.85);
        }
      }
    }
  }
}

export function build(k) {
  const hi = k.hi;
  // nine terraces: sloped talud, with recessed panels & apron mouldings on the faces
  for (let i = 0; i < N; i++) {
    const a = w(i), b = a - 2.2, y = i * TH;
    k.glow(true).color(i % 2 ? STONE : STONE_DK).taper(0, y, 0, a, a, b, b, TH);
    if (hi) {
      k.color(STONE_LT_C).box(0, y + TH - 0.32, 0, b + 0.45, 0.28, b + 0.45);
      k.color(STONE_SH);
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        k.push().rotateY(r);
        const zf = -(a + b) / 4 - 0.25, half = a / 2 - 2;
        for (let p = 0; p < 6; p++) {
          const px = -half + (p + 0.5) * ((2 * half) / 6);
          if (Math.abs(px) < SW / 2 + BW + 1) continue;
          k.box(px, y + 0.55, zf, (2 * half) / 6 - 1.2, TH - 1.1, 0.42);
          k.color(HOLE).box(px, y + 0.78, zf - 0.08, (2 * half) / 6 - 1.8, TH - 1.55, 0.32).color(STONE_SH);
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
  // temple: walls, doors, frieze band, flat roof with Maya roof-comb almenas
  const T = TOP + 0.37, tw = 13.4, th = 6.0;
  k.glow(true).color(STONE).box(0, T, 0, tw, th - 1.6, tw);
  k.color(STONE_DK).box(0, T + th - 1.6, 0, tw + 0.5, 1.2, tw + 0.5);  // frieze
  k.color(STONE).box(0, T + th - 0.4, 0, tw + 0.3, 0.4, tw + 0.3);
  if (hi) {
    k.color(STONE_SH);
    for (let i = 0; i < 8; i++) {
      for (const [x, z, sx, sz] of [[0, -tw / 2 - 0.3, 1, 0], [0, tw / 2 + 0.3, 1, 0], [-tw / 2 - 0.3, 0, 0, 1], [tw / 2 + 0.3, 0, 0, 1]]) {
        const pos = -tw / 2 + 0.8 + i * ((tw - 1.6) / 7);
        k.box(x + sx * pos, T + th - 1.45, z + sz * pos, sx ? 0.75 : 0.28, 0.85, sz ? 0.75 : 0.28);
      }
    }
    // Iconic Maya Roof-Comb Almenas (stepped fret ornaments around all 4 roof edges)
    k.color(STONE_LT_C);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      k.push().rotateY(r);
      for (let a = -3; a <= 3; a++) {
        const ax = a * 1.85, az = -tw / 2 + 0.18;
        k.box(ax, T + th, az, 0.95, 0.42, 0.28);
        k.box(ax, T + th + 0.42, az, 0.65, 0.38, 0.26);
        k.box(ax, T + th + 0.80, az, 0.32, 0.32, 0.24);
      }
      k.pop();
    }
  }
  k.glow(false).color(HOLE);
  // north: three openings divided by two serpent columns
  for (const x of [-3.2, 0, 3.2]) k.quad([x + 1.0, T, -tw / 2 - 0.05], [x - 1.0, T, -tw / 2 - 0.05], [x - 1.0, T + 3.0, -tw / 2 - 0.05], [x + 1.0, T + 3.0, -tw / 2 - 0.05]);
  for (const r of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(r).quad([1.1, T, -tw / 2 - 0.05], [-1.1, T, -tw / 2 - 0.05], [-1.1, T + 3.0, -tw / 2 - 0.05], [1.1, T + 3.0, -tw / 2 - 0.05]).pop();
  }
  // Twin feathered-serpent portal columns in the North Temple entrance (heads at base, rattle tails up!)
  k.glow(true).color(STONE_SH);
  for (const x of [-1.6, 1.6]) {
    k.cyl(x, T, -tw / 2 + 0.2, 0.45, 0.45, 3.0, hi ? 10 : 8);
    k.box(x, T, -tw / 2 - 0.45, 0.95, 0.8, 1.35);
    if (hi) {
      k.color(STONE_LT_C).box(x, T + 2.45, -tw / 2 + 0.55, 0.72, 0.55, 0.95);
      k.cone(x, T + 2.75, -tw / 2 + 0.85, 0.28, 0.45, 6);
      k.color(STONE_SH);
    }
  }
  // Close-up: Chak Mool reclining statue & Red Jaguar Throne visible inside the North Temple vestibule
  if (hi) {
    k.color(STONE_LT_C).box(0, T + 0.02, -tw / 2 + 1.15, 1.45, 0.45, 0.75);
    k.box(-0.48, T + 0.45, -tw / 2 + 1.15, 0.42, 0.62, 0.55);
    k.sphere(-0.48, T + 1.22, -tw / 2 + 1.15, 0.24, 6, 5);
    k.box(0.38, T + 0.45, -tw / 2 + 1.15, 0.42, 0.45, 0.52);
    k.color(JADE).cyl(0, T + 0.47, -tw / 2 + 1.15, 0.22, 0.22, 0.12, 8);
    k.color(TONGUE).box(0, T + 0.02, -tw / 2 + 2.35, 0.65, 0.68, 1.25);
    k.sphere(0, T + 0.72, -tw / 2 + 1.72, 0.28, 6, 5);
  }
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
