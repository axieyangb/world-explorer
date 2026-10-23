import * as THREE from '../vendor/three.module.js';
import { buildTrafficGraph, trafficGraphBuffers } from './features/traffic_graph.js'; // [feature/traffic] lane graph
import { appendPolyShoreUv, appendRibbonShoreUv } from './features/water_shore.js'; // feature/atmosphere
import { buildWaterMask, waterMaskTransfer } from './features/water_physics.js'; // fix/water
import { buildBridgeDecks, levelWaterBridgeRawYs, collectMajorBridgeWays } from './features/bridge_deck.js'; // fix/water
import { buildRoadGrid, roadGridTransfer } from './features/road_grid.js'; // fix/water
import {
  getBeijingTerrainElevation,
  getChunkTerrainMeshElevation,
  buildChunkTerrainMesh,
  buildChunkTerrainArrays,
} from './environment.js';
import { appendCompactChunkBuildingWFC, FACADE_CATALOG, DOOR_CATALOG, resolveRegionTag } from './wfc/wfc_mesh_builder.js';
import { computeStreetFeatures } from './features/street_worker.js'; // [feature/street]
const STREET_OWNS_LANE_MARKINGS = true; // [feature/street] lane lines/crosswalks drawn by features/street_worker.js
import { buildVegetationLayer } from './features/vegetation_worker.js'; // [feature/vegetation]
import { computePlacesPayload, collectPlacesTransfer } from './features/places_worker.js'; // feature/places
import { kaijuPatchBuildingShader, kaijuCreateBuildingDepthMaterial, kaijuBidAttribute } from './features/kaiju/kaiju_destruction.js'; // [kaiju]
import {
  LANDMARKS_40,
  matchLandmarkForChunkBuilding,
} from './landmarks_40.js';

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
      '/assets/facades/facade_strip.jpg';
    const maskSrc =
      (typeof window !== 'undefined' && window.__EMBEDDED_FACADE_MASK_STRIP__) ||
      '/assets/facades/facade_mask_strip.jpg';

    const [rgbImg, maskImg] = await Promise.all([
      loadImageElement(stripSrc),
      loadImageElement(maskSrc),
    ]);

    const S = 512;
    const N = Math.max(1, Math.round(rgbImg.height / S));
    const totalH = S * N;

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
    for (let layer = 0; layer < N; layer++) {
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
        '/assets/doors/door_strip.jpg';
      const doorMaskSrc =
        (typeof window !== 'undefined' && window.__EMBEDDED_DOOR_MASK_STRIP__) ||
        '/assets/doors/door_mask_strip.jpg';
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
  });

  const fallbackFacadeArray = createFallbackFacadeArrayTexture();
  const fallbackDoorArray = createFallbackDoorArrayTexture();
  const wfcNightUniforms = {
    uNightEmissive: { value: 0.08 },
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
    shader.uniforms.uFacadeArray = wfcNightUniforms.uFacadeArray;
    shader.uniforms.uDoorArray = wfcNightUniforms.uDoorArray;
    shader.vertexShader =
      'varying float vEmissive;\nvarying vec2 vFacadeUv;\nvarying vec3 vWorldNorm;\n' +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvEmissive = step(1.5, length(objectNormal));\nobjectNormal = normalize(objectNormal);\nvFacadeUv = uv;\nvWorldNorm = objectNormal;'
      );
    shader.fragmentShader =
      'uniform float uNightEmissive;\nuniform mediump sampler2DArray uFacadeArray;\nuniform mediump sampler2DArray uDoorArray;\nvarying float vEmissive;\nvarying vec2 vFacadeUv;\nvarying vec3 vWorldNorm;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vFacadeUv.y >= 0.5 && abs(vWorldNorm.y) < 0.45 && vFacadeUv.x >= 23999.5) {
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
          float texLayer = clamp(floor((vFacadeUv.x + 0.5) / 1000.0), 0.0, 23.0);
          float uRep = max(0.0, vFacadeUv.x - texLayer * 1000.0);
          float vRep = max(0.0, vFacadeUv.y - 1.0);

          vec4 texSample = texture(uFacadeArray, vec3(uRep, vRep, texLayer));
          vec3 facadeRgb = texSample.rgb;
          float rawAlpha = texSample.a;
          float winMask = smoothstep(0.22, 0.56, rawAlpha);
          float nightLevel = clamp((uNightEmissive - 0.15) / 1.15, 0.0, 1.0);

          // Pure photographic AI facade albedo modulated by subtle per-building tint, vertical AO & analytical sky reflection on glass
          vec3 baseAlbedo = facadeRgb * diffuseColor.rgb * 1.08;
          vec3 skyRefl = mix(vec3(0.54, 0.68, 0.84), vec3(0.08, 0.13, 0.22), nightLevel);
          diffuseColor.rgb = mix(baseAlbedo, mix(baseAlbedo * 1.15, skyRefl, 0.24), winMask);

          // Screen-space micro-bump normal relief on masonry/mullions (fades smoothly at distance)
          float lum = dot(facadeRgb, vec3(0.299, 0.587, 0.114));
          float dLx = clamp(dFdx(lum), -0.08, 0.08);
          float dLy = clamp(dFdy(lum), -0.08, 0.08);
          float uvGrad = max(fwidth(uRep), fwidth(vRep));
          float bumpFade = 1.0 - smoothstep(0.04, 0.24, uvGrad);
          normal = normalize(normal + vec3(-dLx, -dLy, 0.0) * (1.75 * bumpFade * (1.0 - 0.65 * winMask)));

          // Keep metalness moderate so Three.js PBR without envMap never crushes shaded street-canyon glass to black
          float isCurtain = (texLayer < 2.5 || abs(texLayer - 5.0) < 0.5 || abs(texLayer - 22.0) < 0.5) ? 1.0 : 0.0;
          roughnessFactor = mix(mix(0.78, 0.42, isCurtain), 0.16, winMask);
          metalnessFactor = mix(mix(0.04, 0.16, isCurtain), 0.20, winMask);

          // Per-window interior lighting strictly at sunset and night (0 at noon)
          if (nightLevel > 0.001 && winMask > 0.02) {
            float isRetail = (abs(texLayer - 17.0) < 0.5 || abs(texLayer - 22.0) < 0.5) ? 1.0 : 0.0;
            float gridBays = (
              abs(texLayer - 6.0) < 0.5 || abs(texLayer - 15.0) < 0.5 ||
              abs(texLayer - 17.0) < 0.5 || abs(texLayer - 18.0) < 0.5 ||
              abs(texLayer - 20.0) < 0.5 || abs(texLayer - 21.0) < 0.5 ||
              abs(texLayer - 22.0) < 0.5
            ) ? 3.0 : 4.0;
            float gridFloors = (isRetail > 0.5) ? 1.0 : (
              (abs(texLayer - 15.0) < 0.5 || abs(texLayer - 21.0) < 0.5 || abs(texLayer - 23.0) < 0.5) ? 2.0 : (
                (abs(texLayer - 6.0) < 0.5 || abs(texLayer - 19.0) < 0.5) ? 3.0 : 4.0
              )
            );
            vec2 winGrid = vec2(uRep * gridBays, vRep * gridFloors);
            vec2 winCell = floor(winGrid);
            vec2 cellFract = fract(winGrid);
            float cellEdge = smoothstep(0.0, 0.07, cellFract.x) * smoothstep(1.0, 0.93, cellFract.x) *
                             smoothstep(0.0, 0.08, cellFract.y) * smoothstep(1.0, 0.92, cellFract.y);
            float wallSeed = floor((vWorldNorm.x * 19.0 + vWorldNorm.z * 31.0) * 8.0);
            float hRoom = fract(sin(dot(winCell + vec2(texLayer * 13.0, wallSeed * 7.0), vec2(127.1, 311.7))) * 43758.5453);
            float litProb = mix(0.46 * nightLevel, 0.80 * nightLevel, isRetail);
            float isLit = step(1.0 - litProb, hRoom);

            vec3 warmAmber = vec3(1.0, 0.76, 0.38);
            vec3 coolOffice = vec3(0.72, 0.86, 1.0);
            vec3 roomCol = mix(warmAmber, coolOffice, step(0.66, fract(hRoom * 13.7)));
            vec3 interiorTex = roomCol * (0.18 + 0.82 * facadeRgb) * (0.64 + 0.36 * fract(hRoom * 7.3));
            totalEmissiveRadiance += interiorTex * winMask * cellEdge * isLit * (uNightEmissive * 0.38);
          }
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
  cycleway:       [0.32, 0.44, 0.38],
};

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
        isPointInSunkenTrench = createSunkenTrenchChecker(data.roads || []);

        // 0. 3D Heightfield Terrain Mesh for this 1km x 1km chunk (with open-trench cutouts for sunken roads)
        subGroups.terrain.add(buildChunkTerrainMesh(ox, oz, mats.terrainMat, isPointInSunkenTrench));

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
          roadEntities
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
        buildRailways(data.railways || [], ox, oz, subGroups.railways, mats);

        buildingTask = createBuildingBuildTask(
          data.buildings || [],
          ox,
          oz,
          subGroups.buildings,
          mats,
          buildingColliders,
          roadSegments,
          buildingEntities,
          regionTag
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
        // 5. 3D Vegetation (Street Boulevard Trees, Park Cypress/Pine & Western Hills Forests)
        // [feature/vegetation] Landcover ground mesh + instanced street/park/forest trees (replaces legacy buildVegetation)
        root.userData.vegInstances = buildVegetationLayer({
          cx, cz, ox, oz, data, roadSegments, isPointInWater, isPointInSunkenTrench,
          terrainGroup: subGroups.terrain,
        });

        // 6. 3D Traffic Facilities (Traffic Signals, Motorway Exit Gantries, Crosswalks, Subway/Bus Stations)
        buildFacilities(data.facilities || [], ox, oz, subGroups.facilities, mats);
        root.userData.street = computeStreetFeatures(root, data, ox, oz, worldOrigin, mats); // [feature/street]

        // feature/places: rooftop detail, POIs, airports, ships, stadiums, bridge steel, train rails
        root.userData.places = computePlacesPayload({
          data, ox, oz, buildingEntities, roadSegments, isPointInWater, groups: subGroups, mats,
        });

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
function createSunkenTrenchChecker(roads) {
  const sunkenSegs = [];
  const mainSunkenSegs = [];
  const sunkenRampSegs = [];
  const crossBridgeSegs = [];
  const allBridgeSegs = [];
  const NON_VEH = new Set(['pedestrian', 'steps', 'service']);

  for (let rIdx = 0; rIdx < (roads || []).length; rIdx++) {
    const [wid, cls, , , , widthM, , isBridge, , , flat] = roads[rIdx];
    if (!flat || flat.length < 6 || NON_VEH.has(cls)) continue;
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
      parkCol.push(...rgb, ...rgb, ...rgb);
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

  // Water polygons & river ribbons (subdivided to 32m to follow 3D DEM terrain + pure vertical (0,1,0) normals)
  const waterPos = [];
  const waterNorm = [];
  const waterUv = []; // feature/atmosphere: shore distance for the water shader
  for (let wIdx = 0; wIdx < (data.water_polys || []).length; wIdx++) {
    const wp = data.water_polys[wIdx];
    const [osmId, , flatOuter, flatHoles] = wp;
    if (!flatOuter || flatOuter.length < 6) continue;

    // Render each multi-chunk water polygon only once in its unique bbox-center owner chunk
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const contour = [];
    for (let i = 0; i < flatOuter.length; i += 2) {
      const x = flatOuter[i], z = flatOuter[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
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
    const subTris = subdivideTriangles2D(allPts, tris, 32.0);
    const wyOff = 0.28 + ((osmId || wIdx) % 19) * 0.002;
    for (let i = 0; i < subTris.length; i += 6) {
      const ax = subTris[i], az = subTris[i + 1];
      const bx = subTris[i + 2], bz = subTris[i + 3];
      const cx = subTris[i + 4], cz = subTris[i + 5];
      const ya = getBeijingTerrainElevation(ox + ax, oz + az) + wyOff;
      const yb = getBeijingTerrainElevation(ox + bx, oz + bz) + wyOff;
      const yc = getBeijingTerrainElevation(ox + cx, oz + cz) + yOffWater(wyOff);
      waterPos.push(ax, ya, az, cx, yc, cz, bx, yb, bz);
      waterNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    appendPolyShoreUv(waterUv, subTris, flatOuter, flatHoles); // feature/atmosphere
  }

  for (let lIdx = 0; lIdx < (data.water_lines || []).length; lIdx++) {
    const wl = data.water_lines[lIdx];
    const [osmId, , , widthM, flat] = wl;
    if (!flat || flat.length < 4) continue;
    const halfW = (widthM || 10) * 0.5;
    const wyOff = 0.25 + ((osmId || lIdx) % 17) * 0.002;
    for (let i = 0; i < flat.length - 2; i += 2) {
      const x1 = flat[i], z1 = flat[i + 1];
      const x2 = flat[i + 2], z2 = flat[i + 3];
      const mx = (x1 + x2) * 0.5;
      const mz = (z1 + z2) * 0.5;
      if (mx < -500.0 || mx >= 500.0 || mz < -500.0 || mz >= 500.0) continue;
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const nx = (-dz / len) * halfW;
      const nz = (dx / len) * halfW;
      const y1 = getBeijingTerrainElevation(ox + x1, oz + z1) + wyOff;
      const y2 = getBeijingTerrainElevation(ox + x2, oz + z2) + wyOff;
      waterPos.push(
        x1 + nx, y1, z1 + nz,
        x2 + nx, y2, z2 + nz,
        x2 - nx, y2, z2 - nz,
        x1 + nx, y1, z1 + nz,
        x2 - nx, y2, z2 - nz,
        x1 - nx, y1, z1 - nz
      );
      waterNorm.push(
        0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0
      );
      appendRibbonShoreUv(waterUv, halfW); // feature/atmosphere
    }
  }

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
  entityTable = []
) {
  const rPos = [];
  const rCol = [];

  const mPos = [];
  const mCol = [];

  const bPos = []; // Bridge concrete parapets, deck soffits & piers
  let majorBridgeWays = null; // fix/water: lazily collected for levelWaterBridgeRawYs

  // Pre-collect named roads in this chunk so unnamed ramps/service ways can inherit nearby road names
  const namedChunkRoads = [];
  for (let i = 0; i < roads.length; i++) {
    const [, rCls, rName, rRef, , , , , , , rFlat] = roads[i];
    const baseName = rName || rRef;
    if (baseName && rFlat && rFlat.length >= 6) {
      const midIdx = Math.floor(rFlat.length / 6) * 3;
      namedChunkRoads.push({
        name: baseName,
        cls: rCls,
        mx: rFlat[midIdx],
        mz: rFlat[midIdx + 2],
      });
    }
  }

  for (let rIdx = 0; rIdx < roads.length; rIdx++) {
    const r = roads[rIdx];
    const [wid, cls, name, ref, lanes, widthM, oneway, isBridge, isTunnel, layer, flat] = r;
    if (!flat || flat.length < 6) continue;

    let resolvedRoadName = name || ref;
    if (!resolvedRoadName) {
      const midIdx = Math.floor(flat.length / 6) * 3;
      const mx = flat[midIdx];
      const mz = flat[midIdx + 2];
      let nearestName = '';
      let bestDist = 140.0;
      for (let k = 0; k < namedChunkRoads.length; k++) {
        const nr = namedChunkRoads[k];
        const d = Math.hypot(mx - nr.mx, mz - nr.mz);
        if (d < bestDist) {
          bestDist = d;
          nearestName = nr.name;
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
    const wayHash = ((wid * 2654435761) >>> 0);
    const wayMicroBias = ((wayHash % 997) / 997.0) * 0.14;
    const yBias = (ROAD_Y_BIAS[cls] || 0.43) + wayMicroBias;
    const baseRgb = ROAD_COLORS[cls] || [0.30, 0.32, 0.36];
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
      isBridge && (cls === 'footway' || cls === 'cycleway' || cls === 'pedestrian') && !isScenicArchBridge;

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
    const bridgeLayerElev = Math.max(1, layer || 1) * 7.5;
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
      rawYs[i] = isScenicArchBridge
        ? rY
        : (isBridge || (layer || 0) >= 1)
          ? Math.max(rY, bridgeLayerElev)
          : isMinorWay
            ? Math.max(-0.8, Math.min(0.2, rY * 0.14))
            : Math.min(0.2, rY);
    }
    // fix/water: one consistent deck height for water-crossing bridges (+ no riverbed dips), while keeping >= 6.8m overpass height
    if (isBridge && isOverWater && isScenicArchBridge) {
      levelWaterBridgeRawYs(flat, rawYs, nPts, ox, oz, true, isPointInWater, getBeijingTerrainElevation,
        majorBridgeWays || (majorBridgeWays = collectMajorBridgeWays(roads)));
    }
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
      const y = terrainY + rawRoadY + yBias;
      centerPts.push([x, y, z, rawRoadY, terrainY]);

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

    let accumDist = 0;
    for (let i = 0; i < nPts - 1; i++) {
      const [origLx1, origLy1, origLz1] = leftPts[i];
      const [origRx1, origRy1, origRz1] = rightPts[i];
      const [origLx2, origLy2, origLz2] = leftPts[i + 1];
      const [origRx2, origRy2, origRz2] = rightPts[i + 1];
      const [origCx1, origCy1, origCz1, origRawY1, origTerrY1] = centerPts[i];
      const [origCx2, origCy2, origCz2, origRawY2, origTerrY2] = centerPts[i + 1];

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
        const rawY1 = origRawY1 + (origRawY2 - origRawY1) * u0;

        const cx2 = origCx1 + cdx * u1;
        const cz2 = origCz1 + cdz * u1;
        const rawY2 = origRawY1 + (origRawY2 - origRawY1) * u1;

        const isGroundSeg = !isBridge && !isTunnel && rawY1 >= -0.45 && rawY2 >= -0.45;
        const useLocalTerr = isGroundSeg || (isBridge && !isScenicArchBridge);
        const terrY1 = useLocalTerr
          ? sampleGroundTerr(cx1, cz1, lx1, lz1, rx1, rz1)
          : origTerrY1 + (origTerrY2 - origTerrY1) * u0;
        const terrY2 = useLocalTerr
          ? sampleGroundTerr(cx2, cz2, lx2, lz2, rx2, rz2)
          : origTerrY1 + (origTerrY2 - origTerrY1) * u1;

        const cy1 = useLocalTerr ? terrY1 + rawY1 + yBias : origCy1 + (origCy2 - origCy1) * u0;
        const cy2 = useLocalTerr ? terrY2 + rawY2 + yBias : origCy1 + (origCy2 - origCy1) * u1;
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
          // Left sidewalk strip
          rPos.push(
            lx1 + nx * swW, swY1, lz1 + nz * swW,
            lx2, swY2, lz2,
            lx1, swY1, lz1,
            lx1 + nx * swW, swY1, lz1 + nz * swW,
            lx2 + nx * swW, swY2, lz2 + nz * swW,
            lx2, swY2, lz2
          );
          // Right sidewalk strip
          rPos.push(
            rx1, swY1, rz1,
            rx2 - nx * swW, swY2, rz2 - nz * swW,
            rx1 - nx * swW, swY1, rz1 - nz * swW,
            rx1, swY1, rz1,
            rx2, swY2, rz2,
            rx2 - nx * swW, swY2, rz2 - nz * swW
          );
          for (let k = 0; k < 12; k++) rCol.push(swCol[0], swCol[1], swCol[2]);
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

        // Bridge 3D Structural Parapets, Unified Multi-Way Deck Seal, Box-Girder Soffit & Support Piers
        const onWater =
          isPointInWater && (isPointInWater(cx1, cz1, 0) || isPointInWater(cx2, cz2, 0));
        if (
          isScenicArchBridge ||
          ((isBridge || onWater || rawY1 > 1.5 || rawY2 > 1.5) &&
            cls !== 'pedestrian' &&
            (cls !== 'footway' || isHighPedOverpass) &&
            (cls !== 'cycleway' || isBridge))
        ) {
          const deckDepth = isScenicArchBridge ? 0.32 : 0.85;
          const railH = isScenicArchBridge ? 0.52 : cls === 'cycleway' || cls === 'footway' ? 0.52 : 0.78;
          const mx = (cx1 + cx2) * 0.5;
          const mz = (cz1 + cz2) * 0.5;
          const midRawY = (rawY1 + rawY2) * 0.5;
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

          // Only build raised concrete parapet wall on true outer edges of a multi-way bridge / Y-split ramp
          if (!hasBridgeLeft) {
            const topL1 = leftInOtherDeck ? ly1 - 0.04 : ly1 + railH;
            const topL2 = leftInOtherDeck ? ly2 - 0.04 : ly2 + railH;
            pushQuad(
              bPos,
              lx1, ly1 - deckDepth, lz1,
              lx2, ly2 - deckDepth, lz2,
              lx2, topL2, lz2,
              lx1, topL1, lz1
            );
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
            pushQuad(
              bPos,
              lx1 + nx * sealW, ly1 - deckDepth, lz1 + nz * sealW,
              lx1, ly1 - deckDepth, lz1,
              lx2, ly2 - deckDepth, lz2,
              lx2 + nx * sealW, ly2 - deckDepth, lz2 + nz * sealW
            );
          }

          if (!hasBridgeRight) {
            const topR1 = rightInOtherDeck ? ry1 - 0.04 : ry1 + railH;
            const topR2 = rightInOtherDeck ? ry2 - 0.04 : ry2 + railH;
            pushQuad(
              bPos,
              rx2, ry2 - deckDepth, rz2,
              rx1, ry1 - deckDepth, rz1,
              rx1, topR1, rz1,
              rx2, topR2, rz2
            );
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
            pushQuad(
              bPos,
              rx1, ry1 - deckDepth, rz1,
              rx1 - nx * sealW, ry1 - deckDepth, rz1 - nz * sealW,
              rx2 - nx * sealW, ry2 - deckDepth, rz2 - nz * sealW,
              rx2, ry2 - deckDepth, rz2
            );
          }

          // Solid concrete bridge deck underside soffit slab
          pushQuad(
            bPos,
            lx1, ly1 - deckDepth, lz1,
            rx1, ry1 - deckDepth, rz1,
            rx2, ry2 - deckDepth, rz2,
            lx2, ly2 - deckDepth, lz2
          );
          if (isHighPedOverpass && ((i === 0 && sStep === 0) || (i === nPts - 2 && sStep === subSteps - 1))) {
            const px = i === 0 && sStep === 0 ? cx1 : cx2;
            const pz = i === 0 && sStep === 0 ? cz1 : cz2;
            const baseTerr = i === 0 && sStep === 0 ? terrY1 : terrY2;
            const pyTop = (i === 0 && sStep === 0 ? cy1 : cy2) - deckDepth * 0.5;
            if (pyTop > baseTerr + 0.5) {
              pushBox(bPos, px, baseTerr, pz, 1.3, pyTop - baseTerr, 1.3);
            }
          } else if (
            !isHighPedOverpass &&
            !isScenicArchBridge &&
            (rawY1 + rawY2) * 0.5 > 2.8 &&
            Math.floor((subAccumDist + segLen) / 36) > Math.floor(subAccumDist / 36)
          ) {
            const px = (cx1 + cx2) * 0.5;
            const pz = (cz1 + cz2) * 0.5;
            const baseTerr = (terrY1 + terrY2) * 0.5;
            const pyTop = (cy1 + cy2) * 0.5 - deckDepth * 0.5;
            const pw = Math.min(1.4, widthM * 0.16);
            if (pyTop > baseTerr + 0.5) {
              pushBox(bPos, px, baseTerr, pz, pw, pyTop - baseTerr, pw);
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

  if (rPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(toUint8Colors(rCol), 3, true));
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

function createBuildingBuildTask(buildings, ox, oz, bldgGroup, mats, buildingColliders, roadSegments = [], entityTable = [], regionTag = 'beijing') {
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
    });
  }
  const getEdgeGroundY = (lx, lz) => getBeijingTerrainElevation(ox + lx, oz + lz);

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
        const c00 = getBeijingTerrainElevation(ox + minX, oz + minZ);
        const c10 = getBeijingTerrainElevation(ox + maxX, oz + minZ);
        const c01 = getBeijingTerrainElevation(ox + minX, oz + maxZ);
        const c11 = getBeijingTerrainElevation(ox + maxX, oz + maxZ);
        const minCornerY = Math.min(terrainY, c00, c10, c01, c11);
        // Deterministic per-building/part micro-offsets prevent coplanar Z-fighting between parent `building` and nested `building:part`
        const bHash = (((osmId * 2654435761) ^ (i * 1597334677)) >>> 0);
        const hMicroOffset = (isPart ? 0.22 : 0.0) + ((bHash % 509) / 509.0) * 0.24;
        const wallOutOffset = (isPart ? 0.08 : 0.0) + (((bHash >> 9) % 257) / 257.0) * 0.06;
        // Extend foundation below the lowest downhill footprint corner on hills so sloped buildings never float
        const minH =
          rawMinH > 0
            ? terrainY + rawMinH + (isPart ? 0.05 : 0.0)
            : minCornerY < terrainY - 0.15
              ? minCornerY - 1.5
              : terrainY - (terrainY > 1.5 ? 2.2 : 0.05);
        const h = terrainY + rawH + hMicroOffset;

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

        const matchedLm = matchLandmarkForChunkBuilding(wx, wz, osmId);
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
          minHeight: rawMinH,
          levels: lvl,
          style,
          colour: bColour,
          holesCount: holes.length,
          flatOuter,
          minX: minX + ox,
          maxX: maxX + ox,
          minZ: minZ + oz,
          maxZ: maxZ + oz,
          baseY: minH,
          topY: h,
          ox,
          oz,
          terrainY,
        };
        entityTable.push(entityRecord);

        let overlapsExistingBldg = false;
        if (rawMinH <= 2.0) { // fix/water: include ground-level parts (tiles flag any min_height > 0 as a part)
          const curMinX = minX + ox, curMaxX = maxX + ox;
          const curMinZ = minZ + oz, curMaxZ = maxZ + oz;
          const curArea = Math.max(1.0, (curMaxX - curMinX) * (curMaxZ - curMinZ));
          for (let cIdx = 0; !isPart && cIdx < buildingColliders.length; cIdx++) { // [integration] entrances' duplicate-footprint filter: whole buildings only
            const bc = buildingColliders[cIdx];
            const ix = Math.max(0.0, Math.min(curMaxX, bc.maxX) - Math.max(curMinX, bc.minX));
            const iz = Math.max(0.0, Math.min(curMaxZ, bc.maxZ) - Math.max(curMinZ, bc.minZ));
            const interArea = ix * iz;
            const bcArea = Math.max(1.0, (bc.maxX - bc.minX) * (bc.maxZ - bc.minZ));
            if (interArea > 0.32 * Math.min(curArea, bcArea)) {
              overlapsExistingBldg = true;
              break;
            }
          }
          buildingColliders.push({
            minX: curMinX,
            maxX: curMaxX,
            minZ: curMinZ,
            maxZ: curMaxZ,
            h,
            flatOuter,
            ox,
            oz,
            id: osmId,
          });
        }

        // Skip generic WFC extrusion if this footprint belongs to one of the 40 bespoke Beijing 3D landmarks
        if (matchedLm || (overlapsExistingBldg && !isPart)) {
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
            minHeight: rawMinH,
            levels: lvl,
            style,
            colour: bColour,
            flatOuter: normFlatOuter,
            flatHoles: normFlatHoles,
            wx,
            wz,
            baseY: minH,
            topY: h,
            groundY: terrainY,
            getEdgeGroundY,
            localRoads,
            wallOutOffset,
            region: regionTag,
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
      subGroups[m.groupKey].add(mesh);
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
