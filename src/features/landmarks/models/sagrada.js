// feature/famous-landmarks: Basílica de la Sagrada Família, Barcelona — 1:1 (172.5 m, Tower of Jesus Christ).
// Latin-cross plan (~108 x 84 m incl. porches) on the Eixample grid. Crossing: Tower of Jesus Christ with its
// four-armed glass cross, the four Evangelists' towers (135 m) around it, the Virgin Mary tower (138 m) over the
// apse with its 12-point star. Eight apostle towers (98-112 m): the weathered Nativity facade (NE, with the green
// cypress of the Tree of Life) and the angular Passion facade (SW, inclined bone-like columns), each tower a
// parabolic spindle with spiral louvres and a Venetian-glass mitre pinnacle. Glory facade (SE) still unfinished.
// Floodlit at night; the Virgin's star and Christ's cross glow white.
// Local: nave axis = Z, front -Z = Glory facade (heading 135), -X = Nativity (NE), +X = Passion (SW), +Z = apse.
const STONE = 0xd8c6a2, STONE_DK = 0xbca57c, NATIV = 0xa88d68, NATIV_DK = 0x8a7152, NEW = 0xe2d9c6, NEW_DK = 0xcabfa8;
const HOLE = 0x3d3428, GREEN = 0x3f7a4a, RED = 0xc23b2e, GOLD = 0xe0b23c, WHITE = 0xf6f3ea, GLASS = 0xfafcff;
const TAU = Math.PI * 2;
const CZ = 8;                 // crossing centre z

export const lodDist = 1800;
export const glowStrength = 1.15;
export const colliders = [
  { x: 0, z: -22, hw: 23, hd: 31, h: 60 },             // nave
  { x: 0, z: CZ, hw: 42, hd: 15, h: 60 },              // transept
  { x: 0, z: 34, r: 22, h: 50 },                       // apse
  { x: 0, z: CZ, r: 9, h: 165 },                       // Jesus Christ
  ...[[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, z]) => ({ x, z: CZ + z, r: 5, h: 130 })),
  { x: 0, z: 30, r: 6, h: 132 },
  ...[-44, 44].map((x) => ({ x, z: CZ, hw: 4, hd: 26, h: 95 })),
];

// Gaudí tower: parabolic spindle (lathe), spiral louvres, optional mitre pinnacle
function spindle(k, x, z, r0, h, col, colDk, opts = {}) {
  const hi = k.hi, seg = hi ? 14 : 7, base = opts.base || 0;
  const p = [[r0, 0], [r0, h * 0.34], [r0 * 0.93, h * 0.52], [r0 * 0.78, h * 0.66], [r0 * 0.56, h * 0.78], [r0 * 0.32, h * 0.87], [r0 * 0.14, h * 0.93]];
  k.glow(true).color(col).lathe(x, base, z, p, seg);
  if (hi) {
    // spiral of dark louvre openings from 40 % to 85 % of the height
    k.glow(false).color(HOLE);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const t = i / n, y = base + h * (0.38 + 0.46 * t), a = t * TAU * 3.2 + x * 0.1;
      const r = r0 * (t < 0.3 ? 0.98 : 1.0 - (t - 0.2) * 0.6) + 0.06;
      k.push().translate(x, 0, z).rotateY(-a).quad([0.35, y, -r], [-0.35, y, -r], [-0.35, y + 1.6, -r], [0.35, y + 1.6, -r]).pop();
    }
    k.glow(true).color(colDk);
    for (const f of [0.18, 0.34]) k.cyl(x, base + h * f, z, r0 + 0.25, r0 + 0.25, 0.8, seg); // banding
  }
  if (opts.mitre !== false) mitre(k, x, base + h * 0.93, z, r0 * 0.24 + 0.6, h * 0.08);
}

// Venetian-glass mosaic pinnacle ("bishop's mitre") with a cross of white balls
function mitre(k, x, y, z, r, h) {
  const hi = k.hi;
  if (!hi) { k.glow(true).color(GOLD).cyl(x, y, z, r, 0.2, h, 5); return; }
  k.glow(true);
  const bands = [WHITE, RED, GOLD, RED, WHITE];
  for (let i = 0; i < bands.length; i++) k.color(bands[i]).cyl(x, y + i * h * 0.1, z, r * (1 - i * 0.05), r * (1 - (i + 1) * 0.05), h * 0.1, 8);
  k.color(GOLD).taper(x, y + h * 0.5, z, r * 1.6, r * 1.6, r * 0.6, r * 0.6, h * 0.3);
  k.color(RED).box(x, y + h * 0.8, z, r * 0.7, h * 0.12, r * 0.7);
  k.color(WHITE);
  const c = y + h * 0.98, s = r * 0.55;
  k.sphere(x, c + s, z, s * 0.6, 6, 4);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.sphere(x + dx * s, c, z + dz * s, s * 0.55, 6, 4);
  k.sphere(x, c, z, s * 0.6, 6, 4);
}

// nave / transept body with clerestory and a steep pinnacled roof, along Z (len) or X
function body(k, cx, cz, w, len, alongX) {
  const hi = k.hi;
  const W = alongX ? len : w, D = alongX ? w : len;
  k.glow(true).color(STONE).box(cx, 0, cz, W, 30, D);
  const iw = alongX ? W : w * 0.42, id = alongX ? D * 0.42 : D;
  k.color(NEW).box(cx, 30, cz, iw, 16, id);                                  // clerestory
  k.color(NEW_DK).taper(cx, 46, cz, iw, id, alongX ? W - 4 : 1.2, alongX ? 1.2 : D - 4, 18); // steep roof
  if (!hi) return;
  // windows: tall dark lancets on the aisles, round ones on the clerestory
  k.glow(false).color(HOLE);
  const n = Math.floor((alongX ? W : D) / 7.5);
  for (let i = 0; i < n; i++) {
    const t = -0.5 + (i + 0.5) / n;
    for (const s of [-1, 1]) {
      if (alongX) {
        const x = cx + t * W, z1 = cz + s * (D / 2 + 0.05), z2 = cz + s * (id / 2 + 0.05);
        k.quad2([x - 1.3, 8, z1], [x + 1.3, 8, z1], [x + 1.3, 24, z1], [x - 1.3, 24, z1]);
        k.quad2([x - 1.6, 34, z2], [x + 1.6, 34, z2], [x + 1.6, 42, z2], [x - 1.6, 42, z2]);
      } else {
        const z = cz + t * D, x1 = cx + s * (W / 2 + 0.05), x2 = cx + s * (iw / 2 + 0.05);
        k.quad2([x1, 8, z - 1.3], [x1, 8, z + 1.3], [x1, 24, z + 1.3], [x1, 24, z - 1.3]);
        k.quad2([x2, 34, z - 1.6], [x2, 34, z + 1.6], [x2, 42, z + 1.6], [x2, 42, z - 1.6]);
      }
    }
  }
  // pinnacles along the aisle parapets (fruit baskets / sheaves)
  k.glow(true).color(STONE_DK);
  for (let i = 0; i < n; i++) {
    const t = -0.5 + (i + 0.5) / n;
    for (const s of [-1, 1]) {
      const px = alongX ? cx + t * W : cx + s * (W / 2 - 1), pz = alongX ? cz + s * (D / 2 - 1) : cz + t * D;
      k.cyl(px, 30, pz, 1.1, 0, 7, 6);
      k.color(i % 2 ? GOLD : RED).sphere(px, 37.3, pz, 0.8, 6, 4).color(STONE_DK);
    }
  }
}

function nativityFacade(k, sx) {
  // NE transept facade (sx = -1): weathered, deeply sculpted, three portals, cypress on top
  const hi = k.hi, x = sx * 40;
  k.glow(true).color(NATIV).box(x, 0, CZ, 8, 52, 40);
  k.color(NATIV_DK).taper(x, 52, CZ, 8, 30, 4, 6, 12);
  k.glow(false).color(HOLE);
  for (const [dz, w, h] of [[-12, 6, 18], [0, 8, 24], [12, 6, 18]]) {
    const xf = x + sx * 4.05, z0 = CZ + dz - w / 2, z1 = CZ + dz + w / 2;
    k.quad2([xf, 0, z0], [xf, 0, z1], [xf, h, z1], [xf, h, z0]);
    k.quad2([xf, h, z0], [xf, h, z1], [xf, h + w * 0.8, CZ + dz], [xf, h + w * 0.8, CZ + dz]);
  }
  if (hi) {
    // sculptural drips / grotto texture: irregular lumps over the portals
    k.glow(true).color(NATIV_DK);
    for (let i = 0; i < 40; i++) {
      const hz = Math.sin(i * 12.9898) * 43758.5453 % 1, hy = Math.sin(i * 78.233) * 12345.678 % 1;
      k.sphere(x + sx * 4.2, 22 + Math.abs(hy) * 26, CZ + hz * 19, 1.0 + Math.abs(hz) * 0.9, 6, 3);
    }
  }
  // Tree of Life: green cypress on the central portal
  k.glow(true).color(GREEN).lathe(x + sx * 3.5, 56, CZ, [[2.8, 0], [3.2, 4], [2.4, 10], [0.2, 15]], k.hi ? 10 : 5);
  if (k.hi) { k.color(WHITE); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.sphere(x + sx * 3.5 + Math.cos(a) * 2.6, 60 + (i % 3) * 3, CZ + Math.sin(a) * 2.6, 0.5, 5, 3); } }
}

function passionFacade(k, sx) {
  // SW transept facade (sx = +1): austere, angular, portico on six inclined columns
  const hi = k.hi, x = sx * 40;
  k.glow(true).color(NEW).box(x, 0, CZ, 8, 50, 40);
  k.color(NEW_DK).box(x + sx * 7, 22, CZ, 6, 4, 42);                        // portico roof (pediment of bones)
  if (hi) for (let i = 0; i < 18; i++) k.color(NEW).cyl(x + sx * 9, 26, CZ - 20 + i * 2.35, 0.7, 0, 9 + (i % 4) * 2, 5);
  k.color(NEW_DK);
  for (let i = 0; i < 6; i++) {
    const z = CZ - 17 + i * 6.8, lean = (i - 2.5) * 0.6;
    k.strut([x + sx * 10, 0, z + lean * 3], [x + sx * 7.5, 22, z - lean], hi ? 1.6 : 2.0);
  }
  k.glow(false).color(HOLE);
  const xf = x + sx * 4.05;
  k.quad2([xf, 0, CZ - 14], [xf, 0, CZ + 14], [xf, 20, CZ + 14], [xf, 20, CZ - 14]);
  k.glow(true);
}

export function build(k) {
  const hi = k.hi;
  // nave (5 aisles, Glory facade at the front) and transept
  body(k, 0, -22, 46, 60, false);
  body(k, 0, CZ, 30, 76, true);
  // apse: semicircle of chapels with pinnacles
  k.glow(true).color(STONE).lathe(0, 0, 30, [[21, 0], [21, 28], [14, 28], [14, 44], [0.1, 44]], hi ? 20 : 10, { smooth: false });
  if (hi) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i / 6), px = Math.cos(a) * 21, pz = 30 + Math.sin(a) * 21;
      spindle(k, px, pz, 2.2, 24, STONE, STONE_DK, { base: 22, mitre: false });
      k.color(GOLD).sphere(px, 22 + 22.5, pz, 0.9, 6, 4);
    }
  }
  // Glory facade (front): unfinished wall with the big portal opening
  k.glow(true).color(NEW).box(0, 0, -53, 46, 46, 6);
  k.color(NEW_DK).taper(0, 46, -53, 46, 6, 14, 3, 12);
  k.glow(false).color(HOLE).quad([7, 0, -56.05], [-7, 0, -56.05], [-7, 22, -56.05], [7, 22, -56.05]);
  k.glow(true);
  for (const sx of [-1, 1]) spindle(k, sx * 16, -53, 4.2, 44, NEW, NEW_DK, { mitre: false }); // Glory tower stumps
  // transept facades and their apostle towers
  nativityFacade(k, -1);
  passionFacade(k, 1);
  for (const [dz, i] of [[-21, 0], [-7, 1], [7, 1], [21, 0]]) {
    spindle(k, -44, CZ + dz, 4.6, i ? 107 : 98, NATIV, NATIV_DK);
    spindle(k, 44, CZ + dz, 4.6, i ? 112 : 107, NEW, NEW_DK);
  }
  // Evangelists (135 m) around the crossing, Virgin Mary (138 m) over the apse, Jesus Christ (172.5 m)
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    spindle(k, dx, CZ + dz, 5.2, 140, WHITE, NEW_DK, { mitre: false });
    k.glow(true).color(GOLD).sphere(dx, 132.4, CZ + dz, 2.4, hi ? 10 : 5, 5); // Evangelist symbols
  }
  spindle(k, 0, 30, 6.0, 142, WHITE, NEW_DK, { mitre: false });
  spindle(k, 0, CZ, 9.0, 169, WHITE, NEW_DK, { mitre: false });
  // the Virgin's star and Christ's cross: white glass, glowing at night
  k.glow(true).color(GLASS);
  const star = (y) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.strut([0, y, 30], [Math.cos(a) * 3.0, y + Math.sin(a) * 3.0, 30], 0.6);
      k.strut([0, y, 30], [0, y + Math.sin(a) * 3.0, 30 + Math.cos(a) * 3.0], 0.6);
    }
  };
  star(135);
  k.box(0, 156.5, CZ, 3.2, 16, 3.2);                    // cross: shaft + four arms
  k.box(0, 164.5, CZ, 13.5, 3.2, 3.2);
  k.box(0, 164.5, CZ, 3.2, 3.2, 13.5);
  k.glow(false);
}
