/**
 * Multi-view (hemi-octahedral) tree impostors. [tree-impostor]
 *
 * Bake (once, on the first frame with a renderer): every species' detailed tree is rendered orthographically from
 * N x N view directions laid out on a hemi-octahedral grid (horizon .. straight down), into
 *   - an albedo atlas (linear colour incl. the baked canopy AO, alpha = coverage), mipmapped;
 *   - a half-resolution normal atlas (unit-tree space canopy normals).
 * Atlas: BLOCKS x BLOCKS species blocks, each N x N frames of C px.
 *
 * Render: one camera-facing quad per tree (InstancedMesh, the instance matrices of the vegetation buckets). The
 * vertex shader turns the view direction into tree-local space (undoing yaw and the non-uniform instance scale),
 * picks the 3 nearest frames on the grid with barycentric weights and projects the quad corner into each frame;
 * the fragment shader blends the 3 frames (albedo + normal), so the tree turns smoothly with the camera and is lit
 * by the real sun through its normals. Per-instance tint (season/climate) and snow work as on the 3D trees.
 * The same vertex logic, aimed at the sun, drives the shadow depth material (impostors cast proper shadows).
 */
import * as THREE from '../../vendor/three.module.js';
import { SPECIES_COUNT } from './flora_climate.js';
import { buildTreeGeometry, getFloraAtlas } from './tree_models.js';

export const IMP_N = 6; // frames per grid side
export const IMP_C = 96; // px per frame (albedo); the normal atlas is half resolution
export const IMP_BLOCKS = 4; // species blocks per atlas side (16 >= SPECIES_COUNT)
const ATLAS_W = IMP_N * IMP_C * IMP_BLOCKS;

/** Bounding sphere of the unit-scale detailed tree: [cx, cy, cz, r]. */
export function impostorSphere(sp) {
  const g = buildTreeGeometry(sp, 0);
  const bb = g.boundingBox;
  const c = new THREE.Vector3();
  bb.getCenter(c);
  let r = 0;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z;
    r = Math.max(r, dx * dx + dy * dy + dz * dz);
  }
  return [c.x, c.y, c.z, Math.sqrt(r) * 1.01];
}

function blockUV(sp) {
  const bx = sp % IMP_BLOCKS, by = Math.floor(sp / IMP_BLOCKS);
  return [bx / IMP_BLOCKS, by / IMP_BLOCKS];
}

/** Hemi-octahedral grid coordinate in [-1, 1]^2 -> unit direction (y up). Same math as the GLSL decode. */
function decodeDir(gx, gy) {
  const px = (gx + gy) * 0.5, pz = (gx - gy) * 0.5;
  const y = 1 - Math.abs(px) - Math.abs(pz);
  return new THREE.Vector3(px, Math.max(0, y), pz).normalize();
}

/** Billboard quad for one species: corners in [-1,1]^2 + per-vertex species constants. */
export function buildImpostorGeometry(sp) {
  const s = impostorSphere(sp);
  const [u0, v0] = blockUV(sp);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute('impA', new THREE.Float32BufferAttribute([...s, ...s, ...s, ...s], 4));
  g.setAttribute('impB', new THREE.Float32BufferAttribute([u0, v0, u0, v0, u0, v0, u0, v0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/**
 * Renders all species into the albedo + normal atlases. Returns { albedo, normal, dispose() }.
 * Each frame is drawn into a small depth-tested scratch target, then blitted into the (depth-less) atlas, so the
 * big atlases carry no depth buffer. Mipmaps are generated once at the end.
 */
export function bakeTreeImpostors(renderer) {
  const opts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const albedoRT = new THREE.WebGLRenderTarget(ATLAS_W, ATLAS_W, opts);
  const normalRT = new THREE.WebGLRenderTarget(ATLAS_W / 2, ATLAS_W / 2, opts);
  const atlas = getFloraAtlas();
  const albedoMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const normalMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main() { vUv = uv; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vN;
      void main() { if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }`,
    side: THREE.DoubleSide,
  });
  // blit: scratch texture -> atlas viewport (keeps alpha, no blending)
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const blitScene = new THREE.Scene();
  const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
  blit.frustumCulled = false;
  blitScene.add(blit);
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const prev = {
    rt: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
    auto: renderer.autoClear, shadow: renderer.shadowMap.enabled,
  };
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  const passes = [[albedoRT, albedoMat, IMP_C, 0x5c7a3c], [normalRT, normalMat, IMP_C / 2, 0x80ff80]];
  for (const [rt, mat, C, clear] of passes) {
    const scratch = new THREE.WebGLRenderTarget(C, C, { generateMipmaps: false, minFilter: THREE.LinearFilter, depthBuffer: true });
    blitMat.uniforms.t.value = scratch.texture;
    renderer.setRenderTarget(rt); // allocates the full mip chain (generateMipmaps is still true here)
    renderer.setClearColor(clear, 0); // foliage-coloured transparent fringe: mip edges don't go black
    renderer.clear(true, false, false);
    rt.texture.generateMipmaps = false; // no per-blit mip rebuilds
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const [cx, cy, cz, R] = impostorSphere(sp);
      const mesh = new THREE.Mesh(buildTreeGeometry(sp, 0), mat);
      scene.add(mesh);
      cam.left = -R;
      cam.right = R;
      cam.top = R;
      cam.bottom = -R;
      cam.far = 4 * R + 10;
      cam.updateProjectionMatrix();
      const bx = (sp % IMP_BLOCKS) * IMP_N * C, by = Math.floor(sp / IMP_BLOCKS) * IMP_N * C;
      for (let j = 0; j < IMP_N; j++) {
        for (let i = 0; i < IMP_N; i++) {
          const d = decodeDir(((i + 0.5) / IMP_N) * 2 - 1, ((j + 0.5) / IMP_N) * 2 - 1);
          cam.position.set(cx + d.x * (2 * R + 5), cy + d.y * (2 * R + 5), cz + d.z * (2 * R + 5));
          cam.up.set(0, 1, 0);
          cam.lookAt(cx, cy, cz);
          renderer.setRenderTarget(scratch);
          renderer.clear(true, true, false);
          renderer.render(scene, cam);
          rt.viewport.set(bx + i * C, by + j * C, C, C);
          renderer.setRenderTarget(rt);
          renderer.render(blitScene, blitCam);
        }
      }
      scene.remove(mesh);
    }
    scratch.dispose();
    rt.viewport.set(0, 0, rt.width, rt.height);
    rt.texture.generateMipmaps = true;
    // one empty draw so three rebuilds the mip chain of the finished atlas
    rt.scissor.set(0, 0, 1, 1);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    rt.scissorTest = false;
  }
  renderer.setRenderTarget(prev.rt);
  renderer.setClearColor(prev.clear, prev.alpha);
  renderer.autoClear = prev.auto;
  renderer.shadowMap.enabled = prev.shadow;
  albedoMat.dispose();
  normalMat.dispose();
  blitMat.dispose();
  blit.geometry.dispose();
  return {
    albedo: albedoRT.texture,
    normal: normalRT.texture,
    targets: [albedoRT, normalRT],
    dispose() {
      albedoRT.dispose();
      normalRT.dispose();
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Shader code
// ------------------------------------------------------------------------------------------------
const VERT_PARS = /* glsl */ `
attribute vec4 impA;
attribute vec2 impB;
uniform vec3 uImpLight;
uniform vec4 uImpCam; // shadow pass: main camera position + max caster distance
varying vec4 vImpF01;
varying vec2 vImpF2;
varying vec4 vImpL01;
varying vec2 vImpL2;
varying vec3 vImpW;
varying vec2 vImpRot;
vec3 impDecode(vec2 g) {
  vec2 p = vec2(g.x + g.y, g.x - g.y) * 0.5;
  return normalize(vec3(p.x, max(0.0, 1.0 - abs(p.x) - abs(p.y)), p.y));
}
vec2 impEncode(vec3 d) {
  d.y = max(d.y, 0.0);
  vec3 a = d / (abs(d.x) + abs(d.y) + abs(d.z));
  return vec2(a.x + a.z, a.x - a.z);
}
vec2 impFrameUV(vec2 f, vec3 off, float R) {
  vec3 d = impDecode((f + 0.5) / ${IMP_N.toFixed(1)} * 2.0 - 1.0);
  vec3 rt = cross(vec3(0.0, 1.0, 0.0), d);
  rt = dot(rt, rt) < 1e-8 ? vec3(1.0, 0.0, 0.0) : normalize(rt);
  vec3 up = cross(d, rt);
  return vec2(dot(off, rt), dot(off, up)) / R * 0.5 + 0.5;
}
`;

// Replaces begin_vertex .. project_vertex: camera-facing quad + frame selection. Needs USE_INSTANCING.
const VERT_MAIN = (shadow) => /* glsl */ `
  vec3 impRoot = instanceMatrix[3].xyz;
  vec3 impC0 = instanceMatrix[0].xyz;
  float impS = length(impC0);
  float impSY = length(instanceMatrix[1].xyz);
  vec2 impCS = vec2(impC0.x, -impC0.z) / max(impS, 1e-5); // cos r, sin r
  vImpRot = impCS;
  vec3 impScl = vec3(impS, impSY, impS);
  vec3 impCL = impA.xyz;
  float impR = impA.w;
  vec3 impCs = impCL * impScl;
  vec3 impCW = impRoot + vec3(impCS.x * impCs.x + impCS.y * impCs.z, impCs.y, -impCS.y * impCs.x + impCS.x * impCs.z);
  vec3 impV = ${shadow ? 'uImpLight' : '(cameraPosition - (modelMatrix * vec4(impCW, 1.0)).xyz)'};
  // to unit-tree local space: inverse yaw, then undo the non-uniform scale
  vec3 impVL = vec3(impCS.x * impV.x - impCS.y * impV.z, impV.y, impCS.y * impV.x + impCS.x * impV.z) / impScl;
  impVL = normalize(impVL);
  impVL.y = max(impVL.y, 0.02);
  impVL = normalize(impVL);
  vec3 impRt = cross(vec3(0.0, 1.0, 0.0), impVL);
  impRt = dot(impRt, impRt) < 1e-8 ? vec3(1.0, 0.0, 0.0) : normalize(impRt);
  vec3 impUp = cross(impVL, impRt);
  vec3 impOff = (impRt * position.x + impUp * position.y) * impR;
  vec3 impQ = (impCL + impOff) * impScl;
  vec3 impWP = impRoot + vec3(impCS.x * impQ.x + impCS.y * impQ.z, impQ.y, -impCS.y * impQ.x + impCS.x * impQ.z);
  // 3 nearest frames on the grid + barycentric weights
  vec2 impG = (impEncode(impVL) * 0.5 + 0.5) * ${IMP_N.toFixed(1)} - 0.5;
  vec2 impB0 = floor(impG);
  vec2 impFr = impG - impB0;
  vec2 impFa, impFb, impFc;
  if (impFr.x + impFr.y < 1.0) {
    impFa = impB0; impFb = impB0 + vec2(1.0, 0.0); impFc = impB0 + vec2(0.0, 1.0);
    vImpW = vec3(1.0 - impFr.x - impFr.y, impFr.x, impFr.y);
  } else {
    impFa = impB0 + vec2(1.0); impFb = impB0 + vec2(0.0, 1.0); impFc = impB0 + vec2(1.0, 0.0);
    vImpW = vec3(impFr.x + impFr.y - 1.0, 1.0 - impFr.x, 1.0 - impFr.y);
  }
  float impMx = ${(IMP_N - 1).toFixed(1)};
  impFa = clamp(impFa, 0.0, impMx); impFb = clamp(impFb, 0.0, impMx); impFc = clamp(impFc, 0.0, impMx);
  float impCell = 1.0 / ${(IMP_N * IMP_BLOCKS).toFixed(1)};
  vImpF01 = vec4(impB + impFa * impCell, impB + impFb * impCell);
  vImpF2 = impB + impFc * impCell;
  vImpL01 = vec4(impFrameUV(impFa, impOff, impR), impFrameUV(impFb, impOff, impR));
  vImpL2 = impFrameUV(impFc, impOff, impR);
  vec3 transformed = impWP;
  vec4 mvPosition = viewMatrix * modelMatrix * vec4(impWP, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  if (impS < 1e-4) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // destroyed tree (zeroed instance)
  ${shadow ? 'if (distance(impRoot, uImpCam.xyz) > uImpCam.w) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // far trees: no caster' : ''}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uImpAlbedo;
uniform sampler2D uImpNormal;
varying vec4 vImpF01;
varying vec2 vImpF2;
varying vec4 vImpL01;
varying vec2 vImpL2;
varying vec3 vImpW;
varying vec2 vImpRot;
float impLod;
vec4 impTap(sampler2D t, vec2 org, vec2 l) {
  vec2 lc = clamp(l, vec2(0.012), vec2(0.988));
  float inside = step(abs(l.x - 0.5), 0.5) * step(abs(l.y - 0.5), 0.5);
  return textureLod(t, org + lc / ${(IMP_N * IMP_BLOCKS).toFixed(1)}, impLod) * vec4(1.0, 1.0, 1.0, inside);
}
vec4 impDominant(sampler2D t) {
  if (vImpW.x >= vImpW.y && vImpW.x >= vImpW.z) return impTap(t, vImpF01.xy, vImpL01.xy);
  if (vImpW.y >= vImpW.z) return impTap(t, vImpF01.zw, vImpL01.zw);
  return impTap(t, vImpF2, vImpL2);
}
vec4 impBlend(sampler2D t) {
  vec4 a = impTap(t, vImpF01.xy, vImpL01.xy), b = impTap(t, vImpF01.zw, vImpL01.zw), c = impTap(t, vImpF2, vImpL2);
  float w = a.a * vImpW.x + b.a * vImpW.y + c.a * vImpW.z;
  vec3 rgb = (a.rgb * a.a * vImpW.x + b.rgb * b.a * vImpW.y + c.rgb * c.a * vImpW.z) / max(w, 1e-4);
  return vec4(rgb, w);
}
void impSetLod() {
  vec2 px = vImpL01.xy * ${(IMP_C).toFixed(1)};
  float m = max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px)));
  impLod = clamp(0.5 * log2(max(m, 1e-6)), 0.0, 2.5);
}
`;

/** Lit impostor material (MeshStandardMaterial + shader patch). `lod` = shared LOD/fade uniforms. */
export function createImpostorMaterial(imp, lod, flora) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  mat.name = 'treeImpostor';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uImpAlbedo = { value: imp.albedo };
    shader.uniforms.uImpNormal = { value: imp.normal };
    shader.uniforms.uImpLight = { value: new THREE.Vector3(0, 1, 0) };
    shader.uniforms.uVegSnow = flora.uVegSnow;
    for (const k in lod) shader.uniforms[k] = lod[k];
    shader.vertexShader = VERT_PARS + LOD_VERT_PARS + 'varying vec3 vVegTint;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '')
      .replace('#include <project_vertex>', VERT_MAIN(false) + LOD_VERT_MAIN('impRoot', '2.0'))
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(impWP, 1.0);')
      .replace('#include <color_vertex>', `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec3(1.0); // instance colour is the foliage tint (applied below), not a plain multiplier
        #endif
        #ifdef USE_INSTANCING_COLOR
          vVegTint = instanceColor.xyz;
        #else
          vVegTint = vec3(1.0);
        #endif`);
    shader.fragmentShader = FRAG_PARS + LOD_FRAG_PARS + 'uniform float uVegSnow;\nvarying vec3 vVegTint;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  vegLodDiscard();')
      .replace('#include <map_fragment>', `impSetLod();
        vec4 impAlb = impBlend(uImpAlbedo);
        vec4 impNrm = impDominant(uImpNormal); // normals are smooth: one tap is enough
        diffuseColor *= impAlb;
        {
          float vegLeaf = smoothstep(0.0, 0.05, diffuseColor.g - diffuseColor.r);
          float vegTk = clamp(dot(vVegTint, vec3(0.3333)), 0.8, 1.12);
          float vegAu = clamp(length(vVegTint - vec3(1.0)) * 0.9, 0.0, 0.85) * vegLeaf;
          float vegL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, vegL * vec3(0.95, 1.12, 0.62), vegAu);
          diffuseColor.rgb *= mix(vec3(vegTk), vVegTint, vegLeaf);
        }`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0;
        vec3 impNL = impNrm.w > 0.01 ? normalize(impNrm.xyz * 2.0 - 1.0 + vec3(0.0, 1e-3, 0.0)) : vec3(0.0, 1.0, 0.0);
        vec3 impNW = vec3(vImpRot.x * impNL.x + vImpRot.y * impNL.z, impNL.y, -vImpRot.y * impNL.x + vImpRot.x * impNL.z);
        vec3 normal = normalize((viewMatrix * vec4(impNW, 0.0)).xyz);
        vec3 nonPerturbedNormal = normal;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), clamp(uVegSnow * smoothstep(0.1, 0.65, impNW.y), 0.0, 0.9));`)
      .replace('#include <normal_fragment_maps>', '');
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'tree-impostor-1';
  return mat;
}

/** Shadow caster for impostors: the quad faces the sun (uImpLight = direction towards the light). */
export function createImpostorDepthMaterial(imp, lightDir, camInfo) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uImpAlbedo = { value: imp.albedo };
    shader.uniforms.uImpNormal = { value: imp.normal };
    shader.uniforms.uImpLight = lightDir;
    shader.uniforms.uImpCam = camInfo;
    shader.vertexShader = VERT_PARS + shader.vertexShader
      .replace('#include <begin_vertex>', '')
      .replace('#include <project_vertex>', VERT_MAIN(true))
      .replace('#include <worldpos_vertex>', '');
    shader.fragmentShader = FRAG_PARS + shader.fragmentShader.replace('#include <map_fragment>', `impSetLod();
        diffuseColor.a *= impBlend(uImpAlbedo).a;`);
  };
  mat.customProgramCacheKey = () => 'tree-impostor-depth-1';
  return mat;
}

// ------------------------------------------------------------------------------------------------
// Distance LOD crossfade (shared by the 3D tree materials and the impostors)
// ------------------------------------------------------------------------------------------------
// Each tree is drawn by every LOD whose band contains it; within the overlap bands the LODs dither complementary
// screen-door masks driven by the exact per-frame camera distance, so switching never pops.
// uLodMode: 0 near, 1 mid, 2 far, 3 none (falling trees / stumps).
export const LOD_VERT_PARS = /* glsl */ `
uniform vec4 uLodR; // near/mid radius, mid/far radius, band half-width, far cull radius
uniform float uLodMode;
varying vec2 vVegFade;
`;
export const LOD_VERT_MAIN = (rootExpr, modeExpr = 'uLodMode') => /* glsl */ `
  {
    float vegD = distance(cameraPosition, (modelMatrix * vec4(${rootExpr}, 1.0)).xyz);
    float vegA = 1.0 - smoothstep(uLodR.x - uLodR.z, uLodR.x + uLodR.z, vegD);
    float vegB = 1.0 - smoothstep(uLodR.y - uLodR.z, uLodR.y + uLodR.z, vegD);
    float vegC = 1.0 - smoothstep(uLodR.w - 40.0, uLodR.w, vegD);
    float vegM = ${modeExpr};
    vVegFade = vegM < 0.5 ? vec2(0.0, vegA) : vegM < 1.5 ? vec2(vegA, vegB) : vegM < 2.5 ? vec2(vegB, vegC) : vec2(0.0, 1.0);
    if (vVegFade.y - vVegFade.x < 0.002) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // outside this LOD: no raster work
  }
`;
export const LOD_FRAG_PARS = /* glsl */ `
varying vec2 vVegFade;
void vegLodDiscard() {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (n < vVegFade.x || n >= vVegFade.y) discard;
}
`;
