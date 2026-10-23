/**
 * World Explorer - 40 Authentic Beijing Landmarks Aggregator
 *
 * Imports modularized landmark definitions (BATCH_01 through BATCH_10)
 * and LandmarkGeometryBuilder, providing spatial matching and batch geometry generation.
 */

import { LandmarkGeometryBuilder } from './landmarks_core.js';
import { getBeijingTerrainElevation, getBeijingDemState } from './environment.js';

import { BATCH_01 } from './landmarks/batch_01.js';
import { BATCH_02 } from './landmarks/batch_02.js';
import { BATCH_03 } from './landmarks/batch_03.js';
import { BATCH_04 } from './landmarks/batch_04.js';
import { BATCH_05 } from './landmarks/batch_05.js';
import { BATCH_06 } from './landmarks/batch_06.js';
import { BATCH_07 } from './landmarks/batch_07.js';
import { BATCH_08 } from './landmarks/batch_08.js';
import { BATCH_09 } from './landmarks/batch_09.js';
import { BATCH_10 } from './landmarks/batch_10.js';
import { LANDMARKS as NEW_LANDMARKS } from './features/landmarks/registry.js'; // feature/beijing-landmarks

// feature/beijing-landmarks: old entries re-built in the new landmark system (src/features/landmarks) are
// dropped here so every landmark renders / collides / suppresses OSM buildings in exactly one system.
export const REPLACED_BY_NEW_SYSTEM = new Set(NEW_LANDMARKS.filter((l) => l.on).flatMap((l) => l.replaces || []));

export const LANDMARKS_40 = [
  ...BATCH_01,
  ...BATCH_02,
  ...BATCH_03,
  ...BATCH_04,
  ...BATCH_05,
  ...BATCH_06,
  ...BATCH_07,
  ...BATCH_08,
  ...BATCH_09,
  ...BATCH_10,
].filter((lm) => !REPLACED_BY_NEW_SYSTEM.has(lm.id));

const OSM_ID_TO_LANDMARK = new Map();
for (const lm of LANDMARKS_40) {
  if (Array.isArray(lm.osmIds)) {
    for (const id of lm.osmIds) {
      OSM_ID_TO_LANDMARK.set(Number(id), lm);
    }
  }
}

/**
 * Matches a chunk building footprint against the 40 authentic Beijing landmarks
 * by OSM way/relation ID or spatial exclusion radius (`exclR`).
 */
export function matchLandmarkForChunkBuilding(cx, cz, osmId) {
  const dem = getBeijingDemState();
  if (dem && dem.isBeijing === false) return null;
  if (osmId != null) {
    const byId = OSM_ID_TO_LANDMARK.get(Number(osmId));
    if (byId) return byId;
  }
  for (let i = 0; i < LANDMARKS_40.length; i++) {
    const lm = LANDMARKS_40[i];
    if (Math.hypot(cx - lm.cx, cz - lm.cz) < lm.exclR) {
      return lm;
    }
  }
  return null;
}

/**
 * Builds typed geometry buffers (`positions`, `normals`, `colors`, `indices`)
 * for a single landmark `lm` at optional `groundY`.
 */
export function buildLandmarkGeometryArrays(lm, groundY = 0) {
  const getElev =
    typeof groundY === 'number'
      ? () => groundY
      : typeof groundY === 'function'
        ? groundY
        : getBeijingTerrainElevation;
  const b = new LandmarkGeometryBuilder();
  const y0 = typeof groundY === 'number' ? groundY : (getElev ? getElev(lm.cx, lm.cz) : 0);
  lm.build(b, lm.cx, y0, lm.cz);
  return b.toGeometryArrays();
}

/**
 * Builds all 40 Beijing landmarks into a single shared-vertex indexed buffer set
 * (`positions`, `normals`, `colors`, `indices`).
 */
export function buildAllLandmarksGeometryArrays(getElevationAt = null) {
  const elevFn = getElevationAt || getBeijingTerrainElevation;
  const b = new LandmarkGeometryBuilder();
  for (let i = 0; i < LANDMARKS_40.length; i++) {
    const lm = LANDMARKS_40[i];
    const y0 = elevFn ? elevFn(lm.cx, lm.cz) : 0;
    if (elevFn && y0 > 1.5) {
      const r = Math.min((lm.exclR || 40) * 0.45, 22);
      const minSlopeY = Math.min(
        y0,
        elevFn(lm.cx - r, lm.cz - r),
        elevFn(lm.cx + r, lm.cz - r),
        elevFn(lm.cx - r, lm.cz + r),
        elevFn(lm.cx + r, lm.cz + r),
        elevFn(lm.cx, lm.cz + r),
        elevFn(lm.cx, lm.cz - r)
      );
      if (y0 - minSlopeY > 0.35) {
        const subH = y0 - minSlopeY + 2.2;
        b.addFrustumBox(lm.cx, y0 - subH, lm.cz, r * 2.1, r * 2.1, r * 1.85, r * 1.85, subH + 0.05, [132, 136, 142], false, 0, 0);
      }
    }
    lm.build(b, lm.cx, y0, lm.cz);
  }
  return b.toGeometryArrays();
}
