// [weapon-pickups] Weapons and ammo cans lying around the world for the on-foot player to find.
//
// Placement is deterministic per chunk (seeded from the city origin + chunk index), so the same spots come back
// when you return: a few per km² on sidewalks, more in parks (non-street trees), alleys (service roads /
// footways) and on low rooftops, and sometimes beside parked police cars (places-info). Every spot is checked
// against car roads, building footprints and water. Rarity: rifle common, RPG rare, railgun very rare.
//
// Only pickups within VIS_R get a model (pooled; geometry/materials shared with weapon_models.js), so the cost
// is a handful of meshes at most. Walking over one collects it through walker_weapons.collectPickup(); a taken
// spot comes back after a few minutes or when its chunk reloads. The minimap draws nearby pickups.
import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';
import { createWeaponModel } from './weapon_models.js';
import { WALKER_WEAPONS } from './walker_weapons.js';
import { getWeaponSfx } from './weapon_sfx.js';
import { showVehicleToast } from './vehicles.js';
import { t as tr, getLang } from '../i18n.js';

const VIS_R = 150;            // models exist within this range (beam fades out from 95 to 130 m)
const COLLECT_R = 1.7;
const HINT_R = 16;
const RESPAWN_MS = [180000, 300000];
const MIN_GAP = 28;           // metres between pickups of one chunk
const KINDS = ['RIFLE', 'RPG', 'RAILGUN', 'AMMO'];
const COLORS = { RIFLE: 0xffc24a, RPG: 0xff7a3a, RAILGUN: 0x4af0ff, AMMO: 0x9cff6a };
const CAR_CLS_SKIP = new Set(['footway', 'pedestrian', 'steps', 'cycleway', 'path', 'track', 'bridleway', 'corridor']);
const SIDEWALK_CLS = new Set(['primary', 'secondary', 'tertiary', 'residential']);
const ALLEY_CLS = new Set(['service', 'footway', 'pedestrian', 'living_street', 'path']);

function hash(a, b, c, d) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35) ^ Math.imul(c | 0, 0x27d4eb2f) ^ Math.imul(d | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
function pointInRing2D(px, pz, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1], xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted kind roll for a spot type.
const ODDS = {
  street: [['RIFLE', 50], ['AMMO', 33], ['RPG', 12], ['RAILGUN', 5]],
  park: [['RIFLE', 46], ['AMMO', 32], ['RPG', 15], ['RAILGUN', 7]],
  roof: [['RIFLE', 34], ['AMMO', 22], ['RPG', 28], ['RAILGUN', 16]],
  police: [['RIFLE', 65], ['AMMO', 35]],
};
function rollKind(rng, where) {
  const list = ODDS[where] || ODDS.street;
  let tot = 0;
  for (const [, w] of list) tot += w;
  let r = rng() * tot;
  for (const [k, w] of list) if ((r -= w) <= 0) return k;
  return list[0][0];
}

// ---------------------------------------------------------------------------------------------------
// Shared visuals: soft ground glow + a thin light beam (both additive, fade with camera distance).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(cv);
  const glowGeo = new THREE.PlaneGeometry(2.4, 2.4);
  glowGeo.rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.07, 0.14, 9, 10, 1, true);
  beamGeo.translate(0, 4.5, 0);
  const time = { value: 0 };
  const glow = {}, beam = {};
  for (const k of KINDS) {
    glow[k] = new THREE.MeshBasicMaterial({
      map: glowTex, color: COLORS[k], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    beam[k] = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(COLORS[k]) }, uTime: time },
      vertexShader: `
        varying float vH; varying float vD; varying float vEdge;
        void main() {
          vH = position.y / 9.0;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vD = distance(wp.xyz, cameraPosition);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vEdge = abs(dot(n, normalize(cameraPosition - wp.xyz)));
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime;
        varying float vH; varying float vD; varying float vEdge;
        void main() {
          float fade = (1.0 - smoothstep(0.1, 1.0, vH)) * smoothstep(0.0, 0.05, vH);
          float wave = 0.8 + 0.2 * sin(vH * 22.0 - uTime * 3.0);
          float dist = smoothstep(130.0, 95.0, vD) * mix(0.12, 1.0, smoothstep(6.0, 40.0, vD));
          float a = 0.24 * fade * wave * dist * pow(vEdge, 0.6);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  SHARED = { glowGeo, beamGeo, glow, beam, time };
  return SHARED;
}

/** Builds one pickup visual (root group, ground at y = 0). Exported for the model viewer. */
export function createPickupVisual(kind) {
  const S = shared();
  const root = new THREE.Group();
  const item = new THREE.Group();
  root.add(item);
  if (kind === 'AMMO') {
    item.add(createWeaponModel('AMMO'));
  } else if (kind === 'RIFLE') {
    // Lying on its left side in the dirt, ejection port up.
    const m = createWeaponModel('RIFLE');
    m.rotation.set(0, 0, Math.PI / 2);
    m.position.set(0.0, 0.036, 0.05);
    item.add(m);
  } else {
    // Launchers come in an open hard case.
    const len = kind === 'RPG' ? 1.42 : 1.06;
    const c = createWeaponModel('CASE');
    c.scale.set(1, 1, len);
    item.add(c);
    const m = createWeaponModel(kind);
    m.rotation.set(0, 0, -Math.PI / 2); // optic / panels up
    if (kind === 'RPG') m.position.set(0, 0.082 + 0.089, -0.16);
    else m.position.set(0, 0.082 + 0.084, -0.07);
    item.add(m);
  }
  const glow = new THREE.Mesh(S.glowGeo, S.glow[kind]);
  glow.position.y = 0.03;
  glow.renderOrder = 2;
  root.add(glow);
  const beam = new THREE.Mesh(S.beamGeo, S.beam[kind]);
  beam.renderOrder = 3;
  beam.frustumCulled = false;
  root.add(beam);
  root.traverse((o) => { if (o.isMesh && o !== glow && o !== beam) o.castShadow = true; });
  return { group: root, item, kind };
}

export class WeaponPickups {
  constructor(app) {
    this.app = app;
    this.chunks = new Map();  // chunk key -> { group, items }
    this.taken = new Map();   // pickup id -> respawn time (performance.now ms)
    this.pool = { RIFLE: [], RPG: [], RAILGUN: [], AMMO: [] };
    this.root = new THREE.Group();
    this.root.name = 'weapon-pickups';
    app.scene.add(this.root);
    this.gen = -1;
    this.time = 0;
    this.stats = { chunks: 0, items: 0, visible: 0, scanMs: 0 };
    this._near = null;
    this._lastCollect = 0;
    if (typeof window !== 'undefined') window.__PICKUPS__ = this;
  }

  // ---- placement -------------------------------------------------------------------------------
  _scanChunk(key, group) {
    const t0 = performance.now();
    const ud = group.userData || {};
    const app = this.app;
    const O = app.worldOrigin || {};
    const seed = hash(ud.cx, ud.cz, Math.round((O.centerLat || 0) * 1e4), Math.round((O.centerLon || 0) * 1e4));
    let rng = null;
    const stream = (salt) => (rng = mulberry32(seed ^ Math.imul(salt, 0x9e3779b1))); // one stream per spot type
    const ox = ud.ox, oz = ud.oz;
    const segs = ud.roadSegments || [];
    const blds = ud.buildingColliders || [];

    // 40 m grids over the chunk for road / building tests.
    const N = 25, CELL = 40;
    const cellOf = (x, z) => {
      const gx = Math.floor((x - ox + 500) / CELL), gz = Math.floor((z - oz + 500) / CELL);
      return gx < 0 || gz < 0 || gx >= N || gz >= N ? -1 : gz * N + gx;
    };
    const segGrid = new Array(N * N), bGrid = new Array(N * N);
    const insert = (grid, minX, minZ, maxX, maxZ, v) => {
      const gx0 = Math.max(0, Math.floor((minX - ox + 500) / CELL)), gx1 = Math.min(N - 1, Math.floor((maxX - ox + 500) / CELL));
      const gz0 = Math.max(0, Math.floor((minZ - oz + 500) / CELL)), gz1 = Math.min(N - 1, Math.floor((maxZ - oz + 500) / CELL));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) (grid[gz * N + gx] || (grid[gz * N + gx] = [])).push(v);
    };
    for (const s of segs) {
      const m = (s.width || 6) * 0.5 + 4;
      insert(segGrid, Math.min(s.x1, s.x2) - m, Math.min(s.z1, s.z2) - m, Math.max(s.x1, s.x2) + m, Math.max(s.z1, s.z2) + m, s);
    }
    for (const b of blds) insert(bGrid, b.minX - 2, b.minZ - 2, b.maxX + 2, b.maxZ + 2, b);

    // Distance from (x, z) to segment s, and its height there.
    const segDist = (s, x, z) => {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / L2));
      return Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t));
    };
    const onCarRoad = (x, z, margin, own = null) => {
      const list = segGrid[cellOf(x, z)];
      if (!list) return false;
      for (const s of list) {
        if (s === own || s.tunnel || CAR_CLS_SKIP.has(s.cls)) continue;
        if (segDist(s, x, z) < (s.width || 6) * 0.5 + margin) return true;
      }
      return false;
    };
    const inBuilding = (x, z, pad) => {
      for (const [px, pz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
        const list = bGrid[cellOf(x + px, z + pz)];
        if (!list) continue;
        for (const b of list) {
          const wx = x + px, wz = z + pz;
          if (wx < b.minX || wx > b.maxX || wz < b.minZ || wz > b.maxZ) continue;
          if (!b.flatOuter || b.flatOuter.length < 6 || pointInRing2D(wx - b.ox, wz - b.oz, b.flatOuter)) return true;
        }
      }
      return false;
    };
    const wet = (x, z) => {
      const W = app.water;
      if (!W || !W.isPointInWater) return false;
      return W.isPointInWater(x, z) || W.isPointInWater(x + 2, z) || W.isPointInWater(x - 2, z) || W.isPointInWater(x, z + 2) || W.isPointInWater(x, z - 2);
    };
    const groundY = (x, z) => {
      const base = Math.max(getBeijingTerrainElevation(x, z) + 0.16, getChunkTerrainMeshElevation(x, z) + 0.08);
      const surf = app.sampleRoadSurface ? app.sampleRoadSurface(x, base + 1.5, z) : null;
      return surf && surf.y > base && surf.y < base + 1.5 ? surf.y : base;
    };
    const inChunk = (x, z) => Math.abs(x - ox) < 492 && Math.abs(z - oz) < 492;

    const items = [];
    const free = (x, z) => {
      for (const it of items) if ((it.x - x) * (it.x - x) + (it.z - z) * (it.z - z) < MIN_GAP * MIN_GAP) return false;
      return true;
    };
    const add = (x, y, z, where) => {
      const kind = rollKind(rng, where);
      items.push({ id: `${ud.cx},${ud.cz}:${items.length}`, kind, x, y, z, yaw: rng() * Math.PI * 2, where, vis: null });
    };
    const groundOk = (x, z, own = null, roadMargin = 1.2) =>
      inChunk(x, z) && free(x, z) && !onCarRoad(x, z, roadMargin, own) && !inBuilding(x, z, 0.9) && !wet(x, z);

    // 1. Sidewalks beside ordinary streets.
    stream(1);
    const walkSegs = segs.filter((s) => SIDEWALK_CLS.has(s.cls) && !s.bridge && !s.tunnel && Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 14);
    for (let a = 0, got = 0; a < 8 && got < 2 && walkSegs.length; a++) {
      const s = walkSegs[Math.floor(rng() * walkSegs.length)];
      const t = 0.2 + rng() * 0.6, side = rng() < 0.5 ? -1 : 1;
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), nx = -(s.z2 - s.z1) / len * side, nz = (s.x2 - s.x1) / len * side;
      const off = (s.width || 6) * 0.5 + (s.cls === 'residential' ? 0.8 : 1.1);
      const x = s.x1 + (s.x2 - s.x1) * t + nx * off, z = s.z1 + (s.z2 - s.z1) * t + nz * off;
      if (!groundOk(x, z, s, 0.4)) continue;
      add(x, Math.max(groundY(x, z), s.y1 + (s.y2 - s.y1) * t + 0.04), z, 'street');
      got++;
    }
    // 2. Alleys: service roads, footways, pedestrian streets.
    stream(2);
    const alleySegs = segs.filter((s) => ALLEY_CLS.has(s.cls) && !s.bridge && !s.tunnel && !(s.layer > 0));
    for (let a = 0, got = 0; a < 10 && got < 2 && alleySegs.length; a++) {
      const s = alleySegs[Math.floor(rng() * alleySegs.length)];
      const t = 0.15 + rng() * 0.7, side = rng() < 0.5 ? -1 : 1;
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1, nx = -(s.z2 - s.z1) / len * side, nz = (s.x2 - s.x1) / len * side;
      const off = s.cls === 'service' ? (s.width || 4) * 0.5 + 0.9 : 0.6;
      const x = s.x1 + (s.x2 - s.x1) * t + nx * off, z = s.z1 + (s.z2 - s.z1) * t + nz * off;
      if (!groundOk(x, z, s.cls === 'service' ? s : null, 0.6)) continue;
      add(x, groundY(x, z), z, 'street');
      got++;
    }
    // 3. Parks: near non-street trees (real parks / woods).
    stream(3);
    const veg = ud.vegInstances;
    if (veg && veg.inst && veg.count - (veg.streetCount || 0) > 25) {
      const n0 = veg.streetCount || 0, nP = veg.count - n0;
      for (let a = 0, got = 0; a < 14 && got < 3; a++) {
        const i = n0 + Math.floor(rng() * nP), o = i * 9;
        const ang = rng() * Math.PI * 2, r = 2.5 + rng() * 2.5;
        const x = veg.inst[o] + Math.cos(ang) * r, z = veg.inst[o + 2] + Math.sin(ang) * r;
        if (!groundOk(x, z)) continue;
        add(x, groundY(x, z), z, 'park');
        got++;
      }
    }
    // 4. Low flat rooftops (reachable with a sprint jump).
    stream(4);
    if (blds.length && rng() < 0.6) {
      for (let a = 0; a < 12; a++) {
        const b = blds[Math.floor(rng() * blds.length)];
        const cx = (b.minX + b.maxX) * 0.5, cz = (b.minZ + b.maxZ) * 0.5;
        const w = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
        if (w < 7 || !inChunk(cx, cz) || !free(cx, cz)) continue;
        const rel = b.h - getBeijingTerrainElevation(cx, cz);
        if (rel < 2.6 || rel > 4.6) continue;
        if (b.flatOuter && b.flatOuter.length >= 6 && !pointInRing2D(cx - b.ox, cz - b.oz, b.flatOuter)) continue;
        let covered = false; // something taller standing on it
        for (const o of bGrid[cellOf(cx, cz)] || []) {
          if (o !== b && o.h > b.h + 0.3 && cx >= o.minX && cx <= o.maxX && cz >= o.minZ && cz <= o.maxZ) { covered = true; break; }
        }
        if (covered) continue;
        add(cx, b.h + 0.02, cz, 'roof');
        break;
      }
    }
    // 5. Beside parked police cars (places-info props).
    stream(5);
    const pc = ud.places && ud.places.inst && ud.places.inst.pi_policeCar;
    if (pc) {
      for (let o = 0; o + 7 < pc.length; o += 8) {
        if (rng() > 0.6) continue;
        const rot = pc[o + 3];
        for (const sd of [2.4, -2.4]) {
          const x = pc[o] + Math.cos(rot) * sd + Math.sin(rot) * 1.2, z = pc[o + 2] - Math.sin(rot) * sd + Math.cos(rot) * 1.2;
          if (!groundOk(x, z, null, 0.3)) continue;
          add(x, groundY(x, z), z, 'police');
          break;
        }
      }
    }
    const ms = performance.now() - t0;
    this.stats.scanMs = Math.max(this.stats.scanMs, ms);
    this.stats.scans = (this.stats.scans || 0) + 1;
    this.stats.scanTotal = (this.stats.scanTotal || 0) + ms;
    return items;
  }

  _reset() {
    for (const c of this.chunks.values()) for (const it of c.items) this._release(it);
    this.chunks.clear();
    this.taken.clear();
  }

  _syncChunks() {
    const loaded = this.app.loadedChunks;
    if (!loaded) return;
    for (const [key, c] of this.chunks) {
      if (loaded.get(key) === c.group) continue; // (scanned chunks stay until unloaded, so spots stay stable)
      for (const it of c.items) {
        this._release(it);
        this.taken.delete(it.id); // a reloaded chunk restocks
      }
      this.chunks.delete(key);
    }
    // Only the 3x3 chunks around the player: farther pickups are past both the beam and the minimap range.
    const [pcx, pcz] = this.app.worldToChunk ? this.app.worldToChunk(this.app.pos.x, this.app.pos.z) : [0, 0];
    for (const [key, group] of loaded) {
      if (this.chunks.has(key)) continue;
      const ud = group.userData;
      if (!ud || !ud.roadSegments || Math.abs(ud.cx - pcx) > 1 || Math.abs(ud.cz - pcz) > 1) continue;
      this.chunks.set(key, { group, items: this._scanChunk(key, group) });
      break; // one chunk per frame
    }
  }

  // ---- visuals -----------------------------------------------------------------------------------
  _acquire(it) {
    const v = this.pool[it.kind].pop() || createPickupVisual(it.kind);
    v.group.position.set(it.x, it.y, it.z);
    v.item.rotation.y = it.yaw;
    v.group.visible = true;
    this.root.add(v.group);
    it.vis = v;
  }

  _release(it) {
    if (!it.vis) return;
    this.root.remove(it.vis.group);
    this.pool[it.kind].push(it.vis);
    it.vis = null;
  }

  update(dt) {
    const app = this.app;
    if ((app.teleportGeneration || 0) !== this.gen) {
      this.gen = app.teleportGeneration || 0;
      this._reset();
    }
    if (app.isTeleporting) return;
    this._syncChunks();
    this.time += dt;
    const S = shared();
    S.time.value = this.time;
    const pulse = 0.42 + 0.16 * Math.sin(this.time * 2.6);
    for (const k of KINDS) S.glow[k].opacity = pulse;

    const kaiju = Boolean(app.kaiju && app.kaiju.active);
    this.root.visible = !kaiju;
    const p = app.pos;
    const cam = app.camera ? app.camera.position : p;
    const now = performance.now();
    const canCollect = app.mode === 'walk' && !kaiju && app.walkerWeapons;
    let near = null, nearD = HINT_R, items = 0, vis = 0;
    for (const c of this.chunks.values()) {
      for (const it of c.items) {
        items++;
        const tk = this.taken.get(it.id);
        if (tk !== undefined) {
          if (now < tk) { this._release(it); continue; }
          this.taken.delete(it.id);
        }
        const dc = Math.hypot(it.x - cam.x, it.z - cam.z);
        if (dc < VIS_R && !kaiju) { if (!it.vis) this._acquire(it); vis++; }
        else if (it.vis && dc > VIS_R + 20) this._release(it);
        if (!canCollect) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < COLLECT_R && Math.abs(p.y - it.y) < 1.8) {
          if (this._collect(it)) continue;
        }
        if (d < nearD && Math.abs(p.y - it.y) < 6) { nearD = d; near = it; }
      }
    }
    this.stats.items = items;
    this.stats.visible = vis;
    this.stats.chunks = this.chunks.size;
    this._updateHint(canCollect ? near : null, nearD);
  }

  _name(kind) {
    if (kind === 'AMMO') return tr('wp_ammo_box');
    const w = WALKER_WEAPONS[kind];
    return getLang() === 'zh' ? w.nameZh : w.name;
  }

  _collect(it) {
    const W = this.app.walkerWeapons;
    const msg = W.collectPickup(it.kind);
    if (!msg) { it.blocked = true; return false; }
    it.blocked = false;
    const [a, b] = RESPAWN_MS;
    this.taken.set(it.id, performance.now() + a + Math.random() * (b - a));
    this._release(it);
    getWeaponSfx(this.app).play('pickup', { gain: 0.5 });
    showVehicleToast(msg);
    return true;
  }

  _updateHint(it, d) {
    const W = this.app.walkerWeapons;
    if (!W || !W.setPickupHint) return;
    if (!it) { W.setPickupHint(''); return; }
    if (it.blocked && d < COLLECT_R + 1.5) {
      const full = it.kind !== 'AMMO' || Object.keys(W.inventory || {}).length > 0;
      W.setPickupHint(`${this._name(it.kind)} · ${tr(full ? 'wp_hint_full' : 'wp_hint_need_gun')}`);
      return;
    }
    W.setPickupHint(tr('wp_hint', { name: this._name(it.kind), d: Math.max(1, Math.round(d)) }));
  }

  /** Minimap overlay: `toScreen(wx, wz)` maps world metres into the minimap's (rotated) drawing space. */
  drawMinimap(ctx, toScreen) {
    if (!this.chunks.size || (this.app.kaiju && this.app.kaiju.active)) return;
    const p = this.app.pos;
    const [x0, y0] = toScreen(p.x, p.z);
    const [x1, y1] = toScreen(p.x + 100, p.z);
    const [x2, y2] = toScreen(p.x, p.z + 100);
    const ax = (x1 - x0) / 100, ay = (y1 - y0) / 100, bx = (x2 - x0) / 100, by = (y2 - y0) / 100;
    const R2 = 480 * 480;
    for (const c of this.chunks.values()) {
      for (const it of c.items) {
        const dx = it.x - p.x, dz = it.z - p.z;
        if (dx * dx + dz * dz > R2 || this.taken.has(it.id)) continue;
        const sx = x0 + ax * dx + bx * dz, sy = y0 + ay * dx + by * dz;
        ctx.beginPath();
        if (it.kind === 'AMMO') ctx.rect(sx - 2.6, sy - 2.6, 5.2, 5.2);
        else { ctx.moveTo(sx, sy - 4); ctx.lineTo(sx + 3.6, sy); ctx.lineTo(sx, sy + 4); ctx.lineTo(sx - 3.6, sy); ctx.closePath(); }
        ctx.fillStyle = '#' + COLORS[it.kind].toString(16).padStart(6, '0');
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

export function initWeaponPickups(app) {
  return new WeaponPickups(app);
}
