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
const PINE_GREEN = 0x2d5a34;

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
    if (hi) {
      // Stepped granite stair treads + central imperial cloud-carved ramp (丹陛石) + marble stair balustrades
      for (let s = 0; s < 8; s++) {
        const sy = s * 0.52, sz = zs * (63.5 - s * 1.3);
        k.color(GRANITE_BASE).box(0, sy, sz, 44, 0.52, 1.4);
      }
      k.color(MARBLE_WHITE).taper(0, 0.1, zs * 58.5, 6.4, 11.5, 6.4, 2.0, 4.15, 0, -zs * 4.5);
      for (const rx of [-22, -7.5, 7.5, 22]) {
        k.color(MARBLE_WHITE).taper(rx, 0.4, zs * 58.5, 0.65, 11.5, 0.65, 2.0, 4.5, 0, -zs * 4.5);
      }
    }
  }

  // White Hanbaiyu marble balustrades around both podium tiers
  if (hi) {
    rail(k, -56.4, 56.4, -56.4, 2.2, 22, 1.15);
    rail(k, -56.4, 56.4, 56.4, 2.2, 22, 1.15);
    rail(k, -56.4, -56.4, 56.4, 2.2, 22, 1.15, true);
    rail(k, 56.4, -56.4, 56.4, 2.2, 22, 1.15, true);

    rail(k, -53.4, 53.4, -53.4, 4.2, 20, 1.15);
    rail(k, -53.4, 53.4, 53.4, 4.2, 20, 1.15);
    rail(k, -53.4, -53.4, 53.4, 4.2, 20, 1.15, true);
    rail(k, 53.4, -53.4, 53.4, 4.2, 20, 1.15, true);

    // 4 Sculpted heroic multi-figure revolutionary statuary groups on red granite plinths (N & S plazas)
    for (const zs of [-1, 1]) {
      for (const xs of [-30, 30]) {
        const gz = zs * 59.5;
        k.color(GRANITE_BASE).box(xs, 0, gz, 11.5, 2.6, 5.2);
        k.color(0xc8bfa8).box(xs, 2.6, gz, 10.2, 0.6, 4.2);
        // Sculpted ensemble of 5 heroic figures + banner
        for (let f = -2; f <= 2; f++) {
          const fx = xs + f * 1.7, fh = 2.8 + (2 - Math.abs(f)) * 0.45;
          k.color(0xd8d0c0).cyl(fx, 3.2, gz, 0.55, 0.42, fh, 8);
          k.sphere(fx, 3.2 + fh + 0.32, gz, 0.34, 8, 6);
        }
        // Raised sculpted flag banner above central figure
        k.color(0xd8d0c0).box(xs + 0.6, 5.8, gz - zs * 0.3, 3.2, 1.8, 0.35);
      }
      // Symmetrical Evergreen Pine Bosco groves flanking East & West sides
      for (let pz = -42; pz <= 42; pz += 14) {
        k.color(0x5a4332).cyl(zs * 62, 0, pz, 0.45, 0.35, 3.2, 6);
        k.color(PINE_GREEN).cone(zs * 62, 2.4, pz, 3.4, 5.5, 8).cone(zs * 62, 5.0, pz, 2.6, 4.2, 8);
      }
    }
  }

  // 2. Colonnade of 44 Monumental Square Columns (y = 4.2 .. 21.7 m, H = 17.5 m)
  const half = 47.7;
  const colPitch = (half * 2) / 11;
  const drawCol = (cx, cz) => {
    k.color(COL_GRANITE).box(cx, 4.2, cz, 2.2, 17.5, 2.2);
    if (hi) {
      // Carved lotus plinth base & gilded chrysanthemum frieze capital
      k.color(GRANITE_BASE).box(cx, 4.2, cz, 2.75, 0.95, 2.75);
      k.color(MARBLE_WHITE).box(cx, 5.15, cz, 2.45, 0.45, 2.45);
      k.color(GOLD).box(cx, 20.9, cz, 2.55, 0.8, 2.55);
      // Vertical flute bevel strips on column faces
      k.color(0xc2b6a4);
      k.box(cx, 5.6, cz, 2.28, 15.2, 0.65);
      k.box(cx, 5.6, cz, 0.65, 15.2, 2.28);
    }
  };

  for (let i = 0; i <= 11; i++) {
    const pos = -half + i * colPitch;
    drawCol(pos, -half);
    drawCol(pos, half);
    if (i > 0 && i < 11) {
      drawCol(-half, pos);
      drawCol(half, pos);
    }
  }

  // Recessed central memorial hall core (y = 4.2 .. 22 m)
  k.color(0xcfc6b6).box(0, 4.2, 0, 82, 17.5, 82);
  if (hi) {
    // Tall bronze-lattice ceremonial windows & 3 grand portals on N & S facades
    for (const zs of [-1, 1]) {
      const wz = zs * 41.15;
      for (let i = -4; i <= 4; i++) {
        const wx = i * colPitch;
        if (Math.abs(i) <= 1) {
          // Grand brass & red-wood entrance portal
          k.glow(false).color(0x5c221c).box(wx, 4.2, wz, 5.2, 9.8, 0.45);
          k.glow(true).color(GOLD).box(wx, 13.8, wz, 5.6, 0.7, 0.55);
          k.color(0xffe4a0).box(wx, 4.6, wz, 4.2, 8.6, 0.25);
        } else {
          // Tall granite-framed bronze grille window
          k.glow(false).color(0x3a322c).box(wx, 5.8, wz, 4.4, 12.8, 0.35);
          k.glow(true).color(0xffdf9a).box(wx, 6.2, wz, 3.6, 11.8, 0.2);
        }
      }
      k.glow(false);
    }
  }

  // Inscription Plaque on North & South Facades ("毛主席纪念堂", white marble + gold calligraphy)
  for (const zs of [-1, 1]) {
    k.color(MARBLE_WHITE).box(0, 17.6, zs * 48.2, 18.0, 3.4, 0.6);
    k.glow(true).color(GOLD).box(0, 17.6, zs * 48.1, 18.6, 3.8, 0.35);
    k.glow(false).color(MARBLE_WHITE).box(0, 17.8, zs * 48.3, 17.4, 3.0, 0.5);
    k.glow(true).color(GOLD);
    for (let i = 0; i < 6; i++) {
      k.box(-6.0 + i * 2.4, 18.4, zs * 48.6, 1.4, 1.6, 0.18);
    }
    k.glow(false);
  }

  // 3. Double-Tiered Glazed Eaves & Entablature (y = 21.7 .. 33.6 m)
  k.color(MARBLE_WHITE).box(0, 21.7, 0, 99, 1.2, 99);
  k.color(C.BRACKET).box(0, 22.9, 0, 102, 1.1, 102);
  k.color(ROOF_YELLOW).taper(0, 24.0, 0, 107.5, 107.5, 98, 98, 2.1);

  // Upper recessed attic wall with golden lattice frieze panels
  k.color(MARBLE_WHITE).box(0, 26.1, 0, 94, 3.6, 94);
  if (hi) {
    // Decorative golden sunflower & dougong frieze cartridges around both eaves
    k.glow(true).color(GOLD);
    for (let i = -10; i <= 10; i += 2) {
      const p = i * 4.4;
      k.box(p, 27.2, -47.2, 2.8, 1.4, 0.35);
      k.box(p, 27.2, 47.2, 2.8, 1.4, 0.35);
      k.box(-47.2, 27.2, p, 0.35, 1.4, 2.8);
      k.box(47.2, 27.2, p, 0.35, 1.4, 2.8);
    }
    k.glow(false);
  }

  // Upper glazed roof eave with projecting overhang & corner hip ridges
  k.color(C.BRACKET).box(0, 29.7, 0, 97, 1.0, 97);
  k.glow(true).color(ROOF_YELLOW).taper(0, 30.7, 0, 103.5, 103.5, 93, 93, 2.3);
  k.glow(false);

  // Flat roof terrace & golden-crowned skylight lantern
  k.color(0xb0a89b).box(0, 33.0, 0, 91, 0.8, 91);
  if (hi) {
    k.color(MARBLE_WHITE).box(0, 33.8, 0, 42, 1.2, 42);
    k.color(ROOF_YELLOW).box(0, 35.0, 0, 44, 0.5, 44);
  }
}
