// [parked-cars] The player's own cars stay where they were left (GTA): getting out parks the car as a real
// object you can walk back to and re-enter with E. The last MAX_PARKED cars are kept; an older one is removed
// once you are far from it, and any parked car is dropped after a teleport / long trip (DROP_DIST).
// Parked cars are static obstacles for AI traffic (brake, change lane or squeeze past, via the wreck-avoid
// path in city_traffic), solid for the player's car and the walker, and take weapon / explosion / crash
// damage: smoke, then fire, then they blow up and are left as a charred wreck that later sinks away.
// Also holds the spawn helpers used when the player switches mode:
//   findDriveSpawn: nearest proper road lane (no footway / cycleway; service alleys only as a fallback),
//                   aligned with the lane direction and clear of buildings, traffic and parked cars.
//   findHeliSpawn:  a launch spot clear of buildings / landmark colliders (lifted above them, or moved to the
//                   nearest open area when a supertall tower stands on the spot).
// Hooks: city_traffic.js (_buildObstacles -> addTrafficObstacles, triggerImpactSphere -> impactSphere),
// walker_weapons.js (raycastAim -> raycast), main.js (setMode / handleVehicleInteract / selectVehicle).
import * as THREE from '../../vendor/three.module.js';
import { VEHICLE_SPECS } from '../entities.js';
import { getBeijingTerrainElevation } from '../environment.js';
import { crashDamage } from './vehicle_damage.js';

const MAX_PARKED = 3;
const FAR_DESPAWN = 80;     // an over-the-cap car is removed once the player is this far away
const DROP_DIST = 900;      // any parked car this far away is removed (teleport, long drive / flight)
const HP = 8;               // same scale as the player's car (vehicle_damage PLAYER_HP)
const SMOKE = 0.55, BURN = 0.22, BURN_DRAIN = 0.028; // burning: fraction of HP per second until it blows
const WRECK_FIRE = 16, WRECK_LIFE = 40, SINK_TIME = 3;
const GRAV = 18.5;
const RESTITUTION = 0.3;
// OSM classes a car must never be spawned on (service / track / pedestrian only when nothing better is near)
const NO_CAR = new Set(['footway', 'cycleway', 'path', 'steps', 'bridleway', 'corridor', 'platform', 'construction', 'proposed', 'elevator', 'escalator', 'via_ferrata']);
const MINOR = new Set(['service', 'track', 'living_street']);

function obbOverlap(ax, az, ahx, ahz, aL, aW, bx, bz, bhx, bhz, bL, bW) {
  const dx = ax - bx, dz = az - bz;
  let best = Infinity, nx = 0, nz = 0;
  for (let k = 0; k < 4; k++) {
    const x = k === 0 ? ahx : k === 1 ? -ahz : k === 2 ? bhx : -bhz;
    const z = k === 0 ? ahz : k === 1 ? ahx : k === 2 ? bhz : bhx;
    const rA = aL * Math.abs(ahx * x + ahz * z) + aW * Math.abs(-ahz * x + ahx * z);
    const rB = bL * Math.abs(bhx * x + bhz * z) + bW * Math.abs(-bhz * x + bhx * z);
    const d = dx * x + dz * z;
    const o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; nx = d >= 0 ? x : -x; nz = d >= 0 ? z : -z; }
  }
  return { depth: best, nx, nz };
}

function specDims(idx) {
  const s = VEHICLE_SPECS[idx] || {};
  const tank = s.id === 'tank' || s.isTank;
  return { hl: tank ? 3.2 : (s.length || 4.6) * 0.5, hw: tank ? 1.45 : (s.width || 2) * 0.5, mass: s.massKg || 1500, spec: s };
}

export class ParkedCars {
  constructor(app) {
    this.app = app;
    this.list = [];
    this._v = new THREE.Vector3();
    this._hit = { dist: 0, e: null };
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1, metalness: 0.05 });
    this.stats = { parked: 0, entered: 0, despawned: 0, exploded: 0, crashes: 0 };
    this.log = []; // test probe: [event, x, z]
    if (typeof window !== 'undefined') window.__parkedCars = this;
  }

  // ------------------------------------------------------------------ bookkeeping
  /** Leave `mesh` (the car the player just got out of) parked at its pose; health 0..1. */
  park(mesh, specIdx, x, y, z, yaw, health = 1) {
    const d = specDims(specIdx);
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, yaw, 0);
    const e = {
      mesh, specIdx, x, y, z, yaw, hx: Math.sin(yaw), hz: Math.cos(yaw), hl: d.hl, hw: d.hw, mass: d.mass,
      hp: HP * Math.max(0.05, Math.min(1, health)), state: 0, vx: 0, vz: 0, vy: 0, lift: 0, yawVel: 0,
      kWreck: 1, // city_traffic: a static obstacle to route around (same path as a wreck)
      t: performance.now(), wreckT: 0, smokeAcc: 0, fireAcc: 0, spinX: 0, spinZ: 0,
    };
    this.list.push(e);
    this.stats.parked++;
    this._event('park', e);
    return e;
  }

  _event(type, e) {
    this.log.push([type, Math.round(e.x), Math.round(e.z), Math.round(performance.now() / 100) / 10]);
    if (this.log.length > 60) this.log.shift();
  }

  isParked(mesh) {
    for (const e of this.list) if (e.mesh === mesh) return true;
    return false;
  }

  /** Nearest intact parked car whose body is within maxGap metres of (x, z). */
  nearestEnterable(x, z, maxGap = 3) {
    let best = null, bd = maxGap;
    for (const e of this.list) {
      if (e.state >= 3) continue;
      const dx = x - e.x, dz = z - e.z;
      const along = Math.abs(dx * e.hx + dz * e.hz) - e.hl;
      const lat = Math.abs(-dx * e.hz + dz * e.hx) - e.hw;
      const gap = Math.hypot(Math.max(0, along), Math.max(0, lat));
      if (gap < bd) { bd = gap; best = e; }
    }
    return best;
  }

  /** Remove `e` from the parked list without touching its mesh (the player drives it again). */
  take(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.stats.entered++;
    return e;
  }

  /** Free a car mesh's GPU buffers (the shared char material stays). */
  disposeMesh(mesh) {
    this.app.scene.remove(mesh);
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m !== this.charMat) m.dispose();
    });
  }

  _drop(i) {
    const e = this.list[i];
    this.list.splice(i, 1);
    this.stats.despawned++;
    this._event('despawn', e);
    if (e.mesh === this.app.vehicleMesh) e.mesh.visible = false; // the current car object: main.js rebuilds it if charred
    else this.disposeMesh(e.mesh);
  }

  /** Teleport: drop every parked car far from the new spot. */
  dropFar(x, z, dist = DROP_DIST) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (Math.hypot(e.x - x, e.z - z) > dist) this._drop(i);
    }
  }

  // ------------------------------------------------------------------ hooks
  /** city_traffic._buildObstacles: AI cars brake for / route around parked cars. */
  addTrafficObstacles(traffic) {
    for (const e of this.list) {
      if (e.lift > 1.8) continue;
      traffic._addObstacle(e.x, e.z, e.hx, e.hz, e.hl, e.hw, 0, 0, e);
    }
  }

  /** city_traffic.triggerImpactSphere: weapons / explosions damage and shove parked cars. */
  impactSphere(x, y, z, r, dmg, opts = {}) {
    for (const e of this.list) {
      if (e.state >= 3) continue;
      const dx = e.x - x, dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r || (Number.isFinite(y) && Math.abs(e.y - y) > Math.max(8.5, r))) continue;
      const f = d <= 3 ? 1 : Math.max(0, 1 - (d - 3) / Math.max(0.1, r - 3));
      const force = opts.force || 1.3;
      if (force >= 1.6 && d > 0.2) { // explosions shove the car
        const k = (3 + 4 * force) * Math.max(0.25, 1 - d / r) * 1500 / e.mass;
        e.vx += (dx / d) * k; e.vz += (dz / d) * k;
        e.yawVel += (Math.random() - 0.5) * k * 0.6;
      }
      this.hit(e, dmg * f * f, opts.source || '');
    }
  }

  /** walker_weapons.raycastAim: bullets stop at a parked car. Returns a reused { dist, e } or null. */
  raycast(o, d, maxDist) {
    let best = maxDist, be = null;
    for (const e of this.list) {
      if (e.lift > 3) continue;
      const cx = e.x - o.x, cy = e.y + 0.8 - o.y, cz = e.z - o.z;
      const along = cx * d.x + cy * d.y + cz * d.z;
      if (along <= 1 || along >= best) continue;
      const px = cx - d.x * along, py = cy - d.y * along, pz = cz - d.z * along;
      if (px * px + py * py + pz * pz <= 2.3 * 2.3) { best = along; be = e; }
    }
    if (!be) return null;
    this._hit.dist = best; this._hit.e = be;
    return this._hit;
  }

  hit(e, dmg, src = '') {
    if (!(dmg > 0) || e.state >= 3) return;
    e.hp -= dmg;
    const fx = this._fx();
    if (fx && dmg > 0.3) fx.spawn('spark', this._v.set(e.x, e.y + 1, e.z), { count: 5, scale: 0.9 });
    if (e.hp <= 0) this._boom(e, src);
    else e.state = e.hp < HP * BURN ? 2 : e.hp < HP * SMOKE ? 1 : 0;
  }

  // ------------------------------------------------------------------ damage FX
  _fx() { const D = this.app.vehicleDamage; return D ? D._fx() : null; }

  _boom(e) {
    const D = this.app.vehicleDamage, fx = this._fx();
    e.state = 3; e.hp = 0; e.wreckT = 0;
    this.stats.exploded++;
    const x = e.x, y = e.y, z = e.z;
    if (fx) {
      fx.spawn('explosion', this._v.set(x, y + 1, z), { scale: 0.9 });
      fx.spawn('dustRing', this._v.set(x, y, z), { scale: 0.5 });
      fx.spawn('debris', this._v.set(x, y + 1, z), { count: 8, scale: 0.6 });
    }
    if (D) { D._sfx('explosion', x, y, z, 0.85); D._scorchAt(x, y, z, 7); D._addThreat(x, z, 45, 4); }
    e.vy = 8.5; e.vx += (Math.random() - 0.5) * 3; e.vz += (Math.random() - 0.5) * 3;
    e.spinX = (Math.random() - 0.5) * 6; e.spinZ = (Math.random() - 0.5) * 8; e.yawVel += (Math.random() - 0.5) * 3;
    e.mesh.userData.charred = true;
    e.mesh.traverse((o) => { if (o.isMesh) o.material = this.charMat; if (o.isLight) o.visible = false; });
    const T = this.app.traffic;
    if (T && T.triggerImpactSphere) T.triggerImpactSphere(x, y, z, 11, { force: 1.7, vy: 6, damage: 3.5, source: 'carExplosion', depth: 1 });
  }

  _groundY(x, y, z) {
    const surf = this.app.sampleRoadSurface(x, y + 0.6, z);
    const terr = getBeijingTerrainElevation(x, z) + 0.22;
    return surf ? Math.max(surf.y, terr - 0.1) : terr;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!(dt > 0) || !this.list.length) return;
    const app = this.app, fx = this._fx();
    const px = app.pos.x, pz = app.pos.z;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      // shoves (crashes, explosions) slide the car with tyre friction; buildings stop it
      const sp = Math.hypot(e.vx, e.vz);
      const air = e.lift > 0.01 || e.vy > 0;
      if (sp > 0.02 || Math.abs(e.yawVel) > 0.01 || air) {
        const nx = e.x + e.vx * dt, nz = e.z + e.vz * dt;
        const col = app.collision.resolveCar(nx, e.y, nz, e.yaw, VEHICLE_SPECS[e.specIdx], e.x, e.z);
        if (col.hit) { const vn = e.vx * col.nx + e.vz * col.nz; if (vn < 0) { e.vx -= vn * col.nx * 1.3; e.vz -= vn * col.nz * 1.3; } }
        e.x = col.x; e.z = col.z;
        e.yaw += e.yawVel * dt;
        e.hx = Math.sin(e.yaw); e.hz = Math.cos(e.yaw);
        const fr = air ? 0 : 7 * dt;
        const sp2 = Math.max(0, sp - fr);
        if (sp > 0) { e.vx *= sp2 / sp; e.vz *= sp2 / sp; }
        if (!air) e.yawVel *= Math.max(0, 1 - 4 * dt);
        e.y = this._groundY(e.x, e.y + e.lift, e.z);
        if (air) {
          e.vy -= GRAV * dt; e.lift += e.vy * dt;
          e.mesh.rotation.x += e.spinX * dt; e.mesh.rotation.z += e.spinZ * dt;
          if (e.lift <= 0) { e.lift = 0; e.vy = Math.abs(e.vy) > 4 ? -e.vy * 0.25 : 0; e.spinX *= 0.4; e.spinZ *= 0.4; }
        }
      }
      if (!air && (e.mesh.rotation.x !== 0 || e.mesh.rotation.z !== 0)) { // settle upright-ish
        e.mesh.rotation.x *= 0.85; e.mesh.rotation.z *= 0.85;
        if (Math.abs(e.mesh.rotation.x) + Math.abs(e.mesh.rotation.z) < 0.01) e.mesh.rotation.x = e.mesh.rotation.z = 0;
      }
      e.mesh.position.set(e.x, e.y + e.lift, e.z);
      e.mesh.rotation.y = e.yaw;

      // damage states
      const hood = e.hl * 0.65;
      if (e.state === 2) { e.hp -= HP * BURN_DRAIN * dt; if (e.hp <= 0) this._boom(e); }
      if (fx && (e.state === 1 || e.state === 2)) {
        const hx = e.x + e.hx * hood, hz = e.z + e.hz * hood;
        e.smokeAcc += dt * (e.state === 2 ? 7 : 3);
        while (e.smokeAcc >= 1) {
          e.smokeAcc -= 1;
          fx.spawn('smoke', this._v.set(hx, e.y + 1.3, hz), { scale: e.state === 2 ? 0.3 : 0.22, speed: 3, life: 4, light: e.state === 1 });
          if (e.state === 2) fx.spawn('fire', this._v.set(hx, e.y + 1.1, hz), { scale: 0.3 });
        }
      } else if (e.state === 3) {
        e.wreckT += dt;
        if (fx && e.wreckT < WRECK_FIRE) {
          e.fireAcc += dt * 7;
          while (e.fireAcc >= 1) { e.fireAcc -= 1; fx.spawn('fire', this._v.set(e.x + (Math.random() - 0.5) * 1.2, e.y + e.lift + 1, e.z + (Math.random() - 0.5) * 1.2), { scale: 0.5 }); fx.spawn('smoke', this._v.set(e.x, e.y + e.lift + 2.4, e.z), { scale: 0.4, speed: 4, life: 6 }); }
        }
        if (e.wreckT > WRECK_LIFE) {
          e.mesh.position.y -= ((e.wreckT - WRECK_LIFE) / SINK_TIME) * 2.2;
          if (e.wreckT > WRECK_LIFE + SINK_TIME) { this._drop(i); continue; }
        }
      }

      if (Math.hypot(e.x - px, e.z - pz) > DROP_DIST) { this._drop(i); continue; }
      this._collidePlayer(e, dt);
    }
    // keep the last MAX_PARKED: an older one goes once the player is away from it
    if (this.list.length > MAX_PARKED) {
      for (let i = 0; i < this.list.length && this.list.length > MAX_PARKED; i++) {
        const e = this.list[i];
        if (Math.hypot(e.x - px, e.z - pz) > FAR_DESPAWN) { this._drop(i); i--; }
      }
    }
  }

  /** Player car (impulse + crash damage both ways) or walker (pushed out) against a parked car. */
  _collidePlayer(e, dt) {
    const app = this.app;
    if (e.lift > 1.5) return;
    if (Math.abs(app.pos.y - e.y) > 2.6) return;
    if (app.mode === 'walk') {
      const dx = app.pos.x - e.x, dz = app.pos.z - e.z;
      const along = dx * e.hx + dz * e.hz, lat = -dx * e.hz + dz * e.hx;
      const pa = e.hl + 0.42 - Math.abs(along), pl = e.hw + 0.42 - Math.abs(lat);
      if (pa <= 0 || pl <= 0) return;
      if (pa < pl) { const s = Math.sign(along) || 1; app.pos.x += e.hx * pa * s; app.pos.z += e.hz * pa * s; }
      else { const s = Math.sign(lat) || 1; app.pos.x += -e.hz * pl * s; app.pos.z += e.hx * pl * s; }
      return;
    }
    if (app.mode !== 'drive') return;
    const d = specDims(app.vehicleIdx);
    const hx = Math.sin(app.yaw), hz = Math.cos(app.yaw);
    if (Math.abs(app.pos.x - e.x) > 12 || Math.abs(app.pos.z - e.z) > 12) return;
    const r = obbOverlap(app.pos.x, app.pos.z, hx, hz, d.hl, d.hw, e.x, e.z, e.hx, e.hz, e.hl, e.hw);
    if (!r) return;
    const mP = d.mass, mE = e.mass, m = mP + mE;
    const px0 = app.pos.x, pz0 = app.pos.z;
    app.pos.x += r.nx * r.depth * (mE / m); app.pos.z += r.nz * r.depth * (mE / m);
    e.x -= r.nx * r.depth * (mP / m); e.z -= r.nz * r.depth * (mP / m);
    const rc = app.collision.resolveCar(app.pos.x, app.pos.y, app.pos.z, app.yaw, d.spec, px0, pz0);
    app.pos.x = rc.x; app.pos.z = rc.z;
    const v1x = hx * (app.speed || 0), v1z = hz * (app.speed || 0);
    const relVn = (v1x - e.vx) * r.nx + (v1z - e.vz) * r.nz;
    if (relVn >= 0) return;
    const j = -(1 + RESTITUTION) * relVn / (1 / mP + 1 / mE);
    app.speed = (v1x + (j / mP) * r.nx) * hx + (v1z + (j / mP) * r.nz) * hz;
    e.vx -= (j / mE) * r.nx; e.vz -= (j / mE) * r.nz;
    const arm = (e.x - app.pos.x) * r.nz - (e.z - app.pos.z) * r.nx;
    e.yawVel = Math.max(-3, Math.min(3, e.yawVel + arm * (j / mE) * 0.08));
    const v = -relVn;
    if (v > 6 && app.collision) app.collision.shake = Math.min(1, Math.max(app.collision.shake || 0, v / 45));
    if (crashDamage(v) > 0) {
      this.stats.crashes++;
      if (app.vehicleDamage) app.vehicleDamage.crashPlayer(v, 2 * mE / m, 'parked');
      this.hit(e, crashDamage(v) * 2 * mP / m, 'ram');
    }
  }
}

// ---------------------------------------------------------------------- spawn helpers
/**
 * Where to put the player's car when switching to drive at (x, z): the nearest proper road lane, aligned
 * with its direction (the one closest to `prefYaw`) on the correct side for the country's traffic, clear
 * of buildings, AI cars and parked cars. Returns { x, y, z, yaw, cls, d } or null (nothing drivable near).
 */
export function findDriveSpawn(app, x, y, z, prefYaw, specIdx, lht = false) {
  const spec = VEHICLE_SPECS[specIdx] || { length: 4.6, width: 2 };
  const cands = [];
  const [cx, cz] = app.worldToChunk(x, z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
      const segs = chunk && chunk.userData && chunk.userData.roadSegments;
      if (!segs) continue;
      for (const s of segs) {
        if (s.tunnel || NO_CAR.has(s.cls)) continue;
        const sx = s.x2 - s.x1, sz = s.z2 - s.z1;
        const L2 = sx * sx + sz * sz;
        if (L2 < 4) continue;
        let t = ((x - s.x1) * sx + (z - s.z1) * sz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.x1 + sx * t, qz = s.z1 + sz * t, qy = s.y1 + (s.y2 - s.y1) * t;
        const d = Math.hypot(qx - x, qz - z);
        if (d > 400) continue;
        if (Math.abs(qy - y) > 7 && d < 30) continue; // an overpass / underpass right above or below
        // proper roads first; service / track alleys and pedestrian streets (car-wide plazas) only if nothing
        // drivable is reasonably near (a real road up to ~200 m further away still wins over a pedestrian plaza)
        if (s.cls === 'pedestrian' && (s.width || 0) < 5) continue; // park paths tagged pedestrian
        const pen = s.cls === 'pedestrian' ? 200 : MINOR.has(s.cls) ? 45 : 0;
        const score = d + Math.abs(qy - y) * 2 + pen + ((s.width || 6) < 4.5 ? 15 : 0);
        cands.push({ s, t, score });
      }
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const traffic = app.traffic;
  const parked = app.parkedCars;
  const n = Math.min(cands.length, 14);
  for (let k = 0; k < n; k++) {
    const { s, t } = cands[k];
    const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L;
    // driving direction: one-way roads only forward; else the direction closest to where the player faces
    const fwd = s.oneway ? true : ux * Math.sin(prefYaw) + uz * Math.cos(prefYaw) >= 0;
    const hx = fwd ? ux : -ux, hz = fwd ? uz : -uz;
    const lanes = Math.max(1, s.lanes || (s.oneway ? 1 : 2));
    const laneW = Math.max(2.6, Math.min(3.7, (s.width || lanes * 3.2) / lanes));
    // lateral offset (+ = right of travel): kerb-side lane, as AI traffic drives (city_traffic._carPose)
    const off = s.oneway
      ? (lanes > 1 ? (lanes * 0.5 - 0.5) * laneW * (lht ? -1 : 1) : 0)
      : (lht ? -1 : 1) * Math.max(0, Math.min((Math.max(1, lanes * 0.5) - 0.5) * laneW, (s.width || 6) * 0.5 - spec.width * 0.5 - 0.3));
    for (const slide of [0, 6, -6, 12, -12, 20, -20]) {
      const tt = t + slide / L;
      if (tt < 0 || tt > 1) continue;
      if (L > 24 && (tt * L < 9 || (1 - tt) * L < 9)) continue; // not in the junction box at either end
      const bx = s.x1 + (s.x2 - s.x1) * tt, bz = s.z1 + (s.z2 - s.z1) * tt;
      const px = bx - hz * off, pz = bz + hx * off;
      const py0 = s.y1 + (s.y2 - s.y1) * tt;
      const yaw = Math.atan2(hx, hz);
      const surf = app.sampleRoadSurface(px, py0 + 0.6, pz);
      const py = surf ? surf.y : py0;
      const col = app.collision.resolveCar(px, py, pz, yaw, spec);
      if (col.hit) continue;
      let blocked = false;
      if (traffic && traffic.cars) {
        for (const c of traffic.cars) {
          if (!c.active) continue;
          if (Math.abs(c.x - px) < 7.5 && Math.abs(c.z - pz) < 7.5 && Math.abs((c.y || 0) - py) < 3) { blocked = true; break; }
        }
      }
      if (!blocked && parked) {
        for (const e of parked.list) if (Math.hypot(e.x - px, e.z - pz) < 6.5) { blocked = true; break; }
      }
      if (blocked) continue;
      return { x: px, y: py, z: pz, yaw, cls: s.cls, d: Math.hypot(px - x, pz - z) };
    }
  }
  return null;
}

/** Tallest building / landmark collider top within r metres of (x, z) (-Infinity if none). */
export function maxTopNear(app, x, z, r) {
  let top = -Infinity;
  const [cx, cz] = app.worldToChunk(x, z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
      const cols = chunk && chunk.userData && chunk.userData.buildingColliders;
      if (!cols) continue;
      for (let i = 0; i < cols.length; i++) {
        const b = cols[i];
        if (b.h <= top) continue;
        if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
        top = b.h;
      }
    }
  }
  return top;
}

/**
 * Helicopter launch spot near (x, z): HELI_AGL above the ground, lifted to clear any building / landmark
 * within the rotor margin. If a supertall stands there (the lift would exceed MAX_LIFT), the nearest open
 * column within 400 m is used instead. Returns { x, y, z }.
 */
export function findHeliSpawn(app, x, z, agl = 150) {
  const CLEAR = 30, MARGIN = 22, MAX_LIFT = 240; // CLEAR: rotor radius + slack for landmark meshes wider than their colliders
  const at = (px, pz) => {
    const g = getBeijingTerrainElevation(px, pz);
    const top = maxTopNear(app, px, pz, CLEAR);
    return { x: px, z: pz, g, y: Math.max(g + agl, top + MARGIN) };
  };
  const here = at(x, z);
  if (here.y - here.g <= MAX_LIFT) return here;
  for (let r = 40; r <= 400; r += 40) {
    let best = null;
    const n = Math.max(8, Math.round(r / 12));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const c = at(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (c.y - c.g <= agl + 1 && (!best || c.y < best.y)) best = c;
    }
    if (best) return best;
  }
  return here;
}
