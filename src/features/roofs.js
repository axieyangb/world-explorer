import * as THREE from '../../vendor/three.module.js';

/**
 * [roofs] Pitched / mansard / flat roofs and regional architecture (worker side, used by the WFC building emitter,
 * the infill blocks and the suburban yard pass in chunk_builder.js).
 *
 * Roof choice: OSM `roof:*` tags when the tile carries them (tuple[8], see global_tiles.js; the OpenFreeMap
 * OpenMapTiles schema does not, so in practice this is inference), else building type, footprint size, height,
 * land-use flavour (chunkGroundSampler: industrial / dense / residential) and the architectural region.
 *
 * Geometry: a weighted straight-skeleton approximation. Every footprint edge moves inward at speed w (1 = hip slope,
 * 0 = vertical gable wall) while the roof rises; vertex velocities follow the two adjacent edges, edge-collapse events
 * merge vertices (a rectangle with w = 1 ends in a hip ridge, with w = 0 on its short ends in a gable ridge). At the
 * first split event (a reflex corner reaching another edge) or at the rise cap the rest is capped flat, so arbitrary
 * footprints (L, T, courtyards, curved) always get a closed roof. Mansards are two stages (steep, then shallow) of
 * the same inset with every ring (courtyards included) moving at once.
 *
 * Covering pattern: roof triangles carry uv = (material * 1000 + 300 + s, -20 - t) with s along the eave and t up the
 * slope, in metres. The building shader (chunk_builder.js, `[roofs]` branch) draws tiles / slate / shingles /
 * standing seams from it; uv.y = -10 stays the plain vertex-colour surface.
 */

export const RM = { flat: 0, terracotta: 1, slate: 2, shingle: 3, metal: 4, zinc: 5, clay: 6, jptile: 7, gravel: 8, water: 9, fence: 10 };
const UV_BASE = 300.0;

// ------------------------------------------------------------------------------------------------------------------
// Architectural regions
// ------------------------------------------------------------------------------------------------------------------

/** Finer architectural region than resolveRegionTag (which keys the original facade pools). */
export function archRegionFor(worldOrigin) {
  if (!worldOrigin) return 'beijing';
  const lat = Number(worldOrigin.centerLat), lon = Number(worldOrigin.centerLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || worldOrigin.isBeijing) return 'beijing';
  const box = (a0, a1, o0, o1) => lat >= a0 && lat <= a1 && lon >= o0 && lon <= o1;
  // North America
  if (box(40.45, 41.0, -74.3, -73.65)) return 'nyc';
  if (box(37.70, 37.84, -122.53, -122.35)) return 'sf'; // San Francisco city proper (flat-roofed rowhouses)
  if (box(32.4, 38.6, -123.0, -114.0) || box(31.0, 37.5, -115.0, -104.0)) return 'la'; // California (Silicon Valley, Bay Area suburbs, SoCal) + Southwest
  if (box(24.0, 50.0, -126.0, -66.0) || box(42.0, 60.0, -130.0, -52.0)) return 'us';
  if (box(14.0, 33.0, -118.0, -86.0) || box(-56.0, 14.0, -92.0, -33.0) || box(9.0, 24.0, -86.0, -59.0)) return 'latam';
  // Europe
  if (box(48.6, 49.1, 2.0, 2.7)) return 'paris';
  if (box(49.8, 59.5, -8.5, 1.9)) return 'uk';
  if (box(54.5, 71.5, 4.0, 32.0) || box(63.0, 67.0, -25.0, -13.0)) return 'nordic';
  if (box(35.0, 44.2, -10.0, 4.5) || box(36.0, 45.8, 6.5, 19.0) || box(34.5, 42.0, 19.0, 30.0) || box(42.5, 44.2, 4.5, 8.0)) return 'med';
  if (box(35.0, 62.0, -11.0, 40.0)) return 'eu';
  // Middle East / North Africa
  if (box(12.0, 37.5, 34.0, 60.0) || box(20.0, 37.0, -17.0, 34.0)) return 'mideast';
  // East Asia
  if (box(30.0, 46.0, 129.0, 146.0)) return 'japan';
  if (box(21.0, 26.0, 112.0, 122.5)) return 'hk'; // Hong Kong, Shenzhen, Guangzhou, Taipei
  if (box(20.0, 46.0, 98.0, 129.0)) return 'china';
  if (box(-11.0, 20.0, 92.0, 141.0)) return 'seasia';
  return 'global';
}

/** Regions whose pitched roofs the inference produces, and how it picks them. */
const REGION_ROOF = {
  // p: share of small residential footprints that are pitched; hMax/aMax: biggest pitched building (m, m^2)
  us: { p: 0.96, hMax: 12, aMax: 480, gable: 0.55, k: [0.36, 0.55], eave: 0.55 },
  la: { p: 0.95, hMax: 11, aMax: 480, gable: 0.35, k: [0.30, 0.42], eave: 0.6 },
  sf: { p: 0.45, hMax: 13, aMax: 360, gable: 0.85, k: [0.55, 0.85], eave: 0.3 },
  nyc: { p: 0.75, hMax: 10, aMax: 300, gable: 0.7, k: [0.45, 0.65], eave: 0.4 },
  uk: { p: 0.95, hMax: 15, aMax: 1400, gable: 0.7, k: [0.62, 0.8], eave: 0.25 },
  paris: { p: 0.85, hMax: 11, aMax: 600, gable: 0.6, k: [0.7, 0.95], eave: 0.3 },
  eu: { p: 0.85, hMax: 17, aMax: 1600, gable: 0.7, k: [0.7, 1.0], eave: 0.5 },
  med: { p: 0.85, hMax: 32, aMax: 7000, gable: 0.3, k: [0.3, 0.4], eave: 0.45 },
  nordic: { p: 0.95, hMax: 16, aMax: 1400, gable: 0.8, k: [0.55, 0.8], eave: 0.45 },
  latam: { p: 0.55, hMax: 9, aMax: 320, gable: 0.4, k: [0.3, 0.4], eave: 0.4 },
  mideast: { p: 0.03, hMax: 8, aMax: 300, gable: 0.5, k: [0.3, 0.4], eave: 0.3 },
  japan: { p: 0.85, hMax: 10, aMax: 260, gable: 0.5, k: [0.42, 0.6], eave: 0.55 },
  hk: { p: 0.15, hMax: 8, aMax: 200, gable: 0.5, k: [0.35, 0.5], eave: 0.4 },
  china: { p: 0.35, hMax: 9, aMax: 300, gable: 0.6, k: [0.4, 0.55], eave: 0.5 },
  seasia: { p: 0.6, hMax: 9, aMax: 320, gable: 0.4, k: [0.4, 0.55], eave: 0.6 },
  global: { p: 0.65, hMax: 11, aMax: 450, gable: 0.5, k: [0.4, 0.6], eave: 0.45 },
};

const PITCHED_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'cabin', 'hut', 'shed',
  'garage', 'farm', 'barn', 'farm_auxiliary', 'stable', 'church', 'chapel', 'static_caravan', 'villa', 'dormitory']);
const FLAT_TYPES = new Set(['commercial', 'retail', 'industrial', 'warehouse', 'office', 'supermarket', 'mall', 'hospital',
  'parking', 'garages', 'hotel', 'government', 'public', 'civic', 'stadium', 'train_station', 'transportation',
  'university', 'school', 'college', 'kindergarten', 'campus', 'tech_campus', 'kiosk', 'pavilion', 'service',
  'toilets', 'carport', 'canopy', 'guardhouse', 'security', 'laboratory', 'research',
  'department_store', 'manufacture', 'data_center', 'hangar', 'bunker', 'grandstand', 'roof']);

// POI-derived types (a shop or hotel on the ground floor) say nothing about the roof of a European old-town block
const SOFT_FLAT = new Set(['commercial', 'retail', 'hotel', 'office', 'civic', 'public', 'government']);
const OLD_TOWN = { med: 1, eu: 1, uk: 1, nordic: 1, paris: 1, latam: 1 };

// Roof coverings (base colours, sRGB-ish albedo used as vertex colour)
const COVER = {
  terracotta: [[0.60, 0.29, 0.19], [0.55, 0.25, 0.17], [0.64, 0.35, 0.23], [0.50, 0.27, 0.19]],
  spanish: [[0.60, 0.31, 0.20], [0.55, 0.27, 0.18], [0.64, 0.37, 0.25]],
  slate: [[0.25, 0.27, 0.30], [0.30, 0.31, 0.34], [0.22, 0.24, 0.27], [0.34, 0.33, 0.33]],
  clay: [[0.56, 0.24, 0.17], [0.47, 0.22, 0.17], [0.30, 0.29, 0.29], [0.62, 0.30, 0.20], [0.38, 0.24, 0.20]],
  shingle: [[0.24, 0.24, 0.25], [0.30, 0.26, 0.23], [0.20, 0.21, 0.23], [0.33, 0.30, 0.27], [0.27, 0.29, 0.31], [0.34, 0.27, 0.21], [0.19, 0.19, 0.19]],
  metalNordic: [[0.50, 0.15, 0.13], [0.18, 0.19, 0.20], [0.33, 0.35, 0.37], [0.24, 0.34, 0.27], [0.55, 0.20, 0.15], [0.20, 0.22, 0.26]],
  metal: [[0.52, 0.54, 0.55], [0.40, 0.42, 0.44], [0.45, 0.22, 0.18], [0.28, 0.38, 0.45]],
  zinc: [[0.40, 0.44, 0.48], [0.44, 0.47, 0.50], [0.36, 0.40, 0.44]],
  jptile: [[0.24, 0.27, 0.31], [0.30, 0.31, 0.33], [0.22, 0.28, 0.36], [0.36, 0.28, 0.24], [0.28, 0.36, 0.42]],
};

const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
function rnd(seed, salt) {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function vary(rgb, seed, amt = 0.06) {
  const v = 1 + (rnd(seed, 71) - 0.5) * 2 * amt;
  return [Math.min(1, rgb[0] * v), Math.min(1, rgb[1] * v), Math.min(1, rgb[2] * v)];
}

const OSM_SHAPE = { flat: 'flat', gabled: 'gable', hipped: 'hip', 'half-hipped': 'hip', side_hipped: 'hip', pyramidal: 'hip',
  mansard: 'mansard', gambrel: 'mansard', skillion: 'gable', saltbox: 'gable', round: 'hip', dome: 'hip', onion: 'hip' };
const OSM_MATERIAL = { roof_tiles: 'clay', tile: 'clay', tiles: 'clay', slate: 'slate', metal: 'metal', metal_sheet: 'metal',
  copper: 'metal', zinc: 'zinc', tar_paper: 'shingle', asphalt: 'shingle', asphalt_shingle: 'shingle', shingle: 'shingle',
  concrete: 'flat', gravel: 'flat', glass: 'flat', grass: 'flat', thatch: 'clay', wood: 'shingle', eternit: 'slate' };

// ------------------------------------------------------------------------------------------------------------------
// Footprint helpers
// ------------------------------------------------------------------------------------------------------------------

/** Area (signed, > 0 for the CCW orientation used by the building emitters) of a flat [x, z, ...] ring. */
export function ringArea2(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return a * 0.5;
}

/** Minimum-area oriented box over the ring's edge directions: { ax, az (long axis), len, wid, cx, cz, fill }. */
export function footprintObb(flat) {
  const n = flat.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = flat[j * 2] - flat[i * 2], uz = flat[j * 2 + 1] - flat[i * 2 + 1];
    const L = Math.hypot(ux, uz);
    if (L < 0.5) continue;
    ux /= L; uz /= L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = flat[k * 2], z = flat[k * 2 + 1];
      const a = x * ux + z * uz, b = -x * uz + z * ux;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area - 1e-6) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  if (!best) return null;
  let { ux, uz, a0, a1, b0, b1 } = best;
  // long axis first
  if (b1 - b0 > a1 - a0) {
    const nux = -uz, nuz = ux; // rotate +90: new a = old b, new b = -old a
    const na0 = b0, na1 = b1, nb0 = -a1, nb1 = -a0;
    ux = nux; uz = nuz; a0 = na0; a1 = na1; b0 = nb0; b1 = nb1;
  }
  const am = (a0 + a1) * 0.5, bm = (b0 + b1) * 0.5;
  const area = Math.abs(ringArea2(flat));
  return {
    ax: ux, az: uz, len: a1 - a0, wid: b1 - b0, a0, a1, b0, b1,
    cx: am * ux - bm * uz, cz: am * uz + bm * ux,
    fill: area / Math.max(1e-6, (a1 - a0) * (b1 - b0)), area,
  };
}

/** Removes duplicate, collinear and spike vertices; returns a new flat ring with the requested orientation. */
function cleanRing(flat, wantPositive) {
  let pts = [];
  const n0 = flat.length / 2;
  for (let i = 0; i < n0; i++) {
    const x = flat[i * 2], z = flat[i * 2 + 1];
    const last = pts.length ? pts[pts.length - 1] : null;
    if (last && Math.hypot(last[0] - x, last[1] - z) < 0.12) continue;
    pts.push([x, z]);
  }
  while (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.12) pts.pop();
  for (let pass = 0; pass < 3 && pts.length > 3; pass++) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      if (lu < 1e-6 || lv < 1e-6) continue;
      const cross = (ux * vz - uz * vx) / (lu * lv), dot = (ux * vx + uz * vz) / (lu * lv);
      if (Math.abs(cross) < 0.035 && dot > 0) continue; // collinear (< 2 deg)
      if (dot < -0.985) continue; // spike
      out.push(b);
    }
    if (out.length === pts.length) break;
    pts = out;
  }
  if (pts.length < 3) return null;
  const flatOut = [];
  for (const p of pts) flatOut.push(p[0], p[1]);
  const a = ringArea2(flatOut);
  if (Math.abs(a) < 1.0) return null;
  if ((a > 0) !== wantPositive) {
    const rev = [];
    for (let i = pts.length - 1; i >= 0; i--) rev.push(pts[i][0], pts[i][1]);
    return rev;
  }
  return flatOut;
}

/** Douglas-Peucker on a closed ring (keeps the two farthest-apart anchor vertices). */
function simplifyRing(flat, tol) {
  const n = flat.length / 2;
  if (n <= 8) return flat;
  const keep = new Uint8Array(n);
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(flat[i * 2] - flat[0], flat[i * 2 + 1] - flat[1]);
    if (d > best) { best = d; i1 = i; }
  }
  keep[i0] = keep[i1] = 1;
  const rec = (a, b) => { // indices along the ring from a to b (exclusive), wrapping
    const ax = flat[a * 2], az = flat[a * 2 + 1], bx = flat[b * 2], bz = flat[b * 2 + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    let far = -1, fd = tol;
    for (let k = (a + 1) % n; k !== b; k = (k + 1) % n) {
      const d = Math.abs((flat[k * 2] - ax) * dz - (flat[k * 2 + 1] - az) * dx) / L;
      if (d > fd) { fd = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; rec(a, far); rec(far, b); }
  };
  rec(i0, i1); rec(i1, i0);
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out.length >= 6 ? out : flat;
}

// ------------------------------------------------------------------------------------------------------------------
// Roof plan
// ------------------------------------------------------------------------------------------------------------------

/**
 * Decides the roof of one building. info: { flatOuter, holes, rawH, btype, region (arch), seed, flav (-1..1 land use),
 * isPart, minH, osm ({shape, height, colour, material} | null), facadeId, hasHoles }.
 * Returns null for a flat roof, else { shape: 'hip'|'gable'|'mansard', mat, rgb, k, eave, maxRise, chimney, obb, trim }.
 */
export function planRoof(info) {
  const { flatOuter, rawH, region, seed } = info;
  if (!flatOuter || flatOuter.length < 6 || region === 'beijing') return null;
  if (info.isPart || (info.minH || 0) > 0.5) return null;
  const btype = String(info.btype || 'yes').toLowerCase();
  const R = REGION_ROOF[region] || REGION_ROOF.global;
  const osm = info.osm || null;
  const obb = footprintObb(flatOuter);
  if (!obb) return null;
  const area = obb.area;
  const holes = info.hasHoles;

  let shape = null;
  if (osm && osm.shape) {
    shape = OSM_SHAPE[String(osm.shape).toLowerCase()] || null;
    if (shape === 'flat') return null;
  }
  const fid = String(info.facadeId || '');
  const haussmann = region === 'paris' && rawH >= 14 && rawH <= 46 && !/glass|office_concrete|parking|industrial|retail/.test(fid);
  if (!shape) {
    if (haussmann) shape = 'mansard';
    else if (FLAT_TYPES.has(btype) && !(OLD_TOWN[region] && SOFT_FLAT.has(btype))) return null;
    else if (PITCHED_TYPES.has(btype)) {
      if ((region === 'mideast' || region === 'hk') && btype !== 'church') return null;
      shape = 'pitch';
    } else {
      // 'yes' / residential / apartments: size, height, land use and region
      if (rawH > R.hMax || area > R.aMax || area < 14) return null;
      if (holes && region !== 'med' && region !== 'eu') return null;
      const isHouseSized = area >= 35 && area <= 320 && rawH <= 9.8 && obb.len <= 28;
      if ((info.flav ?? 0.5) < -0.35 && !isHouseSized) return null; // industrial / works yards
      if (btype === 'yes' && !isHouseSized && (info.flav ?? 0.5) < 0.25) return null; // commercial / office / institutional campus (flav <= 0.2)
      if (region === 'us' || region === 'la' || region === 'sf') {
        // a big low box in a dense commercial strip is a store/office, not a house
        if (area > 320 && (info.flav ?? 0.5) < 0.3) return null;
      }
      if (rnd(seed, 11) > R.p) return null;
      shape = 'pitch';
    }
  }
  if (holes && shape !== 'mansard' && shape !== 'pitch') return null;

  // covering by region
  let mat = RM.shingle, cover = COVER.shingle, kk = R.k, eave = R.eave, chimneyP = 0.0, trim = null;
  const r1 = rnd(seed, 23), r2 = rnd(seed, 29);
  switch (region) {
    case 'us': case 'nyc':
      mat = RM.shingle; cover = COVER.shingle; chimneyP = 0.35; trim = [0.86, 0.86, 0.84]; break;
    case 'la':
      if (r1 < 0.32 || info.facadeId === 'stucco_spanish') { mat = RM.terracotta; cover = COVER.spanish; kk = [0.28, 0.36]; }
      else { mat = RM.shingle; cover = COVER.shingle; }
      chimneyP = 0.2; trim = [0.84, 0.82, 0.78]; break;
    case 'sf':
      mat = RM.shingle; cover = COVER.shingle; chimneyP = 0.25; trim = [0.9, 0.9, 0.88]; break;
    case 'uk':
      if (r1 < 0.62) { mat = RM.slate; cover = COVER.slate; } else { mat = RM.clay; cover = COVER.clay; }
      chimneyP = 0.8; break;
    case 'paris':
      if (r1 < 0.6) { mat = RM.slate; cover = COVER.slate; } else { mat = RM.zinc; cover = COVER.zinc; }
      chimneyP = 0.5; break;
    case 'eu':
      if (r1 < 0.72) { mat = RM.clay; cover = COVER.clay; } else { mat = RM.slate; cover = COVER.slate; }
      chimneyP = 0.45; break;
    case 'med': case 'latam':
      mat = RM.terracotta; cover = COVER.terracotta; chimneyP = region === 'med' ? 0.3 : 0.05; break;
    case 'nordic':
      if (r1 < 0.78) { mat = RM.metal; cover = COVER.metalNordic; } else { mat = RM.clay; cover = COVER.clay; }
      chimneyP = 0.35; trim = [0.9, 0.9, 0.88]; break;
    case 'japan':
      if (r1 < 0.5) { mat = RM.jptile; cover = COVER.jptile; } else { mat = RM.metal; cover = COVER.jptile; }
      break;
    case 'china': case 'hk':
      mat = RM.jptile; cover = COVER.jptile; break;
    case 'seasia':
      if (r1 < 0.5) { mat = RM.metal; cover = COVER.metal; } else { mat = RM.terracotta; cover = COVER.terracotta; }
      break;
    case 'mideast':
      mat = RM.terracotta; cover = COVER.spanish; break;
    default:
      if (r1 < 0.45) { mat = RM.terracotta; cover = COVER.terracotta; } else if (r1 < 0.75) { mat = RM.shingle; cover = COVER.shingle; } else { mat = RM.metal; cover = COVER.metal; }
      chimneyP = 0.15;
  }
  if (btype === 'church' || btype === 'chapel') kk = [1.0, 1.4];
  if (btype === 'shed' || btype === 'garage' || btype === 'hut') chimneyP = 0;
  if (osm && osm.material) {
    const m = OSM_MATERIAL[String(osm.material).toLowerCase()];
    if (m === 'flat') return null;
    if (m === 'clay') { mat = region === 'med' || region === 'latam' || region === 'la' ? RM.terracotta : RM.clay; cover = region === 'med' || region === 'latam' ? COVER.terracotta : COVER.clay; }
    else if (m && COVER[m]) { mat = RM[m]; cover = COVER[m]; }
  }
  let rgb = vary(pick(cover, r2), seed);
  if (osm && osm.colour) {
    const c = osm.colourRgb;
    if (c) rgb = c;
  }

  if (shape === 'mansard') {
    const zinc = vary(pick(COVER.zinc, r2), seed, 0.05);
    return { shape, mat: RM.zinc, rgb: zinc, k: 2.3, eave: 0.32, maxRise: 4.2, chimney: rnd(seed, 31) < 0.7, obb, trim: null, dormers: true };
  }

  const k = kk[0] + (kk[1] - kk[0]) * rnd(seed, 37);
  // gable ends need a clearly oblong, near-rectangular footprint; squares and odd shapes get hips (pyramids)
  const gable = obb.len / Math.max(1, obb.wid) > 1.18 && obb.fill > 0.72 && rnd(seed, 41) < R.gable &&
    !(osm && osm.shape && /hip|pyramid/.test(String(osm.shape)));
  let maxRise = Math.min(area > 600 ? 5.5 : 4.6, 0.5 * obb.wid * k + 0.01);
  if (osm && Number(osm.height) > 0) maxRise = Math.min(12, Number(osm.height));
  return {
    shape: gable || (osm && /gable|skillion|saltbox/.test(String(osm.shape || ''))) ? 'gable' : 'hip',
    mat, rgb, k, eave, maxRise, obb, trim,
    chimney: area < 900 && rnd(seed, 31) < chimneyP,
    dormers: false,
  };
}

/** Roof rise to plan the wall top with (the walls stop at topY - rise). */
export function roofRise(plan) {
  if (!plan) return 0;
  if (plan.shape === 'mansard') return 3.0 + 1.0;
  return plan.maxRise;
}

// ------------------------------------------------------------------------------------------------------------------
// Skeleton roof geometry
// ------------------------------------------------------------------------------------------------------------------

function makeRing(flat, edges, weightOf) {
  const n = flat.length / 2;
  const x = [], z = [], e = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = flat[i * 2], z1 = flat[i * 2 + 1], x2 = flat[j * 2], z2 = flat[j * 2 + 1];
    const L = Math.hypot(x2 - x1, z2 - z1) || 1;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
    edges.push({ ux, uz, nx: -uz, nz: ux, ox: x1, oz: z1, w: weightOf(i, ux, uz, x1, z1, x2, z2, L) });
    x.push(x1); z.push(z1); e.push(edges.length - 1);
  }
  return { x, z, e };
}

function velocities(ring, edges, out) {
  const n = ring.x.length;
  out.length = n * 2;
  for (let i = 0; i < n; i++) {
    const A = edges[ring.e[(i - 1 + n) % n]], B = edges[ring.e[i]];
    const det = A.nx * B.nz - A.nz * B.nx;
    let vx, vz;
    if (Math.abs(det) < 0.04) {
      const w = (A.w + B.w) * 0.5;
      vx = (A.nx + B.nx) * 0.5 * w; vz = (A.nz + B.nz) * 0.5 * w;
    } else {
      vx = (A.w * B.nz - B.w * A.nz) / det;
      vz = (A.nx * B.w - B.nx * A.w) / det;
    }
    const m = Math.hypot(vx, vz);
    if (m > 6) { vx *= 6 / m; vz *= 6 / m; }
    out[i * 2] = vx; out[i * 2 + 1] = vz;
  }
  return out;
}

function segX(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/** True when the advanced rings are still simple, keep their orientation and do not cross each other. */
function ringsValid(rings, signs) {
  for (let r = 0; r < rings.length; r++) {
    const R = rings[r];
    const n = R.x.length;
    let a = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += R.x[i] * R.z[j] - R.x[j] * R.z[i];
    }
    if (a * signs[r] < -1e-6) return false;
  }
  // all edges against all non-adjacent edges (rings are small)
  for (let r = 0; r < rings.length; r++) {
    const R = rings[r], n = R.x.length;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      for (let s = r; s < rings.length; s++) {
        const S = rings[s], m = S.x.length;
        for (let j = s === r ? i + 2 : 0; j < m; j++) {
          if (s === r && (j === i || (j + 1) % m === i || j === i2)) continue;
          const j2 = (j + 1) % m;
          if (segX(R.x[i], R.z[i], R.x[i2], R.z[i2], S.x[j], S.z[j], S.x[j2], S.z[j2])) return false;
        }
      }
    }
  }
  return true;
}

function advance(rings, vels, dt) {
  const out = [];
  for (let r = 0; r < rings.length; r++) {
    const R = rings[r], V = vels[r];
    const x = new Array(R.x.length), z = new Array(R.x.length);
    for (let i = 0; i < R.x.length; i++) { x[i] = R.x[i] + V[i * 2] * dt; z[i] = R.z[i] + V[i * 2 + 1] * dt; }
    out.push({ x, z, e: R.e.slice() });
  }
  return out;
}

/** Drops collapsed edges (merging their end vertices) and dead rings. */
function collapse(rings, signs) {
  const outR = [], outS = [];
  for (let r = 0; r < rings.length; r++) {
    let R = rings[r];
    for (let pass = 0; pass < 4; pass++) {
      const n = R.x.length;
      if (n < 3) break;
      const x = [], z = [], e = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (Math.hypot(R.x[j] - R.x[i], R.z[j] - R.z[i]) < 0.06) continue; // edge i collapsed: drop vertex i
        x.push(R.x[i]); z.push(R.z[i]); e.push(R.e[i]);
      }
      if (x.length === n) break;
      R = { x, z, e };
    }
    if (R.x.length < 3) {
      if (r === 0) return { rings: [], signs: [] };
      continue;
    }
    let a = 0;
    for (let i = 0; i < R.x.length; i++) {
      const j = (i + 1) % R.x.length;
      a += R.x[i] * R.z[j] - R.x[j] * R.z[i];
    }
    if (Math.abs(a) < 0.08) {
      if (r === 0) return { rings: [], signs: [] };
      continue;
    }
    outR.push(R); outS.push(signs[r]);
  }
  return { rings: outR, signs: outS };
}

/**
 * Runs the inset from `rings` (first = outer, CCW; the rest = holes, CW) rising `k` per unit time from y0 until tMax or
 * the first split event. Emits the sloped faces through `face(A, B, B2, A2, edge, ya, yb, t0, t1)`.
 * Returns { rings, signs, t } (what is left to cap; rings is empty when the roof closed to a ridge or peak).
 */
function inset(rings, signs, edges, k, y0, tMax, face) {
  let t = 0;
  const vels = rings.map(() => []);
  for (let iter = 0; iter < 48 && rings.length; iter++) {
    for (let r = 0; r < rings.length; r++) velocities(rings[r], edges, vels[r]);
    let dt = tMax - t;
    for (let r = 0; r < rings.length; r++) {
      const R = rings[r], V = vels[r], n = R.x.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = R.x[j] - R.x[i], dz = R.z[j] - R.z[i];
        const L = Math.hypot(dx, dz);
        if (L < 1e-6) continue;
        const rate = ((V[j * 2] - V[i * 2]) * dx + (V[j * 2 + 1] - V[i * 2 + 1]) * dz) / L;
        if (rate < -1e-6) dt = Math.min(dt, L / -rate);
      }
    }
    if (dt <= 1e-5) break;
    let next = advance(rings, vels, dt);
    let split = false;
    if (!ringsValid(next, signs)) {
      let lo = 0, hi = dt;
      for (let b = 0; b < 9; b++) {
        const mid = (lo + hi) * 0.5;
        if (ringsValid(advance(rings, vels, mid), signs)) lo = mid; else hi = mid;
      }
      dt = lo * 0.98;
      next = advance(rings, vels, dt);
      split = true;
    }
    if (dt > 1e-5) {
      for (let r = 0; r < rings.length; r++) {
        const R = rings[r], Q = next[r], n = R.x.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          face(R.x[i], R.z[i], R.x[j], R.z[j], Q.x[j], Q.z[j], Q.x[i], Q.z[i], edges[R.e[i]], y0 + k * t, y0 + k * (t + dt), t, t + dt);
        }
      }
    }
    t += dt;
    const c = collapse(next, signs);
    rings = c.rings; signs = c.signs;
    if (split || t >= tMax - 1e-5) break;
  }
  return { rings, signs, t };
}

// ------------------------------------------------------------------------------------------------------------------
// Emission
// ------------------------------------------------------------------------------------------------------------------

/** Writes one triangle with a fixed normal, flipping the winding so the geometric normal agrees with it. */
function tri(out, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, rgb, uvA, uvB, uvC) {
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
  const g2 = gx * gx + gy * gy + gz * gz;
  if (g2 < 1e-8) return;
  if (gx * nx + gy * ny + gz * nz < 0) {
    let t;
    t = bx; bx = cx; cx = t; t = by; by = cy; cy = t; t = bz; bz = cz; cz = t; t = uvB; uvB = uvC; uvC = t;
  }
  out.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  for (let i = 0; i < 3; i++) {
    out.norm.push(nx, ny, nz);
    out.col.push(rgb[0], rgb[1], rgb[2]);
  }
  if (out.uv) {
    if (uvA) out.uv.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    else out.uv.push(-10, -10, -10, -10, -10, -10);
  }
}

function quad(out, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, rgb) {
  tri(out, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, rgb, null);
  tri(out, ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz, rgb, null);
}

/** Axis-aligned-in-plan oriented box (rotated by the unit axis ux,uz) — chimneys, dormer cheeks, pool coping. */
export function orientedBox(out, cx, y0, cz, ux, uz, hl, hw, h, rgb, top = true, back = true) {
  const vx = -uz, vz = ux;
  const P = (a, b) => [cx + ux * a + vx * b, cz + uz * a + vz * b];
  const c = [P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)];
  const y1 = y0 + h;
  const sides = [[0, 1, -vx, -vz, 0.9], [1, 2, ux, uz, 0.95], [2, 3, vx, vz, 1.0], [3, 0, -ux, -uz, 0.86]];
  for (const [i, j, nx, nz, s] of sides) {
    if (!back && i === 2) continue;
    const col = [rgb[0] * s, rgb[1] * s, rgb[2] * s];
    quad(out, c[i][0], y0, c[i][1], c[j][0], y0, c[j][1], c[j][0], y1, c[j][1], c[i][0], y1, c[i][1], nx, 0, nz, col);
  }
  if (top) quad(out, c[0][0], y1, c[0][1], c[1][0], y1, c[1][1], c[2][0], y1, c[2][1], c[3][0], y1, c[3][1], 0, 1, 0, [Math.min(1, rgb[0] * 1.05), Math.min(1, rgb[1] * 1.05), Math.min(1, rgb[2] * 1.05)]);
}

const _tmpV2 = [];
function capRings(out, rings, y, rgb, mat) {
  if (!rings.length) return;
  const toV = (R, rev) => {
    const a = [];
    for (let i = 0; i < R.x.length; i++) a.push(new THREE.Vector2(R.x[i], R.z[i]));
    if (rev) a.reverse();
    return a;
  };
  const outer = toV(rings[0], false);
  const holes = rings.slice(1).map((R) => toV(R, false));
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(outer, holes);
  } catch (e) {
    return;
  }
  const all = outer.concat(...holes);
  let minX = Infinity, minZ = Infinity;
  for (const p of all) { if (p.x < minX) minX = p.x; if (p.y < minZ) minZ = p.y; }
  const uvOf = (p) => [mat * 1000 + UV_BASE + (p.x - minX), -20 - (p.y - minZ)];
  for (const [a, b, c] of tris) {
    const A = all[a], B = all[b], C = all[c];
    tri(out, A.x, y, A.y, B.x, y, B.y, C.x, y, C.y, 0, 1, 0, rgb, uvOf(A), uvOf(B), uvOf(C));
  }
  _tmpV2.length = 0;
}

/**
 * Emits a pitched (hip / gable) or mansard roof over a building whose walls stop at yEave.
 * ring: CCW flat footprint (the wall line), holes: CW-or-any rings (only the mansard uses them).
 * opts: { wallRgb, soffit (bool), lod: 'full'|'cheap', detail (chimney/dormer sink or null), seed }
 * Returns { ridgeY } or null when nothing was emitted (caller then emits its flat roof).
 */
export function emitRoof(out, ring, holes, plan, yEave, opts = {}) {
  const outer0 = cleanRing(ring, true);
  if (!outer0) return null;
  let outer = outer0.length / 2 > 14 ? cleanRing(simplifyRing(outer0, 0.35), true) || outer0 : outer0;
  if (outer.length / 2 > 40) return null;
  const wallRgb = opts.wallRgb || [0.8, 0.78, 0.74];
  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;

  if (plan.shape === 'mansard') return emitMansard(out, outer, holes, plan, yEave, opts);
  if ((holes || []).some((h) => h && h.length >= 6)) return emitCourtyardHip(out, outer, holes, plan, yEave);

  const obb = plan.obb;
  const gable = plan.shape === 'gable';
  const k = plan.k;
  const e = plan.eave;
  const lenHalf = obb ? obb.len * 0.5 : 0;
  // gable ends: edges across the long axis at its two extremes
  const isGableEdge = (ux, uz, x1, z1, x2, z2) => {
    if (!gable || !obb) return false;
    if (Math.abs(ux * obb.ax + uz * obb.az) > 0.35) return false;
    const mx = (x1 + x2) * 0.5 - obb.cx, mz = (z1 + z2) * 0.5 - obb.cz;
    const a = mx * obb.ax + mz * obb.az;
    return Math.abs(a) > lenHalf - 1.4;
  };

  // 1. eave ring: wall ring pushed out by the overhang (gable ends stay flush)
  const wallEdges = [];
  const wallRing = makeRing(outer, wallEdges, (i, ux, uz, x1, z1, x2, z2) => (isGableEdge(ux, uz, x1, z1, x2, z2) ? 0 : 1));
  const v = velocities(wallRing, wallEdges, []);
  const eaveFlat = [];
  for (let i = 0; i < wallRing.x.length; i++) eaveFlat.push(wallRing.x[i] - v[i * 2] * e, wallRing.z[i] - v[i * 2 + 1] * e);
  // the overhang must not fold back on itself (very short edges between acute corners)
  let eaveOk = ringArea2(eaveFlat) > ringArea2(outer);
  const testR = [{ x: [], z: [], e: [] }];
  for (let i = 0; i < eaveFlat.length; i += 2) { testR[0].x.push(eaveFlat[i]); testR[0].z.push(eaveFlat[i + 1]); }
  if (eaveOk && !ringsValid(testR, [1])) eaveOk = false;
  const eaveUse = eaveOk ? eaveFlat : outer;
  const eUse = eaveOk ? e : 0;
  const yStart = yEave - eUse * k;

  // 2. skeleton faces
  const edges = [];
  const R0 = makeRing(eaveUse, edges, (i) => wallEdges[i].w);
  const sq = (w) => Math.sqrt(w * w + k * k);
  const gableRgb = [wallRgb[0] * 0.97, wallRgb[1] * 0.97, wallRgb[2] * 0.97];
  const face = (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    if (E.w < 1e-3) {
      // vertical gable wall
      tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, -E.nx, 0, -E.nz, gableRgb, null);
      tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, -E.nx, 0, -E.nz, gableRgb, null);
      return;
    }
    const s = k / E.w;
    let nx = -s * E.nx, ny = 1, nz = -s * E.nz;
    const L = Math.hypot(nx, ny, nz);
    nx /= L; ny /= L; nz /= L;
    const f = sq(E.w);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    const A = U(ax, az, t0), B = U(bx, bz, t0), B2 = U(b2x, b2z, t1), A2 = U(a2x, a2z, t1);
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, rgb, A, B, B2);
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, rgb, A, B2, A2);
  };
  const tMax = Math.max(0.2, (plan.maxRise + eUse * k) / k);
  const res = inset([R0], [1], edges, k, yStart, tMax, face);
  const topY = yStart + k * res.t;
  if (res.rings.length) capRings(out, res.rings, topY, [rgb[0] * 1.02, rgb[1] * 1.02, rgb[2] * 1.02], mat);

  // 3. fascia + soffit under the overhang
  if (eUse > 0.05 && opts.soffit !== false) {
    const trim = plan.trim || [wallRgb[0] * 0.92, wallRgb[1] * 0.92, wallRgb[2] * 0.92];
    const fh = full ? 0.2 : 0.0;
    const n = wallRing.x.length;
    for (let i = 0; i < n; i++) {
      if (wallEdges[i].w < 1e-3) continue;
      const j = (i + 1) % n;
      const ax = wallRing.x[i], az = wallRing.z[i], bx = wallRing.x[j], bz = wallRing.z[j];
      const ex = eaveUse[i * 2], ez = eaveUse[i * 2 + 1], fx = eaveUse[j * 2], fz = eaveUse[j * 2 + 1];
      const ys = yStart - fh;
      quad(out, ax, ys, az, bx, ys, bz, fx, ys, fz, ex, ys, ez, 0, -1, 0, [trim[0] * 0.8, trim[1] * 0.8, trim[2] * 0.8]);
      if (fh > 0) {
        const E = wallEdges[i];
        quad(out, ex, ys, ez, fx, ys, fz, fx, yStart, fz, ex, yStart, ez, -E.nx, 0, -E.nz, trim);
      }
    }
  }

  // 4. chimney (detail LOD)
  if (plan.chimney && opts.detail && obb && full) {
    const r = rnd(opts.seed || 1, 53);
    const side = r < 0.5 ? -1 : 1;
    const a = side * (obb.len * 0.5 - 1.2 - rnd(opts.seed || 1, 59) * Math.max(0, obb.len * 0.25));
    const b = (rnd(opts.seed || 1, 61) - 0.5) * obb.wid * 0.3;
    const cx = obb.cx + obb.ax * a - obb.az * b, cz = obb.cz + obb.az * a + obb.ax * b;
    const dist = Math.max(0, obb.wid * 0.5 - Math.abs(b));
    const yBase = yEave + Math.min(plan.maxRise, dist * k) - 0.6;
    const brick = opts.chimneyRgb || [0.52, 0.30, 0.24];
    const hTop = Math.max(topY + 0.7, yBase + 1.3);
    orientedBox(opts.detail, cx, yBase, cz, obb.ax, obb.az, 0.42, 0.32, hTop - yBase, brick);
    orientedBox(opts.detail, cx, hTop, cz, obb.ax, obb.az, 0.5, 0.4, 0.14, [0.6, 0.6, 0.58]);
  }
  return { ridgeY: topY };
}

/** Courtyard blocks: every ring (outer and courtyards) hips inward together; what is left between them is capped. */
function emitCourtyardHip(out, outer, holes, plan, yEave) {
  const edges = [];
  const rings = [makeRing(outer, edges, () => 1)];
  const signs = [1];
  for (const h of holes) {
    const c = cleanRing(h, false);
    if (c && c.length / 2 <= 40) { rings.push(makeRing(c, edges, () => 1)); signs.push(-1); }
  }
  const k = plan.k, rgb = plan.rgb, mat = plan.mat;
  const face = (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    let nx = -k * E.nx, ny = 1, nz = -k * E.nz;
    const L = Math.hypot(nx, ny, nz);
    nx /= L; ny /= L; nz /= L;
    const f = Math.sqrt(1 + k * k);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, rgb, U(ax, az, t0), U(bx, bz, t0), U(b2x, b2z, t1));
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, rgb, U(ax, az, t0), U(b2x, b2z, t1), U(a2x, a2z, t1));
  };
  const res = inset(rings, signs, edges, k, yEave, Math.max(0.5, plan.maxRise / k), face);
  const topY = yEave + k * res.t;
  if (res.rings.length && res.signs[0] === 1) capRings(out, res.rings, topY, [rgb[0] * 1.02, rgb[1] * 1.02, rgb[2] * 1.02], mat);
  return { ridgeY: topY };
}

function emitMansard(out, outer, holes, plan, yEave, opts) {
  const edges = [];
  const rings = [makeRing(outer, edges, () => 1)];
  const signs = [1];
  for (const h of holes || []) {
    const c = cleanRing(h, false);
    if (c && c.length / 2 <= 40) { rings.push(makeRing(c, edges, () => 1)); signs.push(-1); }
  }
  const lower = plan.rgb;
  const upper = [Math.min(1, lower[0] * 1.12), Math.min(1, lower[1] * 1.12), Math.min(1, lower[2] * 1.12)];
  const mkFace = (k, rgb, mat) => (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    let nx = -k * E.nx, ny = 1, nz = -k * E.nz;
    const L = Math.hypot(nx, ny, nz);
    nx /= L; ny /= L; nz /= L;
    const f = Math.sqrt(1 + k * k);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, rgb, U(ax, az, t0), U(bx, bz, t0), U(b2x, b2z, t1));
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, rgb, U(ax, az, t0), U(b2x, b2z, t1), U(a2x, a2z, t1));
  };
  // steep lower slope (~66 deg, 3 m) then a shallow upper slope, then the zinc flat
  const k1 = plan.k, d1 = 3.0 / k1;
  const s1 = inset(rings, signs, edges, k1, yEave, d1, mkFace(k1, lower, RM.slate));
  const y1 = yEave + k1 * s1.t;
  let top = s1, yTop = y1;
  if (s1.rings.length) {
    const k2 = 0.32;
    const s2 = inset(s1.rings, s1.signs, edges, k2, y1, 3.2, mkFace(k2, upper, RM.zinc));
    top = s2; yTop = y1 + k2 * s2.t;
  }
  if (top.rings.length) capRings(out, top.rings, yTop, [upper[0] * 0.95, upper[1] * 0.95, upper[2] * 0.95], RM.zinc);

  // dormers on the steep slope + chimney stacks (detail LOD)
  if (opts.detail && opts.lod !== 'cheap') {
    const det = opts.detail;
    const R = rings[0];
    const n = R.x.length;
    const dRgb = [0.86, 0.84, 0.8];
    let budget = 7;
    for (let i = 0; i < n && budget > 0; i++) {
      const E = edges[R.e[i]];
      const j = (i + 1) % n;
      const L = Math.hypot(R.x[j] - R.x[i], R.z[j] - R.z[i]);
      if (L < 7) continue;
      const cnt = Math.min(budget, Math.floor((L - 2) / 4.4));
      for (let c = 0; c < cnt; c++) {
        const a = (L - (cnt - 1) * 4.4) * 0.5 + c * 4.4;
        const px = R.x[i] + E.ux * a + E.nx * 0.55, pz = R.z[i] + E.uz * a + E.nz * 0.55;
        // dormer: stone cheek box with a small pitched cap, face flush with the slope foot
        orientedBox(det, px, yEave + 0.4, pz, E.ux, E.uz, 0.65, 0.55, 1.75, dRgb, false, false);
        const cap = [lower[0] * 0.9, lower[1] * 0.9, lower[2] * 0.9];
        const hx = E.ux * 0.8, hz = E.uz * 0.8;
        const y0 = yEave + 2.15, yR = y0 + 0.55;
        const fx = E.nx * -0.62, fz = E.nz * -0.62; // outward
        const bx = E.nx * 0.62, bz = E.nz * 0.62;
        // two cap planes (ridge runs perpendicular to the facade)
        quad(det, px - hx + fx, y0, pz - hz + fz, px + fx, yR, pz + fz, px + bx, yR, pz + bz, px - hx + bx, y0, pz - hz + bz,
          -E.ux * 0.6, 0.8, -E.uz * 0.6, cap);
        quad(det, px + hx + fx, y0, pz + hz + fz, px + fx, yR, pz + fz, px + bx, yR, pz + bz, px + hx + bx, y0, pz + hz + bz,
          E.ux * 0.6, 0.8, E.uz * 0.6, cap);
        // dark glazing on the dormer face
        const gx = px - E.nx * 0.56, gz = pz - E.nz * 0.56;
        quad(det, gx - E.ux * 0.38, yEave + 0.75, gz - E.uz * 0.38, gx + E.ux * 0.38, yEave + 0.75, gz + E.uz * 0.38,
          gx + E.ux * 0.38, yEave + 1.95, gz + E.uz * 0.38, gx - E.ux * 0.38, yEave + 1.95, gz - E.uz * 0.38,
          -E.nx, 0, -E.nz, [0.16, 0.19, 0.23]);
        budget--;
      }
    }
    // chimney stacks along the party walls
    if (plan.chimney && plan.obb) {
      const o = plan.obb;
      for (let c = 0; c < 2; c++) {
        const a = (c === 0 ? -1 : 1) * (o.len * 0.5 - 2.5);
        const cx = o.cx + o.ax * a, cz = o.cz + o.az * a;
        orientedBox(det, cx, yTop - 0.2, cz, o.az, -o.ax, 1.6, 0.4, 1.5, [0.74, 0.66, 0.56]);
        orientedBox(det, cx, yTop + 1.3, cz, o.az, -o.ax, 1.2, 0.14, 0.45, [0.62, 0.36, 0.28], true, true); // pot row
      }
    }
  }
  return { ridgeY: yTop };
}

// ------------------------------------------------------------------------------------------------------------------
// Suburban yards: driveways, fences / hedges / garden walls, backyard pools
// ------------------------------------------------------------------------------------------------------------------

const YARD_REGIONS = { us: 1, la: 1, sf: 0.3, nyc: 0.5, uk: 1, eu: 1, nordic: 1, med: 0.6, latam: 0.6, mideast: 0.6,
  japan: 0.6, global: 0.8, seasia: 0.5, paris: 0.6 };

/**
 * houses: [{ ring (CCW flat), cx, cz, obb, region, seed, yBase }] — small pitched-roof residential footprints.
 * others: [{ minX, maxX, minZ, maxZ, ring }] every footprint in the chunk (for neighbour clearance).
 * roads: chunk-local road segments { x1, z1, x2, z2, tx, tz, isFootway, hw }.
 * pools: mapped swimming-pool rings (flat). getY(x, z): terrain. sinkFor(x, z) -> detail buffers.
 */
export function buildYards(houses, others, roads, pools, getY, sinkFor) {
  if (!houses.length) return;
  // spatial hash of footprints (25 m cells)
  const CELL = 25, grid = new Map();
  const key = (i, j) => i * 4096 + j;
  for (let o = 0; o < others.length; o++) {
    const b = others[o];
    for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++) {
      for (let j = Math.floor(b.minZ / CELL); j <= Math.floor(b.maxZ / CELL); j++) {
        const k = key(i, j);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(o);
      }
    }
  }
  const roadGrid = new Map();
  for (let r = 0; r < roads.length; r++) {
    const s = roads[r];
    if (s.isFootway) continue;
    const i0 = Math.floor(Math.min(s.x1, s.x2) / CELL) - 1, i1 = Math.floor(Math.max(s.x1, s.x2) / CELL) + 1;
    const j0 = Math.floor(Math.min(s.z1, s.z2) / CELL) - 1, j1 = Math.floor(Math.max(s.z1, s.z2) / CELL) + 1;
    if ((i1 - i0) * (j1 - j0) > 400) continue;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let a = roadGrid.get(k);
        if (!a) roadGrid.set(k, (a = []));
        a.push(r);
      }
    }
  }
  const poolBoxes = [];
  for (const p of pools || []) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]);
    }
    poolBoxes.push([x0, x1, z0, z1]);
  }

  const nearRoad = (x, z, pad) => {
    const a = roadGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!a) return false;
    for (const r of a) {
      const s = roads[r];
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L2 = dx * dx + dz * dz;
      if (L2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / L2));
      if (Math.hypot(x - s.x1 - dx * t, z - s.z1 - dz * t) < (s.hw || 4) + pad) return true;
    }
    return false;
  };
  const seenFence = new Set();
  for (const h of houses) {
    const wantYard = YARD_REGIONS[h.region] ?? 0.7;
    if (rnd(h.seed, 101) > wantYard) continue;
    const ci = Math.floor(h.cx / CELL), cj = Math.floor(h.cz / CELL);
    // nearest drivable road -> the front of the lot
    let best = null, bestD = 42;
    for (let i = ci - 2; i <= ci + 2; i++) {
      for (let j = cj - 2; j <= cj + 2; j++) {
        const a = roadGrid.get(key(i, j));
        if (!a) continue;
        for (const r of a) {
          const s = roads[r];
          const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L2 = dx * dx + dz * dz;
          if (L2 < 1e-6) continue;
          const t = Math.max(0, Math.min(1, ((h.cx - s.x1) * dx + (h.cz - s.z1) * dz) / L2));
          const px = s.x1 + dx * t, pz = s.z1 + dz * t;
          const d = Math.hypot(h.cx - px, h.cz - pz);
          if (d < bestD) { bestD = d; best = { s, px, pz }; }
        }
      }
    }
    if (!best || bestD < 4) continue;
    // lot frame: f points from the house to the road, a along the road
    let fx = (best.px - h.cx) / bestD, fz = (best.pz - h.cz) / bestD;
    const ax = -fz, az = fx;
    const proj = (x, z) => [(x - h.cx) * ax + (z - h.cz) * az, (x - h.cx) * fx + (z - h.cz) * fz];
    let a0 = Infinity, a1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (let i = 0; i < h.ring.length; i += 2) {
      const [a, f] = proj(h.ring[i], h.ring[i + 1]);
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); f0 = Math.min(f0, f); f1 = Math.max(f1, f);
    }
    const roadHalf = (best.s.hw || 4) + 1.6;
    const front = bestD - roadHalf; // lot front line (back of sidewalk)
    if (front - f1 < 2.0) continue; // house sits on the sidewalk: no front yard / driveway
    let sideL = 4.0, sideR = 4.0, back = 11.0;
    // neighbour clearance
    for (let i = ci - 2; i <= ci + 2; i++) {
      for (let j = cj - 2; j <= cj + 2; j++) {
        const a = grid.get(key(i, j));
        if (!a) continue;
        for (const o of a) {
          const b = others[o];
          if (b.self === h.id) continue;
          if (b.maxX < h.cx - 40 || b.minX > h.cx + 40 || b.maxZ < h.cz - 40 || b.minZ > h.cz + 40) continue;
          let na0 = Infinity, na1 = -Infinity, nf0 = Infinity, nf1 = -Infinity;
          for (let q = 0; q < b.ring.length; q += 2) {
            const [pa, pf] = proj(b.ring[q], b.ring[q + 1]);
            na0 = Math.min(na0, pa); na1 = Math.max(na1, pa); nf0 = Math.min(nf0, pf); nf1 = Math.max(nf1, pf);
          }
          const overF = nf1 > f0 - back && nf0 < front;
          const overA = na1 > a0 && na0 < a1;
          if (overF && na0 >= a1 - 0.5) sideR = Math.min(sideR, Math.max(0, (na0 - a1) * 0.5));
          else if (overF && na1 <= a0 + 0.5) sideL = Math.min(sideL, Math.max(0, (a0 - na1) * 0.5));
          else if (overA && nf1 <= f0 + 0.5) back = Math.min(back, Math.max(0, (f0 - nf1) * 0.5));
          else if (overA && nf0 >= f1 - 0.5 && nf0 < front) {
            // something between house and road (garage, porch): no driveway through it
            h.blocked = true;
          }
        }
      }
    }
    const lotA0 = a0 - sideL, lotA1 = a1 + sideR, lotB = f0 - back;
    const W = (a, f) => [h.cx + ax * a + fx * f, h.cz + az * a + fz * f];
    const sink = sinkFor(h.cx, h.cz);
    const region = h.region;
    const wall = region === 'la' || region === 'latam' || region === 'mideast' || region === 'med';
    const hedge = region === 'uk' || region === 'eu' || region === 'nordic' || region === 'paris' || region === 'japan';

    // driveway: concrete strip from the front wall to the curb on one side of the house
    let driveSide = 0;
    if (!h.blocked && rnd(h.seed, 103) < (region === 'us' || region === 'la' ? 0.92 : 0.6)) {
      driveSide = rnd(h.seed, 107) < 0.5 ? -1 : 1;
      const halfW = 1.55;
      const ac = driveSide < 0 ? a0 + halfW + 0.3 : a1 - halfW - 0.3;
      const fA = f1 - 0.4, fB = bestD - (best.s.hw || 4) + 0.2;
      const steps = Math.max(1, Math.ceil((fB - fA) / 6));
      const dRgb = region === 'uk' || region === 'eu' ? [0.46, 0.44, 0.42] : [0.66, 0.65, 0.62];
      for (let s = 0; s < steps; s++) {
        const fa = fA + ((fB - fA) * s) / steps, fb = fA + ((fB - fA) * (s + 1)) / steps;
        const p1 = W(ac - halfW, fa), p2 = W(ac + halfW, fa), p3 = W(ac + halfW, fb), p4 = W(ac - halfW, fb);
        const y1 = getY(p1[0], p1[1]) + 0.13, y2 = getY(p2[0], p2[1]) + 0.13, y3 = getY(p3[0], p3[1]) + 0.13, y4 = getY(p4[0], p4[1]) + 0.13;
        quad(sink, p1[0], y1, p1[1], p2[0], y2, p2[1], p3[0], y3, p3[1], p4[0], y4, p4[1], 0, 1, 0, dRgb);
      }
    }

    // front stone/concrete walkway path from the house front entrance out to the street lot line + foundation flowerbed planters
    if (!h.blocked && front - f1 >= 2.1 && a1 - a0 >= 4.2) {
      const walkA = (a0 + a1) * 0.5 - driveSide * Math.min(1.15, (a1 - a0) * 0.15);
      const walkHalfW = 0.58;
      const wfA = f1 - 0.15, wfB = front + 0.12;
      const wSteps = Math.max(1, Math.ceil((wfB - wfA) / 5));
      const walkRgb = [0.75, 0.72, 0.67];
      for (let s = 0; s < wSteps; s++) {
        const fa = wfA + ((wfB - wfA) * s) / wSteps, fb = wfA + ((wfB - wfA) * (s + 1)) / wSteps;
        const p1 = W(walkA - walkHalfW, fa), p2 = W(walkA + walkHalfW, fa), p3 = W(walkA + walkHalfW, fb), p4 = W(walkA - walkHalfW, fb);
        const y1 = getY(p1[0], p1[1]) + 0.135, y2 = getY(p2[0], p2[1]) + 0.135, y3 = getY(p3[0], p3[1]) + 0.135, y4 = getY(p4[0], p4[1]) + 0.135;
        quad(sink, p1[0], y1, p1[1], p2[0], y2, p2[1], p3[0], y3, p3[1], p4[0], y4, p4[1], 0, 1, 0, walkRgb);
      }
      // Foundation flowerbed / blooming shrub planters flanking the front wall
      const shrubRgb = [0.16, 0.36, 0.15];
      const flowerPick = Math.floor(rnd(h.seed, 131) * 3);
      const bloomRgb = flowerPick === 0 ? [0.86, 0.32, 0.42] : flowerPick === 1 ? [0.64, 0.44, 0.82] : [0.92, 0.72, 0.22];
      const bedSpans = [
        [driveSide < 0 ? a0 + 3.5 : a0 + 0.45, walkA - walkHalfW - 0.25],
        [walkA + walkHalfW + 0.25, driveSide > 0 ? a1 - 3.5 : a1 - 0.45],
      ];
      for (let bIdx = 0; bIdx < bedSpans.length; bIdx++) {
        const [ba0, ba1] = bedSpans[bIdx];
        const bLen = (ba1 - ba0) * 0.5;
        if (bLen < 0.55) continue;
        const bcA = (ba0 + ba1) * 0.5;
        const [bx, bz] = W(bcA, f1 + 0.48);
        const by = getY(bx, bz);
        orientedBox(sink, bx, by + 0.04, bz, ax, az, bLen, 0.42, 0.52, shrubRgb);
        orientedBox(sink, bx, by + 0.56, bz, ax, az, Math.max(0.35, bLen - 0.08), 0.34, 0.12, bloomRgb);
      }
    }

    // back + side boundaries (front yards stay open in the US; a low wall / hedge elsewhere)
    const fenceRgb = wall
      ? [0.82, 0.77, 0.68]
      : hedge
        ? [0.17, 0.30, 0.13]
        : rnd(h.seed, 109) < 0.7 ? [0.50, 0.38, 0.27] : [0.60, 0.52, 0.42];
    const fH = hedge ? 1.4 : wall ? 1.8 : 1.8;
    const segs = [];
    if (back > 1.2) segs.push([lotA0, lotB, lotA1, lotB]);
    const fEnd = Math.min(front, f1 + 0.5) - 0.8;
    if (sideL > 0.6) segs.push([lotA0, lotB, lotA0, fEnd]);
    if (sideR > 0.6) segs.push([lotA1, lotB, lotA1, fEnd]);
    if (region !== 'us' && region !== 'la' && region !== 'sf' && front - f1 > 3) segs.push([lotA0, front - 0.4, lotA1, front - 0.4, 0.9]);
    for (const sg of segs) {
      const [sa0, sf0, sa1, sf1, hOverride] = sg;
      const P = W(sa0, sf0), Q = W(sa1, sf1);
      const fk = `${Math.round((P[0] + Q[0]) * 0.5)},${Math.round((P[1] + Q[1]) * 0.5)}`; // neighbours share boundaries
      if (seenFence.has(fk)) continue;
      seenFence.add(fk);
      const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      if (L < 1) continue;
      if (!hOverride && nearRoad((P[0] + Q[0]) * 0.5, (P[1] + Q[1]) * 0.5, 3.5)) continue; // corner lot: side street stays open
      const n = Math.max(1, Math.ceil(L / 7));
      const ux = (Q[0] - P[0]) / L, uz = (Q[1] - P[1]) / L;
      const hh = hOverride || fH;
      for (let s = 0; s < n; s++) {
        const x1 = P[0] + (Q[0] - P[0]) * (s / n), z1 = P[1] + (Q[1] - P[1]) * (s / n);
        const x2 = P[0] + (Q[0] - P[0]) * ((s + 1) / n), z2 = P[1] + (Q[1] - P[1]) * ((s + 1) / n);
        const y1 = getY(x1, z1) - 0.1, y2 = getY(x2, z2) - 0.1;
        if (hedge) {
          // hedge: rounded-ish box (two sloped sides + top)
          const ox = -uz * 0.45, oz = ux * 0.45;
          const c = fenceRgb, cTop = [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15];
          quad(sink, x1 + ox, y1, z1 + oz, x2 + ox, y2, z2 + oz, x2 + ox * 0.6, y2 + hh, z2 + oz * 0.6, x1 + ox * 0.6, y1 + hh, z1 + oz * 0.6, -uz, 0.25, ux, c);
          quad(sink, x1 - ox, y1, z1 - oz, x2 - ox, y2, z2 - oz, x2 - ox * 0.6, y2 + hh, z2 - oz * 0.6, x1 - ox * 0.6, y1 + hh, z1 - oz * 0.6, uz, 0.25, -ux, c);
          quad(sink, x1 + ox * 0.6, y1 + hh, z1 + oz * 0.6, x2 + ox * 0.6, y2 + hh, z2 + oz * 0.6, x2 - ox * 0.6, y2 + hh, z2 - oz * 0.6, x1 - ox * 0.6, y1 + hh, z1 - oz * 0.6, 0, 1, 0, cTop);
        } else {
          if (wall) quad(sink, x1, y1, z1, x2, y2, z2, x2, y2 + hh, z2, x1, y1 + hh, z1, -uz, 0, ux, fenceRgb);
          else {
            const s0 = (s * L) / n, s1 = ((s + 1) * L) / n; // wooden privacy fence: plank pattern (shader mat 10)
            const U = (sv, tv) => [RM.fence * 1000 + UV_BASE + sv, -20 - tv];
            tri(sink, x1, y1, z1, x2, y2, z2, x2, y2 + hh, z2, -uz, 0, ux, fenceRgb, U(s0, 0), U(s1, 0), U(s1, hh));
            tri(sink, x1, y1, z1, x2, y2 + hh, z2, x1, y1 + hh, z1, -uz, 0, ux, fenceRgb, U(s0, 0), U(s1, hh), U(s0, hh));
          }
          if (wall) {
            const ox = -uz * 0.1, oz = ux * 0.1;
            quad(sink, x1 - ox, y1 + hh, z1 - oz, x2 - ox, y2 + hh, z2 - oz, x2 + ox, y2 + hh + 0.06, z2 + oz, x1 + ox, y1 + hh + 0.06, z1 + oz, 0, 1, 0, [0.9, 0.86, 0.78]);
          }
        }
      }
    }

    // backyard pool (warm regions, room behind the house, no mapped pool on the lot)
    const warm = region === 'la' ? 0.42 : (region === 'us' && h.warm) ? 0.22 : region === 'mideast' ? 0.35 : region === 'med' || region === 'latam' ? 0.12 : 0;
    if (warm > 0 && back > 7.5 && lotA1 - lotA0 > 9 && rnd(h.seed, 113) < warm) {
      const pl = Math.min(9, (lotA1 - lotA0) - 4) * 0.5, pw = Math.min(2.4, (back - 4) * 0.5);
      if (pl > 2.2 && pw > 1.4) {
        const pa = (lotA0 + lotA1) * 0.5 + (rnd(h.seed, 127) - 0.5) * Math.max(0, (lotA1 - lotA0) - 2 * pl - 3);
        const pf = f0 - 2.0 - pw;
        const [pcx, pcz] = W(pa, pf);
        let mapped = false;
        for (const bx of poolBoxes) {
          if (bx[1] > h.cx - 25 && bx[0] < h.cx + 25 && bx[3] > h.cz - 25 && bx[2] < h.cz + 25) { mapped = true; break; }
        }
        if (!mapped) {
          const y = getY(pcx, pcz);
          const c = [0.86, 0.84, 0.8];
          const corner = (sa, sb, m) => W(pa + sa * (pl + m), pf + sb * (pw + m));
          const q1 = corner(-1, -1, 0.5), q2 = corner(1, -1, 0.5), q3 = corner(1, 1, 0.5), q4 = corner(-1, 1, 0.5);
          quad(sink, q1[0], y + 0.16, q1[1], q2[0], y + 0.16, q2[1], q3[0], y + 0.16, q3[1], q4[0], y + 0.16, q4[1], 0, 1, 0, c);
          const w1 = corner(-1, -1, 0), w2 = corner(1, -1, 0), w3 = corner(1, 1, 0), w4 = corner(-1, 1, 0);
          const wUv = (p) => [RM.water * 1000 + UV_BASE + (p[0] - pcx), -20 - (p[1] - pcz)];
          const wc = [0.12, 0.62, 0.74];
          tri(sink, w1[0], y + 0.19, w1[1], w2[0], y + 0.19, w2[1], w3[0], y + 0.19, w3[1], 0, 1, 0, wc, wUv(w1), wUv(w2), wUv(w3));
          tri(sink, w1[0], y + 0.19, w1[1], w3[0], y + 0.19, w3[1], w4[0], y + 0.19, w4[1], 0, 1, 0, wc, wUv(w1), wUv(w3), wUv(w4));

          // Poolside wooden lounge deck + patio sun umbrella
          const deckHl = Math.min(pl * 0.78, 2.35), deckHw = 0.82;
          const deckF = pf + pw + 0.5 + deckHw + 0.08;
          const [dcx, dcz] = W(pa, deckF);
          orientedBox(sink, dcx, y + 0.04, dcz, ax, az, deckHl, deckHw, 0.14, [0.58, 0.40, 0.25]);
          // Patio sun umbrella (pole + 4-sloped colorful pyramid canopy)
          const [ucx, ucz] = W(pa, deckF);
          orientedBox(sink, ucx, y + 0.18, ucz, ax, az, 0.06, 0.06, 1.95, [0.22, 0.21, 0.20]);
          const uPick = Math.floor(rnd(h.seed, 139) * 3);
          const uRgb = uPick === 0 ? [0.88, 0.30, 0.24] : uPick === 1 ? [0.20, 0.56, 0.84] : [0.94, 0.74, 0.20];
          const uR = 1.18, yE = y + 2.05, yP = y + 2.44;
          const u1 = W(pa - uR, deckF - uR), u2 = W(pa + uR, deckF - uR), u3 = W(pa + uR, deckF + uR), u4 = W(pa - uR, deckF + uR);
          tri(sink, u1[0], yE, u1[1], u2[0], yE, u2[1], ucx, yP, ucz, -fx * 0.3, 0.95, -fz * 0.3, uRgb, null);
          tri(sink, u2[0], yE, u2[1], u3[0], yE, u3[1], ucx, yP, ucz, ax * 0.3, 0.95, az * 0.3, uRgb, null);
          tri(sink, u3[0], yE, u3[1], u4[0], yE, u4[1], ucx, yP, ucz, fx * 0.3, 0.95, fz * 0.3, uRgb, null);
          tri(sink, u4[0], yE, u4[1], u1[0], yE, u1[1], ucx, yP, ucz, -ax * 0.3, 0.95, -az * 0.3, uRgb, null);
        }
      }
    }
  }
}
