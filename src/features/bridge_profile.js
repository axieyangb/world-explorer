/**
 * Road lift profiles: one continuous height field for bridges and their approaches.
 *
 * Bridges used to sit at a flat "7.5 m x layer" (or a water-mask bank height) while the roads they join
 * stayed on the ground, so decks ended in a vertical wall above the abutment, and decks crossing a chunk
 * seam got different heights per chunk (the water mask is clipped to each chunk).
 *
 * Here every road vertex is a node of one graph (ways joined where they share a vertex). Bridge vertices
 * get a required height:
 *   - a straight deck line between the bridge's abutments (terrain at its terminal nodes), + up to 1 m;
 *   - clearance above whatever lower road / railway they cross (~6 m over roads & rail, ~5.5 m for
 *     footbridges, ~3 m over foot/cycle paths as rendered), layered bridges stacked pass by pass;
 *   - fixed Golden Gate / Bay Bridge profiles;
 *   - never below terrain.
 * Then heights spread outward along the graph at a maximum grade per road class (5 % highways, 7 % streets,
 * 10 % foot/cycle, 60 % steps): U(n) = max over required m of (D(m) - grade * pathLength(m, n)). Approach
 * roads become embankment ramps and the result is continuous at every shared vertex by construction.
 * Only DEM terrain + way geometry are used (no water mask, no per-tile state), so neighbouring chunks agree.
 * Worker-safe: no THREE / DOM.
 */
import { worldXZToLatLon } from './bridge_deck.js';
import { LANDMARKS, landmarkWorldXZ, landmarkDeckY } from './landmarks/registry.js'; // [release-6-integ] landmark deck pins

const FOOT = new Set(['footway', 'pedestrian', 'cycleway', 'path', 'steps', 'bridleway', 'corridor']);
const HIGHWAY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link']);

export function gradeForClass(cls) {
  if (cls === 'steps') return 0.6;
  if (FOOT.has(cls)) return 0.1;
  if (HIGHWAY.has(cls)) return 0.05;
  return 0.07;
}

// Centre-line height difference to hold at a crossing. Includes ~1 m for what the renderer adds on top of the DEM
// (terrain-mesh edge sampling, per-class road bias), so rendered deck-over-road clearance lands at ~6 m (road
// bridges) / ~5.5 m (footbridges) over roads and rail, ~3 m over foot paths.
function clearanceOver(upperCls, lowerCls, lowerIsRail) {
  if (lowerIsRail) return FOOT.has(upperCls) ? 7.5 : 8.0;
  if (FOOT.has(lowerCls)) return 4.0;
  if (lowerCls === 'service') return 5.5;
  return FOOT.has(upperCls) ? 7.5 : 8.0;
}

// binary max-heap of (value, node)
class MaxHeap {
  constructor() { this.v = []; this.n = []; }
  get size() { return this.v.length; }
  push(val, node) {
    const v = this.v, n = this.n;
    let i = v.length; v.push(val); n.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] >= val) break;
      v[i] = v[p]; n[i] = n[p]; i = p;
    }
    v[i] = val; n[i] = node;
  }
  pop() {
    const v = this.v, n = this.n;
    const topV = v[0], topN = n[0];
    const lastV = v.pop(), lastN = n.pop();
    if (v.length > 0) {
      let i = 0; const len = v.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mv = lastV;
        if (l < len && v[l] > mv) { m = l; mv = v[l]; }
        if (r < len && v[r] > mv) { m = r; mv = v[r]; }
        if (m === i) break;
        v[i] = v[m]; n[i] = n[m]; i = m;
      }
      v[i] = lastV; n[i] = lastN;
    }
    this._lastV = topV;
    return topN;
  }
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sZ - qz * sX) / den;
  const u = (qx * rZ - qz * rX) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/**
 * @param roads chunk road tuples [wid, cls, name, ref, lanes, widthM, oneway, isBridge, isTunnel, layer, flat]
 * @param railways chunk railway tuples [id, type, name, color, isBridge, isTunnel, layer, flat]
 * @param terrainAt (wx, wz) => DEM ground height (world coords)
 * @returns Array (per road index) of Float32Array absolute surface heights per vertex (NaN = follow ground), or null
 */
export function computeRoadLiftProfiles(roads, railways, ox, oz, terrainAt, worldOrigin = null, seam = null) {
  const out = new Array(roads.length).fill(null);
  let anyBridge = false;
  for (const r of roads) if (r && r[7] && !r[8] && r[10] && r[10].length >= 6) { anyBridge = true; break; }
  // [elevated-roads] a chunk without bridges still has to honour lifted heights a neighbour already published at the seam
  if (!anyBridge && seam) {
    for (const t of roads) {
      const f = t && !t[8] && t[10];
      if (!f) continue;
      for (let k = 0; k + 5 < f.length && !anyBridge; k += 3) {
        if (crossesChunk(f[k], f[k + 2], f[k + 3], f[k + 5]) && (Number.isFinite(seam.get(seamKey(ox + f[k], oz + f[k + 2]))) || Number.isFinite(seam.get(seamKey(ox + f[k + 3], oz + f[k + 5]))))) anyBridge = true;
      }
      if (anyBridge) break;
    }
  }
  if (!anyBridge) return out;

  // ---- 1. node graph over all non-tunnel roads ----
  const nodeId = new Map();
  const nodeX = [], nodeZ = [], nodeG = [];
  const adj = []; // per node: flat [nb, len*grade, ...]
  const nodeBridgeDeg = [], nodeGroundDeg = [], nodeWays = [], nodeLastWay = [];
  const wayNodes = new Array(roads.length).fill(null);
  // vertices within 0.3 m are one node (tile-quantised copies of the same OSM node differ by ~0.1 m)
  const SNAP = 0.3, SCELL = 0.5;
  // kind bits: 1 = bridge interior vertex, 2 = ground interior vertex, 4 = ground way end, 8 = bridge way end. An interior bridge vertex
  // (densified every 4 m) never merges with an interior ground vertex: that is a road passing underneath.
  const nodeKind = [];
  const getNode = (x, z, kind) => {
    const gx = Math.floor(x / SCELL), gz = Math.floor(z / SCELL);
    let best = -1, bestD = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = nodeId.get((gx + i) * 1000003 + (gz + j));
      if (!l) continue;
      for (const c of l) {
        const ddx = Math.abs(nodeX[c] - x), ddz = Math.abs(nodeZ[c] - z);
        if (ddx > SNAP || ddz > SNAP) continue;
        const k = nodeKind[c];
        const exact = ddx < 0.05 && ddz < 0.05;
        if (!exact) {
          // near-miss merges stay within bridges or within ground roads (plus end-to-end): a bridge vertex that happens
          // to sit within 0.3 m of a street below it must not pull that street up onto the deck
          const kb = (k & 9) !== 0, kg = (k & 6) !== 0, nb = (kind & 9) !== 0;
          const sameSide = nb ? kb : kg;
          const endToEnd = (kind & 12) && (k & 12);
          if (!sameSide && !endToEnd) continue;
        }
        const d = ddx + ddz;
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    if (best >= 0) { nodeKind[best] |= kind; return best; }
    nodeKind.push(kind);
    let id;
    {
      id = nodeX.length;
      const k = gx * 1000003 + gz; let l = nodeId.get(k); if (!l) nodeId.set(k, (l = [])); l.push(id);
      nodeX.push(x); nodeZ.push(z); nodeG.push(terrainAt(ox + x, oz + z));
      adj.push([]); nodeBridgeDeg.push(0); nodeGroundDeg.push(0); nodeWays.push(0); nodeLastWay.push(-1);
    }
    return id;
  };
  for (let r = 0; r < roads.length; r++) {
    const t = roads[r];
    if (!t) continue;
    const cls = t[1], isBridge = t[7], isTunnel = t[8], flat = t[10];
    if (isTunnel || !flat || flat.length < 6) continue;
    const n = flat.length / 3;
    const ids = new Int32Array(n);
    const g = gradeForClass(cls);
    for (let i = 0; i < n; i++) ids[i] = getNode(flat[i * 3], flat[i * 3 + 2], i === 0 || i === n - 1 ? (isBridge ? 8 : 4) : isBridge ? 1 : 2);
    for (let i = 0; i < n; i++) if (nodeLastWay[ids[i]] !== r) { nodeLastWay[ids[i]] = r; nodeWays[ids[i]]++; }
    for (let i = 0; i + 1 < n; i++) {
      const a = ids[i], b = ids[i + 1];
      if (a === b) continue;
      const w = Math.hypot(nodeX[b] - nodeX[a], nodeZ[b] - nodeZ[a]) * g;
      const ew = FOOT.has(cls) ? -w - 1e-9 : w; // negative weight marks a foot/cycle edge
      adj[a].push(b, ew); adj[b].push(a, ew);
    }
    const deg = isBridge ? nodeBridgeDeg : nodeGroundDeg;
    deg[ids[0]]++; deg[ids[n - 1]]++;
    wayNodes[r] = ids;
  }
  const N = nodeX.length;

  // ---- 1b. stitch vector-tile seams: a way end that joins nothing (degree 1) but lies on / next to a roughly
  // collinear segment of a twin way (same class, bridge flag and layer) is the cut of a way split across tiles (cut
  // points are quantised per tile, so the two halves rarely share an exact vertex). Join it to that segment.
  // Neighbouring z14 tiles each carry their own copy of a way, clipped ~30 m past the tile edge, so the two copies
  // overlap for ~60 m without sharing a vertex (bridges are densified per copy). Every unshared vertex inside such
  // an overlap is joined to the twin copy's segment too: otherwise each copy is its own deck component and one of
  // them can sit tens of metres lower (a deck "ending in mid-air" next to the real one, e.g. the Bay Bridge
  // approach at Rincon Hill).
  const stitched = []; // [e, a, b, ra, rb, da, db] for the bridge-only graph
  const endJoins = []; // [e, a, b, t]: way end lying on its twin's segment (snapped onto it in step 4c)
  const endTwin = new Map(); // way end -> index of the twin way it was joined to
  {
    const SC = 16;
    const sgrid = new Map();
    const segList = [];
    for (let r = 0; r < roads.length; r++) {
      const ids = wayNodes[r]; if (!ids) continue;
      for (let i = 0; i + 1 < ids.length; i++) {
        const a = ids[i], b = ids[i + 1];
        if (a === b) continue;
        const si = segList.length / 3; segList.push(r, a, b);
        const x0 = Math.floor((Math.min(nodeX[a], nodeX[b]) - 1.5) / SC), x1 = Math.floor((Math.max(nodeX[a], nodeX[b]) + 1.5) / SC);
        const z0 = Math.floor((Math.min(nodeZ[a], nodeZ[b]) - 1.5) / SC), z1 = Math.floor((Math.max(nodeZ[a], nodeZ[b]) + 1.5) / SC);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > 900) continue;
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 100003 + gz; let l = sgrid.get(k); if (!l) sgrid.set(k, (l = [])); l.push(si);
        }
      }
    }
    const join = (e, r, bs, isEnd) => {
      const sr = segList[bs * 3], a = segList[bs * 3 + 1], b = segList[bs * 3 + 2];
      const g = Math.max(gradeForClass(roads[r][1]), gradeForClass(roads[sr][1]));
      const da = Math.hypot(nodeX[e] - nodeX[a], nodeZ[e] - nodeZ[a]);
      const db = Math.hypot(nodeX[e] - nodeX[b], nodeZ[e] - nodeZ[b]);
      const fs = FOOT.has(roads[r][1]) && FOOT.has(roads[sr][1]) ? -1 : 1;
      const wa = fs * (da * g + 1e-9), wb = fs * (db * g + 1e-9);
      adj[e].push(a, wa, b, wb); adj[a].push(e, wa); adj[b].push(e, wb);
      stitched.push(e, a, b, r, sr, da, db);
      if (isEnd) { endJoins.push(e, a, b, da / Math.max(1e-6, da + db)); endTwin.set(e, sr); }
    };
    // nearest roughly collinear segment of a twin copy (same class / bridge / layer) within maxD of node e (heading dx, dz)
    const nearestSeg = (e, r, dx, dz, maxD, minCos) => {
      const l = sgrid.get(Math.floor(nodeX[e] / SC) * 100003 + Math.floor(nodeZ[e] / SC));
      if (!l) return -1;
      const t0 = roads[r];
      let best = maxD, bs = -1;
      for (const si of l) {
        const sr = segList[si * 3], a = segList[si * 3 + 1], b = segList[si * 3 + 2];
        if (sr === r || a === e || b === e) continue;
        const t1 = roads[sr];
        if (t1[1] !== t0[1] || Boolean(t1[7]) !== Boolean(t0[7]) || (Number(t1[9]) || 0) !== (Number(t0[9]) || 0)) continue;
        const vx = nodeX[b] - nodeX[a], vz = nodeZ[b] - nodeZ[a], L2 = vx * vx + vz * vz;
        if (L2 < 1e-4) continue;
        const L = Math.sqrt(L2);
        if (Math.abs((vx * dx + vz * dz) / L) < minCos) continue; // a road passing under/over is not a continuation
        let t = ((nodeX[e] - nodeX[a]) * vx + (nodeZ[e] - nodeZ[a]) * vz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(nodeX[e] - nodeX[a] - vx * t, nodeZ[e] - nodeZ[a] - vz * t);
        if (d < best) { best = d; bs = si; }
      }
      return bs;
    };
    for (let r = 0; r < roads.length; r++) {
      const ids = wayNodes[r]; if (!ids || ids.length < 2) continue;
      const n = ids.length;
      for (let i = 0; i < n; i++) {
        const e = ids[i];
        if (nodeWays[e] > 1) continue; // already joins another way
        const isEnd = i === 0 || i === n - 1;
        const p = ids[Math.max(0, i - 1)], q = ids[Math.min(n - 1, i + 1)]; // local heading (sign is irrelevant)
        let dx = nodeX[q] - nodeX[p], dz = nodeZ[q] - nodeZ[p];
        const dl = Math.hypot(dx, dz); if (dl < 0.05) continue;
        dx /= dl; dz /= dl;
        // twins only: a different road running alongside within 1.6 m is usually stacked above / below this one
        // (Shibuya's Route 3 deck right over Route 246), and joining it would hoist the street onto the deck
        const bs = isEnd ? nearestSeg(e, r, dx, dz, 1.6, 0.8) : nearestSeg(e, r, dx, dz, 0.6, 0.95);
        if (bs >= 0) join(e, r, bs, isEnd);
      }
    }
  }

  // [release-6-integ] landmark deck pins: bridge vertices inside a landmark's `deck` footprint sit exactly on the
  // model's road deck (base = min terrain-mesh height over the landmark's ground ring, as landmark_system._groundY)
  const pinY = new Float64Array(N).fill(NaN);
  let anyPin = false;
  if (worldOrigin) {
    for (const l of LANDMARKS) {
      if (!l.on || !l.deck) continue;
      const p = landmarkWorldXZ(l, worldOrigin);
      if (!p || Math.abs(p[0] - ox) > 2500 || Math.abs(p[1] - oz) > 2500) continue;
      const s = l.supp || { r: 20 };
      const gr = l.groundR ?? Math.min(40, (s.r || Math.min(s.hw, s.hd)) * 0.5);
      let base = meshY(terrainAt, p[0], p[1]);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; base = Math.min(base, meshY(terrainAt, p[0] + Math.cos(a) * gr, p[1] + Math.sin(a) * gr)); }
      // chunk_builder draws roads at lift + ROAD_Y_BIAS (trunk 0.86 + 0..0.14 micro bias): pin so the drawn deck lands on the model's
      const y = (Number.isFinite(base) ? base : 0) - 0.93;
      const h = (l.heading || 0) * Math.PI / 180, c = Math.cos(h), sn = Math.sin(h);
      for (let r = 0; r < roads.length; r++) {
        const ids = wayNodes[r]; if (!ids || !roads[r][7]) continue;
        for (const v of ids) {
          const dx = ox + nodeX[v] - p[0], dz = oz + nodeZ[v] - p[1];
          const lz = -dx * sn + dz * c;
          if (Math.abs(dx * c + dz * sn) <= l.deck.hw && Math.abs(lz) <= l.deck.hd) { pinY[v] = y + landmarkDeckY(l.deck, lz); anyPin = true; }
        }
      }
    }
  }

  // [elevated-roads] chunk-seam heights. Each chunk solves its own graph (its ways + ~500 m of context), so two
  // chunks can disagree where a way crosses their shared border. The first chunk to solve publishes the heights of
  // every vertex of a border-crossing segment (NaN = on the ground); a later neighbour pins those vertices to the
  // published values (hard heights, also ceilings for the ground ways around them), so the segment it clips at the
  // seam is drawn with the same two end heights from both sides.
  const seamPin = new Float64Array(N).fill(NaN); // finite = published lift; -Infinity = published "on the ground"
  let anySeam = false;
  if (seam) {
    for (let v = 0; v < N; v++) {
      const y = seam.get(seamKey(ox + nodeX[v], oz + nodeZ[v]));
      if (y === undefined) continue;
      seamPin[v] = Number.isFinite(y) ? y : -Infinity;
      if (Number.isFinite(y) && !Number.isFinite(pinY[v])) { pinY[v] = y; anyPin = true; }
      anySeam = true;
    }
  }

  // ---- 2. bridge components -> straight deck line between abutments ----
  const bridgeIdx = [];
  for (let r = 0; r < roads.length; r++) if (wayNodes[r] && roads[r][7]) bridgeIdx.push(r);
  const isBridgeNode = new Uint8Array(N);
  const bAdj = new Map(); // bridge-only adjacency: node -> [nb, len, ...]
  for (const r of bridgeIdx) {
    const ids = wayNodes[r];
    for (let i = 0; i < ids.length; i++) isBridgeNode[ids[i]] = 1;
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = ids[i], b = ids[i + 1];
      if (a === b) continue;
      const L = Math.hypot(nodeX[b] - nodeX[a], nodeZ[b] - nodeZ[a]);
      if (!bAdj.has(a)) bAdj.set(a, []);
      if (!bAdj.has(b)) bAdj.set(b, []);
      bAdj.get(a).push(b, L); bAdj.get(b).push(a, L);
    }
  }
  for (let k = 0; k < stitched.length; k += 7) {
    const e = stitched[k], a = stitched[k + 1], b = stitched[k + 2], ra = stitched[k + 3], rb = stitched[k + 4];
    if (!roads[ra][7] || !roads[rb][7]) continue;
    for (const [v, w, L] of [[e, a, stitched[k + 5]], [e, b, stitched[k + 6]]]) {
      if (!bAdj.has(v)) bAdj.set(v, []);
      if (!bAdj.has(w)) bAdj.set(w, []);
      bAdj.get(v).push(w, L); bAdj.get(w).push(v, L);
    }
  }
  // terminals: bridge-way end nodes that touch a ground road, or dangle (bridge degree 1)
  // Only ends that touch a ground road count: a dangling end is usually a vector-tile clip (the way continues in
  // the neighbouring tile's overlapping piece, joined through shared original vertices), not an abutment.
  const isTerminal = new Uint8Array(N);
  for (const r of bridgeIdx) {
    const ids = wayNodes[r];
    for (const e of [ids[0], ids[ids.length - 1]]) {
      if (nodeGroundDeg[e] > 0) isTerminal[e] = 1;
    }
  }
  const chord = new Float64Array(N).fill(NaN);
  const dTerm = new Float64Array(N).fill(Infinity);
  const compOf = new Int32Array(N).fill(-1);
  let compSeq = 0;
  for (const start of bAdj.keys()) {
    if (compOf[start] >= 0) continue;
    const comp = [start]; compOf[start] = compSeq;
    for (let q = 0; q < comp.length; q++) {
      const l = bAdj.get(comp[q]);
      for (let j = 0; j < l.length; j += 2) if (compOf[l[j]] < 0) { compOf[l[j]] = compSeq; comp.push(l[j]); }
    }
    compSeq++;
    // distance to the nearest abutment (for the +1 m deck lift that tapers to 0 at the abutments)
    const terms = comp.filter((v) => isTerminal[v]);
    if (terms.length) {
      const heap = new MaxHeap();
      for (const t of terms) { dTerm[t] = 0; heap.push(0, t); }
      while (heap.size) {
        const v = heap.pop(); const dv = -heap._lastV;
        if (dv > dTerm[v] + 1e-9 || dv > 40) continue;
        const l = bAdj.get(v);
        for (let j = 0; j < l.length; j += 2) {
          const nb = l[j], nd = dv + l[j + 1];
          if (nd < dTerm[nb] - 1e-9) { dTerm[nb] = nd; heap.push(-nd, nb); }
        }
      }
    }
    // deck line = morphological closing of the ground profile along the bridge graph (radius CLOSE_R): fills
    // rivers / valleys up to 2 * CLOSE_R wide at the lower bank's height, follows terrain slopes exactly, and only
    // depends on ways within 2 * CLOSE_R, so neighbouring chunks (which load +-1000 m of ways) agree.
    // An opening (radius OPEN_R) first removes narrow DEM spikes (urban DSM noise: rooftops in the elevation tiles)
    // so the closing does not lift decks to rooftop height.
    const ero = new Map(), opn = new Map(), dil = new Map();
    for (const v of comp) ero.set(v, ballReduce(v, bAdj, OPEN_R, (u) => nodeG[u], Math.min, Infinity));
    for (const v of comp) opn.set(v, ballReduce(v, bAdj, OPEN_R, (u) => ero.get(u), Math.max, -Infinity));
    for (const v of comp) dil.set(v, ballReduce(v, bAdj, CLOSE_R, (u) => opn.get(u), Math.max, -Infinity));
    for (const v of comp) chord[v] = ballReduce(v, bAdj, CLOSE_R, (u) => dil.get(u), Math.min, Infinity);
    // [elevated-roads] the closing only sees the deck itself, so on a deck shorter than 2 * CLOSE_R that runs down a
    // hillside it "fills" the whole slope up to the top abutment (a flat deck striding out 50 m over the hill).
    // Bound it by the line between the deck's abutments (terrain at the two nearest ground terminals, by path
    // length): over a valley that line is the bank-to-bank deck the closing gives anyway.
    if (terms.length >= 2) {
      const tlist = terms.slice(0, 8), tdist = tlist.map((t) => graphDist(t, bAdj));
      for (const v of comp) {
        let i0 = -1, i1 = -1;
        for (let k = 0; k < tlist.length; k++) {
          const d = tdist[k].get(v); if (d === undefined) continue;
          if (i0 < 0 || d < tdist[i0].get(v)) { i1 = i0; i0 = k; } else if (i1 < 0 || d < tdist[i1].get(v)) i1 = k;
        }
        if (i1 < 0) continue;
        const d0 = tdist[i0].get(v), d1 = tdist[i1].get(v);
        const h0 = opn.get(tlist[i0]), h1 = opn.get(tlist[i1]);
        const line = (h0 * d1 + h1 * d0) / Math.max(1e-6, d0 + d1);
        if (line < chord[v]) chord[v] = line;
      }
    }
  }

  // ---- 3. segment grid of potential lower crossings (ground roads, railways, all bridges) ----
  const CELL = 32;
  const grid = new Map();
  const lowSegs = []; // {ax, az, bx, bz, cls, rail, layer, bridgeRoad, r, i, hw}
  const addSeg = (s) => {
    const idx = lowSegs.length; lowSegs.push(s);
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const z0 = Math.floor(Math.min(s.az, s.bz) / CELL), z1 = Math.floor(Math.max(s.az, s.bz) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) return;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx * 100003 + gz; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(idx);
    }
  };
  for (let r = 0; r < roads.length; r++) {
    const ids = wayNodes[r]; if (!ids) continue;
    const t = roads[r];
    const layer = t[7] ? Math.max(1, Number(t[9]) || 1) : Math.min(0, Number(t[9]) || 0);
    for (let i = 0; i + 1 < ids.length; i++) {
      addSeg({ ax: nodeX[ids[i]], az: nodeZ[ids[i]], bx: nodeX[ids[i + 1]], bz: nodeZ[ids[i + 1]], cls: t[1], rail: false, layer, bridgeRoad: Boolean(t[7]), r, i, a: ids[i], b: ids[i + 1] });
    }
  }
  for (const rw of railways || []) {
    const isBridge = rw[4], isTunnel = rw[5], flat = rw[7];
    if (isTunnel || !flat || flat.length < 6) continue;
    // [release-6-integ] rail viaducts (rail_build: deck 6.5 m x layer over terrain) are lower obstacles for road
    // bridges of a higher layer; rail_build raises viaducts over lower / same-layer roads
    const layer = isBridge ? Math.max(1, Math.min(3, Number(rw[6]) || 1)) : 0;
    for (let i = 0; i + 1 < flat.length / 3; i++) {
      addSeg({ ax: flat[i * 3], az: flat[i * 3 + 2], bx: flat[(i + 1) * 3], bz: flat[(i + 1) * 3 + 2], cls: 'rail', rail: true, layer, railDeck: 6.5 * layer, bridgeRoad: false, r: -1, i, a: -1, b: -2 });
    }
  }

  // ---- 4. required deck heights + envelope, pass by pass from the lowest bridge layer up ----
  // Two envelopes: road-bridge heights spread over every way (approach embankments, their sidewalks), while
  // footbridge heights spread over foot / cycle ways only, so a footbridge never jacks up the streets around it.
  const UM = new Float64Array(N).fill(-Infinity), UF = new Float64Array(N).fill(-Infinity);
  const heapM = new MaxHeap(), heapF = new MaxHeap();
  const srcOf = new Int32Array(N).fill(-1);
  const raise = (v, y, foot) => {
    const A = foot ? UF : UM;
    if (y > A[v] + 1e-6) { A[v] = y; srcOf[v] = v; (foot ? heapF : heapM).push(y, v); }
  };
  const liftRef = (v) => (isBridgeNode[v] && Number.isFinite(chord[v]) ? chord[v] : nodeG[v]);
  const propagateOne = (A, heap, footOnly) => {
    while (heap.size) {
      const v = heap.pop(); const uv = heap._lastV;
      if (uv < A[v] - 1e-6) continue;
      const l = adj[v];
      for (let j = 0; j < l.length; j += 2) {
        const w = l[j + 1];
        if (footOnly && w >= 0) continue;
        const nb = l[j], aw = Math.abs(w);
        // [elevated-roads] a ground way also sheds lift above its own terrain at the grade: where the street falls
        // away faster than the ramp grade (Russian Hill, Hong Kong) it follows the hill down instead of striding out
        // on a wall tens of metres high. Decks measure the lift from their deck line (`chord`, which already fills
        // valleys), so a hillside viaduct steps down the slope with it (Hong Kong's Robinson Road held a 5 % grade
        // down a 20 % hillside and stood 70 m over the street) while a valley crossing stays level.
        const c = Math.min(uv - aw, liftRef(nb) + Math.max(0, uv - liftRef(v)) - aw);
        if (c > A[nb] + 1e-6 && !(pinY[nb] < c) && (isBridgeNode[nb] || c > nodeG[nb] + 0.02)) { // [release-6-integ] !(pin < c): pins are hard
          A[nb] = c; srcOf[nb] = srcOf[v]; heap.push(c, nb); }
      }
    }
  };
  const propagate = () => { propagateOne(UM, heapM, false); propagateOne(UF, heapF, true); };
  const U = { get: (v) => Math.max(UM[v], UF[v]) };
  const surfaceAtSeg = (s, u) => {
    if (s.rail) return terrainAt(ox + s.ax + (s.bx - s.ax) * u, oz + s.az + (s.bz - s.az) * u);
    const ua = U.get(s.a), ub = U.get(s.b);
    const ya = Number.isFinite(ua) ? Math.max(ua, nodeG[s.a]) : nodeG[s.a];
    const yb = Number.isFinite(ub) ? Math.max(ub, nodeG[s.b]) : nodeG[s.b];
    return ya + (yb - ya) * u;
  };
  const layers = [...new Set(bridgeIdx.map((r) => Math.max(1, Number(roads[r][9]) || 1)))].sort((a, b) => a - b);
  // a few rounds: a lower way can be lifted later (as some other bridge's approach), which raises the
  // clearance needed above it; heights only ever go up, so this converges quickly
  for (let round = 0; round < 3; round++) for (const L of layers) {
    for (const r of bridgeIdx) {
      const t = roads[r];
      if (Math.max(1, Number(t[9]) || 1) !== L) continue;
      const ids = wayNodes[r], cls = t[1], name = t[2] || t[3] || '';
      const hwSelf = Math.max(1, (t[5] || 4) * 0.5);
      const n = ids.length;
      const req = new Float64Array(n);
      const midIdx = Math.floor(n / 2);
      const wmx = ox + nodeX[ids[midIdx]], wmz = oz + nodeZ[ids[midIdx]];
      const ggbName = Boolean(name && /golden\s*gate\s*bridge|金门大桥/i.test(name));
      for (let i = 0; i < n; i++) {
        const v = ids[i];
        const lift = Math.min(1.0, (Number.isFinite(dTerm[v]) ? dTerm[v] : 40) / 20.0);
        // (raw terrain is not a floor here: urban DEM spikes would lift decks to rooftops; rendering still keeps
        // every road above the local terrain mesh)
        let y = (Number.isFinite(chord[v]) ? chord[v] : nodeG[v]) + lift;
        // fixed suspension-span profiles, decided per vertex (per-way decisions split one deck into 8 m / 53 m pieces)
        const vx = ox + nodeX[v], vz = oz + nodeZ[v];
        if (ggbName || isGoldenGateSpan('', vx, vz, worldOrigin)) {
          const ll = worldXZToLatLon(vx, vz, worldOrigin);
          const uu = Math.max(-1, Math.min(1, ((ll ? ll[0] : 37.8199) - 37.8199) / 0.0125));
          y = Math.max(y, 67.5 - 9.5 * uu * uu);
        } else if (!FOOT.has(cls) && isBayBridgeWestSpan('', vx, vz, worldOrigin)) {
          y = Math.max(y, 52.0 + 7.0 * Math.max(0, L - 1));
        }
        req[i] = y;
      }
      // clearance over crossed lower ways
      for (let i = 0; i + 1 < n; i++) {
        const a = ids[i], b = ids[i + 1];
        const ax = nodeX[a], az = nodeZ[a], bx = nodeX[b], bz = nodeZ[b];
        const segL = Math.hypot(bx - ax, bz - az);
        if (segL < 0.05) continue;
        const gx0 = Math.floor(Math.min(ax, bx) / CELL), gx1 = Math.floor(Math.max(ax, bx) / CELL);
        const gz0 = Math.floor(Math.min(az, bz) / CELL), gz1 = Math.floor(Math.max(az, bz) / CELL);
        const seen = new Set();
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
          const l = grid.get(gx * 100003 + gz); if (!l) continue;
          for (const si of l) {
            if (seen.has(si)) continue; seen.add(si);
            const s = lowSegs[si];
            if (s.r === r) continue;
            if (s.a === a || s.a === b || s.b === a || s.b === b) continue; // connected, not crossing
            if (s.bridgeRoad || s.rail ? s.layer >= L : s.layer > 0) continue; // [release-6-integ] s.rail: viaduct layers
            const hit = segIntersect(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
            if (!hit) continue;
            const [tt, uu] = hit;
            // shared vertex elsewhere on the lower way (T-junction exactly at a node) is not a crossing
            if ((uu < 1e-3 || uu > 1 - 1e-3) && (tt < 1e-3 || tt > 1 - 1e-3)) continue;
            // ground under the crossing (capped 8 m above the deck line: urban DEM spikes), or the lower way's own
            // lifted surface (it may itself be an approach ramp of another bridge)
            const chordHere = Math.max(Number.isFinite(chord[a]) ? chord[a] : -Infinity, Number.isFinite(chord[b]) ? chord[b] : -Infinity);
            let groundHere = terrainAt(ox + ax + (bx - ax) * tt, oz + az + (bz - az) * tt);
            if (Number.isFinite(chordHere)) groundHere = Math.min(groundHere, chordHere + 8);
            const base = s.rail ? groundHere + (s.railDeck || 0) : Math.max(s.bridgeRoad ? -Infinity : groundHere, surfaceAtSeg(s, uu));
            // [elevated-roads] capped at ~8.5 m per layer above the ground here: a lower way lifted on a steep
            // slope (or by this deck's own ramps, round after round) must not ratchet the deck up (Hong Kong
            // Mid-Levels: a layer-4 link reached 78 m above the street, hoisting Peel Street 27 m into the air)
            const need = Math.min(base + clearanceOver(cls, s.cls, s.rail), groundHere + 8.5 * Math.max(2, L));
            // hold the clearance across the lower way's width (+ margin) on both sides of the crossing point
            const hold = (s.rail ? 3.0 : Math.max(2.5, 0.5 * widthOf(roads, s.r))) + hwSelf * 0.5 + 2.0;
            const dCross = tt * segL;
            // walk vertices backward / forward from the crossing point within `hold`
            let acc = dCross;
            for (let k = i; k >= 0; k--) {
              if (acc > hold) break;
              if (need > req[k]) req[k] = need;
              if (k > 0) acc += Math.hypot(nodeX[ids[k]] - nodeX[ids[k - 1]], nodeZ[ids[k]] - nodeZ[ids[k - 1]]);
            }
            acc = segL - dCross;
            for (let k = i + 1; k < n; k++) {
              if (acc > hold) break;
              if (need > req[k]) req[k] = need;
              if (k + 1 < n) acc += Math.hypot(nodeX[ids[k + 1]] - nodeX[ids[k]], nodeZ[ids[k + 1]] - nodeZ[ids[k]]);
            }
          }
        }
      }
      const footBridge = FOOT.has(cls);
      for (let i = 0; i < n; i++) if (Number.isFinite(pinY[ids[i]])) req[i] = pinY[ids[i]]; // [release-6-integ] landmark deck
      for (let i = 0; i < n; i++) raise(ids[i], req[i], footBridge);
    }
    if (anySeam) for (let v = 0; v < N; v++) if (seamPin[v] > -Infinity && !isBridgeNode[v]) raise(v, seamPin[v], false);
    propagate();
  }

  // [release-6-integ] landmark deck pins are also ceilings: lower everything near a pin to pin + grade * path so
  // approaches ramp down onto the deck instead of stepping (ground ways still never go below terrain in step 5)
  if (anyPin || anySeam) {
    const cap = new Float64Array(N).fill(Infinity), capTop = new Float64Array(N); // capTop: pin + 8 m (reach limit)
    const hp = new MaxHeap();
    for (let v = 0; v < N; v++) {
      const py = Number.isFinite(pinY[v]) ? pinY[v] : seamPin[v] === -Infinity ? nodeG[v] : NaN;
      if (Number.isFinite(py)) { cap[v] = py; capTop[v] = py + 8; hp.push(-py, v); }
    }
    while (hp.size) {
      const v = hp.pop(); const cv = -hp._lastV;
      if (cv > cap[v] + 1e-9) continue;
      const l = adj[v];
      for (let j = 0; j < l.length; j += 2) {
        const nb = l[j], c = cv + Math.abs(l[j + 1]);
        if (c < cap[nb] - 1e-6 && c <= capTop[v]) { cap[nb] = c; capTop[nb] = capTop[v]; hp.push(-c, nb); }
      }
    }
    for (let v = 0; v < N; v++) if (cap[v] < Infinity) { if (UM[v] > cap[v]) UM[v] = cap[v]; if (UF[v] > cap[v]) UF[v] = cap[v]; }
    // published seam heights are exact
    for (let v = 0; v < N; v++) {
      if (Number.isNaN(seamPin[v])) continue;
      if (seamPin[v] === -Infinity) { if (!isBridgeNode[v]) { UM[v] = -Infinity; UF[v] = -Infinity; } } else { UM[v] = seamPin[v]; if (UF[v] > seamPin[v]) UF[v] = seamPin[v]; }
    }
  }

  // ---- 4c. a tile-clipped way end lies mid-segment on its twin copy, which is rendered as a straight line between
  // its own vertices: the end takes exactly that height, so the two copies show no step where one of them stops
  // (lifted ground streets have long segments; graph edges alone leave grade * segment-length of slack). Both
  // copies snap onto each other; a few Gauss-Seidel passes make their lines coincide over the overlap.
  if (endJoins.length) {
    const Y = (v) => { const u = U.get(v); return Number.isFinite(u) && u > nodeG[v] ? u : nodeG[v]; };
    for (let pass = 0; pass < 6; pass++) {
      for (let k = 0; k < endJoins.length; k += 4) {
        const e = endJoins[k], a = endJoins[k + 1], b = endJoins[k + 2], t = endJoins[k + 3];
        if (Number.isFinite(pinY[e]) || !Number.isNaN(seamPin[e])) continue;
        const ya = Y(a), yb = Y(b);
        if (!Number.isFinite(U.get(a)) && !Number.isFinite(U.get(b)) && !Number.isFinite(U.get(e))) continue;
        const y = ya + (yb - ya) * t;
        UM[e] = y; if (UF[e] > y) UF[e] = y;
      }
    }
  }

  // ---- 5. per-way vertex heights ----
  for (let r = 0; r < roads.length; r++) {
    const ids = wayNodes[r]; if (!ids) continue;
    let any = false;
    const arr = new Float32Array(ids.length);
    // [elevated-roads] a street that merely shares a node with a lifted footway keeps the road envelope: the foot
    // envelope (UF) would otherwise hoist the street's vertex onto the footbridge (Hong Kong: Peel Street 9 m up)
    const foot = FOOT.has(roads[r][1]);
    if (foot && !roads[r][7] && roads[r][1] !== 'steps') continue;
    for (let i = 0; i < ids.length; i++) {
      const u = foot ? U.get(ids[i]) : UM[ids[i]];
      if (Number.isFinite(u) && (roads[r][7] || u > nodeG[ids[i]] + 0.02)) { arr[i] = u; any = true; } else arr[i] = NaN;
    }
    if (any) out[r] = arr;
  }
  // [elevated-roads] publish this chunk's border-crossing vertices (first writer wins)
  if (seam) {
    for (let r = 0; r < roads.length; r++) {
      const ids = wayNodes[r]; if (!ids) continue;
      for (let i = 0; i + 1 < ids.length; i++) {
        const a = ids[i], b = ids[i + 1];
        if (!crossesChunk(nodeX[a], nodeZ[a], nodeX[b], nodeZ[b])) continue;
        for (const [v, k] of [[a, i], [b, i + 1]]) {
          const key = seamKey(ox + nodeX[v], oz + nodeZ[v]);
          if (seam.get(key) !== undefined) continue;
          const y = out[r] ? out[r][k] : NaN;
          seam.set(key, Number.isFinite(y) ? y : NaN);
        }
      }
    }
  }
  // [elevated-roads] deck ends that join nothing (not another way, not a tile-clip twin): the OSM deck stops
  // in mid-air (parking decks, station concourses, pedestrian decks running into a building). chunk_builder gives
  // them an end support so they never float. bit 1 = first vertex, bit 2 = last vertex.
  // Lifted ground ways (approach ramps / sidewalks hoisted by a deck) that dead-end while still high count too.
  const deckEnds = new Map();
  // An end joined only to a twin copy that itself stops within 2.5 m is the real end of the OSM way (it lies inside
  // the tile overlap, so both copies carry it).
  const onlyOwnOrTwin = (v, r) => {
    const sr = endTwin.get(v);
    if (sr === undefined) return false;
    const tw = wayNodes[sr], own = wayNodes[r];
    if (![tw[0], tw[tw.length - 1]].some((w) => Math.hypot(nodeX[w] - nodeX[v], nodeZ[w] - nodeZ[v]) < 2.5)) return false;
    const l = adj[v];
    for (let j = 0; j < l.length; j += 2) if (!tw.includes(l[j]) && !own.includes(l[j])) return false;
    return true;
  };
  const loose = (v, r, br) => nodeWays[v] === 1 && (adj[v].length <= 2 || onlyOwnOrTwin(v, r)) && (br || U.get(v) > nodeG[v] + 1.2);
  for (let r = 0; r < roads.length; r++) {
    const ids = wayNodes[r]; if (!ids) continue;
    const br = Boolean(roads[r][7]);
    const m = (loose(ids[0], r, br) ? 1 : 0) | (loose(ids[ids.length - 1], r, br) ? 2 : 0);
    if (m) deckEnds.set(r, m);
  }
  out.deckEnds = deckEnds;
  if (computeRoadLiftProfiles.debug) out.dbg = { nodeX, nodeZ, nodeG, U: Float64Array.from(UM, (m, i) => Math.max(m, UF[i])), srcOf, chord, dTerm };
  return out;
}

// [elevated-roads] chunk-seam height sharing (see computeRoadLiftProfiles): node key at 0.5 m in world coords
export function seamKey(wx, wz) {
  return Math.round(wx * 2) * 1e6 + Math.round(wz * 2);
}
function crossesChunk(ax, az, bx, bz) {
  const ina = ax >= -500 && ax < 500 && az >= -500 && az < 500, inb = bx >= -500 && bx < 500 && bz >= -500 && bz < 500;
  return ina !== inb;
}

const CLOSE_R = 260;
const OPEN_R = 45;
// single-source path lengths over the bridge-only graph (component sized)
function graphDist(src, bAdj) {
  const dist = new Map([[src, 0]]);
  const heap = new MaxHeap();
  heap.push(0, src);
  while (heap.size) {
    const v = heap.pop(); const dv = -heap._lastV;
    if (dv > dist.get(v) + 1e-9) continue;
    const l = bAdj.get(v);
    for (let j = 0; j < l.length; j += 2) {
      const nb = l[j], nd = dv + l[j + 1], od = dist.get(nb);
      if (od === undefined || nd < od - 1e-9) { dist.set(nb, nd); heap.push(-nd, nb); }
    }
  }
  return dist;
}
const _ballDist = new Map();
// reduce f(u) over nodes u within graph distance R of v (bridge-only adjacency)
function ballReduce(v, bAdj, R, f, op, init) {
  _ballDist.clear();
  _ballDist.set(v, 0);
  let acc = op(init, f(v));
  const stack = [v];
  // label-correcting search (graphs here are near-chains, so this visits each node ~once)
  while (stack.length) {
    const x = stack.pop(); const dx = _ballDist.get(x);
    const l = bAdj.get(x);
    for (let j = 0; j < l.length; j += 2) {
      const nb = l[j], nd = dx + l[j + 1];
      if (nd > R) continue;
      const old = _ballDist.get(nb);
      if (old === undefined) { acc = op(acc, f(nb)); _ballDist.set(nb, nd); stack.push(nb); }
      else if (nd < old - 1e-6) { _ballDist.set(nb, nd); stack.push(nb); }
    }
  }
  return acc;
}

// Tight boxes around the actual spans (the looser bridge_deck.js boxes also catch Presidio / SoMa overpasses,
// which would then ramp whole neighbourhoods up to 50-60 m).
function isGoldenGateSpan(name, wx, wz, worldOrigin) {
  if (name && /golden\s*gate\s*bridge|金门大桥/i.test(name)) return true;
  const ll = worldXZToLatLon(wx, wz, worldOrigin);
  return Boolean(ll && ll[0] >= 37.81 && ll[0] <= 37.83 && ll[1] >= -122.481 && ll[1] <= -122.474);
}
function isBayBridgeWestSpan(name, wx, wz, worldOrigin) {
  const ll = worldXZToLatLon(wx, wz, worldOrigin);
  return Boolean(ll && ll[0] >= 37.787 && ll[0] <= 37.812 && ll[1] >= -122.388 && ll[1] <= -122.366);
}

// [release-6-integ] = environment.getChunkTerrainMeshElevation (24x24 chunk mesh triangles, DEM - 0.35) over terrainAt
function meshY(terrainAt, wx, wz) {
  const cx = Math.max(0, Math.min(39, Math.floor((wx + 20000) / 1000)));
  const cz = Math.max(0, Math.min(39, Math.floor((wz + 20000) / 1000)));
  const step = 1000 / 24, x00 = -20000 + cx * 1000, z00 = -20000 + cz * 1000;
  const fx = Math.max(0, Math.min(24 - 0.0001, (wx - x00) / step)), fz = Math.max(0, Math.min(24 - 0.0001, (wz - z00) / step));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const x0 = x00 + ix * step, z0 = z00 + iz * step;
  const ha = terrainAt(x0, z0) - 0.35, hb = terrainAt(x0 + step, z0) - 0.35;
  const hc = terrainAt(x0, z0 + step) - 0.35, hd = terrainAt(x0 + step, z0 + step) - 0.35;
  return tx + tz <= 1 ? ha + tx * (hb - ha) + tz * (hc - ha) : hd + (1 - tx) * (hc - hd) + (1 - tz) * (hb - hd);
}

function widthOf(roads, r) {
  const t = r >= 0 ? roads[r] : null;
  return t ? (t[5] || 6) : 6;
}
