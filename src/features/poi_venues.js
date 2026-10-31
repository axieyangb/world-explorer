// [venues-poi] Everyday game venues, worker stage 3: gas stations (+ car washes), convenience stores, supermarkets
// (+ parking lots and loading docks), fast food drive-thrus, pharmacies, banks / ATMs and multi-storey car parks.
//
// Input: the chunk's `places.pois` (OpenMapTiles poi layer), the fuel canopies / car-park footprints that
// poi_venues_extract.js lifted out of the generic extruder, the extruded building entities and the road segments.
// Output:
//   1. static meshes appended to the chunk's `buildings` sub-group, so they ride the normal worker transfer:
//      - wfcBldgMat (vertex colours, night glow where the normal has length 2, kBid = host building so a storefront
//        collapses with its building under kaiju / weapon damage),
//      - poiGlassMat (shop glass with the same kBid), poiGlowMat (additive night light pools on the ground);
//   2. a compact payload for the main-thread PoiVenueSystem (poi_venue_system.js): per-kind instance arrays for the
//      repeated detailed props (pumps, carts, lamps, parked cars ...; stride 8: x, y, z, rotY, sx, sy, sz, rgb, world
//      coordinates), sign texts, and the gameplay zones (forecourts, car-wash bays, pumps);
//   3. `q.venue = 1` on every POI it claims, so places_worker.js skips its generic gas-station totem and awning.
// Every random choice is seeded from the world position, so a venue looks the same after a reload.
import * as THREE from '../../vendor/three.module.js';
import { getChunkTerrainMeshElevation, getBeijingTerrainElevation } from '../environment.js';
import { kaijuPatchBuildingShader } from './kaiju/kaiju_destruction.js';
import { classifyPoiVenueKind } from './poi_venues_extract.js';

export const POI_VENUE_STRIDE = 8;
const HALF = 500;

// ------------------------------------------------------------------ seeded random
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashXZ(x, z, salt = 0) {
  let h = (Math.imul(Math.round(x * 2) | 0, 73856093) ^ Math.imul(Math.round(z * 2) | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
function pointInRing(px, pz, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1], xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function ringArea(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
  return Math.abs(a) * 0.5;
}

// ------------------------------------------------------------------ colours (linear)
const C = {
  white: [0.86, 0.87, 0.86], offWhite: [0.74, 0.74, 0.71], soffit: [0.8, 0.8, 0.78],
  concrete: [0.5, 0.49, 0.46], concreteLt: [0.6, 0.59, 0.56], concreteDk: [0.34, 0.34, 0.33],
  asphalt: [0.085, 0.088, 0.092], asphaltLt: [0.13, 0.13, 0.135], joint: [0.22, 0.22, 0.21],
  paintW: [0.82, 0.82, 0.78], paintY: [0.78, 0.55, 0.04], paintB: [0.05, 0.18, 0.5],
  alu: [0.55, 0.57, 0.6], aluDk: [0.2, 0.21, 0.23], black: [0.025, 0.025, 0.028], rubber: [0.03, 0.03, 0.03],
  granite: [0.11, 0.11, 0.12], steel: [0.36, 0.38, 0.4], galv: [0.5, 0.52, 0.52],
  light: [0.98, 0.97, 0.92], lightWarm: [1.0, 0.86, 0.62], lightCool: [0.86, 0.94, 1.0],
  interior: [0.86, 0.84, 0.78], tile: [0.72, 0.71, 0.68], shelf: [0.78, 0.79, 0.8], shelfDk: [0.24, 0.25, 0.27],
  stucco: [0.74, 0.7, 0.62], brick: [0.42, 0.22, 0.16], red: [0.62, 0.05, 0.04], green: [0.04, 0.42, 0.14],
  digitR: [1.0, 0.16, 0.06], digitG: [0.2, 1.0, 0.35], digitOff: [0.08, 0.02, 0.02], panelDk: [0.03, 0.035, 0.04],
  shutter: [0.5, 0.52, 0.53], dockSeal: [0.04, 0.04, 0.045],
};
// Generic (unbranded) colour schemes: [primary, secondary, accent]
const FUEL_SCHEMES = [
  [[0.62, 0.04, 0.03], [0.86, 0.86, 0.84], [0.95, 0.62, 0.02]],
  [[0.02, 0.32, 0.12], [0.86, 0.86, 0.84], [0.35, 0.7, 0.1]],
  [[0.03, 0.12, 0.5], [0.86, 0.86, 0.84], [0.78, 0.04, 0.04]],
  [[0.86, 0.36, 0.02], [0.86, 0.86, 0.84], [0.1, 0.1, 0.12]],
  [[0.04, 0.38, 0.42], [0.92, 0.9, 0.86], [0.05, 0.6, 0.25]],
  [[0.1, 0.1, 0.12], [0.85, 0.66, 0.05], [0.86, 0.86, 0.84]],
];
const SHOP_SCHEMES = [
  [[0.92, 0.92, 0.9], [0.02, 0.4, 0.18], [0.86, 0.32, 0.02]],
  [[0.92, 0.92, 0.9], [0.05, 0.22, 0.6], [0.05, 0.55, 0.3]],
  [[0.92, 0.92, 0.9], [0.62, 0.04, 0.04], [0.95, 0.55, 0.02]],
  [[0.03, 0.16, 0.42], [0.92, 0.92, 0.9], [0.4, 0.75, 0.95]],
  [[0.6, 0.03, 0.05], [0.95, 0.85, 0.2], [0.92, 0.92, 0.9]],
];
const MARKET_SCHEMES = [
  [[0.62, 0.04, 0.04], [0.92, 0.92, 0.9]], [[0.02, 0.36, 0.16], [0.92, 0.92, 0.9]],
  [[0.04, 0.2, 0.5], [0.92, 0.92, 0.9]], [[0.86, 0.4, 0.03], [0.92, 0.92, 0.9]],
];
const PRODUCT = [
  [0.75, 0.08, 0.06], [0.95, 0.62, 0.05], [0.1, 0.35, 0.75], [0.12, 0.55, 0.2], [0.92, 0.88, 0.75], [0.55, 0.1, 0.45],
  [0.95, 0.85, 0.1], [0.2, 0.2, 0.22], [0.9, 0.4, 0.55], [0.35, 0.65, 0.85], [0.6, 0.35, 0.15], [0.98, 0.98, 0.95],
];
const CAR_PAINT = [0xf2f2f0, 0x1c1d20, 0x8c9096, 0xb8bcc2, 0x7a1e22, 0x1f3a66, 0x2f4f3a, 0xc9c1a8, 0x4a4f57, 0xd8d8d8, 0x9a2a1a, 0x22457a];
const toHex = (c) => (Math.round(Math.min(1, c[0]) * 255) << 16) | (Math.round(Math.min(1, c[1]) * 255) << 8) | Math.round(Math.min(1, c[2]) * 255);
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ------------------------------------------------------------------ unbranded signage
// Signs never show real brands: chain names (known list, or a name repeated across the chunk's POIs) are replaced
// by generic wording; an independent shop keeps its OSM name on generic-style signage. OSM brand / operator tags
// are not read at all (the tiles do not carry them).
const CHAINS = new RegExp([
  // fuel
  'shell', 'chevron', 'texaco', 'exxon', 'mobil', '\\bbp\\b', 'arco', '\\b76\\b', 'phillips', 'conoco', 'sunoco', 'valero', 'citgo', 'marathon',
  'speedway', 'sinclair', 'gulf', 'circle ?k', 'wawa', 'sheetz', 'racetrac', 'quiktrip', 'qt\\b', 'casey', 'pilot', 'flying j', 'love.?s',
  'total', 'esso', 'agip', '\\beni\\b', 'repsol', 'cepsa', 'aral', 'jet\\b', 'avia', 'q8', 'lukoil', 'rosneft', 'gazprom', 'petrobras', 'posto br',
  '\\bbr\\b', 'ipiranga', 'pemex', 'petronas', 'caltex', 'ampol', 'petro', 'eneos', 'idemitsu', 'apollostation', 'cosmo', 'sinopec', '中石化', '中石油',
  'petrochina', 'cnpc', 'irving', 'husky', 'ultramar', 'speedy', 'murphy', 'kwik', 'gas ?n ?go',
  // convenience / grocery
  '7-?eleven', 'seven', 'セブン', 'family ?mart', 'ファミリーマート', 'lawson', 'ローソン', 'ministop', 'ミニストップ', 'daily ?yamazaki', 'newdays',
  'tesco', "sainsbury", 'co-?op', 'spar\\b', 'londis', 'costcutter', 'premier', 'one stop', 'nisa', 'budgens', 'carrefour', 'monoprix', 'franprix',
  'casino', 'intermarch', 'leclerc', 'auchan', 'lidl', 'aldi', 'rewe', 'edeka', 'netto', 'penny', 'kaufland', 'albert heijn', 'jumbo', 'mercadona',
  'kroger', 'safeway', 'albertsons', 'vons', 'pavilions', 'ralphs', 'publix', 'walmart', 'target', 'costco', 'whole foods', 'trader joe', 'h-?e-?b',
  'randalls', 'fiesta', 'h ?mart', 'sprouts', 'food ?4 ?less', 'smart ?& ?final', 'wegmans', 'meijer', 'giant', 'stop ?& ?shop', 'winn', 'dollar',
  'waitrose', 'morrisons', 'asda', 'iceland', 'm&s', 'marks', 'woolworths', 'coles', 'イオン', 'aeon', 'ito-?yokado', 'seiyu', '永辉', '华润', '物美',
  // fast food / pharmacy / banks
  'mcdonald', 'マクドナルド', 'burger king', 'wendy', 'kfc', 'kentucky', 'subway', 'taco bell', 'chipotle', 'starbucks', 'domino', 'pizza hut',
  'popeyes', 'chick-?fil', 'sonic', 'jack in the box', 'in-?n-?out', 'five guys', 'shake shack', 'arby', 'dunkin', 'tim horton', 'panda express',
  'pret', 'greggs', 'nando', 'quick\\b', 'mos burger', 'モス', 'yoshinoya', '吉野家', 'sukiya', 'すき家', 'matsuya', '松屋', 'lotteria', '麦当劳', '肯德基',
  'cvs', 'walgreens', 'rite aid', 'boots', 'superdrug', 'lloyds', 'matsumoto', 'マツモト', 'welcia', 'ウエルシア', 'sundrug', 'tsuruha',
  'chase', 'wells fargo', 'bank of america', 'citi', 'hsbc', 'barclays', 'natwest', 'santander', 'bnp', 'soci[eé]t[eé] g', 'cr[eé]dit', 'deutsche',
  'mufg', 'mizuho', 'smbc', 'ゆうちょ', 'icbc', '工商银行', '建设银行', '中国银行', '农业银行', 'capital one', 'us bank', 'td bank', 'pnc',
].join('|'), 'i');
const GENERIC = {
  fuel: [['加油站', 'GAS'], ['加油站', 'FUEL'], ['24小时加油', 'GAS 24/7'], ['加油站', 'FUEL STOP']],
  conv: [['便利店', 'MART 24'], ['便利店', '24/7 MARKET'], ['便利店', 'CORNER MART'], ['便利店', 'QUICK MART']],
  super: [['超市', 'SUPERMARKET'], ['超市', 'FRESH MARKET'], ['超市', 'FOOD MARKET']],
  fast: [['快餐', 'BURGERS'], ['快餐', 'FAST FOOD'], ['快餐', 'DRIVE-IN']],
  pharmacy: [['药店', 'PHARMACY']], bank: [['银行', 'BANK']],
  wash: [['自动洗车', 'CAR WASH'], ['精洗美容', 'AUTO WASH']],
  cafe_bistro: [['精品咖啡', 'CAFE & BISTRO'], ['烘焙工坊', 'BOULANGERIE'], ['西式简餐', 'BRASSERIE'], ['意式咖啡', 'ESPRESSO BAR']],
  pub_bar: [['精酿酒馆', 'TAVERN & PUB'], ['啤酒花园', 'BIERGARTEN'], ['老橡木酒馆', 'OLD OAK PUB'], ['威士忌吧', 'TAPHOUSE']],
  hotel: [['大酒店', 'GRAND HOTEL'], ['精品酒店', 'PLAZA HOTEL'], ['迎宾大饭店', 'ROYAL HOTEL']],
  cinema_theatre: [['百老汇大剧院', 'GRAND THEATRE'], ['星光影城', 'PALACE CINEMA'], ['艺术剧场', 'PLAYHOUSE']],
  auto_service: [['汽车维修中心', 'AUTO SERVICE'], ['名车中心', 'AUTO MOTORS'], ['轮胎与保养', 'TIRE & LUBE']],
  marketplace_retail: [['鲜花蔬果集市', 'FARMERS MARKET'], ['城市市集', 'FRESH MARKET'], ['时代百货', 'GALLERIA MALL']],
};
export function signNames(kind, name, nameEn, repeated, rnd) {
  const nm = String(name || '').trim(), en = String(nameEn || '').trim();
  if (nm || en) return [nm || en, en || nm];
  const g = GENERIC[kind] || GENERIC.conv;
  return g[(rnd() * g.length) | 0];
}
export function brandSchemeFor(kind, name, nameEn, rnd) {
  const s = `${name || ''} ${nameEn || ''}`;
  if (kind === 'fuel' || kind === 'wash') {
    if (/shell|壳牌/i.test(s)) return [[0.86, 0.08, 0.06], [0.96, 0.80, 0.04], [0.96, 0.80, 0.04]];
    if (/chevron|雪佛龙|caltex|加德士/i.test(s)) return [[0.03, 0.24, 0.65], [0.92, 0.93, 0.95], [0.82, 0.08, 0.12]];
    if (/\b76\b|conoco|phillips/i.test(s)) return [[0.92, 0.36, 0.04], [0.92, 0.92, 0.90], [0.05, 0.22, 0.58]];
    if (/mobil|exxon|esso|埃克森|美孚/i.test(s)) return [[0.82, 0.06, 0.08], [0.92, 0.93, 0.95], [0.04, 0.20, 0.58]];
    if (/\barco\b/i.test(s)) return [[0.04, 0.22, 0.56], [0.92, 0.93, 0.95], [0.85, 0.08, 0.10]];
    if (/\bbp\b|碧辟|amoco/i.test(s)) return [[0.02, 0.48, 0.18], [0.94, 0.95, 0.92], [0.95, 0.82, 0.05]];
    if (/sinopec|中国石化|中石化/i.test(s)) return [[0.84, 0.05, 0.06], [0.93, 0.93, 0.92], [0.95, 0.76, 0.05]];
    if (/petrochina|cnpc|中国石油|中石油/i.test(s)) return [[0.82, 0.06, 0.05], [0.96, 0.72, 0.04], [0.92, 0.92, 0.90]];
    if (/valero|gulf|sunoco/i.test(s)) return [[0.04, 0.36, 0.46], [0.92, 0.92, 0.90], [0.95, 0.68, 0.04]];
    if (/texaco|speedway|circle ?k|wawa|sheetz|quiktrip|\bqt\b/i.test(s)) return [[0.78, 0.05, 0.06], [0.92, 0.92, 0.90], [0.95, 0.62, 0.04]];
    if (/total|eneos|idemitsu|repsol/i.test(s)) return [[0.88, 0.34, 0.04], [0.92, 0.92, 0.90], [0.82, 0.06, 0.08]];
    if (/petronas/i.test(s)) return [[0.02, 0.52, 0.46], [0.92, 0.94, 0.94], [0.88, 0.88, 0.86]];
    return FUEL_SCHEMES[(rnd() * FUEL_SCHEMES.length) | 0];
  }
  if (kind === 'conv') {
    if (/7-?eleven|7-?11|seven|セブン/i.test(s)) return [[0.92, 0.92, 0.90], [0.02, 0.44, 0.20], [0.90, 0.32, 0.04]];
    if (/family ?mart|全家|ファミリーマート/i.test(s)) return [[0.92, 0.94, 0.95], [0.02, 0.46, 0.78], [0.04, 0.62, 0.26]];
    if (/lawson|罗森|ローソン/i.test(s)) return [[0.04, 0.34, 0.74], [0.94, 0.95, 0.96], [0.85, 0.22, 0.35]];
    if (/circle ?k|ok便利/i.test(s)) return [[0.78, 0.06, 0.06], [0.95, 0.62, 0.04], [0.94, 0.94, 0.92]];
    if (/ministop|ミニストップ|meiyijia|美宜佳|喜士多|良友|快客|联华|好德/i.test(s)) return [[0.82, 0.08, 0.08], [0.95, 0.76, 0.06], [0.04, 0.32, 0.68]];
    return SHOP_SCHEMES[(rnd() * SHOP_SCHEMES.length) | 0];
  }
  if (kind === 'super') {
    if (/whole foods|sprouts|联华|永辉/i.test(s)) return [[0.02, 0.38, 0.16], [0.92, 0.92, 0.90]];
    if (/walmart|沃尔玛|aldi|lidl|tesco|sainsbury/i.test(s)) return [[0.04, 0.24, 0.58], [0.92, 0.92, 0.90]];
    if (/target|costco|safeway|kroger|trader joe|carrefour|家乐福|auchan|大润发|华润|盒马/i.test(s)) return [[0.74, 0.06, 0.06], [0.92, 0.92, 0.90]];
    return MARKET_SCHEMES[(rnd() * MARKET_SCHEMES.length) | 0];
  }
  if (kind === 'cafe_bistro') {
    if (/starbucks|星巴克/i.test(s)) return [[0.02, 0.36, 0.22], [0.95, 0.93, 0.88], [0.78, 0.62, 0.32]];
    if (/blue bottle|蓝瓶|luckin|瑞幸/i.test(s)) return [[0.06, 0.38, 0.68], [0.96, 0.96, 0.95], [0.85, 0.68, 0.32]];
    if (/tim horton|costa|pret|boulangerie|paul\b/i.test(s)) return [[0.58, 0.08, 0.10], [0.95, 0.90, 0.80], [0.85, 0.68, 0.28]];
    if (/peet|皮爷|lavazza|illy|manner/i.test(s)) return [[0.24, 0.14, 0.08], [0.94, 0.88, 0.76], [0.86, 0.64, 0.20]];
    const bistroSchemes = [
      [[0.12, 0.28, 0.18], [0.95, 0.92, 0.84], [0.82, 0.66, 0.26]],
      [[0.52, 0.10, 0.12], [0.95, 0.92, 0.84], [0.85, 0.68, 0.28]],
      [[0.14, 0.18, 0.28], [0.95, 0.92, 0.84], [0.84, 0.66, 0.26]],
      [[0.34, 0.20, 0.11], [0.96, 0.92, 0.82], [0.88, 0.56, 0.18]],
    ];
    return bistroSchemes[(rnd() * bistroSchemes.length) | 0];
  }
  if (kind === 'pub_bar') {
    const pubSchemes = [
      [[0.14, 0.09, 0.06], [0.88, 0.70, 0.24], [0.55, 0.12, 0.08]],
      [[0.08, 0.18, 0.11], [0.90, 0.74, 0.26], [0.45, 0.22, 0.10]],
      [[0.22, 0.07, 0.07], [0.92, 0.76, 0.28], [0.16, 0.12, 0.09]],
    ];
    return pubSchemes[(rnd() * pubSchemes.length) | 0];
  }
  if (kind === 'hotel') {
    const hotelSchemes = [
      [[0.12, 0.14, 0.18], [0.88, 0.72, 0.30], [0.72, 0.08, 0.10]],
      [[0.18, 0.14, 0.12], [0.90, 0.76, 0.36], [0.68, 0.07, 0.09]],
      [[0.08, 0.18, 0.24], [0.86, 0.70, 0.28], [0.75, 0.08, 0.10]],
    ];
    return hotelSchemes[(rnd() * hotelSchemes.length) | 0];
  }
  if (kind === 'cinema_theatre') {
    const cinemaSchemes = [
      [[0.55, 0.05, 0.08], [0.98, 0.82, 0.22], [0.95, 0.35, 0.65]],
      [[0.10, 0.08, 0.24], [0.98, 0.80, 0.20], [0.20, 0.85, 0.95]],
      [[0.42, 0.06, 0.18], [0.98, 0.84, 0.25], [1.0, 0.45, 0.15]],
    ];
    return cinemaSchemes[(rnd() * cinemaSchemes.length) | 0];
  }
  if (kind === 'auto_service') {
    const autoSchemes = [
      [[0.06, 0.26, 0.62], [0.94, 0.95, 0.96], [0.92, 0.42, 0.05]],
      [[0.72, 0.08, 0.08], [0.94, 0.94, 0.92], [0.95, 0.72, 0.06]],
      [[0.14, 0.16, 0.18], [0.95, 0.72, 0.05], [0.85, 0.12, 0.08]],
    ];
    return autoSchemes[(rnd() * autoSchemes.length) | 0];
  }
  if (kind === 'marketplace_retail') {
    const mktSchemes = [
      [[0.12, 0.44, 0.22], [0.96, 0.94, 0.88], [0.92, 0.48, 0.08]],
      [[0.72, 0.14, 0.10], [0.96, 0.94, 0.88], [0.95, 0.75, 0.12]],
      [[0.14, 0.32, 0.58], [0.96, 0.95, 0.92], [0.88, 0.36, 0.52]],
    ];
    return mktSchemes[(rnd() * mktSchemes.length) | 0];
  }
  return SHOP_SCHEMES[(rnd() * SHOP_SCHEMES.length) | 0];
}

// ------------------------------------------------------------------ geometry accumulator
// Triangles with flat normals; `em` doubles the normal length (wfcBldgMat reads |n| > 1.5 as "glows at night").
class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.b = []; this.bid = 0; }
  tri(a, b, c, rgb, em) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return;
    const k = (em ? 2 : 1) / l;
    nx *= k; ny *= k; nz *= k;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(rgb[0], rgb[1], rgb[2]); this.b.push(this.bid); }
  }
  quad(a, b, c, d, rgb, em) { this.tri(a, b, c, rgb, em); this.tri(a, c, d, rgb, em); }
  get count() { return this.p.length / 3; }
  toMesh(mat, { kbid = true, shadow = true, colorsU8 = true } = {}) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (colorsU8) {
      const u8 = new Uint8Array(this.c.length);
      for (let i = 0; i < this.c.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(this.c[i] * 255)));
      g.setAttribute('color', new THREE.BufferAttribute(u8, 3, true));
    } else {
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    }
    if (kbid) g.setAttribute('kBid', new THREE.Float32BufferAttribute(this.b, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }
}

// Local frame: origin (x0, y0, z0) chunk-local, +x along (ax, az), +z along (bx, bz) = outward / short axis, y up.
// (ax, az) = (bz, -bx) keeps it right-handed, so windings below stay outward.
class Frame {
  constructor(x0, y0, z0, bx, bz) {
    const l = Math.hypot(bx, bz) || 1;
    this.x0 = x0; this.y0 = y0; this.z0 = z0;
    this.bx = bx / l; this.bz = bz / l;
    this.ax = this.bz; this.az = -this.bx;
  }
  static fromAxis(x0, y0, z0, ux, uz) { return new Frame(x0, y0, z0, -uz, ux); } // +x = (ux, uz)
  p(x, y, z) { return [this.x0 + this.ax * x + this.bx * z, this.y0 + y, this.z0 + this.az * x + this.bz * z]; }
  wx(x, z) { return this.x0 + this.ax * x + this.bx * z; }
  wz(x, z) { return this.z0 + this.az * x + this.bz * z; }
  rotY(extra = 0) { return Math.atan2(this.bx, this.bz) + extra; } // instance rotY whose local +z = frame +z
}

// Axis-aligned box in frame F (centre cx, cy, cz; size w x h x d). skip: string of faces to omit ('b'ottom 't'op
// 'f'ront(+z) 'k'(back -z) 'l'(-x) 'r'(+x)). em: true (all glow) or a string of glowing faces.
function box(A, F, cx, cy, cz, w, h, d, rgb, em = false, skip = '', ry = 0) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  const P = (x, y, z) => F.p(cx + x * cr + z * sr, cy + y, cz - x * sr + z * cr);
  const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
  const E = (f) => em === true || (typeof em === 'string' && em.includes(f));
  if (!skip.includes('f')) A.quad(v[4], v[5], v[6], v[7], rgb, E('f'));
  if (!skip.includes('k')) A.quad(v[1], v[0], v[3], v[2], rgb, E('k'));
  if (!skip.includes('r')) A.quad(v[5], v[1], v[2], v[6], rgb, E('r'));
  if (!skip.includes('l')) A.quad(v[0], v[4], v[7], v[3], rgb, E('l'));
  if (!skip.includes('t')) A.quad(v[7], v[6], v[2], v[3], rgb, E('t'));
  if (!skip.includes('b')) A.quad(v[0], v[1], v[5], v[4], rgb, E('b'));
}
// Vertical cylinder (open bottom) in frame F
function cyl(A, F, cx, y0, cz, r, h, seg, rgb, em = false, top = true) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    A.quad(F.p(x0, y0, z0), F.p(x0, y0 + h, z0), F.p(x1, y0 + h, z1), F.p(x1, y0, z1), rgb, em);
    if (top) A.tri(F.p(cx, y0 + h, cz), F.p(x1, y0 + h, z1), F.p(x0, y0 + h, z0), rgb, em);
  }
}
// Flat quad facing +z in frame F (x0..x1, y0..y1 at depth z)
function face(A, F, x0, x1, y0, y1, z, rgb, em = false) {
  A.quad(F.p(x0, y0, z), F.p(x1, y0, z), F.p(x1, y1, z), F.p(x0, y1, z), rgb, em);
}
// Horizontal quad facing up in frame F at height y
function flat(A, F, x0, x1, z0, z1, y, rgb, em = false) {
  A.quad(F.p(x0, y, z1), F.p(x1, y, z1), F.p(x1, y, z0), F.p(x0, y, z0), rgb, em);
}
// Seven-segment digit on the +z face of frame F (bottom-left x, y; height h). Unlit segments drawn dim.
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(A, F, ch, x, y, z, h, rgb, off) {
  const w = h * 0.55, t = h * 0.12;
  const on = SEG[ch] || '';
  const segs = {
    a: [x + t, x + w - t, y + h - t, y + h], d: [x + t, x + w - t, y, y + t], g: [x + t, x + w - t, y + h / 2 - t / 2, y + h / 2 + t / 2],
    f: [x, x + t, y + h / 2, y + h - t * 0.5], b: [x + w - t, x + w, y + h / 2, y + h - t * 0.5],
    e: [x, x + t, y + t * 0.5, y + h / 2], c: [x + w - t, x + w, y + t * 0.5, y + h / 2],
  };
  for (const [k, [x0, x1, y0, y1]] of Object.entries(segs)) {
    const lit = on.includes(k);
    if (!lit && !off) continue;
    face(A, F, x0, x1, y0, y1, z, lit ? rgb : off, lit);
  }
  return w;
}
function priceString(A, F, s, x, y, z, h, rgb) {
  let cx = x;
  for (const ch of s) {
    if (ch === '.') { face(A, F, cx + h * 0.02, cx + h * 0.14, y, y + h * 0.12, z, rgb, true); cx += h * 0.2; continue; }
    if (ch === '^') { cx += digit(A, F, '9', cx, y + h * 0.45, z, h * 0.5, rgb, null) + h * 0.06; continue; } // the US 9/10 cent
    cx += digit(A, F, ch, cx, y, z, h, rgb, C.digitOff) + h * 0.14;
  }
  return cx - x;
}

// ------------------------------------------------------------------ main entry
/**
 * @param {Object} ctx { data, ox, oz, groups, mats, buildingEntities, roadSegments, isPointInWater, colliders }
 * @returns {Object|null} main-thread payload (see poi_venue_system.js)
 */
export function buildPoiVenues(ctx) {
  const { data, ox, oz, groups, mats, buildingEntities = [], roadSegments = [], isPointInWater, colliders } = ctx;
  const pois = (data && data.places && data.places.pois) || [];
  const sites = (data && data.venues && data.venues.poi) || { canopies: [], garages: [], venues: [] };
  if (!pois.length && !sites.garages.length && !(sites.venues && sites.venues.length)) return null;
  const lat = (data.places && data.places.lat) || 0, lon = (data.places && data.places.lon) || 0;
  // Seeds come from absolute lat/lon (1e-5 deg grid), so a venue looks the same whichever spawn point set the origin
  const latR = (lat * Math.PI) / 180;
  const nearBj = Math.hypot((lat - 39.9087) * 111.0, (lon - 116.3975) * 85.4) < 30.0; // same rule as computeWorldOrigin
  const mLat = nearBj ? 111033.0 : 111132.92 - 559.82 * Math.cos(2 * latR) + 1.175 * Math.cos(4 * latR);
  const mLon = nearBj ? 85387.0 : 111412.84 * Math.cos(latR) - 93.5 * Math.cos(3 * latR);
  const hashAbs = (x, z, salt) => hashXZ((lon + (ox + x) / mLon) * 5e4, (lat - (oz + z) / mLat) * 5e4, salt);

  const bld = new Acc(), glass = new Acc(), glow = new Acc();
  const inst = {};
  const push = (kind, x, y, z, rot, sx = 1, sy = 1, sz = 1, rgb = 0xffffff) => {
    (inst[kind] || (inst[kind] = [])).push(ox + x, y, oz + z, rot, sx, sy, sz, rgb);
  };
  const signs = []; // [x, y, z, rotY, w, h, style, text, textEn, bg, fg]
  const sign = (F, x, y, z, w, h, style, text, textEn, bg, fg) => {
    const [px, py, pz] = F.p(x, y, z);
    signs.push([ox + px, py, oz + pz, F.rotY(), w, h, style, text || '', textEn || text || '', bg, fg]);
  };
  const zones = { fuel: [], wash: [], pumps: [], shops: [], garages: [] }; // shops / garages: test + camera hooks
  const dbg = [];
  // Road surfaces sit on the DEM; the terrain mesh is 0.35 m under it. Slabs follow the DEM so they cover lots and
  // forecourts that OSM maps as paved service areas; props stand on the slab top (groundTop).
  const ground = (x, z) => Math.max(getBeijingTerrainElevation(ox + x, oz + z), getChunkTerrainMeshElevation(ox + x, oz + z) + 0.3);
  const groundTop = (x, z) => ground(x, z) + 0.1;
  const inWater = (x, z) => Boolean(isPointInWater && isPointInWater(x, z, 1.5));

  // Footprints of the extruded ground-level buildings (local), with their entity index for kBid
  const blds = [];
  for (let i = 0; i < buildingEntities.length; i++) {
    const e = buildingEntities[i];
    if (!e || e.kind !== 'building' || !e.extruded || e.isPart || (e.minHeight || 0) > 0.5) continue;
    const f = e.flatOuter;
    if (!f || f.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < f.length; k += 2) {
      if (f[k] < x0) x0 = f[k]; if (f[k] > x1) x1 = f[k];
      if (f[k + 1] < z0) z0 = f[k + 1]; if (f[k + 1] > z1) z1 = f[k + 1];
    }
    blds.push({ e, idx: i, f, x0, x1, z0, z1, area: ringArea(f), used: false });
  }
  // Uniform 32 m grids over the footprints and road segments keep the many clearance probes cheap
  const GC = 32, GN = Math.ceil((2 * HALF + 400) / GC), G0 = -HALF - 200;
  const cellOf = (v) => Math.max(0, Math.min(GN - 1, Math.floor((v - G0) / GC)));
  const bGrid = new Map(), sGrid = new Map();
  const addGrid = (grid, x0, x1, z0, z1, item) => {
    for (let i = cellOf(x0); i <= cellOf(x1); i++) for (let j = cellOf(z0); j <= cellOf(z1); j++) {
      const k = i * GN + j;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(item);
    }
  };
  for (const B of blds) addGrid(bGrid, B.x0, B.x1, B.z0, B.z1, B);
  const bldAt = (x, z, pad = 0) => {
    const cell = bGrid.get(cellOf(x) * GN + cellOf(z));
    if (!cell) return null;
    for (const B of cell) {
      if (x < B.x0 - pad || x > B.x1 + pad || z < B.z0 - pad || z > B.z1 + pad) continue;
      if (pointInRing(x, z, B.f)) return B;
    }
    return null;
  };
  // Road segments (local); `svc` = service / parking aisles (a lot may be drawn over them)
  const segs = [];
  for (const s of roadSegments) {
    if (s.tunnel || s.bridge) continue;
    const ax = s.x1 - ox, az = s.z1 - oz, bx = s.x2 - ox, bz = s.z2 - oz;
    if (Math.max(ax, bx) < -HALF - 80 || Math.min(ax, bx) > HALF + 80 || Math.max(az, bz) < -HALF - 80 || Math.min(az, bz) > HALF + 80) continue;
    const cls = s.cls || '';
    segs.push([ax, az, bx, bz, (s.width || 6) * 0.5, /service|track|path|footway|cycleway|steps/.test(cls) ? 1 : 0]);
  }
  for (const sg of segs) addGrid(sGrid, Math.min(sg[0], sg[2]) - sg[4] - 2, Math.max(sg[0], sg[2]) + sg[4] + 2, Math.min(sg[1], sg[3]) - sg[4] - 2, Math.max(sg[1], sg[3]) + sg[4] + 2, sg);
  const segsNear = (x, z, r) => {
    if (r > GC) return segs;
    const out = new Set();
    for (let i = cellOf(x - r); i <= cellOf(x + r); i++) for (let j = cellOf(z - r); j <= cellOf(z + r); j++) {
      const a = sGrid.get(i * GN + j);
      if (a) for (const sg of a) out.add(sg);
    }
    return out;
  };
  const roadNear = (x, z, maxD = 80, includeSvc = false) => {
    let best = null;
    for (const s of segsNear(x, z, maxD)) {
      if (s[5] && !includeSvc) continue;
      const [ax, az, bx, bz, hw] = s;
      if (x < Math.min(ax, bx) - maxD || x > Math.max(ax, bx) + maxD || z < Math.min(az, bz) - maxD || z > Math.max(az, bz) + maxD) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      if (l2 < 1e-4) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz) - hw;
      if (d < maxD && (!best || d < best.d)) { const l = Math.sqrt(l2); best = { d, qx, qz, ux: dx / l, uz: dz / l, hw }; }
    }
    return best;
  };
  // Is a frame-local rectangle clear of buildings, (non-service) roads and water? Samples a grid.
  const rectClear = (F, x0, x1, z0, z1, { roadPad = 0.8, svc = false, step = 2.5, skip = null } = {}) => {
    const nx = Math.max(2, Math.ceil((x1 - x0) / step)), nz = Math.max(2, Math.ceil((z1 - z0) / step));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const lx = x0 + ((x1 - x0) * i) / nx, lz = z0 + ((z1 - z0) * j) / nz;
      const x = F.wx(lx, lz), z = F.wz(lx, lz);
      if (Math.abs(x) > HALF + 70 || Math.abs(z) > HALF + 70) return false; // neighbour-chunk buildings are not known here
      const B = bldAt(x, z, 0.3);
      if (B && B !== skip) return false;
      if (inWater(x, z)) return false;
      const r = roadNear(x, z, roadPad + 1, svc);
      if (r && r.d < roadPad) return false;
    }
    return true;
  };
  const claimed = [];
  const taken = (x, z, r) => claimed.some((c) => Math.hypot(c[0] - x, c[1] - z) < r + c[2]);
  const claim = (x, z, r) => claimed.push([x, z, r]);
  // Terrain-following slab over a frame rectangle (subdivided so it hugs slopes)
  const slab = (A, F, x0, x1, z0, z1, yOff, rgb, step = 6) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    const Y = [];
    for (let i = 0; i <= nx; i++) {
      Y.push([]);
      for (let j = 0; j <= nz; j++) {
        const lx = x0 + ((x1 - x0) * i) / nx, lz = z0 + ((z1 - z0) * j) / nz;
        Y[i].push([F.wx(lx, lz), ground(F.wx(lx, lz), F.wz(lx, lz)) + yOff, F.wz(lx, lz)]);
      }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) A.quad(Y[i][j + 1], Y[i + 1][j + 1], Y[i + 1][j], Y[i][j], rgb);
  };
  // Painted line on the ground in frame coords (follows the terrain at both ends)
  const gline = (A, F, x1, z1, x2, z2, w, yOff, rgb, em = false) => {
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l < 1e-3) return;
    const n = Math.max(1, Math.ceil(l / 8));
    const px = (-(z2 - z1) / l) * w * 0.5, pz = ((x2 - x1) / l) * w * 0.5;
    for (let k = 0; k < n; k++) {
      const ta = k / n, tb = (k + 1) / n;
      const ax = x1 + (x2 - x1) * ta, az = z1 + (z2 - z1) * ta, bx = x1 + (x2 - x1) * tb, bz = z1 + (z2 - z1) * tb;
      const P = (lx, lz) => { const x = F.wx(lx, lz), z = F.wz(lx, lz); return [x, ground(x, z) + yOff, z]; };
      A.quad(P(ax + px, az + pz), P(bx + px, bz + pz), P(bx - px, bz - pz), P(ax - px, az - pz), rgb, em);
    }
  };
  // Additive light pool on the ground (glow acc): centre bright, rim black; r = radius; k = intensity
  const pool = (wx, wz, r, rgb, k = 1, yOff = 0.12, rz = r, ang = 0) => {
    const seg = 10;
    const cy = ground(wx, wz) + yOff;
    const c = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (a) => { const ex = Math.cos(a) * r, ez = Math.sin(a) * rz; const x = wx + ex * ca - ez * sa, z = wz + ex * sa + ez * ca; return [x, ground(x, z) + yOff, z]; };
      const pa = P(a0), pb = P(a1);
      glow.p.push(wx, cy, wz, pb[0], pb[1], pb[2], pa[0], pa[1], pa[2]);
      for (let v = 0; v < 3; v++) { glow.n.push(0, 1, 0); glow.b.push(0); }
      glow.c.push(c[0], c[1], c[2], 0, 0, 0, 0, 0, 0);
    }
  };
  // Rectangular light pool: uniform inside (hl x hw), fading to black over `fade` metres outside
  const poolRect = (F, hl, hw, fade, rgb, k = 1, yOff = 0.105) => {
    const c = [rgb[0] * k, rgb[1] * k, rgb[2] * k], z0 = [0, 0, 0];
    const xs = [-hl - fade, -hl, hl, hl + fade], zs = [-hw - fade, -hw, hw, hw + fade];
    const P = (i, j) => { const x = F.wx(xs[i], zs[j]), z = F.wz(xs[i], zs[j]); return [x, ground(x, z) + yOff, z]; };
    const col = (i, j) => (i === 0 || i === 3 || j === 0 || j === 3 ? z0 : c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const q = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]];
      for (const t of [[0, 1, 2], [0, 2, 3]]) {
        for (const v of t) { const [a, b] = q[v]; const p = P(a, b); glow.p.push(p[0], p[1], p[2]); glow.n.push(0, 1, 0); glow.b.push(0); const cc = col(a, b); glow.c.push(cc[0], cc[1], cc[2]); }
      }
    }
  };
  const addCollider = (F, x0, x1, z0, z1, h, id) => {
    if (!colliders) return;
    const pts = [F.p(x0, 0, z0), F.p(x1, 0, z0), F.p(x1, 0, z1), F.p(x0, 0, z1)];
    const flatOuter = [];
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const q of pts) {
      flatOuter.push(Math.round(q[0] * 10) / 10, Math.round(q[2] * 10) / 10);
      a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[2]); d = Math.max(d, q[2]);
    }
    colliders.push({ minX: a + ox, maxX: b + ox, minZ: c + oz, maxZ: d + oz, h: F.y0 + h, flatOuter, ox, oz, id });
  };

  // Street face of a building: the edge whose outside meets a road soonest (and is near the POI)
  const edgesOf = (B) => {
    const f = B.f, n = f.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = f[i * 2], az = f[i * 2 + 1], bx = f[j * 2], bz = f[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 3.2) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (pointInRing(mx + nx * 0.6, mz + nz * 0.6, f)) { nx = -nx; nz = -nz; }
      if (pointInRing(mx + nx * 0.6, mz + nz * 0.6, f)) continue;
      const other = bldAt(mx + nx * 1.6, mz + nz * 1.6, 0);
      if (other && other !== B) continue; // party wall
      const r = roadNear(mx + nx * 1.5, mz + nz * 1.5, 70);
      out.push({ ax, az, bx, bz, len, nx, nz, mx, mz, road: r ? Math.max(0, r.d) : 70, roadDot: r ? Math.abs(r.ux * nz - r.uz * nx) : 0 });
    }
    return out;
  };
  const hostOf = (px, pz, maxD = 14) => {
    let best = null, bd = maxD;
    for (const B of blds) {
      if (px < B.x0 - maxD || px > B.x1 + maxD || pz < B.z0 - maxD || pz > B.z1 + maxD) continue;
      if (pointInRing(px, pz, B.f)) { if (!best || bd > 0 || B.area < best.area) { best = B; bd = 0; } continue; }
      if (bd === 0) continue;
      const f = B.f, n = f.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = f[i * 2], az = f[i * 2 + 1], dx = f[j * 2] - ax, dz = f[j * 2 + 1] - az, l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        const d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
        if (d < bd) { bd = d; best = B; }
      }
    }
    return best;
  };
  // Storefront frame on edge E around the projection of (px, pz): returns { F, W, B }
  const frontOn = (B, E, px, pz, wantW) => {
    const W = Math.max(2.6, Math.min(E.len - 0.8, wantW));
    const ux = (E.bx - E.ax) / E.len, uz = (E.bz - E.az) / E.len;
    let t = (px - E.ax) * ux + (pz - E.az) * uz;
    t = Math.max(W / 2 + 0.4, Math.min(E.len - W / 2 - 0.4, t));
    const x = E.ax + ux * t, z = E.az + uz * t;
    const F = new Frame(x, ground(x, z), z, E.nx, E.nz);
    return { F, W, B, t, E };
  };

  // ------------------------------------------------------------ storefront (shared by shops)
  // In frame F: x along the wall, z outward from the wall plane, y up from the pavement. A shallow lit display bay
  // (back wall, ceiling lights, shelving with products) sits behind the glass, so the shop reads as open inside.
  function storefront(F, W, o) {
    const rnd = o.rnd;
    const D = o.depth ?? 0.95, GH = o.glassH ?? 2.9, FB = o.fasciaH ?? 0.85;
    const scheme = o.scheme;
    const hostTop = o.hostTop ?? 99;
    const fasciaTop = Math.min(GH + FB, hostTop - 0.1);
    const fB = Math.max(0.45, fasciaTop - GH);
    // plinth + interior shell
    box(bld, F, 0, 0.16, D / 2, W, 0.32, D, C.granite, false, 'b');
    flat(bld, F, -W / 2 + 0.2, W / 2 - 0.2, 0.05, D - 0.08, 0.33, C.tile);
    face(bld, F, -W / 2 + 0.2, W / 2 - 0.2, 0.32, GH, 0.2, o.interior || C.interior, true);
    // ceiling with light strips
    A_ceiling(F, W, D, GH);
    // shelving
    if (o.shelves !== false) shelving(F, -W / 2 + 0.3, W / 2 - 0.3, D, rnd, o.tall ? 1.9 : 1.55, o.doorW || 1.9, o.doorX || 0);
    // side pilasters
    for (const s of [-1, 1]) box(bld, F, s * (W / 2 - 0.11), (GH + fB) / 2, D / 2 + 0.04, 0.22, GH + fB, D + 0.08, o.frame || C.aluDk, false, 'b');
    // glass + mullions + transom
    const gz = D - 0.06;
    face(glass, F, -W / 2 + 0.22, W / 2 - 0.22, 0.32, GH, gz, [0.6, 0.72, 0.78]);
    const mullW = 0.07;
    box(bld, F, 0, GH - 0.035, gz, W - 0.3, 0.07, 0.1, o.frame || C.aluDk);
    box(bld, F, 0, 0.36, gz, W - 0.3, 0.08, 0.1, o.frame || C.aluDk);
    const tr = GH - 0.55;
    box(bld, F, 0, tr, gz, W - 0.3, 0.06, 0.08, o.frame || C.aluDk);
    const doorW = o.doorW || 1.9, doorX = o.doorX || 0;
    const nBays = Math.max(1, Math.round((W - doorW) / 1.6));
    for (let i = 1; i < nBays; i++) {
      const x = -W / 2 + ((W) * i) / nBays;
      if (Math.abs(x - doorX) < doorW / 2 + 0.1) continue;
      box(bld, F, x, (GH + 0.36) / 2, gz, mullW, GH - 0.36, 0.09, o.frame || C.aluDk);
    }
    // sliding door: frame, leaves (meeting stiles), header sensor, mat
    for (const s of [-1, 1]) box(bld, F, doorX + (s * doorW) / 2, (tr + 0.32) / 2, gz + 0.02, 0.09, tr - 0.32, 0.12, o.frame || C.aluDk);
    box(bld, F, doorX - 0.02, (tr + 0.32) / 2, gz + 0.05, 0.05, tr - 0.4, 0.05, C.alu);
    box(bld, F, doorX + 0.04, (tr + 0.32) / 2, gz + 0.09, 0.05, tr - 0.4, 0.05, C.alu);
    box(bld, F, doorX, tr - 0.1, gz + 0.1, 0.42, 0.1, 0.12, C.black);
    box(bld, F, doorX, tr - 0.12, gz + 0.17, 0.1, 0.03, 0.02, [0.9, 0.1, 0.05], true);
    flat(bld, F, doorX - doorW / 2, doorX + doorW / 2, D + 0.02, D + 1.25, 0.03, C.black);
    // fascia sign band (lit box), accent stripes, sign text
    const fz0 = -0.02, fz1 = D + 0.18;
    box(bld, F, 0, GH + fB / 2, (fz0 + fz1) / 2, W + 0.08, fB, fz1 - fz0, scheme[0], 'f', 'k');
    if (scheme[1]) box(bld, F, 0, GH + 0.07, fz1 + 0.005, W + 0.1, 0.1, 0.03, scheme[1], 'f');
    if (scheme[2]) box(bld, F, 0, GH + fB - 0.05, fz1 + 0.005, W + 0.1, 0.07, 0.03, scheme[2], 'f');
    if (o.signText !== false) {
      const sw = Math.min(W - 0.6, Math.max(2.4, (o.signText || '').length * fB * 0.62 + 1.2));
      sign(F, o.signX || 0, GH + fB / 2 + 0.02, fz1 + 0.03, sw, Math.max(0.35, fB - 0.3), o.signStyle || 1, o.signText, o.signTextEn, o.signBg, o.signFg);
    }
    // awning below the fascia: slanted cloth + valance
    if (o.awning) {
      const aw = o.awning;
      const az0 = fz1 - 0.02, az1 = az0 + (o.awningDepth || 1.5), ay0 = GH - 0.02, ay1 = GH - 0.6;
      const stripes = Math.max(2, Math.round(W / 0.55));
      for (let i = 0; i < stripes; i++) {
        const x0 = -W / 2 + (W * i) / stripes, x1 = -W / 2 + (W * (i + 1)) / stripes;
        const c = aw[1] && i % 2 ? aw[1] : aw[0];
        bld.quad(F.p(x0, ay1, az1), F.p(x1, ay1, az1), F.p(x1, ay0, az0), F.p(x0, ay0, az0), c);
        bld.quad(F.p(x0, ay1 - 0.28, az1), F.p(x1, ay1 - 0.28, az1), F.p(x1, ay1, az1), F.p(x0, ay1, az1), c);
      }
      for (const s of [-1, 1]) {
        const x = (s * W) / 2;
        const a = F.p(x, ay0, az0), b = F.p(x, ay1, az1), c = F.p(x, ay1 - 0.28, az1), d = F.p(x, ay0 - 0.05, az0);
        if (s < 0) { bld.tri(a, d, b, aw[0]); bld.tri(b, d, c, aw[0]); } else { bld.tri(a, b, d, aw[0]); bld.tri(b, c, d, aw[0]); }
      }
    }
    // spill light on the pavement at night
    const [lx, , lz] = F.p(doorX, 0, D + 2.0);
    pool(lx, lz, Math.min(5, W * 0.5), C.lightWarm, 0.28, 0.1, 2.6, F.rotY());
    return { GH, fB, D, fz1 };
  }
  function A_ceiling(F, W, D, GH) {
    box(bld, F, 0, GH - 0.04, D / 2, W - 0.3, 0.08, D - 0.1, C.offWhite, false, 't');
    const n = Math.max(1, Math.round(W / 2.2));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.3 + ((W - 0.6) * (i + 0.5)) / n;
      box(bld, F, x, GH - 0.09, D * 0.45, Math.min(1.4, (W - 0.6) / n - 0.3), 0.02, 0.22, C.light, true);
    }
  }
  // Gondola shelving facing the window, with product fronts (2 tris each) that glow a little at night
  function shelving(F, x0, x1, D, rnd, H, doorW, doorX) {
    const rows = D > 1.6 ? [D * 0.28, D * 0.62] : [D * 0.36];
    for (const z of rows) {
      const runs = [[x0, doorX - doorW / 2 - 0.25], [doorX + doorW / 2 + 0.25, x1]];
      for (const [a, b] of runs) {
        if (b - a < 0.6) continue;
        box(bld, F, (a + b) / 2, 0.4, z, b - a, 0.16, 0.34, C.shelfDk, false, 'b');
        box(bld, F, (a + b) / 2, (H + 0.32) / 2, z - 0.16, b - a, H - 0.32, 0.03, C.shelf);
        const levels = [0.5, 0.86, 1.22, 1.58, 1.94].filter((y) => y < H - 0.1);
        for (const y of levels) {
          box(bld, F, (a + b) / 2, y - 0.02, z, b - a, 0.03, 0.34, C.shelf, false, 'b');
          box(bld, F, (a + b) / 2, y - 0.045, z + 0.17, b - a, 0.05, 0.01, [0.95, 0.85, 0.2]); // price rail
          let x = a + 0.02;
          while (x < b - 0.06) {
            const w = 0.1 + rnd() * 0.2, h = 0.1 + rnd() * 0.22;
            if (x + w > b) break;
            const c = PRODUCT[(rnd() * PRODUCT.length) | 0];
            face(bld, F, x, x + w - 0.012, y, y + Math.min(h, 0.32), z + 0.12, mul(c, 0.82), true);
            x += w;
          }
        }
        const nUp = Math.max(1, Math.round((b - a) / 1.2));
        for (let i = 0; i <= nUp; i++) box(bld, F, a + ((b - a) * i) / nUp, (H + 0.32) / 2, z + 0.03, 0.035, H - 0.32, 0.3, C.shelf);
      }
    }
  }

  // ------------------------------------------------------------ outdoor shop dressing (ATM, news rack, freezer)
  function shopDressing(F, W, E, kinds, rnd, D) {
    // place along the wall beyond the storefront ends (needs wall length), else in front of the side pilasters
    const room = (E.len - W) / 2;
    const slots = [];
    for (const k of kinds) {
      const w = { atm: 0.9, freezer: 1.65, news: 0.75, bin: 0.6 }[k] || 0.8;
      slots.push([k, w]);
    }
    let side = 1;
    const used = { 1: W / 2 + 0.25, '-1': W / 2 + 0.25 };
    for (const [k, w] of slots) {
      // alternate sides; fall back to standing on the pavement in front of the fascia ends
      let s = side;
      if (used[s] + w > W / 2 + room - 0.2) s = -s;
      let lx, lz;
      if (used[s] + w <= W / 2 + room - 0.2) { lx = s * (used[s] + w / 2); lz = k === 'atm' ? 0.32 : 0.55; used[s] += w + 0.15; }
      else { lx = s * (W / 2 - 0.7 - (k === 'freezer' ? 0.4 : 0)); lz = D + 0.9; }
      const x = F.wx(lx, lz), z = F.wz(lx, lz);
      if (bldAt(x, z, 0) && lz > 1) continue;
      push(k === 'freezer' ? 'iceChest' : k === 'news' ? 'newsRack' : k === 'atm' ? 'atm' : 'shopBin', x, ground(x, z), z, F.rotY(), 1, 1, 1, 0xffffff);
      side = -side;
    }
  }

  // ------------------------------------------------------------ gas station
  function gasStation(q, rnd, hasWashPoi = false) {
    const [px0, pz0, , , name, nameEn] = q;
    const canopy = sites.canopies.find((c) => Math.hypot(c.px - px0, c.pz - pz0) < 6.0 || Math.hypot(c.cx - px0, c.cz - pz0) < 32.0);
    const scheme = brandSchemeFor('fuel', name, nameEn, rnd);
    let F, hl, hw;
    const road0 = roadNear(px0, pz0, 90);
    if (canopy) {
      hl = Math.max(3.5, canopy.hl); hw = Math.max(3.2, canopy.hw);
      F = Frame.fromAxis(canopy.cx, 0, canopy.cz, canopy.ux, canopy.uz);
      if (
        inWater(canopy.cx, canopy.cz) ||
        inWater(F.wx(-hl, -hw), F.wz(-hl, -hw)) ||
        inWater(F.wx(hl, -hw), F.wz(hl, -hw)) ||
        inWater(F.wx(-hl, hw), F.wz(-hl, hw)) ||
        inWater(F.wx(hl, hw), F.wz(hl, hw))
      ) return false;
      F.y0 = ground(canopy.cx, canopy.cz);
    } else {
      // Synthesize: canopy long axis along the nearest road, set back from the kerb
      if (!road0 || road0.d > 70) return false;
      let nx = px0 - road0.qx, nz = pz0 - road0.qz;
      const l = Math.hypot(nx, nz);
      if (l < 0.5) { nx = -road0.uz; nz = road0.ux; } else { nx /= l; nz /= l; }
      let ok = false;
      for (const [L, Wd] of [[13, 7], [10, 6.5], [7.5, 5.5]]) {
        for (const back of [3.5, 6, 9, 13, 2]) {
          const cx = road0.qx + nx * (road0.hw + back + Wd), cz = road0.qz + nz * (road0.hw + back + Wd);
          for (const along of [0, -6, 6, -12, 12]) {
            const x = cx + road0.ux * along, z = cz + road0.uz * along;
            const G = Frame.fromAxis(x, 0, z, road0.ux, road0.uz);
            if (Math.hypot(x - px0, z - pz0) > 45) continue;
            if (!rectClear(G, -L - 2, L + 2, -Wd - 2, Wd + 2, { roadPad: 0.6 })) continue;
            F = G; hl = L; hw = Wd; ok = true; break;
          }
          if (ok) break;
        }
        if (ok) break;
      }
      if (!ok) return false;
      F.y0 = ground(F.x0, F.z0);
    }
    if (taken(F.x0, F.z0, hl)) return false;
    claim(F.x0, F.z0, hl + 4);
    const seed = hashAbs(F.x0, F.z0, 11);
    const R = rng32(seed);
    const Hc = 4.9, Th = 0.95;
    // --- forecourt slab: canopy + margin, trimmed where it would run onto buildings / roads
    const m = [7, 7, 7, 7]; // -x, +x, -z, +z
    for (let k = 0; k < 4; k++) {
      while (m[k] > 1.5) {
        const x0 = k === 0 ? -hl - m[0] : -hl, x1 = k === 1 ? hl + m[1] : hl, z0 = k === 2 ? -hw - m[2] : -hw, z1 = k === 3 ? hw + m[3] : hw;
        const ok = k === 0 ? rectClear(F, x0, -hl, z0, z1, { roadPad: 0.2 }) : k === 1 ? rectClear(F, hl, x1, z0, z1, { roadPad: 0.2 })
          : k === 2 ? rectClear(F, x0, x1, z0, -hw, { roadPad: 0.2 }) : rectClear(F, x0, x1, hw, z1, { roadPad: 0.2 });
        if (ok) break;
        m[k] -= 1.5;
      }
    }
    const fx0 = -hl - m[0], fx1 = hl + m[1], fz0 = -hw - m[2], fz1 = hw + m[3];
    slab(bld, F, fx0, fx1, fz0, fz1, 0.07, C.concreteLt, 4);
    // expansion joints every 4 m
    for (let x = Math.ceil(fx0 / 4) * 4; x < fx1; x += 4) gline(bld, F, x, fz0, x, fz1, 0.05, 0.085, C.joint);
    for (let z = Math.ceil(fz0 / 4) * 4; z < fz1; z += 4) gline(bld, F, fx0, z, fx1, z, 0.05, 0.085, C.joint);
    // --- islands + pumps
    const nI = Math.max(1, Math.min(6, Math.round((2 * hl) / 7.2)));
    const rows = 2 * hw >= 13 ? [-hw * 0.5, hw * 0.5] : [0];
    const islandL = rows.length > 1 ? Math.min(5.6, hw * 0.78) : Math.min(6.2, 2 * hw * 0.62);
    const pumpTint = toHex(scheme[0]);
    const pillars = [];
    const pumpIds = [];
    for (let i = 0; i < nI; i++) {
      const ix = -hl + ((2 * hl) * (i + 0.5)) / nI;
      for (const iz of rows) {
        // curb island: concrete body, yellow nose caps
        box(bld, F, ix, 0.12, iz, 1.25, 0.24, islandL - 0.6, C.concrete, false, 'b');
        for (const s of [-1, 1]) {
          box(bld, F, ix, 0.12, iz + s * (islandL / 2 - 0.3), 1.25, 0.24, 0.6, C.paintY, false, 'b');
        }
        // dark oil stains where cars stop
        for (const s of [-1, 1]) {
          const [sx, , sz] = F.p(ix + s * 2.1, 0, iz);
          slabSpot(sx, sz, 1.1, 1.8, F.rotY(), 0.09, [0.3, 0.3, 0.29]);
        }
        const [wx, , wz] = F.p(ix, 0, iz);
        const gy = groundTop(wx, wz) + 0.24;
        push('pump', wx, gy, wz, F.rotY(), 1, 1, 1, pumpTint);
        pumpIds.push([ox + wx, gy, oz + wz]);
        for (const s of [-1, 1]) {
          const [bx, , bz] = F.p(ix, 0, iz + s * (islandL / 2 - 0.25));
          push('bollard', bx, gy, bz, F.rotY(), 1, 1, 1, 0xffffff);
        }
        const [tx, , tz] = F.p(ix + 0.35, 0, iz + islandL * 0.22);
        push('islandBin', tx, gy, tz, F.rotY(), 1, 1, 1, pumpTint);
        // canopy pillar(s) on the island
        const ends = rows.length > 1 ? [iz + Math.sign(iz) * (islandL / 2 - 0.85)] : [iz - (islandL / 2 - 0.85), iz + (islandL / 2 - 0.85)];
        for (const pz of ends) pillars.push([ix, pz]);
      }
    }
    // lane arrows between the islands
    for (let i = 0; i <= nI; i++) {
      const lx = -hl + ((2 * hl) * i) / nI;
      if (lx < fx0 + 1 || lx > fx1 - 1) continue;
      arrow(F, lx, 0, 2.2, C.paintW);
    }
    // --- canopy
    const top = Hc + Th;
    box(bld, F, 0, Hc + Th / 2, 0, 2 * hl, Th, 2 * hw, C.white, false, 'b'); // fascia + roof
    box(bld, F, 0, Hc + Th * 0.52, 0, 2 * hl + 0.02, Th * 0.36, 2 * hw + 0.02, scheme[0], true, 'tb');
    box(bld, F, 0, Hc + 0.12, 0, 2 * hl + 0.03, 0.09, 2 * hw + 0.03, scheme[2], true, 'tb');
    flat(bld, F, -hl + 0.15, hl - 0.15, -hw + 0.15, hw - 0.15, top + 0.01, C.concreteDk);
    // soffit + recessed lights
    bld.quad(F.p(-hl, Hc, -hw), F.p(hl, Hc, -hw), F.p(hl, Hc, hw), F.p(-hl, Hc, hw), C.soffit);
    const nLx = Math.max(1, Math.round((2 * hl) / 3.6)), nLz = Math.max(1, Math.round((2 * hw) / 3.6));
    for (let i = 0; i < nLx; i++) for (let j = 0; j < nLz; j++) {
      const lx = -hl + ((2 * hl) * (i + 0.5)) / nLx, lz = -hw + ((2 * hw) * (j + 0.5)) / nLz;
      bld.quad(F.p(lx - 0.55, Hc - 0.025, lz - 0.32), F.p(lx + 0.55, Hc - 0.025, lz - 0.32), F.p(lx + 0.55, Hc - 0.025, lz + 0.32), F.p(lx - 0.55, Hc - 0.025, lz + 0.32), C.light, true);
      const [gx, , gz] = F.p(lx, 0, lz);
      pool(gx, gz, 3.0, C.lightCool, 0.16, 0.115);
    }
    // pillars: clad square columns with a brand-coloured base wrap
    for (const [x, z] of pillars) {
      box(bld, F, x, (Hc + 0.24) / 2, z, 0.42, Hc - 0.24, 0.42, C.white, false, 'b');
      box(bld, F, x, 0.24 + 0.6, z, 0.46, 1.2, 0.46, scheme[0], false, 'tb');
      box(bld, F, x, 0.24 + 1.23, z, 0.47, 0.06, 0.47, scheme[2], false, 'tb');
    }
    // canopy name on all four fascia sides
    const nm = name || '';
    const txtW = Math.max(3.2, (nameEn || nm || 'GAS').length * 0.55 + 1.2);
    for (const s of [1, -1]) {
      const G = new Frame(F.x0, F.y0, F.z0, F.bx * s, F.bz * s);
      sign(G, 0, Hc + Th * 0.52, hw + 0.03, Math.min(2 * hl - 2, txtW), Th * 0.36 - 0.04, 2, nm || '加油站', nameEn || nm || 'GAS', toHex(scheme[0]), 0xffffff);
      const E = new Frame(F.x0, F.y0, F.z0, F.ax * s, F.az * s);
      sign(E, 0, Hc + Th * 0.52, hl + 0.03, Math.min(2 * hw - 1.5, txtW), Th * 0.36 - 0.04, 2, nm || '加油站', nameEn || nm || 'GAS', toHex(scheme[0]), 0xffffff);
    }
    poolRect(F, hl, hw, 3.5, C.lightCool, 0.2);
    zones.fuel.push([ox + F.x0, F.y0, oz + F.z0, F.ax, F.az, hl, hw]);
    for (const p of pumpIds) zones.pumps.push(p);
    // --- price sign pylon by the road
    const road = roadNear(F.x0, F.z0, 60);
    if (road) {
      const cand = [];
      for (const along of [hl + 2.5, -(hl + 2.5), hl * 0.5, -hl * 0.5, 0]) {
        let nx = F.x0 - road.qx, nz = F.z0 - road.qz;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const x = road.qx + road.ux * along + nx * (road.hw + 2.0), z = road.qz + road.uz * along + nz * (road.hw + 2.0);
        cand.push([x, z, nx, nz]);
      }
      for (const [x, z, nx, nz] of cand) {
        if (bldAt(x, z, 1.2) || inWater(x, z)) continue;
        const r2 = roadNear(x, z, 4);
        if (r2 && r2.d < 0.6) continue;
        if (Math.hypot(x - F.x0, z - F.z0) > hl + 30) continue;
        pricePylon(new Frame(x, ground(x, z), z, road.ux, road.uz), scheme, nm, nameEn, R);
        break;
      }
    }
    // --- shop kiosk: an OSM building beside the canopy, else a small built one
    let shopDone = false;
    let best = null, bd = 40;
    for (const B of blds) {
      if (B.used || B.area < 25 || B.area > 900 || (B.e.height || 0) > 11) continue;
      const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
      const d = Math.hypot(cx - F.x0, cz - F.z0);
      if (d < bd) { bd = d; best = B; }
    }
    if (best) {
      const E = edgesOf(best).map((e) => ({ e, s: e.len >= 5 ? (e.nx * (F.x0 - e.mx) + e.nz * (F.z0 - e.mz)) / Math.max(1, Math.hypot(F.x0 - e.mx, F.z0 - e.mz)) : -2 }))
        .sort((a, b) => b.s - a.s)[0];
      if (E && E.s > 0.2) {
        best.used = true;
        const fr = frontOn(best, E.e, (E.e.ax + E.e.bx) / 2, (E.e.az + E.e.bz) / 2, Math.min(9, E.e.len - 1.2));
        A_store(fr, 'fuelShop', rng32(seed + 3), { name: '', scheme: [scheme[0], scheme[2], scheme[1]], kinds: ['freezer', 'news', 'bin'] });
        const [ax, , az] = fr.F.p(fr.W / 2 + 1.6, 0, 1.5);
        if (!bldAt(ax, az, 0.3)) push('airPump', ax, groundTop(ax, az), az, fr.F.rotY(), 1, 1, 1, 0xffffff);
        shopDone = true;
      }
    }
    if (!shopDone) {
      // small kiosk on the side away from the road, facing the canopy
      const away = road ? Math.sign((F.x0 - road.qx) * F.bx + (F.z0 - road.qz) * F.bz) || 1 : 1;
      const KW = Math.min(12, 2 * hl - 1), KD = 7;
      for (const gap of [3.5, 5, 7]) {
        const kz = away * (hw + gap + KD / 2);
        if (!rectClear(F, -KW / 2 - 0.5, KW / 2 + 0.5, kz - KD / 2 - 0.5, kz + KD / 2 + 0.5, { roadPad: 1 })) continue;
        const [kx, , kzz] = F.p(0, 0, kz);
        const K = new Frame(kx, ground(kx, kzz), kzz, -F.bx * away, -F.bz * away); // +z faces the canopy
        kioskBuilding(K, KW, KD, scheme, seed);
        addCollider(K, -KW / 2, KW / 2, -KD / 2, KD / 2, 4.2, `poi-kiosk-${seed}`);
        // forecourt between canopy and kiosk
        slab(bld, F, -KW / 2 - 1, KW / 2 + 1, away > 0 ? hw : kz + KD / 2, away > 0 ? kz - KD / 2 : -hw, 0.072, C.concreteLt, 4);
        const [ax, , az] = K.p(KW / 2 + 1.4, 0, KD / 2 + 1.0);
        if (!bldAt(ax, az, 0.3)) push('airPump', ax, groundTop(ax, az), az, K.rotY(), 1, 1, 1, 0xffffff);
        shopDone = true;
        break;
      }
    }
    // --- car wash bay only when backed by a real car wash POI or named car wash
    if (hasWashPoi || /car ?wash|洗車|洗车|auto ?wash|auto ?spa/i.test(`${name || ''} ${nameEn || ''}`)) {
      carWash(F, hl, hw, fx0, fx1, fz0, fz1, scheme, seed, road);
    }
    return true;
  }
  function standaloneCarWash(q, rnd) {
    const [px0, pz0, , , name, nameEn] = q;
    const road0 = roadNear(px0, pz0, 95);
    const scheme = brandSchemeFor('wash', name, nameEn, rnd);
    const L = 15, Wb = 5.6, H = 4.5;
    let G = null;
    if (road0 && road0.d <= 80) {
      let nx = px0 - road0.qx, nz = pz0 - road0.qz;
      const l = Math.hypot(nx, nz);
      if (l < 0.5) { nx = -road0.uz; nz = road0.ux; } else { nx /= l; nz /= l; }
      for (const back of [4, 7, 10, 2.5, 14]) {
        const cx = road0.qx + nx * (road0.hw + back + Wb * 0.5), cz = road0.qz + nz * (road0.hw + back + Wb * 0.5);
        for (const along of [0, -5, 5, -10, 10]) {
          const wx = cx + road0.ux * along, wz = cz + road0.uz * along;
          if (Math.hypot(wx - px0, wz - pz0) > 42) continue;
          const cand = Frame.fromAxis(wx, 0, wz, road0.ux, road0.uz);
          if (!rectClear(cand, -L / 2 - 2.0, L / 2 + 2.0, -Wb / 2 - 1.2, Wb / 2 + 1.2, { roadPad: 0.4 })) continue;
          if (taken(wx, wz, L * 0.45)) continue;
          G = cand;
          G.y0 = ground(wx, wz);
          break;
        }
        if (G) break;
      }
    }
    if (!G) {
      if (inWater(px0, pz0) || bldAt(px0, pz0, 1.5) || taken(px0, pz0, 6)) return false;
      const ux = road0 ? road0.ux : 1, uz = road0 ? road0.uz : 0;
      G = Frame.fromAxis(px0, ground(px0, pz0), pz0, ux, uz);
      if (!rectClear(G, -L / 2 - 1, L / 2 + 1, -Wb / 2 - 1, Wb / 2 + 1, { roadPad: 0.2 })) return false;
    }
    claim(G.x0, G.z0, L * 0.55);
    const seed = hashAbs(G.x0, G.z0, 19);
    washBay(G, L, Wb, H, scheme, seed);
    const [sZh, sEn] = signNames('wash', name, nameEn, false, rnd);
    for (const s of [-1, 1]) {
      const E = new Frame(G.x0, G.y0, G.z0, G.bx * s, G.bz * s);
      sign(E, 0, H - 0.35, L / 2 + 0.04, Wb - 0.8, 0.52, 3, sZh, sEn, toHex(scheme[0]), 0xffffff);
    }
    return true;
  }
  function slabSpot(x, z, rx, rz, ang, yOff, rgb) {
    const seg = 8, ca = Math.cos(ang), sa = Math.sin(ang);
    const cy = ground(x, z) + yOff;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (a) => { const ex = Math.cos(a) * rx, ez = Math.sin(a) * rz; return [x + ex * ca - ez * sa, cy, z + ex * sa + ez * ca]; };
      bld.tri([x, cy, z], P(a1), P(a0), rgb);
    }
  }
  function arrow(F, x, z, len, rgb, yOff = 0.09) {
    gline(bld, F, x, z - len / 2, x, z + len / 2 - 0.5, 0.18, yOff, rgb);
    const tip = F.p(x, 0, z + len / 2), l = F.p(x - 0.45, 0, z + len / 2 - 0.75), r = F.p(x + 0.45, 0, z + len / 2 - 0.75);
    const y = ground(tip[0], tip[2]) + yOff;
    bld.tri([l[0], y, l[2]], [tip[0], y, tip[2]], [r[0], y, r[2]], rgb);
  }
  function pricePylon(F, scheme, nm, nameEn, R) {
    const H = 7.2, w = 1.9, d = 0.42;
    box(bld, F, 0, 0.25, 0, w + 0.5, 0.5, d + 0.5, C.concrete, false, 'b');
    for (const s of [-1, 1]) box(bld, F, s * (w / 2 - 0.12), 2.4, 0, 0.22, 4.0, d, C.aluDk, false, 'b');
    // brand panel (lit both sides)
    box(bld, F, 0, H - 0.95, 0, w, 1.7, d, scheme[0], 'fk');
    box(bld, F, 0, H - 0.04, 0, w + 0.1, 0.12, d + 0.1, C.aluDk);
    for (const s of [1, -1]) {
      const G = new Frame(F.x0, F.y0, F.z0, F.bx * s, F.bz * s);
      sign(G, 0, H - 0.95, d / 2 + 0.02, w - 0.2, 0.62, 2, nm || '加油站', nameEn || nm || 'GAS', toHex(scheme[0]), 0xffffff);
    }
    // price rows: grade chip + 7-segment price, both faces
    const us = lon < -50 && lon > -170 && lat > 14;
    const jp = lon > 128 && lon < 146 && lat > 24 && lat < 46;
    const cn = lon > 73 && lon < 128 && lat > 18 && lat < 54 && !jp;
    const base = us ? 3.0 + R() * 1.6 : jp ? 165 + R() * 20 : cn ? 7.2 + R() * 1.0 : 1.55 + R() * 0.35;
    const rows = 3;
    const grade = [C.green, [0.8, 0.6, 0.05], [0.05, 0.25, 0.7]];
    for (let r = 0; r < rows; r++) {
      const y = H - 2.1 - r * 0.72;
      box(bld, F, 0, y, 0, w, 0.66, d, C.panelDk);
      const v = base + r * (us ? 0.3 : jp ? 11 : cn ? 0.4 : 0.08);
      const s = jp ? String(Math.round(v)) : us ? v.toFixed(2) + '^' : v.toFixed(2);
      for (const sd of [1, -1]) {
        const G = new Frame(F.x0, F.y0, F.z0, F.bx * sd, F.bz * sd);
        face(bld, G, -w / 2 + 0.1, -w / 2 + 0.42, y - 0.24, y + 0.24, d / 2 + 0.01, grade[r % 3], true);
        priceString(bld, G, s, -w / 2 + 0.56, y - 0.21, d / 2 + 0.012, 0.42, r === rows - 1 ? C.digitG : C.digitR);
      }
    }
    pool(F.x0, F.z0, 3, scheme[0].map((c) => Math.min(1, c + 0.3)), 0.35, 0.12);
  }
  function kioskBuilding(K, W, D, scheme, seed) {
    const H = 4.2;
    const R = rng32(seed + 5);
    const wall = R() < 0.5 ? C.stucco : [0.62, 0.62, 0.6];
    // back + side walls and roof
    box(bld, K, 0, H / 2, -D / 2 + 0.15, W, H, 0.3, wall, false, 'b');
    for (const s of [-1, 1]) box(bld, K, s * (W / 2 - 0.15), H / 2, 0, 0.3, H, D, wall, false, 'b');
    box(bld, K, 0, H + 0.25, 0, W + 0.3, 0.5, D + 0.3, wall, false, '');
    flat(bld, K, -W / 2, W / 2, -D / 2, D / 2, 0.02, C.tile);
    box(bld, K, W * 0.2, H + 0.95, -D * 0.15, 1.6, 0.9, 1.2, [0.7, 0.71, 0.72]); // rooftop HVAC
    box(bld, K, 0, H + 0.2, 0, W + 0.34, 0.22, D + 0.34, scheme[0], false, 'tb'); // brand band round the parapet
    for (const s of [-1, 1]) {
      box(bld, K, s * (W / 2 + 0.01), 1.05, -D * 0.2, 0.04, 2.1, 1.0, C.aluDk); // service door
      box(bld, K, s * (W / 2 + 0.02), 2.3, -D * 0.2, 0.06, 0.16, 0.3, C.lightWarm, true);
    }
    // glazed front (storefront set into the opening, flush with the side walls)
    const front = new Frame(K.p(0, 0, D / 2 - 1.0)[0], K.y0, K.p(0, 0, D / 2 - 1.0)[2], K.bx, K.bz);
    const fr = { F: front, W: W - 0.6, B: null };
    A_store(fr, 'kiosk', rng32(seed + 9), { name: '', scheme: [scheme[0], scheme[2], scheme[1]], kinds: ['freezer', 'news'], hostTop: H + 0.5, noDressingRoom: true });
    // interior back fill so the shop is not hollow behind the display bay
    face(bld, K, -W / 2 + 0.3, W / 2 - 0.3, 0, H, D / 2 - 1.0 + 0.02, C.interior);
  }

  // ------------------------------------------------------------ car wash bay
  function carWash(F, hl, hw, fx0, fx1, fz0, fz1, scheme, seed, road) {
    const L = 15, Wb = 5.6, H = 4.5;
    const away = road ? Math.sign((F.x0 - road.qx) * F.bx + (F.z0 - road.qz) * F.bz) || 1 : 1;
    // candidate bay centres (frame coords) with their axis: beyond the canopy ends, then behind it
    const cands = [];
    for (const s of [1, -1]) cands.push([s * (hl + 4 + Wb / 2), away * (hw * 0.3), 'z']);
    for (const s of [1, -1]) cands.push([s * (hl - L / 2), away * (hw + 6 + Wb / 2), 'x']);
    for (const s of [1, -1]) cands.push([s * (hl + 9 + Wb / 2), 0, 'z']);
    for (const [cx, cz, axis] of cands) {
      const ux = axis === 'x' ? F.ax : F.bx, uz = axis === 'x' ? F.az : F.bz;
      const [wx, , wz] = F.p(cx, 0, cz);
      const G = Frame.fromAxis(wx, 0, wz, ux, uz);
      if (!rectClear(G, -L / 2 - 3.5, L / 2 + 3.5, -Wb / 2 - 1.8, Wb / 2 + 1.8, { roadPad: 0.8 })) continue;
      if (taken(wx, wz, 2)) continue;
      G.y0 = ground(wx, wz);
      washBay(G, L, Wb, H, scheme, seed);
      return true;
    }
    return false;
  }
  function washBay(G, L, Wb, H, scheme, seed) {
    const R = rng32(seed + 21);
    const wall = [0.8, 0.8, 0.78];
    // slab + approach / exit aprons, drain channel, guide rail
    slab(bld, G, -L / 2 - 3.5, L / 2 + 3.5, -Wb / 2 - 1.2, Wb / 2 + 1.2, 0.075, C.concrete, 4);
    gline(bld, G, -L / 2 + 0.5, 0, L / 2 - 0.5, 0, 0.35, 0.09, [0.06, 0.06, 0.065]);
    box(bld, G, 0, 0.18, -Wb / 2 + 0.75, L - 1, 0.1, 0.12, C.galv);
    // side walls: block lower half, translucent upper band, coloured stripe
    for (const s of [-1, 1]) {
      const z = s * (Wb / 2 + 0.15);
      box(bld, G, 0, 1.3, z, L, 2.6, 0.3, wall, false, 'b');
      box(glass, G, 0, 1.3 + 2.6 + (H - 2.6) / 2 - 0.05, z, L - 0.4, H - 2.7, 0.05, [0.7, 0.8, 0.85]);
      for (let i = 0; i <= 5; i++) box(bld, G, -L / 2 + (L * i) / 5, H / 2, z, 0.18, H, 0.34, scheme[0]);
      box(bld, G, 0, 2.62, z, L + 0.02, 0.12, 0.34, scheme[2], true);
    }
    // roof + fascia with signs at both ends
    box(bld, G, 0, H + 0.35, 0, L + 0.6, 0.7, Wb + 1.0, scheme[0], 'lr', 'b');
    box(bld, G, 0, H + 0.01, 0, L + 0.6, 0.04, Wb + 1.0, C.soffit, false, 't');
    for (const s of [-1, 1]) {
      const E = new Frame(G.x0, G.y0, G.z0, G.ax * s, G.az * s);
      sign(E, 0, H + 0.35, L / 2 + 0.32, Wb, 0.52, 3, '洗车', 'CAR WASH', toHex(scheme[0]), 0xffffff);
      // entry / exit lamps (green / red)
      box(bld, E, Wb / 2 - 0.4, H - 0.35, L / 2 - 0.1, 0.25, 0.5, 0.15, C.black);
      box(bld, E, Wb / 2 - 0.4, H - 0.25, L / 2 - 0.02, 0.14, 0.14, 0.02, s > 0 ? [0.1, 1, 0.3] : [1, 0.1, 0.05], true);
    }
    // ceiling light strips
    for (const s of [-1, 1]) box(bld, G, 0, H - 0.05, s * (Wb / 2 - 0.7), L - 1, 0.06, 0.18, C.light, true);
    pool(G.x0, G.z0, L * 0.45, C.lightCool, 0.5, 0.11, Wb * 0.6, Math.atan2(G.az, G.ax));
    // gantry portal (static) + animated brushes (instanced)
    const gx = -L * 0.12;
    for (const s of [-1, 1]) box(bld, G, gx, (H - 0.3) / 2, s * (Wb / 2 - 0.35), 0.35, H - 0.3, 0.35, C.galv, false, 'b');
    box(bld, G, gx, H - 0.45, 0, 0.4, 0.4, Wb - 0.4, C.galv);
    box(bld, G, gx, H - 0.8, 0, 0.6, 0.35, 1.2, scheme[0]);
    for (const s of [-1, 1]) {
      const [bx, , bz] = G.p(gx + 1.2, 0, s * (Wb / 2 - 0.95));
      push('brushV', bx, G.y0 + 0.15, bz, G.rotY(), 1, 1, 1, s < 0 ? 0x2f7bff : 0xff4fa0);
    }
    const [hx, , hz] = G.p(gx + 3.0, 0, 0);
    push('brushH', hx, G.y0 + H - 1.25, hz, G.rotY(), 1, 1, Wb - 1.2, 0x29c4ff);
    // pay kiosk at the entry (driver side), vacuum stations along the outside
    const [kx, , kz] = G.p(-L / 2 - 2.4, 0, -Wb / 2 + 0.2);
    push('payKiosk', kx, groundTop(kx, kz) + 0.08, kz, G.rotY(Math.PI / 2), 1, 1, 1, toHex(scheme[0]));
    for (let i = 0; i < 3; i++) {
      const lz = Wb / 2 + 1.0, lx = -L / 2 + 2.5 + i * 5;
      const [vx, , vz] = G.p(lx, 0, lz);
      if (bldAt(vx, vz, 0.5)) continue;
      push('vacuum', vx, groundTop(vx, vz) + 0.08, vz, G.rotY(Math.PI), 1, 1, 1, toHex(scheme[R() < 0.5 ? 0 : 2]));
    }
    // colliders: the two side walls (the bay itself stays drivable)
    for (const s of [-1, 1]) addCollider(G, -L / 2, L / 2, s * (Wb / 2) - 0.15, s * (Wb / 2) + 0.15, H, `poi-wash-${seed}-${s}`);
    zones.wash.push([ox + G.x0, G.y0, oz + G.z0, G.ax, G.az, L / 2, Wb / 2]);
  }

  // ------------------------------------------------------------ shops on a host building
  function A_store(fr, kind, rnd, o) {
    const { F, W, B } = fr;
    zones.shops.push([ox + F.x0, F.y0, oz + F.z0, F.ax, F.az, W / 2, 1, kind]);
    const hostTop = o.hostTop ?? (B ? Math.max(3.4, (B.e.topY || 0) - F.y0) : 6);
    const prevBid = bld.bid;
    bld.bid = glass.bid = B ? B.idx + 1 : 0;
    const scheme = o.scheme;
    let res;
    if (kind === 'conv' || kind === 'fuelShop' || kind === 'kiosk') {
      const GH = Math.min(2.95, hostTop - 1.05);
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.85, depth: 0.95,
        signText: o.name || (kind === 'conv' ? '便利店' : '商店'), signTextEn: o.nameEn || o.name || (kind === 'conv' ? 'MART 24' : 'FOOD MART'),
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 1,
        awning: kind === 'conv' && o.awning ? o.awning : null, frame: C.aluDk,
      });
      if (!o.noDressingRoom && fr.E) shopDressing(F, W, fr.E, o.kinds || ['atm', 'news', 'freezer'], rnd, res.D);
      else if (o.kinds) {
        // free-standing kiosk: freezer + rack in front of the glass, off the door line
        const [fx, , fz] = F.p(-W / 2 + 1.0, 0, res.D + 0.7);
        push('iceChest', fx, groundTop(fx, fz), fz, F.rotY(), 1, 1, 1, 0xffffff);
        const [nx, , nz] = F.p(W / 2 - 0.6, 0, res.D + 0.55);
        push('newsRack', nx, groundTop(nx, nz), nz, F.rotY(), 1, 1, 1, 0xffffff);
      }
    } else if (kind === 'pharmacy') {
      const GH = Math.min(2.95, hostTop - 1.05);
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.8, depth: 0.95, interior: [0.92, 0.94, 0.92],
        signText: o.name || '药店', signTextEn: o.nameEn || o.name || 'PHARMACY', signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 1, frame: C.aluDk,
      });
      // projecting double-sided green cross on a bracket at the storefront corner
      const [cx, , cz] = F.p(W / 2 + 0.05, 0, 0.75);
      push('greenCross', cx, F.y0 + Math.min(hostTop - 0.8, GH + 1.6), cz, F.rotY(Math.PI / 2), 1, 1, 1, 0xffffff);
    } else if (kind === 'bank') {
      const GH = Math.min(3.0, hostTop - 1.05);
      res = storefront(F, W, {
        rnd, scheme: [[0.1, 0.12, 0.16], [0.75, 0.6, 0.25], null], hostTop, glassH: GH, fasciaH: 0.85, depth: 0.9, shelves: false, interior: [0.5, 0.44, 0.36],
        signText: o.name || '银行', signTextEn: o.nameEn || o.name || 'BANK', signBg: 0x1a1f29, signFg: 0xd8b25a, signStyle: 4, frame: [0.12, 0.12, 0.13],
      });
      box(bld, F, 0, 0.85, 0.42, W - 1.6, 1.05, 0.35, [0.24, 0.17, 0.12]); // teller counter
      box(bld, F, 0, 1.4, 0.42, W - 1.6, 0.05, 0.4, [0.62, 0.6, 0.55]);
      face(bld, F, -W / 2 + 0.5, W / 2 - 0.5, 1.9, 2.4, 0.22, [0.75, 0.6, 0.25], true);
      for (const s of [-1, 1]) {
        if (W + 2.2 > (fr.E ? fr.E.len : 0)) break;
        const [ax, , az] = F.p(s * (W / 2 + 0.6), 0, 0.3);
        push('atm', ax, groundTop(ax, az), az, F.rotY(), 1, 1, 1, 0x1f3a66);
      }
    } else if (kind === 'hospital') {
      // emergency entrance: glazed lobby, porte-cochere canopy on columns, lit EMERGENCY sign, ambulance bay
      const GH = Math.min(3.2, hostTop - 1.05);
      res = storefront(F, W, {
        rnd, scheme: [[0.9, 0.9, 0.88], [0.7, 0.04, 0.04], null], hostTop, glassH: GH, fasciaH: 0.6, depth: 1.2, shelves: false,
        interior: [0.9, 0.94, 0.96], doorW: 2.6, signText: false, frame: C.alu,
      });
      const cd = 8.5, cw = Math.min(W + 1, 13), cy = GH + 1.1;
      box(bld, F, 0, cy + 0.35, res.D + cd / 2, cw, 0.7, cd, [0.88, 0.88, 0.86], false, '');
      box(bld, F, 0, cy - 0.01, res.D + cd / 2, cw - 0.1, 0.02, cd - 0.1, C.soffit, false, 't');
      for (const sx of [-1, 1]) for (const sz of [cd * 0.45, cd - 0.5]) box(bld, F, sx * (cw / 2 - 0.4), cy / 2, res.D + sz, 0.45, cy, 0.45, C.white, false, 'b');
      for (let i = 0; i < 3; i++) box(bld, F, 0, cy - 0.04, res.D + 1.5 + i * 2.7, cw * 0.6, 0.02, 0.35, C.light, true);
      box(bld, F, 0, cy + 0.35, res.D + cd + 0.02, cw * 0.62, 0.55, 0.06, [0.85, 0.06, 0.05], 'f');
      const G = new Frame(F.x0, F.y0, F.z0, F.bx, F.bz);
      sign(G, 0, cy + 0.35, res.D + cd + 0.06, cw * 0.6, 0.48, 3, '急诊', 'EMERGENCY', 0xc00a0a, 0xffffff);
      slab(bld, F, -cw / 2, cw / 2, res.D + 0.2, res.D + cd, 0.07, C.concreteLt, 4);
      gline(bld, F, -cw / 2 + 0.6, res.D + 1.2, cw / 2 - 0.6, res.D + 1.2, 0.2, 0.09, C.paintY);
      const [ax, , az] = F.p(cw * 0.18, 0, res.D + cd * 0.55);
      push('car', ax, groundTop(ax, az) - 0.03, az, F.rotY(Math.PI / 2), 7, 1, 1, 0xffffff);
      pool(F.wx(0, res.D + cd / 2), F.wz(0, res.D + cd / 2), cw * 0.5, C.lightCool, 0.25, 0.12, cd * 0.55, F.rotY());
    } else if (kind === 'fast') {
      const GH = Math.min(3.0, hostTop - 1.05);
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.95, depth: 1.0, shelves: false, interior: [0.95, 0.85, 0.7],
        signText: o.name || '快餐', signTextEn: o.nameEn || o.name || 'BURGERS', signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 1,
        awning: [scheme[0], scheme[1]], frame: C.aluDk,
      });
      diner(F, W, res, rnd);
    } else if (kind === 'cafe_bistro') {
      const GH = Math.min(3.05, hostTop - 1.0);
      const woodFrame = [0.34, 0.20, 0.11], brassTrim = [0.85, 0.68, 0.26];
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.88, depth: 1.0, shelves: false, interior: [0.98, 0.88, 0.70],
        signText: o.name || '咖啡馆', signTextEn: o.nameEn || o.name || 'CAFE & BISTRO',
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 4,
        awning: [scheme[0], scheme[1]], awningDepth: 1.75, frame: woodFrame,
      });
      // Brass fascia accent rail + warm interior espresso bar & glowing pendant lamps
      box(bld, F, 0, GH + 0.04, res.D + 0.19, W + 0.12, 0.05, 0.04, brassTrim);
      box(bld, F, 0, 0.85, 0.38, Math.min(W - 1.6, 5.2), 1.0, 0.42, woodFrame);
      box(bld, F, 0, 1.37, 0.38, Math.min(W - 1.5, 5.3), 0.05, 0.48, [0.92, 0.90, 0.85]);
      const nPend = Math.max(2, Math.min(5, Math.round(W / 1.9)));
      for (let i = 0; i < nPend; i++) {
        const px = -W * 0.36 + (W * 0.72 * i) / Math.max(1, nPend - 1);
        box(bld, F, px, GH - 0.55, 0.52, 0.24, 0.18, 0.24, [1.0, 0.86, 0.55], true);
      }
      // Sidewalk patio dining zone: 2-3 bistro tables with umbrellas + A-frame chalkboard menu sign
      const patioZ = res.D + 1.85;
      const nTables = W >= 8.2 ? 3 : 2;
      const span = Math.min(W - 1.4, (nTables - 1) * 2.55);
      const uTint = toHex(scheme[0]);
      for (let i = 0; i < nTables; i++) {
        const tx = nTables === 1 ? 0 : -span / 2 + (span * i) / (nTables - 1);
        if (Math.abs(tx) < 0.85 && nTables === 2) continue;
        const [wx, , wz] = F.p(tx, 0, patioZ);
        if (!bldAt(wx, wz, 0.2)) push('patioTable', wx, groundTop(wx, wz), wz, F.rotY((i % 2) * 0.35), 1, 1, 1, uTint);
      }
      const [mx, , mz] = F.p(W / 2 - 0.35, 0, res.D + 2.35);
      if (!bldAt(mx, mz, 0.2)) push('menuAFrame', mx, groundTop(mx, mz), mz, F.rotY(0.28), 1, 1, 1, uTint);
      pool(F.wx(0, patioZ), F.wz(0, patioZ), Math.min(5.5, W * 0.55), C.lightWarm, 0.38, 0.11, 2.8, F.rotY());
    } else if (kind === 'pub_bar') {
      const GH = Math.min(2.95, hostTop - 1.0);
      const darkOak = [0.16, 0.10, 0.06], brickW = [0.44, 0.20, 0.14], gold = [0.90, 0.72, 0.24];
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.9, depth: 0.95, shelves: false, interior: [0.92, 0.64, 0.28],
        signText: o.name || '精酿酒馆', signTextEn: o.nameEn || o.name || 'TAVERN & PUB',
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 4, frame: darkOak,
      });
      // Classic brick wainscot + dark-timber pilasters + warm amber stained-glass transom windows
      for (const s of [-1, 1]) {
        const wx = s * (W * 0.28), ww = Math.max(0.8, W * 0.26);
        box(bld, F, wx, 0.55, res.D - 0.02, ww, 0.78, 0.14, brickW, false, 'b');
        face(bld, F, wx - ww * 0.44, wx + ww * 0.44, GH - 0.52, GH - 0.08, res.D + 0.01, [0.98, 0.68, 0.18], true);
      }
      // Projecting wrought-iron hanging tavern sign bracket at corner
      const bx = W / 2 - 0.15, by = GH + 0.35;
      box(bld, F, bx, by + 0.28, res.D + 0.55, 0.06, 0.06, 1.05, C.black);
      box(bld, F, bx, by - 0.08, res.D + 0.68, 0.08, 0.56, 0.68, scheme[0], 'lr');
      box(bld, F, bx, by - 0.08, res.D + 0.68, 0.09, 0.60, 0.72, gold, false, 'fb');
      // Outdoor oak barrels flanking entrance + beer-garden bench table
      for (const s of [-1, 1]) {
        const [px, , pz] = F.p(s * (W * 0.34), 0, res.D + 0.65);
        if (!bldAt(px, pz, 0.15)) push('pubBarrel', px, groundTop(px, pz), pz, F.rotY(s * 0.4), 1, 1, 1, toHex(scheme[0]));
      }
      const [bx2, , bz2] = F.p(W * 0.26, 0, res.D + 2.05);
      if (!bldAt(bx2, bz2, 0.2)) push('beerBench', bx2, groundTop(bx2, bz2), bz2, F.rotY(Math.PI / 2), 1, 1, 1, toHex(scheme[0]));
    } else if (kind === 'hotel') {
      const GH = Math.min(3.5, hostTop - 1.1);
      const brass = [0.86, 0.70, 0.28], marble = [0.90, 0.88, 0.84], carpetR = [0.68, 0.06, 0.08];
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.95, depth: 1.25, shelves: false,
        interior: [0.98, 0.90, 0.74], doorW: 2.5,
        signText: o.name || '大酒店', signTextEn: o.nameEn || o.name || 'GRAND HOTEL',
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 4, frame: brass,
      });
      // Revolving glass entrance drum + brass crown
      cyl(glass, F, 0, 0.18, res.D + 0.15, 1.18, GH - 0.55, 12, [0.68, 0.82, 0.88], false, false);
      cyl(bld, F, 0, GH - 0.42, res.D + 0.15, 1.24, 0.22, 12, brass, false, true);
      // Grand porte-cochere drop-off canopy projecting over front driveway on twin marble/brass columns
      const cd = 5.4, cw = Math.min(W + 1.2, 11.5), cy = GH + 0.85;
      box(bld, F, 0, cy + 0.34, res.D + cd / 2, cw, 0.68, cd, marble, false, '');
      box(bld, F, 0, cy + 0.34, res.D + cd / 2, cw + 0.08, 0.18, cd + 0.08, brass, true, 'tb');
      box(bld, F, 0, cy - 0.01, res.D + cd / 2, cw - 0.16, 0.03, cd - 0.16, C.soffit, false, 't');
      for (let i = 0; i < 3; i++) box(bld, F, 0, cy - 0.04, res.D + 1.1 + i * 1.6, cw * 0.62, 0.03, 0.32, C.lightWarm, true);
      for (const sx of [-1, 1]) {
        const colX = sx * (cw / 2 - 0.48), colZ = res.D + cd - 0.48;
        box(bld, F, colX, 0.35, colZ, 0.56, 0.7, 0.56, brass, false, 'b');
        box(bld, F, colX, cy / 2, colZ, 0.44, cy, 0.44, marble, false, 'b');
        box(bld, F, colX, cy - 0.15, colZ, 0.54, 0.26, 0.54, brass);
      }
      // Red VIP entrance carpet runner + driveway apron
      slab(bld, F, -cw / 2 - 0.4, cw / 2 + 0.4, res.D + 0.1, res.D + cd + 0.4, 0.072, C.concreteLt, 4);
      flat(bld, F, -1.15, 1.15, res.D + 0.05, res.D + cd - 0.2, 0.095, carpetR);
      // Vertical illuminated HOTEL blade sign higher on the facade
      const bladeH = Math.min(4.6, Math.max(2.4, hostTop - cy - 1.2));
      const bladeY = cy + 0.8 + bladeH / 2;
      box(bld, F, W / 2 - 0.35, bladeY, res.D + 0.55, 0.26, bladeH, 0.92, scheme[0], 'lr');
      box(bld, F, W / 2 - 0.35, bladeY, res.D + 1.02, 0.16, bladeH - 0.2, 0.08, brass, true);
      for (const s of [-1, 1]) {
        const BFrame = new Frame(F.x0, F.y0, F.z0, F.ax * s, F.az * s);
        sign(BFrame, s > 0 ? -(res.D + 0.55) : res.D + 0.55, bladeY, W / 2 - 0.2, 0.82, bladeH * 0.72, 4, '酒店', 'HOTEL', toHex(scheme[0]), 0xf5d76e);
      }
      // Brass bellhop luggage trolley + VIP stanchion post
      const [tx, , tz] = F.p(1.85, 0, res.D + 1.45);
      push('bellhopCart', tx, groundTop(tx, tz), tz, F.rotY(0.25), 1, 1, 1, toHex(scheme[2] || carpetR));
      const [sx0, , sz0] = F.p(-1.45, 0, res.D + 2.1);
      push('stanchion', sx0, groundTop(sx0, sz0), sz0, F.rotY(), 1, 1, 1, 0xd4af37);
      pool(F.wx(0, res.D + cd / 2), F.wz(0, res.D + cd / 2), cw * 0.55, C.lightWarm, 0.45, 0.115, cd * 0.6, F.rotY());
    } else if (kind === 'cinema_theatre') {
      const GH = Math.min(3.3, hostTop - 1.2);
      const goldGlow = [1.0, 0.84, 0.24], neonTrim = scheme[2] || [0.95, 0.30, 0.65], carpetR = [0.72, 0.05, 0.08];
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 1.05, depth: 1.1, shelves: false,
        interior: [0.95, 0.78, 0.52], doorW: 2.4, signText: false, frame: [0.16, 0.12, 0.14],
      });
      // Iconic retro Broadway/Cinema 3-sided projecting marquee canopy with warm gold & neon bulb trim
      const mw = Math.min(W + 0.6, 10.8), md = 2.65, my = GH + 0.55, mh = 1.18;
      box(bld, F, 0, my, res.D + md / 2, mw, mh, md, scheme[0], false, 'k');
      // Glowing marquee chaser bulbs / neon bands around all 3 sides (front + left + right)
      box(bld, F, 0, my + mh / 2 - 0.07, res.D + md / 2, mw + 0.1, 0.12, md + 0.1, goldGlow, 'flr', 'k');
      box(bld, F, 0, my - mh / 2 + 0.07, res.D + md / 2, mw + 0.1, 0.12, md + 0.1, goldGlow, 'flr', 'k');
      box(bld, F, 0, my, res.D + md / 2, mw + 0.06, mh - 0.28, md + 0.06, [0.98, 0.95, 0.86], 'flr', 'tbk');
      box(bld, F, 0, my + mh / 2 + 0.18, res.D + md - 0.15, mw * 0.55, 0.28, 0.16, neonTrim, true);
      // Glowing soffit light bulbs under marquee
      flat(bld, F, -mw / 2 + 0.2, mw / 2 - 0.2, res.D + 0.15, res.D + md - 0.15, my - mh / 2 - 0.01, goldGlow, true);
      // Front and side marquee sign panels
      const sZh = o.name || '百老汇剧院', sEn = o.nameEn || o.name || 'GRAND CINEMA';
      sign(F, 0, my, res.D + md + 0.05, mw - 0.5, mh - 0.34, 2, sZh, sEn, 0xfff6dc, toHex(scheme[0]));
      for (const s of [-1, 1]) {
        const SFrame = new Frame(F.x0, F.y0, F.z0, F.ax * s, F.az * s);
        sign(SFrame, s > 0 ? -(res.D + md / 2) : res.D + md / 2, my, mw / 2 + 0.05, md - 0.35, mh - 0.36, 2, sZh, sEn, 0xfff6dc, toHex(scheme[0]));
      }
      // Ticket booth in center + glowing movie/show poster lightboxes flanking double doors
      box(bld, F, 0, 1.1, res.D + 0.25, 1.15, 2.1, 0.9, [0.78, 0.62, 0.22], false, 'b');
      face(bld, F, -0.45, 0.45, 0.95, 1.85, res.D + 0.72, [1.0, 0.92, 0.70], true);
      const posterCols = [[0.95, 0.28, 0.18], [0.18, 0.55, 0.95], [0.95, 0.75, 0.15], [0.75, 0.22, 0.88]];
      for (const s of [-1, 1]) {
        const px = s * Math.min(W * 0.34, 3.1);
        box(bld, F, px, 1.55, res.D + 0.04, 1.05, 1.55, 0.1, [0.85, 0.68, 0.24]);
        face(bld, F, px - 0.44, px + 0.44, 0.85, 2.25, res.D + 0.1, posterCols[(s > 0 ? 1 : 0) + ((rnd() * 2) | 0)], true);
      }
      // Red carpet runner + twin brass velvet-rope stanchion posts
      flat(bld, F, -1.25, 1.25, res.D + 0.02, res.D + md + 0.7, 0.09, carpetR);
      for (const s of [-1, 1]) {
        const [sx0, , sz0] = F.p(s * 1.45, 0, res.D + 1.55);
        push('stanchion', sx0, groundTop(sx0, sz0), sz0, F.rotY(), 1, 1, 1, 0xd4af37);
      }
      pool(F.wx(0, res.D + md * 0.6), F.wz(0, res.D + md * 0.6), mw * 0.6, goldGlow, 0.52, 0.115, md * 0.9, F.rotY());
    } else if (kind === 'auto_service') {
      const GH = Math.min(3.5, hostTop - 1.0);
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.92, depth: 2.35, shelves: false,
        interior: [0.82, 0.84, 0.86], doorW: 1.5, doorX: -W * 0.32,
        signText: o.name || '名车维修中心', signTextEn: o.nameEn || o.name || 'AUTO SERVICE',
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 2, frame: C.aluDk,
      });
      // Open roll-up service bay on +X side of the facade + paved service apron
      const bayX = W * 0.16, bayW = Math.min(3.8, W * 0.52), bayH = Math.min(2.75, GH - 0.25);
      slab(bld, F, -W / 2 - 0.4, W / 2 + 0.4, res.D - 0.1, res.D + 3.8, 0.072, C.concrete, 4);
      gline(bld, F, bayX - bayW / 2, res.D + 0.2, bayX - bayW / 2, res.D + 3.4, 0.12, 0.09, C.paintY);
      gline(bld, F, bayX + bayW / 2, res.D + 0.2, bayX + bayW / 2, res.D + 3.4, 0.12, 0.09, C.paintY);
      // Roll-up shutter header & ribbed door partially open at top + dark garage bay recess
      box(bld, F, bayX, bayH / 2 + 0.16, res.D - 0.02, bayW + 0.24, bayH, 0.18, C.aluDk, false, 'fb');
      face(bld, F, bayX - bayW / 2 + 0.08, bayX + bayW / 2 - 0.08, bayH - 0.55, bayH + 0.12, res.D + 0.04, C.shutter);
      face(bld, F, bayX - bayW / 2 + 0.08, bayX + bayW / 2 - 0.08, 0.2, bayH - 0.55, 0.28, [0.18, 0.20, 0.22]);
      // Interior hydraulic 2-post car lift (twin painted columns + lift arms + elevated car)
      const liftCol = scheme[0];
      for (const s of [-1, 1]) {
        box(bld, F, bayX + s * 1.32, 1.35, 1.18, 0.24, 2.5, 0.24, liftCol, false, 'b');
        box(bld, F, bayX + s * 0.92, 1.18, 1.18, 0.85, 0.1, 1.85, C.paintY);
      }
      const [cx, , cz] = F.p(bayX, 0, 1.25);
      push('car', cx, F.y0 + 1.22, cz, F.rotY(), 0, 1, 1, CAR_PAINT[(rnd() * CAR_PAINT.length) | 0]);
      // Stacked rubber tire racks + roadside auto service pylon sign
      const [trx, , trz] = F.p(-W / 2 + 1.05, 0, res.D + 0.52);
      push('tireRack', trx, groundTop(trx, trz), trz, F.rotY(), 1, 1, 1, toHex(scheme[0]));
      const pX = W / 2 + 0.45, pZ = res.D + 2.6;
      box(bld, F, pX, 2.2, pZ, 1.15, 4.2, 0.32, scheme[0], 'fk', 'b');
      box(bld, F, pX, 0.2, pZ, 1.4, 0.4, 0.5, C.concrete, false, 'b');
      sign(F, pX, 3.25, pZ + 0.18, 1.0, 0.75, 2, '修车', 'AUTO', toHex(scheme[0]), 0xffffff);
    } else if (kind === 'marketplace_retail') {
      const GH = Math.min(3.4, hostTop - 1.0);
      res = storefront(F, W, {
        rnd, scheme, hostTop, glassH: GH, fasciaH: 0.95, depth: 1.1, shelves: true, tall: true,
        interior: [0.96, 0.92, 0.82],
        signText: o.name || '鲜花蔬果市集', signTextEn: o.nameEn || o.name || 'MARKETPLACE',
        signBg: toHex(scheme[0]), signFg: toHex(scheme[1]), signStyle: 1, frame: C.aluDk,
      });
      // Tall glazed atrium arch centerpiece + colorful multi-gable open-air market canopy stalls
      const archW = Math.min(3.4, W * 0.42), archH = GH + 1.25;
      box(bld, F, 0, archH / 2, res.D + 0.18, archW + 0.36, archH, 0.38, scheme[0], false, 'b');
      face(glass, F, -archW / 2, archW / 2, 0.3, archH - 0.25, res.D + 0.38, [0.70, 0.86, 0.92]);
      const nGables = Math.max(2, Math.min(4, Math.floor(W / 2.6)));
      const gw = (W - 0.4) / nGables, gz0 = res.D + 0.05, gz1 = res.D + 2.25, gy0 = GH - 0.15, gyPeak = GH + 0.48;
      const stallPalette = [[0.86, 0.18, 0.14], [0.14, 0.58, 0.26], [0.94, 0.62, 0.08], [0.58, 0.20, 0.68]];
      for (let i = 0; i < nGables; i++) {
        const x0 = -W / 2 + 0.2 + i * gw, x1 = x0 + gw - 0.08, xm = (x0 + x1) / 2;
        const cA = stallPalette[i % stallPalette.length], cB = [0.96, 0.95, 0.90];
        bld.quad(F.p(x0, gy0, gz1), F.p(xm, gyPeak, gz1), F.p(xm, gyPeak + 0.1, gz0), F.p(x0, gy0 + 0.1, gz0), cA);
        bld.quad(F.p(xm, gyPeak, gz1), F.p(x1, gy0, gz1), F.p(x1, gy0 + 0.1, gz0), F.p(xm, gyPeak + 0.1, gz0), cB);
        bld.tri(F.p(x0, gy0, gz1), F.p(x1, gy0, gz1), F.p(xm, gyPeak, gz1), cA, true);
        // Tilted wooden produce & flower display crates under the canopy stalls
        if (Math.abs(xm) > 1.05) {
          const [cx, , cz] = F.p(xm, 0, res.D + 1.15);
          if (!bldAt(cx, cz, 0.15)) push('marketCrate', cx, groundTop(cx, cz), cz, F.rotY(), 1, 1, 1, toHex(cA));
        }
      }
      pool(F.wx(0, res.D + 1.5), F.wz(0, res.D + 1.5), W * 0.55, C.lightWarm, 0.42, 0.11, 2.6, F.rotY());
    }
    bld.bid = glass.bid = prevBid;
    return res;
  }
  // Fast-food interior through the glass: counter, menu boards, tables
  function diner(F, W, res, rnd) {
    const { D, GH } = res;
    box(bld, F, 0, GH - 0.55, 0.08, Math.min(W - 1, 6), 0.6, 0.06, [0.1, 0.1, 0.1]);
    const nM = Math.max(1, Math.min(4, Math.floor((W - 1) / 1.6)));
    for (let i = 0; i < nM; i++) {
      const x = -((nM - 1) * 1.5) / 2 + i * 1.5;
      face(bld, F, x - 0.68, x + 0.68, GH - 0.82, GH - 0.3, 0.12, PRODUCT[(rnd() * 6) | 0], true);
    }
    box(bld, F, 0, 0.82, 0.3, Math.min(W - 1, 5), 0.95, 0.4, [0.55, 0.12, 0.08]);
    for (let x = -W / 2 + 0.8; x < W / 2 - 0.6; x += 1.4) {
      if (Math.abs(x) < 1.2) continue;
      box(bld, F, x, 0.72, D - 0.35, 0.6, 0.04, 0.4, [0.9, 0.9, 0.86]);
      box(bld, F, x, 0.52, D - 0.35, 0.06, 0.4, 0.06, C.alu, false, 'b');
    }
  }
  // Drive-thru along the side wall `E2` next to the shop's front: lane, pickup window, menu board, speaker
  function driveThru(B, E2, rnd, scheme) {
    if (E2.len < 9) return false;
    const ux = (E2.bx - E2.ax) / E2.len, uz = (E2.bz - E2.az) / E2.len;
    const F = new Frame((E2.ax + E2.bx) / 2, ground((E2.ax + E2.bx) / 2, (E2.az + E2.bz) / 2), (E2.az + E2.bz) / 2, E2.nx, E2.nz);
    const L = Math.min(E2.len + 10, 34);
    if (!rectClear(F, -L / 2, L / 2, 0.4, 4.4, { roadPad: 0.5, skip: B })) return false;
    const prev = bld.bid;
    bld.bid = B.idx + 1;
    slab(bld, F, -L / 2, L / 2, 0.3, 4.2, 0.075, C.asphaltLt, 5);
    gline(bld, F, -L / 2, 4.1, L / 2, 4.1, 0.15, 0.09, C.paintY);
    gline(bld, F, -L / 2, 0.45, L / 2, 0.45, 0.15, 0.09, C.paintY);
    const dir = F.ax * ux + F.az * uz > 0 ? 1 : -1;
    for (const x of [-L * 0.3, 0, L * 0.3]) {
      gline(bld, F, x - dir * 1.2, 2.3, x + dir * 0.6, 2.3, 0.22, 0.095, C.paintW);
      const tip = F.p(x + dir * 1.3, 0, 2.3), l = F.p(x + dir * 0.6, 0, 1.75), r = F.p(x + dir * 0.6, 0, 2.85);
      const y = ground(tip[0], tip[2]) + 0.095;
      if (dir > 0) bld.tri([l[0], y, l[2]], [r[0], y, r[2]], [tip[0], y, tip[2]], C.paintW); else bld.tri([l[0], y, l[2]], [tip[0], y, tip[2]], [r[0], y, r[2]], C.paintW);
    }
    // pickup window with a small canopy, lit
    const wx = dir * Math.min(E2.len / 2 - 1.2, 2.5);
    box(bld, F, wx, 1.55, 0.06, 1.4, 1.1, 0.12, C.aluDk, false, 'b');
    face(bld, F, wx - 0.6, wx + 0.6, 1.05, 2.05, 0.13, [0.95, 0.85, 0.6], true);
    box(bld, F, wx, 2.55, 0.5, 2.0, 0.12, 1.0, scheme[0]);
    box(bld, F, wx, 1.0, 0.25, 1.4, 0.06, 0.35, C.alu);
    sign(F, wx, 3.05, 0.2, 2.6, 0.45, 3, '得来速', 'DRIVE THRU', toHex(scheme[0]), 0xffffff);
    // menu board + speaker post upstream of the window
    const [mx, , mz] = F.p(wx - dir * 8.5, 0, 0.0);
    if (!bldAt(mx + F.bx * 0.2, mz + F.bz * 0.2, 0)) {
      const [bx, , bz] = F.p(wx - dir * 8.5, 0, 0.15);
      push('menuBoard', bx, groundTop(bx, bz), bz, F.rotY(), 1, 1, 1, toHex(scheme[0]));
    }
    // clearance bar at the lane entry
    const ex = -dir * (L / 2 - 1);
    for (const z of [0.25, 4.35]) box(bld, F, ex, 1.5, z, 0.16, 3.0, 0.16, C.paintY, false, 'b');
    box(bld, F, ex, 2.95, 2.3, 0.18, 0.22, 4.3, C.paintY);
    for (let k = 0; k < 6; k++) box(bld, F, ex, 2.95, 0.6 + k * 0.7, 0.19, 0.23, 0.35, C.black);
    bld.bid = prev;
    return true;
  }

  // ------------------------------------------------------------ supermarket
  function supermarket(q, rnd, B) {
    const [px, pz, , , name, nameEn] = q;
    // entrance face: open space in front (a car park), then road access
    let bestE = null, bs = -Infinity;
    for (const E of edgesOf(B)) {
      if (E.len < 10) continue;
      let free = 0;
      for (let d = 2; d <= 70; d += 2) {
        const x = E.mx + E.nx * d, z = E.mz + E.nz * d;
        if (bldAt(x, z, 0) || inWater(x, z)) break;
        const r = roadNear(x, z, 3);
        if (r && r.d < 0.5) break;
        free = d;
      }
      const s = Math.min(free, 55) * 1.0 + Math.min(E.len, 40) * 0.4 - Math.max(0, E.road - 60) * 0.3 - Math.hypot(px - E.mx, pz - E.mz) * 0.05;
      if (s > bs) { bs = s; bestE = { E, free }; }
    }
    if (!bestE) return false;
    const { E, free } = bestE;
    dbg.push(`sm free=${free} len=${E.len.toFixed(1)} road=${E.road.toFixed(1)}`);
    const hostTop = Math.max(4.5, (B.e.topY || 0) - ground(E.mx, E.mz));
    const W = Math.max(6, Math.min(E.len - 3, 20));
    const fr = frontOn(B, E, (E.ax + E.bx) / 2, (E.az + E.bz) / 2, W);
    const { F } = fr;
    const scheme = brandSchemeFor('super', name, nameEn, rnd);
    zones.shops.push([ox + F.x0, F.y0, oz + F.z0, F.ax, F.az, fr.W / 2, 1, 'super']);
    bld.bid = glass.bid = B.idx + 1;
    // glazed vestibule + entrance canopy + parapet sign tower
    const GH = Math.min(4.0, hostTop - 1.0);
    const res = storefront(F, fr.W, {
      rnd, scheme: [[0.88, 0.88, 0.86], scheme[0], null], hostTop: hostTop + 3, glassH: GH, fasciaH: 0.6, depth: 2.2, tall: true,
      doorW: 2.6, doorX: -fr.W * 0.22, signText: false, frame: C.aluDk,
    });
    // second door pair
    const dx2 = fr.W * 0.22;
    box(bld, F, dx2, (GH - 0.55 + 0.32) / 2, res.D - 0.03, 0.06, GH - 0.9, 0.06, C.alu);
    flat(bld, F, dx2 - 1.3, dx2 + 1.3, res.D + 0.02, res.D + 1.25, 0.03, C.black);
    for (const s of [-1, 1]) box(bld, F, dx2 + s * 1.3, (GH - 0.55 + 0.32) / 2, res.D - 0.04, 0.09, GH - 0.87, 0.12, C.aluDk);
    // entrance canopy on two columns
    const cd = 4.5, cw = Math.min(fr.W + 2, 22), cy = GH + 0.7;
    box(bld, F, 0, cy + 0.3, res.D + cd / 2, cw, 0.6, cd, scheme[0], false, '');
    box(bld, F, 0, cy - 0.01, res.D + cd / 2, cw - 0.1, 0.02, cd - 0.1, C.soffit, false, 't');
    for (const s of [-1, 1]) box(bld, F, s * (cw / 2 - 0.5), cy / 2, res.D + cd - 0.5, 0.4, cy, 0.4, C.aluDk, false, 'b');
    for (let i = 0; i < 4; i++) box(bld, F, -cw / 2 + cw * (i + 0.5) / 4, cy - 0.04, res.D + cd / 2, 1.2, 0.02, 0.4, C.light, true);
    // big sign on a raised parapet panel above the entrance
    const sw = Math.min(fr.W + 1, Math.max(8, (nameEn || name || 'SUPERMARKET').length * 0.9 + 2));
    if (hostTop <= 10) {
      // big-box store: sign tower rising above the roofline
      const sTop = Math.max(hostTop + 1.6, GH + 3.5);
      box(bld, F, 0, (sTop + hostTop - 1.5) / 2, 0.2, sw + 0.6, sTop - hostTop + 1.5, 0.5, [0.86, 0.86, 0.84], false, 'b');
      box(bld, F, 0, sTop - 0.06, 0.2, sw + 0.7, 0.12, 0.6, scheme[0]);
      sign(F, 0, (sTop + hostTop - 1.5) / 2 + 0.05, 0.47, sw, Math.min(1.6, sTop - hostTop + 0.9), 5, name || '超市', nameEn || name || 'SUPERMARKET', 0xf2f2ee, toHex(scheme[0]));
    } else {
      // supermarket in the base of a taller building: lit panel on the facade above the entrance canopy
      const y0 = cy + 0.9, h = 1.5;
      box(bld, F, 0, y0 + h / 2, 0.35, sw + 0.5, h + 0.3, 0.7, [0.86, 0.86, 0.84], 'f', 'b'); // stands proud of ornate facades
      sign(F, 0, y0 + h / 2, 0.72, sw, h - 0.4, 5, name || '超市', nameEn || name || 'SUPERMARKET', 0xf2f2ee, toHex(scheme[0]));
    }
    pool(F.wx(0, res.D + cd / 2), F.wz(0, res.D + cd / 2), cw * 0.55, C.lightWarm, 0.5, 0.1, cd * 0.9, F.rotY());
    // cart corral beside the doors
    const ccx = fr.W / 2 + 2.6 <= E.len / 2 ? fr.W / 2 + 1.6 : -fr.W / 2 + 1.6;
    cartCorral(F, ccx, res.D + 1.7, 7, rnd);
    bld.bid = glass.bid = 0;
    // parking lot in front
    if (free >= 18 && hostTop <= 12) parkingLot(F, fr.W, res.D + cd + 3, Math.min(free - 2, 60), E, rnd, scheme);
    // loading dock on the back wall
    loadingDock(B, E, rnd);
    return true;
  }
  function cartCorral(F, x, z, n, rnd) {
    const L = n * 0.42 + 0.8;
    for (const s of [-1, 1]) {
      box(bld, F, x + s * 0.5, 0.85, z, 0.05, 0.05, L, C.galv);
      box(bld, F, x + s * 0.5, 0.45, z, 0.05, 0.05, L, C.galv);
      for (const e of [-1, 1]) box(bld, F, x + s * 0.5, 0.45, z + (e * L) / 2, 0.06, 0.9, 0.06, C.galv, false, 'b');
    }
    box(bld, F, x, 2.25, z, 1.6, 0.08, L + 0.3, [0.85, 0.85, 0.82]);
    for (const e of [-1, 1]) box(bld, F, x, 1.15, z + (e * (L + 0.1)) / 2, 0.08, 2.3, 0.08, C.galv, false, 'b');
    for (let i = 0; i < n; i++) {
      const [cx, , cz] = F.p(x, 0, z - L / 2 + 0.6 + i * 0.42);
      push('cart', cx, groundTop(cx, cz) + 0.03, cz, F.rotY(Math.PI), 1, 1, 1, 0xffffff);
    }
  }
  function parkingLot(F, facadeW, z0, zMax, E, rnd, scheme) {
    const Wl = Math.max(20, Math.min(Math.max(facadeW + 16, E.len), 72));
    let x0 = -Wl / 2, x1 = Wl / 2;
    // widen / shift until clear, else shrink
    const grow = () => {
      if (!rectClear(F, x0, x1, z0 - 2, z0 + 6, { roadPad: 0.8, step: 3 })) return z0;
      let zz = z0 + 6;
      for (let z = z0 + 9; z <= z0 + zMax; z += 3) {
        if (!rectClear(F, x0, x1, z - 3, z, { roadPad: 0.8, step: 3 })) break;
        zz = z;
      }
      return zz;
    };
    let zEnd = grow();
    if (zEnd - z0 < 14) {
      x0 = -facadeW / 2 - 4; x1 = facadeW / 2 + 4;
      zEnd = grow();
      if (zEnd - z0 < 14) { dbg.push(`lot fail z=${zEnd - z0}`); return; }
    }
    dbg.push(`lot ok ${(x1 - x0).toFixed(0)}x${(zEnd - z0).toFixed(0)}`);
    slab(bld, F, x0, x1, z0 - 3, zEnd, 0.08, C.asphalt, 6);
    // fire lane hatching along the store front
    gline(bld, F, x0 + 0.5, z0 - 0.4, x1 - 0.5, z0 - 0.4, 0.15, 0.1, C.paintY);
    // rows: bays face +-z, 2.7 x 5.4 m, aisles 7 m
    const BW = 2.7, BD = 5.4, AISLE = 7;
    const bays = [];
    let z = z0 + AISLE;
    const rows = [];
    while (z + BD <= zEnd - 0.5) {
      rows.push([z, 1]);
      if (z + 2 * BD <= zEnd - 0.5) { rows.push([z + BD, -1]); z += 2 * BD + AISLE; } else z += BD + AISLE;
    }
    const nB = Math.floor((x1 - x0 - 1) / BW);
    const bx0 = (x0 + x1) / 2 - (nB * BW) / 2;
    for (const [rz, face] of rows) {
      for (let i = 0; i <= nB; i++) gline(bld, F, bx0 + i * BW, rz + 0.1, bx0 + i * BW, rz + BD - 0.1, 0.12, 0.1, C.paintW);
      gline(bld, F, bx0, face > 0 ? rz : rz + BD, bx0 + nB * BW, face > 0 ? rz : rz + BD, 0.12, 0.1, C.paintW);
      for (let i = 0; i < nB; i++) bays.push([bx0 + (i + 0.5) * BW, rz + BD / 2, face]);
    }
    // accessible bays nearest the door
    const accBays = bays.filter((b) => b[1] < z0 + AISLE + BD).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0])).slice(0, 2);
    for (const b of accBays) {
      slabFill(F, b[0] - BW / 2 + 0.12, b[0] + BW / 2 - 0.12, b[1] - BD / 2 + 0.15, b[1] + BD / 2 - 0.15, 0.097, C.paintB);
      b.acc = true;
    }
    // aisle arrows
    for (let k = 0; k <= rows.length; k += 2) {
      const az = (k === 0 ? z0 : rows[k - 1][0] + BD) + AISLE / 2;
      if (az > zEnd - 2) break;
      for (let ax = x0 + 8; ax < x1 - 6; ax += 18) {
        const G = new Frame(F.wx(ax, az), F.y0, F.wz(ax, az), F.ax, F.az);
        arrow(G, 0, 0, 3, C.paintW, 0.1);
      }
    }
    // lamp posts on the row ends / medians, light pools
    for (let k = 0; k < rows.length; k++) {
      const [rz, face] = rows[k];
      if (face < 0) continue;
      const zz = rows[k + 1] && rows[k + 1][1] < 0 ? rz + BD : rz + BD + 0.6;
      for (let lx = bx0 + 3 * BW; lx < bx0 + nB * BW - 1; lx += 8 * BW) {
        const [wx, , wz] = F.p(lx, 0, zz);
        push('lotLamp', wx, groundTop(wx, wz), wz, F.rotY(), 1, 1, 1, 0xffffff);
        pool(wx, wz, 9, C.lightWarm, 0.2, 0.105);
      }
    }
    // cart returns in a couple of bays, parked cars in the rest (busier near the door)
    const free = bays.filter((b) => !b.acc);
    let returns = Math.min(2, Math.floor(free.length / 14));
    for (const b of free) {
      if (returns > 0 && rnd() < 0.08 && Math.abs(b[0]) > 6) {
        const [wx, , wz] = F.p(b[0], 0, b[1]);
        push('cartReturn', wx, groundTop(wx, wz) + 0.08, wz, F.rotY(), 1, 1, 1, toHex(scheme[0]));
        returns--;
        continue;
      }
      const dz = (b[1] - z0) / Math.max(10, zEnd - z0);
      const occ = 0.78 - dz * 0.45 - Math.abs(b[0]) / Math.max(30, Wl) * 0.3;
      if (rnd() > occ) {
        if (rnd() < 0.05) { const [wx, , wz] = F.p(b[0] + 0.6, 0, b[1] + 1.2); push('cart', wx, groundTop(wx, wz) + 0.08, wz, F.rotY(rnd() * 6.28), 1, 1, 1, 0xffffff); }
        continue;
      }
      const [wx, , wz] = F.p(b[0] + (rnd() - 0.5) * 0.25, 0, b[1] + (rnd() - 0.5) * 0.4);
      const t = rnd();
      const type = t < 0.5 ? 0 : t < 0.72 ? 2 : t < 0.94 ? 5 : 6;
      push('car', wx, groundTop(wx, wz) + 0.07, wz, F.rotY(b[2] > 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.08, type, 1, 1, CAR_PAINT[(rnd() * CAR_PAINT.length) | 0]);
    }
  }
  function slabFill(F, x0, x1, z0, z1, yOff, rgb) {
    const P = (x, z) => { const wx = F.wx(x, z), wz = F.wz(x, z); return [wx, ground(wx, wz) + yOff, wz]; };
    bld.quad(P(x0, z1), P(x1, z1), P(x1, z0), P(x0, z0), rgb);
  }
  function loadingDock(B, Efront, rnd) {
    let back = null, bd = 0.2;
    for (const E of edgesOf(B)) {
      if (E.len < 9) continue;
      const d = -(E.nx * Efront.nx + E.nz * Efront.nz);
      if (d > bd) { bd = d; back = E; }
    }
    if (!back) return;
    const fr = frontOn(B, back, (back.ax + back.bx) / 2, (back.az + back.bz) / 2, Math.min(back.len - 2, 16));
    const { F, W } = fr;
    const nD = Math.max(1, Math.min(3, Math.floor(W / 4.6)));
    const prev = bld.bid;
    bld.bid = B.idx + 1;
    const apron = rectClear(F, -W / 2, W / 2, 0.5, 14, { roadPad: 0.4, skip: B });
    if (apron) {
      slab(bld, F, -W / 2 - 1, W / 2 + 1, 0.1, 14, 0.075, C.concrete, 5);
    }
    for (let i = 0; i < nD; i++) {
      const x = -((nD - 1) * 4.6) / 2 + i * 4.6;
      // seal frame, roller shutter with ribs, bumpers, dock light, bollards
      box(bld, F, x, 2.6, 0.12, 3.6, 3.6, 0.24, C.dockSeal, false, 'b');
      face(bld, F, x - 1.5, x + 1.5, 1.2, 4.0, 0.25, C.shutter);
      for (let y = 1.35; y < 4.0; y += 0.22) box(bld, F, x, y, 0.27, 3.0, 0.03, 0.03, [0.42, 0.43, 0.44]);
      box(bld, F, x, 0.6, 0.35, 2.6, 1.2, 0.5, C.concreteDk, false, 'b');
      for (const s of [-1, 1]) box(bld, F, x + s * 1.0, 1.05, 0.65, 0.3, 0.35, 0.15, C.rubber);
      box(bld, F, x + 1.95, 4.3, 0.4, 0.08, 0.08, 0.6, C.steel);
      box(bld, F, x + 1.95, 4.25, 0.72, 0.22, 0.14, 0.16, [1.0, 0.85, 0.5], true);
      for (const s of [-1, 1]) cyl(bld, F, x + s * 1.9, 0, 1.4, 0.12, 1.1, 8, C.paintY);
      if (apron && i === 0 && rnd() < 0.65) {
        const [tx, , tz] = F.p(x, 0, 0.8 + 6.8);
        push('trailer', tx, groundTop(tx, tz) + 0.05, tz, F.rotY(Math.PI), 1, 1, 1, rnd() < 0.5 ? 0xe8e8e4 : 0xb0b4b8);
      }
    }
    sign(F, 0, 4.9, 0.3, Math.min(W - 1, 6), 0.5, 3, '收货区', 'RECEIVING', 0x2b2f36, 0xf0c040);
    bld.bid = prev;
  }

  // ------------------------------------------------------------ multi-storey car park
  function garage(G0) {
    const F = Frame.fromAxis(G0.cx, ground(G0.cx, G0.cz), G0.cz, G0.ux, G0.uz);
    const hl = G0.hl, hw = G0.hw;
    if (
      inWater(G0.cx, G0.cz) ||
      inWater(F.wx(-hl, -hw), F.wz(-hl, -hw)) ||
      inWater(F.wx(hl, -hw), F.wz(hl, -hw)) ||
      inWater(F.wx(-hl, hw), F.wz(-hl, hw)) ||
      inWater(F.wx(hl, hw), F.wz(hl, hw)) ||
      inWater(F.wx(0, -hw), F.wz(0, -hw)) ||
      inWater(F.wx(0, hw), F.wz(0, hw)) ||
      inWater(F.wx(-hl, 0), F.wz(-hl, 0)) ||
      inWater(F.wx(hl, 0), F.wz(hl, 0))
    ) return false;
    const R = rng32(G0.seed);
    const levels = Math.max(2, Math.min(9, Math.round(G0.h / 3.0)));
    const LH = Math.max(2.9, Math.min(3.4, G0.h / levels));
    const conc = [0.62, 0.61, 0.58], concDk = [0.45, 0.45, 0.43];
    const ramp = 6.5; // ramp lane along -z side
    // ground slab
    slab(bld, F, -hl, hl, -hw, hw, 0.07, [0.3, 0.3, 0.3], 8);
    const colsX = Math.max(2, Math.round((2 * hl) / 8)), colsZ = Math.max(2, Math.round((2 * hw) / 8));
    for (let L = 1; L <= levels; L++) {
      const y = L * LH;
      // deck slab with a hole where the ramp comes up
      box(bld, F, ramp / 2, y - 0.15, 0, 2 * hl - ramp, 0.3, 2 * hw, conc, false, '');
      box(bld, F, -hl + ramp / 2, y - 0.15, ramp / 2, ramp, 0.3, 2 * hw - ramp, conc, false, '');
      // parapet + cable rails (open sides)
      for (const s of [-1, 1]) {
        box(bld, F, 0, y + 0.45, s * (hw - 0.1), 2 * hl, 0.9, 0.2, concDk, false, 'b');
        box(bld, F, s * (hl - 0.1), y + 0.45, 0, 0.2, 0.9, 2 * hw, concDk, false, 'b');
        box(bld, F, 0, y + 0.95, s * (hw - 0.1), 2 * hl, 0.06, 0.06, C.galv);
      }
      // bays: painted lines, parked cars on the decks
      const bayW = 2.6;
      for (const side of [-1, 1]) {
        const zc = side * (hw - 2.9);
        for (let x = -hl + ramp + 1; x < hl - 1.5; x += bayW) {
          gdeck(F, x, y + 0.005, zc - 2.5, zc + 2.5);
          if (R() < 0.55 && x + bayW < hl - 1.5) {
            const [wx, , wz] = F.p(x + bayW / 2, 0, zc);
            push('car', wx, F.y0 + y + 0.0, wz, F.rotY(side > 0 ? 0 : Math.PI), R() < 0.6 ? 0 : 2, 1, 1, CAR_PAINT[(R() * CAR_PAINT.length) | 0]);
          }
        }
      }
      if (L === levels) {
        for (let x = -hl + 6; x < hl - 3; x += 14) for (const z of [-hw + 1, hw - 1]) {
          const [wx, , wz] = F.p(x, 0, z);
          push('lotLamp', wx, F.y0 + y, wz, F.rotY(), 0.7, 0.7, 0.7, 0xffffff);
        }
      }
      // ramp from the level below (sloped slab along -z side)
      const yA = (L - 1) * LH, yB = y;
      const z0 = -hw, z1 = -hw + ramp;
      const x0 = -hl + ramp, x1 = hl - 2;
      bld.quad(F.p(x0, yA + 0.06, z1), F.p(x1, yB, z1), F.p(x1, yB, z0), F.p(x0, yA + 0.06, z0), [0.4, 0.4, 0.4]);
      // deck light fittings
      for (let i = 0; i < colsX; i++) {
        const x = -hl + ((2 * hl) * (i + 0.5)) / colsX;
        box(bld, F, x, y - 0.33, 0, 1.2, 0.05, 0.12, C.light, true);
      }
    }
    // columns
    for (let i = 0; i <= colsX; i++) for (let j = 0; j <= colsZ; j++) {
      const x = -hl + 0.3 + ((2 * hl - 0.6) * i) / colsX, z = -hw + 0.3 + ((2 * hw - 0.6) * j) / colsZ;
      box(bld, F, x, (levels * LH) / 2, z, 0.5, levels * LH, 0.5, conc, false, 'b');
    }
    // stair / lift core with glazing at one corner, P sign
    const sx = hl - 2.4, sz = hw - 2.4;
    box(bld, F, sx, (levels * LH + 2.2) / 2, sz, 4.4, levels * LH + 2.2, 4.4, [0.55, 0.56, 0.58], false, 'b');
    face(glass, F, sx - 1.8, sx + 1.8, 0.3, levels * LH + 1.8, sz + 2.21, [0.6, 0.72, 0.78]);
    for (const s of [1, -1]) {
      const E = new Frame(F.x0, F.y0, F.z0, F.bx * s, F.bz * s);
      sign(E, s > 0 ? sx : -sx, levels * LH + 1.1, hw + 0.02, 1.6, 1.6, 6, 'P', 'P', 0x1f4fbf, 0xffffff);
      sign(E, 0, LH * 0.62, hw + 0.03, Math.min(2 * hl - 6, 9), 0.7, 3, '停车场', 'PARKING', 0x1f4fbf, 0xffffff);
    }
    // entry barrier at ground level
    const [ex, , ez] = F.p(-hl + 3, 0, -hw - 0.5);
    push('payKiosk', ex, groundTop(ex, ez), ez, F.rotY(), 1, 1, 1, 0x1f4fbf);
    addCollider(F, -hl, hl, -hw, hw, levels * LH, `poi-garage-${G0.seed}`);
    zones.garages.push([ox + F.x0, F.y0, oz + F.z0, F.ax, F.az, hl, hw]);
    return true;
  }
  function gdeck(F, x, y, z0, z1) {
    bld.quad(F.p(x - 0.06, y + 0.012, z1), F.p(x + 0.06, y + 0.012, z1), F.p(x + 0.06, y + 0.012, z0), F.p(x - 0.06, y + 0.012, z0), C.paintW);
  }

  // ------------------------------------------------------------ dispatch over the chunk's POIs
  const done = [];
  const near = (x, z, r, k) => done.some((d) => d[2] === k && Math.hypot(d[0] - x, d[1] - z) < r);
  const order = (q) => {
    const [, , cls, sub] = q;
    if (cls === 'fuel' && sub !== 'charging_station') return 0;
    if (sub === 'supermarket') return 1;
    return 2;
  };
  const list = pois.slice().sort((a, b) => order(a) - order(b));
  const nameCount = new Map(); // a name seen twice in one chunk is a chain
  for (const q of pois) { const k = String(q[5] || q[4] || '').toLowerCase().trim(); if (k) nameCount.set(k, (nameCount.get(k) || 0) + 1); }
  const repeated = (q) => (nameCount.get(String(q[5] || q[4] || '').toLowerCase().trim()) || 0) > 1;
  const safeQ = (q, kind, rnd) => { const c = q.slice(); [c[4], c[5]] = signNames(kind, q[4], q[5], repeated(q), rnd); return c; };
  let nStores = 0, nBatch3 = 0;
  if (sites.venues && sites.venues.length) {
    for (const sv of sites.venues) {
      if (!list.some((q) => Math.hypot(q[0] - sv.px, q[1] - sv.pz) < 4)) {
        list.push([sv.px, sv.pz, sv.cls || sv.kind, sv.sub || sv.kind, sv.name || '', sv.nameEn || '', sv.rank || 50]);
      }
    }
  }
  const washPois = list.filter((q) => q[2] === 'car_wash' || q[3] === 'car_wash' || /car ?wash|洗車|洗车|lavage|waschanlage|auto ?wash/i.test(`${q[4] || ''} ${q[5] || ''}`));
  for (const q of list) {
    const [px, pz, cls, sub, name, nameEn] = q;
    if (Math.abs(px) > HALF || Math.abs(pz) > HALF || inWater(px, pz)) continue;
    const rnd = rng32(hashAbs(px, pz, 5));
    const isFuel = cls === 'fuel' && sub !== 'charging_station';
    const isWash = !isFuel && (cls === 'car_wash' || sub === 'car_wash' || /car ?wash|洗車|洗车|lavage|waschanlage|auto ?wash/i.test(`${name} ${nameEn}`));
    if (isFuel) {
      if (near(px, pz, 36, 'fuel')) { q.venue = 1; continue; }
      const nearWash = washPois.some((w) => w !== q && Math.hypot(w[0] - px, w[1] - pz) < 55);
      if (gasStation(safeQ(q, 'fuel', rng32(hashAbs(px, pz, 6))), rnd, nearWash)) {
        q.venue = 1;
        done.push([px, pz, 'fuel']);
      }
      continue;
    }
    if (isWash) {
      if (near(px, pz, 55, 'fuel') || near(px, pz, 35, 'wash')) { q.venue = 1; continue; }
      if (standaloneCarWash(safeQ(q, 'wash', rng32(hashAbs(px, pz, 6))), rnd)) {
        q.venue = 1;
        done.push([px, pz, 'wash']);
      }
      continue;
    }
    const conv = (cls === 'shop' && (sub === 'convenience' || sub === 'kiosk')) || (cls === 'grocery' && sub === 'convenience');
    const supm = sub === 'supermarket';
    const fast = cls === 'fast_food';
    const pharm = cls === 'pharmacy' || sub === 'chemist';
    const bank = cls === 'bank';
    const hosp = cls === 'hospital' && sub === 'hospital';
    const batch3Kind = !conv && !supm && !fast && !pharm && !bank && !hosp ? classifyPoiVenueKind(cls, sub) : null;
    if (!conv && !supm && !fast && !pharm && !bank && !hosp && !batch3Kind) continue;
    if (hosp && near(px, pz, 150, 'hosp')) continue;
    if (batch3Kind && (nBatch3 >= 18 || near(px, pz, batch3Kind === 'hotel' || batch3Kind === 'cinema_theatre' ? 32 : 16, batch3Kind))) continue;
    if (nStores >= 76) continue;
    const B = hostOf(px, pz, supm || hosp || batch3Kind === 'hotel' || batch3Kind === 'cinema_theatre' || batch3Kind === 'marketplace_retail' ? 24 : 15);
    if (!B) continue;
    if (B.used) continue;
    if (supm && B.area >= 500) { // big box with a car park; small urban supermarkets just get a shop front
      if (supermarket(safeQ(q, 'super', rng32(hashAbs(px, pz, 6))), rnd, B)) { B.used = true; q.venue = 1; nStores++; }
      continue;
    }
    // pick the street face nearest the POI
    let bestE = null, bs = Infinity;
    for (const E of edgesOf(B)) {
      if (E.len < 3.4) continue;
      const tq = Math.max(0, Math.min(1, ((px - E.ax) * (E.bx - E.ax) + (pz - E.az) * (E.bz - E.az)) / (E.len * E.len)));
      const dq = Math.hypot(px - E.ax - (E.bx - E.ax) * tq, pz - E.az - (E.bz - E.az) * tq);
      const s = Math.min(E.road, 40) + dq * 0.6 - Math.min(E.len, 12) * 0.15;
      if (s < bs) { bs = s; bestE = E; }
    }
    if (!bestE || bestE.road > 52) continue;
    // one storefront per facade stretch
    const wantW = supm ? 12 : batch3Kind === 'hotel' || batch3Kind === 'marketplace_retail' ? 11 : batch3Kind === 'cinema_theatre' || batch3Kind === 'auto_service' ? 10 : fast || hosp ? 9.5 : batch3Kind === 'cafe_bistro' || conv ? 8.5 : 7.5;
    const fr = frontOn(B, bestE, px, pz, wantW);
    const [fx, , fz] = fr.F.p(0, 0, 0);
    if (taken(fx, fz, fr.W / 2)) continue;
    claim(fx, fz, fr.W / 2 + 0.3);
    const kind = batch3Kind || (conv || supm ? 'conv' : fast ? 'fast' : pharm ? 'pharmacy' : hosp ? 'hospital' : 'bank');
    const scheme = brandSchemeFor(kind, name, nameEn, rnd);
    if (hosp) done.push([px, pz, 'hosp']);
    if (batch3Kind) { done.push([px, pz, batch3Kind]); nBatch3++; }
    const sch = pharm ? [[0.94, 0.95, 0.94], [0.03, 0.5, 0.2], [0.03, 0.5, 0.2]] : fast ? [[0.75, 0.06, 0.04], [0.98, 0.8, 0.1], [0.98, 0.8, 0.1]] : scheme;
    const [sZh, sEn] = signNames(supm ? 'super' : hosp ? 'pharmacy' : kind, name, nameEn, repeated(q), rng32(hashAbs(px, pz, 6)));
    A_store(fr, kind, rnd, {
      name: sZh, nameEn: sEn, scheme: sch,
      awning: conv && rnd() < 0.5 ? [sch[1], sch[0]] : null,
      kinds: conv ? (rnd() < 0.6 ? ['atm', 'freezer', 'news'] : ['freezer', 'news', 'bin']) : null,
    });
    if (fast) {
      // drive-thru on a side wall adjacent to the front when there is room around the building
      const sides = edgesOf(B).filter((E) => Math.abs(E.nx * bestE.nx + E.nz * bestE.nz) < 0.35 && E.len >= 9);
      for (const E2 of sides) if (driveThru(B, E2, rnd, sch)) break;
    }
    q.venue = 1;
    nStores++;
  }
  for (const G0 of sites.garages) {
    if (Math.abs(G0.cx) > HALF || Math.abs(G0.cz) > HALF) continue;
    garage(G0);
  }

  // ------------------------------------------------------------ meshes + payload
  if (groups && groups.buildings) {
    const mb = bld.toMesh(mats.wfcBldgMat);
    if (mb) {
      if (mats.wfcBldgDepthMat) mb.customDepthMaterial = mats.wfcBldgDepthMat;
      mb.name = 'poi_venues';
      groups.buildings.add(mb);
    }
    const mg = glass.toMesh(mats.poiGlassMat || mats.wfcBldgMat, { shadow: false });
    if (mg) { mg.name = 'poi_glass'; groups.buildings.add(mg); }
    const ml = glow.toMesh(mats.poiGlowMat || mats.markingMat, { kbid: false, shadow: false, colorsU8: false });
    if (ml) { ml.receiveShadow = false; ml.name = 'poi_glow'; groups.buildings.add(ml); }
  }
  const out = { inst: {}, signs, zones, dbg };
  let any = signs.length > 0 || zones.fuel.length > 0;
  for (const [k, a] of Object.entries(inst)) { out.inst[k] = new Float32Array(a); any = true; }
  return any || bld.count > 0 ? out : null;
}

/**
 * Main-thread materials for the venue meshes, merged into chunk_builder's `mats`:
 *   poiGlassMat: shop glazing (collapses with its building like wfcBldgMat),
 *   poiGlowMat: additive light pools on the ground, faded in with the building night glow.
 */
export function createPoiVenueMats(nightUniforms) {
  const poiGlassMat = new THREE.MeshStandardMaterial({
    color: 0xa9c4cf, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  });
  poiGlassMat.name = 'poiGlassMat';
  poiGlassMat.onBeforeCompile = (shader) => kaijuPatchBuildingShader(shader);
  poiGlassMat.customProgramCacheKey = () => 'poi-glass-v1';
  const poiGlowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8,
  });
  poiGlowMat.name = 'poiGlowMat';
  const uNight = nightUniforms && nightUniforms.uNightEmissive ? nightUniforms.uNightEmissive : { value: 0 };
  poiGlowMat.onBeforeCompile = (shader) => {
    shader.uniforms.uPoiNight = uNight;
    shader.fragmentShader = 'uniform float uPoiNight;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= clamp((uPoiNight - 0.1) / 1.6, 0.0, 1.0);');
  };
  poiGlowMat.customProgramCacheKey = () => 'poi-glow-v1';
  return { poiGlassMat, poiGlowMat };
}

/** Adds the payload's typed arrays to the worker transfer list. */
export function poiVenuesTransfer(pv, transferSet) {
  if (!pv || !pv.inst) return pv;
  for (const a of Object.values(pv.inst)) if (a && a.buffer) transferSet.add(a.buffer);
  return pv;
}

export { buildPoiVenues as buildChunkPoiVenues };
