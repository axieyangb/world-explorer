import * as THREE from '../vendor/three.module.js';
import { getBeijingTerrainElevation } from './environment.js';
import { getLang } from './i18n.js';
import { computeRoadRoute } from './features/route_graph.js';

const RIBBON_AHEAD_M = 1200;
const RIBBON_STEP_M = 8;
const RIBBON_HALF_W = 0.9;
const ARRIVE_M = 10;

export function formatDistance(m) {
  const zh = getLang() === 'zh';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} ${zh ? '米' : 'm'}`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${zh ? '公里' : 'km'}`;
}

export function formatDuration(sec) {
  const zh = getLang() === 'zh';
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} ${zh ? '分钟' : 'min'}`;
  const h = Math.floor(min / 60);
  const rm = min % 60;
  return zh ? `${h} 小时 ${rm} 分钟` : `${h} h ${rm} min`;
}

/**
 * GPS route state: tile-based road routing (global), progress tracking,
 * arrival detection and a thin 3D ground ribbon that follows the road surface.
 * Route geometry is stored in lat/lon so it survives world-origin changes.
 */
export class RoadNavigator {
  constructor(scene) {
    this.scene = scene;
    this.ready = true;
    this.app = null; // attached by MapSystem: worldOrigin + sampleRoadSurface
    this.activeRoute = null;
    this.routeMesh = null;
    this.arrivedAt = -Infinity;
    this._seq = 0;
    this._lastUpdate = 0;
    this._originRef = null;
    this._ribbonAt = null;
    this._ribbonTime = 0;
    this._ribbonChunks = 0;
    this._lastReroute = 0;
  }

  /** Legacy hook (the old Beijing-only nav graph is no longer needed). */
  init() {}

  attach(app) {
    this.app = app;
  }

  get origin() {
    return this.app && this.app.worldOrigin;
  }

  worldToLatLon(x, z) {
    const o = this.origin;
    return [o.centerLat - z / o.mPerDegLat, o.centerLon + x / o.mPerDegLon];
  }

  latLonToWorld(lat, lon) {
    const o = this.origin;
    return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
  }

  /** Builds a road route between two lat/lon points or two world {x,z} objects. */
  async routeTo(fromLat, fromLon, toLat, toLon, destName = '') {
    if (fromLat && typeof fromLat === 'object' && fromLon && typeof fromLon === 'object') {
      const lbl = typeof destName === 'string' && destName ? destName : (this.app?.fsd?.label || 'Destination');
      const [fLat, fLon] = this.worldToLatLon(Number(fromLat.x) || 0, Number(fromLat.z) || 0);
      const [tLat, tLon] = this.worldToLatLon(Number(fromLon.x) || 0, Number(fromLon.z) || 0);
      fromLat = fLat;
      fromLon = fLon;
      toLat = tLat;
      toLon = tLon;
      destName = lbl;
    }
    const seq = ++this._seq;
    const mLat = 111320;
    const mLon = 111320 * Math.cos((fromLat * Math.PI) / 180);
    const directDist = Math.hypot((toLon - fromLon) * mLon, (toLat - fromLat) * mLat);
    if (directDist > 5) {
      this._setRoute(
        { latlon: [[fromLat, fromLon], [toLat, toLon]], distM: directDist, etaSec: Math.max(5, directDist / 16), straight: true },
        destName,
        toLat,
        toLon
      );
    }
    const r = await computeRoadRoute({ lat: fromLat, lon: fromLon }, { lat: toLat, lon: toLon });
    if (seq !== this._seq || !r) return this.activeRoute;
    this._setRoute(r, destName, toLat, toLon);
    return this.activeRoute;
  }

  /**
   * Per-frame lookahead point along the active route polyline for FSD steering.
   * Returns { x, z, turnAngle, distToRoute } or null if no active route.
   */
  getLookaheadPoint(px, pz, lookAheadM = 18) {
    const r = this.activeRoute;
    if (!r || !this.origin) return null;
    if (this._originRef !== this.origin || !r.points || r.points.length < 2) {
      this._reproject();
    }
    const pts = r.points;
    if (!pts || pts.length < 2) return null;

    let bestI = r.progressIdx || 0;
    let bestT = 0;
    let bestD = Infinity;
    const i0 = Math.max(0, bestI - 3);
    const i1 = Math.min(pts.length - 2, bestI + 90);
    for (let i = i0; i <= i1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const vx = pts[i + 1][0] - ax, vz = pts[i + 1][2] - az;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
      const d = Math.hypot(ax + vx * t - px, az + vz * t - pz);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bestT = t;
      }
    }
    r.progressIdx = bestI;

    const sampleAhead = (distAhead) => {
      let rem = distAhead;
      let idx = bestI;
      let curX = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * bestT;
      let curZ = pts[idx][2] + (pts[idx + 1][2] - pts[idx][2]) * bestT;
      while (idx < pts.length - 1) {
        const nx = pts[idx + 1][0], nz = pts[idx + 1][2];
        const segRem = Math.hypot(nx - curX, nz - curZ);
        if (segRem >= rem && segRem > 1e-5) {
          const f = rem / segRem;
          return [curX + (nx - curX) * f, curZ + (nz - curZ) * f];
        }
        rem -= segRem;
        curX = nx;
        curZ = nz;
        idx++;
      }
      return [pts[pts.length - 1][0], pts[pts.length - 1][2]];
    };

    const [tx, tz] = sampleAhead(lookAheadM);
    const [fx, fz] = sampleAhead(lookAheadM * 2.2);
    const a1 = Math.atan2(tx - px, tz - pz);
    const a2 = Math.atan2(fx - tx, fz - tz);
    const turnAngle = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    return { x: tx, z: tz, turnAngle, distToRoute: bestD };
  }

  /** Legacy world-coordinate API. */
  computeRoute(startX, startZ, goalX, goalZ, destName = '') {
    const [a, b] = this.worldToLatLon(startX, startZ);
    const [c, d] = this.worldToLatLon(goalX, goalZ);
    return this.routeTo(a, b, c, d, destName);
  }

  clearRoute() {
    this._seq++;
    this.activeRoute = null;
    this._disposeRibbon();
  }

  /** One quiet line for the HUD, or '' when idle. */
  statusText(now = performance.now()) {
    const r = this.activeRoute;
    if (r) return `${formatDistance(r.remainingM)} · ${formatDuration(r.remainingSec)}`;
    if (now - this.arrivedAt < 3000) return getLang() === 'zh' ? '已到达' : 'Arrived';
    return '';
  }

  _setRoute(r, destName, goalLat, goalLon) {
    const ll = r.latlon;
    const cum = new Float64Array(ll.length);
    const mLat = 111320;
    const mLon = 111320 * Math.cos((ll[0][0] * Math.PI) / 180);
    for (let i = 1; i < ll.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot((ll[i][1] - ll[i - 1][1]) * mLon, (ll[i][0] - ll[i - 1][0]) * mLat);
    }
    const total = cum[ll.length - 1] || 1;
    this.activeRoute = {
      latlon: ll,
      cum,
      totalDistM: total,
      etaSec: r.etaSec,
      secPerM: r.etaSec / total,
      straight: r.straight,
      destName,
      goalLat,
      goalLon,
      progressIdx: 0,
      remainingM: total,
      remainingSec: r.etaSec,
      offSince: 0,
      points: [],
      goalX: 0,
      goalZ: 0,
    };
    this._reproject();
    this._disposeRibbon();
    this._ribbonAt = null;
  }

  _reproject() {
    const r = this.activeRoute;
    this._originRef = this.origin;
    if (!r || !this.origin) return;
    r.points = r.latlon.map(([lat, lon]) => {
      const [x, z] = this.latLonToWorld(lat, lon);
      return [x, 0, z];
    });
    [r.goalX, r.goalZ] = this.latLonToWorld(r.goalLat, r.goalLon);
  }

  /** Called every frame (cheap; internally throttled). */
  update(playerPos, now = performance.now()) {
    const r = this.activeRoute;
    if (!r || !this.origin) return;
    if (now - this._lastUpdate < 200) return;
    this._lastUpdate = now;
    if (this._originRef !== this.origin) {
      this._reproject();
      this._disposeRibbon();
      this._ribbonAt = null;
    }

    const px = playerPos.x;
    const pz = playerPos.z;
    const pts = r.points;
    const toGoal = Math.hypot(r.goalX - px, r.goalZ - pz);
    if (toGoal < ARRIVE_M) {
      this.clearRoute();
      this.arrivedAt = now;
      return;
    }

    // Progress along the polyline (search a window ahead of the last index).
    let bestI = r.progressIdx;
    let bestT = 0;
    let bestD = Infinity;
    const i0 = Math.max(0, r.progressIdx - 3);
    const i1 = Math.min(pts.length - 2, r.progressIdx + 120);
    for (let i = i0; i <= i1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const vx = pts[i + 1][0] - ax, vz = pts[i + 1][2] - az;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
      const d = Math.hypot(ax + vx * t - px, az + vz * t - pz);
      if (d < bestD) {
        bestD = d;
        bestI = i;
        bestT = t;
      }
    }
    if (r.straight) {
      r.remainingM = toGoal;
    } else {
      r.progressIdx = bestI;
      const seg = r.cum[bestI + 1] - r.cum[bestI];
      r.remainingM = Math.max(0, r.totalDistM - (r.cum[bestI] + seg * bestT)) + Math.min(bestD, 200);
    }
    r.remainingSec = r.remainingM * r.secPerM;

    // Quiet auto-reroute when clearly off the route for a few seconds.
    if (!r.straight && bestD > 90) {
      if (!r.offSince) r.offSince = now;
      if (now - r.offSince > 4000 && now - this._lastReroute > 10000) {
        this._lastReroute = now;
        const [lat, lon] = this.worldToLatLon(px, pz);
        this.routeTo(lat, lon, r.goalLat, r.goalLon, r.destName);
      }
    } else {
      r.offSince = 0;
    }

    // 3D ribbon near the player; refreshed as we move or as chunks stream in.
    const chunks = this.app && this.app.loadedChunks ? this.app.loadedChunks.size : 0;
    const moved = this._ribbonAt ? Math.hypot(px - this._ribbonAt[0], pz - this._ribbonAt[1]) : Infinity;
    if (moved > 120 || (chunks !== this._ribbonChunks && now - this._ribbonTime > 1500)) {
      this._ribbonAt = [px, pz];
      this._ribbonTime = now;
      this._ribbonChunks = chunks;
      this._rebuildRibbon(playerPos);
    }
  }

  _disposeRibbon() {
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh.material.dispose();
      this.routeMesh = null;
    }
  }

  _surfaceY(x, z, prevY) {
    const terr = getBeijingTerrainElevation(x, z);
    const app = this.app;
    if (app && typeof app.sampleRoadSurface === 'function') {
      const s = app.sampleRoadSurface(x, prevY, z) || (Math.abs(prevY - terr) > 2 ? app.sampleRoadSurface(x, terr, z) : null);
      if (s) return s.y;
    }
    return terr;
  }

  _rebuildRibbon(playerPos) {
    this._disposeRibbon();
    const r = this.activeRoute;
    if (!r || r.points.length < 2) return;
    const pts = r.points;

    // Sample the route ahead of the player at a fixed step.
    const samples = [];
    let acc = 0;
    let prevY = playerPos.y;
    const start = r.straight ? 0 : Math.max(0, r.progressIdx);
    for (let i = start; i < pts.length - 1 && acc < RIBBON_AHEAD_M; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const bx = pts[i + 1][0], bz = pts[i + 1][2];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / RIBBON_STEP_M));
      for (let k = 0; k < steps && acc < RIBBON_AHEAD_M; k++) {
        const t = k / steps;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (Math.abs(x) > 19950 || Math.abs(z) > 19950) continue;
        if (r.straight && Math.hypot(x - playerPos.x, z - playerPos.z) > RIBBON_AHEAD_M) continue;
        prevY = this._surfaceY(x, z, prevY);
        samples.push(x, prevY, z);
        acc += len / steps;
      }
    }
    const n = samples.length / 3;
    if (n < 2) return;

    const pos = new Float32Array(n * 6);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let dx = samples[b * 3] - samples[a * 3];
      let dz = samples[b * 3 + 2] - samples[a * 3 + 2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const x = samples[i * 3], y = samples[i * 3 + 1] + 0.3, z = samples[i * 3 + 2];
      pos.set([x - dz * RIBBON_HALF_W, y, z + dx * RIBBON_HALF_W, x + dz * RIBBON_HALF_W, y, z - dx * RIBBON_HALF_W], i * 6);
      if (i < n - 1) {
        const v = i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setIndex(idx);
    geom.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4aa3ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.routeMesh = new THREE.Mesh(geom, mat);
    this.routeMesh.renderOrder = 5;
    this.scene.add(this.routeMesh);
  }
}
