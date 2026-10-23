// GTA V-style / intuitive arcade helicopter: flight model, auto-land, rooftop landing, camera assist, rotor wash and procedural rotor audio.
//
// Controls (keyboard / gamepad standard mapping):
//   W / S, Up / Down, Numpad 8 / 5   forward / back in horizontal plane (+55 / -25 m/s)
//   A / D  (LB / RB)                 turn left / right (yaw) with subtle bank
//   Q / E  (LT / RT)                 down / up (-16 / +18 m/s); released -> automatic altitude hold
//   Left / Right, Numpad 4 / 6       strafe left / right (±28 m/s)
//   L                                one-key auto-land (or auto-takeoff when landed)
//   Mouse drag / right stick         free-look; camera recenters behind the heli after ~1.5 s
//   Shift                            mild boost
//
// Public API (app.heli):
//   heli.state        live flight state (see constructor); position is app.pos (shared Vector3)
//   heli.getAimRay(ndcX = 0, ndcY = 0) -> { origin: Vector3, dir: Vector3 } through the crosshair
//   heli.place(x, y, z, yaw)  teleport + reset (velocity, attitude, rotor at speed)
//   heli.toggleAutoLand()     toggle automatic vertical landing (or takeoff when landed)
//   heli.inputEnabled  false -> flight inputs ignored (heli keeps hovering / falling)
//   heli.onDamage(amount, info) / heli.onImpact(info) / heli.onLand(info)   assignable hooks
//   heli.config        tunables (CFG)
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';

const D2R = Math.PI / 180;
export const CFG = {
  G: 9.81,
  HOVER_THR: 0.5,
  THR_RESP: 5.0,          // 1/s throttle response
  THRUST_MIN: 0.3,        // x g at throttle 0
  THRUST_MAX: 1.75,       // x g at throttle 1
  BOOST: 1.18,            // Shift: thrust and top speed multiplier
  HORIZ_GAIN: 1.45,
  DRAG_L: 0.03, DRAG_Q: 0.0024,
  VDRAG_L: 0.55, VDRAG_Q: 0.004,
  IDLE_HDRAG: 0.16,
  FWD_SPEED: 55,          // m/s max forward speed (W)
  BACK_SPEED: 25,         // m/s max reverse speed (S)
  STRAFE_SPEED: 28,       // m/s max lateral strafe speed (Left/Right)
  MAX_VY_UP: 18,          // m/s max climb rate (E)
  MAX_VY_DOWN: 16,        // m/s max descent rate (Q)
  AUTO_LAND_VY: 12,       // m/s auto-land descent speed (L)
  FWD_PITCH: 0.22,        // rad nose-down pitch at full forward input
  BACK_PITCH: 0.18,       // rad nose-up pitch at full reverse input
  STRAFE_ROLL: 0.30,      // rad roll tilt at full strafe input
  TURN_BANK: 0.14,        // rad subtle bank into yaw turns
  HORIZ_DAMP: 2.8,        // 1/s forward/back damping when W/S released
  STRAFE_DAMP: 3.2,       // 1/s lateral damping when Left/Right released
  VERT_DAMP: 6.0,         // 1/s vertical damping when Q/E released
  MAX_PITCH: 40 * D2R, MAX_ROLL: 45 * D2R,
  ATT_GAIN: 2.2,
  PITCH_RATE: 1.5, ROLL_RATE: 1.8, YAW_RATE: 1.35, MAX_YAW_RATE: 1.6,
  ANG_RESP: 6.0,
  BRAKE_K: 0.011, BRAKE_MAX: 0.28,
  COORD_TURN: 0.9,
  COORD_MAX: 0.7,
  GROUND_EFFECT_H: 8, GROUND_EFFECT: 0.12,
  LAND_ASSIST_H: 15,      // descent is cushioned below this AGL
  HARD_LANDING: 8.5,      // m/s vertical impact before damage
  HARD_IMPACT: 6.0,       // m/s impact into a wall before damage
  DAMAGE_PER_MPS: 5.0,
  RADIUS: 4.2,            // body/rotor collision radius
  SPINUP_S: 2.2,
  CAM_RECENTER_S: 1.5,
  CAM_LAG: 9.0,           // 1/s pivot follow rate
  FOV_ADD: 8.0,
  WIND: 0.25,
  ALT_KP: 1.2, ALT_KD: 1.7, ALT_KI: 0.15, ALT_ACC_MAX: 6.0,
  MAX_ALT: 2600,
};

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
    this.autoLanding = false;
    this._autoTakeoffTargetY = null;
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
      autoLanding: false,
      altitudeHold: true,
      agl: 0,
      speedKmh: 0,
      lastImpact: 0,
    };
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._up = new THREE.Vector3(0, 1, 0);
    this._lastPos = app.pos.clone();
    this._camPivot = app.pos.clone();
    this._shake = 0;
    this._t = 0;
    this._holdY = app.pos.y;
    this._holdI = 0;
    this._aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._initWash();
    this._initWeapons();
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
    s.grounded = false;
    s.autoLanding = false;
    this.autoLanding = false;
    this._autoTakeoffTargetY = null;
    this._holdY = y;
    this._holdI = 0;
    this.app.yaw = yaw;
    this.app.heliSpeed = 0;
    this.app.heliStrafeSpeed = 0;
    this.app.heliVelY = 0;
    this.app.heliLanded = false;
    this.app.heliAutoLanding = false;
    this._lastPos.copy(this.app.pos);
    this._camPivot.copy(this.app.pos);
    if (this.app.heliMesh) {
      this.app.heliMesh.position.copy(this.app.pos);
      this.app.heliMesh.rotation.set(0, yaw, 0);
    }
  }

  /** Called by app.setMode when switching into helicopter mode. */
  onEnter() {
    const app = this.app, s = this.state;
    this.place(app.pos.x, app.pos.y, app.pos.z, app.yaw);
    const sup = this._support(app.pos.x, app.pos.z, app.pos.y + 0.6);
    s.grounded = app.pos.y - sup < 0.45;
    s.rpm = s.grounded ? 0.25 : 1;
    if (s.grounded) {
      this.app.pos.y = sup;
      s.throttle = 0.15;
    }
    app.heliLanded = s.grounded;
    app.heliAutoLanding = false;
    app.camYaw = app.yaw;
  }

  /** Toggle automatic vertical landing (`KeyL`), or initiate auto-takeoff if currently landed. */
  toggleAutoLand() {
    const s = this.state, p = this.app.pos;
    if (s.grounded) {
      s.grounded = false;
      this.autoLanding = false;
      s.autoLanding = false;
      this.app.heliLanded = false;
      this.app.heliAutoLanding = false;
      s.rpm = Math.max(s.rpm, 0.85);
      this._autoTakeoffTargetY = p.y + 18;
      this._holdY = this._autoTakeoffTargetY;
      return false;
    }
    this._autoTakeoffTargetY = null;
    this.autoLanding = !this.autoLanding;
    s.autoLanding = this.autoLanding;
    this.app.heliAutoLanding = this.autoLanding;
    if (!this.autoLanding) {
      this._holdY = p.y;
    }
    return this.autoLanding;
  }

  // ---------------------------------------------------------------- input
  _readInput() {
    const k = this.app.keys;
    const has = (c) => k.has(c);
    const inp = {
      collective: (has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0),
      yaw: (has('KeyA') ? 1 : 0) - (has('KeyD') ? 1 : 0), // +1 = left (yaw grows toward screen-left)
      pitch: (has('KeyW') || has('ArrowUp') || has('Numpad8') ? 1 : 0) -
        (has('KeyS') || has('ArrowDown') || has('Numpad5') || has('Numpad2') ? 1 : 0),
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
    const app = this.app;
    const [cx0, cz0] = app.worldToChunk(x, z);
    for (let dcx = -1; dcx <= 1; dcx++) {
      for (let dcz = -1; dcz <= 1; dcz++) {
        const ch = app.loadedChunks.get(`${cx0 + dcx},${cz0 + dcz}`);
        const boxes = ch && ch.userData && ch.userData.buildingColliders;
        if (!boxes) continue;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
          fn(b);
        }
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

  /** Highest landable surface at (x,z) not above refY: terrain, elevated roads/bridges, building rooftops. */
  _support(x, z, refY) {
    let y = this._terrain(x, z);
    const s = this.app.sampleRoadSurface(x, refY, z);
    if (s && Number.isFinite(s.y) && s.y <= refY + 0.6 && s.y > y) y = s.y;
    this._forBoxes(x, z, 1.4, (b) => {
      if (b.h <= refY + 0.6 && b.h > y && (
        this._inside(b, x, z) ||
        this._inside(b, x + 1.0, z) ||
        this._inside(b, x - 1.0, z) ||
        this._inside(b, x, z + 1.0) ||
        this._inside(b, x, z - 1.0)
      )) {
        y = b.h;
      }
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
    const boostMul = boost ? CFG.BOOST : 1;

    // Pressing E (ascend) cancels auto-land and lifts off immediately if grounded.
    if (inp.collective > 0) {
      this.autoLanding = false;
      this._autoTakeoffTargetY = null;
      if (s.grounded) {
        s.grounded = false;
        s.rpm = Math.max(s.rpm, 0.85);
        this._holdY = p.y;
      }
    }

    // Handle one-key auto-takeoff when L was pressed while landed.
    if (this._autoTakeoffTargetY !== null) {
      if (inp.collective < 0 || this.autoLanding) {
        this._autoTakeoffTargetY = null;
      } else if (p.y < this._autoTakeoffTargetY - 0.35) {
        inp.collective = 0.75;
      } else {
        this._holdY = this._autoTakeoffTargetY;
        this._autoTakeoffTargetY = null;
      }
    }

    const sup0 = this._support(p.x, p.z, p.y + 0.5);
    s.agl = Math.max(0, p.y - sup0);

    // Yaw (A/D): smooth turn left/right.
    const w = s.angularVelocity;
    const yawAuth = s.grounded ? 0 : 1;
    w.y = approach(w.y, inp.yaw * CFG.YAW_RATE * yawAuth, CFG.ANG_RESP, dt);
    s.yaw += w.y * dt;
    s.yaw -= Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2;

    // Heading-frame horizontal velocity: forward (fx, fz) and right (rx, rz).
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const rx = -fz, rz = fx;
    let vF = v.x * fx + v.z * fz;
    let vR = v.x * rx + v.z * rz;

    // 1. W / S -> Forward (+55 m/s) / Backward (-25 m/s) in horizontal plane + visual pitch.
    let tP = 0;
    if (s.grounded || this.autoLanding) {
      vF *= Math.exp(-(s.grounded ? 10.0 : 4.0) * dt);
      if (Math.abs(vF) < 0.05) vF = 0;
      tP = 0;
    } else if (inp.pitch > 0) {
      const targetVF = CFG.FWD_SPEED * boostMul * inp.pitch;
      if (vF < 0) vF = Math.min(0, vF + 48 * dt);
      vF = approach(vF, targetVF, 1.35, dt);
      tP = CFG.FWD_PITCH * inp.pitch;
    } else if (inp.pitch < 0) {
      const targetVF = CFG.BACK_SPEED * inp.pitch;
      if (vF > 0) vF = Math.max(0, vF - 48 * dt);
      vF = approach(vF, targetVF, 1.8, dt);
      tP = CFG.BACK_PITCH * inp.pitch;
    } else {
      vF *= Math.exp(-CFG.HORIZ_DAMP * dt);
      if (Math.abs(vF) < 0.05) vF = 0;
      tP = 0;
    }

    // 2. ArrowLeft / ArrowRight -> Strafe Left / Right (±28 m/s) + visual roll tilt.
    let tR = 0;
    if (s.grounded || this.autoLanding) {
      vR *= Math.exp(-(s.grounded ? 10.0 : 4.0) * dt);
      if (Math.abs(vR) < 0.05) vR = 0;
      tR = 0;
    } else if (inp.roll !== 0) {
      const targetVR = CFG.STRAFE_SPEED * boostMul * inp.roll;
      if (vR * inp.roll < 0) vR += Math.sign(inp.roll) * 48 * dt;
      vR = approach(vR, targetVR, 2.0, dt);
      tR = CFG.STRAFE_ROLL * inp.roll - CFG.TURN_BANK * inp.yaw * 0.5;
    } else {
      vR *= Math.exp(-CFG.STRAFE_DAMP * dt);
      if (Math.abs(vR) < 0.05) vR = 0;
      tR = -CFG.TURN_BANK * inp.yaw;
    }

    v.x = fx * vF + rx * vR;
    v.z = fz * vF + rz * vR;

    // Smooth visual pitch & roll attitude.
    w.x = (tP - s.pitch) * 8.0;
    w.z = (tR - s.roll) * 8.0;
    s.pitch = approach(s.pitch, tP, 8.0, dt);
    s.roll = approach(s.roll, tR, 8.0, dt);
    this._euler.set(s.pitch, s.yaw, s.roll, 'YXZ');
    s.quaternion.setFromEuler(this._euler);
    this._up.set(0, 1, 0).applyQuaternion(s.quaternion);

    // 3. Q / E -> Descend (-16 m/s) / Ascend (+18 m/s), automatic altitude hold when released, or L auto-land.
    if (s.grounded) {
      s.rpm = approach(s.rpm, 0.25, 1.8, dt);
      s.throttle = approach(s.throttle, 0.15, 3.0, dt);
      v.set(0, 0, 0);
      vF = 0;
      vR = 0;
      p.y = sup0;
      this._holdY = p.y;
      s.altitudeHold = false;
    } else if (this.autoLanding) {
      s.rpm = approach(s.rpm, 0.85, 2.5, dt);
      const landRate = clamp(2.2 + s.agl * 0.65, 2.2, CFG.AUTO_LAND_VY);
      v.y = approach(v.y, -landRate, 5.0, dt);
      s.throttle = approach(s.throttle, 0.32, 4.0, dt);
      this._holdY = p.y;
      s.altitudeHold = false;
    } else if (inp.collective > 0) {
      s.rpm = approach(s.rpm, 1.0, 3.5, dt);
      v.y = approach(v.y, CFG.MAX_VY_UP * boostMul * inp.collective, 5.0, dt);
      s.throttle = approach(s.throttle, 0.5 + 0.5 * inp.collective, 5.0, dt);
      this._holdY = p.y;
      s.altitudeHold = false;
    } else if (inp.collective < 0) {
      s.rpm = approach(s.rpm, 0.9, 3.0, dt);
      let targetVy = CFG.MAX_VY_DOWN * inp.collective;
      if (s.agl < CFG.LAND_ASSIST_H) {
        targetVy = Math.max(targetVy, -(2.0 + s.agl * 0.75));
      }
      v.y = approach(v.y, targetVy, 5.0, dt);
      s.throttle = approach(s.throttle, 0.5 + 0.4 * inp.collective, 5.0, dt);
      this._holdY = p.y;
      s.altitudeHold = false;
    } else {
      // Automatic altitude hold when neither Q nor E is pressed.
      s.rpm = approach(s.rpm, 1.0, 2.5, dt);
      s.throttle = approach(s.throttle, CFG.HOVER_THR, 5.0, dt);
      if (this._holdY === undefined) this._holdY = p.y;
      v.y *= Math.exp(-CFG.VERT_DAMP * dt);
      if (Math.abs(v.y) < 0.05) {
        v.y = 0;
        p.y = this._holdY;
      } else {
        this._holdY = p.y;
      }
      s.altitudeHold = true;
    }

    // Integrate with swept sub-steps (never tunnel through walls or roofs).
    const steps = Math.min(10, Math.max(1, Math.ceil((v.length() * dt) / 1.5)));
    const h = dt / steps, wallOut = {};
    let grounded = s.grounded, impact = 0, landV = 0;
    if (!s.grounded) {
      for (let i = 0; i < steps; i++) {
        const prevY = p.y;
        let nx = p.x + v.x * h, ny = p.y + v.y * h, nz = p.z + v.z * h;
        const sup = this._support(nx, nz, Math.max(prevY, ny) + 0.5);
        if (ny < sup) ny = sup;
        if (typeof this.app.getBridgeUndersideAt === 'function') {
          const under = this.app.getBridgeUndersideAt(nx, prevY - 1.5, nz);
          if (under && prevY < under.soffitY && ny + 2.1 > under.soffitY) {
            ny = under.soffitY - 2.1;
            if (v.y > 0) v.y = 0;
            this._holdY = ny;
          }
        }
        this._walls(nx, ny, nz, wallOut);
        if (wallOut.hit) {
          nx = wallOut.x; nz = wallOut.z;
          const vn = -(v.x * wallOut.nx + v.z * wallOut.nz);
          if (vn > 0) {
            impact = Math.max(impact, vn);
            v.x += wallOut.nx * vn * 1.15;
            v.z += wallOut.nz * vn * 1.15;
            v.x *= 0.75;
            v.z *= 0.75;
          }
        }
        const sup2 = this._support(nx, nz, Math.max(prevY, ny) + 0.5);
        if (ny <= sup2 + 0.06 && (inp.collective < 0 || this.autoLanding || v.y <= 0)) {
          ny = sup2;
          if (v.y < 0) landV = Math.max(landV, -v.y);
          if (inp.collective < 0 || this.autoLanding || ny <= sup2 + 0.02) {
            v.set(0, 0, 0);
            vF = 0;
            vR = 0;
            s.pitch = 0;
            s.roll = 0;
            grounded = true;
            this.autoLanding = false;
            this._holdY = ny;
          }
        }
        p.set(
          clamp(nx, -this.halfWorld + 20, this.halfWorld - 20),
          Math.min(CFG.MAX_ALT, ny),
          clamp(nz, -this.halfWorld + 20, this.halfWorld - 20)
        );
        if (grounded) break;
      }
    }

    if (grounded && !s.grounded && this.onLand) this.onLand({ speed: landV, position: p });
    s.grounded = grounded;
    s.autoLanding = this.autoLanding;
    s.agl = Math.max(0, p.y - this._support(p.x, p.z, p.y + 0.5));

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

    // App compatibility fields (HUD, minimap, kaiju, tests).
    app.yaw = s.yaw;
    app.speed = Math.hypot(v.x, v.z);
    app.heliSpeed = vF;
    app.heliStrafeSpeed = vR;
    app.heliVelY = v.y;
    app.heliLanded = s.grounded;
    app.heliAutoLanding = this.autoLanding;
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
    this._updateWeapons(dt);
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

  // ---------------------------------------------------------------- audio (vehicle audio muted)
  _ensureAudio() {
    this._audio = null;
    return null;
  }

  _updateAudio() {
    // Muted by default (silent helicopter/vehicle operation)
  }

  // ---------------------------------------------------------------- gunship weapons (30mm nose cannon + wing-pod rockets)
  _initWeapons() {
    this.weaponStats = { cannonShots: 0, rocketsFired: 0, explosions: 0, trafficHits: 0 };
    this._cannonCooldown = 0;
    this._rocketCooldown = 0;
    this._muzzleTimer = 0;
    this._reticleFlash = 0;
    this._tmpW = new THREE.Vector3();

    this._weaponGroup = new THREE.Group();
    this._weaponGroup.name = 'heli_weapons_vfx';
    this.app.scene.add(this._weaponGroup);

    // Muzzle flash at nose cannon barrel
    const mfGeo = new THREE.SphereGeometry(0.42, 8, 8);
    const mfMat = new THREE.MeshBasicMaterial({ color: 0xffd24c, transparent: true, opacity: 0.9, depthWrite: false });
    this._muzzleFlash = new THREE.Mesh(mfGeo, mfMat);
    this._muzzleFlash.visible = false;
    this._weaponGroup.add(this._muzzleFlash);

    // Pool of 30mm rotary cannon tracer bolts
    this._cannonPool = [];
    const boltGeo = new THREE.BoxGeometry(0.14, 0.14, 3.2);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xffb830 });
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this._weaponGroup.add(mesh);
      this._cannonPool.push({ active: false, mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // Pool of Hydra 70 wing-pod rockets
    this._rocketPool = [];
    const rBodyGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.35, 8);
    rBodyGeo.rotateX(Math.PI * 0.5);
    const rBodyMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f8 });
    const rFlameGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const rFlameMat = new THREE.MeshBasicMaterial({ color: 0xff6218 });
    for (let i = 0; i < 16; i++) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(rBodyGeo, rBodyMat);
      const flame = new THREE.Mesh(rFlameGeo, rFlameMat);
      flame.position.set(0, 0, -0.75);
      grp.add(body, flame);
      grp.visible = false;
      grp.frustumCulled = false;
      this._weaponGroup.add(grp);
      this._rocketPool.push({ active: false, mesh: grp, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // Pool of 3D fireball explosions + shockwave rings
    this._explosions = [];
    const expSphereGeo = new THREE.SphereGeometry(1.0, 14, 12);
    const expRingGeo = new THREE.RingGeometry(0.55, 1.0, 24);
    expRingGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 18; i++) {
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7718, transparent: true, opacity: 0.9, depthWrite: false });
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
      const fireMesh = new THREE.Mesh(expSphereGeo, fireMat);
      const ringMesh = new THREE.Mesh(expRingGeo, ringMat);
      fireMesh.visible = false;
      ringMesh.visible = false;
      fireMesh.frustumCulled = false;
      ringMesh.frustumCulled = false;
      this._weaponGroup.add(fireMesh, ringMesh);
      this._explosions.push({ active: false, fireMesh, ringMesh, fireMat, ringMat, age: 0, dur: 0.5, maxR: 8.0 });
    }

    // Dynamic gunship HUD aiming reticle
    if (typeof document !== 'undefined' && !document.getElementById('heli-reticle')) {
      const el = document.createElement('div');
      el.id = 'heli-reticle';
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:54%',
        'width:44px',
        'height:44px',
        'transform:translate(-50%,-50%)',
        'pointer-events:none',
        'z-index:18',
        'display:none',
        'transition:transform 0.04s linear',
      ].join(';');
      el.innerHTML = '<svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="14" stroke="rgba(255,196,72,0.82)" stroke-width="1.5" stroke-dasharray="5 4"/><circle cx="22" cy="22" r="2.2" fill="rgba(255,110,48,0.95)"/><path d="M22 3v6M22 35v6M3 22h6M35 22h6" stroke="rgba(255,196,72,0.85)" stroke-width="1.5" stroke-linecap="round"/></svg>';
      document.body.appendChild(el);
    }
  }

  _computeFireDirection(spread = 0.012) {
    const s = this.state;
    const pos = this.app.pos;
    const liveAgl = Math.max(s.agl || 0, pos.y - Math.max(0, this._terrain(pos.x, pos.z)));
    const leadYaw = s.yaw + clamp(s.angularVelocity.y * 0.14, -0.28, 0.28) + (Math.random() - 0.5) * spread;
    // Pitch down toward the street/ground ahead depending on altitude AGL
    const baseDownPitch = liveAgl > 6 ? clamp(-0.28 - Math.min(0.22, liveAgl * 0.0015) - s.pitch * 0.55, -0.55, -0.08) : -0.08;
    const pitch = baseDownPitch + (Math.random() - 0.5) * spread;
    const cp = Math.cos(pitch);
    return {
      dx: Math.sin(leadYaw) * cp,
      dy: Math.sin(pitch),
      dz: Math.cos(leadYaw) * cp,
      yaw: leadYaw,
      pitch,
    };
  }

  /** Fires a 30mm rotary nose cannon tracer bolt. */
  fireCannon() {
    const s = this.state;
    if (this.app.mode !== 'helicopter') return false;
    let slot = null;
    for (let i = 0; i < this._cannonPool.length; i++) {
      if (!this._cannonPool[i].active) { slot = this._cannonPool[i]; break; }
    }
    if (!slot) slot = this._cannonPool[0];

    const mesh = this.app.heliMesh;
    this._tmpW.set(0, 0.55, 2.95).applyQuaternion(mesh.quaternion).add(this.app.pos);
    const dir = this._computeFireDirection(0.016);
    const speed = 310.0 + Math.max(0, this.app.speed || 0);

    slot.active = true;
    slot.x = this._tmpW.x;
    slot.y = this._tmpW.y;
    slot.z = this._tmpW.z;
    slot.vx = dir.dx * speed;
    slot.vy = dir.dy * speed;
    slot.vz = dir.dz * speed;
    slot.life = 2.4;
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    slot.mesh.lookAt(slot.x + slot.vx, slot.y + slot.vy, slot.z + slot.vz);
    slot.mesh.visible = true;

    this._muzzleFlash.position.copy(this._tmpW);
    this._muzzleFlash.visible = true;
    this._muzzleTimer = 0.045;
    this._reticleFlash = 0.12;
    this._shake = Math.max(this._shake, 0.04);
    this.weaponStats.cannonShots++;
    return true;
  }

  /** Fires a dual salvo of wing-pod Hydra rockets from the left and right stub wings. */
  fireRockets() {
    if (this.app.mode !== 'helicopter') return false;
    if (this._rocketCooldown > 0.05) return false;
    this._rocketCooldown = 0.38;

    const mesh = this.app.heliMesh;
    const speed = 195.0 + Math.max(0, this.app.speed || 0);
    let fired = 0;

    for (const side of [-1, 1]) {
      let slot = null;
      for (let i = 0; i < this._rocketPool.length; i++) {
        if (!this._rocketPool[i].active) { slot = this._rocketPool[i]; break; }
      }
      if (!slot) slot = this._rocketPool[fired % this._rocketPool.length];

      this._tmpW.set(side * 1.68, 0.85, 0.55).applyQuaternion(mesh.quaternion).add(this.app.pos);
      const dir = this._computeFireDirection(0.008);
      slot.active = true;
      slot.x = this._tmpW.x;
      slot.y = this._tmpW.y;
      slot.z = this._tmpW.z;
      slot.vx = dir.dx * speed;
      slot.vy = dir.dy * speed;
      slot.vz = dir.dz * speed;
      slot.life = 4.2;
      slot.mesh.position.set(slot.x, slot.y, slot.z);
      slot.mesh.lookAt(slot.x + slot.vx, slot.y + slot.vy, slot.z + slot.vz);
      slot.mesh.visible = true;
      this.weaponStats.rocketsFired++;
      fired++;
    }
    this._reticleFlash = 0.25;
    this._shake = Math.max(this._shake, 0.16);
    return fired > 0;
  }

  _spawnExplosion(x, y, z, isRocket = false) {
    let slot = null;
    for (let i = 0; i < this._explosions.length; i++) {
      if (!this._explosions[i].active) { slot = this._explosions[i]; break; }
    }
    if (!slot) slot = this._explosions[0];

    slot.active = true;
    slot.age = 0;
    slot.dur = isRocket ? 0.58 : 0.28;
    slot.maxR = isRocket ? 8.8 : 2.6;
    slot.fireMesh.position.set(x, y + 0.35, z);
    slot.fireMesh.scale.setScalar(0.5);
    slot.fireMat.color.setHex(isRocket ? 0xffaa33 : 0xffcc44);
    slot.fireMat.opacity = 0.95;
    slot.fireMesh.visible = true;

    slot.ringMesh.position.set(x, y + 0.18, z);
    slot.ringMesh.scale.setScalar(0.6);
    slot.ringMat.opacity = 0.85;
    slot.ringMesh.visible = true;

    this.weaponStats.explosions++;
    this._shake = Math.max(this._shake, isRocket ? 0.42 : 0.10);
  }

  _checkProjectileHit(p, isRocket) {
    const app = this.app;
    const terrY = Math.max(0, getBeijingTerrainElevation(p.x, p.z), getChunkTerrainMeshElevation(p.x, p.z));
    const supY = this._support(p.x, p.z, p.y + 0.8);
    const floorY = Math.max(terrY, supY);
    if (p.y <= floorY + 0.45) {
      return { x: p.x, y: floorY, z: p.z };
    }
    let wallHit = null;
    this._forBoxes(p.x, p.z, isRocket ? 1.4 : 0.8, (b) => {
      if (!wallHit && p.y <= b.h && this._inside(b, p.x, p.z)) {
        wallHit = { x: p.x, y: p.y, z: p.z };
      }
    });
    if (wallHit) return wallHit;
    // Check direct hit against AI traffic cars & walking pedestrians
    const traffic = app.traffic;
    if (traffic) {
      const carHitR2 = isRocket ? 4.4 * 4.4 : 2.8 * 2.8;
      for (const c of traffic.cars || []) {
        if (!c.active) continue;
        const dx = c.x - p.x, dz = c.z - p.z, dy = (c.y || 0) + 0.9 - p.y;
        if (dx * dx + dz * dz <= carHitR2 && Math.abs(dy) <= 3.2) {
          return { x: c.x, y: c.y || floorY, z: c.z };
        }
      }
      const pedHitR2 = isRocket ? 3.5 * 3.5 : 2.2 * 2.2;
      for (const ped of traffic.peds || []) {
        if (!ped.active || ped.state !== 'walking') continue;
        const dx = ped.x - p.x, dz = ped.z - p.z, dy = (ped.y || 0) + 0.9 - p.y;
        if (dx * dx + dz * dz <= pedHitR2 && Math.abs(dy) <= 2.8) {
          return { x: ped.x, y: ped.y || floorY, z: ped.z };
        }
      }
    }
    return null;
  }

  _detonateProjectile(p, isRocket) {
    p.active = false;
    p.mesh.visible = false;
    const hit = this._checkProjectileHit(p, isRocket) || { x: p.x, y: p.y, z: p.z };
    this._spawnExplosion(hit.x, hit.y, hit.z, isRocket);
    const traffic = this.app.traffic;
    if (traffic && typeof traffic.triggerImpactSphere === 'function') {
      const blastR = isRocket ? 16.0 : 5.8;
      const hits = traffic.triggerImpactSphere(hit.x, hit.y, hit.z, blastR, {
        vx: p.vx * 0.08,
        vy: isRocket ? 7.5 : 3.5,
        vz: p.vz * 0.08,
        force: isRocket ? 2.2 : 1.4,
      });
      this.weaponStats.trafficHits += hits;
    }
  }

  _updateWeapons(dt) {
    const s = this.state;
    this._cannonCooldown = Math.max(0, this._cannonCooldown - dt);
    this._rocketCooldown = Math.max(0, this._rocketCooldown - dt);
    this._reticleFlash = Math.max(0, this._reticleFlash - dt);

    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      if (this._muzzleTimer <= 0) this._muzzleFlash.visible = false;
    }

    // Hold Space to fire 30mm nose rotary cannon at 14 rounds/sec
    if (this.inputEnabled && this.app.mode === 'helicopter' && !s.grounded && this.app.keys.has('Space')) {
      if (this._cannonCooldown <= 0) {
        this._cannonCooldown = 0.071;
        this.fireCannon();
      }
    }

    // Update cannon bolts
    for (let i = 0; i < this._cannonPool.length; i++) {
      const b = this._cannonPool[i];
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (this._checkProjectileHit(b, false)) {
        this._detonateProjectile(b, false);
      } else if (b.life <= 0) {
        b.active = false;
        b.mesh.visible = false;
      }
    }

    // Update Hydra wing-pod rockets
    for (let i = 0; i < this._rocketPool.length; i++) {
      const r = this._rocketPool[i];
      if (!r.active) continue;
      r.life -= dt;
      r.vy -= 1.6 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.mesh.position.set(r.x, r.y, r.z);
      r.mesh.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz);
      if (this._checkProjectileHit(r, true)) {
        this._detonateProjectile(r, true);
      } else if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
      }
    }

    // Update 3D fireball explosions & shockwave rings
    for (let i = 0; i < this._explosions.length; i++) {
      const ex = this._explosions[i];
      if (!ex.active) continue;
      ex.age += dt;
      const u = ex.age / ex.dur;
      if (u >= 1) {
        ex.active = false;
        ex.fireMesh.visible = false;
        ex.ringMesh.visible = false;
        continue;
      }
      const fireScale = ex.maxR * (0.25 + 0.95 * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.5));
      ex.fireMesh.scale.setScalar(fireScale);
      if (u < 0.35) ex.fireMat.color.setHex(0xffb833);
      else if (u < 0.7) ex.fireMat.color.setHex(0xff5214);
      else ex.fireMat.color.setHex(0x3a3532);
      ex.fireMat.opacity = Math.max(0, (1 - u) * 0.92);

      const ringScale = ex.maxR * 1.65 * u;
      ex.ringMesh.scale.setScalar(Math.max(0.5, ringScale));
      ex.ringMat.opacity = Math.max(0, (1 - u) * 0.82);
    }

    // Update dynamic HUD aiming reticle
    if (typeof document !== 'undefined') {
      const ret = document.getElementById('heli-reticle');
      if (ret) {
        const show = this.app.mode === 'helicopter' && !s.grounded && (!this.app.mapSystem || !this.app.mapSystem.isOpen);
        ret.style.display = show ? 'block' : 'none';
        if (show) {
          const shiftX = clamp(-s.angularVelocity.y * 28 - s.roll * 36, -68, 68);
          const shiftY = clamp(-s.pitch * 42, -48, 48);
          const scale = this._reticleFlash > 0 ? 1.18 : 1.0;
          ret.style.transform = `translate(calc(-50% + ${shiftX.toFixed(1)}px), calc(-50% + ${shiftY.toFixed(1)}px)) scale(${scale})`;
        }
      }
    }
  }

  /** Mute and hide reticle when leaving helicopter mode. */
  onExit() {
    this._wash.visible = false;
    this._washMat.opacity = 0;
    if (this._muzzleFlash) this._muzzleFlash.visible = false;
    if (typeof document !== 'undefined') {
      const ret = document.getElementById('heli-reticle');
      if (ret) ret.style.display = 'none';
    }
    this._updateAudio();
  }
}
