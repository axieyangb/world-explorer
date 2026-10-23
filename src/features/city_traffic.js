// AI city traffic + pedestrians for any city (replaces the Beijing-only TrafficManager).
// - Lane graph per chunk is built in the chunk worker (traffic_graph.js) and merged here
//   incrementally for chunks near the player.
// - Cars: drive on the regional side, respect oneway, follow lanes, car-following,
//   stop at red signals (signals.js), instanced rendering (traffic_models.js).
// - Pedestrians: sidewalks/footways, cross at signalized crosswalks, avoid the player.
// - Player car collides with AI cars (2D OBB, bump + slow down).
import * as THREE from '../../vendor/three.module.js';
import { VEHICLE_SPECS } from '../entities.js';
import { buildTrafficGraph, isLeftHandTraffic } from './traffic_graph.js';
import { getSignalPhase, getSignalInfo, approachAxis, signalTime } from './signals.js';
import * as daylight from './daylight.js';
import { CAR_TYPES, createCarMeshes, createPedMesh } from './traffic_models.js';

const MAX_CARS = 110;
const MAX_PEDS = 140;
const CAR_R = 400;
const CAR_DESPAWN = 470;
const PED_R = 145;
const PED_DESPAWN = 165;
const GRAPH_SPAN = 1500; // include chunks whose center is within this many meters (3x3 around player)
const HASH = 30;

// Indexed by traffic class code (see traffic_graph.js).
const CAR_SPEED = [25, 20, 14, 12.5, 11, 8, 6, 12, 0, 0];
const CAR_W = [3, 2.6, 2.2, 1.6, 1.1, 0.35, 0, 0.8, 0, 0];
const PED_W = [0, 0, 1, 1, 0.9, 0.55, 0, 0, 0.8, 0];

const PAINTS = [
  0xf2f2f0, 0xf2f2f0, 0xe8e8e6, 0x161719, 0x161719, 0x1f2124, 0xa7abb0, 0xa7abb0, 0x6c7177,
  0x41464d, 0x1d3557, 0x2b4c7e, 0x8d1b1b, 0xb3261e, 0xc9b79c, 0x2f4f3a, 0x5b3a29, 0x3a5f8f, 0xd9a62e,
].map((h) => new THREE.Color(h));
const SHIRTS = [0x2b2d42, 0x8d99ae, 0xedf2f4, 0xd90429, 0x264653, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x1d3557, 0x6d597a, 0x3a3a3a, 0xffffff, 0x588157].map((h) => new THREE.Color(h));
const PANTS = [0x1b1b1e, 0x22223b, 0x2f3e46, 0x3d405b, 0x4a4e69, 0x5c4033, 0xa39171, 0x14213d].map((h) => new THREE.Color(h));
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5cfa0].map((h) => new THREE.Color(h));

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hashKey = (x, z) => (Math.floor(x / HASH) + 2000) * 5000 + (Math.floor(z / HASH) + 2000);
const nodeKey = (qx, qz) => (qx + 50000) * 100000 + (qz + 50000);

function evalEdge(e, s, hint, out) {
  const cum = e.cum, n = e.n, p = e.pts;
  let i = hint < 0 ? 0 : hint > n - 2 ? n - 2 : hint;
  while (i < n - 2 && cum[i + 1] < s) i++;
  while (i > 0 && cum[i] > s) i--;
  const j = i * 3;
  const L = cum[i + 1] - cum[i] || 1e-6;
  const t = clamp((s - cum[i]) / L, 0, 1);
  const dx = p[j + 3] - p[j], dy = p[j + 4] - p[j + 1], dz = p[j + 5] - p[j + 2];
  out.x = p[j] + dx * t;
  out.y = p[j + 1] + dy * t;
  out.z = p[j + 2] + dz * t;
  out.ux = dx / L;
  out.uz = dz / L;
  out.slope = dy / L;
  return i;
}

function obbOverlap(ax, az, ahx, ahz, aL, aW, bx, bz, bhx, bhz, bL, bW) {
  const dx = ax - bx, dz = az - bz;
  const axes = [ahx, ahz, -ahz, ahx, bhx, bhz, -bhz, bhx];
  let best = Infinity, nx = 0, nz = 0;
  for (let k = 0; k < 8; k += 2) {
    const x = axes[k], z = axes[k + 1];
    const rA = aL * Math.abs(ahx * x + ahz * z) + aW * Math.abs(-ahz * x + ahx * z);
    const rB = bL * Math.abs(bhx * x + bhz * z) + bW * Math.abs(-bhz * x + bhx * z);
    const d = dx * x + dz * z;
    const o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; nx = d >= 0 ? x : -x; nz = d >= 0 ? z : -z; }
  }
  return { depth: best, nx, nz };
}

export class CityTraffic {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.group = new THREE.Group();
    this.group.name = 'city_traffic';
    this.scene.add(this.group);
    this.uniforms = { uLights: { value: 0 } };
    this.carMeshes = createCarMeshes(MAX_CARS, this.uniforms);
    for (const m of this.carMeshes) this.group.add(m.mesh);
    this.ped = createPedMesh(MAX_PEDS);
    this.group.add(this.ped.mesh);

    this.cars = [];
    for (let i = 0; i < MAX_CARS; i++) this.cars.push({ active: false, id: i });
    this.peds = [];
    for (let i = 0; i < MAX_PEDS; i++) this.peds.push({ active: false, id: i });

    this.nodeCells = new Map();
    this.chunkRecs = new Map();
    this.carCand = []; this.carCum = []; this.carTarget = 0;
    this.pedCand = []; this.pedCum = []; this.pedTarget = 0;
    this.candTimer = 0;
    this.syncTimer = 0;
    this.origin = null;
    this.lht = false;
    this.taxiPaint = null;
    this.fillBoost = 0;
    this.adding = null;

    this.obs = { n: 0, x: [], z: [], hx: [], hz: [], hl: [], hw: [], v: [], kind: [], ref: [] };
    this.cells = new Map();
    this.frustum = new THREE.Frustum();
    this.projM = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 4);
    this.tmp = { x: 0, y: 0, z: 0, ux: 0, uz: 1, slope: 0 };
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.eul = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v3 = new THREE.Vector3();
    this.s3 = new THREE.Vector3(1, 1, 1);
    this.stats = { cars: 0, peds: 0, edges: 0, nodes: 0 };
    if (typeof window !== 'undefined') window.__cityTraffic = this; // debug/test handle
  }

  setVisible(v) {
    this.group.visible = Boolean(v);
  }

  // ---------------- graph ----------------
  _acquireNode(x, y, z) {
    const qx = Math.round(x), qz = Math.round(z);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = this.nodeCells.get(nodeKey(qx + i, qz + j));
        if (!l) continue;
        for (const n of l) {
          if (Math.abs(n.x - x) < 1.2 && Math.abs(n.z - z) < 1.2 && Math.abs(n.y - y) < 3.0) { n.refs++; return n; }
        }
      }
    }
    const n = { x, y, z, refs: 1, out: [], adj: [], sig: null, cell: nodeKey(qx, qz), stopBack: -1 };
    const l = this.nodeCells.get(n.cell);
    if (l) l.push(n); else this.nodeCells.set(n.cell, [n]);
    this.stats.nodes++;
    return n;
  }

  _releaseNode(n) {
    if (--n.refs > 0) return;
    const l = this.nodeCells.get(n.cell);
    if (l) {
      const i = l.indexOf(n);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) this.nodeCells.delete(n.cell);
    }
    this.stats.nodes--;
  }

  _makeDir(e, fwd) {
    const p = e.pts, n = e.n, a = 0, b = (n - 1) * 3, a1 = 3, b1 = (n - 2) * 3;
    let sx, sz, ex, ez;
    if (fwd) { sx = p[a1] - p[a]; sz = p[a1 + 2] - p[a + 2]; ex = p[b] - p[b1]; ez = p[b + 2] - p[b1 + 2]; }
    else { sx = p[b1] - p[b]; sz = p[b1 + 2] - p[b + 2]; ex = p[a] - p[a1]; ez = p[a + 2] - p[a1 + 2]; }
    const sl = Math.hypot(sx, sz) || 1, el = Math.hypot(ex, ez) || 1;
    const nLanes = e.oneway ? Math.max(1, e.lanes) : Math.max(1, Math.round(e.lanes / 2));
    const laneW = clamp(e.width / (e.oneway ? nLanes : nLanes * 2), 2.4, 3.6);
    return {
      e, fwd, from: fwd ? e.a : e.b, to: fwd ? e.b : e.a,
      sHx: sx / sl, sHz: sz / sl, eHx: ex / el, eHz: ez / el,
      endAxis: approachAxis(ex, ez), nLanes, laneW,
    };
  }

  // Incremental (time-sliced) chunk insertion: yields every few hundred edges.
  *_addChunkGen(key, chunk) {
    const ud = chunk.userData;
    let g = ud.trafficGraph;
    if (!g) g = ud.trafficGraph = buildTrafficGraph(ud.roadSegments || [], ud.street ? ud.street.signalNodes : null, ud.ox, ud.oz);
    const rec = { chunk, nodes: [], edges: [] };
    this.chunkRecs.set(key, rec);
    const M = g.nodes.length / 3;
    const refs = new Array(M);
    for (let i = 0; i < M; i++) {
      refs[i] = this._acquireNode(g.nodes[i * 3], g.nodes[i * 3 + 1], g.nodes[i * 3 + 2]);
      rec.nodes.push(refs[i]);
    }
    for (const [i, k, sb] of g.sigKeys) { refs[i].sig = k; if (sb > 0) refs[i].stopBack = sb; } // [integration] street's stop line
    const E = g.eA.length;
    for (let i = 0; i < E; i++) {
      if ((i & 255) === 255) yield;
      const cls = g.eCls[i];
      const car = CAR_W[cls] > 0, ped = PED_W[cls] > 0;
      if (!car && !ped) continue;
      const p0 = g.ptOff[i], p1 = g.ptOff[i + 1], n = p1 - p0;
      if (n < 2) continue;
      const pts = g.pts.subarray(p0 * 3, p1 * 3);
      const cum = new Float32Array(n);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = 0; k < n; k++) {
        const x = pts[k * 3], z = pts[k * 3 + 2];
        if (k) cum[k] = cum[k - 1] + Math.hypot(x - pts[k * 3 - 3], z - pts[k * 3 - 1]);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const len = cum[n - 1];
      if (len < 0.5) continue;
      const e = {
        pts, cum, n, len, a: refs[g.eA[i]], b: refs[g.eB[i]], cls,
        lanes: g.eLanes[i], width: g.eWidth[i], oneway: g.eOneway[i] === 1,
        alive: true, minX, maxX, minZ, maxZ, dirs: [null, null], car, ped,
      };
      if (car) {
        e.dirs[0] = this._makeDir(e, true);
        e.a.out.push(e.dirs[0]);
        if (!e.oneway) { e.dirs[1] = this._makeDir(e, false); e.b.out.push(e.dirs[1]); }
      }
      if (ped) {
        e.a.adj.push({ e, fwd: true });
        e.b.adj.push({ e, fwd: false });
      }
      rec.edges.push(e);
      this.stats.edges++;
    }
    this.candTimer = 0;
  }

  _pumpAdd(budgetMs) {
    const t0 = performance.now();
    while (this.adding) {
      if (this.adding.gen.next().done) { this.adding = null; break; }
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  _removeChunk(key) {
    const rec = this.chunkRecs.get(key);
    if (!rec) return;
    for (const e of rec.edges) {
      e.alive = false;
      for (const nd of [e.a, e.b]) {
        nd.out = nd.out.filter((d) => d.e !== e);
        nd.adj = nd.adj.filter((d) => d.e !== e);
        nd.stopBack = -1;
      }
    }
    for (const n of rec.nodes) this._releaseNode(n);
    this.stats.edges -= rec.edges.length;
    this.chunkRecs.delete(key);
    if (this.adding && this.adding.key === key) {
      this.adding.gen.return();
      this.adding = null;
    }
    this.candTimer = 0;
  }

  _syncChunks(loaded, p) {
    if (this.adding) { this._pumpAdd(1.2); return; }
    // Remove stale / far chunks.
    for (const [key, rec] of this.chunkRecs) {
      const c = loaded.get(key);
      const ud = rec.chunk.userData;
      if (c !== rec.chunk || Math.abs(ud.ox - p.x) > GRAPH_SPAN + 300 || Math.abs(ud.oz - p.z) > GRAPH_SPAN + 300) {
        this._removeChunk(key);
      }
    }
    // Add at most one new chunk per call (spreads the cost across frames), nearest first.
    let bestKey = null, bestChunk = null, bestD = Infinity;
    for (const [key, chunk] of loaded) {
      if (this.chunkRecs.has(key) || !chunk || !chunk.userData) continue;
      const ud = chunk.userData;
      const dx = Math.abs(ud.ox - p.x), dz = Math.abs(ud.oz - p.z);
      if (dx > GRAPH_SPAN || dz > GRAPH_SPAN) continue;
      const d = dx + dz;
      if (d < bestD) { bestD = d; bestKey = key; bestChunk = chunk; }
    }
    if (bestKey !== null) {
      this.adding = { key: bestKey, gen: this._addChunkGen(bestKey, bestChunk) };
      this._pumpAdd(1.2);
    }
  }

  _resetAll() {
    for (const key of Array.from(this.chunkRecs.keys())) this._removeChunk(key);
    this.nodeCells.clear();
    this.stats.nodes = 0;
    for (const c of this.cars) c.active = false;
    for (const p of this.peds) p.active = false;
    const o = this.app.worldOrigin || {};
    this.lht = isLeftHandTraffic(o.centerLat, o.centerLon);
    const uk = o.centerLat > 49.8 && o.centerLat < 61 && o.centerLon > -11 && o.centerLon < 2;
    this.taxiPaint = o.isBeijing ? null : new THREE.Color(uk ? 0x151515 : 0xf2c12e);
    this.fillBoost = 1;
  }

  _refreshCandidates(p) {
    this.carCand.length = 0; this.carCum.length = 0;
    this.pedCand.length = 0; this.pedCum.length = 0;
    let cw = 0, pw = 0;
    const R = CAR_R, PR = PED_R;
    for (const rec of this.chunkRecs.values()) {
      for (const e of rec.edges) {
        if (e.minX > p.x + R || e.maxX < p.x - R || e.minZ > p.z + R || e.maxZ < p.z - R) continue;
        if (e.car) {
          const w = CAR_W[e.cls] * e.len;
          for (const d of e.dirs) {
            if (!d) continue;
            cw += w * (0.6 + 0.4 * d.nLanes);
            this.carCand.push(d); this.carCum.push(cw);
          }
        }
        if (e.ped && !(e.minX > p.x + PR || e.maxX < p.x - PR || e.minZ > p.z + PR || e.maxZ < p.z - PR)) {
          pw += PED_W[e.cls] * e.len * (e.cls === 8 ? 1 : 2);
          this.pedCand.push(e); this.pedCum.push(pw);
        }
      }
    }
    this.carTarget = Math.min(MAX_CARS, Math.round(cw / 110));
    this.pedTarget = Math.min(MAX_PEDS, Math.round(pw / 16));
  }

  _pickWeighted(cand, cum) {
    const n = cand.length;
    if (!n) return null;
    const r = Math.random() * cum[n - 1];
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    return cand[lo];
  }

  _visible(x, y, z, r = 4) {
    this.sphere.center.set(x, y + 1, z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere);
  }

  _stopBack(node) {
    if (node.stopBack < 0) {
      let w = 6;
      for (const d of node.out) w = Math.max(w, d.e.width);
      for (const a of node.adj) if (a.e.cls !== 8) w = Math.max(w, a.e.width);
      node.stopBack = w * 0.5 + 3.5;
    }
    return node.stopBack;
  }

  // ---------------- cars ----------------
  _chooseNext(de) {
    const node = de.to;
    let total = 0;
    const cands = [];
    for (const d of node.out) {
      if (d.e === de.e || !d.e.alive) continue;
      const dot = de.eHx * d.sHx + de.eHz * d.sHz;
      if (dot < -0.6) continue;
      let w = 0.25 + Math.max(0, dot) ** 2 * 2.2;
      if (d.e.cls === de.e.cls) w += 0.6;
      if (CAR_W[d.e.cls] < CAR_W[de.e.cls]) w *= 0.6;
      total += w;
      cands.push(d, total);
    }
    if (!cands.length) return de.e.alive ? (de.fwd ? de.e.dirs[1] : de.e.dirs[0]) : null;
    const r = Math.random() * total;
    for (let i = 0; i < cands.length; i += 2) if (cands[i + 1] >= r) return cands[i];
    return cands[cands.length - 2];
  }

  _carPose(c) {
    const de = c.de, e = de.e;
    const sg = de.fwd ? c.s : e.len - c.s;
    c.hint = evalEdge(e, sg, c.hint, this.tmp);
    const t = this.tmp;
    const sgn = de.fwd ? 1 : -1;
    const ux = t.ux * sgn, uz = t.uz * sgn;
    const off = e.oneway
      ? (c.lane + 0.5 - de.nLanes * 0.5) * de.laneW
      : (this.lht ? -1 : 1) * (c.lane + 0.5) * de.laneW;
    c.x = t.x - uz * off;
    c.z = t.z + ux * off;
    c.y = t.y;
    c.ux = ux; c.uz = uz;
    c.slope = t.slope * sgn;
  }

  _spawnCar(c, p, initial) {
    for (let tries = 0; tries < 4; tries++) {
      const de = this._pickWeighted(this.carCand, this.carCum);
      if (!de || !de.e.alive) return false;
      c.de = de;
      c.s = Math.random() * de.e.len;
      c.hint = 0;
      c.lane = (Math.random() * de.nLanes) | 0;
      this._carPose(c);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > CAR_R || d < (initial ? 25 : 60)) continue;
      if (!initial && d < 220 && this._visible(c.x, c.y, c.z)) continue;
      if (this._nearObstacle(c.x, c.z, 11)) continue;
      const cls = de.e.cls;
      const r = Math.random();
      let type = 0;
      if (cls >= 1 && cls <= 4 && r < 0.06) type = 4;
      else if (r < 0.1) type = 3;
      else if (r < 0.25) type = 1;
      else if (r < 0.35) type = 2;
      c.type = type;
      const spec = CAR_TYPES[type];
      c.len = spec.length; c.wid = spec.width;
      c.drv = (0.85 + Math.random() * 0.3) * (type === 4 ? 0.8 : 1);
      c.v = CAR_SPEED[cls] * c.drv * 0.8;
      c.paint = type === 1 ? this.taxiPaint : type === 0 || type === 2 ? pick(PAINTS) : null;
      c.next = this._chooseNext(de);
      c.brake = 0; c.blockedT = 0; c.ignoreT = 0; c.bumpT = 0; c.stuckT = 0;
      c.rx = c.x; c.ry = c.y; c.rz = c.z; c.ryaw = Math.atan2(c.ux, c.uz); c.rpitch = 0;
      c.active = true;
      return true;
    }
    return false;
  }

  _nearObstacle(x, z, r) {
    const o = this.obs;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = this.cells.get(hashKey(x + i * HASH, z + j * HASH));
        if (!l) continue;
        for (const k of l) if (Math.abs(o.x[k] - x) < r && Math.abs(o.z[k] - z) < r) return true;
      }
    }
    return false;
  }

  _addObstacle(x, z, hx, hz, hl, hw, v, kind, ref) {
    const o = this.obs, k = o.n++;
    o.x[k] = x; o.z[k] = z; o.hx[k] = hx; o.hz[k] = hz; o.hl[k] = hl; o.hw[k] = hw; o.v[k] = v; o.kind[k] = kind; o.ref[k] = ref;
    const key = hashKey(x, z);
    const l = this.cells.get(key);
    if (l) l.push(k); else this.cells.set(key, [k]);
    return k;
  }

  _buildObstacles() {
    this.obs.n = 0;
    for (const l of this.cells.values()) l.length = 0;
    const app = this.app;
    for (const c of this.cars) {
      if (!c.active) continue;
      c.obs = this._addObstacle(c.x, c.z, c.ux, c.uz, c.len * 0.5, c.wid * 0.5, c.v, 0, c);
    }
    for (const p of this.peds) {
      if (p.active && p.state === 2) this._addObstacle(p.x, p.z, p.hx, p.hz, 0.4, 0.4, 0, 2, p);
    }
    if (app.mode === 'drive' || app.mode === 'walk') {
      const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2 };
      const drive = app.mode === 'drive';
      const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
      this.playerObs = this._addObstacle(app.pos.x, app.pos.z, hx, hz, drive ? spec.length * 0.5 : 0.45, drive ? spec.width * 0.5 : 0.45, Math.max(0, app.speed || 0), 1, null);
    } else {
      this.playerObs = -1;
    }
  }

  _updateCar(c, dt, now) {
    const de = c.de, e = de.e;
    const o = this.obs;
    let gap = Infinity, leadV = 0;
    const lx = c.x + c.ux * 15, lz = c.z + c.uz * 15;
    const cxk = Math.floor(lx / HASH), czk = Math.floor(lz / HASH);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = this.cells.get((cxk + i + 2000) * 5000 + (czk + j + 2000));
        if (!l) continue;
        for (const k of l) {
          if (k === c.obs) continue;
          const dx = o.x[k] - c.x, dz = o.z[k] - c.z;
          const along = dx * c.ux + dz * c.uz;
          if (along <= 0.5 || along > 48) continue;
          const hdot = o.hx[k] * c.ux + o.hz[k] * c.uz;
          if (o.kind[k] === 0 && hdot < -0.5) continue;
          if (c.ignoreT > 0 && o.kind[k] === 0 && hdot < 0.6) continue;
          const ah = Math.abs(hdot);
          const ext = ah * o.hw[k] + Math.sqrt(Math.max(0, 1 - ah * ah)) * o.hl[k];
          const lat = Math.abs(dx * c.uz - dz * c.ux);
          if (lat > c.wid * 0.5 + ext + 0.25) continue;
          const g = along - c.len * 0.5 - (ah * o.hl[k] + Math.sqrt(Math.max(0, 1 - ah * ah)) * o.hw[k]);
          if (g < gap) { gap = g; leadV = o.v[k] * Math.max(0, hdot); }
        }
      }
    }

    // Traffic signal at the end of this edge.
    let atRed = false;
    const rem = e.len - c.s;
    const node = de.to;
    if (node.sig && rem < 70) {
      const ph = getSignalPhase(node.sig, now, de.endAxis);
      if (ph !== 'green') {
        // [integration] +2.2: car-following keeps ~2.5 m to a stopped leader; the stop line is not a car, so
        // offset it to halt with the bumper just behind street's painted line.
        const stopDist = rem - this._stopBack(node) - c.len * 0.5 + 2.2;
        const canStop = c.v * c.v / (2 * 7) < stopDist + 0.5;
        if (stopDist > -0.5 && canStop && (ph === 'red' || c.v * c.v / (2 * 4) < stopDist)) {
          if (stopDist < gap) { gap = stopDist; leadV = 0; atRed = true; }
        }
      }
    }

    const v0 = CAR_SPEED[e.cls] * c.drv;
    let vT = v0;
    if (gap < Infinity) vT = Math.min(vT, Math.max(0, leadV + (gap - 2.5 - leadV * 1.1) * 0.6));
    if (c.next && rem < 30) {
      const dot = de.eHx * c.next.sHx + de.eHz * c.next.sHz;
      if (dot < 0.85) vT = Math.min(vT, 4.5 + 9 * Math.max(0, dot) + rem * 0.45);
    }
    if (c.bumpT > 0) { c.bumpT -= dt; vT = 0; }
    const dv = vT - c.v;
    c.v += dv > 0 ? Math.min(dv, 2.6 * dt) : Math.max(dv, -9 * dt);
    if (gap < 0.3) c.v = Math.min(c.v, 0.5 * Math.max(0, leadV));
    if (c.v < 0) c.v = 0;
    c.brake += ((dv < -0.4 || c.v < 0.3 ? 1 : 0) - c.brake) * Math.min(1, dt * 8);

    if (c.v < 0.2 && !atRed && c.bumpT <= 0) {
      c.blockedT += dt;
      c.stuckT += dt;
      if (c.blockedT > 5) { c.ignoreT = 2.5; c.blockedT = 0; }
    } else {
      c.blockedT = 0;
      if (c.v > 1) c.stuckT = 0;
    }
    if (c.ignoreT > 0) c.ignoreT -= dt;

    c.s += c.v * dt;
    let guard = 0;
    while (c.s > c.de.e.len && guard++ < 4) {
      c.s -= c.de.e.len;
      const nx = c.next && c.next.e.alive && c.next.from === c.de.to ? c.next : this._chooseNext(c.de);
      if (!nx) { c.active = false; return; }
      c.de = nx;
      c.hint = nx.fwd ? 0 : nx.e.n - 2;
      c.lane = Math.min(c.lane, nx.nLanes - 1);
      c.next = this._chooseNext(nx);
    }
    this._carPose(c);
  }

  _updateCars(dt, p, now, allowSpawn) {
    let active = 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (!c.de.e.alive) { c.active = false; continue; }
      this._updateCar(c, dt, now);
      if (!c.active) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > CAR_DESPAWN || (c.stuckT > 30 && !this._visible(c.x, c.y, c.z))) { c.active = false; continue; }
      const k = 1 - Math.exp(-dt * 10);
      c.rx += (c.x - c.rx) * k;
      c.ry += (c.y - c.ry) * k;
      c.rz += (c.z - c.rz) * k;
      let dy = Math.atan2(c.ux, c.uz) - c.ryaw;
      dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      c.ryaw += dy * Math.min(1, dt * 7);
      c.rpitch += (-Math.atan(c.slope) - c.rpitch) * k;
      active++;
    }
    if (!allowSpawn) return active;
    const initial = this.fillBoost > 0;
    let budget = initial ? 12 : 2;
    for (const c of this.cars) {
      if (active >= this.carTarget || budget <= 0) break;
      if (c.active) continue;
      budget--;
      if (this._spawnCar(c, p, initial)) active++;
    }
    return active;
  }

  // ---------------- pedestrians ----------------
  _pedOffset(ped) {
    const e = ped.e;
    return e.cls === 8 ? ped.footOff : e.width * 0.5 + (e.cls === 5 ? 0.8 : 1.1);
  }

  _enterPedEdge(ped, e, fwd, carry) {
    ped.e = e; ped.fwd = fwd; ped.s = carry; ped.hint = fwd ? 0 : e.n - 2;
    const end = fwd ? e.b : e.a;
    ped.willCross = Boolean(end.sig) && e.cls >= 2 && e.cls <= 5 && Math.random() < 0.45;
    ped.waitT = 0;
    if (e.cls === 8) ped.footOff = 0.2 + Math.random() * 0.6;
  }

  _pedPose(ped) {
    const e = ped.e;
    const sg = ped.fwd ? ped.s : e.len - ped.s;
    ped.hint = evalEdge(e, Math.min(e.len, Math.max(0, sg)), ped.hint, this.tmp);
    const t = this.tmp;
    const off = this._pedOffset(ped);
    let lat = ped.side * off;
    if (ped.state === 2) lat = ped.side * off * (1 - 2 * clamp(ped.crossT / ped.crossDur, 0, 1));
    lat += ped.lat;
    ped.x = t.x - t.uz * lat;
    ped.z = t.z + t.ux * lat;
    ped.y = t.y + (ped.state === 2 || e.cls === 8 ? 0.02 : 0.06);
    if (ped.state === 2) { ped.hx = t.uz * ped.side; ped.hz = -t.ux * ped.side; }
    else { const sgn = ped.fwd ? 1 : -1; ped.hx = t.ux * sgn; ped.hz = t.uz * sgn; }
    ped.gux = t.ux; ped.guz = t.uz;
  }

  _spawnPed(ped, p, initial) {
    for (let tries = 0; tries < 4; tries++) {
      const e = this._pickWeighted(this.pedCand, this.pedCum);
      if (!e || !e.alive) return false;
      ped.state = 0; ped.lat = 0; ped.crossT = 0;
      ped.side = Math.random() < 0.5 ? -1 : 1;
      ped.footOff = 0.2 + Math.random() * 0.6;
      this._enterPedEdge(ped, e, Math.random() < 0.5, Math.random() * e.len);
      this._pedPose(ped);
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d > PED_R || d < (initial ? 8 : 25)) continue;
      if (!initial && d < 90 && this._visible(ped.x, ped.y, ped.z, 1.5)) continue;
      ped.v = 1.05 + Math.random() * 0.55;
      ped.phase = Math.random() * 6.28;
      ped.amp = 0.5;
      ped.scale = 0.9 + Math.random() * 0.18;
      ped.shirt = pick(SHIRTS); ped.pants = pick(PANTS); ped.skin = pick(SKINS);
      ped.ryaw = Math.atan2(ped.hx, ped.hz);
      ped.active = true;
      return true;
    }
    return false;
  }

  _updatePed(ped, dt, now, app) {
    const e = ped.e;
    if (!e.alive) { ped.active = false; return; }
    let speed = ped.v;
    if (ped.state === 0) {
      const end = ped.fwd ? e.b : e.a;
      if (ped.willCross && end.sig) {
        const crossAt = e.len - Math.max(2, this._stopBack(end) - 2);
        if (ped.s >= crossAt) { ped.s = Math.max(ped.s, crossAt); ped.state = 1; ped.waitT = 0; }
      }
    }
    if (ped.state === 1) {
      speed = 0;
      ped.waitT += dt;
      const end = ped.fwd ? e.b : e.a;
      const off = this._pedOffset(ped);
      ped.crossDur = (2 * off) / ped.v;
      const axis = approachAxis(ped.gux, ped.guz);
      const info = getSignalInfo(end.sig, now, axis);
      if (info.phase === 'red' && info.timeLeft > ped.crossDur + 1) { ped.state = 2; ped.crossT = 0; }
      else if (ped.waitT > 45) { ped.state = 0; ped.willCross = false; }
    } else if (ped.state === 2) {
      speed = 0;
      ped.crossT += dt;
      if (ped.crossT >= ped.crossDur) { ped.side = -ped.side; ped.state = 0; ped.willCross = false; }
    }

    // Avoid the player (step aside), slow down when close.
    const pdx = ped.x - app.pos.x, pdz = ped.z - app.pos.z;
    const pd = Math.hypot(pdx, pdz);
    const drive = app.mode === 'drive';
    const R = drive ? 5.5 : 1.6;
    if (pd < R && ped.state !== 2) {
      const nx = -ped.guz, nz = ped.gux;
      const sgn = pdx * nx + pdz * nz >= 0 ? 1 : -1;
      ped.lat = clamp(ped.lat + sgn * (R - pd) * 4 * dt, -2.4, 2.4);
      if (drive && pd < 2.5 && Math.abs(app.speed) > 3) ped.lat = sgn * 2.4;
      speed *= pd < R * 0.5 ? 0.2 : 0.6;
    } else if (ped.lat !== 0) {
      const dl = Math.min(Math.abs(ped.lat), 0.6 * dt);
      ped.lat -= Math.sign(ped.lat) * dl;
    }

    ped.s += speed * dt;
    if (ped.s >= e.len) {
      const node = ped.fwd ? e.b : e.a;
      const carry = ped.s - e.len;
      const cands = node.adj.filter((a) => a.e !== e && a.e.alive);
      let nx;
      if (cands.length) nx = pick(cands);
      else nx = { e, fwd: !ped.fwd };
      // Keep the pedestrian on the same physical side of the street.
      const wx = ped.x - node.x, wz = ped.z - node.z;
      this._enterPedEdge(ped, nx.e, nx.fwd, carry);
      this._pedPose(ped);
      const s2 = wx * -ped.guz + wz * ped.gux;
      ped.side = s2 >= 0 ? 1 : -1;
    }
    this._pedPose(ped);
    const moving = speed > 0.05 || ped.state === 2;
    const v = ped.state === 2 ? ped.v : speed;
    ped.phase += dt * v * 5.0;
    ped.amp += ((moving ? 0.5 : 0) - ped.amp) * Math.min(1, dt * 6);
    let dy = Math.atan2(ped.hx, ped.hz) - ped.ryaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    ped.ryaw += dy * Math.min(1, dt * 8);
  }

  _updatePeds(dt, p, now, allowSpawn) {
    let active = 0;
    const app = this.app;
    for (const ped of this.peds) {
      if (!ped.active) continue;
      this._updatePed(ped, dt, now, app);
      if (!ped.active) continue;
      if (Math.hypot(ped.x - p.x, ped.z - p.z) > PED_DESPAWN) { ped.active = false; continue; }
      active++;
    }
    if (!allowSpawn) return active;
    const initial = this.fillBoost > 0;
    let budget = initial ? 16 : 3;
    for (const ped of this.peds) {
      if (active >= this.pedTarget || budget <= 0) break;
      if (ped.active) continue;
      budget--;
      if (this._spawnPed(ped, p, initial)) active++;
    }
    return active;
  }

  // ---------------- player collisions ----------------
  _collidePlayer() {
    const app = this.app;
    if (app.mode !== 'drive' && app.mode !== 'walk') return;
    const drive = app.mode === 'drive';
    const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2 };
    const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
    const pl = drive ? spec.length * 0.5 : 0.4, pw = drive ? spec.width * 0.5 : 0.4;
    let hit = false;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (Math.abs(c.x - app.pos.x) > 9 || Math.abs(c.z - app.pos.z) > 9) continue;
      if (Math.abs(c.y - app.pos.y) > 3) continue;
      const r = obbOverlap(app.pos.x, app.pos.z, hx, hz, pl, pw, c.x, c.z, c.ux, c.uz, c.len * 0.5, c.wid * 0.5);
      if (!r) continue;
      const px0 = app.pos.x, pz0 = app.pos.z;
      app.pos.x += r.nx * r.depth;
      app.pos.z += r.nz * r.depth;
      if (app.collision) { // fix/water: an AI car must never shove the player into a building
        const rc = drive
          ? app.collision.resolveCar(app.pos.x, app.pos.y, app.pos.z, app.yaw, spec, px0, pz0)
          : app.collision.resolve(app.pos.x, app.pos.y, app.pos.z, app.yaw, 0.45, [0], null, px0, pz0);
        app.pos.x = rc.x;
        app.pos.z = rc.z;
      }
      if (drive) {
        const into = (hx * r.nx + hz * r.nz) * Math.sign(app.speed || 0);
        if (into < 0) app.speed *= 0.35;
        else app.speed *= 0.85;
      }
      c.v *= 0.3;
      c.bumpT = Math.max(c.bumpT, 1.5);
      hit = true;
    }
    if (hit) {
      if (drive && app.vehicleMesh) app.vehicleMesh.position.copy(app.pos);
      if (!drive && app.avatarMesh) app.avatarMesh.position.copy(app.pos);
    }
  }

  // ---------------- rendering ----------------
  _writeInstances(showPeds) {
    const counts = new Array(this.carMeshes.length).fill(0);
    const m4 = this.m4, q = this.q, eul = this.eul, v3 = this.v3, s3 = this.s3;
    s3.set(1, 1, 1);
    for (const c of this.cars) {
      if (!c.active) continue;
      const cm = this.carMeshes[c.type];
      const i = counts[c.type]++;
      eul.set(c.rpitch, c.ryaw, 0, 'YXZ');
      q.setFromEuler(eul);
      v3.set(c.rx, c.ry + 0.02, c.rz);
      m4.compose(v3, q, s3);
      cm.mesh.setMatrixAt(i, m4);
      const pa = cm.iPaint.array;
      if (c.paint) { pa[i * 4] = c.paint.r; pa[i * 4 + 1] = c.paint.g; pa[i * 4 + 2] = c.paint.b; pa[i * 4 + 3] = 1; }
      else pa[i * 4 + 3] = 0;
      cm.iBrake.array[i] = c.brake;
    }
    for (let t = 0; t < this.carMeshes.length; t++) {
      const cm = this.carMeshes[t];
      cm.mesh.count = counts[t];
      if (counts[t]) {
        cm.mesh.instanceMatrix.needsUpdate = true;
        cm.iPaint.needsUpdate = true;
        cm.iBrake.needsUpdate = true;
      }
    }
    const P = this.ped;
    let n = 0;
    if (showPeds) {
      const an = P.iAnim.array, sh = P.iShirt.array, pa = P.iPants.array, sk = P.iSkin.array;
      for (const ped of this.peds) {
        if (!ped.active) continue;
        q.setFromAxisAngle(this._up || (this._up = new THREE.Vector3(0, 1, 0)), ped.ryaw);
        v3.set(ped.x, ped.y, ped.z);
        s3.set(ped.scale, ped.scale, ped.scale);
        m4.compose(v3, q, s3);
        P.mesh.setMatrixAt(n, m4);
        an[n * 2] = ped.phase; an[n * 2 + 1] = ped.amp;
        sh[n * 3] = ped.shirt.r; sh[n * 3 + 1] = ped.shirt.g; sh[n * 3 + 2] = ped.shirt.b;
        pa[n * 3] = ped.pants.r; pa[n * 3 + 1] = ped.pants.g; pa[n * 3 + 2] = ped.pants.b;
        sk[n * 3] = ped.skin.r; sk[n * 3 + 1] = ped.skin.g; sk[n * 3 + 2] = ped.skin.b;
        n++;
      }
    }
    P.mesh.count = n;
    if (n) {
      P.mesh.instanceMatrix.needsUpdate = true;
      P.iAnim.needsUpdate = true; P.iShirt.needsUpdate = true; P.iPants.needsUpdate = true; P.iSkin.needsUpdate = true;
    }
  }

  _lightsLevel() {
    if (!daylight.__stub) {
      try {
        if (daylight.isNight()) return 1;
        return clamp((0.65 - daylight.getDaylight()) / 0.5, 0, 1);
      } catch (_) { /* fall through */ }
    }
    const idx = this.app.timePresetIdx | 0; // TIME_PRESET_ORDER: noon, sunset, night, overcast
    return idx === 2 ? 1 : idx === 1 ? 0.45 : idx === 3 ? 0.25 : 0;
  }

  update(dt, playerPos, loadedChunks) {
    if (!this.group.visible) return;
    const app = this.app;
    if (app.worldOrigin !== this.origin) {
      this.origin = app.worldOrigin;
      this._resetAll();
    }
    const p = playerPos;
    this._syncChunks(loadedChunks, p);
    this.candTimer -= dt;
    if (this.candTimer <= 0) {
      this.candTimer = 1.0;
      this._refreshCandidates(p);
    }
    const cam = app.camera;
    if (cam) {
      this.projM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projM);
    }
    const now = signalTime();
    this._buildObstacles();
    const cars = this._updateCars(dt, p, now, this.carCand.length > 0);
    const camHigh = cam ? cam.position.y - p.y > 160 : false;
    const peds = camHigh ? this.peds.filter((x) => x.active).length : this._updatePeds(dt, p, now, this.pedCand.length > 0);
    if (this.fillBoost > 0 && cars >= this.carTarget * 0.9 && peds >= this.pedTarget * 0.9 && this.carTarget > 0) this.fillBoost = 0;
    this._collidePlayer();
    this.uniforms.uLights.value = this._lightsLevel();
    this._writeInstances(!camHigh);
    this.stats.cars = cars;
    this.stats.peds = peds;
  }
}
