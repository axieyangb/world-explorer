/**
 * [feature/ferries-ships] Region-scale sea data around the world origin, from the same Zoom-12
 * OpenFreeMap tiles the overview/horizon already fetch (shared tile cache, no extra requests):
 *  - a 25 m water raster, a 100 m navigation grid with distance-to-shore, A* sea routes;
 *  - stitched `transportation class=ferry` routes.
 */
import { fetchDecodedMvtTile, latLonToTileXY } from '../../global_tiles.js';
import { llToWorld, tileBoxWorld, clipRing, clipLine, polylineLength, chaikin } from './geo.js';

const Z = 12;
export const SPAN = 16000;       // region half-size (m), matches buildGlobalOverviewFromTiles
const FINE = 25;                 // water raster cell (m)
const NF = Math.ceil((2 * SPAN) / FINE);
const COARSE = 100;              // navigation cell (m)
const NC = Math.ceil((2 * SPAN) / COARSE);
const K = COARSE / FINE;

export class SeaRegion {
  constructor(origin) {
    this.origin = origin;
    this.ready = false;
    this.fine = new Uint8Array(NF * NF);
    this.nav = new Uint8Array(NC * NC);   // 1 = open water (coarse)
    this.dist = new Uint8Array(NC * NC);  // chessboard cells to the nearest land
    this.comp = new Int32Array(NC * NC);
    this.ferryRoutes = [];
    this.n = NC;
    this.cell = COARSE;
  }

  async load() {
    const o = this.origin;
    const [tx0, ty0] = latLonToTileXY(o.centerLat + SPAN / o.mPerDegLat, o.centerLon - SPAN / o.mPerDegLon, Z);
    const [tx1, ty1] = latLonToTileXY(o.centerLat - SPAN / o.mPerDegLat, o.centerLon + SPAN / o.mPerDegLon, Z);
    const jobs = [];
    for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
      for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
        jobs.push(fetchDecodedMvtTile(Z, tx, ty).then((t) => ({ t, box: tileBoxWorld(o, Z, tx, ty) })));
      }
    }
    const tiles = await Promise.all(jobs);
    const ferryPieces = [];
    for (const { t, box } of tiles) {
      for (const f of t.water || []) {
        if (f.type !== 3) continue;
        for (const poly of f.geom) {
          const rings = [];
          for (const ring of [poly.outer, ...(poly.holes || [])]) {
            const w = ring.map((p) => llToWorld(o, p[0], p[1]));
            const c = clipRing(w, box);
            if (c) rings.push(c);
          }
          if (rings.length) this._fill(rings);
        }
      }
      for (const f of t.transportation || []) {
        if (f.type !== 2 || f.tags.class !== 'ferry') continue;
        for (const line of f.geom) {
          const w = line.map((p) => llToWorld(o, p[0], p[1]));
          for (const piece of clipLine(w, box)) ferryPieces.push(piece);
        }
      }
    }
    this._buildNav();
    this.ferryRoutes = stitch(ferryPieces)
      .filter((r) => polylineLength(r) > 400 && r.some((p) => Math.abs(p[0]) < 18500 && Math.abs(p[1]) < 18500));
    this.ready = true;
    return this;
  }

  // Even-odd scanline fill of one polygon (outer + holes) into the fine raster.
  _fill(rings) {
    let minZ = Infinity, maxZ = -Infinity;
    for (const r of rings) for (const p of r) { if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
    const r0 = Math.max(0, Math.floor((minZ + SPAN) / FINE));
    const r1 = Math.min(NF - 1, Math.floor((maxZ + SPAN) / FINE));
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const zc = -SPAN + (r + 0.5) * FINE;
      xs.length = 0;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const zi = ring[i][1], zj = ring[j][1];
          if ((zi > zc) !== (zj > zc)) xs.push(ring[i][0] + ((zc - zi) * (ring[j][0] - ring[i][0])) / (zj - zi));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const row = r * NF;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + SPAN) / FINE - 0.5));
        const c1 = Math.min(NF - 1, Math.ceil((xs[k + 1] + SPAN) / FINE - 0.5) - 1);
        for (let c = c0; c <= c1; c++) this.fine[row + c] = 1;
      }
    }
  }

  _buildNav() {
    const { fine, nav, dist, comp } = this;
    for (let r = 0; r < NC; r++) {
      for (let c = 0; c < NC; c++) {
        let n = 0;
        for (let a = 0; a < K; a++) {
          const fr = r * K + a;
          if (fr >= NF) continue;
          for (let b = 0; b < K; b++) { const fc = c * K + b; if (fc < NF) n += fine[fr * NF + fc]; }
        }
        nav[r * NC + c] = n >= K * K - 3 ? 1 : 0;
      }
    }
    // Multi-source BFS from land cells (chessboard distance, capped).
    const q = new Int32Array(NC * NC);
    let qh = 0, qt = 0;
    for (let i = 0; i < NC * NC; i++) {
      if (!nav[i]) { dist[i] = 0; q[qt++] = i; } else dist[i] = 255;
    }
    while (qh < qt) {
      const i = q[qh++];
      const r = (i / NC) | 0, c = i - r * NC, d = dist[i] + 1;
      if (d > 254) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= NC || cc >= NC) continue;
        const j = rr * NC + cc;
        if (dist[j] > d) { dist[j] = d; q[qt++] = j; }
      }
    }
    // Components of "big ship" water (>= 2 cells from land).
    comp.fill(-1);
    this.compSize = [];
    this.compEdge = [];
    let id = 0;
    for (let s = 0; s < NC * NC; s++) {
      if (dist[s] < 2 || comp[s] !== -1) continue;
      qh = 0; qt = 0; q[qt++] = s; comp[s] = id;
      let size = 0, edge = 0;
      while (qh < qt) {
        const i = q[qh++];
        size++;
        const r = (i / NC) | 0, c = i - r * NC;
        if (r === 0 || c === 0 || r === NC - 1 || c === NC - 1) edge++;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= NC || cc >= NC) continue;
          const j = rr * NC + cc;
          if (dist[j] >= 2 && comp[j] === -1) { comp[j] = id; q[qt++] = j; }
        }
      }
      this.compSize.push(size);
      this.compEdge.push(edge);
      id++;
    }
  }

  cellOf(x, z) {
    const c = Math.floor((x + SPAN) / COARSE), r = Math.floor((z + SPAN) / COARSE);
    if (c < 0 || r < 0 || c >= NC || r >= NC) return -1;
    return r * NC + c;
  }

  cellCenter(i) {
    const r = (i / NC) | 0, c = i - r * NC;
    return [-SPAN + (c + 0.5) * COARSE, -SPAN + (r + 0.5) * COARSE];
  }

  /** Fine-raster water test (25 m). Works far outside the loaded 3D chunks. */
  isWater(x, z) {
    const c = Math.floor((x + SPAN) / FINE), r = Math.floor((z + SPAN) / FINE);
    if (c < 0 || r < 0 || c >= NF || r >= NF) return false;
    return this.fine[r * NF + c] === 1;
  }

  /** Nearest water point to (x, z) within maxR metres (ring search on the 25 m raster), or null. */
  nearestWater(x, z, maxR = 80) {
    if (this.isWater(x, z)) return [x, z];
    for (let r = FINE; r <= maxR; r += FINE) {
      let best = null, bd = Infinity;
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (this.isWater(px, pz) && r < bd) { bd = r; best = [px, pz]; }
      }
      if (best) return best;
    }
    return null;
  }

  distAt(x, z) {
    const i = this.cellOf(x, z);
    return i < 0 ? 0 : this.dist[i];
  }

  /** Largest big-ship component, preferring one that reaches the region edge (open sea). */
  mainComponent() {
    let best = -1, bestScore = 0;
    for (let i = 0; i < this.compSize.length; i++) {
      const score = this.compSize[i] + this.compEdge[i] * 40;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /** Nearest cell to (x, z) with dist >= minD (and in component `cid` when >= 0), within maxR cells. */
  snap(x, z, minD, cid = -1, maxR = 30) {
    const c0 = Math.floor((x + SPAN) / COARSE), r0 = Math.floor((z + SPAN) / COARSE);
    for (let R = 0; R <= maxR; R++) {
      let best = -1, bd = Infinity;
      for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== R) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= NC || c >= NC) continue;
        const i = r * NC + c;
        if (this.dist[i] < minD || (cid >= 0 && this.comp[i] !== cid)) continue;
        const d = dr * dr + dc * dc;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Mid points of the longest runs of open-sea cells along the region boundary (where ships enter). */
  gates(cid, maxGates = 2) {
    const ring = [];
    for (let c = 0; c < NC; c++) ring.push(c);
    for (let r = 1; r < NC; r++) ring.push(r * NC + NC - 1);
    for (let c = NC - 2; c >= 0; c--) ring.push((NC - 1) * NC + c);
    for (let r = NC - 2; r >= 1; r--) ring.push(r * NC);
    const ok = (i) => this.comp[i] === cid && this.dist[i] >= 3;
    const runs = [];
    let cur = null;
    for (const i of ring) {
      if (ok(i)) { if (!cur) { cur = []; runs.push(cur); } cur.push(i); } else cur = null;
    }
    if (runs.length > 1 && ok(ring[0]) && ok(ring[ring.length - 1])) {
      const first = runs.shift();
      runs[runs.length - 1].push(...first);
    }
    runs.sort((a, b) => b.length - a.length);
    const out = [];
    for (const run of runs) {
      if (run.length < 4) break;
      const g = run[run.length >> 1];
      const [gx, gz] = this.cellCenter(g);
      if (out.some((o) => Math.hypot(o[0] - gx, o[1] - gz) < 8000)) continue;
      out.push([gx, gz]);
      if (out.length >= maxGates) break;
    }
    return out;
  }

  /**
   * A* on the 100 m grid through cells with dist >= minD; prefers channel centres. Returns a smoothed
   * world-space polyline [[x, z], ...] or null.
   */
  route(ax, az, bx, bz, minD = 2) {
    const s = this.snap(ax, az, minD), g = this.snap(bx, bz, minD);
    if (s < 0 || g < 0) return null;
    if (s === g) return null;
    const N = NC * NC;
    const gScore = this._g || (this._g = new Float32Array(N));
    const from = this._from || (this._from = new Int32Array(N));
    const closed = this._closed || (this._closed = new Uint8Array(N));
    gScore.fill(Infinity); closed.fill(0);
    const heap = new MinHeap();
    const gr = (g / NC) | 0, gc = g - gr * NC;
    const h = (i) => { const r = (i / NC) | 0, c = i - r * NC; const dr = Math.abs(r - gr), dc = Math.abs(c - gc); return Math.max(dr, dc) + 0.4142 * Math.min(dr, dc); };
    gScore[s] = 0; from[s] = -1; heap.push(s, h(s));
    let found = false, it = 0;
    while (heap.size && it++ < 200000) {
      const i = heap.pop();
      if (closed[i]) continue;
      if (i === g) { found = true; break; }
      closed[i] = 1;
      const r = (i / NC) | 0, c = i - r * NC;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= NC || cc >= NC) continue;
        const j = rr * NC + cc;
        if (closed[j] || this.dist[j] < minD) continue;
        const d = this.dist[j];
        const step = (dr && dc ? 1.4142 : 1) * (1 + (d < 6 ? (6 - d) * 0.35 : 0));
        const ng = gScore[i] + step;
        if (ng < gScore[j]) { gScore[j] = ng; from[j] = i; heap.push(j, ng + h(j)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = g; i !== -1; i = from[i]) cells.push(i);
    cells.reverse();
    // String-pull with line-of-sight on the same clearance.
    const pts = cells.map((i) => this.cellCenter(i));
    const pulled = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let j = Math.min(pts.length - 1, k + 60); j > k + 1; j--) {
        if (this._los(pts[k], pts[j], minD)) { far = j; break; }
      }
      pulled.push(pts[far]);
      k = far;
    }
    pulled[0] = [ax, az];
    pulled[pulled.length - 1] = [bx, bz];
    return chaikin(pulled, 3);
  }

  _los(a, b, minD) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(L / (COARSE * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const c = this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (c < 0 || this.dist[c] < minD) return false;
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; this.size = 0; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = this.size++;
    k[i] = key; v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const n = --this.size;
    k[0] = k[n]; v[0] = v[n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < n && v[l] < v[m]) m = l;
      if (r < n && v[r] < v[m]) m = r;
      if (m === i) break;
      [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
      i = m;
    }
    return top;
  }
}

/** Greedily joins polyline pieces whose endpoints meet (tile-clipped ferry lines -> whole routes). */
function stitch(pieces, tol = 25) {
  const lines = pieces.map((p) => p.slice());
  const near = (a, b) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length && !merged; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const A = lines[i], B = lines[j];
        let out = null;
        if (near(A[A.length - 1], B[0])) out = A.concat(B.slice(1));
        else if (near(B[B.length - 1], A[0])) out = B.concat(A.slice(1));
        else if (near(A[A.length - 1], B[B.length - 1])) out = A.concat(B.slice(0, -1).reverse());
        else if (near(A[0], B[0])) out = A.slice().reverse().concat(B.slice(1));
        if (out) { lines[i] = out; lines.splice(j, 1); merged = true; break; }
      }
    }
  }
  return lines;
}
