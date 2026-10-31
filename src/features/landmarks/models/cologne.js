// feature/famous-landmarks: Cologne Cathedral (Kölner Dom) — 1:1 (157.4 m).
// High Gothic masterpiece, 144.5 m long, 86.5 m across the transept. The 61.5 m west front with its two
// twin 157.4 m openwork spires, deeply splayed Gothic portals with archivolts & tympanum sculptures,
// geometric tracery mullions in the Great West Window, five-aisled nave and transept under steep slate roofs
// with gilded ridge cresting, a forest of pinnacles and double-tiered flying buttresses, the choir and chevet
// of 7 radiating chapels, and the slender crossing flèche turret with its gilded star.
const STONE = 0x6b655c, STONE_LT = 0x857e72, STONE_DK = 0x544f48, ROOF = 0x3e464c, HOLE = 0x1f1d1b, GOLD = 0xc9a24a;
const STAINED = 0x2c3b4d;
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

/** Deeply splayed Gothic portal with stepped archivolts, trumeau pillar, tympanum relief & crocketed Wimperg gable. */
function gothicPortal(k, x, y0, z, w, h, hi) {
  k.glow(false).color(HOLE);
  lancet(k, x, y0, z, w, h);
  if (!hi) return;
  // Stepped splayed jambs & pointed archivolts
  for (let s = 0; s < 3; s++) {
    const sw = w + 1.4 - s * 0.55, sh = h + 1.2 - s * 0.45, sz = z - 0.9 + s * 0.28;
    k.glow(true).color(s % 2 ? STONE_LT : STONE_DK);
    k.box(x - sw * 0.5, y0, sz, 0.38, sh * 0.62, 0.45);
    k.box(x + sw * 0.5, y0, sz, 0.38, sh * 0.62, 0.45);
    k.strut([x - sw * 0.5, y0 + sh * 0.62, sz], [x, y0 + sh, sz], 0.36);
    k.strut([x + sw * 0.5, y0 + sh * 0.62, sz], [x, y0 + sh, sz], 0.36);
  }
  // Trumeau central pillar & saint statue + carved tympanum lintel
  k.color(STONE_LT).box(x, y0, z - 0.25, 0.45, h * 0.55, 0.45);
  k.box(x, y0 + h * 0.55, z - 0.22, w * 0.88, 0.55, 0.35);
  k.cyl(x, y0 + 1.8, z - 0.52, 0.26, 0.22, 2.2, 6);
  // Pointed Wimperg (gablet) crowning the portal with finial
  k.color(STONE_DK);
  k.strut([x - w * 0.62, y0 + h * 0.62, z - 1.0], [x, y0 + h + 4.8, z - 1.0], 0.42);
  k.strut([x + w * 0.62, y0 + h * 0.62, z - 1.0], [x, y0 + h + 4.8, z - 1.0], 0.42);
  pinnacle(k, x, y0 + h + 4.6, z - 1.0, 0.42, 3.2, 5);
}

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
    if (hi) {
      // Intermediate setback pinnacle spirelets on the massive tower buttresses at y=32m and y=60m
      pinnacle(k, x + sx * (TW / 2 + 0.6), 31, z + sz * 12.2, 0.65, 6.5, 5);
      pinnacle(k, x + sx * (TW / 2 + 0.4), 59, z + sz * 12.0, 0.60, 6.0, 5);
    }
  }
  // tall windows + gablets on all four faces of both storeys
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const half = a === 0 || a === Math.PI ? 12 : TW / 2;
    k.push().translate(x, 0, z).rotateY(a);
    k.glow(false).color(HOLE);
    for (const lx of [-4.2, 4.2]) {
      lancet(k, lx, 63, -half + 1.2, 3.4, 28);
      if (hi) {
        lancet(k, lx, 34, -half - 0.05, 2.6, 18);
        lancet(k, lx, 12, -half - 0.05, 2.4, 16);
        // Stone tracery mullions & rose oculi inside the tower lancets
        k.glow(true).color(STONE_LT);
        k.box(lx, 63, -half + 1.15, 0.25, 24, 0.25);
        k.cyl(lx, 85, -half + 1.15, 1.1, 1.1, 0.25, 8);
        k.box(lx, 34, -half - 0.1, 0.22, 15, 0.22);
        k.glow(false).color(HOLE);
      }
    }
    k.glow(true).color(STONE_DK);
    k.taper(0, 91, -half + 1.0, TW - 4, 1.4, 0.6, 1.4, 9);                 // gablet over the belfry storey
    if (hi) {
      k.box(0, 60, -half + 0.2, TW - 2, 1.2, 1.2);
      k.box(0, 31, -half + 0.2, TW, 1.0, 1.0);
      pinnacle(k, 0, 99.5, -half + 1.0, 0.55, 4.5, 5);
    }
    k.pop();
  }
  // octagonal openwork lantern with its ring of pinnacles
  const seg = 8, ph = { smooth: false, phase: Math.PI / 8 };
  k.glow(true).color(STONE_LT).lathe(x, 95, z, [[8.4, 0], [8.4, 17]], seg, { ...ph, caps: false });
  k.glow(false).color(HOLE);
  for (let i = 0; i < 8; i++) {
    k.push().translate(x, 0, z).rotateY((i / 8) * TAU);
    lancet(k, 0, 97.5, -7.8, 2.6, 12.5);
    if (hi) {
      k.glow(true).color(STONE_LT).box(0, 97.5, -7.85, 0.22, 10.5, 0.22);
      k.taper(0, 110, -8.2, 3.2, 0.5, 0.2, 0.5, 4.2);
      k.glow(false).color(HOLE);
    }
    k.pop();
  }
  k.glow(true).color(STONE_DK);
  if (hi) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pinnacle(k, x + Math.cos(a) * 9.4, 100, z + Math.sin(a) * 9.4, 0.7, 17, 5); }
  // openwork spire: dark octagonal pyramid, crocket ribs, horizontal tracery bands
  k.color(STONE).lathe(x, 112, z, [[8.0, 0], [1.2, 40]], seg, ph);
  if (hi) {
    k.color(STONE_LT);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
      k.strut([x + c * 8.4, 112, z + s * 8.4], [x + c * 1.4, 152, z + s * 1.4], 0.55);
      for (let j = 1; j < 12; j++) {
        const t = j / 12, r = 8.4 + (1.4 - 8.4) * t;
        k.box(x + c * (r + 0.4), 112 + 40 * t, z + s * (r + 0.4), 0.7, 0.85, 0.7);
      }
    }
    // Horizontal pierced stone tracery rings binding the 8 spire ribs
    for (const t of [0.18, 0.36, 0.54, 0.72]) {
      const r = 8.2 + (1.3 - 8.2) * t, y = 112 + 40 * t;
      k.color(STONE_LT).cyl(x, y, z, r, r, 0.55, 8);
    }
    k.glow(false).color(HOLE);
    for (const t of [0.18, 0.42, 0.66]) {
      const r = 8.0 + (1.2 - 8.0) * t + 0.05, y = 112 + 40 * t;
      for (let i = 0; i < 8; i++) { k.push().translate(x, 0, z).rotateY((i / 8) * TAU); k.quad([r * 0.3, y, -r * 0.92], [-r * 0.3, y, -r * 0.92], [-r * 0.22, y + 3, -r * 0.92 + 0.3], [r * 0.22, y + 3, -r * 0.92 + 0.3]); k.pop(); }
    }
    k.glow(true);
  }
  // cross-flower finial (Kreuzblume, 157.4m apex)
  k.color(STONE_LT).cyl(x, 152, z, 1.0, 0.8, 2.4, 6);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.box(x + dx * 1.3, 154.2, z + dz * 1.3, dx ? 2.4 : 0.9, 0.9, dz ? 2.4 : 0.9);
  k.cyl(x, 154.6, z, 0.7, 0.1, 2.8, 6);
}

// flying-buttress pier with pinnacle at (px, pz), double flyer toward the clerestory point (wx, wz)
function flyer(k, px, pz, wx, wz, hi) {
  k.glow(true).color(STONE_DK).box(px, 0, pz, 2.2, 34, 2.6);
  pinnacle(k, px, 34, pz, 1.0, 9, hi ? 6 : 4);
  if (!hi) return;
  // Intermediate aisle buttress pier & pinnacle + double-tier flying buttress arches with tracery spandrels
  const mx = (px + wx) * 0.5, mz = (pz + wz) * 0.5;
  k.color(STONE_DK).box(mx, AISLE, mz, 1.5, 11, 1.8);
  pinnacle(k, mx, 31, mz, 0.65, 6.5, 5);
  k.color(STONE);
  for (const [y0, y1] of [[24, 33], [31, 41]]) {
    k.strut([px, y0, pz], [wx, y1, wz], 0.8);
    k.color(STONE_LT).strut([px, y0 + 1.2, pz], [wx, y1 + 1.2, wz], 0.32).color(STONE);
  }
}

export function build(k) {
  const hi = k.hi, zm = (ZW + ZTW) / 2;
  // Domplatte stone podium steps around the West Front
  if (hi) {
    k.glow(false).color(STONE_DK).box(0, -1.8, -6, 98, 1.8, 156);
  }
  // west front: towers + the central bay with the main portal, great window and gable
  tower(k, -TX, zm);
  tower(k, TX, zm);
  k.glow(true).color(STONE).box(0, 0, zm, 2 * TX - TW + 0.2, 52, 24);
  k.color(STONE_DK).taper(0, 52, ZW + 1.5, 17.5, 3, 0.8, 3, 14);
  if (hi) pinnacle(k, 0, 65.5, ZW + 1.5, 0.7, 5.5, 6);

  // Three West Portals (Central Portal, Petersportal, Dreikönigsportal)
  gothicPortal(k, 0, 0, ZW - 0.05, 9, 20, hi);
  for (const sx of [-1, 1]) gothicPortal(k, sx * TX, 0, ZW - 0.05, 6, 15, hi);

  // Great West Window with Gothic geometric tracery & rose window wheel
  k.glow(false).color(HOLE);
  lancet(k, 0, 25, ZW - 0.05, 9.5, 24);
  if (hi) {
    k.glow(true).color(STONE_LT);
    for (const mx of [-2.4, 0, 2.4]) k.box(mx, 25, ZW - 0.12, 0.28, 18.5, 0.28);
    k.roseWindow(0, 42.5, ZW - 0.15, 3.6, 0.32, 12, STAINED);
    // Crockett gablet over Great West Window
    k.strut([-5.2, 41, ZW - 0.3], [0, 53, ZW - 0.3], 0.42);
    k.strut([5.2, 41, ZW - 0.3], [0, 53, ZW - 0.3], 0.42);
  }
  k.glow(true).color(STONE_DK);
  if (hi) for (const px of [-TX - 9.6, -TX + 9.6, TX - 9.6, TX + 9.6]) k.taper(px, 0, ZW - 0.6, 2.6, 1.6, 1.4, 1.2, 50); // facade buttresses

  // nave + choir: five aisles (low), clerestory, steep slate roofs
  const z0 = ZTW, z1 = ZC;
  k.glow(true).color(STONE).box(0, 0, (z0 + z1) / 2, HW * 2, AISLE, z1 - z0);
  k.color(STONE_LT).box(0, AISLE, (z0 + z1) / 2, NW * 2 + 1, CLER - AISLE, z1 - z0);
  k.glow(false).color(ROOF).taper(0, AISLE, (z0 + z1) / 2, HW * 2 + 0.6, z1 - z0, NW * 2 + 2, z1 - z0, 6);
  k.color(ROOF).taper(0, CLER, (z0 + z1) / 2, NW * 2 + 2.4, z1 - z0, 0.4, z1 - z0, RIDGE - CLER);
  if (hi) {
    // Gilded copper roof ridge cresting along the nave, choir & transept ridges
    k.color(GOLD).box(0, RIDGE, (z0 + z1) / 2, 0.35, 0.85, z1 - z0);
    k.box(0, RIDGE, (ZT0 + ZT1) / 2, 86, 0.85, 0.35);
  }
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
    gothicPortal(k, zc, 0, -43.1, 7, 14, hi);
    if (hi) {
      // Richter stained-glass window mullions & rose oculus in South/North transept facades
      k.glow(true).color(STONE_LT);
      for (const mx of [-2.2, 0, 2.2]) k.box(zc + mx, 21, -43.18, 0.25, 16, 0.25);
      k.roseWindow(zc, 36.5, -43.2, 3.2, 0.28, 10, STAINED);
      pinnacle(k, zc, RIDGE, -43.2, 0.65, 5.0, 5);
    }
    k.glow(true).color(STONE_DK);
    for (const bx of [-NW - 3, NW + 3]) { k.box(zc + bx, 0, -43.8, 2.4, 52, 1.6); pinnacle(k, zc + bx, 52, -43.8, 1.0, 10, hi ? 6 : 4); }
    k.pop();
  }
  // chevet: ring of 7 polygonal radiating chapels + clerestory apse with a conical roof
  k.glow(true).color(STONE).lathe(0, 0, ZC, [[HW, 0], [HW, AISLE]], hi ? 24 : 12, { caps: false });
  k.color(STONE_LT).lathe(0, AISLE, ZC, [[NW + 0.5, 0], [NW + 0.5, CLER - AISLE]], hi ? 14 : 7, { caps: false });
  k.glow(false).color(ROOF).lathe(0, AISLE, ZC, [[HW + 0.3, 0], [NW + 1, 6]], hi ? 24 : 12, { caps: false });
  k.lathe(0, CLER, ZC, [[NW + 1.2, 0], [0.2, RIDGE - CLER]], hi ? 14 : 7, { caps: false });
  if (hi) {
    // 7 polygonal radiating chapels (Chorkapellen) around the East chevet apse
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI, cx = Math.cos(a) * (HW - 0.5), cz = ZC + Math.sin(a) * (HW - 0.5);
      k.glow(true).color(STONE).cyl(cx, 0, cz, 4.8, 4.8, AISLE - 1.5, 6);
      k.glow(false).color(ROOF).cone(cx, AISLE - 1.5, cz, 5.1, 4.5, 6);
    }
  }
  // windows along the clerestory and aisles
  if (hi) {
    for (let z = z0 + 4; z < z1; z += 7.5) {
      if (z > ZT0 - 2 && z < ZT1 + 2) continue;
      for (const sx of [-1, 1]) {
        k.push().translate(0, 0, z).rotateY(-sx * Math.PI / 2);
        k.glow(false).color(HOLE);
        lancet(k, 0, 5, -HW - 0.05, 3, 12);
        lancet(k, 0, AISLE + 4, -NW - 0.55, 3.6, 18);
        // Tracery mullions & pointed gablets over the clerestory & aisle bays
        k.glow(true).color(STONE_LT);
        k.box(0, 5, -HW - 0.1, 0.2, 10, 0.2);
        k.box(0, AISLE + 4, -NW - 0.6, 0.22, 15, 0.22);
        k.taper(0, CLER - 1, -NW - 0.6, 4.2, 0.5, 0.3, 0.5, 4.5);
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
  // slender crossing turret (Dachreiter, 109m with gilded star of Bethlehem on top)
  const zc = (ZT0 + ZT1) / 2;
  k.glow(true).color(STONE_LT).lathe(0, RIDGE - 6, zc, [[3.4, 0], [3.4, 14]], 8, { smooth: false, phase: Math.PI / 8 });
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      pinnacle(k, Math.cos(a) * 3.8, RIDGE + 6, zc + Math.sin(a) * 3.8, 0.35, 6.5, 5);
    }
  }
  k.glow(false).color(ROOF).lathe(0, RIDGE + 8, zc, [[3.6, 0], [0.15, 38]], 8, { smooth: false, phase: Math.PI / 8 });
  k.glow(true).color(GOLD).sphere(0, 108.4, zc, 0.85, 8, 5);
  if (hi) {
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI;
      k.strut([Math.cos(a) * 1.8, 108.4, zc + Math.sin(a) * 1.8], [-Math.cos(a) * 1.8, 108.4, zc - Math.sin(a) * 1.8], 0.14);
    }
  }
  k.glow(false);
}
