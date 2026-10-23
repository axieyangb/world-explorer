// Instanced render assets for AI traffic & pedestrians.
// Cars: existing vehicle models flattened into one merged geometry per type, drawn with one
// InstancedMesh each; per-instance paint + brake light, emissive head/tail lights at night.
// Pedestrians: one low-poly merged figure, walk cycle animated in the vertex shader.
import * as THREE from '../../vendor/three.module.js';
import { createVehicleModel } from '../entities.js';
import { personParts, PERSON_ANIM_GLSL, PERSON_BEGIN_GLSL } from './person_model.js';

const HEAD_HEX = 0xfff3c4;
const TAIL_HEX = 0xff2a2a;

// Paint masks per base model: material color hex -> paint weight (1 = main paint, 0.7 = lower band).
const PAINT_MASKS = {
  taxi: { 0xf4b942: 1.0, 0x1d4e89: 0.7 },
  supercar: { 0xd90429: 1.0 },
  tesla: { 0xf4f6f9: 1.0 },
  tow_truck: { 0xf59f00: 1.0 },
};

const uStrobeTime = { value: 0 };

function flattenVehicle(typeId, { skipHex = [] } = {}) {
  const model = createVehicleModel(typeId);
  const vfx = model.userData.nitroVfx;
  if (vfx && vfx.parent) vfx.parent.remove(vfx);
  model.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], paint = [], emit = [];
  const mask = PAINT_MASKS[typeId] || {};
  const tmpN = new THREE.Matrix3();
  const v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
    const hex = o.material.color ? o.material.color.getHex() : 0x888888;
    if (skipHex.includes(hex)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    tmpN.getNormalMatrix(o.matrixWorld);
    const c = o.material.color || new THREE.Color(0x888888);
    const pw = mask[hex] || 0;
    const em = o.userData?.emitCode || (hex === HEAD_HEX ? 1 : hex === TAIL_HEX ? 2 : o.material.isMeshBasicMaterial ? 3 : 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
      nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
      paint.push(pw);
      emit.push(em);
    }
    g.dispose();
  });
  model.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('aPaint', new THREE.Float32BufferAttribute(paint, 1));
  geom.setAttribute('aEmit', new THREE.Float32BufferAttribute(emit, 1));
  geom.computeBoundingSphere();
  return geom;
}

export const CAR_TYPES = [
  { id: 'sedan', base: 'taxi', skipHex: [0xffe066], length: 4.5, width: 1.9 },
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
        '#include <color_vertex>\n  vColor.rgb = mix(vColor.rgb, iPaint.rgb * (aPaint > 0.85 ? 1.0 : 0.8), step(0.01, aPaint) * iPaint.a);\n  vEmit = aEmit;\n  vBrake = iBrake;'
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
  mat.customProgramCacheKey = () => `we-traffic-car-v2-${roughness}-${metalness}`;
  return mat;
}

export function createCarMeshes(capacity, uniforms) {
  const baseMat = createCarMaterial(uniforms);
  return CAR_TYPES.map((t) => {
    const geom = flattenVehicle(t.base, { skipHex: t.skipHex || [] });
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
// Shared person model (src/features/person_model.js): rounded head with a face on the front, hair covering
// the back, forward shoe toes, V-neck/zipper fronts, optional backpack/bag/cap/glasses/coat/umbrella toggled
// per instance by a style bitmask (disabled parts collapse to a degenerate point in the vertex shader).
function createPedGeometry() {
  const pos = [], nor = [], col = [], info = [];
  for (const pt of personParts()) {
    const g = pt.geom;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(pt.rgb[0], pt.rgb[1], pt.rgb[2]);
      info.push(pt.part, pt.mat, pt.opt);
    }
    g.dispose();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
  geom.computeBoundingSphere();
  return geom;
}

export function createPedMesh(capacity) {
  const geom = createPedGeometry();
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  // iAnim = (walk phase, swing amplitude, style bits)
  const iAnim = mk(3), iShirt = mk(3), iPants = mk(3), iSkin = mk(3), iHair = mk(3), iAcc = mk(3);
  geom.setAttribute('iAnim', iAnim);
  geom.setAttribute('iShirt', iShirt);
  geom.setAttribute('iPants', iPants);
  geom.setAttribute('iSkin', iSkin);
  geom.setAttribute('iHair', iHair);
  geom.setAttribute('iAcc', iAcc);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aInfo;\nattribute vec3 iAnim;\nattribute vec3 iShirt;\nattribute vec3 iPants;\nattribute vec3 iSkin;\nattribute vec3 iHair;\nattribute vec3 iAcc;'
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
${PERSON_ANIM_GLSL}
  objectNormal = vec3(objectNormal.x, pC * objectNormal.y - pS * objectNormal.z, pS * objectNormal.y + pC * objectNormal.z);`
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PERSON_BEGIN_GLSL}`)
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  {
    float m = aInfo.y;
    vColor.rgb = m < 0.5 ? iSkin : m < 1.5 ? iShirt : m < 2.5 ? iPants : m < 3.5 ? vColor.rgb : m < 4.5 ? iHair : iAcc;
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-v2';
  const mesh = new THREE.InstancedMesh(geom, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'traffic_pedestrians';
  return { mesh, iAnim, iShirt, iPants, iSkin, iHair, iAcc, tris: geom.attributes.position.count / 3 };
}
