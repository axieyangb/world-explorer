/**
 * [feature/ferries-ships] Piers, ferries and ships.
 *  - Piers: per loaded chunk, from OpenMapTiles `transportation class=pier` (see piers.js).
 *  - Ferries: animated along real `transportation class=ferry` routes, docking at both terminals.
 *  - Ships: [live-ships] real vessels where a live source covers the area (ais.js: Digitraffic AIS in
 *    Finland, Entur ferries in Norway, Washington State Ferries, plus the optional server.py relay for
 *    aisstream.io / GTFS-realtime ferries), dead-reckoned from speed and course between polls, with the
 *    model picked from the AIS ship type and scaled to the reported length and beam. Simulated container
 *    ships / tankers / bulk carriers / tugs / fishing boats / yachts on A* sea lanes over the real water
 *    polygons fill in where there is no full AIS, and simulated ferries skip routes a live ferry is on.
 *  - Rendering: detailed near models and cheap far models (vessel_models.js), one InstancedMesh per
 *    (type, lod), per-instance paint, lit windows and navigation lights at night, name labels on live ships.
 *  - Weapons can damage and sink vessels (raycast() / impact() for the helicopter, applyWeaponImpact() for
 *    weapons on foot); damage chars the paint.
 */
import * as THREE from '../../../vendor/three.module.js';
import { SeaRegion, SPAN } from './region.js';
import { buildChunkPiers } from './piers.js';
import { VESSEL_TYPES, wakeTexture, createVesselMaterial, vesselInstanceGeometry } from './vessel_models.js';
import { providerFor, detectShipRelay, fetchRelay } from './ais.js';
import * as daylight from '../daylight.js';
import { llToWorld, cumulative, sampleAlong, polylineLength, rng, hashStr } from './geo.js';
import { getBeijingTerrainElevation } from '../../environment.js';

const CAP = 96;               // far instances per vessel type
const NEAR_CAP = 12;          // detailed instances per vessel type
const WAKE_CAP = 200;
const RELAY_POLL_S = 20;
const SPEED = { container: 8.5, tanker: 7, cargo: 7, tug: 5.5, fishing: 4.5, sailboat: 3.2, speedboat: 12, patrol: 9, ferry: 13, carferry: 8 };
const VIEW = { container: 16000, tanker: 16000, cargo: 14000, carferry: 10000, ferry: 7000, tug: 6000, fishing: 5000, patrol: 6000, sailboat: 3500, speedboat: 3000 };
// Detailed model inside this distance (scaled by the vessel's length scale).
const NEAR = { container: 1000, tanker: 950, cargo: 850, carferry: 900, ferry: 480, tug: 420, fishing: 380, patrol: 440, sailboat: 320, speedboat: 240 };
const LABEL_MAX = 6;
const LABEL_M = 1600;
const SUNK_HOLD_MS = 10 * 60 * 1000;   // a sunk live ship stays gone for a while
// Paint per type: hull colours and accent (funnel band / stripe / livery) colours.
const PAINT = {
  container: [[0x1f3550, 0x2a2f33, 0x7a2a22, 0x2d4a3a, 0x6f767c, 0x1b4f8a, 0x8a5a2a], [0xb5371f, 0x1f5fa8, 0xd9a21b, 0x2f7d3c, 0xffffff]],
  tanker: [[0x7a2a22, 0x2a2f33, 0x1f3550, 0x2d4a3a, 0x3a3f45, 0x5a2a3a], [0x1f5fa8, 0xb5371f, 0xd9a21b, 0x2f7d3c]],
  cargo: [[0x2d4a3a, 0x1f3550, 0x7a2a22, 0x2a2f33, 0x5a3a2a, 0x2a5a6a], [0x7a2f26, 0x2f6a3a, 0x6f767c, 0x1f5fa8]],
  carferry: [[0xf2f2f0], [0x1d6fb8, 0xc8261e, 0x1f8a4c, 0x1b2f63, 0xe0a020, 0x0a8fa8]],
  ferry: [[0xf2f2f0, 0xf2f2f0, 0xe8e4da], [0x1d6fb8, 0xc8261e, 0x1f8a4c, 0xe0a020, 0x0a8fa8]],
  tug: [[0x8e2a22, 0x1f2a36, 0x1f4f7a, 0xd9a21b, 0x2a5a3a, 0x30343a], [0xffffff, 0xd9a21b]],
  fishing: [[0x1f4f7a, 0x8e2a22, 0x2a5a3a, 0xe8e8e8, 0x3a3a3a, 0x2a6a8a], [0xd9a21b, 0xe8661c, 0x1f5fa8]],
  sailboat: [[0xffffff, 0xffffff, 0xf4f1e8, 0x1b2f4f, 0x7a1f1f], [0x1d3f6e, 0xc8261e, 0x2a2f33]],
  speedboat: [[0xffffff, 0xffffff, 0x1b2f4f, 0x8a1f1f, 0x2a2f33], [0x1d3f6e, 0xc8261e, 0xd9a21b]],
  patrol: [[0x8e959b, 0xf0f0ee, 0x1b2f4f], [0xd23a2a, 0x1d6fb8]],
};
const LIVERY = {
  navy: [0x7f878e, 0x7f878e], police: [0xf0f0ee, 0x1d4fb8], sar: [0xf0f0ee, 0xe8601c], pilot: [0x1b2f4f, 0xd23a2a],
};
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
const _c = new THREE.Color();
const _sph = new THREE.Sphere();
const _frus = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _smp = { x: 0, z: 0, dx: 0, dz: 1 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function yawOf(dx, dz) { return Math.atan2(dx, dz); }
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export class Maritime {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'maritime';
    app.scene.add(this.root);
    this.uniforms = { uLights: { value: 0 } };
    this.mat = createVesselMaterial(this.uniforms);
    this.meshes = {};   // `${type}:${lod}` -> InstancedMesh, built on first use
    this._order = [];
    this._counts = {};
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
    this.aisStatus = 'off';      // 'off' | 'loading' | 'live' | 'stale' | 'unavailable'
    this.source = null;          // { name, full, poll } of the live source in use
    this.liveFull = false;       // live source reports every vessel (AIS), so no simulated traffic
    this.lastFix = 0;            // ms of the last successful live poll
    this._sunk = new Map();      // live id -> time sunk
    this._routeLive = [];        // ferry route index -> a live ferry is on it
    // ?ships=sim ignores live sources, ?ships=off shows no vessels (piers stay).
    let opt = '';
    try { opt = (new URLSearchParams(location.search).get('ships') || '').toLowerCase(); } catch { opt = ''; }
    this.liveAllowed = opt !== 'sim' && opt !== 'off';
    this.shipsOff = opt === 'off';
    this._relay = null;
    if (this.liveAllowed) detectShipRelay().then((ok) => { this._relay = ok; });
    this.labels = [];
    this.labelTex = new Map();
    for (let i = 0; i < LABEL_MAX; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      sp.visible = false;
      sp.renderOrder = 11;
      sp.userData.key = '';
      this.root.add(sp);
      this.labels.push(sp);
    }
    this._pierDone = new WeakSet();
    this._pierBusy = 0;
    this._pierScanT = 0;
    this._popT = 0;
    this._aisT = 0;
    this._gen = 0;
    this._fxT = 0;
    this.pierStats = { chunks: 0, piers: 0, segs: 0, piles: 0 };
    this.hits = { shots: 0, sunk: 0 };
    this.activeBoat = null;
    this.boatSpeed = 0;
    this._initBoatPrompt();
  }

  _initBoatPrompt() {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('boat-board-prompt');
    if (!el) {
      el = document.createElement('button');
      el.id = 'boat-board-prompt';
      el.type = 'button';
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:158px',
        'transform:translateX(-50%)',
        'z-index:34',
        'display:none',
        'align-items:center',
        'gap:10px',
        'padding:9px 16px',
        'border-radius:999px',
        'border:1px solid rgba(56,189,248,0.55)',
        'background:rgba(10,18,32,0.88)',
        'backdrop-filter:blur(10px)',
        'color:#f8fafc',
        'font:600 13px/1.2 system-ui, -apple-system, sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
        'cursor:pointer'
      ].join(';');
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const px = this.app.pos.x, py = this.app.pos.y, pz = this.app.pos.z;
        this.tryBoardNearest(px, py, pz, 30);
      });
      document.body.appendChild(el);
    }
    this.promptEl = el;
  }

  // ------------------------------------------------------------------ public
  stats() {
    const by = {};
    for (const v of this.vessels) by[v.type] = (by[v.type] || 0) + 1;
    let near = 0, far = 0;
    for (const k in this.meshes) { if (k.endsWith(':0')) near += this.meshes[k].count; else far += this.meshes[k].count; }
    return {
      mode: this.mode, ais: this.aisStatus, source: this.source ? this.source.name : null, full: this.liveFull,
      vessels: this.vessels.length, live: this.vessels.filter((v) => v.kind === 'ais').length, byType: by, near, far,
      ferries: this.vessels.filter((v) => v.kind === 'ferry').length,
      ferryRoutes: this.region ? this.region.ferryRoutes.length : 0,
      piers: { ...this.pierStats }, hits: { ...this.hits },
    };
  }

  /** Credit line for the map attribution, e.g. "Live ships · Fintraffic Digitraffic · 2 min ago". */
  creditText() {
    if (this.mode !== 'live' || !this.source || !this.vessels.some((v) => v.kind === 'ais')) return '';
    const min = Math.max(0, Math.round((Date.now() - this.lastFix) / 60000));
    return `Live ships · ${this.source.name} · ${min < 1 ? 'just now' : `${min} min ago`}`;
  }

  /** Live vessels (for tests / overlays). */
  liveList() {
    return this.vessels.filter((v) => v.kind === 'ais').map((v) => ({ id: v.mmsi, name: v.name, type: v.type, x: v.x, z: v.z, sog: v.sog, len: VESSEL_TYPES[v.type].length * v.sz, dist: v.dist, near: v.lod === 0 }));
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
    if (!this.region || !this.region.ready || this.shipsOff) return;
    this._popT -= dt;
    if (this._popT <= 0) { this._popT = 2.0; this._populate(); }
    if (this.mode === 'live') {
      this._aisT -= dt;
      if (this._aisT <= 0) { this._aisT = this.source.poll; this._pollAis(); }
    } else if (this.mode === 'sim' && this._relay && !this._relayTried) {
      this._relayTried = true; // the relay probe resolved after the region loaded
      this._startLive(this._gen);
    }
    this.uniforms.uLights.value = lightsLevel();
    this._step(dt);
    this._render();
    this._updateBoatPrompt();
  }

  _updateBoatPrompt() {
    if (!this.promptEl) return;
    if (this.app.mode !== 'walk') {
      this.promptEl.style.display = 'none';
      return;
    }
    const cand = this.findNearestBoardable(this.app.pos.x, this.app.pos.z, 26);
    if (!cand) {
      this.promptEl.style.display = 'none';
      return;
    }
    const labelMap = {
      speedboat: 'Speedboat',
      sailboat: 'Sailboat Yacht',
      tug: 'Harbor Tugboat',
      fishing: 'Fishing Trawler',
      patrol: 'Coast Guard Patrol Boat',
      ferry: 'Passenger Ferry',
      carferry: 'Car Ferry',
      cargo: 'Cargo Ship',
      container: 'Container Ship',
      tanker: 'Tanker Ship'
    };
    const bName = cand.v.name || labelMap[cand.v.type] || 'Vessel';
    this.promptEl.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:6px;background:#38bdf8;color:#020617;font-weight:800">F / E</span><span>Board ${bName} (${Math.round(cand.dist)} m)</span>`;
    this.promptEl.style.display = 'inline-flex';
  }

  /** Find nearest non-destroyed vessel within maxDist meters of (px, pz). */
  findNearestBoardable(px, pz, maxDist = 26) {
    let best = null;
    let bestD = maxDist;
    for (const v of this.vessels) {
      if (!v || v.dead || v.wrecked || v.state === 'sink' || v.state === 'sunk') continue;
      const spec = VESSEL_TYPES[v.type] || { length: 14, beam: 4 };
      const halfL = spec.length * (v.sz || 1) * 0.42;
      const centerDist = Math.hypot(v.x - px, v.z - pz);
      const hullDist = Math.max(0, centerDist - halfL);
      if (hullDist < bestD) {
        bestD = hullDist;
        best = { v, dist: hullDist, centerDist };
      }
    }
    return best;
  }

  /** Board and pilot the nearest docked or water boat within maxDist meters. */
  tryBoardNearest(px, py, pz, maxDist = 26) {
    const cand = this.findNearestBoardable(px, pz, maxDist);
    if (!cand) return false;
    const v = cand.v;
    this.activeBoat = v;
    v.state = 'player';
    v.path = null;
    this.boatSpeed = 0;
    v.v = 0;
    this.app.pos.set(v.x, v.y + 1.8, v.z);
    this.app.yaw = v.yaw;
    this.app.camYaw = v.yaw;
    this.app._enteringBoatDirectly = true;
    this.app.setMode('boat');
    this.app._enteringBoatDirectly = false;
    const bName = v.name || (v.type.charAt(0).toUpperCase() + v.type.slice(1));
    this.app._showToast?.(`Boarded ${bName} — W/S Throttle & Reverse • A/D Steer • F/E Disembark`, 3000);
    return true;
  }

  /** Per-frame boat driving physics when app.mode === 'boat'. */
  updatePlayerBoat(dt) {
    const v = this.activeBoat;
    if (!v || v.dead || v.wrecked || v.state === 'sink' || v.state === 'sunk') {
      this.exitToWalk();
      return;
    }
    const k = this.app.keys;
    const fwd = k.has('KeyW') || k.has('ArrowUp');
    const rev = k.has('KeyS') || k.has('ArrowDown');
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const boost = k.has('ShiftLeft') || k.has('ShiftRight');

    const baseMax = v.type === 'speedboat' ? 24 : v.type === 'patrol' ? 20 : (v.type === 'ferry' || v.type === 'carferry') ? 15 : 13;
    const maxSpd = baseMax * (boost ? 1.35 : 1.0);
    const accel = v.type === 'speedboat' ? 14 : 8.5;

    if (fwd) {
      this.boatSpeed = Math.min(maxSpd, this.boatSpeed + accel * dt);
    } else if (rev) {
      if (this.boatSpeed > 1.0) this.boatSpeed = Math.max(0, this.boatSpeed - 16 * dt);
      else this.boatSpeed = Math.max(-7.5, this.boatSpeed - 6.0 * dt);
    } else {
      // Water hydrodynamic drag
      const drag = Math.min(1, dt * 1.8);
      this.boatSpeed *= (1 - drag);
      if (Math.abs(this.boatSpeed) < 0.08) this.boatSpeed = 0;
    }

    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const turnAuth = v.type === 'speedboat' || v.type === 'sailboat' || v.type === 'patrol' ? 1.35 : 0.75;
    const speedFactor = Math.min(1, Math.abs(this.boatSpeed) / 2.2 + 0.25);
    const dirSign = this.boatSpeed >= -0.1 ? 1 : -1;
    v.yaw += steer * turnAuth * speedFactor * dirSign * dt;

    // Advance along bow (+sin(yaw), +cos(yaw))
    const nx = v.x + Math.sin(v.yaw) * this.boatSpeed * dt;
    const nz = v.z + Math.cos(v.yaw) * this.boatSpeed * dt;
    const inWater = (this.region && typeof this.region.isWater === 'function')
      ? this.region.isWater(nx, nz)
      : (getBeijingTerrainElevation(nx, nz) <= 0.65);
    if (inWater || getBeijingTerrainElevation(nx, nz) <= 0.55) {
      v.x = nx;
      v.z = nz;
    } else {
      this.boatSpeed *= -0.25;
    }

    v.v = Math.abs(this.boatSpeed);
    v.roll = -steer * Math.min(0.22, Math.abs(this.boatSpeed) * 0.012);
    v.pitch = -Math.min(0.10, Math.max(-0.04, this.boatSpeed * 0.004));

    const water = this.app.water;
    const wy = water ? water.getWaterSurfaceY(v.x, v.z) : getBeijingTerrainElevation(v.x, v.z) + 0.28;
    v.y = wy;

    const spec = VESSEL_TYPES[v.type] || { height: 4 };
    this.app.pos.set(v.x, v.y + Math.min(4.5, spec.height * 0.55 + 1.2), v.z);
    this.app.speed = this.boatSpeed;
    this.app.heading = v.yaw + Math.PI;
  }

  /** Disembark from the active boat back onto the nearest pier or shoreline. */
  exitToWalk() {
    const v = this.activeBoat;
    this.activeBoat = null;
    this.boatSpeed = 0;
    let ex = this.app.pos.x, ez = this.app.pos.z, ey = this.app.pos.y;
    if (v) {
      if (v.state === 'player') {
        v.state = 'moored';
        v.v = 0;
      }
      // Check loaded chunks for the nearest pier deck segment or dry land within 32 m
      let bestPier = null, bestD = 34;
      if (this.app.loadedChunks) {
        for (const g of this.app.loadedChunks.values()) {
          const segs = (g.userData && g.userData.deckSegments) || [];
          for (const s of segs) {
            const mx = (s.x1 + s.x2) * 0.5, mz = (s.z1 + s.z2) * 0.5;
            const d = Math.hypot(mx - v.x, mz - v.z);
            if (d < bestD) {
              bestD = d;
              bestPier = { x: mx, y: Math.max(s.y1 || 1.6, s.y2 || 1.6), z: mz };
            }
          }
        }
      }
      if (bestPier) {
        ex = bestPier.x; ey = bestPier.y; ez = bestPier.z;
      } else {
        const spec = VESSEL_TYPES[v.type] || { beam: 4 };
        ex = v.x + Math.cos(v.yaw) * (spec.beam * 0.6 + 3.0);
        ez = v.z - Math.sin(v.yaw) * (spec.beam * 0.6 + 3.0);
        ey = Math.max(1.2, this.app.world.getHeightAt(ex, ez));
      }
    }
    this.app.pos.set(ex, ey, ez);
    this.app.walkVelY = 0;
    this.app.setMode('walk');
  }

  /** Helicopter hook: nearest vessel hit along a ray (distance or Infinity). */
  raycast(o, d, maxD) {
    let best = maxD, hitV = null;
    for (const v of this.vessels) {
      if (!v.visible || v.state === 'sunk') continue;
      const spec = VESSEL_TYPES[v.type];
      const L = spec.length * v.sz * 0.5, B = spec.beam * v.sx * 0.5, H = spec.height * v.sy;
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
    return this._damage(x, y, z, isRocket ? 14 : 3, isRocket ? 1 : 0.06, isRocket);
  }

  /** On-foot weapons hook (walker_weapons._applyImpact): power = rocket-equivalent damage units x 100. */
  applyWeaponImpact(p, power) {
    const u = Math.max(0.22, (power || 0) / 100);
    if (!p || u <= 0) return 0;
    return this._damage(p.x, p.y, p.z, u >= 0.5 ? 12 + u * 2 : 5, u, u >= 0.5);
  }

  /** Universal weapon/explosion radius damage hook for all docked & moving boats. */
  damageVesselsInRadius(wx, wz, radius = 6, damage = 45, wy = undefined) {
    if (!Number.isFinite(wx) || !Number.isFinite(wz) || !(damage > 0)) return 0;
    const u = damage > 5 ? damage / 75 : damage;
    const y = Number.isFinite(wy) ? wy : 1.5;
    return this._damage(wx, y, wz, Math.max(5.5, radius + 3.5), u, u >= 0.6);
  }

  _damage(x, y, z, R, dmg, big) {
    let hits = 0;
    const fx = (this.app.kaiju && this.app.kaiju.fx) || (this.app.vehicleDamage && this.app.vehicleDamage._fx && this.app.vehicleDamage._fx());
    for (const v of this.vessels) {
      if (v.state === 'sink' || v.state === 'sunk') continue;
      const spec = VESSEL_TYPES[v.type];
      const L = spec.length * v.sz * 0.5, B = spec.beam * v.sx * 0.5, H = spec.height * v.sy;
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      const rx = x - v.x, rz = z - v.z;
      const lx = rx * c - rz * s, lz = rx * s + rz * c;
      const dx = Math.max(0, Math.abs(lx) - B), dz = Math.max(0, Math.abs(lz) - L);
      const dy = Number.isFinite(y) ? Math.max(0, (y - v.y) - H - 4, -4 - (y - v.y)) : 0;
      if (dx * dx + dy * dy + dz * dz > R * R) continue;
      hits++;
      v.hp -= dmg;
      v.burn = Math.max(v.burn || 0, v.hp < v.hp0 * 0.5 ? 18 : (big ? 8 : 3.5));
      if (fx && fx.spawn) {
        fx.spawn('spark', _p.set(v.x, v.y + 1.5, v.z), { count: 8, scale: 0.9 });
        if (v.hp < v.hp0 * 0.5) fx.spawn('fire', _p.set(v.x, v.y + 1.4, v.z), { scale: 0.7 });
      }
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
    this.source = null;
    this.liveFull = false;
    this._routeLive = [];
    this._relayTried = false;
    this.pierStats = { chunks: 0, piers: 0, segs: 0, piles: 0 };
    for (const im of Object.values(this.meshes)) im.count = 0;
    this.wakes.count = 0;
    for (const sp of this.labels) sp.visible = false;
    const gen = this._gen;
    const region = new SeaRegion(origin);
    region.load().then(async () => {
      if (gen !== this._gen) return;
      this.region = region;
      this._planLanes();
      this.mode = 'sim';
      this._relayTried = this._relay !== null;
      await this._startLive(gen);
      this._popT = 0;
    }).catch(() => {});
  }

  /** Picks the live source for this origin (browser provider, else the server relay) and does a first poll. */
  async _startLive(gen) {
    if (!this.liveAllowed) return;
    const o = this.origin;
    const p = providerFor(o.centerLat, o.centerLon);
    let src = null;
    if (p) src = { name: p.name, full: p.full, poll: p.poll, fetch: () => p.fetch(o.centerLat, o.centerLon) };
    else if (this._relay) src = { name: 'relay', full: false, poll: RELAY_POLL_S, relay: true, fetch: () => fetchRelay(o.centerLat, o.centerLon) };
    if (!src) return;
    this.aisStatus = 'loading';
    this.source = src;
    const ok = await this._pollAis();
    if (gen !== this._gen) return;
    if (ok) {
      this.mode = 'live';
      this._aisT = src.poll;
      if (this.liveFull) for (const v of this.vessels) if (v.kind !== 'ais' && v.kind !== 'ferry' && v.state !== 'sink') v.dead = true;
    } else {
      this.aisStatus = 'unavailable';
      this.source = null;
    }
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
        rt.idx = R.ferryRoutes.indexOf(rt.pts);
        if (this._routeLive[rt.idx]) continue; // a real ferry runs this route
        const type = rt.L < 1800 ? 'carferry' : 'ferry';
        const count = rt.L > 4000 ? 2 : 1;
        const cum = cumulative(rt.pts);
        for (let k = 0; k < count && made < MAX_FERRIES; k++) {
          const v = this._vessel(type, 'ferry');
          v.route = rt.idx;
          if (type === 'carferry') this._fitSize(v, 85 + r() * 50, 0); // local car ferries, not cruise ferries
          v.path = rt.pts; v.cum = cum;
          v.dir = k === 0 ? 1 : -1;
          v.s = (0.15 + 0.7 * r()) * rt.L;
          v.speed = SPEED[type];
          this._placeOnPath(v, true);
          made++;
        }
      }
    }
    if (this.mode === 'live' && this.liveFull) return;
    const lanes = this.lanes || { gates: [], berths: [], anchors: [] };
    const count = (kind) => this.vessels.filter((v) => v.kind === kind).length;
    // Big ships: gate <-> berth.
    let budget = 2; // A* calls per population tick
    if (lanes.gates.length && lanes.berths.length) {
      while (count('cargo') < 5 && budget-- > 0) {
        const k = r();
        const type = k < 0.45 ? 'container' : k < 0.75 ? 'tanker' : 'cargo';
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
      const k = r();
      const v = this._vessel(k < 0.4 ? 'container' : k < 0.7 ? 'tanker' : 'cargo', 'anchor');
      v.x = a[0]; v.z = a[1]; v.yaw = r() * Math.PI * 2; v.state = 'anchor';
    }
    // Tugs between berths / near the player.
    while (count('tug') < 5 && budget-- > 0) {
      const v = this._vessel(r() < 0.65 ? 'tug' : 'fishing', 'tug');
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
      const k = r();
      const v = this._vessel(k < 0.6 ? 'sailboat' : k < 0.92 ? 'speedboat' : 'patrol', 'sail');
      if (!this._wanderRoute(v, [px, pz], 3500, 2)) { this.vessels.pop(); break; }
      v.s = r() * v.cum[v.cum.length - 1];
      this._placeOnPath(v, true);
    }
  }

  _vessel(type, kind, livery = null, seedKey = null) {
    const spec = VESSEL_TYPES[type];
    const seed = seedKey != null ? hashStr(String(seedKey)) : (Math.random() * 1e9) >>> 0;
    const v = {
      type, kind, x: 0, z: 0, y: 0, yaw: 0, roll: 0, pitch: 0, phase: (seed % 1000) / 100,
      path: null, cum: null, s: 0, dir: 1, speed: 0, v: 0, state: 'move', timer: 0, sx: 1, sy: 1, sz: 1,
      hp: spec.hp, hp0: spec.hp, burn: 0, sinkT: 0, visible: false, dist: 0, lod: 1, seed: (seed % 997) / 97,
      paint: new THREE.Color(), accent: new THREE.Color(),
    };
    const pal = PAINT[type];
    const lv = livery && LIVERY[livery];
    v.paint.set(lv ? lv[0] : pal[0][seed % pal[0].length]);
    v.accent.set(lv ? lv[1] : pal[1][(seed >>> 8) % pal[1].length]);
    this.vessels.push(v);
    return v;
  }

  /** Non-uniform scale from reported length / beam (AIS dimensions). */
  _fitSize(v, length, beam) {
    const spec = VESSEL_TYPES[v.type];
    const sz = length > 0 ? clamp(length / spec.length, 0.3, 3.5) : 1;
    const sx = beam > 0 ? clamp(beam / spec.beam, sz * 0.6, sz * 1.5) : sz;
    v.sz = sz; v.sx = sx; v.sy = clamp((sx + sz) / 2, 0.3, 2.4);
    v.hp = v.hp0 = spec.hp * clamp(sz, 0.5, 2);
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
    v.wrecked = true;
    v.sinkT = 0;
    v.hp = 0;
    v.v = 0;
    v.paint.setHex(0x1e1e22);
    v.accent.setHex(0x141418);
    this.hits.sunk++;
    const fx = (this.app.kaiju && this.app.kaiju.fx) || (this.app.vehicleDamage && this.app.vehicleDamage._fx && this.app.vehicleDamage._fx());
    if (fx && fx.spawn) {
      fx.spawn('explosion', _p.set(v.x, v.y + 1.8, v.z), { scale: 1.35 });
      fx.spawn('fire', _p.set(v.x, v.y + 1.5, v.z), { scale: 1.1 });
      fx.spawn('smoke', _p.set(v.x, v.y + 2.5, v.z), { count: 4, scale: 1.1, life: 5, speed: 3 });
    }
    try { this.app.audio?.playExplosion?.(1.1); } catch (_) {}
    if (this.activeBoat === v && this.app.mode === 'boat') {
      this.exitToWalk();
    }
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
        const H = VESSEL_TYPES[v.type].height * v.sy;
        v.roll = Math.min(0.61, v.sinkT * 0.085);
        v.pitch = Math.min(0.18, v.sinkT * 0.02);
        v.sinkDepth = Math.min(H + 12, v.sinkT * v.sinkT * 0.08 * (1 + H / 20));
        if (v.sinkT > 22) { v.state = 'sunk'; v.dead = true; }
      } else if (v.state === 'player') {
        // Controlled by updatePlayerBoat(dt)
      } else if (v.state === 'moored') {
        v.v = 0;
        v.yaw += Math.sin(v.phase * 0.03) * dt * 0.002;
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
      const small = VESSEL_TYPES[v.type].length * v.sz < 60;
      const amp = (small ? 1 : 0.15) * (this.app.seaState ? this.app.seaState.motion : 1); // [sea-state]
      v.y = wy + Math.sin(v.phase * 1.3) * 0.08 * amp - (v.sinkDepth || 0);
      if (v.state !== 'sink') {
        v.roll = Math.sin(v.phase * 0.9) * 0.025 * amp + (v.type === 'sailboat' ? 0.16 : 0);
        v.pitch = Math.sin(v.phase * 0.7 + 1) * 0.012 * amp;
      }
      // Fire / smoke on damaged vessels.
      if (v.burn > 0) {
        v.burn -= dt;
        if (doFx && fx && fx.spawn && v.visible) {
          _p.set(v.x, v.y + VESSEL_TYPES[v.type].height * v.sy * 0.5, v.z);
          fx.spawn('smoke', _p, { count: 1, scale: Math.max(0.5, v.sz * VESSEL_TYPES[v.type].length / 60), light: false, life: 3, speed: 1 });
        }
      }
      if (v.state === 'sink' && doFx && fx && fx.spawn && v.visible && v.sinkT < 14) {
        _p.set(v.x, v.y + 2, v.z);
        fx.spawn('smoke', _p, { count: 1, scale: Math.max(0.6, v.sz * VESSEL_TYPES[v.type].length / 50), light: false, life: 4, speed: 1 });
      }
    }
    if (this.vessels.some((v) => v.dead)) {
      for (const v of this.vessels) {
        if (v.dead && v.kind === 'ferry' && v.state === 'sunk') this._ferryRespawn(v);
        if (v.dead && v.kind === 'ais' && v.state === 'sunk') this._sunk.set(v.mmsi, Date.now());
      }
      this.vessels = this.vessels.filter((v) => !v.dead);
    }
  }

  _placeYawTarget(v, dir) {
    sampleAlong(v.path, v.cum, v.s, _smp);
    return yawOf(_smp.dx * dir, _smp.dz * dir);
  }

  _ferryRespawn(v) {
    // A sunk ferry is replaced at its route's far terminal after the population tick.
    if (this._routeLive[v.route]) return;
    const nv = this._vessel(v.type, 'ferry');
    nv.route = v.route;
    nv.sx = v.sx; nv.sy = v.sy; nv.sz = v.sz; nv.hp = nv.hp0 = v.hp0;
    nv.path = v.path; nv.cum = v.cum; nv.dir = v.dir > 0 ? -1 : 1;
    nv.s = nv.dir > 0 ? 0 : v.cum[v.cum.length - 1];
    nv.state = 'dock'; nv.timer = 45; nv.speed = SPEED[v.type];
    this._placeOnPath(nv, true);
  }

  // ------------------------------------------------------------------ live vessels
  async _pollAis() {
    const o = this.origin, gen = this._gen, src = this.source;
    if (!src || this._polling) return false;
    if (typeof document !== 'undefined' && document.hidden && this.mode === 'live') return false;
    this._polling = true;
    let res;
    try { res = await src.fetch(); } catch { res = null; } finally { this._polling = false; }
    if (gen !== this._gen || src !== this.source) return false;
    let data = res;
    if (src.relay) {
      if (!res) { if (this.mode === 'live') this.aisStatus = 'stale'; return false; }
      src.name = res.name;
      src.full = res.full;
      data = res.list;
    }
    if (!data) { if (this.mode === 'live') this.aisStatus = 'stale'; return false; }
    this.aisStatus = 'live';
    this.liveFull = !!src.full;
    this.lastFix = Date.now();
    const byId = new Map();
    for (const v of this.vessels) if (v.kind === 'ais') byId.set(v.mmsi, v);
    const seen = new Set();
    const now = Date.now();
    for (const [id, t] of this._sunk) if (now - t > SUNK_HOLD_MS) this._sunk.delete(id);
    for (const a of data) {
      if (this._sunk.has(a.id)) continue;
      let [x, z] = llToWorld(o, a.lat, a.lon);
      if (Math.abs(x) > 19500 || Math.abs(z) > 19500) continue;
      // Moored ships report positions on the quay polygon; nudge them onto the adjacent water.
      const wpt = this.region && this.region.nearestWater(x, z, 100);
      if (wpt) [x, z] = wpt;
      seen.add(a.id);
      let v = byId.get(a.id);
      if (v && v.type !== a.model && v.state !== 'sink') { v.dead = true; v = null; }
      if (!v) {
        v = this._vessel(a.model, 'ais', a.livery, a.id);
        v.mmsi = a.id;
        v.x = x; v.z = z;
        v.yaw = a.heading != null ? Math.PI - a.heading : Math.random() * Math.PI * 2;
        this._fitSize(v, a.length, a.beam);
        v.sog = 0; v.cog = 0;
      } else if (a.sog == null && v.fixT && a.t > v.fixT + 3000) {
        // No speed in the feed (Entur): estimate it from consecutive fixes.
        const dx = x - v.fixX, dz = z - v.fixZ, dts = (a.t - v.fixT) / 1000;
        const sp = Math.hypot(dx, dz) / dts;
        v.estSog = sp < 0.3 || sp > 25 ? 0 : sp;
        if (v.estSog > 0) v.estCog = Math.atan2(dx, -dz);
      }
      v.name = a.name;
      v.fixX = x; v.fixZ = z; v.fixT = Math.min(now, a.t);
      v.sog = a.sog != null ? a.sog : v.estSog || 0;
      v.cog = a.cog != null ? a.cog : v.estCog != null ? v.estCog : a.heading || 0;
      v.hdg = a.heading != null ? a.heading : v.cog;
    }
    for (const v of this.vessels) if (v.kind === 'ais' && !seen.has(v.mmsi) && v.state !== 'sink') v.dead = true;
    this.vessels = this.vessels.filter((v) => !v.dead);
    this._markLiveRoutes();
    return true;
  }

  /** Ferry routes with a live vessel on (within 400 m of) them; simulated ferries leave those routes. */
  _markLiveRoutes() {
    const routes = this.region ? this.region.ferryRoutes : [];
    const live = this.vessels.filter((v) => v.kind === 'ais' && (this.liveFull ? v.type === 'carferry' || v.type === 'ferry' : true));
    // Sticky: once a real ferry has used a route this session, the simulation stays off it.
    this._routeLive = routes.map((pts, ri) => {
      if (this._routeLive[ri]) return true;
      for (const v of live) {
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = pts[i][0], az = pts[i][1], ex = pts[i + 1][0] - ax, ez = pts[i + 1][1] - az;
          const t = clamp(((v.x - ax) * ex + (v.z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
          const dx = ax + ex * t - v.x, dz = az + ez * t - v.z;
          if (dx * dx + dz * dz < 400 * 400) return true;
        }
      }
      return false;
    });
    for (const v of this.vessels) {
      if (v.kind === 'ferry' && v.state !== 'sink' && v.state !== 'sunk' && this._routeLive[v.route]) v.dead = true;
    }
    this.vessels = this.vessels.filter((v) => !v.dead);
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
    const ty = Math.PI - (v.sog > 0.5 && v.hdg == null ? v.cog : v.hdg);
    v.yaw += wrapPi(ty - v.yaw) * Math.min(1, dt * 0.5);
  }

  // ------------------------------------------------------------------ rendering
  _mesh(type, lod) {
    const key = `${type}:${lod}`;
    let im = this.meshes[key];
    if (!im) {
      const cap = lod ? CAP : NEAR_CAP;
      im = new THREE.InstancedMesh(vesselInstanceGeometry(type, lod, cap), this.mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = lod === 0;
      im.receiveShadow = true;
      im.name = `vessel-${type}-${lod ? 'far' : 'near'}`;
      this.root.add(im);
      this.meshes[key] = im;
      this._counts[key] = 0;
    }
    return im;
  }

  _render() {
    const cam = this.app.camera;
    const cx = cam.position.x, cz = cam.position.z;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frus.setFromProjectionMatrix(_pm);
    const counts = this._counts;
    for (const k in counts) counts[k] = 0;
    let nw = 0;
    const wc = this.wakes.instanceColor.array;
    const order = this._order;
    order.length = 0;
    for (const v of this.vessels) {
      v.dist = Math.hypot(v.x - cx, v.z - cz);
      order.push(v);
    }
    order.sort((a, b) => a.dist - b.dist);
    for (const v of order) {
      const spec = VESSEL_TYPES[v.type];
      const d = v.dist;
      const L = spec.length * v.sz, B = spec.beam * v.sx, Hh = spec.height * v.sy;
      v.visible = d < VIEW[v.type] * Math.max(1, v.sz);
      if (!v.visible) continue;
      _sph.center.set(v.x, v.y + Hh * 0.4, v.z);
      _sph.radius = L * 0.6 + Hh;
      const inView = _frus.intersectsSphere(_sph);
      // Wake (also for vessels just off-screen: their foam trails into view).
      const sp = (v.state === 'move' || v.state === 'player' || v.kind === 'ais') ? v.v : 0;
      if (sp > 0.4 && nw < WAKE_CAP && v.state !== 'sink' && d < 9000) {
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
      if (!inView) { v.lod = 1; continue; }
      let lod = d < NEAR[v.type] * clamp(v.sz, 0.5, 2) ? 0 : 1;
      if (lod === 0 && (counts[`${v.type}:0`] || 0) >= NEAR_CAP) lod = 1;
      const key = `${v.type}:${lod}`;
      const im = this._mesh(v.type, lod);
      const i = counts[key];
      if (i >= im.instanceMatrix.count) continue;
      counts[key] = i + 1;
      v.lod = lod;
      _e.set(v.pitch, v.yaw, v.roll, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(v.x, v.y, v.z);
      _s.set(v.sx, v.sy, v.sz);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
      const g = im.geometry.attributes;
      g.iPaint.setXYZ(i, v.paint.r, v.paint.g, v.paint.b);
      g.iAccent.setXYZ(i, v.accent.r, v.accent.g, v.accent.b);
      const char = v.state === 'sink' ? 1 : clamp((1 - v.hp / v.hp0) * 0.9, 0, 0.9);
      g.iState.setXY(i, v.seed, char);
    }
    for (const k in this.meshes) {
      const im = this.meshes[k];
      const n = counts[k] || 0;
      im.count = n;
      im.visible = n > 0;
      if (n) {
        im.instanceMatrix.needsUpdate = true;
        const g = im.geometry.attributes;
        g.iPaint.needsUpdate = g.iAccent.needsUpdate = g.iState.needsUpdate = true;
      }
    }
    this.wakes.count = nw;
    if (nw) { this.wakes.instanceMatrix.needsUpdate = true; this.wakes.instanceColor.needsUpdate = true; }
    this._labels(order);
  }

  _labelTexture(text) {
    let e = this.labelTex.get(text);
    if (e) return e;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 20;
    c.width = w;
    c.height = 40;
    ctx.font = font;
    ctx.fillStyle = 'rgba(12,16,22,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 2, w, 36, 12); else ctx.rect(0, 2, w, 36);
    ctx.fill();
    ctx.fillStyle = '#f3f6fa';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, 21);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    e = { tex, aspect: w / 40 };
    this.labelTex.set(text, e);
    if (this.labelTex.size > 32) {
      const k = this.labelTex.keys().next().value;
      this.labelTex.get(k).tex.dispose();
      this.labelTex.delete(k);
    }
    return e;
  }

  /** Real names over the nearest live vessels. */
  _labels(order) {
    let n = 0;
    if (typeof document !== 'undefined') {
      for (const v of order) {
        if (n >= LABEL_MAX || v.dist > LABEL_M * Math.max(1, v.sz)) break;
        if (v.kind !== 'ais' || !v.name || !v.visible || v.state === 'sink') continue;
        const sp = this.labels[n++];
        const e = this._labelTexture(v.name);
        if (sp.userData.key !== v.name) {
          sp.material.map = e.tex;
          sp.material.needsUpdate = true;
          sp.userData.key = v.name;
        }
        const h = Math.max(2.2, v.dist * 0.022);
        sp.scale.set(h * e.aspect, h, 1);
        sp.position.set(v.x, v.y + VESSEL_TYPES[v.type].height * v.sy + h * 0.8, v.z);
        sp.visible = true;
      }
    }
    for (let i = n; i < LABEL_MAX; i++) this.labels[i].visible = false;
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
        this._spawnPierBoats(best);
      }
    }).catch(() => {}).finally(() => { this._pierBusy--; });
  }

  /** Spawn docked/moored boats alongside real pier segments so players walking onto piers can board them. */
  _spawnPierBoats(chunkGroup) {
    if (this.shipsOff || !chunkGroup || !chunkGroup.userData) return;
    const segs = (chunkGroup.userData.deckSegments || []).filter((s) => s.cls === 'pier');
    if (!segs.length) return;
    const dockedTypes = ['speedboat', 'sailboat', 'patrol', 'tug', 'fishing', 'ferry'];
    let added = 0;
    for (let i = 0; i < segs.length && added < 4; i++) {
      const s = segs[i];
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      if (len < 12) continue;
      const mx = (s.x1 + s.x2) * 0.5, mz = (s.z1 + s.z2) * 0.5;
      // Avoid crowding existing docked boats
      if (this.vessels.some((v) => Math.hypot(v.x - mx, v.z - mz) < 22)) continue;
      const type = dockedTypes[(Math.abs(Math.round(mx + mz)) + i) % dockedTypes.length];
      const spec = VESSEL_TYPES[type] || { beam: 4, length: 12 };
      const nx = -dz / len, nz = dx / len;
      const offset = (s.width || 3.5) * 0.5 + spec.beam * 0.55 + 2.2;
      const bx = mx + nx * offset, bz = mz + nz * offset;
      const v = this._vessel(type, 'docked', null, `pier_${Math.round(bx)}_${Math.round(bz)}`);
      v.x = bx;
      v.z = bz;
      v.yaw = Math.atan2(dx, dz);
      v.state = 'moored';
      v.v = 0;
      v.speed = 0;
      added++;
    }
  }
}

/** 0..1: how far the window / navigation lights are switched on (same curve as street traffic). */
function lightsLevel() {
  try {
    if (daylight.isNight()) return 1;
    return clamp((0.65 - daylight.getDaylight()) / 0.5, 0, 1);
  } catch {
    return 0;
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
