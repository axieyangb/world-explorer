// feature/beijing-landmarks: White Dagoba, Beihai (北海白塔) — 1:1.
// 35.9 m Tibetan stupa atop Qionghua Island: cruciform Sumeru pedestal, bell-shaped inverted
// white bowl (bumpa), 13-tier spire (十三天), bronze parasol canopy, and front Shanyin Hall.
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

export function build(k) {
  const hi = k.hi;

  // 1. Island Peak Terrace Platform (y = 0 .. 2.8 m)
  terrace(k, 0, 0, 0, 28, 32, 2.8, { rail: true, glow: true, railSpacing: 2.2 });

  // 2. Shanyin Hall (善因殿) directly south of the Dagoba (Z = -11.5)
  // "上圆下方" glazed brick hall
  const syZ = -11.5, syY = 2.8;
  k.color(GREEN_GLAZE);
  k.box(0, syY, syZ, 5.6, 4.4, 5.6);
  // Red entrance door facing South
  k.color(C.RED);
  k.box(0, syY, syZ - 2.82, 1.8, 3.2, 0.1);
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

  // Inverted Bowl / Stupa Dome (覆钵, y = 7.5 .. 19.5 m, Ø ≈ 14 m)
  // Beautiful rounded bell profile
  const domeProf = [
    [7.5, 0], [7.4, 2.0], [7.1, 4.5], [6.5, 7.0], [5.4, 9.5], [3.8, 11.5], [3.2, 12.0],
  ];
  k.color(WHITE);
  k.lathe(0, 7.5, 0, domeProf, hi ? 24 : 14);

  // Niche (眼光门 / 佛龛) on the South face (-Z)
  k.color(C.RED);
  k.box(0, 11.0, -7.2, 2.0, 2.8, 0.3);
  k.glow(true).color(GOLD);
  k.box(0, 11.5, -7.25, 1.2, 1.6, 0.2);
  k.glow(false);

  // Harmika Box (相轮座 / 眼界, y = 19.5 .. 21.5 m)
  k.color(WHITE_SH);
  k.box(0, 19.5, 0, 5.8, 2.0, 5.8);

  // Thirteen Heavens Spire (十三天, y = 21.5 .. 31.0 m, Ø 4.6 m -> 2.0 m)
  k.color(WHITE);
  k.cyl(0, 21.5, 0, 2.3, 1.0, 9.5, hi ? 20 : 12);
  // 13 ring ribs
  if (hi) {
    k.color(WHITE_SH);
    for (let r = 0; r < 13; r++) {
      const ty = 21.8 + r * 0.7;
      const rad = 2.3 - (r / 12) * 1.3;
      k.cyl(0, ty, 0, rad + 0.15, rad + 0.15, 0.22, 16);
    }
  }

  // Bronze Canopy / Parasol (铜铸华盖, y = 31.0 .. 32.5 m, Ø 3.8 m)
  k.color(BRONZE);
  k.cyl(0, 31.0, 0, 1.9, 1.9, 0.8, 16);
  // Gold wind chimes hanging around parasol edge
  if (hi) {
    k.glow(true).color(GOLD);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.cyl(Math.cos(a) * 1.85, 30.2, Math.sin(a) * 1.85, 0.08, 0.08, 0.8, 6);
    }
    k.glow(false);
  }

  // Finial (塔刹: 仰月日珠 / 鎏金宝顶, y = 32.5 .. 35.9 m)
  k.glow(true).color(GOLD);
  k.sphere(0, 33.2, 0, 1.1, 14, 8);
  // Crescent moon & sun disk
  k.box(0, 34.2, 0, 1.6, 0.35, 0.35);
  k.sphere(0, 35.0, 0, 0.65, 12, 6);
  k.cyl(0, 35.3, 0, 0.15, 0.02, 0.6, 8);
  k.glow(false);
}
