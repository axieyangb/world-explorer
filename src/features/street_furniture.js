// [feature/street] Main-thread street furniture renderer + road detail materials.
// - One InstancedMesh per furniture type for the whole world (draw calls independent of chunk count),
//   refilled from loaded chunks' userData.street within a cull radius when the camera moves.
// - Traffic signal lamps cycle via getSignalPhase(); street lights glow at night via emissive bulbs,
//   billboard halos and additive ground light pools (no real lights).
// - Asphalt noise / patch variation patched into the shared road material.
import * as THREE from '../../vendor/three.module.js';
import { getSignalPhase } from './signals.js';
import { getDaylight } from './daylight.js';
import { setStreetWorldOrigin } from './street_worker.js';

const STRIDE = 5;
const SIG_STRIDE = 8;
const HEAD_STRIDE = 5;
const REFRESH_MOVE_M = 18;
const DETAIL_CULL_M = 1250; // chunk-center distance beyond which per-chunk road detail meshes are hidden

// ---------- geometry helpers (merged, vertex-colored, non-indexed) ----------
function colored(geom, rgb, tx = 0, ty = 0, tz = 0) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.translate(tx, ty, tz);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nrm.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const box = (w, h, d, rgb, x, y, z) => colored(new THREE.BoxGeometry(w, h, d), rgb, x, y, z);
const cyl = (rt, rb, h, rgb, x, y, z, seg = 8) => colored(new THREE.CylinderGeometry(rt, rb, h, seg, 1), rgb, x, y + h / 2, z);
// Box spanning from (x0,y0) to (x1,y1) in the XY plane (for sloped arms)
function beam(x0, y0, x1, y1, t, rgb) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const g = new THREE.BoxGeometry(len, t, t);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  return colored(g, rgb, (x0 + x1) / 2, (y0 + y1) / 2, 0);
}

const POLE = [0.46, 0.48, 0.5];
const DARK = [0.14, 0.15, 0.16];
const HOUSING = [0.1, 0.11, 0.12];
const LENS_OFF = [0.2, 0.2, 0.2];

function buildModels() {
  const m = {};
  // Generic single-arm light (JP/EU/intl major roads). Bulb at (2.3, 8.35).
  m.lampArm = merge([
    cyl(0.08, 0.12, 8.5, POLE, 0, 0, 0),
    box(0.3, 0.5, 0.3, POLE, 0, 0.25, 0),
    beam(0, 8.2, 2.4, 8.45, 0.08, POLE),
    box(0.75, 0.14, 0.32, DARK, 2.3, 8.46, 0),
  ]);
  // US cobra-head: tall pole, curved mast arm, elongated head. Bulb at (2.6, 8.75).
  m.lampCobra = merge([
    cyl(0.08, 0.13, 8.7, [0.55, 0.56, 0.55], 0, 0, 0),
    beam(0, 8.4, 1.3, 8.95, 0.09, [0.55, 0.56, 0.55]),
    beam(1.25, 8.95, 2.3, 8.95, 0.08, [0.55, 0.56, 0.55]),
    box(1.0, 0.2, 0.42, [0.5, 0.52, 0.5], 2.6, 8.88, 0),
  ]);
  // Chinese boulevard double-arm light. Bulbs at (+-2.4, 9.85).
  m.lampDouble = merge([
    cyl(0.1, 0.16, 10.0, [0.62, 0.64, 0.66], 0, 0, 0),
    box(0.4, 0.8, 0.4, [0.5, 0.52, 0.54], 0, 0.4, 0),
    beam(0, 9.6, 2.5, 9.95, 0.09, [0.62, 0.64, 0.66]),
    beam(0, 9.6, -2.5, 9.95, 0.09, [0.62, 0.64, 0.66]),
    box(0.8, 0.14, 0.34, [0.3, 0.32, 0.34], 2.4, 9.96, 0),
    box(0.8, 0.14, 0.34, [0.3, 0.32, 0.34], -2.4, 9.96, 0),
  ]);
  // European post-top lantern (residential). Glass at y 3.6..4.1.
  m.lampPost = merge([
    cyl(0.05, 0.08, 3.6, [0.12, 0.14, 0.13], 0, 0, 0),
    box(0.22, 0.4, 0.22, [0.12, 0.14, 0.13], 0, 0.2, 0),
    cyl(0.02, 0.3, 0.18, [0.12, 0.14, 0.13], 0, 4.08, 0, 6),
  ]);
  m.bulb = merge([box(0.55, 0.05, 0.26, [1, 1, 1], 0, 0, 0)]);
  m.bulbPost = merge([box(0.34, 0.46, 0.34, [1, 1, 1], 0, 0, 0)]);

  // Traffic signals
  m.tlPole = merge([cyl(0.11, 0.14, 6.1, [0.32, 0.34, 0.36], 0, 0, 0), box(0.4, 0.3, 0.4, [0.3, 0.32, 0.34], 0, 0.15, 0)]);
  m.tlArm = merge([box(1, 0.14, 0.14, [0.32, 0.34, 0.36], 0.5, 5.92, 0)]);
  const vParts = [box(0.3, 1.05, 0.38, HOUSING, 0, 0, 0), box(0.04, 1.25, 0.58, HOUSING, -0.17, 0, 0)];
  const hParts = [box(0.3, 0.38, 1.05, HOUSING, 0, 0, 0), box(0.04, 0.58, 1.25, HOUSING, -0.17, 0, 0)];
  for (const o of [-0.33, 0, 0.33]) {
    vParts.push(box(0.02, 0.24, 0.24, LENS_OFF, 0.155, o, 0), box(0.16, 0.03, 0.28, HOUSING, 0.22, o + 0.14, 0));
    hParts.push(box(0.02, 0.24, 0.24, LENS_OFF, 0.155, 0, o), box(0.16, 0.03, 0.28, HOUSING, 0.22, 0.14, o));
  }
  m.tlHeadV = merge(vParts);
  m.tlHeadH = merge(hParts);
  const lamp = new THREE.CircleGeometry(0.125, 12);
  lamp.rotateY(Math.PI / 2);
  m.tlLamp = merge([colored(lamp, [1, 1, 1])]);

  // Bus stop shelter: open side faces +X (road), 4.4m long along Z
  const frame = [0.3, 0.32, 0.35];
  const glass = [0.55, 0.68, 0.74];
  m.busStop = merge([
    box(1.7, 0.12, 4.6, [0.85, 0.86, 0.88], 0, 2.5, 0),
    box(0.04, 2.0, 4.2, glass, -0.7, 1.25, 0),
    box(1.2, 2.0, 0.04, glass, -0.1, 1.25, 2.15),
    box(0.08, 2.5, 0.08, frame, -0.72, 1.25, -2.2),
    box(0.08, 2.5, 0.08, frame, -0.72, 1.25, 2.2),
    box(0.08, 2.5, 0.08, frame, 0.6, 1.25, -2.2),
    box(0.08, 2.5, 0.08, frame, 0.6, 1.25, 2.2),
    box(0.06, 1.8, 1.2, [0.95, 0.93, 0.85], -0.66, 1.3, -1.5), // lit ad panel
    box(0.4, 0.06, 2.2, [0.45, 0.32, 0.2], -0.45, 0.48, 0.6),
    box(0.06, 2.6, 0.12, [0.2, 0.45, 0.75], 0.75, 1.3, -2.6), // route sign post
    box(0.06, 0.45, 0.5, [0.2, 0.45, 0.75], 0.75, 2.45, -2.6),
  ]);
  const wood = [0.5, 0.34, 0.2];
  m.bench = merge([
    box(0.45, 0.06, 1.8, wood, 0, 0.45, 0),
    box(0.06, 0.4, 1.8, wood, -0.22, 0.72, 0),
    box(0.4, 0.45, 0.06, DARK, 0, 0.22, -0.8),
    box(0.4, 0.45, 0.06, DARK, 0, 0.22, 0.8),
  ]);
  m.bollard = merge([cyl(0.09, 0.1, 0.85, [0.22, 0.23, 0.25], 0, 0, 0), cyl(0.095, 0.095, 0.08, [0.9, 0.85, 0.3], 0, 0.68, 0)]);
  const red = [0.78, 0.12, 0.1];
  m.hydrant = merge([
    cyl(0.13, 0.15, 0.55, red, 0, 0, 0),
    cyl(0.04, 0.15, 0.14, red, 0, 0.55, 0),
    box(0.34, 0.09, 0.09, red, 0, 0.38, 0),
    box(0.09, 0.09, 0.2, [0.85, 0.82, 0.78], 0.12, 0.38, 0),
  ]);
  m.bin = merge([cyl(0.27, 0.24, 0.85, [0.2, 0.32, 0.26], 0, 0, 0), cyl(0.29, 0.29, 0.06, [0.15, 0.18, 0.16], 0, 0.85, 0)]);
  return m;
}

// Per-type cull radius (m), capacity and whether it casts shadows
const TYPE_CFG = {
  lampArm: [450, 3000, true], lampCobra: [450, 3000, true], lampDouble: [450, 2000, true], lampPost: [300, 2000, true],
  tlPole: [450, 1500, true], tlArm: [450, 1500, true], tlHeadV: [450, 1500, false], tlHeadH: [450, 1500, false],
  busStop: [350, 400, true], bench: [220, 1000, false], bollard: [180, 3000, false], hydrant: [180, 1500, false],
  bin: [200, 1500, false],
};
const HEAD_CULL = 450;

const HALO_VS = `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;
const HALO_FS = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4) * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}`;
const POOL_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const POOL_FS = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a = a * a * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** Adds subtle world-space asphalt grain, blotches and patch repairs to the road material (dark surfaces only). */
function patchAsphalt(mat) {
  if (!mat || mat.userData.streetAsphalt) return;
  mat.userData.streetAsphalt = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStreetWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vStreetWp;
float stHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(stHash(i), stHash(i + vec2(1.0, 0.0)), f.x), mix(stHash(i + vec2(0.0, 1.0)), stHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float aLum = dot(diffuseColor.rgb, vec3(0.3333));
  float aMask = 1.0 - smoothstep(0.40, 0.47, aLum);
  vec2 wp = vStreetWp.xz;
  float grain = stNoise(wp * 1.7) - 0.5;
  float mottle = stNoise(wp * 0.13) - 0.5;
  float patchN = stNoise(wp * 0.031 + 17.0);
  float repair = smoothstep(0.66, 0.70, patchN) * (1.0 - smoothstep(0.80, 0.84, patchN));
  float v = grain * 0.08 + mottle * 0.12 - repair * 0.11;
  diffuseColor.rgb *= 1.0 + aMask * v;
}`
      );
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|streetAsphalt';
  mat.needsUpdate = true;
}

export class StreetFeatures {
  /**
   * @param {THREE.Scene} scene
   * @param {object} mats shared chunk materials (street materials are added to it, roadMat is patched)
   */
  constructor(scene, mats) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'street_furniture';
    scene.add(this.root);

    // Road detail materials referenced by worker payload matKeys
    this.lineMat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
    });
    this.lineMat.name = 'streetLineMat';
    this.wearMat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.08, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
    });
    this.wearMat.name = 'streetWearMat';
    this.curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
    this.curbMat.name = 'streetCurbMat';
    if (mats) {
      mats.streetLineMat = this.lineMat;
      mats.streetWearMat = this.wearMat;
      mats.streetCurbMat = this.curbMat;
      patchAsphalt(mats.roadMat);
    }
    this.detailMats = new Set([this.lineMat, this.wearMat, this.curbMat]);

    const models = buildModels();
    const furnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.3 });
    this.meshes = {};
    for (const [type, [cull, cap, shadow]] of Object.entries(TYPE_CFG)) {
      const mesh = new THREE.InstancedMesh(models[type], furnMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      mesh.name = `street_${type}`;
      mesh.userData.cull = cull;
      this.meshes[type] = mesh;
      this.root.add(mesh);
    }

    // Night lighting: bulbs (emissive), halos (billboards), pools (ground decals)
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a8a84, toneMapped: false });
    this.bulbs = new THREE.InstancedMesh(models.bulb, this.bulbMat, 6000);
    this.bulbsPost = new THREE.InstancedMesh(models.bulbPost, this.bulbMat, 2000);
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 3.4 }, uColor: { value: new THREE.Color(1.0, 0.78, 0.5) }, uIntensity: { value: 0 } },
      vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.haloMat, 8000);
    const poolGeom = new THREE.PlaneGeometry(1, 1);
    poolGeom.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.72, 0.42) }, uIntensity: { value: 0 } },
      vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8,
    });
    this.pools = new THREE.InstancedMesh(poolGeom, this.poolMat, 8000);
    for (const m of [this.bulbs, this.bulbsPost, this.halos, this.pools]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      this.root.add(m);
    }
    this.halos.renderOrder = 3;
    this.pools.renderOrder = 2;

    // Signal lamps (per-instance color, updated every frame)
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.lamps = new THREE.InstancedMesh(models.tlLamp, this.lampMat, 1500);
    this.lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lamps.setColorAt(0, new THREE.Color(1, 1, 1));
    this.lamps.count = 0;
    this.lamps.frustumCulled = false;
    this.root.add(this.lamps);

    this.activeSignals = []; // [{x,y,z,c,s,axis,key,horiz}]
    this.lastRefresh = { x: Infinity, z: Infinity, sig: '', vis: true };
    this.stats = { instances: 0, signals: 0, heads: 0, refreshMs: 0 };
    this._col = { green: new THREE.Color(0.15, 1.0, 0.45), yellow: new THREE.Color(1.0, 0.72, 0.05), red: new THREE.Color(1.0, 0.12, 0.08) };
    this._lightOn = -1;
  }

  _chunkSignature(loadedChunks) {
    let s = loadedChunks.size * 7919;
    for (const g of loadedChunks.values()) s = (s + g.id * 2654435761) % 4294967296;
    return String(s);
  }

  _refresh(cam, loadedChunks) {
    const t0 = performance.now();
    const counts = {};
    for (const k of Object.keys(this.meshes)) counts[k] = 0;
    let nBulb = 0, nBulbPost = 0, nHalo = 0, nPool = 0;
    this.activeSignals.length = 0;
    const cx = cam.x, cz = cam.z;
    const bulbArr = this.bulbs.instanceMatrix.array, bulbPostArr = this.bulbsPost.instanceMatrix.array;
    const haloArr = this.halos.instanceMatrix.array, poolArr = this.pools.instanceMatrix.array;

    for (const group of loadedChunks.values()) {
      const st = group.userData && group.userData.street;
      const ox = group.userData.ox, oz = group.userData.oz;
      // per-chunk road detail distance cull
      const chunkD = Math.hypot(ox - cx, oz - cz);
      const sg = group.userData.subGroups;
      if (sg && sg.markings) {
        for (const m of sg.markings.children) {
          if (this.detailMats.has(m.material)) m.visible = chunkD < (m.material === this.wearMat ? DETAIL_CULL_M - 350 : DETAIL_CULL_M);
        }
      }
      if (!st || chunkD > 1300) continue;
      for (const [type, arr] of Object.entries(st.types || {})) {
        const mesh = this.meshes[type];
        if (!mesh) continue;
        const r2 = mesh.userData.cull * mesh.userData.cull;
        const cap = mesh.instanceMatrix.count;
        const out = mesh.instanceMatrix.array;
        for (let i = 0; i < arr.length; i += STRIDE) {
          const x = arr[i] + ox, z = arr[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > r2) continue;
          const n = counts[type];
          if (n >= cap) break;
          writeMatrix(out, n * 16, x, arr[i + 1], z, arr[i + 3], arr[i + 4]);
          counts[type] = n + 1;
        }
      }
      const heads = st.heads;
      if (heads) {
        const r2 = HEAD_CULL * HEAD_CULL;
        for (let i = 0; i < heads.length; i += HEAD_STRIDE) {
          const x = heads[i] + ox, y = heads[i + 1], z = heads[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > r2) continue;
          const isPost = y - heads[i + 4] < 5;
          if (isPost) {
            if (nBulbPost < 2000) writeMatrix(bulbPostArr, nBulbPost++ * 16, x, y, z, heads[i + 3], 1);
          } else if (nBulb < 6000) writeMatrix(bulbArr, nBulb++ * 16, x, y, z, heads[i + 3], 1);
          if (nHalo < 8000) writeMatrix(haloArr, nHalo++ * 16, x, y - (isPost ? 0 : 0.1), z, 0, 1);
          if (nPool < 8000) {
            const sc = isPost ? 9 : 15;
            writeMatrixScaled(poolArr, nPool++ * 16, x, heads[i + 4] + 0.08, z, sc);
          }
        }
      }
      const sig = st.signals;
      if (sig) {
        for (let i = 0; i < sig.length; i += SIG_STRIDE) {
          const x = sig[i] + ox, z = sig[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > HEAD_CULL * HEAD_CULL) continue;
          const nx = sig[i + 5] + ox, nz = sig[i + 6] + oz;
          this.activeSignals.push({
            x, y: sig[i + 1], z, c: Math.cos(sig[i + 3]), s: Math.sin(sig[i + 3]), axis: sig[i + 4],
            key: `${Math.round(nx)},${Math.round(nz)}`, horiz: sig[i + 7] > 0.5, phase: '',
          });
        }
      }
    }
    let total = 0;
    for (const [type, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[type];
      mesh.visible = counts[type] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      total += counts[type];
    }
    this.bulbs.count = nBulb;
    this.bulbsPost.count = nBulbPost;
    this.halos.count = nHalo;
    this.pools.count = nPool;
    for (const m of [this.bulbs, this.bulbsPost, this.halos, this.pools]) m.instanceMatrix.needsUpdate = true;
    this.bulbs.visible = nBulb > 0;
    this.bulbsPost.visible = nBulbPost > 0;
    this._lightOn = -1; // force halo/pool visibility re-evaluation
    this.stats.instances = total;
    this.stats.heads = nHalo;
    this.stats.signals = this.activeSignals.length;
    this.stats.refreshMs = +(performance.now() - t0).toFixed(2);
  }

  _updateSignals(timeSec) {
    const sigs = this.activeSignals;
    const n = Math.min(sigs.length, this.lamps.instanceMatrix.count);
    const arr = this.lamps.instanceMatrix.array;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const g = sigs[i];
      const phase = getSignalPhase(g.key, g.axis ? timeSec + 15 : timeSec) || 'red';
      if (phase === g.phase) continue;
      g.phase = phase;
      changed = true;
      const slot = phase === 'red' ? 0.33 : phase === 'yellow' ? 0 : -0.33;
      // head-local lamp offset: vertical stack (y) or horizontal row (z; red on driver's right = -z)
      const lx = 0.168, ly = g.horiz ? 0 : slot, lz = g.horiz ? -slot : 0;
      const wx = g.x + g.c * lx + g.s * lz;
      const wz = g.z - g.s * lx + g.c * lz;
      writeMatrix(arr, i * 16, wx, g.y + ly, wz, Math.atan2(g.s, g.c), 1);
      this.lamps.setColorAt(i, this._col[phase] || this._col.red);
    }
    if (this.lamps.count !== n) {
      this.lamps.count = n;
      changed = true;
    }
    if (changed) {
      this.lamps.instanceMatrix.needsUpdate = true;
      if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    }
  }

  /** Per-frame update. Cheap unless the camera moved > REFRESH_MOVE_M or the chunk set changed. */
  update(dt, camPos, loadedChunks, layerVisibility, worldOrigin) {
    if (worldOrigin !== this._origin) {
      this._origin = worldOrigin;
      setStreetWorldOrigin(worldOrigin); // main-thread fallback chunk builds
    }
    const vis = !layerVisibility || layerVisibility.facilities !== false;
    this.root.visible = vis && !this._forceHidden;
    if (!vis || !loadedChunks) return;
    const sig = this._chunkSignature(loadedChunks);
    const lr = this.lastRefresh;
    if (sig !== lr.sig || Math.hypot(camPos.x - lr.x, camPos.z - lr.z) > REFRESH_MOVE_M) {
      lr.sig = sig;
      lr.x = camPos.x;
      lr.z = camPos.z;
      this._refresh(camPos, loadedChunks);
    }
    // Clear phase cache only when signals are re-collected (handled by new objects in _refresh)
    this._updateSignals(performance.now() / 1000);

    const day = getDaylight();
    const on = 1 - smooth(0.15, 0.6, day);
    if (Math.abs(on - this._lightOn) > 0.005) {
      this._lightOn = on;
      this.bulbMat.color.setRGB(0.54 + 0.46 * on, 0.54 + 0.36 * on, 0.5 + 0.2 * on);
      this.haloMat.uniforms.uIntensity.value = 1.0 * on;
      this.poolMat.uniforms.uIntensity.value = 1.0 * on;
      this.halos.visible = on > 0.02 && this.halos.count > 0;
      this.pools.visible = on > 0.02 && this.pools.count > 0;
    }
  }

  debugStats() {
    const drawn = Object.values(this.meshes).filter((m) => m.visible).length +
      [this.bulbs, this.bulbsPost, this.halos, this.pools, this.lamps].filter((m) => m.visible && m.count > 0).length;
    return { ...this.stats, drawCalls: drawn, lightOn: +this._lightOn.toFixed(2) };
  }
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Column-major TRS: rotation about Y by `rot`, scale X by `sx`
function writeMatrix(out, o, x, y, z, rot, sx) {
  const c = Math.cos(rot), s = Math.sin(rot);
  out[o] = c * sx; out[o + 1] = 0; out[o + 2] = -s * sx; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = s; out[o + 9] = 0; out[o + 10] = c; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}
function writeMatrixScaled(out, o, x, y, z, sc) {
  out[o] = sc; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = 0; out[o + 9] = 0; out[o + 10] = sc; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}
