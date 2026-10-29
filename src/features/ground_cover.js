/**
 * [ground] Ground cover from real land use (worker + main thread, dependency-free).
 *
 * The terrain mesh's base colour used to come from Beijing-era rules (anything 15 m above the DEM base was a forested
 * hill, "urban" was a circle around the teleport point). It now comes from what is mapped on the ground:
 *   - OSM landcover / landuse polygons (vegetation_extract.js LC_* kinds, parks),
 *   - building footprint and road coverage around each terrain vertex (so dense blocks read as city even where
 *     landuse is not mapped, e.g. most of Tokyo),
 * Natural tags (wood, farmland, sand, rock, wetland, grass, parks) win; urban landuse picks the urban "flavour";
 * otherwise building/road density decides. Untagged, empty land is meadow (climate-tinted by patchFloraGround).
 *
 * Per vertex we output a base colour (the far-distance average) and a 2-float ground info stored in the terrain
 * mesh's `uv` (the terrain material has no texture, so uv is free):
 *   uv.x = built   0..1  how much of the ground is urban (paved yards, parking, concrete, lawns ...)
 *   uv.y = flavour -1..1 (-1 industrial: concrete/gravel/asphalt, 0 dense core: paving/concrete, +1 residential:
 *                        lawns and gardens between houses)
 * surfaces.js `patchUrbanGround` turns that into close-range lots of paving, concrete, asphalt, soil and lawn.
 *
 * The 40 km horizon terrain uses the same palette from a coarse (250 m) grid built from the z12 overview tiles.
 */

// LC_* kinds (see vegetation_extract.js; duplicated so this module stays import-free for the worker bundle)
const K_RESIDENTIAL = 1, K_COMMERCIAL = 2, K_INDUSTRIAL = 3, K_INSTITUTION = 4, K_CEMETERY = 5, K_FARMLAND = 6;
const K_GRASS = 7, K_SCRUB = 8, K_WETLAND = 9, K_SAND = 10, K_ROCK = 11, K_ICE = 12, K_WOOD = 13, K_ORCHARD = 14;
const K_PARK = 100; // chunk `parks` polygons (OMT park / grass / garden landuse)

// Natural ground colours (albedo, same range as LC_STYLE so overlays and terrain agree)
const NATURAL = {
  [K_CEMETERY]: [0.34, 0.43, 0.27],
  [K_FARMLAND]: [0.56, 0.52, 0.34],
  [K_GRASS]: [0.33, 0.47, 0.23],
  [K_SCRUB]: [0.36, 0.41, 0.24],
  [K_WETLAND]: [0.30, 0.39, 0.29],
  [K_SAND]: [0.80, 0.74, 0.56],
  [K_ROCK]: [0.52, 0.50, 0.47],
  [K_ICE]: [0.90, 0.92, 0.95],
  [K_WOOD]: [0.20, 0.27, 0.14],
  [K_ORCHARD]: [0.42, 0.46, 0.28],
  [K_PARK]: [0.30, 0.45, 0.23],
};
const MEADOW = [0.33, 0.40, 0.25]; // untagged open land
const CLIFF = [0.47, 0.45, 0.42];

/** Far-distance average colour of urban ground for a flavour (-1 industrial .. 0 dense .. +1 residential). */
export function urbanGroundColor(flav) {
  if (flav >= 0) {
    const t = flav;
    return [0.49 + (0.38 - 0.49) * t, 0.48 + (0.42 - 0.48) * t, 0.45 + (0.31 - 0.45) * t];
  }
  const t = -flav;
  return [0.49 + (0.47 - 0.49) * t, 0.48 + (0.46 - 0.48) * t, 0.45 + (0.43 - 0.45) * t];
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function ringBox(ring) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i], z = ring[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return Math.abs(a) * 0.5;
}

// Summed-area table over a w*w Uint8/Float grid
function sat(grid, w) {
  const s = new Float32Array((w + 1) * (w + 1));
  for (let y = 0; y < w; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grid[y * w + x];
      s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row;
    }
  }
  return s;
}
function satBox(s, w, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w - 1, x1); y1 = Math.min(w - 1, y1);
  if (x1 < x0 || y1 < y0) return 0;
  const W = w + 1;
  return s[(y1 + 1) * W + x1 + 1] - s[y0 * W + x1 + 1] - s[(y1 + 1) * W + x0] + s[y0 * W + x0];
}

/**
 * Builds the per-chunk ground sampler from a chunk's tile data (chunk-local coordinates, chunk spans -500..500).
 * Returns (lx, lz) => [r, g, b, built, flavour]; cheap enough for every terrain vertex (~650 per chunk).
 */
export function chunkGroundSampler(data) {
  if (!data) return null;
  const CELL = 8, HALF = 528, W = Math.ceil((HALF * 2) / CELL); // 132 x 132 cells of 8 m
  const bGrid = new Uint8Array(W * W);
  const rGrid = new Uint8Array(W * W);
  const cGrid = new Uint8Array(W * W); // building centroids (count)
  const hGrid = new Float32Array(W * W); // building height at centroid cell (sum)
  const toCell = (v) => Math.floor((v + HALF) / CELL);

  for (const b of data.buildings || []) {
    const outer = b[11];
    if (!outer || outer.length < 6 || (b[5] || 0) > 3) continue; // skip raised parts (bridges, skyways)
    const [x0, z0, x1, z1] = ringBox(outer);
    const cx0 = Math.max(0, toCell(x0)), cx1 = Math.min(W - 1, toCell(x1));
    const cz0 = Math.max(0, toCell(z0)), cz1 = Math.min(W - 1, toCell(z1));
    let hit = false;
    for (let cz = cz0; cz <= cz1; cz++) {
      const pz = -HALF + (cz + 0.5) * CELL;
      for (let cx = cx0; cx <= cx1; cx++) {
        if (pointInRing(-HALF + (cx + 0.5) * CELL, pz, outer)) {
          bGrid[cz * W + cx] = 1;
          hit = true;
        }
      }
    }
    // footprints smaller than a cell still count as ~1 cell of coverage
    const mcx = toCell((x0 + x1) * 0.5), mcz = toCell((z0 + z1) * 0.5);
    if (mcx >= 0 && mcx < W && mcz >= 0 && mcz < W) {
      if (!hit) bGrid[mcz * W + mcx] = 1;
      if (cGrid[mcz * W + mcx] < 255) cGrid[mcz * W + mcx]++;
      hGrid[mcz * W + mcx] += b[4] || 8;
    }
  }

  for (const r of data.roads || []) {
    const cls = r[1], widthM = r[5], isTunnel = r[8], flat = r[10];
    if (isTunnel || !flat || flat.length < 6) continue;
    const footway = cls === 'footway' || cls === 'cycleway' || cls === 'steps' || cls === 'path';
    const hw = Math.max(footway ? 1.0 : 2.5, (widthM || 6) * 0.5) + (footway ? 0 : 1.5); // + sidewalks
    for (let i = 0; i + 5 < flat.length; i += 3) {
      const ax = flat[i], az = flat[i + 2], bx = flat[i + 3], bz = flat[i + 5];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const cx0 = Math.max(0, toCell(Math.min(ax, bx) - hw)), cx1 = Math.min(W - 1, toCell(Math.max(ax, bx) + hw));
      const cz0 = Math.max(0, toCell(Math.min(az, bz) - hw)), cz1 = Math.min(W - 1, toCell(Math.max(az, bz) + hw));
      for (let cz = cz0; cz <= cz1; cz++) {
        const pz = -HALF + (cz + 0.5) * CELL;
        for (let cx = cx0; cx <= cx1; cx++) {
          const px = -HALF + (cx + 0.5) * CELL;
          const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
          const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
          if (dx * dx + dz * dz <= (hw + CELL * 0.35) * (hw + CELL * 0.35)) rGrid[cz * W + cx] = 1;
        }
      }
    }
  }

  const bS = sat(bGrid, W), rS = sat(rGrid, W), cS = sat(cGrid, W), hS = sat(hGrid, W);

  // Tagged polygons: [kind, ring, bbox, area]
  const polys = [];
  for (const p of (data.vegetation && data.vegetation.landcover) || []) {
    const kind = p[0], outer = p[1];
    if (!outer || outer.length < 6) continue;
    if (kind > K_ORCHARD) continue; // courts, pools, plazas, steps: overlay-only detail
    polys.push([kind, outer, ringBox(outer), ringArea(outer), p[2] || []]);
  }
  for (const p of data.parks || []) {
    const flat = p[3];
    if (!flat || flat.length < 6 || p[2] === 'pitch') continue;
    polys.push([K_PARK, flat, ringBox(flat), ringArea(flat), []]);
  }

  return (lx, lz) => {
    // 1. tagged land use / land cover at this point: the most specific (smallest) natural polygon wins
    let nat = 0, natArea = Infinity, urb = 0, urbArea = Infinity;
    for (let i = 0; i < polys.length; i++) {
      const [kind, ring, bb, area, holes] = polys[i];
      if (lx < bb[0] || lx > bb[2] || lz < bb[1] || lz > bb[3]) continue;
      if (!pointInRing(lx, lz, ring)) continue;
      let inHole = false;
      for (let h = 0; h < holes.length && !inHole; h++) inHole = holes[h].length >= 6 && pointInRing(lx, lz, holes[h]);
      if (inHole) continue;
      if (kind <= K_INSTITUTION) {
        if (area < urbArea) { urb = kind; urbArea = area; }
      } else if (area < natArea) {
        nat = kind; natArea = area;
      }
    }

    // 2. building / road coverage in a ~100 m window (and a tighter ~50 m one for the local mix)
    const cx = toCell(lx), cz = toCell(lz);
    const R = 6, n = (2 * R + 1) * (2 * R + 1);
    const bCov = satBox(bS, W, cx - R, cz - R, cx + R, cz + R) / n;
    const rCov = satBox(rS, W, cx - R, cz - R, cx + R, cz + R) / n;
    const cnt = satBox(cS, W, cx - 9, cz - 9, cx + 9, cz + 9);
    const bArea = satBox(bS, W, cx - 9, cz - 9, cx + 9, cz + 9) * CELL * CELL;
    const meanFoot = cnt > 0 ? bArea / cnt : 0;
    const meanH = cnt > 0 ? satBox(hS, W, cx - 9, cz - 9, cx + 9, cz + 9) / cnt : 0;
    const density = bCov + 0.5 * rCov;

    if (nat && nat !== K_CEMETERY) {
      // natural cover follows its tag; a park or lawn wedged between dense blocks still reads green
      const c = NATURAL[nat];
      return [c[0], c[1], c[2], 0, 0];
    }

    let built, flav;
    if (urb) {
      built = 1;
      if (urb === K_INDUSTRIAL) flav = -1;
      else if (urb === K_RESIDENTIAL) flav = 1 - smooth(0.28, 0.5, bCov) * 0.85; // packed blocks: little room for lawns
      else flav = 0.2 * (1 - smooth(0.2, 0.4, bCov)); // commercial / institutional grounds: mostly paved
    } else {
      built = smooth(0.07, 0.19, density);
      // house-sized footprints with gaps -> gardens; big low footprints -> yards of a works / warehouses
      const houses = 0.85 * smooth(450, 200, meanFoot) * (1 - smooth(0.22, 0.4, bCov));
      const works = smooth(1800, 4000, meanFoot) * (1 - smooth(14, 24, meanH));
      flav = houses - works;
    }
    if (nat === K_CEMETERY) { built *= 0.5; flav = 1; }
    flav = Math.max(-1, Math.min(1, flav));
    const u = urbanGroundColor(flav);
    const c = lerp3(MEADOW, u, built);
    return [c[0], c[1], c[2], built, flav];
  };
}

/** Final terrain colour tweaks shared by chunk and horizon terrain: cliffs on steep untagged/natural slopes. */
export function groundSlopeTint(rgb, slope, built) {
  const cliff = smooth(0.85, 1.4, slope) * (1 - built);
  return cliff > 0 ? lerp3(rgb, CLIFF, cliff) : rgb;
}

// ------------------------------------------------------------------------------------------------
// Coarse ground grid for the 40 km horizon terrain (z12 overview tiles, world XZ)
// ------------------------------------------------------------------------------------------------
const OV_CELL = 250, OV_HALF = 20000, OV_W = (OV_HALF * 2) / OV_CELL; // 160 x 160

const OV_URBAN = { residential: 1, commercial: 0, retail: 0, industrial: -1, railway: -1, garages: -1, school: 0.3,
  university: 0.3, college: 0.3, hospital: 0.2, military: -1, quarry: -1 };
const OV_NATURAL = { wood: K_WOOD, forest: K_WOOD, farmland: K_FARMLAND, grass: K_GRASS, meadow: K_GRASS,
  scrub: K_SCRUB, sand: K_SAND, beach: K_SAND, rock: K_ROCK, bare_rock: K_ROCK, ice: K_ICE, glacier: K_ICE,
  wetland: K_WETLAND, park: K_PARK, cemetery: K_CEMETERY, orchard: K_ORCHARD, vineyard: K_ORCHARD,
  allotments: K_FARMLAND, golf_course: K_GRASS, recreation_ground: K_PARK };

/**
 * Builds the coarse ground grid from decoded z12 tiles. `toWorldXZ(lat, lon)` -> [x, z].
 * Returns { cell, half, w, built: Float32Array, flav: Float32Array, nat: Uint8Array }.
 */
export function buildOverviewGround(tiles, toWorldXZ) {
  const n = OV_W * OV_W;
  const roadArea = new Float32Array(n);
  const urbFlav = new Float32Array(n).fill(NaN);
  const nat = new Uint8Array(n);
  const natArea = new Float32Array(n).fill(Infinity);
  const toCell = (v) => Math.floor((v + OV_HALF) / OV_CELL);

  const fillPoly = (ringLL, cb) => {
    const ring = [];
    for (let i = 0; i < ringLL.length; i++) {
      const [x, z] = toWorldXZ(ringLL[i][0], ringLL[i][1]);
      ring.push(x, z);
    }
    if (ring.length < 6) return;
    const [x0, z0, x1, z1] = ringBox(ring);
    if (x1 < -OV_HALF || x0 > OV_HALF || z1 < -OV_HALF || z0 > OV_HALF) return;
    const area = ringArea(ring);
    const cx0 = Math.max(0, toCell(x0)), cx1 = Math.min(OV_W - 1, toCell(x1));
    const cz0 = Math.max(0, toCell(z0)), cz1 = Math.min(OV_W - 1, toCell(z1));
    for (let cz = cz0; cz <= cz1; cz++) {
      const pz = -OV_HALF + (cz + 0.5) * OV_CELL;
      for (let cx = cx0; cx <= cx1; cx++) {
        if (pointInRing(-OV_HALF + (cx + 0.5) * OV_CELL, pz, ring)) cb(cz * OV_W + cx, area);
      }
    }
  };

  for (const t of tiles) {
    for (const layer of ['landuse', 'landcover', 'park']) {
      for (const f of t[layer] || []) {
        if (f.type !== 3) continue;
        const cls = String(f.tags.class || '').toLowerCase();
        const sub = String(f.tags.subclass || '').toLowerCase();
        const nk = layer === 'park' ? K_PARK : OV_NATURAL[sub] || OV_NATURAL[cls] || 0;
        const uf = layer === 'landuse' ? OV_URBAN[cls] : undefined;
        if (!nk && uf === undefined) continue;
        for (const poly of f.geom) {
          fillPoly(poly.outer, (i, area) => {
            if (nk) {
              if (area < natArea[i]) { natArea[i] = area; nat[i] = nk; }
            } else if (Number.isNaN(urbFlav[i]) || uf < urbFlav[i]) {
              urbFlav[i] = uf;
            }
          });
        }
      }
    }
    for (const f of t.transportation || []) {
      if (f.type !== 2) continue;
      const cls = f.tags.class || '';
      const w = cls === 'motorway' || cls === 'trunk' ? 22 : cls === 'primary' || cls === 'secondary' ? 16
        : cls === 'tertiary' ? 13 : cls === 'minor' ? 11 : cls === 'service' ? 6 : 0;
      if (!w || f.tags.brunnel === 'tunnel') continue;
      for (const line of f.geom) {
        let prev = null;
        for (let i = 0; i < line.length; i++) {
          const p = toWorldXZ(line[i][0], line[i][1]);
          if (prev) {
            const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
            const steps = Math.max(1, Math.ceil(len / 60));
            for (let s = 0; s < steps; s++) {
              const u = (s + 0.5) / steps;
              const cx = toCell(prev[0] + (p[0] - prev[0]) * u), cz = toCell(prev[1] + (p[1] - prev[1]) * u);
              if (cx >= 0 && cx < OV_W && cz >= 0 && cz < OV_W) roadArea[cz * OV_W + cx] += (len / steps) * w;
            }
          }
          prev = p;
        }
      }
    }
  }

  // 3x3 blur of road coverage so the street grid reads as a continuous urban area
  const built = new Float32Array(n);
  const flav = new Float32Array(n);
  for (let cz = 0; cz < OV_W; cz++) {
    for (let cx = 0; cx < OV_W; cx++) {
      let s = 0, k = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= OV_W || z >= OV_W) continue;
          s += roadArea[z * OV_W + x] * (dx || dz ? 0.5 : 1);
          k += dx || dz ? 0.5 : 1;
        }
      }
      const cov = s / k / (OV_CELL * OV_CELL);
      const i = cz * OV_W + cx;
      const tagged = !Number.isNaN(urbFlav[i]);
      let b = Math.max(tagged ? 1 : 0, smooth(0.07, 0.16, cov));
      // tagged residential is often dense apartment blocks: gardens only where the street grid is sparse
      let f = tagged ? (urbFlav[i] > 0.5 ? 0.75 - 0.6 * smooth(0.1, 0.2, cov) : urbFlav[i]) : 0.6 * (1 - smooth(0.12, 0.22, cov));
      if (nat[i] && nat[i] !== K_CEMETERY) b = 0;
      built[i] = b;
      flav[i] = f;
    }
  }
  return { cell: OV_CELL, half: OV_HALF, w: OV_W, built, flav, nat };
}

/** Horizon sampler: (wx, wz) -> [r, g, b, built, flavour] from the coarse grid (bilinear over cell centres). */
export function overviewGroundSampler(grid) {
  if (!grid) return null;
  const { cell, half, w, built, flav, nat } = grid;
  return (wx, wz) => {
    const fx = Math.max(0, Math.min(w - 1.001, (wx + half) / cell - 0.5));
    const fz = Math.max(0, Math.min(w - 1.001, (wz + half) / cell - 0.5));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const acc = [0, 0, 0, 0, 0];
    const add = (i, wgt) => {
      const b = built[i], f = flav[i];
      const base = nat[i] ? NATURAL[nat[i]] : MEADOW;
      const c = b > 0 ? lerp3(base, urbanGroundColor(f), b) : base;
      acc[0] += c[0] * wgt; acc[1] += c[1] * wgt; acc[2] += c[2] * wgt; acc[3] += b * wgt; acc[4] += f * b * wgt;
    };
    add(iz * w + ix, (1 - tx) * (1 - tz));
    add(iz * w + ix + 1, tx * (1 - tz));
    add((iz + 1) * w + ix, (1 - tx) * tz);
    add((iz + 1) * w + ix + 1, tx * tz);
    acc[4] = acc[3] > 1e-4 ? acc[4] / acc[3] : 0;
    return acc;
  };
}

export const GROUND_MEADOW = MEADOW;
