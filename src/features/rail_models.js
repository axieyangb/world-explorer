// [feature/rail-transit] Fine-detail 3D rail & transit rolling stock models (one merged geometry per part, vertex coloured).
// Each model: { body, accent, len, wid, accentRgb } — origin at rail-head level, centred, +Z forward.
// `accent` parts are white and tinted per instance (line colour / livery) via InstancedMesh colours.

import * as THREE from "../../vendor/three.module.js";

const WHITE = [1, 1, 1];
const DARK = [0.10, 0.11, 0.12];
const IRON = [0.16, 0.17, 0.19];
const GLASS = [0.11, 0.15, 0.20];
const CAB_GLASS = [0.08, 0.12, 0.17];
const STEEL = [0.34, 0.35, 0.38];
const CHROME = [0.76, 0.78, 0.82];
const SILVER = [0.82, 0.84, 0.87];
const ROOF_GREY = [0.50, 0.52, 0.55];
const CERAMIC = [0.86, 0.88, 0.90];
const BRASS = [0.83, 0.67, 0.28];
const WOOD_DK = [0.36, 0.24, 0.15];
const WOOD_MD = [0.48, 0.32, 0.19];
const CREAM = [0.94, 0.89, 0.76];
const HEADLIGHT = [1.0, 0.96, 0.78];
const TAILLIGHT = [0.92, 0.12, 0.10];
const LED_AMBER = [1.0, 0.68, 0.12];
const BELLOWS = [0.18, 0.19, 0.21];

/**
 * Merges primitives into a single non-indexed BufferGeometry.
 * CRITICAL Smooth-Normal Rule: computeVertexNormals() is called on indexed curved primitives BEFORE
 * .toNonIndexed(), and applyMatrix4() transforms existing smooth normals via normalMatrix without
 * flattening curved surfaces into faceted polygons.
 */
function merge(parts) {
  const pos = [], nrm = [], col = [];
  for (const [geom, rgb, m] of parts) {
    if (!geom.attributes.normal) geom.computeVertexNormals();
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nrm.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** Box from y0..y1, centred on (x, z). */
const B = (w, y0, y1, d, x = 0, z = 0, rx = 0, ry = 0, rz = 0) => [
  new THREE.BoxGeometry(w, y1 - y0, d),
  M(x, (y0 + y1) / 2, z, rx, ry, rz),
];

/** Smooth cylinder centred at (x, y, z). */
const Cyl = (rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.computeVertexNormals();
  return [g, M(x, y, z, rx, ry, rz, sx, sy, sz)];
};

/** Smooth sphere centred at (x, y, z). */
const Sph = (r, ws, hs, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.computeVertexNormals();
  return [g, M(x, y, z, 0, 0, 0, sx, sy, sz)];
};

function part(list, [g, m], rgb) { list.push([g, rgb, m]); }

/**
 * Smooth lofted aerodynamic nose cone (for HSR bullet trains and streamlined commuter/BART cabs).
 * Extends from z = 0 to z = dir * noseLen, with height from y0 to y1 and width W.
 */
function makeNoseGeometry(W, y0, y1, noseLen, dir, duckBill = false) {
  const H = y1 - y0;
  const nZ = 10, nP = 12;
  const positions = [];
  const indices = [];
  for (let iz = 0; iz <= nZ; iz++) {
    const u = iz / nZ; // 0 = body joint, 1 = nose tip
    const z = dir * u * noseLen;
    const widthScale = Math.pow(Math.max(0.02, 1 - Math.pow(u, 1.65)), 0.58);
    const hw = (W / 2) * widthScale;
    const noseTipY = duckBill ? y0 + H * 0.22 : y0 + H * 0.36;
    const topY = duckBill
      ? y1 - H * (0.28 * Math.pow(u, 1.3) + 0.50 * Math.pow(u, 3.2))
      : y1 - H * 0.64 * Math.pow(u, 1.85);
    const botY = y0 + (noseTipY - y0) * Math.pow(u, 2.2);
    const cy = (topY + botY) * 0.5;
    const hh = Math.max(0.03, (topY - botY) * 0.5);
    for (let ip = 0; ip <= nP; ip++) {
      const a = (ip / nP) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.78);
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.82);
      const x = sx * hw;
      const y = Math.max(y0, cy + sy * hh);
      positions.push(x, y, z);
    }
  }
  const stride = nP + 1;
  for (let iz = 0; iz < nZ; iz++) {
    for (let ip = 0; ip < nP; ip++) {
      const a = iz * stride + ip;
      const b = a + 1;
      const c = (iz + 1) * stride + ip + 1;
      const d = (iz + 1) * stride + ip;
      if (dir > 0) {
        indices.push(a, b, c, a, c, d);
      } else {
        indices.push(a, c, b, a, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Detailed under-floor bogie trucks with side frames, visible primary & secondary coil springs, axleboxes, ventilated disc brakes & underbelly equipment. */
function bogies(body, len, wid, opts = {}) {
  const off = len * (opts.offRatio || 0.34);
  const wheelR = opts.wheelR || 0.42;
  const axleSpan = opts.axleSpan || 1.75;
  const gaugeHW = Math.min(wid * 0.34, 0.74);
  const frameW = gaugeHW * 2 + 0.28;

  for (const bz of [-off, off]) {
    for (const sx of [-1, 1]) {
      const fx = sx * (gaugeHW + 0.09);
      // Bogie side frame longitudinal beam + central drop-equalizer cradle
      part(body, B(0.14, wheelR * 0.72, wheelR * 1.62, axleSpan + 0.88, fx, bz), DARK);
      part(body, B(0.16, wheelR * 0.52, wheelR * 0.78, axleSpan * 0.56, fx, bz), IRON);
      for (const az of [-axleSpan * 0.5, axleSpan * 0.5]) {
        const wz = bz + az;
        // Cast-steel axlebox housing & cylindrical roller-bearing end cap
        part(body, B(0.18, wheelR - 0.13, wheelR + 0.15, 0.30, sx * (gaugeHW + 0.12), wz), IRON);
        part(body, Cyl(0.11, 0.11, 0.18, 8, sx * (gaugeHW + 0.13), wheelR, wz, 0, 0, Math.PI / 2), STEEL);
        // Twin visible primary coil springs (helical spring stacks flanking each axlebox)
        for (const dz of [-0.14, 0.14]) {
          part(body, Cyl(0.075, 0.075, 0.24, 8, sx * (gaugeHW + 0.11), wheelR * 1.38, wz + dz), STEEL);
          for (const cy of [wheelR * 1.24, wheelR * 1.38, wheelR * 1.52]) {
            part(body, Cyl(0.088, 0.088, 0.032, 8, sx * (gaugeHW + 0.11), cy, wz + dz), CHROME);
          }
        }
      }
      // Twin secondary bolster coil springs + vertical hydraulic damper strut
      for (const dz of [-0.15, 0.15]) {
        part(body, Cyl(0.11, 0.11, 0.28, 8, sx * (gaugeHW + 0.07), wheelR * 1.62, bz + dz), IRON);
        part(body, Cyl(0.125, 0.125, 0.04, 8, sx * (gaugeHW + 0.07), wheelR * 1.62, bz + dz), SILVER);
      }
      part(body, Cyl(0.038, 0.038, 0.58, 6, sx * (gaugeHW + 0.17), wheelR * 1.25, bz, 0.35, 0, 0), [0.72, 0.18, 0.14]);
    }
    part(body, B(frameW, wheelR * 0.85, wheelR * 1.55, 0.55, 0, bz), DARK);
    if (opts.thirdRail) {
      for (const sx of [-1, 1]) {
        part(body, B(0.18, 0.14, 0.24, 0.42, sx * (gaugeHW + 0.22), bz), [0.55, 0.38, 0.18]);
      }
    }
    for (const az of [-axleSpan * 0.5, axleSpan * 0.5]) {
      const wz = bz + az;
      part(body, Cyl(0.07, 0.07, frameW + 0.06, 8, 0, wheelR, wz, 0, 0, Math.PI / 2), IRON);
      for (const sx of [-1, 1]) {
        // Flanged steel wheel + polished tread
        part(body, Cyl(wheelR, wheelR, 0.11, 12, sx * gaugeHW, wheelR, wz, 0, 0, Math.PI / 2), STEEL);
        part(body, Cyl(wheelR + 0.05, wheelR + 0.05, 0.03, 12, sx * (gaugeHW - 0.05), wheelR, wz, 0, 0, Math.PI / 2), CHROME);
        // Axle-mounted ventilated disc brake rotor + caliper assembly
        const bx = sx * (gaugeHW * 0.54);
        part(body, Cyl(wheelR * 0.74, wheelR * 0.74, 0.045, 12, bx, wheelR, wz, 0, 0, Math.PI / 2), SILVER);
        part(body, Cyl(wheelR * 0.42, wheelR * 0.42, 0.065, 8, bx, wheelR, wz, 0, 0, Math.PI / 2), DARK);
        part(body, B(0.09, wheelR + 0.06, wheelR + 0.30, 0.22, bx, wz - Math.sign(az) * 0.16), [0.68, 0.20, 0.15]);
      }
    }
  }
  if (len > 11 && !opts.openUnder) {
    part(body, B(wid * 0.68, 0.34, 0.82, len * 0.26, 0, 0), IRON);
    for (const sx of [-1, 1]) {
      part(body, Cyl(0.20, 0.20, 1.35, 10, sx * wid * 0.24, 0.52, len * 0.16, Math.PI / 2, 0, 0), STEEL);
    }
  }
}

/** Roof-mounted pantograph assembly with porcelain insulator bushings, lower/upper arms, and collector pan. */
function pantograph(body, z, roofY, reach, shroud = false) {
  for (const ix of [-0.42, 0.42]) {
    for (const iz of [-0.42, 0.42]) {
      part(body, Cyl(0.08, 0.10, 0.18, 8, ix, roofY + 0.09, z + iz), CERAMIC);
      part(body, Cyl(0.11, 0.11, 0.04, 8, ix, roofY + 0.11, z + iz), CERAMIC);
    }
  }
  part(body, B(1.02, roofY + 0.16, roofY + 0.28, 1.02, 0, z), STEEL);
  part(body, Cyl(0.07, 0.07, 0.55, 8, 0, roofY + 0.24, z, Math.PI / 2, 0, 0), CHROME);
  if (shroud) {
    for (const sx of [-0.68, 0.68]) {
      part(body, B(0.10, roofY, roofY + 0.42, 1.8, sx, z), ROOF_GREY);
    }
  }
  const h = Math.max(0.55, reach - roofY - 0.28);
  body.push([new THREE.BoxGeometry(0.055, h * 0.64, 0.055), STEEL, M(0, roofY + 0.28 + h * 0.25, z - 0.22, 0.52, 0, 0)]);
  for (const sx of [-0.18, 0.18]) {
    body.push([new THREE.BoxGeometry(0.045, h * 0.66, 0.045), CHROME, M(sx, roofY + 0.28 + h * 0.72, z - 0.20, -0.50, 0, 0)]);
  }
  part(body, Cyl(0.05, 0.05, 0.46, 8, 0, roofY + 0.28 + h * 0.50, z - 0.44, 0, 0, Math.PI / 2), STEEL);
  for (const dz of [-0.10, 0.10]) {
    part(body, B(1.68, reach - 0.05, reach, 0.05, 0, z + dz), DARK);
    for (const sx of [-1, 1]) {
      part(body, B(0.24, reach - 0.12, reach - 0.06, 0.04, sx * 0.92, z + dz, 0, 0, sx * -0.35), CHROME);
    }
  }
  part(body, B(0.45, reach - 0.10, reach - 0.04, 0.28, 0, z), STEEL);
}

/** Framed window mullions, sill/header rails & upper hopper transom bar along car sides. */
function windowFrameMullions(body, W, winY0, winY1, spanL, pitch = 1.45, frameRgb = SILVER) {
  // Upper lintel, lower sill, and transom hopper divider rail
  part(body, B(W + 0.034, winY0 - 0.035, winY0 + 0.02, spanL), frameRgb);
  part(body, B(W + 0.034, winY1 - 0.02, winY1 + 0.035, spanL), frameRgb);
  const hopperY = winY1 - (winY1 - winY0) * 0.24;
  part(body, B(W + 0.032, hopperY - 0.015, hopperY + 0.015, spanL), CHROME);
  // Crisp vertical inner sash mullions subdividing window bays
  for (let z = -spanL * 0.44 + pitch * 0.5; z <= spanL * 0.44 - pitch * 0.3; z += pitch) {
    part(body, B(W + 0.032, winY0, winY1, 0.045, 0, z), DARK);
  }
}

/** Corrugated stainless-steel roof ribs + HVAC pods with louvered roof ventilator grilles. */
function roofCorrugation(body, W, y1, L, ribs = 7, roofKit = true) {
  part(body, B(W * 0.92, y1, y1 + 0.14, L - 0.35), ROOF_GREY);
  const span = W * 0.80;
  for (let i = 0; i < ribs; i++) {
    const x = -span / 2 + (span * i) / (ribs - 1);
    part(body, B(0.035, y1 + 0.14, y1 + 0.175, L - 0.6, x, 0), SILVER);
  }
  // Centerline roof ventilator grilles (slatted intake louver banks)
  for (const vz of [-L * 0.06, L * 0.06]) {
    part(body, B(W * 0.44, y1 + 0.14, y1 + 0.26, L * 0.09, 0, vz), STEEL);
    for (let k = -2; k <= 2; k++) {
      part(body, B(W * 0.46, y1 + 0.16, y1 + 0.24, 0.035, 0, vz + k * (L * 0.015)), DARK);
    }
  }
  if (roofKit) {
    for (const z of [-L * 0.24, L * 0.24]) {
      part(body, B(W * 0.58, y1 + 0.14, y1 + 0.42, L * 0.18, 0, z), [0.44, 0.46, 0.49]);
      // Side ventilator grille slats on HVAC pod + twin circular exhaust fan grilles on top
      for (let k = -3; k <= 3; k++) {
        part(body, B(W * 0.60, y1 + 0.18, y1 + 0.38, 0.04, 0, z + k * (L * 0.022)), DARK);
      }
      for (const dx of [-W * 0.16, W * 0.16]) {
        part(body, Cyl(0.30, 0.30, 0.035, 10, dx, y1 + 0.43, z), SILVER);
        part(body, Cyl(0.25, 0.25, 0.045, 10, dx, y1 + 0.435, z), DARK);
      }
    }
  }
}

/** Headlights, red taillights, destination LED board, coupler knuckles & side buffers, and inter-car gangway bellows at both ends. */
function endDetails(body, W, y0, y1, zEnd, hasBellows = true, hasLED = true) {
  for (const s of [-1, 1]) {
    const z = s * zEnd;
    // Anti-climber ribbed headstock beam
    part(body, B(W * 0.94, y0 - 0.06, y0 + 0.14, 0.16, 0, z + s * 0.04), DARK);
    // Drawbar shank + automatic coupler knuckle head & gathering horn
    part(body, B(0.22, y0 - 0.24, y0 - 0.08, 0.46, 0, z + s * 0.20), IRON);
    part(body, B(0.34, y0 - 0.28, y0 - 0.04, 0.24, 0, z + s * 0.40), STEEL);
    part(body, Cyl(0.09, 0.09, 0.26, 8, s * 0.08, y0 - 0.16, z + s * 0.48), DARK);
    // Twin side hydraulic crash buffers (cylindrical plungers + convex buffer plates)
    for (const sx of [-1, 1]) {
      const bx = sx * W * 0.33;
      part(body, Cyl(0.075, 0.085, 0.26, 8, bx, y0 - 0.10, z + s * 0.14, Math.PI / 2, 0, 0), IRON);
      part(body, Cyl(0.15, 0.15, 0.04, 10, bx, y0 - 0.10, z + s * 0.27, Math.PI / 2, 0, 0), DARK);
      part(body, Cyl(0.11, 0.11, 0.06, 10, sx * W * 0.34, y0 + 0.42, z + s * 0.02, Math.PI / 2, 0, 0), HEADLIGHT);
      part(body, Cyl(0.08, 0.08, 0.06, 10, sx * W * 0.23, y0 + 0.42, z + s * 0.02, Math.PI / 2, 0, 0), TAILLIGHT);
    }
    if (hasLED) {
      part(body, B(W * 0.48, y1 - 0.34, y1 - 0.14, 0.06, 0, z + s * 0.03), DARK);
      part(body, B(W * 0.42, y1 - 0.30, y1 - 0.18, 0.07, 0, z + s * 0.035), LED_AMBER);
    }
    if (hasBellows) {
      for (let r = 0; r < 3; r++) {
        const dz = z + s * (0.06 + r * 0.065);
        const col = r % 2 === 0 ? BELLOWS : DARK;
        part(body, B(1.16, y0 + 0.12, y1 - 0.12, 0.055, 0, dz), col);
      }
      part(body, B(0.86, y0 + 0.16, y1 - 0.22, 0.22, 0, z + s * 0.06), DARK);
    }
  }
}

/** Recessed sliding passenger doors along both sides. */
function sideDoors(body, accent, W, y0, y1, L, nDoors = 3, doorW = 1.32) {
  const span = L * 0.72;
  for (let i = 0; i < nDoors; i++) {
    const z = nDoors === 1 ? 0 : -span / 2 + (span * i) / (nDoors - 1);
    part(body, B(W + 0.04, y0 + 0.06, y1 - 0.18, doorW, 0, z), SILVER);
    part(body, B(W + 0.05, y0 + 0.08, y1 - 0.20, 0.03, 0, z), DARK);
    for (const dz of [-doorW * 0.24, doorW * 0.24]) {
      part(body, B(W + 0.06, y0 + (y1 - y0) * 0.42, y1 - 0.34, doorW * 0.36, 0, z + dz), GLASS);
    }
  }
}

/**
 * San Francisco Cable Car:
 * Authentic burgundy/cream livery, open-air gripman platform with brass grip levers & roof bell,
 * clerestory monitor roof with cupola windows, outward wooden benches, and wooden running boards.
 */
function cableCar() {
  const body = [], accent = [];
  const L = 8.4, W = 2.45;
  bogies(body, L, 2.1, { wheelR: 0.34, axleSpan: 1.3, offRatio: 0.30, openUnder: true });
  part(body, B(2.15, 0.36, 0.74, L - 0.2), DARK);
  part(body, B(W, 0.74, 0.86, L), WOOD_DK);
  for (const sx of [-1, 1]) {
    part(body, B(0.22, 0.52, 0.58, L - 0.6, sx * (W * 0.5 + 0.06), 0), WOOD_MD);
    part(body, B(0.18, 0.64, 0.70, L - 0.4, sx * (W * 0.5 + 0.02), 0), WOOD_DK);
  }
  part(accent, B(W + 0.02, 0.86, 1.44, L - 0.1), WHITE);
  part(body, B(W + 0.04, 1.41, 1.46, L - 0.08), BRASS);
  part(body, B(W + 0.04, 0.86, 0.90, L - 0.08), BRASS);

  const cabL = 4.2;
  part(body, B(2.30, 1.44, 2.95, cabL), CREAM);
  part(body, B(2.34, 1.82, 2.62, cabL - 0.28), GLASS);
  for (const z of [-1.85, -1.25, -0.62, 0, 0.62, 1.25, 1.85]) {
    part(body, B(2.36, 1.80, 2.64, 0.09, 0, z), CREAM);
  }
  for (const sz of [-1, 1]) {
    part(body, B(0.75, 1.44, 2.85, 0.08, 0, sz * (cabL * 0.5 + 0.02)), WOOD_MD);
    part(body, B(0.55, 1.85, 2.55, 0.10, 0, sz * (cabL * 0.5 + 0.02)), GLASS);
  }

  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = sx * 1.14;
      for (const z of [2.35, 3.25, 4.10]) {
        part(body, Cyl(0.032, 0.032, 1.55, 8, x, 2.18, sz * z), BRASS);
        part(body, Cyl(0.048, 0.048, 0.08, 8, x, 1.85, sz * z), BRASS);
      }
      part(body, B(0.42, 1.18, 1.26, 1.95, sx * 0.88, sz * 3.15), WOOD_MD);
      part(body, B(0.10, 1.26, 1.78, 1.95, sx * 0.68, sz * 3.15), WOOD_DK);
      part(body, B(0.08, 0.86, 1.18, 1.90, sx * 1.04, sz * 3.15), CREAM);
    }
    part(body, B(0.32, 0.86, 1.02, 0.65, 0, sz * 3.10), IRON);
    part(body, Cyl(0.025, 0.025, 0.95, 8, -0.06, 1.32, sz * 3.15, sz * 0.18, 0, 0), BRASS);
    part(body, Cyl(0.025, 0.025, 0.90, 8, 0.08, 1.30, sz * 3.05, sz * -0.14, 0, 0), STEEL);
    part(body, B(0.18, 1.72, 1.78, 0.06, -0.06, sz * 3.23), BRASS);

    part(accent, B(2.26, 0.86, 1.62, 0.10, 0, sz * 4.16), WHITE);
    part(body, B(2.30, 1.58, 1.65, 0.12, 0, sz * 4.16), BRASS);
    part(body, Cyl(0.20, 0.20, 0.14, 12, 0, 1.32, sz * 4.22, Math.PI / 2, 0, 0), BRASS);
    part(body, Cyl(0.16, 0.16, 0.16, 12, 0, 1.32, sz * 4.23, Math.PI / 2, 0, 0), HEADLIGHT);
    part(body, B(2.15, 0.62, 0.76, 0.16, 0, sz * 4.26), WOOD_DK);
    part(body, B(1.55, 2.66, 2.92, 0.07, 0, sz * 4.12), CREAM);
    part(accent, B(1.45, 2.70, 2.88, 0.08, 0, sz * 4.12), WHITE);
  }

  part(body, B(2.52, 2.94, 3.07, L - 0.1), CREAM);
  for (const sx of [-1, 1]) {
    part(body, B(0.06, 3.06, 3.24, 3.8, sx * 1.12, 0), CREAM);
    part(accent, B(0.07, 3.09, 3.21, 3.6, sx * 1.12, 0), WHITE);
  }
  part(body, B(1.42, 3.07, 3.36, 6.3), WOOD_DK);
  part(body, B(1.46, 3.12, 3.30, 5.9), GLASS);
  for (let z = -2.5; z <= 2.5; z += 0.625) {
    part(body, B(1.48, 3.10, 3.32, 0.06, 0, z), WOOD_MD);
  }
  part(body, B(1.54, 3.35, 3.43, 6.5), CREAM);
  for (const sz of [-1, 1]) {
    part(body, Cyl(0.08, 0.16, 0.20, 10, 0, 3.18, sz * 3.55), BRASS);
    part(body, Sph(0.08, 8, 6, 0, 3.28, sz * 3.55), BRASS);
  }

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.52, 0.10, 0.08] };
}

/**
 * Historic PCC Streetcar (Muni F-Market & Wharves heritage streetcar):
 * Streamlined rounded ends, upper standee oval windows, roof trolley pole, and classic trim.
 */
function pccStreetcar() {
  const body = [], accent = [];
  const L = 14.2, W = 2.58, y0 = 0.72, y1 = 3.20;
  bogies(body, L, W, { wheelR: 0.36, axleSpan: 1.55 });
  const bodyLen = L - 2.2;

  part(accent, B(W, y0, 1.82, bodyLen), WHITE);
  part(body, B(W - 0.01, 1.82, y1, bodyLen), CREAM);
  for (const sz of [-1, 1]) {
    const zc = sz * (bodyLen * 0.5);
    part(accent, Cyl(W * 0.5, W * 0.5, 1.10, 16, 0, (y0 + 1.82) * 0.5, zc, 0, 0, 0, 1, 1, 0.86), WHITE);
    part(body, Cyl(W * 0.495, W * 0.495, y1 - 1.82, 16, 0, (1.82 + y1) * 0.5, zc, 0, 0, 0, 1, 1, 0.86), CREAM);
    part(body, Cyl(W * 0.498, W * 0.498, 0.74, 16, 0, 2.25, zc + sz * 0.04, 0, 0, 0, 1, 1, 0.86), GLASS);
    part(body, Sph(W * 0.48, 14, 10, 0, y1, zc, 1.0, 0.42, 0.85), CREAM);
    part(body, Cyl(W * 0.505, W * 0.505, 0.14, 16, 0, y0 + 0.12, zc + sz * 0.04, 0, 0, 0, 1, 1, 0.86), CHROME);
    part(body, Cyl(0.19, 0.19, 0.12, 12, 0, 1.38, zc + sz * 1.08, Math.PI / 2, 0, 0), CHROME);
    part(body, Cyl(0.15, 0.15, 0.14, 12, 0, 1.38, zc + sz * 1.09, Math.PI / 2, 0, 0), HEADLIGHT);
    part(body, B(W * 0.75, 1.76, 1.84, 0.08, 0, zc + sz * 1.05), CHROME);
    part(body, B(1.05, 2.74, 2.94, 0.08, 0, zc + sz * 0.96), DARK);
    part(body, B(0.95, 2.77, 2.91, 0.09, 0, zc + sz * 0.97), LED_AMBER);
  }
  part(body, B(W + 0.03, 1.79, 1.85, bodyLen), CHROME);
  part(body, B(W + 0.03, 0.96, 1.02, bodyLen), CHROME);
  part(body, B(W + 0.02, 1.90, 2.54, bodyLen - 0.6), GLASS);
  for (let z = -bodyLen * 0.44; z <= bodyLen * 0.44; z += 0.92) {
    part(body, B(W + 0.03, 1.88, 2.92, 0.09, 0, z), CREAM);
    part(body, B(W + 0.025, 2.64, 2.86, 0.58, 0, z + 0.46), GLASS);
  }
  sideDoors(body, accent, W, y0, 2.65, L, 2, 1.25);
  part(body, Cyl(W * 0.48, W * 0.48, bodyLen, 14, 0, y1, 0, Math.PI / 2, 0, 0, 1, 1, 0.42), CREAM);
  part(body, B(0.65, y1 + 0.16, y1 + 0.28, 1.2, 0, -L * 0.12), STEEL);
  const poleG = new THREE.CylinderGeometry(0.03, 0.04, 6.2, 8);
  poleG.computeVertexNormals();
  body.push([poleG, STEEL, M(0, y1 + 1.38, -L * 0.16, 1.15, 0, 0)]);

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.25, 0.48, 0.30] };
}

/**
 * Modern Light Rail Vehicle (LRV — Muni Metro Siemens S200 / Modern Streetcar)
 * & Low-Floor City Tram (`tram`).
 */
function modernTram({ L, W, y0, y1, bodyRgb, stripe, accentRgb, lowFloor = false }) {
  const body = [], accent = [];
  bogies(body, L, W, { wheelR: lowFloor ? 0.32 : 0.38, openUnder: lowFloor });
  const noseLen = 1.35;
  const coreL = L - noseLen * 2;

  part(body, B(W, y0, y1, coreL), bodyRgb);
  const winY0 = lowFloor ? 1.18 : 1.75;
  const winY1 = 2.86;
  part(body, B(W + 0.02, winY0, winY1, coreL - 0.3), GLASS);
  for (let z = -coreL * 0.42; z <= coreL * 0.42; z += 1.45) {
    part(body, B(W + 0.03, winY0 - 0.02, winY1 + 0.02, 0.10, 0, z), DARK);
  }
  windowFrameMullions(body, W, winY0, winY1, coreL - 0.3, 1.45, SILVER);
  if (stripe) {
    part(accent, B(W + 0.035, stripe[0], stripe[1], coreL), WHITE);
    part(accent, B(W + 0.03, y1 - 0.24, y1 - 0.06, coreL), WHITE);
  }
  sideDoors(body, accent, W, y0, y1, coreL, lowFloor ? 3 : 2, 1.30);

  for (const sz of [-1, 1]) {
    const zBase = sz * (coreL * 0.5);
    const nose = makeNoseGeometry(W, y0, y1, noseLen, sz, false);
    nose.translate(0, 0, zBase);
    part(body, [nose, null], bodyRgb);
    part(body, B(W * 0.84, winY0 + 0.1, y1 - 0.28, 0.75, 0, zBase + sz * (noseLen * 0.48), sz * -0.36, 0, 0), CAB_GLASS);
    part(accent, B(W * 0.88, y0 + 0.18, y0 + 0.48, 0.65, 0, zBase + sz * (noseLen * 0.58)), WHITE);
  }
  endDetails(body, W * 0.90, y0, y1, L * 0.5 - 0.12, false, true);
  roofCorrugation(body, W, y1, coreL, 5, true);
  pantograph(body, L * 0.18, y1 + 0.14, 5.55, false);

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb };
}

/**
 * Rapid Transit Subway / BART / Metro Car:
 * Corrugated stainless-steel roof & side fluting ribs, destination LED boards,
 * headlights/taillights, inter-car gangway bellows, and third-rail bogie trucks.
 */
function rapidTransitCar({ L, W, y0, y1, bodyRgb, stripe, accentRgb, slantedNose = false }) {
  const body = [], accent = [];
  bogies(body, L, W, { wheelR: 0.42, thirdRail: true });
  const noseLen = slantedNose ? 1.45 : 0.45;
  const coreL = L - noseLen * 2;

  part(body, B(W, y0, y1, coreL), bodyRgb);
  for (let y = y0 + 0.16; y < 1.45; y += 0.14) {
    part(body, B(W + 0.025, y, y + 0.04, coreL - 0.2), SILVER);
  }
  part(body, B(W + 0.02, 1.92, 2.96, coreL - 0.8), GLASS);
  for (let z = -coreL * 0.44; z <= coreL * 0.44; z += 1.65) {
    part(body, B(W + 0.03, 1.90, 2.98, 0.14, 0, z), bodyRgb);
  }
  windowFrameMullions(body, W, 1.92, 2.96, coreL - 0.8, 1.65, SILVER);
  if (stripe) {
    part(accent, B(W + 0.04, stripe[0], stripe[1], coreL), WHITE);
  }
  sideDoors(body, accent, W, y0, y1, coreL, 3, 1.38);

  if (slantedNose) {
    for (const sz of [-1, 1]) {
      const zBase = sz * (coreL * 0.5);
      const nose = makeNoseGeometry(W, y0, y1, noseLen, sz, false);
      nose.translate(0, 0, zBase);
      part(body, [nose, null], bodyRgb);
      part(body, B(W * 0.82, 1.95, 3.05, 0.65, 0, zBase + sz * (noseLen * 0.45), sz * -0.32, 0, 0), CAB_GLASS);
      part(accent, B(W * 0.86, stripe[0], stripe[1], 0.85, 0, zBase + sz * (noseLen * 0.42)), WHITE);
    }
  } else {
    for (const sz of [-1, 1]) {
      const zBase = sz * (coreL * 0.5 + noseLen * 0.5);
      part(body, B(W * 0.96, y0, y1, noseLen, 0, zBase), bodyRgb);
      part(body, B(W * 0.86, 1.95, 3.02, 0.08, 0, sz * (L * 0.5 + 0.01)), CAB_GLASS);
    }
  }

  roofCorrugation(body, W, y1, coreL, 7, !slantedNose);
  endDetails(body, W, y0, y1, L * 0.5, true, true);

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb };
}

/**
 * Bi-Level Commuter / High-Speed Regional Train (Caltrain Stadler KISS / Gallery Car):
 * Smooth streamlined cab nose, upper & lower passenger window decks, roof pantograph with insulators,
 * and heavy bolster bogies.
 */
function commuterCar() {
  const body = [], accent = [];
  const L = 25.0, W = 3.10, y0 = 0.96, y1 = 4.78;
  bogies(body, L, W, { wheelR: 0.45, axleSpan: 2.1 });
  const noseLen = 2.1;
  const coreL = L - noseLen * 2;

  part(body, B(W, y0, y1, coreL), [0.84, 0.85, 0.87]);
  for (const [b0, b1] of [[1.78, 2.56], [3.36, 4.14]]) {
    part(body, B(W + 0.025, b0, b1, coreL - 1.2), GLASS);
    for (let z = -coreL * 0.42; z <= coreL * 0.42; z += 1.65) {
      part(body, B(W + 0.035, b0 - 0.02, b1 + 0.02, 0.14, 0, z), [0.84, 0.85, 0.87]);
    }
    windowFrameMullions(body, W, b0, b1, coreL - 1.2, 1.65, SILVER);
  }
  part(accent, B(W + 0.045, 1.18, 1.52, coreL), WHITE);
  part(accent, B(W + 0.04, 2.82, 3.06, coreL), WHITE);
  sideDoors(body, accent, W, y0, 3.15, coreL, 2, 1.48);

  for (const sz of [-1, 1]) {
    const zBase = sz * (coreL * 0.5);
    const nose = makeNoseGeometry(W, y0, y1, noseLen, sz, false);
    nose.translate(0, 0, zBase);
    part(body, [nose, null], [0.84, 0.85, 0.87]);
    part(body, B(W * 0.80, 2.35, 3.55, 0.95, 0, zBase + sz * (noseLen * 0.48), sz * -0.42, 0, 0), CAB_GLASS);
    part(accent, B(W * 0.86, 1.18, 1.62, 1.25, 0, zBase + sz * (noseLen * 0.46)), WHITE);
  }

  roofCorrugation(body, W * 0.92, y1, coreL, 7, true);
  pantograph(body, coreL * 0.28, y1 + 0.14, 5.75, true);
  endDetails(body, W * 0.88, y0, 3.8, L * 0.5 - 0.15, true, true);

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.82, 0.12, 0.12] };
}

/**
 * High-Speed Rail (HSR — Shinkansen / Fuxing CR400 Bullet Train):
 * Smooth aerodynamic duck-bill nose cone, flush dark cockpit glass, continuous body stripe,
 * recessed sliding doors, roof-mounted pantograph with noise shrouds & insulator bushings, and skirted bogies.
 */
function hsrTrain() {
  const body = [], accent = [];
  const L = 25.5, W = 3.25, y0 = 0.85, y1 = 3.85;
  bogies(body, L, W, { wheelR: 0.44, axleSpan: 2.3 });
  const noseLen = 5.2;
  const coreL = L - noseLen * 2;

  part(body, B(W, y0, y1, coreL), [0.95, 0.96, 0.98]);
  part(body, B(W - 0.06, 0.48, y0, coreL), [0.78, 0.80, 0.83]);
  part(accent, B(W + 0.04, 1.62, 1.92, coreL), WHITE);
  part(accent, B(W + 0.03, 3.45, 3.62, coreL), WHITE);
  part(body, B(W + 0.02, 2.15, 2.82, coreL - 1.6), CAB_GLASS);
  for (let z = -coreL * 0.42; z <= coreL * 0.42; z += 1.25) {
    part(body, B(W + 0.03, 2.12, 2.85, 0.28, 0, z), [0.95, 0.96, 0.98]);
  }
  windowFrameMullions(body, W, 2.15, 2.82, coreL - 1.6, 1.25, SILVER);
  endDetails(body, W * 0.65, y0, 2.2, L * 0.5 - 0.25, false, false);
  sideDoors(body, accent, W, y0, 3.35, coreL, 2, 1.10);

  for (const sz of [-1, 1]) {
    const zBase = sz * (coreL * 0.5);
    const nose = makeNoseGeometry(W, y0, y1, noseLen, sz, true);
    nose.translate(0, 0, zBase);
    part(body, [nose, null], [0.95, 0.96, 0.98]);
    const canopy = makeNoseGeometry(W * 0.84, y0 + 1.15, y1 + 0.04, noseLen * 0.62, sz, true);
    canopy.translate(0, 0, zBase + sz * 0.35);
    part(body, [canopy, null], CAB_GLASS);
    part(accent, B(W * 0.82, 1.52, 1.85, noseLen * 0.65, 0, zBase + sz * (noseLen * 0.34)), WHITE);
    for (const sx of [-1, 1]) {
      part(body, Sph(0.16, 10, 8, sx * W * 0.28, 1.48, zBase + sz * (noseLen * 0.72), 1.2, 0.5, 1.8), HEADLIGHT);
    }
  }
  roofCorrugation(body, W * 0.86, y1, coreL, 5, false);
  pantograph(body, coreL * 0.25, y1 + 0.14, 5.45, true);

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.12, 0.38, 0.82] };
}

/**
 * Heavy Freight Locomotive:
 * Stepped hood, angled cab windows, radiator grilles, exhaust stack, fuel tank, and 3-axle bolster trucks.
 */
function freightLocomotive() {
  const body = [], accent = [];
  const L = 20.5, W = 3.05, y0 = 1.05;
  bogies(body, L, W, { wheelR: 0.48, axleSpan: 2.4, offRatio: 0.33 });
  part(body, B(W, y0, 1.38, L), DARK);
  part(body, Cyl(0.62, 0.62, 6.2, 12, 0, 0.82, 0, Math.PI / 2, 0, 0, 1.4, 1, 0.85), DARK);
  part(accent, B(W * 0.78, 1.38, 3.15, 3.2, 0, 7.6), WHITE);
  part(accent, B(W * 0.96, 1.38, 4.45, 3.6, 0, 4.2), WHITE);
  part(body, B(W * 0.98, 3.25, 4.15, 3.2, 0, 4.2), CAB_GLASS);
  part(body, B(W * 0.88, 3.25, 4.15, 0.12, 0, 6.02, -0.18, 0, 0), CAB_GLASS);
  part(accent, B(W * 0.76, 1.38, 4.25, 11.4, 0, -3.3), WHITE);
  part(body, B(W * 0.78, 3.55, 4.22, 4.2, 0, -6.2), IRON);
  part(body, B(W * 0.84, 3.75, 4.28, 3.2, 0, 0.4), STEEL);
  part(body, Cyl(0.24, 0.28, 0.38, 10, 0, 4.42, 1.2), DARK);
  for (const z of [-4.8, -6.2, -7.6]) {
    part(body, Cyl(0.58, 0.58, 0.16, 12, 0, 4.32, z), IRON);
  }
  for (const sx of [-1, 1]) {
    part(body, B(0.05, 2.28, 2.34, 12.2, sx * (W * 0.47), -2.8), HEADLIGHT);
  }
  endDetails(body, W, y0, 4.3, L * 0.5, false, false);
  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.88, 0.42, 0.08] };
}

/** Mountain Funicular Car: stepped incline car with panoramic glass & roof collector. */
function funicularCar() {
  const body = [], accent = [];
  const L = 11.0, W = 2.45, y0 = 0.62, y1 = 3.25;
  bogies(body, L, W, { wheelR: 0.36, axleSpan: 1.4 });
  part(accent, B(W, y0, 1.62, L), WHITE);
  part(body, B(W - 0.02, 1.62, y1, L), [0.92, 0.93, 0.95]);
  part(body, B(W + 0.02, 1.68, 2.88, L - 0.7), GLASS);
  for (let z = -L * 0.38; z <= L * 0.38; z += 1.55) {
    part(body, B(W + 0.03, 1.66, 2.90, 0.10, 0, z), [0.92, 0.93, 0.95]);
  }
  windowFrameMullions(body, W, 1.68, 2.88, L - 0.7, 1.55, CHROME);
  for (const sz of [-1, 1]) {
    part(body, B(W * 0.88, 1.68, 2.88, 0.08, 0, sz * (L * 0.5 + 0.01)), CAB_GLASS);
  }
  part(body, B(W + 0.04, 1.58, 1.66, L + 0.04), CHROME);
  sideDoors(body, accent, W, y0, 2.88, L, 2, 1.18);
  roofCorrugation(body, W, y1, L, 5, false);
  endDetails(body, W, y0, y1, L * 0.5, false, true);
  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.76, 0.20, 0.15] };
}

/**
 * Aerial Gondola / Chairlift Cabin:
 * Rounded panoramic 8-passenger glass cabin with exterior ski/snowboard racks,
 * curved tubular suspension hanger arm, and overhead cable grip clamp with guide rollers!
 */
function gondolaCabin() {
  const body = [], accent = [];
  const L = 2.25, W = 2.05;

  part(body, B(0.32, -0.18, 0.22, 1.15, 0, 0), STEEL);
  part(body, B(0.46, 0.04, 0.28, 0.52, 0, 0), IRON);
  for (const z of [-0.42, -0.16, 0.16, 0.42]) {
    part(body, Cyl(0.14, 0.14, 0.10, 10, 0, 0.12, z, 0, 0, Math.PI / 2), DARK);
    part(body, Cyl(0.08, 0.08, 0.14, 8, 0, 0.12, z, 0, 0, Math.PI / 2), CHROME);
  }

  part(body, Cyl(0.055, 0.055, 0.45, 8, 0, -0.36, 0, 0, 0, 0.32), STEEL);
  part(body, Cyl(0.055, 0.055, 0.65, 8, 0.14, -0.82, 0, 0, 0, 0), STEEL);
  part(body, Cyl(0.055, 0.055, 0.42, 8, 0.07, -1.24, 0, 0, 0, -0.35), STEEL);
  part(body, Cyl(0.36, 0.48, 0.16, 12, 0, -1.36, 0), ROOF_GREY);

  part(body, Cyl(W * 0.52, W * 0.56, 0.22, 16, 0, -1.52, 0, 0, 0, 0, 1, 1, L / W), SILVER);
  part(accent, Cyl(W * 0.56, W * 0.52, 0.85, 16, 0, -3.12, 0, 0, 0, 0, 1, 1, L / W), WHITE);
  part(body, Cyl(W * 0.53, W * 0.46, 0.18, 16, 0, -3.58, 0, 0, 0, 0, 1, 1, L / W), DARK);

  part(body, Cyl(W * 0.555, W * 0.555, 1.12, 16, 0, -2.16, 0, 0, 0, 0, 1, 1, L / W), GLASS);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * (W * 0.54), pz = Math.sin(a) * (L * 0.54);
    part(body, Cyl(0.035, 0.035, 1.18, 6, px, -2.16, pz), DARK);
  }
  for (const sz of [-0.62, 0.62]) {
    part(body, B(W * 0.72, -2.85, -2.68, 0.36, 0, sz), DARK);
  }
  for (const sx of [-1, 1]) {
    const rx = sx * (W * 0.57);
    for (const rz of [-0.36, 0.36]) {
      part(body, B(0.14, -3.38, -2.45, 0.26, rx, rz), CHROME);
      part(body, B(0.16, -3.40, -3.28, 0.30, rx, rz), DARK);
      part(body, B(0.03, -3.32, -1.85, 0.12, rx + sx * 0.04, rz, 0.06, 0, 0), [0.15, 0.55, 0.85]);
    }
  }

  return { body: merge(body), accent: merge(accent), len: L, wid: W, accentRgb: [0.82, 0.15, 0.12] };
}

let cache = null;
/** Lazily built model catalogue (shared across teleports). */
export function getRailModels() {
  if (cache) return cache;
  const hsr = hsrTrain();
  const metro = rapidTransitCar({
    L: 19.0, W: 3.0, y0: 0.95, y1: 3.60,
    bodyRgb: [0.80, 0.82, 0.85], stripe: [1.40, 1.68],
    accentRgb: [0.15, 0.35, 0.75], slantedNose: false,
  });
  cache = {
    cable_car: cableCar(),
    lrv: modernTram({
      L: 11.6, W: 2.65, y0: 0.75, y1: 3.35,
      bodyRgb: [0.80, 0.82, 0.84], stripe: [1.22, 1.52],
      accentRgb: [0.78, 0.12, 0.12], lowFloor: false,
    }),
    pcc: pccStreetcar(),
    tram: modernTram({
      L: 10.2, W: 2.55, y0: 0.36, y1: 3.30,
      bodyRgb: [0.93, 0.94, 0.95], stripe: [0.42, 0.88],
      accentRgb: [0.85, 0.15, 0.15], lowFloor: true,
    }),
    bart: rapidTransitCar({
      L: 21.3, W: 3.20, y0: 0.95, y1: 3.45,
      bodyRgb: [0.86, 0.88, 0.90], stripe: [1.52, 1.78],
      accentRgb: [0.0, 0.60, 0.82], slantedNose: true,
    }),
    metro,
    subway: metro,
    commuter: commuterCar(),
    hsr,
    shinkansen: hsr,
    fuxing: hsr,
    freight: freightLocomotive(),
    funicular: funicularCar(),
    gondola: gondolaCabin(),
  };
  return cache;
}
