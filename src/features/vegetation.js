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
import { INST_STRIDE, SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_BUSH } from './vegetation_worker.js';

const NEAR_R = 150;
const FAR_R = 600;
const REBUILD_DIST = 20;
const SPECIES_COUNT = 5;

// Billboard sizes (width, height) per species — match the near meshes at scale 1
const BB_SIZE = {
  [SP_BROADLEAF]: [6.6, 8.6],
  [SP_TALL]: [4.4, 10.4],
  [SP_CONIFER]: [4.8, 10.6],
  [SP_PALM]: [7.4, 9.6],
  [SP_BUSH]: [2.0, 1.3],
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

function mergeParts(parts, doubleSidedParts = []) {
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

function buildNearGeometry(sp) {
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
  if (sp === SP_BROADLEAF || sp === SP_TALL || sp === SP_BUSH) {
    // Horizontal canopy cap so crossed quads don't read as an "X" from above
    const r = W * 0.42, y = H * (sp === SP_BUSH ? 0.75 : 0.66);
    const v0 = sp === SP_BUSH ? 0.55 : 0.45, v1 = sp === SP_BUSH ? 0.95 : 0.9;
    pos.push(-r, y, -r, -r, y, r, r, y, r, -r, y, -r, r, y, r, r, y, -r);
    uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
    for (let i = 0; i < 6; i++) nrm.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// ------------------------------------------------------------------------------------------------
// Materials
// ------------------------------------------------------------------------------------------------

function addWind(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 vegRoot = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 vegRoot = vec2(0.0);
      #endif
      float vegH = max(position.y - 1.2, 0.0);
      float vegPh = uWindTime * 1.25 + vegRoot.x * 0.071 + vegRoot.y * 0.053;
      float vegGust = 0.55 + 0.45 * sin(uWindTime * 0.31 + vegRoot.x * 0.004);
      transformed.x += (sin(vegPh) * 0.022 + sin(uWindTime * 3.7 + position.y * 1.7 + vegRoot.y) * 0.006) * vegH * vegGust;
      transformed.z += (cos(vegPh * 0.83 + 1.3) * 0.018) * vegH * vegGust;`
    );
  };
  material.customProgramCacheKey = () => 'veg-wind';
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
        }
        diffuseColor.rgb *= k;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'landcover-v2';
  return mat;
}

// ------------------------------------------------------------------------------------------------
// VegetationSystem
// ------------------------------------------------------------------------------------------------

export class VegetationSystem {
  constructor(scene, mats) {
    this.scene = scene;
    if (mats && !mats.landcoverMat) mats.landcoverMat = createLandcoverMaterial();
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
    addWind(this.farMat, this.uniforms);

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

  _rebuild(cp, loadedChunks) {
    const t0 = performance.now();
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
    // Pass 1: classify & count
    const cls = [];
    for (const v of tables) {
      const { inst, species, count } = v;
      const c = new Int8Array(count);
      for (let i = 0; i < count; i++) {
        const o = i * INST_STRIDE;
        const hx = inst[o] - cp.x, hz = inst[o + 2] - cp.z;
        const h2 = hx * hx + hz * hz;
        if (h2 > far2) {
          c[i] = -1;
          continue;
        }
        const hy = inst[o + 1] - cp.y;
        const lod = h2 + hy * hy < near2 ? 0 : 1;
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
      const { inst, species, count } = tables[t];
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
        const s = inst[o + 3], sy = inst[o + 4], r = inst[o + 5];
        const cr = Math.cos(r) * s, sr = Math.sin(r) * s;
        m[mo] = cr; m[mo + 1] = 0; m[mo + 2] = -sr; m[mo + 3] = 0;
        m[mo + 4] = 0; m[mo + 5] = sy; m[mo + 6] = 0; m[mo + 7] = 0;
        m[mo + 8] = sr; m[mo + 9] = 0; m[mo + 10] = cr; m[mo + 11] = 0;
        m[mo + 12] = inst[o]; m[mo + 13] = inst[o + 1]; m[mo + 14] = inst[o + 2]; m[mo + 15] = 1;
        const ca = b.mesh.instanceColor.array;
        ca[k * 3] = inst[o + 6];
        ca[k * 3 + 1] = inst[o + 7];
        ca[k * 3 + 2] = inst[o + 8];
      }
    }
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
