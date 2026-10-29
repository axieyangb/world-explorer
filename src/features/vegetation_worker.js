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
import { getBeijingTerrainElevation, getBeijingDemState, snowCover } from '../environment.js';
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

/** Emits a perimeter foundation curb/coping around `outer` from `botY` to `topY` with width `w`. */
function pushRingPerimeterCurb(buf, outer, ox, oz, yOffTop, curbRise, width, rgb, pat, kind) {
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

/** Emits a planted floral clump at `(x, y, z)`: a low uneven cone whose facets alternate leaf green and
 *  blossom colour, plus three tiny blossoms on top. About 11 triangles: flowerbeds include every mapped
 *  garden, so this runs tens of thousands of times per city. */
function pushFlowerCluster3D(buf, x, y, z, r, h, flowerRgb, pat, kind, rng) {
  const N = 6;
  const leaf = [0.16 + rng() * 0.06, 0.40 + rng() * 0.12, 0.16 + rng() * 0.05];
  const tx = x + (rng() - 0.5) * r * 0.3, tz = z + (rng() - 0.5) * r * 0.3, ty = y + h;
  const a0 = rng() * Math.PI * 2;
  let px = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const a = a0 + (i / N) * Math.PI * 2, rr = r * (0.85 + rng() * 0.3);
    const cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr;
    if (i > 0) {
      const ma = a - Math.PI / N, nx = Math.cos(ma) * 0.6, nz = Math.sin(ma) * 0.6;
      const t = 0.85 + rng() * 0.3;
      const c = i % 2 ? leaf : [Math.min(1, flowerRgb[0] * t), Math.min(1, flowerRgb[1] * t), Math.min(1, flowerRgb[2] * t)];
      pushTri(buf, cx, y, cz, px, y, pz, tx, ty, tz, nx, 0.8, nz, c, pat, kind);
    }
    px = cx; pz = cz;
  }
  for (let k = 0; k < 3; k++) {
    const a = rng() * Math.PI * 2, d = rng() * r * 0.45, ps = 0.09 + rng() * 0.05;
    const bx = tx + Math.cos(a) * d, bz = tz + Math.sin(a) * d, by = ty - d * 0.4 + 0.02;
    pushTri(buf, bx - ps, by, bz - ps * 0.6, bx + ps, by, bz - ps * 0.6, bx, by, bz + ps, 0, 1, 0, flowerRgb, pat, kind);
  }
}

/** Emits 3D stepped stone staircase treads and flanking cheek walls along a `steps` polyline. */
function buildStepsPolyline3D(propsBuf, flatLine, widthM, ox, oz) {
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

    // 3D Hillside Steps (`LC_STEPS` is a polyline `[x0, z0, x1, z1, ...]`)
    if (kind === LC_STEPS) {
      if (outer.length >= 4) {
        buildStepsPolyline3D(propsBuf, outer, meta?.width || 3.2, ox, oz);
      }
      continue;
    }

    if (outer.length < 6) continue;

    // Guard synthetic POI-only courts/pools against road or building overlap
    if (meta?.synthetic) {
      const bb = bboxOf(outer);
      const mcx = (bb[0] + bb[2]) * 0.5;
      const mcz = (bb[1] + bb[3]) * 0.5;
      if (roadClearance && roadClearance(mcx, mcz) < 1.5) continue;
      if (nearBuilding && nearBuilding(mcx, mcz, 1.5)) continue;
      if (kind !== LC_SWIMMING_POOL && isPointInWater && isPointInWater(mcx, mcz, 1.0)) continue;
    }

    const [baseRgb, yOff, pattern] = style;

    // Choose base apron color per sport for LC_PITCH
    let polyRgb = baseRgb;
    let resolvedSport = meta?.sport || '';
    let obb = null;
    if (kind === LC_PITCH || kind === LC_TRACK || kind === LC_PLAYGROUND || kind === LC_SWIMMING_POOL) {
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
        else if (resolvedSport === 'skateboard') polyRgb = [0.62, 0.61, 0.58];
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
      if (kind !== LC_SWIMMING_POOL && isPointInWater && isPointInWater(mx, mz, 0)) continue;
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
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.04, 0.32, [0.82, 0.79, 0.73], 7, kind);
    } else if (kind === LC_FLOWERBED) {
      // Low stone garden edging + vibrant red/yellow/magenta/violet 3D floral cluster mounds
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.06, 0.25, [0.68, 0.65, 0.60], 7, kind);
      const bb = bboxOf(outer);
      const rng = mulberry32(((p * 4999 + 19) * 2654435761) ^ Math.round(ox + bb[0]));
      const step = 2.6;
      let clusterCount = 0;
      for (let gz = bb[1] + 0.8; gz <= bb[3] - 0.8 && clusterCount < 64; gz += step) {
        for (let gx = bb[0] + 0.8; gx <= bb[2] - 0.8 && clusterCount < 64; gx += step) {
          const fx = gx + (rng() - 0.5) * 1.4;
          const fz = gz + (rng() - 0.5) * 1.4;
          if (!pointInRing(fx, fz, outer)) continue;
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
    } else if (kind === LC_TRACK && obb && obb.hl <= 130) {
      const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.02, 0.35, [0.78, 0.76, 0.72], 7, kind);
      // White lane oval markings
      const white = [0.96, 0.96, 0.95];
      for (const frac of [0.92, 0.84, 0.76]) {
        pushObbHollowRect(surfBuf, obb, -obb.hl * frac, -obb.hw * frac, obb.hl * frac, obb.hw * frac, 0.14, topY + 0.012, white, 5, kind);
      }
      if (!holes || holes.length === 0) {
        pushObbRect(surfBuf, obb, -obb.hl * 0.68, -obb.hw * 0.62, obb.hl * 0.68, obb.hw * 0.62, topY + 0.006, [0.20, 0.52, 0.24], 5, kind);
      }
    } else if (kind === LC_PLAYGROUND && obb && obb.hl <= 80) {
      const { topY } = sampleFlatCourtElev(obb, ox, oz, yOff);
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.03, 0.30, [0.82, 0.80, 0.76], 7, kind);
      buildPlaygroundDetails(surfBuf, propsBuf, obb, topY);
    } else if (kind === LC_PITCH && obb && obb.hl <= 120) {
      pushRingPerimeterCurb(propsBuf, outer, ox, oz, yOff, 0.02, 0.32, [0.76, 0.75, 0.72], 7, kind);
      const pois = meta?.pois || [];
      // If a compound multi-court enclosure contains multiple distinct court POIs, render each sub-court at its POI
      const courtPois = pois.filter((pt) => pt[2] !== 'soccer' && pt[2] !== 'baseball');
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
          if (sSport === 'tennis' || sSport === 'badminton' || sSport === 'pickleball' || sSport === 'volleyball' || sSport === 'table_tennis') {
            buildNetCourt(surfBuf, propsBuf, subObb, topY, sSport);
          } else {
            buildBasketballCourt(surfBuf, propsBuf, subObb, topY, botY);
          }
        }
      } else {
        const { topY, botY } = sampleFlatCourtElev(obb, ox, oz, yOff);
        if (resolvedSport === 'soccer') {
          buildSoccerPitch(surfBuf, propsBuf, obb, topY);
        } else if (resolvedSport === 'baseball') {
          buildBaseballDiamond(surfBuf, propsBuf, obb, topY);
        } else if (
          resolvedSport === 'tennis' ||
          resolvedSport === 'badminton' ||
          resolvedSport === 'pickleball' ||
          resolvedSport === 'volleyball' ||
          resolvedSport === 'table_tennis'
        ) {
          buildNetCourt(surfBuf, propsBuf, obb, topY, resolvedSport);
        } else {
          buildBasketballCourt(surfBuf, propsBuf, obb, topY, botY);
        }
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
  const junctionGrid = createGrid(40);
  const nodeDeg = new Map();
  const segs = [];
  for (const r of data.roads || []) {
    const [, cls, name, , , widthM, , isBridge, isTunnel, , flat] = r;
    if (isTunnel || !flat || flat.length < 6) continue;
    const hw = Math.max(1.0, (widthM || 4) * 0.5);
    for (let i = 0; i + 5 < flat.length; i += 3) {
      const x1 = flat[i], z1 = flat[i + 2], x2 = flat[i + 3], z2 = flat[i + 5];
      if (Math.max(x1, x2) < -530 || Math.min(x1, x2) > 530 || Math.max(z1, z2) < -530 || Math.min(z1, z2) > 530) continue;
      const seg = { x1, z1, x2, z2, hw, cls, bridge: isBridge, name: name || '' };
      segs.push(seg);
      roadGrid.insert(Math.min(x1, x2) - hw - 4, Math.min(z1, z2) - hw - 4, Math.max(x1, x2) + hw + 4, Math.max(z1, z2) + hw + 4, seg);
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

  // Spatial exclusion grid so trees are never planted inside courts, running tracks, pools, or plazas
  const courtGrid = createGrid(25);
  for (let p = 0; p < landPolys.length; p++) {
    const [kind, outer] = landPolys[p];
    if (kind === LC_PITCH || kind === LC_TRACK || kind === LC_PLAYGROUND || kind === LC_SWIMMING_POOL || kind === LC_PLAZA) {
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
  const groundOk = (x, z, roadClear, bldgClear, waterClear) => {
    if (x < -500 || x >= 500 || z < -500 || z >= 500) return false;
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
    inst[o + 1] = y - 0.05;
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
  const plantTree = (e, x, z, sXZ, sY, rng) => {
    const y = getBeijingTerrainElevation(ox + x, oz + z);
    const lk = floraLook(ctx, e, rng(), rng(), y + baseAsl);
    if (!lk) return count < MAX_CHUNK_INSTANCES;
    return pushRaw(lk.sp, x, y, z, sXZ * lk.sx, sY * lk.sy, rng() * 6.283, lk.r, lk.g, lk.b);
  };
  const plantBush = (x, z, sXZ, sY, rng) => {
    const y = getBeijingTerrainElevation(ox + x, oz + z);
    const lk = floraBush(ctx, rng(), y + baseAsl);
    if (!lk) return count < MAX_CHUNK_INSTANCES;
    return pushRaw(SP_BUSH, x, y, z, sXZ * lk.sx, sY * lk.sy, rng() * 6.283, lk.r, lk.g, lk.b);
  };

  // --- 1. Street trees: rows on sidewalks with irregular spacing / kerb offset / age, skipping junctions & driveways ---
  // [tree-placement] each side of a street is its own row: spacing jitter +-35 %, lateral jitter, occasional gaps and
  // close pairs, saplings among mature trees, and a 2-4 species mix drifting along the street.
  const STREET = { trunk: 2.2, primary: 2.2, secondary: 2.2, tertiary: 2.2, residential: 1.6, living_street: 1.6, unclassified: 1.6 };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const sw = STREET[s.cls];
    if (!sw || s.bridge) continue;
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz);
    if (len < 4) continue;
    const streetSeed = hashStr(s.name || `${Math.round((s.x1 + ox) / 300)},${Math.round((s.z1 + oz) / 300)}`);
    const sr = mulberry32(streetSeed);
    if (sr() < (s.cls === 'residential' ? 0.25 : 0.1)) continue;
    if (s.hw * 2 < 7 && sr() < 0.5) continue;
    const spacing = 8 + sr() * 4;
    const mx = (s.x1 + s.x2) * 0.5, mz = (s.z1 + s.z2) * 0.5;
    const uMain = mixU(mx, mz, null, sr()); // the street's dominant planting
    const uAlt = (uMain + 0.3 + sr() * 0.45) % 1; // a second species (replacements, other side)
    const pMain = 0.45 + sr() * 0.3;
    if (!pickFlora(ctx, 0, uMain) || sr() > ctx.streetDens) continue;
    const baseScale = 0.82 + sr() * 0.22;
    const nx = -dz / len, nz = dx / len;
    const off = s.hw + sw * 0.55;
    const along0 = ((s.x1 + ox) * dx + (s.z1 + oz) * dz) / len;
    for (let side = -1; side <= 1; side += 2) {
      const rng = mulberry32(streetSeed ^ Math.imul(i + 1, 2654435761) ^ (side > 0 ? 0x5bd1e995 : 0));
      const sideMain = side > 0 || rng() < 0.7 ? uMain : uAlt;
      let d = (spacing - (((along0 % spacing) + spacing) % spacing)) % spacing;
      d += (rng() - 0.5) * spacing * 0.5;
      if (d < 0) d += spacing;
      for (; d < len; d += spacing * (0.65 + rng() * 0.7)) {
        if (rng() < 0.08) continue; // driveway / missing tree
        const pair = rng() < 0.06 ? 2 : 1; // two planted close together
        for (let q = 0; q < pair; q++) {
          const dd = d + q * (1.6 + rng() * 1.2);
          if (dd >= len) break;
          const t = dd / len;
          const lat = off + (rng() - 0.5) * Math.min(0.9, sw * 0.5);
          const x = s.x1 + dx * t + nx * lat * side, z = s.z1 + dz * t + nz * lat * side;
          if (nearJunction(x, z, 11)) continue;
          if (!groundOk(x, z, 0.5, 2.8, 2.5)) continue;
          const pick = rng();
          const u = pick < pMain ? sideMain : pick < pMain + 0.3 ? uAlt : mixU(x, z, null, rng());
          const e = pickFlora(ctx, 0, u);
          if (!e) continue;
          // age: saplings, young and mature trees mixed along one row
          const age = rng();
          const ageK = age < 0.12 ? 0.45 + rng() * 0.2 : age < 0.32 ? 0.68 + rng() * 0.18 : 0.88 + rng() * 0.3;
          const sc = baseScale * ageK;
          if (!plantTree(e, x, z, sc, sc * (0.92 + rng() * 0.16), rng)) break;
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
            if (!groundOk(x, z, 2.0, 1.2, 1.5)) continue;
            const n = 1 + Math.floor(rng() * 3);
            for (let k = 0; k < n; k++) {
              const bx = x + (rng() - 0.5) * 3.2, bz = z + (rng() - 0.5) * 3.2;
              if (k > 0 && !groundOk(bx, bz, 2.0, 1.2, 1.5)) continue;
              const sc = 0.9 + rng() * 0.8;
              plantBush(bx, bz, sc, sc * (0.8 + rng() * 0.4), rng);
            }
          } else {
            if (!groundOk(x, z, 3.0, 2.5, 3)) continue;
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
