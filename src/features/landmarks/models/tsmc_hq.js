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
  const seg = hi ? 16 : 8;
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
    for (const y of [6, 15, 24, 33, 41]) {
      k.glow(true).color(LIT).extrude(pts, y, 2.6, false);
      if (hi) k.glow(false).color(STEEL).extrude(pts, y + 2.7, 0.65);
    }
  }
  k.glow(false);

  // Central glass rotunda atrium at the apex of the R&D crescent (z = 22)
  k.color(GLASS_LT).cyl(0, 0.4, 22, 18, 18, 49.5, hi ? 20 : 10);
  k.color(STEEL).cyl(0, 49.9, 22, 19.2, 19.2, 1.8, hi ? 20 : 10);
  k.glow(true).color(LIT).cyl(0, 4.0, 22, 18.2, 18.2, 5.5, 12);
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

  // Iconic External Vertical Cleanroom Exhaust Towers / Air Scrubbers along the Fab flanks & roof
  if (hi) {
    k.color(STEEL);
    for (let x = -72; x <= 72; x += 24) {
      k.box(x, 0.4, -75.5, 6.5, 37.5, 4.5);
      k.cyl(x, 36.8, -52, 2.6, 2.6, 6.5, 8);
      k.cyl(x, 36.8, -24, 2.6, 2.6, 6.5, 8);
    }
  }

  // 4. Twin Elevated Cleanroom Skybridges (AMHS Wafer Transport Tubes) linking Fab 12 & R&D Crescent
  for (const bx of [-34, 34]) {
    k.glow(false).color(STEEL).box(bx, 16.0, -6, 9.5, 1.2, 36).box(bx, 22.0, -6, 9.8, 1.0, 36);
    k.glow(true).color(GLASS_LT).box(bx, 17.2, -6, 8.6, 4.8, 35);
    k.glow(false).color(ALU_SH).cyl(bx, 0.4, -6, 1.4, 1.4, 16.0, 8);
  }

  // 5. Iconic TSMC Red Diamond Emblem & Sign on the Fab Crown and Front Entry Plaza
  // Rooftop / upper facade glowing red TSMC diamond + letters
  k.push().translate(-54, 38.5, 22).rotateZ(Math.PI / 4);
  k.glow(true).color(TSMC_RED).box(0, -3.2, 0, 6.4, 6.4, 1.4);
  k.pop();
  k.glow(true).color(TSMC_RED).box(-34, 36.5, 22, 24, 4.2, 1.4);

  // Entry plaza TSMC monument monolith (at z = 44)
  k.glow(false).color(ROOF_DK).box(0, 0.4, 44, 18, 1.5, 3.2);
  k.push().translate(-5.2, 5.2, 44).rotateZ(Math.PI / 4);
  k.glow(true).color(TSMC_RED).box(0, -2.2, 0, 4.4, 4.4, 1.6);
  k.pop();
  k.glow(true).color(FAB_W).box(2.5, 3.0, 44, 9.5, 4.2, 1.5);
  k.glow(false);
}
