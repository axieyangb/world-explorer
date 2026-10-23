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

// Keys owned by Kaiju Defense while active (never reach main.js).
const SWALLOW = new Set(["KeyF", "KeyC", "KeyG", "Space", "Escape", "Slash", "KeyM"]);
// Flight keys ignored while the heli is down / results are shown / paused.
const FLIGHT = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft",
]);

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

    // Crash state
    this._crash = { t: 0, impactT: -1, velY: 0, vx: 0, vz: 0, spin: 0, yaw: 0, smokeT: 0 };
    this._crashPos = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();
    this._aimRay = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };

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
      skipIntro() { if (K.state === "intro") { if (K.kaiju) { K.kaiju.skipRise?.(); K.kaiju.rising = false; } K._beginFight(); } },
    };
    if (typeof window !== "undefined") window.__KAIJU__ = this;
  }

  get scene() { return this.app.scene; }
  get camera() { return this.app.camera; }

  // ---------------------------------------------------------------- systems
  _ensureSystems() {
    if (this._systemsReady) return;
    this._systemsReady = true;
    this.fx = safeNew(KaijuFx, this, "KaijuFx");
    this.audio = safeNew(KaijuAudio, this, "KaijuAudio");
    this.crowd = safeNew(KaijuCrowd, this, "KaijuCrowd");
    this.weapons = safeNew(KaijuWeapons, this, "KaijuWeapons");
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

  damagePlayer(amount, source) {
    if (!this.active || !this.heli.alive || this.paused) return;
    if (this.state !== "intro" && this.state !== "fight") return;
    if (this.heli.invuln > 0 || !(amount > 0)) return;
    this.heli.health = Math.max(0, this.heli.health - amount);
    if (this._hitCooldown <= 0) {
      this._hitCooldown = 0.22;
      this._call(this.hud, "flashHit");
      this._call(this.audio, "play", "heliHit", { pos: this.app.pos, gain: source === "breath" ? 0.6 : 1 });
      this.shake(source === "tail" || source === "body" ? 0.55 : 0.18);
    }
    if (this.heli.health <= 0) this._killHeli(source);
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
    this.active = true;
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
    const s = this.stats;
    s.cannonShots = s.cannonHits = s.missilesFired = s.missileHits = s.weakHits = 0;
    s.startTime = performance.now();
    this.time = 0;
    this._forcedCity = 0;
    this._result = null;
    this._dyingT = 0;
    this._call(this.weapons, "reset");
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
    app.yaw = yaw;
    app.camYaw = yaw;
    app.camYawOffset = 0;
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
    this._call(this.fx, "reset");
    this._call(this.audio, "stopAll");
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
  _placeHeli(x, z, alt, yaw) {
    const app = this.app;
    app.pos.set(x, getBeijingTerrainElevation(x, z) + alt, z);
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
  }

  _killHeli(source) {
    if (!this.active || !this.heli.alive) return;
    if (this.state !== "intro" && this.state !== "fight") return;
    const app = this.app;
    this.heli.alive = false;
    this.heli.health = 0;
    this.heli.lives = Math.max(0, this.heli.lives - 1);
    this._releaseWeapons();
    app.keys?.clear?.();
    const c = this._crash;
    c.t = 0;
    c.impactT = -1;
    c.velY = Math.min(0, app.heliVelY || 0) - 4;
    const spd = Math.min(40, Math.abs(app.speed || 0)) * 0.6 + 8;
    c.vx = Math.sin(app.yaw) * spd;
    c.vz = Math.cos(app.yaw) * spd;
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

    if (!this.paused) {
      if (st === "intro" || st === "fight") this.time += dt;
      if (this.heli.invuln > 0) this.heli.invuln = Math.max(0, this.heli.invuln - dt);

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
    this._call(this.audio, "update", rawDt, this.app.camera.position);
    this._call(this.hud, "update", rawDt);
  }

  postCamera(dt, rawDt = dt) {
    if (!this.active || this.paused) return;
    this._trauma = Math.max(0, this._trauma - rawDt * 0.9);
    if (this._trauma <= 0.001) return;
    this._shakeT += rawDt;
    const t = this._shakeT;
    const a = this._trauma * this._trauma;
    const cam = this.app.camera;
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
  }

  _gesture() {
    if (this._gestured) return;
    this._gestured = true;
    this._call(this.audio, "resume");
  }

  _onKey(e, down) {
    if (!this.active) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    this._gesture();
    const code = e.code;
    if (!down) this.app.keys?.delete?.(code);

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
    if (e.button !== 0 && e.button !== 2) return;
    if (down) {
      if (e.target === this.app.canvas && this.canFire) this._call(this.weapons, "onPointerDown", e.button);
    } else {
      this._call(this.weapons, "onPointerUp", e.button);
    }
  }
}
