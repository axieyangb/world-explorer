// feature/beijing-landmarks: Zhengyangmen Gate (正阳门城楼) — 1:1.
// 43.7 m gatehouse (tallest in Beijing): grey-brick battered rampart with vaulted central gateway &
// studded crimson doors, Hanbaiyu marble stringcourse & 16 stone dragon drainage spouts, stepped horse
// ramps with brick parapets & watchmen gates, and a two-story 7x3 bay palace hall with triple-eave
// glazed roof, golden dougong brackets, 正阳门 plaque, and Chiwei dragon-tail ridge ornaments.
import { C, hall, roof, archWall, wallRun, rail, lantern } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 35, hd: 17.5, h: 14.7 },
  { x: 0, z: 0, hw: 25, hd: 13, h: 43.7 },
];

const BRICK = 0x6e7278;
const BRICK_DK = 0x585c62;
const PLAQUE_BLUE = 0x1b3468;

export function build(k) {
  const hi = k.hi;
  const PW = 70.0, PD = 35.0, PH = 14.7;

  // 1. Monumental Ming Grey-Brick Fortress Rampart (城台, y = 0 .. 14.7 m)
  // Hanbaiyu marble base plinth
  k.color(C.MARBLE).box(0, 0, 0, PW + 0.8, 0.9, PD + 0.8);
  // Arched central portal (7.2 m wide, 9.5 m high)
  const arches = [{ x: 0, w: 7.2, h: 9.5 }];
  archWall(k, 0, 0, 0, PW, PH, PD, arches, { color: BRICK, door: BRICK_DK });

  if (hi) {
    // Crimson wooden fortress gate leaves with 9x9 golden door studs (门钉) inside the central archway
    k.color(C.RED).box(-1.8, 0.2, -PD / 2 + 1.8, 3.4, 6.2, 0.35).box(1.8, 0.2, -PD / 2 + 1.8, 3.4, 6.2, 0.35);
    k.color(C.GOLD);
    for (const gx of [-1.8, 1.8]) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
        k.box(gx - 1.1 + c * 0.72, 0.8 + r * 1.05, -PD / 2 + 1.6, 0.14, 0.14, 0.08);
      }
    }
    // White marble stringcourse cornice & 16 carved stone dragon water spouts (螭首) around rampart top
    k.color(C.MARBLE).box(0, PH - 0.55, 0, PW + 0.5, 0.45, PD + 0.5);
    for (let x = -30; x <= 30; x += 8.5) {
      k.box(x, PH - 0.5, -PD / 2 - 0.45, 0.38, 0.32, 0.9).box(x, PH - 0.5, PD / 2 + 0.45, 0.38, 0.32, 0.9);
    }
  }

  // Rampart deck floor (y = 14.7 m)
  k.color(C.PAVE_DK).box(0, PH, 0, PW - 1.2, 0.2, PD - 1.2);

  // Parapet with crenelated battlements along south/east/west & coping along north rim
  wallRun(k, [
    [-PW / 2 + 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, PD / 2 - 0.4],
    [-PW / 2 + 0.4, PD / 2 - 0.4],
  ], 1.3, 0.7, { closed: true, y0: PH, glow: true, base: BRICK });

  // Stepped North Horse Ramps (登城马道, on north face +Z) with brick parapets & top watchman gates
  if (hi) {
    for (const sx of [-1, 1]) {
      for (let s = 0; s < 10; s++) {
        const t = s / 9;
        const rx = sx * (8 + t * 20);
        const ry = (t + 0.1) * PH;
        k.color(BRICK).box(rx, 0, PD / 2 + 2.0, 2.4, ry, 3.8);
        k.color(C.PAVE).box(rx, ry, PD / 2 + 2.0, 2.4, 0.2, 3.8);
        // Sloped outer brick parapet along horse ramp
        k.color(BRICK_DK).box(rx, ry, PD / 2 + 3.6, 2.4, 0.85, 0.45);
      }
      // Small brick watchman pavilion at the head of each horse ramp (y = PH)
      k.color(BRICK).box(sx * 28.5, PH, PD / 2 - 2.2, 4.2, 3.2, 3.6);
      k.color(C.ROOF_G).taper(sx * 28.5, PH + 3.2, PD / 2 - 2.2, 4.8, 4.2, 1.2, 0.6, 1.4);
    }
  }

  // 2. White Marble Gatehouse Podium (y = 14.7 .. 16.0 m) with carved Hanbaiyu balustrade
  k.color(C.MARBLE);
  k.box(0, PH, 0, 48.0, 1.3, 26.0);
  if (hi) {
    rail(k, -23.6, -12.6, 23.6, -12.6, PH + 1.3, { h: 1.05, spacing: 2.2 });
    rail(k, -23.6, 12.6, 23.6, 12.6, PH + 1.3, { h: 1.05, spacing: 2.2 });
    rail(k, -23.6, -12.6, -23.6, 12.6, PH + 1.3, { h: 1.05, spacing: 2.2 });
    rail(k, 23.6, -12.6, 23.6, 12.6, PH + 1.3, { h: 1.05, spacing: 2.2 });
  }

  // 3. Two-Story Gatehouse Hall (7 bays x 3 bays, triple eave / 重檐三滴水)
  // Lower story hall with skirt eave (y = 16.0 .. 26.0 m)
  hall(k, {
    x: 0, z: 0, y0: PH + 1.3, w: 43.0, d: 21.0, bays: 7, baysD: 3, colH: 6.0, colR: 0.45,
    base: { h: 0.8, margin: 2.5, rail: true, stairs: [] },
    roof: "xieshan", double: false, rise: 4.8, lift: 1.2, ribs: 0.9, glow: true, glowRoof: true, doors: "all",
  });

  // Upper story hall with grand double-eave hip-and-gable roof (y = 26.0 .. 43.7 m)
  hall(k, {
    x: 0, z: 0, y0: 25.5, w: 36.0, d: 17.5, bays: 7, baysD: 3, colH: 5.5, colR: 0.42,
    base: { h: 0.6, margin: 2.0, rail: true, stairs: [] },
    roof: "xieshan", double: true, upperH: 2.0, upperInset: 2.8, rise: 8.8, rise2: 5.8,
    ribs: 0.85, beasts: 7, glow: true, glowRoof: true, doors: "all",
  });

  if (hi) {
    // Golden &青绿 Dougong bracket friezes under all 3 eaves + Imperial Plaque "正阳门" + 6 Red Palace Lanterns
    for (const sz of [-1, 1]) {
      k.color(C.DOUGONG);
      k.box(0, 22.2, sz * 10.6, 42.6, 0.55, 0.45);
      k.box(0, 31.0, sz * 8.8, 35.6, 0.55, 0.45);
      k.box(0, 35.2, sz * 6.2, 30.2, 0.55, 0.45);
      // Imperial blue-and-gold plaque "正阳门" under the upper eave
      k.color(C.GOLD).box(0, 34.0, sz * 6.5, 3.2, 1.3, 0.18);
      k.color(PLAQUE_BLUE).box(0, 34.1, sz * 6.55, 2.9, 1.1, 0.16);
      k.glow(true).color(C.GOLD);
      for (const dx of [-0.75, 0, 0.75]) k.box(dx, 34.4, sz * 6.62, 0.32, 0.42, 0.1);
      k.glow(false);
    }
    // 6 Red Palace Lanterns hanging under the lower front eave (-Z)
    for (const bx of [-15, -9, -3, 3, 9, 15]) {
      lantern(k, bx, 20.8, -11.2, 0.9);
    }
    // Green-glazed with gold-trim Chiwei dragon-tail ridge ornaments (正吻) at main roof ridge ends
    for (const sx of [-1, 1]) {
      k.color(C.ROOF_G).box(sx * 11.8, 42.2, 0, 0.9, 1.8, 0.75);
      k.color(C.GOLD).box(sx * 12.1, 42.6, 0, 0.45, 1.2, 0.55);
    }
  }
}
