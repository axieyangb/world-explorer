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

const GENERIC_STREETS = [
  '1st St', '2nd St', '3rd St', '4th St', '5th St', 'Main St', 'Central Ave', 'Park Ave', 'Station Rd', 'High St',
];

const GENERIC_DIRECTIONS = ['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND', 'THRU TRAFFIC', 'CITY CENTER', 'LOCAL EXIT'];

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
  let s = raw.trim();
  if (
    !s || s.includes('...') || s.includes('Herb Caen') || s.includes('旁 ·') ||
    s.includes('立交匝道') || s.includes('辅路/内部通道') || s.includes('城市道路') ||
    s.includes('高速公路') || s.includes('快速路') || s.includes('主干道') ||
    s.includes('次干道') || s.includes('支路') || s.includes('街巷') ||
    s.includes('高架桥') || s.includes('隧道') || s.includes('步道')
  ) return '';
  if (/^[0-9]+[A-Z]?$/.test(s)) return '';
  s = s
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bParkway\b/gi, 'Pkwy')
    .replace(/\bHighway\b/gi, 'Hwy');
  return s;
}

function cleanOsmRef(rawRef, baseCls, region) {
  if (!rawRef || typeof rawRef !== 'string') return '';
  const first = rawRef.split(';')[0].trim();
  if (!first) return '';
  if (/^[0-9]+[A-Z]$/.test(first)) return ''; // Exit numbers like '2C' are exit tags, not route shield numbers
  if (region === 'us' && /^[0-9]+$/.test(first)) {
    return baseCls === 'motorway' ? `I-${first}` : baseCls === 'trunk' ? `US ${first}` : `CA ${first}`;
  }
  return first;
}

function compassDirFromTangent(dx, dz) {
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'EAST' : 'WEST';
  return dz <= 0 ? 'NORTH' : 'SOUTH';
}

function resolveRoadSignage(id, cls, rawName, rawRef, region, wx, wz, lx, lz, dx, dz, chunkNamedRoads, highwayJunctions = null) {
  const h = hashInt(id || 1, Math.round(wx * 0.05) * 31 + Math.round(wz * 0.05));
  const baseCls = cls.replace('_link', '');
  const isTrueHighway = baseCls === 'motorway' || baseCls === 'trunk';
  let ref = cleanOsmRef(rawRef, baseCls, region);
  const hasRealRef = Boolean(ref);

  // ONLY assign fallback highway route numbers on true highways (motorway / trunk)
  if (!ref && isTrueHighway) {
    const refTable = REGION_HIGHWAY_REFS[region] || REGION_HIGHWAY_REFS.intl;
    const refList = refTable[baseCls] || refTable.motorway;
    if (refList && refList.length > 0) {
      ref = refList[h % refList.length];
    }
  }

  const compass = compassDirFromTangent(dx || 0, dz || -1);
  const realName = cleanOsmName(rawName);
  const hasRealName = Boolean(realName);
  let name = realName;

  // On true highways / freeways, if the OSM name is a ceremonial long name (e.g. "Dwight D. Eisenhower Highway") or empty,
  // use the nearest major arterial name in the chunk + compass direction for gantry signage
  if (isTrueHighway && (!name || /eisenhower|memorial|freeway|turnpike/i.test(name))) {
    let nearMajor = '';
    if (chunkNamedRoads && chunkNamedRoads.length > 0) {
      let bestD2 = Infinity;
      for (let i = 0; i < chunkNamedRoads.length; i++) {
        const nr = chunkNamedRoads[i];
        if (!nr.name || /eisenhower|route /i.test(nr.name)) continue;
        const d2 = (lx - nr.x) * (lx - nr.x) + (lz - nr.z) * (lz - nr.z);
        if (d2 < bestD2) {
          bestD2 = d2;
          nearMajor = nr.name;
        }
      }
    }
    name = nearMajor ? (nearMajor.length <= 12 ? `${nearMajor} ${compass}` : nearMajor) : `${ref || 'HWY'} ${compass}`;
  } else if (!name && (isTrueHighway || hasRealRef)) {
    name = `${ref} ${compass}`;
  }

  // Pick nearest distinct cross-street / nearby street name from actual OpenFreeMap roads in this chunk
  let dest2 = '';
  if (chunkNamedRoads && chunkNamedRoads.length > 0) {
    let bestCrossD2 = Infinity;
    for (let i = 0; i < chunkNamedRoads.length; i++) {
      const nr = chunkNamedRoads[i];
      if (!nr.name || nr.name === name || nr.name === realName || /eisenhower|route /i.test(nr.name)) continue;
      const d2 = (lx - nr.x) * (lx - nr.x) + (lz - nr.z) * (lz - nr.z);
      if (d2 < bestCrossD2) {
        bestCrossD2 = d2;
        dest2 = nr.name;
      }
    }
  }
  let juncRef = '';
  if (highwayJunctions && highwayJunctions.length > 0) {
    let bestJuncD2 = 650 * 650;
    for (let i = 0; i < highwayJunctions.length; i++) {
      const hj = highwayJunctions[i];
      if (!hj.ref) continue;
      const d2 = (lx - hj.lx) * (lx - hj.lx) + (lz - hj.lz) * (lz - hj.lz);
      if (d2 < bestJuncD2) {
        bestJuncD2 = d2;
        juncRef = String(hj.ref).replace(/^EXIT\s+/i, '').trim();
        if (!dest2 && hj.name) {
          const jName = cleanOsmName(hj.name);
          if (jName && jName !== name && jName !== realName) dest2 = jName;
        }
      }
    }
  }
  if (!dest2) {
    dest2 = `${compass}BOUND`;
  }
  const rawExit = juncRef || ((rawRef && /^[0-9]+[A-Z]$/.test(String(rawRef).trim())) ? String(rawRef).trim() : `${1 + (h % 42)}${(h & 3) === 0 ? 'B' : (h & 3) === 1 ? 'A' : ''}`);
  const exitNum = `EXIT ${rawExit}`;
  return { ref, hasRealRef, realName, hasRealName, name, dest2, exitNum };
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

  // ---- 1. Local segment list + spatial grid + chunk-local real OpenFreeMap road names ----
  const segs = [];
  const segGrid = makeGrid(24);
  const chunkNamedRoads = [];
  const seenWayNames = new Set();
  for (const r of (data.roads || [])) {
    const [wid, rCls, rName, , , , , , , , flat] = r;
    if (rCls === 'footway' || rCls === 'pedestrian' || rCls === 'steps' || rCls === 'cycleway' || rCls === 'service') continue;
    const nm = cleanOsmName(rName);
    if (nm && flat && flat.length >= 6 && !seenWayNames.has(`${wid}:${nm}`)) {
      seenWayNames.add(`${wid}:${nm}`);
      const midIdx = Math.floor(flat.length / 6) * 3;
      chunkNamedRoads.push({ id: wid, name: nm, cls: rCls, x: flat[midIdx], z: flat[midIdx + 2] });
    }
  }
  for (let i = 0; i < segsW.length; i++) {
    const s = segsW[i];
    if (s.cls === 'footway' || s.cls === 'pedestrian' || s.cls === 'steps' || s.cls === 'cycleway' || s.cls === 'service') continue;
    const nm = cleanOsmName(s.signName || s.rawName || s.name);
    if (nm && !seenWayNames.has(`${s.id}:${nm}`)) {
      seenWayNames.add(`${s.id}:${nm}`);
      chunkNamedRoads.push({ id: s.id, name: nm, cls: s.cls, x: (s.x1 + s.x2) * 0.5 - ox, z: (s.z1 + s.z2) * 0.5 - oz });
    }
  }

  const highwayJunctions = data.highwayJunctions || [];
  const waySignCache = new Map();
  const getWaySignage = (id, cls, rawName, rawRef, lx, lz, dx, dz) => {
    let info = waySignCache.get(id);
    if (!info) {
      info = resolveRoadSignage(id, cls, rawName, rawRef, region, ox + lx, oz + lz, lx, lz, dx, dz, chunkNamedRoads, highwayJunctions);
      waySignCache.set(id, info);
    }
    return info;
  };

  for (let i = 0; i < segsW.length; i++) {
    const s = segsW[i];
    const x1 = s.x1 - ox, z1 = s.z1 - oz, x2 = s.x2 - ox, z2 = s.z2 - oz;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) continue;
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    const signInfo = getWaySignage(s.id, s.cls, s.signName, s.ref, (x1 + x2) * 0.5, (z1 + z2) * 0.5, dx, dz);
    const ls = {
      x1, y1: s.y1, z1, x2, y2: s.y2, z2, len,
      dx, dz,
      hw: Math.max(1.0, s.width * 0.5),
      cls: s.cls, id: s.id, lanes: s.lanes, oneway: s.oneway, bridge: s.bridge,
      ref: signInfo.ref, hasRealRef: signInfo.hasRealRef,
      realName: signInfo.realName, hasRealName: signInfo.hasRealName,
      signName: signInfo.name, dest2: signInfo.dest2, exitNum: signInfo.exitNum,
    };
    segs.push(ls);
    const m = ls.hw + 5.0;
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

  // Strict road-surface & curb clearance test against EVERY road segment at the same vertical level in the chunk
  const onOtherRoad = (x, z, ownId, margin = 1.35, refY = null, ignoreOwn = false) => {
    const list = segGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (ignoreOwn && s.id === ownId) continue;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.len));
      if (refY !== null) {
        const sy = s.y1 + (s.y2 - s.y1) * t;
        if (Math.abs(sy - refY) > 2.8) continue;
      }
      const px = s.x1 + (s.x2 - s.x1) * t, pz = s.z1 + (s.z2 - s.z1) * t;
      const isPed = s.cls === 'footway' || s.cls === 'pedestrian' || s.cls === 'steps' || s.cls === 'cycleway';
      const reqMargin = isPed ? 0.55 : (ignoreOwn ? Math.max(0.25, margin) : Math.max(1.25, margin));
      const lim = s.id === ownId ? s.hw + Math.min(1.15, reqMargin) : s.hw + reqMargin;
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
    const signInfo = getWaySignage(wid, cls, rName, rRef, flat[0], flat[2], flat[3] - flat[0], flat[5] - flat[2]);
    const w = {
      wid, cls, lanes, hw: Math.max(1.0, widthM * 0.5), oneway, flat, n, cum, total: cum[n - 1], idx: ways.length,
      signName: signInfo.name, realName: signInfo.realName, ref: signInfo.ref,
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
          forward: dir > 0, id: w.wid, total: avail, signName: w.signName, realName: w.realName, ref: w.ref,
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
  for (const n of nodes) {
    const m = n.R + 20;
    nodeGrid.insertBox(n.x - m, n.z - m, n.x + m, n.z + m, n);
  }
  const nearNode = (x, z, pad, ignoreNode = null) => {
    const list = nodeGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n === ignoreNode) continue;
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

    // [terrain-roads] One-way arrows: one per lane every 60 m of run, mid-block, pointing the legal direction
    if (s.oneway && !isLink && cls !== 'motorway' && cls !== 'trunk' && s.len >= 6) {
      const laneW = (hw * 2) / effLanes;
      const aw = Math.min(1.8, laneW * 0.55);
      const padT = 4.0 / s.len;
      for (let k = Math.ceil((segAcc - 30) / 60) * 60 + 30; k < segAcc + s.len; k += 60) {
        const t = (k - segAcc) / s.len;
        if (t < 0 || !ivs.some(([a, b]) => t > a + padT && t < b - padT)) continue;
        const cx = s.x1 + (s.x2 - s.x1) * t, cz = s.z1 + (s.z2 - s.z1) * t;
        if (!inChunk(cx, cz)) continue;
        const sampleY = (px, pz) => roadY(s.id, cls, px, pz) + 0.06;
        for (let l = 0; l < effLanes; l++) {
          const off = -hw + laneW * (l + 0.5);
          decals.add(cx - s.dz * off, cz + s.dx * off, s.dx, s.dz, aw, 4.0, DECAL_CELLS.STENCIL_ARROW_STRAIGHT, sampleY);
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

    // ---- Road-Surface Painted Highway Shields (ONLY on true highways or roads with an explicit OpenFreeMap ref) ----
    const rx = -s.dz, rz = s.dx;
    const sampleDecalY = (px, pz) => roadY(s.id, s.cls, px, pz) + 0.06;
    const driveSign = style.left ? -1 : 1; // lateral side of forward traffic (+1 = right of segment)
    const isTrueHighway = cls === 'motorway' || cls === 'trunk' || cls === 'motorway_link' || cls === 'trunk_link';

    if ((isTrueHighway || s.hasRealRef) && s.ref) {
      const shieldSpacing = 75;
      const shieldPhase = 16;
      let k0 = Math.ceil((segAcc - shieldPhase) / shieldSpacing);
      for (let d = k0 * shieldSpacing + shieldPhase; d < segAcc + s.len; k0++, d = k0 * shieldSpacing + shieldPhase) {
        const t = (d - segAcc) / s.len;
        if (t < 0.08 || t > 0.92) continue;
        const cx = s.x1 + (s.x2 - s.x1) * t, cz = s.z1 + (s.z2 - s.z1) * t;
        if (!inChunk(cx, cz) || nearNode(cx, cz, 8.0)) continue;

        const shieldCell = chooseShieldCell(s.ref, s.id + k0, cls, region);
        const decalW = Math.min(3.8, Math.max(2.6, (twoWay ? hw : hw * 2) * 0.62));
        const decalL = 4.0;

        if (twoWay) {
          const latOff = driveSign * (hw * 0.5);
          decals.add(cx + rx * latOff, cz + rz * latOff, s.dx, s.dz, decalW, decalL, shieldCell, sampleDecalY);
          decals.add(cx - rx * latOff, cz - rz * latOff, -s.dx, -s.dz, decalW, decalL, shieldCell, sampleDecalY);
        } else {
          // Center squarely inside a travel lane, never on a dashed lane divider line
          const laneOff = (effLanes % 2 === 1) ? 0.0 : driveSign * (hw / effLanes);
          const laneW = (hw * 2) / effLanes;
          const fitW = Math.min(decalW, laneW * 0.78);
          decals.add(cx + rx * laneOff, cz + rz * laneOff, s.dx, s.dz, fitW, decalL, shieldCell, sampleDecalY);
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

    // Collect two distinct REAL OpenFreeMap street names at this intersection for Green Street Name Blade Signs
    let streetA = '', streetB = '';
    for (const a of node.arms) {
      const nm = a.realName || '';
      if (!nm) continue;
      if (!streetA) streetA = nm;
      else if (nm !== streetA && !streetB) streetB = nm;
    }
    const hasTwoRealStreets = Boolean(streetA && streetB && streetA !== streetB);
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
      const isMinorUnsignalizedApproach = !signalized && (
        arm.cls === 'residential' || arm.cls === 'tertiary' || arm.cls === 'unclassified' || arm.cls === 'living_street'
      );

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

        const sampleArmY = (px, pz) => roadY(arm.id, arm.cls, px, pz) + 0.06;
        const midLat = (oa + ob) * 0.5;
        const spanLat = Math.abs(ob - oa);

        // Rule 2: White "STOP" pavement stencil ONLY at unsignalized minor/residential/tertiary intersection approaches (4.5m before stop bar)
        if (isMinorUnsignalizedApproach && arm.total >= sl + 6.5) {
          const stopDist = sl + 4.5;
          const stX = node.x + ax * stopDist + rx * midLat;
          const stZ = node.z + az * stopDist + rz * midLat;
          decals.add(stX, stZ, -ax, -az, Math.min(3.0, spanLat * 0.78), 2.8, DECAL_CELLS.STENCIL_STOP, sampleArmY);
        }

        // Rule 3: White lane directional arrows ONLY ~14m before an actual intersection on primary/secondary roads
        if ((arm.cls === 'primary' || arm.cls === 'secondary') && arm.total >= sl + 11.5) {
          const arrowDist = Math.max(sl + 8.5, node.R + 14.0);
          if (arm.total >= arrowDist + 2.5) {
            if (spanLat >= 5.0) {
              const q1 = oa + spanLat * 0.26;
              const q2 = oa + spanLat * 0.74;
              const turnCell = style.left ? DECAL_CELLS.STENCIL_ONLY_RIGHT : DECAL_CELLS.STENCIL_ONLY_LEFT;
              decals.add(node.x + ax * arrowDist + rx * q1, node.z + az * arrowDist + rz * q1, -ax, -az, 2.2, 3.3, turnCell, sampleArmY);
              decals.add(node.x + ax * arrowDist + rx * q2, node.z + az * arrowDist + rz * q2, -ax, -az, 2.2, 3.3, DECAL_CELLS.STENCIL_ARROW_COMBO, sampleArmY);
            } else {
              const arX = node.x + ax * arrowDist + rx * midLat;
              const arZ = node.z + az * arrowDist + rz * midLat;
              decals.add(arX, arZ, -ax, -az, Math.min(2.4, spanLat * 0.72), 3.2, DECAL_CELLS.STENCIL_ARROW_COMBO, sampleArmY);
            }
          }
        }
      }

      // Bollards at both crosswalk ends (sidewalk corners, well outside asphalt road & curb)
      if (MAJOR_CLS.has(arm.cls) && node.majors >= 2) {
        for (const side of [-1, 1]) {
          for (const d of [c1 + 0.8]) {
            const bx = node.x + ax * d + rx * side * (hw + 1.45);
            const bz = node.z + az * d + rz * side * (hw + 1.45);
            const gy = roadY(arm.id, arm.cls, bx, bz) + 0.04;
            if (!inChunk(bx, bz) || nearNode(bx, bz, 6.0, node) || onOtherRoad(bx, bz, arm.id, 1.35, gy) || inBuilding(bx, bz)) continue;
            push('bollard', bx, gy, bz, 0);
          }
        }
      }

      // Rule 4A: Crossed Green Street Name Blade Signs ONLY where two distinct real OpenFreeMap road names meet
      if (hasTwoRealStreets && bladesPlacedAtNode < 2) {
        const cornerSide = -inboundSign;
        const bd = c1 + 1.2;
        const bx = node.x + ax * bd + rx * cornerSide * (hw + 1.8);
        const bz = node.z + az * bd + rz * cornerSide * (hw + 1.8);
        const gy = roadY(arm.id, arm.cls, bx, bz) + 0.04;
        if (inChunk(bx, bz) && !nearNode(bx, bz, 7.5, node) && !onOtherRoad(bx, bz, arm.id, 1.45, gy) && !inBuilding(bx, bz) && isFree(bx, bz)) {
          const rot = rotFor(ax, az);
          push('bladePost', bx, gy, bz, rot);
          const bName1 = arm.realName || streetA;
          const bName2 = bName1 === streetB ? streetA : streetB;
          blades.push([bx, gy + 2.85, bz, rot, bName1, bName2]);
          occupy(bx, bz);
          bladesPlacedAtNode++;
        }
      }

      // Traffic signal: pole at the near-side corner on the outer sidewalk (hw + 1.65m), mast arm over inbound lanes
      if (signalized && !outboundOnly) {
        const sideSign = inboundSign;
        const pd = c1 + 2.0;
        const px = node.x + ax * pd + rx * sideSign * (hw + 1.65);
        const pz = node.z + az * pd + rz * sideSign * (hw + 1.65);
        const gy = roadY(arm.id, arm.cls, px, pz) + 0.04;
        if (inChunk(px, pz) && !nearNode(px, pz, 7.5, node) && !onOtherRoad(px, pz, arm.id, 1.35, gy) && !inBuilding(px, pz)) {
          const uX = -rx * sideSign, uZ = -rz * sideSign;
          const inboundW = inboundOnly ? hw * 2 : hw;
          const armLen = Math.max(3.2, Math.min(8.2, inboundW * 0.6 + 1.55));
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

      // Rule 2: Curbside Red Octagon STOP Sign ONLY at unsignalized minor/residential/tertiary intersection approaches (hw + 1.8m)
      if (!outboundOnly && isMinorUnsignalizedApproach) {
        const sideSign = inboundSign;
        const sd = c1 + 2.2;
        const sx = node.x + ax * sd + rx * sideSign * (hw + 1.8);
        const sz = node.z + az * sd + rz * sideSign * (hw + 1.8);
        const gy = roadY(arm.id, arm.cls, sx, sz) + 0.04;
        if (inChunk(sx, sz) && !nearNode(sx, sz, 7.5, node) && !onOtherRoad(sx, sz, arm.id, 1.45, gy) && !inBuilding(sx, sz) && isFree(sx, sz)) {
          // Face approaching traffic (which travels in direction -ax, -az, so sign normal points +ax, +az)
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
    const ok = (x, z, pad = 10.0, refY = null) => {
      dbg.tries++;
      if (!inChunk(x, z)) return false;
      if (nearNode(x, z, pad)) return (dbg.node++, false);
      if (onOtherRoad(x, z, s.id, 1.45, refY)) return (dbg.road++, false);
      if (inBuilding(x, z)) return (dbg.bldg++, false);
      if (!isFree(x, z)) return (dbg.occ++, false);
      return true;
    };

    // Check if an upper bridge deck sits directly above (x, z, cy) so lower decks of double-deck bridges never get 6.8m gantries/lamps clipping the upper deck
    const hasOverheadDeck = (x, z, cy) => {
      const list = segGrid.query(x, z);
      for (let m = 0; m < list.length; m++) {
        const os = list[m];
        if (os.id === s.id) continue;
        const t = Math.max(0, Math.min(1, ((x - os.x1) * os.dx + (z - os.z1) * os.dz) / os.len));
        const oy = os.y1 + (os.y2 - os.y1) * t;
        if (oy > cy + 2.2 && oy < cy + 10.5) {
          const px = os.x1 + (os.x2 - os.x1) * t, pz = os.z1 + (os.z2 - os.z1) * t;
          if ((x - px) * (x - px) + (z - pz) * (z - pz) < (os.hw + 3.5) * (os.hw + 3.5)) return true;
        }
      }
      return false;
    };

    // ---- 5A. 3D Overhead Highway Gantry Signs ONLY on true highways (motorway/trunk) or primary/secondary roads with an explicit OpenFreeMap ref ----
    const canHaveGantry = isHighway || (s.hasRealRef && (s.cls === 'primary' || s.cls === 'secondary'));
    if (canHaveGantry && s.ref) {
      const gantrySpacing = isHighway ? 150 : 210;
      place(gantrySpacing, 28, (cx, cy, cz, k) => {
        if (!inChunk(cx, cz)) return;
        const onBridgeDeck = Boolean(s.bridge || (cy - terrMid > 2.0));
        if (!onBridgeDeck && nearNode(cx, cz, 14.0)) return;
        if (hasOverheadDeck(cx, cz, cy)) return;
        // On elevated freeway bridges, bolt gantry legs directly onto the outer concrete bridge parapets (s.hw + 0.25m);
        // on ground-level roads, place legs on the outer sidewalk/shoulder (s.hw + 1.7m)
        const spanW = onBridgeDeck ? (s.hw * 2 + 0.5) : (s.hw * 2 + 3.4);
        const halfSpan = spanW * 0.5;
        const lx = cx - rx * halfSpan, lz = cz - rz * halfSpan;
        const rxp = cx + rx * halfSpan, rzp = cz + rz * halfSpan;
        if (!inChunk(lx, lz) || !inChunk(rxp, rzp)) return;
        if (onBridgeDeck) {
          if (onOtherRoad(lx, lz, s.id, 0.25, cy, true) || onOtherRoad(rxp, rzp, s.id, 0.25, cy, true)) return;
        } else {
          if (onOtherRoad(lx, lz, s.id, 1.35, cy) || onOtherRoad(rxp, rzp, s.id, 1.35, cy)) return;
        }
        if (inBuilding(lx, lz) || inBuilding(rxp, rzp)) return;
        if (!isFree(lx, lz) || !isFree(rxp, rzp)) return;

        // Pick dynamic nearest real OpenFreeMap cross-street destinations near this exact gantry position (cx, cz)
        const compass = compassDirFromTangent(s.dx, s.dz);
        let mainBaseName = s.realName && !/eisenhower|route /i.test(s.realName) ? s.realName : '';
        let localMainDest = s.signName;
        let localDest2 = s.dest2;
        if (chunkNamedRoads.length > 0) {
          if (isHighway || !mainBaseName) {
            let bestMainD2 = Infinity;
            for (let nrIdx = 0; nrIdx < chunkNamedRoads.length; nrIdx++) {
              const nr = chunkNamedRoads[nrIdx];
              if (!nr.name || /eisenhower|route /i.test(nr.name)) continue;
              if (isHighway && nr.cls !== 'primary' && nr.cls !== 'secondary' && nr.cls !== 'tertiary') continue;
              const d2 = (cx - nr.x) * (cx - nr.x) + (cz - nr.z) * (cz - nr.z);
              if (d2 < bestMainD2) {
                bestMainD2 = d2;
                mainBaseName = nr.name;
                localMainDest = nr.name.length <= 12 ? `${nr.name} ${compass}` : nr.name;
              }
            }
          }
          let bestCrossD2 = Infinity;
          for (let nrIdx = 0; nrIdx < chunkNamedRoads.length; nrIdx++) {
            const nr = chunkNamedRoads[nrIdx];
            if (!nr.name || /eisenhower|route /i.test(nr.name)) continue;
            if (nr.name === mainBaseName || nr.name === localMainDest) continue;
            const d2 = (cx - nr.x) * (cx - nr.x) + (cz - nr.z) * (cz - nr.z);
            if (d2 < bestCrossD2) {
              bestCrossD2 = d2;
              localDest2 = nr.name;
            }
          }
        }

        // Match nearest real OpenFreeMap motorway_junction exit ref (`EXIT 2A`, `EXIT 1C`, etc.) to gantry position (cx, cz)
        let localExitNum = s.exitNum;
        if (highwayJunctions.length > 0) {
          let bestJuncD2 = 650 * 650;
          for (let jIdx = 0; jIdx < highwayJunctions.length; jIdx++) {
            const hj = highwayJunctions[jIdx];
            if (!hj.ref) continue;
            const d2 = (cx - hj.lx) * (cx - hj.lx) + (cz - hj.lz) * (cz - hj.lz);
            if (d2 < bestJuncD2) {
              bestJuncD2 = d2;
              const cleanRef = String(hj.ref).replace(/^EXIT\s+/i, '').trim();
              if (cleanRef) localExitNum = `EXIT ${cleanRef}`;
              if (hj.name && (!localDest2 || /BOUND$/i.test(localDest2))) {
                const jName = cleanOsmName(hj.name);
                if (jName && jName !== mainBaseName && jName !== localMainDest) {
                  localDest2 = jName;
                }
              }
            }
          }
        }

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
          s.ref, localMainDest, localDest2, localExitNum,
        ]);
        dbg.gantries++;
      });
    }

    // Highway lights: single-arm poles on the outer edge
    if (isHighway) {
      const onBridgeDeck = Boolean(s.bridge || ((s.y1 + s.y2) * 0.5 - terrMid > 2.0));
      const lampOff = onBridgeDeck ? (s.hw + 0.25) : (s.hw + 1.5);
      place(45, 0, (cx, cy, cz) => {
        if (hasOverheadDeck(cx, cz, cy)) return;
        for (const side of [-1, 1]) {
          const x = cx + rx * side * lampOff, z = cz + rz * side * lampOff;
          if (!inChunk(x, z) || nearNode(x, z, 10.0) || inBuilding(x, z) || !isFree(x, z)) continue;
          if (onBridgeDeck ? onOtherRoad(x, z, s.id, 0.4, cy, true) : onOtherRoad(x, z, s.id, 1.35, cy)) continue;
          const ux = -rx * side, uz = -rz * side;
          const rot = rotFor(ux, uz);
          push('lampArm', x, cy, z, rot);
          occupy(x, z);
          heads.push(x + ux * 2.3, cy + 8.35, z + uz * 2.3, rot, cy);
        }
      });
      continue;
    }

    if (isElevated) continue;

    // ---- 5B. Roadside Speed Limit Signs (at most 1 per 220m along outer sidewalks at hw + 1.65m, facing oncoming traffic) ----
    const speedSignType = region === 'us'
      ? (s.cls === 'residential' || s.cls === 'tertiary' ? 'signSpeed25' : 'signSpeed35')
      : (s.cls === 'primary' ? 'signSpeed60' : 'signSpeed50');

    place(220, 48, (cx, cy, cz, k) => {
      const side = (!s.oneway && k % 2 === 1) ? -driveSign : driveSign;
      const off = s.hw + 1.65;
      const x = cx + rx * side * off, z = cz + rz * side * off;
      if (!ok(x, z, 18.0, cy)) return;
      // Face approaching traffic on this side of the road
      const faceDx = (!s.oneway && side === -driveSign) ? s.dx : -s.dx;
      const faceDz = (!s.oneway && side === -driveSign) ? s.dz : -s.dz;
      push(speedSignType, x, cy + 0.04, z, rotFor(faceDx, faceDz));
      occupy(x, z);
    });

    // Street lights
    const lampSpacing = s.cls === 'residential' ? 38 : s.cls === 'tertiary' ? 34 : 30;
    const lampType = s.cls === 'residential' || s.cls === 'tertiary' ? style.lampMinor : style.lamp;
    place(lampSpacing, 0, (cx, cy, cz, k) => {
      const sides = wide ? [-1, 1] : [k % 2 === 0 ? 1 : -1];
      for (const side of sides) {
        const off = s.hw + 1.45;
        const x = cx + rx * side * off, z = cz + rz * side * off;
        if (!ok(x, z, 11.0, cy)) continue;
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

    // Fire hydrants on the sidewalk (dense in the US)
    if (style.hydrant > 0) {
      place(90, 17, (cx, cy, cz, k) => {
        if (hash2(cx, cz) > style.hydrant) return;
        const side = k % 2 === 0 ? -1 : 1;
        const x = cx + rx * side * (s.hw + 1.45), z = cz + rz * side * (s.hw + 1.45);
        if (!ok(x, z, 10.0)) return;
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
        if (!ok(x, z, 12.0, cy)) return;
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
