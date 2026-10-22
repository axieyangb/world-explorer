/**
 * Beijing Explorer — Landmarks Batch 07 (BATCH_07)
 * 
 * 1. National Speed Skating Oval / Ice Ribbon (国家速滑馆 "冰丝带")
 *    - 210m x 150m elliptical stadium, 33.8m peak height
 *    - Authentic saddle-shaped single-layer cable-net roof (双曲鞍形索网屋顶)
 *      with full translucent ice-tinted membrane covering, dipping to 20.8m at center
 *      and rising to 33.8m at X ends, supported by perimeter saddle compression ring
 *    - 22 luminous undulating 3D tubular glass ribbons (emissive ice-cyan [145, 228, 255] & ice-white)
 *    - 36 inclined steel V-truss columns around base
 * 
 * 2. CITIC Tower / China Zun (中国尊 / 中信大厦)
 *    - 528m tall supertall skyscraper, Beijing's tallest
 *    - Authentic ancient bronze "Zun" vessel geometry: 78x78m base -> 48x48m slender waist (330m..368m) -> 70x70m flared crown
 *    - 10-tier curtain wall frustums with mechanical refuge floor bands & luminous accent lighting
 *    - 4 curving composite mega-columns & giant diamond diagrid exoskeleton belt bracing
 *    - 60m tall glowing golden-white lattice lantern crown (468m..528m, emissive = true)
 * 
 * 3. CCTV Headquarters (中央广播电视总台总部大楼 "大裤衩")
 *    - 234m tall three-dimensional continuous folded loop by Rem Koolhaas / OMA
 *    - L-shaped horizontal media production podium plinth (0m..40m) connecting North and East wings
 *    - Two continuous 6-degree leaning towers rising directly from base:
 *      * Tower 1 (North-West, 234m): rises from (cx - 52, cz - 42) leaning inward dx=+22m, dz=+22m to (cx - 30, cz - 20)
 *      * Tower 2 (South-East, 210m): rises from (cx + 52, cz + 48) leaning inward dx=-22m, dz=-22m to (cx + 30, cz + 26)
 *    - Dramatic L-shaped Cantilever Skybridge Overhang (162m..198m, 36m tall):
 *      * Arm A extends from Tower 1 Southward to overhanging corner apex (cx - 33, cz + 28)
 *      * Arm B extends from Tower 2 Westward to meet Arm A at (cx - 33, cz + 28) (75m cantilever over empty air!)
 *    - Underbelly mega-trusses and external Rem Koolhaas diamond diagrid bracing
 *    - True continuous folded 3D loop with a huge open central window (~65m wide x 122m tall)
 * 
 * 4. China World Trade Center Tower A (国贸三期A座)
 *    - 330m tall crystalline supertall obelisk by SOM
 *    - 92x78m China World Mall retail podium (24m tall) with entrance glass canopy
 *    - 4-tier tapered shaft with 3 distinct stepped mechanical setback reveals (3.0m~3.5m step notches)
 *    - SOM fritted vertical metal fins ("waterfall of light") along 4 corners
 *    - 28m illuminated diagonal diamond lattice glass lantern crown (302m..330m, emissive = true)
 */

export const BATCH_07 = [
  // 1. National Speed Skating Oval / Ice Ribbon (国家速滑馆 "冰丝带")
  {
    id: 'national_speed_skating_oval',
    nameZh: '国家速滑馆 (冰丝带)',
    nameEn: 'National Speed Skating Oval (Ice Ribbon)',
    category: 'olympic',
    cx: -2228,
    cz: -11914,
    exclR: 160,
    height: 34,
    osmIds: [899874039],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Tiered elliptical granite plaza & landscape podium
      b.addEllipticalSlice(cx, y0, cz, 118, 88, 116, 86, 1.2, 36, 0, [218, 222, 228], false, true);
      b.addEllipticalSlice(cx, y0 + 1.2, cz, 112, 82, 110, 80, 1.2, 36, 0, [230, 234, 240], false, true);
      b.addEllipticalSlice(cx, y0 + 2.4, cz, 106, 76, 104, 74, 1.2, 36, 0, [240, 244, 250], false, true);

      // Entrance plaza ceremonial steps on 4 cardinal sides
      for (const [dx, dz, sx, sz] of [
        [0, 84, 38, 12],
        [0, -84, 38, 12],
        [112, 0, 12, 32],
        [-112, 0, 12, 32],
      ]) {
        b.addBox(cx + dx, y0, cz + dz, sx, 3.6, sz, 0, [212, 218, 225], false);
      }

      // 2. Inclined steel V-truss columns (36 pairs) supporting the flared shell
      const nTrusses = 36;
      const steelCol = [195, 205, 218];
      for (let i = 0; i < nTrusses; i++) {
        const a0 = (i / nTrusses) * Math.PI * 2;
        const a1 = ((i + 0.5) / nTrusses) * Math.PI * 2;
        const a2 = ((i + 1.0) / nTrusses) * Math.PI * 2;
        const bx = cx + Math.cos(a1) * 103.5;
        const bz = cz + Math.sin(a1) * 73.5;
        const by = y0 + 3.6;
        const tx0 = cx + Math.cos(a0) * 105.5;
        const tz0 = cz + Math.sin(a0) * 75.5;
        const tx2 = cx + Math.cos(a2) * 105.5;
        const tz2 = cz + Math.sin(a2) * 75.5;
        const ty = y0 + 7.2;
        b.addStrut(bx, by, bz, tx0, ty, tz0, 0.55, steelCol, false);
        b.addStrut(bx, by, bz, tx2, ty, tz2, 0.55, steelCol, false);
      }

      // 3. Inner stadium core & dark ice-arena envelope
      b.addEllipticalSlice(cx, y0 + 4.0, cz, 96, 66, 94, 64, 25.0, 36, 0, [26, 42, 64], false, false);

      // 4. 8-Tier Curvilinear Facade using addEllipticalRibbonSlice
      const nTiers = 8;
      const tierH = 24.0 / nTiers; // 3.0m per tier
      for (let t = 0; t < nTiers; t++) {
        const t0 = t / nTiers;
        const t1 = (t + 1) / nTiers;
        const fy = y0 + 4.0 + t * tierH;
        const rx0 = 100.0 + t0 * 6.0;
        const rz0 = 70.0 + t0 * 6.0;
        const rx1 = 100.0 + t1 * 6.0;
        const rz1 = 70.0 + t1 * 6.0;
        b.addEllipticalRibbonSlice(
          cx, fy, cz,
          rx0, rz0, rx1, rz1,
          tierH, 36, 0,
          [236, 242, 250],
          [44, 70, 102],
          [160, 232, 255],
          0.65,
          100 + t,
          false
        );
      }

      // 5. The 22 Iconic 3D Glowing "Ice Ribbon" Tubular Strands (Undulating Speed Skating Tracks)
      const nRibbons = 22;
      const segs = 36;
      for (let k = 0; k < nRibbons; k++) {
        const yBase = y0 + 4.8 + k * (23.2 / (nRibbons - 1));
        const isBlue = k % 2 === 0;
        const ribbonCol = isBlue ? [140, 226, 255] : [240, 252, 255];
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          // Undulation wave along perimeter + subtle saddle tilt matching roof line
          const dh0 = 1.30 * Math.sin(a0 * 2.0 + k * 0.42) + (k / (nRibbons - 1)) * 1.5 * Math.cos(2 * a0);
          const dh1 = 1.30 * Math.sin(a1 * 2.0 + k * 0.42) + (k / (nRibbons - 1)) * 1.5 * Math.cos(2 * a1);
          const dr0 = 0.75 * Math.cos(a0 * 3.0 + k * 0.35);
          const dr1 = 0.75 * Math.cos(a1 * 3.0 + k * 0.35);
          const py0 = yBase + dh0;
          const py1 = yBase + dh1;
          const prx0 = 101.4 + (py0 - (y0 + 4.0)) * 0.22 + dr0;
          const prz0 = 71.4 + (py0 - (y0 + 4.0)) * 0.22 + dr0;
          const prx1 = 101.4 + (py1 - (y0 + 4.0)) * 0.22 + dr1;
          const prz1 = 71.4 + (py1 - (y0 + 4.0)) * 0.22 + dr1;
          const x0 = cx + Math.cos(a0) * prx0;
          const z0 = cz + Math.sin(a0) * prz0;
          const x1 = cx + Math.cos(a1) * prx1;
          const z1 = cz + Math.sin(a1) * prz1;
          b.addStrut(x0, py0, z0, x1, py1, z1, 0.46, ribbonCol, true);
        }
      }

      // 6. Authentic Saddle-Curved Cable-Net Roof Structure (双曲鞍形索网屋盖)
      // The perimeter compression rim rises at X ends (East/West, 33.8m) and dips along Z sides (North/South, 26.5m)
      const rimSegs = 36;
      const rimPts = [];
      for (let i = 0; i <= rimSegs; i++) {
        const ang = (i / rimSegs) * Math.PI * 2;
        const rx = 106.5;
        const rz = 76.5;
        const x = cx + Math.cos(ang) * rx;
        const z = cz + Math.sin(ang) * rz;
        // Saddle height along perimeter: rises to 33.8m at X ends (cos(2*ang) = 1) and dips to 26.5m at Z sides (cos(2*ang) = -1)
        const y = y0 + 30.15 + 3.65 * Math.cos(2 * ang);
        rimPts.push([x, y, z, ang]);
      }

      // Perimeter Compression Ring Steel Tube
      for (let i = 0; i < rimSegs; i++) {
        const pA = rimPts[i];
        const pB = rimPts[i + 1];
        b.addStrut(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], 1.6, [192, 204, 218], false);
        b.addStrut(pA[0], pA[1] - 1.2, pA[2], pB[0], pB[1] - 1.2, pB[2], 1.2, [170, 184, 200], false);
      }

      // Concentric Saddle Cable Rings & Complete Translucent Roof Membrane Covering
      const ringFactors = [1.0, 0.82, 0.64, 0.46, 0.28, 0.15];
      const memCol = [206, 222, 238];
      for (let r = 0; r < ringFactors.length - 1; r++) {
        const radF0 = ringFactors[r];
        const radF1 = ringFactors[r + 1];
        for (let s = 0; s < rimSegs; s++) {
          const a0 = (s / rimSegs) * Math.PI * 2;
          const a1 = ((s + 1) / rimSegs) * Math.PI * 2;

          const p00x = cx + Math.cos(a0) * 105.0 * radF0;
          const p00z = cz + Math.sin(a0) * 75.0 * radF0;
          const p00y = y0 + 20.8 + (radF0 * radF0) * (9.35 + 3.65 * Math.cos(2 * a0));

          const p10x = cx + Math.cos(a1) * 105.0 * radF0;
          const p10z = cz + Math.sin(a1) * 75.0 * radF0;
          const p10y = y0 + 20.8 + (radF0 * radF0) * (9.35 + 3.65 * Math.cos(2 * a1));

          const p11x = cx + Math.cos(a1) * 105.0 * radF1;
          const p11z = cz + Math.sin(a1) * 75.0 * radF1;
          const p11y = y0 + 20.8 + (radF1 * radF1) * (9.35 + 3.65 * Math.cos(2 * a1));

          const p01x = cx + Math.cos(a0) * 105.0 * radF1;
          const p01z = cz + Math.sin(a0) * 75.0 * radF1;
          const p01y = y0 + 20.8 + (radF1 * radF1) * (9.35 + 3.65 * Math.cos(2 * a0));

          // Translucent saddle roof membrane covering the entire bowl
          b.addQuad(p00x, p00y, p00z, p10x, p10y, p10z, p11x, p11y, p11z, p01x, p01y, p01z, memCol, false);

          // Concentric structural cable rib
          b.addStrut(p01x, p01y + 0.1, p01z, p11x, p11y + 0.1, p11z, 0.38, [172, 186, 204], false);
        }
      }

      // Radial Structural Tension Cables connecting compression rim to central arena hub
      const nCables = 24;
      for (let cIdx = 0; cIdx < nCables; cIdx++) {
        const ang = (cIdx / nCables) * Math.PI * 2;
        const cX = Math.cos(ang);
        const sZ = Math.sin(ang);
        const rimX = cx + cX * 105.5;
        const rimZ = cz + sZ * 75.5;
        const rimY = y0 + 30.15 + 3.65 * Math.cos(2 * ang);
        const cenX = cx + cX * 16.0;
        const cenZ = cz + sZ * 10.0;
        const cenY = y0 + 20.8;
        b.addStrut(rimX, rimY + 0.15, rimZ, cenX, cenY + 0.15, cenZ, 0.42, [160, 176, 195], false);
      }

      // Central Glowing Oval Skylight (y0 + 20.8m)
      b.addEllipticalSlice(cx, y0 + 20.8, cz, 16.5, 10.5, 15.0, 9.0, 0.6, 24, 0, [195, 242, 255], true, true);
    },
  },

  // 2. CITIC Tower / China Zun (中国尊 / 中信大厦)
  {
    id: 'china_zun',
    nameZh: '中国尊 (中信大厦)',
    nameEn: 'CITIC Tower (China Zun)',
    category: 'supertall',
    cx: 5357,
    cz: -311,
    exclR: 95,
    height: 528,
    osmIds: [599547918, 591345724],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const frameCol = [190, 205, 222]; // Silver-grey aluminum mullions
      const glassCol = [50, 78, 112];   // Deep reflective blue-grey curtain glass
      const litWarm = [255, 228, 155];
      const litCool = [175, 230, 255];

      // 1. Granite Ground Plaza & Podium Plinth (avoids negative minY from struts)
      b.addBox(cx, y0, cz, 92, 1.2, 92, 0, [212, 220, 230], false);
      b.addBox(cx, y0 + 1.2, cz, 86, 1.2, 86, 0, [226, 234, 242], false);

      // 2. Multi-tier Curtain Wall Frustums following authentic Bronze Zun Vessel Geometry
      // 10 Tiers defining smooth taper from 78m base -> 48m slender waist -> 70m flared crown
      // [yRel0, yRel1, w0, w1, floors, bays, seed]
      const tiers = [
        [2.4, 56.0, 78.0, 72.0, 12, 10, 201],   // Tier 1: Base to lower lobby
        [56.0, 120.0, 72.0, 66.0, 14, 10, 202], // Tier 2: Lower shaft
        [120.0, 188.0, 66.0, 60.5, 15, 9, 203], // Tier 3: Mid-lower shaft
        [188.0, 258.0, 60.5, 55.5, 15, 9, 204], // Tier 4: Mid shaft
        [258.0, 328.0, 55.5, 51.0, 15, 8, 205], // Tier 5: Upper mid shaft approaching waist
        [328.0, 368.0, 51.0, 48.0, 9, 8, 206],  // Tier 6: Slender waist zone (48m waist!)
        [368.0, 418.0, 48.0, 54.5, 11, 8, 207], // Tier 7: Waist flaring outward
        [418.0, 468.0, 54.5, 62.0, 11, 9, 208], // Tier 8: Upper flare
        [468.0, 504.0, 62.0, 66.5, 8, 9, 209],  // Tier 9: Flared crown approach
        [504.0, 526.0, 66.5, 70.0, 5, 10, 210], // Tier 10: Flared crown rim (70m)
      ];

      for (const [yRel0, yRel1, w0, w1, flrs, bys, seed] of tiers) {
        const sy = yRel1 - yRel0;
        b.addCurtainWallFrustum(
          cx, y0 + yRel0, cz,
          w0, w0, w1, w1, sy, 0,
          frameCol, glassCol,
          litWarm, litCool,
          flrs, bys, 0.44, seed, false
        );
      }

      // 3. Mechanical Refuge Floor Belt Bands with Night Accent Lighting
      const refugeHeights = [56.0, 120.0, 188.0, 258.0, 328.0, 368.0, 418.0, 468.0];
      for (let i = 0; i < refugeHeights.length; i++) {
        const rH = refugeHeights[i];
        const rY = y0 + rH;
        const wAtR = tiers[i][3];
        b.addBox(cx, rY - 2.0, cz, wAtR + 1.2, 4.0, wAtR + 1.2, 0, [155, 170, 188], false);
        b.addBox(cx, rY - 0.4, cz, wAtR + 1.6, 0.8, wAtR + 1.6, 0, [255, 218, 125], true);
      }

      // 4. Four Massive Curving Composite Mega-Columns at the Corners
      const cornerSign = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      for (const [sgX, sgZ] of cornerSign) {
        for (const [yRel0, yRel1, w0, w1] of tiers) {
          const xA = cx + sgX * w0;
          const zA = cz + sgZ * w0;
          const yA = y0 + yRel0;
          const xB = cx + sgX * w1;
          const zB = cz + sgZ * w1;
          const yB = y0 + yRel1;
          b.addStrut(xA, yA, zA, xB, yB, zB, 1.4, [232, 242, 252], false);
        }
      }

      // 5. Giant Diamond Diagrid Exoskeleton Belt Braces across the 4 Facades (Tiers 1..8)
      for (let t = 0; t < 8; t++) {
        const [yRel0, yRel1, w0, w1] = tiers[t];
        const yA = y0 + yRel0;
        const yB = y0 + yRel1;
        const hwA = w0 * 0.5;
        const hwB = w1 * 0.5;
        // North & South faces
        for (const zSign of [-1, 1]) {
          const zA = cz + zSign * hwA;
          const zB = cz + zSign * hwB;
          b.addStrut(cx - hwA, yA, zA, cx + hwB, yB, zB, 0.75, [218, 230, 245], false);
          b.addStrut(cx + hwA, yA, zA, cx - hwB, yB, zB, 0.75, [218, 230, 245], false);
        }
        // East & West faces
        for (const xSign of [-1, 1]) {
          const xA = cx + xSign * hwA;
          const xB = cx + xSign * hwB;
          b.addStrut(xA, yA, cz - hwA, xB, yB, cz + hwB, 0.75, [218, 230, 245], false);
          b.addStrut(xA, yA, cz + hwA, xB, yB, cz - hwB, 0.75, [218, 230, 245], false);
        }
      }

      // 6. Grand Sweeping Entrance Lobby Canopies (North & South)
      for (const zSign of [-1, 1]) {
        const cZOff = cz + zSign * 39.5;
        b.addFrustumBox(cx, y0 + 2.4, cZOff, 46, 12, 40, 4, 18.0, 0, [192, 208, 224], false, true);
        b.addBox(cx, y0 + 2.4, cZOff - zSign * 2.0, 42, 16.0, 6, 0, [255, 226, 145], true);
      }

      // 7. The Towering Glowing Golden-White Lantern Crown (468m..528m, 60m tall)
      // Inner glowing crystal core
      b.addFrustumBox(cx, y0 + 468, cz, 56, 56, 63, 63, 56.0, 0, [255, 238, 175], true, true);

      // Flared rim parapet at 526m..528m
      b.addBox(cx, y0 + 526, cz, 70.8, 2.0, 70.8, 0, [236, 242, 250], false);

      // 32 Diagonal Diamond Lattice Struts forming the Crown Exoskeleton
      const crownStruts = 8;
      for (let s = 0; s < crownStruts; s++) {
        const u0 = -0.5 + s / crownStruts;
        const u1 = -0.5 + (s + 1) / crownStruts;
        for (const [faceX, faceZ, sideX, sideZ] of [
          [0, 1, 1, 0],
          [0, -1, -1, 0],
          [1, 0, 0, -1],
          [-1, 0, 0, 1],
        ]) {
          const pA0 = [
            cx + faceX * (62.0 * 0.5) + sideX * u0 * 62.0,
            y0 + 468,
            cz + faceZ * (62.0 * 0.5) + sideZ * u0 * 62.0,
          ];
          const pA1 = [
            cx + faceX * (70.0 * 0.5) + sideX * u1 * 70.0,
            y0 + 526,
            cz + faceZ * (70.0 * 0.5) + sideZ * u1 * 70.0,
          ];
          const pB0 = [
            cx + faceX * (62.0 * 0.5) + sideX * u1 * 62.0,
            y0 + 468,
            cz + faceZ * (62.0 * 0.5) + sideZ * u1 * 62.0,
          ];
          const pB1 = [
            cx + faceX * (70.0 * 0.5) + sideX * u0 * 70.0,
            y0 + 526,
            cz + faceZ * (70.0 * 0.5) + sideZ * u0 * 70.0,
          ];
          b.addStrut(...pA0, ...pA1, 0.88, [245, 250, 255], false);
          b.addStrut(...pB0, ...pB1, 0.88, [245, 250, 255], false);
        }
      }

      // Crown central observation skylight & beacon spire reaching 528m
      b.addCylinder(cx, y0 + 524, cz, 6.0, 1.2, 12.0, 8, 0, [255, 246, 215], true, true);
    },
  },

  // 3. CCTV Headquarters (中央广播电视总台总部大楼)
  {
    id: 'cctv_headquarters',
    nameZh: '中央广播电视总台总部大楼',
    nameEn: 'CCTV Headquarters',
    category: 'modern',
    cx: 5163,
    cz: -568,
    exclR: 145,
    height: 234,
    osmIds: [7820447, 547523487, 548126516, 548126517, 44306071],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const darkGlass = [40, 56, 74];
      const steelCol = [140, 152, 166];
      const litWarm = [255, 222, 148];
      const litCool = [172, 226, 255];

      // 1. Broad Landscaped Plaza Plinth at Ground Level
      b.addBox(cx, y0, cz, 188, 1.2, 178, 0, [68, 76, 86], false);
      b.addBox(cx, y0 + 1.2, cz, 178, 1.2, 168, 0, [82, 92, 104], false);

      // 2. Base L-Shaped Horizontal Media Production Podium Plinth (y0 + 2.4 to y0 + 40m)
      // North Wing: connecting Tower 1 base (cx - 52, cz - 42) to Corner (cx + 52, cz - 42)
      // Spans from cx - 78 to cx + 78 (width 156m) along cz = -42
      b.addCurtainWallBox(
        cx, y0 + 2.4, cz - 42,
        156, 37.6, 46, 0,
        [135, 146, 160], [38, 54, 72],
        litWarm, litCool,
        4.4, 5.2, 0.44, 701
      );
      // North wing roof garden parapet
      b.addBox(cx, y0 + 40.0, cz - 42, 157, 1.2, 47, 0, [118, 128, 140], false);

      // East Wing: connecting Corner (cx + 52, cz - 42) to Tower 2 base (cx + 52, cz + 48)
      // Spans from cz - 42 to cz + 73 (length 115m) along cx = +52
      b.addCurtainWallBox(
        cx + 52, y0 + 2.4, cz + 15.5,
        46, 31.6, 115, 0,
        [135, 146, 160], [38, 54, 72],
        litWarm, litCool,
        4.4, 5.2, 0.44, 702
      );
      // East wing roof garden parapet
      b.addBox(cx + 52, y0 + 34.0, cz + 15.5, 47, 1.2, 116, 0, [118, 128, 140], false);

      // Southwest Courtyard Public Plaza & Sunken Amphitheatre (broad empty opening under the cantilever)
      b.addBox(cx - 20, y0 + 2.4, cz + 20, 68, 0.6, 68, 0, [72, 80, 92], false);
      b.addBox(cx - 20, y0 + 3.0, cz + 20, 36, 0.6, 36, 0, [50, 95, 140], true); // Reflecting pool

      // 3. Leaning Tower 1 (North-West Tower, 234m tall, continuous inward lean dx=+22m, dz=+22m)
      // Segment 1A (y0 + 2.4 to y0 + 64m): rises through base from (cx - 52, cz - 42) size 52x52 to (cx - 46.2, cz - 36.2) size 49x49
      b.addSkewedDiagridTower(
        cx - 52, cz - 42, 52, 52, y0 + 2.4,
        cx - 46.2, cz - 36.2, 49, 49, y0 + 64,
        0, darkGlass, steelCol, litWarm, litCool, 14, 6, 0.48, 703
      );
      // Segment 1B (y0 + 64 to y0 + 128m): rises from (cx - 46.2, cz - 36.2) size 49x49 to (cx - 40.2, cz - 30.2) size 46x46
      b.addSkewedDiagridTower(
        cx - 46.2, cz - 36.2, 49, 49, y0 + 64,
        cx - 40.2, cz - 30.2, 46, 46, y0 + 128,
        0, darkGlass, steelCol, litWarm, litCool, 14, 6, 0.48, 704
      );
      // Segment 1C (y0 + 128 to y0 + 185m): rises from (cx - 40.2, cz - 30.2) size 46x46 to (cx - 34.6, cz - 24.6) size 43.5x43.5
      b.addSkewedDiagridTower(
        cx - 40.2, cz - 30.2, 46, 46, y0 + 128,
        cx - 34.6, cz - 24.6, 43.5, 43.5, y0 + 185,
        0, darkGlass, steelCol, litWarm, litCool, 13, 6, 0.48, 705
      );
      // Segment 1D (y0 + 185 to y0 + 234m): rises from (cx - 34.6, cz - 24.6) size 43.5x43.5 to (cx - 30, cz - 20) size 42x42
      b.addSkewedDiagridTower(
        cx - 34.6, cz - 24.6, 43.5, 43.5, y0 + 185,
        cx - 30, cz - 20, 42, 42, y0 + 234,
        0, darkGlass, steelCol, litWarm, litCool, 11, 6, 0.48, 706
      );

      // Tower 1 Roof Penthouse & Broadcast Antenna Mast
      b.addBox(cx - 30, y0 + 234, cz - 20, 34, 4.5, 34, 0, [92, 102, 115], false);
      b.addBox(cx - 30, y0 + 238.5, cz - 20, 26, 2.0, 26, 0, [115, 126, 140], false);
      b.addCylinder(cx - 30, y0 + 240.5, cz - 20, 1.4, 0.35, 17.5, 8, 0, [225, 234, 245], true, true);

      // 4. Leaning Tower 2 (South-East Tower, 210m tall, continuous inward lean dx=-22m, dz=-22m)
      // Segment 2A (y0 + 2.4 to y0 + 60m): rises through base from (cx + 52, cz + 48) size 50x50 to (cx + 45.9, cz + 41.9) size 47x47
      b.addSkewedDiagridTower(
        cx + 52, cz + 48, 50, 50, y0 + 2.4,
        cx + 45.9, cz + 41.9, 47, 47, y0 + 60,
        0, darkGlass, steelCol, litWarm, litCool, 13, 6, 0.48, 707
      );
      // Segment 2B (y0 + 60 to y0 + 120m): rises from (cx + 45.9, cz + 41.9) size 47x47 to (cx + 39.5, cz + 35.5) size 44.5x44.5
      b.addSkewedDiagridTower(
        cx + 45.9, cz + 41.9, 47, 47, y0 + 60,
        cx + 39.5, cz + 35.5, 44.5, 44.5, y0 + 120,
        0, darkGlass, steelCol, litWarm, litCool, 13, 6, 0.48, 708
      );
      // Segment 2C (y0 + 120 to y0 + 175m): rises from (cx + 39.5, cz + 35.5) size 44.5x44.5 to (cx + 33.7, cz + 29.7) size 42x42
      b.addSkewedDiagridTower(
        cx + 39.5, cz + 35.5, 44.5, 44.5, y0 + 120,
        cx + 33.7, cz + 29.7, 42, 42, y0 + 175,
        0, darkGlass, steelCol, litWarm, litCool, 12, 6, 0.48, 709
      );
      // Segment 2D (y0 + 175 to y0 + 210m): rises from (cx + 33.7, cz + 29.7) size 42x42 to (cx + 30, cz + 26) size 40x40
      b.addSkewedDiagridTower(
        cx + 33.7, cz + 29.7, 42, 42, y0 + 175,
        cx + 30, cz + 26, 40, 40, y0 + 210,
        0, darkGlass, steelCol, litWarm, litCool, 8, 6, 0.48, 710
      );

      // Tower 2 Roof Penthouse & Observation Deck
      b.addBox(cx + 30, y0 + 210, cz + 26, 32, 4.0, 32, 0, [92, 102, 115], false);
      b.addBox(cx + 30, y0 + 214, cz + 26, 24, 2.0, 24, 0, [115, 126, 140], false);

      // 5. The Dramatic 75m Cantilever Skybridge Overhang (162m..198m, 36m tall)
      // Forms the continuous folded 3D loop hanging over empty space!
      // Arm A: North-South wing extending from Tower 1 (cx - 33.0, cz - 22) Southward to outer corner (cx - 33.0, cz + 47)
      b.addCurtainWallBox(
        cx - 33.0, y0 + 162, cz + 12.5,
        38, 36, 69, 0,
        steelCol, darkGlass,
        litWarm, litCool,
        4.0, 5.2, 0.48, 711
      );
      // Arm B: East-West wing extending from Tower 2 (cx + 31, cz + 28) Westward to meet Arm A at (cx - 52, cz + 28)
      b.addCurtainWallBox(
        cx - 10.5, y0 + 162, cz + 28,
        83, 36, 38, 0,
        steelCol, darkGlass,
        litWarm, litCool,
        4.0, 5.2, 0.48, 712
      );

      // Cantilever Roof Parapet at y0 + 198m
      b.addBox(cx - 33.0, y0 + 198, cz + 12.5, 39, 1.5, 70, 0, [110, 122, 136], false);
      b.addBox(cx - 10.5, y0 + 198, cz + 28, 84, 1.5, 39, 0, [110, 122, 136], false);

      // 6. External Rem Koolhaas Diamond Diagrid Bracing on the Cantilever Facades
      const diagCols = [158, 170, 185];
      // Arm A West outer facade (x = cx - 52.0, z from cz - 22 to cz + 47)
      const xAw = cx - 52.0;
      const xAe = cx - 14.0;
      for (let t = 0; t < 3; t++) {
        const yBot = y0 + 162 + t * 12.0;
        const yTop = yBot + 12.0;
        for (let s = 0; s < 3; s++) {
          const z0 = cz - 22 + s * 23.0;
          const z1 = z0 + 23.0;
          b.addStrut(xAw, yBot, z0, xAw, yTop, z1, 0.78, diagCols, false);
          b.addStrut(xAw, yBot, z1, xAw, yTop, z0, 0.78, diagCols, false);
          if (s < 1) {
            b.addStrut(xAe, yBot, z0, xAe, yTop, z1, 0.78, diagCols, false);
            b.addStrut(xAe, yBot, z1, xAe, yTop, z0, 0.78, diagCols, false);
          }
        }
      }
      // Arm B South outer facade (z = cz + 47.0, x from cx - 52 to cx + 31)
      const zBs = cz + 47.0;
      const zBn = cz + 9.0;
      for (let t = 0; t < 3; t++) {
        const yBot = y0 + 162 + t * 12.0;
        const yTop = yBot + 12.0;
        for (let s = 0; s < 3; s++) {
          const x0 = cx - 52 + s * 27.6;
          const x1 = x0 + 27.6;
          b.addStrut(x0, yBot, zBs, x1, yTop, zBs, 0.78, diagCols, false);
          b.addStrut(x1, yBot, zBs, x0, yTop, zBs, 0.78, diagCols, false);
          if (s > 0) {
            b.addStrut(x0, yBot, zBn, x1, yTop, zBn, 0.78, diagCols, false);
            b.addStrut(x1, yBot, zBn, x0, yTop, zBn, 0.78, diagCols, false);
          }
        }
      }

      // 7. Underbelly High-Stress Mega-Strut Trusses Suspended at y0 + 162m
      const trussCol = [120, 134, 150];
      // Under Arm A soffit
      b.addStrut(cx - 52.0, y0 + 162, cz - 22, cx - 14.0, y0 + 162, cz + 9, 1.25, trussCol, false);
      b.addStrut(cx - 14.0, y0 + 162, cz - 22, cx - 52.0, y0 + 162, cz + 9, 1.25, trussCol, false);
      b.addStrut(cx - 52.0, y0 + 162, cz + 9, cx - 14.0, y0 + 162, cz + 47, 1.25, trussCol, false);
      b.addStrut(cx - 14.0, y0 + 162, cz + 9, cx - 52.0, y0 + 162, cz + 47, 1.25, trussCol, false);
      // Under Arm B soffit
      b.addStrut(cx - 14.0, y0 + 162, cz + 9, cx + 31, y0 + 162, cz + 47, 1.25, trussCol, false);
      b.addStrut(cx - 14.0, y0 + 162, cz + 47, cx + 31, y0 + 162, cz + 9, 1.25, trussCol, false);
    },
  },

  // 4. China World Trade Center Tower A (国贸三期A座)
  {
    id: 'china_world_tower_a',
    nameZh: '国贸三期A座',
    nameEn: 'China World Trade Center Tower A',
    category: 'supertall',
    cx: 4685,
    cz: -253,
    exclR: 75,
    height: 330,
    osmIds: [116944490, 204714189],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx; const y0 = p3 !== undefined ? p2 : p1; const cz = p3 !== undefined ? p3 : this.cz;

      const frameCol = [182, 196, 212]; // Crystalline silver-aluminum mullions
      const glassCol = [50, 78, 114];   // SOM blue solar curtain glass
      const litWarm = [255, 225, 152];
      const litCool = [176, 232, 255];

      // 1. Retail Podium (China World Mall expansion: 92x78m, 24m tall)
      b.addCurtainWallBox(
        cx + 4, y0, cz + 6,
        92, 24, 78, 0,
        [160, 174, 190], [48, 72, 98],
        litWarm, litCool,
        4.2, 5.2, 0.52, 801
      );
      // Entrance glass canopy & skylight
      b.addBox(cx - 32, y0, cz + 6, 8, 8, 28, 0, [255, 228, 160], true);

      // 2. 4 Stepped Tapered Obelisk Tiers with Distinct Notched Mechanical Setback Reveals (3.0m~3.5m Steps)
      // Tier 1 (Low-Rise Office: y0 + 24 to y0 + 112m, 88m tall, 58x58m -> 52x52m)
      b.addCurtainWallFrustum(
        cx, y0 + 24, cz,
        58, 58, 52, 52, 88, 0,
        frameCol, glassCol,
        litWarm, litCool,
        20, 10, 0.44, 802
      );

      // Mechanical Refuge Floor 1 Setback Reveal (y0 + 112 to y0 + 116.5m, notched inward to 48.5m)
      b.addBox(cx, y0 + 112, cz, 49.0, 4.5, 49.0, 0, [115, 128, 144], false);
      b.addBox(cx, y0 + 113.8, cz, 49.4, 1.0, 49.4, 0, [255, 220, 130], true);

      // Tier 2 (Mid-Rise Office: y0 + 116.5 to y0 + 198m, 81.5m tall, 48.5x48.5m -> 43.5x43.5m)
      b.addCurtainWallFrustum(
        cx, y0 + 116.5, cz,
        48.5, 48.5, 43.5, 43.5, 81.5, 0,
        frameCol, glassCol,
        litWarm, litCool,
        18, 9, 0.44, 803
      );

      // Mechanical Refuge Floor 2 Setback Reveal (y0 + 198 to y0 + 202.5m, notched inward to 40.5m)
      b.addBox(cx, y0 + 198, cz, 41.0, 4.5, 41.0, 0, [115, 128, 144], false);
      b.addBox(cx, y0 + 199.8, cz, 41.4, 1.0, 41.4, 0, [255, 220, 130], true);

      // Tier 3 (High-Rise Office: y0 + 202.5 to y0 + 272m, 69.5m tall, 40.5x40.5m -> 36.5x36.5m)
      b.addCurtainWallFrustum(
        cx, y0 + 202.5, cz,
        40.5, 40.5, 36.5, 36.5, 69.5, 0,
        frameCol, glassCol,
        litWarm, litCool,
        16, 8, 0.44, 804
      );

      // Mechanical Refuge Floor 3 Setback Reveal (y0 + 272 to y0 + 276m, notched inward to 34.0m)
      b.addBox(cx, y0 + 272, cz, 34.5, 4.0, 34.5, 0, [115, 128, 144], false);
      b.addBox(cx, y0 + 273.8, cz, 34.9, 0.9, 34.9, 0, [255, 220, 130], true);

      // Tier 4 (Shangri-La Hotel Atrium: y0 + 276 to y0 + 302m, 26m tall, 34.0x34.0m -> 31.0x31.0m)
      b.addCurtainWallFrustum(
        cx, y0 + 276, cz,
        34.0, 34.0, 31.0, 31.0, 26, 0,
        frameCol, glassCol,
        litWarm, litCool,
        7, 8, 0.46, 805
      );

      // 3. SOM Fritted Vertical Metal Fins ("Waterfall of Light") along 4 Corners
      const cornerSign = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      const finStages = [
        [24, 112, 58.0, 52.0],
        [116.5, 198, 48.5, 43.5],
        [202.5, 272, 40.5, 36.5],
        [276, 302, 34.0, 31.0],
      ];
      for (const [sgX, sgZ] of cornerSign) {
        for (const [yStart, yEnd, wA, wB] of finStages) {
          const xA = cx + sgX * wA;
          const zA = cz + sgZ * wA;
          const xB = cx + sgX * wB;
          const zB = cz + sgZ * wB;
          b.addStrut(xA, y0 + yStart, zA, xB, y0 + yEnd, zB, 0.85, [225, 238, 252], false);
        }
      }

      // 4. Iconic Illuminated Diagonal Lattice Lantern Crown (302m..330m, 28m tall)
      // Glowing inner crystal core (302m..326m)
      b.addFrustumBox(cx, y0 + 302, cz, 26, 26, 20, 20, 24, 0, [255, 238, 185], true, true);

      // Outer diagonal lattice crown frame (31x31m -> 24x24m)
      const crownLatticeCols = 6;
      for (let s = 0; s < crownLatticeCols; s++) {
        const u0 = -0.5 + s / crownLatticeCols;
        const u1 = -0.5 + (s + 1) / crownLatticeCols;
        for (const [faceX, faceZ, sideX, sideZ] of [
          [0, 1, 1, 0],
          [0, -1, -1, 0],
          [1, 0, 0, -1],
          [-1, 0, 0, 1],
        ]) {
          const l0x = faceX * 15.5 + sideX * u0 * 31.0;
          const l0z = faceZ * 15.5 + sideZ * u0 * 31.0;
          const l1x = faceX * 12.0 + sideX * u1 * 24.0;
          const l1z = faceZ * 12.0 + sideZ * u1 * 24.0;
          const pA0x = cx + l0x;
          const pA0z = cz + l0z;
          const pA1x = cx + l1x;
          const pA1z = cz + l1z;
          b.addStrut(pA0x, y0 + 302, pA0z, pA1x, y0 + 326, pA1z, 0.72, [228, 238, 250], false);

          const l1xB = faceX * 12.0 + sideX * u0 * 24.0;
          const l1zB = faceZ * 12.0 + sideZ * u0 * 24.0;
          const l0xB = faceX * 15.5 + sideX * u1 * 31.0;
          const l0zB = faceZ * 15.5 + sideZ * u1 * 31.0;
          b.addStrut(cx + l0xB, y0 + 302, cz + l0zB, cx + l1xB, y0 + 326, cz + l1zB, 0.72, [228, 238, 250], false);
        }
      }

      // Mechanical crown roof & communications spire reaching 330m
      b.addBox(cx, y0 + 326, cz, 24, 1.5, 24, 0, [180, 192, 206], false);
      b.addCylinder(cx, y0 + 326, cz, 1.8, 0.35, 14.0, 8, 0, [232, 240, 248], true, true);
    },
  },
];
