// [venues] Main-thread animation for theme-park rides built by venues.js (Ferris wheels, carousels,
// swing rides, spinners, drop towers, coaster trains). One shared unit geometry per ride type; rides
// farther than ANIM_DIST from the camera are hidden and not updated.

import * as THREE from "../../vendor/three.module.js";

const ANIM_DIST = 2200;

const _m4 = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Vertex-coloured geometry builder with smooth-normal primitive merging.
 * CRITICAL Smooth-Normal Rule: curved primitives (CylinderGeometry, SphereGeometry, ConeGeometry,
 * TorusGeometry) have computeVertexNormals() called BEFORE .toNonIndexed() so their smooth vertex
 * normals are preserved when transformed into the merged buffer.
 */
class G {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }
  _v(x, y, z, nx, ny, nz, rgb) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  tri(a, b, c, rgb) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this._v(a[0], a[1], a[2], nx, ny, nz, rgb);
    this._v(b[0], b[1], b[2], nx, ny, nz, rgb);
    this._v(c[0], c[1], c[2], nx, ny, nz, rgb);
  }
  /** Triangle with explicit smooth vertex normals. */
  triN(a, b, c, na, nb, nc, rgb) {
    this._v(a[0], a[1], a[2], na[0], na[1], na[2], rgb);
    this._v(b[0], b[1], b[2], nb[0], nb[1], nb[2], rgb);
    this._v(c[0], c[1], c[2], nc[0], nc[1], nc[2], rgb);
  }
  quad(a, b, c, d, rgb) {
    this.tri(a, b, c, rgb);
    this.tri(a, c, d, rgb);
  }
  /** Merge a Three.js BufferGeometry with smooth normals preserved BEFORE .toNonIndexed(). */
  addGeom(geom, m, rgb) {
    if (!geom.attributes.normal) geom.computeVertexNormals();
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    _nm.getNormalMatrix(m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
      nv.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(_nm).normalize();
      this._v(v.x, v.y, v.z, nv.x, nv.y, nv.z, rgb);
    }
    g.dispose();
  }
  cyl(rt, rb, h, seg, x, y, z, rgb, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const geom = new THREE.CylinderGeometry(rt, rb, h, seg);
    geom.computeVertexNormals();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addGeom(geom, _m4, rgb);
    geom.dispose();
  }
  sphere(r, ws, hs, x, y, z, rgb, sx = 1, sy = 1, sz = 1) {
    const geom = new THREE.SphereGeometry(r, ws, hs);
    geom.computeVertexNormals();
    _q.identity();
    _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addGeom(geom, _m4, rgb);
    geom.dispose();
  }
  torus(r, tubeR, rs, ts, x, y, z, rgb, rx = 0, ry = 0, rz = 0) {
    const geom = new THREE.TorusGeometry(r, tubeR, rs, ts);
    geom.computeVertexNormals();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m4.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
    this.addGeom(geom, _m4, rgb);
    geom.dispose();
  }
  rod(p, q, r, rgb, seg = 6) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    const geom = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    geom.computeVertexNormals();
    _v.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(_up, _v);
    _m4.compose(_v.set((p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5, (p[2] + q[2]) * 0.5), _q, _s.set(1, 1, 1));
    this.addGeom(geom, _m4, rgb);
    geom.dispose();
  }
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
    const v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(
      ([a, b, c]) => [x + a * hx, y + b * hy, z + c * hz],
    );
    for (const [a, b, c, d] of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) {
      this.quad(v[a], v[b], v[c], v[d], rgb);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const COLS = [
  [0.92, 0.18, 0.16],
  [0.10, 0.55, 0.90],
  [0.98, 0.78, 0.10],
  [0.20, 0.72, 0.30],
  [0.80, 0.25, 0.75],
  [0.98, 0.50, 0.10],
];
const WHITE = [0.95, 0.96, 0.97];
const GOLD = [0.92, 0.76, 0.26];
const BRASS = [0.85, 0.68, 0.24];
const STEEL = [0.76, 0.78, 0.82];
const DARK = [0.16, 0.17, 0.20];
const GLASS = [0.14, 0.20, 0.28];
const CREAM = [0.96, 0.92, 0.82];

/**
 * Ferris Wheel in the local XY plane, axle along Z, unit radius 1.
 * Features twin concentric lattice truss rims with X-bracing, central machined hub,
 * 20 spoked trusses with light rings, and 20 panoramic passenger gondolas.
 */
function wheelGeom() {
  const g = new G();
  const N = 40;
  const rOuter = 1.0, rInner = 0.89;
  // Machined central hub cylinder & end caps
  g.cyl(0.085, 0.085, 0.22, 16, 0, 0, 0, STEEL, Math.PI / 2, 0, 0);
  g.cyl(0.11, 0.11, 0.04, 16, 0, 0, -0.09, GOLD, Math.PI / 2, 0, 0);
  g.cyl(0.11, 0.11, 0.04, 16, 0, 0, 0.09, GOLD, Math.PI / 2, 0, 0);

  for (const z of [-0.075, 0.075]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // Outer & inner concentric chords
      g.rod([c0 * rOuter, s0 * rOuter, z], [c1 * rOuter, s1 * rOuter, z], 0.011, WHITE, 6);
      g.rod([c0 * rInner, s0 * rInner, z], [c1 * rInner, s1 * rInner, z], 0.008, WHITE, 6);
      // Warren truss radial & diagonal web members between inner and outer rims
      g.rod([c0 * rInner, s0 * rInner, z], [c0 * rOuter, s0 * rOuter, z], 0.006, STEEL, 5);
      g.rod([c0 * rInner, s0 * rInner, z], [c1 * rOuter, s1 * rOuter, z], 0.005, STEEL, 5);
      // Inner star-frame ring at r = 0.28
      g.rod([c0 * 0.28, s0 * 0.28, z * 0.7], [c1 * 0.28, s1 * 0.28, z * 0.7], 0.006, GOLD, 5);
    }
    // 20 primary radial spokes + festoon light ring at r = 0.60
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, aNext = ((i + 1) / 20) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.rod([0, 0, z * 0.55], [ca * rOuter, sa * rOuter, z], 0.007, WHITE, 6);
      g.rod([ca * 0.60, sa * 0.60, z], [Math.cos(aNext) * 0.60, Math.sin(aNext) * 0.60, z], 0.005, COLS[i % COLS.length], 5);
    }
  }

  // Lateral cross-ties & X-bracing between -z and +z rim trusses, plus 20 panoramic gondolas
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = ca * rOuter, py = sa * rOuter;
    const ix = ca * rInner, iy = sa * rInner;
    // Cross-axle pin and inner strut
    g.rod([px, py, -0.08], [px, py, 0.08], 0.008, STEEL, 6);
    g.rod([ix, iy, -0.075], [ix, iy, 0.075], 0.006, STEEL, 5);

    // Panoramic passenger gondola capsule suspended from the rim pin
    const col = COLS[i % COLS.length];
    const gx = ca * 1.015, gy = sa * 1.015 - 0.058;
    // Suspension hanger yoke arms from rim pin (px, py) to gondola roof
    for (const sz of [-0.052, 0.052]) {
      g.rod([px, py, sz * 1.3], [gx, gy + 0.038, sz], 0.0045, STEEL, 5);
    }
    // Rounded gondola roof dome (white/gold)
    g.cyl(0.032, 0.048, 0.018, 12, gx, gy + 0.034, 0, WHITE, 0, 0, 0, 1, 1, 1.25);
    // Panoramic dark-glass observation cabin + 6 window mullions
    g.cyl(0.046, 0.046, 0.038, 12, gx, gy + 0.006, 0, GLASS, 0, 0, 0, 1, 1, 1.25);
    for (let m = 0; m < 6; m++) {
      const ma = (m / 6) * Math.PI * 2;
      const mx = gx + Math.cos(ma) * 0.046, mz = Math.sin(ma) * 0.057;
      g.rod([mx, gy - 0.013, mz], [mx, gy + 0.025, mz], 0.003, WHITE, 4);
    }
    // Coloured lower fiberglass tub & rounded base
    g.cyl(0.047, 0.036, 0.030, 12, gx, gy - 0.028, 0, col, 0, 0, 0, 1, 1, 1.25);
    g.cyl(0.048, 0.048, 0.007, 12, gx, gy - 0.013, 0, GOLD, 0, 0, 0, 1, 1, 1.25);
  }
  return g.build();
}

/**
 * Grand Carousel (unit radius 1, scaled by a.r = 8m):
 * Ornate scalloped 16-segment crown canopy, clerestory lantern tier, golden finial spire,
 * fluted golden center column, and two concentric rings of sculpted prancing horses on brass poles!
 */
function carouselGeom() {
  const g = new G();
  const N = 16;
  // Stepped wooden parquet platform deck & gold rim molding
  g.cyl(1.02, 1.04, 0.06, 24, 0, 0.03, 0, [0.78, 0.62, 0.40]);
  g.cyl(0.98, 0.98, 0.02, 24, 0, 0.065, 0, [0.86, 0.74, 0.52]);
  g.torus(1.02, 0.018, 6, 24, 0, 0.05, 0, GOLD, Math.PI / 2, 0, 0);

  // Ornate central column with gold moldings & faceted mirror panels
  g.cyl(0.14, 0.18, 0.58, 16, 0, 0.34, 0, CREAM);
  g.cyl(0.17, 0.17, 0.04, 16, 0, 0.10, 0, GOLD);
  g.cyl(0.16, 0.16, 0.04, 16, 0, 0.35, 0, GOLD);
  g.cyl(0.18, 0.14, 0.06, 16, 0, 0.59, 0, GOLD);

  // Canopy tent roof (smooth normals across each panel) + scalloped valance border + lantern clerestory
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) * 0.5;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), cm = Math.cos(am), sm = Math.sin(am);
    const panelCol = i % 2 === 0 ? COLS[0] : CREAM;
    // Lower canopy skirt (r = 1.06 at y = 0.62 up to r = 0.42 at y = 0.84)
    const p0 = [c0 * 1.06, 0.62, s0 * 1.06], p1 = [c1 * 1.06, 0.62, s1 * 1.06];
    const q0 = [c0 * 0.42, 0.84, s0 * 0.42], q1 = [c1 * 0.42, 0.84, s1 * 0.42];
    const n0 = [c0 * 0.35, 0.94, s0 * 0.35], n1 = [c1 * 0.35, 0.94, s1 * 0.35];
    g.triN(q0, p0, p1, n0, n0, n1, panelCol);
    g.triN(q0, p1, q1, n0, n1, n1, panelCol);
    // Gold rib seam along each tent sector
    g.rod(p0, q0, 0.008, GOLD, 5);
    // Ornate scalloped valance eaves + hanging swag lobe at sector midpoint
    const pm = [cm * 1.065, 0.62, sm * 1.065];
    const v0 = [c0 * 1.06, 0.54, s0 * 1.06], vm = [cm * 1.065, 0.50, sm * 1.065], v1 = [c1 * 1.06, 0.54, s1 * 1.06];
    g.quad(p0, pm, vm, v0, i % 2 === 0 ? GOLD : COLS[0]);
    g.quad(pm, p1, v1, vm, i % 2 === 0 ? GOLD : COLS[0]);
    g.sphere(0.018, 6, 6, cm * 1.065, 0.50, sm * 1.065, GOLD);
  }
  // Upper clerestory lantern crown & golden finial spire
  g.cyl(0.43, 0.43, 0.08, 16, 0, 0.88, 0, GOLD);
  g.cyl(0.01, 0.44, 0.16, 16, 0, 0.99, 0, COLS[0]);
  g.sphere(0.045, 10, 8, 0, 1.09, 0, GOLD);
  g.cyl(0.004, 0.016, 0.10, 8, 0, 1.15, 0, GOLD);

  // Prancing horses on brass poles: 12 outer horses (r = 0.78) + 6 inner horses (r = 0.48)
  const coats = [WHITE, [0.58, 0.36, 0.20], [0.90, 0.78, 0.50], [0.76, 0.78, 0.82]];
  const addHorseRing = (count, rad, scale, phaseOff) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + phaseOff;
      const ca = Math.cos(a), sa = Math.sin(a);
      const tx = -sa, tz = ca; // tangent direction (forward gallop)
      const x = ca * rad, z = sa * rad;
      // Smooth brass pole from floor to canopy soffit
      g.cyl(0.011, 0.011, 0.58, 8, x, 0.35, z, BRASS);
      // Horse height oscillates by index to simulate galloping motion
      const hy = 0.21 + ((i % 3) * 0.045);
      const coat = coats[i % coats.length];
      const saddle = COLS[(i + phaseOff * 3 | 0) % COLS.length];
      const s = scale;
      // Sculpted horse barrel torso (along tangent)
      const pt = (along, up) => [x + tx * along * s, hy + up * s, z + tz * along * s];
      g.rod(pt(-0.045, 0), pt(0.045, 0.008), 0.028 * s, coat, 8);
      g.sphere(0.029 * s, 8, 6, ...pt(-0.042, 0), coat);
      g.sphere(0.030 * s, 8, 6, ...pt(0.042, 0.008), coat);
      // Coloured saddle blanket
      g.rod(pt(-0.015, 0.006), pt(0.018, 0.010), 0.032 * s, saddle, 8);
      // Arched neck & head with nose
      g.rod(pt(0.038, 0.012), pt(0.072, 0.068), 0.018 * s, coat, 7);
      g.rod(pt(0.070, 0.068), pt(0.098, 0.052), 0.013 * s, coat, 6);
      // Golden mane crest & flowing tail
      g.rod(pt(0.032, 0.022), pt(0.068, 0.072), 0.008 * s, GOLD, 5);
      g.rod(pt(-0.048, 0.006), pt(-0.088, -0.035), 0.010 * s, GOLD, 6);
      // Four prancing legs (forelegs raised, hindlegs pushing off)
      for (const side of [-0.016, 0.016]) {
        const ox = ca * side * s, oz = sa * side * s;
        g.rod([x + ox + tx * 0.038 * s, hy - 0.005 * s, z + oz + tz * 0.038 * s],
              [x + ox + tx * 0.072 * s, hy - 0.062 * s, z + oz + tz * 0.072 * s], 0.0065 * s, coat, 5);
        g.rod([x + ox - tx * 0.038 * s, hy - 0.005 * s, z + oz - tz * 0.038 * s],
              [x + ox - tx * 0.068 * s, hy - 0.072 * s, z + oz - tz * 0.068 * s], 0.0065 * s, coat, 5);
      }
    }
  };
  addHorseRing(12, 0.78, 1.0, 0);
  addHorseRing(6, 0.48, 0.85, 0.26);
  return g.build();
}

/**
 * Wave Swinger / Chair-O-Plane Ride (unit radius 1, scaled by (a.r, 16, a.r)):
 * Ornate scalloped mushroom canopy at y=1.0..1.23 with festival stripes & finial,
 * and 16 suspended swing chairs with V-bridle chains, backrests, and lap bars.
 */
function swingGeom() {
  const g = new G();
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) * 0.5;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), cm = Math.cos(am), sm = Math.sin(am);
    const col = i % 2 === 0 ? COLS[1] : COLS[2];
    const p0 = [c0 * 0.58, 1.0, s0 * 0.58], p1 = [c1 * 0.58, 1.0, s1 * 0.58];
    const q0 = [c0 * 0.22, 1.15, s0 * 0.22], q1 = [c1 * 0.22, 1.15, s1 * 0.22];
    const n0 = [c0 * 0.5, 0.86, s0 * 0.5], n1 = [c1 * 0.5, 0.86, s1 * 0.5];
    g.triN(q0, p0, p1, n0, n0, n1, col);
    g.triN(q0, p1, q1, n0, n1, n1, col);
    g.triN([0, 1.23, 0], q0, q1, [0, 1, 0], n0, n1, i % 2 === 0 ? COLS[0] : WHITE);
    // Scalloped eaves valance + underside soffit cone
    const v0 = [c0 * 0.58, 0.96, s0 * 0.58], vm = [cm * 0.585, 0.94, sm * 0.585], v1 = [c1 * 0.58, 0.96, s1 * 0.58];
    g.quad(p0, [cm * 0.585, 1.0, sm * 0.585], vm, v0, GOLD);
    g.quad([cm * 0.585, 1.0, sm * 0.585], p1, v1, vm, GOLD);
    g.tri([0, 0.91, 0], p1, p0, CREAM);
  }
  // Upper crown collar
  g.cyl(0.23, 0.23, 0.03, 16, 0, 1.15, 0, GOLD);

  // 16 outward-flung swing chairs on V-bridle suspension chains
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const tx = -s, tz = c;
    const top = [c * 0.52, 0.98, s * 0.52];
    const sx = c * 1.0, sy = 0.45, sz = s * 1.0;
    const col = COLS[i % COLS.length];
    // Twin V-bridle chains to chair armrests
    for (const side of [-0.032, 0.032]) {
      g.rod(top, [sx + tx * side, sy + 0.015, sz + tz * side], 0.0045, STEEL, 4);
    }
    // Contoured bucket seat pan, high backrest & safety lap bar
    g.box(sx, sy, sz, 0.038, 0.008, 0.038, col);
    g.box(sx - c * 0.030, sy + 0.022, sz - s * 0.030, 0.036, 0.022, 0.012, col);
    g.rod([sx + tx * -0.034 + c * 0.02, sy + 0.012, sz + tz * -0.034 + s * 0.02],
          [sx + tx * 0.034 + c * 0.02, sy + 0.012, sz + tz * 0.034 + s * 0.02], 0.004, STEEL, 4);
  }
  return g.build();
}

/**
 * Spinner / Teacups Flat Ride (unit radius 1, scaled by a.r = 7m):
 * Central hub dome, 6 sweeping radial arms, and 6 smooth teacup pods with hand-wheels.
 */
function spinnerGeom() {
  const g = new G();
  // Central turntable hub & golden spire dome
  g.cyl(0.22, 0.26, 0.18, 16, 0, 0.09, 0, WHITE);
  g.sphere(0.18, 12, 8, 0, 0.20, 0, GOLD, 1, 0.7, 1);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.66, z = Math.sin(a) * 0.66;
    const col = COLS[i % COLS.length];
    // Sweeping support arm
    g.beam([0, 0.14, 0], [x, 0.24, z], 0.032, STEEL);
    // Sub-turntable platter
    g.cyl(0.22, 0.22, 0.03, 14, x, 0.25, z, DARK);
    // Flared teacup outer shell (smooth cylinder + gold lip torus)
    g.cyl(0.21, 0.15, 0.18, 16, x, 0.35, z, col);
    g.torus(0.21, 0.014, 6, 16, x, 0.44, z, GOLD, Math.PI / 2, 0, 0);
    g.torus(0.185, 0.009, 6, 16, x, 0.35, z, WHITE, Math.PI / 2, 0, 0);
    // Interior curved bench & center spinning hand-wheel
    g.cyl(0.15, 0.14, 0.06, 12, x, 0.31, z, CREAM);
    g.cyl(0.015, 0.015, 0.12, 8, x, 0.36, z, STEEL);
    g.cyl(0.065, 0.065, 0.015, 10, x, 0.42, z, GOLD);
  }
  return g.build();
}

/**
 * Drop Tower Passenger Gondola Ring (world-scale, wraps 1.6m x 1.6m tower mast):
 * Heavy octagonal steel carriage frame, guide rollers, upper catch-car ring, and
 * 12 outward-facing high-back seats with yellow over-the-shoulder harnesses.
 */
function towerRingGeom() {
  const g = new G();
  // Inner guide-roller frame hugging the 1.6m tower mast
  g.box(0, 0.45, 0, 1.95, 0.55, 1.95, DARK);
  g.box(0, 1.05, 0, 2.35, 0.14, 2.35, STEEL);
  g.box(0, -0.15, 0, 2.25, 0.10, 2.25, STEEL);
  // Corner guide rollers & shock struts
  for (const sx of [-1.1, 1.1]) {
    for (const sz of [-1.1, 1.1]) {
      g.cyl(0.18, 0.18, 1.4, 8, sx, 0.45, sz, STEEL);
    }
  }
  // 12 outward-facing ergonomic drop seats around the perimeter
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const tx = -sa, tz = ca;
    const r = 2.55;
    const sx = ca * r, sz = sa * r;
    const col = COLS[i % COLS.length];
    // Radial support strut from carriage frame
    g.rod([ca * 1.85, 0.35, sa * 1.85], [sx, 0.35, sz], 0.12, STEEL, 6);
    // High-back bucket seat backrest & headrest
    g.box(sx - ca * 0.16, 0.48, sz - sa * 0.16, 0.34, 0.62, 0.34, col);
    g.box(sx - ca * 0.14, 1.18, sz - sa * 0.14, 0.24, 0.18, 0.24, DARK);
    // Seat cushion pan
    g.box(sx + ca * 0.14, 0.05, sz + sa * 0.14, 0.36, 0.12, 0.36, DARK);
    // Yellow over-the-shoulder safety harness bars
    for (const side of [-0.18, 0.18]) {
      const hx = sx + tx * side, hz = sz + tz * side;
      g.rod([hx - ca * 0.10, 0.95, hz - sa * 0.10], [hx + ca * 0.22, 0.25, hz + sa * 0.22], 0.055, COLS[2], 6);
    }
    // Dangling footrest bar
    g.rod([sx + tx * -0.25 + ca * 0.25, -0.42, sz + tz * -0.25 + sa * 0.25],
          [sx + tx * 0.25 + ca * 0.25, -0.42, sz + tz * 0.25 + sa * 0.25], 0.04, STEEL, 5);
  }
  return g.build();
}

/**
 * Roller Coaster Train Car (world-scale, +Z forward, tinted via InstancedMesh instanceColor):
 * Sculpted aerodynamic nose cone, side fairings, 2 rows of twin high-back bucket seats
 * with over-the-shoulder restraints, windshield lip, headlights, and road/up-stop wheel bogies.
 */
function carGeom() {
  const g = new G();
  const CAR_BODY = [1, 1, 1]; // Tinted per coaster via InstancedMesh.setColorAt
  // Main chassis tub & side bolster fairings
  g.box(0, 0.36, -0.10, 0.64, 0.24, 1.05, CAR_BODY);
  for (const sx of [-0.58, 0.58]) {
    g.cyl(0.16, 0.16, 2.0, 10, sx, 0.52, -0.05, CAR_BODY, Math.PI / 2, 0, 0);
  }
  // Smooth aerodynamic nose cone (+Z forward)
  g.sphere(0.62, 14, 10, 0, 0.42, 0.82, CAR_BODY, 1.02, 0.58, 1.35);
  // Tinted front windshield deflector & dual headlights
  g.box(0, 0.72, 0.58, 0.52, 0.10, 0.16, GLASS);
  for (const sx of [-0.36, 0.36]) {
    g.sphere(0.09, 8, 6, sx, 0.42, 1.56, [1.0, 0.96, 0.80], 1.1, 0.8, 0.6);
  }
  // Dark cockpit floor well & rear bumper fin
  g.box(0, 0.48, -0.15, 0.48, 0.16, 0.82, DARK);
  g.box(0, 0.68, -1.08, 0.56, 0.16, 0.12, CAR_BODY);

  // Two rows of twin ergonomic bucket seats + over-the-shoulder harnesses
  for (const rz of [0.22, -0.52]) {
    for (const sx of [-0.26, 0.26]) {
      // High backrest & sculpted headrest
      g.box(sx, 0.78, rz - 0.16, 0.20, 0.32, 0.09, DARK);
      g.sphere(0.14, 8, 6, sx, 1.12, rz - 0.16, [0.22, 0.24, 0.28], 1.1, 0.9, 0.6);
      // Over-the-shoulder harness bars
      for (const hs of [-0.09, 0.09]) {
        g.rod([sx + hs, 0.98, rz - 0.12], [sx + hs, 0.62, rz + 0.14], 0.032, STEEL, 5);
      }
    }
  }
  // Under-track road wheels, side guide wheels & up-stop wheel bogies at rail width (±0.55m)
  for (const bz of [-0.78, 0.78]) {
    for (const sx of [-0.55, 0.55]) {
      g.box(sx, 0.08, bz, 0.10, 0.14, 0.22, STEEL);
      g.cyl(0.13, 0.13, 0.08, 10, sx, 0.14, bz, DARK, 0, 0, Math.PI / 2);
      g.cyl(0.09, 0.09, 0.07, 8, sx, -0.04, bz, DARK, 0, 0, Math.PI / 2);
    }
  }
  return g.build();
}

export class VenueRides {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = "venue_rides";
    scene.add(this.root);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.18 });
    this.carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.28 });
    this.geo = null;
    this.entries = new Map(); // chunk group -> { group, items, cx, cz }
    this.time = 0;
    this.syncT = 0;
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  _geoms() {
    if (!this.geo) {
      this.geo = {
        wheel: wheelGeom(),
        carousel: carouselGeom(),
        swing: swingGeom(),
        spinner: spinnerGeom(),
        tower: towerRingGeom(),
        car: carGeom(),
      };
    }
    return this.geo;
  }

  _add(chunk, anim) {
    const G0 = this._geoms();
    const group = new THREE.Group();
    const items = [];
    let sx = 0, sz = 0;
    for (const a of anim) {
      if (a.t === "wheel") {
        const pivot = new THREE.Object3D();
        pivot.position.set(a.x, a.y, a.z);
        pivot.rotation.y = -a.yaw + Math.PI / 2;
        const m = new THREE.Mesh(G0.wheel, this.mat);
        m.scale.setScalar(a.r);
        m.castShadow = true;
        pivot.add(m);
        group.add(pivot);
        items.push({ t: "wheel", m, w: 0.06 + (a.r < 15 ? 0.04 : 0) });
        sx += a.x; sz += a.z;
      } else if (a.t === "carousel" || a.t === "swing" || a.t === "spinner") {
        const m = new THREE.Mesh(G0[a.t], this.mat);
        m.position.set(a.x, a.y, a.z);
        m.scale.setScalar(a.r);
        if (a.t === "swing") m.scale.set(a.r, 16, a.r);
        group.add(m);
        items.push({ t: a.t, m, w: a.t === "carousel" ? 0.45 : a.t === "swing" ? 1.1 : 1.6, ph: (a.x * 13.1 + a.z) % 6 });
        sx += a.x; sz += a.z;
      } else if (a.t === "tower") {
        const m = new THREE.Mesh(G0.tower, this.mat);
        m.position.set(a.x, a.y0, a.z);
        group.add(m);
        items.push({ t: "tower", m, y0: a.y0, y1: a.y1, ph: (a.x * 7.3 + a.z * 3.1) % 14 });
        sx += a.x; sz += a.z;
      } else if (a.t === "coaster") {
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
        items.push({ t: "coaster", im, p, n, cum, len: cum[n], maxY, s: 0, cars: a.cars });
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
        if (it.t === "wheel") it.m.rotation.z = -t * it.w;
        else if (it.t === "carousel" || it.t === "swing" || it.t === "spinner") {
          it.m.rotation.y = t * it.w + it.ph;
          if (it.t === "spinner") it.m.rotation.x = 0.18 * Math.sin(t * 0.7 + it.ph);
        } else if (it.t === "tower") {
          const c = (t + it.ph) % 14;
          let f;
          if (c < 6) f = c / 6; // slow lift
          else if (c < 8) f = 1; // hold at the top
          else if (c < 9.3) { const u = (c - 8) / 1.3; f = 1 - u * u; } // free fall
          else f = 0;
          it.m.position.y = it.y0 + (it.y1 - it.y0) * f;
        } else if (it.t === "coaster") {
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
