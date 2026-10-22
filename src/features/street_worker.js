// [feature/street] Worker-side generator for street furniture placements and road detail geometry.
// Runs inside the chunk Web Worker (and in the main-thread fallback build path).
// Output (attached to chunk root.userData.street and forwarded in the worker payload):
//   { region, types: { <type>: Float32Array[x,y,z,rotY,scaleX]* }, heads: Float32Array[x,y,z,rotY,groundY]*,
//     signals: Float32Array[x,y,z,rotY,axis,nodeX,nodeZ,horizontal]*, signalNodes: Float32Array[x,z]* }
// All coordinates are chunk-local (add ox/oz for world). Road detail meshes (lines, crosswalks, stop lines,
// tire wear, curbs) are appended to subGroups.markings.
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
// Mirrors ROAD_Y_BIAS in chunk_builder.js (fallback surface height when no segment is found)
const Y_BIAS = {
  service: 0.38, residential: 0.43, tertiary_link: 0.48, tertiary: 0.52, secondary_link: 0.57, secondary: 0.62,
  primary_link: 0.68, primary: 0.74, trunk_link: 0.8, trunk: 0.86, motorway_link: 0.83, motorway: 0.92,
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

function hash2(x, z) {
  let h = (Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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
  const region = resolveStreetRegion(worldOrigin || currentOrigin);
  const style = REGION_STYLE[region] || REGION_STYLE.intl;
  const ud = root.userData;
  const segsW = ud.roadSegments || [];
  const colliders = ud.buildingColliders || [];

  // ---- 1. Local segment list + spatial grid ----
  const segs = [];
  const segGrid = makeGrid(24);
  for (let i = 0; i < segsW.length; i++) {
    const s = segsW[i];
    const x1 = s.x1 - ox, z1 = s.z1 - oz, x2 = s.x2 - ox, z2 = s.z2 - oz;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) continue;
    const ls = { x1, y1: s.y1, z1, x2, y2: s.y2, z2, len, dx: (x2 - x1) / len, dz: (z2 - z1) / len,
      hw: Math.max(1.0, s.width * 0.5), cls: s.cls, id: s.id, lanes: s.lanes, oneway: s.oneway, bridge: s.bridge };
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
  // (Z14 vector tiles do not guarantee shared vertices, so test segment pairs with an endpoint tolerance.)
  const nodeMap = new Map();
  const roads = data.roads || [];
  const ways = [];
  const rawGrid = makeGrid(32);
  for (let r = 0; r < roads.length; r++) {
    const [wid, cls, , , lanes, widthM, oneway, isBridge, isTunnel, , flat] = roads[r];
    if (!STREET_CLS.has(cls) || isBridge || isTunnel || !flat || flat.length < 6) continue;
    const n = flat.length / 3;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(flat[i * 3] - flat[i * 3 - 3], flat[i * 3 + 2] - flat[i * 3 - 1]);
    const w = { wid, cls, lanes, hw: Math.max(1.0, widthM * 0.5), oneway, flat, n, cum, total: cum[n - 1], idx: ways.length };
    ways.push(w);
    for (let i = 0; i < n - 1; i++) {
      const x1 = flat[i * 3], z1 = flat[i * 3 + 2], x2 = flat[i * 3 + 3], z2 = flat[i * 3 + 5];
      if (Math.max(x1, x2) < -510 || Math.min(x1, x2) > 510 || Math.max(z1, z2) < -510 || Math.min(z1, z2) > 510) continue;
      rawGrid.insertBox(Math.min(x1, x2) - 1, Math.min(z1, z2) - 1, Math.max(x1, x2) + 1, Math.max(z1, z2) + 1, [w, i]);
    }
  }
  // Direction of way `w` leaving arc-length position `d` towards +1 / -1, sampled ~7m away
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
        node.arms.push({ ax: v[0], az: v[1], hw: w.hw, cls: w.cls, lanes: w.lanes, oneway: w.oneway, forward: dir > 0, id: w.wid, total: avail });
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
          if (Math.abs(den) < 1e-6 * la * lb || Math.abs(den) / (la * lb) < 0.26) continue; // parallel / grazing (< ~15 deg)
          const qx = bx1 - ax1, qz = bz1 - az1;
          const t = (qx * sZ - qz * sX) / den;
          const u = (qx * rZ - qz * rX) / den;
          const ea = 1.5 / la, eb = 1.5 / lb; // endpoint tolerance (T-junction gaps)
          if (t < -ea || t > 1 + ea || u < -eb || u > 1 + eb) continue;
          // Endpoint overshoot only allowed at the way's real ends
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
  // Merge clustered nodes (dual carriageways produce node pairs a few meters apart): keep the widest
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
  // Parameter intervals of segment [0..1] that lie outside all intersection discs (radius R + pad)
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

  // ---- 3. Road detail geometry ----
  const lines = new GeoBuf();
  const wear = new GeoBuf();
  const curbs = new GeoBuf();
  const centerRgb = style.center === 'yellow' ? YELLOW : WHITE;

  // Strip along segment between params [ta, tb] at lateral offset `off` (right = +), half width `w`
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
  const runInfo = []; // per segment accumulated distance (for furniture spacing)
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.id !== runId || Math.hypot(s.x1 - runEndX, s.z1 - runEndZ) > 0.6) {
      runId = s.id;
      // seed with a way-dependent phase so cross-chunk runs don't all start at zero
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
            // vertical face toward the road
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
  }

  // ---- 4. Intersections: crosswalks, stop lines, traffic signals, bollards ----
  const types = {};
  const push = (type, x, y, z, rot, sx = 1) => {
    let a = types[type];
    if (!a) types[type] = a = [];
    a.push(x, y, z, rot, sx);
  };
  const heads = [];
  const signals = [];
  const signalNodes = [];
  const occupied = new Set();
  const occKey = (x, z) => `${Math.floor(x / 1.5)},${Math.floor(z / 1.5)}`;
  const isFree = (x, z) => {
    const cx = Math.floor(x / 1.5), cz = Math.floor(z / 1.5);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (occupied.has(`${cx + dx},${cz + dz}`)) return false;
    return true;
  };
  const occupy = (x, z) => occupied.add(occKey(x, z));
  const inChunk = (x, z) => x >= -499.5 && x < 499.5 && z >= -499.5 && z < 499.5;
  const rotFor = (ux, uz) => Math.atan2(-uz, ux); // local +X -> (ux, uz)

  for (const node of keptNodes) {
    if (!inChunk(node.x, node.z)) continue;
    const signalized = node.majors >= 1 && node.arms.some((a) => a.cls === 'primary' || a.cls === 'secondary' || a.cls === 'trunk' || (a.cls === 'tertiary' && node.majors >= 2));
    let anySignal = false;
    for (const arm of node.arms) {
      if (!SIDEWALK_CLS.has(arm.cls) && arm.cls !== 'trunk' && arm.cls !== 'unclassified' && arm.cls !== 'living_street') continue;
      const hw = arm.hw;
      if (hw < 2.5) continue;
      const cwLen = MAJOR_CLS.has(arm.cls) ? 4.0 : 3.0;
      const c0 = node.R + 0.4;
      const c1 = c0 + cwLen;
      if (arm.total < c1 + 1.5) continue;
      const ax = arm.ax, az = arm.az;
      const rx = -az, rz = ax; // right of arm direction (outbound)
      // Zebra stripes parallel to the arm, spaced across the road
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
      // Inbound half (traffic approaching the node travels along -arm; drives on right of travel = -r of arm)
      const inboundSign = style.left ? 1 : -1; // lateral side of inbound lanes in arm-right coordinates
      const outboundOnly = arm.oneway && arm.forward; // geometry flows away from node
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

      // Traffic signal: pole at the near-side corner on the inbound driving side, mast arm over inbound lanes
      if (signalized && !outboundOnly) {
        const sideSign = inboundSign; // driver-side curb of the approaching lanes
        const pd = c1 + 1.6;
        const px = node.x + ax * pd + rx * sideSign * (hw + 0.7);
        const pz = node.z + az * pd + rz * sideSign * (hw + 0.7);
        if (inChunk(px, pz) && !onOtherRoad(px, pz, arm.id, 0.3)) {
          const gy = roadY(arm.id, arm.cls, px, pz) + 0.04;
          const uX = -rx * sideSign, uZ = -rz * sideSign; // toward road center
          const inboundW = inboundOnly ? hw * 2 : hw;
          const armLen = Math.max(2.5, Math.min(7.5, inboundW * 0.6 + 0.7));
          push('tlPole', px, gy, pz, rotFor(uX, uZ));
          push('tlArm', px, gy, pz, rotFor(uX, uZ), armLen);
          const hx = px + uX * armLen, hz = pz + uZ * armLen;
          const horiz = style.sigH ? 1 : 0;
          push(horiz ? 'tlHeadH' : 'tlHeadV', hx, gy + 5.6, hz, rotFor(ax, az));
          const axis = Math.abs(ax) > Math.abs(az) ? 1 : 0; // 1 = E-W approach, 0 = N-S approach
          signals.push(hx, gy + 5.6, hz, rotFor(ax, az), axis, node.x, node.z, horiz);
          occupy(px, pz);
          anySignal = true;
        }
      }
    }
    if (anySignal) signalNodes.push(node.x, node.z);
  }

  // ---- 5. Sidewalk furniture along ways ----
  const dbg = { segs: 0, tries: 0, node: 0, road: 0, bldg: 0, occ: 0, nodes: keptNodes.length };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const isHighway = s.cls === 'trunk' || s.cls === 'motorway';
    if (!(SIDEWALK_CLS.has(s.cls) && !s.bridge) && !isHighway) continue;
    dbg.segs++;
    const terrMid = getBeijingTerrainElevation(ox + (s.x1 + s.x2) * 0.5, oz + (s.z1 + s.z2) * 0.5);
    if (!isHighway && (s.y1 + s.y2) * 0.5 - terrMid > 1.6) continue;
    const acc0 = runInfo[i];
    const acc1 = acc0 + s.len;
    const swW = s.cls === 'residential' ? 1.6 : 2.2;
    const wide = s.hw * 2 >= 8;
    const rx = -s.dz, rz = s.dx;

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

    // Highway lights: single-arm poles on the outer edge, no sidewalk furniture
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
      continue;
    }

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
        // Bulb positions (must match lamp models in street_furniture.js)
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
        let side = k % 2 === 0 ? 1 : -1; // + = right of segment direction
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
    if (m1) groups.markings.add(m1);
    if (m2) groups.markings.add(m2);
    if (m3) {
      m3.geometry.deleteAttribute('normal'); // curb faces need real normals
      m3.geometry.computeVertexNormals();
      groups.markings.add(m3);
    }
  }

  const outTypes = {};
  for (const [k, arr] of Object.entries(types)) outTypes[k] = new Float32Array(arr);
  return {
    region,
    stride: STRIDE,
    types: outTypes,
    heads: new Float32Array(heads),
    signals: new Float32Array(signals),
    signalNodes: new Float32Array(signalNodes),
    debug: dbg,
  };
}

export const STREET_STRIDES = { STRIDE, SIG_STRIDE, HEAD_STRIDE };
