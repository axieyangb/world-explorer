// feature/beijing-landmarks: Chairman Mao Memorial Hall (毛主席纪念堂) — 1:1.
// 105 x 105 m square monument (33.6 m tall) with 44 monumental square granite columns,
// double-tiered yellow glazed eaves, and white-marble base with sculpted statuary groups.
import { C, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 52.5, hd: 52.5, h: 33.6 },
];

const GRANITE_BASE = 0x8a7a6c;
const MARBLE_WHITE = 0xebe8df;
const COL_GRANITE = 0xd8cebe;
const ROOF_YELLOW = 0xd9a021;
const GOLD = 0xdfb438;

export function build(k) {
  const hi = k.hi;

  // 1. Two-Tiered Elevated Podium Base (y = 0 .. 4.2 m)
  k.color(GRANITE_BASE);
  k.box(0, 0, 0, 114, 2.2, 114);
  k.color(MARBLE_WHITE);
  k.box(0, 2.2, 0, 108, 2.0, 108);

  // Broad ceremonial entrance stairs (North & South)
  k.color(GRANITE_BASE);
  for (const zs of [-1, 1]) {
    k.box(0, 0, zs * 59, 48, 2.2, 12);
    k.box(0, 2.2, zs * 57, 44, 2.0, 8);
  }

  // Flanking revolutionary statuary groups (North & South entrance plazas)
  if (hi) {
    k.color(0x7a746e);
    for (const zs of [-1, 1]) {
      for (const xs of [-28, 28]) {
        k.box(xs, 2.2, zs * 57, 8, 3.8, 3.5);
      }
    }
  }

  // 2. Colonnade of 44 Monumental Square Columns (y = 4.2 .. 21.7 m, H = 17.5 m)
  // Perimeter spacing: 12 columns per side (pitch = 105 / 11 ≈ 9.54 m)
  const half = 47.7;
  const colPitch = (half * 2) / 11;
  k.color(COL_GRANITE);

  for (let i = 0; i <= 11; i++) {
    const pos = -half + i * colPitch;
    // N & S facades
    k.box(pos, 4.2, -half, 2.2, 17.5, 2.2);
    k.box(pos, 4.2, half, 2.2, 17.5, 2.2);
    // E & W facades (omit corners to avoid double-draw)
    if (i > 0 && i < 11) {
      k.box(-half, 4.2, pos, 2.2, 17.5, 2.2);
      k.box(half, 4.2, pos, 2.2, 17.5, 2.2);
    }
  }

  // Recessed central memorial hall core (y = 4.2 .. 22 m)
  k.color(0x3e4248);
  k.box(0, 4.2, 0, 82, 17.5, 82);

  // Inscription Plaque on North Facade ("毛主席纪念堂", white marble + gold calligraphy)
  k.color(MARBLE_WHITE);
  k.box(0, 18.0, -41.2, 18.0, 3.2, 0.4);
  k.glow(true).color(GOLD);
  for (let i = 0; i < 6; i++) {
    k.box(-6.0 + i * 2.4, 18.4, -41.5, 1.4, 1.6, 0.1);
  }
  k.glow(false);

  // 3. Double-Tiered Glazed Eaves & Entablature (y = 21.7 .. 33.6 m)
  // Lower eave cornice band
  k.color(ROOF_YELLOW);
  k.box(0, 21.7, 0, 107, 1.8, 107);
  k.color(C.BRACKET);
  k.box(0, 23.5, 0, 104, 1.2, 104);

  // Upper recessed attic wall
  k.color(MARBLE_WHITE);
  k.box(0, 24.7, 0, 94, 4.5, 94);

  // Upper glazed roof eave with projecting overhang
  k.glow(true).color(ROOF_YELLOW);
  k.box(0, 29.2, 0, 102, 2.4, 102);
  k.glow(false);

  // Flat roof terrace & parapet
  k.color(0xb0a89b);
  k.box(0, 31.6, 0, 92, 2.0, 92);
}
