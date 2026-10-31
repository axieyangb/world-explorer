// feature/beijing-landmarks: Tiananmen Square Flagpole (天安门广场国旗杆) — 1:1.
// 32.6 m stainless steel flagpole on a 3-tier white-marble base with yellow copper railings,
// flying the Five-Star Red Flag (5.0 x 3.3 m) illuminated by night floodlights.
import { C, rail } from "../cn_arch.js";

export const lodDist = 1400;
export const glowStrength = 2.5;

export const colliders = [
  { x: 0, z: 0, r: 5.5, h: 32.6 },
];

const STEEL_POLE = 0xe8eef5;
const BRONZE_RAIL = 0xd8b248;
const FLAG_RED = 0xde2910;
const STAR_GOLD = 0xffde00;
const OLIVE_GREEN = 0x264428;

export function build(k) {
  const hi = k.hi;

  // 1. Ceremonial Red Granite & Dark Grey Marble Outer Cordon Apron
  k.color(0x885248).box(0, -0.35, 0, 22.0, 0.4, 22.0);
  k.color(0x52565c).box(0, 0.02, 0, 17.5, 0.12, 17.5);

  // Three-Tier White Hanbaiyu Marble Base
  // Tier 1: 11.2 x 11.2 m, h = 0.55 m with carved汉白玉 balustrades & openings on 4 sides
  k.color(C.MARBLE);
  k.box(0, 0.12, 0, 11.2, 0.55, 11.2);

  if (hi) {
    // White marble Hanbaiyu balustrades with cloud-carved corner & gate newel posts on 4 sides
    for (const s of [-1, 1]) {
      rail(k, -5.3, -1.8, s * 5.3, 0.67, 5, 1.05);
      rail(k, 1.8, 5.3, s * 5.3, 0.67, 5, 1.05);
      rail(k, s * 5.3, -5.3, -1.8, 0.67, 5, 1.05, true);
      rail(k, s * 5.3, 1.8, 5.3, 0.67, 5, 1.05, true);
      // 4 Directional ceremonial steps
      for (let st = 0; st < 3; st++) {
        const w = 3.4, d = 0.35, h = (st + 1) * 0.18, o = 5.95 - st * 0.32;
        k.color(C.MARBLE).box(0, 0.12, s * o, w, h, d);
        k.box(s * o, 0.12, 0, d, h, w);
      }
    }
    // Outer brass & olive-green ceremonial stanchion posts & velvet cordon ropes (56 ethnic unity bollards)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, na = ((i + 1) / 16) * Math.PI * 2;
      const r = 9.4;
      const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
      const x1 = Math.cos(na) * r, z1 = Math.sin(na) * r;
      k.color(BRONZE_RAIL).cyl(x0, 0.12, z0, 0.12, 0.09, 1.05, 8);
      k.color(STAR_GOLD).sphere(x0, 1.22, z0, 0.13, 8, 6);
      k.color(FLAG_RED).cable([x0, 0.92, z0], [x1, 0.92, z1], 0.04, 0.14, 6, 6);
    }
  } else {
    k.color(BRONZE_RAIL);
    for (const s of [-1, 1]) {
      k.box(-3.5, 0.67, s * 5.4, 3.2, 0.9, 0.15);
      k.box(3.5, 0.67, s * 5.4, 3.2, 0.9, 0.15);
      k.box(s * 5.4, 0.67, -3.5, 0.15, 0.9, 3.2);
      k.box(s * 5.4, 0.67, 3.5, 0.15, 0.9, 3.2);
    }
  }

  // Tier 2: 7.6 x 7.6 m, h = 0.5 m with golden bronze balustrade
  k.color(C.MARBLE).box(0, 0.67, 0, 7.6, 0.5, 7.6);
  if (hi) {
    k.color(BRONZE_RAIL);
    for (const s of [-1, 1]) {
      k.box(-2.3, 1.17, s * 3.6, 2.2, 0.78, 0.12);
      k.box(2.3, 1.17, s * 3.6, 2.2, 0.78, 0.12);
      k.box(s * 3.6, 1.17, -2.3, 0.12, 0.78, 2.2);
      k.box(s * 3.6, 1.17, 2.3, 0.12, 0.78, 2.2);
    }
    // 4 PLA Honor Guard Sentries standing at attention on the 4 corners of the podium
    for (const [gx, gz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]]) {
      k.color(0xd8cfc2).box(gx, 1.17, gz, 0.85, 0.14, 0.85);
      k.color(OLIVE_GREEN).cyl(gx, 1.31, gz, 0.2, 0.24, 1.35, 8);
      k.color(STAR_GOLD).box(gx, 2.15, gz, 0.44, 0.08, 0.34); // golden aiguillette & belt
      k.color(0xeac8a8).sphere(gx, 2.82, gz, 0.16, 8, 6);
      k.color(OLIVE_GREEN).cyl(gx, 2.9, gz, 0.19, 0.22, 0.14, 8);
    }
  }

  // Tier 3: Octagonal & Circular Hanbaiyu Sumpter (须弥座) Plinth
  k.color(C.MARBLE);
  k.prism(0, 1.17, 0, 2.55, 0.42, 8, Math.PI / 8);
  k.cyl(0, 1.59, 0, 2.1, 1.95, 0.48, hi ? 24 : 16);

  // Ornate Gilded Bronze Lotus Socket Collar at base of pole
  k.color(BRONZE_RAIL);
  k.cyl(0, 2.07, 0, 0.85, 0.58, 0.95, hi ? 20 : 12);
  if (hi) {
    k.color(STAR_GOLD).torus(0, 2.15, 0, 0.82, 0.1, 20, 8).torus(0, 2.95, 0, 0.58, 0.08, 20, 8);
  }

  // 2. Tapered Seamless Stainless Steel Mast (y = 2.0 .. 32.6 m)
  k.color(STEEL_POLE);
  k.cyl(0, 2.0, 0, 0.45, 0.15, 30.6, hi ? 24 : 12);
  // Gold finial ball & halyard truck at apex
  k.glow(true).color(STAR_GOLD).sphere(0, 32.75, 0, 0.38, 14, 10);
  k.glow(false);

  // 3. Five-Star Red Flag (flying toward +X / east, size 5.0 x 3.3 m)
  k.glow(true).color(FLAG_RED);
  const flagW = 5.0, flagH = 3.3;
  const nSeg = hi ? 16 : 4;
  for (let i = 0; i < nSeg; i++) {
    const x0 = 0.18 + (i / nSeg) * flagW;
    const x1 = 0.18 + ((i + 1) / nSeg) * flagW;
    const wave0 = Math.sin(i * 0.55) * 0.18;
    const wave1 = Math.sin((i + 1) * 0.55) * 0.18;
    k.quad2(
      [x0, 32.4, wave0],
      [x1, 32.4, wave1],
      [x1, 32.4 - flagH, wave1],
      [x0, 32.4 - flagH, wave0]
    );
  }

  // Large golden 5-pointed star in canton + 4 smaller stars arranged in an arc facing the big star
  k.color(STAR_GOLD);
  if (hi) {
    const drawStar = (cx, cy, rOut, rIn, rot = 0) => {
      const zOff = Math.sin(((cx - 0.18) / flagW) * 16 * 0.55) * 0.18;
      for (const sz of [-0.04, 0.04]) {
        for (let p = 0; p < 5; p++) {
          const a0 = rot + (p / 5) * Math.PI * 2 + Math.PI / 2;
          const aL = a0 + Math.PI / 5, aR = a0 - Math.PI / 5;
          k.tri(
            [cx, cy, zOff + sz],
            [cx + Math.cos(a0) * rOut, cy + Math.sin(a0) * rOut, zOff + sz],
            [cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn, zOff + sz]
          );
          k.tri(
            [cx, cy, zOff + sz],
            [cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn, zOff + sz],
            [cx + Math.cos(a0) * rOut, cy + Math.sin(a0) * rOut, zOff + sz]
          );
        }
      }
    };
    drawStar(1.02, 31.55, 0.48, 0.19, 0);
    drawStar(1.85, 32.05, 0.17, 0.07, 0.45);
    drawStar(2.18, 31.72, 0.17, 0.07, 0.85);
    drawStar(2.18, 31.22, 0.17, 0.07, 0.15);
    drawStar(1.85, 30.88, 0.17, 0.07, -0.35);
  } else {
    k.box(1.0, 31.3, 0.05, 0.7, 0.7, 0.04);
  }
  k.glow(false);

  // Night ground floodlight banks around base aiming up at flag
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const fx = Math.cos(a) * 4.4, fz = Math.sin(a) * 4.4;
      k.glow(false).color(0x2a2e34).box(fx, 0.67, fz, 0.52, 0.32, 0.52);
      k.glow(true).color(0xfff8e6).box(fx, 0.96, fz, 0.38, 0.12, 0.38);
    }
    k.glow(false);
  }
}
