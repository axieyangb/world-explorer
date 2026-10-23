// Kaiju Defense: helicopter weapons. Chin cannon + homing missile salvo, aimed along K.getAimRay().
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
import { getBeijingTerrainElevation } from "../../environment.js";

const MAX_ROUNDS = 64;
const MAX_MISSILES = 8;
const SALVO_STAGGER = 0.12;   // s between salvo missiles
const MISSILE_MAX_LIFE = 8;   // s, then airburst
const DEG = Math.PI / 180;
const WEAK_COLOR = new THREE.Color(0.55, 1.0, 1.0);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _fwd = new THREE.Vector3(0, 0, 1);
const _axis = new THREE.Vector3();
const _ro = new THREE.Vector3();

export class KaijuWeapons {
  constructor(K) {
    this.K = K;
    this.heat = 0;
    this.overheated = false;
    this.missileCooldown = 0;
    this.lockProgress = 0;
    this.locked = false;
    this.reticle = null;

    this._cannonKey = false;
    this._cannonMouse = false;
    this._fireAcc = 0;
    this._hitSoundT = 0;
    this._salvoLeft = 0;
    this._salvoT = 0;
    this._salvoSide = 1;
    this._salvoHoming = false;
    this._lockName = null;
    this._reticle = { x: 0, y: 0 };
    this.aimPoint = new THREE.Vector3();
    this._homingPt = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._assistPt = new THREE.Vector3();

    this.rounds = [];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      this.rounds.push({ active: false, p0: new THREE.Vector3(), v0: new THREE.Vector3(), pos: new THREE.Vector3(), age: 0, life: 0, tracer: null });
    }
    this.missiles = [];
    for (let i = 0; i < MAX_MISSILES; i++) {
      this.missiles.push({ active: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(), age: 0, homing: false, trail: 0 });
    }
    // Missile bodies: one instanced draw.
    const body = new THREE.CylinderGeometry(0.16, 0.2, 2.4, 8);
    body.rotateX(Math.PI / 2);
    this.missileMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0xcfd0cc, metalness: 0.4, roughness: 0.5 }), MAX_MISSILES);
    this.missileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.missileMesh.count = 0;
    this.missileMesh.frustumCulled = false;
    this.missileMesh.name = "kaijuMissiles";
    (K?.scene || K?.app?.scene)?.add(this.missileMesh);
  }

  // ---------- input ----------
  onKeyDown(code) {
    if (code === "Space") this._cannonKey = true;
    else if (code === "KeyF") this._fireMissiles();
  }
  onKeyUp(code) {
    if (code === "Space") this._cannonKey = false;
  }
  onPointerDown(button) {
    if (button === 0) this._cannonMouse = true;
    else if (button === 2) this._fireMissiles();
  }
  onPointerUp(button) {
    if (button === 0) this._cannonMouse = false;
  }

  get tracers() {
    return this.rounds.filter((r) => r.active);
  }

  _canFire() {
    const K = this.K;
    return !!(K && K.canFire);
  }

  // ---------- helpers ----------
  _kaijuAlive() {
    const k = this.K?.kaiju;
    return !!k && k.alive !== false && typeof k.raycast === "function";
  }

  // Muzzle / pylon world position from the heli mesh (nose is +Z local).
  _heliPoint(out, lx, ly, lz) {
    const hm = this.K?.app?.heliMesh;
    if (hm) {
      hm.updateMatrixWorld();
      out.set(lx, ly, lz);
      return hm.localToWorld(out);
    }
    const p = this.K?.getHeliPos?.();
    return p ? out.copy(p).add(_c.set(0, -1, 0)) : out.set(0, 0, 0);
  }

  // Terrain intersection distance along a ray, or Infinity.
  _terrainRay(o, d, maxD, step = 25) {
    let tPrev = 0;
    let hPrev = o.y - getBeijingTerrainElevation(o.x, o.z);
    if (hPrev < 0) return 0;
    for (let t = step; t <= maxD + step; t += step) {
      const tt = Math.min(t, maxD);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const h = y - getBeijingTerrainElevation(x, z);
      if (h < 0) {
        let lo = tPrev, hi = tt;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) * 0.5;
          const hm = o.y + d.y * mid - getBeijingTerrainElevation(o.x + d.x * mid, o.z + d.z * mid);
          if (hm < 0) hi = mid; else lo = mid;
        }
        return hi;
      }
      tPrev = tt; hPrev = h;
      if (tt >= maxD) break;
    }
    return Infinity;
  }

  // Resolve what the crosshair points at; fills this.aimPoint. Returns kaiju hit (or null).
  _computeAim(ray) {
    const K = this.K;
    const maxD = CFG.CANNON_RANGE;
    // Skip anything between the chase camera and the helicopter.
    const hp = K.getHeliPos?.();
    let t0 = 0;
    if (hp) t0 = Math.max(0, _a.subVectors(hp, ray.origin).dot(ray.dir));
    _ro.copy(ray.origin).addScaledVector(ray.dir, t0);
    let best = maxD;
    let kh = null;
    if (this._kaijuAlive()) {
      kh = K.kaiju.raycast(_ro, ray.dir, maxD) || null;
      if (kh && kh.dist < best) best = kh.dist; else kh = null;
    }
    const bh = K.destruction?.raycast?.(_ro, ray.dir, best);
    if (bh && bh.dist < best) { best = bh.dist; kh = null; }
    const td = this._terrainRay(_ro, ray.dir, best, 30);
    if (td < best) { best = td; kh = null; }
    this.aimPoint.copy(_ro).addScaledVector(ray.dir, best);
    return kh;
  }

  // Aim assist: closest kaiju sphere within CFG.AIM_ASSIST_DEG of the aim ray. Returns strength 0..1, point in out.
  _assist(ray, out) {
    const spheres = this.K?.kaiju?.hitSpheres;
    if (!spheres || !this._kaijuAlive()) return 0;
    const lim = CFG.AIM_ASSIST_DEG * DEG;
    let bestA = lim, found = false;
    for (let i = 0; i < spheres.length; i++) {
      const s = spheres[i];
      _a.subVectors(s.center, ray.origin);
      const along = _a.dot(ray.dir);
      if (along <= 0 || along > CFG.CANNON_RANGE) continue;
      _b.copy(ray.dir).multiplyScalar(along);
      const perp = _a.distanceTo(_b);
      const ang = Math.atan2(Math.max(0, perp - s.radius), along) - (s.weak ? 0.002 : 0);
      if (ang < bestA) {
        bestA = ang; found = true;
        // point on the sphere surface nearest the ray
        _c.copy(ray.origin).add(_b).sub(s.center);
        const l = _c.length();
        out.copy(s.center);
        if (l > 1e-3) out.addScaledVector(_c, Math.min(l, s.radius * 0.6) / l);
      }
    }
    if (!found) return 0;
    return 0.72 + 0.25 * (1 - Math.max(0, bestA) / lim);
  }

  // Homing point: named weak sphere picked at lock time, else the lock point.
  _homingPoint() {
    const k = this.K?.kaiju;
    if (!k) return null;
    if (this._lockName && k.hitSpheres) {
      for (const s of k.hitSpheres) if (s.name === this._lockName) return this._homingPt.copy(s.center);
    }
    const lp = k.getLockPoint?.();
    return lp ? this._homingPt.copy(lp) : null;
  }

  _pickLockSphere() {
    const sp = this.K?.kaiju?.hitSpheres;
    this._lockName = null;
    if (!sp) return;
    let weak = null;
    for (const s of sp) {
      if (!s.weak) continue;
      if (/chest|core/i.test(s.name || "")) { this._lockName = s.name; return; }
      if (!weak) weak = s;
    }
    if (weak) this._lockName = weak.name;
  }

  // Segment hit test: kaiju, buildings, terrain. Returns kind ('kaiju'|'building'|'ground'|null); fills _hitP.
  _segmentHit(from, to) {
    const K = this.K;
    _seg.subVectors(to, from);
    const len = _seg.length();
    if (len < 1e-6) return null;
    _seg.multiplyScalar(1 / len);
    let best = len, kind = null;
    this._hitInfo = null;
    if (this._kaijuAlive()) {
      const h = K.kaiju.raycast(from, _seg, len);
      if (h && h.dist <= best) { best = h.dist; kind = "kaiju"; this._hitInfo = h; }
    }
    const bh = K.destruction?.raycast?.(from, _seg, best);
    if (bh && bh.dist < best) { best = bh.dist; kind = "building"; this._hitInfo = bh; }
    const ge = getBeijingTerrainElevation(to.x, to.z);
    if (to.y < ge) {
      const gs = getBeijingTerrainElevation(from.x, from.z);
      const hs = from.y - gs, he = to.y - ge;
      const t = hs > 0 ? (hs / (hs - he)) * len : 0;
      if (t < best) { best = t; kind = "ground"; this._hitInfo = null; }
    }
    if (!kind) return null;
    if (kind !== "ground" && this._hitInfo?.point) _hitP.copy(this._hitInfo.point);
    else _hitP.copy(from).addScaledVector(_seg, best);
    return kind;
  }

  // ---------- firing ----------
  _fireRound(ray, kaijuAim) {
    const K = this.K;
    const r = this.rounds.find((x) => !x.active);
    if (!r) return;
    const muzzle = this._heliPoint(this._muzzle, 0, 0.75, 2.8);
    // Aim at the crosshair point, compensating for drop.
    let k = 0;
    if (!kaijuAim) k = this._assist(ray, this._assistPt);
    _b.copy(this.aimPoint);
    if (k > 0) _b.lerp(this._assistPt, k);
    const dist = _b.distanceTo(muzzle);
    const tf = dist / CFG.CANNON_MUZZLE_SPEED;
    _b.y += 0.5 * CFG.CANNON_GRAVITY * tf * tf;
    const dir = this._dir.subVectors(_b, muzzle).normalize();
    const sp = CFG.CANNON_SPREAD_RAD;
    dir.x += (Math.random() - 0.5) * 2 * sp;
    dir.y += (Math.random() - 0.5) * 2 * sp;
    dir.z += (Math.random() - 0.5) * 2 * sp;
    dir.normalize();
    r.active = true;
    r.age = 0;
    r.life = CFG.CANNON_RANGE / CFG.CANNON_MUZZLE_SPEED + 0.15;
    r.p0.copy(muzzle);
    r.pos.copy(muzzle);
    r.v0.copy(dir).multiplyScalar(CFG.CANNON_MUZZLE_SPEED);
    const fx = K.fx;
    r.tracer = fx?.spawnTracer ? fx.spawnTracer(muzzle, r.v0, r.life, CFG.CANNON_GRAVITY, { tail: 0.022, width: 0.5 }) : null;
    fx?.spawn?.("muzzle", muzzle, { dir, scale: 0.8 });
    K.audio?.play?.("cannon", { pos: muzzle, gain: 0.55 });
    if (K.stats) K.stats.cannonShots = (K.stats.cannonShots || 0) + 1;
  }

  _fireMissiles() {
    if (!this._canFire() || this.missileCooldown > 0 || this._salvoLeft > 0) return;
    this._salvoLeft = CFG.MISSILE_SALVO;
    this._salvoT = 0;
    this._salvoHoming = this.locked;
    this.missileCooldown = 1;
  }

  _launchMissile(ray) {
    const K = this.K;
    const m = this.missiles.find((x) => !x.active);
    if (!m) return;
    this._salvoSide = -this._salvoSide;
    this._heliPoint(m.pos, 1.8 * this._salvoSide, 1.05, 0.3);
    this._computeAim(ray);
    m.dir.subVectors(this.aimPoint, m.pos).normalize();
    if (this._salvoHoming) m.dir.y += 0.06;
    m.dir.normalize();
    m.active = true;
    m.age = 0;
    m.trail = 0;
    m.homing = this._salvoHoming;
    K.fx?.spawn?.("muzzle", m.pos, { dir: m.dir, scale: 1.2 });
    K.audio?.play?.("missileLaunch", { pos: m.pos });
    if (K.stats) K.stats.missilesFired = (K.stats.missilesFired || 0) + 1;
  }

  // ---------- impacts ----------
  _roundImpact(kind, p, vdir) {
    const K = this.K, fx = K.fx, info = this._hitInfo;
    _a.copy(vdir).multiplyScalar(-1);
    // Grow impact effects with camera distance so hits stay readable at range.
    const cam = K.camera || K.app?.camera;
    const sc = cam ? Math.min(4, Math.max(1, cam.position.distanceTo(p) / 150)) : 1;
    if (kind === "kaiju") {
      const weak = !!info?.weak;
      const dmg = CFG.CANNON_DAMAGE * (weak ? CFG.WEAK_POINT_MULT : 1);
      K.kaiju.takeDamage?.(dmg, p, weak);
      if (K.stats) {
        K.stats.cannonHits = (K.stats.cannonHits || 0) + 1;
        if (weak) K.stats.weakHits = (K.stats.weakHits || 0) + 1;
      }
      if (weak) {
        fx?.spawn?.("spark", p, { dir: _a, count: 12, color: WEAK_COLOR, speed: 55, scale: sc });
        fx?.spawn?.("muzzle", p, { color: WEAK_COLOR, scale: 2.2 * sc, count: 2, life: 0.1 });
      } else {
        fx?.spawn?.("spark", p, { dir: _a, count: 7, scale: sc });
        fx?.spawn?.("muzzle", p, { scale: 0.9 * sc, count: 1, life: 0.05 });
      }
      fx?.spawn?.("debris", p, { dir: _a, count: 2, scale: 0.6 * sc });
      if (this._hitSoundT <= 0) {
        K.audio?.play?.(weak ? "hitWeak" : "hit", { pos: p });
        this._hitSoundT = weak ? 0.09 : 0.06;
      }
    } else if (kind === "building") {
      if (info?.ref !== undefined) {
        if (K.destruction?.applyHeliHit) K.destruction.applyHeliHit(info.ref, CFG.CANNON_BUILDING_UNITS);
        else K.destruction?.applyHit?.(info.ref, CFG.CANNON_BUILDING_DAMAGE, { point: p });
      }
      fx?.spawn?.("spark", p, { dir: _a, count: 5, scale: sc });
      fx?.spawn?.("smoke", p, { count: 1, scale: 0.35 * sc, light: true, life: 2.5, speed: 1 });
      if (Math.random() < 0.3) fx?.spawn?.("debris", p, { dir: _a, count: 1, scale: 0.5 });
    } else {
      fx?.spawn?.("spark", p, { dir: _a, count: 4, scale: sc });
      fx?.spawn?.("smoke", p, { count: 1, scale: 0.4 * sc, light: true, life: 2.0, speed: 1 });
      K.app?.traffic?.triggerImpactSphere?.(p.x, p.y, p.z, 6.0, { force: 1.15, source: "cannon" });
    }
  }

  _missileImpact(kind, p) {
    const K = this.K, fx = K.fx, info = this._hitInfo;
    fx?.spawn?.("bigExplosion", p);
    K.audio?.play?.("bigExplosion", { pos: p });
    K.shake?.(0.6, p.x, p.y, p.z);
    if (kind === "kaiju") {
      const weak = !!info?.weak;
      K.kaiju.takeDamage?.(CFG.MISSILE_DAMAGE * (weak ? CFG.WEAK_POINT_MULT : 1), p, weak);
      if (K.stats) {
        K.stats.missileHits = (K.stats.missileHits || 0) + 1;
        if (weak) K.stats.weakHits = (K.stats.weakHits || 0) + 1;
      }
      if (weak) fx?.spawn?.("muzzle", p, { color: WEAK_COLOR, scale: 7, count: 2, life: 0.18 });
    } else if (kind) {
      K.destruction?.damageSphere?.(p.x, p.y, p.z, CFG.MISSILE_BLAST_RADIUS, CFG.MISSILE_BUILDING_DAMAGE, { fire: true, source: "player" });
      K.app?.traffic?.triggerImpactSphere?.(p.x, p.y, p.z, CFG.MISSILE_BLAST_RADIUS || 28, { force: 1.65, source: "missile" });
      K.crowd?.addThreat?.(p.x, p.z, 120, 8);
    }
  }

  // ---------- update ----------
  update(dt) {
    const K = this.K;
    if (!K || !(dt > 0)) return;
    const can = this._canFire();
    const ray = K.getAimRay?.();
    this._hitSoundT -= dt;

    // Cannon + heat
    const wantFire = can && (this._cannonKey || this._cannonMouse) && !this.overheated && !!ray;
    if (wantFire) {
      this.heat = Math.min(1, this.heat + dt / CFG.CANNON_HEAT_SECONDS);
      const kaijuAim = this._computeAim(ray);
      this._fireAcc += dt * CFG.CANNON_RPS;
      let n = 0;
      while (this._fireAcc >= 1 && n < 4) { this._fireAcc -= 1; n++; this._fireRound(ray, kaijuAim); }
      if (this.heat >= 1) { this.overheated = true; this._fireAcc = 0; }
    } else {
      this._fireAcc = Math.min(this._fireAcc, 1);
      if (!(this._cannonKey || this._cannonMouse) || this.overheated || !can) this._fireAcc = 1; // first shot is instant
      this.heat = Math.max(0, this.heat - dt / CFG.CANNON_COOL_SECONDS);
      if (this.overheated && this.heat <= 0) this.overheated = false;
    }

    // Missiles: cooldown, salvo, lock
    this.missileCooldown = Math.max(0, this.missileCooldown - dt / CFG.MISSILE_COOLDOWN);
    if (this._salvoLeft > 0 && ray) {
      this._salvoT -= dt;
      if (this._salvoT <= 0) { this._launchMissile(ray); this._salvoLeft--; this._salvoT = SALVO_STAGGER; }
    }
    this._updateLock(dt, can ? ray : null);

    this._updateRounds(dt);
    this._updateMissiles(dt);
  }

  _updateLock(dt, ray) {
    const k = this.K.kaiju;
    let inCone = false;
    let lp = null;
    if (ray && this._kaijuAlive() && k.getLockPoint) {
      lp = k.getLockPoint();
      if (lp) {
        _a.subVectors(lp, ray.origin);
        const d = _a.length();
        if (d > 1 && d < CFG.MISSILE_LOCK_RANGE) {
          const cos = _a.dot(ray.dir) / d;
          inCone = cos > Math.cos(CFG.MISSILE_LOCK_CONE_DEG * DEG);
        }
      }
    }
    if (inCone) this.lockProgress = Math.min(1, this.lockProgress + dt / CFG.MISSILE_LOCK_TIME);
    else this.lockProgress = Math.max(0, this.lockProgress - dt / 0.35);
    if (!this.locked && this.lockProgress >= 1) {
      this.locked = true;
      this._pickLockSphere();
      this.K.audio?.play?.("lock");
    } else if (this.locked && this.lockProgress < 0.5) {
      this.locked = false;
    }
    // Screen-space reticle on the lock target.
    const cam = this.K.camera || this.K.app?.camera;
    if (this.lockProgress > 0 && lp && cam) {
      const tp = this.locked ? (this._homingPoint() || lp) : lp;
      _b.copy(tp).project(cam);
      if (_b.z < 1 && _b.z > -1) {
        const el = this.K.app?.renderer?.domElement;
        const w = el?.clientWidth || window.innerWidth, h = el?.clientHeight || window.innerHeight;
        this._reticle.x = (_b.x * 0.5 + 0.5) * w;
        this._reticle.y = (0.5 - _b.y * 0.5) * h;
        this.reticle = this._reticle;
        return;
      }
    }
    this.reticle = null;
  }

  _updateRounds(dt) {
    const g = CFG.CANNON_GRAVITY;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const r = this.rounds[i];
      if (!r.active) continue;
      r.age += dt;
      _a.copy(r.pos);
      const t = r.age;
      r.pos.copy(r.p0).addScaledVector(r.v0, t);
      r.pos.y -= 0.5 * g * t * t;
      const kind = this._segmentHit(_a, r.pos);
      if (kind) {
        _b.copy(r.v0); _b.y -= g * t; _b.normalize();
        this._roundImpact(kind, _hitP, _b);
        this.K.fx?.killTracer?.(r.tracer);
        r.active = false;
      } else if (r.age >= r.life) {
        this.K.fx?.killTracer?.(r.tracer);
        r.active = false;
      }
    }
  }

  _updateMissiles(dt) {
    const fx = this.K.fx;
    let n = 0;
    for (let i = 0; i < MAX_MISSILES; i++) {
      const m = this.missiles[i];
      if (!m.active) continue;
      m.age += dt;
      const speed = CFG.MISSILE_SPEED * Math.min(1, 0.35 + (m.age / 0.6) * 0.65);
      let target = null;
      if (this._kaijuAlive()) target = this._homingPoint();
      if (target && m.age > 0.12) {
        _a.subVectors(target, m.pos);
        const dist = _a.length();
        if (dist < 4) {
          this._hitInfo = this._lockName ? { weak: true } : { weak: false };
          this._missileImpact("kaiju", target);
          m.active = false;
          continue;
        }
        _a.multiplyScalar(1 / dist);
        const ang = Math.acos(Math.max(-1, Math.min(1, m.dir.dot(_a))));
        const maxTurn = CFG.MISSILE_TURN_RATE * dt * (dist < 120 ? 1.6 : 1);
        if (ang <= maxTurn) m.dir.copy(_a);
        else if (ang > 1e-4) {
          _axis.crossVectors(m.dir, _a);
          if (_axis.lengthSq() < 1e-10) _axis.set(0, 1, 0);
          _axis.normalize();
          _q.setFromAxisAngle(_axis, maxTurn);
          m.dir.applyQuaternion(_q).normalize();
        }
      }
      _b.copy(m.pos);
      m.pos.addScaledVector(m.dir, speed * dt);
      const kind = this._segmentHit(_b, m.pos);
      if (kind) {
        this._missileImpact(kind, _hitP);
        m.active = false;
        continue;
      }
      if (m.age > MISSILE_MAX_LIFE) {
        this._hitInfo = null;
        this._missileImpact(null, m.pos);
        m.active = false;
        continue;
      }
      // Engine glow + smoke trail every ~3.5 m.
      _c.copy(m.pos).addScaledVector(m.dir, -1.4);
      fx?.spawn?.("muzzle", _c, { count: 1, scale: 0.45, life: 0.05 });
      if (m.age > 0.1) m.trail += speed * dt;
      while (m.trail > 3.5) {
        m.trail -= 3.5;
        _c.copy(m.pos).addScaledVector(m.dir, -1.6 - m.trail);
        fx?.spawn?.("trail", _c);
      }
      _q.setFromUnitVectors(_fwd, m.dir);
      _m.compose(m.pos, _q, _one);
      this.missileMesh.setMatrixAt(n++, _m);
    }
    this.missileMesh.count = n;
    if (n) this.missileMesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const r of this.rounds) {
      if (r.active) this.K?.fx?.killTracer?.(r.tracer);
      r.active = false;
    }
    for (const m of this.missiles) m.active = false;
    this.missileMesh.count = 0;
    this.heat = 0;
    this.overheated = false;
    this.missileCooldown = 0;
    this.lockProgress = 0;
    this.locked = false;
    this.reticle = null;
    this._salvoLeft = 0;
    this._fireAcc = 1;
    this._cannonKey = this._cannonMouse = false;
    this._lockName = null;
  }

  dispose() {
    this.missileMesh.parent?.remove(this.missileMesh);
    this.missileMesh.geometry.dispose();
    this.missileMesh.material.dispose();
  }
}
