/**
 * Cartographic vector-tile layer for the 2D map and minimap.
 *
 * - Fetches OpenFreeMap MVT tiles (own LRU, independent of the 3D chunk cache)
 *   and decodes them with the shared decoder in global_tiles.js.
 * - Converts features into tile-local Web-Mercator units [0..1].
 * - Rasterises each (virtual) tile once into a 512px canvas (no labels), so
 *   panning / zooming / the rotating minimap are just cheap drawImage calls.
 * - Exposes label candidates (places, road names) for screen-space placement.
 */
import { discoverTileTemplate, decodeMvtTile, fetchDecodedMvtTile } from '../global_tiles.js';

export const DATA_MAX_Z = 14;
export const RASTER_PX = 512;

// ---------------------------------------------------------------------------
// Projection helpers (normalised Web Mercator, 0..1)
// ---------------------------------------------------------------------------
export function lonToMx(lon) {
  return (lon + 180) / 360;
}
export function latToMy(lat) {
  const c = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((c * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
export function mxToLon(mx) {
  return mx * 360 - 180;
}
export function myToLat(my) {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
}
/** Metres per normalised mercator unit at a latitude. */
export function metersPerUnit(lat) {
  return 40075016.686 * Math.cos((lat * Math.PI) / 180);
}

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------
export const MAP_STYLE = {
  land: '#1b1e23',
  water: '#122235',
  park: '#1c2a23',
  wood: '#1b271f',
  residential: '#1e2126',
  industrial: '#202127',
  building: '#272b32',
  buildingEdge: '#2e333b',
  casing: '#121418',
  route: '#4aa3ff',
  routeCasing: 'rgba(8, 20, 40, 0.75)',
};

const ROAD_RANK = {
  path: 0, track: 1, service: 2, minor: 3, tertiary: 4, secondary: 5, primary: 6, trunk: 7, motorway: 8,
};
const ROAD_COLOR = {
  path: '#30343b', track: '#33373e', service: '#383c44', minor: '#41464f', tertiary: '#4f545e',
  secondary: '#5b616b', primary: '#6f7580', trunk: '#8c7b55', motorway: '#a68a52',
};
// Width in raster px at z14 (tile = 512px).
const ROAD_W14 = {
  path: 1.0, track: 1.2, service: 1.8, minor: 3.0, tertiary: 4.0,
  secondary: 4.6, primary: 5.4, trunk: 6.0, motorway: 6.6,
};

function roadClass(tags) {
  const c = tags.class || '';
  if (c === 'motorway' || c === 'trunk' || c === 'primary' || c === 'secondary' || c === 'tertiary' ||
      c === 'minor' || c === 'service' || c === 'track') return c;
  if (c === 'path') return 'path';
  if (c === 'busway' || c === 'raceway') return 'minor';
  return null; // rail, transit, ferry, aerialway... not drawn
}

function roadWidth(cls, z) {
  const w = ROAD_W14[cls] * Math.pow(1.55, z - 14);
  return Math.max(cls === 'path' || cls === 'track' ? 0.5 : 0.8, w);
}

function minZoomForRoad(cls) {
  if (cls === 'path' || cls === 'track') return 15;
  if (cls === 'service') return 14;
  if (cls === 'minor') return 12;
  return 0;
}

export function pickName(tags, lang) {
  if (lang === 'zh') return tags.name || tags['name:zh'] || tags['name:latin'] || tags.name_en || '';
  return tags['name:en'] || tags.name_en || tags['name:latin'] || tags.name_int || tags.name || '';
}

// ---------------------------------------------------------------------------
// Tile data store (fetch + decode + prepare), LRU
// ---------------------------------------------------------------------------
const MAX_DATA_TILES = 260;
const MAX_RASTERS = 140;
const MAX_CONCURRENT = 4;

const dataStore = new Map(); // key -> { prep } | { pending, job } | { failed, at }
const queue = []; // { key, z, x, y, wanted, resolve? }
let active = 0;
const readyListeners = new Set();

/** Registers a callback fired whenever a tile finishes loading. */
export function addTileReadyListener(fn) {
  readyListeners.add(fn);
}

function touch(map, key, val) {
  map.delete(key);
  map.set(key, val);
}

function evict(map, max, onEvict) {
  let guard = map.size;
  while (map.size > max && guard-- > 0) {
    const k = map.keys().next().value;
    const v = map.get(k);
    if (v && v.pending) {
      touch(map, k, v); // never evict in-flight entries
      continue;
    }
    map.delete(k);
    if (onEvict) onEvict(v);
  }
}

async function fetchAndPrepare(z, x, y, shared) {
  if (shared) {
    // Minimap tiles are the same Z14 tiles the 3D streamer already decoded: reuse them.
    return prepareTile((await fetchDecodedMvtTile(z, x, y)) || {}, z, x, y);
  }
  const tpl = await discoverTileTemplate();
  const url = tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const resp = await fetch(url);
  if (!resp.ok) return prepareTile({}, z, x, y);
  let buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return prepareTile(decodeMvtTile(buf, z, x, y), z, x, y);
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    queue.sort((a, b) => a.wanted - b.wanted); // most recently wanted last
    const job = queue.pop();
    if (!job.resolve && performance.now() - job.wanted > 4000) {
      dataStore.delete(job.key); // no longer on screen
      continue;
    }
    active++;
    fetchAndPrepare(job.z, job.x, job.y, job.shared)
      .then((prep) => {
        dataStore.set(job.key, { prep });
        if (job.resolve) job.resolve(prep);
        for (const fn of readyListeners) fn(job.key);
      })
      .catch(() => {
        dataStore.set(job.key, { failed: true, at: performance.now() });
        if (job.resolve) job.resolve(null);
      })
      .finally(() => {
        active--;
        evict(dataStore, MAX_DATA_TILES);
        pump();
      });
  }
}

function enqueue(key, z, x, y, resolve, shared = false) {
  const job = { key, z, x, y, wanted: performance.now(), resolve, shared };
  dataStore.set(key, { pending: true, job });
  queue.push(job);
  pump();
}

/** Returns prepared tile data if cached, otherwise schedules a fetch and returns null. */
export function getTileData(z, x, y, shared = false) {
  const key = `${z}/${x}/${y}`;
  const e = dataStore.get(key);
  if (e) {
    if (e.prep) {
      touch(dataStore, key, e);
      return e.prep;
    }
    if (e.job) {
      e.job.wanted = performance.now();
      return null;
    }
    if (e.failed && performance.now() - e.at < 15000) return null;
  }
  enqueue(key, z, x, y, null, shared && z === DATA_MAX_Z);
  return null;
}

/** Promise-based fetch (used by routing). Resolves to prepared data or null. */
export function loadTileData(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const e = dataStore.get(key);
  if (e && e.prep) return Promise.resolve(e.prep);
  return new Promise((resolve) => {
    if (e && e.job) {
      const prev = e.job.resolve;
      e.job.resolve = (p) => {
        if (prev) prev(p);
        resolve(p);
      };
      e.job.wanted = performance.now();
      return;
    }
    enqueue(key, z, x, y, resolve);
  });
}

// ---------------------------------------------------------------------------
// Prepare: lat/lon -> tile-local mercator [0..1]
// ---------------------------------------------------------------------------
function ringToLocal(ring, n, x, y) {
  const out = new Float32Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) {
    out[i * 2] = lonToMx(ring[i][1]) * n - x;
    out[i * 2 + 1] = latToMy(ring[i][0]) * n - y;
  }
  return out;
}

function bboxOf(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const u = pts[i], v = pts[i + 1];
    if (u < a) a = u;
    if (u > c) c = u;
    if (v < b) b = v;
    if (v > d) d = v;
  }
  return [a, b, c, d];
}

function polysToLocal(geom, n, x, y) {
  const out = [];
  for (const p of geom) {
    const rings = [ringToLocal(p.outer, n, x, y)];
    for (const h of p.holes) rings.push(ringToLocal(h, n, x, y));
    rings.bb = bboxOf(rings[0]);
    out.push(rings);
  }
  return out;
}

const PLACE_MINZ = {
  continent: 0, country: 3, state: 6, city: 5, town: 9, village: 11, suburb: 11,
  island: 11.5, islet: 13, hamlet: 14, quarter: 14.5, neighbourhood: 15.8, isolated_dwelling: 16,
};

function prepareTile(layers, z, x, y) {
  const n = 1 << z;
  const prep = {
    z, x, y,
    water: [], park: [], wood: [], residential: [], industrial: [], buildings: [],
    waterways: [], roads: [], roadNames: [], places: [], driveLines: [],
  };

  for (const f of layers.water || []) {
    if (f.type === 3) prep.water.push(...polysToLocal(f.geom, n, x, y));
  }
  for (const f of layers.waterway || []) {
    if (f.type !== 2) continue;
    const cls = f.tags.class || 'stream';
    const w = cls === 'river' ? 2.4 : cls === 'canal' ? 1.8 : 0.9;
    for (const line of f.geom) {
      const pts = ringToLocal(line, n, x, y);
      prep.waterways.push({ w, pts, bb: bboxOf(pts) });
    }
  }
  for (const f of layers.park || []) {
    if (f.type === 3) prep.park.push(...polysToLocal(f.geom, n, x, y));
  }
  for (const f of layers.landcover || []) {
    if (f.type !== 3) continue;
    const c = f.tags.class || '';
    if (c === 'wood' || c === 'forest') prep.wood.push(...polysToLocal(f.geom, n, x, y));
    else if (c === 'grass' || c === 'park') prep.park.push(...polysToLocal(f.geom, n, x, y));
  }
  for (const f of layers.landuse || []) {
    if (f.type !== 3) continue;
    const c = f.tags.class || '';
    if (c === 'residential' || c === 'suburb' || c === 'neighbourhood') {
      prep.residential.push(...polysToLocal(f.geom, n, x, y));
    } else if (c === 'industrial' || c === 'commercial' || c === 'retail' || c === 'railway') {
      prep.industrial.push(...polysToLocal(f.geom, n, x, y));
    } else if (c === 'cemetery' || c === 'pitch' || c === 'stadium' || c === 'playground') {
      prep.park.push(...polysToLocal(f.geom, n, x, y));
    }
  }
  if (z >= 13) {
    for (const f of layers.building || []) {
      if (f.type === 3) prep.buildings.push(...polysToLocal(f.geom, n, x, y));
    }
  }
  for (const f of layers.transportation || []) {
    if (f.type !== 2) continue;
    const cls = roadClass(f.tags);
    if (!cls) continue;
    const brunnel = f.tags.brunnel || '';
    for (const line of f.geom) {
      const pts = ringToLocal(line, n, x, y);
      prep.roads.push({ cls, rank: ROAD_RANK[cls], bridge: brunnel === 'bridge', tunnel: brunnel === 'tunnel', pts, bb: bboxOf(pts) });
      if (cls !== 'path' && cls !== 'track') {
        prep.driveLines.push({ cls, oneway: f.tags.oneway | 0, latlon: line, pts });
      }
    }
  }
  prep.roads.sort((a, b) => a.rank - b.rank);

  for (const f of layers.transportation_name || []) {
    if (f.type !== 2) continue;
    const cls = f.tags.class || 'minor';
    const rank = ROAD_RANK[cls] ?? 3;
    for (const line of f.geom) {
      prep.roadNames.push({ tags: f.tags, cls, rank, pts: ringToLocal(line, n, x, y) });
    }
  }
  for (const f of layers.place || []) {
    if (f.type !== 1 || !f.geom.length) continue;
    const cls = f.tags.class || 'village';
    const p = f.geom[0];
    prep.places.push({
      tags: f.tags,
      cls,
      minZ: PLACE_MINZ[cls] ?? 12,
      rank: f.tags.rank | 0,
      u: lonToMx(p[1]) * n - x,
      v: latToMy(p[0]) * n - y,
    });
  }
  return prep;
}

// ---------------------------------------------------------------------------
// Raster tiles (virtual z may exceed DATA_MAX_Z: rendered from the ancestor)
// ---------------------------------------------------------------------------
const rasterStore = new Map(); // key -> canvas

export function getCachedRaster(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const c = rasterStore.get(key);
  if (c) touch(rasterStore, key, c);
  return c || null;
}

export function dataTileFor(z, x, y) {
  const dz = Math.min(z, DATA_MAX_Z);
  const sh = z - dz;
  return [dz, x >> sh, y >> sh];
}

/**
 * Returns a raster for virtual tile (z,x,y), creating it if its data is ready and
 * budget allows (`budget.n` is decremented per raster created).
 */
export function getRaster(z, x, y, budget) {
  const cached = getCachedRaster(z, x, y);
  if (cached) return cached;
  const [dz, dx, dy] = dataTileFor(z, x, y);
  const prep = getTileData(dz, dx, dy, !!(budget && budget.shared));
  if (!prep || !budget || budget.n <= 0) return null;
  budget.n--;
  const canvas = renderRaster(prep, z, x, y);
  rasterStore.set(`${z}/${x}/${y}`, canvas);
  evict(rasterStore, MAX_RASTERS, (c) => {
    if (c) {
      c.width = 0;
      c.height = 0;
    }
  });
  return canvas;
}

function visible(bb, ox, oy, span, m) {
  return !(bb[2] < ox - m || bb[0] > ox + span + m || bb[3] < oy - m || bb[1] > oy + span + m);
}

function pathPolys(ctx, polys, s, ox, oy, span) {
  ctx.beginPath();
  for (const rings of polys) {
    if (rings.bb && !visible(rings.bb, ox, oy, span, 0)) continue;
    for (const r of rings) {
      if (r.length < 6) continue;
      ctx.moveTo((r[0] - ox) * s, (r[1] - oy) * s);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo((r[i] - ox) * s, (r[i + 1] - oy) * s);
      ctx.closePath();
    }
  }
}

function pathLine(ctx, pts, s, ox, oy) {
  ctx.moveTo((pts[0] - ox) * s, (pts[1] - oy) * s);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo((pts[i] - ox) * s, (pts[i + 1] - oy) * s);
}

function renderRaster(prep, z, x, y) {
  const canvas = document.createElement('canvas');
  canvas.width = RASTER_PX;
  canvas.height = RASTER_PX;
  const ctx = canvas.getContext('2d');
  const sub = 1 << (z - prep.z);
  const s = RASTER_PX * sub; // data-tile unit -> px
  const ox = (x - prep.x * sub) / sub;
  const oy = (y - prep.y * sub) / sub;
  const span = 1 / sub;
  const m = 24 / s; // margin for line widths
  const st = MAP_STYLE;

  ctx.fillStyle = st.land;
  ctx.fillRect(0, 0, RASTER_PX, RASTER_PX);

  const fill = (polys, color) => {
    if (!polys.length) return;
    pathPolys(ctx, polys, s, ox, oy, span);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  };
  fill(prep.residential, st.residential);
  fill(prep.industrial, st.industrial);
  fill(prep.wood, st.wood);
  fill(prep.park, st.park);
  if (prep.water.length) {
    ctx.fillStyle = st.water;
    for (const rings of prep.water) {
      if (rings.bb && !visible(rings.bb, ox, oy, span, 0)) continue;
      ctx.beginPath();
      for (const r of rings) {
        if (r.length < 6) continue;
        ctx.moveTo((r[0] - ox) * s, (r[1] - oy) * s);
        for (let i = 2; i < r.length; i += 2) ctx.lineTo((r[i] - ox) * s, (r[i + 1] - oy) * s);
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
    // Restore dry land + park/wood inside any island holes so overlapping water polygons never drown islands
    let hasIslandHoles = false;
    ctx.beginPath();
    for (const rings of prep.water) {
      for (let h = 1; h < rings.length; h++) {
        const r = rings[h];
        if (r.length < 6) continue;
        hasIslandHoles = true;
        ctx.moveTo((r[0] - ox) * s, (r[1] - oy) * s);
        for (let i = 2; i < r.length; i += 2) ctx.lineTo((r[i] - ox) * s, (r[i + 1] - oy) * s);
        ctx.closePath();
      }
    }
    if (hasIslandHoles) {
      ctx.save();
      ctx.fillStyle = st.land;
      ctx.fill();
      ctx.clip();
      fill(prep.residential, st.residential);
      fill(prep.industrial, st.industrial);
      fill(prep.wood, st.wood);
      fill(prep.park, st.park);
      ctx.restore();
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (prep.waterways.length) {
    ctx.strokeStyle = st.water;
    for (const ww of prep.waterways) {
      if (!visible(ww.bb, ox, oy, span, m)) continue;
      ctx.lineWidth = Math.max(0.6, ww.w * Math.pow(1.5, z - 14));
      ctx.beginPath();
      pathLine(ctx, ww.pts, s, ox, oy);
      ctx.stroke();
    }
  }

  if (z >= 14 && prep.buildings.length) {
    pathPolys(ctx, prep.buildings, s, ox, oy, span);
    ctx.fillStyle = st.building;
    ctx.fill('evenodd');
    if (z >= 16) {
      ctx.strokeStyle = st.buildingEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Roads: batched by class; casing for tertiary+ and bridges.
  const roads = prep.roads.filter((r) => z >= minZoomForRoad(r.cls) && visible(r.bb, ox, oy, span, m));
  const drawPass = (list, casing) => {
    let i = 0;
    while (i < list.length) {
      const cls = list[i].cls;
      const tunnel = list[i].tunnel;
      ctx.beginPath();
      let j = i;
      while (j < list.length && list[j].cls === cls && list[j].tunnel === tunnel) {
        pathLine(ctx, list[j].pts, s, ox, oy);
        j++;
      }
      const w = roadWidth(cls, z);
      if (casing) {
        ctx.strokeStyle = st.casing;
        ctx.lineWidth = w + Math.max(1.2, w * 0.35);
      } else {
        ctx.strokeStyle = ROAD_COLOR[cls];
        ctx.lineWidth = w;
      }
      ctx.globalAlpha = tunnel ? 0.45 : 1;
      if (cls === 'path' && !casing) ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      i = j;
    }
  };
  const ground = roads.filter((r) => !r.bridge);
  const bridges = roads.filter((r) => r.bridge);
  if (z >= 12) drawPass(ground.filter((r) => r.rank >= 4), true);
  drawPass(ground, false);
  if (bridges.length) {
    drawPass(bridges, true);
    drawPass(bridges, false);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Label candidates for a data tile (cached per tile + lang)
// ---------------------------------------------------------------------------
export function getRoadLabelCandidates(prep, lang) {
  const key = `_roadLabels_${lang}`;
  if (prep[key]) return prep[key];
  const out = [];
  for (const rn of prep.roadNames) {
    const name = pickName(rn.tags, lang) || '';
    if (!name) continue;
    const p = rn.pts;
    // Label sits centred on the line's longest segment.
    let best = -1;
    let bestLen = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const l = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      if (l > bestLen) {
        bestLen = l;
        best = i;
      }
    }
    if (best < 0) continue;
    const mu = (p[best] + p[best + 2]) * 0.5;
    const mv = (p[best + 1] + p[best + 3]) * 0.5;
    if (mu < 0 || mu > 1 || mv < 0 || mv > 1) continue; // only label inside its own tile
    let ang = Math.atan2(p[best + 3] - p[best + 1], p[best + 2] - p[best]);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    out.push({ name, rank: rn.rank, cls: rn.cls, u: mu, v: mv, ang, segLen: bestLen });
  }
  out.sort((a, b) => b.rank - a.rank || b.segLen - a.segLen);
  prep[key] = out;
  return out;
}

const PLACE_ORDER = { country: 0, state: 1, city: 2, town: 3, island: 3, suburb: 4, village: 5, islet: 5, quarter: 6, neighbourhood: 7, hamlet: 8 };

export function getPlaceLabelCandidates(prep, lang) {
  const key = `_placeLabels_${lang}`;
  if (prep[key]) return prep[key];
  const out = [];
  for (const pl of prep.places) {
    const name = pickName(pl.tags, lang);
    if (!name) continue;
    if (pl.u < 0 || pl.u > 1 || pl.v < 0 || pl.v > 1) continue;
    out.push({ name, cls: pl.cls, minZ: pl.minZ, rank: pl.rank, u: pl.u, v: pl.v });
  }
  out.sort((a, b) => (PLACE_ORDER[a.cls] ?? 9) - (PLACE_ORDER[b.cls] ?? 9) || (a.rank || 99) - (b.rank || 99));
  prep[key] = out;
  return out;
}
