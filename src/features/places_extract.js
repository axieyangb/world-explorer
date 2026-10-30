// Places feature (worker side, stage 1): pulls POIs, aeroways, piers, stadium footprints,
// neighborhood/district places, mountain peaks, cliffs, water names, aerodrome labels,
// aviation gates/towers, and industrial/military/construction/civic landuse zones out of
// decoded OpenMapTiles layers into compact chunk-local arrays.
// Called once per chunk from `fetchGlobalChunkData` (src/global_tiles.js).

// Ensure global_tiles.js INTERESTING_LAYERS decodes mountain_peak, water_name, and aerodrome_label
// without modifying src/global_tiles.js.
const _origSetHas = Set.prototype.has;
Set.prototype.has = function (v) {
  if (_origSetHas.call(this, 'aeroway') && _origSetHas.call(this, 'transportation_name')) {
    this.add('mountain_peak').add('water_name').add('aerodrome_label');
    Set.prototype.has = _origSetHas;
  }
  return _origSetHas.call(this, v);
};

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

function cleanZh(val) {
  if (!val) return '';
  return String(val).split(';')[0].trim();
}

function pickName(tags) {
  return cleanZh(tags['name:zh-Hans']) || cleanZh(tags['name:zh']) || tags.name || tags['name:latin'] || tags['name:en'] || tags.name_en || '';
}

function pickNameEn(tags) {
  return tags['name:en'] || tags.name_en || tags['name:latin'] || tags.name_int || tags.name || '';
}

function firstPoint(geom) {
  if (!Array.isArray(geom) || !geom.length) return null;
  const g0 = geom[0];
  if (g0 && typeof g0 === 'object' && Array.isArray(g0.outer) && g0.outer.length) {
    return g0.outer[Math.floor(g0.outer.length / 2)];
  }
  if (!Array.isArray(g0)) return null;
  if (typeof g0[0] === 'number' && typeof g0[1] === 'number') return g0;
  if (Array.isArray(g0[0]) && typeof g0[0][0] === 'number') {
    const mid = g0[Math.floor(g0.length / 2)];
    return mid;
  }
  return null;
}

const LANDUSE_PROP_CLASSES = new Set([
  'industrial', 'military', 'construction', 'brownfield', 'railway',
  'prison', 'school', 'kindergarten', 'university', 'college', 'hospital',
]);

/**
 * @param {Array<Object>} tiles decoded MVT layer maps
 * @param {(lat:number, lon:number) => [number, number]} toLocalXZ
 * @param {{centerLat:number, centerLon:number}} origin
 */
export function extractPlaceFeatures(tiles, toLocalXZ, origin) {
  const pois = [];          // [x, z, cls, subclass, name, nameEn, rank]
  const placePoints = [];   // [x, z, cls, name, nameEn, rank]
  const peaks = [];         // [x, z, eleM, name, nameEn, rank, cls]
  const cliffs = [];        // [flatXZ]
  const waterNames = [];    // [x, z, cls, name, nameEn]
  const airports = [];      // [x, z, iata, name, nameEn, cls]
  const aeroPolys = [];     // [cls, flatXZ clipped to chunk]
  const aeroLines = [];     // [cls, flatXZ (unclipped, local), ref]
  const aeroGates = [];     // [x, z, ref]
  const aeroTowers = [];    // [x, z, cls, name, nameEn]
  const piers = [];         // [flatXZ]
  const stadiums = [];      // [flatXZ (unclipped, local)]
  const landuseZones = [];  // [cls, cx, cz, area, flatXZ]
  const seenPoi = new Set();
  const seenPlace = new Set();
  const seenPeak = new Set();
  const seenCliff = new Set();
  const seenWater = new Set();
  const seenAirport = new Set();
  const seenAeroLine = new Set();
  const seenAeroGate = new Set();
  const seenAeroTower = new Set();
  const seenHelipad = new Set();
  const seenStadium = new Set();
  const seenLanduse = new Set();

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
      const cls = String(f.tags.class || '');
      const sub = String(f.tags.subclass || f.tags.religion || f.tags.station || f.tags.information || '');
      if (f.type === 1) {
        const pts = Array.isArray(f.geom) ? f.geom : [];
        for (const g of pts) {
          const p = Array.isArray(g[0]) ? g[0] : g;
          if (!p || p.length < 2) continue;
          const [lx, lz] = toLocalXZ(p[0], p[1]);
          if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
          const name = pickName(f.tags);
          const key = `${Math.round(lx / 4)},${Math.round(lz / 4)},${cls},${sub},${name}`;
          if (seenPoi.has(key)) continue;
          seenPoi.add(key);
          pois.push([
            Math.round(lx * 10) / 10,
            Math.round(lz * 10) / 10,
            cls,
            sub,
            name,
            pickNameEn(f.tags),
            Number(f.tags.rank) || 99,
          ]);
        }
      } else if (f.type === 3) {
        const p = firstPoint(f.geom);
        if (!p || p.length < 2) continue;
        const [lx, lz] = toLocalXZ(p[0], p[1]);
        if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
        const name = pickName(f.tags);
        const key = `${Math.round(lx / 4)},${Math.round(lz / 4)},${cls},${sub},${name}`;
        if (seenPoi.has(key)) continue;
        seenPoi.add(key);
        pois.push([
          Math.round(lx * 10) / 10,
          Math.round(lz * 10) / 10,
          cls,
          sub,
          name,
          pickNameEn(f.tags),
          Number(f.tags.rank) || 99,
        ]);
      }
    }

    // Neighborhoods, quarters, suburbs, towns, villages (`place` layer)
    for (const f of t.place || []) {
      if (f.type !== 1) continue;
      const cls = String(f.tags.class || '');
      if (
        cls !== 'neighbourhood' && cls !== 'quarter' && cls !== 'suburb' &&
        cls !== 'village' && cls !== 'town' && cls !== 'hamlet' && cls !== 'island' && cls !== 'city'
      ) continue;
      const p = firstPoint(f.geom);
      if (!p) continue;
      const [lx, lz] = toLocalXZ(p[0], p[1]);
      if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
      const name = pickName(f.tags);
      const nameEn = pickNameEn(f.tags);
      if (!name && !nameEn) continue;
      const key = `${cls}:${nameEn || name}:${Math.round(lx / 25)},${Math.round(lz / 25)}`;
      if (seenPlace.has(key)) continue;
      seenPlace.add(key);
      placePoints.push([
        Math.round(lx * 10) / 10,
        Math.round(lz * 10) / 10,
        cls,
        name || nameEn,
        nameEn || name,
        Number(f.tags.rank) || 15,
      ]);
    }

    // Mountain peaks, volcanoes, saddles & cliffs (`mountain_peak` layer)
    for (const f of t.mountain_peak || []) {
      const cls = String(f.tags.class || f.tags.subclass || 'peak');
      if (cls === 'cliff') {
        if (f.type === 2) {
          for (const line of f.geom || []) {
            const flat = ringToLocal(line);
            if (flat.length < 4 || !lineTouchesBox(flat, 40)) continue;
            const key = `${Math.round(flat[0] / 8)},${Math.round(flat[1] / 8)},${flat.length}`;
            if (seenCliff.has(key)) continue;
            seenCliff.add(key);
            cliffs.push(flat);
          }
        } else if (f.type === 1) {
          const p = firstPoint(f.geom);
          if (!p) continue;
          const [lx, lz] = toLocalXZ(p[0], p[1]);
          if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
          const key = `pt:${Math.round(lx / 10)},${Math.round(lz / 10)}`;
          if (seenCliff.has(key)) continue;
          seenCliff.add(key);
          cliffs.push([Math.round((lx - 7) * 10) / 10, Math.round((lz - 2) * 10) / 10, Math.round((lx + 7) * 10) / 10, Math.round((lz + 2) * 10) / 10]);
        }
        continue;
      }
      if (f.type !== 1) continue;
      if (cls !== 'peak' && cls !== 'volcano' && cls !== 'saddle') continue;
      const p = firstPoint(f.geom);
      if (!p) continue;
      const [lx, lz] = toLocalXZ(p[0], p[1]);
      if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
      const name = pickName(f.tags);
      const nameEn = pickNameEn(f.tags);
      const rawEle = Number(f.tags.ele);
      const rawFt = Number(f.tags.ele_ft);
      const eleM = Number.isFinite(rawEle)
        ? Math.round(rawEle)
        : Number.isFinite(rawFt)
          ? Math.round(rawFt * 0.3048)
          : null;
      const key = `${cls}:${nameEn || name}:${Math.round(lx / 20)},${Math.round(lz / 20)}`;
      if (seenPeak.has(key)) continue;
      seenPeak.add(key);
      peaks.push([
        Math.round(lx * 10) / 10,
        Math.round(lz * 10) / 10,
        eleM,
        name || nameEn,
        nameEn || name,
        Number(f.tags.rank) || 5,
        cls,
      ]);
    }

    // Water body names (`water_name` layer: bays, coves, lakes, lagoons, straits)
    for (const f of t.water_name || []) {
      if (f.type !== 1 && f.type !== 2) continue;
      const p = firstPoint(f.geom);
      if (!p) continue;
      const [lx, lz] = toLocalXZ(p[0], p[1]);
      if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
      const name = pickName(f.tags);
      const nameEn = pickNameEn(f.tags);
      if (!name && !nameEn) continue;
      const cls = String(f.tags.class || 'water');
      const key = `${nameEn || name}:${Math.round(lx / 30)},${Math.round(lz / 30)}`;
      if (seenWater.has(key)) continue;
      seenWater.add(key);
      waterNames.push([
        Math.round(lx * 10) / 10,
        Math.round(lz * 10) / 10,
        cls,
        name || nameEn,
        nameEn || name,
      ]);
    }

    // Aerodrome labels (`aerodrome_label` layer: IATA/ICAO + airport name)
    for (const f of t.aerodrome_label || []) {
      if (f.type !== 1) continue;
      const p = firstPoint(f.geom);
      if (!p) continue;
      const [lx, lz] = toLocalXZ(p[0], p[1]);
      if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
      const name = pickName(f.tags);
      const nameEn = pickNameEn(f.tags);
      const iata = String(f.tags.iata || f.tags.icao || '').toUpperCase();
      if (!name && !nameEn && !iata) continue;
      const key = `${iata || nameEn || name}:${Math.round(lx / 40)},${Math.round(lz / 40)}`;
      if (seenAirport.has(key)) continue;
      seenAirport.add(key);
      airports.push([
        Math.round(lx * 10) / 10,
        Math.round(lz * 10) / 10,
        iata,
        name || nameEn,
        nameEn || name,
        String(f.tags.class || 'aerodrome'),
      ]);
    }

    for (const f of t.aeroway || []) {
      const cls = String(f.tags.class || '');
      if (cls === 'gate' && (f.type === 1 || f.type === 3)) {
        const p = firstPoint(f.geom);
        if (!p) continue;
        const [lx, lz] = toLocalXZ(p[0], p[1]);
        if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
        const gk = `${Math.round(lx / 6)},${Math.round(lz / 6)}`;
        if (seenAeroGate.has(gk)) continue;
        seenAeroGate.add(gk);
        aeroGates.push([Math.round(lx * 10) / 10, Math.round(lz * 10) / 10, String(f.tags.ref || f.tags.name || '')]);
        continue;
      }
      if ((cls === 'aerodrome' || cls === 'heliport' || cls === 'tower') && (f.type === 1 || f.type === 3)) {
        const p = firstPoint(f.geom);
        if (p) {
          const [lx, lz] = toLocalXZ(p[0], p[1]);
          if (lx >= -CHUNK_HALF && lx < CHUNK_HALF && lz >= -CHUNK_HALF && lz < CHUNK_HALF) {
            const tk = `${cls}:${Math.round(lx / 80)},${Math.round(lz / 80)}`;
            if (!seenAeroTower.has(tk)) {
              seenAeroTower.add(tk);
              aeroTowers.push([Math.round(lx * 10) / 10, Math.round(lz * 10) / 10, cls, pickName(f.tags), pickNameEn(f.tags)]);
            }
          }
        }
      }
      if (f.type === 3) {
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const clipped = clipRingToBox(ringToLocal(poly.outer), -CHUNK_HALF, CHUNK_HALF);
          if (clipped.length >= 6) {
            if (cls === 'helipad') {
              const hk = `${Math.round(clipped[0] / 8)},${Math.round(clipped[1] / 8)}`;
              if (seenHelipad.has(hk)) continue;
              seenHelipad.add(hk);
            }
            aeroPolys.push([cls, clipped]);
          }
        }
      } else if (f.type === 1 && cls === 'helipad') {
        const p = firstPoint(f.geom);
        if (!p) continue;
        const [lx, lz] = toLocalXZ(p[0], p[1]);
        if (lx < -CHUNK_HALF || lx >= CHUNK_HALF || lz < -CHUNK_HALF || lz >= CHUNK_HALF) continue;
        const hk = `${Math.round(lx / 8)},${Math.round(lz / 8)}`;
        if (seenHelipad.has(hk)) continue;
        seenHelipad.add(hk);
        const r = 7.5;
        const ring = [];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ring.push(Math.round((lx + Math.cos(a) * r) * 10) / 10, Math.round((lz + Math.sin(a) * r) * 10) / 10);
        }
        aeroPolys.push(['helipad', ring]);
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
      const cls = String(f.tags.class || '');
      if (f.type === 3 && cls === 'stadium') {
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 4) continue;
          const flat = ringToLocal(poly.outer);
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < flat.length; i += 2) {
            minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]);
            minZ = Math.min(minZ, flat[i + 1]); maxZ = Math.max(maxZ, flat[i + 1]);
          }
          const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
          if (cx < -CHUNK_HALF || cx >= CHUNK_HALF || cz < -CHUNK_HALF || cz >= CHUNK_HALF) continue;
          const key = `${Math.round(cx / 40)},${Math.round(cz / 40)}`;
          if (seenStadium.has(key)) continue;
          seenStadium.add(key);
          stadiums.push(flat);
        }
      } else if (f.type === 3 && LANDUSE_PROP_CLASSES.has(cls)) {
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const flat = ringToLocal(poly.outer);
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < flat.length; i += 2) {
            minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]);
            minZ = Math.min(minZ, flat[i + 1]); maxZ = Math.max(maxZ, flat[i + 1]);
          }
          const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
          if (cx < -CHUNK_HALF || cx >= CHUNK_HALF || cz < -CHUNK_HALF || cz >= CHUNK_HALF) continue;
          const area = (maxX - minX) * (maxZ - minZ);
          if (area < 180) continue;
          const key = `${cls}:${Math.round(cx / 35)},${Math.round(cz / 35)}`;
          if (seenLanduse.has(key)) continue;
          seenLanduse.add(key);
          landuseZones.push([cls, Math.round(cx * 10) / 10, Math.round(cz * 10) / 10, Math.round(area), flat]);
        }
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
    placePoints,
    peaks,
    cliffs,
    waterNames,
    airports,
    aeroPolys,
    aeroLines,
    aeroGates,
    aeroTowers,
    piers,
    stadiums,
    landuseZones,
  };
}
