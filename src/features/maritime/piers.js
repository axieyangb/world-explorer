/**
 * [feature/ferries-ships] Piers from OpenMapTiles `transportation class=pier` (polygons + lines) at Z14:
 * a solid deck slab slightly above the water with pilings, added to each loaded chunk group, plus
 * synthetic deck segments so walking / driving uses the existing road-surface sampler
 * (sampleRoadSurfaceIndexed) and water physics treats the deck as support.
 */
import * as THREE from '../../../vendor/three.module.js';
import { fetchDecodedMvtTile, latLonToTileXY } from '../../global_tiles.js';
import { getBeijingTerrainElevation } from '../../environment.js';
import { llToWorld, worldToLl, tileBoxWorld, clipRing, clipLine, ringArea, pointInRing } from './geo.js';

const DECK_ABOVE_WATER = 1.3;  // m, deck top above the water surface
const SLAB = 0.7;              // m, deck thickness
const LINE_PIER_W = 4.0;       // m, width for pier ways mapped as lines
const PILE_STEP = 6.0;         // m, perimeter piling spacing
const PILE_GRID = 10.0;        // m, interior piling spacing (piers standing in water)
const MAX_PILES = 1800;        // per chunk
const SCAN = 2.4;              // m, spacing of deck support segments

const TOP = new THREE.Color(0x8d8476);
const SIDE = new THREE.Color(0x5a534a);

let deckMat = null, pileMat = null;
function mats() {
  if (!deckMat) {
    deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    pileMat = new THREE.MeshStandardMaterial({ color: 0x3b332b, roughness: 0.95, metalness: 0.0 });
  }
  return { deckMat, pileMat };
}

/** Pier rings / strips (world coords) inside the chunk box, from the cached Z14 tiles. */
async function extractPiers(origin, ox, oz) {
  const pad = 2;
  const box = [ox - 500 - pad, oz - 500 - pad, ox + 500 + pad, oz + 500 + pad];
  const [la0, lo0] = worldToLl(origin, box[0], box[1]);
  const [la1, lo1] = worldToLl(origin, box[2], box[3]);
  const [tx0, ty0] = latLonToTileXY(la0, lo0, 14);
  const [tx1, ty1] = latLonToTileXY(la1, lo1, 14);
  const polys = [];
  const lines = [];
  const jobs = [];
  for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
    for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
      jobs.push(fetchDecodedMvtTile(14, tx, ty).then((t) => ({ t, tb: tileBoxWorld(origin, 14, tx, ty) })));
    }
  }
  const cb = [ox - 500, oz - 500, ox + 500, oz + 500];
  for (const { t, tb } of await Promise.all(jobs)) {
    const b = [Math.max(tb[0], cb[0]), Math.max(tb[1], cb[1]), Math.min(tb[2], cb[2]), Math.min(tb[3], cb[3])];
    if (b[0] >= b[2] || b[1] >= b[3]) continue;
    for (const f of t.transportation || []) {
      if (f.tags.class !== 'pier') continue;
      if (f.type === 3) {
        for (const poly of f.geom) {
          const outer = clipRing(dedupe(poly.outer.map((p) => llToWorld(origin, p[0], p[1]))), b);
          if (!outer || Math.abs(ringArea(outer)) < 6) continue;
          const holes = [];
          for (const h of poly.holes || []) {
            const c = clipRing(dedupe(h.map((p) => llToWorld(origin, p[0], p[1]))), b);
            if (c && Math.abs(ringArea(c)) > 2) holes.push(c);
          }
          polys.push({ outer: dedupe(outer), holes });
        }
      } else if (f.type === 2) {
        for (const line of f.geom) {
          const w = line.map((p) => llToWorld(origin, p[0], p[1]));
          for (const piece of clipLine(w, b)) lines.push(piece);
        }
      }
    }
  }
  return { polys, lines };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 0.05 || Math.abs(q[1] - p[1]) > 0.05) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], z = out[out.length - 1];
    if (Math.abs(a[0] - z[0]) < 0.05 && Math.abs(a[1] - z[1]) < 0.05) out.pop();
  }
  return out;
}

class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, up) {
    // a/b/c: [x, y, z]; orient so the normal points up (top faces) or keep given order.
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (up && ny < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx / l, ny / l, nz / l);
      this.c.push(col.r, col.g, col.b);
    }
  }
  // Vertical quad along edge (x1,z1)->(x2,z2) from yb to yt, facing outward (right-hand side of a CCW ring).
  wall(x1, z1, x2, z2, yb, yt, col) {
    this.tri([x1, yb, z1], [x2, yb, z2], [x2, yt, z2], col, false);
    this.tri([x1, yb, z1], [x2, yt, z2], [x1, yt, z1], col, false);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Builds pier meshes + deck segments for one loaded chunk group. Returns { stats } or null when the
 * chunk is gone / origin changed by the time tiles arrive.
 */
export async function buildChunkPiers(app, group) {
  const ud = group.userData;
  const origin = app.worldOrigin;
  if (!origin) return null;
  const { polys, lines } = await extractPiers(origin, ud.ox, ud.oz);
  if (app.worldOrigin !== origin || app.loadedChunks.get(`${ud.cx},${ud.cz}`) !== group) return null;
  if (!polys.length && !lines.length) return { piers: 0, segs: 0, piles: 0 };

  const water = app.water;
  const inWater = (x, z) => (water ? water.isPointInWater(x, z) : false);
  const waterY = (x, z) => (water ? water.getWaterSurfaceY(x, z) : getBeijingTerrainElevation(x, z) + 0.28);
  const deckYAt = (x, z) => Math.max(waterY(x, z) + DECK_ABOVE_WATER, getBeijingTerrainElevation(x, z) + 0.15);

  const ox = ud.ox, oz = ud.oz;
  const buf = new Buf();
  const piles = [];
  const segs = [];

  const addPile = (x, z, top) => {
    if (piles.length >= MAX_PILES) return;
    const wy = waterY(x, z);
    if (top - wy < 0.3) return;
    piles.push(x, z, wy - 3.0, top);
  };

  const ref = (s) => ({ ...s, deck: false, bridge: true, ref: '' });

  for (const { outer, holes } of polys) {
    // Orient outer CCW-in-screen (so walls face outward), holes the opposite way.
    const ccw = (r, want) => ((ringArea(r) > 0) === want ? r : r.slice().reverse());
    const o = ccw(outer, true);
    const hs = holes.map((h) => ccw(h, false));
    let cx = 0, cz = 0;
    for (const p of o) { cx += p[0]; cz += p[1]; }
    cx /= o.length; cz /= o.length;
    const yTop = deckYAt(cx, cz);
    const yBot = yTop - SLAB;
    // Top face
    const contour = o.map((p) => new THREE.Vector2(p[0], p[1]));
    const holeV = hs.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const all = contour.concat(...holeV);
    let faces = [];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holeV); } catch { faces = []; }
    for (const [a, b, c] of faces) {
      const A = all[a], B = all[b], C = all[c];
      buf.tri([A.x - ox, yTop, A.y - oz], [B.x - ox, yTop, B.y - oz], [C.x - ox, yTop, C.y - oz], TOP, true);
    }
    // Slab edges + perimeter piles
    for (const ring of [o, ...hs]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        // Outer rings have positive ringArea and holes negative: built b->a, walls face away from the deck.
        buf.wall(b[0] - ox, b[1] - oz, a[0] - ox, a[1] - oz, yBot, yTop, SIDE);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ring !== o || L < 0.5) continue;
        const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // one side normal
        for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
          const px = a[0] + (b[0] - a[0]) * (s / L), pz = a[1] + (b[1] - a[1]) * (s / L);
          // Inset 0.8 m toward the inside; only where open water lies just outside the edge.
          const inX = pointInRing(px + nx * 0.8, pz + nz * 0.8, o) ? 0.8 : -0.8;
          const qx = px + nx * inX, qz = pz + nz * inX;
          if (inWater(px - nx * inX * 3, pz - nz * inX * 3) || inWater(qx, qz)) addPile(qx, qz, yBot);
        }
      }
    }
    // Interior grid of piles when the pier itself stands in water.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of o) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    for (let x = minX + PILE_GRID * 0.5; x < maxX; x += PILE_GRID) {
      for (let z = minZ + PILE_GRID * 0.5; z < maxZ; z += PILE_GRID) {
        if (!pointInRing(x, z, o) || hs.some((h) => pointInRing(x, z, h))) continue;
        if (inWater(x, z)) addPile(x, z, yBot);
      }
    }
    // Deck support segments: scanlines along the principal axis.
    scanSegments(o, hs, yTop, (s) => { s.ref = ref(s); segs.push(s); });
  }

  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.3) continue;
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const nx = -dz * LINE_PIER_W * 0.5, nz = dx * LINE_PIER_W * 0.5;
      const y1 = deckYAt(a[0], a[1]), y2 = deckYAt(b[0], b[1]);
      const ext = Math.min(1.0, L * 0.5); // overlap joints
      const ax = a[0] - dx * (i ? ext : 0), az = a[1] - dz * (i ? ext : 0);
      const P = [
        [ax + nx - ox, y1, az + nz - oz], [b[0] + nx - ox, y2, b[1] + nz - oz],
        [b[0] - nx - ox, y2, b[1] - nz - oz], [ax - nx - ox, y1, az - nz - oz],
      ];
      buf.tri(P[0], P[1], P[2], TOP, true);
      buf.tri(P[0], P[2], P[3], TOP, true);
      const yb = Math.min(y1, y2) - SLAB, yt = Math.max(y1, y2);
      buf.wall(P[0][0], P[0][2], P[1][0], P[1][2], yb, yt, SIDE);
      buf.wall(P[2][0], P[2][2], P[3][0], P[3][2], yb, yt, SIDE);
      buf.wall(P[3][0], P[3][2], P[0][0], P[0][2], y1 - SLAB, y1, SIDE);
      buf.wall(P[1][0], P[1][2], P[2][0], P[2][2], y2 - SLAB, y2, SIDE);
      for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const yp = y1 + (y2 - y1) * (s / L) - SLAB;
        addPile(px + nx * 0.8, pz + nz * 0.8, yp);
        addPile(px - nx * 0.8, pz - nz * 0.8, yp);
      }
      const s = { x1: a[0], y1, z1: a[1], x2: b[0], y2, z2: b[1], width: LINE_PIER_W - 1.0, layer: 0, bridge: false, tunnel: false, deck: true, cls: 'pier', name: '' };
      s.ref = ref(s);
      segs.push(s);
    }
  }

  const { deckMat, pileMat } = mats();
  const root = new THREE.Group();
  root.name = 'maritime-piers';
  const g = buf.geometry();
  if (g) {
    const mesh = new THREE.Mesh(g, deckMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const nP = piles.length / 4;
  if (nP) {
    const pg = new THREE.CylinderGeometry(0.32, 0.36, 1, 6);
    pg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(pg, pileMat, nP);
    const m = new THREE.Matrix4();
    for (let i = 0; i < nP; i++) {
      const x = piles[i * 4], z = piles[i * 4 + 1], y0 = piles[i * 4 + 2], y1 = piles[i * 4 + 3];
      m.makeScale(1, Math.max(0.2, y1 - y0), 1);
      m.setPosition(x - ox, y0, z - oz);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  }
  group.add(root);

  // Walk/drive support: append deck segments and force the road grid to rebuild lazily.
  if (segs.length) {
    if (!ud.roadSegments) ud.roadSegments = [];
    ud.deckSegments = (ud.deckSegments || []).concat(segs);
    ud.roadGrid = undefined;
  }
  ud.maritimePiers = { piers: polys.length + lines.length, segs: segs.length, piles: nP };
  return ud.maritimePiers;
}

/** Parallel support segments clipped to the polygon (with holes) along its principal axis. */
function scanSegments(outer, holes, y, emit) {
  let mx = 0, mz = 0;
  for (const p of outer) { mx += p[0]; mz += p[1]; }
  mx /= outer.length; mz /= outer.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of outer) { const dx = p[0] - mx, dz = p[1] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(ang), uz = Math.sin(ang); // main axis
  const vx = -uz, vz = ux;                       // scan offset axis
  const rings = [outer, ...holes];
  let vMin = Infinity, vMax = -Infinity;
  for (const p of outer) { const v = (p[0] - mx) * vx + (p[1] - mz) * vz; vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }
  const ts = [];
  let count = 0;
  for (let v = vMin + SCAN * 0.5; v < vMax && count < 600; v += SCAN) {
    ts.length = 0;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const vi = (r[i][0] - mx) * vx + (r[i][1] - mz) * vz;
        const vj = (r[j][0] - mx) * vx + (r[j][1] - mz) * vz;
        if ((vi > v) === (vj > v)) continue;
        const t = (v - vi) / (vj - vi);
        const px = r[i][0] + (r[j][0] - r[i][0]) * t, pz = r[i][1] + (r[j][1] - r[i][1]) * t;
        ts.push((px - mx) * ux + (pz - mz) * uz);
      }
    }
    ts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < ts.length; k += 2) {
      const a = ts[k] + 1.0, b = ts[k + 1] - 1.0;
      if (b - a < 0.5) continue;
      const bx = mx + vx * v, bz = mz + vz * v;
      emit({
        x1: bx + ux * a, y1: y, z1: bz + uz * a, x2: bx + ux * b, y2: y, z2: bz + uz * b,
        width: SCAN, layer: 0, bridge: false, tunnel: false, deck: true, cls: 'pier', name: '',
      });
      count++;
    }
  }
}
