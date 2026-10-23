// [feature/street] Worker-side generator for street furniture placements, road-surface highway shields/stencils,
// overhead highway gantry signs, roadside traffic signs, and road detail geometry.
// Runs inside the chunk Web Worker (and in the main-thread fallback build path).
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation } from '../environment.js';

const STRIDE = 5;
const SIG_STRIDE = 8;
const HEAD_STRIDE = 5;

const STREET_CLS = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const MAJOR_CLS = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const SIDEWALK_CLS = new Set(['primary', 'secondary', 'tertiary', 'residential']); // matches chunk_builder sidewalks
const LINE_CLS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);
const WEAR_CLS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'motorway_link', 'trunk_link', 'primary_link']);
const SHIELD_CLS = new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']);
const GANTRY_CLS = new Set(['motorway', 'trunk', 'primary']);

// Mirrors ROAD_Y_BIAS in chunk_builder.js (fallback surface height when no segment is found)
const Y_BIAS = {
  service: 0.38, residential: 0.43, tertiary_link: 0.48, tertiary: 0.52, secondary_link: 0.57, secondary: 0.62,
  primary_link: 0.68, primary: 0.74, trunk_link: 0.8, trunk: 0.86, motorway_link: 0.83, motorway: 0.92,
};

// Road-surface decal atlas cell indices (4x4 grid on 2048x2048 CanvasTexture in street_furniture.js)
export const DECAL_CELLS = {
  SHIELD_I80: 0,
  SHIELD_I280: 1,
  SHIELD_US101: 2,
  SHIELD_CA1: 3,
  SHIELD_I95: 4,
  SHIELD_EU_E15: 5,
  SHIELD_ASIA_G2: 6,
  ROUNDEL_80: 7,
  ROUNDEL_50: 8,
  STENCIL_STOP: 9,
  STENCIL_SLOW: 10,
  STENCIL_SPEED35: 11,
  STENCIL_ONLY_LEFT: 12,
  STENCIL_ONLY_RIGHT: 13,
  STENCIL_ARROW_STRAIGHT: 14,
  STENCIL_ARROW_COMBO: 15,
};

// Region conventions: driving side, center-line color, street light / signal styles.
const REGION_STYLE = {
  cn: { left: false, center: 'yellow', lamp: 'lampDouble', lampMinor: 'lampArm', sigH: false, hydrant: 0.25, dash: [6, 9] },
  kr: { left: false, center: 'yellow', lamp: 'lampArm', lampMinor: 'lampArm', sigH: true, hydrant: 0.25, dash: [6, 9] },
  us: { left: false, center: 'yellow', lamp: 'lampCobra', lampMinor: 'lampCobra', sigH: false, hydrant: 1.0, dash: [3, 9] },
  jp: { left: true, center: 'white', lamp: 'lampArm', lampMinor: 'lampArm', sigH: true, hydrant: 0.3, dash: [5, 5] },
  uk: { left: true, center: 'white', lamp: 'lampArm', lampMinor: 'lampPost', sigH: false, hydrant: 0.0, dash: [2, 7] },
  au: { left: true, center: 'white', lamp: 'lampArm', lampMinor: 'lampArm', sigH: false, hydrant: 0.3, dash: [3, 9] },
  eu: { left: false, center: 'white', lamp: 'lampArm', lampMinor: 'lampPost', sigH: false, hydrant: 0.3, dash: [3, 6] },
  intl: { left: false, center: 'white', lamp: 'lampArm', lampMinor: 'lampArm', sigH: false, hydrant: 0.3, dash: [3, 9] },
};

const REGION_HIGHWAY_REFS = {
  us: {
    motorway: ['I-80', 'I-280', 'US 101', 'I-580', 'I-880', 'I-95'],
    trunk: ['US 101', 'CA 1', 'I-280', 'I-80', 'SR 82', 'US 50'],
    primary: ['US 101', 'CA 1', 'I-280', 'I-80', 'SR 35', 'SR 82'],
    secondary: ['CA 1', 'SR 82', 'US 101', 'SR 35'],
  },
  eu: {
    motorway: ['E 15', 'A 1', 'A 6', 'E 5', 'A 4'],
    trunk: ['E 15', 'N 7', 'A 1', 'E 40'],
    primary: ['N 7', 'D 910', 'E 15', 'B 2'],
    secondary: ['D 910', 'N 7', 'B 2'],
  },
  uk: {
    motorway: ['M 1', 'M 4', 'M 25', 'A 1(M)'],
    trunk: ['A 1', 'A 4', 'A 40', 'A 13'],
    primary: ['A 4', 'A 3212', 'A 202', 'A 10'],
    secondary: ['A 3212', 'B 300', 'A 4'],
  },
  jp: {
    motorway: ['C 1', 'C 2', 'E 1', 'Route 3', 'B'],
    trunk: ['R 246', 'R 20', 'R 1', 'R 15'],
    primary: ['R 246', 'R 15', 'R 20', 'R 17'],
    secondary: ['R 305', 'R 412', 'R 246'],
  },
  cn: {
    motorway: ['G 2', 'G 4', 'G 45', 'G 6', 'S 12'],
    trunk: ['G 2', 'G 4', 'S 11', 'G 101'],
    primary: ['G 101', 'G 103', 'G 107', 'S 201'],
    secondary: ['S 201', 'S 305', 'G 101'],
  },
  kr: {
    motorway: ['1', '15', '50', '100'],
    trunk: ['77', '1', '3', '46'],
    primary: ['46', '6', '1', '3'],
    secondary: ['46', '3'],
  },
  au: {
    motorway: ['M 1', 'M 2', 'M 4', 'A 1'],
    trunk: ['A 1', 'A 2', 'M 1'],
    primary: ['A 1', 'A 8', 'B 23'],
    secondary: ['B 23', 'A 1'],
  },
  intl: {
    motorway: ['A 1', 'E 15', 'M 1', 'I-80'],
    trunk: ['A 1', 'US 101', 'E 15', 'R 1'],
    primary: ['A 2', 'R 10', 'US 101', 'B 5'],
    secondary: ['B 5', 'R 10'],
  },
};

const REGION_STREETS = {
  us: [
    'The Embarcadero', 'Market St', 'Mission St', 'Howard St', 'Folsom St',
    'Harrison St', 'Bryant St', 'Brannan St', 'King St', 'Montgomery St',
    'California St', 'Broadway', 'Geary Blvd', 'Van Ness Ave', '3rd St',
    '4th St', 'Main St', 'Spear St', 'Steuart St', 'Columbus Ave',
  ],
  eu: [
    'Champs-Élysées', 'Rue de Rivoli', 'Bd Saint-Germain', 'Quai d\'Orsay',
    'Av Montaigne', 'Rue Royale', 'Bd Haussmann', 'Friedrichstraße', 'Via del Corso',
  ],
  uk: [
    'Whitehall', 'Victoria St', 'Piccadilly', 'Oxford St', 'Regent St',
    'The Strand', 'Fleet St', 'Baker St', 'Parliament St', 'Park Ln',
  ],
  jp: [
    'Meiji-dori', 'Aoyama-dori', 'Omotesando', 'Chuo-dori', 'Showa-dori',
    'Yasukuni-dori', 'Harumi-dori', 'Sotobori-dori', 'Dogenzaka', 'Sakurada-dori',
  ],
  cn: [
    'Chang\'an Ave', 'Jianguo Rd', 'East 3rd Ring Rd', 'Chaoyangmen Blvd',
    'Fuxingmen Ave', 'Zhongguancun St', 'Xidan North St', 'Dongzhimen Ave',
    'Ping\'an Blvd', 'Qianmen St',
  ],
  kr: [
    'Sejong-daero', 'Teheran-ro', 'Gangnam-daero', 'Eulji-ro', 'Jong-ro', 'Hangang-daero',
  ],
  au: [
    'George St', 'Pitt St', 'Collins St', 'Bourke St', 'Elizabeth St', 'Macquarie St',
  ],
  intl: [
    'Central Ave', 'Harbor Blvd', 'Victoria Rd', 'Queen St', 'King St', 'Station Rd', 'Park Ave', 'High St',
  ],
};

const REGION_DESTINATIONS = {
  us: ['Downtown', 'Bay Bridge', 'Civic Center', 'Financial Dist', 'South Beach', 'Golden Gate', 'Airport', 'Waterfront'],
  eu: ['Centre-Ville', 'Gare Centrale', 'Aéroport', 'La Défense', 'Périphérique', 'Port'],
  uk: ['Central London', 'Westminster', 'City', 'Victoria', 'Waterloo', 'Heathrow'],
  jp: ['Shibuya', 'Shinjuku', 'Ginza', 'Tokyo Sta.', 'Roppongi', 'Odaiba'],
  cn: ['CBD Guomao', 'Tiananmen', 'Financial St', 'Zhongguancun', 'Airport Exp', 'Chaoyang'],
  kr: ['City Hall', 'Gangnam', 'Yeouido', 'Seoul Sta.', 'Incheon'],
  au: ['City Centre', 'Harbour Bridge', 'Circular Quay', 'Airport'],
  intl: ['City Center', 'Harbor Dist', 'Central Sta.', 'Airport', 'Midtown'],
};

let currentOrigin = null;
/** Set by chunk_worker.js (worker) / StreetFeatures.update (main-thread fallback) before chunk builds. */
export function setStreetWorldOrigin(worldOrigin) {
  currentOrigin = worldOrigin || null;
}

export function resolveStreetRegion(worldOrigin) {
  if (!worldOrigin || worldOrigin.isBeijing) return 'cn';
  const lat = Number(worldOrigin.centerLat);
  const lon = Number(worldOrigin.centerLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'cn';
  if (lat > 24 && lat < 72 && lon > -170 && lon < -52) return 'us';
  if (lat > 33.9 && lat < 38.7 && lon > 124 && lon < 129.6) return 'kr';
  if (lat > 24 && lat < 46.5 && lon > 122.5 && lon < 146.5) return 'jp';
  if (lat > 22.1 && lat < 22.6 && lon > 113.8 && lon < 114.5) return 'uk'; // Hong Kong / Macau: left-hand
  if (lat > 49.8 && lat < 61 && lon > -11 && lon < 2) return 'uk';
  if (lat > -48 && lat < -10 && lon > 112 && lon < 179) return 'au';
  if (lat > 6 && lat < 36 && lon > 68 && lon < 92) return 'au'; // India: left-hand, white lines
  if (lat > 34 && lat < 72 && lon > -25 && lon < 45) return 'eu';
  if (lat > 18 && lat < 54 && lon > 73 && lon < 135) return 'cn';
  return 'intl';
}

function hashInt(a, b = 0) {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hash2(x, z) {
  let h = (Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function cleanOsmName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s.includes('旁 ·') || s.includes('立交匝道') || s.includes('辅路/内部通道') || s.includes('城市道路')) return '';
  return s;
}

function resolveRoadSignage(id, cls, rawName, rawRef, region, wx, wz) {
  const h = hashInt(id || 1, Math.round(wx * 0.05) * 31 + Math.round(wz * 0.05));
  const baseCls = cls.replace('_link', '');
  const refTable = REGION_HIGHWAY_REFS[region] || REGION_HIGHWAY_REFS.intl;
  const refList = refTable[baseCls] || refTable.primary;
  let ref = (rawRef || '').trim();
  if (ref) {
    ref = ref.split(';')[0].trim();
    if (region === 'us' && /^[0-9]+$/.test(ref)) {
      ref = baseCls === 'motorway' ? `I-${ref}` : baseCls === 'trunk' ? `US ${ref}` : `CA ${ref}`;
    }
  } else if (refList && refList.length > 0) {
    ref = refList[h % refList.length];
  }

  let name = cleanOsmName(rawName);
  const streets = REGION_STREETS[region] || REGION_STREETS.intl;
  if (!name) {
    name = streets[h % streets.length];
  }
  const dests = REGION_DESTINATIONS[region] || REGION_DESTINATIONS.intl;
  const dest2 = dests[(h >>> 4) % dests.length];
  const exitNum = `EXIT ${12 + (h % 85)}${(h & 3) === 0 ? 'B' : (h & 3) === 1 ? 'A' : ''}`;
  return { ref, name, dest2, exitNum };
}

function chooseShieldCell(ref, id, cls, region) {
  const u = String(ref || '').toUpperCase();
  if (region === 'us') {
    if (u.includes('280')) return DECAL_CELLS.SHIELD_I280;
    if (u.includes('80')) return DECAL_CELLS.SHIELD_I80;
    if (u.includes('101')) return DECAL_CELLS.SHIELD_US101;
    if (u.includes('95') || u.includes('I-5')) return DECAL_CELLS.SHIELD_I95;
    if (u.includes('CA') || u.includes('SR') || u === '1') return DECAL_CELLS.SHIELD_CA1;
    const pool = cls.startsWith('motorway')
      ? [DECAL_CELLS.SHIELD_I80, DECAL_CELLS.SHIELD_I280, DECAL_CELLS.SHIELD_US101, DECAL_CELLS.SHIELD_I95]
      : [DECAL_CELLS.SHIELD_US101, DECAL_CELLS.SHIELD_CA1, DECAL_CELLS.SHIELD_I280, DECAL_CELLS.SHIELD_I80];
    return pool[hashInt(id, 7) % pool.length];
  }
  if (region === 'eu' || region === 'uk') {
    return (hashInt(id, 11) % 3 === 0) ? DECAL_CELLS.ROUNDEL_80 : DECAL_CELLS.SHIELD_EU_E15;
  }
  if (region === 'cn' || region === 'jp' || region === 'kr') {
    return (hashInt(id, 13) % 3 === 0) ? DECAL_CELLS.ROUNDEL_80 : DECAL_CELLS.SHIELD_ASIA_G2;
  }
  return (hashInt(id, 17) % 2 === 0) ? DECAL_CELLS.SHIELD_EU_E15 : DECAL_CELLS.ROUNDEL_80;
}

function pointAt(w, d) {
  const { flat, cum, n } = w;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const f = seg > 1e-6 ? Math.max(0, Math.min(1, (d - cum[lo]) / seg)) : 0;
  return [flat[lo * 3] + (flat[hi * 3] - flat[lo * 3]) * f, flat[lo * 3 + 2] + (flat[hi * 3 + 2] - flat[lo * 3 + 2]) * f];
}

function pointInRing(px, pz, flat) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Simple uniform bucket grid over chunk-local [-560, 560]. */
function makeGrid(cell) {
  const n = Math.ceil(1120 / cell);
  const buckets = new Map();
  const ci = (v) => Math.max(0, Math.min(n - 1, Math.floor((v + 560) / cell)));
  return {
    insertBox(minX, minZ, maxX, maxZ, item) {
      for (let gz = ci(minZ); gz <= ci(maxZ); gz++) {
        for (let gx = ci(minX); gx <= ci(maxX); gx++) {
          const k = gz * n + gx;
          let b = buckets.get(k);
          if (!b) buckets.set(k, (b = []));
          b.push(item);
        }
      }
    },
    query(x, z) {
      return buckets.get(ci(z) * n + ci(x)) || EMPTY;
    },
  };
}
const EMPTY = [];

class GeoBuf {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, rgb) {
    // a-b-c-d counter-clockwise seen from above (+Y normal when a->b is along road and d is on the left)
    this.pos.push(ax, ay, az, cx, cy, cz, bx, by, bz, ax, ay, az, dx, dy, dz, cx, cy, cz);
    for (let k = 0; k < 6; k++) this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  toMesh(material) {
    if (this.pos.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    const u8 = new Uint8Array(this.col.length);
    for (let i = 0; i < u8.length; i++) u8[i] = Math.max(0, Math.min(255, (this.col[i] * 255 + 0.5) | 0));
    geom.setAttribute('color', new THREE.BufferAttribute(u8, 3, true));
    // Flat up-facing normals (cheaper than computeVertexNormals and correct for decals/curb tops)
    const nrm = new Float32Array(this.pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geom.computeBoundingSphere();
    const mesh = new THREE.Mesh(geom, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}

class DecalBuf {
  constructor() {
    this.pos = [];
    this.uv = [];
  }
  /**
   * Emits a 2x2 subdivided road-surface decal centered at (cx, cz), oriented along unit tangent (tx, tz)
   * so cars drive right over it and drivers read it right-side up.
   */
  add(cx, cz, tx, tz, widthM, lengthM, cellIdx, sampleY) {
    const col = cellIdx & 3;
    const row = (cellIdx >> 2) & 3;
    const pad = 0.01;
    const u0 = (col + pad) * 0.25;
    const u1 = (col + 1 - pad) * 0.25;
    const v1 = 1.0 - (row + pad) * 0.25;
    const v0 = 1.0 - (row + 1 - pad) * 0.25;
    const rx = -tz, rz = tx; // driver's right-hand vector
    const hw = widthM * 0.5, hl = lengthM * 0.5;
    const N = 2;
    for (let iz = 0; iz < N; iz++) {
      const fa0 = iz / N, fa1 = (iz + 1) / N;
      const l0 = -hl + fa0 * lengthM, l1 = -hl + fa1 * lengthM;
      const va = v0 + (v1 - v0) * fa0, vb = v0 + (v1 - v0) * fa1;
      for (let ix = 0; ix < N; ix++) {
        const fb0 = ix / N, fb1 = (ix + 1) / N;
        const w0 = -hw + fb0 * widthM, w1 = -hw + fb1 * widthM;
        const ua = u0 + (u1 - u0) * fb0, ub = u0 + (u1 - u0) * fb1;

        const x00 = cx + tx * l0 + rx * w0, z00 = cz + tz * l0 + rz * w0, y00 = sampleY(x00, z00);
        const x10 = cx + tx * l0 + rx * w1, z10 = cz + tz * l0 + rz * w1, y10 = sampleY(x10, z10);
        const x11 = cx + tx * l1 + rx * w1, z11 = cz + tz * l1 + rz * w1, y11 = sampleY(x11, z11);
        const x01 = cx + tx * l1 + rx * w0, z01 = cz + tz * l1 + rz * w0, y01 = sampleY(x01, z01);

        this.pos.push(
          x00, y00, z00, x10, y10, z10, x11, y11, z11,
          x00, y00, z00, x11, y11, z11, x01, y01, z01
        );
        this.uv.push(
          ua, va, ub, va, ub, vb,
          ua, va, ub, vb, ua, vb
        );
      }
    }
  }
  toMesh(material) {
    if (this.pos.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    const nrm = new Float32Array(this.pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geom.computeBoundingSphere();
    const mesh = new THREE.Mesh(geom, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return mesh;
  }
}

const WHITE = [0.93, 0.94, 0.95];
const YELLOW = [0.96, 0.76, 0.18];
const WEAR = [0.0, 0.0, 0.0];
const CURB_TOP = [0.74, 0.74, 0.72];
const CURB_FACE = [0.6, 0.6, 0.59];

/**
 * Main entry, called once per chunk after roads/buildings are built.
 * @param {THREE.Group} root chunk root with userData.{roadSegments, buildingColliders, subGroups}
 */
export function computeStreetFeatures(root, data, ox, oz, worldOrigin, mats) {
  const tStart = Date.now();
  const origin = worldOrigin || currentOrigin;
  const region = resolveStreetRegion(origin);
  const style = REGION_STYLE[region] || REGION_STYLE.intl;
  const ud = root.userData;
  const segsW = ud.roadSegments || [];
  const colliders = ud.buildingColliders || [];

  // ---- 1. Local segment list + spatial grid ----
  const segs = [];
  const segGrid = makeGrid(24);
  const waySignCache = new Map();
  const getWaySignage = (id, cls, rawName, rawRef, lx, lz) => {
    let info = waySignCache.get(id);
    if (!info) {
      info = resolveRoadSignage(id, cls, rawName, rawRef, region, ox + lx, oz + lz);
      waySignCache.set(id, info);
    }
    return info;
  };

  for (let i = 0; i < segsW.length; i++) {
    const s = segsW[i];
    const x1 = s.x1 - ox, z1 = s.z1 - oz, x2 = s.x2 - ox, z2 = s.z2 - oz;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) continue;
    const signInfo = getWaySignage(s.id, s.cls, s.signName || s.rawName || s.name, s.ref, (x1 + x2) * 0.5, (z1 + z2) * 0.5);
    const ls = {
      x1, y1: s.y1, z1, x2, y2: s.y2, z2, len,
      dx: (x2 - x1) / len, dz: (z2 - z1) / len,
      hw: Math.max(1.0, s.width * 0.5),
      cls: s.cls, id: s.id, lanes: s.lanes, oneway: s.oneway, bridge: s.bridge,
      ref: signInfo.ref, signName: signInfo.name, dest2: signInfo.dest2, exitNum: signInfo.exitNum,
    };
    segs.push(ls);
    const m = ls.hw + 1.0;
    segGrid.insertBox(Math.min(x1, x2) - m, Math.min(z1, z2) - m, Math.max(x1, x2) + m, Math.max(z1, z2) + m, ls);
  }

  const bldgGrid = makeGrid(40);
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    bldgGrid.insertBox(b.minX - ox, b.minZ - oz, b.maxX - ox, b.maxZ - oz, b);
  }

  // Road surface height of way `id` near (x, z); falls back to terrain + class bias
  const roadY = (id, cls, x, z) => {
    const list = segGrid.query(x, z);
    let best = null, bestD = 1e9;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.id !== id) continue;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.len));
      const px = s.x1 + (s.x2 - s.x1) * t, pz = s.z1 + (s.z2 - s.z1) * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) {
        bestD = d;
        best = s.y1 + (s.y2 - s.y1) * t;
      }
    }
    if (best !== null) return best;
    const micro = ((((id * 2654435761) >>> 0) % 997) / 997.0) * 0.14;
    return getBeijingTerrainElevation(ox + x, oz + z) + (Y_BIAS[cls] || 0.43) + micro + 0.06;
  };

  const onOtherRoad = (x, z, ownId, margin) => {
    const list = segGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const t = Math.max(0, Math.min(1, ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.len));
      const px = s.x1 + (s.x2 - s.x1) * t, pz = s.z1 + (s.z2 - s.z1) * t;
      const lim = s.id === ownId ? s.hw + 0.15 : s.hw + margin;
      if ((x - px) * (x - px) + (z - pz) * (z - pz) < lim * lim) return true;
    }
    return false;
  };

  const inBuilding = (x, z) => {
    const list = bldgGrid.query(x, z);
    const wx = x + ox, wz = z + oz;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (wx < b.minX - 0.3 || wx > b.maxX + 0.3 || wz < b.minZ - 0.3 || wz > b.maxZ + 0.3) continue;
      if (b.flatOuter && b.flatOuter.length >= 6) {
        if (pointInRing(wx - b.ox, wz - b.oz, b.flatOuter)) return true;
      } else {
        return true;
      }
    }
    return false;
  };

  // ---- 2. Intersection detection: geometric crossings / T-junctions between different OSM ways ----
  const nodeMap = new Map();
  const roads = data.roads || [];
  const ways = [];
  const rawGrid = makeGrid(32);
  for (let r = 0; r < roads.length; r++) {
    const [wid, cls, rName, rRef, lanes, widthM, oneway, isBridge, isTunnel, , flat] = roads[r];
    if (!STREET_CLS.has(cls) || isBridge || isTunnel || !flat || flat.length < 6) continue;
    const n = flat.length / 3;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(flat[i * 3] - flat[i * 3 - 3], flat[i * 3 + 2] - flat[i * 3 - 1]);
    const signInfo = getWaySignage(wid, cls, rName, rRef, flat[0], flat[2]);
    const w = {
      wid, cls, lanes, hw: Math.max(1.0, widthM * 0.5), oneway, flat, n, cum, total: cum[n - 1], idx: ways.length,
      signName: signInfo.name, ref: signInfo.ref,
    };
    ways.push(w);
    for (let i = 0; i < n - 1; i++) {
      const x1 = flat[i * 3], z1 = flat[i * 3 + 2], x2 = flat[i * 3 + 3], z2 = flat[i * 3 + 5];
      if (Math.max(x1, x2) < -510 || Math.min(x1, x2) > 510 || Math.max(z1, z2) < -510 || Math.min(z1, z2) > 510) continue;
      rawGrid.insertBox(Math.min(x1, x2) - 1, Math.min(z1, z2) - 1, Math.max(x1, x2) + 1, Math.max(z1, z2) + 1, [w, i]);
    }
  }
  const armDir = (w, d, dir) => {
    const target = Math.max(0, Math.min(w.total, d + dir * 7));
    const p0 = pointAt(w, d), p1 = pointAt(w, target);
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return l < 0.5 ? null : [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
  };
  const addArm = (node, w, d) => {
    for (const dir of [-1, 1]) {
      const avail = dir > 0 ? w.total - d : d;
      if (avail < 1.5) continue;
      const v = armDir(w, d, dir);
      if (!v) continue;
      let merged = false;
      for (const a of node.arms) {
        if (a.ax * v[0] + a.az * v[1] > 0.94) {
          merged = true;
          if (w.hw > a.hw) a.hw = w.hw;
          if (avail > a.total) a.total = avail;
          break;
        }
      }
      if (!merged) {
        node.arms.push({
          ax: v[0], az: v[1], hw: w.hw, cls: w.cls, lanes: w.lanes, oneway: w.oneway,
          forward: dir > 0, id: w.wid, total: avail, signName: w.signName, ref: w.ref,
        });
      }
    }
  };
  const seenPair = new Set();
  const cellsDone = new Set();
  for (let gz = -560; gz < 560; gz += 32) {
    for (let gx = -560; gx < 560; gx += 32) {
      const list = rawGrid.query(gx + 16, gz + 16);
      if (list.length < 2 || cellsDone.has(list)) continue;
      cellsDone.add(list);
      for (let a = 0; a < list.length; a++) {
        const [wa, ia] = list[a];
        const ax1 = wa.flat[ia * 3], az1 = wa.flat[ia * 3 + 2], ax2 = wa.flat[ia * 3 + 3], az2 = wa.flat[ia * 3 + 5];
        const la = wa.cum[ia + 1] - wa.cum[ia];
        if (la < 0.05) continue;
        for (let b = a + 1; b < list.length; b++) {
          const [wb, ib] = list[b];
          if (wb === wa || wb.wid === wa.wid) continue;
          const pk = wa.idx < wb.idx ? `${wa.idx}:${ia}:${wb.idx}:${ib}` : `${wb.idx}:${ib}:${wa.idx}:${ia}`;
          if (seenPair.has(pk)) continue;
          seenPair.add(pk);
          const bx1 = wb.flat[ib * 3], bz1 = wb.flat[ib * 3 + 2], bx2 = wb.flat[ib * 3 + 3], bz2 = wb.flat[ib * 3 + 5];
          const lb = wb.cum[ib + 1] - wb.cum[ib];
          if (lb < 0.05) continue;
          const rX = ax2 - ax1, rZ = az2 - az1, sX = bx2 - bx1, sZ = bz2 - bz1;
          const den = rX * sZ - rZ * sX;
          if (Math.abs(den) < 1e-6 * la * lb || Math.abs(den) / (la * lb) < 0.26) continue;
          const qx = bx1 - ax1, qz = bz1 - az1;
          const t = (qx * sZ - qz * sX) / den;
          const u = (qx * rZ - qz * rX) / den;
          const ea = 1.5 / la, eb = 1.5 / lb;
          if (t < -ea || t > 1 + ea || u < -eb || u > 1 + eb) continue;
          if ((t < 0 && ia > 0) || (t > 1 && ia < wa.n - 2) || (u < 0 && ib > 0) || (u > 1 && ib < wb.n - 2)) continue;
          const tc = Math.max(0, Math.min(1, t)), uc = Math.max(0, Math.min(1, u));
          const x = ax1 + rX * tc, z = az1 + rZ * tc;
          if (x < -505 || x > 505 || z < -505 || z > 505) continue;
          const key = `${Math.round(x / 3)},${Math.round(z / 3)}`;
          let node = nodeMap.get(key);
          if (!node) nodeMap.set(key, (node = { x, z, arms: [] }));
          addArm(node, wa, wa.cum[ia] + la * tc);
          addArm(node, wb, wb.cum[ib] + lb * uc);
        }
      }
    }
  }

  const nodes = [];
  const nodeGrid = makeGrid(40);
  for (const node of nodeMap.values()) {
    if (node.arms.length < 3) continue;
    let maxHw = 0, majors = 0;
    for (const a of node.arms) {
      if (a.hw > maxHw) maxHw = a.hw;
      if (MAJOR_CLS.has(a.cls)) majors++;
    }
    node.R = maxHw + 1.2;
    node.majors = majors;
    nodes.push(node);
  }
  nodes.sort((a, b) => b.R - a.R);
  const keptNodes = [];
  for (const n of nodes) {
    let dup = false;
    for (const k of keptNodes) {
      if (Math.hypot(k.x - n.x, k.z - n.z) < Math.max(k.R, n.R) * 1.3) {
        dup = true;
        k.R = Math.max(k.R, Math.hypot(k.x - n.x, k.z - n.z) * 0.5 + n.R);
        break;
      }
    }
    if (!dup) keptNodes.push(n);
  }
  for (const n of keptNodes) {
    const m = n.R + 6;
    nodeGrid.insertBox(n.x - m, n.z - m, n.x + m, n.z + m, n);
  }
  const nearNode = (x, z, pad) => {
    const list = nodeGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const r = n.R + pad;
      if ((x - n.x) * (x - n.x) + (z - n.z) * (z - n.z) < r * r) return n;
    }
    return null;
  };
  const outsideIntervals = (s, pad) => {
    let ivs = [[0, 1]];
    const mx = (s.x1 + s.x2) * 0.5, mz = (s.z1 + s.z2) * 0.5;
    const list = nodeGrid.query(mx, mz);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const r = n.R + pad;
      const fx = s.x1 - n.x, fz = s.z1 - n.z;
      const ddx = s.x2 - s.x1, ddz = s.z2 - s.z1;
      const A = ddx * ddx + ddz * ddz;
      const B = 2 * (fx * ddx + fz * ddz);
      const C = fx * fx + fz * fz - r * r;
      const disc = B * B - 4 * A * C;
      if (disc <= 0) continue;
      const sq = Math.sqrt(disc);
      const t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
      if (t1 <= 0 || t0 >= 1) continue;
      const next = [];
      for (const [a, b] of ivs) {
        if (t1 <= a || t0 >= b) next.push([a, b]);
        else {
          if (t0 > a) next.push([a, t0]);
          if (t1 < b) next.push([t1, b]);
        }
      }
      ivs = next;
      if (!ivs.length) break;
    }
    return ivs;
  };

  // ---- 3. Road detail geometry + Road-Surface Painted Highway Shields & Stencils ----
  const lines = new GeoBuf();
  const wear = new GeoBuf();
  const curbs = new GeoBuf();
  const decals = new DecalBuf();
  const centerRgb = style.center === 'yellow' ? YELLOW : WHITE;
  const inChunk = (x, z) => x >= -499.5 && x < 499.5 && z >= -499.5 && z < 499.5;

  const strip = (buf, s, ta, tb, off, w, lift, rgb) => {
    const rx = -s.dz, rz = s.dx; // right-hand normal
    const ax = s.x1 + (s.x2 - s.x1) * ta, az = s.z1 + (s.z2 - s.z1) * ta, ay = s.y1 + (s.y2 - s.y1) * ta + lift;
    const bx = s.x1 + (s.x2 - s.x1) * tb, bz = s.z1 + (s.z2 - s.z1) * tb, by = s.y1 + (s.y2 - s.y1) * tb + lift;
    const o1 = off - w, o2 = off + w;
    buf.quad(
      ax + rx * o2, ay, az + rz * o2,
      bx + rx * o2, by, bz + rz * o2,
      bx + rx * o1, by, bz + rz * o1,
      ax + rx * o1, ay, az + rz * o1,
      rgb
    );
  };
  const dashed = (s, ivs, accStart, off, w, dash, gap, rgb) => {
    const cyc = dash + gap;
    for (const [a, b] of ivs) {
      let d = a * s.len;
      const dEnd = b * s.len;
      while (d < dEnd - 0.05) {
        const pc = (accStart + d) % cyc;
        if (pc < dash) {
          const e = Math.min(dEnd, d + (dash - pc));
          if (e - d > 0.2) strip(lines, s, d / s.len, e / s.len, off, w, 0.03, rgb);
          d = e + 1e-4;
        } else {
          d += cyc - pc + 1e-4;
        }
      }
    }
  };

  let runId = null, runEndX = 0, runEndZ = 0, acc = 0;
  const runInfo = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.id !== runId || Math.hypot(s.x1 - runEndX, s.z1 - runEndZ) > 0.6) {
      runId = s.id;
      acc = hash2(s.id, 0.5) * 40;
    }
    runInfo.push(acc);
    runEndX = s.x2;
    runEndZ = s.z2;
    const segAcc = acc;
    acc += s.len;

    const cls = s.cls;
    if (!LINE_CLS.has(cls)) continue;
    const hw = s.hw;
    const effLanes = Math.max(1, Math.min(s.lanes || 1, Math.floor((hw * 2) / 2.6)));
    const twoWay = !s.oneway;
    const isLink = cls.endsWith('_link');
    const ivs = outsideIntervals(s, 0.0);
    if (!ivs.length) continue;

    // Center line
    if (twoWay && effLanes >= 2 && !isLink && hw >= 2.9) {
      let cs = 'none';
      const major = cls === 'trunk' || cls === 'primary' || cls === 'secondary' || cls === 'motorway';
      if (region === 'us') cs = major || cls === 'tertiary' ? 'double' : 'none';
      else if (region === 'cn' || region === 'kr') cs = major ? 'double' : cls === 'tertiary' ? 'dashed' : 'none';
      else if (region === 'jp') cs = major ? 'solid' : cls === 'tertiary' ? 'dashed' : 'none';
      else cs = major || cls === 'tertiary' ? 'dashed' : 'none';
      if (cs === 'double') {
        for (const [a, b] of ivs) {
          strip(lines, s, a, b, 0.13, 0.06, 0.03, centerRgb);
          strip(lines, s, a, b, -0.13, 0.06, 0.03, centerRgb);
        }
      } else if (cs === 'solid') {
        for (const [a, b] of ivs) strip(lines, s, a, b, 0, 0.08, 0.03, centerRgb);
      } else if (cs === 'dashed') {
        dashed(s, ivs, segAcc, 0, 0.07, style.dash[0], style.dash[1], centerRgb);
      }
    }

    // Lane dividers (white dashed)
    if (effLanes >= 2) {
      if (twoWay) {
        const lpd = Math.max(1, Math.floor(effLanes / 2));
        for (let k = 1; k < lpd; k++) {
          const off = (k * hw) / lpd;
          dashed(s, ivs, segAcc, off, 0.06, style.dash[0], style.dash[1], WHITE);
          dashed(s, ivs, segAcc, -off, 0.06, style.dash[0], style.dash[1], WHITE);
        }
      } else {
        for (let k = 1; k < effLanes; k++) {
          const off = -hw + (k * 2 * hw) / effLanes;
          dashed(s, ivs, segAcc, off, 0.06, style.dash[0], style.dash[1], WHITE);
        }
      }
    }

    // Edge lines on major roads
    if (cls === 'motorway' || cls === 'trunk' || cls === 'primary' || isLink) {
      for (const [a, b] of ivs) {
        strip(lines, s, a, b, hw - 0.3, 0.07, 0.03, WHITE);
        strip(lines, s, a, b, -(hw - 0.3), 0.07, 0.03, s.oneway && region === 'us' && (cls === 'motorway' || isLink) ? YELLOW : WHITE);
      }
    }

    // Tire wear: two darker bands per lane (continuous through intersections)
    if (WEAR_CLS.has(cls)) {
      const laneW = (hw * 2) / effLanes;
      for (let l = 0; l < effLanes; l++) {
        const c = -hw + laneW * (l + 0.5);
        const tw = Math.min(0.85, laneW * 0.26);
        strip(wear, s, 0, 1, c - tw, 0.22, 0.02, WEAR);
        strip(wear, s, 0, 1, c + tw, 0.22, 0.02, WEAR);
      }
    }

    // Curbs along sidewalk edges (ground streets only)
    if (SIDEWALK_CLS.has(cls) && !s.bridge) {
      const terr = getBeijingTerrainElevation(ox + (s.x1 + s.x2) * 0.5, oz + (s.z1 + s.z2) * 0.5);
      const midY = (s.y1 + s.y2) * 0.5;
      if (midY - terr < 1.6) {
        const civs = outsideIntervals(s, 0.6);
        const rx = -s.dz, rz = s.dx;
        for (const [a, b] of civs) {
          for (const side of [-1, 1]) {
            strip(curbs, s, a, b, side * (hw + 0.09), 0.09, 0.1, CURB_TOP);
            const e = side * hw;
            const ax = s.x1 + (s.x2 - s.x1) * a + rx * e, az = s.z1 + (s.z2 - s.z1) * a + rz * e;
            const bx = s.x1 + (s.x2 - s.x1) * b + rx * e, bz = s.z1 + (s.z2 - s.z1) * b + rz * e;
            const ay = s.y1 + (s.y2 - s.y1) * a, by = s.y1 + (s.y2 - s.y1) * b;
            curbs.pos.push(ax, ay - 0.02, az, bx, by - 0.02, bz, bx, by + 0.1, bz, ax, ay - 0.02, az, bx, by + 0.1, bz, ax, ay + 0.1, az);
            for (let k = 0; k < 6; k++) curbs.col.push(CURB_FACE[0], CURB_FACE[1], CURB_FACE[2]);
          }
        }
      }
    }

    // ---- Road-Surface Painted Highway Shields & Pavement Stencils (y = roadY + 0.06m) ----
    const rx = -s.dz, rz = s.dx;
    const sampleDecalY = (px, pz) => roadY(s.id, s.cls, px, pz) + 0.06;
    const driveSign = style.left ? -1 : 1; // lateral side of forward traffic (+1 = right of segment)

    if (SHIELD_CLS.has(cls) || (cls === 'secondary' && hw >= 3.8)) {
      const shieldSpacing = cls === 'motorway' || cls === 'trunk' ? 88 : 96;
      const shieldPhase = 18;
      let k0 = Math.ceil((segAcc - shieldPhase) / shieldSpacing);
      for (let d = k0 * shieldSpacing + shieldPhase; d < segAcc + s.len; k0++, d = k0 * shieldSpacing + shieldPhase) {
        const t = (d - segAcc) / s.len;
        if (t < 0.05 || t > 0.95) continue;
        const cx = s.x1 + (s.x2 - s.x1) * t, cz = s.z1 + (s.z2 - s.z1) * t;
        if (!inChunk(cx, cz) || nearNode(cx, cz, 5.5)) continue;

        const shieldCell = chooseShieldCell(s.ref, s.id + k0, cls, region);
        const decalW = Math.min(4.2, Math.max(2.6, (twoWay ? hw : hw * 2) * 0.68));
        const decalL = 4.2;

        if (twoWay) {
          const latOff = driveSign * (hw * 0.5);
          decals.add(cx + rx * latOff, cz + rz * latOff, s.dx, s.dz, decalW, decalL, shieldCell, sampleDecalY);
          // Opposite direction carriageway shield
          const oppCell = (k0 % 2 === 1 && region !== 'us') ? DECAL_CELLS.ROUNDEL_80 : shieldCell;
          decals.add(cx - rx * latOff, cz - rz * latOff, -s.dx, -s.dz, decalW, decalL, oppCell, sampleDecalY);
        } else {
          decals.add(cx, cz, s.dx, s.dz, decalW, decalL, shieldCell, sampleDecalY);
          if (hw >= 5.2) {
            const auxCell = region === 'us' ? DECAL_CELLS.STENCIL_ARROW_STRAIGHT : DECAL_CELLS.ROUNDEL_80;
            const sideOff = hw * 0.52;
            decals.add(cx + rx * sideOff, cz + rz * sideOff, s.dx, s.dz, 2.8, 3.6, auxCell, sampleDecalY);
          }
        }
      }
    }

    // Mid-segment pavement stencils on primary / secondary / tertiary / residential roads
    if (cls === 'primary' || cls === 'secondary' || cls === 'tertiary' || cls === 'residential') {
      const stencilSpacing = cls === 'residential' ? 76 : 84;
      const stencilPhase = 48;
      let k1 = Math.ceil((segAcc - stencilPhase) / stencilSpacing);
      for (let d = k1 * stencilSpacing + stencilPhase; d < segAcc + s.len; k1++, d = k1 * stencilSpacing + stencilPhase) {
        const t = (d - segAcc) / s.len;
        if (t < 0.08 || t > 0.92) continue;
        const cx = s.x1 + (s.x2 - s.x1) * t, cz = s.z1 + (s.z2 - s.z1) * t;
        if (!inChunk(cx, cz) || nearNode(cx, cz, 7.5)) continue;

        const stencilPool = region === 'us'
          ? [DECAL_CELLS.STENCIL_SPEED35, DECAL_CELLS.STENCIL_SLOW, DECAL_CELLS.STENCIL_ARROW_STRAIGHT, DECAL_CELLS.STENCIL_ONLY_LEFT]
          : [DECAL_CELLS.ROUNDEL_50, DECAL_CELLS.STENCIL_SLOW, DECAL_CELLS.STENCIL_ARROW_STRAIGHT, DECAL_CELLS.STENCIL_ARROW_COMBO];
        const cell = stencilPool[hashInt(s.id, k1) % stencilPool.length];
        const w = Math.min(3.2, Math.max(2.1, (twoWay ? hw : hw * 2) * 0.62));
        const l = 3.5;
        if (twoWay && hw >= 2.6) {
          const latOff = driveSign * (hw * 0.5);
          decals.add(cx + rx * latOff, cz + rz * latOff, s.dx, s.dz, w, l, cell, sampleDecalY);
        } else {
          decals.add(cx, cz, s.dx, s.dz, w, l, cell, sampleDecalY);
        }
      }
    }
  }

  // ---- 4. Intersections: crosswalks, stop lines, pavement stencils, traffic signals, STOP signs, street name blades ----
  const types = {};
  const push = (type, x, y, z, rot, sx = 1) => {
    let a = types[type];
    if (!a) types[type] = a = [];
    a.push(x, y, z, rot, sx);
  };
  const heads = [];
  const signals = [];
  const signalNodes = [];
  const gantries = [];
  const blades = [];
  const occupied = new Set();
  const occKey = (x, z) => `${Math.floor(x / 1.5)},${Math.floor(z / 1.5)}`;
  const isFree = (x, z) => {
    const cx = Math.floor(x / 1.5), cz = Math.floor(z / 1.5);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (occupied.has(`${cx + dx},${cz + dz}`)) return false;
    return true;
  };
  const occupy = (x, z) => occupied.add(occKey(x, z));
  const rotFor = (ux, uz) => Math.atan2(-uz, ux); // local +X -> (ux, uz)

  for (const node of keptNodes) {
    if (!inChunk(node.x, node.z)) continue;
    const signalized = node.majors >= 1 && node.arms.some((a) => a.cls === 'primary' || a.cls === 'secondary' || a.cls === 'trunk' || (a.cls === 'tertiary' && node.majors >= 2));
    let anySignal = false;
    let sigStop = 0;

    // Collect two distinct street names at this intersection for Green Street Name Blade Signs
    let streetA = '', streetB = '';
    for (const a of node.arms) {
      const nm = a.signName || a.ref || '';
      if (!nm) continue;
      if (!streetA) streetA = nm;
      else if (nm !== streetA && !streetB) streetB = nm;
    }
    if (!streetA) streetA = (REGION_STREETS[region] || REGION_STREETS.intl)[hashInt(Math.round(node.x), Math.round(node.z)) % 8];
    if (!streetB) streetB = (REGION_STREETS[region] || REGION_STREETS.intl)[hashInt(Math.round(node.z), Math.round(node.x) + 19) % 8];
    if (streetB === streetA) streetB = '1st Ave';

    let bladesPlacedAtNode = 0;

    for (let aIdx = 0; aIdx < node.arms.length; aIdx++) {
      const arm = node.arms[aIdx];
      if (!SIDEWALK_CLS.has(arm.cls) && arm.cls !== 'trunk' && arm.cls !== 'unclassified' && arm.cls !== 'living_street') continue;
      const hw = arm.hw;
      if (hw < 2.2) continue;
      const cwLen = MAJOR_CLS.has(arm.cls) ? 4.0 : 3.0;
      const c0 = node.R + 0.4;
      const c1 = c0 + cwLen;
      if (arm.total < c1 + 1.5) continue;
      const ax = arm.ax, az = arm.az;
      const rx = -az, rz = ax; // right of arm direction (outbound)
      const sw = 0.45, pitch = 1.0;
      const nStr = Math.max(2, Math.floor(((hw - 0.4) * 2) / pitch));
      const start = -((nStr - 1) * pitch) / 2;
      const y0 = roadY(arm.id, arm.cls, node.x + ax * c0, node.z + az * c0) + 0.035;
      const y1 = roadY(arm.id, arm.cls, node.x + ax * c1, node.z + az * c1) + 0.035;
      for (let k = 0; k < nStr; k++) {
        const o = start + k * pitch;
        const pa = o - sw * 0.5, pb = o + sw * 0.5;
        lines.quad(
          node.x + ax * c0 + rx * pb, y0, node.z + az * c0 + rz * pb,
          node.x + ax * c1 + rx * pb, y1, node.z + az * c1 + rz * pb,
          node.x + ax * c1 + rx * pa, y1, node.z + az * c1 + rz * pa,
          node.x + ax * c0 + rx * pa, y0, node.z + az * c0 + rz * pa,
          WHITE
        );
      }

      const inboundSign = style.left ? 1 : -1;
      const outboundOnly = arm.oneway && arm.forward;
      const inboundOnly = arm.oneway && !arm.forward;
      const sl = c1 + 0.9;
      const ys = roadY(arm.id, arm.cls, node.x + ax * sl, node.z + az * sl) + 0.035;
      if (!outboundOnly) {
        const oa = inboundOnly ? -hw + 0.2 : inboundSign > 0 ? 0.15 : -hw + 0.2;
        const ob = inboundOnly ? hw - 0.2 : inboundSign > 0 ? hw - 0.2 : -0.15;
        lines.quad(
          node.x + ax * sl + rx * ob, ys, node.z + az * sl + rz * ob,
          node.x + ax * (sl + 0.45) + rx * ob, ys, node.z + az * (sl + 0.45) + rz * ob,
          node.x + ax * (sl + 0.45) + rx * oa, ys, node.z + az * (sl + 0.45) + rz * oa,
          node.x + ax * sl + rx * oa, ys, node.z + az * sl + rz * oa,
          WHITE
        );

        // ---- Road-Surface Intersection Approach Stencils (STOP, ONLY + Turn Arrows, SLOW) ----
        if (arm.total >= sl + 5.0) {
          const sampleArmY = (px, pz) => roadY(arm.id, arm.cls, px, pz) + 0.06;
          const stDist = sl + 3.1;
          const midLat = (oa + ob) * 0.5;
          const spanLat = Math.abs(ob - oa);
          const stX = node.x + ax * stDist + rx * midLat;
          const stZ = node.z + az * stDist + rz * midLat;

          if (!signalized || arm.cls === 'residential' || arm.cls === 'tertiary' || arm.cls === 'unclassified') {
            // Paint crisp white "STOP" stencil ahead of stop line
            decals.add(stX, stZ, -ax, -az, Math.min(3.2, spanLat * 0.82), 3.0, DECAL_CELLS.STENCIL_STOP, sampleArmY);
          } else if (spanLat >= 5.0) {
            // Multi-lane signalized approach: paint ONLY + Turn Arrow in turn lane & Straight Arrow in through lane
            const q1 = oa + spanLat * 0.26;
            const q2 = oa + spanLat * 0.74;
            const leftCell = style.left ? DECAL_CELLS.STENCIL_ONLY_RIGHT : DECAL_CELLS.STENCIL_ONLY_LEFT;
            decals.add(node.x + ax * stDist + rx * q1, node.z + az * stDist + rz * q1, -ax, -az, 2.3, 3.4, leftCell, sampleArmY);
            decals.add(node.x + ax * stDist + rx * q2, node.z + az * stDist + rz * q2, -ax, -az, 2.3, 3.4, DECAL_CELLS.STENCIL_ARROW_COMBO, sampleArmY);
          } else {
            decals.add(stX, stZ, -ax, -az, Math.min(2.8, spanLat * 0.8), 3.3, DECAL_CELLS.STENCIL_ARROW_COMBO, sampleArmY);
          }

          // Upstream approach warning / speed stencil (~12.5m before stop line)
          if (arm.total >= sl + 15.0) {
            const upDist = sl + 12.2;
            const upX = node.x + ax * upDist + rx * midLat;
            const upZ = node.z + az * upDist + rz * midLat;
            const upCell = (aIdx % 2 === 0)
              ? DECAL_CELLS.STENCIL_SLOW
              : (region === 'us' ? DECAL_CELLS.STENCIL_SPEED35 : DECAL_CELLS.ROUNDEL_50);
            decals.add(upX, upZ, -ax, -az, Math.min(3.1, spanLat * 0.78), 3.3, upCell, sampleArmY);
          }
        }
      }

      // Bollards at both crosswalk ends (sidewalk corners)
      if (MAJOR_CLS.has(arm.cls) && node.majors >= 2) {
        for (const side of [-1, 1]) {
          for (const d of [c1 + 0.3]) {
            const bx = node.x + ax * d + rx * side * (hw + 0.35);
            const bz = node.z + az * d + rz * side * (hw + 0.35);
            if (!inChunk(bx, bz) || onOtherRoad(bx, bz, arm.id, 0.25) || inBuilding(bx, bz)) continue;
            push('bollard', bx, roadY(arm.id, arm.cls, bx, bz) + 0.04, bz, 0);
          }
        }
      }

      // Green Street Name Blade Signs at intersection corners
      if (bladesPlacedAtNode < 2) {
        const cornerSide = -inboundSign;
        const bd = c0 + 0.4;
        const bx = node.x + ax * bd + rx * cornerSide * (hw + 0.65);
        const bz = node.z + az * bd + rz * cornerSide * (hw + 0.65);
        if (inChunk(bx, bz) && !onOtherRoad(bx, bz, arm.id, 0.28) && !inBuilding(bx, bz) && isFree(bx, bz)) {
          const gy = roadY(arm.id, arm.cls, bx, bz) + 0.04;
          const rot = rotFor(ax, az);
          push('bladePost', bx, gy, bz, rot);
          const bName1 = arm.signName || streetA;
          const bName2 = bName1 === streetB ? streetA : streetB;
          blades.push([bx, gy + 2.85, bz, rot, bName1, bName2]);
          occupy(bx, bz);
          bladesPlacedAtNode++;
        }
      }

      // Traffic signal: pole at the near-side corner on the inbound driving side, mast arm over inbound lanes
      if (signalized && !outboundOnly) {
        const sideSign = inboundSign;
        const pd = c1 + 1.6;
        const px = node.x + ax * pd + rx * sideSign * (hw + 0.7);
        const pz = node.z + az * pd + rz * sideSign * (hw + 0.7);
        if (inChunk(px, pz) && !onOtherRoad(px, pz, arm.id, 0.3)) {
          const gy = roadY(arm.id, arm.cls, px, pz) + 0.04;
          const uX = -rx * sideSign, uZ = -rz * sideSign;
          const inboundW = inboundOnly ? hw * 2 : hw;
          const armLen = Math.max(2.5, Math.min(7.5, inboundW * 0.6 + 0.7));
          push('tlPole', px, gy, pz, rotFor(uX, uZ));
          push('tlArm', px, gy, pz, rotFor(uX, uZ), armLen);
          const hx = px + uX * armLen, hz = pz + uZ * armLen;
          const horiz = style.sigH ? 1 : 0;
          push(horiz ? 'tlHeadH' : 'tlHeadV', hx, gy + 5.6, hz, rotFor(ax, az));
          const axis = Math.abs(ax) > Math.abs(az) ? 1 : 0;
          signals.push(hx, gy + 5.6, hz, rotFor(ax, az), axis, node.x, node.z, horiz);
          occupy(px, pz);
          anySignal = true;
          sigStop = Math.max(sigStop, sl + 0.45 + 0.6);
        }
      }

      // Roadside Red Octagon STOP Sign at minor/secondary/tertiary/unsignalized intersection approaches
      if (!outboundOnly && (!signalized || arm.cls === 'secondary' || arm.cls === 'tertiary' || arm.cls === 'residential')) {
        const sideSign = inboundSign;
        const sd = signalized ? c1 + 3.4 : c1 + 1.3;
        const sx = node.x + ax * sd + rx * sideSign * (hw + 0.62);
        const sz = node.z + az * sd + rz * sideSign * (hw + 0.62);
        if (inChunk(sx, sz) && !onOtherRoad(sx, sz, arm.id, 0.28) && !inBuilding(sx, sz) && isFree(sx, sz)) {
          const gy = roadY(arm.id, arm.cls, sx, sz) + 0.04;
          // Face approaching traffic (which looks in direction -ax, -az, so sign normal points +ax, +az)
          push('signStop', sx, gy, sz, rotFor(ax, az));
          occupy(sx, sz);
        }
      }
    }
    if (anySignal) signalNodes.push(node.x, node.z, node.R, sigStop);
  }

  // ---- 5. Overhead Highway Gantries, Roadside Traffic Signs & Sidewalk Furniture along ways ----
  const dbg = { segs: 0, tries: 0, node: 0, road: 0, bldg: 0, occ: 0, nodes: keptNodes.length, gantries: 0 };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const isHighway = s.cls === 'trunk' || s.cls === 'motorway';
    if (!(SIDEWALK_CLS.has(s.cls) && !s.bridge) && !isHighway && !GANTRY_CLS.has(s.cls)) continue;
    dbg.segs++;
    const terrMid = getBeijingTerrainElevation(ox + (s.x1 + s.x2) * 0.5, oz + (s.z1 + s.z2) * 0.5);
    const isElevated = !isHighway && ((s.y1 + s.y2) * 0.5 - terrMid > 1.6 || s.bridge);
    const acc0 = runInfo[i];
    const acc1 = acc0 + s.len;
    const swW = s.cls === 'residential' ? 1.6 : 2.2;
    const wide = s.hw * 2 >= 8;
    const rx = -s.dz, rz = s.dx;
    const driveSign = style.left ? -1 : 1;

    const place = (spacing, phase, fn) => {
      let k = Math.ceil((acc0 - phase) / spacing);
      for (let d = k * spacing + phase; d < acc1; k++, d = k * spacing + phase) {
        const t = (d - acc0) / s.len;
        if (t < 0 || t > 1) continue;
        fn(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t, s.z1 + (s.z2 - s.z1) * t, k);
      }
    };
    const ok = (x, z, pad = 3.0) => {
      dbg.tries++;
      if (!inChunk(x, z)) return false;
      if (nearNode(x, z, pad)) return (dbg.node++, false);
      if (onOtherRoad(x, z, s.id, 0.4)) return (dbg.road++, false);
      if (inBuilding(x, z)) return (dbg.bldg++, false);
      if (!isFree(x, z)) return (dbg.occ++, false);
      return true;
    };

    // ---- 5A. 3D Overhead Highway Gantry Signs on motorway, trunk, and primary avenues ----
    if (GANTRY_CLS.has(s.cls)) {
      const gantrySpacing = isHighway ? 145 : 155;
      place(gantrySpacing, 32, (cx, cy, cz, k) => {
        if (!inChunk(cx, cz) || nearNode(cx, cz, 7.5)) return;
        const spanW = s.hw * 2 + 3.0; // roadWidth + 3m
        const halfSpan = spanW * 0.5;
        const lx = cx - rx * halfSpan, lz = cz - rz * halfSpan;
        const rxp = cx + rx * halfSpan, rzp = cz + rz * halfSpan;
        if (!inChunk(lx, lz) || !inChunk(rxp, rzp)) return;
        if (onOtherRoad(lx, lz, s.id, 0.2) || onOtherRoad(rxp, rzp, s.id, 0.2)) return;
        if (inBuilding(lx, lz) || inBuilding(rxp, rzp)) return;
        if (!isFree(lx, lz) || !isFree(rxp, rzp)) return;

        // Left & right steel gantry columns + overhead cross-braced box truss (height = 6.8m clearance)
        const faceRot = rotFor(rx, rz); // local +X spans across road (rx, rz), local +Z faces oncoming traffic (-s.dx, -s.dz)
        push('gantryLeg', lx, cy, lz, rotFor(rx, rz));
        push('gantryLeg', rxp, cy, rzp, rotFor(-rx, -rz));
        push('gantryTruss', cx, cy, cz, faceRot, spanW);
        occupy(lx, lz);
        occupy(rxp, rzp);
        const isMoto = (s.cls === 'motorway' || s.cls === 'trunk') ? 1 : 0;
        gantries.push([
          cx, cy, cz, faceRot, spanW, s.oneway ? 1 : 0, isMoto,
          s.ref, s.signName, s.dest2, s.exitNum,
        ]);
        dbg.gantries++;
      });
    }

    // Highway lights: single-arm poles on the outer edge, plus roadside highway speed signs
    if (isHighway) {
      place(42, 0, (cx, cy, cz) => {
        for (const side of [-1, 1]) {
          const x = cx + rx * side * (s.hw + 0.6), z = cz + rz * side * (s.hw + 0.6);
          if (!inChunk(x, z) || onOtherRoad(x, z, s.id, 0.3) || inBuilding(x, z) || !isFree(x, z)) continue;
          const ux = -rx * side, uz = -rz * side;
          const rot = rotFor(ux, uz);
          push('lampArm', x, cy, z, rot);
          occupy(x, z);
          heads.push(x + ux * 2.3, cy + 8.35, z + uz * 2.3, rot, cy);
        }
      });
      place(95, 21, (cx, cy, cz) => {
        const side = driveSign;
        const x = cx + rx * side * (s.hw + 0.65), z = cz + rz * side * (s.hw + 0.65);
        if (!inChunk(x, z) || onOtherRoad(x, z, s.id, 0.3) || inBuilding(x, z) || !isFree(x, z)) return;
        const signType = region === 'us' ? 'signSpeed35' : 'signSpeed60';
        push(signType, x, cy, z, rotFor(-s.dx, -s.dz));
        occupy(x, z);
      });
      continue;
    }

    if (isElevated) continue;

    // ---- 5B. Roadside Traffic Signs (Speed Limit, Warning Diamonds, STOP) along curbs ----
    const speedSignType = region === 'us'
      ? (s.cls === 'residential' || s.cls === 'tertiary' ? 'signSpeed25' : 'signSpeed35')
      : (s.cls === 'primary' ? 'signSpeed60' : 'signSpeed50');

    place(68, 16, (cx, cy, cz, k) => {
      const side = (!s.oneway && k % 2 === 1) ? -driveSign : driveSign;
      const off = s.hw + 0.55;
      const x = cx + rx * side * off, z = cz + rz * side * off;
      if (!ok(x, z, 2.5)) return;
      // Face approaching traffic on this side of the road
      const faceDx = (!s.oneway && side === -driveSign) ? s.dx : -s.dx;
      const faceDz = (!s.oneway && side === -driveSign) ? s.dz : -s.dz;
      push(speedSignType, x, cy + 0.04, z, rotFor(faceDx, faceDz));
      occupy(x, z);
    });

    place(88, 46, (cx, cy, cz, k) => {
      const side = (!s.oneway && k % 2 === 0) ? -driveSign : driveSign;
      const off = s.hw + 0.55;
      const x = cx + rx * side * off, z = cz + rz * side * off;
      if (!ok(x, z, 2.5)) return;
      const warnType = (hashInt(s.id, k) % 2 === 0) ? 'signWarnPed' : 'signWarnCurve';
      const faceDx = (!s.oneway && side === -driveSign) ? s.dx : -s.dx;
      const faceDz = (!s.oneway && side === -driveSign) ? s.dz : -s.dz;
      push(warnType, x, cy + 0.04, z, rotFor(faceDx, faceDz));
      occupy(x, z);
    });

    // Street lights
    const lampSpacing = s.cls === 'residential' ? 38 : s.cls === 'tertiary' ? 34 : 30;
    const lampType = s.cls === 'residential' || s.cls === 'tertiary' ? style.lampMinor : style.lamp;
    place(lampSpacing, 0, (cx, cy, cz, k) => {
      const sides = wide ? [-1, 1] : [k % 2 === 0 ? 1 : -1];
      for (const side of sides) {
        const off = s.hw + 0.45;
        const x = cx + rx * side * off, z = cz + rz * side * off;
        if (!ok(x, z)) continue;
        const ux = -rx * side, uz = -rz * side;
        const rot = rotFor(ux, uz);
        const gy = cy + 0.04;
        let type = lampType;
        if (type === 'lampDouble' && !wide) type = 'lampArm';
        push(type, x, gy, z, rot);
        occupy(x, z);
        if (type === 'lampCobra') heads.push(x + ux * 2.6, gy + 8.75, z + uz * 2.6, rot, gy);
        else if (type === 'lampArm') heads.push(x + ux * 2.3, gy + 8.35, z + uz * 2.3, rot, gy);
        else if (type === 'lampPost') heads.push(x, gy + 3.85, z, rot, gy);
        else if (type === 'lampDouble') {
          heads.push(x + ux * 2.4, gy + 9.85, z + uz * 2.4, rot, gy);
          heads.push(x - ux * 2.4, gy + 9.85, z - uz * 2.4, rot + Math.PI, gy);
        }
      }
    });

    // Fire hydrants near the curb (dense in the US)
    if (style.hydrant > 0) {
      place(90, 17, (cx, cy, cz, k) => {
        if (hash2(cx, cz) > style.hydrant) return;
        const side = k % 2 === 0 ? -1 : 1;
        const x = cx + rx * side * (s.hw + 0.55), z = cz + rz * side * (s.hw + 0.55);
        if (!ok(x, z, 2.0)) return;
        push('hydrant', x, cy + 0.04, z, rotFor(-rx * side, -rz * side));
        occupy(x, z);
      });
    }

    if (s.cls === 'residential') continue;

    // Trash bins at the back of the sidewalk
    place(64, 11, (cx, cy, cz, k) => {
      const side = k % 2 === 0 ? 1 : -1;
      const off = s.hw + swW - 0.4;
      const x = cx + rx * side * off, z = cz + rz * side * off;
      if (!ok(x, z, 2.0)) return;
      push('bin', x, cy + 0.04, z, rotFor(-rx * side, -rz * side));
      occupy(x, z);
    });

    // Benches facing the road (primary/secondary)
    if (s.cls === 'primary' || s.cls === 'secondary') {
      place(130, 47, (cx, cy, cz, k) => {
        const side = k % 2 === 0 ? -1 : 1;
        const off = s.hw + swW - 0.45;
        const x = cx + rx * side * off, z = cz + rz * side * off;
        if (!ok(x, z, 4.0)) return;
        push('bench', x, cy + 0.04, z, rotFor(-rx * side, -rz * side));
        occupy(x, z);
      });

      // Bus stops: shelter at the back of the sidewalk, on the traffic side for the direction of travel
      place(360, 150, (cx, cy, cz, k) => {
        let side = k % 2 === 0 ? 1 : -1;
        if (s.oneway) side = style.left ? -1 : 1;
        const off = s.hw + swW - 0.75;
        const x = cx + rx * side * off, z = cz + rz * side * off;
        if (!ok(x, z, 12.0)) return;
        const e1x = x + s.dx * 2.2, e1z = z + s.dz * 2.2, e2x = x - s.dx * 2.2, e2z = z - s.dz * 2.2;
        if (!ok(e1x, e1z, 12.0) || !ok(e2x, e2z, 12.0)) return;
        push('busStop', x, cy + 0.04, z, rotFor(-rx * side, -rz * side));
        occupy(x, z);
        occupy(e1x, e1z);
        occupy(e2x, e2z);
      });
    }
  }

  // ---- 6. Emit meshes + compact typed arrays ----
  const mk = (name) => (mats && mats[name]) || { name };
  const groups = ud.subGroups;
  if (groups && groups.markings) {
    const m1 = lines.toMesh(mk('streetLineMat'));
    const m2 = wear.toMesh(mk('streetWearMat'));
    const m3 = curbs.toMesh(mk('streetCurbMat'));
    const m4 = decals.toMesh(mk('streetDecalMat'));
    if (m1) groups.markings.add(m1);
    if (m2) groups.markings.add(m2);
    if (m3) {
      m3.geometry.deleteAttribute('normal');
      m3.geometry.computeVertexNormals();
      groups.markings.add(m3);
    }
    if (m4) groups.markings.add(m4);
  }

  dbg.ms = Date.now() - tStart;
  const outTypes = {};
  for (const [k, arr] of Object.entries(types)) outTypes[k] = new Float32Array(arr);
  return {
    region,
    stride: STRIDE,
    types: outTypes,
    heads: new Float32Array(heads),
    signals: new Float32Array(signals),
    signalNodes: new Float32Array(signalNodes),
    gantries,
    blades,
    debug: dbg,
  };
}

export const STREET_STRIDES = { STRIDE, SIG_STRIDE, HEAD_STRIDE };
