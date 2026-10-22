/**
 * 24 Authentic Beijing Architectural Styles (S01..S24), Real-Scene Color Palettes,
 * and 3-Orthogonal-Dimension Wave Function Collapse (WFC) Tile & Socket Grammars.
 *
 * Covers the 5 major urban fabric categories of Beijing:
 *  A. Modern Tech & CBD Office Towers (S01..S05)
 *  B. 1950s–1990s Multi-Story Danwei & Residential Slabs (S06..S10)
 *  C. 1995–2024 High-Rise Residential & Apartment Towers (S11..S15)
 *  D. Ministry Big-Roof, University Campus, Civic & 798 Industrial (S16..S19)
 *  E. Commercial Complexes, Hotels, Siheyuan Courtyards & Imperial Palaces (S20..S24)
 */

export const BEIJING_STYLES_24 = {
  // ============================================================================
  // A. 现代写字楼与科创大厦系列 (Modern Tech & CBD Office — S01..S05)
  // ============================================================================
  S01_zgc_pailou_glass: {
    id: 'S01_zgc_pailou_glass',
    code: 'S01',
    category: 'office',
    name: '京东/翠宫新中式科技大厦 (深蓝灰幕墙 + 朱红牌楼冠顶)',
    shortName: 'S01·新中式科技大厦',
    era: '1998–2024',
    bayWidth: 4.2,
    floorHeight: 3.8,
    groundFloorHeight: 5.6,
    symmetry: 'semi',
    roofStyle: 'pailou_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [3.0, 4.2],
      upperSetbackRatio: 0.78,
      upperSetbackInset: 2.2,
    },
    palette: {
      wallPrimary: [0.26, 0.32, 0.39],
      wallSecondary: [0.60, 0.64, 0.69],
      podiumStone: [0.72, 0.70, 0.66],
      glassDark: [0.14, 0.26, 0.38],
      glassLit: [0.46, 0.69, 0.86],
      mullion: [0.78, 0.82, 0.86],
      accent: [0.72, 0.20, 0.17],
      roofDeck: [0.36, 0.40, 0.45],
    },
  },

  S02_cbd_sapphire_curtain: {
    id: 'S02_cbd_sapphire_curtain',
    code: 'S02',
    category: 'office',
    name: '国贸/金融街宝石蓝全隐框玻璃幕墙大厦',
    shortName: 'S02·宝石蓝全玻幕墙',
    era: '2005–2024',
    bayWidth: 4.0,
    floorHeight: 4.0,
    groundFloorHeight: 6.0,
    symmetry: 'semi',
    roofStyle: 'glass_crown_hvac',
    massingRules: {
      allowPodium: true,
      podiumFloors: [3, 4],
      towerSetback: [3.5, 4.8],
      upperSetbackRatio: 0.82,
      upperSetbackInset: 2.6,
    },
    palette: {
      wallPrimary: [0.16, 0.28, 0.44],
      wallSecondary: [0.30, 0.44, 0.60],
      podiumStone: [0.38, 0.42, 0.48],
      glassDark: [0.10, 0.22, 0.38],
      glassLit: [0.38, 0.66, 0.92],
      mullion: [0.80, 0.86, 0.92],
      accent: [0.22, 0.58, 0.88],
      roofDeck: [0.28, 0.34, 0.42],
    },
  },

  S03_emerald_ribbon_tech: {
    id: 'S03_emerald_ribbon_tech',
    code: 'S03',
    category: 'office',
    name: '中关村/望京翡翠绿镀膜玻璃 + 象牙白水平连窗大厦',
    shortName: 'S03·翡翠绿水平连窗',
    era: '1996–2008',
    bayWidth: 4.4,
    floorHeight: 3.6,
    groundFloorHeight: 5.2,
    symmetry: 'none',
    roofStyle: 'flat_hvac_skylight',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [2.5, 3.6],
      upperSetbackRatio: 0.85,
      upperSetbackInset: 1.8,
    },
    palette: {
      wallPrimary: [0.84, 0.85, 0.82],
      wallSecondary: [0.58, 0.66, 0.64],
      podiumStone: [0.46, 0.52, 0.50],
      glassDark: [0.12, 0.34, 0.30],
      glassLit: [0.34, 0.72, 0.64],
      mullion: [0.88, 0.90, 0.88],
      accent: [0.16, 0.56, 0.48],
      roofDeck: [0.42, 0.46, 0.45],
    },
  },

  S04_granite_rib_financial: {
    id: 'S04_granite_rib_financial',
    code: 'S04',
    category: 'office',
    name: '长安街/金融街桃花红与暖灰麻花岗岩竖肋大厦',
    shortName: 'S04·金融街花岗岩竖肋',
    era: '1999–2016',
    bayWidth: 3.8,
    floorHeight: 3.8,
    groundFloorHeight: 5.4,
    symmetry: 'strict',
    roofStyle: 'stepped_stone_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [2.8, 3.8],
      upperSetbackRatio: 0.80,
      upperSetbackInset: 2.4,
    },
    palette: {
      wallPrimary: [0.68, 0.58, 0.54],
      wallSecondary: [0.78, 0.70, 0.66],
      podiumStone: [0.52, 0.42, 0.39],
      glassDark: [0.20, 0.18, 0.16],
      glassLit: [0.78, 0.66, 0.46],
      mullion: [0.82, 0.75, 0.70],
      accent: [0.58, 0.36, 0.30],
      roofDeck: [0.46, 0.42, 0.40],
    },
  },

  S05_champagne_artdeco_tower: {
    id: 'S05_champagne_artdeco_tower',
    code: 'S05',
    category: 'office',
    name: '后现代香槟金/古铜铝板阶梯退台写字楼',
    shortName: 'S05·香槟金阶梯塔楼',
    era: '2008–2024',
    bayWidth: 4.0,
    floorHeight: 3.9,
    groundFloorHeight: 5.5,
    symmetry: 'semi',
    roofStyle: 'stepped_stone_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 4],
      towerSetback: [3.2, 4.5],
      upperSetbackRatio: 0.74,
      upperSetbackInset: 2.8,
    },
    palette: {
      wallPrimary: [0.74, 0.65, 0.50],
      wallSecondary: [0.52, 0.45, 0.36],
      podiumStone: [0.36, 0.32, 0.27],
      glassDark: [0.18, 0.22, 0.26],
      glassLit: [0.86, 0.76, 0.54],
      mullion: [0.84, 0.76, 0.60],
      accent: [0.64, 0.48, 0.28],
      roofDeck: [0.42, 0.38, 0.33],
    },
  },

  // ============================================================================
  // B. 50–90年代多层家属院与老小区板楼系列 (Multi-Story Slabs — S06..S10)
  // ============================================================================
  S06_50s_soviet_redbrick: {
    id: 'S06_50s_soviet_redbrick',
    code: 'S06',
    category: 'slab',
    name: '50年代百万庄/学院路苏式清水红砖坡顶家属楼',
    shortName: 'S06·50年代苏式红砖楼',
    era: '1953–1965',
    bayWidth: 3.5,
    floorHeight: 3.1,
    groundFloorHeight: 3.3,
    symmetry: 'strict',
    roofStyle: 'yingshan_grey_tile',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.64, 0.28, 0.22],
      wallSecondary: [0.82, 0.80, 0.75],
      podiumStone: [0.52, 0.53, 0.51],
      glassDark: [0.18, 0.20, 0.24],
      glassLit: [0.84, 0.70, 0.42],
      mullion: [0.86, 0.84, 0.80],
      accent: [0.36, 0.42, 0.38],
      roofDeck: [0.34, 0.36, 0.39],
    },
  },

  S07_80s_zhichunli_brick_stucco: {
    id: 'S07_80s_zhichunli_brick_stucco',
    code: 'S07',
    category: 'slab',
    name: '80年代知春里红砖混搭米白圈梁板楼 + 蓝铁皮包阳台',
    shortName: 'S07·80年代知春里红砖楼',
    era: '1980–1992',
    bayWidth: 3.6,
    floorHeight: 2.9,
    groundFloorHeight: 3.1,
    symmetry: 'none',
    roofStyle: 'flat_parapet_456',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.71, 0.36, 0.28],
      wallSecondary: [0.82, 0.78, 0.70],
      podiumStone: [0.46, 0.53, 0.49],
      glassDark: [0.18, 0.24, 0.30],
      glassLit: [0.80, 0.68, 0.42],
      mullion: [0.90, 0.92, 0.94],
      accent: [0.20, 0.48, 0.72],
      roofDeck: [0.46, 0.45, 0.43],
    },
  },

  S08_80s_huangzhuang_ochre: {
    id: 'S08_80s_huangzhuang_ochre',
    code: 'S08',
    category: 'slab',
    name: '80年代海淀黄庄/双榆树明黄涂料板楼 + 邮政绿水刷石墙裙',
    shortName: 'S08·80年代黄庄黄涂料楼',
    era: '1982–1995',
    bayWidth: 3.6,
    floorHeight: 2.9,
    groundFloorHeight: 3.1,
    symmetry: 'none',
    roofStyle: 'flat_parapet_456',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.84, 0.72, 0.46],
      wallSecondary: [0.74, 0.63, 0.40],
      podiumStone: [0.30, 0.50, 0.38],
      glassDark: [0.19, 0.25, 0.30],
      glassLit: [0.84, 0.72, 0.44],
      mullion: [0.86, 0.88, 0.90],
      accent: [0.62, 0.24, 0.20],
      roofDeck: [0.48, 0.47, 0.44],
    },
  },

  S09_90s_fangzhuang_redtile: {
    id: 'S09_90s_fangzhuang_redtile',
    code: 'S09',
    category: 'slab',
    name: '90年代方庄/劲松枣红釉面条砖 + 白色分格带多层公寓',
    shortName: 'S09·90年代枣红条砖楼',
    era: '1990–1999',
    bayWidth: 3.7,
    floorHeight: 2.95,
    groundFloorHeight: 3.2,
    symmetry: 'none',
    roofStyle: 'flat_parapet_456',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.56, 0.24, 0.26],
      wallSecondary: [0.88, 0.88, 0.90],
      podiumStone: [0.42, 0.38, 0.40],
      glassDark: [0.14, 0.28, 0.24],
      glassLit: [0.76, 0.72, 0.48],
      mullion: [0.82, 0.84, 0.86],
      accent: [0.18, 0.46, 0.38],
      roofDeck: [0.44, 0.43, 0.45],
    },
  },

  S10_renovated_pastel_slab: {
    id: 'S10_renovated_pastel_slab',
    code: 'S10',
    category: 'slab',
    name: '北京老旧小区综合整治节能改造浅暖灰/藕荷粉刷板楼',
    shortName: 'S10·节能改造粉刷板楼',
    era: '2016–2024 改造',
    bayWidth: 3.6,
    floorHeight: 2.9,
    groundFloorHeight: 3.1,
    symmetry: 'none',
    roofStyle: 'flat_parapet_456',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.80, 0.77, 0.74],
      wallSecondary: [0.68, 0.58, 0.56],
      podiumStone: [0.46, 0.44, 0.43],
      glassDark: [0.17, 0.23, 0.28],
      glassLit: [0.82, 0.72, 0.48],
      mullion: [0.90, 0.90, 0.92],
      accent: [0.48, 0.36, 0.30],
      roofDeck: [0.42, 0.44, 0.46],
    },
  },

  // ============================================================================
  // C. 1995–2024年高层住宅与商品房塔楼系列 (High-Rise Residential — S11..S15)
  // ============================================================================
  S11_90s_yayuncun_bluewhite: {
    id: 'S11_90s_yayuncun_bluewhite',
    code: 'S11',
    category: 'residential_tower',
    name: '90年代亚运村/育新天蓝配纯白马赛克高层塔楼',
    shortName: 'S11·亚运村蓝白瓷砖塔楼',
    era: '1992–2002',
    bayWidth: 3.6,
    floorHeight: 2.95,
    groundFloorHeight: 4.0,
    symmetry: 'semi',
    roofStyle: 'stepped_residential_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [1, 2],
      towerSetback: [1.5, 2.2],
      upperSetbackRatio: 0.90,
      upperSetbackInset: 1.5,
    },
    palette: {
      wallPrimary: [0.86, 0.89, 0.92],
      wallSecondary: [0.28, 0.54, 0.78],
      podiumStone: [0.34, 0.46, 0.60],
      glassDark: [0.16, 0.24, 0.32],
      glassLit: [0.82, 0.74, 0.50],
      mullion: [0.88, 0.90, 0.93],
      accent: [0.20, 0.48, 0.76],
      roofDeck: [0.46, 0.50, 0.54],
    },
  },

  S12_05s_haidian_sienna_bay: {
    id: 'S12_05s_haidian_sienna_bay',
    code: 'S12',
    category: 'residential_tower',
    name: '2005年代海淀/知春路赭石红配米白真石漆飘窗板塔',
    shortName: 'S12·海淀赭石红飘窗塔楼',
    era: '2002–2012',
    bayWidth: 3.8,
    floorHeight: 3.0,
    groundFloorHeight: 4.5,
    symmetry: 'none',
    roofStyle: 'stepped_residential_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [1, 2],
      towerSetback: [1.6, 2.4],
      upperSetbackRatio: 0.86,
      upperSetbackInset: 1.8,
    },
    palette: {
      wallPrimary: [0.68, 0.40, 0.32],
      wallSecondary: [0.87, 0.84, 0.78],
      podiumStone: [0.40, 0.35, 0.32],
      glassDark: [0.16, 0.24, 0.31],
      glassLit: [0.84, 0.74, 0.50],
      mullion: [0.34, 0.36, 0.39],
      accent: [0.54, 0.32, 0.25],
      roofDeck: [0.48, 0.45, 0.43],
    },
  },

  S13_10s_wangjing_khaki_modern: {
    id: 'S13_10s_wangjing_khaki_modern',
    code: 'S13',
    category: 'residential_tower',
    name: '2010年代望京/青年路暖卡其配深咖铝板现代高层公寓',
    shortName: 'S13·望京暖卡其深咖公寓',
    era: '2008–2018',
    bayWidth: 3.9,
    floorHeight: 3.05,
    groundFloorHeight: 4.6,
    symmetry: 'none',
    roofStyle: 'stepped_residential_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [1, 2],
      towerSetback: [1.8, 2.6],
      upperSetbackRatio: 0.86,
      upperSetbackInset: 1.8,
    },
    palette: {
      wallPrimary: [0.76, 0.69, 0.58],
      wallSecondary: [0.36, 0.30, 0.26],
      podiumStone: [0.28, 0.25, 0.22],
      glassDark: [0.15, 0.22, 0.28],
      glassLit: [0.84, 0.75, 0.52],
      mullion: [0.30, 0.28, 0.26],
      accent: [0.52, 0.42, 0.32],
      roofDeck: [0.42, 0.40, 0.38],
    },
  },

  S14_15s_neoclassical_stone: {
    id: 'S14_15s_neoclassical_stone',
    code: 'S14',
    category: 'residential_tower',
    name: '2015年代万柳/大望路法式新古典莱州米黄干挂石材大平层',
    shortName: 'S14·新古典米黄石材公寓',
    era: '2012–2020',
    bayWidth: 4.1,
    floorHeight: 3.3,
    groundFloorHeight: 5.0,
    symmetry: 'strict',
    roofStyle: 'stepped_stone_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2],
      towerSetback: [1.8, 2.5],
      upperSetbackRatio: 0.84,
      upperSetbackInset: 2.0,
    },
    palette: {
      wallPrimary: [0.85, 0.79, 0.66],
      wallSecondary: [0.76, 0.69, 0.56],
      podiumStone: [0.64, 0.57, 0.45],
      glassDark: [0.16, 0.20, 0.24],
      glassLit: [0.88, 0.78, 0.54],
      mullion: [0.22, 0.20, 0.18],
      accent: [0.72, 0.58, 0.32],
      roofDeck: [0.46, 0.44, 0.40],
    },
  },

  S15_20s_silver_minimal_flat: {
    id: 'S15_20s_silver_minimal_flat',
    code: 'S15',
    category: 'residential_tower',
    name: '2020年代银灰铝板配宽幅蓝灰落地玻璃第四代住宅',
    shortName: 'S15·20年代铝板落地窗豪宅',
    era: '2019–2026',
    bayWidth: 4.4,
    floorHeight: 3.25,
    groundFloorHeight: 4.8,
    symmetry: 'semi',
    roofStyle: 'stepped_residential_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [1, 2],
      towerSetback: [2.0, 2.8],
      upperSetbackRatio: 0.86,
      upperSetbackInset: 1.8,
    },
    palette: {
      wallPrimary: [0.38, 0.42, 0.46],
      wallSecondary: [0.76, 0.79, 0.82],
      podiumStone: [0.26, 0.29, 0.33],
      glassDark: [0.14, 0.24, 0.34],
      glassLit: [0.58, 0.76, 0.90],
      mullion: [0.82, 0.85, 0.88],
      accent: [0.48, 0.64, 0.78],
      roofDeck: [0.34, 0.37, 0.40],
    },
  },

  // ============================================================================
  // D. 政教大院、科教高校、医院公建与工业文创系列 (Ministry, Campus & Industrial — S16..S19)
  // ============================================================================
  S16_50s_sanlihe_ministry: {
    id: 'S16_50s_sanlihe_ministry',
    code: 'S16',
    category: 'civic',
    name: '50年代三里河/长安街民族形式大屋顶部委办公楼',
    shortName: 'S16·三里河大屋顶政教楼',
    era: '1954–1965',
    bayWidth: 4.0,
    floorHeight: 3.6,
    groundFloorHeight: 4.6,
    symmetry: 'strict',
    roofStyle: 'xieshan_big_roof',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.68, 0.34, 0.27],
      wallSecondary: [0.77, 0.78, 0.76],
      podiumStone: [0.56, 0.60, 0.58],
      glassDark: [0.16, 0.22, 0.27],
      glassLit: [0.78, 0.70, 0.48],
      mullion: [0.82, 0.80, 0.76],
      accent: [0.74, 0.19, 0.16],
      roofDeck: [0.33, 0.36, 0.40],
    },
  },

  S17_90s_whitetile_blueglass: {
    id: 'S17_90s_whitetile_blueglass',
    code: 'S17',
    category: 'civic',
    name: '80–90年代白瓷砖配湖蓝反光玻璃科研院所/医院门诊楼',
    shortName: 'S17·90年代白瓷砖蓝玻楼',
    era: '1986–1999',
    bayWidth: 4.0,
    floorHeight: 3.5,
    groundFloorHeight: 4.5,
    symmetry: 'semi',
    roofStyle: 'flat_hvac_skylight',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [2.2, 3.2],
      upperSetbackRatio: 0.88,
      upperSetbackInset: 1.8,
    },
    palette: {
      wallPrimary: [0.90, 0.92, 0.93],
      wallSecondary: [0.76, 0.82, 0.86],
      podiumStone: [0.58, 0.64, 0.68],
      glassDark: [0.10, 0.34, 0.54],
      glassLit: [0.28, 0.66, 0.90],
      mullion: [0.84, 0.88, 0.90],
      accent: [0.14, 0.50, 0.78],
      roofDeck: [0.52, 0.55, 0.58],
    },
  },

  S18_campus_redbrick_arch: {
    id: 'S18_campus_redbrick_arch',
    code: 'S18',
    category: 'civic',
    name: '清华北大/学院路暖红砖配汉白玉窗套科教实验楼',
    shortName: 'S18·高校红砖白石科教楼',
    era: '1952–2010',
    bayWidth: 3.8,
    floorHeight: 3.6,
    groundFloorHeight: 4.4,
    symmetry: 'strict',
    roofStyle: 'yingshan_grey_tile',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.66, 0.26, 0.22],
      wallSecondary: [0.88, 0.86, 0.83],
      podiumStone: [0.74, 0.72, 0.69],
      glassDark: [0.17, 0.21, 0.26],
      glassLit: [0.82, 0.72, 0.48],
      mullion: [0.90, 0.88, 0.85],
      accent: [0.78, 0.76, 0.72],
      roofDeck: [0.36, 0.38, 0.42],
    },
  },

  S19_798_industrial_loft: {
    id: 'S19_798_industrial_loft',
    code: 'S19',
    category: 'industrial',
    name: '798/北京卫星制造厂暗红砖配黑钢框大跨度工业厂房',
    shortName: 'S19·798/航天红砖厂房',
    era: '1956–2024',
    bayWidth: 4.8,
    floorHeight: 4.5,
    groundFloorHeight: 5.2,
    symmetry: 'none',
    roofStyle: 'mall_skylight_hvac',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.54, 0.26, 0.22],
      wallSecondary: [0.46, 0.47, 0.49],
      podiumStone: [0.36, 0.37, 0.39],
      glassDark: [0.15, 0.19, 0.23],
      glassLit: [0.86, 0.68, 0.38],
      mullion: [0.18, 0.20, 0.22],
      accent: [0.76, 0.42, 0.18],
      roofDeck: [0.38, 0.40, 0.43],
    },
  },

  // ============================================================================
  // E. 商业综合体、星级饭店与传统胡同古建系列 (Commercial, Hotel & Traditional — S20..S24)
  // ============================================================================
  S20_wudaokou_vibrant_mall: {
    id: 'S20_wudaokou_vibrant_mall',
    code: 'S20',
    category: 'commercial',
    name: '五道口/西单暖白穿孔铝板 + 多彩霓虹门头与巨幅LED商业体',
    shortName: 'S20·五道口多彩商业体',
    era: '2004–2024',
    bayWidth: 4.5,
    floorHeight: 4.2,
    groundFloorHeight: 5.4,
    symmetry: 'none',
    roofStyle: 'mall_skylight_hvac',
    massingRules: {
      allowPodium: true,
      podiumFloors: [3, 4],
      towerSetback: [3.5, 5.0],
      upperSetbackRatio: 0.76,
      upperSetbackInset: 2.5,
    },
    palette: {
      wallPrimary: [0.84, 0.82, 0.78],
      wallSecondary: [0.28, 0.32, 0.38],
      podiumStone: [0.22, 0.25, 0.30],
      glassDark: [0.15, 0.24, 0.34],
      glassLit: [0.60, 0.80, 0.94],
      mullion: [0.74, 0.76, 0.80],
      accent: [0.90, 0.26, 0.20],
      roofDeck: [0.40, 0.43, 0.47],
    },
  },

  S21_sanlitun_obsidian_retail: {
    id: 'S21_sanlitun_obsidian_retail',
    code: 'S21',
    category: 'commercial',
    name: '三里屯/国贸炭黑金属配琥珀金灯带潮流商业裙房',
    shortName: 'S21·三里屯黑金商业体',
    era: '2008–2026',
    bayWidth: 4.5,
    floorHeight: 4.2,
    groundFloorHeight: 5.4,
    symmetry: 'none',
    roofStyle: 'mall_skylight_hvac',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [3.2, 4.5],
      upperSetbackRatio: 0.78,
      upperSetbackInset: 2.2,
    },
    palette: {
      wallPrimary: [0.22, 0.24, 0.27],
      wallSecondary: [0.78, 0.62, 0.32],
      podiumStone: [0.16, 0.17, 0.20],
      glassDark: [0.12, 0.16, 0.22],
      glassLit: [0.92, 0.78, 0.48],
      mullion: [0.80, 0.64, 0.34],
      accent: [0.94, 0.68, 0.18],
      roofDeck: [0.28, 0.30, 0.34],
    },
  },

  S22_90s_bronze_hotel: {
    id: 'S22_90s_bronze_hotel',
    code: 'S22',
    category: 'commercial',
    name: '90年代北京老牌高星级饭店 (古铜茶色反光玻璃 + 浅粉红花岗岩)',
    shortName: 'S22·90年代茶色玻璃饭店',
    era: '1988–2002',
    bayWidth: 4.0,
    floorHeight: 3.6,
    groundFloorHeight: 5.4,
    symmetry: 'semi',
    roofStyle: 'stepped_stone_crown',
    massingRules: {
      allowPodium: true,
      podiumFloors: [2, 3],
      towerSetback: [3.0, 4.4],
      upperSetbackRatio: 0.82,
      upperSetbackInset: 2.2,
    },
    palette: {
      wallPrimary: [0.74, 0.60, 0.56],
      wallSecondary: [0.54, 0.42, 0.36],
      podiumStone: [0.58, 0.44, 0.40],
      glassDark: [0.28, 0.20, 0.14],
      glassLit: [0.76, 0.58, 0.36],
      mullion: [0.68, 0.54, 0.44],
      accent: [0.78, 0.56, 0.28],
      roofDeck: [0.46, 0.38, 0.35],
    },
  },

  S23_shichahai_siheyuan: {
    id: 'S23_shichahai_siheyuan',
    code: 'S23',
    category: 'traditional',
    name: '什刹海/南锣鼓巷官式磨砖对缝青砖四合院 + 朱红广亮大门',
    shortName: 'S23·什刹海青砖四合院',
    era: '清代–民国规制',
    bayWidth: 3.4,
    floorHeight: 3.6,
    groundFloorHeight: 3.8,
    symmetry: 'strict',
    roofStyle: 'yingshan_grey_tile',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.46, 0.48, 0.50],
      wallSecondary: [0.62, 0.63, 0.64],
      podiumStone: [0.76, 0.75, 0.72],
      glassDark: [0.22, 0.18, 0.16],
      glassLit: [0.86, 0.68, 0.38],
      mullion: [0.68, 0.18, 0.15],
      accent: [0.78, 0.20, 0.16],
      roofDeck: [0.30, 0.32, 0.35],
    },
  },

  S24_imperial_palace: {
    id: 'S24_imperial_palace',
    code: 'S24',
    category: 'traditional',
    name: '故宫/皇家坛庙宫廷朱红墙 + 汉白玉须弥座 + 金黄琉璃瓦重檐大殿',
    shortName: 'S24·皇家红墙黄瓦宫殿',
    era: '明清皇家官式',
    bayWidth: 4.2,
    floorHeight: 4.5,
    groundFloorHeight: 5.2,
    symmetry: 'strict',
    roofStyle: 'imperial_golden_roof',
    massingRules: { allowPodium: false, podiumFloors: [0], towerSetback: [0], upperSetbackRatio: 1.0, upperSetbackInset: 0 },
    palette: {
      wallPrimary: [0.70, 0.18, 0.16],
      wallSecondary: [0.16, 0.48, 0.38], // Qing-green Hexi painted beam (青绿和玺彩画额枋)
      podiumStone: [0.90, 0.88, 0.84],   // White marble Xumizuo pedestal (汉白玉须弥座)
      glassDark: [0.26, 0.14, 0.12],
      glassLit: [0.92, 0.74, 0.36],
      mullion: [0.78, 0.58, 0.22],       // Gilded lattice mullions
      accent: [0.92, 0.72, 0.18],        // Imperial glazed yellow (琉璃金黄)
      roofDeck: [0.88, 0.66, 0.16],
    },
  },
};

export const STYLE_24_KEYS = Object.keys(BEIJING_STYLES_24);

// Legacy 6-archetype alias map for backwards compatibility in Demo selectors
export const LEGACY_ARCHETYPE_TO_STYLE24 = {
  zgc_tech_office: 'S01_zgc_pailou_glass',
  danwei_slab_80s: 'S07_80s_zhichunli_brick_stucco',
  residential_tower_00s: 'S12_05s_haidian_sienna_bay',
  ministry_big_roof: 'S16_50s_sanlihe_ministry',
  commercial_podium: 'S20_wudaokou_vibrant_mall',
  hutong_courtyard: 'S23_shichahai_siheyuan',
};

export const BEIJING_ARCHETYPES = new Proxy(BEIJING_STYLES_24, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop in LEGACY_ARCHETYPE_TO_STYLE24) return target[LEGACY_ARCHETYPE_TO_STYLE24[prop]];
    return target.S01_zgc_pailou_glass;
  },
});

/**
 * Complete catalog of 2D Facade WFC Tiles.
 */
export const FACADE_TILES = {
  // ==================== GROUND ROW (y = 0) ====================
  G_CORNER_PIER: {
    id: 'G_CORNER_PIER',
    label: '首层转角结构壁柱 (Corner Pier)',
    layer: 'ground',
    sockets: { n: 'V_CORNER', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    cornerOnly: true,
    reliefDepth: 0.24,
    vizColor: '#5c6bc0',
  },
  G_LOBBY_GLASS: {
    id: 'G_LOBBY_GLASS',
    label: '挑高玻璃幕墙大堂 + 悬挑雨棚 (Glass Lobby)',
    layer: 'ground',
    sockets: { n: 'V_LOBBY_TOP', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    centerPreferred: true,
    reliefDepth: -0.35,
    vizColor: '#29b6f6',
  },
  G_COLONNADE: {
    id: 'G_COLONNADE',
    label: '首层石材柱廊骑楼 (Podium Colonnade)',
    layer: 'ground',
    sockets: { n: 'V_PILASTER', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: -0.45,
    vizColor: '#4dd0e1',
  },
  G_SHOP_RED: {
    id: 'G_SHOP_RED',
    label: '临街底商门头 · 暖红灯箱招牌 + 落地橱窗',
    layer: 'ground',
    sockets: { n: 'V_STD', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.32,
    vizColor: '#ef5350',
  },
  G_SHOP_BLUE: {
    id: 'G_SHOP_BLUE',
    label: '临街底商门头 · 科技蓝灯箱招牌 + 落地橱窗',
    layer: 'ground',
    sockets: { n: 'V_STD', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.32,
    vizColor: '#42a5f5',
  },
  G_SHOP_GOLD: {
    id: 'G_SHOP_GOLD',
    label: '临街底商门头 · 琥珀金灯箱招牌 + 落地橱窗',
    layer: 'ground',
    sockets: { n: 'V_STD', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.32,
    vizColor: '#ffca28',
  },
  G_UNIT_ENTRY: {
    id: 'G_UNIT_ENTRY',
    label: '家属楼单元门厅 + 混凝土雨搭 (强制上方生成连续楼梯间采光窗列)',
    layer: 'ground',
    sockets: { n: 'V_STAIR_SHAFT', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.85,
    vizColor: '#ff7043',
  },
  G_DADO_WIN: {
    id: 'G_DADO_WIN',
    label: '首层水刷石墙裙 + 防盗窗标准间 (Dado Window)',
    layer: 'ground',
    sockets: { n: 'V_STD', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.08,
    vizColor: '#8d6e63',
  },
  G_DADO_BALCONY_BASE: {
    id: 'G_DADO_BALCONY_BASE',
    label: '首层包阳台基座间 (强制上方生成垂直连续凸阳台列)',
    layer: 'ground',
    sockets: { n: 'V_BALCONY_SHAFT', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.52,
    vizColor: '#66bb6a',
  },
  G_TOWER_BAY_BASE: {
    id: 'G_TOWER_BAY_BASE',
    label: '首层花岗岩基座 + 飘窗起止位 (强制上方生成垂直飘窗列)',
    layer: 'ground',
    sockets: { n: 'V_BAY_SHAFT', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.38,
    vizColor: '#ab47bc',
  },
  G_TOWER_LOUVER_BASE: {
    id: 'G_TOWER_LOUVER_BASE',
    label: '首层花岗岩基座 + 设备通风口 (强制上方生成垂直百叶格栅列)',
    layer: 'ground',
    sockets: { n: 'V_LOUVER_SHAFT', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: -0.15,
    vizColor: '#78909c',
  },
  G_MINISTRY_PORTICO: {
    id: 'G_MINISTRY_PORTICO',
    label: '政教大楼居中红柱门斗 + 水刷石台阶雨搭 (Ministry Portico)',
    layer: 'ground',
    sockets: { n: 'V_PILASTER', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    centerPreferred: true,
    reliefDepth: 1.15,
    vizColor: '#d32f2f',
  },
  G_HUTONG_GATE: {
    id: 'G_HUTONG_GATE',
    label: '四合院朱红广亮大门 + 汉白玉抱鼓石 + 门簪 (Courtyard Gate)',
    layer: 'ground',
    sockets: { n: 'V_HUTONG_TOP', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    centerPreferred: true,
    reliefDepth: 0.45,
    vizColor: '#c62828',
  },
  G_HUTONG_LATTICE: {
    id: 'G_HUTONG_LATTICE',
    label: '四合院青砖墙 + 朱红步步锦木格扇窗 (Courtyard Lattice Window)',
    layer: 'ground',
    sockets: { n: 'V_HUTONG_TOP', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: -0.12,
    vizColor: '#90a4ae',
  },
  G_HUTONG_BRICK: {
    id: 'G_HUTONG_BRICK',
    label: '四合院磨砖对缝青砖实墙 + 什锦高窗 (Courtyard Brick Wall)',
    layer: 'ground',
    sockets: { n: 'V_HUTONG_TOP', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.04,
    vizColor: '#607d8b',
  },
  G_IMPERIAL_COLONNADE: {
    id: 'G_IMPERIAL_COLONNADE',
    label: '皇家宫殿汉白玉须弥座 + 朱红檐柱 + 金丝楠木隔扇窗',
    layer: 'ground',
    sockets: { n: 'V_IMPERIAL_TOP', e: 'H_GROUND', s: 'FOUNDATION', w: 'H_GROUND' },
    interiorOnly: true,
    reliefDepth: 0.35,
    vizColor: '#b71c1c',
  },

  // ==================== MIDDLE / STANDARD ROWS (1 <= y < Ny - 1) ====================
  M_CORNER_PIER: {
    id: 'M_CORNER_PIER',
    label: '标准层转角实墙墩 / 幕墙转角立柱 (Corner Column)',
    layer: 'mid',
    sockets: { n: 'V_CORNER', e: 'H_MID', s: 'V_CORNER', w: 'H_MID' },
    cornerOnly: true,
    reliefDepth: 0.22,
    vizColor: '#3f51b5',
  },
  M_WALL_STD: {
    id: 'M_WALL_STD',
    label: '标准层凹入式双扇窗 + 窗台线脚 (Standard Window Bay)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: -0.14,
    vizColor: '#a1887f',
  },
  M_WALL_AC: {
    id: 'M_WALL_AC',
    label: '标准层双扇窗 + 外挂分体式空调外机 (Window + Split AC Unit)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.35,
    vizColor: '#8d6e63',
  },
  M_RIBBON_WIN: {
    id: 'M_RIBBON_WIN',
    label: '水平连续窗带 + 浅色铝塑板/白瓷砖横梁 (Horizontal Ribbon Window)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.16,
    vizColor: '#00acc1',
  },
  M_ARCH_WIN: {
    id: 'M_ARCH_WIN',
    label: '高校/苏式红砖墙 + 汉白玉石材窗套高窗 (Campus/Soviet Framed Window)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.20,
    vizColor: '#c62828',
  },
  M_INDUSTRIAL_LOFT: {
    id: 'M_INDUSTRIAL_LOFT',
    label: '798工业厂房暗红砖壁柱 + 黑钢框大跨度网格高窗 (Industrial Loft Bay)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.24,
    vizColor: '#d84315',
  },
  M_FRENCH_BALCONY: {
    id: 'M_FRENCH_BALCONY',
    label: '新古典干挂石材立面 + 黑金铁艺法式护栏窗 (Neoclassical French Window)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.28,
    vizColor: '#fbc02d',
  },
  M_PANORAMA_GLASS: {
    id: 'M_PANORAMA_GLASS',
    label: '第四代大平层金属细框 + 宽幅蓝灰全景落地玻璃 (Panorama Floor-to-Ceiling Glass)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.22,
    vizColor: '#29b6f6',
  },
  M_BALCONY_ENC: {
    id: 'M_BALCONY_ENC',
    label: '凸出式白塑钢包阳台 + 遮阳雨棚 (垂直连续列 V_BALCONY_SHAFT)',
    layer: 'mid',
    sockets: { n: 'V_BALCONY_SHAFT', e: 'H_MID', s: 'V_BALCONY_SHAFT', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.62,
    vizColor: '#4caf50',
  },
  M_BALCONY_OPEN: {
    id: 'M_BALCONY_OPEN',
    label: '敞开式铁艺栏杆阳台 + 花池护栏 (垂直连续列 V_BALCONY_SHAFT)',
    layer: 'mid',
    sockets: { n: 'V_BALCONY_SHAFT', e: 'H_MID', s: 'V_BALCONY_SHAFT', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.56,
    vizColor: '#66bb6a',
  },
  M_STAIR_WINDOW: {
    id: 'M_STAIR_WINDOW',
    label: '错层楼梯间垂直窄窗列 (严格对齐首层单元门 V_STAIR_SHAFT)',
    layer: 'mid',
    sockets: { n: 'V_STAIR_SHAFT', e: 'H_MID', s: 'V_STAIR_SHAFT', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: -0.18,
    vizColor: '#ff5722',
  },
  M_BAY_WINDOW: {
    id: 'M_BAY_WINDOW',
    label: '商品房外凸立体飘窗 + 上下石材窗台板 (垂直连续列 V_BAY_SHAFT)',
    layer: 'mid',
    sockets: { n: 'V_BAY_SHAFT', e: 'H_MID', s: 'V_BAY_SHAFT', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.44,
    vizColor: '#9c27b0',
  },
  M_AC_LOUVER: {
    id: 'M_AC_LOUVER',
    label: '深灰铝合金空调外机百叶格栅井 (垂直连续列 V_LOUVER_SHAFT)',
    layer: 'mid',
    sockets: { n: 'V_LOUVER_SHAFT', e: 'H_MID', s: 'V_LOUVER_SHAFT', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: -0.20,
    vizColor: '#546e7a',
  },
  M_PILASTER_WIN: {
    id: 'M_PILASTER_WIN',
    label: '竖向水刷石/花岗岩壁柱肋 + 内凹高窗 (垂直连续列 V_PILASTER)',
    layer: 'mid',
    sockets: { n: 'V_PILASTER', e: 'H_MID', s: 'V_PILASTER', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.26,
    vizColor: '#26a69a',
  },
  M_CURTAIN_GLASS: {
    id: 'M_CURTAIN_GLASS',
    label: '现代玻璃幕墙标准分格 + 竖向铝翼肋 (Curtain Wall Bay)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.12,
    vizColor: '#0288d1',
  },
  M_LOBBY_MEZZANINE: {
    id: 'M_LOBBY_MEZZANINE',
    label: '二层挑空大堂通高玻璃中庭 (连接首层大堂 V_LOBBY_TOP)',
    layer: 'mid',
    sockets: { n: 'V_PILASTER', e: 'H_MID', s: 'V_LOBBY_TOP', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: -0.28,
    vizColor: '#00acc1',
  },
  M_LED_SCREEN: {
    id: 'M_LED_SCREEN',
    label: '商业外立面发光巨幅LED幕墙模块 (Commercial Media Screen)',
    layer: 'mid',
    sockets: { n: 'V_STD', e: 'H_MID', s: 'V_STD', w: 'H_MID' },
    interiorOnly: true,
    reliefDepth: 0.28,
    vizColor: '#e91e63',
  },

  // ==================== TOP / CORNICE ROW (y = Ny - 1) ====================
  T_CORNER_CROWN: {
    id: 'T_CORNER_CROWN',
    label: '顶层转角挑檐收头墩 (Corner Crown Cap)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_CORNER', w: 'H_TOP' },
    cornerOnly: true,
    reliefDepth: 0.36,
    vizColor: '#303f9f',
  },
  T_PARAPET_CORNICE: {
    id: 'T_PARAPET_CORNICE',
    label: '顶层挑檐压顶线脚 + 女儿墙 (Standard Cornice Cap)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_STD', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.34,
    vizColor: '#795548',
  },
  T_BALCONY_CAP: {
    id: 'T_BALCONY_CAP',
    label: '顶层包阳台遮阳顶板封檐 (对齐凸阳台列 V_BALCONY_SHAFT)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_BALCONY_SHAFT', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.65,
    vizColor: '#2e7d32',
  },
  T_STAIR_BULKHEAD: {
    id: 'T_STAIR_BULKHEAD',
    label: '楼梯间出屋面挑高门头封顶 (对齐楼梯间列 V_STAIR_SHAFT)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_STAIR_SHAFT', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.45,
    vizColor: '#d84315',
  },
  T_BAY_CAP: {
    id: 'T_BAY_CAP',
    label: '顶层飘窗退台挑檐压顶 (对齐飘窗列 V_BAY_SHAFT)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_BAY_SHAFT', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.48,
    vizColor: '#6a1b9a',
  },
  T_LOUVER_CAP: {
    id: 'T_LOUVER_CAP',
    label: '顶层百叶设备井排风帽 (对齐百叶列 V_LOUVER_SHAFT)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_LOUVER_SHAFT', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.25,
    vizColor: '#37474f',
  },
  T_PAILOU_CROWN: {
    id: 'T_PAILOU_CROWN',
    label: '中关村新中式牌楼挑檐冠顶 (京东科技大厦/翠宫饭店特征冠顶)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_PILASTER', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.72,
    vizColor: '#c62828',
  },
  T_MINISTRY_EAVE: {
    id: 'T_MINISTRY_EAVE',
    label: '民族形式大屋顶简化斗拱额枋挑檐 (Ministry Cornice Eave)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_PILASTER', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.68,
    vizColor: '#00695c',
  },
  T_HUTONG_EAVE: {
    id: 'T_HUTONG_EAVE',
    label: '四合院青砖菱角檐与博风头出檐 (Courtyard Eave)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_HUTONG_TOP', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.42,
    vizColor: '#455a64',
  },
  T_IMPERIAL_DOUGONG: {
    id: 'T_IMPERIAL_DOUGONG',
    label: '皇家宫殿青绿和玺彩画额枋与斗拱挑檐 (Imperial Dougong Cornice)',
    layer: 'top',
    sockets: { n: 'SKY', e: 'H_TOP', s: 'V_IMPERIAL_TOP', w: 'H_TOP' },
    interiorOnly: true,
    reliefDepth: 0.85,
    vizColor: '#f57f17',
  },
};

/**
 * Returns the 2D Facade Tile weight table for any of the 24 Beijing styles (or legacy 6 keys).
 */
export function getStyle24TileWeights(styleId) {
  const resolved = LEGACY_ARCHETYPE_TO_STYLE24[styleId] || styleId;

  switch (resolved) {
    case 'S01_zgc_pailou_glass':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 12, G_COLONNADE: 16, G_SHOP_BLUE: 5 },
        mid: { M_CORNER_PIER: 10, M_CURTAIN_GLASS: 18, M_PILASTER_WIN: 14, M_LOBBY_MEZZANINE: 12 },
        top: { T_CORNER_CROWN: 10, T_PAILOU_CROWN: 18, T_PARAPET_CORNICE: 12 },
      };

    case 'S02_cbd_sapphire_curtain':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 18, G_COLONNADE: 12 },
        mid: { M_CORNER_PIER: 10, M_CURTAIN_GLASS: 26, M_PANORAMA_GLASS: 12, M_LOBBY_MEZZANINE: 14 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 22 },
      };

    case 'S03_emerald_ribbon_tech':
    case 'S17_90s_whitetile_blueglass':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 12, G_SHOP_BLUE: 14, G_DADO_WIN: 10 },
        mid: { M_CORNER_PIER: 10, M_RIBBON_WIN: 26, M_CURTAIN_GLASS: 10, M_LOBBY_MEZZANINE: 10 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 24 },
      };

    case 'S04_granite_rib_financial':
    case 'S05_champagne_artdeco_tower':
    case 'S22_90s_bronze_hotel':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 14, G_COLONNADE: 20, G_SHOP_GOLD: 8 },
        mid: { M_CORNER_PIER: 10, M_PILASTER_WIN: 24, M_CURTAIN_GLASS: 10, M_LOBBY_MEZZANINE: 12 },
        top: { T_CORNER_CROWN: 10, T_PAILOU_CROWN: 12, T_PARAPET_CORNICE: 18 },
      };

    case 'S06_50s_soviet_redbrick':
    case 'S18_campus_redbrick_arch':
      return {
        ground: { G_CORNER_PIER: 10, G_MINISTRY_PORTICO: 10, G_DADO_WIN: 18, G_DADO_BALCONY_BASE: 8 },
        mid: { M_CORNER_PIER: 10, M_ARCH_WIN: 22, M_BALCONY_OPEN: 12, M_PILASTER_WIN: 10 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 20, T_BALCONY_CAP: 12, T_MINISTRY_EAVE: 12 },
      };

    case 'S07_80s_zhichunli_brick_stucco':
    case 'S08_80s_huangzhuang_ochre':
    case 'S09_90s_fangzhuang_redtile':
    case 'S10_renovated_pastel_slab':
      return {
        ground: { G_CORNER_PIER: 10, G_UNIT_ENTRY: 9, G_DADO_WIN: 14, G_DADO_BALCONY_BASE: 18 },
        mid: { M_CORNER_PIER: 10, M_WALL_STD: 14, M_WALL_AC: 12, M_BALCONY_ENC: 17, M_BALCONY_OPEN: 9, M_STAIR_WINDOW: 15 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 16, T_BALCONY_CAP: 20, T_STAIR_BULKHEAD: 16 },
      };

    case 'S11_90s_yayuncun_bluewhite':
    case 'S12_05s_haidian_sienna_bay':
    case 'S13_10s_wangjing_khaki_modern':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 6, G_DADO_WIN: 10, G_TOWER_BAY_BASE: 18, G_TOWER_LOUVER_BASE: 9, G_DADO_BALCONY_BASE: 12 },
        mid: { M_CORNER_PIER: 10, M_WALL_STD: 10, M_WALL_AC: 8, M_BAY_WINDOW: 18, M_AC_LOUVER: 10, M_BALCONY_ENC: 12, M_BALCONY_OPEN: 7, M_LOBBY_MEZZANINE: 8 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 12, T_BAY_CAP: 18, T_LOUVER_CAP: 12, T_BALCONY_CAP: 12 },
      };

    case 'S14_15s_neoclassical_stone':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 12, G_COLONNADE: 16, G_TOWER_BAY_BASE: 14 },
        mid: { M_CORNER_PIER: 10, M_FRENCH_BALCONY: 22, M_PILASTER_WIN: 16, M_BAY_WINDOW: 14, M_LOBBY_MEZZANINE: 10 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 20, T_BAY_CAP: 14, T_PAILOU_CROWN: 8 },
      };

    case 'S15_20s_silver_minimal_flat':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 16, G_DADO_BALCONY_BASE: 16 },
        mid: { M_CORNER_PIER: 10, M_PANORAMA_GLASS: 26, M_BALCONY_OPEN: 16, M_LOBBY_MEZZANINE: 12 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 22, T_BALCONY_CAP: 16 },
      };

    case 'S16_50s_sanlihe_ministry':
      return {
        ground: { G_CORNER_PIER: 10, G_MINISTRY_PORTICO: 14, G_COLONNADE: 18, G_DADO_WIN: 10 },
        mid: { M_CORNER_PIER: 10, M_PILASTER_WIN: 24, M_ARCH_WIN: 10 },
        top: { T_CORNER_CROWN: 10, T_MINISTRY_EAVE: 24, T_PARAPET_CORNICE: 8 },
      };

    case 'S19_798_industrial_loft':
      return {
        ground: { G_CORNER_PIER: 10, G_SHOP_GOLD: 10, G_COLONNADE: 14, G_DADO_WIN: 14 },
        mid: { M_CORNER_PIER: 10, M_INDUSTRIAL_LOFT: 28, M_PILASTER_WIN: 10 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 24 },
      };

    case 'S20_wudaokou_vibrant_mall':
    case 'S21_sanlitun_obsidian_retail':
      return {
        ground: { G_CORNER_PIER: 10, G_LOBBY_GLASS: 12, G_SHOP_RED: 14, G_SHOP_BLUE: 12, G_SHOP_GOLD: 14 },
        mid: { M_CORNER_PIER: 10, M_CURTAIN_GLASS: 14, M_LED_SCREEN: 14, M_PANORAMA_GLASS: 12, M_LOBBY_MEZZANINE: 10 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 20, T_PAILOU_CROWN: 8 },
      };

    case 'S23_shichahai_siheyuan':
      return {
        ground: { G_CORNER_PIER: 10, G_HUTONG_GATE: 14, G_HUTONG_LATTICE: 20, G_HUTONG_BRICK: 12 },
        mid: { M_CORNER_PIER: 10, M_WALL_STD: 15 },
        top: { T_CORNER_CROWN: 10, T_HUTONG_EAVE: 25 },
      };

    case 'S24_imperial_palace':
      return {
        ground: { G_CORNER_PIER: 10, G_IMPERIAL_COLONNADE: 28 },
        mid: { M_CORNER_PIER: 10, M_PILASTER_WIN: 20 },
        top: { T_CORNER_CROWN: 10, T_IMPERIAL_DOUGONG: 28 },
      };

    default:
      return {
        ground: { G_CORNER_PIER: 10, G_DADO_WIN: 15, G_DADO_BALCONY_BASE: 15 },
        mid: { M_CORNER_PIER: 10, M_WALL_STD: 15, M_BALCONY_ENC: 15 },
        top: { T_CORNER_CROWN: 10, T_PARAPET_CORNICE: 15, T_BALCONY_CAP: 15 },
      };
  }
}

export const ARCHETYPE_TILE_WEIGHTS = new Proxy(
  {},
  {
    get(_, prop) {
      return getStyle24TileWeights(String(prop));
    },
  }
);

export const ROOF_WFC_TILES = {
  R_BORDER_PARAPET: {
    id: 'R_BORDER_PARAPET',
    label: '屋面女儿墙压顶边界 (Perimeter Parapet)',
    sockets: { n: 'R_ANY', e: 'R_ANY', s: 'R_ANY', w: 'R_ANY' },
    borderOnly: true,
    vizColor: '#78909c',
  },
  R_OPEN_DECK: {
    id: 'R_OPEN_DECK',
    label: '防水卷材平屋面步道 (Open Roof Deck)',
    sockets: { n: 'R_DECK', e: 'R_DECK', s: 'R_DECK', w: 'R_DECK' },
    interiorOnly: true,
    vizColor: '#b0bec5',
  },
  R_PENTHOUSE: {
    id: 'R_PENTHOUSE',
    label: '电梯机房层 / 屋顶水箱间 (Elevator Penthouse)',
    sockets: { n: 'R_DECK', e: 'R_DECK', s: 'R_DECK', w: 'R_DECK' },
    interiorOnly: true,
    vizColor: '#5c6bc0',
  },
  R_HVAC_TOWER: {
    id: 'R_HVAC_TOWER',
    label: '中央空调冷却塔阵列 (HVAC Cooling Towers)',
    sockets: { n: 'R_DECK', e: 'R_DECK', s: 'R_DECK', w: 'R_DECK' },
    interiorOnly: true,
    vizColor: '#26a69a',
  },
  R_SOLAR_BANK: {
    id: 'R_SOLAR_BANK',
    label: '屋顶光伏太阳能板矩阵 (Photovoltaic Array)',
    sockets: { n: 'R_DECK', e: 'R_DECK', s: 'R_DECK', w: 'R_DECK' },
    interiorOnly: true,
    vizColor: '#1e88e5',
  },
  R_SKYLIGHT_ATRIUM: {
    id: 'R_SKYLIGHT_ATRIUM',
    label: '中庭采光玻璃天窗 (Atrium Glass Skylight)',
    sockets: { n: 'R_DECK', e: 'R_DECK', s: 'R_DECK', w: 'R_DECK' },
    interiorOnly: true,
    vizColor: '#29b6f6',
  },
};
