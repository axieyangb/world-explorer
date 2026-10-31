// feature/famous-landmarks: TSMC Global R&D Center & Fab 12 Campus, Hsinchu Taiwan — 1:1.
// Monumental curved high-tech glass R&D administration crescent + silver semiconductor wafer mega-fab
// connected by elevated cleanroom Automated Material Handling System (AMHS) skybridges and TSMC red diamond emblem!

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.9;

const GLASS = 0x3b5872, GLASS_LT = 0x7099ba, STEEL = 0xdfe4ea, ALU_SH = 0xc2cbd4;
const FAB_W = 0xf2f4f7, ROOF_DK = 0x26303a, TSMC_RED = 0xd91e26;
const LAWN = 0x4e8c45, PAVE = 0xd6d2c8, LIT = 0xebf5ff;

export const colliders = [
  { x: 0, z: 24, hw: 76, hd: 22, h: 48 },
  { x: 0, z: -38, hw: 88, hd: 36, h: 36 },
];

export function build(k) {
  const hi = k.hi;

  // 1. Landscaped Science Park Campus Plaza & Reflection Pool
  k.glow(false).color(PAVE).box(0, -2.5, -6, 220, 2.9, 165);
  k.color(LAWN).box(-64, 0.4, 56, 56, 0.25, 24).box(64, 0.4, 56, 56, 0.25, 24);
  k.color(0x286684).box(0, 0.45, 56, 52, 0.25, 18); // entry reflecting pool

  // 2. Curved High-Tech Glass R&D Administration Crescent (front south building at z = 24, height 48m)
  const seg = hi ? 24 : 8;
  const RIn = 110, ROut = 144, czArc = 148;
  for (let i = 0; i < seg; i++) {
    const a0 = -Math.PI * 0.5 - 0.52 + (i / seg) * 1.04;
    const a1 = -Math.PI * 0.5 - 0.52 + ((i + 1) / seg) * 1.04;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const pts = [
      [c0 * RIn, czArc + s0 * RIn],
      [c1 * RIn, czArc + s1 * RIn],
      [c1 * ROut, czArc + s1 * ROut],
      [c0 * ROut, czArc + s0 * ROut],
    ];
    k.glow(false).color(GLASS).extrude(pts, 0.4, 45.0);
    k.color(STEEL).extrude(pts, 45.4, 2.2);

    // Night-lit continuous curved R&D lab floor bands & silver sunshade louvres
    for (const y of [5.5, 11.5, 17.5, 23.5, 29.5, 35.5, 41.0]) {
      k.glow(true).color(LIT).extrude(pts, y, 2.3, false);
      if (hi) k.glow(false).color(STEEL).extrude(pts, y + 2.35, 0.55);
    }
    if (hi) {
      // Vertical curtain-wall mullions along inner & outer curved facades
      k.glow(false).color(ALU_SH);
      k.strut([c0 * (RIn - 0.2), 0.4, czArc + s0 * (RIn - 0.2)], [c0 * (RIn - 0.2), 45.4, czArc + s0 * (RIn - 0.2)], 0.35);
      k.strut([c0 * (ROut + 0.2), 0.4, czArc + s0 * (ROut + 0.2)], [c0 * (ROut + 0.2), 45.4, czArc + s0 * (ROut + 0.2)], 0.35);
    }
  }
  k.glow(false);

  // Central glass rotunda atrium at the apex of the R&D crescent (z = 22)
  k.color(GLASS_LT).cyl(0, 0.4, 22, 18, 18, 49.5, hi ? 28 : 10);
  k.color(STEEL).cyl(0, 49.9, 22, 19.2, 19.2, 1.8, hi ? 28 : 10);
  k.glow(true).color(LIT).cyl(0, 4.0, 22, 18.2, 18.2, 5.5, hi ? 24 : 12);
  if (hi) {
    // Rotunda dome skylight & vertical steel rib cage
    k.glow(false).color(STEEL);
    for (let r = 0; r < 12; r++) {
      const a = (r / 12) * Math.PI * 2;
      k.strut([Math.cos(a) * 18.3, 0.4, 22 + Math.sin(a) * 18.3], [Math.cos(a) * 18.3, 49.9, 22 + Math.sin(a) * 18.3], 0.32);
    }
    k.color(GLASS_LT).dome(0, 51.7, 22, 14.5, 24, 8, 0.35);
  }
  k.glow(false);

  // 3. Monumental Fab 12 EUV Semiconductor Cleanroom Mega-Fab (rear north block at z = -38, 176m x 72m x 36m)
  k.color(FAB_W).box(0, 0.4, -38, 176, 33.5, 72);
  k.color(ALU_SH).box(0, 33.9, -38, 178, 2.1, 74);
  k.color(ROOF_DK).box(0, 36.0, -38, 168, 0.8, 64);

  // Horizontal blue-glass cleanroom gallery bands along the Mega-Fab
  k.glow(true).color(LIT);
  for (const y of [8.5, 17.5, 26.5]) {
    k.box(0, y, -38, 176.6, 3.0, 72.6);
  }
  k.glow(false);

  // Iconic External Vertical Cleanroom Exhaust Towers / Air Scrubbers, Rooftop Make-Up Air Units (MAU), & N2 Cryo Tank Farm
  if (hi) {
    k.color(STEEL);
    for (let x = -72; x <= 72; x += 18) {
      // External vertical air-return shafts along North & South fab walls
      k.box(x, 0.4, -75.5, 5.8, 37.5, 4.2);
      k.box(x, 0.4, -0.5, 5.2, 35.5, 3.2);
      // Rooftop wet scrubber exhaust stacks & cooling towers
      k.cyl(x, 36.8, -54, 2.4, 2.4, 7.2, 12);
      k.cyl(x, 36.8, -22, 2.4, 2.4, 7.2, 12);
      k.color(ROOF_DK).torus(x, 44.0, -54, 2.2, 0.25, 12, 6).torus(x, 44.0, -22, 2.2, 0.25, 12, 6);
      k.color(STEEL);
      // Overhead pipe rack bridges linking exhaust scrubbers
      k.strut([x, 39.5, -54], [x, 39.5, -22], 1.2);
    }
    // Ultra-pure Nitrogen (LIN) & Argon Bulk Specialty Gas Tank Farm on West Apron (x = -98, z = -38)
    k.color(ALU_SH).box(-98, 0.4, -38, 14, 0.8, 52);
    for (let tz = -56; tz <= -20; tz += 12) {
      k.color(FAB_W).cyl(-98, 1.2, tz, 3.2, 3.2, 19.5, 16).dome(-98, 20.7, tz, 3.2, 16, 6, 0.6);
      k.color(TSMC_RED).torus(-98, 14.5, tz, 3.25, 0.18, 16, 6);
    }
  }

  // 4. Twin Elevated Cleanroom Skybridges (AMHS Wafer FOUP Transport Tubes) linking Fab 12 & R&D Crescent
  for (const bx of [-34, 34]) {
    k.glow(false).color(STEEL).box(bx, 16.0, -6, 9.5, 1.2, 36).box(bx, 22.0, -6, 9.8, 1.0, 36);
    k.glow(true).color(GLASS_LT).box(bx, 17.2, -6, 8.6, 4.8, 35);
    k.glow(false).color(ALU_SH).cyl(bx, 0.4, -6, 1.4, 1.4, 16.0, 10);
    if (hi) {
      // Exposed steel Vierendeel truss frames & glowing ceiling AMHS wafer carrier track inside skybridge
      k.glow(true).color(0xffe082).box(bx - 1.8, 20.8, -6, 0.55, 0.35, 34).box(bx + 1.8, 20.8, -6, 0.55, 0.35, 34);
      k.glow(false).color(STEEL);
      for (let z = -20; z <= 8; z += 7) {
        k.strut([bx - 4.5, 16.6, z], [bx - 4.5, 21.8, z + 3.5], 0.28);
        k.strut([bx + 4.5, 16.6, z], [bx + 4.5, 21.8, z + 3.5], 0.28);
      }
    }
  }

  // 5. Iconic TSMC Red Diamond Wafer Emblem & Sign on the Fab Crown and Front Entry Plaza
  k.push().translate(-54, 38.5, 22).rotateZ(Math.PI / 4);
  k.glow(true).color(TSMC_RED).box(0, -3.2, 0, 6.4, 6.4, 1.4);
  if (hi) {
    // White IC die grid lines across the red TSMC wafer diamond
    k.color(FAB_W).box(0, 0, 0.78, 5.8, 0.32, 0.12).box(0, 0, 0.78, 0.32, 5.8, 0.12);
  }
  k.pop();
  k.glow(true).color(TSMC_RED);
  for (let i = 0; i < 4; i++) k.box(-42 + i * 5.6, 36.5, 22, 4.0, 4.2, 1.4);

  // Entry plaza TSMC monument monolith (at z = 44) & Taiwanese camphor/banyan trees along reflection pool
  k.glow(false).color(ROOF_DK).box(0, 0.4, 44, 18, 1.5, 3.2);
  k.push().translate(-5.2, 5.2, 44).rotateZ(Math.PI / 4);
  k.glow(true).color(TSMC_RED).box(0, -2.2, 0, 4.4, 4.4, 1.6);
  k.pop();
  k.glow(true).color(FAB_W).box(2.5, 3.0, 44, 9.5, 4.2, 1.5);
  k.glow(false);
  if (hi) {
    for (const tx of [-46, -32, 32, 46]) {
      k.color(0x5a422e).cyl(tx, 0.4, 56, 0.38, 0.28, 3.2, 6);
      k.color(LAWN).sphere(tx, 4.8, 56, 3.4, 10, 6, 0.8);
    }
  }
}
