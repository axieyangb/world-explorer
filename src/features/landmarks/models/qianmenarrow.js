// feature/beijing-landmarks: Zhengyangmen Arrow Tower (正阳门箭楼) — 1:1.
// 35.4 m arrow fortress south of Qianmen gate: grey-brick rampart with arched portal and iron
// portcullis, "front-tower rear-hall" structure with 4 tiers of arrow slits (86 windows) and glazed hip roof.
import { C, roof, archWall, wallRun, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 31, hd: 14, h: 12.0 },
  { x: 0, z: 0, hw: 22, hd: 11, h: 35.4 },
];

const BRICK = 0x6e7278;
const BRICK_DK = 0x585c62;
const SHUTTER = 0x245e3a;

export function build(k) {
  const hi = k.hi;
  const PW = 62.0, PD = 28.0, PH = 12.0;

  // 1. Grey-Brick Rampart Fortress Base (城台, y = 0 .. 12.0 m)
  const arches = [{ x: 0, w: 6.4, h: 8.0 }];
  archWall(k, 0, 0, 0, PW, PH, PD, arches, { color: BRICK, door: BRICK_DK });

  // Rampart deck floor & coping
  k.color(C.PAVE_DK).box(0, PH, 0, PW - 1.2, 0.2, PD - 1.2);
  wallRun(k, [
    [-PW / 2 + 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, -PD / 2 + 0.4],
    [PW / 2 - 0.4, PD / 2 - 0.4],
    [-PW / 2 + 0.4, PD / 2 - 0.4],
  ], 1.2, 0.6, { closed: true, y0: PH, glow: true, base: BRICK });

  // 2. Arrow Tower Structure ("前楼后厦" y = 12.0 .. 35.4 m)
  // Front Tower Body (4 levels of arrow windows, 38 x 16 m)
  k.color(BRICK);
  k.box(0, PH, -2.5, 38.0, 14.5, 16.0);

  // 4 Tiers of Archery Windows (箭窗, South face at Z ≈ -10.5)
  // 12 windows per row on South face, green wooden shutters
  k.color(SHUTTER);
  for (let tier = 0; tier < 4; tier++) {
    const wy = PH + 1.8 + tier * 3.1;
    // South face windows
    for (let c = -5; c <= 5; c++) {
      k.box(c * 2.9, wy, -10.6, 1.2, 1.8, 0.2);
    }
    // East & West face windows (4 per tier)
    if (hi) {
      for (let s = -1; s <= 2; s++) {
        k.box(-19.1, wy, -2.5 + s * 3.2, 0.2, 1.8, 1.2);
        k.box(19.1, wy, -2.5 + s * 3.2, 0.2, 1.8, 1.2);
      }
    }
  }

  // Rear Hall (后厦, North face at Z ≈ +5.5, 32 x 10 m)
  k.color(C.WALL);
  k.box(0, PH, 5.5, 32.0, 9.5, 10.0);
  // Rear hall roof (skirt eave)
  roof(k, 0, PH + 9.5, 5.5, 18.0, 6.5, 3.2, { type: "hip", lift: 0.8, glow: true });

  // Lower skirt eave of front tower (y = 26.5 m)
  roof(k, 0, 26.5, -2.5, 21.0, 10.0, 3.5, { type: "xieshan", lift: 1.0, tEnd: 0.5, glow: true });

  // Upper floor attic & columns
  k.color(C.RED);
  k.box(0, 28.0, -2.5, 30.0, 3.0, 12.0);

  // Grand Upper Glazed Roof (Double-eave xieshan, y = 30.5 .. 35.4 m)
  roof(k, 0, 30.5, -2.5, 20.0, 9.5, 4.9, {
    type: "xieshan", lift: 1.4, ribs: 0.8, glow: true,
  });
}
