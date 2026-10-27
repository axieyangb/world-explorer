// feature/famous-landmarks: Cologne Cathedral (Kölner Dom) — 1:1 (157.4 m).
// High Gothic, 144.5 m long, 86.5 m across the transept. The 61.5 m west front with its two towers: square
// storeys with tall tracery windows and gablets, the octagonal openwork lantern ringed by pinnacles, and the
// openwork spires with crockets and cross-flower finials. Five-aisled nave and transept under steep slate roofs
// (ridge ~61 m), a forest of pinnacles and flying buttresses, the choir and chevet of radiating chapels, the
// slender crossing turret. The weathered stone is famously dark. Floodlit at night.
// Local: axis = Z, front -Z = west front (heading 268.2), +X = north, +Z = choir (east).
const STONE = 0x6b655c, STONE_LT = 0x857e72, STONE_DK = 0x544f48, ROOF = 0x3e464c, HOLE = 0x1f1d1b, GOLD = 0xc9a24a;
const TAU = Math.PI * 2;
const ZW = -72, ZTW = -48, ZT0 = -8, ZT1 = 26, ZC = 50;   // west face, towers' back, transept, apse centre
const TX = 19.75, TW = 22;                                // tower centre x, tower width
const AISLE = 20, CLER = 45, RIDGE = 61, NW = 7.5, HW = 22.5;

export const lodDist = 1800;
export const glowStrength = 1.0;
export const colliders = [
  { x: -TX, z: (ZW + ZTW) / 2, hw: TW / 2, hd: 12, h: 95 }, { x: TX, z: (ZW + ZTW) / 2, hw: TW / 2, hd: 12, h: 95 },
  { x: -TX, z: (ZW + ZTW) / 2, r: 8, h: 150 }, { x: TX, z: (ZW + ZTW) / 2, r: 8, h: 150 },
  { x: 0, z: (ZW + ZTW) / 2, hw: 9, hd: 12, h: 58 },
  { x: 0, z: (ZTW + ZC) / 2, hw: HW, hd: (ZC - ZTW) / 2, h: 40 },
  { x: 0, z: (ZT0 + ZT1) / 2, hw: 43, hd: (ZT1 - ZT0) / 2, h: 40 },
  { x: 0, z: ZC, r: 22, h: 30 },
];

function lancet(k, x, y0, z, w, h) {
  const a = x - w / 2, b = x + w / 2, ys = y0 + h - w * 0.7;
  k.quad([b, y0, z], [a, y0, z], [a, ys, z], [b, ys, z]);
  k.tri([b, ys, z], [a, ys, z], [x, y0 + h, z]);
}
const pinnacle = (k, x, y, z, r, h, seg = 6) => { k.cyl(x, y, z, r, r, h * 0.4, seg); k.cyl(x, y + h * 0.4, z, r * 1.1, 0.05, h * 0.6, seg); };

// one west tower (centre x, z) — square storeys, lantern, openwork spire, finial
function tower(k, x, z) {
  const hi = k.hi;
  k.glow(true).color(STONE).box(x, 0, z, TW, 60, 24);
  k.color(STONE_LT).box(x, 60, z, TW - 2.5, 35, 21.5);
  // corner buttresses climbing to pinnacles
  k.color(STONE_DK);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.box(x + sx * (TW / 2 - 0.6), 0, z + sz * 11.4, 3.2, 92, 3.2);
    pinnacle(k, x + sx * (TW / 2 - 0.6), 92, z + sz * 11.4, 1.3, 12, hi ? 6 : 4);
  }
  // tall windows + gablets on all four faces of both storeys
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const half = a === 0 || a === Math.PI ? 12 : TW / 2;
    k.push().translate(x, 0, z).rotateY(a);
    k.glow(false).color(HOLE);
    for (const lx of [-4.2, 4.2]) lancet(k, lx, 63, -half + 1.2, 3.4, 28);
    if (hi) for (const lx of [-4.2, 4.2]) lancet(k, lx, 34, -half - 0.05, 2.6, 18);
    k.glow(true).color(STONE_DK);
    k.taper(0, 91, -half + 1.0, TW - 4, 1.4, 0.6, 1.4, 9);                 // gablet over the belfry storey
    if (hi) k.box(0, 60, -half + 0.2, TW - 2, 1.2, 1.2);
    k.pop();
  }
  // octagonal openwork lantern with its ring of pinnacles
  const seg = 8, ph = { smooth: false, phase: Math.PI / 8 };
  k.glow(true).color(STONE_LT).lathe(x, 95, z, [[8.4, 0], [8.4, 17]], seg, { ...ph, caps: false });
  k.glow(false).color(HOLE);
  for (let i = 0; i < 8; i++) { k.push().translate(x, 0, z).rotateY((i / 8) * TAU); lancet(k, 0, 97.5, -7.8, 2.6, 12.5); k.pop(); }
  k.glow(true).color(STONE_DK);
  if (hi) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pinnacle(k, x + Math.cos(a) * 9.4, 100, z + Math.sin(a) * 9.4, 0.7, 17, 5); }
  // openwork spire: dark octagonal pyramid, crocket ribs, horizontal tracery bands
  k.color(STONE).lathe(x, 112, z, [[8.0, 0], [1.2, 40]], seg, ph);
  if (hi) {
    k.color(STONE_LT);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
      k.strut([x + c * 8.4, 112, z + s * 8.4], [x + c * 1.4, 152, z + s * 1.4], 0.55);
      for (let j = 1; j < 9; j++) { const t = j / 9, r = 8.4 + (1.4 - 8.4) * t; k.box(x + c * (r + 0.4), 112 + 40 * t, z + s * (r + 0.4), 0.7, 0.9, 0.7); }
    }
    k.glow(false).color(HOLE);
    for (const t of [0.18, 0.42, 0.66]) {
      const r = 8.0 + (1.2 - 8.0) * t + 0.05, y = 112 + 40 * t;
      for (let i = 0; i < 8; i++) { k.push().translate(x, 0, z).rotateY((i / 8) * TAU); k.quad([r * 0.3, y, -r * 0.92], [-r * 0.3, y, -r * 0.92], [-r * 0.22, y + 3, -r * 0.92 + 0.3], [r * 0.22, y + 3, -r * 0.92 + 0.3]); k.pop(); }
    }
    k.glow(true);
  }
  // cross-flower finial (Kreuzblume)
  k.color(STONE_LT).cyl(x, 152, z, 1.0, 0.8, 2.4, 6);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.box(x + dx * 1.3, 154.2, z + dz * 1.3, dx ? 2.4 : 0.9, 0.9, dz ? 2.4 : 0.9);
  k.cyl(x, 154.6, z, 0.7, 0.1, 2.8, 6);
}

// flying-buttress pier with pinnacle at (px, pz), double flyer toward the clerestory point (wx, wz)
function flyer(k, px, pz, wx, wz, hi) {
  k.glow(true).color(STONE_DK).box(px, 0, pz, 2.2, 34, 2.6);
  pinnacle(k, px, 34, pz, 1.0, 9, hi ? 6 : 4);
  if (!hi) return;
  k.color(STONE);
  for (const [y0, y1] of [[24, 33], [31, 41]]) k.strut([px, y0, pz], [wx, y1, wz], 0.8);
}

export function build(k) {
  const hi = k.hi, zm = (ZW + ZTW) / 2;
  // west front: towers + the central bay with the main portal, great window and gable
  tower(k, -TX, zm);
  tower(k, TX, zm);
  k.glow(true).color(STONE).box(0, 0, zm, 2 * TX - TW + 0.2, 52, 24);
  k.color(STONE_DK).taper(0, 52, ZW + 1.5, 17.5, 3, 0.8, 3, 14);
  k.glow(false).color(HOLE);
  lancet(k, 0, 0, ZW - 0.05, 9, 20);                    // main portal
  lancet(k, 0, 25, ZW - 0.05, 9.5, 24);                 // great west window
  for (const sx of [-1, 1]) lancet(k, sx * TX, 0, ZW - 0.05, 6, 15); // side portals
  k.glow(true).color(STONE_DK);
  if (hi) for (const px of [-TX - 9.6, -TX + 9.6, TX - 9.6, TX + 9.6]) k.taper(px, 0, ZW - 0.6, 2.6, 1.6, 1.4, 1.2, 50); // facade buttresses
  // nave + choir: five aisles (low), clerestory, steep slate roofs
  const z0 = ZTW, z1 = ZC;
  k.glow(true).color(STONE).box(0, 0, (z0 + z1) / 2, HW * 2, AISLE, z1 - z0);
  k.color(STONE_LT).box(0, AISLE, (z0 + z1) / 2, NW * 2 + 1, CLER - AISLE, z1 - z0);
  k.glow(false).color(ROOF).taper(0, AISLE, (z0 + z1) / 2, HW * 2 + 0.6, z1 - z0, NW * 2 + 2, z1 - z0, 6);
  k.color(ROOF).taper(0, CLER, (z0 + z1) / 2, NW * 2 + 2.4, z1 - z0, 0.4, z1 - z0, RIDGE - CLER);
  // transept (five aisles too) with gabled facades north and south
  k.glow(true).color(STONE).box(0, 0, (ZT0 + ZT1) / 2, 86, AISLE, ZT1 - ZT0);
  k.color(STONE_LT).box(0, AISLE, (ZT0 + ZT1) / 2, 86, CLER - AISLE, NW * 2 + 1);
  k.glow(false).color(ROOF).taper(0, CLER, (ZT0 + ZT1) / 2, 86, NW * 2 + 2.4, 86, 0.4, RIDGE - CLER);
  for (const sx of [-1, 1]) {
    const zc = sx * (ZT0 + ZT1) / 2;
    k.push().rotateY(-sx * Math.PI / 2);            // frame: -Z faces outward (north for sx = +1), frame x = sx * model z
    k.glow(true).color(STONE_LT).tri([zc + NW + 1, CLER, -43.02], [zc - NW - 1, CLER, -43.02], [zc, RIDGE, -43.02]);
    k.glow(false).color(HOLE);
    lancet(k, zc, 21, -43.1, 9, 21);
    lancet(k, zc, 0, -43.1, 7, 14);
    k.glow(true).color(STONE_DK);
    for (const bx of [-NW - 3, NW + 3]) { k.box(zc + bx, 0, -43.8, 2.4, 52, 1.6); pinnacle(k, zc + bx, 52, -43.8, 1.0, 10, hi ? 6 : 4); }
    k.pop();
  }
  // chevet: ring of radiating chapels + clerestory apse with a conical roof
  k.glow(true).color(STONE).lathe(0, 0, ZC, [[HW, 0], [HW, AISLE]], hi ? 24 : 12, { caps: false });
  k.color(STONE_LT).lathe(0, AISLE, ZC, [[NW + 0.5, 0], [NW + 0.5, CLER - AISLE]], hi ? 14 : 7, { caps: false });
  k.glow(false).color(ROOF).lathe(0, AISLE, ZC, [[HW + 0.3, 0], [NW + 1, 6]], hi ? 24 : 12, { caps: false });
  k.lathe(0, CLER, ZC, [[NW + 1.2, 0], [0.2, RIDGE - CLER]], hi ? 14 : 7, { caps: false });
  // windows along the clerestory and aisles
  if (hi) {
    k.glow(false).color(HOLE);
    for (let z = z0 + 4; z < z1; z += 7.5) {
      if (z > ZT0 - 2 && z < ZT1 + 2) continue;
      for (const sx of [-1, 1]) {
        k.push().translate(0, 0, z).rotateY(-sx * Math.PI / 2);
        lancet(k, 0, 5, -HW - 0.05, 3, 12);
        lancet(k, 0, AISLE + 4, -NW - 0.55, 3.6, 18);
        k.pop();
      }
    }
  }
  // the forest of pinnacles and flying buttresses (nave, choir, radiating around the apse)
  for (let z = z0 + 1; z < z1; z += 7.5) {
    if (z > ZT0 - 2 && z < ZT1 + 2) continue;
    for (const sx of [-1, 1]) flyer(k, sx * (HW + 1.6), z, sx * (NW + 0.6), z, hi);
  }
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI, c = Math.cos(a), s = Math.sin(a);
    flyer(k, c * (HW + 2.5), ZC + s * (HW + 2.5), c * (NW + 1), ZC + s * (NW + 1), hi);
  }
  // slender crossing turret (gilded star on top)
  const zc = (ZT0 + ZT1) / 2;
  k.glow(true).color(STONE_LT).lathe(0, RIDGE - 6, zc, [[3.4, 0], [3.4, 14]], 8, { smooth: false, phase: Math.PI / 8 });
  k.glow(false).color(ROOF).lathe(0, RIDGE + 8, zc, [[3.6, 0], [0.15, 38]], 8, { smooth: false, phase: Math.PI / 8 });
  k.glow(true).color(GOLD).sphere(0, 108.4, zc, 0.8, 8, 5);
  k.glow(false);
}
