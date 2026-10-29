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
import { randomPersonLook, bit, OPT, RAGDOLL_PART_SPECS } from './person_model.js'; // [feature/people]
import { PeopleAgents } from './people_agents.js'; // [people-agents]
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

const RAGDOLL_GRAVITY = 22.0;
const RAGDOLL_SETTLE_TIME = 2.2;
const RAGDOLL_LIE_DURATION = 15.0;
const MAX_PUFFS = 128;

// Indexed by traffic class code (see traffic_graph.js).
const CAR_SPEED = [25, 20, 14, 12.5, 11, 8, 6, 12, 0, 0];
// Physical vehicle mass (kg) by CAR_TYPES index: sedan, taxi, coupe, police, bus, tesla, cybertruck, ambulance, tow_truck
const CAR_MASS_KG = [1500, 1550, 1420, 1850, 11000, 2100, 3100, 4500, 6200];
const CAR_W = [3, 2.6, 2.2, 1.6, 1.1, 0.35, 0, 0.8, 0, 0];
const PED_W = [0, 0, 1.15, 1.0, 0.45, 0.18, 0, 0, 1.0, 0]; // [terrain-roads] footways/trails weigh more

const PAINTS = [
  0xf2f2f0, 0xf2f2f0, 0xe8e8e6, 0x161719, 0x161719, 0x1f2124, 0xa7abb0, 0xa7abb0, 0x6c7177,
  0x41464d, 0x1d3557, 0x2b4c7e, 0x8d1b1b, 0xb3261e, 0xc9b79c, 0x2f4f3a, 0x5b3a29, 0x3a5f8f, 0xd9a62e,
].map((h) => new THREE.Color(h));

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hashKey = (x, z) => (Math.floor(x / HASH) + 2000) * 5000 + (Math.floor(z / HASH) + 2000);
const nodeKey = (qx, qz) => (qx + 50000) * 100000 + (qz + 50000);
const wrapPi = (a) => {
  a -= Math.round(a / (Math.PI * 2)) * (Math.PI * 2);
  return a;
};

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
    this.carTarget = Math.min(CARS_BASE + Math.round(30 * clamp((cwSlow / (cwT || 1)) * 2.5, 0, 1)), Math.round(cwT / 110));
    const basePed = Math.min(this.pedCap, Math.round((pw / 28) * this.pedMult));
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
      if (de.ltWork && de.ltWork.lane === c.lane) c.lane = Math.max(0, c.lane - 1); // [live-traffic] coned-off lane
      this._carPose(c);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > CAR_R || d < (initial ? 25 : 60)) continue;
      if (!initial && d < 220 && this._visible(c.x, c.y, c.z)) continue;
      if (this.live.ratio(de) < 0.45 ? this._nearInLane(c) : this._nearObstacle(c.x, c.z, 11)) continue; // [live-traffic] jams pack tighter
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
      c.type = type;
      const spec = CAR_TYPES[type];
      c.len = spec.length; c.wid = spec.width;
      c.drv = (0.85 + Math.random() * 0.3) * (type === 4 ? 0.8 : type === 7 ? 1.15 : type === 5 ? 1.1 : 1);
      c.v = CAR_SPEED[cls] * c.drv * 0.8 * this.live.ratio(de); // [live-traffic]
      c.vCap = c.v * 1.25;
      c.paint = type === 1 ? this.taxiPaint : type === 5 ? pick(TESLA_PAINTS) : type === 8 ? pick(TOW_TRUCK_PAINTS) : type === 0 || type === 2 ? pick(PAINTS) : null;
      c.next = this._chooseNext(de);
      c.brake = 0; c.blockedT = 0; c.ignoreT = 0; c.bumpT = 0; c.stuckT = 0;
      c.kWreck = 0; c.kPanic = 0; c.kSw = 0; c.kDrv = 0; // [kaiju]
      if (this.damage) this.damage.onSpawn(c); // [car-explosions]
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

  // [live-traffic] spawn spacing on a jammed road: only the same lane, ~one car length plus a gap
  _nearInLane(c) {
    const o = this.obs;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = this.cells.get(hashKey(c.x + i * HASH, c.z + j * HASH));
        if (!l) continue;
        for (const k of l) {
          const dx = o.x[k] - c.x, dz = o.z[k] - c.z;
          if (Math.abs(dx * c.ux + dz * c.uz) < 7.5 && Math.abs(dx * c.uz - dz * c.ux) < 1.8) return true;
        }
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
      if (c.dFly && c.ry > (c.dGround || c.y || 0) + 1.8) continue; // [car-explosions] airborne wreck doesn't block ground
      c.obs = this._addObstacle(c.x, c.z, c.ux, c.uz, c.len * 0.5, c.wid * 0.5, c.v, 0, c);
    }
    for (const p of this.peds) {
      if (p.active && p.state === 'walking' && p.crossState === 2) {
        this._addObstacle(p.x, p.z, p.hx, p.hz, 0.4, 0.4, 0, 2, p);
      }
    }
    if (app.mode === 'drive' || app.mode === 'walk') {
      const spec = VEHICLE_SPECS[app.vehicleIdx] || { length: 4.6, width: 2 };
      const drive = app.mode === 'drive';
      const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
      this.playerObs = this._addObstacle(app.pos.x, app.pos.z, hx, hz, drive ? spec.length * 0.5 : 0.45, drive ? spec.width * 0.5 : 0.45, Math.max(0, app.speed || 0), 1, null);
    } else {
      this.playerObs = -1;
    }
    if (app.railTransit) app.railTransit.addTrafficObstacles(this); // [feature/rail-transit] cars brake for trams/trains
    if (app.parkedCars) app.parkedCars.addTrafficObstacles(this); // [parked-cars] the player's parked cars: brake / route around
  }

  _updateCar(c, dt, now) {
    if (c.kWreck || c.dState >= 2) { c.v = 0; c.brake = c.kWreck ? 0 : 1; return; } // [car-explosions] wreck / burning: static obstacle
    if (this.kaiju && this.kaiju.car(c, dt)) return; // [kaiju] wreck / panic reverse
    const de = c.de, e = de.e;
    const o = this.obs;
    let gap = Infinity, leadV = 0, leadK = -1;
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
          if (c.dPassT > 0 && o.kind[k] === 0 && o.ref[k] && (o.ref[k].kWreck || o.ref[k].dState >= 2)) continue; // [car-explosions] squeezing past
          const ah = Math.abs(hdot);
          const ext = ah * o.hw[k] + Math.sqrt(Math.max(0, 1 - ah * ah)) * o.hl[k];
          const lat = Math.abs(dx * c.uz - dz * c.ux);
          if (lat > c.wid * 0.5 + ext + 0.25) continue;
          const g = along - c.len * 0.5 - (ah * o.hl[k] + Math.sqrt(Math.max(0, 1 - ah * ah)) * o.hw[k]);
          if (g < gap) { gap = g; leadV = o.v[k] * Math.max(0, hdot); leadK = k; }
        }
      }
    }
    if (leadK >= 0 && this.damage && o.kind[leadK] === 0 && gap < 14 && c.v < 2) { // [car-explosions] route around wrecks
      const L = o.ref[leadK];
      if (L && (L.kWreck || L.dState >= 2)) this.damage.avoid(c, dt);
    }

    // Traffic signal at the end of this edge.
    let atRed = false;
    const rem = e.len - c.s;
    const node = de.to;
    if (node.sig && rem < 70) {
      const ph = getSignalPhase(node.sig, now, de.endAxis);
      if (ph !== 'green') {
        const stopDist = rem - this._stopBack(node) - c.len * 0.5 + 2.2;
        const canStop = c.v * c.v / (2 * 7) < stopDist + 0.5;
        if (stopDist > -0.5 && canStop && (ph === 'red' || c.v * c.v / (2 * 4) < stopDist)) {
          if (stopDist < gap) { gap = stopDist; leadV = 0; atRed = true; }
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
      if (c.next && rem < 70) {
        const vn = CAR_SPEED[c.next.e.cls] * c.drv * lt.ratio(c.next);
        if (vn < v0) v0 = Math.min(v0, vn + rem * 0.22);
      }
    }
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

    c.s += c.v * dt;
    let guard = 0;
    while (c.s > c.de.e.len && guard++ < 4) {
      c.s -= c.de.e.len;
      const nx = c.next && c.next.e.alive && c.next.from === c.de.to ? c.next : this._chooseNext(c.de);
      if (!nx) { c.active = false; return; }
      c.de = nx;
      c.hint = nx.fwd ? 0 : nx.e.n - 2;
      c.lane = Math.min(c.lane, nx.nLanes - 1);
      if (nx.ltWork && nx.ltWork.lane === c.lane) c.lane = Math.max(0, c.lane - 1); // [live-traffic] merge past works
      c.next = this._chooseNext(nx);
    }
    this._carPose(c);
    if (this.damage) this.damage.postPose(c, dt); // [car-explosions]
    if (this.kaiju) this.kaiju.carPost(c, dt); // [kaiju] swerve
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
      const k = 1 - Math.exp(-dt * 10);
      c.rx += (c.x + (c.kxOff || 0) - c.rx) * k;
      c.ry += (c.y + (c.kyOff || 0) - c.ry) * k;
      c.rz += (c.z + (c.kzOff || 0) - c.rz) * k;
      let dy = Math.atan2(c.ux, c.uz) - c.ryaw;
      dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      if (!c.kyawVel || Math.abs(c.kyawVel) < 0.3) {
        c.ryaw += dy * Math.min(1, dt * 7);
      }
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
      if (e.cls >= 2 && e.cls <= 5 && Math.random() < 0.22) {
        const off = this._pedOffset(ped);
        ped.crossState = 2;
        ped.crossDur = Math.max(1.5, (2 * off) / ped.v);
        ped.crossT = Math.random() * ped.crossDur * 0.75;
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

    const L = ped.look || { wScale: 1, hScale: 1, style: 0 };
    const cy = Math.cos(ped.ryaw || 0), sy = Math.sin(ped.ryaw || 0);
    const sw = Math.sin(ped.phase || 0) * (ped.amp || 0);
    const parts = [];
    const partsByName = {};

    for (let i = 0; i < RAGDOLL_PART_SPECS.length; i++) {
      const spec = RAGDOLL_PART_SPECS[i];
      const lx = spec.ox * L.wScale;
      const ly = spec.oy * L.hScale;
      const lz = spec.oz * L.wScale;
      const px = ped.x + lx * cy + lz * sy;
      const py = groundY + ly;
      const pz = ped.z - lx * sy + lz * cy;

      let rx = 0;
      if (spec.name === 'legL') rx = sw;
      else if (spec.name === 'legR') rx = -sw;
      else if (spec.name === 'armL') rx = -sw * 0.9;
      else if (spec.name === 'armR') rx = sw * 0.9;

      // Distinct outward scatter per limb/head/torso so all parts separate visibly in mid-air
      const ang = (i / RAGDOLL_PART_SPECS.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const scatterMag = 1.6 + Math.random() * 1.6; // up to 3.2 m/s radial scatter
      const sideBias = spec.ox * 4.2;
      const scVx = Math.cos(ang) * scatterMag + sideBias * cy + (Math.random() - 0.5) * 1.2;
      const scVz = Math.sin(ang) * scatterMag - sideBias * sy + (Math.random() - 0.5) * 1.2;
      const carryMul =
        spec.name === 'torso' ? 0.82 :
        spec.name === 'head' ? 1.16 :
        spec.name === 'accessory' ? 1.28 :
        spec.name.startsWith('arm') ? 1.06 : 0.94;

      const baseVy =
        spec.name === 'head' ? 7.4 :
        spec.name === 'torso' ? 5.2 :
        spec.name === 'accessory' ? 8.2 :
        spec.name.startsWith('arm') ? 6.4 : 4.8;
      const vy = clamp((baseVy + Math.random() * 2.6) * clamp(0.85 + 0.22 * fMul, 0.85, 1.35), 4.0, 11.0);

      const rSign = () => (Math.random() < 0.5 ? -1 : 1);
      const pt = {
        name: spec.name,
        x: px,
        y: py,
        z: pz,
        vx: baseVx * carryMul + scVx,
        vy,
        vz: baseVz * carryMul + scVz,
        rx,
        ry: (ped.ryaw || 0) + (Math.random() - 0.5) * 0.5,
        rz: (Math.random() - 0.5) * 0.4,
        avx: rSign() * (5.2 + Math.random() * 6.8),
        avy: rSign() * (4.0 + Math.random() * 7.5),
        avz: rSign() * (5.0 + Math.random() * 7.0),
        r: spec.r || 0.14,
        scale: 1.0, // [human-motion] parts are life-size now
        visible: true,
        instanceIndex: -1,
      };
      parts.push(pt);
      partsByName[spec.name] = pt;
    }
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
      const groundY = Number.isFinite(ped.groundY) ? ped.groundY : 0;
      const parts = ped.parts;
      if (!parts || !parts.length) {
        ped.state = 'lying';
        ped.stateTimer = 0;
        return;
      }
      let allSettled = ped.stateTimer >= 1.0;
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        const airDrag = Math.exp(-1.15 * dt);
        pt.vx *= airDrag;
        pt.vz *= airDrag;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.vy -= RAGDOLL_GRAVITY * dt;
        pt.rx += pt.avx * dt;
        pt.ry += pt.avy * dt;
        pt.rz += pt.avz * dt;

        const floorY = groundY + (pt.r || 0.14);
        if (pt.y <= floorY) {
          pt.y = floorY;
          if (pt.vy < 0) {
            pt.vy = -pt.vy * 0.32;
            if (Math.abs(pt.vy) < 0.45) pt.vy = 0;
          }
          pt.vx *= 0.65;
          pt.vz *= 0.65;
          pt.avx *= 0.6;
          pt.avy *= 0.65;
          pt.avz *= 0.6;
          pt.rx = wrapPi(pt.rx);
          pt.rz = wrapPi(pt.rz);
          const kSettle = Math.min(1, dt * 11);
          pt.rx += (Math.PI / 2 - pt.rx) * kSettle;
          pt.rz += (0 - pt.rz) * kSettle;
        }

        const spd2 = pt.vx * pt.vx + pt.vy * pt.vy + pt.vz * pt.vz;
        if (pt.y > floorY + 0.04 || spd2 > 0.04) {
          allSettled = false;
        }
      }

      // Gentle horizontal separation when parts touch the ground so limbs/torso/head don't stack
      for (let i = 0; i < parts.length; i++) {
        const a = parts[i];
        if (a.y > groundY + 0.35) continue;
        for (let j = i + 1; j < parts.length; j++) {
          const b = parts[j];
          if (b.y > groundY + 0.35) continue;
          const dx = a.x - b.x, dz = a.z - b.z;
          const d2 = dx * dx + dz * dz;
          const minD = 0.42;
          if (d2 < minD * minD) {
            const d = Math.sqrt(d2) || 0.01;
            const push = (minD - d) * 0.5;
            const nx = dx / d, nz = dz / d;
            a.x += nx * push; a.z += nz * push;
            b.x -= nx * push; b.z -= nz * push;
          }
        }
      }

      const torso = ped.partsByName?.torso || parts[0];
      if (torso) {
        ped.x = torso.x;
        ped.z = torso.z;
      }

      if (ped.stateTimer >= RAGDOLL_SETTLE_TIME || allSettled) {
        ped.state = 'lying';
        ped.stateTimer = 0;
        ped.lieTimer = 0;
        for (let i = 0; i < parts.length; i++) {
          const pt = parts[i];
          pt.y = groundY + 0.135;
          pt.vx = 0; pt.vy = 0; pt.vz = 0;
          pt.avx = 0; pt.avy = 0; pt.avz = 0;
          pt.rx = Math.PI / 2;
          pt.rz = 0;
        }
      }
      return;
    }

    if (ped.state === 'lying') {
      ped.lieTimer = ped.stateTimer;
      const groundY = Number.isFinite(ped.groundY) ? ped.groundY : 0;
      if (ped.parts) {
        for (let i = 0; i < ped.parts.length; i++) {
          const pt = ped.parts[i];
          pt.y = groundY + 0.135;
          pt.rx = Math.PI / 2;
          pt.rz = 0;
        }
      }
      if (ped.stateTimer >= RAGDOLL_LIE_DURATION) {
        ped.active = false;
        ped.state = 'walking';
        ped.parts = null;
        ped.partsByName = null;
      }
    }
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
    if (!e.alive) { ped.active = false; return; }
    let speed = ped.v;
    if (ped.crossState === 0) {
      const end = ped.fwd ? e.b : e.a;
      if (ped.willCross && (end.sig || (end.adj && end.adj.length >= 2))) {
        const crossAt = e.len - Math.max(2, this._stopBack(end) - 2);
        if (ped.s >= crossAt) { ped.s = Math.max(ped.s, crossAt); ped.crossState = 1; ped.waitT = 0; }
      }
    }
    if (ped.crossState === 1) {
      speed = 0;
      ped.waitT += dt;
      const end = ped.fwd ? e.b : e.a;
      const off = this._pedOffset(ped);
      ped.crossDur = Math.max(1.5, (2 * off) / ped.v);
      if (end.sig) {
        const axis = approachAxis(ped.gux, ped.guz);
        const info = getSignalInfo(end.sig, now, axis);
        if ((info.phase === 'red' && info.timeLeft > ped.crossDur + 1) || ped.waitT > 6) {
          ped.crossState = 2; ped.crossT = 0;
        } else if (ped.waitT > 45) {
          ped.crossState = 0; ped.willCross = false;
        }
      } else if (ped.waitT > 0.6) {
        ped.crossState = 2; ped.crossT = 0;
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
      if (ped.state === 'walking' && ((dP > PED_DESPAWN && dK > 220) || (!kj && walking >= this.pedTarget))) {
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
      eul.set(c.rpitch + (c.xPitch || 0), c.ryaw, c.xRoll || 0, 'YXZ'); // [car-explosions] spin
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
            eul.set(pt.rx, pt.ry, pt.rz, 'YXZ');
            q.setFromEuler(eul);
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
    this.agents.update(dt); // [people-agents]
    this.uniforms.uLights.value = this._lightsLevel();
    this._writeInstances(!camHigh);
    this.stats.cars = cars;
    this.stats.peds = peds;
  }
}
