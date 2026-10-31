// Places feature (main thread): renders the per-chunk `places` payload produced in the chunk worker
// (see places_worker.js) with distance-culled InstancedMesh pools (rooftop detail, awnings/signs,
// transit markers, planes, ships, helipads, gas stations, EV superchargers, bike-share docks,
// toll booths, hospital Red Cross emblems, and church spires / Torii gates), in-world POI &
// geographic discovery labels (neighborhoods, mountain peaks, water names, airports), live
// neighborhood HUD tracking, moving trains on rail lines, and blinking aviation beacons at night.
//
// Hooked from src/main.js: `this.places = new PlacesSystem(this.scene)` + `this.places.update(...)` per frame.

import * as THREE from '../../vendor/three.module.js';
import { getLang } from '../i18n.js';
import { isNight } from './daylight.js';
import { QUALITY } from './quality.js'; // [ui-mobile]
import { buildAirlinerInstancedGeometries } from './airliner_models.js';

const STRIDE = 8;
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const E = new THREE.Euler();

function mat(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), Q.clone(), new THREE.Vector3(sx, sy, sz));
}

function mergeParts(parts) {
  const pos = [];
  const nrm = [];
  const col = [];
  for (const [geom, rgb, m] of parts) {
    if (geom.index) geom.computeVertexNormals();
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) {
      pos.push(p[i]);
      nrm.push(n[i]);
    }
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
const cyl = (rt, rb, h, seg = 16, open = false) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.computeVertexNormals();
  return g;
};
const cone = (r, h, seg = 16) => {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.computeVertexNormals();
  return g;
};
const sphere = (r, ws = 16, hs = 10, th0 = 0, thL = Math.PI) => {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, th0, thL);
  g.computeVertexNormals();
  return g;
};
const dome = (r, ws = 16, hs = 8) => sphere(r, ws, hs, 0, Math.PI / 2);
const torus = (r, tubeR, rs = 10, ts = 20, arc = Math.PI * 2) => {
  const g = new THREE.TorusGeometry(r, tubeR, rs, ts, arc);
  g.computeVertexNormals();
  return g;
};
const ring = (r, tubeR, rs = 10, ts = 20, arc = Math.PI * 2) => torus(r, tubeR, rs, ts, arc);
const lathe = (pts, seg = 16) => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.computeVertexNormals();
  return g;
};

function buildUnitGeometries() {
  const G = {};
  // Rooftop HVAC unit: unit box with dark fan disc on top
  G.hvac = mergeParts([
    [box(1, 1, 1), [0.86, 0.87, 0.88], mat(0, 0.5, 0)],
    [cyl(0.34, 0.34, 0.09, 20), [0.58, 0.60, 0.63], mat(0, 1.03, 0)],
    [cyl(0.30, 0.30, 0.06, 20), [0.16, 0.18, 0.20], mat(0, 1.05, 0)],
    [cyl(0.08, 0.08, 0.08, 14), [0.42, 0.44, 0.46], mat(0, 1.06, 0)],
    [box(0.56, 0.02, 0.06), [0.32, 0.34, 0.36], mat(0, 1.07, 0, 0, 0.4, 0)],
    [box(0.56, 0.02, 0.06), [0.32, 0.34, 0.36], mat(0, 1.07, 0, 0, 1.97, 0)],
    [box(1.01, 0.08, 1.01), [0.66, 0.67, 0.69], mat(0, 0.18, 0)],
    [box(1.02, 0.06, 0.76), [0.52, 0.54, 0.56], mat(0, 0.58, 0)],
    [box(1.02, 0.06, 0.76), [0.52, 0.54, 0.56], mat(0, 0.76, 0)],
  ]);
  G.vent = mergeParts([
    [cyl(0.58, 0.62, 0.12, 16), [0.38, 0.40, 0.42], mat(0, 0.06, 0)],
    [cyl(0.46, 0.48, 0.88, 16), [0.50, 0.52, 0.55], mat(0, 0.48, 0)],
    [cyl(0.58, 0.50, 0.08, 16), [0.42, 0.44, 0.46], mat(0, 0.88, 0)],
    [sphere(0.56, 18, 10), [0.58, 0.60, 0.64], mat(0, 1.04, 0, 0, 0, 0, 1, 0.48, 1)],
    [cone(0.62, 0.18, 18), [0.32, 0.34, 0.37], mat(0, 1.24, 0)],
  ]);
  // Wooden water tank on steel legs (tinted per instance)
  const tankParts = [];
  for (const [lx, lz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
    tankParts.push([box(0.06, 0.3, 0.06), [0.32, 0.32, 0.34], mat(lx, 0.15, lz)]);
  }
  tankParts.push([box(0.66, 0.03, 0.03), [0.28, 0.29, 0.31], mat(0, 0.16, 0.3, 0, 0, 0.42)]);
  tankParts.push([box(0.66, 0.03, 0.03), [0.28, 0.29, 0.31], mat(0, 0.16, -0.3, 0, 0, -0.42)]);
  tankParts.push([cyl(0.56, 0.56, 0.035, 20), [0.4, 0.38, 0.36], mat(0, 0.31, 0)]);
  tankParts.push([cyl(0.5, 0.5, 0.52, 24), [1, 1, 1], mat(0, 0.58, 0)]);
  for (const hy of [0.38, 0.48, 0.58, 0.68, 0.78]) tankParts.push([torus(0.503, 0.009, 8, 24), [0.26, 0.25, 0.24], mat(0, hy, 0, Math.PI / 2, 0, 0)]);
  tankParts.push([cone(0.55, 0.20, 24), [0.45, 0.4, 0.36], mat(0, 0.94, 0)]);
  tankParts.push([sphere(0.04, 12, 8), [0.72, 0.58, 0.24], mat(0, 1.05, 0)]);
  G.tank = mergeParts(tankParts);
  // Antenna mast: unit height (scaled by sy), fixed radius
  G.mast = mergeParts([
    [cyl(0.065, 0.22, 1, 16), [0.8, 0.8, 0.82], mat(0, 0.5, 0)],
    [box(1.6, 0.01, 0.08), [0.7, 0.7, 0.72], mat(0, 0.35, 0)],
    [box(0.08, 0.01, 1.6), [0.7, 0.7, 0.72], mat(0, 0.62, 0)],
    [cyl(0.24, 0.24, 0.08, 14), [0.92, 0.93, 0.95], mat(0, 0.48, 0.18, Math.PI / 2, 0, 0)],
    [cyl(0.08, 0.08, 0.06, 16), [0.85, 0.2, 0.18], mat(0, 0.86, 0)],
    [sphere(0.055, 12, 8), [0.98, 0.22, 0.16], mat(0, 1.01, 0)],
  ]);
  // Tilted photovoltaic rack with A-frame ballast supports, aluminum module frames, cell busbars & inverter junction box
  {
    const sp = [
      // Concrete ballast blocks
      [box(0.16, 0.07, 0.92), [0.52, 0.53, 0.55], mat(-0.42, 0.035, 0)],
      [box(0.16, 0.07, 0.92), [0.52, 0.53, 0.55], mat(0.42, 0.035, 0)],
      // A-frame rear & front legs + diagonal struts
      [cyl(0.022, 0.024, 0.66, 8), [0.64, 0.66, 0.69], mat(-0.42, 0.38, -0.34)],
      [cyl(0.022, 0.024, 0.66, 8), [0.64, 0.66, 0.69], mat(0.42, 0.38, -0.34)],
      [cyl(0.022, 0.024, 0.26, 8), [0.64, 0.66, 0.69], mat(-0.42, 0.18, 0.34)],
      [cyl(0.022, 0.024, 0.26, 8), [0.64, 0.66, 0.69], mat(0.42, 0.18, 0.34)],
      [box(0.025, 0.025, 0.72), [0.58, 0.60, 0.63], mat(-0.42, 0.35, 0, 0.32, 0, 0)],
      [box(0.025, 0.025, 0.72), [0.58, 0.60, 0.63], mat(0.42, 0.35, 0, 0.32, 0, 0)],
      // Cross purlins & junction box under panel
      [box(0.96, 0.03, 0.035), [0.70, 0.72, 0.75], mat(0, 0.65, -0.26, -0.42, 0, 0)],
      [box(0.96, 0.03, 0.035), [0.70, 0.72, 0.75], mat(0, 0.38, 0.26, -0.42, 0, 0)],
      [box(0.18, 0.12, 0.14), [0.22, 0.24, 0.27], mat(0, 0.44, -0.28)],
      // Aluminum outer frame + dark blue monocrystalline cell deck + silver busbar grid lines
      [box(1.02, 0.055, 1.02), [0.78, 0.80, 0.83], mat(0, 0.54, 0, -0.42, 0, 0)],
      [box(0.96, 0.062, 0.96), [0.10, 0.16, 0.32], mat(0, 0.545, 0, -0.42, 0, 0)],
    ];
    for (const gx of [-0.32, 0, 0.32]) {
      sp.push([box(0.014, 0.066, 0.94), [0.68, 0.72, 0.78], mat(gx, 0.548, 0, -0.42, 0, 0)]);
    }
    for (const gz of [-0.24, 0.24]) {
      sp.push([box(0.94, 0.066, 0.014), [0.68, 0.72, 0.78], mat(0, 0.548 - gz * Math.sin(0.42), gz * Math.cos(0.42), -0.42, 0, 0)]);
    }
    G.solar = mergeParts(sp);
  }
  // Rooftop planter garden: stone/timber raised bed, rich soil, rounded shrubs, and timber pergola border
  {
    const gardenParts = [
      [box(1.02, 0.28, 1.02), [0.46, 0.38, 0.30], mat(0, 0.14, 0)],
      [box(1.06, 0.05, 1.06), [0.58, 0.50, 0.40], mat(0, 0.29, 0)],
      [box(0.92, 0.06, 0.92), [0.28, 0.22, 0.16], mat(0, 0.28, 0)],
      [box(0.90, 0.04, 0.90), [0.30, 0.52, 0.24], mat(0, 0.31, 0)],
    ];
    // Corner pergola posts + overhead trellis beams
    for (const [px, pz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) {
      gardenParts.push([box(0.05, 0.68, 0.05), [0.48, 0.32, 0.20], mat(px, 0.62, pz)]);
    }
    gardenParts.push(
      [box(0.98, 0.04, 0.04), [0.48, 0.32, 0.20], mat(0, 0.95, -0.44)],
      [box(0.98, 0.04, 0.04), [0.48, 0.32, 0.20], mat(0, 0.95, 0.44)],
      [box(0.035, 0.035, 0.96), [0.52, 0.35, 0.22], mat(-0.28, 0.98, 0)],
      [box(0.035, 0.035, 0.96), [0.52, 0.35, 0.22], mat(0, 0.98, 0)],
      [box(0.035, 0.035, 0.96), [0.52, 0.35, 0.22], mat(0.28, 0.98, 0)],
    );
    const shrubs = [
      [-0.26, -0.22, 0.22, [0.18, 0.44, 0.20]],
      [0.24, -0.26, 0.25, [0.22, 0.50, 0.22]],
      [0.04, 0.06, 0.20, [0.26, 0.54, 0.24]],
      [-0.22, 0.24, 0.24, [0.20, 0.46, 0.18]],
      [0.26, 0.22, 0.19, [0.24, 0.48, 0.22]],
    ];
    for (const [sx, sz, r, col] of shrubs) {
      gardenParts.push([cyl(0.03, 0.04, 0.18, 6), [0.38, 0.25, 0.15], mat(sx, 0.38, sz)]);
      gardenParts.push([sphere(r, 10, 8), col, mat(sx, 0.48 + r * 0.5, sz, 0, 0, 0, 1, 0.85, 1)]);
    }
    G.garden = mergeParts(gardenParts);
  }

  // Striped storefront awning: local X along the wall, +Z out of the wall, y 0..1
  // Includes striped slope, scalloped valance tabs, end cheek flaps, and wrought-iron wall support brackets
  {
    const awParts = [];
    const strips = 8;
    for (let i = 0; i < strips; i++) {
      const x0 = -0.5 + i / strips, x1 = -0.5 + (i + 1) / strips;
      const xm = (x0 + x1) * 0.5, sw = 1 / strips;
      const c = i % 2 === 0 ? [1.0, 1.0, 1.0] : [0.78, 0.78, 0.80];
      // Sloped canopy strip from (y=1, z=0) to (y=0.30, z=0.98)
      awParts.push([box(sw + 0.002, 0.035, 1.20), c, mat(xm, 0.65, 0.49, 0.62, 0, 0)]);
      // Front valance drop tab + rounded bottom scallop
      awParts.push([box(sw * 0.94, 0.20, 0.03), c, mat(xm, 0.20, 0.98)]);
      awParts.push([cyl(sw * 0.46, sw * 0.46, 0.03, 10), c, mat(xm, 0.10, 0.98, Math.PI / 2, 0, 0)]);
    }
    // Wrought-iron wall-mounting brackets & front roller bar
    awParts.push([cyl(0.025, 0.025, 1.02, 10), [0.22, 0.24, 0.27], mat(0, 0.30, 0.96, 0, 0, Math.PI / 2)]);
    awParts.push([box(1.02, 0.05, 0.05), [0.24, 0.26, 0.29], mat(0, 0.98, 0.02)]);
    for (const bx of [-0.46, 0, 0.46]) {
      awParts.push(
        [box(0.03, 0.72, 0.04), [0.20, 0.22, 0.25], mat(bx, 0.56, 0.02)],
        [box(0.028, 0.028, 0.96), [0.20, 0.22, 0.25], mat(bx, 0.30, 0.48)],
        [box(0.024, 0.024, 0.86), [0.22, 0.24, 0.27], mat(bx, 0.48, 0.44, -0.45, 0, 0)],
      );
    }
    G.awning = mergeParts(awParts);
  }
  // Projecting blade sign with wrought-iron wall bracket, scroll braces, bezel frame, mounting bolts & top gooseneck lamps
  {
    const sgParts = [
      // Wall mounting plate + 4 corner bolts
      [box(0.18, 0.94, 0.05), [0.20, 0.22, 0.25], mat(0, 0.50, 0.025)],
      [cyl(0.032, 0.032, 0.26, 12), [0.24, 0.26, 0.29], mat(0, 0.82, 0.12, Math.PI / 2, 0, 0)],
      [cyl(0.032, 0.032, 0.26, 12), [0.24, 0.26, 0.29], mat(0, 0.18, 0.12, Math.PI / 2, 0, 0)],
      [torus(0.14, 0.018, 8, 16), [0.22, 0.24, 0.27], mat(0, 0.65, 0.14, 0, Math.PI / 2, 0)],
      [torus(0.14, 0.018, 8, 16), [0.22, 0.24, 0.27], mat(0, 0.35, 0.14, 0, Math.PI / 2, 0)],
      // Illuminated sign face panel + extruded metal bezel frame
      [box(0.12, 0.92, 0.86), [1, 1, 1], mat(0, 0.50, 0.55)],
      [box(0.16, 0.07, 0.94), [0.26, 0.28, 0.31], mat(0, 0.97, 0.55)],
      [box(0.16, 0.07, 0.94), [0.26, 0.28, 0.31], mat(0, 0.03, 0.55)],
      [box(0.16, 0.96, 0.07), [0.26, 0.28, 0.31], mat(0, 0.50, 0.11)],
      [box(0.16, 0.96, 0.07), [0.26, 0.28, 0.31], mat(0, 0.50, 0.99)],
      // Twin top gooseneck lamp shades
      [cyl(0.06, 0.10, 0.08, 12), [0.22, 0.24, 0.27], mat(-0.14, 1.04, 0.55)],
      [cyl(0.06, 0.10, 0.08, 12), [0.22, 0.24, 0.27], mat(0.14, 1.04, 0.55)],
    ];
    for (const [by, bz] of [[0.90, 0.06], [0.10, 0.06], [0.97, 0.25], [0.97, 0.85], [0.03, 0.25], [0.03, 0.85]]) {
      sgParts.push([sphere(0.028, 8, 6), [0.65, 0.68, 0.72], mat(0, by, bz)]);
    }
    G.sign = mergeParts(sgParts);
  }
  // Transit entrance totem + subway stairway balustrade collar (real size), tinted per line color
  {
    const tr = [
      // Granite base curb + flanged anchor collar
      [box(0.84, 0.12, 0.84), [0.42, 0.44, 0.47], mat(0, 0.06, 0)],
      [cyl(0.28, 0.32, 0.14, 16), [0.46, 0.48, 0.50], mat(0, 0.16, 0)],
      [torus(0.14, 0.025, 8, 16), [0.34, 0.36, 0.40], mat(0, 0.24, 0, Math.PI / 2, 0, 0)],
      // Fluted steel totem mast + mid timetable map panel
      [cyl(0.075, 0.085, 2.8, 16), [0.55, 0.57, 0.60], mat(0, 1.5, 0)],
      [box(0.42, 0.58, 0.08), [0.22, 0.25, 0.30], mat(0, 1.48, 0)],
      [box(0.36, 0.48, 0.095), [0.92, 0.94, 0.96], mat(0, 1.50, 0)],
      [box(0.36, 0.06, 0.10), [1, 1, 1], mat(0, 1.70, 0)],
      // Neck bracket + circular transit roundel (outer bezel, line-tinted disc, bold crossbar)
      [box(0.22, 0.24, 0.14), [0.34, 0.36, 0.40], mat(0, 2.68, 0)],
      [cyl(0.46, 0.46, 0.16, 24), [0.20, 0.22, 0.26], mat(0, 3.1, 0, Math.PI / 2, 0, 0)],
      [torus(0.46, 0.028, 10, 24), [0.76, 0.78, 0.82], mat(0, 3.1, 0)],
      [cyl(0.40, 0.40, 0.18, 24), [1, 1, 1], mat(0, 3.1, 0, Math.PI / 2, 0, 0)],
      [cyl(0.24, 0.24, 0.19, 20), [0.16, 0.18, 0.22], mat(0, 3.1, 0, Math.PI / 2, 0, 0)],
      [box(1.04, 0.16, 0.21), [0.18, 0.22, 0.32], mat(0, 3.1, 0)],
      [box(0.98, 0.12, 0.22), [1.8, 1.8, 1.8], mat(0, 3.1, 0)],
      // Top beacon pedestal & illuminated globe lantern
      [cyl(0.06, 0.08, 0.22, 12), [0.46, 0.48, 0.52], mat(0, 3.58, 0)],
      [sphere(0.15, 16, 12), [1.7, 1.65, 1.45], mat(0, 3.76, 0)],
      [cyl(0.10, 0.14, 0.05, 12), [0.28, 0.30, 0.34], mat(0, 3.91, 0)],
    ];
    G.transit = mergeParts(tr);
  }

  // Helipad (unit radius = 1, scaled by hr in X/Z): dark landing deck, white aiming circle, bold white "H", 8 green perimeter lights
  {
    const hp = [
      [cyl(1.0, 1.04, 0.16, 32), [0.23, 0.25, 0.28], mat(0, 0.08, 0)],
      [cyl(0.94, 0.94, 0.17, 32), [0.92, 0.78, 0.16], mat(0, 0.085, 0)],
      [cyl(0.88, 0.88, 0.18, 32), [0.25, 0.27, 0.30], mat(0, 0.09, 0)],
      // White "H" marking
      [box(0.13, 0.04, 0.68), [0.97, 0.98, 0.99], mat(-0.22, 0.19, 0)],
      [box(0.13, 0.04, 0.68), [0.97, 0.98, 0.99], mat(0.22, 0.19, 0)],
      [box(0.44, 0.04, 0.13), [0.97, 0.98, 0.99], mat(0, 0.19, 0)],
    ];
    const ringSegs = 16;
    const ringR = 0.66;
    const segLen = (2 * Math.PI * ringR) / ringSegs * 0.82;
    for (let k = 0; k < ringSegs; k++) {
      const a = (k / ringSegs) * Math.PI * 2;
      hp.push([
        box(0.07, 0.035, segLen),
        [0.96, 0.97, 0.99],
        mat(Math.cos(a) * ringR, 0.188, Math.sin(a) * ringR, 0, -a, 0),
      ]);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      hp.push([
        cyl(0.045, 0.055, 0.12, 8),
        [0.10, 0.96, 0.38],
        mat(Math.cos(a) * 0.91, 0.21, Math.sin(a) * 0.91),
      ]);
    }
    G.helipad = mergeParts(hp);
  }

  // Gas Station: illuminated canopy fascia + soffit downlights + 2 dual-hose fuel dispensers + crash bollards + roadside price totem
  {
    const gs = [
      // Concrete fuel island with yellow safety end curbs
      [box(5.4, 0.18, 1.4), [0.72, 0.73, 0.75], mat(0, 0.09, 0)],
      [cyl(0.70, 0.70, 0.18, 14), [0.92, 0.74, 0.10], mat(-2.7, 0.09, 0)],
      [cyl(0.70, 0.70, 0.18, 14), [0.92, 0.74, 0.10], mat(2.7, 0.09, 0)],
      // Protective yellow steel crash bollards at island ends
      [cyl(0.09, 0.09, 0.85, 10), [0.95, 0.76, 0.12], mat(-2.55, 0.50, -0.45)],
      [cyl(0.09, 0.09, 0.85, 10), [0.95, 0.76, 0.12], mat(-2.55, 0.50, 0.45)],
      [cyl(0.09, 0.09, 0.85, 10), [0.95, 0.76, 0.12], mat(2.55, 0.50, -0.45)],
      [cyl(0.09, 0.09, 0.85, 10), [0.95, 0.76, 0.12], mat(2.55, 0.50, 0.45)],
      // 2 Canopy columns with brand base wraps
      [cyl(0.22, 0.24, 4.2, 14), [0.88, 0.89, 0.91], mat(-1.85, 2.1, 0)],
      [cyl(0.26, 0.26, 1.1, 14), [1.0, 1.0, 1.0], mat(-1.85, 0.65, 0)],
      [cyl(0.22, 0.24, 4.2, 14), [0.88, 0.89, 0.91], mat(1.85, 2.1, 0)],
      [cyl(0.26, 0.26, 1.1, 14), [1.0, 1.0, 1.0], mat(1.85, 0.65, 0)],
      // Overhead canopy deck + tiered brand fascia trim + recessed soffit light bays
      [box(7.6, 0.36, 4.6), [0.94, 0.95, 0.97], mat(0, 4.25, 0)],
      [box(7.76, 0.24, 4.76), [1.0, 1.0, 1.0], mat(0, 4.32, 0)],
      [box(7.80, 0.08, 4.80), [0.95, 0.78, 0.14], mat(0, 4.14, 0)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.95], mat(-2.2, 4.06, -1.1)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.95], mat(0, 4.06, -1.1)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.95], mat(2.2, 4.06, -1.1)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.95], mat(-2.2, 4.06, 1.1)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.95], mat(0, 4.06, 1.1)],
      [box(1.4, 0.04, 0.65), [0.98, 0.98, 0.65], mat(2.2, 4.06, 1.1)],
      // Roadside price totem sign with LED grade rows
      [box(1.15, 0.28, 0.52), [0.58, 0.60, 0.62], mat(4.2, 0.14, 1.7)],
      [box(1.02, 3.7, 0.28), [0.20, 0.22, 0.26], mat(4.2, 1.95, 1.7)],
      [box(1.08, 0.92, 0.32), [1.0, 1.0, 1.0], mat(4.2, 3.30, 1.7)],
      [box(0.86, 0.32, 0.33), [0.96, 0.22, 0.16], mat(4.2, 2.42, 1.7)],
      [box(0.86, 0.32, 0.33), [0.96, 0.78, 0.14], mat(4.2, 2.02, 1.7)],
      [box(0.86, 0.32, 0.33), [0.16, 0.88, 0.36], mat(4.2, 1.62, 1.7)],
    ];
    // 2 Dual-hose fuel dispensers with screens, nozzle boots, and hanging rubber hoses
    for (const px of [-0.85, 0.85]) {
      gs.push(
        [box(0.78, 1.54, 0.48), [0.92, 0.93, 0.95], mat(px, 0.94, 0)],
        [box(0.54, 0.40, 0.52), [0.14, 0.18, 0.24], mat(px, 1.20, 0)],
        [box(0.36, 0.22, 0.54), [0.24, 0.78, 0.96], mat(px, 1.24, 0)],
        [box(0.82, 0.28, 0.52), [1.0, 1.0, 1.0], mat(px, 1.62, 0)],
        [box(0.10, 0.22, 0.22), [0.16, 0.68, 0.30], mat(px - 0.41, 1.02, 0)],
        [box(0.10, 0.22, 0.22), [0.88, 0.20, 0.16], mat(px + 0.41, 1.02, 0)],
        [cyl(0.025, 0.025, 0.95, 8), [0.12, 0.13, 0.15], mat(px - 0.46, 1.12, 0, 0, 0, 0.12)],
        [cyl(0.025, 0.025, 0.95, 8), [0.12, 0.13, 0.15], mat(px + 0.46, 1.12, 0, 0, 0, -0.12)],
      );
    }
    G.gasStation = mergeParts(gs);
  }

  // EV Supercharger Station: concrete pad + transformer cabinet + 4 arched-hoop Supercharger stalls with holstered cables
  {
    const ev = [
      [box(5.6, 0.16, 1.3), [0.68, 0.70, 0.72], mat(0, 0.08, 0)],
      // Utility transformer cabinet with cooling louvers
      [box(0.96, 1.52, 0.76), [0.78, 0.80, 0.82], mat(-2.85, 0.80, -0.1)],
      [box(0.98, 0.48, 0.60), [0.46, 0.48, 0.52], mat(-2.85, 1.05, -0.1)],
      [box(1.02, 0.08, 0.82), [0.58, 0.60, 0.64], mat(-2.85, 1.56, -0.1)],
    ];
    for (const sx of [-1.8, -0.6, 0.6, 1.8]) {
      ev.push(
        // Outer white monolith frame + rounded arch top + crimson inner hoop
        [box(0.54, 1.58, 0.24), [0.96, 0.97, 0.99], mat(sx, 0.86, 0)],
        [cyl(0.27, 0.27, 0.24, 14), [0.96, 0.97, 0.99], mat(sx, 1.65, 0, Math.PI / 2, 0, 0)],
        [box(0.28, 1.08, 0.26), [0.88, 0.12, 0.16], mat(sx, 0.86, 0)],
        // Glowing status bar + touchscreen + holstered charging handle & cable loop
        [box(0.42, 0.09, 0.27), [0.12, 0.94, 0.72], mat(sx, 1.58, 0)],
        [box(0.20, 0.26, 0.28), [0.16, 0.22, 0.30], mat(sx, 1.18, 0)],
        [box(0.10, 0.20, 0.16), [0.18, 0.20, 0.22], mat(sx + 0.29, 0.96, 0)],
        [torus(0.18, 0.024, 8, 14), [0.12, 0.13, 0.15], mat(sx + 0.30, 0.68, 0, 0, Math.PI / 2, 0)],
        // Wheel stop curb block
        [box(0.76, 0.10, 0.16), [0.92, 0.76, 0.14], mat(sx, 0.05, 0.82)],
      );
    }
    G.evCharger = mergeParts(ev);
  }

  // Bike-Share Dock: sidewalk dock plate + solar payment terminal kiosk + 5 detailed docked bicycles
  {
    const bk = [
      [box(4.6, 0.08, 0.82), [0.36, 0.38, 0.42], mat(0, 0.04, 0)],
      // Solar payment terminal kiosk
      [box(0.40, 1.64, 0.28), [0.20, 0.24, 0.30], mat(-2.0, 0.85, 0)],
      [box(0.30, 0.36, 0.31), [0.28, 0.78, 0.98], mat(-2.0, 1.22, 0)],
      [box(0.48, 0.05, 0.44), [0.12, 0.18, 0.34], mat(-2.0, 1.74, 0, -0.35, 0, 0)],
    ];
    for (const bx of [-1.1, -0.4, 0.3, 1.0, 1.7]) {
      bk.push(
        // Bollard dock stanchion with green LED indicator
        [box(0.14, 0.72, 0.14), [0.55, 0.58, 0.62], mat(bx, 0.38, -0.24)],
        [box(0.10, 0.04, 0.15), [0.16, 0.92, 0.42], mat(bx, 0.68, -0.24)],
        // Front & rear tire rings + hubs
        [torus(0.26, 0.032, 8, 14), [0.14, 0.15, 0.17], mat(bx, 0.32, -0.04, 0, Math.PI / 2, 0)],
        [torus(0.26, 0.032, 8, 14), [0.14, 0.15, 0.17], mat(bx, 0.32, 0.56, 0, Math.PI / 2, 0)],
        // Step-through frame tubes, fork, seatpost, saddle, handlebars & front basket
        [cyl(0.022, 0.022, 0.52, 8), [1.0, 1.0, 1.0], mat(bx, 0.52, -0.02, -0.22, 0, 0)],
        [cyl(0.026, 0.026, 0.54, 8), [1.0, 1.0, 1.0], mat(bx, 0.42, 0.24, 1.15, 0, 0)],
        [cyl(0.022, 0.022, 0.44, 8), [1.0, 1.0, 1.0], mat(bx, 0.50, 0.42, 0.18, 0, 0)],
        [box(0.38, 0.035, 0.035), [0.76, 0.78, 0.82], mat(bx, 0.78, -0.06)],
        [box(0.22, 0.16, 0.18), [0.24, 0.26, 0.28], mat(bx, 0.66, -0.16)],
        [box(0.14, 0.06, 0.22), [0.16, 0.16, 0.18], mat(bx, 0.72, 0.44)],
      );
    }
    G.bikeDock = mergeParts(bk);
  }

  // Highway Toll Booth Plaza: 3 crash-barrier islands + 2 glazed booth cabs + rooftop HVAC + overhead ETC canopy + lane signal lights + striped barrier arms
  {
    const tb = [
      // Overhead canopy + blue ETC sign fascia + structural trusses
      [box(11.2, 0.82, 3.4), [0.92, 0.93, 0.95], mat(0, 4.82, 0)],
      [box(11.3, 0.52, 3.5), [0.12, 0.38, 0.78], mat(0, 4.88, 0)],
      [box(11.4, 0.12, 3.6), [0.78, 0.80, 0.83], mat(0, 5.24, 0)],
      [cyl(0.24, 0.26, 4.5, 12), [0.62, 0.64, 0.66], mat(-4.5, 2.35, 0)],
      [cyl(0.24, 0.26, 4.5, 12), [0.62, 0.64, 0.66], mat(4.5, 2.35, 0)],
      // Lane traffic signal heads (green arrow / red cross) & ETC radar transponders under canopy
      [box(0.75, 0.45, 0.25), [0.16, 0.18, 0.20], mat(-2.25, 4.25, 1.65)],
      [sphere(0.14, 10, 8), [0.12, 0.95, 0.38], mat(-2.25, 4.25, 1.78)],
      [box(0.75, 0.45, 0.25), [0.16, 0.18, 0.20], mat(2.25, 4.25, 1.65)],
      [sphere(0.14, 10, 8), [0.12, 0.95, 0.38], mat(2.25, 4.25, 1.78)],
      [box(0.45, 0.28, 0.18), [0.92, 0.94, 0.96], mat(-2.25, 4.18, 1.2, 0.35, 0, 0)],
      [box(0.45, 0.28, 0.18), [0.92, 0.94, 0.96], mat(2.25, 4.18, 1.2, 0.35, 0, 0)],
    ];
    // Striped red/white toll barrier arms + drive pedestals
    for (const lx of [-2.2, 2.2]) {
      tb.push(
        [box(0.36, 1.05, 0.36), [0.92, 0.46, 0.12], mat(lx - 1.55, 0.68, 1.2)],
        [box(1.05, 0.10, 0.08), [0.92, 0.16, 0.16], mat(lx - 0.85, 1.15, 1.2)],
        [box(1.05, 0.10, 0.08), [0.96, 0.97, 0.99], mat(lx + 0.15, 1.15, 1.2)],
        [box(1.05, 0.10, 0.08), [0.92, 0.16, 0.16], mat(lx + 1.15, 1.15, 1.2)],
      );
    }
    for (const ix of [-4.5, 0, 4.5]) {
      tb.push(
        [box(0.76, 0.82, 5.2), [0.75, 0.76, 0.74], mat(ix, 0.41, 0)],
        [cyl(0.36, 0.38, 0.84, 12), [0.95, 0.76, 0.12], mat(ix, 0.42, -2.65)],
        [cyl(0.37, 0.37, 0.16, 12), [0.16, 0.17, 0.18], mat(ix, 0.55, -2.65)],
      );
    }
    for (const ix of [-4.5, 0]) {
      tb.push(
        [box(0.68, 2.32, 2.15), [0.88, 0.90, 0.92], mat(ix, 1.36, 0)],
        [box(0.72, 0.94, 1.75), [0.22, 0.38, 0.52], mat(ix, 1.66, 0)],
        // Rooftop mini HVAC unit on toll cab
        [box(0.52, 0.32, 0.68), [0.76, 0.78, 0.80], mat(ix, 2.68, -0.2)],
      );
    }
    G.tollBooth = mergeParts(tb);
  }

  // Hospital 3D Red Cross Monument: white clinical pedestal + circular medallion shield + glowing crimson 3D Red Cross
  G.hospitalCross = mergeParts([
    [cyl(0.68, 0.76, 0.22, 20), [0.68, 0.70, 0.74], mat(0, 0.11, 0)],
    [cyl(0.48, 0.56, 0.85, 20), [0.92, 0.94, 0.96], mat(0, 0.58, 0)],
    [cyl(1.36, 1.36, 0.24, 28), [0.82, 0.85, 0.89], mat(0, 2.12, 0, Math.PI / 2, 0, 0)],
    [cyl(1.24, 1.24, 0.28, 28), [0.97, 0.98, 1.0], mat(0, 2.12, 0, Math.PI / 2, 0, 0)],
    [box(1.88, 0.60, 0.38), [0.94, 0.10, 0.14], mat(0, 2.12, 0)],
    [box(0.60, 1.88, 0.38), [0.94, 0.10, 0.14], mat(0, 2.12, 0)],
  ]);

  // Place of Worship (Church / Cathedral Spire): stone belfry + corner pinnacles + rose window + copper spire + golden cross
  G.worshipSpire = mergeParts([
    [box(2.4, 0.42, 2.4), [0.76, 0.73, 0.68], mat(0, 0.21, 0)],
    [box(2.1, 2.3, 2.1), [0.84, 0.81, 0.75], mat(0, 1.25, 0)],
    [box(2.26, 0.18, 2.26), [0.78, 0.75, 0.69], mat(0, 2.36, 0)],
    [box(2.16, 0.80, 0.70), [0.28, 0.30, 0.34], mat(0, 1.55, 0)],
    [box(0.70, 0.80, 2.16), [0.28, 0.30, 0.34], mat(0, 1.55, 0)],
    [cyl(0.38, 0.38, 2.18, 16), [0.22, 0.36, 0.54], mat(0, 0.78, 0, Math.PI / 2, 0, 0)],
    [cone(0.24, 0.75, 8), [0.80, 0.77, 0.71], mat(-0.92, 2.75, -0.92)],
    [cone(0.24, 0.75, 8), [0.80, 0.77, 0.71], mat(0.92, 2.75, -0.92)],
    [cone(0.24, 0.75, 8), [0.80, 0.77, 0.71], mat(-0.92, 2.75, 0.92)],
    [cone(0.24, 0.75, 8), [0.80, 0.77, 0.71], mat(0.92, 2.75, 0.92)],
    [cone(1.22, 4.1, 16), [0.24, 0.48, 0.44], mat(0, 4.45, 0)],
    [sphere(0.18, 12, 8), [0.95, 0.78, 0.20], mat(0, 6.45, 0)],
    [box(0.14, 1.10, 0.14), [0.95, 0.78, 0.20], mat(0, 6.95, 0)],
    [box(0.66, 0.14, 0.14), [0.95, 0.78, 0.20], mat(0, 7.10, 0)],
  ]);

  // Place of Worship (East Asian Temple / Shrine Torii Gate): vermilion pillars + nemaki bases + kasagi curved lintel + gold gakuzuka plaque
  G.worshipTorii = mergeParts([
    [cyl(0.36, 0.42, 0.48, 16), [0.24, 0.24, 0.27], mat(-1.7, 0.24, 0)],
    [cyl(0.36, 0.42, 0.48, 16), [0.24, 0.24, 0.27], mat(1.7, 0.24, 0)],
    [cyl(0.23, 0.26, 4.3, 18), [0.86, 0.16, 0.12], mat(-1.7, 2.35, 0)],
    [cyl(0.23, 0.26, 4.3, 18), [0.86, 0.16, 0.12], mat(1.7, 2.35, 0)],
    [box(4.6, 0.26, 0.24), [0.86, 0.16, 0.12], mat(0, 3.60, 0)],
    [box(0.38, 0.24, 0.34), [0.16, 0.17, 0.20], mat(-1.7, 3.60, 0)],
    [box(0.38, 0.24, 0.34), [0.16, 0.17, 0.20], mat(1.7, 3.60, 0)],
    [box(5.3, 0.30, 0.36), [0.86, 0.16, 0.12], mat(0, 4.48, 0)],
    [box(5.7, 0.20, 0.46), [0.16, 0.17, 0.20], mat(0, 4.74, 0)],
    [box(0.95, 0.20, 0.46), [0.16, 0.17, 0.20], mat(-2.85, 4.82, 0, 0, 0, -0.16)],
    [box(0.95, 0.20, 0.46), [0.16, 0.17, 0.20], mat(2.85, 4.82, 0, 0, 0, 0.16)],
    [box(0.56, 0.80, 0.30), [0.18, 0.18, 0.22], mat(0, 4.04, 0)],
    [box(0.44, 0.68, 0.34), [0.94, 0.76, 0.18], mat(0, 4.04, 0)],
  ]);

  // High-detail Boeing 787 / Airbus A350 wide-body airliner (nose +Z)
  {
    const airlinerGeoms = buildAirlinerInstancedGeometries();
    G.plane = airlinerGeoms.plane;
    G.planeTail = airlinerGeoms.planeTail;
  }
  // Cargo ship (bow +Z), 120 m; hull with bulbous bow, forecastle, colorful container stacks, bridge superstructure, radar mast & lifeboats
  {
    const shape = new THREE.Shape();
    shape.moveTo(-9, 60);
    shape.lineTo(9, 60);
    shape.lineTo(9, -38);
    shape.lineTo(0, -60);
    shape.lineTo(-9, -38);
    shape.lineTo(-9, 60);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -4, 0);
    const parts = [[hull, [0.16, 0.20, 0.28], null]];
    // Anti-fouling crimson boot-topping + bulbous bow + forecastle deck
    parts.push([box(18.4, 1.4, 98), [0.64, 0.15, 0.13], mat(0, -0.2, -10)]);
    parts.push([sphere(3.6, 14, 10), [0.64, 0.15, 0.13], mat(0, -1.2, 59, 0, 0, 0, 0.85, 0.75, 2.1)]);
    parts.push([box(17.4, 0.4, 96), [0.34, 0.37, 0.35], mat(0, 6.05, -10)]);
    parts.push([box(14.5, 1.8, 12), [0.22, 0.26, 0.34], mat(0, 6.8, 48)]);
    // Multi-row colorful shipping container stacks with longitudinal & transverse aisles
    const cont = [
      [0.78, 0.22, 0.16], [0.16, 0.42, 0.68], [0.88, 0.66, 0.16],
      [0.24, 0.56, 0.34], [0.14, 0.52, 0.56], [0.68, 0.28, 0.18],
    ];
    for (let i = 0; i < 6; i++) {
      const zc = 30 - i * 11.2;
      for (const xc of [-4.8, 0, 4.8]) {
        const tiers = 2 + ((i + (xc === 0 ? 1 : 0)) % 3);
        for (let t = 0; t < tiers; t++) {
          const c = cont[(i * 3 + t + (xc > 0 ? 2 : 0)) % cont.length];
          parts.push([box(4.4, 2.5, 9.6), c, mat(xc, 7.45 + t * 2.55, zc)]);
        }
      }
    }
    // Tiered white aft superstructure + bridge wings + panoramic glazing + funnel + radar mast + orange lifeboats
    parts.push([box(15.6, 10.5, 10.5), [0.94, 0.94, 0.92], mat(0, 11.2, -45)]);
    parts.push([box(13.8, 4.5, 8.5), [0.95, 0.95, 0.93], mat(0, 18.2, -44.5)]);
    parts.push([box(21.2, 1.8, 4.4), [0.92, 0.92, 0.90], mat(0, 20.6, -42)]);
    parts.push([box(21.4, 0.9, 4.6), [0.16, 0.22, 0.30], mat(0, 20.8, -42)]);
    parts.push([box(15.8, 0.8, 10.7), [0.22, 0.26, 0.32], mat(0, 14.2, -45)]);
    // Exhaust funnel casing + black uptake crown
    parts.push([cyl(1.9, 2.3, 5.8, 14), [0.76, 0.20, 0.15], mat(0, 23.2, -50.5)]);
    parts.push([cyl(1.85, 1.95, 1.2, 14), [0.14, 0.15, 0.17], mat(0, 26.2, -50.5)]);
    // Radar mast & scanner bars
    parts.push([cyl(0.22, 0.38, 6.5, 10), [0.85, 0.87, 0.90], mat(0, 24.5, -42.5)]);
    parts.push([box(4.2, 0.35, 0.45), [0.95, 0.96, 0.98], mat(0, 26.8, -42.5)]);
    // Port & starboard orange free-fall lifeboats
    parts.push([cyl(0.9, 0.9, 4.2, 10), [0.94, 0.38, 0.10], mat(-8.4, 13.5, -46, Math.PI / 2, 0, 0)]);
    parts.push([cyl(0.9, 0.9, 4.2, 10), [0.94, 0.38, 0.10], mat(8.4, 13.5, -46, Math.PI / 2, 0, 0)]);
    G.ship = mergeParts(parts);
  }
  // High-speed commuter/intercity rail coach: aerodynamic carbody, individual windows, doors, roof HVAC pods, pantograph & wheel bogies
  {
    const tc = [
      // Lower chassis skirt + main carbody + rounded roof crown
      [box(2.92, 0.55, 19.6), [0.24, 0.26, 0.29], mat(0, 1.15, 0)],
      [box(3.0, 2.65, 20.0), [0.93, 0.94, 0.92], mat(0, 2.72, 0)],
      [cyl(1.48, 1.48, 19.8, 14), [0.84, 0.86, 0.88], mat(0, 3.92, 0, Math.PI / 2, 0, 0, 1, 1, 0.32)],
      // Crimson/orange livery cheatslines + dark window band + end gangway diaphragms
      [box(3.05, 0.28, 19.9), [0.86, 0.26, 0.18], mat(0, 2.12, 0)],
      [box(3.04, 0.12, 19.9), [0.86, 0.26, 0.18], mat(0, 3.68, 0)],
      [box(2.35, 2.55, 20.3), [0.18, 0.20, 0.22], mat(0, 2.68, 0)],
      // Rooftop HVAC pods + pantograph frame
      [box(2.1, 0.34, 3.8), [0.64, 0.66, 0.69], mat(0, 4.48, -4.5)],
      [box(2.1, 0.34, 3.8), [0.64, 0.66, 0.69], mat(0, 4.48, 4.5)],
      [box(1.5, 0.08, 2.2), [0.35, 0.37, 0.40], mat(0, 4.52, 0)],
      [box(1.6, 0.06, 0.08), [0.72, 0.74, 0.78], mat(0, 5.05, 0)],
    ];
    // Individual passenger windows & double sliding doors along sides
    for (let wz = -7.8; wz <= 7.8; wz += 1.95) {
      const isDoor = Math.abs( Math.abs(wz) - 5.85 ) < 0.5;
      if (isDoor) {
        tc.push([box(3.06, 2.15, 1.32), [0.78, 0.80, 0.82], mat(0, 2.48, wz)]);
        tc.push([box(3.08, 0.82, 1.05), [0.14, 0.18, 0.24], mat(0, 3.02, wz)]);
      } else {
        tc.push([box(3.06, 0.88, 1.42), [0.14, 0.18, 0.24], mat(0, 3.05, wz)]);
      }
    }
    // 2 Dual-axle bogie trucks with 4 steel wheels each
    for (const bz of [-6.5, 6.5]) {
      tc.push([box(2.45, 0.52, 3.1), [0.18, 0.19, 0.21], mat(0, 0.68, bz)]);
      for (const az of [bz - 1.05, bz + 1.05]) {
        tc.push([cyl(0.46, 0.46, 2.32, 12), [0.14, 0.15, 0.17], mat(0, 0.46, az, 0, 0, Math.PI / 2)]);
      }
    }
    G.trainCar = mergeParts(tc);
  }

  // ---------------- Batch 1: Civic, Emergency, Postal, Healthcare & Education ----------------
  // Parked black-and-white police patrol cruiser with push bumper, A-pillar spotlight, red/blue lightbar & alloy wheels
  {
    const pc = [
      [box(1.92, 0.54, 4.65), [0.12, 0.14, 0.18], mat(0, 0.44, 0)],
      [box(1.94, 0.52, 1.95), [0.96, 0.97, 0.99], mat(0, 0.45, 0)],
      [box(1.66, 0.52, 2.05), [0.96, 0.97, 0.99], mat(0, 0.94, -0.10)],
      [box(1.70, 0.38, 1.85), [0.16, 0.22, 0.30], mat(0, 0.92, -0.10)],
      // Lightbar mounting feet + red/blue LED pods + center takedown lamp
      [box(1.12, 0.05, 0.18), [0.22, 0.24, 0.28], mat(0, 1.21, -0.05)],
      [box(0.52, 0.12, 0.24), [0.94, 0.12, 0.15], mat(-0.30, 1.26, -0.05)],
      [box(0.52, 0.12, 0.24), [0.10, 0.40, 0.98], mat(0.30, 1.26, -0.05)],
      [box(0.16, 0.13, 0.26), [0.98, 0.98, 1.0], mat(0, 1.26, -0.05)],
      // Front push bumper + grille + headlights + taillights + side mirrors + A-pillar spotlight + antennas
      [box(0.92, 0.46, 0.12), [0.14, 0.15, 0.18], mat(0, 0.44, 2.38)],
      [cyl(0.03, 0.03, 0.52, 8), [0.14, 0.15, 0.18], mat(-0.42, 0.46, 2.42)],
      [cyl(0.03, 0.03, 0.52, 8), [0.14, 0.15, 0.18], mat(0.42, 0.46, 2.42)],
      [box(0.42, 0.14, 0.06), [0.95, 0.97, 1.0], mat(-0.68, 0.52, 2.32)],
      [box(0.42, 0.14, 0.06), [0.95, 0.97, 1.0], mat(0.68, 0.52, 2.32)],
      [box(0.44, 0.14, 0.06), [0.90, 0.12, 0.14], mat(-0.66, 0.54, -2.32)],
      [box(0.44, 0.14, 0.06), [0.90, 0.12, 0.14], mat(0.66, 0.54, -2.32)],
      [sphere(0.09, 8, 6), [0.92, 0.94, 0.98], mat(-0.92, 0.82, 0.78)],
      [cyl(0.015, 0.015, 0.55, 6), [0.20, 0.22, 0.25], mat(0, 1.45, -0.65)],
      [cyl(0.015, 0.015, 0.45, 6), [0.20, 0.22, 0.25], mat(0, 0.92, -1.65)],
    ];
    for (const [wx, wz] of [[-0.88, 1.42], [0.88, 1.42], [-0.88, -1.42], [0.88, -1.42]]) {
      pc.push(
        [cyl(0.34, 0.34, 0.24, 14), [0.14, 0.15, 0.16], mat(wx, 0.34, wz, 0, 0, Math.PI / 2)],
        [cyl(0.20, 0.20, 0.25, 10), [0.76, 0.78, 0.82], mat(wx, 0.34, wz, 0, 0, Math.PI / 2)],
      );
    }
    G.policeCruiser = mergeParts(pc);
  }

  // Station entrance blue police lamp globe on a dark steel column with gold crest band
  G.policeBeacon = mergeParts([
    [cyl(0.32, 0.36, 0.16, 18), [0.18, 0.20, 0.24], mat(0, 0.08, 0)],
    [cyl(0.24, 0.30, 0.42, 18), [0.24, 0.26, 0.30], mat(0, 0.32, 0)],
    [cyl(0.10, 0.13, 2.75, 18), [0.16, 0.20, 0.28], mat(0, 1.72, 0)],
    [cyl(0.24, 0.16, 0.20, 18), [0.92, 0.76, 0.18], mat(0, 3.12, 0)],
    [sphere(0.40, 20, 14), [0.14, 0.50, 0.98], mat(0, 3.52, 0, 0, 0, 0, 1, 1.15, 1)],
    [box(0.56, 0.14, 0.56), [0.96, 0.98, 1.0], mat(0, 3.52, 0)],
    [cone(0.34, 0.22, 18), [0.16, 0.20, 0.28], mat(0, 3.96, 0)],
    [sphere(0.06, 12, 8), [0.92, 0.76, 0.18], mat(0, 4.10, 0)],
  ]);

  // Red fire engine apparatus with roll-up equipment lockers, pump panel, hose reel, white roof ladder & chrome bumper
  {
    const ft = [
      [box(2.42, 2.15, 7.60), [0.84, 0.12, 0.14], mat(0, 1.52, -0.30)],
      [box(2.44, 0.28, 7.64), [0.96, 0.97, 0.99], mat(0, 1.32, -0.30)],
      [box(2.42, 2.25, 2.45), [0.88, 0.14, 0.15], mat(0, 1.58, 2.55)],
      [box(2.30, 0.72, 0.18), [0.16, 0.22, 0.30], mat(0, 2.10, 3.72)],
      [box(2.46, 0.68, 1.65), [0.16, 0.22, 0.30], mat(0, 2.08, 2.55)],
      [box(2.50, 0.34, 0.28), [0.85, 0.87, 0.90], mat(0, 0.56, 3.84)],
      [box(1.40, 0.65, 0.12), [0.78, 0.80, 0.84], mat(0, 1.12, 3.80)],
      // Aluminum roll-up equipment compartment bays + dark pump control panel
      [box(2.46, 1.15, 1.15), [0.76, 0.79, 0.82], mat(0, 1.58, -0.10)],
      [box(2.46, 1.15, 1.15), [0.76, 0.79, 0.82], mat(0, 1.58, -1.45)],
      [box(2.46, 1.15, 1.15), [0.76, 0.79, 0.82], mat(0, 1.58, -2.80)],
      [box(2.45, 0.95, 0.82), [0.22, 0.24, 0.28], mat(0, 1.52, 0.95)],
      // White aluminum roof extension ladder with rungs + suction hoses + red/white lightbars
      [box(0.10, 0.18, 6.40), [0.95, 0.96, 0.98], mat(0.18, 2.75, -0.10)],
      [box(0.10, 0.18, 6.40), [0.95, 0.96, 0.98], mat(0.72, 2.75, -0.10)],
      [cyl(0.14, 0.14, 5.80, 10), [0.24, 0.26, 0.28], mat(-0.65, 2.72, -0.30, Math.PI / 2, 0, 0)],
      [box(1.65, 0.16, 0.32), [0.96, 0.14, 0.14], mat(0, 2.78, 3.25)],
      [box(0.55, 0.18, 0.34), [0.98, 0.98, 1.0], mat(0, 2.79, 3.25)],
    ];
    for (let lz = -3.0; lz <= 2.7; lz += 0.65) {
      ft.push([box(0.54, 0.05, 0.05), [0.88, 0.90, 0.93], mat(0.45, 2.75, lz)]);
    }
    for (const [wx, wz] of [[-1.12, 2.35], [1.12, 2.35], [-1.12, -2.25], [1.12, -2.25]]) {
      ft.push(
        [cyl(0.48, 0.48, 0.34, 14), [0.14, 0.15, 0.16], mat(wx, 0.48, wz, 0, 0, Math.PI / 2)],
        [cyl(0.26, 0.26, 0.36, 10), [0.82, 0.84, 0.88], mat(wx, 0.48, wz, 0, 0, Math.PI / 2)],
      );
    }
    G.fireTruck = mergeParts(ft);
  }

  // Red roll-up fire station apparatus bay door fascia with glazed vision lites, bollards & alarm strobe
  {
    const fd = [
      // Stone/concrete portal surround + cornice header
      [box(4.28, 4.12, 0.36), [0.90, 0.88, 0.84], mat(0, 2.06, 0)],
      [box(4.48, 0.28, 0.48), [0.86, 0.14, 0.16], mat(0, 3.96, 0.06)],
      // Crimson sectional overhead door + horizontal panel ribs + 4 glazed vision windows
      [box(3.60, 3.56, 0.40), [0.84, 0.12, 0.14], mat(0, 1.78, 0.04)],
      // Twin yellow/black safety bumper bollards flanking bay entrance
      [cyl(0.11, 0.11, 1.05, 10), [0.95, 0.76, 0.12], mat(-1.92, 0.52, 0.34)],
      [cyl(0.11, 0.11, 1.05, 10), [0.95, 0.76, 0.12], mat(1.92, 0.52, 0.34)],
      // Flashing red alarm beacon + acoustic bell housing above lintel
      [cyl(0.16, 0.18, 0.24, 12), [0.98, 0.18, 0.12], mat(0, 4.28, 0.20)],
      [sphere(0.16, 12, 8), [1.0, 0.30, 0.18], mat(0, 4.40, 0.20)],
      [cyl(0.14, 0.14, 0.10, 12), [0.88, 0.72, 0.18], mat(1.45, 4.18, 0.22, Math.PI / 2, 0, 0)],
    ];
    for (const ry of [0.65, 1.25, 1.85, 2.95, 3.45]) {
      fd.push([box(3.64, 0.05, 0.44), [0.62, 0.08, 0.10], mat(0, ry, 0.05)]);
    }
    for (const wx of [-1.20, -0.40, 0.40, 1.20]) {
      fd.push([box(0.64, 0.48, 0.45), [0.22, 0.26, 0.32], mat(wx, 2.40, 0.05)]);
      fd.push([box(0.56, 0.40, 0.47), [0.58, 0.78, 0.90], mat(wx, 2.40, 0.06)]);
    }
    G.fireDoor = mergeParts(fd);
  }

  // Iconic 3D street mailbox (arched USPS / pillar box with mail chute hood, collection plate, base ribs & rivets)
  {
    const pb = [
      [box(0.68, 0.12, 0.68), [0.30, 0.32, 0.35], mat(0, 0.06, 0)],
      [box(0.10, 0.24, 0.10), [0.85, 0.85, 0.88], mat(-0.22, 0.18, -0.22)],
      [box(0.10, 0.24, 0.10), [0.85, 0.85, 0.88], mat(0.22, 0.18, -0.22)],
      [box(0.10, 0.24, 0.10), [0.85, 0.85, 0.88], mat(-0.22, 0.18, 0.22)],
      [box(0.10, 0.24, 0.10), [0.85, 0.85, 0.88], mat(0.22, 0.18, 0.22)],
      [box(0.56, 0.92, 0.56), [1.0, 1.0, 1.0], mat(0, 0.68, 0)],
      [box(0.60, 0.06, 0.60), [0.88, 0.90, 0.92], mat(0, 0.28, 0)],
      [box(0.60, 0.06, 0.60), [0.88, 0.90, 0.92], mat(0, 1.12, 0)],
      [cyl(0.28, 0.28, 0.56, 20), [1.0, 1.0, 1.0], mat(0, 1.14, 0, 0, 0, Math.PI / 2)],
      // Pull-down mail chute hood + chrome handle + collection schedule card frame + brass keyhole
      [box(0.44, 0.14, 0.14), [0.92, 0.94, 0.96], mat(0, 1.06, 0.31, 0.35, 0, 0)],
      [cyl(0.015, 0.015, 0.22, 8), [0.82, 0.85, 0.88], mat(0, 1.13, 0.38, 0, 0, Math.PI / 2)],
      [box(0.40, 0.08, 0.60), [0.14, 0.16, 0.20], mat(0, 1.02, 0)],
      [box(0.36, 0.24, 0.59), [0.95, 0.96, 0.98], mat(0, 0.74, 0)],
      [box(0.30, 0.18, 0.61), [0.20, 0.42, 0.78], mat(0, 0.74, 0)],
      [cyl(0.025, 0.025, 0.60, 8), [0.88, 0.72, 0.20], mat(0.18, 0.52, 0, Math.PI / 2, 0, 0)],
    ];
    G.postBox = mergeParts(pb);
  }

  // Yellow/dark-grey multi-column automated parcel locker bank with compartment doors, scanner console, security camera & canopy LED
  {
    const pl = [
      [box(2.90, 0.12, 0.82), [0.34, 0.36, 0.38], mat(0, 0.06, 0)],
      [box(2.74, 2.06, 0.64), [0.95, 0.78, 0.12], mat(0, 1.12, 0)],
      // Center dark console pillar + touchscreen + barcode reader + card reader
      [box(0.54, 2.08, 0.68), [0.18, 0.20, 0.24], mat(0, 1.12, 0)],
      [box(0.38, 0.46, 0.71), [0.22, 0.78, 0.96], mat(0, 1.40, 0)],
      [box(0.24, 0.12, 0.71), [0.92, 0.18, 0.16], mat(0, 1.05, 0)],
      [box(0.14, 0.16, 0.71), [0.78, 0.80, 0.84], mat(0.12, 1.05, 0)],
      // Overhanging canopy roof + warm LED light strip + dome security camera
      [box(2.94, 0.14, 0.96), [0.20, 0.22, 0.26], mat(0, 2.20, 0.08)],
      [box(2.70, 0.04, 0.12), [0.98, 0.96, 0.88], mat(0, 2.12, 0.44)],
      [sphere(0.07, 10, 8), [0.12, 0.14, 0.16], mat(0, 2.11, 0.48)],
      // Vertical column dividers
      [box(0.03, 1.96, 0.67), [0.72, 0.56, 0.08], mat(-0.82, 1.12, 0)],
      [box(0.03, 1.96, 0.67), [0.72, 0.56, 0.08], mat(0.82, 1.12, 0)],
    ];
    for (const hy of [0.42, 0.74, 1.06, 1.38, 1.70, 1.96]) {
      pl.push([box(2.68, 0.03, 0.67), [0.72, 0.56, 0.08], mat(0, hy, 0)]);
    }
    for (const lx of [-1.10, -0.54, 0.54, 1.10]) {
      for (const ly of [0.58, 0.90, 1.22, 1.54, 1.84]) {
        pl.push([box(0.04, 0.05, 0.68), [0.76, 0.78, 0.82], mat(lx, ly, 0)]);
      }
    }
    G.parcelLocker = mergeParts(pl);
  }

  // Medical / dental / veterinary cross canopy pylon totem sign with Caduceus/cross medallion & LED trim
  {
    const cc = [
      [box(1.24, 0.24, 0.76), [0.64, 0.68, 0.72], mat(0, 0.12, 0)],
      [box(1.06, 0.14, 0.58), [0.76, 0.80, 0.84], mat(0, 0.28, 0)],
      // Side aluminum pilasters + white central monolith
      [cyl(0.08, 0.08, 3.25, 12), [0.72, 0.76, 0.80], mat(-0.46, 1.82, 0)],
      [cyl(0.08, 0.08, 3.25, 12), [0.72, 0.76, 0.80], mat(0.46, 1.82, 0)],
      [box(0.88, 3.20, 0.32), [0.96, 0.98, 1.0], mat(0, 1.82, 0)],
      [box(1.04, 0.36, 0.40), [0.08, 0.56, 0.78], mat(0, 3.38, 0)],
      // Circular halo ring + 3D teal/emerald cross + glowing white inner cross
      [torus(0.62, 0.045, 10, 20), [0.12, 0.74, 0.88], mat(0, 2.48, 0, 0, 0, 0)],
      [box(1.18, 0.40, 0.44), [0.08, 0.62, 0.82], mat(0, 2.48, 0)],
      [box(0.40, 1.18, 0.44), [0.08, 0.62, 0.82], mat(0, 2.48, 0)],
      [box(0.94, 0.20, 0.48), [1.0, 1.0, 1.0], mat(0, 2.48, 0)],
      [box(0.20, 0.94, 0.48), [1.0, 1.0, 1.0], mat(0, 2.48, 0)],
      // Lower directory slats
      [box(0.72, 0.16, 0.36), [0.08, 0.56, 0.78], mat(0, 1.38, 0)],
      [box(0.72, 0.16, 0.36), [0.08, 0.56, 0.78], mat(0, 1.12, 0)],
      [box(0.72, 0.16, 0.36), [0.08, 0.56, 0.78], mat(0, 0.86, 0)],
    ];
    G.clinicCross = mergeParts(cc);
  }

  // Tall 9m silver/white flagpole with fluttering civic/national banner and stone pedestal
  G.flagpole = mergeParts([
    [cyl(0.66, 0.76, 0.42, 16), [0.78, 0.76, 0.72], mat(0, 0.21, 0)],
    [cyl(0.36, 0.48, 0.55, 16), [0.86, 0.85, 0.82], mat(0, 0.68, 0)],
    [torus(0.38, 0.04, 10, 20), [0.72, 0.70, 0.66], mat(0, 0.95, 0, Math.PI / 2, 0, 0)],
    [cyl(0.045, 0.095, 8.6, 16), [0.92, 0.94, 0.96], mat(0, 4.80, 0)],
    [sphere(0.14, 14, 10), [0.95, 0.78, 0.18], mat(0, 9.20, 0)],
    [box(1.15, 1.10, 0.06), [0.86, 0.14, 0.16], mat(0.62, 8.35, 0)],
    [box(0.95, 1.04, 0.06), [0.86, 0.14, 0.16], mat(1.62, 8.28, 0.12, 0, 0.22, 0)],
    [box(0.62, 0.52, 0.07), [0.12, 0.32, 0.76], mat(0.36, 8.62, 0)],
  ]);

  // Tall concrete/steel perimeter guard watchtower with catwalk railings, access ladder, observation cabin & searchlight roof
  {
    const wt = [
      [box(3.4, 0.45, 3.4), [0.56, 0.58, 0.60], mat(0, 0.225, 0)],
      [box(2.1, 7.6, 2.1), [0.72, 0.73, 0.70], mat(0, 4.20, 0)],
      [box(2.35, 0.24, 2.35), [0.60, 0.62, 0.60], mat(0, 3.00, 0)],
      [box(2.35, 0.24, 2.35), [0.60, 0.62, 0.60], mat(0, 5.60, 0)],
      // Corner pilasters + exterior caged ladder
      [box(0.22, 7.6, 0.22), [0.58, 0.60, 0.58], mat(-1.02, 4.20, -1.02)],
      [box(0.22, 7.6, 0.22), [0.58, 0.60, 0.58], mat(1.02, 4.20, -1.02)],
      [box(0.22, 7.6, 0.22), [0.58, 0.60, 0.58], mat(-1.02, 4.20, 1.02)],
      [box(0.22, 7.6, 0.22), [0.58, 0.60, 0.58], mat(1.02, 4.20, 1.02)],
      [box(0.45, 7.5, 0.08), [0.34, 0.36, 0.38], mat(0, 4.20, -1.12)],
      // Cantilevered catwalk deck + guardrails + glazed cabin + roof + searchlight + comm whip
      [box(3.9, 0.36, 3.9), [0.48, 0.50, 0.52], mat(0, 8.15, 0)],
      [box(3.75, 0.08, 3.75), [0.32, 0.34, 0.36], mat(0, 9.25, 0)],
      [box(3.4, 0.95, 3.4), [0.64, 0.66, 0.64], mat(0, 8.75, 0)],
      [box(3.1, 1.35, 3.1), [0.22, 0.32, 0.42], mat(0, 9.75, 0)],
      [cone(2.68, 1.38, 16), [0.32, 0.35, 0.38], mat(0, 11.05, 0, 0, Math.PI / 8, 0)],
      [cyl(0.26, 0.20, 0.48, 16), [0.22, 0.24, 0.28], mat(0.85, 8.95, 1.75, Math.PI / 3, 0, 0)],
      [cyl(0.24, 0.24, 0.08, 16), [1.0, 0.95, 0.62], mat(0.85, 8.85, 1.95, Math.PI / 3, 0, 0)],
      [cyl(0.03, 0.04, 1.8, 8), [0.75, 0.78, 0.82], mat(-0.6, 12.1, 0)],
    ];
    for (const [rx, rz] of [[-1.82, -1.82], [1.82, -1.82], [-1.82, 1.82], [1.82, 1.82]]) {
      wt.push([cyl(0.04, 0.04, 1.05, 8), [0.32, 0.34, 0.36], mat(rx, 8.78, rz)]);
    }
    G.watchtower = mergeParts(wt);
  }

  // ---------------- Batch 4: Street Furniture, Micro-Mobility, Barriers, Sanitation & Wayfinding ----------------
  // 3-hoop stainless steel Sheffield bike rack with 2 colorful parked 3D bicycles
  {
    const br = [
      [box(2.6, 0.07, 1.5), [0.58, 0.60, 0.62], mat(0, 0.035, 0)],
    ];
    for (const hx of [-0.85, 0, 0.85]) {
      br.push(
        [cyl(0.035, 0.035, 0.78, 6), [0.78, 0.81, 0.85], mat(hx, 0.42, -0.36)],
        [cyl(0.035, 0.035, 0.78, 6), [0.78, 0.81, 0.85], mat(hx, 0.42, 0.36)],
        [box(0.07, 0.07, 0.78), [0.78, 0.81, 0.85], mat(hx, 0.80, 0)],
      );
    }
    for (const [bx, col] of [[-0.42, [0.90, 0.22, 0.18]], [0.42, [0.14, 0.62, 0.88]]]) {
      br.push(
        [cyl(0.28, 0.28, 0.05, 10), [0.15, 0.16, 0.18], mat(bx, 0.32, -0.42, 0, 0, Math.PI / 2)],
        [cyl(0.28, 0.28, 0.05, 10), [0.15, 0.16, 0.18], mat(bx, 0.32, 0.42, 0, 0, Math.PI / 2)],
        [box(0.07, 0.42, 0.78), col, mat(bx, 0.48, 0)],
        [box(0.42, 0.05, 0.05), [0.76, 0.78, 0.82], mat(bx, 0.84, -0.34)],
        [box(0.14, 0.06, 0.22), [0.16, 0.16, 0.18], mat(bx, 0.76, 0.22)],
      );
    }
    G.bikeRack = mergeParts(br);
  }

  // Painted parking bay with 2 parked 3D motorcycles/scooters
  {
    const mb = [
      [box(2.8, 0.05, 2.1), [0.28, 0.30, 0.33], mat(0, 0.025, 0)],
      [box(2.82, 0.06, 0.10), [0.94, 0.95, 0.96], mat(0, 0.03, -1.0)],
      [box(2.82, 0.06, 0.10), [0.94, 0.95, 0.96], mat(0, 0.03, 1.0)],
      [box(0.10, 0.06, 2.0), [0.94, 0.95, 0.96], mat(-1.36, 0.03, 0)],
      [box(0.10, 0.06, 2.0), [0.94, 0.95, 0.96], mat(0, 0.03, 0)],
      [box(0.10, 0.06, 2.0), [0.94, 0.95, 0.96], mat(1.36, 0.03, 0)],
    ];
    for (const [mx, col] of [[-0.68, [0.86, 0.16, 0.18]], [0.68, [0.18, 0.24, 0.34]]]) {
      mb.push(
        [cyl(0.28, 0.28, 0.14, 10), [0.14, 0.15, 0.16], mat(mx, 0.30, -0.58, 0, 0, Math.PI / 2)],
        [cyl(0.28, 0.28, 0.14, 10), [0.14, 0.15, 0.16], mat(mx, 0.30, 0.58, 0, 0, Math.PI / 2)],
        [box(0.38, 0.48, 1.25), col, mat(mx, 0.54, 0)],
        [box(0.34, 0.16, 0.68), [0.16, 0.17, 0.19], mat(mx, 0.82, 0.10)],
        [box(0.32, 0.52, 0.18), col, mat(mx, 0.78, -0.48, -0.25, 0, 0)],
        [box(0.62, 0.06, 0.06), [0.76, 0.78, 0.80], mat(mx, 1.04, -0.42)],
        [box(0.36, 0.30, 0.34), [0.22, 0.24, 0.26], mat(mx, 0.96, 0.62)],
      );
    }
    G.motoBay = mergeParts(mb);
  }

  // Real OSM bus_stop / bus_station 3D glazed transit shelter (long axis along X, open front along +Z):
  // cantilevered barrel/arch roof ribs, spider-clamped glass panels, route map lightbox, digital arrival display, bench slats & trash receptacle
  {
    const rbs = [
      // Concrete curb pad + tactile yellow boarding strip along +Z front edge
      [box(4.5, 0.10, 1.90), [0.66, 0.68, 0.70], mat(0, 0.05, 0)],
      [box(4.4, 0.02, 0.28), [0.94, 0.78, 0.14], mat(0, 0.105, 0.76)],
      // 3 Rear structural columns (z = -0.68)
      [cyl(0.085, 0.095, 2.58, 12), [0.20, 0.23, 0.28], mat(-1.68, 1.34, -0.68)],
      [cyl(0.075, 0.085, 2.58, 12), [0.20, 0.23, 0.28], mat(0, 1.34, -0.68)],
      [cyl(0.085, 0.095, 2.58, 12), [0.20, 0.23, 0.28], mat(1.68, 1.34, -0.68)],
      // Tempered rear glass panels + stainless spider clamps
      [box(3.48, 2.12, 0.05), [0.56, 0.76, 0.88], mat(0, 1.30, -0.68)],
      // Illuminated route map & ad lightbox on +X end (x = 1.68)
      [box(0.18, 2.18, 1.28), [0.18, 0.22, 0.28], mat(1.68, 1.30, -0.06)],
      [box(0.22, 1.58, 0.98), [0.94, 0.96, 1.0], mat(1.68, 1.34, -0.06)],
      [box(0.24, 0.42, 0.78), [0.18, 0.56, 0.86], mat(1.68, 1.52, -0.06)],
      // Cantilevered roof deck + 3 arched ribs + blue transit fascia band + LED digital arrival display
      [box(4.24, 0.12, 1.78), [0.22, 0.25, 0.30], mat(0, 2.62, -0.02)],
      [box(4.28, 0.09, 0.14), [0.12, 0.50, 0.92], mat(0, 2.65, 0.84)],
      [box(1.15, 0.22, 0.16), [0.12, 0.14, 0.18], mat(0.65, 2.42, 0.52)],
      [box(1.05, 0.14, 0.18), [0.98, 0.68, 0.12], mat(0.65, 2.42, 0.52)],
      // Slatted wooden bench with armrests + steel legs
      [box(2.24, 0.04, 0.12), [0.68, 0.46, 0.24], mat(-0.28, 0.52, -0.52)],
      [box(2.24, 0.04, 0.12), [0.68, 0.46, 0.24], mat(-0.28, 0.52, -0.36)],
      [box(2.24, 0.04, 0.12), [0.68, 0.46, 0.24], mat(-0.28, 0.52, -0.20)],
      [box(2.24, 0.16, 0.04), [0.64, 0.42, 0.22], mat(-0.28, 0.72, -0.60)],
      [box(0.10, 0.46, 0.38), [0.24, 0.26, 0.30], mat(-1.15, 0.28, -0.38)],
      [box(0.10, 0.46, 0.38), [0.24, 0.26, 0.30], mat(0.58, 0.28, -0.38)],
      [box(0.05, 0.14, 0.36), [0.24, 0.26, 0.30], mat(-1.35, 0.58, -0.38)],
      [box(0.05, 0.14, 0.36), [0.24, 0.26, 0.30], mat(-0.28, 0.58, -0.38)],
      [box(0.05, 0.14, 0.36), [0.24, 0.26, 0.30], mat(0.78, 0.58, -0.38)],
      // Cylindrical trash receptacle + transit stop flag totem on -X side
      [cyl(0.20, 0.18, 0.68, 12), [0.22, 0.25, 0.30], mat(-1.95, 0.42, -0.25)],
      [torus(0.20, 0.025, 8, 12), [0.72, 0.75, 0.78], mat(-1.95, 0.76, -0.25, Math.PI / 2, 0, 0)],
      [cyl(0.055, 0.06, 2.98, 10), [0.75, 0.78, 0.82], mat(-2.05, 1.54, 0.55)],
      [box(0.54, 0.64, 0.10), [0.12, 0.48, 0.88], mat(-2.05, 2.68, 0.55)],
      [box(0.46, 0.32, 0.12), [0.96, 0.98, 1.0], mat(-2.05, 2.15, 0.55)],
    ];
    for (const rx of [-1.68, 0, 1.68]) {
      rbs.push([box(0.10, 0.14, 1.82), [0.18, 0.20, 0.25], mat(rx, 2.66, -0.02, 0.06, 0, 0)]);
      for (const cy of [0.65, 1.95]) {
        rbs.push([cyl(0.04, 0.04, 0.12, 8), [0.78, 0.80, 0.84], mat(rx, cy, -0.68, Math.PI / 2, 0, 0)]);
      }
    }
    G.realBusStop = mergeParts(rbs);
  }

  // Security / parking boom barrier arm with orange/white control pedestal, RFID reader & warning beacon
  {
    const lg = [
      [box(0.62, 0.10, 0.62), [0.52, 0.54, 0.56], mat(-1.65, 0.05, 0)],
      [box(0.46, 1.15, 0.46), [0.92, 0.42, 0.12], mat(-1.65, 0.62, 0)],
      [box(0.48, 0.26, 0.48), [0.18, 0.20, 0.24], mat(-1.65, 1.12, 0)],
      // Amber flashing beacon on top of pedestal + RFID card reader window
      [cyl(0.08, 0.09, 0.14, 12), [0.98, 0.68, 0.10], mat(-1.65, 1.32, 0)],
      [sphere(0.08, 12, 8), [1.0, 0.78, 0.16], mat(-1.65, 1.39, 0)],
      [box(0.26, 0.32, 0.49), [0.14, 0.16, 0.20], mat(-1.65, 0.82, 0)],
      [box(0.18, 0.14, 0.51), [0.22, 0.82, 0.96], mat(-1.65, 0.88, 0)],
      // Pivot hub + counterweight + striped boom arm + end fork rest post
      [cyl(0.14, 0.14, 0.52, 12), [0.22, 0.24, 0.28], mat(-1.65, 0.92, 0, Math.PI / 2, 0, 0)],
      [box(0.38, 0.22, 0.14), [0.22, 0.24, 0.28], mat(-1.92, 0.92, 0)],
      [box(1.15, 0.11, 0.08), [0.92, 0.16, 0.16], mat(-0.90, 0.92, 0)],
      [box(1.15, 0.11, 0.08), [0.96, 0.97, 0.98], mat(0.25, 0.92, 0)],
      [box(1.15, 0.11, 0.08), [0.92, 0.16, 0.16], mat(1.40, 0.92, 0)],
      [box(0.14, 0.92, 0.14), [0.85, 0.86, 0.88], mat(1.85, 0.46, 0)],
      [box(0.22, 0.16, 0.22), [0.92, 0.16, 0.16], mat(1.85, 0.88, 0)],
    ];
    G.liftGate = mergeParts(lg);
  }

  // Yellow/galvanized steel U-frame chicane cycle barrier with rounded elbow bends, base flanges & reflective bands
  {
    const cb = [];
    for (const [ox, oz] of [[-0.25, -0.28], [0.25, 0.28]]) {
      cb.push(
        // Base mounting plates + vertical posts + rounded top corners + crossbar + red/white reflective warning plate
        [cyl(0.11, 0.12, 0.04, 10), [0.42, 0.44, 0.46], mat(ox - 0.50, 0.02, oz)],
        [cyl(0.11, 0.12, 0.04, 10), [0.42, 0.44, 0.46], mat(ox + 0.50, 0.02, oz)],
        [cyl(0.048, 0.048, 0.92, 10), [0.94, 0.76, 0.12], mat(ox - 0.50, 0.48, oz)],
        [cyl(0.048, 0.048, 0.92, 10), [0.94, 0.76, 0.12], mat(ox + 0.50, 0.48, oz)],
        [cyl(0.048, 0.048, 1.00, 10), [0.94, 0.76, 0.12], mat(ox, 0.98, oz, 0, 0, Math.PI / 2)],
        [sphere(0.052, 10, 8), [0.94, 0.76, 0.12], mat(ox - 0.50, 0.96, oz)],
        [sphere(0.052, 10, 8), [0.94, 0.76, 0.12], mat(ox + 0.50, 0.96, oz)],
        [box(0.92, 0.12, 0.08), [0.88, 0.14, 0.14], mat(ox, 0.62, oz)],
        [box(0.32, 0.13, 0.09), [0.96, 0.97, 0.99], mat(ox, 0.62, oz)],
      );
    }
    G.cycleBarrier = mergeParts(cb);
  }

  // Trio of color-coded (blue paper, green glass, yellow plastic) domed recycling igloo bins
  G.recyclingBank = mergeParts([
    [box(2.90, 0.10, 1.15), [0.62, 0.64, 0.66], mat(0, 0.05, 0)],
    // Blue bin
    [cyl(0.42, 0.40, 1.02, 18), [0.14, 0.42, 0.84], mat(-0.92, 0.58, 0)],
    [dome(0.42, 18, 10), [0.16, 0.48, 0.92], mat(-0.92, 1.08, 0)],
    [box(0.24, 0.10, 0.06), [0.10, 0.12, 0.15], mat(-0.92, 1.12, 0.38)],
    // Green bin
    [cyl(0.42, 0.40, 1.02, 18), [0.16, 0.62, 0.32], mat(0, 0.58, 0)],
    [dome(0.42, 18, 10), [0.20, 0.70, 0.36], mat(0, 1.08, 0)],
    [box(0.24, 0.10, 0.06), [0.10, 0.12, 0.15], mat(0, 1.12, 0.38)],
    // Yellow bin
    [cyl(0.42, 0.40, 1.02, 18), [0.92, 0.74, 0.12], mat(0.92, 0.58, 0)],
    [dome(0.42, 18, 10), [0.96, 0.80, 0.16], mat(0.92, 1.08, 0)],
    [box(0.24, 0.10, 0.06), [0.10, 0.12, 0.15], mat(0.92, 1.12, 0.38)],
  ]);

  // Sleek silver/sage JCDecaux-style public restroom pod with curved roof and blue WC badge
  G.toiletKiosk = mergeParts([
    [cyl(1.38, 1.42, 0.16, 24), [0.46, 0.48, 0.50], mat(0, 0.08, 0)],
    [cyl(1.22, 1.22, 2.45, 24), [0.68, 0.74, 0.70], mat(0, 1.35, 0)],
    [box(0.88, 2.05, 0.18), [0.78, 0.82, 0.85], mat(0, 1.15, 1.16)],
    [box(0.06, 0.42, 0.08), [0.85, 0.88, 0.92], mat(0.32, 1.12, 1.26)],
    [cyl(1.42, 1.35, 0.24, 24), [0.30, 0.34, 0.38], mat(0, 2.66, 0)],
    [dome(1.25, 24, 8), [0.34, 0.38, 0.42], mat(0, 2.74, 0, 0, 0, 0, 1, 0.25, 1)],
    [box(0.68, 0.36, 0.16), [0.12, 0.46, 0.88], mat(0, 2.38, 1.24)],
    [box(0.44, 0.14, 0.18), [0.96, 0.98, 1.0], mat(0, 2.38, 1.25)],
  ]);

  // Pedestal park drinking fountain / bottle-filler station with chrome basin
  G.waterFountain = mergeParts([
    [cyl(0.34, 0.38, 0.12, 18), [0.58, 0.60, 0.62], mat(0, 0.06, 0)],
    [cyl(0.14, 0.18, 0.98, 18), [0.18, 0.44, 0.34], mat(0, 0.58, 0)],
    [cyl(0.28, 0.16, 0.18, 18), [0.84, 0.87, 0.90], mat(0, 1.10, 0)],
    [torus(0.26, 0.025, 10, 20), [0.90, 0.92, 0.95], mat(0, 1.18, 0, Math.PI / 2, 0, 0)],
    [box(0.18, 0.42, 0.12), [0.18, 0.44, 0.34], mat(0, 1.28, -0.14)],
    [cyl(0.025, 0.025, 0.12, 12), [0.90, 0.92, 0.96], mat(0, 1.24, -0.02, 0.45, 0, 0)],
    [cyl(0.16, 0.13, 0.10, 16), [0.82, 0.85, 0.88], mat(0, 0.18, 0.24)],
  ]);

  // Iconic red/glazed street telephone kiosk booth
  G.phoneBooth = mergeParts([
    [box(1.06, 0.12, 1.06), [0.28, 0.30, 0.32], mat(0, 0.06, 0)],
    [box(0.96, 2.25, 0.96), [0.84, 0.12, 0.14], mat(0, 1.22, 0)],
    [box(1.00, 1.45, 0.72), [0.62, 0.78, 0.88], mat(0, 1.28, 0)],
    [box(0.72, 1.45, 1.00), [0.62, 0.78, 0.88], mat(0, 1.28, 0)],
    [box(1.02, 0.04, 0.76), [0.84, 0.12, 0.14], mat(0, 1.05, 0)],
    [box(1.02, 0.04, 0.76), [0.84, 0.12, 0.14], mat(0, 1.52, 0)],
    [box(0.76, 0.04, 1.02), [0.84, 0.12, 0.14], mat(0, 1.05, 0)],
    [box(0.76, 0.04, 1.02), [0.84, 0.12, 0.14], mat(0, 1.52, 0)],
    [box(0.98, 0.22, 0.98), [0.96, 0.97, 0.98], mat(0, 2.18, 0)],
    [dome(0.66, 18, 10), [0.84, 0.12, 0.14], mat(0, 2.30, 0, 0, 0, 0, 1, 0.45, 1)],
  ]);

  // Standalone illuminated street banking ATM totem kiosk with privacy hood, keypad, card reader, cash dispenser & security dome
  {
    const atm = [
      [box(0.94, 0.14, 0.78), [0.30, 0.32, 0.36], mat(0, 0.07, 0)],
      [box(0.82, 2.15, 0.58), [0.18, 0.24, 0.34], mat(0, 1.18, 0)],
      [cyl(0.06, 0.06, 2.15, 10), [0.72, 0.75, 0.80], mat(-0.41, 1.18, 0.26)],
      [cyl(0.06, 0.06, 2.15, 10), [0.72, 0.75, 0.80], mat(0.41, 1.18, 0.26)],
      // Illuminated top header sign + security camera dome
      [box(0.88, 0.38, 0.66), [0.12, 0.46, 0.88], mat(0, 2.12, 0)],
      [cyl(0.44, 0.44, 0.66, 14), [0.14, 0.52, 0.94], mat(0, 2.31, 0, 0, 0, Math.PI / 2)],
      [sphere(0.06, 10, 8), [0.10, 0.12, 0.15], mat(0, 1.92, 0.34)],
      // Recessed screen bay + side privacy wings + glowing LCD screen + keypad shelf + glowing green card slot + cash slot
      [box(0.66, 0.56, 0.16), [0.12, 0.16, 0.22], mat(0, 1.42, 0.30)],
      [box(0.04, 0.58, 0.26), [0.22, 0.26, 0.32], mat(-0.32, 1.42, 0.34)],
      [box(0.04, 0.58, 0.26), [0.22, 0.26, 0.32], mat(0.32, 1.42, 0.34)],
      [box(0.54, 0.44, 0.62), [0.36, 0.88, 0.98], mat(0, 1.44, 0.04)],
      [box(0.60, 0.10, 0.70), [0.76, 0.79, 0.82], mat(0, 1.12, 0.09)],
      [box(0.24, 0.04, 0.16), [0.42, 0.45, 0.50], mat(-0.06, 1.17, 0.35, 0.22, 0, 0)],
      [box(0.18, 0.06, 0.05), [0.14, 0.94, 0.46], mat(0.18, 1.24, 0.36)],
      [box(0.32, 0.05, 0.04), [0.10, 0.12, 0.14], mat(0, 0.96, 0.30)],
    ];
    G.streetAtm = mergeParts(atm);
  }

  // Timber-framed glazed park/city map information board with stone bases, knee braces, map legend & pitched roof cap
  {
    const ib = [
      // Stone footing plinths + timber posts + diagonal knee braces
      [cyl(0.16, 0.19, 0.26, 12), [0.54, 0.52, 0.48], mat(-0.88, 0.13, 0)],
      [cyl(0.16, 0.19, 0.26, 12), [0.54, 0.52, 0.48], mat(0.88, 0.13, 0)],
      [cyl(0.085, 0.095, 2.25, 14), [0.46, 0.30, 0.18], mat(-0.88, 1.15, 0)],
      [cyl(0.085, 0.095, 2.25, 14), [0.46, 0.30, 0.18], mat(0.88, 1.15, 0)],
      [box(0.07, 0.48, 0.07), [0.46, 0.30, 0.18], mat(-0.68, 2.02, 0, 0, 0, -0.65)],
      [box(0.07, 0.48, 0.07), [0.46, 0.30, 0.18], mat(0.68, 2.02, 0, 0, 0, 0.65)],
      // Cabinet frame + cream map backing + green park zone + blue water feature + red "You Are Here" pin
      [box(1.94, 1.18, 0.14), [0.52, 0.35, 0.20], mat(0, 1.48, 0)],
      [box(1.70, 0.96, 0.18), [0.93, 0.94, 0.88], mat(0, 1.48, 0)],
      [box(0.68, 0.60, 0.20), [0.26, 0.64, 0.40], mat(-0.36, 1.46, 0)],
      [box(0.66, 0.34, 0.20), [0.20, 0.54, 0.84], mat(0.38, 1.62, 0)],
      [box(0.66, 0.22, 0.20), [0.86, 0.82, 0.72], mat(0.38, 1.24, 0)],
      [sphere(0.05, 8, 6), [0.92, 0.16, 0.14], mat(-0.22, 1.50, 0.09)],
      // Pitched timber roof slopes + ridge beam
      [box(1.26, 0.08, 0.76), [0.36, 0.24, 0.16], mat(-0.56, 2.24, 0, 0, 0, 0.24)],
      [box(1.26, 0.08, 0.76), [0.36, 0.24, 0.16], mat(0.56, 2.24, 0, 0, 0, -0.24)],
      [cyl(0.05, 0.05, 2.32, 10), [0.30, 0.20, 0.12], mat(0, 2.39, 0, 0, 0, Math.PI / 2)],
    ];
    G.infoBoard = mergeParts(ib);
  }

  // Wooden trail guidepost with stone cairn collar, iron clamp bands, pointed arrow blades & elevation plaque
  {
    const gp = [
      // Stacked stone base & galvanized post shoe
      [cyl(0.32, 0.38, 0.18, 12), [0.50, 0.48, 0.46], mat(0, 0.09, 0)],
      [cyl(0.24, 0.28, 0.22, 12), [0.56, 0.54, 0.51], mat(0, 0.26, 0)],
      [box(0.20, 0.26, 0.20), [0.36, 0.38, 0.40], mat(0, 0.44, 0)],
      // Chamfered timber post + pyramidal zinc weather cap + finial ball
      [cyl(0.078, 0.092, 2.65, 12), [0.48, 0.32, 0.18], mat(0, 1.48, 0)],
      [cone(0.13, 0.12, 8), [0.34, 0.36, 0.38], mat(0, 2.84, 0)],
      [sphere(0.065, 10, 8), [0.78, 0.64, 0.22], mat(0, 2.93, 0)],
      // Elevation / trail junction plaque at chest height
      [box(0.28, 0.20, 0.04), [0.24, 0.18, 0.12], mat(0, 1.45, 0.09)],
      [box(0.24, 0.16, 0.045), [0.92, 0.88, 0.76], mat(0, 1.45, 0.092)],
      // 3 Directional sign blades with iron collar rings & pointed arrow tips
      [torus(0.088, 0.016, 8, 14), [0.26, 0.28, 0.30], mat(0, 2.48, 0, Math.PI / 2, 0, 0)],
      [box(0.88, 0.18, 0.045), [0.95, 0.78, 0.14], mat(0.38, 2.48, 0)],
      [box(0.14, 0.13, 0.048), [0.85, 0.16, 0.14], mat(0.84, 2.48, 0, 0, 0, Math.PI / 4)],
      [torus(0.088, 0.016, 8, 14), [0.26, 0.28, 0.30], mat(0, 2.22, 0, Math.PI / 2, 0, 0)],
      [box(0.88, 0.18, 0.045), [0.96, 0.97, 0.95], mat(-0.32, 2.22, 0.18, 0, 0.65, 0)],
      [box(0.20, 0.18, 0.05), [0.86, 0.18, 0.16], mat(-0.62, 2.22, 0.41, 0, 0.65, 0)],
      [torus(0.088, 0.016, 8, 14), [0.26, 0.28, 0.30], mat(0, 1.96, 0, Math.PI / 2, 0, 0)],
      [box(0.84, 0.18, 0.045), [0.18, 0.58, 0.32], mat(0.24, 1.96, -0.24, 0, -0.75, 0)],
      [box(0.18, 0.18, 0.05), [0.94, 0.95, 0.92], mat(0.52, 1.96, -0.50, 0, -0.75, 0)],
    ];
    G.guidepost = mergeParts(gp);
  }

  // ---------------- Batch 5: Religion Archetypes, Monuments, Public Art, Castles, Viewpoints & Cliffs ----------------
  // Mosque: golden/emerald ribbed onion dome + slender cylindrical minaret tower with crescent finial
  G.worshipMosque = mergeParts([
    [box(3.4, 2.2, 3.4), [0.92, 0.89, 0.82], mat(0, 1.10, 0)],
    [cyl(1.45, 1.55, 0.85, 24), [0.86, 0.83, 0.76], mat(0, 2.55, 0)],
    [lathe([[1.32, 0], [1.62, 0.65], [1.45, 1.35], [0.78, 2.05], [0.18, 2.55], [0, 2.85]], 24), [0.12, 0.58, 0.46], mat(0, 2.95, 0)],
    [cyl(0.05, 0.05, 0.85, 12), [0.96, 0.80, 0.20], mat(0, 6.10, 0)],
    [torus(0.22, 0.04, 10, 20, Math.PI * 1.45), [0.96, 0.80, 0.20], mat(0, 6.60, 0, 0, 0, Math.PI * 0.28)],
    // Slender minaret tower at corner
    [cyl(0.36, 0.44, 6.4, 20), [0.92, 0.89, 0.82], mat(2.15, 3.20, 1.85)],
    [cyl(0.56, 0.50, 0.36, 20), [0.14, 0.58, 0.46], mat(2.15, 5.35, 1.85)],
    [cone(0.38, 1.45, 20), [0.92, 0.74, 0.18], mat(2.15, 7.10, 1.85)],
  ]);

  // Pagoda: 3-tiered curved vermilion/charcoal pagoda eaves + golden sorin finial spire
  G.worshipPagoda = mergeParts([
    [box(3.8, 0.65, 3.8), [0.68, 0.66, 0.62], mat(0, 0.325, 0)],
    // Tier 1
    [box(2.5, 1.45, 2.5), [0.78, 0.16, 0.14], mat(0, 1.35, 0)],
    [box(4.1, 0.28, 4.1), [0.18, 0.20, 0.24], mat(0, 2.18, 0)],
    [cone(2.95, 0.55, 4), [0.22, 0.24, 0.28], mat(0, 2.55, 0, 0, Math.PI / 4, 0)],
    // Tier 2
    [box(1.95, 1.25, 1.95), [0.78, 0.16, 0.14], mat(0, 3.35, 0)],
    [box(3.3, 0.25, 3.3), [0.18, 0.20, 0.24], mat(0, 4.05, 0)],
    [cone(2.38, 0.48, 4), [0.22, 0.24, 0.28], mat(0, 4.38, 0, 0, Math.PI / 4, 0)],
    // Tier 3
    [box(1.45, 1.10, 1.45), [0.78, 0.16, 0.14], mat(0, 5.05, 0)],
    [box(2.55, 0.22, 2.55), [0.18, 0.20, 0.24], mat(0, 5.68, 0)],
    [cone(1.85, 0.52, 4), [0.22, 0.24, 0.28], mat(0, 6.02, 0, 0, Math.PI / 4, 0)],
    // Golden sorin finial spire with 9-ring profile
    [cyl(0.06, 0.14, 1.75, 16), [0.94, 0.78, 0.18], mat(0, 7.02, 0)],
    [torus(0.18, 0.035, 8, 16), [0.96, 0.80, 0.20], mat(0, 6.65, 0, Math.PI / 2, 0, 0)],
    [torus(0.15, 0.032, 8, 16), [0.96, 0.80, 0.20], mat(0, 7.05, 0, Math.PI / 2, 0, 0)],
    [torus(0.12, 0.028, 8, 16), [0.96, 0.80, 0.20], mat(0, 7.45, 0, Math.PI / 2, 0, 0)],
    [sphere(0.10, 12, 8), [0.98, 0.84, 0.24], mat(0, 7.92, 0)],
  ]);

  // Synagogue: stepped limestone facade crown + copper dome + twin Decalogue tablets & Star emblem
  G.worshipSynagogue = mergeParts([
    [box(3.2, 2.5, 2.8), [0.90, 0.85, 0.74], mat(0, 1.25, 0)],
    [box(2.4, 0.75, 0.65), [0.92, 0.87, 0.76], mat(0, 2.85, 1.10)],
    [cyl(1.18, 1.24, 0.82, 22), [0.84, 0.79, 0.68], mat(0, 2.88, -0.15)],
    [dome(1.18, 22, 12), [0.24, 0.56, 0.50], mat(0, 3.25, -0.15, 0, 0, 0, 1, 0.92, 1)],
    [sphere(0.12, 12, 8), [0.94, 0.78, 0.20], mat(0, 4.40, -0.15)],
    // Twin arched tablets + blue/gold emblem on front gable
    [box(0.62, 0.76, 0.18), [0.96, 0.95, 0.90], mat(0, 3.32, 1.38)],
    [cyl(0.15, 0.15, 0.18, 14), [0.96, 0.95, 0.90], mat(-0.15, 3.70, 1.38, Math.PI / 2, 0, 0)],
    [cyl(0.15, 0.15, 0.18, 14), [0.96, 0.95, 0.90], mat(0.15, 3.70, 1.38, Math.PI / 2, 0, 0)],
    [box(0.52, 0.52, 0.20), [0.14, 0.44, 0.86], mat(0, 2.15, 1.42, 0, 0, Math.PI / 4)],
  ]);

  // Hindu / Sikh Temple: colorful stepped pyramid Gopuram temple tower with golden Kalasha finial
  G.worshipHindu = mergeParts([
    [box(3.6, 0.75, 3.0), [0.84, 0.76, 0.64], mat(0, 0.38, 0)],
    [box(3.1, 1.25, 2.5), [0.86, 0.44, 0.24], mat(0, 1.35, 0)],
    [box(2.6, 1.15, 2.1), [0.22, 0.62, 0.68], mat(0, 2.52, 0)],
    [box(2.1, 1.05, 1.7), [0.90, 0.66, 0.18], mat(0, 3.58, 0)],
    [box(1.6, 0.95, 1.3), [0.82, 0.24, 0.28], mat(0, 4.55, 0)],
    [cyl(0.62, 0.62, 1.15, 18), [0.92, 0.74, 0.18], mat(0, 5.25, 0, 0, 0, Math.PI / 2)],
    [sphere(0.18, 14, 10), [0.98, 0.82, 0.20], mat(-0.36, 5.96, 0)],
    [sphere(0.22, 14, 10), [0.98, 0.82, 0.20], mat(0, 6.02, 0)],
    [sphere(0.18, 14, 10), [0.98, 0.82, 0.20], mat(0.36, 5.96, 0)],
  ]);

  // Modern brushed-bronze/corten geometric abstract sculpture on a granite pedestal
  G.artworkSculpture = mergeParts([
    [box(1.85, 0.35, 1.85), [0.28, 0.30, 0.32], mat(0, 0.175, 0)],
    [box(1.35, 0.85, 1.35), [0.36, 0.38, 0.42], mat(0, 0.75, 0)],
    [torus(0.92, 0.18, 16, 32), [1.0, 1.0, 1.0], mat(0, 2.18, 0, 0.18, 0.42, 0)],
    [torus(0.58, 0.13, 14, 28), [0.94, 0.78, 0.24], mat(0, 2.25, 0, -0.35, -0.52, 0.25)],
    [sphere(0.26, 18, 14), [0.96, 0.84, 0.28], mat(0, 2.22, 0)],
  ]);

  // Tall stepped stone memorial obelisk on a classical plinth with corner bollards, bronze plaques, cornice & gilded pyramidion
  {
    const ob = [
      // 3-stepped granite stylobate base + classical molded dado plinth + cornice cap
      [box(4.0, 0.35, 4.0), [0.68, 0.67, 0.64], mat(0, 0.175, 0)],
      [box(3.2, 0.38, 3.2), [0.74, 0.73, 0.70], mat(0, 0.54, 0)],
      [box(2.4, 0.38, 2.4), [0.78, 0.77, 0.73], mat(0, 0.92, 0)],
      [box(1.80, 1.55, 1.80), [0.84, 0.82, 0.78], mat(0, 1.85, 0)],
      [box(2.08, 0.18, 2.08), [0.76, 0.74, 0.70], mat(0, 2.68, 0)],
      // Bronze dedication plaques & relief wreaths on all 4 pedestal faces
      [box(1.88, 0.72, 0.76), [0.44, 0.34, 0.20], mat(0, 1.85, 0)],
      [box(0.76, 0.72, 1.88), [0.44, 0.34, 0.20], mat(0, 1.85, 0)],
      [torus(0.24, 0.035, 8, 14), [0.86, 0.68, 0.22], mat(0, 1.85, 0.96, 0, 0, 0)],
      [torus(0.24, 0.035, 8, 14), [0.86, 0.68, 0.22], mat(0, 1.85, -0.96, 0, 0, 0)],
      // Tapered monolith shaft + gilded pyramidion apex + finial orb
      [cyl(0.42, 0.74, 6.2, 4), [0.88, 0.86, 0.82], mat(0, 5.82, 0, 0, Math.PI / 4, 0)],
      [cone(0.42, 0.95, 4), [0.95, 0.78, 0.20], mat(0, 9.38, 0, 0, Math.PI / 4, 0)],
      [sphere(0.08, 10, 8), [0.98, 0.84, 0.24], mat(0, 9.90, 0)],
    ];
    for (const [bx, bz] of [[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]]) {
      ob.push(
        [cyl(0.11, 0.13, 0.65, 10), [0.32, 0.34, 0.36], mat(bx, 0.65, bz)],
        [sphere(0.12, 10, 8), [0.86, 0.68, 0.22], mat(bx, 1.02, bz)],
      );
    }
    G.monumentObelisk = mergeParts(ob);
  }

  // Crenellated medieval stone keep tower with battlements & corner turrets
  {
    const ck = [
      [box(6.4, 6.2, 6.4), [0.68, 0.65, 0.58], mat(0, 3.10, 0)],
      [box(6.8, 0.65, 6.8), [0.62, 0.59, 0.53], mat(0, 6.42, 0)],
      [box(1.65, 2.45, 0.45), [0.22, 0.20, 0.18], mat(0, 1.22, 3.12)],
      [cyl(0.82, 0.82, 0.46, 16), [0.22, 0.20, 0.18], mat(0, 2.44, 3.12, Math.PI / 2, 0, 0)],
    ];
    for (const [tx, tz] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) {
      ck.push(
        [cyl(0.95, 1.05, 7.8, 16), [0.64, 0.61, 0.55], mat(tx, 3.90, tz)],
        [cyl(1.08, 1.02, 0.45, 16), [0.58, 0.55, 0.49], mat(tx, 7.65, tz)],
        [cone(1.18, 1.75, 16), [0.28, 0.32, 0.38], mat(tx, 8.68, tz)],
      );
    }
    G.castleKeep = mergeParts(ck);
  }

  // Timber observation deck platform with concrete piers, plank decking, cable-rail balustrade, panorama map lectern & twin-barrel coin telescope
  {
    const vd = [
      // 4 Concrete foundation piers + timber bearer joists + perimeter fascia frame
      [cyl(0.18, 0.22, 0.26, 8), [0.52, 0.54, 0.56], mat(-1.55, 0.13, -1.15)],
      [cyl(0.18, 0.22, 0.26, 8), [0.52, 0.54, 0.56], mat(1.55, 0.13, -1.15)],
      [cyl(0.18, 0.22, 0.26, 8), [0.52, 0.54, 0.56], mat(-1.55, 0.13, 1.15)],
      [cyl(0.18, 0.22, 0.26, 8), [0.52, 0.54, 0.56], mat(1.55, 0.13, 1.15)],
      [box(3.64, 0.22, 2.84), [0.46, 0.31, 0.18], mat(0, 0.24, 0)],
      // Entry step at rear (-Z)
      [box(1.4, 0.14, 0.38), [0.52, 0.36, 0.22], mat(0, 0.12, -1.58)],
    ];
    // Individual timber deck planks
    for (let pz = -1.2; pz <= 1.21; pz += 0.30) {
      vd.push([box(3.52, 0.05, 0.25), [0.60, 0.42, 0.25], mat(0, 0.36, pz)]);
    }
    // Stainless posts + top timber handrail + mid horizontal safety bars
    for (const [px, pz] of [[-1.72, -1.34], [-1.72, 0], [-1.72, 1.34], [-0.58, 1.34], [0.58, 1.34], [1.72, 1.34], [1.72, 0], [1.72, -1.34]]) {
      vd.push([box(0.08, 0.86, 0.08), [0.74, 0.77, 0.80], mat(px, 0.78, pz)]);
    }
    vd.push(
      [box(3.62, 0.07, 0.12), [0.52, 0.35, 0.20], mat(0, 1.22, 1.34)],
      [box(0.12, 0.07, 2.82), [0.52, 0.35, 0.20], mat(-1.72, 1.22, 0)],
      [box(0.12, 0.07, 2.82), [0.52, 0.35, 0.20], mat(1.72, 1.22, 0)],
      [box(3.50, 0.035, 0.035), [0.78, 0.80, 0.84], mat(0, 0.92, 1.34)],
      [box(3.50, 0.035, 0.035), [0.78, 0.80, 0.84], mat(0, 0.64, 1.34)],
      [box(0.035, 0.035, 2.70), [0.78, 0.80, 0.84], mat(-1.72, 0.92, 0)],
      [box(0.035, 0.035, 2.70), [0.78, 0.80, 0.84], mat(1.72, 0.92, 0)],
      // Angled panoramic peak-finder lectern on front rail
      [box(0.92, 0.06, 0.42), [0.28, 0.30, 0.34], mat(-0.95, 1.24, 1.26, 0.38, 0, 0)],
      [box(0.84, 0.07, 0.34), [0.90, 0.88, 0.80], mat(-0.95, 1.25, 1.26, 0.38, 0, 0)],
      // Coin-operated binocular telescope on stepped footstep pedestal with yoke & twin optical barrels
      [cyl(0.34, 0.38, 0.10, 14), [0.46, 0.48, 0.52], mat(0.35, 0.42, 0.72)],
      [cyl(0.22, 0.26, 0.12, 14), [0.52, 0.55, 0.58], mat(0.35, 0.52, 0.72)],
      [cyl(0.075, 0.11, 1.02, 14), [0.76, 0.79, 0.82], mat(0.35, 1.02, 0.72)],
      [box(0.18, 0.22, 0.16), [0.32, 0.35, 0.38], mat(0.35, 1.26, 0.72)],
      [box(0.26, 0.16, 0.28), [0.85, 0.88, 0.92], mat(0.35, 1.54, 0.72)],
      [cyl(0.072, 0.055, 0.52, 12), [0.90, 0.92, 0.96], mat(0.27, 1.58, 0.84, Math.PI / 2 - 0.12, 0, 0)],
      [cyl(0.072, 0.055, 0.52, 12), [0.90, 0.92, 0.96], mat(0.43, 1.58, 0.84, Math.PI / 2 - 0.12, 0, 0)],
      [cyl(0.076, 0.076, 0.06, 12), [0.16, 0.22, 0.30], mat(0.27, 1.61, 1.10, Math.PI / 2 - 0.12, 0, 0)],
      [cyl(0.076, 0.076, 0.06, 12), [0.16, 0.22, 0.30], mat(0.43, 1.61, 1.10, Math.PI / 2 - 0.12, 0, 0)],
    );
    G.viewpointDeck = mergeParts(vd);
  }

  // Stacked stone summit cairn + white trigonometric survey pillar + summit register box + timber cross with bronze ring
  G.summitCairn = mergeParts([
    [cyl(1.40, 1.70, 0.55, 14), [0.54, 0.52, 0.48], mat(0, 0.275, 0)],
    [cyl(0.98, 1.32, 0.55, 14), [0.60, 0.58, 0.54], mat(0, 0.80, 0)],
    [cyl(0.60, 0.90, 0.50, 12), [0.66, 0.64, 0.60], mat(0, 1.30, 0)],
    [sphere(0.32, 10, 8), [0.58, 0.56, 0.52], mat(-0.85, 0.45, 0.55, 0, 0, 0, 1.2, 0.8, 1.0)],
    [sphere(0.28, 10, 8), [0.52, 0.50, 0.46], mat(0.45, 0.55, -0.75, 0, 0, 0, 1.1, 0.85, 1.2)],
    [box(0.38, 1.15, 0.38), [0.95, 0.96, 0.98], mat(0.68, 0.82, 0)],
    [cyl(0.12, 0.12, 0.16, 12), [0.22, 0.24, 0.28], mat(0.68, 1.46, 0)],
    [box(0.15, 2.40, 0.15), [0.46, 0.32, 0.18], mat(0, 2.58, 0)],
    [box(1.02, 0.15, 0.15), [0.46, 0.32, 0.18], mat(0, 3.22, 0)],
    [torus(0.26, 0.028, 8, 16), [0.82, 0.66, 0.22], mat(0, 3.22, 0, 0, 0, 0)],
    [box(0.26, 0.30, 0.16), [0.76, 0.22, 0.18], mat(0, 2.25, 0.12)],
  ]);

  // Jagged stratified grey/ochre 3D rock escarpment outcrop along cliff lines with talus boulders & alpine scrub
  {
    const cr = [
      // Stratified sedimentary cliff ledges & tilted rock crags
      [box(9.6, 2.4, 3.8), [0.50, 0.48, 0.44], mat(0, 1.2, 0, 0.08, 0, -0.05)],
      [box(9.2, 2.2, 3.4), [0.56, 0.53, 0.48], mat(0.2, 3.1, -0.1, -0.05, 0.06, 0.04)],
      [box(7.8, 2.4, 2.9), [0.62, 0.58, 0.52], mat(-0.6, 4.8, -0.25, -0.06, 0.12, 0.06)],
      [box(5.6, 2.4, 2.3), [0.46, 0.44, 0.41], mat(1.2, 6.2, 0.15, 0.05, -0.15, -0.08)],
      // Angular rock spires & fractured prism crags
      [cone(3.4, 4.2, 7), [0.56, 0.53, 0.48], mat(-2.0, 5.6, 0.35, 0.08, 0.4, 0.05)],
      [cone(2.8, 3.6, 6), [0.48, 0.46, 0.42], mat(2.6, 4.8, -0.25, -0.06, -0.3, -0.08)],
      [cyl(2.2, 2.8, 4.6, 7), [0.54, 0.51, 0.46], mat(-3.2, 2.6, 0.4, 0.10, 0.25, -0.12)],
      [cyl(1.9, 2.5, 4.2, 6), [0.58, 0.55, 0.49], mat(3.4, 2.4, -0.3, -0.08, -0.35, 0.10)],
      // Talus boulders at cliff base + moss/scrub patches on ledges
      [sphere(1.4, 8, 6), [0.44, 0.42, 0.39], mat(-3.6, 0.8, 1.6, 0, 0, 0, 1.3, 0.75, 1.0)],
      [sphere(1.2, 8, 6), [0.52, 0.49, 0.44], mat(1.8, 0.7, 1.7, 0, 0, 0, 1.2, 0.70, 0.95)],
      [sphere(1.1, 8, 6), [0.24, 0.40, 0.22], mat(-0.8, 6.0, -0.2, 0, 0, 0, 1.8, 0.35, 1.1)],
      [sphere(0.95, 8, 6), [0.26, 0.42, 0.24], mat(1.4, 7.3, 0.15, 0, 0, 0, 1.6, 0.35, 1.0)],
    ];
    G.cliffRock = mergeParts(cr);
  }

  // ---------------- Batch 6: Aviation Gates/Towers, Maritime Terminals, Industrial ----------------
  // Articulated corrugated passenger boarding bridge (aeroway=gate) with rotunda, telescoping ribs, HVAC pod, service stair & accordion canopy
  {
    const jb = [
      // Terminal gate rotunda column + domed roof cap
      [cyl(1.35, 1.45, 3.2, 16), [0.68, 0.70, 0.73], mat(0, 1.6, -6.5)],
      [cyl(2.15, 2.15, 2.8, 20), [0.82, 0.84, 0.86], mat(0, 4.4, -6.5)],
      [cyl(2.25, 2.25, 0.22, 20), [0.58, 0.60, 0.64], mat(0, 5.85, -6.5)],
      // Telescoping outer & inner tunnel sections + tinted observation windows
      [box(2.58, 2.72, 7.2), [0.86, 0.88, 0.90], mat(0, 4.4, -2.4)],
      [box(2.42, 2.54, 6.8), [0.82, 0.84, 0.87], mat(0, 4.38, 4.0)],
      [box(2.64, 1.02, 6.2), [0.22, 0.36, 0.50], mat(0, 4.55, -2.4)],
      [box(2.48, 0.96, 5.8), [0.22, 0.36, 0.50], mat(0, 4.52, 4.0)],
      // Under-slung pre-conditioned air (PCA) unit & hose reel
      [box(1.35, 0.68, 1.85), [0.76, 0.78, 0.81], mat(0, 2.72, 1.2)],
      [torus(0.32, 0.08, 8, 14), [0.92, 0.76, 0.14], mat(0.75, 2.72, 1.2, 0, Math.PI / 2, 0)],
      // Twin hydraulic elevation columns + bogie beam + dual steerable rubber tires
      [cyl(0.24, 0.26, 4.2, 14), [0.52, 0.55, 0.58], mat(-1.12, 2.1, 4.8)],
      [cyl(0.24, 0.26, 4.2, 14), [0.52, 0.55, 0.58], mat(1.12, 2.1, 4.8)],
      [cyl(0.16, 0.16, 2.2, 12), [0.78, 0.80, 0.84], mat(-1.12, 3.2, 4.8)],
      [cyl(0.16, 0.16, 2.2, 12), [0.78, 0.80, 0.84], mat(1.12, 3.2, 4.8)],
      [box(2.85, 0.38, 1.05), [0.20, 0.22, 0.24], mat(0, 0.32, 4.8)],
      [cyl(0.48, 0.48, 0.26, 16), [0.14, 0.15, 0.16], mat(-1.35, 0.48, 4.8, 0, 0, Math.PI / 2)],
      [cyl(0.48, 0.48, 0.26, 16), [0.14, 0.15, 0.16], mat(-0.92, 0.48, 4.8, 0, 0, Math.PI / 2)],
      [cyl(0.48, 0.48, 0.26, 16), [0.14, 0.15, 0.16], mat(0.92, 0.48, 4.8, 0, 0, Math.PI / 2)],
      [cyl(0.48, 0.48, 0.26, 16), [0.14, 0.15, 0.16], mat(1.35, 0.48, 4.8, 0, 0, Math.PI / 2)],
      // Side apron crew access stair & yellow safety handrail
      [box(0.65, 0.18, 4.2), [0.46, 0.48, 0.52], mat(1.58, 2.2, 3.2, 0.68, 0, 0)],
      [box(0.06, 0.06, 4.3), [0.92, 0.76, 0.14], mat(1.88, 2.95, 3.2, 0.68, 0, 0)],
      // Swivel cab & ribbed accordion aircraft fuselage bumper hood
      [box(2.68, 2.75, 0.75), [0.80, 0.82, 0.85], mat(0, 4.4, 7.1)],
      [box(2.80, 2.88, 0.42), [0.18, 0.20, 0.22], mat(0, 4.4, 7.62)],
      [box(2.90, 2.96, 0.38), [0.12, 0.13, 0.15], mat(0, 4.4, 8.00)],
      [box(2.55, 0.26, 0.42), [0.92, 0.76, 0.14], mat(0, 3.00, 8.02)],
    ];
    for (let rz = -5.4; rz <= 6.2; rz += 1.45) {
      jb.push([box(2.66, 2.78, 0.12), [0.72, 0.74, 0.78], mat(0, 4.4, rz)]);
    }
    G.jetbridge = mergeParts(jb);
  }

  // Tall 38m white flared Airport Control Tower (ATC) with 360-deg angled blue-glass cab & rooftop radar bar
  G.atcTower = mergeParts([
    [box(10.5, 4.8, 10.5), [0.84, 0.85, 0.87], mat(0, 2.4, 0)],
    [cyl(2.3, 3.4, 24.5, 24), [0.92, 0.93, 0.95], mat(0, 16.8, 0)],
    [cyl(4.4, 2.4, 3.2, 24), [0.88, 0.90, 0.92], mat(0, 30.2, 0)],
    [torus(4.55, 0.18, 10, 28), [0.52, 0.55, 0.58], mat(0, 31.6, 0, Math.PI / 2, 0, 0)],
    [cyl(4.8, 4.3, 3.6, 24), [0.18, 0.38, 0.58], mat(0, 33.4, 0)],
    [cyl(5.1, 4.8, 0.85, 24), [0.94, 0.95, 0.97], mat(0, 35.5, 0)],
    [cyl(0.35, 0.45, 2.2, 16), [0.75, 0.78, 0.80], mat(0, 36.8, 0)],
    [box(3.8, 0.42, 0.55), [0.92, 0.22, 0.16], mat(0, 37.9, 0)],
  ]);

  // Blue-and-white maritime passenger waiting pavilion + vaulted roof trusses, benches, lifebuoys, bollards & boarding gangway arch
  {
    const fc = [
      // Concrete pier deck + yellow safety edge + cast-iron mooring bollards
      [box(9.8, 0.36, 6.0), [0.72, 0.74, 0.76], mat(0, 0.18, 0)],
      [box(9.8, 0.06, 0.25), [0.94, 0.78, 0.14], mat(0, 0.37, 2.85)],
      [cyl(0.18, 0.22, 0.55, 10), [0.18, 0.20, 0.22], mat(-4.2, 0.62, 2.65)],
      [cyl(0.18, 0.22, 0.55, 10), [0.18, 0.20, 0.22], mat(4.2, 0.62, 2.65)],
      // 6 Support columns + glazed windbreak screens + twin passenger waiting benches
      [cyl(0.20, 0.22, 3.8, 12), [0.88, 0.90, 0.92], mat(-3.8, 1.9, -2.0)],
      [cyl(0.20, 0.22, 3.8, 12), [0.88, 0.90, 0.92], mat(0, 1.9, -2.0)],
      [cyl(0.20, 0.22, 3.8, 12), [0.88, 0.90, 0.92], mat(3.8, 1.9, -2.0)],
      [cyl(0.20, 0.22, 3.8, 12), [0.88, 0.90, 0.92], mat(-3.8, 1.9, 2.0)],
      [cyl(0.20, 0.22, 3.8, 12), [0.88, 0.90, 0.92], mat(3.8, 1.9, 2.0)],
      [box(7.2, 2.1, 0.08), [0.56, 0.76, 0.88], mat(0, 1.45, -2.0)],
      [box(2.8, 0.12, 0.55), [0.66, 0.44, 0.24], mat(-1.9, 0.62, -1.1)],
      [box(2.8, 0.12, 0.55), [0.66, 0.44, 0.24], mat(1.9, 0.62, -1.1)],
      // Tiered pavilion roof + vaulted barrel crest + orange rescue lifebuoy rings
      [box(10.4, 0.42, 6.6), [0.95, 0.97, 0.99], mat(0, 3.95, 0)],
      [box(10.6, 0.30, 6.8), [0.12, 0.44, 0.82], mat(0, 4.28, 0)],
      [cyl(1.8, 1.8, 10.2, 14), [0.96, 0.98, 1.0], mat(0, 4.35, 0, 0, 0, Math.PI / 2, 1, 0.45, 1)],
      [torus(0.32, 0.08, 8, 14), [0.96, 0.36, 0.12], mat(-3.8, 1.65, 2.24)],
      [torus(0.32, 0.08, 8, 14), [0.96, 0.36, 0.12], mat(3.8, 1.65, 2.24)],
      // Covered boarding gangway arch + side handrails
      [box(3.2, 0.22, 4.4), [0.46, 0.48, 0.52], mat(0, 0.35, 4.4)],
      [box(3.2, 2.4, 4.2), [0.16, 0.52, 0.88], mat(0, 1.55, 4.4)],
      [cyl(1.6, 1.6, 4.2, 12), [0.95, 0.97, 0.99], mat(0, 2.75, 4.4, Math.PI / 2, 0, 0, 1, 1, 0.45)],
    ];
    G.ferryCanopy = mergeParts(fc);
  }

  // Timber floating finger-dock T-pontoon with guide pilings, mooring cleats, utility pedestals & twin moored sailing yachts
  {
    const mp = [
      // Main timber walkway + cross T-head + dark flotation pontoons + steel guide pilings + blue power pedestals
      [box(2.4, 0.28, 14.0), [0.62, 0.45, 0.28], mat(0, 0.28, 0)],
      [box(2.2, 0.22, 13.8), [0.18, 0.20, 0.22], mat(0, 0.08, 0)],
      [box(9.2, 0.28, 2.2), [0.62, 0.45, 0.28], mat(0, 0.28, 5.8)],
      [box(9.0, 0.22, 2.0), [0.18, 0.20, 0.22], mat(0, 0.08, 5.8)],
      [cyl(0.16, 0.16, 2.2, 10), [0.28, 0.30, 0.34], mat(-1.35, 0.95, -5.5)],
      [cyl(0.16, 0.16, 2.2, 10), [0.28, 0.30, 0.34], mat(1.35, 0.95, -5.5)],
      [cyl(0.16, 0.16, 2.2, 10), [0.28, 0.30, 0.34], mat(-4.2, 0.95, 6.8)],
      [cyl(0.16, 0.16, 2.2, 10), [0.28, 0.30, 0.34], mat(4.2, 0.95, 6.8)],
      [box(0.28, 0.78, 0.28), [0.94, 0.96, 0.98], mat(-0.95, 0.72, 1.5)],
      [box(0.28, 0.78, 0.28), [0.94, 0.96, 0.98], mat(0.95, 0.72, 1.5)],
      [dome(0.15, 10, 6), [0.14, 0.48, 0.88], mat(-0.95, 1.11, 1.5)],
      [dome(0.15, 10, 6), [0.14, 0.48, 0.88], mat(0.95, 1.11, 1.5)],
    ];
    // 2 Moored white sailing yachts with tapered bows, cabins, cockpits, masts, booms & furled sails
    for (const [yx, trimCol] of [[-2.9, [0.18, 0.44, 0.82]], [2.9, [0.84, 0.20, 0.16]]]) {
      mp.push(
        [box(2.3, 0.92, 5.4), [0.95, 0.96, 0.98], mat(yx, 0.45, -1.2)],
        [cone(1.62, 2.4, 4), [0.95, 0.96, 0.98], mat(yx, 0.45, 2.6, Math.PI / 2, Math.PI / 4, 0, 1.0, 1.0, 0.58)],
        [box(2.34, 0.14, 5.5), trimCol, mat(yx, 0.68, -1.2)],
        [box(1.75, 0.52, 2.8), [0.92, 0.94, 0.96], mat(yx, 1.06, -0.6)],
        [box(1.65, 0.32, 2.2), [0.20, 0.32, 0.46], mat(yx, 1.08, -0.5)],
        [box(1.55, 0.25, 1.8), [0.58, 0.40, 0.24], mat(yx, 0.85, -2.8)],
        [cyl(0.06, 0.08, 9.4, 10), [0.88, 0.90, 0.94], mat(yx, 5.2, 0.2)],
        [cyl(0.045, 0.05, 3.6, 8), [0.88, 0.90, 0.94], mat(yx, 2.1, -1.6, Math.PI / 2, 0, 0)],
        [box(1.4, 0.04, 0.04), [0.85, 0.87, 0.90], mat(yx, 6.2, 0.2)],
      );
    }
    G.marinaPontoon = mergeParts(mp);
  }

  // Twin cylindrical petrochemical storage tanks / grain silos with bund wall, stiffening rings, safety cage ladder, manifold & truss catwalk
  {
    const si = [
      // Concrete pad + perimeter spill containment bund wall
      [box(12.6, 0.35, 6.8), [0.56, 0.58, 0.60], mat(0, 0.175, 0)],
      [box(12.6, 0.55, 0.26), [0.62, 0.64, 0.66], mat(0, 0.45, 3.27)],
      [box(12.6, 0.55, 0.26), [0.62, 0.64, 0.66], mat(0, 0.45, -3.27)],
      [box(0.26, 0.55, 6.3), [0.62, 0.64, 0.66], mat(-6.17, 0.45, 0)],
      [box(0.26, 0.55, 6.3), [0.62, 0.64, 0.66], mat(6.17, 0.45, 0)],
    ];
    for (const sx of [-3.1, 3.1]) {
      si.push(
        // Concrete ring plinth + cylindrical tank shell + conical roof + pressure breather vent
        [cyl(2.72, 2.78, 0.45, 24), [0.50, 0.52, 0.54], mat(sx, 0.42, 0)],
        [cyl(2.6, 2.6, 9.0, 24), [0.88, 0.90, 0.92], mat(sx, 5.0, 0)],
        [cone(2.68, 1.25, 24), [0.76, 0.79, 0.82], mat(sx, 10.1, 0)],
        [cyl(0.24, 0.24, 0.55, 12), [0.46, 0.48, 0.52], mat(sx, 10.85, 0)],
        [cyl(0.36, 0.24, 0.18, 12), [0.82, 0.22, 0.18], mat(sx, 11.18, 0)],
      );
      // Horizontal wind-girder stiffening rings
      for (const ry of [2.4, 4.8, 7.2, 9.35]) {
        si.push([torus(2.62, 0.055, 8, 24), [0.72, 0.75, 0.78], mat(sx, ry, 0, Math.PI / 2, 0, 0)]);
      }
    }
    // Vertical caged safety ladder + pneumatic conveyor standpipe + lower valve manifold
    si.push(
      [box(0.34, 9.0, 0.18), [0.44, 0.46, 0.50], mat(-3.1, 5.0, 2.68)],
      [cyl(0.14, 0.14, 9.4, 10), [0.64, 0.67, 0.70], mat(3.1, 5.1, 2.74)],
      [cyl(0.18, 0.18, 6.2, 12), [0.78, 0.20, 0.18], mat(0, 1.35, 2.75, 0, 0, Math.PI / 2)],
      [torus(0.28, 0.05, 8, 14), [0.88, 0.72, 0.14], mat(0, 1.35, 2.95)],
      // Overhead interconnecting catwalk bridge + yellow OSHA handrails
      [box(6.6, 0.28, 0.92), [0.40, 0.43, 0.46], mat(0, 9.55, 0)],
      [box(6.6, 0.08, 0.08), [0.86, 0.70, 0.16], mat(0, 10.22, 0.42)],
      [box(6.6, 0.08, 0.08), [0.86, 0.70, 0.16], mat(0, 10.22, -0.42)],
      [box(6.6, 0.06, 0.06), [0.86, 0.70, 0.16], mat(0, 9.88, 0.42)],
      [box(6.6, 0.06, 0.06), [0.86, 0.70, 0.16], mat(0, 9.88, -0.42)],
    );
    for (const cy of [3.2, 4.8, 6.4, 8.0]) {
      si.push([torus(0.36, 0.035, 8, 14), [0.78, 0.64, 0.14], mat(-3.1, cy, 2.86, Math.PI / 2, 0, 0)]);
    }
    G.industrialSilo = mergeParts(si);
  }

  // Tall 36m yellow lattice Tower Crane with 4-chord mast, diagonal lacing, slewing cab, counter-jib ballast blocks, trolley & hook block
  {
    const tc = [
      // Concrete foundation pad + cruciform steel base ballast
      [box(4.4, 0.85, 4.4), [0.52, 0.54, 0.56], mat(0, 0.425, 0)],
      [box(3.4, 0.45, 1.2), [0.36, 0.38, 0.40], mat(0, 0.95, 0)],
      [box(1.2, 0.45, 3.4), [0.36, 0.38, 0.40], mat(0, 0.95, 0)],
      // 4 Vertical corner mast chords + central climbing ladder
      [box(0.22, 31.5, 0.22), [0.94, 0.74, 0.10], mat(-0.72, 16.4, -0.72)],
      [box(0.22, 31.5, 0.22), [0.94, 0.74, 0.10], mat(0.72, 16.4, -0.72)],
      [box(0.22, 31.5, 0.22), [0.94, 0.74, 0.10], mat(-0.72, 16.4, 0.72)],
      [box(0.22, 31.5, 0.22), [0.94, 0.74, 0.10], mat(0.72, 16.4, 0.72)],
      [box(0.45, 31.0, 0.08), [0.32, 0.34, 0.36], mat(0, 16.4, 0)],
      // Slewing ring turntable + operator cabin with blue tinted glass
      [cyl(1.15, 1.15, 0.65, 16), [0.28, 0.30, 0.34], mat(0, 30.8, 0)],
      [box(1.9, 2.2, 2.4), [0.94, 0.74, 0.10], mat(0.95, 31.6, 0.8)],
      [box(1.96, 1.2, 1.8), [0.16, 0.24, 0.32], mat(0.95, 31.8, 1.0)],
      // Main horizontal jib chords + counter-jib + 4 concrete counterweight slabs + apex A-frame + forestay/backstay pendants
      [box(1.45, 0.22, 20.5), [0.94, 0.74, 0.10], mat(0, 32.3, 9.8)],
      [box(0.24, 0.24, 20.5), [0.94, 0.74, 0.10], mat(0, 33.6, 9.8)],
      [box(1.45, 0.35, 9.2), [0.94, 0.74, 0.10], mat(0, 32.3, -4.8)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(-0.42, 32.8, -6.2)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(0.42, 32.8, -6.2)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(-0.42, 32.8, -7.2)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(0.42, 32.8, -7.2)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(-0.42, 32.8, -8.2)],
      [box(0.52, 2.1, 0.75), [0.60, 0.62, 0.64], mat(0.42, 32.8, -8.2)],
      [cone(0.95, 4.4, 4), [0.94, 0.74, 0.10], mat(0, 35.6, 0, 0, Math.PI / 4, 0)],
      [cyl(0.05, 0.05, 14.5, 8), [0.28, 0.30, 0.34], mat(0, 35.4, 6.8, 1.32, 0, 0)],
      [cyl(0.05, 0.05, 9.2, 8), [0.28, 0.30, 0.34], mat(0, 35.2, -4.2, -1.18, 0, 0)],
      // Travelling trolley carriage + twin hoist wire ropes + yellow/black sheave pulley block & hook
      [box(1.55, 0.55, 1.75), [0.22, 0.24, 0.28], mat(0, 31.9, 13.5)],
      [cyl(0.04, 0.04, 12.0, 8), [0.20, 0.22, 0.24], mat(-0.18, 25.8, 13.5)],
      [cyl(0.04, 0.04, 12.0, 8), [0.20, 0.22, 0.24], mat(0.18, 25.8, 13.5)],
      [box(0.72, 0.92, 0.48), [0.94, 0.68, 0.10], mat(0, 19.6, 13.5)],
      [cyl(0.32, 0.32, 0.52, 12), [0.18, 0.20, 0.22], mat(0, 19.8, 13.5, 0, 0, Math.PI / 2)],
      [torus(0.26, 0.06, 8, 12, Math.PI * 1.35), [0.22, 0.24, 0.26], mat(0, 18.9, 13.5, 0, 0, -Math.PI * 0.65)],
    ];
    for (let my = 3.0; my <= 29.0; my += 2.6) {
      tc.push(
        [box(1.62, 0.16, 1.62), [0.94, 0.74, 0.10], mat(0, my, 0)],
        [box(1.95, 0.12, 0.12), [0.88, 0.68, 0.08], mat(0, my + 1.3, 0.72, 0, 0, 0.72)],
        [box(0.12, 0.12, 1.95), [0.88, 0.68, 0.08], mat(0.72, my + 1.3, 0, -0.72, 0, 0)],
      );
    }
    for (let jz = 1.5; jz <= 18.5; jz += 2.4) {
      tc.push([box(1.35, 1.25, 0.14), [0.90, 0.70, 0.08], mat(0, 32.95, jz)]);
    }
    G.towerCrane = mergeParts(tc);
  }

  // White geodesic radome sphere on concrete pedestal inside military zones
  G.radarDome = mergeParts([
    [cyl(3.4, 3.8, 3.2, 24), [0.68, 0.70, 0.68], mat(0, 1.6, 0)],
    [box(1.1, 2.1, 0.35), [0.32, 0.35, 0.38], mat(0, 1.05, 3.55)],
    [cyl(3.85, 3.65, 0.45, 24), [0.86, 0.24, 0.18], mat(0, 3.3, 0)],
    [sphere(4.25, 24, 16), [0.95, 0.97, 0.99], mat(0, 6.8, 0)],
    [cyl(0.06, 0.08, 1.4, 12), [0.75, 0.78, 0.82], mat(0, 11.4, 0)],
  ]);

  return G;
}

// kind -> [capacity, cull radius (m), material key, castShadow]
const KINDS = {
  hvac: [8000, 800, 'std', false],
  vent: [6000, 600, 'std', false],
  tank: [1500, 900, 'std', true],
  mast: [800, 1800, 'std', false],
  solar: [2000, 700, 'std', false],
  garden: [300, 800, 'std', false],
  awning: [3000, 420, 'double', false],
  sign: [3000, 420, 'sign', false],
  transit: [600, 600, 'std', false],
  helipad: [160, 2400, 'std', false],
  gasStation: [160, 950, 'std', true],
  evCharger: [200, 850, 'std', false],
  bikeDock: [450, 650, 'std', false],
  tollBooth: [80, 1400, 'std', true],
  hospitalCross: [240, 1400, 'sign', false],
  worshipSpire: [240, 1200, 'std', true],
  worshipTorii: [240, 1100, 'std', true],
  plane: [160, 3000, 'std', true],
  planeTail: [160, 3000, 'std', true],
  ship: [80, 3000, 'std', true],
  // Batch 1: Civic, Emergency, Postal, Healthcare & Education
  policeCruiser: [320, 750, 'std', true],
  policeBeacon: [320, 700, 'sign', false],
  fireTruck: [240, 850, 'std', true],
  fireDoor: [240, 800, 'std', false],
  postBox: [1200, 500, 'std', false],
  parcelLocker: [400, 550, 'std', false],
  clinicCross: [900, 700, 'sign', false],
  flagpole: [900, 950, 'std', true],
  watchtower: [120, 1400, 'std', true],
  // Batch 4: Street Furniture, Micro-Mobility, Barriers, Sanitation & Wayfinding
  bikeRack: [1800, 480, 'std', false],
  motoBay: [800, 500, 'std', false],
  realBusStop: [1400, 650, 'std', true],
  liftGate: [1200, 520, 'std', false],
  cycleBarrier: [600, 450, 'std', false],
  recyclingBank: [1400, 480, 'std', false],
  toiletKiosk: [800, 600, 'std', true],
  waterFountain: [900, 450, 'std', false],
  phoneBooth: [700, 520, 'std', false],
  streetAtm: [700, 520, 'sign', false],
  infoBoard: [900, 550, 'std', false],
  guidepost: [900, 500, 'std', false],
  // Batch 5: Religion Archetypes, Monuments, Public Art, Castles, Viewpoints & Cliffs
  worshipMosque: [240, 1200, 'std', true],
  worshipPagoda: [240, 1200, 'std', true],
  worshipSynagogue: [200, 1100, 'std', true],
  worshipHindu: [200, 1100, 'std', true],
  artworkSculpture: [800, 650, 'std', true],
  monumentObelisk: [320, 1100, 'std', true],
  castleKeep: [160, 1600, 'std', true],
  viewpointDeck: [400, 900, 'std', true],
  summitCairn: [320, 1500, 'std', true],
  cliffRock: [1200, 1400, 'std', true],
  // Batch 6: Aviation Gates/Towers, Maritime Terminals, Industrial
  jetbridge: [320, 1800, 'std', true],
  atcTower: [80, 3000, 'std', true],
  ferryCanopy: [240, 1300, 'std', true],
  marinaPontoon: [320, 1300, 'std', true],
  industrialSilo: [400, 1400, 'std', true],
  towerCrane: [200, 2200, 'std', true],
  radarDome: [160, 1800, 'std', true],
};

const LABEL_MAX = 14;
const LABEL_FAR = 110;
const LABEL_NEAR = 72;
const LABEL_GEO_FAR = 1350;
const LABEL_GEO_NEAR = 920;
const LABEL_CLOSE = 9; // [ui-mobile] local labels fade out inside this distance (m)

// [ui-mobile] Label height in CSS pixels: larger when near, within a fixed range, and never wider than ~40%
// of a phone-sized viewport.
function labelPx(isGeo, d, aspect) {
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1400;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 850;
  const k = Math.min(1, Math.max(0.72, Math.min(vw, vh) / 800)); // phones: a little smaller
  let px = isGeo ? Math.max(17, Math.min(26, 27 - d * 0.004)) : Math.max(14, Math.min(22, 24 - d * 0.09));
  px *= k;
  return Math.min(px, (vw * 0.4) / Math.max(1, aspect));
}

export class PlacesSystem {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'places';
    scene.add(this.root);
    this.geoms = buildUnitGeometries();
    this.mats = {
      std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 }),
      double: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
      sign: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, emissive: 0xfff1d8, emissiveIntensity: 0.18 }),
    };
    this.pools = {};
    for (const [kind, [cap, , mk, cast]] of Object.entries(KINDS)) {
      this.pools[kind] = this._makePool(kind, cap, this.mats[mk], cast);
    }
    this.trainPool = this._makePool('trainCar', 48, this.mats.std, true);
    this.trainPool.frustumCulled = false;

    // Aviation beacons: screen-space points so they read at distance; only shown at night
    this.beaconGeom = new THREE.BufferGeometry();
    this.beaconGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 4000), 3));
    this.beaconGeom.setDrawRange(0, 0);
    this.beacons = new THREE.Points(
      this.beaconGeom,
      new THREE.PointsMaterial({ color: 0xff2a1a, size: 5, sizeAttenuation: false, fog: false })
    );
    this.beacons.frustumCulled = false;
    this.beacons.visible = false;
    this.root.add(this.beacons);
    this.beaconOn = new THREE.Color(0xff2a1a);
    this.beaconOff = new THREE.Color(0x3a0b07);

    this.trackedGroups = new Set();
    this.lastX = Infinity;
    this.lastZ = Infinity;
    this.trains = [];
    this.time = 0;
    this.labelTimer = 0;
    this.labelSprites = [];
    this.labelTex = new Map();
    for (let i = 0; i < LABEL_MAX; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0, fog: false }));
      sp.visible = false;
      sp.renderOrder = 10;
      sp.userData = { key: '', target: 0, opacity: 0, kind: 0 };
      this.root.add(sp);
      this.labelSprites.push(sp);
    }
    this.lastNight = null;
    this.currentDistrict = '';
    this.currentDistrictSub = '';
    this.currentPeak = '';
    this._hudMicrotaskPending = false;
    this._runwayPlanes = [];
    this._skyPlanes = [];
    this._planes = [];
    this.hiddenPlanes = new Set();
    this._initSkyPlanes({ x: 0, y: 0, z: 0 });
  }

  hidePlaneAt(x, z) {
    const key = `${Math.round(x)}_${Math.round(z)}`;
    this.hiddenPlanes.add(key);
    if (Number.isFinite(this.lastX) && Number.isFinite(this.lastZ)) {
      this._rebuild(this.lastX, this.lastZ);
    }
  }

  buildPlaneModel(tailHex = 0x003a70, scale = 1.0) {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const bodyMesh = new THREE.Mesh(this.geoms.plane, this.mats.std);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    const tailMat = new THREE.MeshStandardMaterial({
      color: tailHex,
      roughness: 0.55,
      metalness: 0.18,
    });
    const tailMesh = new THREE.Mesh(this.geoms.planeTail, tailMat);
    tailMesh.castShadow = true;
    const navPort = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a })
    );
    navPort.position.set(21.6, 3.85, -3.5);
    const navStarboard = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x18e65a })
    );
    navStarboard.position.set(-21.6, 3.85, -3.5);
    const strobeTail = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    strobeTail.position.set(0, 10.75, -19.2);
    group.add(bodyMesh, tailMesh, navPort, navStarboard, strobeTail);
    group.scale.setScalar(scale);
    return group;
  }

  _makePool(kind, cap, material, cast) {
    const mesh = new THREE.InstancedMesh(this.geoms[kind], material, cap);
    mesh.name = `places_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Total instances currently drawn (debug/perf). */
  stats() {
    const out = { drawCallsMax: 0 };
    for (const [k, m] of Object.entries(this.pools)) {
      out[k] = m.count;
      if (m.count > 0) out.drawCallsMax++;
    }
    out.trainCars = this.trainPool.count;
    out.beacons = this.beaconGeom.drawRange.count;
    out.labels = this.labelSprites.filter((s) => s.visible).length;
    out.skyPlanes = this._skyPlanes.length;
    out.runwayPlanes = this._runwayPlanes.length;
    out.currentDistrict = this.currentDistrict;
    out.currentPeak = this.currentPeak;
    return out;
  }

  update(dt, camera, playerPos, loadedChunks) {
    this.time += dt;
    let dirty = loadedChunks.size !== this.trackedGroups.size;
    if (!dirty) {
      for (const g of loadedChunks.values()) {
        if (!this.trackedGroups.has(g)) { dirty = true; break; }
      }
    }
    const camPos = camera.position;
    this._cam = camera; // [ui-mobile] labels are sized and decluttered in screen space
    const px = camPos.x, pz = camPos.z;
    if (dirty) {
      this.trackedGroups = new Set(loadedChunks.values());
      this._refreshTrains(playerPos);
      this._refreshRunwayPlanes(playerPos);
      this._updateCurrentDistrict(playerPos);
    }
    if (dirty || Math.hypot(px - this.lastX, pz - this.lastZ) > 40) {
      this.lastX = px;
      this.lastZ = pz;
      this._rebuild(px, pz);
    }
    this._updateTrains(dt);
    this._updateRunwayPlanes(dt);
    this._updateSkyPlanes(dt, playerPos || camPos);
    this._updateNight();
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      this._updateCurrentDistrict(playerPos);
      this._pickLabels(camPos);
    }
    this._fadeLabels(dt, camPos);
    if (!this._hudMicrotaskPending && (this.currentDistrict || this.currentPeak)) {
      this._hudMicrotaskPending = true;
      queueMicrotask(() => {
        this._hudMicrotaskPending = false;
        this._applyDistrictHud();
      });
    }
  }

  _updateCurrentDistrict(playerPos) {
    if (!playerPos) return;
    const zh = getLang() === 'zh';
    let bestPlace = null;
    let bestScore = Infinity;
    let bestPeak = null;
    let bestPeakDist = 420;

    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.geo) continue;
      for (const item of pl.geo) {
        const [wx, , wz, kind, sub, nameZh, nameEn] = item;
        const d = Math.hypot(wx - playerPos.x, wz - playerPos.z);
        if (kind === 'place' && sub !== 'city' && sub !== 'country' && sub !== 'state') {
          if (d > 1900) continue;
          const penalty = sub === 'neighbourhood' ? 0 : sub === 'quarter' ? 35 : sub === 'suburb' ? 120 : 250;
          const score = d + penalty;
          if (score < bestScore) {
            bestScore = score;
            bestPlace = { sub, name: zh ? (nameZh || nameEn) : (nameEn || nameZh), d };
          }
        } else if (kind === 'peak' && d < bestPeakDist) {
          bestPeakDist = d;
          bestPeak = zh ? (nameZh || nameEn) : (nameEn || nameZh);
        }
      }
    }
    this.currentDistrict = bestPlace ? bestPlace.name : '';
    this.currentDistrictSub = bestPlace ? bestPlace.sub : '';
    this.currentPeak = bestPeak || '';
  }

  _applyDistrictHud() {
    if (typeof document === 'undefined') return;
    const district = this.currentDistrict;
    if (!district) return;

    const pillEl = document.getElementById('location-pill-text') || document.getElementById('location-label');
    if (pillEl && pillEl.textContent) {
      const cur = pillEl.textContent;
      if (!cur.includes(district)) {
        const parts = cur.split(' · ');
        if (parts.length >= 2) {
          pillEl.textContent = `${parts.slice(0, -1).join(' · ')} · ${district} · ${parts[parts.length - 1]}`; // [road-names-zh] road labels may contain ' · '
        } else {
          pillEl.textContent = `${district} · ${cur}`;
        }
      }
    }

    const cityEl = document.getElementById('radar-city');
    if (cityEl && cityEl.textContent && !cityEl.textContent.includes(district)) {
      cityEl.textContent = `${district} · ${cityEl.textContent}`;
    }
  }

  _rebuild(px, pz) {
    const counts = {};
    for (const k of Object.keys(this.pools)) counts[k] = 0;
    this._planes = [];
    let nBeacon = 0;
    const bArr = this.beaconGeom.attributes.position.array;
    const bCap = bArr.length / 3;
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl) continue;
      const { ox, oz } = g.userData;
      const cdx = Math.max(0, Math.abs(px - ox) - 500);
      const cdz = Math.max(0, Math.abs(pz - oz) - 500);
      const chunkDist = Math.hypot(cdx, cdz);
      for (const kind in pl.inst) {
        const pool = this.pools[kind];
        if (!pool) continue;
        const r = KINDS[kind][1] * QUALITY.places; // [ui-mobile] tier scales rooftop / roadside detail distance
        if (chunkDist > r) continue;
        const r2 = r * r;
        const a = pl.inst[kind];
        const cap = KINDS[kind][0];
        const mArr = pool.instanceMatrix.array;
        const cArr = pool.instanceColor.array;
        let n = counts[kind];
        const isPlaneKind = kind === 'plane' || kind === 'planeTail';
        for (let i = 0; i < a.length && n < cap; i += STRIDE) {
          const dx = a[i] - px, dz = a[i + 2] - pz;
          if (dx * dx + dz * dz > r2) continue;
          if (isPlaneKind) {
            const pKey = `${Math.round(a[i])}_${Math.round(a[i + 2])}`;
            if (this.hiddenPlanes && this.hiddenPlanes.has(pKey)) continue;
            if (kind === 'plane') {
              this._planes.push({ x: a[i], y: a[i + 1], z: a[i + 2], yaw: a[i + 3], scale: a[i + 4], rgb: a[i + 7] | 0 });
            }
          }
          const c = Math.cos(a[i + 3]), s = Math.sin(a[i + 3]);
          const sx = a[i + 4], sy = a[i + 5], sz = a[i + 6];
          const o = n * 16;
          mArr[o] = c * sx; mArr[o + 1] = 0; mArr[o + 2] = -s * sx; mArr[o + 3] = 0;
          mArr[o + 4] = 0; mArr[o + 5] = sy; mArr[o + 6] = 0; mArr[o + 7] = 0;
          mArr[o + 8] = s * sz; mArr[o + 9] = 0; mArr[o + 10] = c * sz; mArr[o + 11] = 0;
          mArr[o + 12] = a[i]; mArr[o + 13] = a[i + 1]; mArr[o + 14] = a[i + 2]; mArr[o + 15] = 1;
          const rgb = a[i + 7] | 0;
          cArr[n * 3] = ((rgb >> 16) & 255) / 255;
          cArr[n * 3 + 1] = ((rgb >> 8) & 255) / 255;
          cArr[n * 3 + 2] = (rgb & 255) / 255;
          n++;
        }
        counts[kind] = n;
      }
      if (pl.beacons && chunkDist < 3000) {
        const b = pl.beacons;
        for (let i = 0; i < b.length && nBeacon < bCap; i += 3) {
          bArr[nBeacon * 3] = b[i];
          bArr[nBeacon * 3 + 1] = b[i + 1];
          bArr[nBeacon * 3 + 2] = b[i + 2];
          nBeacon++;
        }
      }
    }
    for (const [k, pool] of Object.entries(this.pools)) {
      pool.count = counts[k];
      pool.instanceMatrix.needsUpdate = true;
      pool.instanceColor.needsUpdate = true;
    }
    this.beaconGeom.setDrawRange(0, nBeacon);
    this.beaconGeom.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ trains
  _refreshTrains(playerPos) {
    const lines = new Map();
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.rails) continue;
      for (const arr of pl.rails) {
        const n = arr.length / 3;
        const key = `${Math.round(arr[0])},${Math.round(arr[2])},${Math.round(arr[(n - 1) * 3])},${Math.round(arr[(n - 1) * 3 + 2])}`;
        if (lines.has(key)) continue;
        let best = Infinity;
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(arr[i * 3] - playerPos.x, arr[i * 3 + 2] - playerPos.z);
          if (d < best) best = d;
        }
        lines.set(key, { key, arr, dist: best });
      }
    }
    const kept = this.trains.filter((t) => lines.has(t.key));
    const used = new Set(kept.map((t) => t.key));
    const cands = [...lines.values()].filter((l) => !used.has(l.key) && l.dist < 1500).sort((a, b) => a.dist - b.dist);
    for (const c of cands) {
      if (kept.length >= 3) break;
      const cum = [0];
      const arr = c.arr;
      for (let i = 1; i < arr.length / 3; i++) {
        cum.push(cum[i - 1] + Math.hypot(arr[i * 3] - arr[i * 3 - 3], arr[i * 3 + 2] - arr[i * 3 - 1]));
      }
      const L = cum[cum.length - 1];
      let h = 0;
      for (let i = 0; i < c.key.length; i++) h = (h * 31 + c.key.charCodeAt(i)) >>> 0;
      const cars = 4 + (h % 4);
      const trainLen = cars * 21;
      if (L < trainLen + 60) continue;
      kept.push({
        key: c.key, arr, cum, L, cars,
        s: trainLen + ((h >>> 3) % 1000) / 1000 * (L - trainLen),
        dir: h & 1 ? 1 : -1,
        speed: 14 + (h % 9),
        tint: [[1, 1, 1], [0.85, 0.92, 1.0], [1.0, 0.95, 0.85]][h % 3],
      });
    }
    this.trains = kept;
  }

  _sampleRail(t, s, outPos) {
    const { arr, cum } = t;
    s = Math.max(0, Math.min(t.L, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const segL = cum[hi] - cum[lo] || 1;
    const f = (s - cum[lo]) / segL;
    const ax = arr[lo * 3], ay = arr[lo * 3 + 1], az = arr[lo * 3 + 2];
    const bx = arr[hi * 3], by = arr[hi * 3 + 1], bz = arr[hi * 3 + 2];
    outPos.set(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
    return Math.atan2(bx - ax, bz - az);
  }

  _updateTrains(dt) {
    const pool = this.trainPool;
    let n = 0;
    for (const t of this.trains) {
      const trainLen = t.cars * 21;
      t.s += t.dir * t.speed * dt;
      if (t.dir > 0 && t.s >= t.L) { t.s = t.L - trainLen; t.dir = -1; }
      else if (t.dir < 0 && t.s <= 0) { t.s = trainLen; t.dir = 1; }
      for (let i = 0; i < t.cars && n < 48; i++) {
        const sc = t.s - t.dir * (i * 21 + 10.5);
        const yaw = this._sampleRail(t, sc, V);
        Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        S.set(1, 1, 1);
        M4.compose(V, Q, S);
        pool.setMatrixAt(n, M4);
        pool.instanceColor.setXYZ(n, t.tint[0], t.tint[1], t.tint[2]);
        n++;
      }
    }
    pool.count = n;
    pool.instanceMatrix.needsUpdate = true;
    if (pool.instanceColor) pool.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ animated airliners (runway takeoff/landing & ambient sky jets)
  // [live-sky-weather] One runway operation per airport at a time: a single airliner alternates
  // landing / takeoff with a randomized 60-120 s gap; nothing shows between operations. Live
  // traffic (live_sky.js) sets `rp.liveBusy` to suppress the loop where real planes use the field.
  _refreshRunwayPlanes(playerPos) {
    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;
    const byKey = new Map();
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.runways) continue;
      for (const rw of pl.runways) {
        if (!rw || rw.len < 140) continue;
        const mx = (rw.x0 + rw.x1) * 0.5;
        const mz = (rw.z0 + rw.z1) * 0.5;
        const dist = Math.hypot(mx - px, mz - pz);
        if (dist > 4500) continue;
        const headingBucket = Math.round(((rw.yaw * 180) / Math.PI + 360) % 180 / 5);
        const key = rw.ref ? `${rw.ref}:${Math.round(mx / 600)},${Math.round(mz / 600)}` : `${headingBucket}:${Math.round(mx / 250)},${Math.round(mz / 250)}`;
        const prev = byKey.get(key);
        if (!prev || rw.len > prev.rw.len) byKey.set(key, { key, rw, dist, mx, mz });
      }
    }

    // Cluster runways into airports (midpoints within 3.5 km), nearest 2 airports only
    const airports = [];
    for (const item of [...byKey.values()].sort((a, b) => b.rw.len - a.rw.len)) {
      let ap = airports.find((a) => Math.hypot(a.mx - item.mx, a.mz - item.mz) < 3500);
      if (!ap) {
        ap = { id: `ap:${Math.round(item.mx / 1000)},${Math.round(item.mz / 1000)}`, mx: item.mx, mz: item.mz, dist: item.dist, runways: [] };
        airports.push(ap);
      }
      ap.runways.push(item.rw);
      ap.dist = Math.min(ap.dist, item.dist);
    }
    airports.sort((a, b) => a.dist - b.dist);
    airports.length = Math.min(airports.length, 2);

    const kept = [];
    for (const rp of this._runwayPlanes) {
      const ap = airports.find((a) => a.id === rp.id || Math.hypot(a.mx - rp.mx, a.mz - rp.mz) < 3500);
      if (ap && !kept.includes(rp)) {
        rp.runways = ap.runways;
        if (!rp.op) rp.rw = ap.runways[0];
        ap.taken = true;
        kept.push(rp);
      } else {
        this.root.remove(rp.mesh);
      }
    }
    const liveries = [0x003a70, 0xc8102e, 0x0b6e4f, 0x00a3e0, 0xf2a900, 0x5c2d91];
    for (const ap of airports) {
      if (ap.taken) continue;
      const mesh = this.buildPlaneModel(liveries[(this._runwayOpCount || 0) % liveries.length], 1.1);
      mesh.visible = false;
      this.root.add(mesh);
      kept.push({
        id: ap.id, mx: ap.mx, mz: ap.mz, runways: ap.runways, rw: ap.runways[0],
        op: null, opT: 0, dir: 1, next: this.time + 10 + Math.random() * 30,
        phase: 'idle', nextKind: Math.random() < 0.5 ? 'landing' : 'takeoff',
        pitch: 0, roll: 0, speed: 0, liveBusy: false, mesh,
      });
    }
    this._runwayPlanes = kept;
    this._updateRunwayPlanes(0);
  }

  _updateRunwayPlanes(dt) {
    if (!this._runwayOpLog) this._runwayOpLog = [];
    const TAN3 = Math.tan(3 * Math.PI / 180);
    for (const rp of this._runwayPlanes) {
      if (!rp.op) {
        rp.mesh.visible = false;
        rp.phase = 'idle';
        if (this.time < rp.next) continue;
        if (rp.liveBusy || !rp.runways || !rp.runways.length) {
          rp.next = this.time + 60 + Math.random() * 60;
          continue;
        }
        // start one operation on one runway, random direction
        rp.rw = rp.runways[Math.floor(Math.random() * rp.runways.length)];
        rp.dir = Math.random() < 0.5 ? 1 : -1;
        rp.op = rp.nextKind;
        rp.nextKind = rp.op === 'landing' ? 'takeoff' : 'landing';
        rp.opT = 0;
        this._runwayOpCount = (this._runwayOpCount || 0) + 1;
        this._runwayOpLog.push({ t: Number(this.time.toFixed(1)), airport: rp.id, op: rp.op });
        if (this._runwayOpLog.length > 50) this._runwayOpLog.shift();
      }
      rp.opT += dt;
      const rw = rp.rw;
      const rLen = Math.max(420, rw.len);
      const yaw = rp.dir > 0 ? rw.yaw : rw.yaw + Math.PI;
      const sx = rp.dir > 0 ? rw.x0 : rw.x1;
      const sz = rp.dir > 0 ? rw.z0 : rw.z1;
      const ux = Math.sin(yaw), uz = Math.cos(yaw);
      const t = rp.opT;
      let distAlong = 0, alt = 0.35, pitch = 0, speed = 0, done = false;

      if (rp.op === 'landing') {
        // 3 deg final from 3 km at 72 m/s, flare, then roll out to taxi speed and clear the runway
        const Ta = 3000 / 72;
        const vEnd = 12, Tr = 30;
        const rollLen = Math.min(rLen * 0.8, (72 + vEnd) * 0.5 * Tr);
        if (t < Ta) {
          distAlong = -3000 + 72 * t;
          alt = Math.max(0.35, -distAlong * TAN3 + 0.35);
          pitch = 0.05 + (t > Ta - 4 ? 0.04 * (t - (Ta - 4)) / 4 : 0);
          speed = 72;
        } else if (t < Ta + Tr) {
          const u = (t - Ta) / Tr;
          distAlong = rollLen * (1 - (1 - u) * (1 - u));
          pitch = 0.09 * Math.max(0, 1 - u * 6);
          speed = 72 + (vEnd - 72) * u;
        } else {
          done = true;
        }
      } else {
        // takeoff roll to 80 m/s within ~70% of the runway, rotate, 7 deg climb to ~700 m
        const vR = 80;
        const acc = Math.max(1.8, (vR * vR) / (2 * rLen * 0.7));
        const Tg = vR / acc;
        const climbTan = Math.tan(7 * Math.PI / 180);
        if (t < Tg) {
          distAlong = 0.5 * acc * t * t;
          pitch = t > Tg - 3 ? 0.16 * (t - (Tg - 3)) / 3 : 0;
          speed = acc * t;
        } else {
          const tc = t - Tg;
          distAlong = 0.5 * acc * Tg * Tg + vR * tc;
          alt = 0.35 + vR * tc * climbTan;
          pitch = 0.16;
          speed = vR;
          if (alt > 700) done = true;
        }
      }
      if (done || rp.liveBusy) {
        rp.op = null;
        rp.mesh.visible = false;
        rp.next = this.time + 60 + Math.random() * 60;
        continue;
      }
      rp.phase = rp.op;
      rp.pitch = pitch;
      rp.roll = 0;
      rp.speed = speed;
      rp.mesh.visible = true;
      rp.mesh.position.set(sx + ux * distAlong, rw.y + alt, sz + uz * distAlong);
      rp.mesh.rotation.set(-pitch, yaw, 0, 'YXZ');
    }
  }

  _initSkyPlanes(centerPos) {
    const cx = centerPos ? centerPos.x : 0;
    const cz = centerPos ? centerPos.z : 0;
    const baseGround = centerPos && Number.isFinite(centerPos.y) ? Math.max(0, centerPos.y) : 0;
    // [live-sky-weather] 3 ambient jets, spread far apart (was 5)
    const specs = [
      { role: 'corridor_climb', radius: 700, angle: 0.4, yaw: 1.15, alt: 260, speed: 74, pitch: 0.10, roll: 0.0, yawRate: 0.0, scale: 1.15, livery: 0x003a70 },
      { role: 'cruise_1', radius: 1100, angle: 2.5, yaw: 0.55, alt: 330, speed: 82, pitch: 0.02, roll: 0.0, yawRate: 0.0, scale: 1.20, livery: 0x00a3e0 },
      { role: 'cruise_2', radius: 1300, angle: 4.6, yaw: -0.75, alt: 400, speed: 90, pitch: 0.02, roll: 0.0, yawRate: 0.0, scale: 1.35, livery: 0x0b6e4f },
    ];

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const mesh = this.buildPlaneModel(s.livery, s.scale);
      const x = cx + Math.cos(s.angle) * s.radius;
      const z = cz + Math.sin(s.angle) * s.radius;
      const y = baseGround + s.alt;
      mesh.position.set(x, y, z);
      mesh.rotation.set(-s.pitch, s.yaw, s.roll, 'YXZ');
      this.root.add(mesh);
      this._skyPlanes.push({
        index: i,
        role: s.role,
        x,
        y,
        z,
        alt: s.alt,
        yaw: s.yaw,
        pitch: s.pitch,
        roll: s.roll,
        yawRate: s.yawRate,
        speed: s.speed,
        mesh,
      });
    }
  }

  _respawnSkyPlane(sp, px, py, pz, idx) {
    const bear = ((idx * 2.09 + this.time * 0.23) % (Math.PI * 2)); // [live-sky-weather] ~120 deg apart
    const radius = 650 + (idx * 260) % 650; // 650m..1300m
    sp.x = px + Math.cos(bear) * radius;
    sp.z = pz + Math.sin(bear) * radius;
    // Point on an incoming chord across the sky near the player
    const crossOffset = ((idx % 2 === 0 ? 1 : -1) * 0.42);
    sp.yaw = Math.atan2(px - sp.x, pz - sp.z) + crossOffset;
    if (sp.role === 'corridor_climb') {
      sp.alt = 185;
      sp.pitch = 0.10;
    } else if (sp.role === 'corridor_descend') {
      sp.alt = 405;
      sp.pitch = -0.10;
    } else if (sp.role === 'banking') {
      sp.alt = 240;
      sp.pitch = 0.03;
      sp.roll = 0.22;
    } else {
      sp.alt = idx === 2 ? 275 : 375;
      sp.pitch = 0.02;
    }
    sp.y = Math.max(0, py) + sp.alt;
  }

  _updateSkyPlanes(dt, playerPos) {
    const px = playerPos ? playerPos.x : 0;
    const py = playerPos && Number.isFinite(playerPos.y) ? Math.max(0, playerPos.y) : 0;
    const pz = playerPos ? playerPos.z : 0;

    for (let i = 0; i < this._skyPlanes.length; i++) {
      const sp = this._skyPlanes[i];
      if (sp.yawRate) {
        sp.yaw += sp.yawRate * dt;
      }
      sp.x += Math.sin(sp.yaw) * sp.speed * dt;
      sp.z += Math.cos(sp.yaw) * sp.speed * dt;
      if (sp.role === 'corridor_climb') {
        sp.alt += sp.speed * Math.sin(0.10) * dt;
        if (sp.alt > 430) sp.alt = 175;
      } else if (sp.role === 'corridor_descend') {
        sp.alt -= sp.speed * Math.sin(0.10) * dt;
        if (sp.alt < 175) sp.alt = 425;
      }

      const d = Math.hypot(sp.x - px, sp.z - pz);
      if (d > 1600) {
        this._respawnSkyPlane(sp, px, py, pz, i);
      } else {
        sp.y = py + sp.alt;
      }
      sp.mesh.position.set(sp.x, sp.y, sp.z);
      sp.mesh.rotation.set(-sp.pitch, sp.yaw, sp.roll, 'YXZ');
      sp.mesh.visible = !this.liveSkyNear; // [live-sky-weather] real traffic replaces ambient jets
    }
  }

  // ------------------------------------------------------------------ night: beacons + sign glow
  _updateNight() {
    const night = isNight();
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.mats.sign.emissiveIntensity = night ? 0.65 : 0.18;
    }
    // Red obstruction lights: ~40 flashes/min
    this.beacons.visible = night;
    if (night) this.beacons.material.color.copy(this.time % 1.5 < 0.7 ? this.beaconOn : this.beaconOff);
  }

  // ------------------------------------------------------------------ labels
  _labelTexture(text, kind = 0) {
    const cacheKey = `${kind}:${text}`;
    let e = this.labelTex.get(cacheKey);
    if (e) {
      this.labelTex.delete(cacheKey);
      this.labelTex.set(cacheKey, e);
      return e;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const isDistrict = kind === 3;
    const isPeak = kind === 4;
    const isWater = kind === 5;
    const isAirport = kind === 6;
    const dispText = isDistrict && getLang() !== 'zh' ? text.toUpperCase() : text;
    const font = isDistrict
      ? '600 28px -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "Noto Sans", sans-serif'
      : isWater
        ? 'italic 500 26px -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "Noto Sans", sans-serif'
        : '500 28px -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "Noto Sans", sans-serif';
    ctx.font = font;
    const w = Math.min(560, Math.ceil(ctx.measureText(dispText).width) + 32);
    canvas.width = w;
    canvas.height = 46;
    ctx.font = font;
    ctx.fillStyle = isWater
      ? 'rgba(12, 34, 58, 0.68)'
      : isPeak
        ? 'rgba(22, 36, 28, 0.70)'
        : isAirport
          ? 'rgba(14, 30, 56, 0.74)'
          : isDistrict
            ? 'rgba(20, 22, 28, 0.68)'
            : 'rgba(18, 20, 24, 0.58)';
    const r = 13;
    ctx.beginPath();
    ctx.moveTo(r, 1);
    ctx.arcTo(w - 1, 1, w - 1, 45, r);
    ctx.arcTo(w - 1, 45, 1, 45, r);
    ctx.arcTo(1, 45, 1, 1, r);
    ctx.arcTo(1, 1, w - 1, 1, r);
    ctx.closePath();
    ctx.fill();
    if (kind >= 3) {
      ctx.strokeStyle = isWater
        ? 'rgba(108, 180, 238, 0.45)'
        : isPeak
          ? 'rgba(216, 195, 154, 0.45)'
          : isAirport
            ? 'rgba(124, 196, 255, 0.55)'
            : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = isWater
      ? '#9ed4ff'
      : isPeak
        ? '#f0dec0'
        : isAirport
          ? '#a8d8ff'
          : 'rgba(255, 255, 255, 0.94)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(dispText, w / 2, 24, w - 22);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    e = { tex, aspect: w / 46 };
    this.labelTex.set(cacheKey, e);
    while (this.labelTex.size > 64) {
      const [oldKey, old] = this.labelTex.entries().next().value;
      if (this.labelSprites.some((sp) => sp.userData.texKey === oldKey)) break;
      old.tex.dispose();
      this.labelTex.delete(oldKey);
    }
    return e;
  }

  _pickLabels(camPos) {
    const zh = getLang() === 'zh';
    const localCands = [];
    const geoCands = [];
    const farLocal2 = LABEL_FAR * LABEL_FAR;
    const farGeo2 = LABEL_GEO_FAR * LABEL_GEO_FAR;
    for (const g of this.trackedGroups) {
      const pl = g.userData && g.userData.places;
      if (!pl || !pl.labels) continue;
      const { ox, oz } = g.userData;
      if (Math.abs(camPos.x - ox) > 500 + LABEL_GEO_FAR || Math.abs(camPos.z - oz) > 500 + LABEL_GEO_FAR) continue;
      for (const L of pl.labels) {
        const dx = L[0] - camPos.x, dy = L[1] - camPos.y, dz = L[2] - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const kind = L[5] || 0;
        if (kind >= 3) {
          if (d2 > farGeo2) continue;
          geoCands.push({ L, kind, d: Math.sqrt(d2) - (kind === 6 ? 120 : kind === 4 ? 60 : 0) });
        } else {
          if (d2 > farLocal2) continue;
          localCands.push({ L, kind, d: Math.sqrt(d2) - kind * 12 });
        }
      }
    }
    localCands.sort((a, b) => a.d - b.d);
    geoCands.sort((a, b) => a.d - b.d);
    const chosen = [];
    for (const c of geoCands) {
      if (chosen.length >= 6) break;
      const text = zh ? c.L[3] : c.L[4] || c.L[3];
      if (!text) continue;
      if (chosen.some((o) => o.text === text || Math.hypot(o.L[0] - c.L[0], o.L[2] - c.L[2]) < 140)) continue;
      chosen.push({ L: c.L, text, kind: c.kind });
    }
    let nLocal = 0;
    for (const c of localCands) {
      if (chosen.length >= LABEL_MAX || nLocal >= QUALITY.labels) break; // [ui-mobile] clutter cap per tier
      const text = zh ? c.L[3] : c.L[4] || c.L[3];
      if (!text) continue;
      if (chosen.some((o) => o.text === text && Math.hypot(o.L[0] - c.L[0], o.L[2] - c.L[2]) < 60)) continue;
      chosen.push({ L: c.L, text, kind: c.kind });
      nLocal++;
    }
    this._declutter(chosen, camPos); // [ui-mobile]
    const wanted = new Map(chosen.map((c) => [`${c.kind}:${c.text}@${Math.round(c.L[0])},${Math.round(c.L[2])}`, c]));
    for (const sp of this.labelSprites) {
      if (wanted.has(sp.userData.key)) {
        sp.userData.target = 1;
        wanted.delete(sp.userData.key);
      } else {
        sp.userData.target = 0;
      }
    }
    for (const [key, c] of wanted) {
      const sp = this.labelSprites.find((s) => s.userData.target === 0 && s.userData.opacity < 0.02);
      if (!sp) break;
      const e = this._labelTexture(c.text, c.kind);
      sp.material.map = e.tex;
      sp.material.needsUpdate = true;
      sp.userData.key = key;
      sp.userData.texKey = `${c.kind}:${c.text}`;
      sp.userData.aspect = e.aspect;
      sp.userData.kind = c.kind;
      sp.userData.target = 1;
      sp.position.set(c.L[0], c.L[1], c.L[2]);
      sp.visible = true;
    }
  }

  // World metres per CSS pixel at distance d (vertical), for the current camera and viewport.
  _pxToWorld(d) {
    const cam = this._cam;
    const fov = cam && cam.isPerspectiveCamera ? cam.fov : 58;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 850;
    return (2 * Math.max(d, 1) * Math.tan((fov * Math.PI) / 360)) / vh;
  }

  // [ui-mobile] Drops labels that would overlap a nearer / higher-priority one on screen, or sit behind the camera.
  _declutter(chosen, camPos) {
    const cam = this._cam;
    if (!cam || !chosen.length) return;
    cam.updateMatrixWorld();
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 1400;
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 850;
    const v = this._projV || (this._projV = new THREE.Vector3());
    const rects = [];
    const order = [...chosen.filter((c) => c.kind < 3), ...chosen.filter((c) => c.kind >= 3)]; // street labels win
    chosen.length = 0;
    for (const c of order) {
      v.set(c.L[0], c.L[1], c.L[2]).project(cam);
      if (v.z > 1 || v.z < -1) continue; // behind the camera
      const d = Math.hypot(c.L[0] - camPos.x, c.L[1] - camPos.y, c.L[2] - camPos.z);
      const isGeo = c.kind >= 3;
      const aspect = Math.min(560, c.text.length * 15 + 32) / 46;
      const hpx = labelPx(isGeo, d, aspect);
      const x = (v.x * 0.5 + 0.5) * vw, y = (0.5 - v.y * 0.5) * vh;
      const r = { x0: x - (hpx * aspect) / 2 - 4, x1: x + (hpx * aspect) / 2 + 4, y0: y - hpx / 2 - 3, y1: y + hpx / 2 + 3 };
      if (rects.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
      rects.push(r);
      chosen.push(c);
    }
  }

  _fadeLabels(dt, camPos) {
    for (const sp of this.labelSprites) {
      const u = sp.userData;
      if (!sp.visible) continue;
      const d = sp.position.distanceTo(camPos);
      const isGeo = (u.kind || 0) >= 3;
      const far = isGeo ? LABEL_GEO_FAR : LABEL_FAR;
      const near = isGeo ? LABEL_GEO_NEAR : LABEL_NEAR;
      const distFade = Math.max(0, Math.min(1, (far - d) / (far - near)));
      const goal = u.target * distFade;
      u.opacity += (goal - u.opacity) * Math.min(1, dt * 4);
      sp.material.opacity = u.opacity;
      // [ui-mobile] On-screen size, not world size: a fixed pixel range by distance (never screen-filling up
      // close), labels you stand next to fade out (the shop sign itself is readable then).
      const px = labelPx(isGeo, d, u.aspect || 4);
      const h = px * this._pxToWorld(d);
      sp.scale.set(h * (u.aspect || 4), h, 1);
      if (!isGeo && d < LABEL_CLOSE) {
        u.opacity = Math.min(u.opacity, Math.max(0, (d - LABEL_CLOSE * 0.5) / (LABEL_CLOSE * 0.5)));
        sp.material.opacity = u.opacity;
      }
      if (u.target === 0 && u.opacity < 0.02) {
        sp.visible = false;
        u.key = '';
        u.opacity = 0;
      }
    }
  }
}
