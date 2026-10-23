// GTA V-style helicopter: flight model, camera assist, rotor wash and procedural rotor audio.
//
// Controls (keyboard / gamepad standard mapping):
//   W / S  (RT / LT)            collective up / down; released -> hover throttle
//   A / D  (LB / RB)            yaw left / right (tail rotor)
//   Up / Down, Numpad 8 / 5     pitch nose down / nose up   (left stick Y)
//   Left / Right, Numpad 4 / 6  roll left / right           (left stick X)
//   Mouse drag / right stick    free-look; camera recenters behind the heli after ~1.5 s
//   Shift                       mild boost
//
// Public API (app.heli):
//   heli.state        live flight state (see constructor); position is app.pos (shared Vector3)
//   heli.getAimRay(ndcX = 0, ndcY = 0) -> { origin: Vector3, dir: Vector3 } through the crosshair
//   heli.place(x, y, z, yaw)  teleport + reset (velocity, attitude, rotor at speed)
//   heli.inputEnabled  false -> flight inputs ignored (heli keeps hovering / falling)
//   heli.onDamage(amount, info) / heli.onImpact(info) / heli.onLand(info)   assignable hooks
//   heli.config        tunables (CFG)
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';

const D2R = Math.PI / 180;
export const CFG = {
  G: 9.81,
  HOVER_THR: 0.5,
  THR_RESP: 2.6,          // 1/s throttle response
  THRUST_MIN: 0.3,        // x g at throttle 0
  THRUST_MAX: 1.75,       // x g at throttle 1
  BOOST: 1.15,            // Shift: thrust and top speed multiplier (mild)
  HORIZ_GAIN: 1.45,       // arcade: horizontal share of rotor thrust
  DRAG_L: 0.03, DRAG_Q: 0.00165,       // horizontal drag -> ~250 km/h at full pitch
  VDRAG_L: 0.55, VDRAG_Q: 0.004,       // vertical drag
  IDLE_HDRAG: 0.16,       // extra horizontal bleed with no cyclic input
  MAX_VY_UP: 16, MAX_VY_DOWN: 20,
  MAX_PITCH: 40 * D2R, MAX_ROLL: 45 * D2R,
  ATT_GAIN: 2.2,          // attitude command -> angular rate
  PITCH_RATE: 1.5, ROLL_RATE: 1.8, YAW_RATE: 1.0, MAX_YAW_RATE: 1.4,
  ANG_RESP: 3.2,          // angular inertia (1/s)
  BRAKE_K: 0.011, BRAKE_MAX: 0.28,     // auto-stabiliser tilts against drift
  COORD_TURN: 0.9,        // banked-turn yaw tendency
  COORD_MAX: 0.7,         // rad/s cap on the banked-turn yaw rate
  GROUND_EFFECT_H: 8, GROUND_EFFECT: 0.12,
  LAND_ASSIST_H: 15,      // descent is cushioned below this AGL
  HARD_LANDING: 7.0,      // m/s vertical impact before damage
  HARD_IMPACT: 6.0,       // m/s impact into a wall before damage
  DAMAGE_PER_MPS: 5.0,
  RADIUS: 4.2,            // body/rotor collision radius
  SPINUP_S: 2.6,
  CAM_RECENTER_S: 1.5,
  CAM_LAG: 9.0,           // 1/s pivot follow rate
  FOV_ADD: 8.0,
  WIND: 0.35,             // m/s^2 buffeting
  MAX_ALT: 2600,
};

const thrustRatio = (t) =>
  t <= CFG.HOVER_THR
    ? CFG.THRUST_MIN + (1 - CFG.THRUST_MIN) * (t / CFG.HOVER_THR)
    : 1 + (CFG.THRUST_MAX - 1) * ((t - CFG.HOVER_THR) / (1 - CFG.HOVER_THR));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export class HeliFlight {
  constructor(app, { halfWorld = 20000 } = {}) {
    this.app = app;
    this.halfWorld = halfWorld;
    this.config = CFG;
    this.inputEnabled = true;
    this.onDamage = null;
    this.onImpact = null;
    this.onLand = null;
    this.state = {
      position: app.pos,                 // shared with app (do not replace)
      velocity: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      yaw: app.yaw || 0, pitch: 0, roll: 0, // pitch > 0 nose down, roll > 0 right bank
      angularVelocity: new THREE.Vector3(), // x pitch, y yaw, z roll (rad/s)
      throttle: CFG.HOVER_THR,
      rpm: 1,
      grounded: false,
      agl: 0,
      speedKmh: 0,
      lastImpact: 0,
    };
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._up = new THREE.Vector3();
    this._lastPos = app.pos.clone();
    this._camPivot = app.pos.clone();
    this._shake = 0;
    this._t = 0;
    this._aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._initWash();
    this._audio = null;
    const unlock = () => { if (app.mode === 'helicopter') this._ensureAudio(); };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  // ---------------------------------------------------------------- API
  getAimRay(ndcX = 0, ndcY = 0) {
    const cam = this.app.camera;
    this._ndc.set(ndcX, ndcY);
    this._ray.setFromCamera(this._ndc, cam);
    this._aim.origin.copy(this._ray.ray.origin);
    this._aim.dir.copy(this._ray.ray.direction);
    return this._aim;
  }

  place(x, y, z, yaw = this.state.yaw) {
    const s = this.state;
    this.app.pos.set(x, y, z);
    s.velocity.set(0, 0, 0);
    s.angularVelocity.set(0, 0, 0);
    s.yaw = yaw; s.pitch = 0; s.roll = 0;
    s.throttle = CFG.HOVER_THR;
    s.rpm = 1;
    this.app.yaw = yaw;
    this._lastPos.copy(this.app.pos);
    this._camPivot.copy(this.app.pos);
  }

  /** Called by app.setMode when switching into helicopter mode. */
  onEnter() {
    const app = this.app, s = this.state;
    this.place(app.pos.x, app.pos.y, app.pos.z, app.yaw);
    const sup = this._support(app.pos.x, app.pos.z, app.pos.y + 0.3);
    s.grounded = app.pos.y - sup < 0.3;
    s.rpm = s.grounded ? 0.12 : 1; // spin up when starting on the ground
    if (s.grounded) s.throttle = 0;
    app.camYaw = app.yaw;
  }

  // ---------------------------------------------------------------- input
  _readInput() {
    const k = this.app.keys;
    const has = (c) => k.has(c);
    const inp = {
      collective: (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0),
      yaw: (has('KeyA') ? 1 : 0) - (has('KeyD') ? 1 : 0), // +1 = left (yaw grows toward screen-left)
      pitch: (has('ArrowUp') || has('Numpad8') ? 1 : 0) - (has('ArrowDown') || has('Numpad5') || has('Numpad2') ? 1 : 0),
      roll: (has('ArrowRight') || has('Numpad6') ? 1 : 0) - (has('ArrowLeft') || has('Numpad4') ? 1 : 0),
      camX: 0, camY: 0,
    };
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) {
      for (const p of pads) {
        if (!p || !p.connected || p.axes.length < 4) continue;
        const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
        inp.roll = clamp(inp.roll + dz(p.axes[0]), -1, 1);
        inp.pitch = clamp(inp.pitch - dz(p.axes[1]), -1, 1);
        inp.camX = dz(p.axes[2]);
        inp.camY = dz(p.axes[3]);
        inp.collective = clamp(inp.collective + b(7) - b(6), -1, 1);
        inp.yaw = clamp(inp.yaw + b(4) - b(5), -1, 1);
        break;
      }
    }
    if (!this.inputEnabled) { inp.collective = inp.yaw = inp.pitch = inp.roll = 0; }
    return inp;
  }

  // ---------------------------------------------------------------- world queries
  _forBoxes(x, z, r, fn) {
    const app = this.app, seen = new Set();
    for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const [cx, cz] = app.worldToChunk(x + ox, z + oz);
      const key = `${cx},${cz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ch = app.loadedChunks.get(key);
      const boxes = ch && ch.userData.buildingColliders;
      if (!boxes) continue;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
        fn(b);
      }
    }
  }

  _inside(b, x, z) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    return !(b.flatOuter && b.flatOuter.length >= 6) || pointInRing(x - b.ox, z - b.oz, b.flatOuter);
  }

  _terrain(x, z) {
    return Math.max(getChunkTerrainMeshElevation(x, z), getBeijingTerrainElevation(x, z));
  }

  /** Highest landable surface at (x,z) not above refY: terrain, elevated roads, roofs. */
  _support(x, z, refY) {
    let y = this._terrain(x, z);
    const s = this.app.sampleRoadSurface(x, refY, z);
    if (s && Number.isFinite(s.y) && s.y <= refY + 0.3 && s.y > y) y = s.y;
    this._forBoxes(x, z, 0.6, (b) => {
      if (b.h <= refY + 0.3 && b.h > y && this._inside(b, x, z)) y = b.h;
    });
    const w = this.app.water;
    if (w && typeof w.heliMinY === 'function') y = Math.max(y, w.heliMinY(x, z) || -Infinity);
    return y;
  }

  /** Push a circle at skid height y out of building walls whose roof is above y. */
  _walls(x, y, z, out) {
    const R = CFG.RADIUS;
    let px = x, pz = z, hit = false, nx = 0, nz = 0;
    this._forBoxes(x, z, R, (b) => {
      if (b.h <= y + 0.35) return; // we are above this roof
      const ring = b.flatOuter && b.flatOuter.length >= 6 ? b.flatOuter : null;
      const lx = px - (ring ? b.ox : 0), lz = pz - (ring ? b.oz : 0);
      const pts = ring || [b.minX, b.minZ, b.maxX, b.minZ, b.maxX, b.maxZ, b.minX, b.maxZ];
      let best = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const ax = pts[j], az = pts[j + 1], ex = pts[i] - ax, ez = pts[i + 1] - az;
        const L2 = ex * ex + ez * ez || 1e-9;
        const t = clamp(((lx - ax) * ex + (lz - az) * ez) / L2, 0, 1);
        const qx = ax + ex * t, qz = az + ez * t, d2 = (lx - qx) ** 2 + (lz - qz) ** 2;
        if (d2 < best) { best = d2; bx = qx; bz = qz; }
      }
      const inside = pointInRing(lx, lz, pts);
      const d = Math.sqrt(best);
      if (!inside && d >= R) return;
      let ux = lx - bx, uz = lz - bz;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      if (inside) { ux = -ux; uz = -uz; }
      const push = inside ? d + R : R - d;
      px += ux * push; pz += uz * push;
      nx += ux; nz += uz; hit = true;
    });
    const nl = Math.hypot(nx, nz) || 1;
    out.x = px; out.z = pz; out.hit = hit; out.nx = nx / nl; out.nz = nz / nl;
    return out;
  }

  // ---------------------------------------------------------------- update
  update(dt, { boost = false } = {}) {
    const app = this.app, s = this.state, p = app.pos, v = s.velocity;
    this._t += dt;

    // External teleport / respawn (setMode, map teleport, kaiju _placeHeli): reset dynamics.
    if (p.distanceTo(this._lastPos) > 3 + v.length() * dt * 3) this.place(p.x, p.y, p.z, app.yaw);

    const inp = this._readInput();
    const cyclic = Math.abs(inp.pitch) + Math.abs(inp.roll) > 0.01;

    // Rotor spin-up and throttle.
    s.rpm = Math.min(1, s.rpm + dt / CFG.SPINUP_S);
    const thrTarget = clamp(CFG.HOVER_THR + inp.collective * 0.5, 0, 1);
    s.throttle = approach(s.throttle, s.grounded && inp.collective <= 0 ? Math.min(thrTarget, 0.35) : thrTarget, CFG.THR_RESP, dt);

    // Horizontal velocity in the heading frame.
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); // forward
    const rx = -fz, rz = fx;                          // right
    const vF = v.x * fx + v.z * fz, vR = v.x * rx + v.z * rz;
    const hs = Math.hypot(v.x, v.z);

    // Attitude command (GTA feel): stick -> target angle; no stick -> self-level and brake drift.
    let tP, tR;
    if (s.grounded) { tP = 0; tR = 0; }
    else {
      tP = cyclic ? inp.pitch * CFG.MAX_PITCH : -clamp(vF * CFG.BRAKE_K, -CFG.BRAKE_MAX, CFG.BRAKE_MAX);
      tR = cyclic ? inp.roll * CFG.MAX_ROLL : -clamp(vR * CFG.BRAKE_K, -CFG.BRAKE_MAX, CFG.BRAKE_MAX);
      if (cyclic && !inp.pitch) tP = -clamp(vF * CFG.BRAKE_K * 0.3, -0.1, 0.1);
      if (cyclic && !inp.roll) tR = -clamp(vR * CFG.BRAKE_K, -CFG.BRAKE_MAX, CFG.BRAKE_MAX);
    }
    const w = s.angularVelocity;
    const gain = s.grounded ? 8 : CFG.ATT_GAIN;
    w.x = approach(w.x, clamp((tP - s.pitch) * gain, -CFG.PITCH_RATE, CFG.PITCH_RATE), CFG.ANG_RESP, dt);
    w.z = approach(w.z, clamp((tR - s.roll) * gain, -CFG.ROLL_RATE, CFG.ROLL_RATE), CFG.ANG_RESP, dt);
    const coord = s.grounded ? 0 : clamp(-Math.tan(s.roll) * CFG.G / Math.max(hs, 18) * Math.min(1, hs / 12) * CFG.COORD_TURN, -CFG.COORD_MAX, CFG.COORD_MAX);
    const yawAuth = s.grounded ? (s.rpm > 0.6 ? 0.4 : 0) : 1;
    w.y = approach(w.y, clamp(inp.yaw * CFG.YAW_RATE * yawAuth + coord, -CFG.MAX_YAW_RATE, CFG.MAX_YAW_RATE), CFG.ANG_RESP * 0.9, dt);
    s.pitch = clamp(s.pitch + w.x * dt, -CFG.MAX_PITCH, CFG.MAX_PITCH);
    s.roll = clamp(s.roll + w.z * dt, -CFG.MAX_ROLL, CFG.MAX_ROLL);
    s.yaw += w.y * dt;
    s.yaw -= Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2; // keep bounded
    // tiny buffeting in attitude
    const gust = CFG.WIND * (Math.sin(this._t * 0.9) * 0.6 + Math.sin(this._t * 2.3 + 1.7) * 0.4);
    this._euler.set(s.pitch + gust * 0.004, s.yaw, s.roll + gust * 0.006, 'YXZ');
    s.quaternion.setFromEuler(this._euler);
    const up = this._up.set(0, 1, 0).applyQuaternion(s.quaternion);

    // Forces.
    const sup0 = this._support(p.x, p.z, p.y + 0.3);
    s.agl = Math.max(0, p.y - sup0);
    const ge = s.agl < CFG.GROUND_EFFECT_H ? CFG.GROUND_EFFECT * (1 - s.agl / CFG.GROUND_EFFECT_H) : 0;
    const T = CFG.G * thrustRatio(s.throttle) * s.rpm * s.rpm * (1 + ge) * (boost ? CFG.BOOST : 1);
    let ax = up.x * T * CFG.HORIZ_GAIN, az = up.z * T * CFG.HORIZ_GAIN, ay = up.y * T - CFG.G;
    const hd = CFG.DRAG_L + CFG.DRAG_Q * hs / (boost ? CFG.BOOST * CFG.BOOST : 1) + (cyclic ? 0 : CFG.IDLE_HDRAG);
    ax -= v.x * hd; az -= v.z * hd;
    ay -= v.y * (CFG.VDRAG_L + CFG.VDRAG_Q * Math.abs(v.y));
    if (!s.grounded) {
      ax += gust * Math.sin(this._t * 0.37);
      az += gust * Math.cos(this._t * 0.29);
      ay += gust * 0.3 * Math.sin(this._t * 1.3);
    }
    v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
    v.y = clamp(v.y, -CFG.MAX_VY_DOWN, CFG.MAX_VY_UP);
    if (s.agl < CFG.LAND_ASSIST_H && inp.collective <= 0 && v.y < 0) v.y = Math.max(v.y, -(1.5 + s.agl * 0.55));

    // Integrate with swept sub-steps (never tunnel through walls).
    const steps = Math.min(10, Math.max(1, Math.ceil((v.length() * dt) / 1.5)));
    const h = dt / steps, wallOut = {};
    let grounded = false, impact = 0, landV = 0;
    for (let i = 0; i < steps; i++) {
      const prevY = p.y;
      let nx = p.x + v.x * h, ny = p.y + v.y * h, nz = p.z + v.z * h;
      const sup = this._support(nx, nz, Math.max(prevY, ny) + 0.3);
      if (ny < sup) ny = sup;
      this._walls(nx, ny, nz, wallOut);
      if (wallOut.hit) {
        nx = wallOut.x; nz = wallOut.z;
        const vn = -(v.x * wallOut.nx + v.z * wallOut.nz);
        if (vn > 0) {
          impact = Math.max(impact, vn);
          v.x += wallOut.nx * vn * 1.35; v.z += wallOut.nz * vn * 1.35;
          v.x *= 0.85; v.z *= 0.85;
        }
      }
      const sup2 = this._support(nx, nz, Math.max(prevY, ny) + 0.3);
      if (ny <= sup2 + 0.02) {
        ny = sup2;
        if (v.y < 0) { landV = Math.max(landV, -v.y); v.y = -v.y > CFG.HARD_LANDING ? -v.y * 0.25 : 0; }
        grounded = true;
        const f = Math.exp(-6 * h);
        v.x *= f; v.z *= f;
      }
      p.set(clamp(nx, -this.halfWorld + 20, this.halfWorld - 20), Math.min(CFG.MAX_ALT, ny), clamp(nz, -this.halfWorld + 20, this.halfWorld - 20));
    }
    if (grounded && !s.grounded && this.onLand) this.onLand({ speed: landV, position: p });
    s.grounded = grounded && v.y <= 0.01;
    if (impact > 0) {
      this._shake = Math.min(1, this._shake + impact / 20);
      s.lastImpact = impact;
      if (this.onImpact) this.onImpact({ type: 'building', speed: impact, position: p });
      if (impact > CFG.HARD_IMPACT && this.onDamage) this.onDamage((impact - CFG.HARD_IMPACT) * CFG.DAMAGE_PER_MPS, { type: 'building', speed: impact });
    }
    if (landV > CFG.HARD_LANDING) {
      this._shake = Math.min(1, this._shake + landV / 15);
      if (this.onDamage) this.onDamage((landV - CFG.HARD_LANDING) * CFG.DAMAGE_PER_MPS, { type: 'ground', speed: landV });
    }
    this._lastPos.copy(p);

    // App compatibility fields (HUD, minimap, kaiju).
    app.yaw = s.yaw;
    app.speed = Math.hypot(v.x, v.z);
    app.heliVelY = v.y;
    app.nitroActive = boost && app.speed > 5;
    s.speedKmh = app.speed * 3.6;

    // Camera recenter behind the heli after mouse idle; right stick orbits.
    if (inp.camX || inp.camY) {
      app.camYaw -= inp.camX * 2.2 * dt;
      app.camPitch = clamp(app.camPitch + inp.camY * 1.6 * dt, 0.05, 1.18);
      app.lastMouseOrbitTime = performance.now();
    }
    if ((performance.now() - app.lastMouseOrbitTime) * 0.001 > CFG.CAM_RECENTER_S) {
      app.camYaw += angDiff(app.camYaw, s.yaw) * Math.min(1, 3.5 * dt);
      app.camPitch = approach(app.camPitch, 0.3, 1.2, dt);
    }

    this._updateVisuals(dt);
    this._updateWash(dt, sup0);
    this._updateAudio(dt);
    const surf = app.sampleRoadSurface(p.x, sup0 + 0.5, p.z);
    if (surf && surf.seg && surf.seg.name) app.currentRoadName = surf.seg.name;
  }

  _updateVisuals(dt) {
    const s = this.state, mesh = this.app.heliMesh, ud = mesh.userData;
    // rotate about the centre of mass (~1.3 m above skids)
    mesh.quaternion.copy(s.quaternion);
    const c = this._up; // world up of the airframe (already computed)
    mesh.position.set(this.app.pos.x - c.x * 1.3, this.app.pos.y + 1.3 - c.y * 1.3, this.app.pos.z - c.z * 1.3);
    if (ud.fuselage) ud.fuselage.rotation.set(0, 0, 0);
    if (ud.mainRotor) ud.mainRotor.rotation.y += s.rpm * (20 + 12 * s.throttle) * dt;
    if (ud.tailRotor) ud.tailRotor.rotation.x += s.rpm * (28 + 10 * s.throttle) * dt;
  }

  // ---------------------------------------------------------------- camera hooks
  /** Smoothed chase pivot (called from app._updateCamera). */
  cameraPivot(pivot, dt) {
    const p = this.app.pos;
    if (this._camPivot.distanceTo(p) > 60) this._camPivot.copy(p);
    const k = 1 - Math.exp(-CFG.CAM_LAG * dt);
    this._camPivot.x += (p.x - this._camPivot.x) * k;
    this._camPivot.y += (p.y - this._camPivot.y) * k;
    this._camPivot.z += (p.z - this._camPivot.z) * k;
    pivot.copy(this._camPivot);
  }

  fovAdd() {
    return CFG.FOV_ADD * clamp(this.app.speed / 69, 0, 1.2);
  }

  /** Subtle high-speed and impact shake (called after the camera is placed). */
  cameraShake(camera, dt) {
    this._shake = Math.max(0, this._shake - dt * 1.8);
    const amp = clamp((this.app.speed - 40) / 30, 0, 1) * 0.08 + this._shake * 0.6;
    if (amp <= 0.001) return;
    const t = this._t * 40;
    camera.position.x += Math.sin(t * 1.3) * amp;
    camera.position.y += Math.sin(t * 1.7 + 1) * amp * 0.7;
    camera.position.z += Math.sin(t * 1.1 + 2) * amp;
  }

  // ---------------------------------------------------------------- rotor wash
  _initWash() {
    const N = (this._washN = 220);
    this._wp = new Float32Array(N * 3).fill(-1e5);
    this._wv = new Float32Array(N * 3);
    this._wl = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this._wp, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const grd = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grd;
    cx.fillRect(0, 0, 64, 64);
    this._washMat = new THREE.PointsMaterial({
      color: 0xc8b89a, size: 2.2, map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false,
    });
    this._wash = new THREE.Points(g, this._washMat);
    this._wash.frustumCulled = false;
    this._wash.visible = false;
    this._washNext = 0;
    this.app.scene.add(this._wash);
  }

  _updateWash(dt, groundY) {
    const s = this.state, p = this.app.pos, N = this._washN;
    const k = s.rpm * clamp(1 - s.agl / 30, 0, 1) * (0.5 + 0.5 * s.throttle);
    this._washMat.opacity = approach(this._washMat.opacity, k * 0.45, 3, dt);
    if (this._washMat.opacity < 0.01 && k === 0) { this._wash.visible = false; return; }
    this._wash.visible = true;
    const w = this.app.water;
    const wet = w && typeof w.isWaterAt === 'function' && w.isWaterAt(p.x, p.z);
    this._washMat.color.setHex(wet ? 0xe6f2ff : 0xc8b89a);
    let spawn = Math.floor(k * 260 * dt + Math.random());
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      if (this._wl[i] > 0) {
        this._wl[i] -= dt;
        this._wp[j] += this._wv[j] * dt; this._wp[j + 1] += this._wv[j + 1] * dt; this._wp[j + 2] += this._wv[j + 2] * dt;
        this._wv[j + 1] -= (wet ? 6 : 1.5) * dt;
        if (this._wl[i] <= 0) this._wp[j + 1] = -1e5;
      } else if (spawn > 0) {
        spawn--;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4, sp = 8 + Math.random() * 7;
        this._wp[j] = p.x + Math.cos(a) * r; this._wp[j + 1] = groundY + 0.3; this._wp[j + 2] = p.z + Math.sin(a) * r;
        this._wv[j] = Math.cos(a) * sp; this._wv[j + 1] = 0.6 + Math.random() * (wet ? 4 : 1.6); this._wv[j + 2] = Math.sin(a) * sp;
        this._wl[i] = 0.8 + Math.random() * 0.6;
      }
    }
    this._wash.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- audio
  _ensureAudio() {
    if (this._audio) { if (this._audio.ctx.state === 'suspended') this._audio.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
      const chop = ctx.createGain(); chop.gain.value = 0.5;          // blade-pass "whop" amplitude modulation
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 14;
      const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45;
      lfo.connect(lfoAmt).connect(chop.gain);
      noise.connect(bp).connect(chop).connect(master);
      const turb = ctx.createOscillator(); turb.type = 'sawtooth'; turb.frequency.value = 220;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const tg = ctx.createGain(); tg.gain.value = 0.05;
      turb.connect(lp).connect(tg).connect(master);
      const wob = ctx.createOscillator(); wob.frequency.value = 0.35;   // Doppler-ish wobble
      const wobAmt = ctx.createGain(); wobAmt.gain.value = 12;
      wob.connect(wobAmt); wobAmt.connect(turb.detune); wobAmt.connect(lfo.detune);
      noise.start(); lfo.start(); turb.start(); wob.start();
      this._audio = { ctx, master, bp, lfo, turb };
    } catch (e) {
      this._audio = null;
    }
  }

  _updateAudio() {
    const a = this._audio;
    if (!a || a.ctx.state !== 'running') return;
    const s = this.state, on = this.app.mode === 'helicopter', t = a.ctx.currentTime;
    const vol = on ? 0.22 * s.rpm * (0.55 + 0.45 * s.throttle) : 0;
    a.master.gain.setTargetAtTime(vol, t, 0.15);
    a.lfo.frequency.setTargetAtTime(6 + 12 * s.rpm + 4 * s.throttle, t, 0.2);
    a.bp.frequency.setTargetAtTime(300 + 260 * s.throttle + Math.min(200, this.app.speed * 2), t, 0.2);
    a.turb.frequency.setTargetAtTime(140 + 140 * s.rpm + 60 * s.throttle, t, 0.3);
  }

  /** Mute when leaving helicopter mode. */
  onExit() {
    this._wash.visible = false;
    this._washMat.opacity = 0;
    this._updateAudio();
  }
}
