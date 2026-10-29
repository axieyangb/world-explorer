// feature/famous-landmarks: Notre-Dame de Paris — 1:1 (towers 69 m, spire 96 m, as rebuilt and reopened 2024).
// 128 m long, 48 m across the transept. West front (41 m): three portals, the Gallery of Kings, the 9.6 m rose,
// the open Grand Gallery and the two square towers with their tall belfry louvres. Steep lead roofs over the nave
// (ridge ~43 m), double aisles with chapels, transept roses north and south, the choir and apse ringed by the
// famous long flying buttresses, the octagonal oak-and-lead spire at the crossing, the sacristy on the south side.
// Floodlit at night. Local: axis = Z, front -Z = west facade (heading 296.4), +X = north side, +Z = apse (east).
const STONE = 0xd9cfb6, STONE_DK = 0xc1b597, STONE_SH = 0xa99d80, LEAD = 0x5b6670, LEAD_DK = 0x48525b, HOLE = 0x2f2c29;
const ROSE = 0x3c4a6a, GOLD = 0xc9a24a, DOOR = 0x3b2a20, PATINA = 0x6aa996;
const TAU = Math.PI * 2;
const ZF = -64, ZT = 14, ZA = 44;      // west front, transept (crossing) centre, apse centre
const NW = 6.2, AW = 20;               // nave half-width (clerestory), aisle half-width
const CLER = 33, RIDGE = 43, AISLE = 20;

export const lodDist = 1500;
export const glowStrength = 0.6;
export const colliders = [
  { x: 0, z: -58, hw: 20.5, hd: 6, h: 43 },
  { x: -12.75, z: -58, hw: 7.8, hd: 6, h: 69 }, { x: 12.75, z: -58, hw: 7.8, hd: 6, h: 69 },
  { x: 0, z: -8, hw: AW, hd: 44, h: 30 },
  { x: 0, z: ZT, hw: 24, hd: 7, h: 40 },
  { x: 0, z: 32, hw: AW, hd: 12, h: 30 },
  { x: 0, z: ZA, r: 19, h: 28 },
  { x: 0, z: ZT, r: 4, h: 90 },
  { x: -30, z: 32, hw: 7, hd: 12, h: 15 },
];

// pointed (lancet) opening facing -Z at plane z (local frame), centred at x, from y0 with width w and height h
function lancet(k, x, y0, z, w, h) {
  const a = x - w / 2, b = x + w / 2, ys = y0 + h - w * 0.6;
  k.quad([b, y0, z], [a, y0, z], [a, ys, z], [b, ys, z]);
  k.tri([b, ys, z], [a, ys, z], [x, y0 + h, z]);
}

function westFront(k) {
  const hi = k.hi, z = ZF, zf = z - 0.05, D = 12, PD = 3.2, zp = z - PD;
  k.glow(true).color(STONE).box(0, 0, z + D / 2, 41, 43, D);
  for (const sx of [-1, 1]) {
    // towers: buttresses on the corners, two tall louvred lancets per face, flat top with a balustrade
    const tx = sx * 12.75;
    k.color(STONE).box(tx, 43, z + D / 2, 15.5, 26, D);
    k.color(STONE_DK).box(tx, 69, z + D / 2, 16.3, 0.9, D + 0.8);
    for (const bx of [-1, 1]) k.box(tx + bx * 7.2, 0, z - PD / 2 - 0.4, 2.2, 66, PD + 0.8);
    k.glow(false).color(HOLE);
    for (const lx of [-3.2, 3.2]) {
      lancet(k, tx + lx, 46, zf, 2.6, 18);
      lancet(k, tx + lx, 46, z + D + 0.05, 2.6, 18);
      k.push().translate(tx, 0, z + D / 2).rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      lancet(k, lx * 1.4, 46, -D / 2 - 0.05, 2.4, 18);
      k.pop();
      if (k.fine) {
        // belfry louvres: lead slats across the lancet
        k.color(LEAD_DK);
        for (let y = 47; y < 62; y += 0.9) k.box(tx + lx, y, zf - 0.1, 2.5, 0.12, 0.3);
        k.color(HOLE);
      }
    }
    if (hi) {
      lancet(k, tx, 26, zf, 3.0, 9);
      k.glow(true).color(STONE_DK);
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.pinnacle(tx + cx * 7.2, 69.9, z + D / 2 + cz * 5.4, 1.3, 4.5);
      // balustrade on the tower top
      if (k.fine) for (let q = -7; q <= 7; q += 0.7) k.box(tx + q, 69.9, z - 0.2, 0.18, 1.1, 0.18);
    }
    k.glow(true);
  }
  // porch: three deep portals (stepped pointed orders with column figures, door + tympanum relief) cut into a
  // 3.2 m deep porch mass under the Gallery of Kings
  k.glow(true).color(STONE);
  const portals = [[-12.75, 9.6, 15.5, [-20.5, -6.4]], [0, 11.2, 17.2, [-6.4, 6.4]], [12.75, 9.6, 15.5, [6.4, 20.5]]];
  for (const [px, W, H, [fl, fr]] of portals) {
    k.recessArch(px, 0, zp, W, H, PD - 0.2, hi ? 5 : 2, W * 0.42, {
      frame: [fl, fr, 18.6], back: "door", statues: true,
      col: { face: STONE, side: STONE_DK, back: DOOR, tymp: STONE_DK, fig: STONE_SH },
    });
  }
  k.color(STONE_DK).quadN([-20.5, 18.6, zp], [20.5, 18.6, zp], [20.5, 18.6, z], [-20.5, 18.6, z], [0, 1, 0]);
  for (const sx of [-1, 1]) k.quadN([sx * 20.5, 0, zp], [sx * 20.5, 18.6, zp], [sx * 20.5, 18.6, z], [sx * 20.5, 0, z], [sx, 0, 0]);
  // Gallery of Kings: band of 28 niches, each with a crowned king
  k.color(STONE_SH).box(0, 18.6, z - 0.6, 41, 0.9, 1.2);
  if (hi) {
    k.glow(false).color(HOLE);
    for (let i = 0; i < 28; i++) { const x = -19 + i * (38 / 27); lancet(k, x, 20.0, zf - 0.25, 1.15, 3.8); }
    k.glow(true).color(STONE_SH);
    if (k.fine) for (let i = 0; i < 28; i++) {
      const x = -19 + i * (38 / 27);
      k.cyl(x, 20.05, zf - 0.55, 0.32, 0.24, 2.35, 6).sphere(x, 22.65, zf - 0.55, 0.2, 6, 3).cyl(x, 22.8, zf - 0.55, 0.19, 0.22, 0.22, 6);
    }
    k.color(STONE_DK);
    for (let i = 0; i <= 28; i++) k.box(-19.7 + i * (38 / 27), 20.0, zf - 0.35, 0.22, 3.6, 0.3);
  }
  k.glow(true).color(STONE_DK).box(0, 24.2, z - 0.35, 41, 0.7, 0.9);
  // west rose in its square frame (projecting panel), Grand Gallery (open arcade) above
  k.roseWindow(0, 30.5, z - 1.25, 4.8, 1.0, 24, { frame: STONE_DK, glass: ROSE, tracery: STONE_DK, square: 5.9 });
  if (hi) for (const sx of [-1, 1]) lancet(k, sx * 12.75, 26.5, zf, 3.6, 8.5);
  k.color(STONE_SH).box(0, 36.3, z - 0.4, 41, 0.7, 0.8);
  k.glow(false).color(HOLE);
  for (let i = 0; i < 14; i++) lancet(k, -19.5 + 1.5 + i * (36 / 13), 37.2, zf - 0.15, 1.6, 5.2);
  if (hi) {
    k.glow(true).color(STONE_DK);
    for (let i = 0; i <= 14; i++) k.cyl(-19.5 + 0.7 + i * (36 / 13) - 0.04, 37.0, zf - 0.35, 0.16, 0.16, 5.4, 6);
  }
  k.glow(true).color(STONE_DK).box(0, 43, z - 0.3, 41.6, 0.8, 1.0);
}

// flying buttress: pier on the outside at (px, pz), arcing over the aisle roof to the clerestory at (wx, wz)
function flyer(k, px, pz, wx, wz) {
  const hi = k.hi;
  k.glow(true).color(STONE).box(px, 0, pz, 2.4, 22, 2.8);
  if (hi) {
    k.color(STONE_DK).pinnacle(px, 22, pz, 1.7, 8.5);
    k.color(STONE);
    // the flyer: a quarter arch under a straight sloping coping
    const n = 6, y0 = 15.5, y1 = 28.5;
    let prev = [px, y0, pz];
    for (let i = 1; i <= n; i++) {
      const t = i / n, a = (t * Math.PI) / 2;
      const f = 1 - Math.cos(a), g = Math.sin(a);
      const p = [px + (wx - px) * f, y0 + (y1 - y0) * g, pz + (wz - pz) * f];
      k.strut(prev, p, 0.9);
      prev = p;
    }
    k.strut([px, 21.5, pz], [wx, 30.2, wz], 0.75);
  } else {
    k.color(STONE);
    const mid = [(px + wx) / 2, 27.5, (pz + wz) / 2];
    k.strut([px, 19.5, pz], mid, 1.0);
    k.strut(mid, [wx, 28.5, wz], 1.0);
  }
}

export function build(k) {
  const hi = k.hi;
  westFront(k);
  // nave + choir clerestory and aisles (z from the facade to the apse centre)
  const z0 = ZF + 12, z1 = ZA;
  k.glow(true).color(STONE).box(0, 0, (z0 + z1) / 2, AW * 2, AISLE, z1 - z0);
  k.box(0, AISLE, (z0 + z1) / 2, NW * 2 + 2, CLER - AISLE, z1 - z0);
  k.glow(false).color(LEAD).taper(0, AISLE, (z0 + z1) / 2, AW * 2 + 0.6, z1 - z0, NW * 2 + 3, z1 - z0, 4.5); // aisle roofs
  k.color(LEAD).taper(0, CLER, (z0 + z1) / 2, NW * 2 + 3, z1 - z0, 0.4, z1 - z0, RIDGE - CLER);         // main roof
  // transept with gable ends and the north / south roses
  k.glow(true).color(STONE).box(0, 0, ZT, 48, CLER, 14);
  k.glow(false).color(LEAD).taper(0, CLER, ZT, 48, 14.6, 48, 0.4, RIDGE - CLER);
  for (const sx of [-1, 1]) {
    // rotated frame: -Z faces outward (north for sx = +1), frame x = model z
    const xc = sx * ZT, zg = -24.02;
    k.push().rotateY(-sx * Math.PI / 2);
    k.glow(true).color(STONE).tri([xc + 7, CLER, zg], [xc - 7, CLER, zg], [xc, RIDGE, zg]);
    k.roseWindow(xc, 22, zg - 1.1, 6.5, 1.0, 24, { frame: STONE_DK, glass: ROSE, tracery: STONE_DK, square: 7.4 });
    k.glow(false).color(HOLE);
    lancet(k, xc, 0, zg - 0.1, 5, 11);
    k.glow(true).color(STONE_DK);
    for (const bx of [-7.6, 7.6]) { k.box(xc + bx, 0, -24.6, 1.6, 40, 1.4); k.cyl(xc + bx, 40, -24.6, 0.8, 0.1, 6, 6); }
    k.pop();
  }
  // apse: half-round chevet (aisle ring + clerestory) with conical roofs
  k.glow(true).color(STONE).lathe(0, 0, ZA, [[AW, 0], [AW, AISLE]], hi ? 24 : 12, { caps: false });
  k.lathe(0, AISLE, ZA, [[NW + 1, 0], [NW + 1, CLER - AISLE]], hi ? 16 : 8, { caps: false });
  k.glow(false).color(LEAD).lathe(0, AISLE, ZA, [[AW + 0.3, 0], [NW + 1.5, 4.5]], hi ? 24 : 12, { caps: false });
  k.color(LEAD).lathe(0, CLER, ZA, [[NW + 1.5, 0], [0.2, RIDGE - CLER]], hi ? 16 : 8, { caps: false });
  // clerestory + aisle windows (stained glass, lit from inside at night)
  if (hi) {
    k.glow(false).color(ROSE);
    for (let z = z0 + 4; z < z1; z += 6.5) {
      if (Math.abs(z - ZT) < 9) continue;
      for (const sx of [-1, 1]) {
        k.push().translate(0, 0, z).rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        lancet(k, 0, 6, -AW - 0.05, 2.4, 9);
        lancet(k, 0, 22.5, -NW - 1.05, 2.6, 8.5);
        k.pop();
      }
    }
  }
  // flying buttresses along the nave / choir and radiating around the apse
  for (let z = z0 + 1; z < z1; z += 6.5) {
    if (Math.abs(z - ZT) < 9) continue;
    for (const sx of [-1, 1]) flyer(k, sx * (AW + 2.4), z, sx * (NW + 1.2), z);
  }
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    flyer(k, c * (AW + 3.5), ZA + s * (AW + 3.5), c * (NW + 1.6), ZA + s * (NW + 1.6));
  }
  // spire at the crossing (octagonal, lead over oak) with its gilded rooster
  const seg = hi ? 8 : 6, ph = { smooth: false, phase: Math.PI / 8 };
  k.glow(true).color(LEAD_DK).lathe(0, RIDGE - 4, ZT, [[4.2, 0], [4.2, 12], [3.6, 12], [3.6, 18]], seg, ph);
  k.glow(false).color(LEAD).lathe(0, RIDGE + 14, ZT, [[3.6, 0], [0.15, 37]], seg, ph);
  if (hi) {
    k.color(HOLE);
    for (let i = 0; i < 8; i++) { k.push().translate(0, 0, ZT).rotateY((i / 8) * TAU + Math.PI / 8); lancet(k, 0, RIDGE, -3.95, 1.2, 6); k.pop(); }
    k.glow(true).color(LEAD_DK);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.cyl(Math.cos(a) * 4.6, RIDGE - 4, ZT + Math.sin(a) * 4.6, 0.5, 0.1, 22, 4); }
  }
  if (k.fine) {
    // crockets up the eight arrises of the spire, and the twelve copper apostles round its foot
    k.glow(false).color(LEAD_DK);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      for (let t = 0.08; t < 0.92; t += 0.07) { const r = 3.6 * (1 - t) + 0.15 * t + 0.15; k.box(Math.cos(a) * r, RIDGE + 14 + 37 * t, ZT + Math.sin(a) * r, 0.35, 0.3, 0.35); }
    }
    k.glow(true).color(PATINA);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, r = 6.2 + (i % 3) * 1.6, y = RIDGE - 1.5 - (i % 3) * 1.8;
      k.cyl(Math.cos(a) * r, y, ZT + Math.sin(a) * r, 0.32, 0.22, 2.2, 6).sphere(Math.cos(a) * r, y + 2.4, ZT + Math.sin(a) * r, 0.2, 6, 3);
    }
  }
  k.glow(true).color(GOLD).box(0, 94, ZT, 0.3, 1.2, 0.3).box(0, 94.8, ZT, 1.0, 0.2, 0.2).sphere(0, 95.6, ZT, 0.35, 6, 4);
  // sacristy on the south side of the choir
  k.glow(true).color(STONE).box(-31, 0, 32, 14, 13, 24);
  k.glow(false).color(LEAD).taper(-31, 13, 32, 14.4, 24.4, 0.4, 20, 6);
  k.glow(false);
}
