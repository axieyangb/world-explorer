/**
 * Vegetation & rich landuse extraction (worker side, dependency-free).
 * Split from vegetation_worker.js so global_tiles.js does not import environment.js (import cycle).
 */

// Landcover & rich landuse kinds
export const LC_RESIDENTIAL   = 1;
export const LC_COMMERCIAL    = 2;
export const LC_INDUSTRIAL    = 3;
export const LC_INSTITUTION   = 4;
export const LC_CEMETERY      = 5;
const LC_FARMLAND             = 6;
export const LC_GRASS         = 7;
export const LC_SCRUB         = 8;
export const LC_WETLAND       = 9;
export const LC_SAND          = 10;
export const LC_ROCK          = 11;
const LC_ICE                  = 12;
export const LC_WOOD          = 13;
export const LC_ORCHARD       = 14;
export const LC_PITCH         = 15;
export const LC_TRACK         = 16;
export const LC_PLAYGROUND    = 17;
export const LC_SWIMMING_POOL = 18;
export const LC_FLOWERBED     = 19;
export const LC_PLAZA         = 20;
export const LC_STEPS         = 21;

// kind -> [rgb, height above terrain, shader pattern]
// pattern: 0 plain, 1 field rows, 2 sand, 3 paving, 4 undergrowth/flowerbed, 5 crisp court, 6 turquoise pool water, 7 stone plaza/steps
// [terrain-roads] 8 marsh pools, 9 rock/scree, 10 glacier ice, 11 orchard/vineyard rows
// Heights stay below parks (0.08-0.15) for urban kinds and above them for natural cover & courts, all below roads (>= 0.28) except pools/steps.
export const LC_STYLE = {
  [LC_RESIDENTIAL]:   [[0.47, 0.46, 0.43], 0.020, 3],
  [LC_COMMERCIAL]:    [[0.50, 0.49, 0.48], 0.024, 3],
  [LC_INDUSTRIAL]:    [[0.45, 0.44, 0.41], 0.028, 3],
  [LC_INSTITUTION]:   [[0.51, 0.48, 0.43], 0.032, 3],
  [LC_CEMETERY]:      [[0.35, 0.45, 0.29], 0.036, 0],
  [LC_FARMLAND]:      [[0.60, 0.56, 0.35], 0.040, 1],
  [LC_ORCHARD]:       [[0.44, 0.50, 0.29], 0.044, 11], // [terrain-roads] tree/vine rows
  [LC_GRASS]:         [[0.34, 0.51, 0.24], 0.060, 0],
  [LC_SCRUB]:         [[0.38, 0.44, 0.26], 0.160, 4],
  [LC_WETLAND]:       [[0.31, 0.41, 0.31], 0.164, 8], // [terrain-roads] marsh pools
  [LC_SAND]:          [[0.85, 0.78, 0.59], 0.168, 2],
  [LC_ROCK]:          [[0.55, 0.53, 0.50], 0.172, 9], // [terrain-roads] scree
  [LC_ICE]:           [[0.92, 0.94, 0.97], 0.176, 10], // [terrain-roads] glacier
  [LC_WOOD]:          [[0.22, 0.31, 0.16], 0.180, 4],
  [LC_FLOWERBED]:     [[0.24, 0.50, 0.22], 0.184, 4],
  [LC_TRACK]:         [[0.74, 0.26, 0.20], 0.188, 5],
  [LC_PITCH]:         [[0.19, 0.50, 0.32], 0.196, 5],
  [LC_PLAYGROUND]:    [[0.24, 0.52, 0.68], 0.196, 5],
  [LC_PLAZA]:         [[0.76, 0.72, 0.65], 0.235, 7],
  [LC_SWIMMING_POOL]: [[0.133, 0.722, 0.812], 0.335, 6],
  [LC_STEPS]:         [[0.80, 0.77, 0.72], 0.440, 7],
};

function classifyLandcover(layer, tags) {
  const c = String(tags.class || '').toLowerCase();
  const s = String(tags.subclass || '').toLowerCase();

  if (s === 'flowerbed' || c === 'flowerbed' || s === 'garden' || c === 'garden') return LC_FLOWERBED;
  if (c === 'pitch' || s === 'pitch') return LC_PITCH;
  if (c === 'track' || s === 'track') return LC_TRACK;
  if (c === 'playground' || s === 'playground') return LC_PLAYGROUND;

  if (layer === 'landcover') {
    if (c === 'wood' || s === 'forest' || s === 'wood') return LC_WOOD;
    if (c === 'sand' || s === 'beach' || s === 'sand' || s === 'dune') return LC_SAND;
    if (c === 'wetland' || s === 'marsh' || s === 'swamp' || s === 'bog' || s === 'reedbed' || s === 'wet_meadow') return LC_WETLAND;
    if (c === 'rock' || s === 'bare_rock' || s === 'scree') return LC_ROCK;
    if (c === 'ice' || s === 'glacier') return LC_ICE;
    if (s === 'orchard' || s === 'vineyard') return LC_ORCHARD;
    if (c === 'farmland' || s === 'farmland' || s === 'allotments' || s === 'plant_nursery') return LC_FARMLAND;
    if (s === 'scrub' || s === 'heath' || s === 'shrubbery') return LC_SCRUB;
    if (c === 'grass') return LC_GRASS;
    return 0;
  }
  if (layer === 'landuse') {
    switch (c) {
      case 'residential': return LC_RESIDENTIAL;
      case 'commercial':
      case 'retail': return LC_COMMERCIAL;
      case 'industrial':
      case 'railway':
      case 'garages':
      case 'military':
      case 'quarry':
      case 'bus_station':
      case 'dam': return LC_INDUSTRIAL;
      case 'school':
      case 'university':
      case 'kindergarten':
      case 'college':
      case 'library':
      case 'hospital': return LC_INSTITUTION;
      case 'cemetery': return LC_CEMETERY;
      case 'theme_park':
      case 'zoo': return LC_GRASS;
      default: return 0;
    }
  }
  return 0;
}

function normalizeSportSubclass(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return '';
  if (s.includes('basketball') || s.includes('streetball')) return 'basketball';
  if (s.includes('table_tennis') || s.includes('ping_pong')) return 'table_tennis';
  if (s.includes('tennis')) return 'tennis';
  if (s.includes('pickleball')) return 'pickleball';
  if (s.includes('badminton')) return 'badminton';
  if (s.includes('volleyball') || s.includes('beachvolleyball')) return 'volleyball';
  if (s.includes('baseball') || s.includes('softball')) return 'baseball';
  if (s.includes('skateboard') || s.includes('bmx') || s.includes('roller')) return 'skateboard';
  if (s.includes('soccer') || s.includes('football') || s.includes('futsal')) return 'soccer';
  if (s.includes('athletics') || s.includes('running') || s === 'track') return 'track';
  return '';
}

function clipRing(flat, minB, maxB) {
  let pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const clip = (input, inside, cut) => {
    const out = [];
    const n = input.length;
    for (let i = 0; i < n; i++) {
      const cur = input[i];
      const prev = input[(i - 1 + n) % n];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cut(prev, cur));
      }
    }
    return out;
  };
  const lerpX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9)];
  const lerpZ = (a, b, z) => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1] || 1e-9), z];
  pts = clip(pts, (p) => p[0] >= minB, (a, b) => lerpX(a, b, minB));
  if (pts.length) pts = clip(pts, (p) => p[0] <= maxB, (a, b) => lerpX(a, b, maxB));
  if (pts.length) pts = clip(pts, (p) => p[1] >= minB, (a, b) => lerpZ(a, b, minB));
  if (pts.length) pts = clip(pts, (p) => p[1] <= maxB, (a, b) => lerpZ(a, b, maxB));
  const out = [];
  for (const [x, z] of pts) {
    const n = out.length;
    if (n >= 2 && Math.abs(x - out[n - 2]) + Math.abs(z - out[n - 1]) < 0.3) continue;
    out.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
  }
  return out;
}

function ringArea(flat) {
  let a = 0;
  for (let i = 0, n = flat.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
  }
  return Math.abs(a) * 0.5;
}

function pointInRingXZ(x, z, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distSqToRingXZ(px, pz, ring) {
  let best = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const ax = ring[i], az = ring[i + 1];
    const bx = ring[j], bz = ring[j + 1];
    const vx = bx - ax, vz = bz - az;
    const l2 = vx * vx + vz * vz;
    let t = l2 > 1e-6 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = px - (ax + vx * t);
    const dz = pz - (az + vz * t);
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

function makeRectRing(cx, cz, hl, hw, angle = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const corners = [
    [-hl, -hw],
    [ hl, -hw],
    [ hl,  hw],
    [-hl,  hw],
  ];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = corners[i];
    const x = cx + u * c - v * s;
    const z = cz + u * s + v * c;
    out.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
  }
  return out;
}

function sportDefaultDims(sport) {
  if (sport === 'soccer') return [42.0, 26.0];
  if (sport === 'baseball') return [28.0, 28.0];
  if (sport === 'tennis') return [12.0, 6.0];
  if (sport === 'basketball') return [14.0, 7.8];
  if (sport === 'badminton' || sport === 'pickleball') return [7.5, 4.0];
  if (sport === 'volleyball') return [9.5, 5.2];
  if (sport === 'table_tennis') return [4.5, 2.8];
  if (sport === 'skateboard') return [12.0, 7.5];
  return [13.0, 7.5];
}

/**
 * Tile-side hook: extracts landuse/landcover polygons and rich court/pool/flowerbed/plaza/step features
 * as `[kind, outerFlat, holesFlat[], meta]` in chunk-local XZ.
 */
export function extractLandcoverPolys(tiles, toLocalXZ) {
  const out = [];
  const seen = new Set();

  // 1. Collect sport/pitch and swimming_pool POI points (`f.type === 1`)
  const pitchPois = [];
  const poolPois = [];
  const seenPoi = new Set();

  for (const t of tiles) {
    for (const f of t.poi || []) {
      if (f.type !== 1 || !f.tags) continue;
      const cls = String(f.tags.class || '').toLowerCase();
      const sub = String(f.tags.subclass || f.tags.sport || '').toLowerCase();
      const isPitchPoi = cls === 'pitch' || cls === 'track' || cls === 'playground' || cls === 'stadium';
      const isPoolPoi = cls === 'swimming_pool' || sub === 'swimming_pool';
      if (!isPitchPoi && !isPoolPoi) continue;

      const pts = Array.isArray(f.geom) ? f.geom : [];
      for (const g of pts) {
        const p = Array.isArray(g[0]) ? g[0] : g;
        if (!p || p.length < 2) continue;
        const [lx, lz] = toLocalXZ(p[0], p[1]);
        if (lx < -525 || lx > 525 || lz < -525 || lz > 525) continue;
        const rx = Math.round(lx * 10) / 10;
        const rz = Math.round(lz * 10) / 10;
        const pk = `${cls}:${sub}:${Math.round(rx / 2.5)},${Math.round(rz / 2.5)}`;
        if (seenPoi.has(pk)) continue;
        seenPoi.add(pk);

        if (isPoolPoi) {
          poolPois.push({ x: rx, z: rz, matched: false });
        } else {
          const sport = cls === 'track' ? 'track' : cls === 'playground' ? 'playground' : normalizeSportSubclass(sub);
          pitchPois.push({ x: rx, z: rz, sport, rawSub: sub, cls, matched: false });
        }
      }
    }
  }

  const pushPoly = (kind, poly, meta = null) => {
    if (!poly.outer || poly.outer.length < 3) return;
    const raw = [];
    for (let i = 0; i < poly.outer.length; i++) {
      const [lx, lz] = toLocalXZ(poly.outer[i][0], poly.outer[i][1]);
      raw.push(lx, lz);
    }
    const outer = clipRing(raw, -501, 501);
    if (outer.length < 6) return;
    const area = ringArea(outer);
    const minArea = kind >= LC_PITCH ? 6 : 30;
    if (area < minArea) return;
    let sx = 0, sz = 0;
    for (let i = 0; i < outer.length; i += 2) {
      sx += outer[i];
      sz += outer[i + 1];
    }
    const n = outer.length / 2;
    const cx = sx / n, cz = sz / n;
    const cell = kind >= LC_PITCH ? 3.2 : 4.0;
    const key = `${kind},${Math.round(cx / cell)},${Math.round(cz / cell)},${Math.round(area / (kind >= LC_PITCH ? 15 : 50))}`;
    if (seen.has(key)) return;
    seen.add(key);
    const holes = [];
    for (const h of poly.holes || []) {
      if (h.length < 3) continue;
      const rh = [];
      for (let i = 0; i < h.length; i++) {
        const [lx, lz] = toLocalXZ(h[i][0], h[i][1]);
        rh.push(lx, lz);
      }
      const ch = clipRing(rh, -501, 501);
      if (ch.length >= 6) holes.push(ch);
    }
    // Deduplicate MVT tile-boundary split/overlapping copies of the same rich polygon
    if (kind >= LC_PITCH) {
      for (let exIdx = 0; exIdx < out.length; exIdx++) {
        const ex = out[exIdx];
        if (ex[0] !== kind) continue;
        const exOuter = ex[1];
        if (pointInRingXZ(cx, cz, exOuter)) {
          if (area > ringArea(exOuter)) {
            out[exIdx] = meta ? [kind, outer, holes, meta] : [kind, outer, holes];
          }
          return;
        }
      }
    }
    if (meta) out.push([kind, outer, holes, meta]);
    else out.push([kind, outer, holes]);
  };

  for (const t of tiles) {
    for (const layer of ['landuse', 'landcover']) {
      for (const f of t[layer] || []) {
        if (f.type !== 3) continue;
        const tags = f.tags || {};
        const kind = classifyLandcover(layer, tags);
        if (!kind) continue;
        const sub = String(tags.subclass || tags.class || '').toLowerCase();
        const sport = kind === LC_PITCH ? normalizeSportSubclass(tags.sport || tags.subclass || '') : '';
        for (const poly of f.geom) {
          pushPoly(kind, poly, kind >= LC_PITCH ? { sub, sport, pois: [] } : null);
        }
      }
    }

    // Swimming pools from `water` layer (`class === 'swimming_pool'`)
    for (const f of t.water || []) {
      if (f.type !== 3 || !f.tags) continue;
      const cls = String(f.tags.class || '').toLowerCase();
      const sub = String(f.tags.subclass || '').toLowerCase();
      if (cls !== 'swimming_pool' && sub !== 'swimming_pool') continue;
      for (const poly of f.geom) {
        pushPoly(LC_SWIMMING_POOL, poly, { synthetic: false });
      }
    }

    // Pedestrian plazas (`f.type === 3`) & hillside steps (`f.type === 2`) from `transportation`
    for (const f of t.transportation || []) {
      if (!f.tags) continue;
      const cls = String(f.tags.class || '').toLowerCase();
      const sub = String(f.tags.subclass || '').toLowerCase();
      const isTunnel = f.tags.brunnel === 'tunnel' || (Number(f.tags.layer) || 0) < 0;
      if (isTunnel) continue;

      if (f.type === 3) {
        if (sub === 'pedestrian' || sub === 'platform' || cls === 'pedestrian' || cls === 'platform') {
          for (const poly of f.geom) {
            pushPoly(LC_PLAZA, poly, { sub: sub || cls });
          }
        }
      } else if (f.type === 2) {
        if (sub === 'steps' || cls === 'steps') {
          for (const line of f.geom) {
            if (!line || line.length < 2) continue;
            const flat = [];
            let inChunk = false;
            let len = 0;
            for (let i = 0; i < line.length; i++) {
              const [lx, lz] = toLocalXZ(line[i][0], line[i][1]);
              const rx = Math.round(lx * 10) / 10;
              const rz = Math.round(lz * 10) / 10;
              if (rx >= -495 && rx <= 495 && rz >= -495 && rz <= 495) inChunk = true;
              if (flat.length >= 2) {
                len += Math.hypot(rx - flat[flat.length - 2], rz - flat[flat.length - 1]);
              }
              flat.push(rx, rz);
            }
            if (!inChunk || flat.length < 4 || len < 2.2) continue;
            const midIdx = (flat.length >>> 2) * 2;
            const skey = `${LC_STEPS},${Math.round(flat[midIdx] / 3)},${Math.round(flat[midIdx + 1] / 3)}`;
            if (seen.has(skey)) continue;
            seen.add(skey);
            out.push([LC_STEPS, flat, [], { width: Math.max(2.0, Math.min(8.0, Number(f.tags.width) || 3.2)) }]);
          }
        }
      }
    }
  }

  // Match `pitchPois` with `LC_PITCH` / `LC_TRACK` / `LC_PLAYGROUND` polygons
  for (let i = 0; i < out.length; i++) {
    const [kind, outer, , meta] = out[i];
    if (kind !== LC_PITCH && kind !== LC_TRACK && kind !== LC_PLAYGROUND) continue;
    const insidePois = [];
    const nearPois = [];
    for (let j = 0; j < pitchPois.length; j++) {
      const p = pitchPois[j];
      if (pointInRingXZ(p.x, p.z, outer)) {
        p.matched = true;
        insidePois.push(p);
      } else if (distSqToRingXZ(p.x, p.z, outer) <= 13.5 * 13.5) {
        nearPois.push(p);
      }
    }
    const chosen = insidePois.length > 0 ? insidePois : nearPois;
    for (const p of chosen) p.matched = true;
    if (kind === LC_PITCH && meta) {
      meta.pois = chosen.map((p) => [p.x, p.z, p.sport]);
      if (!meta.sport) {
        const withSport = chosen.find((p) => p.sport && p.sport !== 'track' && p.sport !== 'playground');
        if (withSport) meta.sport = withSport.sport;
      }
    }
  }

  // Match `poolPois` with `LC_SWIMMING_POOL` polygons
  for (let i = 0; i < out.length; i++) {
    const [kind, outer] = out[i];
    if (kind !== LC_SWIMMING_POOL) continue;
    for (let j = 0; j < poolPois.length; j++) {
      const p = poolPois[j];
      if (pointInRingXZ(p.x, p.z, outer) || distSqToRingXZ(p.x, p.z, outer) <= 18.0 * 18.0) {
        p.matched = true;
      }
    }
  }

  // Synthesize regulation footprints for unmatched `pitchPois` and `poolPois` whose small polygons were omitted at Z14
  let synPitchCount = 0;
  for (let j = 0; j < pitchPois.length && synPitchCount < 22; j++) {
    const p = pitchPois[j];
    if (p.matched || !p.sport) continue;
    if (p.x < -475 || p.x > 475 || p.z < -475 || p.z > 475) continue;
    if (p.sport === 'track') continue;
    const kind = p.sport === 'playground' ? LC_PLAYGROUND : LC_PITCH;
    let [hl, hw] = sportDefaultDims(p.sport);
    // Align court lengthwise axis perpendicular to nearest neighbor court POI so side-by-side courts never overlap
    let bestD2 = 26 * 26;
    let nbrDx = 0, nbrDz = 0;
    for (let k = 0; k < pitchPois.length; k++) {
      if (k === j) continue;
      const dx = pitchPois[k].x - p.x, dz = pitchPois[k].z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 9 && d2 < bestD2) {
        bestD2 = d2;
        nbrDx = dx;
        nbrDz = dz;
      }
    }
    let angle;
    if (nbrDx !== 0 || nbrDz !== 0) {
      angle = Math.atan2(nbrDz, nbrDx) + Math.PI * 0.5;
      const nbrDist = Math.sqrt(bestD2);
      if (hw * 2 > nbrDist * 0.88) hw = Math.max(3.5, nbrDist * 0.43);
    } else {
      angle = (((Math.round(p.x * 13) ^ Math.round(p.z * 29)) & 1) === 0) ? 0 : Math.PI * 0.5;
    }
    const outer = makeRectRing(p.x, p.z, hl, hw, angle);
    out.push([kind, outer, [], { sport: p.sport, pois: [[p.x, p.z, p.sport]], synthetic: true }]);
    synPitchCount++;
  }

  let synPoolCount = 0;
  for (let j = 0; j < poolPois.length && synPoolCount < 10; j++) {
    const p = poolPois[j];
    if (p.matched) continue;
    if (p.x < -475 || p.x > 475 || p.z < -475 || p.z > 475) continue;
    const outer = makeRectRing(p.x, p.z, 9.5, 5.0, 0);
    out.push([LC_SWIMMING_POOL, outer, [], { synthetic: true }]);
    synPoolCount++;
  }

  // Render low-priority (urban) kinds first; natural cover & courts/pools/steps last
  out.sort((a, b) => LC_STYLE[a[0]][1] - LC_STYLE[b[0]][1]);
  return out;
}
