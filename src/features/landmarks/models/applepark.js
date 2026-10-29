// feature/famous-landmarks: Apple Park ("The Spaceship"), Cupertino — 1:1 (R_outer = 225 m, R_inner = 148 m, H = 18.5 m).
// Foster + Partners circular 4-story curved glass headquarters ring with cantilevered white glass-and-aluminium
// horizontal solar/louvre canopy rings at every floor, dark solar-panel roof annulus, grand 4-story east/west
// atrium portals, lush central courtyard park with pond, orchard mounds & iconic rainbow stage arch, plus the
// circular glass Steve Jobs Theater pavilion on the southeast knoll with its cantilevered metallic silver disc roof.

const GLASS = 0x5c768d, GLASS_LT = 0x89a8c2, LOUVRE = 0xf4f5f7, LOUVRE_SH = 0xdce0e6;
const SOLAR = 0x1e2631, SOLAR_TRIM = 0x394554, STEEL = 0xcfd5dc, ALU = 0xe4e8ec;
const LAWN = 0x4f8a46, LAWN_LT = 0x629e54, TREE_A = 0x3b7337, TREE_B = 0x568d44, TREE_C = 0x6ea352;
const WATER = 0x2a6f92, DECK = 0xc29b68, PATH = 0xd9d4c7, LIT = 0xfff3d6;
const RAINBOW = [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa];

export const lodDist = 2600;
export const fineDist = 650;
export const glowStrength = 1.9;

const RO = 222, RI = 146, H = 18.0;

// Colliders: 16 ring-sector boxes around the annulus + Steve Jobs Theater cylinder
export const colliders = [
  ...Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const rm = (RO + RI) * 0.5;
    return {
      x: Math.cos(a) * rm,
      z: Math.sin(a) * rm,
      hw: (RO - RI) * 0.5,
      hd: rm * (Math.PI / 16) * 1.05,
      h: H,
      rot: (-a * 180) / Math.PI,
    };
  }),
  { x: 155, z: 155, r: 24, h: 11 },
];

/** Annulus sector band between r0..r1 and y0..y1, with outward/inward walls and top/bottom caps. */
function ringAnnulus(k, rIn, rOut, y0, y1, seg, colWall, colTop, colBot = null) {
  const TAU = Math.PI * 2;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const cm = Math.cos((a0 + a1) * 0.5), sm = Math.sin((a0 + a1) * 0.5);
    const oi0 = [rOut * c0, y0, rOut * s0], oi1 = [rOut * c1, y0, rOut * s1];
    const ot0 = [rOut * c0, y1, rOut * s0], ot1 = [rOut * c1, y1, rOut * s1];
    const ii0 = [rIn * c0, y0, rIn * s0], ii1 = [rIn * c1, y0, rIn * s1];
    const it0 = [rIn * c0, y1, rIn * s0], it1 = [rIn * c1, y1, rIn * s1];
    k.color(colWall);
    k.quadN(oi0, oi1, ot1, ot0, [cm, 0, sm]);
    k.quadN(ii0, ii1, it1, it0, [-cm, 0, -sm]);
    if (colTop != null) {
      k.color(colTop);
      k.quadN(it0, it1, ot1, ot0, [0, 1, 0]);
    }
    if (colBot != null) {
      k.color(colBot);
      k.quadN(ii0, ii1, oi1, oi0, [0, -1, 0]);
    }
  }
}

function spaceshipRing(k) {
  const hi = k.hi, fine = k.fine;
  const seg = hi ? 64 : 28;
  const TAU = Math.PI * 2;

  // 1. Stone / concrete base plinth ring so terrain slope never gaps
  k.glow(false);
  ringAnnulus(k, RI - 2.5, RO + 2.5, -3.5, 0.4, seg, PATH, PATH);

  // 2. Main 4-story curved glass body (recessed slightly inside the louvre fins)
  ringAnnulus(k, RI + 2.2, RO - 2.2, 0.4, H - 0.6, seg, GLASS, SOLAR_TRIM);

  // 3. Night-glowing interior office bands on floors 1..4 (both outer and inner facades)
  k.glow(true);
  for (let fl = 0; fl < 4; fl++) {
    const yf0 = 1.2 + fl * 4.1, yf1 = yf0 + 2.5;
    ringAnnulus(k, RI + 1.95, RO - 1.95, yf0, yf1, seg, LIT, null);
  }
  k.glow(false);

  // 4. Cantilevered white curved horizontal louvre / sunshade canopy rings (5 tiers: ground overhang + 4 floors)
  const louvreYs = [3.9, 8.0, 12.1, 16.2, 17.8];
  for (let t = 0; t < louvreYs.length; t++) {
    const y = louvreYs[t];
    const isTop = t === louvreYs.length - 1;
    const ext = isTop ? 5.2 : 3.8;
    const th = isTop ? 0.85 : 0.55;
    // Outer cantilevered fin ring
    ringAnnulus(k, RO - 2.4, RO + ext, y, y + th, seg, LOUVRE, LOUVRE, LOUVRE_SH);
    // Inner cantilevered fin ring facing courtyard
    ringAnnulus(k, RI - ext * 0.85, RI + 2.4, y, y + th, seg, LOUVRE, LOUVRE, LOUVRE_SH);
  }

  // 5. Dark solar-panel array annulus across the rooftop + skylight atrium rings
  ringAnnulus(k, RI + 4.5, RO - 4.5, H - 0.15, H + 0.55, seg, SOLAR_TRIM, SOLAR);
  if (hi) {
    // Concentric silver service / skylight tracks on the solar roof
    ringAnnulus(k, RI + 14, RI + 17.5, H + 0.55, H + 0.9, seg, STEEL, GLASS_LT);
    ringAnnulus(k, RO - 17.5, RO - 14, H + 0.55, H + 0.9, seg, STEEL, GLASS_LT);

    // Vertical structural glass mullions around outer & inner curtain walls
    k.color(STEEL);
    const nMul = fine ? 96 : 48;
    for (let i = 0; i < nMul; i++) {
      const a = (i / nMul) * TAU, c = Math.cos(a), s = Math.sin(a);
      k.strut([c * (RO - 1.8), 0.4, s * (RO - 1.8)], [c * (RO - 1.8), H - 0.2, s * (RO - 1.8)], 0.28);
      k.strut([c * (RI + 1.8), 0.4, s * (RI + 1.8)], [c * (RI + 1.8), H - 0.2, s * (RI + 1.8)], 0.25);
    }
  }

  // 6. Grand 4-story glass atrium portals on East (+X) and West (-X)
  for (const sx of [-1, 1]) {
    k.push().translate(sx * ((RO + RI) * 0.5), 0, 0);
    k.glow(true).color(GLASS_LT).box(0, 0.4, 0, RO - RI + 8, H + 1.2, 22);
    k.glow(false).color(LOUVRE).box(0, H + 1.2, 0, RO - RI + 12, 0.9, 26);
    k.pop();
  }
}

function innerCourtyard(k) {
  const hi = k.hi;
  // Lush central park lawn disc inside the ring
  k.glow(false).color(LAWN).cyl(0, -1.5, 0, RI - 1, RI - 1, 1.8, hi ? 48 : 20);
  // Outer perimeter walking loop path & radial walkways
  ringAnnulus(k, RI - 12, RI - 6, 0.3, 0.42, hi ? 48 : 20, PATH, PATH);

  // Large organic pond in the southern-east courtyard + timber sun deck
  k.color(PATH).cyl(-18, 0.25, 22, 41, 41, 0.25, hi ? 32 : 14);
  k.color(WATER).cyl(-18, 0.32, 22, 38, 38, 0.22, hi ? 32 : 14);
  k.color(DECK).box(-18, 0.35, -18, 28, 0.4, 8);

  // Iconic Apple Park concentric rainbow stage arches in the central courtyard
  const archX = 12, archZ = -12;
  const archSeg = hi ? 24 : 10;
  k.glow(true);
  for (let rIdx = 0; rIdx < RAINBOW.length; rIdx++) {
    const rad = 11.5 - rIdx * 1.15;
    k.color(RAINBOW[rIdx]);
    for (let s = 0; s < archSeg; s++) {
      const a0 = (s / archSeg) * Math.PI, a1 = ((s + 1) / archSeg) * Math.PI;
      const p0 = [archX + Math.cos(a0) * rad, 0.4 + Math.sin(a0) * rad, archZ];
      const p1 = [archX + Math.cos(a1) * rad, 0.4 + Math.sin(a1) * rad, archZ];
      k.strut(p0, p1, 0.85);
    }
  }
  k.glow(false);

  // Landscaped orchard hills & tree clusters inside the ring
  const mounds = [
    [-55, -40, 34, 4.2],
    [52, -45, 30, 3.8],
    [58, 35, 32, 4.0],
    [-68, 25, 28, 3.5],
  ];
  for (const [mx, mz, mr, mh] of mounds) {
    k.color(LAWN_LT).sphere(mx, 0.2, mz, mr, hi ? 16 : 8, 5, mh / mr, 0.5);
  }

  // Courtyard orchard trees
  const treeCols = [TREE_A, TREE_B, TREE_C];
  const nTrees = hi ? 42 : 16;
  for (let i = 0; i < nTrees; i++) {
    const a = i * 2.39996;
    const r = 24 + ((i * 19) % 98);
    const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
    if (Math.hypot(tx + 18, tz - 22) < 43) continue; // skip pond
    if (Math.hypot(tx - archX, tz - archZ) < 16) continue; // skip rainbow stage
    const th = 5.5 + (i % 4) * 1.2;
    k.color(0x5c432c).cyl(tx, 0.3, tz, 0.45, 0.3, th * 0.45, 5);
    k.color(treeCols[i % 3]).sphere(tx, 0.3 + th * 0.65, tz, 3.2 + (i % 3) * 0.7, hi ? 8 : 5, 5, 0.85);
  }
}

function steveJobsTheater(k) {
  const hi = k.hi, seg = hi ? 36 : 16;
  const tx = 155, tz = 155;
  k.push().translate(tx, 0, tz);
  // Grassy knoll & stepped circular stone plaza
  k.glow(false).color(LAWN_LT).cyl(0, -2.5, 0, 48, 36, 4.5, seg);
  k.color(PATH).cyl(0, 2.0, 0, 28, 26, 0.8, seg);
  k.color(PATH).cyl(0, 2.8, 0, 24, 24, 0.5, seg);
  // 7m tall frameless 360-degree curved glass cylinder wall (glowing warmly at night)
  k.glow(true).color(LIT).cyl(0, 3.3, 0, 19.2, 19.2, 6.6, seg);
  k.glow(false).color(GLASS_LT).cyl(0, 3.3, 0, 20.2, 20.2, 6.8, seg);
  // Iconic cantilevered metallic silver carbon-fiber disc roof (47m diameter)
  k.color(ALU).cyl(0, 10.1, 0, 24.5, 23.5, 0.65, seg);
  k.color(STEEL).cyl(0, 10.75, 0, 23.5, 16.0, 0.55, seg);
  k.pop();
}

export function build(k) {
  spaceshipRing(k);
  innerCourtyard(k);
  steveJobsTheater(k);
  k.glow(false);
}
