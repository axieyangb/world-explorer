/**
 * Vegetation & landcover — main thread.
 *
 * Pools the per-chunk tree/bush instance tables produced in the worker (src/features/vegetation_worker.js)
 * into ONE InstancedMesh per species per LOD (5 species x 2 LODs = max 10 draw calls for all vegetation):
 *   - near  (< NEAR_R): low-poly mesh, casts shadows, wind sway in the vertex shader
 *   - far   (< FAR_R) : crossed alpha-tested billboards from a procedural canvas atlas
 *   - beyond FAR_R    : culled
 * Instance buffers are rebuilt only when the camera moves > REBUILD_DIST or the loaded chunk set changes.
 *
 * Also owns `landcoverMat`, the material for the worker-built landcover ground mesh (subtle procedural texture).
 */
import * as THREE from '../../vendor/three.module.js';
import { INST_STRIDE } from './vegetation_worker.js';
import {
  SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_BUSH, SP_COLUMN, SP_UMBRELLA, SP_EUCALYPT, SP_CACTUS, SP_BANANA,
  SP_DATEPALM, SP_BIRCH, SP_BAMBOO, SP_BARE, SPECIES_COUNT, SPECIES_NAMES,
  floraContext, pickFlora, floraLook, genericEntry, hash2,
} from './flora_climate.js'; // [feature/climate-flora]

const NEAR_R = 150;
const FAR_R = 600;
const REBUILD_DIST = 20;

// Billboard sizes (width, height) per species — match the near meshes at scale 1
const BB_SIZE = {
  [SP_BROADLEAF]: [6.6, 8.6],
  [SP_TALL]: [4.4, 10.4],
  [SP_CONIFER]: [4.8, 10.6],
  [SP_PALM]: [7.4, 9.6],
  [SP_BUSH]: [2.0, 1.3],
  // [feature/climate-flora]
  [SP_COLUMN]: [2.6, 10.6],
  [SP_UMBRELLA]: [8.0, 7.4],
  [SP_EUCALYPT]: [6.4, 12.6],
  [SP_CACTUS]: [2.8, 6.6],
  [SP_BANANA]: [4.6, 3.2],
  [SP_DATEPALM]: [7.2, 10.4],
  [SP_BIRCH]: [3.6, 9.6],
  [SP_BAMBOO]: [3.4, 8.6],
  [SP_BARE]: [6.4, 8.4],
};

// ------------------------------------------------------------------------------------------------
// Near-LOD geometry (merged low-poly primitives with baked vertex colors & fake canopy AO)
// ------------------------------------------------------------------------------------------------

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Converts any geometry to non-indexed position/color arrays with a vertical color gradient. */
function part(geom, matrix, rgbBottom, rgbTop, jitter = 0) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  g.applyMatrix4(matrix);
  const p = g.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (jitter > 0) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const kx = Math.round(x * 50), ky = Math.round(y * 50), kz = Math.round(z * 50);
      p.setXYZ(
        i,
        x + (hash3(kx, ky, kz) - 0.5) * jitter,
        y + (hash3(ky, kz, kx) - 0.5) * jitter,
        z + (hash3(kz, kx, ky) - 0.5) * jitter
      );
    }
  }
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = maxY > minY ? (p.getY(i) - minY) / (maxY - minY) : 1;
    col[i * 3] = rgbBottom[0] + (rgbTop[0] - rgbBottom[0]) * t;
    col[i * 3 + 1] = rgbBottom[1] + (rgbTop[1] - rgbBottom[1]) * t;
    col[i * 3 + 2] = rgbBottom[2] + (rgbTop[2] - rgbBottom[2]) * t;
  }
  return { pos: Array.from(p.array), col: Array.from(col) };
}

function mergeParts(parts, doubleSidedParts = [], sway = 1) {
  const pos = [];
  const col = [];
  for (const pr of parts) {
    pos.push(...pr.pos);
    col.push(...pr.col);
  }
  // Double-sided parts (palm fronds): append reversed winding copy
  for (const pr of doubleSidedParts) {
    pos.push(...pr.pos);
    col.push(...pr.col);
    for (let i = 0; i < pr.pos.length; i += 9) {
      pos.push(pr.pos[i], pr.pos[i + 1], pr.pos[i + 2], pr.pos[i + 6], pr.pos[i + 7], pr.pos[i + 8], pr.pos[i + 3], pr.pos[i + 4], pr.pos[i + 5]);
      col.push(pr.col[i], pr.col[i + 1], pr.col[i + 2], pr.col[i + 6], pr.col[i + 7], pr.col[i + 8], pr.col[i + 3], pr.col[i + 4], pr.col[i + 5]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('vegSway', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(sway), 1)); // [feature/climate-flora]
  g.computeVertexNormals(); // non-indexed => faceted low-poly shading
  g.computeBoundingSphere();
  return g;
}

const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)),
    new THREE.Vector3(sx, sy, sz)
  );

const BARK = [0.30, 0.22, 0.16];
const BARK_TOP = [0.40, 0.30, 0.22];

// [feature/climate-flora] Oriented cylinder (branch) from (x,y,z): tilted `tilt` rad from vertical, then yawed. Returns end point.
function branchPart(parts, len, r0, r1, x, y, z, tilt, yaw, cBot, cTop, seg = 5) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.translate(0, len / 2, 0);
  const m = new THREE.Matrix4().makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeRotationZ(tilt));
  parts.push(part(g, m, cBot, cTop));
  const s = Math.sin(tilt);
  return [x - s * Math.cos(yaw) * len, y + Math.cos(tilt) * len, z + s * Math.sin(yaw) * len];
}

/** Frond / leaf strip: profile y(t) = up*t - droop*t^2, width W*sin(pi t), along +X then yawed. */
function frondGeom(L, W, up, droop, segs = 3) {
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    pts.push([t * L, up * t - droop * t * t, W * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.06))]);
  }
  const pos = [];
  for (let k = 0; k < segs; k++) {
    const [a0, a1, aw] = pts[k];
    const [b0, b1, bw] = pts[k + 1];
    pos.push(a0, a1, -aw, b0, b1, -bw, b0, b1, bw, a0, a1, -aw, b0, b1, bw, a0, a1, aw);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function buildClimateNearGeometry(sp) {
  const parts = [];
  const LEAF_D = [0.13, 0.27, 0.11], LEAF_L = [0.27, 0.44, 0.19];
  if (sp === SP_COLUMN) {
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.18, 1.3, 6), M(0, 0.65, 0), BARK, BARK_TOP));
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 5.4, 0, 1.15, 4.9, 1.15), [0.09, 0.22, 0.11], [0.17, 0.33, 0.16], 0.12));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(0, 9.7, 0, 0.5, 1.1, 0.5), [0.14, 0.29, 0.14], [0.19, 0.36, 0.18]));
  } else if (sp === SP_UMBRELLA) {
    parts.push(part(new THREE.CylinderGeometry(0.15, 0.26, 4.6, 6), M(0, 2.3, 0), BARK, BARK_TOP));
    for (let k = 0; k < 3; k++) branchPart(parts, 2.3, 0.12, 0.06, 0, 3.9, 0, 0.85, k * 2.1 + 0.3, BARK, BARK_TOP);
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 6.0, 0, 3.7, 1.0, 3.7), LEAF_D, LEAF_L, 0.3));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(1.5, 6.35, 0.9, 2.0, 0.7, 2.0, 0.5), LEAF_D, LEAF_L, 0.2));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(-1.3, 6.3, -1.1, 2.1, 0.75, 2.1, 1.3), LEAF_D, LEAF_L, 0.2));
  } else if (sp === SP_EUCALYPT) {
    const PALE = [0.62, 0.57, 0.5], PALE_T = [0.8, 0.76, 0.68];
    const GG = [0.27, 0.36, 0.26], GG_T = [0.46, 0.56, 0.42];
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.27, 7.6, 6), M(0, 3.8, 0), PALE, PALE_T));
    const ends = [
      branchPart(parts, 3.0, 0.11, 0.05, 0, 5.8, 0, 0.55, 0.4, PALE, PALE_T),
      branchPart(parts, 2.7, 0.1, 0.05, 0, 6.6, 0, 0.62, 2.6, PALE, PALE_T),
      branchPart(parts, 2.4, 0.1, 0.04, 0, 7.2, 0, 0.5, 4.6, PALE, PALE_T),
    ];
    for (const [x, y, z] of ends) parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(x, y + 0.5, z, 1.7, 1.25, 1.7, x), GG, GG_T, 0.3));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(0, 9.9, 0, 1.4, 1.7, 1.4), GG, GG_T, 0.3));
  } else if (sp === SP_CACTUS) {
    const C0 = [0.21, 0.37, 0.2], C1 = [0.33, 0.5, 0.28];
    parts.push(part(new THREE.CylinderGeometry(0.32, 0.38, 6.2, 8), M(0, 3.1, 0), C0, C1));
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 6.2, 0, 0.32, 0.22, 0.32), C1, C1));
    // Two arms: short horizontal elbow + vertical limb
    for (const [dir, y0, h] of [[1, 2.5, 2.2], [-1, 3.3, 1.8]]) {
      parts.push(part(new THREE.CylinderGeometry(0.19, 0.21, 0.95, 7), M(dir * 0.55, y0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)), C0, C1));
      parts.push(part(new THREE.CylinderGeometry(0.19, 0.21, h, 7), M(dir * 1.0, y0 + h / 2, 0), C0, C1));
      parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(dir * 1.0, y0 + h, 0, 0.19, 0.14, 0.19), C1, C1));
    }
    return mergeParts(parts, [], 0);
  } else if (sp === SP_BANANA) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.2, 2.4, 6), M(0, 1.2, 0), [0.4, 0.38, 0.22], [0.36, 0.44, 0.23]));
    const leaves = [];
    for (let f = 0; f < 7; f++) {
      const g = frondGeom(2.3, 0.42, 1.5, 1.25, 3);
      leaves.push(part(g, M(0, 2.3, 0, 1, 1, 1, (f / 7) * Math.PI * 2 + 0.4), [0.28, 0.52, 0.15], [0.45, 0.7, 0.25]));
    }
    return mergeParts(parts, leaves);
  } else if (sp === SP_DATEPALM) {
    parts.push(part(new THREE.CylinderGeometry(0.26, 0.33, 8.4, 7), M(0, 4.2, 0), [0.42, 0.33, 0.23], [0.52, 0.42, 0.3], 0.04));
    const fronds = [];
    for (let f = 0; f < 16; f++) {
      const upper = f < 10;
      const g = upper ? frondGeom(3.4, 0.3, 2.6, 1.9, 3) : frondGeom(3.5, 0.3, 0.6, 1.6, 3);
      fronds.push(part(g, M(0, 8.35, 0, 1, 1, 1, (f / (upper ? 10 : 6)) * Math.PI * 2 + (upper ? 0 : 0.3)), [0.26, 0.37, 0.23], [0.42, 0.52, 0.32]));
    }
    parts.push(part(new THREE.IcosahedronGeometry(0.42, 0), M(0, 8.4, 0), [0.4, 0.33, 0.2], [0.34, 0.42, 0.22]));
    return mergeParts(parts, fronds);
  } else if (sp === SP_BIRCH) {
    parts.push(part(new THREE.CylinderGeometry(0.09, 0.15, 6.2, 6), M(0, 3.1, 0), [0.8, 0.78, 0.72], [0.9, 0.88, 0.83]));
    const B0 = [0.26, 0.46, 0.16], B1 = [0.44, 0.64, 0.26];
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 6.7, 0, 1.6, 2.6, 1.6), B0, B1, 0.3));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(0.6, 8.3, 0.3, 1.0, 1.3, 1.0, 0.4), B0, B1, 0.2));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(-0.5, 5.4, -0.4, 1.1, 1.2, 1.1, 1.1), B0, B1, 0.2));
  } else if (sp === SP_BAMBOO) {
    const S0 = [0.4, 0.5, 0.2], S1 = [0.5, 0.6, 0.26], T0 = [0.26, 0.46, 0.15], T1 = [0.4, 0.6, 0.22];
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.2, r = 0.22 + (k % 3) * 0.1;
      const h = 6.4 + ((k * 37) % 5) * 0.5;
      const [ex, ey, ez] = branchPart(parts, h, 0.075, 0.05, Math.cos(a) * r, 0, Math.sin(a) * r, 0.07 + (k % 3) * 0.03, Math.PI - a, S0, S1, 5);
      parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(ex, ey - 0.6, ez, 0.85, 1.5, 0.85, a), T0, T1, 0.15));
    }
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 5.6, 0, 1.4, 2.2, 1.4), T0, T1, 0.25));
  } else if (sp === SP_BARE) {
    const B0 = [0.28, 0.22, 0.17], B1 = [0.4, 0.33, 0.26];
    parts.push(part(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 6), M(0, 1.8, 0), B0, B1));
    branchPart(parts, 3.0, 0.1, 0.04, 0, 3.4, 0, 0.12, 0, B0, B1);
    for (let k = 0; k < 5; k++) {
      const yaw = k * 1.256 + 0.3, tilt = 0.55 + (k % 3) * 0.12, len = 2.7 + (k % 2) * 0.5;
      const y0 = 2.9 + (k % 3) * 0.3;
      const s = Math.sin(tilt);
      const mx = -s * Math.cos(yaw) * len * 0.6, my = y0 + Math.cos(tilt) * len * 0.6, mz = s * Math.sin(yaw) * len * 0.6;
      branchPart(parts, len, 0.1, 0.035, 0, y0, 0, tilt, yaw, B0, B1, 4);
      branchPart(parts, 1.4, 0.04, 0.015, mx, my, mz, tilt + 0.45, yaw + 0.6, B0, B1, 3);
      branchPart(parts, 1.3, 0.04, 0.015, mx, my, mz, Math.max(0.1, tilt - 0.35), yaw - 0.5, B0, B1, 3);
    }
  }
  return mergeParts(parts);
}

function buildNearGeometry(sp) {
  if (sp >= SP_COLUMN) return buildClimateNearGeometry(sp); // [feature/climate-flora]
  const parts = [];
  if (sp === SP_BROADLEAF) {
    parts.push(part(new THREE.CylinderGeometry(0.14, 0.22, 3.4, 6), M(0, 1.7, 0), BARK, BARK_TOP));
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 5.3, 0, 3.0, 2.5, 3.0), [0.17, 0.33, 0.14], [0.36, 0.58, 0.25], 0.35));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(1.2, 6.6, 0.5, 1.7, 1.5, 1.7, 0.7), [0.22, 0.40, 0.17], [0.40, 0.62, 0.28], 0.25));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(-1.0, 6.2, -0.9, 1.6, 1.4, 1.6, 1.9), [0.20, 0.38, 0.16], [0.38, 0.60, 0.27], 0.25));
  } else if (sp === SP_TALL) {
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6), M(0, 1.6, 0), BARK, BARK_TOP));
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 6.3, 0, 2.0, 4.0, 2.0), [0.20, 0.36, 0.15], [0.42, 0.62, 0.27], 0.3));
  } else if (sp === SP_CONIFER) {
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 6), M(0, 1.2, 0), BARK, BARK_TOP));
    parts.push(part(new THREE.ConeGeometry(2.4, 4.2, 8), M(0, 3.6, 0), [0.10, 0.22, 0.13], [0.16, 0.32, 0.18]));
    parts.push(part(new THREE.ConeGeometry(1.9, 3.6, 8), M(0, 5.9, 0, 1, 1, 1, 0.4), [0.11, 0.24, 0.14], [0.18, 0.35, 0.20]));
    parts.push(part(new THREE.ConeGeometry(1.3, 3.0, 8), M(0, 8.1, 0, 1, 1, 1, 0.8), [0.12, 0.26, 0.15], [0.21, 0.39, 0.22]));
  } else if (sp === SP_PALM) {
    // Curved, segmented trunk
    let x = 0, y = 0;
    for (let i = 0; i < 4; i++) {
      const h = 2.1;
      const lean = 0.1 + i * 0.06;
      parts.push(part(new THREE.CylinderGeometry(0.17 - i * 0.015, 0.21 - i * 0.015, h, 6), M(x + Math.sin(lean) * h * 0.5, y + h * 0.5, 0, 1, 1, 1, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(-lean)), [0.44, 0.36, 0.26], [0.52, 0.44, 0.32]));
      x += Math.sin(lean) * h;
      y += Math.cos(lean) * h;
    }
    const top = [x, y];
    const fronds = [];
    for (let f = 0; f < 8; f++) {
      const ang = (f / 8) * Math.PI * 2 + 0.2;
      const pos = [];
      const L = 3.6, W = 0.55;
      const pts = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        pts.push([t * L, 0.5 * t - 1.6 * t * t, W * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08))]);
      }
      for (let k = 0; k < 3; k++) {
        const [a0, a1, aw] = pts[k];
        const [b0, b1, bw] = pts[k + 1];
        pos.push(a0, a1, -aw, b0, b1, -bw, b0, b1, bw, a0, a1, -aw, b0, b1, bw, a0, a1, aw);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fronds.push(part(g, M(top[0], top[1], 0, 1, 1, 1, ang), [0.18, 0.40, 0.14], [0.30, 0.52, 0.20]));
    }
    parts.push(part(new THREE.IcosahedronGeometry(0.35, 0), M(top[0], top[1], 0), [0.36, 0.30, 0.18], [0.30, 0.42, 0.16]));
    return mergeParts(parts, fronds);
  } else {
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), M(0, 0.45, 0, 0.95, 0.7, 0.95), [0.16, 0.30, 0.12], [0.34, 0.52, 0.22], 0.18));
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), M(0.45, 0.55, 0.25, 0.55, 0.5, 0.55, 0.6), [0.20, 0.36, 0.15], [0.38, 0.56, 0.25], 0.12));
  }
  return mergeParts(parts);
}

// ------------------------------------------------------------------------------------------------
// Far-LOD crossed billboards (procedural canvas atlas, one column per species)
// ------------------------------------------------------------------------------------------------

function buildAtlas() {
  const CW = 128, CH = 256;
  const canvas = document.createElement('canvas');
  canvas.width = CW * SPECIES_COUNT;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const shade = (base, k) => `rgb(${Math.round(base[0] * k * 255)},${Math.round(base[1] * k * 255)},${Math.round(base[2] * k * 255)})`;
  const blobCanopy = (ox, cxp, cyp, rx, ry, base, n) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd());
      const x = ox + cxp + Math.cos(a) * rx * rr * 0.8;
      const y = cyp + Math.sin(a) * ry * rr * 0.8;
      const light = 0.75 + 0.45 * (1 - (y - (cyp - ry)) / (2 * ry)) + (rnd() - 0.5) * 0.15;
      ctx.fillStyle = shade(base, light);
      ctx.beginPath();
      ctx.arc(x, y, rx * (0.22 + rnd() * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const trunk = (ox, w, y0, y1, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(ox + CW / 2 - w / 2, y0, w, y1 - y0);
  };
  // Broadleaf
  trunk(0, 7, 150, CH, '#5a4130');
  blobCanopy(0, CW / 2, 96, 56, 70, [0.26, 0.46, 0.19], 70);
  // Tall / oval
  trunk(CW, 6, 170, CH, '#5a4130');
  blobCanopy(CW, CW / 2, 104, 40, 92, [0.28, 0.48, 0.2], 70);
  // Conifer
  trunk(CW * 2, 6, 200, CH, '#4a3626');
  for (let i = 0; i < 3; i++) {
    const y0 = 20 + i * 52, y1 = 120 + i * 50, hw = 30 + i * 13;
    ctx.fillStyle = shade([0.12, 0.27, 0.15], 1.25 - i * 0.12);
    ctx.beginPath();
    ctx.moveTo(CW * 2 + CW / 2, y0);
    ctx.lineTo(CW * 2 + CW / 2 + hw, y1);
    ctx.lineTo(CW * 2 + CW / 2 - hw, y1);
    ctx.closePath();
    ctx.fill();
  }
  // Palm
  ctx.strokeStyle = '#7a6448';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(CW * 3 + CW / 2, CH);
  ctx.quadraticCurveTo(CW * 3 + CW / 2 + 4, 140, CW * 3 + CW / 2 + 14, 52);
  ctx.stroke();
  ctx.lineCap = 'round';
  for (let f = 0; f < 9; f++) {
    const a = -Math.PI + (f / 8) * Math.PI;
    const ex = CW * 3 + CW / 2 + 14 + Math.cos(a) * 58;
    const ey = 52 + Math.sin(a) * 26 + 40;
    ctx.strokeStyle = shade([0.24, 0.46, 0.17], 0.9 + (f % 3) * 0.12);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(CW * 3 + CW / 2 + 14, 52);
    ctx.quadraticCurveTo((CW * 3 + CW / 2 + 14 + ex) / 2, 30, ex, ey);
    ctx.stroke();
  }
  // Bush
  blobCanopy(CW * 4, CW / 2, 180, 58, 60, [0.24, 0.42, 0.17], 60);
  // [feature/climate-flora] Extra species columns
  const col = (sp) => CW * sp;
  // Column cypress
  trunk(col(SP_COLUMN), 6, 236, CH, '#4a3626');
  blobCanopy(col(SP_COLUMN), CW / 2, 130, 26, 112, [0.11, 0.25, 0.13], 80);
  // Umbrella pine / acacia
  trunk(col(SP_UMBRELLA), 7, 110, CH, '#5a4130');
  blobCanopy(col(SP_UMBRELLA), CW / 2, 78, 60, 26, [0.2, 0.36, 0.15], 70);
  // Eucalyptus
  trunk(col(SP_EUCALYPT), 7, 60, CH, '#b8ad98');
  for (const [x, y] of [[40, 70], [90, 56], [64, 30]]) blobCanopy(col(SP_EUCALYPT), x, y, 24, 20, [0.34, 0.44, 0.32], 22);
  // Saguaro
  ctx.fillStyle = '#46703c';
  const cx0 = col(SP_CACTUS) + CW / 2;
  ctx.fillRect(cx0 - 9, 26, 18, CH - 26);
  ctx.fillRect(cx0 + 9, 150, 22, 9);
  ctx.fillRect(cx0 + 22, 92, 9, 64);
  ctx.fillRect(cx0 - 31, 128, 22, 9);
  ctx.fillRect(cx0 - 31, 80, 9, 54);
  // Banana
  trunk(col(SP_BANANA), 9, 120, CH, '#6b7a3a');
  ctx.lineCap = 'round';
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI + (f / 6) * Math.PI;
    ctx.strokeStyle = shade([0.36, 0.62, 0.2], 0.85 + (f % 3) * 0.12);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(col(SP_BANANA) + CW / 2, 122);
    ctx.quadraticCurveTo(col(SP_BANANA) + CW / 2 + Math.cos(a) * 30, 60, col(SP_BANANA) + CW / 2 + Math.cos(a) * 56, 90 + Math.abs(Math.sin(a)) * -30);
    ctx.stroke();
  }
  // Date palm
  trunk(col(SP_DATEPALM), 10, 56, CH, '#7a6248');
  for (let f = 0; f < 13; f++) {
    const a = -Math.PI * 1.05 + (f / 12) * Math.PI * 1.1;
    ctx.strokeStyle = shade([0.33, 0.45, 0.28], 0.85 + (f % 3) * 0.12);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(col(SP_DATEPALM) + CW / 2, 58);
    ctx.quadraticCurveTo(col(SP_DATEPALM) + CW / 2 + Math.cos(a) * 36, 58 + Math.sin(a) * 40, col(SP_DATEPALM) + CW / 2 + Math.cos(a) * 60, 58 + Math.sin(a) * 18 + 22);
    ctx.stroke();
  }
  // Birch
  trunk(col(SP_BIRCH), 6, 110, CH, '#ddd8cc');
  blobCanopy(col(SP_BIRCH), CW / 2, 92, 36, 72, [0.33, 0.55, 0.2], 60);
  // Bamboo
  ctx.strokeStyle = '#7d9a3c';
  ctx.lineWidth = 4;
  for (let k = 0; k < 7; k++) {
    ctx.beginPath();
    ctx.moveTo(col(SP_BAMBOO) + 44 + k * 7, CH);
    ctx.lineTo(col(SP_BAMBOO) + 30 + k * 11, 36 + (k % 3) * 12);
    ctx.stroke();
  }
  blobCanopy(col(SP_BAMBOO), CW / 2, 86, 40, 64, [0.3, 0.52, 0.17], 60);
  // Bare deciduous
  trunk(col(SP_BARE), 8, 128, CH, '#4e3b2c');
  ctx.strokeStyle = '#5a4636';
  const twig = (x, y, a, len, w, depth) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth > 0) {
      twig(ex, ey, a - 0.45, len * 0.7, Math.max(2, w * 0.65), depth - 1);
      twig(ex, ey, a + 0.4, len * 0.68, Math.max(2, w * 0.65), depth - 1);
    }
  };
  for (const a of [-2.35, -1.95, -1.57, -1.2, -0.8]) twig(col(SP_BARE) + CW / 2, 132, a, 38, 6, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildFarGeometry(sp) {
  const [W, H] = BB_SIZE[sp];
  const u0 = sp / SPECIES_COUNT, u1 = (sp + 1) / SPECIES_COUNT;
  const pos = [];
  const uv = [];
  const nrm = [];
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * W * 0.5, dz = Math.sin(a) * W * 0.5;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, H, dz, -dx, 0, -dz, dx, H, dz, -dx, H, -dz);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    for (let i = 0; i < 6; i++) nrm.push(0, 1, 0);
  }
  if (sp === SP_BROADLEAF || sp === SP_TALL || sp === SP_BUSH || sp === SP_UMBRELLA || sp === SP_BIRCH) {
    // Horizontal canopy cap so crossed quads don't read as an "X" from above
    const r = W * (sp === SP_UMBRELLA ? 0.4 : 0.42), y = H * (sp === SP_BUSH ? 0.75 : sp === SP_UMBRELLA ? 0.8 : 0.66);
    const v0 = sp === SP_BUSH ? 0.55 : sp === SP_UMBRELLA ? 0.62 : 0.45, v1 = sp === SP_BUSH ? 0.95 : 0.9;
    pos.push(-r, y, -r, -r, y, r, r, y, r, -r, y, -r, r, y, r, r, y, -r);
    uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
    for (let i = 0; i < 6; i++) nrm.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('vegSway', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(sp === SP_CACTUS ? 0 : 1), 1));
  return g;
}

// ------------------------------------------------------------------------------------------------
// Materials
// ------------------------------------------------------------------------------------------------

// [feature/climate-flora] Shared shader uniforms: wind sway + live-wind amplitude, canopy snow, biome ground tint.
export const FLORA_UNIFORMS = {
  uWindAmp: { value: 1 },
  uVegSnow: { value: 0 },
  uGroundTint: { value: new THREE.Color(0.3, 0.5, 0.22) },
  uGroundAmt: { value: 0 },
  uSnowGround: { value: 0 },
};

/**
 * Tree materials: wind sway (per-vertex `vegSway`, scaled by live wind), per-instance tint applied to foliage only
 * (trunks/bark keep their color, so autumn/blossom tints don't paint the trunk), and snow on upward faces.
 */
function addWind(material, uniforms, far = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindAmp = FLORA_UNIFORMS.uWindAmp;
    shader.uniforms.uVegSnow = FLORA_UNIFORMS.uVegSnow;
    shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindAmp;\nattribute float vegSway;\nvarying vec3 vVegTint;\nvarying float vVegUp;\n' + shader.vertexShader
      .replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec3( 1.0 );
        #endif
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vVegTint = instanceColor.xyz;
        #else
          vVegTint = vec3( 1.0 );
        #endif`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 vegRoot = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        vVegUp = normalize(mat3(instanceMatrix) * objectNormal).y;
      #else
        vec2 vegRoot = vec2(0.0);
        vVegUp = objectNormal.y;
      #endif
      float vegH = max(position.y - 1.2, 0.0) * vegSway * uWindAmp;
      float vegPh = uWindTime * 1.25 + vegRoot.x * 0.071 + vegRoot.y * 0.053;
      float vegGust = 0.55 + 0.45 * sin(uWindTime * 0.31 + vegRoot.x * 0.004);
      transformed.x += (sin(vegPh) * 0.022 + sin(uWindTime * 3.7 + position.y * 1.7 + vegRoot.y) * 0.006) * vegH * vegGust;
      transformed.z += (cos(vegPh * 0.83 + 1.3) * 0.018) * vegH * vegGust;`
      );
    shader.fragmentShader = 'uniform float uVegSnow;\nvarying vec3 vVegTint;\nvarying float vVegUp;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float vegLeaf = smoothstep(0.0, 0.05, diffuseColor.g - diffuseColor.r);
        float vegTk = clamp(dot(vVegTint, vec3(0.3333)), 0.8, 1.12);
        diffuseColor.rgb *= mix(vec3(vegTk), vVegTint, vegLeaf);
        float vegS = uVegSnow * ${far ? '0.5' : 'smoothstep(0.1, 0.65, vVegUp)'};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), clamp(vegS, 0.0, 0.9));
      }`
    );
  };
  material.customProgramCacheKey = () => (far ? 'veg-flora-far' : 'veg-flora-near');
}

/**
 * Ground materials (terrain / parks / landcover): grass-like (green-dominant) pixels are pulled toward the biome's
 * grass hue (arid brown, dry-summer gold, winter-dormant) keeping luminance; live snow whitens the ground.
 * `k` scales the biome tint (irrigated parks get less); `mask` is an optional extra GLSL float expression.
 */
export function patchFloraGround(mat, k, key, mask = '1.0') {
  if (!mat || !mat.isMaterial || mat.userData.floraGround) return;
  mat.userData.floraGround = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uGroundTint = FLORA_UNIFORMS.uGroundTint;
    shader.uniforms.uGroundAmt = FLORA_UNIFORMS.uGroundAmt;
    shader.uniforms.uSnowGround = FLORA_UNIFORMS.uSnowGround;
    shader.fragmentShader = 'uniform vec3 uGroundTint;\nuniform float uGroundAmt;\nuniform float uSnowGround;\n' + shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `{
        vec3 fc = diffuseColor.rgb;
        float gm = smoothstep(0.0, 0.06, fc.g - max(fc.r, fc.b)) * (${mask});
        float lum = dot(fc, vec3(0.299, 0.587, 0.114));
        vec3 tgt = uGroundTint * (lum / max(dot(uGroundTint, vec3(0.299, 0.587, 0.114)), 0.05));
        fc = mix(fc, tgt, clamp(uGroundAmt * ${k.toFixed(2)}, 0.0, 1.0) * gm);
        fc = mix(fc, vec3(0.9, 0.92, 0.95), uSnowGround * (0.45 + 0.5 * gm));
        diffuseColor.rgb = fc;
      }
      #include <roughnessmap_fragment>`
    );
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + key;
  mat.needsUpdate = true;
}

export function createLandcoverMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  mat.name = 'landcoverMat';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec2 vLcWorld;\nvarying vec2 vLcInfo;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLcWorld = (modelMatrix * vec4(position, 1.0)).xz;\nvLcInfo = uv;'
    );
    shader.fragmentShader = 'varying vec2 vLcWorld;\nvarying vec2 vLcInfo;\n' + `
      float lcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lcNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(lcHash(i), lcHash(i + vec2(1.0, 0.0)), u.x), mix(lcHash(i + vec2(0.0, 1.0)), lcHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
    ` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 w = vLcWorld;
        float pat = floor(vLcInfo.x + 0.5);
        float n = lcNoise(w * 0.045) * 0.55 + lcNoise(w * 0.21) * 0.3 + lcNoise(w * 1.3) * 0.15;
        float k = 0.86 + 0.26 * n;
        if (pat == 1.0) {
          // Field rows: per-field direction from a coarse cell hash
          vec2 cell = floor(w / 170.0);
          float ang = lcHash(cell) * 3.14159;
          float d = dot(w, vec2(cos(ang), sin(ang)));
          k *= 0.93 + 0.07 * sin(d * 2.1);
          k *= 0.9 + 0.2 * lcHash(cell + 7.0);
        } else if (pat == 2.0) {
          k = 0.95 + 0.05 * sin(w.x * 0.9 + lcNoise(w * 0.3) * 6.0) + 0.04 * (n - 0.5);
        } else if (pat == 3.0) {
          vec2 g = abs(fract(w / 4.0) - 0.5);
          float line = smoothstep(0.47, 0.5, max(g.x, g.y));
          float fw = clamp(length(fwidth(w)) * 0.25, 0.0, 1.0);
          k = (0.93 + 0.12 * n) * (1.0 - line * 0.07 * (1.0 - fw));
        } else if (pat == 4.0) {
          k *= 0.8 + 0.35 * smoothstep(0.35, 0.75, lcNoise(w * 0.12 + 3.0));
        } else if (pat == 5.0) {
          // Crisp athletic court surface, white court lines & 3D sport equipment
          k = 0.985 + 0.03 * (n - 0.5);
        } else if (pat == 6.0) {
          // Turquoise swimming pool water (#22b8cf) with sunlit aqua caustic shimmer
          float c1 = sin(w.x * 2.2 + n * 4.0) * cos(w.y * 2.2 - n * 4.0);
          float caustic = max(0.0, c1 * 0.5 + 0.35 * sin((w.x + w.y) * 3.0));
          diffuseColor.rgb = clamp(diffuseColor.rgb * (0.96 + 0.08 * n) + vec3(0.15, 0.21, 0.23) * caustic, 0.0, 1.0);
          k = 1.0;
        } else if (pat == 7.0) {
          // Pedestrian stone plazas, travertine coping & 3D hillside steps
          vec2 g = abs(fract(w * 0.65) - 0.5);
          float line = smoothstep(0.45, 0.5, max(g.x, g.y));
          float tileVar = (lcHash(floor(w * 0.65)) - 0.5) * 0.06;
          k = (0.96 + 0.07 * n + tileVar) * (1.0 - line * 0.09);
        } else if (pat == 8.0) {
          // [terrain-roads] Marsh: reed tussocks with dark open-water pools reflecting the sky
          float pool = smoothstep(0.58, 0.66, lcNoise(w * 0.09 + 11.0) * 0.7 + lcNoise(w * 0.5) * 0.3);
          k *= 0.85 + 0.3 * lcNoise(w * 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb * k, vec3(0.12, 0.22, 0.26), pool);
          k = 1.0;
        } else if (pat == 9.0) {
          // [terrain-roads] Bare rock / scree: blotchy boulders with dark cracks
          float cr = abs(lcNoise(w * 0.35) - 0.5);
          k = (0.78 + 0.4 * lcNoise(w * 0.6) + 0.12 * lcHash(floor(w * 1.6))) * (1.0 - 0.35 * smoothstep(0.04, 0.0, cr));
        } else if (pat == 10.0) {
          // [terrain-roads] Glacier: wind-streaked snow with blue crevasses
          float cv = abs(sin(dot(w, vec2(0.21, 0.07)) + lcNoise(w * 0.05) * 6.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.76, 0.86), smoothstep(0.08, 0.0, cv) * 0.8);
          k = 0.96 + 0.06 * n;
        } else if (pat == 11.0) {
          // [terrain-roads] Orchard / vineyard: canopy dots in straight rows on bare soil
          vec2 cell = floor(w / 150.0);
          float ang = lcHash(cell) * 3.14159;
          vec2 r = vec2(dot(w, vec2(cos(ang), sin(ang))), dot(w, vec2(-sin(ang), cos(ang))));
          vec2 g = fract(r / vec2(2.8, 4.5)) - 0.5;
          float dotv = smoothstep(0.42, 0.22, length(g * vec2(1.0, 1.6)));
          diffuseColor.rgb = mix(vec3(0.50, 0.43, 0.31), diffuseColor.rgb * 0.85, dotv);
          k *= 0.95 + 0.1 * n;
        }
        diffuseColor.rgb *= k;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'landcover-v3'; // [terrain-roads]
  return mat;
}

// ------------------------------------------------------------------------------------------------
// VegetationSystem
// ------------------------------------------------------------------------------------------------

export class VegetationSystem {
  constructor(scene, mats) {
    this.scene = scene;
    if (mats && !mats.landcoverMat) mats.landcoverMat = createLandcoverMaterial();
    // [feature/climate-flora] biome / season / snow tint on grass-like ground
    if (mats) {
      patchFloraGround(mats.terrainMat, 1.0, '-flora-ground');
      patchFloraGround(mats.parkMat, 0.45, '-flora-ground');
      patchFloraGround(mats.landcoverMat, 0.7, '-flora-ground', 'float(floor(vLcInfo.x + 0.5) < 4.5)');
    }
    this.ctx = null; // flora context of the chunk nearest the camera
    this._climKey = '';
    this.snowOverride = null;
    this._snowTarget = 0;
    this._windAmpTarget = 1;
    this._weatherT = 0;
    this._lastSnow = null;
    this._hist = new Array(SPECIES_COUNT).fill(0);
    if (typeof window !== 'undefined') {
      window.__VEG__ = {
        stats: () => this.stats(),
        histogram: () => this.histogram(),
        climate: () => this.climate(),
        setSnow: (v, immediate = false) => {
          this.snowOverride = v == null ? null : +v;
          this._snowTarget = this.snowOverride ?? 0;
          if (immediate && this.snowOverride != null) {
            FLORA_UNIFORMS.uVegSnow.value = this._snowTarget;
            FLORA_UNIFORMS.uSnowGround.value = this._snowTarget * 0.85;
          }
          this._weatherT = 0;
        },
      };
    }
    this.uniforms = { uWindTime: { value: 0 } };
    this.root = new THREE.Group();
    this.root.name = 'vegetation';
    scene.add(this.root);

    this.nearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, side: THREE.FrontSide });
    addWind(this.nearMat, this.uniforms);
    this.farMat = new THREE.MeshStandardMaterial({
      map: buildAtlas(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
    });
    addWind(this.farMat, this.uniforms, true);

    this.buckets = [];
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      this.buckets.push({
        near: this._makeBucket(buildNearGeometry(sp), this.nearMat, 512, true),
        far: this._makeBucket(buildFarGeometry(sp), this.farMat, 2048, false),
      });
    }
    this._known = new Set();
    this._lastX = Infinity;
    this._lastZ = Infinity;
    this._lastY = Infinity;
    this._time = 0;
    this._stats = { near: 0, far: 0, total: 0, rebuildMs: 0 };
  }

  _makeBucket(geom, mat, cap, near) {
    const b = { geom, mat, cap: 0, mesh: null, near, count: 0 };
    this._allocBucket(b, cap);
    return b;
  }

  _allocBucket(b, cap) {
    if (b.mesh) {
      this.root.remove(b.mesh);
      b.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(b.geom, b.mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = b.near;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    b.mesh = mesh;
    b.cap = cap;
  }

  /** Per-frame hook. Cheap unless the camera moved far enough or chunks changed. */
  update(camera, loadedChunks, dt) {
    this._time += dt || 0;
    this.uniforms.uWindTime.value = this._time;
    // [feature/climate-flora] live weather -> canopy/ground snow + sway amplitude (polled 1 Hz, eased)
    this._weatherT -= dt || 0;
    if (this._weatherT <= 0) {
      this._weatherT = 1;
      this._pollWeather();
    }
    const U = FLORA_UNIFORMS;
    const ke = 1 - Math.exp(-(dt || 0) / 3);
    U.uVegSnow.value += (this._snowTarget - U.uVegSnow.value) * ke;
    U.uSnowGround.value = U.uVegSnow.value * 0.85;
    U.uWindAmp.value += (this._windAmpTarget - U.uWindAmp.value) * ke;
    const cp = camera.position;
    let changed = loadedChunks.size !== this._known.size;
    if (!changed) {
      for (const g of loadedChunks.values()) {
        if (!this._known.has(g)) {
          changed = true;
          break;
        }
      }
    }
    if (this.streetDetail && this.streetDetail.version !== this._sdVersion) { // [feature/street-detail] real OSM trees
      this._sdVersion = this.streetDetail.version;
      changed = true;
    }
    const dx = cp.x - this._lastX, dz = cp.z - this._lastZ;
    if (!changed && dx * dx + dz * dz < REBUILD_DIST * REBUILD_DIST && Math.abs(cp.y - this._lastY) < 25) return;
    if (changed) {
      this._known.clear();
      for (const g of loadedChunks.values()) this._known.add(g);
    }
    this._lastX = cp.x;
    this._lastZ = cp.z;
    this._lastY = cp.y;
    this._rebuild(cp, loadedChunks);
  }

  _pollWeather() {
    if (this.snowOverride != null) {
      this._snowTarget = this.snowOverride;
      return;
    }
    let st = null;
    try {
      const lw = typeof window !== 'undefined' ? window.__LIVE_WEATHER__ : null;
      st = lw ? lw.state() : null;
    } catch {
      st = null;
    }
    const atmo = typeof window !== 'undefined' && window.app && window.app.atmosphere ? window.app.atmosphere : null;
    const atmoSnow = (atmo && (atmo.snowLevel || (atmo.getState && atmo.getState().snowLevel))) || 0;
    const snowLvl = Math.max(st && st.snowLevel ? st.snowLevel : 0, atmoSnow);
    const d = (st && st.data) || null;
    const code = d && Number.isFinite(d.weatherCode) ? d.weatherCode : null;
    const isFreezingCode = (code >= 71 && code <= 77) || code === 85 || code === 86 || code === 56 || code === 57 || code === 66 || code === 67;
    const isSnowing = snowLvl > 0.05 || (d && d.snow > 0) || isFreezingCode;
    const t = d && Number.isFinite(d.tempC) ? d.tempC : null;
    const isFreezing = t != null ? t <= 1 : true;
    const now = performance.now();
    if (isSnowing) this._lastSnow = now;
    const recent = this._lastSnow != null && now - this._lastSnow < 3 * 3600e3;
    if (isSnowing) {
      this._snowTarget = Math.max(0.4, Math.min(1.0, snowLvl > 0 ? snowLvl : isFreezing ? 0.85 : 0.6));
    } else if (recent && isFreezing) {
      this._snowTarget = 0.7;
    } else {
      this._snowTarget = 0;
    }
    const ms = d && d.wind && Number.isFinite(d.wind.ms) ? d.wind.ms : 3;
    this._windAmpTarget = 0.6 + Math.min(1.8, ms / 6);
  }

  _updateClimate(cp, loadedChunks) {
    let best = null, bd = Infinity;
    for (const g of loadedChunks.values()) {
      const v = g.userData && g.userData.vegInstances;
      if (!v || !v.climate) continue;
      const d = (cp.x - g.userData.ox) ** 2 + (cp.z - g.userData.oz) ** 2;
      if (d < bd) (bd = d), (best = v.climate);
    }
    if (!best) return;
    const key = `${best.lat.toFixed(1)},${best.lon.toFixed(1)}`;
    if (key === this._climKey) return;
    this._climKey = key;
    this.ctx = floraContext(best.lat, best.lon, best.baseAsl || 0);
    const gr = this.ctx.ground;
    FLORA_UNIFORMS.uGroundTint.value.setRGB(gr.tint[0], gr.tint[1], gr.tint[2]);
    FLORA_UNIFORMS.uGroundAmt.value = gr.amt;
  }

  /** Real OSM trees: untagged (SP_AUTO) take the local palette; tagged broadleaf/tall follow the season. Cached. */
  _sdLook(t) {
    const key = `${this._sdVersion}|${this._climKey}`;
    if (this._sdLookKey === key && this._sdLookFor === t) return this._sdLookCache;
    const ctx = this.ctx;
    const n = t.count, inst = t.inst;
    const sp = new Uint8Array(n), col = new Float32Array(n * 3), scl = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const o = i * INST_STRIDE;
      const s0 = t.species[i];
      const x = inst[o], z = inst[o + 2];
      let e = null;
      if (ctx) e = s0 >= SPECIES_COUNT ? pickFlora(ctx, 0, hash2(x, z, 1)) : genericEntry(ctx, s0);
      const lk = e ? floraLook(ctx, e, hash2(x, z, 2), hash2(x, z, 3), 0) : null;
      const k = lk ? [lk.r, lk.g, lk.b] : [1, 1, 1];
      sp[i] = lk ? lk.sp : s0 >= SPECIES_COUNT ? SP_BROADLEAF : s0;
      col[i * 3] = inst[o + 6] * k[0];
      col[i * 3 + 1] = inst[o + 7] * k[1];
      col[i * 3 + 2] = inst[o + 8] * k[2];
      scl[i * 2] = lk ? lk.sx : 1;
      scl[i * 2 + 1] = lk ? lk.sy : 1;
    }
    this._sdLookKey = key;
    this._sdLookFor = t;
    this._sdLookCache = { inst, species: sp, count: n, col, scl };
    return this._sdLookCache;
  }

  histogram() {
    const out = {};
    for (let sp = 0; sp < SPECIES_COUNT; sp++) if (this._hist[sp]) out[SPECIES_NAMES[sp]] = this._hist[sp];
    return out;
  }

  climate() {
    const c = this.ctx;
    if (!c) return null;
    return {
      cls: c.cls, zone: c.zone, region: c.region, coastal: c.coastal, lat: +c.lat.toFixed(3), lon: +c.lon.toFixed(3), doy: c.doy, de: c.de,
      seasonal: c.seasonal, treeline: Math.round(c.treeline), ground: { tint: c.ground.tint.map((v) => +v.toFixed(2)), amt: +c.ground.amt.toFixed(2) },
      palette: c.entries.map((e) => `${SPECIES_NAMES[e.sp]}:${e.w}`), snow: +FLORA_UNIFORMS.uVegSnow.value.toFixed(2), windAmp: +FLORA_UNIFORMS.uWindAmp.value.toFixed(2),
    };
  }

  _rebuild(cp, loadedChunks) {
    const t0 = performance.now();
    this._updateClimate(cp, loadedChunks); // [feature/climate-flora]
    const counts = new Array(SPECIES_COUNT * 2).fill(0);
    const far2 = FAR_R * FAR_R;
    const near2 = NEAR_R * NEAR_R;
    const tables = [];
    for (const g of loadedChunks.values()) {
      const v = g.userData && g.userData.vegInstances;
      if (!v || !v.count) continue;
      const { ox, oz } = g.userData;
      // Chunk square vs. cull circle
      const ddx = Math.max(0, Math.abs(cp.x - ox) - 500), ddz = Math.max(0, Math.abs(cp.z - oz) - 500);
      if (ddx * ddx + ddz * ddz > far2) continue;
      tables.push(v);
    }
    const sd = this.streetDetail; // [feature/street-detail] real OSM trees + drop procedural street trees next to them
    if (sd && sd.trees) tables.push(this._sdLook(sd.trees)); // [feature/climate-flora] palette/season for real trees
    const treeSup = sd ? sd.treeSuppress : null;
    // Pass 1: classify & count
    const cls = [];
    for (const v of tables) {
      const { inst, species, count } = v;
      const c = new Int8Array(count);
      const nStreet = treeSup ? v.streetCount || 0 : 0; // [feature/street-detail]
      for (let i = 0; i < count; i++) {
        const o = i * INST_STRIDE;
        const hx = inst[o] - cp.x, hz = inst[o + 2] - cp.z;
        const h2 = hx * hx + hz * hz;
        if (h2 > far2 || (i < nStreet && treeSup.near(inst[o], inst[o + 2]))) {
          c[i] = -1;
          continue;
        }
        const hy = inst[o + 1] - cp.y;
        const lod = h2 + hy * hy < near2 ? 0 : 1;
        if (species[i] >= SPECIES_COUNT) {
          c[i] = -1;
          continue;
        }
        c[i] = lod;
        counts[species[i] * 2 + lod]++;
      }
      cls.push(c);
    }
    // Grow buckets if needed
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      for (let lod = 0; lod < 2; lod++) {
        const b = lod === 0 ? this.buckets[sp].near : this.buckets[sp].far;
        const need = counts[sp * 2 + lod];
        if (need > b.cap) this._allocBucket(b, Math.max(need, b.cap * 2));
        b.count = 0;
      }
    }
    // Pass 2: write matrices & colors
    for (let t = 0; t < tables.length; t++) {
      const { inst, species, count, col, scl } = tables[t];
      const c = cls[t];
      for (let i = 0; i < count; i++) {
        const lod = c[i];
        if (lod < 0) continue;
        const sp = species[i];
        const b = lod === 0 ? this.buckets[sp].near : this.buckets[sp].far;
        const o = i * INST_STRIDE;
        const k = b.count++;
        const m = b.mesh.instanceMatrix.array;
        const mo = k * 16;
        let s = inst[o + 3], sy = inst[o + 4];
        const r = inst[o + 5];
        if (scl) (s *= scl[i * 2]), (sy *= scl[i * 2 + 1]);
        const cr = Math.cos(r) * s, sr = Math.sin(r) * s;
        m[mo] = cr; m[mo + 1] = 0; m[mo + 2] = -sr; m[mo + 3] = 0;
        m[mo + 4] = 0; m[mo + 5] = sy; m[mo + 6] = 0; m[mo + 7] = 0;
        m[mo + 8] = sr; m[mo + 9] = 0; m[mo + 10] = cr; m[mo + 11] = 0;
        m[mo + 12] = inst[o]; m[mo + 13] = inst[o + 1]; m[mo + 14] = inst[o + 2]; m[mo + 15] = 1;
        const ca = b.mesh.instanceColor.array;
        const cs = col || inst, co = col ? i * 3 : o + 6;
        ca[k * 3] = cs[co];
        ca[k * 3 + 1] = cs[co + 1];
        ca[k * 3 + 2] = cs[co + 2];
      }
    }
    for (let sp = 0; sp < SPECIES_COUNT; sp++) this._hist[sp] = counts[sp * 2] + counts[sp * 2 + 1];
    let near = 0, far = 0;
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      for (const b of [this.buckets[sp].near, this.buckets[sp].far]) {
        const mesh = b.mesh;
        mesh.count = b.count;
        mesh.visible = b.count > 0;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, b.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, b.count * 3);
        mesh.instanceColor.needsUpdate = true;
        if (b.near) near += b.count;
        else far += b.count;
      }
    }
    this._stats = { near, far, total: near + far, rebuildMs: +(performance.now() - t0).toFixed(2) };
  }

  stats() {
    let drawCalls = 0;
    for (const b of this.buckets) drawCalls += (b.near.mesh.visible ? 1 : 0) + (b.far.mesh.visible ? 1 : 0);
    return { ...this._stats, drawCalls };
  }
}
