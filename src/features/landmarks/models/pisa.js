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
  // lawn of the Piazza dei Miracoli (not tilted)
  if (hi) k.color(GRASS).cyl(0, 0, 0, 13.5, 13.5, 0.06, 24);
  k.color(MARBLE_DK).cyl(0, -1.5, 0, 9.4, 9.4, 1.9, seg);
  k.push().translate(0, 0.35, 0).rotateX(TILT);
  k.glow(true);
  // plinth / steps
  k.color(MARBLE).cyl(0, -1.2, 0, 8.6, 8.6, 1.5, seg);
  // ground storey: blind arcade, 15 engaged columns
  const R = 7.74;
  k.color(MARBLE).cyl(0, 0.3, 0, R, R, 11.0, seg, { caps: false });
  if (hi) {
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
    // main door on the south side
    k.color(CORE_DK).box(0, 0.3, R - 0.1, 1.9, 4.2, 0.4);
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
    // bells glimpsed inside
    k.color(0x7a6a44).cyl(0, yTop + 1.3, 0, 0.9, 0.5, 1.6, 8);
  }
  // little bell-chamber roof + parapet top
  k.color(MARBLE_DK).cyl(0, yTop + 5.0, 0, RB - 0.2, RB - 1.2, 1.15, seg);
  k.glow(false);
  k.pop();
}
