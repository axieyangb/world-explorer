/**
 * feature/famous-landmarks — tiny procedural geometry kit.
 *
 * Accumulates triangles (position / normal / vertex colour) into merged buffers, split into a
 * "solid" bucket and a "glow" bucket (emissive at night, normal lit colour by day), optionally into
 * named animated parts. Model space: metres, origin at the ground centre, +Y up, front faces -Z.
 *
 *   const k = new Kit(lod);           // lod 0 = full detail, 1 = far impostor (skip small details: if (k.hi) ...)
 *   k.color(0x6fae9c).box(x, y0, z, w, h, d);
 *   k.push().translate(0, 40, 0).rotateZ(0.07); ... k.pop();
 *   k.glow(true); ...; k.glow(false);
 *   k.part("wheel", px, py, pz); ... k.part("main");   // separate mesh pivoting at (px,py,pz)
 */
import * as THREE from "../../../vendor/three.module.js";

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _na = new THREE.Vector3(), _nb = new THREE.Vector3(), _nc = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _col = new THREE.Color();
const TAU = Math.PI * 2;

export class Kit {
  constructor(lod = 0) {
    this.lod = lod;
    this.hi = lod === 0;
    this._m = new THREE.Matrix4();
    this._nm = new THREE.Matrix3();
    this._stack = [];
    this._rgb = [1, 1, 1];
    this._glow = false;
    this._parts = new Map();
    this._cur = this._newPart("main", 0, 0, 0);
    this.tris = 0;
  }

  _newPart(name, px, py, pz) {
    const p = { name, pivot: [px, py, pz], solid: { p: [], n: [], c: [] }, glow: { p: [], n: [], c: [] } };
    this._parts.set(name, p);
    return p;
  }

  /** Switch to (or create) an animated part; geometry is still given in model space. */
  part(name = "main", px = 0, py = 0, pz = 0) {
    this._cur = this._parts.get(name) || this._newPart(name, px, py, pz);
    return this;
  }

  color(hex) {
    _col.setHex(hex);
    this._rgb = [_col.r, _col.g, _col.b];
    return this;
  }

  glow(on = true) { this._glow = !!on; return this; }

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

  /**
   * Surface of revolution around the local Y axis through (x, z). prof = [[r, y], ...] bottom to top
   * (y relative to y0). seg sides, smooth normals. Caps are added where the end radius is > 0.
   */
  lathe(x, y0, z, prof, seg = 16, opts = {}) {
    const smooth = opts.smooth !== false;
    const a0 = opts.phase || 0;
    const caps = opts.caps !== false;
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
      // profile normal (dr, dy) -> outward (dy, -dr)
      const dr = r1 - r0, dy = h1 - h0;
      const ln = Math.hypot(dr, dy) || 1;
      const pnr = dy / ln, pny = -dr / ln;
      for (let s = 0; s < seg; s++) {
        const t0 = a0 + (s / seg) * TAU, t1 = a0 + ((s + 1) / seg) * TAU;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const p00 = [x + r0 * c0, y0 + h0, z + r0 * s0], p01 = [x + r0 * c1, y0 + h0, z + r0 * s1];
        const p10 = [x + r1 * c0, y0 + h1, z + r1 * s0], p11 = [x + r1 * c1, y0 + h1, z + r1 * s1];
        if (smooth) {
          const n0 = [pnr * c0, pny, pnr * s0], n1 = [pnr * c1, pny, pnr * s1];
          if (r0 > 1e-4) this._emit(p00, p10, p01, n0, n0, n1);
          if (r1 > 1e-4) this._emit(p01, p10, p11, n1, n0, n1);
        } else {
          if (r0 > 1e-4) this._emit(p00, p10, p01);
          if (r1 > 1e-4) this._emit(p01, p10, p11);
        }
      }
    }
    if (caps) {
      const [rb, hb] = prof[0], [rt, ht] = prof[prof.length - 1];
      for (let s = 0; s < seg; s++) {
        const t0 = a0 + (s / seg) * TAU, t1 = a0 + ((s + 1) / seg) * TAU;
        if (rt > 1e-4) this._emit([x, y0 + ht, z], [x + rt * Math.cos(t1), y0 + ht, z + rt * Math.sin(t1)], [x + rt * Math.cos(t0), y0 + ht, z + rt * Math.sin(t0)]);
        if (rb > 1e-4 && (hb + y0 > 0.01 || this._stack.length)) this._emit([x, y0 + hb, z], [x + rb * Math.cos(t0), y0 + hb, z + rb * Math.sin(t0)], [x + rb * Math.cos(t1), y0 + hb, z + rb * Math.sin(t1)]);
      }
    }
    return this;
  }

  /** Frustum / cylinder / cone (r1 = 0) of height h. */
  cyl(x, y0, z, r0, r1, h, seg = 12, opts = {}) { return this.lathe(x, y0, z, [[r0, 0], [r1, h]], seg, opts); }

  /** Sphere (or ellipsoid with sy) centred at (x, y, z). frac < 1 makes a dome (upper part only). */
  sphere(x, y, z, r, seg = 14, rings = 8, sy = 1, frac = 1) {
    const prof = [];
    const start = frac >= 1 ? -Math.PI / 2 : Math.PI / 2 - frac * Math.PI;
    for (let i = 0; i <= rings; i++) {
      const a = start + (i / rings) * (Math.PI / 2 - start);
      prof.push([Math.max(0, Math.cos(a) * r), Math.sin(a) * r * sy]);
    }
    prof[prof.length - 1][0] = 0;
    return this.lathe(x, y, z, prof, seg, { caps: frac < 1 });
  }

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
      this.quad(A[i], Bq[i], Bq[j], A[j]); // both windings: robust regardless of orientation
    }
    return this;
  }

  /** Round pipe between two points (cables, arch tubes). */
  pipe(a, b, r, seg = 6) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _e1.length();
    if (len < 1e-3) return this;
    const dir = _e1.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
    this.push()._mul(m);
    this.lathe(0, 0, 0, [[r, 0], [r, len]], seg, { caps: false });
    this.pop();
    return this;
  }

  /** Pipe through a polyline of points. */
  tube(points, r, seg = 6) {
    for (let i = 0; i < points.length - 1; i++) this.pipe(points[i], points[i + 1], r, seg);
    return this;
  }

  /** Vertical extrusion of a polygon [[x, z], ...] from y0 to y0 + h (any winding, simple polygon). */
  extrude(pts, y0, h, caps = true) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
      area += x0 * z1 - x1 * z0;
    }
    // normalise winding so side walls face outward (shoelace area > 0 in x/z)
    const P = area > 0 ? pts : pts.slice().reverse();
    const y1 = y0 + h;
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length];
      this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1]);
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
