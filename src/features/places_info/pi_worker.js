// places-info (worker side): civic, transit and parking props from the OpenMapTiles `poi` layer
// (schools, campuses, museums, stadium floodlights, police, fire stations + fire trucks, bus stops,
// subway stairs, painted parking lots with parked cars) plus a short list of notable named places
// used by the landmark info cards.
//
// Called once per chunk from chunk_builder.js right after computePlacesPayload(). Instance arrays are
// added to `places.inst` under `pi_*` keys (stride 8: x, y, z, rotY, sx, sy, sz, rgb) so they ride the
// existing places transfer; PlacesSystem ignores unknown kinds, PlacesInfoSystem renders them.
import { getBeijingTerrainElevation } from '../../environment.js';

const HALF = 500;
const CAP = { school: 5, campus: 4, museum: 4, mast: 8, police: 4, fire: 4, busPole: 36, shelter: 16, subway: 14, lot: 6, notable: 40 };
const NOTABLE = new Set(['museum', 'attraction', 'stadium', 'college', 'place_of_worship', 'monument', 'theatre', 'castle', 'library', 'town_hall', 'zoo', 'aquarium']);
const CAR_COLORS = [0xf2f2f0, 0x1c1d20, 0x8c9096, 0xb8bcc2, 0x7a1e22, 0x1f3a66, 0x2f4f3a, 0xc9c1a8, 0x4a4f57, 0xd8d8d8];

function hash2(x, z, salt) {
  let h = (Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
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
function pointInRing(px, pz, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1], xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/**
 * @param {Object} places payload returned by computePlacesPayload (mutated in place)
 * @param {{data:Object, ox:number, oz:number, buildingEntities:Array, roadSegments:Array, isPointInWater:Function}} ctx
 */
export function addPlacesInfo(places, ctx) {
  try {
    build(places, ctx);
  } catch (err) {
    // Never break chunk building because of decorative props.
    if (typeof console !== 'undefined') console.warn('[places-info] chunk props skipped:', err && err.message);
  }
}

function build(places, ctx) {
  if (!places || !places.inst) return;
  const { data, ox, oz, buildingEntities = [], roadSegments = [], isPointInWater } = ctx;
  const src = data && data.places;
  if (!src) return;

  const out = {};
  const count = {};
  const push = (kind, x, y, z, rot, sx = 1, sy = 1, sz = 1, rgb = 0xffffff) => {
    (out[kind] || (out[kind] = [])).push(ox + x, y, oz + z, rot, sx, sy, sz, rgb);
  };
  const bump = (k) => (count[k] = (count[k] || 0) + 1);
  const full = (k) => (count[k] || 0) >= CAP[k];
  const ty = (x, z) => getBeijingTerrainElevation(ox + x, oz + z);
  const inWater = (x, z) => Boolean(isPointInWater && isPointInWater(x, z, 0));

  // Ground-level building footprints (local coords)
  const blds = [];
  for (const b of buildingEntities) {
    if (!b || b.kind !== 'building' || !b.extruded || b.isPart || (b.minHeight || 0) > 0.5) continue;
    const f = b.flatOuter;
    if (!f || f.length < 6) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < f.length; i += 2) {
      if (f[i] < minX) minX = f[i];
      if (f[i] > maxX) maxX = f[i];
      if (f[i + 1] < minZ) minZ = f[i + 1];
      if (f[i + 1] > maxZ) maxZ = f[i + 1];
    }
    blds.push({ f, minX, maxX, minZ, maxZ, h: b.height || ((b.topY || 0) - (b.baseY || 0)) || 0 });
  }
  const inBld = (x, z, pad = 0.4) => {
    for (const B of blds) {
      if (x < B.minX - pad || x > B.maxX + pad || z < B.minZ - pad || z > B.maxZ + pad) continue;
      if (pointInRing(x, z, B.f)) return true;
    }
    return false;
  };

  const segs = [];
  for (const s of roadSegments) {
    if (s.tunnel || s.bridge) continue;
    segs.push([s.x1 - ox, s.z1 - oz, s.x2 - ox, s.z2 - oz, (s.width || 6) * 0.5]);
  }
  const nearestRoad = (x, z, maxD = 60) => {
    let best = null;
    for (const [ax, az, bx, bz, hw] of segs) {
      if (x < Math.min(ax, bx) - maxD || x > Math.max(ax, bx) + maxD || z < Math.min(az, bz) - maxD || z > Math.max(az, bz) + maxD) continue;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-4) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < maxD && (!best || d < best.d)) {
        const l = Math.sqrt(l2);
        const ux = dx / l, uz = dz / l;
        let nx = -uz, nz = ux;
        if ((x - qx) * nx + (z - qz) * nz < 0) { nx = -nx; nz = -nz; }
        best = { d, qx, qz, ux, uz, nx, nz, hw };
      }
    }
    return best;
  };
  const roadClear = (x, z, pad = 0.5) => {
    for (const [ax, az, bx, bz, hw] of segs) {
      const r = hw + pad;
      if (x < Math.min(ax, bx) - r || x > Math.max(ax, bx) + r || z < Math.min(az, bz) - r || z > Math.max(az, bz) + r) continue;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-4) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < r) return false;
    }
    return true;
  };
  const inChunk = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;
  // Rectangle footprint test: center (cx,cz), axis (ax,az) half-length hl, normal half-width hw
  const rectFree = (cx, cz, ax, az, hl, hw, bldPad = 0.3, roadPad = 0.4) => {
    const nx = -az, nz = ax;
    for (const a of [-1, 0, 1]) {
      for (const b of [-1, 0, 1]) {
        const x = cx + ax * hl * a + nx * hw * b, z = cz + az * hl * a + nz * hw * b;
        if (inBld(x, z, bldPad) || !roadClear(x, z, roadPad) || inWater(x, z)) return false;
      }
    }
    return true;
  };
  // Nearest building facade edge to a point
  const facade = (px, pz, maxD = 24, minH = 4) => {
    let best = null;
    for (const B of blds) {
      if (B.h < minH) continue;
      if (px < B.minX - maxD || px > B.maxX + maxD || pz < B.minZ - maxD || pz > B.maxZ + maxD) continue;
      const f = B.f, n = f.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = f[i * 2], az = f[i * 2 + 1], bx = f[j * 2], bz = f[j * 2 + 1];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 16) continue;
        const t = Math.max(0.15, Math.min(0.85, ((px - ax) * dx + (pz - az) * dz) / l2));
        const qx = ax + dx * t, qz = az + dz * t;
        const d = Math.hypot(px - qx, pz - qz);
        if (d < maxD && (!best || d < best.d)) {
          const l = Math.sqrt(l2);
          best = { d, qx, qz, ux: dx / l, uz: dz / l, len: l, B };
        }
      }
    }
    if (!best) return null;
    let nx = best.uz, nz = -best.ux;
    if (pointInRing(best.qx + nx * 0.8, best.qz + nz * 0.8, best.B.f)) { nx = -nx; nz = -nz; }
    best.nx = nx;
    best.nz = nz;
    return best;
  };
  const placed = {};
  const tooClose = (k, x, z, r) => (placed[k] || []).some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
  const mark = (k, x, z) => (placed[k] || (placed[k] = [])).push([x, z]);

  // Sidewalk spot next to the nearest road, facing it. Returns [x, z, rotFacingRoad, roadInfo, side]
  const curbSpot = (px, pz, off, alongTry = [0, 4, -4, 8, -8], test = null) => {
    const r = nearestRoad(px, pz, 50);
    if (!r) return null;
    for (const a of alongTry) {
      const x = r.qx + r.nx * (r.hw + off) + r.ux * a;
      const z = r.qz + r.nz * (r.hw + off) + r.uz * a;
      if (!inChunk(x, z) || inWater(x, z) || inBld(x, z, 0.5) || !roadClear(x, z, off * 0.5)) continue;
      if (test && !test(x, z, r)) continue;
      return [x, z, Math.atan2(-r.nx, -r.nz), r];
    }
    return null;
  };

  const notable = [];
  const pois = src.pois || [];
  for (const q of pois) {
    const [px, pz, cls, sub, name, nameEn] = q;
    if (!inChunk(px, pz)) continue;
    if (name && NOTABLE.has(cls) && sub !== 'artwork' && notable.length < CAP.notable) {
      notable.push([Math.round((ox + px) * 10) / 10, Math.round((oz + pz) * 10) / 10, cls, sub, name, nameEn || name]);
    }
    const rng = mulberry32(hash2(ox + px, oz + pz, 977));

    if (cls === 'school' || cls === 'college') {
      const kind = cls === 'college' ? 'campus' : 'school';
      if (full(kind) || tooClose(kind, px, pz, 90)) continue;
      const half = kind === 'campus' ? 4.3 : 1.8;
      const spot = curbSpot(px, pz, kind === 'campus' ? 3.2 : 2.4, [0, 5, -5, 10, -10],
        (x, z, r) => !inBld(x + r.ux * half, z + r.uz * half, 0.3) && !inBld(x - r.ux * half, z - r.uz * half, 0.3));
      if (!spot) continue;
      push(kind, spot[0], ty(spot[0], spot[1]), spot[1], spot[2]);
      mark(kind, px, pz);
      bump(kind);
      continue;
    }

    if (cls === 'museum') {
      if (full('museum') || tooClose('museum', px, pz, 90)) continue;
      const fc = facade(px, pz, 26, 8);
      let done = false;
      if (fc && fc.len >= 10) {
        const s = Math.min(1.2, (fc.len * 0.75) / 12);
        const fx = fc.qx + fc.nx * 3.4 * s, fz = fc.qz + fc.nz * 3.4 * s;
        if (roadClear(fx, fz, 0.3) && roadClear(fc.qx + fc.nx * 1.5, fc.qz + fc.nz * 1.5, 0.3)) {
          push('museum', fc.qx + fc.nx * 0.05, ty(fc.qx, fc.qz), fc.qz + fc.nz * 0.05, Math.atan2(fc.nx, fc.nz), s, s, s);
          done = true;
        }
      }
      if (!done) {
        const spot = curbSpot(px, pz, 2.2);
        if (!spot) continue;
        push('museumSign', spot[0], ty(spot[0], spot[1]), spot[1], spot[2]);
      }
      mark('museum', px, pz);
      bump('museum');
      continue;
    }

    if (cls === 'police') {
      if (full('police') || tooClose('police', px, pz, 80)) continue;
      const spot = curbSpot(px, pz, 1.4);
      if (!spot) continue;
      const [sx, sz, rot, r] = spot;
      push('policeSign', sx, ty(sx, sz), sz, rot);
      // Patrol car parked alongside, nose along the road
      for (const a of [4.2, -4.2, 7.5, -7.5]) {
        const cx = sx + r.nx * 0.6 + r.ux * a, cz = sz + r.nz * 0.6 + r.uz * a;
        if (!inChunk(cx, cz) || !rectFree(cx, cz, r.ux, r.uz, 2.3, 1.0, 0.2, 0.15)) continue;
        push('policeCar', cx, ty(cx, cz), cz, Math.atan2(r.ux, r.uz) + (rng() < 0.5 ? Math.PI : 0));
        break;
      }
      mark('police', px, pz);
      bump('police');
      continue;
    }

    if (cls === 'fire_station') {
      if (full('fire') || tooClose('fire', px, pz, 80)) continue;
      const fc = facade(px, pz, 28, 4);
      let truck = false;
      if (fc) {
        push('fireDoor', fc.qx + fc.nx * 0.04, ty(fc.qx, fc.qz), fc.qz + fc.nz * 0.04, Math.atan2(fc.nx, fc.nz));
        // Nose-out in front of the bay door when the apron is deep enough
        const cx = fc.qx + fc.nx * 5.2, cz = fc.qz + fc.nz * 5.2;
        if (inChunk(cx, cz) && rectFree(cx, cz, fc.nx, fc.nz, 4.6, 1.3, 0.1, 0.2)) {
          push('fireTruck', cx, ty(cx, cz), cz, Math.atan2(fc.nx, fc.nz));
          truck = true;
        } else {
          // Parked along the facade
          for (const a of [0, 3, -3, 6, -6]) {
            const px2 = fc.qx + fc.nx * 1.75 + fc.ux * a, pz2 = fc.qz + fc.nz * 1.75 + fc.uz * a;
            if (!inChunk(px2, pz2) || !rectFree(px2, pz2, fc.ux, fc.uz, 4.6, 1.3, 0.05, 0.15)) continue;
            push('fireTruck', px2, ty(px2, pz2), pz2, Math.atan2(fc.ux, fc.uz));
            truck = true;
            break;
          }
        }
      }
      if (!truck) {
        const r = nearestRoad(px, pz, 50);
        if (r) {
          for (const a of [0, 6, -6, 12, -12]) {
            const cx = r.qx + r.nx * (r.hw + 1.6) + r.ux * a, cz = r.qz + r.nz * (r.hw + 1.6) + r.uz * a;
            if (!inChunk(cx, cz) || !rectFree(cx, cz, r.ux, r.uz, 4.6, 1.3, 0.2, 0.1)) continue;
            push('fireTruck', cx, ty(cx, cz), cz, Math.atan2(r.ux, r.uz));
            truck = true;
            break;
          }
        }
      }
      if (!fc && !truck) continue;
      mark('fire', px, pz);
      bump('fire');
      continue;
    }

    if (cls === 'bus' && sub === 'bus_stop') {
      if (full('busPole') || tooClose('bus', px, pz, 22)) continue;
      const r = nearestRoad(px, pz, 30);
      if (!r) continue;
      const bx = r.qx + r.nx * (r.hw + 0.55), bz = r.qz + r.nz * (r.hw + 0.55);
      if (!inChunk(bx, bz) || inBld(bx, bz, 0.2) || inWater(bx, bz)) continue;
      push('busPole', bx, ty(bx, bz), bz, Math.atan2(r.ux, r.uz));
      mark('bus', px, pz);
      bump('busPole');
      if (!full('shelter')) {
        for (const a of [3.4, -3.4]) {
          const sx = r.qx + r.nx * (r.hw + 1.75) + r.ux * a, sz = r.qz + r.nz * (r.hw + 1.75) + r.uz * a;
          if (!inChunk(sx, sz) || !rectFree(sx, sz, r.ux, r.uz, 2.3, 0.7, 0.15, 0.3)) continue;
          push('shelter', sx, ty(sx, sz), sz, Math.atan2(-r.nx, -r.nz));
          bump('shelter');
          break;
        }
      }
      continue;
    }

    if (sub === 'subway_entrance' || sub === 'train_station_entrance') {
      if (full('subway') || tooClose('subway', px, pz, 18)) continue;
      const r = nearestRoad(px, pz, 40);
      if (!r) continue;
      let ok = false;
      for (const off of [2.2, 3.0]) {
        for (const a of [3.6, -3.6, 6.5, -6.5]) {
          const x = r.qx + r.nx * (r.hw + off) + r.ux * a, z = r.qz + r.nz * (r.hw + off) + r.uz * a;
          if (!inChunk(x, z) || !rectFree(x, z, r.ux, r.uz, 2.7, 1.2, 0.1, 0.2)) continue;
          const rgb = sub === 'subway_entrance' ? 0x2f9e5a : 0x2f6fbf;
          push('subway', x, ty(x, z), z, Math.atan2(r.ux, r.uz) + (rng() < 0.5 ? Math.PI : 0), 1, 1, 1, rgb);
          ok = true;
          break;
        }
        if (ok) break;
      }
      if (!ok) continue;
      mark('subway', px, pz);
      bump('subway');
      continue;
    }

    if (cls === 'parking' && sub === 'parking') {
      if (full('lot') || tooClose('lot', px, pz, 45)) continue;
      if (inBld(px, pz, 0)) continue; // multi-storey garages are buildings already
      const r = nearestRoad(px, pz, 80);
      if (!r) continue;
      const ux = r.ux, uz = r.uz;
      let lot = null;
      for (const [W, D, kind] of [[20, 15, 'lotL'], [10, 15, 'lotS']]) {
        const minOff = r.hw + D / 2 + 1.2;
        const baseOff = Math.max(minOff, r.d);
        for (const off of [baseOff, minOff, baseOff + 6]) {
          for (const a of [0, 6, -6]) {
            const cx = r.qx + r.nx * off + ux * a, cz = r.qz + r.nz * off + uz * a;
            if (!inChunk(cx, cz) || !rectFree(cx, cz, ux, uz, W / 2, D / 2, 0.4, 0.6)) continue;
            const hs = [ty(cx - ux * W / 2 - r.nx * D / 2, cz - uz * W / 2 - r.nz * D / 2), ty(cx + ux * W / 2 - r.nx * D / 2, cz + uz * W / 2 - r.nz * D / 2),
              ty(cx - ux * W / 2 + r.nx * D / 2, cz - uz * W / 2 + r.nz * D / 2), ty(cx + ux * W / 2 + r.nx * D / 2, cz + uz * W / 2 + r.nz * D / 2)];
            const hi = Math.max(...hs), lo = Math.min(...hs);
            if (hi - lo > 1.6) continue;
            lot = { cx, cz, W, D, kind, y: hi + 0.02 };
            break;
          }
          if (lot) break;
        }
        if (lot) break;
      }
      if (!lot) continue;
      const rot = Math.atan2(-uz, ux); // local +X along the road
      push(lot.kind, lot.cx, lot.y, lot.cz, rot);
      const stalls = lot.W / 2.5;
      for (const row of [-1, 1]) {
        for (let i = 0; i < stalls; i++) {
          if (rng() > 0.62) continue;
          const lx = -lot.W / 2 + 1.25 + i * 2.5, lz = row * 4.75;
          const wx = lot.cx + ux * lx + r.nx * lz, wz = lot.cz + uz * lx + r.nz * lz;
          // Nose toward the aisle (or backed in)
          const face = (rng() < 0.75 ? -row : row);
          push('car', wx, lot.y + 0.08, wz, Math.atan2(r.nx * face, r.nz * face) + (rng() - 0.5) * 0.06, 1, 1, 1,
            CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]);
        }
      }
      mark('lot', px, pz);
      bump('lot');
      continue;
    }
  }

  // Stadium floodlight masts at the corners of real stadium footprints
  for (const flat of src.stadiums || []) {
    if (full('mast')) break;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]);
      minZ = Math.min(minZ, flat[i + 1]); maxZ = Math.max(maxZ, flat[i + 1]);
    }
    if (maxX - minX < 60 || maxZ - minZ < 60) continue;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    for (const [x, z] of [[minX + 6, minZ + 6], [maxX - 6, minZ + 6], [minX + 6, maxZ - 6], [maxX - 6, maxZ - 6]]) {
      if (full('mast') || !inChunk(x, z) || inBld(x, z, 0.5) || !roadClear(x, z, 1) || inWater(x, z)) continue;
      push('mast', x, ty(x, z), z, Math.atan2(cx - x, cz - z));
      bump('mast');
    }
  }

  for (const [k, arr] of Object.entries(out)) places.inst['pi_' + k] = new Float32Array(arr);
  places.piNotable = notable;
}
