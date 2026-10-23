/**
 * Road-surface spatial index: a per-chunk uniform grid (CSR typed arrays, worker-built and
 * transferable) over the chunk's road segments plus synthetic bridge-deck fill segments, so
 * sampleRoadSurface only tests the handful of segments near the query point.
 */

const CELL = 24.0;
const MAX_DIM = 96; // cells per axis cap (cell size grows for unusually large chunks)

/** Lateral capture half-width used by sampleRoadSurface (unchanged from the original linear scan). */
export function captureHalfWidth(s) {
  return s.deck ? s.width * 0.5 + 1.0 : s.width * 0.75 + 3.4;
}

/** Builds the grid over `segs` followed by `decks` (combined index space). */
export function buildRoadGrid(segs, decks) {
  const all = decks && decks.length ? segs.concat(decks) : segs;
  if (!all.length) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const s of all) {
    const hw = captureHalfWidth(s);
    minX = Math.min(minX, s.x1 - hw, s.x2 - hw); maxX = Math.max(maxX, s.x1 + hw, s.x2 + hw);
    minZ = Math.min(minZ, s.z1 - hw, s.z2 - hw); maxZ = Math.max(maxZ, s.z1 + hw, s.z2 + hw);
  }
  const cell = Math.max(CELL, (maxX - minX) / MAX_DIM, (maxZ - minZ) / MAX_DIM);
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const counts = new Int32Array(nx * nz + 1);
  const ranges = new Int32Array(all.length * 4);
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const hw = captureHalfWidth(s);
    const c0 = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - hw - minX) / cell));
    const c1 = Math.min(nx - 1, Math.floor((Math.max(s.x1, s.x2) + hw - minX) / cell));
    const r0 = Math.max(0, Math.floor((Math.min(s.z1, s.z2) - hw - minZ) / cell));
    const r1 = Math.min(nz - 1, Math.floor((Math.max(s.z1, s.z2) + hw - minZ) / cell));
    ranges[i * 4] = c0; ranges[i * 4 + 1] = c1; ranges[i * 4 + 2] = r0; ranges[i * 4 + 3] = r1;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) counts[r * nx + c + 1]++;
  }
  for (let k = 1; k <= nx * nz; k++) counts[k] += counts[k - 1];
  const items = new Int32Array(counts[nx * nz]);
  const fill = counts.slice(0, nx * nz);
  for (let i = 0; i < all.length; i++) {
    const c0 = ranges[i * 4], c1 = ranges[i * 4 + 1], r0 = ranges[i * 4 + 2], r1 = ranges[i * 4 + 3];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[fill[r * nx + c]++] = i;
  }
  return { minX, minZ, cell, nx, nz, start: counts, items, nSegs: segs.length };
}

export function roadGridTransfer(g, transferSet) {
  if (g) { transferSet.add(g.start.buffer); transferSet.add(g.items.buffer); }
  return g;
}

/**
 * Drop-in replacement for the 3x3-chunk linear scan in sampleRoadSurface (same scoring, same
 * tunnel skip, same "ride on the highest overlapping surface" rule), plus bridge-deck fill segments.
 */
export function sampleRoadSurfaceIndexed(app, wx, wy, wz) {
  const [cx, cz] = app.worldToChunk(wx, wz);
  let bestSeg = null, bestScore = Infinity, bestY = 0;
  let nc = 0;
  const cand = _cand;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
      const ud = chunk && chunk.userData;
      if (!ud || !ud.roadSegments) continue;
      let g = ud.roadGrid;
      if (g === undefined || (g && g.src && g.src !== ud.roadSegments)) {
        g = ud.roadGrid = buildRoadGrid(ud.roadSegments, ud.deckSegments || null);
      }
      if (!g) continue;
      const c = Math.floor((wx - g.minX) / g.cell), r = Math.floor((wz - g.minZ) / g.cell);
      if (c < 0 || r < 0 || c >= g.nx || r >= g.nz) continue;
      const k = r * g.nx + c;
      const segs = ud.roadSegments, decks = ud.deckSegments;
      for (let j = g.start[k], e = g.start[k + 1]; j < e; j++) {
        const i = g.items[j];
        const s = i < g.nSegs ? segs[i] : decks[i - g.nSegs];
        if (!s || s.tunnel) continue;
        const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
        const len2 = vx * vx + vz * vz;
        if (len2 < 0.05) continue;
        let t = ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.x1 + vx * t, pz = s.z1 + vz * t;
        const distH = Math.hypot(wx - px, wz - pz);
        if (distH > captureHalfWidth(s)) continue;
        const segY = s.y1 + (s.y2 - s.y1) * t;
        const signedDy = segY - wy;
        // Multi-level underpass vs. overpass physical law: never snap an entity on the lower road
        // up onto an overhead bridge deck (> 2.2m above wy); stay on bridge if wy >= segY - 2.6m.
        if (s.bridge ? (signedDy > 2.2 || signedDy < -3.6) : (Math.abs(signedDy) > 3.6)) continue;
        const dy = Math.abs(signedDy);
        cand[nc++] = segY;
        const score = distH + dy * 2.5;
        if (score < bestScore) { bestScore = score; bestSeg = s; bestY = segY; }
      }
    }
  }
  if (!bestSeg) return bridgeGapFallback(app, wx, wy, wz, cx, cz);
  let surfaceY = bestY;
  for (let i = 0; i < nc; i++) {
    if (Math.abs(cand[i] - bestY) <= 1.2 && cand[i] > surfaceY) surfaceY = cand[i];
  }
  if (bestSeg.deck && bestSeg.ref) bestSeg = bestSeg.ref; // report the real road (name/layer) for HUD
  return { y: surfaceY + 0.07, seg: bestSeg };
}
const _cand = new Float64Array(4096);

const GAP_REACH = 16.0; // metres beyond a bridge way's edge
/**
 * Over water only: wide bridges mapped as several narrow ways at inconsistent heights (Pont d'Iena,
 * Pont Alexandre III) leave holes between the ways. If nothing carries the point but a bridge deck
 * at or just below the body (never above: no popping up from underneath) lies within GAP_REACH of
 * its edge, ride on the highest such deck instead of dropping into the river.
 */
function bridgeGapFallback(app, wx, wy, wz, cx, cz) {
  if (!app.water || !app.water.isPointInWater(wx, wz)) return null;
  let best = null, bestY = -Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
      const ud = chunk && chunk.userData;
      if (!ud || !ud.roadSegments) continue;
      const g = ud.roadGrid;
      if (!g) continue;
      const reach = GAP_REACH + 12;
      const c0 = Math.max(0, Math.floor((wx - reach - g.minX) / g.cell)), c1 = Math.min(g.nx - 1, Math.floor((wx + reach - g.minX) / g.cell));
      const r0 = Math.max(0, Math.floor((wz - reach - g.minZ) / g.cell)), r1 = Math.min(g.nz - 1, Math.floor((wz + reach - g.minZ) / g.cell));
      const segs = ud.roadSegments, decks = ud.deckSegments;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const k = r * g.nx + c;
        for (let j = g.start[k], e = g.start[k + 1]; j < e; j++) {
          const i = g.items[j];
          const s = i < g.nSegs ? segs[i] : decks[i - g.nSegs];
          if (!s || !s.bridge || s.tunnel) continue;
          const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
          const len2 = vx * vx + vz * vz;
          if (len2 < 0.05) continue;
          const tr = ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2;
          if (tr < -0.05 || tr > 1.05) continue; // beside the way, not past its ends
          const t = tr < 0 ? 0 : tr > 1 ? 1 : tr;
          const d = Math.hypot(wx - (s.x1 + vx * t), wz - (s.z1 + vz * t));
          if (d > s.width * 0.5 + GAP_REACH) continue;
          const segY = s.y1 + (s.y2 - s.y1) * t;
          if (segY > wy + 0.6 || segY < wy - 4.0) continue;
          if (segY > bestY) { bestY = segY; best = s; }
        }
      }
    }
  }
  if (!best) return null;
  return { y: bestY + 0.07, seg: best.deck && best.ref ? best.ref : best };
}

/**
 * Queries the lowest overhead bridge deck & underside soffit slab directly above (wx, wy, wz).
 * Returns { deckY, soffitY, seg } or null if no elevated bridge spans over (wx, wz).
 */
export function sampleBridgeUndersideAt(app, wx, wy, wz) {
  const [cx, cz] = app.worldToChunk(wx, wz);
  let bestSeg = null, bestDeckY = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
      const ud = chunk && chunk.userData;
      if (!ud || !ud.roadSegments) continue;
      let g = ud.roadGrid;
      if (g === undefined || (g && g.src && g.src !== ud.roadSegments)) {
        g = ud.roadGrid = buildRoadGrid(ud.roadSegments, ud.deckSegments || null);
      }
      if (!g) continue;
      const c = Math.floor((wx - g.minX) / g.cell), r = Math.floor((wz - g.minZ) / g.cell);
      if (c < 0 || r < 0 || c >= g.nx || r >= g.nz) continue;
      const k = r * g.nx + c;
      const segs = ud.roadSegments, decks = ud.deckSegments;
      for (let j = g.start[k], e = g.start[k + 1]; j < e; j++) {
        const i = g.items[j];
        const s = i < g.nSegs ? segs[i] : decks[i - g.nSegs];
        if (!s || !s.bridge || s.tunnel) continue;
        const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
        const len2 = vx * vx + vz * vz;
        if (len2 < 0.05) continue;
        let t = ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2;
        if (t < 0 || t > 1) continue;
        const px = s.x1 + vx * t, pz = s.z1 + vz * t;
        const distH = Math.hypot(wx - px, wz - pz);
        if (distH > (s.width || 6.0) * 0.5 + 0.8) continue;
        const segY = s.y1 + (s.y2 - s.y1) * t;
        if (segY > wy + 2.2 && segY < bestDeckY) {
          bestDeckY = segY;
          bestSeg = s;
        }
      }
    }
  }
  if (!bestSeg) return null;
  return { deckY: bestDeckY + 0.07, soffitY: bestDeckY - 0.85, seg: bestSeg };
}
