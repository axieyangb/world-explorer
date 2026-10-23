/**
 * World Explorer — Procedural 3D Architectural Landmark Definitions
 * Batch 08 (BATCH_08): Modern Supertall CBD & Contemporary Architecture
 *
 * Landmarks:
 * 1. China World Trade Center Tower B (国贸三期B座, 296m, SOM / Pelli)
 * 2. Beijing Yintai Centre (北京银泰中心, 250m, John Portman & Associates)
 * 3. Fortune Financial Center (财富金融中心 FFC, 265m, P&T Group)
 * 4. Wangjing SOHO (望京SOHO, 200m, Zaha Hadid Architects)
 */

export const BATCH_08 = [
  // 1. China World Trade Center Tower B (国贸三期B座)
  {
    id: 'china_world_tower_b',
    nameZh: '国贸三期B座',
    nameEn: 'China World Trade Center Tower B',
    category: 'cbd',
    cx: 4873,
    cz: -313,
    exclR: 70,
    height: 296,
    osmIds: [916885302, 591345720],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const frameCol = [172, 186, 204];
      const glassCol = [46, 72, 102];
      const litWarm = [255, 226, 155];
      const litCool = [180, 232, 255];
      const bandGlow = [215, 238, 255];

      // --- 1. Retail & Hotel Lobby Podium (0m .. 26m) ---
      b.addBox(cx, y0, cz, 76, 26, 72, 0, [180, 192, 206], false);
      // Double-height illuminated retail glass curtain frontage
      b.addBox(cx, y0 + 1.5, cz, 77.2, 13.5, 73.2, 0, [255, 228, 160], true);
      // North & South grand cantilevered glass portico canopies
      for (const zSign of [-1, 1]) {
        b.addBox(cx, y0 + 7.5, cz + zSign * 38.5, 34, 1.4, 9, 0, [195, 208, 224], false);
        b.addBox(cx, y0 + 7.0, cz + zSign * 38.5, 32, 0.4, 8, 0, [255, 220, 140], true);
      }
      // Stepped podium roof terrace
      b.addBox(cx, y0 + 26, cz, 68, 1.2, 64, 0, [205, 216, 228], false);

      // --- 2. Bamboo-Joint Segmented Tapered Skyscraper Shaft (26m .. 264m) ---
      const tiers = 7;
      const shaftH = 264.0 - 26.0;
      const tierH = shaftH / tiers; // ~34.0m per tier
      const baseW = 52.0;
      const topW = 38.0;

      for (let i = 0; i < tiers; i++) {
        const t0 = i / tiers;
        const t1 = (i + 1) / tiers;
        const curW0 = baseW - (baseW - topW) * t0;
        const curW1 = baseW - (baseW - topW) * t1;
        const sy = y0 + 26.0 + i * tierH;
        const bodyH = tierH - 3.2;

        // Sloped curtain wall frustum tier with per-window night lighting
        b.addCurtainWallFrustum(
          cx, sy, cz,
          curW0, curW0,
          curW1, curW1,
          bodyH, 0,
          frameCol, glassCol,
          litWarm, litCool,
          8, 9,
          0.44, 110 + i,
          true
        );

        // Continuous horizontal glowing mechanical / refuge floor band
        b.addBox(cx, sy + bodyH, cz, curW1 + 0.85, 3.2, curW1 + 0.85, 0, bandGlow, true);

        // Prominent vertical structural corner fins
        for (const [sgX, sgZ] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          b.addStrut(
            cx + sgX * (curW0 + 0.3), sy, cz + sgZ * (curW0 + 0.3),
            cx + sgX * (curW1 + 0.3), sy + bodyH, cz + sgZ * (curW1 + 0.3),
            0.65, frameCol, false
          );
        }
      }

      // --- 3. Sculptural Angled Crystalline Crown (264m .. 296m) ---
      // Crown Tier 1: Transition glass penthouse (264m .. 280m)
      b.addCurtainWallFrustum(
        cx, y0 + 264, cz,
        38, 38, 33, 35,
        16, 0,
        [182, 196, 214], [48, 76, 108],
        litWarm, litCool,
        4, 8,
        0.58, 125,
        true
      );

      // Crown Tier 2: Sloped crystalline crown shell (280m .. 294m)
      b.addFrustumBox(cx, y0 + 280, cz, 33, 35, 20, 24, 14, 0, [210, 236, 255], true);

      // Crown top mechanical deck (294m)
      b.addBox(cx, y0 + 294, cz, 20.4, 0.6, 24.4, 0, [240, 250, 255], true);

      // Illuminated architectural crown louvers & vertical screen fins (corrected local offsets)
      for (let f = -3; f <= 3; f++) {
        const fx0 = cx + f * 4.2;
        const fx1 = cx + f * 4.2 * (20.0 / 33.0);
        b.addStrut(fx0, y0 + 280, cz - 17.0, fx1, y0 + 294.0, cz - 11.8, 0.45, [230, 245, 255], true);
        b.addStrut(fx0, y0 + 280, cz + 17.0, fx1, y0 + 294.0, cz + 11.8, 0.45, [230, 245, 255], true);
      }
      for (let f = -3; f <= 3; f++) {
        const fz0 = cz + f * 4.4;
        const fz1 = cz + f * 4.4 * (24.0 / 35.0);
        b.addStrut(cx - 16.0, y0 + 280, fz0, cx - 9.8, y0 + 294.0, fz1, 0.45, [230, 245, 255], true);
        b.addStrut(cx + 16.0, y0 + 280, fz0, cx + 9.8, y0 + 294.0, fz1, 0.45, [230, 245, 255], true);
      }

      // Rooftop communications mast & aviation warning beacon at 296m
      b.addCylinder(cx, y0 + 294.6, cz, 0.75, 0.2, 1.4, 8, 0, [255, 55, 45], true);
    },
  },

  // 2. Beijing Yintai Centre (北京银泰中心)
  {
    id: 'beijing_yin_tai_center',
    nameZh: '北京银泰中心',
    nameEn: 'Beijing Yintai Centre',
    category: 'cbd',
    cx: 4742,
    cz: 279,
    exclR: 95,
    height: 250,
    osmIds: [916885301, 226280805, 226280808, 226280809, 179469504],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // --- 1. Shared Luxury Podium (in01 Shopping Centre, 0m .. 22m) ---
      // Grand rectangular granite base spanning 174m (E-W) x 86m (N-S)
      b.addBox(cx, y0, cz, 174, 22, 86, 0, [215, 212, 205], false);
      // Double-height glowing street-level retail storefronts
      b.addBox(cx, y0 + 1.5, cz, 175.6, 12.0, 87.6, 0, [255, 225, 150], true);
      // North & South grand cantilevered glass entrance porticoes
      for (const zSign of [-1, 1]) {
        b.addBox(cx, y0 + 8.5, cz + zSign * 44.5, 36, 1.4, 9, 0, [210, 215, 224], false);
        b.addBox(cx, y0 + 8.0, cz + zSign * 44.5, 34, 0.4, 8, 0, [255, 220, 140], true);
      }
      // Stepped podium roof terrace parapet
      b.addBox(cx, y0 + 22, cz, 168, 1.2, 80, 0, [205, 215, 225], false);
      // Central atrium pyramid skylight between the three towers
      b.addFrustumBox(cx, y0 + 22, cz, 36, 36, 16, 16, 6.0, 0, [192, 228, 255], true);

      // --- 2. Central Tower: Park Hyatt Beijing & Sky Residences (22m .. 218m) ---
      const coreH = 196.0;
      b.addCurtainWallBox(
        cx, y0 + 22, cz,
        44, coreH, 44, 0,
        [162, 175, 192], [50, 72, 98],
        [255, 224, 150], [175, 228, 255],
        3.8, 4.0,
        0.42, 201
      );

      // 4 Glowing horizontal mechanical refuge floor bands on central tower
      const refugeY = [68, 118, 168, 214];
      for (const ry of refugeY) {
        b.addBox(cx, y0 + ry, cz, 44.8, 3.6, 44.8, 0, [255, 215, 120], true);
      }

      // --- 3. The Iconic Glowing Chinese Imperial Red Lantern Crown (218m .. 250m) ---
      // Inner glowing golden pyramid sanctuary ("中国红灯笼" 核心)
      b.addFrustumBox(cx, y0 + 218, cz, 29, 29, 17, 17, 24.0, 0, [255, 210, 95], true);

      // Outer Crimson Imperial Lattice Framework ([245, 52, 38])
      // Completely hollow perimeter lattice structure with ZERO internal solid boxes to ensure zero z-fighting!
      const red = [245, 52, 38];
      const lanHalf = 16.0;
      const lanTopHalf = 12.0;
      const lanY0 = y0 + 218;
      const lanY1 = y0 + 242;

      // 8 Vertical red structural cage columns (4 corners + 4 mid-faces)
      const columnOffsets = [
        [-lanHalf, -lanHalf, -lanTopHalf, -lanTopHalf],
        [lanHalf, -lanHalf, lanTopHalf, -lanTopHalf],
        [lanHalf, lanHalf, lanTopHalf, lanTopHalf],
        [-lanHalf, lanHalf, -lanTopHalf, lanTopHalf],
        [0, -lanHalf, 0, -lanTopHalf],
        [0, lanHalf, 0, lanTopHalf],
        [-lanHalf, 0, -lanTopHalf, 0],
        [lanHalf, 0, lanTopHalf, 0],
      ];
      for (const [x0, z0, x1, z1] of columnOffsets) {
        b.addStrut(cx + x0, lanY0, cz + z0, cx + x1, lanY1, cz + z1, 1.1, red, true);
      }

      // 4 Horizontal perimeter collar frames constructed from perimeter struts (NO solid box cutting inside!)
      for (let r = 0; r <= 3; r++) {
        const u = r / 3;
        const ry = lanY0 + u * (lanY1 - lanY0);
        const rh = lanHalf + (lanTopHalf - lanHalf) * u;
        b.addStrut(cx - rh, ry, cz - rh, cx + rh, ry, cz - rh, 0.85, red, true);
        b.addStrut(cx + rh, ry, cz - rh, cx + rh, ry, cz + rh, 0.85, red, true);
        b.addStrut(cx + rh, ry, cz + rh, cx - rh, ry, cz + rh, 0.85, red, true);
        b.addStrut(cx - rh, ry, cz + rh, cx - rh, ry, cz - rh, 0.85, red, true);
      }

      // Diamond lattice X-bracing struts across all 4 faces
      const faces = [
        // South face
        [-lanHalf, -lanHalf, lanHalf, -lanHalf, -lanTopHalf, -lanTopHalf, lanTopHalf, -lanTopHalf],
        // East face
        [lanHalf, -lanHalf, lanHalf, lanHalf, lanTopHalf, -lanTopHalf, lanTopHalf, lanTopHalf],
        // North face
        [lanHalf, lanHalf, -lanHalf, lanHalf, lanTopHalf, lanTopHalf, -lanTopHalf, lanTopHalf],
        // West face
        [-lanHalf, lanHalf, -lanHalf, -lanHalf, -lanTopHalf, lanTopHalf, -lanTopHalf, -lanTopHalf],
      ];
      for (const [x0A, z0A, x0B, z0B, x1A, z1A, x1B, z1B] of faces) {
        b.addStrut(cx + x0A, lanY0, cz + z0A, cx + x1B, lanY1, cz + z1B, 0.65, red, true);
        b.addStrut(cx + x0B, lanY0, cz + z0B, cx + x1A, lanY1, cz + z1A, 0.65, red, true);
      }

      // Gilded lantern roof cap (242m .. 248m) & glowing beacon finial at 250m
      b.addFrustumBox(cx, y0 + 242, cz, 24, 24, 10, 10, 6.0, 0, [255, 218, 95], true);
      b.addCylinder(cx, y0 + 248, cz, 1.2, 0.25, 2.0, 8, 0, [255, 220, 100], true);

      // --- 4. East & West Symmetrical Silver Twin Towers (186m each at cx ± 56m) ---
      const twinXOffsets = [-56, 56];
      for (let i = 0; i < 2; i++) {
        const tx = cx + twinXOffsets[i];
        // 38x38m tower shaft up to 176m
        b.addCurtainWallBox(
          tx, y0 + 22, cz,
          38, 154, 38, 0,
          [168, 180, 196], [52, 76, 104],
          [255, 225, 150], [180, 230, 255],
          3.8, 3.8,
          0.40, 202 + i
        );

        // 3 Glowing horizontal mechanical refuge floor bands
        for (const ty of [64, 112, 160]) {
          b.addBox(tx, y0 + ty, cz, 38.8, 3.2, 38.8, 0, [220, 238, 255], true);
        }

        // Stepped pyramid roof crowns (176m .. 186m)
        b.addFrustumBox(tx, y0 + 176, cz, 37, 37, 23, 23, 7.5, 0, [195, 220, 245], true);
        b.addFrustumBox(tx, y0 + 183.5, cz, 23, 23, 14, 14, 2.0, 0, [215, 235, 255], true);
        b.addBox(tx, y0 + 185.5, cz, 14.5, 0.8, 14.5, 0, [255, 225, 140], true);
      }
    },
  },

  // 3. Fortune Financial Center (财富金融中心 FFC)
  {
    id: 'fortune_financial_center',
    nameZh: '财富金融中心 (FFC)',
    nameEn: 'Fortune Financial Center',
    category: 'cbd',
    cx: 4850,
    cz: -859,
    exclR: 75,
    height: 265,
    osmIds: [338085198, 262041668],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const champagneFrame = [198, 192, 178];
      const lowEGlass = [54, 76, 96];
      const litWarm = [255, 228, 155];
      const litCool = [175, 225, 255];
      const goldGlow = [255, 228, 145];

      // --- 1. Grand Banking & Corporate Lobby Podium (0m .. 22m) ---
      // 66m x 64m champagne stone base
      b.addBox(cx, y0, cz, 66, 22, 64, 0, [205, 200, 188], false);
      // Double-height ultra-transparent lobby glazing with warm lighting
      b.addBox(cx, y0 + 1.8, cz, 67.2, 16.0, 65.2, 0, [255, 230, 155], true);
      // Grand south entrance portico canopy
      b.addBox(cx, y0 + 8.5, cz + 34.5, 28, 1.2, 9, 0, [215, 210, 195], false);
      b.addBox(cx, y0 + 8.0, cz + 34.5, 26, 0.4, 8, 0, goldGlow, true);

      // --- 2. Main Tower Body with Distinct 45° Corner Chamfers (22m .. 238m) ---
      const shaftH = 216.0;
      b.addCurtainWallBox(
        cx, y0 + 22, cz,
        51.6, shaftH, 51.6, 0,
        champagneFrame, lowEGlass,
        litWarm, litCool,
        3.8, 4.0,
        0.44, 301
      );

      // Architectural 45° chamfered corner pilasters & vertical champagne solar fins
      const chamferCorners = [
        [-1, -1, -Math.PI * 0.25],
        [1, -1, Math.PI * 0.25],
        [1, 1, -Math.PI * 0.25],
        [-1, 1, Math.PI * 0.25],
      ];
      for (const [sgX, sgZ, rotYaw] of chamferCorners) {
        const px = sgX * 24.5;
        const pz = sgZ * 24.5;
        // Chamfered stone facet
        b.addBox(cx + px, y0 + 22, cz + pz, 3.4, shaftH, 1.0, rotYaw, [215, 208, 192], false);
        // Vertical champagne-gold illuminated architectural solar fin
        b.addBox(cx + px * 1.02, y0 + 22, cz + pz * 1.02, 1.0, shaftH, 0.5, rotYaw, [255, 235, 165], true);
      }

      // 4 Multi-layered glowing mechanical refuge floor bands with metallic louvers
      const refugeY = [74, 128, 182, 234];
      for (const ry of refugeY) {
        b.addBox(cx, y0 + ry, cz, 53.6, 3.6, 53.6, 0, goldGlow, true);
        b.addBox(cx, y0 + ry + 0.6, cz, 54.0, 2.4, 54.0, 0, [50, 60, 72], false);
        b.addBox(cx, y0 + ry + 1.0, cz, 54.3, 1.6, 54.3, 0, [255, 238, 168], true);
      }

      // --- 3. Illuminated Golden-White Architectural Crown & Helipad (238m .. 265m) ---
      // 238m .. 254m: Recessed mechanical penthouse with vertical glowing louvers
      b.addBox(cx, y0 + 238, cz, 46.0, 16.0, 46.0, 0, [68, 82, 98], false);
      b.addBox(cx, y0 + 238, cz, 48.0, 16.0, 48.0, 0, [250, 240, 210], true);

      // Vertical crown louver fins
      for (let i = -4; i <= 4; i++) {
        const off = i * 4.8;
        b.addStrut(cx + off, y0 + 238, cz - 24.2, cx + off, y0 + 254, cz - 24.2, 0.45, [255, 242, 220], true);
        b.addStrut(cx + off, y0 + 238, cz + 24.2, cx + off, y0 + 254, cz + 24.2, 0.45, [255, 242, 220], true);
      }

      // 254m .. 262m: Stepped chamfered lantern deck & crown parapet
      b.addFrustumBox(cx, y0 + 254, cz, 46, 46, 38, 38, 8.0, 0, [235, 228, 210], false);
      b.addBox(cx, y0 + 261.2, cz, 39, 0.8, 39, 0, [255, 225, 130], true);

      // 262m .. 263.2m: Rooftop circular CBD helipad deck with perimeter lighting
      b.addCylinder(cx, y0 + 262.0, cz, 16.0, 16.0, 1.2, 24, 0, [88, 96, 108], false);
      b.addCylinder(cx, y0 + 263.0, cz, 16.2, 16.2, 0.25, 24, 0, [255, 225, 110], true);
      b.addCylinder(cx, y0 + 263.2, cz, 6.5, 6.5, 0.08, 20, 0, [245, 245, 245], true);

      // Rooftop pinnacle & beacon at 265m
      b.addCylinder(cx, y0 + 263.3, cz, 0.9, 0.2, 1.7, 8, 0, [255, 60, 50], true);
    },
  },

  // 4. Wangjing SOHO (望京SOHO)
  {
    id: 'wangjing_soho',
    nameZh: '望京SOHO',
    nameEn: 'Wangjing SOHO',
    category: 'cbd',
    cx: 6590,
    cz: -9620,
    exclR: 165,
    height: 200,
    osmIds: [327007845, 327007846, 327007847, 691614969, 461446738, 262040982],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      const spandrelWhite = [242, 246, 252];
      const darkGlass = [48, 68, 92];
      const ribbonLitIce = [218, 242, 255];

      // --- 1. Flowing Landscaped Podium Terraces, Pavilions & Water Features (0m .. 9m) ---
      // Ground green park lawn terrace
      b.addEllipticalSlice(cx, y0, cz + 8, 92, 70, 88, 66, 2.5, 32, 0.08, [76, 148, 92], false, true);
      // Flowing pedestrian plaza stone terrace ribbons
      b.addEllipticalSlice(cx, y0 + 2.0, cz + 8, 86, 64, 80, 58, 3.0, 32, 0.12, [234, 238, 244], false, true);
      b.addEllipticalSlice(cx, y0 + 5.0, cz + 8, 76, 54, 70, 48, 2.5, 32, 0.16, [244, 248, 252], false, true);
      // Luminous central reflection pool in the central garden
      b.addEllipticalSlice(cx, y0 + 5.2, cz + 8, 38, 26, 36, 24, 0.4, 24, 0.12, [140, 215, 255], true, true);

      // Low-rise curved retail pavilions (Pavilion 1 & 2 at ground realm)
      b.addEllipticalRibbonSlice(cx + 40, y0 + 2.0, cz - 8, 14, 9, 11, 7, 7.5, 20, 0.65, spandrelWhite, darkGlass, ribbonLitIce, 0.55, 410, true);
      b.addEllipticalRibbonSlice(cx - 36, y0 + 2.0, cz - 10, 13, 8, 10, 6, 7.0, 20, -0.55, spandrelWhite, darkGlass, ribbonLitIce, 0.55, 411, true);

      // --- 2. The Three Organic Curving Pebble Mountain Towers (200m, 127m, 118m) ---
      // Asymmetric, elongated lenticular fish/pebble footprints with rx/rz ≈ 2.3..2.5
      // Arranged in sweeping triangular fan with differing yaw orientations
      // Definition: [dx, dz, totalH, slices, baseRx, baseRz, yawBase, leanX, leanZ, seed]
      const pebbleTowers = [
        // Tower 3 (Center-North Tallest Main Peak, 200m)
        [0, -30, 195.0, 44, 46.0, 19.0, -0.45, -3.5, 5.0, 401],
        // Tower 2 (West-South Mid Peak, 127m)
        [-54, 34, 123.0, 28, 42.0, 17.0, 0.35, 4.0, -3.0, 402],
        // Tower 1 (East-South Peak, 118m)
        [52, 38, 114.0, 26, 38.0, 16.0, 1.05, -3.5, -3.5, 403],
      ];

      // Smooth Zaha Hadid organic lenticular radii profile function:
      // Broad substantial pebble silhouette with smooth cosine/parabolic dome crest at top 32% (no sharp cone!)
      const calcPebbleRadii = (t, baseRx, baseRz) => {
        let factor;
        if (t < 0.28) {
          // Swells gracefully in the lower third
          const u = t / 0.28;
          factor = 0.94 + 0.10 * Math.sin(u * Math.PI * 0.5);
        } else if (t < 0.68) {
          // Graceful mid-tower taper maintaining full pebble mass
          const u = (t - 0.28) / 0.40;
          factor = 1.04 - 0.22 * Math.sin(u * Math.PI * 0.5);
        } else {
          // Parabolic / cosine dome arch at upper 32%
          const u = (t - 0.68) / 0.32;
          const dome = Math.sqrt(Math.max(0, 1.0 - u * u * 0.84));
          factor = 0.82 * (0.34 + 0.66 * dome);
        }
        return [baseRx * factor, baseRz * factor];
      };

      for (const [dx, dz, totalH, slices, baseRx, baseRz, yawBase, leanX, leanZ, seed] of pebbleTowers) {
        const tx = cx + dx;
        const tz = cz + dz;
        const sliceH = totalH / slices;

        for (let s = 0; s < slices; s++) {
          const t0 = s / slices;
          const t1 = (s + 1) / slices;
          const [rx0, rz0] = calcPebbleRadii(t0, baseRx, baseRz);
          const [rx1, rz1] = calcPebbleRadii(t1, baseRx, baseRz);
          const sy = y0 + s * sliceH;

          // Organic spine curvature shift along the vertical axis
          const shift0 = Math.sin(t0 * Math.PI * 0.85);
          const shift1 = Math.sin(t1 * Math.PI * 0.85);
          const curSx = tx + (leanX * shift0 + leanX * shift1) * 0.5;
          const curSz = tz + (leanZ * shift0 + leanZ * shift1) * 0.5;

          // Subtle organic yaw twist
          const curYaw = yawBase + t0 * 0.14;
          const isTop = s === slices - 1;

          b.addEllipticalRibbonSlice(
            curSx, sy, curSz,
            rx0, rz0,
            rx1, rz1,
            sliceH,
            32,
            curYaw,
            spandrelWhite,
            darkGlass,
            ribbonLitIce,
            0.65,
            seed + s,
            isTop
          );
        }

        // Broad rounded crystalline penthouse dome cap at each tower summit
        const [rTopX, rTopZ] = calcPebbleRadii(1.0, baseRx, baseRz);
        const peakShift = Math.sin(Math.PI * 0.85);
        const peakX = tx + leanX * peakShift;
        const peakZ = tz + leanZ * peakShift;
        const peakYaw = yawBase + 0.14;

        b.addEllipticalSlice(
          peakX, y0 + totalH, peakZ,
          rTopX, rTopZ,
          rTopX * 0.35, rTopZ * 0.35,
          3.4, 28,
          peakYaw,
          [220, 240, 255],
          true,
          true
        );

        // Summit beacon / pinnacle finial
        b.addCylinder(peakX, y0 + totalH + 3.4, peakZ, 0.8, 0.2, 1.4, 12, 0, [255, 60, 50], true);
      }
    },
  },
];
