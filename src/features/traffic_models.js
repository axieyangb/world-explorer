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
  const pos = [], nor = [], col = [], paint = [], emit = [];
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
    for (let i = 0; i < p.count; i++) {
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
  return indexed(pos, nor, col, paint, emit);
}

// Weld identical vertices into an indexed geometry: smooth lofted bodies share most corners, so the
// vertex shader runs far fewer times per instance than on the triangle soup.
function indexed(pos, nor, col, paint, emit) {
  const map = new Map(), index = [];
  const P = [], N = [], C = [], A = [], E = [];
  const q = (v, s) => Math.round(v * s);
  for (let i = 0; i < pos.length / 3; i++) {
    const i3 = i * 3;
    const key = `${q(pos[i3], 1e4)},${q(pos[i3 + 1], 1e4)},${q(pos[i3 + 2], 1e4)},${q(nor[i3], 500)},${q(nor[i3 + 1], 500)},${q(nor[i3 + 2], 500)},${q(col[i3], 500)},${q(col[i3 + 1], 500)},${q(col[i3 + 2], 500)},${paint[i]},${emit[i]}`;
    let k = map.get(key);
    if (k === undefined) {
      k = P.length / 3;
      map.set(key, k);
      P.push(pos[i3], pos[i3 + 1], pos[i3 + 2]); N.push(nor[i3], nor[i3 + 1], nor[i3 + 2]); C.push(col[i3], col[i3 + 1], col[i3 + 2]);
      A.push(paint[i]); E.push(emit[i]);
    }
    index.push(k);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geom.setAttribute('aPaint', new THREE.Float32BufferAttribute(A, 1));
  geom.setAttribute('aEmit', new THREE.Float32BufferAttribute(E, 1));
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

export function createCarMaterial(uniforms, matOpts = {}) {
  const roughness = matOpts.roughness != null ? matOpts.roughness : 0.42;
  const metalness = matOpts.metalness != null ? matOpts.metalness : 0.35;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.uniforms.uStrobeTime = uStrobeTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPaint;\nattribute float aEmit;\nattribute vec4 iPaint;\nattribute float iBrake;\nvarying float vEmit;\nvarying float vBrake;'
      )
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n  vColor.rgb = mix(vColor.rgb, iPaint.rgb * (aPaint > 0.85 ? 1.0 : 0.8), step(0.01, aPaint) * iPaint.a);\n  float vChar = clamp(-iBrake, 0.0, 1.0);\n  vColor.rgb *= 1.0 - 0.88 * vChar;\n  vEmit = vChar > 0.9 ? 0.0 : aEmit;\n  vBrake = max(iBrake, 0.0);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nuniform float uStrobeTime;\nvarying float vEmit;\nvarying float vBrake;')
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
  mat.customProgramCacheKey = () => `we-traffic-car-v3-${roughness}-${metalness}`;
  return mat;
}

export function createCarMeshes(capacity, uniforms) {
  const baseMat = createCarMaterial(uniforms);
  return CAR_TYPES.map((t) => {
    const geom = flattenVehicle(t.base, t.options);
    const iPaint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const iBrake = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    iPaint.setUsage(THREE.DynamicDrawUsage);
    iBrake.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iPaint', iPaint);
    geom.setAttribute('iBrake', iBrake);
    const mat = t.metalness != null ? createCarMaterial(uniforms, t) : baseMat;
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
    return { type: t, mesh, iPaint, iBrake };
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
