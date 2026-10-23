// feature/beijing-landmarks: The Forbidden City (故宫紫禁城) — 1:1.
// 753 x 961 m imperial palace ensemble along the central axis (heading 180 = south front):
// 10 m perimeter vermilion wall with yellow glazed coping, 4 famous corner towers, 52 m moat,
// Meridian Gate (午门), Inner Golden Water River with 5 marble bridges, Gate of Supreme Harmony,
// 3-tier marble terrace with Three Great Halls (Taihedian, Zhonghedian, Baohedian), Qianqingmen,
// Palace of Heavenly Purity, Imperial Garden, Gate of Divine Prowess (Shenwumen), and side halls.
import { C, hall, roof, terrace, archWall, wallRun, rail, lantern } from "../cn_arch.js";

export const lodDist = 2400;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: -470, hw: 65, hd: 35, h: 38.0 },  // Meridian Gate
  { x: 0, z: -250, hw: 30, hd: 18, h: 24.0 },  // Gate of Supreme Harmony
  { x: 0, z: -115, hw: 45, hd: 30, h: 36.0 },  // Taihedian on 3-tier terrace
  { x: 0, z: -25, hw: 16, hd: 16, h: 22.0 },   // Zhonghedian
  { x: 0, z: 55, hw: 35, hd: 22, h: 30.0 },    // Baohedian
  { x: 0, z: 175, hw: 32, hd: 20, h: 26.0 },   // Qianqinggong
  { x: 0, z: 470, hw: 38, hd: 18, h: 31.0 },   // Shenwumen
  { x: 376, z: 0, hw: 5, hd: 480, h: 10.0 },   // West wall
  { x: -376, z: 0, hw: 5, hd: 480, h: 10.0 },  // East wall
  { x: 0, z: -480, hw: 376, hd: 5, h: 10.0 },  // South wall
  { x: 0, z: 480, hw: 376, hd: 5, h: 10.0 },   // North wall
];

const GOLD_FINIAL = 0xffdf48;

/** Famous 4 Corner Towers (故宫角楼): 9 beams, 18 pillars, 72 ridges cross-xieshan pavilion */
function cornerTower(k, x, z) {
  const y0 = 10.0; // stands atop the 10 m wall corner
  k.color(C.MARBLE);
  k.box(x, y0, z, 14.0, 1.2, 14.0);

  // Lower pavilion body
  k.color(C.RED);
  k.box(x, y0 + 1.2, z, 10.0, 4.2, 10.0);
  // Lower skirt eave
  roof(k, x, y0 + 5.4, z, 7.5, 7.5, 2.5, { type: "hip", lift: 1.0, glow: true });

  // Upper cruciform hall with multi-ridge intersecting xieshan roofs
  k.color(C.RED);
  k.box(x, y0 + 7.0, z, 7.0, 3.8, 7.0);
  // Primary N-S and E-W intersecting roofs
  roof(k, x, y0 + 10.5, z, 6.2, 4.2, 3.2, { type: "xieshan", lift: 1.2, glow: true });
  roof(k, x, y0 + 10.5, z, 4.2, 6.2, 3.2, { type: "xieshan", lift: 1.2, glow: true });

  // Gilded finial on top
  k.glow(true).color(GOLD_FINIAL);
  k.sphere(x, y0 + 14.2, z, 0.75, 10, 6);
  k.glow(false);
}

export function build(k) {
  const hi = k.hi;
  const HW = 376.5, HD = 480.5;

  // -------------------------------------------------------------------------
  // 1. Perimeter Vermilion Wall (10 m high, yellow glazed tile coping)
  // -------------------------------------------------------------------------
  const wallPts = [
    [-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]
  ];
  wallRun(k, wallPts, 10.0, 6.5, { closed: true, y0: 0, glow: true, base: C.WALL });

  // 4 Famous Corner Towers atop the wall corners
  cornerTower(k, -HW + 6.0, -HD + 6.0); // SE
  cornerTower(k, HW - 6.0, -HD + 6.0);  // SW
  cornerTower(k, -HW + 6.0, HD - 6.0);  // NE
  cornerTower(k, HW - 6.0, HD - 6.0);   // NW

  // -------------------------------------------------------------------------
  // 2. Meridian Gate (午门 Wumen, Z = -470, 38 m high)
  // -------------------------------------------------------------------------
  // U-shaped ("凹"字形) fortress bastion (12 m high)
  const arches = [
    { x: 0, w: 5.6, h: 8.6 },
    { x: 13, w: 4.4, h: 7.4 }, { x: -13, w: 4.4, h: 7.4 },
  ];
  // Central bastion wall
  archWall(k, 0, 0, -470, 130, 12.0, 38, arches, { color: C.WALL });
  // East & West projecting wing bastions extending southward
  archWall(k, 50, 0, -440, 28, 12.0, 62, [], { color: C.WALL });
  archWall(k, -50, 0, -440, 28, 12.0, 62, [], { color: C.WALL });

  // Central Grand Hall on Meridian Gate (9x5 bays, double-eave hip roof)
  hall(k, {
    x: 0, z: -470, y0: 12.0, w: 58.0, d: 24.0, bays: 9, baysD: 5, colH: 6.2, colR: 0.44,
    base: { h: 0.8, margin: 2.8, rail: true, stairs: [] },
    roof: "hip", double: true, upperH: 2.4, upperInset: 3.6, rise: 11.0, rise2: 7.5,
    ribs: 0.9, beasts: 9, glow: true, glowRoof: true, doors: "all",
  });
  // 4 Wing corner pavilions on the projecting wings (雁翅楼)
  for (const sx of [-50, 50]) {
    for (const sz of [-460, -415]) {
      hall(k, {
        x: sx, z: sz, y0: 12.0, w: 18.0, d: 16.0, bays: 3, baysD: 3, colH: 4.5, colR: 0.35,
        base: { h: 0.5, margin: 1.2, rail: true, stairs: [] },
        roof: "hip", double: false, rise: 4.2, glow: true, glowRoof: true, doors: "all",
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Inner Golden Water River & 5 White Marble Bridges (Z = -345)
  // -------------------------------------------------------------------------
  if (hi) {
    // Marble bridges spanning the river canal
    const bridgeW = [7.5, 5.0, 5.0, 4.2, 4.2];
    const bridgeX = [0, 14, -14, 27.5, -27.5];
    k.color(C.MARBLE);
    for (let i = 0; i < 5; i++) {
      const bx = bridgeX[i], bw = bridgeW[i];
      k.box(bx, 0.4, -345, bw, 0.9, 22.0);
      rail(k, bx - bw / 2 + 0.2, -355, bx - bw / 2 + 0.2, -335, 1.3, { h: 0.95, spacing: 2.0 });
      rail(k, bx + bw / 2 - 0.2, -355, bx + bw / 2 - 0.2, -335, 1.3, { h: 0.95, spacing: 2.0 });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Gate of Supreme Harmony (太和门 Taihemen, Z = -250, 9x3 bays, double roof)
  // -------------------------------------------------------------------------
  hall(k, {
    x: 0, z: -250, y0: 0, w: 54.0, d: 25.0, bays: 9, baysD: 3, colH: 5.8, colR: 0.42,
    base: { h: 2.2, margin: 3.5, rail: true, stairs: [{ x: 0, side: "front", w: 8, l: 6 }, { x: 0, side: "back", w: 8, l: 6 }] },
    roof: "xieshan", double: true, upperH: 2.0, upperInset: 3.2, rise: 9.0, rise2: 6.2,
    ribs: 0.85, beasts: 7, glow: true, glowRoof: true, doors: "front",
  });

  // -------------------------------------------------------------------------
  // 5. Grand 3-Tier White Marble Terrace (三台) with the Three Great Halls
  // -------------------------------------------------------------------------
  // Lower tier (Tier 1): 92 x 230 m, h = 2.6 m
  terrace(k, 0, 0, -30, 92, 230, 2.6, { rail: true, glow: true, railSpacing: 2.4 });
  // Middle tier (Tier 2): 84 x 218 m, h = 2.6 m
  terrace(k, 0, 2.6, -30, 84, 218, 2.6, { rail: true, glow: true, railSpacing: 2.4 });
  // Upper tier (Tier 3): 78 x 206 m, h = 2.8 m (top at y = 8.0 m)
  terrace(k, 0, 5.2, -30, 78, 206, 2.8, { rail: true, glow: true, railSpacing: 2.4 });

  // --- A. Hall of Supreme Harmony (太和殿 Taihedian, Z = -115, 35 m high) ---
  // Highest rank: 11 x 5 bays, double-eave hip roof (重檐庑殿顶), 10 roof beasts
  hall(k, {
    x: 0, z: -115, y0: 8.0, w: 64.0, d: 37.0, bays: 11, baysD: 5, colH: 6.8, colR: 0.48,
    base: { h: 1.0, margin: 3.6, rail: true, stairs: [] },
    roof: "hip", double: true, upperH: 2.6, upperInset: 4.2, rise: 13.5, rise2: 8.5,
    ribs: 0.95, beasts: 10, glow: true, glowRoof: true, doors: "front",
  });

  // --- B. Hall of Central Harmony (中和殿 Zhonghedian, Z = -25) ---
  // Square plan: 5 x 5 bays (24 x 24 m), square pyramid roof with gilded ball finial
  hall(k, {
    x: 0, z: -25, y0: 8.0, w: 24.0, d: 24.0, bays: 5, baysD: 5, colH: 5.2, colR: 0.38,
    base: { h: 0.8, margin: 2.5, rail: true, stairs: [] },
    roof: "pyramid", double: false, rise: 7.2, lift: 1.2, ribs: 0.8, glow: true, glowRoof: true, doors: "all",
  });
  // Central gold finial
  k.glow(true).color(GOLD_FINIAL);
  k.sphere(0, 8.0 + 0.8 + 5.2 + 7.2 + 0.8, -25, 1.2, 12, 8);
  k.glow(false);

  // --- C. Hall of Preserving Harmony (保和殿 Baohedian, Z = +55) ---
  // 9 x 5 bays (50 x 25 m), double-eave hip-and-gable roof (重檐歇山顶)
  hall(k, {
    x: 0, z: 55, y0: 8.0, w: 50.0, d: 26.0, bays: 9, baysD: 5, colH: 6.0, colR: 0.44,
    base: { h: 0.8, margin: 3.0, rail: true, stairs: [] },
    roof: "xieshan", double: true, upperH: 2.2, upperInset: 3.4, rise: 10.5, rise2: 7.0,
    ribs: 0.88, beasts: 9, glow: true, glowRoof: true, doors: "front",
  });

  // Imperial dragon ramp on North staircase (九龙丹陛石, behind Baohedian)
  if (hi) {
    k.color(C.MARBLE_DK);
    k.taper(0, 0, 160, 4.8, 18.0, 4.8, 18.0, 8.0);
    k.color(C.MARBLE_SH);
    k.box(0, 4.1, 160, 3.6, 0.2, 16.0);
  }

  // -------------------------------------------------------------------------
  // 6. Gate of Heavenly Purity (乾清门 Qianqingmen, Z = +125)
  // -------------------------------------------------------------------------
  hall(k, {
    x: 0, z: 125, y0: 0, w: 38.0, d: 18.0, bays: 7, baysD: 3, colH: 4.8, colR: 0.36,
    base: { h: 1.6, margin: 2.2, rail: true, stairs: [{ x: 0, side: "front", w: 6, l: 4 }] },
    roof: "xieshan", double: false, rise: 4.8, glow: true, glowRoof: true, doors: "front",
  });

  // -------------------------------------------------------------------------
  // 7. Inner Court Three Palaces (后三宫, Z = +175 .. +255)
  // -------------------------------------------------------------------------
  // Palace of Heavenly Purity (乾清宫 Qianqinggong, Z = +175)
  hall(k, {
    x: 0, z: 175, y0: 1.8, w: 46.0, d: 24.0, bays: 9, baysD: 5, colH: 5.6, colR: 0.40,
    base: { h: 1.4, margin: 2.6, rail: true, stairs: [{ x: 0, side: "front", w: 6, l: 4 }] },
    roof: "hip", double: true, upperH: 2.0, upperInset: 3.0, rise: 9.2, rise2: 6.0,
    ribs: 0.85, beasts: 7, glow: true, glowRoof: true, doors: "front",
  });

  // Hall of Union (交泰殿 Jiaotaidian, Z = +215)
  hall(k, {
    x: 0, z: 215, y0: 1.8, w: 20.0, d: 20.0, bays: 3, baysD: 3, colH: 4.6, colR: 0.35,
    base: { h: 0.8, margin: 1.8, rail: true, stairs: [] },
    roof: "pyramid", double: false, rise: 5.8, glow: true, glowRoof: true, doors: "all",
  });

  // Palace of Earthly Tranquility (坤宁宫 Kunninggong, Z = +255)
  hall(k, {
    x: 0, z: 255, y0: 1.8, w: 42.0, d: 22.0, bays: 9, baysD: 3, colH: 5.2, colR: 0.38,
    base: { h: 1.0, margin: 2.2, rail: true, stairs: [] },
    roof: "hip", double: false, rise: 5.8, glow: true, glowRoof: true, doors: "front",
  });

  // -------------------------------------------------------------------------
  // 8. Imperial Garden & Qinan Hall (御花园, Z = +335)
  // -------------------------------------------------------------------------
  hall(k, {
    x: 0, z: 335, y0: 0, w: 26.0, d: 18.0, bays: 5, baysD: 3, colH: 4.8, colR: 0.35,
    base: { h: 1.2, margin: 2.0, rail: true, stairs: [{ x: 0, side: "front", w: 5, l: 3 }] },
    roof: "xieshan", double: false, rise: 4.6, glow: true, glowRoof: true, doors: "front",
  });

  // -------------------------------------------------------------------------
  // 9. Gate of Divine Prowess (神武门 Shenwumen, Z = +470, 31 m high)
  // -------------------------------------------------------------------------
  // Rampart fortress base with vaulted portal
  const northArches = [{ x: 0, w: 5.4, h: 7.8 }];
  archWall(k, 0, 0, 470, 76.0, 11.0, 22.0, northArches, { color: C.WALL });

  // Two-story gatehouse hall (5 x 3 bays, double-eave hip roof)
  hall(k, {
    x: 0, z: 470, y0: 11.0, w: 44.0, d: 18.0, bays: 5, baysD: 3, colH: 5.4, colR: 0.40,
    base: { h: 0.8, margin: 2.4, rail: true, stairs: [] },
    roof: "hip", double: true, upperH: 1.8, upperInset: 2.8, rise: 8.2, rise2: 5.4,
    ribs: 0.8, beasts: 7, glow: true, glowRoof: true, doors: "all",
  });

  // -------------------------------------------------------------------------
  // 10. Flanking Side Halls (Wuyingdian & Wenhuanian)
  // -------------------------------------------------------------------------
  if (hi) {
    // Hall of Martial Valor (武英殿 Wuyingdian, West side at X = +180, Z = -260)
    hall(k, {
      x: 180, z: -260, y0: 0, w: 36.0, d: 18.0, bays: 5, baysD: 3, colH: 4.8, colR: 0.35,
      base: { h: 1.2, margin: 2.0, rail: true, stairs: [] },
      roof: "xieshan", double: false, rise: 4.6, glow: true, glowRoof: true, doors: "front",
    });

    // Hall of Literary Glory (文华殿 Wenhuanian, East side at X = -180, Z = -260)
    hall(k, {
      x: -180, z: -260, y0: 0, w: 36.0, d: 18.0, bays: 5, baysD: 3, colH: 4.8, colR: 0.35,
      base: { h: 1.2, margin: 2.0, rail: true, stairs: [] },
      roof: "xieshan", double: false, rise: 4.6, glow: true, glowRoof: true, doors: "front",
    });
  }
}
