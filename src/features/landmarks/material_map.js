/**
 * [lm-materials] Per-landmark mapping from each model's flat colours (named constants in models/*.js) to the
 * procedural material library (materials.js), plus its night lighting.
 *
 *   stone: library material for the model's light / neutral masonry colours that are not listed
 *   map:   { hex: material }   explicit colour -> material (a model's own k.color(hex, mat) / k.mat() wins)
 *   night: { up, upK, upH, upBase, win, winK, glow }  floodlight colour / strength / falloff height (m) / share kept
 *          at the top, the lit-window colour / strength of glass, and the tint of the model's night-glow bucket.
 *          Missing = no floodlight, default windows, white glow.
 * Colours in neither list fall back to classifyColor() (materials.js, called by the Kit).
 */
const WARM = { up: 0xffc98a, upK: 0.4, upH: 30, upBase: 0.35 };          // sodium / warm-white floodlight
const WHITE = { up: 0xfff1dc, upK: 0.45, upH: 40, upBase: 0.45 };
const TOWER = { winK: 1.0 };                                             // lit offices, no floodlight

// Chinese imperial palette shared by the Beijing models (cn_arch.js): red-lacquered plaster, glazed tiles, gilt
const CN = {
  0x173b70: "painted", 0x1f4f95: "painted", 0x2a4f86: "painted", 0x2d6a5e: "painted", 0x3d7f72: "painted",
  0x245e3a: "terracotta", 0x2f7a4c: "terracotta", 0x2a764a: "terracotta",
  0x4a140e: "painted", 0x6e1f19: "stucco", 0x7a1a14: "stucco", 0x8f2418: "stucco", 0x93271f: "stucco", 0xa3231b: "stucco",
  0x6f6a63: "slate", 0x77736c: "slate", 0xa39b8d: "granite", 0xb3ad9f: "granite", 0xbcb4a6: "marble", 0xcac5b8: "marble", 0xebe8df: "marble",
  0xb07d14: "terracotta", 0xd8ae45: "terracotta", 0xd9a021: "terracotta", 0xe8b83a: "terracotta", 0xb9852f: "painted",
  0xffdf48: "gold", 0xf8c630: "terracotta", 0xffd59a: "plain", 0xff3b1c: "plain",
};

export const MATERIAL_MAP = {
  // --- New York
  liberty: { stone: "granite", map: { 0x4f8a79: "copper", 0x6aa996: "copper", 0x86c0ad: "copper", 0x5d554b: "dark", 0x6f8f4e: "foliage", 0xb9ae98: "granite", 0xcdc6b2: "concrete", 0xc99a3c: "gold", 0xffc24a: "gold", 0x9c8f7d: "granite" }, night: { up: 0xfff4e0, upK: 0.55, upH: 60, upBase: 0.5 } },
  empire: { stone: "limestone", map: { 0x47423a: "glass", 0x5b6670: "glass", 0x8d939a: "steel", 0xb8bdc3: "steel", 0xc9ced4: "steel", 0xd6d9de: "steel", 0x5a5446: "painted", 0x6a5a40: "painted", 0x6a6050: "painted", 0x8a7550: "painted" }, night: { ...TOWER, up: 0xfff0d0, upK: 0.12, upH: 120, upBase: 0.2 } },
  chrysler: { stone: "limestone", map: { 0x3f4247: "glass", 0x4b4f55: "brick", 0xaab1b9: "steel", 0xd6dbe1: "steel", 0xc8ccd0: "steel", 0xcfcbc2: "brick", 0xd9d6cf: "brick", 0x7b6a52: "painted" }, night: TOWER },
  onewtc: { stone: "concrete", map: { 0x6f8193: "glass", 0x8a9aa8: "glass", 0x8ea3c4: "glass", 0xa6b8d2: "glass", 0xc4d0e0: "glass", 0x9aa3ac: "steel", 0xaab7c2: "steel", 0xc9d1d8: "steel", 0xd8dde2: "steel" }, night: TOWER },
  // --- Paris / Europe
  eiffel: { stone: "limestone", map: { 0x7d6650: "painted", 0x5e4b3b: "painted", 0x6a5644: "painted", 0x8a7764: "painted", 0xb8b2a8: "concrete", 0xc9c4ba: "limestone", 0xd9d4ca: "limestone" }, night: { up: 0xffb757, upK: 0.5, upH: 160, upBase: 0.55, glow: 0xffb45a } },
  arcdetriomphe: { stone: "limestone", map: { 0x6b6355: "dark", 0x7d7564: "limestone" }, night: { up: 0xffd59a, upK: 0.6, upH: 30, upBase: 0.45 } },
  westminster: { stone: "limestone", map: { 0x323e4a: "slate", 0x36373b: "glass", 0x56616b: "slate", 0xb5a684: "sandstone", 0xb7a177: "sandstone", 0xcdb88d: "sandstone", 0xd0a84e: "gold", 0xc8102e: "plain", 0x18181a: "dark", 0xfff9ea: "plain" }, night: { up: 0xffcf8a, upK: 0.55, upH: 45, upBase: 0.5 } },
  londoneye: { stone: "concrete", map: { 0x9aa2aa: "steel", 0xbfc4c9: "steel", 0xc9ced3: "steel", 0xd6dade: "steel", 0xeef0f2: "painted", 0xa8c6d4: "glass", 0x6e737a: "concrete", 0xe8e2d0: "concrete" } },
  towerbridge: { stone: "granite", map: { 0x2c2e31: "dark", 0x2f3236: "glass", 0x45484c: "concrete", 0x4b525b: "slate", 0x5c8fbf: "painted", 0x5f8fb8: "painted", 0x6aa6db: "painted", 0x9fc6e6: "painted", 0x9c968a: "granite", 0xb8ab8f: "limestone", 0xd3c8ae: "limestone", 0xd8b65a: "gold", 0xf2f2ee: "painted" }, night: WARM },
  brandenburg: { stone: "sandstone", map: { 0x456d5a: "copper", 0x5d8c74: "copper" }, night: { up: 0xffd8a0, upK: 0.7, upH: 25, upBase: 0.5 } },
  colosseum: { stone: "travertine", map: { 0x5e4632: "dark", 0x6a5644: "granite", 0x8c563d: "brick", 0xa86a4c: "brick", 0xb7a07f: "sandstone", 0xb08a5c: "wood" }, night: { up: 0xffb45c, upK: 0.62, upH: 14, upBase: 0.18 } },
  pisa: { stone: "marble", map: { 0x6f675b: "limestone", 0x8e8577: "limestone", 0x7a6a44: "painted", 0x7d9a55: "foliage", 0xf1ebdc: "marble" }, night: { up: 0xfff0d6, upK: 0.55, upH: 40, upBase: 0.5 } },
  stbasil: { stone: "stucco", map: { 0x2a8a8a: "painted", 0x2e8b4f: "painted", 0x2f6fb0: "painted", 0x2f8a52: "painted", 0x3a2a22: "dark", 0x4a2a20: "dark", 0x8a3323: "brick", 0xa9412c: "brick", 0xc23a2b: "painted", 0xd6a93e: "gold", 0xd8a22e: "painted", 0xe0b23c: "gold", 0xe8c64a: "painted", 0xe8d7a8: "stucco", 0xeee3b0: "painted", 0xf0e6c0: "stucco", 0xe9e1cf: "stucco", 0xeee8da: "stucco", 0xf1ece0: "stucco" }, night: WARM },
  // --- San Francisco
  coit: { stone: "concrete", map: { 0x34373e: "glass" }, night: WHITE },
  transamerica: { stone: "concrete", map: { 0x2f363d: "glass", 0x5d6974: "glass", 0xd6d9dc: "steel", 0xd9d5cb: "concrete", 0xeeebe3: "concrete" }, night: TOWER },
  salesforce: { stone: "concrete", map: { 0x5a6670: "glass", 0x6b7177: "concrete", 0x8ea4b4: "glass", 0xa7bccb: "glass", 0xe8eef6: "steel", 0xe9e7e1: "steel", 0xf1efe9: "steel" }, night: TOWER },
  palacefinearts: { stone: "stucco", map: { 0x5f554b: "dark", 0x7f9a7c: "foliage", 0xae6f40: "copper", 0xc98650: "terracotta", 0xcfc4b0: "concrete", 0xd49157: "stucco", 0xbf835f: "stucco", 0xd9a07c: "stucco", 0xa39686: "concrete" }, night: { up: 0xffc070, upK: 0.65, upH: 25, upBase: 0.4 } },
  ferrybuilding: { stone: "sandstone", map: { 0x1e1e1e: "dark", 0x2f3438: "glass", 0x3a3832: "glass", 0x3b3a36: "painted", 0x7b8580: "slate", 0x8a9a86: "copper", 0x9fb2bb: "glass", 0xb6a582: "sandstone", 0xc4b79c: "limestone", 0xdcd2bb: "sandstone", 0xe8e0cc: "sandstone", 0xfff6dc: "plain" }, night: WARM },
  // --- Americas
  spaceneedle: { stone: "concrete", map: { 0x46535e: "glass", 0xbdb8ae: "concrete", 0xd2cfc6: "painted", 0xefede6: "painted", 0xd99a3a: "painted" }, night: { up: 0xf2f4ff, upK: 0.35, upH: 80, upBase: 0.5 } },
  gatewayarch: { stone: "steel", map: { 0x9ea4aa: "steel", 0xc9ced3: "steel", 0xb9b4aa: "concrete" }, night: { up: 0xfff4e6, upK: 0.45, upH: 120, upBase: 0.6 } },
  cntower: { stone: "concrete", map: { 0x3f4a55: "glass", 0x59636c: "glass", 0xa7adb3: "steel", 0xd2d6da: "steel", 0xeeeeea: "painted" }, night: TOWER },
  christ: { stone: "concrete", map: { 0x4a463e: "granite", 0x5b5a4e: "granite", 0x6f6c5f: "granite", 0x6d7a52: "foliage", 0x8f8a7e: "concrete", 0xdcd9cc: "concrete", 0xc3c0b2: "concrete", 0xa9a698: "concrete" }, night: { up: 0xf4f6ff, upK: 0.9, upH: 40, upBase: 0.6 } },
  washmonument: { stone: "marble", map: { 0x2b2b2e: "glass", 0x3a3631: "painted", 0x9c968b: "granite", 0xbab3a6: "granite", 0xb8b8b8: "steel", 0xd8d8d8: "steel", 0xf4f4f4: "plain", 0xb22234: "plain", 0x3c3b6e: "plain" }, night: { up: 0xfff4e4, upK: 0.6, upH: 80, upBase: 0.5 } },
  lincoln: { stone: "marble", map: { 0x4a4540: "dark", 0xb3ada2: "lead", 0xc9c4b9: "granite" }, night: WHITE },
  goldengate: { stone: "concrete", map: { 0x4a4a4c: "concrete", 0xa13a29: "painted", 0xc44a30: "painted", 0xd2583c: "painted", 0x9d978b: "concrete", 0xb8b2a6: "concrete" }, night: { up: 0xffb06a, upK: 0.45, upH: 120, upBase: 0.5 } },
  capitol: { stone: "marble", map: { 0x3b3d42: "glass", 0x4d4a3f: "painted", 0x8d9394: "lead", 0xeeebe3: "painted" }, night: WHITE },
  sagrada: { stone: "sandstone", map: { 0x3d3428: "dark", 0x3f7a4a: "terracotta", 0x8a7152: "sandstone", 0xa88d68: "sandstone", 0xc23b2e: "terracotta", 0xe0b23c: "gold", 0xcabfa8: "limestone", 0xe2d9c6: "limestone", 0xf6f3ea: "stucco", 0xfafcff: "stained" }, night: WARM },
  notredame: { stone: "limestone", map: { 0x2f2c29: "dark", 0x3c4a6a: "stained", 0x48525b: "lead", 0x5b6670: "lead", 0xc9a24a: "gold" }, night: { up: 0xffe2b4, upK: 0.55, upH: 45, upBase: 0.45 } },
  stpeters: { stone: "travertine", map: { 0x34363a: "glass", 0x6f7a84: "lead", 0x8f9aa3: "lead", 0xc9a24a: "gold", 0xf1ece0: "plain" }, night: WARM },
  parthenon: { stone: "marble", map: { 0x8f826d: "limestone", 0xa89a83: "limestone" }, night: { up: 0xffd49a, upK: 0.7, upH: 20, upBase: 0.45 } },
  atomium: { stone: "steel", map: { 0x46525e: "glass", 0x8d9298: "concrete", 0xaab1b9: "steel", 0xc4cad1: "steel", 0xd5dae0: "steel" } },
  shard: { stone: "concrete", map: { 0x39434d: "glass", 0x7d8790: "steel", 0x9fb7c9: "glass", 0xb9cddb: "glass", 0xc2ccd0: "steel" }, night: TOWER },
  cologne: { stone: "sandstone", map: { 0x1f1d1b: "dark", 0x3e464c: "slate", 0x544f48: "sandstone", 0x6b655c: "sandstone", 0x857e72: "sandstone", 0xc9a24a: "gold" }, night: { up: 0xffd6a0, upK: 0.75, upH: 60, upBase: 0.55 } },
  elcastillo: { stone: "limestone", map: { 0x2c2924: "dark", 0x7f7a63: "limestone" } },
  // --- Asia / Oceania / Middle East / Africa
  operahouse: { stone: "concrete", map: { 0x4a3c2e: "glass", 0x5e4c3a: "glass", 0xa9876b: "granite", 0xc6a385: "granite", 0xbfae96: "granite", 0xd3bc9c: "granite", 0xe2dccd: "concrete", 0xefece4: "slate", 0xffffff: "slate" }, night: { up: 0xfff0dc, upK: 0.5, upH: 40, upBase: 0.55 } },
  harbourbridge: { stone: "granite", map: { 0x4b4d50: "concrete", 0x60676d: "painted", 0x7f868c: "painted", 0x969da3: "painted", 0x6e6556: "granite", 0xd8d8d0: "concrete" }, night: { up: 0xffe0b0, upK: 0.3, upH: 80, upBase: 0.4 } },
  taj: { stone: "marble", map: { 0x6c655b: "marble", 0x8c4430: "sandstone", 0xa9573d: "sandstone", 0x8f877a: "marble", 0xb9ab92: "marble", 0xc9a24a: "gold" }, night: { up: 0xfff2e2, upK: 0.45, upH: 50, upBase: 0.55 } },
  burj: { stone: "glass", map: { 0x9aa3ab: "granite", 0xaab8c6: "glass", 0xaeb6c0: "steel", 0xc3cfda: "glass", 0xc4cad0: "steel", 0xd3d9df: "steel" }, night: { up: 0xcfe0ff, upK: 0.12, upH: 300, upBase: 0.3, winK: 0.95 } },
  tokyotower: { stone: "painted", map: { 0x56626c: "glass", 0xe8541c: "painted", 0xf2f0ea: "painted", 0xd8d4cc: "concrete", 0xe9e6de: "painted" } },
  skytree: { stone: "steel", map: { 0x5b6f80: "glass", 0xb8bcbf: "concrete", 0xc9d0d6: "painted", 0xe9eef2: "painted" } },
  pearl: { stone: "concrete", map: { 0x8a8f96: "steel", 0xb5b1ac: "concrete", 0xc8427e: "glass", 0xe07aa6: "glass", 0xcfd2d6: "steel", 0xd6d3cf: "concrete" } },
  petronas: { stone: "steel", map: { 0x5f7486: "glass", 0xa9b2bb: "steel", 0xb7b2a6: "granite", 0xbcc4cc: "steel", 0xcfd5db: "steel" }, night: { ...TOWER, up: 0xf0f4ff, upK: 0.3, upH: 300, upBase: 0.6 } },
  marinabaysands: { stone: "concrete", map: { 0x3fa6c9: "water", 0x5f8f4a: "foliage", 0x6b5a44: "wood", 0x7d8b95: "concrete", 0xa9b0b6: "steel", 0xaab7be: "glass", 0xc9c2b4: "wood", 0xd9dde0: "steel", 0xeef0f1: "painted" }, night: { winK: 1.2 } },
  khufu: { stone: "limestone", map: { 0x3b2f24: "dark" } },
  khafre: { stone: "limestone", map: { 0x3b2f24: "dark", 0xe4d4b4: "limestone", 0xd6c39f: "limestone" } },
  menkaure: { stone: "limestone", map: { 0x3b2f24: "dark", 0x80493a: "granite", 0x9a5a47: "granite", 0x907658: "limestone" } },
  sphinx: { stone: "limestone", map: { 0x4a3c2e: "dark", 0x6e5c46: "limestone", 0x7a6c5e: "granite" } },
  taipei101: { stone: "glass", map: { 0x4f7d78: "glass", 0x67958f: "glass", 0x6f9c8f: "glass", 0xa8c0bc: "steel", 0xb9c2c4: "steel", 0xcfd9d6: "steel", 0xc9a24a: "gold" }, night: TOWER },
  lotustemple: { stone: "marble", map: { 0x5f6a70: "glass" }, night: WHITE },
  burjalarab: { stone: "steel", map: { 0x5b6168: "concrete", 0x5f7d93: "glass", 0x7f9cb2: "glass", 0xb9b8b1: "steel", 0xcfcac0: "concrete", 0xd9d8d1: "steel", 0xdedcd4: "steel", 0xe9ecee: "steel", 0xf0f0f0: "plain", 0xf2f2ef: "painted", 0xf6f5f0: "plain" }, night: TOWER },
  hagiasophia: { stone: "stucco", map: { 0x646c73: "lead", 0x7c858c: "lead", 0x6a4436: "dark", 0xa8604a: "brick", 0xb98065: "brick", 0xc9a24a: "gold", 0xd59d7c: "stucco", 0xe2b393: "stucco", 0xc9c1b2: "limestone", 0xe6e0d4: "limestone" }, night: WARM },
  sheikhzayed: { stone: "marble", map: { 0x6b7680: "glass", 0x7f9a6a: "foliage", 0x9ea4a8: "marble", 0xc2c0b9: "marble", 0xc9a65a: "gold", 0xd6ad4a: "gold" }, night: { up: 0xc8d8ff, upK: 0.55, upH: 60, upBase: 0.6 } },
  angkorwat: { stone: "sandstone", map: { 0x3c3832: "dark", 0x6a665a: "sandstone", 0x8a6a4f: "sandstone", 0x8e9a62: "foliage", 0x7d776c: "sandstone" } },
  shwedagon: { stone: "stucco", map: { 0x9b2a1e: "painted", 0xb3861e: "gold", 0xd6a633: "gold", 0xeac25c: "gold", 0xdcd3bf: "marble", 0xece6d6: "stucco" }, night: { up: 0xffd27a, upK: 0.5, upH: 60, upBase: 0.6 } },
  watarun: { stone: "stucco", map: { 0x3f7a4c: "terracotta", 0x6f9fc2: "stucco", 0x86b07a: "stucco", 0xc9772e: "terracotta", 0xd98aa0: "stucco", 0xe5c35c: "stucco" }, night: WARM },
  gatewayofindia: { stone: "sandstone", map: { 0x4f4232: "dark", 0xb9ad98: "granite" }, night: WARM },
  skytower: { stone: "concrete", map: { 0x51667a: "glass", 0xa9adb1: "concrete", 0xb9b7b1: "concrete", 0xc4c6c8: "steel", 0xf0f0ee: "steel", 0xe7e6e1: "painted" } },
  // --- Beijing (cn_arch palette + own colours)
  tiananmen: { stone: "stucco", map: { ...CN, 0x1e1d1c: "dark", 0x353d48: "slate", 0x3c4552: "slate", 0x5b3a1e: "painted", 0x6b655c: "granite", 0xa59f92: "granite", 0xb8b2a4: "granite", 0xc9ccc8: "marble", 0xd7a888: "stucco", 0xf4efe6: "marble" }, night: WARM },
  forbiddencity: { stone: "stucco", map: CN, night: WARM },
  jingshan: { stone: "stucco", map: CN },
  qiniandian: { stone: "marble", map: { ...CN, 0x15376e: "terracotta", 0x1d4a92: "terracotta", 0x2a5aa6: "terracotta", 0xd8d3c6: "marble" }, night: WARM },
  beihaidagoba: { stone: "stucco", map: { ...CN, 0x8a6e3c: "copper", 0xdedad2: "stucco", 0xf5f3ee: "stucco" } },
  qianmenarrow: { stone: "brick", map: { ...CN, 0x245e3a: "painted", 0x585c62: "brick", 0x6e7278: "brick" }, night: WARM },
  zhengyangmen: { stone: "brick", map: { ...CN, 0x585c62: "brick", 0x6e7278: "brick" }, night: WARM },
  greathall: { stone: "limestone", map: { ...CN, 0x3b4148: "glass", 0x443628: "painted", 0x48423c: "dark", 0xb3b0a6: "concrete", 0xb9b7ad: "concrete", 0xcecaa0: "granite", 0xd72620: "painted", 0xf8f4ec: "marble", 0xffe091: "plain" }, night: WARM },
  natmuseum: { stone: "limestone", map: { ...CN, 0x483e34: "painted", 0x78726a: "concrete", 0xc8c2b4: "granite", 0xebe8df: "marble", 0xffe296: "plain" }, night: WARM },
  maomausoleum: { stone: "granite", map: { ...CN, 0x3e4248: "glass", 0x7a746e: "granite", 0x8a7a6c: "granite", 0xd8cebe: "granite", 0xd9a021: "terracotta", 0xdfb438: "gold", 0xebe8df: "marble" }, night: WARM },
  heroesmonument: { stone: "granite", map: { 0x8a847a: "granite", 0xa39d93: "granite", 0xdfb438: "gold", 0xe8e4da: "marble" }, night: WHITE },
  taflagpole: { stone: "steel", map: { 0xd8b248: "gold", 0xde2910: "plain", 0xe8eef5: "steel", 0xffde00: "gold", 0xffffff: "plain" } },
  birdsnest: { stone: "concrete", map: { 0x2a923e: "foliage", 0x949ca8: "steel", 0xac1c19: "painted", 0xb2b6be: "granite", 0xd4dce6: "steel", 0xda2622: "painted", 0xf2f8ff: "steel" } },
  watercube: { stone: "steel", map: { 0x2f5f86: "plain", 0x4592d2: "plain", 0x4d9fdc: "plain", 0x5aa9e2: "plain", 0x6bb6e8: "plain", 0x79c0ec: "plain", 0x6d2b79: "plain", 0x8d99a3: "steel", 0xc9d6e0: "steel", 0xdde7ee: "steel" } },
  cctv: { stone: "glass", map: { 0x37414c: "glass", 0x46525e: "glass", 0x5a6068: "granite", 0xa3acb5: "steel" }, night: TOWER },
  chinazun: { stone: "glass", map: { 0x6f7c8a: "steel", 0x9fb1c3: "glass", 0xb6c6d5: "glass", 0xc9cfd6: "granite", 0xdde3e8: "steel", 0xdfe6ee: "steel", 0xe9eef3: "steel", 0xe9e6dc: "concrete" }, night: TOWER },
};

const _cache = new Map();
/** -> { stone, map: { hex: material }, night } for a landmark id (map always defined). */
export function materialSpec(id) {
  let s = _cache.get(id);
  if (s) return s;
  const e = MATERIAL_MAP[id] || {};
  s = { stone: e.stone || "limestone", map: e.map || {}, night: e.night || {} };
  _cache.set(id, s);
  return s;
}

