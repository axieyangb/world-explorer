// Scenic Tour & Checkpoint Ring Challenge manager (radical simplicity: zero HUD when idle).
import * as THREE from '../../vendor/three.module.js';
import { L } from '../i18n.js';

export const SCENIC_STOPS = [
  { name: 'San Francisco · Embarcadero', lat: 37.7955, lon: -122.3937, mode: 'helicopter' },
  { name: 'New York · Midtown Manhattan', lat: 40.7549, lon: -73.9840, mode: 'drive' },
  { name: 'Paris · Eiffel Tower', lat: 48.8584, lon: 2.2945, mode: 'walk' },
  { name: 'Tokyo · Shibuya Crossing', lat: 35.6595, lon: 139.7004, mode: 'walk' },
  { name: 'Shanghai · Lujiazui', lat: 31.2397, lon: 121.4998, mode: 'drive' },
  { name: 'Zermatt · Swiss Alps', lat: 46.0207, lon: 7.7491, mode: 'airliner' },
  { name: 'Amalfi Coast · Italy', lat: 40.6340, lon: 14.6027, mode: 'boat' },
  { name: 'London · Westminster', lat: 51.5007, lon: -0.1246, mode: 'drive' },
  { name: 'SpaceX Starbase · Texas', lat: 25.9972, lon: -97.1561, mode: 'helicopter' },
];

const RING_COUNT = 6;
const DRIVE_EXCLUDE = new Set(['footway', 'steps', 'cycleway', 'path', 'pedestrian', 'track', 'bridleway']);

function formatDuration(sec) {
  const s = Math.max(0, Number(sec) || 0);
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const rem = (s - mins * 60).toFixed(1).padStart(4, '0');
    return mins + ':' + rem;
  }
  return s.toFixed(1) + 's';
}

function distSqPointToSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-6) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    return dx * dx + dy * dy + dz * dz;
  }
  let t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t - px;
  const cy = ay + aby * t - py;
  const cz = az + abz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

function readBestTime(mode) {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = Number(localStorage.getItem('we_challenge_best_' + mode));
      return Number.isFinite(v) && v > 0 ? v : null;
    }
  } catch (_) {}
  return null;
}

function writeBestTime(mode, sec) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('we_challenge_best_' + mode, sec.toFixed(2));
    }
  } catch (_) {}
}

export class ScenicTourAndChallenges {
  constructor(app) {
    this.app = app;
    this._stopIdx = -1;
    this._teleportSeq = 0;
    this._active = false;
    this._mode = 'walk';
    this._checkpoints = [];
    this._currentIdx = 0;
    this._elapsed = 0;
    this._animTime = 0;
    this._group = null;
    this._geometries = [];
    this._materials = [];
    this._hudEl = null;
    this._lastHudText = '';
    this._prevPos = null;
    this._chimeCtx = null;
  }

  nextScenicStop() {
    this._stopIdx = (this._stopIdx + 1) % SCENIC_STOPS.length;
    const stop = SCENIC_STOPS[this._stopIdx];
    this.clear();

    const seq = ++this._teleportSeq;
    const app = this.app;
    if (!app) return stop;

    const applyMode = () => {
      if (seq !== this._teleportSeq) return;
      if (stop.mode === 'airliner') {
        const gh = app.world?.getHeightAt?.(app.pos.x, app.pos.z) ?? app.pos?.y ?? 0;
        if (app.pos && app.pos.y < gh + 60) {
          app.pos.y = gh + 180;
        }
      }
      if (typeof app.setMode === 'function') {
        app.setMode(stop.mode);
      }
      app._showToast?.(stop.name);
    };

    if (typeof app.teleportToLocation === 'function') {
      Promise.resolve(app.teleportToLocation(stop.lat, stop.lon, stop.name, stop.name))
        .then(applyMode)
        .catch(() => {});
    } else {
      applyMode();
    }

    return stop;
  }

  isChallengeActive() {
    return this._active;
  }

  toggleChallenge() {
    if (this._active) {
      this.stopChallenge();
      return false;
    }
    this.startChallenge();
    return this._active;
  }

  startChallenge() {
    this.clear();
    const app = this.app;
    if (!app || !app.scene || !app.pos) return;

    const mode = app.mode || 'walk';
    const isAir = mode === 'helicopter' || mode === 'airliner';
    const pos = this._getPlayerPosition();
    const yaw = Number.isFinite(app.yaw) ? app.yaw : 0;

    const waypoints = this._buildWaypoints(mode, pos, yaw);
    const group = new THREE.Group();
    group.name = 'scenic-challenge-course';

    const cfg = this._gateConfig(mode);
    const ringGeo = isAir
      ? new THREE.TorusGeometry(cfg.radius, cfg.tube, 14, 42)
      : new THREE.TorusGeometry(cfg.radius, cfg.tube, 12, 32, Math.PI);
    const pillarGeo = isAir
      ? null
      : new THREE.CylinderGeometry(cfg.tube * 0.9, cfg.tube * 1.15, cfg.pillarH, 10);
    this._geometries.push(ringGeo);
    if (pillarGeo) this._geometries.push(pillarGeo);

    const checkpoints = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xfbbf24 : 0x38bdf8,
        transparent: true,
        opacity: i === 0 ? 0.92 : (i === 1 ? 0.36 : 0.16),
        depthWrite: false,
      });
      this._materials.push(mat);

      const node = new THREE.Group();
      node.position.set(wp.x, wp.y, wp.z);
      node.rotation.y = wp.yaw;

      if (isAir) {
        const torus = new THREE.Mesh(ringGeo, mat);
        node.add(torus);
      } else {
        const arch = new THREE.Mesh(ringGeo, mat);
        arch.position.y = cfg.pillarH;
        const leftPillar = new THREE.Mesh(pillarGeo, mat);
        leftPillar.position.set(-cfg.radius, cfg.pillarH * 0.5, 0);
        const rightPillar = new THREE.Mesh(pillarGeo, mat);
        rightPillar.position.set(cfg.radius, cfg.pillarH * 0.5, 0);
        node.add(arch, leftPillar, rightPillar);
      }

      group.add(node);
      checkpoints.push({
        x: wp.x,
        y: isAir ? wp.y : wp.y + cfg.pillarH * 0.5,
        z: wp.z,
        yaw: wp.yaw,
        passRadius: cfg.passRadius,
        heightTol: cfg.heightTol,
        isAir,
        node,
        mat,
      });
    }

    app.scene.add(group);
    this._group = group;
    this._checkpoints = checkpoints;
    this._mode = mode;
    this._currentIdx = 0;
    this._elapsed = 0;
    this._animTime = 0;
    this._active = true;
    this._prevPos = { x: pos.x, y: pos.y, z: pos.z };

    this._createHudPill();
    this._updateHudPill(true);
  }

  stopChallenge() {
    this.clear();
  }

  clear() {
    this._active = false;
    this._checkpoints = [];
    this._currentIdx = 0;
    this._elapsed = 0;
    this._prevPos = null;
    this._lastHudText = '';

    if (this._group) {
      if (this._group.parent) {
        this._group.parent.remove(this._group);
      } else if (this.app?.scene) {
        this.app.scene.remove(this._group);
      }
      this._group = null;
    }
    for (const g of this._geometries) {
      try { g.dispose(); } catch (_) {}
    }
    this._geometries.length = 0;
    for (const m of this._materials) {
      try { m.dispose(); } catch (_) {}
    }
    this._materials.length = 0;

    if (this._hudEl) {
      this._hudEl.remove();
      this._hudEl = null;
    }
  }

  update(dt) {
    if (!this._active || !this.app || this.app._teleportHold > 0) return;

    const safeDt = Math.max(0, Math.min(0.25, Number(dt) || 0));
    this._elapsed += safeDt;
    this._animTime += safeDt;

    const cp = this._checkpoints[this._currentIdx];
    if (!cp) {
      this.stopChallenge();
      return;
    }

    const pulse = 1 + 0.045 * Math.sin(this._animTime * 4.2);
    cp.node.scale.setScalar(pulse);
    cp.mat.opacity = 0.82 + 0.14 * Math.sin(this._animTime * 5.0);

    const pos = this._getPlayerPosition();
    const prev = this._prevPos || pos;
    let passed = false;

    if (cp.isAir) {
      const d2 = distSqPointToSegment(cp.x, cp.y, cp.z, prev.x, prev.y, prev.z, pos.x, pos.y, pos.z);
      passed = d2 <= cp.passRadius * cp.passRadius;
    } else {
      const d2 = distSqPointToSegment(cp.x, 0, cp.z, prev.x, 0, prev.z, pos.x, 0, pos.z);
      const dy = Math.abs(pos.y - cp.y);
      passed = d2 <= cp.passRadius * cp.passRadius && dy <= cp.heightTol;
    }

    this._prevPos = { x: pos.x, y: pos.y, z: pos.z };

    if (passed) {
      const isFinal = this._currentIdx === this._checkpoints.length - 1;
      this._playChime(isFinal);
      cp.node.visible = false;
      this._currentIdx++;

      if (this._currentIdx >= this._checkpoints.length) {
        const total = this._elapsed;
        const prevBest = readBestTime(this._mode);
        const isBest = prevBest === null || total < prevBest;
        if (isBest) writeBestTime(this._mode, total);
        const bestLabel = formatDuration(isBest ? total : prevBest);
        const timeLabel = formatDuration(total);
        const msg = isBest
          ? L('Course complete · ' + timeLabel + ' (New Best!)', '赛道完成 · ' + timeLabel + '（新纪录！）')
          : L('Course complete · ' + timeLabel + ' (Best: ' + bestLabel + ')', '赛道完成 · ' + timeLabel + '（最佳: ' + bestLabel + '）');
        this.app._showToast?.(msg);
        this.stopChallenge();
        return;
      }

      this._refreshCheckpointStyles();
    }

    this._updateHudPill(false);
  }

  dispose() {
    this.clear();
    if (this._chimeCtx) {
      try { this._chimeCtx.close().catch(() => {}); } catch (_) {}
      this._chimeCtx = null;
    }
  }

  _getPlayerPosition() {
    const app = this.app;
    if (app.mode === 'airliner' && app.airliner?.mesh?.position) {
      return app.airliner.mesh.position;
    }
    return app.pos;
  }

  _gateConfig(mode) {
    if (mode === 'airliner') {
      return { radius: 28, tube: 1.4, pillarH: 0, passRadius: 34, heightTol: 34, spacing: 260, curveAmp: 75, minAlt: 95 };
    }
    if (mode === 'helicopter') {
      return { radius: 13, tube: 0.7, pillarH: 0, passRadius: 17, heightTol: 17, spacing: 120, curveAmp: 34, minAlt: 32 };
    }
    if (mode === 'boat') {
      return { radius: 7.5, tube: 0.45, pillarH: 3.5, passRadius: 13, heightTol: 12, spacing: 95, curveAmp: 22, minAlt: 0 };
    }
    if (mode === 'drive') {
      return { radius: 5.5, tube: 0.34, pillarH: 2.8, passRadius: 8.5, heightTol: 8, spacing: 88, curveAmp: 16, minAlt: 0 };
    }
    return { radius: 2.8, tube: 0.2, pillarH: 1.8, passRadius: 4.5, heightTol: 6, spacing: 26, curveAmp: 5, minAlt: 0 };
  }

  _sampleGroundY(mode, x, z, refY) {
    const app = this.app;
    if (mode === 'boat') {
      return app.water?.getWaterSurfaceY?.(x, z) ?? 0.28;
    }
    const worldY = app.world?.getHeightAt ? app.world.getHeightAt(x, z) : 0;
    if (mode === 'drive' || mode === 'walk') {
      const surf = app.sampleRoadSurface?.(x, refY, z);
      if (surf && Number.isFinite(surf.y)) {
        return Math.max(worldY, surf.y);
      }
    }
    return worldY;
  }

  _findRoadWaypoints(mode, pos, yaw, spacing) {
    const app = this.app;
    if ((mode !== 'drive' && mode !== 'walk') || !app.loadedChunks || !app.worldToChunk) {
      return null;
    }
    const pool = [];
    const [cx0, cz0] = app.worldToChunk(pos.x, pos.z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = app.loadedChunks.get((cx0 + dx) + ',' + (cz0 + dz));
        const segs = chunk?.userData?.roadSegments;
        if (!segs) continue;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (mode === 'drive' && DRIVE_EXCLUDE.has(s.cls)) continue;
          if (s.tunnel) continue;
          pool.push(s);
        }
      }
    }
    if (pool.length === 0) return null;

    const waypoints = [];
    let curX = pos.x;
    let curZ = pos.z;
    let curYaw = yaw;
    const used = new Set();

    for (let step = 0; step < RING_COUNT; step++) {
      const fwdX = Math.sin(curYaw);
      const fwdZ = Math.cos(curYaw);
      const minD = spacing * 0.55;
      const maxD = spacing * 1.65;

      let bestSeg = null;
      let bestScore = Infinity;
      let bestX = 0;
      let bestY = 0;
      let bestZ = 0;
      let bestYaw = curYaw;

      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (used.has(s)) continue;
        const mx = (s.x1 + s.x2) * 0.5;
        const mz = (s.z1 + s.z2) * 0.5;
        const vx = mx - curX;
        const vz = mz - curZ;
        const d = Math.hypot(vx, vz);
        if (d < minD || d > maxD) continue;
        const dot = (vx * fwdX + vz * fwdZ) / d;
        if (dot < 0.42) continue;

        const score = Math.abs(d - spacing) + (1 - dot) * spacing * 0.8;
        if (score < bestScore) {
          bestScore = score;
          bestSeg = s;
          bestX = mx;
          bestY = (s.y1 + s.y2) * 0.5;
          bestZ = mz;
          let rx = s.x2 - s.x1;
          let rz = s.z2 - s.z1;
          if (rx * vx + rz * vz < 0) {
            rx = -rx;
            rz = -rz;
          }
          bestYaw = Math.hypot(rx, rz) > 0.5 ? Math.atan2(rx, rz) : Math.atan2(vx, vz);
        }
      }

      if (!bestSeg) break;
      used.add(bestSeg);
      waypoints.push({ x: bestX, y: bestY, z: bestZ, yaw: bestYaw });
      curX = bestX;
      curZ = bestZ;
      curYaw = bestYaw;
    }

    return waypoints.length >= 3 ? waypoints : null;
  }

  _buildWaypoints(mode, pos, yaw) {
    const cfg = this._gateConfig(mode);
    const isAir = mode === 'helicopter' || mode === 'airliner';
    const roadWps = this._findRoadWaypoints(mode, pos, yaw, cfg.spacing);

    if (roadWps && roadWps.length === RING_COUNT) {
      return roadWps;
    }

    const waypoints = roadWps ? roadWps.slice() : [];
    const startIdx = waypoints.length;
    const basePos = startIdx > 0 ? waypoints[startIdx - 1] : { x: pos.x, y: pos.y, z: pos.z, yaw };
    const fwdX = Math.sin(basePos.yaw);
    const fwdZ = Math.cos(basePos.yaw);
    const rightX = Math.cos(basePos.yaw);
    const rightZ = -Math.sin(basePos.yaw);

    for (let i = startIdx; i < RING_COUNT; i++) {
      const k = i - startIdx + 1;
      const dist = k * cfg.spacing;
      const latOffset = Math.sin(k * 0.72) * cfg.curveAmp;
      const x = basePos.x + fwdX * dist + rightX * latOffset;
      const z = basePos.z + fwdZ * dist + rightZ * latOffset;

      const nextDist = (k + 0.25) * cfg.spacing;
      const nextLat = Math.sin((k + 0.25) * 0.72) * cfg.curveAmp;
      const nx = basePos.x + fwdX * nextDist + rightX * nextLat;
      const nz = basePos.z + fwdZ * nextDist + rightZ * nextLat;
      const gateYaw = Math.atan2(nx - x, nz - z);

      let y;
      if (isAir) {
        const gh = this._sampleGroundY(mode, x, z, pos.y);
        const startAirY = Math.max(pos.y, gh + cfg.minAlt);
        const waveY = Math.sin(k * 0.85) * (mode === 'airliner' ? 28 : 14);
        y = Math.max(gh + cfg.minAlt, startAirY + waveY);
      } else {
        y = this._sampleGroundY(mode, x, z, basePos.y);
      }
      waypoints.push({ x, y, z, yaw: gateYaw });
    }

    return waypoints;
  }

  _refreshCheckpointStyles() {
    for (let i = this._currentIdx; i < this._checkpoints.length; i++) {
      const cp = this._checkpoints[i];
      if (i === this._currentIdx) {
        cp.mat.color.setHex(0xfbbf24);
        cp.mat.opacity = 0.92;
      } else {
        cp.mat.color.setHex(0x38bdf8);
        cp.mat.opacity = i === this._currentIdx + 1 ? 0.36 : 0.16;
        cp.node.scale.setScalar(1);
      }
    }
  }

  _createHudPill() {
    if (typeof document === 'undefined') return;
    const el = document.createElement('button');
    el.type = 'button';
    el.id = 'scenic-challenge-pill';
    el.style.cssText = [
      'position:fixed',
      'top:68px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:6px 14px',
      'border-radius:999px',
      'background:rgba(15,20,28,0.78)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'border:1px solid rgba(255,255,255,0.16)',
      'color:#f8fafc',
      'font:600 12px/1.3 system-ui,-apple-system,sans-serif',
      'letter-spacing:0.03em',
      'z-index:88',
      'cursor:pointer',
      'white-space:nowrap',
      'box-shadow:0 6px 20px rgba(0,0,0,0.28)',
    ].join(';');
    el.addEventListener('click', () => this.stopChallenge());
    document.body.appendChild(el);
    this._hudEl = el;
  }

  _updateHudPill(force) {
    if (!this._hudEl) return;
    const idx = Math.min(this._currentIdx + 1, this._checkpoints.length);
    const total = this._checkpoints.length || RING_COUNT;
    const timeStr = formatDuration(this._elapsed);
    const text = L(
      'Checkpoint ' + idx + ' / ' + total + ' · ' + timeStr + ' · Click to stop',
      '检查点 ' + idx + ' / ' + total + ' · ' + timeStr + ' · 点击停止'
    );
    if (force || text !== this._lastHudText) {
      this._lastHudText = text;
      this._hudEl.textContent = text;
    }
  }

  _playChime(isFinal) {
    if (typeof window === 'undefined' || window.__weMuted === true) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      if (!this._chimeCtx) {
        this._chimeCtx = new AC();
      }
      const ctx = this._chimeCtx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const notes = isFinal ? [587.33, 783.99, 1046.5] : [659.25, 880.0];
      notes.forEach((freq, i) => {
        const t0 = now + i * 0.055;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.08, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      });
    } catch (_) {}
  }
}
