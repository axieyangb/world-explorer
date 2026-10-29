/**
 * Vegetation & landcover — main thread.
 *
 * Pools the per-chunk tree/bush instance tables produced in the worker (src/features/vegetation_worker.js)
 * into ONE InstancedMesh per species per LOD (14 species x 3 LODs; empty buckets are hidden):
 *   - near (< NEAR_R): detailed tree (bark-textured tapered trunk + limbs, leaf-card clusters), casts shadows,
 *                      wind sway + leaf flutter in the vertex shader                          [tree-detail]
 *   - mid            : same tree with fewer, larger cards and simpler limbs (same silhouette); its shadow comes
 *                      from a sun-facing impostor proxy
 *   - far            : multi-view (hemi-octahedral) impostors, lit through baked normals, cast shadows [tree-impostor]
 *   - beyond the far radius: culled
 * Radii are 3D camera distances retuned per frame (the mid ring grows with altitude, scaled by adaptive quality);
 * neighbouring LODs overlap in a band and crossfade with complementary dither masks (no popping).
 * Instance buffers are rebuilt only when the camera moves > REBUILD_DIST or the loaded chunk set changes.
 * Per-instance lean / extra size jitter are derived from a position hash (deterministic, no worker change).
 * Trees are destructible (src/features/tree_damage.js): hits, explosions, kaiju and ramming.  [tree-damage]
 *
 * Also owns `landcoverMat`, the material for the worker-built landcover ground mesh (subtle procedural texture).
 */
import * as THREE from '../../vendor/three.module.js';
import { INST_STRIDE, floraMixU } from './vegetation_worker.js';
import {
  SP_BROADLEAF, SP_TALL, SP_PALM, SP_BUSH, SP_COLUMN, SP_UMBRELLA, SP_EUCALYPT, SP_CACTUS, SP_BIRCH, SP_BAMBOO, SPECIES_COUNT, SPECIES_NAMES,
  floraContext, pickFlora, floraLook, genericEntry, hash2,
} from './flora_climate.js'; // [feature/climate-flora]
import { buildTreeGeometry, getFloraAtlas, TREE_DIM } from './tree_models.js'; // [tree-detail]
import {
  bakeTreeImpostors, buildImpostorGeometry, createImpostorMaterial, createImpostorDepthMaterial, LOD_VERT_PARS, LOD_VERT_MAIN, LOD_FRAG_PARS,
} from './tree_impostors.js'; // [tree-impostor]
import { getBeijingTerrainElevation } from '../environment.js';
import { TreeDamage } from './tree_damage.js'; // [tree-damage]
import { QUALITY } from './quality.js'; // [ui-mobile]

const REBUILD_DIST = 14;
const SHADOW_LAYER = 3; // [tree-detail] shadow-only proxies (sun shadow camera only)
// [tree-impostor] LOD radii (3D distance from the camera). Retuned every frame for altitude + adaptive quality:
//   near/mid at NEAR_R, mid/far at MID_R0 + MID_ALT * height above ground (scaled by quality), far cull grows too.
const NEAR_R = 62;
const MID_R0 = 165;
const MID_ALT = 0.5;
const FAR_R0 = 600;
const SHADOW_IMP_R = 320; // impostors farther than this cast no shadow (shadow-map texels are coarse there anyway)
const LOD_BAND = 9; // crossfade half-width (m)
const LOD_UNIFORMS = { uLodR: { value: new THREE.Vector4(NEAR_R, MID_R0, LOD_BAND, FAR_R0) } };

// Lean (rad, max) per species: palms lean a lot, columns/cacti stand straight
const LEAN = { [SP_PALM]: 0.13, [SP_BIRCH]: 0.06, [SP_COLUMN]: 0.012, [SP_CACTUS]: 0.02, [SP_BUSH]: 0, [SP_BAMBOO]: 0.05 };

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
function addWind(material, uniforms, far = false, lodMode = 3) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLodR = LOD_UNIFORMS.uLodR; // [tree-impostor] distance crossfade
    shader.uniforms.uLodMode = { value: lodMode };
    shader.uniforms.uWindTime = uniforms.uWindTime;
    shader.uniforms.uWindAmp = FLORA_UNIFORMS.uWindAmp;
    shader.uniforms.uVegSnow = FLORA_UNIFORMS.uVegSnow;
    shader.vertexShader = LOD_VERT_PARS + 'uniform float uWindTime;\nuniform float uWindAmp;\nattribute float vegSway;\nvarying vec3 vVegTint;\nvarying float vVegUp;\n' + shader.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + LOD_VERT_MAIN('instanceMatrix[3].xyz'))
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
      float vegH = max(position.y - 1.2, 0.0) * min(vegSway, 1.0) * uWindAmp;
      float vegPh = uWindTime * 1.25 + vegRoot.x * 0.071 + vegRoot.y * 0.053;
      float vegGust = 0.55 + 0.45 * sin(uWindTime * 0.31 + vegRoot.x * 0.004);
      transformed.x += (sin(vegPh) * 0.022 + sin(uWindTime * 3.7 + position.y * 1.7 + vegRoot.y) * 0.006) * vegH * vegGust;
      transformed.z += (cos(vegPh * 0.83 + 1.3) * 0.018) * vegH * vegGust;
      // [tree-detail] leaf cards flutter (vegSway > 1.1)
      float vegFl = step(1.1, vegSway) * uWindAmp * vegGust;
      transformed += vec3(sin(uWindTime * 6.1 + position.x * 2.3 + position.y * 1.7 + vegRoot.x),
                          sin(uWindTime * 5.3 + position.z * 2.9 + vegRoot.y) * 0.6,
                          cos(uWindTime * 5.7 + position.y * 2.1 + position.x)) * 0.035 * vegFl;`
      );
    // [tree-detail] double-sided leaf cards keep their canopy normal on both faces (no dark back faces)
    if (!far) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    shader.fragmentShader = LOD_FRAG_PARS + 'uniform float uVegSnow;\nvarying vec3 vVegTint;\nvarying float vVegUp;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  vegLodDiscard();')
      // [tree-impostor] keep card coverage under minification (mips average alpha away -> thin, crunchy foliage)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 vegTx = vMapUv * 1024.0;
        float vegMip = 0.5 * log2(max(max(dot(dFdx(vegTx), dFdx(vegTx)), dot(dFdy(vegTx), dFdy(vegTx))), 1.0));
        diffuseColor.a *= 1.0 + vegMip * 0.28;
      }`)
      .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float vegLeaf = smoothstep(0.0, 0.05, diffuseColor.g - diffuseColor.r);
        float vegTk = clamp(dot(vVegTint, vec3(0.3333)), 0.8, 1.12);
        // [tree-detail] textured leaves are saturated green: for strong (autumn / blossom) tints pull them toward a
        // pale yellow-green of the same luminance first, so the tint reads as red / orange / gold, not olive
        float vegAu = clamp(length(vVegTint - vec3(1.0)) * 0.9, 0.0, 0.85) * vegLeaf;
        float vegL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, vegL * vec3(0.95, 1.12, 0.62), vegAu);
        diffuseColor.rgb *= mix(vec3(vegTk), vVegTint, vegLeaf);
        float vegS = uVegSnow * ${far ? '0.5' : 'smoothstep(0.1, 0.65, vVegUp)'};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), clamp(vegS, 0.0, 0.9));
      }`
    );
  };
  material.customProgramCacheKey = () => (far ? 'veg-flora-far-4' : 'veg-tree-near-4');
}

/** Shared material of the detailed (near/mid) trees, stumps and falling trees: one atlas, alpha-tested cards. [tree-detail] */
export function createTreeMaterial(uniforms, lodMode = 3) {
  const mat = new THREE.MeshStandardMaterial({
    map: getFloraAtlas(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.0,
  });
  mat.name = 'treeMat';
  addWind(mat, uniforms, false, lodMode);
  return mat;
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

    // [tree-impostor] one material per LOD (they share a shader program; uLodMode picks the crossfade side)
    this.nearMat = createTreeMaterial(this.uniforms, 0); // [tree-detail]
    this.midMat = createTreeMaterial(this.uniforms, 1);
    this.fxMat = createTreeMaterial(this.uniforms, 3); // falling trees / stumps: never faded
    // Far impostors: material + shadow depth material are created once the atlas is baked (first update with a
    // renderer); until then far buckets draw nothing.
    this.farMat = new THREE.MeshBasicMaterial({ visible: false });
    this._impLight = { value: new THREE.Vector3(0, 1, 0) };
    this._impCam = { value: new THREE.Vector4(0, 0, 0, SHADOW_IMP_R) };
    this._imp = null;
    this._farDepthMat = null;
    this._quality = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 0.85 : 1;
    this._dtAvg = 1 / 60;
    this._qT = 0;
    this._lodR1 = MID_R0;
    this._lodBuilt = { r0: NEAR_R, r1: MID_R0, far: FAR_R0 };

    this.buckets = [];
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const impGeo = buildImpostorGeometry(sp);
      this.buckets.push({
        near: this._makeBucket(buildTreeGeometry(sp, 0), this.nearMat, 256, true),
        // mid ring: lighter 3D trees in the colour pass, impostor quads (facing the sun) as their shadow caster
        mid: this._makeBucket(buildTreeGeometry(sp, 1), this.midMat, 512, false, impGeo),
        far: this._makeBucket(impGeo, this.farMat, 2048, false),
      });
    }
    this._camPos = new THREE.Vector3();
    this.damage = new TreeDamage(this); // [tree-damage]
    this._forceRebuild = false;
    this._known = new Set();
    this._lastX = Infinity;
    this._lastZ = Infinity;
    this._lastY = Infinity;
    this._time = 0;
    this._stats = { near: 0, far: 0, total: 0, rebuildMs: 0 };
  }

  _makeBucket(geom, mat, cap, near, shadowGeom = null) {
    const b = { geom, mat, cap: 0, mesh: null, near, count: 0, shadowGeom, shadow: null };
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
    mesh.castShadow = b.near || (b.geom.attributes.impA && this._farDepthMat != null);
    if (b.geom.attributes.impA) mesh.customDepthMaterial = this._farDepthMat || undefined;
    mesh.receiveShadow = !b.geom.attributes.impA; // impostors would self-shadow against their own sun-facing caster
    this.root.add(mesh);
    b.mesh = mesh;
    b.cap = cap;
    if (b.shadowGeom) {
      // Shadow-only proxy sharing the bucket's instance buffers; lives on SHADOW_LAYER, which only the sun's
      // shadow camera renders (enabled lazily in update()).
      if (b.shadow) {
        this.root.remove(b.shadow);
        b.shadow.dispose();
      }
      const sh = new THREE.InstancedMesh(b.shadowGeom, this.farMat, cap);
      sh.instanceMatrix = mesh.instanceMatrix;
      sh.instanceColor = mesh.instanceColor;
      sh.count = 0;
      sh.frustumCulled = false;
      sh.castShadow = this._farDepthMat != null;
      sh.customDepthMaterial = this._farDepthMat || undefined;
      sh.layers.set(SHADOW_LAYER);
      this.root.add(sh);
      b.shadow = sh;
    }
  }

  /** Per-frame hook. Cheap unless the camera moved far enough or chunks changed. */
  update(camera, loadedChunks, dt) {
    this._time += dt || 0;
    this._camPos.copy(camera.position);
    if (!this._imp) this._bakeImpostors(); // [tree-impostor]
    const sun = typeof window !== 'undefined' && window.app ? window.app.sunLight : null;
    if (sun && !sun.shadow.camera.layers.isEnabled(SHADOW_LAYER)) sun.shadow.camera.layers.enable(SHADOW_LAYER);
    if (sun) this._impLight.value.copy(sun.position).sub(sun.target.position).normalize();
    this._updateLod(camera.position, dt || 0);
    this.damage.update(dt || 0); // [tree-damage]
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
    if (dx * dx + dz * dz > 4e6 && Number.isFinite(dx)) this.damage.clear(); // [tree-damage] teleport: drop falling trees
    if (this._forceRebuild) (changed = true), (this._forceRebuild = false);
    // LOD radii drifted past the rebuild margin (altitude / quality change): reclassify
    const L = LOD_UNIFORMS.uLodR.value, LB = this._lodBuilt;
    if (Math.abs(L.y - LB.r1) > REBUILD_DIST * 0.5 || Math.abs(L.w - LB.far) > 40) changed = true;
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

  _bakeImpostors() {
    const renderer = typeof window !== 'undefined' && window.app ? window.app.renderer : null;
    if (!renderer) return;
    const t0 = performance.now();
    try {
      this._imp = bakeTreeImpostors(renderer);
      this._impBakeMs = Math.round(performance.now() - t0);
    } catch (e) {
      this._imp = { albedo: null, normal: null, failed: true, dispose() {} }; // never retry every frame; far ring stays empty
      return;
    }
    this.farMat = createImpostorMaterial(this._imp, LOD_UNIFORMS, FLORA_UNIFORMS);
    this._farDepthMat = createImpostorDepthMaterial(this._imp, this._impLight, this._impCam);
    for (const B of this.buckets) {
      B.far.mat = this.farMat;
      B.far.mesh.material = this.farMat;
      B.far.mesh.castShadow = true;
      B.far.mesh.customDepthMaterial = this._farDepthMat;
      const sh = B.mid.shadow;
      if (sh) (sh.material = this.farMat), (sh.castShadow = true), (sh.customDepthMaterial = this._farDepthMat);
    }
  }

  /**
   * [tree-impostor] LOD radii for this frame: the mid ring grows with height above ground (helicopter / chase cam see
   * trees from far away), scaled by an adaptive quality factor that backs off when frames run long.
   */
  _updateLod(cp, dt) {
    if (dt > 0 && dt < 0.25) this._dtAvg += (dt - this._dtAvg) * 0.05;
    this._qT += dt;
    if (this._qT > 1.5) {
      this._qT = 0;
      if (this._dtAvg > 1 / 42) this._quality = Math.max(0.75, this._quality - 0.05);
      else if (this._dtAvg < 1 / 56) this._quality = Math.min(1.2, this._quality + 0.04);
    }
    let h = 0;
    try {
      h = Math.max(0, cp.y - getBeijingTerrainElevation(cp.x, cp.z));
    } catch {
      h = 0;
    }
    const q = this._quality;
    const r1 = (MID_R0 + MID_ALT * Math.min(450, h)) * q;
    // ease so altitude changes move the band smoothly
    this._lodR1 += (r1 - this._lodR1) * Math.min(1, dt * 2 + 0.02);
    const L = LOD_UNIFORMS.uLodR.value;
    // [ui-mobile] quality tier scales the three rings (phones: shorter near/mid/far)
    const nearR = NEAR_R * Math.min(1, 0.4 + 0.6 * q) * QUALITY.treeNear;
    L.set(nearR, Math.max(nearR + 30, this._lodR1 * QUALITY.treeMid), LOD_BAND, (FAR_R0 + Math.min(250, h * 0.6)) * QUALITY.treeFar);
    this._impCam.value.set(cp.x, cp.y, cp.z, SHADOW_IMP_R);
  }

  /** Shared KaijuFx instance (fire / smoke / dust) via the vehicle damage system, if any. */
  _fx() {
    const app = typeof window !== 'undefined' ? window.app : null;
    const vd = app && app.vehicleDamage;
    try {
      return vd && typeof vd._fx === 'function' ? vd._fx() : null;
    } catch {
      return null;
    }
  }

  // ---- [tree-damage] public damage API (hooks in walker_weapons / heli_flight / kaiju_destruction / main) ----
  /** First tree along a ray within maxDist: { dist } or null. */
  raycast(o, d, maxDist) {
    return this.damage.raycast(o, d, maxDist);
  }
  /** Weapon impact at p ({x,y,z}); splash radius (m, 0 = bullet) and building-damage units. */
  impact(p, splash = 0, units = 0.1, dir = null) {
    return this.damage.impact(p, splash || 0, units || 0.05, dir);
  }
  damageSphere(x, y, z, r, amount, opts) {
    return this.damage.damageSphere(x, y, z, r, amount, opts);
  }
  damageCone(o, dir, range, half, amount) {
    return this.damage.damageCone(o, dir, range, half, amount);
  }
  /** Player vehicle ramming; returns a speed multiplier (1 = nothing hit). */
  ram(pos, yaw, speed, spec, tank = false) {
    if (Math.abs(speed) < 0.3) return 1;
    const len = (spec && spec.length) || 4.4;
    const mass = tank ? 9 : len > 8 ? 4 : len > 5.2 ? 2 : 1;
    return this.damage.ram(pos, yaw, speed, len, mass);
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
      // [tree-placement] untagged OSM trees: one species per ~120 m block (neighbourhood drift), not per tree
      const bx = Math.floor(x / 120) * 120, bz = Math.floor(z / 120) * 120;
      if (ctx) e = s0 >= SPECIES_COUNT ? pickFlora(ctx, 0, floraMixU(bx, bz, hash2(bx, bz, 1) * 0.5)) : genericEntry(ctx, s0);
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
    this._sdLookCache = { inst, species: sp, count: n, col, scl, src: t }; // [tree-damage] state keyed by the OSM table
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
    const counts = new Array(SPECIES_COUNT * 3).fill(0);
    // [tree-impostor] LOD membership with margins: a tree inside a crossfade band (or that the camera can reach before
    // the next rebuild) goes into both neighbouring LODs; the shaders pick the exact per-frame mix.
    const L = LOD_UNIFORMS.uLodR.value;
    const M = REBUILD_DIST + LOD_BAND + 2;
    const R0 = L.x, R1 = L.y, FAR = L.w;
    this._lodBuilt.r0 = R0;
    this._lodBuilt.r1 = R1;
    this._lodBuilt.far = FAR;
    const far2 = (FAR + 5) * (FAR + 5);
    const nearIn2 = (R0 + M) * (R0 + M), midOut2 = Math.max(0, R0 - M) ** 2, midIn2 = (R1 + M) * (R1 + M), farOut2 = Math.max(0, R1 - M) ** 2;
    const mid2 = R1 * R1;
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
    const D = this.damage; // [tree-damage]
    D.beginRebuild(cp.x, cp.z);
    // Pass 1: classify & count (-1 culled / suppressed / destroyed)
    const cls = [];
    for (const v of tables) {
      const { inst, species, count } = v;
      const c = new Int8Array(count);
      const nStreet = treeSup ? v.streetCount || 0 : 0; // [feature/street-detail]
      const st = D.state(v.src || v); // [tree-damage]
      const dead = st && st.dead.size ? st.dead : null;
      for (let i = 0; i < count; i++) {
        const o = i * INST_STRIDE;
        const hx = inst[o] - cp.x, hz = inst[o + 2] - cp.z;
        const h2 = hx * hx + hz * hz;
        if (h2 > far2 || species[i] >= SPECIES_COUNT || (i < nStreet && treeSup.near(inst[o], inst[o + 2]))) {
          c[i] = -1;
          continue;
        }
        if (dead && dead.has(i)) {
          c[i] = -1;
          const hb = dead.get(i);
          if (hb > 0 && h2 < mid2) D.addStump(inst[o], inst[o + 1], inst[o + 2], TREE_DIM[species[i]].tr * 1.05 * inst[o + 3], hb + 0.15, inst[o + 5]); // snapped: stump stays
          continue;
        }
        const hy = inst[o + 1] - cp.y;
        const d2 = h2 + hy * hy;
        const mask = (d2 < nearIn2 ? 1 : 0) | (d2 > midOut2 && d2 < midIn2 ? 2 : 0) | (d2 > farOut2 ? 4 : 0);
        c[i] = mask;
        const sp3 = species[i] * 3;
        if (mask & 1) counts[sp3]++;
        if (mask & 2) counts[sp3 + 1]++;
        if (mask & 4) counts[sp3 + 2]++;
      }
      cls.push(c);
    }
    // Grow buckets if needed
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const B = this.buckets[sp];
      for (let lod = 0; lod < 3; lod++) {
        const b = lod === 0 ? B.near : lod === 1 ? B.mid : B.far;
        const need = counts[sp * 3 + lod];
        if (need > b.cap) this._allocBucket(b, Math.max(need, b.cap * 2));
        b.count = 0;
      }
    }
    // Pass 2: write matrices & colors (+ deterministic per-tree lean / size jitter, scorch, damage registry)
    for (let t = 0; t < tables.length; t++) {
      const v = tables[t];
      const { inst, species, count, col, scl } = v;
      const c = cls[t];
      const st = D.state(v.src || v);
      const scorch = st && st.scorch.size ? st.scorch : null;
      const si = D.addSource(v.src || v);
      for (let i = 0; i < count; i++) {
        const mask = c[i];
        if (mask <= 0) continue;
        const sp = species[i];
        const B = this.buckets[sp];
        const o = i * INST_STRIDE;
        const x = inst[o], z = inst[o + 2];
        let s = inst[o + 3], sy = inst[o + 4];
        const r = inst[o + 5];
        if (scl) (s *= scl[i * 2]), (sy *= scl[i * 2 + 1]);
        // [tree-detail] per-tree variation: crown width/height jitter and a small lean (hashed from position)
        const h1 = hash2(x, z, 5), h2 = hash2(x, z, 6), h3 = hash2(x, z, 7);
        s *= 0.92 + h1 * 0.16;
        sy *= 0.94 + h2 * 0.12;
        const lean = (LEAN[sp] ?? 0.035) * h3, la = h1 * 6.283;
        const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
        const cr = Math.cos(r) * s, sr = Math.sin(r) * s;
        const cs = col || inst, co = col ? i * 3 : o + 6;
        const r0 = cs[co], g0 = cs[co + 1], b0 = cs[co + 2];
        const sc = scorch ? scorch.get(i) || 0 : 0;
        const f = 1 - 0.72 * sc;
        let bk1 = -1, k1 = -1, bk2 = -1, k2 = -1;
        for (let lod = 0; lod < 3; lod++) {
          if (!(mask & (1 << lod))) continue;
          const b = lod === 0 ? B.near : lod === 1 ? B.mid : B.far;
          const k = b.count++;
          const m = b.mesh.instanceMatrix.array;
          const mo = k * 16;
          // columns of R_y * S, then the small-angle lean rotation (x' = x - lz*y, y' = lz*x + y - lx*z, z' = lx*y + z)
          m[mo] = cr; m[mo + 1] = lz * cr + lx * sr; m[mo + 2] = -sr; m[mo + 3] = 0;
          m[mo + 4] = -lz * sy; m[mo + 5] = sy; m[mo + 6] = lx * sy; m[mo + 7] = 0;
          m[mo + 8] = sr; m[mo + 9] = lz * sr - lx * cr; m[mo + 10] = cr; m[mo + 11] = 0;
          m[mo + 12] = x; m[mo + 13] = inst[o + 1]; m[mo + 14] = z; m[mo + 15] = 1;
          const ca = b.mesh.instanceColor.array;
          ca[k * 3] = r0 * f * (1 + 0.15 * sc);
          ca[k * 3 + 1] = g0 * f * (1 - 0.25 * sc);
          ca[k * 3 + 2] = b0 * f * (1 - 0.3 * sc);
          if (bk1 < 0) (bk1 = lod * SPECIES_COUNT + sp), (k1 = k);
          else (bk2 = lod * SPECIES_COUNT + sp), (k2 = k);
        }
        D.add(si, i, sp, x, inst[o + 1], z, s, sy, r, lx, lz, r0, g0, b0, bk1, k1, bk2, k2);
      }
    }
    D.endRebuild();
    for (let sp = 0; sp < SPECIES_COUNT; sp++) this._hist[sp] = counts[sp * 3] + counts[sp * 3 + 1] + counts[sp * 3 + 2];
    let near = 0, mid = 0, far = 0;
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const B = this.buckets[sp];
      for (const b of [B.near, B.mid, B.far]) {
        const mesh = b.mesh;
        mesh.count = b.count;
        mesh.visible = b.count > 0;
        if (b.shadow) (b.shadow.count = b.count), (b.shadow.visible = b.count > 0);
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, b.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, b.count * 3);
        mesh.instanceColor.needsUpdate = true;
        if (b === B.near) near += b.count;
        else if (b === B.mid) mid += b.count;
        else far += b.count;
      }
    }
    this._stats = { near, mid, far, total: near + mid + far, rebuildMs: +(performance.now() - t0).toFixed(2) };
  }

  stats() {
    let drawCalls = 0;
    for (const b of this.buckets) drawCalls += (b.near.mesh.visible ? 1 : 0) + (b.mid.mesh.visible ? 1 : 0) + (b.far.mesh.visible ? 1 : 0);
    const L = LOD_UNIFORMS.uLodR.value;
    return {
      ...this._stats, drawCalls, damage: { ...this.damage.stats },
      lod: { r0: Math.round(L.x), r1: Math.round(L.y), far: Math.round(L.w), q: +this._quality.toFixed(2) }, bakeMs: this._impBakeMs,
    };
  }
}
