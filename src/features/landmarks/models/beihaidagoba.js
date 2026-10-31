// feature/beijing-landmarks: White Dagoba, Beihai (北海白塔) — 1:1.
// 35.9 m Tibetan stupa atop Qionghua Island: steep South mountain stone staircase with glazed Pailou archway,
// cruciform Sumeru pedestal with carved lotus-petal bands, bell-shaped white bumpa with Tibetan Kalachakra
// Eye-Light Niche (眼光门), 13-tier spire (十三天), bronze parasol canopy with 14 bells, and front Shanyin Hall
// (善因殿) tiled with 455 glazed ceramic Buddha niches and flanked by bronze incense burners & stone lanterns.
import { C, roof, terrace } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.2;

export const colliders = [
  { x: 0, z: 0, r: 12, h: 35.9 },
  { x: 0, z: -11.5, hw: 3.5, hd: 3.5, h: 8.5 },
];

const WHITE = 0xf5f3ee;
const WHITE_SH = 0xdedad2;
const GOLD = 0xffdf48;
const BRONZE = 0x8a6e3c;
const GREEN_GLAZE = 0x2f7a4c;
const PINE = 0x2e5e36;

export function build(k) {
  const hi = k.hi;

  // 1. Island Peak Terrace Platform (y = 0 .. 2.8 m) & Steep South Mountain Staircase + Glazed Pailou
  terrace(k, 0, 0, 0, 28, 32, 2.8, { rail: true, glow: true, railSpacing: 2.2 });

  if (hi) {
    // South mountain stone staircase descending Qionghua Island (-Z = -16 .. -28 m)
    for (let st = 0; st < 12; st++) {
      const sy = -3.2 + (st / 12) * 6.0;
      const sz = -28.0 + (st / 12) * 12.0;
      k.color(st % 2 ? C.TERRACE : C.PAVE_DK).box(0, sy, sz, 6.4, 0.55, 1.15);
    }
    // Hanbaiyu marble stair cheek walls & balustrades
    for (const sx of [-3.3, 3.3]) {
      k.color(C.BALUSTRADE).strut([sx, -2.6, -28.0], [sx, 3.4, -16.0], 0.45);
    }
    // Imperial Glazed Pailou Archway (琉璃牌楼) at the head of the South Staircase (z = -15.8 m)
    const pz = -15.8, py = 2.8;
    for (const px of [-2.4, 2.4]) {
      k.color(C.BALUSTRADE).box(px, py, pz, 0.75, 0.9, 1.1);
      k.color(C.RED).cyl(px, py + 0.9, pz, 0.24, 0.22, 4.6, 8);
    }
    k.color(GREEN_GLAZE).box(0, py + 4.2, pz, 5.2, 0.65, 0.55);
    k.glow(true).color(GOLD).box(0, py + 4.85, pz, 2.2, 0.75, 0.45).glow(false);
    roof(k, 0, py + 5.5, pz, 3.2, 1.2, 1.1, { type: "xieshan", color: GOLD, colorDk: C.ROOF_DK, lift: 0.45, glow: true });

    // Ancient Qionghua Island Cypress & Pine trees framing the East & West sides of the terrace
    for (const [tx, tz, r] of [[-11.5, -9, 3.2], [11.5, -9, 3.2], [-12, 6, 3.6], [12, 6, 3.6], [-9, 13, 2.8], [9, 13, 2.8]]) {
      k.color(0x523a24).cyl(tx, 2.8, tz, 0.38, 0.25, 3.4, 6);
      k.color(PINE).sphere(tx, 7.2, tz, r, 8, 5, 0.85);
    }
  }

  // 2. Shanyin Hall (善因殿) directly south of the Dagoba (Z = -11.5)
  // "上圆下方" glazed brick hall with 455 glazed ceramic Buddha niche tiles
  const syZ = -11.5, syY = 2.8;
  k.color(GREEN_GLAZE);
  k.box(0, syY, syZ, 5.6, 4.4, 5.6);
  // Red entrance door facing South & arched doors on E/W/N faces
  k.color(C.RED);
  k.box(0, syY, syZ - 2.82, 1.8, 3.2, 0.12);
  if (hi) {
    k.box(0, syY, syZ + 2.82, 1.6, 3.0, 0.12);
    k.box(-2.82, syY, syZ, 0.12, 3.0, 1.6).box(2.82, syY, syZ, 0.12, 3.0, 1.6);
    // 455 Glazed Ceramic Buddha Niche Tiles (千佛琉璃砖) grid on the 4 walls of Shanyin Hall
    k.glow(true).color(GOLD);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      k.push().translate(0, syY, syZ).rotateY(r);
      for (const gx of [-2.1, -1.4, 1.4, 2.1]) {
        for (let gy = 0.6; gy <= 3.6; gy += 0.6) {
          k.box(gx, gy, -2.83, 0.36, 0.42, 0.06);
        }
      }
      k.pop();
    }
    k.glow(false);
    // Twin Bronze Incense Burners (铜鼎) & Carved White Marble Stone Lanterns (石灯笼) flanking Shanyin Hall
    for (const sx of [-4.2, 4.2]) {
      k.color(C.BALUSTRADE).box(sx, syY, syZ - 2.2, 1.1, 0.55, 1.1);
      k.color(BRONZE).cyl(sx, syY + 0.55, syZ - 2.2, 0.48, 0.38, 1.1, 8);
      k.cone(sx, syY + 1.65, syZ - 2.2, 0.55, 0.55, 8);
      k.color(WHITE_SH).cyl(sx * 0.78, syY, syZ - 3.6, 0.32, 0.26, 1.8, 6);
      k.glow(true).color(GOLD).box(sx * 0.78, syY + 1.8, syZ - 3.6, 0.48, 0.55, 0.48).glow(false);
      k.color(WHITE).cone(sx * 0.78, syY + 2.35, syZ - 3.6, 0.65, 0.48, 6);
    }
  }
  // Lower square green roof
  roof(k, 0, syY + 4.4, syZ, 3.6, 3.6, 1.4, {
    type: "pyramid", color: GREEN_GLAZE, colorDk: 0x245e3a, lift: 0.5, glow: true,
  });
  // Upper circular gilded pavilion dome & finial
  k.glow(true).color(GOLD);
  k.cyl(0, syY + 5.8, syZ, 1.8, 1.6, 1.2, 16);
  k.cyl(0, syY + 7.0, syZ, 1.6, 0.2, 1.4, 12);
  k.glow(false);

  // 3. Tibetan White Dagoba (y = 2.8 .. 35.9 m)
  // Stepped Cruciform Sumeru Pedestal (折角须弥座, y = 2.8 .. 7.5 m)
  k.color(WHITE_SH);
  k.box(0, 2.8, 0, 18.2, 1.6, 18.2);
  k.box(0, 3.2, 0, 20.2, 1.2, 13.8);
  k.box(0, 3.2, 0, 13.8, 1.2, 20.2);

  // Sumeru waist & upper plinth
  k.color(WHITE);
  k.box(0, 4.4, 0, 16.0, 1.8, 16.0);
  k.box(0, 6.2, 0, 17.0, 1.3, 17.0);
  if (hi) {
    k.color(WHITE_SH);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      k.push().rotateY(r);
      for (let rx = -6.0; rx <= 6.0; rx += 3.0) {
        k.box(rx, 4.65, -8.08, 1.8, 1.25, 0.18);
      }
      k.pop();
    }
    // 3 Concentric Stepped Lotus-Petal Rings (金刚圈 & 仰覆莲座) transitioning from square pedestal to round bowl
    for (let l = 0; l < 3; l++) {
      const lr = 7.95 - l * 0.18, ly = 7.5 + l * 0.38;
      k.color(l % 2 ? WHITE : WHITE_SH).cyl(0, ly, 0, lr, lr - 0.1, 0.36, 24);
      for (let p = 0; p < 24; p++) {
        const a = (p / 24) * Math.PI * 2;
        k.color(WHITE_SH).box(Math.cos(a) * lr, ly + 0.05, Math.sin(a) * lr, 0.35, 0.28, 0.35);
      }
    }
  }

  // Inverted Bowl / Stupa Dome (覆钵, y = 7.5 .. 19.5 m, Ø ≈ 14 m)
  const domeProf = [
    [7.5, 0], [7.4, 2.0], [7.1, 4.5], [6.5, 7.0], [5.4, 9.5], [3.8, 11.5], [3.2, 12.0],
  ];
  k.color(WHITE);
  k.lathe(0, 7.5, 0, domeProf, hi ? 28 : 14);

  // Niche (眼光门 / 时轮金刚佛龛) on the South face (-Z)
  k.color(C.RED);
  k.box(0, 11.0, -7.2, 2.0, 2.8, 0.3);
  k.glow(true).color(GOLD);
  k.box(0, 11.5, -7.25, 1.2, 1.6, 0.2);
  if (hi) {
    k.color(WHITE_SH).box(0, 13.8, -7.22, 2.4, 0.45, 0.38);
    k.cone(0, 14.25, -7.22, 1.15, 0.85, 6);
    k.color(C.RED).box(0, 11.8, -7.36, 0.22, 1.1, 0.08).box(0, 12.3, -7.36, 0.85, 0.22, 0.08);
  }
  k.glow(false);

  // Harmika Box (相轮座 / 须弥小座, y = 19.5 .. 21.5 m)
  k.color(WHITE_SH);
  k.box(0, 19.5, 0, 5.8, 2.0, 5.8);
  if (hi) {
    k.color(WHITE).box(0, 21.2, 0, 6.2, 0.35, 6.2);
  }

  // Thirteen Heavens Spire (十三天相轮, y = 21.5 .. 31.0 m, Ø 4.6 m -> 2.0 m)
  k.color(WHITE);
  k.cyl(0, 21.5, 0, 2.3, 1.0, 9.5, hi ? 24 : 12);
  if (hi) {
    k.color(WHITE_SH);
    for (let r = 0; r < 13; r++) {
      const ty = 21.8 + r * 0.7;
      const rad = 2.3 - (r / 12) * 1.3;
      k.cyl(0, ty, 0, rad + 0.18, rad + 0.18, 0.24, 20);
    }
  }

  // Bronze Canopy / Parasol (铜铸华盖, y = 31.0 .. 32.5 m, Ø 3.8 m)
  k.color(BRONZE);
  k.cyl(0, 31.0, 0, 1.9, 1.9, 0.8, hi ? 20 : 16);
  if (hi) {
    k.color(GOLD).cyl(0, 31.75, 0, 2.02, 1.85, 0.22, 20);
    k.glow(true).color(GOLD);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const bx = Math.cos(a) * 1.85, bz = Math.sin(a) * 1.85;
      k.cyl(bx, 30.2, bz, 0.12, 0.06, 0.8, 6);
      k.sphere(bx, 30.15, bz, 0.14, 6, 4);
    }
    k.glow(false);
  }

  // Finial (塔刹: 仰月日珠 / 鎏金宝顶, y = 32.5 .. 35.9 m)
  k.glow(true).color(GOLD);
  k.sphere(0, 33.2, 0, 1.1, 14, 8);
  if (hi) {
    k.torus(0, 34.35, 0, 0.85, 0.18, 12, 6, Math.PI);
  } else {
    k.box(0, 34.2, 0, 1.6, 0.35, 0.35);
  }
  k.sphere(0, 35.0, 0, 0.65, 12, 6);
  k.cyl(0, 35.3, 0, 0.18, 0.02, 0.65, 8);
  k.glow(false);
}
