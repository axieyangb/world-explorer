// [venues] Main-thread animation for theme-park rides built by venues.js (Ferris wheels, carousels,
// swing rides, spinners, drop towers, coaster trains). One shared unit geometry per ride type; rides
// farther than ANIM_DIST from the camera are hidden and not updated.

import * as THREE from '../../vendor/three.module.js';

const ANIM_DIST = 2200;

// Tiny vertex-coloured geometry builder (unit-scale parts)
class G {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, rgb) {
    this.pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) this.col.push(...rgb);
  }
  quad(a, b, c, d, rgb) { this.tri(a, b, c, rgb); this.tri(a, c, d, rgb); }
  beam(p, q, w, rgb) {
    const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d.lengthSq() < 1e-10) return;
    d.normalize();
    const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3().crossVectors(d, ref).normalize().multiplyScalar(w);
    const u = new THREE.Vector3().crossVectors(s, d).normalize().multiplyScalar(w);
    const c = (o, a, b) => [o[0] + s.x * a + u.x * b, o[1] + s.y * a + u.y * b, o[2] + s.z * a + u.z * b];
    const P = [c(p, -1, -1), c(p, 1, -1), c(p, 1, 1), c(p, -1, 1)];
    const Q = [c(q, -1, -1), c(q, 1, -1), c(q, 1, 1), c(q, -1, 1)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(P[i], P[j], Q[j], Q[i], rgb); }
  }
  box(x, y, z, hx, hy, hz, rgb) {
    const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([a, b, c]) => [x + a * hx, y + b * hy, z + c * hz]);
    for (const [a, b, c, d] of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) this.quad(v[a], v[b], v[c], v[d], rgb);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

const COLS = [[0.92, 0.18, 0.16], [0.10, 0.55, 0.90], [0.98, 0.78, 0.10], [0.20, 0.72, 0.30], [0.80, 0.25, 0.75], [0.98, 0.50, 0.10]];
const WHITE = [0.95, 0.95, 0.95];

// Wheel in the local XY plane, axle along Z, radius 1
function wheelGeom() {
  const g = new G();
  const N = 40;
  for (const z of [-0.07, 0.07]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      g.beam([Math.cos(a0), Math.sin(a0), z], [Math.cos(a1), Math.sin(a1), z], 0.012, WHITE);
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.beam([0, 0, z * 0.5], [Math.cos(a), Math.sin(a), z], 0.008, WHITE);
    }
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    g.box(Math.cos(a) * 1.02, Math.sin(a) * 1.02 - 0.05, 0, 0.045, 0.045, 0.055, COLS[i % COLS.length]);
  }
  return g.build();
}

function carouselGeom() {
  const g = new G();
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const p0 = [Math.cos(a0), 0, Math.sin(a0)], p1 = [Math.cos(a1), 0, Math.sin(a1)];
    g.tri([0, 0.06, 0], [p1[0], 0.06, p1[2]], [p0[0], 0.06, p0[2]], [0.85, 0.75, 0.55]); // floor
    g.tri([0, 0.95, 0], [p0[0] * 1.05, 0.62, p0[2] * 1.05], [p1[0] * 1.05, 0.62, p1[2] * 1.05], i % 2 ? COLS[0] : WHITE); // canopy
    g.quad([p0[0] * 1.05, 0.62, p0[2] * 1.05], [p1[0] * 1.05, 0.62, p1[2] * 1.05], [p1[0] * 1.05, 0.54, p1[2] * 1.05], [p0[0] * 1.05, 0.54, p0[2] * 1.05], COLS[2]);
  }
  g.beam([0, 0, 0], [0, 0.95, 0], 0.08, [0.9, 0.8, 0.4]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.75;
    g.beam([x, 0.06, z], [x, 0.6, z], 0.012, [0.9, 0.8, 0.4]);
    g.box(x, 0.2 + (i % 2) * 0.06, z, 0.05, 0.05, 0.05, i % 3 ? WHITE : [0.45, 0.3, 0.2]);
  }
  return g.build();
}

// Swing ride: rotating top at y=1 with seats flung outwards (scale: radius 1)
function swingGeom() {
  const g = new G();
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    g.tri([0, 1.2, 0], [Math.cos(a0) * 0.55, 1.0, Math.sin(a0) * 0.55], [Math.cos(a1) * 0.55, 1.0, Math.sin(a1) * 0.55], i % 2 ? COLS[1] : COLS[2]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const top = [c * 0.5, 1.0, s * 0.5], seat = [c * 1.0, 0.45, s * 1.0];
    g.beam(top, seat, 0.006, [0.3, 0.3, 0.3]);
    g.box(seat[0], seat[1], seat[2], 0.04, 0.02, 0.04, COLS[i % COLS.length]);
  }
  return g.build();
}

// Spinner flat ride: tilted disc of cups
function spinnerGeom() {
  const g = new G();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 0.65, z = Math.sin(a) * 0.65;
    g.beam([0, 0.25, 0], [x, 0.35, z], 0.03, [0.7, 0.7, 0.72]);
    g.box(x, 0.4, z, 0.16, 0.1, 0.16, COLS[i % COLS.length]);
  }
  g.box(0, 0.15, 0, 0.12, 0.15, 0.12, WHITE);
  return g.build();
}

function towerRingGeom() {
  const g = new G();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.box(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, 0.7, 0.8, 0.7, COLS[i % COLS.length]);
  }
  g.box(0, 0.9, 0, 2.2, 0.15, 2.2, [0.25, 0.25, 0.28]);
  return g.build();
}

function carGeom() {
  const g = new G();
  g.box(0, 0.45, 0, 0.6, 0.45, 1.15, [1, 1, 1]);
  g.box(0, 0.95, -0.7, 0.55, 0.1, 0.15, [0.15, 0.15, 0.15]);
  return g.build();
}

export class VenueRides {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'venue_rides';
    scene.add(this.root);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
    this.carMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
    this.geo = null;
    this.entries = new Map(); // chunk group -> { group, items, cx, cz }
    this.time = 0;
    this.syncT = 0;
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  _geoms() {
    if (!this.geo) this.geo = { wheel: wheelGeom(), carousel: carouselGeom(), swing: swingGeom(), spinner: spinnerGeom(), tower: towerRingGeom(), car: carGeom() };
    return this.geo;
  }

  _add(chunk, anim) {
    const G0 = this._geoms();
    const group = new THREE.Group();
    const items = [];
    let sx = 0, sz = 0;
    for (const a of anim) {
      if (a.t === 'wheel') {
        const pivot = new THREE.Object3D();
        pivot.position.set(a.x, a.y, a.z);
        pivot.rotation.y = -a.yaw + Math.PI / 2;
        const m = new THREE.Mesh(G0.wheel, this.mat);
        m.scale.setScalar(a.r);
        m.castShadow = true;
        pivot.add(m);
        group.add(pivot);
        items.push({ t: 'wheel', m, w: 0.06 + (a.r < 15 ? 0.04 : 0) });
        sx += a.x; sz += a.z;
      } else if (a.t === 'carousel' || a.t === 'swing' || a.t === 'spinner') {
        const m = new THREE.Mesh(G0[a.t], this.mat);
        m.position.set(a.x, a.y, a.z);
        m.scale.setScalar(a.r);
        if (a.t === 'swing') m.scale.set(a.r, 16, a.r);
        group.add(m);
        items.push({ t: a.t, m, w: a.t === 'carousel' ? 0.45 : a.t === 'swing' ? 1.1 : 1.6, ph: (a.x * 13.1 + a.z) % 6 });
        sx += a.x; sz += a.z;
      } else if (a.t === 'tower') {
        const m = new THREE.Mesh(G0.tower, this.mat);
        m.position.set(a.x, a.y0, a.z);
        group.add(m);
        items.push({ t: 'tower', m, y0: a.y0, y1: a.y1, ph: (a.x * 7.3 + a.z * 3.1) % 14 });
        sx += a.x; sz += a.z;
      } else if (a.t === 'coaster') {
        const p = a.pts, n = p.length / 3;
        const cum = new Float32Array(n + 1);
        let maxY = -Infinity;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          cum[i + 1] = cum[i] + Math.hypot(p[j * 3] - p[i * 3], p[j * 3 + 1] - p[i * 3 + 1], p[j * 3 + 2] - p[i * 3 + 2]);
          maxY = Math.max(maxY, p[i * 3 + 1]);
        }
        const im = new THREE.InstancedMesh(G0.car, this.carMat, a.cars);
        this._c.setRGB(a.col[0], a.col[1], a.col[2]);
        for (let i = 0; i < a.cars; i++) im.setColorAt(i, this._c);
        im.frustumCulled = false;
        group.add(im);
        items.push({ t: 'coaster', im, p, n, cum, len: cum[n], maxY, s: 0, cars: a.cars });
        sx += a.cx; sz += a.cz;
      }
    }
    if (!items.length) return;
    this.root.add(group);
    this.entries.set(chunk, { group, items, cx: sx / items.length, cz: sz / items.length });
  }

  _sample(it, s, out) {
    const L = it.len;
    s = ((s % L) + L) % L;
    let lo = 0, hi = it.n;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (it.cum[mid] <= s) lo = mid; else hi = mid; }
    const i = lo, j = (lo + 1) % it.n, f = (s - it.cum[i]) / Math.max(1e-6, it.cum[i + 1] - it.cum[i]);
    const p = it.p;
    out.set(p[i * 3] + (p[j * 3] - p[i * 3]) * f, p[i * 3 + 1] + (p[j * 3 + 1] - p[i * 3 + 1]) * f, p[i * 3 + 2] + (p[j * 3 + 2] - p[i * 3 + 2]) * f);
    return out;
  }

  update(dt, camera, loadedChunks) {
    this.time += dt;
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 0.5;
      const live = new Set(loadedChunks.values());
      for (const [chunk, e] of this.entries) {
        if (!live.has(chunk)) { this.root.remove(e.group); this.entries.delete(chunk); }
      }
      for (const chunk of live) {
        const v = chunk.userData && chunk.userData.venues;
        if (v && v.anim && !this.entries.has(chunk)) this._add(chunk, v.anim);
      }
    }
    if (!this.entries.size) return;
    const cp = camera.position, t = this.time;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const e of this.entries.values()) {
      const vis = Math.hypot(e.cx - cp.x, e.cz - cp.z) < ANIM_DIST;
      e.group.visible = vis;
      if (!vis) continue;
      for (const it of e.items) {
        if (it.t === 'wheel') it.m.rotation.z = -t * it.w;
        else if (it.t === 'carousel' || it.t === 'swing' || it.t === 'spinner') {
          it.m.rotation.y = t * it.w + it.ph;
          if (it.t === 'spinner') it.m.rotation.x = 0.18 * Math.sin(t * 0.7 + it.ph);
        } else if (it.t === 'tower') {
          const c = (t + it.ph) % 14;
          let f;
          if (c < 6) f = c / 6; // slow lift
          else if (c < 8) f = 1; // hold at the top
          else if (c < 9.3) { const u = (c - 8) / 1.3; f = 1 - u * u; } // free fall
          else f = 0;
          it.m.position.y = it.y0 + (it.y1 - it.y0) * f;
        } else if (it.t === 'coaster') {
          // speed from height (energy) with a slow chain lift on the first rise
          this._sample(it, it.s, a);
          const v = Math.max(4, Math.sqrt(Math.max(0, 2 * 9.8 * (it.maxY - a.y))) * 0.9 + 3);
          it.s = (it.s + v * dt) % it.len;
          for (let k = 0; k < it.cars; k++) {
            const s = it.s - k * 2.8;
            this._sample(it, s, a);
            this._sample(it, s + 1.2, b);
            this._o.position.copy(a);
            this._o.lookAt(b);
            this._o.updateMatrix();
            it.im.setMatrixAt(k, this._o.matrix);
          }
          it.im.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }
}
