// feature/famous-landmarks: Basílica de la Sagrada Família, Barcelona — 1:1 (172.5 m, Tower of Jesus Christ).
// Latin-cross plan (~108 x 84 m incl. porches) on the Eixample grid. Crossing: Tower of Jesus Christ with its
// four-armed enameled glass cross, the four Evangelists' towers (135 m) crowned with winged Tetramorph sculptures,
// the Virgin Mary tower (138 m) over the apse with its 12-point glass star & mosaic lilies. Eight apostle towers
// (98-112 m) with bridges: the weathered Nativity facade (NE, with sea-turtle column bases, stained-glass rose &
// green cypress Tree of Life) and the angular Passion facade (SW, inclined bone-like columns, Subirachs sculptures
// & golden Ascending Christ). Glory facade (SE) with bronze Lord's Prayer doors & 7 Virtues porch columns.
// Local: nave axis = Z, front -Z = Glory facade (heading 135), -X = Nativity (NE), +X = Passion (SW), +Z = apse.
const STONE = 0xd8c6a2, STONE_DK = 0xbca57c, NATIV = 0xa88d68, NATIV_DK = 0x8a7152, NEW = 0xe2d9c6, NEW_DK = 0xcabfa8;
const HOLE = 0x3d3428, GREEN = 0x3f7a4a, RED = 0xc23b2e, GOLD = 0xe0b23c, WHITE = 0xf6f3ea, GLASS = 0xfafcff, BLUE_MOSAIC = 0x3a78b8;
const TAU = Math.PI * 2;
const CZ = 8;                 // crossing centre z

export const lodDist = 1800;
export const glowStrength = 0.6;
export const colliders = [
  { x: 0, z: -22, hw: 23, hd: 31, h: 60 },             // nave
  { x: 0, z: CZ, hw: 42, hd: 15, h: 60 },              // transept
  { x: 0, z: 34, r: 22, h: 50 },                       // apse
  { x: 0, z: CZ, r: 9, h: 165 },                       // Jesus Christ
  ...[[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, z]) => ({ x, z: CZ + z, r: 5, h: 130 })),
  { x: 0, z: 30, r: 6, h: 132 },
  ...[-44, 44].map((x) => ({ x, z: CZ, hw: 4, hd: 26, h: 95 })),
];

// Gaudí tower: parabolic spindle (lathe), vertical ribs, spiral louvres, optional mitre pinnacle
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
    for (const f of [0.18, 0.34, 0.52]) k.cyl(x, base + h * f, z, r0 * (f > 0.4 ? 0.94 : 1) + 0.25, r0 * (f > 0.4 ? 0.94 : 1) + 0.25, 0.8, seg); // banding
    // Vertical stone ribs along the parabolic tower profile
    if (r0 >= 4.0) {
      for (let m = 0; m < 8; m++) {
        const a = (m / 8) * TAU;
        k.strut([x + Math.cos(a) * (r0 + 0.12), base + h * 0.18, z + Math.sin(a) * (r0 + 0.12)],
                [x + Math.cos(a) * (r0 * 0.55), base + h * 0.78, z + Math.sin(a) * (r0 * 0.55)], 0.24);
      }
    }
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
  // pinnacles along the aisle parapets (Trencadís mosaic fruit baskets & wheat sheaves)
  k.glow(true).color(STONE_DK);
  for (let i = 0; i < n; i++) {
    const t = -0.5 + (i + 0.5) / n;
    for (const s of [-1, 1]) {
      const px = alongX ? cx + t * W : cx + s * (W / 2 - 1), pz = alongX ? cz + s * (D / 2 - 1) : cz + t * D;
      k.cyl(px, 30, pz, 1.1, 0, 7, 6);
      k.color(i % 2 ? GOLD : RED).sphere(px, 37.3, pz, 0.85, 6, 4).color(GREEN).sphere(px, 38.2, pz, 0.5, 5, 3).color(STONE_DK);
    }
  }
}

function nativityFacade(k, sx) {
  // NE transept facade (sx = -1): weathered, deeply sculpted, three portals, sea-turtle columns, cypress on top
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
    // Sculptural drips / grotto texture over the 3 portals (Faith, Hope, Charity)
    k.glow(true).color(NATIV_DK);
    for (let i = 0; i < 40; i++) {
      const hz = (Math.sin(i * 12.9898) * 43758.5453) % 1, hy = (Math.sin(i * 78.233) * 12345.678) % 1;
      k.sphere(x + sx * 4.2, 22 + Math.abs(hy) * 26, CZ + hz * 19, 1.0 + Math.abs(hz) * 0.9, 6, 3);
    }
    // Twin portico columns resting on carved stone Sea & Land Tortoises at the Portal of Charity
    for (const dz of [-4.6, 4.6]) {
      const cx = x + sx * 5.8, cz = CZ + dz;
      k.color(NATIV_DK).sphere(cx, 0.7, cz, 1.15, 8, 5, 0.55); // Tortoise shell base
      k.color(NATIV).cyl(cx, 1.2, cz, 0.65, 0.55, 16.5, 8);
      // Palm-frond capital supporting canopy
      k.color(NATIV_DK).cyl(cx, 17.7, cz, 0.55, 1.25, 1.4, 8);
    }
    // Stained-glass Rose Window in the central Nativity portal
    k.glow(true).color(BLUE_MOSAIC).cyl(x + sx * 4.1, 14.5, CZ, 2.8, 2.8, 0.35, 12);
    // High Skybridge connecting the two central Nativity Apostle Towers at y = 62 m
    k.color(NATIV).box(-44, 60, CZ, 5.2, 5.5, 14);
  }
  // Tree of Life: green cypress on the central portal with white doves & golden Tau cross
  k.glow(true).color(GREEN).lathe(x + sx * 3.5, 56, CZ, [[2.8, 0], [3.2, 4], [2.4, 10], [0.2, 15]], k.hi ? 10 : 5);
  if (hi) {
    k.color(WHITE);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      k.sphere(x + sx * 3.5 + Math.cos(a) * 2.6, 60 + (i % 3) * 3, CZ + Math.sin(a) * 2.6, 0.5, 5, 3);
    }
    k.color(RED).box(x + sx * 3.5, 71, CZ, 0.6, 2.6, 2.2); // Red & gold Tau cross above cypress
  }
}

function passionFacade(k, sx) {
  // SW transept facade (sx = +1): austere, angular, portico on six inclined bone columns + Subirachs sculptures
  const hi = k.hi, x = sx * 40;
  k.glow(true).color(NEW).box(x, 0, CZ, 8, 50, 40);
  k.color(NEW_DK).box(x + sx * 7, 22, CZ, 6, 4, 42);                        // portico roof (pediment of bones)
  if (hi) {
    for (let i = 0; i < 18; i++) k.color(NEW).cyl(x + sx * 9, 26, CZ - 20 + i * 2.35, 0.7, 0, 9 + (i % 4) * 2, 5);
    // High bridge between the central Passion towers (y = 58 m) + Golden Bronze Ascending Christ statue
    k.color(NEW).box(44, 58, CZ, 5.0, 5.2, 14);
    k.color(GOLD).cyl(46.5, 63.2, CZ, 0.55, 0.38, 3.8, 6).sphere(46.5, 67.4, CZ, 0.42, 6, 4);
    // Angular Subirachs Passion sculptures inside the porch (Flagellation column & Last Supper)
    for (const dz of [-8, -3, 3, 8]) {
      k.color(NEW).box(x + sx * 5.2, 0.5, CZ + dz, 1.2, 3.4, 1.2);
    }
  }
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
  // Glory facade (front, -Z): 7 inclined columns of the Virtues/Gifts + Subirachs Bronze Doors
  k.glow(true).color(NEW).box(0, 0, -53, 46, 46, 6);
  k.color(NEW_DK).taper(0, 46, -53, 46, 6, 14, 3, 12);
  k.glow(false).color(HOLE).quad([7, 0, -56.05], [-7, 0, -56.05], [-7, 22, -56.05], [7, 22, -56.05]);
  if (hi) {
    // Subirachs Bronze Doors (The Lord's Prayer) at the Glory portal + 8 inclined porch columns
    k.color(0x524634).box(0, 0, -56.1, 6.2, 8.5, 0.25);
    k.glow(true).color(NEW_DK);
    for (let i = -3; i <= 3; i++) {
      k.strut([i * 5.2, 0, -59.5], [i * 4.8, 22, -56.2], 1.25);
    }
  }
  k.glow(true);
  for (const sx of [-1, 1]) spindle(k, sx * 16, -53, 4.2, 44, NEW, NEW_DK, { mitre: false }); // Glory tower stumps
  // transept facades and their apostle towers
  nativityFacade(k, -1);
  passionFacade(k, 1);
  for (const [dz, i] of [[-21, 0], [-7, 1], [7, 1], [21, 0]]) {
    spindle(k, -44, CZ + dz, 4.6, i ? 107 : 98, NATIV, NATIV_DK);
    spindle(k, 44, CZ + dz, 4.6, i ? 112 : 107, NEW, NEW_DK);
  }
  // Four Evangelists' Towers (135 m) around the crossing with sculpted White Marble Tetramorph Wings & Golden Halos
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    spindle(k, dx, CZ + dz, 5.2, 130, WHITE, NEW_DK, { mitre: false });
    if (hi) {
      // Hexagonal golden mosaic icosahedron ring + sculpted white marble Tetramorph figure & spread wings
      k.glow(true).color(GOLD).cyl(dx, 122, CZ + dz, 2.2, 1.6, 5.5, 6);
      k.color(WHITE).sphere(dx, 130.5, CZ + dz, 2.1, 8, 6);
      // Outstretched marble wings of the Evangelist symbol (Eagle, Lion, Bull, Winged Man)
      k.strut([dx - 3.6, 134.8, CZ + dz], [dx, 130.0, CZ + dz], 0.85);
      k.strut([dx + 3.6, 134.8, CZ + dz], [dx, 130.0, CZ + dz], 0.85);
    } else {
      k.glow(true).color(GOLD).sphere(dx, 132.4, CZ + dz, 2.4, 5, 5);
    }
  }
  // Virgin Mary Tower (138 m) over the apse with blue-and-white mosaic lily crown & 12-pointed glass star
  spindle(k, 0, 30, 6.0, 132, WHITE, NEW_DK, { mitre: false });
  if (hi) {
    k.color(BLUE_MOSAIC).cyl(0, 124, 30, 2.4, 1.5, 8.5, 8);
    k.color(WHITE).cyl(0, 131.5, 30, 1.8, 1.8, 1.2, 8);
  }
  // Tower of Jesus Christ (172.5 m) at the crossing with octagonal bridge struts to Evangelist towers
  spindle(k, 0, CZ, 9.0, 155, WHITE, NEW_DK, { mitre: false });
  if (hi) {
    for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
      k.color(NEW).strut([dx * 0.55, 82, CZ + dz * 0.55], [dx * 0.85, 82, CZ + dz * 0.85], 2.2);
    }
  }
  // the Virgin's 12-pointed polyhedral glass star and Christ's 4-armed ceramic/glass cross (172.5 m)
  k.glow(true).color(GLASS);
  const star = (y) => {
    k.sphere(0, y, 30, 1.6, 8, 6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.strut([0, y, 30], [Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, 30], 0.55);
      k.strut([0, y, 30], [0, y + Math.sin(a) * 3.6, 30 + Math.cos(a) * 3.6], 0.55);
    }
  };
  star(135.5);
  // Jesus Christ Cross (155 .. 172.5 m): faceted white ceramic & gold glass arms with viewing windows
  k.color(WHITE).cyl(0, 154.5, CZ, 2.2, 1.8, 18.0, 8);
  k.box(0, 163.5, CZ, 13.5, 3.2, 3.2);
  k.box(0, 163.5, CZ, 3.2, 3.2, 13.5);
  if (hi) {
    k.color(GOLD);
    k.cyl(0, 154.5, CZ, 2.4, 2.4, 1.2, 8).cyl(0, 171.5, CZ, 1.9, 1.9, 1.0, 8);
    for (const s of [-6.5, 6.5]) {
      k.box(s, 163.5, CZ, 0.8, 3.5, 3.5).box(0, 163.5, CZ + s, 3.5, 3.5, 0.8);
    }
  }
  k.glow(false);
}
