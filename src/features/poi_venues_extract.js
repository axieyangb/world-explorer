// [venues-poi] Everyday venues, worker stage 1 (runs inside fetchGlobalChunkData via venues.js extractVenues).
// Finds the OSM footprints that the generic extruder would turn into solid blocks but that a venue model replaces:
//   - fuel canopies (building=roof over the forecourt: a low rectangle under / next to an amenity=fuel POI),
//   - multi-storey car parks (amenity=parking POI inside a mid-rise footprint),
// records them in chunk-local coordinates for poi_venues.js (stage 3) and drops them from `buildings`.
// No environment.js import here: global_tiles -> venues -> environment would be an import cycle.

const CHUNK_HALF = 500;

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a) * 0.5;
}
function centroidOf(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}
function inPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
/** Minimum-area enclosing rectangle: centre, unit long axis (ux, uz), half length hl >= half width hw. */
export function minRectOf(pts) {
  const h = hull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    let ux = b[0] - a[0], uz = b[1] - a[1];
    const l = Math.hypot(ux, uz);
    if (l < 1e-6) continue;
    ux /= l; uz /= l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of h) {
      const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (!best || ar < best.ar) {
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      best = { ar, cx: uc * ux - vc * uz, cz: uc * uz + vc * ux, ux, uz, hl: (u1 - u0) / 2, hw: (v1 - v0) / 2 };
    }
  }
  if (best && best.hw > best.hl) {
    const { ux, uz, hl, hw } = best;
    best.ux = -uz; best.uz = ux; best.hl = hw; best.hw = hl;
  }
  return best;
}
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * @param {Array<Object>} tiles decoded MVT layers
 * @param {(lat:number, lon:number) => [number, number]} toLocalXZ chunk-local projection
 * @param {Array} buildings chunk building records (mutated: canopy / garage footprints removed)
 * @returns {{canopies: Array<Object>, garages: Array<Object>}}
 */
export function extractPoiVenueSites(tiles, toLocalXZ, buildings) {
  const fuel = [], parking = [];
  const seen = new Set();
  for (const t of tiles) {
    for (const f of t.poi || []) {
      if (f.type !== 1) continue;
      const cls = f.tags.class, sub = f.tags.subclass;
      const isFuel = cls === 'fuel' && sub !== 'charging_station';
      const isPark = cls === 'parking' && sub === 'parking';
      if (!isFuel && !isPark) continue;
      for (const g of f.geom) {
        const p = Array.isArray(g[0]) ? g[0] : g;
        const [x, z] = toLocalXZ(p[0], p[1]);
        if (Math.abs(x) > CHUNK_HALF + 80 || Math.abs(z) > CHUNK_HALF + 80) continue;
        const k = `${cls}|${Math.round(x / 3)}|${Math.round(z / 3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        (isFuel ? fuel : parking).push([x, z]);
      }
    }
  }
  const canopies = [], garages = [];
  if (!fuel.length && !parking.length) return { canopies, garages };

  // Fuel canopies: the tile building layer (not only this chunk's buildings) so the chunk that owns the POI sees a
  // canopy whose centroid falls just across the chunk border.
  if (fuel.length) {
    const cands = [];
    const seenB = new Set();
    for (const t of tiles) {
      for (const f of t.building || []) {
        if (f.type !== 3) continue;
        const h = Number(f.tags.render_height) || 0, mh = Number(f.tags.render_min_height) || 0;
        if (mh > 0.5 || h > 9.5) continue;
        for (const poly of f.geom) {
          const o = poly.outer;
          if (!o || o.length < 3 || o.length > 14) continue;
          const pts = o.map((q) => toLocalXZ(q[0], q[1]));
          const [cx, cz] = centroidOf(pts);
          if (Math.abs(cx) > CHUNK_HALF + 120 || Math.abs(cz) > CHUNK_HALF + 120) continue;
          const key = `${Math.round(cx * 2)},${Math.round(cz * 2)}`;
          if (seenB.has(key)) continue;
          seenB.add(key);
          const a = ringArea(pts);
          if (a < 40 || a > 1500) continue;
          cands.push({ pts, cx, cz, a, h });
        }
      }
    }
    for (const [px, pz] of fuel) {
      let best = null, bd = Infinity;
      for (const c of cands) {
        const d = Math.hypot(c.cx - px, c.cz - pz);
        if (d > 22) continue;
        const inside = inPoly(px, pz, c.pts);
        if (!inside && d > 10) continue;
        const rect = minRectOf(c.pts);
        if (!rect || c.a < 0.78 * rect.ar || rect.hw < 2.6 || rect.hl > 30) continue; // a plain rectangle, not an L-shaped shop
        const score = d - (inside ? 6 : 0);
        if (score < bd) { bd = score; best = { c, rect }; }
      }
      if (!best) continue;
      const { c, rect } = best;
      if (canopies.some((q) => Math.hypot(q.cx - rect.cx, q.cz - rect.cz) < 2)) continue;
      canopies.push({ px: r1(px), pz: r1(pz), cx: r1(rect.cx), cz: r1(rect.cz), ux: r3(rect.ux), uz: r3(rect.uz), hl: r1(rect.hl), hw: r1(rect.hw), h: r1(c.h), a: Math.round(c.a) });
    }
  }

  const drop = new Set();
  if (buildings && buildings.length) {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const fo = b && b[11];
      if (!fo || fo.length < 6) continue;
      const pts = [];
      for (let k = 0; k < fo.length; k += 2) pts.push([fo[k], fo[k + 1]]);
      const n = pts.length - (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? 1 : 0);
      const ring = pts.slice(0, n);
      const [cx, cz] = centroidOf(ring);
      if (canopies.length && !(b[5] > 0.5)) {
        const a = ringArea(ring);
        if (canopies.some((q) => Math.hypot(q.cx - cx, q.cz - cz) < 3.5 && Math.abs(q.a - a) < 0.35 * q.a + 10)) { drop.add(i); continue; }
      }
      // Multi-storey car parks: a parking POI inside a mid-rise footprint (owner chunk = this building's chunk)
      if (parking.length && !b[3] && (b[4] || 0) >= 7 && (b[4] || 0) <= 40 && !(b[5] > 0.5)) {
        const a = ringArea(ring);
        if (a < 500 || a > 30000 || garages.length >= 6) continue;
        const hit = parking.find(([px, pz]) => Math.abs(px - cx) < 160 && Math.abs(pz - cz) < 160 && inPoly(px, pz, ring));
        if (!hit) continue;
        const rect = minRectOf(ring);
        if (!rect || a < 0.7 * rect.ar || rect.hw < 12) continue; // decks need a roughly rectangular plate
        drop.add(i);
        garages.push({ cx: r1(rect.cx), cz: r1(rect.cz), ux: r3(rect.ux), uz: r3(rect.uz), hl: r1(rect.hl), hw: r1(rect.hw), h: r1(b[4]), seed: (b[0] >>> 0) || 1 });
      }
    }
    if (drop.size) {
      let w = 0;
      for (let i = 0; i < buildings.length; i++) if (!drop.has(i)) buildings[w++] = buildings[i];
      buildings.length = w;
    }
  }
  return { canopies, garages };
}
