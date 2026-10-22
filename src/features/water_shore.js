/**
 * Worker-safe helpers (no DOM / no THREE) that encode distance-to-shore into the water mesh `uv`
 * attribute so the water shader (src/features/water.js) can draw shoreline foam / darkening.
 *
 * Encoding: shoreDist = uv.y - 1.0 - abs(uv.x)   (metres). uv.y == 0 (missing attribute) => open water.
 *   - polygons: uv = (0, dist + 1)               (per-vertex distance to nearest real shore edge)
 *   - river ribbons: uv = (+-halfW, halfW + 1)   (linear across the ribbon => 0 at banks, halfW at centre)
 */

const SHORE_CAP = 40.0; // metres; foam only cares about the first few metres
const CELL = 40.0;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

function buildEdgeGrid(rings) {
  const grid = new Map();
  const edges = [];
  for (const flat of rings) {
    if (!flat || flat.length < 6) continue;
    const n = flat.length;
    for (let i = 0; i < n; i += 2) {
      const ax = flat[i], az = flat[i + 1];
      const bx = flat[(i + 2) % n], bz = flat[(i + 3) % n];
      const ex = Math.abs(bx - ax), ez = Math.abs(bz - az);
      // Skip tile-clip seams: long, perfectly axis-aligned edges are almost never real shorelines.
      if ((ex < 0.05 || ez < 0.05) && ex + ez > 30.0) continue;
      const idx = edges.length;
      edges.push(ax, az, bx, bz);
      const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL);
      const z0 = Math.floor(Math.min(az, bz) / CELL), z1 = Math.floor(Math.max(az, bz) / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) continue;
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const key = gx * 100003 + gz;
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          list.push(idx);
        }
      }
    }
  }
  return { grid, edges };
}

function shoreDistance(g, px, pz) {
  const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
  let best = SHORE_CAP;
  const e = g.edges;
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const list = g.grid.get(gx * 100003 + gz);
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const j = list[k];
        const d = segDist(px, pz, e[j], e[j + 1], e[j + 2], e[j + 3]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** Appends uvs for one polygon's subdivided triangles (vertex order a, c, b as pushed by chunk_builder). */
export function appendPolyShoreUv(out, subTris, flatOuter, flatHoles) {
  const g = buildEdgeGrid([flatOuter, ...(flatHoles || [])]);
  for (let i = 0; i < subTris.length; i += 6) {
    const da = shoreDistance(g, subTris[i], subTris[i + 1]);
    const db = shoreDistance(g, subTris[i + 2], subTris[i + 3]);
    const dc = shoreDistance(g, subTris[i + 4], subTris[i + 5]);
    out.push(0, da + 1, 0, dc + 1, 0, db + 1);
  }
}

/** Appends uvs for one river ribbon quad (6 vertices, order matching chunk_builder). */
export function appendRibbonShoreUv(out, halfW) {
  const y = halfW + 1;
  out.push(halfW, y, halfW, y, -halfW, y, halfW, y, -halfW, y, -halfW, y);
}
