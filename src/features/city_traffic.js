// AI city traffic + pedestrians for any city (replaces the Beijing-only TrafficManager).
// - Lane graph per chunk is built in the chunk worker (traffic_graph.js) and merged here
//   incrementally for chunks near the player.
// - Cars: drive on the regional side, respect oneway, follow lanes, car-following,
//   stop at red signals (signals.js), instanced rendering (traffic_models.js).
// - Pedestrians: sidewalks/footways, cross at intersections, fall apart into multi-part
//   ragdoll pieces when hit by player car, AI traffic cars, or Kaiju monster/weapons,
//   and lie on the ground before respawning.
// - Player car collides with AI cars (2D OBB, bump + slow down).
import * as THREE from '../../vendor/three.module.js';
import { VEHICLE_SPECS } from '../entities.js';
import { buildTrafficGraph, isLeftHandTraffic } from './traffic_graph.js';
import { getSignalPhase, getSignalInfo, approachAxis, signalTime } from './signals.js';
import * as daylight from './daylight.js';
import {
  CAR_TYPES,
  RAGDOLL_PART_NAMES,
  createCarMeshes,
  createPedMesh,
  createPedPartMeshes,
  createImpactPuffMesh,
} from './traffic_models.js';
import { TESLA_PAINTS, TOW_TRUCK_PAINTS } from './vehicles.js'; // [feature/vehicles]
import { randomPersonLook, bit, OPT } from './person_model.js'; // [feature/people]
import { startRagdoll, stepRagdoll, ragdollCenter } from './ped_ragdoll.js'; // [drivers]
import { PeopleAgents } from './people_agents.js'; // [people-agents]
import { QUALITY } from './quality.js'; // [ui-mobile]
import { VehicleDamage, DAMAGE_BY_SOURCE } from './vehicle_damage.js'; // [car-explosions]
import { LiveTraffic } from './live_traffic.js'; // [live-traffic]

const UMBRELLA_BIT = bit(OPT.UMBRELLA);
// [human-motion] pedestrians closer than this (and at most this many) use the detailed figure.
const PED_NEAR_D2 = 38 * 38;
const PED_NEAR_MAX = 90;
const DEFAULT_LOOK = {
  wScale: 1, hScale: 1, style: 0, umbRoll: 1,
  top: { r: 0.3, g: 0.4, b: 0.6 }, pants: { r: 0.2, g: 0.2, b: 0.25 }, skin: { r: 0.9, g: 0.75, b: 0.6 },
  hair: { r: 0.1, g: 0.08, b: 0.06 }, acc: { r: 0.2, g: 0.2, b: 0.2 },
};

const MAX_CARS = 140; // [live-traffic] 110 normally; jams may add up to 30 (queues need bumper-to-bumper cars)
const CARS_BASE = 110;
const MAX_PEDS = 72;
const MAX_PEDS_CAP = 420; // [kaiju] instanced capacity for the panic density boost
const WRECK_PAINT = new THREE.Color(0x14120f); // [kaiju] burned wreck tint
const CAR_R = 400;
const CAR_DESPAWN = 470;
const PED_R = 210;
const PED_DESPAWN = 250;
const GRAPH_SPAN = 1500; // include chunks whose center is within this many meters (3x3 around player)
const HASH = 30;

const RAGDOLL_LIE_DURATION = 15.0;
const MAX_PUFFS = 128;

// Indexed by traffic class code (see traffic_graph.js).
const CAR_SPEED = [25, 20, 14, 12.5, 11, 8, 6, 12, 0, 0];
// Physical vehicle mass (kg) by CAR_TYPES index: sedan, taxi, coupe, police, bus, tesla, cybertruck, ambulance, tow_truck
const CAR_MASS_KG = [1500, 1550, 1420, 1850, 11000, 2100, 3100, 4500, 6200];
const CAR_W = [3, 2.6, 2.2, 1.6, 1.1, 0.35, 0, 0.8, 0, 0];
// [traffic-fix] painted crosswalk depth per class (street_worker: 4 m trunk..tertiary, 3 m residential, none else)
const CROSSWALK_W = [0, 4, 4, 4, 4, 3, 0, 0, 0, 0];
const LANE_STEPS = [-1, 1];
const EMPTY = [];
const PED_W = [0, 0, 1.15, 1.0, 0.45, 0.18, 0, 0, 1.0, 0]; // [terrain-roads] footways/trails weigh more

const PAINTS = [
  0xf2f2f0, 0xf2f2f0, 0xe8e8e6, 0x161719, 0x161719, 0x1f2124, 0xa7abb0, 0xa7abb0, 0x6c7177,
  0x41464d, 0x1d3557, 0x2b4c7e, 0x8d1b1b, 0xb3261e, 0xc9b79c, 0x2f4f3a, 0x5b3a29, 0x3a5f8f, 0xd9a62e,
].map((h) => new THREE.Color(h));

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

// [traffic-fix] evalEdge with the tangent blended over the last/first 4 m of each polyline segment, so a lane
// offset from it stays continuous across vertices (no sideways jump, no yaw snap).
function evalEdgeSmooth(e, s, hint, out) {
  const i = evalEdge(e, s, hint, out);
  const cum = e.cum, p = e.pts;
  const d0 = s - cum[i], d1 = cum[i + 1] - s;
  let w = 0, j = -1;
  if (d1 < d0 && i < e.n - 2) { const B = Math.min(4, (cum[i + 1] - cum[i]) * 0.5, (cum[i + 2] - cum[i + 1]) * 0.5); if (d1 < B) { w = 0.5 * (1 - d1 / B); j = i + 1; } }
  else if (i > 0) { const B = Math.min(4, (cum[i + 1] - cum[i]) * 0.5, (cum[i] - cum[i - 1]) * 0.5); if (d0 < B) { w = 0.5 * (1 - d0 / B); j = i - 1; } }
  if (j >= 0 && w > 0) {
    const k = j * 3, L = cum[j + 1] - cum[j] || 1e-6;
    const ux = (p[k + 3] - p[k]) / L, uz = (p[k + 5] - p[k + 2]) / L;
    let bx = out.ux * (1 - w) + ux * w, bz = out.uz * (1 - w) + uz * w;
    const l = Math.hypot(bx, bz) || 1;
    out.ux = bx / l; out.uz = bz / l;
  }
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

function flushPedMesh(T, n) {
  T.mesh.count = n;
  if (!n) return;
  T.mesh.instanceMatrix.needsUpdate = true;
  T.iAnim.needsUpdate = true; T.iGait.needsUpdate = true; T.iShirt.needsUpdate = true; T.iPants.needsUpdate = true;
  T.iSkin.needsUpdate = true; T.iHair.needsUpdate = true; T.iAcc.needsUpdate = true;
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
    this.ped = createPedMesh(MAX_PEDS_CAP); // [kaiju]
    this.group.add(this.ped.mesh);
    this.pedFar = createPedMesh(MAX_PEDS_CAP, 1); // [human-motion] far detail level
    this.group.add(this.pedFar.mesh);
    this.agents = new PeopleAgents(app, this); // [people-agents] window.app.people
    app.people = this.agents;

    // Detached ragdoll body part meshes (head, torso, armL, armR, legL, legR, accessory)
    this.partMeshes = createPedPartMeshes(MAX_PEDS_CAP);
    this.pedParts = this.partMeshes;
    this.ped.parts = this.partMeshes;
    for (const name of RAGDOLL_PART_NAMES) {
      this.group.add(this.partMeshes[name]);
    }

    // Subtle impact dust/debris puff particles
    this.puffMesh = createImpactPuffMesh(MAX_PUFFS);
    this.group.add(this.puffMesh);
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.5, scale: 1 });
    }

    this.cars = [];
    for (let i = 0; i < MAX_CARS; i++) this.cars.push({ active: false, id: i });
    this.peds = [];
    for (let i = 0; i < MAX_PEDS_CAP; i++) {
      this.peds.push({
        active: false,
        id: i,
        state: 'walking',
        crossState: 0,
        stateTimer: 0,
        ragdollTimer: 0,
        lieTimer: 0,
        groundY: 0,
        parts: null,
        partsByName: null,
      });
    }
    this.kaiju = null; // [kaiju] KaijuCrowd hooks (car/carPost/ped) while Kaiju Defense is active
    this.pedCapBase = MAX_PEDS; this.pedCap = MAX_PEDS; this.pedMult = 1; // [kaiju]

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
    this._queuedImpacts = [];
    this._hitSoundCooldown = 0;
    this._audioCtx = null;

    this.obs = { n: 0, x: [], z: [], hx: [], hz: [], hl: [], hw: [], v: [], kind: [], ref: [], st: [] };
    this.frame = 0; // [traffic-fix] frame stamp for per-direction car lists / junction bookkeeping
    this._pl = { gap: Infinity, v: 0 };
    this.tmp2 = { x: 0, y: 0, z: 0, ux: 0, uz: 1, slope: 0 };
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
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this.stats = { cars: 0, peds: 0, ragdolls: 0, lying: 0, hits: 0, edges: 0, nodes: 0 };
    this.damage = new VehicleDamage(app, this); // [car-explosions] HP, explosions, wrecks
    app.vehicleDamage = this.damage;
    this.live = new LiveTraffic(app, this); // [live-traffic] congestion layer: speed ratio + density per lane direction
    this._ltT = 0;
    if (typeof window !== 'undefined') window.__cityTraffic = this; // debug/test handle
  }

  setVisible(v) {
    this.group.visible = Boolean(v);
  }

  _kaijuCreature() {
    const km = this.app && this.app.kaiju;
    if (!km || !km.active) return null;
    const kj = km.creature || km.kaiju;
    return kj && kj.alive !== false && kj.position ? kj : null;
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
    const n = {
      x, y, z, refs: 1, out: [], adj: [], sig: null, cell: nodeKey(qx, qz), stopBack: -1,
      inc: [], geo: null, sigStop: -1, rsv: [], apprCur: [], apprPrev: [], apprF: -1, xp: [], xpF: -1, // [traffic-fix]
    };
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
    for (const [i, k, sb] of g.sigKeys) { refs[i].sig = k; if (sb > 0) refs[i].sigStop = sb; } // [integration] street's stop line
    const E = g.eA.length;
    for (let i = 0; i < E; i++) {
      if ((i & 255) === 255) yield;
      const cls = g.eCls[i];
      const isBridge = (g.eOneway[i] & 2) !== 0;
      const car = CAR_W[cls] > 0, ped = PED_W[cls] > 0 && !(isBridge && cls !== 8);
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
        lanes: g.eLanes[i], width: g.eWidth[i], oneway: (g.eOneway[i] & 1) === 1,
        alive: true, minX, maxX, minZ, maxZ, dirs: [null, null], car, ped,
      };
      if (car) {
        e.dirs[0] = this._makeDir(e, true);
        e.a.out.push(e.dirs[0]); e.b.inc.push(e.dirs[0]);
        if (!e.oneway) { e.dirs[1] = this._makeDir(e, false); e.b.out.push(e.dirs[1]); e.a.inc.push(e.dirs[1]); }
        e.a.geo = null; e.b.geo = null; e.a.bgeo = null; e.b.bgeo = null; // [traffic-fix] junction geometry depends on every arm
      }
      if (ped) {
        e.a.adj.push({ e, fwd: true });
        e.b.adj.push({ e, fwd: false });
      }
      rec.edges.push(e);
      this.stats.edges++;
    }
    // [live-traffic] how urban this chunk is (km of drivable road per km2) -> rush-hour jam strength
    let carLen = 0;
    for (const e of rec.edges) if (e.car) carLen += e.len;
    const urb = clamp((carLen / 1000 - 6) / 24, 0.1, 1);
    for (const e of rec.edges) e.urb = urb;
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
        nd.inc = nd.inc.filter((d) => d.e !== e);
        nd.adj = nd.adj.filter((d) => d.e !== e);
        nd.stopBack = -1;
        nd.geo = null; nd.bgeo = null; // [traffic-fix]
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
    const kj = this._kaijuCreature();
    // Remove stale / far chunks.
    for (const [key, rec] of this.chunkRecs) {
      const c = loaded.get(key);
      const ud = rec.chunk.userData;
      const farPlayer = Math.abs(ud.ox - p.x) > GRAPH_SPAN + 300 || Math.abs(ud.oz - p.z) > GRAPH_SPAN + 300;
      const farKaiju = !kj || (Math.abs(ud.ox - kj.position.x) > GRAPH_SPAN + 300 || Math.abs(ud.oz - kj.position.z) > GRAPH_SPAN + 300);
      if (c !== rec.chunk || (farPlayer && farKaiju)) {
        this._removeChunk(key);
      }
    }
    // Add at most one new chunk per call (spreads the cost across frames), nearest first.
    let bestKey = null, bestChunk = null, bestD = Infinity;
    for (const [key, chunk] of loaded) {
      if (this.chunkRecs.has(key) || !chunk || !chunk.userData) continue;
      const ud = chunk.userData;
      const dxP = Math.abs(ud.ox - p.x), dzP = Math.abs(ud.oz - p.z);
      const nearP = dxP <= GRAPH_SPAN && dzP <= GRAPH_SPAN;
      const dxK = kj ? Math.abs(ud.ox - kj.position.x) : Infinity;
      const dzK = kj ? Math.abs(ud.oz - kj.position.z) : Infinity;
      const nearK = dxK <= GRAPH_SPAN && dzK <= GRAPH_SPAN;
      if (!nearP && !nearK) continue;
      const d = Math.min(dxP + dzP, dxK + dzK);
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
    for (const p of this.peds) {
      p.active = false;
      p.state = 'walking';
      p.parts = null;
      p.partsByName = null;
    }
    for (const pf of this.puffs) pf.active = false;
    if (this.damage) this.damage.reset(); // [car-explosions]
    const o = this.app.worldOrigin || {};
    this.lht = isLeftHandTraffic(o.centerLat, o.centerLon);
    const uk = o.centerLat > 49.8 && o.centerLat < 61 && o.centerLon > -11 && o.centerLon < 2;
    this.taxiPaint = o.isBeijing ? null : new THREE.Color(uk ? 0x151515 : 0xf2c12e);
    this.fillBoost = 1;
  }

  _refreshCandidates(p) {
    this.carCand.length = 0; this.carCum.length = 0;
    this.pedCand.length = 0; this.pedCum.length = 0;
    let cw = 0, pw = 0, cwT = 0, cwSlow = 0;
    const R = CAR_R, PR = PED_R;
    const ltOn = this.live.mode !== 'off'; // [live-traffic]
    const kj = this._kaijuCreature();
    const kx = kj ? kj.position.x : 0, kz = kj ? kj.position.z : 0;
    const kPR = 190;
    for (const rec of this.chunkRecs.values()) {
      for (const e of rec.edges) {
        const nearCarP = !(e.minX > p.x + R || e.maxX < p.x - R || e.minZ > p.z + R || e.maxZ < p.z - R);
        const nearPedP = !(e.minX > p.x + PR || e.maxX < p.x - PR || e.minZ > p.z + PR || e.maxZ < p.z - PR);
        const nearPedK = kj && !(e.minX > kx + kPR || e.maxX < kx - kPR || e.minZ > kz + kPR || e.maxZ < kz - kPR);
        if (e.car && nearCarP) {
          const w = CAR_W[e.cls] * e.len;
          // [live-traffic] density by time of day + jams; picks lean toward the player so a queue reads as a queue
          const prox = ltOn ? 0.35 + 0.65 * clamp(1 - Math.hypot((e.minX + e.maxX) * 0.5 - p.x, (e.minZ + e.maxZ) * 0.5 - p.z) / R, 0, 1) : 1;
          for (const d of e.dirs) {
            if (!d) continue;
            const wd = w * (0.6 + 0.4 * d.nLanes) * this.live.density(d);
            cwT += wd;
            if (ltOn && this.live.ratio(d) < 0.45) cwSlow += wd;
            cw += wd * prox;
            this.carCand.push(d); this.carCum.push(cw);
          }
        }
        if (e.ped && (nearPedP || nearPedK)) {
          const boost = nearPedK ? 2.5 : 1.0;
          pw += PED_W[e.cls] * e.len * (e.cls === 8 ? 1.2 : 2.4) * boost;
          this.pedCand.push(e); this.pedCum.push(pw);
        }
      }
    }
    this.carTarget = Math.round(Math.min(CARS_BASE + Math.round(30 * clamp((cwSlow / (cwT || 1)) * 2.5, 0, 1)), Math.round(cwT / 110)) * QUALITY.traffic); // [ui-mobile] tier scales traffic
    const basePed = Math.round(Math.min(this.pedCap, (pw / 28) * this.pedMult) * QUALITY.peds);
    this.pedBaseTarget = basePed;
    this.pedTarget = Math.min(this.pedCap, Math.round(basePed * this._pedTimeFactor()));
  }

  _pedTimeFactor() {
    const app = this.app;
    if (app && app.kaiju && app.kaiju.active) return 1.0;
    const atmo = app && app.atmosphere;
    if (atmo) {
      const h = (atmo.targetHour !== null && Number.isFinite(atmo.targetHour))
        ? atmo.targetHour
        : atmo.hour;
      if (Number.isFinite(h)) {
        const hr = ((h % 24) + 24) % 24;
        if (hr >= 21.5 || hr < 5.5) return 0.07; // Night: ~7%, almost nobody on the street
        if (hr < 7.5) return 0.30;               // Early morning / dawn: ~30%
        if (hr >= 18.5) return 0.35;             // Evening / dusk: ~35%
        if (atmo.targetHour === null && !daylight.__stub && daylight.isNight()) return 0.07;
        return 1.0;                              // Daytime: 100%
      }
    }
    if (!daylight.__stub) {
      try {
        if (daylight.isNight()) return 0.07;
        const d = daylight.getDaylight();
        if (d < 0.55) return 0.35;
        return 1.0;
      } catch (_) { /* fall through */ }
    }
    const idx = app ? (app.timePresetIdx | 0) : 0; // TIME_PRESET_ORDER: noon, sunset, night, overcast
    return idx === 2 ? 0.07 : idx === 1 ? 0.35 : 1.0;
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

  // ---------------- junctions [traffic-fix] ----------------
  // Geometry measured the way street_worker paints an intersection: box radius R = widest half-width + 1.2,
  // crosswalk [R+0.4, R+0.4+cw] (cw 4 m on trunk..tertiary, 3 m on residential), stop bar 0.9 m behind it.
  // Signalized nodes carry the street's exact stop distance (sigStop = R + cw + 2.35 on a major arm).
  _baseGeo(n) {
    let g = n.bgeo;
    if (g) return g;
    const seen = this._seenE || (this._seenE = new Set());
    seen.clear();
    for (const d of n.out) seen.add(d.e);
    for (const d of n.inc) seen.add(d.e);
    let w = 6, minCls = 9;
    for (const e of seen) { if (e.width > w) w = e.width; if (e.cls < minCls) minCls = e.cls; }
    for (const a of n.adj) if (a.e.cls !== 8 && a.e.width > w) w = a.e.width;
    g = n.bgeo = { R: w * 0.5 + 1.2, minCls, deg: seen.size, jct: seen.size >= 3 || Boolean(n.sig) };
    return g;
  }

  // Big junctions are clusters of graph nodes that the street paints as ONE intersection (centre S, radius RS):
  // signalized ones come with the street's own centre (the signal key) and stop distance; others are merged
  // the way street_worker merges them (nodes closer than 1.3 x the larger radius join the widest one).
  _nodeGeo(n) {
    let g = n.geo;
    if (g) return g;
    const b = this._baseGeo(n);
    g = n.geo = { R: b.R, minCls: b.minCls, deg: b.deg, jct: b.jct, sx: n.x, sz: n.z, RS: b.R };
    if (n.sig) {
      const i = n.sig.indexOf(',');
      g.sx = +n.sig.slice(0, i); g.sz = +n.sig.slice(i + 1);
      if (n.sigStop > 0) g.RS = Math.max(3, n.sigStop + Math.hypot(n.x - g.sx, n.z - g.sz) - 6.35);
    } else if (b.jct) {
      let kx = n.x, kz = n.z, kR = b.R;
      const mem = this._mem || (this._mem = []);
      mem.length = 0;
      // members are reached over short connectors (a walk over the lane graph, at most ~25 m out)
      const q = this._memQ || (this._memQ = []);
      q.length = 0; q.push(n);
      for (let qi = 0; qi < q.length && qi < 24; qi++) {
        const cur = q[qi];
        for (let t = 0; t < 2; t++) {
          for (const d of t ? cur.inc : cur.out) {
            const m = t ? d.from : d.to;
            if (m === n || q.indexOf(m) >= 0 || d.e.len > 26 || Math.hypot(m.x - n.x, m.z - n.z) > 26) continue;
            q.push(m);
            if (m.sig) continue;
            const bm = this._baseGeo(m);
            if (!bm.jct || Math.hypot(m.x - n.x, m.z - n.z) >= Math.max(b.R, bm.R) * 1.3) continue;
            mem.push(m);
            if (bm.R > kR) { kR = bm.R; kx = m.x; kz = m.z; }
          }
        }
      }
      if (mem.length) {
        let RS = kR;
        RS = Math.max(RS, Math.hypot(n.x - kx, n.z - kz) * 0.5 + b.R);
        for (const m of mem) RS = Math.max(RS, Math.hypot(m.x - kx, m.z - kz) * 0.5 + this._baseGeo(m).R);
        g.sx = kx; g.sz = kz; g.RS = RS;
      }
    }
    return g;
  }

  // Is lane direction de a connector inside one painted intersection (both ends in the same cluster)?
  _internal(de) {
    const a = this._nodeGeo(de.from), b = this._nodeGeo(de.to);
    return a.jct && b.jct && Math.abs(a.sx - b.sx) < 0.6 && Math.abs(a.sz - b.sz) < 0.6;
  }

  // Distance from node n (back along approach de) the front bumper must stay behind: just short of the
  // painted stop bar of the intersection's arm, wherever the graph node sits inside the painted box.
  _stopLine(n, de, avail = de.e.len) {
    const g = this._nodeGeo(n), cw = CROSSWALK_W[de.e.cls];
    if (this._internal(de)) return Math.min(g.R + 1.0, avail * 0.5);
    const off = (n.x - g.sx) * de.eHx + (n.z - g.sz) * de.eHz;
    return clamp(off + (cw ? g.RS + cw + 2.55 : g.RS + 1.0), 1.5, avail * 0.5);
  }

  // Distance past node n (along exit d) where the exit crosswalk ends: room needed beyond it before entering.
  _exitClear(n, d, avail = d.e.len) {
    const g = this._nodeGeo(n), cw = CROSSWALK_W[d.e.cls];
    if (this._internal(d)) return Math.min(g.R + 0.8, avail * 0.5);
    const off = (g.sx - n.x) * d.sHx + (g.sz - n.z) * d.sHz;
    return clamp(off + (cw ? g.RS + cw + 1.0 : g.RS + 0.8), 1.5, avail * 0.5);
  }

  // Where pedestrians cross edge e next to node n: the middle of that arm's crosswalk (-1: no crosswalk there).
  _crossAt(n, e) {
    const g = this._nodeGeo(n);
    const o = n === e.a ? e.b : e.a, go = this._nodeGeo(o);
    if (go.jct && Math.abs(go.sx - g.sx) < 0.6 && Math.abs(go.sz - g.sz) < 0.6) return -1; // inside the box
    const p = e.pts, k = n === e.b ? (e.n - 1) * 3 : 0, k1 = n === e.b ? (e.n - 2) * 3 : 3;
    let hx = p[k] - p[k1], hz = p[k + 2] - p[k1 + 2]; // heading toward n
    const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l;
    const at = (n.x - g.sx) * hx + (n.z - g.sz) * hz + g.RS + 0.4 + (CROSSWALK_W[e.cls] || 3) * 0.5;
    return at < e.len - 0.5 ? at : -1; // [traffic-r2] on a chunk-border stub the crosswalk lies on the next edge: not here
  }

  _laneOff(de, lane) {
    return de.e.oneway ? (lane + 0.5 - de.nLanes * 0.5) * de.laneW : (this.lht ? -1 : 1) * (lane + 0.5) * de.laneW;
  }

  // Pose on a lane at distance s along a lane direction (tangent blended across polyline vertices).
  _lanePt(de, lane, s, out) {
    const e = de.e;
    const sg = de.fwd ? s : e.len - s;
    evalEdgeSmooth(e, clamp(sg, 0, e.len), sg > e.len * 0.5 ? e.n - 2 : 0, out);
    if (!de.fwd) { out.ux = -out.ux; out.uz = -out.uz; out.slope = -out.slope; }
    const off = this._laneOff(de, lane);
    out.x -= out.uz * off; out.z += out.ux * off;
    return out;
  }

  _newArc() {
    return { ok: false, node: null, inD: null, outD: null, lane: 0, nLane: 0, a: 0, b: 0, straight: 1,
      x0: 0, y0: 0, z0: 0, x1: 0, z1: 0, x2: 0, y2: 0, z2: 0, L: 1, k: 1, pts: new Float32Array(14) };
  }

  _exitLane(c, nx) {
    let l = Math.min(c.lane, nx.nLanes - 1);
    if (nx.ltWork && nx.ltWork.lane === l) l = Math.max(0, l - 1); // [live-traffic] merge past works
    return l;
  }

  // Turn path through the box: quadratic Bezier from the in-lane at the box edge to the out-lane at the box
  // edge, control point where the two lane lines meet. Sampled for the reservation conflict test.
  _buildArc(A, de, lane, nx, nLane) {
    const n = de.to, R = this._nodeGeo(n).R, t = this.tmp2;
    const a = Math.min(R + 0.3, de.e.len * 0.45), b = Math.min(R + 0.3, nx.e.len * 0.45);
    this._lanePt(de, lane, de.e.len - a, t);
    const x0 = t.x, y0 = t.y, z0 = t.z, h0x = t.ux, h0z = t.uz;
    this._lanePt(nx, nLane, b, t);
    const x2 = t.x, y2 = t.y, z2 = t.z, h2x = t.ux, h2z = t.uz;
    let x1 = (x0 + x2) * 0.5, z1 = (z0 + z2) * 0.5;
    const cr = h0x * h2z - h0z * h2x;
    if (Math.abs(cr) > 0.17) {
      const dx = x2 - x0, dz = z2 - z0;
      const tt = (dx * h2z - dz * h2x) / cr, uu = -(dx * h0z - dz * h0x) / cr;
      if (tt > 0 && uu > 0 && tt < (a + b) * 1.5 && uu < (a + b) * 1.5) { x1 = x0 + h0x * tt; z1 = z0 + h0z * tt; }
    }
    A.ok = true; A.node = n; A.inD = de; A.outD = nx; A.lane = lane; A.nLane = nLane; A.a = a; A.b = b;
    A.straight = h0x * h2x + h0z * h2z;
    A.x0 = x0; A.y0 = y0; A.z0 = z0; A.x1 = x1; A.z1 = z1; A.x2 = x2; A.y2 = y2; A.z2 = z2;
    const P = A.pts;
    let L = 0;
    for (let i = 0; i <= 6; i++) {
      const T = i / 6, u = 1 - T;
      P[i * 2] = u * u * x0 + 2 * u * T * x1 + T * T * x2;
      P[i * 2 + 1] = u * u * z0 + 2 * u * T * z1 + T * T * z2;
      if (i) L += Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
    }
    A.L = Math.max(0.5, L);
    A.k = clamp((a + b) / A.L, 0.6, 1.6); // s advances by straight-leg length: rescale so arc speed = v
    return A;
  }

  _arcFor(c) {
    if (!c.arcIn) c.arcIn = this._newArc();
    return this._buildArc(c.arcIn, c.de, c.lane, c.next, this._exitLane(c, c.next));
  }

  _arcPose(c, A, d) {
    const T = clamp(d / (A.a + A.b), 0, 1), u = 1 - T;
    c.x = u * u * A.x0 + 2 * u * T * A.x1 + T * T * A.x2;
    c.z = u * u * A.z0 + 2 * u * T * A.z1 + T * T * A.z2;
    c.y = A.y0 + (A.y2 - A.y0) * T;
    let hx = u * (A.x1 - A.x0) + T * (A.x2 - A.x1), hz = u * (A.z1 - A.z0) + T * (A.z2 - A.z1);
    let l = Math.hypot(hx, hz);
    if (l < 1e-5) { hx = A.x2 - A.x0; hz = A.z2 - A.z0; l = Math.hypot(hx, hz) || 1; }
    c.ux = hx / l; c.uz = hz / l;
    c.slope = (A.y2 - A.y0) / A.L;
  }

  _arcConflict(A, B, w) {
    const p = A.pts, q = B.pts, w2 = w * w;
    for (let i = 0; i < 14; i += 2) {
      for (let j = 0; j < 14; j += 2) {
        const dx = p[i] - q[j], dz = p[i + 1] - q[j + 1];
        if (dx * dx + dz * dz < w2) return true;
      }
    }
    return false;
  }

  _arcAt(h, n) {
    if (h.arcOut && h.arcOut.ok && h.arcOut.node === n) return h.arcOut;
    if (h.arcIn && h.arcIn.ok && h.arcIn.node === n) return h.arcIn;
    return null;
  }

  _holds(c, n) { return c.holdA === n || c.holdB === n; }

  _grant(c, n) {
    if (this._holds(c, n)) return;
    if (!c.holdA) c.holdA = n;
    else if (!c.holdB) c.holdB = n;
    else { this._release(c, c.holdA); c.holdA = n; }
    if (n.rsv.indexOf(c) < 0) n.rsv.push(c);
    c.holdT = 0; c.holdStall = 0;
  }

  _release(c, n) {
    if (!n) return;
    if (c.holdA === n) c.holdA = null;
    if (c.holdB === n) c.holdB = null;
    if (c.lookJ === n) c.lookJ = null;
    if (c.lookJ2 === n) c.lookJ2 = null;
    const i = n.rsv.indexOf(c);
    if (i >= 0) n.rsv.splice(i, 1);
  }

  _purgeRsv(n) {
    const r = n.rsv;
    for (let i = r.length - 1; i >= 0; i--) {
      const h = r[i];
      if (!h.active || h.kWreck || h.dState >= 2 || (h.holdA !== n && h.holdB !== n)) r.splice(i, 1);
    }
  }

  // Cars approaching a junction, double-buffered per frame (the complete previous frame is what others read).
  _apprAdd(n, c) {
    if (n.apprF !== this.frame) {
      const t = n.apprPrev;
      n.apprPrev = n.apprF === this.frame - 1 ? n.apprCur : (n.apprCur.length = 0, n.apprCur);
      n.apprCur = t; t.length = 0; n.apprF = this.frame;
    }
    n.apprCur.push(c);
  }

  _apprList(n) {
    if (n.apprF === this.frame) return n.apprPrev;
    if (n.apprF === this.frame - 1) return n.apprCur;
    return EMPTY;
  }

  // May car c enter the box of node n now? Box free of conflicting movements, no pedestrian on either
  // crosswalk of its movement, room past the exit crosswalk, and no approaching car with priority.
  _canEnter(c, n, A, toLine, after = null) {
    const de = A.inD, nx = A.outD;
    if (n.xpF === this.frame) for (const p of n.xp) if (p.e === de.e || p.e === nx.e) return false;
    this._purgeRsv(n);
    const force = c.waitT > 40; // nothing waits forever (a gridlock breaks on its own)
    if (!force) {
      // don't block the box: room for the whole car behind the last car in the exit lane
      // [traffic-r2] an exit that is only a chunk-border stub continues on `after`: its crosswalk and queue are there
      const stub = after && after.from === nx.to && after.e.alive && !this._nodeGeo(nx.to).jct;
      const exLen = stub ? nx.e.len + after.e.len : nx.e.len;
      const clr = this._exitClear(n, nx, exLen);
      let room = Infinity, leadSlow = false, queued = 0;
      if (nx._carsF === this.frame) {
        for (const o of nx._cars) {
          if (o === c || o.de !== nx || Math.abs(o.laneF - A.nLane) > 0.8) continue;
          const r = o.s - o.len * 0.5 - clr;
          if (r < room) { room = r; leadSlow = o.v < 3; }
        }
      }
      if (stub && after._carsF === this.frame) {
        const al = Math.min(A.nLane, after.nLanes - 1);
        for (const o of after._cars) {
          if (o === c || o.de !== after || Math.abs(o.laneF - al) > 0.8) continue;
          const r = nx.e.len + o.s - o.len * 0.5 - clr;
          if (r < room) { room = r; leadSlow = o.v < 3; }
        }
      }
      for (const h of n.rsv) {
        if (h === c || h.de === nx) continue;
        const B = this._arcAt(h, n);
        if (B && B.outD === nx && B.nLane === A.nLane) queued += h.len + 2.5;
      }
      if (queued) { room = Math.min(room, exLen - clr) - queued; leadSlow = true; }
      // an internal connector of a big junction only has to be free (the next node's check covers the exit)
      if (this._internal(nx) ? room < 0.5 && leadSlow : room < c.len + 2.5 && leadSlow) return false;
      for (const h of n.rsv) {
        if (h === c) continue;
        const B = this._arcAt(h, n);
        if (!B || (B.inD === de && B.lane === A.lane)) continue; // same lane: plain car following
        if (this._arcConflict(A, B, (c.wid + h.wid) * 0.5 + 0.6)) return false;
      }
    }
    if (c.waitT < 20) {
      const eta = toLine / Math.max(c.v, 0.1);
      for (const h of this._apprList(n)) {
        if (h === c || !h.active || h.apN !== n || h.v < 1 || this._holds(h, n)) continue;
        const B = h.apArc;
        if (!B || !B.ok || B.node !== n || B.inD === de) continue;
        const etaH = h.toLine / h.v;
        if (etaH > 3.5) continue;
        const prio = n.sig
          ? h.sigGo && B.straight > A.straight + 0.25 // turning across: give way to oncoming through traffic
          : B.inD.e.cls < de.e.cls || (B.inD.e.cls === de.e.cls && etaH + 0.6 < eta);
        if (prio && this._arcConflict(A, B, (c.wid + h.wid) * 0.5 + 0.6)) return false;
      }
    }
    return true;
  }

  // Enter node n only when the car can also clear the next node of the same painted intersection (divided
  // roads are several graph nodes): both are reserved at once, so it never stops halfway across the box.
  _enterChain(c, n, A, toLine, now, after = null, kOut = 0) {
    if (!this._canEnter(c, n, A, toLine, after)) return false;
    // [traffic-r2] the next junction on the route, across chunk-border stubs
    let ap2 = A.outD, k2 = kOut, d2 = ap2.e.len, L2 = A.nLane;
    while (ap2 && !this._nodeGeo(ap2.to).jct) {
      const d = k2 - kOut < 3 ? this._chain(c, k2 + 1) : null;
      if (!d) { ap2 = null; break; }
      k2++; ap2 = d; d2 += d.e.len; L2 = Math.min(L2, d.nLanes - 1);
    }
    const n2 = ap2 && ap2.to;
    if (n2 && n2 !== n && !this._holds(c, n2)) {
      const g1 = this._nodeGeo(n), g2 = this._nodeGeo(n2);
      const inner = Math.abs(g1.sx - g2.sx) < 0.6 && Math.abs(g1.sz - g2.sz) < 0.6;
      // too short to wait on without standing on a crosswalk / in a box: reserve both at once
      if (inner || d2 < this._exitClear(n, A.outD, d2) + this._stopLine(n2, ap2, d2) + c.len + 1) {
        if (!inner && n2.sig && getSignalPhase(n2.sig, now, ap2.endAxis) !== 'green') return false;
        const nn = this._chain(c, k2 + 1);
        if (nn) {
          const obj = A === c.arcIn2 ? (c.arcIn3 || (c.arcIn3 = this._newArc())) : (c.arcIn2 || (c.arcIn2 = this._newArc()));
          const B = this._buildArc(obj, ap2, L2, nn, Math.min(L2, nn.nLanes - 1));
          if (!this._canEnter(c, n2, B, toLine + d2, this._chain(c, k2 + 2))) return false;
          this._grant(c, n2);
          c.lookJ2 = n2;
        }
      }
    }
    this._grant(c, n);
    return true;
  }

  // [traffic-r2] Lane direction k of the car's route ahead: 0 = c.next, k >= 1 = the k-th choice after it. Choices
  // made here are kept (c.ahead) and driven, so a junction several chunk-border stubs ahead is planned for real.
  _chain(c, k) {
    if (k === 0) return c.next && c.next.e.alive ? c.next : null;
    const A = c.ahead || (c.ahead = []);
    for (let i = 0; i < k; i++) {
      const prev = i === 0 ? c.next : A[i - 1];
      if (!prev || !prev.e.alive) return null;
      let d = A[i];
      if (!d || d.from !== prev.to || !d.e.alive) {
        A.length = i;
        d = this._chooseNext(prev);
        if (!d) return null;
        A[i] = d;
      }
    }
    return A[k - 1];
  }

  // Movement arc of car c through the junction at the end of lane direction ap = route step kAp (-1: this edge).
  _apArc(c, ap, kAp) {
    if (kAp < 0) {
      const A = c.arcIn;
      return A && A.ok && A.inD === ap && A.outD === c.next && A.lane === c.lane ? A : this._arcFor(c);
    }
    let L = c.lane;
    for (let i = 0; i <= kAp; i++) { const d = this._chain(c, i); L = Math.min(L, d.nLanes - 1); if (d.ltWork && d.ltWork.lane === L) L = Math.max(0, L - 1); }
    const out = this._chain(c, kAp + 1), nl = Math.min(L, out.nLanes - 1);
    let A = c.arcIn2;
    if (!(A && A.ok && A.inD === ap && A.outD === out && A.lane === L && A.nLane === nl)) A = this._buildArc(c.arcIn2 || (c.arcIn2 = this._newArc()), ap, L, out, nl);
    return A;
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

  // [traffic-fix] Lane pose with smooth turns through junction boxes, eased lane changes (laneF), a lateral
  // swerve around obstacles (sw), and chassis pitch from the road height under both axles.
  _carPose(c) {
    const de = c.de, e = de.e;
    c.inArc = null;
    let A = c.arcOut;
    if (A && A.ok && A.outD === de && c.s < A.b) {
      this._arcPose(c, A, A.a + Math.max(0, c.s));
      c.inArc = A;
    } else {
      const nx = c.next;
      if (nx && nx.from === de.to && nx.e.alive) {
        const g = this._nodeGeo(de.to);
        if (g.jct && c.s > e.len - Math.min(g.R + 0.3, e.len * 0.45)) {
          A = c.arcIn;
          if (!(A && A.ok && A.inD === de && A.outD === nx && A.lane === c.lane)) A = this._arcFor(c);
          this._arcPose(c, A, c.s - (e.len - A.a));
          c.inArc = A;
        }
      }
    }
    if (c.inArc) {
      c.lx = c.x; c.lz = c.z;
      if (c.sw) { c.x -= c.uz * c.sw; c.z += c.ux * c.sw; }
      return;
    }
    const sg = de.fwd ? c.s : e.len - c.s;
    const t = this.tmp;
    c.hint = evalEdgeSmooth(e, clamp(sg, 0, e.len), c.hint, t);
    const sgn = de.fwd ? 1 : -1;
    const ux = t.ux * sgn, uz = t.uz * sgn;
    const off = this._laneOff(de, Number.isFinite(c.laneF) ? c.laneF : c.lane);
    c.lx = t.x - uz * off;
    c.lz = t.z + ux * off;
    const sw = c.sw || 0;
    c.x = c.lx - uz * sw;
    c.z = c.lz + ux * sw;
    c.y = t.y;
    c.ux = ux; c.uz = uz;
    // pitch from the road under the front and rear axles (ramps, crests), looking onto the next edge
    const h = (c.len || 4.5) * 0.32, t2 = this.tmp2;
    let yF, yR;
    if (c.s + h <= e.len) { c.hF = evalEdge(e, de.fwd ? c.s + h : e.len - c.s - h, c.hF | 0, t2); yF = t2.y; }
    else if (c.next && c.next.e.alive && c.next.from === de.to) {
      const ne = c.next.e, s2 = Math.min(ne.len, c.s + h - e.len);
      evalEdge(ne, c.next.fwd ? s2 : ne.len - s2, c.next.fwd ? 0 : ne.n - 2, t2); yF = t2.y;
    } else { evalEdge(e, de.fwd ? e.len : 0, de.fwd ? e.n - 2 : 0, t2); yF = t2.y; }
    const sr = Math.max(0, c.s - h);
    c.hR = evalEdge(e, de.fwd ? sr : e.len - sr, c.hR | 0, t2); yR = t2.y;
    c.slope = (yF - yR) / Math.max(0.5, c.s + h - sr);
  }

  _spawnCar(c, p, initial) {
    for (let tries = 0; tries < 4; tries++) {
      const de = this._pickWeighted(this.carCand, this.carCum);
      if (!de || !de.e.alive) return false;
      const cls = de.e.cls;
      const r = Math.random();
      let type = 0;
      if (cls >= 1 && cls <= 4 && r < 0.05) type = 4;
      else if (r < 0.09) type = 3;
      else if (r < 0.21) type = 1;
      else if (r < 0.30) type = 2;
      else if (r < 0.43) type = 5; // tesla
      else if (r < 0.52) type = 6; // cybertruck
      else if (r < 0.60) type = 7; // ambulance
      else if (r < 0.68) type = 8; // tow_truck
      const spec = CAR_TYPES[type];
      c.len = spec.length; c.wid = spec.width;
      c.de = de;
      c.s = Math.random() * de.e.len;
      // [traffic-fix] never spawn inside a junction box / on its crosswalks (it would hold no reservation)
      if (this._nodeGeo(de.from).jct && c.s < this._exitClear(de.from, de) + c.len * 0.5 + 1) continue;
      if (this._nodeGeo(de.to).jct && c.s > de.e.len - this._stopLine(de.to, de) - c.len * 0.5 - 1) continue;
      c.hint = 0; c.hF = 0; c.hR = 0;
      c.lane = (Math.random() * de.nLanes) | 0;
      if (de.ltWork && de.ltWork.lane === c.lane) c.lane = Math.max(0, c.lane - 1); // [live-traffic] coned-off lane
      c.laneF = c.lane; c.sw = 0; c.swT = 0; c.lcT = 0;
      c.next = this._chooseNext(de);
      if (c.arcIn) c.arcIn.ok = false;
      if (c.arcOut) c.arcOut.ok = false;
      if (c.arcIn2) c.arcIn2.ok = false;
      if (c.ahead) c.ahead.length = 0; c.lookJ = null; c.lookJ2 = null;
      if (c.arcIn3) c.arcIn3.ok = false;
      this._carPose(c);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > CAR_R || d < (initial ? 25 : 60)) continue;
      if (!initial && d < 220 && this._visible(c.x, c.y, c.z)) continue;
      if (this.live.ratio(de) < 0.45 ? this._nearInLane(c) : this._nearObstacle(c.x, c.z, 6 + c.len * 0.5)) continue; // [live-traffic] jams pack tighter
      c.type = type;
      c.drv = (0.85 + Math.random() * 0.3) * (type === 4 ? 0.8 : type === 7 ? 1.15 : type === 5 ? 1.1 : 1);
      c.v = CAR_SPEED[cls] * c.drv * 0.8 * this.live.ratio(de); // [live-traffic]
      c.vCap = c.v * 1.25;
      c.paint = type === 1 ? this.taxiPaint : type === 5 ? pick(TESLA_PAINTS) : type === 8 ? pick(TOW_TRUCK_PAINTS) : type === 0 || type === 2 ? pick(PAINTS) : null;
      c.brake = 0; c.blockedT = 0; c.ignoreT = 0; c.bumpT = 0; c.stuckT = 0;
      c.holdA = null; c.holdB = null; c.holdT = 0; c.holdStall = 0; c.waitT = 0; c.stopN = null; c.toLine = 99; c.sigGo = false;
      c.kWreck = 0; c.kPanic = 0; c.kSw = 0; c.kDrv = 0; // [kaiju]
      if (this.damage) this.damage.onSpawn(c); // [car-explosions]
      c.rx = c.x; c.ry = c.y; c.rz = c.z; c.ryaw = Math.atan2(c.ux, c.uz); c.rpitch = 0; c.rroll = 0;
      c.active = true;
      c.obs = this._addObstacle(c.x, c.z, c.ux, c.uz, c.len * 0.5, c.wid * 0.5, c.v, 0, c); // same-frame spawns see it
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
        for (const k of l) if (Math.abs(o.x[k] - x) < r + o.hl[k] && Math.abs(o.z[k] - z) < r + o.hl[k]) return true;
      }
    }
    return false;
  }

  // [live-traffic] spawn spacing on a jammed road: only the same lane, one car length plus a gap
  _nearInLane(c) {
    const o = this.obs;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = this.cells.get(hashKey(c.x + i * HASH, c.z + j * HASH));
        if (!l) continue;
        for (const k of l) {
          const dx = o.x[k] - c.x, dz = o.z[k] - c.z;
          if (Math.abs(dx * c.ux + dz * c.uz) < c.len * 0.5 + o.hl[k] + 2.5 && Math.abs(dx * c.uz - dz * c.ux) < 1.8 + o.hw[k]) return true; // [traffic-fix] real lengths
        }
      }
    }
    return false;
  }

  _addObstacle(x, z, hx, hz, hl, hw, v, kind, ref) {
    const o = this.obs, k = o.n++;
    o.x[k] = x; o.z[k] = z; o.hx[k] = hx; o.hz[k] = hz; o.hl[k] = hl; o.hw[k] = hw; o.v[k] = v; o.kind[k] = kind; o.ref[k] = ref;
    // [traffic-fix] static: wrecks, burning cars, parked cars (no lane), a stopped player -> go around, never through
    o.st[k] = kind === 1 ? (v < 0.5 ? 1 : 0) : kind === 0 && ref ? (ref.kWreck || ref.dState >= 2 || ref.de === undefined ? 1 : 0) : 0;
    const key = hashKey(x, z);
    const l = this.cells.get(key);
    if (l) l.push(k); else this.cells.set(key, [k]);
    return k;
  }

  _buildObstacles() {
    this.frame++; // [traffic-fix]
    this.obs.n = 0;
    for (const l of this.cells.values()) l.length = 0;
    const app = this.app;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (c.dFly && c.ry > (c.dGround || c.y || 0) + 1.8) continue; // [car-explosions] airborne wreck doesn't block ground
      c.obs = this._addObstacle(c.x, c.z, c.ux, c.uz, c.len * 0.5, c.wid * 0.5, c.v, 0, c);
    }
    for (const p of this.peds) {
      if (p.active && p.state === 'walking' && p.crossState === 2) {
        this._addObstacle(p.x, p.z, p.hx, p.hz, 0.4, 0.4, 0, 2, p);
        const n = p.fwd ? p.e.b : p.e.a; // [traffic-fix] crossing at this junction: turning cars wait for it
        if (n.xpF !== this.frame) { n.xpF = this.frame; n.xp.length = 0; }
        n.xp.push(p);
      }
    }
    if (app.mode === 'drive' || app.mode === 'walk') {
      const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2 };
      const drive = app.mode === 'drive';
      const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
      this.playerObs = this._addObstacle(app.pos.x, app.pos.z, hx, hz, drive ? spec.length * 0.5 : 0.45, drive ? spec.width * 0.5 : 0.45, Math.abs(app.speed || 0), 1, null);
    } else {
      this.playerObs = -1;
    }
    if (app.railTransit) app.railTransit.addTrafficObstacles(this); // [feature/rail-transit] cars brake for trams/trains
    if (app.parkedCars) app.parkedCars.addTrafficObstacles(this); // [parked-cars] the player's parked cars: brake / route around
    if (app.carjack) app.carjack.addTrafficObstacles(this); // [polish] the car being jacked
  }

  // [traffic-fix] Nearest car ahead on the same lane path (this edge, then the exit lane of the next one):
  // exact along-path gap by real lengths, also on curves where the straight-ahead scan misses it.
  _pathLeader(c, out) {
    out.gap = Infinity; out.v = 0;
    const de = c.de, F = this.frame;
    if (de._carsF === F) {
      for (const o of de._cars) {
        if (o === c || o.de !== de || Math.abs(o.laneF - c.laneF) > 0.85) continue;
        const d = o.s - c.s;
        if (d <= 0) continue;
        const g = d - (o.len + c.len) * 0.5;
        if (g < out.gap) { out.gap = g; out.v = o.v; }
      }
    }
    const nx = c.next, rem = de.e.len - c.s;
    if (out.gap === Infinity && nx && nx._carsF === F && rem < 50) {
      const nl = c.arcIn && c.arcIn.ok && c.arcIn.outD === nx ? c.arcIn.nLane : Math.min(c.lane, nx.nLanes - 1);
      for (const o of nx._cars) {
        if (o.de !== nx || Math.abs(o.laneF - nl) > 0.85) continue;
        const g = rem + o.s - (o.len + c.len) * 0.5;
        if (g < out.gap) { out.gap = g; out.v = o.v; }
      }
    }
    return out;
  }

  // Free stretch of lane L around car c (for a lane change).
  _laneClear(c, L) {
    const de = c.de;
    if (de._carsF !== this.frame) return true;
    for (const o of de._cars) {
      if (o === c || o.de !== de || Math.abs(o.laneF - L) > 0.9) continue;
      const d = o.s - c.s;
      if (d > -(c.len + 6 + Math.max(0, o.v - c.v) * 2) && d < c.len + 4) return false;
    }
    return true;
  }

  // No oncoming car on the opposite direction of this edge within `dist` ahead.
  _oncomingClear(c, dist) {
    const e = c.de.e, od = c.de.fwd ? e.dirs[1] : e.dirs[0];
    if (!od || od._carsF !== this.frame) return true;
    for (const o of od._cars) {
      if (o.de !== od) continue;
      const s = e.len - o.s;
      if (s > c.s - c.len - 2 && s < c.s + dist + o.v * 5.5) return false;
    }
    return true;
  }

  // [traffic-fix] Static obstacle k in the lane path (wreck, parked car, stopped player): change to a clear
  // lane, else squeeze past it as far as needed when the oncoming lane is clear, else wait behind it.
  _avoid(c, k, along, dt) {
    if (c.lcT > 0) c.lcT -= dt;
    let want = 0;
    const de = c.de;
    if (k >= 0 && along < 32) {
      const o = this.obs;
      const hdot = o.hx[k] * c.ux + o.hz[k] * c.uz, ah = Math.abs(hdot), sq = Math.sqrt(Math.max(0, 1 - ah * ah));
      const extW = ah * o.hw[k] + sq * o.hl[k];
      const sl = -(o.x[k] - c.lx) * c.uz + (o.z[k] - c.lz) * c.ux; // obstacle offset from my lane centre (sw frame)
      const need = c.wid * 0.5 + extW + 0.45;
      if (de.nLanes > 1 && c.lcT <= 0 && !c.inArc) {
        for (const dl of LANE_STEPS) {
          const L = c.lane + dl;
          if (L < 0 || L >= de.nLanes || (de.ltWork && de.ltWork.lane === L)) continue;
          const shift = this._laneOff(de, L) - this._laneOff(de, c.lane);
          if (Math.abs(sl - shift) < need) continue; // blocks that lane too
          if (!this._laneClear(c, L)) continue;
          c.lane = L; c.lcT = 3; c.swT = 0;
          break;
        }
        if (c.lcT === 3) { c.sw += (0 - c.sw) * Math.min(1, dt * 2); return; }
      }
      if (c.lcT <= 0 || de.nLanes === 1) {
        const base = this._laneOff(de, c.laneF), lim = de.e.width * 0.5 + 0.3;
        let best = Infinity;
        for (const y of [sl + need, sl - need]) {
          const P = base + y;
          if (Math.abs(P) > lim || Math.abs(y) > 4.8) continue;
          if (Math.abs(y) < Math.abs(best)) best = y;
        }
        if (best !== Infinity) {
          const into = !de.e.oneway && (this.lht ? -1 : 1) * (base + best) < 0.6; // over the centre line
          // over the centre line only with the whole pass clear (~5 s at squeeze speed), then committed
          if (!into || Math.abs(c.sw || 0) > 0.5 || this._oncomingClear(c, along + 12)) { want = best; c.swT = 0.8; }
        }
      }
    }
    if (want === 0 && c.swT > 0) { c.swT -= dt; if (c.swT > 0) return; }
    const d = want - (c.sw || 0);
    const step = dt * (0.7 + 0.3 * c.v);
    c.sw = (c.sw || 0) + clamp(d, -step, step);
    if (Math.abs(c.sw) < 0.01) c.sw = 0;
  }

  _dropHolds(c) {
    if (c.holdA) this._release(c, c.holdA);
    if (c.holdB) this._release(c, c.holdB);
  }

  _updateCar(c, dt, now) {
    if (c.kWreck || c.dState >= 2) { c.v = 0; c.brake = c.kWreck ? 0 : 1; this._dropHolds(c); return; } // [car-explosions] wreck / burning: static obstacle
    if (this.kaiju && this.kaiju.car(c, dt)) return; // [kaiju] wreck / panic reverse
    const de = c.de, e = de.e;
    const o = this.obs;
    let gap = Infinity, leadV = 0;
    let stK = -1, stAlong = Infinity;
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
          if (along < -14 || along > 48) continue;
          const kind = o.kind[k], st = o.st[k];
          const hdot = o.hx[k] * c.ux + o.hz[k] * c.uz;
          const ah = Math.abs(hdot), sq = Math.sqrt(Math.max(0, 1 - ah * ah));
          const extW = ah * o.hw[k] + sq * o.hl[k];
          const extL = ah * o.hl[k] + sq * o.hw[k];
          if (st) { // [traffic-fix] in my lane path? (measured from the lane centre, so a swerve keeps holding)
            const lat0 = Math.abs((o.x[k] - c.lx) * c.uz - (o.z[k] - c.lz) * c.ux);
            if (lat0 < c.wid * 0.5 + extW + 0.3 && along > -(c.len * 0.5 + extL + 0.8) && along < stAlong) { stAlong = along; stK = k; }
          }
          if (along <= 0.5) continue;
          const lat = Math.abs(dx * c.uz - dz * c.ux);
          if (lat > c.wid * 0.5 + extW + (kind === 2 ? 1.2 : 0.25)) continue;
          // oncoming traffic: only a car passing an obstacle in MY lane counts, and only while I am not passing
          let back = 0;
          if (!st && kind === 0 && hdot < -0.5) {
            const r = o.ref[k];
            if (Math.abs(c.sw || 0) > 0.5) { if (o.v[k] > 0.5) continue; } // passing: only a stopped car is in the way
            else if (!r || !(Math.abs(r.sw || 0) > 0.5) || along > 40) continue;
            else back = 8; // hold well back so the passer can pull in again
          }
          if (c.ignoreT > 0 && !st && kind === 0 && hdot < 0.6) continue;
          const g = along - c.len * 0.5 - extL - back;
          if (g < gap) { gap = g; leadV = st || hdot < 0 ? 0 : o.v[k] * Math.max(0, hdot); }
        }
      }
    }
    const pl = this._pathLeader(c, this._pl);
    if (pl.gap < gap) { gap = pl.gap; leadV = pl.v; }
    const physGap = gap;
    this._avoid(c, stK, stAlong, dt);
    if (Number.isFinite(c.laneF) && c.laneF !== c.lane) { // eased lane change
      const dl = c.lane - c.laneF, st = dt * 0.55;
      c.laneF = Math.abs(dl) <= st ? c.lane : c.laneF + Math.sign(dl) * st;
    }

    // [traffic-fix] Junction ahead: stop BEHIND the stop bar for red / stop signs / a box it may not enter.
    let atRed = false;
    const rem = e.len - c.s;
    const node = de.to;
    const nx = c.next;
    if (c.holdA || c.holdB) this._updateHolds(c, dt);
    // Upcoming junction: the end of this edge, or of the next one when this edge only ends at a chunk-border /
    // shape node (its stop line can then lie on this edge).
    // [traffic-r2] looks across up to four chunk-border stubs (a chunk corner cuts an approach into two of them)
    let J = null, ap = null, dist = 0, avail = 0, kAp = -1;
    if (nx && nx.e.alive && nx.from === node) {
      ap = de; dist = rem; avail = e.len;
      while (!this._nodeGeo(ap.to).jct) {
        const d = this._chain(c, kAp + 1);
        if (!d || d.from !== ap.to || kAp >= 3 || dist + d.e.len >= 70) { ap = null; break; }
        kAp++; ap = d; dist += d.e.len; avail += d.e.len;
      }
      if (ap && !this._chain(c, kAp + 1)) ap = null;
      if (ap) J = ap.to;
    }
    c.apN = null;
    if (J && dist < 70) {
      const ng = this._nodeGeo(J);
      const toLine = dist - this._stopLine(J, ap, avail) - c.len * 0.5;
      c.toLine = toLine;
      const inner = this._internal(ap); // inside one painted intersection: committed, no second signal
      let ph = 'green';
      if (J.sig && !inner) ph = getSignalPhase(J.sig, now, ap.endAxis);
      if (this._holds(c, J) && J.sig && !inner && ph === 'red' && toLine > 0.3 && c.v * c.v / 12 < toLine + 0.5) this._release(c, J); // caught by red before the line
      if (!this._holds(c, J)) {
        if (toLine < -0.3) { this._grant(c, J); c.lookJ = J; } // already over the line (spawned / forced): commit
        else {
          let stop = false;
          if (J.sig && !inner) {
            c.sigGo = ph === 'green';
            if (ph === 'red') stop = c.v * c.v / 18 < toLine + 1.0;
            else if (ph === 'yellow') stop = c.v * c.v / 8 < toLine;
          } else if (ap.e.cls >= 4 && ap.e.cls <= 6 && ng.minCls < ap.e.cls && c.stopN !== J) { // STOP sign: full stop first
            if (c.v < 0.4 && toLine < 1.5) c.stopN = J; else stop = true;
          }
          let A = null;
          if (toLine < 40) {
            A = this._apArc(c, ap, kAp);
            c.apN = J; c.apArc = A;
            this._apprAdd(J, c);
          }
          if (!stop && toLine < Math.max(3, c.v * c.v / 10 + 2.5)) {
            if (this._enterChain(c, J, A || this._apArc(c, ap, kAp), toLine, now, this._chain(c, kAp + 2), kAp + 1)) { c.waitT = 0; c.lookJ = J; } else stop = true;
          }
          if (stop) {
            if (toLine < gap) { gap = toLine; leadV = 0; atRed = true; }
            if (c.v < 0.5) c.waitT += dt;
          }
        }
      }
    }

    let v0 = CAR_SPEED[e.cls] * c.drv;
    const lt = this.live;
    if (lt.mode !== 'off') { // [live-traffic] congestion: slower target, stop-and-go waves, ease into slow stretches
      const r = lt.ratio(de);
      let cap = v0 * r;
      if (r < 0.4) {
        const w = 0.5 + 0.5 * Math.sin(this._ltT * 0.33 + c.s * 0.05 + (e.minX + e.minZ) * 0.01); // waves run upstream
        cap *= 1 - ((0.4 - r) / 0.4) * 0.85 * (1 - w);
      }
      c.vCap = Number.isFinite(c.vCap) ? c.vCap + (cap - c.vCap) * Math.min(1, dt * 0.6) : cap;
      v0 = c.vCap;
      if (nx && rem < 70) {
        const vn = CAR_SPEED[nx.e.cls] * c.drv * lt.ratio(nx);
        if (vn < v0) v0 = Math.min(v0, vn + rem * 0.22);
      }
    }
    let vT = v0;
    if (gap < Infinity) vT = Math.min(vT, Math.max(0, leadV + (gap - 2.5 - leadV * 1.1) * 0.6));
    if (nx && rem < 30) {
      const dot = de.eHx * nx.sHx + de.eHz * nx.sHz;
      if (dot < 0.85) vT = Math.min(vT, 4.5 + 9 * Math.max(0, dot) + rem * 0.45);
    }
    if (c.inArc && c.inArc.straight < 0.85) vT = Math.min(vT, 4.5 + 9 * Math.max(0, c.inArc.straight));
    if (Math.abs((c.sw || 0)) > 0.3) vT = Math.min(vT, 6); // squeezing past
    if (c.bumpT > 0) { c.bumpT -= dt; vT = 0; }
    const dv = vT - c.v;
    c.v += dv > 0 ? Math.min(dv, 2.6 * dt) : Math.max(dv, -9 * dt);
    if (physGap < 0.3) c.v = Math.min(c.v, 0.5 * Math.max(0, leadV));
    if (c.v < 0) c.v = 0;
    c.acc = dv > 0 ? Math.min(dv / Math.max(dt, 1e-3), 2.6) : Math.max(dv / Math.max(dt, 1e-3), -9);
    c.brake += ((dv < -0.4 || c.v < 0.3 ? 1 : 0) - c.brake) * Math.min(1, dt * 8);

    if (Number.isFinite(c.speed) && c.speed !== c._lastSyncedV) {
      c.v = Math.max(0, c.speed);
    }
    c.speed = c.v;
    c._lastSyncedV = c.v;
    if (c.v < 0.2 && !atRed && c.bumpT <= 0) {
      c.blockedT += dt;
      c.stuckT += dt;
      if (c.blockedT > 14) { c.ignoreT = 2.5; c.blockedT = 0; }
    } else {
      c.blockedT = 0;
      if (c.v > 1) c.stuckT = 0;
    }
    if (c.ignoreT > 0) c.ignoreT -= dt;

    // never advance into the thing in front (a hard guarantee on top of the speed control)
    let ds = c.v * dt * (c.inArc ? c.inArc.k : 1);
    if (physGap < Infinity && ds > physGap - 0.2) { ds = Math.max(0, physGap - 0.2); c.v = Math.min(c.v, ds / Math.max(dt, 1e-3)); }
    c.s += ds;
    let guard = 0;
    while (c.s > c.de.e.len && guard++ < 4) {
      c.s -= c.de.e.len;
      const nx2 = c.next && c.next.e.alive && c.next.from === c.de.to ? c.next : this._chooseNext(c.de);
      if (!nx2) { c.active = false; this._dropHolds(c); return; }
      const A = c.arcIn;
      if (A && A.ok && A.inD === c.de && A.outD === nx2 && A.lane === c.lane) {
        c.arcIn = c.arcOut || this._newArc(); c.arcOut = A; c.arcIn.ok = false; // the turn continues on the exit edge
        c.lane = A.nLane; c.laneF = c.lane;
      } else {
        if (c.arcOut) c.arcOut.ok = false;
        c.lane = Math.min(c.lane, nx2.nLanes - 1);
        if (nx2.ltWork && nx2.ltWork.lane === c.lane) c.lane = Math.max(0, c.lane - 1); // [live-traffic] merge past works
        if (!Number.isFinite(c.laneF)) c.laneF = c.lane;
        c.laneF = Math.min(c.laneF, nx2.nLanes - 1);
      }
      c.de = nx2;
      c.hint = nx2.fwd ? 0 : nx2.e.n - 2; c.hF = c.hint; c.hR = c.hint;
      const ah = c.ahead; // [traffic-r2] drive the planned route
      c.next = ah && ah.length && ah[0].from === nx2.to && ah[0].e.alive ? ah.shift() : (ah && (ah.length = 0), this._chooseNext(nx2));
      for (let t = 0; t < 2; t++) { // a planned turn further on becomes this edge's turn
        const A2 = t ? c.arcIn3 : c.arcIn2;
        if (!(A2 && A2.ok && A2.inD === nx2 && A2.outD === c.next && A2.lane === c.lane)) continue;
        const old = c.arcIn || this._newArc();
        old.ok = false;
        if (t) c.arcIn3 = old; else c.arcIn2 = old;
        c.arcIn = A2;
        break;
      }
    }
    this._carPose(c);
    if (this.damage) this.damage.postPose(c, dt); // [car-explosions]
    if (this.kaiju) this.kaiju.carPost(c, dt); // [kaiju] swerve
  }

  // Release the junctions a car has cleared (rear past the box) or stalled in front of.
  _updateHolds(c, dt) {
    c.holdT += dt;
    for (let i = 0; i < 2; i++) {
      const n = i ? c.holdB : c.holdA;
      if (!n) continue;
      if (c.holdT > 30) { this._release(c, n); continue; }
      if (n === c.de.to) {
        const toLine = c.de.e.len - c.s - this._stopLine(n, c.de) - c.len * 0.5;
        if (c.v < 0.3 && toLine > 0.5) { c.holdStall += dt; if (c.holdStall > 3) this._release(c, n); } else c.holdStall = 0;
      } else if (n === c.de.from) {
        const b = c.arcOut && c.arcOut.ok && c.arcOut.node === n ? c.arcOut.b : this._nodeGeo(n).R + 0.3;
        if (c.s - c.len * 0.5 > b + 0.5) this._release(c, n);
      } else if (n !== c.lookJ && n !== c.lookJ2 && !(c.next && n === c.next.to)) this._release(c, n); // keep a chained / look-ahead hold
    }
  }

  _updateCars(dt, p, now, allowSpawn) {
    // [traffic-fix] per-lane-direction car lists for along-path following / room / lane checks
    const F = this.frame;
    for (const c of this.cars) {
      if (!c.active || c.kWreck || c.dState >= 2 || !c.de) continue;
      const d = c.de;
      if (d._carsF !== F) { d._carsF = F; if (d._cars) d._cars.length = 0; else d._cars = []; }
      d._cars.push(c);
    }
    let active = 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (!c.de.e.alive) { c.active = false; this._dropHolds(c); continue; }
      this._updateCar(c, dt, now);
      if (!c.active) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > CAR_DESPAWN || (c.stuckT > 30 && !this._visible(c.x, c.y, c.z))) { c.active = false; this._dropHolds(c); continue; }
      if (c.dPose) { active++; continue; } // [car-explosions] flight / wreck pose owned by VehicleDamage
      if (c.kvx || c.kvz || c.kyawVel) {
        const drag = Math.exp(-4.2 * dt);
        c.kvx = (c.kvx || 0) * drag;
        c.kvz = (c.kvz || 0) * drag;
        c.kyawVel = (c.kyawVel || 0) * drag;
        c.kxOff = ((c.kxOff || 0) + c.kvx * dt) * Math.exp(-1.8 * dt);
        c.kzOff = ((c.kzOff || 0) + c.kvz * dt) * Math.exp(-1.8 * dt);
        c.ryaw += c.kyawVel * dt;
        if (Math.hypot(c.kvx, c.kvz) < 0.08 && Math.abs(c.kyawVel) < 0.04) {
          c.kvx = 0; c.kvz = 0; c.kyawVel = 0;
        }
      } else if (c.kxOff || c.kzOff) {
        const rec = Math.exp(-2.5 * dt);
        c.kxOff *= rec;
        c.kzOff *= rec;
      }
      if (c.kvy || (c.kyOff && c.kyOff > 0)) {
        c.kyOff = (c.kyOff || 0) + (c.kvy || 0) * dt;
        c.kvy = (c.kvy || 0) - 18.5 * dt;
        if (c.kyOff <= 0) {
          c.kyOff = 0;
          c.kvy = Math.abs(c.kvy) > 2.2 ? -c.kvy * 0.28 : 0;
        }
      }
      // [traffic-fix] the sim pose is continuous now (junction arcs, blended vertices, eased lane changes), so
      // the rendered car sits exactly on it; only a real jump (kaiju shove, edge removal) is smoothed out.
      const tx = c.x + (c.kxOff || 0), ty = c.y + (c.kyOff || 0), tz = c.z + (c.kzOff || 0);
      const jump = Math.abs(tx - c.rx) + Math.abs(tz - c.rz) > c.v * dt * 1.6 + 0.35;
      const k = jump ? 1 - Math.exp(-dt * 12) : 1;
      c.rx += (tx - c.rx) * k;
      c.rz += (tz - c.rz) * k;
      c.ry += (ty - c.ry) * (Math.abs(ty - c.ry) > 0.5 ? 1 - Math.exp(-dt * 12) : 1);
      let dy = Math.atan2(c.ux, c.uz) - c.ryaw;
      dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      const yaw0 = c.ryaw;
      if (!c.kyawVel || Math.abs(c.kyawVel) < 0.3) {
        c.ryaw += dy * Math.min(1, dt * 14);
      }
      // body roll out of the turn and a little dive / squat with braking / throttle
      const yawRate = dt > 1e-4 ? (c.ryaw - yaw0) / dt : 0;
      const kb = 1 - Math.exp(-dt * 6);
      c.rroll = (c.rroll || 0) + (clamp(yawRate * c.v * 0.011, -0.07, 0.07) - (c.rroll || 0)) * kb;
      c.rpitch += (-Math.atan(c.slope) + clamp(-(c.acc || 0) * 0.004, -0.02, 0.035) - c.rpitch) * (1 - Math.exp(-dt * 10));
      active++;
    }
    this._separateWrecks();
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

  // [traffic-fix] A wreck that lands on a car, another wreck or a parked car is pushed off it (wrecks are the
  // light, physics-owned party; live cars stay in their lanes). The player is handled in _collidePlayer.
  _separateWrecks() {
    const ws = this.damage && this.damage.wrecks;
    if (!ws || !ws.length) return;
    const parked = this.app.parkedCars ? this.app.parkedCars.list : EMPTY;
    for (const w of ws) {
      if (!w.active || !w.dPose || w.dFly) continue;
      const hx = Math.sin(w.ryaw), hz = Math.cos(w.ryaw);
      for (const c of this.cars) {
        if (c === w || !c.active || c.dFly) continue;
        const wr = c.dPose;
        const cx = wr ? c.rx : c.x, cz = wr ? c.rz : c.z;
        if (Math.abs(cx - w.rx) > 10 || Math.abs(cz - w.rz) > 10 || Math.abs((wr ? c.ry : c.y) - w.ry) > 2.5) continue;
        const r = obbOverlap(w.rx, w.rz, hx, hz, w.len * 0.5, w.wid * 0.5, cx, cz, wr ? Math.sin(c.ryaw) : c.ux, wr ? Math.cos(c.ryaw) : c.uz, c.len * 0.5, c.wid * 0.5);
        if (!r) continue;
        const m = wr ? 0.5 : 1;
        w.rx += r.nx * (r.depth + 0.02) * m; w.rz += r.nz * (r.depth + 0.02) * m;
        if (wr) { c.rx -= r.nx * (r.depth + 0.02) * 0.5; c.rz -= r.nz * (r.depth + 0.02) * 0.5; c.x = c.rx; c.z = c.rz; }
      }
      for (const e of parked) {
        if (e.lift > 1.8 || Math.abs(e.x - w.rx) > 10 || Math.abs(e.z - w.rz) > 10) continue;
        const r = obbOverlap(w.rx, w.rz, hx, hz, w.len * 0.5, w.wid * 0.5, e.x, e.z, e.hx, e.hz, e.hl, e.hw);
        if (r) { w.rx += r.nx * (r.depth + 0.02); w.rz += r.nz * (r.depth + 0.02); }
      }
      w.x = w.rx; w.z = w.rz;
    }
  }

  // ---------------- pedestrians & ragdoll physics ----------------
  _pedOffset(ped) {
    const e = ped.e;
    return e.cls === 8 ? ped.footOff : e.width * 0.5 + (e.cls === 5 ? 0.55 : 0.78);
  }

  _enterPedEdge(ped, e, fwd, carry) {
    ped.e = e; ped.fwd = fwd; ped.s = carry; ped.hint = fwd ? 0 : e.n - 2;
    const end = fwd ? e.b : e.a;
    const hasIntersection = Boolean(end.sig) || (end.adj && end.adj.length >= 2);
    ped.willCross = hasIntersection && e.cls >= 2 && e.cls <= 5 && Math.random() < (end.sig ? 0.72 : 0.48);
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
    if (ped.crossState === 2) lat = ped.side * off * (1 - 2 * clamp(ped.crossT / (ped.crossDur || 1), 0, 1));
    lat += ped.lat + (ped.latBase || 0); // [people-agents] companions walk abreast
    ped.x = t.x - t.uz * lat;
    ped.z = t.z + t.ux * lat;
    ped.y = t.y + (ped.crossState === 2 || e.cls === 8 ? 0.02 : 0.06);
    if (ped.crossState === 1 || ped.crossState === 2) { ped.hx = t.uz * ped.side; ped.hz = -t.ux * ped.side; }
    else { const sgn = ped.fwd ? 1 : -1; ped.hx = t.ux * sgn; ped.hz = t.uz * sgn; }
    ped.gux = t.ux; ped.guz = t.uz;
  }

  _spawnPed(ped, p, initial) {
    const kj = this._kaijuCreature();
    for (let tries = 0; tries < 6; tries++) {
      const e = this._pickWeighted(this.pedCand, this.pedCum);
      if (!e || !e.alive) return false;
      ped.state = 'walking';
      ped.crossState = 0;
      ped.stateTimer = 0;
      ped.ragdollTimer = 0;
      ped.lieTimer = 0;
      ped.parts = null;
      ped.partsByName = null;
      ped.lat = 0; ped.crossT = 0;
      ped.side = Math.random() < 0.5 ? -1 : 1;
      ped.footOff = 0.2 + Math.random() * 0.6;
      const o = this.app.worldOrigin || {};
      ped.look = randomPersonLook(o.centerLat, o.centerLon);
      ped.v = (1.05 + Math.random() * 0.55) * ped.look.speedMul;
      this._enterPedEdge(ped, e, Math.random() < 0.5, Math.random() * e.len);
      // Spawn ~22% of road pedestrians actively crossing near intersections/crosswalks
      if (e.cls >= 2 && e.cls <= 5 && Math.random() < 0.22) { // [traffic-fix] ...on a crosswalk, with the walk signal
        const end = ped.fwd ? e.b : e.a;
        const off = this._pedOffset(ped);
        ped.crossDur = Math.max(1.5, (2 * off) / ped.v);
        const at = (end.sig || end.adj.length >= 2) && e.len > 12 ? this._crossAt(end, e) : -1;
        if (at > 0) {
          ped.s = e.len - Math.min(e.len * 0.5, at);
          this._pedPose(ped);
          if (this._pedCrossOk(ped, end, e, signalTime())) {
            ped.crossState = 2;
            ped.crossT = Math.random() * ped.crossDur * 0.75;
          }
        }
      }
      this._pedPose(ped);
      const dP = Math.hypot(ped.x - p.x, ped.z - p.z);
      const dK = kj ? Math.hypot(ped.x - kj.position.x, ped.z - kj.position.z) : Infinity;
      const validP = dP <= PED_R && dP >= (initial ? 6 : 16);
      const validK = dK <= 185 && dK >= 4;
      if (!validP && !validK) continue;
      if (!initial && !validK && dP < 70 && this._visible(ped.x, ped.y, ped.z, 1.5)) continue;
      ped.groundY = ped.y;
      ped.phase = Math.random() * 6.28;
      ped.amp = 0.5;
      ped.gph = Math.random() * 6.28; ped.gx = ped.x; ped.gz = ped.z; ped.gspd = ped.v; // [human-motion]
      ped.leader = null; ped.latBase = 0;
      this.agents.onSpawn(ped); // [people-agents]
      ped.ryaw = Math.atan2(ped.hx, ped.hz);
      ped.px = ped.x; ped.pz = ped.z;
      ped.kFlee = 0; ped.kOff = 0; ped.dFlee = 0; // [kaiju] [car-explosions]
      ped.active = true;
      return true;
    }
    return false;
  }

  // Synthesized WebAudio impact thud / crunch (muted by default)
  _playHitSound(x, y, z, forceMul = 1) {
    if (true) return;
    if (this._hitSoundCooldown > 0) return;
    this._hitSoundCooldown = 0.085;
    if (typeof window === 'undefined') return;
    try {
      const cam = this.app && this.app.camera;
      if (cam) {
        const dist = Math.hypot(x - cam.position.x, y - cam.position.y, z - cam.position.z);
        if (dist > 160) return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._audioCtx) this._audioCtx = new AC();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const gainVal = clamp(0.26 * forceMul, 0.12, 0.42);

      // Low body thud
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.15);
      g.gain.setValueAtTime(gainVal, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.165);

      // Short crunch burst
      const len = Math.floor(ctx.sampleRate * 0.075);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(460, now);
      bp.Q.setValueAtTime(1.6, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(gainVal * 0.65, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      src.start(now);
    } catch (_) {
      // Ignore audio errors in headless / restricted environments
    }
  }

  _spawnImpactPuff(x, y, z, svx = 0, svz = 0, forceMul = 1) {
    const K = this.app && this.app.kaiju;
    if (K && K.active && K.fx && K.fx.spawn) {
      this._tmpVecA.set(x, y, z);
      K.fx.spawn('dust', this._tmpVecA, { count: 4, scale: 0.7 });
      K.fx.spawn('debris', this._tmpVecA, { count: 3, scale: 0.5 });
    }
    let spawned = 0;
    for (let i = 0; i < this.puffs.length && spawned < 7; i++) {
      const pf = this.puffs[i];
      if (pf.active) continue;
      const ang = (spawned / 7) * Math.PI * 2 + Math.random() * 0.5;
      const spd = (1.8 + Math.random() * 2.6) * clamp(forceMul, 0.8, 1.6);
      pf.active = true;
      pf.x = x + (Math.random() - 0.5) * 0.35;
      pf.y = y + (Math.random() - 0.5) * 0.35;
      pf.z = z + (Math.random() - 0.5) * 0.35;
      pf.vx = (svx || 0) * 0.25 + Math.cos(ang) * spd;
      pf.vy = 2.2 + Math.random() * 3.2;
      pf.vz = (svz || 0) * 0.25 + Math.sin(ang) * spd;
      pf.age = 0;
      pf.life = 0.45 + Math.random() * 0.25;
      pf.scale = 0.75 + Math.random() * 0.65;
      spawned++;
    }
  }

  _updatePuffs(dt) {
    let n = 0;
    const m4 = this.m4, q = this.q, v3 = this.v3, s3 = this.s3;
    q.identity();
    for (let i = 0; i < this.puffs.length; i++) {
      const pf = this.puffs[i];
      if (!pf.active) continue;
      pf.age += dt;
      if (pf.age >= pf.life) {
        pf.active = false;
        continue;
      }
      pf.x += pf.vx * dt;
      pf.y += pf.vy * dt;
      pf.z += pf.vz * dt;
      pf.vy -= 9.8 * dt;
      const u = pf.age / pf.life;
      const sc = pf.scale * (1 + u * 1.4) * (1 - u * 0.85);
      v3.set(pf.x, pf.y, pf.z);
      s3.set(sc, sc, sc);
      m4.compose(v3, q, s3);
      this.puffMesh.setMatrixAt(n++, m4);
    }
    this.puffMesh.count = n;
    if (n > 0) this.puffMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Transition a walking pedestrian into 'falling_apart' multi-part ragdoll physics.
   */
  hitPedestrian(ped, ix, iy, iz, svx = 0, svy = 0, svz = 0, forceMul = 1) {
    if (!ped || !ped.active || ped.state !== 'walking') return false;
    ped.state = 'falling_apart';
    this.agents.emit('person_hit', ped.x, ped.y, ped.z, { severity: 0.9, actor: this.app.mode === 'drive' ? 'player_vehicle' : undefined }); // [people-agents]
    ped.stateTimer = 0;
    ped.ragdollTimer = 0;
    ped.lieTimer = 0;
    const groundY = Number.isFinite(ped.y) ? ped.y : 0;
    ped.groundY = groundY;

    let dx = ped.x - (Number.isFinite(ix) ? ix : ped.x);
    let dz = ped.z - (Number.isFinite(iz) ? iz : ped.z);
    let dist = Math.hypot(dx, dz);
    const sSpeed = Math.hypot(svx || 0, svz || 0);
    if (dist < 0.05) {
      if (sSpeed > 0.1) {
        dx = svx / sSpeed;
        dz = svz / sSpeed;
      } else {
        dx = Math.sin(ped.ryaw || 0);
        dz = Math.cos(ped.ryaw || 0);
      }
      dist = 1;
    } else {
      dx /= dist;
      dz /= dist;
    }

    const fMul = clamp(Number.isFinite(forceMul) ? forceMul : 1, 0.85, 2.2);
    const launchH = clamp(2.0 + sSpeed * 0.14 + 1.4 * fMul, 2.4, 5.8);
    const baseVx = (svx ? clamp(svx * 0.16, -3.5, 3.5) : 0) + dx * launchH * 0.6;
    const baseVz = (svz ? clamp(svz * 0.16, -3.5, 3.5) : 0) + dz * launchH * 0.6;

    // [drivers] one connected body (ped_ragdoll.js): launched along the hit, feet swept, tumbles as a whole
    const L = ped.look || { wScale: 1, hScale: 1, style: 0 };
    const vyL = clamp(2.2 + launchH * 0.55, 3.0, 6.0);
    const parts = startRagdoll(ped, L, groundY, baseVx * 0.85, vyL, baseVz * 0.85, dx, dz, 3.5 + Math.random() * 3 * fMul);
    const partsByName = {};
    for (const pt of parts) partsByName[pt.name] = pt;
    partsByName.leftArm = partsByName.armL;
    partsByName.rightArm = partsByName.armR;
    partsByName.leftLeg = partsByName.legL;
    partsByName.rightLeg = partsByName.legR;
    ped.parts = parts;
    ped.partsByName = partsByName;
    this.stats.hits = (this.stats.hits || 0) + 1;

    this._playHitSound(ped.x, ped.y, ped.z, fMul);
    this._spawnImpactPuff(ped.x, groundY + 0.9, ped.z, svx, svz, fMul);
    return true;
  }

  /**
   * Queue or immediately apply a spherical impact zone (used by Kaiju stomp, tail whip, breath, missiles, cannon).
   */
  triggerImpactSphere(x, y, z, radius, opts = {}, vzArg = 0, forceArg = 1.3) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(radius > 0)) return 0;
    const isObj = opts !== null && typeof opts === 'object';
    const force = isObj ? (opts.force || 1.3) : (Number.isFinite(forceArg) ? forceArg : 1.3);
    const vx = isObj ? (opts.vx || 0) : (Number.isFinite(opts) ? opts : 0);
    const vy = isObj ? (opts.vy || 0) : 0;
    const vz = isObj ? (opts.vz || 0) : (Number.isFinite(vzArg) ? vzArg : 0);
    const dmg = isObj ? (opts.damage ?? DAMAGE_BY_SOURCE[opts.source] ?? 0) : 0; // [car-explosions]
    const r2 = radius * radius;
    this.agents.onImpact(x, y, z, radius, opts); // [people-agents]
    let count = 0;
    for (const ped of this.peds) {
      if (!ped.active || ped.state !== 'walking') continue;
      const dx = ped.x - x, dz = ped.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) {
        const d = Math.sqrt(d2) || 0.1;
        const outSpd = 8.0 * force * (1 - 0.35 * (d / radius));
        const ivx = vx + (dx / d) * outSpd;
        const ivz = vz + (dz / d) * outSpd;
        if (this.hitPedestrian(ped, x, Number.isFinite(y) ? y : ped.y, z, ivx, vy, ivz, force)) count++;
      }
    }
    const carR = radius * 1.15;
    const carR2 = carR * carR;
    for (const c of this.cars) {
      if (!c.active || c.dPose || (isObj && opts.skip === c)) continue; // [car-explosions] flying / wrecked
      const dx = (c.rx ?? c.x) - x, dz = (c.rz ?? c.z) - z; // [car-explosions] rendered pose (incl. knock offsets)
      const d2 = dx * dx + dz * dz;
      if (d2 <= carR2 && (!Number.isFinite(y) || Math.abs((c.y || 0) - y) <= Math.max(8.5, carR))) {
        const d = Math.sqrt(d2) || 0.2;
        if (dmg > 0 && this.damage) { // [car-explosions] full damage within 3 m, quadratic falloff to the edge
          const f = d <= 3 ? 1 : Math.max(0, 1 - (d - 3) / Math.max(0.1, carR - 3));
          this.damage.hit(c, dmg * f * f, x, y, z, opts.source, opts.depth || 0);
        }
        const falloff = Math.max(0.25, 1 - 0.55 * (d / carR));
        const outSpd = (12.0 + 7.5 * force) * falloff;
        c.kvx = (c.kvx || 0) + (dx / d) * outSpd + vx * 0.35;
        c.kvz = (c.kvz || 0) + (dz / d) * outSpd + vz * 0.35;
        c.kvy = Math.max(c.kvy || 0, (4.2 + 3.8 * force) * falloff);
        c.kyawVel = (c.kyawVel || 0) + ((c.obs & 1) ? 1 : -1) * (4.2 + 3.0 * force) * falloff;
        c.bumpT = Math.max(c.bumpT || 0, 2.8);
        c.v = 0;
        this._spawnImpactPuff(c.x, (c.y || 0) + 0.8, c.z, c.kvx, c.kvz, force);
        count++;
      }
    }
    if (dmg > 0 && this.damage && !opts.noPlayer) this.damage.hitPlayerSphere(x, y, z, carR, dmg); // [car-explosions]
    if (dmg > 0 && this.app.parkedCars) this.app.parkedCars.impactSphere(x, y, z, carR, dmg, opts); // [parked-cars]
    return count;
  }

  /**
   * Check all active impact sources (Player car/vehicle, AI traffic cars, Kaiju monster/weapons, and custom sources).
   */
  checkPedestrianImpacts(impactSources = null) {
    const app = this.app;
    if (!app) return 0;
    let hits = 0;

    // 1. Custom / external impact sources array
    if (Array.isArray(impactSources)) {
      for (const src of impactSources) {
        if (!src) continue;
        hits += this.triggerImpactSphere(
          src.x,
          src.y ?? 0,
          src.z,
          src.radius || 2.4,
          { vx: src.vx || 0, vy: src.vy || 0, vz: src.vz || 0, force: src.force || 1.2 }
        );
      }
    }
    if (this._queuedImpacts.length) {
      for (const src of this._queuedImpacts) {
        hits += this.triggerImpactSphere(src.x, src.y, src.z, src.radius, src);
      }
      this._queuedImpacts.length = 0;
    }

    // 2. Player Car / Vehicle (drive mode, or low-altitude fly mode < 4m AGL)
    const isDrive = app.mode === 'drive';
    const isLowFly = app.mode === 'fly';
    if (isDrive || isLowFly) {
      const px = app.pos.x, py = app.pos.y, pz = app.pos.z;
      const speed = isLowFly
        ? (Math.hypot(app.heli?.vel?.x || 0, app.heli?.vel?.z || 0) || Math.abs(app.speed || 0))
        : (app.speed || 0);
      if (Math.abs(speed) > 2.0) {
        const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2.0 };
        const hx = Math.sin(app.yaw || 0), hz = Math.cos(app.yaw || 0);
        const sgn = speed >= 0 ? 1 : -1;
        const vvx = isLowFly && app.heli?.vel ? app.heli.vel.x : hx * speed;
        const vvz = isLowFly && app.heli?.vel ? app.heli.vel.z : hz * speed;
        const hl = spec.length * 0.5 + 0.55;
        const hw = spec.width * 0.5 + 0.55;
        const forceMul = clamp(Math.abs(speed) / 9.0, 0.95, 1.85);
        for (const ped of this.peds) {
          if (!ped.active || ped.state !== 'walking') continue;
          const agl = Math.abs(py - ped.y);
          if (agl > (isLowFly ? 4.0 : 3.8)) continue;
          const dx = ped.x - px, dz = ped.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 > 36) continue;
          const radialHit = d2 <= 2.4 * 2.4;
          const obbHit = !radialHit && Boolean(obbOverlap(px, pz, hx, hz, hl, hw, ped.x, ped.z, 0, 1, 0.45, 0.45));
          if (radialHit || obbHit) {
            if (this.hitPedestrian(ped, px - hx * sgn * 0.8, py, pz - hz * sgn * 0.8, vvx, 0, vvz, forceMul)) {
              hits++;
            }
          }
        }
      }
    }

    // 3. AI Traffic Cars (< 2.0m or OBB overlap while moving)
    for (const c of this.cars) {
      if (!c.active || c.kWreck || Math.abs(c.v) <= 1.5) continue;
      const cvx = c.ux * c.v, cvz = c.uz * c.v;
      const hl = c.len * 0.5 + 0.35, hw = c.wid * 0.5 + 0.35;
      const forceMul = clamp(Math.abs(c.v) / 9.0, 0.85, 1.55);
      for (const ped of this.peds) {
        if (!ped.active || ped.state !== 'walking') continue;
        const dx = ped.x - c.x, dz = ped.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 25) continue;
        if (Math.abs(ped.y - c.y) > 3.5) continue;
        if (d2 <= 2.0 * 2.0 || obbOverlap(c.x, c.z, c.ux, c.uz, hl, hw, ped.x, ped.z, 0, 1, 0.38, 0.38)) {
          if (this.hitPedestrian(ped, c.x, c.y, c.z, cvx, 0, cvz, forceMul)) {
            hits++;
          }
        }
      }
    }

    // 4. Kaiju Monster (walking feet/body 18m, tail whip 28m, stomp 32m, atomic breath 18m)
    const kj = this._kaijuCreature();
    if (kj) {
      const s = Math.max(1, kj.scale || 1);
      const kvx = Math.sin(kj.yaw || 0) * 11;
      const kvz = Math.cos(kj.yaw || 0) * 11;
      // Body & feet (18m)
      hits += this.triggerImpactSphere(kj.position.x, kj.position.y, kj.position.z, 18 * s, {
        vx: kvx, vz: kvz, force: 1.5, source: 'kaijuBody',
      });
      if (kj.model && kj.model.soles) {
        for (let leg = 0; leg < kj.model.soles.length; leg++) {
          const sole = kj.model.anchorWorld(kj.model.soles[leg], this._tmpVecA);
          if (sole) {
            hits += this.triggerImpactSphere(sole.x, sole.y, sole.z, 18 * s, {
              vx: kvx, vz: kvz, force: 1.55, source: 'kaijuBody',
            });
          }
        }
      }
      // Tail whip (28m)
      if (kj.state === 'tailSwipe' && kj.model) {
        if (kj.model.tailTip) {
          const tip = kj.model.anchorWorld(kj.model.tailTip, this._tmpVecA);
          hits += this.triggerImpactSphere(tip.x, tip.y, tip.z, 28 * s, { force: 1.65, source: 'tail' });
        }
        if (kj.model.tailMid) {
          const mid = kj.model.anchorWorld(kj.model.tailMid, this._tmpVecB);
          hits += this.triggerImpactSphere(mid.x, mid.y, mid.z, 28 * s, { force: 1.6, source: 'tail' });
        }
        hits += this.triggerImpactSphere(kj.position.x, kj.position.y, kj.position.z, 28 * s, { force: 1.55 });
      }
      // Atomic breath / laser impact (18m)
      if (kj.breathActive && kj.breathOrigin && kj.breathDir) {
        const o = kj.breathOrigin, d = kj.breathDir;
        for (let step = 1; step <= 6; step++) {
          const dist = (380 * step) / 6.5;
          const bx = o.x + d.x * dist;
          const by = o.y + d.y * dist;
          const bz = o.z + d.z * dist;
          if (by - kj.position.y < 45) {
            hits += this.triggerImpactSphere(bx, kj.position.y, bz, 18 * s, {
              vx: d.x * 14, vz: d.z * 14, force: 1.65, source: 'breath',
            });
          }
        }
      }
    }

    return hits;
  }

  _updateRagdollPed(ped, dt) {
    ped.stateTimer += dt;
    if (ped.state === 'falling_apart') {
      ped.ragdollTimer = ped.stateTimer;
      if (!ped.parts || !ped.parts.length || !ped.rag) {
        ped.state = 'lying';
        ped.stateTimer = 0;
        return;
      }
      // [drivers] connected ragdoll: the body lies where it came to rest (pose kept while lying)
      const rest = stepRagdoll(ped, dt);
      ragdollCenter(ped, ped);
      if (rest) {
        ped.state = 'lying';
        ped.stateTimer = 0;
        ped.lieTimer = 0;
      }
      return;
    }

    if (ped.state === 'lying') {
      ped.lieTimer = ped.stateTimer;
      if (ped.getUp > 0 && ped.stateTimer >= ped.getUp) { this._actorGetUp(ped); return; } // [polish] carjacked driver
      if (ped.stateTimer >= RAGDOLL_LIE_DURATION) {
        ped.active = false;
        ped.state = 'walking';
        ped.parts = null;
        ped.partsByName = null;
        ped.rag = null;
      }
    }
  }

  // [traffic-fix] May a pedestrian at junction `end` start across arm e? Signalized: this arm's traffic is
  // held at red long enough to finish. Always: no car body on the crosswalk band and none about to reach it.
  _pedCrossOk(ped, end, e, now) {
    if (end.sig) {
      const info = getSignalInfo(end.sig, now, approachAxis(ped.gux, ped.guz));
      if (!(info.phase === 'red' && info.timeLeft > ped.crossDur + 1)) return false;
    }
    const mid = this._crossAt(end, e), cw = CROSSWALK_W[e.cls] || 3;
    if (mid < 0) return false;
    const b0 = mid - cw * 0.5 - 0.6, b1 = mid + cw * 0.5 + 0.6;
    for (const d of e.dirs) {
      if (!d || d._carsF !== this.frame) continue;
      const toward = d.to === end;
      for (const o of d._cars) {
        if (o.de !== d) continue;
        const dist = toward ? e.len - o.s : o.s; // car centre from the node
        if (dist + o.len * 0.5 > b0 && dist - o.len * 0.5 < b1) return false; // on the band
        if (toward && o.v > 1.5 && (dist - o.len * 0.5 - b1) / o.v < 3.5 && !(end.sig && o.toLine > 0.5)) return false;
      }
    }
    for (const h of end.rsv) { // turning in from another arm across this crosswalk
      const B = h.active ? this._arcAt(h, end) : null;
      if (B && (B.inD.e === e || B.outD.e === e)) return false;
    }
    return true;
  }

  _updatePed(ped, dt, now, app) {
    if (ped.state === 'falling_apart' || ped.state === 'lying') {
      this._updateRagdollPed(ped, dt);
      return;
    }
    if (this.kaiju && this.kaiju.ped(ped, dt)) return; // [kaiju] panic flee (off the sidewalk graph)
    if (this.damage && this.damage.ped(ped, dt)) return; // [car-explosions] flee from explosions
    if (this.agents.drive(ped, dt)) return; // [people-agents] brain command / flinch
    const e = ped.e;
    if (!e || !e.alive) { ped.active = false; return; } // [polish] actors are off the graph
    let speed = ped.v;
    if (ped.crossState === 0) {
      const end = ped.fwd ? e.b : e.a;
      if (ped.willCross && (end.sig || (end.adj && end.adj.length >= 2))) {
        const at = this._crossAt(end, e); // [traffic-fix] on the crosswalk (none inside a junction box)
        const crossAt = e.len - Math.min(e.len * 0.5, at);
        if (at > 0 && ped.s >= crossAt) { ped.s = Math.max(ped.s, crossAt); ped.crossState = 1; ped.waitT = 0; }
      }
    }
    if (ped.crossState === 1) {
      speed = 0;
      ped.waitT += dt;
      const end = ped.fwd ? e.b : e.a;
      const off = this._pedOffset(ped);
      ped.crossDur = Math.max(1.5, (2 * off) / ped.v);
      // [traffic-fix] walk signal only (no jaywalking on red), and only once no car is on / about to reach the crosswalk
      if (ped.waitT > 0.6 && this._pedCrossOk(ped, end, e, now)) {
        ped.crossState = 2; ped.crossT = 0;
      } else if (ped.waitT > 45) {
        ped.crossState = 0; ped.willCross = false;
      }
    } else if (ped.crossState === 2) {
      speed = 0;
      ped.crossT += dt;
      if (ped.crossT >= ped.crossDur) { ped.side = -ped.side; ped.crossState = 0; ped.willCross = false; }
    }

    // Step aside politely only when player is walking or stopped; moving cars collide with pedestrians!
    const pdx = ped.x - app.pos.x, pdz = ped.z - app.pos.z;
    const pd = Math.hypot(pdx, pdz);
    const carMoving = app.mode === 'drive' && Math.abs(app.speed || 0) > 2.0;
    if (!carMoving && pd < 1.6 && ped.crossState !== 2) {
      const nx = -ped.guz, nz = ped.gux;
      const sgn = pdx * nx + pdz * nz >= 0 ? 1 : -1;
      ped.lat = clamp(ped.lat + sgn * (1.6 - pd) * 3 * dt, -1.2, 1.2);
      speed *= 0.6;
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
      const ld = ped.leader; // [people-agents] companions take the turn their group leader took here
      if (ld && ld.active && ld.lastNode === node && ld.lastPick && ld.lastPick.e.alive) nx = ld.lastPick;
      else if (cands.length) {
        const foot = cands.filter((a) => a.e.cls === 8); // [terrain-roads] pedestrians prefer footpaths/trails
        nx = foot.length && Math.random() < 0.7 ? pick(foot) : pick(cands);
      } else nx = { e, fwd: !ped.fwd };
      ped.lastNode = node; ped.lastPick = nx;
      // Keep the pedestrian on the same physical side of the street.
      const wx = ped.x - node.x, wz = ped.z - node.z;
      this._enterPedEdge(ped, nx.e, nx.fwd, carry);
      if (ld && ld.active && ld.e === nx.e) ped.willCross = ld.willCross;
      this._pedPose(ped);
      const s2 = wx * -ped.guz + wz * ped.gux;
      ped.side = s2 >= 0 ? 1 : -1;
    }
    this._pedPose(ped);
    ped.groundY = ped.y;
    const moving = speed > 0.05 || ped.crossState === 2;
    const v = ped.crossState === 2 ? ped.v : speed;
    ped.phase += dt * v * 5.0;
    ped.amp += ((moving ? 0.5 : 0) - ped.amp) * Math.min(1, dt * 6);
    const mvx = ped.x - ped.px, mvz = ped.z - ped.pz;
    const md = Math.hypot(mvx, mvz);
    let tyaw = Math.atan2(ped.hx, ped.hz);
    if (md > 0.12 * dt && md < 1.0) tyaw = Math.atan2(mvx, mvz);
    ped.px = ped.x; ped.pz = ped.z;
    let dy = tyaw - ped.ryaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    ped.ryaw += dy * Math.min(1, dt * 8);
  }

  // [human-motion] Gait phase from the distance actually covered (whoever moved the pedestrian: sidewalk
  // graph, kaiju panic or explosion flee), so planted feet do not slide. One cycle = two steps = `stride`
  // metres; stride grows with speed and blends to a run stride when the amplitude says running.
  _pedGait(ped, dt) {
    const L = ped.look;
    const d = Math.hypot(ped.x - ped.gx, ped.z - ped.gz);
    ped.gx = ped.x; ped.gz = ped.z;
    if (d > 3) return; // teleport / respawn
    const spd = dt > 0 ? d / dt : 0;
    ped.gspd += (spd - ped.gspd) * Math.min(1, dt * 4);
    const run = clamp((ped.amp - 0.62) / 0.28, 0, 1);
    const h = L ? L.hScale : 1;
    const walkStride = clamp(0.62 + 0.42 * ped.gspd, 0.85, 1.55) * (L ? L.gaitStride || 1 : 1);
    const runStride = clamp(0.9 + 0.33 * ped.gspd, 1.5, 2.6);
    ped.stride = (walkStride + (runStride - walkStride) * run) * h;
    ped.gph = (ped.gph + (d / ped.stride) * Math.PI * 2) % (Math.PI * 2000);
  }

  _updatePeds(dt, p, now, allowSpawn) {
    let active = 0, walking = 0, ragdolls = 0, lying = 0;
    const app = this.app;
    const kj = this._kaijuCreature();
    const timeFactor = this._pedTimeFactor();
    const baseTarget = Number.isFinite(this.pedBaseTarget) ? this.pedBaseTarget : this.pedTarget;
    this.pedTarget = Math.min(this.pedCap, Math.round(baseTarget * timeFactor));
    if (this._lastPedTarget !== undefined && this.pedTarget > this._lastPedTarget + 6) {
      this.fillBoost = 1;
    }
    this._lastPedTarget = this.pedTarget;

    for (const ped of this.peds) {
      if (!ped.active) continue;
      this._updatePed(ped, dt, now, app);
      if (!ped.active) continue;
      if (ped.state === 'walking') this._pedGait(ped, dt); // [human-motion]
      const dP = Math.hypot(ped.x - p.x, ped.z - p.z);
      const dK = kj ? Math.hypot(ped.x - kj.position.x, ped.z - kj.position.z) : Infinity;
      if (ped.actorT > 0) ped.actorT -= dt; // [polish] carjack actors are not culled by the crowd cap
      if (ped.state === 'walking' && ((dP > PED_DESPAWN && dK > 220) || (!kj && walking >= this.pedTarget && !(ped.actorT > 0)))) {
        ped.active = false;
        continue;
      }
      if (ped.state === 'walking') walking++;
      else if (ped.state === 'falling_apart') ragdolls++;
      else if (ped.state === 'lying') lying++;
      active++;
    }
    this.stats.ragdolls = ragdolls;
    this.stats.lying = lying;
    if (!allowSpawn) return active;
    const initial = this.fillBoost > 0;
    let budget = initial ? 28 : 5;
    for (const ped of this.peds) {
      if (walking >= this.pedTarget || active >= this.pedCap || budget <= 0) break;
      if (ped.active) continue;
      budget--;
      if (this._spawnPed(ped, p, initial)) {
        walking++;
        active++;
        // [people-agents] some people walk in pairs/small groups (shared groupId)
        for (let k = Math.random() < 0.18 ? (Math.random() < 0.3 ? 2 : 1) : 0; k > 0 && walking < this.pedTarget; k--) {
          if (this._spawnCompanion(ped, k)) { walking++; active++; }
        }
      }
    }
    return active;
  }

  // [polish] Temporary pedestrian outside the sidewalk graph (carjack.js: the driver pulled out of the car, the
  // passengers bailing out). look: a person_model look. opts.flee = { x, z }: run away from that point (the
  // explosion-flee of vehicle_damage.ped, which recycles the person once out of sight); opts.rag = { vx, vy,
  // vz, dx, dz, spin }: thrown to the ground as a connected ragdoll instead, getting up after opts.getUp s
  // and then fleeing. Returns the ped or null when the pool is full.
  spawnActor(x, y, z, yaw, look, opts = {}) {
    let ped = null;
    for (const q of this.peds) if (!q.active) { ped = q; break; }
    if (!ped) return null;
    ped.state = 'walking'; ped.crossState = 0; ped.stateTimer = 0; ped.ragdollTimer = 0; ped.lieTimer = 0;
    ped.parts = null; ped.partsByName = null; ped.rag = null;
    ped.e = null; ped.lat = 0; ped.latBase = 0; ped.crossT = 0; ped.side = 1; ped.footOff = 0.5; ped.willCross = false;
    ped.look = look;
    ped.v = 1.3;
    ped.x = x; ped.y = y; ped.z = z; ped.groundY = y;
    ped.ryaw = yaw; ped.hx = Math.sin(yaw); ped.hz = Math.cos(yaw);
    ped.phase = Math.random() * 6.28; ped.amp = 0.5;
    ped.gph = Math.random() * 6.28; ped.gx = x; ped.gz = z; ped.gspd = ped.v;
    ped.px = x; ped.pz = z;
    ped.kFlee = 0; ped.kOff = 0; ped.dFlee = 0;
    ped.leader = null;
    ped.actorT = 12; ped.getUp = 0;
    this.agents.onSpawn(ped);
    ped.active = true;
    ped.fleeFrom = opts.flee || null;
    if (opts.rag) {
      const r = opts.rag;
      ped.amp = 0;
      const parts = startRagdoll(ped, look, y, r.vx, r.vy, r.vz, r.dx, r.dz, r.spin);
      const byName = {};
      for (const pt of parts) byName[pt.name] = pt;
      ped.parts = parts; ped.partsByName = byName;
      ped.state = 'falling_apart';
      ped.getUp = opts.getUp || 0;
      if (!ped.fleeFrom) ped.fleeFrom = { x: x - r.dx, z: z - r.dz };
    } else if (ped.fleeFrom) {
      this._actorFlee(ped);
    }
    return ped;
  }

  _actorFlee(ped) { // [polish] run from ped.fleeFrom (vehicle_damage.ped moves the person)
    const f = ped.fleeFrom;
    let hx = ped.x - f.x, hz = ped.z - f.z;
    const l = Math.hypot(hx, hz) || 1, j = (Math.random() - 0.5) * 0.7, cj = Math.cos(j), sj = Math.sin(j);
    hx /= l; hz /= l;
    ped.dHx = hx * cj - hz * sj; ped.dHz = hx * sj + hz * cj;
    ped.dFlee = 4 + Math.random() * 2; ped.dSpd = 3.8 + Math.random() * 1.2;
    ped.crossState = 0;
  }

  _actorGetUp(ped) { // [polish] back on the feet where the body lies, then run
    ped.state = 'walking'; ped.stateTimer = 0; ped.getUp = 0;
    ped.parts = null; ped.partsByName = null; ped.rag = null;
    ped.y = ped.groundY; ped.amp = 0.3;
    ped.gx = ped.x; ped.gz = ped.z; ped.px = ped.x; ped.pz = ped.z;
    if (ped.fleeFrom) this._actorFlee(ped);
    ped.ryaw = Math.atan2(ped.dHx || 0, ped.dHz || 1);
  }

  // [people-agents] Companion walking abreast of `leader` (same edge, direction, speed and crossing plan).
  _spawnCompanion(leader, k) {
    let ped = null;
    for (const q of this.peds) if (!q.active) { ped = q; break; }
    if (!ped) return false;
    ped.state = 'walking'; ped.stateTimer = 0; ped.ragdollTimer = 0; ped.lieTimer = 0;
    ped.parts = null; ped.partsByName = null;
    ped.lat = 0; ped.latBase = (leader.latBase || 0) + (k === 1 ? 0.62 : -0.62); // leader in the middle of a trio
    const o = this.app.worldOrigin || {};
    ped.look = randomPersonLook(o.centerLat, o.centerLon);
    ped.v = leader.v;
    this._enterPedEdge(ped, leader.e, leader.fwd, Math.max(0, leader.s - 0.1 - Math.random() * 0.3));
    ped.willCross = leader.willCross;
    ped.crossState = leader.crossState; ped.crossT = leader.crossT; ped.crossDur = leader.crossDur;
    ped.side = leader.side; ped.footOff = leader.footOff;
    this._pedPose(ped);
    ped.groundY = ped.y;
    ped.phase = Math.random() * 6.28; ped.amp = leader.amp;
    ped.gph = Math.random() * 6.28; ped.gx = ped.x; ped.gz = ped.z; ped.gspd = ped.v;
    ped.ryaw = leader.ryaw; ped.px = ped.x; ped.pz = ped.z;
    ped.kFlee = 0; ped.kOff = 0; ped.dFlee = 0;
    ped.active = true;
    this.agents.onSpawn(ped, leader);
    ped.leader = leader;
    return true;
  }

  _sliceEdgePolyline(e, s0, s1) {
    if (!e || !e.pts || e.n < 2) return null;
    const a = clamp(Math.min(s0, s1), 0, e.len);
    const b = clamp(Math.max(s0, s1), 0, e.len);
    if (b - a < 2.0) return null;
    const pts = [];
    const tmp = { x: 0, y: 0, z: 0, ux: 0, uz: 1, slope: 0 };
    evalEdge(e, a, 0, tmp);
    pts.push([tmp.x, tmp.z]);
    for (let i = 1; i < e.n - 1; i++) {
      const d = e.cum[i];
      if (d > a + 0.5 && d < b - 0.5) {
        pts.push([e.pts[i * 3], e.pts[i * 3 + 2]]);
      }
    }
    evalEdge(e, b, 0, tmp);
    pts.push([tmp.x, tmp.z]);
    return pts;
  }

  /**
   * Returns live map-app-style traffic congestion polyline segments near (centerX, centerZ):
   * - 'heavy' (#ea4335 red): stopped/crawling traffic (speed < 3.2 m/s), collision/bump, or >= 2 slow cars queued
   * - 'moderate' (#fbbc04 orange): slow-moving traffic (3.2 <= speed < 7.5 m/s)
   */
  getTrafficSegments(centerX = 0, centerZ = 0, radius = 480) {
    const r2 = (radius + 60) * (radius + 60);
    const byEdge = new Map();
    const standalone = [];
    const slowCars = [];

    for (const c of this.cars) {
      if (!c || !c.active) continue;
      const dx = c.x - centerX, dz = c.z - centerZ;
      if (dx * dx + dz * dz > r2) continue;
      const spd = (Number.isFinite(c.speed) && c.speed !== c._lastSyncedV) ? c.speed : (c.v ?? 0);
      const isBumped = (c.bumpT || 0) > 0 || (c.kWreck || 0) > 0 || Math.hypot(c.kvx || 0, c.kvz || 0) > 0.4;
      if (spd >= 7.5 && !isBumped) continue;
      slowCars.push({ c, spd, isBumped });
    }

    for (let i = 0; i < slowCars.length; i++) {
      const item = slowCars[i];
      const { c, spd, isBumped } = item;
      let nearbySlow = 0;
      for (let j = 0; j < slowCars.length; j++) {
        if (i === j) continue;
        const o = slowCars[j].c;
        const d2 = (o.x - c.x) * (o.x - c.x) + (o.z - c.z) * (o.z - c.z);
        if (d2 <= 42 * 42) nearbySlow++;
      }
      const isHeavy = isBumped || spd < 3.2 || (spd < 6.8 && nearbySlow >= 1);
      const level = isHeavy ? 'heavy' : 'moderate';
      const de = c.de;
      const e = de && de.e;
      if (e && e.alive && e.pts && e.len >= 4) {
        const sEdge = de.fwd ? c.s : (e.len - c.s);
        const halfSpan = isHeavy ? 30 : 22;
        const s0 = Math.max(0, sEdge - halfSpan);
        const s1 = Math.min(e.len, sEdge + halfSpan);
        let list = byEdge.get(e);
        if (!list) {
          list = [];
          byEdge.set(e, list);
        }
        list.push({ s0, s1, level, spd });
      } else {
        const ux = c.ux || Math.sin(c.ryaw || 0) || 0;
        const uz = c.uz || Math.cos(c.ryaw || 0) || 1;
        standalone.push({
          level,
          color: level === 'heavy' ? '#ea4335' : '#fbbc04',
          casing: level === 'heavy' ? '#8c1d18' : '#b06000',
          points: [
            [c.x - ux * 22, c.z - uz * 22],
            [c.x + ux * 16, c.z + uz * 16],
          ],
          avgSpeed: spd,
          carCount: 1 + nearbySlow,
        });
      }
    }

    const out = [...standalone];
    for (const [e, intervals] of byEdge.entries()) {
      intervals.sort((a, b) => a.s0 - b.s0);
      let cur = null;
      for (const iv of intervals) {
        if (!cur) {
          cur = { s0: iv.s0, s1: iv.s1, level: iv.level, spdSum: iv.spd, count: 1 };
        } else if (iv.s0 <= cur.s1 + 18) {
          cur.s1 = Math.max(cur.s1, iv.s1);
          cur.count++;
          cur.spdSum += iv.spd;
          if (iv.level === 'heavy' || cur.count >= 2) cur.level = 'heavy';
        } else {
          const pts = this._sliceEdgePolyline(e, cur.s0, cur.s1);
          if (pts && pts.length >= 2) {
            out.push({
              level: cur.level,
              color: cur.level === 'heavy' ? '#ea4335' : '#fbbc04',
              casing: cur.level === 'heavy' ? '#8c1d18' : '#b06000',
              points: pts,
              avgSpeed: cur.spdSum / cur.count,
              carCount: cur.count,
            });
          }
          cur = { s0: iv.s0, s1: iv.s1, level: iv.level, spdSum: iv.spd, count: 1 };
        }
      }
      if (cur) {
        const pts = this._sliceEdgePolyline(e, cur.s0, cur.s1);
        if (pts && pts.length >= 2) {
          out.push({
            level: cur.level,
            color: cur.level === 'heavy' ? '#ea4335' : '#fbbc04',
            casing: cur.level === 'heavy' ? '#8c1d18' : '#b06000',
            points: pts,
            avgSpeed: cur.spdSum / cur.count,
            carCount: cur.count,
          });
        }
      }
    }
    return out;
  }

  // ---------------- player collisions (Newtonian impulse p = m * v) ----------------
  _collidePlayer() {
    const app = this.app;
    if (app.mode !== 'drive' && app.mode !== 'walk') return;
    const drive = app.mode === 'drive';
    const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2, massKg: 1600 };
    const mPlayer = drive ? (spec.massKg || 1600) : 78;
    const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
    const pl = drive ? spec.length * 0.5 : 0.4, pw = drive ? spec.width * 0.5 : 0.4;
    let hit = false;
    for (const c of this.cars) {
      if (!c.active) continue;
      if (c.dPose) { // [traffic-fix] a wreck's pose is the rendered one (rx/ryaw): solid and immovable, it never clips the player
        if (c.dFly) continue;
        if (Math.abs(c.rx - app.pos.x) > 10 || Math.abs(c.rz - app.pos.z) > 10 || Math.abs(c.ry - app.pos.y) > 2.8) continue;
        const r = obbOverlap(app.pos.x, app.pos.z, hx, hz, pl, pw, c.rx, c.rz, Math.sin(c.ryaw), Math.cos(c.ryaw), c.len * 0.5, c.wid * 0.5);
        if (!r) continue;
        const px0 = app.pos.x, pz0 = app.pos.z;
        app.pos.x += r.nx * r.depth; app.pos.z += r.nz * r.depth;
        if (app.collision) {
          const rc = drive
            ? app.collision.resolveCar(app.pos.x, app.pos.y, app.pos.z, app.yaw, spec, px0, pz0)
            : app.collision.resolve(app.pos.x, app.pos.y, app.pos.z, app.yaw, 0.45, [0], null, px0, pz0);
          app.pos.x = rc.x; app.pos.z = rc.z;
        }
        if (drive) {
          const vn = (hx * r.nx + hz * r.nz) * (app.speed || 0);
          if (vn < 0) app.speed = (app.speed || 0) - 1.3 * vn * (hx * r.nx + hz * r.nz);
        }
        hit = true;
        continue;
      }
      const cxEff = c.x + (c.kxOff || 0), czEff = c.z + (c.kzOff || 0);
      if (Math.abs(cxEff - app.pos.x) > 10 || Math.abs(czEff - app.pos.z) > 10) continue;
      if (Math.abs(c.y - app.pos.y) > 2.8) continue;
      const r = obbOverlap(app.pos.x, app.pos.z, hx, hz, pl, pw, cxEff, czEff, c.ux, c.uz, c.len * 0.5, c.wid * 0.5);
      if (!r) continue;
      const isTank = spec && (spec.id === 'tank' || spec.isTank);
      const mAi = CAR_MASS_KG[c.type] || 1500;
      const wPlayer = drive ? (isTank ? 0.0 : mAi / (mPlayer + mAi)) : 1.0;
      const wAi = drive ? (isTank ? 1.0 : mPlayer / (mPlayer + mAi)) : 0.0;
      const px0 = app.pos.x, pz0 = app.pos.z;
      if (!isTank) {
        app.pos.x += r.nx * r.depth * wPlayer;
        app.pos.z += r.nz * r.depth * wPlayer;
      }
      if (wAi > 0) {
        const pushMult = isTank ? 2.5 : 1.0;
        c.kxOff = (c.kxOff || 0) - r.nx * r.depth * wAi * pushMult;
        c.kzOff = (c.kzOff || 0) - r.nz * r.depth * wAi * pushMult;
        if (isTank) {
          c.kvx = (c.kvx || 0) - r.nx * 22.0;
          c.kvz = (c.kvz || 0) - r.nz * 22.0;
          if (this.damage) {
            this.damage.hit(c, 5.0, cxEff, c.y, czEff, 'ram', 0);
          }
        }
      }
      if (app.collision && !isTank) { // fix/water: an AI car must never shove the player into a building
        const rc = drive
          ? app.collision.resolveCar(app.pos.x, app.pos.y, app.pos.z, app.yaw, spec, px0, pz0)
          : app.collision.resolve(app.pos.x, app.pos.y, app.pos.z, app.yaw, 0.45, [0], null, px0, pz0);
        app.pos.x = rc.x;
        app.pos.z = rc.z;
      }
      if (drive && !isTank) {
        const v1x = hx * (app.speed || 0), v1z = hz * (app.speed || 0);
        const v2x = c.ux * (c.v || 0) + (c.kvx || 0), v2z = c.uz * (c.v || 0) + (c.kvz || 0);
        const relVn = (v1x - v2x) * r.nx + (v1z - v2z) * r.nz;
        if (relVn < 0) {
          const restitution = 0.35;
          const jImpulse = -(1 + restitution) * relVn / (1 / mPlayer + 1 / mAi);
          const dvPlayerX = (jImpulse / mPlayer) * r.nx;
          const dvPlayerZ = (jImpulse / mPlayer) * r.nz;
          const newV1x = v1x + dvPlayerX;
          const newV1z = v1z + dvPlayerZ;
          app.speed = newV1x * hx + newV1z * hz;

          const dvAi = jImpulse / mAi;
          c.kvx = (c.kvx || 0) - r.nx * dvAi;
          c.kvz = (c.kvz || 0) - r.nz * dvAi;
          const torqueArm = (cxEff - app.pos.x) * r.nz - (czEff - app.pos.z) * r.nx;
          c.kyawVel = clamp((c.kyawVel || 0) + torqueArm * dvAi * 0.085, -4.8, 4.8);
          if (this.damage) this.damage.ram(c, -relVn, mPlayer, mAi, cxEff, czEff); // [crash-damage] by impact speed
        }
      }
      c.v *= 0.25;
      c.bumpT = Math.max(c.bumpT, 1.6);
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
      eul.set(c.rpitch + (c.xPitch || 0), c.ryaw, (c.xRoll || 0) + (c.dPose ? 0 : c.rroll || 0), 'YXZ'); // [car-explosions] spin [traffic-fix] body roll
      q.setFromEuler(eul);
      v3.set(c.rx, c.ry + 0.02 + (c.xLift || 0), c.rz);
      m4.compose(v3, q, s3);
      cm.mesh.setMatrixAt(i, m4);
      const pa = cm.iPaint.array;
      const paint = c.kWreck ? WRECK_PAINT : c.paint; // [kaiju]
      if (paint) { pa[i * 4] = paint.r; pa[i * 4 + 1] = paint.g; pa[i * 4 + 2] = paint.b; pa[i * 4 + 3] = 1; }
      else pa[i * 4 + 3] = 0;
      const ch = c.kWreck ? 1 : (c.dChar || 0); // [car-explosions] negative iBrake = char amount (dark, lights off)
      cm.iBrake.array[i] = ch > 0 ? -ch : c.brake; // [kaiju]
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

    const P = this.ped, PF = this.pedFar;
    let nWalk = 0, nFar = 0;
    const partCounts = { head: 0, torso: 0, armL: 0, armR: 0, legL: 0, legR: 0, accessory: 0 };

    if (showPeds) {
      const rain = typeof daylight.getWeather === 'function' && daylight.getWeather() === 'rain';
      const cam = this.app.camera;
      const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
      const clock = performance.now() * 0.001;
      for (const ped of this.peds) {
        if (!ped.active) continue;
        const L = ped.look || DEFAULT_LOOK;
        if (ped.state === 'walking') {
          // [human-motion] frustum cull + near/far detail level
          if (!this._visible(ped.x, ped.y, ped.z, 1.6)) continue;
          const dc = (ped.x - cx) * (ped.x - cx) + (ped.y - cy) * (ped.y - cy) + (ped.z - cz) * (ped.z - cz);
          const near = dc < PED_NEAR_D2 && nWalk < PED_NEAR_MAX;
          const T = near ? P : PF;
          const i = near ? nWalk++ : nFar++;
          q.setFromAxisAngle(this._up || (this._up = new THREE.Vector3(0, 1, 0)), ped.ryaw);
          v3.set(ped.x, ped.y, ped.z);
          s3.set(L.wScale, L.hScale, L.wScale);
          m4.compose(v3, q, s3);
          T.mesh.setMatrixAt(i, m4);
          const i3 = i * 3, i4 = i * 4;
          const an = T.iAnim.array, gt = T.iGait.array;
          an[i3] = ped.gph || 0; an[i3 + 1] = ped.amp;
          an[i3 + 2] = L.style | (ped.extraStyle || 0) | (rain && L.umbRoll < 0.65 ? UMBRELLA_BIT : 0);
          gt[i4] = (ped.stride || 1.2) / L.wScale;
          gt[i4 + 1] = L.gaitArm || 1;
          gt[i4 + 2] = (ped.poseMode >= 0 ? ped.poseMode : L.idleMode || 0) + (L.posture || 0) * 0.99; // [people-agents] wave / call
          gt[i4 + 3] = (clock + (L.clock || 0)) % 1000;
          const sh = T.iShirt.array, pa = T.iPants.array, sk = T.iSkin.array, ha = T.iHair.array, ac = T.iAcc.array;
          sh[i3] = L.top.r; sh[i3 + 1] = L.top.g; sh[i3 + 2] = L.top.b;
          pa[i3] = L.pants.r; pa[i3 + 1] = L.pants.g; pa[i3 + 2] = L.pants.b;
          sk[i3] = L.skin.r; sk[i3 + 1] = L.skin.g; sk[i3 + 2] = L.skin.b;
          ha[i3] = L.hair.r; ha[i3 + 1] = L.hair.g; ha[i3 + 2] = L.hair.b;
          ac[i3] = L.acc.r; ac[i3 + 1] = L.acc.g; ac[i3 + 2] = L.acc.b;
        } else if ((ped.state === 'falling_apart' || ped.state === 'lying') && ped.parts) {
          for (let k = 0; k < ped.parts.length; k++) {
            const pt = ped.parts[k];
            if (pt.visible === false) continue;
            const pm = this.partMeshes[pt.name];
            if (!pm) continue;
            const idx = partCounts[pt.name]++;
            pt.instanceIndex = idx;
            if (pt.q) q.copy(pt.q); // [drivers] connected ragdoll
            else { eul.set(pt.rx, pt.ry, pt.rz, 'YXZ'); q.setFromEuler(eul); }
            v3.set(pt.x, pt.y, pt.z);
            const sc = pt.scale || 1.12;
            s3.set(L.wScale * sc, L.hScale * sc, L.wScale * sc);
            m4.compose(v3, q, s3);
            pm.setMatrixAt(idx, m4);

            const cA = pm.iColA.array, cB = pm.iColB.array;
            const j3 = idx * 3;
            let colA = L.top, colB = L.pants;
            if (pt.name === 'head') { colA = L.skin; colB = L.hair; }
            else if (pt.name === 'torso') { colA = L.top; colB = L.pants; }
            else if (pt.name === 'armL' || pt.name === 'armR') { colA = L.top; colB = L.skin; }
            else if (pt.name === 'legL' || pt.name === 'legR') { colA = L.pants; colB = L.pants; }
            else if (pt.name === 'accessory') { colA = L.acc; colB = L.top; }
            cA[j3] = colA.r; cA[j3 + 1] = colA.g; cA[j3 + 2] = colA.b;
            cB[j3] = colB.r; cB[j3 + 1] = colB.g; cB[j3 + 2] = colB.b;
          }
        }
      }
    }

    flushPedMesh(P, nWalk);
    flushPedMesh(PF, nFar);

    for (const name of RAGDOLL_PART_NAMES) {
      const pm = this.partMeshes[name];
      const cnt = partCounts[name] || 0;
      pm.count = cnt;
      if (cnt > 0) {
        pm.instanceMatrix.needsUpdate = true;
        pm.iColA.needsUpdate = true;
        pm.iColB.needsUpdate = true;
      }
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

  update(dt, playerPos, loadedChunks, impactSources = null) {
    this._ltT += dt;
    this.live.update(dt); // [live-traffic]
    if (!this.group.visible) return;
    const app = this.app;
    if (this._hitSoundCooldown > 0) this._hitSoundCooldown = Math.max(0, this._hitSoundCooldown - dt);
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
    const kaijuActive = Boolean(app.kaiju && app.kaiju.active);
    const camHigh = !kaijuActive && cam ? cam.position.y - p.y > 320 : false;
    this.checkPedestrianImpacts(impactSources);
    const peds = camHigh ? this.peds.filter((x) => x.active).length : this._updatePeds(dt, p, now, this.pedCand.length > 0);
    if (!camHigh) this.checkPedestrianImpacts( null);
    this._updatePuffs(dt);
    if (this.fillBoost > 0 && cars >= this.carTarget * 0.9 && peds >= this.pedTarget * 0.9 && this.carTarget > 0) this.fillBoost = 0;
    this._collidePlayer();
    this.damage.update(dt); // [car-explosions]
    this._separateWrecks(); // [traffic-r2] a wreck that landed this frame is pushed off before it is drawn
    this.agents.update(dt); // [people-agents]
    this.uniforms.uLights.value = this._lightsLevel();
    this._writeInstances(!camHigh);
    this.stats.cars = cars;
    this.stats.peds = peds;
  }
}
