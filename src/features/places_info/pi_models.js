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
function matScale(tx, ty, tz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  E.set(rx, ry, rz);
  Q.setFromEuler(E);
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), Q.clone(), new THREE.Vector3(sx, sy, sz));
}
function merge(parts) {
  const pos = [], nrm = [], col = [];
  for (const [geom, rgb, m] of parts) {
    if (m) geom.applyMatrix4(m);
    geom.computeVertexNormals();
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
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
const cyl = (rt, rb, h, seg = 14) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.computeVertexNormals();
  return g;
};
const sph = (r, ws = 14, hs = 10) => {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.computeVertexNormals();
  return g;
};
const cone = (r, h, seg = 14) => {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.computeVertexNormals();
  return g;
};
const torus = (r, tube, rs = 10, ts = 18, arc = Math.PI * 2) => {
  const g = new THREE.TorusGeometry(r, tube, rs, ts, arc);
  g.computeVertexNormals();
  return g;
};
function prism(w, h, d) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
  g.computeVertexNormals();
  return g;
}

const WHITE = [1, 1, 1];
const STEEL = [0.62, 0.64, 0.67];
const CHROME = [0.84, 0.87, 0.91];
const DARK = [0.13, 0.14, 0.16];
const GLASS = [0.2, 0.24, 0.28];
const TIRE = [0.07, 0.07, 0.08];
const GOLD = [0.86, 0.72, 0.24];
const BRASS = [0.76, 0.62, 0.28];

function wheels(parts, xs, zs, r = 0.33) {
  const w = r > 0.4 ? 0.3 : 0.25;
  for (const x of xs) {
    const sx = x >= 0 ? 1 : -1;
    for (const z of zs) {
      // Sculpted rubber tire
      parts.push([cyl(r, r, w, 16), TIRE, mat(x, r, z, 0, 0, Math.PI / 2)]);
      // Wheel arch flare lip
      parts.push([torus(r * 1.07, 0.032, 8, 14, Math.PI), DARK, mat(x + sx * (w * 0.32), r, z, 0, Math.PI / 2, 0)]);
      // Silver alloy rim + recessed brake rotor + hub cap
      parts.push([cyl(r * 0.66, r * 0.66, w + 0.015, 14), CHROME, mat(x, r, z, 0, 0, Math.PI / 2)]);
      parts.push([cyl(r * 0.48, r * 0.48, w + 0.008, 12), [0.36, 0.38, 0.42], mat(x, r, z, 0, 0, Math.PI / 2)]);
      parts.push([cyl(r * 0.19, r * 0.19, w + 0.03, 10), STEEL, mat(x, r, z, 0, 0, Math.PI / 2)]);
      // 5 alloy spokes on outer face
      const faceX = x + sx * (w * 0.5 + 0.008);
      for (let s = 0; s < 5; s++) {
        const a = (s * Math.PI * 2) / 5;
        parts.push([box(0.018, r * 0.56, 0.042), CHROME, mat(faceX, r + Math.cos(a) * r * 0.28, z + Math.sin(a) * r * 0.28, a, 0, 0)]);
      }
    }
  }
}

function sedan(body, extra = [], hasSunroof = true) {
  const p = [
    // Chassis undertray & rocker sills
    [box(1.74, 0.14, 4.32), DARK, mat(0, 0.28, 0)],
    // Sculpted lower body shell + front hood slope + rear trunk deck
    [box(1.8, 0.54, 4.46), body, mat(0, 0.58, 0)],
    [box(1.72, 0.16, 1.32), body, mat(0, 0.86, 1.48, 0.09, 0, 0)],
    [box(1.72, 0.14, 0.96), body, mat(0, 0.87, -1.66, -0.06, 0, 0)],
    // Front & rear bumpers with lower aero splitter / diffuser
    [box(1.84, 0.26, 0.24), body, mat(0, 0.43, 2.2)],
    [box(1.82, 0.07, 0.22), DARK, mat(0, 0.27, 2.24)],
    [box(1.84, 0.28, 0.24), body, mat(0, 0.45, -2.2)],
    [box(1.78, 0.09, 0.2), DARK, mat(0, 0.28, -2.22)],
    // Recessed radiator grille + chrome crossbar + badge
    [box(1.06, 0.22, 0.06), DARK, mat(0, 0.62, 2.24)],
    [box(1.02, 0.035, 0.07), CHROME, mat(0, 0.66, 2.25)],
    [box(1.02, 0.035, 0.07), CHROME, mat(0, 0.58, 2.25)],
    [cyl(0.055, 0.055, 0.04, 10), CHROME, mat(0, 0.62, 2.27, Math.PI / 2, 0, 0)],
    // Greenhouse cabin + sloped windshield + sloped rear backlight + roof panel
    [box(1.56, 0.5, 1.85), GLASS, mat(0, 1.18, -0.22)],
    [box(1.52, 0.56, 0.08), GLASS, mat(0, 1.15, 0.78, -0.58, 0, 0)],
    [box(1.5, 0.54, 0.08), GLASS, mat(0, 1.15, -1.22, 0.56, 0, 0)],
    [box(1.54, 0.09, 1.78), body, mat(0, 1.46, -0.22)],
    // A, B, C pillars
    [box(0.06, 0.58, 0.07), body, mat(-0.76, 1.16, 0.76, -0.58, 0, -0.08)],
    [box(0.06, 0.58, 0.07), body, mat(0.76, 1.16, 0.76, -0.58, 0, 0.08)],
    [box(0.06, 0.52, 0.09), DARK, mat(-0.785, 1.18, -0.18)],
    [box(0.06, 0.52, 0.09), DARK, mat(0.785, 1.18, -0.18)],
    [box(0.07, 0.56, 0.1), body, mat(-0.75, 1.16, -1.2, 0.56, 0, 0.08)],
    [box(0.07, 0.56, 0.1), body, mat(0.75, 1.16, -1.2, 0.56, 0, -0.08)],
    // Side-view mirrors + door handles + side rub strips
    [box(0.18, 0.1, 0.12), body, mat(-0.95, 0.96, 0.58)],
    [box(0.18, 0.1, 0.12), body, mat(0.95, 0.96, 0.58)],
    [box(0.14, 0.08, 0.02), GLASS, mat(-0.96, 0.96, 0.52)],
    [box(0.14, 0.08, 0.02), GLASS, mat(0.96, 0.96, 0.52)],
    [box(0.03, 0.04, 0.16), CHROME, mat(-0.91, 0.82, 0.1)],
    [box(0.03, 0.04, 0.16), CHROME, mat(0.91, 0.82, 0.1)],
    [box(0.03, 0.04, 0.16), CHROME, mat(-0.91, 0.82, -0.68)],
    [box(0.03, 0.04, 0.16), CHROME, mat(0.91, 0.82, -0.68)],
    [box(0.025, 0.045, 2.55), DARK, mat(-0.905, 0.52, -0.05)],
    [box(0.025, 0.045, 2.55), DARK, mat(0.905, 0.52, -0.05)],
    // Headlights + amber corner indicators
    [box(0.32, 0.13, 0.06), [1.65, 1.6, 1.35], mat(-0.62, 0.7, 2.24)],
    [box(0.32, 0.13, 0.06), [1.65, 1.6, 1.35], mat(0.62, 0.7, 2.24)],
    [box(0.1, 0.12, 0.06), [1.4, 0.78, 0.1], mat(-0.82, 0.7, 2.22)],
    [box(0.1, 0.12, 0.06), [1.4, 0.78, 0.1], mat(0.82, 0.7, 2.22)],
    // Taillights + reverse lamps + high-mount brake light
    [box(0.36, 0.14, 0.06), [0.88, 0.06, 0.06], mat(-0.62, 0.74, -2.24)],
    [box(0.36, 0.14, 0.06), [0.88, 0.06, 0.06], mat(0.62, 0.74, -2.24)],
    [box(0.14, 0.06, 0.065), [0.95, 0.95, 0.95], mat(-0.56, 0.74, -2.245)],
    [box(0.14, 0.06, 0.065), [0.95, 0.95, 0.95], mat(0.56, 0.74, -2.245)],
    [box(0.42, 0.04, 0.05), [0.9, 0.08, 0.08], mat(0, 1.38, -1.08)],
    // License plates + dual chrome exhaust tips
    [box(0.42, 0.13, 0.03), [0.94, 0.95, 0.96], mat(0, 0.44, 2.32)],
    [box(0.42, 0.13, 0.03), [0.94, 0.95, 0.96], mat(0, 0.56, -2.31)],
    [cyl(0.042, 0.042, 0.22, 10), CHROME, mat(-0.52, 0.26, -2.28, Math.PI / 2, 0, 0)],
    [cyl(0.042, 0.042, 0.22, 10), CHROME, mat(0.52, 0.26, -2.28, Math.PI / 2, 0, 0)],
    ...extra,
  ];
  if (hasSunroof) {
    p.push([box(0.86, 0.03, 0.68), DARK, mat(0, 1.505, -0.02)]);
  }
  wheels(p, [-0.82, 0.82], [-1.45, 1.45]);
  return merge(p);
}

export function buildPiGeometries() {
  const G = {};

  // School: brick monument sign with stone pilasters, crest, ground uplights + flagpole with flying flag
  {
    const BRICK = [0.56, 0.28, 0.22];
    const STONE = [0.88, 0.85, 0.78];
    const NAVY = [0.11, 0.22, 0.48];
    const p = [
      // Stepped stone foundation & brick monument base
      [box(3.6, 0.18, 0.82), [0.68, 0.66, 0.62], mat(0, 0.09, 0)],
      [box(3.3, 0.44, 0.64), BRICK, mat(0, 0.4, 0)],
      // Left & right brick piers with stone caps
      [box(0.42, 1.18, 0.52), BRICK, mat(-1.42, 1.15, 0)],
      [box(0.42, 1.18, 0.52), BRICK, mat(1.42, 1.15, 0)],
      [box(0.52, 0.1, 0.6), STONE, mat(-1.42, 1.78, 0)],
      [box(0.52, 0.1, 0.6), STONE, mat(1.42, 1.78, 0)],
      [sph(0.14, 12, 10), STONE, mat(-1.42, 1.94, 0)],
      [sph(0.14, 12, 10), STONE, mat(1.42, 1.94, 0)],
      // Central stone tablet + pediment cornice
      [box(2.5, 1.06, 0.38), STONE, mat(0, 1.12, 0)],
      [box(3.1, 0.14, 0.54), [0.52, 0.52, 0.54], mat(0, 1.7, 0)],
      [prism(2.8, 0.28, 0.48), STONE, mat(0, 1.77, -0.24)],
      // Signboard face + gold lettering strips + school shield emblem
      [box(2.24, 0.68, 0.42), NAVY, mat(0, 1.12, 0)],
      [box(1.75, 0.11, 0.44), GOLD, mat(0, 1.26, 0)],
      [box(1.35, 0.07, 0.44), WHITE, mat(0, 1.06, 0)],
      [box(0.95, 0.06, 0.44), GOLD, mat(0, 0.9, 0)],
      [cyl(0.16, 0.16, 0.45, 12), GOLD, mat(0, 1.54, 0, Math.PI / 2, 0, 0)],
      // Ground landscape uplights
      [cyl(0.07, 0.08, 0.12, 10), DARK, mat(-0.9, 0.22, 0.34, -0.4, 0, 0)],
      [cyl(0.07, 0.08, 0.12, 10), DARK, mat(0.9, 0.22, 0.34, -0.4, 0, 0)],
      [sph(0.055, 8, 8), [1.6, 1.5, 1.1], mat(-0.9, 0.26, 0.32)],
      [sph(0.055, 8, 8), [1.6, 1.5, 1.1], mat(0.9, 0.26, 0.32)],
      // Tapered steel flagpole + pedestal + cleat + gold ball finial + detailed banner flag
      [cyl(0.24, 0.28, 0.36, 12), STONE, mat(2.4, 0.18, -0.7)],
      [cyl(0.045, 0.075, 8.2, 12), STEEL, mat(2.4, 4.2, -0.7)],
      [box(0.04, 0.18, 0.08), CHROME, mat(2.33, 1.4, -0.7)],
      [sph(0.11, 12, 10), GOLD, mat(2.4, 8.38, -0.7)],
      [box(1.52, 0.92, 0.03), [0.12, 0.25, 0.55], mat(3.18, 7.62, -0.7)],
      [box(1.52, 0.16, 0.036), [0.95, 0.95, 0.95], mat(3.18, 7.78, -0.7)],
      [box(1.52, 0.16, 0.036), GOLD, mat(3.18, 7.46, -0.7)],
      [cyl(0.18, 0.18, 0.04, 10), WHITE, mat(2.76, 7.62, -0.7, Math.PI / 2, 0, 0)],
    ];
    G.school = merge(p);
  }

  // University / college gateway (two rusticated stone pillars + wrought-iron side wings + lintel with crest & lanterns)
  {
    const STONE = [0.78, 0.74, 0.66];
    const TRIM = [0.66, 0.62, 0.55];
    const CRIMSON = [0.54, 0.1, 0.14];
    const p = [];
    for (const sx of [-1, 1]) {
      const x = sx * 3.7;
      // Stepped ashlar pillar base + shaft + rusticated bands + capital + lantern
      p.push([box(1.24, 0.38, 1.24), TRIM, mat(x, 0.19, 0)]);
      p.push([box(1.06, 0.32, 1.06), STONE, mat(x, 0.54, 0)]);
      p.push([box(0.9, 4.1, 0.9), STONE, mat(x, 2.45, 0)]);
      for (const y of [1.4, 2.4, 3.4]) {
        p.push([box(0.96, 0.14, 0.96), TRIM, mat(x, y, 0)]);
      }
      p.push([box(1.18, 0.28, 1.18), TRIM, mat(x, 4.54, 0)]);
      p.push([box(1.28, 0.14, 1.28), STONE, mat(x, 4.74, 0)]);
      // Classic iron & glowing globe finial lantern atop each gateway pier
      p.push([cyl(0.08, 0.14, 0.28, 10), DARK, mat(x, 4.94, 0)]);
      p.push([sph(0.22, 12, 10), [1.55, 1.48, 1.22], mat(x, 5.24, 0)]);
      p.push([cone(0.18, 0.18, 10), DARK, mat(x, 5.48, 0)]);
      // Ornamental wrought-iron side wing fence
      p.push([box(1.4, 0.42, 0.28), TRIM, mat(x + sx * 1.15, 0.21, 0)]);
      p.push([box(1.4, 0.06, 0.06), DARK, mat(x + sx * 1.15, 2.2, 0)]);
      p.push([box(1.4, 0.06, 0.06), DARK, mat(x + sx * 1.15, 0.55, 0)]);
      for (let i = 0; i < 5; i++) {
        const px = x + sx * (0.62 + i * 0.26);
        p.push([cyl(0.022, 0.022, 1.8, 8), DARK, mat(px, 1.35, 0)]);
        p.push([cone(0.04, 0.12, 8), GOLD, mat(px, 2.31, 0)]);
      }
    }
    // Overarching stone & wrought-iron lintel + crimson banner + central coat-of-arms crest
    p.push([box(6.8, 0.68, 0.62), [0.74, 0.7, 0.62], mat(0, 4.02, 0)]);
    p.push([box(7.0, 0.14, 0.74), TRIM, mat(0, 4.42, 0)]);
    p.push([box(4.2, 0.48, 0.68), CRIMSON, mat(0, 4.02, 0)]);
    p.push([box(2.5, 0.12, 0.7), GOLD, mat(0, 4.02, 0)]);
    // Central pediment arch & university shield crest
    p.push([prism(3.2, 0.55, 0.56), STONE, mat(0, 4.48, -0.28)]);
    p.push([cyl(0.38, 0.38, 0.74, 12), CRIMSON, mat(0, 4.35, 0, Math.PI / 2, 0, 0)]);
    p.push([cyl(0.3, 0.3, 0.76, 12), GOLD, mat(0, 4.35, 0, Math.PI / 2, 0, 0)]);
    G.campus = merge(p);
  }

  // Museum: classical portico (steps, cheek pedestals, six fluted columns, entablature, pediment, cella facade)
  {
    const STONE = [0.9, 0.88, 0.83];
    const TRIM = [0.78, 0.76, 0.72];
    const COL = [0.95, 0.93, 0.88];
    const BRONZE = [0.36, 0.28, 0.18];
    const p = [
      // 3-step grand podium + cheek blocks
      [box(12.2, 0.24, 4.1), TRIM, mat(0, 0.12, 2.0)],
      [box(11.7, 0.24, 3.6), [0.82, 0.8, 0.76], mat(0, 0.36, 1.75)],
      [box(11.2, 0.24, 3.2), [0.86, 0.84, 0.8], mat(0, 0.6, 1.55)],
      [box(0.9, 0.9, 1.1), TRIM, mat(-5.7, 0.45, 3.45)],
      [box(0.9, 0.9, 1.1), TRIM, mat(5.7, 0.45, 3.45)],
      [sph(0.28, 12, 10), BRONZE, mat(-5.7, 1.12, 3.45)],
      [sph(0.28, 12, 10), BRONZE, mat(5.7, 1.12, 3.45)],
      // Rear cella wall + grand bronze double entrance doors + transom fanlight + flanking exhibition banners
      [box(10.8, 6.4, 0.45), [0.84, 0.82, 0.77], mat(0, 3.9, 0.35)],
      [box(2.5, 3.9, 0.52), TRIM, mat(0, 2.65, 0.38)],
      [box(2.1, 3.6, 0.56), BRONZE, mat(0, 2.5, 0.4)],
      [box(0.06, 3.6, 0.6), GOLD, mat(0, 2.5, 0.4)],
      [cyl(1.05, 1.05, 0.56, 16), GLASS, mat(0, 4.35, 0.4, Math.PI / 2, 0, 0)],
      // Crimson & blue vertical exhibition banners hanging behind the colonnade
      [box(1.1, 3.6, 0.08), [0.62, 0.12, 0.16], mat(-3.0, 4.1, 0.62)],
      [box(1.1, 3.6, 0.08), [0.14, 0.28, 0.55], mat(3.0, 4.1, 0.62)],
      // Entablature: architrave, frieze with triglyphs, and cornice
      [box(11.6, 0.92, 3.0), STONE, mat(0, 7.45, 1.5)],
      [box(12.0, 0.2, 3.24), TRIM, mat(0, 7.98, 1.54)],
      // Triangular classical pediment + recessed tympanum + central relief medallion
      [prism(12.0, 1.75, 3.15), STONE, mat(0, 8.05, 0)],
      [prism(10.6, 1.35, 0.16), TRIM, mat(0, 8.15, 3.04)],
      [cyl(0.48, 0.48, 0.22, 14), GOLD, mat(0, 8.68, 3.12, Math.PI / 2, 0, 0)],
    ];
    for (let i = 0; i < 6; i++) {
      const cx = -5 + i * 2;
      // Plinth, molded torus base, tapered shaft, necking ring, echinus & abacus capital
      p.push([box(0.92, 0.22, 0.92), STONE, mat(cx, 0.78, 2.5)]);
      p.push([cyl(0.42, 0.44, 0.14, 14), COL, mat(cx, 0.96, 2.5)]);
      p.push([cyl(0.32, 0.38, 5.8, 16), COL, mat(cx, 3.9, 2.5)]);
      p.push([cyl(0.42, 0.33, 0.18, 14), COL, mat(cx, 6.86, 2.5)]);
      p.push([box(0.9, 0.2, 0.9), STONE, mat(cx, 7.02, 2.5)]);
    }
    for (let i = 0; i < 11; i++) {
      p.push([box(0.18, 0.42, 0.08), TRIM, mat(-5 + i * 1.0, 7.52, 3.02)]);
    }
    G.museum = merge(p);
  }

  // Museum stele monument sign
  G.museumSign = merge([
    [box(3.5, 0.22, 0.85), [0.66, 0.64, 0.6], mat(0, 0.11, 0)],
    [box(3.2, 0.26, 0.7), [0.74, 0.72, 0.68], mat(0, 0.35, 0)],
    [box(3.0, 1.15, 0.5), [0.86, 0.84, 0.79], mat(0, 1.02, 0)],
    [cyl(0.12, 0.14, 1.15, 12), [0.92, 0.9, 0.85], mat(-1.38, 1.02, 0.2)],
    [cyl(0.12, 0.14, 1.15, 12), [0.92, 0.9, 0.85], mat(1.38, 1.02, 0.2)],
    [box(2.35, 0.52, 0.54), [0.2, 0.19, 0.18], mat(0, 1.08, 0)],
    [box(1.9, 0.1, 0.56), GOLD, mat(0, 1.18, 0)],
    [box(1.4, 0.07, 0.56), WHITE, mat(0, 0.96, 0)],
    [box(3.24, 0.12, 0.62), [0.78, 0.76, 0.72], mat(0, 1.64, 0)],
    [prism(3.24, 0.38, 0.58), [0.82, 0.8, 0.75], mat(0, 1.7, -0.29)],
  ]);

  // Stadium floodlight mast (28 m) with concrete pier, stiffener rings, catwalk & lamp bank facing +Z
  {
    const p = [
      // Concrete foundation pedestal + base flange
      [cyl(0.62, 0.72, 1.2, 12), [0.55, 0.56, 0.58], mat(0, 0.6, 0)],
      [cyl(0.54, 0.54, 0.16, 12), DARK, mat(0, 1.28, 0)],
      // Tapered steel mast shaft + flange rings
      [cyl(0.22, 0.45, 28, 14), STEEL, mat(0, 14.5, 0)],
      [cyl(0.42, 0.42, 0.14, 12), DARK, mat(0, 8, 0)],
      [cyl(0.36, 0.36, 0.14, 12), DARK, mat(0, 15, 0)],
      [cyl(0.3, 0.3, 0.14, 12), DARK, mat(0, 22, 0)],
      // Maintenance catwalk deck + safety handrail under headframe
      [box(4.6, 0.12, 1.1), DARK, mat(0, 26.8, -0.1)],
      [box(4.6, 0.05, 0.05), STEEL, mat(0, 27.6, -0.62)],
      [box(0.06, 0.8, 0.06), STEEL, mat(-2.25, 27.2, -0.62)],
      [box(0.06, 0.8, 0.06), STEEL, mat(2.25, 27.2, -0.62)],
      [box(0.06, 0.8, 0.06), STEEL, mat(0, 27.2, -0.62)],
      // Tilted structural headframe + 3x5 high-output LED floodlight units
      [box(4.3, 2.7, 0.32), [0.28, 0.3, 0.33], mat(0, 28.6, 0.25, -0.35, 0, 0)],
      [box(4.5, 0.12, 0.18), STEEL, mat(0, 27.85, 0.3, -0.35, 0, 0)],
      [box(4.5, 0.12, 0.18), STEEL, mat(0, 29.4, 0.84, -0.35, 0, 0)],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const lx = -1.6 + c * 0.8;
        const ly = 27.85 + r * 0.78;
        const lz = 0.45 + r * 0.27;
        p.push([box(0.68, 0.6, 0.14), DARK, mat(lx, ly, lz - 0.04, -0.35, 0, 0)]);
        p.push([box(0.62, 0.54, 0.08), [1.95, 1.92, 1.78], mat(lx, ly, lz, -0.35, 0, 0)]);
      }
    }
    G.mast = merge(p);
  }

  // Police: classic precinct blue lantern on fluted post + directional sign
  G.policeSign = merge([
    [cyl(0.18, 0.22, 0.35, 12), [0.2, 0.21, 0.23], mat(0, 0.175, 0)],
    [cyl(0.11, 0.15, 0.45, 12), [0.24, 0.25, 0.28], mat(0, 0.55, 0)],
    [cyl(0.055, 0.075, 3.2, 12), [0.25, 0.26, 0.28], mat(0, 1.7, 0)],
    [torus(0.085, 0.02, 8, 12), GOLD, mat(0, 2.75, 0, Math.PI / 2, 0, 0)],
    [box(1.18, 0.07, 0.07), [0.22, 0.23, 0.25], mat(0, 2.95, 0)],
    // Precinct sign box + glowing letters + top cupola + twin blue beacon globes
    [box(1.04, 0.56, 0.3), [0.09, 0.24, 0.74], mat(0, 3.32, 0)],
    [box(0.84, 0.18, 0.33), [1.75, 1.75, 1.78], mat(0, 3.34, 0)],
    [box(0.56, 0.07, 0.33), GOLD, mat(0, 3.14, 0)],
    [box(1.12, 0.07, 0.36), [0.18, 0.19, 0.21], mat(0, 3.63, 0)],
    [prism(1.12, 0.18, 0.36), [0.22, 0.23, 0.26], mat(0, 3.66, -0.18)],
    [sph(0.11, 10, 8), [0.25, 0.55, 1.65], mat(-0.48, 3.08, 0)],
    [sph(0.11, 10, 8), [0.25, 0.55, 1.65], mat(0.48, 3.08, 0)],
  ]);

  // Police interceptor cruiser (front +Z) with push bar, V-lightbar, A-pillar spotlight & shield decals
  G.policeCar = sedan(
    [0.95, 0.95, 0.96],
    [
      // Black interceptor front & rear wraps
      [box(1.82, 0.56, 1.28), [0.08, 0.08, 0.09], mat(0, 0.59, 1.62)],
      [box(1.82, 0.56, 1.05), [0.08, 0.08, 0.09], mat(0, 0.59, -1.74)],
      // Gold shield door emblems
      [cyl(0.14, 0.14, 0.02, 8), GOLD, mat(-0.91, 0.66, 0.18, 0, 0, Math.PI / 2)],
      [cyl(0.14, 0.14, 0.02, 8), GOLD, mat(0.91, 0.66, 0.18, 0, 0, Math.PI / 2)],
      // Heavy tubular front push-bumper (bullbar)
      [box(0.06, 0.44, 0.12), DARK, mat(-0.34, 0.52, 2.35)],
      [box(0.06, 0.44, 0.12), DARK, mat(0.34, 0.52, 2.35)],
      [cyl(0.028, 0.028, 0.82, 8), DARK, mat(0, 0.64, 2.38, 0, 0, Math.PI / 2)],
      [cyl(0.028, 0.028, 0.82, 8), DARK, mat(0, 0.42, 2.38, 0, 0, Math.PI / 2)],
      // Rooftop police lightbar on mounting feet (red left, white center takedown, blue right)
      [box(1.16, 0.05, 0.22), DARK, mat(0, 1.53, -0.2)],
      [box(0.48, 0.11, 0.26), [1.55, 0.1, 0.1], mat(-0.34, 1.6, -0.2)],
      [box(0.18, 0.11, 0.28), [1.7, 1.7, 1.7], mat(0, 1.6, -0.2)],
      [box(0.48, 0.11, 0.26), [0.1, 0.3, 1.65], mat(0.34, 1.6, -0.2)],
      // A-pillar searchlight + trunk communications antennas
      [sph(0.075, 8, 8), CHROME, mat(-0.86, 1.08, 0.72)],
      [cyl(0.012, 0.015, 0.48, 6), DARK, mat(0, 1.72, -0.75)],
      [cyl(0.012, 0.015, 0.38, 6), DARK, mat(-0.35, 1.12, -1.85)],
    ],
    false
  );

  // Parked civilian car (WHITE panels tinted by instanceColor)
  G.car = sedan(WHITE, [], true);

  // Fire station apparatus-bay door (on facade, facing +Z) with vision lites, bollards & beacon
  {
    const p = [
      // Stone/concrete pilaster surround + header lintel
      [box(4.7, 4.9, 0.12), [0.92, 0.9, 0.86], mat(0, 2.45, 0.05)],
      [box(4.9, 0.28, 0.22), [0.76, 0.74, 0.7], mat(0, 4.82, 0.09)],
      // Crimson overhead sectional door + horizontal rail ribs
      [box(4.0, 4.1, 0.14), [0.74, 0.1, 0.08], mat(0, 2.05, 0.08)],
      ...[0.8, 1.6, 2.4, 3.2].map((y) => [box(4.02, 0.06, 0.17), [0.46, 0.06, 0.05], mat(0, y, 0.08)]),
      // 4 glazed vision window lites across the eye-level door panel
      ...[-1.35, -0.45, 0.45, 1.35].map((x) => [box(0.68, 0.42, 0.18), GLASS, mat(x, 2.0, 0.08)]),
      // Station header nameplate + flashing red alarm beacon + threshold safety bollards
      [box(2.4, 0.42, 0.16), [0.96, 0.96, 0.96], mat(0, 4.46, 0.11)],
      [box(1.95, 0.16, 0.18), [0.75, 0.08, 0.06], mat(0, 4.46, 0.12)],
      [cyl(0.09, 0.1, 0.16, 10), [1.6, 0.12, 0.1], mat(0, 5.02, 0.14)],
      [cyl(0.09, 0.09, 0.95, 10), [0.92, 0.76, 0.12], mat(-2.15, 0.48, 0.24)],
      [cyl(0.09, 0.09, 0.95, 10), [0.92, 0.76, 0.12], mat(2.15, 0.48, 0.24)],
    ];
    G.fireDoor = merge(p);
  }

  // Fire engine / aerial ladder pumper truck (forward +Z, ~9 m)
  {
    const RED = [0.78, 0.07, 0.05];
    const STRIPE = [0.96, 0.95, 0.9];
    const p = [
      // Crew cab (+Z) + white reflective beltline stripe + raised roof
      [box(2.5, 2.45, 2.35), RED, mat(0, 1.64, 3.25)],
      [box(2.54, 0.22, 2.38), STRIPE, mat(0, 1.06, 3.25)],
      // Split panoramic windshield + side crew windows
      [box(1.08, 0.88, 0.07), GLASS, mat(-0.58, 2.28, 4.41)],
      [box(1.08, 0.88, 0.07), GLASS, mat(0.58, 2.28, 4.41)],
      [box(2.53, 0.64, 0.72), GLASS, mat(0, 2.28, 3.82)],
      [box(2.53, 0.64, 0.72), GLASS, mat(0, 2.28, 2.82)],
      // Chrome radiator grille + quad headlamps + heavy extended front bumper with hose well & siren
      [box(1.5, 0.78, 0.08), CHROME, mat(0, 1.38, 4.42)],
      [box(1.38, 0.66, 0.09), DARK, mat(0, 1.38, 4.43)],
      ...[1.15, 1.3, 1.45, 1.6].map((y) => [box(1.34, 0.04, 0.11), CHROME, mat(0, y, 4.44)]),
      [box(0.38, 0.22, 0.08), [1.7, 1.65, 1.4], mat(-0.96, 1.25, 4.42)],
      [box(0.38, 0.22, 0.08), [1.7, 1.65, 1.4], mat(0.96, 1.25, 4.42)],
      [box(2.62, 0.34, 0.42), CHROME, mat(0, 0.56, 4.54)],
      [cyl(0.11, 0.11, 0.14, 10), CHROME, mat(-0.55, 0.62, 4.74, Math.PI / 2, 0, 0)],
      // West-coast side mirrors + cab roof air horns + red/white emergency lightbar
      [box(0.14, 0.52, 0.08), CHROME, mat(-1.34, 2.22, 4.22)],
      [box(0.14, 0.52, 0.08), CHROME, mat(1.34, 2.22, 4.22)],
      [cyl(0.04, 0.07, 0.55, 8), CHROME, mat(-0.65, 2.92, 3.9, Math.PI / 2, 0, 0)],
      [cyl(0.04, 0.07, 0.55, 8), CHROME, mat(0.65, 2.92, 3.9, Math.PI / 2, 0, 0)],
      [box(1.85, 0.18, 0.32), [1.6, 0.1, 0.1], mat(0, 2.96, 3.65)],
      [box(0.45, 0.19, 0.34), [1.75, 1.75, 1.75], mat(0, 2.96, 3.65)],
      // Midship pump module (gauges + large chrome suction intakes)
      [box(2.42, 2.1, 0.85), [0.2, 0.22, 0.25], mat(0, 1.5, 1.65)],
      [cyl(0.22, 0.22, 2.58, 12), CHROME, mat(0, 1.18, 1.65, 0, 0, Math.PI / 2)],
      // Rear apparatus body + reflective stripe + diamond-plate top deck + rear chevron panel
      [box(2.5, 2.18, 5.5), RED, mat(0, 1.54, -1.52)],
      [box(2.54, 0.22, 5.54), STRIPE, mat(0, 1.05, -1.52)],
      [box(2.46, 0.08, 5.46), STEEL, mat(0, 2.66, -1.52)],
      [box(0.32, 0.18, 0.32), [1.6, 0.1, 0.1], mat(-0.95, 2.74, -4.1)],
      [box(0.32, 0.18, 0.32), [1.6, 0.1, 0.1], mat(0.95, 2.74, -4.1)],
      // Turntable pedestal + hydraulic lift cylinders + multi-section aerial extension ladder
      [cyl(0.55, 0.62, 0.28, 14), DARK, mat(0, 2.8, -3.4)],
      [box(0.11, 0.16, 7.6), [0.85, 0.87, 0.9], mat(-0.48, 3.02, -0.55)],
      [box(0.11, 0.16, 7.6), [0.85, 0.87, 0.9], mat(0.48, 3.02, -0.55)],
      [box(0.08, 0.14, 7.6), [0.85, 0.87, 0.9], mat(-0.48, 3.24, -0.55)],
      [box(0.08, 0.14, 7.6), [0.85, 0.87, 0.9], mat(0.48, 3.24, -0.55)],
    ];
    for (let i = 0; i < 11; i++) {
      p.push([box(0.96, 0.055, 0.055), [0.85, 0.87, 0.9], mat(0, 3.0, -4.15 + i * 0.72)]);
    }
    // 3 aluminum roll-up equipment compartment shutters per side + hard suction hoses
    for (const z of [0.35, -1.45, -3.25]) {
      p.push([box(2.54, 1.18, 1.35), STEEL, mat(0, 1.62, z)]);
      p.push([box(2.56, 0.05, 1.25), CHROME, mat(0, 1.12, z)]);
    }
    p.push([cyl(0.11, 0.11, 5.1, 10), DARK, mat(-1.28, 2.38, -1.52, Math.PI / 2, 0, 0)]);
    p.push([cyl(0.11, 0.11, 5.1, 10), DARK, mat(1.28, 2.38, -1.52, Math.PI / 2, 0, 0)]);
    wheels(p, [-1.12, 1.12], [3.2, -1.9, -3.2], 0.5);
    G.fireTruck = merge(p);
  }

  // Bus stop flag on a pole (plate faces ±Z = along the road) + timetable case + solar cap
  G.busPole = merge([
    // Cast-iron base plinth collar + galvanized steel pole
    [cyl(0.09, 0.12, 0.28, 12), DARK, mat(0, 0.14, 0)],
    [cyl(0.04, 0.045, 2.95, 12), STEEL, mat(0, 1.48, 0)],
    // Mounting rings + double-sided flag sign plate (facing ±Z)
    [cyl(0.055, 0.055, 0.06, 10), DARK, mat(0, 2.25, 0)],
    [cyl(0.055, 0.055, 0.06, 10), DARK, mat(0, 2.75, 0)],
    [box(0.64, 0.56, 0.045), [0.96, 0.96, 0.97], mat(0.32, 2.5, 0)],
    [box(0.66, 0.16, 0.055), [0.1, 0.34, 0.76], mat(0.32, 2.8, 0)],
    [cyl(0.08, 0.08, 0.66, 12), [0.1, 0.34, 0.76], mat(0.32, 2.88, 0, 0, 0, Math.PI / 2)],
    [box(0.38, 0.22, 0.058), [0.1, 0.34, 0.76], mat(0.32, 2.48, 0)],
    [box(0.46, 0.06, 0.058), [0.92, 0.65, 0.12], mat(0.32, 2.28, 0)],
    // Eye-level timetable display case + top solar beacon
    [box(0.28, 0.42, 0.06), DARK, mat(0.14, 1.42, 0)],
    [box(0.23, 0.36, 0.068), [0.94, 0.95, 0.92], mat(0.14, 1.42, 0)],
    [box(0.22, 0.03, 0.22), [0.14, 0.2, 0.34], mat(0, 2.98, 0, 0.22, 0, 0)],
  ]);

  // Bus shelter: 4.4 m along X, open side faces +Z (the road)
  {
    const FRAME = [0.24, 0.26, 0.29];
    const GLASS_PANEL = [0.46, 0.6, 0.68];
    const WOOD = [0.54, 0.38, 0.22];
    const p = [
      // Paved platform pad
      [box(4.8, 0.06, 1.7), [0.62, 0.63, 0.64], mat(0, 0.03, -0.02)],
      // Tempered glass rear wall (3 bays) & left wind screen + safety manifestation strips
      [box(4.4, 2.0, 0.045), GLASS_PANEL, mat(0, 1.25, -0.62)],
      [box(4.4, 0.06, 0.055), [0.88, 0.92, 0.95], mat(0, 1.05, -0.62)],
      [box(4.4, 0.04, 0.055), [0.88, 0.92, 0.95], mat(0, 1.55, -0.62)],
      [box(0.045, 2.0, 1.2), GLASS_PANEL, mat(-2.2, 1.25, -0.05)],
      // Structural steel posts + vertical rear mullions
      [cyl(0.048, 0.048, 2.38, 10), FRAME, mat(-2.2, 1.19, -0.62)],
      [cyl(0.048, 0.048, 2.38, 10), FRAME, mat(2.2, 1.19, -0.62)],
      [cyl(0.048, 0.048, 2.38, 10), FRAME, mat(-2.2, 1.19, 0.55)],
      [cyl(0.048, 0.048, 2.38, 10), FRAME, mat(2.2, 1.19, 0.55)],
      [box(0.05, 2.28, 0.06), FRAME, mat(-0.73, 1.2, -0.62)],
      [box(0.05, 2.28, 0.06), FRAME, mat(0.73, 1.2, -0.62)],
      // Curved barrel-arch canopy roof + transverse arch ribs + glowing ceiling light strip + blue transit fascia
      [box(4.76, 0.1, 1.66), FRAME, mat(0, 2.38, -0.02)],
      [cyl(0.84, 0.84, 4.72, 14), [0.34, 0.37, 0.41], matScale(0, 2.42, -0.02, 1, 0.18, 1, 0, 0, Math.PI / 2)],
      [box(4.78, 0.09, 0.08), [0.1, 0.36, 0.78], mat(0, 2.41, 0.81)],
      [box(3.8, 0.04, 0.14), [1.55, 1.5, 1.35], mat(0, 2.32, -0.05)],
      // Interior transit system route map board on rear wall
      [box(0.92, 1.05, 0.05), FRAME, mat(1.35, 1.38, -0.58)],
      [box(0.82, 0.94, 0.06), [0.94, 0.95, 0.96], mat(1.35, 1.38, -0.58)],
      [box(0.82, 0.14, 0.065), [0.1, 0.34, 0.76], mat(1.35, 1.76, -0.58)],
      // Slatted wooden bench with steel legs, backrest & armrests
      [box(2.35, 0.055, 0.11), WOOD, mat(-0.42, 0.48, -0.44)],
      [box(2.35, 0.055, 0.11), WOOD, mat(-0.42, 0.48, -0.3)],
      [box(2.35, 0.055, 0.1), WOOD, mat(-0.42, 0.46, -0.17, 0.18, 0, 0)],
      [box(2.35, 0.16, 0.04), WOOD, mat(-0.42, 0.76, -0.54)],
      [box(0.06, 0.46, 0.34), FRAME, mat(-1.4, 0.24, -0.32)],
      [box(0.06, 0.46, 0.34), FRAME, mat(-0.42, 0.24, -0.32)],
      [box(0.06, 0.46, 0.34), FRAME, mat(0.56, 0.24, -0.32)],
      // Illuminated advertising lightbox vitrine at +X end + cylindrical trash bin at -X end
      [box(1.26, 1.88, 0.14), DARK, mat(2.2, 1.2, -0.05, 0, Math.PI / 2, 0)],
      [box(1.14, 1.72, 0.16), [1.48, 1.4, 1.22], mat(2.2, 1.2, -0.05, 0, Math.PI / 2, 0)],
      [box(0.95, 0.22, 0.17), [0.12, 0.36, 0.76], mat(2.2, 1.82, -0.05, 0, Math.PI / 2, 0)],
      [cyl(0.2, 0.18, 0.78, 12), FRAME, mat(-2.52, 0.4, -0.38)],
      [cyl(0.21, 0.21, 0.08, 12), STEEL, mat(-2.52, 0.81, -0.38)],
    ];
    G.shelter = merge(p);
  }

  // Subway / train station entrance: railed stairwell, 2.4 m wide (X) x 5.4 m long (Z), open at +Z.
  // Railing + lamp globes + portal header are WHITE so the instance tint colours them by line (green subway / blue rail).
  {
    const p = [
      // Dark stairwell shadow pit + granite street curb coping
      [box(2.3, 0.04, 5.2), [0.05, 0.05, 0.06], mat(0, 0.02, 0)],
      [box(0.22, 0.16, 5.56), [0.62, 0.62, 0.6], mat(-1.24, 0.08, -0.04)],
      [box(0.22, 0.16, 5.56), [0.62, 0.62, 0.6], mat(1.24, 0.08, -0.04)],
      [box(2.7, 0.16, 0.22), [0.62, 0.62, 0.6], mat(0, 0.08, -2.74)],
      // Tinted balustrade panels + wrought-iron top/bottom rails + stainless handrail cap
      [box(0.06, 0.92, 5.4), WHITE, mat(-1.2, 0.56, 0)],
      [box(0.06, 0.92, 5.4), WHITE, mat(1.2, 0.56, 0)],
      [box(2.46, 0.92, 0.06), WHITE, mat(0, 0.56, -2.7)],
      [box(0.15, 0.08, 5.52), [0.74, 0.76, 0.78], mat(-1.2, 1.08, 0)],
      [box(0.15, 0.08, 5.52), [0.74, 0.76, 0.78], mat(1.2, 1.08, 0)],
      [box(2.58, 0.08, 0.15), [0.74, 0.76, 0.78], mat(0, 1.08, -2.7)],
      // Central stainless stair divider handrail
      [cyl(0.03, 0.03, 0.95, 8), STEEL, mat(0, 0.52, 2.35)],
      [cyl(0.025, 0.025, 4.6, 8), CHROME, mat(0, 0.72, 0.05, Math.PI / 2 + 0.12, 0, 0)],
      // Twin classic entrance lamp posts + glowing spherical globes + overhead portal marquee sign
      [cyl(0.11, 0.14, 0.45, 10), [0.22, 0.23, 0.25], mat(-1.2, 0.3, 2.7)],
      [cyl(0.11, 0.14, 0.45, 10), [0.22, 0.23, 0.25], mat(1.2, 0.3, 2.7)],
      [cyl(0.055, 0.065, 2.25, 10), [0.25, 0.26, 0.28], mat(-1.2, 1.18, 2.7)],
      [cyl(0.055, 0.065, 2.25, 10), [0.25, 0.26, 0.28], mat(1.2, 1.18, 2.7)],
      [sph(0.22, 14, 12), [1.65, 1.65, 1.6], mat(-1.2, 2.42, 2.7)],
      [sph(0.22, 14, 12), [1.65, 1.65, 1.6], mat(1.2, 2.42, 2.7)],
      // Overhead transit portal sign beam across +Z entrance
      [box(2.56, 0.34, 0.14), [0.2, 0.21, 0.23], mat(0, 2.1, 2.7)],
      [box(2.24, 0.22, 0.17), WHITE, mat(0, 2.1, 2.7)],
    ];
    // Vertical balustrade post accents along side railings
    for (let z = -2.4; z <= 2.4; z += 0.8) {
      p.push([box(0.12, 0.98, 0.08), [0.25, 0.26, 0.28], mat(-1.2, 0.56, z)]);
      p.push([box(0.12, 0.98, 0.08), [0.25, 0.26, 0.28], mat(1.2, 0.56, z)]);
    }
    // Descending stair treads + yellow tactile warning strip at entrance threshold
    p.push([box(2.26, 0.025, 0.28), [0.92, 0.78, 0.14], mat(0, 0.055, 2.52)]);
    for (let i = 0; i < 8; i++) {
      p.push([box(2.28, 0.03, 0.12), [0.32, 0.33, 0.35], mat(0, 0.05, 2.22 - i * 0.6)]);
    }
    G.subway = merge(p);
  }

  // Parking lots: asphalt slab with a skirt (hides slopes), painted stalls, concrete wheel stops, pay kiosk & light poles.
  const lot = (W) => {
    const D = 15;
    const LINE = [0.92, 0.92, 0.88];
    const CURB = [0.58, 0.58, 0.55];
    const p = [
      // Asphalt slab + slope-hiding skirt + perimeter concrete curbs (with entrance gap at +Z center)
      [box(W, 1.4, D), [0.2, 0.21, 0.22], mat(0, -0.66, 0)],
      [box(W + 0.4, 0.18, 0.22), CURB, mat(0, 0.05, -D / 2 - 0.1)],
      [box(W * 0.34, 0.18, 0.22), CURB, mat(-W * 0.33, 0.05, D / 2 + 0.1)],
      [box(W * 0.34, 0.18, 0.22), CURB, mat(W * 0.33, 0.05, D / 2 + 0.1)],
      [box(0.22, 0.18, D), CURB, mat(-W / 2 - 0.1, 0.05, 0)],
      [box(0.22, 0.18, D), CURB, mat(W / 2 + 0.1, 0.05, 0)],
    ];
    const n = W / 2.5;
    for (const row of [-1, 1]) {
      for (let i = 0; i <= n; i++) {
        p.push([box(0.12, 0.02, 5.4), LINE, mat(-W / 2 + i * 2.5, 0.06, row * 4.8)]);
        if (i < n) {
          // Concrete wheel stop bumper in each stall
          p.push([box(1.65, 0.1, 0.18), [0.72, 0.72, 0.68], mat(-W / 2 + (i + 0.5) * 2.5, 0.09, row * 6.8)]);
        }
      }
      p.push([box(W, 0.02, 0.12), LINE, mat(0, 0.06, row * 7.4)]);
    }
    // Accessible blue parking stall + solar pay-and-display meter kiosk + LED light poles
    p.push([box(1.1, 0.022, 1.1), [0.18, 0.38, 0.76], mat(-W / 2 + 1.25, 0.065, -4.8)]);
    p.push([box(0.42, 1.45, 0.28), [0.22, 0.26, 0.32], mat(-W / 2 + 0.35, 0.75, -D / 2 + 0.55)]);
    p.push([box(0.32, 0.28, 0.3), [0.12, 0.42, 0.78], mat(-W / 2 + 0.35, 1.15, -D / 2 + 0.55)]);
    for (const sx of [-1, 1]) {
      const lx = sx * (W / 2 - 0.35);
      const lz = -D / 2 + 0.35;
      p.push([cyl(0.14, 0.18, 0.45, 10), CURB, mat(lx, 0.25, lz)]);
      p.push([cyl(0.05, 0.07, 5.2, 10), STEEL, mat(lx, 2.8, lz)]);
      p.push([box(0.42, 0.08, 0.85), DARK, mat(lx, 5.42, lz + 0.32)]);
      p.push([box(0.34, 0.04, 0.68), [1.75, 1.72, 1.55], mat(lx, 5.38, lz + 0.35)]);
    }
    return merge(p);
  };
  G.lotL = lot(20);
  G.lotS = lot(10);

  // Park / street bench (slatted hardwood seat & backrest, cast-iron scrolled armrests & legs)
  G.bench = merge([
    [box(1.8, 0.05, 0.1), [0.54, 0.36, 0.2], mat(0, 0.45, 0.14)],
    [box(1.8, 0.05, 0.1), [0.54, 0.36, 0.2], mat(0, 0.45, 0.0)],
    [box(1.8, 0.05, 0.1), [0.54, 0.36, 0.2], mat(0, 0.44, -0.14, 0.15, 0, 0)],
    [box(1.8, 0.1, 0.04), [0.54, 0.36, 0.2], mat(0, 0.64, -0.22, -0.18, 0, 0)],
    [box(1.8, 0.1, 0.04), [0.54, 0.36, 0.2], mat(0, 0.78, -0.25, -0.18, 0, 0)],
    [box(0.06, 0.46, 0.46), DARK, mat(-0.78, 0.23, 0)],
    [box(0.06, 0.46, 0.46), DARK, mat(0.78, 0.23, 0)],
    [torus(0.16, 0.025, 8, 12, Math.PI), DARK, mat(-0.78, 0.52, 0.04, 0, Math.PI / 2, 0)],
    [torus(0.16, 0.025, 8, 12, Math.PI), DARK, mat(0.78, 0.52, 0.04, 0, Math.PI / 2, 0)],
  ]);

  // Tiered ornamental plaza fountain with octagonal basin, fluted pedestal, two bowls & water plumes
  {
    const STONE = [0.86, 0.84, 0.79];
    const WATER = [0.24, 0.62, 0.85];
    const FOAM = [0.85, 0.95, 1.0];
    const p = [
      [cyl(2.4, 2.55, 0.48, 16), STONE, mat(0, 0.24, 0)],
      [torus(2.38, 0.12, 10, 18), STONE, mat(0, 0.48, 0, Math.PI / 2, 0, 0)],
      [cyl(2.22, 2.22, 0.38, 16), WATER, mat(0, 0.26, 0)],
      [cyl(0.45, 0.58, 1.45, 14), STONE, mat(0, 0.95, 0)],
      [cyl(1.35, 0.52, 0.28, 16), STONE, mat(0, 1.72, 0)],
      [cyl(1.22, 1.22, 0.12, 16), WATER, mat(0, 1.82, 0)],
      [cyl(0.28, 0.36, 1.05, 12), STONE, mat(0, 2.32, 0)],
      [cyl(0.74, 0.3, 0.22, 14), STONE, mat(0, 2.88, 0)],
      [cone(0.22, 0.75, 12), FOAM, mat(0, 3.35, 0)],
      [sph(0.18, 10, 8), FOAM, mat(0, 3.72, 0)],
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      p.push([cyl(0.04, 0.08, 0.95, 8), FOAM, mat(Math.cos(a) * 0.55, 2.35, Math.sin(a) * 0.55, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4)]);
    }
    G.fountain = merge(p);
  }

  // Classical civic statue on stepped granite plinth & bronze equestrian/heroic figure
  {
    const STONE = [0.82, 0.8, 0.76];
    const BRONZE = [0.28, 0.38, 0.32];
    G.statue = merge([
      [box(2.2, 0.32, 2.2), STONE, mat(0, 0.16, 0)],
      [box(1.8, 0.32, 1.8), STONE, mat(0, 0.48, 0)],
      [box(1.35, 1.65, 1.35), [0.88, 0.86, 0.81], mat(0, 1.46, 0)],
      [box(1.52, 0.18, 1.52), STONE, mat(0, 2.36, 0)],
      [box(0.86, 0.42, 0.06), GOLD, mat(0, 1.5, 0.69)],
      [cyl(0.32, 0.38, 0.22, 12), BRONZE, mat(0, 2.56, 0)],
      [cyl(0.22, 0.28, 1.25, 12), BRONZE, mat(0, 3.28, 0)],
      [sph(0.2, 12, 10), BRONZE, mat(0, 4.08, 0)],
      [cyl(0.06, 0.07, 0.85, 8), BRONZE, mat(0.32, 3.65, 0.15, -0.4, 0, -0.5)],
      [cyl(0.025, 0.025, 1.35, 8), GOLD, mat(0.55, 4.15, 0.28, -0.2, 0, -0.15)],
    ]);
  }

  // Ornate street clock on fluted cast-iron post with 4 clock faces & hands
  {
    const IRON = [0.14, 0.18, 0.16];
    const p = [
      [cyl(0.28, 0.34, 0.55, 12), IRON, mat(0, 0.275, 0)],
      [cyl(0.18, 0.24, 0.65, 12), IRON, mat(0, 0.85, 0)],
      [cyl(0.09, 0.13, 3.2, 14), IRON, mat(0, 2.75, 0)],
      [torus(0.14, 0.03, 8, 12), GOLD, mat(0, 4.25, 0, Math.PI / 2, 0, 0)],
      [cyl(0.56, 0.56, 0.34, 16), IRON, mat(0, 4.85, 0, Math.PI / 2, 0, 0)],
      [torus(0.56, 0.045, 10, 18), GOLD, mat(0, 4.85, 0)],
      [cyl(0.5, 0.5, 0.38, 16), [0.98, 0.97, 0.92], mat(0, 4.85, 0, Math.PI / 2, 0, 0)],
      // Clock hands on front (+Z) and back (-Z)
      [box(0.035, 0.32, 0.42), DARK, mat(0, 4.97, 0)],
      [box(0.26, 0.035, 0.42), DARK, mat(0.1, 4.85, 0)],
      [sph(0.12, 10, 8), GOLD, mat(0, 5.52, 0)],
      [cone(0.08, 0.26, 10), GOLD, mat(0, 5.72, 0)],
    ];
    G.clock = merge(p);
  }

  // Standalone civic flagpole with stepped base, halyard & flying flag
  G.flag = merge([
    [cyl(0.36, 0.44, 0.42, 12), [0.78, 0.76, 0.72], mat(0, 0.21, 0)],
    [cyl(0.05, 0.09, 9.0, 12), STEEL, mat(0, 4.7, 0)],
    [sph(0.12, 12, 10), GOLD, mat(0, 9.28, 0)],
    [box(1.65, 1.0, 0.035), [0.82, 0.12, 0.16], mat(0.86, 8.45, 0)],
    [box(1.65, 0.22, 0.04), WHITE, mat(0.86, 8.45, 0)],
    [box(0.65, 0.52, 0.042), [0.12, 0.24, 0.58], mat(0.36, 8.69, 0)],
  ]);

  // Traditional Dutch / heritage windmill with octagonal tower, cap dome, balcony & 4 lattice sails
  {
    const p = [
      [cyl(2.6, 3.2, 3.2, 12), [0.58, 0.32, 0.24], mat(0, 1.6, 0)],
      [cyl(1.8, 2.55, 7.5, 12), [0.88, 0.86, 0.8], mat(0, 6.95, 0)],
      [cyl(2.9, 2.9, 0.14, 14), [0.48, 0.34, 0.22], mat(0, 3.2, 0)],
      [sph(1.88, 14, 12), [0.24, 0.26, 0.28], mat(0, 10.7, 0)],
      [cyl(0.24, 0.24, 1.4, 10), DARK, mat(0, 10.8, 1.65, Math.PI / 2, 0, 0)],
    ];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.38;
      p.push([box(0.16, 9.6, 0.12), [0.46, 0.32, 0.18], mat(0, 10.8, 2.15, 0, 0, a)]);
      p.push([box(0.68, 4.1, 0.04), [0.95, 0.93, 0.86], mat(Math.cos(a + Math.PI / 2) * 2.5 + Math.cos(a) * 0.32, 10.8 + Math.sin(a + Math.PI / 2) * 2.5 + Math.sin(a) * 0.32, 2.2, 0, 0, a)]);
    }
    G.windmill = merge(p);
  }

  // Coastal striped lighthouse with rock base, gallery deck, glass lantern room & rotating Fresnel beacon
  G.lighthouse = merge([
    [cyl(3.2, 3.8, 1.6, 14), [0.46, 0.45, 0.44], mat(0, 0.8, 0)],
    [cyl(2.2, 2.6, 3.2, 16), WHITE, mat(0, 3.2, 0)],
    [cyl(1.9, 2.2, 3.2, 16), [0.82, 0.12, 0.1], mat(0, 6.4, 0)],
    [cyl(1.6, 1.9, 3.2, 16), WHITE, mat(0, 9.6, 0)],
    [cyl(1.35, 1.6, 3.0, 16), [0.82, 0.12, 0.1], mat(0, 12.7, 0)],
    [cyl(1.85, 1.85, 0.22, 16), DARK, mat(0, 14.3, 0)],
    [torus(1.78, 0.05, 8, 16), DARK, mat(0, 14.95, 0, Math.PI / 2, 0, 0)],
    [cyl(1.18, 1.18, 1.65, 14), GLASS, mat(0, 15.2, 0)],
    [sph(0.55, 12, 10), [1.95, 1.88, 1.45], mat(0, 15.2, 0)],
    [cone(1.38, 1.15, 14), [0.78, 0.1, 0.08], mat(0, 16.55, 0)],
    [sph(0.18, 10, 8), GOLD, mat(0, 17.2, 0)],
  ]);

  // Tower crane with lattice mast, operator cab, counter-jib ballast, main jib & hook block
  {
    const YELLOW = [0.92, 0.72, 0.12];
    const p = [
      [box(2.8, 0.6, 2.8), [0.55, 0.56, 0.58], mat(0, 0.3, 0)],
      [box(1.2, 18.0, 1.2), YELLOW, mat(0, 9.6, 0)],
      [box(1.6, 1.8, 2.0), YELLOW, mat(0.7, 18.8, 0.4)],
      [box(1.64, 0.9, 1.1), GLASS, mat(0.72, 18.95, 0.75)],
      [box(1.1, 0.9, 16.0), YELLOW, mat(0, 19.8, 4.2)],
      [box(1.5, 1.2, 2.2), [0.45, 0.46, 0.48], mat(0, 19.6, -3.2)],
      [prism(1.1, 2.6, 1.0), YELLOW, mat(0, 20.25, -0.5)],
      [box(0.6, 0.35, 0.8), DARK, mat(0, 19.25, 9.5)],
      [cyl(0.025, 0.025, 6.5, 6), DARK, mat(0, 15.9, 9.5)],
      [box(0.45, 0.55, 0.35), YELLOW, mat(0, 12.5, 9.5)],
    ];
    G.crane = merge(p);
  }

  // Ambulance (front +Z) with modular patient box, red cross, Star-of-Life stripes & emergency strobes
  {
    const RED = [0.85, 0.1, 0.1];
    const p = [
      [box(2.1, 1.85, 2.1), WHITE, mat(0, 1.28, 2.05)],
      [box(1.92, 0.72, 0.07), GLASS, mat(0, 1.72, 3.11, -0.22, 0, 0)],
      [box(2.12, 0.62, 0.85), GLASS, mat(0, 1.72, 2.25)],
      [box(1.35, 0.45, 0.08), CHROME, mat(0, 0.92, 3.12)],
      [box(2.2, 0.28, 0.26), STEEL, mat(0, 0.52, 3.16)],
      [box(2.32, 2.38, 3.85), WHITE, mat(0, 1.62, -0.88)],
      [box(2.36, 0.26, 5.95), RED, mat(0, 1.12, 0.1)],
      // Red cross emblems on sides and rear
      [box(2.38, 0.68, 0.22), RED, mat(0, 1.85, -0.85)],
      [box(2.38, 0.22, 0.68), RED, mat(0, 1.85, -0.85)],
      [box(1.65, 0.18, 0.28), [1.6, 0.1, 0.1], mat(0, 2.88, 1.15)],
      [box(0.42, 0.16, 0.22), [1.6, 0.1, 0.1], mat(-0.82, 2.68, -2.78)],
      [box(0.42, 0.16, 0.22), [0.15, 0.4, 1.65], mat(0.82, 2.68, -2.78)],
    ];
    wheels(p, [-0.98, 0.98], [2.1, -1.65], 0.42);
    G.ambulance = merge(p);
  }

  // Taxi cab (front +Z) with yellow livery, checker beltline & glowing rooftop TAXI beacon
  G.taxi = sedan(
    [0.96, 0.76, 0.1],
    [
      [box(1.83, 0.09, 3.2), DARK, mat(0, 0.72, -0.05)],
      [box(0.56, 0.16, 0.22), [1.65, 1.45, 0.55], mat(0, 1.58, -0.15)],
      [box(0.62, 0.04, 0.26), DARK, mat(0, 1.5, -0.15)],
    ],
    false
  );

  // Delivery van (front +Z) with high-roof cargo body, sloped windshield & rear step bumper
  {
    const p = [
      [box(2.05, 2.15, 5.4), WHITE, mat(0, 1.42, 0)],
      [box(1.98, 0.85, 1.15), WHITE, mat(0, 0.92, 2.85, 0.12, 0, 0)],
      [box(1.88, 0.78, 0.08), GLASS, mat(0, 1.76, 2.48, -0.42, 0, 0)],
      [box(2.07, 0.68, 0.95), GLASS, mat(0, 1.76, 1.75)],
      [box(1.28, 0.42, 0.08), DARK, mat(0, 0.88, 3.44)],
      [box(2.1, 0.26, 0.24), DARK, mat(0, 0.48, 3.45)],
      [box(2.1, 0.24, 0.28), STEEL, mat(0, 0.46, -2.75)],
      [box(0.34, 0.16, 0.07), [1.65, 1.6, 1.35], mat(-0.74, 0.96, 3.44)],
      [box(0.34, 0.16, 0.07), [1.65, 1.6, 1.35], mat(0.74, 0.96, 3.44)],
      [box(0.18, 0.48, 0.07), [0.88, 0.06, 0.06], mat(-0.92, 1.15, -2.71)],
      [box(0.18, 0.48, 0.07), [0.88, 0.06, 0.06], mat(0.92, 1.15, -2.71)],
    ];
    wheels(p, [-0.94, 0.94], [1.95, -1.65], 0.38);
    G.deliveryVan = merge(p);
  }

  // School bus (front +Z) with classic yellow body, black rub rails, arched roof, stop arm & warning flashers
  {
    const BUS_YELLOW = [0.95, 0.68, 0.08];
    const p = [
      [box(2.42, 2.15, 7.6), BUS_YELLOW, mat(0, 1.58, -0.45)],
      [cyl(1.21, 1.21, 7.6, 14), BUS_YELLOW, matScale(0, 2.65, -0.45, 1, 0.28, 1, Math.PI / 2, 0, 0)],
      [box(2.1, 1.15, 1.6), BUS_YELLOW, mat(0, 1.12, 4.1)],
      [box(2.26, 0.78, 0.08), GLASS, mat(0, 2.08, 3.36, -0.18, 0, 0)],
      [box(2.46, 0.08, 7.5), DARK, mat(0, 1.15, -0.45)],
      [box(2.46, 0.08, 7.5), DARK, mat(0, 1.55, -0.45)],
      [box(1.4, 0.55, 0.08), DARK, mat(0, 1.08, 4.91)],
      [box(2.48, 0.3, 0.26), DARK, mat(0, 0.54, 4.94)],
      [box(2.48, 0.3, 0.26), DARK, mat(0, 0.54, -4.28)],
      // Octagonal red STOP arm on driver side + roof warning flashers
      [cyl(0.22, 0.22, 0.04, 8), [0.88, 0.08, 0.08], mat(-1.26, 1.55, 2.4, 0, 0, Math.PI / 2)],
      [box(0.24, 0.14, 0.1), [1.6, 0.1, 0.1], mat(-0.85, 2.82, 3.32)],
      [box(0.24, 0.14, 0.1), [1.6, 0.1, 0.1], mat(0.85, 2.82, 3.32)],
    ];
    for (let i = 0; i < 6; i++) {
      p.push([box(2.45, 0.58, 0.88), GLASS, mat(0, 2.05, 2.2 - i * 1.15)]);
    }
    wheels(p, [-1.08, 1.08], [3.4, -2.4], 0.48);
    G.schoolBus = merge(p);
  }

  // Garbage / sanitation compactor truck (front +Z) with ribbed hopper body & rear tailgate loader
  {
    const GREEN = [0.16, 0.46, 0.24];
    const p = [
      [box(2.4, 2.25, 2.1), WHITE, mat(0, 1.58, 2.95)],
      [box(2.2, 0.82, 0.08), GLASS, mat(0, 2.12, 4.01)],
      [box(2.42, 0.65, 0.85), GLASS, mat(0, 2.12, 3.1)],
      [box(2.5, 0.32, 0.28), STEEL, mat(0, 0.56, 4.06)],
      [box(2.46, 2.38, 5.2), GREEN, mat(0, 1.72, -0.85)],
      [box(2.38, 2.15, 0.95), GREEN, mat(0, 1.62, -3.75, 0.22, 0, 0)],
      [cyl(0.12, 0.12, 0.18, 10), [1.5, 0.95, 0.1], mat(-0.75, 2.8, 3.2)],
      [cyl(0.12, 0.12, 0.18, 10), [1.5, 0.95, 0.1], mat(0.75, 2.8, 3.2)],
    ];
    for (let i = 0; i < 5; i++) {
      p.push([box(2.52, 2.32, 0.1), [0.12, 0.36, 0.18], mat(0, 1.72, 1.1 - i * 1.0)]);
    }
    wheels(p, [-1.08, 1.08], [2.95, -1.4, -2.65], 0.48);
    G.garbageTruck = merge(p);
  }

  // Agricultural / utility tractor (front +Z) with oversized rear tires, ROPS glass cab & exhaust stack
  {
    const TRACTOR_GREEN = [0.18, 0.54, 0.2];
    const p = [
      [box(1.15, 0.95, 1.85), TRACTOR_GREEN, mat(0, 1.18, 0.95)],
      [box(0.95, 0.55, 0.08), DARK, mat(0, 1.18, 1.88)],
      [box(1.48, 1.45, 1.45), GLASS, mat(0, 2.12, -0.55)],
      [box(1.58, 0.12, 1.55), TRACTOR_GREEN, mat(0, 2.88, -0.55)],
      [box(2.15, 0.18, 1.15), TRACTOR_GREEN, mat(0, 1.28, -0.75)],
      [cyl(0.055, 0.065, 1.35, 10), DARK, mat(-0.52, 2.15, 0.55)],
      [cyl(0.1, 0.1, 0.14, 10), [1.5, 0.95, 0.1], mat(0, 3.0, -0.55)],
    ];
    wheels(p, [-0.78, 0.78], [1.25], 0.42);
    wheels(p, [-0.95, 0.95], [-0.75], 0.72);
    G.tractor = merge(p);
  }

  return G;
}
