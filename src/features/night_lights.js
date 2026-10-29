// [night] Cheap night lighting for the ground: a top-down light-accumulation map around the camera.
//
// Every frame (every other frame on phones) a few instanced draws splat soft light footprints into a small
// render target that covers ~1.3 km (0.8 km on phones) around the camera:
//   - street lamps: the lamp-head instances street_furniture.js already places for its ground pools, re-used by
//     sharing their instanceMatrix (warm sodium or cool LED, chosen per neighbourhood);
//   - shop fronts: the awning instances of places.js spill warm light out of the shop onto the pavement;
//   - headlights: the player's car throws a long cone ahead, AI traffic a short one plus a red tail glow;
//   - traffic signals tint the road under them red / amber / green.
// Ground materials (roads, pavements, kerbs, markings, terrain, parks; see patchNightGround) add
// albedo x map as extra diffuse light, so pools sit on the surface like real light instead of an additive decal,
// and wet roads smear them into long reflections. Beyond the map, carriageways keep an averaged lamp glow so roads
// read as lit ribbons from the helicopter. No per-lamp three.js lights anywhere; at day everything multiplies by 0.
import * as THREE from '../../vendor/three.module.js';
import { isTouchDevice } from './touch_controls.js';
import { SURFACE_UNIFORMS } from './surfaces.js';

const LITE = isTouchDevice();
const MAP_SIZE = LITE ? 512 : 1024; // texels
const MAP_RANGE = LITE ? 700 : 940; // metres covered (edge to edge), centred on the camera
const LAMP_R = LITE ? 330 : 440; // street_furniture places lamp heads out to 450 m; past this the averaged glow takes over
const DYN_CAP = 320; // headlight / tail / signal splats
const TRAFFIC_R = LITE ? 220 : 380; // m: traffic cars that light the road

export const NIGHT_LIGHT_UNIFORMS = {
  uNightLightMap: { value: null },
  // minX, minZ, 1 / range, on (0 by day .. 1 at night)
  uNightLightRect: { value: new THREE.Vector4(0, 0, 1 / MAP_RANGE, 0) },
  // averaged lamp light on carriageways beyond the map (rgb), so far roads still glow
  uNightRoadGlow: { value: new THREE.Color(0.0, 0.0, 0.0) },
  uNightFar: { value: new THREE.Vector2(LAMP_R - 60, LAMP_R) }, // camera distance where the averaged glow fades in
};

const SAMPLE_GLSL = `
uniform sampler2D uNightLightMap;
uniform vec4 uNightLightRect;
uniform vec3 uNightRoadGlow;
uniform vec2 uNightFar;
float nightMapEdge(vec2 uv) {
  vec2 e = smoothstep(vec2(0.0), vec2(0.08), uv) * smoothstep(vec2(1.0), vec2(0.92), uv);
  return e.x * e.y;
}
vec3 nightLightAt(vec2 xz) {
  vec2 uv = (xz - uNightLightRect.xy) * uNightLightRect.z;
  return texture2D(uNightLightMap, clamp(uv, 0.0, 1.0)).rgb * (nightMapEdge(uv) * uNightLightRect.w);
}
`;

// ---------------------------------------------------------------- splat materials (render into the map)
// All splat vertex shaders place the quad straight in map space (no camera): ndc = (xz - min) / range * 2 - 1.
const MAP_VS_HEAD = `
uniform vec4 uRect;
vec4 mapPos(vec2 xz) { return vec4((xz - uRect.xy) * uRect.z * 2.0 - 1.0, 0.0, 1.0); }
float splatHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
`;

function splatMaterial(vs, fs, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MAP_VS_HEAD + vs,
    fragmentShader: fs,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide, // map space flips the quads' winding
  });
}

// Street lamps: instanceMatrix from street_furniture's pools (translation = foot of the pole, x scale 8 post / 12 mast)
const LAMP_VS = `
uniform float uReach;
varying vec2 vUv;
varying vec3 vCol;
uniform vec3 uSodium;
uniform vec3 uLed;
void main() {
  vec3 c = instanceMatrix[3].xyz;
  float s = length(instanceMatrix[0].xyz);
  float mast = step(10.0, s);
  float r = mix(9.0, 15.0, mast) * uReach;
  vUv = position.xz * 2.0; // -1..1
  vec2 xz = c.xz + position.xz * 2.0 * r;
  // neighbourhoods (~180 m cells) are either old sodium or new LED; posts a little dimmer
  float led = step(0.55, splatHash(floor(c.xz / 180.0) + 7.0));
  vCol = mix(uSodium, uLed, led) * mix(0.75, 1.0, mast);
  gl_Position = mapPos(xz);
}`;
const LAMP_FS = `
uniform float uGain;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv);
  // bright core under the head, long soft skirt; exactly 0 at the quad edge
  float k = 1.0 / (1.0 + d * d * 9.0) - 0.1;
  k = max(k, 0.0) * (1.0 / 0.9);
  gl_FragColor = vec4(vCol * k * uGain, 1.0);
}`;

// Shop fronts: instanceMatrix from places' awning pool (local x along the wall scaled by width, +z out of the wall)
const SHOP_VS = `
varying vec2 vLoc;
varying float vW;
void main() {
  vec3 c = instanceMatrix[3].xyz;
  vec3 ax = instanceMatrix[0].xyz;
  float w = length(ax);
  vec2 along = ax.xz / max(w, 1e-3);
  vec2 out2 = normalize(instanceMatrix[2].xz);
  // quad: 1.5 m past each end of the shop, from 1 m inside the wall to 8 m out
  float lx = position.x * (w + 3.0);
  float lz = mix(-1.0, 8.0, position.z + 0.5);
  vLoc = vec2(lx, lz);
  vW = w * 0.5;
  gl_Position = mapPos(c.xz + along * lx + out2 * lz);
}`;
const SHOP_FS = `
uniform vec3 uColor;
varying vec2 vLoc;
varying float vW;
void main() {
  float side = 1.0 - smoothstep(vW - 0.5, vW + 1.5, abs(vLoc.x));
  float out1 = smoothstep(-1.0, 0.2, vLoc.y) * exp(-max(vLoc.y, 0.0) / 2.6) * (1.0 - smoothstep(6.0, 8.0, vLoc.y));
  gl_FragColor = vec4(uColor * side * out1, 1.0);
}`;

// Dynamic: instanceMatrix = rotation about y + translation, x scale = width, z scale = length; aShape 0 round,
// 1 cone ahead (+z, from the bumper), 2 tail glow; instanceColor = colour x intensity
const DYN_VS = `
attribute float aShape;
attribute vec3 aCol;
varying vec2 vUv;
varying float vShape;
varying vec3 vCol;
void main() {
  vShape = aShape;
  vCol = aCol;
  vec2 p = position.xz; // -0.5..0.5
  // cones start at the bumper and run forward; round / tail splats are centred
  vec2 lp = aShape > 0.5 && aShape < 1.5 ? vec2(p.x, p.y + 0.5) : p;
  vUv = lp;
  vec4 w = instanceMatrix * vec4(lp.x, 0.0, lp.y, 1.0);
  gl_Position = mapPos(w.xz);
}`;
const DYN_FS = `
varying vec2 vUv;
varying float vShape;
varying vec3 vCol;
void main() {
  float k;
  if (vShape < 0.5) {
    float d = length(vUv) * 2.0;
    k = max(1.0 / (1.0 + d * d * 10.0) - 1.0 / 11.0, 0.0) * 1.1;
  } else if (vShape < 1.5) {
    // headlight beam: widens with distance, bright near the car, a soft hot spot ~1/4 of the way out
    float t = vUv.y; // 0 at the bumper .. 1 at the far end
    float halfW = mix(0.1, 0.5, t);
    float lat = 1.0 - smoothstep(halfW * 0.35, halfW, abs(vUv.x));
    float along = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.4, 1.0, t));
    k = lat * along * (0.45 + 0.8 * exp(-pow((t - 0.28) * 3.5, 2.0)));
  } else {
    float d = length(vUv * vec2(1.6, 2.0));
    k = max(1.0 - d, 0.0);
    k *= k;
  }
  gl_FragColor = vec4(vCol * k, 1.0);
}`;

// ---------------------------------------------------------------- consumers (ground materials)
function chain(mat, fn, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    fn(shader);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + key;
  mat.needsUpdate = true;
}

/**
 * Adds the night light map to a ground material as extra diffuse light. road = carriageway material: also gets the
 * far-road glow and wet-road reflections of the lights.
 */
function patchNightGround(mat, road) {
  chain(mat, (shader) => {
    for (const [k, u] of Object.entries(NIGHT_LIGHT_UNIFORMS)) shader.uniforms[k] = u;
    shader.uniforms.uNightWet = SURFACE_UNIFORMS.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNightWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvNightWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>', `#include <common>\nvarying vec3 vNightWorld;\nuniform float uNightWet;\n${SAMPLE_GLSL}`);
    if (mat.isMeshBasicMaterial) {
      // unlit paint (lane lines, markings): light it directly
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `if (uNightLightRect.w > 0.001) outgoingLight += diffuseColor.rgb * nightLightAt(vNightWorld.xz) * 0.8;
        #include <opaque_fragment>`
      );
      return;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        vec3 nightL = vec3(0.0);
        if (uNightLightRect.w > 0.001) {
          nightL = nightLightAt(vNightWorld.xz);
          ${road ? `// carriageways beyond the map keep an averaged lamp glow (vRoadUv.y > -0.5: road, not pavement)
          float farW = smoothstep(uNightFar.x, uNightFar.y, length(vNightWorld.xz - cameraPosition.xz));
          nightL *= 1.0 - farW;
          nightL += uNightRoadGlow * farW * (vRoadUv.y > -0.5 ? 1.0 : 0.45);` : ''}
          // pools fall on the ground: full on up-facing surfaces, a little on kerb faces / pillars / walls
          float nUp = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          reflectedLight.indirectDiffuse += diffuseColor.rgb * nightL * mix(0.3, 1.0, clamp(nUp, 0.0, 1.0));
        }`
      );
    if (road) {
      // wet asphalt: lights stretch into long streaks toward the viewer (sampled further along the view ray)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `if (uNightWet > 0.01 && uNightLightRect.w > 0.001) {
          vec3 nv = vNightWorld - cameraPosition;
          vec2 vd = normalize(nv.xz + vec2(1e-4));
          float gloss = clamp(1.0 - roughnessFactor * 1.6, 0.0, 1.0);
          vec3 refl = nightLightAt(vNightWorld.xz + vd * 3.0) * 0.4 + nightLightAt(vNightWorld.xz + vd * 7.0) * 0.35
                    + nightLightAt(vNightWorld.xz + vd * 13.0) * 0.25;
          float graze = 0.35 + 0.65 * (1.0 - clamp(abs(normalize(nv).y) * 1.4, 0.0, 1.0));
          outgoingLight += refl * uNightWet * (0.25 + 0.75 * gloss) * graze * 0.9;
        }
        #include <opaque_fragment>`
      );
    }
  }, road ? '-night-road-1' : '-night-ground-1');
}

const GROUND_MATS = ['roadMat', 'terrainMat', 'parkMat', 'landcoverMat', 'facilityMat', 'bridgeStructMat', 'streetCurbMat',
  'streetLineMat', 'markingMat', 'streetDecalMat'];

// ---------------------------------------------------------------- system
class NightLights {
  constructor(app) {
    this.app = app;
    const r = app.renderer;
    const half = r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'));
    this.rt = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.rt.texture.name = 'night_light_map';
    NIGHT_LIGHT_UNIFORMS.uNightLightMap.value = this.rt.texture;
    this.texel = MAP_RANGE / MAP_SIZE;
    this.rect = new THREE.Vector4(0, 0, 1 / MAP_RANGE, 0);
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.frame = 0;
    this.on = 0;

    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2); // position.xz in -0.5..0.5
    this.lampMat = splatMaterial(LAMP_VS, LAMP_FS, {
      uRect: { value: this.rect }, uReach: { value: 1.15 }, uGain: { value: 1.5 },
      uSodium: { value: new THREE.Color(1.0, 0.56, 0.22) }, uLed: { value: new THREE.Color(0.78, 0.86, 1.0) },
    });
    this.shopMat = splatMaterial(SHOP_VS, SHOP_FS, { uRect: { value: this.rect }, uColor: { value: new THREE.Color(1.0, 0.78, 0.5) } });
    this.dynMat = splatMaterial(DYN_VS, DYN_FS, { uRect: { value: this.rect } });
    this.lamps = null; // created once street furniture exists (shares its instanceMatrix)
    this.shops = null;
    this.quad = quad;

    const dg = quad.clone();
    this.aShape = new THREE.InstancedBufferAttribute(new Float32Array(DYN_CAP), 1);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(DYN_CAP * 3), 3);
    this.aShape.setUsage(THREE.DynamicDrawUsage);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    dg.setAttribute('aShape', this.aShape);
    dg.setAttribute('aCol', this.aCol);
    this.dyn = new THREE.InstancedMesh(dg, this.dynMat, DYN_CAP);
    this.dyn.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dyn.frustumCulled = false;
    this.dyn.count = 0;
    this.scene.add(this.dyn);

    this._patched = new Set();
    this._patchMats();
    this._sigCol = { green: [0.1, 1.0, 0.45], yellow: [1.0, 0.6, 0.05], red: [1.0, 0.1, 0.05] };
  }

  /** Ground materials get the map; some (landcover, street lines) are created after us, so this re-checks. */
  _patchMats() {
    const m = this.app.mats || {};
    for (const k of GROUND_MATS) {
      const mat = m[k];
      if (!mat || this._patched.has(mat)) continue;
      this._patched.add(mat);
      patchNightGround(mat, k === 'roadMat');
    }
  }

  _share(owner, src, mat, order) {
    // an InstancedMesh drawing someone else's instance transforms (same buffer, uploaded once per frame)
    if (owner && owner.instanceMatrix === src.instanceMatrix) return owner;
    if (owner) this.scene.remove(owner);
    const mesh = new THREE.InstancedMesh(this.quad, mat, 1);
    mesh.instanceMatrix = src.instanceMatrix;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.scene.add(mesh);
    return mesh;
  }

  _writeDyn(i, x, z, yaw, w, len, shape, r, g, b) {
    const a = this.dyn.instanceMatrix.array, o = i * 16;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    a[o] = c * w; a[o + 1] = 0; a[o + 2] = -s * w; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s * len; a[o + 9] = 0; a[o + 10] = c * len; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = 0; a[o + 14] = z; a[o + 15] = 1;
    this.aShape.array[i] = shape;
    this.aCol.array[i * 3] = r; this.aCol.array[i * 3 + 1] = g; this.aCol.array[i * 3 + 2] = b;
  }

  _fillDynamic(cx, cz) {
    const app = this.app;
    let n = 0;
    // player car: two overlapping beams (left / right lamp) as one wide cone
    if (app.mode === 'drive' && app.pos && !app.vehicleDestroyed) {
      const yaw = app.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
      this._writeDyn(n++, app.pos.x + fx * 2.0, app.pos.z + fz * 2.0, yaw, 12, 36, 1, 0.55, 0.53, 0.47);
      this._writeDyn(n++, app.pos.x - fx * 2.4, app.pos.z - fz * 2.4, yaw, 2.4, 2.2, 2, 0.45, 0.02, 0.01);
    }
    const tr = app.traffic;
    if (tr && tr.cars) {
      const R2 = TRAFFIC_R * TRAFFIC_R;
      for (const c of tr.cars) {
        if (n > DYN_CAP - 2) break;
        if (!c.active || c.dPose) continue;
        const x = c.rx ?? c.x, z = c.rz ?? c.z;
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > R2) continue;
        const yaw = c.ryaw ?? Math.atan2(c.ux || 0, c.uz || 1);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        this._writeDyn(n++, x + fx * 2.0, z + fz * 2.0, yaw, 7, 16, 1, 0.38, 0.36, 0.3);
        this._writeDyn(n++, x - fx * 2.3, z - fz * 2.3, yaw, 2.2, 2.0, 2, 0.22, 0.015, 0.008);
      }
    }
    const sf = app.streetFeatures;
    if (sf && sf.activeSignals) {
      for (const g of sf.activeSignals) {
        if (n >= DYN_CAP) break;
        const col = this._sigCol[g.phase];
        if (!col) continue;
        // the head hangs over the road; tint a 9 m disc under it
        this._writeDyn(n++, g.x, g.z, 0, 9, 9, 0, col[0] * 0.16, col[1] * 0.16, col[2] * 0.16);
      }
    }
    this.dyn.count = n;
    this.dyn.instanceMatrix.needsUpdate = true;
    this.aShape.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }

  /** on: 0 by day .. 1 at night (same curve the street lamps switch on with). */
  update(on) {
    const app = this.app;
    this.on = on;
    NIGHT_LIGHT_UNIFORMS.uNightLightRect.value.w = on;
    if ((this.frame & 63) === 0) this._patchMats();
    this.frame++;
    if (on < 0.01) return;
    if (LITE && (this.frame & 1)) return;
    const cam = app.camera;
    if (!cam) return;
    // centred on the camera, snapped to whole texels so the pools never swim
    const cx = cam.position.x, cz = cam.position.z;
    const t = this.texel;
    const minX = Math.floor((cx - MAP_RANGE / 2) / t) * t, minZ = Math.floor((cz - MAP_RANGE / 2) / t) * t;
    this.rect.set(minX, minZ, 1 / MAP_RANGE, 0);
    NIGHT_LIGHT_UNIFORMS.uNightLightRect.value.set(minX, minZ, 1 / MAP_RANGE, on);

    const sf = app.streetFeatures;
    if (sf && sf.pools) {
      this.lamps = this._share(this.lamps, sf.pools, this.lampMat, 0);
      this.lamps.count = sf.pools.count;
    }
    const aw = app.places && app.places.pools && app.places.pools.awning;
    if (aw) {
      this.shops = this._share(this.shops, aw, this.shopMat, 1);
      this.shops.count = aw.count;
    }
    this._fillDynamic(cam.position.x, cam.position.z);

    const r = app.renderer;
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(this._cc || (this._cc = new THREE.Color()));
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    const prevXr = r.xr.enabled;
    const prevShadow = r.shadowMap.autoUpdate;
    r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;
    r.autoClear = true;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    r.xr.enabled = prevXr;
    r.shadowMap.autoUpdate = prevShadow;
  }

  /** Lamp heads within the map: drives how strongly the city lights the sky and far roads. */
  lampCount() {
    const sf = this.app.streetFeatures;
    return sf && sf.pools ? sf.pools.count : 0;
  }
}

export function initNightLights(app) {
  try {
    return new NightLights(app);
  } catch (e) {
    console.warn('[night] lights init failed', e);
    return null;
  }
}
