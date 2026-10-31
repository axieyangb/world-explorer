/**
 * Vegetation & rich landuse — worker side.
 *
 * 1. `extractLandcoverPolys()` runs inside `fetchGlobalChunkData` and turns OpenFreeMap `landuse`,
 *    `landcover`, `water` (`swimming_pool`), `poi` (`pitch`), and `transportation` (`pedestrian`, `steps`)
 *    into chunk-local rings/lines tagged with a compact landcover kind.
 * 2. `buildVegetationLayer()` runs inside the chunk build task. It adds the merged landcover/court/pool
 *    ground mesh and 3D sport/step/floral props mesh (material key `landcoverMat`) to the chunk's terrain
 *    group and returns a compact tree/bush instance table that `VegetationSystem` renders with InstancedMesh.
 */
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation, getBeijingDemState, snowCover } from '../environment.js';
import { floraContext, pickFlora, floraLook, floraBush, orchardEntry } from './flora_climate.js'; // [feature/climate-flora]
import { makeLandmarkSuppressor } from './landmarks/registry.js'; // [lm-west] keep trees out of hand-built landmarks
import {
  LC_RESIDENTIAL,
  LC_COMMERCIAL,
  LC_INDUSTRIAL,
  LC_INSTITUTION,
  LC_CEMETERY,
  LC_GRASS,
  LC_SCRUB,
  LC_WETLAND,
  LC_SAND,
  LC_ROCK,
  LC_WOOD,
  LC_ORCHARD,
  LC_PITCH,
  LC_TRACK,
  LC_PLAYGROUND,
  LC_SWIMMING_POOL,
  LC_FLOWERBED,
  LC_PLAZA,
  LC_STEPS,
  LC_DAM,
  LC_PARK_POI,
  LC_STYLE,
} from './vegetation_extract.js';

export const INST_STRIDE = 9;
// [feature/climate-flora] species ids live in flora_climate.js (re-exported for existing importers)
import {
  SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_BUSH, SP_COLUMN, SP_UMBRELLA, SP_EUCALYPT, SP_CACTUS, SP_BANANA,
  SP_DATEPALM, SP_BIRCH, SP_BAMBOO, SP_BARE, SP_AUTO, SPECIES_COUNT,
} from './flora_climate.js';
export {
  SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_BUSH, SP_COLUMN, SP_UMBRELLA, SP_EUCALYPT, SP_CACTUS, SP_BANANA,
  SP_DATEPALM, SP_BIRCH, SP_BAMBOO, SP_BARE, SP_AUTO, SPECIES_COUNT,
};

const MAX_CHUNK_INSTANCES = 12000;

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

// [tree-placement] integer hash -> [0,1) and smooth value noise in absolute metres (stable across chunk reloads)
function ihash(ix, iz, k) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, scale, k) {
  const fx = x / scale, fz = z / scale;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const a = ihash(ix, iz, k), b = ihash(ix + 1, iz, k), c = ihash(ix, iz + 1, k), d = ihash(ix + 1, iz + 1, k);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** [tree-placement] Species-mix coordinate for pickFlora at (x, z) metres: neighbourhood drift + grove coherence + rnd. */
export function floraMixU(x, z, rnd) {
  const u = vnoise(x, z, 700, 11) * 0.9 + vnoise(x, z, 260, 12) * 0.35 + vnoise(x, z, 45, 13) * 0.55 + rnd * 0.4;
  return u - Math.floor(u);
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

// ---------------------------------------------------------------------------------------------
// Geometry emission helpers for rich courts, swimming pools, flowerbeds, plazas & 3D steps
// ---------------------------------------------------------------------------------------------

function createBuf() {
  return { pos: [], nrm: [], col: [], uv: [] };
}

function pushTri(buf, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, rgb, pat, kind) {
  buf.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  buf.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  buf.col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
  buf.uv.push(pat, kind, pat, kind, pat, kind);
}

/** Pushes a horizontal quad `(x0,z0)..(x3,z3)` at height `y` (or per-corner `y`) with +Y normal. */
function pushUpQuad(buf, x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, rgb, pat, kind) {
  const cross = (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
  if (cross > 0) {
    pushTri(buf, x0, y0, z0, x2, y2, z2, x1, y1, z1, 0, 1, 0, rgb, pat, kind);
    pushTri(buf, x0, y0, z0, x3, y3, z3, x2, y2, z2, 0, 1, 0, rgb, pat, kind);
  } else {
    pushTri(buf, x0, y0, z0, x1, y1, z1, x2, y2, z2, 0, 1, 0, rgb, pat, kind);
    pushTri(buf, x0, y0, z0, x2, y2, z2, x3, y3, z3, 0, 1, 0, rgb, pat, kind);
  }
}

/** Pushes an oriented rectangle in `(u, v)` frame around `(cx, cz)` at flat height `y`. */
function pushObbRect(buf, obb, u0, v0, u1, v1, y, rgb, pat, kind) {
  const { cx, cz, ux, uz, vx, vz } = obb;
  const x0 = cx + u0 * ux + v0 * vx, z0 = cz + u0 * uz + v0 * vz;
  const x1 = cx + u1 * ux + v0 * vx, z1 = cz + u1 * uz + v0 * vz;
  const x2 = cx + u1 * ux + v1 * vx, z2 = cz + u1 * uz + v1 * vz;
  const x3 = cx + u0 * ux + v1 * vx, z3 = cz + u0 * uz + v1 * vz;
  pushUpQuad(buf, x0, y, z0, x1, y, z1, x2, y, z2, x3, y, z3, rgb, pat, kind);
}

/** Pushes a crisp line segment in `(u, v)` court coordinates with width `w` at height `y`. */
function pushObbLine(buf, obb, u0, v0, u1, v1, w, y, rgb, pat, kind) {
  const du = u1 - u0, dv = v1 - v0;
  const len = Math.hypot(du, dv);
  if (len < 1e-3) return;
  const nu = (-dv / len) * (w * 0.5);
  const nv = (du / len) * (w * 0.5);
  const { cx, cz, ux, uz, vx, vz } = obb;
  const toXZ = (u, v) => [cx + u * ux + v * vx, cz + u * uz + v * vz];
  const [x0, z0] = toXZ(u0 - nu, v0 - nv);
  const [x1, z1] = toXZ(u1 - nu, v1 - nv);
  const [x2, z2] = toXZ(u1 + nu, v1 + nv);
  const [x3, z3] = toXZ(u0 + nu, v0 + nv);
  pushUpQuad(buf, x0, y, z0, x1, y, z1, x2, y, z2, x3, y, z3, rgb, pat, kind);
}

/** Pushes a hollow rectangle outline in `(u, v)` coordinates. */
function pushObbHollowRect(buf, obb, u0, v0, u1, v1, w, y, rgb, pat, kind) {
  pushObbLine(buf, obb, u0, v0, u1, v0, w, y, rgb, pat, kind);
  pushObbLine(buf, obb, u1, v0, u1, v1, w, y, rgb, pat, kind);
  pushObbLine(buf, obb, u1, v1, u0, v1, w, y, rgb, pat, kind);
  pushObbLine(buf, obb, u0, v1, u0, v0, w, y, rgb, pat, kind);
}

/** Pushes a circular/arc outline in `(u, v)` coordinates. */
function pushObbArc(buf, obb, uc, vc, r, a0, a1, segs, w, y, rgb, pat, kind) {
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
    pushObbLine(
      buf,
      obb,
      uc + Math.cos(t0) * r,
      vc + Math.sin(t0) * r,
      uc + Math.cos(t1) * r,
      vc + Math.sin(t1) * r,
      w,
      y,
      rgb,
      pat,
      kind
    );
  }
}

/** Pushes a filled disk/sector in `(u, v)` coordinates. */
function pushObbDisk(buf, obb, uc, vc, r, a0, a1, segs, y, rgb, pat, kind) {
  const { cx, cz, ux, uz, vx, vz } = obb;
  const xC = cx + uc * ux + vc * vx;
  const zC = cz + uc * uz + vc * vz;
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segs;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
    const u0 = uc + Math.cos(t0) * r, v0 = vc + Math.sin(t0) * r;
    const u1 = uc + Math.cos(t1) * r, v1 = vc + Math.sin(t1) * r;
    const x0 = cx + u0 * ux + v0 * vx, z0 = cz + u0 * uz + v0 * vz;
    const x1 = cx + u1 * ux + v1 * vx, z1 = cz + u1 * uz + v1 * vz;
    const cross = (x0 - xC) * (z1 - zC) - (z0 - zC) * (x1 - xC);
    if (cross > 0) pushTri(buf, xC, y, zC, x1, y, z1, x0, y, z0, 0, 1, 0, rgb, pat, kind);
    else pushTri(buf, xC, y, zC, x0, y, z0, x1, y, z1, 0, 1, 0, rgb, pat, kind);
  }
}

/** Pushes a 3D oriented box (5 faces: top + 4 sides) in `(u, v)` coordinates. */
function pushObbBox3D(buf, obb, u0, v0, u1, v1, y0, y1, rgb, pat, kind) {
  const { cx, cz, ux, uz, vx, vz } = obb;
  const x00 = cx + u0 * ux + v0 * vx, z00 = cz + u0 * uz + v0 * vz;
  const x10 = cx + u1 * ux + v0 * vx, z10 = cz + u1 * uz + v0 * vz;
  const x11 = cx + u1 * ux + v1 * vx, z11 = cz + u1 * uz + v1 * vz;
  const x01 = cx + u0 * ux + v1 * vx, z01 = cz + u0 * uz + v1 * vz;

  // Top face
  pushUpQuad(buf, x00, y1, z00, x10, y1, z10, x11, y1, z11, x01, y1, z01, rgb, pat, kind);

  // 4 vertical side walls
  const sideCol = [rgb[0] * 0.88, rgb[1] * 0.88, rgb[2] * 0.88];
  const pushWall = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    pushTri(buf, ax, y0, az, bx, y0, bz, bx, y1, bz, nx, 0, nz, sideCol, pat, kind);
    pushTri(buf, ax, y0, az, bx, y1, bz, ax, y1, az, nx, 0, nz, sideCol, pat, kind);
  };
  pushWall(x00, z00, x10, z10);
  pushWall(x10, z10, x11, z11);
  pushWall(x11, z11, x01, z01);
  pushWall(x01, z01, x00, z00);
}

/** Computes the Oriented Bounding Box (OBB) of a flat `[x0, z0, ...]` polygon ring. */
function computePolyOBB(outer) {
  let bestLen2 = -1;
  let ux = 1, uz = 0;
  const n = outer.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const dx = outer[j] - outer[i];
    const dz = outer[j + 1] - outer[i + 1];
    const l2 = dx * dx + dz * dz;
    if (l2 > bestLen2) {
      bestLen2 = l2;
      const len = Math.sqrt(l2) || 1;
      ux = dx / len;
      uz = dz / len;
    }
  }
  const vx = -uz, vz = ux;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < n; i += 2) {
    const x = outer[i], z = outer[i + 1];
    const u = x * ux + z * uz;
    const v = x * vx + z * vz;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;
  const cx = midU * ux + midV * vx;
  const cz = midU * uz + midV * vz;
  if (spanV > spanU) {
    return { cx, cz, ux: vx, uz: vz, vx: -ux, vz: -uz, hl: spanV * 0.5, hw: spanU * 0.5 };
  }
  return { cx, cz, ux, uz, vx, vz, hl: spanU * 0.5, hw: spanV * 0.5 };
}

/** Samples the max terrain elevation under an OBB so the court/pool surface stays flat and never clips terrain. */
function sampleFlatCourtElev(obb, ox, oz, yOff) {
  const { cx, cz, ux, uz, vx, vz, hl, hw } = obb;
  let maxG = getBeijingTerrainElevation(ox + cx, oz + cz);
  let minG = maxG;
  const pts = [
    [-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw],
    [0, -hw], [0, hw], [-hl, 0], [hl, 0],
  ];
  for (let i = 0; i < pts.length; i++) {
    const [u, v] = pts[i];
    const x = cx + u * ux + v * vx;
    const z = cz + u * uz + v * vz;
    const g = getBeijingTerrainElevation(ox + x, oz + z);
    if (g > maxG) maxG = g;
    if (g < minG) minG = g;
  }
  return { topY: maxG + yOff, botY: minG - 0.38 };
}

/** Emits a basketball court with painted keys, 3-pt arcs, and 3D hoop stanchions at both ends. */
function buildBasketballCourt(surfBuf, propsBuf, obb, topY, botY) {
  const hl = Math.max(5.5, Math.min(16.0, obb.hl * 0.86));
  const hw = Math.max(3.5, Math.min(9.0, obb.hw * 0.84));
  const pat = 5, kind = LC_PITCH;

  // Inner terracotta court surface
  const courtRgb = [0.78, 0.36, 0.22];
  const keyRgb = [0.16, 0.38, 0.70];
  const white = [0.97, 0.97, 0.96];
  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, courtRgb, pat, kind);

  // Painted free-throw keys & center circle
  const keyLen = Math.min(5.8, hl * 0.42);
  const keyHW = Math.min(2.45, hw * 0.34);
  pushObbRect(surfBuf, obb, -hl, -keyHW, -hl + keyLen, keyHW, topY + 0.015, keyRgb, pat, kind);
  pushObbRect(surfBuf, obb, hl - keyLen, -keyHW, hl, keyHW, topY + 0.015, keyRgb, pat, kind);
  const ccR = Math.min(1.85, hw * 0.24);
  pushObbDisk(surfBuf, obb, 0, 0, ccR, 0, Math.PI * 2, 16, topY + 0.015, keyRgb, pat, kind);

  // White court markings
  const lw = 0.14;
  const lineY = topY + 0.024;
  pushObbHollowRect(surfBuf, obb, -hl, -hw, hl, hw, lw, lineY, white, pat, kind);
  pushObbLine(surfBuf, obb, 0, -hw, 0, hw, lw, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, 0, 0, ccR, 0, Math.PI * 2, 16, lw, lineY, white, pat, kind);

  // Keys + free-throw semicircles + 3-point arcs at both ends
  pushObbHollowRect(surfBuf, obb, -hl, -keyHW, -hl + keyLen, keyHW, lw, lineY, white, pat, kind);
  pushObbHollowRect(surfBuf, obb, hl - keyLen, -keyHW, hl, keyHW, lw, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, -hl + keyLen, 0, keyHW * 0.75, -Math.PI * 0.5, Math.PI * 0.5, 10, lw, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, hl - keyLen, 0, keyHW * 0.75, Math.PI * 0.5, Math.PI * 1.5, 10, lw, lineY, white, pat, kind);

  const arcR = Math.min(6.6, hw * 0.82, hl * 0.48);
  pushObbArc(surfBuf, obb, -hl + 1.2, 0, arcR, -Math.PI * 0.44, Math.PI * 0.44, 14, lw, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, hl - 1.2, 0, arcR, Math.PI * 0.56, Math.PI * 1.44, 14, lw, lineY, white, pat, kind);

  // 3D Basketball Hoop Stanchions at both ends (u = -hl and u = +hl)
  const postCol = [0.20, 0.22, 0.25];
  const boardCol = [0.95, 0.96, 0.98];
  const rimCol = [0.92, 0.34, 0.10];
  for (const sgn of [-1, 1]) {
    const uPost = sgn * (hl + 0.55);
    const uBoard = sgn * (hl - 0.35);
    const uRim = sgn * (hl - 0.72);
    // Vertical steel post
    pushObbBox3D(propsBuf, obb, uPost - 0.14, -0.14, uPost + 0.14, 0.14, topY, topY + 3.25, postCol, pat, kind);
    // Horizontal cantilever arm
    const uArm0 = Math.min(uPost, uBoard), uArm1 = Math.max(uPost, uBoard);
    pushObbBox3D(propsBuf, obb, uArm0, -0.10, uArm1, 0.10, topY + 3.05, topY + 3.25, postCol, pat, kind);
    // Tempered glass backboard (1.8m wide x 1.08m tall)
    pushObbBox3D(propsBuf, obb, uBoard - 0.05, -0.92, uBoard + 0.05, 0.92, topY + 2.85, topY + 3.93, boardCol, pat, kind);
    // Red shooter's square on front of backboard
    const uSq = uBoard - sgn * 0.06;
    pushObbBox3D(propsBuf, obb, uSq - 0.01, -0.30, uSq + 0.01, 0.30, topY + 3.02, topY + 3.48, rimCol, pat, kind);
    // Orange steel rim & white net box
    pushObbBox3D(propsBuf, obb, uRim - 0.24, -0.24, uRim + 0.24, 0.24, topY + 2.98, topY + 3.06, rimCol, pat, kind);
    pushObbBox3D(propsBuf, obb, uRim - 0.18, -0.18, uRim + 0.18, 0.18, topY + 2.58, topY + 2.98, white, pat, kind);
  }
}

/** Emits a tennis / badminton / volleyball / pickleball court with white service lines and a 3D center net. */
function buildNetCourt(surfBuf, propsBuf, obb, topY, sport) {
  const hl = Math.max(4.5, Math.min(13.5, obb.hl * 0.80));
  const hw = Math.max(2.6, Math.min(6.5, obb.hw * 0.76));
  const pat = 5, kind = LC_PITCH;

  const isVolley = sport === 'volleyball';
  const courtRgb = isVolley
    ? [0.84, 0.68, 0.42]
    : sport === 'badminton'
      ? [0.16, 0.52, 0.36]
      : [0.17, 0.44, 0.74];
  const white = [0.97, 0.97, 0.96];
  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, courtRgb, pat, kind);

  const lw = 0.12;
  const lineY = topY + 0.022;
  // Outer doubles boundary
  pushObbHollowRect(surfBuf, obb, -hl, -hw, hl, hw, lw, lineY, white, pat, kind);

  if (!isVolley) {
    // Singles sidelines & service lines
    const hwSingles = hw * 0.75;
    const uServ = hl * 0.54;
    pushObbLine(surfBuf, obb, -hl, -hwSingles, hl, -hwSingles, lw, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, -hl, hwSingles, hl, hwSingles, lw, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, -uServ, -hwSingles, -uServ, hwSingles, lw, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, uServ, -hwSingles, uServ, hwSingles, lw, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, -uServ, 0, uServ, 0, lw, lineY, white, pat, kind);
  } else {
    // Volleyball attack lines
    const uAtk = hl * 0.34;
    pushObbLine(surfBuf, obb, -uAtk, -hw, -uAtk, hw, lw, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, uAtk, -hw, uAtk, hw, lw, lineY, white, pat, kind);
  }

  // 3D Center Net & Net Posts
  const netH = isVolley ? 2.25 : 1.07;
  const postCol = [0.18, 0.22, 0.20];
  const meshCol = [0.22, 0.25, 0.24];
  const vPost = hw + 0.35;
  pushObbBox3D(propsBuf, obb, -0.09, -vPost - 0.09, 0.09, -vPost + 0.09, topY, topY + netH + 0.08, postCol, pat, kind);
  pushObbBox3D(propsBuf, obb, -0.09, vPost - 0.09, 0.09, vPost + 0.09, topY, topY + netH + 0.08, postCol, pat, kind);
  // Net body & white top canvas tape
  pushObbBox3D(propsBuf, obb, -0.04, -vPost, 0.04, vPost, topY + (isVolley ? 1.15 : 0.06), topY + netH - 0.08, meshCol, pat, kind);
  pushObbBox3D(propsBuf, obb, -0.05, -vPost, 0.05, vPost, topY + netH - 0.08, topY + netH + 0.02, white, pat, kind);
}

/** Emits a striped green soccer field with white penalty boxes, center circle, and 3D goalposts. */
function buildSoccerPitch(surfBuf, propsBuf, obb, topY) {
  const hl = Math.max(12.0, Math.min(56.0, obb.hl * 0.90));
  const hw = Math.max(8.0, Math.min(36.0, obb.hw * 0.88));
  const pat = 5, kind = LC_PITCH;

  // Alternating mowed emerald grass stripes along the pitch length
  const nStripes = 10;
  const stripeDark = [0.17, 0.49, 0.22];
  const stripeLight = [0.23, 0.58, 0.26];
  for (let i = 0; i < nStripes; i++) {
    const u0 = -hl + (2 * hl * i) / nStripes;
    const u1 = -hl + (2 * hl * (i + 1)) / nStripes;
    pushObbRect(surfBuf, obb, u0, -hw, u1, hw, topY + 0.008, (i & 1) ? stripeLight : stripeDark, pat, kind);
  }

  // White pitch markings
  const white = [0.97, 0.97, 0.96];
  const lw = Math.max(0.16, Math.min(0.26, hl * 0.006));
  const lineY = topY + 0.022;
  pushObbHollowRect(surfBuf, obb, -hl, -hw, hl, hw, lw, lineY, white, pat, kind);
  pushObbLine(surfBuf, obb, 0, -hw, 0, hw, lw, lineY, white, pat, kind);

  const ccR = Math.min(9.15, hw * 0.28, hl * 0.22);
  pushObbArc(surfBuf, obb, 0, 0, ccR, 0, Math.PI * 2, 20, lw, lineY, white, pat, kind);
  pushObbDisk(surfBuf, obb, 0, 0, lw * 1.8, 0, Math.PI * 2, 8, lineY, white, pat, kind);

  // 18-yard penalty boxes & 6-yard goal boxes at both ends
  const penD = Math.min(16.5, hl * 0.32);
  const penHW = Math.min(20.15, hw * 0.58);
  const goalD = Math.min(5.5, hl * 0.12);
  const goalHW = Math.min(9.15, hw * 0.28);

  pushObbHollowRect(surfBuf, obb, -hl, -penHW, -hl + penD, penHW, lw, lineY, white, pat, kind);
  pushObbHollowRect(surfBuf, obb, hl - penD, -penHW, hl, penHW, lw, lineY, white, pat, kind);
  pushObbHollowRect(surfBuf, obb, -hl, -goalHW, -hl + goalD, goalHW, lw, lineY, white, pat, kind);
  pushObbHollowRect(surfBuf, obb, hl - goalD, -goalHW, hl, goalHW, lw, lineY, white, pat, kind);

  // Penalty arcs
  pushObbArc(surfBuf, obb, -hl + penD, 0, ccR * 0.65, -Math.PI * 0.36, Math.PI * 0.36, 10, lw, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, hl - penD, 0, ccR * 0.65, Math.PI * 0.64, Math.PI * 1.36, 10, lw, lineY, white, pat, kind);

  // 3D White Goalposts at both ends
  const gHW = Math.min(3.66, hw * 0.16);
  const gH = 2.44;
  const gDepth = Math.min(1.8, hl * 0.06);
  const netFrameCol = [0.85, 0.87, 0.89];
  for (const sgn of [-1, 1]) {
    const uGoal = sgn * hl;
    const uBack = sgn * (hl + gDepth);
    // Left & right goalposts
    pushObbBox3D(propsBuf, obb, uGoal - 0.11, -gHW - 0.11, uGoal + 0.11, -gHW + 0.11, topY, topY + gH, white, pat, kind);
    pushObbBox3D(propsBuf, obb, uGoal - 0.11, gHW - 0.11, uGoal + 0.11, gHW + 0.11, topY, topY + gH, white, pat, kind);
    // Crossbar
    pushObbBox3D(propsBuf, obb, uGoal - 0.11, -gHW - 0.11, uGoal + 0.11, gHW + 0.11, topY + gH - 0.14, topY + gH + 0.04, white, pat, kind);
    // Rear ground bar & top net support bars
    const uMin = Math.min(uGoal, uBack), uMax = Math.max(uGoal, uBack);
    pushObbBox3D(propsBuf, obb, uBack - 0.07, -gHW, uBack + 0.07, gHW, topY, topY + 0.14, netFrameCol, pat, kind);
    pushObbBox3D(propsBuf, obb, uMin, -gHW - 0.06, uMax, -gHW + 0.06, topY + gH - 0.12, topY + gH, netFrameCol, pat, kind);
    pushObbBox3D(propsBuf, obb, uMin, gHW - 0.06, uMax, gHW + 0.06, topY + gH - 0.12, topY + gH, netFrameCol, pat, kind);
  }
}

/** Emits a tan clay baseball infield diamond, pitcher's mound, white foul lines, and 3D backstop. */
function buildBaseballDiamond(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const r = Math.max(8.0, Math.min(28.0, Math.min(obb.hl, obb.hw) * 0.85));
  const clayCol = [0.76, 0.53, 0.34];
  const turfCol = [0.22, 0.55, 0.25];
  const white = [0.97, 0.97, 0.96];

  // Home plate positioned at (-r * 0.55, 0), pointing toward +u
  const uHome = -r * 0.52;
  const dirtR = r * 0.95;
  pushObbDisk(surfBuf, obb, uHome, 0, dirtR, -Math.PI * 0.26, Math.PI * 0.26, 16, topY + 0.008, clayCol, pat, kind);
  pushObbDisk(surfBuf, obb, uHome, 0, r * 0.14, 0, Math.PI * 2, 12, topY + 0.012, clayCol, pat, kind);

  // Inner grass diamond
  const baseDist = r * 0.52;
  const dCenterU = uHome + baseDist * Math.SQRT1_2;
  const grassR = baseDist * 0.44;
  pushObbDisk(surfBuf, obb, dCenterU, 0, grassR, 0, Math.PI * 2, 4, topY + 0.014, turfCol, pat, kind);
  // Pitcher's mound
  pushObbDisk(surfBuf, obb, dCenterU, 0, r * 0.08, 0, Math.PI * 2, 10, topY + 0.018, clayCol, pat, kind);

  // White foul lines & bases
  const foulLen = r * 1.18;
  const a45 = Math.PI * 0.25;
  pushObbLine(surfBuf, obb, uHome, 0, uHome + Math.cos(a45) * foulLen, Math.sin(a45) * foulLen, 0.16, topY + 0.022, white, pat, kind);
  pushObbLine(surfBuf, obb, uHome, 0, uHome + Math.cos(-a45) * foulLen, Math.sin(-a45) * foulLen, 0.16, topY + 0.022, white, pat, kind);

  // 3D Backstop fence behind home plate
  const backCol = [0.26, 0.30, 0.32];
  const uBack = uHome - r * 0.14;
  pushObbBox3D(propsBuf, obb, uBack - 0.08, -2.8, uBack + 0.08, 2.8, topY, topY + 3.6, backCol, pat, kind);
}

/** Emits a playground with colorful EPDM zones and a 3D climbing/slide pavilion. */
function buildPlaygroundDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PLAYGROUND;
  const r = Math.max(3.0, Math.min(10.0, Math.min(obb.hl, obb.hw) * 0.65));
  pushObbDisk(surfBuf, obb, -r * 0.35, 0, r * 0.55, 0, Math.PI * 2, 14, topY + 0.010, [0.90, 0.54, 0.20], pat, kind);
  pushObbDisk(surfBuf, obb, r * 0.35, 0, r * 0.48, 0, Math.PI * 2, 14, topY + 0.012, [0.24, 0.64, 0.44], pat, kind);

  // 3D play tower + yellow canopy roof + red slide
  pushObbBox3D(propsBuf, obb, -1.2, -1.2, 1.2, 1.2, topY, topY + 1.6, [0.22, 0.50, 0.78], pat, kind);
  pushObbBox3D(propsBuf, obb, -1.5, -1.5, 1.5, 1.5, topY + 2.5, topY + 3.1, [0.96, 0.78, 0.16], pat, kind);
  // 4 corner posts
  for (const su of [-1.05, 1.05]) {
    for (const sv of [-1.05, 1.05]) {
      pushObbBox3D(propsBuf, obb, su - 0.1, sv - 0.1, su + 0.1, sv + 0.1, topY + 1.6, topY + 2.5, [0.88, 0.24, 0.20], pat, kind);
    }
  }
  // Slide ramp
  pushObbBox3D(propsBuf, obb, 1.2, -0.45, 3.1, 0.45, topY, topY + 0.95, [0.90, 0.22, 0.20], pat, kind);
}

/** Pushes an arbitrary 3D quad in `(u, y, v)` OBB coordinates with computed face normal. */
function pushObbQuad3D(buf, obb, u0, y0, v0, u1, y1, v1, u2, y2, v2, u3, y3, v3, rgb, pat, kind) {
  const { cx, cz, ux, uz, vx, vz } = obb;
  const x0 = cx + u0 * ux + v0 * vx, z0 = cz + u0 * uz + v0 * vz;
  const x1 = cx + u1 * ux + v1 * vx, z1 = cz + u1 * uz + v1 * vz;
  const x2 = cx + u2 * ux + v2 * vx, z2 = cz + u2 * uz + v2 * vz;
  const x3 = cx + u3 * ux + v3 * vx, z3 = cz + u3 * uz + v3 * vz;
  const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
  const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  if (ny < 0) {
    nx = -nx; ny = -ny; nz = -nz;
    pushTri(buf, x0, y0, z0, x2, y2, z2, x1, y1, z1, nx, ny, nz, rgb, pat, kind);
    pushTri(buf, x0, y0, z0, x3, y3, z3, x2, y2, z2, nx, ny, nz, rgb, pat, kind);
  } else {
    pushTri(buf, x0, y0, z0, x1, y1, z1, x2, y2, z2, nx, ny, nz, rgb, pat, kind);
    pushTri(buf, x0, y0, z0, x2, y2, z2, x3, y3, z3, nx, ny, nz, rgb, pat, kind);
  }
}

/** Pushes a 3D sloped wedge/ramp in `(u, v)` from `yLow` to `yHigh` (`dir`: '+u', '-u', '+v', '-v'). */
function pushObbRamp3D(buf, obb, u0, v0, u1, v1, yLow, yHigh, dir, rgb, pat, kind) {
  const y00 = dir === '-u' || dir === '-v' ? yHigh : yLow;
  const y10 = dir === '+u' || dir === '-v' ? yHigh : yLow;
  const y11 = dir === '+u' || dir === '+v' ? yHigh : yLow;
  const y01 = dir === '-u' || dir === '+v' ? yHigh : yLow;
  pushObbQuad3D(buf, obb, u0, y00, v0, u1, y10, v0, u1, y11, v1, u0, y01, v1, rgb, pat, kind);
  const sideCol = [rgb[0] * 0.86, rgb[1] * 0.86, rgb[2] * 0.86];
  pushObbQuad3D(buf, obb, u0, yLow, v0, u1, yLow, v0, u1, y10, v0, u0, y00, v0, sideCol, pat, kind);
  pushObbQuad3D(buf, obb, u1, yLow, v0, u1, yLow, v1, u1, y11, v1, u1, y10, v0, sideCol, pat, kind);
  pushObbQuad3D(buf, obb, u1, yLow, v1, u0, yLow, v1, u0, y01, v1, u1, y11, v1, sideCol, pat, kind);
  pushObbQuad3D(buf, obb, u0, yLow, v1, u0, yLow, v0, u0, y00, v0, u0, y01, v1, sideCol, pat, kind);
}

/** Pushes a 3D hipped/pyramid/A-frame roof over `(u0, v0)..(u1, v1)` from `yBase` to `yPeak`. */
function pushObbHippedRoof3D(buf, obb, u0, v0, u1, v1, yBase, yPeak, ridgeFrac, rgb, pat, kind) {
  const uc = (u0 + u1) * 0.5, vc = (v0 + v1) * 0.5;
  const rHalf = (u1 - u0) * 0.5 * Math.max(0, Math.min(1, ridgeFrac));
  const ru0 = uc - rHalf, ru1 = uc + rHalf;
  const shadeA = [Math.min(1, rgb[0] * 1.04), Math.min(1, rgb[1] * 1.04), Math.min(1, rgb[2] * 1.04)];
  const shadeB = [rgb[0] * 0.88, rgb[1] * 0.88, rgb[2] * 0.88];
  pushObbQuad3D(buf, obb, u0, yBase, v0, u1, yBase, v0, ru1, yPeak, vc, ru0, yPeak, vc, shadeA, pat, kind);
  pushObbQuad3D(buf, obb, u1, yBase, v1, u0, yBase, v1, ru0, yPeak, vc, ru1, yPeak, vc, shadeA, pat, kind);
  pushObbQuad3D(buf, obb, u1, yBase, v0, u1, yBase, v1, ru1, yPeak, vc, ru1, yPeak, vc, shadeB, pat, kind);
  pushObbQuad3D(buf, obb, u0, yBase, v1, u0, yBase, v0, ru0, yPeak, vc, ru0, yPeak, vc, shadeB, pat, kind);
}

/** Emits a skatepark (`skateboard`) with concrete half-pipe/quarter-pipe transition ramps, central pyramid funbox, steel grind rails, and coping bars. */
export function buildSkateparkDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(5.5, Math.min(16.0, obb.hl * 0.88));
  const hw = Math.max(3.5, Math.min(10.0, obb.hw * 0.86));
  const deckCol = [0.68, 0.67, 0.64];
  const rampCol = [0.60, 0.59, 0.56];
  const bowlCol = [0.54, 0.53, 0.50];
  const steelCol = [0.78, 0.80, 0.84];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, deckCol, pat, kind);
  pushObbDisk(surfBuf, obb, -hl * 0.35, hw * 0.32, Math.min(2.6, hw * 0.38), 0, Math.PI * 2, 14, topY + 0.015, bowlCol, pat, kind);

  // Quarter-pipe transition ramps + back decks + steel coping bars at both ends
  const qDepth = Math.min(2.6, hl * 0.24);
  const qH = 1.55;
  const qHW = hw * 0.82;
  pushObbBox3D(propsBuf, obb, -hl, -qHW, -hl + qDepth * 0.42, qHW, topY, topY + qH, rampCol, pat, kind);
  pushObbRamp3D(propsBuf, obb, -hl + qDepth * 0.42, -qHW, -hl + qDepth, qHW, topY, topY + qH, '-u', rampCol, pat, kind);
  pushObbBox3D(propsBuf, obb, -hl + qDepth * 0.38, -qHW, -hl + qDepth * 0.48, qHW, topY + qH - 0.05, topY + qH + 0.09, steelCol, pat, kind);

  pushObbBox3D(propsBuf, obb, hl - qDepth * 0.42, -qHW, hl, qHW, topY, topY + qH, rampCol, pat, kind);
  pushObbRamp3D(propsBuf, obb, hl - qDepth, -qHW, hl - qDepth * 0.42, qHW, topY, topY + qH, '+u', rampCol, pat, kind);
  pushObbBox3D(propsBuf, obb, hl - qDepth * 0.48, -qHW, hl - qDepth * 0.38, qHW, topY + qH - 0.05, topY + qH + 0.09, steelCol, pat, kind);

  // Central pyramid funbox + steel grind rail
  const fbU = Math.min(2.8, hl * 0.28);
  const fbV = Math.min(1.8, hw * 0.34);
  const fbH = 0.82;
  pushObbBox3D(propsBuf, obb, -fbU * 0.45, -fbV, fbU * 0.45, fbV, topY, topY + fbH, rampCol, pat, kind);
  pushObbRamp3D(propsBuf, obb, -fbU, -fbV, -fbU * 0.45, fbV, topY, topY + fbH, '+u', rampCol, pat, kind);
  pushObbRamp3D(propsBuf, obb, fbU * 0.45, -fbV, fbU, fbV, topY, topY + fbH, '-u', rampCol, pat, kind);

  // Steel grind rail over the funbox
  const railH = topY + fbH + 0.42;
  pushObbBox3D(propsBuf, obb, -fbU * 0.85, -0.06, fbU * 0.85, 0.06, railH - 0.07, railH, steelCol, pat, kind);
  for (const ru of [-fbU * 0.7, 0, fbU * 0.7]) {
    pushObbBox3D(propsBuf, obb, ru - 0.05, -0.05, ru + 0.05, 0.05, topY, railH - 0.07, steelCol, pat, kind);
  }
  // Street grind ledge along -v side
  const ledgeV = -hw * 0.55;
  pushObbBox3D(propsBuf, obb, -fbU * 0.8, ledgeV - 0.35, fbU * 0.8, ledgeV + 0.35, topY, topY + 0.45, rampCol, pat, kind);
  pushObbBox3D(propsBuf, obb, -fbU * 0.8, ledgeV + 0.26, fbU * 0.8, ledgeV + 0.36, topY + 0.42, topY + 0.48, steelCol, pat, kind);
}

/** Emits 3D outdoor blue-top ping-pong tables (`2.74m x 1.52m`, `y = 0.76m`) on dark steel legs with white net & lines. */
export function buildTableTennisDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const padHL = Math.max(2.4, Math.min(8.5, obb.hl * 0.86));
  const padHW = Math.max(1.8, Math.min(5.5, obb.hw * 0.84));
  pushObbRect(surfBuf, obb, -padHL, -padHW, padHL, padHW, topY + 0.008, [0.22, 0.48, 0.38], pat, kind);

  const tableBlue = [0.14, 0.38, 0.74];
  const legCol = [0.18, 0.20, 0.23];
  const white = [0.97, 0.97, 0.96];
  const netCol = [0.88, 0.90, 0.92];
  const offsets = obb.hl >= 5.2 ? [-2.2, 2.2] : [0];

  for (const uOff of offsets) {
    const thl = 1.37, thw = 0.76, ty = topY + 0.76;
    // 4 dark steel legs
    for (const lu of [-0.95, 0.95]) {
      for (const lv of [-0.52, 0.52]) {
        pushObbBox3D(propsBuf, obb, uOff + lu - 0.05, lv - 0.05, uOff + lu + 0.05, lv + 0.05, topY, ty - 0.05, legCol, pat, kind);
      }
    }
    // Blue tabletop (2.74m x 1.52m)
    pushObbBox3D(propsBuf, obb, uOff - thl, -thw, uOff + thl, thw, ty - 0.06, ty, tableBlue, pat, kind);
    // White edge lines & center line
    pushObbHollowRect(propsBuf, obb, uOff - thl + 0.04, -thw + 0.04, uOff + thl - 0.04, thw - 0.04, 0.04, ty + 0.006, white, pat, kind);
    pushObbLine(propsBuf, obb, uOff - thl + 0.04, 0, uOff + thl - 0.04, 0, 0.03, ty + 0.006, white, pat, kind);
    // 3D Center net + white top tape
    pushObbBox3D(propsBuf, obb, uOff - 0.025, -thw - 0.08, uOff + 0.025, thw + 0.08, ty, ty + 0.155, netCol, pat, kind);
    pushObbBox3D(propsBuf, obb, uOff - 0.03, -thw - 0.08, uOff + 0.03, thw + 0.08, ty + 0.135, ty + 0.165, white, pat, kind);
  }
}

/** Emits a terracotta-red athletics running track with white concentric lanes, starting blocks, hurdles, and high-jump mat. */
export function buildAthleticsTrackDetails(surfBuf, propsBuf, obb, topY, holes) {
  const pat = 5, kind = LC_TRACK;
  const hl = Math.max(10.0, Math.min(95.0, obb.hl * 0.92));
  const hw = Math.max(6.0, Math.min(55.0, obb.hw * 0.90));
  const tartanRed = [0.76, 0.25, 0.19];
  const white = [0.96, 0.96, 0.95];
  const matBlue = [0.16, 0.44, 0.78];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.006, tartanRed, pat, kind);
  for (const frac of [0.95, 0.89, 0.83, 0.77, 0.71]) {
    pushObbHollowRect(surfBuf, obb, -hl * frac, -hw * frac, hl * frac, hw * frac, 0.12, topY + 0.016, white, pat, kind);
  }
  if (!holes || holes.length === 0) {
    pushObbRect(surfBuf, obb, -hl * 0.66, -hw * 0.64, hl * 0.66, hw * 0.64, topY + 0.012, [0.20, 0.52, 0.24], pat, kind);
  }

  // White starting blocks at the straightaway (-hl * 0.55)
  const uStart = -hl * 0.52;
  for (let l = 0; l < 4; l++) {
    const vLane = -hw * (0.73 + l * 0.06);
    pushObbBox3D(propsBuf, obb, uStart - 0.32, vLane - 0.16, uStart + 0.32, vLane + 0.16, topY, topY + 0.22, white, pat, kind);
  }

  // Track hurdles along the +v straightaway
  for (const uH of [-hl * 0.25, 0, hl * 0.25]) {
    const vH0 = hw * 0.72, vH1 = hw * 0.92;
    pushObbBox3D(propsBuf, obb, uH - 0.05, vH0, uH + 0.05, vH0 + 0.08, topY, topY + 0.92, [0.22, 0.24, 0.28], pat, kind);
    pushObbBox3D(propsBuf, obb, uH - 0.05, vH1 - 0.08, uH + 0.05, vH1, topY, topY + 0.92, [0.22, 0.24, 0.28], pat, kind);
    pushObbBox3D(propsBuf, obb, uH - 0.06, vH0, uH + 0.06, vH1, topY + 0.82, topY + 0.96, white, pat, kind);
  }

  // High-jump landing mat + upright standards in the infield
  const hjU = hl * 0.38;
  pushObbBox3D(propsBuf, obb, hjU - 1.8, -1.2, hjU + 1.8, 1.2, topY, topY + 0.68, matBlue, pat, kind);
  pushObbBox3D(propsBuf, obb, hjU - 1.95, -1.35, hjU - 1.80, -1.20, topY, topY + 2.15, white, pat, kind);
  pushObbBox3D(propsBuf, obb, hjU - 1.95, 1.20, hjU - 1.80, 1.35, topY, topY + 2.15, white, pat, kind);
  pushObbBox3D(propsBuf, obb, hjU - 1.92, -1.30, hjU - 1.84, 1.30, topY + 1.92, topY + 2.00, [0.95, 0.80, 0.14], pat, kind);
}

/** Emits an American football / rugby pitch with striped turf, endzones, white 10-yard grid lines, and 2 yellow tuning-fork H-goalposts (postY = 6.5m). */
export function buildFootballPitchDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(14.0, Math.min(54.0, obb.hl * 0.90));
  const hw = Math.max(7.5, Math.min(28.0, obb.hw * 0.88));
  const stripeDark = [0.16, 0.48, 0.21];
  const stripeLight = [0.22, 0.56, 0.25];
  const endzoneCol = [0.15, 0.34, 0.64];
  const white = [0.97, 0.97, 0.96];
  const yellow = [0.98, 0.84, 0.12];

  const ezFrac = 0.82;
  const playHL = hl * ezFrac;
  // Endzones
  pushObbRect(surfBuf, obb, -hl, -hw, -playHL, hw, topY + 0.008, endzoneCol, pat, kind);
  pushObbRect(surfBuf, obb, playHL, -hw, hl, hw, topY + 0.008, endzoneCol, pat, kind);

  // 10-yard turf stripes + white yard lines
  const nSegments = 10;
  const lw = Math.max(0.14, Math.min(0.24, hl * 0.0055));
  const lineY = topY + 0.022;
  for (let i = 0; i < nSegments; i++) {
    const u0 = -playHL + (2 * playHL * i) / nSegments;
    const u1 = -playHL + (2 * playHL * (i + 1)) / nSegments;
    pushObbRect(surfBuf, obb, u0, -hw, u1, hw, topY + 0.008, (i & 1) ? stripeLight : stripeDark, pat, kind);
    pushObbLine(surfBuf, obb, u0, -hw, u0, hw, lw, lineY, white, pat, kind);
  }
  pushObbLine(surfBuf, obb, playHL, -hw, playHL, hw, lw * 1.2, lineY, white, pat, kind);
  pushObbHollowRect(surfBuf, obb, -hl, -hw, hl, hw, lw * 1.3, lineY, white, pat, kind);

  // Inner hash mark lines along the field
  const hashV = hw * 0.22;
  pushObbLine(surfBuf, obb, -playHL, -hashV, playHL, -hashV, lw * 0.65, lineY, white, pat, kind);
  pushObbLine(surfBuf, obb, -playHL, hashV, playHL, hashV, lw * 0.65, lineY, white, pat, kind);

  // 2 iconic yellow tuning-fork H-goalposts (postY = topY + 6.5m) at both ends
  const postHW = Math.min(2.8, hw * 0.24);
  const crossY = topY + 3.05;
  const postY = topY + 6.5;
  for (const sgn of [-1, 1]) {
    const uPost = sgn * hl;
    const uBase = sgn * (hl + 0.65);
    // Base pedestal & gooseneck arm
    pushObbBox3D(propsBuf, obb, uBase - 0.14, -0.14, uBase + 0.14, 0.14, topY, crossY, yellow, pat, kind);
    const uMin = Math.min(uPost, uBase), uMax = Math.max(uPost, uBase);
    pushObbBox3D(propsBuf, obb, uMin - 0.12, -0.12, uMax + 0.12, 0.12, crossY - 0.18, crossY + 0.05, yellow, pat, kind);
    // Horizontal crossbar
    pushObbBox3D(propsBuf, obb, uPost - 0.12, -postHW - 0.12, uPost + 0.12, postHW + 0.12, crossY - 0.12, crossY + 0.12, yellow, pat, kind);
    // Left and right tall vertical uprights up to 6.5m
    pushObbBox3D(propsBuf, obb, uPost - 0.10, -postHW - 0.10, uPost + 0.10, -postHW + 0.10, crossY, postY, yellow, pat, kind);
    pushObbBox3D(propsBuf, obb, uPost - 0.10, postHW - 0.10, uPost + 0.10, postHW + 0.10, crossY, postY, yellow, pat, kind);
  }
}

/** Emits a golf putting green, curved white-sand bunker pit, 3D flagpole with red triangular pennant flag, and chain basket for disc_golf. */
export function buildGolfDetails(surfBuf, propsBuf, obb, topY, sport) {
  const pat = 5, kind = LC_PITCH;
  const r = Math.max(3.5, Math.min(14.0, Math.min(obb.hl, obb.hw) * 0.78));
  const greenCol = [0.22, 0.66, 0.30];
  const fringeCol = [0.17, 0.50, 0.23];
  const sandCol = [0.93, 0.89, 0.76];
  const white = [0.96, 0.96, 0.96];
  const flagRed = [0.92, 0.16, 0.18];

  // Fringe apron + bright emerald putting green pad
  pushObbDisk(surfBuf, obb, 0, 0, r, 0, Math.PI * 2, 18, topY + 0.008, fringeCol, pat, kind);
  pushObbDisk(surfBuf, obb, -r * 0.12, 0, r * 0.76, 0, Math.PI * 2, 18, topY + 0.015, greenCol, pat, kind);

  // Curved white-sand bunker pit alongside the green
  pushObbDisk(surfBuf, obb, r * 0.52, r * 0.38, r * 0.38, 0, Math.PI * 2, 14, topY + 0.018, sandCol, 2, kind);
  pushObbDisk(surfBuf, obb, r * 0.65, r * 0.12, r * 0.26, 0, Math.PI * 2, 12, topY + 0.018, sandCol, 2, kind);

  // Golf cup + 3D flagpole + red pennant flag
  const cupU = -r * 0.22, cupV = -r * 0.10;
  pushObbDisk(surfBuf, obb, cupU, cupV, 0.22, 0, Math.PI * 2, 8, topY + 0.024, [0.15, 0.16, 0.16], pat, kind);
  pushObbBox3D(propsBuf, obb, cupU - 0.04, cupV - 0.04, cupU + 0.04, cupV + 0.04, topY, topY + 2.25, white, pat, kind);
  pushObbBox3D(propsBuf, obb, cupU, cupV - 0.03, cupU + 0.62, cupV + 0.03, topY + 1.82, topY + 2.22, flagRed, pat, kind);

  if (sport === 'miniature_golf') {
    const brickCol = [0.74, 0.28, 0.22];
    pushObbHollowRect(propsBuf, obb, -r * 0.75, -r * 0.42, r * 0.75, r * 0.42, 0.22, topY + 0.18, brickCol, 7, kind);
    // Mini-golf windmill tower obstacle
    pushObbBox3D(propsBuf, obb, 0.4, -0.55, 1.5, 0.55, topY, topY + 1.85, brickCol, 7, kind);
    pushObbHippedRoof3D(propsBuf, obb, 0.3, -0.65, 1.6, 0.65, topY + 1.85, topY + 2.45, 0, [0.95, 0.78, 0.16], pat, kind);
  } else if (sport === 'disc_golf') {
    // 3D Disc-golf chain target basket
    const bU = r * 0.25, bV = -r * 0.22;
    const steel = [0.78, 0.82, 0.86];
    const bandYellow = [0.96, 0.80, 0.12];
    pushObbBox3D(propsBuf, obb, bU - 0.05, bV - 0.05, bU + 0.05, bV + 0.05, topY, topY + 1.45, steel, pat, kind);
    pushObbBox3D(propsBuf, obb, bU - 0.42, bV - 0.42, bU + 0.42, bV + 0.42, topY + 0.62, topY + 0.84, steel, pat, kind);
    pushObbBox3D(propsBuf, obb, bU - 0.26, bV - 0.26, bU + 0.26, bV + 0.26, topY + 0.84, topY + 1.32, [0.70, 0.74, 0.78], pat, kind);
    pushObbBox3D(propsBuf, obb, bU - 0.38, bV - 0.38, bU + 0.38, bV + 0.38, topY + 1.32, topY + 1.46, bandYellow, pat, kind);
  }
}

/** Emits an ice rink with pale ice-blue surface, perimeter white dasher boards (1.1m high), red/blue lines & face-off circles, and 2 hockey goals. */
export function buildIceRinkDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(8.0, Math.min(32.0, obb.hl * 0.88));
  const hw = Math.max(4.5, Math.min(16.0, obb.hw * 0.86));
  const iceCol = [0.86, 0.93, 0.98];
  const boardWhite = [0.95, 0.96, 0.98];
  const lineRed = [0.88, 0.16, 0.18];
  const lineBlue = [0.16, 0.44, 0.82];
  const kickYellow = [0.95, 0.80, 0.16];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, iceCol, pat, kind);

  // Red center line, two blue lines, and red face-off circles
  const lw = 0.16;
  const lineY = topY + 0.020;
  pushObbLine(surfBuf, obb, 0, -hw, 0, hw, lw * 1.2, lineY, lineRed, pat, kind);
  pushObbLine(surfBuf, obb, -hl * 0.32, -hw, -hl * 0.32, hw, lw * 1.2, lineY, lineBlue, pat, kind);
  pushObbLine(surfBuf, obb, hl * 0.32, -hw, hl * 0.32, hw, lw * 1.2, lineY, lineBlue, pat, kind);

  const fcR = Math.min(3.2, hw * 0.28);
  pushObbArc(surfBuf, obb, 0, 0, fcR, 0, Math.PI * 2, 16, lw, lineY, lineBlue, pat, kind);
  for (const su of [-hl * 0.62, hl * 0.62]) {
    for (const sv of [-hw * 0.44, hw * 0.44]) {
      pushObbArc(surfBuf, obb, su, sv, fcR * 0.85, 0, Math.PI * 2, 14, lw, lineY, lineRed, pat, kind);
    }
  }

  // Perimeter white dasher boards (1.1m high) + yellow kick plate + blue top rail
  const bw = 0.22;
  const bH = 1.10;
  pushObbBox3D(propsBuf, obb, -hl - bw, -hw - bw, hl + bw, -hw, topY, topY + bH, boardWhite, pat, kind);
  pushObbBox3D(propsBuf, obb, -hl - bw, hw, hl + bw, hw + bw, topY, topY + bH, boardWhite, pat, kind);
  pushObbBox3D(propsBuf, obb, -hl - bw, -hw, -hl, hw, topY, topY + bH, boardWhite, pat, kind);
  pushObbBox3D(propsBuf, obb, hl, -hw, hl + bw, hw, topY, topY + bH, boardWhite, pat, kind);
  // Kick-plate & blue cap stripes
  pushObbHollowRect(propsBuf, obb, -hl, -hw, hl, hw, bw * 1.15, topY + 0.14, kickYellow, pat, kind);
  pushObbHollowRect(propsBuf, obb, -hl - bw * 0.5, -hw - bw * 0.5, hl + bw * 0.5, hw + bw * 0.5, bw * 1.1, topY + bH + 0.02, lineBlue, pat, kind);

  // 2 3D Hockey Goals + blue goal creases at both ends
  const gU = hl * 0.84;
  for (const sgn of [-1, 1]) {
    const uGoal = sgn * gU;
    pushObbDisk(surfBuf, obb, uGoal, 0, 1.4, 0, Math.PI * 2, 12, lineY, [0.55, 0.80, 0.96], pat, kind);
    pushObbBox3D(propsBuf, obb, uGoal - 0.45, -0.92, uGoal + 0.45, 0.92, topY, topY + 1.22, lineRed, pat, kind);
    pushObbBox3D(propsBuf, obb, uGoal - 0.38, -0.82, uGoal + 0.38, 0.82, topY, topY + 1.14, boardWhite, pat, kind);
  }
}

/** Emits 3D stone park chess tables (0.9m x 0.9m checkerboard top + 2 stone bench seats). */
export function buildChessDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 7, kind = LC_PITCH;
  const padHL = Math.max(1.8, Math.min(5.0, obb.hl * 0.86));
  const padHW = Math.max(1.8, Math.min(5.0, obb.hw * 0.86));
  const stoneLight = [0.84, 0.82, 0.78];
  const stoneBase = [0.68, 0.66, 0.62];
  const darkSq = [0.20, 0.21, 0.23];
  const creamSq = [0.95, 0.93, 0.88];

  pushObbRect(surfBuf, obb, -padHL, -padHW, padHL, padHW, topY + 0.008, [0.74, 0.71, 0.66], pat, kind);

  const offsets = obb.hl >= 3.0 ? [-1.35, 1.35] : [0];
  for (const uOff of offsets) {
    // Stone pedestal + 0.9m x 0.9m tabletop
    pushObbBox3D(propsBuf, obb, uOff - 0.20, -0.20, uOff + 0.20, 0.20, topY, topY + 0.74, stoneBase, pat, kind);
    pushObbBox3D(propsBuf, obb, uOff - 0.46, -0.46, uOff + 0.46, 0.46, topY + 0.74, topY + 0.82, stoneLight, pat, kind);
    // 4x4 Checkerboard top inlay
    const sq = 0.18;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const su0 = uOff - 0.36 + r * sq;
        const sv0 = -0.36 + c * sq;
        pushObbRect(propsBuf, obb, su0, sv0, su0 + sq, sv0 + sq, topY + 0.826, ((r + c) & 1) ? darkSq : creamSq, 5, kind);
      }
    }
    // 2 stone benches flanking the chess table
    pushObbBox3D(propsBuf, obb, uOff - 0.44, -0.98, uOff + 0.44, -0.62, topY, topY + 0.46, stoneLight, pat, kind);
    pushObbBox3D(propsBuf, obb, uOff - 0.44, 0.62, uOff + 0.44, 0.98, topY, topY + 0.46, stoneLight, pat, kind);
  }
}

/** Emits a painted 4-square court grid on an asphalt pad. */
export function buildFourSquareDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const s = Math.max(2.6, Math.min(5.5, Math.min(obb.hl, obb.hw) * 0.84));
  const asphalt = [0.32, 0.34, 0.37];
  const white = [0.97, 0.97, 0.96];
  const yellow = [0.96, 0.82, 0.16];

  pushObbRect(surfBuf, obb, -s * 1.12, -s * 1.12, s * 1.12, s * 1.12, topY + 0.008, asphalt, pat, kind);
  // 4 painted quadrant squares
  pushObbRect(surfBuf, obb, -s, -s, 0, 0, topY + 0.014, [0.82, 0.28, 0.24], pat, kind);
  pushObbRect(surfBuf, obb, 0, -s, s, 0, topY + 0.014, [0.20, 0.48, 0.78], pat, kind);
  pushObbRect(surfBuf, obb, -s, 0, 0, s, topY + 0.014, [0.22, 0.60, 0.36], pat, kind);
  pushObbRect(surfBuf, obb, 0, 0, s, s, topY + 0.014, [0.88, 0.68, 0.16], pat, kind);

  const lineY = topY + 0.022;
  pushObbHollowRect(surfBuf, obb, -s, -s, s, s, 0.14, lineY, white, pat, kind);
  pushObbLine(surfBuf, obb, -s, 0, s, 0, 0.12, lineY, white, pat, kind);
  pushObbLine(surfBuf, obb, 0, -s, 0, s, 0.12, lineY, white, pat, kind);
  pushObbArc(surfBuf, obb, s, s, s * 0.35, Math.PI, Math.PI * 1.5, 8, 0.10, lineY, yellow, pat, kind);
}

/** Emits an American handball / wallball court with a 3.6m tall x 6.0m wide concrete center strike wall on a blue/grey court. */
export function buildHandballDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(5.5, Math.min(13.0, obb.hl * 0.88));
  const hw = Math.max(3.5, Math.min(7.5, obb.hw * 0.86));
  const courtBlue = [0.20, 0.46, 0.74];
  const white = [0.97, 0.97, 0.96];
  const wallConcrete = [0.80, 0.79, 0.76];
  const faultOrange = [0.92, 0.36, 0.14];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, courtBlue, pat, kind);
  const lineY = topY + 0.020;
  pushObbHollowRect(surfBuf, obb, -hl, -hw, hl, hw, 0.13, lineY, white, pat, kind);
  // Short lines & service lines on both sides of the strike wall
  for (const sgn of [-1, 1]) {
    pushObbLine(surfBuf, obb, sgn * hl * 0.46, -hw, sgn * hl * 0.46, hw, 0.12, lineY, white, pat, kind);
    pushObbLine(surfBuf, obb, sgn * hl * 0.72, -hw, sgn * hl * 0.72, hw, 0.10, lineY, white, pat, kind);
  }

  // 3.6m tall x 6.0m wide concrete center strike wall
  const wallHW = Math.min(3.1, hw * 0.92);
  pushObbBox3D(propsBuf, obb, -0.24, -wallHW, 0.24, wallHW, topY, topY + 3.65, wallConcrete, 7, kind);
  pushObbBox3D(propsBuf, obb, -0.26, -wallHW, 0.26, wallHW, topY + 0.82, topY + 0.96, faultOrange, pat, kind);
}

/** Emits a boules / petanque / bocce court with compacted sand-gravel lane and timber railroad-tie border frame. */
export function buildBoulesDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(4.5, Math.min(12.0, obb.hl * 0.88));
  const hw = Math.max(1.8, Math.min(4.2, obb.hw * 0.84));
  const gravelCol = [0.83, 0.76, 0.58];
  const timberCol = [0.46, 0.30, 0.18];
  const white = [0.95, 0.95, 0.93];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.010, gravelCol, 2, kind);
  pushObbArc(surfBuf, obb, -hl * 0.72, 0, 0.45, 0, Math.PI * 2, 12, 0.08, topY + 0.020, white, pat, kind);
  pushObbArc(surfBuf, obb, hl * 0.72, 0, 0.45, 0, Math.PI * 2, 12, 0.08, topY + 0.020, white, pat, kind);

  // Raised timber sleeper surround
  const tw = 0.22, th = 0.24;
  pushObbBox3D(propsBuf, obb, -hl - tw, -hw - tw, hl + tw, -hw, topY, topY + th, timberCol, 7, kind);
  pushObbBox3D(propsBuf, obb, -hl - tw, hw, hl + tw, hw + tw, topY, topY + th, timberCol, 7, kind);
  pushObbBox3D(propsBuf, obb, -hl - tw, -hw, -hl, hw, topY, topY + th, timberCol, 7, kind);
  pushObbBox3D(propsBuf, obb, hl, -hw, hl + tw, hw, topY, topY + th, timberCol, 7, kind);
}

/** Emits a cricket oval with boundary rope, central tan clay wicket strip, and 3 wooden stumps at each end. */
export function buildCricketDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const r = Math.max(12.0, Math.min(36.0, Math.min(obb.hl, obb.hw) * 0.88));
  const turfCol = [0.21, 0.54, 0.25];
  const clayCol = [0.80, 0.66, 0.44];
  const stumpWood = [0.86, 0.70, 0.38];
  const white = [0.97, 0.97, 0.96];

  pushObbDisk(surfBuf, obb, 0, 0, r, 0, Math.PI * 2, 24, topY + 0.008, turfCol, pat, kind);
  pushObbArc(surfBuf, obb, 0, 0, r * 0.92, 0, Math.PI * 2, 24, 0.20, topY + 0.018, white, pat, kind);
  pushObbArc(surfBuf, obb, 0, 0, r * 0.52, 0, Math.PI * 2, 20, 0.14, topY + 0.018, white, pat, kind);

  // Central tan clay wicket strip (20m x 3m) + white popping creases
  const wHL = Math.min(10.0, r * 0.42);
  const wHW = 1.55;
  pushObbRect(surfBuf, obb, -wHL, -wHW, wHL, wHW, topY + 0.016, clayCol, 2, kind);
  for (const sgn of [-1, 1]) {
    const uStump = sgn * (wHL - 1.2);
    pushObbLine(surfBuf, obb, uStump - sgn * 1.2, -wHW, uStump - sgn * 1.2, wHW, 0.12, topY + 0.024, white, pat, kind);
    // 3 wooden stumps + top bail
    for (const sv of [-0.22, 0, 0.22]) {
      pushObbBox3D(propsBuf, obb, uStump - 0.05, sv - 0.05, uStump + 0.05, sv + 0.05, topY, topY + 0.78, stumpWood, pat, kind);
    }
    pushObbBox3D(propsBuf, obb, uStump - 0.06, -0.26, uStump + 0.06, 0.26, topY + 0.74, topY + 0.82, stumpWood, pat, kind);
  }
  // White sightscreen beyond boundary
  pushObbBox3D(propsBuf, obb, -r * 0.96, -2.4, -r * 0.92, 2.4, topY, topY + 3.2, white, pat, kind);
}

/** Emits a sand equestrian riding arena with white dressage rail fence and painted red/white show-jumping hurdles. */
export function buildEquestrianDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(8.0, Math.min(28.0, obb.hl * 0.88));
  const hw = Math.max(5.0, Math.min(16.0, obb.hw * 0.86));
  const sandCol = [0.85, 0.75, 0.54];
  const white = [0.96, 0.96, 0.95];
  const jumpRed = [0.88, 0.18, 0.18];
  const jumpBlue = [0.16, 0.42, 0.82];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.010, sandCol, 2, kind);
  // White perimeter dressage rail
  pushObbHollowRect(propsBuf, obb, -hl, -hw, hl, hw, 0.18, topY + 0.95, white, pat, kind);

  // 3 3D show-jumping hurdle rails across the arena
  const jumps = [
    [-hl * 0.45, -hw * 0.25, jumpRed],
    [0, hw * 0.22, jumpBlue],
    [hl * 0.45, -hw * 0.18, jumpRed],
  ];
  for (const [ju, jv, barCol] of jumps) {
    const jHW = Math.min(2.1, hw * 0.34);
    pushObbBox3D(propsBuf, obb, ju - 0.14, jv - jHW - 0.14, ju + 0.14, jv - jHW + 0.14, topY, topY + 1.45, white, pat, kind);
    pushObbBox3D(propsBuf, obb, ju - 0.14, jv + jHW - 0.14, ju + 0.14, jv + jHW + 0.14, topY, topY + 1.45, white, pat, kind);
    pushObbBox3D(propsBuf, obb, ju - 0.10, jv - jHW, ju + 0.10, jv + jHW, topY + 1.05, topY + 1.22, barCol, pat, kind);
    pushObbBox3D(propsBuf, obb, ju - 0.10, jv - jHW, ju + 0.10, jv + jHW, topY + 0.62, topY + 0.78, white, pat, kind);
  }
}

/** Emits a 3D angled bouldering / climbing wall prism on a blue crash-mat pad with colorful climbing holds. */
export function buildClimbingDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PITCH;
  const hl = Math.max(3.2, Math.min(8.5, obb.hl * 0.84));
  const hw = Math.max(2.4, Math.min(6.0, obb.hw * 0.82));
  const matBlue = [0.16, 0.44, 0.74];
  const wallRock = [0.64, 0.61, 0.56];
  const wallFacet = [0.56, 0.53, 0.48];

  // Thick blue safety crash-mat pad
  pushObbBox3D(propsBuf, obb, -hl, -hw, hl, hw, topY, topY + 0.32, matBlue, pat, kind);

  // Angled bouldering wall prism + sloped faces
  const wU = Math.min(2.6, hl * 0.68);
  const wV = Math.min(1.5, hw * 0.55);
  const wH = 4.15;
  pushObbBox3D(propsBuf, obb, -wU * 0.55, -wV * 0.65, wU * 0.55, wV * 0.65, topY + 0.32, topY + wH, wallRock, 7, kind);
  pushObbRamp3D(propsBuf, obb, -wU, -wV * 0.65, -wU * 0.55, wV * 0.65, topY + 0.32, topY + wH, '+u', wallFacet, 7, kind);
  pushObbRamp3D(propsBuf, obb, wU * 0.55, -wV * 0.65, wU, wV * 0.65, topY + 0.32, topY + wH, '-u', wallFacet, 7, kind);

  // Colorful 3D climbing holds along the front & back faces
  const holdColors = [
    [0.94, 0.22, 0.20],
    [0.96, 0.80, 0.12],
    [0.20, 0.82, 0.36],
    [0.18, 0.72, 0.94],
    [0.92, 0.24, 0.68],
  ];
  for (let i = 0; i < 10; i++) {
    const hu = -wU * 0.44 + (i % 5) * (wU * 0.22);
    const hy = topY + 0.85 + ((i * 3) % 5) * 0.62;
    const sgn = i < 5 ? 1 : -1;
    const hv = sgn * (wV * 0.65 + 0.06);
    const hc = holdColors[i % holdColors.length];
    pushObbBox3D(propsBuf, obb, hu - 0.11, hv - 0.08, hu + 0.11, hv + 0.08, hy - 0.10, hy + 0.10, hc, pat, kind);
  }
}

/** Emits rows of 3D granite/limestone headstones (0.65m x 0.95m x 0.16m), stone crosses, and memorial obelisks/crypts inside a cemetery. */
export function buildCemeteryDetails(surfBuf, propsBuf, outer, holes, ox, oz, yOff, polySeed) {
  const pat = 7, kind = LC_CEMETERY;
  pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.34, 0.28, [0.58, 0.56, 0.53], pat, kind);

  const obb = computePolyOBB(outer);
  const bb = bboxOf(outer);
  const rng = mulberry32(((polySeed * 6151 + 37) * 2654435761) ^ Math.round(ox + bb[0]));
  const stonePalette = [
    [0.74, 0.75, 0.77], // Light Granite
    [0.62, 0.61, 0.58], // Weathered Limestone
    [0.82, 0.80, 0.76], // Marble Cream
    [0.50, 0.52, 0.55], // Dark Slate Granite
  ];

  const area = Math.max(100, (bb[2] - bb[0]) * (bb[3] - bb[1]));
  const stepX = area > 8000 ? 5.2 : 3.6;
  const stepZ = area > 8000 ? 6.4 : 4.4;
  let graveCount = 0;

  for (let gz = bb[1] + 1.8; gz <= bb[3] - 1.8 && graveCount < 84; gz += stepZ) {
    for (let gx = bb[0] + 1.8; gx <= bb[2] - 1.8 && graveCount < 84; gx += stepX) {
      const jx = gx + (rng() - 0.5) * 0.35;
      const jz = gz + (rng() - 0.5) * 0.35;
      if (!pointInRing(jx, jz, outer)) continue;
      let inHole = false;
      for (const h of holes || []) {
        if (pointInRing(jx, jz, h)) { inHole = true; break; }
      }
      if (inHole) continue;

      const gy = getBeijingTerrainElevation(ox + jx, oz + jz) + yOff;
      const gObb = { cx: jx, cz: jz, ux: obb.ux, uz: obb.uz, vx: obb.vx, vz: obb.vz, hl: 1, hw: 1 };
      const col = stonePalette[graveCount % stonePalette.length];
      const baseCol = [col[0] * 0.86, col[1] * 0.86, col[2] * 0.86];

      if (graveCount % 16 === 0) {
        // Memorial Obelisk (stepped plinth + tall stone shaft + pyramidion cap)
        pushObbBox3D(propsBuf, gObb, -0.52, -0.52, 0.52, 0.52, gy - 0.15, gy + 0.35, baseCol, pat, kind);
        pushObbBox3D(propsBuf, gObb, -0.32, -0.32, 0.32, 0.32, gy + 0.35, gy + 2.25, col, pat, kind);
        pushObbHippedRoof3D(propsBuf, gObb, -0.34, -0.34, 0.34, 0.34, gy + 2.25, gy + 2.75, 0, col, pat, kind);
      } else if (graveCount % 19 === 7) {
        // Family Crypt / Small Stone Mausoleum
        pushObbBox3D(propsBuf, gObb, -1.05, -0.78, 1.05, 0.78, gy - 0.20, gy + 1.45, col, pat, kind);
        pushObbHippedRoof3D(propsBuf, gObb, -1.15, -0.88, 1.15, 0.88, gy + 1.45, gy + 2.05, 0.65, baseCol, pat, kind);
        pushObbBox3D(propsBuf, gObb, 1.02, -0.30, 1.09, 0.30, gy, gy + 1.18, [0.24, 0.22, 0.20], pat, kind);
      } else if (graveCount % 5 === 2) {
        // 3D Stone Cross Monument
        pushObbBox3D(propsBuf, gObb, -0.36, -0.18, 0.36, 0.18, gy - 0.12, gy + 0.16, baseCol, pat, kind);
        pushObbBox3D(propsBuf, gObb, -0.11, -0.09, 0.11, 0.09, gy + 0.16, gy + 1.28, col, pat, kind);
        pushObbBox3D(propsBuf, gObb, -0.36, -0.09, 0.36, 0.09, gy + 0.82, gy + 1.02, col, pat, kind);
      } else {
        // Standard 3D Granite/Limestone Headstone Slab (0.65m x 0.95m x 0.16m) + plinth
        const h = 0.88 + (graveCount % 3) * 0.08;
        pushObbBox3D(propsBuf, gObb, -0.40, -0.15, 0.40, 0.15, gy - 0.12, gy + 0.14, baseCol, pat, kind);
        pushObbBox3D(propsBuf, gObb, -0.325, -0.08, 0.325, 0.08, gy + 0.14, gy + h, col, pat, kind);
      }
      graveCount++;
    }
  }
}

/** Helper to emit a 3D wooden A-frame picnic table at `(uOff, vOff)` in `obb`. */
function pushPicnicTable3D(propsBuf, obb, uOff, vOff, topY, pat, kind) {
  const woodTop = [0.64, 0.40, 0.22];
  const woodLeg = [0.46, 0.28, 0.15];
  // Tabletop (1.8m x 0.82m at y = 0.76m)
  pushObbBox3D(propsBuf, obb, uOff - 0.90, vOff - 0.42, uOff + 0.90, vOff + 0.42, topY + 0.70, topY + 0.78, woodTop, pat, kind);
  // 2 attached side benches (y = 0.45m)
  pushObbBox3D(propsBuf, obb, uOff - 0.90, vOff - 0.86, uOff + 0.90, vOff - 0.56, topY + 0.40, topY + 0.47, woodTop, pat, kind);
  pushObbBox3D(propsBuf, obb, uOff - 0.90, vOff + 0.56, uOff + 0.90, vOff + 0.86, topY + 0.40, topY + 0.47, woodTop, pat, kind);
  // A-frame support legs
  for (const lu of [-0.65, 0.65]) {
    pushObbBox3D(propsBuf, obb, uOff + lu - 0.07, vOff - 0.78, uOff + lu + 0.07, vOff + 0.78, topY, topY + 0.42, woodLeg, pat, kind);
    pushObbBox3D(propsBuf, obb, uOff + lu - 0.07, vOff - 0.36, uOff + lu + 0.07, vOff + 0.36, topY + 0.42, topY + 0.70, woodLeg, pat, kind);
  }
}

/** Emits a 3D timber-column Park Gazebo / Picnic Pavilion with hipped cedar roof (`shelter`). */
export function buildShelterGazeboDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 7, kind = LC_PARK_POI;
  const hl = Math.max(2.0, Math.min(4.2, obb.hl * 0.82));
  const hw = Math.max(2.0, Math.min(4.2, obb.hw * 0.82));
  const stonePad = [0.76, 0.73, 0.68];
  const timberCol = [0.56, 0.35, 0.19];
  const roofCedar = [0.46, 0.25, 0.14];

  pushObbBox3D(propsBuf, obb, -hl, -hw, hl, hw, topY - 0.22, topY + 0.12, stonePad, pat, kind);
  const colU = hl * 0.82, colV = hw * 0.82;
  const eaveY = topY + 2.45;
  for (const su of [-colU, colU]) {
    for (const sv of [-colV, colV]) {
      pushObbBox3D(propsBuf, obb, su - 0.14, sv - 0.14, su + 0.14, sv + 0.14, topY + 0.12, eaveY, timberCol, 5, kind);
    }
  }
  // Hipped cedar shingle roof + picnic table inside
  pushObbHippedRoof3D(propsBuf, obb, -hl * 1.08, -hw * 1.08, hl * 1.08, hw * 1.08, eaveY, eaveY + 1.15, 0.25, roofCedar, 5, kind);
  pushPicnicTable3D(propsBuf, obb, 0, 0, topY + 0.12, 5, kind);
}

/** Emits 3D wooden A-frame picnic tables (`picnic_site`). */
export function buildPicnicSiteDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  pushObbRect(surfBuf, obb, -2.4, -2.0, 2.4, 2.0, topY + 0.008, [0.74, 0.70, 0.62], 7, kind);
  pushPicnicTable3D(propsBuf, obb, 0, 0, topY, pat, kind);
}

/** Emits a black cast-iron pedestal park BBQ grill with glowing embers + companion wooden picnic bench (`bbq`). */
export function buildBbqDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  const castIron = [0.16, 0.17, 0.19];
  const emberCol = [0.94, 0.34, 0.10];
  const grateSteel = [0.78, 0.80, 0.84];

  pushObbRect(surfBuf, obb, -2.0, -2.0, 2.0, 2.0, topY + 0.008, [0.72, 0.69, 0.64], 7, kind);
  // Pedestal post + charcoal firebox + glowing embers + steel grate
  pushObbBox3D(propsBuf, obb, -0.95, -0.09, -0.77, 0.09, topY, topY + 0.82, castIron, pat, kind);
  pushObbBox3D(propsBuf, obb, -1.22, -0.30, -0.50, 0.30, topY + 0.82, topY + 1.08, castIron, pat, kind);
  pushObbRect(propsBuf, obb, -1.16, -0.24, -0.56, 0.24, topY + 1.086, emberCol, pat, kind);
  pushObbBox3D(propsBuf, obb, -1.18, -0.26, -0.54, 0.26, topY + 1.09, topY + 1.13, grateSteel, pat, kind);
  // Companion picnic table beside the grill
  pushPicnicTable3D(propsBuf, obb, 0.65, 0, topY, pat, kind);
}

/** Emits a dog park (`dog_park`) with a blue/yellow agility A-frame ramp, jump hurdle bar, and agility tunnel tube. */
export function buildDogParkDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  const hl = Math.max(4.5, Math.min(12.0, obb.hl * 0.86));
  const hw = Math.max(3.5, Math.min(8.5, obb.hw * 0.84));
  const turfCol = [0.28, 0.56, 0.26];
  const agBlue = [0.16, 0.46, 0.84];
  const agYellow = [0.96, 0.82, 0.14];
  const white = [0.96, 0.96, 0.95];

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, turfCol, pat, kind);

  // 1. Blue & Yellow Dog Agility A-Frame Ramp
  const afU = -hl * 0.35;
  pushObbRamp3D(propsBuf, obb, afU - 1.65, -0.55, afU, 0.55, topY, topY + 1.35, '+u', agBlue, pat, kind);
  pushObbRamp3D(propsBuf, obb, afU, -0.55, afU + 1.65, 0.55, topY, topY + 1.35, '-u', agBlue, pat, kind);
  // Yellow contact-zone bottom ends
  pushObbRamp3D(propsBuf, obb, afU - 1.68, -0.56, afU - 1.10, 0.56, topY + 0.02, topY + 0.48, '+u', agYellow, pat, kind);
  pushObbRamp3D(propsBuf, obb, afU + 1.10, -0.56, afU + 1.68, 0.56, topY + 0.02, topY + 0.48, '-u', agYellow, pat, kind);

  // 2. Dog Agility Tunnel Tube
  const tunU = hl * 0.25, tunV = -hw * 0.32;
  pushObbBox3D(propsBuf, obb, tunU - 1.35, tunV - 0.45, tunU + 1.35, tunV + 0.45, topY, topY + 0.82, agYellow, pat, kind);
  pushObbHippedRoof3D(propsBuf, obb, tunU - 1.35, tunV - 0.45, tunU + 1.35, tunV + 0.45, topY + 0.82, topY + 1.05, 1.0, agYellow, pat, kind);

  // 3. Jump Hurdle Bar
  const jU = hl * 0.28, jV = hw * 0.35;
  pushObbBox3D(propsBuf, obb, jU - 0.08, jV - 0.75, jU + 0.08, jV - 0.62, topY, topY + 0.95, white, pat, kind);
  pushObbBox3D(propsBuf, obb, jU - 0.08, jV + 0.62, jU + 0.08, jV + 0.75, topY, topY + 0.95, white, pat, kind);
  pushObbBox3D(propsBuf, obb, jU - 0.06, jV - 0.70, jU + 0.06, jV + 0.70, topY + 0.52, topY + 0.64, [0.90, 0.22, 0.20], pat, kind);
}

/** Emits pitched colorful A-frame / dome camping tents + stone campfire ring (`campsite`). */
export function buildCampsiteDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  const hl = Math.max(4.5, Math.min(11.0, obb.hl * 0.86));
  const hw = Math.max(3.8, Math.min(8.5, obb.hw * 0.84));

  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, [0.42, 0.52, 0.30], pat, kind);

  // 3 Pitched colorful A-frame & dome camping tents
  const tents = [
    [-hl * 0.42, -hw * 0.36, 1.45, 1.15, 1.55, [0.94, 0.44, 0.14]], // Sunrise Orange tent
    [hl * 0.40, -hw * 0.32, 1.40, 1.10, 1.48, [0.18, 0.56, 0.84]],  // Alpine Blue tent
    [-hl * 0.12, hw * 0.42, 1.50, 1.18, 1.58, [0.22, 0.62, 0.34]],  // Pine Green tent
  ];
  for (const [tu, tv, thl, thw, th, tCol] of tents) {
    pushObbBox3D(propsBuf, obb, tu - thl, tv - thw, tu + thl, tv + thw, topY, topY + 0.28, [0.24, 0.26, 0.28], pat, kind);
    pushObbHippedRoof3D(propsBuf, obb, tu - thl, tv - thw, tu + thl, tv + thw, topY + 0.28, topY + th, 0.85, tCol, pat, kind);
  }

  // Central stone campfire ring + glowing fire pit + log benches
  const fireU = hl * 0.18, fireV = hw * 0.12;
  pushObbDisk(surfBuf, obb, fireU, fireV, 0.95, 0, Math.PI * 2, 12, topY + 0.020, [0.58, 0.56, 0.54], 7, kind);
  pushObbDisk(surfBuf, obb, fireU, fireV, 0.55, 0, Math.PI * 2, 10, topY + 0.028, [0.96, 0.42, 0.10], pat, kind);
  pushObbHippedRoof3D(propsBuf, obb, fireU - 0.38, fireV - 0.38, fireU + 0.38, fireV + 0.38, topY, topY + 0.58, 0, [0.98, 0.64, 0.14], pat, kind);
  pushObbBox3D(propsBuf, obb, fireU - 1.1, fireV - 1.65, fireU + 1.1, fireV - 1.32, topY, topY + 0.38, [0.48, 0.31, 0.18], 7, kind);
}

/** Emits a geodesic lattice aviary dome (`aviary`/`zoo`/`enclosure`) with habitat pond and stone enclosure curb. */
export function buildZooAviaryDetails(surfBuf, propsBuf, obb, topY, poiKind) {
  const pat = 5, kind = LC_PARK_POI;
  const r = Math.max(4.5, Math.min(9.5, Math.min(obb.hl, obb.hw) * 0.82));
  const glassCol = [0.54, 0.78, 0.86];
  const strutCol = [0.88, 0.90, 0.94];
  const stoneCol = [0.68, 0.65, 0.60];

  // Habitat ground disk + turquoise watering pond
  pushObbDisk(surfBuf, obb, 0, 0, r, 0, Math.PI * 2, 18, topY + 0.008, [0.32, 0.55, 0.28], pat, kind);
  pushObbDisk(surfBuf, obb, r * 0.22, -r * 0.15, r * 0.38, 0, Math.PI * 2, 14, topY + 0.016, [0.16, 0.70, 0.80], 6, kind);
  pushObbArc(surfBuf, obb, 0, 0, r, 0, Math.PI * 2, 18, 0.35, topY + 0.022, stoneCol, 7, kind);

  if (poiKind === 'enclosure') {
    // Open-air habitat viewing wall + boulder outcrop + timber shade shelter
    pushObbBox3D(propsBuf, obb, -r * 0.55, -r * 0.45, -r * 0.10, -r * 0.05, topY, topY + 1.65, stoneCol, 7, kind);
    pushObbBox3D(propsBuf, obb, r * 0.15, r * 0.15, r * 0.65, r * 0.55, topY, topY + 2.2, [0.54, 0.34, 0.18], pat, kind);
    return;
  }

  // Geodesic lattice aviary dome (2-tier faceted dome + white steel lattice ribs)
  const dR = r * 0.78;
  const h1 = dR * 0.48;
  const h2 = dR * 0.85;
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const rMid = dR * 0.68;
    // Lower dome ring facet
    pushObbQuad3D(
      propsBuf, obb,
      c0 * dR, topY, s0 * dR,
      c1 * dR, topY, s1 * dR,
      c1 * rMid, topY + h1, s1 * rMid,
      c0 * rMid, topY + h1, s0 * rMid,
      (i & 1) ? glassCol : strutCol, pat, kind
    );
    // Upper dome crown facet
    pushObbQuad3D(
      propsBuf, obb,
      c0 * rMid, topY + h1, s0 * rMid,
      c1 * rMid, topY + h1, s1 * rMid,
      c1 * 0.4, topY + h2, s1 * 0.4,
      c0 * 0.4, topY + h2, s0 * 0.4,
      (i & 1) ? strutCol : glassCol, pat, kind
    );
  }
  // Entry portal arch
  pushObbBox3D(propsBuf, obb, dR - 0.4, -1.1, dR + 0.9, 1.1, topY, topY + 2.35, strutCol, 7, kind);
}

/** Emits an aquarium blue wave canopy with structural piers and a turquoise reef reflection pool (`aquarium`). */
export function buildAquariumDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  const hl = Math.max(5.5, Math.min(13.0, obb.hl * 0.86));
  const hw = Math.max(4.5, Math.min(9.5, obb.hw * 0.84));
  const waveDark = [0.12, 0.48, 0.80];
  const waveCyan = [0.18, 0.74, 0.90];
  const pierWhite = [0.94, 0.96, 0.98];

  // Plaza deck + turquoise reef reflection pool
  pushObbRect(surfBuf, obb, -hl, -hw, hl, hw, topY + 0.008, [0.78, 0.82, 0.86], 7, kind);
  pushObbDisk(surfBuf, obb, hl * 0.42, 0, Math.min(3.6, hw * 0.58), 0, Math.PI * 2, 16, topY + 0.018, [0.13, 0.74, 0.84], 6, kind);

  // Undulating 3-crest ocean-blue wave canopy
  const wHL = hl * 0.68, wHW = hw * 0.72;
  const baseH = 3.2;
  pushObbBox3D(propsBuf, obb, -wHL, -wHW, wHL * 0.5, wHW, topY, topY + baseH, pierWhite, 7, kind);
  const nWaves = 3;
  const segSpan = (wHL * 1.65) / nWaves;
  for (let w = 0; w < nWaves; w++) {
    const u0 = -wHL * 1.05 + w * segSpan;
    const u1 = u0 + segSpan;
    const col = (w & 1) ? waveCyan : waveDark;
    pushObbHippedRoof3D(propsBuf, obb, u0, -wHW * 1.08, u1, wHW * 1.08, topY + baseH, topY + baseH + 1.55, 0.35, col, pat, kind);
  }
}

/** Emits a colorful water-park spiral flume slide tower + turquoise splash pool (`water_park`). */
export function buildWaterParkDetails(surfBuf, propsBuf, obb, topY) {
  const pat = 5, kind = LC_PARK_POI;
  const hl = Math.max(6.5, Math.min(16.0, obb.hl * 0.88));
  const hw = Math.max(5.0, Math.min(12.0, obb.hw * 0.86));
  const poolWater = [0.13, 0.76, 0.86];
  const copingWhite = [0.94, 0.93, 0.90];
  const towerCol = [0.92, 0.94, 0.96];
  const flumeMagenta = [0.92, 0.20, 0.58];
  const flumeCyan = [0.16, 0.78, 0.94];
  const flumeYellow = [0.96, 0.82, 0.14];

  // Turquoise splash lagoon pool + white coping
  pushObbDisk(surfBuf, obb, hl * 0.22, 0, Math.min(6.2, hw * 0.78), 0, Math.PI * 2, 18, topY + 0.012, copingWhite, 7, kind);
  pushObbDisk(surfBuf, obb, hl * 0.22, 0, Math.min(5.5, hw * 0.70), 0, Math.PI * 2, 18, topY + 0.022, poolWater, 6, kind);

  // 7.2m tall water-slide stair tower + yellow canopy roof
  const tU = -hl * 0.45;
  const tH = 6.8;
  pushObbBox3D(propsBuf, obb, tU - 1.15, -1.15, tU + 1.15, 1.15, topY, topY + tH, towerCol, pat, kind);
  pushObbHippedRoof3D(propsBuf, obb, tU - 1.55, -1.55, tU + 1.55, 1.55, topY + tH, topY + tH + 1.15, 0, flumeYellow, pat, kind);

  // Spiraling / banked 3-stage flume slides descending from tower into the splash pool
  pushObbRamp3D(propsBuf, obb, tU - 0.5, 1.15, tU + 2.4, 2.35, topY + 4.4, topY + 6.2, '-u', flumeMagenta, pat, kind);
  pushObbRamp3D(propsBuf, obb, tU + 1.2, -2.35, tU + 3.8, 2.35, topY + 2.3, topY + 4.4, '+v', flumeCyan, pat, kind);
  pushObbRamp3D(propsBuf, obb, tU + 1.8, -1.85, hl * 0.12, -0.65, topY + 0.25, topY + 2.3, '-u', flumeYellow, pat, kind);
}

/** Emits a sloped concrete gravity dam wall with white spillway water foam band (`LC_DAM`). */
export function buildDamDetails(surfBuf, propsBuf, outer, obb, ox, oz, yOff) {
  const pat = 7, kind = LC_DAM;
  const { topY, botY } = sampleFlatCourtElev(obb, ox, oz, yOff);
  const hl = Math.max(5.0, Math.min(85.0, obb.hl * 0.94));
  const hw = Math.max(3.0, Math.min(28.0, obb.hw * 0.90));
  const concreteCrest = [0.75, 0.74, 0.71];
  const concreteFace = [0.62, 0.61, 0.58];
  const spillwayFoam = [0.88, 0.96, 1.0];
  const spillwayCyan = [0.28, 0.78, 0.90];

  const damTopY = topY + 2.4;
  const damBaseY = Math.min(botY, topY - 2.2);
  // Concrete dam crest roadway + parapet walls
  pushObbBox3D(propsBuf, obb, -hl, -hw * 0.42, hl, hw * 0.42, damBaseY, damTopY, concreteCrest, pat, kind);
  pushObbBox3D(propsBuf, obb, -hl, -hw * 0.42, hl, -hw * 0.30, damTopY, damTopY + 0.85, concreteFace, pat, kind);
  pushObbBox3D(propsBuf, obb, -hl, hw * 0.30, hl, hw * 0.42, damTopY, damTopY + 0.85, concreteFace, pat, kind);

  // Sloped concrete gravity downstream apron + central white spillway water foam band
  pushObbRamp3D(propsBuf, obb, -hl * 0.92, hw * 0.42, hl * 0.92, hw, damBaseY, damTopY - 0.15, '-v', concreteFace, pat, kind);
  const spillHL = Math.min(14.0, hl * 0.42);
  pushObbRamp3D(propsBuf, obb, -spillHL, hw * 0.40, spillHL, hw * 1.02, damBaseY + 0.08, damTopY - 0.05, '-v', spillwayCyan, 6, kind);
  pushObbRamp3D(propsBuf, obb, -spillHL * 0.72, hw * 0.40, spillHL * 0.72, hw * 1.04, damBaseY + 0.14, damTopY - 0.02, '-v', spillwayFoam, 6, kind);
}

/** Dispatches any `LC_PITCH` sport to its specialized 3D court/field builder. */
export function dispatchSportCourt(surfBuf, propsBuf, obb, topY, botY, sport, holes) {
  if (sport === 'soccer') {
    buildSoccerPitch(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'american_football') {
    buildFootballPitchDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'baseball') {
    buildBaseballDiamond(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'cricket') {
    buildCricketDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'track' || sport === 'athletics') {
    buildAthleticsTrackDetails(surfBuf, propsBuf, obb, topY, holes);
  } else if (sport === 'skateboard') {
    buildSkateparkDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'table_tennis') {
    buildTableTennisDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'golf' || sport === 'miniature_golf' || sport === 'disc_golf') {
    buildGolfDetails(surfBuf, propsBuf, obb, topY, sport);
  } else if (sport === 'ice_rink') {
    buildIceRinkDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'chess') {
    buildChessDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'four_square') {
    buildFourSquareDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'american_handball') {
    buildHandballDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'boules') {
    buildBoulesDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'equestrian') {
    buildEquestrianDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'climbing') {
    buildClimbingDetails(surfBuf, propsBuf, obb, topY);
  } else if (sport === 'tennis' || sport === 'badminton' || sport === 'pickleball' || sport === 'volleyball') {
    buildNetCourt(surfBuf, propsBuf, obb, topY, sport);
  } else {
    buildBasketballCourt(surfBuf, propsBuf, obb, topY, botY);
  }
}

/** Dispatches any `LC_PARK_POI` outdoor leisure feature to its specialized 3D builder. */
export function dispatchParkPoi(surfBuf, propsBuf, obb, topY, poiKind) {
  if (poiKind === 'shelter') {
    buildShelterGazeboDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'picnic_site') {
    buildPicnicSiteDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'bbq') {
    buildBbqDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'dog_park') {
    buildDogParkDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'campsite') {
    buildCampsiteDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'water_park') {
    buildWaterParkDetails(surfBuf, propsBuf, obb, topY);
  } else if (poiKind === 'aquarium') {
    buildAquariumDetails(surfBuf, propsBuf, obb, topY);
  } else {
    buildZooAviaryDetails(surfBuf, propsBuf, obb, topY, poiKind);
  }
}

/** Emits a perimeter foundation curb/coping around `outer` from `botY` to `topY` with width `w`. */
function pushRingPerimeterCurb(buf, outer, ox, oz, yOffTop, curbRise, width, rgb, pat, kind, isPointInWater = null) {
  const n = outer.length;
  if (n < 6) return;
  const sideCol = [rgb[0] * 0.86, rgb[1] * 0.86, rgb[2] * 0.86];
  // Compute centroid to orient outward normal
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i += 2) {
    cx += outer[i];
    cz += outer[i + 1];
  }
  cx /= (n * 0.5);
  cz /= (n * 0.5);

  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const x0 = outer[i], z0 = outer[i + 1];
    const x1 = outer[j], z1 = outer[j + 1];
    // Skip artificial chunk-clip boundary seams so multi-chunk pools/courts have no seam curb down the middle
    if ((Math.abs(x0) >= 499.5 && Math.abs(x1) >= 499.5) || (Math.abs(z0) >= 499.5 && Math.abs(z1) >= 499.5)) continue;
    if (
      kind !== LC_SWIMMING_POOL &&
      isPointInWater &&
      (isPointInWater(x0, z0, 0.5) || isPointInWater(x1, z1, 0.5) || isPointInWater((x0 + x1) * 0.5, (z0 + z1) * 0.5, 0.5))
    ) {
      continue;
    }
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    let nx = -dz / len, nz = dx / len;
    const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
    if (pointInRing(mx + nx * 0.25, mz + nz * 0.25, outer)) {
      nx = -nx;
      nz = -nz;
    }
    const ox0 = x0 + nx * width, oz0 = z0 + nz * width;
    const ox1 = x1 + nx * width, oz1 = z1 + nz * width;
    const g0 = getBeijingTerrainElevation(ox + x0, oz + z0);
    const g1 = getBeijingTerrainElevation(ox + x1, oz + z1);
    const ty0 = g0 + yOffTop + curbRise;
    const ty1 = g1 + yOffTop + curbRise;
    const iy0 = g0 + yOffTop;
    const iy1 = g1 + yOffTop;
    const by0 = g0 - 0.35;
    const by1 = g1 - 0.35;

    // Top coping face
    pushUpQuad(buf, x0, ty0, z0, x1, ty1, z1, ox1, ty1, oz1, ox0, ty0, oz0, rgb, pat, kind);
    // Outer vertical wall down to terrain
    pushTri(buf, ox0, by0, oz0, ox1, by1, oz1, ox1, ty1, oz1, nx, 0, nz, sideCol, pat, kind);
    pushTri(buf, ox0, by0, oz0, ox1, ty1, oz1, ox0, ty0, oz0, nx, 0, nz, sideCol, pat, kind);
    // Inner lip wall down to pool/court surface
    if (curbRise > 0.01) {
      pushTri(buf, x1, iy1, z1, x0, iy0, z0, x0, ty0, z0, -nx, 0, -nz, sideCol, pat, kind);
      pushTri(buf, x1, iy1, z1, x0, ty0, z0, x1, ty1, z1, -nx, 0, -nz, sideCol, pat, kind);
    }
  }
}

/** Emits a planted floral clump at `(x, y, z)`: a low, uneven leafy cushion dotted with small blossoms.
 *  About 15 triangles: flowerbeds include every mapped garden, so this runs tens of thousands of times
 *  per city. */
function pushFlowerCluster3D(buf, x, y, z, r, h, flowerRgb, pat, kind, rng) {
  const N = 7;
  const hh = h * 0.55;
  const g = 0.85 + rng() * 0.25;
  const tx = x + (rng() - 0.5) * r * 0.25, tz = z + (rng() - 0.5) * r * 0.25, ty = y + hh;
  const a0 = rng() * Math.PI * 2;
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const a = a0 + (i / N) * Math.PI * 2, rr = r * (0.8 + rng() * 0.4);
    const cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr, cy = y + hh * (0.15 + rng() * 0.2);
    if (i > 0) {
      const ma = a - Math.PI / N, s = 0.82 + rng() * 0.3;
      const c = [0.17 * g * s, 0.44 * g * s, 0.17 * g * s];
      pushTri(buf, cx, cy, cz, px, py, pz, tx, ty, tz, Math.cos(ma) * 0.45, 0.9, Math.sin(ma) * 0.45, c, pat, kind);
    }
    px = cx; py = cy; pz = cz;
  }
  // Blossoms: small single-triangle flowers scattered over the cushion, mostly the bed colour
  for (let k = 0; k < 8; k++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r * 0.75, ps = 0.09 + rng() * 0.06;
    const bx = tx + Math.cos(a) * d, bz = tz + Math.sin(a) * d;
    const by = ty - (d / r) * hh * 0.75 + 0.025;
    const t = rng(), m = t < 0.12 ? 1.25 : t > 0.9 ? 0.75 : 0.92 + rng() * 0.16;
    const c = [Math.min(1, flowerRgb[0] * m), Math.min(1, flowerRgb[1] * m), Math.min(1, flowerRgb[2] * m)];
    const rot = rng() * Math.PI * 2;
    pushTri(buf, bx + Math.cos(rot) * ps, by, bz + Math.sin(rot) * ps,
      bx + Math.cos(rot + 4.2) * ps, by, bz + Math.sin(rot + 4.2) * ps,
      bx + Math.cos(rot + 2.1) * ps, by, bz + Math.sin(rot + 2.1) * ps, 0, 1, 0, c, pat, kind);
  }
}

/** Emits 3D stepped stone staircase treads and flanking cheek walls along a `steps` polyline. */
function buildStepsPolyline3D(propsBuf, flatLine, widthM, ox, oz, isPointInWater = null) {
  const pat = 7, kind = LC_STEPS;
  const treadRgb = [0.83, 0.80, 0.75];
  const riserRgb = [0.54, 0.51, 0.47];
  const wallRgb = [0.74, 0.71, 0.66];
  const hw = Math.max(1.1, Math.min(4.0, (widthM || 3.2) * 0.5));
  const wallW = 0.24;

  for (let i = 0; i + 3 < flatLine.length; i += 2) {
    const x0 = flatLine[i], z0 = flatLine[i + 1];
    const x1 = flatLine[i + 2], z1 = flatLine[i + 3];
    const dx = x1 - x0, dz = z1 - z0;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.8) continue;
    if (isPointInWater && (isPointInWater(x0, z0, 0.5) || isPointInWater(x1, z1, 0.5) || isPointInWater((x0 + x1) * 0.5, (z0 + z1) * 0.5, 0.5))) continue;

    const ux = dx / segLen, uz = dz / segLen;
    const vx = -uz, vz = ux;

    const g0 = getBeijingTerrainElevation(ox + x0, oz + z0) + 0.44;
    const g1 = getBeijingTerrainElevation(ox + x1, oz + z1) + 0.44;
    // Ensure a visible stepped profile even on gently sloped ways
    const naturalDiff = g1 - g0;
    const stepCount = Math.max(3, Math.min(28, Math.round(segLen / 0.65)));
    const totalRise = Math.abs(naturalDiff) >= 0.45 ? naturalDiff : (naturalDiff >= 0 ? 0.55 : -0.55);

    for (let s = 0; s < stepCount; s++) {
      const t0 = s / stepCount;
      const t1 = (s + 1) / stepCount;
      const sx0 = x0 + dx * t0, sz0 = z0 + dz * t0;
      const sx1 = x0 + dx * t1, sz1 = z0 + dz * t1;
      const yPrev = g0 + totalRise * (s / stepCount);
      const yTread = g0 + totalRise * ((s + 1) / stepCount);
      const yTop = Math.max(yPrev, yTread);
      const yBot = Math.min(yPrev, yTread) - 0.14;

      // Horizontal stone tread
      const ax = sx0 - vx * hw, az = sz0 - vz * hw;
      const bx = sx0 + vx * hw, bz = sz0 + vz * hw;
      const cx = sx1 + vx * hw, cz = sz1 + vz * hw;
      const ex = sx1 - vx * hw, ez = sz1 - vz * hw;
      pushUpQuad(propsBuf, ax, yTop, az, bx, yTop, bz, cx, yTop, cz, ex, yTop, ez, treadRgb, pat, kind);

      // Vertical stone riser at front edge of tread
      const rx0 = totalRise >= 0 ? ax : ex;
      const rz0 = totalRise >= 0 ? az : ez;
      const rx1 = totalRise >= 0 ? bx : cx;
      const rz1 = totalRise >= 0 ? bz : cz;
      const rnx = totalRise >= 0 ? -ux : ux;
      const rnz = totalRise >= 0 ? -uz : uz;
      pushTri(propsBuf, rx0, yBot, rz0, rx1, yBot, rz1, rx1, yTop, rz1, rnx, 0, rnz, riserRgb, pat, kind);
      pushTri(propsBuf, rx0, yBot, rz0, rx1, yTop, rz1, rx0, yTop, rz0, rnx, 0, rnz, riserRgb, pat, kind);
    }

    // Left and right stone balustrade cheek walls
    const obb = {
      cx: (x0 + x1) * 0.5,
      cz: (z0 + z1) * 0.5,
      ux, uz, vx, vz,
      hl: segLen * 0.5,
      hw,
    };
    const yWallBot = Math.min(g0, g0 + totalRise) - 0.40;
    const yWallTop = Math.max(g0, g0 + totalRise) + 0.28;
    pushObbBox3D(propsBuf, obb, -obb.hl, -hw - wallW, obb.hl, -hw, yWallBot, yWallTop, wallRgb, pat, kind);
    pushObbBox3D(propsBuf, obb, -obb.hl, hw, obb.hl, hw + wallW, yWallBot, yWallTop, wallRgb, pat, kind);
  }
}

function makeMeshFromBuf(buf, castShadow) {
  if (buf.pos.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
  const c8 = new Uint8Array(buf.col.length);
  for (let i = 0; i < buf.col.length; i++) {
    c8[i] = Math.round(Math.min(1, Math.max(0, buf.col[i])) * 255);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  const mesh = new THREE.Mesh(geom, { name: 'landcoverMat' });
  mesh.receiveShadow = true;
  mesh.castShadow = Boolean(castShadow);
  return mesh;
}

function buildLandcoverAndRichMeshes(polys, ox, oz, isPointInWater, isPointInSunkenTrench, roadClearance, nearBuilding) {
  const surfBuf = createBuf();
  const propsBuf = createBuf();
  const sub = [];

  const FLOWER_PALETTE = [
    [0.92, 0.18, 0.24], // Rose Red
    [0.98, 0.78, 0.12], // Marigold Yellow
    [0.90, 0.22, 0.64], // Bougainvillea Magenta
    [0.60, 0.28, 0.88], // Lavender Violet
    [0.97, 0.95, 0.90], // White
    [0.98, 0.52, 0.16], // Orange
    [0.98, 0.62, 0.72], // Pink
  ];

  for (let p = 0; p < polys.length; p++) {
    const [kind, outer, holes, meta] = polys[p];
    const style = LC_STYLE[kind];
    if (!style || !outer) continue;
    if (kind <= 4) continue; // [ground] residential/commercial/industrial/institution ground is the terrain's (ground_cover.js)

    // 3D Hillside Steps (`LC_STEPS` is a polyline `[x0, z0, x1, z1, ...]`)
    if (kind === LC_STEPS) {
      if (outer.length >= 4) {
        buildStepsPolyline3D(propsBuf, outer, meta?.width || 3.2, ox, oz, isPointInWater);
      }
      continue;
    }

    if (outer.length < 6) continue;

    // Guard synthetic POI-only courts/pools/park-amenities against road or building overlap
    if (meta?.synthetic) {
      const bb = bboxOf(outer);
      const mcx = (bb[0] + bb[2]) * 0.5;
      const mcz = (bb[1] + bb[3]) * 0.5;
      const smallParkProp =
        kind === LC_PARK_POI ||
        meta?.sport === 'chess' ||
        meta?.sport === 'table_tennis' ||
        meta?.sport === 'four_square';
      const minClear = smallParkProp ? 0.35 : 1.5;
      if (roadClearance && roadClearance(mcx, mcz) < minClear) continue;
      if (nearBuilding && nearBuilding(mcx, mcz, minClear)) continue;
      if (kind !== LC_SWIMMING_POOL && isPointInWater && isPointInWater(mcx, mcz, 1.0)) continue;
    }

    const [baseRgb, yOff, pattern] = style;

    // Choose base apron color per sport for LC_PITCH
    let polyRgb = baseRgb;
    let resolvedSport = meta?.sport || '';
    let obb = null;
    if (
      kind === LC_PITCH ||
      kind === LC_TRACK ||
      kind === LC_PLAYGROUND ||
      kind === LC_SWIMMING_POOL ||
      kind === LC_DAM ||
      kind === LC_PARK_POI
    ) {
      obb = computePolyOBB(outer);
      if (kind === LC_PITCH && !resolvedSport) {
        if (obb.hl >= 30 && obb.hw >= 18) resolvedSport = 'soccer';
        else if (obb.hl >= 16 && obb.hw >= 14 && Math.abs(obb.hl - obb.hw) < 5.5) resolvedSport = 'baseball';
        else if ((((Math.round(obb.cx) * 73) ^ (Math.round(obb.cz) * 31)) & 3) === 0) resolvedSport = 'tennis';
        else resolvedSport = 'basketball';
      }
      if (kind === LC_PITCH) {
        if (resolvedSport === 'basketball') polyRgb = [0.20, 0.44, 0.32];
        else if (resolvedSport === 'tennis' || resolvedSport === 'badminton' || resolvedSport === 'pickleball') polyRgb = [0.18, 0.46, 0.30];
        else if (resolvedSport === 'volleyball') polyRgb = [0.24, 0.48, 0.66];
        else if (resolvedSport === 'skateboard' || resolvedSport === 'american_handball' || resolvedSport === 'four_square') polyRgb = [0.62, 0.61, 0.58];
        else if (resolvedSport === 'ice_rink') polyRgb = [0.82, 0.90, 0.96];
        else if (resolvedSport === 'equestrian' || resolvedSport === 'boules') polyRgb = [0.78, 0.70, 0.52];
        else if (resolvedSport === 'chess') polyRgb = [0.74, 0.71, 0.66];
        else polyRgb = [0.19, 0.50, 0.23];
      }
    }

    // Triangulate polygon
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
    const maxEdge = kind >= LC_PITCH ? 18 : (isPointInSunkenTrench ? 22 : 34);
    for (const [a, b, c] of tris) {
      const A = all[a], B = all[b], C = all[c];
      if (!A || !B || !C) continue;
      pushSubdivided(sub, A.x, A.y, B.x, B.y, C.x, C.y, maxEdge);
    }

    for (let i = 0; i < sub.length; i += 6) {
      const ax = sub[i], az = sub[i + 1], bx = sub[i + 2], bz = sub[i + 3], cx = sub[i + 4], cz = sub[i + 5];
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
      // Swimming pools intentionally sit on `water` polygons, so do not skip when `isPointInWater` is true
      if (
        kind !== LC_SWIMMING_POOL &&
        isPointInWater &&
        (isPointInWater(mx, mz, 0) || isPointInWater(ax, az, 0) || isPointInWater(bx, bz, 0) || isPointInWater(cx, cz, 0))
      ) {
        continue;
      }
      if (
        isPointInSunkenTrench &&
        (isPointInSunkenTrench(mx, mz) || isPointInSunkenTrench(ax, az) || isPointInSunkenTrench(bx, bz) || isPointInSunkenTrench(cx, cz))
      ) {
        continue;
      }
      const ya = getBeijingTerrainElevation(ox + ax, oz + az) + yOff;
      const yb = getBeijingTerrainElevation(ox + bx, oz + bz) + yOff;
      const yc = getBeijingTerrainElevation(ox + cx, oz + cz) + yOff;
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      let triRgb = polyRgb, triPat = pattern;
      if (kind === LC_ROCK || kind === LC_GRASS || kind === LC_SCRUB) {
        // open natural cover above the snowline gets the same snow as the bare terrain (steep faces stay bare)
        const ux = bx - ax, uy = yb - ya, uz = bz - az, vx = cx - ax, vy = yc - ya, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const t = snowCover((ya + yb + yc) / 3, Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny)));
        if (t > 0) {
          triRgb = [polyRgb[0] + (0.93 - polyRgb[0]) * t, polyRgb[1] + (0.95 - polyRgb[1]) * t, polyRgb[2] + (0.98 - polyRgb[2]) * t];
          if (t > 0.5) triPat = 10; // glacier/snow texture
        }
      }
      if (cross > 0) pushTri(surfBuf, ax, ya, az, cx, yc, cz, bx, yb, bz, 0, 1, 0, triRgb, triPat, kind);
      else pushTri(surfBuf, ax, ya, az, bx, yb, bz, cx, yc, cz, 0, 1, 0, triRgb, triPat, kind);
    }

    // --- Rich 3D details for Track 2 landuse kinds ---
    if (kind === LC_SWIMMING_POOL && obb) {
      // Raised white travertine coping border (+0.12m above pool water)
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.125, 0.78, [0.94, 0.92, 0.88], 7, kind);
      // Floating lap lane lines + 3D diving block on rectangular lap pools (skip freeform/L-shaped resort pools)
      let polyArea = 0;
      let touchesClipSeam = false;
      for (let i = 0, n = outer.length; i < n; i += 2) {
        const j = (i + 2) % n;
        polyArea += outer[i] * outer[j + 1] - outer[j] * outer[i + 1];
        if (Math.abs(outer[i]) >= 499.5 || Math.abs(outer[i + 1]) >= 499.5) touchesClipSeam = true;
      }
      polyArea = Math.abs(polyArea) * 0.5;
      const obbArea = Math.max(1, 4 * obb.hl * obb.hw);
      if (!touchesClipSeam && obb.hl >= 5.5 && obb.hw >= 3.0 && obb.hl <= 65 && polyArea / obbArea >= 0.85) {
        const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        const nLanes = Math.max(2, Math.min(6, Math.floor((obb.hw * 1.6) / 2.2)));
        const hlLane = obb.hl * 0.84;
        for (let l = 1; l < nLanes; l++) {
          const v = -obb.hw * 0.76 + ((obb.hw * 1.52) * l) / nLanes;
          pushObbLine(surfBuf, obb, -hlLane, v, hlLane, v, 0.11, topY + 0.012, [0.88, 0.96, 1.0], 5, kind);
        }
        // White starting blocks at one end
        pushObbBox3D(propsBuf, obb, -obb.hl - 0.35, -0.35, -obb.hl + 0.15, 0.35, topY, topY + 0.52, [0.92, 0.94, 0.96], 5, kind);
      }
    } else if (kind === LC_PLAZA) {
      // Warm stone perimeter curb around pedestrian plazas
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.04, 0.32, [0.82, 0.79, 0.73], 7, kind, isPointInWater);
    } else if (kind === LC_FLOWERBED) {
      // Low stone garden edging + vibrant red/yellow/magenta/violet 3D floral cluster mounds
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.06, 0.25, [0.68, 0.65, 0.60], 7, kind, isPointInWater);
      const bb = bboxOf(outer);
      const rng = mulberry32(((p * 4999 + 19) * 2654435761) ^ Math.round(ox + bb[0]));
      const step = 2.6;
      let clusterCount = 0;
      for (let gz = bb[1] + 0.8; gz <= bb[3] - 0.8 && clusterCount < 64; gz += step) {
        for (let gx = bb[0] + 0.8; gx <= bb[2] - 0.8 && clusterCount < 64; gx += step) {
          const fx = gx + (rng() - 0.5) * 1.4;
          const fz = gz + (rng() - 0.5) * 1.4;
          if (!pointInRing(fx, fz, outer)) continue;
          if (isPointInWater && isPointInWater(fx, fz, 0.5)) continue;
          let inHole = false;
          for (const h of holes || []) {
            if (pointInRing(fx, fz, h)) { inHole = true; break; }
          }
          if (inHole) continue;
          const fy = getBeijingTerrainElevation(ox + fx, oz + fz) + yOff;
          const cRgb = FLOWER_PALETTE[Math.floor(rng() * FLOWER_PALETTE.length)];
          const r = 0.48 + rng() * 0.38;
          const h = 0.28 + rng() * 0.26;
          pushFlowerCluster3D(propsBuf, fx, fy, fz, r, h, cRgb, 5, kind, rng);
          clusterCount++;
        }
      }
    } else if (kind === LC_CEMETERY) {
      if (!isPointInWater || !obb || !isPointInWater(obb.cx, obb.cz, 1.0)) {
        buildCemeteryDetails(surfBuf, propsBuf, outer, holes, ox, oz, yOff, p);
      }
    } else if (kind === LC_DAM && obb) {
      buildDamDetails(surfBuf, propsBuf, outer, obb, ox, oz, yOff);
    } else if (kind === LC_PARK_POI && obb && obb.hl <= 120) {
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.03, 0.28, [0.76, 0.73, 0.68], 7, kind, isPointInWater);
      if (!isPointInWater || !isPointInWater(obb.cx, obb.cz, 1.0)) {
        const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        dispatchParkPoi(surfBuf, propsBuf, obb, topY, meta?.poiKind || 'shelter');
      }
    } else if (kind === LC_TRACK && obb && obb.hl <= 140) {
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.02, 0.35, [0.78, 0.76, 0.72], 7, kind, isPointInWater);
      if (!isPointInWater || !isPointInWater(obb.cx, obb.cz, 1.0)) {
        const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        buildAthleticsTrackDetails(surfBuf, propsBuf, obb, topY, holes);
      }
    } else if (kind === LC_PLAYGROUND && obb && obb.hl <= 80) {
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.03, 0.30, [0.82, 0.80, 0.76], 7, kind, isPointInWater);
      if (!isPointInWater || !isPointInWater(obb.cx, obb.cz, 1.0)) {
        const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        buildPlaygroundDetails(surfBuf, propsBuf, obb, topY);
      }
    } else if (kind === LC_PITCH && obb && obb.hl <= 130 && (!isPointInWater || !isPointInWater(obb.cx, obb.cz, 1.0))) {
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.02, 0.32, [0.76, 0.75, 0.72], 7, kind, isPointInWater);
      const pois = meta?.pois || [];
      // If a compound multi-court enclosure contains multiple distinct court POIs, render each sub-court at its POI
      const courtPois = pois.filter(
        (pt) => pt[2] !== 'soccer' && pt[2] !== 'american_football' && pt[2] !== 'baseball' && pt[2] !== 'cricket'
      );
      if (courtPois.length >= 2 && obb.hl * obb.hw * 4 > 750) {
        const subCourts = courtPois.slice(0, 6);
        const crossOriented = obb.hl > obb.hw * 1.25;
        for (let k = 0; k < subCourts.length; k++) {
          const [px, pz, pSport] = subCourts[k];
          const sSport = pSport || resolvedSport || 'basketball';
          const subObb = crossOriented
            ? {
                cx: px,
                cz: pz,
                ux: obb.vx,
                uz: obb.vz,
                vx: -obb.ux,
                vz: -obb.uz,
                hl: Math.min(13.5, obb.hw * 0.88),
                hw: Math.min(7.2, (obb.hl / subCourts.length) * 0.86),
              }
            : {
                cx: px,
                cz: pz,
                ux: obb.ux,
                uz: obb.uz,
                vx: obb.vx,
                vz: obb.vz,
                hl: Math.min(13.5, obb.hl * 0.86),
                hw: Math.min(7.2, (obb.hw / subCourts.length) * 0.86),
              };
          const { topY, botY } = sampleFlatCourtElev(subObb, ox, oz, yOff);
          dispatchSportCourt(surfBuf, propsBuf, subObb, topY, botY, sSport, holes);
        }
      } else {
        const { topY, botY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        dispatchSportCourt(surfBuf, propsBuf, obb, topY, botY, resolvedSport, holes);
      }
    }
  }

  return {
    surfaceMesh: makeMeshFromBuf(surfBuf, false),
    propsMesh: makeMeshFromBuf(propsBuf, true),
  };
}

/**
 * Chunk hook: builds the landcover & rich athletic/pool/plaza/step meshes into `terrainGroup`
 * and returns the vegetation instance table.
 */
export function buildVegetationLayer({ cx, cz, ox, oz, data, roadSegments, isPointInWater, isPointInSunkenTrench, terrainGroup, worldOrigin = null }) {
  const src = data.vegetation || {};
  const landPolys = src.landcover || [];

  // [feature/climate-flora] Koeppen climate + region palette + season + altitude for this chunk's location
  const lat0 = Number.isFinite(src.lat) ? src.lat : 39.9;
  const lon0 = Number.isFinite(src.lon) ? src.lon : 116.4;
  const latC = lat0 - oz / 111320;
  const lonC = lon0 + ox / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const dem = getBeijingDemState();
  const baseAsl = (dem && dem.baseAslM) || 0;
  const ctx = floraContext(latC, lonC, baseAsl);
  // [tree-placement] absolute-metre frame (origin lat/lon + local) for position-seeded variation
  const absX0 = lon0 * 111320 * Math.cos((lat0 * Math.PI) / 180) + ox, absZ0 = -lat0 * 111320 + oz;
  // Species mix: low-frequency drift per neighbourhood (~700 m) + grove-scale coherence (~45 m) + per-tree randomness.
  // Returns u in [0,1) for pickFlora; nearby trees often share a species, a street/patch mixes 2-4.
  const mixU = (x, z, base, rnd) => floraMixU(absX0 + x, absZ0 + z, rnd);

  const inst = new Float32Array(MAX_CHUNK_INSTANCES * INST_STRIDE);
  const species = new Uint8Array(MAX_CHUNK_INSTANCES);
  let count = 0;

  // --- Spatial indices (chunk-local) ---
  const roadGrid = createGrid(20);
  const renderedRoadGrid = createGrid(24);
  const junctionGrid = createGrid(40);
  const nodeDeg = new Map();
  const segs = [];
  for (const r of data.roads || []) {
    const [, cls, name, , , widthM, , isBridge, isTunnel, , flat] = r;
    if (isTunnel || !flat || flat.length < 6) continue;
    const hw = Math.max(1.0, (widthM || 4) * 0.5);
    for (let i = 0; i + 5 < flat.length; i += 3) {
      const x1 = flat[i], y1 = flat[i + 1] || 0, z1 = flat[i + 2];
      const x2 = flat[i + 3], y2 = flat[i + 4] || 0, z2 = flat[i + 5];
      if (Math.max(x1, x2) < -530 || Math.min(x1, x2) > 530 || Math.max(z1, z2) < -530 || Math.min(z1, z2) > 530) continue;
      const isElevated = Boolean(isBridge || y1 > 0.8 || y2 > 0.8);
      const isSunken = Boolean(y1 < -0.65 || y2 < -0.65);
      const pad = isElevated ? hw + 6.5 : hw + 4.5;
      const seg = { x1, z1, x2, z2, y1, y2, hw, cls, bridge: isBridge, elevated: isElevated, sunken: isSunken, name: name || '' };
      segs.push(seg);
      roadGrid.insert(Math.min(x1, x2) - pad, Math.min(z1, z2) - pad, Math.max(x1, x2) + pad, Math.max(z1, z2) + pad, seg);
      if (!isBridge && cls !== 'footway' && cls !== 'cycleway' && cls !== 'steps') {
        for (const [x, z] of [[x1, z1], [x2, z2]]) {
          const k = `${Math.round(x / 1.5)},${Math.round(z / 1.5)}`;
          const e = nodeDeg.get(k);
          if (e) e.n++;
          else nodeDeg.set(k, { x, z, n: 1 });
        }
      }
    }
  }
  // Index actual rendered 3D road segments (with exact graded cy1, cy2 and bridge lifts from chunk_builder)
  for (let i = 0; i < (roadSegments || []).length; i++) {
    const rs = roadSegments[i];
    if (rs.tunnel) continue;
    const x1 = rs.x1 - ox, z1 = rs.z1 - oz, x2 = rs.x2 - ox, z2 = rs.z2 - oz;
    const hw = Math.max(1.0, (rs.width || 4) * 0.5);
    const pad = hw + 6.5;
    renderedRoadGrid.insert(
      Math.min(x1, x2) - pad,
      Math.min(z1, z2) - pad,
      Math.max(x1, x2) + pad,
      Math.max(z1, z2) + pad,
      { x1, y1: rs.y1, z1, x2, y2: rs.y2, z2, hw, cls: rs.cls, bridge: Boolean(rs.bridge) }
    );
  }
  for (const e of nodeDeg.values()) {
    if (e.n >= 3) junctionGrid.insert(e.x - 14, e.z - 14, e.x + 14, e.z + 14, e);
  }
  const roadClearance = (x, z) => {
    let best = Infinity;
    const list = roadGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-4 ? Math.max(0, Math.min(1, ((x - s.x1) * vx + (z - s.z1) * vz) / l2)) : 0;
      const dx = x - (s.x1 + vx * t), dz = z - (s.z1 + vz * t);
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Enforce extra clearance around bridges/elevated roads so tree canopies never poke up through bridge decks
      const extraMargin = s.elevated ? 3.5 : 0.0;
      const d = dist - (s.hw + extraMargin);
      if (d < best) best = d;
    }
    const rList = renderedRoadGrid.query(x, z);
    const terrY = Math.max(getBeijingTerrainElevation(ox + x, oz + z), getChunkTerrainMeshElevation(ox + x, oz + z));
    for (let i = 0; i < rList.length; i++) {
      const rs = rList[i];
      const vx = rs.x2 - rs.x1, vz = rs.z2 - rs.z1;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-4 ? Math.max(0, Math.min(1, ((x - rs.x1) * vx + (z - rs.z1) * vz) / l2)) : 0;
      const dx = x - (rs.x1 + vx * t), dz = z - (rs.z1 + vz * t);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const ry = rs.y1 + (rs.y2 - rs.y1) * t;
      const isElev = rs.bridge || ry > terrY + 1.25;
      const d = dist - (rs.hw + (isElev ? 3.8 : 0.0));
      if (d < best) best = d;
    }
    return best;
  };
  // Samples exact local ground / sidewalk surface height so street trees never grow from underneath the road deck
  const sampleTreeSurfaceY = (x, z, isStreetTree = false) => {
    const wx = ox + x, wz = oz + z;
    let y = Math.max(getBeijingTerrainElevation(wx, wz), getChunkTerrainMeshElevation(wx, wz));
    const rList = renderedRoadGrid.query(x, z);
    let bestD = Infinity;
    let bestRoadY = null;
    for (let i = 0; i < rList.length; i++) {
      const rs = rList[i];
      if (rs.bridge) continue;
      const vx = rs.x2 - rs.x1, vz = rs.z2 - rs.z1;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-4 ? Math.max(0, Math.min(1, ((x - rs.x1) * vx + (z - rs.z1) * vz) / l2)) : 0;
      const dx = x - (rs.x1 + vx * t), dz = z - (rs.z1 + vz * t);
      const edgeDist = Math.sqrt(dx * dx + dz * dz) - rs.hw;
      const ry = rs.y1 + (rs.y2 - rs.y1) * t;
      // Only snap to surface-graded streets (not high viaduct decks overhead)
      if (edgeDist < (isStreetTree ? 4.5 : 3.2) && ry >= y - 0.6 && ry <= y + 1.85 && edgeDist < bestD) {
        bestD = edgeDist;
        bestRoadY = ry + 0.04; // match sidewalk surface elevation (ly + 0.04)
      }
    }
    if (bestRoadY !== null) return Math.max(y, bestRoadY);
    return y;
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

  // Spatial exclusion grid so trees are never planted inside courts, running tracks, pools, or plazas
  const courtGrid = createGrid(25);
  for (let p = 0; p < landPolys.length; p++) {
    const [kind, outer] = landPolys[p];
    if (kind === LC_PITCH || kind === LC_TRACK || kind === LC_PLAYGROUND || kind === LC_SWIMMING_POOL || kind === LC_PLAZA || kind === LC_DAM || kind === LC_PARK_POI) {
      if (!outer || outer.length < 6) continue;
      const bb = bboxOf(outer);
      courtGrid.insert(bb[0] - 2.5, bb[1] - 2.5, bb[2] + 2.5, bb[3] + 2.5, { bb, outer });
    }
  }
  const inCourtOrPlaza = (x, z, r = 2.0) => {
    const list = courtGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const { bb, outer } = list[i];
      if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue;
      if (pointInRing(x, z, outer)) return true;
      if (r > 0 && distToRing2(x, z, outer) < r * r) return true;
    }
    return false;
  };

  // Build landcover ground mesh + 3D courts/pools/flowerbeds/plazas/steps meshes
  const { surfaceMesh, propsMesh } = buildLandcoverAndRichMeshes(
    landPolys,
    ox,
    oz,
    isPointInWater,
    isPointInSunkenTrench,
    roadClearance,
    nearBuilding
  );
  if (terrainGroup) {
    if (surfaceMesh) terrainGroup.add(surfaceMesh);
    if (propsMesh) terrainGroup.add(propsMesh);
  }

  const lmSuppress = worldOrigin ? makeLandmarkSuppressor(worldOrigin) : null; // [lm-west] world-space footprint test
  // [tree-placement] beaches, dunes and bare rock carry no trees or shrubs (only back-of-beach palms, see LC_SAND below)
  const sandGrid = createGrid(25);
  for (let p = 0; p < landPolys.length; p++) {
    const [kind, outer] = landPolys[p];
    if ((kind !== LC_SAND && kind !== LC_ROCK) || !outer || outer.length < 6) continue;
    const bb = bboxOf(outer);
    sandGrid.insert(bb[0], bb[1], bb[2], bb[3], { bb, outer });
  }
  const onSandOrRock = (x, z) => {
    const list = sandGrid.query(x, z);
    for (let i = 0; i < list.length; i++) {
      const { bb, outer } = list[i];
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
      if (pointInRing(x, z, outer)) return true;
    }
    return false;
  };
  const groundOk = (x, z, roadClear, bldgClear, waterClear, allowSand = false) => {
    if (x < -500 || x >= 500 || z < -500 || z >= 500) return false;
    if (!allowSand && onSandOrRock(x, z)) return false;
    if (lmSuppress && lmSuppress(ox + x, oz + z)) return false;
    if (isPointInWater && isPointInWater(x, z, waterClear)) return false;
    if (isPointInSunkenTrench && isPointInSunkenTrench(x, z)) return false;
    if (roadClearance(x, z) < roadClear) return false;
    if (nearBuilding(x, z, bldgClear)) return false;
    if (inCourtOrPlaza(x, z, 2.0)) return false;
    return true;
  };

  const pushRaw = (sp, x, y, z, sXZ, sY, rot, r, g, b) => {
    if (count >= MAX_CHUNK_INSTANCES) return false;
    const o = count * INST_STRIDE;
    inst[o] = ox + x;
    inst[o + 1] = y;
    inst[o + 2] = oz + z;
    inst[o + 3] = sXZ;
    inst[o + 4] = sY;
    inst[o + 5] = rot;
    inst[o + 6] = r;
    inst[o + 7] = g;
    inst[o + 8] = b;
    species[count] = sp;
    count++;
    return true;
  };
  // [feature/climate-flora] palette entry -> species/color/scale after season + altitude (null look = no tree here)
  const plantTree = (e, x, z, sXZ, sY, rng, isStreetTree = false) => {
    const y = sampleTreeSurfaceY(x, z, isStreetTree);
    const lk = floraLook(ctx, e, rng(), rng(), y + baseAsl);
    if (!lk) return count < MAX_CHUNK_INSTANCES;
    return pushRaw(lk.sp, x, y, z, sXZ * lk.sx, sY * lk.sy, rng() * 6.283, lk.r, lk.g, lk.b);
  };
  const plantBush = (x, z, sXZ, sY, rng) => {
    const y = sampleTreeSurfaceY(x, z, false);
    const lk = floraBush(ctx, rng(), y + baseAsl);
    if (!lk) return count < MAX_CHUNK_INSTANCES;
    return pushRaw(SP_BUSH, x, y, z, sXZ * lk.sx, sY * lk.sy, rng() * 6.283, lk.r, lk.g, lk.b);
  };

  // --- 1. Street trees: rows on sidewalks with irregular spacing / kerb offset / age, skipping junctions & driveways ---
  // [tree-placement] each side of a street is its own row: spacing jitter +-35 %, lateral jitter, occasional gaps and
  // close pairs, saplings among mature trees. Species: one per ~140 m block segment (sometimes two compatible ones
  // alternating), changing between blocks and streets, never palms next to conifers in one row.
  const formOf = (sp) => (sp === SP_PALM || sp === SP_DATEPALM ? 1 : sp === SP_CONIFER || sp === SP_COLUMN ? 2 : sp === SP_CACTUS ? 3 : sp === SP_BANANA || sp === SP_BAMBOO ? 4 : 0);
  const plCache = new Map();
  const blockPlanting = (streetSeed, alongW, uMain) => {
    const bk = Math.floor(alongW / 140);
    const key = streetSeed * 4096 + bk;
    let pl = plCache.get(key);
    if (pl) return pl;
    const h = ihash(streetSeed | 0, bk, 31), h2 = ihash(streetSeed | 0, bk, 32);
    const u1 = (uMain + (h < 0.55 ? 0 : (h - 0.55) * 0.9)) % 1; // most blocks keep the street's species
    const e1 = pickFlora(ctx, 0, u1);
    let e2 = null;
    if (e1 && h2 > 0.7) {
      for (let k = 1; k <= 6 && !e2; k++) {
        const c = pickFlora(ctx, 0, (u1 + k * 0.137) % 1);
        if (c && c.sp !== e1.sp && formOf(c.sp) === formOf(e1.sp)) e2 = c;
      }
    }
    pl = { e1, e2 };
    plCache.set(key, pl);
    return pl;
  };
  const STREET = { trunk: 2.2, primary: 2.2, secondary: 2.2, tertiary: 2.2, residential: 1.6, living_street: 1.6, unclassified: 1.6 };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const sw = STREET[s.cls];
    if (!sw || s.bridge || s.elevated || s.sunken) continue;
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz);
    if (len < 4) continue;
    const streetSeed = hashStr(s.name || `${Math.round((s.x1 + ox) / 300)},${Math.round((s.z1 + oz) / 300)}`);
    const sr = mulberry32(streetSeed);
    if (sr() < (s.cls === 'residential' ? 0.25 : 0.1)) continue;
    if (s.hw * 2 < 7 && sr() < 0.5) continue;
    const spacing = 8 + sr() * 4;
    const mx = (s.x1 + s.x2) * 0.5, mz = (s.z1 + s.z2) * 0.5;
    const uMain = mixU(mx, mz, null, sr()); // the street's planting (drifts by neighbourhood)
    if (!pickFlora(ctx, 0, uMain) || sr() > ctx.streetDens) continue;
    const baseScale = 0.82 + sr() * 0.22;
    const nx = -dz / len, nz = dx / len;
    const off = Math.max(s.hw + 1.4, s.hw + sw * 0.68);
    const along0 = ((s.x1 + ox) * dx + (s.z1 + oz) * dz) / len;
    for (let side = -1; side <= 1; side += 2) {
      const rng = mulberry32(streetSeed ^ Math.imul(i + 1, 2654435761) ^ (side > 0 ? 0x5bd1e995 : 0));
      let d = (spacing - (((along0 % spacing) + spacing) % spacing)) % spacing;
      d += (rng() - 0.5) * spacing * 0.5;
      if (d < 0) d += spacing;
      let nTree = 0;
      for (; d < len; d += spacing * (0.65 + rng() * 0.7)) {
        if (rng() < 0.08) continue; // driveway / missing tree
        const pair = rng() < 0.06 ? 2 : 1; // two planted close together
        for (let q = 0; q < pair; q++) {
          const dd = d + q * (1.6 + rng() * 1.2);
          if (dd >= len) break;
          const t = dd / len;
          const lat = off + (rng() - 0.5) * Math.min(0.45, sw * 0.25);
          const x = s.x1 + dx * t + nx * lat * side, z = s.z1 + dz * t + nz * lat * side;
          if (nearJunction(x, z, 11)) continue;
          if (!groundOk(x, z, 1.2, 2.8, 5)) continue;
          const pl = blockPlanting(streetSeed, along0 + dd, uMain);
          const e = pl.e2 && nTree++ % 2 ? pl.e2 : pl.e1;
          if (!e) continue;
          // age: saplings, young and mature trees mixed along one row
          const age = rng();
          const ageK = age < 0.12 ? 0.45 + rng() * 0.2 : age < 0.32 ? 0.68 + rng() * 0.18 : 0.88 + rng() * 0.3;
          const sc = baseScale * ageK;
          if (!plantTree(e, x, z, sc, sc * (0.92 + rng() * 0.16), rng, true)) break;
        }
      }
    }
  }

  const streetCount = count; // [feature/street-detail] instances [0, streetCount) are procedural street trees
  // --- 2. Area vegetation from landcover + park polygons (jittered grid sampling) ---
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
    [LC_SAND]: [ctx.cum[3].total > 0 ? 1 / 700 : 0, 0, 0, 0.9, 1.2],
    [LC_FLOWERBED]: [0, 1 / 55, 0.5, 0.65, 0.95],
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

  const orchardE = orchardEntry(ctx); // [feature/climate-flora]
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
      const step = 6;
      for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
        for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
          if (!inside(x, z) || !groundOk(x, z, 1.5, 2, 2)) continue;
          const sc = 0.45 + rng() * 0.12;
          if (!plantTree(orchardE, x, z, sc, sc * 0.85, rng)) break;
        }
      }
      continue;
    }

    const [tD0, bD0, , sMin, sMax] = AREA[a.key];
    // [feature/climate-flora] biome density: natural cover follows the climate; irrigated urban greenery less so
    const natural = a.key === LC_WOOD || a.key === LC_GRASS || a.key === LC_SCRUB || a.key === LC_WETLAND;
    const role = a.key === LC_SAND ? 3 : natural ? 2 : 1;
    const dens = Math.min(1.4, natural ? ctx.dens : (ctx.dens + ctx.streetDens) * 0.5);
    const tD = tD0 * dens, bD = bD0 * Math.min(1.3, ctx.bushDens);
    const layers = [];
    if (tD > 0) layers.push([Math.sqrt(1 / tD), false]);
    if (bD > 0) layers.push([Math.sqrt(1 / bD), true]);
    // [tree-placement] clumps & clearings: tree density follows mid-frequency noise (groves with open lawns between),
    // sampled on a finer grid so the average density is unchanged; parks/woods get understorey shrubs under groves.
    const clumpy = a.key === 'park' || a.key === LC_GRASS || a.key === LC_CEMETERY || a.key === LC_INSTITUTION || a.key === LC_WOOD || a.key === LC_RESIDENTIAL;
    const clumpK = a.key === LC_WOOD ? 0.45 : 1;
    const under = a.key === 'park' || a.key === LC_WOOD || a.key === LC_CEMETERY;
    for (const [cell0, isBush] of layers) {
      const cell = !isBush && clumpy ? cell0 * 0.72 : cell0;
      for (let gz = minZ; gz < maxZ; gz += cell) {
        for (let gx = minX; gx < maxX; gx += cell) {
          const x = gx + rng() * cell, z = gz + rng() * cell;
          if (x > maxX || z > maxZ || !inside(x, z)) continue;
          if (!isBush && clumpy) {
            const ax = absX0 + x, az = absZ0 + z;
            const dn = vnoise(ax, az, 55, 21) * 0.75 + vnoise(ax, az, 18, 22) * 0.25;
            const keep = Math.min(1, Math.max(0, (dn - 0.3) / 0.35));
            if (rng() > 1 - clumpK + clumpK * keep * 1.15) continue;
          }
          if (isBush) {
            if (!groundOk(x, z, 2.0, 1.2, 3.5)) continue;
            const n = 1 + Math.floor(rng() * 3);
            for (let k = 0; k < n; k++) {
              const bx = x + (rng() - 0.5) * 3.2, bz = z + (rng() - 0.5) * 3.2;
              if (k > 0 && !groundOk(bx, bz, 2.0, 1.2, 3.5)) continue;
              const sc = 0.9 + rng() * 0.8;
              plantBush(bx, bz, sc, sc * (0.8 + rng() * 0.4), rng);
            }
          } else {
            if (a.key === LC_SAND) {
              // back-of-beach palms only: tropical climate, well away from the water, along the beachfront road
              if (!(ctx.zone === 'trop' || ctx.zone === 'sav') || !groundOk(x, z, 3.0, 2.5, 35, true) || roadClearance(x, z) > 16) continue; // next to the promenade road
              const ep = pickFlora(ctx, role, mixU(x, z, null, rng()));
              if (!ep || (ep.sp !== SP_PALM && ep.sp !== SP_DATEPALM)) continue;
              const scp = sMin + rng() * (sMax - sMin);
              plantTree(ep, x, z, scp, scp * (0.9 + rng() * 0.25), rng);
              continue;
            }
            if (!groundOk(x, z, 3.0, 2.5, 6)) continue;
            const e = pickFlora(ctx, role, mixU(x, z, null, rng()));
            const age = rng();
            const sc = (sMin + rng() * (sMax - sMin)) * (age < 0.15 ? 0.55 + rng() * 0.2 : 1);
            if (e) plantTree(e, x, z, sc, sc * (0.9 + rng() * 0.25), rng);
            if (under && e && rng() < 0.3) {
              const nb = 1 + Math.floor(rng() * 2);
              for (let k = 0; k < nb; k++) {
                const ang = rng() * 6.283, rr = 2.2 + rng() * 2.5;
                const bx = x + Math.cos(ang) * rr, bz = z + Math.sin(ang) * rr;
                if (!inside(bx, bz) || !groundOk(bx, bz, 2.0, 1.2, 1.5)) continue;
                const bs = 0.7 + rng() * 0.7;
                plantBush(bx, bz, bs, bs * (0.8 + rng() * 0.4), rng);
              }
            }
          }
          if (count >= MAX_CHUNK_INSTANCES) break;
        }
      }
    }
  }

  return {
    count, inst: inst.slice(0, count * INST_STRIDE), species: species.slice(0, count), streetCount,
    climate: { lat: latC, lon: lonC, baseAsl, cls: ctx.cls, zone: ctx.zone, region: ctx.region }, // [feature/climate-flora]
  };
}
