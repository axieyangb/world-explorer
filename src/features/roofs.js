import * as THREE from '../../vendor/three.module.js';

/**
 * [roofs] Pitched / mansard / swept East Asian / crow-stepped gable / gambrel / barrel-vault / pyramidal roofs,
 * ornate dormers, brick/stone chimneys, ridge cresting, and suburban backyard structures (worker side, used by
 * the WFC building emitter, the infill blocks and the suburban yard pass in chunk_builder.js).
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
  if (box(37.70, 37.84, -122.53, -122.35)) return 'sf'; // San Francisco city proper
  if (box(32.4, 38.6, -123.0, -114.0) || box(31.0, 37.5, -115.0, -104.0)) return 'la'; // California + Southwest
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
  us: { p: 0.96, hMax: 12, aMax: 480, gable: 0.55, k: [0.36, 0.55], eave: 0.55 },
  la: { p: 0.95, hMax: 11, aMax: 480, gable: 0.35, k: [0.30, 0.42], eave: 0.6 },
  sf: { p: 0.88, hMax: 13.5, aMax: 360, gable: 0.85, k: [0.55, 0.85], eave: 0.3 },
  nyc: { p: 0.75, hMax: 10, aMax: 300, gable: 0.7, k: [0.45, 0.65], eave: 0.4 },
  uk: { p: 0.95, hMax: 15, aMax: 1400, gable: 0.7, k: [0.62, 0.8], eave: 0.25 },
  paris: { p: 0.85, hMax: 11, aMax: 600, gable: 0.6, k: [0.7, 0.95], eave: 0.3 },
  eu: { p: 0.85, hMax: 17, aMax: 1600, gable: 0.7, k: [0.7, 1.0], eave: 0.5 },
  centralEu: { p: 0.88, hMax: 18, aMax: 1600, gable: 0.72, k: [0.72, 1.02], eave: 0.48 },
  eastEu: { p: 0.82, hMax: 16, aMax: 1400, gable: 0.68, k: [0.65, 0.95], eave: 0.45 },
  med: { p: 0.85, hMax: 32, aMax: 7000, gable: 0.3, k: [0.3, 0.4], eave: 0.45 },
  nordic: { p: 0.95, hMax: 16, aMax: 1400, gable: 0.8, k: [0.55, 0.8], eave: 0.45 },
  latam: { p: 0.55, hMax: 9, aMax: 320, gable: 0.4, k: [0.3, 0.4], eave: 0.4 },
  mideast: { p: 0.03, hMax: 8, aMax: 300, gable: 0.5, k: [0.3, 0.4], eave: 0.3 },
  beijing: { p: 0.36, hMax: 11, aMax: 520, gable: 0.55, k: [0.45, 0.65], eave: 0.72 },
  japan: { p: 0.85, hMax: 11, aMax: 300, gable: 0.5, k: [0.44, 0.64], eave: 0.62 },
  hk: { p: 0.15, hMax: 8, aMax: 200, gable: 0.5, k: [0.35, 0.5], eave: 0.4 },
  china: { p: 0.40, hMax: 10.5, aMax: 380, gable: 0.58, k: [0.42, 0.60], eave: 0.62 },
  seasia: { p: 0.62, hMax: 10, aMax: 350, gable: 0.45, k: [0.42, 0.58], eave: 0.65 },
  seAsia: { p: 0.62, hMax: 10, aMax: 350, gable: 0.45, k: [0.42, 0.58], eave: 0.65 },
  global: { p: 0.65, hMax: 11, aMax: 450, gable: 0.5, k: [0.4, 0.6], eave: 0.45 },
};

const PITCHED_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'cabin', 'hut', 'shed',
  'garage', 'farm', 'barn', 'farm_auxiliary', 'stable', 'church', 'chapel', 'static_caravan', 'villa', 'dormitory',
  'temple', 'shrine', 'pagoda', 'historic', 'palace', 'monastery', 'gatehouse']);
const FLAT_TYPES = new Set(['commercial', 'retail', 'industrial', 'warehouse', 'office', 'supermarket', 'mall', 'hospital',
  'parking', 'garages', 'hotel', 'government', 'public', 'civic', 'stadium', 'train_station', 'transportation',
  'university', 'school', 'college', 'kindergarten', 'campus', 'tech_campus', 'kiosk', 'pavilion', 'service',
  'toilets', 'carport', 'canopy', 'guardhouse', 'security', 'laboratory', 'research',
  'department_store', 'manufacture', 'data_center', 'hangar', 'bunker', 'grandstand', 'roof']);

const SOFT_FLAT = new Set(['commercial', 'retail', 'hotel', 'office', 'civic', 'public', 'government', 'pavilion', 'kiosk']);
const OLD_TOWN = { med: 1, eu: 1, centralEu: 1, eastEu: 1, uk: 1, nordic: 1, paris: 1, latam: 1 };
/** Largest untyped footprint (m2) still read as old-town street fabric (tiled / slated) rather than a commercial block. */
const TOWN_FABRIC_AREA = { med: 1200, eu: 900, centralEu: 900, eastEu: 900, paris: 600, uk: 500, nordic: 500, latam: 320 };
const EAST_ASIAN_TRAD = new Set(['temple', 'shrine', 'pagoda', 'historic', 'palace', 'pavilion', 'monastery', 'gatehouse', 'memorial', 'cultural']);
const BARREL_TYPES = new Set(['warehouse', 'industrial', 'manufacture', 'train_station', 'transportation', 'hangar', 'grandstand', 'sports_centre', 'sports_hall', 'gymnasium', 'market', 'marketplace', 'supermarket']);
const GAMBREL_TYPES = new Set(['barn', 'farm', 'farm_auxiliary', 'stable']);
const PYRAMID_TYPES = new Set(['pavilion', 'kiosk', 'tower', 'bell_tower', 'watchtower', 'gazebo', 'chapel', 'church', 'historic']);

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
  copper: [[0.28, 0.52, 0.44], [0.32, 0.56, 0.47], [0.46, 0.31, 0.22]],
  jptile: [[0.24, 0.27, 0.31], [0.30, 0.31, 0.33], [0.22, 0.28, 0.36], [0.36, 0.28, 0.24], [0.28, 0.36, 0.42]],
  imperial: [[0.84, 0.62, 0.15], [0.79, 0.57, 0.13], [0.87, 0.66, 0.19]],
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

const OSM_SHAPE = {
  flat: 'flat',
  gabled: 'gable',
  gable: 'gable',
  hipped: 'hip',
  hip: 'hip',
  'half-hipped': 'hip',
  side_hipped: 'hip',
  pyramidal: 'pyramid',
  pyramid: 'pyramid',
  spire: 'pyramid',
  turret: 'pyramid',
  dome: 'pyramid',
  onion: 'pyramid',
  mansard: 'mansard',
  gambrel: 'gambrel',
  saltbox: 'gambrel',
  skillion: 'gable',
  round: 'barrel',
  barrel: 'barrel',
  vault: 'barrel',
  arched: 'barrel',
  stepped_gable: 'stepped_gable',
  crow_stepped: 'stepped_gable',
  dutch_gable: 'stepped_gable',
  bell_gable: 'stepped_gable',
  swept_hip: 'swept_hip',
  xieshan: 'swept_hip',
  irimoya: 'swept_hip',
  pagoda: 'swept_hip',
  chinese: 'swept_hip',
  oriental: 'swept_hip',
};

const OSM_MATERIAL = {
  roof_tiles: 'clay', tile: 'clay', tiles: 'clay', slate: 'slate', metal: 'metal', metal_sheet: 'metal',
  copper: 'copper', zinc: 'zinc', tar_paper: 'shingle', asphalt: 'shingle', asphalt_shingle: 'shingle', shingle: 'shingle',
  concrete: 'flat', gravel: 'flat', glass: 'zinc', grass: 'flat', thatch: 'clay', wood: 'shingle', eternit: 'slate',
};

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
  if (b1 - b0 > a1 - a0) {
    const nux = -uz, nuz = ux;
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
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
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
  const rec = (a, b) => {
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
 * isPart, minH, osm ({shape, height, colour, material} | null), facadeId, style, hasHoles }.
 * Returns null for a flat roof, else { shape, mat, rgb, k, eave, maxRise, chimney, dormers, cresting, obb, trim, region, subStyle }.
 */
export function planRoof(info) {
  const { flatOuter, rawH, region: rawRegion = 'beijing', seed = 1 } = info;
  if (!flatOuter || flatOuter.length < 6) return null;
  if (info.isPart || (info.minH || 0) > 0.5) return null;
  const region = rawRegion === 'seAsia' ? 'seasia' : rawRegion;
  const btype = String(info.btype || 'yes').toLowerCase();
  const style = String(info.style || '').toLowerCase();
  const R = REGION_ROOF[rawRegion] || REGION_ROOF[region] || REGION_ROOF.global;
  const osm = info.osm || null;
  const obb = footprintObb(flatOuter);
  if (!obb) return null;
  const area = obb.area;
  const holes = Boolean(info.hasHoles);
  const fid = String(info.facadeId || '');

  const isEastAsian = region === 'beijing' || region === 'china' || region === 'japan' || region === 'seasia' || region === 'hk';
  const isNorthCentralEu = region === 'eu' || rawRegion === 'centralEu' || rawRegion === 'eastEu' || region === 'nordic' || region === 'uk';
  const isTradAsianBldg = isEastAsian && (EAST_ASIAN_TRAD.has(btype) || fid === 'china_hutong_greybrick' || style === 'imperial' || style === 'hutong' ||
    ((btype === 'civic' || btype === 'public') && rawH <= 18 && area <= 1400 && rnd(seed, 17) < 0.55));

  let shape = null;
  if (osm && osm.shape) {
    shape = OSM_SHAPE[String(osm.shape).toLowerCase()] || null;
    if (shape === 'flat') return null;
  }

  const haussmann = (region === 'paris' && rawH >= 12 && rawH <= 46 && !/glass|office_concrete|parking|industrial|retail/.test(fid)) ||
    ((isNorthCentralEu || region === 'nyc') && rawH >= 14 && rawH <= 32 && (btype === 'apartments' || btype === 'residential' || btype === 'hotel') && !holes && !/glass|office_concrete|parking|industrial/.test(fid) && rnd(seed, 13) < 0.22);

  if (!shape) {
    if (haussmann) {
      shape = 'mansard';
    } else if (isTradAsianBldg && !holes && area <= 2200 && rawH <= 26) {
      shape = 'swept_hip';
    } else if (!holes && obb.fill > 0.66 && obb.len / Math.max(1, obb.wid) >= 1.10 && area >= 55 && area <= 4200 && rawH <= 26 && BARREL_TYPES.has(btype)) {
      const pBarrel = (btype === 'hangar' || btype === 'train_station' || btype === 'transportation' || btype === 'sports_centre' || btype === 'sports_hall' || btype === 'market' || btype === 'marketplace') ? 0.74 : 0.36;
      if (rnd(seed, 19) < pBarrel) shape = 'barrel';
      else return null;
    } else if (!holes && (btype === 'commercial' || btype === 'retail') && obb.fill > 0.72 && obb.len / Math.max(1, obb.wid) >= 1.15 && rawH <= 14 && area >= 110 && area <= 1400 && rnd(seed, 19) < 0.15) {
      shape = 'barrel';
    } else if (PYRAMID_TYPES.has(btype) && !holes && obb.len / Math.max(1, obb.wid) <= 1.25 && obb.fill > 0.68 && area <= 650 && rawH <= 28) {
      shape = isEastAsian ? 'swept_hip' : 'pyramid';
    } else if (FLAT_TYPES.has(btype) && !(OLD_TOWN[rawRegion] && SOFT_FLAT.has(btype))) {
      return null;
    } else if (PITCHED_TYPES.has(btype)) {
      if ((region === 'mideast' || region === 'hk') && btype !== 'church' && !EAST_ASIAN_TRAD.has(btype)) return null;
      shape = 'pitch';
    } else {
      if (region === 'beijing') {
        if (rawH > 9.6 || area > 380 || area < 20 || holes || (info.flav ?? 0.5) < 0.2) return null;
        if (rnd(seed, 11) > R.p) return null;
        shape = 'pitch';
      } else {
        if (rawH > R.hMax || area > R.aMax || area < 14) return null;
        if (holes && region !== 'med' && region !== 'eu' && rawRegion !== 'centralEu') return null;
        const isHouseSized = area >= 35 && area <= 320 && rawH <= 9.8 && obb.len <= 28;
        if ((info.flav ?? 0.5) < -0.35 && !isHouseSized) return null;
        // The land-use flavour is low wherever blocks are packed (no lawns), which also describes housing: San Francisco
        // row houses (narrow lots, three storeys, residential zoning) and the old-town fabric of the regions whose towns
        // are tiled or slated. Those keep their pitched roofs; wide or tall untyped blocks stay flat.
        const flavV = info.flav ?? 0.5;
        const isRowHouse = region === 'sf' && area >= 35 && area <= 330 && obb.wid <= 12.5 && flavV >= 0.1;
        const isTownFabric = Boolean(OLD_TOWN[rawRegion]) && area <= (TOWN_FABRIC_AREA[rawRegion] || 0) && rawH <= 22 && flavV >= -0.1;
        if (btype === 'yes' && !isHouseSized && !isRowHouse && !isTownFabric && flavV < 0.25) return null;
        if (region === 'us' || region === 'la' || region === 'sf') {
          if (area > 320 && (info.flav ?? 0.5) < 0.3) return null;
        }
        if (rnd(seed, 11) > R.p) return null;
        shape = 'pitch';
      }
    }
  }
  if (holes && shape !== 'mansard' && shape !== 'pitch' && shape !== 'hip') return null;

  // Covering by region
  let mat = RM.shingle, cover = COVER.shingle, kk = R.k, eave = R.eave, chimneyP = 0.0, trim = null;
  const r1 = rnd(seed, 23), r2 = rnd(seed, 29);
  switch (region) {
    case 'us': case 'nyc':
      mat = RM.shingle; cover = COVER.shingle; chimneyP = 0.42; trim = [0.88, 0.88, 0.86]; break;
    case 'la':
      if (r1 < 0.34 || fid === 'stucco_spanish') { mat = RM.terracotta; cover = COVER.spanish; kk = [0.28, 0.36]; }
      else { mat = RM.shingle; cover = COVER.shingle; }
      chimneyP = 0.22; trim = [0.84, 0.82, 0.78]; break;
    case 'sf':
      if (r1 < 0.35) { mat = RM.slate; cover = COVER.slate; } else { mat = RM.shingle; cover = COVER.shingle; }
      chimneyP = 0.38; trim = [0.92, 0.91, 0.88]; break;
    case 'uk':
      if (r1 < 0.62) { mat = RM.slate; cover = COVER.slate; } else { mat = RM.clay; cover = COVER.clay; }
      chimneyP = 0.82; trim = [0.86, 0.84, 0.80]; break;
    case 'paris':
      if (r1 < 0.62) { mat = RM.slate; cover = COVER.slate; } else { mat = RM.zinc; cover = COVER.zinc; }
      chimneyP = 0.58; trim = [0.86, 0.84, 0.80]; break;
    case 'eu':
      if (r1 < 0.72) { mat = RM.clay; cover = COVER.clay; } else { mat = RM.slate; cover = COVER.slate; }
      chimneyP = 0.52; trim = [0.86, 0.84, 0.80]; break;
    case 'med': case 'latam':
      mat = RM.terracotta; cover = COVER.terracotta; chimneyP = region === 'med' ? 0.32 : 0.08; break;
    case 'nordic':
      if (r1 < 0.76) { mat = RM.metal; cover = COVER.metalNordic; } else { mat = RM.clay; cover = COVER.clay; }
      chimneyP = 0.45; trim = [0.92, 0.91, 0.89]; break;
    case 'japan':
      if (r1 < 0.68) { mat = RM.jptile; cover = COVER.jptile; } else { mat = RM.metal; cover = COVER.jptile; }
      trim = [0.26, 0.18, 0.13]; break;
    case 'beijing': case 'china': case 'hk':
      mat = RM.jptile;
      if (style === 'imperial' || btype === 'palace' || (EAST_ASIAN_TRAD.has(btype) && r1 < 0.45)) {
        cover = COVER.imperial; trim = [0.58, 0.16, 0.14];
      } else {
        cover = COVER.jptile; trim = [0.38, 0.18, 0.15];
      }
      break;
    case 'seasia':
      if (EAST_ASIAN_TRAD.has(btype)) { mat = RM.terracotta; cover = r1 < 0.5 ? COVER.imperial : COVER.terracotta; trim = [0.46, 0.22, 0.14]; }
      else if (r1 < 0.48) { mat = RM.metal; cover = COVER.metal; trim = [0.34, 0.24, 0.16]; }
      else { mat = RM.terracotta; cover = COVER.terracotta; trim = [0.38, 0.25, 0.16]; }
      break;
    case 'mideast':
      mat = RM.terracotta; cover = COVER.spanish; break;
    default:
      if (r1 < 0.45) { mat = RM.terracotta; cover = COVER.terracotta; } else if (r1 < 0.75) { mat = RM.shingle; cover = COVER.shingle; } else { mat = RM.metal; cover = COVER.metal; }
      chimneyP = 0.20;
  }

  if (btype === 'church' || btype === 'chapel') kk = [1.0, 1.4];
  if (btype === 'shed' || btype === 'garage' || btype === 'hut') chimneyP = 0;
  if (osm && osm.material) {
    const m = OSM_MATERIAL[String(osm.material).toLowerCase()];
    if (m === 'flat') return null;
    if (m === 'clay') {
      mat = region === 'med' || region === 'latam' || region === 'la' ? RM.terracotta : RM.clay;
      cover = region === 'med' || region === 'latam' ? COVER.terracotta : COVER.clay;
    } else if (m === 'copper') {
      mat = RM.metal; cover = COVER.copper;
    } else if (m && COVER[m]) {
      mat = RM[m] ?? RM.shingle; cover = COVER[m];
    }
  }
  let rgb = vary(pick(cover, r2), seed);
  if (osm && osm.colour && osm.colourRgb) rgb = osm.colourRgb;

  if (shape === 'mansard') {
    const mMat = r1 < 0.55 ? RM.slate : RM.zinc;
    const mRgb = vary(pick(mMat === RM.slate ? COVER.slate : COVER.zinc, r2), seed, 0.05);
    return {
      shape: 'mansard', mat: mMat, rgb: mRgb, k: 2.35, eave: 0.34, maxRise: 4.2,
      chimney: rnd(seed, 31) < 0.75, dormers: true, cresting: true, obb, trim: [0.88, 0.86, 0.82], region: rawRegion,
    };
  }

  if (shape === 'barrel') {
    const bMat = (btype === 'train_station' || btype === 'civic' || btype === 'pavilion' || btype === 'market' || btype === 'marketplace')
      ? (r1 < 0.38 ? RM.metal : RM.zinc) : RM.metal;
    const bCover = (bMat === RM.metal && r1 < 0.28 && (btype === 'train_station' || btype === 'market' || btype === 'civic'))
      ? COVER.copper : (bMat === RM.zinc ? COVER.zinc : COVER.metal);
    const bRgb = vary(pick(bCover, r2), seed, 0.05);
    const maxRise = Math.min(5.8, Math.max(1.6, obb.wid * 0.25));
    return {
      shape: 'barrel', mat: bMat, rgb: bRgb, k: 0.5, eave: 0.32, maxRise,
      chimney: false, dormers: false, cresting: false, obb, trim: [0.30, 0.32, 0.35], region: rawRegion,
    };
  }

  // Refine 'pitch' into regional architectural 3D roof shapes
  const aspect = obb.len / Math.max(1, obb.wid);
  const isSquareish = aspect <= 1.24 && obb.fill > 0.68;
  const isOblong = aspect > 1.15 && obb.fill > 0.68;

  if (shape === 'pitch') {
    if (!holes && isEastAsian) {
      const pSwept = region === 'beijing' ? 0.68 : region === 'japan' ? 0.60 : region === 'china' ? 0.58 : 0.48;
      if (isTradAsianBldg || rnd(seed, 43) < pSwept) shape = 'swept_hip';
    }
    if (shape === 'pitch' && !holes && isSquareish && area <= 560) {
      const pPyr = PYRAMID_TYPES.has(btype) ? 0.92 : (isNorthCentralEu || region === 'paris' || region === 'sf' || region === 'us' || region === 'nyc') ? 0.32 : 0.14;
      if (rnd(seed, 44) < pPyr) shape = 'pyramid';
    }
    if (shape === 'pitch' && !holes && (GAMBREL_TYPES.has(btype) || (isOblong && area <= 440 && (region === 'us' || region === 'uk' || region === 'nordic' || isNorthCentralEu)))) {
      const pGam = GAMBREL_TYPES.has(btype) ? 0.88 : region === 'us' ? 0.22 : 0.16;
      if (rnd(seed, 45) < pGam) shape = 'gambrel';
    }
    if (shape === 'pitch' && !holes && isOblong && isNorthCentralEu && obb.wid <= 16.5) {
      const pStep = obb.wid <= 9.5 ? 0.52 : 0.35;
      if (rnd(seed, 46) < pStep) shape = 'stepped_gable';
    }
    if (shape === 'pitch') {
      const wantGable = isOblong && rnd(seed, 41) < R.gable && !(osm && osm.shape && /hip|pyramid/.test(String(osm.shape)));
      shape = wantGable ? 'gable' : 'hip';
    }
  }

  let k = kk[0] + (kk[1] - kk[0]) * rnd(seed, 37);

  if (shape === 'swept_hip' || shape === 'xieshan' || shape === 'irimoya') {
    k = Math.max(0.48, k);
    eave = Math.max(0.65, isTradAsianBldg ? 0.88 : eave);
    const maxRise = Math.min(6.4, Math.max(2.1, 0.5 * obb.wid * k * 1.12));
    const subStyle = aspect > 1.18 ? (region === 'japan' ? 'irimoya' : 'xieshan') : 'swept_hip';
    return {
      shape: 'swept_hip', subStyle, mat, rgb, k, eave, maxRise, obb,
      trim: trim || [0.42, 0.18, 0.14], chimney: false, dormers: false, cresting: false, region: rawRegion,
    };
  }

  if (shape === 'pyramid') {
    k = Math.max(0.86, kk[1] * 1.25);
    eave = Math.max(0.32, eave * 0.85);
    if (r1 < 0.25 && (PYRAMID_TYPES.has(btype) || region === 'eu' || region === 'paris' || region === 'nordic')) {
      rgb = vary(pick(COVER.copper, r2), seed, 0.05);
      mat = RM.metal;
    }
    const maxRise = Math.min(7.8, Math.max(2.4, 0.5 * Math.min(obb.len, obb.wid) * k * 1.12));
    return {
      shape: 'pyramid', mat, rgb, k, eave, maxRise, obb, trim,
      chimney: false, dormers: false, cresting: true, region: rawRegion,
    };
  }

  if (shape === 'gambrel') {
    k = Math.max(0.56, kk[0] + (kk[1] - kk[0]) * 0.65);
    eave = Math.max(0.36, eave * 0.88);
    const maxRise = Math.min(5.4, Math.max(2.2, 0.48 * obb.wid * k + 0.35));
    return {
      shape: 'gambrel', mat, rgb, k, eave, maxRise, obb,
      trim: trim || [0.90, 0.89, 0.86],
      chimney: area < 900 && rnd(seed, 31) < Math.max(0.35, chimneyP),
      dormers: obb.len >= 8.0 && rnd(seed, 48) < 0.65,
      cresting: false,
      saltbox: (region === 'us' || region === 'uk') && rnd(seed, 50) < 0.26,
      region: rawRegion,
    };
  }

  if (shape === 'stepped_gable') {
    k = Math.max(0.76, kk[1]);
    eave = 0.22;
    const maxRise = Math.min(6.2, Math.max(2.4, 0.5 * obb.wid * k + 0.1));
    return {
      shape: 'stepped_gable', mat, rgb, k, eave, maxRise, obb,
      trim: trim || [0.88, 0.86, 0.81],
      chimney: area < 950 && rnd(seed, 31) < Math.max(0.55, chimneyP),
      dormers: obb.len >= 8.5 && rnd(seed, 48) < 0.62,
      cresting: rnd(seed, 49) < 0.55,
      region: rawRegion,
    };
  }

  let maxRise = Math.min(area > 600 ? 5.5 : 4.6, 0.5 * obb.wid * k + 0.01);
  if (osm && Number(osm.height) > 0) maxRise = Math.min(12, Number(osm.height));
  const wantDormers = !holes && obb.len >= 8.5 && k >= 0.46 &&
    (isNorthCentralEu || region === 'paris' || region === 'sf' || region === 'us' || region === 'nyc') &&
    rnd(seed, 48) < 0.42;
  const wantCresting = !holes && (region === 'sf' || region === 'uk' || region === 'paris' || mat === RM.slate || mat === RM.zinc) &&
    rnd(seed, 49) < 0.44;

  return {
    shape, mat, rgb, k, eave, maxRise, obb, trim,
    chimney: area < 900 && rnd(seed, 31) < chimneyP,
    dormers: wantDormers,
    cresting: wantCresting,
    region: rawRegion,
  };
}

/** Roof rise to plan the wall top with (the walls stop at topY - rise). */
export function roofRise(plan) {
  if (!plan) return 0;
  if (plan.shape === 'mansard') return 3.0 + 1.0;
  return plan.maxRise || 3.0;
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
        if (Math.hypot(R.x[j] - R.x[i], R.z[j] - R.z[i]) < 0.06) continue;
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
// Emission Primitives (100% NaN-safe & vertex/triangle synchronized)
// ------------------------------------------------------------------------------------------------------------------

/** Writes one triangle with a fixed normal, flipping the winding so the geometric normal agrees with it. */
function tri(out, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, rgb, uvA, uvB, uvC) {
  if (!out || !out.pos) return;
  const check = ax + ay + az + bx + by + bz + cx + cy + cz + nx + ny + nz;
  if (!Number.isFinite(check)) return;
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
  const g2 = gx * gx + gy * gy + gz * gz;
  if (!(g2 >= 1e-8)) return;
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen > 1e-6) { nx /= nLen; ny /= nLen; nz /= nLen; } else { nx = 0; ny = 1; nz = 0; }
  if (gx * nx + gy * ny + gz * nz < 0) {
    let t;
    t = bx; bx = cx; cx = t; t = by; by = cy; cy = t; t = bz; bz = cz; cz = t; t = uvB; uvB = uvC; uvC = t;
  }
  const cr = Number.isFinite(rgb && rgb[0]) ? Math.max(0, Math.min(1, rgb[0])) : 0.5;
  const cg = Number.isFinite(rgb && rgb[1]) ? Math.max(0, Math.min(1, rgb[1])) : 0.5;
  const cb = Number.isFinite(rgb && rgb[2]) ? Math.max(0, Math.min(1, rgb[2])) : 0.5;
  out.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  for (let i = 0; i < 3; i++) {
    out.norm.push(nx, ny, nz);
    out.col.push(cr, cg, cb);
  }
  if (out.uv) {
    if (uvA && uvB && uvC && Number.isFinite(uvA[0] + uvA[1] + uvB[0] + uvB[1] + uvC[0] + uvC[1])) {
      out.uv.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    } else {
      out.uv.push(-10, -10, -10, -10, -10, -10);
    }
  }
  if (Array.isArray(out.triEntity)) {
    out.triEntity.push(out.entityIdx !== undefined ? out.entityIdx : 0);
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

// ------------------------------------------------------------------------------------------------------------------
// Ornate Dormers, Chimneys, Skylights & Wrought-Iron Ridge Cresting / Weathervanes
// ------------------------------------------------------------------------------------------------------------------

/** Distance from (px, pz) to the nearest edge of a { x, z } ring, or -1 when the point is outside it. */
function insideDist(ring, px, pz) {
  const n = ring && ring.x ? ring.x.length : 0;
  if (n < 3) return -1;
  let inside = false, best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring.x[i], zi = ring.z[i], xj = ring.x[j], zj = ring.z[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
    const ex = xi - xj, ez = zi - zj;
    const t = Math.max(0, Math.min(1, ((px - xj) * ex + (pz - zj) * ez) / (ex * ex + ez * ez || 1e-9)));
    const d = Math.hypot(px - (xj + ex * t), pz - (zj + ez * t));
    if (d < best) best = d;
  }
  return inside ? best : -1;
}

/** Same for the roof actually emitted: inside the wall ring and outside every courtyard hole (flat [x, z, ...] rings). */
function roofInsideDist(ring, holes, px, pz) {
  let d = insideDist(ring, px, pz);
  if (d < 0) return -1;
  for (const h of holes || []) {
    if (!h || h.length < 6) continue;
    const hr = { x: [], z: [] };
    for (let i = 0; i < h.length; i += 2) { hr.x.push(h[i]); hr.z.push(h[i + 1]); }
    const dh = insideDist(hr, px, pz);
    if (dh >= 0) return -1;
    const n = hr.x.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ex = hr.x[i] - hr.x[j], ez = hr.z[i] - hr.z[j];
      const t = Math.max(0, Math.min(1, ((px - hr.x[j]) * ex + (pz - hr.z[j]) * ez) / (ex * ex + ez * ez || 1e-9)));
      d = Math.min(d, Math.hypot(px - (hr.x[j] + ex * t), pz - (hr.z[j] + ez * t)));
    }
  }
  return d;
}

/**
 * Emits arched / bullseye Paris mansard dormers, twin gable dormers, skylight panes, ornate brick/stone chimneys
 * with stepped shoulders & terracotta pots/metal cowls, and wrought-iron ridge cresting / weathervane finials.
 */
export function emitChimneyAndDormers(det, ring, edges, plan, yEave, topY, opts = {}) {
  if (!det || opts.lod === 'cheap') return;
  const seed = opts.seed || 1;
  const obb = plan.obb;
  const rgb = plan.rgb || [0.3, 0.3, 0.32];
  const isMansard = plan.shape === 'mansard';
  const region = plan.region || 'eu';

  // 1. Dormers (Arched / Bullseye Paris Mansard Dormers & Twin Gable Dormers) + Skylights
  if (plan.dormers && ring && edges && ring.x && ring.x.length >= 3) {
    const n = ring.x.length;
    const dRgb = plan.trim || [0.87, 0.85, 0.81];
    const capRgb = [Math.max(0.14, rgb[0] * 0.88), Math.max(0.15, rgb[1] * 0.88), Math.max(0.17, rgb[2] * 0.90)];
    const trimRgb = [0.93, 0.91, 0.88];
    const glassRgb = [0.14, 0.19, 0.24];
    let budget = isMansard ? 6 : 4; // 6 (was 8): pays for the mansards and row-house roofs that used to be flat decks
    const spacing = isMansard ? 4.3 : 5.4;

    for (let i = 0; i < n && budget > 0; i++) {
      const E = edges[ring.e[i]];
      if (!E || E.w < 0.5) continue; // only on sloped eave edges, never on vertical gable ends
      const j = (i + 1) % n;
      const L = Math.hypot(ring.x[j] - ring.x[i], ring.z[j] - ring.z[i]);
      if (L < 6.8) continue;
      const cnt = Math.min(budget, Math.max(1, Math.floor((L - 2.2) / spacing)));
      const insetDist = isMansard ? 0.55 : Math.min(1.05, Math.max(0.55, (topY - yEave) * 0.26));
      const yBase = isMansard ? yEave + 0.38 : yEave + Math.min(0.65, (topY - yEave) * 0.18);
      const dH = isMansard ? 1.72 : Math.min(1.45, Math.max(1.05, (topY - yBase) * 0.58));
      const dW = isMansard ? 0.64 : 0.58;
      const dD = isMansard ? 0.56 : 0.62;

      for (let c = 0; c < cnt; c++) {
        const a = (L - (cnt - 1) * spacing) * 0.5 + c * spacing;
        const px = ring.x[i] + E.ux * a + E.nx * insetDist;
        const pz = ring.z[i] + E.uz * a + E.nz * insetDist;
        const styleRoll = rnd(seed, 301 + i * 17 + c * 31);
        const dormerType = isMansard
          ? (styleRoll < 0.46 ? 'arched' : styleRoll < 0.72 ? 'bullseye' : 'pediment')
          : 'gable';

        // Dormer side cheek walls & main body
        orientedBox(det, px, yBase, pz, E.ux, E.uz, dW, dD, dH, dRgb, false, false);
        const y0 = yBase + dH;
        const fx = -E.nx * (dD + 0.06), fz = -E.nz * (dD + 0.06);
        const bx = E.nx * (dD + 0.04), bz = E.nz * (dD + 0.04);
        const gx = px - E.nx * (dD + 0.01), gz = pz - E.nz * (dD + 0.01);

        // Projecting stone window sill & lintel cornice
        orientedBox(det, gx - E.nx * 0.04, yBase + 0.22, gz - E.nz * 0.04, E.ux, E.uz, dW * 0.85, 0.08, 0.08, trimRgb);
        orientedBox(det, gx - E.nx * 0.04, y0 - 0.12, gz - E.nz * 0.04, E.ux, E.uz, dW * 0.92, 0.09, 0.09, trimRgb);

        if (dormerType === 'arched') {
          // Arched barrel-vault cap (4-segment curved zinc hood)
          const segs = 4, archR = dW + 0.10, archH = 0.44;
          for (let s = 0; s < segs; s++) {
            const t0 = -1 + (2 * s) / segs, t1 = -1 + (2 * (s + 1)) / segs;
            const u0 = t0 * archR, u1 = t1 * archR;
            const h0 = y0 + archH * Math.sqrt(Math.max(0, 1 - t0 * t0));
            const h1 = y0 + archH * Math.sqrt(Math.max(0, 1 - t1 * t1));
            const tm = (t0 + t1) * 0.5;
            quad(
              det,
              px + E.ux * u0 + fx, h0, pz + E.uz * u0 + fz,
              px + E.ux * u1 + fx, h1, pz + E.uz * u1 + fz,
              px + E.ux * u1 + bx, h1, pz + E.uz * u1 + bz,
              px + E.ux * u0 + bx, h0, pz + E.uz * u0 + bz,
              E.ux * tm * 0.7, 0.85, E.uz * tm * 0.7, capRgb
            );
            // Front arched spandrel tympanum fill
            tri(det, px + fx, y0, pz + fz, px + E.ux * u0 + fx, h0, pz + E.uz * u0 + fz, px + E.ux * u1 + fx, h1, pz + E.uz * u1 + fz, -E.nx, 0, -E.nz, dRgb, null);
          }
          // Crest finial on top of arched dormer
          orientedBox(det, px + fx * 0.7, y0 + archH, pz + fz * 0.7, E.ux, E.uz, 0.05, 0.05, 0.16, capRgb);
        } else if (dormerType === 'bullseye') {
          // Paris oeil-de-boeuf (bullseye oval dormer with stone keystones & curved zinc hood)
          const archH = 0.48, archR = dW + 0.08;
          for (let s = 0; s < 4; s++) {
            const t0 = -1 + (2 * s) / 4, t1 = -1 + (2 * (s + 1)) / 4;
            const u0 = t0 * archR, u1 = t1 * archR;
            const h0 = y0 + archH * Math.sqrt(Math.max(0, 1 - t0 * t0));
            const h1 = y0 + archH * Math.sqrt(Math.max(0, 1 - t1 * t1));
            quad(
              det,
              px + E.ux * u0 + fx, h0, pz + E.uz * u0 + fz,
              px + E.ux * u1 + fx, h1, pz + E.uz * u1 + fz,
              px + E.ux * u1 + bx, h1, pz + E.uz * u1 + bz,
              px + E.ux * u0 + bx, h0, pz + E.uz * u0 + bz,
              E.ux * (t0 + t1) * 0.35, 0.88, E.uz * (t0 + t1) * 0.35, capRgb
            );
            tri(det, px + fx, y0, pz + fz, px + E.ux * u0 + fx, h0, pz + E.uz * u0 + fz, px + E.ux * u1 + fx, h1, pz + E.uz * u1 + fz, -E.nx, 0, -E.nz, trimRgb, null);
          }
          // 4 radial stone keystones (top, bottom, left, right)
          const wy = yBase + dH * 0.56;
          orientedBox(det, gx - E.nx * 0.03, wy + 0.36, gz - E.nz * 0.03, E.ux, E.uz, 0.08, 0.05, 0.12, trimRgb);
          orientedBox(det, gx - E.nx * 0.03, wy - 0.44, gz - E.nz * 0.03, E.ux, E.uz, 0.08, 0.05, 0.12, trimRgb);
          for (const ks of [-1, 1]) {
            orientedBox(det, gx + E.ux * ks * 0.38 - E.nx * 0.03, wy - 0.06, gz + E.uz * ks * 0.38 - E.nz * 0.03, E.ux, E.uz, 0.06, 0.05, 0.14, trimRgb);
          }
        } else {
          // Pedimented / Twin Gable Dormer Cap
          const hx = E.ux * (dW + 0.14), hz = E.uz * (dW + 0.14);
          const yR = y0 + 0.52;
          quad(det, px - hx + fx, y0, pz - hz + fz, px + fx, yR, pz + fz, px + bx, yR, pz + bz, px - hx + bx, y0, pz - hz + bz, -E.ux * 0.6, 0.8, -E.uz * 0.6, capRgb);
          quad(det, px + hx + fx, y0, pz + hz + fz, px + fx, yR, pz + fz, px + bx, yR, pz + bz, px + hx + bx, y0, pz + hz + bz, E.ux * 0.6, 0.8, E.uz * 0.6, capRgb);
          tri(det, px - hx + fx, y0, pz - hz + fz, px + hx + fx, y0, pz + hz + fz, px + fx, yR, pz + fz, -E.nx, 0, -E.nz, dRgb, null);
          // White raking pediment bargeboard & ridge cap
          orientedBox(det, px, yR - 0.02, pz, E.nx, E.nz, dD + 0.05, 0.05, 0.06, trimRgb);
          orientedBox(det, px + fx * 0.88, yR + 0.02, pz + fz * 0.88, E.ux, E.uz, 0.04, 0.04, 0.18, capRgb);
        }

        // Recessed dark glazed dormer window pane + white casement stiles & cruciform mullions
        const winW = dW * 0.62, winY0 = yBase + 0.30, winY1 = y0 - 0.12;
        if (winY1 > winY0 + 0.2) {
          quad(
            det,
            gx - E.ux * winW, winY0, gz - E.uz * winW,
            gx + E.ux * winW, winY0, gz + E.uz * winW,
            gx + E.ux * winW, winY1, gz + E.uz * winW,
            gx - E.ux * winW, winY1, gz - E.uz * winW,
            -E.nx, 0, -E.nz, glassRgb
          );
          // Central vertical mullion + horizontal transom bar + left/right frame stiles
          const mx = gx - E.nx * 0.018, mz = gz - E.nz * 0.018;
          orientedBox(det, mx, winY0, mz, E.ux, E.uz, 0.026, 0.02, winY1 - winY0, trimRgb);
          orientedBox(det, mx, winY0 + (winY1 - winY0) * 0.58, mz, E.ux, E.uz, winW, 0.02, 0.04, trimRgb);
          for (const ss of [-1, 1]) {
            orientedBox(det, mx + E.ux * ss * (winW - 0.02), winY0, mz + E.uz * ss * (winW - 0.02), E.ux, E.uz, 0.024, 0.02, winY1 - winY0, trimRgb);
          }
        }
        budget--;
      }

      // Flush roof skylight panes on pitched slopes (between or opposite dormers)
      if (!isMansard && L >= 7.5 && rnd(seed, 353 + i * 19) < 0.55) {
        const skA = L * (0.35 + 0.3 * rnd(seed, 359 + i));
        const skInset = Math.min(1.6, Math.max(0.9, (topY - yEave) * 0.45));
        const skY = yEave + skInset * (plan.k || 0.55) + 0.06;
        if (skY < topY - 0.35) {
          const sx = ring.x[i] + E.ux * skA + E.nx * skInset;
          const sz = ring.z[i] + E.uz * skA + E.nz * skInset;
          orientedBox(det, sx, skY - 0.04, sz, E.ux, E.uz, 0.48, 0.36, 0.09, [0.22, 0.24, 0.27]);
          orientedBox(det, sx, skY + 0.02, sz, E.ux, E.uz, 0.42, 0.30, 0.04, [0.18, 0.28, 0.38]);
        }
      }
    }
  }

  // 2. Ornate Brick & Stone Chimneys (stepped shoulders, stone crown corbels, multiple terracotta pots & metal cowls)
  if (plan.chimney && obb) {
    const nStacks = isMansard || (obb.len >= 16 && (region === 'uk' || region === 'paris' || region === 'eu')) ? 2 : 1;
    const baseBrick = opts.chimneyRgb || (isMansard ? [0.74, 0.66, 0.56] : [0.54, 0.30, 0.24]);
    const darkBrick = [baseBrick[0] * 0.88, baseBrick[1] * 0.86, baseBrick[2] * 0.85];
    const stoneCrown = [0.80, 0.78, 0.73];
    const potClay = [0.68, 0.38, 0.26];
    const cowlMetal = [0.24, 0.25, 0.27];

    for (let c = 0; c < nStacks; c++) {
      const side = nStacks === 2 ? (c === 0 ? -1 : 1) : (rnd(seed, 53) < 0.5 ? -1 : 1);
      const a0 = side * Math.max(0.8, obb.len * 0.5 - (isMansard ? 2.2 : 1.35 + rnd(seed, 59 + c) * Math.max(0, obb.len * 0.18)));
      const b0 = isMansard ? 0 : (rnd(seed, 61 + c) - 0.5) * obb.wid * 0.28;
      // The plan's box is the footprint's bounding box, but the roof sits on the (possibly set back, L-shaped or
      // courtyard) wall ring: stand the stack on that ring, sliding it towards the middle when the box corner is
      // off the roof, and drop it when no spot is found. Its base starts under the roof surface at that spot.
      let cx = 0, cz = 0, edgeDist = -1;
      for (const f of ring && ring.x ? [1, 0.6, 0.25, 0] : [1]) {
        cx = obb.cx + obb.ax * a0 * f - obb.az * b0 * f;
        cz = obb.cz + obb.az * a0 * f + obb.ax * b0 * f;
        edgeDist = ring && ring.x ? roofInsideDist(ring, opts.holes, cx, cz) : obb.wid * 0.5 - Math.abs(b0);
        if (edgeDist >= (isMansard ? 1.5 : 0.75)) break;
        edgeDist = -1;
        if (nStacks === 2 && f < 1) break; // paired stacks would meet in the middle
      }
      if (edgeDist < 0) continue;
      const yBase = isMansard
        ? yEave + 1.4
        : yEave + Math.min(plan.maxRise || 3.0, edgeDist * (plan.k || 0.55)) - 0.65;
      const hTop = Math.max(topY + (isMansard ? 1.25 : 0.82), yBase + 1.45);
      const stackH = hTop - yBase;
      const ux = isMansard ? obb.az : obb.ax;
      const uz = isMansard ? -obb.ax : obb.az;
      const hl = isMansard ? 1.35 : 0.52;
      const hw = isMansard ? 0.38 : 0.34;

      // Lower wider chimney breast + stepped shoulder weathering at 45% height
      const shoulderH = stackH * 0.46;
      orientedBox(det, cx, yBase, cz, ux, uz, hl + 0.10, hw + 0.06, shoulderH, baseBrick);
      orientedBox(det, cx, yBase + shoulderH, cz, ux, uz, hl + 0.13, hw + 0.08, 0.07, stoneCrown);
      // Upper narrower shaft above the stepped shoulders
      orientedBox(det, cx, yBase + shoulderH + 0.07, cz, ux, uz, hl, hw, stackH - shoulderH - 0.07, baseBrick);
      // Corbelled brick necking band + double-stepped stone crown corbels
      orientedBox(det, cx, hTop - 0.18, cz, ux, uz, hl + 0.05, hw + 0.05, 0.08, darkBrick);
      orientedBox(det, cx, hTop - 0.08, cz, ux, uz, hl + 0.09, hw + 0.08, 0.08, darkBrick);
      orientedBox(det, cx, hTop, cz, ux, uz, hl + 0.14, hw + 0.12, 0.12, stoneCrown);

      // Multiple cylindrical/octagonal terracotta chimney pots + metal rain cowls
      const potOffsets = isMansard ? [-0.96, -0.32, 0.32, 0.96] : [-0.22, 0.22];
      for (let p = 0; p < potOffsets.length; p++) {
        const ps = potOffsets[p];
        const px = cx + ux * ps, pz = cz + uz * ps;
        // Terracotta pot base collar, shaft, and rolled rim
        orientedBox(det, px, hTop + 0.12, pz, ux, uz, 0.12, 0.12, 0.06, stoneCrown);
        orientedBox(det, px, hTop + 0.18, pz, ux, uz, 0.10, 0.10, 0.34, potClay);
        orientedBox(det, px, hTop + 0.48, pz, ux, uz, 0.125, 0.125, 0.05, [potClay[0] * 0.88, potClay[1] * 0.88, potClay[2] * 0.88]);
        // Metal rain cowl / hood cap above the pot
        orientedBox(det, px, hTop + 0.53, pz, ux, uz, 0.065, 0.065, 0.10, cowlMetal);
        orientedBox(det, px, hTop + 0.63, pz, ux, uz, 0.135, 0.135, 0.04, cowlMetal);
      }
    }
  }

  // 3. Wrought-Iron Ornamental Ridge Cresting & Spire Finials / Weathervanes
  if (plan.cresting && obb) {
    const ironRgb = [0.15, 0.16, 0.18];
    const goldRgb = [0.78, 0.64, 0.24];
    const ridgeHalf = (plan.shape === 'gable' || plan.shape === 'stepped_gable')
      ? Math.max(0, obb.len * 0.5 - 0.25)
      : Math.max(0, (obb.len - obb.wid) * 0.5);
    // The ridge line comes from the bounding box: keep the cresting only where that line is over the emitted roof.
    const onRoof = (t) => !ring || !ring.x || roofInsideDist(ring, opts.holes, obb.cx + obb.ax * t, obb.cz + obb.az * t) >= 0.2;
    if (!onRoof(0) || (ridgeHalf > 0.45 && !(onRoof(-ridgeHalf) && onRoof(ridgeHalf)))) {
      // no cresting: the box centre line is off this roof (L-shaped, set back or courtyard footprint)
    } else if (ridgeHalf > 0.45) {
      // Bottom & top horizontal wrought-iron cresting rails along the ridge
      orientedBox(det, obb.cx, topY + 0.05, obb.cz, obb.ax, obb.az, ridgeHalf, 0.03, 0.03, ironRgb);
      orientedBox(det, obb.cx, topY + 0.26, obb.cz, obb.ax, obb.az, ridgeHalf, 0.025, 0.025, ironRgb);
      const nSpikes = Math.min(9, Math.max(3, Math.floor((ridgeHalf * 2) / 0.95))); // 9 (was 14), same reason
      for (let s = 0; s < nSpikes; s++) {
        const posA = -ridgeHalf + ((s + 0.5) / nSpikes) * (ridgeHalf * 2);
        const sx = obb.cx + obb.ax * posA, sz = obb.cz + obb.az * posA;
        orientedBox(det, sx, topY + 0.05, sz, obb.ax, obb.az, 0.03, 0.03, 0.30, ironRgb);
        orientedBox(det, sx, topY + 0.35, sz, obb.ax, obb.az, 0.05, 0.05, 0.06, goldRgb);
      }
      // End spire finials + weathervane at one ridge end
      for (const endS of [-1, 1]) {
        const ex = obb.cx + obb.ax * endS * ridgeHalf;
        const ez = obb.cz + obb.az * endS * ridgeHalf;
        orientedBox(det, ex, topY + 0.04, ez, obb.ax, obb.az, 0.08, 0.08, 0.14, ironRgb);
        orientedBox(det, ex, topY + 0.18, ez, obb.ax, obb.az, 0.03, 0.03, 0.62, ironRgb);
        if (endS === 1) {
          // Weathervane cross-arms & golden pointer vane
          orientedBox(det, ex, topY + 0.62, ez, obb.ax, obb.az, 0.28, 0.02, 0.025, ironRgb);
          orientedBox(det, ex, topY + 0.62, ez, -obb.az, obb.ax, 0.28, 0.02, 0.025, ironRgb);
          orientedBox(det, ex, topY + 0.72, ez, obb.ax, obb.az, 0.22, 0.025, 0.07, goldRgb);
        }
      }
    } else {
      // Central finial & weathervane for square/pyramidal roofs
      orientedBox(det, obb.cx, topY, obb.cz, obb.ax, obb.az, 0.14, 0.14, 0.22, ironRgb);
      orientedBox(det, obb.cx, topY + 0.22, obb.cz, obb.ax, obb.az, 0.035, 0.035, 0.85, ironRgb);
      orientedBox(det, obb.cx, topY + 0.82, obb.cz, obb.ax, obb.az, 0.32, 0.02, 0.03, ironRgb);
      orientedBox(det, obb.cx, topY + 0.82, obb.cz, -obb.az, obb.ax, 0.32, 0.02, 0.03, ironRgb);
      orientedBox(det, obb.cx, topY + 0.94, obb.cz, obb.ax, obb.az, 0.24, 0.03, 0.08, goldRgb);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Specialized 3D Roof Emitters (East Asian Swept Hip/Xieshan/Irimoya, Gambrel, Barrel Vault, Pyramid)
// ------------------------------------------------------------------------------------------------------------------

/**
 * East Asian Curved Eave Roof (`swept_hip` / `xieshan` / `irimoya`):
 * 2-tier concave swept slope (shallow flared lower eave + steeper upper Xieshan/Irimoya or hip slope),
 * upturned flying corner eaves (飞檐), deep timber soffits with rafter tails, and main ridge with Chiwen/Shachihoko finials.
 */
export function emitSweptRoof(out, outer, holes, plan, yEave, opts = {}) {
  const outerClean = cleanRing(outer, true) || outer;
  if (!outerClean || outerClean.length < 6) return null;
  if ((holes || []).some((h) => h && h.length >= 6)) return emitCourtyardHip(out, outerClean, holes, plan, yEave);

  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;
  const obb = plan.obb || footprintObb(outerClean);
  const k = plan.k || 0.56;
  const k1 = k * 0.54; // shallow flared lower eave tier
  const k2 = k * 1.38; // steeper upper ridge tier
  const e = Math.max(0.50, plan.eave || 0.72);

  // 1. Overhanging eave ring pushed outward around the full perimeter
  const wallEdges = [];
  const wallRing = makeRing(outerClean, wallEdges, () => 1);
  const v = velocities(wallRing, wallEdges, []);
  const eaveFlat = [];
  for (let i = 0; i < wallRing.x.length; i++) {
    eaveFlat.push(wallRing.x[i] - v[i * 2] * e, wallRing.z[i] - v[i * 2 + 1] * e);
  }
  let eaveOk = ringArea2(eaveFlat) > ringArea2(outerClean);
  const testR = [{ x: [], z: [], e: [] }];
  for (let i = 0; i < eaveFlat.length; i += 2) { testR[0].x.push(eaveFlat[i]); testR[0].z.push(eaveFlat[i + 1]); }
  if (eaveOk && !ringsValid(testR, [1])) eaveOk = false;
  const eaveUse = eaveOk ? eaveFlat : outerClean;
  const eUse = eaveOk ? e : 0;
  const yStart = yEave - eUse * k1;

  // 2. Tier 1: Lower flared concave skirt (all edges w = 1)
  const edges1 = [];
  const R0 = makeRing(eaveUse, edges1, () => 1);
  const lowerRgb = [rgb[0] * 0.94, rgb[1] * 0.94, rgb[2] * 0.94];
  const timberGableRgb = plan.trim || [0.42, 0.18, 0.14];
  const mkSlopeFace = (slopeK, tileCol) => (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    if (E.w < 1e-3) {
      // Vertical Xieshan / Irimoya upper gable pediment wall (山花 / 破风)
      tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, -E.nx, 0, -E.nz, timberGableRgb, null);
      tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, -E.nx, 0, -E.nz, timberGableRgb, null);
      return;
    }
    const s = slopeK / E.w;
    let nx = -s * E.nx, ny = 1, nz = -s * E.nz;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const f = Math.sqrt(E.w * E.w + slopeK * slopeK);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, tileCol, U(ax, az, t0), U(bx, bz, t0), U(b2x, b2z, t1));
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, tileCol, U(ax, az, t0), U(b2x, b2z, t1), U(a2x, a2z, t1));
  };

  const halfSpan = (obb ? obb.wid * 0.5 : 4.0) + eUse;
  const t1Max = Math.max(0.25, Math.min(halfSpan * 0.45, (plan.maxRise * 0.36) / Math.max(0.15, k1)));
  const s1 = inset([R0], [1], edges1, k1, yStart, t1Max, mkSlopeFace(k1, lowerRgb));
  const yMid = yStart + k1 * s1.t;
  let topY = yMid;
  let finalRings = s1.rings;

  // 3. Tier 2: Steeper upper ridge slope (Xieshan / Irimoya gable-on-hip when oblong, swept hip when square)
  if (s1.rings.length) {
    const Rm = s1.rings[0];
    const midFlat = [];
    for (let i = 0; i < Rm.x.length; i++) midFlat.push(Rm.x[i], Rm.z[i]);
    const isXieshan = obb && (obb.len / Math.max(1, obb.wid) > 1.18) && Rm.x.length >= 4;
    const midLenHalf = obb ? Math.max(0.8, obb.len * 0.5 - s1.t - 1.2) : 0;
    const isUpperGable = (ux, uz, x1, z1, x2, z2) => {
      if (!isXieshan || !obb) return false;
      if (Math.abs(ux * obb.ax + uz * obb.az) > 0.36) return false;
      const mx = (x1 + x2) * 0.5 - obb.cx, mz = (z1 + z2) * 0.5 - obb.cz;
      const a = mx * obb.ax + mz * obb.az;
      return Math.abs(a) > midLenHalf;
    };
    const edges2 = [];
    const R1 = makeRing(midFlat, edges2, (i, ux, uz, x1, z1, x2, z2) => (isUpperGable(ux, uz, x1, z1, x2, z2) ? 0 : 1));
    const remRise = Math.max(0.6, plan.maxRise + eUse * k1 - k1 * s1.t);
    const s2 = inset([R1], [1], edges2, k2, yMid, remRise / k2, mkSlopeFace(k2, rgb));
    topY = yMid + k2 * s2.t;
    finalRings = s2.rings;
  }
  if (finalRings.length) {
    capRings(out, finalRings, topY, [Math.min(1, rgb[0] * 1.03), Math.min(1, rgb[1] * 1.03), Math.min(1, rgb[2] * 1.03)], mat);
  }

  // 4. Deep timber eave soffits, fascia beam & projecting rafter tails (飞椽)
  const trim = plan.trim || [0.42, 0.18, 0.14];
  const soffitRgb = [trim[0] * 0.82, trim[1] * 0.82, trim[2] * 0.82];
  const goldAccent = [0.84, 0.66, 0.22];
  if (eUse > 0.05 && opts.soffit !== false) {
    const fh = full ? 0.24 : 0.0;
    const n = wallRing.x.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = wallRing.x[i], az = wallRing.z[i], bx = wallRing.x[j], bz = wallRing.z[j];
      const ex = eaveUse[i * 2], ez = eaveUse[i * 2 + 1], fx = eaveUse[j * 2], fz = eaveUse[j * 2 + 1];
      const ys = yStart - fh;
      quad(out, ax, ys, az, bx, ys, bz, fx, ys, fz, ex, ys, ez, 0, -1, 0, soffitRgb);
      if (fh > 0) {
        const E = wallEdges[i];
        quad(out, ex, ys, ez, fx, ys, fz, fx, yStart, fz, ex, yStart, ez, -E.nx, 0, -E.nz, trim);
        // Rafter tails (飞椽) & architrave tie-beam (额枋) in detail LOD
        if (opts.detail) {
          const edgeL = Math.hypot(fx - ex, fz - ez);
          const nRafters = Math.min(16, Math.max(2, Math.floor(edgeL / 1.05)));
          for (let r = 0; r < nRafters; r++) {
            const frac = (r + 0.5) / nRafters;
            const rx = ex + (fx - ex) * frac + E.nx * 0.18;
            const rz = ez + (fz - ez) * frac + E.nz * 0.18;
            orientedBox(opts.detail, rx, ys - 0.05, rz, E.ux, E.uz, 0.055, 0.22, 0.07, trim);
          }
        }
      }
    }
  }

  // 5. Upturned flying eave corners (飞檐翘角) & corner hip ridges (戗脊) with ridge beasts (蹲兽)
  const ridgeRgb = [Math.max(0.18, rgb[0] * 0.78), Math.max(0.19, rgb[1] * 0.78), Math.max(0.21, rgb[2] * 0.80)];
  if (eUse > 0.25 && wallRing.x.length <= 12) {
    const n = wallRing.x.length;
    for (let i = 0; i < n; i++) {
      const wx = wallRing.x[i], wz = wallRing.z[i];
      const ex = eaveUse[i * 2], ez = eaveUse[i * 2 + 1];
      const dx = ex - wx, dz = ez - wz;
      const dL = Math.hypot(dx, dz);
      if (dL < 0.25) continue;
      const cxDir = dx / dL, czDir = dz / dL;
      const pxDir = -czDir, pzDir = cxDir;
      const flareOut = Math.min(0.52, eUse * 0.58);
      const liftUp = Math.min(0.42, eUse * 0.48);
      const tipX = ex + cxDir * flareOut, tipZ = ez + czDir * flareOut, tipY = yStart + liftUp;
      const bLx = ex - cxDir * 0.15 + pxDir * 0.44, bLz = ez - czDir * 0.15 + pzDir * 0.44;
      const bRx = ex - cxDir * 0.15 - pxDir * 0.44, bRz = ez - czDir * 0.15 - pzDir * 0.44;
      const r0x = wx + cxDir * 0.10, r0z = wz + czDir * 0.10;
      const r0y = yEave + Math.min(0.95, (topY - yEave) * 0.40);

      // Swept upturned corner wing triangles + timber underside soffit
      tri(out, r0x, r0y, r0z, bLx, yStart, bLz, tipX, tipY, tipZ, pxDir * 0.35, 0.9, pzDir * 0.35, ridgeRgb, null);
      tri(out, r0x, r0y, r0z, tipX, tipY, tipZ, bRx, yStart, bRz, -pxDir * 0.35, 0.9, -pzDir * 0.35, ridgeRgb, null);
      tri(out, bLx, yStart - 0.04, bLz, bRx, yStart - 0.04, bRz, tipX, tipY - 0.03, tipZ, 0, -1, 0, soffitRgb, null);

      if (opts.detail && full) {
        // Raised corner ridge spine & 2 ornamental corner beasts (蹲兽) near the upturned tip
        for (let b = 0; b < 2; b++) {
          const bf = 0.68 + b * 0.18;
          const bx = r0x + (tipX - r0x) * bf, bz = r0z + (tipZ - r0z) * bf;
          const by = r0y + (tipY - r0y) * bf;
          orientedBox(opts.detail, bx, by, bz, cxDir, czDir, 0.07, 0.06, 0.15, goldAccent);
        }
      }
    }
  }

  // 6. Prominent Main Ridge Beam (正脊) & Ornamental End Finials (鸱吻 / Shachihoko)
  if (obb) {
    const ridgeHalf = Math.max(0.30, (obb.len - obb.wid * 0.58) * 0.5);
    orientedBox(out, obb.cx, topY - 0.05, obb.cz, obb.ax, obb.az, ridgeHalf, 0.18, 0.24, ridgeRgb);
    if (opts.detail && full) {
      orientedBox(opts.detail, obb.cx, topY + 0.19, obb.cz, obb.ax, obb.az, ridgeHalf + 0.06, 0.22, 0.07, goldAccent);
    }
    // Upturned Chiwen / Shachihoko (鸱吻) dragon-tail finials at both ends of the main ridge
    for (const s of [-1, 1]) {
      const rx = obb.cx + obb.ax * s * ridgeHalf;
      const rz = obb.cz + obb.az * s * ridgeHalf;
      orientedBox(out, rx, topY + 0.16, rz, obb.ax, obb.az, 0.22, 0.20, 0.32, ridgeRgb);
      orientedBox(out, rx + obb.ax * s * 0.10, topY + 0.44, rz + obb.az * s * 0.10, obb.ax, obb.az, 0.16, 0.15, 0.34, goldAccent);
      if (opts.detail && full) {
        orientedBox(opts.detail, rx - obb.ax * s * 0.08, topY + 0.32, rz - obb.az * s * 0.08, obb.ax, obb.az, 0.12, 0.24, 0.26, goldAccent);
      }
    }
  }

  return { ridgeY: topY };
}

/**
 * Gambrel (Barn / Dutch Colonial) & Saltbox Two-Pitch Roof (`gambrel`):
 * Steep lower slope + shallower upper ridge slope with pentagonal gable walls, knuckle trim & Dutch Colonial dormers.
 */
function emitGambrel(out, outer, holes, plan, yEave, opts = {}) {
  const obb = plan.obb || footprintObb(outer);
  if (!obb) return null;
  const wallRgb = opts.wallRgb || [0.8, 0.78, 0.74];
  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;
  const k = plan.k || 0.6;
  const k1 = Math.max(1.38, k * 2.0); // steep lower slope
  const k2 = Math.max(0.32, k * 0.55); // shallow upper slope
  const e = plan.eave || 0.40;
  const lenHalf = obb.len * 0.5;

  const isGableEdge = (ux, uz, x1, z1, x2, z2) => {
    if (Math.abs(ux * obb.ax + uz * obb.az) > 0.35) return false;
    const mx = (x1 + x2) * 0.5 - obb.cx, mz = (z1 + z2) * 0.5 - obb.cz;
    return Math.abs(mx * obb.ax + mz * obb.az) > lenHalf - 1.4;
  };

  const wallEdges = [];
  const wallRing = makeRing(outer, wallEdges, (i, ux, uz, x1, z1, x2, z2) => (isGableEdge(ux, uz, x1, z1, x2, z2) ? 0 : 1));
  const v = velocities(wallRing, wallEdges, []);
  const eaveFlat = [];
  for (let i = 0; i < wallRing.x.length; i++) eaveFlat.push(wallRing.x[i] - v[i * 2] * e, wallRing.z[i] - v[i * 2 + 1] * e);
  let eaveOk = ringArea2(eaveFlat) > ringArea2(outer);
  const testR = [{ x: [], z: [], e: [] }];
  for (let i = 0; i < eaveFlat.length; i += 2) { testR[0].x.push(eaveFlat[i]); testR[0].z.push(eaveFlat[i + 1]); }
  if (eaveOk && !ringsValid(testR, [1])) eaveOk = false;
  const eaveUse = eaveOk ? eaveFlat : outer;
  const eUse = eaveOk ? e : 0;
  const yStart = yEave - eUse * k1;

  const edges = [];
  const R0 = makeRing(eaveUse, edges, (i) => wallEdges[i].w);
  const gableRgb = [wallRgb[0] * 0.97, wallRgb[1] * 0.97, wallRgb[2] * 0.97];
  const mkFace = (slopeK, tileCol) => (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    if (E.w < 1e-3) {
      tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, -E.nx, 0, -E.nz, gableRgb, null);
      tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, -E.nx, 0, -E.nz, gableRgb, null);
      return;
    }
    const s = slopeK / E.w;
    let nx = -s * E.nx, ny = 1, nz = -s * E.nz;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const f = Math.sqrt(E.w * E.w + slopeK * slopeK);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, tileCol, U(ax, az, t0), U(bx, bz, t0), U(b2x, b2z, t1));
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, tileCol, U(ax, az, t0), U(b2x, b2z, t1), U(a2x, a2z, t1));
  };

  const t1Max = Math.max(0.25, Math.min(obb.wid * 0.21, (plan.maxRise * 0.58) / k1));
  const s1 = inset([R0], [1], edges, k1, yStart, t1Max, mkFace(k1, rgb));
  const yKnuckle = yStart + k1 * s1.t;
  let topY = yKnuckle;
  let remRings = s1.rings;

  if (s1.rings.length) {
    const upperCol = [Math.min(1, rgb[0] * 1.06), Math.min(1, rgb[1] * 1.06), Math.min(1, rgb[2] * 1.06)];
    const remRise = Math.max(0.35, plan.maxRise + eUse * k1 - k1 * s1.t);
    const s2 = inset(s1.rings, s1.signs, edges, k2, yKnuckle, remRise / k2, mkFace(k2, upperCol));
    topY = yKnuckle + k2 * s2.t;
    remRings = s2.rings;
  }
  if (remRings.length) capRings(out, remRings, topY, rgb, mat);

  // Fascia + soffit under lower overhang
  const trim = plan.trim || [0.90, 0.89, 0.86];
  if (eUse > 0.05 && opts.soffit !== false) {
    const fh = full ? 0.20 : 0.0;
    const n = wallRing.x.length;
    for (let i = 0; i < n; i++) {
      if (wallEdges[i].w < 1e-3) continue;
      const j = (i + 1) % n;
      const ax = wallRing.x[i], az = wallRing.z[i], bx = wallRing.x[j], bz = wallRing.z[j];
      const ex = eaveUse[i * 2], ez = eaveUse[i * 2 + 1], fx = eaveUse[j * 2], fz = eaveUse[j * 2 + 1];
      const ys = yStart - fh;
      quad(out, ax, ys, az, bx, ys, bz, fx, ys, fz, ex, ys, ez, 0, -1, 0, [trim[0] * 0.82, trim[1] * 0.82, trim[2] * 0.82]);
      if (fh > 0) {
        const E = wallEdges[i];
        quad(out, ex, ys, ez, fx, ys, fz, fx, yStart, fz, ex, yStart, ez, -E.nx, 0, -E.nz, trim);
      }
    }
  }

  // Ridge cap + barn hayloft window / cupola in detail LOD
  if (opts.detail && full) {
    const ridgeHalf = Math.max(0.3, obb.len * 0.5 - 0.12);
    const rRgb = [Math.min(1, rgb[0] * 1.14 + 0.03), Math.min(1, rgb[1] * 1.12 + 0.02), Math.min(1, rgb[2] * 1.10 + 0.02)];
    orientedBox(opts.detail, obb.cx, topY - 0.04, obb.cz, obb.ax, obb.az, ridgeHalf, 0.11, 0.09, rRgb);
    emitChimneyAndDormers(opts.detail, wallRing, wallEdges, plan, yEave, topY, opts);
  }

  return { ridgeY: topY };
}

/**
 * Barrel-Vault & Segmented Arch Roof (`barrel`):
 * Smooth multi-segment standing-seam metal / zinc / copper / glazed arch vault for warehouses, train sheds, markets & halls.
 */
function emitBarrelRoof(out, outer, holes, plan, yEave, opts = {}) {
  const obb = plan.obb || footprintObb(outer);
  if (!obb) return null;
  const wallRgb = opts.wallRgb || [0.76, 0.75, 0.72];
  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;
  const eave = plan.eave || 0.30;
  const halfL = obb.len * 0.5 + eave;
  const halfW = obb.wid * 0.5 + eave;
  const wallHalfL = obb.len * 0.5;
  const wallHalfW = obb.wid * 0.5;
  const rise = Math.max(1.2, plan.maxRise || obb.wid * 0.25);
  const nSeg = full ? 10 : 6;
  const y0 = yEave - 0.05;

  const ax = obb.ax, az = obb.az;
  const bx = -az, bz = ax; // cross-axis across the arch width
  const cx = obb.cx, cz = obb.cz;
  const P = (a, b) => [cx + ax * a + bx * b, cz + az * a + bz * b];
  const endWallRgb = [wallRgb[0] * 0.94, wallRgb[1] * 0.94, wallRgb[2] * 0.94];
  const ribRgb = [Math.max(0.18, rgb[0] * 0.76), Math.max(0.19, rgb[1] * 0.78), Math.max(0.21, rgb[2] * 0.80)];

  let arcAccum = 0;
  for (let s = 0; s < nSeg; s++) {
    const u0 = -1 + (2 * s) / nSeg;
    const u1 = -1 + (2 * (s + 1)) / nSeg;
    const h0 = y0 + rise * Math.sqrt(Math.max(0, 1 - u0 * u0));
    const h1 = y0 + rise * Math.sqrt(Math.max(0, 1 - u1 * u1));
    const w0 = u0 * halfW, w1 = u1 * halfW;
    const segLen = Math.hypot(w1 - w0, h1 - h0);
    const t0 = arcAccum, t1 = arcAccum + segLen;
    arcAccum = t1;

    // Outward normal of this arch segment
    const um = (u0 + u1) * 0.5;
    let nx = bx * um * 0.85, ny = Math.sqrt(Math.max(0.12, 1 - um * um * 0.72)), nz = bz * um * 0.85;
    const nL = Math.hypot(nx, ny, nz) || 1;
    nx /= nL; ny /= nL; nz /= nL;

    const A0 = P(-halfL, w0), A1 = P(halfL, w0), B1 = P(halfL, w1), B0 = P(-halfL, w1);
    const uv00 = [mat * 1000 + UV_BASE, -20 - t0];
    const uv10 = [mat * 1000 + UV_BASE + halfL * 2, -20 - t0];
    const uv11 = [mat * 1000 + UV_BASE + halfL * 2, -20 - t1];
    const uv01 = [mat * 1000 + UV_BASE, -20 - t1];

    tri(out, A0[0], h0, A0[1], A1[0], h0, A1[1], B1[0], h1, B1[1], nx, ny, nz, rgb, uv00, uv10, uv11);
    tri(out, A0[0], h0, A0[1], B1[0], h1, B1[1], B0[0], h1, B0[1], nx, ny, nz, rgb, uv00, uv11, uv01);

    // Arched tympanum end walls at -wallHalfL and +wallHalfL
    const ew0 = u0 * wallHalfW, ew1 = u1 * wallHalfW;
    const eh0 = y0 + rise * Math.sqrt(Math.max(0, 1 - u0 * u0));
    const eh1 = y0 + rise * Math.sqrt(Math.max(0, 1 - u1 * u1));
    for (const endS of [-1, 1]) {
      const eL = endS * wallHalfL;
      const C = P(eL, 0), P0 = P(eL, ew0), P1 = P(eL, ew1);
      tri(out, C[0], y0, C[1], P0[0], eh0, P0[1], P1[0], eh1, P1[1], ax * endS, 0, az * endS, endWallRgb, null);
    }

    // Structural arch ribs & glazed clerestory fanlight in detail LOD
    if (opts.detail && full) {
      const nRibs = Math.min(6, Math.max(3, Math.floor(obb.len / 7.5)));
      const mw = (w0 + w1) * 0.5, mh = (h0 + h1) * 0.5;
      for (let r = 0; r < nRibs; r++) {
        const ra = -wallHalfL + (r / Math.max(1, nRibs - 1)) * (wallHalfL * 2);
        const rp = P(ra, mw);
        orientedBox(opts.detail, rp[0], mh - 0.02, rp[1], ax, az, 0.12, segLen * 0.52, 0.11, ribRgb);
      }
      // Semi-circular dark glazed clerestory window on the center 6 segments of both end tympanums
      if (Math.abs(um) < 0.68) {
        const gw0 = ew0 * 0.68, gw1 = ew1 * 0.68;
        const gh0 = y0 + 0.25 + (eh0 - y0) * 0.66;
        const gh1 = y0 + 0.25 + (eh1 - y0) * 0.66;
        for (const endS of [-1, 1]) {
          const eL = endS * (wallHalfL + 0.04);
          const GC = P(eL, 0), GP0 = P(eL, gw0), GP1 = P(eL, gw1);
          tri(opts.detail, GC[0], y0 + 0.25, GC[1], GP0[0], gh0, GP0[1], GP1[0], gh1, GP1[1], ax * endS, 0, az * endS, [0.15, 0.21, 0.27], null);
        }
      }
    }
  }

  // Raised continuous ridge skylight monitor along the barrel vault crown
  const topY = y0 + rise;
  if (opts.detail && full && obb.len >= 7.0) {
    const monHalfL = Math.max(1.2, wallHalfL * 0.72);
    const monHalfW = Math.min(1.1, halfW * 0.22);
    orientedBox(opts.detail, cx, topY - 0.08, cz, ax, az, monHalfL, monHalfW, 0.26, ribRgb);
    orientedBox(opts.detail, cx, topY + 0.18, cz, ax, az, monHalfL + 0.08, monHalfW + 0.06, 0.06, [0.22, 0.34, 0.44]);
  }

  return { ridgeY: topY };
}

/**
 * Pyramidal / Octagonal Pavilion & Turret Cap (`pyramid`):
 * Steep 2-stage bell-cast pyramidal or octagonal spire roof converging to a true apex with finial mast.
 */
function emitPyramidRoof(out, outer, holes, plan, yEave, opts = {}) {
  const obb = plan.obb || footprintObb(outer);
  if (!obb) return null;
  const wallRgb = opts.wallRgb || [0.8, 0.78, 0.74];
  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;
  const k = plan.k || 0.95;
  const e = plan.eave || 0.35;

  const wallEdges = [];
  const wallRing = makeRing(outer, wallEdges, () => 1);
  const v = velocities(wallRing, wallEdges, []);
  const eaveFlat = [];
  for (let i = 0; i < wallRing.x.length; i++) eaveFlat.push(wallRing.x[i] - v[i * 2] * e, wallRing.z[i] - v[i * 2 + 1] * e);
  let eaveOk = ringArea2(eaveFlat) > ringArea2(outer);
  const testR = [{ x: [], z: [], e: [] }];
  for (let i = 0; i < eaveFlat.length; i += 2) { testR[0].x.push(eaveFlat[i]); testR[0].z.push(eaveFlat[i + 1]); }
  if (eaveOk && !ringsValid(testR, [1])) eaveOk = false;
  const eaveUse = eaveOk ? eaveFlat : outer;
  const eUse = eaveOk ? e : 0;
  const yStart = yEave - eUse * (k * 0.65);

  const n = eaveUse.length / 2;
  const cx = obb.cx, cz = obb.cz;
  const topY = yEave + (plan.maxRise || 4.0);
  // Two-stage bell-cast pyramid: lower flared skirt (22% of rise) + steep upper spire (78% of rise)
  const yMid = yStart + (topY - yStart) * 0.22;
  const midFrac = 0.26;
  const lowerRgb = [rgb[0] * 0.94, rgb[1] * 0.94, rgb[2] * 0.94];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = eaveUse[i * 2], az = eaveUse[i * 2 + 1];
    const bx = eaveUse[j * 2], bz = eaveUse[j * 2 + 1];
    const mAx = ax + (cx - ax) * midFrac, mAz = az + (cz - az) * midFrac;
    const mBx = bx + (cx - bx) * midFrac, mBz = bz + (cz - bz) * midFrac;

    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    let nx = dz / L, ny = 0.68, nz = -dx / L;
    const nL = Math.hypot(nx, ny, nz) || 1;
    nx /= nL; ny /= nL; nz /= nL;

    const slope1 = Math.hypot((ax + bx) * 0.5 - (mAx + mBx) * 0.5, yMid - yStart);
    const slope2 = Math.hypot((mAx + mBx) * 0.5 - cx, topY - yMid);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - ax) * ux + (z - az) * uz, -20 - t];

    // Stage 1: lower flared skirt quad
    tri(out, ax, yStart, az, bx, yStart, bz, mBx, yMid, mBz, nx, ny, nz, lowerRgb, U(ax, az, 0), U(bx, bz, 0), U(mBx, mBz, slope1));
    tri(out, ax, yStart, az, mBx, yMid, mBz, mAx, yMid, mAz, nx, ny, nz, lowerRgb, U(ax, az, 0), U(mBx, mBz, slope1), U(mAx, mAz, slope1));

    // Stage 2: steep upper pyramidal face to apex (cx, topY, cz)
    tri(out, mAx, yMid, mAz, mBx, yMid, mBz, cx, topY, cz, nx, ny * 0.82, nz, rgb, U(mAx, mAz, slope1), U(mBx, mBz, slope1), U(cx, cz, slope1 + slope2));
  }

  // Fascia + soffit under the eave overhang
  if (eUse > 0.05 && opts.soffit !== false) {
    const trim = plan.trim || [wallRgb[0] * 0.92, wallRgb[1] * 0.92, wallRgb[2] * 0.92];
    const fh = full ? 0.22 : 0.0;
    for (let i = 0; i < wallRing.x.length; i++) {
      const j = (i + 1) % wallRing.x.length;
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

  // Apex cupola base & tall finial mast in detail LOD (plus main-mesh finial base so peak silhouette is sharp)
  const finialCol = [0.22, 0.24, 0.26];
  orientedBox(out, cx, topY - 0.06, cz, obb.ax, obb.az, 0.16, 0.16, 0.34, finialCol);
  if (opts.detail && full) {
    emitChimneyAndDormers(opts.detail, wallRing, wallEdges, plan, yEave, topY, opts);
  }

  return { ridgeY: topY + 0.28 };
}

// ------------------------------------------------------------------------------------------------------------------
// Main Roof Dispatcher (`emitRoof`, `emitCourtyardHip`, `emitMansard`)
// ------------------------------------------------------------------------------------------------------------------

/**
 * Emits a 3D roof over a building whose walls stop at yEave.
 * ring: CCW flat footprint (the wall line), holes: CW-or-any rings.
 * opts: { wallRgb, soffit (bool), lod: 'full'|'cheap', detail (chimney/dormer sink or null), seed }
 * Returns { ridgeY } or null when nothing was emitted (caller then emits its flat roof).
 */
export function emitRoof(out, ring, holes, plan, yEave, opts = {}) {
  if (!plan || !ring) return null;
  const outer0 = cleanRing(ring, true);
  if (!outer0) return null;
  let outer = outer0.length / 2 > 14 ? cleanRing(simplifyRing(outer0, 0.35), true) || outer0 : outer0;
  if (outer.length / 2 > 40) return null;
  if (out && Array.isArray(out.triEntity) && out.entityIdx === undefined && opts.entityIdx !== undefined) {
    out.entityIdx = opts.entityIdx;
  }

  if (plan.shape === 'mansard') return emitMansard(out, outer, holes, plan, yEave, opts);
  if (plan.shape === 'swept_hip' || plan.shape === 'xieshan' || plan.shape === 'irimoya') {
    return emitSweptRoof(out, outer, holes, plan, yEave, opts);
  }
  if (plan.shape === 'gambrel') return emitGambrel(out, outer, holes, plan, yEave, opts);
  if (plan.shape === 'barrel') return emitBarrelRoof(out, outer, holes, plan, yEave, opts);
  if (plan.shape === 'pyramid') return emitPyramidRoof(out, outer, holes, plan, yEave, opts);
  if ((holes || []).some((h) => h && h.length >= 6)) return emitCourtyardHip(out, outer, holes, plan, yEave);

  const wallRgb = opts.wallRgb || [0.8, 0.78, 0.74];
  const full = opts.lod !== 'cheap';
  const rgb = plan.rgb;
  const mat = plan.mat;
  const obb = plan.obb || footprintObb(outer);
  const steppedGable = plan.shape === 'stepped_gable';
  const gable = plan.shape === 'gable' || steppedGable;
  const k = plan.k;
  const e = plan.eave;
  const lenHalf = obb ? obb.len * 0.5 : 0;

  const isGableEdge = (ux, uz, x1, z1, x2, z2) => {
    if (!gable || !obb) return false;
    if (Math.abs(ux * obb.ax + uz * obb.az) > 0.35) return false;
    const mx = (x1 + x2) * 0.5 - obb.cx, mz = (z1 + z2) * 0.5 - obb.cz;
    const a = mx * obb.ax + mz * obb.az;
    return Math.abs(a) > lenHalf - 1.4;
  };

  // 1. Eave ring: wall ring pushed out by the overhang (gable ends stay flush)
  const wallEdges = [];
  const wallRing = makeRing(outer, wallEdges, (i, ux, uz, x1, z1, x2, z2) => (isGableEdge(ux, uz, x1, z1, x2, z2) ? 0 : 1));
  const v = velocities(wallRing, wallEdges, []);
  const eaveFlat = [];
  for (let i = 0; i < wallRing.x.length; i++) eaveFlat.push(wallRing.x[i] - v[i * 2] * e, wallRing.z[i] - v[i * 2 + 1] * e);
  let eaveOk = ringArea2(eaveFlat) > ringArea2(outer);
  const testR = [{ x: [], z: [], e: [] }];
  for (let i = 0; i < eaveFlat.length; i += 2) { testR[0].x.push(eaveFlat[i]); testR[0].z.push(eaveFlat[i + 1]); }
  if (eaveOk && !ringsValid(testR, [1])) eaveOk = false;
  const eaveUse = eaveOk ? eaveFlat : outer;
  const eUse = eaveOk ? e : 0;
  const yStart = yEave - eUse * k;

  // 2. Skeleton faces
  const edges = [];
  const R0 = makeRing(eaveUse, edges, (i) => wallEdges[i].w);
  const sq = (w) => Math.sqrt(w * w + k * k);
  const gableRgb = [wallRgb[0] * 0.97, wallRgb[1] * 0.97, wallRgb[2] * 0.97];
  const face = (ax, az, bx, bz, b2x, b2z, a2x, a2z, E, ya, yb, t0, t1) => {
    if (E.w < 1e-3) {
      tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, -E.nx, 0, -E.nz, gableRgb, null);
      tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, -E.nx, 0, -E.nz, gableRgb, null);
      return;
    }
    const s = k / E.w;
    let nx = -s * E.nx, ny = 1, nz = -s * E.nz;
    const L = Math.hypot(nx, ny, nz) || 1;
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

  // 2b. Dutch / Northern European Crow-Stepped & Bell Gable Parapets (`stepped_gable`)
  if (steppedGable) {
    const stepBrickRgb = [gableRgb[0] * 0.94, gableRgb[1] * 0.88, gableRgb[2] * 0.84];
    const copeRgb = plan.trim || [0.89, 0.87, 0.82];
    const nW = wallRing.x.length;
    for (let i = 0; i < nW; i++) {
      const E = wallEdges[i];
      if (E.w >= 1e-3) continue; // only on gable end walls
      const j = (i + 1) % nW;
      const x1 = wallRing.x[i], z1 = wallRing.z[i], x2 = wallRing.x[j], z2 = wallRing.z[j];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 2.2) continue;
      const mx = (x1 + x2) * 0.5 + E.nx * 0.14;
      const mz = (z1 + z2) * 0.5 + E.nz * 0.14;
      const nSteps = L >= 11 ? 7 : L >= 7.5 ? 6 : 5;
      const peakY = topY + 0.46;
      const totalH = peakY - yEave;

      for (let st = 0; st < nSteps; st++) {
        const frac0 = st / nSteps;
        const frac1 = (st + 1) / nSteps;
        const hw = (L * 0.5) * (1.0 - frac0 * 0.84) + 0.08;
        const y0 = yEave + frac0 * totalH * 0.84;
        const y1 = yEave + frac1 * totalH;
        // Stair-stepped brick parapet tier + stone coping cap
        orientedBox(out, mx, y0, mz, E.ux, E.uz, hw, 0.22, Math.max(0.12, y1 - y0), stepBrickRgb);
        orientedBox(out, mx, y1, mz, E.ux, E.uz, hw + 0.05, 0.26, 0.07, copeRgb);
      }
      // Central stone finial pedestal & pinnacle peak
      orientedBox(out, mx, peakY + 0.07, mz, E.ux, E.uz, 0.22, 0.22, 0.34, copeRgb);
      orientedBox(out, mx, peakY + 0.41, mz, E.ux, E.uz, 0.10, 0.10, 0.22, [0.25, 0.27, 0.30]);

      // Attic loft shutter window & Dutch hoisting beam (hijsbalk) in detail LOD
      if (opts.detail && full && totalH >= 2.2) {
        const wy = yEave + totalH * 0.34;
        const wx = mx - E.nx * 0.16, wz = mz - E.nz * 0.16;
        orientedBox(opts.detail, wx, wy - 0.06, wz, E.ux, E.uz, 0.44, 0.06, 0.08, copeRgb);
        orientedBox(opts.detail, wx, wy + 0.02, wz, E.ux, E.uz, 0.38, 0.04, 0.88, [0.16, 0.20, 0.25]);
        orientedBox(opts.detail, wx - E.nx * 0.02, wy + 0.02, wz - E.nz * 0.02, E.ux, E.uz, 0.03, 0.03, 0.88, copeRgb);
        orientedBox(opts.detail, wx - E.nx * 0.02, wy + 0.46, wz - E.nz * 0.02, E.ux, E.uz, 0.38, 0.03, 0.04, copeRgb);
        orientedBox(opts.detail, wx, wy + 0.90, wz, E.ux, E.uz, 0.46, 0.07, 0.10, copeRgb);
        // Projecting cargo hoist beam (hijsbalk) near the peak
        orientedBox(opts.detail, wx - E.nx * 0.22, peakY - 0.38, wz - E.nz * 0.22, E.nx, E.nz, 0.28, 0.06, 0.08, [0.22, 0.20, 0.18]);
      }
    }
  }

  // 3. Fascia + stepped drip-edge molding + soffit under the overhang
  if (eUse > 0.05 && opts.soffit !== false) {
    const trim = plan.trim || [wallRgb[0] * 0.92, wallRgb[1] * 0.92, wallRgb[2] * 0.92];
    const trimHi = [Math.min(1, trim[0] * 1.06), Math.min(1, trim[1] * 1.06), Math.min(1, trim[2] * 1.06)];
    const fh = full ? 0.22 : 0.0;
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
        if (opts.detail) {
          const ox = -E.nx * 0.032, oz = -E.nz * 0.032;
          quad(opts.detail, ex + ox, yStart - 0.06, ez + oz, fx + ox, yStart - 0.06, fz + oz, fx + ox, yStart + 0.02, fz + oz, ex + ox, yStart + 0.02, ez + oz, -E.nx, 0, -E.nz, trimHi);
        }
      }
    }
  }

  // 3b. Ridge cap along the main roof ridge (detail LOD)
  if (opts.detail && obb && full && !res.rings.length) {
    const ridgeHalf = gable ? Math.max(0, obb.len * 0.5 - 0.08) : Math.max(0, (obb.len - obb.wid) * 0.5);
    if (ridgeHalf > 0.25) {
      const rRgb = [Math.min(1, rgb[0] * 1.14 + 0.03), Math.min(1, rgb[1] * 1.12 + 0.02), Math.min(1, rgb[2] * 1.10 + 0.02)];
      orientedBox(opts.detail, obb.cx, topY - 0.04, obb.cz, obb.ax, obb.az, ridgeHalf, 0.11, 0.09, rRgb, true, true);
      for (const s of [-1, 1]) {
        orientedBox(opts.detail, obb.cx + obb.ax * s * (ridgeHalf - 0.08), topY + 0.05, obb.cz + obb.az * s * (ridgeHalf - 0.08), obb.ax, obb.az, 0.09, 0.13, 0.06, rRgb, true, true);
      }
    }
  }

  // 4. Dormers, ornate brick/stone chimneys, skylights & ridge cresting (detail LOD)
  if (opts.detail && full) {
    emitChimneyAndDormers(opts.detail, wallRing, wallEdges, plan, yEave, topY, opts);
  }

  return { ridgeY: steppedGable ? topY + 0.55 : topY };
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
    const L = Math.hypot(nx, ny, nz) || 1;
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
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const f = Math.sqrt(1 + k * k);
    const U = (x, z, t) => [mat * 1000 + UV_BASE + (x - E.ox) * E.ux + (z - E.oz) * E.uz, -20 - t * f];
    tri(out, ax, ya, az, bx, ya, bz, b2x, yb, b2z, nx, ny, nz, rgb, U(ax, az, t0), U(bx, bz, t0), U(b2x, b2z, t1));
    tri(out, ax, ya, az, b2x, yb, b2z, a2x, yb, a2z, nx, ny, nz, rgb, U(ax, az, t0), U(b2x, b2z, t1), U(a2x, a2z, t1));
  };
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

  // Arched / Bullseye / Pedimented Mansard Dormers, Ornate Party-Wall Chimneys & Wrought-Iron Cresting
  if (opts.detail && opts.lod !== 'cheap') {
    emitChimneyAndDormers(opts.detail, rings[0], edges, plan, yEave, yTop, { ...opts, holes });
  }
  return { ridgeY: yTop };
}

// ------------------------------------------------------------------------------------------------------------------
// Suburban yards: driveways, fences / hedges / garden walls, pools, pergolas, greenhouses, firepits & topiary
// ------------------------------------------------------------------------------------------------------------------

const YARD_REGIONS = {
  us: 1, la: 1, sf: 0.35, nyc: 0.55, uk: 1, eu: 1, centralEu: 1, eastEu: 0.9, nordic: 1, med: 0.65,
  latam: 0.6, mideast: 0.6, beijing: 0.4, china: 0.45, japan: 0.65, global: 0.8, seasia: 0.55, seAsia: 0.55, paris: 0.65,
};

/**
 * houses: [{ ring (CCW flat), cx, cz, obb, region, seed, yBase }] — small pitched-roof residential footprints.
 * others: [{ minX, maxX, minZ, maxZ, ring }] every footprint in the chunk (for neighbour clearance).
 * roads: chunk-local road segments { x1, z1, x2, z2, tx, tz, isFootway, hw }.
 * pools: mapped swimming-pool rings (flat). getY(x, z): terrain. sinkFor(x, z) -> detail buffers.
 */
export function buildYards(houses, others, roads, pools, getY, sinkFor) {
  if (!houses.length) return;
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

  /** Sculpted 2-tier geometric topiary bush in a terracotta/stone planter urn. */
  const emitTopiaryBush = (sink, tx, tz, ax, az) => {
    const ty = getY(tx, tz);
    orientedBox(sink, tx, ty + 0.02, tz, ax, az, 0.24, 0.24, 0.28, [0.68, 0.40, 0.28]);
    orientedBox(sink, tx, ty + 0.30, tz, ax, az, 0.28, 0.28, 0.05, [0.76, 0.46, 0.32]);
    orientedBox(sink, tx, ty + 0.35, tz, ax, az, 0.36, 0.36, 0.44, [0.16, 0.42, 0.18]);
    orientedBox(sink, tx, ty + 0.79, tz, ax, az, 0.26, 0.26, 0.34, [0.22, 0.50, 0.21]);
    orientedBox(sink, tx, ty + 1.13, tz, ax, az, 0.15, 0.15, 0.22, [0.28, 0.58, 0.25]);
  };

  const seenFence = new Set();
  for (const h of houses) {
    const wantYard = YARD_REGIONS[h.region] ?? 0.7;
    if (rnd(h.seed, 101) > wantYard) continue;
    const ci = Math.floor(h.cx / CELL), cj = Math.floor(h.cz / CELL);
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
    let fx = (best.px - h.cx) / bestD, fz = (best.pz - h.cz) / bestD;
    const ax = -fz, az = fx;
    const proj = (x, z) => [(x - h.cx) * ax + (z - h.cz) * az, (x - h.cx) * fx + (z - h.cz) * fz];
    let a0 = Infinity, a1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (let i = 0; i < h.ring.length; i += 2) {
      const [a, f] = proj(h.ring[i], h.ring[i + 1]);
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); f0 = Math.min(f0, f); f1 = Math.max(f1, f);
    }
    const roadHalf = (best.s.hw || 4) + 1.6;
    const front = bestD - roadHalf;
    if (front - f1 < 2.0) continue;
    let sideL = 4.0, sideR = 4.0, back = 11.0;
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
            h.blocked = true;
          }
        }
      }
    }
    const lotA0 = a0 - sideL, lotA1 = a1 + sideR, lotB = f0 - back;
    const W = (a, f) => [h.cx + ax * a + fx * f, h.cz + az * a + fz * f];
    const sink = sinkFor(h.cx, h.cz);
    const region = h.region;
    const wall = region === 'la' || region === 'latam' || region === 'mideast' || region === 'med' || region === 'beijing' || region === 'china';
    const hedge = region === 'uk' || region === 'eu' || region === 'centralEu' || region === 'eastEu' || region === 'nordic' || region === 'paris' || region === 'japan';

    // Driveway
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

    // Front walkway, entrance stoop, flowerbed planters & topiary accents
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
      const [sx0, sz0] = W(walkA, f1 + 0.34);
      const sy0 = getY(sx0, sz0);
      const stoopRgb = [0.78, 0.75, 0.70], cheekRgb = [0.62, 0.44, 0.36], copeRgb = [0.86, 0.84, 0.79];
      orientedBox(sink, sx0, sy0 + 0.04, sz0, ax, az, walkHalfW + 0.08, 0.36, 0.28, stoopRgb);
      const [sx1, sz1] = W(walkA, f1 + 0.82);
      orientedBox(sink, sx1, sy0 + 0.04, sz1, ax, az, walkHalfW + 0.04, 0.20, 0.15, stoopRgb);
      for (const cs of [-1, 1]) {
        const ca = walkA + cs * (walkHalfW + 0.16);
        const [cxW, czW] = W(ca, f1 + 0.46);
        orientedBox(sink, cxW, sy0 + 0.04, czW, ax, az, 0.12, 0.48, 0.50, cheekRgb);
        orientedBox(sink, cxW, sy0 + 0.54, czW, ax, az, 0.15, 0.52, 0.06, copeRgb);
      }

      const shrubRgb = [0.16, 0.36, 0.15];
      const flowerPick = Math.floor(rnd(h.seed, 131) * 3);
      const bloomRgb = flowerPick === 0 ? [0.86, 0.32, 0.42] : flowerPick === 1 ? [0.64, 0.44, 0.82] : [0.92, 0.72, 0.22];
      const bedSpans = [
        [driveSide < 0 ? a0 + 3.5 : a0 + 0.45, walkA - walkHalfW - 0.35],
        [walkA + walkHalfW + 0.35, driveSide > 0 ? a1 - 3.5 : a1 - 0.45],
      ];
      let bayAdded = false;
      for (let bIdx = 0; bIdx < bedSpans.length; bIdx++) {
        const [ba0, ba1] = bedSpans[bIdx];
        const bLen = (ba1 - ba0) * 0.5;
        if (bLen < 0.55) continue;
        const bcA = (ba0 + ba1) * 0.5;
        const [bx, bz] = W(bcA, f1 + 0.48);
        const by = getY(bx, bz);
        orientedBox(sink, bx, by + 0.04, bz, ax, az, bLen, 0.42, 0.52, shrubRgb);
        orientedBox(sink, bx, by + 0.56, bz, ax, az, Math.max(0.35, bLen - 0.08), 0.34, 0.12, bloomRgb);
        if (!bayAdded && bLen >= 0.95) {
          bayAdded = true;
          const [bayX, bayZ] = W(bcA, f1 + 0.26);
          const bayW = Math.min(0.95, bLen * 0.72);
          orientedBox(sink, bayX, by + 0.68, bayZ, ax, az, bayW + 0.06, 0.32, 0.12, copeRgb);
          orientedBox(sink, bayX, by + 0.80, bayZ, ax, az, bayW, 0.28, 1.38, [0.90, 0.88, 0.84]);
          orientedBox(sink, bayX + fx * 0.03, by + 0.92, bayZ + fz * 0.03, ax, az, bayW - 0.10, 0.27, 1.12, [0.16, 0.22, 0.28]);
          orientedBox(sink, bayX + fx * 0.29, by + 0.90, bayZ + fz * 0.29, ax, az, 0.035, 0.02, 1.16, copeRgb);
          orientedBox(sink, bayX, by + 2.18, bayZ, ax, az, bayW + 0.10, 0.36, 0.10, copeRgb);
          orientedBox(sink, bayX, by + 2.28, bayZ, ax, az, bayW + 0.04, 0.32, 0.08, [0.28, 0.30, 0.34]);
        }
      }
    }

    // Back + side boundaries
    const fenceRgb = wall
      ? [0.82, 0.77, 0.68]
      : hedge
        ? [0.17, 0.30, 0.13]
        : rnd(h.seed, 109) < 0.7 ? [0.50, 0.38, 0.27] : [0.60, 0.52, 0.42];
    const fH = hedge ? 1.4 : 1.8;
    const segs = [];
    if (back > 1.2) segs.push([lotA0, lotB, lotA1, lotB]);
    const fEnd = Math.min(front, f1 + 0.5) - 0.8;
    if (sideL > 0.6) segs.push([lotA0, lotB, lotA0, fEnd]);
    if (sideR > 0.6) segs.push([lotA1, lotB, lotA1, fEnd]);
    if (region !== 'us' && region !== 'la' && region !== 'sf' && front - f1 > 3) segs.push([lotA0, front - 0.4, lotA1, front - 0.4, 0.9]);
    for (const sg of segs) {
      const [sa0, sf0, sa1, sf1, hOverride] = sg;
      const P = W(sa0, sf0), Q = W(sa1, sf1);
      const fk = `${Math.round((P[0] + Q[0]) * 0.5)},${Math.round((P[1] + Q[1]) * 0.5)}`;
      if (seenFence.has(fk)) continue;
      seenFence.add(fk);
      const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      if (L < 1) continue;
      if (!hOverride && nearRoad((P[0] + Q[0]) * 0.5, (P[1] + Q[1]) * 0.5, 3.5)) continue;
      const n = Math.max(1, Math.ceil(L / 7));
      const ux = (Q[0] - P[0]) / L, uz = (Q[1] - P[1]) / L;
      const hh = hOverride || fH;
      for (let s = 0; s < n; s++) {
        const x1 = P[0] + (Q[0] - P[0]) * (s / n), z1 = P[1] + (Q[1] - P[1]) * (s / n);
        const x2 = P[0] + (Q[0] - P[0]) * ((s + 1) / n), z2 = P[1] + (Q[1] - P[1]) * ((s + 1) / n);
        const y1 = getY(x1, z1) - 0.1, y2 = getY(x2, z2) - 0.1;
        if (hedge) {
          const ox = -uz * 0.45, oz = ux * 0.45;
          const c = fenceRgb, cTop = [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15];
          quad(sink, x1 + ox, y1, z1 + oz, x2 + ox, y2, z2 + oz, x2 + ox * 0.6, y2 + hh, z2 + oz * 0.6, x1 + ox * 0.6, y1 + hh, z1 + oz * 0.6, -uz, 0.25, ux, c);
          quad(sink, x1 - ox, y1, z1 - oz, x2 - ox, y2, z2 - oz, x2 - ox * 0.6, y2 + hh, z2 - oz * 0.6, x1 - ox * 0.6, y1 + hh, z1 - oz * 0.6, uz, 0.25, -ux, c);
          quad(sink, x1 + ox * 0.6, y1 + hh, z1 + oz * 0.6, x2 + ox * 0.6, y2 + hh, z2 + oz * 0.6, x2 - ox * 0.6, y2 + hh, z2 - oz * 0.6, x1 - ox * 0.6, y1 + hh, z1 - oz * 0.6, 0, 1, 0, cTop);
        } else {
          if (wall) quad(sink, x1, y1, z1, x2, y2, z2, x2, y2 + hh, z2, x1, y1 + hh, z1, -uz, 0, ux, fenceRgb);
          else {
            const s0 = (s * L) / n, s1 = ((s + 1) * L) / n;
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

    // Backyard Pool (warm regions, room behind the house, no mapped pool on the lot)
    let hasPool = false;
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
          hasPool = true;
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

          const deckHl = Math.min(pl * 0.78, 2.35), deckHw = 0.82;
          const deckF = pf + pw + 0.5 + deckHw + 0.08;
          const [dcx, dcz] = W(pa, deckF);
          orientedBox(sink, dcx, y + 0.04, dcz, ax, az, deckHl, deckHw, 0.14, [0.58, 0.40, 0.25]);
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

    // Rich Backyard & Patio Structures (Timber Pergola/Gazebo, Greenhouse Glass Shed, Stone Patio Firepit/BBQ, Hedgerow Topiary)
    const lotSpanA = lotA1 - lotA0;
    if (back >= 4.8 && lotSpanA >= 6.8) {
      const midA = (lotA0 + lotA1) * 0.5;
      const patioRoll = rnd(h.seed, 151);

      // A. Timber Backyard Pergola / Gazebo right behind the house (when no pool or offset to the side)
      if (!hasPool && patioRoll < 0.58) {
        const pgHl = Math.min(2.2, lotSpanA * 0.26);
        const pgHw = Math.min(1.65, back * 0.24);
        const pgA = midA + (rnd(h.seed, 157) - 0.5) * Math.max(0, lotSpanA * 0.25);
        const pgF = f0 - 0.65 - pgHw;
        const [pgX, pgZ] = W(pgA, pgF);
        const py = getY(pgX, pgZ);
        const woodRgb = [0.52, 0.34, 0.20];
        const woodHi = [0.60, 0.40, 0.24];
        const stoneDeck = [0.76, 0.73, 0.68];

        // Raised stone/timber patio deck pad
        orientedBox(sink, pgX, py + 0.03, pgZ, ax, az, pgHl + 0.25, pgHw + 0.25, 0.14, stoneDeck);
        // 4 corner timber pergola posts
        const postH = 2.35;
        for (const sa of [-1, 1]) {
          for (const sf of [-1, 1]) {
            const [px, pz] = W(pgA + sa * (pgHl - 0.14), pgF + sf * (pgHw - 0.14));
            orientedBox(sink, px, py + 0.17, pz, ax, az, 0.09, 0.09, postH, woodRgb);
          }
        }
        // 2 main longitudinal ledger beams
        for (const sf of [-1, 1]) {
          const [bx, bz] = W(pgA, pgF + sf * (pgHw - 0.14));
          orientedBox(sink, bx, py + 0.17 + postH, bz, ax, az, pgHl + 0.18, 0.08, 0.14, woodRgb);
        }
        // 6 overhanging cross-rafter slats + climbing vine greenery patches
        const nSlats = 6;
        for (let s = 0; s < nSlats; s++) {
          const sa = -pgHl + ((s + 0.5) / nSlats) * (pgHl * 2);
          const [rx, rz] = W(pgA + sa, pgF);
          orientedBox(sink, rx, py + 0.31 + postH, rz, ax, az, 0.05, pgHw + 0.20, 0.11, woodHi);
        }
        if (rnd(h.seed, 163) < 0.65) {
          orientedBox(sink, pgX, py + 0.42 + postH, pgZ, ax, az, pgHl * 0.72, pgHw * 0.68, 0.12, [0.22, 0.48, 0.20]);
        }
        // Outdoor timber dining table & 2 benches under the pergola
        orientedBox(sink, pgX, py + 0.17, pgZ, ax, az, 0.72, 0.42, 0.72, woodHi);
        for (const sf of [-0.68, 0.68]) {
          const [tbx, tbz] = W(pgA, pgF + sf);
          orientedBox(sink, tbx, py + 0.17, tbz, ax, az, 0.68, 0.18, 0.44, woodRgb);
        }
      } else if (!hasPool) {
        // B. Stone Patio Firepit & Outdoor Brick Barbecue Set
        const fpA = midA + (rnd(h.seed, 167) - 0.5) * Math.max(0, lotSpanA * 0.22);
        const fpF = f0 - Math.min(3.2, back * 0.42);
        const [fpX, fpZ] = W(fpA, fpF);
        const fy = getY(fpX, fpZ);
        const flagstone = [0.70, 0.68, 0.64];
        const fireStone = [0.52, 0.48, 0.44];

        // Flagstone patio pad
        orientedBox(sink, fpX, fy + 0.03, fpZ, ax, az, 1.85, 1.65, 0.10, flagstone);
        // Circular/octagonal stone firepit ring + glowing ember bed
        orientedBox(sink, fpX, fy + 0.13, fpZ, ax, az, 0.54, 0.54, 0.36, fireStone);
        orientedBox(sink, fpX, fy + 0.49, fpZ, ax, az, 0.36, 0.36, 0.05, [0.92, 0.40, 0.12]);
        // 3 patio benches arranged around the firepit
        const benchRgb = [0.48, 0.32, 0.20];
        for (const [ba, bf, bhl, bhw] of [[-1.15, 0, 0.22, 0.68], [1.15, 0, 0.22, 0.68], [0, -1.10, 0.72, 0.22]]) {
          const [bx, bz] = W(fpA + ba, fpF + bf);
          orientedBox(sink, bx, fy + 0.13, bz, ax, az, bhl, bhw, 0.44, benchRgb);
        }
        // Outdoor brick barbecue grill station with stainless hood & mini chimney
        const [bbqX, bbqZ] = W(fpA + 1.35, fpF + 1.05);
        orientedBox(sink, bbqX, fy + 0.13, bbqZ, ax, az, 0.48, 0.36, 0.88, [0.58, 0.32, 0.24]);
        orientedBox(sink, bbqX, fy + 1.01, bbqZ, ax, az, 0.42, 0.32, 0.32, [0.74, 0.76, 0.78]);
        orientedBox(sink, bbqX, fy + 1.33, bbqZ, ax, az, 0.14, 0.14, 0.48, [0.30, 0.31, 0.33]);
      }

      // C. Greenhouse Glass Shed in a rear yard corner
      if (back >= 6.2 && lotSpanA >= 7.8 && rnd(h.seed, 173) < 0.48) {
        const ghSide = rnd(h.seed, 179) < 0.5 ? -1 : 1;
        const ghHl = 1.35, ghHw = 1.05;
        const ghA = ghSide < 0 ? lotA0 + ghHl + 0.75 : lotA1 - ghHl - 0.75;
        const ghF = lotB + ghHw + 0.85;
        const [ghX, ghZ] = W(ghA, ghF);
        const gy = getY(ghX, ghZ);
        const dwarfBrick = [0.56, 0.34, 0.26];
        const glassWall = [0.32, 0.58, 0.62];
        const frameWhite = [0.90, 0.92, 0.94];
        const roofGlass = [0.38, 0.66, 0.70];

        // Low brick dwarf base wall + interior lush green plant bed
        orientedBox(sink, ghX, gy + 0.02, ghZ, ax, az, ghHl, ghHw, 0.46, dwarfBrick);
        orientedBox(sink, ghX, gy + 0.48, ghZ, ax, az, ghHl - 0.16, ghHw - 0.16, 0.38, [0.20, 0.52, 0.22]);
        // Translucent glazed walls + white aluminum corner/mullion posts
        orientedBox(sink, ghX, gy + 0.48, ghZ, ax, az, ghHl - 0.03, ghHw - 0.03, 1.32, glassWall);
        for (const sa of [-1, 0, 1]) {
          for (const sf of [-1, 1]) {
            const [mx, mz] = W(ghA + sa * (ghHl - 0.04), ghF + sf * (ghHw - 0.04));
            orientedBox(sink, mx, gy + 0.48, mz, ax, az, 0.045, 0.045, 1.34, frameWhite);
          }
        }
        // Pitched glass gable roof + white ridge beam
        const yGhEave = gy + 1.80, yGhPeak = gy + 2.48;
        const g1 = W(ghA - ghHl - 0.06, ghF - ghHw - 0.06);
        const g2 = W(ghA + ghHl + 0.06, ghF - ghHw - 0.06);
        const g3 = W(ghA + ghHl + 0.06, ghF + ghHw + 0.06);
        const g4 = W(ghA - ghHl - 0.06, ghF + ghHw + 0.06);
        const rL = W(ghA - ghHl - 0.06, ghF), rR = W(ghA + ghHl + 0.06, ghF);
        quad(sink, g1[0], yGhEave, g1[1], g2[0], yGhEave, g2[1], rR[0], yGhPeak, rR[1], rL[0], yGhPeak, rL[1], -fx * 0.5, 0.86, -fz * 0.5, roofGlass);
        quad(sink, g3[0], yGhEave, g3[1], g4[0], yGhEave, g4[1], rL[0], yGhPeak, rL[1], rR[0], yGhPeak, rR[1], fx * 0.5, 0.86, fz * 0.5, roofGlass);
        tri(sink, g1[0], yGhEave, g1[1], g4[0], yGhEave, g4[1], rL[0], yGhPeak, rL[1], -ax, 0, -az, glassWall, null);
        tri(sink, g2[0], yGhEave, g2[1], rR[0], yGhPeak, rR[1], g3[0], yGhEave, g3[1], ax, 0, az, glassWall, null);
        orientedBox(sink, ghX, yGhPeak - 0.03, ghZ, ax, az, ghHl + 0.08, 0.06, 0.07, frameWhite);
      }

      // D. Sculpted Hedgerow Topiary Bushes flanking the rear patio / corners
      if (rnd(h.seed, 191) < 0.72) {
        const topLocations = [
          [lotA0 + 0.85, f0 - 0.85],
          [lotA1 - 0.85, f0 - 0.85],
        ];
        if (back >= 6.5) {
          topLocations.push([lotA0 + 0.85, lotB + 0.85], [lotA1 - 0.85, lotB + 0.85]);
        }
        for (const [ta, tf] of topLocations) {
          const [tx, tz] = W(ta, tf);
          emitTopiaryBush(sink, tx, tz, ax, az);
        }
      }
    }
  }
}
