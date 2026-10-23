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
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
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
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);

function buildUnitGeometries() {
  const G = {};
  // Rooftop HVAC unit: unit box with dark fan disc on top
  G.hvac = mergeParts([
    [box(1, 1, 1), [0.86, 0.87, 0.88], mat(0, 0.5, 0)],
    [cyl(0.3, 0.3, 0.06, 12), [0.22, 0.23, 0.25], mat(0, 1.02, 0)],
    [box(1.01, 0.08, 1.01), [0.66, 0.67, 0.69], mat(0, 0.18, 0)],
  ]);
  G.vent = mergeParts([
    [cyl(0.5, 0.5, 1, 8), [0.48, 0.5, 0.52], mat(0, 0.5, 0)],
    [cyl(0.62, 0.62, 0.1, 8), [0.32, 0.33, 0.35], mat(0, 1.0, 0)],
  ]);
  // Wooden water tank on steel legs (tinted per instance)
  const tankParts = [];
  for (const [lx, lz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
    tankParts.push([box(0.06, 0.3, 0.06), [0.32, 0.32, 0.34], mat(lx, 0.15, lz)]);
  }
  tankParts.push([cyl(0.56, 0.56, 0.03, 12), [0.4, 0.38, 0.36], mat(0, 0.31, 0)]);
  tankParts.push([cyl(0.5, 0.5, 0.52, 14), [1, 1, 1], mat(0, 0.58, 0)]);
  for (const hy of [0.42, 0.58, 0.74]) tankParts.push([cyl(0.505, 0.505, 0.015, 14), [0.3, 0.28, 0.27], mat(0, hy, 0)]);
  tankParts.push([cone(0.54, 0.18, 14), [0.45, 0.4, 0.36], mat(0, 0.93, 0)]);
  G.tank = mergeParts(tankParts);
  // Antenna mast: unit height (scaled by sy), fixed radius
  G.mast = mergeParts([
    [cyl(0.07, 0.22, 1, 8), [0.8, 0.8, 0.82], mat(0, 0.5, 0)],
    [box(1.6, 0.008, 0.08), [0.7, 0.7, 0.72], mat(0, 0.35, 0)],
    [box(0.08, 0.008, 1.6), [0.7, 0.7, 0.72], mat(0, 0.62, 0)],
    [cyl(0.075, 0.075, 0.06, 8), [0.85, 0.2, 0.18], mat(0, 0.86, 0)],
  ]);
  G.solar = mergeParts([
    [box(1, 0.05, 1), [0.12, 0.17, 0.3], mat(0, 0.55, 0, -0.42, 0, 0)],
    [box(0.04, 0.5, 0.04), [0.55, 0.56, 0.58], mat(-0.45, 0.25, -0.3)],
    [box(0.04, 0.5, 0.04), [0.55, 0.56, 0.58], mat(0.45, 0.25, -0.3)],
  ]);
  const gardenParts = [
    [box(1, 0.3, 1), [0.42, 0.36, 0.3], mat(0, 0.15, 0)],
    [box(0.94, 0.05, 0.94), [0.33, 0.55, 0.26], mat(0, 0.32, 0)],
  ];
  const shrubs = [[-0.3, -0.25, 0.5], [0.28, -0.3, 0.7], [0.05, 0.1, 0.45], [-0.25, 0.3, 0.6], [0.32, 0.28, 0.4], [-0.05, -0.36, 0.35]];
  for (const [sx, sz, h] of shrubs) gardenParts.push([box(0.14, h, 0.14), [0.2, 0.42, 0.2], mat(sx, 0.34 + h / 2, sz)]);
  G.garden = mergeParts(gardenParts);

  // Striped storefront awning: local X along the wall, +Z out of the wall, y 0..1
  {
    const pos = [];
    const col = [];
    const strips = 6;
    for (let i = 0; i < strips; i++) {
      const x0 = -0.5 + i / strips, x1 = -0.5 + (i + 1) / strips;
      const c = i % 2 === 0 ? [1, 1, 1] : [0.8, 0.8, 0.8];
      const quad = (a, b, cc, d) => {
        pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
        for (let k = 0; k < 6; k++) col.push(...c);
      };
      quad([x0, 1, 0], [x0, 0.28, 1], [x1, 0.28, 1], [x1, 1, 0]);
      quad([x0, 0.28, 1], [x0, 0.0, 1], [x1, 0.0, 1], [x1, 0.28, 1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    G.awning = g;
  }
  G.sign = mergeParts([
    [box(1, 1, 1), [1, 1, 1], mat(0, 0.5, 0.5)],
    [box(1.04, 0.08, 1.04), [0.35, 0.35, 0.36], mat(0, 0.02, 0.5)],
  ]);
  // Transit entrance totem (real size), tinted per line color
  G.transit = mergeParts([
    [cyl(0.07, 0.07, 2.8, 8), [0.55, 0.55, 0.55], mat(0, 1.4, 0)],
    [box(0.8, 0.8, 0.16), [1, 1, 1], mat(0, 3.1, 0)],
    [box(0.5, 0.12, 0.18), [1.8, 1.8, 1.8], mat(0, 3.1, 0)],
    [box(0.5, 0.1, 0.5), [0.5, 0.5, 0.5], mat(0, 0.05, 0)],
  ]);

  // Helipad (unit radius = 1, scaled by hr in X/Z): dark landing deck, white aiming circle, bold white "H", 8 green perimeter lights
  {
    const hp = [
      [cyl(1.0, 1.04, 0.16, 16), [0.23, 0.25, 0.28], mat(0, 0.08, 0)],
      [cyl(0.94, 0.94, 0.17, 16), [0.92, 0.78, 0.16], mat(0, 0.085, 0)],
      [cyl(0.88, 0.88, 0.18, 16), [0.25, 0.27, 0.30], mat(0, 0.09, 0)],
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

  // Gas Station: illuminated canopy + 2 fuel pump islands + roadside price totem (brand stripe tinted by instance color)
  G.gasStation = mergeParts([
    // Concrete fuel island
    [box(5.4, 0.18, 1.4), [0.72, 0.73, 0.75], mat(0, 0.09, 0)],
    // 2 Canopy columns
    [cyl(0.20, 0.22, 4.2, 10), [0.85, 0.86, 0.88], mat(-1.85, 2.1, 0)],
    [cyl(0.20, 0.22, 4.2, 10), [0.85, 0.86, 0.88], mat(1.85, 2.1, 0)],
    // 2 Fuel dispensers
    [box(0.75, 1.50, 0.46), [0.92, 0.93, 0.95], mat(-0.85, 0.92, 0)],
    [box(0.52, 0.38, 0.50), [0.15, 0.20, 0.26], mat(-0.85, 1.18, 0)],
    [box(0.78, 0.26, 0.50), [1.0, 1.0, 1.0], mat(-0.85, 1.58, 0)],
    [box(0.75, 1.50, 0.46), [0.92, 0.93, 0.95], mat(0.85, 0.92, 0)],
    [box(0.52, 0.38, 0.50), [0.15, 0.20, 0.26], mat(0.85, 1.18, 0)],
    [box(0.78, 0.26, 0.50), [1.0, 1.0, 1.0], mat(0.85, 1.58, 0)],
    // Overhead canopy deck + brand fascia stripe
    [box(7.6, 0.34, 4.6), [0.94, 0.95, 0.97], mat(0, 4.25, 0)],
    [box(7.72, 0.22, 4.72), [1.0, 1.0, 1.0], mat(0, 4.32, 0)],
    // Price totem sign
    [box(1.0, 3.7, 0.26), [0.22, 0.24, 0.28], mat(4.2, 1.85, 1.7)],
    [box(1.06, 0.9, 0.30), [1.0, 1.0, 1.0], mat(4.2, 3.22, 1.7)],
    [box(0.82, 1.1, 0.30), [0.96, 0.84, 0.22], mat(4.2, 1.95, 1.7)],
  ]);

  // EV Supercharger Station: concrete pad + 4 white/crimson Supercharger stalls + utility cabinet
  {
    const ev = [
      [box(5.4, 0.15, 1.2), [0.68, 0.70, 0.72], mat(0, 0.075, 0)],
      [box(0.92, 1.45, 0.72), [0.78, 0.80, 0.82], mat(-2.85, 0.75, -0.1)],
    ];
    for (const sx of [-1.8, -0.6, 0.6, 1.8]) {
      ev.push(
        [box(0.50, 1.66, 0.24), [0.96, 0.97, 0.98], mat(sx, 0.90, 0)],
        [box(0.26, 1.06, 0.26), [0.88, 0.14, 0.18], mat(sx, 0.86, 0)],
        [box(0.42, 0.10, 0.27), [0.12, 0.94, 0.72], mat(sx, 1.60, 0)],
        [box(0.72, 0.10, 0.15), [0.92, 0.76, 0.14], mat(sx, 0.05, 0.82)],
      );
    }
    G.evCharger = mergeParts(ev);
  }

  // Bike-Share Dock: sidewalk dock plate + payment terminal kiosk + 5 docked bicycles
  {
    const bk = [
      [box(4.6, 0.08, 0.75), [0.36, 0.38, 0.42], mat(0, 0.04, 0)],
      // Kiosk terminal
      [box(0.38, 1.62, 0.28), [0.22, 0.25, 0.30], mat(-2.0, 0.84, 0)],
      [box(0.28, 0.34, 0.31), [0.30, 0.78, 0.98], mat(-2.0, 1.20, 0)],
      [box(0.44, 0.05, 0.40), [0.14, 0.20, 0.34], mat(-2.0, 1.72, 0, -0.35, 0, 0)],
    ];
    for (const bx of [-1.1, -0.4, 0.3, 1.0, 1.7]) {
      bk.push(
        [box(0.13, 0.70, 0.13), [0.55, 0.58, 0.62], mat(bx, 0.38, -0.22)],
        [cyl(0.27, 0.27, 0.05, 10), [0.16, 0.17, 0.19], mat(bx, 0.32, -0.04, 0, 0, Math.PI / 2)],
        [cyl(0.27, 0.27, 0.05, 10), [0.16, 0.17, 0.19], mat(bx, 0.32, 0.54, 0, 0, Math.PI / 2)],
        [box(0.07, 0.40, 0.50), [1.0, 1.0, 1.0], mat(bx, 0.42, 0.25)],
        [box(0.36, 0.05, 0.05), [0.76, 0.78, 0.80], mat(bx, 0.76, -0.02)],
        [box(0.13, 0.06, 0.20), [0.16, 0.16, 0.18], mat(bx, 0.70, 0.42)],
      );
    }
    G.bikeDock = mergeParts(bk);
  }

  // Highway Toll Booth Plaza: 3 crash-barrier islands + 2 booth kiosks + overhead ETC canopy + gate arms
  {
    const tb = [
      // Overhead canopy + blue ETC sign band
      [box(11.0, 0.80, 3.2), [0.92, 0.93, 0.95], mat(0, 4.80, 0)],
      [box(11.1, 0.50, 3.3), [0.12, 0.38, 0.78], mat(0, 4.86, 0)],
      [box(0.40, 4.5, 0.40), [0.62, 0.64, 0.66], mat(-4.5, 2.35, 0)],
      [box(0.40, 4.5, 0.40), [0.62, 0.64, 0.66], mat(4.5, 2.35, 0)],
      // Toll barrier arms
      [box(3.1, 0.10, 0.10), [0.92, 0.18, 0.16], mat(-2.2, 1.15, 1.2)],
      [box(3.1, 0.10, 0.10), [0.92, 0.18, 0.16], mat(2.2, 1.15, 1.2)],
    ];
    for (const ix of [-4.5, 0, 4.5]) {
      tb.push(
        [box(0.72, 0.82, 5.0), [0.75, 0.76, 0.74], mat(ix, 0.41, 0)],
        [cyl(0.32, 0.34, 0.80, 10), [0.95, 0.76, 0.12], mat(ix, 0.41, -2.6)],
      );
    }
    for (const ix of [-4.5, 0]) {
      tb.push(
        [box(0.66, 2.30, 2.1), [0.88, 0.90, 0.92], mat(ix, 1.35, 0)],
        [box(0.70, 0.92, 1.7), [0.22, 0.38, 0.52], mat(ix, 1.65, 0)],
      );
    }
    G.tollBooth = mergeParts(tb);
  }

  // Hospital 3D Red Cross Monument: white clinical pedestal + shield + glowing crimson 3D Red Cross
  G.hospitalCross = mergeParts([
    [cyl(0.52, 0.62, 0.9, 8), [0.92, 0.94, 0.96], mat(0, 0.45, 0)],
    [box(2.45, 2.45, 0.22), [0.96, 0.97, 0.99], mat(0, 2.10, 0)],
    [box(2.00, 0.64, 0.38), [0.92, 0.12, 0.15], mat(0, 2.10, 0)],
    [box(0.64, 2.00, 0.38), [0.92, 0.12, 0.15], mat(0, 2.10, 0)],
  ]);

  // Place of Worship (Church / Cathedral Spire): stone belfry + copper octagonal spire + golden cross
  G.worshipSpire = mergeParts([
    [box(2.1, 2.3, 2.1), [0.84, 0.81, 0.75], mat(0, 1.15, 0)],
    [box(2.16, 0.80, 0.70), [0.28, 0.30, 0.34], mat(0, 1.45, 0)],
    [box(0.70, 0.80, 2.16), [0.28, 0.30, 0.34], mat(0, 1.45, 0)],
    [cone(1.20, 4.1, 8), [0.24, 0.48, 0.44], mat(0, 4.35, 0)],
    [box(0.14, 1.10, 0.14), [0.95, 0.78, 0.20], mat(0, 6.75, 0)],
    [box(0.66, 0.14, 0.14), [0.95, 0.78, 0.20], mat(0, 6.90, 0)],
  ]);

  // Place of Worship (East Asian Temple / Shrine Torii Gate): vermilion pillars + kasagi lintel + gold plaque
  G.worshipTorii = mergeParts([
    [cyl(0.34, 0.38, 0.44, 10), [0.35, 0.35, 0.38], mat(-1.7, 0.22, 0)],
    [cyl(0.34, 0.38, 0.44, 10), [0.35, 0.35, 0.38], mat(1.7, 0.22, 0)],
    [cyl(0.23, 0.26, 4.3, 12), [0.86, 0.16, 0.12], mat(-1.7, 2.35, 0)],
    [cyl(0.23, 0.26, 4.3, 12), [0.86, 0.16, 0.12], mat(1.7, 2.35, 0)],
    [box(4.5, 0.26, 0.24), [0.86, 0.16, 0.12], mat(0, 3.60, 0)],
    [box(5.3, 0.30, 0.36), [0.86, 0.16, 0.12], mat(0, 4.48, 0)],
    [box(5.7, 0.20, 0.46), [0.16, 0.17, 0.20], mat(0, 4.74, 0)],
    [box(0.50, 0.74, 0.30), [0.92, 0.75, 0.18], mat(0, 4.04, 0)],
  ]);

  // Narrow-body airliner (nose +Z), real size ~38 m
  const white = [0.95, 0.95, 0.96];
  const grey = [0.7, 0.72, 0.75];
  const dark = [0.14, 0.15, 0.17];
  G.plane = mergeParts([
    [cyl(2, 2, 30, 14), white, mat(0, 3.2, 0, Math.PI / 2, 0, 0)],
    [cone(2, 5, 14), white, mat(0, 3.2, 17.5, Math.PI / 2, 0, 0)],
    [cone(2, 6.5, 14), white, mat(0, 3.5, -18.2, -Math.PI / 2, 0, 0)],
    [box(34, 0.4, 5.5), grey, mat(0, 2.3, 0.5)],
    [box(12, 0.3, 3), grey, mat(0, 4.0, -17.5)],
    [cyl(0.95, 0.95, 3.6, 10), grey, mat(6, 1.4, 2.6, Math.PI / 2, 0, 0)],
    [cyl(0.95, 0.95, 3.6, 10), grey, mat(-6, 1.4, 2.6, Math.PI / 2, 0, 0)],
    [box(2.4, 0.5, 1.0), dark, mat(0, 4.3, 15.4)],
    [box(0.3, 1.3, 0.3), dark, mat(0, 0.65, 13)],
    [box(2.6, 1.0, 0.6), dark, mat(0, 0.5, -1)],
  ]);
  G.planeTail = mergeParts([[box(0.45, 6.5, 5), [1, 1, 1], mat(0, 8.0, -17.2)]]);
  // Cargo ship (bow +Z), 120 m; small vessels reuse it scaled down
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
    const parts = [[hull, [0.17, 0.21, 0.3], null]];
    parts.push([box(18.3, 1.0, 97), [0.62, 0.16, 0.14], mat(0, -0.2, -11)]);
    parts.push([box(17.4, 0.3, 95), [0.36, 0.38, 0.36], mat(0, 6.05, -10)]);
    const cont = [[0.75, 0.25, 0.18], [0.18, 0.4, 0.62], [0.85, 0.65, 0.2], [0.3, 0.55, 0.35], [0.62, 0.62, 0.64]];
    for (let i = 0; i < 6; i++) {
      const h = 3 + ((i * 7) % 5);
      parts.push([box(15, h, 9.5), cont[i % cont.length], mat(0, 6 + h / 2, 28 - i * 11)]);
    }
    parts.push([box(16, 14, 10), [0.94, 0.94, 0.92], mat(0, 13, -45)]);
    parts.push([box(20, 1.6, 4), [0.9, 0.9, 0.88], mat(0, 19.2, -42)]);
    parts.push([box(16.2, 1.0, 10.2), [0.2, 0.24, 0.3], mat(0, 18, -45)]);
    parts.push([box(3.2, 5, 3.2), [0.7, 0.2, 0.16], mat(0, 22.5, -51)]);
    G.ship = mergeParts(parts);
  }
  G.trainCar = mergeParts([
    [box(3, 3.3, 20), [0.93, 0.93, 0.91], mat(0, 2.75, 0)],
    [box(3.04, 0.9, 18.4), [0.16, 0.19, 0.24], mat(0, 3.1, 0)],
    [box(3.05, 0.28, 19.8), [0.85, 0.3, 0.2], mat(0, 2.15, 0)],
    [box(2.5, 0.3, 19), [0.62, 0.63, 0.65], mat(0, 4.55, 0)],
    [box(2.4, 0.9, 3), [0.18, 0.18, 0.2], mat(0, 0.75, 6.5)],
    [box(2.4, 0.9, 3), [0.18, 0.18, 0.2], mat(0, 0.75, -6.5)],
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
};

const LABEL_MAX = 14;
const LABEL_FAR = 110;
const LABEL_NEAR = 72;
const LABEL_GEO_FAR = 1350;
const LABEL_GEO_NEAR = 920;

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
    this._initSkyPlanes({ x: 0, y: 0, z: 0 });
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
    navPort.position.set(17.0, 2.5, 0.5);
    const navStarboard = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x18e65a })
    );
    navStarboard.position.set(-17.0, 2.5, 0.5);
    const strobeTail = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    strobeTail.position.set(0, 11.2, -17.2);
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
        const r = KINDS[kind][1];
        if (chunkDist > r) continue;
        const r2 = r * r;
        const a = pl.inst[kind];
        const cap = KINDS[kind][0];
        const mArr = pool.instanceMatrix.array;
        const cArr = pool.instanceColor.array;
        let n = counts[kind];
        for (let i = 0; i < a.length && n < cap; i += STRIDE) {
          const dx = a[i] - px, dz = a[i + 2] - pz;
          if (dx * dx + dz * dz > r2) continue;
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
    for (const c of localCands) {
      if (chosen.length >= LABEL_MAX) break;
      const text = zh ? c.L[3] : c.L[4] || c.L[3];
      if (!text) continue;
      if (chosen.some((o) => o.text === text && Math.hypot(o.L[0] - c.L[0], o.L[2] - c.L[2]) < 60)) continue;
      chosen.push({ L: c.L, text, kind: c.kind });
    }
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
      const h = isGeo ? 1.6 + d * 0.013 : 0.5 + d * 0.009;
      sp.scale.set(h * (u.aspect || 4), h, 1);
      if (u.target === 0 && u.opacity < 0.02) {
        sp.visible = false;
        u.key = '';
        u.opacity = 0;
      }
    }
  }
}
