// places-info: unit geometries (vertex-coloured, merged) for the civic / transit / parking props.
// Convention: model "front" faces local +Z; instance rotY = atan2(dirX, dirZ) turns +Z toward dir.
import * as THREE from '../../../vendor/three.module.js';

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
function mat(tx, ty, tz, rx = 0, ry = 0, rz = 0) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), Q.clone(), new THREE.Vector3(1, 1, 1));
}
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
function prism(w, h, d) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
}

const WHITE = [1, 1, 1];
const STEEL = [0.62, 0.64, 0.67];
const DARK = [0.13, 0.14, 0.16];
const GLASS = [0.2, 0.24, 0.28];
const TIRE = [0.07, 0.07, 0.08];

function wheels(parts, xs, zs, r = 0.33) {
  for (const x of xs) for (const z of zs) parts.push([cyl(r, r, 0.26, 12), TIRE, mat(x, r, z, 0, 0, Math.PI / 2)]);
}
function sedan(body, extra = []) {
  const p = [
    [box(1.8, 0.62, 4.5), body, mat(0, 0.62, 0)],
    [box(1.62, 0.56, 2.3), GLASS, mat(0, 1.2, -0.25)],
    [box(1.64, 0.08, 2.1), body, mat(0, 1.5, -0.25)],
    [box(0.3, 0.12, 0.05), [1.6, 1.55, 1.3], mat(-0.62, 0.72, 2.26)],
    [box(0.3, 0.12, 0.05), [1.6, 1.55, 1.3], mat(0.62, 0.72, 2.26)],
    [box(0.32, 0.12, 0.05), [0.8, 0.05, 0.05], mat(-0.62, 0.74, -2.26)],
    [box(0.32, 0.12, 0.05), [0.8, 0.05, 0.05], mat(0.62, 0.74, -2.26)],
    ...extra,
  ];
  wheels(p, [-0.82, 0.82], [-1.45, 1.45]);
  return merge(p);
}

export function buildPiGeometries() {
  const G = {};

  // School: brick monument sign + flagpole
  G.school = merge([
    [box(3.2, 0.5, 0.6), [0.55, 0.3, 0.24], mat(0, 0.25, 0)],
    [box(2.8, 1.0, 0.36), [0.93, 0.9, 0.8], mat(0, 1.0, 0)],
    [box(3.0, 0.12, 0.46), [0.48, 0.48, 0.5], mat(0, 1.56, 0)],
    [box(2.2, 0.24, 0.38), [0.12, 0.22, 0.48], mat(0, 1.08, 0)],
    [box(1.4, 0.1, 0.38), [0.85, 0.66, 0.18], mat(0, 0.78, 0)],
    [cyl(0.05, 0.07, 8.2, 8), STEEL, mat(2.4, 4.1, -0.7)],
    [cyl(0.09, 0.09, 0.12, 8), [0.85, 0.75, 0.3], mat(2.4, 8.25, -0.7)],
    [box(1.5, 0.9, 0.03), [0.12, 0.25, 0.55], mat(3.17, 7.6, -0.7)],
    [box(1.5, 0.16, 0.035), [0.95, 0.95, 0.95], mat(3.17, 7.6, -0.7)],
  ]);

  // University / college gateway (two stone pillars + lintel with crimson banner)
  G.campus = merge([
    [box(0.9, 4.4, 0.9), [0.78, 0.74, 0.66], mat(-3.7, 2.2, 0)],
    [box(0.9, 4.4, 0.9), [0.78, 0.74, 0.66], mat(3.7, 2.2, 0)],
    [box(1.15, 0.28, 1.15), [0.66, 0.62, 0.55], mat(-3.7, 4.54, 0)],
    [box(1.15, 0.28, 1.15), [0.66, 0.62, 0.55], mat(3.7, 4.54, 0)],
    [box(6.6, 0.7, 0.6), [0.74, 0.7, 0.62], mat(0, 4.0, 0)],
    [box(4.0, 0.5, 0.66), [0.52, 0.1, 0.14], mat(0, 4.0, 0)],
    [box(2.2, 0.12, 0.68), [0.9, 0.8, 0.5], mat(0, 4.0, 0)],
  ]);

  // Museum: classical portico (steps, six columns, entablature, pediment) against a facade
  {
    const STONE = [0.9, 0.88, 0.83];
    const p = [
      [box(12, 0.3, 3.8), [0.78, 0.76, 0.72], mat(0, 0.15, 1.9)],
      [box(11.4, 0.3, 3.2), [0.82, 0.8, 0.76], mat(0, 0.45, 1.6)],
      [box(11.6, 0.9, 3.0), STONE, mat(0, 7.45, 1.5)],
      [box(11.8, 0.18, 3.1), [0.8, 0.78, 0.74], mat(0, 7.96, 1.52)],
    ];
    for (let i = 0; i < 6; i++) {
      p.push([cyl(0.32, 0.37, 6.4, 12), [0.95, 0.93, 0.88], mat(-5 + i * 2, 3.8, 2.5)]);
      p.push([box(0.86, 0.2, 0.86), STONE, mat(-5 + i * 2, 0.7, 2.5)]);
      p.push([box(0.86, 0.2, 0.86), STONE, mat(-5 + i * 2, 6.9, 2.5)]);
    }
    p.push([prism(11.8, 1.7, 3.1), STONE, mat(0, 8.05, 0)]);
    G.museum = merge(p);
  }
  G.museumSign = merge([
    [box(3.2, 0.3, 0.7), [0.7, 0.68, 0.64], mat(0, 0.15, 0)],
    [box(3.0, 1.1, 0.5), [0.85, 0.83, 0.78], mat(0, 0.85, 0)],
    [box(2.4, 0.3, 0.52), [0.22, 0.2, 0.18], mat(0, 0.95, 0)],
    [prism(3.1, 0.35, 0.5), [0.8, 0.78, 0.73], mat(0, 1.4, -0.25)],
  ]);

  // Stadium floodlight mast (28 m) with a lamp bank facing +Z
  {
    const p = [
      [cyl(0.22, 0.45, 28, 10), STEEL, mat(0, 14, 0)],
      [box(4.2, 2.6, 0.35), [0.32, 0.33, 0.35], mat(0, 28.6, 0.25, -0.35, 0, 0)],
    ];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      p.push([box(0.62, 0.55, 0.08), [1.9, 1.9, 1.75], mat(-1.6 + c * 0.8, 27.85 + r * 0.78, 0.45 + r * 0.27, -0.35, 0, 0)]);
    }
    G.mast = merge(p);
  }

  // Police: blue lantern on a post
  G.policeSign = merge([
    [cyl(0.06, 0.07, 3.2, 8), [0.25, 0.26, 0.28], mat(0, 1.6, 0)],
    [box(1.0, 0.55, 0.28), [0.1, 0.24, 0.72], mat(0, 3.3, 0)],
    [box(0.8, 0.16, 0.3), [1.7, 1.7, 1.7], mat(0, 3.3, 0)],
    [box(1.06, 0.06, 0.32), [0.2, 0.2, 0.22], mat(0, 3.6, 0)],
  ]);
  G.policeCar = sedan([0.95, 0.95, 0.96], [
    [box(1.82, 0.64, 1.25), [0.08, 0.08, 0.09], mat(0, 0.63, 1.65)],
    [box(1.82, 0.64, 1.0), [0.08, 0.08, 0.09], mat(0, 0.63, -1.78)],
    [box(0.55, 0.14, 0.3), [1.4, 0.1, 0.1], mat(-0.3, 1.6, -0.2)],
    [box(0.55, 0.14, 0.3), [0.1, 0.25, 1.5], mat(0.3, 1.6, -0.2)],
  ]);
  G.car = sedan(WHITE);

  // Fire station apparatus-bay door (on facade) and fire engine (forward +Z, ~9 m)
  G.fireDoor = merge([
    [box(4.6, 4.8, 0.1), [0.92, 0.9, 0.86], mat(0, 2.4, 0.05)],
    [box(4.0, 4.1, 0.14), [0.72, 0.1, 0.08], mat(0, 2.05, 0.08)],
    ...[0.8, 1.6, 2.4, 3.2].map((y) => [box(4.0, 0.05, 0.16), [0.5, 0.06, 0.05], mat(0, y, 0.08)]),
    [box(2.2, 0.4, 0.14), [0.95, 0.95, 0.95], mat(0, 4.45, 0.1)],
    [box(1.8, 0.16, 0.16), [0.7, 0.08, 0.06], mat(0, 4.45, 0.11)],
  ]);
  {
    const RED = [0.78, 0.07, 0.05];
    const p = [
      [box(2.5, 2.5, 2.3), RED, mat(0, 1.65, 3.25)],
      [box(2.3, 0.9, 0.06), GLASS, mat(0, 2.3, 4.41)],
      [box(2.52, 0.6, 0.6), GLASS, mat(0, 2.3, 2.9)],
      [box(2.5, 2.2, 6.3), RED, mat(0, 1.55, -1.1)],
      [box(2.54, 0.2, 8.7), [0.95, 0.95, 0.92], mat(0, 1.05, 0)],
      [box(2.6, 0.3, 0.3), STEEL, mat(0, 0.55, 4.45)],
      [box(1.6, 0.16, 0.3), [1.5, 0.1, 0.1], mat(0, 2.98, 3.7)],
      [box(0.1, 0.1, 7.4), [0.82, 0.82, 0.84], mat(-0.48, 2.95, -0.7)],
      [box(0.1, 0.1, 7.4), [0.82, 0.82, 0.84], mat(0.48, 2.95, -0.7)],
      [box(0.3, 0.3, 0.4), DARK, mat(0, 2.8, 2.6)],
    ];
    for (let i = 0; i < 9; i++) p.push([box(0.96, 0.06, 0.06), [0.82, 0.82, 0.84], mat(0, 2.95, -4.2 + i * 0.85)]);
    for (const z of [-3.8, -1.2]) for (const x of [-0.6, 0.6]) p.push([box(0.5, 0.5, 0.9), STEEL, mat(x * 2.1, 1.1, z)]);
    wheels(p, [-1.12, 1.12], [3.2, -1.9, -3.2], 0.5);
    G.fireTruck = merge(p);
  }

  // Bus stop flag on a pole (plate faces ±Z = along the road)
  G.busPole = merge([
    [cyl(0.04, 0.045, 2.9, 8), STEEL, mat(0, 1.45, 0)],
    [box(0.62, 0.52, 0.04), [0.96, 0.96, 0.96], mat(0.3, 2.45, 0)],
    [box(0.62, 0.14, 0.05), [0.12, 0.34, 0.74], mat(0.3, 2.78, 0)],
    [box(0.36, 0.2, 0.05), [0.12, 0.34, 0.74], mat(0.3, 2.4, 0)],
  ]);

  // Bus shelter: 4.4 m along X, open side faces +Z (the road)
  G.shelter = merge([
    [box(4.4, 2.0, 0.05), [0.48, 0.6, 0.66], mat(0, 1.25, -0.62)],
    [box(0.05, 2.0, 1.2), [0.48, 0.6, 0.66], mat(-2.2, 1.25, -0.05)],
    [box(4.7, 0.12, 1.6), [0.28, 0.3, 0.33], mat(0, 2.42, -0.02)],
    [box(0.08, 2.36, 0.08), [0.3, 0.32, 0.35], mat(-2.2, 1.18, -0.62)],
    [box(0.08, 2.36, 0.08), [0.3, 0.32, 0.35], mat(2.2, 1.18, -0.62)],
    [box(0.08, 2.36, 0.08), [0.3, 0.32, 0.35], mat(-2.2, 1.18, 0.55)],
    [box(0.08, 2.36, 0.08), [0.3, 0.32, 0.35], mat(2.2, 1.18, 0.55)],
    [box(2.4, 0.07, 0.38), [0.5, 0.36, 0.22], mat(-0.3, 0.48, -0.38)],
    [box(1.2, 1.8, 0.14), [1.45, 1.38, 1.2], mat(2.2, 1.2, -0.05, 0, Math.PI / 2, 0)],
    [box(1.24, 1.84, 0.12), DARK, mat(2.2, 1.2, -0.05, 0, Math.PI / 2, 0)],
  ]);

  // Subway / train station entrance: railed stairwell, 2.4 m wide (X) x 5.4 m long (Z), open at +Z.
  // Railing + lamp globes are WHITE so the instance tint colours them by line (green subway / blue rail).
  {
    const p = [
      [box(2.3, 0.04, 5.2), [0.05, 0.05, 0.06], mat(0, 0.02, 0)],
      [box(0.08, 1.05, 5.4), WHITE, mat(-1.2, 0.53, 0)],
      [box(0.08, 1.05, 5.4), WHITE, mat(1.2, 0.53, 0)],
      [box(2.48, 1.05, 0.08), WHITE, mat(0, 0.53, -2.7)],
      [box(0.14, 0.08, 5.5), [0.7, 0.72, 0.74], mat(-1.2, 1.08, 0)],
      [box(0.14, 0.08, 5.5), [0.7, 0.72, 0.74], mat(1.2, 1.08, 0)],
      [box(2.56, 0.08, 0.14), [0.7, 0.72, 0.74], mat(0, 1.08, -2.7)],
      [cyl(0.05, 0.05, 2.1, 8), [0.25, 0.26, 0.28], mat(-1.2, 1.05, 2.7)],
      [cyl(0.05, 0.05, 2.1, 8), [0.25, 0.26, 0.28], mat(1.2, 1.05, 2.7)],
      [new THREE.SphereGeometry(0.2, 10, 8), [1.6, 1.6, 1.6], mat(-1.2, 2.25, 2.7)],
      [new THREE.SphereGeometry(0.2, 10, 8), [1.6, 1.6, 1.6], mat(1.2, 2.25, 2.7)],
    ];
    for (let i = 0; i < 8; i++) p.push([box(2.28, 0.02, 0.06), [0.24, 0.24, 0.26], mat(0, 0.05, 2.3 - i * 0.62)]);
    G.subway = merge(p);
  }

  // Parking lots: asphalt slab with a skirt (hides slopes), painted stalls, aisle down the middle.
  const lot = (W) => {
    const D = 15;
    const LINE = [0.92, 0.92, 0.88];
    const p = [
      [box(W, 1.4, D), [0.2, 0.21, 0.22], mat(0, -0.66, 0)],
      [box(W + 0.4, 0.16, 0.2), [0.55, 0.55, 0.53], mat(0, 0.04, -D / 2 - 0.1)],
      [box(W + 0.4, 0.16, 0.2), [0.55, 0.55, 0.53], mat(0, 0.04, D / 2 + 0.1)],
      [box(0.2, 0.16, D), [0.55, 0.55, 0.53], mat(-W / 2 - 0.1, 0.04, 0)],
      [box(0.2, 0.16, D), [0.55, 0.55, 0.53], mat(W / 2 + 0.1, 0.04, 0)],
    ];
    const n = W / 2.5;
    for (const row of [-1, 1]) {
      for (let i = 0; i <= n; i++) p.push([box(0.12, 0.02, 5.4), LINE, mat(-W / 2 + i * 2.5, 0.06, row * 4.8)]);
      p.push([box(W, 0.02, 0.12), LINE, mat(0, 0.06, row * 7.4)]);
    }
    p.push([box(0.9, 0.02, 0.9), [0.2, 0.36, 0.72], mat(-W / 2 + 1.25, 0.065, -4.8)]);
    return merge(p);
  };
  G.lotL = lot(20);
  G.lotS = lot(10);
  return G;
}
