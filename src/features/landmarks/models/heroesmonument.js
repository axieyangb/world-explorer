// feature/beijing-landmarks: Monument to the People's Heroes (人民英雄纪念碑) — 1:1.
// 37.94 m granite obelisk in the center of Tiananmen Square, on a double-tiered white-marble
// Sumeru terrace with 8 historical marble bas-reliefs and gold inscriptions ("人民英雄永垂不朽").
import { C, terrace, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 18, hd: 18, h: 4.5 },
  { x: 0, z: 0, hw: 3.5, hd: 2.5, h: 37.94 },
];

const GRANITE = 0x8a847a;
const GRANITE_LT = 0xa39d93;
const RELIEF = 0xe8e4da;
const GOLD = 0xdfb438;

export function build(k) {
  const hi = k.hi;

  // 1. Two-Tier White Hanbaiyu Marble Terrace Base
  // Lower terrace: 50 x 50 m, h = 1.6 m with marble balustrades
  terrace(k, 0, 0, 0, 50, 50, 1.6, { rail: true, glow: true, railSpacing: 2.2 });

  // Upper terrace: 32 x 32 m, h = 1.8 m with balustrades
  terrace(k, 0, 1.6, 0, 32, 32, 1.8, { rail: true, glow: true, railSpacing: 2.0 });

  // 2. Sumeru Pedestal with 8 Historical Bas-Relief Panels (y = 3.4 .. 6.5 m)
  k.color(C.MARBLE);
  k.box(0, 3.4, 0, 13.5, 0.8, 11.5);
  // Relief waist band (y = 4.2 .. 5.8 m)
  k.color(RELIEF);
  k.box(0, 4.2, 0, 13.0, 1.6, 11.0);
  k.color(C.MARBLE_SH);
  // Bas-relief carvings around the perimeter
  if (hi) {
    // North & South reliefs
    for (const zs of [-1, 1]) {
      for (let i = -2; i <= 2; i++) {
        k.box(i * 2.3, 4.4, zs * 5.56, 1.9, 1.2, 0.1);
      }
    }
    // East & West reliefs
    for (const xs of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        k.box(xs * 6.56, 4.4, i * 2.6, 0.1, 1.2, 2.2);
      }
    }
  }
  // Pedestal cornice cap
  k.color(C.MARBLE).box(0, 5.8, 0, 13.8, 0.8, 11.8);

  // 3. Second Pedestal (Granite Plinth)
  k.color(GRANITE);
  k.box(0, 6.6, 0, 9.6, 1.8, 7.6);
  k.box(0, 8.4, 0, 8.8, 1.4, 6.8);

  // 4. Stele Shaft (碑身, y = 9.8 .. 35.5 m)
  // Tapered rectangular granite column
  k.color(GRANITE_LT);
  k.taper(0, 9.8, 0, 6.8, 5.0, 5.8, 4.2, 25.7);

  // Inscriptions: North face (+Z, facing Tiananmen Gate): "人民英雄永垂不朽"
  // Drawn as gleaming gold characters
  k.glow(true).color(GOLD);
  for (let i = 0; i < 8; i++) {
    const cy = 32.0 - i * 2.6;
    k.box(0, cy, 2.35, 1.2, 1.5, 0.08);
    if (hi) {
      k.box(0, cy, 2.38, 1.4, 0.3, 0.05);
      k.box(0, cy, 2.38, 0.3, 1.6, 0.05);
    }
  }

  // South face (-Z): Zhou Enlai calligraphy tablet
  for (let col = -2; col <= 2; col++) {
    for (let r = 0; r < 6; r++) {
      k.box(col * 0.7, 26.0 - r * 1.8, -2.35, 0.45, 0.75, 0.06);
    }
  }
  k.glow(false);

  // 5. Crown (碑顶, y = 35.5 .. 37.94 m): Chinese small hip roof in granite
  k.color(GRANITE);
  k.box(0, 35.5, 0, 6.4, 0.6, 4.8);
  k.pyramid(0, 36.1, 0, 6.8, 5.2, 1.84);
}
