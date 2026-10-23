/**
 * [release-6-integ] Keep road-bridge carriageways clear of OSM buildings standing on the deck.
 * Tower Bridge (London) maps its towers / pier blocks as buildings whose footprints straddle the roadway,
 * so they were extruded as solid blocks across the deck and walled off traffic. For every building whose
 * footprint contains >= 2 centreline samples of a vehicle bridge way (layer >= 1):
 *   - parts entirely below the deck or above the clearance window are untouched (piers, high walkways);
 *   - pier blocks rising from below are trimmed to just under the deck;
 *   - low blocks sitting on the deck are dropped;
 *   - tall parts (towers) start above the clearance window instead (an arch over the road, no collider).
 * Array indices are preserved (dropped entries get a null footprint, which the builder skips), so a custom
 * landmark model can still replace these OSM buildings later.
 */
const NON_VEHICLE = new Set(['footway', 'pedestrian', 'cycleway', 'path', 'steps', 'track', 'bridleway']);
const CLEARANCE = 5.5; // m of free height kept above the deck surface

function inRing(px, pz, f) {
  let inside = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * @param buildings chunk building tuples ([4] rawH, [5] rawMinH, [3] isPart, [11] flatOuter chunk-local)
 * @param roadSegments world-space road segments ({x1,y1,z1,x2,y2,z2,bridge,layer,cls})
 * @param terrainAt (wx, wz) => ground height
 * @returns the same array when nothing overlaps, else a copy with adjusted tuples
 */
export function clearBridgeDeckBuildings(buildings, ox, oz, roadSegments, terrainAt) {
  const decks = [];
  for (const s of roadSegments || []) if (s && s.bridge && (s.layer || 0) >= 1 && !NON_VEHICLE.has(s.cls)) decks.push(s);
  if (!decks.length || !buildings || !buildings.length) return buildings;
  let out = null;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const f = b && b[11];
    if (!f || f.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < f.length; k += 2) {
      if (f[k] < x0) x0 = f[k];
      if (f[k] > x1) x1 = f[k];
      if (f[k + 1] < z0) z0 = f[k + 1];
      if (f[k + 1] > z1) z1 = f[k + 1];
    }
    let hits = 0, deckY = -Infinity;
    for (const s of decks) {
      const sx1 = s.x1 - ox, sz1 = s.z1 - oz, sx2 = s.x2 - ox, sz2 = s.z2 - oz;
      if (Math.max(sx1, sx2) < x0 || Math.min(sx1, sx2) > x1 || Math.max(sz1, sz2) < z0 || Math.min(sz1, sz2) > z1) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(sx2 - sx1, sz2 - sz1) / 2));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (!inRing(sx1 + (sx2 - sx1) * t, sz1 + (sz2 - sz1) * t, f)) continue;
        hits++;
        deckY = Math.max(deckY, s.y1 + (s.y2 - s.y1) * t);
      }
    }
    if (hits < 2) continue;
    const terr = terrainAt(ox + (x0 + x1) * 0.5, oz + (z0 + z1) * 0.5);
    const rawH = b[4], rawMinH = b[5];
    const base = rawMinH > 0 ? terr + rawMinH : terr - 2;
    const top = terr + rawH;
    const clearTop = deckY + CLEARANCE;
    if (top <= deckY - 0.3 || base >= clearTop) continue;
    const nb = b.slice();
    if (top <= clearTop + 2) {
      const trimmed = deckY - 0.8 - terr; // builder adds <= 0.46 m micro offset on top
      if (base < deckY - 1 && trimmed > Math.max(0, rawMinH) + 0.5) nb[4] = Math.round(trimmed * 10) / 10;
      else nb[11] = null; // low block on the deck: drop
    } else {
      nb[5] = Math.round((clearTop - terr) * 10) / 10; // tower: open an arch over the carriageway
      nb[3] = 1;
    }
    if (!out) out = buildings.slice();
    out[i] = nb;
  }
  return out || buildings;
}
