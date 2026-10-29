/**
 * feature/famous-landmarks — places hand-built 1:1 landmark models (see registry.js / models/*.js).
 *
 * - Builds each enabled landmark inside the current 40 km world lazily (one per frame), as a THREE.LOD
 *   (full model near, cheap impostor far), two shared-shader materials (lit solid + night glow).
 * - Adds simple prism colliders into the owning chunks' `buildingColliders` (clipped per chunk), so the
 *   car / walker / heli collide and land on them. They are not in the city destruction entity table;
 *   weapons and the Kaiju damage them through landmark_damage.js (`this.damage`).
 * - Optional per-model animation hooks (London Eye wheel, Eiffel sparkle) and night glow.
 */
import * as THREE from "../../../vendor/three.module.js";
import { getChunkTerrainMeshElevation, getBeijingDemState } from "../../environment.js";
import { LANDMARKS, landmarkWorldXZ } from "./registry.js";
import { MODELS } from "./models/index.js";
import { Kit } from "./kit.js";
import { LandmarkDamage } from "./landmark_damage.js";
import { patchLandmarkMaterial, landmarkUniforms, occlusionJob } from "./materials.js"; // [lm-materials]
import { materialSpec } from "./material_map.js"; // [lm-materials]

const DEG = Math.PI / 180;
const SHOW_DIST = 17000;

/** Lit solid + night-glow materials, both textured by the procedural library (materials.js); U = shared uniforms. */
function makeMaterials(glowStrength = 2.2, U) {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.06 });
  const glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0 });
  patchLandmarkMaterial(solid, U, false);
  patchLandmarkMaterial(glow, U, true);
  glow.userData.strength = glowStrength;
  return { solid, glow };
}

/** Sutherland–Hodgman clip of a closed ring [x0,z0,x1,z1,...] to an axis-aligned box. */
function clipRing(ring, x0, z0, x1, z1) {
  let pts = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= z0, (p) => p[1] <= z1,
  ];
  const isect = [
    (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (z0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), z0]; },
    (a, b) => { const t = (z1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), z1]; },
  ];
  for (let e = 0; e < 4 && pts.length; e++) {
    const inside = edges[e], cut = isect[e];
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cut(prev, cur)); out.push(cur); }
      else if (pi) out.push(cut(prev, cur));
    }
    pts = out;
  }
  return pts.length >= 3 ? pts : null;
}

export class LandmarkSystem {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = "famous-landmarks";
    app.scene.add(this.root);
    this.items = [];
    this.originKey = "";
    this.chunkCols = new Map(); // chunkKey -> [collider pieces]
    this.night = 0;
    this.time = 0;
    this._colTimer = 0;
    this.photo = null;
    this.damage = new LandmarkDamage(this);
    this._installDebug();
  }

  // ---------------------------------------------------------------- lifecycle
  _clear() {
    this.damage.reset();
    for (const it of this.items) {
      if (it.group) {
        this.root.remove(it.group);
        it.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        if (it.mats) { it.mats.solid.dispose(); it.mats.glow.dispose(); }
      }
    }
    // remove our pieces from still-loaded chunks
    for (const ch of this.app.loadedChunks.values()) {
      const ud = ch.userData;
      if (!ud || !ud.__lmCols) continue;
      if (ud.buildingColliders) ud.buildingColliders = ud.buildingColliders.filter((c) => !c.landmark);
      ud.__lmCols = false;
    }
    this.items = [];
    this.chunkCols.clear();
  }

  _rebuildForOrigin() {
    this._clear();
    const o = this.app.worldOrigin;
    for (const L of LANDMARKS) {
      if (!L.on || !MODELS[L.id] || typeof MODELS[L.id].build !== "function") continue;
      const p = landmarkWorldXZ(L, o);
      if (!p) continue;
      const it = { L, M: MODELS[L.id], x: p[0], z: p[1], baseY: 0, group: null, anim: null, mats: null, stats: null };
      it.baseY = this._groundY(it);
      this.items.push(it);
      this._registerColliders(it);
    }
  }

  _groundY(it) {
    const s = it.L.supp || { r: 20 };
    const centerY = getChunkTerrainMeshElevation(it.x, it.z);

    // Special multi-point ridge clearance for the 110m-wide Hollywood Sign on Mount Lee:
    // sample across every letter's world (wx, wz) and place baseY above the highest ridge point
    // so 100% of all 9 letters sit above the slope on their steel support towers.
    if (it.L.id === "hollywoodsign") {
      let maxSignY = Number.isFinite(centerY) ? centerY : 0;
      let minSignY = maxSignY;
      for (let lx = -56; lx <= 56; lx += 14) {
        for (const lz of [-4, 0, 6]) {
          const [wx, wz] = this._toWorld(it, lx, lz);
          const gy = getChunkTerrainMeshElevation(wx, wz);
          if (Number.isFinite(gy)) {
            if (gy > maxSignY) maxSignY = gy;
            if (gy < minSignY) minSignY = gy;
          }
        }
      }
      it.minGroundY = minSignY;
      it.maxGroundY = maxSignY;
      return maxSignY + 2.0;
    }

    const r = it.L.groundR ?? Math.min(40, (s.r || Math.min(s.hw, s.hd)) * 0.5); // groundR: opt-in wider ground sampling
    let minY = Number.isFinite(centerY) ? centerY : 0;
    let maxY = minY;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const gy = getChunkTerrainMeshElevation(it.x + Math.cos(a) * r, it.z + Math.sin(a) * r);
      if (Number.isFinite(gy)) {
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;
      }
    }
    it.minGroundY = minY;
    it.maxGroundY = maxY;

    // Bridges (it.L.deck) or explicit wide-base desert pyramids (it.L.groundR) stay anchored at minY
    if (it.L.deck || it.L.groundR != null) {
      return Number.isFinite(minY) ? minY : 0;
    }

    // On hillside/mountain slopes (maxY - minY > 1.2m), place baseY near the upper/center slope
    // so the uphill side of the landmark is NEVER buried inside the mountain, and let _build()
    // extend a stone foundation plinth down to minY on the downhill side!
    if (maxY - minY > 1.2 && centerY > 1.5) {
      return Math.max(centerY, maxY - 0.6);
    }
    return Number.isFinite(minY) ? minY : 0;
  }

  /** local (model) xz -> world xz */
  _toWorld(it, lx, lz) {
    const h = (it.L.heading || 0) * DEG, c = Math.cos(h), s = Math.sin(h);
    return [it.x + lx * c - lz * s, it.z + lx * s + lz * c];
  }

  _registerColliders(it) {
    const cols = it.M.colliders || [];
    for (const col of cols) {
      const ring = [];
      if (col.r) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ring.push(...this._toWorld(it, (col.x || 0) + Math.cos(a) * col.r, (col.z || 0) + Math.sin(a) * col.r));
        }
      } else {
        const ra = (col.rot || 0) * DEG, c = Math.cos(ra), s = Math.sin(ra);
        for (const [ux, uz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const lx = ux * col.hw, lz = uz * col.hd;
          ring.push(...this._toWorld(it, (col.x || 0) + lx * c - lz * s, (col.z || 0) + lx * s + lz * c));
        }
      }
      const topY = it.baseY + col.h;
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        mnx = Math.min(mnx, ring[i]); mxx = Math.max(mxx, ring[i]);
        mnz = Math.min(mnz, ring[i + 1]); mxz = Math.max(mxz, ring[i + 1]);
      }
      const [ca, za] = this.app.worldToChunk(mnx, mnz);
      const [cb, zb] = this.app.worldToChunk(mxx, mxz);
      for (let cx = ca; cx <= cb; cx++) {
        for (let cz = za; cz <= zb; cz++) {
          const ox = -20000 + cx * 1000 + 500, oz = -20000 + cz * 1000 + 500;
          const pts = clipRing(ring, ox - 500, oz - 500, ox + 500, oz + 500);
          if (!pts) continue;
          const flatOuter = [];
          let a = Infinity, b = -Infinity, c2 = Infinity, d = -Infinity;
          for (const [px, pz] of pts) {
            flatOuter.push(px - ox, pz - oz);
            a = Math.min(a, px); b = Math.max(b, px); c2 = Math.min(c2, pz); d = Math.max(d, pz);
          }
          const piece = { minX: a, maxX: b, minZ: c2, maxZ: d, h: topY, flatOuter, ox, oz, id: "lm:" + it.L.id, landmark: it.L.id, name: it.L.name };
          const key = `${cx},${cz}`;
          if (!this.chunkCols.has(key)) this.chunkCols.set(key, []);
          this.chunkCols.get(key).push(piece);
        }
      }
    }
  }

  _attachColliders() {
    for (const [key, pieces] of this.chunkCols) {
      const ch = this.app.loadedChunks.get(key);
      if (!ch || !ch.userData || ch.userData.__lmCols) continue;
      const ud = ch.userData;
      ud.buildingColliders = (ud.buildingColliders || []).concat(pieces);
      ud.__lmCols = true;
      if (this.app.collision && this.app.collision.grids) this.app.collision.grids.delete(ch);
    }
  }

  _build(it) {
    const M = it.M;
    const t0 = performance.now();
    const spec = materialSpec(it.L.id);
    it.U = landmarkUniforms(spec.night, it.baseY);
    it.mats = makeMaterials(M.glowStrength || 2.2, it.U);
    if (spec.night.glow != null) it.mats.glow.emissive.setHex(spec.night.glow); // [lm-materials] floodlight tint of the glow bucket
    const lod = new THREE.LOD();
    const partObjs = new Map();
    let tris = 0, maxY = 0, trisMid = 0, trisFar = 0;
    const aoEntries = [];
    // [lm-materials] levels: full detail; if the model has close-up-only detail (k.fine) that full level is shown
    // within fineDist and a level without it out to lodDist; then the far impostor
    const plan = [{ lod: 0, fine: true, dist: 0 }];
    for (let li = 0; li < plan.length; li++) {
      const P = plan[li];
      const k = new Kit(P.lod, P.fine);
      k.matMap = spec.map;
      k.matStone = spec.stone;
      M.build(k);
      // Automatic downhill foundation skirt on sloped terrain so hillside landmarks never float on the downhill side
      const slopeDrop = (it.baseY || 0) - (it.minGroundY ?? (it.baseY || 0));
      if (slopeDrop > 0.45 && !it.L.deck && it.L.id !== "hollywoodsign" && it.L.id !== "christ") {
        const s = it.L.supp || { r: 18 };
        const skirtH = slopeDrop + 1.8;
        k.glow(false).color(0x9a958b);
        if (s.r) {
          const rad = Math.min(s.r * 0.78, 42);
          k.cyl(0, -skirtH, 0, rad + 0.8, rad, skirtH + 0.05, P.lod === 0 ? 20 : 10);
        } else {
          const hw = Math.min((s.hw || 24) * 0.82, 54);
          const hd = Math.min((s.hd || 24) * 0.82, 54);
          k.box(0, -skirtH, 0, hw * 2, skirtH + 0.05, hd * 2);
        }
      }
      if (li === 0) {
        tris = k.tris;
        if (k.usedFine) plan.push({ lod: 0, fine: false, dist: M.fineDist || 450 });
        plan.push({ lod: 1, fine: false, dist: M.lodDist || 1600 });
      } else if (P.lod === 0) trisMid = k.tris;
      else trisFar = k.tris;
      const g = new THREE.Group();
      for (const part of k.build()) {
        const holder = new THREE.Group();
        holder.name = part.name;
        holder.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
        for (const [geo, mat] of [[part.solid, it.mats.solid], [part.glow, it.mats.glow]]) {
          if (!geo) continue;
          const mesh = new THREE.Mesh(geo, mat);
          aoEntries.push({ attr: geo.attributes.lmA, pos: geo.attributes.position.array, nrm: geo.attributes.normal.array, px: part.pivot[0], py: part.pivot[1], pz: part.pivot[2], level: li });
          mesh.castShadow = P.lod === 0;
          mesh.receiveShadow = P.lod === 0;
          holder.add(mesh);
          if (li === 0 && geo.boundingBox) maxY = Math.max(maxY, geo.boundingBox.max.y + part.pivot[1]);
        }
        g.add(holder);
        if (!partObjs.has(part.name)) partObjs.set(part.name, []);
        partObjs.get(part.name).push(holder);
      }
      lod.addLevel(g, P.dist);
    }
    lod.name = "landmark:" + it.L.id;
    lod.position.set(it.x, it.baseY, it.z);
    lod.rotation.y = -(it.L.heading || 0) * DEG;
    lod.userData.landmark = it.L.id;
    this.root.add(lod);
    it.group = lod;
    it.stats = { tris, trisMid, trisFar, buildMs: Math.round(performance.now() - t0), modelHeight: Math.round(maxY * 10) / 10 };
    if (typeof M.setup === "function") {
      try {
        it.anim = M.setup({ THREE, group: lod, parts: (name) => partObjs.get(name) || [], L: it.L, mats: it.mats }) || null;
      } catch (e) {
        console.warn("[landmarks] setup failed", it.L.id, e);
      }
    }
    this.damage.register(it);
    it.aoJob = occlusionJob(aoEntries); // [lm-materials] baked AO, spread over the next frames
  }

  _nightFactor() {
    const m = this.app.mats && this.app.mats.wfcBldgMat;
    const u = m && m.userData && m.userData.nightUniforms && m.userData.nightUniforms.uNightEmissive;
    if (!u) return 0;
    return THREE.MathUtils.clamp((u.value - 0.04) / 1.81, 0, 1);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const app = this.app;
    if (app.isTeleporting) return;
    const o = app.worldOrigin;
    const dem = getBeijingDemState();
    const demTag = dem ? `${dem.centerLat || 0}_${dem.centerLon || 0}_${dem.baseAslM || 0}` : "0";
    const key = o ? `${o.centerLat.toFixed(6)},${o.centerLon.toFixed(6)}|${demTag}` : "";
    if (key !== this.originKey) {
      this.originKey = key;
      this._rebuildForOrigin();
    }
    this.damage.update(dt);
    if (!this.items.length) return;
    this.time += dt;
    const cam = app.camera.position;
    this.night = this._nightFactor();
    const env = app.reflections ? app.reflections.texture : null; // [lm-materials] sky reflections on glass / metal
    let built = false;
    // [lm-materials] one landmark's occlusion bake at a time, ~2.5 ms per frame
    const job = this.items.find((i) => i.aoJob);
    if (job) {
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 2.5) if (job.aoJob.next().done) { job.aoJob = null; break; }
      } catch (e) { console.warn("[landmarks] occlusion bake failed", job.L.id, e); job.aoJob = null; }
      if (job.stats) job.stats.aoMs = Math.round((job.stats.aoMs || 0) + performance.now() - t0);
    }
    for (const it of this.items) {
      const d = Math.hypot(it.x - cam.x, it.z - cam.z);
      if (!it.group) {
        if (!built && d < SHOW_DIST) {
          built = true; // at most one build per frame
          try { this._build(it); } catch (e) { console.warn("[landmarks] build failed", it.L.id, e); it.M = { build: null }; }
        }
        continue;
      }
      it.group.visible = d < SHOW_DIST;
      if (!it.group.visible) continue;
      it.mats.glow.emissiveIntensity = this.night * it.mats.glow.userData.strength;
      it.U.uLmNight.value = this.night;
      if (env && it.mats.solid.envMap !== env) {
        for (const m of [it.mats.solid, it.mats.glow]) { if (!m.envMap) m.needsUpdate = true; m.envMap = env; }
      }
      if (it.anim && it.anim.update) it.anim.update(dt, this.time, this.night, d);
    }
    this._colTimer -= dt;
    if (this._colTimer <= 0) {
      this._colTimer = 0.25;
      this._attachColliders();
    }
    if (this.photo) this._applyPhoto();
  }

  // ---------------------------------------------------------------- debug / verification
  _applyPhoto() {
    const p = this.photo, app = this.app;
    app.camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    app.camera.lookAt(p.target[0], p.target[1], p.target[2]);
    app.camera.updateMatrixWorld();
    app.pos.set(p.pos[0], Math.max(app.pos.y, p.pos[1] - 1), p.pos[2]);
  }

  _installDebug() {
    if (typeof window === "undefined") return;
    const sys = this;
    window.__LANDMARKS__ = {
      system: sys,
      list: () => sys.items.map((it) => ({ id: it.L.id, x: Math.round(it.x), z: Math.round(it.z), baseY: +it.baseY.toFixed(1), built: !!it.group, ...(it.stats || {}) })),
      info: (id) => {
        const it = sys.items.find((i) => i.L.id === id);
        if (!it) return null;
        return { id, x: it.x, z: it.z, baseY: it.baseY, height: it.L.height, built: !!it.group, ...(it.stats || {}) };
      },
      /** Photo camera: distance d (m), azimuth az (deg, 0 = in front of the landmark), elevation el (deg). */
      view: (id, d = 300, az = 0, el = 12, lookFrac = 0.45) => {
        const it = sys.items.find((i) => i.L.id === id);
        if (!it) return false;
        const a = ((it.L.heading || 0) + az) * DEG;
        const tx = it.x, tz = it.z, ty = it.baseY + it.L.height * lookFrac;
        const px = tx + Math.sin(a) * d * Math.cos(el * DEG);
        const pz = tz - Math.cos(a) * d * Math.cos(el * DEG);
        const py = ty + Math.sin(el * DEG) * d;
        sys.photo = { pos: [px, py, pz], target: [tx, ty, tz] };
        return sys.photo;
      },
      clearView: () => { sys.photo = null; },
    };
  }
}
