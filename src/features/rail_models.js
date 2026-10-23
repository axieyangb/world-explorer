// [feature/rail-transit] Low-poly rail vehicle models (one merged geometry per part, vertex coloured).
// Each model: { body, accent, len, wid } — origin at rail-head level, centred, +Z forward.
// `accent` parts are white and tinted per instance (line colour / livery) via InstancedMesh colours.

import * as THREE from '../../vendor/three.module.js';

const WHITE = [1, 1, 1];

function merge(parts) {
  const pos = [], nrm = [], col = [];
  for (const [geom, rgb, m] of parts) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nrm.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const M = (x, y, z, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
/** Box from y0..y1, centred on (x, z). */
const B = (w, y0, y1, d, x = 0, z = 0) => [new THREE.BoxGeometry(w, y1 - y0, d), M(x, (y0 + y1) / 2, z)];

function part(list, [g, m], rgb) { list.push([g, rgb, m]); }

const DARK = [0.10, 0.10, 0.11];
const GLASS = [0.13, 0.16, 0.19];
const STEEL = [0.30, 0.30, 0.32];

function bogies(body, len, wid) {
  const off = len * 0.34;
  for (const z of [-off, off]) part(body, B(wid * 0.8, 0.05, 0.75, 2.4, 0, z), DARK);
}

function pantograph(body, z, roofY, reach) {
  part(body, B(1.0, roofY, roofY + 0.18, 1.0, 0, z), STEEL);
  const h = reach - roofY - 0.2;
  body.push([new THREE.BoxGeometry(0.06, h * 1.05, 0.06), STEEL, M(0, roofY + 0.2 + h / 2, z + 0.35, 0.42, 0, 0)]);
  body.push([new THREE.BoxGeometry(0.06, h * 1.05, 0.06), STEEL, M(0, roofY + 0.2 + h / 2, z - 0.35, -0.42, 0, 0)]);
  part(body, B(1.7, reach - 0.06, reach, 0.12, 0, z), STEEL);
}

function cableCar() {
  const body = [], accent = [];
  const L = 8.4, W = 2.45;
  bogies(body, L, 2.2);
  part(body, B(2.2, 0.38, 0.74, L), DARK);
  part(body, B(W, 0.74, 0.86, L), [0.42, 0.28, 0.17]);           // floor / running boards
  part(accent, B(W + 0.02, 0.86, 1.42, L), WHITE);               // maroon skirt (tinted)
  part(body, B(2.3, 1.42, 2.95, 4.2), [0.93, 0.88, 0.74]);       // cream enclosed cabin
  part(body, B(2.34, 1.85, 2.6, 3.9), GLASS);                    // windows
  for (const z of [-1.4, 0, 1.4]) part(body, B(2.36, 1.85, 2.6, 0.12, 0, z), [0.93, 0.88, 0.74]);
  for (const sz of [-1, 1]) {
    for (const x of [-1.15, 1.15]) {
      for (const z of [2.5, 3.3, 4.1]) part(body, B(0.07, 1.42, 2.95, 0.07, x, sz * z), [0.80, 0.64, 0.28]); // brass poles
      part(body, B(0.12, 1.1, 1.75, 1.9, x * 0.86, sz * 3.25), [0.45, 0.30, 0.18]);                          // outward benches
    }
    part(accent, B(2.3, 0.86, 1.6, 0.1, 0, sz * 4.17), WHITE);  // dash
    part(body, B(0.34, 1.25, 1.55, 0.08, 0, sz * 4.23), [1.0, 0.95, 0.72]); // headlamp
    part(body, B(1.5, 2.6, 2.9, 0.06, 0, sz * 4.14), [0.93, 0.88, 0.74]);   // route sign board
  }
  part(body, B(2.55, 2.95, 3.07, L), [0.92, 0.88, 0.78]);        // roof
  part(body, B(1.4, 3.07, 3.28, 6.2), [0.36, 0.25, 0.17]);       // clerestory
  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.52, 0.10, 0.08] };
}

function boxCar({ L, W, y0, y1, bodyRgb, glassBands, stripe, roofKit, pant, pole, frontGlass = true, accentBody = false }) {
  const body = [], accent = [];
  bogies(body, L, W);
  part(accentBody ? accent : body, B(W, y0, y1, L), accentBody ? WHITE : bodyRgb);
  for (const [b0, b1] of glassBands) part(body, B(W + 0.03, b0, b1, L - 1.0), GLASS);
  if (stripe) part(accent, B(W + 0.05, stripe[0], stripe[1], L), WHITE);
  if (frontGlass) for (const s of [-1, 1]) part(body, B(W * 0.86, glassBands[0][0], y1 - 0.2, 0.06, 0, s * (L / 2 + 0.01)), GLASS);
  part(body, B(W * 0.92, y1, y1 + 0.16, L - 0.4), [0.55, 0.56, 0.58]);
  if (roofKit) part(body, B(W * 0.55, y1 + 0.16, y1 + 0.45, L * 0.3), [0.45, 0.46, 0.48]);
  if (pant) pantograph(body, L * 0.2, y1 + 0.16, 5.55 + 0.0);
  if (pole) body.push([new THREE.BoxGeometry(0.05, 0.05, 6.2), STEEL, M(0, y1 + 1.35, -L * 0.18, -0.42, 0, 0)]);
  return { body: merge(body), accent: merge(accent), len: L, wid: W };
}

let cache = null;
/** Lazily built model catalogue (shared across teleports). */
export function getRailModels() {
  if (cache) return cache;
  cache = {
    cable_car: cableCar(),
    lrv: Object.assign(boxCar({ L: 11.6, W: 2.65, y0: 0.75, y1: 3.35, bodyRgb: [0.78, 0.79, 0.80], glassBands: [[1.85, 2.85]], stripe: [1.2, 1.5], roofKit: true, pant: true }), { accentRgb: [0.75, 0.12, 0.12] }),
    pcc: Object.assign(boxCar({ L: 14, W: 2.6, y0: 0.7, y1: 3.2, bodyRgb: [0.9, 0.9, 0.9], glassBands: [[1.8, 2.75]], stripe: [1.0, 1.25], pole: true, accentBody: true }), { accentRgb: [0.25, 0.48, 0.30] }),
    tram: Object.assign(boxCar({ L: 10, W: 2.55, y0: 0.35, y1: 3.3, bodyRgb: [0.93, 0.93, 0.92], glassBands: [[1.2, 2.8]], stripe: [0.35, 0.9], roofKit: true, pant: true }), { accentRgb: [0.85, 0.15, 0.15] }),
    bart: Object.assign(boxCar({ L: 21.3, W: 3.2, y0: 0.95, y1: 3.45, bodyRgb: [0.86, 0.87, 0.88], glassBands: [[2.0, 2.95]], stripe: [1.55, 1.75], roofKit: false }), { accentRgb: [0.0, 0.6, 0.8] }),
    metro: Object.assign(boxCar({ L: 19, W: 3.0, y0: 0.95, y1: 3.6, bodyRgb: [0.80, 0.81, 0.83], glassBands: [[1.95, 3.0]], stripe: [1.4, 1.65], roofKit: true }), { accentRgb: [0.15, 0.35, 0.75] }),
    commuter: Object.assign(boxCar({ L: 25, W: 3.1, y0: 1.0, y1: 4.8, bodyRgb: [0.80, 0.80, 0.82], glassBands: [[1.9, 2.6], [3.4, 4.1]], stripe: [1.2, 1.45], roofKit: false }), { accentRgb: [0.80, 0.12, 0.12] }),
    funicular: Object.assign(boxCar({ L: 11, W: 2.4, y0: 0.6, y1: 3.2, bodyRgb: [0.9, 0.9, 0.9], glassBands: [[1.6, 2.8]], stripe: null, accentBody: true }), { accentRgb: [0.75, 0.2, 0.15] }),
    gondola: (() => {
      const body = [], accent = [];
      part(body, B(0.5, -0.3, 0.25, 0.9), STEEL);
      part(body, B(0.08, -1.4, -0.3, 0.08), STEEL);
      part(accent, B(2.0, -3.6, -1.4, 2.2), WHITE);
      part(body, B(2.04, -2.6, -1.7, 2.24), GLASS);
      part(body, B(2.1, -1.5, -1.35, 2.3), [0.75, 0.75, 0.77]);
      return { body: merge(body), accent: merge(accent), len: 2.2, wid: 2.0, accentRgb: [0.8, 0.15, 0.12] };
    })(),
  };
  return cache;
}
