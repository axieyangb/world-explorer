import * as THREE from '../../vendor/three.module.js';
import { liteSurfaces } from './quality.js'; // [ui-mobile] Low / touch-Medium tiers use the lite road + water shaders

/**
 * Weather/sky-aware surface shaders, patched in-place onto the shared materials via onBeforeCompile
 * (so worker-built chunks, horizon meshes and everything else using them pick it up for free):
 *   - waterMat:   animated normal waves, fresnel sky reflection, sun glint, shoreline foam
 *   - roadMat:    wet look in rain (darker albedo, low roughness, puddles, streaky sky reflections)
 *   - terrainMat / parkMat: slight wet darkening
 *   [street-props] close-range ground detail, faded out by distance and pixel footprint so nothing shimmers:
 *   - roadMat:    asphalt mottling, aggregate grain, cracks, gutter grime, utility-cut patches, manhole covers;
 *                 sidewalks / paved ways get concrete flags (uPaving 0) or block pavers (uPaving 1) with joints,
 *                 per-slab tone, stains and gum spots. Uses the road-surface uv from chunk_builder.js.
 *   - streetCurbMat: kerb stones with joints and grain;  line materials: worn paint, dimmed at night
 *   - terrainMat / parkMat: grass colour variation, blade grain and bare patches
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
            float fn = atmoNoise(vAtmoWorld.xz * 0.45 + vec2(uAtmoTime * 0.25, 0.0));
            float band = 0.5 + 0.5 * sin(shoreDist * 2.2 - uAtmoTime * 1.6 + fn * 4.0);
            float foam = (1.0 - smoothstep(0.0, 3.5, shoreDist)) * (0.55 + 0.45 * band) * smoothstep(0.25, 0.7, fn + 0.25);
            float shallow = 1.0 - smoothstep(0.0, 12.0, shoreDist);
            outgoingLight *= 1.0 - 0.25 * shallow;
            outgoingLight = mix(outgoingLight, vec3(0.86, 0.9, 0.92) * uLightLevel, clamp(foam, 0.0, 1.0) * 0.75);
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
    liteSurfaces() ? 'atmo-water-2-lite' : 'atmo-water-2'
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
  if (vRoadUv.y > -0.5 && !plaza) {
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
    vec3 cover = vec3(-1.0);
    if (vRoadUv.y > 0.5) {
      float q = floor(vRoadUv.y / 1000.0);
      float hw = q * 0.25, lat = vRoadUv.y - q * 1000.0, along = vRoadUv.x;
      float edge = min(lat, 2.0 * hw - lat);
      // gutter: dust and grime collect against the kerb
      v -= 0.16 * (1.0 - smoothstep(0.05, 0.8, edge)) * fadeM;
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
      float lane = floor(lat / 3.3);
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
        cover = vec3(disc, shade, 0.0);
      }
    }
    diffuseColor.rgb *= 1.0 + aMask * v;
    if (cover.x > 0.0) {
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(cover.y * 0.95, cover.y * 0.9, cover.y * 0.85), cover.x * aMask);
      rdRough -= cover.x * aMask * 0.3;
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
    liteSurfaces() ? 'atmo-road-2-lite' : 'atmo-road-2'
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

// [street-props] grass: patchy colour (lush / dry), fine blade grain and the odd bare patch; green fragments only
function patchGrass(mat, key) {
  chainCompile(
    mat,
    (shader) => {
      addWorldPosVarying(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vAtmoWorld;\n${NOISE_GLSL}\nfloat grFbm(vec2 p) { return atmoNoise(p) * 0.5 + atmoNoise(p * 2.03 + 1.7) * 0.3 + atmoNoise(p * 4.07 + 3.1) * 0.2; }`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 c0 = diffuseColor.rgb;
            float gm = smoothstep(0.0, 0.05, c0.g - max(c0.r, c0.b));
            if (gm > 0.0) {
              vec2 wp = vAtmoWorld.xz;
              float camD = length(vAtmoWorld - cameraPosition);
              float fpw = length(fwidth(wp));
              float fadeM = 1.0 - smoothstep(300.0, 1500.0, camD);
              float n1 = grFbm(wp * 0.035);
              vec3 c = mix(c0 * vec3(0.86, 1.04, 0.9), c0 * vec3(1.2, 1.08, 0.72), smoothstep(0.38, 0.72, n1) * fadeM);
              c *= 1.0 + (grFbm(wp * 0.6) - 0.5) * 0.26 * fadeM;
              float g1 = clamp(1.0 - fpw * 5.0, 0.0, 1.0), g2 = clamp(1.0 - fpw * 25.0, 0.0, 1.0);
              c *= 1.0 + (atmoNoise(wp * vec2(9.0, 7.0)) - 0.5) * 0.22 * g1 + (atmoNoise(wp * vec2(34.0, 22.0)) - 0.5) * 0.26 * g2;
              float bare = smoothstep(0.74, 0.84, atmoNoise(wp * 0.09 + 5.0) * 0.7 + atmoNoise(wp * 0.7) * 0.3) * fadeM;
              float lum = dot(c0, vec3(0.299, 0.587, 0.114));
              c = mix(c, vec3(0.42, 0.33, 0.22) * lum * 1.6, bare * 0.75);
              diffuseColor.rgb = mix(c0, c, gm);
            }
          }`
        );
    },
    key
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
  // [street-props]
  if (mats.terrainMat) patchGrass(mats.terrainMat, '-grass-1');
  if (mats.parkMat) patchGrass(mats.parkMat, '-grass-1');
  if (mats.streetCurbMat) patchKerb(mats.streetCurbMat);
  if (mats.streetLineMat) patchLines(mats.streetLineMat, true, 'atmo-lines-1');
  if (mats.markingMat) patchLines(mats.markingMat, true, 'atmo-lines-1');
  if (mats.streetDecalMat) patchLines(mats.streetDecalMat, false, 'atmo-decal-1');
}
