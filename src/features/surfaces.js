import * as THREE from '../../vendor/three.module.js';
import { liteSurfaces } from './quality.js'; // [ui-mobile] Low / touch-Medium tiers use the lite road + water shaders

/**
 * Weather/sky-aware surface shaders, patched in-place onto the shared materials via onBeforeCompile
 * (so worker-built chunks, horizon meshes and everything else using them pick it up for free):
 *   - waterMat:   animated normal waves, fresnel sky reflection, sun glint & micro-facet sparkle,
 *                 shallow-water turquoise absorption & bottom caustics, multi-band breaking shore waves & seafoam lace
 *   - roadMat:    wet look in rain (darker albedo, low roughness, puddles, streaky sky reflections)
 *   - terrainMat / parkMat: slight wet darkening
 *   [street-props] close-range ground detail, faded out by distance and pixel footprint so nothing shimmers:
 *   - roadMat:    asphalt mottling, aggregate grain, cracks, dual tire wear tracks, center oil-drip band,
 *                 gutter grime, curbside cast-iron storm-drain grates, utility-cut patches, manhole covers;
 *                 sidewalks / paved ways get concrete flags (uPaving 0) or block pavers (uPaving 1) with joints,
 *                 per-slab tone, stains, gum spots, tactile warning blister strips and street-tree grates/soil pits.
 *   - streetCurbMat: kerb stones with joints and grain;  line materials: worn paint, dimmed at night
 *   - terrainMat / parkMat: grass colour variation, blade grain, bare patches, park mowing stripes & wildflowers,
 *                 steep-slope rocky outcrop strata & scree cracks, and coastal sand ripples + wet-sand shoreline band
 * All materials share one uniform set (SURFACE_UNIFORMS) driven by src/features/atmosphere.js;
 * the uSea* / uSwell / uWhitecap terms come from src/features/sea_state.js (live sea state).
 */
export const SURFACE_UNIFORMS = {
  uAtmoTime: { value: 0 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uSkyZenith: { value: new THREE.Color(0x2b6cb0) },
  uSkyHorizon: { value: new THREE.Color(0xbfd8ec) },
  uLightLevel: { value: 1 },
  uNightGlow: { value: 0 },
  // [sea-state] chop amplitude scale; wind (toward dirX, dirZ, alignment 0..1); swell (dirX, dirZ, k, slope)
  uSeaChop: { value: 0.8 },
  uSeaWind: { value: new THREE.Vector3(0.94, 0.34, 0.3) },
  uSwell: { value: new THREE.Vector4(0.94, 0.34, 0.06, 0.03) },
  uWhitecap: { value: 0 },
  uPaving: { value: 0 }, // [street-props] 0 = concrete flags, 1 = block pavers (set from the street region)
  uChunkCenter: { value: new THREE.Vector2(0, 0) },
  uChunkFadeInner: { value: 850.0 },
  uChunkFadeOuter: { value: 1450.0 },
  uCamAlt: { value: 20.0 },
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

const MACRO_CARPET_GLSL = `
uniform vec2 uChunkCenter;
uniform float uChunkFadeInner;
uniform float uChunkFadeOuter;
uniform float uCamAlt;
vec3 evalMacroUrbanCarpet(vec2 wp) {
  float fpw = max(length(fwidth(wp)), 0.05);
  vec2 warp = (vec2(atmoNoise(wp * 0.0022), atmoNoise(wp * 0.0022 + 5.7)) - 0.5) * 16.0;
  vec2 bp = wp + warp;
  vec2 cell = vec2(105.0, 130.0);
  vec2 bid = floor(bp / cell);
  vec2 bf = abs(fract(bp / cell) - 0.5) * cell;
  float edgeD = min(cell.x * 0.5 - bf.x, cell.y * 0.5 - bf.y);
  float gridFade = 1.0 - smoothstep(1.8, 12.0, fpw);
  float streetMask = (1.0 - smoothstep(4.8 - fpw * 0.5, 5.8 + fpw * 0.5, edgeD)) * gridFade;
  float sidewalkMask = (smoothstep(4.5, 5.5, edgeD) * (1.0 - smoothstep(8.2 - fpw * 0.5, 9.5 + fpw * 0.5, edgeD))) * gridFade;
  vec2 lotP = bp / vec2(26.0, 22.0);
  vec2 lotId = floor(lotP);
  float lotH = atmoHash(lotId + bid * 3.17);
  float lotFade = 1.0 - smoothstep(0.6, 4.5, fpw);
  vec3 blockBase = mix(vec3(0.53, 0.52, 0.50), vec3(0.61, 0.60, 0.58), smoothstep(0.25, 0.85, lotH));
  blockBase = mix(vec3(0.56, 0.55, 0.53), blockBase, lotFade * 0.75);
  float macroMottle = atmoNoise(wp * 0.0035) * 0.6 + atmoNoise(wp * 0.014 + 2.3) * 0.4;
  blockBase *= 0.92 + 0.16 * macroMottle;
  vec3 sidewalkCol = vec3(0.63, 0.64, 0.65) * (0.95 + 0.10 * macroMottle);
  vec3 streetCol = vec3(0.35, 0.36, 0.38) * (0.94 + 0.12 * macroMottle);
  vec3 col = mix(blockBase, sidewalkCol, sidewalkMask * 0.75);
  col = mix(col, streetCol, streetMask * 0.82);
  return col;
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
${MACRO_CARPET_GLSL}
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

function addWorldPosAndNormVarying(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAtmoWorld;\nvarying vec3 vWorldNorm;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nvAtmoWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);'
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
          ${liteSurfaces() ? '#define WATER_LITE' : ''}
          uniform float uSeaChop;
          uniform vec3 uSeaWind;
          uniform vec4 uSwell;
          uniform float uWhitecap;
          float wSwellCrest;
          // chopS / swellS: local sea-state scale (rivers + near-shore water stay calmer than open sea)
          vec2 waterWaveGrad(vec2 p, float t, float fade, float chopS, float swellS) {
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
              // waves travel along -dir: those running with the wind grow, those against it shrink
              float al = max(0.25, 1.0 + uSeaWind.z * 0.7 * (dot(-w[i].xy, uSeaWind.xy) - 0.25));
              g += w[i].xy * cos(ph) * w[i].w * hf * al;
            }
            // gusty patches (cat's paws) so strong chop never reads as one regular stripe pattern
            float gust = 0.45 + 1.1 * atmoNoise(p * 0.021 + uSeaWind.xy * (t * 0.35));
            g *= uSeaChop * chopS * mix(1.0, gust, clamp(uSeaChop - 0.5, 0.0, 1.0));
            // long swell from the real direction (two close components so crests are not ruler-straight)
            vec2 sd = uSwell.xy;
            vec2 sd2 = vec2(sd.x * 0.978 - sd.y * 0.208, sd.x * 0.208 + sd.y * 0.978);
            float k1 = uSwell.z, k2 = uSwell.z * 1.37;
            float p1 = dot(sd, p) * k1 - t * sqrt(9.8 * k1);
            float p2 = dot(sd2, p) * k2 - t * sqrt(9.8 * k2) + 1.7;
            // wave groups: a slow large-scale envelope so the swell comes in sets, not endless stripes
            float env = 0.3 + 1.4 * atmoNoise(p * 0.0045 + sd * (t * 0.012));
            float sa = uSwell.w * swellS * env * mix(0.55, 1.0, fade);
            g += (sd * cos(p1) + sd2 * (cos(p2) * 0.45)) * sa;
            wSwellCrest = (sin(p1) * 0.7 + sin(p2) * 0.3) * min(env, 1.0);
            return g;
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float wDist = length(vAtmoWorld - cameraPosition);
          float wFade = 1.0 / (1.0 + wDist * 0.006);
          float wShore = vShoreUv.y > 0.5 ? (vShoreUv.y - 1.0 - abs(vShoreUv.x)) : 1000.0;
          float wRiver = step(0.01, abs(vShoreUv.x));
          float wOpen = smoothstep(2.0, 30.0, wShore) * (1.0 - wRiver);
          vec2 wg = waterWaveGrad(vAtmoWorld.xz, uAtmoTime, wFade, mix(0.35, 1.0, wOpen), wOpen * 0.85 + 0.15 * (1.0 - wRiver))
            * (1.0 + uRain * 0.6);
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
            if (shoreDist < 10.0) {
              // Shallow-water turquoise/emerald depth absorption & sunlit bottom caustics (shoreDist < 8.5)
              float shallow = 1.0 - smoothstep(0.0, 8.5, shoreDist);
              vec3 shallowTint = mix(vec3(0.08, 0.44, 0.47), vec3(0.22, 0.50, 0.43), 1.0 - smoothstep(0.0, 2.2, shoreDist)) * uLightLevel;
              outgoingLight = mix(outgoingLight, shallowTint, shallow * (1.0 - fres * 0.6) * 0.52);
              #ifndef WATER_LITE
              if (shoreDist < 8.5) {
                vec2 cUv = vAtmoWorld.xz * 0.72 + wNw.xz * 1.35;
                float c1 = abs(sin(cUv.x * 3.1 + uAtmoTime * 1.35 + atmoNoise(cUv * 0.85) * 3.4)
                             + cos(cUv.y * 3.3 - uAtmoTime * 1.15 + atmoNoise(cUv * 0.85 + 4.2) * 3.4));
                float c2 = abs(sin((cUv.x - cUv.y) * 2.5 - uAtmoTime * 1.05 + atmoNoise(cUv * 1.25 + 8.1) * 2.8)
                             + cos((cUv.x + cUv.y) * 2.7 + uAtmoTime * 1.45));
                float caustic = pow(clamp(1.0 - min(c1, c2) * 0.54, 0.0, 1.0), 3.0);
                caustic *= shallow * smoothstep(0.12, 0.85, shoreDist) * (1.0 - uRain * 0.75) * wFade * smoothstep(0.2, 0.7, uLightLevel);
                outgoingLight += vec3(0.36, 0.70, 0.64) * caustic * uLightLevel * 0.42;
              }
              #endif
              // Multi-band asymmetric breaking wave crests + trailing cellular seafoam lace (shoreDist < 4.5)
              if (shoreDist < 4.5) {
                float fn = atmoNoise(vAtmoWorld.xz * 0.40 + vec2(uAtmoTime * 0.20, -uAtmoTime * 0.12));
                float fn2 = atmoNoise(vAtmoWorld.xz * 1.35 - vec2(uAtmoTime * 0.28, uAtmoTime * 0.22) + 5.3);
                float wPhase = fract(shoreDist * 0.46 + uAtmoTime * 0.36 + fn * 0.55);
                float wPhase2 = fract(shoreDist * 0.76 + uAtmoTime * 0.48 + fn2 * 0.42 + 0.37);
                float crest1 = smoothstep(0.04, 0.16, wPhase) * (1.0 - smoothstep(0.16, 0.36, wPhase));
                float crest2 = smoothstep(0.05, 0.18, wPhase2) * (1.0 - smoothstep(0.18, 0.40, wPhase2)) * 0.75;
                float wake = smoothstep(0.12, 0.26, wPhase) * (1.0 - smoothstep(0.26, 0.84, wPhase));
                float cellA = abs(atmoNoise(vAtmoWorld.xz * 2.4 + vec2(uAtmoTime * 0.22, -uAtmoTime * 0.16)) - 0.5);
                float cellB = abs(atmoNoise(vAtmoWorld.xz * 5.1 - vec2(uAtmoTime * 0.16, uAtmoTime * 0.24) + 3.1) - 0.5);
                float lace = (1.0 - smoothstep(0.02, 0.14, min(cellA, cellB))) * smoothstep(0.20, 0.65, fn + 0.22);
                float swash = (1.0 - smoothstep(0.0, 0.85, shoreDist)) * (0.55 + 0.45 * sin(uAtmoTime * 1.9 + fn * 5.0));
                float shoreEnv = 1.0 - smoothstep(0.0, 4.5, shoreDist);
                float foam = shoreEnv * clamp((crest1 + crest2) * smoothstep(0.20, 0.65, fn + 0.25) + wake * lace * 0.85 + swash * 0.75, 0.0, 1.0);
                outgoingLight = mix(outgoingLight, vec3(0.90, 0.93, 0.95) * uLightLevel, foam * 0.82);
              }
            }
            // Solar glitter / micro-facet wave sparkle toward the sun direction
            {
              vec3 sunDirW = normalize(vec3(0.45, 0.42, 0.78));
              vec3 sunGlintCol = mix(uSkyHorizon, vec3(1.0, 0.95, 0.82), 0.65) * uLightLevel;
              #if NUM_DIR_LIGHTS > 0
              sunDirW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
              sunGlintCol = directionalLights[0].color * 0.65 + uSkyHorizon * 0.35;
              #endif
              vec3 Hw = normalize(Vw + vec3(sunDirW.x, max(sunDirW.y, 0.06), sunDirW.z));
              float specBroad = pow(max(dot(wNw, Hw), 0.0), 140.0);
              vec2 mUv = vAtmoWorld.xz * 3.8 + vec2(uAtmoTime * 0.85, -uAtmoTime * 0.65);
              vec2 mUv2 = vAtmoWorld.xz * 7.4 + vec2(-uAtmoTime * 1.1, uAtmoTime * 0.95) + 11.7;
              vec2 microJitter = (vec2(atmoNoise(mUv), atmoNoise(mUv2)) - 0.5) * 0.22 * wFade;
              vec3 microNw = normalize(vec3(wNw.x * 1.65 + microJitter.x, wNw.y, wNw.z * 1.65 + microJitter.y));
              float facetDot = max(dot(microNw, Hw), 0.0);
              float sparkle = smoothstep(0.990, 0.9992, facetDot) * (0.38 + 0.62 * smoothstep(0.60, 0.88, atmoNoise(mUv2 * 1.4)));
              float sunVis = smoothstep(0.14, 0.35, uLightLevel) * (1.0 - uRain * 0.85);
              outgoingLight += sunGlintCol * (specBroad * 0.52 + sparkle * 1.80 * wFade) * sunVis;
            }
            // [sea-state] whitecaps: wind-streaked patches riding the swell crests, open water only
            if (uWhitecap > 0.001 && wOpen > 0.01) {
              vec2 wd = uSeaWind.xy;
              vec2 q = vec2(dot(vAtmoWorld.xz, wd) - uAtmoTime * 2.2, dot(vAtmoWorld.xz, vec2(-wd.y, wd.x)));
              float n = atmoNoise(q * vec2(0.05, 0.085) + vec2(0.0, uAtmoTime * 0.05)) * 0.65
                      + atmoNoise(q * vec2(0.16, 0.26) + 4.7) * 0.35;
              float th = 1.07 - uWhitecap * 0.3;
              float cap = smoothstep(th, th + 0.12, n * 0.78 + (wSwellCrest * 0.5 + 0.5) * 0.4);
              // lacy breakup so a cap is broken foam, not a cotton-wool blob
              cap *= smoothstep(0.25, 0.65, atmoNoise(q * vec2(0.42, 0.7) + 9.1));
              #ifndef WATER_LITE
              cap *= 0.72 + 0.28 * atmoNoise(q * vec2(1.6, 2.4) + 2.3);
              #endif
              // far away: average coverage instead of sub-pixel speckle
              cap = mix(cap, uWhitecap * 0.12, smoothstep(220.0, 900.0, wDist));
              outgoingLight *= 1.0 - 0.14 * uWhitecap * wOpen; // heavy sea reads darker, greyer
              outgoingLight = mix(outgoingLight, vec3(0.9, 0.93, 0.95) * uLightLevel, clamp(cap * wOpen, 0.0, 1.0) * 0.85);
            }
          }
          #include <opaque_fragment>`
        );
    },
    liteSurfaces() ? 'atmo-water-3-lite' : 'atmo-water-3'
  );
}

// [street-props] road-surface uv varying + detail helpers
function addRoadUvVarying(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvRoadUv = uv;');
}

const DETAIL_PARS = `
varying vec2 vRoadUv;
uniform float uPaving;
float rdFbm(vec2 p) { return atmoNoise(p) * 0.5 + atmoNoise(p * 2.03 + 1.7) * 0.3 + atmoNoise(p * 4.07 + 3.1) * 0.2; }
// thin meandering line where a noise field crosses 0.5, anti-aliased by its own screen-space rate
float rdCrack(vec2 p, float w) {
  vec2 q = p + (vec2(atmoNoise(p * 6.0), atmoNoise(p * 6.0 + 7.7)) - 0.5) * 0.22; // jagged, not smooth contours
  float n = atmoNoise(q) * 0.65 + atmoNoise(q * 2.7 + 4.0) * 0.35;
  w *= 0.35 + atmoNoise(p * 2.3 + 1.1); // opens and closes along its length
  float ww = max(w, fwidth(n));
  return (1.0 - smoothstep(0.0, ww, abs(n - 0.5))) * (w / ww);
}
// joint lines of a grid with cell size 'cell' (m) and joint half-width w (m); fwp = fwidth(p)
float rdJoint(vec2 p, vec2 cell, float w, vec2 fwp) {
  vec2 e = cell * 0.5 - abs(fract(p / cell) - 0.5) * cell;
  vec2 ww = max(vec2(w), fwp);
  vec2 j = (1.0 - smoothstep(vec2(0.0), ww, e)) * (w / ww);
  return max(j.x, j.y);
}
`;

// Asphalt + paving detail on the road material (diffuseColor / rdRough), see header.
const ROAD_DETAIL = `
float rdRough = 0.0;
{
  vec2 wp = vAtmoWorld.xz;
  float camD = length(vAtmoWorld - cameraPosition);
  float fadeM = 1.0 - smoothstep(150.0, 700.0, camD);
  float fadeN = 1.0 - smoothstep(20.0, 90.0, camD);
  float fpw = length(fwidth(wp));
  vec2 rfw = fwidth(vRoadUv);
  float lum = dot(diffuseColor.rgb, vec3(0.3333));
  bool plaza = abs(vRoadUv.y) < 0.5 && lum > 0.45; // paved areas without road coords: world-aligned flags
  if (vRoadUv.y > -0.5 && !plaza && diffuseColor.r < 0.72) {
    // ---- asphalt (dark, unsaturated surfaces only: light decks and painted bike lanes keep their look) ----
    float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
    float aMask = (1.0 - smoothstep(0.40, 0.47, lum)) * (1.0 - smoothstep(0.1, 0.2, sat));
    float v = (rdFbm(wp * 0.08) - 0.5) * 0.24 * fadeM + (atmoNoise(wp * 0.55) - 0.5) * 0.1 * fadeM;
    float g1 = clamp(1.0 - fpw * 4.0, 0.0, 1.0), g2 = clamp(1.0 - fpw * 22.0, 0.0, 1.0);
    float ag = atmoNoise(wp * 31.0 + 0.5);
    v += (atmoNoise(wp * 6.5) - 0.5) * 0.12 * g1 + (ag - 0.5) * 0.2 * g2 + smoothstep(0.8, 0.95, ag) * 0.12 * g2;
    rdRough += (0.5 - ag) * 0.12 * g2;
    // cracks only inside weathered zones: longitudinal + transverse along the carriageway, fine branching ones
    // next to them (world-space where there are no road coords)
    #ifndef ROAD_LITE
    if (fadeN > 0.0) {
      float zone = smoothstep(0.6, 0.8, atmoNoise(wp * 0.045 + 13.0));
      vec2 rc = vRoadUv.y > 0.5 ? vec2(vRoadUv.x, vRoadUv.y - floor(vRoadUv.y / 1000.0) * 1000.0) : wp;
      float cr = rdCrack(rc * vec2(0.07, 0.55) + 7.0, 0.012) * zone
               + rdCrack(rc * vec2(0.6, 0.09) + 3.0, 0.012) * smoothstep(0.65, 0.85, atmoNoise(wp * 0.05 + 21.0))
               + rdCrack(wp * 1.4 + 2.0, 0.014) * zone * smoothstep(0.45, 0.7, atmoNoise(wp * 0.3)) * 0.7;
      v -= min(cr, 1.0) * 0.4 * fadeN;
    }
    #endif
    vec3 cover = vec3(0.0);
    if (vRoadUv.y > 0.5) {
      float q = floor(vRoadUv.y / 1000.0);
      float hw = q * 0.25, lat = vRoadUv.y - q * 1000.0, along = vRoadUv.x;
      float edge = min(lat, 2.0 * hw - lat);
      // gutter: dust and grime collect against the kerb
      v -= 0.16 * (1.0 - smoothstep(0.05, 0.8, edge)) * fadeM;
      // dual polished tire wear tracks per lane (lat modulo ~3.3m, twin wheel tracks at +-0.85m) + center oil-drip band
      float lane = floor(lat / 3.3);
      float laneLocal = (lat - (lane + 0.5) * 3.3);
      float wheelD = abs(abs(laneLocal) - 0.85);
      float laneMask = smoothstep(0.45, 1.15, edge) * fadeM;
      float tireTrack = exp(-wheelD * wheelD / 0.10) * (0.82 + 0.36 * atmoNoise(vec2(along * 0.16, lat * 2.2))) * laneMask;
      float oilBand = exp(-laneLocal * laneLocal / 0.085) * (0.45 + 0.55 * atmoNoise(vec2(along * 0.11, lane * 7.3 + 1.9))) * laneMask;
      v -= tireTrack * 0.065 + oilBand * 0.095;
      rdRough -= (tireTrack * 0.08 + oilBand * 0.04) * aMask;
      // utility-cut repair patches, rectangles aligned with the carriageway
      vec2 cs = vec2(9.0, 3.4);
      vec2 cp = vec2(along, lat) / cs, ci = floor(cp), f = fract(cp) * cs;
      float h = atmoHash(ci + vec2(0.31, q * 0.017));
      vec2 lo = vec2(0.5 + 2.5 * atmoHash(ci + 3.1), 0.25 + 0.5 * atmoHash(ci + 5.7));
      vec2 sz = vec2(1.4 + 4.2 * atmoHash(ci + 8.3), 0.9 + 1.5 * atmoHash(ci + 1.9));
      vec2 dd = min(f - lo, lo + sz - f);
      float md = min(dd.x, dd.y);
      float isPatch = step(0.84, h);
      float inside = smoothstep(-0.02, 0.02, md) * isPatch;
      float seam = (1.0 - smoothstep(0.0, max(0.05, max(rfw.x, rfw.y) * 1.5), abs(md))) * isPatch;
      v += inside * (h > 0.92 ? -0.18 : 0.08);
      v -= seam * 0.3 * fadeN;
      rdRough -= inside * (h > 0.92 ? 0.1 : 0.0);
      // round iron manhole / utility covers at lane centres
      float mc = floor(along / 23.0);
      float mh = atmoHash(vec2(mc, lane) + 9.3);
      if (mh > 0.62 && lat > 0.8 && 2.0 * hw - lat > 0.8) {
        vec2 c = vec2((mc + 0.3 + 0.4 * atmoHash(vec2(mc, lane) + 2.2)) * 23.0, (lane + 0.5) * 3.3 + (mh - 0.8) * 2.0);
        float r = length(vec2(along, lat) - c);
        float aa = max(0.01, max(rfw.x, rfw.y));
        float disc = 1.0 - smoothstep(0.34 - aa, 0.34 + aa, r);
        float rim = disc * smoothstep(0.27 - aa, 0.27 + aa, r);
        vec2 lp = (vec2(along, lat) - c);
        float grid = step(0.5, fract((lp.x + lp.y) * 9.0)) * step(0.5, fract((lp.x - lp.y) * 9.0));
        float shade = mix(0.085 + 0.03 * grid * clamp(1.0 - aa * 30.0, 0.0, 1.0), 0.13, rim);
        cover = vec3(disc, shade, 0.5);
      }
      // rectangular cast-iron curbside storm-drain grates along the gutter (edge > 0.12 && edge < 0.52, spaced ~28m)
      if (edge > 0.08 && edge < 0.56) {
        float sideId = step(hw, lat);
        float gc = floor((along + sideId * 14.0) / 28.0);
        float gh = atmoHash(vec2(gc, sideId + q * 0.013) + 17.7);
        if (gh > 0.22) {
          float gAlong = (along + sideId * 14.0) - (gc + 0.5) * 28.0;
          float gEdge = edge - 0.32;
          vec2 gd = abs(vec2(gAlong, gEdge)) - vec2(0.38, 0.20);
          float gaa = max(0.008, max(rfw.x, rfw.y));
          float gBox = 1.0 - smoothstep(-gaa, gaa, max(gd.x, gd.y));
          if (gBox > cover.x) {
            float gInner = 1.0 - smoothstep(-gaa, gaa, max(gd.x + 0.045, gd.y + 0.045));
            float gRim = gBox - gInner;
            float slotX = smoothstep(0.18, 0.28, abs(fract(gAlong * 5.5) - 0.5));
            float crossBar = 1.0 - smoothstep(0.018, 0.03, abs(gEdge));
            float barMask = clamp(slotX + crossBar, 0.0, 1.0);
            float slotVis = clamp(1.0 - gaa * 28.0, 0.0, 1.0);
            float gShade = mix(0.024, 0.14, mix(0.45, barMask, slotVis));
            gShade = mix(gShade, 0.17, gRim);
            cover = vec3(gBox, gShade, gRim + gInner * barMask * 0.65);
          }
        }
      }
    }
    diffuseColor.rgb *= 1.0 + aMask * v;
    if (cover.x > 0.0) {
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(cover.y * 0.95, cover.y * 0.9, cover.y * 0.85), cover.x * aMask);
      rdRough -= cover.x * aMask * (0.22 + 0.16 * cover.z);
    }
  } else {
    // ---- sidewalk / paved footway / plaza ----
    vec2 pp = plaza ? wp : vec2(vRoadUv.x, -vRoadUv.y - 1.0);
    if (plaza) rfw = fwidth(wp);
    float v = (rdFbm(wp * 0.11) - 0.5) * 0.12 * fadeM;
    float j;
    vec2 si;
    if (uPaving < 0.5 || plaza) {
      // poured concrete flags with saw-cut joints
      vec2 cell = vec2(1.5, 1.5);
      j = rdJoint(pp, cell, 0.012, rfw);
      si = floor(pp / cell);
      v += (atmoHash(si + 0.5) - 0.5) * 0.12;
      // the odd cracked flag
      float ch = atmoHash(si + 7.7);
      if (ch > 0.86) {
        // straight-ish crack across the flag from edge to edge, slightly jagged
        vec2 f = fract(pp / cell) - 0.5;
        float an = ch * 40.0;
        float d = abs(dot(f, vec2(cos(an), sin(an))) - (atmoHash(si + 2.1) - 0.5) * 0.5 + (atmoNoise(pp * 9.0) - 0.5) * 0.04) * cell.x;
        float ww = max(0.006, max(rfw.x, rfw.y));
        v -= (1.0 - smoothstep(0.0, ww, d)) * (0.006 / ww) * 0.5 * fadeN;
      }
    } else {
      // block pavers in stretcher bond
      vec2 cell = vec2(0.22, 0.11);
      vec2 qq = pp / cell;
      qq.x += 0.5 * mod(floor(qq.y), 2.0);
      si = floor(qq);
      vec2 e = (0.5 - abs(fract(qq) - 0.5)) * cell;
      vec2 ww = max(vec2(0.006), rfw);
      vec2 jj = (1.0 - smoothstep(vec2(0.0), ww, e)) * (0.006 / ww);
      j = max(jj.x, jj.y);
      float th = atmoHash(si + 0.5), bf = clamp(1.0 - fpw * 6.0, 0.0, 1.0);
      v += (th - 0.5) * 0.22 * bf;
      // worn, slightly rounded block edges
      v -= (1.0 - smoothstep(0.0, 0.02, min(e.x, e.y))) * 0.12 * bf;
      diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(1.08, 0.98, 0.88), vec3(0.92, 0.96, 1.04), step(0.5, th)), step(0.7, atmoHash(si + 3.3)) * bf);
    }
    // grime blotches, darker near the kerb, chewing-gum spots
    v -= smoothstep(0.55, 0.8, rdFbm(wp * 0.35 + 3.0)) * 0.12 * fadeM;
    v -= 0.07 * (1.0 - smoothstep(0.0, 0.5, pp.y)) * fadeM;
    vec2 gq = wp * 3.0;
    float gum = step(0.93, atmoHash(floor(gq) + 1.3)) * (1.0 - smoothstep(0.06, 0.1, length(fract(gq) - 0.5)));
    v -= gum * 0.3 * clamp(1.0 - fpw * 30.0, 0.0, 1.0);
    diffuseColor.rgb *= (1.0 + v) * (1.0 - 0.38 * j * fadeM);
    rdRough += j * 0.05;
    if (!plaza && fadeM > 0.0) {
      float swAa = max(0.008, max(rfw.x, rfw.y));
      // Tactile warning paving strips along the kerb edge at crossing/corner intervals (~36m)
      float tcIdx = floor((pp.x + 18.0) / 36.0);
      float tcAlong = (pp.x + 18.0) - (tcIdx + 0.5) * 36.0;
      vec2 tcBox = abs(vec2(tcAlong, pp.y - 0.36)) - vec2(1.15, 0.26);
      float tcMask = (1.0 - smoothstep(-swAa, swAa, max(tcBox.x, tcBox.y))) * fadeM;
      if (tcMask > 0.0) {
        vec2 bd = fract(pp / 0.05) - 0.5;
        float dotR = length(bd);
        float dotVis = clamp(1.0 - swAa * 16.0, 0.0, 1.0);
        float blister = (1.0 - smoothstep(0.18, 0.32, dotR)) * dotVis;
        float bShadow = (smoothstep(0.18, 0.30, dotR) - smoothstep(0.30, 0.42, dotR)) * dotVis;
        float tcTone = step(0.5, atmoHash(vec2(tcIdx, 4.1)));
        vec3 tacCol = mix(vec3(0.78, 0.54, 0.22), vec3(0.72, 0.37, 0.22), tcTone);
        tacCol *= 1.0 + 0.14 * blister - 0.12 * bShadow;
        diffuseColor.rgb = mix(diffuseColor.rgb, tacCol, tcMask * 0.92);
        rdRough = mix(rdRough, -0.04, tcMask);
      }
      // Street-tree soil pits / cast-iron tree grates every ~18m (offset from tactile strips)
      float tpIdx = floor(pp.x / 18.0);
      float tpHash = atmoHash(vec2(tpIdx, 11.3));
      if (tpHash > 0.32 && pp.y > 0.22 && pp.y < 1.48) {
        vec2 pitLocal = vec2(pp.x - (tpIdx + 0.5) * 18.0, pp.y - 0.85);
        vec2 pitBox = abs(pitLocal) - vec2(0.56, 0.56);
        float pitMask = (1.0 - smoothstep(-swAa, swAa, max(pitBox.x, pitBox.y))) * fadeM;
        if (pitMask > 0.0) {
          float rPit = length(pitLocal);
          float soilHole = 1.0 - smoothstep(0.23 - swAa, 0.23 + swAa, rPit);
          float outerRim = smoothstep(0.50, 0.53, max(abs(pitLocal.x), abs(pitLocal.y)));
          float innerCollar = 1.0 - smoothstep(0.015, 0.03, abs(rPit - 0.24));
          float ringBar = smoothstep(0.15, 0.30, abs(fract(rPit * 9.0) - 0.5));
          float radAngle = atan(pitLocal.y, pitLocal.x);
          float radBar = 1.0 - smoothstep(0.08, 0.16, abs(sin(radAngle * 8.0)));
          float grateDetail = clamp(1.0 - swAa * 22.0, 0.0, 1.0);
          float ironMask = (1.0 - soilHole) * mix(0.65, clamp(ringBar + radBar + outerRim + innerCollar, 0.0, 1.0), grateDetail);
          vec3 soilCol = vec3(0.15, 0.11, 0.08) * (0.85 + 0.3 * atmoNoise(wp * 8.0));
          vec3 ironCol = vec3(0.21, 0.20, 0.19) * (0.92 + 0.16 * atmoNoise(wp * 14.0));
          vec3 pitCol = mix(soilCol, ironCol, ironMask);
          diffuseColor.rgb = mix(diffuseColor.rgb, pitCol, pitMask);
          rdRough = mix(rdRough, mix(0.08, -0.18, ironMask), pitMask);
        }
      }
    }
  }
  {
    float chunkCheb = max(abs(wp.x - uChunkCenter.x), abs(wp.y - uChunkCenter.y));
    float chunkRad = length(wp - uChunkCenter);
    float perimDist = mix(chunkRad, chunkCheb, 0.65);
    float isChunkStreetOrWalk = (abs(vRoadUv.y) > 0.1 || lum > 0.45) ? 1.0 : 0.45;
    float roadPerimFade = clamp(max(smoothstep(uChunkFadeInner, uChunkFadeOuter, perimDist), smoothstep(260.0, 520.0, uCamAlt) * (abs(vRoadUv.y) > 0.1 && vRoadUv.y < 0.5 ? 1.0 : 0.76)), 0.0, 1.0) * isChunkStreetOrWalk;
    if (roadPerimFade > 0.001) {
      diffuseColor.rgb = mix(diffuseColor.rgb, evalMacroUrbanCarpet(wp), roadPerimFade);
      rdRough = mix(rdRough, 0.14, roadPerimFade);
    }
  }
}
`;

function patchRoad(mat) {
  chainCompile(
    mat,
    (shader) => {
      bindUniforms(shader);
      addWorldPosVarying(shader);
      addRoadUvVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${liteSurfaces() ? '#define ROAD_LITE' : ''}\n${COMMON_PARS}\n${DETAIL_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${ROAD_DETAIL}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + rdRough, 0.05, 1.0);
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
    liteSurfaces() ? 'atmo-road-3-lite' : 'atmo-road-3'
  );
}

// [street-props] kerb stones: joints every ~0.95 m along, grain, per-stone tone (uv = along metres, 0 top / 1 face)
function patchKerb(mat) {
  chainCompile(
    mat,
    (shader) => {
      bindUniforms(shader);
      addWorldPosVarying(shader);
      addRoadUvVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON_PARS}\n${DETAIL_PARS}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec2 wp = vAtmoWorld.xz;
            float fpw = length(fwidth(wp));
            float st = floor(vRoadUv.x / 0.95);
            float e = (0.5 - abs(fract(vRoadUv.x / 0.95) - 0.5)) * 0.95;
            float ww = max(0.012, fwidth(vRoadUv.x));
            float j = (1.0 - smoothstep(0.0, ww, e)) * (0.012 / ww);
            j = max(j, (1.0 - smoothstep(0.0, 0.05, e)) * 0.25 * (0.012 / ww)); // chipped, rounded stone ends
            float v = (atmoHash(vec2(st, 1.3)) - 0.5) * 0.14 + (atmoNoise(wp * 5.0 + vAtmoWorld.y * 3.0) - 0.5) * 0.12 * clamp(1.0 - fpw * 5.0, 0.0, 1.0);
            v -= vRoadUv.y * 0.08; // face a bit dirtier than the worn top
            diffuseColor.rgb *= (1.0 + v) * (1.0 - 0.6 * j);
            float wetK = uWet;
            diffuseColor.rgb *= 1.0 - 0.25 * wetK;
          }`
        );
    },
    'atmo-kerb-1'
  );
}

// [street-props] painted markings: worn paint (scuffed toward the asphalt grey), dimmed with the light level
function patchLines(mat, wear, key) {
  chainCompile(
    mat,
    (shader) => {
      bindUniforms(shader);
      addWorldPosVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON_PARS}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec2 wp = vAtmoWorld.xz;
            ${wear ? `float camD = length(vAtmoWorld - cameraPosition);
            float fpw = length(fwidth(wp));
            float zone = smoothstep(0.3, 0.8, atmoNoise(wp * 0.07 + 2.0));
            float n = atmoNoise(wp * 1.4) * 0.6 + atmoNoise(wp * 7.0) * 0.4 * clamp(1.0 - fpw * 8.0, 0.0, 1.0);
            float worn = smoothstep(0.62 - 0.3 * zone, 0.92 - 0.3 * zone, n) * (1.0 - smoothstep(60.0, 250.0, camD));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.28, 0.3), worn * 0.85);
            diffuseColor.rgb *= 0.9 + 0.1 * atmoNoise(wp * 3.0);` : ''}
            diffuseColor.rgb *= mix(0.28, 1.0, smoothstep(0.12, 0.7, uLightLevel)) * (1.0 - 0.3 * uWet);
          }`
        );
    },
    key
  );
}

// [street-props] grass & park detail: patchy colour (lush / dry), fine blade grain, bare patches,
// park lawn mowing stripes + wildflower/clover micro-clusters, and screen-space normal micro-relief
function patchGrass(mat, key, isPark = false) {
  chainCompile(
    mat,
    (shader) => {
      addWorldPosAndNormVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vAtmoWorld;\nvarying vec3 vWorldNorm;\n${NOISE_GLSL}\n${MACRO_CARPET_GLSL}\nfloat grFbm(vec2 p) { return atmoNoise(p) * 0.5 + atmoNoise(p * 2.03 + 1.7) * 0.3 + atmoNoise(p * 4.07 + 3.1) * 0.2; }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float grRough = 0.0;
          float grRelief = 0.0;
          {
            vec3 c0 = diffuseColor.rgb;
            float gm = smoothstep(0.0, 0.05, c0.g - max(c0.r, c0.b));
            vec2 wp = vAtmoWorld.xz;
            float camD = length(vAtmoWorld - cameraPosition);
            float fpw = length(fwidth(wp));
            if (gm > 0.0) {
              float fadeM = 1.0 - smoothstep(300.0, 1500.0, camD);
              float n1 = grFbm(wp * 0.035);
              vec3 c = mix(c0 * vec3(0.86, 1.04, 0.9), c0 * vec3(1.2, 1.08, 0.72), smoothstep(0.38, 0.72, n1) * fadeM);
              c *= 1.0 + (grFbm(wp * 0.6) - 0.5) * 0.26 * fadeM;
              float g1 = clamp(1.0 - fpw * 5.0, 0.0, 1.0), g2 = clamp(1.0 - fpw * 25.0, 0.0, 1.0);
              float bladeN = (atmoNoise(wp * vec2(9.0, 7.0)) - 0.5) * 0.22 * g1 + (atmoNoise(wp * vec2(34.0, 22.0)) - 0.5) * 0.26 * g2;
              c *= 1.0 + bladeN;
              grRelief += bladeN * 0.14 * gm;
              ${isPark ? `
              // Park lawn mowing stripes (alternating 3.5m bands with +-4% albedo/roughness sheen)
              float fadePark = 1.0 - smoothstep(60.0, 280.0, camD);
              float mowPhase = dot(wp, vec2(0.8, 0.6)) / 3.5;
              float mowStripe = smoothstep(-0.18, 0.18, sin(mowPhase * 3.14159265));
              c *= 1.0 + (mowStripe - 0.5) * 0.08 * fadePark;
              grRough += (0.5 - mowStripe) * 0.08 * fadePark * gm;
              // Procedural wildflower & clover micro-clusters (white daisy, yellow dandelion, lavender/clover)
              float patchNoise = smoothstep(0.50, 0.75, grFbm(wp * 0.16 + 11.3));
              float clover = smoothstep(0.52, 0.76, atmoNoise(wp * 1.9 + 4.2)) * patchNoise * g1;
              c = mix(c, vec3(0.14, 0.34, 0.13), clover * 0.35);
              float fFade = clamp(1.0 - fpw * 14.0, 0.0, 1.0) * (1.0 - smoothstep(18.0, 68.0, camD));
              if (fFade > 0.0 && patchNoise > 0.04) {
                vec2 fc = floor(wp * 13.5);
                vec2 ff = fract(wp * 13.5) - 0.5;
                float fh = atmoHash(fc + 5.17);
                if (fh > 0.77) {
                  vec2 jitter = (vec2(atmoHash(fc + 1.1), atmoHash(fc + 2.3)) - 0.5) * 0.32;
                  float speck = (1.0 - smoothstep(0.12, 0.34, length(ff + jitter))) * patchNoise * fFade;
                  vec3 flowerCol = fh > 0.92 ? vec3(0.76, 0.58, 0.88) : (fh > 0.85 ? vec3(0.95, 0.78, 0.16) : vec3(0.96, 0.95, 0.88));
                  c = mix(c, flowerCol, clamp(speck * 0.88, 0.0, 1.0));
                  grRelief += speck * 0.08;
                }
              }
              ` : ''}
              float bare = smoothstep(0.74, 0.84, atmoNoise(wp * 0.09 + 5.0) * 0.7 + atmoNoise(wp * 0.7) * 0.3) * fadeM;
              float lum = dot(c0, vec3(0.299, 0.587, 0.114));
              c = mix(c, vec3(0.42, 0.33, 0.22) * lum * 1.6, bare * 0.75);
              diffuseColor.rgb = mix(c0, c, gm);
            }
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (abs(grRelief) > 1e-5) {
            vec2 dGr = clamp(vec2(dFdx(grRelief), dFdy(grRelief)), vec2(-0.16), vec2(0.16));
            normal = normalize(normal + vec3(-dGr.x, -dGr.y, 0.0));
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + grRough, 0.06, 1.0);`
        );
    },
    key
  );
}

// [terrain-detail] Steep-slope rocky outcrop strata & scree cracks + coastal sand ripples & wet-sand shoreline band
const makeTerrainDetail = (isPark) => `
{
  vec2 wp = vAtmoWorld.xz;
  float camD = length(vAtmoWorld - cameraPosition);
  float fpw = length(fwidth(wp));
  float tFade = 1.0 - smoothstep(450.0, 2200.0, camD);
  float ny = abs(vWorldNorm.y);
  float tNat = ${isPark ? "1.0" : "1.0 - smoothstep(0.18, 0.55, clamp(vGroundInfo.x, 0.0, 1.0))"};
  // Steep slopes (abs(vWorldNorm.y) < 0.85): rocky outcrop strata bands & scree cracks
  if (ny < 0.85 && tFade > 0.0) {
    float slopeMask = 1.0 - smoothstep(0.52, 0.85, ny);
    float outcropN = atmoNoise(wp * 0.045 + vAtmoWorld.y * 0.08);
    float rockMask = clamp(slopeMask * (0.76 + 0.48 * outcropN), 0.0, 1.0) * tFade * mix(0.45, 1.0, tNat);
    float strataY = vAtmoWorld.y * 0.55 + atmoNoise(wp * 0.035) * 3.2 + atmoNoise(wp * 0.14 + 4.1) * 0.85;
    float strata = sin(strataY * 3.4) * 0.5 + 0.5;
    float fineStrata = atmoNoise(vec2(strataY * 4.5, dot(wp, vec2(0.7, -0.7)) * 0.12));
    float ledge = smoothstep(0.68, 0.88, fract(strataY * 0.85));
    vec2 triUv = wp * 0.35 + vec2(vAtmoWorld.y * 0.6, -vAtmoWorld.y * 0.4);
    float screeCrack = smoothstep(0.03, 0.08, abs(atmoNoise(triUv * 2.2) - 0.5))
                     * smoothstep(0.03, 0.09, abs(atmoNoise(triUv * 5.1 + 3.7) - 0.5));
    float crackDark = mix(1.0, 0.52 + 0.48 * screeCrack, clamp(1.0 - fpw * 6.0, 0.0, 1.0));
    vec3 rockWarm = vec3(0.49, 0.43, 0.37);
    vec3 rockCool = vec3(0.36, 0.37, 0.39);
    vec3 rockOchre = vec3(0.55, 0.44, 0.33);
    vec3 rockCol = mix(rockCool, rockWarm, strata) * (0.82 + 0.32 * fineStrata);
    rockCol = mix(rockCol, rockOchre, ledge * 0.35) * crackDark * (1.0 - 0.18 * ledge);
    diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockMask);
    grRough = mix(grRough, 0.08 - 0.12 * (1.0 - screeCrack), rockMask);
    grRelief += (strata * 0.12 - (1.0 - screeCrack) * 0.15) * rockMask;
  }
  // Coastal ground near water level (vAtmoWorld.y > -0.5 && vAtmoWorld.y < 3.2): wind-blown sand ripples + wet-sand shoreline
  if (vAtmoWorld.y > -0.5 && vAtmoWorld.y < 3.2 && tFade > 0.0) {
    float isWaterVertex = smoothstep(0.02, 0.08, diffuseColor.b - max(diffuseColor.r, diffuseColor.g * 0.92));
    float coastElev = smoothstep(-0.5, 0.05, vAtmoWorld.y) * (1.0 - smoothstep(1.5, 3.2, vAtmoWorld.y));
    float flatMask = smoothstep(0.72, 0.93, ny);
    float coastMask = coastElev * flatMask * tFade * tNat * (1.0 - isWaterVertex) * ${isPark ? "0.35" : "1.0"};
    if (coastMask > 0.001) {
      float rippleCoord = dot(wp, vec2(0.85, 0.52)) * 4.2 + atmoNoise(wp * 0.8) * 2.2;
      float sandRipple = (0.5 + 0.5 * sin(rippleCoord)) * clamp(1.0 - fpw * 10.0, 0.0, 1.0);
      float sandGrain = (atmoNoise(wp * 18.0) - 0.5) * 0.12 * clamp(1.0 - fpw * 20.0, 0.0, 1.0);
      vec3 drySand = vec3(0.76, 0.70, 0.58) * (0.94 + 0.10 * atmoNoise(wp * 0.15)) * (1.0 + (sandRipple - 0.5) * 0.09 + sandGrain);
      float wetWave = (atmoNoise(wp * 0.25) - 0.5) * 0.22;
      float wetSandMask = (1.0 - smoothstep(0.15, 0.85, vAtmoWorld.y + wetWave)) * smoothstep(-0.5, -0.05, vAtmoWorld.y);
      vec3 wetSand = drySand * vec3(0.50, 0.48, 0.45);
      vec3 sandCol = mix(drySand, wetSand, wetSandMask);
      diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, coastMask * 0.85);
      grRough = mix(grRough, mix(0.06, -0.58, wetSandMask), coastMask);
      grRelief += (sandRipple - 0.5) * 0.06 * (1.0 - wetSandMask) * coastMask;
    }
  }
}
`;

function patchTerrain(mat, isPark = false) {
  chainCompile(
    mat,
    (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${makeTerrainDetail(isPark)}`
      );
    },
    isPark ? '-terrain-detail-park-1' : '-terrain-detail-1'
  );
}

// [ground] Urban ground between buildings, driven by the terrain's land-use info (uv = built, flavour; see
// features/ground_cover.js): irregular ~15 m lots of paving, concrete, parking asphalt, gravel and worn soil, with
// lawns and garden beds only where the flavour says residential. Fades to the per-vertex average with distance.
// Installed after patchGrass so it runs first: green lawns then get the grass grain, paved lots never do.
const URBAN_GROUND = `
{
  float gBuilt = clamp(vGroundInfo.x, 0.0, 1.0);
  float gCamD = length(vAtmoWorld - cameraPosition);
  float gFade = 1.0 - smoothstep(700.0, 2400.0, gCamD);
  if (gBuilt > 0.004 && gFade > 0.0) {
    float gFlav = clamp(vGroundInfo.y, -1.0, 1.0);
    float gRes = max(gFlav, 0.0), gInd = max(-gFlav, 0.0), gDense = 1.0 - gRes - gInd;
    vec2 wp = vAtmoWorld.xz;
    float fpw = length(fwidth(wp));
    // lots: ~19 m cells on a domain-warped grid with per-row offsets (cheap, and never lines up into a ruled grid)
    vec2 q = wp / vec2(19.0, 15.0) + (vec2(atmoNoise(wp * 0.017), atmoNoise(wp * 0.017 + 7.1)) - 0.5) * 0.9;
    q.x += atmoHash(vec2(floor(q.y), 4.7)) * 0.9;
    vec2 lid = floor(q);
    vec2 qf = fract(q);
    float edgeD = min(min(qf.x, 1.0 - qf.x) * 19.0, min(qf.y, 1.0 - qf.y) * 15.0); // metres to the lot border
    float lh = atmoHash(lid + 0.71);
    float lt = atmoHash(lid + 3.33);
    // material shares by flavour: lawn, garden, soil, gravel, asphalt, concrete, (rest) paving
    float pLawn = 0.32 * gRes;
    float pGarden = 0.14 * gRes;
    float pSoil = 0.07 * gDense + 0.08 * gRes + 0.05 * gInd;
    float pGravel = 0.26 * gInd + 0.02 * gDense;
    float pAsph = 0.24 * gDense + 0.12 * gRes + 0.29 * gInd;
    float pConc = 0.36 * gDense + 0.14 * gRes + 0.38 * gInd;
    float a0 = pLawn, a1 = a0 + pGarden, a2 = a1 + pSoil, a3 = a2 + pGravel, a4 = a3 + pAsph, a5 = a4 + pConc;
    float g1 = clamp(1.0 - fpw * 4.0, 0.0, 1.0), g2 = clamp(1.0 - fpw * 18.0, 0.0, 1.0);
    float n1 = atmoNoise(wp * 0.13 + lid), n2 = atmoNoise(wp * 0.9);
    vec3 c;
    if (lh < a0) {
      // lawn: soft mowing stripes
      vec2 sd = vec2(cos(lt * 6.28), sin(lt * 6.28));
      float stripe = step(0.5, fract(dot(wp, sd) / 1.6));
      c = vec3(0.32, 0.46, 0.21) * (0.9 + 0.2 * lt) * (1.0 + (stripe - 0.5) * 0.07 * g1) * (0.92 + 0.16 * n1);
    } else if (lh < a1) {
      // garden: shrub clumps over mulched beds
      float sh = smoothstep(0.42, 0.6, atmoNoise(wp * 0.45 + lid * 3.0));
      c = mix(vec3(0.40, 0.33, 0.24), vec3(0.20, 0.33, 0.15) * (0.85 + 0.3 * n2), sh);
    } else if (lh < a2) {
      // worn, compacted soil
      c = vec3(0.46, 0.40, 0.31) * (0.88 + 0.2 * n1) * (1.0 + (n2 - 0.5) * 0.18 * g1);
    } else if (lh < a3) {
      // gravel yard
      float sp = atmoHash(floor(wp * 3.0));
      c = vec3(0.50, 0.48, 0.45) * (0.92 + 0.12 * n1) * (1.0 + (sp - 0.5) * 0.3 * g2);
    } else if (lh < a4) {
      // parking asphalt with painted bays
      c = vec3(0.31, 0.32, 0.33) * (0.93 + 0.14 * n1);
      if (lt > 0.35) {
        float ang = floor(lt * 4.0) * 1.5708 + atmoHash(lid + 9.0) * 0.4;
        vec2 ax = vec2(cos(ang), sin(ang));
        float u = dot(wp, ax), v = dot(wp, vec2(-ax.y, ax.x));
        float ww = max(0.06, fpw);
        float bay = (1.0 - smoothstep(0.0, ww, abs(fract(u / 2.6) - 0.5) * 2.6 - 1.2)) * step(0.5, fract(v / 11.0)) * (0.06 / ww);
        c = mix(c, vec3(0.72, 0.72, 0.68), clamp(bay, 0.0, 1.0) * 0.75 * g1);
      }
    } else if (lh < a5) {
      // poured concrete slabs with saw-cut joints and stains
      vec2 e = abs(fract(wp / 3.6) - 0.5) * 3.6;
      float ww = max(0.02, fpw);
      float jt = (1.0 - smoothstep(1.8 - ww, 1.8, max(e.x, e.y))) ;
      c = vec3(0.53, 0.52, 0.49) * (0.93 + 0.1 * lt) * (1.0 - 0.18 * (1.0 - jt) * g1);
      c *= 1.0 - 0.14 * smoothstep(0.6, 0.85, atmoNoise(wp * 0.25 + 4.0));
    } else {
      // paving flags
      vec2 e = abs(fract(wp / 0.9) - 0.5) * 0.9;
      float ww = max(0.01, fpw);
      float jt = 1.0 - smoothstep(0.45 - ww, 0.45, max(e.x, e.y));
      float th = atmoHash(floor(wp / 0.9) + lid);
      c = mix(vec3(0.57, 0.54, 0.50), vec3(0.52, 0.51, 0.49), step(0.5, lt)) * (1.0 + (th - 0.5) * 0.12 * g2);
      c *= 1.0 - 0.2 * (1.0 - jt) * g2;
    }
    // lot borders: hedges between gardens, kerbs and walls elsewhere
    float ew = max(0.45, fpw * 1.5);
    float border = (1.0 - smoothstep(0.0, ew, edgeD)) * g1;
    vec3 bc = mix(vec3(0.6, 0.58, 0.55), vec3(0.19, 0.30, 0.15), step(0.55, gRes + (lt - 0.5) * 0.4));
    c = mix(c, bc, border * 0.8);
    // neighbourhood-scale grime / sun bleaching
    c *= 0.92 + 0.16 * atmoNoise(wp * 0.011 + 3.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, c, gBuilt * gFade);
  }
  if (gBuilt > 0.004) {
    vec2 wq = vAtmoWorld.xz;
    float chunkCheb = max(abs(wq.x - uChunkCenter.x), abs(wq.y - uChunkCenter.y));
    float chunkRad = length(wq - uChunkCenter);
    float perimDist = mix(chunkRad, chunkCheb, 0.65);
    float perimFade = clamp(max(smoothstep(uChunkFadeInner, uChunkFadeOuter, perimDist), smoothstep(240.0, 520.0, uCamAlt)), 0.0, 1.0);
    float macroBlend = max(1.0 - gFade, perimFade);
    if (macroBlend > 0.001) {
      float effBuilt = mix(gBuilt, smoothstep(0.04, 0.28, gBuilt), perimFade);
      diffuseColor.rgb = mix(diffuseColor.rgb, evalMacroUrbanCarpet(wq), effBuilt * macroBlend);
    }
  }
}
`;

function patchUrbanGround(mat) {
  chainCompile(
    mat,
    (shader) => {
      shader.uniforms.uChunkCenter = SURFACE_UNIFORMS.uChunkCenter;
      shader.uniforms.uChunkFadeInner = SURFACE_UNIFORMS.uChunkFadeInner;
      shader.uniforms.uChunkFadeOuter = SURFACE_UNIFORMS.uChunkFadeOuter;
      shader.uniforms.uCamAlt = SURFACE_UNIFORMS.uCamAlt;
      // vAtmoWorld + atmoNoise/atmoHash come from patchGrass on the same material
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundInfo;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundInfo = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundInfo;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n${URBAN_GROUND}`);
    },
    '-urban-ground-2'
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
  // [street-props] + [terrain-detail]
  // Note: chainCompile prepends each #include <color_fragment> block before earlier ones,
  // so registering patchTerrain before patchGrass and patchUrbanGround means at runtime:
  // URBAN_GROUND runs 1st -> GRASS_DETAIL runs 2nd -> TERRAIN_DETAIL runs 3rd.
  if (mats.terrainMat) patchTerrain(mats.terrainMat, false);
  if (mats.parkMat) patchTerrain(mats.parkMat, true);
  if (mats.terrainMat) patchGrass(mats.terrainMat, '-grass-2', false);
  if (mats.parkMat) patchGrass(mats.parkMat, '-grass-2-park', true);
  if (mats.terrainMat) patchUrbanGround(mats.terrainMat); // [ground] after patchGrass so it runs first
  if (mats.streetCurbMat) patchKerb(mats.streetCurbMat);
  if (mats.streetLineMat) patchLines(mats.streetLineMat, true, 'atmo-lines-1');
  if (mats.markingMat) patchLines(mats.markingMat, true, 'atmo-lines-1');
  if (mats.streetDecalMat) patchLines(mats.streetDecalMat, false, 'atmo-decal-1');
}
