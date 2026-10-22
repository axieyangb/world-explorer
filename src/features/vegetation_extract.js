/**
 * Vegetation landcover extraction (worker side, dependency-free).
 * Split from vegetation_worker.js so global_tiles.js does not import environment.js (import cycle).
 */

// Landcover kinds
export const LC_RESIDENTIAL = 1;
export const LC_COMMERCIAL = 2;
export const LC_INDUSTRIAL = 3;
export const LC_INSTITUTION = 4;
export const LC_CEMETERY = 5;
const LC_FARMLAND = 6;
export const LC_GRASS = 7;
export const LC_SCRUB = 8;
export const LC_WETLAND = 9;
export const LC_SAND = 10;
const LC_ROCK = 11;
const LC_ICE = 12;
export const LC_WOOD = 13;
export const LC_ORCHARD = 14;

// kind -> [rgb, height above terrain, shader pattern]
// pattern: 0 plain, 1 field rows, 2 sand, 3 paving, 4 undergrowth
// Heights stay below parks (0.08-0.15) for urban kinds and above them for natural cover, all below roads (>= 0.28).
export const LC_STYLE = {
  [LC_RESIDENTIAL]: [[0.47, 0.46, 0.43], 0.020, 3],
  [LC_COMMERCIAL]: [[0.50, 0.49, 0.48], 0.024, 3],
  [LC_INDUSTRIAL]: [[0.45, 0.44, 0.41], 0.028, 3],
  [LC_INSTITUTION]: [[0.51, 0.48, 0.43], 0.032, 3],
  [LC_CEMETERY]: [[0.35, 0.45, 0.29], 0.036, 0],
  [LC_FARMLAND]: [[0.60, 0.56, 0.35], 0.040, 1],
  [LC_ORCHARD]: [[0.44, 0.50, 0.29], 0.044, 1],
  [LC_GRASS]: [[0.34, 0.51, 0.24], 0.060, 0],
  [LC_SCRUB]: [[0.38, 0.44, 0.26], 0.160, 4],
  [LC_WETLAND]: [[0.31, 0.41, 0.31], 0.164, 4],
  [LC_SAND]: [[0.85, 0.78, 0.59], 0.168, 2],
  [LC_ROCK]: [[0.55, 0.53, 0.50], 0.172, 0],
  [LC_ICE]: [[0.92, 0.94, 0.97], 0.176, 0],
  [LC_WOOD]: [[0.22, 0.31, 0.16], 0.180, 4],
};

function classifyLandcover(layer, tags) {
  const c = tags.class || '';
  const s = tags.subclass || '';
  if (layer === 'landcover') {
    if (c === 'wood' || s === 'forest' || s === 'wood') return LC_WOOD;
    if (c === 'sand' || s === 'beach' || s === 'sand' || s === 'dune') return LC_SAND;
    if (c === 'wetland' || s === 'marsh' || s === 'swamp' || s === 'bog' || s === 'reedbed' || s === 'wet_meadow') return LC_WETLAND;
    if (c === 'rock' || s === 'bare_rock' || s === 'scree') return LC_ROCK;
    if (c === 'ice' || s === 'glacier') return LC_ICE;
    if (s === 'orchard' || s === 'vineyard') return LC_ORCHARD;
    if (c === 'farmland' || s === 'farmland' || s === 'allotments' || s === 'plant_nursery') return LC_FARMLAND;
    if (s === 'scrub' || s === 'heath') return LC_SCRUB;
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

/**
 * Tile-side hook: extracts landuse/landcover polygons as `[kind, outerFlat, holesFlat[]]` in chunk-local XZ.
 */
export function extractLandcoverPolys(tiles, toLocalXZ) {
  const out = [];
  const seen = new Set();
  for (const t of tiles) {
    for (const layer of ['landuse', 'landcover']) {
      for (const f of t[layer] || []) {
        if (f.type !== 3) continue;
        const kind = classifyLandcover(layer, f.tags || {});
        if (!kind) continue;
        for (const poly of f.geom) {
          if (!poly.outer || poly.outer.length < 3) continue;
          const raw = [];
          for (let i = 0; i < poly.outer.length; i++) {
            const [lx, lz] = toLocalXZ(poly.outer[i][0], poly.outer[i][1]);
            raw.push(lx, lz);
          }
          const outer = clipRing(raw, -501, 501);
          if (outer.length < 6) continue;
          const area = ringArea(outer);
          if (area < 30) continue;
          let sx = 0, sz = 0;
          for (let i = 0; i < outer.length; i += 2) {
            sx += outer[i];
            sz += outer[i + 1];
          }
          const n = outer.length / 2;
          const key = `${kind},${Math.round(sx / n / 4)},${Math.round(sz / n / 4)},${Math.round(area / 50)}`;
          if (seen.has(key)) continue;
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
          out.push([kind, outer, holes]);
        }
      }
    }
  }
  // Render low-priority (urban) kinds first; natural cover last
  out.sort((a, b) => LC_STYLE[a[0]][1] - LC_STYLE[b[0]][1]);
  return out;
}
