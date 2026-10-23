// [feature/rail-transit] Worker-side rail extraction from OpenMapTiles `transportation` + `poi` layers.
//
// Each Z14 tile ships its line pieces with a 64-unit buffer, so a raw piece overlaps its neighbour tile's
// piece. We clip every piece to its own tile's exact extent [0, 4096] so neighbouring pieces meet end-to-end
// at the tile edge; the main thread (rail_transit.js) stitches them into one continuous network.
//
// Output (chunk-local metres, same frame as the rest of the chunk schema):
//   lines: [{ k: kind, svc: 0|1, br: 0|1, tn: 0|1, ly: layer, p: [x0, z0, x1, z1, ...] }]
//   stops: [[x, z, type, name]]  type 0 = tram/LRT stop, 1 = station, 2 = aerialway station

const EXT = 4096;

const RAIL_KIND = {
  rail: 'rail', narrow_gauge: 'rail', preserved: 'rail',
  subway: 'subway', light_rail: 'light_rail', tram: 'tram',
  funicular: 'funicular', monorail: 'monorail',
};
const AERIAL_KIND = { cable_car: 'aerial', gondola: 'aerial', mixed_lift: 'aerial', chair_lift: 'aerial' };

// San Francisco cable car corridors (Powell–Hyde, Powell–Mason, California St), lat/lon polylines traced
// from the OSM tram ways. OpenMapTiles exposes these only as `transit/tram`, so tram segments lying on one
// of these corridors are re-classified as `cable_car` (cable slot, grip cars, 9.5 mph).
const SF_CABLE_CORRIDORS = [
  [[37.78465, -122.40778], [37.79470, -122.40985]], // Powell St (Market turntable → Jackson)
  [[37.79043, -122.42215], [37.79202, -122.40932], [37.79334, -122.39894], [37.79380, -122.39575]], // California St
  [[37.79470, -122.40990], [37.79372, -122.41785], [37.79386, -122.41800], [37.79640, -122.41850]], // Washington St
  [[37.79560, -122.41005], [37.79460, -122.41800], [37.79640, -122.41850]], // Jackson St
  [[37.79640, -122.41850], [37.80660, -122.42060]], // Hyde St (→ Hyde & Beach turntable)
  [[37.79455, -122.41125], [37.80034, -122.41253], [37.80226, -122.41297], [37.80380, -122.41491], [37.80535, -122.41526]], // Mason / Columbus / Taylor
];
const SF_BOX = { minLat: 37.70, maxLat: 37.83, minLon: -122.52, maxLon: -122.35 };

function distToPolyM(lat, lon, poly) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = (poly[i][1] - lon) * kx, ay = (poly[i][0] - lat) * ky;
    const bx = (poly[i + 1][1] - lon) * kx, by = (poly[i + 1][0] - lat) * ky;
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy || 1e-9;
    let t = -(ax * vx + ay * vy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(ax + vx * t, ay + vy * t);
    if (d < best) best = d;
  }
  return best;
}
function onCableCorridor(lat, lon) {
  if (lat < SF_BOX.minLat || lat > SF_BOX.maxLat || lon < SF_BOX.minLon || lon > SF_BOX.maxLon) return false;
  for (const c of SF_CABLE_CORRIDORS) if (distToPolyM(lat, lon, c) < 16) return true;
  return false;
}

function latLonToTileG(lat, lon, n, tx, ty) {
  const gx = ((lon + 180) / 360 * n - tx) * EXT;
  const r = (lat * Math.PI) / 180;
  const gy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - ty) * EXT;
  return [gx, gy];
}
function tileGToLatLon(gx, gy, n, tx, ty) {
  const lon = ((tx + gx / EXT) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + gy / EXT)) / n))) * 180) / Math.PI;
  return [lat, lon];
}

/** Liang–Barsky clip of segment a→b to the tile box; returns [t0, t1] or null. */
function clipSeg(ax, ay, bx, by) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax, EXT - ax, ay, EXT - ay];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}

/** Clips a lat/lon line to the tile's exact extent; returns arrays of [lat, lon] pieces. */
function clipLineToTile(line, n, tx, ty) {
  const g = line.map((p) => latLonToTileG(p[0], p[1], n, tx, ty));
  const pieces = [];
  let cur = null;
  for (let i = 0; i < g.length - 1; i++) {
    const [ax, ay] = g[i], [bx, by] = g[i + 1];
    const c = clipSeg(ax, ay, bx, by);
    if (!c) { if (cur) { pieces.push(cur); cur = null; } continue; }
    const p0 = [ax + (bx - ax) * c[0], ay + (by - ay) * c[0]];
    const p1 = [ax + (bx - ax) * c[1], ay + (by - ay) * c[1]];
    if (!cur) cur = [p0];
    else if (c[0] > 1e-9) { pieces.push(cur); cur = [p0]; }
    cur.push(p1);
    if (c[1] < 1 - 1e-9) { pieces.push(cur); cur = null; }
  }
  if (cur) pieces.push(cur);
  return pieces.filter((pc) => pc.length >= 2).map((pc) => pc.map(([gx, gy]) => tileGToLatLon(gx, gy, n, tx, ty)));
}

/**
 * @param {Array<Object>} tiles decoded MVT tiles (same order as tileXY)
 * @param {Array<[number, number, number]>} tileXY [z, tx, ty] per tile
 * @param {(lat:number, lon:number) => [number, number]} toLocalXZ chunk-local projection
 */
export function extractRailFeatures(tiles, tileXY, toLocalXZ) {
  const lines = [];
  const stops = [];
  const seenStops = new Set();
  const M = 560; // keep pieces touching the chunk (+margin); vehicles stitch across chunks

  for (let ti = 0; ti < tiles.length; ti++) {
    const t = tiles[ti];
    const xy = tileXY && tileXY[ti];
    if (!t || !xy) continue;
    const [z, tx, ty] = xy;
    const n = 2 ** z;

    for (const f of t.transportation || []) {
      if (f.type !== 2) continue;
      const cls = f.tags.class || '';
      const sub = f.tags.subclass || '';
      let kind = null;
      if (cls === 'rail' || cls === 'transit') kind = RAIL_KIND[sub] || (cls === 'transit' ? 'light_rail' : 'rail');
      else if (cls === 'aerialway') kind = AERIAL_KIND[sub] || null;
      if (!kind) continue;
      const svc = f.tags.service ? 1 : 0;
      const br = f.tags.brunnel === 'bridge' ? 1 : 0;
      const tn = f.tags.brunnel === 'tunnel' || Number(f.tags.layer) < 0 ? 1 : 0;
      const ly = f.tags.layer !== undefined ? Number(f.tags.layer) || 0 : br ? 1 : tn ? -1 : 0;
      const canBeCable = kind === 'tram' || kind === 'funicular' || (kind === 'aerial' && sub === 'cable_car');

      for (const raw of f.geom) {
        if (!raw || raw.length < 2) continue;
        // aerial ropeways are point-to-point spans: keep unclipped so towers/stations stay intact
        const pieces = kind === 'aerial' && !canBeCable ? [raw] : clipLineToTile(raw, n, tx, ty);
        for (const ll of pieces) {
          // Split by cable-car corridor membership (per segment) for SF.
          let runs = [{ k: kind, pts: [ll[0]] }];
          if (canBeCable) {
            runs = [];
            let cur = null;
            for (let i = 0; i < ll.length - 1; i++) {
              const a = ll[i], b = ll[i + 1];
              const isCable = onCableCorridor(a[0], a[1]) && onCableCorridor(b[0], b[1]) &&
                onCableCorridor((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
              const k = isCable ? 'cable_car' : kind === 'aerial' ? null : kind;
              if (!cur || cur.k !== k) { if (cur) runs.push(cur); cur = { k, pts: [a] }; }
              cur.pts.push(b);
            }
            if (cur) runs.push(cur);
          } else {
            runs[0].pts = ll;
          }
          for (const run of runs) {
            if (!run.k || run.pts.length < 2) continue;
            const p = [];
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const q of run.pts) {
              const [lx, lz] = toLocalXZ(q[0], q[1]);
              const x = Math.round(lx * 100) / 100, zz = Math.round(lz * 100) / 100;
              if (p.length >= 2 && Math.abs(p[p.length - 2] - x) < 0.05 && Math.abs(p[p.length - 1] - zz) < 0.05) continue;
              p.push(x, zz);
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (zz < minZ) minZ = zz; if (zz > maxZ) maxZ = zz;
            }
            if (p.length < 4) continue;
            if (maxX < -M || minX > M || maxZ < -M || minZ > M) continue;
            lines.push({ k: run.k, svc, br, tn, ly, p });
          }
        }
      }
    }

    for (const f of t.poi || []) {
      const cls = f.tags.class || '';
      const sub = f.tags.subclass || '';
      let type = -1;
      if (cls === 'railway') {
        if (sub === 'tram_stop') type = 0;
        else if (sub === 'station' || sub === 'halt' || sub === 'subway' || sub === 'light_rail') type = 1;
      } else if (cls === 'aerialway' && sub === 'station') type = 2;
      if (type < 0 || !f.geom || !f.geom.length) continue;
      let pt = f.geom[0];
      if (Array.isArray(pt[0])) pt = pt[0];
      const [lx, lz] = toLocalXZ(pt[0], pt[1]);
      if (lx < -M || lx > M || lz < -M || lz > M) continue;
      const key = `${Math.round(lx / 4)},${Math.round(lz / 4)},${type}`;
      if (seenStops.has(key)) continue;
      seenStops.add(key);
      const name = f.tags['name:en'] || f.tags.name_en || f.tags.name || '';
      stops.push([Math.round(lx * 10) / 10, Math.round(lz * 10) / 10, type, name]);
    }
  }
  return { lines, stops };
}
