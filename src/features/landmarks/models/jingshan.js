// feature/beijing-landmarks: Wanchun Pavilion, Jingshan (景山万春亭) — 1:1.
// 26 m imperial summit pavilion overlooking the Forbidden City from Jingshan peak:
// 2-tier white-marble terrace, vermilion colonnade, triple-eave yellow glazed roof with gold finial.
import { C, hall, roof, terrace, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, hw: 14, hd: 14, h: 26 },
];

const GOLD_FINIAL = 0xffdf48;

export function build(k) {
  const hi = k.hi;

  // 1. Two-Tier Marble & Stone Terrace on Summit (y = 0 .. 3.2 m)
  // Tier 1: 32 x 28 m, h = 1.6 m with marble balustrades
  terrace(k, 0, 0, 0, 32, 28, 1.6, { rail: true, glow: true, railSpacing: 2.0 });

  // South overlook projection platform facing Forbidden City (-Z)
  k.color(C.MARBLE);
  k.box(0, 0, -15.5, 14.0, 1.6, 3.5);
  rail(k, -6.8, -17.2, 6.8, -17.2, 1.6, { h: 1.05, spacing: 1.8 });

  // Tier 2: 24 x 22 m, h = 1.6 m with balustrades
  terrace(k, 0, 1.6, 0, 24, 22, 1.6, { rail: true, glow: true, railSpacing: 1.8 });

  // 2. Triple-Eave Summit Pavilion (y = 3.2 .. 26.0 m)
  // Ground floor hall with lower skirt eave (y = 3.2 .. 10.5 m)
  hall(k, {
    x: 0, z: 0, y0: 3.2, w: 17.0, d: 17.0, bays: 5, baysD: 5, colH: 4.8, colR: 0.36,
    base: { h: 0.4, margin: 1.8, rail: true, stairs: [] },
    roof: "xieshan", double: false, rise: 3.2, lift: 1.0, ribs: 0.7, glow: true, glowRoof: true, doors: "all",
  });

  // Middle floor with waist skirt eave (y = 9.5 .. 16.5 m)
  k.color(C.RED);
  k.box(0, 9.5, 0, 12.0, 3.8, 12.0);
  roof(k, 0, 12.8, 0, 8.2, 8.2, 3.0, {
    type: "pyramid", lift: 1.1, glow: true, tEnd: 0.65,
  });

  // Upper floor with grand pyramid roof and gold finial (y = 15.5 .. 26.0 m)
  hall(k, {
    x: 0, z: 0, y0: 15.5, w: 9.6, d: 9.6, bays: 3, baysD: 3, colH: 3.6, colR: 0.32,
    base: { h: 0.3, margin: 1.0, rail: false, stairs: [] },
    roof: "pyramid", double: false, rise: 5.5, lift: 1.3, ribs: 0.6, glow: true, glowRoof: true, doors: "all",
  });

  // Gilded treasure finial on the summit (鎏金宝顶, y = 23.5 .. 26.0 m)
  k.glow(true).color(GOLD_FINIAL);
  k.sphere(0, 24.5, 0, 1.1, 14, 8);
  k.cyl(0, 25.4, 0, 0.45, 0.1, 1.2, 10);
  k.glow(false);
}
