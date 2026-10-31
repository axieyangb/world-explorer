// feature/famous-landmarks: CN Tower, Toronto — 1:1 (antenna tip 553.3 m).
// Hexagonal hollow concrete core buttressed by three tapering legs (Y plan) that merge into the shaft
// below the main pod; the 7-storey main pod (white radome doughnut with geodesic panel ribs, glazed
// observation/360 restaurant rings, Glass Floor panels, and EdgeWalk overhead safety rail ring ~342-360 m),
// the slender upper shaft to the SkyPod (447 m), the 102 m steel antenna, and the base entrance plaza & pool.

const CONC = 0xcbc6bc, CONC2 = 0xbdb7ac, WHITE = 0xeeeeea, PODGL = 0x3f4a55, STEEL = 0xa7adb3, STEEL_LT = 0xd2d6da;
const GLASS_FL = 0x76b5d8, WATER = 0x3a89b8, RED = 0xd63629;

export const lodDist = 2000;
export const glowStrength = 2.6;

export const colliders = [
  { x: 0, z: 0, r: 22, h: 60 },
  { x: 0, z: 0, r: 13, h: 200 },
  { x: 0, z: 0, r: 8, h: 335 },
  { x: 0, z: 0, r: 22, h: 362 },
  { x: 0, z: 0, r: 5, h: 455 },
];

const LEG_ANG = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
const LEG_TOP = 335;
const legLen = (y) => 7 + 27 * Math.pow(Math.max(0, 1 - y / LEG_TOP), 1.6);
const legW = (y) => 9.5 - 3.5 * (y / LEG_TOP);
const coreR = (y) => 8.2 - 1.2 * Math.min(1, y / LEG_TOP);

function section(y) {
  const pts = [];
  const L = legLen(y), w = legW(y) / 2, r = coreR(y);
  for (let i = 0; i < 3; i++) {
    const a = LEG_ANG[i], c = Math.cos(a), s = Math.sin(a);
    const P = (u, v) => [u * c - v * s, u * s + v * c];
    const u0 = Math.sqrt(Math.max(0.1, r * r - w * w)) * 0.95;
    pts.push(P(u0, -w), P(L - w * 0.5, -w), P(L, -w * 0.45), P(L, w * 0.45), P(L - w * 0.5, w));
    pts.push(P(u0, w));
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
  const hi = k.hi, seg = hi ? 28 : 10;
  const ys = [];
  const nS = hi ? 20 : 7;
  for (let i = 0; i <= nS; i++) ys.push(LEG_TOP * Math.pow(i / nS, 0.85));
  k.color(CONC);
  loftSections(k, ys);
  if (hi) {
    k.glow(true).color(0xb8b3aa);
    for (let i = 0; i < 3; i++) {
      const a = LEG_ANG[i], c = Math.cos(a), s = Math.sin(a);
      const pts = [];
      for (const y of ys) pts.push([(legLen(y) + 0.15) * c, y, (legLen(y) + 0.15) * s]);
      for (let j = 0; j < pts.length - 1; j++) k.strut(pts[j], pts[j + 1], 1.2);
    }
    k.glow(false);
    for (let i = 0; i < 3; i++) {
      const a = LEG_ANG[i] + Math.PI / 3;
      k.color(0x59636c);
      for (let j = 0; j < ys.length - 1; j++) {
        const y0 = ys[j], y1 = ys[j + 1];
        const r0 = coreR(y0) + 0.4, r1 = coreR(y1) + 0.4;
        k.strut([Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(a) * r1, y1, Math.sin(a) * r1], 2.2);
      }
      const cy = 95 + i * 85, cr = coreR(cy) + 0.9;
      k.glow(true).color(0xffe9b5).box(Math.cos(a) * cr, cy, Math.sin(a) * cr, 2.2, 3.8, 2.2).glow(false);
    }
    k.color(CONC2).cyl(0, 0, 0, 32, 32, 4.2, 6, { smooth: false, phase: Math.PI / 6 });
    k.glow(true).color(WATER).cyl(0, 0.2, -26, 14, 14, 0.35, 16);
    k.color(GLASS_FL).box(0, 4.2, -24, 18, 3.6, 12);
    k.glow(false).color(WHITE).box(0, 7.8, -24, 20, 0.6, 14);
  }
  // --- main pod (~330-362 m)
  k.color(CONC2).lathe(0, LEG_TOP - 8, 0, [[7.2, 0], [12, 4], [17, 7]], seg);
  if (hi) {
    k.glow(true).color(GLASS_FL).lathe(0, LEG_TOP - 1.2, 0, [[13.5, 0], [16.8, 0.3]], seg, { caps: false }).glow(false);
  }
  k.color(WHITE).lathe(0, LEG_TOP - 1, 0, [[17, 0], [20.5, 1.5], [22, 4], [21.5, 6.5], [19.5, 8]], seg);
  k.color(CONC).lathe(0, LEG_TOP + 7, 0, [[19, 0], [21.5, 0.6], [21.5, 2]], seg);
  k.glow(true).color(PODGL).lathe(0, LEG_TOP + 9, 0, [[21.5, 0], [22.5, 4.5], [21.8, 7]], seg);
  k.glow(false);
  k.color(CONC2).lathe(0, LEG_TOP + 16, 0, [[21.8, 0], [21.8, 1.4], [20.5, 1.4]], seg);
  k.glow(true).color(PODGL).lathe(0, LEG_TOP + 17.4, 0, [[20.5, 0], [21, 3.6], [20, 5]], seg);
  k.glow(false);
  k.color(CONC).lathe(0, LEG_TOP + 22.4, 0, [[20, 0], [16, 3], [9, 5.5], [6.5, 6]], seg);

  if (hi) {
    k.color(CONC2);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.strut([c * 20.6, LEG_TOP + 0.5, s * 20.6], [c * 22.1, LEG_TOP + 3.0, s * 22.1], 0.18);
      k.strut([c * 22.1, LEG_TOP + 3.0, s * 22.1], [c * 19.6, LEG_TOP + 7.0, s * 19.6], 0.18);
    }
    k.color(STEEL);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.strut([c * 21.6, LEG_TOP + 9.0, s * 21.6], [c * 22.6, LEG_TOP + 13.5, s * 22.6], 0.16);
      k.strut([c * 22.6, LEG_TOP + 13.5, s * 22.6], [c * 21.9, LEG_TOP + 16.0, s * 21.9], 0.16);
      k.strut([c * 20.6, LEG_TOP + 17.4, s * 20.6], [c * 20.1, LEG_TOP + 22.4, s * 20.1], 0.16);
    }
    const ewY = LEG_TOP + 22.5, ewR = 19.2;
    k.color(STEEL_LT).cyl(0, ewY, 0, ewR + 0.8, ewR + 0.8, 0.25, 28);
    k.color(RED).cyl(0, ewY + 3.4, 0, ewR, ewR, 0.22, 28, { caps: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.color(STEEL).strut([c * (ewR - 2.2), ewY + 1.2, s * (ewR - 2.2)], [c * ewR, ewY + 3.4, s * ewR], 0.24);
    }
  }

  // --- upper shaft to the SkyPod and antenna base
  k.color(CONC).lathe(0, LEG_TOP + 28, 0, [[6.4, 0], [5.8, 60], [5.4, 84]], 6, { smooth: false, phase: Math.PI / 6 });
  // SkyPod (447 m)
  k.color(CONC2).lathe(0, 440, 0, [[5.6, 0], [8.5, 3], [9.2, 5]], seg);
  k.glow(true).color(PODGL).lathe(0, 445, 0, [[9.2, 0], [9.6, 2.4], [9.0, 4.5]], seg).glow(false);
  k.color(CONC2).lathe(0, 449.5, 0, [[9.0, 0], [7, 2.5], [5, 4]], seg);
  k.color(CONC).lathe(0, 453.5, 0, [[5, 0], [4.6, 3.5]], hi ? 12 : 6);
  if (hi) {
    k.color(STEEL_LT);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.strut([c * 9.3, 445, s * 9.3], [c * 9.1, 449.5, s * 9.1], 0.14);
    }
  }
  // --- antenna 457 -> 553.3 m (steel, stepped)
  k.color(STEEL).lathe(0, 457, 0, [[3.8, 0], [3.4, 22], [2.8, 22], [2.5, 48], [1.9, 48], [1.6, 72], [1.0, 72], [0.7, 90], [0.15, 96.3]], hi ? 12 : 5);
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
