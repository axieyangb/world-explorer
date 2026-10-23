/**
 * [feature/ferries-ships] Low-poly vessel geometries (one merged, vertex-coloured BufferGeometry per
 * type, origin at the waterline centre, bow toward +Z) for InstancedMesh rendering.
 */
import * as THREE from '../../../vendor/three.module.js';
import { rng } from './geo.js';

class Builder {
  constructor() { this.parts = []; }
  add(geom, color, m) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    this.parts.push(g);
    return this;
  }
  box(w, h, l, x, y, z, color) {
    const g = new THREE.BoxGeometry(w, h, l);
    g.translate(x, y + h / 2, z);
    return this.add(g, color);
  }
  cyl(r, h, x, y, z, color, seg = 8) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y + h / 2, z);
    return this.add(g, color);
  }
  /** Ship hull: flat stern at -L/2, parallel sides, tapered bow of length bowL; from y0 to y1. */
  hull(L, B, y0, y1, color, bowL = L * 0.18, sternR = 0.9, x = 0) {
    const s = new THREE.Shape();
    const hb = B / 2, hs = (B / 2) * sternR;
    // Shape coords (x, -z): rotateX(-PI/2) maps shape (x, s) depth d -> (x, d, -s).
    s.moveTo(x - hs, L / 2);
    s.lineTo(x + hs, L / 2);
    s.lineTo(x + hb, L / 2 - L * 0.12);
    s.lineTo(x + hb, -(L / 2 - bowL));
    s.quadraticCurveTo(x + hb * 0.85, -(L / 2 - bowL * 0.25), x, -L / 2);
    s.quadraticCurveTo(x - hb * 0.85, -(L / 2 - bowL * 0.25), x - hb, -(L / 2 - bowL));
    s.lineTo(x - hb, L / 2 - L * 0.12);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 5 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return this.add(g, color);
  }
  /** Double-sided triangle (sails). */
  tri(a, b, c, color) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array([...a, ...b, ...c, ...a, ...c, ...b]);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.computeVertexNormals();
    return this.add(g, color);
  }
  build() {
    let n = 0;
    for (const g of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of this.parts) {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

const WHITE = 0xf1f2f0, WINDOW = 0x1d2836, BLACK = 0x1b1c1f, RED = 0x8e2a22;

function containerShip() {
  const L = 300, B = 48, b = new Builder();
  b.hull(L, B, -9, 0.8, RED);
  b.hull(L, B, 0.8, 13, 0x1f3550);
  const palette = [0xb5371f, 0x1f5fa8, 0xd9a21b, 0x2f7d3c, 0x8c8f94, 0xe06a1b, 0x5a2d82, 0xc7c9cc, 0x2a8c8c, 0x7a1f1f];
  const r = rng(7);
  for (let z = -78; z <= 112; z += 13.2) {
    if (z > -58 && z < -40) continue; // superstructure gap
    const tiers = 3 + Math.floor(r() * 4);
    const wTaper = z > 90 ? 0.72 : 1;
    for (let t = 0; t < tiers; t++) {
      b.box((B - 4) * wTaper, 2.55, 12.2, 0, 13 + t * 2.6, z, palette[Math.floor(r() * palette.length)]);
    }
  }
  b.box(40, 26, 14, 0, 13, -50, WHITE);          // accommodation block
  b.box(40.4, 2.2, 14.4, 0, 33, -50, WINDOW);     // window band
  b.box(52, 2, 10, 0, 39, -48, WHITE);            // bridge wings
  b.box(10, 18, 12, 0, 13, -120, 0x2b2b2b);       // funnel
  b.box(10.4, 3, 12.4, 0, 28, -120, 0xb5371f);
  b.box(B - 8, 4, 18, 0, 13, 135, 0x1f3550);      // forecastle
  return b.build();
}

function tanker() {
  const L = 250, B = 44, b = new Builder();
  b.hull(L, B, -8, 0.8, RED, L * 0.16);
  b.hull(L, B, 0.8, 11, 0x2a2f33, L * 0.16);
  b.box(B - 6, 0.6, L * 0.62, 0, 11, 10, 0x6d7f5a); // deck
  b.box(2.2, 1.6, L * 0.6, 0, 11.6, 10, 0x9aa0a6);  // pipe rack
  b.box(30, 2.5, 4, 0, 11.6, 5, 0x9aa0a6);          // manifold
  b.box(34, 18, 20, 0, 11, -96, WHITE);
  b.box(34.4, 2, 20.4, 0, 25, -96, WINDOW);
  b.box(44, 1.8, 9, 0, 29, -92, WHITE);
  b.box(8, 12, 9, 0, 29, -108, 0x2b2b2b);
  b.box(8.4, 2.5, 9.4, 0, 37, -108, 0x1f5fa8);
  return b.build();
}

function tug() {
  const L = 30, B = 11, b = new Builder();
  b.hull(L, B, -2.4, 0.5, RED, L * 0.3, 0.85);
  b.hull(L, B, 0.5, 2.6, BLACK, L * 0.3, 0.85);
  b.box(7, 3, 11, 0, 2.6, 2, WHITE);
  b.box(6, 2.6, 5, 0, 5.6, 4, WHITE);
  b.box(6.2, 1.1, 5.2, 0, 6.8, 4, WINDOW);
  b.box(1.6, 3.2, 1.6, 1.6, 5.6, -1.5, 0xc8392b);
  b.box(1.6, 3.2, 1.6, -1.6, 5.6, -1.5, 0xc8392b);
  b.box(0.3, 4, 0.3, 0, 8.2, 4, 0xdddddd);
  return b.build();
}

function sailboat() {
  const L = 12, B = 3.8, b = new Builder();
  b.hull(L, B, -0.7, 1.0, WHITE, L * 0.35, 0.8);
  b.box(2.2, 0.8, 3.4, 0, 1.0, -1.2, 0xe8e2d6);
  b.box(0.16, 15.5, 0.16, 0, 1.0, 0.8, 0xc9cbd0);         // mast
  b.box(0.12, 0.12, 4.6, 0, 2.4, -1.5, 0xc9cbd0);         // boom
  b.tri([0, 2.6, 0.7], [0, 16.0, 0.75], [0, 2.6, -3.7], 0xfbfbf7); // main
  b.tri([0, 2.0, 1.0], [0, 14.5, 0.95], [0, 1.6, 5.4], 0xf4f4ef);  // jib
  return b.build();
}

function passengerFerry() {
  const L = 40, B = 12, b = new Builder();
  for (const x of [-4.4, 4.4]) {
    b.hull(L, 3.2, -1.4, 0.4, 0x23334a, L * 0.3, 0.7, x);
    b.hull(L, 3.2, 0.4, 2.0, WHITE, L * 0.3, 0.7, x);
  }
  b.box(B, 0.8, L * 0.8, 0, 1.8, -2, WHITE);              // bridge deck between hulls
  b.box(B - 0.6, 2.8, L * 0.66, 0, 2.6, -2, WHITE);       // main cabin
  b.box(B - 0.4, 1.3, L * 0.6, 0, 3.4, -2, WINDOW);
  b.box(B - 2.4, 2.4, L * 0.34, 0, 5.4, 1, WHITE);        // upper cabin
  b.box(B - 2.2, 1.1, L * 0.3, 0, 6.0, 1, WINDOW);
  b.box(B + 0.1, 0.5, L * 0.82, 0, 2.2, -2, 0x1d6fb8);    // livery stripe
  b.box(0.25, 3, 0.25, 0, 7.8, 3, 0xdddddd);
  return b.build();
}

function carFerry() {
  const L = 90, B = 20, b = new Builder();
  b.hull(L, B, -3.2, 0.6, 0x23334a, L * 0.16, 0.95);
  b.hull(L, B, 0.6, 6.5, WHITE, L * 0.16, 0.95);
  b.box(B + 0.1, 0.8, L * 0.8, 0, 3.2, -2, 0x1d6fb8);
  b.box(B - 1.2, 4.2, L * 0.55, 0, 6.5, -6, WHITE);
  b.box(B - 1.0, 1.4, L * 0.5, 0, 7.8, -6, WINDOW);
  b.box(B - 4, 3, 10, 0, 10.7, 6, WHITE);
  b.box(B + 2, 1.2, 4, 0, 12.4, 8, WINDOW);
  b.box(3.4, 6, 4, 0, 10.7, -16, 0x1d6fb8);
  b.box(3.6, 1.2, 4.2, 0, 16.7, -16, BLACK);
  return b.build();
}

/** type -> { geometry, length, beam, height } */
export const VESSEL_TYPES = {
  container: { make: containerShip, length: 300, beam: 48, height: 40, hp: 12 },
  tanker: { make: tanker, length: 250, beam: 44, height: 38, hp: 10 },
  tug: { make: tug, length: 30, beam: 11, height: 12, hp: 2 },
  sailboat: { make: sailboat, length: 12, beam: 3.8, height: 16, hp: 0.6 },
  ferry: { make: passengerFerry, length: 40, beam: 12, height: 9, hp: 4 },
  carferry: { make: carFerry, length: 90, beam: 20, height: 18, hp: 7 },
};

let wakeTex = null;
/** Soft V-shaped foam wake texture (bow at v = 1, fading astern). */
export function wakeTexture() {
  if (wakeTex || typeof document === 'undefined') return wakeTex;
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);            // 0 = bow, 1 = far astern
    const spread = 0.08 + t * 0.42;   // half-width of the V at this distance
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5);
      const arm = Math.exp(-Math.pow((u - spread) / (0.025 + t * 0.05), 2));
      const centre = Math.exp(-Math.pow(u / (0.05 + t * 0.06), 2)) * 0.8;
      const a = Math.min(1, arm * 0.9 + centre) * Math.pow(1 - t, 1.4) * (u < spread + 0.1 ? 1 : 0.3);
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  wakeTex = new THREE.CanvasTexture(c);
  wakeTex.colorSpace = THREE.SRGBColorSpace;
  return wakeTex;
}
