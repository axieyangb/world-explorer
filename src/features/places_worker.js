// Places feature (worker side, stage 2): turns extracted place features + built chunk data into
//   1. static chunk meshes (airport surfaces/markings, stadium bowls, terminal massing, bridge steel)
//      appended to the chunk's existing sub-groups so they ride the normal worker->main transfer, and
//   2. compact per-kind instance arrays (stride 8: x, y, z, rotY, sx, sy, sz, rgb) for the main-thread
//      InstancedMesh pools in `places.js` (rooftop detail, awnings/signs, transit markers, planes, ships),
//   3. label candidates, rail polylines for moving trains, and aviation beacon positions.
// Hooked from `createChunkBuildTask` stage 3 in src/chunk_builder.js.

import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';

export const PLACE_INSTANCE_STRIDE = 8;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z, salt = 0) {
  let h = (Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function pointInRing(px, pz, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1];
    const xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
  return Math.abs(a) * 0.5;
}

function ringBBox(flat) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i] < minX) minX = flat[i];
    if (flat[i] > maxX) maxX = flat[i];
    if (flat[i + 1] < minZ) minZ = flat[i + 1];
    if (flat[i + 1] > maxZ) maxZ = flat[i + 1];
  }
  return { minX, maxX, minZ, maxZ };
}

function longestEdge(flat) {
  let best = 0, bi = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const l = Math.hypot(flat[j * 2] - flat[i * 2], flat[j * 2 + 1] - flat[i * 2 + 1]);
    if (l > best) { best = l; bi = i; }
  }
  const j = (bi + 1) % n;
  return {
    len: best,
    x1: flat[bi * 2], z1: flat[bi * 2 + 1], x2: flat[j * 2], z2: flat[j * 2 + 1],
    angle: Math.atan2(flat[j * 2] - flat[bi * 2], flat[j * 2 + 1] - flat[bi * 2 + 1]),
  };
}

function distToPolyline(px, pz, flat) {
  let best = Infinity;
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Liang-Barsky clip of a segment to the chunk square; returns [t0, t1] or null
function clipSegT(x1, z1, x2, z2, b) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 + b, b - x1, z1 + b, b - z1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [t0, t1];
}

class MeshAccum {
  constructor() { this.pos = []; this.col = []; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, rgb) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  quad(a, b, c, d, rgb) {
    // a,b,c,d: [x,y,z] counter-clockwise when viewed from the front
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], rgb);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], rgb);
  }
  quad2(a, b, c, d, rgb) {
    this.quad(a, b, c, d, rgb);
    this.quad(d, c, b, a, rgb);
  }
  // Oriented box: center (x,z), bottom y0, top y1, half-length hl along (dx,dz), half-width hw along normal
  box(x, z, y0, y1, dx, dz, hl, hw, rgb) {
    const nx = -dz, nz = dx;
    const c = [
      [x - dx * hl - nx * hw, z - dz * hl - nz * hw],
      [x + dx * hl - nx * hw, z + dz * hl - nz * hw],
      [x + dx * hl + nx * hw, z + dz * hl + nz * hw],
      [x - dx * hl + nx * hw, z - dz * hl + nz * hw],
    ];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      this.quad2([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], rgb);
    }
    this.quad2([c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]], rgb);
  }
  toMesh(mat, castShadow = false) {
    if (this.pos.length === 0) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const u8 = new Uint8Array(this.col.length);
    for (let i = 0; i < this.col.length; i++) u8[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    geom.setAttribute('color', new THREE.BufferAttribute(u8, 3, true));
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// Ground surface triangles lifted onto the chunk terrain mesh (subdivided so long aprons follow the DEM)
function pushGroundTris(acc, flat, ox, oz, yOff, rgb, maxEdge = 40) {
  const contour = [];
  for (let i = 0; i < flat.length; i += 2) contour.push(new THREE.Vector2(flat[i], flat[i + 1]));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    return;
  }
  const stack = [];
  for (const [a, b, c] of tris) stack.push([contour[a].x, contour[a].y, contour[b].x, contour[b].y, contour[c].x, contour[c].y, 0]);
  const yAt = (x, z) => getChunkTerrainMeshElevation(ox + x, oz + z) + yOff;
  let guard = 0;
  while (stack.length && guard++ < 20000) {
    const [ax, az, bx, bz, cx, cz, depth] = stack.pop();
    const lab = Math.hypot(bx - ax, bz - az), lbc = Math.hypot(cx - bx, cz - bz), lca = Math.hypot(ax - cx, az - cz);
    const m = Math.max(lab, lbc, lca);
    if (m > maxEdge && depth < 7) {
      if (m === lab) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        stack.push([ax, az, mx, mz, cx, cz, depth + 1], [mx, mz, bx, bz, cx, cz, depth + 1]);
      } else if (m === lbc) {
        const mx = (bx + cx) / 2, mz = (bz + cz) / 2;
        stack.push([ax, az, bx, bz, mx, mz, depth + 1], [ax, az, mx, mz, cx, cz, depth + 1]);
      } else {
        const mx = (cx + ax) / 2, mz = (cz + az) / 2;
        stack.push([ax, az, bx, bz, mx, mz, depth + 1], [mx, mz, bx, bz, cx, cz, depth + 1]);
      }
      continue;
    }
    // ShapeUtils returns CCW in (x, y=z) space -> reverse for +Y facing in XZ
    acc.tri(ax, yAt(ax, az), az, cx, yAt(cx, cz), cz, bx, yAt(bx, bz), bz, rgb);
  }
}

// Flat ribbon along a segment, lifted onto the terrain, clipped to the chunk
function pushRibbon(acc, x1, z1, x2, z2, off, hw, yOff, ox, oz, rgb, step = 40) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.05) return;
  const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
  const nx = -dz, nz = dx;
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i < n; i++) {
    const ta = i / n, tb = (i + 1) / n;
    const ax = x1 + (x2 - x1) * ta + nx * off, az = z1 + (z2 - z1) * ta + nz * off;
    const bx = x1 + (x2 - x1) * tb + nx * off, bz = z1 + (z2 - z1) * tb + nz * off;
    const ya = getChunkTerrainMeshElevation(ox + ax, oz + az) + yOff;
    const yb = getChunkTerrainMeshElevation(ox + bx, oz + bz) + yOff;
    acc.quad(
      [ax - nx * hw, ya, az - nz * hw],
      [ax + nx * hw, ya, az + nz * hw],
      [bx + nx * hw, yb, bz + nz * hw],
      [bx - nx * hw, yb, bz - nz * hw],
      rgb
    );
  }
}

const STOREFRONT = new Set([
  'shop', 'grocery', 'clothing_store', 'restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream',
  'bakery', 'alcohol_shop', 'bank', 'pharmacy', 'hairdresser', 'laundry', 'jewelry', 'music', 'mobile_phone',
  'books', 'gift', 'shoe', 'furniture', 'hardware', 'florist', 'optician', 'deli', 'butcher', 'convenience',
  'lodging', 'pub', 'library', 'post', 'cinema', 'theatre', 'art_gallery', 'car', 'bicycle', 'dentist',
]);
const FOOD = new Set(['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery', 'pub']);
const AWNING_FOOD = [0xa8382c, 0x2f6e46, 0x7a2d3a, 0xb7652a, 0x23474f, 0x5b3a29];
const AWNING_SHOP = [0x2c3e66, 0x1f6f78, 0x3a3a3a, 0x8a1f2b, 0x4f6b2e, 0xb08d57, 0x6a4c8c];
const SIGN_COLORS = [0xece6da, 0x262626, 0xd9cdb4, 0x3b4a5a, 0xf2f2ee];

function isNycRegion(lat, lon) {
  return lat > 40.45 && lat < 41.0 && lon > -74.3 && lon < -73.65;
}

/**
 * @param {Object} ctx
 * @returns {{inst: Object<string, Float32Array>, labels: Array, rails: Float32Array[], beacons: Float32Array}}
 */
export function computePlacesPayload(ctx) {
  const { data, ox, oz, buildingEntities = [], roadSegments = [], isPointInWater, groups, mats } = ctx;
  const places = data && data.places;
  const out = {};
  const push = (kind, x, y, z, rot, sx, sy, sz, rgb = 0xffffff) => {
    (out[kind] || (out[kind] = [])).push(x, y, z, rot, sx, sy, sz, rgb);
  };
  const beacons = [];
  const labels = [];
  const rails = [];
  const terrainY = (lx, lz) => getBeijingTerrainElevation(ox + lx, oz + lz);
  const inWater = (lx, lz) => Boolean(isPointInWater && isPointInWater(lx, lz, 0));
  const lat = places ? places.lat : 0;
  const lon = places ? places.lon : 0;
  const nyc = isNycRegion(lat, lon);

  // Usable ground-level building footprints (local coords) — only include buildings actually extruded by WFC
  const blds = [];
  for (const b of buildingEntities) {
    if (!b || b.kind !== 'building' || !b.extruded) continue;
    const roofFlat = b.topRoofFlat && b.topRoofFlat.length >= 6 ? b.topRoofFlat : b.flatOuter;
    if (!roofFlat || roofFlat.length < 6) continue;
    if (b.topRoofHoles && b.topRoofHoles.length > 0) continue;
    const bb = ringBBox(roofFlat);
    blds.push({ e: b, flat: roofFlat, ...bb, area: ringArea(roofFlat) });
  }

  // ---------------------------------------------------------------- 1. Rooftop detail
  for (const B of blds) {
    const b = B.e;
    if (b.isPart || (b.minHeight || 0) > 0.5) continue;
    if (b.styleDisplay && String(b.styleDisplay).startsWith('40 Authentic')) continue;
    const rawH = b.height || 0;
    if (rawH < 7 || B.area < 60) continue;
    const spanX = B.maxX - B.minX, spanZ = B.maxZ - B.minZ;
    const cx = (B.minX + B.maxX) * 0.5, cz = (B.minZ + B.maxZ) * 0.5;
    const roofY = b.topY - 0.25;
    const totalSpan = b.topY - b.baseY;
    const hasPent = totalSpan >= 20 && spanX >= 14 && spanZ >= 14;
    const pw = Math.min(12, spanX * 0.34) * 0.5 + 0.6;
    const pd = Math.min(12, spanZ * 0.34) * 0.5 + 0.6;
    const ph = Math.min(3.4, Math.max(2.0, totalSpan * 0.05));
    const tall = totalSpan >= 38;
    const reach = tall ? 0.36 : 0.78;
    const rng = mulberry32(hash2(ox + cx, oz + cz, b.id || 7));
    const rot = longestEdge(B.flat).angle;
    const placed = [];

    const tryPlace = (r, tries = 8) => {
      for (let t = 0; t < tries; t++) {
        const px = cx + (rng() - 0.5) * spanX * reach;
        const pz = cz + (rng() - 0.5) * spanZ * reach;
        if (hasPent && Math.abs(px - cx) < pw + r && Math.abs(pz - cz) < pd + r) continue;
        const rr = r + 1.0;
        if (!pointInRing(px, pz, B.flat) || !pointInRing(px + rr, pz, B.flat) || !pointInRing(px - rr, pz, B.flat) ||
          !pointInRing(px, pz + rr, B.flat) || !pointInRing(px, pz - rr, B.flat)) continue;
        let clash = false;
        for (const p of placed) if (Math.hypot(p[0] - px, p[1] - pz) < p[2] + r + 0.6) { clash = true; break; }
        if (clash) continue;
        placed.push([px, pz, r]);
        return [px, pz];
      }
      return null;
    };

    // Tall towers: mast + aviation beacon
    if (rawH >= 60) {
      const topBase = hasPent ? roofY + ph : roofY;
      const mastP = rawH >= 120 ? 0.5 : rawH >= 90 ? 0.25 : 0.06;
      if (rng() < mastP) {
        const mh = Math.max(8, Math.min(45, rawH * 0.14));
        push('mast', ox + cx, topBase, oz + cz, rot, 1, mh, 1, 0xffffff);
        beacons.push(ox + cx, topBase + mh + 0.3, oz + cz);
      } else {
        beacons.push(ox + cx, topBase + 0.4, oz + cz);
      }
    }

    // Water tanks (classic NYC wooden tanks; rare elsewhere)
    let hasTank = false;
    const tankP = nyc ? (rawH >= 18 && rawH <= 95 ? 0.5 : 0.0) : (rawH >= 15 && rawH <= 60 ? 0.035 : 0.0);
    if (rng() < tankP) {
      const n = B.area > 1500 && rng() < 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const d = 3.8 + rng() * 1.8;
        const p = tryPlace(d * 0.5 + 0.4);
        if (!p) break;
        hasTank = true;
        push('tank', ox + p[0], roofY, oz + p[1], rng() * Math.PI, d, 6.5 + rng() * 2.0, d, rng() < 0.6 ? 0x8b6b4c : 0x6d5d4f);
      }
    }

    // HVAC units
    if (rng() < 0.85) {
      const n = Math.max(1, Math.min(7, Math.round(B.area / 300)));
      for (let k = 0; k < n; k++) {
        const w = 1.6 + rng() * 1.8, d = 1.6 + rng() * 1.6;
        const p = tryPlace(Math.max(w, d) * 0.55, 6);
        if (!p) continue;
        const g = 0.82 + rng() * 0.14;
        const shade = (Math.round(g * 255) << 16) | (Math.round(g * 255) << 8) | Math.round((g + 0.02) * 250);
        push('hvac', ox + p[0], roofY, oz + p[1], rot, w, 1.1 + rng() * 0.9, d, shade);
      }
    }

    // Vent stacks
    if (rng() < 0.5) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const p = tryPlace(0.4, 4);
        if (p) push('vent', ox + p[0], roofY, oz + p[1], 0, 0.5, 0.9 + rng() * 1.0, 0.5, 0xffffff);
      }
    }

    // Solar panel rows on low/mid-rise
    if (!tall && rawH <= 30 && B.area > 200 && rng() < 0.14) {
      const rows = 3 + Math.floor(rng() * 4);
      const along = Math.min(10, Math.max(3, Math.min(spanX, spanZ) * 0.4));
      const p = tryPlace(Math.max(along * 0.5, rows * 1.2) + 0.5, 6);
      if (p) {
        const dx = Math.sin(rot), dz = Math.cos(rot);
        const nx = -dz, nz = dx;
        for (let r = 0; r < rows; r++) {
          const o = (r - (rows - 1) / 2) * 2.4;
          push('solar', ox + p[0] + nx * o, roofY, oz + p[1] + nz * o, rot, along, 1, 1.7, 0xffffff);
        }
      }
    }

    // Rooftop garden
    if (!hasTank && rawH >= 9 && rawH <= 70 && B.area > 350 && rng() < 0.08) {
      const s = Math.min(spanX, spanZ) * 0.32;
      const p = tryPlace(s * 0.75, 6);
      if (p) push('garden', ox + p[0], roofY, oz + p[1], rot, s, 1, s, 0xffffff);
    }
  }

  // ---------------------------------------------------------------- 2. POIs: awnings, signs, transit markers, labels
  const awnings = [];
  // Ground road segments (local) used to keep street furniture off the carriageway
  const groundSegs = [];
  for (const s of roadSegments) {
    if (s.bridge || s.tunnel) continue;
    groundSegs.push([s.x1 - ox, s.z1 - oz, s.x2 - ox, s.z2 - oz, (s.width || 6) * 0.5]);
  }
  const pushOffRoad = (x, z) => {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const [ax, az, bx, bz, hw] of groundSegs) {
        if (x < Math.min(ax, bx) - hw - 3 || x > Math.max(ax, bx) + hw + 3 || z < Math.min(az, bz) - hw - 3 || z > Math.max(az, bz) + hw + 3) continue;
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const qx = ax + dx * t, qz = az + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d < hw + 1.5) {
          const l = Math.sqrt(l2);
          let nx = -dz / l, nz = dx / l;
          if ((x - qx) * nx + (z - qz) * nz < 0) { nx = -nx; nz = -nz; }
          x = qx + nx * (hw + 2.2);
          z = qz + nz * (hw + 2.2);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return [x, z];
  };
  for (const q of (places && places.pois) || []) {
    let [px, pz, cls, sub, name, nameEn] = q;
    const isTransit = cls === 'railway' || sub === 'subway_entrance' || sub === 'train_station_entrance';
    const isStore = STOREFRONT.has(cls);
    const rng = mulberry32(hash2(ox + px, oz + pz, 31));
    let labelY = terrainY(px, pz) + 4.6;

    if (isTransit) {
      [px, pz] = pushOffRoad(px, pz);
      push('transit', ox + px, terrainY(px, pz), oz + pz, rng() * Math.PI * 2, 1, 1, 1, sub === 'subway' || sub === 'subway_entrance' ? 0x1f5fbf : 0x2f7d4a);
      labelY = terrainY(px, pz) + 4.4;
    } else if (isStore) {
      // Nearest facade edge within 18 m
      let best = null;
      for (const B of blds) {
        if (B.e.isPart || (B.e.minHeight || 0) > 0.5 || (B.e.height || 0) < 5) continue;
        if (px < B.minX - 18 || px > B.maxX + 18 || pz < B.minZ - 18 || pz > B.maxZ + 18) continue;
        const f = B.flat;
        const n = f.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax = f[i * 2], az = f[i * 2 + 1], bx = f[j * 2], bz = f[j * 2 + 1];
          const dx = bx - ax, dz = bz - az;
          const l2 = dx * dx + dz * dz;
          if (l2 < 9) continue;
          const t = Math.max(0.12, Math.min(0.88, ((px - ax) * dx + (pz - az) * dz) / l2));
          const qx = ax + dx * t, qz = az + dz * t;
          const d = Math.hypot(px - qx, pz - qz);
          if (d < 18 && (!best || d < best.d)) best = { d, qx, qz, dx, dz, len: Math.sqrt(l2), B };
        }
      }
      if (best) {
        const l = best.len;
        let nx = best.dz / l, nz = -best.dx / l;
        if (pointInRing(best.qx + nx * 0.8, best.qz + nz * 0.8, best.B.flat)) { nx = -nx; nz = -nz; }
        let clash = false;
        for (const a of awnings) if (Math.hypot(a[0] - best.qx, a[1] - best.qz) < 4.2) { clash = true; break; }
        if (!clash) {
          awnings.push([best.qx, best.qz]);
          const w = Math.min(l * 0.8, 3.4 + rng() * 2.4);
          const depth = 1.5 + rng() * 0.5;
          const gy = terrainY(best.qx, best.qz);
          const rotY = Math.atan2(nx, nz);
          const pal = FOOD.has(cls) ? AWNING_FOOD : AWNING_SHOP;
          push('awning', ox + best.qx + nx * 0.12, gy + 2.6, oz + best.qz + nz * 0.12, rotY, w, 0.7, depth, pal[Math.floor(rng() * pal.length)]);
          push('sign', ox + best.qx + nx * 0.14, gy + 3.45, oz + best.qz + nz * 0.14, rotY, w * 0.86, 0.75, 0.14, SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length)]);
          labelY = gy + 5.0;
        }
      }
    }

    if (name && (isTransit || isStore || cls === 'attraction' || cls === 'museum')) {
      if (labels.length < 360) labels.push([ox + px, labelY, oz + pz, name, nameEn || name, isTransit ? 2 : cls === 'attraction' ? 1 : 0]);
    }
  }

  // ---------------------------------------------------------------- 3. Airports
  const aeroSurf = new MeshAccum();
  const aeroMark = new MeshAccum();
  const structs = new MeshAccum();
  const aeroPolys = (places && places.aeroPolys) || [];
  const aeroLines = (places && places.aeroLines) || [];
  const runwayLines = aeroLines.filter((l) => l[0] === 'runway');
  const SURF = { apron: [0.55, 0.55, 0.54], taxiway: [0.33, 0.33, 0.34], runway: [0.24, 0.24, 0.25], helipad: [0.45, 0.46, 0.46] };
  const SURF_Y = { apron: 0.30, helipad: 0.31, taxiway: 0.33, runway: 0.34 };
  let apronTotal = 0;
  let bigApron = null;
  for (const [cls, flat] of aeroPolys) {
    if (!SURF[cls]) continue;
    pushGroundTris(aeroSurf, flat, ox, oz, SURF_Y[cls], SURF[cls]);
    if (cls === 'apron') {
      const a = ringArea(flat);
      apronTotal += a;
      if (!bigApron || a > bigApron.area) bigApron = { flat, area: a };
    }
  }
  const WHITE = [0.93, 0.93, 0.9];
  const YELLOW = [0.95, 0.78, 0.18];
  for (const [cls, flat] of aeroLines) {
    const isRw = cls === 'runway';
    const hw = isRw ? 22.5 : 11.5;
    const yS = isRw ? 0.40 : 0.37;
    let acc = 0;
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3];
      const segLen = Math.hypot(bx - ax, bz - az);
      if (segLen < 0.5) continue;
      const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
      // Extend slightly so bends have no gaps
      const ext = Math.min(hw * 0.6, 8);
      const ex1 = i > 0 ? ax - dx * ext : ax, ez1 = i > 0 ? az - dz * ext : az;
      const ex2 = i + 4 < flat.length ? bx + dx * ext : bx, ez2 = i + 4 < flat.length ? bz + dz * ext : bz;
      const tt = clipSegT(ex1, ez1, ex2, ez2, 500);
      if (tt) {
        const cx1 = ex1 + (ex2 - ex1) * tt[0], cz1 = ez1 + (ez2 - ez1) * tt[0];
        const cx2 = ex1 + (ex2 - ex1) * tt[1], cz2 = ez1 + (ez2 - ez1) * tt[1];
        pushRibbon(aeroSurf, cx1, cz1, cx2, cz2, 0, hw, yS, ox, oz, SURF[cls]);
        if (isRw) {
          pushRibbon(aeroMark, cx1, cz1, cx2, cz2, hw - 1.6, 0.5, yS + 0.05, ox, oz, WHITE);
          pushRibbon(aeroMark, cx1, cz1, cx2, cz2, -(hw - 1.6), 0.5, yS + 0.05, ox, oz, WHITE);
          // Centerline dashes: 36 m dash / 24 m gap measured along the whole line
          const t0 = tt[0] * Math.hypot(ex2 - ex1, ez2 - ez1), t1 = tt[1] * Math.hypot(ex2 - ex1, ez2 - ez1);
          const base = acc - (i > 0 ? ext : 0);
          for (let s = Math.ceil((base + t0) / 60) * 60; s < base + t1; s += 60) {
            const s0 = s - base, s1 = Math.min(s0 + 36, t1);
            if (s1 - s0 < 2) continue;
            pushRibbon(aeroMark, ex1 + dx * s0, ez1 + dz * s0, ex1 + dx * s1, ez1 + dz * s1, 0, 0.45, yS + 0.05, ox, oz, WHITE);
          }
        } else {
          pushRibbon(aeroMark, cx1, cz1, cx2, cz2, 0, 0.18, yS + 0.05, ox, oz, YELLOW);
        }
      }
      acc += segLen;
    }
    // Runway threshold "piano keys" at true ends (skip ends that are just tile-split points)
    if (isRw && flat.length >= 4) {
      for (const end of [0, 1]) {
        const ix = end === 0 ? 0 : flat.length - 2;
        const jx = end === 0 ? 2 : flat.length - 4;
        const px = flat[ix], pz = flat[ix + 1];
        if (Math.abs(px) > 490 || Math.abs(pz) > 490) continue;
        let continues = false;
        for (const other of runwayLines) {
          if (other[1] === flat) continue;
          if (distToPolyline(px, pz, other[1]) < 20) { continues = true; break; }
        }
        if (continues) continue;
        const l = Math.hypot(flat[jx] - px, flat[jx + 1] - pz) || 1;
        const dx = (flat[jx] - px) / l, dz = (flat[jx + 1] - pz) / l;
        const nx = -dz, nz = dx;
        for (let k = -7; k <= 7; k++) {
          if (k === 0) continue;
          const o = k * 2.7 + (k > 0 ? 1.2 : -1.2);
          const sx = px + dx * 8 + nx * o, sz = pz + dz * 8 + nz * o;
          pushRibbon(aeroMark, sx, sz, sx + dx * 30, sz + dz * 30, 0, 0.9, yS + 0.05, ox, oz, WHITE);
        }
      }
    }
  }

  // Parked planes on aprons
  let planeCount = 0;
  const planePts = [];
  for (const [cls, flat] of aeroPolys) {
    if (cls !== 'apron' || planeCount >= 10) continue;
    const area = ringArea(flat);
    if (area < 6000) continue;
    const maxN = Math.min(5, Math.floor(area / 9000) + 1);
    const bb = ringBBox(flat);
    const edge = longestEdge(flat);
    const rng = mulberry32(hash2(ox + bb.minX, oz + bb.minZ, 101));
    let n = 0;
    for (let tries = 0; tries < 40 && n < maxN && planeCount < 10; tries++) {
      const px = bb.minX + rng() * (bb.maxX - bb.minX);
      const pz = bb.minZ + rng() * (bb.maxZ - bb.minZ);
      const wide = rng() < 0.3;
      const r = wide ? 34 : 21;
      if (!pointInRing(px, pz, flat)) continue;
      let ok = true;
      for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!pointInRing(px + ddx * r, pz + ddz * r, flat)) { ok = false; break; }
      }
      if (!ok) continue;
      for (const p of planePts) if (Math.hypot(p[0] - px, p[1] - pz) < p[2] + r + 6) { ok = false; break; }
      if (!ok) continue;
      for (const rl of runwayLines) if (distToPolyline(px, pz, rl[1]) < 70) { ok = false; break; }
      if (!ok) continue;
      for (const B of blds) {
        if (px > B.minX - r && px < B.maxX + r && pz > B.minZ - r && pz < B.maxZ + r) { ok = false; break; }
      }
      const bb2 = (places && places.bldBoxes) || [];
      for (let k = 0; ok && k < bb2.length; k += 4) {
        if (px > bb2[k] - r && px < bb2[k + 2] + r && pz > bb2[k + 1] - r && pz < bb2[k + 3] + r) ok = false;
      }
      if (!ok) continue;
      planePts.push([px, pz, r]);
      const rot = edge.angle + Math.PI * 0.5 + (rng() < 0.5 ? 0 : Math.PI);
      const s = wide ? 1.6 : 1.0;
      const y = getChunkTerrainMeshElevation(ox + px, oz + pz) + 0.3;
      const tail = [0xc8102e, 0x003a70, 0x0b6e4f, 0xf2a900, 0x5c2d91, 0x1d1d1d, 0x00a3e0][Math.floor(rng() * 7)];
      push('plane', ox + px, y, oz + pz, rot, s, s, s, 0xffffff);
      push('planeTail', ox + px, y, oz + pz, rot, s, s, s, tail);
      n++;
      planeCount++;
    }
  }

  // Simple terminal massing when an airport chunk has big aprons but no large building
  if (bigApron && apronTotal > 25000) {
    let hasBig = false;
    for (const B of blds) if (B.area > 2500) { hasBig = true; break; }
    if (!hasBig) {
      const e = longestEdge(bigApron.flat);
      const ex = (e.x2 - e.x1) / (e.len || 1), ez = (e.z2 - e.z1) / (e.len || 1);
      let nx = ez, nz = -ex;
      const mx = (e.x1 + e.x2) / 2, mz = (e.z1 + e.z2) / 2;
      if (pointInRing(mx + nx * 2, mz + nz * 2, bigApron.flat)) { nx = -nx; nz = -nz; }
      const L = Math.min(260, e.len * 0.8);
      const D = 42;
      const tx = mx + nx * (D / 2 + 12), tz = mz + nz * (D / 2 + 12);
      let ok = L > 60 && Math.abs(tx) < 480 && Math.abs(tz) < 480 && !inWater(tx, tz);
      if (ok) for (const rl of runwayLines) if (distToPolyline(tx, tz, rl[1]) < 120) { ok = false; break; }
      const bb3 = (places && places.bldBoxes) || [];
      for (let k = 0; ok && k < bb3.length; k += 4) {
        if ((bb3[k + 2] - bb3[k]) * (bb3[k + 3] - bb3[k + 1]) > 2500 &&
          Math.abs((bb3[k] + bb3[k + 2]) / 2 - tx) < 400 && Math.abs((bb3[k + 1] + bb3[k + 3]) / 2 - tz) < 400) ok = false;
      }
      if (ok) {
        const gy = getBeijingTerrainElevation(ox + tx, oz + tz) - 0.5;
        structs.box(tx, tz, gy, gy + 6.5, ex, ez, L / 2, D / 2, [0.78, 0.78, 0.76]);
        structs.box(tx, tz, gy + 6.5, gy + 15.5, ex, ez, L / 2 - 1, D / 2 - 1, [0.32, 0.45, 0.55]);
        structs.box(tx, tz, gy + 15.5, gy + 17.0, ex, ez, L / 2 + 3, D / 2 + 3, [0.86, 0.86, 0.84]);
      }
    }
  }

  // ---------------------------------------------------------------- 4. Ships near piers / on big water
  const ships = [];
  const shipFits = (x, z, dx, dz, hl, hw) => {
    const nx = -dz, nz = dx;
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0.6, 1], [0.6, -1], [-0.6, 1], [-0.6, -1]]) {
      const qx = x + dx * hl * a + nx * hw * b, qz = z + dz * hl * a + nz * hw * b;
      if (Math.abs(qx) > 500 || Math.abs(qz) > 500 || !inWater(qx, qz)) return false;
    }
    for (const s of ships) if (Math.hypot(s[0] - x, s[1] - z) < s[2] + hl + 10) return false;
    return true;
  };
  const addShip = (x, z, dx, dz, big, rng) => {
    const s = big ? 1.0 : 0.45;
    ships.push([x, z, 60 * s]);
    const y = getBeijingTerrainElevation(ox + x, oz + z) + 0.28;
    const tint = [0xffffff, 0xdfe6f0, 0xf0e2da, 0xe2eadf][Math.floor(rng() * 4)];
    push('ship', ox + x, y, oz + z, Math.atan2(dx, dz), s, s, s, tint);
  };
  if (isPointInWater) {
    for (const pier of (places && places.piers) || []) {
      if (ships.length >= 3) break;
      for (let i = 0; i + 3 < pier.length && ships.length < 3; i += 2) {
        const ax = pier[i], az = pier[i + 1], bx = pier[i + 2], bz = pier[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 40) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const rng = mulberry32(hash2(ox + ax, oz + az, 57));
        for (let s = 30; s < len - 20 && ships.length < 3; s += 90) {
          const mx = ax + dx * s, mz = az + dz * s;
          for (const side of [1, -1]) {
            const off0 = 16;
            const x0 = mx - dz * side * off0, z0 = mz + dx * side * off0;
            // Big cargo ships only where the water is wide (harbours), small vessels on rivers/canals
            const big = rng() < 0.55 && shipFits(x0 - dz * side * 14, z0 + dx * side * 14, dx, dz, 85, 30);
            const hl = big ? 58 : 26, hw = big ? 10 : 5;
            const off = hw + 6;
            const x = mx - dz * side * off, z = mz + dx * side * off;
            if (shipFits(x, z, dx, dz, hl, hw)) { addShip(x, z, dx, dz, big, rng); break; }
            if (big && shipFits(x, z, dx, dz, 26, 5)) { addShip(x, z, dx, dz, false, rng); break; }
          }
        }
      }
    }
    // Open water: at most one vessel per chunk where the water is wide enough
    if (ships.length === 0 && (data.water_polys || []).some((w) => w[2] && ringArea(w[2]) > 150000)) {
      const rng = mulberry32(hash2(ox, oz, 77));
      for (let t = 0; t < 14; t++) {
        const x = (rng() - 0.5) * 900, z = (rng() - 0.5) * 900;
        const a = rng() * Math.PI * 2;
        const dx = Math.sin(a), dz = Math.cos(a);
        if (shipFits(x, z, dx, dz, 90, 40)) { addShip(x, z, dx, dz, true, rng); break; }
        if (shipFits(x, z, dx, dz, 30, 7)) { addShip(x, z, dx, dz, false, rng); break; }
      }
    }
  }

  // ---------------------------------------------------------------- 5. Stadium bowls (landuse=stadium without a stadium building)
  for (const flat of (places && places.stadiums) || []) {
    const area = ringArea(flat);
    if (area < 6000) continue;
    let mx = 0, mz = 0;
    const n = flat.length / 2;
    for (let i = 0; i < flat.length; i += 2) { mx += flat[i]; mz += flat[i + 1]; }
    mx /= n; mz /= n;
    let covered = false;
    for (const B of blds) {
      if (mx < B.minX || mx > B.maxX || mz < B.minZ || mz > B.maxZ) continue;
      if (B.e.btype === 'stadium' || B.area > area * 0.35) { covered = true; break; }
    }
    if (covered) continue;
    let cxx = 0, czz = 0, cxz = 0;
    for (let i = 0; i < flat.length; i += 2) {
      const dx = flat[i] - mx, dz = flat[i + 1] - mz;
      cxx += dx * dx; czz += dz * dz; cxz += dx * dz;
    }
    const th = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    const ux = Math.cos(th), uz = Math.sin(th);
    let a = 0, b = 0;
    for (let i = 0; i < flat.length; i += 2) {
      const dx = flat[i] - mx, dz = flat[i + 1] - mz;
      a = Math.max(a, Math.abs(dx * ux + dz * uz));
      b = Math.max(b, Math.abs(-dx * uz + dz * ux));
    }
    a *= 0.9; b *= 0.9;
    if (a < 45 || b < 35) continue;
    const H = Math.max(12, Math.min(30, b * 0.28));
    const gy = getBeijingTerrainElevation(ox + mx, oz + mz);
    const rng = mulberry32(hash2(ox + mx, oz + mz, 211));
    const team = [[0.70, 0.16, 0.16], [0.14, 0.30, 0.62], [0.16, 0.50, 0.30], [0.85, 0.62, 0.12]][Math.floor(rng() * 4)];
    const seatGrey = [0.62, 0.63, 0.66];
    const concrete = [0.74, 0.73, 0.70];
    const N = 56;
    const P = (s, ang, y) => {
      const ex = Math.cos(ang) * a * s, ez = Math.sin(ang) * b * s;
      return [mx + ex * ux - ez * uz, y, mz + ex * uz + ez * ux];
    };
    const IN = 0.6, FIELD = 0.48;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      // Outer facade (faces outward)
      structs.quad2(P(1, a1, gy - 1), P(1, a0, gy - 1), P(1, a0, gy + H), P(1, a1, gy + H), concrete);
      // Seating rake in 3 tiers (faces inward/up)
      for (let t = 0; t < 3; t++) {
        const s0 = IN + (0.97 - IN) * (t / 3), s1 = IN + (0.97 - IN) * ((t + 1) / 3);
        const y0 = gy + 3 + (H - 3) * (t / 3), y1 = gy + 3 + (H - 3) * ((t + 1) / 3);
        const c = (k + t) % 2 === 0 ? team : seatGrey;
        structs.quad2(P(s0, a0, y0), P(s0, a1, y0), P(s1, a1, y1), P(s1, a0, y1), c);
      }
      // Rim between rake top and facade
      structs.quad2(P(0.97, a0, gy + H), P(0.97, a1, gy + H), P(1, a1, gy + H), P(1, a0, gy + H), concrete);
      // Cantilever roof canopy (double sided)
      structs.quad2(P(1, a0, gy + H + 2.5), P(1, a1, gy + H + 2.5), P(0.84, a1, gy + H + 1.6), P(0.84, a0, gy + H + 1.6), [0.88, 0.88, 0.86]);
      // Inner podium wall (faces inward)
      structs.quad2(P(IN, a1, gy + 0.2), P(IN, a1, gy + 3), P(IN, a0, gy + 3), P(IN, a0, gy + 0.2), concrete);
      // Track ring + pitch
      structs.quad2(P(FIELD, a0, gy + 0.22), P(FIELD, a1, gy + 0.22), P(IN, a1, gy + 0.22), P(IN, a0, gy + 0.22), [0.66, 0.33, 0.24]);
      const c0 = [mx, gy + 0.24, mz];
      const stripe = k % 4 < 2 ? [0.22, 0.55, 0.27] : [0.19, 0.49, 0.24];
      structs.tri(c0[0], c0[1], c0[2], ...P(FIELD, a1, gy + 0.24), ...P(FIELD, a0, gy + 0.24), stripe);
      structs.tri(c0[0], c0[1], c0[2], ...P(FIELD, a0, gy + 0.24), ...P(FIELD, a1, gy + 0.24), stripe);
    }
  }

  // ---------------------------------------------------------------- 6. Steel bridge railings + girders over water
  if (isPointInWater) {
    const RAIL = [0.30, 0.33, 0.35];
    const GIRDER = [0.42, 0.45, 0.47];
    let budget = 9000;
    for (const s of roadSegments) {
      if (!s.bridge || s.tunnel || budget <= 0) continue;
      if (s.cls === 'footway' || s.cls === 'path' || s.cls === 'pedestrian') continue;
      const lx1 = s.x1 - ox, lz1 = s.z1 - oz, lx2 = s.x2 - ox, lz2 = s.z2 - oz;
      if (!inWater((lx1 + lx2) / 2, (lz1 + lz2) / 2)) continue;
      const len = Math.hypot(lx2 - lx1, lz2 - lz1);
      if (len < 1) continue;
      const dx = (lx2 - lx1) / len, dz = (lz2 - lz1) / len;
      const nx = -dz, nz = dx;
      const hw = (s.width || 8) * 0.5;
      const yAt = (t) => s.y1 + (s.y2 - s.y1) * t;
      for (const side of [1, -1]) {
        const ex = nx * side * (hw - 0.05), ez = nz * side * (hw - 0.05);
        // Top rail
        const a = [lx1 + ex, 0, lz1 + ez], b = [lx2 + ex, 0, lz2 + ez];
        structs.quad2([a[0], s.y1 + 1.18, a[2]], [b[0], s.y2 + 1.18, b[2]], [b[0], s.y2 + 1.3, b[2]], [a[0], s.y1 + 1.3, a[2]], RAIL);
        // Posts every 2.5 m
        for (let d = 0; d < len; d += 2.5) {
          const t = d / len;
          structs.box(lx1 + dx * d + ex, lz1 + dz * d + ez, yAt(t) + 0.7, yAt(t) + 1.2, dx, dz, 0.05, 0.05, RAIL);
          budget--;
        }
        // Longitudinal I-girder web under the deck edge
        const gx = nx * side * hw * 0.62, gz = nz * side * hw * 0.62;
        structs.quad2(
          [lx1 + gx, s.y1 - 0.85, lz1 + gz], [lx2 + gx, s.y2 - 0.85, lz2 + gz],
          [lx2 + gx, s.y2 - 2.4, lz2 + gz], [lx1 + gx, s.y1 - 2.4, lz1 + gz], GIRDER
        );
      }
      // Cross diaphragms every 8 m
      for (let d = 4; d < len; d += 8) {
        const t = d / len;
        const x = lx1 + dx * d, z = lz1 + dz * d;
        structs.box(x, z, yAt(t) - 2.1, yAt(t) - 0.85, nx, nz, hw * 0.62, 0.12, GIRDER);
        budget -= 2;
      }
    }
  }

  // ---------------------------------------------------------------- 7. Rail polylines for moving trains (world coords)
  for (const rw of data.railways || []) {
    const [, rtype, , , , isTunnel, , flat] = rw;
    if (isTunnel || !flat || flat.length < 6) continue;
    if (rtype !== 'rail' && rtype !== 'subway') continue;
    const n = flat.length / 3;
    const arr = new Float32Array(n * 3);
    let len = 0;
    for (let i = 0; i < n; i++) {
      const x = flat[i * 3], z = flat[i * 3 + 2];
      arr[i * 3] = ox + x;
      arr[i * 3 + 1] = getBeijingTerrainElevation(ox + x, oz + z) + flat[i * 3 + 1] + 0.33;
      arr[i * 3 + 2] = oz + z;
      if (i > 0) len += Math.hypot(x - flat[(i - 1) * 3], z - flat[(i - 1) * 3 + 2]);
    }
    if (len >= 300) rails.push(arr);
  }

  // Static meshes ride the normal chunk mesh transfer
  if (groups && mats) {
    const m1 = aeroSurf.toMesh(mats.roadMat);
    if (m1) groups.roads.add(m1);
    const m2 = aeroMark.toMesh(mats.markingMat);
    if (m2) groups.markings.add(m2);
    const m3 = structs.toMesh(mats.facilityMat, true);
    if (m3) groups.facilities.add(m3);
  }

  const inst = {};
  for (const [k, arr] of Object.entries(out)) inst[k] = new Float32Array(arr);
  return { inst, labels, rails, beacons: new Float32Array(beacons) };
}

/** Adds the transferable buffers of a places payload to a worker transfer set. */
export function collectPlacesTransfer(places, transferSet) {
  if (!places) return;
  for (const a of Object.values(places.inst || {})) if (a && a.buffer) transferSet.add(a.buffer);
  for (const a of places.rails || []) if (a && a.buffer) transferSet.add(a.buffer);
  if (places.beacons && places.beacons.buffer) transferSet.add(places.beacons.buffer);
}
