// [venues-poi] Everyday venues, worker stage 1 (runs inside fetchGlobalChunkData via venues.js extractVenues).
// Finds the OSM footprints that the generic extruder would turn into solid blocks but that a venue model replaces:
//   - fuel canopies (building=roof over the forecourt: a low rectangle under / next to an amenity=fuel POI),
//   - multi-storey car parks (amenity=parking POI inside a mid-rise footprint),
//   - dining / hospitality / entertainment / auto / marketplace commercial venues (cafe_bistro, pub_bar, hotel,
//     cinema_theatre, auto_service, marketplace_retail),
// records them in chunk-local coordinates for poi_venues.js (stage 3) and drops canopies/garages from `buildings`.
// No environment.js import here: global_tiles -> venues -> environment would be an import cycle.

const CHUNK_HALF = 500;
const MAX_DINING_HOSP_RETAIL_PER_CHUNK = 18;

const CAFE_BISTRO_SET = new Set(['cafe', 'restaurant', 'bakery', 'ice_cream', 'deli', 'food_court', 'pastry', 'coffee']);
const PUB_BAR_SET = new Set(['bar', 'pub', 'biergarten', 'alcohol_shop', 'wine', 'beverages']);
const HOTEL_SET = new Set(['hotel', 'motel', 'hostel', 'guest_house', 'lodging', 'chalet']);
const CINEMA_THEATRE_SET = new Set(['cinema', 'theatre', 'nightclub', 'arts_centre', 'gallery', 'art_gallery', 'music_venue']);
const AUTO_SERVICE_SET = new Set(['car_repair', 'car', 'car_parts', 'tyres', 'motorcycle', 'bicycle']);
const MARKETPLACE_RETAIL_SET = new Set(['marketplace', 'florist', 'greengrocer', 'mall', 'department_store']);

/**
 * Classifies a POI's (cls, sub) into one of the 6 Batch 3 commercial/hospitality venue kinds, or null.
 * @param {string} cls
 * @param {string} sub
 * @returns {'cafe_bistro'|'pub_bar'|'hotel'|'cinema_theatre'|'auto_service'|'marketplace_retail'|null}
 */
export function classifyPoiVenueKind(cls, sub) {
  const c = String(cls || '').toLowerCase().trim();
  const s = String(sub || '').toLowerCase().trim();
  if (CAFE_BISTRO_SET.has(c) || CAFE_BISTRO_SET.has(s)) return 'cafe_bistro';
  if (PUB_BAR_SET.has(c) || PUB_BAR_SET.has(s)) return 'pub_bar';
  if (HOTEL_SET.has(c) || HOTEL_SET.has(s)) return 'hotel';
  if (CINEMA_THEATRE_SET.has(c) || CINEMA_THEATRE_SET.has(s)) return 'cinema_theatre';
  if (AUTO_SERVICE_SET.has(c) || AUTO_SERVICE_SET.has(s)) return 'auto_service';
  if (MARKETPLACE_RETAIL_SET.has(c) || MARKETPLACE_RETAIL_SET.has(s)) return 'marketplace_retail';
  return null;
}

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

function pickPoiName(tags) {
  if (!tags) return '';
  const zh = tags['name:zh-Hans'] || tags['name:zh'] || '';
  if (zh) return String(zh).split(';')[0].trim();
  return String(tags.name || tags['name:latin'] || tags['name:en'] || tags.name_en || '').trim();
}
function pickPoiNameEn(tags) {
  if (!tags) return '';
  return String(tags['name:en'] || tags.name_en || tags['name:latin'] || tags.name_int || tags.name || '').trim();
}

/**
 * @param {Array<Object>} tiles decoded MVT layers
 * @param {(lat:number, lon:number) => [number, number]} toLocalXZ chunk-local projection
 * @param {Array} buildings chunk building records (mutated: canopy / garage footprints removed)
 * @returns {{canopies: Array<Object>, garages: Array<Object>, venues: Array<Object>}}
 */
export function extractPoiVenueSites(tiles, toLocalXZ, buildings) {
  const fuel = [], parking = [], rawVenues = [];
  const seen = new Set();
  for (const t of (tiles || [])) {
    for (const f of t.poi || []) {
      if (f.type !== 1) continue;
      const tags = f.tags || {};
      const cls = tags.class, sub = tags.subclass;
      const isFuel = cls === 'fuel' && sub !== 'charging_station';
      const isPark = cls === 'parking' && sub === 'parking';
      const vKind = !isFuel && !isPark ? classifyPoiVenueKind(cls, sub) : null;
      if (!isFuel && !isPark && !vKind) continue;
      for (const g of f.geom || []) {
        const p = Array.isArray(g[0]) ? g[0] : g;
        if (!p || p.length < 2) continue;
        const [x, z] = toLocalXZ(p[0], p[1]);
        if (Math.abs(x) > CHUNK_HALF + 80 || Math.abs(z) > CHUNK_HALF + 80) continue;
        const k = `${vKind || cls}|${Math.round(x / 3)}|${Math.round(z / 3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (isFuel) fuel.push([x, z]);
        else if (isPark) parking.push([x, z]);
        else if (Math.abs(x) <= CHUNK_HALF && Math.abs(z) <= CHUNK_HALF) {
          const name = pickPoiName(tags);
          const nameEn = pickPoiNameEn(tags);
          const rank = Number(tags.rank) || 99;
          rawVenues.push({ kind: vKind, cls: String(cls || ''), sub: String(sub || ''), px: r1(x), pz: r1(z), name, nameEn, rank });
        }
      }
    }
  }
  const canopies = [], garages = [], venues = [];
  if (!fuel.length && !parking.length && !rawVenues.length) return { canopies, garages, venues };

  // Prioritize Batch 3 commercial/hospitality/retail venues by named status, rank, and landmark category
  if (rawVenues.length) {
    const kindWeight = { hotel: 0, cinema_theatre: 1, marketplace_retail: 2, auto_service: 3, pub_bar: 4, cafe_bistro: 5 };
    rawVenues.sort((a, b) => {
      const na = a.name || a.nameEn ? 0 : 1;
      const nb = b.name || b.nameEn ? 0 : 1;
      if (na !== nb) return na - nb;
      const kw = (kindWeight[a.kind] ?? 5) - (kindWeight[b.kind] ?? 5);
      if (Math.abs(a.rank - b.rank) > 2) return a.rank - b.rank;
      return kw !== 0 ? kw : a.rank - b.rank;
    });

    // Pre-parse building rings for fast host footprint/frontage matching
    const bRings = [];
    if (buildings && buildings.length) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const fo = b && b[11];
        if (!fo || fo.length < 6 || (b[5] || 0) > 0.5) continue;
        const pts = [];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let k = 0; k < fo.length; k += 2) {
          const x = fo[k], z = fo[k + 1];
          pts.push([x, z]);
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        const n = pts.length - (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? 1 : 0);
        const ring = pts.slice(0, n);
        if (ring.length < 3) continue;
        bRings.push({ idx: i, ring, x0, x1, z0, z1, h: Number(b[4]) || 8, a: ringArea(ring) });
      }
    }

    for (const v of rawVenues) {
      if (venues.length >= MAX_DINING_HOSP_RETAIL_PER_CHUNK) break;
      // Enforce minimum spacing between extracted venues (16m general, 28m same kind)
      if (venues.some((u) => Math.hypot(u.px - v.px, u.pz - v.pz) < (u.kind === v.kind ? 28 : 16))) continue;
      let host = null, bestD = 22;
      for (const br of bRings) {
        if (v.px < br.x0 - bestD || v.px > br.x1 + bestD || v.pz < br.z0 - bestD || v.pz > br.z1 + bestD) continue;
        if (inPoly(v.px, v.pz, br.ring)) {
          if (!host || bestD > 0 || br.a < host.a) { host = br; bestD = 0; }
          continue;
        }
        if (bestD === 0) continue;
        for (let i = 0; i < br.ring.length; i++) {
          const p0 = br.ring[i], p1 = br.ring[(i + 1) % br.ring.length];
          const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l2 = dx * dx + dz * dz;
          if (l2 < 1e-6) continue;
          const t = Math.max(0, Math.min(1, ((v.px - p0[0]) * dx + (v.pz - p0[1]) * dz) / l2));
          const d = Math.hypot(v.px - (p0[0] + dx * t), v.pz - (p0[1] + dz * t));
          if (d < bestD) { bestD = d; host = br; }
        }
      }
      if (host) {
        const rect = minRectOf(host.ring);
        if (rect) {
          v.cx = r1(rect.cx); v.cz = r1(rect.cz);
          v.ux = r3(rect.ux); v.uz = r3(rect.uz);
          v.hl = r1(rect.hl); v.hw = r1(rect.hw);
          v.h = r1(host.h); v.a = Math.round(host.a);
        }
      }
      venues.push(v);
    }
  }

  // Fuel canopies: the tile building layer (not only this chunk's buildings) so the chunk that owns the POI sees a
  // canopy whose centroid falls just across the chunk border.
  if (fuel.length) {
    const cands = [];
    const seenB = new Set();
    for (const t of tiles) {
      for (const f of t.building || []) {
        if (f.type !== 3) continue;
        const h = Number(f.tags.render_height) || 0, mh = Number(f.tags.render_min_height) || 0;
        if (mh > 0.5 || h > 10.5) continue;
        for (const poly of f.geom) {
          const o = poly.outer;
          if (!o || o.length < 3 || o.length > 16) continue;
          const pts = o.map((q) => toLocalXZ(q[0], q[1]));
          const [cx, cz] = centroidOf(pts);
          if (Math.abs(cx) > CHUNK_HALF + 120 || Math.abs(cz) > CHUNK_HALF + 120) continue;
          const key = `${Math.round(cx * 2)},${Math.round(cz * 2)}`;
          if (seenB.has(key)) continue;
          seenB.add(key);
          const a = ringArea(pts);
          if (a < 28 || a > 1800) continue;
          cands.push({ pts, cx, cz, a, h });
        }
      }
    }
    for (const [px, pz] of fuel) {
      let best = null, bd = Infinity;
      for (const c of cands) {
        const d = Math.hypot(c.cx - px, c.cz - pz);
        if (d > 36) continue;
        const inside = inPoly(px, pz, c.pts);
        if (!inside && d > 28) continue;
        const rect = minRectOf(c.pts);
        if (!rect || c.a < 0.72 * rect.ar || rect.hw < 2.4 || rect.hl > 34) continue; // a plain rectangle, not an L-shaped shop
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
        if (
          canopies.some(
            (q) =>
              (Math.hypot(q.cx - cx, q.cz - cz) < 5.0 && Math.abs(q.a - a) < 0.4 * q.a + 15) ||
              (a < 320 && (b[4] || 0) <= 8.5 && Math.hypot(q.cx - cx, q.cz - cz) < Math.max(12, q.hl + 2))
          )
        ) {
          drop.add(i);
          continue;
        }
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
  return { canopies, garages, venues };
}
export { extractPoiVenueSites as extractPoiVenues };
