// Places feature (main thread): renders the per-chunk `places` payload produced in the chunk worker
// (see places_worker.js) with a fixed set of distance-culled InstancedMesh pools (~13 draw calls total),
// in-world POI name labels (max 8, fade in near the camera), moving trains on rail lines and blinking
// aviation beacons at night.
//
// Hooked from src/main.js: `this.places = new PlacesSystem(this.scene)` + `this.places.update(...)` per frame.

import * as THREE from '../../vendor/three.module.js';
import { getLang } from '../i18n.js';
import { isNight } from './daylight.js';

const STRIDE = 8;
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const E = new THREE.Euler();

function mat(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), Q.clone(), new THREE.Vector3(sx, sy, sz));
}

function mergeParts(parts) {
  const pos = [];
  const nrm = [];
  const col = [];
  for (const [geom, rgb, m] of parts) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) {
      pos.push(p[i]);
      nrm.push(n[i]);
    }
    for (let i = 0; i < p.length / 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
    g.dispose();
    geom.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);

function buildUnitGeometries() {
  const G = {};
  // Rooftop HVAC unit: unit box with dark fan disc on top
  G.hvac = mergeParts([
    [box(1, 1, 1), [0.86, 0.87, 0.88], mat(0, 0.5, 0)],
    [cyl(0.3, 0.3, 0.06, 12), [0.22, 0.23, 0.25], mat(0, 1.02, 0)],
    [box(1.01, 0.08, 1.01), [0.66, 0.67, 0.69], mat(0, 0.18, 0)],
  ]);
  G.vent = mergeParts([
    [cyl(0.5, 0.5, 1, 8), [0.48, 0.5, 0.52], mat(0, 0.5, 0)],
    [cyl(0.62, 0.62, 0.1, 8), [0.32, 0.33, 0.35], mat(0, 1.0, 0)],
  ]);
  // Wooden water tank on steel legs (tinted per instance)
  const tankParts = [];
  for (const [lx, lz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
    tankParts.push([box(0.06, 0.3, 0.06), [0.32, 0.32, 0.34], mat(lx, 0.15, lz)]);
  }
  tankParts.push([cyl(0.56, 0.56, 0.03, 12), [0.4, 0.38, 0.36], mat(0, 0.31, 0)]);
  tankParts.push([cyl(0.5, 0.5, 0.52, 14), [1, 1, 1], mat(0, 0.58, 0)]);
  for (const hy of [0.42, 0.58, 0.74]) tankParts.push([cyl(0.505, 0.505, 0.015, 14), [0.3, 0.28, 0.27], mat(0, hy, 0)]);
  tankParts.push([cone(0.54, 0.18, 14), [0.45, 0.4, 0.36], mat(0, 0.93, 0)]);
  G.tank = mergeParts(tankParts);
  // Antenna mast: unit height (scaled by sy), fixed radius
  G.mast = mergeParts([
    [cyl(0.07, 0.22, 1, 8), [0.8, 0.8, 0.82], mat(0, 0.5, 0)],
    [box(1.6, 0.008, 0.08), [0.7, 0.7, 0.72], mat(0, 0.35, 0)],
    [box(0.08, 0.008, 1.6), [0.7, 0.7, 0.72], mat(0, 0.62, 0)],
    [cyl(0.075, 0.075, 0.06, 8), [0.85, 0.2, 0.18], mat(0, 0.86, 0)],
  ]);
  G.solar = mergeParts([
    [box(1, 0.05, 1), [0.12, 0.17, 0.3], mat(0, 0.55, 0, -0.42, 0, 0)],
    [box(0.04, 0.5, 0.04), [0.55, 0.56, 0.58], mat(-0.45, 0.25, -0.3)],
    [box(0.04, 0.5, 0.04), [0.55, 0.56, 0.58], mat(0.45, 0.25, -0.3)],
  ]);
  const gardenParts = [
    [box(1, 0.3, 1), [0.42, 0.36, 0.3], mat(0, 0.15, 0)],
    [box(0.94, 0.05, 0.94), [0.33, 0.55, 0.26], mat(0, 0.32, 0)],
  ];
  const shrubs = [[-0.3, -0.25, 0.5], [0.28, -0.3, 0.7], [0.05, 0.1, 0.45], [-0.25, 0.3, 0.6], [0.32, 0.28, 0.4], [-0.05, -0.36, 0.35]];
  for (const [sx, sz, h] of shrubs) gardenParts.push([box(0.14, h, 0.14), [0.2, 0.42, 0.2], mat(sx, 0.34 + h / 2, sz)]);
  G.garden = mergeParts(gardenParts);

  // Striped storefront awning: local X along the wall, +Z out of the wall, y 0..1
  {
    const pos = [];
    const col = [];
    const strips = 6;
    for (let i = 0; i < strips; i++) {
      const x0 = -0.5 + i / strips, x1 = -0.5 + (i + 1) / strips;
      const c = i % 2 === 0 ? [1, 1, 1] : [0.8, 0.8, 0.8];
      const quad = (a, b, cc, d) => {
        pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
        for (let k = 0; k < 6; k++) col.push(...c);
      };
      quad([x0, 1, 0], [x0, 0.28, 1], [x1, 0.28, 1], [x1, 1, 0]);
      quad([x0, 0.28, 1], [x0, 0.0, 1], [x1, 0.0, 1], [x1, 0.28, 1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    G.awning = g;
  }
  G.sign = mergeParts([
    [box(1, 1, 1), [1, 1, 1], mat(0, 0.5, 0.5)],
    [box(1.04, 0.08, 1.04), [0.35, 0.35, 0.36], mat(0, 0.02, 0.5)],
  ]);
  // Transit entrance totem (real size), tinted per line color
  G.transit = mergeParts([
    [cyl(0.07, 0.07, 2.8, 8), [0.55, 0.55, 0.55], mat(0, 1.4, 0)],
    [box(0.8, 0.8, 0.16), [1, 1, 1], mat(0, 3.1, 0)],
    [box(0.5, 0.12, 0.18), [1.8, 1.8, 1.8], mat(0, 3.1, 0)],
    [box(0.5, 0.1, 0.5), [0.5, 0.5, 0.5], mat(0, 0.05, 0)],
  ]);
  // Narrow-body airliner (nose +Z), real size ~38 m
  const white = [0.95, 0.95, 0.96];
  const grey = [0.7, 0.72, 0.75];
  const dark = [0.14, 0.15, 0.17];
  G.plane = mergeParts([
    [cyl(2, 2, 30, 14), white, mat(0, 3.2, 0, Math.PI / 2, 0, 0)],
    [cone(2, 5, 14), white, mat(0, 3.2, 17.5, Math.PI / 2, 0, 0)],
    [cone(2, 6.5, 14), white, mat(0, 3.5, -18.2, -Math.PI / 2, 0, 0)],
    [box(34, 0.4, 5.5), grey, mat(0, 2.3, 0.5)],
    [box(12, 0.3, 3), grey, mat(0, 4.0, -17.5)],
    [cyl(0.95, 0.95, 3.6, 10), grey, mat(6, 1.4, 2.6, Math.PI / 2, 0, 0)],
    [cyl(0.95, 0.95, 3.6, 10), grey, mat(-6, 1.4, 2.6, Math.PI / 2, 0, 0)],
    [box(2.4, 0.5, 1.0), dark, mat(0, 4.3, 15.4)],
    [box(0.3, 1.3, 0.3), dark, mat(0, 0.65, 13)],
    [box(2.6, 1.0, 0.6), dark, mat(0, 0.5, -1)],
  ]);
  G.planeTail = mergeParts([[box(0.45, 6.5, 5), [1, 1, 1], mat(0, 8.0, -17.2)]]);
  // Cargo ship (bow +Z), 120 m; small vessels reuse it scaled down
  {
    const shape = new THREE.Shape();
    shape.moveTo(-9, 60);
    shape.lineTo(9, 60);
    shape.lineTo(9, -38);
    shape.lineTo(0, -60);
    shape.lineTo(-9, -38);
    shape.lineTo(-9, 60);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -4, 0);
    const parts = [[hull, [0.17, 0.21, 0.3], null]];
    parts.push([box(18.3, 1.0, 97), [0.62, 0.16, 0.14], mat(0, -0.2, -11)]);
    parts.push([box(17.4, 0.3, 95), [0.36, 0.38, 0.36], mat(0, 6.05, -10)]);
    const cont = [[0.75, 0.25, 0.18], [0.18, 0.4, 0.62], [0.85, 0.65, 0.2], [0.3, 0.55, 0.35], [0.62, 0.62, 0.64]];
    for (let i = 0; i < 6; i++) {
      const h = 3 + ((i * 7) % 5);
      parts.push([box(15, h, 9.5), cont[i % cont.length], mat(0, 6 + h / 2, 28 - i * 11)]);
    }
    parts.push([box(16, 14, 10), [0.94, 0.94, 0.92], mat(0, 13, -45)]);
    parts.push([box(20, 1.6, 4), [0.9, 0.9, 0.88], mat(0, 19.2, -42)]);
    parts.push([box(16.2, 1.0, 10.2), [0.2, 0.24, 0.3], mat(0, 18, -45)]);
    parts.push([box(3.2, 5, 3.2), [0.7, 0.2, 0.16], mat(0, 22.5, -51)]);
    G.ship = mergeParts(parts);
  }
  G.trainCar = mergeParts([
    [box(3, 3.3, 20), [0.93, 0.93, 0.91], mat(0, 2.75, 0)],
    [box(3.04, 0.9, 18.4), [0.16, 0.19, 0.24], mat(0, 3.1, 0)],
    [box(3.05, 0.28, 19.8), [0.85, 0.3, 0.2], mat(0, 2.15, 0)],
    [box(2.5, 0.3, 19), [0.62, 0.63, 0.65], mat(0, 4.55, 0)],
    [box(2.4, 0.9, 3), [0.18, 0.18, 0.2], mat(0, 0.75, 6.5)],
    [box(2.4, 0.9, 3), [0.18, 0.18, 0.2], mat(0, 0.75, -6.5)],
  ]);
  return G;
}

// kind -> [capacity, cull radius (m), material key, castShadow]
const KINDS = {
  hvac: [8000, 800, 'std', false],
  vent: [6000, 600, 'std', false],
  tank: [1500, 900, 'std', true],
  mast: [800, 1800, 'std', false],
  solar: [2000, 700, 'std', false],
  garden: [300, 800, 'std', false],
  awning: [3000, 420, 'double', false],
  sign: [3000, 420, 'sign', false],
  transit: [600, 600, 'std', false],
  plane: [160, 3000, 'std', true],
  planeTail: [160, 3000, 'std', true],
  ship: [80, 3000, 'std', true],
};

const LABEL_MAX = 8;
const LABEL_FAR = 80;
const LABEL_NEAR = 55;

export class PlacesSystem {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'places';
    scene.add(this.root);
    this.geoms = buildUnitGeometries();
    this.mats = {
      std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 }),
      double: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
      sign: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, emissive: 0xfff1d8, emissiveIntensity: 0 }),
    };
    this.pools = {};
    for (const [kind, [cap, , mk, cast]] of Object.entries(KINDS)) {
      this.pools[kind] = this._makePool(kind, cap, this.mats[mk], cast);
    }
    this.trainPool = this._makePool('trainCar', 48, this.mats.std, true);
    this.trainPool.frustumCulled = false;

    // Aviation beacons: screen-space points so they read at distance; only shown at night
    this.beaconGeom = new THREE.BufferGeometry();
    this.beaconGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 4000), 3));
    this.beaconGeom.setDrawRange(0, 0);
    this.beacons = new THREE.Points(
      this.beaconGeom,
      new THREE.PointsMaterial({ color: 0xff2a1a, size: 5, sizeAttenuation: false, fog: false })
    );
    this.beacons.frustumCulled = false;
    this.beacons.visible = false;
    this.root.add(this.beacons);
    this.beaconOn = new THREE.Color(0xff2a1a);
    this.beaconOff = new THREE.Color(0x3a0b07);

    this.trackedGroups = new Set();
    this.lastX = Infinity;
    this.lastZ = Infinity;
    this.trains = [];
    this.time = 0;
    this.labelTimer = 0;
    this.labelSprites = [];
    this.labelTex = new Map();
    for (let i = 0; i < LABEL_MAX; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0, fog: false }));
      sp.visible = false;
      sp.renderOrder = 10;
      sp.userData = { key: '', target: 0, opacity: 0 };
      this.root.add(sp);
      this.labelSprites.push(sp);
    }
    this.lastNight = null;
  }

  _makePool(kind, cap, material, cast) {
    const mesh = new THREE.InstancedMesh(this.geoms[kind], material, cap);
    mesh.name = `places_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Total instances currently drawn (debug/perf). */
  stats() {
    const out = { drawCallsMax: 0 };
    for (const [k, m] of Object.entries(this.pools)) {
      out[k] = m.count;
      if (m.count > 0) out.drawCallsMax++;
    }
    out.trainCars = this.trainPool.count;
    out.beacons = this.beaconGeom.drawRange.count;
    out.labels = this.labelSprites.filter((s) => s.visible).length;
    return out;
  }

  update(dt, camera, playerPos, loadedChunks) {
    this.time += dt;
    let dirty = loadedChunks.size !== this.trackedGroups.size;
    if (!dirty) {
      for (const g of loadedChunks.values()) {
        if (!this.trackedGroups.has(g)) { dirty = true; break; }
      }
    }
    const camPos = camera.position;
    const px = camPos.x, pz = camPos.z;
    if (dirty) {
      this.trackedGroups = new Set(loadedChunks.values());
      this._refreshTrains(playerPos);
    }
    if (dirty || Math.hypot(px - this.lastX, pz - this.lastZ) > 40) {
      this.lastX = px;
      this.lastZ = pz;
      this._rebuild(px, pz);
    }
    this._updateTrains(dt);
    this._updateNight();
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      this._pickLabels(camPos);
    }
    this._fadeLabels(dt, camPos);
  }

  _rebuild(px, pz) {
    const counts = {};
    for (const k of Object.keys(this.pools)) counts[k] = 0;
    let nBeacon = 0;
    const bArr = this.beaconGeom.attributes.position.array;
    const bCap = bArr.length / 3;
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl) continue;
      const { ox, oz } = g.userData;
      const cdx = Math.max(0, Math.abs(px - ox) - 500);
      const cdz = Math.max(0, Math.abs(pz - oz) - 500);
      const chunkDist = Math.hypot(cdx, cdz);
      for (const kind in pl.inst) {
        const pool = this.pools[kind];
        if (!pool) continue;
        const r = KINDS[kind][1];
        if (chunkDist > r) continue;
        const r2 = r * r;
        const a = pl.inst[kind];
        const cap = KINDS[kind][0];
        const mArr = pool.instanceMatrix.array;
        const cArr = pool.instanceColor.array;
        let n = counts[kind];
        for (let i = 0; i < a.length && n < cap; i += STRIDE) {
          const dx = a[i] - px, dz = a[i + 2] - pz;
          if (dx * dx + dz * dz > r2) continue;
          const c = Math.cos(a[i + 3]), s = Math.sin(a[i + 3]);
          const sx = a[i + 4], sy = a[i + 5], sz = a[i + 6];
          const o = n * 16;
          // Column-major TRS with rotation about Y
          mArr[o] = c * sx; mArr[o + 1] = 0; mArr[o + 2] = -s * sx; mArr[o + 3] = 0;
          mArr[o + 4] = 0; mArr[o + 5] = sy; mArr[o + 6] = 0; mArr[o + 7] = 0;
          mArr[o + 8] = s * sz; mArr[o + 9] = 0; mArr[o + 10] = c * sz; mArr[o + 11] = 0;
          mArr[o + 12] = a[i]; mArr[o + 13] = a[i + 1]; mArr[o + 14] = a[i + 2]; mArr[o + 15] = 1;
          const rgb = a[i + 7] | 0;
          cArr[n * 3] = ((rgb >> 16) & 255) / 255;
          cArr[n * 3 + 1] = ((rgb >> 8) & 255) / 255;
          cArr[n * 3 + 2] = (rgb & 255) / 255;
          n++;
        }
        counts[kind] = n;
      }
      if (pl.beacons && chunkDist < 3000) {
        const b = pl.beacons;
        for (let i = 0; i < b.length && nBeacon < bCap; i += 3) {
          bArr[nBeacon * 3] = b[i];
          bArr[nBeacon * 3 + 1] = b[i + 1];
          bArr[nBeacon * 3 + 2] = b[i + 2];
          nBeacon++;
        }
      }
    }
    for (const [k, pool] of Object.entries(this.pools)) {
      pool.count = counts[k];
      pool.instanceMatrix.needsUpdate = true;
      pool.instanceColor.needsUpdate = true;
    }
    this.beaconGeom.setDrawRange(0, nBeacon);
    this.beaconGeom.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ trains
  _refreshTrains(playerPos) {
    const lines = new Map();
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.rails) continue;
      for (const arr of pl.rails) {
        const n = arr.length / 3;
        const key = `${Math.round(arr[0])},${Math.round(arr[2])},${Math.round(arr[(n - 1) * 3])},${Math.round(arr[(n - 1) * 3 + 2])}`;
        if (lines.has(key)) continue;
        let best = Infinity;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(arr[i * 3] - playerPos.x, arr[i * 3 + 2] - playerPos.z);
          if (d < best) best = d;
        }
        lines.set(key, { key, arr, dist: best });
      }
    }
    const kept = this.trains.filter((t) => lines.has(t.key));
    const used = new Set(kept.map((t) => t.key));
    const cands = [...lines.values()].filter((l) => !used.has(l.key) && l.dist < 1500).sort((a, b) => a.dist - b.dist);
    for (const c of cands) {
      if (kept.length >= 3) break;
      const cum = [0];
      const arr = c.arr;
      for (let i = 1; i < arr.length / 3; i++) {
        cum.push(cum[i - 1] + Math.hypot(arr[i * 3] - arr[i * 3 - 3], arr[i * 3 + 2] - arr[i * 3 - 1]));
      }
      const L = cum[cum.length - 1];
      let h = 0;
      for (let i = 0; i < c.key.length; i++) h = (h * 31 + c.key.charCodeAt(i)) >>> 0;
      const cars = 4 + (h % 4);
      const trainLen = cars * 21;
      if (L < trainLen + 60) continue;
      kept.push({
        key: c.key, arr, cum, L, cars,
        s: trainLen + ((h >>> 3) % 1000) / 1000 * (L - trainLen),
        dir: h & 1 ? 1 : -1,
        speed: 14 + (h % 9),
        tint: [[1, 1, 1], [0.85, 0.92, 1.0], [1.0, 0.95, 0.85]][h % 3],
      });
    }
    this.trains = kept;
  }

  _sampleRail(t, s, outPos) {
    const { arr, cum } = t;
    s = Math.max(0, Math.min(t.L, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const segL = cum[hi] - cum[lo] || 1;
    const f = (s - cum[lo]) / segL;
    const ax = arr[lo * 3], ay = arr[lo * 3 + 1], az = arr[lo * 3 + 2];
    const bx = arr[hi * 3], by = arr[hi * 3 + 1], bz = arr[hi * 3 + 2];
    outPos.set(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
    return Math.atan2(bx - ax, bz - az);
  }

  _updateTrains(dt) {
    const pool = this.trainPool;
    let n = 0;
    for (const t of this.trains) {
      const trainLen = t.cars * 21;
      t.s += t.dir * t.speed * dt;
      if (t.dir > 0 && t.s >= t.L) { t.s = t.L - trainLen; t.dir = -1; }
      else if (t.dir < 0 && t.s <= 0) { t.s = trainLen; t.dir = 1; }
      for (let i = 0; i < t.cars && n < 48; i++) {
        const sc = t.s - t.dir * (i * 21 + 10.5);
        const yaw = this._sampleRail(t, sc, V);
        Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        S.set(1, 1, 1);
        M4.compose(V, Q, S);
        pool.setMatrixAt(n, M4);
        pool.instanceColor.setXYZ(n, t.tint[0], t.tint[1], t.tint[2]);
        n++;
      }
    }
    pool.count = n;
    pool.instanceMatrix.needsUpdate = true;
    if (pool.instanceColor) pool.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ night: beacons + sign glow
  _updateNight() {
    const night = isNight();
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.mats.sign.emissiveIntensity = night ? 0.55 : 0.0;
    }
    // Red obstruction lights: ~40 flashes/min
    this.beacons.visible = night;
    if (night) this.beacons.material.color.copy(this.time % 1.5 < 0.7 ? this.beaconOn : this.beaconOff);
  }

  // ------------------------------------------------------------------ labels
  _labelTexture(text) {
    let e = this.labelTex.get(text);
    if (e) {
      this.labelTex.delete(text);
      this.labelTex.set(text, e);
      return e;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = '500 28px -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "Noto Sans", sans-serif';
    ctx.font = font;
    const w = Math.min(512, Math.ceil(ctx.measureText(text).width) + 28);
    canvas.width = w;
    canvas.height = 44;
    ctx.font = font;
    ctx.fillStyle = 'rgba(18, 20, 24, 0.55)';
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, 44, r);
    ctx.arcTo(w, 44, 0, 44, r);
    ctx.arcTo(0, 44, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, 23, w - 20);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    e = { tex, aspect: w / 44 };
    this.labelTex.set(text, e);
    while (this.labelTex.size > 48) {
      const [oldKey, old] = this.labelTex.entries().next().value;
      if (this.labelSprites.some((sp) => sp.userData.key === oldKey)) break;
      old.tex.dispose();
      this.labelTex.delete(oldKey);
    }
    return e;
  }

  _pickLabels(camPos) {
    const zh = getLang() === 'zh';
    const cands = [];
    const far2 = LABEL_FAR * LABEL_FAR;
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.labels) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(camPos.x - ox) > 500 + LABEL_FAR || Math.abs(camPos.z - oz) > 500 + LABEL_FAR) continue;
      for (const L of pl.labels) {
        const dx = L[0] - camPos.x, dy = L[1] - camPos.y, dz = L[2] - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > far2) continue;
        cands.push({ L, d: Math.sqrt(d2) - L[5] * 8 });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= LABEL_MAX) break;
      const text = zh ? c.L[3] : c.L[4] || c.L[3];
      if (!text) continue;
      if (chosen.some((o) => o.text === text && Math.hypot(o.L[0] - c.L[0], o.L[2] - c.L[2]) < 60)) continue;
      chosen.push({ L: c.L, text });
    }
    const wanted = new Map(chosen.map((c) => [`${c.text}@${Math.round(c.L[0])},${Math.round(c.L[2])}`, c]));
    // Keep sprites already showing a wanted label; fade out the rest
    for (const sp of this.labelSprites) {
      if (wanted.has(sp.userData.key)) {
        sp.userData.target = 1;
        wanted.delete(sp.userData.key);
      } else {
        sp.userData.target = 0;
      }
    }
    for (const [key, c] of wanted) {
      const sp = this.labelSprites.find((s) => s.userData.target === 0 && s.userData.opacity < 0.02);
      if (!sp) break;
      const e = this._labelTexture(c.text);
      sp.material.map = e.tex;
      sp.material.needsUpdate = true;
      sp.userData.key = key;
      sp.userData.aspect = e.aspect;
      sp.userData.target = 1;
      sp.position.set(c.L[0], c.L[1], c.L[2]);
      sp.visible = true;
    }
  }

  _fadeLabels(dt, camPos) {
    for (const sp of this.labelSprites) {
      const u = sp.userData;
      if (!sp.visible) continue;
      const d = sp.position.distanceTo(camPos);
      const distFade = Math.max(0, Math.min(1, (LABEL_FAR - d) / (LABEL_FAR - LABEL_NEAR)));
      const goal = u.target * distFade;
      u.opacity += (goal - u.opacity) * Math.min(1, dt * 4);
      sp.material.opacity = u.opacity;
      const h = 0.5 + d * 0.009;
      sp.scale.set(h * (u.aspect || 4), h, 1);
      if (u.target === 0 && u.opacity < 0.02) {
        sp.visible = false;
        u.key = '';
        u.opacity = 0;
      }
    }
  }
}
