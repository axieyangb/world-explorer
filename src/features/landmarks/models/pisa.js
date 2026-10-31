// feature/famous-landmarks: Leaning Tower of Pisa (Torre di Pisa) — 1:1, 56.7 m on the high side.
// Cylindrical marble campanile, base Ø 15.5 m: blind-arcaded ground storey, six open loggia storeys
// (30 columns each), narrower bell chamber on top. Leans ~3.97° toward the south (local +Z, heading 0).
const MARBLE = 0xf1ebdc, MARBLE_DK = 0xd9cfbb, MARBLE_SH = 0xc9bea8, CORE = 0x8e8577, CORE_DK = 0x6f675b;
const GRASS = 0x7d9a55;
const TILT = (3.97 * Math.PI) / 180;

export const lodDist = 1100;
export const glowStrength = 0.5; // floodlit marble at night
export const colliders = [
  { x: 0, z: 0, r: 8.2, h: 30 },
  { x: 0, z: 2.6, r: 7.8, h: 56 },
];

function arcadeStorey(k, y0, h, R, n, seg, open) {
  const hi = k.hi;
  // inner wall (dark gallery behind the colonnade for open storeys, solid marble for blind arcade)
  const rIn = open ? R - 1.7 : R - 0.25;
  k.color(open ? CORE : MARBLE_DK).cyl(0, y0, 0, rIn, rIn, h, seg, { caps: false });
  // floor / cornice ring
  k.color(MARBLE).cyl(0, y0, 0, R + 0.35, R + 0.35, 0.6, seg);
  // arch band at the top of the storey
  const bandH = open ? h * 0.28 : h * 0.22;
  if (!k.fine || !open || !n) k.color(MARBLE).cyl(0, y0 + h - bandH, 0, R + 0.05, R + 0.05, bandH, seg, { caps: false });
  if (!hi) return;
  if (open && n && k.fine) {
    // [lm-materials] real open arches: per bay an arched frame (outer face + soffit) springing from the capitals
    const bw = 2 * (R + 0.05) * Math.sin(Math.PI / n), r = bw / 2 - 0.2, yS = y0 + h - bandH, yT = y0 + h, rise = Math.min(r, bandH * 0.75);
    const ns = 8;
    for (let i = 0; i < n; i++) {
      const am = ((i + 0.5) / n) * Math.PI * 2;
      k.push().translate(Math.cos(am) * (R + 0.05) * Math.cos(Math.PI / n), 0, Math.sin(am) * (R + 0.05) * Math.cos(Math.PI / n)).rotateY(-am - Math.PI / 2);
      k.color(MARBLE);
      const P = [];
      for (let j = 0; j <= ns; j++) { const t = Math.PI * (1 - j / ns); P.push([Math.cos(t) * r, yS + Math.sin(t) * rise]); }
      for (let j = 0; j < ns; j++) {
        k.quadN([P[j][0], P[j][1], 0], [P[j + 1][0], P[j + 1][1], 0], [P[j + 1][0], yT, 0], [P[j][0], yT, 0], [0, 0, -1]);
        k.quadN([P[j][0], P[j][1], 0], [P[j + 1][0], P[j + 1][1], 0], [P[j + 1][0], P[j + 1][1], 0.55], [P[j][0], P[j][1], 0.55], [-P[j][0] - P[j + 1][0], 2 * yS - P[j][1] - P[j + 1][1], 0]);
      }
      for (const sx of [-1, 1]) k.quadN([sx * r, yS, 0], [sx * bw / 2, yS, 0], [sx * bw / 2, yT, 0], [sx * r, yT, 0], [0, 0, -1]);
      k.color(MARBLE_SH);
      for (let j = 0; j < ns; j++) k.strut([P[j][0] * 1.12, yS + (P[j][1] - yS) * 1.12, -0.06], [P[j + 1][0] * 1.12, yS + (P[j + 1][1] - yS) * 1.12, -0.06], 0.12);
      k.pop();
    }
  }
  // columns + arch heads
  const colH = h - bandH - 0.6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = Math.cos(a) * (R - 0.1), cz = Math.sin(a) * (R - 0.1);
    const cr = open ? 0.26 : 0.4;
    if (!k.fine) {
      k.color(MARBLE).cyl(cx, y0 + 0.6, cz, cr, cr * 0.92, colH, 6, { caps: false });
      k.color(MARBLE_DK).box(cx, y0 + 0.6 + colH - 0.35, cz, cr * 2.4, 0.35, cr * 2.4);
    } else k.color(MARBLE).lathe(cx, y0 + 0.6, cz, [[cr * 1.45, 0], [cr * 1.45, 0.12], [cr * 1.15, 0.22], [cr, 0.32], [cr * 0.92, colH - 0.5], [cr * 1.05, colH - 0.42], [cr * 1.5, colH - 0.12], [cr * 1.5, colH]], 10, { caps: false });
    if (k.fine) k.color(MARBLE_DK).box(cx, y0 + 0.6 + colH - 0.12, cz, cr * 3.2, 0.14, cr * 3.2); // abacus
    // dark arch void suggestion on the band (half-round)
    const am = a + Math.PI / n;
    const ax = Math.cos(am) * (R + 0.08), az = Math.sin(am) * (R + 0.08);
    const span = ((2 * Math.PI * R) / n) * 0.42;
    k.push().translate(ax, y0 + h - bandH, az).rotateY(-am + Math.PI / 2);
    k.color(open ? CORE_DK : MARBLE_SH);
    const st = open && k.fine ? 0 : 6;
    for (let s = 0; s < st; s++) {
      const t0 = (s / st) * Math.PI, t1 = ((s + 1) / st) * Math.PI;
      k.tri([0, 0, -0.02], [Math.cos(t1) * span, Math.sin(t1) * span * 0.9, -0.02], [Math.cos(t0) * span, Math.sin(t0) * span * 0.9, -0.02]);
    }
    // lozenge / roundel inlay between arches
    k.color(MARBLE_SH).box(span + 0.22, bandH * 0.55, 0, 0.35, 0.35, 0.06);
    k.pop();
  }
  // parapet ring at the top of the gallery
  if (open) k.color(MARBLE_DK).cyl(0, y0 + 0.6, 0, R + 0.02, R + 0.02, 0.9, seg, { caps: false });
}

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 40 : 14;
  // lawn of the Piazza dei Miracoli + sunken marble basin (catino) with perimeter stone balustrade (not tilted)
  if (hi) {
    k.color(GRASS).cyl(0, 0, 0, 14.5, 14.5, 0.06, 32);
    k.color(MARBLE).cyl(0, 0.02, 0, 11.6, 11.6, 0.12, 32);
    k.color(MARBLE_DK).cyl(0, 0.08, 0, 11.4, 11.4, 0.85, 32, { caps: false });
    for (let p = 0; p < 24; p++) {
      const pa = (p / 24) * Math.PI * 2;
      k.color(MARBLE).box(Math.cos(pa) * 11.4, 0.1, Math.sin(pa) * 11.4, 0.28, 0.92, 0.28);
    }
  }
  k.color(MARBLE_DK).cyl(0, -1.5, 0, 9.4, 9.4, 1.9, seg);
  k.push().translate(0, 0.35, 0).rotateX(TILT);
  k.glow(true);
  // plinth / steps
  k.color(MARBLE).cyl(0, -1.2, 0, 8.6, 8.6, 1.5, seg);
  // ground storey: blind arcade, 15 engaged columns
  const R = 7.74;
  k.color(MARBLE).cyl(0, 0.3, 0, R, R, 11.0, seg, { caps: false });
  if (hi) {
    // Dichromatic horizontal Pisan Romanesque grey-limestone inlay bands across the ground storey
    k.color(0x9a968e);
    for (let by = 1.4; by < 9.0; by += 1.2) k.cyl(0, by, 0, R + 0.02, R + 0.02, 0.22, seg, { caps: false });
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      k.color(MARBLE_DK).cyl(Math.cos(a) * (R + 0.15), 0.3, Math.sin(a) * (R + 0.15), 0.45, 0.42, 8.6, 6, { caps: false });
      const am = a + Math.PI / 15;
      k.push().translate(Math.cos(am) * (R + 0.04), 8.9, Math.sin(am) * (R + 0.04)).rotateY(-am + Math.PI / 2);
      k.color(MARBLE_SH);
      for (let s = 0; s < 8; s++) {
        const t0 = (s / 8) * Math.PI, t1 = ((s + 1) / 8) * Math.PI;
        k.quad([Math.cos(t0) * 1.35, Math.sin(t0) * 1.35, 0], [Math.cos(t1) * 1.35, Math.sin(t1) * 1.35, 0], [Math.cos(t1) * 1.6, Math.sin(t1) * 1.6, 0], [Math.cos(t0) * 1.6, Math.sin(t0) * 1.6, 0]);
      }
      k.pop();
    }
    // main door on the south side with Romanesque lunette arch & Madonna-and-Child relief sculpture
    k.color(CORE_DK).box(0, 0.3, R - 0.1, 1.9, 4.2, 0.4);
    k.color(MARBLE).box(0, 4.4, R + 0.05, 2.5, 0.3, 0.45);
    k.color(MARBLE_SH).cyl(0, 4.7, R + 0.02, 0.25, 0.2, 0.9, 6).sphere(0, 5.75, R + 0.02, 0.16, 6, 4);
  }
  k.color(MARBLE).cyl(0, 10.4, 0, R + 0.3, R + 0.3, 0.9, seg);
  // six loggia storeys
  const SH = 6.45;
  for (let s = 0; s < 6; s++) arcadeStorey(k, 11.3 + s * SH, SH, R, hi ? 30 : 0, seg, true);
  // top cornice
  const yTop = 11.3 + 6 * SH; // 50.0
  k.color(MARBLE).cyl(0, yTop, 0, R + 0.35, R + 0.35, 0.55, seg);
  if (hi) k.color(MARBLE_DK).cyl(0, yTop + 0.55, 0, R + 0.1, R + 0.1, 0.6, seg, { caps: false });
  // bell chamber (narrower, 6 large arches + 6 small)
  const RB = 4.9;
  k.color(CORE).cyl(0, yTop + 0.55, 0, RB - 0.9, RB - 0.9, 4.2, seg);
  k.color(MARBLE).cyl(0, yTop + 4.4, 0, RB + 0.15, RB + 0.15, 0.6, seg);
  k.color(MARBLE).cyl(0, yTop + 3.4, 0, RB, RB, 1.0, seg, { caps: false });
  if (hi) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.color(MARBLE).cyl(Math.cos(a) * RB, yTop + 0.55, Math.sin(a) * RB, 0.38, 0.36, 2.9, 6, { caps: false });
    }
    // 7 historic Bronze Bells (L'Assunta, Il Crocifisso, San Ranieri, La Terza, La Pasquereccia, Il Vespruccio, Dal Pozzo)
    // suspended in the 7 arched openings around the bell chamber perimeter with timber headstocks
    for (let b = 0; b < 7; b++) {
      const ba = (b / 7) * Math.PI * 2 + 0.25;
      const bx = Math.cos(ba) * (RB - 0.42), bz = Math.sin(ba) * (RB - 0.42);
      const br = 0.42 + (b % 3) * 0.08;
      k.color(0x523a26).box(bx, yTop + 3.05, bz, br * 2.1, 0.28, br * 1.4);
      k.color(0x7a6a44).lathe(bx, yTop + 1.95, bz, [[br, 0], [br * 0.78, 0.35], [br * 0.62, 0.85], [br * 0.35, 1.1]], 8);
      k.color(0x3b3322).sphere(bx, yTop + 1.92, bz, 0.12, 5, 3);
    }
    // Iron safety railing around the 7th-level observation walk and crimson Pisan Cross banner at the summit
    k.color(0x3a3e42);
    for (let r = 0; r < 24; r++) {
      const ra = (r / 24) * Math.PI * 2;
      k.box(Math.cos(ra) * (R + 0.15), yTop + 1.15, Math.sin(ra) * (R + 0.15), 0.08, 0.9, 0.08);
      k.box(Math.cos(ra) * (RB - 0.35), yTop + 6.15, Math.sin(ra) * (RB - 0.35), 0.08, 0.85, 0.08);
    }
    // Flagpole with crimson banner & white Pisan Cross (Croce Pisana)
    k.color(0xc0c4c8).cyl(0, yTop + 6.15, -RB + 0.6, 0.06, 0.04, 4.2, 6);
    k.color(0xc81d25).box(0.95, yTop + 8.8, -RB + 0.6, 1.8, 1.2, 0.08);
    k.color(0xffffff).box(0.95, yTop + 9.25, -RB + 0.6, 0.8, 0.22, 0.1).box(0.95, yTop + 8.95, -RB + 0.6, 0.22, 0.8, 0.1);
  }
  // little bell-chamber roof + parapet top
  k.color(MARBLE_DK).cyl(0, yTop + 5.0, 0, RB - 0.2, RB - 1.2, 1.15, seg);
  k.glow(false);
  k.pop();
}
