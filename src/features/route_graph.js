/**
 * Road routing on OpenFreeMap vector tiles.
 *
 * Builds a road graph from the `transportation` layer of the tiles covering the
 * start->goal corridor, splits at-grade road crossings, stitches junctions/portals,
 * and runs A*.
 */
import { latLonToTileXY } from '../global_tiles.js';
import { loadTileData } from './map_tiles.js';

const SPEED = { motorway: 27, trunk: 22, primary: 15, secondary: 13, tertiary: 11, minor: 8.5, service: 5, busway: 8 };
const MAX_TILES = 25;
const MAX_ROUTE_M = 300000;
const CONNECTOR_SPEED = 4;

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
  if (crow < 25 || crow > MAX_ROUTE_M) return null;

  // Pick the most detailed zoom whose corridor fits in the tile budget.
  const pad = Math.max(600, crow * 0.22);
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
  if (!range) return null;

  const jobs = [];
  for (let ty = range[1]; ty <= range[3]; ty++) {
    for (let tx = range[0]; tx <= range[2]; tx++) jobs.push(loadTileData(z, tx, ty));
  }
  const preps = (await Promise.all(jobs)).filter(Boolean);
  if (!preps.length) return null;

  const scaleK = Math.pow(2, 14 - z);
  for (const ignoreOneway of [false, true]) {
    const r = runAStar(preps, z, scaleK, from, to, toXY, gx, gy, ignoreOneway, mLat, mLon);
    if (r) return r;
  }
  return null;
}

function runAStar(preps, z, scaleK, from, to, toXY, gx, gy, ignoreOneway, mLat, mLon) {
  const fromXY = (x, y) => [from.lat - y / mLat, from.lon + x / mLon];
  const rawSegs = [];
  let waySeq = 0;

  preps.forEach((prep, tileId) => {
    for (const dl of prep.driveLines) {
      if (z < 14 && dl.cls === 'service') continue;
      const baseSpeed = SPEED[dl.cls] || 8;
      const speed = dl.tunnel ? baseSpeed * 0.88 : baseSpeed;
      const ll = dl.latlon;
      if (!ll || ll.length < 2) continue;
      const wid = ++waySeq;
      let [px, py] = toXY(ll[0][0], ll[0][1]);
      for (let i = 1; i < ll.length; i++) {
        const [cx, cy] = toXY(ll[i][0], ll[i][1]);
        if (Math.hypot(cx - px, cy - py) >= 0.4) {
          rawSegs.push({
            x1: px, y1: py, x2: cx, y2: cy,
            speed, oneway: dl.oneway | 0,
            tunnel: Boolean(dl.tunnel), bridge: Boolean(dl.bridge),
            tileId, wid,
          });
        }
        px = cx; py = cy;
      }
    }
  });
  if (rawSegs.length < 2) return null;

  // Split at-grade crossing segments so vector-tile streets that cross without sharing a vertex connect cleanly
  const G_CELL = 28 * scaleK;
  const EXT = 2.5 * scaleK;
  const segGrid = new Map();
  for (let i = 0; i < rawSegs.length; i++) {
    const s = rawSegs[i];
    const x0 = Math.floor((Math.min(s.x1, s.x2) - EXT) / G_CELL), x1 = Math.floor((Math.max(s.x1, s.x2) + EXT) / G_CELL);
    const y0 = Math.floor((Math.min(s.y1, s.y2) - EXT) / G_CELL), y1 = Math.floor((Math.max(s.y1, s.y2) + EXT) / G_CELL);
    for (let gx0 = x0; gx0 <= x1; gx0++) {
      for (let gy0 = y0; gy0 <= y1; gy0++) {
        const k = (gx0 + 50000) * 100000 + (gy0 + 50000);
        let l = segGrid.get(k);
        if (!l) segGrid.set(k, (l = []));
        l.push(i);
      }
    }
  }
  const cuts = new Map();
  const addCut = (i, t, x, y) => {
    let l = cuts.get(i);
    if (!l) cuts.set(i, (l = []));
    l.push({ t, x, y });
  };
  for (const [k, l] of segGrid) {
    if (l.length < 2 || l.length > 48) continue;
    const gx0 = Math.floor(k / 100000) - 50000, gy0 = (k % 100000) - 50000;
    for (let p = 0; p < l.length; p++) {
      const ia = l[p], a = rawSegs[ia];
      const rX = a.x2 - a.x1, rY = a.y2 - a.y1, la = Math.hypot(rX, rY);
      if (la < 0.2) continue;
      for (let q = p + 1; q < l.length; q++) {
        const ib = l[q], b = rawSegs[ib];
        if (a.wid === b.wid) continue;
        const sX = b.x2 - b.x1, sY = b.y2 - b.y1, lb = Math.hypot(sX, sY);
        if (lb < 0.2) continue;
        const den = rX * sY - rY * sX;
        if (Math.abs(den) / (la * lb) < 0.22) continue;
        const qx = b.x1 - a.x1, qy = b.y1 - a.y1;
        const t = (qx * sY - qy * sX) / den, u = (qx * rY - qy * rX) / den;
        const eA = EXT / la, eB = EXT / lb;
        if (t < -eA || t > 1 + eA || u < -eB || u > 1 + eB) continue;
        const ix = a.x1 + rX * t, iy = a.y1 + rY * t;
        if (Math.floor(ix / G_CELL) !== gx0 || Math.floor(iy / G_CELL) !== gy0) continue;
        const nearEndA = t < 0.08 || t > 0.92;
        const nearEndB = u < 0.08 || u > 0.92;
        if ((a.bridge !== b.bridge || a.tunnel !== b.tunnel) && !(nearEndA || nearEndB)) continue;
        addCut(ia, Math.max(0, Math.min(1, t)), ix, iy);
        addCut(ib, Math.max(0, Math.min(1, u)), ix, iy);
      }
    }
  }

  const segs = [];
  for (let i = 0; i < rawSegs.length; i++) {
    const s = rawSegs[i];
    const l = cuts.get(i);
    if (!l || !l.length) { segs.push(s); continue; }
    l.sort((p, q) => p.t - q.t);
    let px = s.x1, py = s.y1;
    for (const c of l) {
      if (Math.hypot(c.x - px, c.y - py) > 0.35) {
        segs.push({ ...s, x1: px, y1: py, x2: c.x, y2: c.y });
        px = c.x; py = c.y;
      }
    }
    if (Math.hypot(s.x2 - px, s.y2 - py) > 0.35) {
      segs.push({ ...s, x1: px, y1: py, x2: s.x2, y2: s.y2 });
    }
  }

  const index = new Map();
  const xs = [];
  const ys = [];
  const lls = [];
  const tileOf = [];
  const adj = [];

  const snapM = 2.2 * scaleK;
  const nodeForXY = (x, y, tileId) => {
    const qx = Math.round(x / snapM), qy = Math.round(y / snapM);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${qx + dx},${qy + dy}`;
        const id = index.get(key);
        if (id !== undefined && Math.hypot(xs[id] - x, ys[id] - y) <= snapM * 1.1) {
          return id;
        }
      }
    }
    const id = xs.length;
    index.set(`${qx},${qy}`, id);
    xs.push(x);
    ys.push(y);
    lls.push(fromXY(x, y));
    tileOf.push(tileId);
    adj.push([]);
    return id;
  };
  const addEdge = (a, b, cost) => {
    adj[a].push(b, cost);
  };

  for (const s of segs) {
    const u = nodeForXY(s.x1, s.y1, s.tileId);
    const v = nodeForXY(s.x2, s.y2, s.tileId);
    if (u === v) continue;
    const dist = Math.hypot(xs[v] - xs[u], ys[v] - ys[u]);
    const cost = dist / s.speed;
    if (ignoreOneway || s.oneway !== -1) addEdge(u, v, cost);
    else addEdge(u, v, cost * 5.5);
    if (ignoreOneway || s.oneway !== 1) addEdge(v, u, cost);
    else addEdge(v, u, cost * 5.5);
  }

  const N = xs.length;
  if (N < 2) return null;

  // Spatial grid over nodes
  const cell = 45 * scaleK;
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

  // Stitch nearby junctions, tunnel portals, and tile seams within 9m
  const stitchR = 9.0 * scaleK;
  for (let i = 0; i < N; i++) {
    if (adj[i].length > 4) continue;
    const cands = nearest(xs[i], ys[i], stitchR, 3, (j) => j !== i);
    for (const [d, j] of cands) {
      const c = (d / 9.0) * 1.35;
      addEdge(i, j, c);
      addEdge(j, i, c);
    }
  }

  // Virtual start (N) and goal (N+1) connectors
  const S = N;
  const G = N + 1;
  const connR = Math.min(9000, 700 * scaleK);
  const startC = nearest(0, 0, connR, 8, (i) => adj[i].length > 0);
  const goalC = nearest(gx, gy, connR, 8, (i) => adj[i].length > 0);
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
  if (!path.length) return null;

  const latlon = [];
  if (Math.hypot(xs[path[0]], ys[path[0]]) <= 14.0) {
    latlon.push([from.lat, from.lon]);
  }
  for (const i of path) latlon.push(lls[i]);
  if (Math.hypot(gx - xs[path[path.length - 1]], gy - ys[path[path.length - 1]]) <= 18.0) {
    latlon.push([to.lat, to.lon]);
  }

  let distM = 0;
  for (let i = 1; i < path.length; i++) {
    distM += Math.hypot(xs[path[i]] - xs[path[i - 1]], ys[path[i]] - ys[path[i - 1]]);
  }
  return { latlon, distM: Math.max(10, distM), etaSec: g[G], straight: false };
}
