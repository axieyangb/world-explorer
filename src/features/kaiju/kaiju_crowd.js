// Kaiju Defense: city life under attack. Pedestrians panic and flee, cars swerve / stop / reverse, cars caught in
// fire or stomp zones explode into burned wrecks. Hooks into CityTraffic (city_traffic.js) via `traffic.kaiju`:
//   car(c, dt) -> true when handled (wreck / reversing), carPost(c, dt) after the normal pose,
//   ped(p, dt) -> true when handled (fleeing / off-graph).
import * as THREE from '../../../vendor/three.module.js';
import { CFG } from './kaiju_config.js';

const MAX_THREATS = 32;
const MAX_FIRES = 10;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class KaijuCrowd {
  constructor(K) {
    this.K = K;
    this.app = K && K.app;
    this.stats = { fleeing: 0, carsDestroyed: 0 };
    this.active = false;
    this.th = { n: 0, x: new Float32Array(MAX_THREATS), z: new Float32Array(MAX_THREATS), r: new Float32Array(MAX_THREATS), t: new Float32Array(MAX_THREATS) };
    this.fires = [];
    this._ax = 0; this._az = 0; this._s = 0;
    this._p = new THREE.Vector3();
    this._frame = 0;
    this._boomT = 0;
  }

  get traffic() {
    return (this.app && this.app.traffic) || (typeof window !== 'undefined' ? window.__cityTraffic : null) || null;
  }

  activate() {
    const T = this.traffic;
    this.active = true;
    this.stats.fleeing = 0;
    this.stats.carsDestroyed = 0;
    this.T = T;
    if (!T) return;
    T.kaiju = this;
    const mult = num(CFG.PED_DENSITY_MULT, 2.5);
    T.pedMult = mult;
    T.pedCap = Math.min(T.peds ? T.peds.length : 140, Math.round((T.pedCapBase || 140) * mult));
    T.candTimer = 0; // refresh targets now
  }

  deactivate() {
    this.active = false;
    for (const f of this.fires) this._stop(f.h);
    this.fires.length = 0;
    this.th.n = 0;
    const T = this.traffic;
    if (!T) return;
    if (T.kaiju === this) T.kaiju = null;
    T.pedMult = 1;
    T.pedCap = T.pedCapBase || 140;
    for (const c of T.cars) { c.active = false; c.kWreck = 0; c.kPanic = 0; c.kSw = 0; }
    for (const p of T.peds) { p.active = false; p.state = 'walking'; p.parts = null; p.partsByName = null; p.kFlee = 0; p.kOff = 0; }
    T.candTimer = 0;
    T.fillBoost = 1;
  }

  addThreat(x, z, radius, seconds) {
    const th = this.th;
    let i = th.n;
    if (i >= MAX_THREATS) {
      i = 0;
      for (let k = 1; k < MAX_THREATS; k++) if (th.t[k] < th.t[i]) i = k;
    } else th.n++;
    th.x[i] = x; th.z[i] = z; th.r[i] = Math.max(5, radius || 50); th.t[i] = Math.max(0.1, seconds || 3);
  }

  burnZone(x, z, radius) {
    const T = this.traffic;
    this.addThreat(x, z, radius * 2.5 + 30, 5);
    if (!T || !this.active) return;
    const r2 = radius * radius;
    for (const c of T.cars) {
      if (!c.active || c.kWreck) continue;
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz > r2) continue;
      this._wreck(c);
    }
    if (typeof T.triggerImpactSphere === 'function') {
      T.triggerImpactSphere(x, 0, z, Math.max(18, radius), { force: 1.6, source: 'breath' });
    }
  }

  _wreck(c) {
    const D = this.traffic && this.traffic.damage; // [car-explosions] full explosion + charred wreck
    if (D) { if (D.hit(c, 99, c.x, c.y, c.z, 'breath', 0)) this.stats.carsDestroyed++; return; }
    c.kWreck = 1;
    c.v = 0;
    c.brake = 0;
    this.stats.carsDestroyed++;
    const K = this.K;
    const p = this._p.set(c.x, c.y + 1, c.z);
    if (K && K.fx && K.fx.spawn) K.fx.spawn('explosion', p, { scale: 0.7 });
    if (K && K.audio && K.audio.play && this._boomT <= 0) { K.audio.play('explosion', { pos: p, gain: 0.45 }); this._boomT = 0.15; }
    if (K && K.fx && K.fx.addEmitter) {
      if (this.fires.length >= MAX_FIRES) this._stop(this.fires.shift().h);
      const life = 18 + Math.random() * 10;
      const h = K.fx.addEmitter('fire', new THREE.Vector3(c.x, c.y + 1.2, c.z), { rate: 5, life, radius: 1.2, scale: 0.55 });
      if (h) this.fires.push({ h, until: life });
    }
  }

  _stop(h) {
    try { h && h.stop && h.stop(); } catch (_) { /* stub fx */ }
  }

  // Threat field at (x, z): away direction (_ax, _az) and strength _s (0..1).
  _field(x, z) {
    let ax = 0, az = 0, s = 0;
    const th = this.th;
    for (let i = 0; i < th.n; i++) {
      const dx = x - th.x[i], dz = z - th.z[i], r = th.r[i];
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 0.01, w = 1 - d / r;
      ax += (dx / d) * w; az += (dz / d) * w;
      if (w > s) s = w;
    }
    const kj = this.K && this.K.kaiju;
    if (kj && kj.position && kj.alive !== false) {
      const r = num(CFG.CROWD_KAIJU_RADIUS, 320);
      const dx = x - kj.position.x, dz = z - kj.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.01, w = 1 - d / r;
        ax += (dx / d) * w * 1.5; az += (dz / d) * w * 1.5;
        if (w > s) s = w;
      }
    }
    const l = Math.hypot(ax, az);
    if (l > 1e-6) { ax /= l; az /= l; }
    this._ax = ax; this._az = az; this._s = s;
  }

  // ---------------------------------------------------------------- CityTraffic hooks
  car(c, dt) {
    if (c.kWreck) { c.v = 0; c.brake = 0; return true; }
    this._field(c.x, c.z);
    if (this._s <= 0.02) {
      if (c.kPanic) { c.kPanic = 0; if (c.kDrv) { c.drv = c.kDrv; c.kDrv = 0; } }
      return false;
    }
    const ahead = -(this._ax * c.ux + this._az * c.uz); // > 0: threat in front
    c.kSide = this._ax * -c.uz + this._az * c.ux >= 0 ? 1 : -1; // swerve away from the threat
    if (ahead > 0.15) {
      // Brake hard, then reverse along the lane.
      c.kPanic = 2;
      const target = -num(CFG.CROWD_REVERSE_SPEED, 5) * Math.min(1, this._s * 2);
      const dv = target - c.v;
      c.v += dv > 0 ? Math.min(dv, 4 * dt) : Math.max(dv, -12 * dt);
      c.s += c.v * dt;
      if (c.s < 0) { c.s = 0; c.v = 0; }
      c.brake = 1;
      this.T._carPose(c);
      this.carPost(c, dt);
      return true;
    }
    // Threat behind / beside: floor it.
    if (c.kPanic !== 1) { c.kPanic = 1; if (!c.kDrv) { c.kDrv = c.drv; c.drv = c.drv * 1.6; } }
    return false;
  }

  carPost(c, dt) {
    const want = c.kPanic ? c.kSide * 1.4 : 0;
    const sw = c.kSw || 0;
    c.kSw = sw + (want - sw) * Math.min(1, dt * 2.5);
    if (Math.abs(c.kSw) > 0.01) { c.x += -c.uz * c.kSw; c.z += c.ux * c.kSw; }
  }

  ped(p, dt) {
    if (p.state === 'falling_apart' || p.state === 'lying') return false;
    this._field(p.x, p.z);
    const s = this._s;
    if (s > 0.03) {
      if (!(p.kFlee > 0)) { p.kJit = (Math.random() - 0.5) * 1.1; p.kSpd = 0.8 + Math.random() * 0.4; p.kHx = this._ax; p.kHz = this._az; }
      p.kFlee = 3 + Math.random() * 2;
      const cj = Math.cos(p.kJit), sj = Math.sin(p.kJit);
      const tx = this._ax * cj - this._az * sj, tz = this._ax * sj + this._az * cj;
      const k = Math.min(1, dt * 4);
      p.kHx += (tx - p.kHx) * k; p.kHz += (tz - p.kHz) * k;
    } else if (p.kFlee > 0) {
      p.kFlee -= dt;
    } else if (!p.kOff) {
      return false;
    }
    p.kOff = 1;
    p.crossState = 0;
    const l = Math.hypot(p.kHx, p.kHz) || 1;
    const hx = p.kHx / l, hz = p.kHz / l;
    const running = p.kFlee > 0;
    const v = running ? num(CFG.PANIC_RUN_SPEED, 4.2) * p.kSpd : p.v || 1.2;
    const nx = p.x + hx * v * dt, nz = p.z + hz * v * dt;
    const D = this.K && this.K.destruction;
    const inW = this.T && this.T._isPedInWater && this.T._isPedInWater(nx, p.y, nz);
    if (inW || (D && D.isInsideBuilding && ((this._frame + p.id) & 3) === 0 && D.isInsideBuilding(nx, nz))) {
      // Slide along the wall: turn away and wait a step.
      const t = p.kJit >= 0 ? 1.1 : -1.1;
      const c = Math.cos(t), sn = Math.sin(t);
      p.kHx = hx * c - hz * sn; p.kHz = hx * sn + hz * c;
    } else {
      p.x = nx; p.z = nz;
    }
    p.hx = hx; p.hz = hz;
    p.phase += dt * v * (running ? 3.4 : 5.0);
    p.amp += ((running ? 0.95 : 0.5) - p.amp) * Math.min(1, dt * 6);
    let dy = Math.atan2(hx, hz) - p.ryaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    p.ryaw += dy * Math.min(1, dt * 10);
    return true;
  }

  update(dt) {
    if (!(dt > 0)) return;
    this._frame++;
    this._boomT -= dt;
    const th = this.th;
    let w = 0;
    for (let i = 0; i < th.n; i++) {
      th.t[i] -= dt;
      if (th.t[i] > 0) {
        th.x[w] = th.x[i]; th.z[w] = th.z[i]; th.r[w] = th.r[i]; th.t[w] = th.t[i];
        w++;
      }
    }
    th.n = w;
    if (this.fires.length) {
      let k = 0;
      for (const f of this.fires) { f.until -= dt; if (f.until > 0) this.fires[k++] = f; }
      this.fires.length = k;
    }
    const T = this.traffic;
    this.T = T;
    if (!T) return;
    if (this.active && T.kaiju !== this) this.activate();
    let fl = 0;
    for (const p of T.peds) if (p.active && p.kFlee > 0) fl++;
    this.stats.fleeing = fl;
  }
}
