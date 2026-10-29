// [hero-vehicles] Detailed player models for the bus, Cybertruck, ambulance, tow truck and tank.
// Same builder contract as buildHeroVehicle in hero_vehicles.js; ids listed here take over from the
// light models when the player drives them.
// These vehicles are boxy, so the bodies are bevelled extrusions of a side profile (rounded edges with
// creased normals) and rounded boxes rather than lofts. Liveries are painted in the fragment shader from
// object-space position, so colour borders stay crisp whatever the tessellation. Every part is baked
// into its parent's space and merged per material, and the merged geometry is cached per type.
// Local frame matches entities.js: +Z forward, +X right, +Y up, tyre contact at y = 0.
import * as THREE from '../../vendor/three.module.js';
import { materials } from './hero_vehicles.js';

// ---------------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Bake position / rotation (XYZ Euler) / scale into the geometry.
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}

// Concatenate geometries (position, normal, uv) into one non-indexed geometry.
function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    N.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  return out;
}

// Smooth normals across edges flatter than `angle`, hard creases elsewhere (bevels read as round).
function creased(geo, angle = 0.6) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position.array, cnt = P.length / 9;
  const fn = new Float32Array(cnt * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < cnt; f++) {
    a.fromArray(P, f * 9); b.fromArray(P, f * 9 + 3); c.fromArray(P, f * 9 + 6);
    b.sub(a); c.sub(a); b.cross(c); // area weighted
    fn[f * 3] = b.x; fn[f * 3 + 1] = b.y; fn[f * 3 + 2] = b.z;
  }
  const key = (i) => `${Math.round(P[i * 3] * 2000)},${Math.round(P[i * 3 + 1] * 2000)},${Math.round(P[i * 3 + 2] * 2000)}`;
  const map = new Map();
  for (let v = 0; v < cnt * 3; v++) { const k = key(v); let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(v); }
  const N = new Float32Array(cnt * 9), cos = Math.cos(angle);
  const unit = (f, out) => { out.set(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]); const L = out.length(); return L > 0 ? out.divideScalar(L) : out; };
  const nf = new THREE.Vector3(), no = new THREE.Vector3(), acc = new THREE.Vector3();
  for (const list of map.values()) {
    for (const v of list) {
      const f = (v / 3) | 0;
      unit(f, nf); acc.set(0, 0, 0);
      for (const w of list) {
        const fo = (w / 3) | 0;
        if (unit(fo, no).dot(nf) >= cos) acc.x += fn[fo * 3], acc.y += fn[fo * 3 + 1], acc.z += fn[fo * 3 + 2];
      }
      if (acc.lengthSq() === 0) acc.copy(nf);
      acc.normalize();
      N[v * 3] = acc.x; N[v * 3 + 1] = acc.y; N[v * 3 + 2] = acc.z;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

// Keep only the triangles of one ExtrudeGeometry group (0 = flat caps, 1 = walls and bevels).
function extrudeGroup(geo, which) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const grp = g.groups.find((x) => x.materialIndex === which);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    if (a) out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
  }
  return out;
}

// Box with rounded edges and corners (radius r, s segments per 45 degrees).
function rbox(w, h, d, r, s = 3) {
  r = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const N = 2 * s + 1;
  const g = new THREE.BoxGeometry(w, h, d, N, N, N);
  const P = g.attributes.position, Nn = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], c = [0, 0, 0], inner = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    c[0] = P.getX(i); c[1] = P.getY(i); c[2] = P.getZ(i);
    for (let a = 0; a < 3; a++) {
      const hh = half[a], k = Math.round(((c[a] + hh) / (2 * hh)) * N);
      c[a] = k <= s ? -hh + (r * k) / s : hh - (r * (N - k)) / s;
    }
    inner.set(THREE.MathUtils.clamp(c[0], r - half[0], half[0] - r), THREE.MathUtils.clamp(c[1], r - half[1], half[1] - r), THREE.MathUtils.clamp(c[2], r - half[2], half[2] - r));
    n.set(c[0], c[1], c[2]).sub(inner).normalize();
    P.setXYZ(i, inner.x + n.x * r, inner.y + n.y * r, inner.z + n.z * r);
    Nn.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// Rounded-rectangle outline centred at (cx, cy).
function rrect(w, h, r, cx = 0, cy = 0, shape = new THREE.Shape()) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0); shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - r); shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x0 + r, y1); shape.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + r); shape.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}
const rrPath = (w, h, r, cx, cy) => rrect(w, h, r, cx, cy, new THREE.Path());

// Polygon (optionally with per-corner radius) as a Shape. pts: [[x, y, r?], ...]
function poly(pts, shape = new THREE.Shape()) {
  const n = pts.length;
  const P = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  for (let i = 0; i < n; i++) {
    const r = pts[i][2] || 0, p = P[i];
    if (!r) { i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y); continue; }
    const a = P[(i + n - 1) % n], b = P[(i + 1) % n];
    const da = a.clone().sub(p).normalize(), db = b.clone().sub(p).normalize();
    const half = Math.acos(THREE.MathUtils.clamp(da.dot(db), -1, 1)) / 2;
    const t = Math.min(r / Math.tan(half), a.distanceTo(p) * 0.49, b.distanceTo(p) * 0.49);
    const p0 = p.clone().addScaledVector(da, t), p1 = p.clone().addScaledVector(db, t);
    i === 0 ? shape.moveTo(p0.x, p0.y) : shape.lineTo(p0.x, p0.y);
    shape.quadraticCurveTo(p.x, p.y, p1.x, p1.y);
  }
  shape.closePath();
  return shape;
}

// Extrude a shape drawn in the (z, y) side plane across x, centred on x = 0, with rounded edges.
function prismX(shape, width, { bevel = 0.04, segs = 3, curve = 10, crease = 0.6 } = {}) {
  const bt = Math.min(bevel, width / 2 - 0.001);
  const depth = Math.max(0.001, width - 2 * bt);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return crease ? creased(g, crease) : g;
}
// Same, but the shape lies in the (x, y) front plane and is extruded along z (depth centred on z = 0).
function prismZ(shape, depth, { bevel = 0.02, segs = 2, curve = 10, crease = 0.6 } = {}) {
  const bt = Math.min(bevel, depth / 2 - 0.001);
  const d = Math.max(0.001, depth - 2 * bt);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: curve });
  g.translate(0, 0, -d / 2);
  return crease ? creased(g, crease) : g;
}
function flipWinding(geo, negate = true) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (negate && g.attributes.normal) { const a = g.attributes.normal.array; for (let i = 0; i < a.length; i++) a[i] = -a[i]; }
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = a.array[(i + 1) * n + k]; a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k]; a.array[(i + 2) * n + k] = t; }
  }
  return g;
}

// Thin slab from a shape drawn in a local (u, v) frame, placed with origin o and axes u, v; its
// thickness grows along u x v (outwards).
function slab(shape, thick, o, u, v, { bevel = 0.006, segs = 1 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, thick - 2 * Math.min(bevel, thick / 2.2)), bevelEnabled: bevel > 0, bevelThickness: Math.min(bevel, thick / 2.2), bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 8 });
  const U = new THREE.Vector3(...u).normalize(), V = new THREE.Vector3(...v).normalize(), W = U.clone().cross(V).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(U, V, W).setPosition(o[0], o[1], o[2]));
  return creased(g, 0.7);
}
// Flat shape (no thickness) in a (u, v) frame facing u x v.
function flat(shape, o, u, v, curve = 8) {
  const g = new THREE.ShapeGeometry(shape, curve);
  const U = new THREE.Vector3(...u).normalize(), V = new THREE.Vector3(...v).normalize(), W = U.clone().cross(V).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(U, V, W).setPosition(o[0], o[1], o[2]));
  return g;
}

// Remap a geometry's uv to 0..1 over its own extent (shape geometries carry raw shape coordinates).
function fitUV(geo) {
  const u = geo.attributes.uv;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < u.count; i++) { a = Math.min(a, u.getX(i)); b = Math.max(b, u.getX(i)); c = Math.min(c, u.getY(i)); d = Math.max(d, u.getY(i)); }
  for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) - a) / (b - a), (u.getY(i) - c) / (d - c));
  return geo;
}

// Cylinder along an axis ('x' | 'y' | 'z').
function cyl(r0, r1, len, axis = 'y', seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}
// Lathe of [radius, axial] points around an axis; axial runs along +axis.
function lathe(pts, axis = 'x', seg = 32) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}
// Tube through 3D points.
function tube(pts, r, seg = 24, rs = 8) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(c, seg, r, rs, false);
}
// Straight bar between two points.
function bar(a, b, r, rs = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), rs, 1, false);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// ---------------------------------------------------------------------------------------------------
// Kit: builders record parts per (node, material); instantiate() turns the record into meshes. The
// record holds only geometry and plain data, so it is cached per vehicle type.
// ---------------------------------------------------------------------------------------------------
class Kit {
  constructor() {
    this.nodes = [['chassis', 'group', [0, 0, 0], [0, 0, 0]]];
    this.parts = new Map();
    this.singles = [];
    this.wheelSets = {};
    this.wheels = [];
    this.lights = [];
    this.exhausts = [];
    this.trails = null;
  }
  node(name, parent, p = [0, 0, 0], r = [0, 0, 0]) { this.nodes.push([name, parent, p, r]); }
  add(mat, geo, node = 'chassis') {
    const k = node + '|' + mat;
    let l = this.parts.get(k);
    if (!l) this.parts.set(k, (l = []));
    l.push(geo);
    return geo;
  }
  one(mat, geo, opts = {}) { this.singles.push({ node: 'chassis', ...opts, mat, geo }); }
  wheel(set, p, side, steer = false) { this.wheels.push({ set, p, side, steer }); }
  light(opts) { this.lights.push(opts); }
  finish() {
    const merged = [];
    for (const [k, list] of this.parts) { const [node, mat] = k.split('|'); merged.push([node, mat, merge(list)]); }
    const wheelSets = {};
    for (const [name, parts] of Object.entries(this.wheelSets)) {
      const by = new Map();
      for (const [mat, geo] of parts) { if (!by.has(mat)) by.set(mat, []); by.get(mat).push(geo); }
      wheelSets[name] = [...by].map(([mat, l]) => [mat, merge(l)]);
    }
    return { nodes: this.nodes, merged, singles: this.singles, wheelSets, wheels: this.wheels, lights: this.lights, exhausts: this.exhausts, trails: this.trails };
  }
}

function instantiate(rec, M, typeId) {
  const group = new THREE.Group();
  const nodes = { group };
  for (const [name, parent, p, r] of rec.nodes) {
    const n = name === 'muzzle' ? new THREE.Object3D() : new THREE.Group();
    n.position.set(...p); n.rotation.set(...r); n.name = name;
    nodes[parent].add(n); nodes[name] = n;
  }
  const lightbarParts = { typeId, phaseAMeshes: [], phaseBMeshes: [], pointLight: null, towHookPivot: nodes.hook || null };
  for (const [node, mat, geo] of rec.merged) { const m = new THREE.Mesh(geo, M[mat]); m.name = mat; nodes[node].add(m); }
  for (const s of rec.singles) {
    // Strobe lenses get their own material: updateVehicleEffects recolours them every frame.
    const mat = s.phase ? new THREE.MeshBasicMaterial({ color: s.color }) : M[s.mat];
    const m = new THREE.Mesh(s.geo, mat);
    if (s.p) m.position.set(...s.p);
    nodes[s.node].add(m);
    if (s.phase === 'A') lightbarParts.phaseAMeshes.push(m);
    if (s.phase === 'B') lightbarParts.phaseBMeshes.push(m);
  }
  for (const l of rec.lights) {
    const pl = new THREE.PointLight(l.color, 0, l.dist, l.decay);
    pl.position.set(...l.p);
    nodes[l.node || 'chassis'].add(pl);
    lightbarParts.pointLight = pl;
  }
  const wheels = [], frontSteerPivots = [];
  for (const w of rec.wheels) {
    const pivot = new THREE.Group(), wheelMesh = new THREE.Group(), face = new THREE.Group();
    pivot.position.set(...w.p);
    if (w.side < 0) face.rotation.y = Math.PI;
    for (const [mat, geo] of rec.wheelSets[w.set]) face.add(new THREE.Mesh(geo, M[mat]));
    wheelMesh.add(face); pivot.add(wheelMesh); group.add(pivot);
    wheels.push(wheelMesh);
    if (w.steer) frontSteerPivots.push(pivot);
  }
  const noShadow = new Set([M.glass, M.interior, M.lens, M.dome]);
  group.traverse((o) => { if (o.isMesh && !noShadow.has(o.material) && !(o.material.transparent)) { o.castShadow = true; o.receiveShadow = true; } });
  const paintMeshes = [];
  nodes.chassis.traverse((o) => { if (o.isMesh && o.material === M.paint) paintMeshes.push(o); });
  return { group, nodes, chassis: nodes.chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts };
}

// ---------------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------------
const envd = (m) => { m.userData.envProbe = true; return m; };

// Paint whose colour is chosen per fragment by `body` (GLSL statements that may assign `col` from
// object-space position `lp`; `base` is the material colour, `alt` / `alt2` uniforms).
function liveryMaterial(params, key, body, alt = 0xffffff, alt2 = 0x000000) {
  const m = new THREE.MeshPhysicalMaterial(params);
  const uAlt = { value: new THREE.Color(alt) }, uAlt2 = { value: new THREE.Color(alt2) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAlt = uAlt; sh.uniforms.uAlt2 = uAlt2;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLp;
uniform vec3 uAlt; uniform vec3 uAlt2;
float band(float v, float a, float b) { float w = max(fwidth(v), 1e-4); return smoothstep(a - w, a + w, v) - smoothstep(b - w, b + w, v); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`).replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 lp = vLp; vec3 base = diffuseColor.rgb; vec3 col = base; vec3 alt = uAlt; vec3 alt2 = uAlt2;
${body}
diffuseColor.rgb = col; }`);
  };
  m.customProgramCacheKey = () => 'livery-' + key;
  m.userData.uAlt = uAlt;
  return envd(m);
}

const TEX = {};
function canvasTex(key, w, h, draw, srgb = true) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (TEX[key] = t);
}
// Dot-matrix LED destination sign.
function ledTexture(text, cols = 128) {
  return canvasTex('led-' + text, cols * 4, 64, (g, w, h) => {
    const src = document.createElement('canvas');
    src.width = cols; src.height = 16;
    const s = src.getContext('2d');
    s.fillStyle = '#000'; s.fillRect(0, 0, cols, 16);
    s.fillStyle = '#fff'; s.font = 'bold 13px Arial, Helvetica, sans-serif'; s.textBaseline = 'middle'; s.textAlign = 'center';
    s.fillText(text, cols / 2, 8.5);
    const d = s.getImageData(0, 0, cols, 16).data;
    g.fillStyle = '#050403'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = 0; x < cols; x++) {
      const on = d[(y * cols + x) * 4] > 90;
      g.fillStyle = on ? '#ffb020' : '#1a1206';
      g.beginPath(); g.arc(x * 4 + 2, y * 4 + 2, 1.5, 0, Math.PI * 2); g.fill();
    }
  });
}
// Lettering decal (transparent background).
function textTexture(text, color, { w = 512, h = 128, font = 'bold 84px Arial, Helvetica, sans-serif', mirror = false } = {}) {
  return canvasTex(`txt-${text}-${color}-${mirror}`, w, h, (g) => {
    g.clearRect(0, 0, w, h);
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}
// Streaky grain for brushed stainless steel (roughness map).
function brushedTexture() {
  return canvasTex('brushed', 512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = Math.random() * h, l = 40 + Math.random() * 260, x = Math.random() * w, v = 100 + Math.random() * 70;
      g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.lineWidth = 0.6 + Math.random();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 0.6); g.stroke();
    }
  }, false);
}

function heavyMaterials(spec) {
  const M = materials(spec);
  Object.assign(M, {
    black: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.85 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.55, metalness: 0.3 }),
    light: envd(new THREE.MeshPhysicalMaterial({ color: 0xe9ebee, roughness: 0.35, metalness: 0.1, clearcoat: 0.6 })),
    steel: envd(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35 })),
    amber: envd(new THREE.MeshPhysicalMaterial({ color: 0x9a5a00, roughness: 0.15, emissive: 0xff8a00, emissiveIntensity: 0.35, clearcoat: 1 })),
    lens: envd(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25, clearcoat: 1, depthWrite: false })),
    dome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.05, clearcoat: 1, depthWrite: false }),
    seatFab: new THREE.MeshStandardMaterial({ color: spec.seatFab ?? 0x2b3b63, roughness: 0.9 }),
    lining: new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.8 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xf4f7ff }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.45 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x2b2a28, metalness: 0.6, roughness: 0.7 }),
  });
  M.rim = envd(new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.75, roughness: 0.32 }));
  M.glass.side = THREE.DoubleSide;
  return M;
}

// ---------------------------------------------------------------------------------------------------
// Wheels (axis along x, outer face on +x; instantiate() turns left wheels round)
// ---------------------------------------------------------------------------------------------------
// Lathed tyre with sidewall bulge and three tread grooves; `lugs` adds off-road tread blocks.
function tyreGeo(R, tw, rimR, { lugs = 0, seg = 48 } = {}) {
  const h = tw / 2, g = 0.012;
  const prof = [[rimR * 0.99, -h * 0.82], [rimR + (R - rimR) * 0.35, -h * 1.0], [R - 0.05, -h * 0.98], [R - 0.012, -h * 0.9], [R, -h * 0.74],
    [R, -h * 0.42], [R - g, -h * 0.4], [R - g, -h * 0.3], [R, -h * 0.28], [R, -h * 0.06], [R - g, -h * 0.04], [R - g, h * 0.04], [R, h * 0.06],
    [R, h * 0.28], [R - g, h * 0.3], [R - g, h * 0.4], [R, h * 0.42], [R, h * 0.74], [R - 0.012, h * 0.9], [R - 0.05, h * 0.98], [rimR + (R - rimR) * 0.35, h * 1.0], [rimR * 0.99, h * 0.82]];
  const parts = [lathe(prof.map(([r, y]) => [r, -y]), 'x', seg)];
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    for (const sgn of [-1, 1]) {
      const off = (i % 2 ? 0.18 : 0.3) * sgn;
      const b = new THREE.BoxGeometry(tw * 0.34, 0.03, 0.09);
      xf(b, [off * tw, R + 0.008, 0], [0, 0, 0]);
      b.rotateX(a);
      parts.push(b);
      const sh = new THREE.BoxGeometry(0.05, 0.12, 0.07); // shoulder block running onto the sidewall
      xf(sh, [sgn * (h * 0.94), R - 0.06, 0], [0, 0, sgn * -0.25]);
      sh.rotateX(a + Math.PI / lugs);
      parts.push(sh);
    }
  }
  return parts.length > 1 ? merge(parts) : parts[0];
}

// Steel truck wheel: dished disc with hand holes, hub with lug nuts and cap. `dual` adds an inner twin.
function truckWheelSet({ R, tw, rimR, dual = 0, paint = 'light', lugs = 0, nuts = 10, holes = 8, hubDepth = 0.07, cover = null }) {
  const parts = [];
  const one = (x0, outer) => {
    parts.push(['tyre', xf(tyreGeo(R, tw, rimR, { lugs }), [x0, 0, 0])]);
    // rim barrel + flange lip
    parts.push(['rim', xf(cyl(rimR * 0.97, rimR * 0.97, tw * 0.9, 'x', 32, true), [x0, 0, 0])]);
    const lip = new THREE.TorusGeometry(rimR, 0.014, 6, 36); lip.rotateY(Math.PI / 2);
    parts.push(['rim', xf(lip, [x0 + tw * 0.44, 0, 0])]);
    if (!outer) return;
    const fx = x0 + tw * 0.32;
    // dished disc: lathe from barrel to hub
    parts.push([paint, lathe([[rimR * 0.97, fx - 0.03], [rimR * 0.82, fx - 0.005], [rimR * 0.6, fx + 0.006], [rimR * 0.44, fx + 0.02], [rimR * 0.4, fx + hubDepth * 0.3], [0.001, fx + hubDepth * 0.3]], 'x', 36)]);
    if (cover) { parts.push(...cover(fx)); return; }
    for (let i = 0; i < holes; i++) { // hand holes (dark ovals)
      const a = (i / holes) * Math.PI * 2, hr = rimR * 0.71;
      const c = new THREE.CircleGeometry(1, 16); c.scale(rimR * 0.075, rimR * 0.12, 1); c.rotateY(Math.PI / 2);
      c.rotateX(a); c.translate(fx + 0.004, Math.cos(a) * hr, Math.sin(a) * hr);
      parts.push(['rubber', c]);
    }
    // hub, nuts, cap
    parts.push(['hub', xf(cyl(rimR * 0.36, rimR * 0.3, hubDepth, 'x', 24), [fx + hubDepth * 0.3 + hubDepth / 2, 0, 0])]);
    const nr = rimR * 0.32 * 0.85;
    for (let i = 0; i < nuts; i++) {
      const a = (i / nuts) * Math.PI * 2;
      parts.push(['chrome', xf(cyl(0.017, 0.017, 0.035, 'x', 6), [fx + hubDepth * 0.3 + 0.015, Math.cos(a) * nr, Math.sin(a) * nr])]);
    }
    parts.push(['chrome', xf(lathe([[rimR * 0.2, 0], [rimR * 0.2, 0.03], [rimR * 0.15, 0.07], [0.001, 0.085]], 'x', 24), [fx + hubDepth * 0.3 + hubDepth, 0, 0])]);
  };
  if (dual) { one(dual / 2, true); one(-dual / 2, false); } else one(0, true);
  return parts;
}

// ---------------------------------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------------------------------
const SPECS = {};

// Stainless hub cap: shallow dome with a raised centre ring and eight bolt heads.
const busCap = (dome) => (fx) => {
  const out = [['chrome', xf(lathe([[0.275, 0], [0.272, 0.012], [0.24, dome * 0.5], [0.12, dome], [0.1, dome], [0.1, dome + 0.012], [0.07, dome + 0.016], [0.001, dome + 0.016]], 'x', 40), [fx, 0, 0])]];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.push(['grey', xf(cyl(0.012, 0.012, 0.012, 'x', 6), [fx + dome * 0.62, Math.cos(a) * 0.19, Math.sin(a) * 0.19])]); }
  return out;
};

// ===== City bus: 10.6 m two-axle low-floor, red skirt / white body, frameless bonded glazing ==========
SPECS.bus = {
  paint: 0xc8102e, paintMetal: 0.2, seatFab: 0x24365e,
  mats(M) {
    M.paint = liveryMaterial({ color: 0xc8102e, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }, 'bus', `
      float y = lp.y;
      float red = 1.0 - smoothstep(-fwidth(y), fwidth(y), y - (1.0 + max(0.0, -lp.z - 2.8) * 0.0));
      red = max(red, band(y, 2.86, 2.93));
      col = mix(alt, base, red);`, 0xf3f4f2);
    M.glass = envd(new THREE.MeshPhysicalMaterial({ color: 0x15232b, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.5, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false }));
    M.screen = envd(new THREE.MeshPhysicalMaterial({ color: 0x0b1218, metalness: 0.2, roughness: 0.03, transparent: true, opacity: 0.86, clearcoat: 1 }));
    M.sign = new THREE.MeshBasicMaterial({ map: ledTexture('42  CENTRAL') });
    M.sideSign = new THREE.MeshBasicMaterial({ map: ledTexture('42', 40) });
    M.pole = new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.35, metalness: 0.3 });
    M.hub = M.rim;
  },
  build(K) {
    const L = 10.6, hl = L / 2, W = 2.5, hw = W / 2, roof = 3.05, bot = 0.32;
    const fA = 2.95, rA = -2.2, aR = 0.64, aY = 0.48;
    // Side profile (z, y): low floor, near-vertical front with a big radius into the roof, arches cut out.
    const profile = (s) => {
      const asin = Math.asin((aY - bot) / aR);
      s.moveTo(hl - 0.16, bot);
      s.lineTo(fA + aR * Math.cos(asin), bot);
      s.absarc(fA, aY, aR, -asin, Math.PI + asin, false);
      s.lineTo(rA + aR * Math.cos(asin), bot);
      s.absarc(rA, aY, aR, -asin, Math.PI + asin, false);
      s.lineTo(-hl + 0.3, bot + 0.04);
      s.quadraticCurveTo(-hl, bot + 0.06, -hl, bot + 0.36);
      s.lineTo(-hl, roof - 0.24);
      s.quadraticCurveTo(-hl, roof, -hl + 0.26, roof);
      s.lineTo(hl - 0.5, roof);
      s.bezierCurveTo(hl - 0.18, roof, hl - 0.07, roof - 0.12, hl - 0.06, roof - 0.42);
      s.lineTo(hl, 1.0);
      s.quadraticCurveTo(hl + 0.01, bot, hl - 0.16, bot);
      return s;
    };
    const B = 0.09; // edge radius
    // Walls and bevels from the extrusion; the flat sides are replaced by panels with real window holes.
    K.add('paint', extrudeGroup(prismX(profile(new THREE.Shape()), W + 2 * B, { bevel: B, segs: 4, curve: 14, crease: 0.7 }), 1));
    const winB = 1.1, winT = 2.78;
    const doors = [[3.72, 4.96], [-0.62, 0.64]]; // right side: front door ahead of the axle, centre door
    const panesL = [[4.96, 3.7], [3.62, 2.32], [2.24, 0.94], [0.86, -0.44], [-0.52, -1.82], [-1.9, -3.2], [-3.28, -4.95]];
    const panesR = [[3.62, 2.2], [2.12, 0.74], [-0.72, -2.0], [-2.08, -3.36], [-3.44, -4.95]];
    for (const side of [-1, 1]) {
      const sh = profile(new THREE.Shape());
      const panes = side < 0 ? panesL : panesR;
      for (const [z1, z0] of panes) sh.holes.push(rrPath(z1 - z0, winT - winB, 0.07, (z0 + z1) / 2, (winB + winT) / 2));
      if (side > 0) for (const [z0, z1] of doors) sh.holes.push(rrPath(z1 - z0 - 0.06, 2.82 - 0.42, 0.06, (z0 + z1) / 2, (0.42 + 2.82) / 2));
      const x = side * hw, k = side > 0 ? -1 : 1; // side slabs: shape x = k * z so they grow outwards
      // outer skin, inner lining (seen through the windows)
      const skin = flat(sh, [x + side * 0.0005, 0, 0], [0, 0, 1], [0, 1, 0], 14);
      K.add('paint', side < 0 ? skin : flipWinding(skin));
      const inner = flat(sh, [x - side * 0.06, 0, 0], [0, 0, 1], [0, 1, 0], 14);
      K.add('lining', side < 0 ? flipWinding(inner) : inner);
      // window reveals: short tunnels from skin to lining
      const holes = [...panes.map(([z1, z0]) => [z0, z1, winB, winT])];
      if (side > 0) for (const [z0, z1] of doors) holes.push([z0 + 0.03, z1 - 0.03, 0.42, 2.82]);
      for (const [z0, z1, y0, y1] of holes) {
        const ring = rrect(z1 - z0, y1 - y0, 0.07, (z0 + z1) / 2, (y0 + y1) / 2);
        ring.holes.push(rrPath(z1 - z0 - 0.002, y1 - y0 - 0.002, 0.068, (z0 + z1) / 2, (y0 + y1) / 2));
        const t = new THREE.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: false, curveSegments: 8 });
        t.rotateY(-Math.PI / 2); t.translate(x + (side > 0 ? 0 : 0.06), 0, 0);
        K.add('black', t);
      }
      // bonded glazing: black frit border, glass panes flush with the skin
      for (const [z1, z0] of panes) {
        const zc = (z0 + z1) / 2, wz = z1 - z0, hy = winT - winB, yc = (winB + winT) / 2;
        const frame = rrect(wz + 0.07, hy + 0.07, 0.1, k * zc, yc);
        frame.holes.push(rrPath(wz - 0.1, hy - 0.1, 0.05, k * zc, yc));
        K.add('gloss', slab(frame, 0.012, [x, 0, 0], [0, 0, k], [0, 1, 0]));
        K.add('glass', slab(rrect(wz - 0.08, hy - 0.08, 0.05, k * zc, yc), 0.008, [x - side * 0.004, 0, 0], [0, 0, k], [0, 1, 0], { bevel: 0.003 }));
        // top hopper vent on alternate panes
        if (Math.round(zc * 10) % 3 === 0) K.add('gloss', slab(rrect(wz - 0.1, 0.035, 0.012, k * zc, winT - 0.42), 0.016, [x, 0, 0], [0, 0, k], [0, 1, 0]));
      }
    }
    // Doors (right side): two glazed leaves per opening, black frames, rubber seal, handrails inside
    for (const [z0, z1] of doors) {
      const zc = (z0 + z1) / 2, wz = (z1 - z0) / 2 - 0.05;
      for (const s of [-1, 1]) {
        const lz = zc + s * (wz / 2 + 0.01);
        const leaf = rrect(wz, 2.36, 0.05, -lz, 1.62);
        leaf.holes.push(rrPath(wz - 0.1, 2.16, 0.04, -lz, 1.66));
        K.add('gloss', slab(leaf, 0.03, [hw - 0.01, 0, 0], [0, 0, -1], [0, 1, 0]));
        K.add('glass', slab(rrect(wz - 0.1, 2.16, 0.04, -lz, 1.66), 0.008, [hw - 0.002, 0, 0], [0, 0, -1], [0, 1, 0], { bevel: 0.003 }));
        K.add('rubber', xf(rbox(0.02, 2.3, 0.03, 0.01, 1), [hw + 0.04, 1.62, zc]));
        K.add('chrome', bar([hw - 0.2, 0.5, zc + s * 0.35], [hw - 0.2, 2.6, zc + s * 0.35], 0.018));
      }
      K.add('amber', xf(rbox(0.03, 0.06, 0.12, 0.012, 1), [hw + 0.03, 2.95, zc]));
    }
    K.add('sideSign', fitUV(flat(rrect(0.4, 0.16, 0.01), [hw - 0.03, 2.45, 2.9], [0, 0, -1], [0, 1, 0])));
    K.add('black', xf(rbox(0.03, 0.2, 0.46, 0.02, 1), [hw - 0.05, 2.45, 2.9]));

    // Rubbing strip along the red/white break and wheel-arch rubber lips
    for (const s of [-1, 1]) {
      // split the strip around arches (and doors on the right)
      const cuts = [[fA - aR - 0.03, fA + aR + 0.03], [rA - aR - 0.03, rA + aR + 0.03], ...(s > 0 ? doors.map(([a0, a1]) => [a0 - 0.04, a1 + 0.04]) : [])].sort((p, q) => p[0] - q[0]);
      let z = -hl + 0.25;
      for (const [c0, c1] of [...cuts, [hl - 0.25, hl]]) {
        if (c0 - z > 0.05) K.add('black', xf(rbox(0.04, 0.05, c0 - z, 0.015, 1), [s * (hw + 0.012), 1.0, (z + c0) / 2]));
        z = Math.max(z, c1);
      }
      for (const az of [fA, rA]) {
        const lip = new THREE.TorusGeometry(aR + 0.02, 0.028, 6, 32, Math.PI * 1.08);
        lip.rotateZ(-Math.PI * 0.04); lip.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
        K.add('rubber', xf(lip, [s * (hw + 0.01), aY, az]));
        // wheel housing liner
        const liner = new THREE.CylinderGeometry(aR - 0.01, aR - 0.01, 0.5, 24, 1, true, -Math.PI / 2, Math.PI);
        liner.rotateZ(Math.PI / 2);
        K.add('under', flipWinding(xf(liner, [s * (hw - 0.25), aY, az])));
        K.add('under', xf(new THREE.PlaneGeometry(2 * aR, aR + 0.2), [s * (hw - 0.5), aY + (aR + 0.2) / 2 - 0.2, az], [0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]));
      }
      // amber side marker lamps along the skirt
      for (const mz of [4.4, 1.6, -0.9, -4.6]) K.add('amber', xf(rbox(0.02, 0.05, 0.1, 0.01, 1), [s * (hw + 0.012), 0.55, mz]));
    }

    // Interior: floor, ceiling with light strips, seat rows, yellow grab poles
    K.add('floor', xf(new THREE.PlaneGeometry(W - 0.14, L - 0.5), [0, 0.42, 0], [-Math.PI / 2, 0, 0]));
    K.add('lining', xf(new THREE.PlaneGeometry(W - 0.14, L - 0.5), [0, 2.92, 0], [Math.PI / 2, 0, 0]));
    K.add('lining', xf(new THREE.PlaneGeometry(W - 0.14, 2.6), [0, 1.7, -hl + 0.3]));
    K.add('lining', xf(new THREE.PlaneGeometry(W - 0.14, 2.6), [0, 1.7, hl - 0.4], [0, Math.PI, 0]));
    for (const s of [-1, 1]) K.add('lamp', xf(new THREE.PlaneGeometry(0.12, L - 1.2), [s * 0.62, 2.9, 0], [Math.PI / 2, 0, 0]));
    const seatAt = (x, z, face = 1) => {
      K.add('seatFab', xf(rbox(0.44, 0.1, 0.42, 0.04, 1), [x, 0.88, z]));
      K.add('seatFab', xf(rbox(0.44, 0.56, 0.08, 0.04, 1), [x, 1.2, z - face * 0.22], [face * -0.12, 0, 0]));
      K.add('grey', xf(rbox(0.42, 0.06, 0.08, 0.02, 1), [x, 1.5, z - face * 0.26]));
      K.add('grey', xf(rbox(0.3, 0.42, 0.3, 0.04, 1), [x, 0.62, z]));
    };
    for (let z = 2.2; z > -4.6; z -= 0.82) {
      if (z < 0.9 && z > -0.9) continue; // standing area opposite the centre door
      for (const x of [-0.98, -0.52]) seatAt(x, z);
      if (z < -1.0) for (const x of [0.52, 0.98]) seatAt(x, z);
    }
    for (const z of [3.9, 2.0, 0.7, -0.7, -2.2, -3.8]) {
      for (const x of [-0.28, 0.28]) K.add('pole', bar([x, 0.42, z], [x, 2.92, z], 0.018));
    }
    for (const x of [-0.3, 0.3]) K.add('pole', bar([x, 2.6, -4.6], [x, 2.6, 4.2], 0.016));
    // Driver: seat and dashboard behind the windscreen
    K.add('black', xf(rbox(2.2, 0.5, 0.5, 0.08, 2), [0, 1.0, hl - 0.45]));
    seatAt(-0.7, hl - 1.2);

    // Front: windscreen, destination display, lamps, bumper, wipers
    // The front face leans back 6 cm between y = 1.0 and the roof radius: glazing follows that plane.
    const lean = 0.06 / 1.63, fy = (y) => [0, y, hl + 0.004 - (y - 1.0) * lean];
    const FU = [1, 0, 0], FV = [0, 1, -lean];
    const ws = poly([[-1.16, 0.1, 0.12], [1.16, 0.1, 0.12], [1.15, 1.6, 0.1], [-1.15, 1.6, 0.1]]);
    K.add('gloss', slab(rrect(2.44, 1.94, 0.16, 0, 0.94), 0.01, fy(1.0), FU, FV));
    K.add('screen', slab(ws, 0.012, fy(1.0), FU, FV, { bevel: 0.004 }));
    K.add('rubber', slab(rrect(0.035, 1.46, 0.01, 0, 0.85), 0.02, fy(1.0), FU, FV));
    K.add('sign', fitUV(flat(rrect(1.9, 0.2, 0.02, 0, 1.75), fy(1.0).map((v, i) => v + (i === 2 ? 0.018 : 0)), FU, FV)));
    K.add('black', slab(rrect(2.1, 0.3, 0.05, 0, 1.75), 0.016, fy(1.0), FU, FV));
    const onFront = (x, y, d = 0) => { const p = fy(y); return [x, y, p[2] + d]; };
    for (const s of [-1, 1]) {
      // wiper arm + blade resting on the lower windscreen
      K.add('black', bar(onFront(s * 0.12, 1.16, 0.03), onFront(s * 0.86, 1.62, 0.03), 0.012));
      K.add('black', xf(rbox(0.02, 0.9, 0.02, 0.008, 1), onFront(s * 0.8, 1.6, 0.04), [0, 0, s * -0.55]));
      // headlamp cluster: gloss black housing, two projector lenses, DRL light guide, indicator
      K.add('gloss', slab(rrect(0.6, 0.24, 0.08, s * 0.86, 0.72), 0.03, [0, 0, hl - 0.012], [1, 0, 0], [0, 1, 0]));
      for (const dx of [0.08, 0.27]) {
        K.add('chrome', xf(lathe([[0.075, 0], [0.07, 0.012], [0.04, 0.008], [0.001, 0.004]], 'z', 24), [s * (0.6 + dx), 0.73, hl + 0.018]));
        K.add('head', xf(cyl(0.03, 0.03, 0.02, 'z', 16), [s * (0.6 + dx), 0.73, hl + 0.028]));
        K.add('lens', xf(cyl(0.074, 0.074, 0.012, 'z', 24), [s * (0.6 + dx), 0.73, hl + 0.034]));
      }
      K.add('drl', xf(rbox(0.5, 0.025, 0.02, 0.01, 1), [s * 0.86, 0.62, hl + 0.022]));
      K.add('amber', xf(rbox(0.12, 0.08, 0.02, 0.02, 1), [s * 1.06, 0.8, hl + 0.022]));
      // rabbit-ear mirrors on arms from the roof corner
      K.add('black', tube([[s * 1.12, 2.92, hl - 0.3], [s * 1.3, 2.98, hl - 0.02], [s * 1.38, 2.8, hl + 0.3], [s * 1.36, 2.52, hl + 0.4]], 0.025, 20, 8));
      K.add('black', xf(rbox(0.1, 0.42, 0.24, 0.05, 2), [s * 1.36, 2.3, hl + 0.42], [0, s * 0.35, 0]));
      K.add('chrome', xf(rbox(0.012, 0.36, 0.19, 0.03, 1), [s * 1.36 + 0.055 * Math.sin(-s * 0.35 + Math.PI) * 0 - s * 0.018, 2.3, hl + 0.37], [0, s * 0.35 + Math.PI / 2, 0]));
      K.add('gloss', xf(rbox(0.04, 0.3, 0.05, 0.02, 1), [s * (hw + 0.005), 2.1, hl - 0.2]));
    }
    // Bumper and lower grille
    K.add('black', xf(rbox(W + 0.02, 0.3, 0.2, 0.08, 3), [0, 0.46, hl - 0.04]));
    K.add('gloss', slab(rrect(1.2, 0.12, 0.04, 0, 0.98), 0.02, [0, 0, hl - 0.01], [1, 0, 0], [0, 1, 0]));
    for (let i = 0; i < 4; i++) K.add('chrome', xf(rbox(1.12, 0.008, 0.01, 0.003, 1), [0, 0.95 + i * 0.022, hl + 0.012]));
    K.add('plate', xf(rbox(0.52, 0.12, 0.01, 0.01, 1), [0, 0.45, hl + 0.07]));

    // Rear: high rear window, engine grille, tail lamp towers, bumper
    const rz = -hl;
    K.add('gloss', slab(rrect(2.2, 1.0, 0.12, 0, 2.2), 0.012, [0, 0, rz], [-1, 0, 0], [0, 1, 0]));
    K.add('screen', slab(rrect(2.0, 0.84, 0.08, 0, 2.22), 0.01, [0, 0, rz - 0.006], [-1, 0, 0], [0, 1, 0], { bevel: 0.003 }));
    K.add('black', slab(rrect(1.7, 0.7, 0.06, 0, 1.12), 0.02, [0, 0, rz], [-1, 0, 0], [0, 1, 0]));
    for (let i = 0; i < 9; i++) K.add('gloss', xf(rbox(1.6, 0.035, 0.04, 0.01, 1), [0, 0.84 + i * 0.07, rz - 0.03], [0.4, 0, 0]));
    for (const s of [-1, 1]) {
      K.add('gloss', slab(rrect(0.22, 1.08, 0.08, s * 1.04, 1.08), 0.03, [0, 0, rz], [-1, 0, 0], [0, 1, 0]));
      K.add('tail', xf(rbox(0.16, 0.5, 0.03, 0.04, 2), [s * 1.04, 1.32, rz - 0.03]));
      K.add('amber', xf(rbox(0.16, 0.16, 0.03, 0.03, 1), [s * 1.04, 0.92, rz - 0.03]));
      K.add('head', xf(rbox(0.16, 0.12, 0.03, 0.03, 1), [s * 1.04, 0.7, rz - 0.03]));
      K.add('tail', xf(rbox(0.12, 0.05, 0.02, 0.02, 1), [s * 0.6, 2.86, rz - 0.01]));
    }
    K.add('black', xf(rbox(W + 0.02, 0.3, 0.22, 0.08, 3), [0, 0.48, -hl + 0.06]));
    K.add('plate', xf(rbox(0.52, 0.12, 0.01, 0.01, 1), [0, 0.68, rz - 0.015]));

    // Roof: air-conditioning pod with fan grilles, escape hatches, rear equipment cover
    K.add('light', xf(rbox(2.0, 0.3, 2.9, 0.12, 3), [0, roof + 0.12, 0.9]));
    for (const dz of [-0.75, 0, 0.75]) {
      K.add('black', xf(cyl(0.24, 0.24, 0.02, 'y', 28), [0, roof + 0.275, 0.9 + dz]));
      for (let k = 0; k < 4; k++) K.add('grey', xf(rbox(0.46, 0.015, 0.03, 0.005, 1), [0, roof + 0.29, 0.9 + dz], [0, (k * Math.PI) / 4, 0]));
    }
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) K.add('grey', xf(rbox(0.012, 0.16, 0.3, 0.004, 1), [s * 1.0, roof + 0.12, 0.05 + i * 0.36]));
    K.add('light', xf(rbox(1.9, 0.36, 1.5, 0.14, 3), [0, roof + 0.14, -4.3]));
    for (const hz of [3.6, -2.0]) K.add('grey', xf(rbox(0.7, 0.06, 0.7, 0.05, 2), [0, roof + 0.02, hz]));

    // Underbody tray and axle hardware
    K.add('under', xf(new THREE.BoxGeometry(W - 0.3, 0.12, L - 0.8), [0, bot + 0.08, 0]));
    K.add('under', xf(new THREE.BoxGeometry(1.3, 0.3, 0.3), [0, 0.45, rA]));

    // Wheels: single front, twin rear
    K.wheelSets.front = truckWheelSet({ R: 0.48, tw: 0.28, rimR: 0.29, paint: 'light', holes: 0, cover: busCap(0.05) });
    K.wheelSets.rear = truckWheelSet({ R: 0.48, tw: 0.26, rimR: 0.29, dual: 0.29, paint: 'light', holes: 0, cover: busCap(0.025) });
    for (const s of [-1, 1]) {
      K.wheel('front', [s * 1.06, 0.48, fA], s, true);
      K.wheel('rear', [s * 0.92, 0.48, rA], s);
    }
    K.exhausts.push([-0.85, 0.65, -hl - 0.05], [0.85, 0.65, -hl - 0.05], [-0.95, 3.2, -hl], [0.95, 3.2, -hl]);
    K.trails = [[-1.2, 0.3, -hl - 0.05], [1.2, 0.3, -hl - 0.05]];
  },
};

// Faceted loft: half-rings (x >= 0, bottom centre -> top centre, counter-clockwise seen from the nose)
// at each station, mirrored, flat-shaded quads assigned a material by classify(segment, z0, z1, centre).
// Returns Map material -> geometry with uv = (z, y + 0.5 x) for brushed-metal grain.
function facetLoft(stations, ring, classify, { capFront = null, capRear = null } = {}) {
  const rings = stations.map((z) => ring(z));
  const out = new Map();
  const push = (key, a, b, c) => {
    if (!key) return;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) return;
    let o = out.get(key);
    if (!o) out.set(key, (o = { p: [], n: [], u: [] }));
    for (const v of [a, b, c]) { o.p.push(v[0], v[1], v[2]); o.n.push(nx / L, ny / L, nz / L); o.u.push(v[2], v[1] + 0.5 * v[0]); }
  };
  const c = new THREE.Vector3();
  for (let i = 0; i < stations.length - 1; i++) {
    const z0 = stations[i], z1 = stations[i + 1], r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < r0.length - 1; j++) {
      for (const s of [1, -1]) {
        const a = [s * r0[j][0], r0[j][1], z0], b = [s * r0[j + 1][0], r0[j + 1][1], z0], cc = [s * r1[j][0], r1[j][1], z1], d = [s * r1[j + 1][0], r1[j + 1][1], z1];
        c.set((a[0] + b[0] + cc[0] + d[0]) / 4, (a[1] + b[1] + cc[1] + d[1]) / 4, (z0 + z1) / 2);
        const key = classify(j, z0, z1, c);
        if (s > 0) { push(key, a, b, cc); push(key, b, d, cc); } else { push(key, a, cc, b); push(key, b, cc, d); }
      }
    }
  }
  // End caps: fan around the ring centroid.
  for (const [idx, key, dir] of [[stations.length - 1, capFront, 1], [0, capRear, -1]]) {
    if (!key) continue;
    const r = rings[idx], z = stations[idx];
    const full = [...r.map(([x, y]) => [x, y]), ...r.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const cy = full.reduce((t, p) => t + p[1], 0) / full.length;
    for (let k = 0; k < full.length; k++) {
      const p = full[k], q = full[(k + 1) % full.length];
      if (dir > 0) push(key, [0, cy, z], [p[0], p[1], z], [q[0], q[1], z]);
      else push(key, [0, cy, z], [q[0], q[1], z], [p[0], p[1], z]);
    }
  }
  const geos = new Map();
  for (const [k, o] of out) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    geos.set(k, g);
  }
  return geos;
}
const lin = (keys) => (x) => {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) if (x <= keys[i + 1][0]) return keys[i][1] + ((keys[i + 1][1] - keys[i][1]) * (x - keys[i][0])) / (keys[i + 1][0] - keys[i][0]);
  return keys[keys.length - 1][1];
};

// ===== Cybertruck: flat stainless panels, single-crease side, triangular roof, vault bed ===============
SPECS.cybertruck = {
  paint: 0xc4c9ce,
  mats(M) {
    const rough = brushedTexture();
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.repeat.set(0.7, 0.7);
    M.paint = envd(new THREE.MeshPhysicalMaterial({ color: 0xc9cdd1, metalness: 0.82, roughness: 0.5, roughnessMap: rough, anisotropy: 0.8, envMapIntensity: 0.75 }));
    M.glass = envd(new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.3, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02 }));
    M.tonneau = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, metalness: 0.5, roughness: 0.5 });
    M.plastic = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.82 });
    M.hub = M.plastic;
  },
  build(K) {
    const W = 1.02, hl = 2.84;
    const fA = 1.9, rA = -1.91;
    const top = lin([[-hl, 1.2], [0.2, 1.79], [1.3, 1.3], [hl, 1.1]]);
    const bot = lin([[-hl, 0.5], [-2.55, 0.46], [2.5, 0.45], [2.78, 0.64], [hl, 0.98]]);
    const belt = 1.1;
    const arch = (z) => {
      let y = 0;
      for (const a of [fA, rA]) {
        const d = Math.abs(z - a);
        if (d < 0.36) y = Math.max(y, 0.99);
        else if (d < 0.66) y = Math.max(y, 0.99 - ((d - 0.36) / 0.3) * 0.54);
      }
      return y;
    };
    const ring = (z) => {
      const b = bot(z), t = Math.max(top(z), belt), yA = Math.max(b, arch(z));
      const xT = Math.max(0.55, W - 0.58 * (t - belt));
      const up = (k) => [W + (xT - W) * k, belt + (t - belt) * k];
      return [[0, b], [0.66, b], [0.66, yA], [W - 0.045, yA], [W, Math.min(belt, yA + 0.045)], [W, belt], up(0.07), up(0.93), [xT, t], [xT * 0.86, t], [0, t]];
    };
    const zs = new Set([-hl, -2.55, 0.2, 1.3, 2.5, 2.78, hl, -0.85, -0.8, 0.12, 0.28, 1.15, 0.06, -0.06, -0.92, 1.36, 1.39, -2.0]);
    for (const a of [fA, rA]) for (const d of [-0.66, -0.36, 0.36, 0.66]) zs.add(+(a + d).toFixed(4));
    const gaps = [1.24, 0.0, -1.0];
    for (const g of gaps) for (const o of [-0.005, 0.005]) zs.add(+(g + o).toFixed(4));
    for (let z = -hl; z < hl; z += 0.25) zs.add(+z.toFixed(4));
    const stations = [...zs].filter((z) => z >= -hl && z <= hl).sort((a, b) => a - b);
    const winF = [1.15, 0.06], winR = [-0.06, -0.92];
    const parts = facetLoft(stations, ring, (j, z0, z1, c) => {
      const zm = (z0 + z1) / 2, inGap = gaps.some((g) => Math.abs(zm - g) < 0.006);
      if (j === 0) return zm > 2.5 ? 'paint' : 'under';
      if (j === 1 || j === 2) return 'plastic';
      if (j === 3) return arch(zm) > bot(zm) + 0.01 ? 'plastic' : 'paint';
      if (j >= 4 && j <= 7 && inGap && zm > -1.1) return 'under';
      if (j === 6 && ((zm < winF[0] && zm > winF[1]) || (zm < winR[0] && zm > winR[1]))) return 'glass';
      if (j === 9) {
        if (zm < 1.3 && zm > -0.82 && !(zm > 0.12 && zm < 0.28)) return 'glass';
        if (zm < -0.85) return 'tonneau';
        if (Math.abs(zm - 1.375) < 0.016) return 'under'; // frunk lid gap
      }
      return 'paint';
    }, { capFront: 'paint', capRear: 'paint' });
    for (const [k, g] of parts) K.add(k, g);

    // Light bars: full-width white strip across the nose, red bar across the tailgate
    K.add('drl', xf(rbox(2.0, 0.035, 0.02, 0.008, 1), [0, 1.055, hl + 0.004]));
    K.add('gloss', xf(rbox(2.04, 0.08, 0.02, 0.01, 1), [0, 1.04, hl - 0.002]));
    K.add('tail', xf(rbox(1.96, 0.04, 0.02, 0.008, 1), [0, 1.155, -hl - 0.006]));
    K.add('gloss', xf(rbox(2.0, 0.08, 0.02, 0.01, 1), [0, 1.155, -hl - 0.002]));
    for (const s of [-1, 1]) K.add('tail', xf(rbox(0.02, 0.08, 0.04, 0.008, 1), [s * (W - 0.01), 1.15, -hl + 0.01]));
    // Tailgate seam and lower bumpers with tow points
    K.add('under', xf(new THREE.BoxGeometry(2.0, 0.008, 0.01), [0, 1.08, -hl - 0.004]));
    K.add('plastic', xf(rbox(2.02, 0.2, 0.26, 0.04, 2), [0, 0.5, -hl + 0.06]));
    K.add('plastic', xf(rbox(1.84, 0.1, 0.3, 0.03, 2), [0, 0.47, 2.56], [-0.6, 0, 0]));
    for (const s of [-1, 1]) K.add('steel', xf(rbox(0.08, 0.06, 0.08, 0.02, 1), [s * 0.5, 0.48, 2.78]));
    // Black arch flares: polygon band around each hexagonal arch
    for (const a of [fA, rA]) {
      const outer = [[a - 0.76, 0.42], [a - 0.42, 1.07], [a + 0.42, 1.07], [a + 0.76, 0.42], [a + 0.66, 0.42], [a + 0.36, 0.99], [a - 0.36, 0.99], [a - 0.66, 0.42]];
      const band = prismX(poly(outer.map(([z, y]) => [z, y])), 0.08, { bevel: 0.012, segs: 1, crease: 0.5 });
      for (const s of [-1, 1]) K.add('plastic', xf(band.clone(), [s * (W + 0.025), 0, 0]));
    }
    // Interior behind the glass: dark tub, seats, dash and a square yoke
    K.add('interior', xf(new THREE.BoxGeometry(1.86, 0.9, 2.3), [0, 1.0, 0.15]));
    for (const [x, z] of [[-0.42, 0.45], [0.42, 0.45]]) {
      K.add('seat', xf(rbox(0.52, 0.12, 0.5, 0.05, 2), [x, 0.82, z]));
      K.add('seat', xf(rbox(0.52, 0.66, 0.12, 0.05, 2), [x, 1.16, z - 0.26], [-0.2, 0, 0]));
    }
    K.add('seat', xf(rbox(1.5, 0.12, 0.5, 0.05, 2), [0, 0.82, -0.55]));
    K.add('seat', xf(rbox(1.5, 0.6, 0.12, 0.05, 2), [0, 1.14, -0.82], [-0.25, 0, 0]));
    K.add('black', xf(rbox(1.8, 0.12, 0.45, 0.04, 2), [0, 1.18, 1.05], [0.25, 0, 0]));
    K.add('lamp', xf(rbox(0.42, 0.25, 0.012, 0.01, 1), [0, 1.33, 0.98], [-0.35, 0, 0]));
    K.add('black', xf(rbox(0.34, 0.2, 0.03, 0.03, 2), [-0.42, 1.24, 0.85], [-0.35, 0, 0]));
    // One long windscreen wiper parked at the base of the glass
    K.add('black', xf(rbox(1.55, 0.018, 0.03, 0.008, 1), [-0.05, 1.32, 1.26], [-0.42, 0, 0.02]));
    // Small camera-style mirrors at the A-pillar base
    for (const s of [-1, 1]) {
      K.add('paint', xf(rbox(0.06, 0.08, 0.16, 0.015, 1), [s * 0.98, 1.24, 1.12]));
      K.add('paint', xf(rbox(0.2, 0.12, 0.14, 0.02, 2), [s * 1.1, 1.26, 1.06], [0, s * 0.12, 0]));
      K.add('chrome', xf(rbox(0.16, 0.09, 0.005, 0.01, 1), [s * 1.11, 1.26, 0.988], [0, s * 0.12, 0]));
    }
    // Tonneau slats
    for (let z = -0.95; z > -2.8; z -= 0.14) K.add('under', xf(new THREE.BoxGeometry(1.4, 0.006, 0.014), [0, top(z) + 0.004, z], [Math.atan(0.58 / 3.04), 0, 0]));

    // Wheels: 35-inch all-terrain tyres on flat hexagonal aero covers
    const cover = (fx) => {
      const out = [['plastic', xf(cyl(0.255, 0.255, 0.02, 'x', 6), [fx + 0.01, 0, 0], [Math.PI / 6, 0, 0])]];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        out.push(['grey', xf(rbox(0.012, 0.2, 0.025, 0.006, 1), [fx + 0.024, Math.cos(a) * 0.12, Math.sin(a) * 0.12], [a, 0, 0])]);
      }
      out.push(['steel', xf(cyl(0.05, 0.05, 0.02, 'x', 6), [fx + 0.03, 0, 0])]);
      return out;
    };
    K.wheelSets.w = truckWheelSet({ R: 0.445, tw: 0.3, rimR: 0.26, lugs: 34, cover });
    for (const s of [-1, 1]) { K.wheel('w', [s * 0.87, 0.445, fA], s, true); K.wheel('w', [s * 0.87, 0.445, rA], s); }
    K.exhausts.push([-0.62, 0.5, -hl - 0.05], [0.62, 0.5, -hl - 0.05]);
    K.trails = [[-0.96, 1.15, -hl - 0.05], [0.96, 1.15, -hl - 0.05]];
  },
};

// Side profile with wheel arches cut out of the bottom edge (z runs rear -> front along `pts`, which
// trace the upper outline from the rear-bottom corner to the front-bottom corner).
function archedProfile(pts, bottom, arches) {
  const s = new THREE.Shape();
  poly(pts, s);
  // poly() closes front-bottom -> rear-bottom with a straight line; rebuild that edge with arches.
  s.curves.pop();
  const last = pts[pts.length - 1], first = pts[0];
  let cur = last[0];
  for (const a of [...arches].sort((p, q) => q.z - p.z)) {
    const as = Math.asin(THREE.MathUtils.clamp((a.y - bottom) / a.r, -1, 1));
    s.lineTo(a.z + a.r * Math.cos(as), bottom);
    s.absarc(a.z, a.y, a.r, -as, Math.PI + as, false);
    cur = a.z - a.r;
  }
  s.lineTo(first[0], first[1]);
  return s;
}
// Strobe lens: its own mesh so updateVehicleEffects can recolour and pulse it.
function strobe(K, phase, geo, p, color) { K.one(null, geo, { phase, p, color }); }

// ===== Ambulance: van cab + paramedic box body, Battenburg sides, red/white strobes ====================
SPECS.ambulance = {
  paint: 0xf5f6f7, seatFab: 0x2a2d33,
  mats(M) {
    M.paint = liveryMaterial({ color: 0xf5f6f7, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }, 'ambulance', `
      float side = step(1.0, abs(lp.x));
      float waist = band(lp.y, 1.0, 1.3) * step(0.965, abs(lp.x)) * step(-3.03, lp.z);
      float chq = mod(floor((lp.z + 3.05) / 0.3) + floor((lp.y - 1.02) / 0.3), 2.0);
      float boxSide = side * step(lp.z, 0.86) * band(lp.y, 1.02, 1.62) * chq;
      float topBand = step(lp.z, 0.86) * band(lp.y, 2.42, 2.52);
      float rear = step(lp.z, -3.035) * step(lp.y, 1.66) * step(0.5, fract((abs(lp.x) + lp.y) * 2.2));
      float red = max(max(waist * (1.0 - step(lp.z, 0.86) * side * band(lp.y, 1.02, 1.62)), boxSide), max(topBand, rear));
      col = mix(base, alt, red);`, 0xc8101e);
    M.frost = envd(new THREE.MeshPhysicalMaterial({ color: 0xc9d0d6, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.85, clearcoat: 1 }));
    M.word = new THREE.MeshBasicMaterial({ map: textTexture('AMBULANCE', '#c8101e', { w: 1024, h: 160, font: 'bold 120px Arial, Helvetica, sans-serif' }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    M.wordM = new THREE.MeshBasicMaterial({ map: textTexture('AMBULANCE', '#c8101e', { w: 1024, h: 160, font: 'bold 120px Arial, Helvetica, sans-serif', mirror: true }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    M.hub = M.grey;
  },
  build(K) {
    const hl = 3.05, fA = 1.98, rA = -1.78, R = 0.37;
    // Cab: short sloping bonnet, raked windscreen, roof tucked under the box overhang
    const cab = archedProfile([[0.7, 0.4], [0.7, 2.34], [1.22, 2.36, 0.1], [1.56, 2.26, 0.12], [2.36, 1.2, 0.18], [2.98, 1.06, 0.12], [3.06, 0.8, 0.08], [3.03, 0.4, 0.05]], 0.4, [{ z: fA, y: 0.42, r: 0.5 }]);
    K.add('paint', prismX(cab, 2.02, { bevel: 0.1, segs: 4, crease: 0.7 }));
    // Box body with the rear arch
    const box = archedProfile([[-hl, 0.58], [-hl, 2.7, 0.06], [0.86, 2.7, 0.06], [0.86, 0.62]], 0.58, [{ z: rA, y: 0.4, r: 0.5 }]);
    K.add('paint', prismX(box, 2.26, { bevel: 0.05, segs: 3, crease: 0.7 }));
    // Cab glazing: windscreen on the windscreen plane, door windows with a slanted front edge
    const wsO = [0, 1.24, 2.33], wsTop = [0, 2.24, 1.6];
    const wsV = [0, wsTop[1] - wsO[1], wsTop[2] - wsO[2]], wsL = Math.hypot(wsV[1], wsV[2]);
    K.add('gloss', slab(rrect(1.92, wsL + 0.02, 0.1, 0, wsL / 2), 0.01, [0, wsO[1] + 0.012, wsO[2] + 0.01], [1, 0, 0], wsV));
    K.add('glass', slab(rrect(1.78, wsL - 0.1, 0.08, 0, wsL / 2), 0.012, [0, wsO[1] + 0.014, wsO[2] + 0.014], [1, 0, 0], wsV, { bevel: 0.004 }));
    for (const s of [-1, 1]) {
      const k = s > 0 ? -1 : 1; // side slabs: shape x = k * z, u = k z-axis, so the slab grows outwards
      const win = poly([[0.95, 1.36, 0.04], [1.95, 1.36, 0.04], [2.06, 1.42, 0.03], [1.52, 2.1, 0.06], [0.95, 2.1, 0.06]].map(([z, y, r]) => [k * z, y, r]));
      K.add('glass', slab(win, 0.01, [s * 1.006, 0, 0], [0, 0, k], [0, 1, 0], { bevel: 0.003 }));
      K.add('gloss', slab(poly([[0.9, 1.32, 0.05], [1.98, 1.32, 0.05], [2.13, 1.38, 0.04], [1.56, 2.15, 0.07], [0.9, 2.15, 0.07]].map(([z, y, r]) => [k * z, y, r])), 0.008, [s * 1.0, 0, 0], [0, 0, k], [0, 1, 0]));
      // door shut lines, handle, mirror on a tubular arm
      for (const gz of [0.92, 2.04]) K.add('under', xf(new THREE.BoxGeometry(0.006, 1.0, 0.008), [s * 1.012, 0.88, gz]));
      K.add('black', xf(rbox(0.03, 0.04, 0.2, 0.015, 1), [s * 1.02, 1.22, 1.1]));
      K.add('black', tube([[s * 0.98, 1.5, 2.2], [s * 1.18, 1.55, 2.25], [s * 1.26, 1.62, 2.22]], 0.02, 10, 6));
      K.add('black', xf(rbox(0.08, 0.42, 0.24, 0.04, 2), [s * 1.3, 1.78, 2.2], [0, s * 0.15, 0]));
      K.add('chrome', xf(rbox(0.01, 0.36, 0.19, 0.03, 1), [s * 1.3, 1.78, 2.07], [0, s * 0.15 + Math.PI / 2, 0]));
      // swept headlamp, DRL guide, indicator, fog lamp
      K.add('gloss', slab(poly([[0.5, 0.86, 0.04], [0.98, 0.86, 0.04], [0.98, 1.02, 0.04], [0.62, 1.04, 0.04]]), 0.03, [0, 0, 3.035], s > 0 ? [1, 0, 0] : [-1, 0, 0], [0, 1, 0]).applyMatrix4(s > 0 ? new THREE.Matrix4() : new THREE.Matrix4().makeScale(1, 1, 1)));
      K.add('head', xf(cyl(0.065, 0.065, 0.02, 'z', 20), [s * 0.78, 0.95, 3.07]));
      K.add('lens', xf(rbox(0.46, 0.15, 0.02, 0.04, 1), [s * 0.75, 0.95, 3.075]));
      K.add('drl', xf(rbox(0.36, 0.014, 0.012, 0.005, 1), [s * 0.74, 0.885, 3.08]));
      K.add('amber', xf(rbox(0.1, 0.06, 0.02, 0.02, 1), [s * 0.92, 0.95, 3.065]));
      K.add('head', xf(cyl(0.04, 0.04, 0.02, 'z', 16), [s * 0.72, 0.52, 3.09]));
    }
    // Grille with chrome slats, bumper, plate, bonnet lettering (mirrored for mirrors ahead)
    K.add('gloss', slab(rrect(0.86, 0.26, 0.05, 0, 0.92), 0.03, [0, 0, 3.045], [1, 0, 0], [0, 1, 0]));
    for (const y of [0.85, 0.92, 0.99]) K.add('chrome', xf(rbox(0.8, 0.018, 0.02, 0.008, 1), [0, y, 3.08]));
    K.add('grey', xf(rbox(2.06, 0.3, 0.24, 0.08, 3), [0, 0.55, 2.98]));
    K.add('black', xf(rbox(1.2, 0.08, 0.04, 0.02, 1), [0, 0.47, 3.1]));
    K.add('plate', xf(rbox(0.52, 0.12, 0.01, 0.01, 1), [0, 0.62, 3.105]));
    const hoodU = [0, 1.06 - 1.2, 2.98 - 2.36], hoodL = Math.hypot(hoodU[1], hoodU[2]);
    K.add('wordM', fitUV(flat(rrect(1.3, 0.2, 0.01, 0, 0), [0, 1.08 + 0.015 + 0.2 * 0.14 / hoodL, 2.85 - 0.2 * 0.62 / hoodL], [1, 0, 0], [0, -hoodU[1], -hoodU[2]])));

    // Box details: windows, side door, lockers, floodlights, lettering, rear doors
    for (const s of [-1, 1]) {
      const x = s * 1.13;
      K.add('frost', slab(rrect(0.7, 0.42, 0.05, 0, 0), 0.01, [x, 2.0, s > 0 ? -1.05 : 0.15], [0, 0, -s], [0, 1, 0]));
      K.add('gloss', slab(rrect(0.78, 0.5, 0.07, 0, 0), 0.006, [x, 2.0, s > 0 ? -1.05 : 0.15], [0, 0, -s], [0, 1, 0]));
      K.add('word', fitUV(flat(rrect(1.9, 0.3, 0.01), [x + s * 0.008, 1.85, -1.45], [0, 0, -s], [0, 1, 0])));
      K.add('lamp', xf(rbox(0.02, 0.1, 0.3, 0.02, 1), [x + s * 0.01, 2.3, -2.5]));
      K.add('black', xf(rbox(0.03, 0.14, 0.36, 0.03, 1), [x + s * 0.002, 2.3, -2.5]));
      // under-box lockers between the axles
      K.add('grey', xf(rbox(0.06, 0.34, 1.2, 0.03, 2), [s * 1.08, 0.5, -0.4]));
      for (const lz of [-0.4]) K.add('under', xf(new THREE.BoxGeometry(0.008, 0.3, 0.01), [s * 1.112, 0.5, lz]));
    }
    // Right side sliding door (gap outline + handle + grab rail) and step
    const dz0 = -0.6, dz1 = 0.5;
    for (const z of [dz0, dz1]) K.add('under', xf(new THREE.BoxGeometry(0.008, 1.95, 0.01), [1.131, 1.6, z]));
    K.add('under', xf(new THREE.BoxGeometry(0.008, 0.01, dz1 - dz0), [1.131, 2.57, (dz0 + dz1) / 2]));
    K.add('black', xf(rbox(0.03, 0.05, 0.22, 0.02, 1), [1.14, 1.5, dz0 + 0.12]));
    K.add('black', xf(rbox(0.36, 0.06, 1.0, 0.03, 2), [1.0, 0.42, -0.05]));
    // Left side compartment doors
    for (const [z0, z1] of [[-2.9, -2.05], [0.1, 0.8]]) {
      for (const z of [z0, z1]) K.add('under', xf(new THREE.BoxGeometry(0.008, 1.35, 0.01), [-1.131, 1.35, z]));
      for (const y of [0.675, 2.025]) K.add('under', xf(new THREE.BoxGeometry(0.008, 0.01, z1 - z0), [-1.131, y, (z0 + z1) / 2]));
      K.add('chrome', xf(rbox(0.03, 0.12, 0.05, 0.015, 1), [-1.14, 1.35, z1 - 0.1]));
    }
    // Rear: twin doors with windows, hinges, handles, step bumper, lamp towers
    const rz = -hl;
    K.add('under', xf(new THREE.BoxGeometry(0.01, 2.0, 0.008), [0, 1.62, rz - 0.003]));
    for (const s of [-1, 1]) {
      K.add('glass', slab(rrect(0.66, 0.5, 0.05, 0, 0), 0.01, [s * 0.5, 2.05, rz], [-1, 0, 0], [0, 1, 0]));
      K.add('gloss', slab(rrect(0.74, 0.58, 0.07, 0, 0), 0.006, [s * 0.5, 2.05, rz], [-1, 0, 0], [0, 1, 0]));
      for (const hy of [0.95, 1.6, 2.3]) K.add('black', xf(rbox(0.06, 0.1, 0.04, 0.01, 1), [s * 1.06, hy, rz - 0.015]));
      K.add('tail', xf(rbox(0.13, 0.3, 0.03, 0.03, 2), [s * 1.02, 1.0, rz - 0.02]));
      K.add('amber', xf(rbox(0.13, 0.11, 0.03, 0.02, 1), [s * 1.02, 0.78, rz - 0.02]));
      K.add('head', xf(rbox(0.13, 0.08, 0.03, 0.02, 1), [s * 1.02, 0.66, rz - 0.02]));
    }
    K.add('chrome', xf(rbox(0.04, 0.16, 0.04, 0.015, 1), [0.12, 1.45, rz - 0.02]));
    K.add('black', xf(rbox(2.1, 0.12, 0.34, 0.03, 2), [0, 0.5, rz - 0.1]));
    for (let i = 0; i < 6; i++) K.add('grey', xf(new THREE.BoxGeometry(1.9, 0.012, 0.02), [0, 0.565, rz - 0.22 + i * 0.045]));
    K.add('plate', xf(rbox(0.52, 0.12, 0.01, 0.01, 1), [0, 0.68, rz - 0.01]));
    // Roof: air conditioning unit, vent, antennas
    K.add('light', xf(rbox(0.9, 0.18, 1.0, 0.06, 2), [0, 2.79, -1.4]));
    K.add('black', xf(rbox(0.7, 0.02, 0.8, 0.02, 1), [0, 2.88, -1.4]));
    K.add('grey', xf(rbox(0.4, 0.08, 0.4, 0.04, 2), [0, 2.74, -2.5]));
    for (const ax of [-0.4, 0.4]) K.add('black', xf(cyl(0.006, 0.01, 0.3, 'y', 6), [ax, 2.85, 0.2]));
    // Underbody, cab interior
    K.add('under', xf(new THREE.BoxGeometry(1.5, 0.2, 5.4), [0, 0.5, 0]));
    K.add('interior', xf(new THREE.BoxGeometry(1.9, 1.1, 1.3), [0, 1.65, 1.45]));
    for (const x of [-0.45, 0.45]) {
      K.add('seat', xf(rbox(0.5, 0.12, 0.5, 0.05, 2), [x, 1.2, 1.2]));
      K.add('seat', xf(rbox(0.5, 0.7, 0.12, 0.05, 2), [x, 1.6, 0.96], [-0.15, 0, 0]));
    }
    K.add('black', xf(rbox(1.9, 0.25, 0.4, 0.06, 2), [0, 1.35, 2.05]));

    // Emergency lighting: front light bar on the box brow, corner beacons, side and rear flashers, grille
    // flashers. Phase A pulses red, phase B white.
    K.add('black', xf(rbox(1.7, 0.07, 0.34, 0.03, 2), [0, 2.735, 0.6]));
    K.add('dome', xf(rbox(1.66, 0.12, 0.3, 0.05, 3), [0, 2.82, 0.6]));
    for (let i = 0; i < 6; i++) {
      const x = -0.68 + i * 0.272, ph = i === 2 || i === 3 ? 'B' : 'A';
      strobe(K, ph, rbox(0.24, 0.08, 0.24, 0.02, 1), [x, 2.8, 0.6], ph === 'A' ? 0xff1122 : 0xffffff);
    }
    for (const s of [-1, 1]) {
      strobe(K, 'A', rbox(0.06, 0.14, 0.22, 0.02, 1), [s * 1.14, 2.6, 0.7], 0xff1122);
      strobe(K, s > 0 ? 'A' : 'B', rbox(0.06, 0.14, 0.22, 0.02, 1), [s * 1.14, 2.6, -0.9], s > 0 ? 0xff1122 : 0xffffff);
      strobe(K, s > 0 ? 'B' : 'A', rbox(0.06, 0.14, 0.22, 0.02, 1), [s * 1.14, 2.6, -2.85], 0xff1122);
      strobe(K, s > 0 ? 'A' : 'B', rbox(0.22, 0.14, 0.05, 0.02, 1), [s * 0.95, 2.6, -hl - 0.015], 0xff1122);
      strobe(K, s > 0 ? 'B' : 'A', rbox(0.22, 0.14, 0.05, 0.02, 1), [s * 0.95, 2.6, 0.87], 0xffffff);
      strobe(K, s > 0 ? 'A' : 'B', rbox(0.12, 0.05, 0.02, 0.015, 1), [s * 0.28, 0.98, 3.09], 0xff1122);
      strobe(K, s > 0 ? 'B' : 'A', rbox(0.04, 0.12, 0.08, 0.015, 1), [s * 1.05, 0.95, 2.62], 0xff1122);
    }
    K.light({ color: 0xff1e2e, dist: 26, decay: 1.5, p: [0, 3.05, 0.2] });

    // Wheels: single front, twin rear, steel rims with hub caps
    const cap = (fx) => [['grey', xf(lathe([[0.2, 0], [0.19, 0.02], [0.08, 0.05], [0.001, 0.055]], 'x', 28), [fx, 0, 0])]];
    K.wheelSets.front = truckWheelSet({ R, tw: 0.24, rimR: 0.21, cover: cap });
    K.wheelSets.rear = truckWheelSet({ R, tw: 0.22, rimR: 0.21, dual: 0.24, paint: 'grey', holes: 6, nuts: 6, hubDepth: 0.09 });
    for (const s of [-1, 1]) { K.wheel('front', [s * 0.86, R, fA], s, true); K.wheel('rear', [s * 0.86, R, rA], s); }
    K.exhausts.push([-0.72, 0.42, -hl - 0.1], [0.72, 0.42, -hl - 0.1]);
    K.trails = [[-0.95, 2.6, -hl - 0.05], [0.95, 2.6, -hl - 0.05]];
  },
};

// Rounded beam from a to b (its local y stays as close to world up as possible).
function beam(a, b, w, h, r = 0.02) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = rbox(w, h, A.distanceTo(B), r, 2);
  const m = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0));
  m.setPosition((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g.applyMatrix4(m);
}

// ===== Tow truck: conventional medium-duty cab, wrecker body, hydraulic boom, wheel-lift ================
SPECS.tow_truck = {
  paint: 0xf59f00, seatFab: 0x3a3430,
  mats(M) {
    M.paint = envd(new THREE.MeshPhysicalMaterial({ color: 0xf59f00, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07 }));
    M.deck = new THREE.MeshStandardMaterial({ color: 0x8e949a, metalness: 0.85, roughness: 0.38, bumpMap: canvasTex('diamond', 64, 64, (g, w, h) => {
      g.fillStyle = '#404040'; g.fillRect(0, 0, w, h); g.fillStyle = '#d0d0d0';
      for (const [x, y, a] of [[16, 16, 0.6], [48, 48, 0.6], [48, 16, -0.6], [16, 48, -0.6]]) { g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-11, -3, 22, 6); g.restore(); }
    }, false) });
    M.deck.bumpMap.wrapS = M.deck.bumpMap.wrapT = THREE.RepeatWrapping;
    M.deck.bumpMap.repeat.set(8, 8);
    M.hazard = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.4, metalness: 0.2 });
    M.hub = M.chrome;
  },
  build(K) {
    const hl = 3.2, fA = 2.16, rA = -1.86, R = 0.46;
    // Bonnet between the fenders, cab with raked windscreen
    K.add('paint', prismX(poly([[1.72, 0.98], [1.72, 1.66], [2.95, 1.6, 0.12], [3.14, 1.48, 0.06], [3.14, 0.98]]), 1.34, { bevel: 0.07, segs: 3 }));
    const cab = poly([[0.32, 0.95], [0.32, 2.5, 0.12], [1.36, 2.55, 0.1], [1.76, 1.66, 0.05], [1.8, 0.95]]);
    K.add('paint', prismX(cab, 2.2, { bevel: 0.1, segs: 4, crease: 0.7 }));
    // Front fenders with the wheel arch, steps behind them
    const fender = archedProfile([[1.62, 0.72], [1.62, 1.28, 0.05], [2.45, 1.4, 0.3], [3.12, 1.26, 0.14], [3.14, 0.8]], 0.72, [{ z: fA, y: 0.42, r: 0.62 }]);
    const fg = prismX(fender, 0.48, { bevel: 0.06, segs: 3 });
    for (const s of [-1, 1]) K.add('paint', xf(fg.clone(), [s * 0.9, 0, 0]));
    // Cab glazing: windscreen (two panes split by a centre post), door windows, small rear window
    const wsO = [0, 1.7, 1.765], wsV = [0, 0.78, -0.36], wsL = Math.hypot(0.78, 0.36);
    K.add('gloss', slab(rrect(2.04, wsL + 0.04, 0.1, 0, wsL / 2), 0.01, wsO, [1, 0, 0], wsV));
    for (const s of [-1, 1]) K.add('glass', slab(rrect(0.94, wsL - 0.08, 0.06, s * 0.49, wsL / 2), 0.012, [0, wsO[1] + 0.003, wsO[2] + 0.004], [1, 0, 0], wsV, { bevel: 0.004 }));
    K.add('paint', slab(rrect(2.1, 0.16, 0.05, 0, 0), 0.08, [0, 2.48, 1.42], [1, 0, 0], [0, 0.4, 1])); // sun visor
    K.add('glass', slab(rrect(1.2, 0.42, 0.06, 0, 2.05), 0.01, [0, 0, 0.32], [-1, 0, 0], [0, 1, 0]));
    for (const s of [-1, 1]) {
      const k = s > 0 ? -1 : 1, x = s * 1.1;
      const win = poly([[0.5, 1.72, 0.05], [1.5, 1.72, 0.03], [1.36, 2.38, 0.05], [0.5, 2.38, 0.05]].map(([z, y, r]) => [k * z, y, r]));
      K.add('glass', slab(win, 0.01, [x, 0, 0], [0, 0, k], [0, 1, 0], { bevel: 0.003 }));
      K.add('gloss', slab(poly([[0.45, 1.68, 0.06], [1.56, 1.68, 0.04], [1.4, 2.42, 0.06], [0.45, 2.42, 0.06]].map(([z, y, r]) => [k * z, y, r])), 0.006, [x - s * 0.004, 0, 0], [0, 0, k], [0, 1, 0]));
      for (const gz of [0.42, 1.6]) K.add('under', xf(new THREE.BoxGeometry(0.008, 1.45, 0.008), [s * 1.102, 1.68, gz]));
      K.add('chrome', xf(rbox(0.03, 0.04, 0.2, 0.015, 1), [s * 1.11, 1.55, 0.62]));
      // steps and fuel tank under the door
      for (const [y, d] of [[0.82, 0.26], [0.52, 0.32]]) K.add('black', xf(rbox(d, 0.05, 0.62, 0.015, 1), [s * (1.12 - d / 2), y, 1.05]));
      K.add('chrome', xf(rbox(0.04, 0.6, 0.62, 0.02, 1), [s * 1.12, 0.65, 1.05]));
      K.add('chrome', xf(cyl(0.26, 0.26, 0.9, 'z', 28), [s * 0.86, 0.66, 0.0]));
      for (const sz of [-0.32, 0.32]) K.add('black', xf(cyl(0.268, 0.268, 0.05, 'z', 28), [s * 0.86, 0.66, sz]));
      // west-coast mirror on a tubular frame
      K.add('chrome', tube([[s * 1.1, 1.75, 1.5], [s * 1.34, 1.72, 1.52], [s * 1.36, 1.85, 1.52]], 0.015, 10, 6));
      K.add('chrome', tube([[s * 1.1, 2.3, 1.38], [s * 1.34, 2.32, 1.42], [s * 1.36, 2.2, 1.45]], 0.015, 10, 6));
      K.add('black', xf(rbox(0.08, 0.48, 0.2, 0.03, 2), [s * 1.38, 2.03, 1.5]));
      K.add('chrome', xf(rbox(0.005, 0.42, 0.15, 0.02, 1), [s * 1.38, 2.03, 1.395], [0, Math.PI / 2, 0]));
      // twin rectangular headlamps and indicator on the fender nose
      K.add('gloss', slab(rrect(0.42, 0.2, 0.04, 0, 0), 0.03, [s * 0.9, 1.08, 3.1], [1, 0, 0], [0, 1, 0]));
      for (const dx of [-0.1, 0.1]) {
        K.add('chrome', xf(lathe([[0.075, 0], [0.07, 0.01], [0.03, 0.005], [0.001, 0.004]], 'z', 20), [s * 0.9 + dx, 1.08, 3.13]));
        K.add('lens', xf(rbox(0.17, 0.15, 0.015, 0.03, 1), [s * 0.9 + dx, 1.08, 3.14]));
      }
      K.add('amber', xf(rbox(0.12, 0.06, 0.03, 0.02, 1), [s * 0.95, 0.92, 3.12]));
      // exhaust stack (right) / air intake (left) behind the cab
      if (s > 0) {
        K.add('chrome', tube([[0.98, 0.9, 0.2], [0.98, 2.6, 0.2], [0.98, 2.95, 0.12]], 0.065, 16, 14));
        K.add('black', xf(cyl(0.085, 0.085, 0.9, 'y', 18, true), [0.98, 1.6, 0.2]));
      } else K.add('chrome', xf(cyl(0.16, 0.16, 0.7, 'y', 20), [-0.98, 1.55, 0.18]));
      // air horns
      K.add('chrome', xf(cyl(0.02, 0.06, 0.4 + (s > 0 ? 0.1 : 0), 'z', 14), [s * 0.3, 2.6, 0.9]));
    }
    // Grille: chrome surround, dark core with horizontal bars; heavy chrome bumper with red tow hooks
    K.add('chrome', slab(rrect(1.16, 0.62, 0.06, 0, 1.18), 0.05, [0, 0, 3.12], [1, 0, 0], [0, 1, 0]));
    K.add('rubber', slab(rrect(1.0, 0.5, 0.04, 0, 1.18), 0.06, [0, 0, 3.12], [1, 0, 0], [0, 1, 0]));
    for (let i = 0; i < 7; i++) K.add('chrome', xf(rbox(0.98, 0.02, 0.02, 0.008, 1), [0, 0.97 + i * 0.07, 3.17]));
    K.add('chrome', xf(rbox(2.36, 0.3, 0.24, 0.06, 2), [0, 0.62, 3.25]));
    K.add('black', xf(rbox(1.0, 0.06, 0.04, 0.02, 1), [0, 0.62, 3.375]));
    K.add('plate', xf(rbox(0.5, 0.12, 0.01, 0.01, 1), [0, 0.64, 3.38]));
    for (const s of [-1, 1]) K.add('tail', xf(new THREE.TorusGeometry(0.06, 0.02, 6, 12, Math.PI * 1.3), [s * 0.6, 0.48, 3.33], [0, Math.PI / 2, 0]));
    // Roof: marker lamps and the amber light bar (phase A / B modules)
    for (let i = 0; i < 5; i++) K.add('amber', xf(rbox(0.07, 0.04, 0.05, 0.015, 1), [-0.3 + i * 0.15, 2.58, 1.33]));
    K.add('black', xf(rbox(1.7, 0.08, 0.34, 0.03, 2), [0, 2.6, 0.8]));
    for (const s of [-1, 1]) K.add('black', xf(rbox(0.06, 0.06, 0.5, 0.02, 1), [s * 0.6, 2.56, 0.8]));
    K.add('dome', xf(rbox(1.66, 0.13, 0.3, 0.05, 3), [0, 2.69, 0.8]));
    for (let i = 0; i < 6; i++) strobe(K, i % 2 ? 'B' : 'A', rbox(0.24, 0.09, 0.24, 0.02, 1), [-0.68 + i * 0.272, 2.68, 0.8], 0xffbb00);
    K.light({ color: 0xffaa00, dist: 24, decay: 1.5, p: [0, 2.75, 0.8] });
    // Frame rails and the wrecker body: side tool boxes with the rear arch, chequer-plate deck
    for (const s of [-1, 1]) K.add('black', xf(new THREE.BoxGeometry(0.1, 0.24, 6.2), [s * 0.42, 0.78, -0.1]));
    const sideBox = archedProfile([[-3.0, 0.62], [-3.0, 1.32, 0.05], [0.22, 1.32, 0.05], [0.22, 0.62]], 0.62, [{ z: rA, y: 0.46, r: 0.62 }]);
    const sbg = prismX(sideBox, 0.52, { bevel: 0.04, segs: 2 });
    for (const s of [-1, 1]) {
      K.add('paint', xf(sbg.clone(), [s * 0.9, 0, 0]));
      // compartment doors: shut lines, chrome T-handles
      for (const [z0, z1] of [[-0.95, 0.12], [-2.9, -2.6]]) {
        for (const z of [z0, z1]) K.add('under', xf(new THREE.BoxGeometry(0.008, 0.6, 0.008), [s * 1.161, 0.96, z]));
        K.add('under', xf(new THREE.BoxGeometry(0.008, 0.008, z1 - z0), [s * 1.161, 1.26, (z0 + z1) / 2]));
        K.add('chrome', xf(rbox(0.03, 0.04, 0.14, 0.012, 1), [s * 1.17, 1.12, z1 - 0.15]));
      }
      // rubber arch lip and mud flap
      const lip = new THREE.TorusGeometry(0.64, 0.03, 6, 28, Math.PI * 1.02);
      lip.rotateZ(-0.01); lip.rotateY(Math.PI / 2);
      K.add('rubber', xf(lip, [s * 1.165, 0.46, rA]));
      K.add('rubber', xf(rbox(0.5, 0.45, 0.02, 0.02, 1), [s * 0.86, 0.38, rA - 0.75]));
      // rear lamps: round stop/tail, amber, reverse
      for (const [y, m] of [[1.12, 'tail'], [0.96, 'amber'], [0.8, 'head']]) K.add(m, xf(cyl(0.055, 0.055, 0.03, 'z', 18), [s * 0.9, y, -3.02]));
    }
    K.add('deck', xf(new THREE.BoxGeometry(1.28, 0.06, 3.3), [0, 1.02, -1.38]));
    K.add('black', xf(rbox(2.32, 0.08, 0.1, 0.02, 1), [0, 1.34, -3.0]));
    // Boom: turret, telescopic boom, twin rams, winch, cable over the tip sheave
    K.add('paint', xf(rbox(0.9, 0.5, 0.7, 0.06, 2), [0, 1.3, -0.45]));
    K.add('black', xf(cyl(0.18, 0.18, 0.8, 'x', 20), [0, 1.4, -0.9]));
    for (const s of [-1, 1]) K.add('paint', xf(cyl(0.2, 0.2, 0.03, 'x', 20), [s * 0.41, 1.4, -0.9]));
    const base = [0, 1.55, -0.6], tip = [0, 2.62, -2.92];
    K.add('paint', beam(base, [0, 2.2, -1.9], 0.34, 0.32, 0.04));
    K.add('chrome', beam([0, 2.1, -1.7], [0, 2.62, -2.82], 0.24, 0.22, 0.02));
    K.add('paint', beam([0, 2.6, -2.75], [0, 2.66, -3.0], 0.5, 0.26, 0.04));
    K.add('black', xf(cyl(0.12, 0.12, 0.3, 'x', 20), [0, 2.55, -3.0]));
    for (const s of [-1, 1]) {
      K.add('black', beam([s * 0.22, 1.05, -1.0], [s * 0.22, 1.7, -1.55], 0.12, 0.12, 0.05));
      K.add('chrome', bar([s * 0.22, 1.6, -1.47], [s * 0.2, 2.02, -1.8], 0.035, 10));
    }
    K.add('black', bar([0, 1.58, -0.9], [0, 2.7, -2.98], 0.012, 6));
    // Wheel-lift: yellow arm, cross bar, folding L-arms
    K.add('hazard', beam([0, 0.62, -2.6], [0, 0.5, -3.3], 0.24, 0.16, 0.03));
    K.add('hazard', xf(rbox(1.7, 0.14, 0.16, 0.03, 2), [0, 0.48, -3.36]));
    for (const s of [-1, 1]) {
      K.add('hazard', xf(rbox(0.12, 0.5, 0.12, 0.02, 1), [s * 0.8, 0.68, -3.36])); // L-arms folded up
      K.add('hazard', xf(rbox(0.12, 0.12, 0.3, 0.02, 1), [s * 0.8, 0.9, -3.25]));
      K.add('tail', xf(rbox(0.12, 0.08, 0.03, 0.02, 1), [s * 0.5, 0.48, -3.445]));
    }
    // Rear amber flashers on the body and the boom head
    for (const s of [-1, 1]) {
      strobe(K, s > 0 ? 'A' : 'B', rbox(0.16, 0.1, 0.06, 0.02, 1), [s * 0.9, 1.42, -3.0], 0xffbb00);
      strobe(K, s > 0 ? 'B' : 'A', rbox(0.12, 0.12, 0.12, 0.03, 1), [s * 0.2, 2.86, -2.9], 0xffbb00);
    }
    // Hook: cable, snatch block and hook on a pivot at the boom tip (updateVehicleEffects swings it)
    K.node('hook', 'chassis', [0, 2.5, -3.0]);
    K.add('black', xf(cyl(0.012, 0.012, 0.66, 'y', 6), [0, -0.33, 0]), 'hook');
    K.add('hazard', xf(rbox(0.1, 0.24, 0.2, 0.03, 2), [0, -0.76, 0]), 'hook');
    K.add('steel', xf(cyl(0.07, 0.07, 0.11, 'x', 18), [0, -0.76, 0]), 'hook');
    K.add('steel', xf(cyl(0.025, 0.025, 0.14, 'y', 8), [0, -0.94, 0]), 'hook');
    const hook = new THREE.TorusGeometry(0.09, 0.028, 8, 20, Math.PI * 1.45);
    K.add('steel', xf(hook, [0, -1.1, 0], [0, Math.PI / 2, Math.PI * 0.6]), 'hook');
    // Interior through the windows: seats, dash, wheel
    K.add('interior', xf(new THREE.BoxGeometry(2.0, 0.9, 1.25), [0, 1.98, 0.98]));
    // Underbody tray and axles
    K.add('under', xf(new THREE.BoxGeometry(1.0, 0.3, 1.2), [0, 0.6, 2.4]));

    // Wheels: polished aluminium discs, singles in front and twins at the rear
    K.wheelSets.front = truckWheelSet({ R, tw: 0.3, rimR: 0.26, paint: 'chrome', holes: 10, nuts: 10, hubDepth: 0.13 });
    K.wheelSets.rear = truckWheelSet({ R, tw: 0.26, rimR: 0.26, dual: 0.29, paint: 'chrome', holes: 10, nuts: 10, hubDepth: 0.06 });
    for (const s of [-1, 1]) { K.wheel('front', [s * 0.92, R, fA], s, true); K.wheel('rear', [s * 0.86, R, rA], s); }
    K.exhausts.push([0.98, 2.95, 0.05], [-0.72, 0.48, -3.1]);
    K.trails = [[-0.9, 1.42, -3.05], [0.9, 1.42, -3.05]];
  },
};

// Prismatoid through plan polygons at several heights (same point count per level), flat-shaded, with
// a flat roof. levels: [[y, [[x, z], ...counter-clockwise seen from above]], ...] bottom to top.
function loftPlan(levels) {
  const p = [], add = (a, b, c) => p.push(...a, ...b, ...c);
  for (let l = 0; l < levels.length - 1; l++) {
    const [y0, A] = levels[l], [y1, B] = levels[l + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      const a = [A[i][0], y0, A[i][1]], b = [A[j][0], y0, A[j][1]], c = [B[i][0], y1, B[i][1]], d = [B[j][0], y1, B[j][1]];
      add(a, c, b); add(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  const [yt, T] = levels[levels.length - 1];
  const roof = new THREE.ShapeGeometry(new THREE.Shape(T.map(([x, z]) => new THREE.Vector2(x, -z))));
  roof.rotateX(-Math.PI / 2); roof.translate(0, yt, 0);
  return merge([g, roof]);
}
// Closed belt around circles [[z, y, r], ...]: convex hull of sampled rims, as points (z, y) in order.
function beltPath(circles) {
  const pts = [];
  for (const [z, y, r] of circles) for (let a = 0; a < 64; a++) pts.push([z + Math.cos((a / 64) * Math.PI * 2) * r, y + Math.sin((a / 64) * Math.PI * 2) * r]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...pts].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
// Points every `step` along a closed polyline, with unit tangents.
function resample(path, step) {
  const segs = [], n = path.length;
  let total = 0;
  for (let i = 0; i < n; i++) { const a = path[i], b = path[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); total += l; }
  const count = Math.round(total / step), d = total / count, out = [];
  let si = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const t = k * d;
    while (acc + segs[si][2] < t) { acc += segs[si][2]; si++; }
    const [a, b, l] = segs[si], f = (t - acc) / l;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / l, (b[1] - a[1]) / l]);
  }
  return out;
}

// ===== Main battle tank: wedge turret with bustle basket, long smoothbore gun, skirted running gear =====
SPECS.tank = {
  paint: 0x4d5a33,
  mats(M) {
    M.paint = liveryMaterial({ color: 0x4f5c34, metalness: 0.15, roughness: 0.78, clearcoat: 0 }, 'camo', `
      vec3 q = lp * vec3(0.55, 0.9, 0.38) + vec3(3.1, 0.0, 7.7);
      float n = vnoise(q) * 0.65 + vnoise(q * 2.3 + 11.0) * 0.35;
      float wb = max(fwidth(n), 1e-3);
      col = mix(col, alt, smoothstep(0.6 - wb, 0.6 + wb, n));
      col = mix(col, alt2, 1.0 - smoothstep(0.34 - wb, 0.34 + wb, n));
      col *= 0.9 + 0.2 * vnoise(lp * 9.0);`, 0x5a4a33, 0x1f211c);
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
    M.basket = new THREE.MeshStandardMaterial({ color: 0x353a26, roughness: 0.8, metalness: 0.3 });
    M.canvas = new THREE.MeshStandardMaterial({ color: 0x5e5a40, roughness: 0.95 });
    M.hub = M.paint;
  },
  build(K) {
    const hl = 3.6, tx = 1.35, deck = 1.45;
    // Hull: full-width upper hull over the tracks (shallow upper glacis), narrower lower hull
    const upper = poly([[-3.58, 1.0], [-3.62, 1.4, 0.03], [-3.5, deck, 0.03], [1.55, deck, 0.06], [3.5, 1.13, 0.03], [3.6, 1.0]]);
    K.add('paint', prismX(upper, 3.26, { bevel: 0.035, segs: 1, crease: 0.4 }));
    const lower = poly([[-3.42, 0.46, 0.04], [-3.58, 1.02], [3.6, 1.02], [3.2, 0.44, 0.04]]);
    K.add('paint', prismX(lower, 2.04, { bevel: 0.03, segs: 1, crease: 0.4 }));
    // Running gear: 7 road wheels, front idler, rear drive sprocket, 3 return rollers per side
    const rwZ = [2.38, 1.58, 0.78, -0.02, -0.82, -1.62, -2.42], rwR = 0.33, rwY = 0.4;
    const roadWheel = () => {
      const parts = [];
      for (const ox of [-0.13, 0.13]) {
        parts.push(['rubber', xf(lathe([[0.24, -0.06], [rwR - 0.01, -0.06], [rwR, -0.05], [rwR, 0.05], [rwR - 0.01, 0.06], [0.24, 0.06]], 'x', 32), [ox, 0, 0])]);
        parts.push(['paint', xf(lathe([[0.25, -0.05], [0.22, -0.03], [0.1, 0.0], [0.08, 0.03], [0.001, 0.03]], 'x', 32), [ox + (ox > 0 ? 0.03 : -0.03), 0, 0], [0, ox > 0 ? 0 : Math.PI, 0])]);
      }
      parts.push(['gunmetal', xf(cyl(0.09, 0.09, 0.12, 'x', 16), [0.2, 0, 0])]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(['gunmetal', xf(cyl(0.014, 0.014, 0.02, 'x', 6), [0.265, Math.cos(a) * 0.06, Math.sin(a) * 0.06])]); }
      return parts;
    };
    K.wheelSets.road = roadWheel();
    K.wheelSets.idler = roadWheel().map(([m, g]) => [m, g.clone().scale(1, 0.92, 0.92)]);
    const gear = new THREE.Shape(), teeth = 12;
    for (let i = 0; i <= teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2, r = i % 4 < 2 ? 0.36 : 0.3;
      i ? gear.lineTo(Math.cos(a) * r, Math.sin(a) * r) : gear.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    K.wheelSets.sprocket = [
      ...[-0.17, 0.17].map((ox) => ['gunmetal', xf(prismZ(gear, 0.06, { bevel: 0.01, segs: 1, crease: 0.5 }), [ox, 0, 0], [0, Math.PI / 2, 0])]),
      ['paint', xf(lathe([[0.26, -0.2], [0.26, 0.2], [0.12, 0.26], [0.001, 0.26]], 'x', 24), [0, 0, 0])],
      ['gunmetal', xf(cyl(0.08, 0.08, 0.1, 'x', 12), [0.3, 0, 0])],
    ];
    K.wheelSets.roller = [['rubber', cyl(0.1, 0.1, 0.18, 'x', 16)], ['gunmetal', xf(cyl(0.05, 0.05, 0.06, 'x', 10), [0.11, 0, 0])]];
    for (const s of [-1, 1]) {
      for (const z of rwZ) K.wheel('road', [s * tx, rwY, z], s);
      K.wheel('idler', [s * tx, 0.6, 3.08], s);
      K.wheel('sprocket', [s * tx, 0.6, -3.18], s);
      for (const z of [1.9, 0.2, -1.5]) K.wheel('roller', [s * tx, 0.8, z], s);
    }
    // Tracks: shoes with grousers and end connectors, laid link by link round the wheels
    const path = beltPath([[3.08, 0.6, 0.3 + 0.04], ...rwZ.map((z) => [z, rwY, rwR + 0.04]), [-3.18, 0.6, 0.34 + 0.04], [1.9, 0.8, 0.14], [-1.5, 0.8, 0.14]]);
    const links = resample(path, 0.16);
    const shoe = rbox(0.6, 0.06, 0.15, 0.014, 1), grouser = new THREE.BoxGeometry(0.56, 0.025, 0.035), pad = new THREE.BoxGeometry(0.24, 0.03, 0.12);
    const conn = new THREE.BoxGeometry(0.05, 0.08, 0.1);
    const trackParts = [], padParts = [];
    const m = new THREE.Matrix4(), nrm = new THREE.Vector3(), tan = new THREE.Vector3(), xa = new THREE.Vector3(1, 0, 0);
    for (const [z, y, dz, dy] of links) {
      tan.set(0, dy, dz); nrm.set(0, dz, -dy); // outward normal (path runs clockwise in z-y)
      m.makeBasis(xa, nrm, tan);
      for (const s of [-1, 1]) {
        m.setPosition(s * tx, y, z);
        trackParts.push(shoe.clone().applyMatrix4(m));
        trackParts.push(grouser.clone().translate(0, 0.035, 0).applyMatrix4(m));
        for (const px of [-0.17, 0.17]) padParts.push(pad.clone().translate(px, -0.04, 0).applyMatrix4(m));
        for (const px of [-0.32, 0.32]) trackParts.push(conn.clone().translate(px, 0, 0.075).applyMatrix4(m));
      }
    }
    K.add('tread', merge(trackParts));
    K.add('rubber', merge(padParts));
    // Side skirts: heavy front panels, thinner bolted panels behind, rubber lower edge
    for (const s of [-1, 1]) {
      const panels = [[3.3, 2.55, 0.12], [2.55, 1.8, 0.12], [1.8, 0.6, 0.06], [0.6, -0.6, 0.06], [-0.6, -1.8, 0.06], [-1.8, -3.0, 0.06], [-3.0, -3.45, 0.06]];
      for (const [z1, z0, t] of panels) {
        K.add('paint', xf(rbox(t, 0.46, z1 - z0 - 0.02, 0.012, 1), [s * (1.66 + t / 2), 0.77, (z0 + z1) / 2]));
        for (const bz of [z0 + 0.12, z1 - 0.12]) for (const by of [0.62, 0.92]) K.add('gunmetal', xf(cyl(0.018, 0.018, 0.02, 'x', 6), [s * (1.66 + t + 0.005), by, bz]));
      }
      K.add('rubber', xf(new THREE.BoxGeometry(0.02, 0.08, 6.7), [s * 1.69, 0.51, -0.08]));
      // front track guard flap
      K.add('paint', xf(rbox(0.62, 0.04, 0.4, 0.01, 1), [s * tx, 1.02, 3.48], [-0.5, 0, 0]));
      // headlight cluster with guard on the glacis corner; tail lights at the rear
      K.add('gunmetal', xf(rbox(0.28, 0.16, 0.12, 0.03, 2), [s * 1.25, 1.24, 3.3]));
      for (const dx of [-0.07, 0.07]) {
        K.add('head', xf(cyl(0.05, 0.05, 0.02, 'z', 16), [s * 1.25 + dx, 1.25, 3.365]));
        K.add('lens', xf(cyl(0.052, 0.052, 0.012, 'z', 16), [s * 1.25 + dx, 1.25, 3.375]));
      }
      K.add('gunmetal', tube([[s * 1.07, 1.2, 3.28], [s * 1.08, 1.36, 3.45], [s * 1.42, 1.36, 3.45], [s * 1.43, 1.2, 3.28]], 0.012, 12, 6));
      K.add('tail', xf(rbox(0.14, 0.08, 0.03, 0.02, 1), [s * 1.35, 1.32, -3.63]));
      K.add('gunmetal', xf(rbox(0.22, 0.14, 0.06, 0.02, 1), [s * 1.35, 1.32, -3.6]));
      // tow shackles front and rear
      for (const [z, r] of [[3.62, 0], [-3.66, Math.PI]]) K.add('gunmetal', xf(new THREE.TorusGeometry(0.07, 0.022, 6, 14), [s * 0.7, 0.62, z], [0, Math.PI / 2 + r, 0]));
      // engine-deck grilles and exhaust louvres
      K.add('gunmetal', xf(rbox(0.9, 0.03, 1.4, 0.02, 1), [s * 0.75, deck + 0.005, -2.55]));
      for (let i = 0; i < 9; i++) K.add('black', xf(new THREE.BoxGeometry(0.84, 0.02, 0.05), [s * 0.75, deck + 0.02, -3.15 + i * 0.15]));
      for (let i = 0; i < 4; i++) K.add('black', xf(new THREE.BoxGeometry(0.7, 0.03, 0.03), [s * 0.95, 1.12 + i * 0.07, -3.63], [0.6, 0, 0]));
      // tow cable along the rear deck edge
      K.add('gunmetal', tube([[s * 1.5, deck + 0.04, -1.5], [s * 1.52, deck + 0.04, -3.3], [s * 1.2, deck + 0.04, -3.48], [s * 0.3, deck + 0.04, -3.48]], 0.025, 30, 6));
    }
    // Driver's hatch and periscopes, splash board on the glacis
    K.add('paint', xf(cyl(0.3, 0.3, 0.06, 'y', 24), [-0.55, deck + 0.02, 2.0]));
    for (const dx of [-0.2, 0, 0.2]) K.add('glass', xf(rbox(0.14, 0.07, 0.06, 0.01, 1), [-0.55 + dx, deck + 0.02, 2.33], [0.3, 0, 0]));
    K.add('paint', xf(rbox(2.4, 0.06, 0.05, 0.015, 1), [0, 1.33, 2.4], [-0.6, 0, 0]));
    // Underside
    K.add('under', xf(new THREE.BoxGeometry(1.9, 0.05, 6.4), [0, 0.45, 0]));

    // Turret: plan polygons at three heights (undercut, widest, roof) with a gun-port notch in front
    K.node('turret', 'chassis', [0, deck, -0.25]);
    const half = [[0.38, 1.5], [0.38, 2.12], [1.36, 1.5], [1.66, 0.95], [1.66, -0.75], [1.52, -1.1], [1.5, -2.25], [1.22, -2.45]];
    const full = (pts) => [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z])].reverse();
    const lvl = (dx, dzF, dzR) => full(half.map(([x, z]) => [Math.max(0.36, x - dx), z > 0 ? z - dzF * (z / 2.12) : z + dzR]));
    const turretGeo = loftPlan([[0, lvl(0.1, 0.25, 0.04)], [0.3, lvl(0, 0, 0)], [0.8, lvl(0.14, 0.42, 0.06)]]);
    K.add('paint', turretGeo, 'turret');
    // roof hatches, commander's cupola with vision blocks, sights, MG, smoke dischargers, antennas
    const cup = [0.62, 0.8, -0.55];
    K.add('paint', xf(cyl(0.38, 0.4, 0.16, 'y', 28), cup), 'turret');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      K.add('glass', xf(rbox(0.1, 0.07, 0.04, 0.01, 1), [cup[0] + Math.sin(a) * 0.37, 0.84, cup[2] + Math.cos(a) * 0.37], [0, a, 0]), 'turret');
    }
    K.add('paint', xf(cyl(0.3, 0.32, 0.06, 'y', 24), [cup[0], 0.91, cup[2]]), 'turret');
    K.add('gunmetal', xf(rbox(0.12, 0.06, 0.2, 0.02, 1), [cup[0], 0.92, cup[2] - 0.32]), 'turret');
    K.add('paint', xf(cyl(0.28, 0.3, 0.07, 'y', 24), [-0.62, 0.83, -0.6]), 'turret');
    K.add('gunmetal', xf(rbox(0.1, 0.05, 0.16, 0.02, 1), [-0.62, 0.88, -0.86]), 'turret');
    K.add('paint', xf(cyl(0.13, 0.15, 0.3, 'y', 18), [-0.62, 0.95, 0.55]), 'turret'); // panoramic sight
    K.add('paint', xf(rbox(0.26, 0.2, 0.24, 0.03, 2), [-0.62, 1.18, 0.55]), 'turret');
    K.add('glass', xf(rbox(0.2, 0.12, 0.02, 0.01, 1), [-0.62, 1.18, 0.68]), 'turret');
    K.add('paint', xf(rbox(0.36, 0.28, 0.5, 0.04, 2), [0.95, 0.9, 1.0]), 'turret'); // gunner's sight
    K.add('glass', xf(rbox(0.26, 0.16, 0.02, 0.01, 1), [0.95, 0.92, 1.255]), 'turret');
    // loader's MG on a pintle
    K.add('gunmetal', xf(cyl(0.025, 0.025, 0.25, 'y', 8), [-0.62, 0.98, -0.25]), 'turret');
    K.add('gunmetal', xf(rbox(0.08, 0.1, 0.5, 0.02, 1), [-0.62, 1.12, -0.15]), 'turret');
    K.add('gunmetal', xf(cyl(0.012, 0.014, 0.6, 'z', 8), [-0.62, 1.13, 0.35]), 'turret');
    K.add('paint', xf(rbox(0.1, 0.12, 0.14, 0.02, 1), [-0.68, 1.08, -0.15]), 'turret');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) K.add('gunmetal', xf(cyl(0.045, 0.045, 0.28, 'z', 10), [s * (1.42 + i * 0.0), 0.52 + (i % 2) * 0.1, -0.25 - Math.floor(i / 2) * 0.1], [-0.5, s * 0.5, 0]), 'turret');
      K.add('black', xf(cyl(0.004, 0.008, 1.6, 'y', 5), [s * 1.1, 1.6, -2.15]), 'turret');
      K.add('gunmetal', xf(cyl(0.04, 0.05, 0.1, 'y', 10), [s * 1.1, 0.84, -2.15]), 'turret');
      // lifting eyes
      K.add('gunmetal', xf(new THREE.TorusGeometry(0.05, 0.015, 6, 12), [s * 1.3, 0.84, 1.1], [0, Math.PI / 2, 0]), 'turret');
    }
    K.add('gunmetal', xf(cyl(0.02, 0.02, 0.6, 'y', 6), [0.2, 1.1, -2.0]), 'turret'); // crosswind sensor
    K.add('gunmetal', xf(rbox(0.3, 0.03, 0.03, 0.01, 1), [0.2, 1.4, -2.0]), 'turret');
    // bustle stowage basket: tube frame, mesh bars, stowed canvas rolls
    const bz0 = -2.0, bz1 = -2.95, bx = 1.42;
    for (const y of [0.12, 0.55]) K.add('basket', tube([[bx, y, bz0], [bx, y, bz1 + 0.12], [bx - 0.12, y, bz1], [-bx + 0.12, y, bz1], [-bx, y, bz1 + 0.12], [-bx, y, bz0]], 0.02, 40, 6), 'turret');
    for (let i = 0; i <= 14; i++) {
      const x = -bx + 0.12 + (i / 14) * (2 * bx - 0.24);
      K.add('basket', bar([x, 0.12, bz1], [x, 0.55, bz1], 0.008, 4), 'turret');
    }
    for (const s of [-1, 1]) for (let i = 0; i <= 4; i++) K.add('basket', bar([s * bx, 0.12, bz0 - i * 0.2], [s * bx, 0.55, bz0 - i * 0.2], 0.008, 4), 'turret');
    K.add('basket', xf(new THREE.BoxGeometry(2 * bx, 0.02, bz0 - bz1), [0, 0.11, (bz0 + bz1) / 2]), 'turret');
    for (const [x, w] of [[-0.8, 0.9], [0.35, 1.0]]) K.add('canvas', xf(rbox(w, 0.34, 0.6, 0.15, 3), [x, 0.3, -2.55]), 'turret');
    K.add('canvas', xf(cyl(0.16, 0.16, 0.9, 'x', 16), [1.0, 0.3, -2.6]), 'turret');

    // Gun: mantlet and barrel pitch about the trunnion. Barrel with thermal sleeve clamps, fume extractor
    // and a multi-baffle muzzle brake.
    K.node('barrel', 'turret', [0, 0.42, 1.6]);
    K.add('paint', xf(rbox(0.74, 0.6, 0.6, 0.06, 2), [0, 0, 0.12]), 'barrel');
    K.add('paint', xf(rbox(0.5, 0.42, 0.3, 0.05, 2), [0, 0.02, 0.52]), 'barrel');
    K.add('paint', lathe([[0.17, 0.6], [0.15, 0.75], [0.14, 1.9], [0.17, 2.05], [0.18, 2.15], [0.18, 2.75], [0.16, 2.85], [0.13, 2.95], [0.12, 3.1], [0.105, 5.25], [0.001, 5.25]].map(([r, z]) => [r, z]), 'z', 28), 'barrel');
    for (const z of [1.2, 1.6, 3.6, 4.2, 4.8]) K.add('gunmetal', xf(cyl(0.135 - (z - 1) * 0.006, 0.135 - (z - 1) * 0.006, 0.04, 'z', 24), [0, 0, z]), 'barrel');
    K.add('gunmetal', lathe([[0.12, 5.22], [0.15, 5.26], [0.15, 5.36], [0.12, 5.38], [0.15, 5.42], [0.15, 5.52], [0.12, 5.54], [0.14, 5.58], [0.14, 5.68], [0.1, 5.7], [0.06, 5.7]], 'z', 24), 'barrel');
    for (const s of [-1, 1]) K.add('black', xf(rbox(0.02, 0.07, 0.08, 0.008, 1), [s * 0.15, 0, 5.31]), 'barrel');
    K.add('gunmetal', xf(rbox(0.06, 0.05, 0.1, 0.01, 1), [0, 0.13, 5.1]), 'barrel'); // muzzle reference sensor
    K.add('black', xf(cyl(0.1, 0.1, 0.02, 'z', 20), [0, 0, 5.705]), 'barrel');
    K.node('muzzle', 'barrel', [0, 0, 5.75]);

    K.exhausts.push([-0.95, 1.2, -hl - 0.1], [0.95, 1.2, -hl - 0.1]);
    K.trails = [[-1.35, 1.0, -hl - 0.1], [1.35, 1.0, -hl - 0.1]];
  },
  userData: (out) => ({ isTank: true, turret: out.nodes.turret, barrel: out.nodes.barrel, muzzlePoint: out.nodes.muzzle }),
};

// ---------------------------------------------------------------------------------------------------
export const HEAVY_VEHICLE_IDS = new Set(Object.keys(SPECS));
const REC_CACHE = new Map();

export function buildHeavyVehicle(typeId, options = {}) {
  const spec = SPECS[typeId];
  if (!spec) throw new Error(`no heavy hero model for ${typeId}`);
  const M = heavyMaterials(spec);
  if (!M.hub) M.hub = M.chrome;
  spec.mats(M);
  let rec = REC_CACHE.get(typeId);
  if (!rec) {
    const K = new Kit();
    spec.build(K);
    rec = K.finish();
    REC_CACHE.set(typeId, rec);
  }
  if (options.paintColor != null) M.paint.color.set(options.paintColor);
  const out = instantiate(rec, M, typeId);
  const userData = spec.userData ? spec.userData(out) : undefined;
  const hasBar = rec.singles.some((s) => s.phase);
  return {
    group: out.group, chassis: out.chassis, wheels: out.wheels, frontSteerPivots: out.frontSteerPivots, paintMeshes: out.paintMeshes,
    lightbarParts: hasBar ? out.lightbarParts : null, exhausts: rec.exhausts, trails: rec.trails || undefined, userData,
  };
}
