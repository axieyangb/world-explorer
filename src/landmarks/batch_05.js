/**
 * Batch 05: 4 Beijing Landmarks
 * - yuquan_pagoda (玉泉山玉峰塔 / 定光塔)
 * - summer_palace_foxiangge (颐和园佛香阁)
 * - deshengmen_arrow_tower (德胜门箭楼)
 * - yongdingmen_gate (永定门城楼)
 */

export const BATCH_05 = [
  // 1. Yufeng Pagoda on Yuquan Hill (玉泉山玉峰塔)
  {
    id: 'yuquan_pagoda',
    nameZh: '玉泉山玉峰塔',
    nameEn: 'Yufeng Pagoda on Yuquan Hill',
    category: 'pagoda',
    cx: -13220,
    cz: -9301,
    exclR: 45,
    height: 48,
    osmIds: [942237399],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;
      if (cz === undefined) {
        cz = this.cz;
        y0 = cx;
        cx = this.cx;
      }

      const STONE_BASE = [224, 218, 206];
      const MARBLE_WHITE = [244, 240, 232];
      const BRICK_WALL = [236, 226, 202]; // Authentic light apricot-yellow brick (浅杏黄砖石)
      const ROOF_GREY = [92, 96, 102];
      const GLAZE_GREEN = [52, 130, 86];
      const DOUGONG_TEAL = [42, 118, 96];
      const GOLD_BRONZE = [248, 204, 72];
      const GOLD_FINIAL = [255, 222, 85];
      const LIT_WARM = [255, 216, 120];
      const BLIND_WIN = [190, 180, 166];

      // 1. Stepped Octagonal Sumeru Pedestal (须弥座台基) - compact base within ±11m
      b.addCylinder(cx, y0, cz, 8.4, 8.0, 1.2, 8, Math.PI / 8, STONE_BASE, false);
      b.addCylinder(cx, y0 + 1.2, cz, 8.0, 7.4, 1.2, 8, Math.PI / 8, MARBLE_WHITE, false);
      b.addCylinder(cx, y0 + 2.4, cz, 7.4, 6.8, 1.0, 8, Math.PI / 8, STONE_BASE, false);
      // Base balustrade ring
      b.addCylinder(cx, y0 + 3.4, cz, 6.8, 6.5, 0.6, 8, Math.PI / 8, MARBLE_WHITE, false);

      // 2. Seven Stories (八角七层楼阁式) with Staggered Door/Window Orientation
      let curY = y0 + 4.0;
      const totalStories = 7;
      for (let s = 0; s < totalStories; s++) {
        const t = s / (totalStories - 1);
        const rBase = 5.4 * (1.0 - t * 0.38);
        const rTop = rBase * 0.93;
        const storyH = 4.0 - t * 0.5;

        // Octagonal brick body
        b.addCylinder(cx, curY, cz, rBase, rTop, storyH, 8, Math.PI / 8, BRICK_WALL, false);

        // 8-face openings: Stories 1, 3, 5, 7 have lit arched portals on cardinal faces;
        // stories 2, 4, 6 have lit arched portals on diagonal faces (anti-crack staggered design)
        const rMid = (rBase + rTop) * 0.5 * 0.98;
        const isOddStory = s % 2 === 0;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const px = cx + Math.sin(angle) * rMid;
          const pz = cz + Math.cos(angle) * rMid;
          const isCardinal = i % 2 === 0;
          const isLitNiche = isOddStory ? isCardinal : !isCardinal;

          if (isLitNiche) {
            // White stone portal frame + golden interior illumination
            b.addBox(px, curY + storyH * 0.16, pz, 1.3, storyH * 0.66, 0.42, angle, MARBLE_WHITE, false);
            b.addBox(px, curY + storyH * 0.20, pz, 0.85, storyH * 0.58, 0.48, angle, LIT_WARM, true);
          } else {
            // Carved blind brick lattice window
            b.addBox(px, curY + storyH * 0.26, pz, 1.05, storyH * 0.50, 0.30, angle, BLIND_WIN, false);
          }
        }

        // Under-eave Dougong bracket band + warm lantern strip
        b.addCylinder(cx, curY + storyH - 0.5, cz, rTop * 1.04, rTop * 1.08, 0.38, 8, Math.PI / 8, DOUGONG_TEAL, false);
        b.addCylinder(cx, curY + storyH - 0.12, cz, rTop * 1.09, rTop * 1.11, 0.18, 8, Math.PI / 8, [255, 206, 112], true);

        // Projecting upturned octagonal eave (grey tile slope + emerald-green glazed trim)
        const eaveR = rTop * 1.38;
        b.addCylinder(cx, curY + storyH, cz, rTop * 1.06, eaveR, 0.48, 8, Math.PI / 8, GLAZE_GREEN, false);
        b.addCylinder(cx, curY + storyH + 0.25, cz, eaveR * 0.96, rTop * 0.95, 0.45, 8, Math.PI / 8, ROOF_GREY, false);

        curY += storyH + 0.75;
      }

      // 3. Tall Gilded Spire (铜质相轮宝珠刹, reaching exactly 48m)
      // Octagonal lotus petal pedestal
      b.addCylinder(cx, curY, cz, 2.0, 1.6, 1.2, 8, Math.PI / 8, GOLD_BRONZE, false);
      // Conical 7-ring Dharmachakra mast
      b.addCylinder(cx, curY + 1.2, cz, 1.35, 0.65, 5.0, 12, 0, GOLD_BRONZE, true);
      // Gilded bronze canopy
      b.addCylinder(cx, curY + 6.2, cz, 1.5, 1.5, 0.4, 12, 0, GOLD_FINIAL, true);
      // Bulbous calabash orb & jewel
      b.addCylinder(cx, curY + 6.6, cz, 1.05, 0.3, 3.2, 12, 0, GOLD_FINIAL, true);
      // Needle tip reaching 48m total height
      const targetRemH = 48.0 - (curY + 9.8 - y0);
      const needleH = Math.max(0.6, targetRemH);
      b.addStrut(cx, curY + 9.8, cz, cx, curY + 9.8 + needleH, cz, 0.22, [255, 230, 100], true);
    },
  },

  // 2. Tower of Buddhist Incense at Summer Palace (颐和园佛香阁)
  {
    id: 'summer_palace_foxiangge',
    nameZh: '颐和园佛香阁',
    nameEn: 'Tower of Buddhist Incense (Summer Palace)',
    category: 'imperial',
    cx: -11059,
    cz: -9896,
    exclR: 42,
    height: 41,
    osmIds: [43977851, 57941063],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;
      if (cz === undefined) {
        cz = this.cz;
        y0 = cx;
        cx = this.cx;
      }

      const FORTRESS_GREY = [128, 132, 138];
      const MARBLE_WHITE = [244, 241, 235];
      const VERMILION = [182, 42, 36];
      const GOLD_ROOF = [232, 176, 38];
      const GREEN_TRIM = [52, 124, 80];
      const DOUGONG_TEAL = [42, 118, 96];
      const GOLD_FINIAL = [252, 212, 72];
      const LIT_WARM = [255, 216, 120];
      const LANTERN_STRIP = [255, 205, 115];

      // 1. Monumental 19.5m Battered Fortress Foundation (万寿山前山20米巨型城台基座 52x38m -> 46x32m)
      const fortH = 19.5;
      b.addFrustumBox(cx, y0, cz, 52, 38, 46, 32, fortH, 0, FORTRESS_GREY, false);
      // Fortress perimeter parapet & floodlight line
      b.addBox(cx, y0 + fortH, cz, 46.6, 0.45, 32.6, 0, MARBLE_WHITE, false);
      b.addBox(cx, y0 + fortH - 0.25, cz, 46.4, 0.25, 32.4, 0, LANTERN_STRIP, true);

      // Symmetrical "八" shaped climbing stone staircases (八字朝山石阶) on South face
      // Solid stepped buttress ramps hugging the sloping south wall (from cz + 18.5 at base to cz + 15.7 at top)
      const numStairSteps = 10;
      for (let k = 0; k < numStairSteps; k++) {
        const t = (k + 1) / numStairSteps;
        const stepY = y0 + t * fortH;
        const curZ = cz + 18.5 - t * 2.8;
        // East flight: climbs from outer wing towards center gate
        const ex = cx + 18.0 - t * 12.0;
        b.addBox(ex, y0, curZ, 3.4, stepY - y0, 2.2, 0, FORTRESS_GREY, false);

        // West flight: climbs from outer wing towards center gate
        const wx = cx - 18.0 + t * 12.0;
        b.addBox(wx, y0, curZ, 3.4, stepY - y0, 2.2, 0, FORTRESS_GREY, false);
      }
      // Continuous white marble handrails following the incline
      b.addStrut(cx + 19.7, y0 + 1.2, cz + 18.8, cx + 7.7, y0 + fortH + 1.0, cz + 16.0, 0.35, MARBLE_WHITE, false);
      b.addStrut(cx + 16.3, y0 + 1.2, cz + 18.8, cx + 4.3, y0 + fortH + 1.0, cz + 16.0, 0.35, MARBLE_WHITE, false);
      b.addStrut(cx - 19.7, y0 + 1.2, cz + 18.8, cx - 7.7, y0 + fortH + 1.0, cz + 16.0, 0.35, MARBLE_WHITE, false);
      b.addStrut(cx - 16.3, y0 + 1.2, cz + 18.8, cx - 4.3, y0 + fortH + 1.0, cz + 16.0, 0.35, MARBLE_WHITE, false);

      // South central white marble arched entrance portal
      b.addFrustumBox(cx, y0, cz + 17.6, 7.2, 2.4, 6.2, 1.8, 6.8, 0, MARBLE_WHITE, false);
      b.addFrustumBox(cx, y0, cz + 17.7, 4.4, 2.0, 3.8, 1.6, 5.4, 0, [32, 28, 28], false);
      // Central imperial dragon carved ramp (御路丹陛)
      b.addFrustumBox(cx, y0, cz + 17.2, 6.8, 2.8, 5.4, 1.4, 11.5, 0, [236, 232, 224], false);

      // 2. Platform Courtyard Wall & Two-Tier Xumi Base (y = y0 + fortH)
      const platY = y0 + fortH;
      // Perimeter crimson courtyard wall with golden glazed coping (with south entrance gap)
      b.addBox(cx, platY, cz - 14.5, 42.0, 1.8, 0.7, 0, VERMILION, false);
      b.addBox(cx, platY + 1.8, cz - 14.5, 42.4, 0.35, 1.0, 0, GOLD_ROOF, true);
      b.addBox(cx + 21.5, platY, cz, 0.7, 1.8, 28.5, 0, VERMILION, false);
      b.addBox(cx + 21.5, platY + 1.8, cz, 1.0, 0.35, 28.9, 0, GOLD_ROOF, true);
      b.addBox(cx - 21.5, platY, cz, 0.7, 1.8, 28.5, 0, VERMILION, false);
      b.addBox(cx - 21.5, platY + 1.8, cz, 1.0, 0.35, 28.9, 0, GOLD_ROOF, true);
      b.addBox(cx - 13.0, platY, cz + 14.5, 15.0, 1.8, 0.7, 0, VERMILION, false);
      b.addBox(cx - 13.0, platY + 1.8, cz + 14.5, 15.4, 0.35, 1.0, 0, GOLD_ROOF, true);
      b.addBox(cx + 13.0, platY, cz + 14.5, 15.0, 1.8, 0.7, 0, VERMILION, false);
      b.addBox(cx + 13.0, platY + 1.8, cz + 14.5, 15.4, 0.35, 1.0, 0, GOLD_ROOF, true);

      // White marble Sumeru terrace for Foxiangge
      b.addMarbleTerrace(cx, platY, cz, 23.0, 23.0, 1.0, 2, 0, MARBLE_WHITE);

      // 3. Tower of Buddhist Incense (八面三层四重檐攒尖顶, total height reaching exactly 41m above y0)
      const baseTowerY = platY + 1.0;

      // --- Story 1 (y0 + 20.5 to y0 + 24.5) ---
      const r1 = 9.2;
      const h1 = 4.0;
      b.addCylinder(cx, baseTowerY, cz, r1, r1 * 0.98, h1, 8, Math.PI / 8, VERMILION, false);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const colX = cx + Math.sin(a) * r1 * 0.99;
        const colZ = cz + Math.cos(a) * r1 * 0.99;
        b.addCylinder(colX, baseTowerY, colZ, 0.40, 0.38, h1, 8, 0, [196, 46, 38], false);
        const aMid = a + Math.PI / 8;
        const winX = cx + Math.sin(aMid) * r1 * 0.95;
        const winZ = cz + Math.cos(aMid) * r1 * 0.95;
        b.addBox(winX, baseTowerY + 0.9, winZ, 2.4, 2.6, 0.3, aMid, LIT_WARM, true);
      }
      b.addCylinder(cx, baseTowerY + h1 - 0.45, cz, r1 * 1.04, r1 * 1.08, 0.38, 8, Math.PI / 8, DOUGONG_TEAL, false);
      b.addCylinder(cx, baseTowerY + h1 - 0.12, cz, r1 * 1.09, r1 * 1.11, 0.18, 8, Math.PI / 8, LANTERN_STRIP, true);
      // Eave 1
      b.addCylinder(cx, baseTowerY + h1, cz, r1 * 1.06, r1 * 1.34, 0.45, 8, Math.PI / 8, GREEN_TRIM, false);
      b.addCylinder(cx, baseTowerY + h1 + 0.22, cz, r1 * 1.30, r1 * 0.96, 0.48, 8, Math.PI / 8, GOLD_ROOF, false);

      // --- Mezzanine Eave 2 (暗层重檐 / waist eave: y0 + 25.2 to 26.4) ---
      const yEave2 = baseTowerY + h1 + 0.7;
      b.addCylinder(cx, yEave2, cz, 8.0, 8.0, 0.5, 8, Math.PI / 8, VERMILION, false);
      b.addCylinder(cx, yEave2 + 0.5, cz, 8.0 * 1.04, 8.0 * 1.30, 0.40, 8, Math.PI / 8, GREEN_TRIM, false);
      b.addCylinder(cx, yEave2 + 0.7, cz, 8.0 * 1.28, 8.0 * 0.96, 0.45, 8, Math.PI / 8, GOLD_ROOF, false);

      // --- Story 2 (y0 + 26.35 to 29.95) ---
      const yStory2 = yEave2 + 1.15;
      const r2 = 7.6;
      const h2 = 3.6;
      b.addCylinder(cx, yStory2, cz, r2, r2 * 0.98, h2, 8, Math.PI / 8, VERMILION, false);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const colX = cx + Math.sin(a) * r2 * 0.99;
        const colZ = cz + Math.cos(a) * r2 * 0.99;
        b.addCylinder(colX, yStory2, colZ, 0.36, 0.34, h2, 8, 0, [196, 46, 38], false);
        const aMid = a + Math.PI / 8;
        const winX = cx + Math.sin(aMid) * r2 * 0.95;
        const winZ = cz + Math.cos(aMid) * r2 * 0.95;
        b.addBox(winX, yStory2 + 0.8, winZ, 2.0, 2.3, 0.28, aMid, LIT_WARM, true);
      }
      b.addCylinder(cx, yStory2 + h2 - 0.42, cz, r2 * 1.04, r2 * 1.08, 0.35, 8, Math.PI / 8, DOUGONG_TEAL, false);
      b.addCylinder(cx, yStory2 + h2 - 0.12, cz, r2 * 1.09, r2 * 1.11, 0.18, 8, Math.PI / 8, LANTERN_STRIP, true);
      // Eave 3
      b.addCylinder(cx, yStory2 + h2, cz, r2 * 1.06, r2 * 1.32, 0.42, 8, Math.PI / 8, GREEN_TRIM, false);
      b.addCylinder(cx, yStory2 + h2 + 0.22, cz, r2 * 1.28, r2 * 0.95, 0.46, 8, Math.PI / 8, GOLD_ROOF, false);

      // --- Story 3 (y0 + 30.63 to 33.83) ---
      const yStory3 = yStory2 + h2 + 0.68;
      const r3 = 6.2;
      const h3 = 3.2;
      b.addCylinder(cx, yStory3, cz, r3, r3 * 0.96, h3, 8, Math.PI / 8, VERMILION, false);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const colX = cx + Math.sin(a) * r3 * 0.99;
        const colZ = cz + Math.cos(a) * r3 * 0.99;
        b.addCylinder(colX, yStory3, colZ, 0.32, 0.30, h3, 8, 0, [196, 46, 38], false);
        const aMid = a + Math.PI / 8;
        const winX = cx + Math.sin(aMid) * r3 * 0.95;
        const winZ = cz + Math.cos(aMid) * r3 * 0.95;
        b.addBox(winX, yStory3 + 0.7, winZ, 1.6, 2.0, 0.25, aMid, LIT_WARM, true);
      }
      b.addCylinder(cx, yStory3 + h3 - 0.38, cz, r3 * 1.04, r3 * 1.08, 0.32, 8, Math.PI / 8, DOUGONG_TEAL, false);
      b.addCylinder(cx, yStory3 + h3 - 0.12, cz, r3 * 1.09, r3 * 1.11, 0.18, 8, Math.PI / 8, LANTERN_STRIP, true);

      // --- Eave 4 / Main Octagonal Pyramidal Roof (八角攒尖顶) & Gilded Finial ---
      const yRoof = yStory3 + h3;
      // Flared lower skirt
      b.addCylinder(cx, yRoof, cz, r3 * 1.05, r3 * 1.34, 0.45, 8, Math.PI / 8, GREEN_TRIM, false);
      // Concave steep slope
      b.addCylinder(cx, yRoof + 0.28, cz, r3 * 1.30, r3 * 0.65, 1.7, 8, Math.PI / 8, GOLD_ROOF, false);
      b.addCylinder(cx, yRoof + 1.98, cz, r3 * 0.65, 1.5, 1.6, 8, Math.PI / 8, GOLD_ROOF, false);

      // Gilded Bronze Calabash Finial (镀金铜宝顶) reaching exactly 41m above y0
      const yFinial = yRoof + 3.58;
      b.addCylinder(cx, yFinial, cz, 1.6, 1.25, 0.55, 8, Math.PI / 8, GOLD_FINIAL, true);
      b.addCylinder(cx, yFinial + 0.55, cz, 1.05, 0.25, 1.5, 12, 0, GOLD_FINIAL, true);
      const remH = 41.0 - (yFinial + 2.05 - y0);
      const tipH = Math.max(0.4, remH);
      b.addStrut(cx, yFinial + 2.05, cz, cx, yFinial + 2.05 + tipH, cz, 0.22, [255, 235, 110], true);
    },
  },

  // 3. Deshengmen Arrow Tower (德胜门箭楼)
  {
    id: 'deshengmen_arrow_tower',
    nameZh: '德胜门箭楼',
    nameEn: 'Deshengmen Arrow Tower',
    category: 'gate',
    cx: -2063,
    cz: -4423,
    exclR: 55,
    height: 32,
    osmIds: [958430463, 130222178],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;
      if (cz === undefined) {
        cz = this.cz;
        y0 = cx;
        cx = this.cx;
      }

      const BASTION_GREY = [122, 126, 132];
      const WHITE_STONE = [242, 240, 234];
      const TOWER_GREY = [116, 120, 126];
      const VERMILION = [176, 42, 36];
      const ROOF_GREY = [88, 92, 98];
      const GREEN_TRIM = [48, 128, 84];
      const GOLD_RIDGE = [246, 202, 70];
      const LIT_WARM = [255, 212, 120];
      const TUNNEL_DARK = [32, 28, 28];

      // 1. Battered Fortress Bastion (城台 48x30x12.6m -> 42x25m)
      const baseH = 12.6;
      b.addFrustumBox(cx, y0, cz, 48, 30, 42, 25, baseH, 0, BASTION_GREY, false);
      // Top marble string course & crenellated parapet (雉堞女墙)
      b.addBox(cx, y0 + baseH, cz, 42.6, 1.1, 25.6, 0, WHITE_STONE, false);
      b.addBox(cx, y0 + baseH - 0.35, cz, 42.3, 0.25, 25.3, 0, [255, 205, 115], true);

      // Three south-facing doorway gates (城台南侧三樘过梁式门, facing inner city/瓮城)
      // Sloping with the battered south wall so there is zero protrusion
      b.addFrustumBox(cx, y0, cz + 14.3, 4.4, 1.4, 4.2, 1.1, 5.8, 0, TUNNEL_DARK, false);
      b.addBox(cx, y0 + 5.8, cz + 13.7, 5.0, 0.6, 0.5, 0, WHITE_STONE, false); // lintel frame

      b.addFrustumBox(cx + 9.5, y0, cz + 14.3, 3.2, 1.4, 3.0, 1.1, 5.0, 0, TUNNEL_DARK, false);
      b.addBox(cx + 9.5, y0 + 5.0, cz + 13.8, 3.8, 0.6, 0.5, 0, WHITE_STONE, false);

      b.addFrustumBox(cx - 9.5, y0, cz + 14.3, 3.2, 1.4, 3.0, 1.1, 5.0, 0, TUNNEL_DARK, false);
      b.addBox(cx - 9.5, y0 + 5.0, cz + 13.8, 3.8, 0.6, 0.5, 0, WHITE_STONE, false);

      // 2. "前楼后厦" Arrow Tower Structure (topY = y0 + 13.0m)
      const topY = y0 + baseH + 0.4;
      b.addBox(cx, y0 + baseH, cz, 38.0, 0.4, 23.0, 0, WHITE_STONE, false); // Stone terrace

      // Main North Arrow Tower (前楼, facing outer defense: 32x11.2x9.6m)
      const northTowerZ = cz - 2.8;
      const hallH = 9.2;
      b.addBox(cx, topY, northTowerZ, 32.0, hallH, 11.2, 0, TOWER_GREY, false);

      // South Rear Barbican (后厦 / 抱厦, facing city interior: 22x6.8x7.8m)
      const southBarbicanZ = cz + 5.2;
      const barbicanH = 7.8;
      b.addBox(cx, topY, southBarbicanZ, 22.0, barbicanH, 6.8, 0, VERMILION, false);

      // Vermilion colonnade on south face of 抱厦 (5 bays, 6 columns)
      for (let c = 0; c <= 5; c++) {
        const lx = -9.0 + c * 3.6;
        b.addCylinder(cx + lx, topY, southBarbicanZ + 3.45, 0.36, 0.34, barbicanH, 8, 0, [192, 46, 38], false);
        if (c < 5) {
          b.addBox(cx + lx + 1.8, topY + 1.2, southBarbicanZ + 3.35, 2.4, barbicanH * 0.58, 0.25, 0, LIT_WARM, true);
        }
      }

      // 3. Exactly 82 White-Framed Arrow Slits (箭窗)
      // North Face (前楼): 4 tiers × 12 columns = 48 slits
      for (let r = 0; r < 4; r++) {
        const wy = topY + 1.1 + r * 2.0;
        for (let col = 0; col < 12; col++) {
          const wx = cx - 13.2 + col * 2.4;
          const wz = northTowerZ - 5.65;
          const isLit = (r + col) % 3 === 0;
          b.addBox(wx, wy, wz, 1.35, 1.35, 0.25, 0, WHITE_STONE, false);
          b.addBox(wx, wy + 0.1, wz - 0.08, 0.75, 0.85, 0.22, 0, isLit ? LIT_WARM : TUNNEL_DARK, isLit);
        }
      }

      // East & West Faces of 前楼: 4 tiers × 4 columns = 16 slits per side (32 total)
      for (let r = 0; r < 4; r++) {
        const wy = topY + 1.1 + r * 2.0;
        for (let col = 0; col < 4; col++) {
          const wz = northTowerZ - 3.6 + col * 2.4;
          const isLit = (r + col) % 2 === 0;
          // East side
          b.addBox(cx + 16.05, wy, wz, 0.25, 1.35, 1.35, 0, WHITE_STONE, false);
          b.addBox(cx + 16.13, wy + 0.1, wz, 0.22, 0.85, 0.75, 0, isLit ? LIT_WARM : TUNNEL_DARK, isLit);
          // West side
          b.addBox(cx - 16.05, wy, wz, 0.25, 1.35, 1.35, 0, WHITE_STONE, false);
          b.addBox(cx - 16.13, wy + 0.1, wz, 0.22, 0.85, 0.75, 0, isLit ? LIT_WARM : TUNNEL_DARK, isLit);
        }
      }

      // East & West Faces of 抱厦: 1 slit per side (2 slits total -> 48 + 32 + 2 = 82)
      for (const xSign of [-1, 1]) {
        const wx = cx + xSign * 11.05;
        const wy = topY + 3.1;
        const wz = southBarbicanZ;
        b.addBox(wx, wy, wz, 0.25, 1.35, 1.35, 0, WHITE_STONE, false);
        b.addBox(wx + xSign * 0.08, wy + 0.1, wz, 0.22, 0.85, 0.75, 0, LIT_WARM, true);
      }

      // 4. Double-Eave Grey Roof with Emerald-Green Trim (灰筒瓦绿琉璃剪边重檐歇山顶, reaches exactly 32m)
      // Lower eave skirt covering main tower + 抱厦
      b.addChineseRoof(cx, topY + 8.0, cz - 0.2, 34.5, 19.5, 2.8, 2.4, 0, ROOF_GREY, GREEN_TRIM, GREEN_TRIM);
      // Upper clerestory hall
      b.addBox(cx, topY + 9.8, northTowerZ, 23.5, 2.4, 9.8, 0, TOWER_GREY, false);
      // Clerestory windows
      for (let i = 0; i < 6; i++) {
        const lx = -9.0 + i * 3.6;
        b.addBox(cx + lx, topY + 10.3, northTowerZ - 4.95, 1.8, 1.4, 0.2, 0, LIT_WARM, true);
        b.addBox(cx + lx, topY + 10.3, northTowerZ + 4.95, 1.8, 1.4, 0.2, 0, LIT_WARM, true);
      }
      // Upper main hip-and-gable roof (roof starts at y0 + 25.08, roofH = 5.0m -> top = 32.0m)
      b.addChineseRoof(cx, y0 + 25.08, northTowerZ, 24.0, 10.2, 5.0, 2.8, 0, ROOF_GREY, GREEN_TRIM, GOLD_RIDGE);
    },
  },

  // 4. Yongdingmen Gatehouse (永定门城楼)
  {
    id: 'yongdingmen_gate',
    nameZh: '永定门城楼',
    nameEn: 'Yongdingmen Gatehouse',
    category: 'gate',
    cx: -374,
    cz: 4180,
    exclR: 55,
    height: 26,
    osmIds: [228041535, 204714191],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;
      if (cz === undefined) {
        cz = this.cz;
        y0 = cx;
        cx = this.cx;
      }

      const BASTION_GREY = [124, 128, 134];
      const MARBLE_WHITE = [244, 242, 236];
      const VERMILION = [178, 42, 36];
      const ROOF_GREY = [88, 94, 100];
      const GREEN_TRIM = [46, 128, 82];
      const GOLD_RIDGE = [246, 204, 70];
      const LIT_WARM = [255, 214, 120];
      const TUNNEL_DARK = [30, 26, 26];

      // 1. Battered City Rampart (城台 48x28x11m -> 44x24m)
      const baseH = 11.0;
      b.addFrustumBox(cx, y0, cz, 48, 28, 44, 24, baseH, 0, BASTION_GREY, false);

      // Central arched gateway portal tunnel (城门券洞)
      // Tunnel opening on South face (sloping with battered rampart wall: cz + 14 at y0 to cz + 12.73 at y0+7m)
      b.addFrustumBox(cx, y0, cz + 13.4, 5.8, 1.4, 5.4, 1.2, 7.0, 0, TUNNEL_DARK, false);
      // South arch marble frame & lintel
      b.addFrustumBox(cx - 3.2, y0, cz + 13.4, 0.7, 1.4, 0.7, 1.2, 7.2, 0, MARBLE_WHITE, false);
      b.addFrustumBox(cx + 3.2, y0, cz + 13.4, 0.7, 1.4, 0.7, 1.2, 7.2, 0, MARBLE_WHITE, false);
      b.addBox(cx, y0 + 6.9, cz + 12.7, 7.2, 0.8, 0.6, 0, MARBLE_WHITE, false);

      // Tunnel opening on North face (cz - 14 at y0 to cz - 12.73 at y0+7m)
      b.addFrustumBox(cx, y0, cz - 13.4, 5.8, 1.4, 5.4, 1.2, 7.0, 0, TUNNEL_DARK, false);
      // North arch marble frame & lintel
      b.addFrustumBox(cx - 3.2, y0, cz - 13.4, 0.7, 1.4, 0.7, 1.2, 7.2, 0, MARBLE_WHITE, false);
      b.addFrustumBox(cx + 3.2, y0, cz - 13.4, 0.7, 1.4, 0.7, 1.2, 7.2, 0, MARBLE_WHITE, false);
      b.addBox(cx, y0 + 6.9, cz - 12.7, 7.2, 0.8, 0.6, 0, MARBLE_WHITE, false);

      // Top marble balustrade & floodlight line
      b.addBox(cx, y0 + baseH, cz, 44.6, 1.1, 24.6, 0, MARBLE_WHITE, false);
      b.addBox(cx, y0 + baseH - 0.35, cz, 44.3, 0.25, 24.3, 0, [255, 204, 110], true);

      // North side ascending stairs (城台登城马道, built from y0 to eliminate underground protrusion)
      const numRampSteps = 8;
      for (let k = 0; k < numRampSteps; k++) {
        const t = (k + 1) / numRampSteps;
        const stepH = t * baseH;
        // East ramp: climbs towards center
        const ex = cx + 17.0 - t * 13.0;
        b.addBox(ex, y0, cz - 12.8, 2.0, stepH, 2.2, 0, BASTION_GREY, false);
        // West ramp: climbs towards center
        const wx = cx - 17.0 + t * 13.0;
        b.addBox(wx, y0, cz - 12.8, 2.0, stepH, 2.2, 0, BASTION_GREY, false);
      }

      // 2. 7x3 Bay Gatehouse Hall (面阔七间+进深三间 23.6x10.6m)
      // Terrace base on top of rampart
      b.addBox(cx, y0 + baseH, cz, 25.6, 0.5, 12.6, 0, MARBLE_WHITE, false);

      const topY = y0 + baseH + 0.5;
      const hallW = 23.6;
      const hallD = 10.6;
      const hallH = 5.2;
      b.addBox(cx, topY, cz, hallW, hallH, hallD, 0, VERMILION, false);

      // Perimeter vermilion colonnade & golden lattice windows
      const nBaysX = 7;
      for (let i = 0; i <= nBaysX; i++) {
        const lx = -hallW * 0.48 + (i / nBaysX) * hallW * 0.96;
        for (const zSign of [-1, 1]) {
          const pz = cz + zSign * (hallD * 0.5 + 0.3);
          b.addCylinder(cx + lx, topY, pz, 0.38, 0.36, hallH, 8, 0, [186, 44, 38], false);
          if (i < nBaysX) {
            const midX = lx + (hallW * 0.96) / (nBaysX * 2);
            b.addBox(cx + midX, topY + 0.9, cz + zSign * (hallD * 0.5 + 0.12), (hallW * 0.68) / nBaysX, hallH * 0.62, 0.25, 0, LIT_WARM, true);
          }
        }
      }
      for (const xSign of [-1, 1]) {
        for (let j = 1; j < 3; j++) {
          const lz = -hallD * 0.5 + (j / 3) * hallD;
          b.addCylinder(cx + xSign * (hallW * 0.5 + 0.3), topY, cz + lz, 0.38, 0.36, hallH, 8, 0, [186, 44, 38], false);
        }
      }

      // Central Imperial Tablet ("永定门") on South face
      b.addBox(cx, topY + 3.6, cz + hallD * 0.5 + 0.35, 3.2, 1.4, 0.25, 0, [246, 202, 70], true);

      // 3. Double-Eave Hip-and-Gable Roof with Emerald-Green Trim (重檐歇山顶灰筒瓦绿琉璃剪边, reaches exactly 26m)
      // Lower eave skirt
      b.addChineseRoof(cx, topY + 3.8, cz, hallW + 1.6, hallD + 1.6, 2.2, 2.2, 0, ROOF_GREY, GREEN_TRIM, GREEN_TRIM);
      // Upper clerestory hall
      b.addBox(cx, topY + 5.0, cz, hallW * 0.82, 2.2, hallD * 0.78, 0, VERMILION, false);
      // Upper glowing clerestory windows
      for (let i = 0; i < 5; i++) {
        const lx = -hallW * 0.32 + (i / 4) * hallW * 0.64;
        for (const zSign of [-1, 1]) {
          b.addBox(cx + lx, topY + 5.4, cz + zSign * (hallD * 0.78 * 0.5 + 0.1), 1.8, 1.4, 0.22, 0, LIT_WARM, true);
        }
      }
      // Upper main hip-and-gable roof (starts at y0 + 19.28, roofH = 4.8m -> reaches exactly 26.0m)
      b.addChineseRoof(cx, y0 + 19.28, cz, hallW * 0.84, hallD * 0.80, 4.8, 2.6, 0, ROOF_GREY, GREEN_TRIM, GOLD_RIDGE);
    },
  },
];
