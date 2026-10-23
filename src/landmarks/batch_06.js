/**
 * World Explorer — 3D Procedural Landmark Geometry Kernel
 * Batch 06 (BATCH_06): Southeast Corner Tower, Olympic Tower, Bird's Nest, Water Cube.
 */

export const BATCH_06 = [
  // 1. Ming City Wall Southeast Corner Tower (明城墙东南角楼)
  {
    id: 'southeast_corner_tower',
    nameZh: '明城墙东南角楼',
    nameEn: 'Southeast Corner Tower',
    cx: 2698,
    cz: 952,
    exclR: 55,
    height: 29,
    osmIds: [488647832, 160040986],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const GREY_BRICK = [118, 122, 128];
      const BASE_STONE = [178, 175, 168];
      const PARAPET_WHITE = [235, 232, 226];
      const ROOF_GREY = [86, 90, 96];
      const GREEN_TRIM = [44, 126, 74];
      const GOLD_RIDGE = [246, 204, 68];
      const VERMILION = [174, 42, 36];
      const LANTERN_WARM = [255, 212, 122];
      const FLOODLIGHT = [255, 198, 105];

      // --- A. Battered Grey-Brick Corner Rampart Bastion (城台, 12m tall) ---
      // Granite footing plinth (49x49m)
      b.addBox(cx, y0, cz, 49.0, 1.2, 49.0, 0, BASE_STONE, false);
      // Main battered square corner bastion (48x48m tapering to 44x44m at 12m)
      b.addFrustumBox(cx, y0 + 1.2, cz, 48.0, 48.0, 44.0, 44.0, 10.8, 0, GREY_BRICK, false, true);

      // Connecting city wall rampart extending West (-X) along South wall line
      b.addFrustumBox(cx - 36.0, y0, cz + 13.0, 36.0, 20.0, 36.0, 17.0, 12.0, 0, GREY_BRICK, false, true);
      // Connecting city wall rampart extending North (-Z) along East wall line
      b.addFrustumBox(cx + 13.0, y0, cz - 36.0, 20.0, 36.0, 17.0, 36.0, 12.0, 0, GREY_BRICK, false, true);

      // Inner rampart access horse ramp (马道) on Northwest inner courtyard
      b.addFrustumBox(cx - 13.0, y0, cz - 13.0, 14.0, 14.0, 12.0, 12.0, 6.0, 0, GREY_BRICK, false, true);

      // Bastion platform top surface (y0 + 12m)
      const py0 = y0 + 12.0;

      // Platform pavement in authentic weathered grey stone
      b.addBox(cx, py0 - 0.25, cz, 44.2, 0.25, 44.2, 0, BASE_STONE, false);

      // Warm amber nighttime floodlighting strip ONLY along outer parapet base (+X and +Z)
      b.addBox(cx + 21.6, py0 - 0.1, cz + 2.0, 0.5, 0.2, 38.0, 0, FLOODLIGHT, true);
      b.addBox(cx + 2.0, py0 - 0.1, cz + 21.6, 38.0, 0.2, 0.5, 0, FLOODLIGHT, true);

      // Parapet wall (女墙) and battlements (雉堞垛口) along outer East and South edges
      b.addBox(cx + 21.8, py0, cz + 2.0, 0.6, 0.8, 40.0, 0, GREY_BRICK, false);
      b.addBox(cx + 2.0, py0, cz + 21.8, 40.0, 0.8, 0.6, 0, GREY_BRICK, false);

      // Battlement teeth (垛口) along South (+Z) and East (+X) outer edges
      for (let i = -7; i <= 7; i++) {
        if (i % 2 === 0) {
          b.addBox(cx + i * 2.8, py0 + 0.8, cz + 21.8, 1.6, 0.65, 0.6, 0, GREY_BRICK, false);
          b.addBox(cx + 21.8, py0 + 0.8, cz + i * 2.8, 0.6, 0.65, 1.6, 0, GREY_BRICK, false);
        }
      }

      // --- B. 4-Story L-Shaped Arrow Tower Body (曲尺形角楼楼体, 17m tall, sitting on py0) ---
      // Authentic L-shape plan:
      // Outer corner is at Southeast (+X, +Z).
      // South wing extends along -X: length 35m, depth 14.5m, centered at (cx + 1.0, cz + 11.25)
      // East wing extends along -Z: depth 35m, width 14.5m, centered at (cx + 11.25, cz + 1.0)
      // Shared corner square is [cx + 4.0 .. cx + 18.5, cz + 4.0 .. cz + 18.5], center (cx + 11.25, cz + 11.25)
      const swCx = cx + 1.0, swCz = cz + 11.25;
      const ewCx = cx + 11.25, ewCz = cz + 1.0;
      const jx = cx + 11.25, jz = cz + 11.25; // Corner intersection axis

      // Lower 3 stories brick walls (py0 to py0 + 9.0m)
      b.addBox(swCx, py0, swCz, 35.0, 9.0, 14.5, 0, GREY_BRICK, false);
      b.addBox(ewCx, py0, ewCz, 14.5, 9.0, 35.0, 0, GREY_BRICK, false);

      // Inner courtyard colonnade and veranda (抱厦) facing Northwest
      b.addBox(swCx - 7.0, py0, swCz - 7.25, 21.0, 8.6, 0.8, 0, VERMILION, false);
      b.addBox(ewCx - 7.25, py0, ewCz - 7.0, 0.8, 8.6, 21.0, 0, VERMILION, false);
      for (let c = -2; c <= 2; c++) {
        b.addBox(swCx - 7.0 + c * 3.8, py0 + 1.8, swCz - 7.45, 1.8, 4.0, 0.25, 0, LANTERN_WARM, true);
        b.addCylinder(swCx - 7.0 + c * 3.8, py0, swCz - 7.65, 0.36, 0.34, 8.6, 8, 0, VERMILION, false);

        b.addBox(ewCx - 7.45, py0 + 1.8, ewCz - 7.0 + c * 3.8, 0.25, 4.0, 1.8, 0, LANTERN_WARM, true);
        b.addCylinder(ewCx - 7.65, py0, ewCz - 7.0 + c * 3.8, 0.36, 0.34, 8.6, 8, 0, VERMILION, false);
      }

      // --- C. Exactly 144 White-Framed Arrow Slits (箭窗, 4 tiers: 3 under lower eave, 1 on 4th story) ---
      // Distribution:
      // - Outer South face: 14 per tier * 4 tiers = 56 slits
      // - Outer East face: 14 per tier * 4 tiers = 56 slits
      // - West end face: 4 per tier * 4 tiers = 16 slits
      // - North end face: 4 per tier * 4 tiers = 16 slits
      // Total: 56 + 56 + 16 + 16 = 144 slits!
      const slitTiers = [
        py0 + 1.8,  // Tier 1 (1st story)
        py0 + 4.2,  // Tier 2 (2nd story)
        py0 + 6.6,  // Tier 3 (3rd story)
        py0 + 10.8, // Tier 4 (4th story, above lower eave)
      ];

      for (let r = 0; r < slitTiers.length; r++) {
        const wy = slitTiers[r];

        // 1. South outer face (z = cz + 18.5): 14 slits
        for (let col = 0; col < 14; col++) {
          const sx = (cx - 15.0) + col * (31.0 / 13.0);
          const sz = swCz + 7.25 + 0.15;
          b.addBox(sx, wy, sz, 1.35, 1.45, 0.35, 0, PARAPET_WHITE, false);
          const isLit = (r + col) % 3 === 0;
          b.addBox(sx, wy + 0.15, sz + 0.1, 0.85, 0.95, 0.22, 0, isLit ? LANTERN_WARM : [34, 30, 30], isLit);
        }

        // 2. East outer face (x = cx + 18.5): 14 slits
        for (let col = 0; col < 14; col++) {
          const sz = (cz - 15.0) + col * (31.0 / 13.0);
          const sx = ewCx + 7.25 + 0.15;
          b.addBox(sx, wy, sz, 0.35, 1.45, 1.35, 0, PARAPET_WHITE, false);
          const isLit = (r + col + 1) % 3 === 0;
          b.addBox(sx + 0.1, wy + 0.15, sz, 0.22, 0.95, 0.85, 0, isLit ? LANTERN_WARM : [34, 30, 30], isLit);
        }

        // 3. West end face of South wing (x = cx - 16.5): 4 slits
        for (let col = 0; col < 4; col++) {
          const sz = (cz + 5.5) + col * (11.0 / 3.0);
          const sx = swCx - 17.5 - 0.15;
          b.addBox(sx, wy, sz, 0.35, 1.45, 1.35, 0, PARAPET_WHITE, false);
          const isLit = (r + col) % 2 === 0;
          b.addBox(sx - 0.1, wy + 0.15, sz, 0.22, 0.95, 0.85, 0, isLit ? LANTERN_WARM : [34, 30, 30], isLit);
        }

        // 4. North end face of East wing (z = cz - 16.5): 4 slits
        for (let col = 0; col < 4; col++) {
          const sx = (cx + 5.5) + col * (11.0 / 3.0);
          const sz = ewCz - 17.5 - 0.15;
          b.addBox(sx, wy, sz, 1.35, 1.45, 0.35, 0, PARAPET_WHITE, false);
          const isLit = (r + col + 1) % 2 === 0;
          b.addBox(sx, wy + 0.15, sz - 0.1, 0.85, 0.95, 0.22, 0, isLit ? LANTERN_WARM : [34, 30, 30], isLit);
        }
      }

      // --- D. L-Shaped Double-Eave Hip-and-Gable Roof (曲尺形重檐歇山顶) ---
      // 1. Lower eave skirt at py0 + 8.6m
      const lowRoofH = 1.35;
      b.addFrustumBox(swCx, py0 + 8.6, swCz, 38.0, 17.5, 36.0, 15.5, lowRoofH, 0, GREEN_TRIM, false, true);
      b.addFrustumBox(ewCx, py0 + 8.6, ewCz, 17.5, 38.0, 15.5, 36.0, lowRoofH, 0, GREEN_TRIM, false, true);
      // Lower eave warm nighttime under-glow
      b.addBox(swCx, py0 + 8.45, swCz, 37.0, 0.2, 16.5, 0, FLOODLIGHT, true);
      b.addBox(ewCx, py0 + 8.45, ewCz, 16.5, 0.2, 37.0, 0, FLOODLIGHT, true);

      // 2. Upper 4th story walls (py0 + 9.5m to py0 + 12.3m)
      b.addBox(swCx, py0 + 9.5, swCz, 33.5, 2.8, 13.0, 0, GREY_BRICK, false);
      b.addBox(ewCx, py0 + 9.5, ewCz, 13.0, 2.8, 33.5, 0, GREY_BRICK, false);

      // 3. Upper Main Intersecting Hip-and-Gable Roof (py0 + 12.3m to py0 + 15.6m)
      // Dougong painted frieze band
      b.addBox(swCx, py0 + 12.1, swCz, 34.2, 0.32, 13.8, 0, [42, 118, 96], false);
      b.addBox(ewCx, py0 + 12.1, ewCz, 13.8, 0.32, 34.2, 0, [42, 118, 96], false);
      b.addBox(swCx, py0 + 12.25, swCz, 34.6, 0.2, 14.2, 0, FLOODLIGHT, true);
      b.addBox(ewCx, py0 + 12.25, ewCz, 14.2, 0.2, 34.6, 0, FLOODLIGHT, true);

      // Lower flared eave trim (green glazed tile border)
      b.addFrustumBox(swCx, py0 + 12.3, swCz, 39.0, 18.0, 37.0, 16.0, 0.5, 0, GREEN_TRIM, false, false);
      b.addFrustumBox(ewCx, py0 + 12.3, ewCz, 18.0, 39.0, 16.0, 37.0, 0.5, 0, GREEN_TRIM, false, false);

      // Mid concave roof slope (grey tube tiles)
      b.addFrustumBox(swCx, py0 + 12.8, swCz, 37.0, 16.0, 31.0, 10.0, 1.5, 0, ROOF_GREY, false, false);
      b.addFrustumBox(ewCx, py0 + 12.8, ewCz, 16.0, 37.0, 10.0, 31.0, 1.5, 0, ROOF_GREY, false, false);

      // Upper steep roof pitch
      b.addFrustumBox(swCx, py0 + 14.3, swCz, 31.0, 10.0, 26.0, 3.8, 1.3, 0, ROOF_GREY, false, true);
      b.addFrustumBox(ewCx, py0 + 14.3, ewCz, 10.0, 31.0, 3.8, 26.0, 1.3, 0, ROOF_GREY, false, true);

      // 4. Perpendicular Intersecting Roof Ridges (正脊)
      // The two ridges meet at (jx, jz) = (cx + 11.25, cz + 11.25) at py0 + 15.6m
      const ridgeY = py0 + 15.6;
      // South wing ridge running East-West along z = jz, from cx - 14.0 to jx
      const swRidgeLen = jx - (cx - 14.0);
      b.addBox((cx - 14.0 + jx) * 0.5, ridgeY, jz, swRidgeLen, 0.65, 0.8, 0, GOLD_RIDGE, false);

      // East wing ridge running North-South along x = jx, from cz - 14.0 to jz
      const ewRidgeLen = jz - (cz - 14.0);
      b.addBox(jx, ridgeY, (cz - 14.0 + jz) * 0.5, 0.8, 0.65, ewRidgeLen, 0, GOLD_RIDGE, false);

      // 5. Authentic Roof Ridge Finials (吻兽与宝顶)
      // Corner junction apex: prominent gilded flame jewel finial (鎏金宝顶) right at intersection (jx, jz)
      b.addBox(jx, ridgeY + 0.35, jz, 2.0, 0.45, 2.0, 0, GOLD_RIDGE, false);
      b.addCylinder(jx, ridgeY + 0.6, jz, 0.85, 0.55, 0.45, 12, 0, GOLD_RIDGE, false);
      b.addCylinder(jx, ridgeY + 1.05, jz, 0.45, 0.12, 0.7, 10, 0, [255, 222, 90], true);

      // West end of South ridge: Gilded Chiwen beast (鸱吻)
      b.addBox(cx - 14.0, ridgeY + 0.35, jz, 0.9, 1.1, 0.9, 0, [250, 215, 80], true);
      // North end of East ridge: Gilded Chiwen beast (鸱吻)
      b.addBox(jx, ridgeY + 0.35, cz - 14.0, 0.9, 1.1, 0.9, 0, [250, 215, 80], true);
    },
  },

  // 2. Beijing Olympic Tower (北京奥林匹克塔)
  {
    id: 'olympic_tower',
    nameZh: '北京奥林匹克塔',
    nameEn: 'Beijing Olympic Tower',
    cx: -821,
    cz: -10865,
    exclR: 85,
    height: 247,
    osmIds: [962658730, 559922059],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const WHITE_STEEL = [236, 240, 248];
      const SILVER_TRUSS = [205, 214, 226];
      const GLASS_DARK = [46, 72, 104];
      const GLASS_LIT = [255, 235, 175];
      const PODIUM_STONE = [188, 194, 204];
      const CYAN_LED = [130, 225, 255];

      // --- A. Circular Entrance Podium & Landscaped Base ---
      b.addCylinder(cx, y0, cz, 52.0, 48.0, 4.0, 28, 0, PODIUM_STONE, false);
      b.addCylinder(cx, y0 + 4.0, cz, 46.0, 42.0, 3.5, 28, 0, [212, 218, 228], false);
      // Curved entrance hall glass curtain wall
      b.addCylinder(cx, y0 + 4.0, cz, 38.0, 38.0, 3.5, 24, 0, GLASS_DARK, false);
      b.addCylinder(cx, y0 + 7.2, cz, 38.4, 38.4, 0.45, 24, 0, CYAN_LED, true);

      // Ground-level Olympic 5 rings display at South main entrance plaza (+Z)
      const ringY = y0 + 5.5;
      const ringColors = [
        [42, 128, 245],   // Blue
        [248, 195, 42],   // Yellow
        [230, 235, 242],  // Silver / White
        [46, 192, 105],   // Green
        [242, 52, 52],    // Red
      ];
      const ringOffsets = [
        [-5.6, 1.8], [-2.8, 0.0], [0.0, 1.8], [2.8, 0.0], [5.6, 1.8]
      ];
      for (let i = 0; i < 5; i++) {
        const [rx, ryOff] = ringOffsets[i];
        b.addCylinder(cx + rx, ringY + ryOff, cz + 44.0, 1.35, 1.35, 0.35, 12, Math.PI / 2, ringColors[i], true);
      }

      // --- B. The 5 Slender Steel Shafts ("Tree of Life") ---
      // Real shafts rising to 186m, 198m, 210m, 222m, and central Tower 1 canopy at 232m
      // topped by the rotating Olympic 5-ring crown to exactly 246.8m (~247m maxY)
      const shafts = [
        [0.0, 0.0, 232.0, 19.5, [255, 222, 90]],     // Tower 1 (Main/Center, 232m canopy, crown to 246.8m)
        [15.0, 17.0, 222.0, 16.0, [46, 142, 255]],   // Tower 2 (Southeast, 222m, Blue Crown)
        [-17.0, -15.0, 210.0, 15.2, [255, 190, 45]], // Tower 3 (Northwest, 210m, Yellow Crown)
        [18.0, -16.0, 198.0, 14.5, [48, 225, 125]],  // Tower 4 (Northeast, 198m, Green Crown)
        [-16.0, 16.0, 186.0, 13.8, [255, 68, 68]],   // Tower 5 (Southwest, 186m, Red Crown)
      ];

      const shaftCoords = shafts.map(([dx, dz, h, cr, col]) => ({
        x: cx + dx,
        z: cz + dz,
        h,
        cr,
        col,
      }));

      // Render shafts, vertical LED spines, and circular collars
      for (let sIdx = 0; sIdx < shaftCoords.length; sIdx++) {
        const { x: sx, z: sz, h, cr, col } = shaftCoords[sIdx];
        const r0 = sIdx === 0 ? 5.8 : 4.6;
        const r1 = sIdx === 0 ? 4.2 : 3.4;

        // Slender cylindrical white steel shaft
        b.addCylinder(sx, y0 + 7.5, sz, r0, r1, h - 14.0, 16, 0, WHITE_STEEL, false);

        // Vertical glowing cyan LED lighting ribbons along 4 flanks of the shaft
        const spineH = h - 22.0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          b.addBox(sx + ox * (r0 * 0.96), y0 + 10.0, sz + oz * (r0 * 0.96), 0.35, spineH, 0.35, 0, CYAN_LED, true);
        }

        // Structural reinforcing ring collars every 35m
        for (let cy = y0 + 35.0; cy < y0 + h - 18.0; cy += 35.0) {
          b.addCylinder(sx, cy, sz, r0 * 1.15, r0 * 1.15, 1.2, 16, 0, SILVER_TRUSS, false);
        }

        // --- C. Observation Disc Canopies ("Tree of Life" Crown Discs) ---
        const canopyY0 = y0 + h - 14.0;
        // Flared inverted cone underside
        b.addCylinder(sx, canopyY0, sz, r1, cr, 5.2, 20, 0, WHITE_STEEL, false);

        // Enclosed glass observation lounge (2 levels)
        b.addCylinder(sx, canopyY0 + 5.2, sz, cr * 0.96, cr * 0.98, 4.2, 24, 0, GLASS_DARK, false);
        b.addCylinder(sx, canopyY0 + 6.0, sz, cr * 0.99, cr * 0.99, 2.4, 24, 0, GLASS_LIT, true);

        // Circumferential glowing LED edge ribbon band (Olympic Ring colors)
        b.addCylinder(sx, canopyY0 + 9.4, sz, cr + 0.35, cr + 0.35, 1.2, 24, 0, col, true);

        // Cantilevered open-air observation roof deck & safety glass balustrade
        b.addCylinder(sx, canopyY0 + 10.6, sz, cr, cr * 0.94, 2.4, 20, 0, WHITE_STEEL, false);
        b.addCylinder(sx, canopyY0 + 13.0, sz, cr * 0.94, cr * 0.94, 1.0, 20, 0, [195, 230, 255], true);

        // Maintenance spire for outer towers (2 to 5)
        if (sIdx > 0) {
          b.addCylinder(sx, canopyY0 + 14.0, sz, 1.2, 0.3, 3.5, 10, 0, WHITE_STEEL, false);
        }
      }

      // --- D. Interconnecting 3D Diagonal Spatial Steel Struts (b.addStrut) ---
      const core = shaftCoords[0];
      const tierHeights = [38.0, 72.0, 106.0, 140.0, 172.0];

      for (let t = 0; t < tierHeights.length; t++) {
        const ty = y0 + tierHeights[t];
        for (let i = 1; i < shaftCoords.length; i++) {
          const outer = shaftCoords[i];
          if (ty > y0 + outer.h - 18.0) continue;

          // Horizontal radial struts connecting outer shafts to central shaft
          b.addStrut(outer.x, ty, outer.z, core.x, ty, core.z, 0.95, SILVER_TRUSS, false);
          // Diagonal X-bracing struts to core
          const nextY = Math.min(y0 + outer.h - 16.0, ty + 15.0);
          b.addStrut(outer.x, ty, outer.z, core.x, nextY, core.z, 0.75, SILVER_TRUSS, false);
          b.addStrut(outer.x, nextY, outer.z, core.x, ty, core.z, 0.75, SILVER_TRUSS, false);

          // Diagonal spatial struts between adjacent outer shafts forming a rigid cage
          const nextOuter = shaftCoords[i === 4 ? 1 : i + 1];
          if (ty <= y0 + nextOuter.h - 18.0) {
            b.addStrut(outer.x, ty, outer.z, nextOuter.x, ty, nextOuter.z, 0.85, SILVER_TRUSS, false);
            b.addStrut(outer.x, ty, outer.z, nextOuter.x, nextY, nextOuter.z, 0.65, SILVER_TRUSS, false);
          }
        }
      }

      // --- E. Cross-Planar 3D Olympic 5 Rings Crown (atop Tower 1, 232m to 246.8m, maxY = 247m) ---
      const t1TopY = y0 + 232.0;
      // White steel support lattice mast rising to 239.5m
      b.addCylinder(core.x, t1TopY, core.z, 2.8, 1.8, 7.5, 12, 0, WHITE_STEEL, false);
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2;
        const lx = Math.cos(ang) * 2.4;
        const lz = Math.sin(ang) * 2.4;
        b.addStrut(core.x + lx, t1TopY, core.z + lz, core.x, t1TopY + 7.5, core.z, 0.5, SILVER_TRUSS, false);
      }

      // Cross-planar Olympic 5 Rings Structure (239.5m to 246.5m)
      const ringsBaseY = t1TopY + 7.5;
      const ringSpecs = [
        [-3.6, 3.2, [42, 135, 255]],  // Top-Left: Blue
        [0.0, 3.2, [245, 248, 255]],  // Top-Center: Silver / Black
        [3.6, 3.2, [255, 48, 48]],    // Top-Right: Red
        [-1.8, 0.6, [255, 205, 45]],  // Bottom-Left: Yellow
        [1.8, 0.6, [42, 215, 115]],   // Bottom-Right: Green
      ];

      // Render rings in both XZ orientations (0° facing Z, and 90° facing X)
      for (const rotYaw of [0, Math.PI / 2]) {
        const cosY = Math.cos(rotYaw);
        const sinY = Math.sin(rotYaw);

        for (const [rx, ryOff, col] of ringSpecs) {
          const ringCy = ringsBaseY + ryOff + 1.4;
          const nSegs = 12;
          const rRad = 1.7;
          for (let s = 0; s < nSegs; s++) {
            const a0 = (s / nSegs) * Math.PI * 2;
            const a1 = ((s + 1) / nSegs) * Math.PI * 2;
            const l0x = rx + Math.cos(a0) * rRad;
            const l1x = rx + Math.cos(a1) * rRad;
            const y0_ = ringCy + Math.sin(a0) * rRad;
            const y1_ = ringCy + Math.sin(a1) * rRad;

            const x0 = core.x + l0x * cosY;
            const z0 = core.z + l0x * sinY;
            const x1 = core.x + l1x * cosY;
            const z1 = core.z + l1x * sinY;
            b.addStrut(x0, y0_, z0, x1, y1_, z1, 0.36, col, true);
          }
        }
      }

      // Summit flashing aviation safety beacon at 246.8m (maxY = 247m)
      b.addBox(core.x, t1TopY + 14.6, core.z, 0.8, 0.2, 0.8, 0, [255, 255, 255], true);
    },
  },

  // 3. National Stadium / Bird's Nest (国家体育场 "鸟巢")
  {
    id: 'birds_nest',
    nameZh: '国家体育场 (鸟巢)',
    nameEn: "National Stadium (Bird's Nest)",
    cx: -621,
    cz: -9189,
    exclR: 210,
    height: 69,
    osmIds: [563404, 38470804],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const STEEL_SILVER = [212, 220, 230];
      const STEEL_DARK = [148, 156, 168];
      const STEEL_LIT = [242, 248, 255];
      const BOWL_RED = [218, 38, 34];
      const BOWL_DARK = [172, 28, 25];
      const BOWL_LANTERN = [255, 78, 62];
      const PLAZA_CONCRETE = [178, 182, 190];
      const TURF_GREEN = [42, 146, 62];

      // --- A. Elevated Elliptical Plaza Podium Base ---
      b.addEllipticalSlice(cx, y0, cz, 172.0, 148.0, 168.0, 144.0, 3.0, 32, 0, PLAZA_CONCRETE, false, true);
      // Ceremonial stairs and entrance ramps at South (+Z) and North (-Z)
      for (const zSign of [1, -1]) {
        b.addFrustumBox(cx, y0, cz + zSign * 156.0, 52.0, 18.0, 44.0, 8.0, 3.0, 0, PLAZA_CONCRETE, false, true);
      }

      // --- B. The Iconic Stadium Seating Bowl ("Red Bowl" / 红碗) & Central Pitch ---
      // The interior amphitheater is hollow and open to the sky (capTop = false)
      // The grandstand rim curves naturally with the saddle profile (taller on East/West, lower on North/South)

      // 1. Outer concrete grandstand walls (seen through the steel lattice from outside)
      // Lower outer wall
      b.addEllipticalSlice(cx, y0 + 3.0, cz, 116.0, 96.0, 126.0, 106.0, 11.0, 32, 0, BOWL_RED, false, false);
      // Mid outer wall with brightly illuminated VIP suite ribbon
      b.addEllipticalSlice(cx, y0 + 14.0, cz, 126.0, 106.0, 135.0, 115.0, 11.0, 32, 0, BOWL_LANTERN, true, false);
      // Upper outer wall
      b.addEllipticalSlice(cx, y0 + 25.0, cz, 135.0, 115.0, 141.0, 121.0, 9.0, 32, 0, BOWL_RED, false, false);

      // 2. Inner amphitheater seating bowl (sloping DOWNWARD toward the central soccer pitch)
      // Upper seating tier (from rim down to y=23)
      b.addEllipticalSlice(cx, y0 + 23.0, cz, 112.0, 90.0, 139.0, 119.0, 10.0, 32, 0, BOWL_RED, false, false);
      // Mid seating tier & VIP balcony (y=22 down to y=13)
      b.addEllipticalSlice(cx, y0 + 13.0, cz, 86.0, 66.0, 110.0, 88.0, 9.0, 32, 0, BOWL_DARK, false, false);
      b.addEllipticalSlice(cx, y0 + 16.5, cz, 98.0, 78.0, 98.6, 78.6, 1.2, 32, 0, BOWL_LANTERN, true, false);
      // Lower seating tier (y=12 down to pitch edge y=3.0)
      b.addEllipticalSlice(cx, y0 + 3.0, cz, 56.0, 38.0, 84.0, 64.0, 9.0, 32, 0, BOWL_RED, false, false);

      // 3. Central Natural Turf Soccer Pitch (绿茵草坪, y0 + 2.8m)
      b.addEllipticalSlice(cx, y0 + 2.7, cz, 54.0, 36.0, 54.0, 36.0, 0.3, 24, 0, TURF_GREEN, false, true);
      // Pitch perimeter touchlines (rectangular 68x44m)
      b.addBox(cx, y0 + 3.05, cz, 68.0, 0.08, 44.0, 0, [38, 136, 54], false);
      b.addBox(cx, y0 + 3.12, cz, 68.0, 0.08, 0.45, 0, [255, 255, 255], false); // Center line
      b.addBox(cx, y0 + 3.12, cz - 22.0, 68.0, 0.08, 0.45, 0, [255, 255, 255], false); // North touchline
      b.addBox(cx, y0 + 3.12, cz + 22.0, 68.0, 0.08, 0.45, 0, [255, 255, 255], false); // South touchline
      b.addBox(cx - 34.0, y0 + 3.12, cz, 0.45, 0.08, 44.0, 0, [255, 255, 255], false); // West goal line
      b.addBox(cx + 34.0, y0 + 3.12, cz, 0.45, 0.08, 44.0, 0, [255, 255, 255], false); // East goal line
      // Center circle & spot
      b.addCylinder(cx, y0 + 3.14, cz, 9.2, 9.2, 0.08, 20, 0, [255, 255, 255], false);
      b.addCylinder(cx, y0 + 3.16, cz, 8.7, 8.7, 0.08, 20, 0, [38, 136, 54], false);
      b.addCylinder(cx, y0 + 3.18, cz, 0.6, 0.6, 0.08, 8, 0, [255, 255, 255], false);
      // Penalty boxes at East and West
      for (const xSign of [1, -1]) {
        const bxCenter = cx + xSign * 27.5;
        b.addBox(bxCenter, y0 + 3.12, cz, 13.0, 0.08, 26.0, 0, [38, 136, 54], false);
        b.addBox(bxCenter, y0 + 3.14, cz - 13.0, 13.0, 0.08, 0.4, 0, [255, 255, 255], false);
        b.addBox(bxCenter, y0 + 3.14, cz + 13.0, 13.0, 0.08, 0.4, 0, [255, 255, 255], false);
        b.addBox(cx + xSign * 21.0, y0 + 3.14, cz, 0.4, 0.08, 26.0, 0, [255, 255, 255], false);
      }
      // Goal frames at East and West ends
      for (const xSign of [1, -1]) {
        const gx = cx + xSign * 34.0;
        b.addStrut(gx, y0 + 3.0, cz - 4.0, gx, y0 + 5.5, cz - 4.0, 0.35, [255, 255, 255], false);
        b.addStrut(gx, y0 + 3.0, cz + 4.0, gx, y0 + 5.5, cz + 4.0, 0.35, [255, 255, 255], false);
        b.addStrut(gx, y0 + 5.5, cz - 4.0, gx, y0 + 5.5, cz + 4.0, 0.35, [255, 255, 255], false);
      }

      // --- C. Saddle-Shaped Elliptical Outer Steel Lattice Shell (马鞍形空间网格结构) ---
      // Real dimensions: 310m x 260m
      // Saddle height formula: 55.25 + 13.25 * cos(2 * theta)
      // East/West (theta = 0, PI): 68.5m high
      // North/South (theta = PI/2, 3PI/2): 42.0m high
      const nPortals = 24;
      const rxOuter = 155.0, rzOuter = 130.0;
      const rxInner = 138.0, rzInner = 116.0;
      const rxOculus = 92.0, rzOculus = 62.0;

      const portalNodes = [];

      for (let i = 0; i < nPortals; i++) {
        const theta = (i / nPortals) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Saddle profile height for this portal
        const saddleH = 55.25 + 13.25 * Math.cos(2.0 * theta);

        // Ground base point
        const bx = cx + cosT * rxOuter;
        const bz = cz + sinT * rzOuter;

        // Top eave perimeter point (leaning inward)
        const tx = cx + cosT * rxInner;
        const tz = cz + sinT * rzInner;
        const ty = y0 + saddleH;

        // Inner oculus rim node
        const ox = cx + cosT * rxOculus;
        const oz = cz + sinT * rzOculus;
        const oy = y0 + saddleH * 0.93;

        portalNodes.push({ bx, bz, tx, ty, tz, ox, oy, oz, saddleH, theta });

        // Primary portal column: inclined heavy box girder
        b.addStrut(bx, y0 + 3.0, bz, tx, ty, tz, 2.2, STEEL_SILVER, false);

        // Primary roof cantilever girder: spanning from eave to inner oculus
        b.addStrut(tx, ty, tz, ox, oy, oz, 1.9, STEEL_SILVER, false);
      }

      // --- D. Dense Interwoven Diagrid Steel Struts across Facade and Roof Ring (b.addStrut) ---
      for (let i = 0; i < nPortals; i++) {
        const cur = portalNodes[i];
        const next1 = portalNodes[(i + 1) % nPortals];
        const next2 = portalNodes[(i + 2) % nPortals];
        const next3 = portalNodes[(i + 3) % nPortals];
        const next4 = portalNodes[(i + 4) % nPortals];
        const next6 = portalNodes[(i + 6) % nPortals];

        // 1. Facade intermediate nodal positions
        const midY1 = y0 + cur.saddleH * 0.36;
        const midX1 = cur.bx * 0.65 + cur.tx * 0.35;
        const midZ1 = cur.bz * 0.65 + cur.tz * 0.35;

        const midY2 = y0 + cur.saddleH * 0.70;
        const midX2 = cur.bx * 0.30 + cur.tx * 0.70;
        const midZ2 = cur.bz * 0.30 + cur.tz * 0.70;

        const nextMidY1 = y0 + next2.saddleH * 0.36;
        const nextMidX1 = next2.bx * 0.65 + next2.tx * 0.35;
        const nextMidZ1 = next2.bz * 0.65 + next2.tz * 0.35;

        const nextMidY2 = y0 + next2.saddleH * 0.70;
        const nextMidX2 = next2.bx * 0.30 + next2.tx * 0.70;
        const nextMidZ2 = next2.bz * 0.30 + next2.tz * 0.70;

        // Diagonal criss-cross struts along lower facade
        b.addStrut(cur.bx, y0 + 3.0, cur.bz, nextMidX1, nextMidY1, nextMidZ1, 1.3, STEEL_DARK, false);
        b.addStrut(next2.bx, y0 + 3.0, next2.bz, midX1, midY1, midZ1, 1.3, STEEL_SILVER, false);

        // Diagonal criss-cross struts along mid facade
        b.addStrut(midX1, midY1, midZ1, nextMidX2, nextMidY2, nextMidZ2, 1.25, STEEL_SILVER, false);
        b.addStrut(nextMidX1, nextMidY1, nextMidZ1, midX2, midY2, midZ2, 1.25, STEEL_DARK, false);

        // Diagonal criss-cross struts reaching upper eave
        b.addStrut(midX2, midY2, midZ2, next3.tx, next3.ty, next3.tz, 1.2, STEEL_SILVER, false);

        // Outer eave perimeter ring truss connecting adjacent portal tops
        b.addStrut(cur.tx, cur.ty, cur.tz, next1.tx, next1.ty, next1.tz, 1.8, STEEL_SILVER, false);
        // Mid-height circumferential belt truss
        b.addStrut(midX2, midY2, midZ2, next1.bx * 0.3 + next1.tx * 0.7, y0 + next1.saddleH * 0.7, next1.bz * 0.3 + next1.tz * 0.7, 1.1, STEEL_DARK, false);

        // 2. Dense Interwoven Diagrid Struts across the Saddle Roof
        // Cantilever-to-neighbor oculus diagonal struts
        b.addStrut(cur.tx, cur.ty, cur.tz, next3.ox, next3.oy, next3.oz, 1.25, STEEL_SILVER, false);
        b.addStrut(cur.ox, cur.oy, cur.oz, next2.tx, next2.ty, next2.tz, 1.2, STEEL_DARK, false);

        // Transverse crossing chords weaving across the roof ring
        const roofMidX_cur = (cur.tx + cur.ox) * 0.5;
        const roofMidY_cur = (cur.ty + cur.oy) * 0.5;
        const roofMidZ_cur = (cur.tz + cur.oz) * 0.5;

        const roofMidX_next = (next4.tx + next4.ox) * 0.5;
        const roofMidY_next = (next4.ty + next4.oy) * 0.5;
        const roofMidZ_next = (next4.tz + next4.oz) * 0.5;

        b.addStrut(roofMidX_cur, roofMidY_cur, roofMidZ_cur, roofMidX_next, roofMidY_next, roofMidZ_next, 1.15, STEEL_SILVER, false);
        b.addStrut(cur.tx, cur.ty, cur.tz, next6.ox, next6.oy, next6.oz, 0.95, STEEL_DARK, false);

        // 3. Inner Elliptical Oculus Rim Double-Ring Truss
        // Upper rim ring
        b.addStrut(cur.ox, cur.oy, cur.oz, next1.ox, next1.oy, next1.oz, 1.7, STEEL_LIT, true);
        // Lower inner rim ring (recessed 2.2m downward)
        const lowOy_cur = cur.oy - 2.2;
        const lowOy_next = next1.oy - 2.2;
        b.addStrut(cur.ox, lowOy_cur, cur.oz, next1.ox, lowOy_next, next1.oz, 1.3, STEEL_SILVER, false);
        // Oculus vertical truss lacing
        b.addStrut(cur.ox, cur.oy, cur.oz, cur.ox, lowOy_cur, cur.oz, 0.9, STEEL_SILVER, false);
        b.addStrut(cur.ox, cur.oy, cur.oz, next1.ox, lowOy_next, next1.oz, 0.85, STEEL_DARK, false);

        // Nighttime architectural floodlight accents along portal crowns
        if (i % 2 === 0) {
          b.addStrut(cur.tx, cur.ty + 0.45, cur.tz, cur.ox, cur.oy + 0.45, cur.oz, 0.65, STEEL_LIT, true);
        }
      }
    },
  },

  // 4. National Aquatics Center / Water Cube (国家游泳中心 "水立方")
  {
    id: 'water_cube',
    nameZh: '国家游泳中心 (水立方)',
    nameEn: 'National Aquatics Center (Water Cube)',
    cx: -1138,
    cz: -9202,
    exclR: 135,
    height: 31,
    osmIds: [29201257, 24831552],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const FOAM_STEEL = [24, 52, 92];
      const BASE_GRANITE = [168, 174, 184];

      // Multi-tone glowing translucent ETFE bubble pillows (气枕)
      const ETFE_CYAN = [45, 175, 255];
      const ETFE_AZURE = [75, 210, 255];
      const ETFE_OCEAN = [28, 125, 235];
      const ETFE_TEAL = [60, 230, 240];

      const ETFE_PALETTE = [ETFE_CYAN, ETFE_AZURE, ETFE_OCEAN, ETFE_TEAL];
      const CYAN_LED = [120, 220, 255];

      // --- A. Base Granite Plinth ---
      b.addBox(cx, y0, cz, 181.0, 1.2, 181.0, 0, BASE_GRANITE, false);

      // --- B. Deep Marine Space-Frame Core Structure (177x177x30m) ---
      const halfW = 88.5;
      const bH = 29.8;
      b.addBox(cx, y0 + 1.2, cz, 176.4, bH, 176.4, 0, [20, 42, 80], false);

      // Deterministic hash helper for procedural bubble sizes and illumination
      const hash = (u, v, s) => {
        let h = (u * 374761393 + v * 668265263 + s * 1274126177) >>> 0;
        h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
        return ((h ^ (h >> 16)) >>> 0) / 4294967295.0;
      };

      // --- C. Contiguous Weaire-Phelan Polyhedral Foam Cells (4 Facades) ---
      // Weaire-Phelan space-filling foam projected onto the facade creates irregular
      // hexagonal and pentagonal bubble pillows that touch edge-to-edge across the facade.
      const nRows = 5;
      const nCols = 14;
      const rowH = bH / nRows;
      const colW = 175.0 / nCols;

      const renderFacadeBubbles = (faceIdx, normalX, normalZ, tangentX, tangentZ) => {
        const faceY0 = y0 + 1.2;

        for (let r = 0; r < nRows; r++) {
          const cy = faceY0 + (r + 0.5) * rowH;

          for (let c = 0; c < nCols; c++) {
            const hVal = hash(r, c, faceIdx * 23 + 7);
            const colIdx = Math.floor(hVal * ETFE_PALETTE.length);
            const pillowColor = ETFE_PALETTE[colIdx];

            // Stagger alternate rows for organic soap bubble layout
            const stagger = (r % 2 === 1) ? colW * 0.5 : 0.0;
            const tCenter = -halfW + 3.0 + (c + 0.5) * colW + stagger;
            if (tCenter < -halfW + 4.5 || tCenter > halfW - 4.5) continue;

            const nSides = hVal > 0.45 ? 6 : 5; // Hexagons and pentagons
            // Cells touch edge-to-edge: radius is ~52% of bay width/height
            const cellR_w = (colW * 0.52) * (0.92 + (hVal - 0.5) * 0.16);
            const cellR_h = (rowH * 0.52) * (0.92 + ((hVal * 19) % 1.0 - 0.5) * 0.16);

            // Compute polygonal vertices on the facade plane
            const polyVerts = [];
            for (let v = 0; v < nSides; v++) {
              const angJitter = ((hash(r * 13 + v, c * 7 + faceIdx, 33) - 0.5) * 0.28);
              const ang = (v / nSides) * Math.PI * 2 + angJitter;
              const radJitter = 0.92 + hash(r * 5 + faceIdx, c * 11 + v, 55) * 0.16;

              const lt = tCenter + Math.cos(ang) * cellR_w * radJitter;
              const ly = cy + Math.sin(ang) * cellR_h * radJitter;

              const vx = cx + normalX * (halfW + 0.35) + tangentX * lt;
              const vz = cz + normalZ * (halfW + 0.35) + tangentZ * lt;
              polyVerts.push({ x: vx, y: ly, z: vz });
            }

            // Inflated central apex hub of the ETFE bubble pillow (+0.6m outward)
            const hubX = cx + normalX * (halfW + 0.75) + tangentX * tCenter;
            const hubY = cy;
            const hubZ = cz + normalZ * (halfW + 0.75) + tangentZ * tCenter;

            // Render polygonal ETFE bubble pillow (fan of triangular facets)
            for (let v = 0; v < nSides; v++) {
              const p0 = polyVerts[v];
              const p1 = polyVerts[(v + 1) % nSides];

              // Outer boundary steel strut
              b.addStrut(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, 0.48, FOAM_STEEL, false);

              // Inflated glowing ETFE pillow facet
              b.addTri(hubX, hubY, hubZ, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, pillowColor, true);

              // Radial structural internal rib
              if (v % 2 === 0) {
                b.addStrut(hubX, hubY, hubZ, p0.x, p0.y, p0.z, 0.35, FOAM_STEEL, false);
              }
            }
          }
        }

        // Perimeter boundary chords along top and bottom edges
        const fY0 = faceY0;
        const fY1 = faceY0 + bH;
        const e0x = cx + normalX * (halfW + 0.35) - tangentX * (halfW - 0.5);
        const e0z = cz + normalZ * (halfW + 0.35) - tangentZ * (halfW - 0.5);
        const e1x = cx + normalX * (halfW + 0.35) + tangentX * (halfW - 0.5);
        const e1z = cz + normalZ * (halfW + 0.35) + tangentZ * (halfW - 0.5);
        b.addStrut(e0x, fY0, e0z, e1x, fY0, e1z, 0.65, FOAM_STEEL, false);
        b.addStrut(e0x, fY1, e0z, e1x, fY1, e1z, 0.65, FOAM_STEEL, false);
      };

      // Render 4 vertical facades:
      renderFacadeBubbles(0, 0, 1, 1, 0);   // South face (+Z)
      renderFacadeBubbles(1, 0, -1, -1, 0); // North face (-Z)
      renderFacadeBubbles(2, 1, 0, 0, -1);  // East face (+X, facing Bird's Nest)
      renderFacadeBubbles(3, -1, 0, 0, 1);  // West face (-X)

      // --- D. Roof Weaire-Phelan Polyhedral Foam Matrix (177x177m) ---
      // Contiguous polyhedral bubble pillow matrix covering the roof plane (Top View & Isometric)
      const roofY = y0 + 1.2 + bH;
      const roofGrid = 10;
      const rCellW = 172.0 / roofGrid;

      for (let rx = 0; rx < roofGrid; rx++) {
        for (let rz = 0; rz < roofGrid; rz++) {
          const hVal = hash(rx, rz, 101);
          const colIdx = Math.floor(hVal * ETFE_PALETTE.length);
          const roofCol = ETFE_PALETTE[colIdx];

          // Stagger alternate columns for organic foam layout
          const zStagger = (rx % 2 === 1) ? rCellW * 0.5 : 0.0;
          const rcx = cx - 86.0 + (rx + 0.5) * rCellW;
          const rcz = cz - 86.0 + (rz + 0.5) * rCellW + zStagger;

          // Strictly guard boundaries so NO pillows stick out past the roof perimeter
          if (rcx < cx - halfW + 6.0 || rcx > cx + halfW - 6.0) continue;
          if (rcz < cz - halfW + 6.0 || rcz > cz + halfW - 6.0) continue;

          const nSides = hVal > 0.45 ? 6 : 5;
          // Contiguous tiling across the roof plane
          const cellR = (rCellW * 0.52) * (0.92 + (hVal - 0.5) * 0.16);

          // Roof polygonal vertices on horizontal plane
          const rPolyVerts = [];
          for (let v = 0; v < nSides; v++) {
            const angJitter = ((hash(rx * 9 + v, rz * 13, 77) - 0.5) * 0.28);
            const ang = (v / nSides) * Math.PI * 2 + angJitter;
            const radJitter = 0.92 + hash(rx * 7, rz * 11 + v, 99) * 0.16;

            const vx = rcx + Math.cos(ang) * cellR * radJitter;
            const vz = rcz + Math.sin(ang) * cellR * radJitter;
            rPolyVerts.push({ x: vx, z: vz });
          }

          // Inflated upward-domed ETFE pillow hub
          const hubY = roofY + 0.65;

          for (let v = 0; v < nSides; v++) {
            const p0 = rPolyVerts[v];
            const p1 = rPolyVerts[(v + 1) % nSides];

            // Roof steel framing strut
            b.addStrut(p0.x, roofY + 0.25, p0.z, p1.x, roofY + 0.25, p1.z, 0.48, FOAM_STEEL, false);

            // Glowing domed ETFE pillow facet
            b.addTri(rcx, hubY, rcz, p0.x, roofY + 0.25, p0.z, p1.x, roofY + 0.25, p1.z, roofCol, true);

            // Radial foam chord
            if (v % 2 === 0) {
              b.addStrut(rcx, hubY, rcz, p0.x, roofY + 0.25, p0.z, 0.35, FOAM_STEEL, false);
            }
          }
        }
      }

      // Perimeter coping beams along the 4 outer edges of the roof
      const copeY = roofY + 0.4;
      b.addBox(cx, copeY, cz + halfW, 177.0, 0.6, 0.8, 0, [28, 56, 96], false);
      b.addBox(cx, copeY, cz - halfW, 177.0, 0.6, 0.8, 0, [28, 56, 96], false);
      b.addBox(cx + halfW, copeY, cz, 0.8, 0.6, 177.0, 0, [28, 56, 96], false);
      b.addBox(cx - halfW, copeY, cz, 0.8, 0.6, 177.0, 0, [28, 56, 96], false);

      // --- E. Recessed Public Entrance Portals ---
      // South Main Entrance (+Z)
      b.addBox(cx, y0 + 1.2, cz + halfW - 1.0, 32.0, 7.5, 3.5, 0, [18, 28, 48], false);
      b.addBox(cx, y0 + 8.5, cz + halfW + 1.5, 36.0, 0.55, 5.0, 0, [225, 235, 248], false);
      b.addBox(cx, y0 + 8.2, cz + halfW + 1.5, 35.0, 0.22, 4.8, 0, CYAN_LED, true);

      // East Entrance (+X, facing Olympic Boulevard and Bird's Nest)
      b.addBox(cx + halfW - 1.0, y0 + 1.2, cz, 3.5, 7.5, 28.0, 0, [18, 28, 48], false);
      b.addBox(cx + halfW + 1.5, y0 + 8.5, cz, 5.0, 0.55, 32.0, 0, [225, 235, 248], false);
      b.addBox(cx + halfW + 1.5, y0 + 8.2, cz, 4.8, 0.22, 31.0, 0, CYAN_LED, true);
    },
  },
];
