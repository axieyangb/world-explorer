// [street-props] Detailed near-LOD street furniture: lamps, traffic signals, hydrants, bins, benches, bollards,
// bus shelters. StreetFeatures (street_furniture.js) draws these for instances within NEAR_CFG distance of the
// camera and keeps its light box models beyond that, so each type costs two instanced draw calls at most.
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
  black: { c: [0.025, 0.025, 0.028], r: 0.55, m: 0.2 },
  rubber: { c: [0.03, 0.03, 0.03], r: 0.85, m: 0.0 },
  concrete: { c: [0.5, 0.49, 0.46], r: 0.92, m: 0.0 },
  bolt: { c: [0.42, 0.43, 0.43], r: 0.35, m: 0.8 },
  refractor: { c: [0.78, 0.78, 0.74], r: 0.12, m: 0.0, e: 0.55 },
  ledPanel: { c: [0.92, 0.9, 0.84], r: 0.2, m: 0.0, e: 0.9 },
  white: { c: [0.86, 0.87, 0.86], r: 0.5, m: 0.05 },
  signalBody: { c: [0.06, 0.065, 0.07], r: 0.5, m: 0.3 },
  lensR: { c: [0.2, 0.025, 0.02], r: 0.08, m: 0.1 },
  lensY: { c: [0.26, 0.14, 0.015], r: 0.08, m: 0.1 },
  lensG: { c: [0.02, 0.15, 0.1], r: 0.08, m: 0.1 },
  pedHand: { c: [0.95, 0.42, 0.08], r: 0.3, m: 0.0, e: 1.6 },
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

/** Bakes one part: transform, flat surface preset into color + sfm, and only position/normal kept. */
function part(geom, surf, t) {
  let g = geom.index ? geom.toNonIndexed() : geom;
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
  return part(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), surf, t);
}
const cyl = (rt, rb, h, seg, surf, t, open = false) => part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), surf, t);
const box = (w, h, d, surf, t) => part(new THREE.BoxGeometry(w, h, d), surf, t);
const sphere = (r, ws, hs, surf, t, th0 = 0, thL = Math.PI) => part(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, th0, thL), surf, t);

/** Rod between two 3D points. */
function rod(a, b, r, seg, surf, rb = r) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, rb, len, seg, 1, true);
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
  return part(g, surf, t);
}

/** Extruded polygon outline (XY plane), thickness along Z, centred on z = 0. */
function plate(pts, d, surf, t, bevel = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -d / 2 + bevel);
  return part(g, surf, t);
}

// ---------- shared sub-assemblies ----------

/** Anchor-bolted base: concrete footing, flange plate, 4 nuts. */
function poleBase(parts, flangeR, surf = S.galv, footing = true) {
  if (footing) parts.push(cyl(flangeR + 0.14, flangeR + 0.18, 0.08, 16, S.concrete, { y: 0.0 }));
  parts.push(cyl(flangeR, flangeR, 0.03, 16, surf, { y: 0.095 }));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, rr = flangeR * 0.78;
    parts.push(cyl(0.022, 0.022, 0.05, 6, S.bolt, { x: Math.cos(a) * rr, y: 0.13, z: Math.sin(a) * rr }));
  }
}

/** Tapered round pole from y0 to y1 with a cap and handhole door facing -X (away from the road). */
function pole(parts, y0, y1, rb, rt, surf, { door = true, cap = true, seg = 14 } = {}) {
  parts.push(lathe([[rb * 1.12, y0], [rb * 1.12, y0 + 0.12], [rb, y0 + 0.16], [rt, y1]], seg, surf));
  if (cap) parts.push(sphere(rt * 1.05, seg, 4, surf, { y: y1 }, 0, Math.PI / 2));
  if (door) parts.push(rslab(0.1, 0.32, 0.02, 0.02, surf, { x: -rb * 0.98, y: y0 + 0.75, ry: Math.PI / 2 }));
}

// ---------- models ----------

function lampCobra() {
  const P = [];
  poleBase(P, 0.2);
  // cast transformer base + tapered galvanised shaft
  P.push(lathe([[0.2, 0.11], [0.19, 0.5], [0.15, 0.62], [0.14, 0.7]], 16, S.galv));
  pole(P, 0.7, 8.6, 0.13, 0.085, S.galv, { door: false });
  P.push(rslab(0.12, 0.3, 0.02, 0.02, S.galv, { x: -0.19, y: 0.3, ry: Math.PI / 2 }));
  // curved mast arm, slip fitter and cobra head
  P.push(tube([[0.0, 8.2, 0], [0.25, 8.55, 0], [0.9, 8.88, 0], [1.75, 8.98, 0], [2.15, 8.99, 0]], 0.055, 14, 8, S.galv, 0.042));
  P.push(cyl(0.05, 0.05, 0.28, 8, S.galv, { x: 2.18, y: 8.99, rz: Math.PI / 2 }));
  P.push(sphere(1, 20, 8, S.galvDark, { x: 2.68, y: 8.8, sx: 0.6, sy: 0.17, sz: 0.24 }, 0, Math.PI / 2));
  P.push(cyl(0.24, 0.24, 0.025, 20, S.galvDark, { x: 2.68, y: 8.79, sx: 2.5 }));
  // prismatic glass refractor bowl under the head (bulb box sits inside it)
  P.push(sphere(1, 18, 5, S.refractor, { x: 2.7, y: 8.79, sx: 0.44, sy: 0.075, sz: 0.19 }, Math.PI / 2, Math.PI / 2));
  // photocell on top
  P.push(cyl(0.035, 0.035, 0.05, 8, S.black, { x: 2.5, y: 8.985 }));
  P.push(sphere(0.035, 8, 3, S.white, { x: 2.5, y: 9.01 }, 0, Math.PI / 2));
  return mergeParts(P);
}

function lampArm() {
  const P = [];
  poleBase(P, 0.19, S.paintGrey);
  pole(P, 0.11, 8.25, 0.12, 0.07, S.paintGrey);
  // banner bracket studs half way up
  P.push(box(0.04, 0.06, 0.04, S.paintGrey, { x: -0.1, y: 4.2 }));
  P.push(tube([[0, 8.0, 0], [0.18, 8.32, 0], [0.8, 8.46, 0], [1.9, 8.5, 0]], 0.045, 10, 8, S.paintGrey));
  // slim LED luminaire (bottom at 8.385 so the night bulb box sits flush under it)
  P.push(rslab(0.82, 0.34, 0.09, 0.12, S.paintGrey, { x: 2.3, y: 8.43, rx: Math.PI / 2 }, 4));
  P.push(rslab(0.7, 0.26, 0.05, 0.1, S.paintGrey, { x: 2.26, y: 8.49, rx: Math.PI / 2 }, 4));
  P.push(cyl(0.05, 0.05, 0.2, 8, S.paintGrey, { x: 1.9, y: 8.5, rz: Math.PI / 2 }));
  P.push(rslab(0.6, 0.22, 0.01, 0.08, S.ledPanel, { x: 2.32, y: 8.383, rx: Math.PI / 2 }, 4));
  return mergeParts(P);
}

function lampDouble() {
  const P = [];
  P.push(cyl(0.34, 0.38, 0.1, 16, S.concrete));
  P.push(lathe([[0.26, 0.1], [0.25, 0.85], [0.2, 0.95], [0.17, 1.05]], 16, S.paintLight));
  pole(P, 1.05, 9.7, 0.16, 0.1, S.paintLight, { door: false });
  P.push(rslab(0.14, 0.4, 0.02, 0.03, S.paintLight, { x: -0.255, y: 0.5, ry: Math.PI / 2 }));
  for (const sd of [1, -1]) {
    P.push(tube([[0, 9.25, 0], [sd * 0.5, 9.7, 0], [sd * 1.3, 9.97, 0], [sd * 2.05, 10.05, 0]], 0.05, 12, 8, S.paintLight, 0.04));
    P.push(rod([0, 8.9, 0], [sd * 0.9, 9.86, 0], 0.025, 6, S.paintLight));
    P.push(rslab(0.86, 0.36, 0.1, 0.13, S.paintLight, { x: sd * 2.42, y: 9.93, rx: Math.PI / 2 }, 4));
    P.push(rslab(0.66, 0.24, 0.01, 0.09, S.ledPanel, { x: sd * 2.42, y: 9.877, rx: Math.PI / 2 }, 4));
  }
  P.push(sphere(0.12, 12, 4, S.paintLight, { y: 9.7 }, 0, Math.PI / 2));
  return mergeParts(P);
}

function lampPost() {
  const P = [];
  // cast-iron plinth with mouldings, slender shaft with rings, collar and neck up to the lantern
  P.push(lathe([
    [0.2, 0], [0.2, 0.06], [0.17, 0.09], [0.17, 0.3], [0.15, 0.36], [0.12, 0.42], [0.12, 0.62], [0.085, 0.72],
    [0.07, 0.8], [0.07, 0.86], [0.06, 0.9],
  ], 16, S.castIron));
  P.push(lathe([[0.06, 0.9], [0.05, 3.1]], 12, S.castIron));
  for (const y of [1.6, 3.1]) P.push(lathe([[0.05, y - 0.04], [0.075, y - 0.02], [0.075, y + 0.02], [0.05, y + 0.04]], 12, S.castIron));
  P.push(lathe([[0.05, 3.14], [0.07, 3.3], [0.06, 3.42], [0.1, 3.5], [0.2, 3.58], [0.2, 3.62]], 12, S.castIron));
  // lantern cage around the glowing glass box (bulbPost 0.34 x 0.46 x 0.34 centred at 3.85)
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P.push(box(0.03, 0.5, 0.03, S.castIron, { x: x * 0.18, y: 3.85, z: z * 0.18 }));
  P.push(box(0.4, 0.03, 0.4, S.castIron, { y: 3.61 }));
  P.push(box(0.4, 0.03, 0.4, S.castIron, { y: 4.09 }));
  P.push(part(new THREE.ConeGeometry(0.33, 0.24, 4, 1), S.castIron, { y: 4.22, ry: Math.PI / 4 }));
  P.push(cyl(0.02, 0.04, 0.12, 6, S.castIron, { y: 4.4 }));
  P.push(sphere(0.035, 8, 4, S.castIron, { y: 4.47 }));
  return mergeParts(P);
}

function tlPole() {
  const P = [];
  poleBase(P, 0.24, S.galvDark);
  pole(P, 0.11, 6.8, 0.15, 0.11, S.galvDark, { seg: 16 });
  // mast-arm clamp plate and tie-rod lug
  P.push(box(0.1, 0.36, 0.3, S.galvDark, { x: 0.13, y: 5.92 }));
  P.push(box(0.06, 0.12, 0.12, S.galvDark, { x: 0.12, y: 6.62 }));
  // pedestrian push button + pedestrian head facing across the street (+X)
  P.push(rslab(0.1, 0.16, 0.07, 0.02, S.reflYellow, { x: 0.18, y: 1.1, ry: Math.PI / 2 }));
  P.push(cyl(0.025, 0.025, 0.03, 10, S.black, { x: 0.22, y: 1.12, rz: Math.PI / 2 }));
  P.push(box(0.18, 0.04, 0.04, S.galvDark, { x: 0.18, y: 2.7 }));
  P.push(rslab(0.36, 0.38, 0.22, 0.03, S.signalBody, { x: 0.38, y: 2.7, ry: Math.PI / 2 }));
  P.push(box(0.012, 0.28, 0.28, S.black, { x: 0.495, y: 2.7 }));
  P.push(box(0.012, 0.12, 0.1, S.pedHand, { x: 0.502, y: 2.72 }));
  P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10, 1, true, Math.PI, Math.PI), S.signalBody, { x: 0.57, y: 2.72, rz: -Math.PI / 2, sz: 0.9 }));
  return mergeParts(P);
}

function tlArm() {
  // unit arm along +X (instance X scale = arm length): tapered mast arm + tie rod + end cap
  const P = [];
  P.push(rod([0.1, 5.92, 0], [1.0, 5.92, 0], 0.095, 10, S.galvDark, 0.07));
  P.push(rod([0.1, 6.62, 0], [0.55, 5.97, 0], 0.022, 6, S.galvDark));
  P.push(box(0.012, 0.16, 0.16, S.galvDark, { x: 1.0, y: 5.92 }));
  // short hanger stub to the signal head below the arm tip
  P.push(rod([0.995, 5.86, 0], [0.995, 6.0, 0], 0.03, 6, S.galvDark));
  return mergeParts(P);
}

/** Signal head: lenses face +X; slots along Y (vertical) or Z (horizontal), red at +Y / -Z. */
function tlHead(horiz) {
  const P = [];
  grime = 0;
  const W = horiz ? 1.05 : 0.38, H = horiz ? 0.38 : 1.05;
  const at = (o) => (horiz ? { y: 0, z: -o } : { y: o, z: 0 });
  // housing: rounded body (x -0.15..0.15), back plate with retro-reflective border, top hanger
  P.push(rslab(W, H, 0.3, 0.07, S.signalBody, { ry: Math.PI / 2 }, 3));
  const bw = 0.045, BH = H + 0.24, BW = W + 0.24;
  P.push(box(0.018, BH - bw * 2, BW - bw * 2, S.black, { x: -0.165 }));
  P.push(box(0.026, bw, BW, S.reflWhite, { x: -0.165, y: BH / 2 - bw / 2 }));
  P.push(box(0.026, bw, BW, S.reflWhite, { x: -0.165, y: -BH / 2 + bw / 2 }));
  P.push(box(0.026, BH - bw * 2, bw, S.reflWhite, { x: -0.165, z: BW / 2 - bw / 2 }));
  P.push(box(0.026, BH - bw * 2, bw, S.reflWhite, { x: -0.165, z: -BW / 2 + bw / 2 }));
  P.push(cyl(0.03, 0.03, 0.26, 6, S.galvDark, { y: H / 2 + 0.13 }));
  P.push(box(0.12, 0.05, 0.12, S.galvDark, { y: H / 2 + 0.02 }));
  const lens = [S.lensR, S.lensY, S.lensG];
  [0.33, 0, -0.33].forEach((o, i) => {
    const t = at(o);
    // door ring, domed coloured lens (just behind the lit lamp disc at x = 0.168), tunnel visor
    P.push(part(new THREE.TorusGeometry(0.128, 0.016, 5, 16), S.signalBody, { x: 0.152, y: t.y, z: t.z, ry: Math.PI / 2 }));
    P.push(sphere(1, 16, 4, lens[i], { x: 0.145, y: t.y, z: t.z, rz: -Math.PI / 2, sx: 0.12, sy: 0.018, sz: 0.12 }, 0, Math.PI / 2));
    P.push(part(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 14, 1, true, Math.PI * 0.82, Math.PI * 1.36), S.signalBody,
      { x: 0.27, y: t.y + 0.005, z: t.z, rz: -Math.PI / 2 }));
  });
  grime = 1;
  return mergeParts(P);
}

function hydrant() {
  const P = [];
  // barrel with bottom and top flanges, bonnet dome, pentagon operating nut
  P.push(lathe([[0.0, 0.0], [0.16, 0.0], [0.16, 0.05], [0.125, 0.07], [0.115, 0.1], [0.115, 0.5], [0.145, 0.51],
    [0.145, 0.55], [0.13, 0.56], [0.125, 0.6], [0.1, 0.66], [0.06, 0.69], [0.0, 0.7]], 18, S.hydrantRed));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.push(cyl(0.015, 0.015, 0.025, 6, S.hydrantCap, { x: Math.cos(a) * 0.14, y: 0.05, z: Math.sin(a) * 0.14 }));
    P.push(cyl(0.012, 0.012, 0.02, 6, S.hydrantCap, { x: Math.cos(a) * 0.135, y: 0.555, z: Math.sin(a) * 0.135 }));
  }
  P.push(cyl(0.035, 0.035, 0.05, 5, S.hydrantCap, { y: 0.715 }));
  P.push(cyl(0.05, 0.05, 0.012, 12, S.hydrantRed, { y: 0.69 }));
  // pumper nozzle toward the street (+X) and two hose nozzles at the sides, with caps and nuts
  const nozzle = (dir, r, len, y) => {
    const t = (d) => (dir === 'x' ? { x: d, y, rz: -Math.PI / 2 } : { z: dir === 'z' ? d : -d, y, rx: dir === 'z' ? Math.PI / 2 : -Math.PI / 2 });
    P.push(cyl(r, r * 1.1, len, 14, S.hydrantRed, t(0.1 + len / 2)));
    P.push(cyl(r * 1.15, r * 1.15, 0.035, 14, S.hydrantCap, t(0.1 + len + 0.017)));
    P.push(cyl(r * 0.45, r * 0.45, 0.03, 5, S.hydrantCap, t(0.1 + len + 0.05)));
  };
  nozzle('x', 0.065, 0.06, 0.38);
  nozzle('z', 0.042, 0.05, 0.4);
  nozzle('-z', 0.042, 0.05, 0.4);
  return mergeParts(P);
}

function bin() {
  const P = [];
  // slatted steel bin: base ring, body of vertical slats around a dark liner, rolled rim, domed lid with opening
  P.push(lathe([[0.0, 0.0], [0.26, 0.0], [0.27, 0.02], [0.27, 0.06], [0.25, 0.08]], 20, S.binGreen));
  P.push(lathe([[0.235, 0.08], [0.255, 0.86]], 20, S.binInner));
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 0.262;
    P.push(box(0.012, 0.74, 0.05, S.binGreen, { x: Math.cos(a) * r, y: 0.45, z: Math.sin(a) * r, ry: -a }));
  }
  for (const y of [0.12, 0.8]) P.push(part(new THREE.TorusGeometry(0.268, 0.014, 5, 24), S.binGreen, { y, rx: Math.PI / 2 }));
  P.push(lathe([[0.29, 0.86], [0.29, 0.9], [0.27, 0.95], [0.2, 1.0], [0.11, 1.02]], 20, S.binGreen));
  P.push(lathe([[0.11, 1.02], [0.1, 0.98], [0.0, 0.97]], 14, S.binInner));
  return mergeParts(P);
}

function bench() {
  const P = [];
  // cast-iron end frames (side profile in XY: front leg at +X, back rest at -X, armrest on top)
  const frame = [
    [0.24, 0], [0.3, 0], [0.22, 0.4], [0.27, 0.62], [0.25, 0.66], [-0.05, 0.66], [-0.08, 0.6], [0.16, 0.6],
    [0.16, 0.46], [-0.22, 0.46], [-0.3, 0.95], [-0.36, 0.95], [-0.27, 0.42], [-0.3, 0], [-0.24, 0], [-0.2, 0.38], [0.18, 0.38],
  ];
  for (const z of [-0.82, 0.82]) P.push(plate(frame, 0.05, S.castIron, { z }));
  // seat slats and back slats
  for (let i = 0; i < 5; i++) P.push(rslab(0.07, 0.03, 1.86, 0.01, i % 2 ? S.wood2 : S.wood, { x: 0.15 - i * 0.082, y: 0.48 }));
  for (let i = 0; i < 3; i++) {
    const y = 0.6 + i * 0.12, x = -0.24 - (y - 0.46) * 0.17;
    P.push(rslab(0.03, 0.08, 1.86, 0.01, i % 2 ? S.wood : S.wood2, { x, y, rz: 0.17 }));
  }
  return mergeParts(P);
}

function bollard() {
  const P = [];
  P.push(lathe([[0.0, 0.0], [0.12, 0.0], [0.12, 0.03], [0.1, 0.05], [0.095, 0.08], [0.09, 0.82], [0.085, 0.86],
    [0.06, 0.9], [0.03, 0.915], [0.0, 0.92]], 16, S.galvDark));
  P.push(cyl(0.093, 0.093, 0.04, 16, S.reflWhite, { y: 0.72 }, true));
  P.push(cyl(0.093, 0.093, 0.04, 16, S.reflWhite, { y: 0.64 }, true));
  return mergeParts(P);
}

function busStop() {
  const P = [];
  // aluminium frame: 4 posts, roof beams, curved roof canopy, back rails (glass is a separate transparent mesh)
  for (const [x, z] of [[-0.72, -2.2], [-0.72, 2.2], [0.6, -2.2], [0.6, 2.2]]) {
    P.push(cyl(0.045, 0.045, 2.5, 10, S.alu, { x, y: 1.25, z }));
    P.push(cyl(0.07, 0.07, 0.03, 10, S.alu, { x, y: 0.015, z }));
  }
  P.push(box(0.08, 0.1, 4.5, S.alu, { x: -0.72, y: 2.48 }));
  P.push(box(0.08, 0.1, 4.5, S.alu, { x: 0.6, y: 2.48 }));
  for (const z of [-2.2, 0, 2.2]) P.push(box(1.4, 0.08, 0.06, S.alu, { x: -0.06, y: 2.5, z }));
  P.push(box(0.05, 0.05, 4.4, S.alu, { x: -0.72, y: 0.22 }));
  P.push(box(0.05, 0.05, 4.4, S.alu, { x: -0.72, y: 2.2 }));
  for (const z of [-0.75, 0.75]) P.push(box(0.04, 2.0, 0.04, S.alu, { x: -0.72, y: 1.25, z }));
  P.push(box(1.32, 0.05, 0.05, S.alu, { x: -0.06, y: 0.22, z: 2.18 }));
  P.push(box(1.32, 0.05, 0.05, S.alu, { x: -0.06, y: 2.2, z: 2.18 }));
  // canopy: shallow arched roof sheet
  const arc = new THREE.CylinderGeometry(3.2, 3.2, 4.7, 18, 1, true, -0.29, 0.58);
  arc.rotateX(Math.PI / 2);
  arc.rotateZ(Math.PI / 2);
  P.push(part(arc, S.paintLight, { x: -0.06, y: 2.56 - 3.2 + 0.0 }));
  P.push(part(new THREE.CylinderGeometry(3.2, 3.2, 4.7, 18, 1, true, -0.29, 0.58).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), S.paintLight,
    { x: -0.06, y: 2.54 - 3.2 }));
  // lit advertising panel at the closed end (-Z, back half), double sided
  P.push(rslab(1.25, 1.85, 0.12, 0.04, S.alu, { x: -0.08, y: 1.3, z: -2.25 }));
  P.push(box(1.1, 1.7, 0.01, S.adLight, { x: -0.08, y: 1.3, z: -2.19 }));
  P.push(box(1.1, 1.7, 0.01, S.adLight, { x: -0.08, y: 1.3, z: -2.31 }));
  // perforated metal bench on two brackets
  P.push(rslab(0.36, 0.04, 1.9, 0.015, S.alu, { x: -0.5, y: 0.47, z: 0.6 }));
  for (const z of [-0.2, 1.4]) P.push(box(0.3, 0.04, 0.04, S.alu, { x: -0.56, y: 0.43, z }));
  // route sign pole and flag at the kerb side
  P.push(cyl(0.04, 0.04, 2.9, 10, S.alu, { x: 0.75, y: 1.45, z: -2.6 }));
  P.push(rslab(0.06, 0.5, 0.55, 0.04, S.busBlue, { x: 0.75, y: 2.5, z: -2.6, ry: Math.PI / 2 }));
  P.push(box(0.065, 0.12, 0.42, S.white, { x: 0.75, y: 2.6, z: -2.6 }));
  P.push(rslab(0.04, 0.5, 0.32, 0.02, S.white, { x: 0.75, y: 1.6, z: -2.6, ry: Math.PI / 2 }));
  return mergeParts(P);
}

/** Bus shelter glazing (drawn with a transparent material, same instance matrices as busStopNear). */
export function busStopGlass() {
  const P = [];
  for (const [z0, z1] of [[-2.15, -0.77], [-0.73, 0.73], [0.77, 2.15]]) P.push(box(0.012, 1.94, z1 - z0, S.white, { x: -0.72, y: 1.21, z: (z0 + z1) / 2 }));
  P.push(box(1.24, 1.94, 0.012, S.white, { x: -0.06, y: 1.21, z: 2.18 }));
  P.push(box(1.36, 0.012, 4.5, S.white, { x: -0.06, y: 2.6 }));
  return mergeParts(P);
}

const BUILDERS = { lampArm, lampCobra, lampDouble, lampPost, tlPole, tlArm, tlHeadV: () => tlHead(false), tlHeadH: () => tlHead(true), hydrant, bin, bench, bollard, busStop };

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
