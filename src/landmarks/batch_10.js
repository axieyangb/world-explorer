/**
 * Beijing Explorer - Landmark Batch 10 (BATCH_10)
 * 
 * 1. national_museum_of_china (中国国家博物馆)
 * 2. central_radio_tv_tower (中央广播电视塔)
 * 3. military_museum (中国人民革命军事博物馆)
 * 4. beijing_south_railway_station (北京南站)
 */

// Architectural palette (0..255 RGB)
const CREAM_STONE = [236, 230, 218];
const GRANITE_PODIUM = [186, 182, 174];
const COLONNADE_COL = [245, 242, 234];
const GLAZED_GREEN = [46, 114, 80];
const GLAZED_GOLD = [244, 196, 60];
const VERMILION_RED = [176, 42, 38];
const MARBLE_WHITE = [244, 242, 236];
const TOWER_CONCRETE = [218, 222, 228];
const BRONZE_EXPANSION = [136, 112, 86];
const STEEL_SILVER = [196, 204, 214];
const STEEL_DARK = [116, 126, 138];
const GLASS_AZURE = [56, 88, 122];
const GLASS_CYAN = [78, 168, 212];
const WARM_LIGHT = [255, 220, 136];
const COOL_LIGHT = [180, 232, 255];
const BEACON_RED = [255, 40, 40];
const BEACON_WHITE = [255, 255, 255];
const RED_STAR = [255, 45, 45];
const COBALT_BLUE = [32, 78, 168];
const ROOF_GREY = [148, 154, 162];

export const BATCH_10 = [
  // 1. National Museum of China (中国国家博物馆)
  {
    id: 'national_museum_of_china',
    nameZh: '中国国家博物馆',
    nameEn: 'National Museum of China',
    cx: -146,
    cz: 552,
    exclR: 210,
    height: 43,
    osmIds: [8607825, 24822583],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Monumental Stepped Granite Podium & White Marble Stylobate (0..4.6m)
      b.addBox(cx, y0, cz, 155, 3.2, 319, 0, GRANITE_PODIUM, false);
      b.addBox(cx, y0 + 3.2, cz, 151, 1.4, 315, 0, MARBLE_WHITE, false);

      // Grand ceremonial cascading staircase on West facade facing Tiananmen Square (-X direction)
      const stairZ0 = cz - 66, stairZ1 = cz + 66, stairLen = stairZ1 - stairZ0;
      b.addBox(cx - 79.5, y0, cz, 8.0, 1.2, stairLen + 8.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx - 77.5, y0 + 1.2, cz, 6.0, 1.2, stairLen + 4.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx - 75.5, y0 + 2.4, cz, 4.0, 1.1, stairLen + 2.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx - 74.0, y0 + 3.5, cz, 3.0, 1.1, stairLen, 0, MARBLE_WHITE, false);

      // Flanking architectural cheek walls bounding the grand staircase
      b.addBox(cx - 78, y0, cz - 71, 11, 4.8, 3.5, 0, GRANITE_PODIUM, false);
      b.addBox(cx - 78, y0, cz + 71, 11, 4.8, 3.5, 0, GRANITE_PODIUM, false);

      // Central ceremonial red carpet ascending to the Grand West Portal
      b.addBox(cx - 78, y0 + 4.62, cz, 12, 0.08, 16, 0, [192, 45, 40], false);

      // 2. West Historic Monumental Facade (1959 Wing with 24-Column Grand Portico)
      const porticoX = cx - 58;

      // 24 colossal fluted square colonnade columns (cream granite)
      const colZMin = cz - 57.5, colZMax = cz + 57.5;
      for (let c = 0; c < 24; c++) {
        const pz = colZMin + c * ((colZMax - colZMin) / 23);
        b.addBox(porticoX - 10.0, y0 + 4.6, pz, 1.9, 28.2, 1.9, 0, COLONNADE_COL, false);
        // Column base plinth & capital abacus
        b.addBox(porticoX - 10.0, y0 + 4.6, pz, 2.5, 0.9, 2.5, 0, MARBLE_WHITE, false);
        b.addBox(porticoX - 10.0, y0 + 32.0, pz, 2.4, 0.8, 2.4, 0, CREAM_STONE, false);
      }

      // Recessed grand colonnade ambulatory & bronze entrance wall
      b.addBox(porticoX + 3.0, y0 + 4.6, cz, 8.0, 28.2, 118, 0, BRONZE_EXPANSION, false);

      // 3 Monumental bronze portals with gilded architrave lintels
      for (const dz of [-28, 0, 28]) {
        b.addBox(porticoX - 1.2, y0 + 4.6, cz + dz, 0.8, 12.0, 14.0, 0, [42, 34, 28], false);
        b.addBox(porticoX - 1.3, y0 + 16.0, cz + dz, 0.7, 1.2, 14.4, 0, GLAZED_GOLD, true);
        b.addBox(porticoX - 1.3, y0 + 5.0, cz + dz, 0.4, 10.0, 12.0, 0, WARM_LIGHT, true);
      }

      // Gilded calligraphy Museum Emblem / Inscription Plaque ("中国国家博物馆")
      b.addBox(porticoX - 1.3, y0 + 25.5, cz, 0.6, 4.5, 20.0, 0, GLAZED_GOLD, true);

      // Warm golden ambulatory lighting along floor and coffered ceiling
      b.addBox(porticoX - 4.0, y0 + 4.7, cz, 11.0, 0.2, 116, 0, WARM_LIGHT, true);
      b.addBox(porticoX - 4.0, y0 + 32.6, cz, 11.0, 0.2, 116, 0, WARM_LIGHT, true);

      // Classical Portico Entablature: cream stone frieze + green glazed tile cornice + golden eave trim
      b.addBox(porticoX - 4.0, y0 + 32.8, cz, 16.0, 2.8, 122, 0, CREAM_STONE, false);
      b.addBox(porticoX - 4.5, y0 + 35.6, cz, 17.5, 1.2, 124, 0, GLAZED_GREEN, false);
      // Golden cornice edge trims
      b.addBox(porticoX - 13.5, y0 + 36.6, cz, 1.5, 0.6, 125, 0, GLAZED_GOLD, true);
      b.addBox(porticoX - 4.5, y0 + 36.6, cz - 62.0, 17.5, 0.6, 1.5, 0, GLAZED_GOLD, true);
      b.addBox(porticoX - 4.5, y0 + 36.6, cz + 62.0, 17.5, 0.6, 1.5, 0, GLAZED_GOLD, true);
      // Realistic portico roof deck (paved grey stone)
      b.addBox(porticoX - 4.0, y0 + 36.8, cz, 15.0, 0.1, 121, 0, ROOF_GREY, false);

      // 3. North & South Historic Wings connecting to West Facade
      // North-West connector wing
      b.addClassicalColonnadeWing(cx - 50, y0 + 4.6, cz - 105, 34, 33.4, 86, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GREEN, WARM_LIGHT, 6, 14);
      b.addBox(cx - 50, y0 + 38.05, cz - 105, 33.0, 0.1, 85.0, 0, ROOF_GREY, false);

      // South-West connector wing
      b.addClassicalColonnadeWing(cx - 50, y0 + 4.6, cz + 105, 34, 33.4, 86, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GREEN, WARM_LIGHT, 6, 14);
      b.addBox(cx - 50, y0 + 38.05, cz + 105, 33.0, 0.1, 85.0, 0, ROOF_GREY, false);

      // North outer wing (facing Chang'an Avenue)
      b.addClassicalColonnadeWing(cx + 12, y0 + 4.6, cz - 138, 110, 33.4, 32, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GREEN, WARM_LIGHT, 18, 5);
      b.addBox(cx + 12, y0 + 38.05, cz - 138, 109.0, 0.1, 31.0, 0, ROOF_GREY, false);
      // North entrance steps and portal (Chang'an Ave entrance)
      b.addBox(cx + 12, y0, cz - 156.5, 32, 2.2, 5.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx + 12, y0 + 4.6, cz - 154.2, 14, 9.0, 1.0, 0, [42, 34, 28], false);

      // South outer wing (facing Qianmen East Street)
      b.addClassicalColonnadeWing(cx + 12, y0 + 4.6, cz + 138, 110, 33.4, 32, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GREEN, WARM_LIGHT, 18, 5);
      b.addBox(cx + 12, y0 + 38.05, cz + 138, 109.0, 0.1, 31.0, 0, ROOF_GREY, false);
      // South entrance steps and portal
      b.addBox(cx + 12, y0, cz + 156.5, 32, 2.2, 5.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx + 12, y0 + 4.6, cz + 154.2, 14, 9.0, 1.0, 0, [42, 34, 28], false);

      // East facade wing enclosing the complex
      b.addClassicalColonnadeWing(cx + 62, y0 + 4.6, cz, 24, 33.4, 244, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GREEN, WARM_LIGHT, 4, 36);
      b.addBox(cx + 62, y0 + 38.05, cz, 23.0, 0.1, 243.0, 0, ROOF_GREY, false);

      // 4. Central Modern Expansion Hall & Grand Corridor (gmp Architekten)
      b.addCurtainWallBox(cx + 8, y0 + 4.6, cz, 82, 34.4, 224, 0, BRONZE_EXPANSION, GLASS_AZURE, WARM_LIGHT, COOL_LIGHT, 4.2, 5.2, 0.52, 101);
      // Main central roof deck
      b.addBox(cx + 8, y0 + 39.0, cz, 80, 0.2, 222, 0, ROOF_GREY, false);

      // Rooftop Lantern Courts / Skylight Atriums (rising to 42.5m)
      for (const dz of [-56, 56]) {
        b.addCurtainWallBox(cx + 8, y0 + 39.0, cz + dz, 66, 3.2, 76, 0, STEEL_SILVER, GLASS_CYAN, WARM_LIGHT, COOL_LIGHT, 3.2, 4.5, 0.85, dz < 0 ? 102 : 103);
        b.addBox(cx + 8, y0 + 42.2, cz + dz, 68, 0.4, 78, 0, STEEL_DARK, false);
        // Translucent glazed atrium skylight roof
        b.addBox(cx + 8, y0 + 42.6, cz + dz, 64, 0.2, 74, 0, GLASS_CYAN, true);
      }

      // 4 Glazed green tile hipped roofs on the historic corner pavilions
      for (const [px, pz] of [
        [cx - 50, cz - 138],
        [cx - 50, cz + 138],
        [cx + 62, cz - 138],
        [cx + 62, cz + 138],
      ]) {
        b.addChineseRoof(px, y0 + 38.2, pz, 28, 28, 4.6, 2.2, 0, GLAZED_GREEN, GLAZED_GREEN, GLAZED_GOLD);
      }
    },
  },

  // 2. Central Radio & TV Tower (中央广播电视塔)
  {
    id: 'central_radio_tv_tower',
    nameZh: '中央广播电视塔',
    nameEn: 'Central Radio & TV Tower',
    cx: -8298,
    cz: -1051,
    exclR: 110,
    height: 405,
    osmIds: [403383764, 130222170],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Chinese Palace-Style Base Terraces (0..22m)
      b.addCylinder(cx, y0, cz, 56, 54, 4.2, 8, Math.PI / 8, MARBLE_WHITE, false);

      // 4 Axial grand stairways connecting ground to terrace
      for (const [dx, dz] of [[56, 0], [-56, 0], [0, 56], [0, -56]]) {
        const isX = Math.abs(dx) > 0;
        b.addFrustumBox(
          cx + dx * 0.96, y0, cz + dz * 0.96,
          isX ? 12 : 20, isX ? 20 : 12,
          isX ? 8 : 16, isX ? 16 : 8,
          4.2, 0, MARBLE_WHITE, false
        );
      }
      b.addCylinder(cx, y0 + 4.2, cz, 46, 44, 4.5, 8, Math.PI / 8, MARBLE_WHITE, false);
      b.addCylinder(cx, y0 + 8.7, cz, 38, 36, 4.5, 8, Math.PI / 8, MARBLE_WHITE, false);

      // Octagonal Vermilion Palace Hall (22m..52m)
      b.addCylinder(cx, y0 + 13.2, cz, 28, 27, 14.0, 8, Math.PI / 8, VERMILION_RED, false);
      // 16 Vermilion colonnade columns around hall perimeter
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const px = cx + Math.cos(ang) * 27.5;
        const pz = cz + Math.sin(ang) * 27.5;
        b.addCylinder(px, y0 + 13.2, pz, 0.75, 0.75, 14.0, 8, 0, VERMILION_RED, false);
      }
      // Glowing golden palace window band
      b.addCylinder(cx, y0 + 17.5, cz, 27.8, 27.8, 6.5, 8, Math.PI / 8, WARM_LIGHT, true, false);

      // Lower curved cobalt blue eave skirt + gold trim (y=27.2..32m)
      b.addCylinder(cx, y0 + 27.2, cz, 34, 27, 4.8, 8, Math.PI / 8, COBALT_BLUE, false);
      b.addCylinder(cx, y0 + 27.2, cz, 34.8, 34.0, 0.9, 8, Math.PI / 8, GLAZED_GOLD, true);

      // Upper clerestory drum & upper curved roof (y=32..52m)
      b.addCylinder(cx, y0 + 32.0, cz, 24, 22, 7.5, 8, Math.PI / 8, VERMILION_RED, false);
      b.addCylinder(cx, y0 + 39.5, cz, 29, 16, 8.5, 8, Math.PI / 8, COBALT_BLUE, false);
      b.addCylinder(cx, y0 + 39.5, cz, 29.8, 29.0, 1.0, 8, Math.PI / 8, GLAZED_GOLD, true);
      b.addCylinder(cx, y0 + 48.0, cz, 16, 14, 4.0, 8, Math.PI / 8, MARBLE_WHITE, false);

      // 2. Tapering Concrete Tower Shaft (52m..215m, r = 13.5m -> 5.2m)
      const shaftSegments = [
        { y0: 52, y1: 80, r0: 13.5, r1: 11.6 },
        { y0: 80, y1: 115, r0: 11.6, r1: 9.6 },
        { y0: 115, y1: 150, r0: 9.6, r1: 7.8 },
        { y0: 150, y1: 185, r0: 7.8, r1: 6.4 },
        { y0: 185, y1: 215, r0: 6.4, r1: 5.2 },
      ];
      for (const seg of shaftSegments) {
        const sy = seg.y1 - seg.y0;
        b.addCylinder(cx, y0 + seg.y0, cz, seg.r0, seg.r1, sy, 24, 0, TOWER_CONCRETE, false);
      }

      // 3 Prominent Vertical Elevator Shaft Spine Ribs (spaced 120° apart)
      // Housing high-speed observation lifts, running from y0+52 to y0+215
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const ang = (rIdx / 3) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        for (const seg of shaftSegments) {
          const sy = seg.y1 - seg.y0;
          const p1x = cx + cosA * (seg.r0 + 0.5), p1z = cz + sinA * (seg.r0 + 0.5);
          const p2x = cx + cosA * (seg.r1 + 0.5), p2z = cz + sinA * (seg.r1 + 0.5);
          // Concrete elevator spine rib
          b.addStrut(p1x, y0 + seg.y0, p1z, p2x, y0 + seg.y1, p2z, 1.8, STEEL_SILVER, false);
          // Illuminated glass elevator shaft viewing strip
          b.addStrut(p1x + cosA * 0.4, y0 + seg.y0, p1z + sinA * 0.4, p2x + cosA * 0.4, y0 + seg.y1, p2z + sinA * 0.4, 0.7, WARM_LIGHT, true);
        }
      }

      // Mid-height maintenance observation rings
      b.addCylinder(cx, y0 + 115, cz, 10.4, 10.4, 1.4, 20, 0, STEEL_DARK, false);
      b.addCylinder(cx, y0 + 115.4, cz, 10.5, 10.5, 0.4, 20, 0, WARM_LIGHT, true);
      b.addCylinder(cx, y0 + 175, cz, 7.2, 7.2, 1.4, 20, 0, STEEL_DARK, false);
      b.addCylinder(cx, y0 + 175.4, cz, 7.3, 7.3, 0.4, 20, 0, WARM_LIGHT, true);

      // 3. Iconic Chinese Palace Lantern Skypod (215m..252m)
      // Underside cantilever bracket flare (215m..221m, r: 5.2m -> 17.5m)
      b.addCylinder(cx, y0 + 215, cz, 5.2, 17.5, 6.0, 24, 0, VERMILION_RED, false);
      // 16 Gilded radiating cantilever bracket struts
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const bx = cx + Math.cos(ang) * 5.2, bz = cz + Math.sin(ang) * 5.2;
        const tx = cx + Math.cos(ang) * 17.5, tz = cz + Math.sin(ang) * 17.5;
        b.addStrut(bx, y0 + 215, bz, tx, y0 + 221, tz, 0.65, GLAZED_GOLD, true);
      }

      // Revolving Restaurant Deck (221m..227m, r: 17.5m -> 23.2m)
      // Glowing warm golden panoramic glass band
      b.addCylinder(cx, y0 + 221, cz, 17.5, 23.2, 6.0, 32, 0, [255, 222, 130], true);
      b.addCylinder(cx, y0 + 226.4, cz, 23.4, 23.4, 0.8, 32, 0, GLAZED_GOLD, true);

      // Indoor Main Observation Hall (227m..234m, r: 23.2m -> 24.0m -> 23.0m)
      // Glowing cyan panoramic observation windows
      b.addCylinder(cx, y0 + 227, cz, 23.2, 24.0, 3.5, 32, 0, [130, 220, 255], true);
      b.addCylinder(cx, y0 + 230.5, cz, 24.0, 23.0, 3.5, 32, 0, [130, 220, 255], true);

      // Traditional Palace Lantern Gilded Vertical Ribs (12 radiating struts around window band)
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        b.addStrut(
          cx + cosA * 23.2, y0 + 221, cz + sinA * 23.2,
          cx + cosA * 23.0, y0 + 234, cz + sinA * 23.0,
          0.38, GLAZED_GOLD, true
        );
      }

      // Open-Air 360° Circular Observation Balcony at 238m (234m..239m)
      b.addCylinder(cx, y0 + 234, cz, 23.0, 21.8, 4.0, 32, 0, TOWER_CONCRETE, false);
      b.addCylinder(cx, y0 + 238, cz, 22.0, 22.0, 1.2, 32, 0, MARBLE_WHITE, false);
      b.addCylinder(cx, y0 + 237.8, cz, 22.1, 22.1, 0.4, 32, 0, [255, 210, 80], true);

      // Palace Lantern Crown Roof (239m..252m)
      // Lower curved cobalt blue eave skirt (239m..246m)
      b.addCylinder(cx, y0 + 239, cz, 21.8, 15.2, 7.0, 24, 0, COBALT_BLUE, false);
      b.addCylinder(cx, y0 + 245.4, cz, 15.6, 15.6, 0.8, 24, 0, GLAZED_GOLD, true);
      // Upper lantern crown dome (246m..252m)
      b.addCylinder(cx, y0 + 246, cz, 15.2, 8.5, 6.0, 24, 0, COBALT_BLUE, false);
      b.addCylinder(cx, y0 + 251.4, cz, 8.9, 8.9, 0.8, 24, 0, GLAZED_GOLD, true);

      // 4. Upper Microwave Relay Platforms (252m..278m)
      b.addCylinder(cx, y0 + 252, cz, 6.2, 5.0, 26.0, 16, 0, TOWER_CONCRETE, false);

      // Platform 1 (258m, r=13.0m) with 4 Parabolic Microwave Dishes
      b.addCylinder(cx, y0 + 258, cz, 13.0, 13.0, 1.6, 20, 0, STEEL_SILVER, false);
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2;
        const dx = Math.cos(ang) * 12.0, dz = Math.sin(ang) * 12.0;
        // Parabolic dish body
        b.addCylinder(cx + dx, y0 + 259.0, cz + dz, 2.2, 2.2, 2.5, 12, ang, MARBLE_WHITE, false);
        // Central dish feed horn strut
        b.addStrut(cx + dx, y0 + 260.25, cz + dz, cx + dx * 1.15, y0 + 260.25, cz + dz * 1.15, 0.35, STEEL_SILVER, false);
      }

      // Platform 2 (268m, r=11.0m) with Relay Equipment
      b.addCylinder(cx, y0 + 268, cz, 11.0, 11.0, 1.5, 20, 0, STEEL_SILVER, false);
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
        const dx = Math.cos(ang) * 10.0, dz = Math.sin(ang) * 10.0;
        b.addCylinder(cx + dx, y0 + 269.0, cz + dz, 1.6, 1.6, 2.2, 10, ang, MARBLE_WHITE, false);
      }

      // Platform 3 (276m, r=9.0m) Top Gallery
      b.addCylinder(cx, y0 + 276, cz, 9.0, 9.0, 1.4, 20, 0, STEEL_SILVER, false);

      // 5. Silver Steel Lattice Antenna Mast (278m..405m, 127m tall!)
      const mastSections = [
        { y0: 278, y1: 320, r0: 4.2, r1: 3.2 },
        { y0: 320, y1: 360, r0: 3.2, r1: 2.0 },
        { y0: 360, y1: 392, r0: 2.0, r1: 1.0 },
        { y0: 392, y1: 405, r0: 1.0, r1: 0.2 },
      ];
      for (const m of mastSections) {
        const my = m.y1 - m.y0;
        // Alternating red and white aviation markings
        const bands = Math.max(2, Math.round(my / 10));
        const dy = my / bands;
        for (let bIdx = 0; bIdx < bands; bIdx++) {
          const by0 = m.y0 + bIdx * dy;
          const t0 = bIdx / bands;
          const t1 = (bIdx + 1) / bands;
          const curR0 = m.r0 + (m.r1 - m.r0) * t0;
          const curR1 = m.r0 + (m.r1 - m.r0) * t1;
          const isRed = bIdx % 2 === 0;
          b.addCylinder(cx, y0 + by0, cz, curR0, curR1, dy, 12, Math.PI / 8, isRed ? BEACON_RED : BEACON_WHITE, false);
        }
      }

      // External structural steel lattice diagonals around antenna mast
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        b.addStrut(cx + cosA * 4.2, y0 + 278, cz + sinA * 4.2, cx + cosA * 2.0, y0 + 360, cz + sinA * 2.0, 0.45, STEEL_SILVER, false);
      }

      // High-Intensity Red & White Aviation Obstruction Beacons (emissive = true)
      for (const by of [280, 320, 360, 392]) {
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * Math.PI * 2;
          const bx = cx + Math.cos(ang) * 2.8, bz = cz + Math.sin(ang) * 2.8;
          b.addBox(bx, y0 + by, bz, 0.8, 0.8, 0.8, 0, BEACON_RED, true);
        }
      }
      // Top Pinnacle Aviation Beacon at 405m
      b.addBox(cx, y0 + 404.2, cz, 1.2, 1.2, 1.2, 0, BEACON_RED, true);
      b.addCylinder(cx, y0 + 404.8, cz, 0.4, 0.1, 1.2, 8, 0, BEACON_WHITE, true);
    },
  },

  // 3. Military Museum of the Chinese People's Revolution (中国人民革命军事博物馆)
  {
    id: 'military_museum',
    nameZh: '中国人民革命军事博物馆',
    nameEn: "Military Museum of the Chinese People's Revolution",
    cx: -6797,
    cz: 98,
    exclR: 135,
    height: 95,
    osmIds: [963097, 40168701],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Granite Podium & Grand Entrance Staircase (0..4.8m)
      b.addBox(cx, y0, cz, 168, 3.8, 115, 0, GRANITE_PODIUM, false);
      b.addBox(cx, y0 + 3.8, cz, 164, 1.0, 111, 0, MARBLE_WHITE, false);

      // Grand south ceremonial staircase facing Fuxing Road (+Z direction)
      // Multi-tiered stepped granite stairs cleanly integrated into the podium front
      b.addBox(cx, y0, cz + 61, 74, 1.6, 12, 0, GRANITE_PODIUM, false);
      b.addBox(cx, y0 + 1.6, cz + 59, 70, 1.6, 10, 0, GRANITE_PODIUM, false);
      b.addBox(cx, y0 + 3.2, cz + 57, 66, 1.6, 8, 0, MARBLE_WHITE, false);

      // Thin ceremonial red carpet treads climbing the staircase to the portal
      b.addBox(cx, y0 + 1.62, cz + 63.5, 18, 0.06, 5.0, 0, [192, 45, 40], false);
      b.addBox(cx, y0 + 3.22, cz + 60.5, 18, 0.06, 5.0, 0, [192, 45, 40], false);
      b.addBox(cx, y0 + 4.82, cz + 57.5, 18, 0.06, 5.0, 0, [192, 45, 40], false);
      b.addBox(cx, y0 + 4.82, cz + 44.0, 18, 0.06, 20.0, 0, [192, 45, 40], false);

      // Flanking monumental sculpture plinths at stair ends (Heroic military statuary groups)
      b.addBox(cx - 39, y0, cz + 61, 6.0, 5.2, 6.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx + 39, y0, cz + 61, 6.0, 5.2, 6.0, 0, GRANITE_PODIUM, false);
      b.addBox(cx - 39, y0 + 5.2, cz + 61, 4.5, 3.5, 4.5, 0, MARBLE_WHITE, false);
      b.addBox(cx + 39, y0 + 5.2, cz + 61, 4.5, 3.5, 4.5, 0, MARBLE_WHITE, false);

      // 2. Symmetrical East and West 4-Story Exhibition Wings (4.8m..32m)
      b.addClassicalColonnadeWing(cx - 56, y0 + 4.8, cz - 5, 52, 26.5, 84, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GOLD, WARM_LIGHT, 8, 12);
      b.addBox(cx - 56, y0 + 31.35, cz - 5, 51.0, 0.1, 83.0, 0, ROOF_GREY, false);

      b.addClassicalColonnadeWing(cx + 56, y0 + 4.8, cz - 5, 52, 26.5, 84, 0, CREAM_STONE, COLONNADE_COL, GLAZED_GOLD, WARM_LIGHT, 8, 12);
      b.addBox(cx + 56, y0 + 31.35, cz - 5, 51.0, 0.1, 83.0, 0, ROOF_GREY, false);

      // 3. Monumental Central Entrance Hall & Colonnade Portico (4.8m..32m)
      b.addBox(cx, y0 + 4.8, cz, 56, 26.5, 68, 0, CREAM_STONE, false);
      // 6 Colossal fluted entrance columns
      for (let c = 0; c < 6; c++) {
        const px = cx - 21.0 + c * (42.0 / 5);
        b.addCylinder(px, y0 + 4.8, cz + 34.5, 1.1, 1.0, 22.0, 12, 0, COLONNADE_COL, false);
      }
      // Grand entrance arched portal
      b.addBox(cx, y0 + 4.8, cz + 33.5, 16, 15, 2.5, 0, [42, 38, 36], false);
      // Gilded museum emblem and inscription plaque above portal
      b.addBox(cx, y0 + 22.0, cz + 34.5, 20, 2.4, 0.6, 0, GLAZED_GOLD, true);
      // Grand portico entablature & gold cornice
      b.addBox(cx, y0 + 26.8, cz + 34.0, 48, 4.5, 6.5, 0, CREAM_STONE, false);
      b.addBox(cx, y0 + 31.0, cz + 34.0, 50, 1.2, 7.5, 0, GLAZED_GOLD, true);

      // 4. Stepped 7-Tier Central Tower (32m..78m)
      // Tier 1 (32m..42m, 42x42m) + 4 corner decorative turrets
      b.addBox(cx, y0 + 32, cz, 42, 10, 42, 0, CREAM_STONE, false);
      for (const [tx, tz] of [[-19, -19], [19, -19], [19, 19], [-19, 19]]) {
        b.addBox(cx + tx, y0 + 32, cz + tz, 4.5, 13.5, 4.5, 0, CREAM_STONE, false);
        b.addCylinder(cx + tx, y0 + 45.5, cz + tz, 2.5, 0.4, 4.5, 8, 0, GLAZED_GOLD, true);
      }
      b.addBox(cx, y0 + 41.4, cz, 43.5, 1.0, 43.5, 0, GLAZED_GOLD, true);
      b.addBox(cx, y0 + 42.42, cz, 41.5, 0.1, 41.5, 0, ROOF_GREY, false);
      for (const [fSign, isZ] of [[1, true], [-1, true], [1, false], [-1, false]]) {
        const wx = isZ ? cx : cx + fSign * 21.1;
        const wz = isZ ? cz + fSign * 21.1 : cz;
        b.addBox(wx, y0 + 34, wz, isZ ? 24 : 0.4, 6.0, isZ ? 0.4 : 24, 0, WARM_LIGHT, true);
      }

      // Tier 2 (42m..50m, 34x34m)
      b.addBox(cx, y0 + 42, cz, 34, 8, 34, 0, CREAM_STONE, false);
      b.addBox(cx, y0 + 49.4, cz, 35.2, 0.9, 35.2, 0, GLAZED_GOLD, true);
      b.addBox(cx, y0 + 50.32, cz, 33.2, 0.1, 33.2, 0, ROOF_GREY, false);

      // Tier 3 (50m..58m, 27x27m)
      b.addBox(cx, y0 + 50, cz, 27, 8, 27, 0, CREAM_STONE, false);
      b.addBox(cx, y0 + 57.4, cz, 28.0, 0.8, 28.0, 0, GLAZED_GOLD, true);
      b.addBox(cx, y0 + 58.22, cz, 26.2, 0.1, 26.2, 0, ROOF_GREY, false);

      // Tier 4 (58m..65m, 21x21m colonnade gallery)
      b.addBox(cx, y0 + 58, cz, 21, 7, 21, 0, CREAM_STONE, false);
      b.addBox(cx, y0 + 64.4, cz, 22.0, 0.8, 22.0, 0, GLAZED_GOLD, true);
      b.addBox(cx, y0 + 65.22, cz, 20.4, 0.1, 20.4, 0, ROOF_GREY, false);

      // Tier 5 (65m..71m, 16m octagonal drum)
      b.addCylinder(cx, y0 + 65, cz, 8.5, 8.0, 6.0, 8, Math.PI / 8, CREAM_STONE, false);
      b.addCylinder(cx, y0 + 70.4, cz, 9.0, 9.0, 0.8, 8, Math.PI / 8, GLAZED_GOLD, true);

      // Tier 6 (71m..75m, 12m octagonal drum with glowing arched windows)
      b.addCylinder(cx, y0 + 71, cz, 6.5, 6.0, 4.0, 8, Math.PI / 8, CREAM_STONE, false);
      b.addCylinder(cx, y0 + 71.8, cz, 6.6, 6.6, 2.4, 8, Math.PI / 8, WARM_LIGHT, true, false);

      // Tier 7 (75m..78m, 9m octagonal spire base)
      b.addCylinder(cx, y0 + 75, cz, 5.0, 4.0, 3.0, 8, Math.PI / 8, GLAZED_GOLD, false);

      // 5. Gilded Spire & The Iconic "八一" Red Star Emblem (78m..94.7m)
      b.addCylinder(cx, y0 + 78, cz, 3.6, 0.8, 10.0, 8, 0, GLAZED_GOLD, true);
      // Spire decorative collar rings
      b.addCylinder(cx, y0 + 82, cz, 2.8, 2.8, 0.5, 8, 0, [255, 230, 95], true);
      b.addCylinder(cx, y0 + 86, cz, 1.8, 1.8, 0.4, 8, 0, [255, 230, 95], true);
      b.addCylinder(cx, y0 + 88, cz, 0.7, 0.4, 3.0, 8, 0, GLAZED_GOLD, true);

      // Colossal 6m-diameter "八一" Red Star Emblem (y0 + 91.5m, diameter = 6.0m)
      // Authentic 3D Five-Pointed Star geometry with front/back facets and golden rim
      const starY = y0 + 91.5;
      const R_out = 3.0; // Outer tip radius (6m diameter)
      const R_in = 1.15; // Inner valley radius
      const starThick = 0.35; // Half-thickness along Z

      // Compute 10 perimeter vertices (5 tips + 5 valleys) in the XY plane
      const starPts = [];
      for (let k = 0; k < 10; k++) {
        const ang = Math.PI / 2 + k * (Math.PI / 5);
        const r = k % 2 === 0 ? R_out : R_in;
        starPts.push([cx + Math.cos(ang) * r, starY + Math.sin(ang) * r]);
      }

      // Front faceted star face (+Z side)
      const apexZFront = cz + starThick + 0.15;
      for (let k = 0; k < 10; k++) {
        const p1 = starPts[k];
        const p2 = starPts[(k + 1) % 10];
        b.addTri(cx, starY, apexZFront, p1[0], p1[1], cz + starThick, p2[0], p2[1], cz + starThick, RED_STAR, true);
      }

      // Back faceted star face (-Z side)
      const apexZBack = cz - starThick - 0.15;
      for (let k = 0; k < 10; k++) {
        const p1 = starPts[k];
        const p2 = starPts[(k + 1) % 10];
        b.addTri(cx, starY, apexZBack, p2[0], p2[1], cz - starThick, p1[0], p1[1], cz - starThick, RED_STAR, true);
      }

      // Perimeter side quads joining front and back star faces
      for (let k = 0; k < 10; k++) {
        const p1 = starPts[k];
        const p2 = starPts[(k + 1) % 10];
        b.addQuad(
          p1[0], p1[1], cz + starThick,
          p2[0], p2[1], cz + starThick,
          p2[0], p2[1], cz - starThick,
          p1[0], p1[1], cz - starThick,
          GLAZED_GOLD, true
        );
      }

      // Golden "八一" Calligraphy Insignia on front (+Z) and back (-Z) star centers
      for (const zSign of [1, -1]) {
        const zPos = cz + zSign * (starThick + 0.22);
        // Chinese character "八"
        b.addStrut(cx - 0.15, starY + 0.6, zPos, cx - 0.75, starY - 0.35, zPos, 0.22, GLAZED_GOLD, true);
        b.addStrut(cx + 0.15, starY + 0.6, zPos, cx + 0.75, starY - 0.35, zPos, 0.22, GLAZED_GOLD, true);
        // Chinese character "一"
        b.addStrut(cx - 0.75, starY - 0.85, zPos, cx + 0.75, starY - 0.85, zPos, 0.22, GLAZED_GOLD, true);
      }

      // Needle pinnacle tip reaching 95.0m
      b.addCylinder(cx, y0 + 94.2, cz, 0.22, 0.04, 0.8, 6, 0, GLAZED_GOLD, true);
    },
  },

  // 4. Beijing South Railway Station (北京南站)
  {
    id: 'beijing_south_railway_station',
    nameZh: '北京南站',
    nameEn: 'Beijing South Railway Station',
    cx: -2106,
    cz: 5003,
    exclR: 230,
    height: 42,
    osmIds: [43045237, 44306088],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // 1. Ground Concourse / Plinth & Rail Platforms (0..12m)
      b.addCurtainWallBox(cx, y0, cz, 280, 10.0, 200, 0, STEEL_DARK, GLASS_AZURE, WARM_LIGHT, COOL_LIGHT, 5.0, 6.0, 0.62, 201);

      // North & South elevated passenger drop-off viaducts with supporting bridge piers
      for (const zBridge of [cz - 110, cz + 110]) {
        // Viaduct roadway slab
        b.addBox(cx, y0 + 6.0, zBridge, 240, 2.0, 24, 0, GRANITE_PODIUM, false);
        // Solid supporting concrete bridge piers connecting viaduct to ground
        for (const dx of [-95, -55, -15, 15, 55, 95]) {
          b.addBox(cx + dx, y0, zBridge, 5.0, 6.0, 10.0, 0, GRANITE_PODIUM, false);
        }
        // Viaduct approach ramps at both ends
        b.addFrustumBox(cx - 128, y0, zBridge, 16, 22, 16, 20, 6.0, 0, GRANITE_PODIUM, false);
        b.addFrustumBox(cx + 128, y0, zBridge, 16, 22, 16, 20, 6.0, 0, GRANITE_PODIUM, false);
      }

      // Perimeter V-shaped slanted steel support struts around canopy edge
      const nVCols = 32;
      for (let i = 0; i < nVCols; i++) {
        const ang = (i / nVCols) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const bx0 = cx + cosA * 135, bz0 = cz + sinA * 95;
        const tx0 = cx + cosA * 158, tz0 = cz + sinA * 118;
        b.addStrut(bx0, y0 + 10.0, bz0, tx0, y0 + 17.0, tz0, 0.85, STEEL_SILVER, false);
      }

      // 2. Sweeping Lower Elliptical Roof Canopy (12m..25m, rx=160m, rz=120m)
      // Lower overhang eave skirt
      b.addEllipticalSlice(cx, y0 + 15.5, cz, 162, 122, 158, 118, 1.5, 36, 0, STEEL_SILVER, false, false);
      // Main lower roof slope (metallic silver-grey)
      b.addEllipticalSlice(cx, y0 + 17.0, cz, 158, 118, 126, 94, 8.0, 36, 0, [196, 204, 214], false, true);
      // Glowing warm under-eave light ribbon
      b.addEllipticalSlice(cx, y0 + 15.2, cz, 160, 120, 158, 118, 0.5, 36, 0, WARM_LIGHT, true, false);

      // 3. Middle Clerestory Tier & Waiting Concourse Ribbon (25m..34m, rx=125m, rz=93m)
      b.addEllipticalRibbonSlice(cx, y0 + 24.5, cz, 125, 93, 123, 91, 4.0, 36, 0, STEEL_SILVER, GLASS_AZURE, WARM_LIGHT, 0.85, 202, false);
      // Middle roof tier slope
      b.addEllipticalSlice(cx, y0 + 28.5, cz, 123, 91, 82, 58, 5.5, 36, 0, [204, 212, 222], false, true);
      // Mid-tier eave trim
      b.addEllipticalSlice(cx, y0 + 28.2, cz, 124, 92, 122, 90, 0.6, 36, 0, GLAZED_GOLD, true, false);

      // Radial structural standing-seam ribs across the sweeping elliptical canopy
      const nRibs = 24;
      for (let i = 0; i < nRibs; i++) {
        const ang = (i / nRibs) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const xIn = cx + cosA * 81, zIn = cz + sinA * 57;
        const xMid = cx + cosA * 123, zMid = cz + sinA * 91;
        const xOut = cx + cosA * 158, zOut = cz + sinA * 118;
        b.addStrut(xIn, y0 + 33.5, zIn, xMid, y0 + 28.5, zMid, 0.45, STEEL_SILVER, false);
        b.addStrut(xMid, y0 + 28.5, zMid, xOut, y0 + 17.0, zOut, 0.45, STEEL_SILVER, false);
      }

      // 4. Upper Clerestory & Central Skylight Crown (34m..41m)
      b.addEllipticalRibbonSlice(cx, y0 + 34.0, cz, 81, 57, 79, 55, 3.0, 32, 0, STEEL_SILVER, GLASS_AZURE, COOL_LIGHT, 0.90, 203, false);
      b.addEllipticalSlice(cx, y0 + 37.0, cz, 79, 55, 35, 18, 4.0, 32, 0, [212, 220, 230], false, true);

      // Central High-Tech Longitudinal Glass Skylight Atrium Spine (140m x 22m, emissive = true)
      b.addCurtainWallBox(cx, y0 + 40.5, cz, 140, 1.2, 22, 0, STEEL_SILVER, GLASS_CYAN, COOL_LIGHT, WARM_LIGHT, 1.2, 4.0, 0.95, 204);

      // 5. Two Giant Longitudinal Silver Steel Arch Trusses (Spans 292m across E-W axis, crowns at y0 + 48.5m)
      // Soars 8 meters above the central roof canopy!
      for (const zSign of [-1, 1]) {
        const az = cz + zSign * 26.0;
        const nSteps = 24;
        for (let s = 0; s < nSteps; s++) {
          const t0 = -1.0 + (s / nSteps) * 2.0;
          const t1 = -1.0 + ((s + 1) / nSteps) * 2.0;
          const x0 = cx + t0 * 146.0;
          const x1 = cx + t1 * 146.0;
          // Parabolic arch profile: base at y0+10.0m, peak at y0+48.5m
          const archY0 = y0 + 10.0 + 38.5 * (1.0 - t0 * t0);
          const archY1 = y0 + 10.0 + 38.5 * (1.0 - t1 * t1);

          // Top and bottom tubular steel truss chords
          b.addStrut(x0, archY0, az, x1, archY1, az, 0.85, STEEL_SILVER, false);
          b.addStrut(x0, archY0 - 2.2, az, x1, archY1 - 2.2, az, 0.70, STEEL_DARK, false);

          // Vertical and diagonal truss web members
          b.addStrut(x0, archY0 - 2.2, az, x0, archY0, az, 0.50, STEEL_SILVER, false);
          b.addStrut(x0, archY0 - 2.2, az, x1, archY1, az, 0.45, STEEL_SILVER, false);
        }

        // Transverse cross-bracing ties connecting both arch trusses across the central skylight
        if (zSign === 1) {
          for (let s = 2; s < nSteps - 2; s += 2) {
            const t = -1.0 + (s / nSteps) * 2.0;
            const x = cx + t * 146.0;
            const archY = y0 + 10.0 + 38.5 * (1.0 - t * t);
            b.addStrut(x, archY, cz - 26.0, x, archY, cz + 26.0, 0.55, STEEL_SILVER, false);
          }
        }

        // Heavy concrete abutment pylons anchoring the arch ends
        b.addBox(cx - 146, y0, az, 8.0, 14.0, 8.0, 0, GRANITE_PODIUM, false);
        b.addBox(cx + 146, y0, az, 8.0, 14.0, 8.0, 0, GRANITE_PODIUM, false);
      }
    },
  },
];
