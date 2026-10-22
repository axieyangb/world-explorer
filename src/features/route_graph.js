/**
 * Road routing on OpenFreeMap vector tiles.
 *
 * Builds a road graph from the `transportation` layer of the tiles covering the
 * start→goal corridor and runs A*. The tile zoom drops (Z14 → Z10) as the trip
 * gets longer so the tile count stays bounded; lower zooms only carry major roads.
 * Falls back to straight-line guidance when no road path is found.
 */
import { latLonToTileXY } from '../global_tiles.js';
import { loadTileData } from './map_tiles.js';

const SPEED = { motorway: 27, trunk: 22, primary: 15, secondary: 13, tertiary: 11, minor: 8.5, service: 5, busway: 8 };
const MAX_TILES = 30;
const MAX_ROUTE_M = 300000;
const CONNECTOR_SPEED = 4;

function straightRoute(from, to, distM) {
  return { latlon: [[from.lat, from.lon], [to.lat, to.lon]], distM, etaSec: distM / 13, straight: true };
}

class MinHeap {
  constructor() {
    this.f = [];
    this.v = [];
  }
  get size() {
    return this.f.length;
  }
  push(f, v) {
    const F = this.f;
    const V = this.v;
    let i = F.length;
    F.push(f);
    V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      V[i] = V[p];
      i = p;
    }
    F[i] = f;
    V[i] = v;
  }
  pop() {
    const F = this.f;
    const V = this.v;
    const top = V[0];
    const lf = F.pop();
    const lv = V.pop();
    const n = F.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && F[r] < F[l] ? r : l;
        if (F[c] >= lf) break;
        F[i] = F[c];
        V[i] = V[c];
        i = c;
      }
      F[i] = lf;
      V[i] = lv;
    }
    return top;
  }
}

/**
 * @param {{lat:number, lon:number}} from
 * @param {{lat:number, lon:number}} to
 * @returns {Promise<{latlon:number[][], distM:number, etaSec:number, straight:boolean}|null>}
 */
export async function computeRoadRoute(from, to) {
  const latMid = (from.lat + to.lat) * 0.5;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((latMid * Math.PI) / 180);
  const toXY = (lat, lon) => [(lon - from.lon) * mLon, (from.lat - lat) * mLat];
  const [gx, gy] = toXY(to.lat, to.lon);
  const crow = Math.hypot(gx, gy);
  if (crow < 25) return null;
  if (crow > MAX_ROUTE_M) return straightRoute(from, to, crow);

  // Pick the most detailed zoom whose corridor fits in the tile budget.
  const pad = Math.max(500, crow * 0.18);
  const padLat = pad / mLat;
  const padLon = pad / mLon;
  const minLat = Math.min(from.lat, to.lat) - padLat;
  const maxLat = Math.max(from.lat, to.lat) + padLat;
  const minLon = Math.min(from.lon, to.lon) - padLon;
  const maxLon = Math.max(from.lon, to.lon) + padLon;
  let z = 0;
  let range = null;
  for (const cz of [14, 13, 12, 11, 10]) {
    const [x0, y0] = latLonToTileXY(maxLat, minLon, cz);
    const [x1, y1] = latLonToTileXY(minLat, maxLon, cz);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES) {
      z = cz;
      range = [x0, y0, x1, y1];
      break;
    }
  }
  if (!range) return straightRoute(from, to, crow);

  const jobs = [];
  for (let ty = range[1]; ty <= range[3]; ty++) {
    for (let tx = range[0]; tx <= range[2]; tx++) jobs.push(loadTileData(z, tx, ty));
  }
  const preps = (await Promise.all(jobs)).filter(Boolean);

  const scaleK = Math.pow(2, 14 - z);
  for (const ignoreOneway of [false, true]) {
    const r = runAStar(preps, z, scaleK, from, to, toXY, gx, gy, ignoreOneway);
    if (r) return r;
  }
  return straightRoute(from, to, crow);
}

function runAStar(preps, z, scaleK, from, to, toXY, gx, gy, ignoreOneway) {
  const index = new Map();
  const xs = [];
  const ys = [];
  const lls = [];
  const tileOf = [];
  const adj = [];
  const ends = [];

  const nodeFor = (lat, lon, tileId) => {
    const key = `${Math.round(lat * 1e5)},${Math.round(lon * 1e5)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = xs.length;
      index.set(key, id);
      const [x, y] = toXY(lat, lon);
      xs.push(x);
      ys.push(y);
      lls.push([lat, lon]);
      tileOf.push(tileId);
      adj.push([]);
    }
    return id;
  };
  const addEdge = (a, b, cost) => {
    adj[a].push(b, cost);
  };

  preps.forEach((prep, tileId) => {
    for (const dl of prep.driveLines) {
      if (z < 14 && dl.cls === 'service') continue;
      const speed = SPEED[dl.cls] || 8;
      const ll = dl.latlon;
      if (ll.length < 2) continue;
      let prev = nodeFor(ll[0][0], ll[0][1], tileId);
      for (let i = 1; i < ll.length; i++) {
        const cur = nodeFor(ll[i][0], ll[i][1], tileId);
        if (cur === prev) continue;
        const cost = Math.hypot(xs[cur] - xs[prev], ys[cur] - ys[prev]) / speed;
        if (ignoreOneway || dl.oneway !== -1) addEdge(prev, cur, cost);
        if (ignoreOneway || dl.oneway !== 1) addEdge(cur, prev, cost);
        prev = cur;
      }
      // Line ends clipped at the tile buffer get stitched to the neighbour tile later.
      const p = dl.pts;
      const n2 = p.length;
      const nearEdge = (u, v) => u < 0.01 || u > 0.99 || v < 0.01 || v > 0.99;
      if (nearEdge(p[0], p[1])) ends.push([nodeFor(ll[0][0], ll[0][1], tileId), speed]);
      if (nearEdge(p[n2 - 2], p[n2 - 1])) ends.push([prev, speed]);
    }
  });
  const N = xs.length;
  if (N < 2) return null;

  // Spatial grid
  const cell = 60 * scaleK;
  const grid = new Map();
  for (let i = 0; i < N; i++) {
    const k = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }
  const nearest = (x, y, maxR, k, filter) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const rings = Math.ceil(maxR / cell);
    const found = [];
    for (let r = 0; r <= rings; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const arr = grid.get(`${cx + dx},${cy + dy}`);
          if (!arr) continue;
          for (const i of arr) {
            if (filter && !filter(i)) continue;
            const d = Math.hypot(xs[i] - x, ys[i] - y);
            if (d <= maxR) found.push([d, i]);
          }
        }
      }
      if (found.length >= k && r >= 1) break;
    }
    found.sort((a, b) => a[0] - b[0]);
    return found.slice(0, k);
  };

  // Stitch tile seams
  const stitchR = 45 * scaleK;
  for (const [id, speed] of ends) {
    const cand = nearest(xs[id], ys[id], stitchR, 1, (i) => tileOf[i] !== tileOf[id] && i !== id);
    if (cand.length) {
      const [d, j] = cand[0];
      const c = d / speed;
      addEdge(id, j, c);
      addEdge(j, id, c);
    }
  }

  // Virtual start (N) and goal (N+1) connectors
  const S = N;
  const G = N + 1;
  const connR = Math.min(9000, 700 * scaleK);
  const startC = nearest(0, 0, connR, 6, (i) => adj[i].length > 0);
  const goalC = nearest(gx, gy, connR, 6, (i) => adj[i].length > 0);
  if (!startC.length || !goalC.length) return null;
  const goalConn = new Map();
  for (const [d, i] of goalC) goalConn.set(i, d / CONNECTOR_SPEED);

  const g = new Float64Array(N + 2).fill(Infinity);
  const came = new Int32Array(N + 2).fill(-1);
  const closed = new Uint8Array(N + 2);
  const heap = new MinHeap();
  const vmax = z >= 13 ? 22 : 27;
  const h = (i) => Math.hypot(xs[i] - gx, ys[i] - gy) / vmax;

  g[S] = 0;
  for (const [d, i] of startC) {
    const c = d / CONNECTOR_SPEED;
    if (c < g[i]) {
      g[i] = c;
      came[i] = S;
      heap.push(c + h(i), i);
    }
  }
  let iters = 0;
  let found = false;
  while (heap.size > 0 && iters++ < 800000) {
    const cur = heap.pop();
    if (cur === G) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const gc = g[cur];
    const gcost = goalConn.get(cur);
    if (gcost !== undefined && gc + gcost < g[G]) {
      g[G] = gc + gcost;
      came[G] = cur;
      heap.push(g[G], G);
    }
    const a = adj[cur];
    for (let k = 0; k < a.length; k += 2) {
      const nb = a[k];
      if (closed[nb]) continue;
      const t = gc + a[k + 1];
      if (t < g[nb]) {
        g[nb] = t;
        came[nb] = cur;
        heap.push(t + h(nb), nb);
      }
    }
  }
  if (!found) return null;

  const path = [];
  for (let c = came[G]; c >= 0 && c !== S; c = came[c]) path.push(c);
  path.reverse();
  const latlon = [[from.lat, from.lon]];
  for (const i of path) latlon.push(lls[i]);
  latlon.push([to.lat, to.lon]);

  let distM = Math.hypot(xs[path[0]], ys[path[0]]);
  for (let i = 1; i < path.length; i++) {
    distM += Math.hypot(xs[path[i]] - xs[path[i - 1]], ys[path[i]] - ys[path[i - 1]]);
  }
  distM += Math.hypot(gx - xs[path[path.length - 1]], gy - ys[path[path.length - 1]]);
  return { latlon, distM, etaSec: g[G], straight: false };
}
