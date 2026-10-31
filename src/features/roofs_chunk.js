import * as THREE from '../../vendor/three.module.js';
import { archRegionFor as archRegionForOrigin, buildYards, footprintObb } from './roofs.js';
import { parseOsmBuildingColour } from '../wfc/wfc_mesh_builder.js';

/**
 * [roofs] Chunk glue for roofs.js: the per-chunk roof context (architectural region, land-use sampler, mapped pools,
 * the houses that get yards) and the near-LOD "roof detail" meshes (chimneys, mansard dormers, driveways, fences /
 * hedges / garden walls, backyard pools). Detail goes in four quadrant meshes per chunk, each wrapped in a THREE.LOD
 * that drops it beyond ROOF_DETAIL_DIST (main thread; the worker only tags the meshes with `userData.roofLod`).
 */

export const ROOF_DETAIL_DIST = 460;
export const archRegionFor = archRegionForOrigin;

const LC_SWIMMING_POOL = 18;

/** Mapped swimming-pool rings of the chunk (vegetation landcover, chunk-local). */
export function poolRings(data) {
  const out = [];
  for (const p of (data && data.vegetation && data.vegetation.landcover) || []) {
    if (p[0] === LC_SWIMMING_POOL && p[1] && p[1].length >= 6) out.push(p[1]);
  }
  return out;
}

export function createRoofContext(opts, ox, oz, roads, getY, buildings) {
  if (!opts || !opts.arch || opts.arch === 'beijing') return null;
  return {
    arch: opts.arch,
    ground: opts.ground || null,
    pools: opts.pools || [],
    warm: Boolean(opts.warm),
    ox, oz, roads, getY, buildings: buildings || [],
    sinks: [0, 1, 2, 3].map(() => ({ pos: [], norm: [], col: [], uv: [] })),
    houses: [],
  };
}

export function roofSinkFor(ctx, x, z) {
  return ctx.sinks[(x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0)];
}

/** OSM roof tags carried in tuple[8] (object when the tile source has them, else the "flat" placeholder). */
function osmRoofOf(tag) {
  if (!tag || typeof tag !== 'object') return null;
  return {
    shape: tag.shape || null,
    height: Number(tag.height) || 0,
    material: tag.material || null,
    colour: tag.colour || null,
    colourRgb: tag.colour ? parseOsmBuildingColour(tag.colour) : null,
    levels: Number(tag.levels) || 0,
  };
}

/** Extra bldgInfo fields for appendCompactChunkBuildingWFC. */
export function roofInfoFor(ctx, cx, cz, colour, roofTag) {
  if (!ctx) return {};
  const g = ctx.ground ? ctx.ground(cx, cz) : null;
  return {
    arch: ctx.arch,
    flav: g ? g[4] : 0.5,
    osmRoof: osmRoofOf(roofTag),
    roofDetail: roofSinkFor(ctx, cx, cz),
  };
}

/** Land-use flavour at a chunk-local point (for the infill blocks). */
export function roofFlav(ctx, cx, cz) {
  const g = ctx && ctx.ground ? ctx.ground(cx, cz) : null;
  return g ? g[4] : 0.5;
}

const HOUSE_YARD_TYPES = new Set([
  'house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'villa', 'residential', 'yes',
]);

/** Registers a pitched-roof building (entity + collider flags; small residential ones become yard candidates). */
export function noteRoofHouse(ctx, entityRecord, meta, ring, cx, cz, id, colliders) {
  entityRecord.roofShape = meta.roofShape;
  for (let i = colliders.length - 1; i >= 0 && i >= colliders.length - 4; i--) {
    if (colliders[i].id === id) { colliders[i].pitched = true; break; }
  }
  if (ctx) addHouse(ctx, ring, cx, cz, id, meta.roofShape, entityRecord.btype);
}

export function addHouse(ctx, ring, cx, cz, id, shape, btype = 'yes') {
  if (!ctx || shape === 'mansard') return;
  const bt = String(btype || 'yes').toLowerCase();
  if (!HOUSE_YARD_TYPES.has(bt)) return;
  if (roofFlav(ctx, cx, cz) < 0.28) return; // never fence commercial, office, institutional or industrial parcels
  const obb = footprintObb(ring);
  if (!obb || obb.area > 380 || obb.area < 40) return;
  const seed = ((Math.round((ctx.ox + cx) * 7.1) * 73856093) ^ (Math.round((ctx.oz + cz) * 7.1) * 19349663)) >>> 0;
  ctx.houses.push({ ring, cx, cz, obb, region: ctx.arch, seed, id, warm: ctx.warm });
}

/** Builds yards and turns the detail sinks into near-LOD meshes (added to the chunk's buildings group). */
export function finishRoofDetail(ctx, group, mats) {
  if (!ctx) return;
  if (ctx.houses.length) {
    const others = [];
    for (const b of ctx.buildings) {
      const f = b[11];
      if (!f || f.length < 6) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < f.length; i += 2) {
        if (f[i] < x0) x0 = f[i];
        if (f[i] > x1) x1 = f[i];
        if (f[i + 1] < z0) z0 = f[i + 1];
        if (f[i + 1] > z1) z1 = f[i + 1];
      }
      others.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, ring: f, self: b[0] });
    }
    buildYards(ctx.houses, others, ctx.roads, ctx.pools, ctx.getY, (x, z) => roofSinkFor(ctx, x, z));
  }
  const onMain = typeof window !== 'undefined' && mats && mats.wfcBldgMat && mats.wfcBldgMat.isMaterial;
  for (let q = 0; q < 4; q++) {
    const s = ctx.sinks[q];
    if (!s.pos.length) continue;
    const n = s.pos.length / 3;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(s.norm, 3));
    const c8 = new Uint8Array(s.col.length);
    for (let i = 0; i < s.col.length; i++) c8[i] = Math.max(0, Math.min(255, Math.round(s.col[i] * 255)));
    geom.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
    while (s.uv.length < n * 2) s.uv.push(-10, -10);
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
    geom.setAttribute('kBid', new THREE.BufferAttribute(new Uint16Array(n), 1)); // no per-building collapse for detail
    let ySum = 0;
    for (let i = 1; i < s.pos.length; i += 3 * 16) ySum += s.pos[i];
    const yAvg = ySum / Math.max(1, Math.ceil(n / 16));
    const mesh = new THREE.Mesh(geom, mats.wfcBldgMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.roofLod = [(q & 1 ? 250 : -250), yAvg, (q & 2 ? 250 : -250), ROOF_DETAIL_DIST];
    if (onMain) group.add(wrapRoofLod(mesh, mesh.userData.roofLod));
    else group.add(mesh);
  }
}

/** Wraps a detail mesh in a THREE.LOD centred on its chunk quadrant (chunk-local coords). */
export function wrapRoofLod(mesh, lodInfo) {
  const [x, y, z, dist] = lodInfo;
  const lod = new THREE.LOD();
  lod.position.set(x, y, z);
  mesh.position.set(-x, -y, -z);
  lod.addLevel(mesh, 0);
  lod.addLevel(new THREE.Object3D(), dist);
  lod.name = 'roofDetail';
  return lod;
}
