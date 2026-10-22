// Instanced render assets for AI traffic & pedestrians.
// Cars: existing vehicle models flattened into one merged geometry per type, drawn with one
// InstancedMesh each; per-instance paint + brake light, emissive head/tail lights at night.
// Pedestrians: one low-poly merged figure, walk cycle animated in the vertex shader.
import * as THREE from '../../vendor/three.module.js';
import { createVehicleModel } from '../entities.js';

const HEAD_HEX = 0xfff3c4;
const TAIL_HEX = 0xff2a2a;

// Paint masks per base model: material color hex -> paint weight (1 = main paint, 0.7 = lower band).
const PAINT_MASKS = {
  taxi: { 0xf4b942: 1.0, 0x1d4e89: 0.7 },
  supercar: { 0xd90429: 1.0 },
};

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
    const em = hex === HEAD_HEX ? 1 : hex === TAIL_HEX ? 2 : o.material.isMeshBasicMaterial ? 3 : 0;
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
];

export function createCarMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
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
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vEmit;\nvarying float vBrake;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float eHead = step(0.5, vEmit) * step(vEmit, 1.5);
    float eTail = step(1.5, vEmit) * step(vEmit, 2.5);
    float eGlow = step(2.5, vEmit);
    totalEmissiveRadiance += diffuseColor.rgb * (eHead * (0.3 + uLights * 2.6) + eTail * (0.25 + uLights * 1.1 + vBrake * 1.8) + eGlow * (0.35 + uLights * 0.9));
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-car-v1';
  return mat;
}

export function createCarMeshes(capacity, uniforms) {
  const mat = createCarMaterial(uniforms);
  return CAR_TYPES.map((t) => {
    const geom = flattenVehicle(t.base, { skipHex: t.skipHex || [] });
    const iPaint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const iBrake = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    iPaint.setUsage(THREE.DynamicDrawUsage);
    iBrake.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iPaint', iPaint);
    geom.setAttribute('iBrake', iBrake);
    const mesh = new THREE.InstancedMesh(geom, mat, capacity);
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
// aPart: 0 static, 1 left leg, 2 right leg, 3 left arm, 4 right arm
// aMat: 0 skin, 1 shirt, 2 pants, 3 fixed vertex color (hair / shoes)
function pushBox(acc, w, h, d, x, y, z, part, matId, rgb) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    acc.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    acc.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    acc.col.push(rgb[0], rgb[1], rgb[2]);
    acc.part.push(part);
    acc.mat.push(matId);
  }
  g.dispose();
}

function createPedGeometry() {
  const acc = { pos: [], nor: [], col: [], part: [], mat: [] };
  const dark = [0.08, 0.07, 0.07];
  pushBox(acc, 0.22, 0.24, 0.24, 0, 1.6, 0, 0, 0, dark);           // head
  pushBox(acc, 0.24, 0.07, 0.25, 0, 1.735, -0.01, 0, 3, dark);     // hair
  pushBox(acc, 0.42, 0.58, 0.24, 0, 1.18, 0, 0, 1, dark);          // torso
  pushBox(acc, 0.4, 0.12, 0.22, 0, 0.86, 0, 0, 2, dark);           // hips
  for (const [sx, part] of [[-0.11, 1], [0.11, 2]]) {
    pushBox(acc, 0.15, 0.78, 0.16, sx, 0.47, 0, part, 2, dark);    // leg
    pushBox(acc, 0.15, 0.08, 0.26, sx, 0.04, 0.04, part, 3, [0.12, 0.12, 0.13]); // shoe
  }
  for (const [sx, part] of [[-0.28, 3], [0.28, 4]]) {
    pushBox(acc, 0.11, 0.52, 0.12, sx, 1.18, 0, part, 1, dark);    // sleeve/arm
    pushBox(acc, 0.1, 0.1, 0.1, sx, 0.88, 0, part, 0, dark);       // hand
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  geom.setAttribute('aPart', new THREE.Float32BufferAttribute(acc.part, 1));
  geom.setAttribute('aMat', new THREE.Float32BufferAttribute(acc.mat, 1));
  geom.computeBoundingSphere();
  return geom;
}

const PED_ANIM_GLSL = `
  float pSw = sin(iAnim.x) * iAnim.y;
  float pAng = aPart < 0.5 ? 0.0 : aPart < 1.5 ? pSw : aPart < 2.5 ? -pSw : aPart < 3.5 ? -pSw * 0.8 : pSw * 0.8;
  float pPivot = aPart < 2.5 ? 0.9 : 1.45;
  float pC = cos(pAng), pS = sin(pAng);
`;

export function createPedMesh(capacity) {
  const geom = createPedGeometry();
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const iAnim = mk(2), iShirt = mk(3), iPants = mk(3), iSkin = mk(3);
  geom.setAttribute('iAnim', iAnim);
  geom.setAttribute('iShirt', iShirt);
  geom.setAttribute('iPants', iPants);
  geom.setAttribute('iSkin', iSkin);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aPart;\nattribute float aMat;\nattribute vec2 iAnim;\nattribute vec3 iShirt;\nattribute vec3 iPants;\nattribute vec3 iSkin;'
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
${PED_ANIM_GLSL}
  objectNormal = vec3(objectNormal.x, pC * objectNormal.y - pS * objectNormal.z, pS * objectNormal.y + pC * objectNormal.z);`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  {
    float ry = transformed.y - pPivot;
    transformed.yz = vec2(pPivot + pC * ry - pS * transformed.z, pS * ry + pC * transformed.z);
  }`
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  vColor.rgb = aMat < 0.5 ? iSkin : aMat < 1.5 ? iShirt : aMat < 2.5 ? iPants : vColor.rgb;`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-v1';
  const mesh = new THREE.InstancedMesh(geom, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'traffic_pedestrians';
  return { mesh, iAnim, iShirt, iPants, iSkin };
}
