/**
 * [feature/ferries-ships] Piers, ferries and ships.
 *  - Piers: per loaded chunk, from OpenMapTiles `transportation class=pier` (see piers.js).
 *  - Ferries: animated along real `transportation class=ferry` routes, docking at both terminals.
 *  - Ships: live AIS where a keyless CORS feed exists (Digitraffic, Finnish waters), otherwise simulated
 *    container ships / tankers / tugs / sailboats on A* sea lanes over the real water polygons.
 *  - Helicopter weapons can damage and sink vessels (raycast()/impact() hooks).
 */
import * as THREE from '../../../vendor/three.module.js';
import { SeaRegion, SPAN } from './region.js';
import { buildChunkPiers } from './piers.js';
import { VESSEL_TYPES, wakeTexture } from './vessel_models.js';
import { aisCovers, fetchAis } from './ais.js';
import { llToWorld, cumulative, sampleAlong, polylineLength, rng, hashStr } from './geo.js';
import { getBeijingTerrainElevation } from '../../environment.js';

const CAP = 48;               // instances per vessel type
const WAKE_CAP = 160;
const AIS_POLL_S = 30;
const SPEED = { container: 8.5, tanker: 7, tug: 5.5, sailboat: 3.2, ferry: 13, carferry: 8 };
const VIEW = { container: 16000, tanker: 16000, carferry: 9000, ferry: 7000, tug: 6000, sailboat: 3500 };
const DOCK_S = 28;            // ferry terminal dwell
const BERTH_S = 120;          // cargo ship berth dwell
const MAX_FERRIES = 16;

// Port hints for the simulated cargo traffic (snapped onto open water). Elsewhere berths are inferred.
const PORT_HINTS = [
  { lat: 37.8045, lon: -122.3320, name: 'Port of Oakland' },
  { lat: 37.7480, lon: -122.3760, name: 'Pier 80' },
  { lat: 37.9100, lon: -122.3800, name: 'Richmond' },
];
const ANCHOR_HINTS = [{ lat: 37.7300, lon: -122.3500 }, { lat: 37.7650, lon: -122.3550 }];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _smp = { x: 0, z: 0, dx: 0, dz: 1 };

function yawOf(dx, dz) { return Math.atan2(dx, dz); }
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export class Maritime {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'maritime';
    app.scene.add(this.root);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, side: THREE.DoubleSide });
    this.meshes = {};
    for (const [type, spec] of Object.entries(VESSEL_TYPES)) {
      const im = new THREE.InstancedMesh(spec.make(), this.mat, CAP);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = type === 'container' || type === 'tanker' || type === 'carferry' || type === 'ferry';
      im.receiveShadow = true;
      im.name = `vessel-${type}`;
      this.root.add(im);
      this.meshes[type] = im;
    }
    const wg = new THREE.PlaneGeometry(1, 1);
    wg.rotateX(Math.PI / 2);
    wg.translate(0, 0, -0.5);
    this.wakes = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({
      map: wakeTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }), WAKE_CAP);
    this.wakes.count = 0;
    this.wakes.frustumCulled = false;
    this.wakes.renderOrder = 2;
    this.wakes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WAKE_CAP * 3), 3);
    this.root.add(this.wakes);

    this.vessels = [];
    this.region = null;
    this.origin = null;
    this.mode = 'none';          // 'sim' | 'live'
    this.aisStatus = 'off';      // 'off' | 'loading' | 'live' | 'unavailable'
    this._pierDone = new WeakSet();
    this._pierBusy = 0;
    this._pierScanT = 0;
    this._popT = 0;
    this._aisT = 0;
    this._gen = 0;
    this._fxT = 0;
    this.pierStats = { chunks: 0, piers: 0, segs: 0, piles: 0 };
    this.hits = { shots: 0, sunk: 0 };
  }

  // ------------------------------------------------------------------ public
  stats() {
    const by = {};
    for (const v of this.vessels) by[v.type] = (by[v.type] || 0) + 1;
    return {
      mode: this.mode, ais: this.aisStatus, vessels: this.vessels.length, byType: by,
      ferries: this.vessels.filter((v) => v.kind === 'ferry').length,
      ferryRoutes: this.region ? this.region.ferryRoutes.length : 0,
      piers: { ...this.pierStats }, hits: { ...this.hits },
    };
  }

  /** Ferry routes as world polylines (for overlays / tests). */
  getFerryRoutes() {
    return this.region ? this.region.ferryRoutes : [];
  }

  update(dt) {
    const app = this.app;
    if (!app.worldOrigin) return;
    if (app.worldOrigin !== this.origin) this._reset(app.worldOrigin);
    this._pierScanT -= dt;
    if (this._pierScanT <= 0) { this._pierScanT = 0.35; this._scanPiers(); }
    if (!this.region || !this.region.ready) return;
    this._popT -= dt;
    if (this._popT <= 0) { this._popT = 2.0; this._populate(); }
    if (this.mode === 'live') {
      this._aisT -= dt;
      if (this._aisT <= 0) { this._aisT = AIS_POLL_S; this._pollAis(); }
    }
    this._step(dt);
    this._render();
  }

  /** Helicopter hook: nearest vessel hit along a ray (distance or Infinity). */
  raycast(o, d, maxD) {
    let best = maxD, hitV = null;
    for (const v of this.vessels) {
      if (!v.visible || v.state === 'sunk') continue;
      const spec = VESSEL_TYPES[v.type];
      const L = spec.length * v.scale * 0.5, B = spec.beam * v.scale * 0.5, H = spec.height * v.scale;
      const rx = o.x - v.x, ry = o.y - v.y, rz = o.z - v.z;
      const near = Math.hypot(rx, rz) - L - 5;
      if (near > best) continue;
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      // world -> local (local +Z = bow = (sin yaw, cos yaw))
      const lox = rx * c - rz * s, loz = rx * s + rz * c;
      const ldx = d.x * c - d.z * s, ldz = d.x * s + d.z * c;
      const t = slab([lox, ry, loz], [ldx, d.y, ldz], [-B, -2, -L], [B, H, L]);
      if (t >= 0 && t < best) { best = t; hitV = v; }
    }
    this._lastRayHit = hitV;
    return hitV ? best : Infinity;
  }

  /** Helicopter hook: explosion at (x, y, z). Damages vessels inside the blast. Returns hits. */
  impact(x, y, z, isRocket) {
    const R = isRocket ? 14 : 3;
    const dmg = isRocket ? 1 : 0.06;
    let hits = 0;
    for (const v of this.vessels) {
      if (v.state === 'sink' || v.state === 'sunk') continue;
      const spec = VESSEL_TYPES[v.type];
      const L = spec.length * v.scale * 0.5, B = spec.beam * v.scale * 0.5, H = spec.height * v.scale;
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      const rx = x - v.x, rz = z - v.z;
      const lx = rx * c - rz * s, lz = rx * s + rz * c;
      const dx = Math.max(0, Math.abs(lx) - B), dz = Math.max(0, Math.abs(lz) - L);
      const dy = Math.max(0, (y - v.y) - H, -2 - (y - v.y));
      if (dx * dx + dy * dy + dz * dz > R * R) continue;
      hits++;
      v.hp -= dmg;
      v.burn = Math.max(v.burn || 0, isRocket ? 6 : 1.5);
      if (v.hp <= 0) this._sink(v);
    }
    if (hits) this.hits.shots += hits;
    return hits;
  }

  // ------------------------------------------------------------------ region / population
  _reset(origin) {
    this.origin = origin;
    this._gen++;
    this.vessels.length = 0;
    this.region = null;
    this.mode = 'none';
    this.aisStatus = 'off';
    this.pierStats = { chunks: 0, piers: 0, segs: 0, piles: 0 };
    for (const im of Object.values(this.meshes)) im.count = 0;
    this.wakes.count = 0;
    const gen = this._gen;
    const region = new SeaRegion(origin);
    region.load().then(async () => {
      if (gen !== this._gen) return;
      this.region = region;
      this._planLanes();
      if (aisCovers(origin.centerLat, origin.centerLon)) {
        this.aisStatus = 'loading';
        const ok = await this._pollAis();
        if (gen !== this._gen) return;
        if (ok) { this.mode = 'live'; this._aisT = AIS_POLL_S; } else { this.aisStatus = 'unavailable'; this.mode = 'sim'; }
      } else {
        this.mode = 'sim';
      }
      this._popT = 0;
    }).catch(() => {});
  }

  /** Gates (open-sea entries), berths and anchorages for the simulated traffic. */
  _planLanes() {
    const R = this.region, o = this.origin;
    const cid = R.mainComponent();
    this.lanes = { cid, gates: [], berths: [], anchors: [] };
    if (cid < 0 || R.compSize[cid] < 400) return;
    const gates = R.gates(cid, 1);
    this.lanes.gates = gates;
    const far = (p, list, d) => list.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > d);
    for (const h of PORT_HINTS) {
      const [x, z] = llToWorld(o, h.lat, h.lon);
      if (Math.abs(x) > SPAN || Math.abs(z) > SPAN) continue;
      const c = R.snap(x, z, 2, cid, 25);
      if (c >= 0) this.lanes.berths.push(R.cellCenter(c));
    }
    for (const h of ANCHOR_HINTS) {
      const [x, z] = llToWorld(o, h.lat, h.lon);
      if (Math.abs(x) > SPAN || Math.abs(z) > SPAN) continue;
      const c = R.snap(x, z, 4, cid, 15);
      if (c >= 0) this.lanes.anchors.push(R.cellCenter(c));
    }
    // Generic: near-shore berths and open-water anchorages spread over the main water body.
    const r = rng(hashStr(`${o.centerLat.toFixed(3)},${o.centerLon.toFixed(3)}`));
    const n = R.n;
    const hinted = this.lanes.berths.length > 0; // real port hints win over inferred berths
    for (let tries = 0; tries < 6000 && ((!hinted && this.lanes.berths.length < 4) || this.lanes.anchors.length < (hinted ? 2 : 3)); tries++) {
      const i = Math.floor(r() * n * n);
      if (R.comp[i] !== cid) continue;
      const p = R.cellCenter(i);
      if (gates.some((g) => Math.hypot(g[0] - p[0], g[1] - p[1]) < 5000)) continue;
      const d = R.dist[i];
      if (!hinted && d === 2 && this.lanes.berths.length < 4 && far(p, this.lanes.berths, 3000)) this.lanes.berths.push(p);
      else if (d >= 7 && this.lanes.anchors.length < (hinted ? 2 : 3) && far(p, this.lanes.anchors, 2500)) this.lanes.anchors.push(p);
    }
  }

  _populate() {
    const R = this.region;
    if (!R) return;
    const r = Math.random;
    const app = this.app;
    const px = app.pos.x, pz = app.pos.z;
    // Ferries on real routes, nearest routes first.
    const nFerry = this.vessels.filter((v) => v.kind === 'ferry').length;
    if (nFerry === 0 && R.ferryRoutes.length) {
      const routes = R.ferryRoutes.map((pts) => {
        let d = Infinity;
        for (const p of pts) d = Math.min(d, Math.hypot(p[0] - px, p[1] - pz));
        return { pts, d, L: polylineLength(pts) };
      }).sort((a, b) => a.d - b.d);
      let made = 0;
      for (const rt of routes) {
        if (made >= MAX_FERRIES) break;
        const type = rt.L < 1800 ? 'carferry' : 'ferry';
        const count = rt.L > 4000 ? 2 : 1;
        const cum = cumulative(rt.pts);
        for (let k = 0; k < count && made < MAX_FERRIES; k++) {
          const v = this._vessel(type, 'ferry');
          v.path = rt.pts; v.cum = cum;
          v.dir = k === 0 ? 1 : -1;
          v.s = (0.15 + 0.7 * r()) * rt.L;
          v.speed = SPEED[type];
          this._placeOnPath(v, true);
          made++;
        }
      }
    }
    if (this.mode === 'live') return;
    const lanes = this.lanes || { gates: [], berths: [], anchors: [] };
    const count = (kind) => this.vessels.filter((v) => v.kind === kind).length;
    // Big ships: gate <-> berth.
    let budget = 2; // A* calls per population tick
    if (lanes.gates.length && lanes.berths.length) {
      while (count('cargo') < 5 && budget-- > 0) {
        const type = r() < 0.6 ? 'container' : 'tanker';
        const g = lanes.gates[Math.floor(r() * lanes.gates.length)];
        const b = lanes.berths[Math.floor(r() * lanes.berths.length)];
        const path = R.route(g[0], g[1], b[0], b[1], 2);
        if (!path) break;
        const v = this._vessel(type, 'cargo');
        v.path = path; v.cum = cumulative(path);
        v.dir = r() < 0.6 ? 1 : -1;
        v.s = (0.05 + 0.9 * r()) * v.cum[v.cum.length - 1];
        v.speed = SPEED[type];
        this._placeOnPath(v, true);
      }
    }
    // Anchored ships.
    while (count('anchor') < lanes.anchors.length) {
      const a = lanes.anchors[count('anchor')];
      const v = this._vessel(r() < 0.5 ? 'container' : 'tanker', 'anchor');
      v.x = a[0]; v.z = a[1]; v.yaw = r() * Math.PI * 2; v.state = 'anchor';
    }
    // Tugs between berths / near the player.
    while (count('tug') < 4 && budget-- > 0) {
      const v = this._vessel('tug', 'tug');
      if (!this._wanderRoute(v, lanes.berths.length ? lanes.berths[Math.floor(r() * lanes.berths.length)] : [px, pz], 3500, 1)) {
        this.vessels.pop();
        break;
      }
      v.s = r() * v.cum[v.cum.length - 1];
      this._placeOnPath(v, true);
    }
    // Sailboats around the player.
    for (const v of this.vessels) {
      if (v.kind === 'sail' && Math.hypot(v.x - px, v.z - pz) > 9000) v.dead = true;
    }
    this.vessels = this.vessels.filter((v) => !v.dead);
    while (count('sail') < 10 && budget-- > 0) {
      const v = this._vessel('sailboat', 'sail');
      if (!this._wanderRoute(v, [px, pz], 3500, 2)) { this.vessels.pop(); break; }
      v.s = r() * v.cum[v.cum.length - 1];
      this._placeOnPath(v, true);
    }
  }

  _vessel(type, kind) {
    const spec = VESSEL_TYPES[type];
    const v = {
      type, kind, x: 0, z: 0, y: 0, yaw: 0, roll: 0, pitch: 0, phase: Math.random() * 10,
      path: null, cum: null, s: 0, dir: 1, speed: 0, v: 0, state: 'move', timer: 0, scale: 1,
      hp: spec.hp, burn: 0, sinkT: 0, visible: false, dist: 0,
    };
    this.vessels.push(v);
    return v;
  }

  /** Random open-water route from near `c` within `rad` metres, on cells >= minD from shore. */
  _wanderRoute(v, c, rad, minD) {
    const R = this.region;
    const start = v.path ? [v.x, v.z] : null;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = rad * (0.3 + 0.7 * Math.random());
      const tx = c[0] + Math.cos(a) * d, tz = c[1] + Math.sin(a) * d;
      const ti = R.snap(tx, tz, minD + 1, -1, 4);
      if (ti < 0) continue;
      let sx, sz;
      if (start) { [sx, sz] = start; } else {
        const a2 = Math.random() * Math.PI * 2, d2 = rad * Math.random();
        const si = R.snap(c[0] + Math.cos(a2) * d2, c[1] + Math.sin(a2) * d2, minD + 1, -1, 6);
        if (si < 0) continue;
        [sx, sz] = R.cellCenter(si);
      }
      const [ex, ez] = R.cellCenter(ti);
      const path = R.route(sx, sz, ex, ez, minD);
      if (!path || polylineLength(path) < 300) continue;
      v.path = path; v.cum = cumulative(path); v.s = 0; v.dir = 1; v.state = 'move';
      v.speed = SPEED[v.type] * (0.8 + 0.4 * Math.random());
      return true;
    }
    return false;
  }

  _placeOnPath(v, snapYaw) {
    sampleAlong(v.path, v.cum, v.s, _smp);
    v.x = _smp.x; v.z = _smp.z;
    const ty = yawOf(_smp.dx * v.dir, _smp.dz * v.dir);
    if (snapYaw) v.yaw = ty;
    v.v = snapYaw ? v.speed : v.v;
    return ty;
  }

  _sink(v) {
    v.state = 'sink';
    v.sinkT = 0;
    v.hp = 0;
    this.hits.sunk++;
  }

  // ------------------------------------------------------------------ simulation
  _step(dt) {
    const water = this.app.water;
    const fx = this.app.kaiju && this.app.kaiju.fx;
    this._fxT -= dt;
    const doFx = this._fxT <= 0;
    if (doFx) this._fxT = 0.35;
    for (const v of this.vessels) {
      v.phase += dt;
      if (v.state === 'sink') {
        v.sinkT += dt;
        const H = VESSEL_TYPES[v.type].height * v.scale;
        v.roll = Math.min(0.5, v.sinkT * 0.05);
        v.pitch = Math.min(0.18, v.sinkT * 0.02);
        v.sinkDepth = Math.min(H + 12, v.sinkT * v.sinkT * 0.08 * (1 + H / 20));
        if (v.sinkT > 22) { v.state = 'sunk'; v.dead = true; }
      } else if (v.state === 'anchor') {
        v.yaw += Math.sin(v.phase * 0.02) * dt * 0.004;
      } else if (v.kind === 'ais') {
        this._stepAis(v, dt);
      } else if (v.state === 'dock') {
        v.timer -= dt;
        v.v = 0;
        if (v.kind === 'ferry') {
          // Turn around in the slip during the dwell.
          const target = this._placeYawTarget(v, -v.dir);
          v.yaw += wrapPi(target - v.yaw) * Math.min(1, dt * 0.25);
        }
        if (v.timer <= 0) {
          v.dir = -v.dir;
          v.state = 'move';
          if (v.kind === 'tug' || v.kind === 'sail') {
            if (!this._wanderRoute(v, [v.x, v.z], v.kind === 'sail' ? 2500 : 3000, v.kind === 'sail' ? 2 : 1)) v.dead = true;
          } else if (v.kind === 'cargo' && v.dir === 1 && v.s <= 1) {
            v.dead = true; // left the region through the gate; a fresh ship is spawned
          }
        }
      } else if (v.path) {
        const L = v.cum[v.cum.length - 1];
        const remain = v.dir > 0 ? L - v.s : v.s;
        const brake = v.kind === 'sail' ? v.speed : Math.sqrt(2 * 0.35 * Math.max(0, remain - 15)) + 0.6;
        const target = Math.min(v.speed, brake);
        v.v += Math.max(-0.6 * dt, Math.min(0.35 * dt, target - v.v));
        v.s += v.dir * v.v * dt;
        if (v.s <= 0 || v.s >= L) {
          v.s = Math.max(0, Math.min(L, v.s));
          v.state = 'dock';
          v.timer = v.kind === 'ferry' ? DOCK_S : v.kind === 'cargo' ? (v.dir > 0 ? BERTH_S : 0) : 6;
          if (v.kind === 'cargo' && v.dir < 0) v.dead = true; // reached the gate outbound
        }
        const ty = this._placeOnPath(v, false);
        const turn = v.type === 'container' || v.type === 'tanker' ? 0.6 : 1.6;
        v.yaw += wrapPi(ty - v.yaw) * Math.min(1, dt * turn);
      }
      // Water surface + gentle motion.
      const wy = water ? water.getWaterSurfaceY(v.x, v.z) : getBeijingTerrainElevation(v.x, v.z) + 0.28;
      const small = v.type === 'sailboat' || v.type === 'tug' || v.type === 'ferry';
      const amp = small ? 1 : 0.15;
      v.y = wy + Math.sin(v.phase * 1.3) * 0.08 * amp - (v.sinkDepth || 0);
      if (v.state !== 'sink') {
        v.roll = Math.sin(v.phase * 0.9) * 0.025 * amp + (v.type === 'sailboat' ? 0.16 : 0);
        v.pitch = Math.sin(v.phase * 0.7 + 1) * 0.012 * amp;
      }
      // Fire / smoke on damaged vessels.
      if (v.burn > 0) {
        v.burn -= dt;
        if (doFx && fx && fx.spawn && v.visible) {
          _p.set(v.x, v.y + VESSEL_TYPES[v.type].height * v.scale * 0.5, v.z);
          fx.spawn('smoke', _p, { count: 1, scale: Math.max(0.5, v.scale * VESSEL_TYPES[v.type].length / 60), light: false, life: 3, speed: 1 });
        }
      }
      if (v.state === 'sink' && doFx && fx && fx.spawn && v.visible && v.sinkT < 14) {
        _p.set(v.x, v.y + 2, v.z);
        fx.spawn('smoke', _p, { count: 1, scale: Math.max(0.6, v.scale * VESSEL_TYPES[v.type].length / 50), light: false, life: 4, speed: 1 });
      }
    }
    if (this.vessels.some((v) => v.dead)) {
      for (const v of this.vessels) if (v.dead && v.kind === 'ferry' && v.state === 'sunk') this._ferryRespawn(v);
      this.vessels = this.vessels.filter((v) => !v.dead);
    }
  }

  _placeYawTarget(v, dir) {
    sampleAlong(v.path, v.cum, v.s, _smp);
    return yawOf(_smp.dx * dir, _smp.dz * dir);
  }

  _ferryRespawn(v) {
    // A sunk ferry is replaced at its route's far terminal after the population tick.
    const nv = this._vessel(v.type, 'ferry');
    nv.path = v.path; nv.cum = v.cum; nv.dir = v.dir > 0 ? -1 : 1;
    nv.s = nv.dir > 0 ? 0 : v.cum[v.cum.length - 1];
    nv.state = 'dock'; nv.timer = 45; nv.speed = SPEED[v.type];
    this._placeOnPath(nv, true);
  }

  // ------------------------------------------------------------------ live AIS
  async _pollAis() {
    const o = this.origin, gen = this._gen;
    const data = await fetchAis(o.centerLat, o.centerLon, 22);
    if (gen !== this._gen) return false;
    if (!data) { if (this.mode === 'live') this.aisStatus = 'stale'; return false; }
    this.aisStatus = 'live';
    const byId = new Map();
    for (const v of this.vessels) if (v.kind === 'ais') byId.set(v.mmsi, v);
    const seen = new Set();
    for (const a of data) {
      let [x, z] = llToWorld(o, a.lat, a.lon);
      // Moored ships report positions on the quay polygon; nudge them onto the adjacent water.
      const wpt = this.region && this.region.nearestWater(x, z, 100);
      if (wpt) [x, z] = wpt;
      if (Math.abs(x) > 19500 || Math.abs(z) > 19500) continue;
      seen.add(a.mmsi);
      let v = byId.get(a.mmsi);
      if (!v) {
        v = this._vessel(a.model, 'ais');
        v.mmsi = a.mmsi;
        v.x = x; v.z = z; v.yaw = Math.PI - a.heading;
        const spec = VESSEL_TYPES[a.model];
        v.scale = a.length > 0 ? Math.max(0.35, Math.min(1.6, a.length / spec.length)) : 1;
      }
      v.name = a.name;
      v.fixX = x; v.fixZ = z; v.fixT = a.t;
      v.sog = a.sog; v.cog = a.cog; v.hdg = a.heading;
    }
    for (const v of this.vessels) if (v.kind === 'ais' && !seen.has(v.mmsi) && v.state !== 'sink') v.dead = true;
    this.vessels = this.vessels.filter((v) => !v.dead);
    return true;
  }

  _stepAis(v, dt) {
    // Dead reckoning from the last fix (capped), eased so corrections never jump.
    const age = Math.min(180, Math.max(0, (Date.now() - v.fixT) / 1000));
    let tx = v.fixX, tz = v.fixZ;
    if (v.sog > 0.3) {
      tx += Math.sin(v.cog) * v.sog * age;
      tz += -Math.cos(v.cog) * v.sog * age;
      if (this.region && !this.region.isWater(tx, tz) && this.region.isWater(v.fixX, v.fixZ)) { tx = v.x; tz = v.z; }
    }
    const k = Math.min(1, dt * 0.8);
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;
    v.v = v.sog;
    const ty = Math.PI - v.hdg;
    v.yaw += wrapPi(ty - v.yaw) * Math.min(1, dt * 0.5);
  }

  // ------------------------------------------------------------------ rendering
  _render() {
    const cam = this.app.camera;
    const cx = cam.position.x, cz = cam.position.z;
    const counts = {};
    for (const t in this.meshes) counts[t] = 0;
    let nw = 0;
    const wc = this.wakes.instanceColor.array;
    for (const v of this.vessels) {
      const spec = VESSEL_TYPES[v.type];
      const d = Math.hypot(v.x - cx, v.z - cz);
      v.dist = d;
      v.visible = d < VIEW[v.type] * Math.max(1, v.scale) && counts[v.type] < CAP;
      if (!v.visible) continue;
      _e.set(v.pitch, v.yaw, v.roll, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(v.x, v.y, v.z);
      _s.setScalar(v.scale);
      _m.compose(_p, _q, _s);
      const im = this.meshes[v.type];
      im.setMatrixAt(counts[v.type]++, _m);
      // Wake
      const sp = v.state === 'move' || v.kind === 'ais' ? v.v : 0;
      if (sp > 0.4 && nw < WAKE_CAP && v.state !== 'sink' && d < 9000) {
        const L = spec.length * v.scale, B = spec.beam * v.scale;
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        _e.set(0, v.yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(v.x + fx * L * 0.48, v.y - (v.sinkDepth || 0) + 0.12, v.z + fz * L * 0.48);
        _s.set(B * (2.2 + sp * 0.12), 1, L * 1.6 + sp * 14);
        _m.compose(_p, _q, _s);
        this.wakes.setMatrixAt(nw, _m);
        const k = Math.min(1, sp / SPEED[v.type]) * 0.6;
        wc[nw * 3] = wc[nw * 3 + 1] = wc[nw * 3 + 2] = k;
        nw++;
      }
    }
    for (const t in this.meshes) {
      const im = this.meshes[t];
      im.count = counts[t];
      if (counts[t]) im.instanceMatrix.needsUpdate = true;
    }
    this.wakes.count = nw;
    if (nw) { this.wakes.instanceMatrix.needsUpdate = true; this.wakes.instanceColor.needsUpdate = true; }
  }

  // ------------------------------------------------------------------ piers
  _scanPiers() {
    const app = this.app;
    if (this._pierBusy >= 2 || !app.loadedChunks) return;
    // Nearest unprocessed chunk first.
    let best = null, bd = Infinity;
    for (const g of app.loadedChunks.values()) {
      if (this._pierDone.has(g) || !g.userData) continue;
      const d = Math.hypot(g.userData.ox - app.pos.x, g.userData.oz - app.pos.z);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return;
    this._pierDone.add(best);
    this._pierBusy++;
    buildChunkPiers(app, best).then((st) => {
      if (st && best.userData.maritimePiers) {
        this.pierStats.chunks++;
        this.pierStats.piers += st.piers; this.pierStats.segs += st.segs; this.pierStats.piles += st.piles;
      }
    }).catch(() => {}).finally(() => { this._pierBusy--; });
  }
}

/** Ray / AABB slab test in local space; returns entry distance or -1. */
function slab(o, d, mn, mx) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}
