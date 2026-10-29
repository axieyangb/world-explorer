// Instanced render assets for AI traffic & pedestrians.
// Cars: the low-detail build of each player vehicle (hero builders with options.lod) flattened into one
// merged geometry per type, drawn with one InstancedMesh each; per-instance paint + brake light, emissive
// head/tail lights at night.
// Pedestrians: a sculpted figure (near + far detail), walk/run/idle posed in the vertex shader.
import * as THREE from '../../vendor/three.module.js';
import { buildHeroVehicle } from './hero_vehicles.js';
import { HEAVY_VEHICLE_IDS, buildHeavyVehicle } from './hero_heavy.js';
import { personParts, PERSON_COMMON_GLSL, PERSON_ANIM_GLSL, PERSON_BEGIN_GLSL, PERSON_COLOR_GLSL, RAGDOLL_PART_SPECS, createRagdollPartGeometries } from './person_model.js';

// Lamp colours in the flat traffic shading (the hero lamp materials rely on reflections and emissive).
const HEAD_HEX = 0xfff3c4;
const TAIL_HEX = 0xc00a0a; // deep red: brighter values tone-map to salmon when braking at night

const uStrobeTime = { value: 0 };

// Tags read from mesh.userData, then material.userData (set by the hero builders):
//   paintWeight  0..1 share of the per-instance paint colour (1 = main body paint)
//   emitCode     1 head lamp, 2 tail lamp, 3 always-lit glow, 4 / 5 strobe phase A / B
//   lodColor     flat colour for textured materials (LED signs)
//   lodSkip      leave the mesh out
// A geometry `color` attribute (baked liveries, checker bands) overrides the material colour.
function flattenVehicle(typeId, options = {}) {
  const lodOpts = { ...options, lod: true };
  const built = HEAVY_VEHICLE_IDS.has(typeId) ? buildHeavyVehicle(typeId, lodOpts) : buildHeroVehicle(typeId, lodOpts);
  const lb = built.lightbarParts;
  if (lb) {
    for (const m of lb.phaseAMeshes) m.userData.emitCode = 4;
    for (const m of lb.phaseBMeshes) m.userData.emitCode = 5;
  }
  const model = built.group;
  model.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], paint = [], emit = [], kind = [], seat = [];
  const gPos = [], gNor = []; // [drivers] glass goes to its own see-through instanced mesh
  const tmpN = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
    const mat = o.material, ud = mat.userData || {};
    if (o.userData.lodSkip || ud.lodSkip) return;
    const em = o.userData.emitCode ?? ud.emitCode ?? (mat.isMeshBasicMaterial ? 3 : 0);
    const pw = o.userData.paintWeight ?? ud.paintWeight ?? 0;
    if (ud.lodColor != null) c.set(ud.lodColor);
    else if (em === 1) c.set(HEAD_HEX);
    else if (em === 2) c.set(TAIL_HEX);
    else if (mat.color) c.copy(mat.color);
    else c.set(0x888888);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, vc = g.attributes.color;
    tmpN.getNormalMatrix(o.matrixWorld);
    const kd = ud.lodKind || 0, st = o.userData.lodSeat ?? -1;
    if (kd === 1) {
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        gPos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
        gNor.push(v.x, v.y, v.z);
      }
      g.dispose();
      return;
    }
    for (let i = 0; i < p.count; i++) {
      kind.push(kd);
      seat.push(st);
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
      nor.push(v.x, v.y, v.z);
      if (vc) col.push(vc.getX(i), vc.getY(i), vc.getZ(i));
      else col.push(c.r, c.g, c.b);
      paint.push(pw);
      emit.push(em);
    }
    g.dispose();
  });
  // The low-detail build is never cached, so everything it made can go.
  model.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    }
  });
  const geom = indexed(pos, nor, col, paint, emit, kind, seat);
  const glass = new THREE.BufferGeometry();
  glass.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  glass.setAttribute('normal', new THREE.Float32BufferAttribute(gNor, 3));
  return { geom, glass };
}

// Weld identical vertices into an indexed geometry: smooth lofted bodies share most corners, so the
// vertex shader runs far fewer times per instance than on the triangle soup.
function indexed(pos, nor, col, paint, emit, kind, seat) {
  const map = new Map(), index = [];
  const P = [], N = [], C = [], A = [], E = [], K = [], S = [];
  const q = (v, s) => Math.round(v * s);
  for (let i = 0; i < pos.length / 3; i++) {
    const i3 = i * 3;
    const key = `${q(pos[i3], 1e4)},${q(pos[i3 + 1], 1e4)},${q(pos[i3 + 2], 1e4)},${q(nor[i3], 500)},${q(nor[i3 + 1], 500)},${q(nor[i3 + 2], 500)},${q(col[i3], 500)},${q(col[i3 + 1], 500)},${q(col[i3 + 2], 500)},${paint[i]},${emit[i]},${kind[i]},${seat[i]}`;
    let k = map.get(key);
    if (k === undefined) {
      k = P.length / 3;
      map.set(key, k);
      P.push(pos[i3], pos[i3 + 1], pos[i3 + 2]); N.push(nor[i3], nor[i3 + 1], nor[i3 + 2]); C.push(col[i3], col[i3 + 1], col[i3 + 2]);
      A.push(paint[i]); E.push(emit[i]); K.push(kind[i]); S.push(seat[i]);
    }
    index.push(k);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geom.setAttribute('aPaint', new THREE.Float32BufferAttribute(A, 1));
  geom.setAttribute('aEmit', new THREE.Float32BufferAttribute(E, 1));
  geom.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  geom.setAttribute('aSeat', new THREE.Float32BufferAttribute(S, 1));
  geom.setIndex(index);
  geom.computeBoundingSphere();
  return geom;
}

export const CAR_TYPES = [
  { id: 'sedan', base: 'taxi', options: { hideTaxiSign: true }, length: 4.5, width: 1.9 },
  { id: 'taxi', base: 'taxi', length: 4.5, width: 1.9 },
  { id: 'coupe', base: 'supercar', length: 4.6, width: 2.05 },
  { id: 'police', base: 'police', length: 4.7, width: 1.96 },
  { id: 'bus', base: 'bus', length: 10.6, width: 2.55 },
  { id: 'tesla', base: 'tesla', length: 4.97, width: 1.96, roughness: 0.22, metalness: 0.58 },
  { id: 'cybertruck', base: 'cybertruck', length: 5.68, width: 2.20, roughness: 0.24, metalness: 0.84 },
  { id: 'ambulance', base: 'ambulance', length: 6.10, width: 2.26 },
  { id: 'tow_truck', base: 'tow_truck', length: 6.40, width: 2.32 },
];

// [drivers] Per-car / per-seat occupants and burnt wrecks, shared by the car and glass shaders.
// Seed: from the car's paint when it has one (stable per car), else the instance slot (fixed liveries).
const OCC_GLSL = `
float occHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
float occSeed(vec4 paint, float useId) {
  float s = dot(floor(paint.rgb * 255.0 + 0.5), vec3(1.0, 257.0, 65537.0)) * 0.000123;
  return fract(s * 7.31 + occHash(s) + useId * float(gl_InstanceID) * 0.61803);
}
`;
const BURN_GLSL = `
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Burnt-out car: soot-black shell with rust blooms, grey-white ash on the hot upper panels, a scorched trace
// of the paint low on the doors, charred tyres on rusty steel rims, a black gutted cabin.
vec3 burnt(vec3 p, float kind, vec3 paint) {
  float n = bNoise(p * 2.3) * 0.6 + bNoise(p * 6.7 + 3.1) * 0.4;
  float h = clamp((p.y - 0.25) / 1.1, 0.0, 1.0);
  vec3 soot = vec3(0.026, 0.024, 0.022), rustD = vec3(0.1, 0.048, 0.026), rust = vec3(0.27, 0.115, 0.048), ash = vec3(0.34, 0.33, 0.31);
  if (kind > 1.5 && kind < 2.5) return mix(vec3(0.035, 0.03, 0.028), rustD * 0.8, smoothstep(0.55, 0.8, n));
  if (kind > 2.5 && kind < 3.5) return mix(vec3(0.16, 0.14, 0.12), rust * 0.7, smoothstep(0.4, 0.75, n));
  if (kind > 6.5 && kind < 8.5) return soot * (0.8 + 0.6 * n);
  vec3 c = mix(soot, rustD, smoothstep(0.42, 0.66, n));
  c = mix(c, rust, smoothstep(0.64, 0.82, n) * (0.3 + 0.7 * h));
  c = mix(c, ash, smoothstep(0.45, 0.95, h) * smoothstep(0.42, 0.7, bNoise(p * 3.7 + 9.0)) * 0.85);
  c = mix(c, paint * 0.32, (1.0 - smoothstep(0.1, 0.45, h)) * smoothstep(0.45, 0.65, bNoise(p * 2.9 + 17.0)) * 0.8);
  return c;
}
`;

// [drivers] Burnt material for a cloned hero wreck (vehicle_damage.js): same burn shading in mesh space.
// kind: 0 body, 2 tyre, 3 bright metal, 7 interior.
export function createBurntMaterial(kind = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: kind === 3 ? 0.5 : 0.08 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLocal;\n${BURN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = burnt(vLocal, ${kind.toFixed(1)}, vec3(0.25));`);
  };
  mat.customProgramCacheKey = () => `we-burnt-v1-${kind}`;
  return mat;
}

export function createCarMaterial(uniforms, matOpts = {}) {
  const roughness = matOpts.roughness != null ? matOpts.roughness : 0.42;
  const metalness = matOpts.metalness != null ? matOpts.metalness : 0.35;
  const useId = matOpts.idSeed ? 1 : 0;
  const parked = matOpts.parked ? 1 : 0; // [drivers] parked cars (venues) are empty
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.uniforms.uStrobeTime = uStrobeTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aPaint;
attribute float aEmit;
attribute float aKind;
attribute float aSeat;
attribute vec4 iPaint;
attribute float iBrake;
varying float vEmit;
varying float vBrake;
varying float vChar;
varying float vKind;
varying vec3 vLocal;
varying vec3 vPaint;
${OCC_GLSL}
const vec3 SKINS[6] = vec3[6](vec3(0.86, 0.66, 0.53), vec3(0.78, 0.56, 0.42), vec3(0.62, 0.42, 0.29), vec3(0.45, 0.29, 0.19), vec3(0.3, 0.19, 0.12), vec3(0.9, 0.73, 0.6));
const vec3 HAIRS[5] = vec3[5](vec3(0.05, 0.04, 0.03), vec3(0.12, 0.08, 0.05), vec3(0.3, 0.2, 0.11), vec3(0.6, 0.48, 0.3), vec3(0.5, 0.49, 0.47));
const vec3 SHIRTS[10] = vec3[10](vec3(0.85, 0.85, 0.83), vec3(0.08, 0.08, 0.09), vec3(0.12, 0.17, 0.32), vec3(0.55, 0.1, 0.1), vec3(0.3, 0.42, 0.26), vec3(0.45, 0.47, 0.5), vec3(0.62, 0.72, 0.85), vec3(0.75, 0.6, 0.35), vec3(0.2, 0.45, 0.48), vec3(0.42, 0.25, 0.45));`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vLocal = position;
  vKind = aKind;
  if (aSeat > -0.5) {
    float prob = aSeat < 0.5 ? 1.0 : aSeat < 1.5 ? 0.35 : aSeat < 2.5 ? 0.25 : aSeat < 3.5 ? 0.5 : 1.0;
    if (seatSeed >= prob || iBrake < -0.9 || ${parked} == 1) transformed = vec3(0.0, 0.5, 0.0); // empty seat / wreck / parked
  }`
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  float seed = occSeed(iPaint, ${useId}.0);
  float seatSeed = occHash(seed * 31.7 + aSeat * 7.13);
  vPaint = mix(vColor.rgb, iPaint.rgb, step(0.01, aPaint) * iPaint.a);
  vColor.rgb = mix(vColor.rgb, iPaint.rgb * (aPaint > 0.85 ? 1.0 : 0.8), step(0.01, aPaint) * iPaint.a);
  if (aKind > 3.5 && aKind < 6.5 || aKind > 9.5) {
    float hs = occHash(seatSeed * 91.3);
    vec3 skin = SKINS[int(hs * 5.99)];
    vec3 shirt = SHIRTS[int(occHash(seatSeed * 17.9) * 9.99)];
    vColor.rgb = aKind < 4.5 ? shirt : aKind < 5.5 ? skin : aKind < 6.5 ? HAIRS[int(occHash(seatSeed * 5.3) * 4.99)] : (occHash(seatSeed * 3.7) < 0.55 ? skin : shirt);
  } else if (aKind > 8.5 && aKind < 9.5) {
    vColor.rgb = vec3(0.07, 0.09, 0.16); // police uniform and cap
  }
  vChar = clamp(-iBrake, 0.0, 1.0);
  vEmit = vChar > 0.9 ? 0.0 : aEmit;
  vBrake = max(iBrake, 0.0);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLights;
uniform float uStrobeTime;
varying float vEmit;
varying float vBrake;
varying float vChar;
varying float vKind;
varying vec3 vLocal;
varying vec3 vPaint;
${BURN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (vChar > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, burnt(vLocal, vKind, vPaint), smoothstep(0.0, 0.9, vChar));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.93, vChar);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, vKind > 2.5 && vKind < 3.5 ? 0.5 : 0.08, vChar);`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float eHead = step(0.5, vEmit) * step(vEmit, 1.5);
    float eTail = step(1.5, vEmit) * step(vEmit, 2.5);
    float eGlow = step(2.5, vEmit) * step(vEmit, 3.5);
    float eStrobeA = step(3.5, vEmit) * step(vEmit, 4.5) * (0.25 + 2.2 * step(0.0, sin(uStrobeTime * 14.0)));
    float eStrobeB = step(4.5, vEmit) * (0.25 + 2.2 * step(0.0, -sin(uStrobeTime * 14.0)));
    totalEmissiveRadiance += diffuseColor.rgb * (eHead * (0.3 + uLights * 2.6) + eTail * (0.25 + uLights * 1.1 + vBrake * 1.8) + eGlow * (0.35 + uLights * 0.9) + eStrobeA + eStrobeB);
  }`
      );
  };
  mat.customProgramCacheKey = () => `we-traffic-car-v4-${roughness}-${metalness}-${useId}-${parked}`;
  return mat;
}

// [drivers] See-through tinted glass: dark tint, sky/street reflection by fresnel (dimmer at night), more
// opaque at grazing angles. Burning cars smoke the glass up; wrecks lose it (broken out).
export function createCarGlassMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c1318, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iBrake;\nvarying float vChar;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vChar = clamp(-iBrake, 0.0, 1.0);\n  if (vChar > 0.9) transformed = vec3(0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vChar;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  {
    vec3 V = normalize(vViewPosition);
    float fr = pow(1.0 - abs(dot(normalize(vNormal), V)), 3.0);
    float sky = clamp(0.5 + 0.5 * reflect(-V, normalize(vNormal)).y, 0.0, 1.0);
    vec3 refl = mix(vec3(0.16, 0.17, 0.18), vec3(0.55, 0.66, 0.78), sky) * (1.0 - 0.85 * uLights);
    gl_FragColor.rgb += refl * (0.18 + 0.7 * fr);
    gl_FragColor.a = mix(0.38 + 0.5 * fr, 0.92, vChar);
    gl_FragColor.rgb *= 1.0 - 0.8 * vChar;
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-glass-v1';
  return mat;
}

const ID_SEED = new Set(['taxi', 'police', 'bus', 'ambulance', 'tow_truck']);

const GLASS_MATS = new WeakMap();
/**
 * [drivers] Give an instanced car mesh its see-through glass: a child InstancedMesh sharing the car's instance
 * matrices and iBrake (char), drawn after the opaques with the car's instance count.
 */
export function attachCarGlass(mesh, glassGeo, iBrake, uniforms, mat = null) {
  if (!glassGeo || !glassGeo.attributes.position.count) return null;
  if (!mat) {
    mat = GLASS_MATS.get(uniforms);
    if (!mat) { mat = createCarGlassMaterial(uniforms); GLASS_MATS.set(uniforms, mat); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', glassGeo.attributes.position);
  geo.setAttribute('normal', glassGeo.attributes.normal);
  geo.setAttribute('iBrake', iBrake);
  const gm = new THREE.InstancedMesh(geo, mat, mesh.instanceMatrix.count);
  gm.instanceMatrix = mesh.instanceMatrix;
  gm.count = 0;
  gm.frustumCulled = false;
  gm.castShadow = false;
  gm.receiveShadow = false;
  gm.renderOrder = 1;
  gm.name = `${mesh.name}_glass`;
  gm.onBeforeRender = () => { gm.count = mesh.count; };
  mesh.add(gm);
  return gm;
}

export function createCarMeshes(capacity, uniforms) {
  const baseMat = createCarMaterial(uniforms);
  const idMat = createCarMaterial(uniforms, { idSeed: true });
  const glassMat = createCarGlassMaterial(uniforms);
  return CAR_TYPES.map((t) => {
    const { geom, glass } = flattenVehicle(t.base, t.options);
    const iPaint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const iBrake = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    iPaint.setUsage(THREE.DynamicDrawUsage);
    iBrake.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iPaint', iPaint);
    geom.setAttribute('iBrake', iBrake);
    const mat = t.metalness != null ? createCarMaterial(uniforms, t) : ID_SEED.has(t.id) ? idMat : baseMat;
    const mesh = new THREE.InstancedMesh(geom, mat, capacity);
    mesh.onBeforeRender = () => {
      uStrobeTime.value = performance.now() * 0.001;
    };
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `traffic_${t.id}`;
    attachCarGlass(mesh, glass, iBrake, uniforms, glassMat);
    return { type: t, mesh, iPaint, iBrake, glassGeo: glass };
  });
}

// ---------------- Pedestrians ----------------
// Shared person model (src/features/person_model.js): sculpted head with face, hair grown from the scalp,
// lofted limbs split at knee/elbow, hands, shoes; optional backpack/bag/cap/glasses/coat/skirt/umbrella/
// phone toggled per instance by a style bitmask (disabled parts collapse to a degenerate point). The walk,
// run and idle poses are computed in the vertex shader from iAnim/iGait (see PERSON_ANIM_GLSL).
// lod 0 = near figure, lod 1 = far figure (same shader and instance layout, fewer triangles).
const PED_GEO_CACHE = new Map();
function createPedGeometry(lod) {
  const pos = [], nor = [], col = [], info = [], idx = [];
  for (const pt of personParts({ indexed: true, lod })) {
    const g = pt.geom;
    const p = g.attributes.position, n = g.attributes.normal;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(pt.rgb[0], pt.rgb[1], pt.rgb[2]);
      info.push(pt.part, pt.mat, pt.opt, pt.joint);
    }
    if (g.index) for (const i of g.index.array) idx.push(base + i);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  geom.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geom.computeBoundingSphere();
  return geom;
}

let pedMaterial = null;
function createPedMaterial() {
  if (pedMaterial) return pedMaterial;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aInfo;
attribute vec3 iAnim;
attribute vec4 iGait;
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec3 iAcc;
${PERSON_COMMON_GLSL}`
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${PERSON_ANIM_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PERSON_BEGIN_GLSL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${PERSON_COLOR_GLSL}`);
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-v3';
  pedMaterial = mat;
  return mat;
}

export function createPedMesh(capacity, lod = 0) {
  let base = PED_GEO_CACHE.get(lod);
  if (!base) { base = createPedGeometry(lod); PED_GEO_CACHE.set(lod, base); }
  // Per-mesh geometry wrapper sharing the static vertex buffers, with its own instance attributes.
  const geom = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aInfo']) geom.setAttribute(k, base.attributes[k]);
  geom.setIndex(base.index);
  geom.boundingSphere = base.boundingSphere;
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  // iAnim = (gait phase, amplitude, style bits); iGait = (stride, arm swing, idle mode + posture, clock)
  const iAnim = mk(3), iGait = mk(4), iShirt = mk(3), iPants = mk(3), iSkin = mk(3), iHair = mk(3), iAcc = mk(3);
  geom.setAttribute('iAnim', iAnim);
  geom.setAttribute('iGait', iGait);
  geom.setAttribute('iShirt', iShirt);
  geom.setAttribute('iPants', iPants);
  geom.setAttribute('iSkin', iSkin);
  geom.setAttribute('iHair', iHair);
  geom.setAttribute('iAcc', iAcc);
  const mesh = new THREE.InstancedMesh(geom, createPedMaterial(), capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = lod ? 'traffic_pedestrians_far' : 'traffic_pedestrians';
  return { mesh, iAnim, iGait, iShirt, iPants, iSkin, iHair, iAcc, tris: base.index.count / 3 };
}

export const RAGDOLL_PART_NAMES = RAGDOLL_PART_SPECS.map((s) => s.name);

export function createPedPartMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSlot;\nattribute vec3 iColA;\nattribute vec3 iColB;'
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  {
    vColor.rgb = aSlot < 0.5 ? vColor.rgb : (aSlot < 1.5 ? iColA : iColB);
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-ragdoll-part-v1';
  return mat;
}

export function createPedPartMeshes(capacity) {
  const geoms = createRagdollPartGeometries();
  const mat = createPedPartMaterial();
  const out = {};
  for (const spec of RAGDOLL_PART_SPECS) {
    const geom = geoms[spec.name];
    const iColA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const iColB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    iColA.setUsage(THREE.DynamicDrawUsage);
    iColB.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iColA', iColA);
    geom.setAttribute('iColB', iColB);
    const mesh = new THREE.InstancedMesh(geom, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `traffic_ped_part_${spec.name}`;
    mesh.iColA = iColA;
    mesh.iColB = iColB;
    mesh.mesh = mesh;
    mesh.spec = spec;
    out[spec.name] = mesh;
  }
  out.leftArm = out.armL;
  out.rightArm = out.armR;
  out.leftLeg = out.legL;
  out.rightLeg = out.legR;
  return out;
}

export function createImpactPuffMesh(capacity = 128) {
  const geom = new THREE.DodecahedronGeometry(0.16, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8cfc2,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'traffic_ped_impact_puffs';
  return mesh;
}
