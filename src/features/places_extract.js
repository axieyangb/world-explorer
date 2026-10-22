// Places feature (worker side, stage 1): pulls POIs, aeroways, piers and stadium
// footprints out of decoded OpenMapTiles layers into compact chunk-local arrays.
// Called once per chunk from `fetchGlobalChunkData` (src/global_tiles.js).

const CHUNK_HALF = 500.0;

function clipRingToBox(flat, minB, maxB) {
  // Sutherland-Hodgman against an axis-aligned square [minB, maxB]^2 on flat [x0, z0, x1, z1, ...]
  let pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const edges = [
    (p) => p[0] >= minB, (p) => p[0] <= maxB, (p) => p[1] >= minB, (p) => p[1] <= maxB,
  ];
  const isect = [
    (a, b) => { const t = (minB - a[0]) / (b[0] - a[0]); return [minB, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (maxB - a[0]) / (b[0] - a[0]); return [maxB, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (minB - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), minB]; },
    (a, b) => { const t = (maxB - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), maxB]; },
  ];
  for (let e = 0; e < 4 && pts.length > 0; e++) {
    const out = [];
    const inside = edges[e];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(isect[e](prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(isect[e](prev, cur));
      }
    }
    pts = out;
  }
  const res = [];
  for (const p of pts) res.push(Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10);
  return res;
}

function lineTouchesBox(flat, pad) {
  for (let i = 0; i < flat.length; i += 2) {
    if (Math.abs(flat[i]) <= CHUNK_HALF + pad && Math.abs(flat[i + 1]) <= CHUNK_HALF + pad) return true;
  }
  return false;
}

function pickName(tags) {
  return tags.name || tags['name:latin'] || tags['name:en'] || tags.name_en || '';
}

function pickNameEn(tags) {
  return tags['name:en'] || tags.name_en || tags['name:latin'] || tags.name || '';
}

/**
 * @param {Array<Object>} tiles decoded MVT layer maps
 * @param {(lat:number, lon:number) => [number, number]} toLocalXZ
 * @param {{centerLat:number, centerLon:number}} origin
 */
export function extractPlaceFeatures(tiles, toLocalXZ, origin) {
  const pois = [];          // [x, z, cls, subclass, name, nameEn, rank]
  const aeroPolys = [];     // [cls, flatXZ clipped to chunk]
  const aeroLines = [];     // [cls, flatXZ (unclipped, local), ref]
  const piers = [];         // [flatXZ]
  const stadiums = [];      // [flatXZ (unclipped, local)]
  const seenPoi = new Set();
  const seenAeroLine = new Set();
  const seenStadium = new Set();

  const ringToLocal = (ring) => {
    const flat = [];
    for (let i = 0; i < ring.length; i++) {
      const [lx, lz] = toLocalXZ(ring[i][0], ring[i][1]);
      flat.push(Math.round(lx * 10) / 10, Math.round(lz * 10) / 10);
    }
    return flat;
  };

  for (const t of tiles) {
    for (const f of t.poi || []) {
      if (f.type !== 1) continue;
      const pts = Array.isArray(f.geom) ? f.geom : [];
      for (const g of pts) {
        const p = Array.isArray(g[0]) ? g[0] : g;
        if (!p || p.length < 2) continue;
        const [lx, lz] = toLocalXZ(p[0], p[1]);
        if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
        const name = pickName(f.tags);
        const key = `${Math.round(lx / 4)},${Math.round(lz / 4)},${name}`;
        if (seenPoi.has(key)) continue;
        seenPoi.add(key);
        pois.push([
          Math.round(lx * 10) / 10,
          Math.round(lz * 10) / 10,
          String(f.tags.class || ''),
          String(f.tags.subclass || ''),
          name,
          pickNameEn(f.tags),
          Number(f.tags.rank) || 99,
        ]);
      }
    }

    for (const f of t.aeroway || []) {
      const cls = String(f.tags.class || '');
      if (f.type === 3) {
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const clipped = clipRingToBox(ringToLocal(poly.outer), -CHUNK_HALF, CHUNK_HALF);
          if (clipped.length >= 6) aeroPolys.push([cls, clipped]);
        }
      } else if (f.type === 2 && (cls === 'runway' || cls === 'taxiway')) {
        for (const line of f.geom) {
          const flat = ringToLocal(line);
          if (flat.length < 4 || !lineTouchesBox(flat, 60)) continue;
          const key = `${cls},${Math.round(flat[0])},${Math.round(flat[1])},${flat.length}`;
          if (seenAeroLine.has(key)) continue;
          seenAeroLine.add(key);
          aeroLines.push([cls, flat, String(f.tags.ref || '')]);
        }
      }
    }

    for (const f of t.transportation || []) {
      if (f.tags.class !== 'pier') continue;
      if (f.type === 2) {
        for (const line of f.geom) {
          const flat = ringToLocal(line);
          if (flat.length >= 4 && lineTouchesBox(flat, 80)) piers.push(flat);
        }
      } else if (f.type === 3) {
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const flat = ringToLocal(poly.outer);
          if (flat.length >= 6 && lineTouchesBox(flat, 80)) piers.push(flat);
        }
      }
    }

    for (const f of t.landuse || []) {
      if (f.type !== 3 || f.tags.class !== 'stadium') continue;
      for (const poly of f.geom) {
        if (!poly.outer || poly.outer.length < 4) continue;
        const flat = ringToLocal(poly.outer);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < flat.length; i += 2) {
          minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]);
          minZ = Math.min(minZ, flat[i + 1]); maxZ = Math.max(maxZ, flat[i + 1]);
        }
        const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
        // Owner chunk = bbox center inside this chunk, so each bowl is built exactly once
        if (cx < -CHUNK_HALF || cx >= CHUNK_HALF || cz < -CHUNK_HALF || cz >= CHUNK_HALF) continue;
        const key = `${Math.round(cx / 40)},${Math.round(cz / 40)}`;
        if (seenStadium.has(key)) continue;
        seenStadium.add(key);
        stadiums.push(flat);
      }
    }
  }

  // Footprint boxes of every nearby building (incl. neighbour chunks) so parked planes and
  // terminal massing never land inside a real terminal; only needed for airport chunks.
  const bldBoxes = [];
  if (aeroPolys.some((a) => a[0] === 'apron')) {
    for (const t of tiles) {
      for (const f of t.building || []) {
        if (f.type !== 3) continue;
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const ll of poly.outer) {
            const [lx, lz] = toLocalXZ(ll[0], ll[1]);
            if (lx < minX) minX = lx;
            if (lx > maxX) maxX = lx;
            if (lz < minZ) minZ = lz;
            if (lz > maxZ) maxZ = lz;
          }
          if (maxX < -700 || minX > 700 || maxZ < -700 || minZ > 700) continue;
          bldBoxes.push(Math.round(minX), Math.round(minZ), Math.round(maxX), Math.round(maxZ));
        }
      }
    }
  }

  return {
    bldBoxes,
    lat: origin ? origin.centerLat : 0,
    lon: origin ? origin.centerLon : 0,
    pois,
    aeroPolys,
    aeroLines,
    piers,
    stadiums,
  };
}
