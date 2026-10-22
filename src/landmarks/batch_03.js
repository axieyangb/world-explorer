/**
 * Beijing Explorer - Landmark Batch 03
 * Architectural definitions for:
 * 1. Jingshan Wanchun Pavilion (景山万春亭)
 * 2. Beijing Bell Tower (北京钟楼)
 * 3. Beijing Drum Tower (北京鼓楼)
 * 4. Temple of Heaven Hall of Prayer for Good Harvests (天坛祈年殿)
 */

export const BATCH_03 = [
  // =========================================================================
  // 1. Wanchun Pavilion on Jingshan Hill (景山万春亭)
  // =========================================================================
  {
    id: 'jingshan_wanchunting',
    nameZh: '景山万春亭',
    nameEn: 'Wanchun Pavilion (Jingshan)',
    cx: -598,
    cz: -1646,
    exclR: 42,
    height: 26,
    osmIds: [26390235, 52809826],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const yellowRoof = [238, 178, 36];
      const greenTrim = [38, 126, 82];
      const vermilionCol = [178, 42, 36];
      const warmLattice = [255, 218, 122];
      const whiteMarble = [246, 244, 238];
      const marbleBalustrade = [252, 250, 245];
      const stoneBase = [206, 202, 194];
      const goldFinial = [255, 222, 75];
      const paintedBeam = [36, 114, 102];
      const plaqueBlue = [24, 52, 120];

      // -----------------------------------------------------------------------
      // 1. Summit 2-Tier Stone & Marble Podium (紧凑收拢于山顶，杜绝下斜坡悬空)
      // -----------------------------------------------------------------------
      // Tier 1 Base: 34m x 30m, height 1.8m
      b.addBox(cx, y0, cz, 34.0, 1.8, 30.0, 0, stoneBase, false);

      // Carved white marble balustrades around Tier 1
      const bH1 = 1.05;
      b.addBox(cx, y0 + 1.8, cz - 14.65, 33.4, bH1, 0.45, 0, marbleBalustrade, false);
      b.addBox(cx, y0 + 1.8, cz + 14.65, 33.4, bH1, 0.45, 0, marbleBalustrade, false);
      b.addBox(cx - 16.65, y0 + 1.8, cz, 0.45, bH1, 29.3, 0, marbleBalustrade, false);
      b.addBox(cx + 16.65, y0 + 1.8, cz, 0.45, bH1, 29.3, 0, marbleBalustrade, false);

      // Projecting South Overlook Platform (俯瞰紫禁城中轴线观景台, 16m x 4.4m)
      b.addBox(cx, y0, cz + 17.2, 16.0, 1.8, 4.4, 0, stoneBase, false);
      b.addBox(cx, y0 + 1.8, cz + 19.2, 15.6, bH1, 0.45, 0, marbleBalustrade, false);
      b.addBox(cx - 7.8, y0 + 1.8, cz + 17.2, 0.45, bH1, 4.0, 0, marbleBalustrade, false);
      b.addBox(cx + 7.8, y0 + 1.8, cz + 17.2, 0.45, bH1, 4.0, 0, marbleBalustrade, false);

      // South Main Staircase with central imperial dragon ramp (御路丹陛: flush with cz + 19.4 platform edge)
      b.addFrustumBox(cx, y0, cz + 19.8, 8.6, 2.8, 8.6, 1.6, 1.8, 0, whiteMarble, false);
      b.addFrustumBox(cx, y0 + 0.08, cz + 19.8, 2.6, 2.8, 2.6, 1.6, 1.8, 0, [228, 224, 216], false);
      // North Staircase (flush with cz - 15.0 platform edge)
      b.addFrustumBox(cx, y0, cz - 15.4, 7.6, 2.6, 7.6, 1.6, 1.8, 0, whiteMarble, false);

      // Tier 2 Marble Terrace: 25m x 23m, height 1.4m
      const t2Y = y0 + 1.8;
      b.addBox(cx, t2Y, cz, 25.0, 1.4, 23.0, 0, whiteMarble, false);
      const bH2 = 1.0;
      b.addBox(cx, t2Y + 1.4, cz - 11.2, 24.4, bH2, 0.4, 0, marbleBalustrade, false);
      b.addBox(cx, t2Y + 1.4, cz + 11.2, 24.4, bH2, 0.4, 0, marbleBalustrade, false);
      b.addBox(cx - 12.2, t2Y + 1.4, cz, 0.4, bH2, 22.4, 0, marbleBalustrade, false);
      b.addBox(cx + 12.2, t2Y + 1.4, cz, 0.4, bH2, 22.4, 0, marbleBalustrade, false);

      // -----------------------------------------------------------------------
      // 2. Main Wanchun Pavilion Structure (万春亭主体建筑: 通高精准26.0m)
      // -----------------------------------------------------------------------
      // Pavilion Sumeru Plinth: 18.4m x 18.4m, height 0.8m
      const plinthY = t2Y + 1.4;
      b.addBox(cx, plinthY, cz, 18.4, 0.8, 18.4, 0, [218, 214, 206], false);

      // Floor level
      const floorY = plinthY + 0.8; // y0 + 4.0m
      const colH1 = 5.4;

      // Outer Vermilion Colonnade (20 columns total: 6 per side sharing 4 corners)
      const colDist = 8.4;
      for (let i = 0; i <= 5; i++) {
        const u = -colDist + (i / 5) * colDist * 2;
        b.addCylinder(cx + u, floorY, cz - colDist, 0.42, 0.38, colH1, 8, 0, vermilionCol, false, false);
        b.addCylinder(cx + u, floorY, cz + colDist, 0.42, 0.38, colH1, 8, 0, vermilionCol, false, false);
        if (i > 0 && i < 5) {
          b.addCylinder(cx - colDist, floorY, cz + u, 0.42, 0.38, colH1, 8, 0, vermilionCol, false, false);
          b.addCylinder(cx + colDist, floorY, cz + u, 0.42, 0.38, colH1, 8, 0, vermilionCol, false, false);
        }
      }

      // Inner Sanctuary Hall: 11.8m x 11.8m with golden illuminated lattice doors
      b.addBox(cx, floorY, cz, 11.8, colH1, 11.8, 0, vermilionCol, false);
      for (const zSign of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          b.addBox(cx + k * 3.3, floorY + 0.6, cz + zSign * 6.0, 2.5, colH1 - 1.0, 0.3, 0, warmLattice, true);
        }
      }
      for (const xSign of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          b.addBox(cx + xSign * 6.0, floorY + 0.6, cz + k * 3.3, 0.3, colH1 - 1.0, 2.5, 0, warmLattice, true);
        }
      }

      // Royal Tablet "万春亭" (匾额) under South Lower Eave
      b.addBox(cx, floorY + colH1 - 1.2, cz + 8.3, 2.6, 1.2, 0.25, 0, plaqueBlue, false);
      b.addBox(cx, floorY + colH1 - 1.2, cz + 8.45, 2.8, 1.35, 0.1, 0, [248, 206, 72], true);

      // --- Tier 1 (Lower Eave): Flared yellow roof with green trim ---
      const eave1Y = floorY + colH1; // y0 + 9.4m
      // Painted Dougong beam frieze & warm under-eave lantern strip
      b.addBox(cx, eave1Y - 0.75, cz, 18.6, 0.65, 18.6, 0, paintedBeam, false);
      b.addBox(cx, eave1Y - 0.18, cz, 19.4, 0.22, 19.4, 0, [255, 215, 120], true);

      // Upturned green glazed eave trim
      b.addFrustumBox(cx, eave1Y, cz, 23.2, 23.2, 22.2, 22.2, 0.4, 0, greenTrim, false, false);
      // Yellow glazed tile roof slope
      b.addFrustumBox(cx, eave1Y + 0.38, cz, 22.2, 22.2, 15.6, 15.6, 2.3, 0, yellowRoof, false, false);

      // Corner hip ridge ornaments (垂脊兽)
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        b.addBox(cx + sx * 11.2, eave1Y + 0.35, cz + sz * 11.2, 0.75, 0.7, 0.75, 0, goldFinial, true);
      }

      // --- Tier 2 (Middle Clerestory Drum & Middle Eave) ---
      const drum1Y = eave1Y + 2.68; // y0 + 12.08m
      const drum1H = 2.8;
      b.addBox(cx, drum1Y, cz, 14.4, drum1H, 14.4, 0, vermilionCol, false);
      // Glowing transom windows on 4 faces
      for (const zSign of [-1, 1]) {
        b.addBox(cx, drum1Y + 0.5, cz + zSign * 7.3, 11.2, drum1H - 1.0, 0.28, 0, warmLattice, true);
      }
      for (const xSign of [-1, 1]) {
        b.addBox(cx + xSign * 7.3, drum1Y + 0.5, cz, 0.28, drum1H - 1.0, 11.2, 0, warmLattice, true);
      }

      const eave2Y = drum1Y + drum1H; // y0 + 14.88m
      b.addBox(cx, eave2Y - 0.65, cz, 15.2, 0.55, 15.2, 0, paintedBeam, false);
      b.addBox(cx, eave2Y - 0.16, cz, 15.8, 0.18, 15.8, 0, [255, 215, 120], true);

      // Eave 2 flared green trim + yellow slope
      b.addFrustumBox(cx, eave2Y, cz, 17.8, 17.8, 16.8, 16.8, 0.38, 0, greenTrim, false, false);
      b.addFrustumBox(cx, eave2Y + 0.36, cz, 16.8, 16.8, 11.2, 11.2, 2.2, 0, yellowRoof, false, false);

      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        b.addBox(cx + sx * 8.6, eave2Y + 0.32, cz + sz * 8.6, 0.65, 0.6, 0.65, 0, goldFinial, true);
      }

      // --- Tier 3 (Upper Clerestory Drum & Grand Pyramidal Roof - 四角攒尖顶) ---
      const drum2Y = eave2Y + 2.56; // y0 + 17.44m
      const drum2H = 2.5;
      b.addBox(cx, drum2Y, cz, 10.4, drum2H, 10.4, 0, vermilionCol, false);
      for (const zSign of [-1, 1]) {
        b.addBox(cx, drum2Y + 0.45, cz + zSign * 5.3, 7.6, drum2H - 0.9, 0.25, 0, warmLattice, true);
      }
      for (const xSign of [-1, 1]) {
        b.addBox(cx + xSign * 5.3, drum2Y + 0.45, cz, 0.25, drum2H - 0.9, 7.6, 0, warmLattice, true);
      }

      const eave3Y = drum2Y + drum2H; // y0 + 19.94m
      b.addBox(cx, eave3Y - 0.55, cz, 11.0, 0.45, 11.0, 0, paintedBeam, false);
      b.addBox(cx, eave3Y - 0.14, cz, 11.6, 0.16, 11.6, 0, [255, 215, 120], true);

      // Eave 3 flared green trim + steep pyramidal roof
      b.addFrustumBox(cx, eave3Y, cz, 13.8, 13.8, 13.0, 13.0, 0.35, 0, greenTrim, false, false);
      // Pyramidal yellow roof tapering to apex: height 3.9m -> apex reaches y0 + 24.19m
      b.addFrustumBox(cx, eave3Y + 0.33, cz, 13.0, 13.0, 2.0, 2.0, 3.9, 0, yellowRoof, false, true);

      // --- Gilded Spherical Finial (鎏金宝顶, 通高达到精准26.0m) ---
      const finialY = eave3Y + 0.33 + 3.9; // y0 + 24.17m
      // Lotus petal pedestal (仰覆莲座)
      b.addCylinder(cx, finialY, cz, 1.45, 1.6, 0.45, 16, 0, goldFinial, true);
      // Gilded Sphere body (鎏金宝珠)
      b.addCylinder(cx, finialY + 0.45, cz, 1.6, 1.05, 0.85, 16, 0, goldFinial, true);
      // Pointed flame spire tip (宝顶火焰尖) -> total height reaches exactly 26.0m
      b.addCylinder(cx, finialY + 1.30, cz, 0.75, 0.1, 0.53, 12, 0, goldFinial, true);
    },
  },

  // =========================================================================
  // 2. Beijing Bell Tower (北京钟楼)
  // =========================================================================
  {
    id: 'bell_tower',
    nameZh: '钟楼',
    nameEn: 'Beijing Bell Tower',
    cx: -674,
    cz: -3591,
    exclR: 38,
    height: 48,
    osmIds: [425993664, 28818477],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const stoneBrick = [120, 124, 130];
      const darkPlinth = [82, 86, 92];
      const whiteMarble = [242, 240, 235];
      const greenGlaze = [36, 126, 82];
      const blackRoof = [48, 52, 58];
      const tunnelDark = [26, 26, 28];
      const bronzeBell = [188, 142, 75];
      const warmGlow = [255, 205, 115];

      // -----------------------------------------------------------------------
      // 1. Slender Masonry Fortress Bastion (全砖石城台: 33.5x33.5m -> 29.5x29.5m, H=15.6m)
      // -----------------------------------------------------------------------
      b.addBox(cx, y0, cz, 34.5, 1.4, 34.5, 0, darkPlinth, false);
      b.addFrustumBox(cx, y0 + 1.4, cz, 33.0, 33.0, 29.4, 29.4, 14.2, 0, stoneBrick, false);

      // 4 Grand Arched Cross-Vault Portals (十字拱券门: N, S, E, W)
      const archW = 5.6;
      const jambH = 5.8;
      const archR = archW * 0.5;

      const buildArchedPortal = (px, py, pz, yaw, depth) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const rot = (lx, lz) => [px + lx * c - lz * s, pz + lx * s + lz * c];

        // Dark tunnel interior
        b.addBox(px, py, pz, archW, jambH + archR * 0.8, depth, yaw, tunnelDark, false);
        // Warm glow inside vault
        b.addBox(px, py + 0.4, pz, archW - 0.8, jambH + archR * 0.6, depth - 0.4, yaw, [255, 185, 95], true);

        // White stone architrave trim (拱券石雕门套)
        const [leftX, leftZ] = rot(-archW * 0.5 - 0.35, depth * 0.5 + 0.05);
        const [rightX, rightZ] = rot(archW * 0.5 + 0.35, depth * 0.5 + 0.05);
        b.addBox(leftX, py, leftZ, 0.7, jambH, 0.3, yaw, whiteMarble, false);
        b.addBox(rightX, py, rightZ, 0.7, jambH, 0.3, yaw, whiteMarble, false);

        // Arch curve header blocks (券顶石)
        const [topX, topZ] = rot(0, depth * 0.5 + 0.05);
        b.addBox(topX, py + jambH + archR * 0.45, topZ, archW + 1.2, 0.75, 0.3, yaw, whiteMarble, false);
      };

      buildArchedPortal(cx, y0 + 1.4, cz + 15.0, 0, 3.6); // South
      buildArchedPortal(cx, y0 + 1.4, cz - 15.0, 0, 3.6); // North
      buildArchedPortal(cx + 15.0, y0 + 1.4, cz, Math.PI / 2, 3.6); // East
      buildArchedPortal(cx - 15.0, y0 + 1.4, cz, Math.PI / 2, 3.6); // West

      // Fortress Top Terrace (y0 + 15.6m): White Marble Balustrade & Crenellations
      const terrY = y0 + 15.6;
      b.addBox(cx, terrY, cz, 29.6, 0.8, 29.6, 0, whiteMarble, false);
      // Perimeter balustrade
      const balH = 1.15;
      b.addBox(cx, terrY + 0.8, cz - 14.4, 28.6, balH, 0.45, 0, whiteMarble, false);
      b.addBox(cx, terrY + 0.8, cz + 14.4, 28.6, balH, 0.45, 0, whiteMarble, false);
      b.addBox(cx - 14.4, terrY + 0.8, cz, 0.45, balH, 28.6, 0, whiteMarble, false);
      b.addBox(cx + 14.4, terrY + 0.8, cz, 0.45, balH, 28.6, 0, whiteMarble, false);

      // -----------------------------------------------------------------------
      // 2. Upper Bell Chamber Tower Body (二层钟楼大厅: 19.8x19.8m, H=15.8m)
      // -----------------------------------------------------------------------
      const chamberBaseY = terrY + 0.8; // y0 + 16.4m
      // Carved Sumeru stone plinth
      b.addBox(cx, chamberBaseY, cz, 22.8, 2.4, 22.8, 0, [136, 140, 146], false);
      const hallY = chamberBaseY + 2.4; // y0 + 18.8m
      const hallH = 13.4;
      b.addBox(cx, hallY, cz, 19.8, hallH, 19.8, 0, stoneBrick, false);

      // 4 Monumental Arched Acoustic Louver Windows (拱券窗) with White Stone Trim
      const winW = 4.8;
      const winJambH = 5.6;
      const winY = hallY + 2.6;

      const buildBellWindow = (wx, wy, wz, yaw, zOffset) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const rot = (lx, lz) => [wx + lx * c - lz * s, wz + lx * s + lz * c];

        // Luminous interior acoustic aperture
        const [cBoxX, cBoxZ] = rot(0, zOffset);
        b.addBox(cBoxX, wy, cBoxZ, winW, winJambH + 2.2, 0.5, yaw, warmGlow, true);

        // White marble surround
        const [lX, lZ] = rot(-winW * 0.5 - 0.35, zOffset + 0.1);
        const [rX, rZ] = rot(winW * 0.5 + 0.35, zOffset + 0.1);
        b.addBox(lX, wy, lZ, 0.7, winJambH, 0.25, yaw, whiteMarble, false);
        b.addBox(rX, wy, rZ, 0.7, winJambH, 0.25, yaw, whiteMarble, false);

        // Arch header stone
        const [headX, headZ] = rot(0, zOffset + 0.1);
        b.addBox(headX, wy + winJambH + 0.9, headZ, winW + 1.2, 0.8, 0.25, yaw, whiteMarble, false);
      };

      buildBellWindow(cx, winY, cz, 0, 10.0); // South
      buildBellWindow(cx, winY, cz, 0, -10.0); // North
      buildBellWindow(cx, winY, cz, Math.PI / 2, 10.0); // East
      buildBellWindow(cx, winY, cz, Math.PI / 2, -10.0); // West

      // Suspended 63-ton Ming Yongle Great Bronze Bell (永乐大铜钟)
      b.addBox(cx, winY + winJambH + 1.4, cz, 7.8, 0.8, 0.8, 0, [82, 58, 40], false);
      b.addCylinder(cx, winY + winJambH + 0.4, cz, 0.7, 0.6, 1.0, 12, 0, bronzeBell, false);
      b.addCylinder(cx, winY + 0.8, cz, 1.7, 1.3, 4.8, 16, 0, bronzeBell, false);
      b.addCylinder(cx, winY + 0.8, cz, 1.4, 1.0, 4.4, 16, 0, [255, 205, 110], true);

      // Carved stone Dougong bracket tier under lower eave
      const eave1Y = hallY + hallH; // y0 + 32.2m
      b.addBox(cx, eave1Y - 0.9, cz, 21.0, 0.7, 21.0, 0, [142, 146, 152], false);
      b.addBox(cx, eave1Y - 0.2, cz, 21.6, 0.22, 21.6, 0, warmGlow, true);

      // -----------------------------------------------------------------------
      // 3. Double-Eave Hip-and-Gable Roof (黑筒瓦绿剪边重檐歇山顶, 精准通高48.0m)
      // -----------------------------------------------------------------------
      // Lower Eave Skirt: Flared green glaze trim + dark grey tile slope
      b.addFrustumBox(cx, eave1Y, cz, 25.6, 25.6, 24.6, 24.6, 0.45, 0, greenGlaze, false, false);
      b.addFrustumBox(cx, eave1Y + 0.42, cz, 24.6, 24.6, 18.0, 18.0, 2.5, 0, blackRoof, false, false);

      // Clerestory stone neck
      const neckY = eave1Y + 2.92; // y0 + 35.12m
      const neckH = 3.8;
      b.addBox(cx, neckY, cz, 17.2, neckH, 17.2, 0, stoneBrick, false);
      b.addBox(cx, neckY + 1.0, cz, 17.5, 1.6, 17.5, 0, warmGlow, true);

      // Upper Dougong stone bracket tier
      const eave2Y = neckY + neckH; // y0 + 38.92m
      b.addBox(cx, eave2Y - 0.8, cz, 18.4, 0.65, 18.4, 0, [142, 146, 152], false);
      b.addBox(cx, eave2Y - 0.18, cz, 19.0, 0.22, 19.0, 0, warmGlow, true);

      // Upper Grand Hip-and-Gable Roof (歇山顶)
      // eave2Y(38.92) + 0.32 + 7.15 + 1.60(chiwen) = 47.99m ≈ 48.0m!
      b.addChineseRoof(cx, eave2Y, cz, 18.8, 18.8, 7.15, 3.4, 0, blackRoof, greenGlaze, [242, 196, 68]);
    },
  },

  // =========================================================================
  // 3. Beijing Drum Tower (北京鼓楼)
  // =========================================================================
  {
    id: 'drum_tower',
    nameZh: '鼓楼',
    nameEn: 'Beijing Drum Tower',
    cx: -667,
    cz: -3401,
    exclR: 48,
    height: 47,
    osmIds: [267371087, 28818474],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const fortressRed = [162, 44, 38];
      const darkBase = [92, 88, 84];
      const whiteMarble = [242, 240, 235];
      const upperPillars = [178, 42, 36];
      const greyRoof = [92, 96, 102];
      const greenGlaze = [38, 126, 82];
      const warmLattice = [255, 216, 120];
      const goldRidge = [250, 212, 80];
      const tunnelDark = [28, 24, 24];

      // -----------------------------------------------------------------------
      // 1. Massive Battered Vermilion Fortress Bastion (城台: 56x33m -> 51.6x28.6m, H=14.4m)
      // -----------------------------------------------------------------------
      b.addBox(cx, y0, cz, 57.6, 1.4, 34.6, 0, darkBase, false);
      b.addFrustumBox(cx, y0 + 1.4, cz, 56.0, 33.0, 51.6, 28.6, 13.0, 0, fortressRed, false);

      // 8 Arched Gateway Portals (券洞: 3 on South, 3 on North, 1 on East, 1 on West)
      const buildArchedPortal = (px, py, pz, w, jambH, depth, yaw) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const rot = (lx, lz) => [px + lx * c - lz * s, pz + lx * s + lz * c];
        const r = w * 0.5;

        // Tunnel interior
        b.addBox(px, py, pz, w, jambH + r * 0.75, depth, yaw, tunnelDark, false);
        b.addBox(px, py + 0.3, pz, w - 0.7, jambH + r * 0.6, depth - 0.4, yaw, [255, 185, 95], true);

        // White stone architrave jambs
        const [lX, lZ] = rot(-w * 0.5 - 0.3, depth * 0.5 + 0.05);
        const [rX, rZ] = rot(w * 0.5 + 0.3, depth * 0.5 + 0.05);
        b.addBox(lX, py, lZ, 0.6, jambH, 0.3, yaw, whiteMarble, false);
        b.addBox(rX, py, rZ, 0.6, jambH, 0.3, yaw, whiteMarble, false);
        // Stone arch curve header
        const [hX, hZ] = rot(0, depth * 0.5 + 0.05);
        b.addBox(hX, py + jambH + r * 0.45, hZ, w + 1.0, 0.7, 0.3, yaw, whiteMarble, false);
      };

      // South & North faces: 3 portals each (Center large 6.6x6.2m, Side 4.4x5.0m)
      for (const zSign of [-1, 1]) {
        buildArchedPortal(cx, y0 + 1.4, cz + zSign * 15.6, 6.6, 6.2, 3.8, 0);
        buildArchedPortal(cx + 15.0, y0 + 1.4, cz + zSign * 15.4, 4.4, 5.0, 3.8, 0);
        buildArchedPortal(cx - 15.0, y0 + 1.4, cz + zSign * 15.4, 4.4, 5.0, 3.8, 0);
      }
      // East & West faces: 1 portal each (4.2x5.4m)
      for (const xSign of [-1, 1]) {
        buildArchedPortal(cx + xSign * 26.2, y0 + 1.4, cz, 4.2, 5.4, 3.8, Math.PI / 2);
      }

      // Fortress Top Terrace (y0 + 14.4m) with White Marble Balustrades
      const terrY = y0 + 14.4;
      b.addBox(cx, terrY, cz, 52.0, 0.8, 29.0, 0, whiteMarble, false);
      const balH = 1.15;
      b.addBox(cx, terrY + 0.8, cz - 14.1, 51.0, balH, 0.42, 0, whiteMarble, false);
      b.addBox(cx, terrY + 0.8, cz + 14.1, 51.0, balH, 0.42, 0, whiteMarble, false);
      b.addBox(cx - 25.6, terrY + 0.8, cz, 0.42, balH, 28.2, 0, whiteMarble, false);
      b.addBox(cx + 25.6, terrY + 0.8, cz, 0.42, balH, 28.2, 0, whiteMarble, false);

      // -----------------------------------------------------------------------
      // 2. Upper Drum Hall - Tier 1 (36x22m, Colonnade & Master Drum)
      // -----------------------------------------------------------------------
      const h1BaseY = terrY + 0.8; // y0 + 15.2m
      const colH = 8.6;
      b.addBox(cx, h1BaseY, cz, 36.6, colH, 21.6, 0, fortressRed, false);

      // Perimeter Colonnade of vermilion columns (24 pillars, 8 on N/S, 4 on E/W)
      for (let i = 0; i < 8; i++) {
        const u = -16.5 + (i / 7) * 33.0;
        b.addCylinder(cx + u, h1BaseY, cz - 11.2, 0.48, 0.44, colH, 8, 0, upperPillars, false, false);
        b.addCylinder(cx + u, h1BaseY, cz + 11.2, 0.48, 0.44, colH, 8, 0, upperPillars, false, false);
        // Golden glowing 6-panel lattice doors
        if (i < 7) {
          const midU = u + 33.0 / 14;
          b.addBox(cx + midU, h1BaseY + 0.8, cz - 10.8, 3.2, colH - 1.2, 0.3, 0, warmLattice, true);
          b.addBox(cx + midU, h1BaseY + 0.8, cz + 10.8, 3.2, colH - 1.2, 0.3, 0, warmLattice, true);
        }
      }
      for (let j = 1; j < 4; j++) {
        const v = -11.2 + (j / 4) * 22.4;
        b.addCylinder(cx - 17.6, h1BaseY, cz + v, 0.48, 0.44, colH, 8, 0, upperPillars, false, false);
        b.addCylinder(cx + 17.6, h1BaseY, cz + v, 0.48, 0.44, colH, 8, 0, upperPillars, false, false);
      }

      // Master Night-Watch Drum (主鼓) inside upper central hall
      b.addCylinder(cx, h1BaseY + 2.5, cz, 1.8, 1.8, 2.5, 16, Math.PI / 2, [185, 48, 38], false);
      b.addCylinder(cx, h1BaseY + 2.5, cz, 1.6, 1.6, 2.54, 16, Math.PI / 2, [255, 218, 130], true);

      // Eave 1 (Lower Eave Skirt): Grey tiles with green trim
      const eave1Y = h1BaseY + colH; // y0 + 23.8m
      b.addBox(cx, eave1Y - 0.75, cz, 38.6, 0.55, 23.2, 0, [42, 114, 98], false);
      b.addBox(cx, eave1Y - 0.18, cz, 39.4, 0.22, 24.0, 0, [255, 210, 115], true);
      b.addFrustumBox(cx, eave1Y, cz, 44.0, 28.0, 42.8, 26.8, 0.42, 0, greenGlaze, false, false);
      b.addFrustumBox(cx, eave1Y + 0.38, cz, 42.8, 26.8, 33.0, 18.0, 2.6, 0, greyRoof, false, false);

      // -----------------------------------------------------------------------
      // 3. Upper Drum Hall - Tier 2 Clerestory (30.6x16.4m, H=4.8m)
      // -----------------------------------------------------------------------
      const h2BaseY = eave1Y + 2.98; // y0 + 26.78m
      const h2H = 4.8;
      b.addBox(cx, h2BaseY, cz, 30.6, h2H, 16.4, 0, fortressRed, false);
      for (const zSign of [-1, 1]) {
        for (let k = -2; k <= 2; k++) {
          b.addBox(cx + k * 5.2, h2BaseY + 0.6, cz + zSign * 8.3, 3.8, h2H - 1.2, 0.25, 0, warmLattice, true);
        }
      }

      // Eave 2 (Middle Eave Skirt)
      const eave2Y = h2BaseY + h2H; // y0 + 31.58m
      b.addBox(cx, eave2Y - 0.65, cz, 31.8, 0.5, 17.6, 0, [42, 114, 98], false);
      b.addBox(cx, eave2Y - 0.16, cz, 32.6, 0.2, 18.4, 0, [255, 210, 115], true);
      b.addFrustumBox(cx, eave2Y, cz, 36.6, 22.6, 35.4, 21.4, 0.4, 0, greenGlaze, false, false);
      b.addFrustumBox(cx, eave2Y + 0.36, cz, 35.4, 21.4, 26.8, 14.0, 2.5, 0, greyRoof, false, false);

      // -----------------------------------------------------------------------
      // 4. Upper Drum Hall - Tier 3 Top Hall & Grand Hip-and-Gable Roof (三重檐歇山顶, 精准通高47.0m)
      // -----------------------------------------------------------------------
      const h3BaseY = eave2Y + 2.86; // y0 + 34.44m
      const h3H = 4.2;
      b.addBox(cx, h3BaseY, cz, 25.0, h3H, 13.4, 0, fortressRed, false);
      for (const zSign of [-1, 1]) {
        b.addBox(cx, h3BaseY + 0.6, cz + zSign * 6.8, 17.8, h3H - 1.2, 0.25, 0, warmLattice, true);
      }

      const eave3Y = h3BaseY + h3H; // y0 + 38.64m
      // eave3Y(38.64) + 0.32 + 6.45 + 1.60(chiwen) = 47.01m ≈ 47.0m!
      b.addChineseRoof(cx, eave3Y, cz, 26.6, 14.6, 6.45, 3.4, 0, greyRoof, greenGlaze, goldRidge);
    },
  },

  // =========================================================================
  // 4. Hall of Prayer for Good Harvests, Temple of Heaven (天坛祈年殿)
  // =========================================================================
  {
    id: 'temple_of_heaven_qiniandian',
    nameZh: '祈年殿',
    nameEn: 'Hall of Prayer for Good Harvests',
    cx: 779,
    cz: 2936,
    exclR: 95,
    height: 38,
    osmIds: [43921139, 24961784],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const whiteMarble = [246, 244, 238];
      const marbleTrim = [252, 250, 245];
      const deepBlueGlaze = [28, 62, 142];
      const blueTrim = [42, 86, 178];
      const vermilionCol = [182, 42, 36];
      const paintedBeam = [36, 116, 128];
      const warmLattice = [255, 218, 115];
      const goldBaoding = [255, 222, 75];

      // -----------------------------------------------------------------------
      // 1. Iconic 3-Tier Circular White Hanbaiyu Qigu Altar (祈谷坛: R=43m, 33m, 23m, H=6.2m)
      // -----------------------------------------------------------------------
      // Tier 1 (Bottom): R = 43.0m, H = 2.2m
      b.addCylinder(cx, y0, cz, 43.0, 43.0, 2.2, 36, 0, whiteMarble, false);
      b.addCylinder(cx, y0 + 2.2, cz, 42.8, 42.4, 1.05, 36, 0, marbleTrim, false, false);

      // Four Cardinal Stairways on Tier 1 (South, North, East, West)
      const stairW1 = 8.6;
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const sx = cx + dx * 45.0;
        const sz = cz + dz * 45.0;
        const yaw = Math.atan2(dx, dz);
        b.addFrustumBox(sx, y0, sz, stairW1, 4.0, stairW1, 1.8, 2.2, yaw, whiteMarble, false);
        // Central imperial dragon ramp (丹陛御路) on South & North
        if (dx === 0) {
          b.addFrustumBox(sx, y0 + 0.08, sz, 3.0, 4.0, 3.0, 1.8, 2.2, yaw, [228, 224, 216], false);
        }
      }

      // Tier 2 (Middle): R = 33.0m, H = 2.0m
      const t2Y = y0 + 2.2;
      b.addCylinder(cx, t2Y, cz, 33.0, 33.0, 2.0, 36, 0, whiteMarble, false);
      b.addCylinder(cx, t2Y + 2.0, cz, 32.8, 32.4, 1.05, 36, 0, marbleTrim, false, false);
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const sx = cx + dx * 34.6;
        const sz = cz + dz * 34.6;
        const yaw = Math.atan2(dx, dz);
        b.addFrustumBox(sx, t2Y, sz, stairW1, 3.2, stairW1, 1.6, 2.0, yaw, whiteMarble, false);
      }

      // Tier 3 (Top): R = 23.0m, H = 2.0m
      const t3Y = t2Y + 2.0;
      b.addCylinder(cx, t3Y, cz, 23.0, 23.0, 2.0, 36, 0, whiteMarble, false);
      b.addCylinder(cx, t3Y + 2.0, cz, 22.8, 22.4, 1.05, 36, 0, marbleTrim, false, false);
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const sx = cx + dx * 24.4;
        const sz = cz + dz * 24.4;
        const yaw = Math.atan2(dx, dz);
        b.addFrustumBox(sx, t3Y, sz, stairW1, 2.8, stairW1, 1.4, 2.0, yaw, whiteMarble, false);
      }

      // -----------------------------------------------------------------------
      // 2. Main Hall of Prayer for Good Harvests Structure (祈年殿主体: 精准通高38.0m)
      // -----------------------------------------------------------------------
      const altarTopY = t3Y + 2.0; // y0 + 6.2m
      // Carved Sumeru plinth
      b.addCylinder(cx, altarTopY, cz, 16.5, 16.5, 0.8, 32, 0, whiteMarble, false);

      // --- Tier 1 Circular Hall Drum & Outer Eave ---
      const drum1Y = altarTopY + 0.8; // y0 + 7.0m
      const drum1H = 6.2;
      b.addCylinder(cx, drum1Y, cz, 15.2, 15.2, drum1H, 32, 0, vermilionCol, false);

      // 12 Outer Vermilion Columns (檐柱) and Golden Glowing Lattice Screen Doors
      const nCols = 12;
      for (let i = 0; i < nCols; i++) {
        const a0 = (i / nCols) * Math.PI * 2;
        const a1 = ((i + 1) / nCols) * Math.PI * 2;
        const aMid = (a0 + a1) * 0.5;

        const px = cx + Math.cos(a0) * 15.2;
        const pz = cz + Math.sin(a0) * 15.2;
        b.addCylinder(px, drum1Y, pz, 0.50, 0.46, drum1H, 8, 0, vermilionCol, false, false);

        // Golden lattice door segment
        const wx0 = cx + Math.cos(aMid - 0.18) * 15.15;
        const wz0 = cz + Math.sin(aMid - 0.18) * 15.15;
        const wx1 = cx + Math.cos(aMid + 0.18) * 15.15;
        const wz1 = cz + Math.sin(aMid + 0.18) * 15.15;
        b.addQuad(
          wx0, drum1Y + 0.8, wz0,
          wx1, drum1Y + 0.8, wz1,
          wx1, drum1Y + drum1H - 0.4, wz1,
          wx0, drum1Y + drum1H - 0.4, wz0,
          warmLattice,
          true
        );
      }

      // Dougong bracket frieze & warm under-eave lantern ring
      const eave1Y = drum1Y + drum1H; // y0 + 13.2m
      b.addCylinder(cx, eave1Y - 0.72, cz, 15.8, 15.8, 0.62, 32, 0, paintedBeam, false, false);
      b.addCylinder(cx, eave1Y - 0.20, cz, 16.4, 16.4, 0.20, 32, 0, [255, 210, 115], true, false);

      // Eave 1 (Lower Circular Conical Eave): Deep cobalt-blue glazed tiles
      b.addCylinder(cx, eave1Y, cz, 19.6, 18.8, 0.40, 32, 0, blueTrim, false, false);
      b.addCylinder(cx, eave1Y + 0.38, cz, 18.8, 14.4, 2.55, 32, 0, deepBlueGlaze, false, false);

      // --- Tier 2 Circular Clerestory Drum & Middle Eave ---
      const drum2Y = eave1Y + 1.8; // y0 + 15.0m
      const drum2H = 3.6;
      b.addCylinder(cx, drum2Y, cz, 13.6, 13.6, drum2H, 28, 0, vermilionCol, false);

      // 12 Inner Golden Pillars (金柱) & illuminated clerestory transoms
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2;
        const px = cx + Math.cos(a0) * 13.6;
        const pz = cz + Math.sin(a0) * 13.6;
        b.addCylinder(px, drum2Y, pz, 0.42, 0.38, drum2H, 8, 0, vermilionCol, false, false);
      }
      b.addCylinder(cx, drum2Y + 0.75, cz, 13.7, 13.7, drum2H - 1.3, 28, 0, warmLattice, true, false);

      // Eave 2 (Middle Circular Eave)
      const eave2Y = drum2Y + drum2H; // y0 + 18.6m
      b.addCylinder(cx, eave2Y - 0.62, cz, 14.2, 14.2, 0.52, 28, 0, paintedBeam, false, false);
      b.addCylinder(cx, eave2Y - 0.16, cz, 14.7, 14.7, 0.18, 28, 0, [255, 210, 115], true, false);
      b.addCylinder(cx, eave2Y, cz, 16.0, 15.2, 0.38, 28, 0, blueTrim, false, false);
      b.addCylinder(cx, eave2Y + 0.35, cz, 15.2, 11.0, 2.55, 28, 0, deepBlueGlaze, false, false);

      // --- Tier 3 Upper Circular Drum & Upper Conical Roof (三层重檐圆攒尖顶) ---
      const drum3Y = eave2Y + 1.8; // y0 + 20.4m
      const drum3H = 3.2;
      b.addCylinder(cx, drum3Y, cz, 10.2, 10.2, drum3H, 24, 0, vermilionCol, false);
      b.addCylinder(cx, drum3Y + 0.6, cz, 10.3, 10.3, drum3H - 1.1, 24, 0, warmLattice, true, false);

      // Eave 3 (Top Circular Conical Roof)
      const eave3Y = drum3Y + drum3H; // y0 + 23.6m
      b.addCylinder(cx, eave3Y - 0.52, cz, 10.7, 10.7, 0.48, 24, 0, paintedBeam, false, false);
      b.addCylinder(cx, eave3Y - 0.15, cz, 11.2, 11.2, 0.16, 24, 0, [255, 210, 115], true, false);
      b.addCylinder(cx, eave3Y, cz, 12.8, 12.0, 0.38, 24, 0, blueTrim, false, false);

      // Swooping conical blue roof
      b.addCylinder(cx, eave3Y + 0.35, cz, 12.0, 5.8, 3.8, 24, 0, deepBlueGlaze, false, false);
      b.addCylinder(cx, eave3Y + 4.15, cz, 5.8, 1.6, 3.4, 24, 0, deepBlueGlaze, false, false);
      b.addCylinder(cx, eave3Y + 7.55, cz, 1.6, 1.0, 0.45, 16, 0, deepBlueGlaze, false, true);

      // Monumental Gilded Bronze Spherical Finial (鎏金宝顶, 通高达到精准38.0m)
      // eave3Y(23.6) + 8.0 = 31.6m. Remainder to 38.0m is 6.4m!
      const baodingY = eave3Y + 8.0; // y0 + 31.6m
      const baodingH = (y0 + 38.0) - baodingY; // exactly 6.4m!
      // Lotus petal pedestal (仰覆莲座)
      b.addCylinder(cx, baodingY, cz, 1.4, 1.9, baodingH * 0.22, 16, 0, goldBaoding, true);
      // Gilded Sphere (鎏金宝珠)
      b.addCylinder(cx, baodingY + baodingH * 0.22, cz, 1.9, 1.3, baodingH * 0.44, 16, 0, goldBaoding, true);
      // Flame tip (宝顶火焰尖)
      b.addCylinder(cx, baodingY + baodingH * 0.66, cz, 1.1, 0.15, baodingH * 0.34, 12, 0, goldBaoding, true);

      // -----------------------------------------------------------------------
      // 3. Surrounding Temple of Heaven Complex (南北纵向配殿，与祭坛及围墙零干涉零重叠)
      // -----------------------------------------------------------------------
      // Altar R=43m (stairs reach 47.0m).
      // East Annex Hall (东配殿: 9间配殿，南北向长，面向中央院落，位于cx + 60, cz)
      // yaw = Math.PI / 2 rotates palace so local X (sx=38) runs North-South along global Z!
      b.addImperialPalace(cx + 60, y0, cz, 38, 10, 1.0, 1, 5.0, 3.6, Math.PI / 2, deepBlueGlaze, vermilionCol, whiteMarble, false);

      // West Annex Hall (西配殿: 9间配殿，南北向长，面向中央院落，位于cx - 60, cz)
      b.addImperialPalace(cx - 60, y0, cz, 38, 10, 1.0, 1, 5.0, 3.6, -Math.PI / 2, deepBlueGlaze, vermilionCol, whiteMarble, false);

      // South Gate: Prayer Gate (祈年门: cx, y0, cz + 62) - 东西向大殿，距祭坛台阶15m开阔广场
      b.addCityGatehouse(cx, y0, cz + 62, 32, 11, 2.8, 26, 9, 4.6, 3.8, 0, vermilionCol, deepBlueGlaze, false);

      // North Hall: Imperial Heaven Hall (皇乾殿: cx, y0, cz - 60) - 东西向大殿，距祭坛台阶13m广场
      b.addImperialPalace(cx, y0, cz - 60, 26, 10, 1.2, 1, 5.2, 3.8, 0, deepBlueGlaze, vermilionCol, whiteMarble, false);

      // Red Enclosure Wall with Deep Blue Glazed Coping (祈谷坛院墙, 位于cx±74, cz±70)
      const wallH = 3.4;
      for (const [wx, wz, wSx, wSz] of [
        [cx + 74, cz, 1.2, 140], // East wall
        [cx - 74, cz, 1.2, 140], // West wall
        [cx, cz - 70, 148, 1.2], // North wall
        [cx + 46, cz + 70, 56, 1.2], // South wall East segment
        [cx - 46, cz + 70, 56, 1.2], // South wall West segment
      ]) {
        b.addBox(wx, y0, wz, wSx, wallH, wSz, 0, [168, 42, 36], false);
        b.addBox(wx, y0 + wallH, wz, wSx + 0.4, 0.45, wSz + 0.4, 0, deepBlueGlaze, false);
      }
    },
  },
];
