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

export function build(k) {
  const hi = k.hi;

  // 1. Three-Tier White Hanbaiyu Marble Base
  // Tier 1: 11.2 x 11.2 m, h = 0.5 m with yellow copper balustrades
  k.color(C.MARBLE);
  k.box(0, 0, 0, 11.2, 0.5, 11.2);
  k.color(BRONZE_RAIL);
  // Railing with openings on 4 sides
  for (const s of [-1, 1]) {
    k.box(-3.5, 0.5, s * 5.4, 3.2, 0.9, 0.15);
    k.box(3.5, 0.5, s * 5.4, 3.2, 0.9, 0.15);
    k.box(s * 5.4, 0.5, -3.5, 0.15, 0.9, 3.2);
    k.box(s * 5.4, 0.5, 3.5, 0.15, 0.9, 3.2);
  }

  // Tier 2: 7.6 x 7.6 m, h = 0.45 m
  k.color(C.MARBLE);
  k.box(0, 0.5, 0, 7.6, 0.45, 7.6);

  // Tier 3: Circular marble plinth (radius 2.2 m, h = 0.45 m)
  k.cyl(0, 0.95, 0, 2.2, 2.2, 0.45, 16);

  // Bronze socket collar at base of pole
  k.color(BRONZE_RAIL);
  k.cyl(0, 1.4, 0, 0.75, 0.55, 0.8, 12);

  // 2. Tapered Stainless Steel Mast (y = 1.4 .. 32.6 m)
  k.color(STEEL_POLE);
  k.cyl(0, 1.4, 0, 0.45, 0.15, 31.2, 12);
  // Gold finial ball on top
  k.color(STAR_GOLD);
  k.sphere(0, 32.7, 0, 0.35, 10, 6);

  // 3. Five-Star Red Flag (flying toward +X / east, size 5.0 x 3.3 m)
  // Mast top is 32.6 m, flag hangs from 32.4 m down to 29.1 m
  k.glow(true).color(FLAG_RED);
  // Gently waved flag cloth
  const flagW = 5.0, flagH = 3.3;
  const nSeg = hi ? 8 : 4;
  for (let i = 0; i < nSeg; i++) {
    const x0 = 0.2 + (i / nSeg) * flagW;
    const x1 = 0.2 + ((i + 1) / nSeg) * flagW;
    const wave0 = Math.sin(i * 0.8) * 0.15;
    const wave1 = Math.sin((i + 1) * 0.8) * 0.15;
    k.quad(
      [x0, 32.4, wave0],
      [x1, 32.4, wave1],
      [x1, 32.4 - flagH, wave1],
      [x0, 32.4 - flagH, wave0]
    );
  }

  // Large golden five-pointed star in canton
  k.color(STAR_GOLD);
  k.box(1.0, 31.3, 0.05, 0.7, 0.7, 0.04);
  // Four smaller stars
  if (hi) {
    k.box(1.7, 31.8, 0.05, 0.28, 0.28, 0.03);
    k.box(2.0, 31.4, 0.05, 0.28, 0.28, 0.03);
    k.box(2.0, 30.9, 0.05, 0.28, 0.28, 0.03);
    k.box(1.7, 30.5, 0.05, 0.28, 0.28, 0.03);
  }
  k.glow(false);

  // Night ground floodlights around base aiming up at flag
  if (hi) {
    k.glow(true).color(0xffffff);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.box(Math.cos(a) * 3.2, 0.96, Math.sin(a) * 3.2, 0.4, 0.25, 0.4);
    }
    k.glow(false);
  }
}
