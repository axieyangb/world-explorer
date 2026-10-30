import * as THREE from '../vendor/three.module.js';
import { buildTrafficGraph, trafficGraphBuffers } from './features/traffic_graph.js'; // [feature/traffic] lane graph
import { appendPolyShoreUv, appendRibbonShoreUv } from './features/water_shore.js'; // feature/atmosphere
import { buildWaterMask, waterMaskTransfer } from './features/water_physics.js'; // fix/water
import { buildBridgeDecks, isGoldenGateBridgeWay, worldXZToLatLon } from './features/bridge_deck.js'; // fix/water
import { computeRoadLiftProfiles } from './features/bridge_profile.js'; // fix/bridge-continuity
import { clearBridgeDeckBuildings } from './features/bridge_deck_buildings.js'; // [release-6-integ] Tower Bridge deck blockers
import { makeLandmarkDeckTest } from './features/landmarks/registry.js'; // [lm-west] hand-built bridge decks replace generic piers
import { buildRoadGrid, roadGridTransfer } from './features/road_grid.js'; // fix/water
import {
  getBeijingTerrainElevation,
  getChunkTerrainMeshElevation,
  buildChunkTerrainMesh,
  buildChunkTerrainArrays,
  snowCover,
} from './environment.js';
import { appendCompactChunkBuildingWFC, FACADE_CATALOG, DOOR_CATALOG, resolveRegionTag } from './wfc/wfc_mesh_builder.js';
import { computeStreetFeatures } from './features/street_worker.js'; // [feature/street]
import { buildWaterwayMesh } from './features/waterways.js'; // [terrain-roads]
const VIADUCT_H = 2.6; // [elevated-roads] lifted non-bridge ways above this many metres are built as viaducts
const STREET_OWNS_LANE_MARKINGS = true; // [feature/street] lane lines/crosswalks drawn by features/street_worker.js
import { buildVegetationLayer } from './features/vegetation_worker.js'; // [feature/vegetation]
import { chunkGroundSampler } from './features/ground_cover.js'; // [ground]
import { appendInfillBuilding } from './features/infill_buildings.js'; // [ground]
import { archRegionFor, poolRings, createRoofContext, roofInfoFor, noteRoofHouse, finishRoofDetail, wrapRoofLod } from './features/roofs_chunk.js'; // [roofs]
import { drawExtraFacadeLayers } from './features/facade_styles.js'; // [roofs]
import { computePlacesPayload, collectPlacesTransfer } from './features/places_worker.js'; // feature/places
import { buildVenues, setVenueTerrainSampler } from './features/venues.js'; // [venues]
import { buildPoiVenues, poiVenuesTransfer, createPoiVenueMats } from './features/poi_venues.js'; // [venues-poi]
setVenueTerrainSampler(getBeijingTerrainElevation); // [release-6-integ] breaks environment<->venues import cycle
import { addPlacesInfo } from './features/places_info/pi_worker.js'; // places-info
import { kaijuPatchBuildingShader, kaijuCreateBuildingDepthMaterial, kaijuBidAttribute } from './features/kaiju/kaiju_destruction.js'; // [kaiju]
import {
  LANDMARKS_40,
  matchLandmarkForChunkBuilding,
} from './landmarks_40.js';
import { buildRailTrack } from './features/rail_build.js'; // [feature/rail-transit]

/**
 * Converts a float [0..1] RGB array into a compact normalized Uint8Array (3 bytes/vertex instead of 12).
 */
export function toUint8Colors(floatCol) {
  const n = floatCol.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = floatCol[i];
    u8[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
  }
  return u8;
}

/**
 * Class A Memory Optimization: Computes boundingSphere (and normals if requested) and registers
 * `onUploadCallback` on all attributes so Three.js frees JS-side TypedArrays immediately after GPU VBO upload.
 */
export function finalizeAndReleaseGeometry(geom, computeNormals = false, keepRaycastArrays = false) {
  const posAttr = geom.attributes.position;
  if (posAttr && posAttr.array) {
    const arr = posAttr.array;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) arr[i] = 0;
    }
  }
  if (computeNormals) {
    geom.computeVertexNormals();
  }
  geom.computeBoundingSphere();
  if (keepRaycastArrays) return geom;
  for (const key of Object.keys(geom.attributes)) {
    const attr = geom.attributes[key];
    if (attr) {
      attr.onUploadCallback = function () {
        this.array = null;
      };
    }
  }
  if (geom.index && !keepRaycastArrays) {
    geom.index.onUploadCallback = function () {
      this.array = null;
    };
  }
  return geom;
}

/**
 * Generates a 512x512 procedural architectural facade texture + bump map for a specific style:
 * - 'glass': CBD curtain-wall skyscraper (reflective mullions, spandrel bands, mechanical floors)
 * - 'modern': Urban residential/office tower (stone/terracotta cladding, recessed windows & balconies)
 * - 'imperial': Forbidden City / classical palace (vermilion pillars, golden-green painted beams, lattice windows, white marble base)
 * - 'hutong': Old Beijing Siheyuan / brick courtyard (grey brick masonry, carved lintels, warm wood frames)
 */
function createStyleFacadeTexture(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = 512;
  emCanvas.height = 512;
  const emCtx = emCanvas.getContext('2d');
  emCtx.fillStyle = '#000000';
  emCtx.fillRect(0, 0, 512, 512);

  // Non-linear 2D integer hash (eliminates diagonal/vertical linear congruence striping on tall facades)
  const cellHash = (r, c) => {
    let h = ((r * 374761393) ^ (c * 668265263) ^ (r * c * 1274126177)) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    return (h ^ (h >> 16)) & 0xff;
  };

  if (style === 'glass') {
    // Curtain-wall glass tower (smooth reflective sky gradient + subtle non-periodic pane variations)
    ctx.fillStyle = '#4a6b88';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 10;
    const cols = 10;
    const rh = 512 / rows;
    const cw = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      // Subtle metallic spandrel band
      ctx.fillStyle = '#5c7c99';
      ctx.fillRect(0, y, 512, 6);
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const hSeed = cellHash(r + 11, c + 37) % 24;
        if (hSeed < 3) {
          ctx.fillStyle = '#89b4d4'; // Soft sky reflection highlight
        } else if (hSeed < 12) {
          ctx.fillStyle = '#6289ab'; // Mid curtain-wall glass
        } else if (hSeed < 20) {
          ctx.fillStyle = '#4e7394'; // Deep curtain-wall glass
        } else {
          ctx.fillStyle = '#7da0bd'; // Warm-tinted interior daylight
        }
        ctx.fillRect(x + 4, y + 7, cw - 8, rh - 10);
        if (hSeed >= 17) {
          emCtx.fillStyle = hSeed >= 21 ? '#ffd88a' : '#8ecae6';
          emCtx.fillRect(x + 6, y + 9, cw - 12, rh - 14);
        }
        // Vertical aluminum mullion
        ctx.fillStyle = '#6f8ea8';
        ctx.fillRect(x, y, 4, rh);
      }
    }
  } else if (style === 'imperial') {
    // Classical Chinese Palace (vermilion walls, painted architrave frieze, golden lattice windows)
    ctx.fillStyle = '#8f2422';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 4;
    const cols = 8;
    const rh = 512 / rows;
    const cw = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      // Top painted architrave beam (额枋青绿彩画)
      ctx.fillStyle = '#1d5c4b';
      ctx.fillRect(0, y, 512, 18);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(0, y + 18, 512, 6);
      // White marble base dado (汉白玉台基线)
      ctx.fillStyle = '#dedad2';
      ctx.fillRect(0, y + rh - 14, 512, 14);

      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        // Vermilion round pillar
        ctx.fillStyle = '#a82320';
        ctx.fillRect(x, y + 24, 10, rh - 38);
        // Golden wooden lattice window (隔扇窗)
        ctx.fillStyle = '#c8963e';
        ctx.fillRect(x + 14, y + 30, cw - 24, rh - 50);
        ctx.fillStyle = '#47281c';
        ctx.fillRect(x + 18, y + 34, cw - 32, rh - 58);
        if ((cellHash(r + 7, c + 13) % 5) < 2) {
          emCtx.fillStyle = '#ffb84d';
          emCtx.fillRect(x + 18, y + 34, cw - 32, rh - 58);
        }
        // Lattice grid bars
        ctx.fillStyle = '#d9a74a';
        ctx.fillRect(x + cw * 0.5 - 2, y + 34, 4, rh - 58);
        ctx.fillRect(x + 18, y + rh * 0.5, cw - 32, 4);
      }
    }
  } else if (style === 'hutong') {
    // Old Beijing grey-brick courtyard & cultural architecture
    ctx.fillStyle = '#737980';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 4;
    const cols = 6;
    const rh = 512 / rows;
    const cw = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      ctx.fillStyle = '#636970';
      ctx.fillRect(0, y, 512, 10);
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        // Carved stone window lintel
        ctx.fillStyle = '#8a9096';
        ctx.fillRect(x + 14, y + 24, cw - 28, 10);
        // Traditional wooden frame + warm lit paper/glass pane
        ctx.fillStyle = '#6e4230';
        ctx.fillRect(x + 16, y + 34, cw - 32, rh - 54);
        const lit = (cellHash(r + 5, c + 19) % 7) < 2;
        ctx.fillStyle = lit ? '#d8c296' : '#4a5259';
        ctx.fillRect(x + 20, y + 38, cw - 40, rh - 62);
        if (lit) {
          emCtx.fillStyle = '#ffcf78';
          emCtx.fillRect(x + 20, y + 38, cw - 40, rh - 62);
        }
      }
    }
  } else {
    // 'modern' / 'residential': High-detail apartment & commercial facade with non-periodic window shading
    ctx.fillStyle = '#d2cbc3';
    ctx.fillRect(0, 0, 512, 512);
    const rows = 10;
    const cols = 10;
    const rh = 512 / rows;
    const cw = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      // Soft floor slab band
      ctx.fillStyle = '#c0b8b0';
      ctx.fillRect(0, y, 512, 7);
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        // Recessed window bay
        ctx.fillStyle = '#8b9198';
        ctx.fillRect(x + 9, y + 12, cw - 18, rh - 18);
        const seed = cellHash(r + 3, c + 29) % 20;
        if (seed < 4) {
          ctx.fillStyle = '#c8bd9e'; // Soft warm interior
          emCtx.fillStyle = '#ffd685';
          emCtx.fillRect(x + 11, y + 14, cw - 22, rh - 22);
        } else if (seed < 12) {
          ctx.fillStyle = '#7d9ab0'; // Daylight sky reflection
        } else {
          ctx.fillStyle = '#5a6673'; // Shaded window pane
        }
        ctx.fillRect(x + 11, y + 14, cw - 22, rh - 22);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;

  const emTex = new THREE.CanvasTexture(emCanvas);
  emTex.wrapS = THREE.RepeatWrapping;
  emTex.wrapT = THREE.RepeatWrapping;
  emTex.colorSpace = THREE.SRGBColorSpace;
  emTex.minFilter = THREE.LinearMipmapLinearFilter;
  emTex.magFilter = THREE.LinearFilter;
  emTex.anisotropy = 16;

  return { map: tex, emissiveMap: emTex };
}

// [night] Per facade layer (tile index), the room grid the night shader lights window by window:
// (cell width, cell height, x offset, y offset from the tile bottom), in tile uv. Cell edges fall on wall between the
// window rectangles of assets/facades/facade_mask_strip.png (tools/gen_facade_mask.py). Kind: 0 home, 1 office,
// 2 shop, 3 parking garage, 4 industrial.
const FACADE_NIGHT_PARS = `
const vec4 FACADE_UNITS[24] = vec4[24](
  vec4(0.25000, 0.25000, 0.00000, 0.00000),
  vec4(0.12500, 0.25000, 0.00000, 0.24414),
  vec4(0.25000, 0.25000, 0.12500, 0.00000),
  vec4(0.25000, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.25000, 0.00000, 0.23633),
  vec4(0.33333, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.25000, 0.00000, 0.00000),
  vec4(0.25000, 0.33333, 0.00000, 0.00000),
  vec4(0.33333, 0.33333, 0.00000, 0.00000),
  vec4(0.33333, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.25000, 0.00000, 0.00000),
  vec4(0.12500, 0.20000, 0.00000, 0.20000),
  vec4(0.12500, 0.14286, 0.00000, 0.00000),
  vec4(0.33333, 0.33333, 0.00000, 0.00000),
  vec4(0.25000, 0.25000, 0.00000, 0.00000),
  vec4(0.33333, 0.50000, 0.01172, 0.45703),
  vec4(0.25000, 0.25000, 0.00000, 0.00000),
  vec4(0.25000, 0.33333, 0.00000, 0.00000),
  vec4(0.33333, 0.25000, 0.00000, 0.00000),
  vec4(0.33333, 0.50000, 0.00000, 0.00000),
  vec4(0.33333, 1.00000, 0.00000, 0.00000),
  vec4(0.25000, 0.50000, 0.00000, 0.00000)
);
const float FACADE_KIND[24] = float[24](1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 2.0, 3.0, 0.0, 0.0, 0.0, 2.0, 4.0);
uniform float uLitFrac;
uniform float uNightClock;
flat varying float vNightBid;
float nightHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

/**
 * Creates shared materials and procedural architectural facade textures.
 */
function createFallbackFacadeArrayTexture() {
  const N = FACADE_CATALOG.length;
  const S = 16;
  const data = new Uint8Array(S * S * N * 4);
  for (let i = 0; i < N; i++) {
    const spec = FACADE_CATALOG[i];
    const avg = spec.avgColor || [0.55, 0.55, 0.55];
    const rWall = Math.round(avg[0] * 255);
    const gWall = Math.round(avg[1] * 255);
    const bWall = Math.round(avg[2] * 255);
    const baseOff = i * S * S * 4;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const isWin = (x % 4 >= 1 && x % 4 <= 2) && (y % 4 >= 1 && y % 4 <= 2);
        const off = baseOff + (y * S + x) * 4;
        data[off] = isWin ? Math.round(rWall * 0.55) : rWall;
        data[off + 1] = isWin ? Math.round(gWall * 0.62) : gWall;
        data[off + 2] = isWin ? Math.round(bWall * 0.72) : bWall;
        data[off + 3] = isWin ? 220 : 12;
      }
    }
  }
  const tex = new THREE.DataArrayTexture(data, S, S, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Loads the 24-layer 512x512 seamless AI facade strip + window mask strip into a WebGL2
 * THREE.DataArrayTexture (RGBA, where RGB = sRGB albedo and A = linear window glass mask).
 */
export async function loadFacadeArrayTexture(mats) {
  if (typeof document === 'undefined') return null;
  try {
    const stripSrc =
      (typeof window !== 'undefined' && window.__EMBEDDED_FACADE_STRIP__) ||
      'assets/facades/facade_strip.jpg';
    const maskSrc =
      (typeof window !== 'undefined' && window.__EMBEDDED_FACADE_MASK_STRIP__) ||
      'assets/facades/facade_mask_strip.png'; // [night] lossless 0/1 window mask

    const [rgbImg, maskImg] = await Promise.all([
      loadImageElement(stripSrc),
      loadImageElement(maskSrc),
    ]);

    const S = 512;
    const N0 = Math.max(1, Math.round(rgbImg.height / S));
    const totalH = S * N0;
    const extraLayers = N0 === 24 ? drawExtraFacadeLayers(S) : []; // [roofs] procedural regional layers 24..
    const N = N0 + extraLayers.length;

    const cRgb = document.createElement('canvas');
    cRgb.width = S;
    cRgb.height = totalH;
    const ctxRgb = cRgb.getContext('2d');
    ctxRgb.drawImage(rgbImg, 0, 0, S, totalH);
    const rgbBytes = ctxRgb.getImageData(0, 0, S, totalH).data;

    const cMask = document.createElement('canvas');
    cMask.width = S;
    cMask.height = totalH;
    const ctxMask = cMask.getContext('2d');
    ctxMask.drawImage(maskImg, 0, 0, S, totalH);
    const maskBytes = ctxMask.getImageData(0, 0, S, totalH).data;

    const rgba = new Uint8Array(S * S * N * 4);
    for (let e = 0; e < extraLayers.length; e++) { // [roofs] same vertical flip as the strip
      const src = extraLayers[e], base = (N0 + e) * S * S * 4;
      for (let r = 0; r < S; r++) rgba.set(src.subarray((S - 1 - r) * S * 4, (S - r) * S * 4), base + r * S * 4);
    }
    for (let layer = 0; layer < N0; layer++) {
      const layerDstBase = layer * S * S * 4;
      for (let r = 0; r < S; r++) {
        // Flip each 512x512 tile vertically so v=0 is bottom (ground) and v=1 is top (roof)
        const srcRow = layer * S + (S - 1 - r);
        const srcRowBase = srcRow * S * 4;
        const dstRowBase = layerDstBase + r * S * 4;
        for (let c = 0; c < S; c++) {
          const sOff = srcRowBase + c * 4;
          const dOff = dstRowBase + c * 4;
          rgba[dOff] = rgbBytes[sOff];
          rgba[dOff + 1] = rgbBytes[sOff + 1];
          rgba[dOff + 2] = rgbBytes[sOff + 2];
          rgba[dOff + 3] = maskBytes[sOff];
        }
      }
    }

    const arrayTex = new THREE.DataArrayTexture(rgba, S, S, N);
    arrayTex.format = THREE.RGBAFormat;
    arrayTex.type = THREE.UnsignedByteType;
    arrayTex.colorSpace = THREE.SRGBColorSpace;
    arrayTex.wrapS = THREE.RepeatWrapping;
    arrayTex.wrapT = THREE.RepeatWrapping;
    arrayTex.minFilter = THREE.LinearMipmapLinearFilter;
    arrayTex.magFilter = THREE.LinearFilter;
    arrayTex.generateMipmaps = true;
    arrayTex.anisotropy = 8;
    arrayTex.needsUpdate = true;

    if (mats && mats.wfcBldgMat && mats.wfcBldgMat.userData.nightUniforms) {
      const prev = mats.wfcBldgMat.userData.nightUniforms.uFacadeArray.value;
      mats.wfcBldgMat.userData.nightUniforms.uFacadeArray.value = arrayTex;
      if (prev && prev !== arrayTex && prev.dispose) prev.dispose();
    }

    // Also load the 12-layer 512x512 architectural entrance door array texture in parallel
    try {
      const doorStripSrc =
        (typeof window !== 'undefined' && window.__EMBEDDED_DOOR_STRIP__) ||
        'assets/doors/door_strip.jpg';
      const doorMaskSrc =
        (typeof window !== 'undefined' && window.__EMBEDDED_DOOR_MASK_STRIP__) ||
        'assets/doors/door_mask_strip.jpg';
      const [dRgbImg, dMaskImg] = await Promise.all([
        loadImageElement(doorStripSrc),
        loadImageElement(doorMaskSrc),
      ]);
      const dN = Math.max(1, Math.round(dRgbImg.height / S));
      const dTotalH = S * dN;

      const dcRgb = document.createElement('canvas');
      dcRgb.width = S;
      dcRgb.height = dTotalH;
      const dCtxRgb = dcRgb.getContext('2d');
      dCtxRgb.drawImage(dRgbImg, 0, 0, S, dTotalH);
      const dRgbBytes = dCtxRgb.getImageData(0, 0, S, dTotalH).data;

      const dcMask = document.createElement('canvas');
      dcMask.width = S;
      dcMask.height = dTotalH;
      const dCtxMask = dcMask.getContext('2d');
      dCtxMask.drawImage(dMaskImg, 0, 0, S, dTotalH);
      const dMaskBytes = dCtxMask.getImageData(0, 0, S, dTotalH).data;

      const dRgba = new Uint8Array(S * S * dN * 4);
      for (let layer = 0; layer < dN; layer++) {
        const layerDstBase = layer * S * S * 4;
        for (let r = 0; r < S; r++) {
          const srcRow = layer * S + (S - 1 - r);
          const srcRowBase = srcRow * S * 4;
          const dstRowBase = layerDstBase + r * S * 4;
          for (let c = 0; c < S; c++) {
            const sOff = srcRowBase + c * 4;
            const dOff = dstRowBase + c * 4;
            dRgba[dOff] = dRgbBytes[sOff];
            dRgba[dOff + 1] = dRgbBytes[sOff + 1];
            dRgba[dOff + 2] = dRgbBytes[sOff + 2];
            dRgba[dOff + 3] = dMaskBytes[sOff];
          }
        }
      }

      const doorArrayTex = new THREE.DataArrayTexture(dRgba, S, S, dN);
      doorArrayTex.format = THREE.RGBAFormat;
      doorArrayTex.type = THREE.UnsignedByteType;
      doorArrayTex.colorSpace = THREE.SRGBColorSpace;
      doorArrayTex.wrapS = THREE.ClampToEdgeWrapping;
      doorArrayTex.wrapT = THREE.ClampToEdgeWrapping;
      doorArrayTex.minFilter = THREE.LinearMipmapLinearFilter;
      doorArrayTex.magFilter = THREE.LinearFilter;
      doorArrayTex.generateMipmaps = true;
      doorArrayTex.anisotropy = 8;
      doorArrayTex.needsUpdate = true;

      if (mats && mats.wfcBldgMat && mats.wfcBldgMat.userData.nightUniforms) {
        const prevD = mats.wfcBldgMat.userData.nightUniforms.uDoorArray?.value;
        if (mats.wfcBldgMat.userData.nightUniforms.uDoorArray) {
          mats.wfcBldgMat.userData.nightUniforms.uDoorArray.value = doorArrayTex;
        }
        if (prevD && prevD !== doorArrayTex && prevD.dispose) prevD.dispose();
      }
    } catch (doorErr) {
      console.warn('Door array texture load fallback:', doorErr);
    }

    return arrayTex;
  } catch (err) {
    console.warn('Facade array texture load fallback:', err);
    return null;
  }
}

function createFallbackDoorArrayTexture() {
  const N = DOOR_CATALOG.length;
  const S = 16;
  const data = new Uint8Array(S * S * N * 4);
  for (let i = 0; i < N; i++) {
    const spec = DOOR_CATALOG[i];
    const avg = spec.avgColor || [0.45, 0.42, 0.38];
    const rWall = Math.round(avg[0] * 255);
    const gWall = Math.round(avg[1] * 255);
    const bWall = Math.round(avg[2] * 255);
    const baseOff = i * S * S * 4;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const inFrame = x >= 2 && x <= 13 && y <= 14;
        const inGlass = x >= 4 && x <= 11 && y >= 1 && y <= 11;
        const off = baseOff + (y * S + x) * 4;
        data[off] = inGlass ? Math.round(rWall * 0.65) : rWall;
        data[off + 1] = inGlass ? Math.round(gWall * 0.68) : gWall;
        data[off + 2] = inGlass ? Math.round(bWall * 0.72) : bWall;
        data[off + 3] = inGlass ? 210 : (inFrame ? 102 : 8);
      }
    }
  }
  const tex = new THREE.DataArrayTexture(data, S, S, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createSharedMaterials() {
  const texGlass = createStyleFacadeTexture('glass');
  const texModern = createStyleFacadeTexture('modern');
  const texImperial = createStyleFacadeTexture('imperial');
  const texHutong = createStyleFacadeTexture('hutong');

  const buildingMats = {
    glass: new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: texGlass.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texGlass.emissiveMap,
      emissiveIntensity: 0.06,
      roughness: 0.26,
      metalness: 0.55,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
    }),
    modern: new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: texModern.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texModern.emissiveMap,
      emissiveIntensity: 0.06,
      roughness: 0.62,
      metalness: 0.12,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
    }),
    imperial: new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: texImperial.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texImperial.emissiveMap,
      emissiveIntensity: 0.08,
      roughness: 0.55,
      metalness: 0.15,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
    }),
    hutong: new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: texHutong.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texHutong.emissiveMap,
      emissiveIntensity: 0.08,
      roughness: 0.82,
      metalness: 0.05,
      side: THREE.DoubleSide,
      shadowSide: THREE.BackSide,
    }),
  };

  const roofMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    metalness: 0.14,
    side: THREE.DoubleSide,
    shadowSide: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
  });

  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const markingMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -6,
  });

  const bridgeStructMat = new THREE.MeshStandardMaterial({
    color: 0x8a929e,
    roughness: 0.75,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x165b8c,
    roughness: 0.36,
    metalness: 0.18,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
  });

  const parkMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  const vegetationMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.76,
    metalness: 0.02,
  });

  const railMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.65,
    metalness: 0.35,
  });

  const facilityMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  const fallbackFacadeArray = createFallbackFacadeArrayTexture();
  const fallbackDoorArray = createFallbackDoorArrayTexture();
  const wfcNightUniforms = {
    uNightEmissive: { value: 0.08 },
    uLitFrac: { value: 0.5 }, // [night] share of rooms lit, from the local hour (atmosphere.js)
    uNightClock: { value: 0 }, // [night] seconds, for TV flicker
    uFacadeArray: { value: fallbackFacadeArray },
    uDoorArray: { value: fallbackDoorArray },
  };
  const wfcBldgMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.12,
    side: THREE.DoubleSide,
    shadowSide: THREE.BackSide,
  });
  wfcBldgMat.userData.nightUniforms = wfcNightUniforms;
  wfcBldgMat.onBeforeCompile = (shader) => {
    shader.uniforms.uNightEmissive = wfcNightUniforms.uNightEmissive;
    shader.uniforms.uLitFrac = wfcNightUniforms.uLitFrac; // [night]
    shader.uniforms.uNightClock = wfcNightUniforms.uNightClock;
    shader.uniforms.uFacadeArray = wfcNightUniforms.uFacadeArray;
    shader.uniforms.uDoorArray = wfcNightUniforms.uDoorArray;
    shader.vertexShader =
      'varying float vEmissive;\nvarying vec2 vFacadeUv;\nvarying vec3 vWorldNorm;\nvarying vec3 vBldgWorld;\nflat varying float vNightBid;\n' +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nvEmissive = step(1.5, length(objectNormal));\nobjectNormal = normalize(objectNormal);\nvFacadeUv = uv;\nvWorldNorm = objectNormal;\n' +
            // [night] per-building seed for the lit-room pattern: kaiju's building id (kBid, declared by its patch) + chunk
            'vNightBid = fract(kBid * 0.6180339 + modelMatrix[3].x * 0.00131 + modelMatrix[3].z * 0.00293);'
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvBldgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
    shader.fragmentShader =
      FACADE_NIGHT_PARS + // [night]
      'uniform float uNightEmissive;\nuniform mediump sampler2DArray uFacadeArray;\nuniform mediump sampler2DArray uDoorArray;\nvarying float vEmissive;\nvarying vec2 vFacadeUv;\nvarying vec3 vWorldNorm;\nvarying vec3 vBldgWorld;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vFacadeUv.y >= 0.5 && abs(vWorldNorm.y) < 0.45 && vFacadeUv.x >= 23999.5 && vFacadeUv.y < 949.5) { // [roofs] layers >= 24 live at v 999+
          float doorLayer = clamp(floor((vFacadeUv.x - 24000.0 + 0.5) / 1000.0), 0.0, 11.0);
          float uDoor = clamp(vFacadeUv.x - 24000.0 - doorLayer * 1000.0, 0.0, 1.0);
          float vDoor = clamp(vFacadeUv.y - 1.0, 0.0, 1.0);
          float doorDistFade = 1.0 - smoothstep(245.0, 310.0, length(vViewPosition));

          vec4 doorSample = texture(uDoorArray, vec3(uDoor, vDoor, doorLayer));
          vec3 doorRgb = doorSample.rgb;
          float dAlpha = doorSample.a;

          float glassMask = smoothstep(0.52, 0.78, dAlpha) * doorDistFade;
          float nightLevel = clamp((uNightEmissive - 0.15) / 1.15, 0.0, 1.0);
          vec3 skyRefl = mix(vec3(0.56, 0.69, 0.84), vec3(0.10, 0.15, 0.24), nightLevel);
          vec3 shadedDoor = mix(doorRgb * 1.06, mix(doorRgb * 1.12, skyRefl, 0.22), glassMask);

          diffuseColor.rgb = mix(diffuseColor.rgb, shadedDoor, doorDistFade);

          float dLum = dot(doorRgb, vec3(0.299, 0.587, 0.114));
          float dLx = clamp(dFdx(dLum), -0.09, 0.09);
          float dLy = clamp(dFdy(dLum), -0.09, 0.09);
          float dGrad = max(fwidth(uDoor), fwidth(vDoor));
          float dBumpFade = (1.0 - smoothstep(0.03, 0.20, dGrad)) * doorDistFade;
          normal = normalize(normal + vec3(-dLx, -dLy, 0.0) * (1.85 * dBumpFade * (1.0 - 0.55 * glassMask)));

          roughnessFactor = mix(roughnessFactor, mix(0.58, 0.16, glassMask), doorDistFade);
          metalnessFactor = mix(metalnessFactor, mix(0.06, 0.18, glassMask), doorDistFade);

          if (nightLevel > 0.001 && glassMask > 0.02) {
            float isLobbyOrShop = (
              doorLayer < 1.5 || abs(doorLayer - 2.0) < 0.5 ||
              abs(doorLayer - 6.0) < 0.5 || abs(doorLayer - 9.0) < 0.5
            ) ? 1.0 : 0.0;
            vec3 warmLobby = vec3(1.0, 0.78, 0.42);
            vec3 glowCol = warmLobby * (0.24 + 0.76 * doorRgb) * mix(0.65, 1.05, isLobbyOrShop);
            totalEmissiveRadiance += glowCol * glassMask * nightLevel * (uNightEmissive * 0.46);
          }
        } else if (vFacadeUv.y >= 0.5 && abs(vWorldNorm.y) < 0.45) {
          // [roofs] layers >= 24: uv = (u, 999 + (layer - 24) * 200 + v) (see facadeV in wfc_mesh_builder.js)
          float xLayer = clamp(floor((vFacadeUv.x + 0.5) / 1000.0), 0.0, 23.0);
          float yLayer = floor((vFacadeUv.y - 999.0 + 50.0) / 200.0);
          bool extraLayer = vFacadeUv.y > 949.5;
          float texLayer = extraLayer ? min(24.0 + yLayer, ${FACADE_CATALOG.length - 1}.0) : xLayer;
          float uRep = max(0.0, extraLayer ? vFacadeUv.x : vFacadeUv.x - xLayer * 1000.0);
          float vRep = max(0.0, extraLayer ? vFacadeUv.y - 1000.0 - yLayer * 200.0 : vFacadeUv.y - 1.0);

          vec4 texSample = texture(uFacadeArray, vec3(uRep, vRep, texLayer));
          vec3 facadeRgb = texSample.rgb;
          float rawAlpha = texSample.a;
          // [night] footprint of one tile texel on screen: > 1 = magnified (close up), < 1 = minified (far)
          float texPx = 1.0 / max(max(fwidth(uRep), fwidth(vRep)) * 512.0, 1e-4);
          // crisp 0/1 mask (facade_mask_strip.png): a hard edge up close, plain coverage once texels shrink
          float winMask = mix(rawAlpha, smoothstep(0.3, 0.7, rawAlpha), clamp(texPx - 0.5, 0.0, 1.0));
          float nightLevel = clamp((uNightEmissive - 0.15) / 1.15, 0.0, 1.0);
          // [night] magnified close up: unsharp mask against a blurred mip + sub-texel grain on the wall,
          // so brick / stone keeps its mortar lines instead of smearing into bilinear mush
          if (texPx > 1.6) {
            float sh = clamp((texPx - 1.6) * 0.5, 0.0, 1.0);
            vec3 blurRgb = textureLod(uFacadeArray, vec3(uRep, vRep, texLayer), 1.6).rgb;
            facadeRgb = max(facadeRgb + (facadeRgb - blurRgb) * (0.85 * sh), vec3(0.0));
            vec2 gq = vec2(uRep, vRep) * 1536.0;
            float grain = fract(sin(dot(floor(gq), vec2(12.9898, 78.233))) * 43758.5453);
            facadeRgb *= 1.0 + (grain - 0.5) * 0.07 * sh * (1.0 - winMask);
          }

          // Room grid coordinates (FACADE_UNITS for photo layers 0..23, 4x4 grid for procedural layers >= 24)
          int li = int(min(texLayer, 23.0) + 0.5);
          vec4 fu = texLayer > 23.5 ? vec4(0.25, 0.25, 0.0, 0.0) : FACADE_UNITS[li];
          float kind = texLayer > 23.5 ? (abs(texLayer - 31.0) < 0.5 ? 1.0 : 0.0) : FACADE_KIND[li];
          vec2 gp = vec2((uRep - fu.z) / fu.x, (vRep - fu.w) / fu.y);
          vec2 cell = floor(gp);
          vec2 cellUv = fract(gp);
          vec2 gfw = fwidth(gp);
          float bSeed = vNightBid;
          float hF = nightHash(vec2(cell.y, bSeed * 113.0));
          float hU = nightHash(cell + vec2(bSeed * 57.0, texLayer * 3.1));
          float hC = nightHash(cell.yx + vec2(19.7, bSeed * 23.0));
          float uvGrad = max(fwidth(uRep), fwidth(vRep));
          float bumpFade = 1.0 - smoothstep(0.04, 0.24, uvGrad);
          float isCurtain = (texLayer < 2.5 || abs(texLayer - 5.0) < 0.5 || abs(texLayer - 22.0) < 0.5 || abs(texLayer - 31.0) < 0.5) ? 1.0 : 0.0;

          // Pure photographic AI facade albedo modulated by subtle per-building tint, vertical AO & analytical sky reflection on glass
          vec3 baseAlbedo = facadeRgb * diffuseColor.rgb * 1.08;
          if (texLayer > 23.5) { // [roofs] regional layers: only paintable wall (A ~0.12) takes the paint tint
            float paint = smoothstep(0.035, 0.09, rawAlpha) * (1.0 - smoothstep(0.2, 0.3, rawAlpha));
            vec3 unpainted = facadeRgb * 1.08 * min(1.0, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * 1.18);
            baseAlbedo = mix(unpainted, baseAlbedo, paint);
          }

          // Under-sill rain-drip weathering & floor ledge micro-shadow on masonry/cladding outside window glass
          float sillBand = smoothstep(0.16, 0.0, cellUv.y) * (0.55 + 0.45 * sin(cellUv.x * 18.85 + hU * 6.28));
          baseAlbedo *= 1.0 - sillBand * 0.11 * bumpFade * (1.0 - winMask) * (1.0 - isCurtain * 0.75);

          // Recessed window frame reveal shadow + True 3D Raycasted Interior Cube-Mapping (ceiling, floor, walls, decor)
          vec3 skyRefl = mix(vec3(0.54, 0.68, 0.84), vec3(0.08, 0.13, 0.22), nightLevel);
          vec3 glassAlbedo = mix(baseAlbedo * 1.15, skyRefl, 0.24);
          vec3 interiorRoomCol = vec3(0.72, 0.68, 0.62);
          float interiorLamp = 0.0;
          float isGroundShowcase = step(vRep, 1.35) * (1.0 - step(2.5, kind));
          if (winMask > 0.25 && bumpFade > 0.01) {
            float revTop = smoothstep(0.94, 0.76, cellUv.y);
            float revSide = smoothstep(0.04, 0.16, cellUv.x) * smoothstep(0.96, 0.84, cellUv.x);
            float revealShadow = mix(1.0, 0.70 + 0.30 * revTop * revSide, bumpFade * (1.0 - isCurtain * 0.5));

            // Tangent basis on vertical wall & camera-to-fragment ray in room space (rd.z > 0 points into the room)
            vec3 N = normalize(vWorldNorm);
            vec3 T = normalize(vec3(-N.z, 0.0, N.x) + vec3(1e-5, 0.0, 0.0));
            vec3 B = vec3(0.0, 1.0, 0.0);
            vec3 V = normalize(vBldgWorld - cameraPosition);
            vec3 rd = vec3(dot(V, T), dot(V, B), max(0.14, -dot(V, N)));
            vec3 ro = vec3(cellUv.x - 0.5, cellUv.y - 0.5, 0.0);
            float roomDepth = mix(0.65, 0.78, isGroundShowcase);
            float tBack = roomDepth / rd.z;
            float sX = rd.x >= 0.0 ? 0.5 : -0.5;
            float tX = (sX - ro.x) / (abs(rd.x) < 1e-4 ? (rd.x >= 0.0 ? 1e-4 : -1e-4) : rd.x);
            float sY = rd.y >= 0.0 ? 0.5 : -0.5;
            float tY = (sY - ro.y) / (abs(rd.y) < 1e-4 ? (rd.y >= 0.0 ? 1e-4 : -1e-4) : rd.y);
            float tHit = min(tBack, min(max(0.0, tX), max(0.0, tY)));
            vec3 pRoom = ro + rd * tHit;

            // Classify hit surface: ceiling (pRoom.y > 0.48), floor (pRoom.y < -0.48), or back/side walls
            float hitCeil = step(0.48, pRoom.y);
            float hitFloor = step(pRoom.y, -0.48) * (1.0 - hitCeil);
            float hitWall = 1.0 - max(hitCeil, hitFloor);

            // Ceiling: warm acoustic tiles + glowing rectangular ceiling light fixture strip
            float ceilGrid = 0.93 + 0.07 * cos(pRoom.x * 25.1) * cos(pRoom.z * 25.1);
            float lampMask = step(abs(pRoom.x), 0.22) * step(abs(pRoom.z - 0.32), 0.14);
            interiorLamp = lampMask * hitCeil;
            vec3 ceilCol = mix(vec3(0.82, 0.78, 0.72) * ceilGrid, vec3(1.35, 1.24, 1.02), lampMask);

            // Floor: warm hardwood parquet / commercial tile planks with subtle board joints along pRoom.x
            float plank = 0.88 + 0.12 * sin(pRoom.x * 36.0 + floor(pRoom.z * 6.0) * 1.7);
            vec3 woodFloor = mix(vec3(0.48, 0.34, 0.22), vec3(0.42, 0.44, 0.47), step(0.5, kind)) * plank;
            float floorWallAo = smoothstep(0.5, 0.22, max(abs(pRoom.x), abs(pRoom.z - roomDepth * 0.5)));
            vec3 floorCol = woodFloor * (0.72 + 0.28 * floorWallAo);

            // Back & Side Walls: warm plaster + procedural bookshelves / framed art / office monitors seeded by hU
            vec3 wallBase = mix(vec3(0.78, 0.73, 0.66), vec3(0.72, 0.76, 0.80), step(0.5, kind));
            wallBase = mix(wallBase, vec3(0.88, 0.76, 0.58), isGroundShowcase);
            float wallCoordX = abs(pRoom.x) > 0.48 ? (pRoom.z / roomDepth - 0.5) : pRoom.x;
            float hasShelves = step(0.38, fract(hU * 11.3));
            float shelfBand = step(abs(pRoom.y + 0.05), 0.28) * step(abs(wallCoordX), 0.34) * hasShelves;
            float shelfRow = step(0.42, fract((pRoom.y + 0.35) * 7.5));
            float bookColorHash = fract(sin(floor((wallCoordX + 0.5) * 18.0 + floor((pRoom.y + 0.5) * 7.5) * 13.0 + hU * 41.0)) * 43758.5453);
            vec3 shelfCol = mix(vec3(0.34, 0.22, 0.14), mix(vec3(0.68, 0.26, 0.22), vec3(0.24, 0.46, 0.62), bookColorHash), shelfRow);
            float frameOffset = (fract(hU * 5.7) - 0.5) * 0.26;
            float artFrame = (1.0 - hasShelves) * step(abs(wallCoordX - frameOffset), 0.17) * step(abs(pRoom.y - 0.06), 0.14);
            vec3 artCol = mix(vec3(0.24, 0.36, 0.48), vec3(0.76, 0.58, 0.36), fract(hU * 17.9));
            vec3 wallCol = mix(wallBase, shelfCol, shelfBand * 0.85);
            wallCol = mix(wallCol, artCol, artFrame * 0.80);

            float depthAo = 1.0 - 0.35 * clamp(pRoom.z / roomDepth, 0.0, 1.0);
            interiorRoomCol = (ceilCol * hitCeil + floorCol * hitFloor + wallCol * hitWall) * depthAo;
            interiorRoomCol *= mix(1.0, 1.22, isGroundShowcase);

            // Venetian blind slats / sheer curtains in select upper windows (ground-floor showcases stay open)
            float hasBlinds = step(0.60, fract(hU * 13.7)) * (1.0 - step(2.5, kind)) * (1.0 - isGroundShowcase);
            float blindDrop = 0.28 + 0.52 * fract(hU * 7.9);
            float inBlind = step(1.0 - blindDrop, cellUv.y) * hasBlinds;
            float slats = 0.82 + 0.18 * sin(cellUv.y * 48.0);
            vec3 blindTint = mix(vec3(0.84, 0.81, 0.75), vec3(0.74, 0.78, 0.82), step(0.5, hC)) * slats;

            // Blend 3D interior room behind exterior glass reflection & blinds
            vec3 dayRoomMix = mix(glassAlbedo * 0.88, interiorRoomCol * 0.68 + skyRefl * 0.22, 0.58 * bumpFade);
            glassAlbedo = mix(dayRoomMix, blindTint * 0.58, inBlind * 0.48 * bumpFade) * revealShadow;
            // Crisp sun/sky specular glint across glass panes
            vec3 viewDirV = normalize(vViewPosition);
            float sunGlint = pow(clamp(dot(reflect(-viewDirV, normal), normalize(vec3(0.42, 0.74, 0.52))), 0.0, 1.0), 18.0);
            glassAlbedo += vec3(0.95, 0.92, 0.84) * sunGlint * 0.22 * (1.0 - nightLevel * 0.85);
          }
          diffuseColor.rgb = mix(baseAlbedo, glassAlbedo, winMask);

          // Screen-space micro-bump normal relief on masonry/mullions (fades smoothly at distance)
          float lum = dot(facadeRgb, vec3(0.299, 0.587, 0.114));
          float dLx = clamp(dFdx(lum), -0.08, 0.08);
          float dLy = clamp(dFdy(lum), -0.08, 0.08);
          normal = normalize(normal + vec3(-dLx, -dLy, 0.0) * (1.75 * bumpFade * (1.0 - 0.65 * winMask) * (texLayer > 23.5 ? 0.5 : 1.0))); // [roofs] crisp vector layers: softer screen-space bump

          // Keep metalness moderate so Three.js PBR without envMap never crushes shaded street-canyon glass to black
          roughnessFactor = mix(mix(0.78, 0.42, isCurtain), 0.15, winMask);
          metalnessFactor = mix(mix(0.04, 0.16, isCurtain), 0.22, winMask);

          // [night] lit rooms. Each layer has a room grid (FACADE_UNITS) whose cell edges fall on wall, so a room is a
          // whole window. Offices light whole floors (cleaners / late teams), homes light unit by unit in warm tones
          // with the odd flickering TV, shops stay bright until late; uLitFrac follows the local hour.
          if (nightLevel > 0.001 && winMask > 0.01) {
            float isOffice = step(0.5, kind) * step(kind, 1.5);
            float isShop = step(1.5, kind) * step(kind, 2.5);
            float isGarage = step(2.5, kind);
            float frac = uLitFrac;
            float shopFrac = clamp(uLitFrac * 1.6, 0.0, 0.92);
            // office: floor lit as a band, with a few dark bays and lone late workers on dark floors
            float floorOn = step(hF, frac * 0.75);
            float lOffice = max(floorOn * step(0.16, hU), step(hU, frac * 0.12));
            float lHome = step(hU, frac);
            float lit = mix(mix(lHome, lOffice, isOffice), step(hU, shopFrac), isShop);
            lit = mix(lit, 1.0, isGarage);
            // far away: average instead of per-room on/off, per axis, so towers never shimmer into a checkerboard
            float fx = clamp(gfw.x * 2.0 - 0.6, 0.0, 1.0), fy = clamp(gfw.y * 2.0 - 0.6, 0.0, 1.0);
            float rowAvg = mix(mix(frac, floorOn * 0.86 + frac * 0.1, isOffice), shopFrac, isShop);
            rowAvg = mix(rowAvg, 1.0, isGarage);
            float allAvg = mix(mix(frac, frac * 0.75, isOffice), shopFrac, isShop);
            allAvg = mix(allAvg, 1.0, isGarage);
            lit = mix(mix(lit, rowAvg, fx), allAvg, fy);
            // room colour: warm homes (2700-3000K, some cooler LED), offices cool white, garages sodium/LED
            vec3 warmHome = mix(vec3(1.0, 0.62, 0.30), vec3(1.0, 0.80, 0.55), hC);
            vec3 homeCol = mix(warmHome, vec3(0.92, 0.95, 1.0), step(0.82, hC));
            vec3 officeCol = mix(vec3(1.0, 0.84, 0.58), vec3(0.78, 0.9, 1.0), step(0.68, hF));
            vec3 roomCol = mix(mix(homeCol, officeCol, isOffice), vec3(1.0, 0.86, 0.62), isShop);
            roomCol = mix(roomCol, vec3(1.0, 0.78, 0.45), isGarage);
            float bright = mix(0.45 + 0.55 * fract(hU * 7.3), 0.8 + 0.2 * fract(hU * 5.1), max(isOffice, isShop));
            // TVs: a blue-white flicker in a few lit homes
            float tv = step(0.9, fract(hU * 31.7)) * (1.0 - isOffice) * (1.0 - isShop) * (1.0 - isGarage) * (1.0 - fx);
            float tvF = 0.55 + 0.45 * sin(uNightClock * 7.0 + hU * 40.0) * sin(uNightClock * 2.3 + hU * 13.0);
            roomCol = mix(roomCol, vec3(0.55, 0.7, 1.0) * tvF, tv);
            // inside the pane: brighter toward the ceiling, curtains half-drawn in some homes (close range only)
            float inY = fract(gp.y);
            float near = 1.0 - max(fx, fy);
            float shade = mix(1.0, (0.72 + 0.4 * inY) * (0.78 + 0.22 * nightHash(floor(gp * vec2(5.0, 2.0)) + hU)), near * 0.7);
            float curtain = step(0.7, fract(hC * 9.1)) * (1.0 - isOffice) * near;
            shade *= 1.0 - curtain * 0.45;
            // the photo's frames / mullions stay a little darker than the glass they hold
            float frameDark = mix(1.0, 0.82 + 0.18 * smoothstep(0.08, 0.35, lum), near);
            vec3 roomE = roomCol * bright * shade * frameDark;
            // Blend in 3D raycasted interior room surfaces (ceiling lamp strip, wood floor, shelves & back wall depth)
            roomE *= mix(vec3(1.0), interiorRoomCol * 1.35 + vec3(0.35, 0.32, 0.24) * interiorLamp, 0.55 * near * bumpFade);
            roomE *= mix(1.0, 1.24, isGroundShowcase);
            // a little of the photo's pane detail (blinds, mullions, displays) so lit glass is not a flat slab
            roomE *= mix(1.0, 0.5 + 1.2 * lum, 0.3 * near);
            vec3 avgCol = mix(mix(vec3(1.0, 0.72, 0.42), vec3(0.95, 0.84, 0.64), isOffice), vec3(1.0, 0.86, 0.62), isShop);
            roomE = mix(roomE, avgCol * 0.72, max(fx, fy) * 0.8);
            totalEmissiveRadiance += roomE * winMask * lit * (nightLevel * 0.36);
            // unlit glass at night: faint blue-black, never the daytime sky
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, winMask * nightLevel * (1.0 - lit));
          }
        } else if (vFacadeUv.y < -19.5) {
          // [roofs] procedural roof coverings (features/roofs.js): uv = (mat * 1000 + 300 + s, -20 - t), s along the eave, t up the slope (m)
          float rMat = floor((vFacadeUv.x + 0.5) / 1000.0);
          float rs = vFacadeUv.x - rMat * 1000.0;
          float rt = -20.0 - vFacadeUv.y;
          float rfw = max(fwidth(rs), fwidth(rt));
          float rFade = 1.0 - smoothstep(0.06, 0.3, rfw);
          float pat = 1.0;
          float rRough = 0.82, rMetal = 0.02;
          if (rMat < 1.5 || abs(rMat - 6.0) < 0.5 || abs(rMat - 7.0) < 0.5) {
            // clay: barrel (1) / flat interlocking (6) / glazed Japanese (7) tiles in courses
            float course = rMat < 1.5 ? 0.36 : 0.32;
            float row = floor(rt / course);
            float ft = fract(rt / course);
            float width = rMat < 1.5 ? 0.24 : 0.3;
            float sc = rs / width + (rMat < 1.5 ? 0.0 : 0.5 * mod(row, 2.0));
            float fs = fract(sc);
            float hTile = fract(sin(dot(vec2(floor(sc), row), vec2(12.9898, 78.233))) * 43758.5453);
            float crest = rMat < 1.5 ? sin(fs * 3.14159) : 1.0 - 0.5 * smoothstep(0.9, 1.0, fs) - 0.5 * smoothstep(0.1, 0.0, fs);
            pat = (0.74 + 0.30 * crest) * (1.0 - 0.28 * smoothstep(0.72, 1.0, ft)) * (0.9 + 0.2 * hTile);
            rRough = abs(rMat - 7.0) < 0.5 ? 0.45 : 0.8;
            rMetal = abs(rMat - 7.0) < 0.5 ? 0.12 : 0.02;
          } else if (abs(rMat - 2.0) < 0.5 || abs(rMat - 3.0) < 0.5) {
            // slate (2) / asphalt shingles (3): staggered rectangles with dark gaps
            float course = rMat < 2.5 ? 0.26 : 0.14;
            float width = rMat < 2.5 ? 0.32 : 0.33;
            float row = floor(rt / course);
            float sc = rs / width + 0.5 * mod(row, 2.0) + 0.17 * fract(row * 0.37);
            float fs = fract(sc), ft = fract(rt / course);
            float hTile = fract(sin(dot(vec2(floor(sc), row), vec2(39.3468, 11.135))) * 43758.5453);
            float gap = smoothstep(0.0, 0.05, fs) * smoothstep(1.0, 0.95, fs) * smoothstep(0.0, 0.12, ft);
            pat = (0.72 + 0.28 * gap) * (0.88 + 0.24 * hTile) * (1.0 - 0.18 * smoothstep(0.6, 1.0, ft));
            rRough = rMat < 2.5 ? 0.55 : 0.92;
          } else if (abs(rMat - 4.0) < 0.5 || abs(rMat - 5.0) < 0.5) {
            // standing-seam metal (4) / Paris zinc (5): seams down the slope, a little sheen
            float seamW = rMat < 4.5 ? 0.52 : 0.46;
            float fs = fract(rs / seamW);
            float seam = smoothstep(0.0, 0.04, fs) * smoothstep(1.0, 0.94, fs);
            pat = 0.78 + 0.26 * seam + 0.06 * sin(rs * 1.7 + rt * 0.3);
            rRough = rMat < 4.5 ? 0.42 : 0.5;
            rMetal = rMat < 4.5 ? 0.45 : 0.35;
          } else if (abs(rMat - 10.0) < 0.5) {
            // wooden privacy fence: vertical boards, darker gaps, weathered streaks
            float fs = fract(rs / 0.14);
            float hB = fract(sin(floor(rs / 0.14) * 91.7) * 43758.5453);
            pat = (0.8 + 0.2 * smoothstep(0.0, 0.08, fs) * smoothstep(1.0, 0.9, fs)) * (0.86 + 0.24 * hB) * (0.94 + 0.08 * sin(rt * 9.0 + hB * 6.0));
            rRough = 0.9;
          } else if (abs(rMat - 8.0) < 0.5) {
            // flat commercial / residential roof (rMat = 8): bitumen/TPO membrane roll seams, gravel grain, drainage stains,
            // plus seeded rooftop skylight/solar grids or high-rise helipad H markings around roof center (500, 500)
            vec2 rp = vec2(rs - 500.0, rt - 500.0);
            vec2 roll = rp / vec2(1.25, 4.2);
            float rowR = floor(roll.y);
            float colR = floor(roll.x + 0.5 * mod(rowR, 2.0));
            vec2 fRoll = fract(vec2(roll.x + 0.5 * mod(rowR, 2.0), roll.y));
            float seam = smoothstep(0.0, 0.055, fRoll.x) * smoothstep(1.0, 0.945, fRoll.x) *
                         smoothstep(0.0, 0.035, fRoll.y) * smoothstep(1.0, 0.965, fRoll.y);
            float hSheet = nightHash(vec2(colR, rowR) + vNightBid * 37.0);
            float hGrav = nightHash(floor(rp * 7.5));
            float pond = sin(rp.x * 0.23 + vNightBid * 19.0) * cos(rp.y * 0.19 - vNightBid * 11.0);
            pat = (0.86 + 0.14 * seam) * (0.93 + 0.14 * hSheet) * (0.94 + 0.12 * hGrav) * (0.92 + 0.10 * pond);
            rRough = mix(0.90, 0.62, smoothstep(0.35, 0.75, -pond));
            rMetal = 0.04;
            // Commercial skylight / photovoltaic grid on a subset of roofs
            if (vNightBid > 0.56 && vNightBid < 0.85 && abs(rp.x) < 5.6 && abs(rp.y) < 5.6) {
              vec2 sg = fract((rp + 5.6) / vec2(1.6, 2.4));
              float inPane = smoothstep(0.08, 0.13, sg.x) * smoothstep(0.92, 0.87, sg.x) *
                             smoothstep(0.08, 0.13, sg.y) * smoothstep(0.92, 0.87, sg.y);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.17, 0.28), inPane * rFade * 0.82);
              rRough = mix(rRough, 0.18, inPane * rFade);
              rMetal = mix(rMetal, 0.35, inPane * rFade);
              float nightLvl = clamp((uNightEmissive - 0.15) / 1.15, 0.0, 1.0);
              if (vNightBid > 0.72 && nightLvl > 0.01) {
                totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * inPane * rFade * nightLvl * 0.22;
              }
            } else if (vNightBid >= 0.86) {
              // High-rise circular helipad ring + central H marking
              float rDist = length(rp);
              float ringM = smoothstep(0.32, 0.18, abs(rDist - 5.8));
              float hLegs = step(abs(abs(rp.x) - 1.35), 0.28) * step(abs(rp.y), 2.1);
              float hBar = step(abs(rp.x), 1.35) * step(abs(rp.y), 0.28);
              float markM = clamp(ringM + max(hLegs, hBar), 0.0, 1.0) * step(rDist, 6.4);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.78, 0.22), markM * rFade * 0.85);
            }
          } else if (abs(rMat - 9.0) < 0.5) {
            // pool water: caustic ripples, glossy
            float w1 = sin(rs * 5.1 + rt * 2.3 + sin(rt * 3.1) * 1.5);
            float w2 = sin(rs * 2.7 - rt * 4.9 + sin(rs * 2.2) * 1.3);
            pat = 0.92 + 0.14 * smoothstep(0.6, 1.0, w1 * w2);
            rRough = 0.08; rMetal = 0.1;
          }
          diffuseColor.rgb *= mix(1.0, pat, rFade);
          float pDx = clamp(dFdx(pat), -0.12, 0.12), pDy = clamp(dFdy(pat), -0.12, 0.12);
          normal = normalize(normal + vec3(-pDx, -pDy, 0.0) * (1.6 * rFade));
          roughnessFactor = rRough;
          metalnessFactor = rMetal;
        }
        totalEmissiveRadiance += diffuseColor.rgb * vEmissive * uNightEmissive;`
      );
    kaijuPatchBuildingShader(shader); // [kaiju] per-building damage/collapse state
  };

  return {
    buildingMats,
    wfcBldgMat,
    wfcBldgDepthMat: kaijuCreateBuildingDepthMaterial(), // [kaiju]
    roofMat,
    terrainMat,
    roadMat,
    markingMat,
    bridgeStructMat,
    waterMat,
    parkMat,
    vegetationMat,
    railMat,
    facilityMat,
    ...createPoiVenueMats(wfcNightUniforms), // [venues-poi]
  };
}

const STYLE_PALETTES = {
  imperial: {
    wall: [0.95, 0.75, 0.72], // Tints the rich vermilion-and-gold imperial texture
    roof: [0.94, 0.72, 0.24], // Glazed golden imperial tile
  },
  hutong: {
    wall: [0.85, 0.87, 0.90], // Tints the grey brick texture
    roof: [0.42, 0.45, 0.49], // Dark grey pitched tile
  },
  glass: {
    wall: [0.82, 0.92, 1.0],  // Crisp curtain-wall cyan/blue/silver tint
    roof: [0.35, 0.44, 0.52],
  },
  residential: {
    wall: [0.96, 0.88, 0.80], // Warm sandstone/terracotta residential tint
    roof: [0.54, 0.48, 0.44],
  },
  industrial: {
    wall: [0.78, 0.82, 0.86],
    roof: [0.42, 0.52, 0.62],
  },
  modern: {
    wall: [0.90, 0.92, 0.95],
    roof: [0.52, 0.55, 0.60],
  },
};

const ROAD_COLORS = {
  motorway:       [0.20, 0.22, 0.27],
  motorway_link:  [0.23, 0.25, 0.30],
  trunk:          [0.21, 0.23, 0.28],
  trunk_link:     [0.24, 0.26, 0.31],
  primary:        [0.25, 0.27, 0.32],
  primary_link:   [0.27, 0.29, 0.34],
  secondary:      [0.28, 0.30, 0.35],
  secondary_link: [0.29, 0.31, 0.36],
  tertiary:       [0.31, 0.33, 0.38],
  tertiary_link:  [0.31, 0.33, 0.38],
  residential:    [0.35, 0.37, 0.41],
  service:        [0.38, 0.40, 0.44],
  pedestrian:     [0.52, 0.50, 0.47],
  footway:        [0.50, 0.48, 0.45],
  cycleway:       [0.24, 0.56, 0.32], // [terrain-roads] green bike lanes
};
const UNPAVED_TRAIL_RGB = [0.52, 0.43, 0.31]; // [terrain-roads] dirt trails (roads[11] = unpaved)

// Widened vertical separation between road classes to prevent Z-fighting at all altitudes
const ROAD_Y_BIAS = {
  footway: 0.28,
  cycleway: 0.31,
  pedestrian: 0.34,
  service: 0.38,
  residential: 0.43,
  tertiary_link: 0.48,
  tertiary: 0.52,
  secondary_link: 0.57,
  secondary: 0.62,
  primary_link: 0.68,
  primary: 0.74,
  trunk_link: 0.80,
  trunk: 0.86,
  motorway_link: 0.83,
  motorway: 0.92,
};

function parseCssHexColor(str, fallbackRgb) {
  if (!str || typeof str !== 'string') return fallbackRgb;
  const s = str.trim().toLowerCase();
  if (s.startsWith('#') && (s.length === 7 || s.length === 4)) {
    const c = new THREE.Color(s);
    return [c.r, c.g, c.b];
  }
  return fallbackRgb;
}

/**
 * Computes signed area in (x, z) plane:
 * > 0 when polygon is ordered counter-clockwise in (x, z) (so edge (dx, dz) has outward normal (dz, 0, -dx)).
 */
function signedAreaXZ(pts) {
  let area2 = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    area2 += p1.x * p2.y - p2.x * p1.y;
  }
  return area2 * 0.5;
}

/**
 * Creates a step-able incremental chunk build task (`step(budgetMs)`) so streaming chunks can be
 * constructed across multiple frames without blocking the main thread.
 */
export function createChunkBuildTask(cx, cz, ox, oz, data, mats, layerVisibility, worldOrigin = null) {
  const regionTag = resolveRegionTag(worldOrigin);
  const archRegion = archRegionFor(worldOrigin); // [roofs]
  let groundSampler = null; // [roofs] shared with the roof inference (land-use flavour)
  const root = new THREE.Group();
  root.position.set(ox, 0, oz);
  root.name = `chunk_${cx}_${cz}`;

  const subGroups = {
    terrain: new THREE.Group(),
    roads: new THREE.Group(),
    markings: new THREE.Group(),
    bridges: new THREE.Group(),
    buildings: new THREE.Group(),
    vegetation: new THREE.Group(),
    railways: new THREE.Group(),
    facilities: new THREE.Group(),
  };

  for (const [k, g] of Object.entries(subGroups)) {
    if (layerVisibility && k in layerVisibility) {
      g.visible = Boolean(layerVisibility[k]);
    }
    root.add(g);
  }

  const roadSegments = [];      // World-space segments for elevation/navigation/AI traffic
  const buildingColliders = []; // World-space AABBs for vehicle/player collision
  const roadEntities = [];      // Lightweight road metadata for 2D/3D math ray picking
  const buildingEntities = [];  // Lightweight building metadata for 2D/3D math ray picking
  let isPointInWater = null;
  let isPointInSunkenTrench = null;
  let buildingTask = null;
  let stage = 0;

  root.userData = {
    cx,
    cz,
    ox,
    oz,
    subGroups,
    roadSegments,
    buildingColliders,
    roadEntities,
    buildingEntities,
  };

  return {
    root,
    done: false,
    step(budgetMs = 5.5) {
      const t0 = performance.now();

      if (stage === 0) {
        isPointInWater = createWaterMaskChecker(data);
        root.userData.waterMask = buildWaterMask(data); // fix/water: bit raster for car/walk/heli water physics
        normalizeChunkTunnels(data.roads, data.road_context, isPointInWater);
        isPointInSunkenTrench = createSunkenTrenchChecker(data.roads || []);

        // 0. 3D Heightfield Terrain Mesh for this 1km x 1km chunk (with open-trench cutouts for sunken roads)
        subGroups.terrain.add(buildChunkTerrainMesh(ox, oz, mats.terrainMat, isPointInSunkenTrench, null, (groundSampler = chunkGroundSampler(data)))); // [roofs] sampler kept // [ground] land-use ground colour

        // 1. Parks & Landuse Plazas + Water Bodies (conforming to 3D terrain)
        buildParksAndWater(data, ox, oz, subGroups.terrain, mats, isPointInWater, isPointInSunkenTrench);

        stage = 1;
        if (performance.now() - t0 >= budgetMs) {
          return false;
        }
      }

      if (stage === 1) {
        // 2. Roads, Lane Markings, Directional Arrows, Bridge Piers/Parapets & Tunnels
        buildRoadsAndBridges(
          data.roads || [],
          ox,
          oz,
          subGroups.roads,
          subGroups.markings,
          subGroups.bridges,
          mats,
          roadSegments,
          isPointInWater,
          isPointInSunkenTrench,
          roadEntities,
          worldOrigin,
          data.railways || [],
          data.road_context || []
        );

        // fix/water: fill gaps between parallel narrow bridge ways (deck strip + physics-only deck segments)
        {
          const deck = buildBridgeDecks(roadSegments, ox, oz);
          root.userData.deckSegments = deck.segs;
          if (deck.pos.length > 0) {
            const dg = new THREE.BufferGeometry();
            dg.setAttribute('position', new THREE.Float32BufferAttribute(deck.pos, 3));
            dg.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(deck.col), 3, true));
            finalizeAndReleaseGeometry(dg, true, true);
            const dm = new THREE.Mesh(dg, mats.roadMat);
            dm.receiveShadow = true;
            subGroups.roads.add(dm);
          }
        }

        // 3. Railways & Elevated Subway Viaducts
        // [feature/rail-transit] real-geometry tracks (ballast/street/catenary/viaducts) + vehicle network payload
        if (data.rail) root.userData.rail = buildRailTrack(data.rail, ox, oz, subGroups.railways, mats, roadSegments);
        else buildRailways(data.railways || [], ox, oz, subGroups.railways, mats);
        delete roadSegments.liftWays; // [release-6-integ]

        buildingTask = createBuildingBuildTask(
          dropBuildingsOnBridgeDecks(data.buildings || [], roadSegments, isPointInWater, ox, oz), // [elevated-roads]
          ox,
          oz,
          subGroups.buildings,
          mats,
          buildingColliders,
          roadSegments,
          buildingEntities,
          regionTag,
          { arch: archRegion, ground: groundSampler, pools: poolRings(data), warm: (worldOrigin?.centerLat ?? 90) < 36 } // [roofs]
        );
        stage = 2;
        if (performance.now() - t0 >= budgetMs) {
          return false;
        }
      }

      if (stage === 2) {
        const rem = Math.max(0.5, budgetMs - (performance.now() - t0));
        if (!buildingTask.step(rem)) {
          return false;
        }
        stage = 3;
        if (performance.now() - t0 >= budgetMs) {
          return false;
        }
      }

      if (stage === 3) {
        root.userData.poiVenues = buildPoiVenues({ data, ox, oz, groups: subGroups, mats, buildingEntities, roadSegments, isPointInWater, colliders: buildingColliders }); // [venues-poi] before places: claims its POIs
        // 5. 3D Vegetation (Street Boulevard Trees, Park Cypress/Pine & Western Hills Forests)
        // [feature/vegetation] Landcover ground mesh + instanced street/park/forest trees (replaces legacy buildVegetation)
        root.userData.vegInstances = buildVegetationLayer({
          cx, cz, ox, oz, data, roadSegments, isPointInWater, isPointInSunkenTrench,
          terrainGroup: subGroups.terrain, worldOrigin, // [lm-west] worldOrigin: no trees inside landmark footprints
        });

        // 6. 3D Traffic Facilities (Traffic Signals, Motorway Exit Gantries, Crosswalks, Subway/Bus Stations)
        buildFacilities(data.facilities || [], ox, oz, subGroups.facilities, mats);
        root.userData.street = computeStreetFeatures(root, data, ox, oz, worldOrigin, mats); // [feature/street]

        // feature/places: rooftop detail, POIs, airports, ships, stadiums, bridge steel, train rails
        root.userData.places = computePlacesPayload({
          data, ox, oz, buildingEntities, roadSegments, isPointInWater, groups: subGroups, mats,
        });
        root.userData.venues = buildVenues({ data, ox, oz, groups: subGroups, mats, colliders: buildingColliders }); // [venues] stadium bowls + theme-park rides
        addPlacesInfo(root.userData.places, { data, ox, oz, buildingEntities, roadSegments, isPointInWater, street: root.userData.street }); // places-info

        stage = 4;
        this.done = true;
        return true;
      }

      return true;
    },
  };
}

/**
 * Builds a complete 1km x 1km chunk 3D Group + spatial collision/elevation index synchronously.
 */
export function buildChunkMeshGroup(cx, cz, ox, oz, data, mats, layerVisibility, worldOrigin = null) {
  const task = createChunkBuildTask(cx, cz, ox, oz, data, mats, layerVisibility, worldOrigin);
  task.step(Infinity);
  return task.root;
}

/**
 * 2D point-in-polygon ray-casting test on a flat [x0, z0, x1, z1, ...] ring.
 */
export function pointInRing2D(px, pz, flat) {
  let inside = false;
  const n = flat.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1];
    const xj = flat[j], zj = flat[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Builds a fast chunk-local water mask checker (`isPointInWater(lx, lz, margin)`) over all
 * `water_polys` (respecting island `holes` such as Nanhu Island in Kunming Lake) and `water_lines`.
 */
function createWaterMaskChecker(data) {
  const polys = [];
  const allIslandHoles = [];
  const pushHoleRing = (ring) => {
    if (!ring || ring.length < 6) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i], z = ring[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    allIslandHoles.push({ minX, maxX, minZ, maxZ, ring });
  };
  for (const h of data.island_holes || []) pushHoleRing(h);
  for (const wp of data.water_polys || []) {
    const [, , fo, fh] = wp;
    if (!fo || fo.length < 6) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < fo.length; i += 2) {
      const x = fo[i], z = fo[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    for (const h of fh || []) pushHoleRing(h);
    polys.push({ minX, maxX, minZ, maxZ, outer: fo, holes: fh || [] });
  }

  const lines = [];
  for (const wl of data.water_lines || []) {
    const [, , , widthM, flat] = wl;
    if (!flat || flat.length < 4) continue;
    const hw = Math.max(3.5, (widthM || 10) * 0.5);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i], z = flat[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    lines.push({ minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw, hw, flat });
  }

  const isSinglePointInWater = (lx, lz) => {
    for (let h = 0; h < allIslandHoles.length; h++) {
      const hr = allIslandHoles[h];
      if (lx < hr.minX || lx > hr.maxX || lz < hr.minZ || lz > hr.maxZ) continue;
      if (pointInRing2D(lx, lz, hr.ring)) return false;
    }
    for (let i = 0; i < polys.length; i++) {
      const p = polys[i];
      if (lx < p.minX || lx > p.maxX || lz < p.minZ || lz > p.maxZ) continue;
      if (pointInRing2D(lx, lz, p.outer)) {
        let inHole = false;
        for (let h = 0; h < p.holes.length; h++) {
          if (p.holes[h].length >= 6 && pointInRing2D(lx, lz, p.holes[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (lx < l.minX || lx > l.maxX || lz < l.minZ || lz > l.maxZ) continue;
      const f = l.flat;
      const hw2 = l.hw * l.hw;
      for (let k = 0; k < f.length - 2; k += 2) {
        const x1 = f[k], z1 = f[k + 1], x2 = f[k + 2], z2 = f[k + 3];
        const vx = x2 - x1, vz = z2 - z1;
        const len2 = vx * vx + vz * vz;
        if (len2 < 0.05) continue;
        const t = Math.max(0, Math.min(1, ((lx - x1) * vx + (lz - z1) * vz) / len2));
        const dx = lx - (x1 + vx * t), dz = lz - (z1 + vz * t);
        if (dx * dx + dz * dz <= hw2) return true;
      }
    }
    return false;
  };

  return (lx, lz, margin = 0) => {
    if (isSinglePointInWater(lx, lz)) return true;
    if (margin > 0) {
      if (isSinglePointInWater(lx + margin, lz)) return true;
      if (isSinglePointInWater(lx - margin, lz)) return true;
      if (isSinglePointInWater(lx, lz + margin)) return true;
      if (isSinglePointInWater(lx, lz - margin)) return true;
    }
    return false;
  };
}

/**
 * Builds a spatial checker (`isPointInSunkenTrench(lx, lz)`) for sunken open-trench roads (`rawY < -1.0m`,
 * e.g. 北四环西路 main road) so the chunk terrain mesh and park polygons cut open above the sunken road trench,
 * and cross-bridges (e.g. 保福寺桥, 中关村一桥, 中关村二桥) can suppress trench top parapets directly underneath their decks.
 */
const DEEP_TUNNEL_NAME_RE = /tunnel|隧道|隧|tube|holland|lincoln|midtown|battery|callahan|sumner|ted\s*williams|yerba\s*buena|posey|webster|caldecott|robin\s*williams|devil.?s\s*slide|harbour|harbor|mont\s*blanc|gotthard|seikan|kanmon|aqua.?line|rotherhithe|blackwall|dartford|clyde|mersey|tyne|elbtunnel|ijtunnel|maastunnel/i;
const MINOR_TUNNEL_CLS = new Set(['footway', 'pedestrian', 'steps', 'cycleway', 'path', 'service', 'residential', 'unclassified', 'living_street']);

/**
 * Distinguishes true underground/underwater/named tunnels from short dry-land road underpasses (< 220m, e.g. avenues
 * dipping under railway tracks or highway overpasses in Sunnyvale). Connected tunnel ways are chained so land approach
 * pieces of cross-river or long tunnels stay part of the tunnel, while short land underpasses are restored to surface
 * roads so avenues stay continuous and bridge/rail clearance solvers see them.
 */
function normalizeChunkTunnels(roads, roadContext, isPointInWater) {
  const all = [];
  if (Array.isArray(roads)) for (let i = 0; i < roads.length; i++) if (roads[i] && roads[i][8]) all.push(roads[i]);
  if (Array.isArray(roadContext)) for (let i = 0; i < roadContext.length; i++) if (roadContext[i] && roadContext[i][8]) all.push(roadContext[i]);
  if (all.length === 0) return;

  const n = all.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const nodeMap = new Map();
  const wayLen = new Float64Array(n);
  const wayTrue = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const r = all[i];
    const [, cls, name, ref, , , , , , layer, flat] = r;
    if (!flat || flat.length < 6) continue;
    const pts = flat.length / 3;
    const k0 = `${Math.round(flat[0] / 3)},${Math.round(flat[2] / 3)}`;
    const k1 = `${Math.round(flat[(pts - 1) * 3] / 3)},${Math.round(flat[(pts - 1) * 3 + 2] / 3)}`;
    for (const k of [k0, k1]) {
      const prev = nodeMap.get(k);
      if (prev !== undefined) union(i, prev);
      else nodeMap.set(k, i);
    }
    let len = 0;
    let overWater = false;
    for (let j = 0; j < pts; j++) {
      const px = flat[j * 3], pz = flat[j * 3 + 2];
      if (!overWater && isPointInWater && isPointInWater(px, pz, 1.5)) overWater = true;
      if (j > 0) {
        const vx = flat[(j - 1) * 3], vz = flat[(j - 1) * 3 + 2];
        len += Math.hypot(px - vx, pz - vz);
        if (!overWater && isPointInWater && isPointInWater((px + vx) * 0.5, (pz + vz) * 0.5, 1.5)) overWater = true;
      }
    }
    wayLen[i] = len;
    const label = `${name || ''} ${ref || ''} ${r[12] || ''}`;
    if (overWater || (layer || 0) <= -2 || DEEP_TUNNEL_NAME_RE.test(label)) {
      wayTrue[i] = 1;
    }
  }

  const compLen = new Map();
  const compTrue = new Set();
  for (let i = 0; i < n; i++) {
    const rootId = find(i);
    const nextLen = (compLen.get(rootId) || 0) + wayLen[i];
    compLen.set(rootId, nextLen);
    if (wayTrue[i] || (nextLen >= 220.0 && !MINOR_TUNNEL_CLS.has(all[i][1]))) {
      compTrue.add(rootId);
    }
  }

  for (let i = 0; i < n; i++) {
    if (compTrue.has(find(i))) continue;
    const r = all[i];
    r[8] = 0;
    if ((r[9] || 0) < 0) r[9] = 0;
    const flat = r[10];
    if (flat) {
      for (let k = 1; k < flat.length; k += 3) flat[k] = 0.0;
    }
  }
}

function createSunkenTrenchChecker(roads) {
  const sunkenSegs = [];
  const mainSunkenSegs = [];
  const sunkenRampSegs = [];
  const crossBridgeSegs = [];
  const allBridgeSegs = [];
  const NON_VEH = new Set(['pedestrian', 'steps', 'service']);

  for (let rIdx = 0; rIdx < (roads || []).length; rIdx++) {
    const [wid, cls, , , , widthM, , isBridge, isTunnel, , flat] = roads[rIdx];
    if (!flat || flat.length < 6 || NON_VEH.has(cls) || isTunnel) continue;
    const hw = Math.max(2.0, (widthM || 8.0) * 0.5);
    const isLink = cls.endsWith('_link');
    const isMinor = cls === 'footway' || cls === 'cycleway' || cls === 'residential' || cls === 'unclassified' || cls === 'living_street';
    const nPts = flat.length / 3;
    let totalWayLen = 0;
    for (let i = 0; i < nPts - 1; i++) {
      totalWayLen += Math.hypot(flat[(i + 1) * 3] - flat[i * 3], flat[(i + 1) * 3 + 2] - flat[i * 3 + 2]);
    }
    const isHighPedOverpass = isBridge && (cls === 'footway' || cls === 'cycleway') && totalWayLen >= 38.0 && flat[1] >= 4.5;

    for (let i = 0; i < nPts - 1; i++) {
      const x1 = flat[i * 3], rawY1 = flat[i * 3 + 1], z1 = flat[i * 3 + 2];
      const x2 = flat[(i + 1) * 3], rawY2 = flat[(i + 1) * 3 + 1], z2 = flat[(i + 1) * 3 + 2];
      const y1 = isHighPedOverpass ? 5.5 : isMinor ? Math.max(-0.8, Math.min(0.85, rawY1 * 0.14)) : rawY1;
      const y2 = isHighPedOverpass ? 5.5 : isMinor ? Math.max(-0.8, Math.min(0.85, rawY2 * 0.14)) : rawY2;

      if (isBridge || y1 > 1.2 || y2 > 1.2) {
        const padB = hw + 1.5;
        allBridgeSegs.push({
          wid,
          cls,
          x1,
          z1,
          x2,
          z2,
          y1,
          y2,
          hw,
          minX: Math.min(x1, x2) - padB,
          maxX: Math.max(x1, x2) + padB,
          minZ: Math.min(z1, z2) - padB,
          maxZ: Math.max(z1, z2) + padB,
        });
      }

      if ((y1 < -0.45 || y2 < -0.45) && cls !== 'cycleway' && cls !== 'footway' && !isLink) {
        const pad = hw + 0.55;
        const segObj = {
          wid,
          isLink: false,
          x1,
          z1,
          x2,
          z2,
          y1,
          y2,
          rawHw: hw,
          hw: pad,
          minX: Math.min(x1, x2) - pad,
          maxX: Math.max(x1, x2) + pad,
          minZ: Math.min(z1, z2) - pad,
          maxZ: Math.max(z1, z2) + pad,
        };
        sunkenSegs.push(segObj);
        mainSunkenSegs.push(segObj);
      } else if (isBridge && Math.abs(y1) < 1.2 && Math.abs(y2) < 1.2) {
        // Extend ground-level cross-bridge segment by 18m at both abutments so its approach junctions suppress trench parapets
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz) || 1.0;
        const ex1 = x1 - (dx / len) * 18.0;
        const ez1 = z1 - (dz / len) * 18.0;
        const ex2 = x2 + (dx / len) * 18.0;
        const ez2 = z2 + (dz / len) * 18.0;
        const pad = hw + 4.5;
        crossBridgeSegs.push({
          wid,
          x1: ex1,
          z1: ez1,
          x2: ex2,
          z2: ez2,
          hw: pad,
          minX: Math.min(ex1, ex2) - pad,
          maxX: Math.max(ex1, ex2) + pad,
          minZ: Math.min(ez1, ez2) - pad,
          maxZ: Math.max(ez1, ez2) + pad,
        });
      }
    }
  }

  if (sunkenSegs.length === 0 && allBridgeSegs.length === 0) {
    return null;
  }

  const distSqToSeg = (px, pz, s) => {
    const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
    const len2 = vx * vx + vz * vz;
    if (len2 < 0.05) return (px - s.x1) ** 2 + (pz - s.z1) ** 2;
    const t = Math.max(0, Math.min(1, ((px - s.x1) * vx + (pz - s.z1) * vz) / len2));
    const dx = px - (s.x1 + vx * t);
    const dz = pz - (s.z1 + vz * t);
    return dx * dx + dz * dz;
  };

  const fn = (lx, lz) => {
    let nearFirstWid = null;
    for (let i = 0; i < sunkenSegs.length; i++) {
      const s = sunkenSegs[i];
      if (lx < s.minX - 10.5 || lx > s.maxX + 10.5 || lz < s.minZ - 10.5 || lz > s.maxZ + 10.5) continue;
      const d2 = distSqToSeg(lx, lz, s);
      if (d2 <= s.hw * s.hw) return true;
      const medHw = s.hw + 9.5;
      if (d2 <= medHw * medHw) {
        if (nearFirstWid === null) {
          nearFirstWid = s.wid;
        } else if (nearFirstWid !== s.wid) {
          return true; // Point lies in the central median between two parallel sunken carriageways
        }
      }
    }
    return false;
  };

  fn.intersectsBox = (bx0, bz0, bx1, bz1) => {
    for (let i = 0; i < sunkenSegs.length; i++) {
      const s = sunkenSegs[i];
      if (s.minX - 10.0 <= bx1 && s.maxX + 10.0 >= bx0 && s.minZ - 10.0 <= bz1 && s.maxZ + 10.0 >= bz0) {
        return true;
      }
    }
    return false;
  };

  fn.isUnderCrossBridge = (lx, lz) => {
    for (let i = 0; i < crossBridgeSegs.length; i++) {
      const s = crossBridgeSegs[i];
      if (lx < s.minX || lx > s.maxX || lz < s.minZ || lz > s.maxZ) continue;
      if (distSqToSeg(lx, lz, s) <= s.hw * s.hw) return true;
    }
    return false;
  };

  fn.hasParallelSunken = (lx, lz, selfWid) => {
    for (let i = 0; i < mainSunkenSegs.length; i++) {
      const s = mainSunkenSegs[i];
      if (s.wid === selfWid) continue;
      if (lx < s.minX - 12.0 || lx > s.maxX + 12.0 || lz < s.minZ - 12.0 || lz > s.maxZ + 12.0) continue;
      const maxD = s.hw + 11.5;
      if (distSqToSeg(lx, lz, s) <= maxD * maxD) return true;
    }
    return false;
  };

  fn.isInsideMainSunken = (lx, lz, selfWid, margin = 0.0) => {
    for (let i = 0; i < mainSunkenSegs.length; i++) {
      const s = mainSunkenSegs[i];
      if (s.wid === selfWid) continue;
      const maxD = s.rawHw + margin;
      if (lx < s.minX - 6.0 || lx > s.maxX + 6.0 || lz < s.minZ - 6.0 || lz > s.maxZ + 6.0) continue;
      if (distSqToSeg(lx, lz, s) <= maxD * maxD) return true;
    }
    return false;
  };

  fn.getNearestRampInfo = (lx, lz, selfWid) => {
    let bestD2 = Infinity;
    let bestY = 0.0;
    let bestHw = 2.9;
    for (let i = 0; i < sunkenRampSegs.length; i++) {
      const s = sunkenRampSegs[i];
      if (s.wid === selfWid) continue;
      if (lx < s.minX - 16.0 || lx > s.maxX + 16.0 || lz < s.minZ - 16.0 || lz > s.maxZ + 16.0) continue;
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const len2 = vx * vx + vz * vz;
      const t = len2 < 0.05 ? 0.0 : Math.max(0, Math.min(1, ((lx - s.x1) * vx + (lz - s.z1) * vz) / len2));
      const dx = lx - (s.x1 + vx * t);
      const dz = lz - (s.z1 + vz * t);
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2 && d2 <= 16.0 * 16.0) {
        bestD2 = d2;
        bestY = s.y1 + (s.y2 - s.y1) * t;
        bestHw = s.rawHw;
      }
    }
    return bestD2 < Infinity ? { dist: Math.sqrt(bestD2), rampY: bestY, rampHw: bestHw } : null;
  };

  fn.hasAdjacentBridge = (lx, lz, selfWid, refY = 0.0) => {
    for (let i = 0; i < allBridgeSegs.length; i++) {
      const s = allBridgeSegs[i];
      if (s.wid === selfWid) continue;
      const sMidY = (s.y1 + s.y2) * 0.5;
      if (Math.abs(sMidY - refY) > 2.4) continue;
      if (lx < s.minX - 10.0 || lx > s.maxX + 10.0 || lz < s.minZ - 10.0 || lz > s.maxZ + 10.0) continue;
      const maxD = s.hw + 8.5;
      if (distSqToSeg(lx, lz, s) <= maxD * maxD) return true;
    }
    return false;
  };

  fn.isEdgeInsideOtherElevated = (x1, z1, x2, z2, selfWid, refY = 0.0) => {
    const mx = (x1 + x2) * 0.5;
    const mz = (z1 + z2) * 0.5;
    for (let i = 0; i < allBridgeSegs.length; i++) {
      const s = allBridgeSegs[i];
      if (s.wid === selfWid) continue;
      const sMidY = (s.y1 + s.y2) * 0.5;
      if (Math.abs(sMidY - refY) > 2.8) continue;
      const maxD = s.hw + 1.35;
      const maxD2 = maxD * maxD;
      if (
        (mx >= s.minX && mx <= s.maxX && mz >= s.minZ && mz <= s.maxZ && distSqToSeg(mx, mz, s) <= maxD2) ||
        (x1 >= s.minX && x1 <= s.maxX && z1 >= s.minZ && z1 <= s.maxZ && distSqToSeg(x1, z1, s) <= maxD2) ||
        (x2 >= s.minX && x2 <= s.maxX && z2 >= s.minZ && z2 <= s.maxZ && distSqToSeg(x2, z2, s) <= maxD2)
      ) {
        return true;
      }
    }
    return false;
  };

  return fn;
}

/**
 * Recursively splits the longest edge of any 2D triangle whose edge length exceeds `maxEdge`
 * so large polygons (e.g. Kunming Lake or Summer Palace park) conform tightly to curved 3D DEM terrain
 * without long diagonal chords cutting through terrain or each other.
 */
export function subdivideTriangles2D(pts, tris, maxEdge = 34.0) {
  const out = [];
  const stack = [];
  for (let i = 0; i < tris.length; i++) {
    const [a, b, c] = tris[i];
    const pa = pts[a], pb = pts[b], pc = pts[c];
    stack.push([pa.x, pa.y, pb.x, pb.y, pc.x, pc.y]);
  }
  while (stack.length > 0) {
    const [ax, az, bx, bz, cx, cz] = stack.pop();
    const dab = Math.hypot(bx - ax, bz - az);
    const dbc = Math.hypot(cx - bx, cz - bz);
    const dca = Math.hypot(ax - cx, az - cz);
    const m = Math.max(dab, dbc, dca);
    if (m <= maxEdge) {
      out.push(ax, az, bx, bz, cx, cz);
      continue;
    }
    if (dab >= dbc && dab >= dca) {
      const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
      stack.push([ax, az, mx, mz, cx, cz], [mx, mz, bx, bz, cx, cz]);
    } else if (dbc >= dab && dbc >= dca) {
      const mx = (bx + cx) * 0.5, mz = (bz + cz) * 0.5;
      stack.push([ax, az, bx, bz, mx, mz], [ax, az, mx, mz, cx, cz]);
    } else {
      const mx = (cx + ax) * 0.5, mz = (cz + az) * 0.5;
      stack.push([ax, az, bx, bz, mx, mz], [mx, mz, bx, bz, cx, cz]);
    }
  }
  return out;
}

function buildParksAndWater(data, ox, oz, targetGroup, mats, isPointInWater, isPointInSunkenTrench = null) {
  const parkPos = [];
  const parkCol = [];

  for (let pIdx = 0; pIdx < (data.parks || []).length; pIdx++) {
    const p = data.parks[pIdx];
    const [osmId, , ptype, flat] = p;
    if (!flat || flat.length < 6) continue;
    const contour = [];
    for (let i = 0; i < flat.length; i += 2) {
      contour.push(new THREE.Vector2(flat[i], flat[i + 1]));
    }
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const subTris = subdivideTriangles2D(contour, tris, isPointInSunkenTrench ? 22.0 : 36.0);
    let rgb = [0.27, 0.46, 0.25];
    let yOff = 0.08 + ((osmId || pIdx) % 23) * 0.003;
    if (ptype === 'stadium' || ptype === 'pitch') {
      rgb = [0.22, 0.54, 0.30];
      yOff = 0.11 + ((osmId || pIdx) % 13) * 0.003;
    } else if (ptype === 'square' || ptype === 'plaza' || ptype === 'pedestrian') {
      rgb = [0.54, 0.52, 0.49];
      yOff = 0.12 + ((osmId || pIdx) % 13) * 0.003;
    }
    for (let i = 0; i < subTris.length; i += 6) {
      const ax = subTris[i], az = subTris[i + 1];
      const bx = subTris[i + 2], bz = subTris[i + 3];
      const cx = subTris[i + 4], cz = subTris[i + 5];
      const mx = (ax + bx + cx) / 3.0;
      const mz = (az + bz + cz) / 3.0;
      // Cut out park sub-triangles whose centroid, vertices, or edge midpoints lie inside a lake/river or a sunken road trench
      if (isPointInWater && isPointInWater(mx, mz, 0)) {
        continue;
      }
      if (
        isPointInSunkenTrench &&
        (isPointInSunkenTrench(mx, mz) ||
          isPointInSunkenTrench(ax, az) ||
          isPointInSunkenTrench(bx, bz) ||
          isPointInSunkenTrench(cx, cz) ||
          isPointInSunkenTrench((ax + bx) * 0.5, (az + bz) * 0.5) ||
          isPointInSunkenTrench((bx + cx) * 0.5, (bz + cz) * 0.5) ||
          isPointInSunkenTrench((cx + ax) * 0.5, (cz + az) * 0.5))
      ) {
        continue;
      }
      const ya = getBeijingTerrainElevation(ox + ax, oz + az) + yOff;
      const yb = getBeijingTerrainElevation(ox + bx, oz + bz) + yOff;
      const yc = getBeijingTerrainElevation(ox + cx, oz + cz) + yOff;
      parkPos.push(ax, ya, az, cx, yc, cz, bx, yb, bz);
      // alpine grass above the snowline gets the terrain's snow (steep faces stay bare)
      let triRgb = rgb;
      const ux = bx - ax, uy = yb - ya, uz = bz - az, vx = cx - ax, vy = yc - ya, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const snow = snowCover((ya + yb + yc) / 3, Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny)));
      if (snow > 0) triRgb = [rgb[0] + (0.93 - rgb[0]) * snow, rgb[1] + (0.95 - rgb[1]) * snow, rgb[2] + (0.98 - rgb[2]) * snow];
      parkCol.push(...triRgb, ...triRgb, ...triRgb);
    }
  }
  if (parkPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(parkPos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(parkCol), 3, true));
    finalizeAndReleaseGeometry(geom, true);
    const mesh = new THREE.Mesh(geom, mats.parkMat);
    mesh.receiveShadow = true;
    targetGroup.add(mesh);
  }

  // Water polygons & river ribbons (subdivided to follow 3D DEM terrain + pure vertical (0,1,0) normals)
  const waterPos = [];
  const waterNorm = [];
  const waterUv = []; // feature/atmosphere: shore distance for the water shader
  const chunkHoleRings = [...(data.island_holes || [])];
  for (const wp of data.water_polys || []) {
    for (const fh of wp[3] || []) {
      if (fh && fh.length >= 6) chunkHoleRings.push(fh);
    }
  }
  const inAnyIslandHole = (lx, lz) => {
    for (let h = 0; h < chunkHoleRings.length; h++) {
      if (pointInRing2D(lx, lz, chunkHoleRings[h])) return true;
    }
    return false;
  };

  const SEA_DRAPE_MAX_M = 3.0; // [terrain-roads]
  const seaWaterY = (t) => (t > 1.6 ? t : Math.min(0.42, t)); // sea level, or draped over low marsh/salt-pond ground
  for (let wIdx = 0; wIdx < (data.water_polys || []).length; wIdx++) {
    const wp = data.water_polys[wIdx];
    const [osmId, , flatOuter, flatHoles] = wp;
    if (!flatOuter || flatOuter.length < 6) continue;

    // Render each multi-chunk water polygon only once in its unique bbox-center owner chunk
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let minPolyTerr = Infinity;
    const contour = [];
    for (let i = 0; i < flatOuter.length; i += 2) {
      const x = flatOuter[i], z = flatOuter[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      const tElev = getBeijingTerrainElevation(ox + x, oz + z);
      if (tElev < minPolyTerr) minPolyTerr = tElev;
      contour.push(new THREE.Vector2(x, z));
    }
    const wcx = (minX + maxX) * 0.5;
    const wcz = (minZ + maxZ) * 0.5;
    if (wcx < -505.0 || wcx > 505.0 || wcz < -505.0 || wcz > 505.0) {
      continue;
    }

    const holes = [];
    for (const fh of flatHoles || []) {
      if (fh.length >= 6) {
        const hpts = [];
        for (let i = 0; i < fh.length; i += 2) {
          hpts.push(new THREE.Vector2(fh[i], fh[i + 1]));
        }
        holes.push(hpts);
      }
    }
    const allPts = [...contour];
    for (const h of holes) allPts.push(...h);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const subTris = subdivideTriangles2D(allPts, tris, chunkHoleRings.length > 0 ? 18.0 : 32.0);
    const isSeaLevelPoly = minPolyTerr <= 1.2;
    const keptSubTris = [];
    for (let i = 0; i < subTris.length; i += 6) {
      const ax = subTris[i], az = subTris[i + 1];
      const bx = subTris[i + 2], bz = subTris[i + 3];
      const cx = subTris[i + 4], cz = subTris[i + 5];
      const mx = (ax + bx + cx) / 3.0;
      const mz = (az + bz + cz) / 3.0;
      if (chunkHoleRings.length > 0) {
        if (inAnyIslandHole(mx, mz)) continue;
        const hCount = (inAnyIslandHole(ax, az) ? 1 : 0) + (inAnyIslandHole(bx, bz) ? 1 : 0) + (inAnyIslandHole(cx, cz) ? 1 : 0);
        if (hCount >= 2) continue;
      }
      // [terrain-roads] Low diked salt ponds / tidal marsh (DEM ~1.6-3 m, e.g. Palo Alto Baylands) are still OSM ocean:
      // keep them (draped below) instead of leaving bare light-grey ground. Only clearly raised land is culled.
      if (isSeaLevelPoly && getBeijingTerrainElevation(ox + mx, oz + mz) > SEA_DRAPE_MAX_M) {
        continue;
      }
      keptSubTris.push(ax, az, bx, bz, cx, cz);
    }
    if (keptSubTris.length === 0) continue;

    const wyOff = 0.28 + ((osmId || wIdx) % 19) * 0.002;
    for (let i = 0; i < keptSubTris.length; i += 6) {
      const ax = keptSubTris[i], az = keptSubTris[i + 1];
      const bx = keptSubTris[i + 2], bz = keptSubTris[i + 3];
      const cx = keptSubTris[i + 4], cz = keptSubTris[i + 5];
      const ta = getBeijingTerrainElevation(ox + ax, oz + az);
      const tb = getBeijingTerrainElevation(ox + bx, oz + bz);
      const tc = getBeijingTerrainElevation(ox + cx, oz + cz);
      const ya = (isSeaLevelPoly ? seaWaterY(ta) : ta) + wyOff;
      const yb = (isSeaLevelPoly ? seaWaterY(tb) : tb) + wyOff;
      const yc = (isSeaLevelPoly ? seaWaterY(tc) : tc) + yOffWater(wyOff);
      waterPos.push(ax, ya, az, cx, yc, cz, bx, yb, bz);
      waterNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    appendPolyShoreUv(waterUv, keptSubTris, flatOuter, chunkHoleRings.length > 0 ? chunkHoleRings : flatHoles); // feature/atmosphere
  }

  // [terrain-roads] waterway lines: draped mitered ribbons with downstream flow (features/waterways.js)
  const waterwayMesh = buildWaterwayMesh(data.water_lines, ox, oz, getBeijingTerrainElevation, mats);
  if (waterwayMesh) targetGroup.add(waterwayMesh);

  if (waterPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(waterNorm, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(waterUv, 2)); // feature/atmosphere
    finalizeAndReleaseGeometry(geom, false);
    const mesh = new THREE.Mesh(geom, mats.waterMat);
    mesh.receiveShadow = true;
    targetGroup.add(mesh);
  }
}

function yOffWater(wy) {
  return wy;
}

export const ROAD_CLASS_ZH = {
  motorway: '高速公路',
  motorway_link: '高速互通立交匝道',
  trunk: '城市快速路/环路',
  trunk_link: '快速路/环路立交匝道',
  primary: '城市主干道',
  primary_link: '主干道立交匝道',
  secondary: '城市次干道',
  secondary_link: '次干道连接匝道',
  tertiary: '城市支路',
  tertiary_link: '支路连接线',
  residential: '居住区街巷',
  living_street: '慢行生活街巷',
  service: '内部通道/辅路',
  unclassified: '城市街巷',
  pedestrian: '步行街/广场步道',
  footway: '人行步道',
  cycleway: '非机动车道',
  steps: '过街天桥/台阶步道',
};

export const BUILDING_TYPE_ZH = {
  apartments: '住宅公寓楼',
  residential: '居民住宅楼',
  house: '独立院落住宅',
  detached: '独立住宅',
  semidetached_house: '联排住宅',
  terrace: '联排民居',
  dormitory: '学生/职工宿舍楼',
  bungalow: '低层平房民居',
  commercial: '商业综合体/商厦',
  office: '商务写字楼',
  retail: '临街商业裙房',
  supermarket: '商业超市卖场',
  hotel: '酒店宾馆大厦',
  school: '中小学教学楼',
  kindergarten: '幼儿园教学楼',
  university: '高校教学/科研楼',
  college: '院校教学楼',
  hospital: '医院医疗大楼',
  public: '公共服务建筑',
  civic: '市政公共建筑',
  government: '政务办公楼',
  train_station: '铁路/地铁车站站房',
  transportation: '交通枢纽站房',
  industrial: '工业园区厂房',
  warehouse: '物流仓储用房',
  manufacture: '生产制造厂房',
  service: '市政配套设备用房',
  garages: '停车库建筑',
  parking: '立体停车楼',
  roof: '开放式廊架/顶棚',
  wall: '古建城墙/院墙',
  temple: '古建寺庙殿宇',
  church: '教堂建筑',
  mosque: '清真寺建筑',
  cathedral: '天主教堂',
  shrine: '祠堂/殿宇',
  stadium: '大型体育场馆',
  grandstand: '体育场看台',
  sports_centre: '体育中心场馆',
  greenhouse: '生态农业温室',
  hangar: '航空机库',
  construction: '在建工程楼宇',
  ruins: '历史遗址建筑',
};

export const BUILDING_STYLE_ZH = {
  glass: '现代玻璃幕墙 (glass)',
  modern: '现代石材/面砖立面 (modern)',
  imperial: '皇家官式红墙琉璃瓦 (imperial)',
  hutong: '老北京青砖四合院 (hutong)',
};

function buildRoadsAndBridges(
  roads,
  ox,
  oz,
  roadGroup,
  markingGroup,
  bridgeGroup,
  mats,
  roadSegments,
  isPointInWater,
  isPointInSunkenTrench = null,
  entityTable = [],
  worldOrigin = null,
  railways = [],
  roadContext = []
) {
  const rPos = [];
  const rCol = [];
  // [street-props] road-surface coords for surfaces.js: u = metres along the way; v = 1000 * half-width(0.25 m steps)
  // + metres from the right edge on carriageways, -(1 + metres from the kerb) on sidewalks / paved footways, 0 = none
  const rUv = [];

  const mPos = [];
  const mCol = [];

  const bPos = []; // Bridge concrete parapets, deck soffits & piers
  const bColPos = []; // Colored structural steel (e.g. Golden Gate Bridge International Orange #c0362c towers, cables & trusses)
  const bColClr = [];
  const ggbDoneBins = new Set();
  const ggbDoneTowers = new Set();
  // [lm-west] bridge ways on a hand-built landmark deck (e.g. the Golden Gate model) get no generic piers / towers / cables
  const lmDeckTest = makeLandmarkDeckTest(worldOrigin);
  const pushColQuad = (x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, rgb) => {
    pushQuad(bColPos, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4);
    for (let k = 0; k < 6; k++) bColClr.push(rgb[0], rgb[1], rgb[2]);
  };
  const pushCableBeam = (ax, ay, az, bx, by, bz, rad, rgb) => {
    const dx = bx - ax, dz = bz - az;
    const hl = Math.hypot(dx, dz) || 1;
    const nx = (-dz / hl) * rad, nz = (dx / hl) * rad;
    // Top, bottom, left, right faces of cable tube
    pushColQuad(ax - nx, ay + rad, az - nz, ax + nx, ay + rad, az + nz, bx + nx, by + rad, bz + nz, bx - nx, by + rad, bz - nz, rgb);
    pushColQuad(ax + nx, ay - rad, az + nz, ax - nx, ay - rad, az - nz, bx - nx, by - rad, bz - nz, bx + nx, by - rad, bz + nz, rgb);
    pushColQuad(ax - nx, ay - rad, az - nz, ax - nx, ay + rad, az - nz, bx - nx, by + rad, bz - nz, bx - nx, by - rad, bz - nz, rgb);
    pushColQuad(ax + nx, ay + rad, az + nz, ax + nx, ay - rad, az + nz, bx + nx, by - rad, bz + nz, bx + nx, by + rad, bz + nz, rgb);
  };
  // fix/bridge-continuity: one continuous height field for bridges + approach ramps (deterministic from world coords)
  let liftProfiles = [];
  try {
    // context ways (just outside the chunk) only shape the height field; their own profiles are dropped
    liftProfiles = computeRoadLiftProfiles(
      roadContext.length ? roads.concat(roadContext) : roads, railways, ox, oz, getBeijingTerrainElevation, worldOrigin,
      seamHeightStore(worldOrigin) // [elevated-roads] heights published at chunk borders by already-built neighbours
    );
  } catch (err) {
    console.warn('computeRoadLiftProfiles failed', err);
  }
  // [release-6-integ] same ways + lifted heights for rail_build crossings (removed again after buildRailTrack)
  roadSegments.liftWays = { ways: roadContext.length ? roads.concat(roadContext) : roads, prof: liftProfiles };

  // Pre-collect named roads in this chunk so unnamed ramps/service ways can inherit nearby road names
  const namedChunkRoads = [];
  for (let i = 0; i < roads.length; i++) {
    const [, rCls, rName, rRef, , , , , rTunnel, , rFlat] = roads[i];
    if (rTunnel) continue;
    const baseName = rName || rRef;
    if (baseName && rFlat && rFlat.length >= 6) {
      const midIdx = Math.floor(rFlat.length / 6) * 3;
      namedChunkRoads.push({
        name: baseName,
        nameZh: (rName && roads[i][12]) || baseName, // [road-names-zh]
        cls: rCls,
        mx: rFlat[midIdx],
        mz: rFlat[midIdx + 2],
      });
    }
  }

  // [terrain-roads] Street sidewalks must not bury a parallel bike path running along the kerb (e.g. the Panhandle):
  // index cycleway segments so the sidewalk strip on that side can be skipped.
  const cycGrid = new Map();
  const CYC_CELL = 16;
  for (let i = 0; i < roads.length; i++) {
    const [, cCls, , , , cW, , cBridge, cTunnel, , cFlat] = roads[i];
    if (cCls !== 'cycleway' || cBridge || cTunnel || !cFlat || cFlat.length < 6) continue;
    const hw = Math.max(1.0, cW * 0.5);
    for (let k = 0; k + 5 < cFlat.length; k += 3) {
      const seg = [cFlat[k], cFlat[k + 2], cFlat[k + 3], cFlat[k + 5], hw];
      const gx0 = Math.floor((Math.min(seg[0], seg[2]) - 4) / CYC_CELL), gx1 = Math.floor((Math.max(seg[0], seg[2]) + 4) / CYC_CELL);
      const gz0 = Math.floor((Math.min(seg[1], seg[3]) - 4) / CYC_CELL), gz1 = Math.floor((Math.max(seg[1], seg[3]) + 4) / CYC_CELL);
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const key = gx * 4099 + gz;
        let list = cycGrid.get(key);
        if (!list) cycGrid.set(key, (list = []));
        list.push(seg);
      }
    }
  }
  const sidewalkOverCycleway = (px, pz, dx, dz, swHalf) => {
    if (cycGrid.size === 0) return false;
    const list = cycGrid.get(Math.floor(px / CYC_CELL) * 4099 + Math.floor(pz / CYC_CELL));
    if (!list) return false;
    for (const [ax, az, bx, bz, hw] of list) {
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
      if (l2 < 1e-6) continue;
      if (Math.abs(ex * dx + ez * dz) / Math.sqrt(l2) < 0.85) continue; // only parallel paths
      const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2));
      if (Math.hypot(ax + ex * t - px, az + ez * t - pz) < hw + swHalf) return true;
    }
    return false;
  };

  // Emit 3D concrete Tunnel Entrance Portals where a surface road transitions into an underground/underwater tunnel on land
  const nonTunnelEndNodes = new Set();
  for (let i = 0; i < roads.length; i++) {
    const [, rCls, , , , , , rBridge, rTunnel, , rFlat] = roads[i];
    if (rTunnel || rBridge || !rFlat || rFlat.length < 6) continue;
    if (MINOR_TUNNEL_CLS.has(rCls)) continue;
    const n = rFlat.length / 3;
    nonTunnelEndNodes.add(`${Math.round(rFlat[0] / 2)},${Math.round(rFlat[2] / 2)}`);
    nonTunnelEndNodes.add(`${Math.round(rFlat[(n - 1) * 3] / 2)},${Math.round(rFlat[(n - 1) * 3 + 2] / 2)}`);
  }
  const placedTunnelPortals = [];
  for (let i = 0; i < roads.length; i++) {
    const [, rCls, , , , rWidthM, , , rTunnel, , rFlat] = roads[i];
    if (!rTunnel || !rFlat || rFlat.length < 6) continue;
    if (MINOR_TUNNEL_CLS.has(rCls)) continue;
    const n = rFlat.length / 3;
    const ends = [
      [rFlat[0], rFlat[2], rFlat[3] - rFlat[0], rFlat[5] - rFlat[2]],
      [rFlat[(n - 1) * 3], rFlat[(n - 1) * 3 + 2], rFlat[(n - 2) * 3] - rFlat[(n - 1) * 3], rFlat[(n - 2) * 3 + 2] - rFlat[(n - 1) * 3 + 2]],
    ];
    for (const [px, pz, tdx, tdz] of ends) {
      if (Math.abs(px) > 495 || Math.abs(pz) > 495) continue;
      const key = `${Math.round(px / 2)},${Math.round(pz / 2)}`;
      if (!nonTunnelEndNodes.has(key)) continue;
      if (isPointInWater && isPointInWater(px, pz, 3.0)) continue;
      if (placedTunnelPortals.some((p) => Math.hypot(p[0] - px, p[1] - pz) < 14.0)) continue;
      placedTunnelPortals.push([px, pz]);
      const tl = Math.hypot(tdx, tdz) || 1;
      const tx = tdx / tl, tz = tdz / tl; // points into the tunnel
      const nx = -tz, nz = tx;
      const hw = Math.max(4.5, Math.min(11.0, (rWidthM || 9.0) * 0.55));
      const terrY = Math.max(getBeijingTerrainElevation(ox + px, oz + pz), getChunkTerrainMeshElevation(ox + px, oz + pz) + 0.35);
      const pH = 5.4, pierW = 1.35, lintelH = 1.45, portalD = 4.2;
      // Left & right concrete portal piers + wing walls
      for (const s of [-1, 1]) {
        const bx = px + nx * s * (hw + pierW * 0.5) + tx * (portalD * 0.35);
        const bz = pz + nz * s * (hw + pierW * 0.5) + tz * (portalD * 0.35);
        pushOrientedBox(bPos, bx, terrY - 0.4, bz, tx, tz, portalD * 0.72, pierW, pH + 0.4);
      }
      // Overhead concrete portal lintel beam spanning across the carriageway
      const lx0 = px - nx * (hw + pierW), lz0 = pz - nz * (hw + pierW);
      const rx0 = px + nx * (hw + pierW), rz0 = pz + nz * (hw + pierW);
      const lx1 = lx0 + tx * portalD, lz1 = lz0 + tz * portalD;
      const rx1 = rx0 + tx * portalD, rz1 = rz0 + tz * portalD;
      const yBot = terrY + pH - lintelH, yTop = terrY + pH + 0.35;
      pushQuad(bPos, lx0, yTop, lz0, rx0, yTop, rz0, rx1, yTop, rz1, lx1, yTop, lz1);
      pushQuad(bPos, lx0, yBot, lz0, rx0, yBot, rz0, rx0, yTop, rz0, lx0, yTop, lz0);
      pushQuad(bPos, rx1, yBot, rz1, lx1, yBot, lz1, lx1, yTop, lz1, rx1, yTop, rz1);
      // Dark shadowed tunnel bore opening quad inside the portal frame
      const mx0 = px - nx * hw + tx * 0.8, mz0 = pz - nz * hw + tz * 0.8;
      const mx1 = px + nx * hw + tx * 0.8, mz1 = pz + nz * hw + tz * 0.8;
      pushColQuad(mx0, terrY + 0.05, mz0, mx1, terrY + 0.05, mz1, mx1, yBot, mz1, mx0, yBot, mz0, [0.04, 0.045, 0.055]);
    }
  }

  for (let rIdx = 0; rIdx < roads.length; rIdx++) {
    const r = roads[rIdx];
    const [wid, cls, name, ref, lanes, widthM, oneway, isBridge, isTunnel, layer, flat] = r;
    if (!flat || flat.length < 6 || isTunnel) continue;

    let resolvedRoadName = name || ref;
    let resolvedRoadNameZh = (name && r[12]) || ''; // [road-names-zh] only when it differs from the EN-first name
    if (!resolvedRoadName) {
      const midIdx = Math.floor(flat.length / 6) * 3;
      const mx = flat[midIdx];
      const mz = flat[midIdx + 2];
      let nearestName = '';
      let nearestZh = '';
      let bestDist = 140.0;
      for (let k = 0; k < namedChunkRoads.length; k++) {
        const nr = namedChunkRoads[k];
        const d = Math.hypot(mx - nr.mx, mz - nr.mz);
        if (d < bestDist) {
          bestDist = d;
          nearestName = nr.name;
          nearestZh = nr.nameZh;
        }
      }
      const clsZh = ROAD_CLASS_ZH[cls] || '城市道路';
      if (nearestName) {
        if (cls.endsWith('_link')) {
          resolvedRoadName = `${nearestName}立交匝道`;
        } else if (cls === 'service') {
          resolvedRoadName = `${nearestName}辅路/内部通道`;
        } else {
          resolvedRoadName = `${nearestName}旁 · ${clsZh}`;
        }
        if (nearestZh && nearestZh !== nearestName) resolvedRoadNameZh = nearestZh + resolvedRoadName.slice(nearestName.length);
      } else {
        resolvedRoadName = `${clsZh}${isBridge ? ' (高架桥)' : isTunnel ? ' (隧道)' : ''}`;
      }
    }

    const entityIdx = entityTable.length;
    entityTable.push({
      kind: 'road',
      id: wid,
      name: resolvedRoadName,
      rawName: name || ref || '',
      ref,
      cls,
      clsZh: ROAD_CLASS_ZH[cls] || cls,
      lanes,
      width: widthM,
      oneway: Boolean(oneway),
      bridge: Boolean(isBridge),
      tunnel: Boolean(isTunnel),
      layer,
      flat,
      ox,
      oz,
    });

    const halfW = Math.max(1.0, widthM * 0.5);
    // Deterministic prime-hash per-way offset (using ONLY wid, never chunk-local rIdx, so multi-chunk roads have identical yBias across chunks)
    // fix/bridge-continuity: hash way attributes, not the per-chunk sequential id, so the same street (and its
    // overlapping vector-tile pieces) gets the same micro-bias in every chunk (no 0-14 cm steps at chunk seams)
    let wayHash = 2166136261;
    {
      const hs = `${cls}|${name || ''}|${ref || ''}|${layer || 0}|${isBridge ? 1 : 0}`;
      for (let k = 0; k < hs.length; k++) wayHash = Math.imul(wayHash ^ hs.charCodeAt(k), 16777619);
      wayHash >>>= 0;
    }
    const wayMicroBias = ((wayHash % 997) / 997.0) * 0.14;
    const yBias = (ROAD_Y_BIAS[cls] || 0.43) + wayMicroBias;
    const baseRgb = r[11] ? UNPAVED_TRAIL_RGB : ROAD_COLORS[cls] || [0.30, 0.32, 0.36]; // [terrain-roads]
    const nPts = flat.length / 3;
    const leftPts = [];
    const rightPts = [];
    const centerPts = [];

    const isMinorWay =
      cls === 'footway' ||
      cls === 'pedestrian' ||
      cls === 'cycleway' ||
      cls === 'steps' ||
      cls === 'residential' ||
      cls === 'service' ||
      cls === 'unclassified' ||
      cls === 'living_street';

    let totalWayLen = 0;
    let maxWayY = -Infinity;
    for (let i = 0; i < nPts - 1; i++) {
      totalWayLen += Math.hypot(flat[(i + 1) * 3] - flat[i * 3], flat[(i + 1) * 3 + 2] - flat[i * 3 + 2]);
      if (flat[i * 3 + 1] > maxWayY) maxWayY = flat[i * 3 + 1];
    }
    if (nPts > 0 && flat[(nPts - 1) * 3 + 1] > maxWayY) {
      maxWayY = flat[(nPts - 1) * 3 + 1];
    }
    const midIdx = Math.floor(nPts * 0.5) * 3;
    const isOverWater = Boolean(
      isPointInWater &&
        nPts > 0 &&
        (isPointInWater(flat[0], flat[2], 0) ||
          isPointInWater(flat[midIdx], flat[midIdx + 2], 0) ||
          isPointInWater(flat[(nPts - 1) * 3], flat[(nPts - 1) * 3 + 2], 0))
    );
    const isScenicArchBridge =
      Boolean(
        isBridge &&
          isOverWater &&
          (cls === 'footway' || cls === 'pedestrian' || cls === 'service' || cls === 'path') &&
          ((name || '').includes('桥') || maxWayY <= 2.2)
      );
    const isHighPedOverpass =
      isBridge &&
      (cls === 'footway' || cls === 'cycleway' || cls === 'pedestrian' || cls === 'steps' || cls === 'path') &&
      !isScenicArchBridge;

    const rgb = isScenicArchBridge
      ? [0.92, 0.91, 0.88]
      : isBridge
        ? [baseRgb[0] + 0.06, baseRgb[1] + 0.06, baseRgb[2] + 0.07]
        : isTunnel
          ? [baseRgb[0] * 0.65, baseRgb[1] * 0.65, baseRgb[2] * 0.7]
          : baseRgb;

    const rawYs = new Float32Array(nPts);
    let minRawY = Infinity;
    let touchesMainSunken = false;
    for (let i = 0; i < nPts; i++) {
      const rY = flat[i * 3 + 1];
      if (rY < minRawY) minRawY = rY;
      if (
        cls.endsWith('_link') &&
        !isBridge &&
        isPointInSunkenTrench &&
        isPointInSunkenTrench.isInsideMainSunken(flat[i * 3], flat[i * 3 + 2], wid, 10.5)
      ) {
        touchesMainSunken = true;
      }
      // fix/bridge-continuity: bridge decks get their height from liftProfiles (ground-relative raw 0 here)
      rawYs[i] = (isBridge || (layer || 0) >= 1)
        ? 0.0
        : isMinorWay
            ? Math.max(-0.8, Math.min(0.2, rY * 0.14))
            : Math.min(0.2, rY);
    }
    const isGoldenGateBridge = Boolean(
      isBridge && isGoldenGateBridgeWay(name || resolvedRoadName, ox + flat[midIdx], oz + flat[midIdx + 2], worldOrigin)
    );
    let onLandmarkDeck = false; // [lm-west] any vertex of this bridge way on a landmark model's deck
    if (isBridge && lmDeckTest) {
      for (let i = 0; i < nPts && !onLandmarkDeck; i++) onLandmarkDeck = lmDeckTest(ox + flat[i * 3], oz + flat[i * 3 + 2]);
    }
    // fix/bridge-continuity: deck heights (water crossings, Golden Gate / Bay Bridge profiles, overpass clearance,
    // approach ramps) all come from computeRoadLiftProfiles, shared by every way that touches the bridge.
    const wayLift = liftProfiles[rIdx] || null;
    // Skip rendering 3D mesh for 1D topological _link connectors that dive directly into a sunken open-trench highway
    // (where the sunken highway and ground auxiliary road already touch at the trench retaining wall).
    if (cls.endsWith('_link') && !isBridge && minRawY < -1.0 && touchesMainSunken) {
      continue;
    }

    for (let i = 0; i < nPts; i++) {
      const x = flat[i * 3];
      const rawRoadY = rawYs[i];
      const z = flat[i * 3 + 2];
      const terrainY = Math.max(
        getBeijingTerrainElevation(ox + x, oz + z),
        getChunkTerrainMeshElevation(ox + x, oz + z) + 0.35
      );
      const liftY = wayLift ? wayLift[i] : NaN;
      const y = Number.isNaN(liftY) ? terrainY + rawRoadY + yBias : Math.max(terrainY + rawRoadY, liftY) + yBias;
      centerPts.push([x, y, z, rawRoadY, terrainY, liftY]);

      let tx = 0, tz = 0;
      if (i < nPts - 1) {
        const dx = flat[(i + 1) * 3] - x;
        const dz = flat[(i + 1) * 3 + 2] - z;
        const l = Math.hypot(dx, dz) || 1;
        tx += dx / l;
        tz += dz / l;
      }
      if (i > 0) {
        const dx = x - flat[(i - 1) * 3];
        const dz = z - flat[(i - 1) * 3 + 2];
        const l = Math.hypot(dx, dz) || 1;
        tx += dx / l;
        tz += dz / l;
      }
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz * halfW;
      const nz = tx * halfW;
      leftPts.push([x + nx, y, z + nz]);
      rightPts.push([x - nx, y, z - nz]);
    }

    // [elevated-roads] a deck that stops in mid-air (OSM way ends at height, joining nothing) stands on an end
    // support: a full-width pier wall under road decks, a column pair under foot decks
    const endMask = !isTunnel && liftProfiles.deckEnds ? liftProfiles.deckEnds.get(rIdx) || 0 : 0;
    for (const [bit, i, j] of [[1, 0, 1], [2, nPts - 1, nPts - 2]]) {
      if (!(endMask & bit) || nPts < 2) continue;
      const [ex, ey, ez, , eTerr] = centerPts[i];
      if (ex < -500 || ex >= 500 || ez < -500 || ez >= 500) continue;
      const footDeck = isHighPedOverpass || (!isBridge && (cls === 'footway' || cls === 'cycleway' || cls === 'pedestrian' || cls === 'steps' || cls === 'path'));
      const under = ey - yBias - (isHighPedOverpass ? 0.5 : 0.85) - eTerr;
      if (under < 1.2) continue;
      let ux = centerPts[j][0] - ex, uz = centerPts[j][2] - ez;
      const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const px = ex + ux * 0.9, pz = ez + uz * 0.9; // just inside the deck end
      (roadSegments.deckEndCaps || (roadSegments.deckEndCaps = [])).push(ox + ex, oz + ez);
      if (!isBridge && ey - yBias - eTerr <= VIADUCT_H) {
        pushOrientedBox(bPos, ex, eTerr - 0.3, ez, -uz, ux, widthM, 0.3, ey - yBias - eTerr + 0.28); // closes the embankment
      } else if (footDeck) {
        for (const sd of [-1, 1]) pushBox(bPos, px - uz * sd * (halfW - 0.4), eTerr - 0.3, pz + ux * sd * (halfW - 0.4), 0.5, under + 0.3, 0.5);
      } else {
        pushOrientedBox(bPos, px, eTerr - 0.3, pz, -uz, ux, widthM, 1.4, under + 0.3);
      }
    }

    let accumDist = 0;
    for (let i = 0; i < nPts - 1; i++) {
      const [origLx1, origLy1, origLz1] = leftPts[i];
      const [origRx1, origRy1, origRz1] = rightPts[i];
      const [origLx2, origLy2, origLz2] = leftPts[i + 1];
      const [origRx2, origRy2, origRz2] = rightPts[i + 1];
      const [origCx1, origCy1, origCz1, origRawY1, origTerrY1, origLift1] = centerPts[i];
      const [origCx2, origCy2, origCz2, origRawY2, origTerrY2, origLift2] = centerPts[i + 1];
      // fix/bridge-continuity: absolute lifted height along the segment (NaN ends follow their natural ground height)
      const hasLift = !Number.isNaN(origLift1) || !Number.isNaN(origLift2);
      const liftA = Number.isNaN(origLift1) ? origTerrY1 + origRawY1 : origLift1;
      const liftB = Number.isNaN(origLift2) ? origTerrY2 + origRawY2 : origLift2;
      const liftAt = (u) => (hasLift ? liftA + (liftB - liftA) * u : -Infinity);

      const fullSegLen = Math.hypot(origCx2 - origCx1, origCz2 - origCz1);
      if (fullSegLen < 0.1) continue;

      // Clip segment (origCx1, origCz1) -> (origCx2, origCz2) to chunk bounds [-500.0, 500.0] x [-500.0, 500.0]
      // so multi-chunk roads are rendered exactly once per chunk without cross-chunk overlap or Z-fighting.
      let ct0 = 0.0, ct1 = 1.0;
      const cdx = origCx2 - origCx1;
      const cdz = origCz2 - origCz1;
      const clipEdge = (p, q) => {
        if (Math.abs(p) < 1e-8) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > ct1) return false;
          if (r > ct0) ct0 = r;
        } else {
          if (r < ct0) return false;
          if (r < ct1) ct1 = r;
        }
        return true;
      };
      if (
        !clipEdge(-cdx, origCx1 - -500.0) ||
        !clipEdge(cdx, 500.0 - origCx1) ||
        !clipEdge(-cdz, origCz1 - -500.0) ||
        !clipEdge(cdz, 500.0 - origCz1) ||
        ct1 <= ct0 + 1e-5
      ) {
        accumDist += fullSegLen;
        continue;
      }

      // Subdivide all roads into <= 8m sub-segments (<= 5.5m for bridges/trenches) so roads follow hilly terrain meshes without dipping under
      const clippedLen = fullSegLen * (ct1 - ct0);
      const needsFineSub = isBridge || origRawY1 < -0.45 || origRawY2 < -0.45;
      const stepTarget = needsFineSub ? 5.5 : 8.5;
      const subSteps = clippedLen > stepTarget ? Math.min(64, Math.ceil(clippedLen / stepTarget)) : 1;

      const sampleGroundTerr = (cx, cz, lx, lz, rx, rz) =>
        Math.max(
          getBeijingTerrainElevation(ox + cx, oz + cz),
          getChunkTerrainMeshElevation(ox + cx, oz + cz) + 0.35,
          getChunkTerrainMeshElevation(ox + lx, oz + lz) + 0.35,
          getChunkTerrainMeshElevation(ox + rx, oz + rz) + 0.35
        );

      for (let sStep = 0; sStep < subSteps; sStep++) {
        const u0 = ct0 + ((ct1 - ct0) * sStep) / subSteps;
        const u1 = ct0 + ((ct1 - ct0) * (sStep + 1)) / subSteps;

        const lx1 = origLx1 + (origLx2 - origLx1) * u0;
        const lz1 = origLz1 + (origLz2 - origLz1) * u0;
        const rx1 = origRx1 + (origRx2 - origRx1) * u0;
        const rz1 = origRz1 + (origRz2 - origRz1) * u0;

        const lx2 = origLx1 + (origLx2 - origLx1) * u1;
        const lz2 = origLz1 + (origLz2 - origLz1) * u1;
        const rx2 = origRx1 + (origRx2 - origRx1) * u1;
        const rz2 = origRz1 + (origRz2 - origRz1) * u1;

        const cx1 = origCx1 + cdx * u0;
        const cz1 = origCz1 + cdz * u0;
        const baseRawY1 = origRawY1 + (origRawY2 - origRawY1) * u0;

        const cx2 = origCx1 + cdx * u1;
        const cz2 = origCz1 + cdz * u1;
        const baseRawY2 = origRawY1 + (origRawY2 - origRawY1) * u1;

        const isGroundSeg = !isBridge && !isTunnel && baseRawY1 >= -0.45 && baseRawY2 >= -0.45;
        const useLocalTerr = isGroundSeg || isBridge;
        const terrY1 = useLocalTerr
          ? sampleGroundTerr(cx1, cz1, lx1, lz1, rx1, rz1)
          : origTerrY1 + (origTerrY2 - origTerrY1) * u0;
        const terrY2 = useLocalTerr
          ? sampleGroundTerr(cx2, cz2, lx2, lz2, rx2, rz2)
          : origTerrY1 + (origTerrY2 - origTerrY1) * u1;

        const cy1 = useLocalTerr ? Math.max(terrY1 + baseRawY1, liftAt(u0)) + yBias : origCy1 + (origCy2 - origCy1) * u0;
        const cy2 = useLocalTerr ? Math.max(terrY2 + baseRawY2, liftAt(u1)) + yBias : origCy1 + (origCy2 - origCy1) * u1;
        // effective height above local ground (drives parapets, piers, embankment walls, sidewalks)
        const rawY1 = useLocalTerr ? cy1 - yBias - terrY1 : baseRawY1;
        const rawY2 = useLocalTerr ? cy2 - yBias - terrY2 : baseRawY2;
        const ly1 = cy1;
        const ry1 = cy1;
        const ly2 = cy2;
        const ry2 = cy2;

        const segLen = Math.hypot(cx2 - cx1, cz2 - cz1);
        if (segLen < 0.05) continue;
        const subAccumDist = accumDist + fullSegLen * u0;

        if (!isTunnel) {
          roadSegments.push({
            x1: cx1 + ox,
            y1: cy1,
            z1: cz1 + oz,
            x2: cx2 + ox,
            y2: cy2,
            z2: cz2 + oz,
            width: widthM,
            layer,
            bridge: isBridge,
            tunnel: isTunnel,
            oneway,
            lanes,
            cls,
            name: resolvedRoadName,
            nameZh: resolvedRoadNameZh || undefined, // [road-names-zh]
            rawName: name || ref || '',
            signName: name || '',
            ref: ref || '',
            id: wid,
          });
        }

        // Road surface quad (counter-clockwise with +Y normal)
        rPos.push(
          lx1, ly1, lz1, rx2, ry2, rz2, rx1, ry1, rz1,
          lx1, ly1, lz1, lx2, ly2, lz2, rx2, ry2, rz2
        );
        for (let k = 0; k < 6; k++) rCol.push(rgb[0], rgb[1], rgb[2]);
        { // [street-props]
          const a0 = subAccumDist, a1 = subAccumDist + segLen;
          const hwr = Math.hypot(lx1 - rx1, lz1 - rz1) * 0.5;
          const paved = cls === 'pedestrian' || cls === 'footway' || cls === 'steps' || cls === 'path';
          const vl = paved ? -1 - 2 * hwr : Math.max(1, Math.round(hwr * 4)) * 1000 + 2 * hwr, vr = paved ? -1 : Math.max(1, Math.round(hwr * 4)) * 1000;
          rUv.push(a0, vl, a1, vr, a0, vr, a0, vl, a1, vl, a1, vr);
        }

        const dx = (cx2 - cx1) / segLen;
        const dz = (cz2 - cz1) / segLen;
        const nx = -dz;
        const nz = dx;

        // Clean light-grey concrete urban sidewalks along ground-level streets
        if (
          !isBridge &&
          !isTunnel &&
          Math.abs(rawY1) < 0.8 &&
          Math.abs(rawY2) < 0.8 &&
          (cls === 'primary' || cls === 'secondary' || cls === 'tertiary' || cls === 'residential')
        ) {
          const swW = cls === 'residential' ? 1.6 : 2.2;
          const swY1 = ly1 + 0.04;
          const swY2 = ly2 + 0.04;
          const swCol = [0.55, 0.57, 0.61];
          const swMx = (lx1 + lx2 + rx1 + rx2) * 0.25, swMz = (lz1 + lz2 + rz1 + rz2) * 0.25;
          const swHalfRoad = Math.hypot(lx1 - rx1, lz1 - rz1) * 0.5 + swW * 0.5;
          // Left sidewalk strip
          if (!sidewalkOverCycleway(swMx + nx * swHalfRoad, swMz + nz * swHalfRoad, dx, dz, swW * 0.5)) {
          rPos.push(
            lx1 + nx * swW, swY1, lz1 + nz * swW,
            lx2, swY2, lz2,
            lx1, swY1, lz1,
            lx1 + nx * swW, swY1, lz1 + nz * swW,
            lx2 + nx * swW, swY2, lz2 + nz * swW,
            lx2, swY2, lz2
          );
          for (let k = 0; k < 6; k++) rCol.push(swCol[0], swCol[1], swCol[2]);
          const so = -1 - swW, a0 = subAccumDist, a1 = subAccumDist + segLen; // [street-props]
          rUv.push(a0, so, a1, -1, a0, -1, a0, so, a1, so, a1, -1);
          }
          // Right sidewalk strip
          if (!sidewalkOverCycleway(swMx - nx * swHalfRoad, swMz - nz * swHalfRoad, dx, dz, swW * 0.5)) {
          rPos.push(
            rx1, swY1, rz1,
            rx2 - nx * swW, swY2, rz2 - nz * swW,
            rx1 - nx * swW, swY1, rz1 - nz * swW,
            rx1, swY1, rz1,
            rx2, swY2, rz2,
            rx2 - nx * swW, swY2, rz2 - nz * swW
          );
          for (let k = 0; k < 6; k++) rCol.push(swCol[0], swCol[1], swCol[2]);
          const so = -1 - swW, a0 = subAccumDist, a1 = subAccumDist + segLen; // [street-props]
          rUv.push(a0, -1, a1, so, a0, so, a0, -1, a1, -1, a1, so);
          }
        }

        // Lane Markings: +0.025m above road surface + polygonOffset (-4, -6) + depthWrite: false
        const my1 = cy1 + 0.025;
        const my2 = cy2 + 0.025;
        if (!STREET_OWNS_LANE_MARKINGS && !oneway && widthM >= 7.0 && cls !== 'footway' && cls !== 'pedestrian') {
          const ylw = [0.95, 0.78, 0.24];
          const cw = 0.15;
          mPos.push(
            cx1 + nx * cw, my1, cz1 + nz * cw,
            cx2 - nx * cw, my2, cz2 - nz * cw,
            cx1 - nx * cw, my1, cz1 - nz * cw,
            cx1 + nx * cw, my1, cz1 + nz * cw,
            cx2 + nx * cw, my2, cz2 + nz * cw,
            cx2 - nx * cw, my2, cz2 - nz * cw
          );
          for (let k = 0; k < 6; k++) mCol.push(...ylw);
        }

        if (!STREET_OWNS_LANE_MARKINGS && lanes >= 2 && widthM >= 5.5 && segLen >= 1.2) {
          const wht = [0.92, 0.94, 0.96];
          for (let l = 1; l < lanes; l++) {
            if (!oneway && l * 2 === lanes) continue;
            const frac = l / lanes - 0.5;
            const off = frac * widthM;
            let d = 0;
            while (d < segLen) {
              const d0 = d;
              const d1 = Math.min(segLen, d + 3.6);
              const posInCycle = (subAccumDist + d0) % 8.5;
              if (posInCycle < 4.2 && d1 > d0 + 0.4) {
                const t0 = d0 / segLen;
                const t1 = d1 / segLen;
                const sx0 = cx1 + (cx2 - cx1) * t0 + nx * off;
                const sz0 = cz1 + (cz2 - cz1) * t0 + nz * off;
                const sy0 = my1 + (my2 - my1) * t0;
                const sx1 = cx1 + (cx2 - cx1) * t1 + nx * off;
                const sz1 = cz1 + (cz2 - cz1) * t1 + nz * off;
                const sy1 = my1 + (my2 - my1) * t1;
                const lw = 0.10;
                mPos.push(
                  sx0 + nx * lw, sy0, sz0 + nz * lw,
                  sx1 - nx * lw, sy1, sz1 - nz * lw,
                  sx0 - nx * lw, sy0, sz0 - nz * lw,
                  sx0 + nx * lw, sy0, sz0 + nz * lw,
                  sx1 + nx * lw, sy1, sz1 + nz * lw,
                  sx1 - nx * lw, sy1, sz1 - nz * lw
                );
                for (let k = 0; k < 6; k++) mCol.push(...wht);
              }
              d += 4.25;
            }
          }
        }

        // One-way directional chevron arrow every 42 meters
        if (!STREET_OWNS_LANE_MARKINGS && oneway && widthM >= 4.5 && Math.floor((subAccumDist + segLen) / 42) > Math.floor(subAccumDist / 42)) {
          const mx = (cx1 + cx2) * 0.5;
          const my = (my1 + my2) * 0.5 + 0.03;
          const mz = (cz1 + cz2) * 0.5;
          const aw = Math.min(1.3, widthM * 0.22);
          const al = 2.6;
          const tipX = mx + dx * al;
          const tipZ = mz + dz * al;
          const bLx = mx - dx * al * 0.6 + nx * aw;
          const bLz = mz - dz * al * 0.6 + nz * aw;
          const bRx = mx - dx * al * 0.6 - nx * aw;
          const bRz = mz - dz * al * 0.6 - nz * aw;
          mPos.push(tipX, my, tipZ, bLx, my, bLz, bRx, my, bRz);
          const arrowCol = [0.80, 0.88, 0.98];
          mCol.push(...arrowCol, ...arrowCol, ...arrowCol);
        }

        // [elevated-roads] a lifted non-bridge way (bridge approach / ramp continuation) is a low embankment between
        // retaining walls up to VIADUCT_H, and a viaduct (deck on piers, girder underside) above it: walls taller
        // than that read as a canyon you can drive into from the open end, with the road surface overhead
        const liftMid = (rawY1 + rawY2) * 0.5;
        const isViaduct = !isBridge && !isTunnel && liftMid > VIADUCT_H;
        if (!isBridge && !isTunnel && !isViaduct && (rawY1 > 0.45 || rawY2 > 0.45)) {
          pushQuad(bPos, lx1, terrY1 - 0.4, lz1, lx2, terrY2 - 0.4, lz2, lx2, ly2 - 0.02, lz2, lx1, ly1 - 0.02, lz1);
          pushQuad(bPos, rx2, terrY2 - 0.4, rz2, rx1, terrY1 - 0.4, rz1, rx1, ry1 - 0.02, rz1, rx2, ry2 - 0.02, rz2);
          // abutment face where the embankment hands over to the viaduct (closes the end of the fill)
          if (rawY2 > rawY1 && rawY2 > VIADUCT_H - 0.7) pushQuad(bPos, rx2, terrY2 - 0.4, rz2, lx2, terrY2 - 0.4, lz2, lx2, ly2 - 0.02, lz2, rx2, ry2 - 0.02, rz2);
          if (rawY1 > rawY2 && rawY1 > VIADUCT_H - 0.7) pushQuad(bPos, lx1, terrY1 - 0.4, lz1, rx1, terrY1 - 0.4, rz1, rx1, ry1 - 0.02, rz1, lx1, ly1 - 0.02, lz1);
        }

        // Bridge 3D Structural Parapets, Unified Multi-Way Deck Seal, Box-Girder Soffit & Support Piers
        const onWater =
          isPointInWater && (isPointInWater(cx1, cz1, 0) || isPointInWater(cx2, cz2, 0));
        if (
          isScenicArchBridge ||
          isBridge ||
          isViaduct ||
          (onWater && cls !== 'pedestrian' && cls !== 'footway' && cls !== 'cycleway')
        ) {
          const deckDepth = isScenicArchBridge ? 0.32 : isHighPedOverpass ? 0.5 : 0.85;
          const railH = isScenicArchBridge ? 0.52 : isHighPedOverpass ? 1.05 : 0.78;
          const mx = (cx1 + cx2) * 0.5;
          const mz = (cz1 + cz2) * 0.5;
          // adjacency tests below compare against the raw (pre-lift) way heights of createSunkenTrenchChecker
          const midRawY = (flat[i * 3 + 1] + flat[(i + 1) * 3 + 1]) * 0.5;
          const hasBridgeLeft =
            isBridge &&
            isPointInSunkenTrench &&
            isPointInSunkenTrench.hasAdjacentBridge(mx + nx * (halfW + 4.5), mz + nz * (halfW + 4.5), wid, midRawY);
          const hasBridgeRight =
            isBridge &&
            isPointInSunkenTrench &&
            isPointInSunkenTrench.hasAdjacentBridge(mx - nx * (halfW + 4.5), mz - nz * (halfW + 4.5), wid, midRawY);
          const leftInOtherDeck =
            isPointInSunkenTrench &&
            isPointInSunkenTrench.isEdgeInsideOtherElevated(lx1, lz1, lx2, lz2, wid, midRawY);
          const rightInOtherDeck =
            isPointInSunkenTrench &&
            isPointInSunkenTrench.isEdgeInsideOtherElevated(rx1, rz1, rx2, rz2, wid, midRawY);

          const ggbOrange = [0.76, 0.22, 0.17]; // International Orange (#c0362c)
          const ggbDarkOrange = [0.58, 0.16, 0.13];
          const effDeckDepth = isGoldenGateBridge ? 2.6 : deckDepth;
          const effRailH = isGoldenGateBridge ? 1.35 : railH;

          // Only build raised parapet wall on true outer edges of a multi-way bridge / Y-split ramp
          if (!hasBridgeLeft) {
            const topL1 = leftInOtherDeck ? ly1 - 0.04 : ly1 + effRailH;
            const topL2 = leftInOtherDeck ? ly2 - 0.04 : ly2 + effRailH;
            if (isGoldenGateBridge) {
              pushColQuad(lx1, ly1 - effDeckDepth, lz1, lx2, ly2 - effDeckDepth, lz2, lx2, topL2, lz2, lx1, topL1, lz1, ggbOrange);
            } else {
              pushQuad(bPos, lx1, ly1 - effDeckDepth, lz1, lx2, ly2 - effDeckDepth, lz2, lx2, topL2, lz2, lx1, topL1, lz1);
            }
          } else {
            // Seal the deck gap to the adjacent parallel bridge way on the left (+nx, +nz)
            const sealW = 7.5;
            rPos.push(
              lx1 + nx * sealW, ly1 - 0.03, lz1 + nz * sealW,
              lx2, ly2 - 0.03, lz2,
              lx1, ly1 - 0.03, lz1,
              lx1 + nx * sealW, ly1 - 0.03, lz1 + nz * sealW,
              lx2 + nx * sealW, ly2 - 0.03, lz2 + nz * sealW,
              lx2, ly2 - 0.03, lz2
            );
            for (let k = 0; k < 6; k++) rCol.push(rgb[0] * 0.92, rgb[1] * 0.92, rgb[2] * 0.92);
            for (let k = 0; k < 12; k++) rUv.push(0); // [street-props]
            if (isGoldenGateBridge) {
              pushColQuad(lx1 + nx * sealW, ly1 - effDeckDepth, lz1 + nz * sealW, lx1, ly1 - effDeckDepth, lz1, lx2, ly2 - effDeckDepth, lz2, lx2 + nx * sealW, ly2 - effDeckDepth, lz2 + nz * sealW, ggbDarkOrange);
            } else {
              pushQuad(bPos, lx1 + nx * sealW, ly1 - effDeckDepth, lz1 + nz * sealW, lx1, ly1 - effDeckDepth, lz1, lx2, ly2 - effDeckDepth, lz2, lx2 + nx * sealW, ly2 - effDeckDepth, lz2 + nz * sealW);
            }
          }

          if (!hasBridgeRight) {
            const topR1 = rightInOtherDeck ? ry1 - 0.04 : ry1 + effRailH;
            const topR2 = rightInOtherDeck ? ry2 - 0.04 : ry2 + effRailH;
            if (isGoldenGateBridge) {
              pushColQuad(rx2, ry2 - effDeckDepth, rz2, rx1, ry1 - effDeckDepth, rz1, rx1, topR1, rz1, rx2, topR2, rz2, ggbOrange);
            } else {
              pushQuad(bPos, rx2, ry2 - effDeckDepth, rz2, rx1, ry1 - effDeckDepth, rz1, rx1, topR1, rz1, rx2, topR2, rz2);
            }
          } else {
            // Seal the deck gap to the adjacent parallel bridge way on the right (-nx, -nz)
            const sealW = 7.5;
            rPos.push(
              rx1, ry1 - 0.03, rz1,
              rx2 - nx * sealW, ry2 - 0.03, rz2 - nz * sealW,
              rx1 - nx * sealW, ry1 - 0.03, rz1 - nz * sealW,
              rx1, ry1 - 0.03, rz1,
              rx2, ry2 - 0.03, rz2,
              rx2 - nx * sealW, ry2 - 0.03, rz2 - nz * sealW
            );
            for (let k = 0; k < 6; k++) rCol.push(rgb[0] * 0.92, rgb[1] * 0.92, rgb[2] * 0.92);
            for (let k = 0; k < 12; k++) rUv.push(0); // [street-props]
            if (isGoldenGateBridge) {
              pushColQuad(rx1, ry1 - effDeckDepth, rz1, rx1 - nx * sealW, ry1 - effDeckDepth, rz1 - nz * sealW, rx2 - nx * sealW, ry2 - effDeckDepth, rz2 - nz * sealW, rx2, ry2 - effDeckDepth, rz2, ggbDarkOrange);
            } else {
              pushQuad(bPos, rx1, ry1 - effDeckDepth, rz1, rx1 - nx * sealW, ry1 - effDeckDepth, rz1 - nz * sealW, rx2 - nx * sealW, ry2 - effDeckDepth, rz2 - nz * sealW, rx2, ry2 - effDeckDepth, rz2);
            }
          }

          // Solid bridge deck underside soffit slab
          if (isGoldenGateBridge) {
            pushColQuad(lx1, ly1 - effDeckDepth, lz1, rx1, ry1 - effDeckDepth, rz1, rx2, ry2 - effDeckDepth, rz2, lx2, ly2 - effDeckDepth, lz2, ggbDarkOrange);
          } else {
            pushQuad(bPos, lx1, ly1 - effDeckDepth, lz1, rx1, ry1 - effDeckDepth, rz1, rx2, ry2 - effDeckDepth, rz2, lx2, ly2 - effDeckDepth, lz2);
          }

          // [elevated-roads] concrete box girder under road decks / viaducts (drip-edge overhang: the girder is inset
          // from the deck edges), so the underside reads as structure rather than a flat sheet
          if (!isGoldenGateBridge && !isScenicArchBridge && !isHighPedOverpass && widthM >= 5 && liftMid > 3.2 && !(onLandmarkDeck && lmDeckTest(ox + mx, oz + mz))) {
            const inset = Math.min(2.2, halfW * 0.3), gd = Math.min(1.6, 0.6 + widthM * 0.06);
            const gl1x = lx1 - nx * inset, gl1z = lz1 - nz * inset, gr1x = rx1 + nx * inset, gr1z = rz1 + nz * inset;
            const gl2x = lx2 - nx * inset, gl2z = lz2 - nz * inset, gr2x = rx2 + nx * inset, gr2z = rz2 + nz * inset;
            const t1 = ly1 - effDeckDepth, t2 = ly2 - effDeckDepth, b1 = t1 - gd, b2 = t2 - gd;
            pushQuad(bPos, gl1x, b1, gl1z, gl2x, b2, gl2z, gl2x, t2, gl2z, gl1x, t1, gl1z);
            pushQuad(bPos, gr2x, b2, gr2z, gr1x, b1, gr1z, gr1x, t1, gr1z, gr2x, t2, gr2z);
            pushQuad(bPos, gl1x, b1, gl1z, gr1x, b1, gr1z, gr2x, b2, gr2z, gl2x, b2, gl2z);
          }

          // Golden Gate Bridge 3D H-Frame Suspension Towers, Parabolic Catenary Main Cables & Vertical Suspender Cables
          if (isGoldenGateBridge && !onLandmarkDeck && (cls === 'trunk' || cls === 'motorway' || cls === 'primary')) {
            const ll1 = worldXZToLatLon(ox + cx1, oz + cz1, worldOrigin);
            const ll2 = worldXZToLatLon(ox + cx2, oz + cz2, worldOrigin);
            if (ll1 && ll2) {
              const lat1 = ll1[0], lat2 = ll2[0];
              const mLat = (lat1 + lat2) * 0.5;
              const sampleGgbCableLift = (latVal) => {
                // South Tower at 37.8143, North Tower at 37.8255 (main span 1,280m, side spans ~345m)
                if (latVal >= 37.8143 && latVal <= 37.8255) {
                  const u = (latVal - 37.8199) / 0.0056; // -1 at S Tower, 0 at Mid-Span, +1 at N Tower
                  return 4.5 + 83.5 * u * u;
                } else if (latVal >= 37.8082 && latVal < 37.8143) {
                  const u = (latVal - 37.8082) / (37.8143 - 37.8082);
                  return 2.0 + 86.0 * u * u;
                } else if (latVal > 37.8255 && latVal <= 37.8316) {
                  const u = (37.8316 - latVal) / (37.8316 - 37.8255);
                  return 2.0 + 86.0 * u * u;
                }
                return 0.0;
              };
              const lift1 = sampleGgbCableLift(lat1);
              const lift2 = sampleGgbCableLift(lat2);
              const binKey = Math.round((oz + (cz1 + cz2) * 0.5) / 14.0);
              if (lift1 > 1.5 && lift2 > 1.5 && !ggbDoneBins.has(binKey)) {
                ggbDoneBins.add(binKey);
                // Orient lateral offset consistently East/West so parallel NB/SB carriageways align
                const sgn = nx >= 0 ? 1 : -1;
                const ex = nx * sgn * 15.2, ez = nz * sgn * 15.2;
                const cableY1 = cy1 + lift1, cableY2 = cy2 + lift2;
                // Left & Right Parabolic Main Catenary Cables (0.62m radius International Orange steel tubes)
                pushCableBeam(cx1 + ex, cableY1, cz1 + ez, cx2 + ex, cableY2, cz2 + ez, 0.58, ggbOrange);
                pushCableBeam(cx1 - ex, cableY1, cz1 - ez, cx2 - ex, cableY2, cz2 - ez, 0.58, ggbOrange);
                // Vertical Suspender Ropes every 14m from main catenary cable down to outer deck truss
                const suspY = (cy1 + cy2) * 0.5 - 1.2;
                const suspTop = (cableY1 + cableY2) * 0.5;
                if (suspTop > suspY + 2.0) {
                  pushColoredBox(bColPos, bColClr, mx + ex, suspY, mz + ez, 0.28, suspTop - suspY, 0.28, [0.68, 0.20, 0.16]);
                  pushColoredBox(bColPos, bColClr, mx - ex, suspY, mz - ez, 0.28, suspTop - suspY, 0.28, [0.68, 0.20, 0.16]);
                }
              }
              // Emit the two monumental 227m Art Deco H-Frame Suspension Towers at South Tower (37.8143) & North Tower (37.8255)
              for (const [tTag, tLat] of [['S', 37.8143], ['N', 37.8255]]) {
                if (!ggbDoneTowers.has(tTag) && Math.abs(mLat - tLat) < 0.00045) {
                  ggbDoneTowers.add(tTag);
                  const sgn = nx >= 0 ? 1 : -1;
                  const ex = nx * sgn * 15.2, ez = nz * sgn * 15.2;
                  const deckY = (cy1 + cy2) * 0.5;
                  const towerTopY = deckY + 88.5;
                  // 1. Concrete ocean pier fender base (-3.5m to +8.5m ASL)
                  pushColoredBox(bColPos, bColClr, mx, -3.5, mz, 36.0, 12.0, 13.5, [0.64, 0.66, 0.69]);
                  // 2. Twin stepped Art Deco H-Frame vertical tower legs at ±15.2m (clear of the roadway!)
                  for (const side of [-1, 1]) {
                    const lxT = mx + ex * side, lzT = mz + ez * side;
                    pushColoredBox(bColPos, bColClr, lxT, 8.0, lzT, 4.8, deckY + 24.0 - 8.0, 5.2, ggbOrange);
                    pushColoredBox(bColPos, bColClr, lxT, deckY + 24.0, lzT, 4.0, 34.0, 4.4, ggbOrange);
                    pushColoredBox(bColPos, bColClr, lxT, deckY + 58.0, lzT, 3.2, 30.5, 3.6, ggbOrange);
                  }
                  // 3. Sub-deck horizontal portal struts (at y = 24m and y = 46m, well below the 64.5m roadway)
                  for (const subY of [24.0, 46.0]) {
                    pushCableBeam(mx - ex, subY, mz - ez, mx + ex, subY, mz + ez, 1.8, ggbDarkOrange);
                  }
                  // 4. Four iconic upper Art Deco horizontal portal cross-beams high above the roadway (+22m, +43m, +64m, +84m)
                  for (const liftCross of [22.0, 43.0, 64.0, 84.0]) {
                    pushCableBeam(mx - ex, deckY + liftCross, mz - ez, mx + ex, deckY + liftCross, mz + ez, 2.1, ggbOrange);
                  }
                }
              }
            }
          }

          if (isHighPedOverpass) {
            // fix/bridge-continuity: footbridge on slim columns every 18 m wherever the deck clears the ground
            if (
              (rawY1 + rawY2) * 0.5 > 2.2 &&
              Math.floor((subAccumDist + segLen) / 18) > Math.floor(subAccumDist / 18) &&
              !(onLandmarkDeck && lmDeckTest(ox + (cx1 + cx2) * 0.5, oz + (cz1 + cz2) * 0.5))
            ) {
              const px = (cx1 + cx2) * 0.5;
              const pz = (cz1 + cz2) * 0.5;
              const baseTerr = Math.min(terrY1, terrY2);
              const pyTop = (cy1 + cy2) * 0.5 - effDeckDepth * 0.5;
              if (pyTop > baseTerr + 0.5) {
                pushBox(bPos, px, baseTerr, pz, 0.55, pyTop - baseTerr, 0.55);
              }
            }
          } else if (
            (isBridge || isViaduct) &&
            !isHighPedOverpass &&
            !isScenicArchBridge &&
            !(isGoldenGateBridge && onWater) &&
            !(onLandmarkDeck && lmDeckTest(ox + (cx1 + cx2) * 0.5, oz + (cz1 + cz2) * 0.5)) &&
            (rawY1 + rawY2) * 0.5 > 2.8 &&
            Math.floor((subAccumDist + segLen) / 36) > Math.floor(subAccumDist / 36)
          ) {
            const px = (cx1 + cx2) * 0.5;
            const pz = (cz1 + cz2) * 0.5;
            const baseTerr = (terrY1 + terrY2) * 0.5;
            const pyTop = (cy1 + cy2) * 0.5 - effDeckDepth * 0.5;
            const pw = Math.min(1.4, widthM * 0.16);
            if (pyTop > baseTerr + 0.5) {
              // [elevated-roads] column + crosshead under the girder (oriented across the deck)
              const capH = Math.min(1.2, 0.5 + widthM * 0.04), colTop = pyTop - (liftMid > 3.2 && widthM >= 5 ? Math.min(1.6, 0.6 + widthM * 0.06) : 0);
              pushBox(bPos, px, baseTerr, pz, pw, Math.max(0.3, colTop - capH - baseTerr), pw);
              if (widthM >= 5) pushOrientedBox(bPos, px, colTop - capH, pz, nx, nz, Math.max(pw + 0.6, widthM * 0.72), pw * 1.1, capH);
            }
          }
        }

        // Sunken Trench / Underpass Retaining Walls, Sealed Floor Bed & Sub-Grade Coping Ledges
        if ((rawY1 < -0.65 || rawY2 < -0.65) && cls !== 'footway' && cls !== 'pedestrian' && cls !== 'cycleway') {
          const isLinkRamp = cls.endsWith('_link');
          const mx = (cx1 + cx2) * 0.5;
          const mz = (cz1 + cz2) * 0.5;
          const underBridge =
            isPointInSunkenTrench &&
            (isPointInSunkenTrench.isUnderCrossBridge(mx, mz) ||
              isPointInSunkenTrench.isUnderCrossBridge(cx1, cz1) ||
              isPointInSunkenTrench.isUnderCrossBridge(cx2, cz2));

          const lmx = (lx1 + lx2) * 0.5;
          const lmz = (lz1 + lz2) * 0.5;

          // 1. Sealed concrete trench floor & central median bed slab (strictly 0.32m below road surface so it never pokes through asphalt)
          const bedY1 = ly1 - 0.32;
          const bedY2 = ly2 - 0.32;
          const outExt = isLinkRamp ? 1.5 : 1.0;
          const inExt = isLinkRamp ? 8.5 : 5.5;
          pushQuad(
            bPos,
            lx1 + nx * outExt, isLinkRamp ? terrY1 - 6.25 : bedY1, lz1 + nz * outExt,
            lx2 + nx * outExt, isLinkRamp ? terrY2 - 6.25 : bedY2, lz2 + nz * outExt,
            rx2 - nx * inExt, isLinkRamp ? terrY2 - 6.25 : bedY2, rz2 - nz * inExt,
            rx1 - nx * inExt, isLinkRamp ? terrY1 - 6.25 : bedY1, rz1 - nz * inExt
          );

          if (!isLinkRamp) {
            // Main sunken carriageway: check if an exit/entrance ramp diverges across or alongside the outer edge
            const rampInfo = isPointInSunkenTrench ? isPointInSunkenTrench.getNearestRampInfo(lmx, lmz, wid) : null;
            const rampMergingAcrossEdge =
              rampInfo !== null && (rampInfo.dist <= rampInfo.rampHw + 2.2 || rampInfo.rampY < -4.2);

            if (!rampMergingAcrossEdge) {
              const wallTop1 =
                rampInfo !== null
                  ? terrY1 + rampInfo.rampY + 0.32
                  : underBridge
                    ? terrY1 - 0.28
                    : terrY1 + 0.68;
              const wallTop2 =
                rampInfo !== null
                  ? terrY2 + rampInfo.rampY + 0.32
                  : underBridge
                    ? terrY2 - 0.28
                    : terrY2 + 0.68;

              pushQuad(
                bPos,
                lx1, ly1 - 0.22, lz1,
                lx1, Math.max(ly1, wallTop1), lz1,
                lx2, Math.max(ly2, wallTop2), lz2,
                lx2, ly2 - 0.22, lz2
              );

              if (rampInfo === null) {
                const copW = 3.8;
                pushQuad(
                  bPos,
                  lx1, terrY1 - 0.30, lz1,
                  lx1 + nx * copW, terrY1 - 0.33, lz1 + nz * copW,
                  lx2 + nx * copW, terrY2 - 0.33, lz2 + nz * copW,
                  lx2, terrY2 - 0.30, lz2
                );
              }
            }

            // Inner edge (-nx, -nz): if paired with a parallel sunken carriageway across the central median, render a 1.10m Jersey barrier.
            const hasParallel =
              Boolean(oneway) &&
              isPointInSunkenTrench &&
              isPointInSunkenTrench.hasParallelSunken((rx1 + rx2) * 0.5 - nx * 4.2, (rz1 + rz2) * 0.5 - nz * 4.2, wid);
            if (hasParallel) {
              const medH = Math.min(1.10, Math.max(0.25, -(rawY1 + rawY2) * 0.22));
              pushQuad(
                bPos,
                rx2, ry2 - 0.20, rz2,
                rx2, ry2 + medH, rz2,
                rx1, ry1 + medH, rz1,
                rx1, ry1 - 0.20, rz1
              );
            } else {
              const wallTopIn1 = underBridge ? terrY1 - 0.28 : terrY1 + 0.68;
              const wallTopIn2 = underBridge ? terrY2 - 0.28 : terrY2 + 0.68;
              pushQuad(
                bPos,
                rx2, ry2 - 0.22, rz2,
                rx2, Math.max(ry2, wallTopIn2), rz2,
                rx1, Math.max(ry1, wallTopIn1), rz1,
                rx1, ry1 - 0.22, rz1
              );
              const copW = 3.8;
              pushQuad(
                bPos,
                rx2, terrY2 - 0.30, rz2,
                rx2 - nx * copW, terrY2 - 0.33, rz2 - nz * copW,
                rx1 - nx * copW, terrY1 - 0.33, rz1 - nz * copW,
                rx1, terrY1 - 0.30, rz1
              );
            }
          } else {
            // Sunken/climbing _link ramp:
            // Outer edge (+nx, +nz): build trench retaining wall up to ground level ONLY once outer edge clears the main sunken carriageway
            const outInMain =
              isPointInSunkenTrench &&
              (isPointInSunkenTrench.isInsideMainSunken(lmx, lmz, wid, 0.4) ||
                isPointInSunkenTrench.isInsideMainSunken(lx1, lz1, wid, 0.4) ||
                isPointInSunkenTrench.isInsideMainSunken(lx2, lz2, wid, 0.4));
            if (!outInMain) {
              const rWallTop1 = underBridge ? terrY1 - 0.28 : terrY1 + 0.55;
              const rWallTop2 = underBridge ? terrY2 - 0.28 : terrY2 + 0.55;
              pushQuad(
                bPos,
                lx1, ly1 - 0.25, lz1,
                lx1, Math.max(ly1, rWallTop1), lz1,
                lx2, Math.max(ly2, rWallTop2), lz2,
                lx2, ly2 - 0.25, lz2
              );
              const copW = 2.4;
              pushQuad(
                bPos,
                lx1, terrY1 - 0.30, lz1,
                lx1 + nx * copW, terrY1 - 0.33, lz1 + nz * copW,
                lx2 + nx * copW, terrY2 - 0.33, lz2 + nz * copW,
                lx2, terrY2 - 0.30, lz2
              );
            }
            // Inner edge (-nx, -nz): once the climbing ramp separates from the main sunken carriageway, build a solid support wall DOWN to the trench floor
            const rmx = (rx1 + rx2) * 0.5;
            const rmz = (rz1 + rz2) * 0.5;
            const inInMain =
              isPointInSunkenTrench &&
              (isPointInSunkenTrench.isInsideMainSunken(rmx, rmz, wid, 0.8) ||
                isPointInSunkenTrench.isInsideMainSunken(rx1, rz1, wid, 0.8) ||
                isPointInSunkenTrench.isInsideMainSunken(rx2, rz2, wid, 0.8));
            if (!inInMain) {
              pushQuad(
                bPos,
                rx2, terrY2 - 6.2, rz2,
                rx2, ry2 + 0.38, rz2,
                rx1, ry1 + 0.38, rz1,
                rx1, terrY1 - 6.2, rz1
              );
            }
          }
        }
      }

      accumDist += fullSegLen;
    }
  }

  // [elevated-roads] towers / main cables / suspenders of suspension bridges that have no hand-built landmark model
  if (worldOrigin) addSuspensionStructures(ox, oz, worldOrigin, isPointInWater, pushColoredBox, bColPos, bColClr, pushCableBeam, roadSegments);

  if (rPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(rCol), 3, true));
    if (rUv.length === (rPos.length / 3) * 2) geom.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2)); // [street-props]
    finalizeAndReleaseGeometry(geom, true, true);
    const mesh = new THREE.Mesh(geom, mats.roadMat);
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
  }

  if (mPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(mCol), 3, true));
    finalizeAndReleaseGeometry(geom, false);
    markingGroup.add(new THREE.Mesh(geom, mats.markingMat));
  }

  if (bPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    finalizeAndReleaseGeometry(geom, true);
    const mesh = new THREE.Mesh(geom, mats.bridgeStructMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bridgeGroup.add(mesh);
  }

  if (bColPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(bColPos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(bColClr), 3, true));
    finalizeAndReleaseGeometry(geom, true);
    const mesh = new THREE.Mesh(geom, mats.facilityMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bridgeGroup.add(mesh);
  }
}

function buildRailways(railways, ox, oz, railGroup, mats) {
  const pos = [];
  const col = [];

  for (const rw of railways) {
    const [, rtype, , lcol, , isTunnel, , flat] = rw;
    if (!flat || flat.length < 6 || isTunnel) continue;
    const nPts = flat.length / 3;
    const rgb = rtype === 'subway' ? parseCssHexColor(lcol, [0.0, 0.57, 0.85]) : [0.52, 0.46, 0.40];
    const railRgb = [0.78, 0.82, 0.86];

    for (let i = 0; i < nPts - 1; i++) {
      const x1 = flat[i * 3];
      const z1 = flat[i * 3 + 2];
      const y1 = getBeijingTerrainElevation(ox + x1, oz + z1) + flat[i * 3 + 1] + 0.25;
      const x2 = flat[(i + 1) * 3];
      const z2 = flat[(i + 1) * 3 + 2];
      const y2 = getBeijingTerrainElevation(ox + x2, oz + z2) + flat[(i + 1) * 3 + 1] + 0.25;
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const bw = 1.9;
      pos.push(
        x1 + nx * bw, y1, z1 + nz * bw,
        x2 - nx * bw, y2, z2 - nz * bw,
        x1 - nx * bw, y1, z1 - nz * bw,
        x1 + nx * bw, y1, z1 + nz * bw,
        x2 + nx * bw, y2, z2 + nz * bw,
        x2 - nx * bw, y2, z2 - nz * bw
      );
      for (let k = 0; k < 6; k++) col.push(...rgb);

      for (const roff of [-0.72, 0.72]) {
        const rw2 = 0.12;
        const ry1 = y1 + 0.08, ry2 = y2 + 0.08;
        pos.push(
          x1 + nx * (roff + rw2), ry1, z1 + nz * (roff + rw2),
          x2 - nx * (-roff + rw2), ry2, z2 - nz * (-roff + rw2),
          x1 + nx * (roff - rw2), ry1, z1 + nz * (roff - rw2),
          x1 + nx * (roff + rw2), ry1, z1 + nz * (roff + rw2),
          x2 + nx * (roff + rw2), ry2, z2 + nz * (roff + rw2),
          x2 - nx * (-roff + rw2), ry2, z2 - nz * (-roff + rw2)
        );
        for (let k = 0; k < 6; k++) col.push(...railRgb);
      }
    }
  }

  if (pos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(col), 3, true));
    finalizeAndReleaseGeometry(geom, true);
    railGroup.add(new THREE.Mesh(geom, mats.railMat));
  }
}

function createBuildingBuildTask(buildings, ox, oz, bldgGroup, mats, buildingColliders, roadSegments = [], entityTable = [], regionTag = 'beijing', roofOpts = null) {
  buildings = clearBridgeDeckBuildings(buildings, ox, oz, roadSegments, getBeijingTerrainElevation); // [release-6-integ] keep bridge carriageways clear
  const wfcPos = [];
  const wfcNorm = [];
  const wfcCol = [];
  const wfcUv = [];

  const rfPos = [];
  const rfCol = [];
  const kaijuBid = []; // [kaiju] [v0, v1, entityIdx + 1] per building

  // Pre-collect parent buildings with name/role/colour in this chunk so `building:part` tiers or courtyard wings can inherit them
  const namedParentBuildings = [];
  for (let i = 0; i < buildings.length; i++) {
    const [, bName, bType, bIsPart, , , , , , bCol, , bFlat] = buildings[i];
    if ((bName || (bType && bType !== 'yes') || bCol) && bFlat && bFlat.length >= 6) {
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (let k = 0; k < bFlat.length; k += 2) {
        const x = bFlat[k], z = bFlat[k + 1];
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (z < bz0) bz0 = z;
        if (z > bz1) bz1 = z;
      }
      namedParentBuildings.push({
        name: bName,
        btype: bType,
        colour: bCol || null,
        isPart: Boolean(bIsPart),
        minX: bx0,
        maxX: bx1,
        minZ: bz0,
        maxZ: bz1,
        flatOuter: bFlat,
      });
    }
  }

  // Pre-collect local ground-level road segments for road-facing building entrance placement
  const localRoads = [];
  for (let rIdx = 0; rIdx < roadSegments.length; rIdx++) {
    const seg = roadSegments[rIdx];
    if (seg.bridge || seg.tunnel || (seg.layer || 0) !== 0) continue;
    const rx1 = seg.x1 - ox, rz1 = seg.z1 - oz;
    const rx2 = seg.x2 - ox, rz2 = seg.z2 - oz;
    const rdx = rx2 - rx1, rdz = rz2 - rz1;
    const rlen = Math.hypot(rdx, rdz);
    if (rlen < 0.5) continue;
    localRoads.push({
      x1: rx1,
      z1: rz1,
      x2: rx2,
      z2: rz2,
      mx: (rx1 + rx2) * 0.5,
      mz: (rz1 + rz2) * 0.5,
      tx: rdx / rlen,
      tz: rdz / rlen,
      isFootway: seg.cls === 'footway' || seg.cls === 'path' || seg.cls === 'steps',
      hw: (seg.width || 8) * 0.5, // [roofs] yards: front setback from the carriageway
    });
  }
  const getEdgeGroundY = (lx, lz) => getBeijingTerrainElevation(ox + lx, oz + lz);
  const roofCtx = createRoofContext(roofOpts, ox, oz, localRoads, getEdgeGroundY, buildings); // [roofs]

  // Pre-collect named road segment midpoints (sampled at >= 20m spacing per road name) so nearest-road lookup is fast
  const namedRoadPts = [];
  for (let rIdx = 0; rIdx < roadSegments.length; rIdx++) {
    const seg = roadSegments[rIdx];
    if (!seg.rawName) continue;
    const mx = (seg.x1 + seg.x2) * 0.5;
    const mz = (seg.z1 + seg.z2) * 0.5;
    if (namedRoadPts.length > 0) {
      const prev = namedRoadPts[namedRoadPts.length - 1];
      if (prev.name === seg.rawName && (mx - prev.mx) * (mx - prev.mx) + (mz - prev.mz) * (mz - prev.mz) < 400.0) {
        continue;
      }
    }
    namedRoadPts.push({ mx, mz, name: seg.rawName });
  }

  let curIdx = 0;
  let finalized = false;

  return {
    step(budgetMs = 5.0) {
      const t0 = performance.now();
      while (curIdx < buildings.length) {
        const b = buildings[curIdx];
        const i = curIdx;
        curIdx++;
        if (b[13]) { // [ground] plain infill block past the detailed-build budget
          appendInfillBuilding(b, ox, oz, getEdgeGroundY, regionTag, { pos: wfcPos, norm: wfcNorm, col: wfcCol, uv: wfcUv, colliders: buildingColliders, roof: roofCtx }); // [roofs] roof ctx
          continue;
        }

        const [osmId, name, rawBtype, isPart, rawH, rawMinH, lvl, style, , rawColour, , flatOuter, flatHoles] = b;
        if (!flatOuter || flatOuter.length < 6) continue;

        const contour = [];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let k = 0; k < flatOuter.length; k += 2) {
          const x = flatOuter[k], z = flatOuter[k + 1];
          contour.push(new THREE.Vector2(x, z));
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }

        // Ensure contour has positive signed area in (x, z) so outward normal is (dz, 0, -dx)
        if (signedAreaXZ(contour) < 0) {
          contour.reverse();
        }

        const holes = [];
        const normFlatHoles = [];
        for (const fh of flatHoles || []) {
          if (fh.length >= 6) {
            const hpts = [];
            for (let k = 0; k < fh.length; k += 2) {
              hpts.push(new THREE.Vector2(fh[k], fh[k + 1]));
            }
            // Holes have opposite winding so their walls face into the inner courtyard
            if (signedAreaXZ(hpts) > 0) {
              hpts.reverse();
            }
            holes.push(hpts);
            const nf = [];
            for (let k = 0; k < hpts.length; k++) {
              nf.push(hpts[k].x, hpts[k].y);
            }
            normFlatHoles.push(nf);
          }
        }

        const normFlatOuter = [];
        for (let k = 0; k < contour.length; k++) {
          normFlatOuter.push(contour[k].x, contour[k].y);
        }

        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const wx = ox + cx;
        const wz = oz + cz;
        const terrainY = getBeijingTerrainElevation(wx, wz);
        // Sample the 4 footprint bbox corners so buildings on mountain slopes extend their foundation below the lowest downhill corner
        // AND raise their roof above the highest uphill corner (`maxCornerY`) so no building is ever buried inside a mountain slope
        const c00 = getBeijingTerrainElevation(ox + minX, oz + minZ);
        const c10 = getBeijingTerrainElevation(ox + maxX, oz + minZ);
        const c01 = getBeijingTerrainElevation(ox + minX, oz + maxZ);
        const c11 = getBeijingTerrainElevation(ox + maxX, oz + maxZ);
        const minCornerY = Math.min(terrainY, c00, c10, c01, c11);
        const maxCornerY = Math.max(terrainY, c00, c10, c01, c11);
        const topTerrainY = maxCornerY > terrainY + 0.35 ? maxCornerY : terrainY;
        // Deterministic per-building/part micro-offsets prevent coplanar Z-fighting between parent `building` and nested `building:part`
        const bHash = (((osmId * 2654435761) ^ (i * 1597334677)) >>> 0);
        const hMicroOffset = (isPart ? 0.22 : 0.0) + ((bHash % 509) / 509.0) * 0.24;
        const wallOutOffset = (isPart ? 0.08 : 0.0) + (((bHash >> 9) % 257) / 257.0) * 0.06;
        const curMinX = minX + ox, curMaxX = maxX + ox;
        const curMinZ = minZ + oz, curMaxZ = maxZ + oz;
        const curArea = Math.max(1.0, (curMaxX - curMinX) * (curMaxZ - curMinZ));
        const matchedLm = regionTag === 'beijing' ? matchLandmarkForChunkBuilding(wx, wz, osmId) : null;

        // Check duplicate footprints & validate elevated building parts BEFORE pushing to entityTable or buildingColliders
        // so skipped footprints never create invisible ghost buildings or floating blocks in the air.
        let overlapsExistingBldg = false;
        let effRawMinH = rawMinH;
        if (!matchedLm) {
          if (rawMinH <= 2.0 && !isPart) {
            for (let cIdx = 0; cIdx < buildingColliders.length; cIdx++) {
              const bc = buildingColliders[cIdx];
              const ix = Math.max(0.0, Math.min(curMaxX, bc.maxX) - Math.max(curMinX, bc.minX));
              const iz = Math.max(0.0, Math.min(curMaxZ, bc.maxZ) - Math.max(curMinZ, bc.minZ));
              const interArea = ix * iz;
              if (interArea <= 0) continue;
              const bcArea = Math.max(1.0, (bc.maxX - bc.minX) * (bc.maxZ - bc.minZ));
              if (interArea > 0.32 * Math.min(curArea, bcArea)) {
                // Allow stepped skyscraper tiers / tower-on-podium massing where height and footprint area differ significantly
                const isSteppedTier =
                  Math.abs(rawH - (bc.rawH || 0)) >= 15.0 &&
                  Math.min(curArea, bcArea) < 0.80 * Math.max(curArea, bcArea);
                if (!isSteppedTier) {
                  overlapsExistingBldg = true;
                  break;
                }
              }
            }
            if (overlapsExistingBldg) continue;
          } else if (rawMinH > 0) {
            let maxSupportRawH = 0;
            for (let cIdx = 0; cIdx < buildingColliders.length; cIdx++) {
              const bc = buildingColliders[cIdx];
              const ix = Math.max(0.0, Math.min(curMaxX, bc.maxX) - Math.max(curMinX, bc.minX));
              const iz = Math.max(0.0, Math.min(curMaxZ, bc.maxZ) - Math.max(curMinZ, bc.minZ));
              const interArea = ix * iz;
              if (interArea <= 0) continue;
              const bcArea = Math.max(1.0, (bc.maxX - bc.minX) * (bc.maxZ - bc.minZ));
              if (
                interArea > 0.15 * Math.min(curArea, bcArea) ||
                (bc.flatOuter && pointInRing2D(cx, cz, bc.flatOuter))
              ) {
                if ((bc.rawH || 0) > maxSupportRawH) maxSupportRawH = bc.rawH || 0;
              }
            }
            if (maxSupportRawH > 0) {
              if (effRawMinH > maxSupportRawH + 0.4) {
                effRawMinH = Math.max(0, maxSupportRawH - 0.25);
              }
            } else if (effRawMinH <= 28.0) {
              // Detached low canopy/entrance part with no supporting podium underneath: ground it so it never floats
              effRawMinH = 0;
            } else {
              // Orphaned high-altitude block with no supporting tower underneath: skip so it never floats in mid-air
              continue;
            }
          }
        }

        // Extend foundation below the lowest downhill footprint corner on hills so sloped buildings never float
        const minH =
          effRawMinH > 0
            ? topTerrainY + effRawMinH + (isPart ? 0.05 : 0.0)
            : minCornerY < terrainY - 0.15
              ? minCornerY - 1.5
              : terrainY - (terrainY > 1.5 ? 2.2 : 0.05);
        const h = topTerrainY + rawH + hMicroOffset;

        // 1. Inherit parent building name / architectural role (`btype`) / OSM `colour` for enclosed parts
        let resolvedBldgName = name;
        let btype = rawBtype || 'yes';
        let bColour = rawColour || null;
        if (!resolvedBldgName || btype === 'yes' || !bColour) {
          for (let pIdx = 0; pIdx < namedParentBuildings.length; pIdx++) {
            const pb = namedParentBuildings[pIdx];
            if (
              cx >= pb.minX - 4.0 &&
              cx <= pb.maxX + 4.0 &&
              cz >= pb.minZ - 4.0 &&
              cz <= pb.maxZ + 4.0 &&
              pointInRing2D(cx, cz, pb.flatOuter)
            ) {
              if (!resolvedBldgName && pb.name) {
                resolvedBldgName = isPart ? `${pb.name} (${lvl}层分级体块)` : pb.name;
              }
              if (btype === 'yes' && pb.btype && pb.btype !== 'yes') {
                btype = pb.btype;
              }
              if (!bColour && pb.colour) {
                bColour = pb.colour;
              }
              if (resolvedBldgName && btype !== 'yes' && bColour) break;
            }
          }
        }

        // 2. Determine localized Chinese architectural category label (`typeLabel`)
        let typeLabel = BUILDING_TYPE_ZH[btype] || '';
        if (!typeLabel) {
          if (style === 'imperial') {
            typeLabel = rawH >= 16 ? '皇家重檐古建殿宇' : '古建宫殿/院落';
          } else if (style === 'hutong') {
            typeLabel = '老北京四合院/胡同民居';
          } else if (rawH >= 100) {
            typeLabel = '超高层摩天写字楼';
          } else if (rawH >= 45) {
            typeLabel = style === 'glass' ? '高层玻璃幕墙大厦' : '高层商务/公寓楼';
          } else if (rawH >= 20) {
            typeLabel = style === 'glass' ? '现代商务写字楼' : '多层城市建筑';
          } else if (lvl <= 2) {
            typeLabel = '低层街区建筑';
          } else {
            typeLabel = '城市综合楼宇';
          }
        }
        if (!resolvedBldgName) {
          let nearestRoad = '';
          let bestDist2 = 165.0 * 165.0;
          for (let rIdx = 0; rIdx < namedRoadPts.length; rIdx++) {
            const rp = namedRoadPts[rIdx];
            const d2 = (wx - rp.mx) * (wx - rp.mx) + (wz - rp.mz) * (wz - rp.mz);
            if (d2 < bestDist2) {
              bestDist2 = d2;
              nearestRoad = rp.name;
            }
          }
          if (nearestRoad) {
            resolvedBldgName = `${nearestRoad}沿线 · ${typeLabel}`;
          } else {
            resolvedBldgName = `${typeLabel} (${lvl}层)`;
          }
        }

        const btypeDisplay =
          btype && btype !== 'yes'
            ? `${typeLabel} (building=${btype})`
            : `${typeLabel} (building=yes)`;

        const entityIdx = entityTable.length;
        const entityRecord = {
          kind: 'building',
          id: matchedLm && matchedLm.osmIds && matchedLm.osmIds[0] ? matchedLm.osmIds[0] : osmId,
          name: matchedLm ? matchedLm.nameZh : resolvedBldgName,
          nameEn: matchedLm ? matchedLm.nameEn : '',
          btype,
          btypeDisplay,
          styleDisplay: matchedLm
            ? '40 Authentic Beijing Landmarks · 1:1 Bespoke Model'
            : BUILDING_STYLE_ZH[style] || style,
          isPart: Boolean(isPart),
          height: rawH,
          minHeight: effRawMinH,
          levels: lvl,
          style,
          colour: bColour,
          holesCount: holes.length,
          flatOuter,
          minX: curMinX,
          maxX: curMaxX,
          minZ: curMinZ,
          maxZ: curMaxZ,
          baseY: minH,
          topY: h,
          ox,
          oz,
          terrainY,
        };
        entityTable.push(entityRecord);

        if (effRawMinH <= 2.0) { // fix/water: include ground-level parts (tiles flag any min_height > 0 as a part)
          buildingColliders.push({
            minX: curMinX,
            maxX: curMaxX,
            minZ: curMinZ,
            maxZ: curMaxZ,
            h,
            rawH,
            flatOuter,
            ox,
            oz,
            id: osmId,
          });
        }

        // Skip generic WFC extrusion if this footprint belongs to one of the 40 bespoke Beijing 3D landmarks
        if (matchedLm) {
          continue;
        }

        // 3. Emit 24-Style 3D WFC Building Geometry (1D Massing Setback + 2D Facade Columns + 3D Roof & Greebles)
        const kaijuV0 = wfcPos.length / 3; // [kaiju]
        const wfcMeta = appendCompactChunkBuildingWFC(
          {
            id: osmId || (i + 1),
            name: resolvedBldgName,
            btype,
            isPart: Boolean(isPart),
            height: rawH,
            minHeight: effRawMinH,
            levels: lvl,
            style,
            colour: bColour,
            flatOuter: normFlatOuter,
            flatHoles: normFlatHoles,
            wx,
            wz,
            baseY: minH,
            topY: h,
            groundY: topTerrainY,
            getEdgeGroundY,
            localRoads,
            wallOutOffset,
            region: regionTag,
            ...roofInfoFor(roofCtx, cx, cz, rawColour, b[8]), // [roofs] arch region, land-use flavour, roof tags, detail sink
          },
          wfcPos,
          wfcNorm,
          wfcCol,
          null,
          entityIdx,
          wfcUv
        );
        kaijuBid.push(kaijuV0, wfcPos.length / 3, entityIdx + 1); // [kaiju]

        if (wfcMeta && wfcMeta.arch) {
          entityRecord.styleDisplay = `${wfcMeta.facadeId || wfcMeta.arch.shortName} · ${wfcMeta.arch.category}`;
          entityRecord.styleId = wfcMeta.styleId;
          entityRecord.facadeId = wfcMeta.facadeId;
          entityRecord.extruded = true;
          if (wfcMeta.topRoofFlat) entityRecord.topRoofFlat = wfcMeta.topRoofFlat;
          if (wfcMeta.topRoofHoles) entityRecord.topRoofHoles = wfcMeta.topRoofHoles;
          if (Number.isFinite(wfcMeta.topRoofY)) entityRecord.topY = wfcMeta.topRoofY;
          if (wfcMeta.roofShape) noteRoofHouse(roofCtx, entityRecord, wfcMeta, normFlatOuter, cx, cz, osmId, buildingColliders); // [roofs]
        }

        // If this building is a stadium with an inner courtyard bowl (e.g. Workers' Stadium, Bird's Nest),
        // fill the inner bowl floor at ground level with a lush green athletic pitch
        if (btype === 'stadium' && holes.length > 0 && holes[0].length >= 3) {
          const fieldPts = [...holes[0]].reverse();
          const fieldTris = THREE.ShapeUtils.triangulateShape(fieldPts, []);
          const turfRgb = [0.20, 0.54, 0.28];
          const fieldY = terrainY + 0.16;
          for (const [fa, fb, fc] of fieldTris) {
            const pA = fieldPts[fa], pB = fieldPts[fb], pC = fieldPts[fc];
            rfPos.push(pA.x, fieldY, pA.y, pC.x, fieldY, pC.y, pB.x, fieldY, pB.y);
            rfCol.push(...turfRgb, ...turfRgb, ...turfRgb);
          }
        }

        if ((curIdx & 3) === 0 && performance.now() - t0 >= budgetMs) {
          return false;
        }
      }

      if (performance.now() - t0 >= budgetMs && !finalized && wfcPos.length > 9000) {
        return false;
      }

      if (!finalized) {
        finalized = true;
        finishRoofDetail(roofCtx, bldgGroup, mats, buildingColliders); // [roofs] yards + chimneys/dormers (near LOD meshes)
        if (wfcPos.length > 0) {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(wfcPos, 3));
          geom.setAttribute('normal', new THREE.Float32BufferAttribute(wfcNorm, 3));
          geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(wfcCol), 3, true));
          if (wfcUv.length > 0) {
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(wfcUv, 2));
          }
          geom.setAttribute('kBid', kaijuBidAttribute(kaijuBid, wfcPos.length / 3)); // [kaiju]
          finalizeAndReleaseGeometry(geom, false);
          const mesh = new THREE.Mesh(geom, mats.wfcBldgMat);
          if (mats.wfcBldgDepthMat) mesh.customDepthMaterial = mats.wfcBldgDepthMat; // [kaiju]
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          bldgGroup.add(mesh);
        }

        if (rfPos.length > 0) {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(rfPos, 3));
          geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(rfCol), 3, true));
          finalizeAndReleaseGeometry(geom, true);
          const mesh = new THREE.Mesh(geom, mats.roofMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          bldgGroup.add(mesh);
        }
      }

      return true;
    },
  };
}

function buildBuildings(buildings, ox, oz, bldgGroup, mats, buildingColliders, roadSegments = []) {
  const task = createBuildingBuildTask(buildings, ox, oz, bldgGroup, mats, buildingColliders, roadSegments);
  task.step(Infinity);
}

/**
 * Appends a 3D tree (trunk + multi-tiered foliage canopy) to (pos, col).
 * type: 'pine' (Chinese cypress/pine 古柏/油松), 'ginkgo' (autumn golden 银杏), or 'scholar' (lush green 国槐).
 */
function pushTreeGeometry(pos, col, x, y, z, scale, type) {
  const trunkH = 2.4 * scale;
  const trunkW = 0.42 * scale;
  pushColoredBox(pos, col, x, y, z, trunkW, trunkH, trunkW, [0.38, 0.26, 0.18]);

  if (type === 'pine') {
    // 2-tier pyramidal pine/cypress canopy
    const c1 = [0.14, 0.34, 0.20];
    const c2 = [0.18, 0.40, 0.24];
    pushPyramid(pos, col, x, y + trunkH * 0.75, z, 3.2 * scale, 4.2 * scale, c1);
    pushPyramid(pos, col, x, y + trunkH * 0.75 + 2.4 * scale, z, 2.3 * scale, 3.4 * scale, c2);
  } else {
    // Broadleaf canopy (crossed octagonal crown blocks for rich 3D volume & shadows)
    const leafCol =
      type === 'ginkgo'
        ? [0.88, 0.68, 0.18] // Golden Beijing autumn Ginkgo
        : [0.22, 0.48, 0.24]; // Lush Beijing Scholar Tree (国槐)
    const leafTop =
      type === 'ginkgo'
        ? [0.95, 0.76, 0.24]
        : [0.28, 0.56, 0.28];
    const cw = 3.4 * scale;
    const ch = 2.8 * scale;
    pushColoredBox(pos, col, x, y + trunkH, z, cw, ch, cw * 0.72, leafCol);
    pushColoredBox(pos, col, x, y + trunkH + 0.2 * scale, z, cw * 0.72, ch, cw, leafCol);
    pushColoredBox(pos, col, x, y + trunkH + ch * 0.75, z, cw * 0.62, ch * 0.55, cw * 0.62, leafTop);
  }
}

function pushPyramid(pos, col, cx, baseY, cz, width, height, rgb) {
  const hw = width * 0.5;
  const x0 = cx - hw, x1 = cx + hw;
  const z0 = cz - hw, z1 = cz + hw;
  const topY = baseY + height;
  // 4 triangular faces (counter-clockwise outward)
  pos.push(
    x0, baseY, z1, x1, baseY, z1, cx, topY, cz,
    x1, baseY, z1, x1, baseY, z0, cx, topY, cz,
    x1, baseY, z0, x0, baseY, z0, cx, topY, cz,
    x0, baseY, z0, x0, baseY, z1, cx, topY, cz
  );
  for (let i = 0; i < 12; i++) {
    col.push(rgb[0], rgb[1], rgb[2]);
  }
}

/**
 * Generates batched 3D trees along urban boulevards, inside OSM parks, and on Beijing mountain slopes.
 */
function buildVegetation(cx, cz, ox, oz, data, roadSegments, buildingColliders, vegGroup, mats, isPointInWater) {
  const pos = [];
  const col = [];
  let treeCount = 0;
  const MAX_CHUNK_TREES = 420;

  // Build 10x10 chunk-local spatial grid (100m x 100m cells) for fast building & road rejection
  const GRID_N = 10;
  const bldgBuckets = Array.from({ length: GRID_N * GRID_N }, () => []);
  const roadBuckets = Array.from({ length: GRID_N * GRID_N }, () => []);
  const toCell = (localCoord) => Math.max(0, Math.min(GRID_N - 1, Math.floor((localCoord + 500.0) * 0.01)));

  for (let i = 0; i < buildingColliders.length; i++) {
    const b = buildingColliders[i];
    const gx0 = toCell(b.minX - ox - 2.0);
    const gx1 = toCell(b.maxX - ox + 2.0);
    const gz0 = toCell(b.minZ - oz - 2.0);
    const gz1 = toCell(b.maxZ - oz + 2.0);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        bldgBuckets[gz * GRID_N + gx].push(b);
      }
    }
  }

  for (let i = 0; i < roadSegments.length; i++) {
    const s = roadSegments[i];
    const hw = s.width * 0.5 + 1.8;
    const gx0 = toCell(Math.min(s.x1, s.x2) - ox - hw);
    const gx1 = toCell(Math.max(s.x1, s.x2) - ox + hw);
    const gz0 = toCell(Math.min(s.z1, s.z2) - oz - hw);
    const gz1 = toCell(Math.max(s.z1, s.z2) - oz + hw);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        roadBuckets[gz * GRID_N + gx].push(s);
      }
    }
  }

  const isInsideBuilding = (wx, wz) => {
    const cellIdx = toCell(wz - oz) * GRID_N + toCell(wx - ox);
    const list = bldgBuckets[cellIdx];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (wx >= b.minX - 2.0 && wx <= b.maxX + 2.0 && wz >= b.minZ - 2.0 && wz <= b.maxZ + 2.0) {
        return true;
      }
    }
    return false;
  };

  const isOnRoad = (wx, wz) => {
    const cellIdx = toCell(wz - oz) * GRID_N + toCell(wx - ox);
    const list = roadBuckets[cellIdx];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const hw = s.width * 0.5 + 1.8;
      if (
        wx < Math.min(s.x1, s.x2) - hw ||
        wx > Math.max(s.x1, s.x2) + hw ||
        wz < Math.min(s.z1, s.z2) - hw ||
        wz > Math.max(s.z1, s.z2) + hw
      ) {
        continue;
      }
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const len2 = vx * vx + vz * vz;
      if (len2 < 0.05) continue;
      const t = Math.max(0, Math.min(1, ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2));
      const dx = wx - (s.x1 + vx * t), dz = wz - (s.z1 + vz * t);
      if (dx * dx + dz * dz <= hw * hw) return true;
    }
    return false;
  };

  // 0. Real OSM `natural=tree` nodes extracted from beijing.osm.pbf
  for (const ot of data.osm_trees || []) {
    if (treeCount >= MAX_CHUNK_TREES) break;
    const [lx, lz, isNeedle] = ot;
    const wx = ox + lx;
    const wz = oz + lz;
    if (isInsideBuilding(wx, wz)) continue;
    if (isPointInWater && isPointInWater(lx, lz, 2.5)) continue;
    if (isOnRoad(wx, wz)) continue;
    const ty = getBeijingTerrainElevation(wx, wz);
    const seed = ((Math.round(wx * 10) * 73856093) ^ (Math.round(wz * 10) * 19349663)) >>> 0;
    const scale = 0.9 + (seed % 40) / 100.0;
    const tType = isNeedle ? 'pine' : seed % 6 === 0 ? 'ginkgo' : 'scholar';
    pushTreeGeometry(pos, col, lx, ty, lz, scale, tType);
    treeCount++;
  }

  // 1. Street Boulevard Trees (行道树 along primary/secondary/tertiary/residential roads)
  for (let i = 0; i < roadSegments.length; i += 2) {
    if (treeCount >= MAX_CHUNK_TREES) break;
    const s = roadSegments[i];
    if (s.bridge || s.tunnel) continue;
    if (s.cls !== 'primary' && s.cls !== 'secondary' && s.cls !== 'tertiary' && s.cls !== 'residential') continue;
    const dx = s.x2 - s.x1;
    const dz = s.z2 - s.z1;
    const len = Math.hypot(dx, dz);
    if (len < 18) continue;

    const nx = -dz / len;
    const nz = dx / len;
    const sideOffset = s.width * 0.5 + 2.4;

    for (let d = 10; d < len - 8; d += 26) {
      if (treeCount >= MAX_CHUNK_TREES) break;
      const t = d / len;
      const bx = s.x1 + dx * t;
      const bz = s.z1 + dz * t;
      for (const side of [-1, 1]) {
        const wx = bx + nx * sideOffset * side;
        const wz = bz + nz * sideOffset * side;
        const lx = wx - ox;
        const lz = wz - oz;
        if (lx < -490 || lx > 490 || lz < -490 || lz > 490) continue;
        if (isInsideBuilding(wx, wz)) continue;
        if (isPointInWater && isPointInWater(lx, lz, 3.5)) continue;
        if (isOnRoad(wx, wz)) continue;

        const ty = getBeijingTerrainElevation(wx, wz);
        const seed = ((Math.round(wx) * 73856093) ^ (Math.round(wz) * 19349663)) >>> 0;
        const scale = 0.85 + (seed % 35) / 100.0;
        const tType = seed % 6 === 0 ? 'ginkgo' : 'scholar';
        pushTreeGeometry(pos, col, lx, ty, lz, scale, tType);
        treeCount++;
      }
    }
  }

  // 2. Parkland Trees (OSM parks — verified inside polygon and outside lakes/rivers/roads)
  for (let pIdx = 0; pIdx < (data.parks || []).length; pIdx++) {
    if (treeCount >= MAX_CHUNK_TREES) break;
    const [, , ptype, flat] = data.parks[pIdx];
    if (!flat || flat.length < 6 || ptype === 'pitch' || ptype === 'stadium' || ptype === 'square') continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < flat.length; k += 2) {
      const x = flat[k], z = flat[k + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const area = (maxX - minX) * (maxZ - minZ);
    const numParkTrees = Math.min(36, Math.max(3, Math.floor(area / 950)));
    for (let t = 0; t < numParkTrees; t++) {
      if (treeCount >= MAX_CHUNK_TREES) break;
      const seed = ((pIdx * 101 + t * 313 + cx * 17 + cz * 29) * 2654435761) >>> 0;
      const lx = minX + ((seed & 0xffff) / 65535.0) * (maxX - minX);
      const lz = minZ + (((seed >> 16) & 0xffff) / 65535.0) * (maxZ - minZ);
      if (lx < -490 || lx > 490 || lz < -490 || lz > 490) continue;
      if (!pointInRing2D(lx, lz, flat)) continue;
      if (isPointInWater && isPointInWater(lx, lz, 4.0)) continue;
      const wx = ox + lx, wz = oz + lz;
      if (isInsideBuilding(wx, wz) || isOnRoad(wx, wz)) continue;
      const ty = getBeijingTerrainElevation(wx, wz);
      const scale = 0.9 + (seed % 45) / 100.0;
      const tType = seed % 3 === 0 ? 'pine' : seed % 7 === 0 ? 'ginkgo' : 'scholar';
      pushTreeGeometry(pos, col, lx, ty, lz, scale, tType);
      treeCount++;
    }
  }

  // 3. Mountain & Hill Forest Canopy (Jingshan Hill, Longevity Hill, Western Hills / Fragrant Hills)
  for (let gx = -440; gx <= 440; gx += 65) {
    for (let gz = -440; gz <= 440; gz += 65) {
      if (treeCount >= MAX_CHUNK_TREES) break;
      const seed = (((cx * 37 + cz * 71 + gx * 13 + gz * 29) * 1597334677) >>> 0);
      const jx = gx + ((seed % 41) - 20);
      const jz = gz + (((seed >> 8) % 41) - 20);
      if (isPointInWater && isPointInWater(jx, jz, 5.0)) continue;
      const wx = ox + jx;
      const wz = oz + jz;
      const ty = getBeijingTerrainElevation(wx, wz);
      // Require actual hill elevation (> 22m) or hillside slope (> 0.055) so flat Haidian plains/lakes (~6m) aren't treated as hills
      if (ty < 22.0) {
        const slopeX = Math.abs(getBeijingTerrainElevation(wx + 35, wz) - getBeijingTerrainElevation(wx - 35, wz)) / 70.0;
        const slopeZ = Math.abs(getBeijingTerrainElevation(wx, wz + 35) - getBeijingTerrainElevation(wx, wz - 35)) / 70.0;
        if (Math.hypot(slopeX, slopeZ) < 0.055) continue;
      }
      if (isInsideBuilding(wx, wz) || isOnRoad(wx, wz)) continue;
      const scale = 1.0 + (seed % 55) / 100.0;
      const tType = seed % 5 === 0 ? 'ginkgo' : 'pine';
      pushTreeGeometry(pos, col, jx, ty, jz, scale, tType);
      treeCount++;
    }
  }

  if (pos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(col), 3, true));
    finalizeAndReleaseGeometry(geom, true);
    const mesh = new THREE.Mesh(geom, mats.vegetationMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    vegGroup.add(mesh);
  }
}

function buildFacilities(facilities, ox, oz, facGroup, mats) {
  const pos = [];
  const col = [];

  for (const f of facilities) {
    const [ftype, lx, ly, lz] = f;
    if (STREET_OWNS_LANE_MARKINGS && (ftype === 'tl' || ftype === 'cr' || ftype === 'mj')) continue; // [feature/street] replaced by street furniture
    const y = getBeijingTerrainElevation(ox + lx, oz + lz) + (ly || 0);

    if (ftype === 'tl') {
      pushColoredBox(pos, col, lx, y, lz, 0.25, 5.2, 0.25, [0.28, 0.31, 0.35]);
      pushColoredBox(pos, col, lx + 1.1, y + 4.9, lz, 2.2, 0.35, 0.35, [0.22, 0.24, 0.28]);
      pushColoredBox(pos, col, lx + 1.8, y + 4.9, lz + 0.2, 0.4, 0.4, 0.2, [0.15, 0.92, 0.35]);
      pushColoredBox(pos, col, lx + 1.2, y + 4.9, lz + 0.2, 0.4, 0.4, 0.2, [0.95, 0.22, 0.22]);
    } else if (ftype === 'mj') {
      pushColoredBox(pos, col, lx, y, lz, 0.35, 6.2, 0.35, [0.55, 0.58, 0.62]);
      pushColoredBox(pos, col, lx, y + 5.6, lz, 4.2, 1.5, 0.25, [0.04, 0.48, 0.24]);
    } else if (ftype === 'se' || ftype === 'st') {
      pushColoredBox(pos, col, lx, y, lz, 3.2, 2.8, 2.2, [0.18, 0.35, 0.58]);
      pushColoredBox(pos, col, lx, y + 2.8, lz, 3.6, 0.3, 2.6, [0.05, 0.58, 0.88]);
    } else if (ftype === 'bs') {
      pushColoredBox(pos, col, lx, y, lz, 2.6, 2.4, 0.9, [0.65, 0.22, 0.22]);
    } else if (ftype === 'cr') {
      pushColoredBox(pos, col, lx, y + 0.08, lz, 1.6, 0.08, 0.45, [0.90, 0.92, 0.95]);
    }
  }

  if (pos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(col), 3, true));
    finalizeAndReleaseGeometry(geom, true);
    const mesh = new THREE.Mesh(geom, mats.facilityMat);
    mesh.castShadow = true;
    facGroup.add(mesh);
  }
}

function pushQuad(arr, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) {
  arr.push(
    x1, y1, z1, x2, y2, z2, x3, y3, z3,
    x1, y1, z1, x3, y3, z3, x4, y4, z4
  );
}

function pushBox(arr, cx, minY, cz, w, h, d) {
  const hw = w * 0.5, hd = d * 0.5;
  const x0 = cx - hw, x1 = cx + hw;
  const z0 = cz - hd, z1 = cz + hd;
  const y0 = minY, y1 = minY + h;
  pushQuad(arr, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
  pushQuad(arr, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0);
  pushQuad(arr, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
  pushQuad(arr, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1);
  pushQuad(arr, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
}

// [elevated-roads] chunk-border vertex heights shared between neighbouring chunks (per world origin; bounded)
let _seamStore = null, _seamOrigin = '';
function seamHeightStore(worldOrigin) {
  const tag = worldOrigin ? `${worldOrigin.centerLat},${worldOrigin.centerLon}` : '';
  if (!_seamStore || _seamOrigin !== tag) { _seamStore = new Map(); _seamOrigin = tag; }
  if (_seamStore.size > 400000) {
    let n = _seamStore.size - 300000; // drop the oldest entries (chunks long since built)
    for (const k of _seamStore.keys()) { _seamStore.delete(k); if (--n <= 0) break; }
  }
  return _seamStore;
}

// [elevated-roads] suspension bridges without a landmark model. Vector tiles carry no bridge:structure tag, so the
// type comes from this table: stations along the deck axis (metres from `c`, axis = unit [east, north]) are cable
// anchorages ('anchor', cable ends on the deck), towers, or a mid-bridge anchorage pier ('center'). Heights ASL.
const SUSPENSION_BRIDGES = [
  { // San Francisco-Oakland Bay Bridge, West Spans: two end-to-end suspension bridges sharing the centre anchorage
    c: [37.79819, -122.37786], axis: [0.648, 0.762], half: 17, towerTop: 150, deckTop: 59, sag: 64, centerTop: 78,
    rgb: [0.70, 0.73, 0.76], leg: [6, 4.6],
    stations: [[-1412, 'anchor'], [-1058, 'tower'], [-354, 'tower'], [0, 'center'], [354, 'tower'], [1058, 'tower'], [1412, 'anchor']],
  },
  { // Brooklyn Bridge: granite towers (OSM maps them as 83 m buildings), 486 m main span, 283 m side spans
    c: [40.705685, -73.99635], axis: [0.689, -0.724], half: 13, towerTop: 83, deckTop: null, sag: null, centerTop: 0,
    rgb: [0.76, 0.70, 0.60], leg: [12, 10], masonry: true,
    stations: [[-526, 'anchor'], [-243, 'tower'], [243, 'tower'], [526, 'anchor']],
  },
];

function addSuspensionStructures(ox, oz, worldOrigin, isPointInWater, pushColoredBox, pos, col, pushCableBeam, roadSegments) {
  const inChunk = (x, z) => x >= -500 && x < 500 && z >= -500 && z < 500;
  // highest bridge-deck surface within 30 m of a chunk-local point (null if none)
  const deckNear = (x, z) => {
    let y = null;
    const wx = x + ox, wz = z + oz;
    for (const sg of roadSegments) {
      if (!sg.bridge) continue;
      const vx = sg.x2 - sg.x1, vz = sg.z2 - sg.z1, L2 = vx * vx + vz * vz || 1;
      let t = ((wx - sg.x1) * vx + (wz - sg.z1) * vz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(sg.x1 + vx * t - wx, sg.z1 + vz * t - wz) > 30) continue;
      const yy = sg.y1 + (sg.y2 - sg.y1) * t;
      if (y === null || yy > y) y = yy;
    }
    return y;
  };
  for (const B0 of SUSPENSION_BRIDGES) {
    let B = B0;
    const bx = (B.c[1] - worldOrigin.centerLon) * worldOrigin.mPerDegLon - ox;
    const bz = (worldOrigin.centerLat - B.c[0]) * worldOrigin.mPerDegLat - oz;
    const span = B.stations[B.stations.length - 1][0] - B.stations[0][0];
    if (Math.abs(bx) > 500 + span || Math.abs(bz) > 500 + span) continue;
    const ax = B.axis[0], az = -B.axis[1]; // world z points south
    const px = -az * B.half, pz = ax * B.half; // lateral offset to the cable planes
    const at = (d) => [bx + ax * d, bz + az * d];
    if (B.deckTop === null) {
      // deck height from the rendered road (mid-span), so suspenders land on it
      const dy = deckNear(...at(0));
      if (dy === null) continue;
      B = { ...B, deckTop: dy, sag: dy + 3 };
    }
    const topOf = (kind) => (kind === 'tower' ? B.towerTop : kind === 'center' ? B.centerTop : B.deckTop + 2);
    const steel = B.rgb, dark = [B.rgb[0] * 0.8, B.rgb[1] * 0.8, B.rgb[2] * 0.82], concrete = [0.62, 0.63, 0.64];
    // towers, centre anchorage
    for (const [d, kind] of B.stations) {
      const [tx, tz] = at(d);
      if (!inChunk(tx, tz) || kind === 'anchor') continue;
      const wet = !isPointInWater || isPointInWater(tx, tz, 0);
      const base = wet ? -3 : 0;
      if (kind === 'center') {
        pushColoredBox(pos, col, tx, base, tz, 34, B.deckTop - 9 - base, 34, concrete); // pier under both decks
        for (const sd of [-1, 1]) pushColoredBox(pos, col, tx + px * sd, B.deckTop - 9, tz + pz * sd, 7, B.centerTop - B.deckTop + 9, 7, concrete);
        pushCableBeam(tx - px, B.centerTop - 3, tz - pz, tx + px, B.centerTop - 3, tz + pz, 2.2, concrete);
        continue;
      }
      pushColoredBox(pos, col, tx, base, tz, 2 * B.half + 10, 11 - base, 16, concrete); // caisson cap at the waterline
      const [w0, w1] = B.leg;
      for (const sd of [-1, 1]) {
        const lx = tx + px * sd * (B.masonry ? 1.25 : 1), lz = tz + pz * sd * (B.masonry ? 1.25 : 1);
        pushColoredBox(pos, col, lx, 8, lz, w0, B.deckTop + 6 - 8, w0, steel); // legs taper above the deck
        pushColoredBox(pos, col, lx, B.deckTop + 6, lz, w1, B.towerTop - B.deckTop - 6, w1, steel);
        pushColoredBox(pos, col, lx, B.towerTop, lz, w1 + 0.8, 2.2, w1 + 0.8, dark); // cable saddle / cornice
      }
      if (B.masonry) {
        // solid granite block over the deck with the two pointed-arch openings implied by the legs
        const top = B.towerTop - 2, lintel = B.deckTop + (B.towerTop - B.deckTop) * 0.55;
        pushCableBeam(tx - px * 1.25, (lintel + top) * 0.5, tz - pz * 1.25, tx + px * 1.25, (lintel + top) * 0.5, tz + pz * 1.25, (top - lintel) * 0.5, steel);
      } else {
        for (const y of [B.deckTop - 22, B.deckTop + 18, B.deckTop + 44, B.deckTop + 70, B.towerTop - 2]) {
          if (y < B.towerTop && y > 9) pushCableBeam(tx - px, y, tz - pz, tx + px, y, tz + pz, 1.5, steel);
        }
      }
    }
    // main cables (parabolic between stations) + suspenders down to the upper deck, emitted where each piece's midpoint lies
    for (let k = 0; k + 1 < B.stations.length; k++) {
      const [d0, k0] = B.stations[k], [d1, k1] = B.stations[k + 1];
      const y0 = topOf(k0), y1 = topOf(k1), L = d1 - d0;
      const main = k0 === 'tower' && k1 === 'tower';
      const yAt = (u) => (main ? B.sag + (y0 - B.sag) * (2 * u - 1) ** 2 : y0 + (y1 - y0) * u - Math.min(28, L * 0.07) * 4 * u * (1 - u));
      const n = Math.max(4, Math.ceil(L / 15));
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const [x0, z0] = at(d0 + L * u0), [x1, z1] = at(d0 + L * u1);
        if (!inChunk((x0 + x1) * 0.5, (z0 + z1) * 0.5)) continue;
        for (const sd of [-1, 1]) {
          pushCableBeam(x0 + px * sd, yAt(u0), z0 + pz * sd, x1 + px * sd, yAt(u1), z1 + pz * sd, 0.55, dark);
          const yc = yAt(u1), yd = B.deckTop + 1.2;
          if (i + 1 < n && yc > yd + 2) pushColoredBox(pos, col, x1 + px * sd, yd, z1 + pz * sd, 0.22, yc - yd, 0.22, dark);
        }
      }
    }
  }
}

// [elevated-roads] OSM maps bridge piers / anchorages / towers as `building` (Bay Bridge centre anchorage: a 67 m
// "office block" the deck runs through; Brooklyn Bridge's shore tower). A building in or beside the water (40 m)
// that a road deck runs through is bridge structure, not a building: drop it (the bridge renderer draws piers).
function dropBuildingsOnBridgeDecks(buildings, roadSegments, isPointInWater, ox, oz) {
  if (!isPointInWater || !buildings.length) return buildings;
  const decks = [];
  for (const s of roadSegments) {
    if (!s.bridge || s.cls === 'footway' || s.cls === 'cycleway' || s.cls === 'pedestrian' || s.cls === 'steps' || s.cls === 'path') continue;
    decks.push(s);
  }
  if (!decks.length) return buildings;
  return buildings.filter((b) => {
    const ring = b[11];
    if (!ring || ring.length < 6) return true;
    let sx = 0, sz = 0;
    const n = ring.length >> 1;
    for (let k = 0; k < ring.length; k += 2) { sx += ring[k]; sz += ring[k + 1]; }
    const bx = sx / n, bz = sz / n;
    let wet = isPointInWater(bx, bz, 0);
    for (let k = 0; k < 8 && !wet; k++) wet = isPointInWater(bx + Math.cos(k * 0.785) * 40, bz + Math.sin(k * 0.785) * 40, 0);
    if (!wet) return true;
    let r2 = 0;
    for (let k = 0; k < ring.length; k += 2) r2 = Math.max(r2, (ring[k] - bx) ** 2 + (ring[k + 1] - bz) ** 2);
    const br = Math.sqrt(r2), wx = bx + ox, wz = bz + oz;
    for (const s of decks) {
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1, L2 = vx * vx + vz * vz || 1;
      let t = ((wx - s.x1) * vx + (wz - s.z1) * vz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(s.x1 + vx * t - wx, s.z1 + vz * t - wz) < br * 0.7 + (s.width || 6) * 0.5) return false;
    }
    return true;
  });
}

// [elevated-roads] box of length `len` along unit (ux, uz), depth `dep` across it, from minY up h
function pushOrientedBox(arr, cx, minY, cz, ux, uz, len, dep, h) {
  const ax = ux * len * 0.5, az = uz * len * 0.5, bx = -uz * dep * 0.5, bz = ux * dep * 0.5;
  const p = [[cx - ax - bx, cz - az - bz], [cx + ax - bx, cz + az - bz], [cx + ax + bx, cz + az + bz], [cx - ax + bx, cz - az + bz]];
  const y0 = minY, y1 = minY + h;
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % 4];
    pushQuad(arr, x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
  }
  pushQuad(arr, p[0][0], y1, p[0][1], p[1][0], y1, p[1][1], p[2][0], y1, p[2][1], p[3][0], y1, p[3][1]);
  pushQuad(arr, p[0][0], y0, p[0][1], p[3][0], y0, p[3][1], p[2][0], y0, p[2][1], p[1][0], y0, p[1][1]);
}

function pushColoredBox(pos, col, cx, minY, cz, w, h, d, rgb) {
  const startLen = pos.length;
  pushBox(pos, cx, minY, cz, w, h, d);
  const addedVerts = (pos.length - startLen) / 3;
  for (let i = 0; i < addedVerts; i++) {
    col.push(rgb[0], rgb[1], rgb[2]);
  }
}

/**
 * Builds a glowing 3D wireframe/surface highlight mesh for a clicked OSM entity.
 */
export function buildEntityHighlightMesh(entity) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x56b6c2,
    wireframe: true,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });

  if (entity.kind === 'building') {
    const pts = [];
    const f = entity.flatOuter;
    const tY = entity.terrainY || 0;
    const minH = tY + (entity.minHeight || 0);
    const h = tY + (entity.height || 10) + 0.25;
    for (let i = 0; i < f.length; i += 2) {
      const x1 = f[i], z1 = f[i + 1];
      const x2 = f[(i + 2) % f.length], z2 = f[(i + 3) % f.length];
      pushQuad(pts, x1, minH, z1, x2, minH, z2, x2, h, z2, x1, h, z1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(entity.ox, 0, entity.oz);
    mesh.renderOrder = 999;
    group.add(mesh);
  } else if (entity.kind === 'road') {
    const pts = [];
    const f = entity.flat;
    const hw = Math.max(1.5, (entity.width || 6) * 0.55);
    for (let i = 0; i < f.length - 3; i += 3) {
      const x1 = f[i], z1 = f[i + 2];
      const y1 = getBeijingTerrainElevation(entity.ox + x1, entity.oz + z1) + f[i + 1] + 0.55;
      const x2 = f[i + 3], z2 = f[i + 5];
      const y2 = getBeijingTerrainElevation(entity.ox + x2, entity.oz + z2) + f[i + 4] + 0.55;
      const dx = x2 - x1, dz = z2 - z1;
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * hw, nz = (dx / l) * hw;
      pushQuad(pts, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz, x2 - nx, y2, z2 - nz, x2 + nx, y2, z2 + nz);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(entity.ox, 0, entity.oz);
    mesh.renderOrder = 999;
    group.add(mesh);
  }
  return group;
}

const WORKER_DUMMY_MATS = {
  terrainMat: { name: 'terrainMat' },
  parkMat: { name: 'parkMat' },
  waterMat: { name: 'waterMat' },
  roadMat: { name: 'roadMat' },
  markingMat: { name: 'markingMat' },
  bridgeStructMat: { name: 'bridgeStructMat' },
  railMat: { name: 'railMat' },
  wfcBldgMat: { name: 'wfcBldgMat' },
  roofMat: { name: 'roofMat' },
  vegetationMat: { name: 'vegetationMat' },
  facilityMat: { name: 'facilityMat' },
  streetDecalMat: { name: 'streetDecalMat' },
  poiGlassMat: { name: 'poiGlassMat' }, poiGlowMat: { name: 'poiGlowMat' }, // [venues-poi]
};

/**
 * Computes all chunk geometry and vertex normals inside a Web Worker and returns a transferable payload
 * along with its flat ArrayBuffer transfer list.
 */
export function computeChunkWorkerPayload(cx, cz, ox, oz, data, worldOrigin = null) {
  const root = buildChunkMeshGroup(cx, cz, ox, oz, data, WORKER_DUMMY_MATS, null, worldOrigin);
  const meshPayloads = [];
  const transferSet = new Set();

  for (const [groupKey, subGroup] of Object.entries(root.userData.subGroups)) {
    for (const mesh of subGroup.children) {
      const geom = mesh.geometry;
      if (!geom || !geom.attributes.position) continue;
      if (!geom.attributes.normal) {
        geom.computeVertexNormals();
      }
      const posArr = geom.attributes.position.array;
      const normArr = geom.attributes.normal ? geom.attributes.normal.array : null;
      const colAttr = geom.attributes.color;
      const colArr = colAttr ? colAttr.array : null;
      const colNorm = colAttr ? Boolean(colAttr.normalized) : false;
      const uvArr = geom.attributes.uv ? geom.attributes.uv.array : null;
      const idxArr = geom.index ? geom.index.array : null;
      const kBidArr = geom.attributes.kBid ? geom.attributes.kBid.array : null; // [kaiju]
      if (kBidArr?.buffer) transferSet.add(kBidArr.buffer); // [kaiju]

      if (posArr?.buffer) transferSet.add(posArr.buffer);
      if (normArr?.buffer) transferSet.add(normArr.buffer);
      if (colArr?.buffer) transferSet.add(colArr.buffer);
      if (uvArr?.buffer) transferSet.add(uvArr.buffer);
      if (idxArr?.buffer) transferSet.add(idxArr.buffer);

      meshPayloads.push({
        groupKey,
        matKey: mesh.material?.name || 'roadMat',
        castShadow: Boolean(mesh.castShadow),
        receiveShadow: Boolean(mesh.receiveShadow),
        posArr,
        normArr,
        colArr,
        colNorm,
        uvArr,
        idxArr,
        kBidArr, // [kaiju]
        roofLod: mesh.userData.roofLod || null, // [roofs] near-LOD detail mesh
      });
    }
  }

  // [feature/traffic] worker-side lane graph for AI cars & pedestrians
  // [integration] signals come from street's visible lights (street suppresses the 'tl' facilities)
  const trafficGraph = buildTrafficGraph(root.userData.roadSegments, root.userData.street ? root.userData.street.signalNodes : null, ox, oz);
  for (const b of trafficGraphBuffers(trafficGraph)) transferSet.add(b);

  return {
    payload: {
      cx,
      cz,
      ox,
      oz,
      meshPayloads,
      roadSegments: root.userData.roadSegments,
      buildingColliders: root.userData.buildingColliders,
      roadEntities: root.userData.roadEntities,
      buildingEntities: root.userData.buildingEntities,
      trafficGraph, // [feature/traffic]
      street: root.userData.street || null, // [feature/street]
      vegInstances: vegInstancesForTransfer(root.userData.vegInstances, transferSet), // [feature/vegetation]
      places: root.userData.places || null, // feature/places
      rail: root.userData.rail || null, // [feature/rail-transit]
      venues: root.userData.venues || null, // [venues]
      poiVenues: poiVenuesTransfer(root.userData.poiVenues, transferSet), // [venues-poi]
      waterMask: waterMaskTransfer(root.userData.waterMask, transferSet), // fix/water
      deckSegments: root.userData.deckSegments || [], // fix/water
      roadGrid: roadGridTransfer(buildRoadGrid(root.userData.roadSegments, root.userData.deckSegments), transferSet), // fix/water
    },
    transferList: (collectPlacesTransfer(root.userData.places, transferSet), Array.from(transferSet)), // feature/places
  };
}

/**
 * Reassembles a `THREE.Group` chunk on the main thread from pre-computed Web Worker TypedArrays in < 0.2ms.
 */
export function assembleChunkFromWorkerPayload(payload, mats, layerVisibility) {
  const { cx, cz, ox, oz, meshPayloads, roadSegments, buildingColliders, roadEntities, buildingEntities } = payload;
  const root = new THREE.Group();
  root.position.set(ox, 0, oz);
  root.name = `chunk_${cx}_${cz}`;

  const subGroups = {
    terrain: new THREE.Group(),
    roads: new THREE.Group(),
    markings: new THREE.Group(),
    bridges: new THREE.Group(),
    buildings: new THREE.Group(),
    vegetation: new THREE.Group(),
    railways: new THREE.Group(),
    facilities: new THREE.Group(),
  };

  for (const [k, g] of Object.entries(subGroups)) {
    if (layerVisibility && k in layerVisibility) {
      g.visible = Boolean(layerVisibility[k]);
    }
    root.add(g);
  }

  for (const m of meshPayloads) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(m.posArr, 3));
    if (m.normArr) {
      geom.setAttribute('normal', new THREE.BufferAttribute(m.normArr, 3));
    }
    if (m.colArr) {
      geom.setAttribute('color', new THREE.BufferAttribute(m.colArr, 3, m.colNorm));
    }
    if (m.uvArr) {
      geom.setAttribute('uv', new THREE.BufferAttribute(m.uvArr, 2));
    }
    if (m.idxArr) {
      geom.setIndex(new THREE.BufferAttribute(m.idxArr, 1));
    }
    if (m.kBidArr) geom.setAttribute('kBid', new THREE.BufferAttribute(m.kBidArr, 1)); // [kaiju]
    finalizeAndReleaseGeometry(geom, !m.normArr, m.groupKey === 'terrain' || m.groupKey === 'roads');
    const mat = mats[m.matKey] || mats.roadMat;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = m.castShadow;
    mesh.receiveShadow = m.receiveShadow;
    if (m.kBidArr && mats.wfcBldgDepthMat) mesh.customDepthMaterial = mats.wfcBldgDepthMat; // [kaiju]
    if (subGroups[m.groupKey]) {
      subGroups[m.groupKey].add(m.roofLod ? wrapRoofLod(mesh, m.roofLod) : mesh); // [roofs]
    }
  }

  root.userData = {
    cx,
    cz,
    ox,
    oz,
    subGroups,
    roadSegments: roadSegments || [],
    buildingColliders: buildingColliders || [],
    roadEntities: roadEntities || [],
    buildingEntities: buildingEntities || [],
    trafficGraph: payload.trafficGraph || null, // [feature/traffic]
    street: payload.street || null, // [feature/street]
    vegInstances: payload.vegInstances || null, // [feature/vegetation]
    places: payload.places || null, // feature/places
    rail: payload.rail || null, // [feature/rail-transit]
    venues: payload.venues || null, // [venues]
    poiVenues: payload.poiVenues || null, // [venues-poi]
    waterMask: payload.waterMask || null, // fix/water
    deckSegments: payload.deckSegments || [], // fix/water
    roadGrid: payload.roadGrid !== undefined ? payload.roadGrid : undefined, // fix/water (built lazily if absent)
  };

  return root;
}

// [feature/vegetation] Adds the vegetation instance buffers to the worker transfer list.
function vegInstancesForTransfer(v, transferSet) {
  if (!v) return null;
  if (v.inst?.buffer) transferSet.add(v.inst.buffer);
  if (v.species?.buffer) transferSet.add(v.species.buffer);
  return v;
}

/**
 * Class A Memory Optimization: Picks the closest 3D OSM building, landmark, or road under the pointer ray
 * using mathematical polygon/segment ray-casting without retaining `triEntityIdx` or CPU geometry arrays.
 */
export function pickEntityByMathRay(rayOrigin, rayDir, loadedChunks) {
  const ox = rayOrigin.x, oy = rayOrigin.y, oz = rayOrigin.z;
  const dx = rayDir.x, dy = rayDir.y, dz = rayDir.z;
  let bestT = 3500.0;
  let bestEntity = null;
  let bestPoint = null;

  // 1. Check the 40 landmarks first
  for (const lm of LANDMARKS_40) {
    const groundY = getBeijingTerrainElevation(lm.cx, lm.cz);
    const h = lm.height || 56;
    const r = Math.max(16, (lm.exclR || 55) * 0.58);
    const minX = lm.cx - r, maxX = lm.cx + r;
    const minZ = lm.cz - r, maxZ = lm.cz + r;
    const minY = groundY, maxY = groundY + h;
    const tHit = intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ);
    if (tHit !== null && tHit < bestT) {
      bestT = tHit;
      bestPoint = new THREE.Vector3(ox + dx * tHit, oy + dy * tHit, oz + dz * tHit);
      bestEntity = {
        kind: 'building',
        id: lm.osmIds?.[0] || lm.id,
        name: lm.nameZh,
        nameEn: lm.nameEn,
        btype: 'landmark',
        levels: Math.max(1, Math.round(h / 3.8)),
        height: h,
        minHeight: 0,
        terrainY: groundY,
        cx: lm.cx,
        cz: lm.cz,
        ox: lm.cx,
        oz: lm.cz,
        flatOuter: [-r * 0.7, -r * 0.7, r * 0.7, -r * 0.7, r * 0.7, r * 0.7, -r * 0.7, r * 0.7],
      };
    }
  }

  for (const chunkGroup of loadedChunks.values()) {
    const ud = chunkGroup.userData;
    if (!ud) continue;
    // Quick chunk AABB cull
    const cMinX = ud.ox - 60, cMaxX = ud.ox + 1060;
    const cMinZ = ud.oz - 60, cMaxZ = ud.oz + 1060;
    const tChunk = intersectRayAABB(ox, oy, oz, dx, dy, dz, cMinX, -50, cMinZ, cMaxX, 950, cMaxZ);
    if (tChunk === null || tChunk > bestT) continue;

    // 2. Check chunk buildings
    for (const b of ud.buildingEntities || []) {
      const f = b.flatOuter;
      if (!f || f.length < 6) continue;
      let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
      for (let i = 0; i < f.length; i += 2) {
        const x = b.ox + f[i], z = b.oz + f[i + 1];
        if (x < bMinX) bMinX = x;
        if (x > bMaxX) bMaxX = x;
        if (z < bMinZ) bMinZ = z;
        if (z > bMaxZ) bMaxZ = z;
      }
      const y0 = (b.terrainY || 0) + (b.minHeight || 0);
      const y1 = (b.terrainY || 0) + (b.height || 10);
      const tBox = intersectRayAABB(ox, oy, oz, dx, dy, dz, bMinX, y0, bMinZ, bMaxX, y1, bMaxZ);
      if (tBox === null || tBox >= bestT) continue;

      // Test roof plane y = y1
      if (Math.abs(dy) > 1e-5) {
        const tRoof = (y1 - oy) / dy;
        if (tRoof > 0 && tRoof < bestT) {
          const hx = ox + dx * tRoof - b.ox;
          const hz = oz + dz * tRoof - b.oz;
          if (pointInRing2D(hx, hz, f)) {
            bestT = tRoof;
            bestEntity = b;
            bestPoint = new THREE.Vector3(ox + dx * tRoof, y1, oz + dz * tRoof);
          }
        }
      }

      // Test vertical wall segments
      for (let i = 0; i < f.length; i += 2) {
        const x1 = b.ox + f[i], z1 = b.oz + f[i + 1];
        const x2 = b.ox + f[(i + 2) % f.length], z2 = b.oz + f[(i + 3) % f.length];
        const ex = x2 - x1, ez = z2 - z1;
        const det = dx * ez - dz * ex;
        if (Math.abs(det) < 1e-6) continue;
        const rx = x1 - ox, rz = z1 - oz;
        const tRay = (rx * ez - rz * ex) / det;
        if (tRay <= 0 || tRay >= bestT) continue;
        const sEdge = (rx * dz - rz * dx) / det;
        if (sEdge < 0 || sEdge > 1) continue;
        const hy = oy + dy * tRay;
        if (hy >= y0 && hy <= y1) {
          bestT = tRay;
          bestEntity = b;
          bestPoint = new THREE.Vector3(ox + dx * tRay, hy, oz + dz * tRay);
        }
      }
    }

    // 3. Check chunk roads
    for (const r of ud.roadEntities || []) {
      const f = r.flat;
      if (!f || f.length < 6) continue;
      const hw = Math.max(2.6, (r.width || 8) * 0.55);
      const hw2 = hw * hw;
      for (let i = 0; i < f.length - 3; i += 3) {
        const x1 = r.ox + f[i], z1 = r.oz + f[i + 2];
        const y1 = getBeijingTerrainElevation(x1, z1) + f[i + 1] + 0.5;
        const x2 = r.ox + f[i + 3], z2 = r.oz + f[i + 5];
        const y2 = getBeijingTerrainElevation(x2, z2) + f[i + 4] + 0.5;
        const midY = (y1 + y2) * 0.5;
        if (Math.abs(dy) < 1e-5) continue;
        const tPlane = (midY - oy) / dy;
        if (tPlane <= 0 || tPlane >= bestT) continue;
        const hx = ox + dx * tPlane;
        const hz = oz + dz * tPlane;
        const vx = x2 - x1, vz = z2 - z1;
        const len2 = vx * vx + vz * vz;
        const u = len2 > 1e-4 ? Math.max(0, Math.min(1, ((hx - x1) * vx + (hz - z1) * vz) / len2)) : 0;
        const dist2 = (hx - (x1 + vx * u)) ** 2 + (hz - (z1 + vz * u)) ** 2;
        if (dist2 <= hw2) {
          bestT = tPlane;
          bestEntity = r;
          bestPoint = new THREE.Vector3(hx, midY, hz);
        }
      }
    }
  }

  return bestEntity ? { entity: bestEntity, point: bestPoint, distance: bestT } : null;
}

function intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) > 1e-8) {
    const t1 = (minX - ox) / dx;
    const t2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (ox < minX || ox > maxX) {
    return null;
  }
  if (Math.abs(dy) > 1e-8) {
    const t1 = (minY - oy) / dy;
    const t2 = (maxY - oy) / dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oy < minY || oy > maxY) {
    return null;
  }
  if (Math.abs(dz) > 1e-8) {
    const t1 = (minZ - oz) / dz;
    const t2 = (maxZ - oz) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oz < minZ || oz > maxZ) {
    return null;
  }
  if (tmax < 0 || tmin > tmax) return null;
  return tmin >= 0 ? tmin : tmax;
}
