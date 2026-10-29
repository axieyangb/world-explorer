import * as THREE from '../vendor/three.module.js';

/**
 * Real-world Beijing Digital Elevation Model (DEM) state loaded from `/data/beijing_dem.json`
 * (compiled from AWS/Mapzen Open Data SRTM Terrarium Zoom-12 bare-earth filtered DTM + OSM `natural=peak` `ele=*` nodes).
 */
let demState = null;

import { fetchGlobalDem, horizonGroundFor } from './global_tiles.js';
import { GROUND_MEADOW, groundSlopeTint, overviewGroundSampler } from './features/ground_cover.js'; // [ground]

export async function initBeijingDem() {
  try {
    const resp = await fetch('data/beijing_dem.json');
    if (resp.ok) {
      demState = await resp.json();
      demState.isBeijing = true;
      return demState;
    }
  } catch {
    // Fallback to global DEM
  }
  demState = await fetchGlobalDem(39.9087, 116.3975);
  return demState;
}

export async function initGlobalDem(centerLat, centerLon) {
  const distBeijingKm = Math.hypot((centerLat - 39.9087) * 111.0, (centerLon - 116.3975) * 85.4);
  if (distBeijingKm < 25.0) {
    return initBeijingDem();
  }
  demState = await fetchGlobalDem(centerLat, centerLon);
  return demState;
}

export function setBeijingDemState(state) {
  demState = state;
}

export function getBeijingDemState() {
  return demState;
}

/**
 * Samples the real SRTM/Terrarium DEM elevation (in meters relative to Tiananmen Square baseline)
 * using bilinear interpolation over the 401x401 (100m spacing) 40km x 40km DEM grid,
 * fused with local sub-grid OSM `natural=peak` (`ele=*`) summit elevations (e.g. 景山万春亭, 万寿山, 琼华岛).
 */

/**
 * Evaluates the exact rendered triangle height of the 24x24 chunk terrain mesh at world (wx, wz).
 */
export function getChunkTerrainMeshElevation(wx, wz) {
  const cx = Math.max(0, Math.min(39, Math.floor((wx + 20000.0) / 1000.0)));
  const cz = Math.max(0, Math.min(39, Math.floor((wz + 20000.0) / 1000.0)));
  const ox = -20000.0 + cx * 1000.0 + 500.0;
  const oz = -20000.0 + cz * 1000.0 + 500.0;
  const segs = 24;
  const step = 1000.0 / segs;
  const fx = THREE.MathUtils.clamp((wx - (ox - 500.0)) / step, 0, segs - 0.0001);
  const fz = THREE.MathUtils.clamp((wz - (oz - 500.0)) / step, 0, segs - 0.0001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const x0 = ox - 500.0 + ix * step;
  const z0 = oz - 500.0 + iz * step;
  const ha = getBeijingTerrainElevation(x0, z0) - 0.35;
  const hb = getBeijingTerrainElevation(x0 + step, z0) - 0.35;
  const hc = getBeijingTerrainElevation(x0, z0 + step) - 0.35;
  const hd = getBeijingTerrainElevation(x0 + step, z0 + step) - 0.35;
  if (tx + tz <= 1.0) {
    return ha + tx * (hb - ha) + tz * (hc - ha);
  }
  return hd + (1.0 - tx) * (hc - hd) + (1.0 - tz) * (hb - hd);
}

export function getBeijingTerrainElevation(wx, wz) {
  if (!demState || !demState.elevations) return 0.0;

  const { gridSize, stepM, minWorld, elevations, osmPeaks } = demState;
  const fx = THREE.MathUtils.clamp((wx - minWorld) / stepM, 0, gridSize - 1.0001);
  const fz = THREE.MathUtils.clamp((wz - minWorld) / stepM, 0, gridSize - 1.0001);

  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;

  const row0 = iz * gridSize;
  const row1 = (iz + 1) * gridSize;
  const e00 = elevations[row0 + ix];
  const e10 = elevations[row0 + ix + 1];
  const e01 = elevations[row1 + ix];
  const e11 = elevations[row1 + ix + 1];

  let h =
    e00 * (1 - tx) * (1 - tz) +
    e10 * tx * (1 - tz) +
    e01 * (1 - tx) * tz +
    e11 * tx * tz;

  // Fuse local OSM `natural=peak` summits (e.g. 景山万春亭, 北海琼华岛, 万寿山, 玉泉山, 香山香炉峰)
  if (osmPeaks) {
    for (let i = 0; i < osmPeaks.length; i++) {
      const [, px, pz, relEle] = osmPeaks[i];
      if (relEle <= h + 2.0) continue;
      const dx = wx - px;
      const dz = wz - pz;
      const d2 = dx * dx + dz * dz;
      const radius = relEle > 160.0 ? 420.0 : 230.0;
      if (d2 < radius * radius) {
        const t = 1.0 - d2 / (radius * radius);
        h = Math.max(h, h + (relEle - h) * t * t);
      }
    }
  }

  return h;
}

/**
 * Computes terrain vertex color based on real DEM elevation, slope, and urban distance.
 */
// [terrain-roads] Coarse DEM snowcaps: snowline falls with latitude (~5000 m ASL in the tropics, ~3500 m at Fuji 35°,
// ~2450 m at Rainier/Alps 46°, ~1700 m at 60°);
// steep faces stay bare rock.
/** Snow cover 0..1 at world elevation `elev` (m over the DEM base) and slope (rise/run). Also used by landcover overlays. */
export function snowCover(elev, slope) {
  if (!demState || !Number.isFinite(demState.centerLat)) return 0;
  const asl = elev + (demState.baseAslM || 0);
  const line = Math.max(700, Math.min(5000, 5000 - Math.max(0, Math.abs(demState.centerLat) - 20) * 95));
  if (asl < line - 200) return 0;
  return THREE.MathUtils.smoothstep(asl, line - 200, line + 250) * (1 - THREE.MathUtils.smoothstep(slope, 0.75, 1.3));
}

function sampleTerrainBiomeColor(wx, wz, elev, slope, ground = null) {
  const rgb = sampleTerrainBiomeColorBase(wx, wz, elev, slope, ground);
  const t = snowCover(elev, slope);
  if (t <= 0) return rgb;
  return [rgb[0] + (0.93 - rgb[0]) * t, rgb[1] + (0.95 - rgb[1]) * t, rgb[2] + (0.98 - rgb[2]) * t, rgb[3], rgb[4]];
}

// [ground] Base colour + ground info [r, g, b, built, flavour] from real land use (features/ground_cover.js):
// `ground` is the chunk / horizon sampler; without one (no data yet) the land is untagged meadow.
// No elevation or distance-from-teleport rules: a hillside in SF or Rio stays city, a valley farm stays farm.
function sampleTerrainBiomeColorBase(wx, wz, elev, slope, ground) {
  const g = ground ? ground(wx, wz) : null;
  const rgb = g || [GROUND_MEADOW[0], GROUND_MEADOW[1], GROUND_MEADOW[2], 0, 0];
  const built = rgb[3];
  // Above the treeline (~900 m under the snowline) untagged slopes thin out to alpine turf and scree
  if (demState && Number.isFinite(demState.centerLat) && built < 0.5) {
    const asl = elev + (demState.baseAslM || 0);
    const line = Math.max(700, Math.min(5000, 5000 - Math.max(0, Math.abs(demState.centerLat) - 20) * 95));
    const alpine = THREE.MathUtils.smoothstep(asl, line - 1100, line - 500) * (1 - built);
    if (alpine > 0) {
      rgb[0] += (0.45 - rgb[0]) * alpine * 0.7;
      rgb[1] += (0.45 - rgb[1]) * alpine * 0.7;
      rgb[2] += (0.38 - rgb[2]) * alpine * 0.7;
    }
  }
  const c = groundSlopeTint(rgb, slope, built);
  return [c[0], c[1], c[2], built, rgb[4]];
}

/**
 * Computes raw TypedArray buffers for a 1km x 1km 3D heightfield terrain mesh (usable in Web Worker).
 */
export function buildChunkTerrainArrays(ox, oz, isPointInSunkenTrench = null, chunkGround = null) {
  // [ground] chunk-local land-use sampler -> world sampler; uv carries (built, flavour) for patchUrbanGround
  const ground = chunkGround ? (wx, wz) => chunkGround(wx - ox, wz - oz) : null;
  const segs = 24;
  const step = 1000.0 / segs;
  const pos = [];
  const col = [];
  const uv = [];
  const indices = [];

  const gridH = [];
  for (let iz = 0; iz <= segs; iz++) {
    const row = [];
    const lz = -500.0 + iz * step;
    for (let ix = 0; ix <= segs; ix++) {
      const lx = -500.0 + ix * step;
      const wx = ox + lx;
      const wz = oz + lz;
      // Sit 0.35m below base elevation so parks (+0.10m), water (+0.22m), and roads (+0.32m..0.95m) never Z-fight
      const h = getBeijingTerrainElevation(wx, wz) - 0.35;
      row.push(h);
    }
    gridH.push(row);
  }

  for (let iz = 0; iz <= segs; iz++) {
    const lz = -500.0 + iz * step;
    for (let ix = 0; ix <= segs; ix++) {
      const lx = -500.0 + ix * step;
      const wx = ox + lx;
      const wz = oz + lz;
      const h = gridH[iz][ix];

      const hL = gridH[iz][Math.max(0, ix - 1)];
      const hR = gridH[iz][Math.min(segs, ix + 1)];
      const hD = gridH[Math.max(0, iz - 1)][ix];
      const hU = gridH[Math.min(segs, iz + 1)][ix];
      const slope = Math.hypot(hR - hL, hU - hD) / (2.0 * step);

      pos.push(lx, h, lz);
      const rgb = sampleTerrainBiomeColor(wx, wz, h + 0.25, slope, ground);
      col.push(rgb[0], rgb[1], rgb[2]);
      uv.push(rgb[3] || 0, rgb[4] || 0); // [ground]
    }
  }

  const stride = segs + 1;
  const subSegs = 14;
  const subStride = subSegs + 1;

  for (let iz = 0; iz < segs; iz++) {
    const z0 = -500.0 + iz * step;
    const z1 = z0 + step;
    for (let ix = 0; ix < segs; ix++) {
      const x0 = -500.0 + ix * step;
      const x1 = x0 + step;
      const a = iz * stride + ix;
      const b = a + 1;
      const c = (iz + 1) * stride + ix;
      const d = c + 1;

      if (!isPointInSunkenTrench || !isPointInSunkenTrench.intersectsBox(x0, z0, x1, z1)) {
        indices.push(a, c, b, b, c, d);
        continue;
      }

      // Subdivide cell (ix, iz) into 14x14 (~2.97m) sub-cells to cleanly cut open sunken road trenches
      const baseV = pos.length / 3;
      const ha = gridH[iz][ix];
      const hb = gridH[iz][ix + 1];
      const hc = gridH[iz + 1][ix];
      const hd = gridH[iz + 1][ix + 1];
      const caR = col[a * 3], caG = col[a * 3 + 1], caB = col[a * 3 + 2];
      const cbR = col[b * 3], cbG = col[b * 3 + 1], cbB = col[b * 3 + 2];
      const ccR = col[c * 3], ccG = col[c * 3 + 1], ccB = col[c * 3 + 2];
      const cdR = col[d * 3], cdG = col[d * 3 + 1], cdB = col[d * 3 + 2];
      const ua = a * 2, ub = b * 2, uc = c * 2, ud = d * 2; // [ground] corner ground info

      for (let siz = 0; siz <= subSegs; siz++) {
        const tz = siz / subSegs;
        const slz = z0 + tz * step;
        for (let six = 0; six <= subSegs; six++) {
          const tx = six / subSegs;
          const slx = x0 + tx * step;
          const sh =
            ha * (1 - tx) * (1 - tz) +
            hb * tx * (1 - tz) +
            hc * (1 - tx) * tz +
            hd * tx * tz;
          const sr =
            caR * (1 - tx) * (1 - tz) +
            cbR * tx * (1 - tz) +
            ccR * (1 - tx) * tz +
            cdR * tx * tz;
          const sg =
            caG * (1 - tx) * (1 - tz) +
            cbG * tx * (1 - tz) +
            ccG * (1 - tx) * tz +
            cdG * tx * tz;
          const sb =
            caB * (1 - tx) * (1 - tz) +
            cbB * tx * (1 - tz) +
            ccB * (1 - tx) * tz +
            cdB * tx * tz;
          pos.push(slx, sh, slz);
          col.push(sr, sg, sb);
          const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
          uv.push(
            uv[ua] * w00 + uv[ub] * w10 + uv[uc] * w01 + uv[ud] * w11,
            uv[ua + 1] * w00 + uv[ub + 1] * w10 + uv[uc + 1] * w01 + uv[ud + 1] * w11
          );
        }
      }

      for (let siz = 0; siz < subSegs; siz++) {
        const scz = z0 + ((siz + 0.5) / subSegs) * step;
        for (let six = 0; six < subSegs; six++) {
          const scx = x0 + ((six + 0.5) / subSegs) * step;
          if (isPointInSunkenTrench(scx, scz)) {
            continue;
          }
          const sa = baseV + siz * subStride + six;
          const sb = sa + 1;
          const sc = baseV + (siz + 1) * subStride + six;
          const sd = sc + 1;
          indices.push(sa, sc, sb, sb, sc, sd);
        }
      }
    }
  }

  const u8Col = new Uint8Array(col.length);
  for (let i = 0; i < col.length; i++) {
    u8Col[i] = Math.min(255, Math.max(0, Math.round(col[i] * 255)));
  }

  return {
    positions: new Float32Array(pos),
    colors: u8Col,
    uvs: new Float32Array(uv),
    indices: new Uint32Array(indices),
  };
}

/**
 * Builds a 1km x 1km 3D heightfield terrain mesh for a single chunk (cx, cz) from real DEM data.
 */
export function buildChunkTerrainMesh(ox, oz, terrainMat, isPointInSunkenTrench = null, precomputedArrays = null, chunkGround = null) {
  const arrs = precomputedArrays || buildChunkTerrainArrays(ox, oz, isPointInSunkenTrench, chunkGround);
  const geom = new THREE.BufferGeometry();
  geom.setIndex(new THREE.BufferAttribute(arrs.indices, 1));
  geom.setAttribute('position', new THREE.BufferAttribute(arrs.positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(arrs.colors, 3, true));
  geom.setAttribute('uv', new THREE.BufferAttribute(arrs.uvs, 2));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();


  const mesh = new THREE.Mesh(geom, terrainMat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds the 40km x 40km macro background terrain mesh aligned to the 40x40 chunk grid (80x80 cells = 500m step).
 * Dynamically cuts out cells belonging to `loadedChunks` so the horizon terrain NEVER overlaps or Z-fights
 * with loaded high-detail chunks at any altitude!
 */
export function buildGlobalHorizonTerrain(terrainMat) {
  const size = 40000;
  const segs = 80; // 2x2 cells per 1km chunk
  const step = size / segs;
  const half = size * 0.5;

  const pos = [];
  const col = [];
  const uv = [];

  for (let iz = 0; iz <= segs; iz++) {
    const wz = -half + iz * step;
    for (let ix = 0; ix <= segs; ix++) {
      const wx = -half + ix * step;
      const h = getBeijingTerrainElevation(wx, wz) - 0.45;
      const hL = getBeijingTerrainElevation(Math.max(-half, wx - 40.0), wz);
      const hR = getBeijingTerrainElevation(Math.min(half, wx + 40.0), wz);
      const hD = getBeijingTerrainElevation(wx, Math.max(-half, wz - 40.0));
      const hU = getBeijingTerrainElevation(wx, Math.min(half, wz + 40.0));
      const slope = Math.hypot(hR - hL, hU - hD) / 80.0;
      pos.push(wx, h, wz);
      const rgb = sampleTerrainBiomeColor(wx, wz, h + 0.35, slope);
      col.push(rgb[0], rgb[1], rgb[2]);
      uv.push(0, 0); // [ground] (built, flavour) filled in by applyHorizonGround once the overview is in
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  // Pre-build per-chunk index slices (2x2 cells = 24 indices per chunk) and reusable Uint32Array index buffer
  const stride = segs + 1;
  const chunkIndexSlices = [];
  for (let cz = 0; cz < 40; cz++) {
    for (let cx = 0; cx < 40; cx++) {
      const slice = new Uint32Array(24);
      let ptr = 0;
      for (let dz = 0; dz < 2; dz++) {
        const iz = cz * 2 + dz;
        for (let dx = 0; dx < 2; dx++) {
          const ix = cx * 2 + dx;
          const a = iz * stride + ix;
          const b = a + 1;
          const c = (iz + 1) * stride + ix;
          const d = c + 1;
          slice[ptr++] = a;
          slice[ptr++] = c;
          slice[ptr++] = b;
          slice[ptr++] = b;
          slice[ptr++] = c;
          slice[ptr++] = d;
        }
      }
      chunkIndexSlices.push({ key: `${cx},${cz}`, slice });
    }
  }

  const indexBuf = new Uint32Array(segs * segs * 6);
  const indexAttr = new THREE.BufferAttribute(indexBuf, 1);
  geom.setIndex(indexAttr);

  const mesh = new THREE.Mesh(geom, terrainMat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.segs = segs;
  mesh.userData.chunkIndexSlices = chunkIndexSlices;
  mesh.userData.indexAttr = indexAttr;

  updateGlobalHorizonTerrainCutout(mesh, new Map());
  geom.computeVertexNormals();
  return mesh;
}

/**
 * Updates the pre-allocated index buffer of the global horizon terrain mesh in O(1600 chunks)
 * without allocating any JS arrays or new GPU index buffers.
 */
export function updateGlobalHorizonTerrainCutout(mesh, loadedChunks) {
  if (!mesh || !mesh.geometry) return;
  const { chunkIndexSlices, indexAttr } = mesh.userData;
  if (!chunkIndexSlices || !indexAttr) return;

  const dst = indexAttr.array;
  let writePos = 0;
  for (let i = 0; i < chunkIndexSlices.length; i++) {
    const item = chunkIndexSlices[i];
    if (loadedChunks.has(item.key)) continue;
    dst.set(item.slice, writePos);
    writePos += 24;
  }

  indexAttr.needsUpdate = true;
  mesh.geometry.setDrawRange(0, writePos);
}

/**
 * [ground] Recolours the horizon terrain from the overview's coarse land-use grid (built after the mesh on teleport).
 * `sampler(wx, wz)` -> [r, g, b, built, flavour] (ground_cover.js overviewGroundSampler).
 */
export function applyHorizonGround(mesh, sampler) {
  if (!mesh || !mesh.geometry || !sampler) return;
  const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, uv = mesh.geometry.attributes.uv;
  if (!pos || !col || !uv) return;
  const P = pos.array, n = pos.count;
  const segs = mesh.userData.segs || 80, stride = segs + 1;
  for (let i = 0; i < n; i++) {
    const wx = P[i * 3], h = P[i * 3 + 1], wz = P[i * 3 + 2];
    const ix = i % stride, iz = (i / stride) | 0;
    const hL = P[(iz * stride + Math.max(0, ix - 1)) * 3 + 1], hR = P[(iz * stride + Math.min(segs, ix + 1)) * 3 + 1];
    const hD = P[(Math.max(0, iz - 1) * stride + ix) * 3 + 1], hU = P[(Math.min(segs, iz + 1) * stride + ix) * 3 + 1];
    const step = 40000 / segs;
    const slope = Math.hypot(hR - hL, hU - hD) / (2 * step);
    const rgb = sampleTerrainBiomeColor(wx, wz, h + 0.8, slope, sampler);
    col.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    uv.setXY(i, rgb[3] || 0, rgb[4] || 0);
  }
  col.needsUpdate = true;
  uv.needsUpdate = true;
}

/** [ground] Fetches/builds the overview's land-use grid, then recolours `mesh` (resolves when done). */
export async function applyHorizonGroundAsync(mesh, overview, worldOrigin, horizonRoot = null, mats = null) {
  try {
    await null; // let the caller finish building the horizon layer
    // The horizon park / arterial ribbons use vertex-coloured materials but carry no colour attribute, which WebGL
    // reads as black (dark scars across the distant city): give them their surface colour.
    for (const m of (horizonRoot && horizonRoot.children) || []) {
      const g = m.geometry, mat = m.material;
      if (!g || !mat || !mat.vertexColors || g.attributes.color || !g.attributes.position || m === mesh) continue;
      const rgb = mats && mat === mats.parkMat ? [0.29, 0.43, 0.24] : mats && mat === mats.waterMat ? [1, 1, 1] : [0.36, 0.37, 0.38];
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set(rgb, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    const grid = await horizonGroundFor(overview, worldOrigin);
    if (grid) applyHorizonGround(mesh, overviewGroundSampler(grid));
  } catch {
    // keep the meadow colouring
  }
}

/**
 * Procedural atmospheric scattering sky dome with solar disk & horizon haze.
 */
export function createAtmosphericSkyDome() {
  const skyGeo = new THREE.SphereGeometry(16800, 36, 20);
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
    uZenithColor: { value: new THREE.Color(0x2b6cb0) },
    uHorizonColor: { value: new THREE.Color(0xbfd8ec) },
    uGroundColor: { value: new THREE.Color(0x636e72) },
    uSunColor: { value: new THREE.Color(0xfff3d1) },
    uSunIntensity: { value: 1.0 },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;
        float upT = pow(clamp(y, 0.0, 1.0), 0.52);
        vec3 col = mix(uHorizonColor, uZenithColor, upT);

        if (y < 0.0) {
          col = mix(uHorizonColor, uGroundColor, clamp(-y * 4.0, 0.0, 1.0));
        }

        float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
        float mieGlow = pow(sunDot, 10.0) * 0.32 * uSunIntensity;
        float sunDisc = smoothstep(0.9982, 0.9996, sunDot) * 1.35 * uSunIntensity;
        col += uSunColor * (mieGlow + sunDisc);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(skyGeo, skyMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
