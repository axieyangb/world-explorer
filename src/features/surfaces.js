import * as THREE from '../../vendor/three.module.js';

/**
 * Weather/sky-aware surface shaders, patched in-place onto the shared materials via onBeforeCompile
 * (so worker-built chunks, horizon meshes and everything else using them pick it up for free):
 *   - waterMat:   animated normal waves, fresnel sky reflection, sun glint, shoreline foam
 *   - roadMat:    wet look in rain (darker albedo, low roughness, puddles, streaky sky reflections)
 *   - terrainMat / parkMat: slight wet darkening
 * All materials share one uniform set (SURFACE_UNIFORMS) driven by src/features/atmosphere.js.
 */
export const SURFACE_UNIFORMS = {
  uAtmoTime: { value: 0 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uSkyZenith: { value: new THREE.Color(0x2b6cb0) },
  uSkyHorizon: { value: new THREE.Color(0xbfd8ec) },
  uLightLevel: { value: 1 },
  uNightGlow: { value: 0 },
};

const NOISE_GLSL = `
float atmoHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float atmoNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(atmoHash(i), atmoHash(i + vec2(1.0, 0.0)), u.x),
             mix(atmoHash(i + vec2(0.0, 1.0)), atmoHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const COMMON_PARS = `
uniform float uAtmoTime;
uniform float uWet;
uniform float uRain;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uLightLevel;
uniform float uNightGlow;
varying vec3 vAtmoWorld;
${NOISE_GLSL}
vec3 atmoSky(vec3 r) {
  return mix(uSkyHorizon, uSkyZenith, pow(clamp(r.y, 0.0, 1.0), 0.5));
}
`;

function addWorldPosVarying(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAtmoWorld;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvAtmoWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
}

function bindUniforms(shader) {
  for (const [k, u] of Object.entries(SURFACE_UNIFORMS)) shader.uniforms[k] = u;
}

function chainCompile(mat, fn, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    fn(shader);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + key;
  mat.needsUpdate = true;
}

function patchWater(mat) {
  mat.color.setHex(0x1a5470);
  mat.roughness = 0.07;
  mat.metalness = 0.0;
  chainCompile(
    mat,
    (shader) => {
      bindUniforms(shader);
      addWorldPosVarying(shader);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vShoreUv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvShoreUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${COMMON_PARS}\nvarying vec2 vShoreUv;
          vec2 waterWaveGrad(vec2 p, float t, float fade) {
            vec2 g = vec2(0.0);
            // (dirX, dirZ, wavenumber, amplitude*k) summed directional waves
            vec4 w[6];
            w[0] = vec4(0.80, 0.60, 0.31, 0.050);
            w[1] = vec4(-0.45, 0.89, 0.53, 0.040);
            w[2] = vec4(0.97, -0.24, 0.92, 0.032);
            w[3] = vec4(-0.70, -0.71, 1.57, 0.026);
            w[4] = vec4(0.20, 0.98, 2.70, 0.020);
            w[5] = vec4(-0.93, 0.36, 4.10, 0.016);
            for (int i = 0; i < 6; i++) {
              float k = w[i].z;
              float ph = dot(w[i].xy, p) * k + t * sqrt(9.8 * k);
              float hf = (i >= 4) ? fade * fade : fade;
              g += w[i].xy * cos(ph) * w[i].w * hf;
            }
            return g;
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float wDist = length(vAtmoWorld - cameraPosition);
          float wFade = 1.0 / (1.0 + wDist * 0.006);
          vec2 wg = waterWaveGrad(vAtmoWorld.xz, uAtmoTime, wFade) * (1.0 + uRain * 0.6);
          // rain ripples
          float rp = atmoNoise(vAtmoWorld.xz * 1.7 + vec2(uAtmoTime * 1.3, -uAtmoTime));
          float rq = atmoNoise(vAtmoWorld.xz * 1.7 + vec2(-uAtmoTime, uAtmoTime * 1.1) + 7.3);
          wg += (vec2(rp, rq) - 0.5) * 0.14 * uRain * wFade;
          vec3 wNw = normalize(vec3(-wg.x, 1.0, -wg.y));
          normal = normalize((viewMatrix * vec4(wNw, 0.0)).xyz);`
        )
        .replace(
          '#include <opaque_fragment>',
          `{
            vec3 Vw = normalize(cameraPosition - vAtmoWorld);
            float cosV = max(dot(Vw, wNw), 0.0);
            float fres = 0.06 + 0.94 * pow(1.0 - cosV, 5.0);
            vec3 Rw = reflect(-Vw, wNw);
            Rw.y = abs(Rw.y);
            vec3 skyR = atmoSky(Rw);
            outgoingLight = mix(outgoingLight, skyR, clamp(fres, 0.0, 1.0) * 0.9);
            float shoreDist = vShoreUv.y > 0.5 ? (vShoreUv.y - 1.0 - abs(vShoreUv.x)) : 1000.0;
            float fn = atmoNoise(vAtmoWorld.xz * 0.45 + vec2(uAtmoTime * 0.25, 0.0));
            float band = 0.5 + 0.5 * sin(shoreDist * 2.2 - uAtmoTime * 1.6 + fn * 4.0);
            float foam = (1.0 - smoothstep(0.0, 3.5, shoreDist)) * (0.55 + 0.45 * band) * smoothstep(0.25, 0.7, fn + 0.25);
            float shallow = 1.0 - smoothstep(0.0, 12.0, shoreDist);
            outgoingLight *= 1.0 - 0.25 * shallow;
            outgoingLight = mix(outgoingLight, vec3(0.86, 0.9, 0.92) * uLightLevel, clamp(foam, 0.0, 1.0) * 0.75);
          }
          #include <opaque_fragment>`
        );
    },
    'atmo-water-1'
  );
}

function patchRoad(mat) {
  chainCompile(
    mat,
    (shader) => {
      bindUniforms(shader);
      addWorldPosVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON_PARS}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float puddle = 0.0;
          if (uWet > 0.001) {
            float pn = atmoNoise(vAtmoWorld.xz * 0.06) * 0.65 + atmoNoise(vAtmoWorld.xz * 0.21 + 3.1) * 0.35;
            puddle = smoothstep(0.56, 0.68, pn) * uWet;
            diffuseColor.rgb *= mix(1.0, 0.6, uWet) * mix(1.0, 0.7, puddle);
            roughnessFactor = mix(roughnessFactor, 0.36, uWet);
            roughnessFactor = mix(roughnessFactor, 0.04, puddle);
          }`
        )
        .replace(
          '#include <opaque_fragment>',
          `if (uWet > 0.001) {
            vec3 Vw = normalize(cameraPosition - vAtmoWorld);
            float ripple = (atmoNoise(vAtmoWorld.xz * 2.3 + uAtmoTime * 2.0) - 0.5) * 0.06 * uRain;
            vec3 Nw = normalize(vec3(ripple, 1.0, -ripple));
            float fres = 0.04 + 0.96 * pow(1.0 - max(dot(Vw, Nw), 0.0), 5.0);
            vec2 vd = normalize(Vw.xz + vec2(1e-4));
            vec2 sc = vec2(dot(vAtmoWorld.xz, vec2(-vd.y, vd.x)) * 0.35, dot(vAtmoWorld.xz, vd) * 0.035);
            float streak = atmoNoise(sc) * 0.7 + atmoNoise(sc * 2.7 + 5.0) * 0.3;
            vec3 Rw = reflect(-Vw, Nw);
            vec3 refl = atmoSky(vec3(Rw.x, abs(Rw.y), Rw.z)) * (0.75 + 0.5 * streak);
            refl += vec3(1.0, 0.72, 0.42) * pow(streak, 4.0) * uNightGlow * 0.6;
            outgoingLight = mix(outgoingLight, refl, clamp(fres * (0.15 + 0.85 * puddle / max(uWet, 0.001)) * uWet, 0.0, 0.5));
          }
          #include <opaque_fragment>`
        );
    },
    'atmo-road-1'
  );
}

function patchWetGround(mat, amount, key) {
  chainCompile(
    mat,
    (shader) => {
      shader.uniforms.uWet = SURFACE_UNIFORMS.uWet;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWet;')
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\ndiffuseColor.rgb *= 1.0 - ${amount.toFixed(2)} * uWet;\nroughnessFactor = mix(roughnessFactor, roughnessFactor * 0.7, uWet);`
        );
    },
    key
  );
}

export function installSurfaceShaders(mats) {
  if (!mats) return;
  if (mats.waterMat) patchWater(mats.waterMat);
  if (mats.roadMat) patchRoad(mats.roadMat);
  if (mats.terrainMat) patchWetGround(mats.terrainMat, 0.22, 'atmo-wet-terrain');
  if (mats.parkMat) patchWetGround(mats.parkMat, 0.18, 'atmo-wet-park');
}
