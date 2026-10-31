// [street-props] Detailed near-LOD street furniture: lamps, traffic signals, hydrants, bins, benches, bollards,
// bus shelters, mailboxes, newsboxes, and parked cars. StreetFeatures (street_furniture.js) draws these for
// instances within NEAR_CFG distance of the camera and keeps its light box models beyond that, so each type
// costs two instanced draw calls at most.
// Same local frame as the far models: ground at y = 0, +X faces the road, lamp heads / signal lenses sit exactly
// where the night bulbs and the signal lamp discs are placed (street_worker.js / street_detail.js heads).
// Every vertex carries `sfm` = (roughness, metalness, night emissive, ground grime); furniture materials read it through
// patchFurnitureMaterial, so one material covers painted steel, galvanised poles, glass, lenses and lit panels.
import * as THREE from '../../vendor/three.module.js';

// type -> [near distance (m), near capacity, casts shadow]
export const NEAR_CFG = {
  lampArm: [95, 260, true], lampCobra: [95, 260, true], lampDouble: [95, 200, true], lampPost: [80, 260, true],
  tlPole: [110, 220, true], tlArm: [110, 220, true], tlHeadV: [110, 260, false], tlHeadH: [110, 260, false],
  busStop: [90, 60, true], bench: [70, 200, false], bollard: [55, 500, false], hydrant: [60, 200, false],
  bin: [65, 260, false],
};

// ---------- surface presets: c = linear rgb, r = roughness, m = metalness, e = night emissive ----------
const S = {
  galv: { c: [0.5, 0.52, 0.52], r: 0.42, m: 0.62 },
  galvDark: { c: [0.36, 0.38, 0.39], r: 0.5, m: 0.55 },
  paintGrey: { c: [0.4, 0.42, 0.44], r: 0.45, m: 0.4 },
  paintLight: { c: [0.56, 0.58, 0.6], r: 0.4, m: 0.35 },
  castIron: { c: [0.06, 0.08, 0.07], r: 0.42, m: 0.45 },
  brass: { c: [0.72, 0.58, 0.22], r: 0.28, m: 0.82 },
  black: { c: [0.025, 0.025, 0.028], r: 0.55, m: 0.2 },
  rubber: { c: [0.03, 0.03, 0.03], r: 0.85, m: 0.0 },
  concrete: { c: [0.5, 0.49, 0.46], r: 0.92, m: 0.0 },
  bolt: { c: [0.42, 0.43, 0.43], r: 0.35, m: 0.8 },
  chrome: { c: [0.82, 0.84, 0.87], r: 0.16, m: 0.92 },
  refractor: { c: [0.78, 0.78, 0.74], r: 0.12, m: 0.0, e: 0.55 },
  ledPanel: { c: [0.92, 0.9, 0.84], r: 0.2, m: 0.0, e: 0.9 },
  white: { c: [0.86, 0.87, 0.86], r: 0.5, m: 0.05 },
  signalBody: { c: [0.06, 0.065, 0.07], r: 0.5, m: 0.3 },
  signalYellow: { c: [0.78, 0.56, 0.04], r: 0.38, m: 0.25 },
  lensR: { c: [0.2, 0.025, 0.02], r: 0.08, m: 0.1 },
  lensY: { c: [0.26, 0.14, 0.015], r: 0.08, m: 0.1 },
  lensG: { c: [0.02, 0.15, 0.1], r: 0.08, m: 0.1 },
  pedHand: { c: [0.95, 0.42, 0.08], r: 0.3, m: 0.0, e: 1.6 },
  pedWalk: { c: [0.82, 0.88, 0.92], r: 0.3, m: 0.0, e: 1.2 },
  hydrantRed: { c: [0.62, 0.06, 0.04], r: 0.38, m: 0.15 },
  hydrantCap: { c: [0.68, 0.68, 0.64], r: 0.32, m: 0.6 },
  binGreen: { c: [0.06, 0.15, 0.1], r: 0.5, m: 0.4 },
  binInner: { c: [0.02, 0.02, 0.02], r: 0.9, m: 0.0 },
  wood: { c: [0.36, 0.2, 0.1], r: 0.7, m: 0.0 },
  wood2: { c: [0.32, 0.18, 0.09], r: 0.72, m: 0.0 },
  alu: { c: [0.62, 0.64, 0.66], r: 0.3, m: 0.7 },
  reflWhite: { c: [0.9, 0.9, 0.86], r: 0.3, m: 0.1 },
  reflYellow: { c: [0.85, 0.62, 0.05], r: 0.3, m: 0.1 },
  adLight: { c: [0.82, 0.86, 0.9], r: 0.25, m: 0.0, e: 1.1 },
  busBlue: { c: [0.03, 0.18, 0.5], r: 0.4, m: 0.2 },
  mailBlue: { c: [0.04, 0.16, 0.44], r: 0.38, m: 0.35 },
  newsRed: { c: [0.58, 0.08, 0.06], r: 0.42, m: 0.3 },
  carPaint: { c: [0.18, 0.28, 0.46], r: 0.26, m: 0.55 },
  carGlass: { c: [0.06, 0.09, 0.13], r: 0.08, m: 0.2 },
  tailRed: { c: [0.65, 0.04, 0.04], r: 0.18, m: 0.1, e: 0.45 },
};

// ---------- geometry kit (non-indexed parts with position / normal / color / sfm, merged per model) ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

function place(g, t) {
  if (!t) return g;
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  _v.set(t.x || 0, t.y || 0, t.z || 0);
  _m.compose(_v, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

let grime = 1; // 0 for models that hang in the air (signal heads): no ground grime

/**
 * Bakes one part: computes smooth analytical normals on indexed curved geometries BEFORE .toNonIndexed(),
 * applies transform, bakes flat surface preset into color + sfm, and keeps position/normal/color/sfm.
 */
function part(geom, surf, t) {
  if (geom.index) geom.computeVertexNormals();
  const g = geom.index ? geom.toNonIndexed() : geom;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  place(g, t);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    c[i * 3] = surf.c[0]; c[i * 3 + 1] = surf.c[1]; c[i * 3 + 2] = surf.c[2];
    f[i * 4] = surf.r; f[i * 4 + 1] = surf.m; f[i * 4 + 2] = surf.e || 0; f[i * 4 + 3] = grime;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('sfm', new THREE.BufferAttribute(f, 4));
  return g;
}

function mergeParts(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, sz] of [['position', 3], ['normal', 3], ['color', 3], ['sfm', 4]]) {
    const a = new Float32Array(n * sz);
    let o = 0;
    for (const p of parts) { a.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, sz));
  }
  out.computeBoundingSphere();
  return out;
}

/** Surface of revolution about +Y. pts = [[radius, y], ...] bottom to top. */
function lathe(pts, seg, surf, t) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.computeVertexNormals();
  return part(g, surf, t);
}
const cyl = (rt, rb, h, seg, surf, t, open = false) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.computeVertexNormals();
  return part(g, surf, t);
};
const box = (w, h, d, surf, t) => part(new THREE.BoxGeometry(w, h, d), surf, t);
const sphere = (r, ws, hs, surf, t, th0 = 0, thL = Math.PI) => {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, th0, thL);
  g.computeVertexNormals();
  return part(g, surf, t);
};
const torus = (r, tubeR, rs, ts, surf, t, arc = Math.PI * 2) => {
  const g = new THREE.TorusGeometry(r, tubeR, rs, ts, arc);
  g.computeVertexNormals();
  return part(g, surf, t);
};

/** Rod between two 3D points. */
function rod(a, b, r, seg, surf, rb = r) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, rb, len, seg, 1, true);
  g.computeVertexNormals();
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return part(g, surf);
}

/** Tube along a smooth 3D path. */
function tube(points, r, segs, radial, surf, rEnd = r) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  if (rEnd !== r) {
    // taper: shrink each ring toward the curve centre line
    const pos = g.attributes.position, per = radial + 1;
    for (let i = 0; i <= segs; i++) {
      const c = curve.getPointAt(i / segs), k = 1 + (rEnd / r - 1) * (i / segs);
      for (let j = 0; j < per; j++) {
        const o = i * per + j;
        pos.setXYZ(o, c.x + (pos.getX(o) - c.x) * k, c.y + (pos.getY(o) - c.y) * k, c.z + (pos.getZ(o) - c.z) * k);
      }
    }
  }
  g.computeVertexNormals();
  return part(g, surf);
}

/** Rounded-rectangle slab: w x h in the XY plane, extruded `d` along Z, centred. */
function rslab(w, h, d, r, surf, t, curveSeg = 3) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: curveSeg });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return part(g, surf, t);
}

/** Extruded polygon outline (XY plane), thickness along Z, centred on z = 0. */
function plate(pts, d, surf, t, bevel = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2 + bevel);
  g.computeVertexNormals();
  return part(g, surf, t);
}

// ---------- shared sub-assemblies ----------

/** Anchor-bolted octagonal/fluted base: concrete footing, flange plate, 4 gusset ribs & anchor nuts. */
function poleBase(parts, flangeR, surf = S.galv, footing = true) {
  if (footing) parts.push(cyl(flangeR + 0.14, flangeR + 0.18, 0.08, 16, S.concrete, { y: 0.0 }));
  parts.push(cyl(flangeR, flangeR * 1.04, 0.035, 8, surf, { y: 0.095 }));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, rr = flangeR * 0.78;
    parts.push(cyl(0.022, 0.022, 0.055, 6, S.bolt, { x: Math.cos(a) * rr, y: 0.132, z: Math.sin(a) * rr }));
    const ga = (k * Math.PI) / 2;
    parts.push(box(0.018, 0.12, flangeR * 0.42, surf, { x: Math.cos(ga) * (flangeR * 0.66), y: 0.17, z: Math.sin(ga) * (flangeR * 0.66), ry: -ga + Math.PI / 2 }));
  }
}

/** Fluted cast-iron / decorative lower plinth with collar rings. */
function flutedPlinth(parts, y0, y1, rb, rt, surf, flutes = 8) {
  parts.push(lathe([
    [rb * 1.16, y0], [rb * 1.16, y0 + 0.08], [rb * 1.04, y0 + 0.14],
    [rb, y0 + 0.18], [rt, y1 - 0.08], [rt * 1.14, y1 - 0.04], [rt * 0.94, y1],
  ], 12, surf));
  const ym = (y0 + 0.18 + y1 - 0.08) * 0.5, h = Math.max(0.12, (y1 - y0) - 0.28);
  const rm = (rb + rt) * 0.5;
  for (let k = 0; k < flutes; k++) {
    const a = (k / flutes) * Math.PI * 2;
    parts.push(cyl(0.014, 0.017, h, 6, surf, { x: Math.cos(a) * rm, y: ym, z: Math.sin(a) * rm }));
  }
  parts.push(torus(rt * 1.08, 0.018, 6, 14, surf, { y: y1 - 0.03, rx: Math.PI / 2 }));
}

/** Tapered round pole from y0 to y1 with decorative collar rings, cap, and handhole door facing -X. */
function pole(parts, y0, y1, rb, rt, surf, { door = true, cap = true, seg = 14, collars = [] } = {}) {
  parts.push(lathe([[rb * 1.12, y0], [rb * 1.12, y0 + 0.12], [rb, y0 + 0.16], [rt, y1]], seg, surf));
  for (const cy of collars) {
    const t = Math.max(0, Math.min(1, (cy - y0) / Math.max(0.1, y1 - y0)));
    const cr = rb + (rt - rb) * t;
    parts.push(torus(cr * 1.08, 0.016, 6, seg, surf, { y: cy, rx: Math.PI / 2 }));
  }
  if (cap) parts.push(sphere(rt * 1.06, seg, 5, surf, { y: y1 }, 0, Math.PI / 2));
  if (door) {
    parts.push(rslab(0.11, 0.34, 0.022, 0.02, surf, { x: -rb * 0.98, y: y0 + 0.75, ry: Math.PI / 2 }));
    parts.push(cyl(0.012, 0.012, 0.016, 6, S.bolt, { x: -rb * 1.08, y: y0 + 0.84, rz: Math.PI / 2 }));
  }
}

// ---------- models ----------

export function lampCobra() {
  const P = [];
  poleBase(P, 0.21);
  // Fluted octagonal/tapered cast-iron/galv transformer plinth + decorative collar rings
  flutedPlinth(P, 0.11, 0.82, 0.19, 0.14, S.galv, 8);
  pole(P, 0.82, 8.65, 0.13, 0.085, S.galv, { door: false, collars: [1.45, 4.6, 8.15] });
  P.push(rslab(0.12, 0.32, 0.024, 0.02, S.galvDark, { x: -0.19, y: 0.42, ry: Math.PI / 2 }));
  // Curved davit/gooseneck mast arm + under-brace scroll strut + pole clamp collars
  P.push(cyl(0.102, 0.102, 0.12, 12, S.galvDark, { y: 8.2 }));
  P.push(cyl(0.096, 0.096, 0.1, 12, S.galvDark, { y: 7.75 }));
  P.push(tube([[0.0, 8.2, 0], [0.28, 8.56, 0], [0.92, 8.88, 0], [1.75, 8.98, 0], [2.16, 8.99, 0]], 0.055, 16, 10, S.galv, 0.042));
  P.push(tube([[0.08, 7.75, 0], [0.48, 8.15, 0], [0.95, 8.58, 0], [1.38, 8.9, 0]], 0.024, 10, 8, S.galvDark, 0.02));
  // Slip-fitter clamp collar
  P.push(cyl(0.052, 0.052, 0.28, 10, S.galvDark, { x: 2.18, y: 8.99, rz: Math.PI / 2 }));
  // Aerodynamic cobra-head luminaire housing with top heat-sink fins
  P.push(sphere(1, 22, 10, S.galvDark, { x: 2.68, y: 8.81, sx: 0.62, sy: 0.175, sz: 0.25 }, 0, Math.PI / 2));
  P.push(cyl(0.25, 0.24, 0.028, 22, S.galvDark, { x: 2.68, y: 8.795, sx: 2.48 }));
  for (let i = -2; i <= 2; i++) {
    P.push(box(0.42, 0.018, 0.012, S.galv, { x: 2.66, y: 8.96, z: i * 0.045 }));
  }
  // Prismatic glass refractor bowl & glowing LED lens diffuser under the head (bulb sits at 2.6, 8.75)
  P.push(sphere(1, 20, 6, S.refractor, { x: 2.68, y: 8.79, sx: 0.45, sy: 0.078, sz: 0.195 }, Math.PI / 2, Math.PI / 2));
  P.push(rslab(0.56, 0.24, 0.012, 0.06, S.ledPanel, { x: 2.66, y: 8.755, rx: Math.PI / 2 }, 4));
  // NEMA twist-lock photocell sensor on top of luminaire
  P.push(cyl(0.036, 0.038, 0.052, 10, S.black, { x: 2.48, y: 8.99 }));
  P.push(sphere(0.036, 10, 4, S.white, { x: 2.48, y: 9.018 }, 0, Math.PI / 2));
  return mergeParts(P);
}

export function lampArm() {
  const P = [];
  poleBase(P, 0.2, S.paintGrey);
  // Fluted base plinth + decorative collar rings
  flutedPlinth(P, 0.11, 0.78, 0.175, 0.128, S.paintGrey, 8);
  pole(P, 0.78, 8.3, 0.12, 0.072, S.paintGrey, { collars: [1.4, 4.2, 7.95] });
  // Twin banner bracket arms & clamping collars half way up
  P.push(cyl(0.105, 0.105, 0.06, 10, S.galvDark, { y: 4.2 }));
  P.push(cyl(0.016, 0.016, 0.42, 8, S.alu, { x: -0.26, y: 4.55, rz: Math.PI / 2 }));
  P.push(cyl(0.016, 0.016, 0.42, 8, S.alu, { x: -0.26, y: 3.85, rz: Math.PI / 2 }));
  // Curved gooseneck / davit arm bracket + decorative scroll strut
  P.push(tube([[0, 7.98, 0], [0.22, 8.32, 0], [0.85, 8.46, 0], [1.92, 8.5, 0]], 0.046, 14, 10, S.paintGrey, 0.038));
  P.push(tube([[0.06, 7.55, 0], [0.42, 7.92, 0], [0.96, 8.42, 0]], 0.022, 10, 8, S.paintGrey));
  // Aerodynamic die-cast LED cobra/blade luminaire with heat-sink fins & glowing LED diffuser
  P.push(rslab(0.84, 0.35, 0.092, 0.12, S.paintGrey, { x: 2.3, y: 8.435, rx: Math.PI / 2 }, 4));
  P.push(rslab(0.72, 0.27, 0.052, 0.1, S.galvDark, { x: 2.26, y: 8.495, rx: Math.PI / 2 }, 4));
  for (let i = -2; i <= 2; i++) P.push(box(0.46, 0.016, 0.01, S.alu, { x: 2.28, y: 8.53, z: i * 0.042 }));
  P.push(cyl(0.052, 0.052, 0.22, 10, S.galvDark, { x: 1.9, y: 8.5, rz: Math.PI / 2 }));
  P.push(cyl(0.032, 0.032, 0.045, 8, S.black, { x: 2.12, y: 8.54 }));
  P.push(rslab(0.62, 0.23, 0.014, 0.08, S.ledPanel, { x: 2.32, y: 8.382, rx: Math.PI / 2 }, 4));
  return mergeParts(P);
}

export function lampDouble() {
  const P = [];
  P.push(cyl(0.35, 0.39, 0.1, 16, S.concrete));
  poleBase(P, 0.28, S.paintLight, false);
  // Fluted cast-iron boulevard plinth + decorative rings
  flutedPlinth(P, 0.1, 1.08, 0.25, 0.17, S.paintLight, 10);
  pole(P, 1.08, 9.75, 0.16, 0.1, S.paintLight, { door: false, collars: [1.8, 5.2, 8.85, 9.3] });
  P.push(rslab(0.14, 0.4, 0.024, 0.03, S.galvDark, { x: -0.255, y: 0.52, ry: Math.PI / 2 }));
  for (const sd of [1, -1]) {
    // Swept twin gooseneck arms + lower scroll tie-rods
    P.push(tube([[0, 9.25, 0], [sd * 0.52, 9.7, 0], [sd * 1.32, 9.97, 0], [sd * 2.06, 10.05, 0]], 0.05, 14, 10, S.paintLight, 0.04));
    P.push(rod([0, 8.88, 0], [sd * 0.95, 9.86, 0], 0.025, 8, S.paintLight));
    P.push(torus(0.16, 0.016, 6, 12, S.paintLight, { x: sd * 0.34, y: 9.26, ry: sd > 0 ? 0 : Math.PI }));
    // Twin aerodynamic cobra-head luminaires + cooling fins + glowing LED diffusers
    P.push(rslab(0.88, 0.37, 0.1, 0.13, S.paintLight, { x: sd * 2.42, y: 9.935, rx: Math.PI / 2 }, 4));
    P.push(rslab(0.72, 0.28, 0.045, 0.1, S.galvDark, { x: sd * 2.38, y: 9.995, rx: Math.PI / 2 }, 4));
    P.push(rslab(0.68, 0.25, 0.014, 0.09, S.ledPanel, { x: sd * 2.42, y: 9.876, rx: Math.PI / 2 }, 4));
    P.push(cyl(0.032, 0.032, 0.045, 8, S.black, { x: sd * 2.25, y: 10.03 }));
  }
  // Centre finial spire
  P.push(sphere(0.125, 14, 6, S.paintLight, { y: 9.75 }, 0, Math.PI / 2));
  P.push(cyl(0.02, 0.045, 0.22, 8, S.paintLight, { y: 9.92 }));
  P.push(sphere(0.038, 10, 6, S.brass, { y: 10.05 }));
  return mergeParts(P);
}

export function lampPost() {
  const P = [];
  // Stepped octagonal cast-iron plinth + fluted lower pedestal + decorative collar rings
  P.push(cyl(0.24, 0.26, 0.06, 8, S.castIron, { y: 0.03 }));
  flutedPlinth(P, 0.06, 0.88, 0.18, 0.075, S.castIron, 8);
  P.push(lathe([[0.068, 0.88], [0.052, 3.12]], 14, S.castIron));
  for (const y of [1.55, 2.35, 3.1]) {
    P.push(lathe([[0.052, y - 0.045], [0.082, y - 0.018], [0.082, y + 0.018], [0.052, y + 0.045]], 14, S.castIron));
  }
  // Ladder rest cross-bar under lantern (classic heritage post detail)
  P.push(cyl(0.014, 0.014, 0.46, 8, S.castIron, { y: 3.02, rx: Math.PI / 2 }));
  P.push(sphere(0.024, 8, 6, S.brass, { y: 3.02, z: -0.23 }));
  P.push(sphere(0.024, 8, 6, S.brass, { y: 3.02, z: 0.23 }));
  // Ornate capital neck up to the lantern base
  P.push(lathe([[0.052, 3.14], [0.075, 3.3], [0.062, 3.42], [0.11, 3.5], [0.21, 3.58], [0.21, 3.62]], 14, S.castIron));
  // Lantern cage around the glowing glass box (bulbPost 0.34 x 0.46 x 0.34 centred at 3.85)
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    P.push(box(0.028, 0.5, 0.028, S.castIron, { x: x * 0.18, y: 3.85, z: z * 0.18 }));
    P.push(rod([x * 0.06, 3.38, z * 0.06], [x * 0.17, 3.6, z * 0.17], 0.012, 6, S.castIron));
  }
  P.push(box(0.41, 0.032, 0.41, S.castIron, { y: 3.61 }));
  P.push(box(0.42, 0.035, 0.42, S.castIron, { y: 4.09 }));
  // Glowing internal LED mantle core + brass burner base inside cage
  P.push(cyl(0.045, 0.055, 0.12, 10, S.brass, { y: 3.68 }));
  P.push(cyl(0.055, 0.045, 0.24, 12, S.ledPanel, { y: 3.86 }));
  // Pyramidal cupola hood + ventilator ring + brass finial ball & spike
  const cone = new THREE.ConeGeometry(0.34, 0.25, 4, 1);
  cone.computeVertexNormals();
  P.push(part(cone, S.castIron, { y: 4.22, ry: Math.PI / 4 }));
  P.push(cyl(0.022, 0.045, 0.12, 8, S.castIron, { y: 4.4 }));
  P.push(sphere(0.038, 10, 6, S.brass, { y: 4.48 }));
  return mergeParts(P);
}

export function tlPole() {
  const P = [];
  poleBase(P, 0.24, S.galvDark);
  pole(P, 0.11, 6.85, 0.15, 0.11, S.galvDark, { seg: 16, collars: [2.4, 5.75, 6.58] });
  // Mast-arm gusseted clamp plate, upper tie-rod lug, and controller cabinet box
  P.push(box(0.11, 0.38, 0.32, S.galvDark, { x: 0.13, y: 5.92 }));
  P.push(box(0.07, 0.14, 0.14, S.galvDark, { x: 0.12, y: 6.62 }));
  P.push(rslab(0.18, 0.28, 0.12, 0.02, S.galv, { x: -0.16, y: 3.4, ry: Math.PI / 2 }));
  // Crosswalk ADA push-button box on the pole (+X side) with instruction placard & raised button
  P.push(rslab(0.12, 0.2, 0.08, 0.02, S.reflYellow, { x: 0.18, y: 1.1, ry: Math.PI / 2 }));
  P.push(box(0.01, 0.1, 0.09, S.white, { x: 0.222, y: 1.14 }));
  P.push(cyl(0.028, 0.028, 0.026, 12, S.black, { x: 0.222, y: 1.05, rz: Math.PI / 2 }));
  P.push(cyl(0.018, 0.018, 0.032, 12, S.chrome, { x: 0.228, y: 1.05, rz: Math.PI / 2 }));
  // Pedestrian walk/don't-walk signal box facing across the street (+X) with ribbed casing & visor hood
  P.push(box(0.2, 0.045, 0.045, S.galvDark, { x: 0.18, y: 2.52 }));
  P.push(box(0.2, 0.045, 0.045, S.galvDark, { x: 0.18, y: 2.88 }));
  P.push(rslab(0.38, 0.42, 0.24, 0.035, S.signalBody, { x: 0.38, y: 2.7, ry: Math.PI / 2 }));
  for (const ry of [2.56, 2.7, 2.84]) P.push(box(0.22, 0.016, 0.39, S.signalBody, { x: 0.37, y: ry }));
  P.push(box(0.014, 0.32, 0.32, S.black, { x: 0.502, y: 2.7 }));
  // Upper Don't-Walk orange hand + lower Walk figure silhouette
  P.push(box(0.014, 0.11, 0.09, S.pedHand, { x: 0.51, y: 2.78, z: -0.05 }));
  P.push(box(0.014, 0.11, 0.07, S.pedWalk, { x: 0.51, y: 2.61, z: 0.05 }));
  const pedVisor = new THREE.CylinderGeometry(0.21, 0.21, 0.17, 12, 1, true, Math.PI, Math.PI);
  pedVisor.computeVertexNormals();
  P.push(part(pedVisor, S.signalBody, { x: 0.58, y: 2.72, rz: -Math.PI / 2, sz: 0.92 }));
  return mergeParts(P);
}

export function tlArm() {
  // Unit arm along +X (instance X scale = arm length): tapered mast arm + tie rod + clamps + end cap
  const P = [];
  P.push(rod([0.08, 5.92, 0], [1.0, 5.92, 0], 0.098, 12, S.galvDark, 0.068));
  P.push(rod([0.08, 6.62, 0], [0.58, 5.97, 0], 0.022, 8, S.galvDark));
  for (const xm of [0.58, 0.96]) {
    P.push(box(0.028, 0.22, 0.18, S.galv, { x: xm, y: 5.92 }));
  }
  P.push(box(0.015, 0.17, 0.17, S.galvDark, { x: 1.0, y: 5.92 }));
  P.push(rod([0.995, 5.84, 0], [0.995, 6.02, 0], 0.032, 8, S.galvDark));
  return mergeParts(P);
}

/** Signal head: lenses face +X; slots along Y (vertical) or Z (horizontal), red at +Y / -Z. */
function tlHead(horiz) {
  const P = [];
  grime = 0;
  const W = horiz ? 1.06 : 0.39, H = horiz ? 0.39 : 1.06;
  const at = (o) => (horiz ? { y: 0, z: -o } : { y: o, z: 0 });
  // Ribbed polycarbonate housing: main rounded body (x -0.15..0.15) + structural cooling/stiffener ribs
  P.push(rslab(W, H, 0.3, 0.07, S.signalBody, { ry: Math.PI / 2 }, 4));
  for (const ro of [-0.33, -0.165, 0, 0.165, 0.33]) {
    const rt = at(ro);
    if (horiz) P.push(box(0.28, H + 0.024, 0.018, S.signalYellow, { x: -0.01, y: 0, z: rt.z }));
    else P.push(box(0.28, 0.018, W + 0.024, S.signalYellow, { x: -0.01, y: rt.y, z: 0 }));
  }
  // High-contrast black louver backplate with retro-reflective white/yellow border frame
  const bw = 0.048, BH = H + 0.26, BW = W + 0.26;
  P.push(box(0.02, BH - bw * 2, BW - bw * 2, S.black, { x: -0.165 }));
  P.push(box(0.028, bw, BW, S.reflWhite, { x: -0.165, y: BH / 2 - bw / 2 }));
  P.push(box(0.028, bw, BW, S.reflWhite, { x: -0.165, y: -BH / 2 + bw / 2 }));
  P.push(box(0.028, BH - bw * 2, bw, S.reflWhite, { x: -0.165, z: BW / 2 - bw / 2 }));
  P.push(box(0.028, BH - bw * 2, bw, S.reflWhite, { x: -0.165, z: -BW / 2 + bw / 2 }));
  // Top hanger goose-neck bracket
  P.push(cyl(0.032, 0.032, 0.28, 8, S.galvDark, { y: H / 2 + 0.14 }));
  P.push(box(0.14, 0.055, 0.14, S.galvDark, { y: H / 2 + 0.02 }));
  const lens = [S.lensR, S.lensY, S.lensG];
  [0.33, 0, -0.33].forEach((o, i) => {
    const t = at(o);
    // Bezel door ring, domed R/Y/G cobweb lens (just behind the lit lamp disc at x = 0.168), and deep tunnel sun visor hood
    P.push(torus(0.13, 0.018, 6, 18, S.signalBody, { x: 0.152, y: t.y, z: t.z, ry: Math.PI / 2 }));
    P.push(sphere(1, 18, 5, lens[i], { x: 0.145, y: t.y, z: t.z, rz: -Math.PI / 2, sx: 0.122, sy: 0.02, sz: 0.122 }, 0, Math.PI / 2));
    const visor = new THREE.CylinderGeometry(0.152, 0.152, 0.25, 16, 1, true, Math.PI * 0.8, Math.PI * 1.4);
    visor.computeVertexNormals();
    P.push(part(visor, S.signalBody, { x: 0.272, y: t.y + 0.006, z: t.z, rz: -Math.PI / 2 }));
  });
  grime = 1;
  return mergeParts(P);
}

export const tlHeadV = () => tlHead(false);
export const tlHeadH = () => tlHead(true);

export function hydrant() {
  const P = [];
  // Authentic cast-iron fire hydrant: base flange, fluted barrel, upper bonnet flange, domed bonnet, pentagon operating nut
  P.push(lathe([
    [0.0, 0.0], [0.175, 0.0], [0.175, 0.045], [0.13, 0.068], [0.118, 0.1],
    [0.12, 0.49], [0.152, 0.505], [0.152, 0.555], [0.132, 0.568],
    [0.126, 0.61], [0.102, 0.665], [0.062, 0.695], [0.0, 0.705],
  ], 20, S.hydrantRed));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.push(cyl(0.01, 0.01, 0.36, 6, S.hydrantRed, { x: Math.cos(a) * 0.122, y: 0.29, z: Math.sin(a) * 0.122 }));
    P.push(cyl(0.015, 0.015, 0.028, 6, S.hydrantCap, { x: Math.cos(a) * 0.15, y: 0.048, z: Math.sin(a) * 0.15 }));
    P.push(cyl(0.013, 0.013, 0.024, 6, S.hydrantCap, { x: Math.cos(a) * 0.14, y: 0.558, z: Math.sin(a) * 0.14 }));
  }
  P.push(cyl(0.054, 0.054, 0.016, 12, S.hydrantCap, { y: 0.698 }));
  P.push(cyl(0.036, 0.036, 0.052, 5, S.hydrantCap, { y: 0.728 }));
  const nozzle = (dir, r, len, y) => {
    const t = (d) => (dir === 'x' ? { x: d, y, rz: -Math.PI / 2 } : { z: dir === 'z' ? d : -d, y, rx: dir === 'z' ? Math.PI / 2 : -Math.PI / 2 });
    P.push(cyl(r * 1.14, r * 1.18, 0.02, 16, S.hydrantRed, t(0.11)));
    P.push(cyl(r, r * 1.08, len, 16, S.hydrantRed, t(0.11 + len / 2)));
    P.push(cyl(r * 1.16, r * 1.16, 0.038, 16, S.hydrantCap, t(0.11 + len + 0.018)));
    P.push(cyl(r * 0.46, r * 0.46, 0.032, 5, S.hydrantCap, t(0.11 + len + 0.052)));
    if (dir === 'x') {
      P.push(torus(0.045, 0.006, 5, 12, S.hydrantCap, { x: 0.16, y: y - 0.055, ry: Math.PI / 2 }, Math.PI * 1.2));
    } else {
      const zs = dir === 'z' ? 1 : -1;
      P.push(torus(0.038, 0.006, 5, 10, S.hydrantCap, { z: zs * 0.15, y: y - 0.048 }, Math.PI * 1.2));
    }
  };
  nozzle('x', 0.068, 0.065, 0.37);
  nozzle('z', 0.044, 0.055, 0.41);
  nozzle('-z', 0.044, 0.055, 0.41);
  return mergeParts(P);
}

export function bin() {
  const P = [];
  // Slatted heritage cast-iron & timber litter bin: stepped plinth base, dark liner, 24 vertical slats, gold bands, domed hood
  P.push(lathe([[0.0, 0.0], [0.27, 0.0], [0.28, 0.03], [0.28, 0.07], [0.255, 0.095]], 22, S.binGreen));
  P.push(lathe([[0.235, 0.08], [0.255, 0.86]], 20, S.binInner));
  const n = 24;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 0.264;
    P.push(box(0.014, 0.74, 0.046, k % 3 === 0 ? S.wood : S.binGreen, { x: Math.cos(a) * r, y: 0.45, z: Math.sin(a) * r, ry: -a }));
  }
  for (const y of [0.13, 0.46, 0.8]) {
    P.push(torus(0.27, 0.015, 6, 24, y === 0.46 ? S.brass : S.binGreen, { y, rx: Math.PI / 2 }));
  }
  P.push(lathe([[0.292, 0.855], [0.292, 0.905], [0.275, 0.96], [0.21, 1.01], [0.11, 1.035], [0.0, 1.04]], 22, S.binGreen));
  P.push(cyl(0.07, 0.07, 0.012, 14, S.brass, { y: 1.042 }));
  P.push(box(0.08, 0.11, 0.34, S.binInner, { x: 0.22, y: 0.93 }));
  P.push(box(0.08, 0.11, 0.34, S.binInner, { x: -0.22, y: 0.93 }));
  return mergeParts(P);
}

export function bench() {
  const P = [];
  // Ornate cast-iron end frames & centre support with curved scroll armrests
  const frame = [
    [0.25, 0], [0.31, 0], [0.23, 0.4], [0.28, 0.62], [0.26, 0.67], [-0.06, 0.67], [-0.09, 0.61], [0.17, 0.61],
    [0.17, 0.45], [-0.22, 0.45], [-0.31, 0.96], [-0.37, 0.96], [-0.28, 0.42], [-0.31, 0], [-0.25, 0], [-0.2, 0.38], [0.18, 0.38],
  ];
  for (const z of [-0.84, 0, 0.84]) {
    P.push(plate(frame, z === 0 ? 0.036 : 0.052, S.castIron, { z }, 0.006));
    if (z !== 0) {
      P.push(torus(0.068, 0.016, 6, 14, S.castIron, { x: 0.21, y: 0.58, z }));
      P.push(torus(0.055, 0.014, 6, 12, S.castIron, { x: -0.02, y: 0.56, z }));
      P.push(box(0.1, 0.025, 0.1, S.castIron, { x: 0.27, y: 0.012, z }));
      P.push(box(0.1, 0.025, 0.1, S.castIron, { x: -0.27, y: 0.012, z }));
    }
  }
  P.push(cyl(0.016, 0.016, 1.72, 8, S.castIron, { x: -0.02, y: 0.26, rx: Math.PI / 2 }));
  // Contoured curved wooden slat seat (7 slats following an ergonomic seat curve)
  const seatCurve = [
    [0.21, 0.455, -0.22], [0.15, 0.472, -0.06], [0.085, 0.476, 0.02],
    [0.02, 0.472, 0.05], [-0.045, 0.466, 0.04], [-0.11, 0.464, -0.02], [-0.175, 0.472, -0.12],
  ];
  seatCurve.forEach(([x, y, rz], i) => {
    P.push(rslab(0.056, 0.028, 1.88, 0.009, i % 2 ? S.wood2 : S.wood, { x, y, rz }));
  });
  // Contoured wooden backrest slats (5 slats following lumbar curve)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = 0.56 + t * 0.36;
    const x = -0.23 - t * 0.085 + Math.sin(t * Math.PI) * 0.015;
    P.push(rslab(0.028, 0.064, 1.88, 0.009, i % 2 ? S.wood : S.wood2, { x, y, rz: 0.2 - t * 0.06 }));
  }
  return mergeParts(P);
}

export function bollard() {
  const P = [];
  // Cast-iron street bollard with bolted octagonal base flange, fluted body, dual reflective bands, and domed finial cap
  P.push(cyl(0.135, 0.145, 0.032, 8, S.castIron, { y: 0.016 }));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    P.push(cyl(0.012, 0.012, 0.025, 6, S.bolt, { x: Math.cos(a) * 0.118, y: 0.032, z: Math.sin(a) * 0.118 }));
  }
  P.push(lathe([
    [0.0, 0.0], [0.12, 0.0], [0.12, 0.04], [0.102, 0.07], [0.096, 0.12],
    [0.092, 0.58], [0.104, 0.6], [0.09, 0.62], [0.09, 0.82],
    [0.102, 0.835], [0.086, 0.86], [0.065, 0.91], [0.035, 0.935], [0.0, 0.945],
  ], 18, S.castIron));
  P.push(cyl(0.094, 0.094, 0.045, 18, S.reflWhite, { y: 0.74 }, true));
  P.push(cyl(0.094, 0.094, 0.035, 18, S.reflYellow, { y: 0.66 }, true));
  for (const sz of [-1, 1]) P.push(torus(0.024, 0.007, 6, 10, S.castIron, { y: 0.79, z: sz * 0.095, ry: Math.PI / 2 }));
  return mergeParts(P);
}

export function busStop() {
  const P = [];
  // Modern architectural transit shelter: 4 stainless/aluminium columns with base plates, arched roof ribs,
  // rear windbreak frame with mullions, double-sided illuminated ad lightbox, contoured wooden slat bench, and route totem
  for (const [x, z] of [[-0.72, -2.2], [-0.72, 2.2], [0.6, -2.2], [0.6, 2.2]]) {
    P.push(cyl(0.048, 0.048, 2.52, 12, S.alu, { x, y: 1.26, z }));
    P.push(cyl(0.085, 0.09, 0.035, 12, S.galvDark, { x, y: 0.017, z }));
  }
  P.push(box(0.09, 0.11, 4.56, S.alu, { x: -0.72, y: 2.49 }));
  P.push(box(0.09, 0.11, 4.56, S.alu, { x: 0.6, y: 2.49 }));
  for (const z of [-2.2, -1.1, 0, 1.1, 2.2]) {
    const rib = new THREE.CylinderGeometry(3.18, 3.18, 0.055, 20, 1, true, -0.3, 0.6);
    rib.computeVertexNormals();
    rib.rotateX(Math.PI / 2);
    rib.rotateZ(Math.PI / 2);
    P.push(part(rib, S.galvDark, { x: -0.06, y: 2.55 - 3.18, z }));
  }
  const arc = new THREE.CylinderGeometry(3.22, 3.22, 4.74, 22, 1, true, -0.3, 0.6);
  arc.computeVertexNormals();
  arc.rotateX(Math.PI / 2);
  arc.rotateZ(Math.PI / 2);
  P.push(part(arc, S.paintLight, { x: -0.06, y: 2.57 - 3.22 }));
  P.push(rslab(0.75, 1.4, 0.03, 0.03, S.black, { x: -0.06, y: 2.62, z: 0.6, rx: Math.PI / 2 }));
  P.push(box(0.08, 0.022, 3.8, S.ledPanel, { x: -0.06, y: 2.48, z: 0 }));
  P.push(box(0.055, 0.055, 4.42, S.alu, { x: -0.72, y: 0.22 }));
  P.push(box(0.055, 0.055, 4.42, S.alu, { x: -0.72, y: 2.22 }));
  for (const z of [-1.45, -0.72, 0, 0.72, 1.45]) {
    P.push(box(0.042, 2.04, 0.042, S.alu, { x: -0.72, y: 1.22, z }));
    for (const y of [0.55, 1.85]) P.push(box(0.075, 0.045, 0.06, S.chrome, { x: -0.72, y, z }));
  }
  P.push(box(1.32, 0.055, 0.055, S.alu, { x: -0.06, y: 0.22, z: 2.18 }));
  P.push(box(1.32, 0.055, 0.055, S.alu, { x: -0.06, y: 2.22, z: 2.18 }));
  P.push(box(0.042, 2.04, 0.042, S.alu, { x: -0.06, y: 1.22, z: 2.18 }));
  // Illuminated double-sided ad lightbox frame at the -Z end
  P.push(rslab(1.28, 1.9, 0.14, 0.045, S.castIron, { x: -0.08, y: 1.3, z: -2.25 }));
  P.push(rslab(1.18, 1.8, 0.15, 0.03, S.alu, { x: -0.08, y: 1.3, z: -2.25 }));
  P.push(box(1.1, 1.7, 0.012, S.adLight, { x: -0.08, y: 1.3, z: -2.172 }));
  P.push(box(1.1, 1.7, 0.012, S.adLight, { x: -0.08, y: 1.3, z: -2.328 }));
  // Route map / timetable display case mounted on rear mullion frame
  P.push(rslab(0.04, 0.85, 0.65, 0.02, S.alu, { x: -0.69, y: 1.38, z: -1.08 }));
  P.push(box(0.012, 0.76, 0.56, S.adLight, { x: -0.665, y: 1.38, z: -1.08 }));
  // Contoured wooden slat bench inside shelter on 3 cantilevered brackets with armrests
  for (let i = 0; i < 5; i++) {
    P.push(rslab(0.062, 0.03, 2.1, 0.01, i % 2 ? S.wood2 : S.wood, { x: -0.34 - i * 0.072, y: 0.47 + Math.sin((i / 4) * Math.PI) * 0.012, z: 0.62 }));
  }
  for (let i = 0; i < 3; i++) {
    P.push(rslab(0.026, 0.065, 2.1, 0.008, i % 2 ? S.wood : S.wood2, { x: -0.68, y: 0.62 + i * 0.095, z: 0.62 }));
  }
  for (const z of [-0.25, 0.62, 1.48]) {
    P.push(box(0.38, 0.045, 0.045, S.castIron, { x: -0.52, y: 0.43, z }));
    P.push(rod([-0.7, 0.26, z], [-0.38, 0.43, z], 0.02, 6, S.castIron));
    P.push(torus(0.08, 0.014, 6, 12, S.alu, { x: -0.46, y: 0.52, z, rz: Math.PI / 2 }, Math.PI));
  }
  // Curbside transit route sign pole, blue header flag, route number tiles, and schedule card
  P.push(cyl(0.042, 0.046, 2.95, 12, S.alu, { x: 0.75, y: 1.475, z: -2.6 }));
  P.push(cyl(0.085, 0.095, 0.04, 12, S.galvDark, { x: 0.75, y: 0.02, z: -2.6 }));
  P.push(rslab(0.065, 0.54, 0.58, 0.04, S.busBlue, { x: 0.75, y: 2.52, z: -2.6, ry: Math.PI / 2 }));
  P.push(box(0.072, 0.13, 0.44, S.white, { x: 0.75, y: 2.62, z: -2.6 }));
  P.push(box(0.072, 0.09, 0.44, S.reflYellow, { x: 0.75, y: 2.4, z: -2.6 }));
  P.push(rslab(0.045, 0.52, 0.34, 0.02, S.white, { x: 0.75, y: 1.6, z: -2.6, ry: Math.PI / 2 }));
  return mergeParts(P);
}

/** Bus shelter glazing (drawn with a transparent material, same instance matrices as busStopNear). */
export function busStopGlass() {
  const P = [];
  for (const [z0, z1] of [[-2.16, -1.47], [-1.43, -0.74], [-0.7, 0.0], [0.04, 0.7], [0.74, 1.43], [1.47, 2.16]]) {
    P.push(box(0.012, 1.94, z1 - z0, S.white, { x: -0.72, y: 1.22, z: (z0 + z1) / 2 }));
  }
  P.push(box(1.24, 1.94, 0.012, S.white, { x: -0.06, y: 1.22, z: 2.18 }));
  const canopyGlass = new THREE.CylinderGeometry(3.2, 3.2, 4.66, 20, 1, true, -0.29, 0.58);
  canopyGlass.computeVertexNormals();
  canopyGlass.rotateX(Math.PI / 2);
  canopyGlass.rotateZ(Math.PI / 2);
  P.push(part(canopyGlass, S.white, { x: -0.06, y: 2.56 - 3.2 }));
  return mergeParts(P);
}

/** Classic arched street postal mailbox with 4 flared legs, mail chute pull-handle, and schedule card. */
export function mailbox() {
  const P = [];
  for (const [x, z] of [[-0.22, -0.22], [-0.22, 0.22], [0.22, -0.22], [0.22, 0.22]]) {
    P.push(box(0.045, 0.32, 0.045, S.mailBlue, { x, y: 0.16, z }));
    P.push(box(0.07, 0.02, 0.07, S.castIron, { x, y: 0.01, z }));
  }
  P.push(rslab(0.52, 0.64, 0.54, 0.03, S.mailBlue, { y: 0.62 }));
  const dome = new THREE.CylinderGeometry(0.26, 0.26, 0.54, 16, 1, false, -Math.PI / 2, Math.PI);
  dome.computeVertexNormals();
  dome.rotateZ(Math.PI / 2);
  dome.rotateY(Math.PI / 2);
  P.push(part(dome, S.mailBlue, { y: 0.94 }));
  P.push(box(0.08, 0.16, 0.38, S.mailBlue, { x: 0.28, y: 0.88, rz: -0.25 }));
  P.push(torus(0.045, 0.008, 6, 10, S.chrome, { x: 0.33, y: 0.9, rz: Math.PI / 2 }, Math.PI));
  P.push(box(0.012, 0.14, 0.22, S.white, { x: 0.265, y: 0.66 }));
  P.push(box(0.53, 0.028, 0.55, S.reflWhite, { y: 0.52 }));
  return mergeParts(P);
}

/** Sidewalk newspaper dispenser box with pedestal, coin-return mechanism, and display window. */
export function newsbox() {
  const P = [];
  P.push(box(0.38, 0.04, 0.38, S.castIron, { y: 0.02 }));
  P.push(cyl(0.055, 0.065, 0.38, 10, S.castIron, { y: 0.21 }));
  P.push(rslab(0.46, 0.58, 0.42, 0.025, S.newsRed, { y: 0.68 }));
  P.push(box(0.02, 0.28, 0.32, S.white, { x: 0.232, y: 0.66 }));
  P.push(box(0.04, 0.18, 0.1, S.chrome, { x: 0.235, y: 0.86, z: 0.12 }));
  P.push(torus(0.05, 0.009, 6, 10, S.chrome, { x: 0.25, y: 0.82, z: -0.04, rz: Math.PI / 2 }, Math.PI));
  return mergeParts(P);
}

/**
 * Fine-detail standalone parkedCar template geometry (with sculpted wheel arches, 16-segment dark rubber tires,
 * multi-spoke silver alloy wheel hubs, recessed front radiator grille, chrome bumper trim, side-view mirrors,
 * windshield wipers, A/B-pillar window frames, sunroof glass panel, rear license plate recess, and dual exhaust tips).
 */
export function parkedCar() {
  const P = [];
  P.push(rslab(1.86, 0.52, 4.46, 0.08, S.carPaint, { y: 0.56 }, 4));
  P.push(rslab(1.58, 0.48, 2.32, 0.09, S.carPaint, { y: 1.04, z: -0.12 }, 4));
  P.push(box(1.46, 0.42, 0.04, S.carGlass, { y: 1.03, z: 1.02, rx: -0.52 }));
  P.push(box(1.44, 0.4, 0.04, S.carGlass, { y: 1.03, z: -1.24, rx: 0.48 }));
  P.push(box(1.60, 0.36, 1.92, S.carGlass, { y: 1.04, z: -0.12 }));
  P.push(rslab(1.12, 0.82, 0.02, 0.04, S.carGlass, { y: 1.285, z: 0.02, rx: Math.PI / 2 }));
  for (const sx of [-1, 1]) {
    P.push(box(0.03, 0.4, 0.09, S.black, { x: sx * 0.795, y: 1.04, z: -0.08 }));
    P.push(box(0.025, 0.025, 2.15, S.chrome, { x: sx * 0.86, y: 0.83, z: -0.1 }));
    P.push(box(0.12, 0.03, 0.05, S.black, { x: sx * 0.92, y: 0.86, z: 0.78 }));
    P.push(sphere(0.085, 12, 8, S.carPaint, { x: sx * 0.99, y: 0.89, z: 0.76, sx: 1.1, sy: 0.68, sz: 0.82 }));
    P.push(cyl(0.055, 0.055, 0.012, 12, S.chrome, { x: sx * 0.99, y: 0.89, z: 0.70, rx: Math.PI / 2 }));
    for (const hz of [0.22, -0.68]) P.push(box(0.03, 0.028, 0.16, S.chrome, { x: sx * 0.94, y: 0.72, z: hz }));
  }
  for (const wx of [-0.32, 0.24]) {
    P.push(box(0.46, 0.016, 0.02, S.black, { x: wx, y: 0.86, z: 1.14, rz: 0.14 }));
  }
  P.push(box(1.18, 0.22, 0.06, S.black, { y: 0.54, z: 2.22 }));
  for (const gy of [0.49, 0.54, 0.59]) P.push(box(1.12, 0.016, 0.07, S.chrome, { y: gy, z: 2.23 }));
  P.push(box(1.78, 0.045, 0.12, S.chrome, { y: 0.36, z: 2.22 }));
  for (const sx of [-1, 1]) {
    P.push(rslab(0.32, 0.12, 0.06, 0.02, S.ledPanel, { x: sx * 0.68, y: 0.64, z: 2.21 }));
    P.push(rslab(0.34, 0.13, 0.06, 0.02, S.tailRed, { x: sx * 0.66, y: 0.68, z: -2.21 }));
  }
  P.push(box(1.78, 0.045, 0.12, S.chrome, { y: 0.36, z: -2.22 }));
  P.push(box(0.48, 0.16, 0.05, S.black, { y: 0.54, z: -2.22 }));
  P.push(box(0.4, 0.11, 0.06, S.reflWhite, { y: 0.54, z: -2.225 }));
  for (const ex of [-0.52, 0.52]) {
    P.push(cyl(0.042, 0.042, 0.16, 14, S.chrome, { x: ex, y: 0.27, z: -2.24, rx: Math.PI / 2 }, true));
  }
  for (const wz of [1.38, -1.36]) {
    for (const sx of [-1, 1]) {
      P.push(torus(0.39, 0.045, 8, 16, S.carPaint, { x: sx * 0.89, y: 0.35, z: wz, ry: Math.PI / 2 }, Math.PI));
      P.push(cyl(0.35, 0.35, 0.24, 16, S.rubber, { x: sx * 0.82, y: 0.35, z: wz, rz: Math.PI / 2 }));
      P.push(torus(0.29, 0.055, 8, 16, S.rubber, { x: sx * (0.82 + 0.09), y: 0.35, z: wz, ry: Math.PI / 2 }));
      P.push(cyl(0.23, 0.23, 0.25, 16, S.galvDark, { x: sx * 0.82, y: 0.35, z: wz, rz: Math.PI / 2 }));
      P.push(torus(0.23, 0.016, 6, 16, S.chrome, { x: sx * 0.935, y: 0.35, z: wz, ry: Math.PI / 2 }));
      P.push(cyl(0.065, 0.065, 0.265, 12, S.chrome, { x: sx * 0.82, y: 0.35, z: wz, rz: Math.PI / 2 }));
      for (let sp = 0; sp < 5; sp++) {
        const a = (sp / 5) * Math.PI * 2;
        P.push(box(0.022, 0.21, 0.036, S.chrome, {
          x: sx * 0.94,
          y: 0.35 + Math.cos(a) * 0.11,
          z: wz + Math.sin(a) * 0.11,
          rx: -a,
        }));
      }
    }
  }
  return mergeParts(P);
}

export const BUILDERS = {
  lampArm, lampCobra, lampDouble, lampPost,
  tlPole, tlArm, tlHeadV, tlHeadH,
  hydrant, bin, bench, bollard, busStop,
  mailbox, newsbox, parkedCar,
};

/** Builds every near-LOD model once. */
export function buildNearModels() {
  const out = {};
  for (const [k, fn] of Object.entries(BUILDERS)) out[k] = fn();
  return out;
}

export const FURNITURE_UNIFORMS = { uFurnNight: { value: 0 } };

/**
 * Lets a vertex-coloured furniture material take per-vertex roughness / metalness / night emissive from `sfm`
 * (geometries without it read (0,0,0) and keep the material's own values), plus a little ground grime.
 */
export function patchFurnitureMaterial(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uFurnNight = FURNITURE_UNIFORMS.uFurnNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 sfm;\nvarying vec4 vSfm;\nvarying float vSfmY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSfm = sfm;\nvSfmY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFurnNight;\nvarying vec4 vSfm;\nvarying float vSfmY;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - vSfm.w * 0.22 * (1.0 - smoothstep(0.0, 0.45, vSfmY)); // road grime at the foot`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vSfm.x > 0.0) roughnessFactor = vSfm.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (vSfm.x > 0.0) metalnessFactor = vSfm.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSfm.z * uFurnNight;');
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + '|streetProps';
  mat.needsUpdate = true;
}

// ---------- [prop-damage] knock-over state for street props ----------
// type -> [hit points, fall time s, hit radius m, height m, speed kept when a car hits it, max tilt rad]
const DAMAGE_CFG = {
  lampArm: [6, 1.35, 0.16, 8.5, 0.8, 1.48], lampCobra: [6, 1.35, 0.16, 8.8, 0.8, 1.48],
  lampDouble: [8, 1.5, 0.2, 10, 0.75, 1.48], lampPost: [4, 1.0, 0.14, 4.4, 0.86, 1.5],
  tlPole: [8, 1.4, 0.18, 6.8, 0.75, 1.45], bin: [2, 0.55, 0.3, 1.0, 0.97, 1.5708],
  hydrant: [4, 0.45, 0.18, 0.72, 0.9, 1.5708], bench: [4, 0.7, 0.55, 0.95, 0.93, 1.5708],
  signStop: [3, 0.9, 0.12, 2.9, 0.96, 1.52], signSpeed35: [3, 0.9, 0.12, 2.9, 0.96, 1.52],
  signSpeed25: [3, 0.9, 0.12, 2.9, 0.96, 1.52], signSpeed50: [3, 0.9, 0.12, 2.9, 0.96, 1.52],
  signSpeed60: [3, 0.9, 0.12, 2.9, 0.96, 1.52], signWarnPed: [3, 0.9, 0.12, 2.9, 0.96, 1.52],
  signWarnCurve: [3, 0.9, 0.12, 2.9, 0.96, 1.52],
};
const LAMP_TYPES = ['lampArm', 'lampCobra', 'lampDouble', 'lampPost'];
const MAX_DAMAGED = 300;
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _mR = new THREE.Matrix4(), _ax = new THREE.Vector3();

export class PropDamage {
  constructor() {
    this.list = []; // { type, x, y, z, fx, fz, t, T, maxA, slide, px, pz, slots: [{ arr, o, base, mesh }] }
    this.hp = new Map();
    this.anim = 0; // entries still moving
    this.dirty = false; // a new prop went down: StreetFeatures re-runs its refresh (bulbs, signal lamps)
  }

  clear() {
    this.list.length = 0;
    this.hp.clear();
    this.anim = 0;
  }

  isDamageable(type) {
    return !!DAMAGE_CFG[type];
  }

  find(type, x, z, r = 0.35) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.type === type && Math.abs(e.x - x) < r && Math.abs(e.z - z) < r) return e;
    }
    return null;
  }

  /** A lamp whose bulb hangs at head (hx, hz) with rot / height above its base; true when that pole is down. */
  lampDown(hx, hz, rot, hh) {
    if (!this.list.length) return false;
    const ho = hh > 9.5 ? 2.4 : hh > 8.5 ? 2.6 : hh > 8 ? 2.3 : 0;
    const px = hx - Math.cos(rot) * ho, pz = hz + Math.sin(rot) * ho;
    for (const t of LAMP_TYPES) if (this.find(t, px, pz, 0.6)) return true;
    // the far bulb of a double-arm lamp sits 2.4 m the other way
    return hh > 9.5 && !!this.find('lampDouble', hx + Math.cos(rot) * 2.4, hz - Math.sin(rot) * 2.4, 0.6);
  }

  /**
   * Knocks a prop over toward (fx, fz). `pivot` overrides the base point and `sync` copies the fall timing
   * (a signal's arm and head fall with their pole).
   * Returns the entry, or null if it was already down.
   */
  topple(type, x, y, z, fx, fz, pivot = null, cfgType = type, sync = null) {
    if (this.find(type, x, z)) return null;
    const c = DAMAGE_CFG[cfgType] || DAMAGE_CFG.tlPole;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l; fz /= l;
    const r = c[2];
    const e = {
      type, x, y, z, fx, fz, t: 0, T: sync ? sync.T : c[1] * (0.85 + Math.random() * 0.3), maxA: sync ? sync.maxA : c[5] - Math.random() * 0.05,
      slide: c[3] < 1.2 ? 0.6 + Math.random() * 0.8 : 0,
      px: pivot ? pivot[0] : x + fx * r, py: pivot ? pivot[1] : y, pz: pivot ? pivot[2] : z + fz * r, slots: [],
    };
    if (this.list.length >= MAX_DAMAGED) this.list.shift();
    this.list.push(e);
    this.anim++;
    this.dirty = true;
    return e;
  }

  /** Subtracts hit points; true once the prop has none left. */
  hit(type, x, z, dmg) {
    const key = `${type}|${Math.round(x * 4)}|${Math.round(z * 4)}`;
    const left = (this.hp.has(key) ? this.hp.get(key) : (DAMAGE_CFG[type] || [4])[0]) - dmg;
    this.hp.set(key, left);
    if (this.hp.size > 600) this.hp.delete(this.hp.keys().next().value);
    return left <= 0;
  }

  /** Writes the current fallen pose of `e` over the instance matrix at arr[o] (base = the upright matrix). */
  pose(e, arr, o, base) {
    const k = Math.min(1, e.t / e.T);
    // falls with gravity (quadratic), a small bounce on landing
    let a = e.maxA * k * k;
    if (k >= 1) a = e.maxA - 0.06 * Math.max(0, Math.sin(Math.min(1, (e.t - e.T) / 0.35) * Math.PI)) * Math.exp(-(e.t - e.T) * 4);
    const s = e.slide * (1 - (1 - k) * (1 - k));
    _ax.set(e.fz, 0, -e.fx); // up x fall direction
    _mR.makeRotationAxis(_ax, a);
    _mA.makeTranslation(-e.px, -e.py, -e.pz);
    _mB.makeTranslation(e.px + e.fx * s, e.py, e.pz + e.fz * s);
    _mR.multiply(_mA);
    _mB.multiply(_mR);
    _mA.fromArray(base);
    _mB.multiply(_mA);
    _mB.toArray(arr, o);
  }

  /** Records an instance slot drawn for a damaged prop and poses it. */
  place(e, mesh, idx) {
    const arr = mesh.instanceMatrix.array, o = idx * 16;
    const base = new Float32Array(16);
    for (let i = 0; i < 16; i++) base[i] = arr[o + i];
    e.slots.push({ mesh, o, base });
    this.pose(e, arr, o, base);
  }

  /** Advances falling props; touches only the instance slots that move. */
  update(dt) {
    if (!this.anim) return;
    let moving = 0;
    for (const e of this.list) {
      if (e.t > e.T + 0.4) continue;
      e.t += dt;
      moving++;
      for (const sl of e.slots) {
        this.pose(e, sl.mesh.instanceMatrix.array, sl.o, sl.base);
        sl.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.anim = moving;
  }
}

export const PROP_DAMAGE_CFG = DAMAGE_CFG;

export function claimNearestParkedCar(app, px, pz, maxDist = 7.5) {
  if (!app) return null;
  if (app.placesInfo && typeof app.placesInfo.claimNearestParkedCar === 'function') {
    const hit = app.placesInfo.claimNearestParkedCar(px, pz, maxDist);
    if (hit) return hit;
  }
  return null;
}

export function damageParkedCarsInRadius(app, wx, wz, radius = 5, damage = 45) {
  if (!app) return 0;
  let hits = 0;
  if (app.placesInfo && typeof app.placesInfo.damageParkedCarsInRadius === 'function') {
    hits += app.placesInfo.damageParkedCarsInRadius(wx, wz, radius, damage);
  }
  return hits;
}
