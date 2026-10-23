// [terrain-roads] Waterways: OpenMapTiles `waterway` lines (river, canal, stream, drain, ditch) rendered as
// terrain-draped mitered ribbons with a flow animation running along the line's digitized direction
// (OSM waterways are drawn downstream). Worker-safe builder + main-thread material.
import * as THREE from '../../vendor/three.module.js';
import { SURFACE_UNIFORMS } from './surfaces.js';

/** Ribbon width (m) per waterway class; tunnels/culverts are dropped by the extractor. */
export function waterwayWidth(cls, tags = {}) {
  const w = Number(tags.width);
  if (Number.isFinite(w) && w > 0.5 && w < 60) return w;
  switch (cls) {
    case 'river': return 14.0;
    case 'canal': return 9.0;
    case 'stream': return 3.2;
    case 'drain': return 2.4;
    case 'ditch': return 1.6;
    default: return 2.5;
  }
}

const MAX_SEG = 18.0; // densify so the ribbon follows the DEM
const Y_LIFT = 0.24; // matches water polygons (terrain mesh sits 0.35 below DEM)

/**
 * Builds one indexed ribbon mesh for all chunk waterways. uv.x = -1..1 across, uv.y = metres downstream.
 * `elev(wx, wz)` returns terrain height. Returns null when the chunk has no waterways.
 */
export function buildWaterwayMesh(waterLines, ox, oz, elev, mats) {
  if (!waterLines || !waterLines.length) return null;
  const pos = [], nrm = [], uv = [], idx = [];
  for (const wl of waterLines) {
    const widthM = wl[3], flat = wl[4];
    if (!flat || flat.length < 4) continue;
    const hw = Math.max(0.6, (widthM || 3) * 0.5);
    const pts = [flat[0], flat[1]];
    for (let i = 2; i < flat.length; i += 2) {
      const x0 = flat[i - 2], z0 = flat[i - 1], x1 = flat[i], z1 = flat[i + 1];
      const d = Math.hypot(x1 - x0, z1 - z0);
      if (d < 0.15) continue;
      const k = Math.max(1, Math.ceil(d / MAX_SEG));
      for (let s = 1; s <= k; s++) pts.push(x0 + ((x1 - x0) * s) / k, z0 + ((z1 - z0) * s) / k);
    }
    const n = pts.length / 2;
    if (n < 2) continue;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const inside = (i) => {
      const mx = (pts[i * 2] + pts[i * 2 + 2]) * 0.5, mz = (pts[i * 2 + 1] + pts[i * 2 + 3]) * 0.5;
      return mx >= -500 && mx < 500 && mz >= -500 && mz < 500;
    };
    const emitRun = (a, b) => {
      if (b - a < 1) return;
      const base = pos.length / 3;
      for (let i = a; i <= b; i++) {
        const x = pts[i * 2], z = pts[i * 2 + 1];
        let tx = 0, tz = 0;
        if (i > 0) { const dx = x - pts[i * 2 - 2], dz = z - pts[i * 2 - 1], l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
        if (i < n - 1) { const dx = pts[i * 2 + 2] - x, dz = pts[i * 2 + 3] - z, l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        let miter = 1;
        if (i > 0 && i < n - 1) {
          const dx = pts[i * 2 + 2] - x, dz = pts[i * 2 + 3] - z, l = Math.hypot(dx, dz) || 1;
          miter = Math.min(2.0, 1 / Math.max(0.5, (dx / l) * tx + (dz / l) * tz));
        }
        const nx = -tz * hw * miter, nz = tx * hw * miter;
        const yc = Math.max(elev(ox + x + nx, oz + z + nz), elev(ox + x - nx, oz + z - nz)) + Y_LIFT;
        pos.push(x + nx, yc, z + nz, x - nx, yc, z - nz);
        nrm.push(0, 1, 0, 0, 1, 0);
        uv.push(-1, cum[i], 1, cum[i]);
      }
      for (let k = 0; k < b - a; k++) {
        const v = base + k * 2;
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    };
    let runStart = -1;
    for (let i = 0; i < n - 1; i++) {
      if (inside(i)) { if (runStart < 0) runStart = i; }
      else if (runStart >= 0) { emitRun(runStart, i); runStart = -1; }
    }
    if (runStart >= 0) emitRun(runStart, n - 1);
  }
  if (!pos.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geom, (mats && mats.waterwayMat) || { name: 'waterwayMat' });
  mesh.receiveShadow = true;
  return mesh;
}

/** Main-thread material: flowing streaks downstream, darker muddy banks, sky fresnel. */
export function createWaterwayMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f5a6e,
    roughness: 0.12,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  mat.name = 'waterwayMat';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAtmoTime = SURFACE_UNIFORMS.uAtmoTime;
    shader.uniforms.uSkyHorizon = SURFACE_UNIFORMS.uSkyHorizon;
    shader.vertexShader = 'varying vec2 vWwUv;\nvarying vec3 vWwWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvWwUv = uv;\nvWwWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
    shader.fragmentShader = 'uniform float uAtmoTime;\nuniform vec3 uSkyHorizon;\nvarying vec2 vWwUv;\nvarying vec3 vWwWorld;\n' + `
      float wwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wwNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(wwHash(i), wwHash(i + vec2(1.0, 0.0)), u.x), mix(wwHash(i + vec2(0.0, 1.0)), wwHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
    ` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float across = vWwUv.x;
        float s = vWwUv.y - uAtmoTime * 1.6; // downstream drift
        float streak = wwNoise(vec2(across * 2.5, s * 0.22)) * 0.6 + wwNoise(vec2(across * 6.0, s * 0.9)) * 0.4;
        float ripple = smoothstep(0.62, 0.9, streak);
        float bank = smoothstep(0.62, 1.0, abs(across));
        vec3 deep = diffuseColor.rgb;
        vec3 col = mix(deep, deep * 1.35 + vec3(0.03, 0.05, 0.05), ripple * 0.55);
        col = mix(col, vec3(0.22, 0.24, 0.17), bank * 0.55);
        vec3 V = normalize(cameraPosition - vWwWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        col = mix(col, uSkyHorizon * 0.9, fres * 0.45 * (1.0 - bank));
        diffuseColor.rgb = col;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'waterway-v1';
  return mat;
}
