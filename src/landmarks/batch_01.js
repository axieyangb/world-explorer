/**
 * Beijing Explorer - Landmark Procedural Geometry Definitions: Batch 01
 * 
 * 1. tiananmen_rostrum (天安门城楼)
 * 2. qianmen_gate (正阳门城楼)
 * 3. zhengyangmen_arrow_tower (正阳门箭楼)
 * 4. wumen (故宫午门)
 */

/**
 * Procedural helper: Adds an authentic arched gateway portal with stone voussoir surround (`拱券石/券脸石`),
 * perfectly conforming to a battered (frustum) city wall rampart without any protruding blocks or roof-piercing cylinders.
 */
function addBatteredArchPortal(
  b,
  cx, y0, cz,
  w, h,
  wallBaseY, wallH,
  sz0, sz1,
  stoneCol = [238, 235, 228],
  darkCol = [22, 18, 18],
  hasNorth = true,
  doorZOffset = 2.5
) {
  const r = w * 0.5;
  const hJamb = Math.max(1.0, h - r);
  const yJamb = y0 + hJamb;
  const yPeak = y0 + h;
  const wStone = Math.min(0.85, Math.max(0.5, w * 0.14));
  const rOuter = r + wStone;
  const nSegs = 6;

  // Linear interpolation of wall half-thickness at height y
  const getHalfZ = (y) => {
    const t = Math.max(0, Math.min(1, (y - wallBaseY) / wallH));
    return (sz0 + (sz1 - sz0) * t) * 0.5;
  };

  // 1. Recessed dark tunnel passage interior (contained safely within the wall)
  const tunnelSz = sz1 * 0.94;
  b.addBox(cx, y0, cz, w, hJamb, tunnelSz, 0, darkCol, false);

  // 2. Facade stone voussoir arches & dark portal cutouts on South (and North) faces
  const faces = hasNorth ? [[1, true], [-1, false]] : [[1, true]];

  for (const [zSign, isSouth] of faces) {
    const zBase = cz + zSign * (getHalfZ(y0) + 0.05);
    const zJamb = cz + zSign * (getHalfZ(yJamb) + 0.05);

    // Dark opening quad (lower rectangle)
    if (zSign > 0) {
      b.addQuad(cx - r, y0, zBase, cx + r, y0, zBase, cx + r, yJamb, zJamb, cx - r, yJamb, zJamb, darkCol, false);
    } else {
      b.addQuad(cx + r, y0, zBase, cx - r, y0, zBase, cx - r, yJamb, zJamb, cx + r, yJamb, zJamb, darkCol, false);
    }

    // Left & Right stone jamb frames
    if (zSign > 0) {
      b.addQuad(cx - r - wStone, y0, zBase, cx - r, y0, zBase, cx - r, yJamb, zJamb, cx - r - wStone, yJamb, zJamb, stoneCol, false);
      b.addQuad(cx + r, y0, zBase, cx + r + wStone, y0, zBase, cx + r + wStone, yJamb, zJamb, cx + r, yJamb, zJamb, stoneCol, false);
    } else {
      b.addQuad(cx - r, y0, zBase, cx - r - wStone, y0, zBase, cx - r - wStone, yJamb, zJamb, cx - r, yJamb, zJamb, stoneCol, false);
      b.addQuad(cx + r + wStone, y0, zBase, cx + r, y0, zBase, cx + r, yJamb, zJamb, cx + r + wStone, yJamb, zJamb, stoneCol, false);
    }

    // Semicircular arch top (dark fan opening + outer stone voussoir ring)
    for (let i = 0; i < nSegs; i++) {
      const a0 = (i / nSegs) * Math.PI;
      const a1 = ((i + 1) / nSegs) * Math.PI;

      // Inner arch vertices
      const x0 = cx - Math.cos(a0) * r;
      const y0_ = yJamb + Math.sin(a0) * r;
      const z0_ = cz + zSign * (getHalfZ(y0_) + 0.05);

      const x1 = cx - Math.cos(a1) * r;
      const y1_ = yJamb + Math.sin(a1) * r;
      const z1_ = cz + zSign * (getHalfZ(y1_) + 0.05);

      // Dark arch interior fan
      if (zSign > 0) {
        b.addTri(cx, yJamb, zJamb, x0, y0_, z0_, x1, y1_, z1_, darkCol, false);
      } else {
        b.addTri(cx, yJamb, zJamb, x1, y1_, z1_, x0, y0_, z0_, darkCol, false);
      }

      // Outer stone voussoir vertices
      const ox0 = cx - Math.cos(a0) * rOuter;
      const oy0_ = yJamb + Math.sin(a0) * rOuter;
      const oz0_ = cz + zSign * (getHalfZ(oy0_) + 0.05);

      const ox1 = cx - Math.cos(a1) * rOuter;
      const oy1_ = yJamb + Math.sin(a1) * rOuter;
      const oz1_ = cz + zSign * (getHalfZ(oy1_) + 0.05);

      // Stone voussoir quad
      if (zSign > 0) {
        b.addQuad(x0, y0_, z0_, x1, y1_, z1_, ox1, oy1_, oz1_, ox0, oy0_, oz0_, stoneCol, false);
      } else {
        b.addQuad(x1, y1_, z1_, x0, y0_, z0_, ox0, oy0_, oz0_, ox1, oy1_, oz1_, stoneCol, false);
      }
    }

    // Imperial vermilion doors slightly recessed inside south entryway
    if (isSouth) {
      const doorZ = cz + getHalfZ(y0) - doorZOffset;
      b.addBox(cx, y0, doorZ, w * 0.94, hJamb * 0.98, 0.35, 0, [148, 32, 28], false);
      // Golden door studs
      b.addBox(cx - w * 0.22, y0 + hJamb * 0.45, doorZ + 0.2, 0.18, 0.18, 0.12, 0, [255, 215, 80], true);
      b.addBox(cx + w * 0.22, y0 + hJamb * 0.45, doorZ + 0.2, 0.18, 0.18, 0.12, 0, [255, 215, 80], true);
    }
  }
}

export const BATCH_01 = [
  // =========================================================================
  // 1. 天安门城楼 (Tiananmen Rostrum)
  // =========================================================================
  {
    id: 'tiananmen_rostrum',
    nameZh: '天安门',
    nameEn: 'Tiananmen Rostrum',
    cx: -513,
    cz: 156,
    exclR: 95,
    height: 35,
    osmIds: [8847697, 24822577],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. White marble Sumeru terrace pedestal under fortress rampart (grounded at y0)
      b.addBox(cx, y0, cz, 92, 1.6, 40, 0, [242, 239, 232], false);

      // 2. Crimson battered city wall rampart (城台: y = 1.6m .. 13.0m)
      b.addFrustumBox(cx, y0 + 1.6, cz, 90, 38, 84, 31, 11.4, 0, [168, 38, 32], false);

      // 3. Five arched gateway portal cutouts (五阙拱券洞: authentic arched stone voussoirs on battered wall)
      const portals = [
        { dx: 0, w: 5.4, h: 8.5 },      // Central Imperial Portal (御道正门)
        { dx: -11.2, w: 4.6, h: 7.5 },  // Flanking Left Prince Portal (王公左券门)
        { dx: 11.2, w: 4.6, h: 7.5 },   // Flanking Right Prince Portal (王公右券门)
        { dx: -21.6, w: 4.0, h: 6.6 },  // Outer Left Official Portal (品级左券门)
        { dx: 21.6, w: 4.0, h: 6.6 },   // Outer Right Official Portal (品级右券门)
      ];

      for (const p of portals) {
        addBatteredArchPortal(
          b,
          cx + p.dx, y0, cz,
          p.w, p.h,
          y0 + 1.6, 11.4,
          38, 31,
          [238, 235, 228],
          [22, 18, 18],
          true,
          2.6
        );
      }

      // 4. Rampart South Facade: Chairman Mao Portrait & Political Slogans
      // Portrait hangs above central portal arch (y0 + 7.2m .. 12.0m, flush with battered wall at cz + 16.5m)
      b.addBox(cx, y0 + 7.2, cz + 16.55, 4.6, 4.8, 0.25, 0, [186, 42, 36], false); // Red frame
      b.addBox(cx, y0 + 7.4, cz + 16.70, 3.8, 4.4, 0.15, 0, [246, 238, 222], true);  // Portrait face
      // Gilded frame rim
      b.addBox(cx, y0 + 11.8, cz + 16.72, 4.2, 0.22, 0.18, 0, [248, 212, 75], true);
      b.addBox(cx, y0 + 7.3, cz + 16.72, 4.2, 0.22, 0.18, 0, [248, 212, 75], true);

      // West Slogan Board: "中华人民共和国万岁"
      b.addBox(cx - 24.5, y0 + 8.4, cz + 16.65, 22.0, 1.6, 0.25, 0, [186, 42, 36], false);
      b.addBox(cx - 24.5, y0 + 8.6, cz + 16.80, 20.6, 1.1, 0.12, 0, [255, 255, 255], true);

      // East Slogan Board: "世界人民大团结万岁"
      b.addBox(cx + 24.5, y0 + 8.4, cz + 16.65, 22.0, 1.6, 0.25, 0, [186, 42, 36], false);
      b.addBox(cx + 24.5, y0 + 8.6, cz + 16.80, 20.6, 1.1, 0.12, 0, [255, 255, 255], true);

      // Granite plaza apron connecting rampart base (cz + 20) to Jinshui River north embankment (cz + 28)
      b.addBox(cx, y0, cz + 24.0, 136, 0.35, 8.5, 0, [212, 208, 200], false);

      // 5. White marble balustrade & perimeter floodlight band on top of rampart (y = 13.0m)
      // Granite floor
      b.addBox(cx, y0 + 13.0, cz, 84.5, 0.2, 31.5, 0, [156, 150, 142], false);
      // Perimeter white marble balustrade
      b.addBox(cx, y0 + 13.0, cz + 15.6, 84.5, 1.2, 0.38, 0, [246, 244, 238], false);
      b.addBox(cx, y0 + 13.0, cz - 15.6, 84.5, 1.2, 0.38, 0, [246, 244, 238], false);
      b.addBox(cx - 42.1, y0 + 13.0, cz, 0.38, 1.2, 31.5, 0, [246, 244, 238], false);
      b.addBox(cx + 42.1, y0 + 13.0, cz, 0.38, 1.2, 31.5, 0, [246, 244, 238], false);
      // Warm floodlight strip around rampart top rim
      b.addBox(cx, y0 + 12.8, cz, 84.2, 0.25, 31.2, 0, [255, 205, 110], true);

      // 6. Outer Jinshui River (外金水河) and Five White Marble Bridges (金水桥: cz + 26..42)
      // Riverbed canal water cleanly grounded (y0 .. y0 + 0.15)
      b.addBox(cx, y0, cz + 34, 136, 0.15, 12, 0, [38, 72, 88], false);
      // Granite embankments north and south
      b.addBox(cx, y0, cz + 27.5, 136, 0.85, 1.2, 0, [192, 188, 180], false);
      b.addBox(cx, y0, cz + 40.5, 136, 0.85, 1.2, 0, [192, 188, 180], false);

      // Center Imperial Bridge (御路桥: widest, with carved dragon posts)
      b.addBox(cx, y0 + 0.45, cz + 34, 6.8, 0.6, 17.0, 0, [246, 244, 238], false);
      b.addBox(cx - 3.2, y0 + 1.05, cz + 34, 0.38, 0.9, 17.0, 0, [250, 248, 242], false);
      b.addBox(cx + 3.2, y0 + 1.05, cz + 34, 0.38, 0.9, 17.0, 0, [250, 248, 242], false);
      b.addBox(cx - 3.2, y0 + 1.55, cz + 26, 0.45, 0.5, 0.45, 0, [255, 225, 140], true);
      b.addBox(cx + 3.2, y0 + 1.55, cz + 26, 0.45, 0.5, 0.45, 0, [255, 225, 140], true);
      b.addBox(cx - 3.2, y0 + 1.55, cz + 42, 0.45, 0.5, 0.45, 0, [255, 225, 140], true);
      b.addBox(cx + 3.2, y0 + 1.55, cz + 42, 0.45, 0.5, 0.45, 0, [255, 225, 140], true);

      // Flanking 2 Princely Bridges (王公桥)
      for (const sign of [-1, 1]) {
        const bx = cx + sign * 14;
        b.addBox(bx, y0 + 0.4, cz + 34, 5.2, 0.55, 16.0, 0, [246, 244, 238], false);
        b.addBox(bx - 2.4, y0 + 0.95, cz + 34, 0.32, 0.85, 16.0, 0, [250, 248, 242], false);
        b.addBox(bx + 2.4, y0 + 0.95, cz + 34, 0.32, 0.85, 16.0, 0, [250, 248, 242], false);
        b.addBox(bx - 2.4, y0 + 1.45, cz + 41.5, 0.38, 0.45, 0.38, 0, [255, 225, 140], true);
        b.addBox(bx + 2.4, y0 + 1.45, cz + 41.5, 0.38, 0.45, 0.38, 0, [255, 225, 140], true);
      }

      // Outer 2 Official Bridges (品级桥)
      for (const sign of [-1, 1]) {
        const bx = cx + sign * 27;
        b.addBox(bx, y0 + 0.35, cz + 34, 4.4, 0.5, 15.0, 0, [246, 244, 238], false);
        b.addBox(bx - 2.0, y0 + 0.85, cz + 34, 0.3, 0.8, 15.0, 0, [250, 248, 242], false);
        b.addBox(bx + 2.0, y0 + 0.85, cz + 34, 0.3, 0.8, 15.0, 0, [250, 248, 242], false);
      }

      // 7. Two Monumental White Marble Huabiao Columns (汉白玉华表: cx ± 28, cz + 46)
      for (const sign of [-1, 1]) {
        const hx = cx + sign * 28;
        const hz = cz + 46;
        // Octagonal base Sumeru pedestal & balustrade
        b.addCylinder(hx, y0, hz, 1.8, 1.6, 1.2, 8, 0, [240, 238, 232], false);
        b.addCylinder(hx, y0 + 0.8, hz, 2.4, 2.4, 0.6, 8, 0, [245, 243, 238], false);
        // Marble column shaft with relief carvings
        b.addCylinder(hx, y0 + 1.2, hz, 0.65, 0.58, 8.2, 8, 0, [250, 248, 244], false);
        // Horizontal Cloud Wing / Board (日月云板)
        b.addBox(hx, y0 + 8.2, hz, 3.4, 0.9, 0.22, 0, [252, 250, 246], false);
        // Dew Basin (承露盘) & Crouching Dragon Beast (朝天吼)
        b.addCylinder(hx, y0 + 9.4, hz, 0.95, 1.15, 0.38, 8, 0, [248, 246, 240], false);
        b.addBox(hx, y0 + 9.8, hz, 0.55, 1.3, 0.65, 0, [246, 244, 238], false);
        b.addBox(hx, y0 + 11.1, hz, 0.35, 0.35, 0.35, 0, [255, 240, 180], true);
      }

      // 8. Pair of Ming White Marble Stone Lions (明代石狮: cx ± 16, cz + 45)
      for (const sign of [-1, 1]) {
        const lx = cx + sign * 16;
        const lz = cz + 45;
        b.addBox(lx, y0, lz, 2.2, 1.4, 3.2, 0, [235, 232, 226], false);
        b.addBox(lx, y0 + 1.4, lz, 1.6, 1.8, 2.2, 0, [242, 240, 234], false);
        b.addBox(lx, y0 + 2.5, lz + 0.4, 1.2, 1.1, 1.2, 0, [246, 244, 238], false);
      }

      // 9. Grand 9-Bay Tiananmen Rostrum Palace Hall atop Rampart (y = 13.0m)
      // White marble hall terrace
      b.addBox(cx, y0 + 13.0, cz, 68, 1.4, 27, 0, [245, 242, 235], false);
      b.addBox(cx, y0 + 14.4, cz, 68.6, 0.95, 28.6, 0, [250, 248, 242], false);

      // Double-eave grand palace hall (面阔九间、进深五间)
      b.addImperialPalace(
        cx, y0 + 14.4, cz,
        58, 21,
        0, 0,
        7.8, 12.5,
        0,
        [236, 178, 36], // Imperial yellow glazed tiles
        [172, 42, 36],  // Crimson palace walls
        [242, 239, 232],
        true
      );

      // 10. Eight Grand Red Silk Palace Lanterns (大红灯笼) hung under front lower eave
      for (let i = 0; i < 8; i++) {
        const lx = cx - 24 + i * 6.85;
        const ly = y0 + 18.5;
        const lz = cz + 12.8;
        // Lantern red sphere body
        b.addBox(lx, ly, lz, 1.2, 1.6, 1.2, 0, [255, 38, 32], true);
        // Golden cap & tassels
        b.addBox(lx, ly + 0.9, lz, 0.6, 0.25, 0.6, 0, [250, 210, 60], true);
        b.addBox(lx, ly - 0.9, lz, 0.35, 0.75, 0.35, 0, [255, 205, 50], true);
      }

      // 11. National Emblem on Upper Clerestory Wall (国徽: flush mounted between eaves)
      b.addBox(cx, y0 + 23.6, cz + 8.85, 2.6, 2.6, 0.25, 0, [248, 205, 52], true);
      b.addBox(cx, y0 + 23.6, cz + 8.98, 2.0, 2.0, 0.12, 0, [218, 42, 36], true);
    },
  },

  // =========================================================================
  // 2. 正阳门城楼 (Qianmen Gatehouse)
  // =========================================================================
  {
    id: 'qianmen_gate',
    nameZh: '正阳门城楼',
    nameEn: 'Qianmen Gatehouse',
    cx: -513,
    cz: 1058,
    exclR: 55,
    height: 42,
    osmIds: [25109960, 4229776],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Monumental Ming Grey-Brick Fortress Rampart (城台: 70m × 35m × 14.7m)
      b.addFrustumBox(cx, y0, cz, 70, 35, 64, 29, 14.7, 0, [108, 112, 118], false);

      // Central Arched Gateway Vault (五伏五券门洞) - perfectly flush arched stone voussoirs on battered wall
      addBatteredArchPortal(
        b,
        cx, y0, cz,
        7.2, 9.5,
        y0, 14.7,
        35, 29,
        [225, 222, 216],
        [24, 22, 22],
        true,
        2.2
      );

      // Stepped North Horse Ramps (登城马道: two authentic sloping stepped ramps on north wall)
      for (const sign of [-1, 1]) {
        for (let step = 0; step < 8; step++) {
          const t = step / 7;
          const rx = cx + sign * (9 + t * 20);
          const ry = y0 + t * 14.7;
          b.addBox(rx, y0, cz - 15.8, 3.0, Math.max(1.0, ry - y0), 3.8, 0, [108, 112, 118], false);
          b.addBox(rx, ry, cz - 15.8, 3.0, 0.25, 3.8, 0, [168, 165, 158], false);
          b.addBox(rx, ry + 0.25, cz - 17.6, 3.0, 0.85, 0.35, 0, [218, 216, 210], false);
        }
      }

      // White crenellated parapet & warm night floodlight band at rampart rim (y = 14.7m)
      b.addBox(cx, y0 + 14.7, cz, 64.2, 0.2, 29.2, 0, [152, 148, 142], false); // Floor
      b.addBox(cx, y0 + 14.7, cz + 14.4, 64.2, 1.3, 0.45, 0, [218, 216, 210], false);
      b.addBox(cx, y0 + 14.7, cz - 14.4, 64.2, 1.3, 0.45, 0, [218, 216, 210], false);
      b.addBox(cx - 31.9, y0 + 14.7, cz, 0.45, 1.3, 29.2, 0, [218, 216, 210], false);
      b.addBox(cx + 31.9, y0 + 14.7, cz, 0.45, 1.3, 29.2, 0, [218, 216, 210], false);
      b.addBox(cx, y0 + 14.4, cz, 63.8, 0.3, 28.8, 0, [255, 205, 110], true);

      // 2. Gatehouse Hall Podium (y = 14.7m)
      b.addBox(cx, y0 + 14.7, cz, 46, 1.2, 24, 0, [240, 238, 232], false);
      b.addBox(cx, y0 + 15.9, cz, 46.6, 0.95, 24.6, 0, [246, 244, 238], false);

      // 3. Two-Story Gatehouse Hall (面阔七间、进深三间、重檐歇山三滴水)
      // Level 1: Vermilion timber wall core & perimeter colonnade
      b.addBox(cx, y0 + 15.9, cz, 39, 6.0, 18, 0, [162, 42, 36], false);
      // Colonnade pillars & glowing windows along X
      for (let i = 0; i <= 7; i++) {
        const px = cx - 19.5 + i * (39 / 7);
        for (const zSign of [-1, 1]) {
          b.addCylinder(px, y0 + 15.9, cz + zSign * 9.2, 0.45, 0.42, 6.0, 8, 0, [186, 46, 38], false);
          if (i < 7) {
            const wx = px + 39 / 14;
            b.addBox(wx, y0 + 17.2, cz + zSign * 9.05, 3.2, 3.8, 0.3, 0, [255, 215, 125], true);
          }
        }
      }
      // Colonnade pillars along Z flanks
      for (let j = 1; j < 3; j++) {
        const pz = cz - 9.0 + j * 6.0;
        for (const xSign of [-1, 1]) {
          b.addCylinder(cx + xSign * 19.5, y0 + 15.9, pz, 0.45, 0.42, 6.0, 8, 0, [186, 46, 38], false);
        }
      }

      // Level 1 Eave Skirt (第一滴水: grey tile with emerald green trim)
      b.addChineseRoof(
        cx, y0 + 21.6, cz,
        44, 23,
        3.2, 2.2,
        0,
        [72, 75, 78],  // Ming grey cylindrical tiles
        [46, 138, 88], // Emerald green glazed trim
        [46, 138, 88]
      );

      // Level 2 Upper Hall (第二滴水):
      b.addBox(cx, y0 + 23.2, cz, 36, 5.8, 16, 0, [162, 42, 36], false);
      for (let i = 0; i <= 7; i++) {
        const px = cx - 18 + i * (36 / 7);
        for (const zSign of [-1, 1]) {
          b.addCylinder(px, y0 + 23.2, cz + zSign * 8.2, 0.42, 0.4, 5.8, 8, 0, [186, 46, 38], false);
          if (i < 7) {
            const wx = px + 36 / 14;
            b.addBox(wx, y0 + 24.4, cz + zSign * 8.05, 2.9, 3.6, 0.3, 0, [255, 215, 125], true);
          }
        }
      }

      // Level 2 Eave Skirt (第二滴水):
      b.addChineseRoof(
        cx, y0 + 28.8, cz,
        41, 21,
        3.2, 2.0,
        0,
        [72, 75, 78],
        [46, 138, 88],
        [46, 138, 88]
      );

      // Upper Clerestory & Grand Curved Double-Eave Roof (第三滴水 / 主楼顶):
      b.addBox(cx, y0 + 30.6, cz, 32, 2.6, 13.5, 0, [162, 42, 36], false);
      b.addBox(cx, y0 + 32.8, cz, 34, 0.65, 15, 0, [38, 102, 92], false); // Painted beam band
      b.addChineseRoof(
        cx, y0 + 33.2, cz,
        37, 18,
        8.8, 2.8,
        0,
        [72, 75, 78],  // Grey tiles
        [46, 138, 88], // Emerald green trim
        [246, 198, 68] // Golden owl-tail finials (鸱吻)
      );

      // "正阳门" Vermilion Hall Plaque (on south facade)
      b.addBox(cx, y0 + 26.5, cz + 8.2, 4.2, 2.2, 0.35, 0, [168, 38, 32], false);
      b.addBox(cx, y0 + 26.5, cz + 8.4, 3.6, 1.6, 0.25, 0, [248, 206, 68], true);
    },
  },

  // =========================================================================
  // 3. 正阳门箭楼 (Zhengyangmen Arrow Tower)
  // =========================================================================
  {
    id: 'zhengyangmen_arrow_tower',
    nameZh: '正阳门箭楼',
    nameEn: 'Zhengyangmen Arrow Tower',
    cx: -498,
    cz: 1188,
    exclR: 55,
    height: 38,
    osmIds: [439956436, 26526058],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Monumental Grey-Brick Rampart Fortress Base (城台: 62m × 28m × 12m)
      b.addFrustumBox(cx, y0, cz, 62, 28, 58, 24.5, 12.0, 0, [108, 112, 118], false);

      // Central Vaulted Gate Portal with Iron Portcullis Slot (千斤闸券门)
      addBatteredArchPortal(
        b,
        cx, y0, cz,
        6.4, 8.0,
        y0, 12.0,
        28, 24.5,
        [232, 230, 224],
        [26, 24, 24],
        true,
        2.2
      );

      // Vertical Iron Portcullis Gate (千斤闸) detail
      b.addBox(cx, y0 + 1.2, cz, 6.0, 6.2, 0.35, 0, [58, 55, 52], false);
      b.addBox(cx, y0 + 6.6, cz, 6.4, 0.45, 0.45, 0, [218, 195, 80], true);

      // 1915 Western stone balustrades & night floodlight band at y = 12.0m
      b.addBox(cx, y0 + 12.0, cz, 58.2, 0.2, 24.6, 0, [156, 152, 146], false); // Floor
      b.addBox(cx, y0 + 12.0, cz + 12.1, 58.2, 1.3, 0.4, 0, [232, 230, 224], false);
      b.addBox(cx - 28.9, y0 + 12.0, cz, 0.4, 1.3, 24.6, 0, [232, 230, 224], false);
      b.addBox(cx + 28.9, y0 + 12.0, cz, 0.4, 1.3, 24.6, 0, [232, 230, 224], false);
      b.addBox(cx, y0 + 11.8, cz, 58.0, 0.25, 24.4, 0, [255, 205, 110], true);

      // 1915 Western Ribbon Cartouche Ornaments (绶带悬章) on East & West fortress flanks
      b.addBox(cx - 29.2, y0 + 6.0, cz, 0.45, 4.0, 3.2, 0, [240, 238, 232], false);
      b.addBox(cx + 29.2, y0 + 6.0, cz, 0.45, 4.0, 3.2, 0, [240, 238, 232], false);

      // North curved grand access stairs (1915 Rothkegel design)
      for (const sign of [-1, 1]) {
        for (let s = 0; s < 6; s++) {
          const t = s / 5;
          const sx = cx + sign * (14 + t * 10);
          const sy = y0 + t * 12.0;
          b.addBox(sx, y0, cz - 13.5, 2.5, Math.max(0.8, sy - y0), 2.2, 0, [112, 115, 120], false);
          b.addBox(sx, sy, cz - 13.5, 2.5, 0.25, 2.2, 0, [220, 218, 212], false);
        }
      }

      // 2. Arrow Tower Structure ("前楼后厦" 凸字形复合结构)
      // Main South Tower Block (前主楼: width 52m, depth 16m, height 15.5m)
      b.addBox(cx, y0 + 12.0, cz + 3.5, 52, 15.5, 16, 0, [112, 116, 122], false);

      // North Protruding Extension (北出抱厦: width 38m, depth 10m, height 11.5m)
      b.addBox(cx, y0 + 12.0, cz - 8.5, 38, 11.5, 10, 0, [112, 116, 122], false);
      // North entrance door & windows facing Qianmen Gatehouse
      b.addBox(cx, y0 + 12.0, cz - 13.6, 4.2, 5.6, 0.25, 0, [152, 38, 32], false);
      b.addBox(cx - 8, y0 + 13.5, cz - 13.6, 2.8, 3.4, 0.25, 0, [255, 215, 120], true);
      b.addBox(cx + 8, y0 + 13.5, cz - 13.6, 2.8, 3.4, 0.25, 0, [255, 215, 120], true);

      // 3. Arrow Slits / Embrasures (箭窗 / 炮窗: 84 slits with white frames & arched canopies)
      // South Facade: 4 tiers × 13 columns = 52 arrow slits
      for (let r = 0; r < 4; r++) {
        const wy = y0 + 14.0 + r * 3.3;
        for (let c = 0; c < 13; c++) {
          const wx = cx - 22.8 + c * 3.8;
          // White stone frame (protruding slightly in front of wall at cz + 11.5)
          b.addBox(wx, wy, cz + 11.6, 1.5, 1.7, 0.35, 0, [238, 238, 236], false);
          // 1915 German-style arched eyebrow canopy
          b.addBox(wx, wy + 0.9, cz + 11.75, 1.7, 0.35, 0.45, 0, [246, 244, 240], false);
          // Night-illuminated window slit
          const isLit = (r + c) % 2 === 0;
          b.addBox(wx, wy, cz + 11.65, 0.95, 1.15, 0.25, 0, isLit ? [255, 210, 115] : [240, 180, 85], true);
        }
      }

      // East & West Facades: 4 tiers × 4 columns = 32 arrow slits
      for (let r = 0; r < 4; r++) {
        const wy = y0 + 14.0 + r * 3.3;
        for (let c = 0; c < 4; c++) {
          const wz = cz + 3.5 - 5.1 + c * 3.4;
          // East face (protruding slightly from wall at cx + 26.0)
          b.addBox(cx + 26.1, wy, wz, 0.35, 1.7, 1.5, 0, [238, 238, 236], false);
          b.addBox(cx + 26.25, wy + 0.9, wz, 0.45, 0.35, 1.7, 0, [246, 244, 240], false);
          b.addBox(cx + 26.15, wy, wz, 0.25, 1.15, 0.95, 0, [255, 210, 115], true);

          // West face (protruding slightly from wall at cx - 26.0)
          b.addBox(cx - 26.1, wy, wz, 0.35, 1.7, 1.5, 0, [238, 238, 236], false);
          b.addBox(cx - 26.25, wy + 0.9, wz, 0.45, 0.35, 1.7, 0, [246, 244, 240], false);
          b.addBox(cx - 26.15, wy, wz, 0.25, 1.15, 0.95, 0, [255, 210, 115], true);
        }
      }

      // 4. Roof Architecture:
      // North 抱厦 Hip-and-Gable Roof
      b.addChineseRoof(
        cx, y0 + 23.5, cz - 8.5,
        40, 12,
        4.5, 1.8,
        0,
        [72, 75, 78],
        [46, 138, 88],
        [46, 138, 88]
      );

      // Main South Tower Lower Eave Skirt
      b.addChineseRoof(
        cx, y0 + 26.0, cz + 3.5,
        54, 18,
        3.5, 2.2,
        0,
        [72, 75, 78],
        [46, 138, 88],
        [46, 138, 88]
      );

      // Main South Tower Upper Clerestory & Grand Double-Eave Hip-and-Gable Roof
      b.addBox(cx, y0 + 27.5, cz + 3.5, 44, 2.5, 13, 0, [158, 42, 36], false);
      b.addChineseRoof(
        cx, y0 + 29.5, cz + 3.5,
        48, 15,
        8.5, 2.8,
        0,
        [72, 75, 78],  // Grey cylinder tiles
        [46, 138, 88], // Emerald green glazed trim
        [246, 198, 68] // Golden owl-tail finials (鸱吻)
      );
    },
  },

  // =========================================================================
  // 4. 故宫午门 (Meridian Gate / Wumen)
  // =========================================================================
  {
    id: 'wumen',
    nameZh: '午门',
    nameEn: 'Meridian Gate (Wumen)',
    cx: -552,
    cz: -410,
    exclR: 95,
    height: 38,
    osmIds: [8849989, 40168672],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. White marble Sumeru plinth at base (grounded at y0)
      b.addBox(cx, y0, cz - 14, 130, 0.8, 40, 0, [240, 238, 232], false);
      b.addBox(cx + 49, y0, cz + 19, 30, 0.8, 68, 0, [240, 238, 232], false);
      b.addBox(cx - 49, y0, cz + 19, 30, 0.8, 68, 0, [240, 238, 232], false);

      // 2. U-shaped ("凹"字形) Crimson Fortress Bastion (y0 + 0.8m .. 12.0m)
      // Central Bastion Wall (north wall of courtyard)
      b.addFrustumBox(cx, y0 + 0.8, cz - 14, 128, 38, 124, 34, 11.2, 0, [168, 38, 32], false);

      // East Projecting Wing Bastion (东雁翅楼城台: extending south)
      b.addFrustumBox(cx + 49, y0 + 0.8, cz + 19, 28, 66, 26, 64, 11.2, 0, [168, 38, 32], false);

      // West Projecting Wing Bastion (西雁翅楼城台: extending south)
      b.addFrustumBox(cx - 49, y0 + 0.8, cz + 19, 28, 66, 26, 64, 11.2, 0, [168, 38, 32], false);

      // 3. Five Portals ("明三暗五" 五门券洞: authentic stone voussoirs on battered wall)
      const portals = [
        { dx: 0, w: 5.4, h: 8.5 },      // Central Imperial Portal (御道正门)
        { dx: -12.0, w: 4.4, h: 7.4 },  // West Portal (宗室王公券门)
        { dx: 12.0, w: 4.4, h: 7.4 },   // East Portal (文武官员券门)
      ];

      for (const p of portals) {
        addBatteredArchPortal(
          b,
          cx + p.dx, y0, cz - 14,
          p.w, p.h,
          y0 + 0.8, 11.2,
          38, 34,
          [238, 235, 228],
          [24, 20, 20],
          true,
          2.4
        );
      }

      // Wing Flank Hidden Side Gates (东西暗门 / 左右掖门: facing inside the U-courtyard)
      for (const [wingX, sign] of [[cx + 36.1, 1], [cx - 36.1, -1]]) {
        // Courtyard inner face is at cx ± 36.0, door placed flush on that wall
        b.addBox(wingX, y0, cz + 4, 0.35, 5.8, 4.4, 0, [238, 235, 228], false);
        b.addBox(wingX - sign * 0.1, y0, cz + 4, 0.25, 5.4, 3.6, 0, [24, 20, 20], false);
        b.addBox(wingX - sign * 0.15, y0, cz + 4, 0.2, 5.2, 3.4, 0, [152, 32, 28], false);
      }

      // 4. White Marble Balustrades along entire U-shaped rampart top (y = 12.0m)
      // Granite floor
      b.addBox(cx, y0 + 12.0, cz - 14, 124, 0.2, 34, 0, [150, 146, 140], false);
      b.addBox(cx + 49, y0 + 12.0, cz + 19, 26, 0.2, 64, 0, [150, 146, 140], false);
      b.addBox(cx - 49, y0 + 12.0, cz + 19, 26, 0.2, 64, 0, [150, 146, 140], false);

      // Central wall balustrades
      b.addBox(cx, y0 + 12.0, cz - 30.5, 124, 1.2, 0.45, 0, [246, 244, 238], false);
      b.addBox(cx, y0 + 12.0, cz + 2.5, 72, 1.2, 0.45, 0, [246, 244, 238], false);
      // East wing balustrades
      b.addBox(cx + 36.2, y0 + 12.0, cz + 22, 0.45, 1.2, 39, 0, [246, 244, 238], false);
      b.addBox(cx + 61.8, y0 + 12.0, cz + 19, 0.45, 1.2, 64, 0, [246, 244, 238], false);
      b.addBox(cx + 49, y0 + 12.0, cz + 50.8, 26, 1.2, 0.45, 0, [246, 244, 238], false);
      // West wing balustrades
      b.addBox(cx - 36.2, y0 + 12.0, cz + 22, 0.45, 1.2, 39, 0, [246, 244, 238], false);
      b.addBox(cx - 61.8, y0 + 12.0, cz + 19, 0.45, 1.2, 64, 0, [246, 244, 238], false);
      b.addBox(cx - 49, y0 + 12.0, cz + 50.8, 26, 1.2, 0.45, 0, [246, 244, 238], false);

      // Warm floodlight perimeter lines along rampart top
      b.addBox(cx, y0 + 11.8, cz - 14, 124.5, 0.25, 34.5, 0, [255, 205, 110], true);
      b.addBox(cx + 49, y0 + 11.8, cz + 19, 26.5, 0.25, 64.5, 0, [255, 205, 110], true);
      b.addBox(cx - 49, y0 + 11.8, cz + 19, 26.5, 0.25, 64.5, 0, [255, 205, 110], true);

      // 5. Five-Phoenix Tower (五凤楼): Central 9-Bay Grand Throne Hall (正楼: 重檐庑殿顶)
      // Raised white marble hall podium
      b.addBox(cx, y0 + 12.0, cz - 14, 64, 1.5, 26, 0, [242, 239, 232], false);

      // Central hall reaches 38m total height (12.0 rampart + 1.5 podium + 8.5 wall + 15.0 roof + 1.0 finials = ~38m)
      b.addImperialPalace(
        cx, y0 + 13.5, cz - 14,
        60, 24,
        0, 0,
        8.5, 14.8,
        0,
        [236, 178, 36], // Imperial yellow glazed tiles
        [168, 38, 32],  // Crimson walls
        [242, 239, 232],
        true
      );

      // Eight Grand Palace Lanterns hung under front lower eave of central hall
      for (let i = 0; i < 8; i++) {
        const lx = cx - 24.5 + i * 7.0;
        b.addBox(lx, y0 + 18.5, cz - 1.2, 1.2, 1.6, 1.2, 0, [255, 38, 32], true);
        b.addBox(lx, y0 + 17.6, cz - 1.2, 0.35, 0.7, 0.35, 0, [255, 205, 50], true);
      }

      // 6. Four Square Double-Eave Corner Pavilions (四座重檐方亭 / 崇楼: 13m × 13m)
      // East Inner Corner, West Inner Corner, East Wing-Tip, West Wing-Tip
      const pavilions = [
        [cx + 49, cz - 12], // East Inner Corner Pavilion
        [cx - 49, cz - 12], // West Inner Corner Pavilion
        [cx + 49, cz + 48], // East Wing-Tip Pavilion
        [cx - 49, cz + 48], // West Wing-Tip Pavilion
      ];

      for (const [px, pz] of pavilions) {
        // Square vermilion pavilion hall body (prominent 13m × 13m tower)
        b.addBox(px, y0 + 12.0, pz, 13, 6.5, 13, 0, [168, 38, 32], false);

        // 4 Corner columns
        for (const sx of [-5.8, 5.8]) {
          for (const sz of [-5.8, 5.8]) {
            b.addCylinder(px + sx, y0 + 12.0, pz + sz, 0.5, 0.45, 6.5, 8, 0, [186, 46, 38], false);
          }
        }

        // Glowing lattice windows on cardinal faces
        b.addBox(px, y0 + 13.8, pz + 6.35, 6.0, 3.6, 0.25, 0, [255, 215, 120], true);
        b.addBox(px, y0 + 13.8, pz - 6.35, 6.0, 3.6, 0.25, 0, [255, 215, 120], true);
        b.addBox(px + 6.35, y0 + 13.8, pz, 0.25, 3.6, 6.0, 0, [255, 215, 120], true);
        b.addBox(px - 6.35, y0 + 13.8, pz, 0.25, 3.6, 6.0, 0, [255, 215, 120], true);

        // Double-Eave Pyramidal Square Roof (重檐攒尖顶)
        // Lower square eave skirt
        b.addChineseRoof(
          px, y0 + 18.5, pz,
          15.5, 15.5,
          2.8, 2.0,
          0,
          [236, 178, 36],
          [236, 178, 36],
          [236, 178, 36]
        );
        // Upper square pyramid roof
        b.addChineseRoof(
          px, y0 + 21.3, pz,
          12.5, 12.5,
          5.6, 1.8,
          0,
          [236, 178, 36],
          [236, 178, 36],
          [250, 210, 72]
        );
        // Gilded bronze ball finial (鎏金宝顶)
        b.addCylinder(px, y0 + 27.2, pz, 0.85, 0.1, 1.6, 8, 0, [250, 210, 72], true);
      }

      // 7. East & West Wing Palatial Covered Galleries (雁翅楼十三间长房)
      // Connect inner corner pavilions (cz - 12) to wing-tip pavilions (cz + 48)
      // Width 10m is clearly narrower than 13m corner pavilions, creating an authentic stepped silhouette!
      for (const [wingX, sign] of [[cx + 49, 1], [cx - 49, -1]]) {
        // Vermilion gallery hall body (cz - 4 .. cz + 40, length 44m)
        b.addBox(wingX, y0 + 12.0, cz + 18, 10, 6.0, 44, 0, [168, 38, 32], false);

        // 13 bays of columns and glowing palace lattice windows along gallery length
        for (let bIdx = 0; bIdx <= 12; bIdx++) {
          const pz = cz - 3 + bIdx * (42 / 12);
          for (const xSign of [-1, 1]) {
            b.addCylinder(wingX + xSign * 4.8, y0 + 12.0, pz, 0.4, 0.36, 6.0, 8, 0, [186, 46, 38], false);
          }
          if (bIdx < 12) {
            const wz = pz + 42 / 24;
            // Glowing courtyard-facing windows
            b.addBox(wingX - sign * 4.9, y0 + 13.5, wz, 0.25, 3.2, 2.6, 0, [255, 215, 120], true);
          }
        }

        // Continuous yellow glazed tile gable roof over long gallery
        b.addChineseRoof(
          wingX, y0 + 18.0, cz + 18,
          10.5, 44,
          4.2, 1.8,
          0,
          [236, 178, 36],
          [236, 178, 36],
          [248, 206, 74]
        );
      }
    },
  },
];
