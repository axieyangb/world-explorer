import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation } from '../environment.js';

/**
 * Water physics: a per-chunk bit raster of "deep" water (lakes/sea/river polygons incl. island holes,
 * plus river/canal ribbons) built in the chunk worker, and a main-thread controller that sinks cars,
 * stops walkers at the shoreline and keeps the helicopter above the surface.
 *
 * Mask layout (chunk-local coords, centred on the chunk origin): cell (c, r) covers
 * x in [MIN + c*CELL, MIN + (c+1)*CELL), z likewise; bit index r*N + c.
 */

const CELL = 2.0;
const MIN = -502.0;
const N = 502; // 1004 m / 2 m
const WATER_Y_OFFSET = 0.28; // matches buildParksAndWater's polygon offset
const DRIVE_EXCLUDE = new Set(['footway', 'steps', 'cycleway', 'path', 'pedestrian', 'track', 'bridleway']);

function setBit(bits, idx) { bits[idx >> 3] |= 1 << (idx & 7); }

function fillPolygon(bits, outer, holes) {
  const rings = [outer];
  for (const h of holes || []) if (h && h.length >= 6) rings.push(h);
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 1; i < outer.length; i += 2) { if (outer[i] < minZ) minZ = outer[i]; if (outer[i] > maxZ) maxZ = outer[i]; }
  const r0 = Math.max(0, Math.floor((minZ - MIN) / CELL));
  const r1 = Math.min(N - 1, Math.floor((maxZ - MIN) / CELL));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const zc = MIN + (r + 0.5) * CELL;
    xs.length = 0;
    for (const f of rings) {
      const n = f.length;
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        const zi = f[i + 1], zj = f[j + 1];
        if ((zi > zc) !== (zj > zc)) xs.push(f[i] + ((zc - zi) * (f[j] - f[i])) / (zj - zi));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = r * N;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // cells whose centre lies inside [x0, x1)
      const c0 = Math.max(0, Math.ceil((xs[k] - MIN) / CELL - 0.5));
      const c1 = Math.min(N - 1, Math.ceil((xs[k + 1] - MIN) / CELL - 0.5) - 1);
      for (let c = c0; c <= c1; c++) setBit(bits, row + c);
    }
  }
}

function fillRibbon(bits, flat, hw) {
  const hw2 = hw * hw;
  for (let k = 0; k + 3 < flat.length; k += 2) {
    const x1 = flat[k], z1 = flat[k + 1], x2 = flat[k + 2], z2 = flat[k + 3];
    const vx = x2 - x1, vz = z2 - z1;
    const len2 = vx * vx + vz * vz;
    if (len2 < 0.05) continue;
    const c0 = Math.max(0, Math.floor((Math.min(x1, x2) - hw - MIN) / CELL));
    const c1 = Math.min(N - 1, Math.floor((Math.max(x1, x2) + hw - MIN) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(z1, z2) - hw - MIN) / CELL));
    const r1 = Math.min(N - 1, Math.floor((Math.max(z1, z2) + hw - MIN) / CELL));
    for (let r = r0; r <= r1; r++) {
      const zc = MIN + (r + 0.5) * CELL;
      for (let c = c0; c <= c1; c++) {
        const xc = MIN + (c + 0.5) * CELL;
        let t = ((xc - x1) * vx + (zc - z1) * vz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = xc - (x1 + vx * t), dz = zc - (z1 + vz * t);
        if (dx * dx + dz * dz <= hw2) setBit(bits, r * N + c);
      }
    }
  }
}

/**
 * Worker-side: rasterises a chunk's `water_polys` / `water_lines` into a transferable bit mask.
 * Streams/ditches are ignored (too shallow to sink a car). Returns null for chunks without water.
 */
export function buildWaterMask(data) {
  const polys = data.water_polys || [];
  const lines = data.water_lines || [];
  if (polys.length === 0 && lines.length === 0) return null;
  const bits = new Uint8Array((N * N + 7) >> 3);
  let any = false;
  for (const wp of polys) {
    const outer = wp[2];
    if (!outer || outer.length < 6) continue;
    fillPolygon(bits, outer, wp[3]);
    any = true;
  }
  for (const wl of lines) {
    const [, cls, , widthM, flat] = wl;
    if (!flat || flat.length < 4) continue;
    if (cls !== 'river' && cls !== 'canal' && !(widthM >= 12)) continue;
    fillRibbon(bits, flat, Math.max(3.5, (widthM || 10) * 0.5));
    any = true;
  }
  return any ? { bits, n: N, cell: CELL, min: MIN } : null;
}

/** Adds the mask buffer to a worker transfer set. */
export function waterMaskTransfer(mask, transferSet) {
  if (mask && mask.bits && mask.bits.buffer) transferSet.add(mask.bits.buffer);
  return mask;
}

function maskAt(mask, lx, lz) {
  const c = Math.floor((lx - mask.min) / mask.cell);
  const r = Math.floor((lz - mask.min) / mask.cell);
  if (c < 0 || r < 0 || c >= mask.n || r >= mask.n) return false;
  const idx = r * mask.n + c;
  return (mask.bits[idx >> 3] & (1 << (idx & 7))) !== 0;
}

let _dropTex = null;
/** Soft round droplet sprite (falls back to square points without a DOM). */
function dropTexture() {
  if (_dropTex || typeof document === 'undefined') return _dropTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  _dropTex = new THREE.CanvasTexture(c);
  return _dropTex;
}

function smooth01(u) { return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u); }

/**
 * Main-thread controller. `app` is the WorldExplorer instance (uses pos/yaw/speed, loadedChunks,
 * worldToChunk, sampleRoadSurface, vehicleMesh, scene).
 */
export class WaterPhysics {
  constructor(app) {
    this.app = app;
    this.sink = null;      // active sinking state (drive mode)
    this.safe = null;      // last safe on-road pose
    this.safeHist = [];    // recent safe poses (respawn backs off from the shore)
    this.safeT = 0;
    this.cooldown = 0;
    this.fx = null;
    this.fadeEl = null;
    this.stats = { sinks: 0, respawns: 0 };
  }

  isPointInWater(wx, wz) {
    const app = this.app;
    const [cx, cz] = app.worldToChunk(wx, wz);
    const chunk = app.loadedChunks.get(`${cx},${cz}`);
    const ud = chunk && chunk.userData;
    if (!ud || !ud.waterMask) return false;
    return maskAt(ud.waterMask, wx - ud.ox, wz - ud.oz);
  }

  getWaterSurfaceY(wx, wz) {
    return getBeijingTerrainElevation(wx, wz) + WATER_Y_OFFSET;
  }

  /** True when the road surface `surf` (from sampleRoadSurface) physically supports a point above water. */
  _roadSupports(surf, wx, wz, waterY) {
    if (!surf || !surf.seg) return false;
    const s = surf.seg;
    if (surf.y < waterY - 0.6) return false;
    // Bridge decks: trust sampleRoadSurface (its lateral tolerance is what the floor clamp uses too), so a car
    // on a narrow-mapped bridge (e.g. footway-only Pont d Iena) never drops through the deck.
    if (s.bridge) return true;
    const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 1e-6 ? ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(wx - (s.x1 + vx * t), wz - (s.z1 + vz * t));
    return d <= (s.width || 6) * 0.5 + 1.5;
  }

  /** Water under (wx, wz) with no road/bridge deck carrying the body at height wy. */
  isUnsupportedWater(wx, wz, wy, surf) {
    if (!this.isPointInWater(wx, wz)) return false;
    const waterY = this.getWaterSurfaceY(wx, wz);
    if (wy < waterY - 2.5) return false; // trench / tunnel below the surface
    return !this._roadSupports(surf, wx, wz, waterY);
  }

  // ---------------------------------------------------------------- drive mode
  /** Call once per frame in drive mode after the car's support is known (records the respawn pose). */
  recordSafe(dt, surf) {
    this.safeT += dt;
    if (!surf || !surf.seg || this.sink || this.safeT < 0.25) return;
    const s = surf.seg;
    if (s.tunnel || DRIVE_EXCLUDE.has(s.cls)) return;
    const p = this.app.pos;
    if (this.isPointInWater(p.x, p.z) && !s.bridge) return;
    this.safeT = 0;
    const last = this.safeHist[this.safeHist.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) > 80) this.safeHist.length = 0; // teleported
    this.safe = { x: p.x, z: p.z, yaw: this.app.yaw, seg: s };
    this.safeHist.push(this.safe);
    if (this.safeHist.length > 24) this.safeHist.shift(); // ~6 s
  }

  /** Respawn reference: the most recent safe pose at least 15 m from where the car went in. */
  _respawnRef(ex, ez) {
    let far = null, farD = -1;
    for (let i = this.safeHist.length - 1; i >= 0; i--) {
      const h = this.safeHist[i];
      const d = Math.hypot(h.x - ex, h.z - ez);
      if (d > 250) continue; // stale (before a teleport)
      if (d >= 15) return h;
      if (d > farD) { farD = d; far = h; }
    }
    return far;
  }

  /** True if open water lies within r metres of (x, z) (8 probes). */
  _nearWater(x, z, r) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.isPointInWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
    }
    return false;
  }

  /** Checks the car centre right after a movement sub-step, before any terrain floor clamp. */
  tryEnterWater(surf) {
    if (this.sink || this.cooldown > 0 || this.app.isTeleporting) return false;
    const p = this.app.pos;
    if (!this.isUnsupportedWater(p.x, p.z, p.y, surf)) return false;
    const app = this.app;
    this.sink = {
      t: 0, tSplash: -1, faded: false, respawned: false, ex: p.x, ez: p.z,
      vx: Math.sin(app.yaw) * app.speed, vz: Math.cos(app.yaw) * app.speed, vy: 0,
    };
    this.stats.sinks++;
    return true;
  }

  /** Runs the sinking sequence; returns true while it owns the car (skip normal drive physics). */
  updateDrive(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const s = this.sink;
    if (!s) return false;
    const app = this.app, p = app.pos, mesh = app.vehicleMesh;
    s.t += dt;
    const k = s.tSplash < 0 ? 0.25 : 2.6;
    const damp = Math.exp(-k * dt);
    s.vx *= damp; s.vz *= damp;
    const px0 = p.x, pz0 = p.z;
    p.x += s.vx * dt; p.z += s.vz * dt;
    if (app.collision) { // keep the drifting wreck out of waterside buildings
      const rc = app.collision.resolveCar(p.x, p.y, p.z, app.yaw, null, px0, pz0);
      if (rc.hit) { p.x = rc.x; p.z = rc.z; s.vx *= 0.2; s.vz *= 0.2; }
    }
    const waterY = this.getWaterSurfaceY(p.x, p.z);
    if (s.tSplash < 0) {
      s.vy -= 9.81 * dt;
      p.y += s.vy * dt;
      if (p.y <= waterY + 0.05 || s.t > 1.5) {
        s.tSplash = s.t;
        this._splash(p.x, waterY, p.z, Math.hypot(s.vx, s.vz), -s.vy);
        p.y = Math.min(p.y, waterY + 0.05);
      }
    } else {
      const u = (s.t - s.tSplash) / 1.2;
      const e = smooth01(u);
      const bob = Math.sin((s.t - s.tSplash) * 7.0) * 0.12 * (1 - Math.min(1, u));
      p.y = waterY + 0.05 - 1.55 * e + bob;
    }
    app.speed = Math.hypot(s.vx, s.vz);
    app.steerAngle *= damp;
    if (mesh) {
      mesh.position.copy(p);
      const sp = s.tSplash < 0 ? 0 : smooth01((s.t - s.tSplash) / 1.2);
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0.16 * sp + Math.sin(s.t * 3.1) * 0.03 * sp, Math.min(1, 6 * dt));
      const ch = mesh.userData && mesh.userData.chassis;
      if (ch) ch.rotation.z = THREE.MathUtils.lerp(ch.rotation.z, Math.sin(s.t * 2.3) * 0.06 * sp, Math.min(1, 6 * dt));
    }
    const since = s.tSplash < 0 ? 0 : s.t - s.tSplash;
    if (!s.faded && since > 2.0) { s.faded = true; s.fadeT = s.t; this._fade(1); }
    if (s.faded && !s.respawned && s.t - s.fadeT > 0.4) {
      s.respawned = true;
      this._respawn();
      this._fade(0);
      this.sink = null;
      this.cooldown = 0.6;
    }
    return true;
  }

  _respawn() {
    const app = this.app;
    const ex = this.sink ? this.sink.ex : app.pos.x, ez = this.sink ? this.sink.ez : app.pos.z;
    const ref = this._respawnRef(ex, ez) || { x: app.pos.x, z: app.pos.z, yaw: app.yaw, seg: null };
    const [cx, cz] = app.worldToChunk(ref.x, ref.z);
    let best = null, bestScore = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = app.loadedChunks.get(`${cx + dx},${cz + dz}`);
        const segs = chunk && chunk.userData.roadSegments;
        if (!segs) continue;
        for (let i = 0; i < segs.length; i++) {
          const sg = segs[i];
          if (sg.tunnel || DRIVE_EXCLUDE.has(sg.cls)) continue;
          const vx = sg.x2 - sg.x1, vz = sg.z2 - sg.z1;
          const len2 = vx * vx + vz * vz;
          if (len2 < 4) continue;
          let t = ((ref.x - sg.x1) * vx + (ref.z - sg.z1) * vz) / len2;
          t = t < 0.1 ? 0.1 : t > 0.9 ? 0.9 : t;
          const px = sg.x1 + vx * t, pz = sg.z1 + vz * t;
          const d = Math.hypot(px - ref.x, pz - ref.z);
          if (d > 600) continue;
          const wet = this.isPointInWater(px, pz);
          const shore = !wet && this._nearWater(px, pz, 8) ? 30 : 0;
          const score = d + (sg === ref.seg ? -25 : 0) + (wet ? (sg.bridge ? 40 : 400) : shore);
          if (score < bestScore) { bestScore = score; best = { sg, t, px, pz, vx, vz }; }
        }
      }
    }
    app.speed = 0;
    app.steerAngle = 0;
    if (!best) {
      app.teleportToWorld(ref.x, ref.z, '', true);
      this.stats.respawns++;
      return;
    }
    const { sg, t, px, pz, vx, vz } = best;
    let yaw = Math.atan2(vx, vz);
    if (Math.cos(yaw - ref.yaw) < 0) yaw += Math.PI; // keep the direction the car was heading
    const y = sg.y1 + (sg.y2 - sg.y1) * t + 0.07;
    app.pos.set(px, Math.max(y, getBeijingTerrainElevation(px, pz) + 0.16), pz);
    app.yaw = yaw;
    app.camYaw = yaw;
    app.camYawOffset = 0;
    if (app.camPivot) app.camPivot.copy(app.pos);
    if (sg.name) app.currentRoadName = sg.name;
    app.currentLayer = sg.layer || 0;
    const mesh = app.vehicleMesh;
    if (mesh) {
      mesh.position.copy(app.pos);
      mesh.rotation.set(0, yaw, 0);
      if (mesh.userData.chassis) mesh.userData.chassis.rotation.z = 0;
    }
    this.stats.respawns++;
  }

  /** Cancels an active sink (mode switch / teleport). */
  reset() {
    if (this.sink) this._fade(0);
    this.sink = null;
    this.safe = null;
    this.safeHist.length = 0;
  }

  // ---------------------------------------------------------------- walk / heli
  /** Walk mode: returns the allowed (x, z) for a move from (px, pz) to (nx, nz); stops at the shoreline. */
  resolveWalk(px, pz, nx, nz, wy) {
    const blocked = (x, z) => {
      if (!this.isPointInWater(x, z)) return false;
      const surf = this.app.sampleRoadSurface(x, wy, z);
      return this.isUnsupportedWater(x, z, wy, surf);
    };
    if (!blocked(nx, nz)) return { x: nx, z: nz };
    if (blocked(px, pz)) return { x: nx, z: nz }; // already in water (e.g. teleported): let them walk out
    if (!blocked(nx, pz)) return { x: nx, z: pz }; // slide along the shore
    if (!blocked(px, nz)) return { x: px, z: nz };
    return { x: px, z: pz };
  }

  /** Helicopter: minimum altitude over water (2 m above the surface), -Infinity elsewhere. */
  heliMinY(wx, wz) {
    return this.isPointInWater(wx, wz) ? this.getWaterSurfaceY(wx, wz) + 2.0 : -Infinity;
  }

  // ---------------------------------------------------------------- effects
  _ensureFx() {
    if (this.fx) return this.fx;
    const COUNT = 160;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geom, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.32, map: dropTexture(), transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true,
    }));
    pts.frustumCulled = false;
    pts.visible = false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.25, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.app.scene.add(pts);
    this.app.scene.add(ring);
    this.fx = { pts, ring, pos, vel: new Float32Array(COUNT * 3), count: COUNT, t: -1, y: 0, ring2: 0 };
    return this.fx;
  }

  _splash(x, y, z, hSpeed, vSpeed) {
    const fx = this._ensureFx();
    const power = Math.min(1.6, 0.6 + (hSpeed + vSpeed) / 30);
    for (let i = 0; i < fx.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      const out = (1.5 + Math.random() * 3.5) * power;
      fx.pos[i * 3] = x + Math.cos(a) * r;
      fx.pos[i * 3 + 1] = y + 0.1;
      fx.pos[i * 3 + 2] = z + Math.sin(a) * r;
      fx.vel[i * 3] = Math.cos(a) * out;
      fx.vel[i * 3 + 1] = (3.0 + Math.random() * 5.5) * power;
      fx.vel[i * 3 + 2] = Math.sin(a) * out;
    }
    fx.pts.geometry.attributes.position.needsUpdate = true;
    fx.pts.visible = true;
    fx.pts.material.opacity = 0.95;
    fx.ring.position.set(x, y + 0.06, z);
    fx.ring.scale.setScalar(1);
    fx.ring.visible = true;
    fx.t = 0;
    fx.y = y;
  }

  /** Animates splash particles; call every frame. */
  tick(dt) {
    const fx = this.fx;
    if (!fx || fx.t < 0) return;
    fx.t += dt;
    const p = fx.pos, v = fx.vel;
    for (let i = 0; i < fx.count; i++) {
      const j = i * 3;
      v[j + 1] -= 13.0 * dt;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < fx.y) { p[j + 1] = fx.y; v[j] *= 0.5; v[j + 2] *= 0.5; v[j + 1] = 0; }
    }
    fx.pts.geometry.attributes.position.needsUpdate = true;
    fx.pts.material.opacity = 0.95 * (1 - smooth01((fx.t - 0.7) / 0.9));
    const u = Math.min(1, fx.t / 1.8);
    fx.ring.scale.setScalar(1 + 9 * (1 - (1 - u) * (1 - u)));
    fx.ring.material.opacity = 0.8 * (1 - u);
    if (fx.t > 1.8) { fx.t = -1; fx.pts.visible = false; fx.ring.visible = false; }
  }

  _fade(on) {
    if (typeof document === 'undefined') return;
    if (!this.fadeEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.35s ease;z-index:60';
      document.body.appendChild(el);
      this.fadeEl = el;
    }
    this.fadeEl.style.opacity = on ? '1' : '0';
  }
}
