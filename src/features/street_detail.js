// [feature/street-detail] Real street-level detail from OpenStreetMap (Overpass API, keyless + CORS).
//
// Per Z15 slippy tile around the player (inner 3x3 only) we fetch individual OSM nodes:
//   natural=tree, highway=street_lamp|traffic_signals|crossing, emergency=fire_hydrant, amenity=bench|waste_basket
// and blend them into the existing systems instead of adding parallel ones:
//   - trees      -> extra instance table in VegetationSystem (same species meshes / LOD / wind, no new draw calls);
//                   procedural street trees within a few meters of a real tree are dropped.
//   - lamps, hydrants, benches, bins, signal poles -> a pseudo chunk in StreetFeatures (same instanced models,
//                   same night bulbs/halos/pools, same signal phase logic); nearby procedural duplicates are dropped.
//   - crossings  -> one instanced zebra-stripe mesh (mid-block crossings only; junctions already have them).
//   - a few real PointLights follow the nearest real lamps at night.
// Requests: ONE compact CSV query per missing area (the whole inner 3x3 in one bbox; split into rows, then single
// tiles, only if the big query fails), mirror health tracking (Retry-After, per-mirror backoff, hedged second
// mirror after HEDGE_MS), memory + IndexedDB cache, idle prefetch of the 3x3 ahead of travel, and a bundled
// precomputed seed (data/street_detail_sf.json) for the default San Francisco start.
// If Overpass is unreachable nothing changes: the procedural street furniture simply stays as it was.
import * as THREE from '../../vendor/three.module.js';
import { getDaylight } from './daylight.js';
import { getBeijingTerrainElevation } from '../environment.js';
import { INST_STRIDE, SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_AUTO } from './vegetation_worker.js';
import { resolveStreetRegion } from './street_worker.js';

// Keyless + CORS (Access-Control-Allow-Origin: *) Overpass instances. Health is tracked per mirror at runtime.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CH_MIRROR = 'https://overpass.osm.ch/api/interpreter'; // Switzerland-only extract: used (first) inside CH only
const inSwitzerland = (lat, lon) => lat > 45.8 && lat < 47.85 && lon > 5.9 && lon < 10.5;
const REQ_TIMEOUT_MS = 90000; // busy public instances often queue a request 60-110 s before answering
const HEDGE_MS = 12000; // no answer yet -> also ask the next healthy mirror; first answer wins, the other is aborted
const SEED_URL = 'data/street_detail_sf.json'; // relative: the app may be served from a sub-path (GitHub Pages)
const SEED_NEAR = (lat, lon) => Math.abs(lat - 37.78) < 0.25 && Math.abs(lon + 122.42) < 0.3;
const TZ = 15; // ~1 km tiles at mid latitudes
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const DB_NAME = 'we_street_detail';
const DB_STORE = 'tiles';
const MEM_TILES = 48;
const MIN_GAP_MS = 1500;
const HALF_WORLD = 20000;
const CHUNK = 1000;
const CAP = { trees: 3000, lamps: 700, hyd: 400, bench: 400, bins: 400, sig: 300, cross: 500 };
const SUPPRESS_R = { lamp: 22, hydrant: 40, bench: 25, bin: 25, tree: 8 };
const CAR = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link']);
const LEFT_HAND = new Set(['jp', 'uk', 'au']);
const MAX_STRIPES = 6000;
const N_LIGHTS = 2;

// CSV output with only the tags compactOsm() reads: ~5-10x smaller than JSON `out qt` with all tags.
const COLS = [
  '::lat', '::lon', 'natural', 'highway', 'emergency', 'amenity', 'genus', 'species', 'taxon', 'species:en', 'genus:en',
  'taxon:en', 'leaf_type', 'height', 'est_height', 'crossing', 'crossing:markings', 'crossing_ref', 'fire_hydrant:type',
  'traffic_signals',
];
const QUERY = (s, w, n, e) =>
  `[out:csv(${COLS.map((c) => (c.startsWith('::') ? c : `"${c}"`)).join(',')};false)][timeout:25][bbox:${s},${w},${n},${e}];(` +
  'node["natural"="tree"];' +
  'node["highway"~"^(street_lamp|traffic_signals|crossing)$"];' +
  'node["emergency"="fire_hydrant"];' +
  'node["amenity"~"^(bench|waste_basket)$"];' +
  ');out qt;';

/** Overpass CSV (QUERY) -> [{ type, lat, lon, tags }] nodes for compactOsm(). */
function parseCsv(text) {
  const els = [];
  for (const line of text.split('\n')) {
    const p = line.split('\t');
    if (p.length < COLS.length) continue;
    const lat = parseFloat(p[0]), lon = parseFloat(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tags = {};
    for (let i = 2; i < COLS.length; i++) if (p[i]) tags[COLS[i]] = p[i];
    els.push({ type: 'node', lat, lon, tags });
  }
  return els;
}

// ------------------------------------------------------------------------------------------------ tiles
function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
function tileBBox(x, y, z) {
  const n = 2 ** z;
  const lat = (yy) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { w: (x / n) * 360 - 180, e: ((x + 1) / n) * 360 - 180, n: lat(y), s: lat(y + 1) };
}

// ------------------------------------------------------------------------------------------------ OSM parsing
const PALM_RE = /palm|phoenix|washingtonia|syagrus|trachycarpus|archontophoenix|cocos|roystonea|butia|sabal|chamaerops/;
const CONIFER_RE = /pinus|pine|cupressus|cypress|sequoia|redwood|cedrus|cedar|picea|spruce|abies|\bfir\b|junip|thuja|taxus|podocarpus|araucaria|cryptomeria|chamaecyparis|larix|larch/;
const TALL_RE = /eucalyptus|platanus|plane|populus|poplar|lophostemon|ginkgo|liriodendron|melaleuca|sycamore|tulip/;
const BROADLEAF_RE = /broadleaf|broadleaved|quercus|oak|acer|maple|fagus|beech|betula|birch|fraxinus|ash|ulmus|elm|tilia|lime|linden|castanea|chestnut|salix|willow|prunus|cherry|magnolia|citrus|ficus|jacaranda|sophora|malus|pyrus|alnus|carpinus|juglans|carya/;

function treeSpecies(t) {
  const s = `${t.genus || ''} ${t.species || ''} ${t.taxon || ''} ${t['species:en'] || ''} ${t['genus:en'] || ''} ${t['taxon:en'] || ''}`.toLowerCase();
  if (PALM_RE.test(s) || t.leaf_type === 'palm') return SP_PALM;
  if (t.leaf_type === 'needleleaved' || CONIFER_RE.test(s)) return SP_CONIFER;
  if (TALL_RE.test(s)) return SP_TALL;
  if (t.leaf_type === 'broadleaved' || BROADLEAF_RE.test(s) || Boolean(t.genus || t.species || t.taxon)) return SP_BROADLEAF;
  return SP_AUTO; // untagged OSM tree -> local climate palette
}
const num = (v) => {
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : 0;
};

/** Overpass JSON -> compact lat/lon arrays (origin independent, cacheable). */
function compactOsm(json) {
  const out = { trees: [], lamps: [], hyd: [], bench: [], bins: [], sig: [], cross: [] };
  const els = (json && json.elements) || [];
  for (const el of els) {
    if (el.type !== 'node' || !el.tags) continue;
    const t = el.tags, lat = +el.lat.toFixed(7), lon = +el.lon.toFixed(7);
    if (t.natural === 'tree') {
      if (out.trees.length < CAP.trees * 4) out.trees.push(lat, lon, treeSpecies(t), num(t.height) || num(t.est_height));
    } else if (t.highway === 'street_lamp') {
      if (out.lamps.length < CAP.lamps * 2) out.lamps.push(lat, lon);
    } else if (t.highway === 'traffic_signals') {
      if (t.traffic_signals === 'signal' || !t.traffic_signals || t.traffic_signals === 'traffic_lights') {
        if (out.sig.length < CAP.sig * 2) out.sig.push(lat, lon);
      }
    } else if (t.highway === 'crossing') {
      const c = t.crossing || '', m = t['crossing:markings'] || '';
      if (c === 'unmarked' || c === 'no' || m === 'no' || t.crossing_ref === 'none') continue;
      if (out.cross.length < CAP.cross * 2) out.cross.push(lat, lon);
    } else if (t.emergency === 'fire_hydrant') {
      if (t['fire_hydrant:type'] === 'underground' || t['fire_hydrant:type'] === 'wall') continue;
      if (out.hyd.length < CAP.hyd * 2) out.hyd.push(lat, lon);
    } else if (t.amenity === 'bench') {
      if (out.bench.length < CAP.bench * 2) out.bench.push(lat, lon);
    } else if (t.amenity === 'waste_basket') {
      if (out.bins.length < CAP.bins * 2) out.bins.push(lat, lon);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ IndexedDB cache
let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}
async function dbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function dbPut(key, val) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(val, key);
  } catch { /* quota / private mode: memory cache only */ }
}

// ------------------------------------------------------------------------------------------------ spatial helpers
class PointGrid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
    this.size = 0;
  }
  add(x, z) {
    const k = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(x, z);
    this.size++;
  }
  /** true if any stored point lies within r (r <= cell) of (x, z) */
  near(x, z, r = this.cell) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell), r2 = r * r;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const a = this.map.get(`${cx + dx},${cz + dz}`);
        if (!a) continue;
        for (let i = 0; i < a.length; i += 2) {
          const ex = a[i] - x, ez = a[i + 1] - z;
          if (ex * ex + ez * ez < r2) return true;
        }
      }
    }
    return false;
  }
}

/** Per-chunk road index (cached): 25 m buckets of car-road segments + junction points + signal nodes. */
const roadIndexCache = new WeakMap();
function roadIndex(chunk) {
  let idx = roadIndexCache.get(chunk);
  if (idx) return idx;
  const segs = (chunk.userData.roadSegments || []).filter((s) => CAR.has(s.cls) && !s.tunnel && !s.bridge);
  const grid = new Map();
  const ends = new Map();
  const C = 25;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const pad = s.width * 0.5 + 6;
    const x0 = Math.floor((Math.min(s.x1, s.x2) - pad) / C), x1 = Math.floor((Math.max(s.x1, s.x2) + pad) / C);
    const z0 = Math.floor((Math.min(s.z1, s.z2) - pad) / C), z1 = Math.floor((Math.max(s.z1, s.z2) + pad) / C);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = (gx + 4096) * 8192 + gz + 4096;
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(i);
      }
    }
    for (const [x, z] of [[s.x1, s.z1], [s.x2, s.z2]]) {
      const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      let e = ends.get(k);
      if (!e) ends.set(k, (e = { x, z, n: 0, ids: new Set() }));
      e.n++;
      e.ids.add(s.id);
    }
  }
  const junctions = new PointGrid(20);
  for (const e of ends.values()) if (e.n >= 3 && e.ids.size >= 2) junctions.add(e.x, e.z);
  const signalNodes = new PointGrid(30);
  const sn = chunk.userData.street && chunk.userData.street.signalNodes;
  if (sn) for (let i = 0; i < sn.length; i += 4) signalNodes.add(sn[i] + chunk.userData.ox, sn[i + 1] + chunk.userData.oz);
  idx = { segs, grid, C, junctions, signalNodes };
  roadIndexCache.set(chunk, idx);
  return idx;
}

/** Nearest car road to (x, z) within maxD of its edge: { s, d, hw, y, dx, dz, fx, fz } (d = centerline distance). */
function nearestRoad(idx, x, z, maxD) {
  const a = idx.grid.get((Math.floor(x / idx.C) + 4096) * 8192 + Math.floor(z / idx.C) + 4096);
  if (!a) return null;
  let best = null, bestScore = Infinity;
  for (const i of a) {
    const s = idx.segs[i];
    const ex = s.x2 - s.x1, ez = s.z2 - s.z1;
    const L2 = ex * ex + ez * ez;
    if (L2 < 1e-4) continue;
    let t = ((x - s.x1) * ex + (z - s.z1) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const fx = s.x1 + ex * t, fz = s.z1 + ez * t;
    const d = Math.hypot(x - fx, z - fz);
    const hw = s.width * 0.5;
    const score = d - hw;
    if (score < bestScore && score < maxD) {
      bestScore = score;
      const L = Math.sqrt(L2);
      best = { s, d, hw, y: s.y1 + (s.y2 - s.y1) * t, dx: ex / L, dz: ez / L, fx, fz };
    }
  }
  return best;
}

const rotFor = (ux, uz) => Math.atan2(-uz, ux); // local +X -> (ux, uz), same convention as street_worker

// ------------------------------------------------------------------------------------------------ system
export class StreetDetail {
  constructor(scene, streetFeatures, vegetation) {
    this.streetFeatures = streetFeatures;
    this.vegetation = vegetation;
    this.root = new THREE.Group();
    this.root.name = 'street_detail';
    scene.add(this.root);

    this.mem = new Map(); // tileKey -> compact data (LRU by insertion)
    this.placed = new Map(); // tileKey -> placement (world coords for current origin)
    this.failed = new Map(); // tileKey -> retry-after timestamp
    this.inflight = null; // tile keys of the request in flight
    this.mirrors = MIRRORS.map((url) => ({ url, until: 0, fails: 0, ok: 0, ms: 0 }));
    this.chMirror = { url: CH_MIRROR, until: 0, fails: 0, ok: 0, ms: 0 };
    this.group = 9; // tiles per request: 9 (whole 3x3) -> 3 (row) -> 1 after failures, grows back on success
    this.okStreak = 0;
    this.backoff = 0;
    this.nextAt = 0;
    this.seed = null; // tileKey -> compact data (bundled precomputed area)
    this.seedState = 0; // 0 not tried, 1 loading, 2 done
    this.ahead = []; // tiles to prefetch when idle (3x3 ahead of travel)
    this._lastLL = null;
    this._vel = [0, 0]; // smoothed tile-space velocity (tiles/s)
    this.active = [];
    this.originKey = '';
    this.version = 0;
    this._acc = 1;
    this._dirty = false;

    // Interfaces read by StreetFeatures / VegetationSystem (see their [feature/street-detail] hooks)
    this.st = null; // { types, heads, signals } world coords
    this.pseudo = { id: -1, userData: { ox: 0, oz: 0, street: null, realDetail: true } };
    this.suppress = null; // { lamp, hydrant, bench, bin } PointGrids
    this.trees = null; // { count, inst, species }
    this.treeSuppress = null; // PointGrid
    streetFeatures.streetDetail = this;
    vegetation.streetDetail = this;

    // Zebra stripes (mid-block crossings)
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.stripeMat = new THREE.MeshBasicMaterial({
      color: 0xe8eaec, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
    });
    this.stripes = new THREE.InstancedMesh(g, this.stripeMat, MAX_STRIPES);
    this.stripes.count = 0;
    this.stripes.frustumCulled = false;
    this.stripes.renderOrder = 1;
    this.stripes.name = 'street_detail_crossings';
    this.root.add(this.stripes);

    // A few real lights that follow the nearest real lamps at night. They only exist in the scene at night
    // (zero daytime cost; one shader variant switch per dusk/dawn).
    this.lights = [];
    for (let i = 0; i < N_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 28, 1.6);
      l.position.set(0, -1000, 0);
      l.visible = false;
      this.root.add(l);
      this.lights.push(l);
    }
    this._lampHeads = [];
    this._lightAcc = 0;

    this.stats = { tiles: 0, pending: 0, fetches: 0, errors: 0, cached: 0, trees: 0, lamps: 0, hydrants: 0, benches: 0, bins: 0, signals: 0, crossings: 0, stripes: 0, mirror: '', placeMs: 0, lastError: '', seeded: 0, prefetched: 0, requests: 0 };
  }

  // ---------------------------------------------------------------------------------------------- fetching
  _pump(now) {
    if (this.inflight || now < this.nextAt || this.seedState === 1) return;
    const ready = (k) => !this.mem.has(k) && (this.failed.get(k) || 0) <= now;
    let keys = this.active.filter(ready); // center-first
    let prefetch = false;
    if (!keys.length) {
      keys = this.ahead.filter(ready);
      prefetch = true;
    }
    if (!keys.length) return;
    // One request for the whole missing area; after a failure shrink to the first key's row, then to one tile.
    if (this.group === 3) keys = keys.filter((k) => k.split('/')[1] === keys[0].split('/')[1]);
    else if (this.group === 1) keys = [keys[0]];
    this.inflight = keys;
    this._loadGroup(keys, prefetch).finally(() => {
      this.inflight = null;
    });
  }

  async _loadGroup(keys, prefetch) {
    const stale = new Map();
    const need = [];
    for (const k of keys) {
      const sd = this.seed && this.seed.get(k);
      if (sd) {
        this.stats.seeded++;
        this._remember(k, sd);
        continue;
      }
      const c = await dbGet(k);
      if (c && Date.now() - c.t < CACHE_TTL_MS) {
        this.stats.cached++;
        this._remember(k, c.d);
        continue;
      }
      if (c) stale.set(k, c.d);
      need.push(k);
    }
    if (!need.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of need) {
      const [x, y] = k.split('/').map(Number);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const sw = tileBBox(x0, y1, TZ), ne = tileBBox(x1, y0, TZ);
    const lat = (sw.s + ne.n) / 2, lon = (sw.w + ne.e) / 2;
    const now = performance.now();
    const mirrors = this._healthy(now, lat, lon);
    if (!mirrors.length) {
      // every mirror is cooling down: wait for the first one (not this area's fault, no split)
      this.nextAt = Math.min(...this._mirrorsFor(lat, lon).map((m) => m.until));
      for (const [k, d] of stale) this._remember(k, d); // stale cache beats nothing
      return;
    }
    const q = QUERY(sw.s.toFixed(6), sw.w.toFixed(6), ne.n.toFixed(6), ne.e.toFixed(6));
    this.stats.fetches++;
    try {
      const text = await this._request(q, mirrors);
      const buckets = new Map(need.map((k) => [k, []]));
      for (const el of parseCsv(text)) {
        const b = buckets.get(`${lonToTileX(el.lon, TZ)}/${latToTileY(el.lat, TZ)}`);
        if (b) b.push(el);
      }
      const t = Date.now();
      for (const [k, els] of buckets) {
        const d = compactOsm({ elements: els });
        this._remember(k, d);
        dbPut(k, { t, d });
        this.failed.delete(k);
      }
      if (prefetch) this.stats.prefetched += need.length;
      this.backoff = 0;
      if (++this.okStreak >= 3 && this.group < 9) {
        this.group *= 3;
        this.okStreak = 0;
      }
      this.nextAt = performance.now() + MIN_GAP_MS;
    } catch (err) {
      this.stats.errors++;
      this.stats.lastError = String((err && err.message) || err).slice(0, 80);
      this.okStreak = 0;
      if (need.length > 1 && this.group > 1) {
        // big area failed on every mirror: split it and retry soon
        this.group = this.group === 9 ? 3 : 1;
        this.nextAt = performance.now() + 1000;
      } else {
        this.backoff = Math.min(60000, this.backoff ? this.backoff * 2 : 4000);
        this.nextAt = performance.now() + this.backoff;
        for (const k of need) this.failed.set(k, performance.now() + this.backoff * 2);
      }
      for (const [k, d] of stale) this._remember(k, d); // stale cache beats nothing
    }
  }

  _mirrorsFor(lat, lon) {
    return inSwitzerland(lat, lon) ? [this.chMirror, ...this.mirrors] : this.mirrors;
  }

  /** Mirrors not cooling down, best first (fewest recent failures, then fastest; CH mirror first inside CH). */
  _healthy(now, lat, lon) {
    const list = this._mirrorsFor(lat, lon).filter((m) => m.until <= now);
    const ch = list[0] === this.chMirror ? [list.shift()] : [];
    list.sort((a, b) => a.fails - b.fails || (a.ms || 9e9) - (b.ms || 9e9));
    return ch.concat(list);
  }

  _penalize(m, err) {
    const now = performance.now();
    const ra = err && err.retryAfter;
    m.fails++;
    m.until = now + (ra > 0 ? Math.min(180, ra) * 1000 : Math.min(120000, 5000 * 2 ** (m.fails - 1)));
  }

  /**
   * POSTs q to the best mirror; on failure rotates to the next one immediately, and if no answer arrives within
   * HEDGE_MS also asks the next mirror in parallel. Resolves with the first good body, rejects when all failed.
   */
  _request(q, mirrors) {
    return new Promise((resolve, reject) => {
      let done = false, pending = 0, idx = 0, lastErr = null;
      const ctls = [];
      const finishFail = () => {
        if (!done && pending === 0 && idx >= mirrors.length) {
          done = true;
          clearInterval(hedge);
          reject(lastErr || new Error('no mirror'));
        }
      };
      const launch = () => {
        if (done || idx >= mirrors.length) return;
        const m = mirrors[idx++];
        pending++;
        this.stats.requests++;
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (ctl) ctls.push(ctl);
        const t0 = performance.now();
        const timer = ctl ? setTimeout(() => ctl.abort(), REQ_TIMEOUT_MS) : 0;
        fetch(m.url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: ctl ? ctl.signal : undefined,
        })
          .then(async (res) => {
            if (!res.ok) {
              const e = new Error(`HTTP ${res.status} ${new URL(m.url).hostname}`);
              e.retryAfter = parseFloat(res.headers.get('Retry-After'));
              throw e;
            }
            const text = await res.text();
            if (/^\s*</.test(text)) throw new Error(`bad body ${new URL(m.url).hostname}`); // HTML error page
            return text;
          })
          .then(
            (text) => {
              clearTimeout(timer);
              pending--;
              m.fails = 0;
              m.ok++;
              m.ms = m.ms ? m.ms * 0.6 + (performance.now() - t0) * 0.4 : performance.now() - t0;
              if (done) return;
              done = true;
              clearInterval(hedge);
              this.stats.mirror = new URL(m.url).hostname;
              for (const c of ctls) if (c !== ctl) c.abort();
              resolve(text);
            },
            (err) => {
              clearTimeout(timer);
              pending--;
              if (done) return; // aborted because another mirror already answered
              lastErr = err && err.name === 'AbortError' ? new Error(`timeout ${new URL(m.url).hostname}`) : err;
              this._penalize(m, err);
              launch(); // rotate on failure
              finishFail();
            },
          );
      };
      const hedge = setInterval(launch, HEDGE_MS);
      launch();
    });
  }

  _remember(key, d) {
    this.mem.delete(key);
    this.mem.set(key, d);
    while (this.mem.size > MEM_TILES) {
      const k = this.mem.keys().next().value;
      this.mem.delete(k);
      this.placed.delete(k);
    }
    this.placed.delete(key);
    this._dirty = true;
  }

  // ---------------------------------------------------------------------------------------------- placement
  _chunkAt(loaded, x, z) {
    const cx = Math.floor((x + HALF_WORLD) / CHUNK), cz = Math.floor((z + HALF_WORLD) / CHUNK);
    return loaded.get(`${cx},${cz}`);
  }

  _chunkSigFor(key, loaded, o) {
    const [x, y] = key.split('/').map(Number);
    const b = tileBBox(x, y, TZ);
    const x0 = (b.w - o.centerLon) * o.mPerDegLon, x1 = (b.e - o.centerLon) * o.mPerDegLon;
    const z0 = (o.centerLat - b.n) * o.mPerDegLat, z1 = (o.centerLat - b.s) * o.mPerDegLat;
    let sig = '';
    const chunks = [];
    for (let cz = Math.floor((z0 + HALF_WORLD) / CHUNK); cz <= Math.floor((z1 + HALF_WORLD) / CHUNK); cz++) {
      for (let cx = Math.floor((x0 + HALF_WORLD) / CHUNK); cx <= Math.floor((x1 + HALF_WORLD) / CHUNK); cx++) {
        const g = loaded.get(`${cx},${cz}`);
        if (g) {
          sig += `${g.id};`;
          chunks.push(g);
        }
      }
    }
    return { sig, chunks };
  }

  /** Converts one tile's compact OSM data into world-space placements for the current origin. */
  _place(key, d, loaded, o, region) {
    const toX = (lon) => (lon - o.centerLon) * o.mPerDegLon;
    const toZ = (lat) => (o.centerLat - lat) * o.mPerDegLat;
    const left = LEFT_HAND.has(region);
    const P = {
      types: {}, heads: [], signals: [], stripes: [], lampHeads: [],
      pts: { lamp: [], hydrant: [], bench: [], bin: [], tree: [] },
      trees: [], species: [], n: { trees: 0, lamps: 0, hydrants: 0, benches: 0, bins: 0, signals: 0, crossings: 0 },
    };
    const push = (type, x, y, z, rot, sx = 1) => {
      let a = P.types[type];
      if (!a) P.types[type] = a = [];
      a.push(x, y, z, rot, sx);
    };
    const ctx = (x, z) => {
      const ch = this._chunkAt(loaded, x, z);
      return ch ? roadIndex(ch) : null;
    };
    // Ground height + off-asphalt nudge. Returns [x, y, z, road] or null if no chunk is loaded there.
    const ground = (x, z, minOff, maxD = 8) => {
      const idx = ctx(x, z);
      if (!idx) return null;
      const r = nearestRoad(idx, x, z, maxD);
      if (!r) return [x, getBeijingTerrainElevation(x, z) - 0.05, z, null, idx];
      if (r.d < r.hw + minOff) {
        // OSM point falls on our (approximate-width) asphalt: push it onto the sidewalk
        let nx = x - r.fx, nz = z - r.fz;
        const L = Math.hypot(nx, nz);
        if (L < 0.05) { nx = -r.dz; nz = r.dx; } else { nx /= L; nz /= L; }
        x = r.fx + nx * (r.hw + minOff);
        z = r.fz + nz * (r.hw + minOff);
        r.d = r.hw + minOff;
      }
      const sidewalk = r.s.cls === 'primary' || r.s.cls === 'secondary' || r.s.cls === 'tertiary' || r.s.cls === 'residential';
      const swW = r.s.cls === 'residential' ? 1.6 : 2.2;
      const y = sidewalk && r.d <= r.hw + swW + 0.3 ? r.y + 0.04 : r.d <= r.hw + 0.6 ? r.y : Math.max(getBeijingTerrainElevation(x, z) - 0.05, r.d < r.hw + 4 ? r.y - 0.3 : -1e9);
      return [x, y, z, r, idx];
    };
    const faceRoad = (x, z, r) => (r ? rotFor((r.fx - x) / Math.max(0.01, r.d), (r.fz - z) / Math.max(0.01, r.d)) : 0);

    // Trees
    const tr = d.trees;
    for (let i = 0; i < tr.length && P.n.trees < CAP.trees; i += 4) {
      const g = ground(toX(tr[i + 1]), toZ(tr[i]), 0.9, 3);
      if (!g) continue;
      const sp = tr[i + 2], h = tr[i + 3];
      const base = sp === SP_CONIFER ? 10.6 : sp === SP_TALL ? 10.4 : sp === SP_PALM ? 9.6 : 8.6;
      const hs = Math.sin(tr[i] * 12345.6 + tr[i + 1] * 6543.2) * 43758.5453;
      const rnd = hs - Math.floor(hs);
      const sc = h > 0 ? Math.max(0.45, Math.min(2.2, h / base)) : 0.78 + rnd * 0.26;
      P.trees.push(g[0], g[1] - 0.05, g[2], sc, sc * (0.95 + rnd * 0.1), rnd * 6.283, 0.86 + rnd * 0.26, 0.9 + rnd * 0.2, 0.84 + rnd * 0.2);
      P.species.push(sp);
      P.pts.tree.push(g[0], g[2]);
      P.n.trees++;
    }

    // Street lamps (type from region + road class; arm points at the road)
    const la = d.lamps;
    for (let i = 0; i < la.length; i += 2) {
      const g = ground(toX(la[i + 1]), toZ(la[i]), 0.55, 10);
      if (!g) continue;
      const [x, y, z, r] = g;
      let type = 'lampPost';
      if (r && r.s.cls !== 'service' && r.d < r.hw + 5) {
        if (region === 'us') type = 'lampCobra';
        else if ((region === 'eu' || region === 'uk') && !MAJOR.has(r.s.cls)) type = 'lampPost';
        else type = 'lampArm';
      }
      const rot = faceRoad(x, z, r);
      const ux = Math.cos(rot), uz = -Math.sin(rot);
      push(type, x, y, z, rot);
      let hx = x, hy = y + 3.85, hz = z;
      if (type === 'lampCobra') { hx = x + ux * 2.6; hy = y + 8.75; hz = z + uz * 2.6; }
      else if (type === 'lampArm') { hx = x + ux * 2.3; hy = y + 8.35; hz = z + uz * 2.3; }
      P.heads.push(hx, hy, hz, rot, y);
      P.lampHeads.push(hx, hy - 0.4, hz);
      P.pts.lamp.push(x, z);
      P.n.lamps++;
    }

    // Hydrants, benches, bins
    const simple = [[d.hyd, 'hydrant', 'hydrant', 'hydrants', 0.8], [d.bench, 'bench', 'bench', 'benches', 0.9], [d.bins, 'bin', 'bin', 'bins', 0.7]];
    for (const [arr, type, pk, nk, off] of simple) {
      for (let i = 0; i < arr.length; i += 2) {
        const g = ground(toX(arr[i + 1]), toZ(arr[i]), off, 6);
        if (!g) continue;
        const [x, y, z, r] = g;
        // bench model: open side (+X) faces the road; hydrant / bin: same convention as the procedural ones
        push(type, x, y + 0.04, z, faceRoad(x, z, r));
        P.pts[pk].push(x, z);
        P.n[nk]++;
      }
    }

    // Traffic signals that the inferred network does not already have
    const sg = d.sig, seen = new PointGrid(15);
    for (let i = 0; i < sg.length; i += 2) {
      const x0 = toX(sg[i + 1]), z0 = toZ(sg[i]);
      const idx = ctx(x0, z0);
      if (!idx || idx.signalNodes.near(x0, z0, 30) || seen.near(x0, z0, 15)) continue;
      const r = nearestRoad(idx, x0, z0, 4);
      if (!r || !MAJOR.has(r.s.cls) && r.s.cls !== 'residential' && r.s.cls !== 'unclassified') continue;
      seen.add(x0, z0);
      const dirs = r.s.oneway ? [1] : [1, -1];
      for (const dir of dirs) {
        const ux = r.dx * dir, uz = r.dz * dir; // travel direction of the approaching traffic
        const rx = -uz, rz = ux; // driver's right
        const side = left ? -1 : 1;
        const off = r.hw + 1.65;
        const px = r.fx - ux * 3 + rx * side * off, pz = r.fz - uz * 3 + rz * side * off;
        const gy = r.y + 0.04;
        const aX = -rx * side, aZ = -rz * side; // mast arm toward the road center
        const inboundW = r.s.oneway ? r.hw * 2 : r.hw;
        const armLen = Math.max(3.2, Math.min(8.2, inboundW * 0.6 + 1.55));
        const horiz = region === 'jp' || region === 'kr' ? 1 : 0;
        push('tlPole', px, gy, pz, rotFor(aX, aZ));
        push('tlArm', px, gy, pz, rotFor(aX, aZ), armLen);
        const hx = px + aX * armLen, hz = pz + aZ * armLen;
        const hrot = rotFor(-ux, -uz); // lenses face the oncoming traffic
        push(horiz ? 'tlHeadH' : 'tlHeadV', hx, gy + 5.6, hz, hrot);
        P.signals.push(hx, gy + 5.6, hz, hrot, Math.abs(ux) > Math.abs(uz) ? 1 : 0, x0, z0, horiz);
      }
      P.n.signals++;
    }

    // Mid-block zebra crossings (junction crosswalks are already drawn by street_worker)
    const cr = d.cross;
    for (let i = 0; i < cr.length; i += 2) {
      const x0 = toX(cr[i + 1]), z0 = toZ(cr[i]);
      const idx = ctx(x0, z0);
      if (!idx || idx.junctions.near(x0, z0, 16)) continue;
      const r = nearestRoad(idx, x0, z0, 1.0);
      if (!r || r.s.cls === 'service' || r.s.cls.startsWith('motorway') || r.hw < 2) continue;
      const len = MAJOR.has(r.s.cls) ? 4.0 : 3.0;
      const nStr = Math.max(2, Math.floor(((r.hw - 0.4) * 2) / 1.0));
      const start = -((nStr - 1) * 1.0) / 2;
      const rx = -r.dz, rz = r.dx;
      const rot = rotFor(r.dx, r.dz);
      for (let k = 0; k < nStr; k++) {
        const o = start + k;
        P.stripes.push(r.fx + rx * o, r.y + 0.035, r.fz + rz * o, rot, len, 0.45);
      }
      P.n.crossings++;
    }
    return P;
  }

  // ---------------------------------------------------------------------------------------------- aggregation
  _aggregate() {
    const types = {}, heads = [], signals = [], stripes = [], lampHeads = [];
    const sup = { lamp: new PointGrid(SUPPRESS_R.lamp), hydrant: new PointGrid(SUPPRESS_R.hydrant), bench: new PointGrid(SUPPRESS_R.bench), bin: new PointGrid(SUPPRESS_R.bin) };
    const treeSup = new PointGrid(SUPPRESS_R.tree);
    let nTrees = 0;
    const n = { trees: 0, lamps: 0, hydrants: 0, benches: 0, bins: 0, signals: 0, crossings: 0 };
    const tiles = [];
    for (const key of this.active) {
      const P = this.placed.get(key);
      if (!P) continue;
      tiles.push(P);
      nTrees += P.species.length;
      for (const k of Object.keys(n)) n[k] += P.n[k];
    }
    const inst = new Float32Array(nTrees * INST_STRIDE), species = new Uint8Array(nTrees);
    let ti = 0;
    for (const P of tiles) {
      for (const [t, a] of Object.entries(P.types)) {
        const dst = types[t] || (types[t] = []);
        for (let i = 0; i < a.length; i++) dst.push(a[i]);
      }
      for (const v of P.heads) heads.push(v);
      for (const v of P.signals) signals.push(v);
      for (const v of P.stripes) stripes.push(v);
      for (const v of P.lampHeads) lampHeads.push(v);
      for (const k of Object.keys(sup)) {
        const p = P.pts[k];
        for (let i = 0; i < p.length; i += 2) sup[k].add(p[i], p[i + 1]);
      }
      for (let i = 0; i < P.pts.tree.length; i += 2) treeSup.add(P.pts.tree[i], P.pts.tree[i + 1]);
      inst.set(P.trees, ti * INST_STRIDE);
      species.set(P.species, ti);
      ti += P.species.length;
    }
    const outTypes = {};
    for (const [t, a] of Object.entries(types)) outTypes[t] = new Float32Array(a);
    this.st = { types: outTypes, heads: new Float32Array(heads), signals: new Float32Array(signals) };
    this.pseudo.userData.street = this.st;
    this.suppress = {
      lampArm: sup.lamp, lampCobra: sup.lamp, lampDouble: sup.lamp, lampPost: sup.lamp,
      hydrant: sup.hydrant, bench: sup.bench, bin: sup.bin, _lamp: sup.lamp,
    };
    this.trees = nTrees ? { count: nTrees, inst, species } : null;
    this.treeSuppress = treeSup.size ? treeSup : null;
    this._lampHeads = lampHeads;

    // Zebra stripes
    const m = this.stripes.instanceMatrix.array;
    const ns = Math.min(MAX_STRIPES, stripes.length / 6);
    for (let i = 0; i < ns; i++) {
      const j = i * 6, o = i * 16;
      const c = Math.cos(stripes[j + 3]), s = Math.sin(stripes[j + 3]);
      const L = stripes[j + 4], W = stripes[j + 5];
      m[o] = c * L; m[o + 1] = 0; m[o + 2] = -s * L; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = s * W; m[o + 9] = 0; m[o + 10] = c * W; m[o + 11] = 0;
      m[o + 12] = stripes[j]; m[o + 13] = stripes[j + 1]; m[o + 14] = stripes[j + 2]; m[o + 15] = 1;
    }
    this.stripes.count = ns;
    this.stripes.visible = ns > 0;
    this.stripes.instanceMatrix.needsUpdate = true;

    Object.assign(this.stats, n, { stripes: ns, tiles: tiles.length });
    this.version++;
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt, camPos, loadedChunks, worldOrigin, layerVisibility) {
    const vis = !layerVisibility || layerVisibility.facilities !== false;
    this.root.visible = vis;
    if (!worldOrigin || !loadedChunks) return;
    const now = performance.now();
    this._pump(now);
    this._updateLights(dt, camPos);

    this._acc += dt;
    if (this._acc < 0.5) return;
    this._acc = 0;

    const o = worldOrigin;
    const ok = `${o.centerLat},${o.centerLon},${o.mPerDegLat},${o.mPerDegLon}`;
    if (ok !== this.originKey) {
      this.originKey = ok;
      this.placed.clear();
      this._dirty = true;
    }
    // Inner 3x3 tiles around the camera
    const lat = o.centerLat - camPos.z / o.mPerDegLat;
    const lon = o.centerLon + camPos.x / o.mPerDegLon;
    const tx = lonToTileX(lon, TZ), ty = latToTileY(lat, TZ);
    const active = [];
    for (let r = 0; r <= 1; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r) active.push(`${tx + dx}/${ty + dy}`);
        }
      }
    }
    if (active.join() !== this.active.join()) {
      this.active = active;
      this._dirty = true;
    }
    if (!this.seedState && SEED_NEAR(lat, lon)) this._loadSeed();
    this._updateAhead(lon, lat, tx, ty);
    this.stats.pending = active.filter((k) => !this.mem.has(k)).length;

    // (Re)place at most one tile per tick: new data, new origin, or its chunks changed
    const region = resolveStreetRegion(o);
    for (const key of this.active) {
      const d = this.mem.get(key);
      if (!d) continue;
      const { sig, chunks } = this._chunkSigFor(key, loadedChunks, o);
      const P = this.placed.get(key);
      if (P && P.sig === sig) continue;
      if (!sig) continue;
      // Spread work: build at most one chunk road index per tick before placing
      const raw = chunks.find((g) => !roadIndexCache.has(g));
      if (raw) {
        const ti = performance.now();
        roadIndex(raw);
        this.stats.indexMs = +(performance.now() - ti).toFixed(2);
        break;
      }
      const t0 = performance.now();
      const np = this._place(key, d, loadedChunks, o, region);
      np.sig = sig;
      this.placed.set(key, np);
      this.stats.placeMs = +(performance.now() - t0).toFixed(2);
      this._dirty = true;
      break;
    }
    if (this._dirty) {
      this._dirty = false;
      this._aggregate();
    }
  }

  _updateLights(dt, cam) {
    const on = 1 - smooth(0.15, 0.6, getDaylight());
    this._lightAcc += dt;
    if (this._lightAcc > 0.4) {
      this._lightAcc = 0;
      // pick the nearest real lamp heads within 140 m
      const h = this._lampHeads, best = [];
      for (let i = 0; i < h.length; i += 3) {
        const dx = h[i] - cam.x, dz = h[i + 2] - cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 140 * 140) continue;
        if (best.length < N_LIGHTS) best.push([d2, i]);
        else if (d2 < best[N_LIGHTS - 1][0]) best[N_LIGHTS - 1] = [d2, i];
        else continue;
        best.sort((a, b) => a[0] - b[0]);
      }
      for (let k = 0; k < N_LIGHTS; k++) {
        const l = this.lights[k];
        if (best[k]) l.position.set(h[best[k][1]], h[best[k][1] + 1], h[best[k][1] + 2]);
        else l.position.set(0, -1000, 0);
        l.userData.used = !!best[k];
      }
    }
    const lit = this._lit ? on > 0.03 : on > 0.12; // hysteresis
    this._lit = lit;
    for (const l of this.lights) {
      l.visible = lit;
      l.intensity = l.userData.used ? 26 * on : 0;
    }
  }

  /** Bundled precomputed tiles for the default SF area (works offline and in the static bundle). */
  _loadSeed() {
    this.seedState = 1;
    fetch(SEED_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.z === TZ && j.tiles) this.seed = new Map(Object.entries(j.tiles));
      })
      .catch(() => {})
      .finally(() => {
        this.seedState = 2;
      });
  }

  /** Tracks travel direction (tile space) and lists the 3x3 two tiles ahead for idle prefetch. */
  _updateAhead(lon, lat, tx, ty) {
    const n = 2 ** TZ;
    const fx = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    const now = performance.now();
    if (this._lastLL) {
      const dt = Math.max(0.05, (now - this._lastLL[2]) / 1000);
      const k = 0.3;
      this._vel[0] = this._vel[0] * (1 - k) + ((fx - this._lastLL[0]) / dt) * k;
      this._vel[1] = this._vel[1] * (1 - k) + ((fy - this._lastLL[1]) / dt) * k;
    }
    this._lastLL = [fx, fy, now];
    const [vx, vy] = this._vel;
    const sp = Math.hypot(vx, vy);
    this.ahead = [];
    if (sp < 0.004 || sp > 2) return; // ~ <4 m/s (standing) or a teleport jump
    const ux = Math.round(vx / sp), uy = Math.round(vy / sp);
    const cx = tx + 2 * ux, cy = ty + 2 * uy;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx}/${cy + dy}`;
        if (!this.active.includes(key)) this.ahead.push(key);
      }
    }
  }

  debugStats() {
    const now = performance.now();
    const mirrors = this.mirrors.map((m) => `${new URL(m.url).hostname.split('.').slice(-3, -1).join('.')}:${m.ok}/${m.fails}${m.until > now ? '*' : ''}`).join(' ');
    return {
      ...this.stats, inflight: this.inflight && this.inflight.length, group: this.group, backoffMs: this.backoff,
      active: this.active.length, memTiles: this.mem.size, ahead: this.ahead.length, seedTiles: this.seed ? this.seed.size : 0, mirrors,
    };
  }
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
