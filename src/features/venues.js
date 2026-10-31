// [venues] Stadiums & theme parks (worker side).
//   extractVenues(): called from fetchGlobalChunkData. Finds open-air stadiums (landuse=stadium, merged
//     across tile clips, refined by the stadium building ring) and theme-park rides (attraction POIs inside
//     landuse=theme_park), and removes stadium shell buildings from the generic extruder.
//   buildVenues(): called from createChunkBuildTask stage 3. Emits one static vertex-coloured mesh per chunk
//     (seating bowl, field + markings, light masts, canopy, coaster track, ride bases, kiosks, paths) and a
//     compact list of animated rides for the main-thread VenueRides system (venue_rides.js).

import * as THREE from '../../vendor/three.module.js';
import { extractPoiVenueSites } from './poi_venues_extract.js'; // [venues-poi]
// [release-6-integ] no static import of ../environment.js: environment -> global_tiles -> venues -> environment
// is an import cycle the standalone IIFE bundle cannot handle. chunk_builder injects the terrain sampler.
let getBeijingTerrainElevation = () => 0;
export function setVenueTerrainSampler(fn) { if (typeof fn === 'function') getBeijingTerrainElevation = fn; }

const HALF = 500;

// ------------------------------------------------------------------ small helpers
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashXZ(x, z, salt = 0) {
  let h = (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(z) | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function bboxOf(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}
function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a) * 0.5;
}
function centroid(pts) {
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
function inFlat(x, z, flat) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
// Andrew monotone chain; returns CCW hull (x right, z down) without repeat
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
// Minimum-area enclosing rectangle of a convex hull: centre, unit long axis (ux, uz), half length / half width
function minRect(h) {
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
  if (best && best.hw > best.hl) { // make u the long axis
    const { ux, uz, hl, hw } = best;
    best.ux = -uz; best.uz = ux; best.hl = hw; best.hw = hl;
  }
  return best;
}
// Distance from (cx, cz) along unit (dx, dz) to the boundary of a polygon (first exit)
function rayExit(cx, cz, dx, dz, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0] - cx, az = pts[j][1] - cz, bx = pts[i][0] - cx, bz = pts[i][1] - cz;
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den;
    const s = (ax * dz - az * dx) / den;
    if (t > 0.01 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return best;
}
// Union-find grouping of polygon pieces whose bboxes touch (tile clips of one OSM polygon share an edge)
function groupPieces(pieces, gap) {
  const parent = pieces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i].bb, b = pieces[j].bb;
      if (a.minX - gap > b.maxX || b.minX - gap > a.maxX || a.minZ - gap > b.maxZ || b.minZ - gap > a.maxZ) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  pieces.forEach((p, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(p);
  });
  return [...groups.values()];
}
const inChunk = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;
const round1 = (v) => Math.round(v * 10) / 10;
const toFlat = (pts) => { const f = []; for (const [x, z] of pts) f.push(round1(x), round1(z)); return f; };
// Long thin footprint (e.g. the projection of Wembley's arch): fills < 25% of its bbox and spans > 120m
const isThin = (pts, a) => { const b = bboxOf(pts); const w = b.maxX - b.minX, d = b.maxZ - b.minZ; return Math.max(w, d) > 120 && a < 0.25 * w * d; };
function farthestPair(pts) {
  let best = -1, A = pts[0], B = pts[0];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
    if (d > best) { best = d; A = pts[i]; B = pts[j]; }
  }
  return [A, B];
}

// ------------------------------------------------------------------ ride classification
const RIDE_RULES = [
  ['wheel', /wheel|ferris|\beye\b|riesenrad|observation|pal-?o|摩天轮/i],
  ['tower', /drop|tower|free ?fall|plunge|scream|zone|gyro|跳楼|塔/i],
  ['carousel', /carou?sel|merry|go.?round|galloper|旋转木马/i],
  ['swing', /swing|sky ?flyer|wave|flyer|chair|eagles/i],
  ['coaster', /coaster|striker|blazer|grizzly|demon|patriot|mouse|flight deck|express|mountain|loop|viper|goliath|cyclone|racer|batman|superman|kingda|millennium|fury|dragon|rattler|matterhorn|tatsu|beast|thunderbolt|twister|scorpion|cobra|python|raptor|mamba|intimidator|过山车/i],
  ['spinner', /orbit|twirl|centrifuge|delirium|berserker|tea ?cup|spin|whirl|tilt|scrambler|octopus|dumbo|astro|rocket|saucer|buggies|cabbies/i],
];
function classifyRide(name, sub) {
  const s = String(sub || '');
  if (s === 'roller_coaster') return 'coaster';
  if (s === 'big_wheel' || s === 'ferris_wheel') return 'wheel';
  if (s === 'carousel') return 'carousel';
  if (s === 'drop_tower') return 'tower';
  for (const [k, re] of RIDE_RULES) if (re.test(name)) return k;
  return '';
}
const BIG = new Set(['coaster', 'wheel', 'tower']);
const RIDE_R = { coaster: 30, wheel: 16, tower: 8, carousel: 10, swing: 11, spinner: 9 };

// ------------------------------------------------------------------ extraction (worker, per chunk)
export function extractVenues(tiles, toLocalXZ, buildings) {
  const ringXZ = (ring) => ring.map((p) => toLocalXZ(p[0], p[1]));
  const near = (bb) => bb.maxX > -1150 && bb.minX < 1150 && bb.maxZ > -1150 && bb.minZ < 1150;
  const stad = [], parks = [], pitches = [], bpieces = [];
  const stadPois = [], pitchPois = [], attractions = [];
  const seenPoi = new Set();
  for (const t of tiles) {
    for (const f of t.landuse || []) {
      if (f.type !== 3) continue;
      const cls = f.tags.class;
      const dst = cls === 'stadium' ? stad : cls === 'theme_park' ? parks : cls === 'pitch' ? pitches : null;
      if (!dst) continue;
      for (const poly of f.geom) {
        if (!poly.outer || poly.outer.length < 3) continue;
        const pts = ringXZ(poly.outer);
        const bb = bboxOf(pts);
        if (near(bb)) dst.push({ pts, bb, a: area(pts) });
      }
    }
    for (const f of t.building || []) {
      if (f.type !== 3) continue;
      for (const poly of f.geom) {
        if (!poly.outer || poly.outer.length < 3) continue;
        const pts = ringXZ(poly.outer);
        const a = area(pts);
        if (a < 1500) continue;
        const bb = bboxOf(pts);
        if (!near(bb)) continue;
        bpieces.push({ pts, bb, a, h: Number(f.tags.render_height) || 0, holes: (poly.holes || []).filter((r) => r.length >= 3).map(ringXZ) });
      }
    }
    for (const f of t.poi || []) {
      if (f.type !== 1) continue;
      const cls = f.tags.class || '', sub = f.tags.subclass || '';
      if (cls !== 'stadium' && cls !== 'pitch' && cls !== 'attraction') continue;
      if (cls === 'attraction' && (sub === 'viewpoint' || sub === 'artwork')) continue;
      const name = String(f.tags['name:en'] || f.tags.name_en || f.tags.name || '').trim();
      for (const pt of f.geom) {
        const [x, z] = toLocalXZ(pt[0], pt[1]);
        if (Math.abs(x) > 1150 || Math.abs(z) > 1150) continue;
        const key = `${cls}|${Math.round(x / 3)}|${Math.round(z / 3)}|${name}`;
        if (seenPoi.has(key)) continue;
        seenPoi.add(key);
        const rec = { x, z, name, sub };
        (cls === 'stadium' ? stadPois : cls === 'pitch' ? pitchPois : attractions).push(rec);
      }
    }
  }

  const stadiums = [];
  const removeHulls = [];
  for (const g of groupPieces(stad, 4)) {
    const L = hull(g.flatMap((p) => p.pts));
    const La = area(L);
    if (La < 6000) continue;
    // Stadium building ring(s) inside the landuse: start from the biggest piece, absorb touching pieces
    const inside = bpieces.filter((b) => { const [x, z] = centroid(b.pts); return inPoly(x, z, L) && b.h >= 6; });
    const cand = inside.filter((b) => !isThin(b.pts, b.a));
    const arches = [];
    for (const b of inside) {
      if (!isThin(b.pts, b.a) || b.h < 50) continue;
      const [A, B] = farthestPair(b.pts);
      if (!arches.some((q) => Math.hypot(q[0] - A[0], q[1] - A[1]) < 20 || Math.hypot(q[0] - B[0], q[1] - B[1]) < 20)) arches.push([round1(A[0]), round1(A[1]), round1(B[0]), round1(B[1]), Math.round(b.h)]);
    }
    let cluster = [];
    if (cand.length) {
      cand.sort((a, b) => b.a - a.a);
      cluster = [cand[0]];
      const bb = { ...cand[0].bb };
      for (let changed = true; changed;) {
        changed = false;
        for (const c of cand) {
          if (cluster.includes(c)) continue;
          if (c.bb.minX - 8 > bb.maxX || bb.minX - 8 > c.bb.maxX || c.bb.minZ - 8 > bb.maxZ || bb.minZ - 8 > c.bb.maxZ) continue;
          cluster.push(c); changed = true;
          bb.minX = Math.min(bb.minX, c.bb.minX); bb.maxX = Math.max(bb.maxX, c.bb.maxX);
          bb.minZ = Math.min(bb.minZ, c.bb.minZ); bb.maxZ = Math.max(bb.maxZ, c.bb.maxZ);
        }
      }
    }
    let outer = L, height = 0;
    if (cluster.length) {
      const B = hull(cluster.flatMap((c) => c.pts));
      if (area(B) >= Math.min(15000, La * 0.3)) {
        outer = B;
        height = Math.max(...cluster.map((c) => c.h));
      }
    }
    // Field: largest pitch polygon inside the bowl
    let field = null;
    for (const p of pitches) {
      const [x, z] = centroid(p.pts);
      if (p.a >= 2500 && inPoly(x, z, outer) && (!field || p.a > field.a)) field = p;
    }
    const fieldHull = field ? hull(field.pts) : null;
    const [cx, cz] = fieldHull ? centroid(fieldHull) : centroid(outer);
    // Closed roof (dome / arena): the field centre is covered by a building (and not by one of its holes)
    const covered = cluster.some((c) => inPoly(cx, cz, c.pts) && !c.holes.some((h) => inPoly(cx, cz, h)));
    if (covered) continue;
    removeHulls.push({ outer, keepH: height > 0 ? height * 1.5 : Infinity });
    const [ocx, ocz] = centroid(outer);
    if (!inChunk(ocx, ocz)) continue;
    // Sport: pitch POIs inside, then stadium POI subclass, then name, then region default
    let sport = '';
    const SPORTS = /^(american_football|soccer|baseball|rugby_union|rugby_league|rugby|football|cricket|athletics|softball|australian_football)$/;
    for (const p of pitchPois.concat(stadPois)) if (inPoly(p.x, p.z, outer) && SPORTS.test(p.sub)) { sport = p.sub; break; }
    const nm = (stadPois.find((p) => inPoly(p.x, p.z, outer)) || {}).name || '';
    if (!sport && /ball ?park|baseball|dodger|yankee|wrigley|fenway/i.test(nm)) sport = 'baseball';
    if (!sport && /football|nfl/i.test(nm)) sport = 'american_football';
    stadiums.push({
      name: nm,
      outer: toFlat(outer),
      field: fieldHull ? toFlat(fieldHull) : null,
      sport: sport || 'auto',
      height: Math.round(height),
      arches,
    });
  }
  // Remove stadium shell buildings (their footprint centroid lies inside an open bowl)
  if (removeHulls.length && buildings) {
    let w = 0;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const fo = b && b[11];
      let drop = false;
      if (fo && fo.length >= 6) {
        let sx = 0, sz = 0;
        for (let k = 0; k < fo.length; k += 2) { sx += fo[k]; sz += fo[k + 1]; }
        const n = fo.length / 2;
        const pts = [];
        for (let k = 0; k < fo.length; k += 2) pts.push([fo[k], fo[k + 1]]);
        const thinTall = isThin(pts, area(pts)) && b[4] >= 50; // arches are redrawn by buildStadium
        // Only the ring shell goes; clearly taller non-shell structures (towers) stay with the generic extruder
        drop = removeHulls.some((h) => inPoly(sx / n, sz / n, h.outer) && (thinTall || b[4] < h.keepH));
      }
      if (!drop) buildings[w++] = b;
    }
    buildings.length = w;
  }

  // ---------------- theme parks
  const rides = [];
  const paths = [];
  const bldFlats = [];
  for (const b of buildings || []) {
    const f = b[11];
    if (!f || f.length < 6) continue;
    const pts = [];
    for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]);
    bldFlats.push({ f, a: area(pts) });
  }
  const inBuilding = (x, z, minA = 0) => bldFlats.some((b) => b.a >= minA && inFlat(x, z, b.f));
  for (const g of groupPieces(parks, 4)) {
    const H = hull(g.flatMap((p) => p.pts));
    const Ha = area(H);
    if (Ha < 15000) continue;
    const inPark = (x, z) => g.some((p) => p.bb.minX <= x && x <= p.bb.maxX && p.bb.minZ <= z && z <= p.bb.maxZ && inPoly(x, z, p.pts));
    const list = [];
    for (const a of attractions) {
      if (!inPark(a.x, a.z)) continue;
      let k = classifyRide(a.name, a.sub);
      if (!k) k = 'kiosk';
      if (inBuilding(a.x, a.z, BIG.has(k) ? 3500 : 0)) continue; // indoor dark ride / show building (e.g. Space Mountain); small stations are fine
      list.push({ k, x: a.x, z: a.z, name: a.name, seed: hashStr(a.name || `${Math.round(a.x)},${Math.round(a.z)}`) });
    }
    // Fill the classics a park would have when OSM does not name them (owner chunk only)
    const [pcx, pcz] = centroid(H);
    if (inChunk(pcx, pcz) && Ha >= 120000) {
      const rnd = rng32(hashXZ(pcx * 7, pcz * 7, 31));
      const bb = bboxOf(H);
      const have = new Set(list.map((r) => r.k));
      for (const k of ['wheel', 'coaster', 'tower', 'carousel', 'swing']) {
        if (have.has(k)) continue;
        let best = null, bestD = 0;
        for (let tries = 0; tries < 160; tries++) { // farthest-from-neighbours sample inside the park
          const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
          if (!inPark(x, z) || inBuilding(x, z)) continue;
          let d = Infinity;
          for (const r of list) if (r.k !== 'kiosk') d = Math.min(d, Math.hypot(r.x - x, r.z - z) - (RIDE_R[r.k] || 6) * 0.6);
          if (d > bestD) { bestD = d; best = [x, z]; }
        }
        if (best && bestD > RIDE_R[k] * 0.7) list.push({ k, x: best[0], z: best[1], name: '', seed: hashXZ(best[0], best[1], 7) });
      }
    }
    // Size each ride so neighbours do not overlap; coasters must stay inside the park
    for (const r of list) {
      let nn = Infinity;
      for (const o of list) if (o !== r && o.k !== 'kiosk') nn = Math.min(nn, Math.hypot(o.x - r.x, o.z - r.z));
      r.nn = nn;
    }
    let coasters = 0;
    for (const r of list) {
      if (!inChunk(r.x, r.z)) continue;
      const rnd = rng32(r.seed);
      if (r.k === 'coaster') {
        if (coasters >= 6) { r.k = 'spinner'; }
        else {
          coasters++;
          const kid = /express|kid|junior|woodstock|gadget|mini|jr\b/i.test(r.name);
          let a = kid ? 20 + rnd() * 8 : 38 + rnd() * 30;
          let b = a * (0.42 + rnd() * 0.2);
          const yaw = rnd() * Math.PI * 2;
          const ok = (s) => {
            for (let i = 0; i < 24; i++) {
              const t = (i / 24) * Math.PI * 2;
              const u = a * s * (Math.cos(t) + 0.18 * Math.cos(3 * t)), v = b * s * (Math.sin(t) + 0.22 * Math.sin(2 * t));
              if (!inPark(r.x + u * Math.cos(yaw) - v * Math.sin(yaw), r.z + u * Math.sin(yaw) + v * Math.cos(yaw))) return false;
            }
            return true;
          };
          let s = 1;
          for (const c of [1, 0.8, 0.64, 0.5, 0.4]) { s = c; if (ok(c)) break; }
          a *= s; b *= s;
          r.a = round1(a); r.b = round1(b); r.yaw = Math.round(yaw * 1000) / 1000;
          r.h = round1(kid ? 8 + rnd() * 4 : Math.min(48, 16 + a * 0.45 + rnd() * 8));
          r.wood = /wood|grizzly|gold|striker|thunder|cyclone|beast|racer/i.test(r.name) ? 1 : 0;
        }
      }
      if (r.k === 'wheel') r.r = round1(Math.max(9, Math.min(28, Math.min(r.nn * 0.6, 16 + rnd() * 10))));
      if (r.k === 'tower') r.h = round1(48 + rnd() * 22);
      rides.push({ k: r.k, x: round1(r.x), z: round1(r.z), seed: r.seed, a: r.a, b: r.b, yaw: r.yaw, h: r.h, r: r.r, wood: r.wood });
    }
    // Walkways: chain the park's rides nearest-neighbour style
    const pts = list.filter((r) => r.k !== 'kiosk');
    if (pts.length >= 2) {
      const used = new Set([0]);
      let cur = 0;
      while (used.size < pts.length) {
        let best = -1, bd = Infinity;
        for (let j = 0; j < pts.length; j++) {
          if (used.has(j)) continue;
          const d = Math.hypot(pts[j].x - pts[cur].x, pts[j].z - pts[cur].z);
          if (d < bd) { bd = d; best = j; }
        }
        used.add(best);
        const A = pts[cur], B = pts[best];
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        if (bd < 260 && inChunk(mx, mz) && inPark(mx, mz)) paths.push([round1(A.x), round1(A.z), round1(B.x), round1(B.z)]);
        cur = best;
      }
    }
  }
  const poi = extractPoiVenueSites(tiles, toLocalXZ, buildings); // [venues-poi] fuel canopies + car parks
  if (!stadiums.length && !rides.length) return poi.canopies.length || poi.garages.length ? { stadiums, rides, paths, poi } : null; // [venues-poi]
  return { stadiums, rides, paths, poi }; // [venues-poi]
}

// ------------------------------------------------------------------ mesh accumulation
class Accum {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, rgb) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  quad(a, b, c, d, rgb) { this.tri(a, b, c, rgb); this.tri(a, c, d, rgb); }
  // Oriented box between two 3D points (beam) with half width hw (horizontal) and half height hh
  beam(p, q, hw, hh, rgb) {
    let dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-4) return;
    dx /= l; dy /= l; dz /= l;
    // side = dir x up (fallback for vertical beams)
    let sx = -dz, sz = dx;
    let sl = Math.hypot(sx, sz);
    if (sl < 1e-3) { sx = 1; sz = 0; sl = 1; }
    sx /= sl; sz /= sl;
    // up' = side x dir
    const ux = -sz * dy, uy = sz * dx - sx * dz, uz = sx * dy;
    const c = (o, s, u) => [o[0] + sx * s * hw + ux * u * hh, o[1] + uy * u * hh, o[2] + sz * s * hw + uz * u * hh];
    const P = [c(p, -1, -1), c(p, 1, -1), c(p, 1, 1), c(p, -1, 1)];
    const Q = [c(q, -1, -1), c(q, 1, -1), c(q, 1, 1), c(q, -1, 1)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(P[i], P[j], Q[j], Q[i], rgb); }
  }
  // Axis-aligned-in-plan box centred at (x, z) rotated by yaw
  box(x, z, y0, y1, hl, hw, yaw, rgb, topRgb = rgb) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]);
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], rgb);
    }
    this.quad([P[0][0], y1, P[0][1]], [P[1][0], y1, P[1][1]], [P[2][0], y1, P[2][1]], [P[3][0], y1, P[3][1]], topRgb);
  }
  // Flat ground polygon (convex or simple) at height y
  poly(pts, y, rgb) {
    const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return; }
    for (const [a, b, c] of tris) this.tri([pts[a][0], y, pts[a][1]], [pts[b][0], y, pts[b][1]], [pts[c][0], y, pts[c][1]], rgb);
  }
  disc(x, z, r, y, rgb, seg = 20) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], rgb);
    }
  }
  // Thin flat line segment (field markings) at height y
  line(x1, z1, x2, z2, y, w, rgb) {
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l < 1e-3) return;
    const nx = (-(z2 - z1) / l) * w * 0.5, nz = ((x2 - x1) / l) * w * 0.5;
    this.quad([x1 - nx, y, z1 - nz], [x2 - nx, y, z2 - nz], [x2 + nx, y, z2 + nz], [x1 + nx, y, z1 + nz], rgb);
  }
  toMesh(mat) {
    if (!this.pos.length) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const u8 = new Uint8Array(this.col.length);
    for (let i = 0; i < this.col.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    geom.setAttribute('color', new THREE.BufferAttribute(u8, 3, true));
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const WHITE = [0.95, 0.95, 0.93];
const CONCRETE = [0.76, 0.75, 0.72];
const CONCRETE_DK = [0.52, 0.52, 0.52];
const GLASS = [0.18, 0.24, 0.30];
const TURF_A = [0.20, 0.50, 0.22];
const TURF_B = [0.24, 0.57, 0.26];
const TURF_EDGE = [0.18, 0.42, 0.20];
const DIRT = [0.66, 0.45, 0.30];
const PATH = [0.80, 0.72, 0.58];
const TEAM = [[0.70, 0.12, 0.14], [0.12, 0.28, 0.62], [0.10, 0.45, 0.28], [0.85, 0.60, 0.10], [0.45, 0.15, 0.50]];
// Seat colours [primary, secondary] for a few famous venues; others get a colour from a hash of the name
const VENUE_COLOURS = [
  [/levi/i, [0.67, 0.0, 0.05], [0.72, 0.60, 0.36]],
  [/oracle park|giants/i, [0.99, 0.36, 0.0], [0.12, 0.12, 0.12]],
  [/wembley/i, [0.78, 0.08, 0.14], [0.85, 0.85, 0.85]],
  [/dodger/i, [0.0, 0.35, 0.65], [0.9, 0.9, 0.9]],
  [/yankee/i, [0.05, 0.15, 0.35], [0.75, 0.75, 0.78]],
  [/fenway/i, [0.10, 0.35, 0.22], [0.70, 0.10, 0.15]],
  [/old trafford/i, [0.80, 0.05, 0.10], [0.12, 0.12, 0.12]],
  [/anfield/i, [0.78, 0.06, 0.12], [0.95, 0.95, 0.95]],
  [/camp nou|spotify/i, [0.0, 0.30, 0.60], [0.65, 0.0, 0.20]],
  [/bernab/i, [0.92, 0.92, 0.92], [0.25, 0.20, 0.50]],
  [/allianz arena/i, [0.85, 0.05, 0.12], [0.92, 0.92, 0.92]],
  [/sofi/i, [0.0, 0.20, 0.55], [0.95, 0.75, 0.10]],
  [/metlife/i, [0.10, 0.20, 0.45], [0.0, 0.45, 0.25]],
  [/lambeau/i, [0.10, 0.30, 0.20], [0.98, 0.72, 0.10]],
  [/maracan/i, [0.10, 0.40, 0.70], [0.95, 0.80, 0.10]],
];
function venueColours(name, rnd) {
  for (const [re, a, b] of VENUE_COLOURS) if (re.test(name || '')) return [a, b];
  const t = TEAM[Math.floor(rnd() * TEAM.length)];
  return [t, [t[0] * 0.55 + 0.3, t[1] * 0.55 + 0.3, t[2] * 0.55 + 0.3]];
}
// World-space collider in the format of chunk buildingColliders (footprint ring local to the chunk)
let venueColliderSeq = 0;
function pushCollider(cols, ox, oz, ring, topY) {
  if (!cols || ring.length < 3) return;
  const flat = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    flat.push(x, z);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  cols.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: topY, flatOuter: flat, ox, oz, id: 970000000 + (venueColliderSeq++ % 1000000), venue: true });
}
function rectRing(x, z, hl, hw, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]);
}
const BRIGHT = [[0.92, 0.18, 0.16], [0.10, 0.55, 0.90], [0.98, 0.78, 0.10], [0.20, 0.72, 0.30], [0.80, 0.25, 0.75], [0.98, 0.50, 0.10]];

// ------------------------------------------------------------------ stadium
function buildStadium(acc, s, ox, oz, cols) {
  const outer = [];
  for (let i = 0; i < s.outer.length; i += 2) outer.push([s.outer[i], s.outer[i + 1]]);
  const fieldPts = [];
  if (s.field) for (let i = 0; i < s.field.length; i += 2) fieldPts.push([s.field[i], s.field[i + 1]]);
  const R = minRect(outer);
  if (!R) return;
  let sport = s.sport;
  if (sport === 'auto') sport = s.us ? 'american_football' : 'soccer';
  if (sport === 'football' || sport === 'rugby' || sport === 'rugby_union' || sport === 'rugby_league') sport = 'soccer';
  if (sport === 'softball') sport = 'baseball';
  if (sport === 'baseball' && fieldPts.length < 3) sport = s.us ? 'american_football' : 'soccer';
  if (sport !== 'baseball' && sport !== 'american_football' && sport !== 'soccer') sport = 'soccer';

  // Field centre & frame
  const FR = fieldPts.length >= 3 ? minRect(fieldPts) : R;
  const [cx, cz] = fieldPts.length >= 3 ? centroid(fieldPts) : [R.cx, R.cz];
  const ux = FR.ux, uz = FR.uz;
  const W = (u, v) => [cx + u * ux - v * uz, cz + u * uz + v * ux];
  const gy = getBeijingTerrainElevation(ox + cx, oz + cz);
  const rnd = rng32(s.name ? hashStr(s.name) : hashXZ(ox + cx, oz + cz, 5));
  const [team, team2] = venueColours(s.name, rnd);

  // Playing area dims (scaled to fit)
  let L = sport === 'american_football' ? 109.7 : 105, Wd = sport === 'american_football' ? 48.8 : 68;
  const margin = sport === 'american_football' ? 9 : 7;
  let inner;
  if (fieldPts.length >= 3) {
    const k = Math.min(1, (FR.hl * 2 * 0.94) / L, (FR.hw * 2 * 0.94) / Wd);
    L *= k; Wd *= k;
    inner = fieldPts.map(([x, z]) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1; return [x + (dx / d) * 3, z + (dz / d) * 3]; });
  } else {
    const k = Math.min(1, (R.hl * 2 * 0.62) / (L + 2 * margin), (R.hw * 2 * 0.62) / (Wd + 2 * margin));
    L *= k; Wd *= k;
    const A = L / 2 + margin * k, B = Wd / 2 + margin * k;
    inner = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      inner.push(W(A * Math.sign(c) * Math.abs(c) ** 0.5, B * Math.sign(sn) * Math.abs(sn) ** 0.5));
    }
  }

  // Seating bowl by angular sweep between the inner field edge and the outer footprint
  const N = 72;
  const rin = [], rout = [];
  let depthSum = 0;
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2, dx = Math.cos(t), dz = Math.sin(t);
    let a = rayExit(cx, cz, dx, dz, inner), b = rayExit(cx, cz, dx, dz, outer);
    if (!Number.isFinite(a)) a = 40;
    if (!Number.isFinite(b) || b < a + 10) b = a + 10;
    rin.push(a); rout.push(b); depthSum += b - a;
  }
  const depth = depthSum / N;
  // OSM heights often include masts/arches: keep the bowl proportional to its depth
  const H = Math.max(12, Math.min(48, depth * 0.6, s.height > 0 ? s.height : Infinity));
  // Per-angle height: shallow sides (outfield, end zones) get lower stands; smoothed around the ring
  let Hk = rin.map((a, k) => Math.max(8, Math.min(H, (rout[k] - a) * 0.75)));
  for (let pass = 0; pass < 3; pass++) Hk = Hk.map((h, k) => (Hk[(k + N - 1) % N] + 2 * h + Hk[(k + 1) % N]) / 4);
  // Profile: [fraction of depth, height, kind]  kind: 0 seat tread, 1 riser, 2 band, 3 wall
  const prof = [[0, 0, 3], [0, 2.4, 3]];
  const tier = (f0, f1, y0, y1, rows) => {
    for (let i = 0; i < rows; i++) {
      const fa = f0 + ((f1 - f0) * i) / rows, fb = f0 + ((f1 - f0) * (i + 1)) / rows;
      const yb = y0 + ((y1 - y0) * (i + 1)) / rows;
      prof.push([fa, yb, 1], [fb, yb, 0]);
    }
  };
  // Finer tiered seating bowl steps with mid-bowl concourse walkway & luxury suite fascia
  tier(0, 0.47, 2.4, H * 0.45, 10);
  prof.push([0.52, H * 0.45, 3], [0.52, H * 0.54, 2]);
  tier(0.52, 0.96, H * 0.54, H * 0.92, 10);
  prof.push([0.96, H, 3], [1.0, H, 0]);
  // Outer facade: concourse levels read as dark glazed bands between concrete floors
  const levels = Math.max(2, Math.round(H / 12));
  for (let i = levels - 1; i >= 0; i--) {
    const yTop = (H * (i + 1)) / levels, yMid = yTop - (H / levels) * 0.45;
    prof.push([1.0, yMid, 3], [1.0, (H * i) / levels, 4]);
  }
  const P = (k, f, y) => {
    const t = (k / N) * Math.PI * 2, r = rin[k % N] + (rout[k % N] - rin[k % N]) * f;
    const yk = y > 2.4 ? 2.4 + ((y - 2.4) * (Hk[k % N] - 2.4)) / (H - 2.4) : y;
    return [cx + Math.cos(t) * r, gy + yk, cz + Math.sin(t) * r];
  };
  const PORTAL_DARK = [0.07, 0.08, 0.10];
  const TRUSS_STEEL = [0.64, 0.67, 0.71];
  const LED_GLOW = [1.0, 0.98, 0.88];
  for (let k = 0; k < N; k++) {
    const sec = Math.floor(k / 4) % 2 === 0 ? team : team2;
    for (let j = 0; j + 1 < prof.length; j++) {
      const [f0, y0] = prof[j], [f1, y1, kind] = prof[j + 1];
      const rgb = kind === 0 ? sec : kind === 1 ? CONCRETE_DK : kind === 2 || kind === 4 ? GLASS : CONCRETE;
      acc.quad(P(k, f0, y0), P(k + 1, f0, y0), P(k + 1, f1, y1), P(k, f1, y1), rgb);
    }
    // Radial concrete stairway aisles at every sector boundary
    if (k % 4 === 0) {
      acc.beam(P(k, 0.02, 2.55), P(k, 0.47, H * 0.45 + 0.15), 0.72, 0.16, CONCRETE);
      acc.beam(P(k, 0.53, H * 0.54 + 0.15), P(k, 0.95, H * 0.92 + 0.15), 0.72, 0.16, CONCRETE);
    }
    // Concourse vomitoria portals (recessed dark tunnel mouths + concrete lintel & jamb frames)
    if (k % 6 === 2) {
      for (const [vf0, vf1, vy0, vy1] of [[0.22, 0.34, H * 0.16, H * 0.27], [0.64, 0.76, H * 0.62, H * 0.73]]) {
        const va0 = P(k, vf0, vy0), va1 = P(k + 1, vf0, vy0);
        const vb0 = P(k, vf1, vy1), vb1 = P(k + 1, vf1, vy1);
        acc.quad([va0[0], va0[1] + 0.12, va0[2]], [va1[0], va1[1] + 0.12, va1[2]], [vb1[0], vb1[1] + 0.12, vb1[2]], [vb0[0], vb0[1] + 0.12, vb0[2]], PORTAL_DARK);
        acc.beam(va0, vb0, 0.28, 0.38, CONCRETE);
        acc.beam(va1, vb1, 0.28, 0.38, CONCRETE);
        acc.beam([vb0[0], vb0[1] + 0.25, vb0[2]], [vb1[0], vb1[1] + 0.25, vb1[2]], 0.36, 0.32, CONCRETE);
      }
    }
    // Field-level players/service tunnel portals at main ends + exterior vertical structural facade ribs
    if (k === 0 || k === (N >> 1)) {
      const ta = P(k, 0, 0), tb = P(k + 1, 0, 0), tc = P(k + 1, 0, 2.2), td = P(k, 0, 2.2);
      acc.quad(ta, tb, tc, td, PORTAL_DARK);
      acc.beam(td, tc, 0.35, 0.28, CONCRETE);
    }
    if (k % 3 === 0) {
      acc.beam(P(k, 1.005, 0), P(k, 1.005, H), 0.42, 0.42, CONCRETE);
    }
  }
  // Roof canopy with radial cantilever trusses over the upper tier
  if (H >= 20) {
    for (let k = 0; k < N; k++) {
      if (Hk[k] < H * 0.72 || Hk[(k + 1) % N] < H * 0.72) continue;
      const y0 = gy + Hk[k] + 4.2, y1 = gy + Hk[(k + 1) % N] + 4.2;
      const a0 = P(k, 0.75, 0), a1 = P(k + 1, 0.75, 0), b0 = P(k, 1.03, 0), b1 = P(k + 1, 1.03, 0);
      a0[1] = b0[1] = y0; a1[1] = b1[1] = y1;
      acc.quad(a0, a1, b1, b0, [0.88, 0.89, 0.91]);
      acc.quad([a0[0], y0 - 1.4, a0[2]], [a1[0], y1 - 1.4, a1[2]], a1, a0, [0.58, 0.60, 0.64]);
      if (k % 4 === 0) acc.box(a0[0], a0[2], y0 - 2.1, y0 - 1.4, 1.6, 0.55, (k / N) * Math.PI * 2, LED_GLOW);
      // Radial cantilever roof truss (rear mast pylon, sloped top tension chord, bottom chord & web struts)
      if (k % 3 === 0) {
        const rim = P(k, 1.0, 0), mid = P(k, 0.88, 0), tip = P(k, 0.75, 0);
        const yRim = gy + Hk[k];
        acc.beam([rim[0], yRim, rim[2]], [rim[0], y0 + 2.8, rim[2]], 0.38, 0.38, TRUSS_STEEL);
        acc.beam([rim[0], y0 + 2.6, rim[2]], [tip[0], y0 + 0.15, tip[2]], 0.24, 0.24, TRUSS_STEEL);
        acc.beam([rim[0], y0 - 0.9, rim[2]], [tip[0], y0 - 1.2, tip[2]], 0.28, 0.28, CONCRETE_DK);
        acc.beam([mid[0], y0 - 1.05, mid[2]], [mid[0], y0 + 1.35, mid[2]], 0.18, 0.18, TRUSS_STEEL);
        acc.beam([rim[0], y0 - 0.9, rim[2]], [mid[0], y0 + 1.35, mid[2]], 0.16, 0.16, TRUSS_STEEL);
      }
    }
  }
  // 4 Corner Floodlight Towers with lattice cross-bracing, catwalk & angled multi-row LED light banks
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const dirx = su * ux * 0.8 - sv * uz * 0.6, dirz = su * uz * 0.8 + sv * ux * 0.6;
    const ang = Math.atan2(dirz, dirx);
    const k = Math.round(((ang < 0 ? ang + Math.PI * 2 : ang) / (Math.PI * 2)) * N) % N;
    const q = P(k, 1.04, 0);
    const top = gy + Hk[k] + 20;
    const tx = -Math.sin(ang), tz = Math.cos(ang);
    const rx = -Math.cos(ang), rz = -Math.sin(ang); // inward toward field center
    // Twin-leg steel lattice mast + horizontal & diagonal cross-braces
    for (const sLeg of [-1.4, 1.4]) {
      acc.beam([q[0] + tx * sLeg, gy, q[2] + tz * sLeg], [q[0] + tx * sLeg * 0.65, top, q[2] + tz * sLeg * 0.65], 0.42, 0.42, TRUSS_STEEL);
    }
    for (let br = 0.25; br <= 0.85; br += 0.2) {
      const by = gy + (top - gy) * br;
      const bw = 1.4 * (1 - br * 0.32);
      acc.beam([q[0] - tx * bw, by, q[2] - tz * bw], [q[0] + tx * bw, by, q[2] + tz * bw], 0.22, 0.22, CONCRETE_DK);
    }
    // Upper catwalk platform + tilted LED floodlight bank facing inward toward (cx, gy, cz)
    acc.box(q[0], q[2], top - 0.8, top - 0.3, 4.8, 1.1, ang + Math.PI / 2, CONCRETE_DK);
    for (let row = 0; row < 3; row++) {
      const ry = top + 0.4 + row * 1.35;
      const rf = row * 0.42; // tilted forward at top
      const bx = q[0] + rx * rf, bz = q[2] + rz * rf;
      acc.beam([bx - tx * 4.4, ry, bz - tz * 4.4], [bx + tx * 4.4, ry, bz + tz * 4.4], 0.32, 0.48, [0.26, 0.28, 0.31]);
      for (let col = -2; col <= 2; col++) {
        const lx = bx + tx * (col * 1.65) + rx * 0.34, lz = bz + tz * (col * 1.65) + rz * 0.34;
        acc.box(lx, lz, ry - 0.42, ry + 0.42, 0.68, 0.16, ang + Math.PI / 2, LED_GLOW, LED_GLOW);
      }
    }
  }
  // End-Zone Jumbotron Video Scoreboards (mounted above both end-zone stands facing the field)
  for (const sgn of [-1, 1]) {
    const endAng = Math.atan2(sgn * uz, sgn * ux);
    const kEnd = Math.round(((endAng < 0 ? endAng + Math.PI * 2 : endAng) / (Math.PI * 2)) * N) % N;
    const qEnd = P(kEnd, 0.94, 0);
    const sbBaseY = gy + Hk[kEnd] + (H >= 20 ? 4.4 : 0.6);
    const sbTopY = sbBaseY + 7.2;
    const tx = -sgn * uz, tz = sgn * ux;
    const inX = -sgn * ux, inZ = -sgn * uz;
    const halfW = Math.min(8.5, Math.max(5.5, depth * 0.24));
    for (const sx of [-halfW * 0.65, halfW * 0.65]) {
      acc.beam([qEnd[0] + tx * sx, gy + Hk[kEnd] * 0.85, qEnd[2] + tz * sx], [qEnd[0] + tx * sx, sbTopY, qEnd[2] + tz * sx], 0.38, 0.38, CONCRETE_DK);
    }
    const sbYaw = endAng + Math.PI / 2;
    acc.box(qEnd[0], qEnd[2], sbBaseY, sbTopY, halfW, 0.75, sbYaw, [0.16, 0.18, 0.21]);
    // Illuminated LED screen face + team header banner + score ticker strip
    const fx = qEnd[0] + inX * 0.82, fz = qEnd[2] + inZ * 0.82;
    const pL = [fx - tx * (halfW - 0.5), fz - tz * (halfW - 0.5)];
    const pR = [fx + tx * (halfW - 0.5), fz + tz * (halfW - 0.5)];
    acc.quad([pL[0], sbBaseY + 1.4, pL[1]], [pR[0], sbBaseY + 1.4, pR[1]], [pR[0], sbTopY - 1.2, pR[1]], [pL[0], sbTopY - 1.2, pL[1]], [0.14, 0.58, 0.92]);
    acc.quad([pL[0], sbTopY - 1.15, pL[1]], [pR[0], sbTopY - 1.15, pR[1]], [pR[0], sbTopY - 0.3, pR[1]], [pL[0], sbTopY - 0.3, pL[1]], team);
    acc.quad([pL[0], sbBaseY + 0.35, pL[1]], [pR[0], sbBaseY + 0.35, pR[1]], [pR[0], sbBaseY + 1.3, pR[1]], [pL[0], sbBaseY + 1.3, pL[1]], LED_GLOW);
  }

  // Stand colliders: 18 sectors x 2 bands (lower tier / upper tier), so vehicles and the heli hit the bowl
  for (let k = 0; k < N; k += 4) {
    for (const [f0, f1, yF] of [[0, 0.5, 0.45], [0.5, 1.0, 1.0]]) {
      const ring = [];
      let hMax = 0;
      for (let j = k; j <= k + 4; j++) { const q = P(j, f0, 0); ring.push([q[0], q[2]]); hMax = Math.max(hMax, Hk[j % N]); }
      for (let j = k + 4; j >= k; j--) { const q = P(j, f1, 0); ring.push([q[0], q[2]]); }
      pushCollider(cols, ox, oz, ring, gy + hMax * yF);
    }
  }
  // Arches (e.g. Wembley): parabolic lattice tube between the footprint's far ends
  for (const [x1, z1, x2, z2, ah] of s.arches || []) {
    const ya = getBeijingTerrainElevation(ox + x1, oz + z1), yb = getBeijingTerrainElevation(ox + x2, oz + z2);
    const A = (t) => [x1 + (x2 - x1) * t, ya + (yb - ya) * t + ah * 4 * t * (1 - t), z1 + (z2 - z1) * t];
    for (let i = 0; i < 32; i++) {
      const a = A(i / 32), b = A((i + 1) / 32);
      acc.beam(a, b, 2.2, 2.2, WHITE);
      if (i % 2 === 0) acc.beam([a[0], a[1] - 2.2, a[2]], [a[0], a[1] + 2.2, a[2]], 2.6, 0.3, [0.8, 0.8, 0.82]);
    }
  }

  // Field surface + markings
  const fy = gy + 0.35, my = gy + 0.38;
  acc.poly(inner, fy - 0.01, TURF_EDGE);
  if (sport === 'baseball') {
    buildBaseball(acc, fieldPts, cx, cz, centroid(outer), fy, my);
    return;
  }
  const hl = L / 2, hw = Wd / 2;
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    const u0 = -hl + (L * i) / stripes, u1 = -hl + (L * (i + 1)) / stripes;
    const a = W(u0, -hw), b = W(u1, -hw), c = W(u1, hw), d = W(u0, hw);
    acc.quad([a[0], fy, a[1]], [b[0], fy, b[1]], [c[0], fy, c[1]], [d[0], fy, d[1]], i % 2 ? TURF_A : TURF_B);
  }
  const ln = (u1, v1, u2, v2, w = 0.3) => { const a = W(u1, v1), b = W(u2, v2); acc.line(a[0], a[1], b[0], b[1], my, w, WHITE); };
  const k = L / (sport === 'american_football' ? 109.7 : 105);
  ln(-hl, -hw, hl, -hw); ln(-hl, hw, hl, hw); ln(-hl, -hw, -hl, hw); ln(hl, -hw, hl, hw);
  if (sport === 'american_football') {
    const ez = 9.14 * k;
    for (const sgn of [-1, 1]) {
      const a = W(sgn * hl, -hw), b = W(sgn * (hl - ez), -hw), c = W(sgn * (hl - ez), hw), d = W(sgn * hl, hw);
      acc.quad([a[0], fy + 0.01, a[1]], [b[0], fy + 0.01, b[1]], [c[0], fy + 0.01, c[1]], [d[0], fy + 0.01, d[1]], team);
      // goal posts
      const g = W(sgn * (hl + 0.5), 0);
      acc.beam([g[0], gy, g[1]], [g[0], gy + 3, g[1]], 0.15, 0.15, [0.95, 0.85, 0.15]);
      const g1 = W(sgn * (hl + 0.5), -2.8), g2 = W(sgn * (hl + 0.5), 2.8);
      acc.beam([g1[0], gy + 3, g1[1]], [g2[0], gy + 3, g2[1]], 0.12, 0.12, [0.95, 0.85, 0.15]);
      acc.beam([g1[0], gy + 3, g1[1]], [g1[0], gy + 9, g1[1]], 0.1, 0.1, [0.95, 0.85, 0.15]);
      acc.beam([g2[0], gy + 3, g2[1]], [g2[0], gy + 9, g2[1]], 0.1, 0.1, [0.95, 0.85, 0.15]);
    }
    const play = L - 2 * ez;
    for (let i = 0; i <= 20; i++) {
      const u = -hl + ez + (play * i) / 20;
      ln(u, -hw, u, hw, i % 2 ? 0.2 : 0.35);
    }
    for (let i = 1; i < 100; i++) { // hash marks every yard
      if (i % 5 === 0) continue;
      const u = -hl + ez + (play * i) / 100;
      ln(u, -hw * 0.22, u, -hw * 0.18, 0.15); ln(u, hw * 0.18, u, hw * 0.22, 0.15);
    }
    const c0 = W(0, 0);
    acc.disc(c0[0], c0[1], 5 * k, my + 0.005, team, 16);
  } else {
    ln(0, -hw, 0, hw);
    const c0 = W(0, 0), r = 9.15 * k;
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
      const p = W(Math.cos(a0) * r, Math.sin(a0) * r), q = W(Math.cos(a1) * r, Math.sin(a1) * r);
      acc.line(p[0], p[1], q[0], q[1], my, 0.25, WHITE);
    }
    acc.disc(c0[0], c0[1], 0.4, my + 0.005, WHITE, 8);
    for (const sgn of [-1, 1]) {
      const pb = 16.5 * k, pw = 20.15 * k, gb = 5.5 * k, gw = 9.16 * k;
      ln(sgn * hl, -pw, sgn * (hl - pb), -pw); ln(sgn * (hl - pb), -pw, sgn * (hl - pb), pw); ln(sgn * (hl - pb), pw, sgn * hl, pw);
      ln(sgn * hl, -gw, sgn * (hl - gb), -gw); ln(sgn * (hl - gb), -gw, sgn * (hl - gb), gw); ln(sgn * (hl - gb), gw, sgn * hl, gw);
      const g1 = W(sgn * (hl + 0.3), -3.66 * k), g2 = W(sgn * (hl + 0.3), 3.66 * k);
      acc.beam([g1[0], gy, g1[1]], [g1[0], gy + 2.44, g1[1]], 0.08, 0.08, WHITE);
      acc.beam([g2[0], gy, g2[1]], [g2[0], gy + 2.44, g2[1]], 0.08, 0.08, WHITE);
      acc.beam([g1[0], gy + 2.44, g1[1]], [g2[0], gy + 2.44, g2[1]], 0.08, 0.08, WHITE);
    }
  }
}

function buildBaseball(acc, fieldPts, cx, cz, oc, fy, my) {
  // Home plate: the field vertex pointing toward the main stands (stands wrap home plate)
  let hx = fieldPts[0][0], hz = fieldPts[0][1];
  let dx = oc[0] - cx, dz = oc[1] - cz;
  if (Math.hypot(dx, dz) < 3) {
    let far = -1;
    for (const p of fieldPts) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d > far) { far = d; dx = p[0] - cx; dz = p[1] - cz; } }
  }
  let best = -Infinity;
  for (const p of fieldPts) { const s = (p[0] - cx) * dx + (p[1] - cz) * dz; if (s > best) { best = s; hx = p[0]; hz = p[1]; } }
  // direction from home plate toward centre field
  let fx = cx - hx, fz = cz - hz;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl; fz /= fl;
  hx += fx * 6; hz += fz * 6;
  const rot = (a) => [fx * Math.cos(a) - fz * Math.sin(a), fx * Math.sin(a) + fz * Math.cos(a)];
  // outfield grass = field polygon
  acc.poly(fieldPts, fy, TURF_B);
  // infield dirt fan (radius 29m)
  const dirt = [[hx, hz]];
  for (let i = 0; i <= 12; i++) { const [ax, az] = rot(-Math.PI / 4 + (i / 12) * (Math.PI / 2)); dirt.push([hx + ax * 29, hz + az * 29]); }
  acc.poly(dirt, fy + 0.01, DIRT);
  // infield grass diamond
  const b = 27.43;
  const [r1x, r1z] = rot(-Math.PI / 4), [r2x, r2z] = rot(Math.PI / 4);
  const home = [hx, hz], first = [hx + r1x * b, hz + r1z * b], third = [hx + r2x * b, hz + r2z * b], second = [hx + fx * b * Math.SQRT2, hz + fz * b * Math.SQRT2];
  const shrink = (p, k) => [hx + fx * b * 0.707 + (p[0] - hx - fx * b * 0.707) * k, hz + fz * b * 0.707 + (p[1] - hz - fz * b * 0.707) * k];
  acc.poly([home, first, second, third].map((p) => shrink(p, 0.8)), fy + 0.02, TURF_A);
  // mound, plate, bases
  acc.disc(hx + fx * 18.4, hz + fz * 18.4, 2.7, fy + 0.03, DIRT, 14);
  acc.disc(hx, hz, 4, fy + 0.025, DIRT, 14);
  for (const p of [home, first, second, third]) acc.box(p[0], p[1], fy, fy + 0.12, 0.25, 0.25, 0, WHITE);
  // foul lines to the wall
  for (const [ax, az] of [[r1x, r1z], [r2x, r2z]]) {
    const l = rayExit(hx, hz, ax, az, fieldPts);
    const len = Number.isFinite(l) ? l : 95;
    acc.line(hx, hz, hx + ax * len, hz + az * len, my, 0.2, WHITE);
    acc.beam([hx + ax * len, fy, hz + az * len], [hx + ax * len, fy + 22, hz + az * len], 0.3, 0.3, [0.95, 0.85, 0.15]);
  }
}

// ------------------------------------------------------------------ theme park rides (static parts)
function coasterCurve(r, ox, oz) {
  const pts = [];
  const N = 120;
  const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
  const gy = getBeijingTerrainElevation(ox + r.x, oz + r.z);
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, f = i / N;
    const u = r.a * (Math.cos(t) + 0.18 * Math.cos(3 * t)), v = r.b * (Math.sin(t) + 0.22 * Math.sin(2 * t));
    const hill = f < 0.22 ? f / 0.22 : (1 - (f - 0.22) / 0.78) * (0.55 + 0.45 * Math.cos((2 * Math.PI * 3 * (f - 0.22)) / 0.78));
    pts.push([r.x + u * c - v * s, gy + 1.6 + r.h * Math.max(0.0, hill), r.z + u * s + v * c]);
  }
  return { pts, gy };
}

function buildRide(acc, r, ox, oz, anim, cols) {
  const rnd = rng32(r.seed || 1);
  const col = BRIGHT[Math.floor(rnd() * BRIGHT.length)];
  const gy = getBeijingTerrainElevation(ox + r.x, oz + r.z);
  const pad = (rad) => acc.disc(r.x, r.z, rad, gy + 0.3, PATH, 18);
  if (r.k === 'coaster') {
    const { pts } = coasterCurve(r, ox, oz);
    const spine = r.wood ? [0.55, 0.40, 0.26] : col;
    const rail = r.wood ? [0.35, 0.3, 0.25] : [0.75, 0.76, 0.78];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
      const sx = (-dz / l) * 0.55, sz = (dx / l) * 0.55;
      acc.beam([p[0] + sx, p[1], p[2] + sz], [q[0] + sx, q[1], q[2] + sz], 0.09, 0.09, rail);
      acc.beam([p[0] - sx, p[1], p[2] - sz], [q[0] - sx, q[1], q[2] - sz], 0.09, 0.09, rail);
      acc.beam([p[0], p[1] - 0.45, p[2]], [q[0], q[1] - 0.45, q[2]], 0.28, 0.22, spine);
      if (i % 3 === 0) {
        const g = getBeijingTerrainElevation(ox + p[0], oz + p[2]);
        if (p[1] - 0.7 > g + 0.5) {
          const w = r.wood ? 0.45 : 0.3;
          acc.beam([p[0], g, p[2]], [p[0], p[1] - 0.6, p[2]], w, w, r.wood ? [0.62, 0.48, 0.32] : [0.86, 0.86, 0.84]);
          if (r.wood && i % 6 === 0) acc.beam([p[0] - sx * 3, g, p[2] - sz * 3], [p[0], p[1] - 0.8, p[2]], 0.18, 0.18, [0.62, 0.48, 0.32]);
        }
      }
    }
    // station at the end of the circuit (track lowest point)
    const st = pts[n - 4], st2 = pts[n - 1];
    const yaw = Math.atan2(st2[2] - st[2], st2[0] - st[0]);
    const sg = getBeijingTerrainElevation(ox + st[0], oz + st[2]);
    acc.box(st[0], st[2], sg, sg + 1.0, 9, 3.5, yaw, CONCRETE);
    acc.box(st[0], st[2], sg + 4.2, sg + 4.6, 9.5, 4, yaw, col, col);
    const arr = new Float32Array(n * 3);
    pts.forEach((p, i) => { arr[i * 3] = ox + p[0]; arr[i * 3 + 1] = p[1] + 0.35; arr[i * 3 + 2] = oz + p[2]; });
    pushCollider(cols, ox, oz, rectRing(st[0], st[2], 9.5, 4, yaw), sg + 4.6);
    anim.push({ t: 'coaster', pts: arr, cars: r.a < 26 ? 4 : 6, col, cx: ox + r.x, cz: oz + r.z });
    return;
  }
  if (r.k === 'wheel') {
    const R = r.r || 18, hub = gy + R + 3.5, yaw = rnd() * Math.PI;
    const ax = Math.cos(yaw), az = Math.sin(yaw); // axle direction
    const px = -az, pz = ax; // wheel plane direction
    pad(R * 0.55);
    for (const sa of [-1, 1]) {
      const hubP = [r.x + ax * sa * 2.6, hub, r.z + az * sa * 2.6];
      for (const sp of [-1, 1]) {
        const foot = [r.x + px * sp * R * 0.5 + ax * sa * 4.5, gy, r.z + pz * sp * R * 0.5 + az * sa * 4.5];
        acc.beam(foot, hubP, 0.45, 0.45, WHITE);
      }
    }
    acc.beam([r.x - ax * 2.8, hub, r.z - az * 2.8], [r.x + ax * 2.8, hub, r.z + az * 2.8], 0.6, 0.6, CONCRETE_DK);
    acc.box(r.x, r.z, gy, gy + 1.2, 4, 3, yaw, CONCRETE, col);
    pushCollider(cols, ox, oz, rectRing(r.x, r.z, R + 1, 4.5, Math.atan2(pz, px)), hub + R + 1);
    anim.push({ t: 'wheel', x: ox + r.x, y: hub, z: oz + r.z, r: R, yaw, col });
    return;
  }
  if (r.k === 'tower') {
    const H = r.h || 55;
    pad(9);
    acc.box(r.x, r.z, gy, gy + 2, 6, 6, 0, CONCRETE);
    acc.box(r.x, r.z, gy, gy + H, 1.6, 1.6, 0, [0.85, 0.85, 0.85]);
    acc.box(r.x, r.z, gy + H, gy + H + 3, 2.6, 2.6, 0, col, col);
    pushCollider(cols, ox, oz, rectRing(r.x, r.z, 3.5, 3.5, 0), gy + H + 3);
    anim.push({ t: 'tower', x: ox + r.x, y0: gy + 2.5, y1: gy + H - 5, z: oz + r.z, col });
    return;
  }
  if (r.k === 'carousel' || r.k === 'swing' || r.k === 'spinner') {
    const R = r.k === 'carousel' ? 8 : r.k === 'swing' ? 9 : 7;
    pad(R + 3);
    acc.disc(r.x, r.z, R + 0.6, gy + 0.6, CONCRETE, 18);
    if (r.k === 'swing') acc.box(r.x, r.z, gy, gy + 17, 0.8, 0.8, 0, WHITE);
    pushCollider(cols, ox, oz, rectRing(r.x, r.z, R + 0.6, R + 0.6, 0), gy + (r.k === 'swing' ? 17 : r.k === 'carousel' ? R * 0.95 : 4));
    anim.push({ t: r.k, x: ox + r.x, y: gy + 0.65, z: oz + r.z, r: R, col });
    return;
  }
  // kiosk / unnamed attraction: little striped-roof stand
  pad(6);
  kiosk(acc, r.x + 2, r.z, gy, col, rnd() * Math.PI);
  kiosk(acc, r.x - 3, r.z + 3, gy, BRIGHT[(Math.floor(rnd() * 6) + 1) % 6], rnd() * Math.PI);
}

function kiosk(acc, x, z, gy, col, yaw) {
  acc.box(x, z, gy, gy + 2.6, 1.8, 1.8, yaw, [0.93, 0.9, 0.82]);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]].map(([u, v]) => [x + u * c - v * s, gy + 2.6, z + u * s + v * c]);
  const apex = [x, gy + 4.2, z];
  for (let i = 0; i < 4; i++) acc.tri(P[i], P[(i + 1) % 4], apex, i % 2 ? col : WHITE);
}

// ------------------------------------------------------------------ build (worker, stage 3)
export function buildVenues(ctx) {
  const { data, ox, oz, groups, mats, colliders, isPointInWater } = ctx;
  const v = data && data.venues;
  if (!v) return null;
  const inW = (x, z, m = 1.5) => Boolean(isPointInWater && isPointInWater(x, z, m));
  const acc = new Accum();
  const anim = [];
  const lat = data.places ? data.places.lat : 0;
  const lon = data.places ? data.places.lon : 0;
  const us = lat > 18 && lat < 72 && lon > -170 && lon < -50;
  for (const s of v.stadiums || []) {
    if (isPointInWater && s.outer && s.outer.length >= 6) {
      let sx = 0, sz = 0, wet = false;
      for (let k = 0; k < s.outer.length; k += 2) {
        sx += s.outer[k]; sz += s.outer[k + 1];
        if (inW(s.outer[k], s.outer[k + 1], 1.0)) { wet = true; break; }
      }
      if (wet || inW(sx / (s.outer.length >> 1), sz / (s.outer.length >> 1), 1.0)) continue;
    }
    try { buildStadium(acc, { ...s, us }, ox, oz, colliders); } catch (e) { /* malformed footprint: skip */ }
  }
  for (const r of v.rides || []) {
    const rad = r.k === 'coaster' ? Math.max(r.a || 20, r.b || 12) : r.k === 'wheel' ? (r.r || 16) : 8;
    if (inW(r.x, r.z, 2.0) || inW(r.x + rad, r.z, 1.0) || inW(r.x - rad, r.z, 1.0) || inW(r.x, r.z + rad, 1.0) || inW(r.x, r.z - rad, 1.0)) continue;
    buildRide(acc, r, ox, oz, anim, colliders);
  }
  for (const [x1, z1, x2, z2] of v.paths || []) {
    const l = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(l / 20));
    for (let i = 0; i < n; i++) {
      const a = [x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n], b = [x1 + ((x2 - x1) * (i + 1)) / n, z1 + ((z2 - z1) * (i + 1)) / n];
      if (inW(a[0], a[1], 1.0) || inW(b[0], b[1], 1.0) || inW((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, 1.0)) continue;
      const y = (getBeijingTerrainElevation(ox + a[0], oz + a[1]) + getBeijingTerrainElevation(ox + b[0], oz + b[1])) / 2 + 0.28;
      acc.line(a[0], a[1], b[0], b[1], y, 4.5, PATH);
    }
  }
  const mesh = acc.toMesh(mats.facilityMat);
  if (mesh && groups && groups.facilities) groups.facilities.add(mesh);
  return anim.length ? { anim } : null;
}
