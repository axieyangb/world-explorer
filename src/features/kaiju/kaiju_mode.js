// Kaiju Defense mode controller (game). See DESIGN.md.
// Owns enter/exit, intro, lives, win/lose, pause, input routing, camera shake, stats and the aim-ray adapter.
import * as THREE from "../../../vendor/three.module.js";
import { getBeijingTerrainElevation } from "../../environment.js";
import { CFG } from "./kaiju_config.js";
import { KaijuFx } from "./kaiju_fx.js";
import { KaijuAudio } from "./kaiju_audio.js";
import { KaijuDestruction } from "./kaiju_destruction.js";
import { KaijuCrowd } from "./kaiju_crowd.js";
import { KaijuWeapons } from "./kaiju_weapons.js";
import { KaijuHud } from "./kaiju_hud.js";
import { Kaiju } from "./kaiju_ai.js";
import { pickSpawn } from "./kaiju_spawn.js";
import { KaijuSupply } from "./kaiju_supply.js";
import { KaijuSuper } from "./kaiju_super.js";

// Keys owned by Kaiju Defense while active (never reach main.js).
const SWALLOW = new Set(["KeyF", "KeyC", "KeyG", "Space", "Escape", "Slash", "KeyM"]);
// Flight keys ignored while the heli is down / results are shown / paused.
const FLIGHT = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft",
]);

// Dodge keys: double-tap (or Shift + Left/Right). Never swallowed, so the heli still strafes / climbs.
const DASH_KEYS = { ArrowLeft: "left", ArrowRight: "right", KeyA: "left", KeyD: "right", KeyQ: "down", KeyE: "up" };
// Mouse fire only when the press is not a camera drag.
const DRAG_PX = 6;
const DRAG_HOLD_MS = 120;
const TAP_MS = 90;

function injectStyles() {
  if (typeof document === "undefined" || document.getElementById("kaiju-styles")) return;
  const link = document.createElement("link");
  link.id = "kaiju-styles";
  link.rel = "stylesheet";
  link.href = new URL("./kaiju.css", import.meta.url).href;
  document.head.appendChild(link);
}

function safeNew(Cls, K, name) {
  try {
    return new Cls(K);
  } catch (e) {
    console.error(`[kaiju] ${name} failed to construct`, e);
    return null;
  }
}

export class KaijuMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.state = "off"; // 'off'|'intro'|'fight'|'dying'|'results'
    this.paused = false;
    this.time = 0;
    this.heli = { health: CFG.HELI_HP, lives: CFG.LIVES, alive: true, invuln: 0 };
    this.stats = { cannonShots: 0, cannonHits: 0, missilesFired: 0, missileHits: 0, weakHits: 0, startTime: 0 };

    this.fx = null;
    this.audio = null;
    this.crowd = null;
    this.weapons = null;
    this.hud = null;
    this.supply = null;
    this.super = null;
    this.kaiju = null;
    this._systemsReady = false;

    this._introT = 0;
    this._dyingT = 0;
    this._result = null;
    this._forcedCity = 0;
    this._trauma = 0;
    this._shakeT = 0;
    this._introRumble = 0;
    this._hitCooldown = 0;
    this._gestured = false;

    // Dodge + damage feedback.
    this.dash = { cooldown: 0, active: false, iframes: 0 };
    this._dash = { t: 0, dur: 1, x: 0, z: 0, dirY: 0, vert: false, side: 1, v0: 0, v1: 0, prevY: 0, cd: 0 };
    this._tap = { code: "", t: 0 };
    this._sinceHit = 99;
    this._trailT = 0;
    this._alarm = null;
    this._alarmWant = false;
    this._ptr = { btn: -1, x: 0, y: 0, t: 0, firing: false, tapUntil: 0 };
    this._dashUp0 = new THREE.Vector3();
    this._dashUp1 = new THREE.Vector3();
    this._trailPos = new THREE.Vector3();
    this._smokeOpts = { count: 1, scale: 0.3, life: 3, speed: 2, light: true, color: undefined };
    this._fireOpts = { count: 1, scale: 0.22, life: 0.35 };
    this._darkSmoke = new THREE.Color(0.3, 0.28, 0.27);

    // Crash state
    this._crash = { t: 0, impactT: -1, velY: 0, vx: 0, vz: 0, spin: 0, yaw: 0, smokeT: 0 };
    this._crashPos = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();
    this._aimRay = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    // Gunner view: camera shifted right/up so the crosshair ray clears the heli body.
    this._gunner = 0; // 0..1 blend
    this._aimPos = new THREE.Vector3();
    this._aimQuat = new THREE.Quaternion();
    this._aimValid = false;
    // GTA heli adapter (app.heli, feature/heli-gta); null when the legacy heli is in use.
    this._heliHooked = null;
    this._prevOnDamage = null;
    this._prevOnImpact = null;
    this._onHeliDamage = (amount, info) => {
      if (this._prevOnDamage) this._prevOnDamage(amount, info);
      this.damagePlayer(amount, "impact");
    };
    this._onHeliImpact = (info) => {
      if (this._prevOnImpact) this._prevOnImpact(info);
      if (info && info.speed > 0 && this.app.pos) this.shake(Math.min(0.6, info.speed / 40));
    };

    injectStyles();
    // Destruction installs its building shader patch at construction, so it must exist before chunks build.
    this.destruction = safeNew(KaijuDestruction, this, "KaijuDestruction");
    if (this.destruction) this.destruction.onCollapse = (x, z, size) => this._onCollapse(x, z, size);

    this._installInput();

    const K = this;
    this.debug = {
      forceKaijuHp(v) { if (K.kaiju) { if (K.kaiju.forceHp) K.kaiju.forceHp(v); else K.kaiju.hp = v; } },
      forceCityDamage(v) { K._forcedCity = Math.max(0, Number(v) || 0); },
      killHeli() { K._killHeli("debug"); },
      dash(dir) { return K.tryDash(dir); },
      laserNow() { return K.kaiju?.debugLaserNow?.(); },
      spawnSupply(id, x, z) { return K.supply?.spawnDrop?.(id, x, z); },
      equipSuper(id) { return K.super?.equip?.(id); },
      fireSuper() { return K.super?.fire?.(); },
      skipIntro() { if (K.state === "intro") { if (K.kaiju) { K.kaiju.skipRise?.(); K.kaiju.rising = false; } K._beginFight(); } },
    };
    if (typeof window !== "undefined") window.__KAIJU__ = this;
  }

  get scene() { return this.app.scene; }
  get camera() { return this.app.camera; }
  get tracers() { return this.weapons ? this.weapons.tracers : []; }

  // ---------------------------------------------------------------- systems
  _ensureSystems() {
    if (this._systemsReady) return;
    this._systemsReady = true;
    this.fx = safeNew(KaijuFx, this, "KaijuFx");
    this.audio = safeNew(KaijuAudio, this, "KaijuAudio");
    this.crowd = safeNew(KaijuCrowd, this, "KaijuCrowd");
    this.weapons = safeNew(KaijuWeapons, this, "KaijuWeapons");
    this.supply = safeNew(KaijuSupply, this, "KaijuSupply");
    this.super = safeNew(KaijuSuper, this, "KaijuSuper");
    this.hud = safeNew(KaijuHud, this, "KaijuHud");
  }

  _call(sys, fn, ...args) {
    if (!sys || typeof sys[fn] !== "function") return undefined;
    try {
      return sys[fn](...args);
    } catch (e) {
      if (!this._errOnce) this._errOnce = new Set();
      const key = (sys.constructor && sys.constructor.name) + "." + fn;
      if (!this._errOnce.has(key)) {
        this._errOnce.add(key);
        console.error(`[kaiju] ${key} threw`, e);
      }
      return undefined;
    }
  }

  // ---------------------------------------------------------------- public API
  scaleDt(dt) {
    if (!this.active) return dt;
    if (this.paused) return 0;
    if (this.state === "dying") return dt * CFG.DEATH_SLOWMO;
    return dt;
  }

  getHeliPos() {
    return this.app.pos;
  }

  getAimRay() {
    // Final centered, pre-shake camera pose of the last rendered frame.
    if (this._aimValid) {
      this._aimRay.origin.copy(this._aimPos);
      this._aimRay.dir.set(0, 0, -1).applyQuaternion(this._aimQuat);
      return this._aimRay;
    }
    const r = this.app.heli && typeof this.app.heli.getAimRay === "function" ? this.app.heli.getAimRay() : null;
    if (r && r.origin && r.dir) return r;
    const cam = this.app.camera;
    cam.getWorldDirection(this._aimRay.dir);
    this._aimRay.origin.copy(cam.position);
    return this._aimRay;
  }

  getCityDamage() {
    const real = this.destruction ? Number(this._call(this.destruction, "getCityDamage")) || 0 : 0;
    return Math.min(1, Math.max(real, this._forcedCity));
  }

  get canFire() {
    return this.active && !this.paused && this.heli.alive && (this.state === "intro" || this.state === "fight");
  }

  shake(strength, x, y, z) {
    if (!this.active) return;
    let atten = 1;
    if (x !== undefined && x !== null) {
      const c = this.app.camera.position;
      const dx = x - c.x, dy = (y || 0) - c.y, dz = z - c.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / 260;
      atten = 1 / (1 + d * d);
    }
    this._trauma = Math.min(1, this._trauma + Math.max(0, strength) * atten);
  }

  damagePlayer(amount, source, fromPos) {
    if (!this.active || !this.heli.alive || this.paused) return;
    if (this.state !== "intro" && this.state !== "fight") return;
    if (this.heli.invuln > 0 || !(amount > 0)) return;
    // Dodge i-frames; wall scrapes during a dodge are free too.
    if (this.dash.iframes > 0 || (source === "impact" && this.dash.active)) return;
    this.heli.health = Math.max(0, this.heli.health - amount);
    this._sinceHit = 0;
    let fx = NaN, fz = NaN;
    if (fromPos && Number.isFinite(fromPos.x)) { fx = fromPos.x; fz = fromPos.z; }
    else if (source !== "impact" && source !== "debug" && this.kaiju && this.kaiju.position) { fx = this.kaiju.position.x; fz = this.kaiju.position.z; }
    if (fx === fx) this._call(this.hud, "damageFrom", fx, fz);
    if (this._hitCooldown <= 0) {
      this._hitCooldown = 0.22;
      this._call(this.hud, "flashHit");
      this._call(this.audio, "play", "heliHit", { pos: this.app.pos, gain: source === "breath" || source === "laser" ? 0.6 : 1 });
      this.shake(source === "tail" || source === "body" ? 0.55 : source === "laser" ? 0.3 : 0.18);
    }
    if (this.heli.health <= 0) this._killHeli(source);
  }

  // ---------------------------------------------------------------- dodge
  _dashKey(code, shift) {
    const dir = DASH_KEYS[code];
    const keys = this.app.keys;
    if (!shift && keys && typeof keys.has === "function") shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const now = performance.now() * 0.001;
    if ((shift && (dir === "left" || dir === "right")) || (this._tap.code === code && now - this._tap.t <= CFG.DASH_DOUBLE_TAP)) {
      this._tap.code = "";
      this.tryDash(dir);
      return;
    }
    this._tap.code = code;
    this._tap.t = now;
  }

  // Evasive dodge: 'left'|'right' (screen-relative) or 'up'|'down'. Returns true when it starts.
  tryDash(dir) {
    if (!this.canFire || this.dash.active || this._dash.cd > 0) return false;
    const vert = dir === "up" || dir === "down";
    if (!vert && dir !== "left" && dir !== "right") return false;
    const app = this.app, p = app.pos, d = this._dash;
    let dist = vert ? CFG.DASH_VERT_DIST : CFG.DASH_DIST;
    d.vert = vert;
    d.x = d.z = d.dirY = 0;
    if (vert) {
      d.dirY = dir === "up" ? 1 : -1;
      if (d.dirY < 0) {
        dist = Math.min(dist, p.y - this._floorAt(p.x, p.z));
        if (dist < 3) return false;
      }
    } else {
      const f = this._tmpV;
      app.camera.getWorldDirection(f);
      let fx = f.x, fz = f.z;
      const l = Math.hypot(fx, fz);
      if (l < 1e-3) { fx = Math.sin(app.yaw || 0); fz = Math.cos(app.yaw || 0); } else { fx /= l; fz /= l; }
      d.side = dir === "right" ? 1 : -1;
      d.x = -fz * d.side; // screen right = (-fz, fx)
      d.z = fx * d.side;
    }
    d.dur = CFG.DASH_TIME;
    d.v1 = vert ? 4 : CFG.DASH_END_SPEED;
    d.v0 = Math.max(d.v1, (2 * dist) / d.dur - d.v1); // linear ease-out: area == dist
    d.t = 0;
    d.prevY = p.y;
    d.cd = CFG.DASH_COOLDOWN;
    this.dash.active = true;
    this.dash.iframes = CFG.DASH_IFRAMES;
    this.dash.cooldown = 1;
    this._applyDashVel(d.v0);
    this._call(this.fx, "spawn", "dustRing", p, { scale: 0.42 });
    this._call(this.fx, "spawn", "muzzle", p, { count: 4, scale: 1.4, life: 0.16 });
    this._call(this.audio, "play", "dash", { gain: 0.9 });
    return true;
  }

  // Write the dodge speed into the flight model so it carries the momentum (and never reads as a teleport).
  _applyDashVel(speed) {
    const gta = this.gtaHeli;
    const v = gta && gta.state && gta.state.velocity;
    if (!v) return;
    const d = this._dash;
    if (d.vert) {
      const c = gta.config || {};
      v.y = Math.max(-(c.MAX_VY_DOWN || 20), Math.min(c.MAX_VY_UP || 16, d.dirY * speed));
    } else {
      const k = speed - (v.x * d.x + v.z * d.z);
      v.x += d.x * k;
      v.z += d.z * k;
    }
  }

  _updateDash(dt) {
    const D = this.dash, d = this._dash;
    if (d.cd > 0) d.cd = Math.max(0, d.cd - dt);
    D.cooldown = d.cd / CFG.DASH_COOLDOWN;
    if (D.iframes > 0) D.iframes = Math.max(0, D.iframes - dt);
    if (!D.active) {
      // Responsive lateral strafe assist (±38 m/s) in Kaiju mode when ArrowLeft/ArrowRight is held
      if (this.canFire && this.gtaHeli?.state?.velocity && this.app.keys) {
        const st = (this.app.keys.has("ArrowRight") ? 1 : 0) - (this.app.keys.has("ArrowLeft") ? 1 : 0);
        if (st !== 0) {
          const v = this.gtaHeli.state.velocity, yaw = this.app.yaw || 0;
          const rx = -Math.cos(yaw) * st, rz = Math.sin(yaw) * st;
          const cur = v.x * rx + v.z * rz;
          if (cur < 38) {
            const add = Math.min(38 - cur, 65 * dt);
            v.x += rx * add;
            v.z += rz * add;
          }
        }
      }
      return;
    }
    if (!this.heli.alive) { this._endDash(); return; }
    if (!(dt > 0)) return;
    const p = this.app.pos, gta = this.gtaHeli;
    const vPrev = d.v0 + (d.v1 - d.v0) * Math.min(1, d.t / d.dur); // speed over the frame just simulated
    d.t += dt;
    const u = Math.min(1, d.t / d.dur);
    let floorHit = false;
    if (d.vert) {
      // The flight model caps vertical speed: add the rest as small per-frame steps (well under its teleport check).
      let extra = d.dirY * vPrev * dt - (p.y - d.prevY);
      if (extra * d.dirY < 0) extra = 0;
      extra = Math.max(-2.5, Math.min(2.5, extra));
      let ny = p.y + extra;
      if (d.dirY < 0) {
        const floor = this._floorAt(p.x, p.z);
        if (ny <= floor) { ny = Math.min(p.y, floor); floorHit = true; }
      }
      p.y = ny;
      d.prevY = ny;
    } else if (!gta) {
      p.x += d.x * vPrev * dt;
      p.z += d.z * vPrev * dt;
    }
    const done = u >= 1 || floorHit;
    this._applyDashVel(done ? d.v1 : d.v0 + (d.v1 - d.v0) * u);
    if (floorHit && gta && gta.state && gta.state.velocity) gta.state.velocity.y = 0;
    if (done) { this._endDash(); return; }
    this._dashPose(u);
  }

  // Roll / pitch the airframe on top of the flight model's pose (it rewrites the mesh every frame).
  _dashPose(u) {
    const m = this.app.heliMesh;
    if (!m) return;
    const d = this._dash;
    const gta = this.gtaHeli;
    if (!gta) m.rotation.set(0, this.app.yaw || 0, 0);
    const s = Math.sin(Math.PI * Math.min(1, u * 1.15));
    const up0 = this._dashUp0.set(0, 1, 0).applyQuaternion(m.quaternion);
    if (d.vert) m.rotateX(-d.dirY * 0.35 * s);
    else m.rotateZ(d.side * 1.25 * s);
    if (!gta) return;
    // Pivot about the centre of mass (~1.3 m above the skids), like the flight model.
    const up1 = this._dashUp1.set(0, 1, 0).applyQuaternion(m.quaternion);
    m.position.addScaledVector(up0, 1.3).addScaledVector(up1, -1.3);
  }

  _endDash() {
    if (!this.dash.active) return;
    this.dash.active = false;
    if (!this.gtaHeli && this.heli.alive) this._resetHeliMesh();
  }

  _floorAt(x, z) {
    let g = getBeijingTerrainElevation(x, z);
    const app = this.app;
    if (typeof app.getBuildingCeilingAt === "function") {
      const r = app.getBuildingCeilingAt(x, g, z, 6);
      if (r !== null && r !== undefined && r > g) g = r;
    }
    return g + CFG.DASH_CLEARANCE;
  }

  _resetDodge() {
    this._endDash();
    this._dash.cd = 0;
    this.dash.cooldown = 0;
    this.dash.iframes = 0;
    this._tap.code = "";
    this._sinceHit = 99;
    this._trailT = 0;
    this._syncAlarm(false);
  }

  // Repair, smoke / fire trail.
  _updateHeliFx(dt) {
    const h = this.heli, st = this.state;
    if (!h.alive || !(dt > 0) || !(st === "intro" || st === "fight" || st === "dying")) return;
    this._sinceHit += dt;
    if (st !== "dying" && this._sinceHit >= CFG.HELI_REGEN_DELAY && h.health < CFG.HELI_HP) {
      h.health = Math.min(CFG.HELI_HP, h.health + CFG.HELI_REGEN_RATE * dt);
    }
    const hf = h.health / CFG.HELI_HP;
    if (hf >= CFG.HELI_SMOKE_FRAC || !this.fx) return;
    this._trailT -= dt;
    if (this._trailT > 0) return;
    const sev = 1 - hf / CFG.HELI_SMOKE_FRAC;
    const heavy = hf < CFG.HELI_FIRE_FRAC;
    this._trailT = heavy ? 0.05 : 0.2 - 0.12 * sev;
    const p = this.app.pos, yaw = this.app.yaw || 0;
    const tp = this._trailPos.set(p.x - Math.sin(yaw) * 2.2, p.y + 1.6, p.z - Math.cos(yaw) * 2.2);
    const o = this._smokeOpts;
    o.scale = 0.25 + 0.3 * sev;
    o.life = heavy ? 4.5 : 3;
    o.light = !heavy;
    o.color = heavy ? this._darkSmoke : undefined;
    this._call(this.fx, "spawn", "smoke", tp, o);
    if (heavy) this._call(this.fx, "spawn", "fire", tp, this._fireOpts);
  }

  _syncAlarm(want) {
    const a = this._alarm;
    const dead = !!(a && a.voice && a.voice.stopped); // killed by audio.stopAll()
    if (want === this._alarmWant && !(want && dead)) return;
    this._alarmWant = want;
    if (a) { a.stop(); this._alarm = null; }
    if (want) this._alarm = this._call(this.audio, "play", "lowHpAlarm", { gain: 0.55 }) || null;
  }

  onKaijuDeath() {
    if (!this.active || this.state === "dying" || this.state === "results") return;
    this.state = "dying";
    this._dyingT = 0;
    this._call(this.audio, "stopSiren");
    this._releaseWeapons();
  }

  // ---------------------------------------------------------------- enter / exit
  enter() {
    if (this.active) return;
    this._ensureSystems();
    const app = this.app;
    if (app.mode !== "helicopter") app.setMode("helicopter");
    if (typeof app._ensureHeli === "function") app._ensureHeli();
    this._hookHeli();
    this.active = true;
    this._blurButtons();
    setTimeout(() => this._blurButtons(), 0);
    this._placeHeli(app.pos.x, app.pos.z, CFG.SPAWN_HELI_ALT, app.yaw);
    document.body.classList.add("kaiju-active");
    this._call(this.hud, "show");
    if (typeof app._updateModeAndCamBadges === "function") app._updateModeAndCamBadges();
    const pop = document.getElementById("mode-vehicle-menu");
    if (pop) pop.classList.add("hidden");
    this._startRound();
  }

  exit() {
    if (!this.active) return;
    this.active = false; // first: setMode() re-entry guard
    this.paused = false;
    this.state = "off";
    this._cleanupRound();
    this._call(this.fx, "update", 0); // [integration] flush fx.reset() to the GPU now: update() stops once inactive, so cleared smoke/fire stayed frozen on screen after Exit
    this._call(this.crowd, "deactivate");
    this._call(this.audio, "stopAll");
    this._call(this.hud, "hidePause");
    this._call(this.hud, "hide");
    document.body.classList.remove("kaiju-active");
    const app = this.app;
    if (!this.heli.alive || this._crash.impactT >= 0) {
      this._placeHeli(app.pos.x, app.pos.z, 150, app.yaw);
    }
    this.heli.alive = true;
    this._resetHeliMesh();
    this._unhookHeli();
    this._trauma = 0;
    this._forcedCity = 0;
    if (typeof app._updateModeAndCamBadges === "function") app._updateModeAndCamBadges();
  }

  restart() {
    if (!this.active) return;
    this.paused = false;
    this._call(this.hud, "hidePause");
    this._cleanupRound();
    this._call(this.crowd, "deactivate");
    const app = this.app;
    this._placeHeli(app.pos.x, app.pos.z, CFG.SPAWN_HELI_ALT, app.yaw);
    this._resetHeliMesh();
    this._startRound();
  }

  togglePause(force) {
    if (!this.active) return;
    const want = force === undefined ? !this.paused : !!force;
    if (want && (this.state === "results" || this.state === "off")) return;
    if (want === this.paused) return;
    this.paused = want;
    if (want) {
      this.app.keys?.clear?.();
      this._releaseWeapons();
      this._call(this.audio, "stopSiren");
      this._call(this.hud, "showPause");
    } else {
      if (this.state === "intro" || this.state === "fight") this._call(this.audio, "startSiren");
      this._call(this.hud, "hidePause");
    }
  }

  toggleMute() {
    if (!this.audio) return false;
    this._call(this.audio, "setMuted", !this.audio.muted);
    return !!this.audio.muted;
  }

  // ---------------------------------------------------------------- round lifecycle
  _startRound() {
    const app = this.app;
    this.heli.health = CFG.HELI_HP;
    this.heli.lives = CFG.LIVES;
    this.heli.alive = true;
    this.heli.invuln = 0;
    this._crash.impactT = -1;
    this._crash.t = 0;
    this._resetDodge();
    const s = this.stats;
    s.cannonShots = s.cannonHits = s.missilesFired = s.missileHits = s.weakHits = 0;
    s.startTime = performance.now();
    this.time = 0;
    this._forcedCity = 0;
    this._result = null;
    this._dyingT = 0;
    this._call(this.weapons, "reset");
    this._call(this.supply, "reset");
    this._call(this.super, "reset");
    this._call(this.fx, "reset");

    let spawn = null;
    try {
      spawn = pickSpawn(this);
    } catch (e) {
      console.error("[kaiju] pickSpawn failed", e);
    }
    if (!spawn) {
      const a = Math.random() * Math.PI * 2;
      spawn = { x: app.pos.x + Math.sin(a) * CFG.SPAWN_DIST, z: app.pos.z + Math.cos(a) * CFG.SPAWN_DIST, fromWater: false, targetX: app.pos.x, targetZ: app.pos.z };
    }
    this.kaiju = safeNew(Kaiju, this, "Kaiju");
    this._call(this.kaiju, "spawn", spawn);
    this._call(this.destruction, "beginTracking", spawn.x, spawn.z, CFG.CITY_TRACK_RADIUS);
    this._call(this.crowd, "activate");

    // Face the threat.
    const yaw = Math.atan2(spawn.x - app.pos.x, spawn.z - app.pos.z);
    const gta = this.gtaHeli;
    if (gta) gta.place(app.pos.x, app.pos.y, app.pos.z, yaw);
    app.yaw = yaw;
    app.camYaw = yaw;
    app.camYawOffset = 0;
    app.camPitch = 0.28;
    app.lastMouseOrbitTime = 0;
    app.heliMesh.rotation.y = yaw;

    this.state = "intro";
    this._introT = 0;
    this._introRumble = 1;
    this._call(this.hud, "showAlert");
    this._call(this.audio, "play", "alarm", { gain: 0.8 });
    this._tmpV.set(spawn.x, getBeijingTerrainElevation(spawn.x, spawn.z), spawn.z);
    this._call(this.audio, "play", "roar", { pos: this._tmpV, gain: 0.45 });
    this._call(this.audio, "startSiren");
    this._trauma = Math.max(this._trauma, 0.45);
  }

  _cleanupRound() {
    this._releaseWeapons();
    if (this.kaiju) {
      this._call(this.kaiju, "dispose");
      this.kaiju = null;
    }
    this._call(this.destruction, "restoreAll");
    this._call(this.weapons, "reset");
    this._call(this.supply, "reset");
    this._call(this.super, "reset");
    this._call(this.fx, "reset");
    this._call(this.audio, "stopAll");
    this._resetDodge();
    this._forcedCity = 0;
  }

  _beginFight() {
    if (this.state !== "intro") return;
    this.state = "fight";
    this._introRumble = 0;
  }

  _finish(win) {
    if (this.state === "results") return;
    this.state = "results";
    this.paused = false;
    this._releaseWeapons();
    this._call(this.audio, "stopSiren");
    this._call(this.hud, "hidePause");
    const s = this.stats;
    this._result = {
      win,
      time: this.time,
      cityDamage: this.getCityDamage(),
      accuracy: s.cannonShots > 0 ? s.cannonHits / s.cannonShots : 0,
      cannonHits: s.cannonHits,
      missileHits: s.missileHits,
    };
    this._call(this.hud, "showResults", this._result);
  }

  // ---------------------------------------------------------------- heli
  get gtaHeli() {
    const h = this.app.heli;
    return h && typeof h.place === "function" ? h : null;
  }

  _hookHeli() {
    const h = this.gtaHeli;
    if (!h || this._heliHooked === h) return;
    this._unhookHeli();
    this._heliHooked = h;
    this._prevOnDamage = h.onDamage || null;
    this._prevOnImpact = h.onImpact || null;
    h.onDamage = this._onHeliDamage;
    h.onImpact = this._onHeliImpact;
  }

  _unhookHeli() {
    const h = this._heliHooked;
    if (!h) return;
    if (h.onDamage === this._onHeliDamage) h.onDamage = this._prevOnDamage;
    if (h.onImpact === this._onHeliImpact) h.onImpact = this._prevOnImpact;
    h.inputEnabled = true;
    this._heliHooked = null;
    this._prevOnDamage = this._prevOnImpact = null;
  }

  // Flight input allowed only while flying a live heli in an unpaused round.
  _syncHeliInput() {
    const h = this.gtaHeli;
    if (!h) return;
    const want = !this.active || (!this.paused && this.heli.alive && (this.state === "intro" || this.state === "fight"));
    if (h.inputEnabled !== want) h.inputEnabled = want;
  }

  _placeHeli(x, z, alt, yaw) {
    const app = this.app;
    const gta = this.gtaHeli;
    if (gta) gta.place(x, getBeijingTerrainElevation(x, z) + alt, z, yaw);
    else app.pos.set(x, getBeijingTerrainElevation(x, z) + alt, z);
    app.speed = 0;
    app.heliVelY = 0;
    app.yaw = yaw;
    app.camYaw = yaw;
    app.camYawOffset = 0;
    app.keys?.clear?.();
    if (app.camPivot) app.camPivot.copy(app.pos);
    if (app.heliMesh) {
      app.heliMesh.position.copy(app.pos);
      app.heliMesh.rotation.set(0, yaw, 0);
    }
  }

  _resetHeliMesh() {
    const m = this.app.heliMesh;
    if (!m) return;
    m.visible = this.app.mode === "helicopter";
    m.rotation.set(0, this.app.yaw, 0);
    const f = m.userData && m.userData.fuselage;
    if (f) f.rotation.set(0, 0, 0);
  }

  _releaseWeapons() {
    const w = this.weapons;
    if (!w) return;
    this._call(w, "onKeyUp", "Space");
    this._call(w, "onKeyUp", "KeyF");
    this._call(w, "onPointerUp", 0);
    this._call(w, "onPointerUp", 2);
    this._call(this.super, "cancel"); // optional: drop a held charge without firing
    if (this._ptr) this._ptr.btn = -1;
  }

  _killHeli(source) {
    if (!this.active || !this.heli.alive) return;
    if (this.state !== "intro" && this.state !== "fight") return;
    const app = this.app;
    this.heli.alive = false;
    this._endDash();
    this.heli.health = 0;
    this.heli.lives = Math.max(0, this.heli.lives - 1);
    this._releaseWeapons();
    app.keys?.clear?.();
    const c = this._crash;
    c.t = 0;
    c.impactT = -1;
    const gv = this.gtaHeli && this.gtaHeli.state && this.gtaHeli.state.velocity;
    if (gv) {
      c.velY = Math.min(0, gv.y) - 4;
      c.vx = gv.x * 0.6 + Math.sin(app.yaw) * 8;
      c.vz = gv.z * 0.6 + Math.cos(app.yaw) * 8;
      this.gtaHeli.inputEnabled = false;
    } else {
      c.velY = Math.min(0, app.heliVelY || 0) - 4;
      const spd = Math.min(40, Math.abs(app.speed || 0)) * 0.6 + 8;
      c.vx = Math.sin(app.yaw) * spd;
      c.vz = Math.cos(app.yaw) * spd;
    }
    c.yaw = app.yaw;
    c.spin = 3.2 + Math.random() * 1.6;
    c.smokeT = 0;
    this._crashPos.copy(app.pos);
    app.speed = 0;
    app.heliVelY = 0;
    this._call(this.fx, "spawn", "explosion", app.pos, { scale: 0.8 });
    this._call(this.audio, "play", "explosion", { pos: app.pos, gain: 0.8 });
    this._call(this.hud, "flashHit");
    this.shake(0.7);
  }

  _updateCrash(dt) {
    const app = this.app;
    const c = this._crash;
    const p = this._crashPos;
    c.t += dt;
    if (c.impactT < 0) {
      c.velY -= 24 * dt;
      p.x += c.vx * dt;
      p.z += c.vz * dt;
      p.y += c.velY * dt;
      c.yaw += c.spin * dt;
      let ground = getBeijingTerrainElevation(p.x, p.z);
      const roof = typeof app.getBuildingCeilingAt === "function" ? app.getBuildingCeilingAt(p.x, p.y - 1, p.z, 2.2) : null;
      if (roof !== null && roof !== undefined && roof > ground) ground = roof;
      c.smokeT -= dt;
      if (c.smokeT <= 0) {
        c.smokeT = 0.06;
        this._call(this.fx, "spawn", "smoke", p, { count: 2, scale: 0.6 });
      }
      if (p.y <= ground + 0.5 || c.t > 6) {
        p.y = ground + 0.5;
        c.impactT = c.t;
        this._call(this.fx, "spawn", "bigExplosion", p, { scale: 1 });
        this._call(this.audio, "play", "crash", { pos: p, gain: 1 });
        this.shake(1.0, p.x, p.y, p.z);
        if (app.heliMesh) app.heliMesh.visible = false;
      }
    } else if (c.t - c.impactT >= CFG.RESPAWN_DELAY) {
      if (this.heli.lives <= 0) {
        this._finish(false);
        return;
      }
      this._respawn();
      return;
    }
    app.pos.copy(p);
    app.speed = 0;
    app.heliVelY = 0;
    const gta = this.gtaHeli;
    if (gta && gta.state && gta.state.velocity) {
      // Keep its velocity equal to the spiral so per-frame steps never read as a teleport (> 3 m + v*dt*3).
      if (c.impactT < 0) gta.state.velocity.set(c.vx, c.velY, c.vz);
      else gta.state.velocity.set(0, 0, 0);
    }
    const m = app.heliMesh;
    if (m && c.impactT < 0) {
      m.position.copy(p);
      m.rotation.set(0, c.yaw, 0);
      const f = m.userData && m.userData.fuselage;
      if (f) {
        f.rotation.x = Math.min(0.6, c.t * 0.25);
        f.rotation.z = Math.sin(c.t * 2.1) * 0.35 + 0.3;
      }
    }
  }

  _respawn() {
    const app = this.app;
    const k = this.kaiju;
    let x = this._crashPos.x, z = this._crashPos.z;
    let yaw = app.yaw;
    if (k && k.position) {
      let dx = this._crashPos.x - k.position.x;
      let dz = this._crashPos.z - k.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      x = k.position.x + dx * CFG.RESPAWN_DIST;
      z = k.position.z + dz * CFG.RESPAWN_DIST;
      yaw = Math.atan2(k.position.x - x, k.position.z - z);
    }
    this._placeHeli(x, z, CFG.RESPAWN_ALT, yaw);
    this.heli.alive = true;
    this.heli.health = CFG.HELI_HP;
    this.heli.invuln = CFG.RESPAWN_INVULN;
    this._crash.impactT = -1;
    this._resetDodge();
    this._resetHeliMesh();
  }

  _onCollapse(x, z, size) {
    if (!this.active) return;
    this._tmpV.set(x, getBeijingTerrainElevation(x, z), z);
    this._call(this.audio, "play", "collapse", { pos: this._tmpV, gain: Math.min(1, 0.4 + (size || 20) / 80) });
    this.shake(Math.min(0.8, 0.2 + (size || 20) / 100), x, this._tmpV.y, z);
  }

  // ---------------------------------------------------------------- frame
  update(dt, rawDt = dt) {
    if (!this.active) return;
    const st = this.state;
    if (this._hitCooldown > 0) this._hitCooldown -= rawDt;
    if (this.app.heli && this._heliHooked !== this.app.heli) this._hookHeli();
    this._syncHeliInput();
    this._updatePointerFire();

    if (!this.paused) {
      if (st === "intro" || st === "fight") this.time += dt;
      if (this.heli.invuln > 0) this.heli.invuln = Math.max(0, this.heli.invuln - dt);
      this._updateDash(dt);
      this._updateHeliFx(dt);

      if (!this.heli.alive && (st === "intro" || st === "fight")) this._updateCrash(dt);
      else if (this.app.heliMesh && this.heli.alive) {
        const inv = this.heli.invuln;
        this.app.heliMesh.visible = inv <= 0 || Math.floor(inv * 12) % 2 === 0;
      }

      if (st === "intro") {
        this._introT += dt;
        const k = this.kaiju;
        const minT = CFG.ALERT_SECONDS;
        if ((this._introT >= minT && !(k && k.rising)) || this._introT >= CFG.ALERT_SECONDS + CFG.RISE_SECONDS + 3) {
          this._beginFight();
        } else if (k && k.rising) {
          // Low rumble while it rises.
          this._trauma = Math.max(this._trauma, 0.12);
        }
      }

      this._call(this.kaiju, "update", dt);
      this._call(this.destruction, "update", dt);
      this._call(this.crowd, "update", dt);
      this._call(this.weapons, "update", dt);
      this._call(this.supply, "update", dt);
      this._call(this.super, "update", dt);
      this._call(this.fx, "update", dt);

      if (this.state === "fight" || this.state === "intro") {
        if (this.kaiju && this.kaiju.hp <= 0) this.onKaijuDeath();
        else if (this.getCityDamage() >= 1) this._finish(false);
      }
      if (this.state === "dying") {
        this._dyingT += rawDt;
        if (this._dyingT >= CFG.DEATH_SECONDS) this._finish(true);
      }
    }
    const s2 = this.state;
    this._syncAlarm(!this.paused && this.heli.alive && (s2 === "intro" || s2 === "fight") && this.heli.health < CFG.HELI_HP * CFG.HELI_ALARM_FRAC);
    this._call(this.audio, "update", rawDt, this.app.camera.position);
    this._call(this.hud, "update", rawDt);
  }

  postCamera(dt, rawDt = dt) {
    const cam = this.app.camera;
    const ownCam = !!(this.app.heli && typeof this.app.heli.getAimRay === "function");
    const wantG = this.active && !ownCam && this.heli.alive && (this.state === "intro" || this.state === "fight" || this.state === "dying") ? 1 : 0;
    if (!this.paused) this._gunner += (wantG - this._gunner) * Math.min(1, rawDt * 2.5);
    if (Math.abs(this._gunner - wantG) < 0.002) this._gunner = wantG;
    if (this._gunner > 0 && !ownCam) {
      cam.translateX(CFG.GUNNER_CAM_RIGHT * this._gunner);
      cam.translateY(CFG.GUNNER_CAM_UP * this._gunner);
    }
    if (!this.active) {
      this._aimValid = false;
      return;
    }
    this._aimPos.copy(cam.position);
    this._aimQuat.copy(cam.quaternion);
    this._aimValid = true;
    if (this.paused) return;
    this._trauma = Math.max(0, this._trauma - rawDt * 0.9);
    if (this._trauma <= 0.001) return;
    this._shakeT += rawDt;
    const t = this._shakeT;
    const a = this._trauma * this._trauma;
    // Sum of incommensurate sines: cheap smooth noise, no allocations.
    const nx = Math.sin(t * 37.1) * 0.6 + Math.sin(t * 13.7 + 1.3) * 0.4;
    const ny = Math.sin(t * 41.3 + 2.1) * 0.6 + Math.sin(t * 17.9 + 0.7) * 0.4;
    const nr = Math.sin(t * 29.3 + 4.2) * 0.7 + Math.sin(t * 11.1 + 3.3) * 0.3;
    cam.position.x += nx * a * 1.6;
    cam.position.y += ny * a * 1.2;
    cam.rotateZ(nr * a * 0.05);
    cam.rotateX(ny * a * 0.025);
  }

  // ---------------------------------------------------------------- input
  _installInput() {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", (e) => this._onKey(e, true), true);
    window.addEventListener("keyup", (e) => this._onKey(e, false), true);
    window.addEventListener("pointerdown", (e) => this._onPointer(e, true), true);
    window.addEventListener("pointerup", (e) => this._onPointer(e, false), true);
    window.addEventListener("pointermove", (e) => this._onPointerMove(e), true);
    window.addEventListener("click", () => { if (this.active) this._blurButtons(); }, true);
  }

  _blurButtons() {
    const a = typeof document !== "undefined" ? document.activeElement : null;
    if (a && a !== document.body && a.tagName !== "INPUT" && a.tagName !== "TEXTAREA" && typeof a.blur === "function") a.blur();
  }

  _ptrSend(down) {
    const b = this._ptr.btn;
    const fn = down ? "onPointerDown" : "onPointerUp";
    this._call(this.weapons, fn, b);
    this._call(this.super, fn, b);
  }

  // Arms mouse fire once the press has been still for DRAG_HOLD_MS; ends a quick tap after TAP_MS.
  _updatePointerFire() {
    const P = this._ptr;
    if (P.btn < 0) return;
    const now = performance.now();
    if (P.tapUntil > 0) {
      if (now >= P.tapUntil) { this._ptrSend(false); P.btn = -1; P.firing = false; P.tapUntil = 0; }
      return;
    }
    if (!P.firing && now - P.t >= DRAG_HOLD_MS && this.canFire) {
      P.firing = true;
      this._ptrSend(true);
    }
  }

  _onPointerMove(e) {
    const P = this._ptr;
    if (!this.active || P.btn < 0 || P.tapUntil > 0) return;
    if (Math.abs(e.clientX - P.x) + Math.abs(e.clientY - P.y) <= DRAG_PX) return;
    // It is a camera drag: never fire (and stop if it already started).
    if (P.firing) this._ptrSend(false);
    P.firing = false;
    P.btn = -1;
  }

  _gesture() {
    if (this._gestured) return;
    this._gestured = true;
    this._call(this.audio, "resume");
  }

  _onKey(e, down) {
    if (!this.active) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    this._gesture();
    const code = e.code;
    if (!down) this.app.keys?.delete?.(code);
    if (code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowUp" || code === "ArrowDown") e.preventDefault(); // no page scroll; still reaches the heli
    if (down && !e.repeat && DASH_KEYS[code]) this._dashKey(code, e.shiftKey);

    if (code === "KeyR") {
      // Super weapon (K.super).
      e.stopImmediatePropagation();
      e.preventDefault();
      if (down) {
        if (!e.repeat && this.canFire) this._call(this.super, "onKeyDown", code);
      } else {
        this._call(this.super, "onKeyUp", code);
      }
      return;
    }
    if (SWALLOW.has(code)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (code === "Escape") {
        if (down && !e.repeat) this.togglePause();
        return;
      }
      if (down) {
        if (!e.repeat && this.canFire) this._call(this.weapons, "onKeyDown", code);
      } else {
        this._call(this.weapons, "onKeyUp", code);
      }
      return;
    }
    if (down && FLIGHT.has(code) && (this.paused || !this.heli.alive || this.state === "results" || this.state === "dying")) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }

  _onPointer(e, down) {
    if (!this.active) return;
    this._gesture();
    // Dock / card buttons must not keep focus, or Space would click them.
    if (!down && e.target && e.target.closest && e.target.closest("button")) setTimeout(() => this._blurButtons(), 0);
    if (e.button !== 0 && e.button !== 2) return;
    const P = this._ptr;
    if (down) {
      if (e.target === this.app.canvas && this.canFire) {
        if (P.btn >= 0 && P.firing) this._ptrSend(false);
        P.btn = e.button; P.x = e.clientX; P.y = e.clientY; P.t = performance.now(); P.firing = false; P.tapUntil = 0;
      }
      return;
    }
    if (P.btn === e.button && P.tapUntil === 0) {
      if (!P.firing) {
        // Quick still click: a short burst / one missile salvo.
        if (this.canFire) { P.firing = true; this._ptrSend(true); P.tapUntil = performance.now() + TAP_MS; return; }
      } else {
        this._ptrSend(false);
      }
      P.btn = -1;
      P.firing = false;
      return;
    }
    if (P.tapUntil === 0 || P.btn !== e.button) {
      this._call(this.weapons, "onPointerUp", e.button);
      this._call(this.super, "onPointerUp", e.button);
    }
  }
}
