// feature/beijing-landmarks: Zhengyangmen Arrow Tower (正阳门箭楼) — 1:1.
// 35.4 m arrow fortress south of Qianmen gate: grey-brick rampart with arched portal, iron-studded double
// gate doors & Qianmen Iron Portcullis (千斤闸) groove, twin north brick horse-ramps (马道), Hanbaiyu marble
// balustrades & stone dragon drainage spouts (螭首), "front-tower rear-hall" (前楼后厦) structure with 4 tiers
// of 86 red-bullseye archery windows (箭窗), red veranda colonnade, golden dougong frieze, and glazed Xieshan roof.
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
const GOLD = 0xf4c430;

export function build(k) {
  const hi = k.hi;
  const PW = 62.0, PD = 28.0, PH = 12.0;

  // 1. Grey-Brick Rampart Fortress Base (城台, y = 0 .. 12.0 m)
  const arches = [{ x: 0, w: 6.4, h: 8.0 }];
  archWall(k, 0, 0, 0, PW, PH, PD, arches, { color: BRICK, door: C.RED_DK });

  if (hi) {
    // North inner fortress portal (瓮城门洞) with the famous Qianmen Iron Portcullis (千斤闸) housing & studded red gates
    k.color(BRICK_DK).box(0, 8.2, PD / 2 - 0.8, 7.6, 2.2, 1.8);
    k.color(0x2d3136).box(0, 6.8, -PD / 2 + 1.2, 6.2, 1.6, 0.35); // raised iron portcullis blade
    // Twin North Brick Horse-Ramps (马道) ascending the north face of the rampart
    for (const sx of [-1, 1]) {
      k.color(BRICK).strut([sx * 24.5, 0.2, PD / 2 + 5.5], [sx * 14.5, PH - 0.3, PD / 2 + 1.2], 4.2);
      k.color(BRICK_DK).strut([sx * 24.5, 1.1, PD / 2 + 7.4], [sx * 14.5, PH + 0.8, PD / 2 + 3.1], 0.48);
    }
    // Hanbaiyu marble cornice stringcourse & 3D stone dragon water spouts (螭首) around the rampart top
    k.color(C.BALUSTRADE).box(0, PH - 0.35, 0, PW - 0.8, 0.35, PD - 0.8);
    for (let x = -26; x <= 26; x += 6.5) {
      for (const sz of [-1, 1]) {
        k.strut([x, PH - 0.2, sz * (PD / 2 - 0.6)], [x, PH - 0.3, sz * (PD / 2 + 0.55)], 0.28);
      }
    }
    // White marble balustrade along the North rear hall terrace
    rail(k, -18, 18, PD / 2 - 1.2, PH + 0.2, 12, 1.1, false);
  }

  // Rampart deck floor & crenellated battlement parapet (雉堞)
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

  // 4 Tiers of Archery Windows (箭窗, South face at Z ≈ -10.5, plus East/West flanks)
  // 12 windows per row on South face, green wooden shutters with red frames & bullseye firing ports
  for (let tier = 0; tier < 4; tier++) {
    const wy = PH + 1.8 + tier * 3.1;
    // South face windows
    for (let c = -5; c <= 5; c++) {
      const wx = c * 2.9;
      if (hi) k.color(C.RED).box(wx, wy - 0.1, -10.56, 1.42, 2.0, 0.16);
      k.color(SHUTTER).box(wx, wy, -10.62, 1.2, 1.8, 0.2);
      if (hi) {
        // White & red archery target bullseye ring in the center of each shutter
        k.color(C.BALUSTRADE).box(wx, wy + 0.55, -10.74, 0.42, 0.42, 0.06);
        k.color(C.RED).box(wx, wy + 0.62, -10.76, 0.24, 0.24, 0.06);
      }
    }
    // East & West face windows (4 per tier)
    if (hi) {
      for (let s = -1; s <= 2; s++) {
        const wz = -2.5 + s * 3.2;
        for (const sx of [-1, 1]) {
          k.color(C.RED).box(sx * 19.05, wy - 0.1, wz, 0.16, 2.0, 1.42);
          k.color(SHUTTER).box(sx * 19.12, wy, wz, 0.2, 1.8, 1.2);
          k.color(C.BALUSTRADE).box(sx * 19.24, wy + 0.55, wz, 0.06, 0.42, 0.42);
        }
      }
    }
  }

  // Rear Hall (后厦, North face at Z ≈ +5.5, 32 x 10 m) with red colonnade & lattice doors
  k.color(C.WALL);
  k.box(0, PH, 5.5, 32.0, 9.5, 10.0);
  if (hi) {
    // 8 crimson veranda columns (红柱) along the North Rear Hall facade & South ground-level veranda
    for (let c = -3.5; c <= 3.5; c += 1) {
      k.color(C.RED).cyl(c * 4.2, PH, 10.6, 0.34, 0.30, 8.8, 8);
      k.color(C.BALUSTRADE).cyl(c * 4.2, PH, 10.6, 0.46, 0.42, 0.45, 8);
    }
    k.glow(true).color(GOLD).box(0, PH + 8.6, 10.6, 31.6, 0.75, 0.45).glow(false);
  }
  // Rear hall roof (skirt eave)
  roof(k, 0, PH + 9.5, 5.5, 18.0, 6.5, 3.2, { type: "hip", lift: 0.8, glow: true });

  // Lower skirt eave of front tower (y = 26.5 m)
  roof(k, 0, 26.5, -2.5, 21.0, 10.0, 3.5, { type: "xieshan", lift: 1.0, tEnd: 0.5, glow: true });

  // Upper floor attic & columns + golden dougong frieze + balcony rail
  k.color(C.RED);
  k.box(0, 28.0, -2.5, 30.0, 3.0, 12.0);
  if (hi) {
    for (let c = -4; c <= 4; c++) {
      k.color(C.RED_DK).cyl(c * 3.4, 28.0, -8.6, 0.28, 0.26, 2.8, 6);
    }
    // Golden dougong brackets & painted Hexi beam frieze under the upper roof
    k.glow(true).color(GOLD).box(0, 30.1, -2.5, 30.6, 0.55, 12.6).glow(false);
    // Chiwei (鸱尾) dragon-tail ridge ornaments on the main roof ridge ends
    k.color(C.ROOF_GREEN).box(-14.5, 34.8, -2.5, 1.1, 1.4, 0.7).box(14.5, 34.8, -2.5, 1.1, 1.4, 0.7);
  }

  // Grand Upper Glazed Roof (Double-eave xieshan, y = 30.5 .. 35.4 m)
  roof(k, 0, 30.5, -2.5, 20.0, 9.5, 4.9, {
    type: "xieshan", lift: 1.4, ribs: 0.8, glow: true,
  });
}
