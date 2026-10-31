import * as THREE from '../../vendor/three.module.js';
import { selectFacadeForBuilding, facadeUvBase, facadeV } from '../wfc/wfc_mesh_builder.js';
import { planRoof, roofRise, emitRoof } from './roofs.js'; // [roofs]
import { roofFlav, addHouse } from './roofs_chunk.js'; // [roofs]

/**
 * [ground] Infill buildings: the footprints past the per-chunk detailed-build budget (global_tiles.js flags them with
 * tuple[13] = 1). Dense districts map 1-2.5k buildings per km^2 and only the 420 biggest get the full facade build;
 * these fill the rest of the block as plain prisms: one facade quad per edge (same facade atlas uv as the detailed
 * walls, so they get windows and night lights) plus a flat roof, ~2 triangles per edge. They get a collider but no
 * pick entity, entrances, rooftop clutter or destruction.
 */
export const INFILL_MAX = 2000; // per chunk, on top of the 420 detailed ones

const tmpContour = [];

/**
 * Appends one infill building to the chunk's merged facade buffers.
 * `b` = building tuple, `getY(lx, lz)` = terrain height at chunk-local xz, `out` = { pos, norm, col, uv, colliders }.
 */
export function appendInfillBuilding(b, ox, oz, getY, region, out) {
  const [osmId, , btype, , rawH, rawMinH, , style, , , , flatOuter] = b;
  if (!flatOuter || flatOuter.length < 6) return;
  const n = flatOuter.length / 2;
  // CCW in (x, z) so (dz, -dx) points outward
  let area2 = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x = flatOuter[i * 2], z = flatOuter[i * 2 + 1];
    area2 += x * flatOuter[j * 2 + 1] - flatOuter[j * 2] * z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const flip = area2 < 0;
  const px = (i) => flatOuter[(flip ? n - 1 - i : i) * 2];
  const pz = (i) => flatOuter[(flip ? n - 1 - i : i) * 2 + 1];

  const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
  if (out.isPointInWater && btype !== 'boathouse' && btype !== 'bridge' && btype !== 'pier') {
    const inW = out.isPointInWater;
    if (inW(cx, cz, 1.0) || inW(minX, minZ, 0.8) || inW(maxX, minZ, 0.8) || inW(minX, maxZ, 0.8) || inW(maxX, maxZ, 0.8)) return;
    for (let i = 0; i < n; i++) {
      const x1 = px(i), z1 = pz(i), x2 = px((i + 1) % n), z2 = pz((i + 1) % n);
      if (inW(x1, z1, 0.8) || inW((x1 + x2) * 0.5, (z1 + z2) * 0.5, 0.8)) return;
    }
  }
  const gC = getY(cx, cz);
  const g00 = getY(minX, minZ), g10 = getY(maxX, minZ), g01 = getY(minX, maxZ), g11 = getY(maxX, maxZ);
  const gLow = Math.min(gC, g00, g10, g01, g11);
  const gHigh = Math.max(gC, g00, g10, g01, g11);
  const gTopBase = gHigh > gC + 0.35 ? gHigh : gC;
  const y0 = (rawMinH || 0) > 0.5 ? gTopBase + rawMinH : gLow - 1.2;
  let yTop = gTopBase + Math.max(3.2, rawH);
  const rc = out.roof || null; // [roofs]

  const wx = ox + cx, wz = oz + cz;
  const seed = ((Math.round(wx * 13.7) * 73856093) ^ (Math.round(wz * 13.7) * 19349663) ^ ((Number(osmId) || 0) * 83492791)) >>> 0;
  const sel = selectFacadeForBuilding({ height: rawH, btype, style, name: '', arch: rc ? rc.arch : null, span: Math.max(maxX - minX, maxZ - minZ) }, seed, region);
  const spec = sel.spec;
  // [roofs] cheap pitched roof for small residential infill (walls stop at the eaves)
  let ring = null, plan = null;
  if (rc) {
    ring = [];
    for (let i = 0; i < n; i++) ring.push(px(i), pz(i));
    plan = planRoof({ flatOuter: ring, rawH, btype, region: rc.arch, seed, flav: roofFlav(rc, cx, cz), isPart: false,
      minH: rawMinH, osm: null, facadeId: spec.id, hasHoles: false });
    if (plan) yTop = Math.max(Math.max(y0, gLow) + 2.7, yTop - roofRise(plan));
  }
  const wall = sel.wallTint;
  const roof = sel.roofDeck;
  const floors = Math.max(1, Math.round((yTop - Math.max(y0, gLow)) / spec.metersPerFloor));
  const v1 = facadeV(spec.index, 1.0 + floors / spec.floors);
  const v0 = facadeV(spec.index, Math.max(0.55, 1.0 - Math.max(0, gLow - y0) / spec.metersPerFloor / spec.floors)); // buried skirt below the street
  const uShift = ((seed >>> 7) % spec.bays) / spec.bays;
  const { pos, norm, col, uv } = out;

  for (let i = 0; i < n; i++) {
    const x1 = px(i), z1 = pz(i), x2 = px((i + 1) % n), z2 = pz((i + 1) % n);
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) continue;
    const nx = dz / len, nz = -dx / len;
    const shade = 0.96 + 0.04 * (nx * 0.65 + nz * 0.45);
    const bays = Math.max(1, Math.round(len / spec.metersPerBay));
    const u0 = facadeUvBase(spec.index) + uShift, u1 = u0 + bays / spec.bays;
    pos.push(x1, y0, z1, x1, yTop, z1, x2, yTop, z2, x1, y0, z1, x2, yTop, z2, x2, y0, z2);
    const rB = wall[0] * shade * 0.86, gB = wall[1] * shade * 0.86, bB = wall[2] * shade * 0.86;
    const rT = wall[0] * shade, gT = wall[1] * shade, bT = wall[2] * shade;
    col.push(rB, gB, bB, rT, gT, bT, rT, gT, bT, rB, gB, bB, rT, gT, bT, rB, gB, bB);
    for (let k = 0; k < 6; k++) norm.push(nx, 0, nz);
    uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
  }

  if (plan) {
    const av = spec.avgColor;
    const r = emitRoof(out, ring, [], plan, yTop, { wallRgb: [Math.min(1, av[0] * wall[0] * 1.15), Math.min(1, av[1] * wall[1] * 1.15), Math.min(1, av[2] * wall[2] * 1.15)], lod: 'cheap', seed });
    if (r) {
      out.colliders.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: r.ridgeY, flatOuter, ox, oz, id: osmId, pitched: true });
      addHouse(rc, ring, cx, cz, osmId, plan.shape, btype);
      return;
    }
  }

  // flat roof
  tmpContour.length = 0;
  for (let i = 0; i < n; i++) tmpContour.push(new THREE.Vector2(px(i), pz(i)));
  const tris = n === 4 ? [[0, 1, 2], [0, 2, 3]] : THREE.ShapeUtils.triangulateShape(tmpContour, []);
  for (const [a, bb, c] of tris) {
    const pa = tmpContour[a], pb = tmpContour[bb], pc = tmpContour[c];
    pos.push(pa.x, yTop, pa.y, pc.x, yTop, pc.y, pb.x, yTop, pb.y);
    for (let k = 0; k < 3; k++) {
      norm.push(0, 1, 0);
      col.push(roof[0], roof[1], roof[2]);
      uv.push(-10.0, -10.0);
    }
  }

  out.colliders.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: yTop, flatOuter, ox, oz, id: osmId });
}
