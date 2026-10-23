/**
 * World Explorer - Landmark Batch 04 (BATCH_04)
 * High-Fidelity Procedural 3D Architectural Models:
 * 1. Imperial Vault of Heaven (天坛皇穹宇)
 * 2. Beihai White Dagoba (北海白塔)
 * 3. Miaoying Temple White Dagoba (妙应寺白塔)
 * 4. Tianning Temple Pagoda (天宁寺塔)
 */

const COBALT_BLUE = [24, 76, 172];
const BLUE_TRIM = [34, 96, 202];
const VERMILION = [178, 42, 36];
const MARBLE = [242, 239, 232];
const MARBLE_ACCENT = [250, 248, 244];
const GREY_BRICK = [128, 132, 138];
const GOLD_FINIAL = [248, 206, 68];
const GOLD_GLOW = [255, 218, 125];
const COURTYARD_STONE = [186, 182, 174];
const DOUGONG_TEAL = [38, 115, 96];

const STUPA_WHITE = [248, 247, 244];
const STONE_GREY = [164, 160, 152];
const XUMI_WHITE = [238, 235, 228];
const BRONZE_GOLD = [236, 188, 62];
const GLAZED_GREEN = [48, 118, 76];
const GLAZED_YELLOW = [228, 172, 38];
const NICHE_RED = [210, 52, 44];

const BASE_BRICK = [168, 164, 158];
const TERRACOTTA_RED = [184, 52, 44];
const IRON_STRAP = [76, 80, 86];
const GILT_BRONZE = [238, 192, 64];
const GREY_TILE = [88, 92, 98];

const PAGODA_BRICK = [184, 178, 168];
const PAGODA_TRIM = [156, 150, 142];
const RELIEF_STONE = [212, 204, 192];
const LOTUS_STONE = [228, 218, 204];
const EAVE_DARK = [102, 98, 92];
const SPIRA_GOLD = [246, 206, 72];
const PORTAL_DARK = [32, 28, 26];
const LANTERN_GLOW = [255, 212, 120];

export const BATCH_04 = [
  // 1. Imperial Vault of Heaven (天坛皇穹宇)
  {
    id: 'temple_of_heaven_huangqiongyu',
    nameZh: '皇穹宇',
    nameEn: 'Imperial Vault of Heaven',
    cx: 805,
    cz: 3504,
    exclR: 55,
    height: 20,
    osmIds: [43921121],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Circular Paved Courtyard Platform & Imperial Stone Pathway
      b.addCylinder(cx, y0, cz, 33.4, 33.4, 0.45, 48, 0, COURTYARD_STONE, false);
      // North-South ceremonial marble pathway (三音石 & 对话石 path)
      b.addBox(cx, y0 + 0.46, cz + 16, 4.4, 0.08, 28.5, 0, MARBLE, false);
      // Three Echo Stones (一音石、二音石、三音石) & Dialogue Stone (对话石)
      const stoneDistances = [12.0, 15.0, 18.0, 26.5];
      for (const dist of stoneDistances) {
        b.addBox(cx, y0 + 0.55, cz + dist, 2.2, 0.04, 1.4, 0, GOLD_GLOW, true);
      }

      // 2. Circular Echo Wall (回音壁: r = 32.5m, h = 3.72m, thickness = 0.9m)
      const nWallSegs = 60;
      const wallR = 32.5;
      const dAngle = (Math.PI * 2) / nWallSegs;
      for (let i = 0; i < nWallSegs; i++) {
        const a = i * dAngle;
        const zNorm = Math.sin(a);
        const xNorm = Math.cos(a);
        // Leave South opening for Triple Glazed Gate (皇穹宇三座琉璃门: width ~18.5m)
        if (zNorm > 0.80 && Math.abs(xNorm * wallR) < 9.5) continue;

        const wx = cx + xNorm * wallR;
        const wz = cz + zNorm * wallR;
        const segW = (2 * Math.PI * wallR) / nWallSegs + 0.18;
        // Correct tangential yaw: a + Math.PI * 0.5
        const yaw = a + Math.PI * 0.5;

        // Smooth grey brick wall body (磨砖对缝青砖墙)
        b.addBox(wx, y0 + 0.45, wz, segW, 3.4, 0.9, yaw, GREY_BRICK, false);
        // Cobalt-blue glazed tile coping ring on top
        b.addBox(wx, y0 + 3.85, wz, segW + 0.06, 0.35, 1.15, yaw, COBALT_BLUE, false);
        // Under-coping subtle night glow strip
        b.addBox(wx, y0 + 3.77, wz, segW, 0.1, 0.96, yaw, GOLD_GLOW, true);
      }

      // 3. South Triple-Arch Glazed Gate (皇穹宇三座琉璃门)
      const gateZ = cz + wallR;
      // White marble podium base
      b.addBox(cx, y0 + 0.45, gateZ, 19.0, 0.6, 4.0, 0, MARBLE, false);
      // Vermilion gate wall body
      b.addBox(cx, y0 + 1.05, gateZ, 19.0, 3.8, 3.6, 0, VERMILION, false);
      // Three arched portal openings (center larger, two side smaller)
      b.addBox(cx, y0 + 1.05, gateZ, 3.8, 3.2, 3.8, 0, PORTAL_DARK, false);
      b.addBox(cx - 5.4, y0 + 1.05, gateZ, 2.8, 2.7, 3.8, 0, PORTAL_DARK, false);
      b.addBox(cx + 5.4, y0 + 1.05, gateZ, 2.8, 2.7, 3.8, 0, PORTAL_DARK, false);
      // Yellow-glazed decorative arch surround moldings
      b.addBox(cx, y0 + 2.65, gateZ, 4.4, 0.45, 3.7, 0, GLAZED_YELLOW, false);
      b.addBox(cx - 5.4, y0 + 2.4, gateZ, 3.3, 0.4, 3.7, 0, GLAZED_YELLOW, false);
      b.addBox(cx + 5.4, y0 + 2.4, gateZ, 3.3, 0.4, 3.7, 0, GLAZED_YELLOW, false);
      // Warm portal lantern glow
      b.addBox(cx, y0 + 3.4, gateZ + 1.85, 2.0, 0.5, 0.15, 0, GOLD_GLOW, true);
      b.addBox(cx - 5.4, y0 + 3.0, gateZ + 1.85, 1.4, 0.4, 0.15, 0, GOLD_GLOW, true);
      b.addBox(cx + 5.4, y0 + 3.0, gateZ + 1.85, 1.4, 0.4, 0.15, 0, GOLD_GLOW, true);
      // Glazed blue-tiled Xieshan roof with yellow trim spanning between wall ends
      b.addChineseRoof(cx, y0 + 4.85, gateZ, 19.6, 4.6, 2.6, 1.6, 0, COBALT_BLUE, GLAZED_YELLOW, GOLD_FINIAL);

      // 4. East and West Side Pavilions (东配殿、西配殿: 面阔五间、进深三间、单檐歇山顶)
      // Placed symmetrically flanking central axis, facing inward toward the courtyard
      for (const sideSign of [-1, 1]) {
        const px = cx + sideSign * 21.5;
        const pz = cz - 1.0;
        // White marble terrace base (longer North-South, depth East-West)
        b.addBox(px, y0 + 0.45, pz, 9.4, 0.8, 16.6, 0, MARBLE, false);
        // Vermilion sanctuary hall (5 bays North-South, 3 bays East-West)
        b.addBox(px, y0 + 1.25, pz, 8.2, 4.5, 15.2, 0, VERMILION, false);

        // Inward-facing facade: 5-bay colonnade pillars and golden lattice windows
        const inFaceX = px - sideSign * 4.0;
        for (let bay = -2; bay <= 2; bay++) {
          const colZ = pz + bay * 2.8;
          b.addCylinder(inFaceX, y0 + 1.25, colZ, 0.32, 0.30, 4.5, 8, 0, [196, 44, 38], false);
          if (bay < 2) {
            const winZ = colZ + 1.4;
            b.addBox(inFaceX - sideSign * 0.05, y0 + 2.2, winZ, 0.25, 2.8, 2.1, 0, GOLD_GLOW, true);
          }
        }
        // Single-eave Chinese Xieshan roof in cobalt-blue glazed tiles (ridge runs North-South)
        b.addChineseRoof(px, y0 + 5.75, pz, 16.2, 9.2, 3.8, 1.8, Math.PI * 0.5, COBALT_BLUE, BLUE_TRIM, GOLD_FINIAL);
      }

      // 5. Central Imperial Vault of Heaven Hall (皇穹宇正殿)
      // Circular White Marble Sumeru Terrace (汉白玉须弥座: d ~22m, h ~1.8m)
      b.addCylinder(cx, y0 + 0.45, cz, 11.4, 11.2, 0.9, 32, 0, MARBLE, false);
      b.addCylinder(cx, y0 + 1.35, cz, 10.4, 10.4, 0.85, 32, 0, MARBLE, false);
      // Terrace top floor is at y0 + 2.2m

      // Perimeter marble balustrades with balusters (望柱栏板)
      const nBal = 32;
      for (let i = 0; i < nBal; i++) {
        const ba = (i / nBal) * Math.PI * 2;
        // Leave south staircase opening
        if (Math.sin(ba) > 0.88 && Math.abs(Math.cos(ba)) < 0.28) continue;
        const bx = cx + Math.cos(ba) * 10.2;
        const bz = cz + Math.sin(ba) * 10.2;
        const bYaw = ba + Math.PI * 0.5;
        const balSegW = (2 * Math.PI * 10.2) / nBal + 0.08;
        b.addBox(bx, y0 + 2.2, bz, balSegW, 0.85, 0.22, bYaw, MARBLE, false);
        b.addBox(bx, y0 + 2.2, bz, 0.32, 1.0, 0.32, bYaw, MARBLE_ACCENT, false);
      }

      // South imperial stair ramp with carved dragon stone (御路双龙戏珠丹陛石)
      b.addBox(cx, y0 + 0.45, cz + 10.8, 4.4, 0.9, 3.6, 0, MARBLE, false);
      b.addFrustumBox(cx, y0 + 1.35, cz + 10.8, 4.2, 3.4, 4.0, 1.6, 0.85, 0, MARBLE, false);
      b.addBox(cx, y0 + 1.45, cz + 10.8, 2.2, 0.8, 3.2, 0, [226, 222, 214], false);

      // Circular Vermilion Hall (d ~15.6m, h = 6.4m, sitting on terrace floor at y0 + 2.2m)
      const hallBaseY = y0 + 2.2;
      b.addCylinder(cx, hallBaseY, cz, 7.8, 7.7, 6.4, 32, 0, VERMILION, false);

      // 8 Outer Vermilion Colonnade Pillars (檐柱)
      for (let p = 0; p < 8; p++) {
        const pAng = (p / 8) * Math.PI * 2;
        const colX = cx + Math.cos(pAng) * 7.72;
        const colZ = cz + Math.sin(pAng) * 7.72;
        b.addCylinder(colX, hallBaseY, colZ, 0.42, 0.38, 6.4, 10, 0, [196, 44, 38], false);
      }

      // Golden lattice windows & doors on all 8 bays with warm illumination
      for (let w = 0; w < 8; w++) {
        const wAng = (w / 8) * Math.PI * 2 + Math.PI / 8;
        const winX = cx + Math.cos(wAng) * 7.74;
        const winZ = cz + Math.sin(wAng) * 7.74;
        b.addBox(winX, hallBaseY + 1.4, winZ, 2.6, 4.0, 0.28, wAng + Math.PI * 0.5, GOLD_GLOW, true);
      }

      // Blue-green and gold Dougong painted beam band (额枋旋子彩画)
      b.addCylinder(cx, hallBaseY + 5.9, cz, 8.1, 8.3, 0.5, 32, 0, DOUGONG_TEAL, false);
      b.addCylinder(cx, hallBaseY + 6.4, cz, 8.3, 8.8, 0.35, 32, 0, GOLD_GLOW, true);

      // Single-Eave Conical Cobalt-Blue Glazed Roof (单檐攒尖顶)
      const roofY = hallBaseY + 6.75;
      // Lower flared eave with blue glazed drip edge
      b.addCylinder(cx, roofY, cz, 11.6, 11.2, 0.45, 32, 0, BLUE_TRIM, false);
      // Flared lower roof curve
      b.addCylinder(cx, roofY + 0.45, cz, 11.2, 8.4, 2.5, 32, 0, COBALT_BLUE, false);
      // Mid conical roof curve
      b.addCylinder(cx, roofY + 2.95, cz, 8.4, 5.0, 3.2, 28, 0, COBALT_BLUE, false);
      // Upper steep cone
      b.addCylinder(cx, roofY + 6.15, cz, 5.0, 1.3, 3.1, 24, 0, COBALT_BLUE, false);

      // Large Gilded Bronze Finial (镏金宝顶: 通高达到 20m)
      const finialY = roofY + 9.25;
      b.addCylinder(cx, finialY, cz, 1.6, 1.4, 0.6, 16, 0, GOLD_FINIAL, true);
      b.addCylinder(cx, finialY + 0.6, cz, 1.4, 0.75, 1.3, 16, 0, GOLD_FINIAL, true);
      b.addCylinder(cx, finialY + 1.9, cz, 0.75, 0.12, 1.1, 12, 0, GOLD_FINIAL, true);
    },
  },

  // 2. Beihai White Dagoba (北海白塔)
  {
    id: 'beihai_white_dagoba',
    nameZh: '北海白塔',
    nameEn: 'Beihai White Dagoba',
    cx: -1236,
    cz: -1746,
    exclR: 52,
    height: 36,
    osmIds: [561193504, 39162078],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Mountain Peak Stone Courtyard Platform (琼华岛绝顶台基)
      // Extended southward to fully support both the Dagoba and Shanyin Hall with ZERO floating
      b.addFrustumBox(cx, y0, cz + 2.0, 30.0, 34.0, 27.6, 31.6, 3.2, 0, STONE_GREY, false);
      b.addBox(cx, y0 + 3.2, cz + 2.0, 28.0, 0.8, 32.0, 0, [226, 222, 216], false);
      // Perimeter terrace stone balustrades & night lanterns
      for (const lx of [-13.2, 13.2]) {
        for (const lz of [-13.2, 17.2]) {
          b.addCylinder(cx + lx, y0 + 4.0, cz + lz, 0.42, 0.32, 1.2, 8, 0, GOLD_GLOW, true);
        }
      }

      // 2. Front Shanyin Hall (善因殿) directly in front of White Dagoba on South
      // Built in乾隆十六年 (1751): "上圆下方" (Square glazed lower body, circular gilded pavilion top)
      const hallZ = cz + 12.0;
      const hallY = y0 + 4.0;
      // Glazed brick hall (5.4m x 5.4m x 4.4m) covered with 455 Buddha plaques
      b.addBox(cx, hallY, hallZ, 5.4, 4.4, 5.4, 0, GLAZED_GREEN, false);
      // Golden Buddha plaque bands on all 4 sides
      for (let r = 0; r < 3; r++) {
        b.addBox(cx, hallY + 1.0 + r * 1.0, hallZ + 2.72, 4.6, 0.45, 0.1, 0, GOLD_GLOW, true);
        b.addBox(cx, hallY + 1.0 + r * 1.0, hallZ - 2.72, 4.6, 0.45, 0.1, 0, GOLD_GLOW, true);
        b.addBox(cx + 2.72, hallY + 1.0 + r * 1.0, hallZ, 0.1, 0.45, 4.6, 0, GOLD_GLOW, true);
        b.addBox(cx - 2.72, hallY + 1.0 + r * 1.0, hallZ, 0.1, 0.45, 4.6, 0, GOLD_GLOW, true);
      }
      // Copper-vermilion entrance door on South face
      b.addBox(cx, hallY, hallZ + 2.72, 1.8, 3.2, 0.15, 0, VERMILION, false);
      b.addBox(cx, hallY + 1.1, hallZ + 2.74, 1.2, 1.8, 0.12, 0, GOLD_GLOW, true);
      // Lower square glazed roof with yellow trim
      b.addChineseRoof(cx, hallY + 4.4, hallZ, 6.2, 6.2, 1.6, 1.1, 0, GLAZED_GREEN, GLAZED_YELLOW, BRONZE_GOLD);
      // Upper circular gilded pavilion dome and finial (上圆铜铸鎏金顶)
      b.addCylinder(cx, hallY + 6.0, hallZ, 2.0, 1.8, 1.1, 20, 0, BRONZE_GOLD, true);
      b.addCylinder(cx, hallY + 7.1, hallZ, 1.8, 0.25, 1.3, 16, 0, GOLD_FINIAL, true);

      // 3. Tibetan White Dagoba (通高 35.9m)
      const baseTop = y0 + 4.0;

      // Multi-stepped Cruciform Sumeru Pedestal (折角须弥座: 18.2m base)
      // Tier 1: Main square base
      b.addBox(cx, baseTop, cz, 18.2, 1.6, 18.2, 0, XUMI_WHITE, false);
      // Tier 2: Stepped cruciform cross wings
      b.addBox(cx, baseTop + 0.3, cz, 20.2, 1.3, 13.8, 0, XUMI_WHITE, false);
      b.addBox(cx, baseTop + 0.3, cz, 13.8, 1.3, 20.2, 0, XUMI_WHITE, false);
      // Tier 3: Tapered waist with carved relief niches
      b.addFrustumBox(cx, baseTop + 1.6, cz, 16.8, 16.8, 15.2, 15.2, 1.6, 0, XUMI_WHITE, false);
      // Glowing corner bronze lanterns at waist
      for (const sx of [-7.2, 7.2]) {
        for (const sz of [-7.2, 7.2]) {
          b.addBox(cx + sx, baseTop + 1.9, cz + sz, 0.85, 1.1, 0.85, 0, GOLD_GLOW, true);
        }
      }
      // Tier 4: Upper platform
      b.addBox(cx, baseTop + 3.2, cz, 14.6, 1.2, 14.6, 0, XUMI_WHITE, false);

      // Three-Tier Circular Lotus Seat / Jingangquan (金刚圈与仰莲座)
      const lotusY = baseTop + 4.4;
      b.addCylinder(cx, lotusY, cz, 8.2, 7.8, 0.75, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, lotusY + 0.75, cz, 7.8, 7.4, 0.75, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, lotusY + 1.5, cz, 7.4, 7.0, 0.75, 32, 0, [246, 224, 180], false); // Lotus petals

      // Smooth Bulbous Inverted Alms-Bowl White Belly (覆钵塔身: max diameter ~14.2m, h ~11.2m)
      const bellyY = lotusY + 2.25;
      b.addCylinder(cx, bellyY, cz, 7.0, 7.4, 2.4, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 2.4, cz, 7.4, 7.2, 2.8, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 5.2, cz, 7.2, 6.4, 2.6, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 7.8, cz, 6.4, 5.0, 2.0, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 9.8, cz, 5.0, 3.4, 1.4, 28, 0, STUPA_WHITE, false);

      // South-facing Ceremonial Yanguangmen Shrine Niche (眼光门 / 时轮金刚门)
      const nicheZ = cz + 6.95;
      const nicheY = bellyY + 3.2;
      b.addBox(cx, nicheY, nicheZ, 2.2, 3.2, 0.45, 0, NICHE_RED, false);
      b.addBox(cx, nicheY + 0.5, nicheZ + 0.15, 1.4, 2.0, 0.25, 0, GOLD_GLOW, true);

      // Square Transition Pedestal (天盘座)
      const neckBaseY = bellyY + 11.2;
      b.addBox(cx, neckBaseY, cz, 4.6, 1.1, 4.6, 0, XUMI_WHITE, false);

      // 13-Ring Conical Dharmachakra Neck (十三天相轮: h = 8.5m, White stupa masonry)
      const neckY = neckBaseY + 1.1;
      b.addCylinder(cx, neckY, cz, 2.7, 1.55, 8.5, 24, 0, STUPA_WHITE, false);
      // 13 distinct stepped ring ribs
      for (let r = 0; r < 13; r++) {
        const ry = neckY + (r / 13) * 8.5;
        const tr = 2.7 - (r / 13) * 1.15 + 0.12;
        b.addCylinder(cx, ry, cz, tr, tr, 0.22, 24, 0, [242, 238, 228], false);
      }

      // Two-Tier Gilded Bronze Umbrella Canopies (铜铸鎏金两层华盖: 天盘与地盘) & 14 Wind Bells
      const canopyY = neckY + 8.5;
      b.addCylinder(cx, canopyY, cz, 3.3, 3.3, 0.45, 24, 0, BRONZE_GOLD, true);
      b.addCylinder(cx, canopyY + 0.45, cz, 2.5, 2.5, 0.35, 24, 0, BRONZE_GOLD, true);
      // Hanging bronze wind bells (风铎)
      for (let bell = 0; bell < 16; bell++) {
        const bAng = (bell / 16) * Math.PI * 2;
        const bx = cx + Math.cos(bAng) * 3.2;
        const bz = cz + Math.sin(bAng) * 3.2;
        b.addBox(bx, canopyY - 0.35, bz, 0.18, 0.35, 0.18, 0, GOLD_FINIAL, true);
      }

      // Flaming Pearl & Sun-Moon Finial (铜鎏金日、月、仰卷莲花与火焰宝珠: 通高达到 35.9m)
      const finialY = canopyY + 0.8;
      b.addCylinder(cx, finialY, cz, 1.3, 0.9, 0.8, 16, 0, GOLD_FINIAL, true);
      b.addCylinder(cx, finialY + 0.8, cz, 0.9, 0.2, 2.6, 16, 0, [255, 226, 92], true);
    },
  },

  // 3. Miaoying Temple White Dagoba (妙应寺白塔)
  {
    id: 'miaoying_white_dagoba',
    nameZh: '妙应寺白塔',
    nameEn: 'Miaoying Temple White Dagoba',
    cx: -3449,
    cz: -1712,
    exclR: 50,
    height: 51,
    osmIds: [1021040792, 164376450],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Temple Courtyard Platform & Front Hall (具六神通殿 / 白塔寺主殿)
      // Unified paved stone courtyard terrace
      b.addBox(cx, y0, cz + 13.0, 43.0, 0.6, 46.0, 0, COURTYARD_STONE, false);
      const hallZ = cz + 28.0;
      // Front Hall: 22m x 12m x 8.5m with marble podium, vermilion colonnade, grey-tiled double-curved roof
      b.addImperialPalace(cx, y0 + 0.6, hallZ, 22.0, 12.0, 1.0, 1, 4.4, 4.0, 0, GREY_TILE, TERRACOTTA_RED, MARBLE, false);

      // Courtyard Enclosure Walls: Continuous perimeter connecting cleanly to the hall
      for (const sideSign of [-1, 1]) {
        const wx = cx + sideSign * 20.5;
        // North-South side wall
        b.addBox(wx, y0 + 0.6, cz + 10.0, 1.0, 3.2, 36.0, 0, TERRACOTTA_RED, false);
        b.addBox(wx, y0 + 3.8, cz + 10.0, 1.4, 0.35, 36.2, 0, GREY_TILE, false);
        // East-West connecting wall tying side wall into the front hall gable wall
        const connCenterX = cx + sideSign * 15.75;
        b.addBox(connCenterX, y0 + 0.6, hallZ, 8.5, 3.2, 1.0, 0, TERRACOTTA_RED, false);
        b.addBox(connCenterX, y0 + 3.8, hallZ, 8.7, 0.35, 1.4, 0, GREY_TILE, false);
      }

      // 2. Massive Three-Stage Sumeru Pedestal (810 m² footprint, ~10m tall)
      // Lowest Square Podium: 30.5m x 30.5m x 3.6m at y0 + 0.6 (reaching y0 + 4.2m)
      b.addBox(cx, y0 + 0.6, cz, 30.5, 3.6, 30.5, 0, BASE_BRICK, false);
      // 108 Iron lantern niches perimeter parapet (108座铁灯龛)
      b.addBox(cx, y0 + 4.2, cz, 30.9, 0.45, 30.9, 0, [218, 214, 206], false);
      for (let s = -13; s <= 13; s += 3.8) {
        b.addBox(cx + s, y0 + 4.3, cz + 15.3, 0.6, 0.7, 0.3, 0, GOLD_GLOW, true);
        b.addBox(cx + s, y0 + 4.3, cz - 15.3, 0.6, 0.7, 0.3, 0, GOLD_GLOW, true);
        b.addBox(cx + 15.3, y0 + 4.3, cz + s, 0.3, 0.7, 0.6, 0, GOLD_GLOW, true);
        b.addBox(cx - 15.3, y0 + 4.3, cz + s, 0.3, 0.7, 0.6, 0, GOLD_GLOW, true);
      }

      // Middle "亚"-shaped (Cruciform folded-corner) Sumeru Pedestal (y0 + 4.2 to y0 + 7.4)
      b.addBox(cx, y0 + 4.2, cz, 26.0, 3.2, 19.5, 0, STUPA_WHITE, false);
      b.addBox(cx, y0 + 4.2, cz, 19.5, 3.2, 26.0, 0, STUPA_WHITE, false);

      // Upper "亚"-shaped Sumeru Pedestal (y0 + 7.4 to y0 + 10.4)
      b.addBox(cx, y0 + 7.4, cz, 21.8, 3.0, 16.2, 0, STUPA_WHITE, false);
      b.addBox(cx, y0 + 7.4, cz, 16.2, 3.0, 21.8, 0, STUPA_WHITE, false);
      // Glowing corner lanterns on upper Sumeru
      for (const lx of [-10.4, 10.4]) {
        for (const lz of [-10.4, 10.4]) {
          b.addBox(cx + lx, y0 + 10.2, cz + lz, 0.8, 1.1, 0.8, 0, GOLD_GLOW, true);
        }
      }

      // 3. Five-Tier Concentric Jingangquan Rings & Double Lotus Seat (五道金刚圈与巨型仰莲座)
      const ringY = y0 + 10.4;
      b.addCylinder(cx, ringY, cz, 10.8, 10.4, 0.9, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, ringY + 0.9, cz, 10.4, 10.0, 0.9, 32, 0, [238, 218, 176], false); // Lotus petals
      b.addCylinder(cx, ringY + 1.8, cz, 10.0, 9.6, 0.9, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, ringY + 2.7, cz, 9.6, 9.2, 0.9, 32, 0, STUPA_WHITE, false);

      // 4. Colossal Bulbous Whitewashed Belly (覆钵塔身: diameter 18.4m, radius 9.2m, h = 14.0m)
      const bellyY = ringY + 3.6; // y0 + 14.0
      // Smooth 4-tier profile reproducing Yuan Dynasty massive stupa proportions
      b.addCylinder(cx, bellyY, cz, 9.2, 9.6, 4.0, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 4.0, cz, 9.6, 9.2, 4.2, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 8.2, cz, 9.2, 7.5, 3.2, 32, 0, STUPA_WHITE, false);
      b.addCylinder(cx, bellyY + 11.4, cz, 7.5, 4.6, 2.6, 28, 0, STUPA_WHITE, false);

      // Dark Iron Reinforcement Straps (铁箍) closely hugging the curved belly
      const straps = [
        { dy: 2.2, r: 9.48 },
        { dy: 6.0, r: 9.48 },
        { dy: 9.4, r: 8.65 },
        { dy: 12.2, r: 6.80 },
      ];
      for (const st of straps) {
        b.addCylinder(cx, bellyY + st.dy, cz, st.r + 0.08, st.r + 0.08, 0.24, 32, 0, IRON_STRAP, false);
      }

      // 5. Waist Sumeru Transition Block (天盘基座)
      const neckBaseY = bellyY + 14.0; // y0 + 28.0
      b.addBox(cx, neckBaseY, cz, 6.4, 1.6, 6.4, 0, STUPA_WHITE, false);
      b.addCylinder(cx, neckBaseY + 1.6, cz, 4.8, 4.3, 1.0, 24, 0, [238, 218, 176], false);

      // 6. Stout 13-Ring Conical Dharmachakra Neck (十三天相轮: 12.6m tall)
      const neckY = neckBaseY + 2.6; // y0 + 30.6
      b.addCylinder(cx, neckY, cz, 4.3, 2.4, 12.6, 24, 0, TERRACOTTA_RED, false);
      // 13 Distinct horizontal ring ribs with gilded bronze accents
      for (let r = 0; r < 13; r++) {
        const ry = neckY + (r / 13) * 12.6;
        const tr = 4.3 - (r / 13) * 1.9 + 0.18;
        b.addCylinder(cx, ry, cz, tr, tr, 0.32, 24, 0, GILT_BRONZE, true);
      }

      // 7. Giant Bronze Umbrella Canopy (华盖 / 天盘: diameter 9.7m, h = 1.3m)
      const canopyY = neckY + 12.6; // y0 + 43.2
      b.addCylinder(cx, canopyY, cz, 4.85, 4.85, 1.3, 32, 0, GILT_BRONZE, true);
      // 36 Pierced bronze tassel plates (华鬘) and hanging bells (风铎) ringed around circumference
      for (let bell = 0; bell < 36; bell++) {
        const bAng = (bell / 36) * Math.PI * 2;
        const bx = cx + Math.cos(bAng) * 4.82;
        const bz = cz + Math.sin(bAng) * 4.82;
        b.addBox(bx, canopyY - 0.75, bz, 0.28, 0.75, 0.28, 0, GOLD_FINIAL, true);
      }

      // 8. Gilded Miniature Stupa Finial (铜质鎏金空心小喇嘛塔刹: 通高达到 50.9m)
      const finialY = canopyY + 1.3; // y0 + 44.5
      b.addBox(cx, finialY, cz, 2.8, 1.0, 2.8, 0, GILT_BRONZE, true);
      b.addCylinder(cx, finialY + 1.0, cz, 1.7, 1.3, 1.8, 16, 0, GILT_BRONZE, true);
      b.addCylinder(cx, finialY + 2.8, cz, 1.2, 0.4, 2.2, 16, 0, [255, 232, 98], true);
      b.addCylinder(cx, finialY + 5.0, cz, 0.55, 0.12, 1.4, 12, 0, [255, 238, 115], true);
    },
  },

  // 4. Tianning Temple Pagoda (天宁寺塔)
  {
    id: 'tianning_pagoda',
    nameZh: '天宁寺塔',
    nameEn: 'Tianning Temple Pagoda',
    cx: -4928,
    cz: 1661,
    exclR: 42,
    height: 58,
    osmIds: [532863319, 435548905],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Temple Courtyard Platform & Mahavira Hall (大雄宝殿) in front
      b.addBox(cx, y0, cz + 15.0, 36.0, 0.6, 48.0, 0, COURTYARD_STONE, false);
      const hallZ = cz + 32.0;
      // Hall sized and positioned so the pagoda base, Sumeru tiers, and first-story reliefs remain clearly visible
      b.addImperialPalace(cx, y0 + 0.6, hallZ, 20.0, 10.5, 0.8, 1, 3.8, 3.6, 0, [92, 96, 102], VERMILION, [238, 234, 226], false);

      // 2. Pagoda Base (塔座: y0 + 0.6 to y0 + 11.2m)
      // Square Brick Platform Base (月台): 26m x 26m x 2.2m
      b.addBox(cx, y0 + 0.6, cz, 26.0, 2.2, 26.0, 0, PAGODA_BRICK, false);
      // South steps up to platform
      b.addBox(cx, y0 + 0.6, cz + 13.8, 5.0, 1.4, 1.6, 0, PAGODA_BRICK, false);

      // Lower Octagonal Sumeru Tier (下层八角须弥座: 狮兽头与金刚力士雕刻)
      b.addCylinder(cx, y0 + 2.8, cz, 11.5, 11.0, 2.4, 8, Math.PI / 8, PAGODA_BRICK, false);
      // Relief carved panels on each octagonal face
      for (let f = 0; f < 8; f++) {
        const a = (f / 8) * Math.PI * 2;
        const fx = cx + Math.cos(a) * 11.1;
        const fz = cz + Math.sin(a) * 11.1;
        b.addBox(fx, y0 + 3.2, fz, 2.4, 1.4, 0.45, a + Math.PI * 0.5, RELIEF_STONE, false);
      }

      // Upper Octagonal Sumeru Tier (上层八角须弥座: 壶门坐佛雕刻)
      b.addCylinder(cx, y0 + 5.2, cz, 10.6, 10.2, 2.2, 8, Math.PI / 8, RELIEF_STONE, false);
      for (let f = 0; f < 8; f++) {
        const a = (f / 8) * Math.PI * 2 + Math.PI / 8;
        const fx = cx + Math.cos(a) * 10.3;
        const fz = cz + Math.sin(a) * 10.3;
        b.addBox(fx, y0 + 5.6, fz, 2.2, 1.2, 0.4, a + Math.PI * 0.5, [228, 222, 212], false);
      }

      // Flat Balcony Seat (平座勾栏) with brick-carved railings & night illumination
      b.addCylinder(cx, y0 + 7.4, cz, 10.4, 10.4, 1.4, 8, Math.PI / 8, PAGODA_BRICK, false);
      b.addCylinder(cx, y0 + 8.4, cz, 10.45, 10.45, 0.45, 8, Math.PI / 8, LANTERN_GLOW, true, false);

      // Three-Tier Overlapping Giant Upturned Lotus Petal Pedestal (三层巨型仰莲座)
      b.addCylinder(cx, y0 + 8.8, cz, 9.8, 9.4, 0.8, 8, Math.PI / 8, LOTUS_STONE, false);
      b.addCylinder(cx, y0 + 9.6, cz, 9.4, 9.0, 0.8, 8, Math.PI / 8, LOTUS_STONE, false);
      b.addCylinder(cx, y0 + 10.4, cz, 9.0, 8.5, 0.8, 8, Math.PI / 8, LOTUS_STONE, false);

      // 3. First-Story Body (第一层高大塔身: h = 10.6m, y0 + 11.2m to y0 + 21.8m)
      const bodyY = y0 + 11.2;
      b.addCylinder(cx, bodyY, cz, 8.4, 8.0, 10.6, 8, Math.PI / 8, PAGODA_BRICK, false);

      // Four Cardinal Arched Portals (半圆拱券假门 on North, South, East, West)
      const cardinalAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      for (const cAng of cardinalAngles) {
        const px = cx + Math.cos(cAng) * 8.05;
        const pz = cz + Math.sin(cAng) * 8.05;
        const pYaw = cAng + Math.PI * 0.5;
        // Outer stone arch frame
        b.addBox(px, bodyY + 1.2, pz, 2.8, 5.2, 0.45, pYaw, RELIEF_STONE, false);
        // Recessed arched doorway
        b.addBox(px, bodyY + 1.2, pz, 2.0, 4.4, 0.65, pYaw, PORTAL_DARK, false);
        // Interior shrine Buddha statue illumination
        b.addBox(px, bodyY + 2.2, pz, 1.3, 2.6, 0.55, pYaw, LANTERN_GLOW, true);
      }

      // Four Intercardinal Blind Windows (直棂盲窗 on NE, NW, SE, SW)
      const intercardinalAngles = [
        Math.PI * 0.25,
        Math.PI * 0.75,
        Math.PI * 1.25,
        Math.PI * 1.75,
      ];
      for (const iAng of intercardinalAngles) {
        const wx = cx + Math.cos(iAng) * 8.05;
        const wz = cz + Math.sin(iAng) * 8.05;
        const wYaw = iAng + Math.PI * 0.5;
        b.addBox(wx, bodyY + 2.0, wz, 2.6, 4.0, 0.35, wYaw, RELIEF_STONE, false);
        // Straight mullions
        for (let m = -0.8; m <= 0.8; m += 0.4) {
          const mx = wx + Math.cos(wYaw) * m;
          const mz = wz + Math.sin(wYaw) * m;
          b.addBox(mx, bodyY + 2.2, mz, 0.15, 3.6, 0.4, wYaw, PAGODA_TRIM, false);
        }
      }

      // Corner Brick Pilasters with Flying Dragon Carvings (角柱蟠龙)
      for (let c = 0; c < 8; c++) {
        const cAng = (c / 8) * Math.PI * 2 + Math.PI / 8;
        const colX = cx + Math.cos(cAng) * 8.1;
        const colZ = cz + Math.sin(cAng) * 8.1;
        b.addCylinder(colX, bodyY, colZ, 0.52, 0.48, 10.6, 8, 0, RELIEF_STONE, false);
      }

      // Elaborate Brick Dougong Bracket Band (仿木砖砌斗栱: 双抄单昂) at top of first story
      b.addCylinder(cx, bodyY + 9.8, cz, 8.1, 9.3, 0.8, 8, Math.PI / 8, PAGODA_TRIM, false);
      b.addCylinder(cx, bodyY + 10.6, cz, 9.2, 9.2, 0.2, 8, Math.PI / 8, LANTERN_GLOW, true, false);

      // 4. Thirteen Closely-Spaced Projecting Eaves (十三层密檐)
      // True Liao Dynasty architectural profile:
      // - Under-eave corbeled Dougong brackets projecting outward
      // - Downward-sloping brick roof tiles to drip edge
      // - Parabolic curve taper ("券杀"弧度) from story 1 to story 13
      let curY = bodyY + 10.8;
      const nStories = 13;
      for (let i = 0; i < nStories; i++) {
        const t = i / (nStories - 1);
        // Eave radius tapers smoothly from 9.4m down to 5.25m
        const rEave = 9.4 * (1.0 - t * 0.44);
        const rWall = rEave * 0.70;
        const rBracket = rEave * 0.86;
        const storyH = 2.3;

        // 1. Under-eave brick Dougong bracket corbel (expanding outward from wall)
        b.addCylinder(cx, curY, cz, rWall, rBracket, 0.45, 8, Math.PI / 8, PAGODA_TRIM, false);
        // 2. Projecting downward-sloped brick tile eave
        b.addCylinder(cx, curY + 0.4, cz, rEave, rWall * 0.98, 0.55, 8, Math.PI / 8, EAVE_DARK, false);
        // 3. Upturned eave drip edge rim
        b.addCylinder(cx, curY + 0.35, cz, rEave + 0.12, rEave, 0.15, 8, Math.PI / 8, PAGODA_TRIM, false);

        // 4. Short octagonal wall band between eaves
        const isLitStory = i % 2 === 0;
        b.addCylinder(cx, curY + 0.95, cz, rWall, rWall * 0.97, 1.35, 8, Math.PI / 8, PAGODA_BRICK, false);
        // Miniature window niches with warm night glow on alternating tiers
        if (isLitStory) {
          b.addCylinder(cx, curY + 1.25, cz, rWall + 0.05, rWall + 0.05, 0.5, 8, Math.PI / 8, LANTERN_GLOW, true, false);
        }

        curY += storyH;
      }

      // 5. Pagoda Spire & Stupa Finial (两层八角仰莲座、宝瓶、相轮与刹杆: 通高达到 57.8m)
      // Double-tier octagonal lotus base
      b.addCylinder(cx, curY, cz, 3.6, 3.0, 1.2, 8, Math.PI / 8, LOTUS_STONE, false);
      // Gilded bronze jewel finial and spire pole
      b.addCylinder(cx, curY + 1.2, cz, 2.0, 0.35, 5.2, 12, 0, SPIRA_GOLD, true);
    },
  },
];
