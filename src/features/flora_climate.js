/**
 * [feature/climate-flora] Climate-aware flora: Koeppen climate + region -> species palette, density, ground tint
 * and season. Shared by the chunk worker (vegetation_worker.js) and the main thread (vegetation.js). No DOM.
 *
 *   floraContext(lat, lon, baseAslM, date) -> ctx  (cached per 0.1 deg)
 *   pickFlora(ctx, role, r)                 -> palette entry
 *   floraLook(ctx, entry, h, h2, elevAsl)   -> { sp, r, g, b, sx, sy } (season + altitude applied), or null = skip
 *   groundLook(ctx)                         -> { tint:[r,g,b], amt }  (biome / dry-season / dormant grass tint)
 */
import { KG_CLASSES, KG_W, KG_H, KG_RLE } from './koppen_grid.js';

// Species ids (instanced mesh per species per LOD in VegetationSystem). 0-4 are the original meshes.
export const SP_BROADLEAF = 0;
export const SP_TALL = 1;
export const SP_CONIFER = 2;
export const SP_PALM = 3; // coconut / fan palm (curved trunk)
export const SP_BUSH = 4;
export const SP_COLUMN = 5; // Italian cypress / Lombardy poplar
export const SP_UMBRELLA = 6; // stone pine / Monterey cypress / acacia / palo verde
export const SP_EUCALYPT = 7;
export const SP_CACTUS = 8; // saguaro
export const SP_BANANA = 9;
export const SP_DATEPALM = 10;
export const SP_BIRCH = 11;
export const SP_BAMBOO = 12;
export const SP_BARE = 13; // leafless deciduous (winter)
export const SPECIES_COUNT = 14;
/** Species id for "untagged real tree — use the local palette" (e.g. street_detail OSM trees without genus). */
export const SP_AUTO = 255;
export const SPECIES_NAMES = ['broadleaf', 'tall', 'conifer', 'palm', 'bush', 'column', 'umbrella', 'eucalypt', 'cactus', 'banana', 'datepalm', 'birch', 'bamboo', 'bare'];

// ------------------------------------------------------------------------------------------------ Koeppen grid
let kgGrid = null;
function grid() {
  if (kgGrid) return kgGrid;
  const bin = atob(KG_RLE);
  kgGrid = new Uint8Array(KG_W * KG_H);
  let k = 0;
  for (let i = 0; i + 1 < bin.length; i += 2) {
    const v = bin.charCodeAt(i), n = bin.charCodeAt(i + 1);
    kgGrid.fill(v, k, k + n);
    k += n;
  }
  return kgGrid;
}
function cellAt(r, c) {
  r = Math.max(0, Math.min(KG_H - 1, r));
  c = ((c % KG_W) + KG_W) % KG_W;
  return grid()[r * KG_W + c];
}
/** Koeppen class name ('' = open ocean) and near-shore flag at (lat, lon). */
export function koppenAt(lat, lon) {
  const r = Math.round((89.75 - lat) / 0.5), c = Math.round((lon + 179.75) / 0.5);
  const v = cellAt(r, c);
  let coastal = (v & 0x20) !== 0;
  for (let dr = -1; dr <= 1 && !coastal; dr++) for (let dc = -1; dc <= 1; dc++) if (cellAt(r + dr, c + dc) & 0x20) { coastal = true; break; }
  return { cls: KG_CLASSES[v & 0x1f] || '', coastal };
}

// ------------------------------------------------------------------------------------------------ zones & regions
function zoneOf(cls, lat) {
  const a = Math.abs(lat);
  if (!cls) return a < 23 ? 'trop' : a < 35 ? 'hsub' : a < 52 ? 'ocean' : a < 64 ? 'boreal' : 'tundra';
  if (cls === 'Af' || cls === 'Am') return 'trop';
  if (cls === 'Aw' || cls === 'As') return 'sav';
  if (cls === 'BWh') return 'hdes';
  if (cls === 'BWk') return 'cdes';
  if (cls === 'BSh') return 'hstep';
  if (cls === 'BSk') return 'cstep';
  if (cls[0] === 'C' && cls[1] === 's') return 'med';
  if (cls === 'Cfa' || cls === 'Cwa') return 'hsub';
  if (cls[0] === 'C') return 'ocean';
  if (cls[0] === 'D') return cls[2] === 'a' || cls[2] === 'b' ? 'cont' : 'boreal';
  if (cls === 'ET') return a < 60 ? 'boreal' : 'tundra'; // mid-latitude ET cells are high mountains: valleys get montane forest
  return 'ice';
}

function regionOf(lat, lon) {
  if (lon >= -125 && lon <= -114 && lat >= 32 && lat <= 42.5) return lon > -117.2 && lat < 35 ? 'USSW' : 'CA';
  if (lon > -118.5 && lon <= -103 && lat >= 26 && lat < 37.5) return 'USSW';
  if (lon >= -170 && lon <= -50 && lat >= 15) return 'NAM';
  if (lon >= -120 && lon <= -30 && lat < 15) return 'LATAM';
  if (lon >= 165 && lat <= -33) return 'NZ';
  if (lon >= 110 && lon <= 165 && lat <= -10) return 'AUS';
  if (lon >= 100 && lon <= 146 && lat >= 18) return 'EASIA';
  if (lon >= 92 && lon <= 165 && lat < 18 && lat > -11) return 'SEASIA';
  if (lon >= -18 && lon <= 63 && lat >= 12 && ((lat < 37.2 && lon > 34) || lat < 35.5)) return 'MENA';
  if (lon >= 60 && lon < 92 && lat < 37) return 'SASIA';
  if (lon >= -25 && lon <= 60 && lat >= 35) return 'EUR';
  if (lon > 60 && lat >= 37) return 'RUS';
  if (lon >= -18 && lon <= 52 && lat < 12) return 'AFR';
  return 'OTHER';
}

// ------------------------------------------------------------------------------------------------ palettes
// Tints multiply the canopy color (trunks are masked in the shader). Autumn / blossom tints replace it.
const ONE = [1, 1, 1];
const DARK = [0.78, 0.94, 0.76]; // glossy evergreen broadleaf (oak, camphor, fig)
const OLIVE = [1.18, 1.1, 1.12]; // silvery olive
const LIGHT = [1.1, 1.16, 0.84]; // poplar / fresh
const WILLOW = [1.18, 1.22, 0.72];
const ACACIA = [1.22, 1.08, 0.68];
const CYPRESS = [0.78, 0.92, 0.8];
export const AUTUMN = { red: [2.5, 0.72, 0.32], orange: [2.3, 1.15, 0.32], yellow: [2.45, 1.7, 0.3], brown: [1.75, 1.05, 0.45], gold: [2.2, 1.55, 0.35] };
const FRESH = [1.15, 1.28, 0.78];
// Blossom tints with north-equivalent day-of-year windows (southern hemisphere shifted by half a year)
const CHERRY = { c: [3.1, 1.35, 3.3], d0: 80, d1: 102, lat: 3 };
const CRABAPPLE = { c: [3.0, 1.9, 3.9], d0: 95, d1: 115, lat: 2 };
const JACARANDA = { c: [2.2, 1.0, 4.2], d0: 106, d1: 160, lat: 0 };

function P(sp, w, o = {}) {
  return { sp, w, t: o.t || ONE, d: !!o.d, au: o.au ? AUTUMN[o.au] : null, bl: o.bl || null, lx: !!o.lx, s: o.s || 1, sy: o.sy || 1, u: o.u ?? 1, n: o.n ?? 1 };
}

function palette(zone, region, lat, coastal, lon = 0) {
  const a = Math.abs(lat);
  const d = true;
  switch (zone) {
    case 'trop':
      return [
        P(SP_PALM, 0.28, { s: 1.05, sy: 1.15, n: 0.6 }), P(SP_BROADLEAF, 0.34, { t: DARK, s: 1.3, sy: 1.15, n: 1.4 }),
        P(SP_TALL, 0.12, { t: DARK, s: 1.2, sy: 1.3 }), P(SP_BANANA, 0.1, { u: 0.4, n: 1.2 }),
        P(SP_BAMBOO, region === 'SEASIA' || region === 'EASIA' ? 0.05 : 0.02, { u: 0.3 }), P(SP_UMBRELLA, 0.07, { t: [1.0, 1.12, 0.8], s: 1.2 }),
      ];
    case 'sav':
      if (region === 'AFR' || region === 'AUS' || region === 'SASIA' || region === 'MENA') {
        return [
          P(SP_UMBRELLA, 0.32, { t: ACACIA }), P(SP_BROADLEAF, 0.25, { t: [1.05, 1.0, 0.8] }), P(SP_PALM, 0.12, { n: 0.2 }),
          P(SP_TALL, 0.08), P(SP_EUCALYPT, region === 'AUS' ? 0.35 : 0.02),
        ];
      }
      return [
        P(SP_PALM, 0.3, { sy: 1.2, n: 0.4 }), P(SP_BROADLEAF, 0.35, { t: DARK, s: 1.2 }), P(SP_UMBRELLA, 0.1, { t: [1.0, 1.1, 0.8], s: 1.2 }),
        P(SP_BANANA, 0.06, { u: 0.3 }), P(SP_TALL, 0.1, { t: DARK }), P(SP_DATEPALM, 0.04, { n: 0 }),
      ];
    case 'hdes':
      if (region === 'USSW') {
        const sonoran = lat > 30 && lat < 34.7 && lon > -115.5 && lon < -109.5;
        return [
          P(SP_CACTUS, sonoran ? 0.3 : 0, { u: 0.15, n: 1.6 }), P(SP_PALM, 0.22, { sy: 1.6, s: 0.9, n: 0.05 }), P(SP_DATEPALM, 0.14, { n: 0.05 }),
          P(SP_UMBRELLA, 0.24, { t: [1.28, 1.2, 0.62], s: 0.65, sy: 0.7 }), P(SP_BROADLEAF, 0.1, { t: OLIVE, s: 0.7, n: 0.3 }),
        ];
      }
      if (region === 'MENA' || region === 'SASIA') {
        return [
          P(SP_DATEPALM, 0.52, { n: 0.6 }), P(SP_UMBRELLA, 0.22, { t: ACACIA, s: 0.75, sy: 0.8 }), P(SP_PALM, 0.1, { n: 0.1 }),
          P(SP_BROADLEAF, 0.1, { t: [1.05, 1.05, 0.8], s: 0.8, n: 0.2 }),
        ];
      }
      if (region === 'AUS') return [P(SP_EUCALYPT, 0.45, { s: 0.7, sy: 0.75 }), P(SP_UMBRELLA, 0.3, { t: ACACIA, s: 0.7 })];
      return [P(SP_DATEPALM, 0.3, { n: 0.3 }), P(SP_UMBRELLA, 0.4, { t: ACACIA, s: 0.7 }), P(SP_BROADLEAF, 0.1, { t: OLIVE, s: 0.7 })];
    case 'cdes':
      return [
        P(SP_CONIFER, 0.3, { s: 0.55, sy: 0.6, t: [1.1, 1.05, 0.9], n: 1.5 }), P(SP_BROADLEAF, 0.25, { d, au: 'yellow', s: 0.85, n: 0.3 }),
        P(SP_COLUMN, 0.15, { d, au: 'yellow', t: LIGHT, n: 0.2 }), P(SP_UMBRELLA, 0.1, { t: ACACIA, s: 0.6 }),
      ];
    case 'hstep':
      if (region === 'CA') return palette('med', 'CA', Math.min(lat, 34.9), coastal);
      if (region === 'USSW') return palette('hdes', 'USSW', lat, coastal, lon);
      if (region === 'MENA') return [...palette('hdes', 'MENA', lat, coastal), P(SP_BROADLEAF, 0.15, { t: OLIVE, s: 0.75, sy: 0.75 }), P(SP_COLUMN, 0.05, { t: CYPRESS })];
      if (region === 'AUS') return [P(SP_EUCALYPT, 0.45, { n: 1.4 }), P(SP_UMBRELLA, 0.2, { t: ACACIA }), P(SP_PALM, 0.06, { n: 0 })];
      if (region === 'SASIA') return [P(SP_BROADLEAF, 0.35, { t: DARK, s: 1.15 }), P(SP_UMBRELLA, 0.25, { t: ACACIA }), P(SP_PALM, 0.15, { n: 0.3 }), P(SP_TALL, 0.1, { t: DARK })];
      return [P(SP_UMBRELLA, 0.3, { t: ACACIA }), P(SP_BROADLEAF, 0.3, { t: [1.05, 1.0, 0.82] }), P(SP_PALM, 0.1, { n: 0.2 }), P(SP_TALL, 0.1)];
    case 'cstep':
      if (region === 'NAM' || region === 'USSW') {
        return [
          P(SP_BROADLEAF, 0.3, { d, au: 'yellow', n: 0.3 }), P(SP_TALL, 0.2, { d, au: 'yellow', n: 0.2 }),
          P(SP_CONIFER, 0.3, { n: 2, t: [1.0, 1.02, 0.9] }), P(SP_COLUMN, 0.05, { d, au: 'yellow', t: LIGHT }),
        ];
      }
      if (region === 'EUR') return palette('med', 'EUR', lat, false);
      if (region === 'MENA') return [...palette('med', 'EUR', lat, false), P(SP_COLUMN, 0.15, { d, au: 'yellow', t: LIGHT })];
      return [
        P(SP_BROADLEAF, 0.3, { d, au: 'yellow' }), P(SP_COLUMN, 0.25, { d, au: 'yellow', t: LIGHT }),
        P(SP_CONIFER, 0.2, { n: 1.5 }), P(SP_TALL, 0.15, { d, au: 'yellow', t: WILLOW }),
      ];
    case 'med':
      if ((region === 'NAM' || region === 'CA') && lat > 41.5) return palette('ocean', 'NAM', lat, coastal); // PNW
      if (region === 'CA' && lat >= 35.5) {
        // San Francisco / Bay Area: Monterey cypress & pine, eucalyptus, coast live oak, plane trees; very few palms
        return [
          P(SP_UMBRELLA, 0.2, { t: CYPRESS, s: 1.15, sy: 1.1 }), P(SP_CONIFER, 0.12, { s: 1.15, sy: 1.2, t: [0.9, 1.0, 0.85] }),
          P(SP_EUCALYPT, 0.2, { n: 1.4 }), P(SP_BROADLEAF, 0.2, { t: DARK, s: 1.05, n: 1.5 }), P(SP_TALL, 0.16, { d, au: 'brown', n: 0.2 }),
          P(SP_BROADLEAF, 0.05, { d, au: 'red', s: 0.8, n: 0.1 }), P(SP_PALM, 0.035, { n: 0, sy: 1.3 }), P(SP_DATEPALM, 0.015, { n: 0 }),
          P(SP_COLUMN, 0.03, { t: CYPRESS }),
        ];
      }
      if (region === 'CA') {
        // Los Angeles / SoCal: tall fan palms, eucalyptus, oaks/ficus, jacaranda, stone pine, sycamore
        return [
          P(SP_PALM, 0.26, { sy: 1.75, s: 0.9, n: 0.05 }), P(SP_DATEPALM, 0.06, { n: 0.05 }), P(SP_EUCALYPT, 0.13, { n: 1.2 }),
          P(SP_BROADLEAF, 0.2, { t: DARK, n: 1.8 }), P(SP_BROADLEAF, 0.08, { bl: JACARANDA, n: 0.1 }), P(SP_UMBRELLA, 0.08, { t: [0.85, 0.95, 0.8] }),
          P(SP_COLUMN, 0.05, { t: CYPRESS }), P(SP_TALL, 0.08, { d, au: 'brown', n: 0.4 }),
        ];
      }
      if (region === 'AUS') {
        return [P(SP_EUCALYPT, 0.45, { n: 1.5 }), P(SP_PALM, 0.08, { n: 0 }), P(SP_BROADLEAF, 0.2, { bl: JACARANDA, n: 0.2 }), P(SP_TALL, 0.1, { d, au: 'brown', n: 0 }), P(SP_CONIFER, 0.07)];
      }
      if (region === 'EUR' || region === 'MENA') {
        const south = lat < 42 || region === 'MENA';
        return [
          P(SP_BROADLEAF, 0.2, { t: OLIVE, s: 0.75, sy: 0.75 }), P(SP_UMBRELLA, 0.2, { t: CYPRESS }), P(SP_COLUMN, 0.18, { t: CYPRESS }),
          P(SP_TALL, 0.15, { d, au: 'brown', n: 0.2 }), P(SP_BROADLEAF, 0.17, { t: DARK, n: 1.5 }),
          P(SP_PALM, coastal && south ? 0.08 : 0.015, { n: 0 }), P(SP_DATEPALM, region === 'MENA' ? 0.1 : coastal && south ? 0.03 : 0, { n: 0 }),
        ];
      }
      return [
        P(SP_BROADLEAF, 0.18, { t: OLIVE, s: 0.75, sy: 0.75 }), P(SP_UMBRELLA, 0.15, { t: CYPRESS }), P(SP_EUCALYPT, 0.15),
        P(SP_TALL, 0.15, { d, au: 'brown' }), P(SP_BROADLEAF, 0.2, { t: DARK }), P(SP_PALM, 0.05, { n: 0 }),
      ];
    case 'hsub':
      if (region === 'EASIA') {
        // Tokyo / Shanghai / Taipei: camphor, cherry, ginkgo, plane, bamboo, cryptomeria/pine, maple
        return [
          P(SP_BROADLEAF, 0.26, { t: DARK, s: 1.15, n: 1.3 }), P(SP_BROADLEAF, 0.14, { d, au: 'orange', bl: CHERRY }),
          P(SP_TALL, 0.16, { d, au: 'yellow', u: 1.3, n: 0.3 }), P(SP_TALL, 0.1, { d, au: 'brown', n: 0.2 }), P(SP_BAMBOO, 0.08, { u: 0.4, n: 1.2 }),
          P(SP_CONIFER, 0.1, { sy: 1.15, n: 1.6 }), P(SP_BROADLEAF, 0.08, { d, au: 'red', s: 0.8 }), P(SP_PALM, a < 26 ? 0.08 : 0.015, { n: 0 }),
        ];
      }
      if (region === 'NAM') {
        return [
          P(SP_BROADLEAF, a < 33 ? 0.3 : 0.08, { t: DARK, s: 1.2 }), P(SP_BROADLEAF, 0.25, { d, au: 'red' }), P(SP_BROADLEAF, 0.15, { d, au: 'brown', s: 1.1 }),
          P(SP_TALL, 0.12, { d, au: 'yellow' }), P(SP_CONIFER, 0.15, { sy: 1.25, n: 1.8 }), P(SP_PALM, a < 31 ? 0.15 : 0, { n: 0.2, sy: 1.3 }),
          P(SP_BROADLEAF, 0.05, { d, au: 'orange', bl: CHERRY, n: 0 }),
        ];
      }
      if (region === 'AUS') {
        // Sydney / Brisbane: eucalyptus, jacaranda, Moreton Bay fig, palms, plane trees, Norfolk/hoop pine
        return [
          P(SP_EUCALYPT, 0.38, { n: 1.5 }), P(SP_BROADLEAF, 0.14, { bl: JACARANDA, n: 0.1 }), P(SP_BROADLEAF, 0.15, { t: DARK, s: 1.2 }),
          P(SP_PALM, 0.1, { n: 0.2 }), P(SP_TALL, 0.1, { d, au: 'brown', n: 0.1 }), P(SP_CONIFER, 0.06, { sy: 1.4, s: 0.8 }), P(SP_UMBRELLA, 0.05),
        ];
      }
      if (region === 'LATAM' || region === 'OTHER' && lat < 0) {
        return [
          P(SP_BROADLEAF, 0.3, { t: DARK }), P(SP_BROADLEAF, 0.12, { bl: JACARANDA }), P(SP_PALM, 0.12, { n: 0.3 }), P(SP_TALL, 0.15, { d, au: 'brown' }),
          P(SP_EUCALYPT, 0.08), P(SP_UMBRELLA, 0.08), P(SP_CONIFER, 0.05),
        ];
      }
      if (region === 'SASIA' || region === 'SEASIA') {
        return [P(SP_BROADLEAF, 0.35, { t: DARK, s: 1.2 }), P(SP_UMBRELLA, 0.15, { t: [1.0, 1.1, 0.8] }), P(SP_PALM, 0.15), P(SP_TALL, 0.15, { t: DARK }), P(SP_BANANA, 0.05, { u: 0.3 })];
      }
      return [
        P(SP_TALL, 0.25, { d, au: 'brown' }), P(SP_BROADLEAF, 0.3, { d, au: 'orange' }), P(SP_COLUMN, 0.12, { d, au: 'yellow', t: LIGHT }),
        P(SP_CONIFER, 0.12, { n: 1.5 }), P(SP_BROADLEAF, 0.08, { t: DARK }), P(SP_UMBRELLA, 0.05, { t: CYPRESS }),
      ];
    case 'ocean':
      if (region === 'NAM') {
        return [P(SP_CONIFER, 0.45, { sy: 1.4, n: 2 }), P(SP_BROADLEAF, 0.25, { d, au: 'red' }), P(SP_TALL, 0.1, { d, au: 'yellow' }), P(SP_BIRCH, 0.05, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.05, { t: DARK }), P(SP_BROADLEAF, 0.03, { d, bl: CHERRY, au: 'orange', n: 0 })];
      }
      if (region === 'AUS') {
        return [P(SP_EUCALYPT, 0.35, { n: 1.5 }), P(SP_TALL, 0.2, { d, au: 'brown', n: 0.1 }), P(SP_BROADLEAF, 0.15, { d, au: 'orange' }), P(SP_PALM, 0.06, { n: 0 }), P(SP_CONIFER, 0.1), P(SP_BROADLEAF, 0.14, { t: DARK })];
      }
      if (region === 'NZ') {
        return [P(SP_BROADLEAF, 0.35, { t: DARK, n: 1.4 }), P(SP_PALM, 0.08), P(SP_CONIFER, 0.2, { n: 1.3 }), P(SP_TALL, 0.12, { d, au: 'yellow', n: 0.1 }), P(SP_EUCALYPT, 0.05)];
      }
      if (region === 'LATAM' || region === 'AFR' || (region === 'OTHER' && a < 35)) {
        // Highland subtropics: Mexico City, Bogota, Johannesburg, Nairobi
        return [
          P(SP_EUCALYPT, 0.18, { n: 1.4 }), P(SP_BROADLEAF, 0.3, { t: DARK }), P(SP_BROADLEAF, 0.12, { bl: JACARANDA }), P(SP_PALM, 0.06, { n: 0 }),
          P(SP_CONIFER, 0.12, { n: 1.3 }), P(SP_COLUMN, 0.05, { t: CYPRESS }), P(SP_TALL, 0.1), P(SP_UMBRELLA, region === 'AFR' ? 0.12 : 0.03, { t: ACACIA }),
        ];
      }
      if (region === 'EASIA' || region === 'SASIA' || region === 'SEASIA') {
        return [P(SP_BROADLEAF, 0.35, { t: DARK }), P(SP_EUCALYPT, 0.12), P(SP_CONIFER, 0.2, { n: 1.5 }), P(SP_TALL, 0.12, { d, au: 'yellow' }), P(SP_BAMBOO, 0.06, { u: 0.4 }), P(SP_BROADLEAF, 0.06, { d, bl: CHERRY, au: 'orange' })];
      }
      // London / Paris / Amsterdam: London plane, oak, lime, beech, birch, some conifers
      return [
        P(SP_TALL, 0.28, { d, au: 'brown', s: 1.15, sy: 1.15, n: 0.15 }), P(SP_BROADLEAF, 0.22, { d, au: 'brown', s: 1.15, n: 1.6 }),
        P(SP_BROADLEAF, 0.18, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.08, { d, au: 'orange', t: [0.95, 1.0, 0.85], n: 1.5 }),
        P(SP_BIRCH, 0.08, { d, au: 'yellow' }), P(SP_CONIFER, 0.1, { n: 1.5 }), P(SP_COLUMN, 0.03, { d, au: 'yellow', t: LIGHT }),
        P(SP_BROADLEAF, 0.03, { d, bl: CHERRY, au: 'red', n: 0 }),
      ];
    case 'cont':
      if (region === 'EASIA') {
        // Beijing / Seoul / Harbin: scholar tree, ginkgo, white poplar, willow, Chinese pine/juniper, maple, crabapple
        return [
          P(SP_BROADLEAF, 0.26, { d, au: 'yellow', s: 1.05 }), P(SP_TALL, 0.16, { d, au: 'yellow', u: 1.3, n: 0.3 }),
          P(SP_COLUMN, 0.14, { d, au: 'yellow', t: [1.05, 1.0, 0.95] }), P(SP_TALL, 0.1, { d, au: 'yellow', t: WILLOW, s: 1.1 }),
          P(SP_CONIFER, 0.16, { t: [0.9, 0.95, 0.85], n: 1.8 }), P(SP_BROADLEAF, 0.08, { d, au: 'red', s: 0.8 }),
          P(SP_BROADLEAF, 0.04, { d, au: 'orange', bl: CRABAPPLE, s: 0.7, n: 0 }), P(SP_BIRCH, a > 44 ? 0.1 : 0, { d, au: 'yellow' }),
        ];
      }
      if (region === 'NAM') {
        // New York / Chicago / Toronto: maples, oaks, elm/honey locust, ginkgo, London plane, white pine, birch
        return [
          P(SP_BROADLEAF, 0.28, { d, au: 'red' }), P(SP_BROADLEAF, 0.18, { d, au: 'brown', s: 1.15, n: 1.4 }), P(SP_TALL, 0.16, { d, au: 'yellow' }),
          P(SP_TALL, 0.08, { d, au: 'yellow', u: 1.2, n: 0.1 }), P(SP_TALL, 0.08, { d, au: 'brown', n: 0.1 }), P(SP_CONIFER, 0.12, { n: 1.6 }),
          P(SP_BIRCH, 0.05, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.03, { d, bl: CHERRY, au: 'orange', n: 0 }),
        ];
      }
      // Moscow / Warsaw / Kyiv: birch, lime, maple/oak, spruce, poplar, willow
      return [
        P(SP_BIRCH, 0.24, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.22, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.1, { d, au: 'orange' }),
        P(SP_CONIFER, 0.24, { n: 1.6, sy: 1.15 }), P(SP_COLUMN, 0.08, { d, au: 'yellow', t: LIGHT }), P(SP_TALL, 0.08, { d, au: 'yellow', t: WILLOW }),
      ];
    case 'boreal':
      return [
        P(SP_CONIFER, 0.55, { sy: 1.2 }), P(SP_CONIFER, 0.12, { d, lx: true, au: 'gold', s: 0.95, t: [1.1, 1.1, 0.8] }),
        P(SP_BIRCH, 0.28, { d, au: 'yellow' }), P(SP_BROADLEAF, 0.05, { d, au: 'yellow', t: LIGHT }),
      ];
    default:
      return []; // tundra / ice: no trees
  }
}

// Zone parameters: tree density, street-tree factor, bush factor, bush tint, ground [green, dry, base amount]
const ZONE = {
  trop: { dens: 1.35, street: 1.1, bush: 1.2, bt: [0.9, 1.05, 0.85], g: [0.28, 0.52, 0.18], dry: [0.4, 0.5, 0.22], amt: 0.3 },
  sav: { dens: 0.7, street: 1.0, bush: 1.0, bt: [1.1, 1.05, 0.8], g: [0.4, 0.52, 0.22], dry: [0.68, 0.6, 0.34], amt: 0.35 },
  hdes: { dens: 0.12, street: 0.6, bush: 0.45, bt: [1.3, 1.08, 0.72], g: [0.74, 0.62, 0.44], dry: [0.74, 0.62, 0.44], amt: 0.85 },
  cdes: { dens: 0.15, street: 0.45, bush: 0.5, bt: [1.3, 1.15, 0.85], g: [0.66, 0.6, 0.46], dry: [0.66, 0.6, 0.46], amt: 0.75 },
  hstep: { dens: 0.4, street: 0.85, bush: 0.8, bt: [1.2, 1.05, 0.75], g: [0.5, 0.54, 0.3], dry: [0.66, 0.58, 0.36], amt: 0.5 },
  cstep: { dens: 0.45, street: 0.85, bush: 0.8, bt: [1.2, 1.1, 0.8], g: [0.46, 0.52, 0.3], dry: [0.6, 0.56, 0.38], amt: 0.45 },
  med: { dens: 0.8, street: 1.0, bush: 1.1, bt: [1.1, 1.0, 0.85], g: [0.38, 0.52, 0.24], dry: [0.7, 0.61, 0.36], amt: 0.3 },
  hsub: { dens: 1.1, street: 1.0, bush: 1.0, bt: ONE, g: [0.3, 0.5, 0.22], dry: [0.52, 0.5, 0.33], amt: 0.15 },
  ocean: { dens: 1.0, street: 1.0, bush: 1.0, bt: ONE, g: [0.3, 0.53, 0.22], dry: [0.46, 0.5, 0.32], amt: 0.2 },
  cont: { dens: 1.0, street: 1.0, bush: 1.0, bt: ONE, g: [0.32, 0.5, 0.22], dry: [0.54, 0.5, 0.35], amt: 0.15 },
  boreal: { dens: 1.05, street: 0.9, bush: 0.9, bt: [0.95, 1.0, 0.9], g: [0.3, 0.45, 0.24], dry: [0.52, 0.48, 0.35], amt: 0.25 },
  tundra: { dens: 0, street: 0, bush: 0.35, bt: [1.25, 0.95, 0.7], g: [0.5, 0.5, 0.38], dry: [0.55, 0.5, 0.4], amt: 0.6 },
  ice: { dens: 0, street: 0, bush: 0, bt: ONE, g: [0.85, 0.87, 0.9], dry: [0.85, 0.87, 0.9], amt: 0.7 },
};

// ------------------------------------------------------------------------------------------------ altitude & season
const TL = [[0, 3900], [30, 3700], [38, 3300], [46, 2200], [52, 1300], [60, 800], [66, 400], [70, 0]];
/** Approximate climatic treeline (m ASL) by latitude. */
export function treelineAt(lat) {
  const a = Math.abs(lat);
  for (let i = 1; i < TL.length; i++) {
    if (a <= TL[i][0]) {
      const [a0, h0] = TL[i - 1], [a1, h1] = TL[i];
      return h0 + ((h1 - h0) * (a - a0)) / (a1 - a0);
    }
  }
  return 0;
}

function dayOfYear(date) {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------------------------------------ context
const ctxCache = new Map();
/**
 * Flora context for a location. `date` defaults to now; `doyOverride` (north/south-local day of year) is for tests.
 */
export function floraContext(lat, lon, baseAslM = 0, date = null, doyOverride = null) {
  const now = date || new Date();
  const doy = doyOverride ?? dayOfYear(now);
  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${Math.round(baseAslM / 100)},${doy}`;
  const hit = ctxCache.get(key);
  if (hit) return hit;
  const { cls, coastal } = koppenAt(lat, lon);
  const zone = zoneOf(cls, lat);
  const region = regionOf(lat, lon);
  const entries = palette(zone, region, lat, coastal, lon).filter((e) => e.w > 0);
  const a = Math.abs(lat);
  // North-equivalent day of year: southern hemisphere seasons are shifted by half a year
  const de = lat < 0 ? (doy + 182) % 365 : doy;
  const seasonal = a >= 20 && zone !== 'trop' && zone !== 'sav';
  const lateFactor = zone === 'ocean' ? 12 : zone === 'hsub' ? 12 : zone === 'med' ? 20 : 0;
  const peak = Math.max(255, Math.min(340, 305 - (a - 40) * 2.2 + lateFactor));
  const leafOut = Math.max(40, Math.min(165, 95 + (a - 35) * 2.6 - (zone === 'ocean' || zone === 'med' ? 12 : 0)));
  // Cumulative weights per role: 0 street, 1 park/yard, 2 natural (wood/scrub/grass), 3 sand/beach
  const cum = [0, 1, 2, 3].map((role) => {
    const c = new Float32Array(entries.length);
    let s = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      let w = e.w;
      if (role === 0) w *= e.u;
      else if (role === 2) w *= e.n;
      else if (role === 3) {
        // Beaches/dunes: palms only where palms are a real part of the flora; otherwise wind-shaped umbrella trees
        const hot = zone === 'trop' || zone === 'sav' || zone === 'hdes' || zone === 'hstep';
        const palmy = e.sp === SP_PALM || e.sp === SP_DATEPALM || e.sp === SP_CACTUS;
        w *= palmy ? (hot || e.w >= 0.08 ? 1 : 0) : e.sp === SP_UMBRELLA ? 0.5 : 0;
      }
      else w *= 0.5 + 0.5 * e.n;
      s += w;
      c[i] = s;
    }
    return { c, total: s };
  });
  const zp = ZONE[zone];
  const ctx = {
    lat, lon, cls, zone, region, coastal, entries, cum, de, doy, seasonal, peak, leafOut,
    dens: zp.dens, streetDens: zp.street, bushDens: zp.bush, bushTint: zp.bt,
    treeline: treelineAt(lat), baseAslM,
  };
  ctx.ground = computeGround(ctx, zp);
  ctxCache.set(key, ctx);
  if (ctxCache.size > 256) ctxCache.delete(ctxCache.keys().next().value);
  return ctx;
}

function computeGround(ctx, zp) {
  const d = ctx.de;
  let dry = 0;
  if (ctx.zone === 'med') dry = smooth(140, 195, d) * (1 - smooth(290, 330, d));
  else if (ctx.zone === 'sav') dry = 0.5 + 0.5 * Math.cos((2 * Math.PI * (d - 30)) / 365);
  else if (ctx.zone === 'hstep' || ctx.zone === 'cstep') dry = 1 - 0.6 * smooth(70, 100, d) * (1 - smooth(150, 190, d));
  else if (ctx.seasonal) {
    // Dormant (winter-brown) grass between late autumn and leaf-out
    const dormantStart = ctx.peak + 10;
    dry = d >= dormantStart ? smooth(dormantStart, dormantStart + 25, d) : 1 - smooth(ctx.leafOut - 20, ctx.leafOut + 10, d);
    dry *= ctx.zone === 'ocean' ? 0.35 : ctx.zone === 'hsub' ? 0.6 : 0.85;
  }
  const t = [0, 1, 2].map((i) => zp.g[i] + (zp.dry[i] - zp.g[i]) * dry);
  return { tint: t, amt: Math.min(0.9, zp.amt + dry * 0.5), dry };
}

/** Weighted palette pick for a role (0 street, 1 park, 2 natural, 3 sand) with r in [0,1). */
export function pickFlora(ctx, role, r) {
  const { c, total } = ctx.cum[role];
  if (!(total > 0)) return null;
  const x = r * total;
  for (let i = 0; i < c.length; i++) if (x < c[i]) return ctx.entries[i];
  return ctx.entries[ctx.entries.length - 1];
}

const MONTANE_CONIFER = P(SP_CONIFER, 1, { sy: 1.1 });
const MONTANE_LARCH = P(SP_CONIFER, 1, { d: true, lx: true, au: 'gold', t: [1.1, 1.1, 0.8] });
const MONTANE_BIRCH = P(SP_BIRCH, 1, { d: true, au: 'yellow' });
const OUT = { sp: 0, r: 1, g: 1, b: 1, sx: 1, sy: 1 };

/**
 * Final look for one tree: altitude (montane / krummholz / above treeline) + season (autumn color, bare, blossom).
 * h, h2 in [0,1) are per-tree hashes. Returns a shared scratch object or null (no tree here).
 */
export function floraLook(ctx, e, h, h2, elevAsl = 0) {
  let sx = e.s, sy = e.sy;
  // --- altitude
  const tl = ctx.treeline;
  if (elevAsl > tl - 1200 && ctx.zone !== 'tundra' && ctx.zone !== 'ice') {
    if (elevAsl > tl) return null; // above treeline: no trees (bushes handled by floraBush)
    if (elevAsl > tl - 250) {
      // Krummholz: stunted, sparse conifers
      if (h2 < 0.45) return null;
      e = MONTANE_CONIFER;
      sx = sy = 0.42 + h * 0.2;
    } else {
      const f = Math.min(1, (elevAsl - (tl - 1200)) / 900);
      if (h2 < f * 0.88) e = h < 0.62 ? MONTANE_CONIFER : h < 0.85 ? MONTANE_LARCH : MONTANE_BIRCH, (sx = e.s), (sy = e.sy);
    }
  }
  const lum = 0.86 + h2 * 0.26;
  let t = e.t, sp = e.sp;
  // --- season
  if (ctx.seasonal) {
    const d = ctx.de;
    const j = (h - 0.5) * 16;
    let bloomed = false;
    if (e.bl) {
      const sh = (Math.abs(ctx.lat) - 35) * e.bl.lat;
      if (d >= e.bl.d0 + sh + j * 0.5 && d <= e.bl.d1 + sh + j * 0.5) {
        t = e.bl.c;
        bloomed = true;
      }
    }
    if (e.d && !bloomed) {
      const aStart = ctx.peak - 28 + j, aEnd = ctx.peak + 16 + j, lo = ctx.leafOut + j * 0.6;
      if (d >= aEnd || d < lo - 10 || (d < lo && h2 < 0.5)) {
        if (e.lx) t = [1.1, 0.75, 0.5]; // bare larch: brown needles-off look
        else {
          sp = SP_BARE;
          t = ONE;
          if (e.sp === SP_COLUMN) (sx *= 0.55), (sy *= 1.15);
          else if (e.sp === SP_TALL || e.sp === SP_BIRCH) (sx *= 0.8), (sy *= 1.12);
        }
      } else if (d < lo) t = FRESH;
      else if (d >= aStart && e.au) {
        const s = (d - aStart) / (aEnd - aStart);
        const k = Math.min(1, s * 3);
        t = [t[0] + (e.au[0] - t[0]) * k, t[1] + (e.au[1] - t[1]) * k, t[2] + (e.au[2] - t[2]) * k];
      }
    }
  }
  const warm = (h - 0.5) * 0.12;
  OUT.sp = sp;
  OUT.r = t[0] * lum * (1 + warm);
  OUT.g = t[1] * lum;
  OUT.b = t[2] * lum * (1 - warm * 0.6);
  OUT.sx = sx;
  OUT.sy = sy;
  return OUT;
}

/** Bush look: zone tint, dormant-brown in winter, thinned / none above treeline. */
export function floraBush(ctx, h, elevAsl = 0) {
  const tl = ctx.treeline;
  if (elevAsl > tl + 300 && ctx.zone !== 'tundra') return null;
  if (elevAsl > tl && h > 0.35) return null;
  let t = ctx.bushTint;
  if (ctx.seasonal && ctx.ground.dry > 0.5 && ctx.zone !== 'med') t = [t[0] * 1.35, t[1] * 0.95, t[2] * 0.6];
  const lum = 0.86 + h * 0.26;
  OUT.sp = SP_BUSH;
  OUT.r = t[0] * lum;
  OUT.g = t[1] * lum;
  OUT.b = t[2] * lum;
  OUT.sx = elevAsl > tl || ctx.zone === 'tundra' ? 0.55 : 1;
  OUT.sy = OUT.sx;
  return OUT;
}

/** Generic seasonal entries for real (tagged) OSM trees by coarse species. */
const GENERIC = {
  [SP_BROADLEAF]: P(SP_BROADLEAF, 1, { d: true, au: 'orange' }),
  [SP_TALL]: P(SP_TALL, 1, { d: true, au: 'yellow' }),
};
export function genericEntry(ctx, sp) {
  const deciduous = ctx.seasonal && ctx.zone !== 'med' && ctx.zone !== 'hdes' && ctx.zone !== 'hstep';
  return deciduous ? GENERIC[sp] || null : null;
}

/** Cheap deterministic hash in [0,1) from a world position. */
export function hash2(x, z, k = 0) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Orchard / plantation tree for the zone: olive groves (Mediterranean), date palms (desert), fruit trees elsewhere. */
export function orchardEntry(ctx) {
  if (ctx.zone === 'med') return ORCH_OLIVE;
  if (ctx.zone === 'hdes' || ctx.zone === 'hstep') return ORCH_DATE;
  if (ctx.zone === 'trop' || ctx.zone === 'sav') return ORCH_BANANA;
  return ORCH_FRUIT;
}
const ORCH_OLIVE = P(SP_BROADLEAF, 1, { t: OLIVE, s: 0.85, sy: 0.85 });
const ORCH_DATE = P(SP_DATEPALM, 1, { s: 0.7, sy: 0.7 });
const ORCH_BANANA = P(SP_BANANA, 1, { s: 0.9 });
const ORCH_FRUIT = P(SP_BROADLEAF, 1, { d: true, au: 'orange', bl: CRABAPPLE });
