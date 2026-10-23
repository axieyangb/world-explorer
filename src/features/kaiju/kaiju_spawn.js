// Kaiju Defense: spawn site. Nearest large water body within CFG.SPAWN_WATER_SEARCH (deep point, ~CFG.SPAWN_DIST
// from the player), else the map-edge direction with the most open land. See DESIGN.md.
import { CFG } from "./kaiju_config.js";

const CELL = 20; // m, raster resolution for the water mask

// Building centroids + approximate volumes from loaded chunks: [x, z, volume, ...]
function collectBuildings(app) {
  const out = [];
  for (const ch of app?.loadedChunks?.values?.() || []) {
    const ents = ch.userData?.buildingEntities;
    if (!ents) continue;
    for (let i = 0; i < ents.length; i++) {
      const b = ents[i];
      const f = b.flatOuter;
      if (!f || f.length < 6 || (b.kind && b.kind !== "building")) continue;
      let sx = 0, sz = 0, a = 0;
      const n = f.length;
      for (let k = 0, j = n - 2; k < n; j = k, k += 2) {
        sx += f[k]; sz += f[k + 1];
        a += f[j] * f[k + 1] - f[k] * f[j + 1];
      }
      const cnt = n / 2;
      out.push((b.ox || 0) + sx / cnt, (b.oz || 0) + sz / cnt, Math.abs(a) * 0.5 * Math.max(3, b.height || 10));
    }
  }
  return out;
}

// Densest ~200 m building cell in loaded chunks (fallback for KaijuDestruction.getDensestTarget).
// Cells within `exclude` m of (fromX, fromZ) are skipped. Returns { x, z } or null.
export function densestBuildingCell(app, fromX, fromZ, exclude = 0) {
  const B = collectBuildings(app);
  if (!B.length) return null;
  const C = 120;
  const cells = new Map();
  for (let i = 0; i < B.length; i += 3) {
    const k = Math.floor(B[i] / C) * 100003 + Math.floor(B[i + 1] / C);
    let c = cells.get(k);
    if (!c) { c = { v: 0, x: 0, z: 0 }; cells.set(k, c); }
    c.v += B[i + 2]; c.x += B[i] * B[i + 2]; c.z += B[i + 1] * B[i + 2];
  }
  let best = null, bs = -1;
  for (const c of cells.values()) {
    const x = c.x / c.v, z = c.z / c.v;
    const d = Math.hypot(x - fromX, z - fromZ);
    if (d < exclude) continue;
    const s = c.v / (1 + Math.pow(d / 160, 1.65));
    if (s > bs) { bs = s; best = { x, z }; }
  }
  return best;
}

function rasterWater(app, cx, cz, R) {
  const N = Math.ceil((2 * R) / CELL);
  const x0 = cx - R, z0 = cz - R;
  const g = new Uint8Array(N * N);
  const fillPoly = (pts, ox, oz) => {
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] + ox, z = pts[i + 1] + oz;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    if (mxx < x0 || mnx > x0 + 2 * R || mxz < z0 || mnz > z0 + 2 * R) return;
    const r0 = Math.max(0, Math.floor((mnz - z0) / CELL)), r1 = Math.min(N - 1, Math.floor((mxz - z0) / CELL));
    const xs = [];
    const n = pts.length;
    for (let r = r0; r <= r1; r++) {
      const zc = z0 + (r + 0.5) * CELL;
      xs.length = 0;
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        const zi = pts[i + 1] + oz, zj = pts[j + 1] + oz;
        if ((zi > zc) !== (zj > zc)) {
          const xi = pts[i] + ox, xj = pts[j] + ox;
          xs.push(xi + ((zc - zi) * (xj - xi)) / (zj - zi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / CELL - 0.5)), c1 = Math.min(N - 1, Math.floor((xs[k + 1] - x0) / CELL - 0.5));
        for (let c = c0; c <= c1; c++) g[r * N + c] = 1;
      }
    }
  };
  const fillSeg = (ax, az, bx, bz, hw) => {
    const mnx = Math.min(ax, bx) - hw, mxx = Math.max(ax, bx) + hw, mnz = Math.min(az, bz) - hw, mxz = Math.max(az, bz) + hw;
    const c0 = Math.max(0, Math.floor((mnx - x0) / CELL)), c1 = Math.min(N - 1, Math.floor((mxx - x0) / CELL));
    const r0 = Math.max(0, Math.floor((mnz - z0) / CELL)), r1 = Math.min(N - 1, Math.floor((mxz - z0) / CELL));
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (let r = r0; r <= r1; r++) {
      const pz = z0 + (r + 0.5) * CELL;
      for (let c = c0; c <= c1; c++) {
        const px = x0 + (c + 0.5) * CELL;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
        const ex = ax + dx * t - px, ez = az + dz * t - pz;
        if (ex * ex + ez * ez <= hw * hw) g[r * N + c] = 1;
      }
    }
  };
  // 1) overview water (world coords, whole region): [id, name, "poly"|"line", width, flatXZ]
  for (const w of app?.overview?.water || []) {
    const pts = w[4];
    if (!Array.isArray(pts) && !(pts && pts.length)) continue;
    if (w[2] === "poly" && pts.length >= 6) fillPoly(pts, 0, 0);
    else if (pts.length >= 4) {
      const hw = Math.max(w[3] || 12, 10) * 0.5;
      for (let i = 0; i + 3 < pts.length; i += 2) fillSeg(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], hw);
    }
  }
  // 2) detailed chunk water meshes (chunk-local triangles)
  const waterMat = app?.mats?.waterMat;
  for (const ch of app?.loadedChunks?.values?.() || []) {
    const tg = ch.userData?.subGroups?.terrain;
    if (!tg || !waterMat) continue;
    for (const m of tg.children) {
      if (!m.isMesh || m.material !== waterMat) continue;
      const pa = m.geometry?.attributes?.position;
      if (!pa || !pa.array) continue;
      const a = pa.array, ox = ch.position.x + m.position.x, oz = ch.position.z + m.position.z;
      const tri = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i + 8 < a.length; i += 9) {
        tri[0] = a[i]; tri[1] = a[i + 2]; tri[2] = a[i + 3]; tri[3] = a[i + 5]; tri[4] = a[i + 6]; tri[5] = a[i + 8];
        fillPoly(tri, ox, oz);
      }
    }
  }
  return { g, N, x0, z0 };
}

// Deep point of the nearest large water body, or null.
function findWater(app, px, pz) {
  const R = CFG.SPAWN_WATER_SEARCH + 200;
  const { g, N, x0, z0 } = rasterWater(app, px, pz, R);
  // buildings are never water (islands, piers): clear their cells + 1 ring
  const B = collectBuildings(app);
  for (let i = 0; i < B.length; i += 3) {
    const c = Math.floor((B[i] - x0) / CELL), r = Math.floor((B[i + 1] - z0) / CELL);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) g[rr * N + cc] = 0;
    }
  }
  // chamfer distance to land (cells), window border counts as water
  const D = new Float32Array(N * N);
  const BIG = 1e6;
  for (let i = 0; i < N * N; i++) D[i] = g[i] ? BIG : 0;
  const S2 = Math.SQRT2;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if (!D[i]) continue;
    let v = D[i];
    if (c > 0) v = Math.min(v, D[i - 1] + 1);
    if (r > 0) {
      v = Math.min(v, D[i - N] + 1);
      if (c > 0) v = Math.min(v, D[i - N - 1] + S2);
      if (c < N - 1) v = Math.min(v, D[i - N + 1] + S2);
    }
    D[i] = v;
  }
  for (let r = N - 1; r >= 0; r--) for (let c = N - 1; c >= 0; c--) {
    const i = r * N + c;
    if (!D[i]) continue;
    let v = D[i];
    if (c < N - 1) v = Math.min(v, D[i + 1] + 1);
    if (r < N - 1) {
      v = Math.min(v, D[i + N] + 1);
      if (c < N - 1) v = Math.min(v, D[i + N + 1] + S2);
      if (c > 0) v = Math.min(v, D[i + N - 1] + S2);
    }
    D[i] = v;
  }
  // connected components (area)
  const lab = new Int32Array(N * N).fill(-1);
  const areas = [];
  const stack = new Int32Array(N * N);
  for (let s = 0; s < N * N; s++) {
    if (!g[s] || lab[s] >= 0) continue;
    const id = areas.length;
    let sp = 0, cnt = 0;
    stack[sp++] = s; lab[s] = id;
    while (sp) {
      const i = stack[--sp]; cnt++;
      const r = (i / N) | 0, c = i - r * N;
      if (c > 0 && g[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack[sp++] = i - 1; }
      if (c < N - 1 && g[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack[sp++] = i + 1; }
      if (r > 0 && g[i - N] && lab[i - N] < 0) { lab[i - N] = id; stack[sp++] = i - N; }
      if (r < N - 1 && g[i + N] && lab[i + N] < 0) { lab[i + N] = id; stack[sp++] = i + N; }
    }
    areas.push(cnt * CELL * CELL);
  }
  const pick = (minDepthM, minArea) => {
    let best = -1, bs = -Infinity;
    for (let i = 0; i < N * N; i++) {
      if (!g[i]) continue;
      const depth = D[i] * CELL;
      if (depth < minDepthM || depth > 75 || areas[lab[i]] < minArea) continue;
      const r = (i / N) | 0, c = i - r * N;
      const x = x0 + (c + 0.5) * CELL, z = z0 + (r + 0.5) * CELL;
      const d = Math.hypot(x - px, z - pz);
      if (d < 220 || d > CFG.SPAWN_WATER_SEARCH) continue;
      // Prefer near-shore water (~30-50m from land) near SPAWN_DIST so the Kaiju steps onto land into buildings quickly
      const s = 55 - Math.abs(depth - 36) * 0.8 - Math.abs(d - CFG.SPAWN_DIST) * 0.12;
      if (s > bs) { bs = s; best = i; }
    }
    if (best < 0) return null;
    const r = (best / N) | 0, c = best - r * N;
    return { x: x0 + (c + 0.5) * CELL, z: z0 + (r + 0.5) * CELL, depth: D[best] * CELL, area: areas[lab[best]] };
  };
  return pick(22, 90000);
}

// Urban spawn fallback: direction (of 16) with high nearby building density at ~CFG.SPAWN_DIST so the Kaiju
// immediately marches through city blocks.
function findEdge(app, px, pz) {
  const B = collectBuildings(app);
  const SECT = 16;
  const vol = new Float64Array(SECT);
  for (let i = 0; i < B.length; i += 3) {
    const dx = B[i] - px, dz = B[i + 1] - pz, d = Math.hypot(dx, dz);
    if (d < 180 || d > 650) continue;
    let a = Math.atan2(dx, dz);
    if (a < 0) a += Math.PI * 2;
    vol[Math.floor((a / (Math.PI * 2)) * SECT) % SECT] += B[i + 2];
  }
  let bi = 0, bv = -Infinity;
  for (let s = 0; s < SECT; s++) {
    const v = vol[s] * 0.5 + vol[(s + 1) % SECT] * 0.25 + vol[(s + SECT - 1) % SECT] * 0.25;
    if (v > bv) { bv = v; bi = s; }
  }
  const a = ((bi + 0.5) / SECT) * Math.PI * 2;
  const x = px + Math.sin(a) * CFG.SPAWN_DIST, z = pz + Math.cos(a) * CFG.SPAWN_DIST;
  return { x, z };
}

export function pickSpawn(K) {
  const app = K.app;
  const p = K.getHeliPos?.() || app?.pos || { x: 0, z: 0 };
  let w = null;
  try { w = findWater(app, p.x, p.z); } catch (e) { console.warn("[kaiju] water search failed", e); }
  // Only use water spawn if there is a dense building cluster within 220m of the water spawn point
  if (w) {
    const nearB = densestBuildingCell(app, w.x, w.z, 20);
    if (!nearB || Math.hypot(nearB.x - w.x, nearB.z - w.z) > 220) w = null;
  }
  const sp = w ? { x: w.x, z: w.z, fromWater: true, kind: "water", depth: w.depth, area: w.area }
               : { ...findEdge(app, p.x, p.z), fromWater: false, kind: "edge" };
  let target = null;
  try { target = K.destruction?.getDensestTarget?.(sp.x, sp.z) || null; } catch (e) { target = null; }
  if (!target) target = densestBuildingCell(app, sp.x, sp.z, 35) || { x: p.x, z: p.z };
  return { ...sp, targetX: target.x, targetZ: target.z };
}
