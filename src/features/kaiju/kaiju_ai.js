// Kaiju Defense: the creature. State machine, movement, attacks, hit volumes, HP. See DESIGN.md.
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
import { getBeijingTerrainElevation } from "../../environment.js";
import { KaijuModel, BreathBeam, LaserBeam, NOMINAL_HEIGHT, PALETTES } from "./kaiju_model.js";
import { densestBuildingCell } from "./kaiju_spawn.js";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const ROAR_SECONDS = 2.6;
const FLINCH_SECONDS = 0.7;
const SWIPE_SECONDS = 1.6;
const SWIPE_ANGLE = 270 * DEG;
const STRIDE_A = 0.28; // must match KaijuModel.applyPose
const LEG_LEN = 27;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _water = new THREE.Color(0xbfd8e8);
const _dust = new THREE.Color(0x8a7d6a);

function wrap(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function ground(x, z) {
  const y = getBeijingTerrainElevation(x, z);
  return Number.isFinite(y) ? y : 0;
}
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Kaiju {
  constructor(K) {
    this.K = K;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.maxHp = CFG.KAIJU_HP;
    this.hp = this.maxHp;
    this.alive = false;
    this.state = "idle";
    this.enraged = false;
    this.height = 70;
    this.scale = 1;
    this.breathCharge = 0;
    this.breathActive = false;
    this.breathDir = new THREE.Vector3(0, 0, 1);
    this.breathOrigin = new THREE.Vector3();
    this.rising = false;
    this.hitSpheres = [];
    this.model = null;
    this.beam = null;
    this.light = null;
    this.time = 0;
    this.stateT = 0;
    this.target = new THREE.Vector3();
    this._lock = new THREE.Vector3();
    this._bound = new THREE.Vector3();
    this._boundR = 0;
    this._dmgB = new Float32Array(10); // damage per 1 s bucket, last 10 s
    this._dmgSec = 0;
    // laser + aggro (HUD / radar read `aggro` and `laser`; objects are reused)
    this.aggro = false;
    this.laser = { phase: "idle", t: 0, charge: 0, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), length: 0, frozen: false };
    this.laserBeam = null;
    this.nextLaser = Infinity;
    this._lastHitT = -1e9;
    this._hv = new THREE.Vector3(); // heli velocity (finite difference)
    this._hPrev = new THREE.Vector3();
    this._hPrevOk = false;
    this._lzBase = new THREE.Vector3(); // frozen aim
    this._lzTargetPt = new THREE.Vector3();
    this._lzEnd = new THREE.Vector3();
    this._lzOffY = 0;
    this._lzOffP = 0;
    this._lzTick = 0;
    this._lzBoom = 0;
    this._lzBeep = 0;
    this._lzHandle = null;
    this.breathLen = CFG.BREATH_RANGE;
    this.breathAimed = false;
    this.inDanger = false; // heli inside dangerRadius (HUD)
    this.dangerRadius = CFG.AGGRO_RADIUS;
    this.stunned = false;
    this.stunTime = 0;
    this.pose = {
      t: 0, walkPhase: 0, walkAmt: 0, crouch: 0, lean: 0, headYaw: 0, headPitch: 0, jaw: 0, roar: 0, charge: 0, breath: 0,
      flinch: 0, flinchSide: 1, death: 0, tailSway: 1, tailBend: 0, tailLift: 0,
    };
  }

  // ------------------------------------------------------------------ lifecycle
  spawn(o) {
    this._teardown();
    const K = this.K;
    const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this.palette = pal;
    this.height = rand(CFG.KAIJU_HEIGHT_MIN, CFG.KAIJU_HEIGHT_MAX);
    this.scale = (this.height / NOMINAL_HEIGHT) * (o.scale || 1.0);
    this.model = new KaijuModel(pal);
    this.model.group.scale.setScalar(this.scale);
    this.beam = new BreathBeam(pal);
    K.scene?.add(this.model.group);
    K.scene?.add(this.beam.object);
    this.laserBeam = new LaserBeam(pal); // stays in the scene (scaled to ~0) so its shader compiles at spawn
    K.scene?.add(this.laserBeam.object);
    this.hitSpheres = this.model.hitDefs.map((d) => ({ center: new THREE.Vector3(), radius: d.r * this.scale, weak: d.weak, name: d.name }));
    this._coreIdx = this.hitSpheres.findIndex((h) => h.name === "core");

    this.position.set(o.x, ground(o.x, o.z), o.z);
    const p = this._heli();
    this.target.set(o.targetX ?? p?.x ?? o.x, 0, o.targetZ ?? p?.z ?? o.z);
    this.yaw = Math.atan2(this.target.x - o.x, this.target.z - o.z);
    this.fromWater = !!o.fromWater;
    this.maxHp = o.maxHp || CFG.KAIJU_MAX_HP;
    this.hp = this.maxHp;
    this.alive = true;
    this.enraged = false;
    this.deathCalled = false;
    this.breathActive = false;
    this.breathCharge = 0;
    this.time = 0;
    this._dmgB.fill(0);
    this._dmgSec = 0;
    Object.assign(this.pose, { walkPhase: 0, walkAmt: 0, crouch: 0, lean: 0, headYaw: 0, headPitch: -0.3, jaw: 0, roar: 0, charge: 0, breath: 0, flinch: 0, death: 0, tailBend: 0, tailLift: 0 });
    this.nextBreath = rand(2.5, 4.5);
    this.tailCd = 3;
    this.bodyT = 0;
    this.threatT = 0;
    this.fxT = 0;
    this.targetT = 0;
    this.chaseT = 0;
    this.flinchT = 0;
    this.fade = 1;
    this.deathRoll = 0;
    this.landed = false;
    this.pendingRoar = false;
    this.aggro = false;
    this.inDanger = false;
    this.stunned = false;
    this.stunTime = 0;
    this.nextLaser = Infinity;
    this._lastHitT = -1e9;
    this._hPrevOk = false;
    this._hv.set(0, 0, 0);
    this._endLaser(false);
    this._enter("rising");
    this.rising = true;
    this.model.setEnraged(0);
    this.laserBeam.setColor(this.model.PU.uGlow.value);
    this._applyTransforms(0);
  }

  dispose() {
    this._teardown();
    this.alive = false;
    this.state = "idle";
  }

  _teardown() {
    this._stopBreathAudio();
    this._stopLaserAudio();
    this.breathActive = false;
    this.laser.phase = "idle";
    if (this.model) { this.model.dispose(); this.model = null; }
    if (this.beam) { this.beam.dispose(); this.beam = null; }
    if (this.laserBeam) { this.laserBeam.dispose(); this.laserBeam = null; }
    if (this.light) { this.light.parent?.remove(this.light); this.light.dispose?.(); this.light = null; }
    this.hitSpheres = [];
  }

  // jump to the end of the emergence (debug skipIntro)
  skipRise() {
    if (this.state !== "rising") return;
    this.rising = false;
    this.pose.headPitch = 0;
    this.pose.jaw = 0;
    this._enter("walk");
    this._applyTransforms(0);
  }

  forceHp(v) {
    this.hp = clamp(v, 0, this.maxHp);
    this._checkHp();
  }

  // ------------------------------------------------------------------ damage
  takeDamage(amount, point, weak, opts) {
    if (!this.alive || !this.model || !(amount > 0)) return;
    if (this.stunned) amount *= CFG.STUN_DAMAGE_MULT;
    this.hp = Math.max(0, this.hp - amount);
    if (amount >= CFG.KAIJU_STAGGER_DAMAGE && this.laser.phase === "lock") {
      this._endLaser(false);
      this.nextLaser = 2;
    }
    this._lastHitT = this.time;
    if (!this.aggro) {
      this.aggro = true;
      this.nextLaser = Math.min(this.nextLaser, CFG.LASER_FIRST_DELAY);
    }
    this._rollDmg();
    this._dmgB[this._dmgSec % 10] += amount;
    // flash the part nearest the hit
    let best = -1, bd = Infinity;
    if (point) {
      for (let i = 0; i < this.hitSpheres.length; i++) {
        const h = this.hitSpheres[i];
        const d = h.center.distanceToSquared(point) / (h.radius * h.radius);
        if (d < bd) { bd = d; best = i; }
      }
    }
    const m = this.model;
    if (best >= 0) {
      const h = this.hitSpheres[best], def = m.hitDefs[best];
      if (h.weak) {
        const n = h.name;
        const k = n === "plate1" ? "x" : n === "plate2" ? "y" : n === "plate3" ? "z" : "w";
        m.weakFlash[k] = 1;
      } else {
        m.U.uFlashBone.value = m.boneIndex(def.bone);
        m.flash = Math.min(1, 0.35 + amount / 300);
      }
    }
    if (amount >= 200 && this.state !== "dying" && this.state !== "dead" && this.state !== "rising") {
      this.flinchT = FLINCH_SECONDS;
      if (point) {
        _a.copy(point).sub(this.position);
        this.pose.flinchSide = Math.sin(this.yaw) * _a.z - Math.cos(this.yaw) * _a.x > 0 ? -1 : 1;
      }
      if (this.state === "walk") this._enter("flinch");
      else if (this.state === "stunned") this.flinchT = 0;
    }
    this._checkHp();
  }

  _rollDmg() {
    const sec = Math.floor(this.time);
    if (sec - this._dmgSec >= 10) this._dmgB.fill(0);
    else while (this._dmgSec < sec) { this._dmgSec++; this._dmgB[this._dmgSec % 10] = 0; }
    this._dmgSec = sec;
  }

  _recentDamage() {
    this._rollDmg();
    let s = 0;
    for (let i = 0; i < 10; i++) s += this._dmgB[i];
    return s;
  }

  _checkHp() {
    if (!this.alive) return;
    if (this.hp <= 0) { this._die(); return; }
    if (!this.enraged && this.hp < this.maxHp * CFG.KAIJU_ENRAGE_FRACTION) {
      this.enraged = true;
      this.model?.setEnraged(1);
      if (this.model) this.laserBeam?.setColor(this.model.PU.uGlow.value);
      if (this.state === "walk" || this.state === "flinch") this._enter("roar");
      else this.pendingRoar = true;
    }
  }

  _die() {
    this.alive = false;
    this.hp = 0;
    this._endBreath();
    this._endLaser(false);
    if (this.stunned) { this.stunned = false; this.stunTime = 0; this.model?.setStun?.(0); }
    this.deathSide = Math.random() < 0.5 ? -1 : 1;
    this._enter("dying");
    if (!this.deathCalled) {
      this.deathCalled = true;
      this.K.onKaijuDeath?.(this);
    }
    this.K.audio?.play?.("roar", { pos: this.position, gain: 1.0 });
  }

  // ------------------------------------------------------------------ queries
  raycast(origin, dir, maxDist) {
    if (!this.model || this.state === "dead") return null;
    // broad phase
    _c.copy(origin).sub(this._bound);
    const bb = _c.dot(dir), bc = _c.lengthSq() - this._boundR * this._boundR;
    if (bc > 0 && (bb > 0 || bb * bb - bc < 0)) return null;
    let best = maxDist, bi = -1;
    const hs = this.hitSpheres;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      const ox = origin.x - h.center.x, oy = origin.y - h.center.y, oz = origin.z - h.center.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - h.radius * h.radius;
      if (c > 0 && b > 0) continue;
      const disc = b * b - c;
      if (disc < 0) continue;
      let t = -b - Math.sqrt(disc);
      if (t < 0) t = 0;
      if (t < best) { best = t; bi = i; }
    }
    if (bi < 0) return null;
    const h = hs[bi];
    return { dist: best, point: new THREE.Vector3().copy(dir).multiplyScalar(best).add(origin), weak: h.weak, name: h.name };
  }

  // chest core world position (internal vector, updated each frame; do not mutate)
  getLockPoint() {
    return this._lock;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.model) return;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.stateT += dt;
    const P = this.pose;
    if (this.state !== "stunned") P.t = this.time; // stun holds the pose
    this.tailCd -= dt;
    this._trackHeliVel(dt);
    this._updateDanger();
    if (this.aggro && this.state !== "laser" && this.time - this._lastHitT > CFG.LASER_AGGRO_DECAY) {
      this.aggro = false;
      this.nextLaser = Infinity;
    }
    if (this.aggro && (this.state === "walk" || this.state === "flinch")) this.nextLaser -= this.inDanger ? dt / CFG.LASER_INTERVAL_NEAR_MULT : dt;

    switch (this.state) {
      case "rising": this._rising(dt); break;
      case "roar": this._roar(dt); break;
      case "walk": this._walkState(dt); break;
      case "flinch": this._walkCore(dt, 0.3); if (this.stateT >= FLINCH_SECONDS) this._enter("walk"); break;
      case "tailSwipe": this._tailSwipe(dt); break;
      case "breathCharge": this._breathCharge(dt); break;
      case "breath": this._breath(dt); break;
      case "laser": this._laserState(dt); break;
      case "stunned": this._stunState(dt); break;
      case "dying": this._dying(dt); break;
      default: break;
    }

    // overlays
    this.flinchT = Math.max(0, this.flinchT - dt);
    P.flinch = this.flinchT > 0 ? Math.sin(Math.PI * (1 - this.flinchT / FLINCH_SECONDS)) : 0;
    if (this.state !== "breath" && this.state !== "breathCharge" && this.state !== "laser" && this.state !== "stunned" && this.state !== "dying" && this.state !== "dead") this._trackHead(dt);

    this._applyTransforms(dt);
    this._laserPost(dt);

    if (this.state !== "dead" && this.state !== "dying" && this.state !== "stunned") this._periodic(dt);
  }

  _enter(s) {
    this.state = s;
    this.stateT = 0;
    this.tickT = 0;
    const K = this.K;
    if (s === "roar") {
      K.audio?.play?.("roar", { pos: this.position });
      K.shake?.(0.45, this.position.x, this.position.y + this.height * 0.8, this.position.z);
    }
  }

  _heli() {
    return this.K.getHeliPos?.() || this.K.app?.pos || null;
  }

  // ------------------------------------------------------------------ states
  _rising(dt) {
    const K = this.K, P = this.pose;
    const u = Math.min(1, this.stateT / CFG.RISE_SECONDS);
    P.walkAmt = 0;
    P.headPitch = -0.35 * (1 - u);
    P.tailSway = 0.6;
    P.jaw = 0.25 * Math.sin(u * 9) * (1 - u);
    this.fxT -= dt;
    if (this.fxT <= 0 && u < 0.97) {
      this.fxT = 0.28;
      const s = this.scale;
      _a.set(this.position.x + rand(-12, 12) * s, ground(this.position.x, this.position.z) + 1, this.position.z + rand(-12, 12) * s);
      if (this.fromWater) {
        K.fx?.spawn?.("dustRing", _a, { scale: 3 * s, color: _water });
        _a.y += 8 * s;
        K.fx?.spawn?.("smoke", _a, { count: 14, scale: 3.5 * s, color: _water, speed: 18, light: true, life: 4 });
        K.fx?.spawn?.("spark", _a, { count: 10, scale: 2 * s, color: _water, speed: 30 });
      } else {
        K.fx?.spawn?.("dust", _a, { count: 18, scale: 4 * s, color: _dust });
        K.fx?.spawn?.("debris", _a, { count: 8, scale: 2 * s, speed: 22 });
      }
      if (Math.random() < 0.5) K.shake?.(0.45, this.position.x, this.position.y, this.position.z);
    }
    if (u >= 1) {
      this.rising = false;
      this._enter("roar");
    }
  }

  _roar(dt) {
    const P = this.pose;
    const t = this.stateT;
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 3);
    P.roar = clamp(t / 0.45, 0, 1) * clamp((ROAR_SECONDS - t) / 0.5, 0, 1);
    P.tailLift = P.roar;
    if (t >= ROAR_SECONDS) { P.roar = 0; P.tailLift = 0; this._enter("walk"); }
  }

  _walkState(dt) {
    if (this.pendingRoar) { this.pendingRoar = false; this._enter("roar"); return; }
    this._walkCore(dt, 1);
    if (this.nextLaser <= 0 && CFG.LASER_ENABLED) {
      if (this._canLaser()) { this._startLaser(); return; }
      this.nextLaser = 0.5;
    }
    this.nextBreath -= this.inDanger ? dt / CFG.LASER_INTERVAL_NEAR_MULT : dt;
    if (this.nextBreath <= 0) { this._startCharge(); return; }
    if (this.tailCd <= 0 && this._heliBehind()) this._startSwipe();
  }

  _walkCore(dt, speedMul) {
    const P = this.pose;
    this._updateTarget(dt);
    const desired = Math.atan2(this.target.x - this.position.x, this.target.z - this.position.z);
    P.jaw += (0 - P.jaw) * Math.min(1, dt * 3);
    const dy = wrap(desired - this.yaw);
    const rate = 0.65 * (this.enraged ? 1.35 : 1);
    this.yaw = wrap(this.yaw + clamp(dy, -rate * dt, rate * dt));
    const want = (Math.abs(dy) > 1.2 ? 0.5 : 1) * speedMul;
    P.walkAmt += (want - P.walkAmt) * Math.min(1, dt * 0.8);
    P.tailSway = 1;
    P.tailBend += (clamp(-dy, -1, 1) * 0.5 - P.tailBend) * Math.min(1, dt * 0.8);
    this._locomote(dt);
  }

  // advances walk phase, moves forward with stride-matched speed, emits footfalls
  _locomote(dt) {
    const P = this.pose;
    const wa = P.walkAmt;
    if (wa < 0.02) return;
    const s = this.scale;
    const speed = CFG.KAIJU_WALK_SPEED * s * (this.enraged ? CFG.KAIJU_ENRAGE_SPEED_MULT : 1) * wa;
    const cycle = 4 * LEG_LEN * Math.sin(STRIDE_A * Math.max(0.35, wa)) * s; // body travel per full gait cycle
    const prev = P.walkPhase;
    P.walkPhase += (speed / cycle) * dt;
    const crossed = Math.floor(P.walkPhase * 2) !== Math.floor(prev * 2);
    if (P.walkPhase >= 1) P.walkPhase -= 1;
    this.position.x += Math.sin(this.yaw) * speed * dt;
    this.position.z += Math.cos(this.yaw) * speed * dt;
    const gy = ground(this.position.x, this.position.z);
    this.position.y += (gy - this.position.y) * Math.min(1, dt * 4);
    if (crossed && wa > 0.25) this._footfall(P.walkPhase < 0.5 ? 0 : 1);
  }

  _footfall(leg) {
    const K = this.K, s = this.scale;
    this.model.group.updateMatrixWorld(true);
    const p = this.model.anchorWorld(this.model.soles[leg], _b);
    p.y = ground(p.x, p.z);
    K.shake?.(0.6, p.x, p.y, p.z);
    K.fx?.spawn?.("dustRing", p, { scale: 1.6 * s, color: _dust });
    K.fx?.spawn?.("dust", p, { count: 10, scale: 2.2 * s, color: _dust });
    K.fx?.addDecal?.(p.x, p.z, this.yaw, s);
    K.audio?.play?.("footstep", { pos: p });
    K.destruction?.damageSphere?.(p.x, p.y, p.z, CFG.STOMP_RADIUS * s, 1.0, { source: "stomp" });
    K.supply?.hazard?.(p.x, p.z, CFG.STOMP_RADIUS * s);
    K.app?.traffic?.triggerImpactSphere?.(p.x, p.y, p.z, Math.max(32, CFG.STOMP_RADIUS * s), { force: 1.6, source: "stomp" });
    K.crowd?.addThreat?.(p.x, p.z, 160 * s, 6);
  }

  _updateTarget(dt) {
    const K = this.K;
    this.targetT -= dt;
    const dx = this.target.x - this.position.x, dz = this.target.z - this.position.z;
    const near = dx * dx + dz * dz < (38 * this.scale) ** 2;
    if (this.targetT > 0 && !near) return;
    this.targetT = 4.0;
    let t = K.destruction?.getDensestTarget?.(this.position.x, this.position.z) || null;
    if (!t || (t.x - this.position.x) ** 2 + (t.z - this.position.z) ** 2 < (24 * this.scale) ** 2) {
      t = densestBuildingCell(K.app, this.position.x, this.position.z, 35 * this.scale);
    }
    if (t) this.target.set(t.x, 0, t.z);
    else {
      const a = this.yaw + rand(-0.7, 0.7);
      this.target.set(this.position.x + Math.sin(a) * 260, 0, this.position.z + Math.cos(a) * 260);
    }
  }

  _trackHead(dt) {
    const P = this.pose, h = this._heli();
    let ty = 0, tp = 0;
    if (h) {
      const dx = h.x - this.position.x, dz = h.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < (this.aggro ? CFG.LASER_RANGE : 1400)) {
        ty = clamp(wrap(Math.atan2(dx, dz) - this.yaw), -0.9, 0.9);
        tp = clamp(-Math.atan2(h.y - (this.position.y + this.height * 0.88), Math.max(1, d)), -0.6, 0.45);
      }
    }
    if (this.state === "rising") return;
    const k = Math.min(1, dt * 1.6);
    P.headYaw += (ty - P.headYaw) * k;
    P.headPitch += (tp - P.headPitch) * k;
  }

  _heliBehind() {
    const h = this._heli();
    if (!h) return false;
    const dx = h.x - this.position.x, dz = h.z - this.position.z;
    if (dx * dx + dz * dz > CFG.TAIL_SWIPE_TRIGGER_DIST ** 2) return false;
    if (h.y - this.position.y > this.height) return false;
    const rel = wrap(Math.atan2(dx, dz) - this.yaw);
    return Math.abs(rel) > 120 * DEG;
  }

  _startSwipe() {
    const h = this._heli();
    const rel = wrap(Math.atan2(h.x - this.position.x, h.z - this.position.z) - this.yaw);
    this.swipeDir = wrap(rel - Math.PI) >= 0 ? 1 : -1;
    this.swipeYaw0 = this.yaw;
    this.swipeHit = false;
    this._enter("tailSwipe");
    this.K.audio?.play?.("roar", { pos: this.position, gain: 0.6 });
    this.K.shake?.(0.35, this.position.x, this.position.y, this.position.z);
  }

  _tailSwipe(dt) {
    const K = this.K, P = this.pose, s = this.scale;
    const u = Math.min(1, this.stateT / SWIPE_SECONDS);
    const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    this.yaw = wrap(this.swipeYaw0 + this.swipeDir * SWIPE_ANGLE * e);
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 4);
    P.tailBend = -this.swipeDir * 1.3 * Math.sin(Math.PI * u);
    P.tailSway = 0.2;
    P.crouch = 0.12 * Math.sin(Math.PI * u);
    this.model.group.rotation.y = this.yaw;
    this.model.group.updateMatrixWorld(true);
    const tip = this.model.anchorWorld(this.model.tailTip, _b);
    const mid = this.model.anchorWorld(this.model.tailMid, _c);
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.1;
      K.destruction?.damageSphere?.(tip.x, tip.y, tip.z, 16 * s, 1.0, { source: "tail" });
      K.supply?.hazard?.(tip.x, tip.z, 16 * s);
      K.app?.traffic?.triggerImpactSphere?.(tip.x, tip.y, tip.z, 28 * s, { force: 1.65, source: "tail" });
      K.app?.traffic?.triggerImpactSphere?.(mid.x, mid.y, mid.z, 28 * s, { force: 1.6, source: "tail" });
      K.destruction?.damageSphere?.(mid.x, mid.y, mid.z, 12 * s, 1.0, { source: "tail" });
      K.crowd?.addThreat?.(tip.x, tip.z, 120 * s, 4);
    }
    const h = this._heli();
    if (!this.swipeHit && h && K.heli?.alive !== false) {
      const r = 24 * s;
      let hit = tip.distanceToSquared(h) < r * r || mid.distanceToSquared(h) < r * r;
      if (!hit) {
        const dx = h.x - this.position.x, dz = h.z - this.position.z;
        if (dx * dx + dz * dz < (CFG.TAIL_SWIPE_RADIUS * s) ** 2 && h.y - this.position.y < this.height * 0.9) {
          const tb = Math.atan2(tip.x - this.position.x, tip.z - this.position.z);
          hit = Math.abs(wrap(tb - Math.atan2(dx, dz))) < 0.22;
        }
      }
      if (hit) {
        this.swipeHit = true;
        K.damagePlayer?.(CFG.TAIL_SWIPE_DAMAGE, "tail");
        K.shake?.(0.9, h.x, h.y, h.z);
      }
    }
    if (u >= 1) {
      P.tailBend = 0;
      P.crouch = 0;
      this.tailCd = CFG.TAIL_SWIPE_COOLDOWN;
      this.targetT = 0;
      this._enter("walk");
    }
  }

  _startCharge() {
    this._updateTarget(0);
    this.breathAtPlayer = false;
    this.breathAimed = false;
    this.breathTelegraph = CFG.BREATH_TELEGRAPH;
    this.breathLen = CFG.BREATH_RANGE;
    this._aimBreath(true);
    this._enter("breathCharge");
    this.K.audio?.play?.("roar", { pos: this.position, gain: 0.8 });
  }

  // sets aimYaw/aimPitch (pitch: positive = down toward city buildings)
  _aimBreath(init) {
    if (init) {
      const tx = this.target.x - this.position.x, tz = this.target.z - this.position.z;
      const tb = tx * tx + tz * tz > 25 ? Math.atan2(tx, tz) : this.yaw;
      this.aimYaw = wrap(this.yaw + clamp(wrap(tb - this.yaw), -0.75, 0.75));
      this.aimPitch = Math.atan2(this.height * 0.86, 150 * this.scale);
    }
  }

  _breathCharge(dt) {
    const P = this.pose;
    const T = this.breathTelegraph || CFG.BREATH_TELEGRAPH;
    this.breathCharge = Math.min(1, this.stateT / T);
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 2.5);
    this._aimBreath(false);
    const dy = wrap(this.aimYaw - this.yaw);
    this.yaw = wrap(this.yaw + clamp(dy, -0.5 * dt, 0.5 * dt));
    P.charge = this.breathCharge;
    const k = Math.min(1, dt * 2);
    P.headYaw += (clamp(wrap(this.aimYaw - this.yaw), -0.8, 0.8) - P.headYaw) * k;
    P.headPitch += (this.aimPitch - 0.35 * Math.sin(Math.PI * this.breathCharge) - P.headPitch) * k;
    P.jaw = 0.25 * this.breathCharge;
    if (this.stateT >= T) this._startBreath();
  }

  _startBreath() {
    const K = this.K;
    this._aimBreath(false);
    this.sweepDir = Math.random() < 0.5 ? -1 : 1;
    this.sweepCenter = this.aimYaw;
    this.breathPitch = this.aimPitch;
    this.breathCharge = 1;
    this.breathActive = true;
    this._stopBreathAudio();
    this.breathHandle = K.audio?.play?.("breath", { pos: this.position }) || null;
    this._enter("breath");
    K.shake?.(0.5, this.position.x, this.position.y, this.position.z);
  }

  _breath(dt) {
    const K = this.K, P = this.pose, s = this.scale;
    const D = CFG.BREATH_DURATION;
    const u = Math.min(1, this.stateT / D);
    P.charge = 1;
    P.breath = clamp(this.stateT / 0.25, 0, 1) * clamp((D - this.stateT) / 0.3, 0, 1);
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 3);
    this.breathCharge = 1;
    if (this.breathAimed) {
      // sweep centre and pitch follow the heli at a limited rate (dodgeable)
      const h = this._heli(), o = this.breathOrigin;
      if (h) {
        const dx = h.x - o.x, dz = h.z - o.z;
        const tr = CFG.BREATH_TRACK_RATE * dt;
        this.sweepCenter = wrap(this.sweepCenter + clamp(wrap(Math.atan2(dx, dz) - this.sweepCenter), -tr, tr));
        const tp = clamp(-Math.atan2(h.y - o.y, Math.max(1, Math.hypot(dx, dz))), -1.2, 0.9);
        this.breathPitch += clamp(tp - this.breathPitch, -tr * 2, tr * 2);
      }
    } else if (this.breathAtPlayer) {
      const h = this._heli();
      const mouthY = this.position.y + this.height * 0.86;
      if (h) {
        const tp = clamp(-Math.atan2(h.y - mouthY, Math.max(1, Math.hypot(h.x - this.position.x, h.z - this.position.z))), -0.7, 0.75);
        this.breathPitch += (tp - this.breathPitch) * Math.min(1, dt * 0.9);
      }
    }
    const off = (u - 0.5) * (this.breathAimed ? CFG.BREATH_AIMED_SWEEP_DEG : CFG.BREATH_SWEEP_DEG) * DEG * this.sweepDir;
    const by = this.sweepCenter + off;
    const bodyYaw = this.sweepCenter + off * 0.55;
    this.yaw = wrap(this.yaw + clamp(wrap(bodyYaw - this.yaw), -0.8 * dt, 0.8 * dt));
    P.headYaw = clamp(wrap(by - this.yaw), -0.9, 0.9);
    P.headPitch += (this.breathPitch - P.headPitch) * Math.min(1, dt * 4);
    const cp = Math.cos(this.breathPitch);
    this.breathDir.set(Math.sin(by) * cp, -Math.sin(this.breathPitch), Math.cos(by) * cp).normalize();
    // effects use last frame's mouth position (updated in _applyTransforms)
    const o = this.breathOrigin;
    K.fx?.spawn?.("flame", o, { dir: this.breathDir, speed: 210, scale: s });
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.2;
      const half = CFG.BREATH_HALF_ANGLE_DEG * DEG;
      const R = this.breathLen;
      K.destruction?.damageCone?.(o, this.breathDir, R, half, CFG.BREATH_BUILDING_DPS * 0.2, { fire: true });
      // ground footprint of the cone for the crowd
      for (let i = 1; i <= 4; i++) {
        const d = (R * i) / 4.5;
        _a.copy(this.breathDir).multiplyScalar(d).add(o);
        const gy = ground(_a.x, _a.z);
        if (_a.y - gy < d * Math.tan(half) + 30) {
          K.crowd?.burnZone?.(_a.x, _a.z, Math.max(15, d * Math.tan(half)));
          K.supply?.hazard?.(_a.x, _a.z, CFG.BREATH_HAZARD_RADIUS);
        }
      }
      _a.copy(this.breathDir).multiplyScalar(R * 0.5).add(o);
      K.crowd?.addThreat?.(_a.x, _a.z, R * 0.7, 6);
    }
    const h = this._heli();
    if (h && P.breath > 0.2) {
      // full 3D cone test from the mouth; +6 m tolerance for the heli's size
      _a.copy(h).sub(o);
      const d = _a.length();
      if (d < this.breathLen + 6 && d > 1e-3 && _a.dot(this.breathDir) / d > Math.cos(CFG.BREATH_HALF_ANGLE_DEG * DEG + Math.atan2(6, d))) {
        K.damagePlayer?.(CFG.BREATH_PLAYER_DPS * dt, "breath", o);
      }
    }
    if (u >= 1) {
      this._endBreath();
      this.nextLaser = Math.max(this.nextLaser, 2);
      this.nextBreath = rand(CFG.BREATH_INTERVAL_MIN, CFG.BREATH_INTERVAL_MAX) * (this.enraged ? CFG.BREATH_INTERVAL_ENRAGED_MULT : 1);
      this._enter("walk");
    }
  }

  _endBreath() {
    this.breathActive = false;
    this.breathCharge = 0;
    this.pose.breath = 0;
    this.pose.charge = 0;
    this._stopBreathAudio();
  }

  _stopBreathAudio() {
    if (this.breathHandle) { try { this.breathHandle.stop?.(); } catch (e) { /* ignore */ } this.breathHandle = null; }
  }

  _dying(dt) {
    const K = this.K, P = this.pose, s = this.scale;
    const D = CFG.DEATH_SECONDS * CFG.DEATH_SLOWMO * 1.1; // kaiju time; mode runs dying at DEATH_SLOWMO
    const d = Math.min(1, this.stateT / D);
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 3);
    P.death = d;
    P.roar = d < 0.25 ? Math.sin((Math.PI * d) / 0.25) * 0.8 : 0;
    P.crouch = clamp((d - 0.15) / 0.4, 0, 1) * 0.75;
    P.tailSway = 0.3 * (1 - d);
    P.jaw = d > 0.6 ? 0.35 : 0;
    const r = clamp((d - 0.3) / 0.45, 0, 1);
    this.deathRoll = r * r * (Math.PI / 2) * 0.96;
    this.fade = 1 - clamp((d - 0.3) / 0.7, 0, 1);
    if (!this.landed && r >= 1) {
      this.landed = true;
      this.model.group.updateMatrixWorld(true);
      K.shake?.(1.0, this.position.x, this.position.y, this.position.z);
      K.audio?.play?.("collapse", { pos: this.position, gain: 1.0 });
      for (let i = 0; i < this.hitSpheres.length; i++) {
        const h = this.hitSpheres[i];
        if (h.name.startsWith("plate") || h.name === "jaw") continue;
        _a.copy(h.center);
        _a.y = ground(_a.x, _a.z) + 2;
        K.fx?.spawn?.("dust", _a, { count: 26, scale: 6 * s, color: _dust });
        if (i % 2 === 0) K.fx?.spawn?.("dustRing", _a, { scale: 4 * s, color: _dust });
        K.destruction?.damageSphere?.(h.center.x, h.center.y, h.center.z, Math.max(h.radius * 1.6, 14 * s), 1.0, { source: "body" });
      }
      K.crowd?.addThreat?.(this.position.x, this.position.z, 500 * s, 8);
    }
    if (d >= 1) { this.state = "dead"; this.stateT = 0; }
  }

  // ------------------------------------------------------------------ periodic world effects
  _periodic(dt) {
    const K = this.K, s = this.scale;
    this.bodyT -= dt;
    if (this.bodyT <= 0) {
      this.bodyT = 0.25;
      const hs = this.hitSpheres;
      const chest = hs[3], hips = hs[6], t1 = hs[11], t2 = hs[12];
      if (this.state !== "rising" || this.stateT > CFG.RISE_SECONDS * 0.25) {
        if (chest) K.destruction?.damageSphere?.(chest.center.x, chest.center.y, chest.center.z, CFG.BODY_RADIUS * 1.15 * s, 1.0, { source: "body" });
        K.destruction?.damageSphere?.(hips.center.x, hips.center.y, hips.center.z, CFG.BODY_RADIUS * s, 1.0, { source: "body" });
        K.destruction?.damageSphere?.(t1.center.x, t1.center.y, t1.center.z, t1.radius * 1.4, 0.8, { source: "body" });
        K.destruction?.damageSphere?.(t2.center.x, t2.center.y, t2.center.z, t2.radius * 1.6, 0.6, { source: "body" });
      }
    }
    this.threatT -= dt;
    if (this.threatT <= 0) {
      this.threatT = 1;
      K.crowd?.addThreat?.(this.position.x, this.position.z, 320 * s, 6);
    }
  }

  // ------------------------------------------------------------------ transforms / visuals
  _applyTransforms(dt) {
    const m = this.model, g = m.group, s = this.scale;
    let y = this.position.y;
    if (this.state === "rising") {
      const u = Math.min(1, this.stateT / CFG.RISE_SECONDS);
      const e = 1 - (1 - u) ** 3;
      y -= this.height * 1.12 * (1 - e);
      g.rotation.x = 0.06 * Math.sin(this.time * 0.9) * (1 - u);
    } else g.rotation.x = 0;
    let roll = 0;
    if (this.state === "dying" || this.state === "dead") {
      roll = this.deathRoll * this.deathSide;
      y += Math.sin(this.deathRoll) * 9 * s - this.pose.crouch * 0;
    }
    g.position.set(this.position.x, y, this.position.z);
    if (this.state === "stunned") {
      // shiver
      const j = 0.18 * s * Math.min(1, this.stunTime * 2);
      g.position.x += Math.sin(this.time * 47) * j;
      g.position.z += Math.sin(this.time * 39 + 1.3) * j;
    }
    g.rotation.y = this.yaw;
    g.rotation.z = roll;
    m.applyPose(this.pose);
    g.updateMatrixWorld(true);

    // hit spheres, lock point, mouth
    const defs = m.hitDefs, hs = this.hitSpheres;
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < hs.length; i++) {
      const c = m.anchorWorld(defs[i], hs[i].center), r = hs[i].radius;
      if (c.x - r < mnx) mnx = c.x - r; if (c.x + r > mxx) mxx = c.x + r;
      if (c.y - r < mny) mny = c.y - r; if (c.y + r > mxy) mxy = c.y + r;
      if (c.z - r < mnz) mnz = c.z - r; if (c.z + r > mxz) mxz = c.z + r;
    }
    this._bound.set((mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2);
    this._boundR = 0.5 * Math.hypot(mxx - mnx, mxy - mny, mxz - mnz);
    if (this._coreIdx >= 0) this._lock.copy(hs[this._coreIdx].center);
    m.anchorWorld(m.mouth, this.breathOrigin);
    if (!this.breathActive) {
      // idle breathDir follows the head forward
      _a.set(0, 0, 1).transformDirection(m.b.head.matrixWorld);
      this.breathDir.copy(_a);
    }

    // shader + beam + light
    const L = this.laser;
    const lc = L.phase === "lock" ? L.charge * 0.8 : L.phase === "fire" ? 0.9 : 0;
    const charge = Math.max(lc, this.state === "breathCharge" ? this.breathCharge : this.breathActive ? 1 : 0);
    m.updateUniforms(dt, this.time, charge, this.breathActive ? this.pose.breath : L.phase === "fire" ? 0.6 : 0, this.fade);
    const bi = this.breathActive ? this.pose.breath : 0;
    const len = this.breathLen * clamp(this.stateT / 0.35, 0.05, 1);
    this.beam?.update(this.breathOrigin, this.breathDir, this.breathActive ? len : 1, CFG.BREATH_HALF_ANGLE_DEG * DEG, bi, this.time,
      this.state === "breathCharge" ? this.breathCharge * this.breathCharge : 0, s);
  }

  // ------------------------------------------------------------------ danger radius + stun
  _updateDanger() {
    this.dangerRadius = this.enraged ? CFG.AGGRO_RADIUS_ENRAGED : CFG.AGGRO_RADIUS;
    const h = this._heli();
    let inside = false;
    let combatRange = false;
    if (h && this.alive && this.state !== "rising" && this.K.heli?.alive !== false) {
      const dx = h.x - this.position.x, dy = h.y - (this.position.y + this.height * 0.5), dz = h.z - this.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      inside = d2 < this.dangerRadius * this.dangerRadius;
      combatRange = d2 < 650 * 650;
    }
    this.inDanger = inside;
    if (inside || combatRange) {
      if (!this.aggro) {
        this.aggro = true;
        this.nextLaser = Math.min(this.nextLaser, inside ? CFG.LASER_FIRST_DELAY : 5.5);
      }
      this._lastHitT = this.time; // keeps retaliatory laser cadence active while heli is in combat range
    }
  }

  // freeze in place: no movement, attacks or footstep damage; takes CFG.STUN_DAMAGE_MULT damage
  stun(seconds) {
    if (!this.alive || !this.model || !(seconds > 0)) return;
    if (this.state === "rising" || this.state === "dying" || this.state === "dead") return;
    this.stunTime = Math.max(this.stunTime, seconds);
    if (this.stunned) return;
    this.stunned = true;
    if (this.laser.phase !== "idle") { this._endLaser(false); this.nextLaser = Math.max(this.nextLaser, 2); }
    if (this.breathActive || this.state === "breathCharge") {
      this._endBreath();
      this.nextBreath = Math.max(this.nextBreath, 4);
    }
    if (this.state === "tailSwipe") this.tailCd = CFG.TAIL_SWIPE_COOLDOWN;
    this.flinchT = 0;
    this.pose.flinch = 0;
    this._enter("stunned");
  }

  _stunState(dt) {
    this.stunTime -= dt;
    this.model?.setStun?.(clamp(this.stunTime / 0.5, 0, 1) * (0.85 + 0.15 * Math.sin(this.time * 9)));
    if (this.stunTime <= 0) {
      this.stunTime = 0;
      this.stunned = false;
      this.model?.setStun?.(0);
      this.pose.tailBend = 0;
      this.pose.crouch = 0;
      this._enter("walk");
    }
  }

  // ------------------------------------------------------------------ laser (aggro attack)
  debugLaserNow() {
    if (!this.alive || !this.model) return false;
    if (this.stunned) { this.stunTime = 0; this._stunState(0); }
    if (this.state === "rising") this.skipRise();
    if (this.state === "breath" || this.state === "breathCharge") this._endBreath();
    if (this.laser.phase !== "idle") this._endLaser(false);
    this.aggro = true;
    this._lastHitT = this.time;
    this._startLaser();
    return true;
  }

  debugBreathNow() {
    if (!this.alive || !this.model) return false;
    if (this.stunned) { this.stunTime = 0; this._stunState(0); }
    if (this.state === "rising") this.skipRise();
    if (this.laser.phase !== "idle") this._endLaser(false);
    if (this.state === "breath" || this.state === "breathCharge") this._endBreath();
    this._startCharge();
    return true;
  }

  _trackHeliVel(dt) {
    const h = this._heli();
    if (!h) return;
    if (this._hPrevOk) {
      _a.copy(h).sub(this._hPrev).divideScalar(dt);
      if (_a.lengthSq() > 250 * 250) this._hv.set(0, 0, 0); // teleport / respawn
      else this._hv.lerp(_a, Math.min(1, dt * 10));
    }
    this._hPrev.copy(h);
    this._hPrevOk = true;
  }

  _canLaser() {
    const h = this._heli();
    if (!h || this.K.heli?.alive === false) return false;
    const dx = h.x - this.position.x, dz = h.z - this.position.z;
    const d2 = dx * dx + dz * dz;
    return d2 <= CFG.LASER_RANGE * CFG.LASER_RANGE && d2 >= (32 * this.scale) ** 2;
  }

  _startLaser() {
    const L = this.laser;
    this._enter("laser");
    L.phase = "lock";
    L.t = 0;
    L.charge = 0;
    L.frozen = false;
    L.length = 0;
    L.origin.copy(this.breathOrigin);
    const h = this._heli();
    if (h) {
      this._lzTargetPt.copy(h);
      _a.copy(h).sub(L.origin);
      if (_a.lengthSq() > 1e-6) L.dir.copy(_a.normalize());
    }
    this._lzBeep = 0;
    this._lzTick = 0;
    this._lzBoom = 0;
    this._lzOffY = 0;
    this._lzOffP = 0;
  }

  // pose, body turn, phase timing (aim/beam/damage happen in _laserPost with the fresh mouth position)
  _laserState(dt) {
    const P = this.pose, L = this.laser, h = this._heli();
    L.t += dt;
    P.walkAmt += (0 - P.walkAmt) * Math.min(1, dt * 3);
    this._locomote(dt);
    let ax, ay, az;
    if (L.phase === "lock" && !L.frozen && h) { ax = h.x; ay = h.y; az = h.z; }
    else { ax = L.origin.x + L.dir.x * 200; ay = L.origin.y + L.dir.y * 200; az = L.origin.z + L.dir.z * 200; }
    const dx = ax - this.position.x, dz = az - this.position.z;
    const bear = Math.atan2(dx, dz);
    const rel = wrap(bear - this.yaw);
    const turnRate = L.phase === "lock" && !L.frozen ? 2.4 : 0.7;
    if (Math.abs(rel) > 0.15) this.yaw = wrap(this.yaw + clamp(rel, -turnRate * dt, turnRate * dt));
    const k = Math.min(1, dt * 5);
    P.headYaw += (clamp(wrap(bear - this.yaw), -0.9, 0.9) - P.headYaw) * k;
    const tp = clamp(-Math.atan2(ay - (this.position.y + this.height * 0.88), Math.max(1, Math.hypot(dx, dz))), -0.6, 0.45);
    P.headPitch += (tp - P.headPitch) * k;
    P.jaw += ((L.phase === "lock" ? 0.1 + 0.22 * L.charge : 0.42) - P.jaw) * Math.min(1, dt * 8);
    P.tailSway = 0.5;
    if (L.phase === "lock") {
      const T = CFG.LASER_LOCK_SECONDS;
      L.charge = Math.min(1, L.t / T);
      this._lzBeep -= dt;
      if (this._lzBeep <= 0) {
        this._lzBeep = 0.35 + (0.08 - 0.35) * L.charge;
        this.K.audio?.play?.("laserBeep", { pitch: 1 + L.charge });
      }
      if (!L.frozen && L.t >= T - CFG.LASER_FREEZE_BEFORE) this._freezeAim();
      if (L.t >= T) this._fireLaser();
    } else if (L.phase === "fire" && L.t >= CFG.LASER_FIRE_SECONDS) {
      this._endLaser(true);
    }
  }

  // freeze the 3D target point after the initial 0.30s lock window so the player has 1.50s + 1.80s to dodge clear
  _freezeAim() {
    const L = this.laser, h = this._heli();
    L.frozen = true;
    if (h) this._lzTargetPt.copy(h);
    else this._lzTargetPt.copy(L.origin).addScaledVector(L.dir, 300);
    _a.copy(this._lzTargetPt).sub(L.origin);
    if (_a.lengthSq() < 1e-6) _a.copy(L.dir);
    _a.normalize();
    this._lzBase.copy(_a);
    L.dir.copy(_a);
  }

  _fireLaser() {
    const L = this.laser, K = this.K;
    if (!L.frozen) this._freezeAim();
    L.phase = "fire";
    L.t = 0;
    L.charge = 1;
    this._lzOffY = 0;
    this._lzOffP = 0;
    this._stopLaserAudio();
    this._lzHandle = K.audio?.play?.("laserFire", { pos: this.position }) || null;
    K.shake?.(0.5, L.origin.x, L.origin.y, L.origin.z);
  }

  _endLaser(resched) {
    const L = this.laser;
    L.phase = "idle";
    L.t = 0;
    L.charge = 0;
    L.frozen = false;
    L.length = 0;
    this._stopLaserAudio();
    this.model?.setLaserGlow?.(0);
    if (resched) {
      this.nextLaser = rand(CFG.LASER_INTERVAL_MIN, CFG.LASER_INTERVAL_MAX) * (this.enraged ? CFG.LASER_INTERVAL_ENRAGED_MULT : 1);
      this.nextBreath = Math.max(this.nextBreath, 2.5);
    }
    if (this.state === "laser") {
      this.targetT = 0;
      this._enter("walk");
    }
  }

  _stopLaserAudio() {
    if (this._lzHandle) { try { this._lzHandle.stop?.(); } catch (e) { /* ignore */ } this._lzHandle = null; }
  }

  // distance along the ray to the terrain (Infinity if none within maxD)
  _terrainHit(o, d, maxD) {
    if (d.y >= 0) return Infinity;
    let prev = 0;
    for (let t = 15; ; t += 15) {
      const tt = Math.min(t, maxD);
      if (o.y + d.y * tt <= ground(o.x + d.x * tt, o.z + d.z * tt)) {
        let lo = prev, hi = tt;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) * 0.5;
          if (o.y + d.y * m <= ground(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
        }
        return hi;
      }
      prev = tt;
      if (tt >= maxD) return Infinity;
    }
  }

  _laserPost(dt) {
    const L = this.laser, lb = this.laserBeam;
    if (!lb) return;
    if (L.phase === "idle") { lb.update(L, 0, this.time, this.scale, false); return; }
    const K = this.K, h = this._heli();
    L.origin.copy(this.breathOrigin);
    if (L.phase === "lock" && !L.frozen && h) {
      this._lzTargetPt.copy(h);
      _a.copy(h).sub(L.origin);
      if (_a.lengthSq() > 1e-6) L.dir.copy(_a.normalize());
    } else {
      // Frozen aim: point strictly at the frozen 3D world point _lzTargetPt (0 rad/s sweep)
      _a.copy(this._lzTargetPt).sub(L.origin);
      if (_a.lengthSq() > 1e-6) L.dir.copy(_a.normalize());
    }
    // beam length: first building or terrain along the ray
    let maxD = CFG.LASER_RANGE;
    if (L.phase === "lock" && h) maxD = Math.min(maxD, L.origin.distanceTo(h) + 25);
    let len = maxD, hit = false;
    const r = K.destruction?.raycast?.(L.origin, L.dir, maxD);
    if (r && r.dist < len) { len = Math.max(1, r.dist); hit = true; }
    const tg = this._terrainHit(L.origin, L.dir, len);
    if (tg < len) { len = Math.max(1, tg); hit = true; }
    L.length = len;

    if (L.phase === "lock") {
      this.model?.setLaserGlow?.(L.charge);
      lb.update(L, 0, this.time, this.scale, false);
      return;
    }
    const F = CFG.LASER_FIRE_SECONDS;
    const fire = clamp(L.t / 0.12, 0, 1) * clamp((F - L.t) / 0.2, 0, 1);
    this.model?.setLaserGlow?.(1);
    if (h && fire > 0.05) {
      _a.copy(h).sub(L.origin);
      const t = _a.dot(L.dir);
      const R = CFG.LASER_RADIUS;
      if (t > 0 && t < len + R && _a.lengthSq() - t * t < R * R) K.damagePlayer?.(CFG.LASER_DPS * dt, "laser", L.origin);
    }
    if (hit) {
      const e = this._lzEnd.copy(L.dir).multiplyScalar(len).add(L.origin);
      this._lzTick -= dt;
      if (this._lzTick <= 0) {
        this._lzTick = CFG.LASER_TICK;
        K.destruction?.damageSphere?.(e.x, e.y, e.z, CFG.LASER_BLAST_RADIUS, CFG.LASER_BUILDING_DAMAGE, { fire: true, source: "kaiju" });
        K.fx?.spawn?.("fire", e, { count: 5, scale: 2.2 });
        K.fx?.spawn?.("debris", e, { count: 5, scale: 1.4, speed: 30 });
        if (e.y - ground(e.x, e.z) < 25) K.crowd?.burnZone?.(e.x, e.z, CFG.LASER_BLAST_RADIUS * 1.6);
        K.supply?.hazard?.(e.x, e.z, CFG.LASER_BLAST_RADIUS);
      }
      this._lzBoom -= dt;
      if (this._lzBoom <= 0) {
        this._lzBoom = 0.45;
        K.fx?.spawn?.("explosion", e, { scale: 1.6 });
        K.audio?.play?.("explosion", { pos: e, gain: 0.6 });
        K.shake?.(0.2, e.x, e.y, e.z);
        if (e.y - ground(e.x, e.z) < 6) {
          if (K.fx?.addScorch) K.fx.addScorch(e.x, e.z, CFG.LASER_BLAST_RADIUS);
          else K.fx?.addDecal?.(e.x, e.z, Math.random() * TAU, 1.3);
        }
      }
    }
    lb.update(L, fire, this.time, this.scale, hit);
  }
}
