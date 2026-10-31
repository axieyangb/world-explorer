// feature/famous-landmarks: The White House, Washington DC — 1:1 (1600 Pennsylvania Ave NW, 38.8977, -77.0365).
// James Hoban Neoclassical Aquia Creek white sandstone Executive Residence (51.2 m x 26.0 m, H = 21.3 m)
// with the rectangular Ionic North Portico & carriage porch facing Pennsylvania Ave (-Z), the semicircular
// Ionic South Portico with curved double grand staircase facing the South Lawn (+Z), alternating triangular
// and segmental window pediments, rooftop balustrade & US flag, East & West Palladian colonnades,
// West Wing (with the curved Oval Office bay window) & East Wing, and North/South Lawn fountains.

const WHITE = 0xf6f4ee, WHITE_SH = 0xdedad0, WHITE_DK = 0xc7c2b6;
const WIN = 0x2c3945, ROOF = 0x565f68, LAWN = 0x4d8a44, PAVE = 0xdad5c9;
const WATER = 0x2d7ba1, TREE_A = 0x387033, TREE_B = 0x528b42, LIT = 0xfff1cf;

export const lodDist = 2200;
export const fineDist = 550;
export const glowStrength = 1.9;

const W = 51.2, D = 26.0, H = 18.2;

export const colliders = [
  { x: 0, z: 0, hw: W * 0.5 + 1, hd: D * 0.5 + 1, h: H + 3 },
  { x: 0, z: -D * 0.5 - 4.5, hw: 9.5, hd: 5.0, h: H },
  { x: 0, z: D * 0.5 + 4.0, r: 8.5, h: H },
  { x: -52, z: 4, hw: 24, hd: 16, h: 9.5 }, // West Wing & Oval Office
  { x: 52, z: 4, hw: 22, hd: 15, h: 9.5 },  // East Wing
];

function executiveResidence(k) {
  const hi = k.hi;

  // 1. Stone basement plinth & main 3-story sandstone Executive Residence block
  k.glow(true).color(WHITE_SH).box(0, -3.0, 0, W + 1.6, 3.6, D + 1.6);
  k.color(WHITE).box(0, 0.6, 0, W, H - 0.6, D);

  // Entablature, dentil cornice, rooftop balustrade & low hipped slate roof with chimneys
  k.color(WHITE_SH).box(0, H - 1.4, 0, W + 1.4, 1.4, D + 1.4);
  k.color(WHITE).box(0, H, 0, W + 0.6, 1.35, D + 0.6);
  k.glow(false).color(ROOF).taper(0, H + 1.35, 0, W - 3, D - 3, W - 16, D - 12, 2.8);
  k.glow(true).color(WHITE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(sx * 16, H + 1.35, sz * 7.5, 2.2, 3.4, 2.2);
  }

  // Rooftop flagpole & American flag above the center roof
  k.glow(false).color(0xd8dde4).cyl(0, H + 4.0, 0, 0.14, 0.08, 9.5, 6);
  k.glow(true).color(0xb22234).box(1.6, H + 11.4, 0, 3.0, 1.8, 0.12);
  k.color(0x3c3b6e).box(0.7, H + 12.1, 0, 1.2, 1.0, 0.15);

  // 2. Two main tiers of 11 Palladian sash windows on North (-Z) and South (+Z) facades
  for (const sz of [-1, 1]) {
    const zWin = sz * (D * 0.5 + 0.08);
    for (let i = -5; i <= 5; i++) {
      // Skip middle 3 bays where North/South porticos project, or keep glowing windows behind columns
      const wx = i * 4.2;
      for (const [wy, wh, hasPed] of [[2.2, 5.2, true], [9.2, 4.4, false], [14.6, 2.0, false]]) {
        k.glow(true).color(LIT).box(wx, wy, zWin, 1.85, wh, 0.22);
        k.glow(false).color(WIN).box(wx, wy + 0.15, zWin + sz * 0.05, 1.55, wh - 0.3, 0.18);
        if (hi && hasPed) {
          k.glow(true).color(WHITE_SH).box(wx, wy + wh + 0.15, zWin + sz * 0.12, 2.2, 0.45, 0.35);
        }
      }
    }
    // Corner quoins & pilasters
    if (hi) {
      k.glow(true).color(WHITE_SH);
      for (const sx of [-1, 1]) k.box(sx * (W * 0.5 - 0.6), 0.6, sz * (D * 0.5), 1.4, H - 2.0, 0.5);
    }
  }

  // 3. NORTH PORTICO (-Z, facing Pennsylvania Ave): rectangular Ionic temple portico + carriage porch
  const zNP = -D * 0.5;
  k.glow(true).color(WHITE_SH).box(0, -2.0, zNP - 4.2, 18.4, 2.8, 8.4);
  k.color(WHITE);
  // 4 front Ionic columns + 2 side return columns (14.5m tall)
  for (const cx of [-7.5, -2.5, 2.5, 7.5]) {
    k.cyl(cx, 0.8, zNP - 7.6, 0.68, 0.58, H - 3.2, hi ? 12 : 6);
  }
  for (const cx of [-7.5, 7.5]) {
    k.cyl(cx, 0.8, zNP - 3.8, 0.68, 0.58, H - 3.2, hi ? 12 : 6);
  }
  // North Portico entablature & triangular pediment
  k.color(WHITE).box(0, H - 2.4, zNP - 4.2, 18.2, 2.0, 8.6);
  k.color(WHITE_SH);
  k.quadN([9.1, H - 0.4, zNP - 8.3], [-9.1, H - 0.4, zNP - 8.3], [0, H + 3.1, zNP - 8.3], [0, H + 3.1, zNP - 8.3], [0, 0, -1]);
  k.strut([-9.4, H - 0.5, zNP - 8.4], [0, H + 3.3, zNP - 8.4], 0.65);
  k.strut([9.4, H - 0.5, zNP - 8.4], [0, H + 3.3, zNP - 8.4], 0.65);
  k.glow(false).color(ROOF).taper(0, H - 0.4, zNP - 4.2, 18.0, 8.4, 0.6, 8.4, 3.5);

  // 4. SOUTH PORTICO (+Z, facing South Lawn): iconic semicircular Truman Balcony & Ionic colonnade
  const zSP = D * 0.5, rSP = 7.8, segSP = hi ? 18 : 10;
  k.glow(true).color(WHITE_SH).cyl(0, -2.0, zSP + 0.5, rSP + 0.8, rSP + 0.8, 4.8, segSP);
  // Curved double staircase sweeping down to the South Lawn
  for (const sx of [-1, 1]) {
    k.color(WHITE_SH).strut([sx * (rSP + 0.5), 2.8, zSP + 2.0], [sx * 4.2, 0.2, zSP + rSP + 2.8], 2.2);
  }
  // 6 tall Ionic columns around the semicircular curve + Truman Balcony slab at 2nd floor
  k.color(WHITE);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.42 + (i / 5) * (Math.PI * 0.84);
    const cx = Math.sin(a) * rSP, cz = zSP + Math.cos(a) * rSP;
    k.cyl(cx, 2.8, cz, 0.64, 0.55, H - 5.2, hi ? 12 : 6);
  }
  // Truman Balcony deck at y = 9.0m
  k.color(WHITE_SH).cyl(0, 8.8, zSP, rSP + 0.2, rSP + 0.2, 0.75, segSP);
  // Semicircular entablature & conical roof cap
  k.color(WHITE).cyl(0, H - 2.4, zSP, rSP + 0.5, rSP + 0.5, 2.4, segSP);
  k.glow(false).color(ROOF).cyl(0, H, zSP, rSP + 0.3, 0.8, 2.4, segSP);
}

function wingsAndGrounds(k) {
  const hi = k.hi;

  // 1. Landscaped North & South Lawns + curved driveway + fountains
  k.glow(false).color(LAWN).box(0, -2.4, 0, 168, 2.6, 118);
  k.color(PAVE).cyl(0, 0.2, -30, 18, 18, 0.18, hi ? 24 : 12);
  // North Lawn circular fountain
  k.color(WHITE).cyl(0, 0.25, -30, 5.8, 6.2, 0.65, hi ? 20 : 10);
  k.color(WATER).cyl(0, 0.65, -30, 5.2, 5.2, 0.3, hi ? 20 : 10);
  // South Lawn circular fountain
  k.color(WHITE).cyl(0, 0.25, 36, 7.2, 7.6, 0.65, hi ? 20 : 10);
  k.color(WATER).cyl(0, 0.65, 36, 6.6, 6.6, 0.3, hi ? 20 : 10);
  if (hi) {
    // Central stone pedestals & glowing water plume jets in both fountains
    for (const fz of [-30, 36]) {
      k.color(WHITE_SH).cyl(0, 0.65, fz, 1.2, 0.85, 1.1, 12);
      k.glow(true).color(0xd8f2ff).cone(0, 1.6, fz, 0.95, 2.8, 12);
      k.glow(false);
    }
  }

  // 2. East & West Terraced Colonnade Walkways (connecting Residence to East & West Wings)
  for (const sx of [-1, 1]) {
    k.glow(true).color(WHITE).box(sx * 36.5, 0.2, 1.5, 22, 5.6, 7.5);
    k.color(WHITE_SH).box(sx * 36.5, 5.8, 1.5, 23, 0.65, 8.4);
    if (hi) {
      for (let c = -3; c <= 3; c++) {
        k.color(WHITE).cyl(sx * 36.5 + c * 2.8, 0.3, 5.4, 0.32, 0.28, 5.3, 6);
      }
    }
  }

  // 3. WEST WING (-X) + Iconic curved OVAL OFFICE bay facing the Rose Garden & South Lawn
  k.glow(true).color(WHITE).box(-54, 0.2, 4, 28, 7.8, 24);
  k.color(WHITE_SH).box(-54, 8.0, 4, 29, 0.8, 25);
  k.glow(false).color(ROOF).box(-54, 8.8, 4, 26, 0.4, 22);
  // Oval Office at the southeast corner of the West Wing (-42, +15) with 3 tall curved south windows
  k.glow(true).color(WHITE).cyl(-42, 0.2, 15.5, 6.4, 6.4, 8.0, hi ? 20 : 10);
  k.color(WHITE_SH).cyl(-42, 8.2, 15.5, 6.8, 6.8, 0.7, hi ? 20 : 10);
  k.color(LIT).cyl(-42, 1.4, 16.0, 6.1, 6.1, 5.2, hi ? 16 : 8);

  // 4. EAST WING (+X) + Visitors Entrance colonnade
  k.glow(true).color(WHITE).box(54, 0.2, 4, 26, 7.8, 22);
  k.color(WHITE_SH).box(54, 8.0, 4, 27, 0.8, 23);
  k.glow(false).color(ROOF).box(54, 8.8, 4, 24, 0.4, 20);

  // 5. Historic Magnolia & Oak Trees framing the East/West Lawns
  const trees = [
    [-26, -24], [26, -24], [-34, -14], [34, -14],
    [-24, 24], [24, 24], [-36, 28], [36, 28],
  ];
  for (let i = 0; i < trees.length; i++) {
    const [tx, tz] = trees[i];
    k.color(0x553d26).cyl(tx, 0.2, tz, 0.45, 0.3, 3.2, 5);
    k.color(i % 2 === 0 ? TREE_A : TREE_B).sphere(tx, 5.2, tz, 4.2, hi ? 8 : 5, 5, 0.85);
  }
}

export function build(k) {
  wingsAndGrounds(k);
  executiveResidence(k);
  k.glow(false);
}
