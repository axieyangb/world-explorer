// [polish] GTA-style carjacking: E on foot next to a traffic car no longer swaps you straight into it. The
// traffic car is replaced on the spot by the detailed model it becomes (same paint and type as the instant
// claim) with its driver at the wheel; you run to the driver's door and yank, the driver is pulled out and
// thrown to the ground (the connected ragdoll of ped_ragdoll.js), gets up and runs, the passengers bail out
// and flee (both officers of a police car), and you get in. ~1.5-2.2 s; E again skips to the end.
// The people are ordinary crowd pedestrians (city_traffic.spawnActor): they flee off the sidewalk graph and
// are recycled once out of sight. Nearby people get a 'carjacked' event (people_agents.onCarjack).
// Hooks: main.js (hijackNearestTrafficCar / handleVehicleInteract / walk input lock / per-frame update),
// city_traffic.js (_buildObstacles -> addTrafficObstacles). Anything that gets in the way (another mode,
// Kaiju Defense, a building at the door, a fast car, no free pedestrian slot) falls back to the instant claim.
import * as THREE from '../../vendor/three.module.js';
import { createVehicleModel } from '../entities.js';
import { heroLook } from './hero_avatar.js';
import { randomPersonLook, bit, OPT } from './person_model.js';
import { updateVehicleDriver } from './drivers.js';

const T_DOOR = 0.42;  // from reaching the door to the yank
const T_IN = 0.95;    // from the yank to sitting in
const RUN = 7;        // approach speed (m/s); farther cars are reached in at most T_WALK_MAX
const T_WALK_MAX = 0.85;
const MAX_V = 16;     // faster cars are claimed instantly
// Other occupants per traffic type: [door side (+1 = driver's side, -1 = the other), dz from the driver's
// hip, probability] (traffic_models.js shader: front passenger 0.35, rear 0.25, bus 0.5, police partner 1).
const CREW = {
  sedan: [[-1, 0, 0.35], [-1, -1, 0.25]], taxi: [[-1, 0, 0.35], [-1, -1, 0.25]], tesla: [[-1, 0, 0.35], [-1, -1, 0.25]],
  cybertruck: [[-1, 0, 0.35], [-1, -1, 0.25]], coupe: [[-1, 0, 0.35]], tow_truck: [[-1, 0, 0.35]],
  police: [[-1, 0, 1]], ambulance: [[-1, 0, 1]],
  bus: [[1, -0.4, 0.5], [1, -0.4, 0.5], [1, -0.4, 0.5], [1, -0.4, 0.5]],
};
const UNIFORM = new THREE.Color(0x1a2236), UNIFORM_PANTS = new THREE.Color(0x141a2a);
const NO_UNIFORM = bit(OPT.COAT) | bit(OPT.SKIRT) | bit(OPT.SHORTS) | bit(OPT.TSHIRT) | bit(OPT.BACKPACK) | bit(OPT.BAG) |
  bit(OPT.PHONE) | bit(OPT.UMBRELLA) | bit(OPT.HAIR_LONG) | bit(OPT.PONYTAIL) | bit(OPT.BUN);

const _v = new THREE.Vector3();

// Seed of a civilian (not the rare soldier look); police drivers get a dark top so the seated officer
// reads as one.
function driverSeed(police) {
  let seed = 0;
  for (let k = 0; k < 64; k++) {
    seed = (Math.random() * 4294967296) >>> 0;
    const L = heroLook(seed);
    if (L.soldier) continue;
    if (!police) return seed;
    const c = new THREE.Color(L.topColor);
    if (L.top !== 'dress' && c.r + c.g + c.b < 0.5) return seed;
  }
  return seed;
}

// Crowd look (person_model) for a person: matches the seated driver's clothes (hero look) when given.
function crowdLook(app, hero, police) {
  const o = app.worldOrigin || {};
  let L = randomPersonLook(o.centerLat, o.centerLon);
  const fem = bit(OPT.FEMALE);
  for (let k = 0; k < 8 && hero && !!(L.style & fem) !== !!hero.female; k++) L = randomPersonLook(o.centerLat, o.centerLon);
  if (hero && !hero.soldier) {
    L.top = new THREE.Color(hero.topColor);
    L.pants = new THREE.Color(hero.bottomColor);
    L.skin = new THREE.Color(hero.skin);
    L.hair = new THREE.Color(hero.hairColor);
  }
  if (police) {
    L.style = (L.style & ~NO_UNIFORM) | bit(OPT.CAP) | bit(OPT.HAIR_SHORT);
    L.top = UNIFORM.clone(); L.pants = UNIFORM_PANTS.clone(); L.acc = UNIFORM.clone();
  }
  L.speedMul = 1;
  return L;
}

export class Carjack {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.s = null;
  }

  /**
   * Start the sequence for traffic car `car` (still active in city_traffic) to be claimed as `claim`
   * ({ x, y, z, yaw, specIdx, specId, typeId, paintColor, hideTaxiSign }). Returns false when the instant claim
   * should be used instead.
   */
  start(car, claim) {
    const app = this.app, T = app.traffic;
    if (this.active || app.mode !== 'walk' || (app.kaiju && app.kaiju.active)) return false;
    if (!T || typeof T.spawnActor !== 'function' || Math.abs(car.v || 0) > MAX_V || car.dState >= 2 || car.dFly) return false;
    if (!T.peds.some((p) => !p.active)) return false;
    const mesh = createVehicleModel(claim.specId, { hero: true, paintColor: claim.paintColor, hideTaxiSign: claim.hideTaxiSign });
    const chassis = mesh.userData && mesh.userData.chassis;
    const seat = chassis && chassis.userData.driverSeat;
    mesh.position.set(claim.x, claim.y, claim.z);
    mesh.rotation.set(0, claim.yaw, 0);
    mesh.updateMatrixWorld(true);
    // driver's hip in the car's own frame (the chassis may sit offset in the root)
    let hipX = 0.4, hipZ = 0.5;
    if (seat) {
      chassis.localToWorld(_v.set(seat.hip[0], seat.hip[1], seat.hip[2]));
      mesh.worldToLocal(_v);
      hipX = _v.x; hipZ = _v.z;
    }
    const isBus = claim.typeId === 'bus';
    const side = isBus ? 1 : hipX >= 0 ? 1 : -1; // the bus driver leaves by the front door (+X)
    const doorZ = isBus ? hipZ + 0.1 : hipZ;
    const halfW = (car.wid || 2) * 0.5;
    const s = {
      car, claim, mesh, side, doorZ, halfW, t: 0, phase: 0, police: claim.typeId === 'police',
      cos: Math.cos(claim.yaw), sin: Math.sin(claim.yaw), actors: [],
    };
    // where the player stands (outside the door, a little behind it) — fall back if a wall is there
    const st = this._local(s, side * (halfW + 0.62), doorZ - 0.35);
    const col = app.collision && app.collision.resolve(st.x, app.pos.y + 0.6, st.z, claim.yaw, 0.45, [0], null, st.x, st.z);
    if (col && Math.hypot(col.x - st.x, col.z - st.z) > 0.2) { this._dispose(mesh); return false; }
    s.stand = st;
    s.from = { x: app.pos.x, z: app.pos.z };
    s.tWalk = Math.min(T_WALK_MAX, Math.max(0.12, Math.hypot(st.x - app.pos.x, st.z - app.pos.z) / RUN));
    s.faceYaw = Math.atan2(-side * s.cos, side * s.sin); // toward the car's side
    s.seed = driverSeed(s.police);
    s.fake = { userData: { look: { seed: s.seed } } }; // the seated driver (drivers.js) wears this look
    app.scene.add(mesh);
    car.active = false;
    this.s = s;
    this.active = true;
    return true;
  }

  /** E again: skip to sitting in the car. */
  skip() {
    if (!this.active) return;
    if (this.s.phase < 2) this._eject();
    this._finish();
  }

  /** city_traffic._buildObstacles: traffic brakes for / routes around the stopped car. */
  addTrafficObstacles(T) {
    if (!this.active) return;
    const s = this.s;
    T._addObstacle(s.claim.x, s.claim.z, s.sin, s.cos, (s.car.len || 4.6) * 0.5, s.halfW, 0, 0, s);
  }

  /** Every frame after the physics step (main.js). */
  update(dt) {
    if (!this.active) return;
    const app = this.app, s = this.s;
    // another mode, Kaiju Defense or a teleport: drop the staged car (nothing left half-done)
    if (app.mode !== 'walk' || (app.kaiju && app.kaiju.active) || Math.hypot(app.pos.x - s.stand.x, app.pos.z - s.stand.z) > 40) { this.abort(); return; }
    s.t += dt;
    const av = app.avatarMesh;
    // seated driver until the yank
    if (s.phase < 2) updateVehicleDriver(s.mesh, s.fake, 0);
    let speed = 0, yaw = s.faceYaw;
    if (s.t < s.tWalk) {
      const k = s.t / s.tWalk;
      app.pos.x = s.from.x + (s.stand.x - s.from.x) * k;
      app.pos.z = s.from.z + (s.stand.z - s.from.z) * k;
      const dx = s.stand.x - s.from.x, dz = s.stand.z - s.from.z;
      if (dx * dx + dz * dz > 0.04) yaw = Math.atan2(dx, dz);
      speed = Math.hypot(dx, dz) / s.tWalk;
    } else {
      app.pos.x = s.stand.x; app.pos.z = s.stand.z;
      if (s.phase === 0) {
        s.phase = 1; // reach for the door: the punch pose doubles as the yank
        app._punchHand = s.side > 0 ? 'L' : 'R';
        app._punchDuration = T_DOOR + 0.12;
        app._punchTimer = app._punchDuration;
      }
      if (s.phase === 1 && s.t >= s.tWalk + T_DOOR) this._eject();
      if (s.phase === 2 && s.t >= s.tWalk + T_DOOR + T_IN) { this._finish(); return; }
    }
    // turn smoothly toward the run / the door
    let d = yaw - app.yaw;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    app.yaw += d * Math.min(1, dt * 14);
    app.speed = speed;
    if (av) {
      av.position.copy(app.pos);
      av.rotation.y = app.yaw;
      const mo = av.userData.motion;
      if (mo) { mo.speed = speed; mo.sprint = speed > 8; }
    }
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    this._dispose(this.s.mesh);
    this.s = null;
  }

  // ---------------- internals ----------------
  _local(s, lx, lz) {
    return { x: s.claim.x + lx * s.cos + lz * s.sin, z: s.claim.z - lx * s.sin + lz * s.cos };
  }

  _dispose(mesh) {
    const app = this.app;
    if (app.parkedCars && typeof app.parkedCars.disposeMesh === 'function') app.parkedCars.disposeMesh(mesh);
    else app.scene.remove(mesh);
  }

  // Driver out onto the road, passengers out of their doors.
  _eject() {
    const app = this.app, s = this.s, T = app.traffic;
    s.phase = 2;
    const drv = s.mesh.userData.driver;
    if (drv && drv.userData.seat) drv.userData.seat.seen = -1e9; // empty seat from now on
    const y = s.claim.y + 0.06;
    const outX = s.side * s.sin, outZ = s.side * s.cos; // world direction out of the driver's door
    const p0 = this._local(s, s.side * (s.halfW + 0.2), s.doorZ + 0.15);
    const hero = heroLook(s.seed);
    const sp = 3 + Math.random() * 1.2;
    const out = T.spawnActor(p0.x, y, p0.z, Math.atan2(outX, outZ), crowdLook(app, hero, s.police), {
      // thrown outward and a little back past the player; the feet trail toward the car so he lands on his back
      rag: { vx: outX * sp - s.cos * 0.6, vy: 1.6 + Math.random() * 0.8, vz: outZ * sp + s.sin * 0.6, dx: -outX, dz: -outZ, spin: 2.6 + Math.random() * 1.4 },
      getUp: 0.9 + Math.random() * 0.6,
      flee: { x: s.claim.x, z: s.claim.z },
    });
    if (out) s.actors.push(out);
    // passengers bail out and run
    const crew = CREW[s.claim.typeId] || [];
    for (const [sd, dz, prob] of crew) {
      if (Math.random() >= prob) continue;
      const side = sd * s.side;
      const q = this._local(s, side * (s.halfW + 0.35), s.doorZ + dz + (Math.random() - 0.5) * 0.3);
      const p = T.spawnActor(q.x, y, q.z, Math.atan2(side * s.sin, side * s.cos), crowdLook(app, null, s.police), { flee: { x: app.pos.x, z: app.pos.z } });
      if (p) s.actors.push(p);
    }
    if (T.agents && typeof T.agents.onCarjack === 'function') T.agents.onCarjack(s.claim.x, s.claim.y, s.claim.z, s.actors);
  }

  _finish() {
    const app = this.app, s = this.s;
    this.active = false;
    this.s = null;
    app._claimTrafficCar(s.claim, s.mesh);
  }
}
