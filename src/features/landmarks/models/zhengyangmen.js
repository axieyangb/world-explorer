// feature/beijing-landmarks: Zhengyangmen Gate (正阳门城楼) — 1:1.
// 43.7 m gatehouse (tallest in Beijing): grey-brick battered rampart with vaulted central gateway,
// stepped horse ramps, and a two-story 7x3 bay palace hall with triple-eave glazed roof.
import { C, hall, roof, archWall, wallRun, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 35, hd: 17.5, h: 14.7 },
  { x: 0, z: 0, hw: 25, hd: 13, h: 43.7 },
];

const BRICK = 0x6e7278;
const BRICK_DK = 0x585c62;

export function build(k) {
  const hi = k.hi;
  const PW = 70.0, PD = 35.0, PH = 14.7;

  // 1. Monumental Ming Grey-Brick Fortress Rampart (城台, y = 0 .. 14.7 m)
  // Arched central portal (7.2 m wide, 9.5 m high)
  const arches = [{ x: 0, w: 7.2, h: 9.5 }];
  archWall(k, 0, 0, 0, PW, PH, PD, arches, { color: BRICK, door: BRICK_DK });

  // Rampart deck floor (y = 14.7 m)
  k.color(C.PAVE_DK).box(0, PH, 0, PW - 1.2, 0.2, PD - 1.2);

  // Parapet with coping along rampart rim
  wallRun(k, [
    [-PW / 2 + 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, PD / 2 - 0.4],
    [-PW / 2 + 0.4, PD / 2 - 0.4],
  ], 1.3, 0.7, { closed: true, y0: PH, glow: true, base: BRICK });

  // Stepped North Horse Ramps (登城马道, on north face +Z)
  if (hi) {
    k.color(BRICK);
    for (const sx of [-1, 1]) {
      for (let s = 0; s < 7; s++) {
        const t = s / 6;
        const rx = sx * (10 + t * 18);
        const ry = t * PH;
        k.box(rx, 0, PD / 2 + 1.8, 2.8, ry, 3.6);
        k.color(C.PAVE).box(rx, ry, PD / 2 + 1.8, 2.8, 0.2, 3.6);
        k.color(BRICK);
      }
    }
  }

  // 2. White Marble Gatehouse Podium (y = 14.7 .. 16.0 m)
  k.color(C.MARBLE);
  k.box(0, PH, 0, 48.0, 1.3, 26.0);

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
}
