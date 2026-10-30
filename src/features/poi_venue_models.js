// [venues-poi] Detailed instanced props for the everyday venues (main thread): fuel dispensers, island bollards and
// bins, ice merchandisers, air / vacuum / pay stations, car-wash brushes, ATMs, news racks, shopping carts, car-park
// lamps and cart returns, drive-thru menu boards, the pharmacy cross and a box trailer, plus cheap far-LOD stand-ins.
// Local frame per model: ground at y = 0; a model's "front" faces +Z (pumps are double-sided along +-X).
// Every vertex carries `pvm` = (roughness, metalness, glow, tint):
//   glow 0..1  lit in daylight too (screens), 1..2 lit at night only (lamps, light boxes), 2..3 blinking at night;
//   tint 0..1  share of the per-instance colour (brand colour panels, cart-return signs ...).
import * as THREE from '../../vendor/three.module.js';

const S = {
  steel: { c: [0.42, 0.44, 0.46], r: 0.38, m: 0.7 }, steelDk: { c: [0.16, 0.17, 0.18], r: 0.45, m: 0.6 },
  chrome: { c: [0.75, 0.76, 0.78], r: 0.14, m: 0.95 }, galv: { c: [0.52, 0.54, 0.54], r: 0.42, m: 0.62 },
  paintW: { c: [0.84, 0.85, 0.84], r: 0.38, m: 0.15 }, paintG: { c: [0.5, 0.52, 0.53], r: 0.4, m: 0.25 },
  tint: { c: [1, 1, 1], r: 0.36, m: 0.2, t: 1 }, tintGlow: { c: [1, 1, 1], r: 0.3, m: 0.0, t: 1, e: 1.6 },
  black: { c: [0.025, 0.025, 0.028], r: 0.5, m: 0.2 }, rubber: { c: [0.02, 0.02, 0.02], r: 0.85, m: 0.0 },
  plasticDk: { c: [0.05, 0.05, 0.055], r: 0.55, m: 0.0 }, plasticR: { c: [0.6, 0.04, 0.03], r: 0.45, m: 0.0 },
  plasticY: { c: [0.85, 0.6, 0.03], r: 0.45, m: 0.0 }, plasticB: { c: [0.04, 0.16, 0.5], r: 0.45, m: 0.0 },
  plasticG: { c: [0.04, 0.4, 0.15], r: 0.45, m: 0.0 },
  yellow: { c: [0.85, 0.62, 0.04], r: 0.4, m: 0.1 }, red: { c: [0.62, 0.05, 0.04], r: 0.4, m: 0.1 },
  concrete: { c: [0.5, 0.49, 0.46], r: 0.92, m: 0.0 },
  screen: { c: [0.25, 0.75, 0.95], r: 0.1, m: 0.0, e: 0.9 }, screenG: { c: [0.3, 1.0, 0.4], r: 0.1, m: 0.0, e: 0.9 },
  screenR: { c: [1.0, 0.18, 0.06], r: 0.1, m: 0.0, e: 0.9 }, glassDk: { c: [0.05, 0.07, 0.08], r: 0.08, m: 0.2 },
  lamp: { c: [1.0, 0.95, 0.85], r: 0.15, m: 0.0, e: 1.9 }, lampCool: { c: [0.9, 0.96, 1.0], r: 0.15, m: 0.0, e: 1.9 },
  iceBlue: { c: [0.15, 0.45, 0.85], r: 0.3, m: 0.0, e: 1.35 }, white: { c: [0.9, 0.9, 0.88], r: 0.45, m: 0.05 },
  paper: { c: [0.82, 0.82, 0.78], r: 0.85, m: 0.0 }, paperB: { c: [0.55, 0.56, 0.58], r: 0.85, m: 0.0 },
  green: { c: [0.1, 0.9, 0.3], r: 0.2, m: 0.0, e: 2.6 }, menu1: { c: [0.95, 0.75, 0.2], r: 0.3, m: 0.0, e: 1.5 },
  menu2: { c: [0.85, 0.2, 0.1], r: 0.3, m: 0.0, e: 1.5 }, menu3: { c: [0.95, 0.92, 0.85], r: 0.3, m: 0.0, e: 1.5 },
  foamB: { c: [0.15, 0.35, 0.95], r: 0.7, m: 0.0, t: 0.8 }, foamR: { c: [0.95, 0.25, 0.55], r: 0.7, m: 0.0 },
  foamY: { c: [0.95, 0.85, 0.2], r: 0.7, m: 0.0 }, trailerW: { c: [1, 1, 1], r: 0.42, m: 0.25, t: 1 },
  wood: { c: [0.36, 0.22, 0.12], r: 0.65, m: 0.05 }, woodLt: { c: [0.58, 0.40, 0.24], r: 0.58, m: 0.05 },
  oak: { c: [0.28, 0.16, 0.08], r: 0.72, m: 0.05 }, brass: { c: [0.85, 0.68, 0.24], r: 0.22, m: 0.88 },
  slate: { c: [0.08, 0.09, 0.10], r: 0.78, m: 0.0 }, velvet: { c: [0.68, 0.06, 0.08], r: 0.75, m: 0.0 },
  lampWarm: { c: [1.0, 0.88, 0.62], r: 0.15, m: 0.0, e: 1.85 }, amber: { c: [0.95, 0.65, 0.15], r: 0.2, m: 0.0, e: 1.55 },
};

// ---------------------------------------------------------------- kit
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
function part(geom, surf, t) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  place(g, t);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    c[i * 3] = surf.c[0]; c[i * 3 + 1] = surf.c[1]; c[i * 3 + 2] = surf.c[2];
    f[i * 4] = surf.r; f[i * 4 + 1] = surf.m; f[i * 4 + 2] = surf.e || 0; f[i * 4 + 3] = surf.t || 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('pvm', new THREE.BufferAttribute(f, 4));
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, sz] of [['position', 3], ['normal', 3], ['color', 3], ['pvm', 4]]) {
    const a = new Float32Array(n * sz);
    let o = 0;
    for (const p of parts) { a.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, sz));
  }
  out.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return out;
}
const box = (w, h, d, s, t) => part(new THREE.BoxGeometry(w, h, d), s, t);
const cyl = (rt, rb, h, seg, s, t, open = false) => part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), s, t);
const sphere = (r, ws, hs, s, t, th0 = 0, thL = Math.PI) => part(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, th0, thL), s, t);
const torus = (r, tube, rs, ts, s, t, arc = Math.PI * 2) => part(new THREE.TorusGeometry(r, tube, rs, ts, arc), s, t);
function rod(a, b, r, seg, s) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return part(g, s);
}
function tube(points, r, segs, radial, s) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return part(new THREE.TubeGeometry(curve, segs, r, radial, false), s);
}
function rslab(w, h, d, r, s, t, seg = 3) {
  const sh = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  sh.moveTo(x0 + r, y0);
  sh.lineTo(x0 + w - r, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -d / 2);
  return part(g, s, t);
}

// ---------------------------------------------------------------- models
function pump() {
  const P = [];
  P.push(rslab(0.66, 1.32, 0.14, 0.06, S.concrete, { y: 0.07, rx: Math.PI / 2 }));
  // hydraulic cabinet with louvred doors, brand panels
  P.push(box(0.54, 0.9, 1.12, S.paintW, { y: 0.59 }));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) P.push(box(0.012, 0.025, 0.86, S.paintG, { x: sx * 0.272, y: 0.25 + k * 0.05 }));
    P.push(box(0.012, 0.36, 1.0, S.tint, { x: sx * 0.274, y: 0.82 }));
    P.push(box(0.014, 0.05, 1.02, S.steelDk, { x: sx * 0.276, y: 1.02 }));
  }
  // electronics head: slightly overhanging, two faces
  P.push(rslab(1.08, 0.74, 0.5, 0.05, S.paintW, { y: 1.42, ry: Math.PI / 2 }));
  for (const sx of [-1, 1]) {
    const fx = sx * 0.255;
    const rot = { ry: sx > 0 ? Math.PI / 2 : -Math.PI / 2 };
    // bezel + main screen + price windows
    P.push(box(0.02, 0.3, 0.42, S.black, { x: fx, y: 1.55, z: -0.18 }));
    P.push(box(0.022, 0.22, 0.34, S.screen, { x: fx + sx * 0.003, y: 1.56, z: -0.18 }));
    P.push(box(0.02, 0.26, 0.34, S.black, { x: fx, y: 1.56, z: 0.24 }));
    for (let r = 0; r < 3; r++) P.push(box(0.022, 0.05, 0.26, r === 2 ? S.screenG : S.screenR, { x: fx + sx * 0.003, y: 1.64 - r * 0.08, z: 0.24 }));
    // keypad, card reader, receipt slot, grade buttons
    P.push(box(0.03, 0.18, 0.15, S.steelDk, { x: fx, y: 1.26, z: -0.25 }));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.push(box(0.012, 0.028, 0.03, S.steel, { x: fx + sx * 0.018, y: 1.33 - i * 0.04, z: -0.29 + j * 0.04 }));
    P.push(box(0.05, 0.1, 0.12, S.black, { x: fx + sx * 0.01, y: 1.27, z: -0.02 }));
    P.push(box(0.03, 0.006, 0.08, S.screenG, { x: fx + sx * 0.035, y: 1.3, z: -0.02 }));
    for (let g = 0; g < 3; g++) P.push(box(0.03, 0.06, 0.09, [S.plasticG, S.plasticY, S.plasticB][g], { x: fx + sx * 0.008, y: 1.21, z: 0.12 + g * 0.11 }));
    // nozzle boots + nozzles (handle, trigger guard, spout) + hoses up to the crown
    for (let k = 0; k < 3; k++) {
      const z = -0.36 + k * 0.36;
      const col = [S.plasticG, S.plasticY, S.black][k];
      P.push(box(0.08, 0.16, 0.12, S.steelDk, { x: fx + sx * 0.04, y: 0.98, z }));
      P.push(box(0.06, 0.2, 0.06, col, { x: fx + sx * 0.08, y: 0.98, z, rz: sx * 0.25 }));
      P.push(box(0.05, 0.05, 0.12, S.black, { x: fx + sx * 0.1, y: 1.06, z: z + 0.02 }));
      P.push(rod([fx + sx * 0.06, 0.88, z], [fx + sx * 0.03, 0.74, z + 0.03], 0.012, 6, S.chrome));
      P.push(tube([[fx + sx * 0.1, 1.08, z], [fx + sx * 0.32, 1.1, z + 0.05], [fx + sx * 0.36, 1.5, z + 0.1], [sx * 0.2, 2.0, z * 0.9]], 0.022, 14, 6, S.rubber));
    }
    P.push(box(0.02, 0.08, 0.5, S.tint, { x: fx, y: 1.86, z: 0 }));
  }
  // crown: lit brand band, hose retractor housings at the ends
  P.push(rslab(1.2, 0.26, 0.58, 0.06, S.paintW, { y: 1.93, ry: Math.PI / 2 }));
  P.push(box(0.6, 0.11, 1.22, S.tintGlow, { y: 1.93 }));
  for (const sz of [-1, 1]) P.push(cyl(0.07, 0.07, 0.62, 10, S.steelDk, { y: 2.12, z: sz * 0.5, rz: Math.PI / 2 }));
  // fire extinguisher bracket on one end
  P.push(cyl(0.065, 0.065, 0.42, 10, S.red, { y: 0.45, z: 0.66 }));
  P.push(sphere(0.065, 10, 4, S.red, { y: 0.66, z: 0.66 }, 0, Math.PI / 2));
  P.push(box(0.04, 0.1, 0.05, S.black, { y: 0.74, z: 0.66 }));
  return merge(P);
}
function pumpFar() {
  return merge([box(0.55, 2.0, 1.15, S.paintW, { y: 1.0 }), box(0.6, 0.14, 1.2, S.tintGlow, { y: 1.92 }), box(0.57, 0.24, 0.4, S.screen, { y: 1.55 })]);
}
function bollard() {
  const P = [cyl(0.16, 0.18, 0.04, 10, S.steelDk, { y: 0.02 }), cyl(0.11, 0.11, 0.95, 14, S.yellow, { y: 0.5 }), sphere(0.11, 14, 5, S.yellow, { y: 0.975 }, 0, Math.PI / 2)];
  for (const y of [0.62, 0.82]) P.push(cyl(0.113, 0.113, 0.07, 14, S.black, { y }));
  return merge(P);
}
function islandBin() {
  const P = [];
  P.push(cyl(0.24, 0.22, 0.86, 14, S.tint, { y: 0.43 }), cyl(0.255, 0.255, 0.05, 14, S.black, { y: 0.88 }), sphere(0.25, 14, 4, S.tint, { y: 0.9, sy: 0.4 }, 0, Math.PI / 2));
  P.push(box(0.18, 0.06, 0.02, S.black, { y: 0.98, z: 0.2 }));
  // squeegee bucket on a post, paper towel box
  P.push(cyl(0.025, 0.025, 1.0, 8, S.steel, { x: 0.4, y: 0.5 }));
  P.push(cyl(0.15, 0.12, 0.32, 12, S.plasticB, { x: 0.4, y: 0.95 }));
  P.push(cyl(0.135, 0.135, 0.01, 12, { c: [0.3, 0.45, 0.5], r: 0.1, m: 0.1 }, { x: 0.4, y: 1.08 }));
  P.push(cyl(0.012, 0.012, 0.6, 6, S.black, { x: 0.43, y: 1.25, rz: 0.15 }));
  P.push(box(0.26, 0.05, 0.03, S.black, { x: 0.48, y: 1.55, rz: 0.15 }));
  P.push(box(0.28, 0.34, 0.2, S.steelDk, { x: 0.4, y: 1.42, z: -0.25 }));
  P.push(cyl(0.02, 0.02, 1.2, 6, S.steel, { x: 0.4, y: 0.6, z: -0.25 }));
  return merge(P);
}
function letters(P, word, x0, y0, z, h, s, depth = 0.02) {
  // block letters from bars: I C E A R
  const w = h * 0.6, t = h * 0.18;
  let x = x0;
  for (const ch of word) {
    const bars = {
      I: [[w / 2 - t / 2, 0, t, h]], C: [[0, 0, t, h], [0, h - t, w, t], [0, 0, w, t]],
      E: [[0, 0, t, h], [0, h - t, w, t], [0, 0, w, t], [0, h / 2 - t / 2, w * 0.8, t]],
      A: [[0, 0, t, h], [w - t, 0, t, h], [0, h - t, w, t], [0, h / 2 - t / 2, w, t]],
      R: [[0, 0, t, h], [0, h - t, w, t], [w - t, h / 2, t, h / 2], [0, h / 2 - t / 2, w, t], [w * 0.5, 0, t, h / 2]],
      P: [[0, 0, t, h], [0, h - t, w, t], [w - t, h / 2, t, h / 2], [0, h / 2 - t / 2, w, t]],
    }[ch] || [];
    for (const [bx, by, bw, bh] of bars) P.push(box(bw, bh, depth, s, { x: x + bx + bw / 2, y: y0 + by + bh / 2, z }));
    x += w + h * 0.22;
  }
}
function iceChest() {
  const P = [];
  P.push(box(1.56, 0.1, 0.78, S.black, { y: 0.05 }));
  P.push(rslab(1.6, 1.16, 0.8, 0.04, S.white, { y: 0.68 }));
  P.push(box(1.62, 0.06, 0.82, S.paintG, { y: 1.27 }));
  // two doors with handles, a lit blue band with block "ICE" letters
  for (const sx of [-1, 1]) {
    P.push(box(0.74, 0.62, 0.02, S.white, { x: sx * 0.39, y: 0.5, z: 0.41 }));
    P.push(box(0.04, 0.3, 0.05, S.chrome, { x: sx * 0.08, y: 0.55, z: 0.44 }));
  }
  P.push(box(1.5, 0.34, 0.02, S.iceBlue, { y: 1.0, z: 0.41 }));
  letters(P, 'ICE', -0.36, 0.88, 0.425, 0.24, S.white);
  P.push(box(0.2, 0.04, 0.03, S.steelDk, { x: 0.6, y: 0.26, z: 0.42 }));
  return merge(P);
}
function airPump() {
  const P = [];
  P.push(rslab(0.7, 0.6, 0.12, 0.05, S.concrete, { y: 0.06, rx: Math.PI / 2 }));
  P.push(rslab(0.5, 1.34, 0.36, 0.04, S.red, { y: 0.79 }));
  P.push(box(0.36, 0.22, 0.02, S.black, { y: 1.2, z: 0.185 }));
  P.push(box(0.3, 0.14, 0.022, S.screenR, { y: 1.21, z: 0.187 }));
  P.push(box(0.4, 0.2, 0.02, S.white, { y: 0.92, z: 0.185 }));
  letters(P, 'AIR', -0.15, 0.85, 0.198, 0.13, S.red, 0.01);
  P.push(box(0.08, 0.12, 0.05, S.steel, { x: 0.12, y: 0.65, z: 0.2 }));
  P.push(cyl(0.03, 0.03, 0.08, 8, S.steelDk, { x: 0.27, y: 0.95, rz: Math.PI / 2 }));
  // coiled hose hanging on the side hook + chuck
  P.push(torus(0.17, 0.018, 6, 18, S.rubber, { x: 0.3, y: 0.72, ry: Math.PI / 2 }));
  P.push(torus(0.15, 0.018, 6, 18, S.rubber, { x: 0.31, y: 0.7, ry: Math.PI / 2, rx: 0.2 }));
  P.push(box(0.04, 0.12, 0.04, S.chrome, { x: 0.33, y: 0.5, z: 0.12 }));
  return merge(P);
}
function vacuum() {
  const P = [];
  P.push(rslab(0.9, 0.7, 0.12, 0.06, S.concrete, { y: 0.06, rx: Math.PI / 2 }));
  P.push(cyl(0.34, 0.36, 1.0, 18, S.tint, { y: 0.62 }));
  P.push(sphere(0.34, 18, 6, S.tint, { y: 1.12, sy: 0.55 }, 0, Math.PI / 2));
  P.push(cyl(0.355, 0.355, 0.06, 18, S.steelDk, { y: 0.16 }));
  P.push(box(0.26, 0.3, 0.06, S.steelDk, { y: 0.85, z: 0.33 }));
  P.push(box(0.18, 0.08, 0.02, S.screenR, { y: 0.92, z: 0.365 }));
  P.push(box(0.05, 0.08, 0.03, S.chrome, { x: 0.06, y: 0.78, z: 0.37 }));
  // boom post with an arch; two hoses hang from the arch to nozzle holders
  P.push(cyl(0.045, 0.05, 2.6, 10, S.galv, { x: -0.5, y: 1.3 }));
  P.push(tube([[-0.5, 2.55, 0], [-0.35, 2.85, 0], [0.2, 2.95, 0], [0.75, 2.8, 0], [0.95, 2.45, 0]], 0.04, 16, 8, S.galv));
  for (const [x, z] of [[0.55, 0.12], [0.85, -0.12]]) {
    P.push(tube([[x, 2.8, 0], [x + 0.05, 2.2, z * 2], [x - 0.15, 1.4, z * 3], [0.32, 0.95, z * 2.2]], 0.035, 16, 6, S.black));
  }
  P.push(box(0.12, 0.2, 0.12, S.steelDk, { x: 0.36, y: 0.9, z: 0.0 }));
  return merge(P);
}
function payKiosk() {
  const P = [];
  P.push(rslab(0.9, 1.1, 0.2, 0.12, S.yellow, { y: 0.1, rx: Math.PI / 2 }));
  P.push(box(0.36, 1.05, 0.32, S.steelDk, { y: 0.72 }));
  P.push(rslab(0.62, 0.62, 0.38, 0.05, S.paintG, { y: 1.5, z: 0.04, rx: -0.12 }));
  P.push(box(0.64, 0.08, 0.4, S.tint, { y: 1.2, z: 0.04 }));
  P.push(box(0.4, 0.26, 0.02, S.black, { y: 1.58, z: 0.25, rx: -0.12 }));
  P.push(box(0.34, 0.2, 0.022, S.screen, { y: 1.58, z: 0.255, rx: -0.12 }));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P.push(box(0.035, 0.03, 0.012, S.steel, { x: -0.06 + j * 0.05, y: 1.37 - i * 0.04, z: 0.24 }));
  P.push(box(0.1, 0.06, 0.05, S.black, { x: 0.15, y: 1.37, z: 0.24 }));
  P.push(box(0.72, 0.05, 0.6, S.tint, { y: 1.88, z: 0.08, rx: 0.12 }));
  P.push(box(0.08, 0.06, 0.04, S.screenG, { x: 0.15, y: 1.42, z: 0.265 }));
  return merge(P);
}
function brushV() {
  const P = [cyl(0.06, 0.06, 2.75, 10, S.steel, { y: 1.375 }), box(0.32, 0.3, 0.32, S.steelDk, { y: 2.85 })];
  const fins = 18;
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * Math.PI * 2;
    const s = i % 3 === 0 ? S.foamY : i % 3 === 1 ? S.foamB : S.foamR;
    P.push(box(0.5, 2.3, 0.035, s, { x: Math.cos(a) * 0.3, y: 1.35, z: Math.sin(a) * 0.3, ry: -a }));
  }
  return merge(P);
}
function brushH() {
  // axis along Z (scaled per instance to the bay width); fins radiate in the XY plane
  const P = [cyl(0.06, 0.06, 1.05, 10, S.steel, { rx: Math.PI / 2 })];
  const fins = 18;
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * Math.PI * 2;
    const s = i % 3 === 0 ? S.foamY : i % 3 === 1 ? S.foamB : S.foamR;
    P.push(box(0.5, 0.035, 0.95, s, { x: Math.cos(a) * 0.3, y: Math.sin(a) * 0.3, rz: a }));
  }
  return merge(P);
}
function atm() {
  const P = [];
  P.push(box(0.86, 1.95, 0.16, S.steelDk, { y: 0.975, z: 0.08 }));
  P.push(box(0.76, 0.3, 0.14, S.tintGlow, { y: 1.78, z: 0.14 }));
  P.push(box(0.7, 1.1, 0.4, S.paintG, { y: 0.95, z: 0.32 }));
  P.push(box(0.72, 0.04, 0.42, S.steelDk, { y: 1.5, z: 0.33 }));
  // privacy hood + screen
  for (const sx of [-1, 1]) P.push(box(0.03, 0.42, 0.34, S.steelDk, { x: sx * 0.36, y: 1.32, z: 0.36 }));
  P.push(box(0.4, 0.3, 0.02, S.black, { y: 1.33, z: 0.2, rx: -0.2 }));
  P.push(box(0.34, 0.25, 0.022, S.screen, { y: 1.33, z: 0.208, rx: -0.2 }));
  // keypad shelf, card slot, receipt + cash slots
  P.push(box(0.6, 0.04, 0.22, S.steel, { y: 1.02, z: 0.58, rx: 0.25 }));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.push(box(0.045, 0.012, 0.035, S.chrome, { x: -0.06 + j * 0.06, y: 1.05 - i * 0.012, z: 0.52 + i * 0.04, rx: 0.25 }));
  P.push(box(0.1, 0.04, 0.03, S.black, { x: 0.22, y: 1.12, z: 0.53 }));
  P.push(box(0.01, 0.02, 0.012, S.screenG, { x: 0.28, y: 1.12, z: 0.55 }));
  P.push(box(0.3, 0.035, 0.03, S.black, { y: 0.8, z: 0.53 }));
  P.push(box(0.14, 0.02, 0.03, S.black, { x: -0.22, y: 1.12, z: 0.53 }));
  return merge(P);
}
function newsRack() {
  const P = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(cyl(0.012, 0.012, 1.1, 6, S.steelDk, { x: sx * 0.34, y: 0.55, z: sz * 0.2 }));
  for (const [y, z, rx] of [[0.35, 0.02, -0.35], [0.75, -0.04, -0.35]]) {
    P.push(box(0.68, 0.02, 0.36, S.steelDk, { y, z, rx }));
    for (let k = 0; k < 3; k++) {
      P.push(box(0.2, 0.05, 0.3, k % 2 ? S.paper : S.paperB, { x: -0.22 + k * 0.22, y: y + 0.04, z: z + 0.01, rx }));
      P.push(box(0.19, 0.012, 0.12, S.black, { x: -0.22 + k * 0.22, y: y + 0.07, z: z + 0.08, rx }));
    }
  }
  P.push(box(0.72, 0.16, 0.02, S.red, { y: 1.12, z: 0.2 }));
  P.push(box(0.6, 0.05, 0.022, S.white, { y: 1.12, z: 0.202 }));
  return merge(P);
}
function shopBin() {
  return merge([cyl(0.25, 0.23, 0.92, 14, S.steelDk, { y: 0.46 }), sphere(0.26, 14, 4, S.steelDk, { y: 0.92, sy: 0.35 }, 0, Math.PI / 2), box(0.2, 0.08, 0.04, S.black, { y: 0.92, z: 0.22 })]);
}
function cart() {
  // long axis Z: handle at -Z, nose at +Z; wire basket tapers toward the nose (nests into the cart ahead)
  const P = [];
  const W0 = 0.56, W1 = 0.44, L = 0.92, y0 = 0.42, y1 = 0.92;
  const wire = (a, b) => P.push(rod(a, b, 0.007, 4, S.chrome));
  const wx = (z) => (W0 + (W1 - W0) * ((z + L / 2) / L)) / 2;
  // side grids
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= 12; i++) { const z = -L / 2 + (L * i) / 12; wire([sx * wx(z), y0, z], [sx * wx(z), y1, z]); }
    for (const y of [y0, y0 + 0.17, y0 + 0.34, y1]) wire([sx * wx(-L / 2), y, -L / 2], [sx * wx(L / 2), y, L / 2]);
  }
  // nose grid + back gate
  for (let i = 0; i <= 6; i++) { const x = -W1 / 2 + (W1 * i) / 6; wire([x, y0 + 0.04, L / 2], [x, y1, L / 2]); }
  for (const y of [y0 + 0.04, y0 + 0.25, y1]) wire([-W1 / 2, y, L / 2], [W1 / 2, y, L / 2]);
  for (let i = 0; i <= 7; i++) { const x = -W0 / 2 + (W0 * i) / 7; wire([x, y0 + 0.15, -L / 2 - 0.02], [x, y1, -L / 2 - 0.02]); }
  for (const y of [y0 + 0.15, y1]) wire([-W0 / 2, y, -L / 2 - 0.02], [W0 / 2, y, -L / 2 - 0.02]);
  // basket floor
  for (let i = 0; i <= 5; i++) { const x = -W1 / 2 + (W1 * i) / 5; wire([x, y0, -L / 2], [x, y0, L / 2]); }
  // frame, bottom tray, casters
  for (const sx of [-1, 1]) {
    P.push(rod([sx * 0.26, 0.1, -0.5], [sx * 0.2, 0.1, 0.48], 0.012, 6, S.chrome));
    P.push(rod([sx * 0.26, 0.1, -0.5], [sx * 0.28, y1 + 0.08, -0.56], 0.013, 6, S.chrome));
    P.push(rod([sx * 0.2, 0.1, 0.48], [sx * wx(L / 2), y0, L / 2], 0.012, 6, S.chrome));
  }
  for (let i = 0; i <= 4; i++) wire([-0.22, 0.16, -0.4 + i * 0.2], [0.22, 0.16, -0.4 + i * 0.2]);
  for (const [x, z] of [[-0.25, -0.48], [0.25, -0.48], [-0.19, 0.46], [0.19, 0.46]]) {
    P.push(cyl(0.01, 0.01, 0.06, 6, S.steelDk, { x, y: 0.08, z }));
    P.push(cyl(0.05, 0.05, 0.03, 10, S.plasticDk, { x, y: 0.05, z, rz: Math.PI / 2 }));
  }
  // handle with red plastic grip, child seat flap
  P.push(cyl(0.022, 0.022, 0.6, 8, S.plasticR, { y: y1 + 0.08, z: -0.57, rz: Math.PI / 2 }));
  P.push(box(0.42, 0.14, 0.01, S.plasticR, { y: y1 - 0.02, z: -0.5, rx: 0.5 }));
  return merge(P);
}
function lotLamp() {
  const P = [];
  P.push(cyl(0.38, 0.42, 0.8, 12, S.concrete, { y: 0.4 }));
  P.push(box(0.16, 9.2, 0.16, S.paintG, { y: 0.8 + 4.6 }));
  for (const sx of [-1, 1]) {
    P.push(box(0.9, 0.08, 0.1, S.paintG, { x: sx * 0.5, y: 9.6 }));
    P.push(box(0.75, 0.18, 0.5, S.paintG, { x: sx * 1.15, y: 9.6 }));
    P.push(box(0.62, 0.02, 0.4, S.lamp, { x: sx * 1.15, y: 9.5 }));
  }
  return merge(P);
}
function lotLampFar() {
  return merge([box(0.18, 9.8, 0.18, S.paintG, { y: 4.9 }), box(3.0, 0.2, 0.5, S.paintG, { y: 9.6 }), box(2.9, 0.03, 0.42, S.lamp, { y: 9.48 })]);
}
function cartReturn() {
  const P = [];
  const L = 4.2, W = 1.3;
  for (const sx of [-1, 1]) {
    for (const y of [0.45, 0.9]) P.push(cyl(0.025, 0.025, L, 8, S.galv, { x: sx * W / 2, y, rx: Math.PI / 2 }));
    for (const z of [-L / 2, 0, L / 2]) P.push(cyl(0.03, 0.03, 0.95, 8, S.galv, { x: sx * W / 2, y: 0.47, z }));
  }
  P.push(cyl(0.025, 0.025, W, 8, S.galv, { y: 0.9, z: -L / 2, rz: Math.PI / 2 }));
  P.push(cyl(0.04, 0.04, 2.4, 8, S.galv, { x: -W / 2, y: 1.2, z: -L / 2 }));
  P.push(box(1.1, 0.5, 0.04, S.tint, { x: -W / 2 + 0.55, y: 2.2, z: -L / 2 }));
  P.push(box(0.9, 0.12, 0.045, S.white, { x: -W / 2 + 0.55, y: 2.22, z: -L / 2 }));
  for (const sz of [-1, 1]) P.push(box(W + 0.1, 0.1, 0.12, S.yellow, { y: 0.05, z: sz * (L / 2 + 0.2) }));
  return merge(P);
}
function menuBoard() {
  const P = [];
  for (const sx of [-1, 1]) P.push(box(0.12, 1.2, 0.12, S.steelDk, { x: sx * 1.1, y: 0.6 }));
  P.push(rslab(2.6, 1.7, 0.3, 0.06, S.steelDk, { y: 2.0 }));
  P.push(box(2.66, 0.18, 0.36, S.tintGlow, { y: 2.92 }));
  const cols = [S.menu1, S.menu3, S.menu2, S.menu3];
  for (let i = 0; i < 4; i++) {
    P.push(box(0.56, 1.3, 0.02, cols[i], { x: -0.93 + i * 0.62, y: 2.0, z: 0.16 }));
    for (let k = 0; k < 5; k++) P.push(box(0.4, 0.035, 0.022, S.black, { x: -0.95 + i * 0.62, y: 1.55 + k * 0.2, z: 0.17 }));
  }
  // speaker post in front of the board
  P.push(box(0.1, 1.0, 0.1, S.steelDk, { x: 1.7, y: 0.5 }));
  P.push(rslab(0.4, 0.5, 0.25, 0.05, S.tint, { x: 1.7, y: 1.2 }));
  P.push(box(0.26, 0.2, 0.02, S.black, { x: 1.7, y: 1.25, z: 0.13 }));
  P.push(box(0.2, 0.08, 0.022, S.screen, { x: 1.7, y: 1.05, z: 0.13 }));
  return merge(P);
}
function greenCross() {
  const P = [];
  P.push(box(0.08, 0.08, 1.1, S.steelDk, { z: -0.05 }));
  P.push(box(0.04, 0.6, 0.04, S.steelDk, { z: -0.5, y: -0.25 }));
  const c0 = 0.92, t = 0.32;
  for (const [w, h] of [[c0, t], [t, c0]]) {
    P.push(box(0.16, h + 0.06, w + 0.06, S.steelDk, { z: 0.55 }));
    P.push(box(0.17, h, w, S.green, { z: 0.55 }));
  }
  return merge(P);
}
function trailer() {
  const P = [];
  const L = 13.4, W = 2.55, H = 2.75, y0 = 1.25;
  P.push(box(W, H, L, S.trailerW, { y: y0 + H / 2 }));
  for (let k = 0; k <= 26; k++) for (const sx of [-1, 1]) P.push(box(0.03, H - 0.1, 0.06, S.paintG, { x: sx * (W / 2 + 0.01), y: y0 + H / 2, z: -L / 2 + (L * k) / 26 }));
  P.push(box(W + 0.04, 0.12, L, S.paintG, { y: y0 + 0.06 }));
  P.push(box(W + 0.04, 0.08, L, S.paintG, { y: y0 + H - 0.04 }));
  // rear doors (+z): hinges + lock bars, lamps
  P.push(box(W, H - 0.1, 0.04, S.paintW, { y: y0 + H / 2, z: L / 2 + 0.02 }));
  for (const x of [-0.62, -0.42, 0.42, 0.62]) P.push(cyl(0.018, 0.018, H - 0.25, 6, S.chrome, { x, y: y0 + H / 2, z: L / 2 + 0.06 }));
  for (const sx of [-1, 1]) P.push(box(0.2, 0.1, 0.04, S.screenR, { x: sx * 1.05, y: y0 - 0.1, z: L / 2 + 0.02 }));
  // chassis rails, landing gear, axles with dual wheels, mud flaps
  for (const sx of [-1, 1]) P.push(box(0.14, 0.3, L - 1, S.black, { x: sx * 0.45, y: y0 - 0.15 }));
  for (const sx of [-1, 1]) P.push(box(0.1, y0 - 0.2, 0.1, S.steelDk, { x: sx * 0.9, y: (y0 - 0.2) / 2 + 0.1, z: -L / 2 + 3.0 }));
  for (const az of [L / 2 - 2.0, L / 2 - 3.3]) {
    P.push(cyl(0.06, 0.06, W - 0.1, 8, S.black, { y: 0.5, z: az, rz: Math.PI / 2 }));
    for (const sx of [-1, 1]) for (const k of [0.68, 1.0]) {
      P.push(cyl(0.5, 0.5, 0.28, 18, S.rubber, { x: sx * k, y: 0.5, z: az, rz: Math.PI / 2 }));
      P.push(cyl(0.28, 0.28, 0.29, 12, S.steel, { x: sx * k, y: 0.5, z: az, rz: Math.PI / 2 }));
    }
  }
  for (const sx of [-1, 1]) P.push(box(0.6, 0.6, 0.02, S.black, { x: sx * 0.85, y: 0.45, z: L / 2 - 1.2 }));
  return merge(P);
}
function trailerFar() {
  return merge([box(2.55, 2.75, 13.4, S.trailerW, { y: 2.6 }), box(2.4, 0.9, 5, S.black, { y: 0.5, z: 3.5 })]);
}
function carFar() {
  return merge([box(1.85, 0.72, 4.5, S.tint, { y: 0.55 }), box(1.6, 0.52, 2.2, S.glassDk, { y: 1.15, z: -0.2 })]);
}

function patioTable() {
  const P = [];
  // Weighted round umbrella base + central pole + round bistro tabletop
  P.push(cyl(0.28, 0.32, 0.05, 14, S.steelDk, { y: 0.025 }));
  P.push(cyl(0.032, 0.035, 2.38, 10, S.wood, { y: 1.19 }));
  P.push(cyl(0.56, 0.56, 0.04, 18, S.woodLt, { y: 0.74 }));
  P.push(cyl(0.57, 0.57, 0.032, 18, S.brass, { y: 0.74 }, true));
  // Coffee cups + espresso saucer on tabletop
  P.push(cyl(0.045, 0.038, 0.065, 10, S.white, { x: -0.18, y: 0.79, z: 0.12 }));
  P.push(cyl(0.045, 0.038, 0.065, 10, S.white, { x: 0.2, y: 0.79, z: -0.1 }));
  P.push(cyl(0.06, 0.06, 0.015, 10, S.brass, { x: 0.02, y: 0.768, z: -0.02 }));
  // Market umbrella canopy (tinted fabric cone + scalloped valance + finial + ribs)
  P.push(cyl(0.05, 1.38, 0.42, 16, S.tint, { y: 2.24 }));
  P.push(cyl(1.38, 1.38, 0.09, 16, S.white, { y: 2.0 }, true));
  P.push(sphere(0.055, 10, 6, S.brass, { y: 2.48 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P.push(rod([0, 2.08, 0], [Math.cos(a) * 1.25, 2.04, Math.sin(a) * 1.25], 0.01, 6, S.wood));
  }
  // Warm fairy bulb under the umbrella hub (glows at night)
  P.push(sphere(0.055, 8, 6, S.lampWarm, { y: 2.08 }));
  // Two bistro chairs on -X and +X facing the table
  for (const sx of [-1, 1]) {
    const cx = sx * 0.76;
    P.push(cyl(0.22, 0.22, 0.035, 12, S.wood, { x: cx, y: 0.45 }));
    P.push(cyl(0.19, 0.19, 0.02, 12, S.tint, { x: cx, y: 0.472 }));
    for (const lx of [-0.14, 0.14]) for (const lz of [-0.14, 0.14]) {
      P.push(cyl(0.014, 0.012, 0.45, 6, S.steelDk, { x: cx + lx, y: 0.225, z: lz }));
    }
    P.push(box(0.03, 0.42, 0.36, S.steelDk, { x: cx + sx * 0.19, y: 0.67, rz: -sx * 0.1 }));
    P.push(box(0.035, 0.16, 0.38, S.woodLt, { x: cx + sx * 0.2, y: 0.82, rz: -sx * 0.1 }));
  }
  return merge(P);
}
function menuAFrame() {
  const P = [];
  // Hinged wooden A-frame chalkboard easel on both faces (+-Z)
  for (const sz of [-1, 1]) {
    const z = sz * 0.16, rx = -sz * 0.18;
    for (const sx of [-1, 1]) P.push(box(0.045, 1.18, 0.035, S.wood, { x: sx * 0.31, y: 0.57, z, rx }));
    P.push(box(0.66, 0.05, 0.038, S.wood, { y: 1.13, z: sz * 0.06, rx }));
    P.push(box(0.66, 0.045, 0.038, S.wood, { y: 0.22, z: sz * 0.25, rx }));
    P.push(box(0.56, 0.84, 0.022, S.slate, { y: 0.68, z: z + sz * 0.008, rx }));
    P.push(box(0.46, 0.09, 0.026, S.tintGlow, { y: 0.98, z: z + sz * 0.012, rx }));
    for (let k = 0; k < 5; k++) {
      const y = 0.82 - k * 0.11, dz = sz * (0.16 + (0.68 - y) * 0.18 + 0.014);
      P.push(box(0.32, 0.022, 0.01, S.menu3, { x: -0.05, y, z: dz, rx }));
      P.push(box(0.08, 0.022, 0.01, S.menu1, { x: 0.18, y, z: dz, rx }));
    }
  }
  P.push(cyl(0.015, 0.015, 0.66, 8, S.brass, { y: 1.15, rz: Math.PI / 2 }));
  P.push(box(0.02, 0.02, 0.42, S.brass, { x: -0.28, y: 0.38 }));
  P.push(box(0.02, 0.02, 0.42, S.brass, { x: 0.28, y: 0.38 }));
  return merge(P);
}
function pubBarrel() {
  const P = [];
  // Aged oak tavern barrel with belly bulge, wrought-iron hoops, brass tap, and pint glasses on top
  P.push(cyl(0.30, 0.34, 0.48, 16, S.oak, { y: 0.72 }));
  P.push(cyl(0.34, 0.30, 0.48, 16, S.oak, { y: 0.24 }));
  P.push(cyl(0.285, 0.285, 0.025, 16, S.woodLt, { y: 0.96 }));
  for (const [y, r] of [[0.09, 0.312], [0.33, 0.336], [0.63, 0.336], [0.88, 0.312]]) {
    P.push(cyl(r, r, 0.04, 16, S.steelDk, { y }, true));
  }
  P.push(cyl(0.02, 0.02, 0.11, 8, S.brass, { y: 0.48, z: 0.36, rx: Math.PI / 2 }));
  P.push(box(0.025, 0.07, 0.025, S.brass, { y: 0.52, z: 0.39 }));
  for (const [mx, mz] of [[-0.1, 0.06], [0.11, -0.07]]) {
    P.push(cyl(0.042, 0.036, 0.11, 10, S.amber, { x: mx, y: 1.025, z: mz }));
    P.push(cyl(0.045, 0.042, 0.028, 10, S.white, { x: mx, y: 1.09, z: mz }));
  }
  return merge(P);
}
function beerBench() {
  const P = [];
  const L = 1.95;
  P.push(box(0.76, 0.045, L, S.woodLt, { y: 0.75 }));
  P.push(box(0.02, 0.048, L + 0.01, S.wood, { y: 0.752 }));
  for (const sx of [-1, 1]) {
    const bx = sx * 0.68;
    P.push(box(0.28, 0.04, L, S.woodLt, { x: bx, y: 0.45 }));
    for (const sz of [-0.68, 0.68]) {
      P.push(rod([sx * 0.28, 0.73, sz], [sx * 0.42, 0.02, sz], 0.022, 6, S.steelDk));
      P.push(rod([bx - 0.08, 0.43, sz], [bx + 0.08, 0.02, sz], 0.018, 6, S.steelDk));
      P.push(box(1.48, 0.035, 0.04, S.steelDk, { y: 0.25, z: sz }));
    }
  }
  P.push(cyl(0.06, 0.07, 0.15, 8, S.lampWarm, { y: 0.85, z: 0 }));
  P.push(cyl(0.08, 0.05, 0.03, 8, S.steelDk, { y: 0.94, z: 0 }));
  for (const [x, z] of [[-0.2, -0.45], [0.22, 0.38], [-0.18, 0.52]]) {
    P.push(cyl(0.042, 0.038, 0.12, 8, S.amber, { x, y: 0.83, z }));
    P.push(cyl(0.044, 0.042, 0.025, 8, S.white, { x, y: 0.90, z }));
  }
  return merge(P);
}
function bellhopCart() {
  const P = [];
  const W = 0.68, L = 1.16, y0 = 0.18, H = 1.78;
  P.push(rslab(W, L, 0.06, 0.08, S.brass, { y: y0, rx: Math.PI / 2 }));
  P.push(rslab(W - 0.06, L - 0.06, 0.02, 0.06, S.velvet, { y: y0 + 0.035, rx: Math.PI / 2 }));
  P.push(rslab(W + 0.04, L + 0.04, 0.035, 0.09, S.rubber, { y: y0 - 0.01, rx: Math.PI / 2 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(cyl(0.065, 0.065, 0.04, 12, S.rubber, { x: sx * (W / 2 - 0.1), y: 0.065, z: sz * (L / 2 - 0.12), rz: Math.PI / 2 }));
    P.push(cyl(0.035, 0.035, 0.045, 8, S.brass, { x: sx * (W / 2 - 0.1), y: 0.065, z: sz * (L / 2 - 0.12), rz: Math.PI / 2 }));
  }
  for (const sz of [-1, 1]) {
    const zb = sz * (L / 2 - 0.08);
    for (const sx of [-1, 1]) {
      const xb = sx * (W / 2 - 0.08);
      P.push(tube([[xb, y0 + 0.03, zb], [xb, 1.32, zb], [xb * 0.55, 1.66, zb * 0.45], [0, H, 0]], 0.02, 12, 8, S.brass));
    }
  }
  P.push(cyl(0.016, 0.016, L - 0.3, 8, S.brass, { y: 1.52, rx: Math.PI / 2 }));
  P.push(sphere(0.06, 12, 8, S.brass, { y: H + 0.04 }));
  P.push(rslab(0.48, 0.64, 0.24, 0.03, S.wood, { x: -0.02, y: y0 + 0.16, z: -0.14, rx: Math.PI / 2 }));
  P.push(box(0.5, 0.25, 0.03, S.brass, { x: -0.02, y: y0 + 0.16, z: -0.14 }));
  P.push(rslab(0.42, 0.36, 0.54, 0.03, S.tint, { x: 0.04, y: y0 + 0.31, z: 0.26 }));
  P.push(rslab(0.38, 0.44, 0.18, 0.03, S.velvet, { x: -0.02, y: y0 + 0.37, z: -0.14, rx: Math.PI / 2 }));
  return merge(P);
}
function stanchion() {
  const P = [];
  for (const sz of [-0.85, 0.85]) {
    P.push(cyl(0.16, 0.18, 0.035, 14, S.brass, { y: 0.018, z: sz }));
    P.push(cyl(0.024, 0.024, 0.92, 10, S.brass, { y: 0.48, z: sz }));
    P.push(sphere(0.048, 10, 8, S.brass, { y: 0.96, z: sz }));
    P.push(cyl(0.034, 0.034, 0.04, 10, S.brass, { y: 0.86, z: sz }));
  }
  P.push(tube([[0, 0.86, -0.82], [0, 0.68, -0.4], [0, 0.62, 0], [0, 0.68, 0.4], [0, 0.86, 0.82]], 0.024, 14, 8, S.velvet));
  return merge(P);
}
function tireRack() {
  const P = [];
  const W = 1.68, D = 0.52, H = 1.56;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) P.push(box(0.05, H, 0.05, S.tint, { x: sx * (W / 2 - 0.03), y: H / 2, z: sz * (D / 2 - 0.03) }));
    P.push(box(0.04, 0.04, D, S.tint, { x: sx * (W / 2 - 0.03), y: 0.22 }));
    P.push(box(0.04, 0.04, D, S.tint, { x: sx * (W / 2 - 0.03), y: 0.96 }));
  }
  for (const y of [0.22, 0.96]) {
    for (const sz of [-0.16, 0.16]) P.push(box(W, 0.045, 0.045, S.steelDk, { y, z: sz }));
    for (let i = 0; i < 5; i++) {
      const x = -0.6 + i * 0.3;
      P.push(cyl(0.31, 0.31, 0.22, 16, S.rubber, { x, y: y + 0.31, rz: Math.PI / 2 }));
      P.push(cyl(0.18, 0.18, 0.225, 12, S.chrome, { x, y: y + 0.31, rz: Math.PI / 2 }));
    }
  }
  P.push(box(W, 0.22, 0.05, S.tintGlow, { y: H - 0.06, z: D / 2 }));
  return merge(P);
}
function marketCrate() {
  const P = [];
  const W = 1.72, D = 0.92;
  for (const sx of [-1, 1]) {
    P.push(box(0.05, 0.88, 0.05, S.wood, { x: sx * (W / 2 - 0.04), y: 0.44, z: -D * 0.28 }));
    P.push(box(0.05, 0.56, 0.05, S.wood, { x: sx * (W / 2 - 0.04), y: 0.28, z: D * 0.32 }));
    P.push(rod([sx * (W / 2 - 0.04), 0.52, D * 0.32], [sx * (W / 2 - 0.04), 0.84, -D * 0.28], 0.025, 6, S.wood));
  }
  const cols = [
    { c: [0.85, 0.12, 0.08], r: 0.5, m: 0.0 },
    { c: [0.95, 0.52, 0.05], r: 0.5, m: 0.0 },
    { c: [0.18, 0.68, 0.16], r: 0.5, m: 0.0 },
    { c: [0.95, 0.82, 0.08], r: 0.45, m: 0.0 },
    { c: [0.68, 0.18, 0.75], r: 0.5, m: 0.0 },
    { c: [0.92, 0.22, 0.48], r: 0.5, m: 0.0 },
  ];
  for (let row = 0; row < 2; row++) {
    const y = row === 0 ? 0.54 : 0.82, z = row === 0 ? 0.18 : -0.18, rx = 0.36;
    P.push(box(W, 0.04, 0.44, S.wood, { y: y - 0.08, z, rx }));
    for (let i = 0; i < 3; i++) {
      const cx = -0.54 + i * 0.54;
      const col = cols[(row * 3 + i) % cols.length];
      P.push(box(0.5, 0.14, 0.42, S.woodLt, { x: cx, y, z, rx }));
      P.push(box(0.45, 0.11, 0.37, col, { x: cx, y: y + 0.05, z: z + 0.02, rx }));
      for (const dx of [-0.12, 0, 0.12]) for (const dz of [-0.08, 0.08]) {
        P.push(sphere(0.075, 8, 6, col, { x: cx + dx, y: y + 0.1 - dz * 0.35, z: z + dz }));
      }
    }
  }
  return merge(P);
}

const BUILDERS = { pump, pumpFar, bollard, islandBin, iceChest, airPump, vacuum, payKiosk, brushV, brushH, atm, newsRack, shopBin, cart, lotLamp, lotLampFar, cartReturn, menuBoard, greenCross, trailer, trailerFar, carFar, patioTable, menuAFrame, pubBarrel, beerBench, bellhopCart, stanchion, tireRack, marketCrate };

const CACHE = new Map();
/** Builds (once) and returns one model geometry; models are built lazily, on the first venue that needs them. */
export function getPoiVenueModel(name) {
  if (!CACHE.has(name)) CACHE.set(name, BUILDERS[name]());
  return CACHE.get(name);
}
/** Builds every model (tests). */
export function buildPoiVenueModels() {
  const out = {};
  for (const k of Object.keys(BUILDERS)) out[k] = getPoiVenueModel(k);
  return out;
}
