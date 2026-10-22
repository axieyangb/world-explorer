import {
  BEIJING_STYLES_24,
  STYLE_24_KEYS,
  LEGACY_ARCHETYPE_TO_STYLE24,
  BEIJING_ARCHETYPES,
  FACADE_TILES,
  ARCHETYPE_TILE_WEIGHTS,
  ROOF_WFC_TILES,
  getStyle24TileWeights,
} from './wfc_archetypes.js';

/**
 * Deterministic Mulberry32 PRNG seeded by 32-bit integer.
 */
export function createSeededRNG(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
  };
}

/**
 * Signed area in 2D (x, z) flat array [x0, z0, x1, z1, ...].
 * Positive when counter-clockwise in (x, z).
 */
export function signedAreaFlatXZ(flat) {
  let a2 = 0;
  const n = flat.length;
  for (let i = 0; i < n; i += 2) {
    const x1 = flat[i], z1 = flat[i + 1];
    const x2 = flat[(i + 2) % n], z2 = flat[(i + 3) % n];
    a2 += x1 * z2 - x2 * z1;
  }
  return a2 * 0.5;
}

export function ensureCCWFlatXZ(flat) {
  if (signedAreaFlatXZ(flat) >= 0) return [...flat];
  const out = [];
  for (let i = flat.length - 2; i >= 0; i -= 2) {
    out.push(flat[i], flat[i + 1]);
  }
  return out;
}

export function pointInFlatRing2D(px, pz, flat) {
  let inside = false;
  const n = flat.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1];
    const xj = flat[j], zj = flat[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Computes an inward-offset (inset) polygon from a CCW flat [x0, z0, ...] ring.
 * Safely clamps miter length and validates area/convexity so narrow wings never self-intersect.
 */
export function insetPolygonFlatXZ(flatCCW, insetDist) {
  if (insetDist <= 0.05 || flatCCW.length < 6) return [...flatCCW];
  const n = flatCCW.length / 2;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flatCCW.length; i += 2) {
    const x = flatCCW[i], z = flatCCW[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const spanW = maxX - minX;
  const spanD = maxZ - minZ;
  const maxSafeInset = Math.min(spanW, spanD) * 0.22;
  const d = Math.min(insetDist, maxSafeInset);
  if (d <= 0.25) return [...flatCCW];

  const out = [];
  for (let i = 0; i < n; i++) {
    const iPrev = (i - 1 + n) % n;
    const iNext = (i + 1) % n;
    const x0 = flatCCW[iPrev * 2], z0 = flatCCW[iPrev * 2 + 1];
    const x1 = flatCCW[i * 2], z1 = flatCCW[i * 2 + 1];
    const x2 = flatCCW[iNext * 2], z2 = flatCCW[iNext * 2 + 1];

    const dx1 = x1 - x0, dz1 = z1 - z0;
    const l1 = Math.hypot(dx1, dz1) || 1;
    const inx1 = -dz1 / l1, inz1 = dx1 / l1;

    const dx2 = x2 - x1, dz2 = z2 - z1;
    const l2 = Math.hypot(dx2, dz2) || 1;
    const inx2 = -dz2 / l2, inz2 = dx2 / l2;

    let bx = inx1 + inx2;
    let bz = inz1 + inz2;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-4) {
      bx = inx1;
      bz = inz1;
    } else {
      bx /= bl;
      bz /= bl;
    }
    const dot = Math.max(0.45, bx * inx1 + bz * inz1);
    const miter = Math.min(d * 1.65, d / dot);
    out.push(x1 + bx * miter, z1 + bz * miter);
  }

  const origArea = Math.abs(signedAreaFlatXZ(flatCCW));
  const newArea = signedAreaFlatXZ(out);
  if (newArea < origArea * 0.22) {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const sx = Math.max(0.55, (spanW - d * 2) / (spanW || 1));
    const sz = Math.max(0.55, (spanD - d * 2) / (spanD || 1));
    const scaled = [];
    for (let i = 0; i < flatCCW.length; i += 2) {
      scaled.push(cx + (flatCCW[i] - cx) * sx, cz + (flatCCW[i + 1] - cz) * sz);
    }
    return scaled;
  }
  return out;
}

/**
 * Applies a subtle deterministic per-building weathering / sun-bleaching tint (±6% luminance, ±3% warmth)
 * so neighboring buildings sharing a style ID still exhibit natural physical variation.
 */
export function applyPaletteMicroTint(basePal, seed) {
  const h1 = ((seed * 2654435761) >>> 0);
  const lumDelta = (((h1 & 0xff) / 255.0) - 0.5) * 0.11; // -5.5% .. +5.5%
  const warmDelta = ((((h1 >>> 8) & 0xff) / 255.0) - 0.5) * 0.05; // -2.5% .. +2.5%

  const tintRgb = (rgb, scale = 1.0) => [
    Math.max(0.04, Math.min(0.98, rgb[0] * (1.0 + (lumDelta + warmDelta) * scale))),
    Math.max(0.04, Math.min(0.98, rgb[1] * (1.0 + lumDelta * scale))),
    Math.max(0.04, Math.min(0.98, rgb[2] * (1.0 + (lumDelta - warmDelta) * scale))),
  ];

  return {
    name: basePal.name || '24-Style Palette',
    wallPrimary: tintRgb(basePal.wallPrimary, 1.0),
    wallSecondary: tintRgb(basePal.wallSecondary, 0.9),
    podiumStone: tintRgb(basePal.podiumStone, 0.85),
    glassDark: tintRgb(basePal.glassDark, 0.7),
    glassLit: tintRgb(basePal.glassLit, 0.5),
    mullion: tintRgb(basePal.mullion, 0.7),
    accent: tintRgb(basePal.accent, 0.6),
    roofDeck: tintRgb(basePal.roofDeck, 1.0),
  };
}

/**
 * Maps any real Beijing OSM/Overture building record + world coordinates (wx, wz)
 * to one of the 24 authentic Beijing architectural styles (`S01..S24`).
 *
 * Uses a two-tier spatial + semantic hash:
 * - Semantic tags (`name`, `btype`, `style`, `levels`, `height`) select the appropriate style pool.
 * - A `150m x 150m` urban compound block hash (`compoundHash`) + per-building hash (`bldgHash`)
 *   ensures buildings within a residential compound or office park feel cohesive yet richly varied across all 24 styles.
 */
export function resolveBeijingStyle24(bldg, wx = 0, wz = 0, extraSeed = 0) {
  // If an explicit S01..S24 style ID was provided, honor it directly
  if (bldg.styleId && BEIJING_STYLES_24[bldg.styleId]) {
    return bldg.styleId;
  }
  if (bldg.style && BEIJING_STYLES_24[bldg.style]) {
    return bldg.style;
  }
  if (bldg.archetype && BEIJING_STYLES_24[bldg.archetype]) {
    return bldg.archetype;
  }

  const name = bldg.name || '';
  const btype = bldg.btype || 'yes';
  const style = bldg.style || 'modern';
  const levels = bldg.levels || Math.max(1, Math.round((bldg.height || 12) / 3.2));
  const height = bldg.height || levels * 3.2;

  // Compute centroid from flatOuter if wx/wz not explicitly passed
  if (wx === 0 && wz === 0 && bldg.flatOuter && bldg.flatOuter.length >= 2) {
    let sx = 0, sz = 0;
    const n = bldg.flatOuter.length / 2;
    for (let i = 0; i < bldg.flatOuter.length; i += 2) {
      sx += bldg.flatOuter[i];
      sz += bldg.flatOuter[i + 1];
    }
    wx = (bldg.ox || 0) + sx / n;
    wz = (bldg.oz || 0) + sz / n;
  }

  const rawId = (bldg.id || bldg.osmId || 0) >>> 0;
  const blockX = Math.floor(wx / 145.0);
  const blockZ = Math.floor(wz / 145.0);
  const compoundHash = (((blockX * 73856093) ^ (blockZ * 19349663) ^ (extraSeed * 83492791)) >>> 0);
  const bldgHash = (((rawId * 2654435761) ^ (Math.round(wx * 3.7) * 1597334677) ^ (Math.round(wz * 3.7) * 3812015801) ^ extraSeed) >>> 0);

  const pickFromPool = (pool, compoundCohesion = 0.52) => {
    if ((bldgHash % 100) < compoundCohesion * 100) {
      return pool[compoundHash % pool.length];
    }
    return pool[bldgHash % pool.length];
  };

  // 1. Imperial Palaces & Ancient Landmarks (S24)
  if (
    style === 'imperial' ||
    name.includes('故宫') ||
    name.includes('太和') ||
    name.includes('中和') ||
    name.includes('保和') ||
    name.includes('乾清') ||
    name.includes('天安门') ||
    name.includes('午门') ||
    name.includes('神武门') ||
    name.includes('角楼') ||
    name.includes('钟楼') ||
    name.includes('鼓楼') ||
    name.includes('天坛') ||
    name.includes('祈年殿') ||
    name.includes('文渊阁') ||
    name.includes('佛香阁') ||
    name.includes('万春亭') ||
    name.includes('白塔') ||
    name.includes('玉峰塔') ||
    name.includes('万寿塔') ||
    btype === 'temple' ||
    (levels <= 4 && (name.includes('殿') || name.includes('宫') || name.includes('庙') || name.includes('祠') || name.includes('亭') || name.includes('阁')))
  ) {
    return 'S24_imperial_palace';
  }

  // 2. Old Beijing Siheyuan & Hutong Courtyards (S23)
  if (
    style === 'hutong' ||
    (levels <= 2 && (name.includes('四合院') || name.includes('胡同') || btype === 'courtyard' || btype === 'detached'))
  ) {
    return 'S23_shichahai_siheyuan';
  }

  // 3. Industrial Loft / Red-Brick Factory / 798 Art District (S19, S06)
  if (
    btype === 'industrial' ||
    btype === 'warehouse' ||
    btype === 'manufacture' ||
    name.includes('厂') ||
    name.includes('车间') ||
    name.includes('798')
  ) {
    return pickFromPool(['S19_798_industrial_loft', 'S19_798_industrial_loft', 'S06_50s_soviet_redbrick', 'S03_emerald_ribbon_tech'], 0.6);
  }

  // 4. 1950s–1980s Ministries, Research Institutes & University Campus Buildings (S16, S18, S06, S17)
  if (
    bldg.archetype === 'ministry_big_roof' ||
    btype === 'government' ||
    btype === 'university' ||
    btype === 'college' ||
    btype === 'school' ||
    btype === 'hospital' ||
    btype === 'public' ||
    name.includes('研究所') ||
    name.includes('科学院') ||
    name.includes('大学') ||
    name.includes('学院') ||
    name.includes('中学') ||
    name.includes('小学') ||
    name.includes('部') ||
    name.includes('委员会') ||
    name.includes('医院')
  ) {
    if (levels <= 10) {
      if (name.includes('大学') || name.includes('学院') || name.includes('学校') || btype === 'university' || btype === 'college' || btype === 'school') {
        return pickFromPool([
          'S18_campus_redbrick_arch',
          'S16_50s_sanlihe_ministry',
          'S06_50s_soviet_redbrick',
          'S17_90s_whitetile_blueglass',
        ], 0.55);
      }
      return pickFromPool([
        'S16_50s_sanlihe_ministry',
        'S18_campus_redbrick_arch',
        'S17_90s_whitetile_blueglass',
        'S04_granite_rib_financial',
        'S06_50s_soviet_redbrick',
      ], 0.50);
    }
  }

  // 5. Commercial Malls, Department Stores, Street Retail & Hotels (S20, S21, S22, S05, S17)
  if (
    bldg.archetype === 'commercial_podium' ||
    btype === 'commercial' ||
    btype === 'retail' ||
    btype === 'supermarket' ||
    btype === 'hotel' ||
    name.includes('商场') ||
    name.includes('百货') ||
    name.includes('购物') ||
    name.includes('商业') ||
    name.includes('超市') ||
    name.includes('饭店') ||
    name.includes('酒店') ||
    name.includes('宾馆') ||
    name.includes('梅地亚')
  ) {
    if (name.includes('饭店') || name.includes('酒店') || name.includes('宾馆') || name.includes('梅地亚') || btype === 'hotel') {
      return pickFromPool([
        'S22_90s_bronze_hotel',
        'S05_champagne_artdeco_tower',
        'S01_zgc_pailou_glass',
        'S17_90s_whitetile_blueglass',
      ], 0.40);
    }
    if (levels <= 12) {
      return pickFromPool([
        'S20_wudaokou_vibrant_mall',
        'S21_sanlitun_obsidian_retail',
        'S22_90s_bronze_hotel',
        'S17_90s_whitetile_blueglass',
        'S05_champagne_artdeco_tower',
      ], 0.45);
    }
  }

  // 6. High-Rise Tech HQ, Modern Office Towers & Financial Landmarks (S01..S05, S17, S22)
  if (
    bldg.archetype === 'zgc_tech_office' ||
    btype === 'office' ||
    style === 'glass' ||
    name.includes('京东') ||
    name.includes('科技') ||
    name.includes('大厦') ||
    name.includes('中心') ||
    name.includes('广场') ||
    name.includes('国际')
  ) {
    if (name.includes('京东') || name.includes('翠宫')) {
      return 'S01_zgc_pailou_glass';
    }
    return pickFromPool([
      'S01_zgc_pailou_glass',
      'S02_cbd_sapphire_curtain',
      'S03_emerald_ribbon_tech',
      'S04_granite_rib_financial',
      'S05_champagne_artdeco_tower',
      'S17_90s_whitetile_blueglass',
      'S22_90s_bronze_hotel',
      'S21_sanlitun_obsidian_retail',
    ], 0.38);
  }

  // 7. Low/Mid-Rise Multi-Story Residential & Danwei Compounds (1..7F -> S06..S10, S18, S23)
  if (levels <= 7) {
    if (levels <= 2 && height <= 7.5 && (bldgHash % 100) < 38) {
      return 'S23_shichahai_siheyuan';
    }
    return pickFromPool([
      'S07_80s_zhichunli_brick_stucco',
      'S08_80s_huangzhuang_ochre',
      'S09_90s_fangzhuang_redtile',
      'S10_renovated_pastel_slab',
      'S06_50s_soviet_redbrick',
      'S18_campus_redbrick_arch',
      'S17_90s_whitetile_blueglass',
    ], 0.55);
  }

  // 8. High-Rise Residential Towers & Urban Apartments (8F+ -> S11..S15, S09, S02..S05)
  if (
    bldg.archetype === 'residential_tower_00s' ||
    btype === 'residential' ||
    btype === 'apartments' ||
    btype === 'dormitory' ||
    btype === 'house' ||
    style === 'residential'
  ) {
    return pickFromPool([
      'S11_90s_yayuncun_bluewhite',
      'S12_05s_haidian_sienna_bay',
      'S13_10s_wangjing_khaki_modern',
      'S14_15s_neoclassical_stone',
      'S15_20s_silver_minimal_flat',
      'S09_90s_fangzhuang_redtile',
    ], 0.58);
  }

  // 9. Generic Tall Urban Buildings (8F+ with building=yes) — mix residential towers & office styles
  return pickFromPool([
    'S11_90s_yayuncun_bluewhite',
    'S12_05s_haidian_sienna_bay',
    'S13_10s_wangjing_khaki_modern',
    'S14_15s_neoclassical_stone',
    'S15_20s_silver_minimal_flat',
    'S02_cbd_sapphire_curtain',
    'S03_emerald_ribbon_tech',
    'S04_granite_rib_financial',
    'S05_champagne_artdeco_tower',
    'S17_90s_whitetile_blueglass',
  ], 0.48);
}

/**
 * Backwards-compatible alias that now returns one of the 24 Beijing style IDs (`S01..S24`).
 */
export function classifyBeijingArchetype(bldg, wx = 0, wz = 0, seed = 0) {
  return resolveBeijingStyle24(bldg, wx, wz, seed);
}

/**
 * Dimension 1: 1D Vertical Massing Setback WFC.
 * Collapses a building's vertical massing into 1..3 tiers (Podium -> Main Tower Shaft -> Upper Crown Setback),
 * preserving the exact ground-level 2D footprint at y=0 so street frontages and courtyards remain 1:1 exact.
 */
export function collapseVerticalMassingWFC(flatOuter, flatHoles, totalHeight, totalLevels, archetypeId, seed) {
  const arch = BEIJING_ARCHETYPES[archetypeId] || BEIJING_STYLES_24.S01_zgc_pailou_glass;
  const rng = createSeededRNG(seed ^ 0x9e3779b9);
  const outerCCW = ensureCCWFlatXZ(flatOuter);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < outerCCW.length; i += 2) {
    const x = outerCCW[i], z = outerCCW[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const minSpan = Math.min(maxX - minX, maxZ - minZ);
  const rules = arch.massingRules;

  const tiers = [];
  if (
    rules.allowPodium &&
    (!flatHoles || flatHoles.length === 0) &&
    totalLevels >= 8 &&
    minSpan >= 14.5
  ) {
    const podiumChoices = rules.podiumFloors;
    const podiumLvls = podiumChoices[Math.floor(rng() * podiumChoices.length)];
    const podiumH = Math.min(
      totalHeight * 0.35,
      arch.groundFloorHeight + Math.max(0, podiumLvls - 1) * arch.floorHeight
    );

    tiers.push({
      tierIndex: 0,
      role: 'podium',
      label: `首层及裙房基座 (1–${podiumLvls}F)`,
      y0: 0.0,
      y1: podiumH,
      levels: podiumLvls,
      flatOuter: outerCCW,
      flatHoles: flatHoles || [],
      hasGroundRow: true,
      hasTopCrown: false,
    });

    const setbackChoices = rules.towerSetback;
    const setbackM = setbackChoices[Math.floor(rng() * setbackChoices.length)];
    const shaftOuter = insetPolygonFlatXZ(outerCCW, setbackM);
    const remLevels = Math.max(3, totalLevels - podiumLvls);

    if (totalLevels >= 16 && rules.upperSetbackRatio < 0.95 && minSpan >= 20.0 && rng() < 0.75) {
      const mainLvls = Math.max(4, Math.round(remLevels * rules.upperSetbackRatio));
      const upperLvls = Math.max(2, remLevels - mainLvls);
      const mainH = podiumH + (totalHeight - podiumH) * (mainLvls / remLevels);

      tiers.push({
        tierIndex: 1,
        role: 'shaft',
        label: `主塔楼标准段 (${podiumLvls + 1}–${podiumLvls + mainLvls}F, 退台 ${setbackM.toFixed(1)}m)`,
        y0: podiumH,
        y1: mainH,
        levels: mainLvls,
        flatOuter: shaftOuter,
        flatHoles: [],
        hasGroundRow: false,
        hasTopCrown: false,
      });

      const upperOuter = insetPolygonFlatXZ(shaftOuter, rules.upperSetbackInset);
      tiers.push({
        tierIndex: 2,
        role: 'upper_crown',
        label: `高区退台冠顶段 (${podiumLvls + mainLvls + 1}–${totalLevels}F, 二次退台 ${rules.upperSetbackInset.toFixed(1)}m)`,
        y0: mainH,
        y1: totalHeight,
        levels: upperLvls,
        flatOuter: upperOuter,
        flatHoles: [],
        hasGroundRow: false,
        hasTopCrown: true,
      });
    } else {
      tiers.push({
        tierIndex: 1,
        role: 'shaft',
        label: `主塔楼 (${podiumLvls + 1}–${totalLevels}F, 裙房退台 ${setbackM.toFixed(1)}m)`,
        y0: podiumH,
        y1: totalHeight,
        levels: remLevels,
        flatOuter: shaftOuter,
        flatHoles: [],
        hasGroundRow: false,
        hasTopCrown: true,
      });
    }
  } else {
    tiers.push({
      tierIndex: 0,
      role: 'full',
      label: `整体主体结构 (1–${totalLevels}F)`,
      y0: 0.0,
      y1: totalHeight,
      levels: Math.max(1, totalLevels),
      flatOuter: outerCCW,
      flatHoles: flatHoles || [],
      hasGroundRow: true,
      hasTopCrown: true,
    });
  }

  return tiers;
}

/**
 * Dimension 2: 2D Facade Tile Grammar WFC Solver (with AC-3 Constraint Propagation & Optional Step History).
 */
export function collapseFacadeGridWFC(nx, ny, archetypeId, wallInfo, seed, recordHistory = false) {
  const arch = BEIJING_ARCHETYPES[archetypeId] || BEIJING_STYLES_24.S01_zgc_pailou_glass;
  const weightTable = getStyle24TileWeights(arch.id);
  const rng = createSeededRNG(seed);

  const hasGroundRow = wallInfo.hasGroundRow !== false;
  const hasTopCrown = wallInfo.hasTopCrown !== false;
  const isSouthFacing = (wallInfo.nz || 0) > 0.25;
  const isNorthFacing = (wallInfo.nz || 0) < -0.25;
  const isDanweiSlab = arch.category === '多层板楼/大院' && arch.id !== 'S06_50s_soviet_redbrick';

  const gridDomains = [];
  for (let y = 0; y < ny; y++) {
    const row = [];
    const isBottom = y === 0 && hasGroundRow;
    const isTop = y === ny - 1 && hasTopCrown && ny >= 2;
    const layerKey = isBottom ? 'ground' : isTop ? 'top' : 'mid';
    const layerWeights = weightTable[layerKey] || weightTable.mid;

    for (let x = 0; x < nx; x++) {
      const isCorner = x === 0 || x === nx - 1;
      const candidates = [];

      for (const tileId of Object.keys(layerWeights)) {
        const tile = FACADE_TILES[tileId];
        if (!tile) continue;
        if (isCorner && tile.interiorOnly && nx >= 3) continue;
        if (!isCorner && tile.cornerOnly && nx >= 3) continue;

        if (isDanweiSlab && nx >= 5) {
          if (isSouthFacing && tileId === 'G_UNIT_ENTRY') continue;
          if (isNorthFacing && tileId === 'G_DADO_BALCONY_BASE' && rng() < 0.7) continue;
        }
        candidates.push(tileId);
      }

      if (candidates.length === 0) {
        candidates.push(isBottom ? 'G_DADO_WIN' : isTop ? 'T_PARAPET_CORNICE' : 'M_WALL_STD');
      }
      row.push(candidates);
    }
    gridDomains.push(row);
  }

  const getTileWeight = (x, y, tileId) => {
    const isBottom = y === 0 && hasGroundRow;
    const isTop = y === ny - 1 && hasTopCrown && ny >= 2;
    const layerKey = isBottom ? 'ground' : isTop ? 'top' : 'mid';
    const baseW = (weightTable[layerKey] && weightTable[layerKey][tileId]) || 5.0;
    const tile = FACADE_TILES[tileId];
    if (!tile) return baseW;

    const centerDist = Math.abs(x - (nx - 1) * 0.5) / Math.max(1, nx * 0.5);
    if (tile.centerPreferred) {
      return centerDist < 0.35 ? baseW * 2.8 : baseW * 0.25;
    }
    if (isDanweiSlab && tileId === 'G_UNIT_ENTRY') {
      return (x % 3 === 1) ? baseW * 2.6 : baseW * 0.15;
    }
    return baseW;
  };

  const areTilesCompatible = (tileIdA, tileIdB, dir) => {
    const tA = FACADE_TILES[tileIdA];
    const tB = FACADE_TILES[tileIdB];
    if (!tA || !tB) return true;

    if (dir === 'n') {
      if (tA.sockets.n === tB.sockets.s) return true;
      if (tB.layer === 'top' && tB.id === 'T_PARAPET_CORNICE' && tA.sockets.n === 'V_PILASTER') return true;
      return false;
    }
    if (dir === 's') {
      return areTilesCompatible(tileIdB, tileIdA, 'n');
    }
    if (dir === 'e' || dir === 'w') {
      if (tileIdA === 'G_UNIT_ENTRY' && tileIdB === 'G_UNIT_ENTRY') return false;
      if (tileIdA === 'M_STAIR_WINDOW' && tileIdB === 'M_STAIR_WINDOW') return false;
      if (tileIdA === 'M_AC_LOUVER' && tileIdB === 'M_AC_LOUVER') return false;
      if (tileIdA === 'G_TOWER_LOUVER_BASE' && tileIdB === 'G_TOWER_LOUVER_BASE') return false;
      if (tileIdA === 'G_HUTONG_GATE' && tileIdB === 'G_HUTONG_GATE') return false;
      return true;
    }
    return true;
  };

  const history = [];
  const snapshotGrid = (actionLabel, focusX, focusY) => {
    if (!recordHistory) return;
    const snap = [];
    for (let y = 0; y < ny; y++) {
      const r = [];
      for (let x = 0; x < nx; x++) {
        r.push([...gridDomains[y][x]]);
      }
      snap.push(r);
    }
    history.push({
      step: history.length,
      label: actionLabel,
      focusX,
      focusY,
      domains: snap,
    });
  };

  const propagate = (startQueue) => {
    const queue = [...startQueue];
    const dirs = [
      { dx: 0, dy: 1, dir: 'n' },
      { dx: 0, dy: -1, dir: 's' },
      { dx: 1, dy: 0, dir: 'e' },
      { dx: -1, dy: 0, dir: 'w' },
    ];

    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      const curDom = gridDomains[cy][cx];

      for (const { dx, dy, dir } of dirs) {
        const nxCell = cx + dx;
        const nyCell = cy + dy;
        if (nxCell < 0 || nxCell >= nx || nyCell < 0 || nyCell >= ny) continue;

        const nbrDom = gridDomains[nyCell][nxCell];
        if (nbrDom.length <= 1) continue;

        const filtered = nbrDom.filter((candB) =>
          curDom.some((candA) => areTilesCompatible(candA, candB, dir))
        );

        if (filtered.length > 0 && filtered.length < nbrDom.length) {
          gridDomains[nyCell][nxCell] = filtered;
          queue.push([nxCell, nyCell]);
        }
      }
    }
  };

  const initQueue = [];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (gridDomains[y][x].length === 1) {
        initQueue.push([x, y]);
      }
    }
  }
  propagate(initQueue);
  snapshotGrid('初始化立面波函数叠加态 (角柱约束已传播)', -1, -1);

  const computeEntropy = (x, y) => {
    const dom = gridDomains[y][x];
    if (dom.length <= 1) return 0;
    let sumW = 0;
    let sumWLogW = 0;
    for (let i = 0; i < dom.length; i++) {
      const w = Math.max(0.01, getTileWeight(x, y, dom[i]));
      sumW += w;
      sumWLogW += w * Math.log2(w);
    }
    return Math.log2(sumW) - sumWLogW / sumW;
  };

  let maxIterations = nx * ny + 8;
  while (maxIterations-- > 0) {
    let bestX = -1;
    let bestY = -1;
    let bestScore = Infinity;

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const dom = gridDomains[y][x];
        if (dom.length <= 1) continue;
        const h = computeEntropy(x, y);
        const score = h + y * 0.08 + rng() * 0.015;
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    if (bestX === -1) break;

    const dom = gridDomains[bestY][bestX];
    let totalW = 0;
    const weights = dom.map((tid) => {
      const w = getTileWeight(bestX, bestY, tid);
      totalW += w;
      return w;
    });

    let pick = rng() * totalW;
    let chosenTile = dom[dom.length - 1];
    for (let i = 0; i < dom.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        chosenTile = dom[i];
        break;
      }
    }

    gridDomains[bestY][bestX] = [chosenTile];
    const propQueue = [[bestX, bestY]];

    const enforceSym =
      arch.symmetry === 'strict' ||
      (arch.symmetry === 'semi' && (bestY === 0 || bestY === ny - 1));
    const mirrorX = nx - 1 - bestX;
    if (enforceSym && mirrorX !== bestX && gridDomains[bestY][mirrorX].includes(chosenTile)) {
      gridDomains[bestY][mirrorX] = [chosenTile];
      propQueue.push([mirrorX, bestY]);
    }

    propagate(propQueue);

    const tileMeta = FACADE_TILES[chosenTile];
    snapshotGrid(
      `坍缩 (${bestX}, ${bestY}) → ${tileMeta ? tileMeta.label : chosenTile}`,
      bestX,
      bestY
    );
  }

  const collapsed = [];
  for (let y = 0; y < ny; y++) {
    const row = [];
    for (let x = 0; x < nx; x++) {
      row.push(gridDomains[y][x][0] || 'M_WALL_STD');
    }
    collapsed.push(row);
  }

  return {
    nx,
    ny,
    archetypeId: arch.id,
    collapsed,
    history,
  };
}

/**
 * Dimension 3: 2D Rooftop Greeble WFC Solver.
 * Collapses a 2D equipment layout inside the top tier's polygon footprint.
 */
export function collapseRooftopGreebleWFC(flatOuter, flatHoles, archetypeId, seed) {
  const arch = BEIJING_ARCHETYPES[archetypeId] || BEIJING_STYLES_24.S01_zgc_pailou_glass;
  const rng = createSeededRNG(seed ^ 0x85ebca6b);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flatOuter.length; i += 2) {
    const x = flatOuter[i], z = flatOuter[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cellSize = 4.2;
  const gxCount = Math.max(1, Math.min(24, Math.floor((maxX - minX) / cellSize)));
  const gzCount = Math.max(1, Math.min(24, Math.floor((maxZ - minZ) / cellSize)));
  const cells = [];

  const isInsideSafe = (px, pz, margin) => {
    if (!pointInFlatRing2D(px, pz, flatOuter)) return false;
    if (margin > 0) {
      if (!pointInFlatRing2D(px + margin, pz, flatOuter)) return false;
      if (!pointInFlatRing2D(px - margin, pz, flatOuter)) return false;
      if (!pointInFlatRing2D(px, pz + margin, flatOuter)) return false;
      if (!pointInFlatRing2D(px, pz - margin, flatOuter)) return false;
    }
    for (const h of flatHoles || []) {
      if (h.length >= 6 && pointInFlatRing2D(px, pz, h)) return false;
    }
    return true;
  };

  for (let gz = 0; gz < gzCount; gz++) {
    for (let gx = 0; gx < gxCount; gx++) {
      const cx = minX + (gx + 0.5) * ((maxX - minX) / gxCount);
      const cz = minZ + (gz + 0.5) * ((maxZ - minZ) / gzCount);
      if (!isInsideSafe(cx, cz, 1.4)) continue;

      let tileId = 'R_OPEN_DECK';
      const r = rng();
      if (arch.roofStyle === 'pailou_crown' || arch.category === '现代玻璃/商务') {
        if (r < 0.20) tileId = 'R_HVAC_TOWER';
        else if (r < 0.36) tileId = 'R_PENTHOUSE';
        else if (r < 0.45) tileId = 'R_SKYLIGHT_ATRIUM';
      } else if (arch.roofStyle === 'mall_skylight_hvac') {
        if (r < 0.28) tileId = 'R_SKYLIGHT_ATRIUM';
        else if (r < 0.48) tileId = 'R_HVAC_TOWER';
        else if (r < 0.58) tileId = 'R_PENTHOUSE';
      } else if (arch.category === '高层商品房/塔楼') {
        if (r < 0.24) tileId = 'R_PENTHOUSE';
        else if (r < 0.40) tileId = 'R_SOLAR_BANK';
      } else if (arch.category === '多层板楼/大院') {
        if (r < 0.16) tileId = 'R_SOLAR_BANK';
        else if (r < 0.25) tileId = 'R_PENTHOUSE';
      }

      if (tileId !== 'R_OPEN_DECK') {
        cells.push({
          gx,
          gz,
          cx,
          cz,
          size: cellSize * 0.82,
          tileId,
        });
      }
    }
  }

  return {
    roofStyle: arch.roofStyle,
    cells,
  };
}

/**
 * Full 3-Dimensional Building WFC Pipeline:
 * Given a 2D polygon footprint + height + levels + style/archetype + seed,
 * runs:
 *  1. 1D Vertical Massing Setback WFC -> tiers[]
 *  2. 2D Facade Tile Grammar WFC on every wall segment of every tier -> wallGrids[]
 *  3. 2D Rooftop Greeble WFC on the top tier -> roofGreebles
 */
export function solveBuildingWFC(bldgInput, options = {}) {
  const t0 = performance.now();
  const seed = (options.seed !== undefined ? options.seed : bldgInput.id || 1001) >>> 0;

  let styleId;
  if (options.archetype && BEIJING_ARCHETYPES[options.archetype]) {
    styleId = BEIJING_ARCHETYPES[options.archetype].id;
  } else {
    styleId = resolveBeijingStyle24(bldgInput, options.wx || 0, options.wz || 0, seed);
  }
  const arch = BEIJING_STYLES_24[styleId] || BEIJING_STYLES_24.S01_zgc_pailou_glass;

  const basePalette = arch.palette || (arch.palettes && arch.palettes[0]);
  const palette = options.disableMicroTint ? basePalette : applyPaletteMicroTint(basePalette, seed);

  const totalLevels = Math.max(1, bldgInput.levels || Math.round((bldgInput.height || 18) / arch.floorHeight));
  const totalHeight =
    bldgInput.height ||
    arch.groundFloorHeight + Math.max(0, totalLevels - 1) * arch.floorHeight;

  // 1. 1D Vertical Massing Setback WFC
  const tiers = options.disableMassingSetback
    ? [
        {
          tierIndex: 0,
          role: 'full',
          label: `整体主体结构 (1–${totalLevels}F)`,
          y0: 0.0,
          y1: totalHeight,
          levels: totalLevels,
          flatOuter: ensureCCWFlatXZ(bldgInput.flatOuter),
          flatHoles: bldgInput.flatHoles || [],
          hasGroundRow: true,
          hasTopCrown: true,
        },
      ]
    : collapseVerticalMassingWFC(
        bldgInput.flatOuter,
        bldgInput.flatHoles || [],
        totalHeight,
        totalLevels,
        arch.id,
        seed
      );

  // 2. 2D Facade Tile Grammar WFC per wall edge of each tier
  let totalBays = 0;
  let totalWfcCells = 0;
  for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
    const tier = tiers[tIdx];
    const rings = [tier.flatOuter, ...(tier.flatHoles || [])];
    tier.wallFacades = [];

    for (let rIdx = 0; rIdx < rings.length; rIdx++) {
      const ring = rings[rIdx];
      const nPts = ring.length / 2;
      for (let k = 0; k < nPts; k++) {
        const x1 = ring[k * 2], z1 = ring[k * 2 + 1];
        const x2 = ring[((k + 1) % nPts) * 2], z2 = ring[((k + 1) % nPts) * 2 + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.8) continue;

        const nx = dz / segLen;
        const nz = -dx / segLen;
        const tx = dx / segLen;
        const tz = dz / segLen;

        const nBays = Math.max(1, Math.round(segLen / arch.bayWidth));
        const nFloors = Math.max(1, tier.levels);
        const edgeSeed = ((seed ^ (tIdx * 73856093) ^ (k * 19349663) ^ (rIdx * 83492791)) >>> 0);

        const recordThisWall = Boolean(options.recordHistory && tIdx === 0 && rIdx === 0 && k === (options.inspectWallIdx || 0));
        const wfcResult = collapseFacadeGridWFC(
          nBays,
          nFloors,
          arch.id,
          {
            hasGroundRow: tier.hasGroundRow,
            hasTopCrown: tier.hasTopCrown,
            nx,
            nz,
            segLen,
            isInnerCourtyard: rIdx > 0,
          },
          edgeSeed,
          recordThisWall
        );

        totalBays += nBays;
        totalWfcCells += nBays * nFloors;

        tier.wallFacades.push({
          edgeIndex: k,
          ringIndex: rIdx,
          x1,
          z1,
          x2,
          z2,
          segLen,
          nx,
          nz,
          tx,
          tz,
          nBays,
          nFloors,
          bayW: segLen / nBays,
          wfc: wfcResult,
        });
      }
    }
  }

  // 3. 2D Rooftop Greeble WFC on the uppermost tier
  const topTier = tiers[tiers.length - 1];
  const roofWfc = collapseRooftopGreebleWFC(
    topTier.flatOuter,
    topTier.flatHoles || [],
    arch.id,
    seed
  );

  const solveMs = performance.now() - t0;

  return {
    seed,
    archetypeId: arch.id,
    archetype: arch,
    paletteIdx: 0,
    palette,
    totalHeight,
    totalLevels,
    tiers,
    roofWfc,
    stats: {
      solveMs,
      tiersCount: tiers.length,
      totalBays,
      totalWfcCells,
    },
  };
}
