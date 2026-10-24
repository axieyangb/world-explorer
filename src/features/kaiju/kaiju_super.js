// Kaiju Defense: super weapons (Railgun, Homing Swarm, Cryo-EMP, Orbital Ion Strike). Fired with R.
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
import { getBeijingTerrainElevation } from "../../environment.js";

const MAX_SWARM = 32;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
const CYAN_COLOR = new THREE.Color(0.3, 0.95, 1.0);

export class KaijuSuper {
  constructor(K) {
    this.K = K;
    this.item = null; // { id, nameKey, charges, maxCharges, cd }
    this._railBeams = [];
    this._empWaves = [];
    this._orbital = null;
    this._swarmQueue = 0;
    this._swarmT = 0;
    this._swarmSide = 1;
    this._swarm = [];
    for (let i = 0; i < MAX_SWARM; i++) {
      this._swarm.push({
        active: false,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        age: 0,
        trail: 0,
        sphereIdx: -1,
        weak: false,
      });
    }
    this._initMeshes();
  }

  _initMeshes() {
    const scene = this.K?.scene || this.K?.app?.scene;
    const mGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.8, 6);
    mGeo.rotateX(Math.PI / 2);
    const mMat = new THREE.MeshBasicMaterial({ color: 0x66f7ff });
    this.swarmMesh = new THREE.InstancedMesh(mGeo, mMat, MAX_SWARM);
    this.swarmMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.swarmMesh.count = 0;
    this.swarmMesh.frustumCulled = false;
    this.swarmMesh.name = "kaijuSwarmMissiles";
    scene?.add(this.swarmMesh);

    this._cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    this._cylGeo.translate(0, 0.5, 0);
    this._sphereGeo = new THREE.IcosahedronGeometry(1, 2);
  }

  _heliPoint(out, lx, ly, lz) {
    const hm = this.K?.app?.heliMesh;
    if (hm) {
      hm.updateMatrixWorld();
      out.set(lx, ly, lz);
      return hm.localToWorld(out);
    }
    const p = this.K?.getHeliPos?.();
    return p ? out.copy(p) : out.set(0, 0, 0);
  }

  equip(id) {
    const K = this.K;
    if (!id) return false;
    if (id === "repair") {
      if (K?.heli) K.heli.health = Math.min(CFG.HELI_HP, K.heli.health + (CFG.REPAIR_HP || 60));
      return true;
    }
    if (id === "coolant") {
      if (K?.weapons) { K.weapons.heat = 0; K.weapons.overheated = false; }
      return true;
    }
    const defs = {
      railgun: { nameKey: "kaiju_item_railgun", charges: CFG.RAIL_SHOTS || 3 },
      swarm: { nameKey: "kaiju_item_swarm", charges: CFG.SWARM_SALVOS || 2 },
      emp: { nameKey: "kaiju_item_emp", charges: CFG.EMP_CHARGES || 2 },
      orbital: { nameKey: "kaiju_item_orbital", charges: 1 },
    };
    const def = defs[id] || defs.railgun;
    const realId = defs[id] ? id : "railgun";
    this.item = {
      id: realId,
      nameKey: def.nameKey,
      charges: def.charges,
      maxCharges: def.charges,
      cd: 0,
    };
    return true;
  }

  onKeyDown(code) {
    if (code === "KeyR") return this.fire();
    return false;
  }

  onKeyUp() { return false; }
  onPointerDown() { return false; }
  onPointerUp() { return false; }
  cancel() {}

  fire() {
    const K = this.K;
    if (!K || !K.canFire || !this.item || this.item.charges <= 0 || this.item.cd > 0) return false;
    const it = this.item;
    let ok = false;
    if (it.id === "railgun") ok = this._fireRailgun();
    else if (it.id === "swarm") ok = this._fireSwarm();
    else if (it.id === "emp") ok = this._fireEmp();
    else if (it.id === "orbital") ok = this._fireOrbital();
    if (!ok) return false;

    it.charges = Math.max(0, it.charges - 1);
    it.cd = 0.35;
    if (it.charges <= 0) {
      this.item = null;
    }
    return true;
  }

  _fireRailgun() {
    const K = this.K, k = K.kaiju;
    const muzzle = this._heliPoint(_a, 0, 0.75, 2.8).clone();
    const ray = K.getAimRay?.();
    let hitPt = null;
    let hitWeak = false;
    let hitKaiju = false;

    const livingRail = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive !== false ? [k] : []);
    let targetKaiju = null;
    if (ray) {
      let bestDist = CFG.RAIL_RANGE;
      for (const mon of livingRail) {
        const kh = mon.raycast(ray.origin, ray.dir, bestDist);
        if (kh && kh.dist < bestDist) {
          bestDist = kh.dist;
          hitPt = kh.point.clone();
          hitWeak = !!kh.weak;
          hitKaiju = true;
          targetKaiju = mon;
        }
      }
    }
    if (!hitKaiju && livingRail.length > 0) {
      for (const mon of livingRail) {
        const lp = mon.getLockPoint?.() || mon.position;
        if (lp && lp.distanceTo(muzzle) <= CFG.RAIL_RANGE) {
          hitPt = lp.clone();
          hitWeak = true;
          hitKaiju = true;
          targetKaiju = mon;
          break;
        }
      }
    }
    if (!hitPt) {
      if (ray) hitPt = ray.origin.clone().addScaledVector(ray.dir, 600);
      else hitPt = muzzle.clone().add(new THREE.Vector3(0, 0, 400));
    }

    if (hitKaiju && targetKaiju) {
      const dmg = CFG.RAIL_DAMAGE || 2400;
      targetKaiju.takeDamage(dmg, hitPt, hitWeak, { source: "railgun" });
      if (targetKaiju.laser && targetKaiju.laser.phase === "lock") {
        targetKaiju._endLaser?.(false);
        targetKaiju.nextLaser = 2.5;
      }
      if (K.stats) {
        K.stats.cannonShots = (K.stats.cannonShots || 0) + 1;
        K.stats.cannonHits = (K.stats.cannonHits || 0) + 1;
        if (hitWeak) K.stats.weakHits = (K.stats.weakHits || 0) + 1;
      }
    }

    // Visual cyan railgun beam (inner core + outer plasma)
    const dir = _b.subVectors(hitPt, muzzle);
    const len = Math.max(1, dir.length());
    dir.divideScalar(len);
    const group = new THREE.Group();
    group.position.copy(muzzle);
    group.quaternion.setFromUnitVectors(_up, dir);

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x22e8ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(this._cylGeo, outerMat);
    outer.scale.set(1.6, len, 1.6);
    const core = new THREE.Mesh(this._cylGeo, coreMat);
    core.scale.set(0.55, len, 0.55);
    group.add(outer, core);
    K.scene?.add(group);
    this._railBeams.push({ group, outer, core, outerMat, coreMat, len, t: 0, dur: 0.45 });

    K.fx?.spawn?.("muzzle", muzzle, { color: CYAN_COLOR, scale: 3.5, count: 3, life: 0.15 });
    K.fx?.spawn?.("bigExplosion", hitPt, { scale: 1.5 });
    K.fx?.spawn?.("spark", hitPt, { color: CYAN_COLOR, count: 24, speed: 70, scale: 2.5 });
    K.audio?.play?.("railgun", { pos: muzzle, gain: 1.0 });
    K.shake?.(0.65, muzzle.x, muzzle.y, muzzle.z);
    return true;
  }

  _fireSwarm() {
    this._swarmQueue += CFG.SWARM_COUNT || 12;
    this._swarmT = 0;
    return true;
  }

  _spawnSwarmMissile() {
    const K = this.K, k = K.kaiju;
    const m = this._swarm.find((x) => !x.active);
    if (!m) return;
    this._swarmSide = -this._swarmSide;
    this._heliPoint(m.pos, 1.8 * this._swarmSide, 1.05, 0.3);

    const ray = K.getAimRay?.();
    if (ray) m.dir.copy(ray.dir);
    else m.dir.set(0, 0, 1);
    m.dir.x += (Math.random() - 0.5) * 0.45;
    m.dir.y += 0.12 + Math.random() * 0.25;
    m.dir.z += (Math.random() - 0.5) * 0.45;
    m.dir.normalize();

    m.active = true;
    m.age = 0;
    m.trail = 0;
    m.sphereIdx = -1;
    m.weak = false;
    if (k && k.hitSpheres && k.hitSpheres.length > 0) {
      const wantWeak = Math.random() < (CFG.SWARM_WEAK_CHANCE || 0.35);
      const candidates = [];
      for (let i = 0; i < k.hitSpheres.length; i++) {
        if (!wantWeak || k.hitSpheres[i].weak) candidates.push(i);
      }
      const pool = candidates.length > 0 ? candidates : k.hitSpheres.map((_, idx) => idx);
      m.sphereIdx = pool[Math.floor(Math.random() * pool.length)];
      m.weak = !!k.hitSpheres[m.sphereIdx]?.weak;
    }
    K.fx?.spawn?.("muzzle", m.pos, { color: CYAN_COLOR, scale: 1.0, count: 1, life: 0.08 });
    K.audio?.play?.("missileLaunch", { pos: m.pos, gain: 0.55 });
    if (K.stats) K.stats.missilesFired = (K.stats.missilesFired || 0) + 1;
  }

  _fireEmp() {
    const K = this.K, k = K.kaiju;
    const hp = K.getHeliPos?.() || new THREE.Vector3();
    const center = (k && k.alive !== false && k.position && k.position.distanceTo(hp) <= (CFG.EMP_RANGE || 900))
      ? k.getLockPoint?.()?.clone() || k.position.clone().add(new THREE.Vector3(0, 40, 0))
      : hp.clone();

    const mat = new THREE.MeshBasicMaterial({
      color: 0x70f0ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(this._sphereGeo, mat);
    mesh.position.copy(center);
    mesh.scale.setScalar(2);
    K.scene?.add(mesh);
    this._empWaves.push({ mesh, mat, t: 0, dur: 0.75, maxR: CFG.EMP_RADIUS || 140 });

    const livingEmp = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive !== false ? [k] : []);
    for (const mon of livingEmp) {
      const center = mon.hitSpheres && mon.hitSpheres[0] ? mon.hitSpheres[0].center : mon.position;
      mon.stun?.(CFG.EMP_STUN_SECONDS || 4.5);
      mon.takeDamage?.(CFG.EMP_DAMAGE || 1600, center, true, { source: "emp" });
      K.fx?.spawn?.("spark", center, { color: CYAN_COLOR, count: 32, speed: 65, scale: 3.0 });
    }
    K.audio?.play?.("emp", { pos: hp, gain: 1.0 });
    K.shake?.(0.55, hp.x, hp.y, hp.z);
    return true;
  }

  _fireOrbital() {
    const K = this.K, k = K.kaiju;
    if (this._orbital) this._clearOrbital();
    const hp = K.getHeliPos?.() || new THREE.Vector3();
    const target = (k && k.alive !== false && k.position)
      ? k.position.clone()
      : hp.clone().add(new THREE.Vector3(0, 0, 150));
    target.y = getBeijingTerrainElevation(target.x, target.z);

    const group = new THREE.Group();
    group.position.copy(target);

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x38d9ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(this._cylGeo, outerMat);
    outer.scale.set(14, 420, 14);
    const core = new THREE.Mesh(this._cylGeo, coreMat);
    core.scale.set(5.5, 420, 5.5);
    group.add(outer, core);
    K.scene?.add(group);

    // Immediate initial orbital strike damage + stun
    const livingOrb = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive !== false ? [k] : []);
    for (const mon of livingOrb) {
      if (mon.position && mon.position.distanceTo(target) <= (CFG.ORBITAL_RADIUS || 75) + 35) {
        mon.stun?.(1.4);
        mon.takeDamage?.(CFG.ORBITAL_DAMAGE || 3200, target, true, { source: "orbital" });
      }
    }
    K.fx?.spawn?.("bigExplosion", target, { scale: 2.8 });
    K.audio?.play?.("orbital", { pos: target, gain: 1.1 });
    K.shake?.(0.85, target.x, target.y, target.z);

    this._orbital = {
      group,
      outer,
      core,
      outerMat,
      coreMat,
      pos: target,
      t: 0,
      dur: 2.5,
      tick: 0,
    };
    return true;
  }

  _clearOrbital() {
    const o = this._orbital;
    if (!o) return;
    o.group.parent?.remove(o.group);
    o.outerMat.dispose();
    o.coreMat.dispose();
    this._orbital = null;
  }

  update(dt) {
    const K = this.K;
    if (!K || !(dt > 0)) return;
    if (this.item && this.item.cd > 0) {
      this.item.cd = Math.max(0, this.item.cd - dt);
    }

    // Railgun beams fade
    for (let i = this._railBeams.length - 1; i >= 0; i--) {
      const b = this._railBeams[i];
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      const k = 1 - u;
      b.outerMat.opacity = 0.85 * k * k;
      b.coreMat.opacity = k;
      b.outer.scale.set(1.6 * (0.5 + 0.8 * k), b.len, 1.6 * (0.5 + 0.8 * k));
      if (u >= 1) {
        b.group.parent?.remove(b.group);
        b.outerMat.dispose();
        b.coreMat.dispose();
        this._railBeams.splice(i, 1);
      }
    }

    // EMP waves expand
    for (let i = this._empWaves.length - 1; i >= 0; i--) {
      const w = this._empWaves[i];
      w.t += dt;
      const u = Math.min(1, w.t / w.dur);
      w.mesh.scale.setScalar(2 + w.maxR * Math.sin(u * Math.PI * 0.5));
      w.mat.opacity = 0.8 * (1 - u);
      if (u >= 1) {
        w.mesh.parent?.remove(w.mesh);
        w.mat.dispose();
        this._empWaves.splice(i, 1);
      }
    }

    // Orbital ion pillar continuous tracking & damage
    if (this._orbital) {
      const o = this._orbital;
      o.t += dt;
      const k = K.kaiju;
      if (k && k.alive !== false && k.position) {
        o.pos.x += (k.position.x - o.pos.x) * Math.min(1, dt * 4);
        o.pos.z += (k.position.z - o.pos.z) * Math.min(1, dt * 4);
        o.pos.y = getBeijingTerrainElevation(o.pos.x, o.pos.z);
        o.group.position.copy(o.pos);
      }
      const env = Math.min(1, o.t / 0.15) * Math.min(1, (o.dur - o.t) / 0.35);
      const pulse = 0.85 + 0.15 * Math.sin(o.t * 42);
      o.outer.scale.set(14 * env * pulse, 420, 14 * env * pulse);
      o.core.scale.set(5.5 * env, 420, 5.5 * env);
      o.outerMat.opacity = 0.65 * env;
      o.coreMat.opacity = 0.95 * env;

      o.tick -= dt;
      if (o.tick <= 0) {
        o.tick = 0.2;
        const livingOrbTick = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive !== false ? [k] : []);
        for (const mon of livingOrbTick) {
          if (mon.position && mon.position.distanceTo(o.pos) <= (CFG.ORBITAL_RADIUS || 75) + 35) {
            mon.takeDamage?.(180, o.pos, true, { source: "orbital" });
          }
        }
        K.fx?.spawn?.("explosion", o.pos, { scale: 1.8 });
        K.fx?.spawn?.("spark", o.pos, { color: CYAN_COLOR, count: 10, scale: 2.0, speed: 45 });
        K.shake?.(0.3, o.pos.x, o.pos.y, o.pos.z);
      }
      if (o.t >= o.dur) this._clearOrbital();
    }

    // Swarm queue & homing micro-missiles
    if (this._swarmQueue > 0) {
      this._swarmT -= dt;
      if (this._swarmT <= 0) {
        this._spawnSwarmMissile();
        this._swarmQueue--;
        this._swarmT = CFG.SWARM_STAGGER || 0.05;
      }
    }

    let n = 0;
    const k = K.kaiju;
    const speed = CFG.SWARM_SPEED || 280;
    for (let i = 0; i < MAX_SWARM; i++) {
      const m = this._swarm[i];
      if (!m.active) continue;
      m.age += dt;
      const livingSwarm = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive !== false ? [k] : []);
      const targetKaiju = (livingSwarm.length > 0 ? livingSwarm[i % livingSwarm.length] : null) || k;
      let target = null;
      if (targetKaiju && targetKaiju.alive !== false) {
        const sp = targetKaiju.hitSpheres && targetKaiju.hitSpheres[m.sphereIdx];
        target = sp ? sp.center : (targetKaiju.getLockPoint?.() || targetKaiju.position);
      }
      if (target) {
        _a.subVectors(target, m.pos);
        const dist = _a.length();
        if (dist < 8) {
          const dmg = CFG.SWARM_DAMAGE || 320;
          targetKaiju?.takeDamage?.(dmg, target, m.weak, { source: "swarm" });
          if (K.stats) {
            K.stats.missileHits = (K.stats.missileHits || 0) + 1;
            if (m.weak) K.stats.weakHits = (K.stats.weakHits || 0) + 1;
          }
          K.fx?.spawn?.("bigExplosion", target, { scale: 0.9 });
          K.audio?.play?.("explosion", { pos: target, gain: 0.5 });
          K.shake?.(0.22, target.x, target.y, target.z);
          m.active = false;
          continue;
        }
        _a.multiplyScalar(1 / dist);
        m.dir.lerp(_a, Math.min(1, dt * 9.5)).normalize();
      }
      m.pos.addScaledVector(m.dir, speed * dt);
      if (m.age > 5.5) {
        m.active = false;
        continue;
      }
      m.trail += speed * dt;
      if (m.trail > 5) {
        m.trail = 0;
        K.fx?.spawn?.("trail", m.pos);
      }
      _q.setFromUnitVectors(_fwd, m.dir);
      _m.compose(m.pos, _q, _one);
      this.swarmMesh.setMatrixAt(n++, _m);
    }
    this.swarmMesh.count = n;
    if (n > 0) this.swarmMesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.item = null;
    this._swarmQueue = 0;
    for (const m of this._swarm) m.active = false;
    if (this.swarmMesh) this.swarmMesh.count = 0;
    while (this._railBeams.length > 0) {
      const b = this._railBeams.pop();
      b.group.parent?.remove(b.group);
      b.outerMat.dispose();
      b.coreMat.dispose();
    }
    while (this._empWaves.length > 0) {
      const w = this._empWaves.pop();
      w.mesh.parent?.remove(w.mesh);
      w.mat.dispose();
    }
    this._clearOrbital();
  }
}
