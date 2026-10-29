// feature/famous-landmarks: Tesla Gigafactory Texas (Giga Austin), Austin TX — 1:1 (scaled 320m x 125m x 24m).
// Monumental beveled diamond-cornered white industrial megastructure with dark rooftop solar arrays
// spelling T E S L A in crisp white roof panels, blue-tinted glass curtain-wall bands, and a glowing red Tesla monument!

export const lodDist = 2800;
export const fineDist = 700;
export const glowStrength = 1.9;

const WALL_W = 0xf2f4f7, WALL_SH = 0xd6dce4, GLASS = 0x32485c, GLASS_LT = 0x6288a8;
const SOLAR_DK = 0x161d26, ROOF_W = 0xfafbfd, TESLA_RED = 0xe82127;
const ASPHALT = 0x484d54, CONCRETE = 0xd4d0c8, LAWN = 0x528844, LIT = 0xebf4ff;

const HW = 156, HD = 60, CH = 20, H = 23.5;

export const colliders = [
  { x: 0, z: 0, hw: HW, hd: HD, h: H },
];

function roofLetter(k, idx, cx, cz, w, d) {
  const hw = w * 0.5, hd = d * 0.5, st = w * 0.22, y = H + 0.38, th = 0.35;
  k.glow(true).color(ROOF_W);
  if (idx === 0) {
    // T
    k.box(cx, y, cz - hd + st * 0.5, w, th, st);
    k.box(cx, y, cz + st * 0.3, st, th, d - st * 0.6);
  } else if (idx === 1) {
    // E
    k.box(cx - hw + st * 0.5, y, cz, st, th, d);
    k.box(cx + st * 0.2, y, cz - hd + st * 0.5, w - st * 0.4, th, st);
    k.box(cx, y, cz, w * 0.78, th, st * 0.9);
    k.box(cx + st * 0.2, y, cz + hd - st * 0.5, w - st * 0.4, th, st);
  } else if (idx === 2) {
    // S
    k.box(cx, y, cz - hd + st * 0.5, w, th, st);
    k.box(cx - hw + st * 0.5, y, cz - hd * 0.45, st, th, hd * 0.9);
    k.box(cx, y, cz, w, th, st * 0.9);
    k.box(cx + hw - st * 0.5, y, cz + hd * 0.45, st, th, hd * 0.9);
    k.box(cx, y, cz + hd - st * 0.5, w, th, st);
  } else if (idx === 3) {
    // L
    k.box(cx - hw + st * 0.5, y, cz, st, th, d);
    k.box(cx + st * 0.2, y, cz + hd - st * 0.5, w - st * 0.4, th, st);
  } else if (idx === 4) {
    // A
    k.box(cx, y, cz - hd + st * 0.5, w * 0.86, th, st);
    k.box(cx - hw + st * 0.5, y, cz + st * 0.2, st, th, d - st * 0.4);
    k.box(cx + hw - st * 0.5, y, cz + st * 0.2, st, th, d - st * 0.4);
    k.box(cx, y, cz + st * 0.4, w * 0.8, th, st * 0.9);
  }
}

export function build(k) {
  const hi = k.hi;

  k.glow(false).color(CONCRETE).box(0, -2.5, 0, HW * 2 + 44, 2.9, HD * 2 + 44);
  k.color(LAWN).box(0, 0.4, HD + 14, HW * 1.6, 0.25, 14);

  const hullPts = [
    [-HW + CH, -HD],
    [HW - CH, -HD],
    [HW, -HD + CH],
    [HW, HD - CH],
    [HW - CH, HD],
    [-HW + CH, HD],
    [-HW, HD - CH],
    [-HW, -HD + CH],
  ];
  k.color(WALL_W).extrude(hullPts, 0.4, H - 0.4);
  const rimPts = hullPts.map(([x, z]) => [x * 1.012, z * 1.018]);
  k.color(WALL_SH).extrude(rimPts, H - 1.2, 1.4);

  k.glow(true).color(LIT);
  k.box(0, 4.2, 0, (HW - CH) * 2, 4.2, HD * 2 + 0.4);
  k.box(0, 13.5, 0, (HW - CH) * 2, 5.2, HD * 2 + 0.4);
  k.box(0, 13.5, 0, HW * 2 + 0.4, 5.2, (HD - CH) * 2);

  k.color(TESLA_RED).box(-92, 15.2, HD + 0.35, 38, 3.2, 0.4);
  k.glow(false);

  if (hi) {
    k.color(WALL_W);
    for (let x = -HW + CH + 12; x <= HW - CH - 12; x += 18) {
      k.box(x, 0.4, -HD - 0.3, 2.2, H - 1.2, 0.7);
      k.box(x, 0.4, HD + 0.3, 2.2, H - 1.2, 0.7);
    }
  }

  const solarPts = hullPts.map(([x, z]) => [x * 0.94, z * 0.90]);
  k.glow(false).color(SOLAR_DK).extrude(solarPts, H, 0.36);
  for (let i = 0; i < 5; i++) {
    roofLetter(k, i, -104 + i * 52, 0, 36, 62);
  }
  k.glow(false);

  k.push().translate(0, 0, HD + 13);
  k.glow(false).color(ASPHALT).box(0, 0.4, 0, 18, 1.4, 5.5);
  k.glow(true).color(TESLA_RED);
  k.box(0, 1.8, 0, 4.2, 10.5, 1.6);
  k.color(ROOF_W).box(0, 9.8, 0, 3.2, 0.7, 1.8).box(0, 5.2, 0, 0.85, 4.4, 1.8);
  k.glow(false);
  k.pop();
}
