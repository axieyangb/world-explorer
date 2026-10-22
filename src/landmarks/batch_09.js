/**
 * Beijing Explorer — 3D Iconic Architectural Landmarks: Batch 09 (BATCH_09)
 *
 * Contains 4 Beijing Landmarks:
 * 1. galaxy_soho (银河SOHO - Zaha Hadid Architects: 4 flowing canyon domes, ribbon windows, sweeping multi-level curved skybridges)
 * 2. leeza_soho (丽泽SOHO - Zaha Hadid Architects: 207m elliptical barrel, 194m twisting atrium void splitting two half-shells, 4 skybridge rings)
 * 3. ncpa_egg (国家大剧院 "巨蛋" - Paul Andreu: 260x186m reflecting lake, 212x144x46.5m seamless titanium-and-glass ellipsoid dome, 3 glowing performance halls)
 * 4. great_hall_of_the_people (人民大会堂: 336x206m tripartite "山" plan, 25m fluted marble colonnade, National Emblem, green-and-gold glazed tile eaves)
 */

export const BATCH_09 = [
  // 1. Galaxy SOHO (银河SOHO)
  {
    id: 'galaxy_soho',
    nameZh: '银河SOHO',
    nameEn: 'Galaxy SOHO',
    cx: 2480,
    cz: -1225,
    exclR: 135,
    height: 67,
    osmIds: [6096147, 195182290],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // Color Palette
      const whiteAlum = [242, 246, 252];
      const ribbonGlass = [38, 62, 88];
      const litWarm = [255, 230, 168];
      const litCool = [185, 232, 255];
      const ledGlow = [255, 215, 120];
      const plazaStone = [218, 222, 228];
      const waterReflect = [65, 140, 210];
      const bridgeGlass = [170, 225, 250];

      // 1. Landscaped Canyon Plaza Base (y0 .. y0 + 1.2m, strictly minY >= 0)
      b.addEllipticalSlice(cx, y0, cz, 86, 76, 84, 74, 0.45, 40, 0, plazaStone, false, true);
      b.addEllipticalSlice(cx, y0 + 0.45, cz, 76, 66, 74, 64, 0.45, 36, 0, plazaStone, false, true);
      // Central canyon reflecting pool & glowing LED water edge
      b.addEllipticalSlice(cx, y0 + 0.9, cz, 44, 34, 42, 32, 0.25, 32, 0, waterReflect, true, true);
      b.addEllipticalSlice(cx, y0 + 1.15, cz, 22, 16, 22, 16, 0.08, 24, 0, ledGlow, true, true);

      // 2. Four Continuous Flowing Organic Canyon Domes (Towers A, B, C, D)
      const towers = [
        { dx: -42, dz: -38, rx: 34, rz: 28, yaw: -0.22, seed: 101 }, // NW: Tower A
        { dx: 42, dz: -40, rx: 31, rz: 33, yaw: 0.28, seed: 202 },  // NE: Tower B
        { dx: -46, dz: 38, rx: 33, rz: 29, yaw: 0.16, seed: 303 },  // SW: Tower C
        { dx: 44, dz: 42, rx: 36, rz: 31, yaw: -0.20, seed: 404 },  // SE: Tower D
      ];

      // Flared organic retail podium skirts connecting towers to plaza (y0 .. y0 + 13.2m)
      for (let tIdx = 0; tIdx < towers.length; tIdx++) {
        const tw = towers[tIdx];
        const tcx = cx + tw.dx;
        const tcz = cz + tw.dz;
        // Flared ground retail podium apron
        b.addEllipticalSlice(tcx, y0, tcz, tw.rx * 1.22, tw.rz * 1.22, tw.rx * 1.14, tw.rz * 1.14, 4.4, 32, tw.yaw, whiteAlum, false, false);
        b.addEllipticalSlice(tcx, y0 + 4.4, tcz, tw.rx * 1.14, tw.rz * 1.14, tw.rx * 1.08, tw.rz * 1.08, 4.4, 32, tw.yaw, ribbonGlass, false, false);
        b.addEllipticalSlice(tcx, y0 + 8.8, tcz, tw.rx * 1.08, tw.rz * 1.08, tw.rx * 1.02, tw.rz * 1.02, 4.4, 32, tw.yaw, whiteAlum, false, false);
      }

      // Curvilinear podium retail link blocks connecting adjacent towers at base (strictly minY >= 0)
      const connectPodium = (tA, tB) => {
        const ax = cx + tA.dx, az = cz + tA.dz;
        const bx = cx + tB.dx, bz = cz + tB.dz;
        const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
        const len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bz - az, bx - ax);
        b.addBox(mx, y0, mz, len * 0.68, 4.4, 16.0, yaw, whiteAlum, false);
        b.addBox(mx, y0 + 4.4, mz, len * 0.64, 4.4, 13.0, yaw, ribbonGlass, false);
        b.addBox(mx, y0 + 8.8, mz, len * 0.60, 4.4, 10.0, yaw, whiteAlum, false);
      };
      connectPodium(towers[0], towers[1]);
      connectPodium(towers[1], towers[3]);
      connectPodium(towers[3], towers[2]);
      connectPodium(towers[2], towers[0]);

      // Tower Bodies: Stacked Elliptical Ribbon Slices up to 54m, then smooth domed tops to 67m
      const nRibbons = 12;
      const ribbonH = 4.5; // 12 * 4.5 = 54.0m
      const domeH = 13.0;  // 54.0 + 13.0 = 67.0m target height

      for (let tIdx = 0; tIdx < towers.length; tIdx++) {
        const tw = towers[tIdx];
        const tcx = cx + tw.dx;
        const tcz = cz + tw.dz;

        // Ribbon tiers
        for (let s = 0; s < nRibbons; s++) {
          const sy0 = y0 + s * ribbonH;
          const u0 = s / nRibbons;
          const u1 = (s + 1) / nRibbons;
          // Organic curved belly
          const r0Mul = Math.sin(u0 * Math.PI * 0.75 + 0.35) * 0.32 + 0.78;
          const r1Mul = Math.sin(u1 * Math.PI * 0.75 + 0.35) * 0.32 + 0.78;

          b.addEllipticalRibbonSlice(
            tcx, sy0, tcz,
            tw.rx * r0Mul, tw.rz * r0Mul,
            tw.rx * r1Mul, tw.rz * r1Mul,
            ribbonH, 32, tw.yaw,
            whiteAlum, ribbonGlass,
            (s + tIdx) % 2 === 0 ? litWarm : litCool,
            0.65, tw.seed + s * 17,
            false
          );
        }

        // Smooth Cosine Domed Top (54.0m .. 67.0m)
        const domeBaseY = y0 + nRibbons * ribbonH;
        const domeTiers = 7;
        for (let d = 0; d < domeTiers; d++) {
          const th0 = (d / domeTiers) * (Math.PI * 0.5);
          const th1 = ((d + 1) / domeTiers) * (Math.PI * 0.5);
          const dy0 = domeBaseY + Math.sin(th0) * domeH;
          const dy1 = domeBaseY + Math.sin(th1) * domeH;
          const dSliceH = dy1 - dy0;

          const topMul = Math.sin(1.0 * Math.PI * 0.75 + 0.35) * 0.32 + 0.78; // radius at shoulder
          const drx0 = tw.rx * topMul * Math.cos(th0);
          const drz0 = tw.rz * topMul * Math.cos(th0);
          const drx1 = tw.rx * topMul * Math.cos(th1);
          const drz1 = tw.rz * topMul * Math.cos(th1);

          const isSkylight = d === domeTiers - 1;
          b.addEllipticalSlice(
            tcx, dy0, tcz,
            drx0, drz0, drx1, drz1,
            dSliceH, 24, tw.yaw,
            isSkylight ? litCool : (d % 2 === 0 ? whiteAlum : [230, 236, 244]),
            isSkylight,
            isSkylight
          );
        }
      }

      // 3. Sweeping Curvilinear Multi-Level Skybridges Across the Canyon Void
      const addCurvedSkybridge = (twA, twB, by0, bh, deckW, bowDist) => {
        const ax = cx + twA.dx, az = cz + twA.dz;
        const bx = cx + twB.dx, bz = cz + twB.dz;
        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1) return;
        const nx = -dz / len, nz = dx / len; // normal vector

        // Control point bowed towards or away from canyon center
        const cpx = mx + nx * bowDist;
        const cpz = mz + nz * bowDist;

        // Quadratic Bezier curve sampled at N steps
        const nSteps = 6;
        let prevX = ax + dx * (twA.rx * 0.65 / len);
        let prevZ = az + dz * (twA.rx * 0.65 / len);

        for (let step = 1; step <= nSteps; step++) {
          const t = 0.15 + (step / nSteps) * 0.70;
          const oneMinusT = 1.0 - t;
          const curX = oneMinusT * oneMinusT * ax + 2 * oneMinusT * t * cpx + t * t * bx;
          const curZ = oneMinusT * oneMinusT * az + 2 * oneMinusT * t * cpz + t * t * bz;

          // Aerodynamic white bridge hull
          b.addStrut(prevX, by0 + bh * 0.5, prevZ, curX, by0 + bh * 0.5, curZ, deckW, whiteAlum, false);
          // Continuous glowing LED underbelly ribbon
          b.addStrut(prevX, by0 + 0.35, prevZ, curX, by0 + 0.35, curZ, deckW * 0.45, ledGlow, true);
          // Panoramic panoramic bridge ribbon glass
          b.addStrut(prevX, by0 + bh * 0.6, prevZ, curX, by0 + bh * 0.6, curZ, deckW * 0.78, bridgeGlass, true);
          // Curving aerodynamic roof trim
          b.addStrut(prevX, by0 + bh, prevZ, curX, by0 + bh, curZ, deckW * 0.92, whiteAlum, false);

          prevX = curX;
          prevZ = curZ;
        }
      };

      // Level 1 Skybridges (Floors 3-4, y ~ 14.5m)
      addCurvedSkybridge(towers[0], towers[1], y0 + 14.0, 4.2, 5.6, -7.0); // NW to NE
      addCurvedSkybridge(towers[1], towers[3], y0 + 14.0, 4.2, 5.6, -7.0); // NE to SE
      addCurvedSkybridge(towers[3], towers[2], y0 + 14.0, 4.2, 5.6, -7.0); // SE to SW
      addCurvedSkybridge(towers[2], towers[0], y0 + 14.0, 4.2, 5.6, -7.0); // SW to NW

      // Level 2 Skybridges (Floors 7-8, y ~ 31.5m) + sweeping diagonal canyon link
      addCurvedSkybridge(towers[0], towers[1], y0 + 31.0, 4.0, 5.0, 6.0);
      addCurvedSkybridge(towers[1], towers[3], y0 + 31.0, 4.0, 5.0, 6.0);
      addCurvedSkybridge(towers[3], towers[2], y0 + 31.0, 4.0, 5.0, 6.0);
      addCurvedSkybridge(towers[2], towers[0], y0 + 31.0, 4.0, 5.0, 6.0);
      addCurvedSkybridge(towers[0], towers[3], y0 + 33.5, 4.2, 5.2, -9.0); // NW to SE sweeping diagonal

      // Level 3 High Skybridges (Floors 10-11, y ~ 46.5m)
      addCurvedSkybridge(towers[0], towers[1], y0 + 46.0, 3.8, 4.6, -5.0);
      addCurvedSkybridge(towers[2], towers[3], y0 + 46.0, 3.8, 4.6, -5.0);
      addCurvedSkybridge(towers[1], towers[3], y0 + 48.0, 3.8, 4.6, 5.0);
    },
  },

  // 2. Leeza SOHO (丽泽SOHO)
  {
    id: 'leeza_soho',
    nameZh: '丽泽SOHO',
    nameEn: 'Leeza SOHO',
    cx: -6229,
    cz: 4773,
    exclR: 95,
    height: 207,
    osmIds: [568979330, 684192310],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // Color Palette
      const champagneAlum = [198, 206, 218];
      const darkCurtain = [32, 48, 68];
      const atriumGlass = [90, 185, 235];
      const atriumGlow = [255, 230, 165];
      const steelTruss = [142, 154, 168];
      const litWarm = [255, 230, 165];
      const litCool = [185, 232, 255];
      const spineCyan = [135, 228, 255];
      const spineGold = [255, 212, 105];
      const bridgeDeck = [255, 225, 140];

      // Total 46 Stories, Height 207m (4.5m per floor)
      const floors = 46;
      const floorH = 4.5;
      const baseRx = 36.5, baseRz = 28.5;

      // 1. Grand Ground Podium & Subway Hub Base (y0 .. y0 + 9.0m)
      b.addEllipticalSlice(cx, y0, cz, baseRx + 5.0, baseRz + 5.0, baseRx + 3.0, baseRz + 3.0, 3.0, 36, 0, champagneAlum, false, true);
      b.addEllipticalSlice(cx, y0 + 3.0, cz, baseRx + 3.0, baseRz + 3.0, baseRx + 1.5, baseRz + 1.5, 6.0, 36, 0, darkCurtain, false, true);

      // 2. Sculptural 207m Elliptical Barrel & Dynamic 45-Degree Twisting Atrium
      // The atrium void cleanly splits the building into two distinct half-towers from y0 to 193.5m!
      const atriumHalfAngle = 0.28; // ~16 degrees opening on each side of the twist axis

      for (let f = 0; f < floors; f++) {
        const fy0 = y0 + f * floorH;
        const fy1 = fy0 + floorH;
        const t0 = f / floors;
        const t1 = (f + 1) / floors;

        // Subtle barrel waist & top aerodynamic taper
        const prof0 = Math.sin(t0 * Math.PI * 0.85 + 0.26) * 0.17 + 0.88;
        const prof1 = Math.sin(t1 * Math.PI * 0.85 + 0.26) * 0.17 + 0.88;
        const rx0 = baseRx * prof0, rz0 = baseRz * prof0;
        const rx1 = baseRx * prof1, rz1 = baseRz * prof1;

        // Twist angle rotates 45 degrees (0 to PI/4) over the 194m atrium height
        const twist0 = t0 * (Math.PI / 4);
        const twist1 = t1 * (Math.PI / 4);

        if (f < 43) {
          // Two separate half-shells flanking the twisting atrium void
          const nSegsHalf = 12;
          for (let half = 0; half < 2; half++) {
            const baseAngle0 = twist0 + half * Math.PI + atriumHalfAngle;
            const baseAngle1 = twist1 + half * Math.PI + atriumHalfAngle;
            const sweep = Math.PI - 2 * atriumHalfAngle;

            for (let s = 0; s < nSegsHalf; s++) {
              const uA = s / nSegsHalf;
              const uB = (s + 1) / nSegsHalf;

              const a0A = baseAngle0 + uA * sweep;
              const a0B = baseAngle0 + uB * sweep;
              const a1A = baseAngle1 + uA * sweep;
              const a1B = baseAngle1 + uB * sweep;

              const p0A = [cx + Math.cos(a0A) * rx0, fy0, cz + Math.sin(a0A) * rz0];
              const p0B = [cx + Math.cos(a0B) * rx0, fy0, cz + Math.sin(a0B) * rz0];
              const p1B = [cx + Math.cos(a1B) * rx1, fy1, cz + Math.sin(a1B) * rz1];
              const p1A = [cx + Math.cos(a1A) * rx1, fy1, cz + Math.sin(a1A) * rz1];

              // Continuous sleek champagne aluminum spandrel band (lower 42%)
              const spH = floorH * 0.42;
              const m0A = [p0A[0] + (p1A[0] - p0A[0]) * 0.42, fy0 + spH, p0A[2] + (p1A[2] - p0A[2]) * 0.42];
              const m0B = [p0B[0] + (p1B[0] - p0B[0]) * 0.42, fy0 + spH, p0B[2] + (p1B[2] - p0B[2]) * 0.42];

              b.addQuad(...p0A, ...p0B, ...m0B, ...m0A, champagneAlum, false);

              // Curving glass ribbon window band (upper 58%) with office night lighting
              const isLit = ((f * 3 + s * 7 + half * 2) % 11) < 4;
              const winCol = isLit ? (f % 2 === 0 ? litWarm : litCool) : darkCurtain;
              b.addQuad(...m0A, ...m0B, ...p1B, ...p1A, winCol, isLit);
            }
          }

          // Crystalline Glass Curtain & Mullion Grid Across the Twisting Atrium Slits on both sides
          for (let slot = 0; slot < 2; slot++) {
            const slotCenter0 = twist0 + slot * Math.PI;
            const slotCenter1 = twist1 + slot * Math.PI;

            const c0A = slotCenter0 - atriumHalfAngle;
            const c0B = slotCenter0 + atriumHalfAngle;
            const c1A = slotCenter1 - atriumHalfAngle;
            const c1B = slotCenter1 + atriumHalfAngle;

            const w0A = [cx + Math.cos(c0A) * rx0 * 1.01, fy0, cz + Math.sin(c0A) * rz0 * 1.01];
            const w0B = [cx + Math.cos(c0B) * rx0 * 1.01, fy0, cz + Math.sin(c0B) * rz0 * 1.01];
            const w1B = [cx + Math.cos(c1B) * rx1 * 1.01, fy1, cz + Math.sin(c1B) * rz1 * 1.01];
            const w1A = [cx + Math.cos(c1A) * rx1 * 1.01, fy1, cz + Math.sin(c1A) * rz1 * 1.01];

            // Outer transparent cyan glass curtain
            b.addQuad(...w0A, ...w0B, ...w1B, ...w1A, atriumGlass, true);

            // Vertical structural mullion in center of the atrium curtain
            const mid0 = [cx + Math.cos(slotCenter0) * rx0 * 1.02, fy0, cz + Math.sin(slotCenter0) * rz0 * 1.02];
            const mid1 = [cx + Math.cos(slotCenter1) * rx1 * 1.02, fy1, cz + Math.sin(slotCenter1) * rz1 * 1.02];
            b.addStrut(...mid0, ...mid1, 0.6, steelTruss, false);
          }

          // Dual Glowing Helical Spine Ribbons twisting along the atrium void edges
          const spRad0 = (rx0 + rz0) * 0.44;
          const spRad1 = (rx1 + rz1) * 0.44;
          const sp1A = [cx + Math.cos(twist0) * spRad0, fy0, cz + Math.sin(twist0) * spRad0];
          const sp1B = [cx + Math.cos(twist1) * spRad1, fy1, cz + Math.sin(twist1) * spRad1];
          const sp2A = [cx - Math.cos(twist0) * spRad0, fy0, cz - Math.sin(twist0) * spRad0];
          const sp2B = [cx - Math.cos(twist1) * spRad1, fy1, cz - Math.sin(twist1) * spRad1];

          b.addStrut(...sp1A, ...sp1B, 1.2, spineCyan, true);
          b.addStrut(...sp2A, ...sp2B, 1.2, spineGold, true);
        } else {
          // Upper 3 floors (Floors 43-45): unified crown sky atrium
          b.addEllipticalRibbonSlice(
            cx, fy0, cz,
            rx0, rz0, rx1, rz1,
            floorH, 32, twist0,
            champagneAlum, darkCurtain,
            litCool, 0.85, 800 + f * 11,
            false
          );
        }
      }

      // 3. Four Massive Elevated Skybridge Rings spanning across the Twisting Atrium Void
      // Refuge floors at Levels 10 (~45m), 20 (~90m), 31 (~139.5m), 41 (~184.5m)
      const bridgeFloors = [10, 20, 31, 41];
      for (let i = 0; i < bridgeFloors.length; i++) {
        const bf = bridgeFloors[i];
        const by0 = y0 + bf * floorH;
        const bTwist = (bf / floors) * (Math.PI / 4);
        const cTw = Math.cos(bTwist), sTw = Math.sin(bTwist);

        const rAtrium = baseRx * 0.72;
        const p1x = cx - cTw * rAtrium, p1z = cz - sTw * rAtrium;
        const p2x = cx + cTw * rAtrium, p2z = cz + sTw * rAtrium;

        // Transverse skybridge deck linking the two half-towers
        b.addBox(cx, by0, cz, 8.2, 3.8, rAtrium * 1.92, bTwist, champagneAlum, false);
        // Under-bridge warm golden illumination strip
        b.addBox(cx, by0 - 0.25, cz, 4.0, 0.5, rAtrium * 1.86, bTwist, bridgeDeck, true);
        // Structural tubular ring truss cross-bracing
        b.addStrut(p1x, by0 + 0.4, p1z, p2x, by0 + 3.4, p2z, 0.95, steelTruss, false);
        b.addStrut(p1x, by0 + 3.4, p1z, p2x, by0 + 0.4, p2z, 0.95, steelTruss, false);
      }

      // 4. Crown Crystalline Glass Roof & Aerodynamic Parapet (193.5m .. 207m)
      const topY = y0 + floors * floorH - 13.5;
      b.addEllipticalSlice(cx, topY, cz, baseRx * 0.78, baseRz * 0.78, baseRx * 0.56, baseRz * 0.56, 9.0, 32, Math.PI / 4, champagneAlum, false, true);
      b.addEllipticalSlice(cx, topY + 9.0, cz, baseRx * 0.56, baseRz * 0.56, baseRx * 0.24, baseRz * 0.24, 4.5, 24, Math.PI / 4, atriumGlass, true, true);
    },
  },

  // 3. National Centre for the Performing Arts (国家大剧院 "巨蛋")
  {
    id: 'ncpa_egg',
    nameZh: '国家大剧院',
    nameEn: 'National Centre for the Performing Arts',
    cx: -1187,
    cz: 597,
    exclR: 165,
    height: 47,
    osmIds: [4974233, 28687576],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // Color Palette
      const lakeDeep = [18, 42, 72];
      const lakeGlow = [45, 105, 165];
      const promenadeStone = [220, 224, 230];
      const titaniumShell = [204, 210, 220];
      const titaniumSeam = [190, 196, 206];
      const glassCurtain = [44, 72, 106];
      const lensAmber = [255, 215, 135];
      const lensCool = [190, 235, 255];
      const operaCrimson = [215, 52, 44];
      const operaAmber = [255, 195, 105];
      const concertWood = [245, 215, 130];
      const theatreVermilion = [205, 58, 48];
      const bollardGlow = [255, 230, 160];

      // 1. Man-Made Artificial Reflecting Lake (260m EW x 186m NS)
      const lakeRx = 130.0, lakeRz = 93.0;
      b.addEllipticalSlice(cx, y0, cz, lakeRx, lakeRz, lakeRx, lakeRz, 1.2, 48, 0, lakeDeep, false, true);
      b.addEllipticalSlice(cx, y0 + 1.2, cz, lakeRx - 1.5, lakeRz - 1.5, lakeRx - 1.5, lakeRz - 1.5, 0.05, 48, 0, lakeGlow, true, true);
      // Lake perimeter stone promenade (curb from 130m to 134m)
      b.addEllipticalSlice(cx, y0, cz, lakeRx + 4.0, lakeRz + 4.0, lakeRx, lakeRz, 1.45, 48, 0, promenadeStone, false, true);

      // Perimeter Bollard Floodlights
      const nBollards = 32;
      for (let i = 0; i < nBollards; i++) {
        const ang = (i / nBollards) * Math.PI * 2;
        const bx = cx + Math.cos(ang) * (lakeRx + 2.0);
        const bz = cz + Math.sin(ang) * (lakeRz + 2.0);
        b.addCylinder(bx, y0 + 1.45, bz, 0.35, 0.35, 0.9, 8, 0, promenadeStone, false, true);
        b.addCylinder(bx, y0 + 2.1, bz, 0.4, 0.4, 0.25, 8, 0, bollardGlow, true, true);
      }

      // 2. Submerged North Glass Underpass Concourse
      // Cleanly flush with lake surface (+0.08m to avoid z-fighting), strictly within lake boundary
      // leading from North Promenade (cz - 93) to Dome perimeter (cz - 72)
      b.addBox(cx, y0 + 1.28, cz - 82.5, 20.0, 0.08, 21.0, 0, lensCool, true);
      b.addBox(cx - 9.8, y0 + 1.28, cz - 82.5, 0.45, 0.25, 21.0, 0, titaniumShell, false);
      b.addBox(cx + 9.8, y0 + 1.28, cz - 82.5, 0.45, 0.25, 21.0, 0, titaniumShell, false);
      // North entrance pavilion seamlessly stepping into the North promenade (cz - 94 to cz - 100)
      b.addBox(cx, y0 + 1.45, cz - 97, 22.0, 1.8, 6.0, 0, promenadeStone, false);
      b.addBox(cx, y0 + 1.8, cz - 97, 18.0, 1.4, 6.2, 0, lensAmber, true);

      // 3. True Continuous Ellipsoid Dome (212m EW x 144m NS x 46.5m High)
      // rx(y) = 106 * sqrt(1 - (y/46.5)^2), rz(y) = 72 * sqrt(1 - (y/46.5)^2)
      const domeRx = 106.0, domeRz = 72.0, domeH = 46.5;
      const nTiers = 24;
      const nSegs = 48;

      for (let k = 0; k < nTiers; k++) {
        const th0 = (k / nTiers) * (Math.PI / 2);
        const th1 = ((k + 1) / nTiers) * (Math.PI / 2);

        const yK0 = y0 + 1.25 + Math.sin(th0) * domeH;
        const yK1 = y0 + 1.25 + Math.sin(th1) * domeH;

        const rxK0 = Math.cos(th0) * domeRx;
        const rzK0 = Math.cos(th0) * domeRz;
        const rxK1 = Math.cos(th1) * domeRx;
        const rzK1 = Math.cos(th1) * domeRz;

        // North-South Glass Lens: 100m wide at base (half-width 48m in X), narrowing toward apex (14m half-width)
        const tMid = (k + 0.5) / nTiers;
        const lensHW = 48.0 * (1.0 - tMid * 0.70);

        for (let s = 0; s < nSegs; s++) {
          const a0 = (s / nSegs) * Math.PI * 2;
          const a1 = ((s + 1) / nSegs) * Math.PI * 2;
          const aMid = (a0 + a1) * 0.5;

          const midX = Math.cos(aMid) * (rxK0 + rxK1) * 0.5;
          const isLens = Math.abs(midX) < lensHW;

          // Glass lens is slightly proud (+0.18m) along normal to guarantee zero z-fighting and continuous curve
          const proudK0 = isLens ? 1.0 + 0.18 / Math.max(1, rxK0) : 1.0;
          const proudK1 = isLens ? 1.0 + 0.18 / Math.max(1, rxK1) : 1.0;

          const p00 = [cx + Math.cos(a0) * rxK0 * proudK0, yK0, cz + Math.sin(a0) * rzK0 * proudK0];
          const p10 = [cx + Math.cos(a1) * rxK0 * proudK0, yK0, cz + Math.sin(a1) * rzK0 * proudK0];
          const p11 = [cx + Math.cos(a1) * rxK1 * proudK1, yK1, cz + Math.sin(a1) * rzK1 * proudK1];
          const p01 = [cx + Math.cos(a0) * rxK1 * proudK1, yK1, cz + Math.sin(a0) * rzK1 * proudK1];

          if (isLens) {
            // Glass Curtain Lens with warm radiating Opera House light
            // Horizontal glass tiers with subtle alternating illumination
            const isLit = k % 2 === 0;
            const col = isLit ? lensAmber : glassCurtain;
            b.addQuad(...p00, ...p10, ...p11, ...p01, col, isLit);
          } else {
            // Brushed Silver-Titanium Lateral Shell
            const isSeam = k % 3 === 0;
            b.addQuad(...p00, ...p10, ...p11, ...p01, isSeam ? titaniumSeam : titaniumShell, false);
          }
        }
      }

      // Smooth elliptical skylight cap at apex
      b.addEllipticalSlice(cx, y0 + 1.25 + domeH - 0.2, cz, 4.5, 3.2, 0.1, 0.1, 0.2, 16, 0, lensCool, true, true);

      // 4. Glowing Internal Performance Venues Shining through the Glass Lens
      // Grand Opera House Core (Central Crimson-Velvet Shell & Warm-Amber Chandelier)
      b.addEllipticalSlice(cx, y0 + 1.8, cz, 30, 26, 26, 22, 24, 24, 0, operaCrimson, true, true);
      b.addEllipticalSlice(cx, y0 + 12.0, cz, 24, 20, 20, 16, 14, 20, 0, operaAmber, true, true);

      // Concert Hall (East Wing - Warm Birchwood Acoustic Volume)
      b.addBox(cx + 42, y0 + 2.0, cz, 32, 18, 38, 0, concertWood, true);

      // Drama Theatre (West Wing - Rich Vermilion Acoustic Volume)
      b.addBox(cx - 42, y0 + 2.0, cz, 32, 18, 38, 0, theatreVermilion, true);
    },
  },

  // 4. Great Hall of the People (人民大会堂)
  {
    id: 'great_hall_of_the_people',
    nameZh: '人民大会堂',
    nameEn: 'Great Hall of the People',
    cx: -889,
    cz: 584,
    exclR: 210,
    height: 46,
    osmIds: [8848388, 24822582],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // Color Palette
      const granitePodium = [206, 200, 190];
      const creamStone = [236, 230, 218];
      const marbleCol = [248, 244, 236];
      const loggiaShadow = [168, 160, 148];
      const greenGlaze = [42, 118, 74];
      const goldGlaze = [248, 198, 48];
      const emblemRed = [215, 38, 32];
      const emblemGold = [252, 216, 58];
      const warmUplight = [255, 224, 145];
      const bronzeDoors = [68, 54, 40];
      const stairStone = [224, 218, 208];
      const roofDeck = [194, 190, 182];
      const windowLit = [255, 222, 142];

      // 1. Monumental Elevated Granite Podium Base (346m NS x 194m EW x 4.8m High)
      // Main podium block (X from -98 to +94, Z from -173 to +173)
      b.addBox(cx - 2, y0, cz, 192, 4.8, 346, 0, granitePodium, false);

      // East Monumental Staircases leading down toward Tiananmen Square
      // Central Grand Staircase at Portico
      b.addFrustumBox(cx + 99, y0, cz, 10, 140, 2, 140, 4.8, 0, stairStone, false);
      // North Wing Staircase
      b.addFrustumBox(cx + 91, y0, cz - 105, 8, 110, 2, 110, 4.8, 0, stairStone, false);
      // South Wing Staircase
      b.addFrustumBox(cx + 91, y0, cz + 105, 8, 110, 2, 110, 4.8, 0, stairStone, false);

      // 2. Grand East Entrance Portico (Facing Tiananmen Square at +X)
      // Portico hall body projecting eastward (cx + 80, cz)
      b.addBox(cx + 80, y0 + 4.8, cz, 26, 25.0, 132, 0, creamStone, false);
      // Deeply recessed loggia behind the columns
      b.addBox(cx + 88, y0 + 4.8, cz, 6.0, 25.0, 126, 0, loggiaShadow, false);

      // Monumental Bronze Doors and Warm Portico Portal Glow
      b.addBox(cx + 88.5, y0 + 4.8, cz, 0.8, 9.6, 96, 0, bronzeDoors, false);
      b.addBox(cx + 88.6, y0 + 7.5, cz, 0.4, 6.0, 92, 0, warmUplight, true);

      // 12 Monumental Fluted Marble Columns (25m Tall, 2.7m Diameter)
      // Central bays have wider spacing (11.2m) denoting traditional hierarchy
      const colZOffsets = [
        -55.0, -45.2, -35.6, -26.2, -17.0, -6.6,
        6.6, 17.0, 26.2, 35.6, 45.2, 55.0
      ];

      for (let i = 0; i < colZOffsets.length; i++) {
        const pz = cz + colZOffsets[i];
        // Fluted column shaft
        b.addCylinder(cx + 93.0, y0 + 4.8, pz, 1.35, 1.25, 25.0, 12, 0, marbleCol, false, true);
        // Column base & capital warm night uplighting
        b.addBox(cx + 93.0, y0 + 4.8, pz, 3.2, 0.45, 3.2, 0, warmUplight, true);
        b.addBox(cx + 93.0, y0 + 29.4, pz, 3.4, 0.45, 3.4, 0, warmUplight, true);
      }

      // Portico Entablature, Frieze and Classical Attic
      b.addBox(cx + 80, y0 + 29.8, cz, 28, 3.4, 134, 0, creamStone, false);
      // Glazed Green Tile Cornice with Golden Trim
      b.addBox(cx + 80, y0 + 33.2, cz, 30, 1.4, 136, 0, greenGlaze, false);
      b.addBox(cx + 80, y0 + 34.6, cz, 30.8, 0.6, 136.8, 0, goldGlaze, true);
      b.addBox(cx + 80, y0 + 35.2, cz, 27.5, 0.2, 133.5, 0, roofDeck, false);

      // National Emblem of the PRC (中华人民共和国国徽)
      b.addBox(cx + 94.6, y0 + 25.5, cz, 0.6, 6.4, 6.4, 0, emblemRed, true);
      b.addBox(cx + 95.0, y0 + 25.5, cz, 0.35, 5.0, 5.0, 0, emblemGold, true);

      // 3. Central Great Auditorium (万人大礼堂 - 78m EW x 92m NS x 46.5m High)
      b.addBox(cx + 10, y0 + 4.8, cz, 82, 38.0, 94, 0, creamStone, false);
      // Attic Parapet
      b.addBox(cx + 10, y0 + 42.8, cz, 84, 3.2, 96, 0, creamStone, false);
      // Glazed Green & Gold Roof Eave
      b.addBox(cx + 10, y0 + 45.0, cz, 86, 1.4, 98, 0, greenGlaze, false);
      b.addBox(cx + 10, y0 + 46.4, cz, 86.8, 0.5, 98.8, 0, goldGlaze, true);
      b.addBox(cx + 10, y0 + 46.9, cz, 83.5, 0.2, 95.5, 0, roofDeck, false);

      // Sunburst Skylight Roof Lantern with golden finial
      b.addCylinder(cx + 10, y0 + 47.1, cz, 13.0, 9.5, 3.2, 16, 0, warmUplight, true, true);
      b.addCylinder(cx + 10, y0 + 50.3, cz, 3.0, 0.4, 1.8, 12, 0, goldGlaze, true, true);

      // 4. North Wing: State Banquet Hall (宴会厅 - 64m EW x 126m NS x 38m High)
      // Main mass (centered at cx + 38, cz - 105)
      b.addBox(cx + 38, y0 + 4.8, cz - 105, 68, 33.2, 126, 0, creamStone, false);
      // Continuous glazed green tile cornice with gold trim
      b.addBox(cx + 38, y0 + 38.0, cz - 105, 70.5, 1.4, 128.5, 0, greenGlaze, false);
      b.addBox(cx + 38, y0 + 39.4, cz - 105, 71.2, 0.6, 129.2, 0, goldGlaze, true);
      b.addBox(cx + 38, y0 + 40.0, cz - 105, 67.0, 0.2, 125.0, 0, roofDeck, false);

      // Grand East Colonnade Facade of North Wing (facing Tiananmen Square at X = +72)
      const nWingCols = 14;
      for (let j = 0; j <= nWingCols; j++) {
        const colZ = cz - 162 + (j / nWingCols) * 114;
        b.addCylinder(cx + 72.0, y0 + 4.8, colZ, 0.95, 0.85, 33.2, 10, 0, marbleCol, false, true);
        if (j < nWingCols) {
          const winZ = colZ + 114 / (nWingCols * 2);
          b.addBox(cx + 71.0, y0 + 10.0, winZ, 0.8, 22.0, 4.6, 0, windowLit, true);
        }
      }

      // North Facade Colonnade (facing West Chang'an Avenue at Z = -168)
      for (let i = 0; i < 8; i++) {
        const colX = cx + 8 + i * 8.0;
        b.addCylinder(colX, y0 + 4.8, cz - 168.0, 0.95, 0.85, 33.2, 10, 0, marbleCol, false, true);
        if (i < 7) {
          b.addBox(colX + 4.0, y0 + 10.0, cz - 167.0, 4.6, 22.0, 0.8, 0, windowLit, true);
        }
      }

      // 5. South Wing: NPC Standing Committee (人大常委会办公区 - 64m EW x 126m NS x 38m High)
      // Main mass (centered at cx + 38, cz + 105)
      b.addBox(cx + 38, y0 + 4.8, cz + 105, 68, 33.2, 126, 0, creamStone, false);
      // Continuous glazed green tile cornice with gold trim
      b.addBox(cx + 38, y0 + 38.0, cz + 105, 70.5, 1.4, 128.5, 0, greenGlaze, false);
      b.addBox(cx + 38, y0 + 39.4, cz + 105, 71.2, 0.6, 129.2, 0, goldGlaze, true);
      b.addBox(cx + 38, y0 + 40.0, cz + 105, 67.0, 0.2, 125.0, 0, roofDeck, false);

      // Grand East Colonnade Facade of South Wing (facing Tiananmen Square at X = +72)
      for (let j = 0; j <= nWingCols; j++) {
        const colZ = cz + 48 + (j / nWingCols) * 114;
        b.addCylinder(cx + 72.0, y0 + 4.8, colZ, 0.95, 0.85, 33.2, 10, 0, marbleCol, false, true);
        if (j < nWingCols) {
          const winZ = colZ + 114 / (nWingCols * 2);
          b.addBox(cx + 71.0, y0 + 10.0, winZ, 0.8, 22.0, 4.6, 0, windowLit, true);
        }
      }

      // South Facade Colonnade (facing Qianmen West Street at Z = +168)
      for (let i = 0; i < 8; i++) {
        const colX = cx + 8 + i * 8.0;
        b.addCylinder(colX, y0 + 4.8, cz + 168.0, 0.95, 0.85, 33.2, 10, 0, marbleCol, false, true);
        if (i < 7) {
          b.addBox(colX + 4.0, y0 + 10.0, cz + 167.0, 4.6, 22.0, 0.8, 0, windowLit, true);
        }
      }

      // 6. West Wings & Connecting Galleries ("山" character plan layout)
      // Central Western Wing behind Great Auditorium
      b.addBox(cx - 52, y0 + 4.8, cz, 46, 32.0, 140, 0, creamStone, false);
      b.addBox(cx - 52, y0 + 36.8, cz, 48, 1.2, 142, 0, greenGlaze, false);
      b.addBox(cx - 52, y0 + 38.0, cz, 48.6, 0.5, 142.6, 0, goldGlaze, true);
      b.addBox(cx - 52, y0 + 38.5, cz, 45.0, 0.2, 139.0, 0, roofDeck, false);

      // Connecting West-North and West-South Galleries
      b.addBox(cx - 24, y0 + 4.8, cz - 56, 42, 30.0, 36, 0, creamStone, false);
      b.addBox(cx - 24, y0 + 34.8, cz - 56, 44, 1.2, 38, 0, greenGlaze, false);
      b.addBox(cx - 24, y0 + 36.0, cz - 56, 44.6, 0.5, 38.6, 0, goldGlaze, true);
      b.addBox(cx - 24, y0 + 36.5, cz - 56, 41.0, 0.2, 35.0, 0, roofDeck, false);

      b.addBox(cx - 24, y0 + 4.8, cz + 56, 42, 30.0, 36, 0, creamStone, false);
      b.addBox(cx - 24, y0 + 34.8, cz + 56, 44, 1.2, 38, 0, greenGlaze, false);
      b.addBox(cx - 24, y0 + 36.0, cz + 56, 44.6, 0.5, 38.6, 0, goldGlaze, true);
      b.addBox(cx - 24, y0 + 36.5, cz + 56, 41.0, 0.2, 35.0, 0, roofDeck, false);

      // Warm window illumination along west facade
      b.addBox(cx - 52, y0 + 12.0, cz, 46.5, 20.0, 136, 0, windowLit, true);
      b.addBox(cx - 24, y0 + 12.0, cz - 56, 42.5, 18.0, 32, 0, windowLit, true);
      b.addBox(cx - 24, y0 + 12.0, cz + 56, 42.5, 18.0, 32, 0, windowLit, true);
    },
  },
];
