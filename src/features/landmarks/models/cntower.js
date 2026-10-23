// feature/famous-landmarks: CN Tower, Toronto — 1:1 (antenna tip 553.3 m).
// Hexagonal hollow concrete core buttressed by three tapering legs (Y plan) that merge into the shaft
// below the main pod; the 7-storey main pod (white radome doughnut, glazed observation/360 restaurant
// rings, ~342-360 m), the slender upper shaft to the SkyPod (447 m) and the 102 m steel antenna.
// At night the shaft is lit by LED strips along the legs, the pod windows glow and the tip blinks red.

const CONC = 0xcbc6bc, CONC2 = 0xbdb7ac, WHITE = 0xeeeeea, PODGL = 0x3f4a55, STEEL = 0xa7adb3, STEEL_LT = 0xd2d6da;

export const lodDist = 2000;
export const glowStrength = 2.6;

export const colliders = [
  { x: 0, z: 0, r: 22, h: 60 },
  { x: 0, z: 0, r: 13, h: 200 },
  { x: 0, z: 0, r: 8, h: 335 },
  { x: 0, z: 0, r: 22, h: 362 },
  { x: 0, z: 0, r: 5, h: 455 },
];

const LEG_ANG = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3]; // leg A points front (-Z)
const LEG_TOP = 335;
const legLen = (y) => 7 + 27 * Math.pow(Math.max(0, 1 - y / LEG_TOP), 1.6); // centre -> leg nose
const legW = (y) => 9.5 - 3.5 * (y / LEG_TOP);
const coreR = (y) => 8.2 - 1.2 * Math.min(1, y / LEG_TOP);

/** Y-plan cross-section at height y: hexagonal core plus three legs (with chamfered noses). */
function section(y) {
  const pts = [];
  const L = legLen(y), w = legW(y) / 2, r = coreR(y);
  for (let i = 0; i < 3; i++) {
    const a = LEG_ANG[i], c = Math.cos(a), s = Math.sin(a);
    const P = (u, v) => [u * c - v * s, u * s + v * c];
    // leg: flank start (on core), nose corners, flank end
    const u0 = Math.sqrt(Math.max(0.1, r * r - w * w)) * 0.95;
    pts.push(P(u0, -w), P(L - w * 0.5, -w), P(L, -w * 0.45), P(L, w * 0.45), P(L - w * 0.5, w));
    pts.push(P(u0, w));
    // core facet between this leg and the next
    const am = a + Math.PI / 3, cm = Math.cos(am), sm = Math.sin(am);
    pts.push([cm * r, sm * r]);
  }
  return pts;
}

function loftSections(k, ys) {
  for (let s = 0; s < ys.length - 1; s++) {
    const A = section(ys[s]), B = section(ys[s + 1]);
    const y0 = ys[s], y1 = ys[s + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      k.quad([A[i][0], y0, A[i][1]], [B[i][0], y1, B[i][1]], [B[j][0], y1, B[j][1]], [A[j][0], y0, A[j][1]]);
    }
  }
}

export function build(k) {
  const hi = k.hi, seg = hi ? 24 : 10;
  // --- legs + core up to the pod (lofted Y section)
  const ys = [];
  const nS = hi ? 18 : 7;
  for (let i = 0; i <= nS; i++) ys.push(LEG_TOP * Math.pow(i / nS, 0.85));
  k.color(CONC);
  loftSections(k, ys);
  if (hi) {
    // vertical LED strips on the leg noses and the core (glow at night)
    k.glow(true).color(0xb8b3aa);
    for (let i = 0; i < 3; i++) {
      const a = LEG_ANG[i], c = Math.cos(a), s = Math.sin(a);
      const pts = [];
      for (const y of ys) pts.push([(legLen(y) + 0.15) * c, y, (legLen(y) + 0.15) * s]);
      for (let j = 0; j < pts.length - 1; j++) k.strut(pts[j], pts[j + 1], 1.2);
    }
    k.glow(false);
    // elevator glazing on one leg (dark vertical band)
    k.color(0x59636c);
    for (let j = 0; j < ys.length - 1; j++) {
      const a = LEG_ANG[1] + 0.32, y0 = ys[j], y1 = ys[j + 1];
      const r0 = coreR(y0) + 0.4, r1 = coreR(y1) + 0.4;
      k.strut([Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(a) * r1, y1, Math.sin(a) * r1], 2.2);
    }
    // base podium / entrance pavilion
    k.color(CONC2).cyl(0, 0, 0, 30, 30, 4, 6, { smooth: false, phase: Math.PI / 6 });
  }
  // --- main pod (~330-362 m)
  k.color(CONC2).lathe(0, LEG_TOP - 8, 0, [[7.2, 0], [12, 4], [17, 7]], seg);
  k.color(WHITE).lathe(0, LEG_TOP - 1, 0, [[17, 0], [20.5, 1.5], [22, 4], [21.5, 6.5], [19.5, 8]], seg);     // radome doughnut
  k.color(CONC).lathe(0, LEG_TOP + 7, 0, [[19, 0], [21.5, 0.6], [21.5, 2]], seg);
  k.glow(true).color(PODGL).lathe(0, LEG_TOP + 9, 0, [[21.5, 0], [22.5, 4.5], [21.8, 7]], seg);           // observation levels
  k.glow(false);
  k.color(CONC2).lathe(0, LEG_TOP + 16, 0, [[21.8, 0], [21.8, 1.4], [20.5, 1.4]], seg);
  k.glow(true).color(PODGL).lathe(0, LEG_TOP + 17.4, 0, [[20.5, 0], [21, 3.6], [20, 5]], seg);            // 360 restaurant
  k.glow(false);
  k.color(CONC).lathe(0, LEG_TOP + 22.4, 0, [[20, 0], [16, 3], [9, 5.5], [6.5, 6]], seg);
  // --- upper shaft to the SkyPod and antenna base
  k.color(CONC).lathe(0, LEG_TOP + 28, 0, [[6.4, 0], [5.8, 60], [5.4, 84]], hi ? 6 : 6, { smooth: false, phase: Math.PI / 6 });
  // SkyPod (447 m)
  k.color(CONC2).lathe(0, 440, 0, [[5.6, 0], [8.5, 3], [9.2, 5]], seg);
  k.glow(true).color(PODGL).lathe(0, 445, 0, [[9.2, 0], [9.6, 2.4], [9.0, 4.5]], seg).glow(false);
  k.color(CONC2).lathe(0, 449.5, 0, [[9.0, 0], [7, 2.5], [5, 4]], seg);
  k.color(CONC).lathe(0, 453.5, 0, [[5, 0], [4.6, 3.5]], hi ? 12 : 6);
  // --- antenna 457 -> 553.3 m (steel, stepped)
  k.color(STEEL).lathe(0, 457, 0, [[3.8, 0], [3.4, 22], [2.8, 22], [2.5, 48], [1.9, 48], [1.6, 72], [1.0, 72], [0.7, 90], [0.15, 96.3]], hi ? 10 : 5);
  if (hi) {
    k.color(STEEL_LT);
    for (let y = 462; y < 540; y += 7) {
      const t = (y - 457) / 96;
      const r = 3.9 - 3.1 * t;
      k.lathe(0, y, 0, [[r + 0.4, 0], [r + 0.4, 0.8]], 10);
    }
    k.glow(true).color(0xff3a2a);
    for (const y of [480, 505, 530]) k.sphere(0, y, 0, 0.6, 5, 3);
    k.glow(false);
  }
  k.glow(true).color(0xff3a2a).sphere(0, 552.4, 0, hi ? 0.7 : 1.2, 6, 4).glow(false);
  nightLights(k, ys);
}

/** LED facade lighting of the shaft (night only, see setup): white legs fading to red under the pod. */
function nightLights(k, ys) {
  k.part("night").glow(true);
  for (let s = 0; s < ys.length - 1; s++) {
    const y0 = ys[s], y1 = ys[s + 1], t = y1 / LEG_TOP;
    k.color(t < 0.7 ? 0xc8d4ff : t < 0.9 ? 0xff8a9a : 0xff4058);
    const A = section(y0).map(([x, z]) => [x * 1.02, z * 1.02]), B = section(y1).map(([x, z]) => [x * 1.02, z * 1.02]);
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      k.quad([A[i][0], y0, A[i][1]], [B[i][0], y1, B[i][1]], [B[j][0], y1, B[j][1]], [A[j][0], y0, A[j][1]]);
    }
  }
  k.color(0xff4058).lathe(0, LEG_TOP + 28, 0, [[6.6, 0], [6.0, 60], [5.6, 84]], 6, { smooth: false, phase: Math.PI / 6 });
  k.glow(false).part("main");
}

export function setup({ parts }) {
  const lights = parts("night");
  for (const o of lights) o.visible = false;
  return { update(dt, t, night) { const on = night > 0.2; for (const o of lights) o.visible = on; } };
}
