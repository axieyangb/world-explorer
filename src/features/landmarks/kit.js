/**
 * feature/famous-landmarks — tiny procedural geometry kit.
 *
 * Accumulates triangles (position / normal / vertex colour) into merged buffers, split into a
 * "solid" bucket and a "glow" bucket (emissive at night, normal lit colour by day), optionally into
 * named animated parts. Model space: metres, origin at the ground centre, +Y up, front faces -Z.
 *
 *   const k = new Kit(lod);           // lod 0 = full detail, 1 = far impostor (skip small details: if (k.hi) ...)
 *                                     // [lm-materials] k.fine: close-up-only detail (a third, nearest LOD level)
 *   k.color(0x6fae9c).box(x, y0, z, w, h, d);
 *   k.push().translate(0, 40, 0).rotateZ(0.07); ... k.pop();
 *   k.glow(true); ...; k.glow(false);
 *   k.part("wheel", px, py, pz); ... k.part("main");   // separate mesh pivoting at (px,py,pz)
 *   k.color(0xd6c9ae, "travertine");   // [lm-materials] explicit library material for this colour
 *   k.mat("glass"); ...; k.mat(null);   // [lm-materials] sticky material override
 * Colours without an explicit material are mapped through `k.matMap` (material_map.js) or the colour heuristic.
 */
import * as THREE from "../../../vendor/three.module.js";
import { MAT, classifyColor } from "./materials.js";

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _na = new THREE.Vector3(), _nb = new THREE.Vector3(), _nc = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _col = new THREE.Color();
const TAU = Math.PI * 2;

export class Kit {
  constructor(lod = 0, fine = lod === 0) {
    this.lod = lod;
    this.hi = lod === 0;
    this._fine = lod === 0 && fine; // [lm-materials] close-up detail level (see `fine`)
    this._m = new THREE.Matrix4();
    this._nm = new THREE.Matrix3();
    this._stack = [];
    this._rgb = [1, 1, 1];
    this._glow = false;
    this._parts = new Map();
    this._cur = this._newPart("main", 0, 0, 0);
    this.tris = 0;
    // [lm-materials] library material per triangle
    this._hex = 0xffffff;
    this._cmat = -1;          // material given with the current colour
    this._mat = -1;           // sticky override (k.mat)
    this._mid = -1;           // resolved id for the current state (-1 = resolve on next emit)
    this.matMap = null;       // { hex: name } for this model (set by LandmarkSystem)
    this.matStone = "limestone";
    this._resolved = new Map();
  }

  /**
   * [lm-materials] true only in the close-up level: heavy detail (statues, girder lacing, window recesses...) goes
   * under `if (k.fine)`. A model that reads it gets three LOD levels: fine (< fineDist), hi (< lodDist), far.
   */
  get fine() { this.usedFine = true; return this._fine; }

  /** [lm-materials] Sticky library material (name from materials.js MAT), null = back to colour mapping. */
  mat(name) {
    this._mat = name == null ? -1 : MAT[name] ?? -1;
    this._mid = -1;
    return this;
  }

  _matId() {
    if (this._mid >= 0) return this._mid;
    let id = this._mat >= 0 ? this._mat : this._cmat;
    if (id < 0) {
      const key = this._hex * 2 + (this._glow ? 1 : 0);
      id = this._resolved.get(key);
      if (id === undefined) {
        const m = this.matMap && this.matMap[this._hex];
        id = m != null ? MAT[m] ?? 0 : classifyColor(this._hex, this.matStone, this._glow);
        this._resolved.set(key, id);
      }
    }
    this._mid = id;
    return id;
  }

  _newPart(name, px, py, pz) {
    const p = { name, pivot: [px, py, pz], solid: { p: [], n: [], c: [], m: [] }, glow: { p: [], n: [], c: [], m: [] } };
    this._parts.set(name, p);
    return p;
  }

  /** Switch to (or create) an animated part; geometry is still given in model space. */
  part(name = "main", px = 0, py = 0, pz = 0) {
    this._cur = this._parts.get(name) || this._newPart(name, px, py, pz);
    return this;
  }

  color(hex, mat) {
    _col.setHex(hex);
    this._rgb = [_col.r, _col.g, _col.b];
    this._hex = hex;
    this._cmat = mat ? MAT[mat] ?? -1 : -1;
    this._mid = -1;
    return this;
  }

  glow(on = true) { if (this._glow !== !!on) this._mid = -1; this._glow = !!on; return this; }

  // ------------------------------------------------------------ transform stack
  push() { this._stack.push(this._m.clone()); return this; }
  pop() { if (this._stack.length) this._m.copy(this._stack.pop()); return this; }
  _mul(m) { this._m.multiply(m); return this; }
  translate(x, y, z) { return this._mul(new THREE.Matrix4().makeTranslation(x, y, z)); }
  rotateX(a) { return this._mul(new THREE.Matrix4().makeRotationX(a)); }
  rotateY(a) { return this._mul(new THREE.Matrix4().makeRotationY(a)); }
  rotateZ(a) { return this._mul(new THREE.Matrix4().makeRotationZ(a)); }
  scale(x, y = x, z = x) { return this._mul(new THREE.Matrix4().makeScale(x, y, z)); }

  // ------------------------------------------------------------ raw triangles
  _emit(a, b, c, na, nb, nc) {
    const B = this._glow ? this._cur.glow : this._cur.solid;
    _a.set(a[0], a[1], a[2]).applyMatrix4(this._m);
    _b.set(b[0], b[1], b[2]).applyMatrix4(this._m);
    _c.set(c[0], c[1], c[2]).applyMatrix4(this._m);
    if (!na) {
      _e1.subVectors(_b, _a); _e2.subVectors(_c, _a);
      _na.crossVectors(_e1, _e2);
      if (_na.lengthSq() < 1e-14) return;
      _na.normalize(); _nb.copy(_na); _nc.copy(_na);
    } else {
      this._nm.getNormalMatrix(this._m);
      _na.set(na[0], na[1], na[2]).applyMatrix3(this._nm).normalize();
      _nb.set(nb[0], nb[1], nb[2]).applyMatrix3(this._nm).normalize();
      _nc.set(nc[0], nc[1], nc[2]).applyMatrix3(this._nm).normalize();
    }
    B.p.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    B.n.push(_na.x, _na.y, _na.z, _nb.x, _nb.y, _nb.z, _nc.x, _nc.y, _nc.z);
    const [r, g, bl] = this._rgb;
    B.c.push(r, g, bl, r, g, bl, r, g, bl);
    B.m.push(this._mid >= 0 ? this._mid : this._matId());
    this.tris++;
  }

  /** Flat triangle, counter-clockwise when seen from the front. */
  tri(a, b, c) { this._emit(a, b, c); return this; }
  /** Flat quad a-b-c-d counter-clockwise from the front. */
  quad(a, b, c, d) { this._emit(a, b, c); this._emit(a, c, d); return this; }
  /** Double-sided quad (thin panels, flags, signs). */
  quad2(a, b, c, d) { this.quad(a, b, c, d); this.quad(d, c, b, a); return this; }

  // ------------------------------------------------------------ primitives
  /** Axis-aligned box; (x, z) centre, y0 bottom. */
  box(x, y0, z, w, h, d) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // +Z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // -Z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +X
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // -X
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // top
    if (y0 > 0.01 || this._stack.length) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // bottom
    return this;
  }

  /** Tapered rectangular block: bottom w0 x d0, top w1 x d1 (centred), optional top offset (ox, oz). */
  taper(x, y0, z, w0, d0, w1, d1, h, ox = 0, oz = 0) {
    const y1 = y0 + h;
    const b = [[x - w0 / 2, z + d0 / 2], [x + w0 / 2, z + d0 / 2], [x + w0 / 2, z - d0 / 2], [x - w0 / 2, z - d0 / 2]];
    const t = [[x + ox - w1 / 2, z + oz + d1 / 2], [x + ox + w1 / 2, z + oz + d1 / 2], [x + ox + w1 / 2, z + oz - d1 / 2], [x + ox - w1 / 2, z + oz - d1 / 2]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad([b[i][0], y0, b[i][1]], [b[j][0], y0, b[j][1]], [t[j][0], y1, t[j][1]], [t[i][0], y1, t[i][1]]);
    }
    if (w1 > 0.01 || d1 > 0.01) this.quad([t[0][0], y1, t[0][1]], [t[1][0], y1, t[1][1]], [t[2][0], y1, t[2][1]], [t[3][0], y1, t[3][1]]);
    return this;
  }

  /** Square pyramid (w x d base). */
  pyramid(x, y0, z, w, d, h) { return this.taper(x, y0, z, w, d, 0, 0, h); }
  pyr(x, y0, z, w, d = w, h = w) { return this.pyramid(x, y0, z, w, d, h); }

  /**
   * Surface of revolution around the local Y axis through (x, z). prof = [[r, y], ...] bottom to top
   * (y relative to y0). seg sides, smooth analytical radial/profile normals when seg >= 10 (or opts.smooth),
   * keeping crisp flat facet normals on polygonal prisms (seg <= 8). Caps are added where the end radius is > 0.
   */
  lathe(x, y0, z, prof, seg = 16, opts = {}) {
    const smooth = opts.smooth !== undefined ? opts.smooth : (seg >= 10 || !!opts.pipe);
    if (this.hi && smooth && seg >= 12 && !opts.exactSeg) {
      seg = Math.min(64, Math.max(24, Math.round(seg * 1.5)));
    }
    const a0 = opts.phase || 0;
    const caps = opts.caps !== false;
    const nSeg = prof.length - 1;
    const snr = new Float64Array(nSeg);
    const sny = new Float64Array(nSeg);
    for (let i = 0; i < nSeg; i++) {
      const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
      const dr = r1 - r0, dy = h1 - h0;
      const ln = Math.hypot(dr, dy) || 1;
      snr[i] = dy / ln;
      sny[i] = -dr / ln;
    }
    const pNorm = opts.profNormals;
    for (let i = 0; i < nSeg; i++) {
      const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
      let pnr0 = snr[i], pny0 = sny[i], pnr1 = snr[i], pny1 = sny[i];
      if (pNorm) {
        pnr0 = pNorm[i][0]; pny0 = pNorm[i][1];
        pnr1 = pNorm[i + 1][0]; pny1 = pNorm[i + 1][1];
      } else if (smooth && nSeg > 1) {
        if (i > 0 && snr[i - 1] * snr[i] + sny[i - 1] * sny[i] > 0.35) {
          const br = snr[i - 1] + snr[i], by = sny[i - 1] + sny[i], bl = Math.hypot(br, by) || 1;
          pnr0 = br / bl; pny0 = by / bl;
        }
        if (i + 1 < nSeg && snr[i] * snr[i + 1] + sny[i] * sny[i + 1] > 0.35) {
          const tr = snr[i] + snr[i + 1], ty = sny[i] + sny[i + 1], tl = Math.hypot(tr, ty) || 1;
          pnr1 = tr / tl; pny1 = ty / tl;
        }
      }
      for (let s = 0; s < seg; s++) {
        const t0 = a0 + (s / seg) * TAU, t1 = a0 + ((s + 1) / seg) * TAU;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const p00 = [x + r0 * c0, y0 + h0, z + r0 * s0], p01 = [x + r0 * c1, y0 + h0, z + r0 * s1];
        const p10 = [x + r1 * c0, y0 + h1, z + r1 * s0], p11 = [x + r1 * c1, y0 + h1, z + r1 * s1];
        if (smooth) {
          const n00 = [pnr0 * c0, pny0, pnr0 * s0], n01 = [pnr0 * c1, pny0, pnr0 * s1];
          const n10 = [pnr1 * c0, pny1, pnr1 * s0], n11 = [pnr1 * c1, pny1, pnr1 * s1];
          const tm = (t0 + t1) * 0.5, cm = Math.cos(tm), sm = Math.sin(tm);
          if (r0 > 1e-4) {
            const nt = r1 > 1e-4 ? n10 : [pnr1 * cm, pny1, pnr1 * sm];
            this._emit(p00, p10, p01, n00, nt, n01);
          }
          if (r1 > 1e-4) {
            const nb = r0 > 1e-4 ? n01 : [pnr0 * cm, pny0, pnr0 * sm];
            this._emit(p01, p10, p11, nb, n10, n11);
          }
        } else {
          if (r0 > 1e-4) this._emit(p00, p10, p01);
          if (r1 > 1e-4) this._emit(p01, p10, p11);
        }
      }
    }
    if (caps) {
      const [rb, hb] = prof[0], [rt, ht] = prof[prof.length - 1];
      const nUp = [0, 1, 0], nDn = [0, -1, 0];
      for (let s = 0; s < seg; s++) {
        const t0 = a0 + (s / seg) * TAU, t1 = a0 + ((s + 1) / seg) * TAU;
        if (rt > 1e-4) this._emit([x, y0 + ht, z], [x + rt * Math.cos(t1), y0 + ht, z + rt * Math.sin(t1)], [x + rt * Math.cos(t0), y0 + ht, z + rt * Math.sin(t0)], nUp, nUp, nUp);
        if (rb > 1e-4 && (hb + y0 > 0.01 || this._stack.length)) this._emit([x, y0 + hb, z], [x + rb * Math.cos(t0), y0 + hb, z + rb * Math.sin(t0)], [x + rb * Math.cos(t1), y0 + hb, z + rb * Math.sin(t1)], nDn, nDn, nDn);
      }
    }
    return this;
  }

  /** Frustum / cylinder / cone (r1 = 0) of height h. */
  cyl(x, y0, z, r0, r1, h, seg = 12, opts = {}) { return this.lathe(x, y0, z, [[r0, 0], [r1, h]], seg, opts); }

  /** Cone of base radius r and height h. */
  cone(x, y0, z, r, h, seg = 16, opts = {}) { return this.cyl(x, y0, z, r, 0, h, seg, opts); }

  /** Crisp flat-faceted polygonal prism of radius r, height h, and seg sides. */
  prism(x, y0, z, r, h, seg = 6, phase = 0) { return this.cyl(x, y0, z, r, r, h, seg, { smooth: false, phase }); }

  /** Sphere (or ellipsoid with sy) centred at (x, y, z). frac < 1 makes a dome (upper part only). */
  sphere(x, y, z, r, seg = 14, rings = 8, sy = 1, frac = 1) {
    const smooth = seg >= 10;
    if (this.hi && smooth) {
      seg = Math.min(64, Math.max(24, Math.round(seg * 1.5)));
      rings = Math.min(32, Math.max(12, Math.round(rings * 1.5)));
    }
    const prof = [];
    const profNormals = [];
    const start = frac >= 1 ? -Math.PI / 2 : Math.PI / 2 - frac * Math.PI;
    for (let i = 0; i <= rings; i++) {
      const a = start + (i / rings) * (Math.PI / 2 - start);
      const ca = Math.cos(a), sa = Math.sin(a);
      prof.push([Math.max(0, ca * r), sa * r * sy]);
      const nr = ca * sy, ny = sa, nl = Math.hypot(nr, ny) || 1;
      profNormals.push([nr / nl, ny / nl]);
    }
    prof[prof.length - 1][0] = 0;
    profNormals[profNormals.length - 1] = [0, 1];
    if (frac >= 1) {
      prof[0][0] = 0;
      profNormals[0] = [0, -1];
    }
    return this.lathe(x, y, z, prof, seg, { caps: frac < 1, smooth, profNormals, exactSeg: true });
  }

  /** Upper dome helper (defaults to hemisphere frac = 0.5). */
  dome(x, y, z, r, seg = 20, rings = 10, sy = 1, frac = 0.5) {
    return this.sphere(x, y, z, r, seg, rings, sy, frac);
  }

  /** Horizontal torus / ring around the local Y axis centred at (x, y, z) with smooth analytical normals. */
  torus(x, y, z, R, r, seg = 24, tubeSeg = 12, arc = TAU) {
    const smooth = seg >= 10;
    if (this.hi && smooth) {
      seg = Math.min(64, Math.max(28, Math.round(seg * 1.5)));
      tubeSeg = Math.min(24, Math.max(12, Math.round(tubeSeg * 1.25)));
    }
    for (let i = 0; i < seg; i++) {
      const u0 = (i / seg) * arc, u1 = ((i + 1) / seg) * arc;
      const cu0 = Math.cos(u0), su0 = Math.sin(u0), cu1 = Math.cos(u1), su1 = Math.sin(u1);
      for (let j = 0; j < tubeSeg; j++) {
        const v0 = (j / tubeSeg) * TAU, v1 = ((j + 1) / tubeSeg) * TAU;
        const cv0 = Math.cos(v0), sv0 = Math.sin(v0), cv1 = Math.cos(v1), sv1 = Math.sin(v1);
        const r0 = R + r * cv0, r1 = R + r * cv1;
        const p00 = [x + r0 * cu0, y + r * sv0, z + r0 * su0];
        const p10 = [x + r1 * cu0, y + r * sv1, z + r1 * su0];
        const p01 = [x + r0 * cu1, y + r * sv0, z + r0 * su1];
        const p11 = [x + r1 * cu1, y + r * sv1, z + r1 * su1];
        if (smooth) {
          const n00 = [cv0 * cu0, sv0, cv0 * su0], n10 = [cv1 * cu0, sv1, cv1 * su0];
          const n01 = [cv0 * cu1, sv0, cv0 * su1], n11 = [cv1 * cu1, sv1, cv1 * su1];
          this._emit(p00, p10, p01, n00, n10, n01);
          this._emit(p01, p10, p11, n01, n10, n11);
        } else {
          this._emit(p00, p10, p01);
          this._emit(p01, p10, p11);
        }
      }
    }
    return this;
  }
  ring(x, y, z, R, r, seg = 24, tubeSeg = 12, arc = TAU) { return this.torus(x, y, z, R, r, seg, tubeSeg, arc); }

  /** Square-section beam between two points (lattice struts). t = width. */
  strut(a, b, t) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _e1.length();
    if (len < 1e-3) return this;
    _e1.multiplyScalar(1 / len);
    const up = Math.abs(_e1.y) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    _e2.set(up[0], up[1], up[2]).cross(_e1).normalize().multiplyScalar(t / 2);
    const u = [_e2.x, _e2.y, _e2.z];
    _e2.crossVectors(_e1, _e2).normalize().multiplyScalar(t / 2);
    const v = [_e2.x, _e2.y, _e2.z];
    const P = (p, su, sv) => [p[0] + u[0] * su + v[0] * sv, p[1] + u[1] * su + v[1] * sv, p[2] + u[2] * su + v[2] * sv];
    const A = [P(a, 1, 1), P(a, -1, 1), P(a, -1, -1), P(a, 1, -1)];
    const Bq = [P(b, 1, 1), P(b, -1, 1), P(b, -1, -1), P(b, 1, -1)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(A[i], A[j], Bq[j], Bq[i]);
    }
    return this;
  }

  /** Frustum / cylinder alias. */
  cylinder(x, y0, z, r0, r1, h, seg = 16, opts = {}) { return this.cyl(x, y0, z, r0, r1, h, seg, opts); }

  /** Surface of revolution alias. */
  revolve(x, y0, z, prof, seg = 16, opts = {}) { return this.lathe(x, y0, z, prof, seg, opts); }

  /** Round pipe between two points (cables, arch tubes). */
  pipe(a, b, r, seg = 6) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _e1.length();
    if (len < 1e-3) return this;
    const dir = _e1.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
    const s = this.hi ? Math.max(12, Math.round(seg * 1.5)) : seg;
    this.push()._mul(m);
    this.lathe(0, 0, 0, [[r, 0], [r, len]], s, { caps: false, smooth: true, pipe: true, exactSeg: true });
    this.pop();
    return this;
  }

  /** Pipe through a polyline of points. */
  tube(points, r, seg = 6) {
    for (let i = 0; i < points.length - 1; i++) this.pipe(points[i], points[i + 1], r, seg);
    return this;
  }

  /** Catenary / parabolic sagging cable between two 3D points a and b. */
  cable(a, b, r = 0.08, sag = 0, segs = 12, radialSeg = 8) {
    const n = this.hi ? Math.max(12, segs) : Math.max(6, segs >> 1);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t),
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
    return this.tube(pts, r, radialSeg);
  }

  /** Smooth semicircular / parabolic arch tube in the XY plane at z. */
  arch(x, y0, z, span, rise, r = 0.35, segs = 20, radialSeg = 10) {
    const n = this.hi ? Math.max(20, segs) : Math.max(10, segs >> 1);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push([x - (span * 0.5) * Math.cos(a), y0 + rise * Math.sin(a), z]);
    }
    return this.tube(pts, r, radialSeg);
  }

  /** Vertical extrusion of a polygon [[x, z], ...] from y0 to y0 + h (any winding, simple polygon) with smooth normals on gently curved edges. */
  extrudePolygon(pts, y0, h, caps = true) { return this.extrude(pts, y0, h, caps); }

  extrude(pts, y0, h, caps = true) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
      area += x0 * z1 - x1 * z0;
    }
    // normalise winding so side walls face outward (shoelace area > 0 in x/z)
    const P = area > 0 ? pts : pts.slice().reverse();
    const N = P.length;
    const y1 = y0 + h;
    const enx = new Float64Array(N), enz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % N];
      const dx = x1 - x0, dz = z1 - z0, ln = Math.hypot(dx, dz) || 1;
      enx[i] = -dz / ln;
      enz[i] = dx / ln;
    }
    for (let i = 0; i < N; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % N];
      const prev = (i + N - 1) % N, next = (i + 1) % N;
      let nx0 = enx[i], nz0 = enz[i], nx1 = enx[i], nz1 = enz[i];
      if (enx[prev] * enx[i] + enz[prev] * enz[i] > 0.85) {
        const bx = enx[prev] + enx[i], bz = enz[prev] + enz[i], bl = Math.hypot(bx, bz) || 1;
        nx0 = bx / bl; nz0 = bz / bl;
      }
      if (enx[i] * enx[next] + enz[i] * enz[next] > 0.85) {
        const tx = enx[i] + enx[next], tz = enz[i] + enz[next], tl = Math.hypot(tx, tz) || 1;
        nx1 = tx / tl; nz1 = tz / tl;
      }
      const n0 = [nx0, 0, nz0], n1 = [nx1, 0, nz1];
      this._emit([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], n0, n0, n1);
      this._emit([x0, y0, z0], [x1, y1, z1], [x1, y0, z1], n0, n1, n1);
    }
    if (caps) {
      const v2 = P.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const [i, j, k] of tris) {
        const a = P[i], b = P[j], c = P[k];
        // orient upward-facing
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cr < 0) this._emit([a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]]);
        else this._emit([a[0], y1, a[1]], [c[0], y1, c[1]], [b[0], y1, b[1]]);
        if (y0 > 0.01 || this._stack.length) {
          if (cr < 0) this._emit([a[0], y0, a[1]], [c[0], y0, c[1]], [b[0], y0, b[1]]);
          else this._emit([a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y0, c[1]]);
        }
      }
    }
    return this;
  }

  /** Regular n-gon points (radius r, phase a0) for extrude(). */
  static ngon(n, r, a0 = 0, cx = 0, cz = 0) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    return out;
  }

  /** Star polygon points: n points, outer radius ro, inner radius ri. */
  static star(n, ro, ri, a0 = 0) {
    const out = [];
    for (let i = 0; i < n * 2; i++) { const a = a0 + (i / (n * 2)) * TAU; const r = i % 2 ? ri : ro; out.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return out;
  }

  // ------------------------------------------------------------ [lm-materials] architectural helpers
  /** Quad a-b-c-d wound so its face normal points along `want` (local coords). */
  quadN(a, b, c, d, want) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) this.quad(a, b, c, d); else this.quad(d, c, b, a);
    return this;
  }

  /**
   * Gothic recessed opening (portal / window) facing -Z in the current frame: `n` concentric pointed orders stepping
   * from the outer width W at plane z to the inner width wIn at z + depth (each order: intrados strip + front ring),
   * door / glass + tympanum at the back. Outer height H from y0 to the apex. opts:
   *   frame: [xLeft, xRight, yTop] fill the wall face around the outer arch at plane z (else the caller's wall does)
   *   back: "door" (door + tympanum with relief) | "glass" (one pane) | null;  statues: jamb figures on each order
   *   col: { face, side, back, tymp, fig }  colours (default = current colour)
   */
  recessArch(cx, y0, z, W, H, depth, n, wIn, opts = {}) {
    const hi = this.hi, m = hi && W > 3.5 ? 7 : hi && W > 1.6 ? 4 : 3;
    const cur = this._hex, C = opts.col || {};
    const col = (h) => this.color(h ?? cur);
    const R0 = W * (opts.rk || 1);
    const rise = Math.sqrt(Math.max(0, R0 * R0 - (R0 - W / 2) ** 2));
    const ys = y0 + H - rise;
    const s = (W - wIn) / (2 * n), dz = depth / n;
    const xcL = cx - W / 2 + R0, xcR = cx + W / 2 - R0;
    const outline = (i) => {
      const R = R0 - i * s, pts = [[cx - W / 2 + i * s, y0], [cx - W / 2 + i * s, ys]];
      const ta = Math.acos(Math.max(-1, Math.min(1, (cx - xcL) / R)));
      for (let j = 1; j <= m; j++) { const t = Math.PI + (ta - Math.PI) * (j / m); pts.push([xcL + Math.cos(t) * R, ys + Math.sin(t) * R]); }
      for (let j = m - 1; j >= 0; j--) { const t = Math.PI + (ta - Math.PI) * (j / m); pts.push([xcR - Math.cos(t) * R, ys + Math.sin(t) * R]); }
      pts.push([cx + W / 2 - i * s, ys], [cx + W / 2 - i * s, y0]);
      return pts;
    };
    const inward = (x, y) => (y <= ys + 1e-3 ? [cx - x, 0, 0] : x < cx ? [xcL - x, ys - y, 0] : [xcR - x, ys - y, 0]);
    let P = outline(0);
    if (opts.frame) {
      const [fl, fr, ft] = opts.frame;
      col(C.face);
      for (let j = 0; j < P.length - 1; j++) {
        const a = P[j], b = P[j + 1];
        const q = (p) => (p[1] <= ys + 1e-3 ? [p[0] < cx ? fl : fr, p[1]] : [p[0], ft]);
        const qa = q(a), qb = q(b);
        this.quadN([a[0], a[1], z], [b[0], b[1], z], [qb[0], qb[1], z], [qa[0], qa[1], z], [0, 0, -1]);
        if (a[1] <= ys + 1e-3 && b[1] > ys + 1e-3) this.quadN([qa[0], qa[1], z], [qb[0], qb[1], z], [qa[0], ft, z], [qa[0], ft, z], [0, 0, -1]);
        if (b[1] <= ys + 1e-3 && a[1] > ys + 1e-3) this.quadN([qa[0], qa[1], z], [qb[0], qb[1], z], [qb[0], ft, z], [qb[0], ft, z], [0, 0, -1]);
      }
    }
    for (let i = 0; i < n; i++) {
      const Q = outline(i + 1), za = z + i * dz, zb = za + dz;
      col(C.side);
      for (let j = 0; j < P.length - 1; j++) {
        const a = P[j], b = P[j + 1];
        this.quadN([a[0], a[1], za], [b[0], b[1], za], [b[0], b[1], zb], [a[0], a[1], zb], inward((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
      }
      col(C.face);
      for (let j = 0; j < P.length - 1; j++) this.quadN([P[j][0], P[j][1], zb], [P[j + 1][0], P[j + 1][1], zb], [Q[j + 1][0], Q[j + 1][1], zb], [Q[j][0], Q[j][1], zb], [0, 0, -1]);
      if (this.fine && opts.statues && H > 5) {
        // a column figure on each jamb step, small voussoir figures up the arch
        col(C.fig);
        for (const sx of [-1, 1]) {
          const fx = cx + sx * (W / 2 - (i + 0.5) * s);
          this.cyl(fx, y0 + 1.4, zb - 0.22, 0.2, 0.15, 1.9, 6).sphere(fx, y0 + 3.45, zb - 0.22, 0.16, 6, 3);
          this.box(fx, y0, zb - 0.22, s * 0.8, 1.4, 0.4);
        }
        for (let j = 3; j < P.length - 3; j += 2) {
          const fx = (P[j][0] + Q[j][0]) / 2, fy = (P[j][1] + Q[j][1]) / 2;
          this.box(fx, fy - 0.3, zb - 0.15, s * 0.55, 0.6, 0.3);
        }
      }
      P = Q;
    }
    // back: door + tympanum, or a pane
    const zb = z + depth - 0.02, xl = P[0][0], xr = P[P.length - 1][0];
    if (opts.back === "door") {
      const yd = Math.min(ys, y0 + Math.max(2.5, (ys - y0) * 0.9));
      col(C.back).quadN([xl, y0, zb], [xr, y0, zb], [xr, yd, zb], [xl, yd, zb], [0, 0, -1]);
      if (hi) { col(C.side).box(cx, y0, zb - 0.2, 0.7, yd - y0, 0.4); } // trumeau
      col(C.tymp).quadN([xl, yd, zb], [xr, yd, zb], [xr, ys, zb], [xl, ys, zb], [0, 0, -1]);
      for (let j = 1; j < P.length - 2; j++) this.quadN([cx, ys, zb], [P[j][0], P[j][1], zb], [P[j + 1][0], P[j + 1][1], zb], [cx, ys, zb], [0, 0, -1]);
      if (this.fine) {
        // tympanum relief: three registers of small figures
        col(C.fig);
        const ap = P[(P.length / 2) | 0][1];
        for (let r = 0; r < 3; r++) {
          const yr = yd + 0.2 + r * (ap - yd) * 0.3, hw = (xr - xl) / 2 * (1 - r * 0.33) - 0.4, nf = Math.max(1, Math.round(hw * 2.2));
          for (let q = 0; q < nf; q++) this.box(cx - hw + ((q + 0.5) / nf) * hw * 2, yr, zb - 0.12, hw * 1.4 / nf, (ap - yd) * 0.22, 0.24);
        }
      }
    } else if (opts.back === "glass") {
      col(C.back);
      this.quadN([xl, y0, zb], [xr, y0, zb], [xr, ys, zb], [xl, ys, zb], [0, 0, -1]);
      for (let j = 1; j < P.length - 2; j++) this.quadN([cx, ys, zb], [P[j][0], P[j][1], zb], [P[j + 1][0], P[j + 1][1], zb], [cx, ys, zb], [0, 0, -1]);
      if (this.fine && opts.mullions) {
        col(C.side);
        const nm = opts.mullions;
        for (let q = 1; q < nm; q++) this.box(xl + ((xr - xl) * q) / nm, y0, zb - 0.12, 0.18, ys - y0 + (P[(P.length / 2) | 0][1] - ys) * 0.5, 0.2);
        if (W > 2.5) for (let yy = y0 + 2.5; yy < ys; yy += 2.5) this.box(cx, yy, zb - 0.1, xr - xl, 0.1, 0.16);
      }
    }
    col(cur);
    return this;
  }

  /**
   * recessArch() set in a block that projects `depth` from the wall plane z (facing -Z): frame margin m round the
   * opening, the block's sides, top and sill closed. For windows / niches on walls that can't be cut.
   */
  framedArch(cx, y0, z, W, H, depth, n, wIn, m, opts = {}) {
    const zf = z - depth, xl = cx - W / 2 - m, xr = cx + W / 2 + m, yt = y0 + H + m;
    this.recessArch(cx, y0, zf, W, H, depth - 0.02, n, wIn, { ...opts, frame: [xl, xr, yt] });
    const C = opts.col || {};
    if (C.face != null) this.color(C.face);
    for (const [x, sx] of [[xl, -1], [xr, 1]]) this.quadN([x, y0, zf], [x, yt, zf], [x, yt, z], [x, y0, z], [sx, 0, 0]);
    this.quadN([xl, yt, zf], [xr, yt, zf], [xr, yt, z], [xl, yt, z], [0, 1, 0]);
    this.quadN([xl, y0, zf], [xr, y0, zf], [xr, y0, z], [xl, y0, z], [0, -1, 0]);
    return this;
  }

  /** Gothic pinnacle on (x, y, z): square shaft with gablets, crocketed spirelet, corner spirelets, finial. */
  pinnacle(x, y, z, w, h) {
    const hi = this.hi, hs = h * 0.35;
    this.box(x, y, z, w, hs, w);
    if (hi) {
      for (let i = 0; i < 4; i++) {
        this.push().translate(x, y + hs, z).rotateY((i * Math.PI) / 2);
        this.tri([w / 2, 0, -w / 2 - 0.02], [-w / 2, 0, -w / 2 - 0.02], [0, w * 0.7, -w / 2 - 0.02]);
        this.pop();
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.taper(x + sx * w * 0.42, y + hs, z + sz * w * 0.42, w * 0.22, w * 0.22, 0, 0, h * 0.25);
    }
    this.taper(x, y + hs, z, w * 0.8, w * 0.8, 0, 0, h - hs);
    if (this.fine) {
      for (let q = 1; q < 5; q++) {
        const t = q / 5, yy = y + hs + (h - hs) * t, o = w * 0.4 * (1 - t) + 0.05;
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.box(x + sx * o, yy, z + sz * o, w * 0.12, w * 0.12, w * 0.12);
      }
      this.sphere(x, y + h + w * 0.08, z, w * 0.12, 6, 3);
    }
    return this;
  }

  /**
   * Rose window facing -Z centred (x, y) on the wall plane z: splayed circular embrasure (depth d), stained-glass
   * disc, tracery (rings, n spokes, a circle of lobes in the outer band). col = { frame, glass, tracery, square }
   * (square = half-size of a square wall panel filled around the window on its face plane).
   */
  roseWindow(x, y, z, r, d = 0.9, n = 24, col = {}) {
    const hi = this.hi, seg = hi ? 48 : 16, cur = this._hex;
    const P = (rr, a, zz) => [x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz];
    this.color(col.frame ?? cur);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      // splay (wider at the face) and outer moulding ring
      this.quadN(P(r + 0.5, a0, z), P(r + 0.5, a1, z), P(r, a1, z + d), P(r, a0, z + d), [-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), -0.6]);
      if (hi) this.quadN(P(r + 0.9, a0, z - 0.25), P(r + 0.9, a1, z - 0.25), P(r + 0.5, a1, z), P(r + 0.5, a0, z), [0, 0, -1]);
    }
    if (col.square) {
      // square panel of half-size col.square around the window, its face on plane z - 0.25 (with the moulding)
      const S = col.square, zz = hi ? z - 0.25 : z, ro = hi ? r + 0.9 : r + 0.5;
      const sq = (a) => { const c = Math.cos(a), s2 = Math.sin(a), k = S / Math.max(Math.abs(c), Math.abs(s2)); return [x + c * k, y + s2 * k, zz]; };
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const qa = sq(a0), qb = sq(a1);
        this.quadN(P(ro, a0, zz), P(ro, a1, zz), qb, qa, [0, 0, -1]);
        for (let c = 0; c < 4; c++) {
          const ac = Math.PI / 4 + (c * Math.PI) / 2;
          if (a0 < ac && a1 > ac) this.quadN(qa, qb, [x + Math.sign(Math.cos(ac)) * S, y + Math.sign(Math.sin(ac)) * S, zz], [x + Math.sign(Math.cos(ac)) * S, y + Math.sign(Math.sin(ac)) * S, zz], [0, 0, -1]);
        }
      }
    }
    this.color(col.glass ?? cur);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.quadN([x, y, z + d], P(r, a0, z + d), P(r, a1, z + d), [x, y, z + d], [0, 0, -1]);
    }
    if (!hi) { this.color(cur); return this; }
    this.color(col.tracery ?? cur);
    const zt = z + d - 0.12, th = Math.max(0.14, r * 0.03);
    const ring = (cx, cy, rr, k) => {
      for (let i = 0; i < k; i++) {
        const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2;
        this.strut([cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, zt], [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, zt], th);
      }
    };
    ring(x, y, r * 0.2, 16); ring(x, y, r * 0.5, 32); ring(x, y, r * 0.98, 48);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.strut(P(r * 0.2, a, zt), P(r * 0.98, a, zt), th * (i % 2 ? 0.7 : 1));
      const am = a + Math.PI / n;
      ring(x + Math.cos(am) * r * 0.74, y + Math.sin(am) * r * 0.74, r * 0.13, 10);
      if (i % 2 === 0) ring(x + Math.cos(am) * r * 0.35, y + Math.sin(am) * r * 0.35, r * 0.08, 8);
    }
    this.color(cur);
    return this;
  }

  // ------------------------------------------------------------ output
  /** -> [{ name, pivot, solid: BufferGeometry|null, glow: BufferGeometry|null }] */
  build() {
    const out = [];
    for (const p of this._parts.values()) {
      const mk = (B) => {
        if (!B.p.length) return null;
        const pos = new Float32Array(B.p);
        const [px, py, pz] = p.pivot;
        if (px || py || pz) for (let i = 0; i < pos.length; i += 3) { pos[i] -= px; pos[i + 1] -= py; pos[i + 2] -= pz; }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(B.n), 3));
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(B.c), 3));
        const nv = pos.length / 3, A = new Float32Array(nv * 3);
        // [lm-materials] x = library material, y = AO, z = under-ledge (y/z baked later by materials.occlusionJob)
        for (let v = 0; v < nv; v++) { A[v * 3] = B.m[(v / 3) | 0]; A[v * 3 + 1] = 1; A[v * 3 + 2] = 0; }
        g.setAttribute("lmA", new THREE.BufferAttribute(A, 3));
        g.computeBoundingSphere();
        g.computeBoundingBox();
        return g;
      };
      const solid = mk(p.solid), glow = mk(p.glow);
      if (solid || glow) out.push({ name: p.name, pivot: p.pivot.slice(), solid, glow });
    }
    return out;
  }
}
