/**
 * Vegetation & landcover — worker side.
 *
 * 1. `extractLandcoverPolys()` runs inside `fetchGlobalChunkData` and turns OpenFreeMap `landuse` /
 *    `landcover` polygons into chunk-local rings tagged with a compact landcover kind.
 * 2. `buildVegetationLayer()` runs inside the chunk build task. It adds one merged landcover ground mesh
 *    (material key `landcoverMat`) to the chunk's terrain group and returns a compact tree/bush instance
 *    table that the main-thread `VegetationSystem` (src/features/vegetation.js) renders with InstancedMesh.
 *
 * Instance table layout: Float32Array, stride INST_STRIDE = [x, y, z, sXZ, sY, rotY, r, g, b] (world space),
 * plus a Uint8Array of species ids (see SPECIES in vegetation.js).
 */
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation } from '../environment.js';

export const INST_STRIDE = 9;
export const SP_BROADLEAF = 0;
export const SP_TALL = 1;
export const SP_CONIFER = 2;
export const SP_PALM = 3;
export const SP_BUSH = 4;

const MAX_CHUNK_INSTANCES = 12000;

// Landcover kinds
const LC_RESIDENTIAL = 1;
const LC_COMMERCIAL = 2;
const LC_INDUSTRIAL = 3;
const LC_INSTITUTION = 4;
const LC_CEMETERY = 5;
const LC_FARMLAND = 6;
const LC_GRASS = 7;
const LC_SCRUB = 8;
const LC_WETLAND = 9;
const LC_SAND = 10;
const LC_ROCK = 11;
const LC_ICE = 12;
const LC_WOOD = 13;
const LC_ORCHARD = 14;

// kind -> [rgb, height above terrain, shader pattern]
// pattern: 0 plain, 1 field rows, 2 sand, 3 paving, 4 undergrowth
// Heights stay below parks (0.08-0.15) for urban kinds and above them for natural cover, all below roads (>= 0.28).
const LC_STYLE = {
  [LC_RESIDENTIAL]: [[0.47, 0.46, 0.43], 0.020, 3],
  [LC_COMMERCIAL]: [[0.50, 0.49, 0.48], 0.024, 3],
  [LC_INDUSTRIAL]: [[0.45, 0.44, 0.41], 0.028, 3],
  [LC_INSTITUTION]: [[0.51, 0.48, 0.43], 0.032, 3],
  [LC_CEMETERY]: [[0.35, 0.45, 0.29], 0.036, 0],
  [LC_FARMLAND]: [[0.60, 0.56, 0.35], 0.040, 1],
  [LC_ORCHARD]: [[0.44, 0.50, 0.29], 0.044, 1],
  [LC_GRASS]: [[0.34, 0.51, 0.24], 0.060, 0],
  [LC_SCRUB]: [[0.38, 0.44, 0.26], 0.160, 4],
  [LC_WETLAND]: [[0.31, 0.41, 0.31], 0.164, 4],
  [LC_SAND]: [[0.85, 0.78, 0.59], 0.168, 2],
  [LC_ROCK]: [[0.55, 0.53, 0.50], 0.172, 0],
  [LC_ICE]: [[0.92, 0.94, 0.97], 0.176, 0],
  [LC_WOOD]: [[0.22, 0.31, 0.16], 0.180, 4],
};

function classifyLandcover(layer, tags) {
  const c = tags.class || '';
  const s = tags.subclass || '';
  if (layer === 'landcover') {
    if (c === 'wood' || s === 'forest' || s === 'wood') return LC_WOOD;
    if (c === 'sand' || s === 'beach' || s === 'sand' || s === 'dune') return LC_SAND;
    if (c === 'wetland' || s === 'marsh' || s === 'swamp' || s === 'bog' || s === 'reedbed' || s === 'wet_meadow') return LC_WETLAND;
    if (c === 'rock' || s === 'bare_rock' || s === 'scree') return LC_ROCK;
    if (c === 'ice' || s === 'glacier') return LC_ICE;
    if (s === 'orchard' || s === 'vineyard') return LC_ORCHARD;
    if (c === 'farmland' || s === 'farmland' || s === 'allotments' || s === 'plant_nursery') return LC_FARMLAND;
    if (s === 'scrub' || s === 'heath') return LC_SCRUB;
    if (c === 'grass') return LC_GRASS;
    return 0;
  }
  if (layer === 'landuse') {
    switch (c) {
      case 'residential': return LC_RESIDENTIAL;
      case 'commercial':
      case 'retail': return LC_COMMERCIAL;
      case 'industrial':
      case 'railway':
      case 'garages':
      case 'military':
      case 'quarry':
      case 'bus_station':
      case 'dam': return LC_INDUSTRIAL;
      case 'school':
      case 'university':
      case 'kindergarten':
      case 'college':
      case 'library':
      case 'hospital': return LC_INSTITUTION;
      case 'cemetery': return LC_CEMETERY;
      case 'theme_park':
      case 'zoo': return LC_GRASS;
      default: return 0;
    }
  }
  return 0;
}

function clipRing(flat, minB, maxB) {
  let pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const clip = (input, inside, cut) => {
    const out = [];
    const n = input.length;
    for (let i = 0; i < n; i++) {
      const cur = input[i];
      const prev = input[(i - 1 + n) % n];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cut(prev, cur));
      }
    }
    return out;
  };
  const lerpX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9)];
  const lerpZ = (a, b, z) => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1] || 1e-9), z];
  pts = clip(pts, (p) => p[0] >= minB, (a, b) => lerpX(a, b, minB));
  if (pts.length) pts = clip(pts, (p) => p[0] <= maxB, (a, b) => lerpX(a, b, maxB));
  if (pts.length) pts = clip(pts, (p) => p[1] >= minB, (a, b) => lerpZ(a, b, minB));
  if (pts.length) pts = clip(pts, (p) => p[1] <= maxB, (a, b) => lerpZ(a, b, maxB));
  const out = [];
  for (const [x, z] of pts) {
    const n = out.length;
    if (n >= 2 && Math.abs(x - out[n - 2]) + Math.abs(z - out[n - 1]) < 0.3) continue;
    out.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
  }
  return out;
}

function ringArea(flat) {
  let a = 0;
  for (let i = 0, n = flat.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
  }
  return Math.abs(a) * 0.5;
}

/**
 * Tile-side hook: extracts landuse/landcover polygons as `[kind, outerFlat, holesFlat[]]` in chunk-local XZ.
 */
export function extractLandcoverPolys(tiles, toLocalXZ) {
  const out = [];
  const seen = new Set();
  for (const t of tiles) {
    for (const layer of ['landuse', 'landcover']) {
      for (const f of t[layer] || []) {
        if (f.type !== 3) continue;
        const kind = classifyLandcover(layer, f.tags || {});
        if (!kind) continue;
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const raw = [];
          for (let i = 0; i < poly.outer.length; i++) {
            const [lx, lz] = toLocalXZ(poly.outer[i][0], poly.outer[i][1]);
            raw.push(lx, lz);
          }
          const outer = clipRing(raw, -501, 501);
          if (outer.length < 6) continue;
          const area = ringArea(outer);
          if (area < 30) continue;
          let sx = 0, sz = 0;
          for (let i = 0; i < outer.length; i += 2) {
            sx += outer[i];
            sz += outer[i + 1];
          }
          const n = outer.length / 2;
          const key = `${kind},${Math.round(sx / n / 4)},${Math.round(sz / n / 4)},${Math.round(area / 50)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const holes = [];
          for (const h of poly.holes || []) {
            if (h.length < 3) continue;
            const rh = [];
            for (let i = 0; i < h.length; i++) {
              const [lx, lz] = toLocalXZ(h[i][0], h[i][1]);
              rh.push(lx, lz);
            }
            const ch = clipRing(rh, -501, 501);
            if (ch.length >= 6) holes.push(ch);
          }
          out.push([kind, outer, holes]);
        }
      }
    }
  }
  // Render low-priority (urban) kinds first; natural cover last
  out.sort((a, b) => LC_STYLE[a[0]][1] - LC_STYLE[b[0]][1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Chunk-side helpers
// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pointInRing(px, pz, flat) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1];
    const xj = flat[j], zj = flat[j + 1];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function distToRing2(px, pz, flat) {
  let best = Infinity;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const ax = flat[j], az = flat[j + 1];
    const vx = flat[i] - ax, vz = flat[i + 1] - az;
    const l2 = vx * vx + vz * vz;
    const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
    const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

function bboxOf(flat) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i], z = flat[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minZ, maxX, maxZ];
}

/** Uniform 2D bucket grid over chunk-local [-520, 520]. */
function createGrid(cell) {
  const N = Math.ceil(1040 / cell);
  const buckets = new Array(N * N);
  const ci = (v) => Math.max(0, Math.min(N - 1, Math.floor((v + 520) / cell)));
  return {
    insert(minX, minZ, maxX, maxZ, item) {
      const x0 = ci(minX), x1 = ci(maxX), z0 = ci(minZ), z1 = ci(maxZ);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const k = z * N + x;
          (buckets[k] || (buckets[k] = [])).push(item);
        }
      }
    },
    query(x, z) {
      return buckets[ci(z) * N + ci(x)] || EMPTY;
    },
  };
}
const EMPTY = [];

/** Recursively splits triangles until every edge is <= maxEdge (keeps landcover hugging the DEM). */
function pushSubdivided(out, ax, az, bx, bz, cx, cz, maxEdge, depth = 0) {
  const ab = (ax - bx) ** 2 + (az - bz) ** 2;
  const bc = (bx - cx) ** 2 + (bz - cz) ** 2;
  const ca = (cx - ax) ** 2 + (cz - az) ** 2;
  const m2 = maxEdge * maxEdge;
  if (depth > 9 || (ab <= m2 && bc <= m2 && ca <= m2)) {
    out.push(ax, az, bx, bz, cx, cz);
    return;
  }
  if (ab >= bc && ab >= ca) {
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    pushSubdivided(out, ax, az, mx, mz, cx, cz, maxEdge, depth + 1);
    pushSubdivided(out, mx, mz, bx, bz, cx, cz, maxEdge, depth + 1);
  } else if (bc >= ca) {
    const mx = (bx + cx) * 0.5, mz = (bz + cz) * 0.5;
    pushSubdivided(out, ax, az, bx, bz, mx, mz, maxEdge, depth + 1);
    pushSubdivided(out, ax, az, mx, mz, cx, cz, maxEdge, depth + 1);
  } else {
    const mx = (cx + ax) * 0.5, mz = (cz + az) * 0.5;
    pushSubdivided(out, ax, az, bx, bz, mx, mz, maxEdge, depth + 1);
    pushSubdivided(out, mx, mz, bx, bz, cx, cz, maxEdge, depth + 1);
  }
}

function buildLandcoverMesh(polys, ox, oz, isPointInWater, isPointInSunkenTrench) {
  const pos = [];
  const col = [];
  const uv = [];
  const sub = [];
  for (let p = 0; p < polys.length; p++) {
    const [kind, outer, holes] = polys[p];
    const style = LC_STYLE[kind];
    if (!style) continue;
    const [rgb, yOff, pattern] = style;
    const contour = [];
    for (let i = 0; i < outer.length; i += 2) contour.push(new THREE.Vector2(outer[i], outer[i + 1]));
    const holePts = [];
    for (const h of holes || []) {
      const hp = [];
      for (let i = 0; i < h.length; i += 2) hp.push(new THREE.Vector2(h[i], h[i + 1]));
      holePts.push(hp);
    }
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, holePts);
    } catch {
      continue;
    }
    const all = contour.concat(...holePts);
    sub.length = 0;
    for (const [a, b, c] of tris) {
      const A = all[a], B = all[b], C = all[c];
      if (!A || !B || !C) continue;
      pushSubdivided(sub, A.x, A.y, B.x, B.y, C.x, C.y, isPointInSunkenTrench ? 22 : 34);
    }
    for (let i = 0; i < sub.length; i += 6) {
      const ax = sub[i], az = sub[i + 1], bx = sub[i + 2], bz = sub[i + 3], cx = sub[i + 4], cz = sub[i + 5];
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
      if (isPointInWater && isPointInWater(mx, mz, 0)) continue;
      if (
        isPointInSunkenTrench &&
        (isPointInSunkenTrench(mx, mz) || isPointInSunkenTrench(ax, az) || isPointInSunkenTrench(bx, bz) || isPointInSunkenTrench(cx, cz))
      ) {
        continue;
      }
      const ya = getBeijingTerrainElevation(ox + ax, oz + az) + yOff;
      const yb = getBeijingTerrainElevation(ox + bx, oz + bz) + yOff;
      const yc = getBeijingTerrainElevation(ox + cx, oz + cz) + yOff;
      // Counter-clockwise when viewed from above (+Y up)
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (cross > 0) pos.push(ax, ya, az, cx, yc, cz, bx, yb, bz);
      else pos.push(ax, ya, az, bx, yb, bz, cx, yc, cz);
      for (let k = 0; k < 3; k++) {
        col.push(rgb[0], rgb[1], rgb[2]);
        uv.push(pattern, kind);
      }
    }
  }
  if (pos.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const c8 = new Uint8Array(col.length);
  for (let i = 0; i < col.length; i++) c8[i] = Math.round(Math.min(1, Math.max(0, col[i])) * 255);
  geom.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geom, { name: 'landcoverMat' });
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/** Climate-driven species mix from latitude. */
function climateMix(absLat) {
  if (absLat < 23.5) return { palm: 0.45, conifer: 0.05, tall: 0.15 };
  if (absLat < 32) return { palm: 0.22, conifer: 0.12, tall: 0.18 };
  if (absLat < 50) return { palm: 0, conifer: 0.22, tall: 0.26 };
  return { palm: 0, conifer: 0.5, tall: 0.2 };
}

function pickTree(r, mix, coniferBias = 1, palmBias = 1) {
  const pPalm = mix.palm * palmBias;
  const pCon = Math.min(0.9, mix.conifer * coniferBias);
  if (r < pPalm) return SP_PALM;
  if (r < pPalm + pCon) return SP_CONIFER;
  if (r < pPalm + pCon + mix.tall) return SP_TALL;
  return SP_BROADLEAF;
}

/**
 * Chunk hook: builds the landcover ground mesh into `terrainGroup` and returns the vegetation instance table.
 */
export function buildVegetationLayer({ cx, cz, ox, oz, data, roadSegments, isPointInWater, isPointInSunkenTrench, terrainGroup, worldOrigin }) {
  const landPolys = data.landcover || [];
  const lcMesh = buildLandcoverMesh(landPolys, ox, oz, isPointInWater, isPointInSunkenTrench);
  if (lcMesh && terrainGroup) terrainGroup.add(lcMesh);

  const lat = worldOrigin && Number.isFinite(worldOrigin.centerLat) ? worldOrigin.centerLat : 39.9;
  const mix = climateMix(Math.abs(lat));
  const autumnChance = Math.abs(lat) > 34 && Math.abs(lat) < 55 ? 0.06 : 0;

  const inst = new Float32Array(MAX_CHUNK_INSTANCES * INST_STRIDE);
  const species = new Uint8Array(MAX_CHUNK_INSTANCES);
  let count = 0;

  // --- Spatial indices (chunk-local) ---
  const roadGrid = createGrid(20);
  const junctionGrid = createGrid(40);
  const nodeDeg = new Map();
  const segs = [];
  for (const s of roadSegments || []) {
    if (s.tunnel) continue;
    const x1 = s.x1 - ox, z1 = s.z1 - oz, x2 = s.x2 - ox, z2 = s.z2 - oz;
    const hw = (s.width || 4) * 0.5;
    const seg = { x1, z1, x2, z2, hw, cls: s.cls, bridge: s.bridge, name: s.name || '' };
    segs.push(seg);
    roadGrid.insert(Math.min(x1, x2) - hw - 4, Math.min(z1, z2) - hw - 4, Math.max(x1, x2) + hw + 4, Math.max(z1, z2) + hw + 4, seg);
    if (!s.bridge) {
      for (const [x, z] of [[x1, z1], [x2, z2]]) {
        const k = `${Math.round(x / 1.5)},${Math.round(z / 1.5)}`;
        const e = nodeDeg.get(k);
        if (e) e.n++;
        else nodeDeg.set(k, { x, z, n: 1 });
      }
    }
  }
  for (const e of nodeDeg.values()) {
    if (e.n >= 3) junctionGrid.insert(e.x - 14, e.z - 14, e.x + 14, e.z + 14, e);
  }
  // Clearance from the nearest carriageway edge (negative = on the road)
  const roadClearance = (x, z) => {
    let best = Infinity;
    const list = roadGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-4 ? Math.max(0, Math.min(1, ((x - s.x1) * vx + (z - s.z1) * vz) / l2)) : 0;
      const dx = x - (s.x1 + vx * t), dz = z - (s.z1 + vz * t);
      const d = Math.sqrt(dx * dx + dz * dz) - s.hw;
      if (d < best) best = d;
    }
    return best;
  };
  const nearJunction = (x, z, r) => {
    const list = junctionGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if ((e.x - x) ** 2 + (e.z - z) ** 2 < r * r) return true;
    }
    return false;
  };

  const bldgGrid = createGrid(25);
  for (const b of data.buildings || []) {
    const outer = b[11];
    if (!outer || outer.length < 6) continue;
    const bb = bboxOf(outer);
    bldgGrid.insert(bb[0] - 3, bb[1] - 3, bb[2] + 3, bb[3] + 3, { bb, outer });
  }
  const nearBuilding = (x, z, r) => {
    const list = bldgGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const { bb, outer } = list[i];
      if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue;
      if (pointInRing(x, z, outer)) return true;
      if (r > 0 && distToRing2(x, z, outer) < r * r) return true;
    }
    return false;
  };

  const groundOk = (x, z, roadClear, bldgClear, waterClear) => {
    if (x < -500 || x >= 500 || z < -500 || z >= 500) return false;
    if (isPointInWater && isPointInWater(x, z, waterClear)) return false;
    if (isPointInSunkenTrench && isPointInSunkenTrench(x, z)) return false;
    if (roadClearance(x, z) < roadClear) return false;
    if (nearBuilding(x, z, bldgClear)) return false;
    return true;
  };

  const push = (sp, x, z, sXZ, sY, rot, rng) => {
    if (count >= MAX_CHUNK_INSTANCES) return false;
    const wx = ox + x, wz = oz + z;
    const o = count * INST_STRIDE;
    inst[o] = wx;
    inst[o + 1] = getBeijingTerrainElevation(wx, wz) - 0.05;
    inst[o + 2] = wz;
    inst[o + 3] = sXZ;
    inst[o + 4] = sY;
    inst[o + 5] = rot;
    // Per-instance foliage tint (multiplies the species' base vertex colors)
    const lum = 0.84 + rng() * 0.3;
    const warm = (rng() - 0.5) * 0.18;
    let r = lum * (1 + warm), g = lum, b = lum * (1 - warm * 0.6);
    if ((sp === SP_BROADLEAF || sp === SP_TALL) && autumnChance > 0 && rng() < autumnChance) {
      r = 1.75; g = 1.25; b = 0.45;
    }
    inst[o + 6] = r;
    inst[o + 7] = g;
    inst[o + 8] = b;
    species[count] = sp;
    count++;
    return true;
  };

  // --- 1. Street trees: rows on sidewalks, regular spacing per street, skipping junctions/driveways ---
  const STREET = { primary: 2.2, secondary: 2.2, tertiary: 2.2, residential: 1.6, living_street: 1.6, unclassified: 1.6 };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const sw = STREET[s.cls];
    if (!sw || s.bridge) continue;
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz);
    if (len < 4) continue;
    const streetSeed = hashStr(s.name || `${Math.round((s.x1 + ox) / 300)},${Math.round((s.z1 + oz) / 300)}`);
    const sr = mulberry32(streetSeed);
    // One species & spacing per street (consistent rows), small chance of an unplanted street
    if (sr() < (s.cls === 'residential' ? 0.25 : 0.1)) continue;
    const spacing = 8 + sr() * 4;
    const sp = pickTree(sr(), mix, 0.3, 1.3);
    const baseScale = 0.82 + sr() * 0.22;
    const nx = -dz / len, nz = dx / len;
    const off = s.hw + sw * 0.55;
    const rng = mulberry32(streetSeed ^ (i * 2654435761));
    // Phase-align spacing along the street (world-projected distance) so consecutive segments share a rhythm
    const along0 = ((s.x1 + ox) * dx + (s.z1 + oz) * dz) / len;
    let d = (spacing - (((along0 % spacing) + spacing) % spacing)) % spacing;
    for (; d < len; d += spacing) {
      const t = d / len;
      const bx = s.x1 + dx * t, bz = s.z1 + dz * t;
      for (let side = -1; side <= 1; side += 2) {
        const x = bx + nx * off * side, z = bz + nz * off * side;
        if (nearJunction(x, z, 11)) continue;
        if (!groundOk(x, z, 0.5, 1.6, 2.5)) continue;
        const sc = baseScale * (0.92 + rng() * 0.16);
        if (!push(sp, x, z, sc, sc * (0.95 + rng() * 0.1), rng() * Math.PI * 2, rng)) break;
      }
    }
  }

  // --- 2. Area vegetation from landcover + park polygons (jittered grid sampling) ---
  // [treesPerM2, bushesPerM2, coniferBias, scaleMin, scaleMax]
  const AREA = {
    [LC_WOOD]: [1 / 85, 1 / 350, 1.8, 0.85, 1.35],
    [LC_GRASS]: [1 / 1100, 1 / 900, 1.0, 0.8, 1.2],
    [LC_SCRUB]: [1 / 1600, 1 / 70, 1.0, 0.6, 0.9],
    [LC_WETLAND]: [1 / 2500, 1 / 260, 1.0, 0.7, 1.0],
    [LC_RESIDENTIAL]: [1 / 750, 1 / 1100, 0.8, 0.75, 1.15],
    [LC_INSTITUTION]: [1 / 650, 1 / 900, 0.8, 0.8, 1.2],
    [LC_CEMETERY]: [1 / 300, 1 / 600, 2.0, 0.8, 1.2],
    [LC_COMMERCIAL]: [1 / 3500, 0, 0.5, 0.8, 1.1],
    [LC_INDUSTRIAL]: [1 / 4500, 0, 0.8, 0.8, 1.1],
    [LC_SAND]: [mix.palm > 0 ? 1 / 700 : 0, 0, 0, 0.9, 1.2],
    park: [1 / 320, 1 / 450, 1.0, 0.8, 1.3],
  };
  const areas = [];
  for (let p = 0; p < landPolys.length; p++) {
    const [kind, outer, holes] = landPolys[p];
    if (AREA[kind] || kind === LC_ORCHARD) areas.push({ key: kind, outer, holes, seed: p * 7919 + kind });
  }
  for (let p = 0; p < (data.parks || []).length; p++) {
    const [, , ptype, flat] = data.parks[p];
    if (ptype !== 'park' || !flat || flat.length < 6) continue;
    areas.push({ key: 'park', outer: flat, holes: [], seed: 100003 + p * 104729 });
  }

  for (const a of areas) {
    if (count >= MAX_CHUNK_INSTANCES) break;
    const bb = bboxOf(a.outer);
    const minX = Math.max(-500, bb[0]), minZ = Math.max(-500, bb[1]);
    const maxX = Math.min(499.9, bb[2]), maxZ = Math.min(499.9, bb[3]);
    if (maxX <= minX || maxZ <= minZ) continue;
    const rng = mulberry32((a.seed * 2654435761) ^ (cx * 73856093) ^ (cz * 19349663));
    const inside = (x, z) => {
      if (!pointInRing(x, z, a.outer)) return false;
      for (const h of a.holes) if (pointInRing(x, z, h)) return false;
      return true;
    };

    if (a.key === LC_ORCHARD) {
      // Orchards: small fruit trees on a regular 6m grid
      const step = 6;
      for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
        for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
          if (!inside(x, z) || !groundOk(x, z, 1.5, 2, 2)) continue;
          const sc = 0.45 + rng() * 0.12;
          if (!push(SP_BROADLEAF, x, z, sc, sc * 0.85, rng() * 6.283, rng)) break;
        }
      }
      continue;
    }

    const [tD, bD, conBias, sMin, sMax] = AREA[a.key];
    const layers = [];
    if (tD > 0) layers.push([Math.sqrt(1 / tD), false]);
    if (bD > 0) layers.push([Math.sqrt(1 / bD), true]);
    for (const [cell, isBush] of layers) {
      for (let gz = minZ; gz < maxZ; gz += cell) {
        for (let gx = minX; gx < maxX; gx += cell) {
          const x = gx + rng() * cell, z = gz + rng() * cell;
          if (x > maxX || z > maxZ || !inside(x, z)) continue;
          if (isBush) {
            if (!groundOk(x, z, 1.0, 1.2, 1.5)) continue;
            // Bushes come in small clumps
            const n = 1 + Math.floor(rng() * 3);
            for (let k = 0; k < n; k++) {
              const bx = x + (rng() - 0.5) * 3.2, bz = z + (rng() - 0.5) * 3.2;
              if (k > 0 && !groundOk(bx, bz, 1.0, 1.2, 1.5)) continue;
              const sc = 0.7 + rng() * 0.6;
              push(SP_BUSH, bx, bz, sc, sc * (0.8 + rng() * 0.4), rng() * 6.283, rng);
            }
          } else {
            if (!groundOk(x, z, 2.2, 2.5, 3)) continue;
            const sp = a.key === LC_SAND ? SP_PALM : pickTree(rng(), mix, conBias, 1);
            const sc = sMin + rng() * (sMax - sMin);
            push(sp, x, z, sc, sc * (0.9 + rng() * 0.25), rng() * 6.283, rng);
          }
          if (count >= MAX_CHUNK_INSTANCES) break;
        }
      }
    }
  }

  return { count, inst: inst.slice(0, count * INST_STRIDE), species: species.slice(0, count) };
}
