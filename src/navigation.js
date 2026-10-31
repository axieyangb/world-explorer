import * as THREE from '../vendor/three.module.js?v=20261031_r6';
import { getBeijingTerrainElevation } from './environment.js?v=20261031_r6';
import { getLang } from './i18n.js?v=20261031_r6';
import { computeRoadRoute } from './features/route_graph.js?v=20261031_r6';
import { sampleTunnelCorridorAt } from './features/road_grid.js?v=20261031_r6';

const RIBBON_AHEAD_M = 1200;
const RIBBON_STEP_M = 8;
const RIBBON_HALF_W = 0.9;
const ARRIVE_M = 10;

const WALK_ONLY_CLS = new Set([
  'footway', 'pedestrian', 'steps', 'path', 'cycleway', 'bridleway', 'corridor', 'platform'
]);

const DRIVE_CLS_SPEED = {
  motorway: 24, trunk: 21, primary: 17, secondary: 15, tertiary: 13,
  residential: 10.5, unclassified: 10, living_street: 7.5, service: 6.5, track: 6
};

class LocalMinHeap {
  constructor() {
    this.f = [];
    this.v = [];
  }
  get size() {
    return this.f.length;
  }
  push(f, v) {
    const F = this.f, V = this.v;
    let i = F.length;
    F.push(f); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p]; V[i] = V[p];
      i = p;
    }
    F[i] = f; V[i] = v;
  }
  pop() {
    const F = this.f, V = this.v;
    const top = V[0];
    const lf = F.pop(), lv = V.pop();
    const n = F.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && F[r] < F[l] ? r : l;
        if (F[c] >= lf) break;
        F[i] = F[c]; V[i] = V[c];
        i = c;
      }
      F[i] = lf; V[i] = lv;
    }
    return top;
  }
}

export function formatDistance(m) {
  const zh = getLang() === 'zh';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} ${zh ? '米' : 'm'}`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${zh ? '公里' : 'km'}`;
}

export function formatDuration(sec) {
  const zh = getLang() === 'zh';
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} ${zh ? '分钟' : 'min'}`;
  const h = Math.floor(min / 60);
  const rm = min % 60;
  return zh ? `${h} 小时 ${rm} 分钟` : `${h} h ${rm} min`;
}

/**
 * GPS route state: deterministic local chunk road/sidewalk A* router + global tile-based road routing,
 * progress tracking, arrival detection and a thin 3D ground ribbon that follows the road surface.
 */
export class RoadNavigator {
  constructor(scene) {
    this.scene = scene;
    this.ready = true;
    this.app = null; // attached by MapSystem: worldOrigin + sampleRoadSurface + loadedChunks
    this.activeRoute = null;
    this.routeMesh = null;
    this.arrivedAt = -Infinity;
    this._seq = 0;
    this._lastUpdate = 0;
    this._originRef = null;
    this._ribbonAt = null;
    this._ribbonTime = 0;
    this._ribbonChunks = 0;
    this._lastReroute = 0;
    this._lastLocalRefine = 0;
    this._lastChunkCount = 0;
  }

  init() {}

  attach(app) {
    this.app = app;
  }

  get active() {
    return Boolean(this.activeRoute && this.activeRoute.points && this.activeRoute.points.length >= 2);
  }

  get dest() {
    if (!this.activeRoute) return null;
    return { x: this.activeRoute.goalX, z: this.activeRoute.goalZ };
  }

  get origin() {
    return this.app && this.app.worldOrigin;
  }

  worldToLatLon(x, z) {
    const o = this.origin;
    if (!o) return [0, 0];
    return [o.centerLat - z / o.mPerDegLat, o.centerLon + x / o.mPerDegLon];
  }

  latLonToWorld(lat, lon) {
    const o = this.origin;
    if (!o) return [0, 0];
    return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
  }

  /** True when the active route near (px, pz) traverses an underground/underwater tunnel segment. */
  isOnTunnelSegment(px, pz) {
    const r = this.activeRoute;
    if (r && r.segFlags && r.points && r.points.length >= 2) {
      const idx = Math.max(0, Math.min(r.points.length - 2, r.progressIdx || 0));
      for (let i = Math.max(0, idx - 2); i <= Math.min(r.points.length - 2, idx + 4); i++) {
        if (r.segFlags[i] && r.segFlags[i].tunnel) return true;
      }
    }
    if (this.app) {
      const tc = sampleTunnelCorridorAt(this.app, px, pz, 4.5);
      if (tc && tc.seg && tc.seg.onWater) return true;
    }
    return false;
  }

  /**
   * Builds a road/sidewalk route between two lat/lon points or two world {x,z} objects.
   * Immediately computes a synchronous in-memory A* route over loaded chunks so FSD never
   * follows a straight line across buildings, then supplements with global tile routing if needed.
   */
  async routeTo(fromLat, fromLon, toLat, toLon, destName = '') {
    let startX = null, startZ = null, goalX = null, goalZ = null;
    if (fromLat && typeof fromLat === 'object' && fromLon && typeof fromLon === 'object') {
      const lbl = typeof destName === 'string' && destName ? destName : (this.app?.fsd?.label || 'Destination');
      startX = Number(fromLat.x) || 0;
      startZ = Number(fromLat.z) || 0;
      goalX = Number(fromLon.x) || 0;
      goalZ = Number(fromLon.z) || 0;
      const [fLat, fLon] = this.worldToLatLon(startX, startZ);
      const [tLat, tLon] = this.worldToLatLon(goalX, goalZ);
      fromLat = fLat;
      fromLon = fLon;
      toLat = tLat;
      toLon = tLon;
      destName = lbl;
    } else {
      [startX, startZ] = this.latLonToWorld(fromLat, fromLon);
      [goalX, goalZ] = this.latLonToWorld(toLat, toLon);
    }

    const seq = ++this._seq;
    const mode = (this.app && this.app.mode === 'walk') ? 'walk' : 'drive';

    // 1. Synchronous, instant in-memory Local Chunk Road / Sidewalk A* Router (< 2 ms)
    const localR = this._computeLocalChunkRoute(startX, startZ, goalX, goalZ, mode);
    if (localR && localR.latlon && localR.latlon.length >= 2) {
      this._setRoute(localR, destName, toLat, toLon);
      this._lastLocalRefine = performance.now();
      this._lastChunkCount = this.app && this.app.loadedChunks ? this.app.loadedChunks.size : 0;
      if (!localR.partial) {
        return this.activeRoute;
      }
    }

    // 2. Global tile-based road routing for long cross-city routes beyond loaded chunks
    const r = await computeRoadRoute({ lat: fromLat, lon: fromLon }, { lat: toLat, lon: toLon });
    if (seq !== this._seq) return this.activeRoute;
    if (r && r.latlon && r.latlon.length >= 2 && !r.straight) {
      // If local chunk route was only partial, merge or use global route
      if (!localR || localR.partial) {
        this._setRoute(r, destName, toLat, toLon);
      }
    }
    return this.activeRoute;
  }

  /**
   * Deterministic in-memory A* router over loadedChunks roadSegments & buildingColliders.
   * - For mode === 'drive': routes along vehicular streets, bridges, and underwater tunnels with right-hand lane offset.
   * - For mode === 'walk': routes along footways/sidewalks and offsets around building colliders.
   */
  _computeLocalChunkRoute(startX, startZ, goalX, goalZ, mode = 'drive') {
    const app = this.app;
    if (!app || !app.loadedChunks || app.loadedChunks.size === 0 || !this.origin) return null;

    const rawSegs = [];
    for (const chunk of app.loadedChunks.values()) {
      const segs = chunk && chunk.userData && chunk.userData.roadSegments;
      if (!segs) continue;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (!s) continue;
        if (mode === 'drive' && WALK_ONLY_CLS.has(s.cls)) continue;
        rawSegs.push(s);
      }
    }
    if (rawSegs.length < 2) return null;

    // Split at-grade crossing segments and T-junctions so intersecting streets always share a graph node
    const G_CELL = 20.0, EXT = 2.2;
    const grid = new Map();
    for (let i = 0; i < rawSegs.length; i++) {
      const s = rawSegs[i];
      const x0 = Math.floor((Math.min(s.x1, s.x2) - EXT) / G_CELL), x1 = Math.floor((Math.max(s.x1, s.x2) + EXT) / G_CELL);
      const z0 = Math.floor((Math.min(s.z1, s.z2) - EXT) / G_CELL), z1 = Math.floor((Math.max(s.z1, s.z2) + EXT) / G_CELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const k = (gx + 50000) * 100000 + (gz + 50000);
          let l = grid.get(k);
          if (!l) grid.set(k, (l = []));
          l.push(i);
        }
      }
    }

    const cuts = new Map();
    const addCut = (i, t, x, z) => {
      let l = cuts.get(i);
      if (!l) cuts.set(i, (l = []));
      l.push({ t, x, z });
    };

    for (const [k, l] of grid) {
      if (l.length < 2 || l.length > 52) continue;
      const gx = Math.floor(k / 100000) - 50000, gz = (k % 100000) - 50000;
      for (let p = 0; p < l.length; p++) {
        const ia = l[p], a = rawSegs[ia];
        const rX = a.x2 - a.x1, rZ = a.z2 - a.z1, la = Math.hypot(rX, rZ);
        if (la < 0.1) continue;
        for (let q = p + 1; q < l.length; q++) {
          const ib = l[q], b = rawSegs[ib];
          if (a.id && b.id && a.id === b.id) continue;
          const sX = b.x2 - b.x1, sZ = b.z2 - b.z1, lb = Math.hypot(sX, sZ);
          if (lb < 0.1) continue;
          const den = rX * sZ - rZ * sX;
          if (Math.abs(den) / (la * lb) < 0.22) continue;
          const qx = b.x1 - a.x1, qz = b.z1 - a.z1;
          const t = (qx * sZ - qz * sX) / den, u = (qx * rZ - qz * rX) / den;
          const eA = EXT / la, eB = EXT / lb;
          if (t < -eA || t > 1 + eA || u < -eB || u > 1 + eB) continue;
          const ix = a.x1 + rX * t, iz = a.z1 + rZ * t;
          if (Math.floor(ix / G_CELL) !== gx || Math.floor(iz / G_CELL) !== gz) continue;
          const tA = Math.max(0, Math.min(1, t)), tB = Math.max(0, Math.min(1, u));
          const ya = (a.y1 || 0) + ((a.y2 || 0) - (a.y1 || 0)) * tA;
          const yb = (b.y1 || 0) + ((b.y2 || 0) - (b.y1 || 0)) * tB;
          const nearEndA = tA * la < 3.5 || (1 - tA) * la < 3.5;
          const nearEndB = tB * lb < 3.5 || (1 - tB) * lb < 3.5;
          if (Boolean(a.bridge) !== Boolean(b.bridge) && Math.abs(ya - yb) > 2.2 && !(nearEndA && nearEndB)) continue;
          if (Boolean(a.tunnel) !== Boolean(b.tunnel) && !(nearEndA || nearEndB)) continue;
          addCut(ia, tA, ix, iz);
          addCut(ib, tB, ix, iz);
        }
      }
    }

    const segs = [];
    for (let i = 0; i < rawSegs.length; i++) {
      const s = rawSegs[i];
      const l = cuts.get(i);
      if (!l || !l.length) { segs.push(s); continue; }
      l.sort((p, q) => p.t - q.t);
      let px = s.x1, pz = s.z1, py = s.y1 || 0;
      for (const c of l) {
        const cy = (s.y1 || 0) + ((s.y2 || 0) - (s.y1 || 0)) * c.t;
        if (Math.hypot(c.x - px, c.z - pz) > 0.25) {
          segs.push({ ...s, x1: px, y1: py, z1: pz, x2: c.x, y2: cy, z2: c.z });
          px = c.x; pz = c.z; py = cy;
        }
      }
      if (Math.hypot(s.x2 - px, s.z2 - pz) > 0.25) {
        segs.push({ ...s, x1: px, y1: py, z1: pz, x2: s.x2, y2: s.y2 || 0, z2: s.z2 });
      }
    }

    // Build graph nodes (snap within 2.4m)
    const SNAP = 2.4;
    const nodeHash = new Map();
    const nx = [], ny = [], nz = [];
    const adj = [];

    const getNode = (x, y, z) => {
      const qx = Math.round(x / SNAP), qz = Math.round(z / SNAP);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = (qx + dx + 50000) * 100003 + (qz + dz + 50000);
          const bucket = nodeHash.get(k);
          if (!bucket) continue;
          for (let bi = 0; bi < bucket.length; bi++) {
            const id = bucket[bi];
            if (Math.hypot(nx[id] - x, nz[id] - z) <= SNAP && Math.abs(ny[id] - y) <= 3.2) {
              return id;
            }
          }
        }
      }
      const id = nx.length;
      nx.push(x); ny.push(y); nz.push(z);
      adj.push([]);
      const k = (qx + 50000) * 100003 + (qz + 50000);
      let bucket = nodeHash.get(k);
      if (!bucket) nodeHash.set(k, (bucket = []));
      bucket.push(id);
      return id;
    };

    const addEdge = (u, v, cost, meta) => {
      adj[u].push({ to: v, cost, meta });
    };

    const segNodePairs = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const u = getNode(s.x1, s.y1 || 0, s.z1);
      const v = getNode(s.x2, s.y2 || 0, s.z2);
      if (u === v) continue;
      const dist = Math.hypot(nx[v] - nx[u], nz[v] - nz[u]);
      if (dist < 0.15) continue;
      const metaFwd = {
        width: s.width || 7.0,
        cls: s.cls || 'residential',
        oneway: Boolean(s.oneway),
        tunnel: Boolean(s.tunnel),
        bridge: Boolean(s.bridge),
      };
      if (mode === 'walk') {
        const wFactor = WALK_ONLY_CLS.has(s.cls) ? 0.82 : (s.tunnel ? 1.2 : 1.0);
        const c = (dist / 5.0) * wFactor;
        addEdge(u, v, c, metaFwd);
        addEdge(v, u, c, metaFwd);
      } else {
        const spd = DRIVE_CLS_SPEED[s.cls] || 10.0;
        const tFactor = s.tunnel ? 1.15 : 1.0;
        const baseCost = (dist / spd) * tFactor;
        addEdge(u, v, baseCost, metaFwd);
        // Strong preference for legal one-way direction while allowing fallback if trapped
        addEdge(v, u, s.oneway ? baseCost * 4.5 : baseCost, metaFwd);
      }
      segNodePairs.push({ s, u, v, dist, meta: metaFwd });
    }

    const N = nx.length;
    if (N < 2) return null;

    // Stitch nearby nodes within 8.5m (connects T-junctions, chunk seams, and tunnel portals)
    const NCELL = 16.0;
    const nGrid = new Map();
    for (let i = 0; i < N; i++) {
      const k = (Math.floor(nx[i] / NCELL) + 50000) * 100003 + (Math.floor(nz[i] / NCELL) + 50000);
      let l = nGrid.get(k);
      if (!l) nGrid.set(k, (l = []));
      l.push(i);
    }
    for (let i = 0; i < N; i++) {
      if (adj[i].length > 3) continue;
      const gx0 = Math.floor(nx[i] / NCELL), gz0 = Math.floor(nz[i] / NCELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const l = nGrid.get((gx0 + dx + 50000) * 100003 + (gz0 + dz + 50000));
          if (!l) continue;
          for (let li = 0; li < l.length; li++) {
            const j = l[li];
            if (j <= i) continue;
            const d = Math.hypot(nx[j] - nx[i], nz[j] - nz[i]);
            if (d > 0.1 && d <= 8.5 && Math.abs(ny[j] - ny[i]) <= 3.8) {
              const stitchMeta = (adj[i][0] && adj[i][0].meta) || { width: 7.0, cls: 'residential', tunnel: false, bridge: false };
              const stitchCost = (d / 8.0) * 1.3;
              addEdge(i, j, stitchCost, stitchMeta);
              addEdge(j, i, stitchCost, stitchMeta);
            }
          }
        }
      }
    }

    // Find closest segments to start (startX, startZ) and goal (goalX, goalZ)
    const findClosestSegs = (qx, qz, kMax = 6) => {
      const scored = [];
      for (let i = 0; i < segNodePairs.length; i++) {
        const item = segNodePairs[i];
        const { s } = item;
        // Do not snap onto the middle of an underground tunnel from the surface unless already near its portal
        if (s.tunnel && !s.onWater && Math.hypot(qx - startX, qz - startZ) < 1 && !(app.water && app.water.isInUnderwaterTunnel(qx, qz))) {
          continue;
        }
        const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
        const l2 = vx * vx + vz * vz;
        const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((qx - s.x1) * vx + (qz - s.z1) * vz) / l2)) : 0;
        const px = s.x1 + vx * t, pz = s.z1 + vz * t;
        const d = Math.hypot(qx - px, qz - pz);
        scored.push({ d, t, px, pz, py: (s.y1 || 0) + ((s.y2 || 0) - (s.y1 || 0)) * t, item });
      }
      scored.sort((a, b) => a.d - b.d);
      return scored.slice(0, kMax);
    };

    const startCands = findClosestSegs(startX, startZ, 6);
    const goalCands = findClosestSegs(goalX, goalZ, 6);
    if (!startCands.length || !goalCands.length) return null;

    const S = N, G = N + 1;
    adj.push([], []);
    nx.push(startCands[0].px, goalCands[0].px);
    ny.push(startCands[0].py, goalCands[0].py);
    nz.push(startCands[0].pz, goalCands[0].pz);

    for (const sc of startCands) {
      const { u, v, dist, meta } = sc.item;
      const spd = mode === 'walk' ? 5.0 : (DRIVE_CLS_SPEED[meta.cls] || 10.0);
      const pen = sc.d / 4.0;
      addEdge(S, u, pen + (dist * sc.t) / spd, meta);
      addEdge(S, v, pen + (dist * (1 - sc.t)) / spd, meta);
    }

    const partial = goalCands[0].d > 220.0;
    const goalConn = new Map();
    if (!partial) {
      for (const gc of goalCands) {
        const { u, v, dist, meta } = gc.item;
        const spd = mode === 'walk' ? 5.0 : (DRIVE_CLS_SPEED[meta.cls] || 10.0);
        const pen = gc.d / 4.0;
        const cu = pen + (dist * gc.t) / spd;
        const cv = pen + (dist * (1 - gc.t)) / spd;
        if (!goalConn.has(u) || cu < goalConn.get(u).cost) goalConn.set(u, { cost: cu, gx: gc.px, gy: gc.py, gz: gc.pz, meta });
        if (!goalConn.has(v) || cv < goalConn.get(v).cost) goalConn.set(v, { cost: cv, gx: gc.px, gy: gc.py, gz: gc.pz, meta });
      }
    } else {
      // Destination is beyond currently loaded chunks: route to the road border nodes closest to goal
      const borderNodes = [];
      for (let i = 0; i < N; i++) {
        if (!adj[i].length) continue;
        borderNodes.push({ i, d: Math.hypot(nx[i] - goalX, nz[i] - goalZ) });
      }
      borderNodes.sort((a, b) => a.d - b.d);
      const topK = Math.min(16, borderNodes.length);
      for (let k = 0; k < topK; k++) {
        const bn = borderNodes[k];
        goalConn.set(bn.i, {
          cost: (bn.d / 12.0),
          gx: nx[bn.i], gy: ny[bn.i], gz: nz[bn.i],
          meta: (adj[bn.i][0] && adj[bn.i][0].meta) || { width: 7.0, cls: 'primary', tunnel: false, bridge: false }
        });
      }
    }

    const gScore = new Float64Array(N + 2).fill(Infinity);
    const came = new Int32Array(N + 2).fill(-1);
    const cameMeta = new Array(N + 2).fill(null);
    const closed = new Uint8Array(N + 2);
    const heap = new LocalMinHeap();
    const hSpd = mode === 'walk' ? 6.0 : 24.0;
    const h = (id) => Math.hypot(nx[id] - goalX, nz[id] - goalZ) / hSpd;

    gScore[S] = 0;
    heap.push(h(S), S);

    let found = false;
    let iters = 0;
    while (heap.size > 0 && iters++ < 250000) {
      const cur = heap.pop();
      if (cur === G) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const gc = gScore[cur];

      const gInfo = goalConn.get(cur);
      if (gInfo !== undefined && gc + gInfo.cost < gScore[G]) {
        gScore[G] = gc + gInfo.cost;
        came[G] = cur;
        cameMeta[G] = gInfo.meta;
        nx[G] = gInfo.gx; ny[G] = gInfo.gy; nz[G] = gInfo.gz;
        heap.push(gScore[G], G);
      }

      const edges = adj[cur];
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const nb = e.to;
        if (closed[nb]) continue;
        const tentative = gc + e.cost;
        if (tentative < gScore[nb]) {
          gScore[nb] = tentative;
          came[nb] = cur;
          cameMeta[nb] = e.meta;
          heap.push(tentative + h(nb), nb);
        }
      }
    }

    if (!found) return null;

    const nodeChain = [];
    const edgeMetas = [];
    for (let c = G; c >= 0; c = came[c]) {
      nodeChain.push(c);
      if (cameMeta[c]) edgeMetas.push(cameMeta[c]);
      if (c === S) break;
    }
    nodeChain.reverse();
    edgeMetas.reverse();
    if (nodeChain.length < 2) return null;

    // Deduplicate very close consecutive nodes (< 0.8m)
    const rawPts = [];
    const rawMetas = [];
    for (let i = 0; i < nodeChain.length; i++) {
      const id = nodeChain[i];
      const px = nx[id], py = ny[id], pz = nz[id];
      if (rawPts.length > 0) {
        const prev = rawPts[rawPts.length - 1];
        if (Math.hypot(px - prev[0], pz - prev[2]) < 0.8 && i < nodeChain.length - 1) continue;
      }
      rawPts.push([px, py, pz]);
      if (i < edgeMetas.length) rawMetas.push(edgeMetas[i]);
    }
    if (rawPts.length < 2) return null;

    // Build mode-specific waypoints (Right-Hand Lane Offset for Drive; Sidewalk Panel + Building Detour for Walk)
    const worldPts = [];
    const segFlags = [];
    const lht = Boolean(app.traffic && app.traffic.lht);

    const isBlockedByBuilding = (wx, wy, wz, isTunnel) => {
      if (isTunnel) return false;
      return Boolean(app.collision && app.collision.insideAny(wx, wz, wy + 0.6));
    };

    if (mode === 'drive') {
      const nP = rawPts.length;
      for (let i = 0; i < nP - 1; i++) {
        const p0 = rawPts[i], p1 = rawPts[i + 1];
        const meta = rawMetas[Math.min(i, rawMetas.length - 1)] || { width: 7.0, cls: 'residential', tunnel: false, bridge: false };
        const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
        const len = Math.hypot(dx, dz);
        if (len < 0.4) continue;
        const ux = dx / len, uz = dz / len;
        // Right-of-travel normal in (sin(yaw), cos(yaw)) coordinates is (-uz, ux)
        const rx = -uz, rz = ux;
        const roadW = meta.width || 7.0;
        const nomOff = (lht ? -1 : 1) * Math.min(1.85, Math.max(0.95, roadW * 0.21));

        const pickSafePt = (bx, by, bz, scale = 1.0) => {
          for (const mult of [scale, scale * 0.5, 0, -scale * 0.4]) {
            const tx = bx + rx * nomOff * mult;
            const tz = bz + rz * nomOff * mult;
            if (!isBlockedByBuilding(tx, by, tz, meta.tunnel)) {
              return [tx, by, tz];
            }
          }
          return [bx, by, bz];
        };

        if (i === 0) {
          worldPts.push(pickSafePt(p0[0], p0[1], p0[2], 1.0));
        }

        // Subdivide long road segments every ~22m so lane-keeping & lookahead stay tightly locked to the lane
        if (len > 26.0) {
          const steps = Math.min(12, Math.floor(len / 22.0));
          for (let s = 1; s <= steps; s++) {
            const frac = s / (steps + 1);
            if (frac > 0.78 && i < nP - 2) break;
            const mx = p0[0] + dx * frac;
            const my = p0[1] + (p1[1] - p0[1]) * frac;
            const mz = p0[2] + dz * frac;
            worldPts.push(pickSafePt(mx, my, mz, 1.0));
            segFlags.push({ tunnel: Boolean(meta.tunnel), bridge: Boolean(meta.bridge), width: roadW });
          }
        }

        // Before an intersection turn, place an approach point along the current lane so the car never cuts the corner
        if (i < nP - 2 && len > 8.5) {
          const p2 = rawPts[i + 2];
          const nxDx = p2[0] - p1[0], nxDz = p2[2] - p1[2];
          const nxLen = Math.hypot(nxDx, nxDz) || 1;
          const dot = (ux * nxDx + uz * nxDz) / nxLen;
          if (dot < 0.88) {
            const backDist = Math.min(5.0, len * 0.32);
            const ax = p1[0] - ux * backDist;
            const az = p1[2] - uz * backDist;
            const ay = p0[1] + (p1[1] - p0[1]) * ((len - backDist) / len);
            worldPts.push(pickSafePt(ax, ay, az, 1.0));
            segFlags.push({ tunnel: Boolean(meta.tunnel), bridge: Boolean(meta.bridge), width: roadW });
          }
        }

        worldPts.push(pickSafePt(p1[0], p1[1], p1[2], 0.85));
        segFlags.push({ tunnel: Boolean(meta.tunnel), bridge: Boolean(meta.bridge), width: roadW });
      }
    } else {
      // WALK MODE: Subdivide long segments (~18m) and offset onto the clear sidewalk pavement panel
      const denseWalkPts = [rawPts[0]];
      const denseWalkMetas = [];
      for (let i = 0; i < rawPts.length - 1; i++) {
        const a = rawPts[i], b = rawPts[i + 1];
        const m = rawMetas[Math.min(i, rawMetas.length - 1)] || { width: 6.0, cls: 'footway', tunnel: false };
        const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const nSub = Math.max(1, Math.min(16, Math.ceil(d / 18.0)));
        for (let s = 1; s <= nSub; s++) {
          const f = s / nSub;
          denseWalkPts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
          denseWalkMetas.push(m);
        }
      }
      const nP = denseWalkPts.length;
      for (let i = 0; i < nP; i++) {
        const p = denseWalkPts[i];
        const meta = denseWalkMetas[Math.min(i, denseWalkMetas.length - 1)] || { width: 6.0, cls: 'footway', tunnel: false };
        if (WALK_ONLY_CLS.has(meta.cls) || meta.tunnel) {
          worldPts.push([p[0], p[1], p[2]]);
        } else {
          const pPrev = denseWalkPts[Math.max(0, i - 1)];
          const pNext = denseWalkPts[Math.min(nP - 1, i + 1)];
          const dx = pNext[0] - pPrev[0], dz = pNext[2] - pPrev[2];
          const len = Math.hypot(dx, dz) || 1;
          const rx = -dz / len, rz = dx / len;
          const swOff = (meta.width || 6.5) * 0.5 + 1.25;
          let chosen = [p[0], p[1], p[2]];
          for (const side of [1, -1, 0.5, -0.5, 0]) {
            const tx = p[0] + rx * swOff * side;
            const tz = p[2] + rz * swOff * side;
            const inWater = app.water && app.water.isPointInWater(tx, tz) && !meta.bridge && !meta.tunnel;
            if (!inWater && !isBlockedByBuilding(tx, p[1], tz, meta.tunnel)) {
              chosen = [tx, p[1], tz];
              break;
            }
          }
          worldPts.push(chosen);
        }
        if (i < nP - 1) {
          segFlags.push({ tunnel: Boolean(meta.tunnel), bridge: Boolean(meta.bridge), width: meta.width || 6.0 });
        }
      }
      this._detourWalkPointsAroundBuildings(worldPts, segFlags);
    }

    if (worldPts.length < 2) return null;

    const latlon = worldPts.map((pt) => this.worldToLatLon(pt[0], pt[2]));
    let totalDist = 0;
    for (let i = 1; i < worldPts.length; i++) {
      totalDist += Math.hypot(worldPts[i][0] - worldPts[i - 1][0], worldPts[i][2] - worldPts[i - 1][2]);
    }
    return {
      latlon,
      distM: Math.max(10, totalDist),
      etaSec: Math.max(5, totalDist / (mode === 'walk' ? 6.0 : 14.0)),
      straight: false,
      partial,
      segFlags,
      worldPts,
    };
  }

  /**
   * Ensures no walker segment cuts through a building collider by inserting padded exterior building corners.
   */
  _detourWalkPointsAroundBuildings(pts, segFlags) {
    const app = this.app;
    if (!app || !app.collision || pts.length < 2) return;
    const PAD = 1.85;
    let guard = 0;
    let i = 0;
    while (i < pts.length - 1 && guard++ < 64) {
      const a = pts[i], b = pts[i + 1];
      const f = segFlags[i];
      if (f && f.tunnel) { i++; continue; }
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const len = Math.hypot(dx, dz);
      if (len < 1.2) { i++; continue; }
      const ux = dx / len, uz = dz / len;
      const hitFrac = app.collision.segmentHit(a[0], a[1] + 0.8, a[2], ux, 0, uz, len);
      if (hitFrac >= 0.99) {
        i++;
        continue;
      }
      const hx = a[0] + ux * (len * Math.min(0.95, hitFrac + 0.04));
      const hz = a[2] + uz * (len * Math.min(0.95, hitFrac + 0.04));
      const bldg = app.collision.insideAny(hx, hz, a[1] + 0.8);
      if (!bldg) {
        i++;
        continue;
      }
      const corners = [
        [bldg.minX - PAD, a[1], bldg.minZ - PAD],
        [bldg.maxX + PAD, a[1], bldg.minZ - PAD],
        [bldg.minX - PAD, a[1], bldg.maxZ + PAD],
        [bldg.maxX + PAD, a[1], bldg.maxZ + PAD],
      ];
      let bestC = null, bestCost = Infinity;
      for (const c of corners) {
        if (app.collision.insideAny(c[0], c[2], a[1] + 0.8)) continue;
        const d1 = Math.hypot(c[0] - a[0], c[2] - a[2]);
        const d2 = Math.hypot(b[0] - c[0], b[2] - c[2]);
        if (d1 < 0.8 || d2 < 0.8) continue;
        const h1 = app.collision.segmentHit(a[0], a[1] + 0.8, a[2], (c[0] - a[0]) / d1, 0, (c[2] - a[2]) / d1, d1);
        if (h1 < 0.96) continue;
        const cost = d1 + d2;
        if (cost < bestCost) {
          bestCost = cost;
          bestC = c;
        }
      }
      if (bestC) {
        pts.splice(i + 1, 0, bestC);
        segFlags.splice(i + 1, 0, f || { tunnel: false, bridge: false, width: 6.0 });
      }
      i++;
    }
  }

  /**
   * Per-frame lookahead point along the active route polyline for FSD steering.
   * Clamps lookahead at upcoming intersection turns so the vehicle drives all the way into
   * the intersection before turning (never cutting diagonally across building corners!).
   */
  getLookaheadPoint(px, pz, lookAheadM = 18) {
    const r = this.activeRoute;
    if (!r || !this.origin) return null;
    if (this._originRef !== this.origin || !r.points || r.points.length < 2) {
      this._reproject();
    }
    const pts = r.points;
    if (!pts || pts.length < 2) return null;

    let bestI = r.progressIdx || 0;
    let bestT = 0;
    let bestD = Infinity;
    const i0 = Math.max(0, bestI - 3);
    const i1 = Math.min(pts.length - 2, bestI + 90);
    for (let i = i0; i <= i1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const vx = pts[i + 1][0] - ax, vz = pts[i + 1][2] - az;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
      const d = Math.hypot(ax + vx * t - px, az + vz * t - pz);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bestT = t;
      }
    }
    r.progressIdx = bestI;

    const segDx0 = pts[bestI + 1][0] - pts[bestI][0];
    const segDz0 = pts[bestI + 1][2] - pts[bestI][2];
    const segLen0 = Math.hypot(segDx0, segDz0) || 1;
    const tanX = segDx0 / segLen0;
    const tanZ = segDz0 / segLen0;
    const curSegFlag = (r.segFlags && r.segFlags[bestI]) || null;

    const sampleAheadCornerSafe = (distAhead, clampAtCorners) => {
      let rem = distAhead;
      let idx = bestI;
      let curX = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * bestT;
      let curZ = pts[idx][2] + (pts[idx + 1][2] - pts[idx][2]) * bestT;
      while (idx < pts.length - 1) {
        const nx = pts[idx + 1][0], nz = pts[idx + 1][2];
        const segRem = Math.hypot(nx - curX, nz - curZ);
        if (segRem >= rem && segRem > 1e-5) {
          const f = rem / segRem;
          return [curX + (nx - curX) * f, curZ + (nz - curZ) * f];
        }
        // Check if vertex idx + 1 is a significant road turn (> 15 deg)
        if (clampAtCorners && idx + 1 < pts.length - 1) {
          const ux1 = (nx - pts[idx][0]) / (Math.hypot(nx - pts[idx][0], nz - pts[idx][2]) || 1);
          const uz1 = (nz - pts[idx][2]) / (Math.hypot(nx - pts[idx][0], nz - pts[idx][2]) || 1);
          const nx2 = pts[idx + 2][0], nz2 = pts[idx + 2][2];
          const l2 = Math.hypot(nx2 - nx, nz2 - nz) || 1;
          const ux2 = (nx2 - nx) / l2, uz2 = (nz2 - nz) / l2;
          const turnDot = ux1 * ux2 + uz1 * uz2;
          const distToCorner = Math.hypot(nx - px, nz - pz);
          if (turnDot < 0.96 && distToCorner > 4.2) {
            // Stop lookahead right at (or 1.2m past) the intersection corner until the vehicle enters the turn
            const stepInto = Math.min(1.2, l2 * 0.2);
            return [nx + ux2 * stepInto, nz + uz2 * stepInto];
          }
        }
        rem -= segRem;
        curX = nx;
        curZ = nz;
        idx++;
      }
      return [pts[pts.length - 1][0], pts[pts.length - 1][2]];
    };

    const [tx, tz] = sampleAheadCornerSafe(lookAheadM, true);
    const [fx, fz] = sampleAheadCornerSafe(lookAheadM * 2.0, false);
    const a1 = Math.atan2(tx - px, tz - pz);
    const a2 = Math.atan2(fx - tx, fz - tz);
    const turnAngle = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    return {
      x: tx,
      z: tz,
      turnAngle,
      distToRoute: bestD,
      tanX,
      tanZ,
      tunnel: Boolean(curSegFlag && curSegFlag.tunnel),
    };
  }

  /** Legacy world-coordinate API. */
  computeRoute(startX, startZ, goalX, goalZ, destName = '') {
    const [a, b] = this.worldToLatLon(startX, startZ);
    const [c, d] = this.worldToLatLon(goalX, goalZ);
    return this.routeTo(a, b, c, d, destName);
  }

  clearRoute() {
    this._seq++;
    this.activeRoute = null;
    this._disposeRibbon();
  }

  /** One quiet line for the HUD, or '' when idle. */
  statusText(now = performance.now()) {
    const r = this.activeRoute;
    if (r) return `${formatDistance(r.remainingM)} · ${formatDuration(r.remainingSec)}`;
    if (now - this.arrivedAt < 3000) return getLang() === 'zh' ? '已到达' : 'Arrived';
    return '';
  }

  _setRoute(r, destName, goalLat, goalLon) {
    const ll = r.latlon;
    const cum = new Float64Array(ll.length);
    const mLat = 111320;
    const mLon = 111320 * Math.cos((ll[0][0] * Math.PI) / 180);
    for (let i = 1; i < ll.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot((ll[i][1] - ll[i - 1][1]) * mLon, (ll[i][0] - ll[i - 1][0]) * mLat);
    }
    const total = cum[ll.length - 1] || 1;
    this.activeRoute = {
      latlon: ll,
      cum,
      totalDistM: total,
      etaSec: r.etaSec,
      secPerM: r.etaSec / total,
      straight: Boolean(r.straight),
      partial: Boolean(r.partial),
      segFlags: r.segFlags || null,
      destName,
      goalLat,
      goalLon,
      progressIdx: 0,
      remainingM: total,
      remainingSec: r.etaSec,
      offSince: 0,
      points: [],
      goalX: 0,
      goalZ: 0,
    };
    this._reproject();
    this._disposeRibbon();
    this._ribbonAt = null;
  }

  _reproject() {
    const r = this.activeRoute;
    this._originRef = this.origin;
    if (!r || !this.origin) return;
    r.points = r.latlon.map(([lat, lon]) => {
      const [x, z] = this.latLonToWorld(lat, lon);
      return [x, 0, z];
    });
    [r.goalX, r.goalZ] = this.latLonToWorld(r.goalLat, r.goalLon);
  }

  /** Called every frame (cheap; internally throttled). */
  update(playerPos, now = performance.now()) {
    const r = this.activeRoute;
    if (!r || !this.origin) return;
    if (now - this._lastUpdate < 200) return;
    this._lastUpdate = now;
    if (this._originRef !== this.origin) {
      this._reproject();
      this._disposeRibbon();
      this._ribbonAt = null;
    }

    const px = playerPos.x;
    const pz = playerPos.z;
    const pts = r.points;
    const toGoal = Math.hypot(r.goalX - px, r.goalZ - pz);
    if (toGoal < ARRIVE_M) {
      this.clearRoute();
      this.arrivedAt = now;
      return;
    }

    // Re-run local chunk A* as new chunks stream in or if previous route was partial
    const curChunks = this.app && this.app.loadedChunks ? this.app.loadedChunks.size : 0;
    if ((r.partial || curChunks !== this._lastChunkCount) && now - this._lastLocalRefine > 2200) {
      this._lastLocalRefine = now;
      this._lastChunkCount = curChunks;
      const mode = (this.app && this.app.mode === 'walk') ? 'walk' : 'drive';
      const refined = this._computeLocalChunkRoute(px, pz, r.goalX, r.goalZ, mode);
      if (refined && refined.latlon && refined.latlon.length >= 2 && (!refined.partial || r.partial)) {
        this._setRoute(refined, r.destName, r.goalLat, r.goalLon);
        return;
      }
    }

    let bestI = r.progressIdx;
    let bestT = 0;
    let bestD = Infinity;
    const i0 = Math.max(0, r.progressIdx - 3);
    const i1 = Math.min(pts.length - 2, r.progressIdx + 120);
    for (let i = i0; i <= i1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const vx = pts[i + 1][0] - ax, vz = pts[i + 1][2] - az;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
      const d = Math.hypot(ax + vx * t - px, az + vz * t - pz);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bestT = t;
      }
    }
    if (r.straight) {
      r.remainingM = toGoal;
    } else {
      r.progressIdx = bestI;
      const seg = r.cum[bestI + 1] - r.cum[bestI];
      r.remainingM = Math.max(0, r.totalDistM - (r.cum[bestI] + seg * bestT)) + Math.min(bestD, 200);
    }
    r.remainingSec = r.remainingM * r.secPerM;

    // Auto-reroute when clearly off the route (> 45m)
    if (bestD > 45) {
      if (!r.offSince) r.offSince = now;
      if (now - r.offSince > 2200 && now - this._lastReroute > 3500) {
        this._lastReroute = now;
        const [lat, lon] = this.worldToLatLon(px, pz);
        this.routeTo(lat, lon, r.goalLat, r.goalLon, r.destName);
      }
    } else {
      r.offSince = 0;
    }

    const moved = this._ribbonAt ? Math.hypot(px - this._ribbonAt[0], pz - this._ribbonAt[1]) : Infinity;
    if (moved > 120 || (curChunks !== this._ribbonChunks && now - this._ribbonTime > 1500)) {
      this._ribbonAt = [px, pz];
      this._ribbonTime = now;
      this._ribbonChunks = curChunks;
      this._rebuildRibbon(playerPos);
    }
  }

  _disposeRibbon() {
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh.material.dispose();
      this.routeMesh = null;
    }
  }

  _surfaceY(x, z, prevY) {
    const terr = getBeijingTerrainElevation(x, z);
    const app = this.app;
    if (app && typeof app.sampleRoadSurface === 'function') {
      const s = app.sampleRoadSurface(x, prevY, z) || (Math.abs(prevY - terr) > 2 ? app.sampleRoadSurface(x, terr, z) : null);
      if (s) return s.y;
    }
    return terr;
  }

  _rebuildRibbon(playerPos) {
    this._disposeRibbon();
    const r = this.activeRoute;
    if (!r || r.points.length < 2) return;
    const pts = r.points;

    const samples = [];
    let acc = 0;
    let prevY = playerPos.y;
    const start = r.straight ? 0 : Math.max(0, r.progressIdx);
    for (let i = start; i < pts.length - 1 && acc < RIBBON_AHEAD_M; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const bx = pts[i + 1][0], bz = pts[i + 1][2];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / RIBBON_STEP_M));
      for (let k = 0; k < steps && acc < RIBBON_AHEAD_M; k++) {
        const t = k / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (Math.abs(x) > 19950 || Math.abs(z) > 19950) continue;
        if (r.straight && Math.hypot(x - playerPos.x, z - playerPos.z) > RIBBON_AHEAD_M) continue;
        prevY = this._surfaceY(x, z, prevY);
        samples.push(x, prevY, z);
        acc += len / steps;
      }
    }
    const n = samples.length / 3;
    if (n < 2) return;

    const pos = new Float32Array(n * 6);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let dx = samples[b * 3] - samples[a * 3];
      let dz = samples[b * 3 + 2] - samples[a * 3 + 2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const x = samples[i * 3], y = samples[i * 3 + 1] + 0.3, z = samples[i * 3 + 2];
      pos.set([x - dz * RIBBON_HALF_W, y, z + dx * RIBBON_HALF_W, x + dz * RIBBON_HALF_W, y, z - dx * RIBBON_HALF_W], i * 6);
      if (i < n - 1) {
        const v = i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.routeMesh = new THREE.Mesh(geo, mat);
    this.routeMesh.renderOrder = 3;
    this.scene.add(this.routeMesh);
  }
}
