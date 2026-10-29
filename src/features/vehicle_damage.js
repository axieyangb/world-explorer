// Vehicle damage & explosions (AI traffic + the player's car).
// HP per car type. States: hit sparks -> smoking -> burning (stops, cooks off) -> EXPLOSION (fireball, shockwave,
// launch + spin, debris, scorch decal, splash damage with capped chain reactions) -> charred wreck (static traffic
// obstacle, ~30 s) -> sinks away; traffic respawns elsewhere. Nearby pedestrians flee.
// Hooks (small, in city_traffic.js): triggerImpactSphere (opts.damage / opts.source), _spawnCar/_spawnPed,
// _updateCar (wreck stop + route around), _updateCars (owned pose), _updatePed (flee), _collidePlayer (ram),
// _writeInstances (spin/char). main.js drive loop: updateDrive() freezes input while the player's car is destroyed.
// FX reuse the pooled Kaiju particles (KaijuFx); sound reuses the shared weapon SFX engine.
import * as THREE from '../../vendor/three.module.js';
import { KaijuFx } from './kaiju/kaiju_fx.js';
import { getWeaponSfx } from './weapon_sfx.js';

// By CAR_TYPES index: sedan, taxi, coupe, police, bus, tesla, cybertruck, ambulance, tow_truck
const CAR_HP = [4, 4, 4, 4.5, 10, 4.5, 8, 8, 10];
const CAR_H = [1.45, 1.45, 1.25, 1.5, 3.1, 1.45, 1.8, 2.7, 2.6]; // roof height (upside-down wreck lift), from the traffic bodies
const BIG = [0, 0, 0, 0, 1, 0, 0, 1, 1];
export const DAMAGE_BY_SOURCE = { cannon: 1, missile: 6, stomp: 30, tail: 30, breath: 30, kaijuBody: 30, train: 30, rocket: 6, heliCannon: 1, carExplosion: 3.5, ram: 2 };
const SMOKE_FRAC = 0.7, BURN_FRAC = 0.4;
const COOK_MIN = 7, COOK_MAX = 11;
const WRECK_LIFE = 30, SINK_TIME = 3, WRECK_FIRE = 18;
const MAX_BURNING_WRECKS = 6, MAX_DEBRIS_SETS = 12, MAX_SCORCH = 16;
const MAX_BOOMS_PER_FRAME = 3, MAX_CHAIN_DEPTH = 3, MAX_THREATS = 8;
const PLAYER_HP = 8, PLAYER_DEAD_T = 3.2;
const GRAV = 18.5;
const CHUNKS = 5, WHEELS = 2;
const rr = (a, b) => a + Math.random() * (b - a);

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(8,6,5,0.85)');
  grd.addColorStop(0.55, 'rgba(14,11,9,0.55)');
  grd.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class VehicleDamage {
  constructor(app, traffic) {
    this.app = app;
    this.T = traffic;
    this.queue = [];
    this.damaged = new Set();
    this.wrecks = [];
    this.threats = [];
    this.stats = { hits: 0, smoking: 0, burning: 0, exploded: 0, wrecks: 0, burningWrecks: 0, chain: 0, maxDepth: 0, debrisSets: 0, despawned: 0, playerDestroyed: 0 };
    this.log = [];
    this._fxSeen = -1;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._dirty = false;
    this.player = { hp: PLAYER_HP, dead: false, t: 0, wreck: null, smokeAcc: 0 };

    // Debris pools: charred chunks (incl. a door panel) + wheels, MAX_DEBRIS_SETS sets.
    const group = new THREE.Group();
    group.name = 'vehicle_damage';
    this.group = group;
    const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.1 });
    this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chunkMat, MAX_DEBRIS_SETS * CHUNKS);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheelMesh = new THREE.InstancedMesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.9 }), MAX_DEBRIS_SETS * WHEELS);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const col = new THREE.Color(0x1a1714);
    for (let i = 0; i < MAX_DEBRIS_SETS * CHUNKS; i++) { this.chunkMesh.setMatrixAt(i, zero); this.chunkMesh.setColorAt(i, col); }
    for (let i = 0; i < MAX_DEBRIS_SETS * WHEELS; i++) this.wheelMesh.setMatrixAt(i, zero);
    for (const m of [this.chunkMesh, this.wheelMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      group.add(m);
    }
    this.sets = [];
    for (let s = 0; s < MAX_DEBRIS_SETS; s++) this.sets.push({ active: false, age: 0, pieces: [] });
    this._setHead = 0;

    // Scorch decals (ring buffer).
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, color: 0xffffff });
    this.scorch = new THREE.InstancedMesh(sg, sm, MAX_SCORCH);
    for (let i = 0; i < MAX_SCORCH; i++) this.scorch.setMatrixAt(i, zero);
    this.scorch.frustumCulled = false;
    this.scorch.renderOrder = 2;
    group.add(this.scorch);
    this._scorchHead = 0;
    this._zero = zero;
    traffic.scene.add(group);
    if (typeof window !== 'undefined') window.__vehicleDamage = this;
  }

  // ------------------------------------------------------------------ helpers
  _fx() {
    const K = this.app.kaiju;
    try {
      if (K) { if (!K.fx) K.fx = new KaijuFx(K); return K.fx; }
      if (!this._ownFx) this._ownFx = new KaijuFx({ app: this.app, scene: this.app.scene, camera: this.app.camera });
      return this._ownFx;
    } catch (_) { return null; }
  }

  _sfx(name, x, y, z, gain) {
    try { getWeaponSfx(this.app).play(name, { pos: this._v.set(x, y, z), gain }); } catch (_) { /* audio optional */ }
  }

  _event(type, c, extra) {
    const e = { t: +(performance.now() / 1000).toFixed(2), type, id: c ? c.id : -1, carType: c ? c.type : -1, hp: c ? +(c.dHp || 0).toFixed(2) : 0 };
    if (extra) Object.assign(e, extra);
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
  }

  onSpawn(c) {
    c.dMax = CAR_HP[c.type] || 4;
    c.dHp = c.dMax;
    c.dState = 0; c.dPose = false; c.dFly = false; c.dChar = 0;
    c.xPitch = 0; c.xRoll = 0; c.xLift = 0;
    c.dAvoidT = 0; c.dPassT = 0; c.dSw = 0;
    c.dSerial = (c.dSerial || 0) + 1;
    if (c.dDrv) { c.dDrv = 0; }
  }

  // ------------------------------------------------------------------ damage
  /** Apply damage to an AI car. Returns true when the car was damaged. */
  hit(c, dmg, x, y, z, src, depth = 0) {
    if (!c || !c.active || c.kWreck || !(dmg > 0)) return false;
    if (c.dHp == null) this.onSpawn(c);
    if (c.dState >= 3) return false;
    c.dHp -= dmg;
    this.stats.hits++;
    const fx = this._fx();
    if (fx && src !== 'carExplosion') fx.spawn('spark', this._v.set(c.x, (c.y || 0) + 1, c.z), { count: 6, scale: 1 });
    const frac = c.dHp / c.dMax;
    const prev = c.dState;
    if (c.dHp <= 0) {
      c.dState = 3;
      this.queue.push({ c, serial: c.dSerial, x, z, depth, src, tq: performance.now() });
    } else if (frac <= BURN_FRAC) c.dState = Math.max(prev, 2);
    else if (frac <= SMOKE_FRAC) c.dState = Math.max(prev, 1);
    if (c.dState !== prev) {
      if (c.dState === 1) { this.stats.smoking++; c.dDrv = c.drv; c.drv *= 0.6; }
      if (c.dState === 2) { this.stats.burning++; c.dCook = rr(COOK_MIN, COOK_MAX); c.dChar = 0.35; }
      if (c.dState <= 2) this.damaged.add(c);
      this._event(['ok', 'smoking', 'burning', 'explode_queued'][c.dState], c, { src });
    }
    return true;
  }

  /** Generic explosion splash damaging traffic cars and player car. */
  applyExplosionSplash(pos, radius, dmg = 4, opts = {}) {
    if (!pos || !(radius > 0)) return;
    const x = pos.x ?? 0, y = pos.y ?? 0, z = pos.z ?? 0;
    if (!opts.noPlayer) this.hitPlayerSphere(x, y, z, radius, dmg > 50 ? 50 : dmg);
    if (this.T && typeof this.T.triggerImpactSphere === 'function') {
      this.T.triggerImpactSphere(x, y, z, radius, {
        damage: dmg > 50 ? 8 : (dmg || 4),
        source: 'explosion',
        force: 1.8,
        noPlayer: opts.noPlayer,
      });
    }
  }

  /** Splash damage to the player's car (drive mode). */
  hitPlayerSphere(x, y, z, r, dmg) {
    const app = this.app;
    if (app.mode !== 'drive' || this.player.dead) return;
    const dx = app.pos.x - x, dz = app.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (d > r || (Number.isFinite(y) && Math.abs(app.pos.y - y) > Math.max(8.5, r))) return;
    this.hitPlayer(dmg * Math.max(0.25, 1 - d / r));
  }

  hitPlayer(dmg) {
    const P = this.player;
    if (this.app.mode !== 'drive' || P.dead || !(dmg > 0)) return;
    P.hp -= dmg;
    this._event('player_hit', null, { hp: +P.hp.toFixed(2) });
    if (P.hp <= 0) this._playerBoom();
  }

  _playerBoom() {
    const app = this.app, P = this.player;
    P.dead = true; P.t = 0;
    this.stats.playerDestroyed++;
    this._event('player_destroyed', null);
    const x = app.pos.x, y = app.pos.y, z = app.pos.z;
    const fx = this._fx();
    if (fx) {
      fx.spawn('explosion', this._v.set(x, y + 1, z), { scale: 1 });
      fx.spawn('dustRing', this._v.set(x, y, z), { scale: 0.5 });
      fx.spawn('debris', this._v.set(x, y + 1, z), { count: 8, scale: 0.6 });
    }
    this._sfx('explosion', x, y, z, 0.9);
    this._scorchAt(x, y, z, 7);
    const mesh = app.vehicleMesh;
    if (mesh) {
      if (!this._charMat) this._charMat = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1, metalness: 0.05 });
      const w = mesh.clone(true);
      w.traverse((o) => { if (o.isMesh) o.material = this._charMat; if (o.isLight) o.visible = false; });
      w.position.copy(mesh.position);
      w.rotation.copy(mesh.rotation);
      w.userData.v = new THREE.Vector3(rr(-2, 2), 9, rr(-2, 2));
      w.userData.spin = new THREE.Vector3(rr(-4, 4), rr(-1.5, 1.5), rr(-5, 5));
      w.userData.gy = mesh.position.y;
      app.scene.add(w);
      P.wreck = w;
      mesh.visible = false;
    }
    app.speed = 0;
    this.T.triggerImpactSphere(x, y, z, 11, { force: 1.7, vy: 6, damage: 3.5, source: 'carExplosion', depth: 1, noPlayer: true });
    this._addThreat(x, z, 45, 4);
  }

  _playerRespawn() {
    const app = this.app, P = this.player;
    P.dead = false; P.hp = PLAYER_HP; P.t = 0;
    if (P.wreck) { app.scene.remove(P.wreck); P.wreck = null; }
    if (app.vehicleMesh) app.vehicleMesh.visible = app.mode === 'drive';
    const fx = this._fx();
    if (fx) fx.spawn('smoke', this._v.set(app.pos.x, app.pos.y + 1, app.pos.z), { count: 3, scale: 0.4, light: true, life: 3 });
    this._event('player_respawn', null);
  }

  /** Called from the drive loop: true while the player's car is destroyed (engine input disabled). */
  updateDrive(dt) {
    const P = this.player;
    if (!P.dead) return false;
    this.app.speed = 0;
    P.t += dt;
    const w = P.wreck;
    if (w) {
      const u = w.userData;
      u.v.y -= GRAV * dt;
      w.position.addScaledVector(u.v, dt);
      if (w.position.y <= u.gy) { w.position.y = u.gy; u.v.set(u.v.x * 0.4, Math.abs(u.v.y) > 4 ? -u.v.y * 0.25 : 0, u.v.z * 0.4); u.spin.multiplyScalar(0.4); }
      w.rotation.x += u.spin.x * dt; w.rotation.y += u.spin.y * dt; w.rotation.z += u.spin.z * dt;
      if (P.t > 1.6) { w.rotation.x *= 0.9; w.rotation.z *= 0.9; }
      const fx = this._fx();
      P.smokeAcc += dt * 8;
      if (fx) while (P.smokeAcc >= 1) { P.smokeAcc -= 1; fx.spawn('fire', this._v.set(w.position.x, w.position.y + 0.8, w.position.z), { scale: 0.5 }); fx.spawn('smoke', this._v.set(w.position.x, w.position.y + 2, w.position.z), { scale: 0.35, speed: 4, life: 5 }); }
    }
    if (P.t >= PLAYER_DEAD_T) this._playerRespawn();
    return true;
  }

  // ------------------------------------------------------------------ explosion
  _boom(ev) {
    const c = ev.c, T = this.T;
    this.damaged.delete(c);
    c.dState = 4; c.kWreck = 1; c.dPose = true; c.dFly = true; c.dChar = 1;
    c.v = 0; c.brake = 0; c.bumpT = 0;
    if (c.dDrv) { c.drv = c.dDrv; c.dDrv = 0; }
    const big = BIG[c.type] === 1;
    const px = c.rx, py = c.ry, pz = c.rz;
    c.dGround = c.y || py;
    let nx = c.rx - ev.x, nz = c.rz - ev.z;
    const l = Math.hypot(nx, nz);
    if (!(l > 0.3)) { const a = Math.random() * 6.283; nx = Math.cos(a); nz = Math.sin(a); } else { nx /= l; nz /= l; }
    const hs = big ? rr(1, 2.5) : rr(2.5, 5);
    c.fvx = nx * hs; c.fvz = nz * hs;
    c.fvy = big ? rr(5, 7) : rr(10, 14);
    c.fwp = rr(-1, 1) * (big ? 1.2 : 4.5);
    c.fwr = rr(-1, 1) * (big ? 1.5 : 6.5);
    c.fwy = rr(-1, 1) * 2.5;
    c.xPitch = 0; c.xRoll = 0; c.xLift = 0;
    c.dWreckT = 0; c.dFire = true; c.dFireAcc = 0; c.dSmokeAcc = 0;
    this.wrecks.push(c);
    let burning = 0;
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      if (!w.dFire) continue;
      if (++burning > MAX_BURNING_WRECKS) w.dFire = false;
    }
    this.stats.exploded++;
    if (ev.depth > 0) this.stats.chain++;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, ev.depth);
    this._event('explode', c, { depth: ev.depth, src: ev.src, delayMs: Math.round(performance.now() - ev.tq) });

    const fx = this._fx();
    if (fx) {
      const p = this._v.set(px, py + 1.1, pz);
      fx.spawn(big ? 'bigExplosion' : 'explosion', p, { scale: big ? 0.75 : 0.9 });
      fx.spawn('dustRing', this._v.set(px, py, pz), { scale: big ? 0.7 : 0.5 });
      fx.spawn('spark', this._v.set(px, py + 1, pz), { count: 18, scale: 1.2 });
      fx.spawn('debris', this._v.set(px, py + 1, pz), { count: big ? 12 : 8, scale: 0.6 });
    }
    this._sfx('explosion', px, py, pz, big ? 0.95 : 0.8);
    if (this.app.collision) {
      const cam = this.app.camera;
      const d = cam ? Math.hypot(cam.position.x - px, cam.position.y - py, cam.position.z - pz) : 50;
      if (d < 80) this.app.collision.shake = Math.min(1, Math.max(this.app.collision.shake || 0, (1 - d / 80) * (big ? 0.7 : 0.45)));
    }
    if (this.app.kaiju && typeof this.app.kaiju.shake === 'function') {
      this.app.kaiju.shake(big ? 0.55 : 0.35, px, py, pz);
    }
    this._spawnDebris(c, px, py, pz, nx, nz);
    this._scorchAt(px, py, pz, big ? 10 : 7);
    this._addThreat(px, pz, 45, 4);
    const K = this.app.kaiju;
    if (K && K.active && K.crowd && K.crowd.addThreat) K.crowd.addThreat(px, pz, 45, 4);
    const R = big ? 14 : 11;
    T.triggerImpactSphere(px, py, pz, R, {
      force: big ? 2.0 : 1.7, vy: 6,
      damage: ev.depth < MAX_CHAIN_DEPTH ? (big ? 5 : 3.5) : 0,
      source: 'carExplosion', depth: ev.depth + 1, skip: c,
    });
  }

  _scorchAt(x, y, z, size) {
    const i = this._scorchHead;
    this._scorchHead = (i + 1) % MAX_SCORCH;
    this._q.setFromAxisAngle(this._d.set(0, 1, 0), Math.random() * 6.283);
    this._m.compose(this._v.set(x, y + 0.06, z), this._q, this._s.set(size, 1, size));
    this.scorch.setMatrixAt(i, this._m);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  _spawnDebris(c, x, y, z, nx, nz) {
    const s = this.sets[this._setHead];
    const si = this._setHead;
    this._setHead = (this._setHead + 1) % MAX_DEBRIS_SETS;
    s.active = true; s.age = 0; s.gy = c.dGround; s.pieces.length = 0;
    const paint = c.paint;
    for (let k = 0; k < CHUNKS + WHEELS; k++) {
      const wheel = k >= CHUNKS;
      const door = k === 0;
      const a = Math.random() * 6.283;
      const sp = rr(4, 11);
      const p = {
        mesh: wheel ? this.wheelMesh : this.chunkMesh,
        idx: wheel ? si * WHEELS + (k - CHUNKS) : si * CHUNKS + k,
        x: x + rr(-1, 1), y: y + rr(0.6, 1.4), z: z + rr(-1, 1),
        vx: Math.cos(a) * sp + nx * 2, vy: rr(7, 15), vz: Math.sin(a) * sp + nz * 2,
        rx: 0, ry: 0, rz: 0, wx: rr(-9, 9), wy: rr(-6, 6), wz: rr(-9, 9),
        sx: wheel ? 1 : door ? 1.1 : rr(0.4, 0.9), sy: wheel ? 1 : door ? 0.9 : rr(0.15, 0.4), sz: wheel ? 1 : door ? 0.08 : rr(0.4, 0.8),
        rest: false,
      };
      if (!wheel) {
        const col = door && paint ? this._d.set(paint.r * 0.35, paint.g * 0.35, paint.b * 0.35) : this._d.set(0.1, 0.09, 0.08);
        this.chunkMesh.setColorAt(p.idx, new THREE.Color(col.x, col.y, col.z));
        this.chunkMesh.instanceColor.needsUpdate = true;
      }
      s.pieces.push(p);
    }
    let n = 0;
    for (const st of this.sets) if (st.active) n++;
    this.stats.debrisSets = n;
  }

  _updateDebris(dt) {
    let any = false;
    for (const s of this.sets) {
      if (!s.active) continue;
      s.age += dt;
      const sink = s.age > 12 ? (s.age - 12) * 0.6 : 0;
      const done = s.age > 14;
      for (const p of s.pieces) {
        if (done) { p.mesh.setMatrixAt(p.idx, this._zero); continue; }
        if (!p.rest) {
          p.vy -= GRAV * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
          const floor = s.gy + p.sy * 0.3;
          if (p.y <= floor) {
            p.y = floor;
            if (p.vy < -3) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5; }
            else { p.rest = true; p.rx = Math.round(p.rx / Math.PI) * Math.PI; p.rz = Math.round(p.rz / Math.PI) * Math.PI; }
          }
        }
        this._e.set(p.rx, p.ry, p.rz);
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(p.x, p.y - sink, p.z), this._q, this._s.set(p.sx, p.sy, p.sz));
        p.mesh.setMatrixAt(p.idx, this._m);
      }
      if (done) s.active = false;
      any = true;
    }
    if (any) { this.chunkMesh.instanceMatrix.needsUpdate = true; this.wheelMesh.instanceMatrix.needsUpdate = true; }
    if (any) { let n = 0; for (const st of this.sets) if (st.active) n++; this.stats.debrisSets = n; }
  }

  // ------------------------------------------------------------------ traffic hooks
  /** Car blocked behind a wreck / burning car: change lane, or squeeze past on a single-lane road. */
  avoid(c, dt) {
    c.dAvoidT = (c.dAvoidT || 0) + dt;
    if (c.dAvoidT < 1.5) return;
    c.dAvoidT = 0;
    const de = c.de;
    if (de && de.nLanes > 1) {
      c.lane = c.lane > 0 ? c.lane - 1 : c.lane + 1;
      this._event('lane_change', c);
    } else {
      c.dPassT = 5;
      this._event('pass_wreck', c);
    }
  }

  /** After the normal lane pose: lateral offset while squeezing past a wreck. */
  postPose(c, dt) {
    if (c.dPassT > 0) c.dPassT -= dt;
    const want = c.dPassT > 0 ? 2.8 : 0;
    const sw = c.dSw || 0;
    if (want === 0 && Math.abs(sw) < 0.01) { c.dSw = 0; return; }
    c.dSw = sw + (want - sw) * Math.min(1, dt * 2.5);
    const side = this.T.lht ? 1 : -1; // toward the road center
    c.x += -c.uz * c.dSw * side; c.z += c.ux * c.dSw * side;
  }

  _addThreat(x, z, r, t) {
    if (this.threats.length >= MAX_THREATS) this.threats.shift();
    this.threats.push({ x, z, r, t });
  }

  /** Pedestrian flee from recent explosions (outside Kaiju Defense, which has its own panic). */
  ped(p, dt) {
    if (this.T.kaiju) return false;
    if (!(p.dFlee > 0)) {
      if (!this.threats.length) return false;
      let hit = null;
      for (const th of this.threats) {
        const dx = p.x - th.x, dz = p.z - th.z;
        if (dx * dx + dz * dz < th.r * th.r) { hit = th; break; }
      }
      if (!hit) return false;
      let hx = p.x - hit.x, hz = p.z - hit.z;
      const l = Math.hypot(hx, hz) || 1;
      const j = rr(-0.5, 0.5), cj = Math.cos(j), sj = Math.sin(j);
      p.dHx = (hx / l) * cj - (hz / l) * sj; p.dHz = (hx / l) * sj + (hz / l) * cj;
      p.dFlee = rr(3, 5); p.dSpd = rr(3.6, 4.8);
      p.crossState = 0;
    }
    p.dFlee -= dt;
    if (p.dFlee <= 0) {
      if (!this.T._visible(p.x, p.y, p.z, 2)) { p.active = false; return true; }
      p.dFlee = 1.5;
    }
    const v = p.dSpd || 4;
    p.x += p.dHx * v * dt; p.z += p.dHz * v * dt;
    p.hx = p.dHx; p.hz = p.dHz;
    p.phase += dt * v * 3.4;
    p.amp += (0.95 - p.amp) * Math.min(1, dt * 6);
    let dy = Math.atan2(p.dHx, p.dHz) - p.ryaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    p.ryaw += dy * Math.min(1, dt * 10);
    return true;
  }

  reset() {
    this.queue.length = 0;
    this.damaged.clear();
    this.wrecks.length = 0;
    this.threats.length = 0;
    for (const s of this.sets) { if (s.active) for (const p of s.pieces) p.mesh.setMatrixAt(p.idx, this._zero); s.active = false; }
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < MAX_SCORCH; i++) this.scorch.setMatrixAt(i, this._zero);
    this.scorch.instanceMatrix.needsUpdate = true;
    if (this.player.dead) this._playerRespawn();
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!(dt > 0)) return;
    const fx = this._fx();
    if (fx) {
      if (fx.time === this._fxSeen) { try { fx.update(dt); } catch (_) { /* fx optional */ } }
      this._fxSeen = fx.time;
    }
    if (this.player.dead && this.app.mode !== 'drive') this._playerRespawn();
    // player car damage smoke
    const P = this.player;
    if (!P.dead && P.hp < PLAYER_HP * SMOKE_FRAC && this.app.mode === 'drive' && fx) {
      P.smokeAcc += dt * (P.hp < PLAYER_HP * BURN_FRAC ? 8 : 4);
      const a = this.app;
      while (P.smokeAcc >= 1) {
        P.smokeAcc -= 1;
        const hx = a.pos.x + Math.sin(a.yaw) * 1.6, hz = a.pos.z + Math.cos(a.yaw) * 1.6;
        fx.spawn('smoke', this._v.set(hx, a.pos.y + 1.3, hz), { scale: 0.25, speed: 3, life: 4 });
        if (P.hp < PLAYER_HP * BURN_FRAC) fx.spawn('fire', this._v.set(hx, a.pos.y + 1.1, hz), { scale: 0.3 });
      }
    }

    for (let i = this.threats.length - 1; i >= 0; i--) { this.threats[i].t -= dt; if (this.threats[i].t <= 0) this.threats.splice(i, 1); }

    // queued explosions (capped per frame -> natural chain-reaction stagger)
    let n = 0;
    while (this.queue.length && n < MAX_BOOMS_PER_FRAME) {
      const ev = this.queue.shift();
      if (!ev.c.active || ev.c.dSerial !== ev.serial || ev.c.dState !== 3) continue;
      this._boom(ev);
      n++;
    }

    // damaged (smoking / burning) cars
    let smoking = 0, burning = 0;
    for (const c of this.damaged) {
      if (!c.active || c.dState < 1 || c.dState > 2) { this.damaged.delete(c); continue; }
      if (c.dState === 2) {
        burning++;
        c.dCook -= dt;
        if (c.dCook <= 0) { c.dState = 3; c.dHp = 0; this.queue.push({ c, serial: c.dSerial, x: c.x, z: c.z, depth: 0, src: 'cookoff', tq: performance.now() }); continue; }
      } else smoking++;
      if (!fx) continue;
      const hood = c.len * 0.32;
      const x = c.rx + c.ux * hood, z = c.rz + c.uz * hood, y = c.ry + 1.2;
      c.dSmokeAcc = (c.dSmokeAcc || 0) + dt * (c.dState === 2 ? 6 : 4);
      while (c.dSmokeAcc >= 1) { c.dSmokeAcc -= 1; fx.spawn('smoke', this._v.set(x, y + 0.4, z), { scale: c.dState === 2 ? 0.32 : 0.2, speed: 3, life: c.dState === 2 ? 6 : 4, light: c.dState === 1 && Math.random() < 0.4 }); }
      if (c.dState === 2) {
        c.dFireAcc = (c.dFireAcc || 0) + dt * 10;
        while (c.dFireAcc >= 1) { c.dFireAcc -= 1; fx.spawn('fire', this._v.set(x, y - 0.2, z), { scale: 0.3 }); }
      }
    }
    this.stats.smokingNow = smoking;
    this.stats.burningNow = burning;

    // flying + wrecks
    let bw = 0, w = 0;
    for (let i = 0; i < this.wrecks.length; i++) {
      const c = this.wrecks[i];
      if (!c.active || !c.kWreck || !c.dPose) { c.dPose = false; c.dFly = false; this.stats.despawned++; continue; }
      c.dWreckT += dt;
      if (c.dFly) {
        c.fvy -= GRAV * dt;
        c.rx += c.fvx * dt; c.ry += c.fvy * dt; c.rz += c.fvz * dt;
        c.xPitch += c.fwp * dt; c.xRoll += c.fwr * dt; c.ryaw += c.fwy * dt;
        if (c.ry <= c.dGround && c.fvy < 0) {
          c.ry = c.dGround;
          if (c.fvy < -4) {
            c.fvy *= -0.25; c.fvx *= 0.45; c.fvz *= 0.45; c.fwp *= 0.35; c.fwr *= 0.35; c.fwy *= 0.4;
            if (fx) fx.spawn('dustRing', this._v.set(c.rx, c.ry, c.rz), { scale: 0.25, count: 10 });
          } else {
            c.dFly = false;
            c.dRollT = Math.round(c.xRoll / Math.PI) * Math.PI + rr(-0.06, 0.06);
            c.dPitchT = Math.round(c.xPitch / (Math.PI * 2)) * Math.PI * 2 + rr(-0.05, 0.05);
            c.dUpside = Math.abs(Math.round(c.dRollT / Math.PI)) % 2 === 1;
            c.x = c.rx; c.z = c.rz; c.y = c.dGround;
            c.ux = Math.sin(c.ryaw); c.uz = Math.cos(c.ryaw);
            c.kxOff = 0; c.kzOff = 0; c.kyOff = 0; c.kvx = 0; c.kvz = 0; c.kvy = 0; c.kyawVel = 0;
            this._event('landed', c, { upside: c.dUpside, flightS: +c.dWreckT.toFixed(2) });
          }
        }
      } else {
        const k = Math.min(1, dt * 6);
        c.xRoll += (c.dRollT - c.xRoll) * k;
        c.xPitch += (c.dPitchT - c.xPitch) * k;
        c.xLift += ((c.dUpside ? CAR_H[c.type] || 1.5 : 0) - c.xLift) * k;
        if (c.dWreckT > WRECK_LIFE) {
          const s = c.dWreckT - WRECK_LIFE;
          c.ry = c.dGround - (s / SINK_TIME) * 2.2;
          if (s >= SINK_TIME) {
            c.active = false; c.dPose = false; c.kWreck = 0;
            this.stats.despawned++;
            this._event('despawn', c);
            continue;
          }
        }
      }
      if (c.dFire && c.dWreckT > WRECK_FIRE) c.dFire = false;
      if (fx && c.dWreckT < WRECK_LIFE) {
        const big = BIG[c.type] === 1;
        const top = c.ry + (c.dUpside ? 0.6 : 1.1);
        if (c.dFire) {
          bw++;
          c.dFireAcc += dt * (big ? 10 : 7);
          while (c.dFireAcc >= 1) { c.dFireAcc -= 1; fx.spawn('fire', this._v.set(c.rx + rr(-0.6, 0.6), top, c.rz + rr(-0.6, 0.6)), { scale: big ? 0.75 : 0.5 }); }
        }
        c.dSmokeAcc += dt * (c.dFire ? 4 : 1.2);
        while (c.dSmokeAcc >= 1) { c.dSmokeAcc -= 1; fx.spawn('smoke', this._v.set(c.rx, top + 1.5, c.rz), { scale: c.dFire ? 0.42 : 0.25, speed: 4, life: c.dFire ? 7 : 4, light: !c.dFire }); }
      }
      this.wrecks[w++] = c;
    }
    this.wrecks.length = w;
    this.stats.wrecks = w;
    this.stats.burningWrecks = bw;
    this._updateDebris(dt);
  }
}
