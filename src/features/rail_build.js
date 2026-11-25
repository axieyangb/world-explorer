// [feature/rail-transit] Rail track geometry (runs in the chunk worker, or main thread as fallback).
//
// Turns `data.rail` (rail_extract.js) into one merged vertex-coloured mesh per chunk:
//   • dedicated track: ballast bed, sleepers, two rails; viaduct deck + piers on bridges; tunnel portals
//   • street-running tram / LRT / cable car: flush grooved rails on the road surface (+ cable slot)
//   • overhead catenary (poles, arms, contact wire) for light rail & trams
//   • aerial ropeways: towers, sagging cables, stations
// Every OSM vertex is kept and long segments are densified every ≤ 8 m, each sample re-sampled on the
// terrain / road surface, so tracks hug the hills. Underground (tunnel) pieces are not drawn.
// Also emits a compact per-chunk payload for the main-thread vehicle network (rail_transit.js).

import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';

export const RAIL_FAMILY = {
  rail: 'heavy', subway: 'heavy', monorail: 'heavy',
  light_rail: 'light', tram: 'light', cable_car: 'cable', funicular: 'funicular', aerial: 'aerial',
};
export const RAIL_TOP = 0.58;     // rail head above ground on ballast track
export const STREET_TOP = 0.06;   // rail head above the road surface for street running
export const TUNNEL_E = -14;      // vertical offset of tunnel pieces (never drawn)
const STEP = 8.0;                 // densify spacing (m), same as road sub-segments

/** Ground height shared by track mesh + vehicles: never below the rendered terrain triangles. */
export function railGroundY(wx, wz) {
  return Math.max(getBeijingTerrainElevation(wx, wz), getChunkTerrainMeshElevation(wx, wz) + 0.35);
}

export function railGauge(kind) {
  return kind === 'cable_car' ? 1.067 : 1.435;
}

const ekey = (x, z) => `${Math.round(x)},${Math.round(z)}`;

/** Per-vertex vertical offsets (bridges ramp up from grounded ends, tunnels sink, ropeways hang). */
function computeElevations(lines) {
  const ground = new Set();
  for (const l of lines) {
    if (l.br || l.tn || l.k === 'aerial') continue;
    const p = l.p, n = p.length / 2;
    ground.add(ekey(p[0], p[1]));
    ground.add(ekey(p[(n - 1) * 2], p[(n - 1) * 2 + 1]));
  }
  // chain bridge pieces (tile cuts) so short cut pieces of a long viaduct get full height
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); parent.set(find(a), find(b)); };
  const lens = lines.map((l) => {
    let L = 0;
    for (let i = 2; i < l.p.length; i += 2) L += Math.hypot(l.p[i] - l.p[i - 2], l.p[i + 1] - l.p[i - 1]);
    return L;
  });
  lines.forEach((l, i) => {
    if (!l.br) return;
    const n = l.p.length / 2;
    union(ekey(l.p[0], l.p[1]), ekey(l.p[(n - 1) * 2], l.p[(n - 1) * 2 + 1]));
  });
  const chainLen = new Map();
  lines.forEach((l, i) => { if (l.br) { const r = find(ekey(l.p[0], l.p[1])); chainLen.set(r, (chainLen.get(r) || 0) + lens[i]); } });

  return lines.map((l, li) => {
    const p = l.p, n = p.length / 2;
    const e = new Float32Array(n);
    if (l.tn) { e.fill(TUNNEL_E); return e; }
    if (l.k === 'aerial') { for (let i = 0; i < n; i++) e[i] = i === 0 || i === n - 1 ? 6.5 : 15; return e; }
    if (!l.br) return e;
    const chain = chainLen.get(find(ekey(p[0], p[1]))) || lens[li];
    const H = chain < 80 ? 0.8 : 6.5 * Math.max(1, Math.min(3, l.ly || 1));
    const g0 = ground.has(ekey(p[0], p[1])), g1 = ground.has(ekey(p[(n - 1) * 2], p[(n - 1) * 2 + 1]));
    const ramp = Math.max(20, Math.min(90, lens[li] * 0.4));
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      let f = 1;
      if (g0) f = Math.min(f, s / ramp);
      if (g1) f = Math.min(f, (lens[li] - s) / ramp);
      e[i] = H * Math.max(0, Math.min(1, f));
    }
    return e;
  });
}

// decide street running: tram-like kinds riding on a road surface for most of their length
function streetRunning(l, wp, ox, oz, inChunk, roadAt) {
  const n = wp.length / 2;
  let st = 0;
  if (!l.tn && !l.br && (l.k === 'tram' || l.k === 'cable_car' || l.k === 'light_rail' || l.k === 'funicular')) {
    let on = 0, tot = 0;
    for (let i = 0; i < n - 1; i++) {
      const mx = (wp[i * 2] + wp[i * 2 + 2]) / 2, mz = (wp[i * 2 + 1] + wp[i * 2 + 3]) / 2;
      const L = Math.hypot(wp[i * 2 + 2] - wp[i * 2], wp[i * 2 + 3] - wp[i * 2 + 1]);
      tot += L;
      if (inChunk(mx - ox, mz - oz) && roadAt(mx, mz, railGroundY(mx, mz) + 0.6) !== null) on += L;
      else if (!inChunk(mx - ox, mz - oz) && (l.k === 'tram' || l.k === 'cable_car')) on += L; // assume street outside our roads
    }
    st = tot > 0 && on / tot > 0.5 ? 1 : 0;
  }
  return st;
}

// ---------------------------------------------------------------- [release-6-integ] vertical separation with roads
// Road heights include the fix/bridge-continuity lifts (approach ramps / embankments) and come from the same ways +
// lift profiles as the road mesh (chunk ways + ~1 km context, stashed on roadSegments.liftWays by chunk_builder), so
// neighbouring chunks see the same crossings:
//   - viaduct over a lower road (lower layer / ground)   -> track ground >= road surface + RAIL_CLEAR
//   - ground track crossing a lifted (non-bridge) street -> follows the street surface (level crossing)
//   - road bridge of a higher layer (bridge_profile clears the nominal viaduct) -> raises stay below it
// Raises spread along the rail graph at a rail grade (3 % heavy, 4.5 % light) so tracks climb smoothly.
const RAIL_CLEAR = 6.2;   // track ground over road surface (deck underside ~4.8 m above the road)
const ROAD_OVER = 6.8;    // keep the track this far below a higher-layer road bridge
const MIN_CLEAR = 4.8;    // [rail-road-clearance] least track-over-road height that still passes traffic under the deck
const FOOT_CLS = new Set(['footway', 'pedestrian', 'cycleway', 'path', 'steps', 'bridleway', 'corridor']);
const NO_LEVEL_CLS = /^(motorway|trunk)/; // never level crossings (and their lifted ramps must not drag tracks up)

class RHeap { // binary max-heap of (value, id)
  constructor() { this.v = []; this.d = []; }
  get size() { return this.v.length; }
  push(val, id) {
    const v = this.v, d = this.d;
    let k = v.length; v.push(val); d.push(id);
    while (k > 0) { const q = (k - 1) >> 1; if (v[q] >= val) break; v[k] = v[q]; d[k] = d[q]; k = q; }
    v[k] = val; d[k] = id;
  }
  pop() {
    const v = this.v, d = this.d;
    const tv = v[0], td = d[0], lv = v.pop(), ld = d.pop();
    if (v.length) {
      let k = 0;
      for (;;) {
        const a = 2 * k + 1, b = a + 1;
        let m = k, mv = lv;
        if (a < v.length && v[a] > mv) { m = a; mv = v[a]; }
        if (b < v.length && v[b] > mv) { m = b; mv = v[b]; }
        if (m === k) break;
        v[k] = v[m]; d[k] = d[m]; k = m;
      }
      v[k] = lv; d[k] = ld;
    }
    this.top = tv;
    return td;
  }
}

/** World-space road segments (no tunnels) with what is needed to evaluate their rendered surface height. */
function crossingRoads(roadSegments, ox, oz) {
  const segs = [];
  const lw = roadSegments && roadSegments.liftWays;
  if (lw && lw.ways) {
    for (let r = 0; r < lw.ways.length; r++) {
      const t = lw.ways[r], flat = t && t[10];
      if (!flat || flat.length < 6 || t[8]) continue;
      const prof = lw.prof && lw.prof[r];
      const layer = t[7] ? Math.max(1, Number(t[9]) || 1) : Math.min(0, Number(t[9]) || 0);
      // ground-relative raw height as chunk_builder renders it (bridges / layer >= 1 get theirs from the lift profile)
      const rawOf = (y) => (t[7] || (Number(t[9]) || 0) >= 1 ? 0 : Math.min(0.2, y));
      for (let i = 0; i + 1 < flat.length / 3; i++) {
        segs.push({
          ax: flat[i * 3] + ox, az: flat[i * 3 + 2] + oz, bx: flat[i * 3 + 3] + ox, bz: flat[i * 3 + 5] + oz,
          ra: rawOf(flat[i * 3 + 1]), rb: rawOf(flat[i * 3 + 4]), la: prof ? prof[i] : NaN, lb: prof ? prof[i + 1] : NaN,
          layer, bridge: Boolean(t[7]), cls: t[1], hw: Math.max(1, (Number(t[5]) || 0) * 0.5),
        });
      }
    }
  } else {
    for (const s of roadSegments || []) {
      if (!s || s.tunnel) continue;
      segs.push({ ax: s.x1, az: s.z1, bx: s.x2, bz: s.z2, ya: s.y1, yb: s.y2, cls: s.cls, bridge: Boolean(s.bridge),
        layer: s.bridge ? Math.max(1, s.layer || 1) : Math.min(0, s.layer || 0) });
    }
  }
  return segs;
}

// [rail-road-clearance] chunk_builder's per-class road lift above the ground (ROAD_Y_BIAS + up to 0.14 per-way micro bias)
const ROAD_BIAS = {
  footway: 0.28, cycleway: 0.31, pedestrian: 0.34, service: 0.38, residential: 0.43, tertiary_link: 0.48, tertiary: 0.52,
  secondary_link: 0.57, secondary: 0.62, primary_link: 0.68, primary: 0.74, trunk_link: 0.80, trunk: 0.86,
  motorway_link: 0.83, motorway: 0.92,
};

/** Road surface at parameter u (same rule as chunk_builder: max(terrain + raw, lift ramp) + bias). */
function roadYAt(s, u, wx, wz) {
  if (s.ya !== undefined) return s.ya + (s.yb - s.ya) * u;
  // ground under the carriageway: centre and both edges (chunk_builder sampleGroundTerr)
  const L = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1, nx = -(s.bz - s.az) / L * s.hw, nz = (s.bx - s.ax) / L * s.hw;
  const g = Math.max(railGroundY(wx, wz), getChunkTerrainMeshElevation(wx + nx, wz + nz) + 0.35,
    getChunkTerrainMeshElevation(wx - nx, wz - nz) + 0.35);
  let y = g + s.ra + (s.rb - s.ra) * u;
  if (!Number.isNaN(s.la) || !Number.isNaN(s.lb)) {
    const A = Number.isNaN(s.la) ? railGroundY(s.ax, s.az) + s.ra : s.la;
    const B = Number.isNaN(s.lb) ? railGroundY(s.bx, s.bz) + s.rb : s.lb;
    y = Math.max(y, A + (B - A) * u);
  }
  return y + (ROAD_BIAS[s.cls] || 0.43) + 0.14;
}

function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sZ - qz * sX) / den, u = (qx * rZ - qz * rX) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : [t, u];
}

// [rail-road-clearance] Vertex spacing for the road-separation solve. Offsets live on vertices, so on a long OSM
// segment a raise (or a cap under a low road bridge) seeded at its two ends spreads over the whole segment and can
// cancel a neighbouring crossing. Splitting is road-independent (deterministic) so seam chunks agree.
const SEP_STEP = 12;
function densifyLine(l) {
  if (l.tn || l.k === 'aerial') return l;
  const p = l.p, n = p.length / 2;
  let extra = 0;
  for (let i = 0; i + 1 < n; i++) extra += Math.max(0, Math.ceil(Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]) / SEP_STEP) - 1);
  if (!extra) return l;
  const q = new Float64Array(p.length + extra * 2);
  let o = 0;
  for (let i = 0; i + 1 < n; i++) {
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SEP_STEP));
    for (let j = 0; j < k; j++) { q[o++] = ax + (bx - ax) * j / k; q[o++] = az + (bz - az) * j / k; }
  }
  q[o++] = p[(n - 1) * 2]; q[o++] = p[(n - 1) * 2 + 1];
  return { ...l, p: q };
}

/** Raises per-vertex offsets `elev` (in place) so tracks clear / meet the roads they cross. */
function separateFromRoads(lines, elev, stOf, ox, oz, roadSegments) {
  const segs = crossingRoads(roadSegments, ox, oz);
  if (!segs.length) return;
  const CELL = 32, grid = new Map();
  segs.forEach((s, si) => {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const z0 = Math.floor(Math.min(s.az, s.bz) / CELL), z1 = Math.floor(Math.max(s.az, s.bz) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) return;
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx * 100003 + gz; const l = grid.get(k); if (l) l.push(si); else grid.set(k, [si]);
    }
  });
  // rail graph: one node per (rounded) vertex, pieces joined where they share a vertex
  const nodeOf = new Map(), base = [], adj = [];
  const node = (x, z) => {
    const k = ekey(x, z); let id = nodeOf.get(k);
    if (id === undefined) { id = base.length; nodeOf.set(k, id); base.push(-Infinity); adj.push([]); }
    return id;
  };
  const info = lines.map((l, li) => {
    if (l.tn || l.k === 'aerial' || stOf[li]) return null;
    const p = l.p, n = p.length / 2, e = elev[li];
    const g = new Float64Array(n), v = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      g[i] = railGroundY(p[i * 2] + ox, p[i * 2 + 1] + oz);
      v[i] = node(p[i * 2], p[i * 2 + 1]);
      base[v[i]] = Math.max(base[v[i]], g[i] + e[i]);
    }
    const G = l.k === 'rail' ? 0.035 : 0.045; // [rail-road-clearance] metro / light rail climb 4.5 %, main line 3.5 %
    for (let i = 0; i + 1 < n; i++) {
      if (v[i] === v[i + 1]) continue;
      const w = G * Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
      adj[v[i]].push(v[i + 1], w); adj[v[i + 1]].push(v[i], w);
    }
    return { g, v };
  });
  const N = base.length;
  const up = new Float64Array(N).fill(-Infinity), cap = new Float64Array(N).fill(Infinity);
  const hUp = new RHeap(), hCap = new RHeap();
  const seedUp = (id, y) => { if (y > up[id] + 1e-6 && y > base[id] + 0.05) { up[id] = y; hUp.push(y, id); } };
  const seedCap = (id, y) => { if (y < cap[id] - 1e-6) { cap[id] = y; hCap.push(-y, id); } };

  const xs = []; // [rail-road-clearance] viaduct crossings over lower roads (checked again after the solve)
  lines.forEach((l, li) => {
    const I = info[li]; if (!I) return;
    const p = l.p, n = p.length / 2, e = elev[li];
    // [rail-road-clearance] every rail bridge clears the roads it crosses (short ones too: a < 80 m span over a
    // street is the typical overbridge); culverts cross no roads, so they still only follow their neighbours
    const viaduct = Boolean(l.br);
    const RL = viaduct ? Math.max(1, Math.min(3, l.ly || 1)) : 0;
    for (let i = 0; i + 1 < n; i++) {
      const ax = p[i * 2] + ox, az = p[i * 2 + 1] + oz, bx = p[i * 2 + 2] + ox, bz = p[i * 2 + 3] + oz;
      const gx0 = Math.floor(Math.min(ax, bx) / CELL), gx1 = Math.floor(Math.max(ax, bx) / CELL);
      const gz0 = Math.floor(Math.min(az, bz) / CELL), gz1 = Math.floor(Math.max(az, bz) / CELL);
      if ((gx1 - gx0 + 1) * (gz1 - gz0 + 1) > 400) continue;
      const seen = new Set();
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const cl = grid.get(gx * 100003 + gz); if (!cl) continue;
        for (const si of cl) {
          if (seen.has(si)) continue; seen.add(si);
          const s = segs[si];
          const hit = segCross(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz);
          if (!hit) continue;
          const [t, u] = hit;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const gc = railGroundY(x, z);
          const railY = gc + e[i] + (e[i + 1] - e[i]) * t;
          const roadY = roadYAt(s, u, x, z);
          // the track interpolates offsets between vertices: compensate terrain that dips at the crossing
          const comp = Math.max(0, I.g[i] + (I.g[i + 1] - I.g[i]) * t - gc);
          // [rail-road-clearance] a higher-layer road bridge rendered below the viaduct deck + train cannot pass over
          // it (its lift profile cleared another way): the viaduct clears it like a lower road instead
          if (s.bridge && s.layer > RL && !(viaduct && roadY < railY + MIN_CLEAR)) { // road above: never push the track into it
            // a road bridge already too low over the track cannot push it down: ramp from where the track is
            seedCap(I.v[i], Math.max(roadY - ROAD_OVER, base[I.v[i]])); seedCap(I.v[i + 1], Math.max(roadY - ROAD_OVER, base[I.v[i + 1]]));
          } else if (viaduct) {
            const need = roadY + RAIL_CLEAR;
            if (railY < need && roadY - gc < 30) { seedUp(I.v[i], need + comp); seedUp(I.v[i + 1], need + comp); }
            if (roadY - gc < 30) {
              xs.push({ a: I.v[i], b: I.v[i + 1], t, ga: I.g[i], gb: I.g[i + 1], gc, roadY, comp,
                level: !s.bridge && s.layer === 0 && !NO_LEVEL_CLS.test(s.cls || '') });
            }
          } else if (!s.bridge && s.layer === 0 && !FOOT_CLS.has(s.cls) && !NO_LEVEL_CLS.test(s.cls || '')) {
            const dy = roadY - railY;
            if (dy > 0.5 && dy < 7.5) { seedUp(I.v[i], roadY - 0.4 + comp); seedUp(I.v[i + 1], roadY - 0.4 + comp); }
          }
        }
      }
    }
  });
  if (!hUp.size && !xs.length) return;
  while (hUp.size) {
    const v = hUp.pop(), uv = hUp.top;
    if (uv < up[v] - 1e-6) continue;
    const a = adj[v];
    for (let j = 0; j < a.length; j += 2) {
      const nb = a[j], c = uv - a[j + 1];
      if (c - base[nb] > 6.5) continue;
      if (c > up[nb] + 1e-6 && c > base[nb] + 0.02) { up[nb] = c; hUp.push(c, nb); }
    }
  }
  while (hCap.size) {
    const v = hCap.pop(), cv = -hCap.top;
    if (cv > cap[v] + 1e-6) continue;
    const a = adj[v];
    for (let j = 0; j < a.length; j += 2) {
      const nb = a[j], c = cv + a[j + 1];
      if (c < cap[nb] - 1e-6 && c < up[nb]) { cap[nb] = c; hCap.push(-c, nb); }
    }
  }
  const Y = new Float64Array(N);
  for (let v = 0; v < N; v++) Y[v] = Math.max(base[v], Math.min(up[v], cap[v]));
  // [rail-road-clearance] a viaduct ramp end that still cannot clear a ground street (the climb is capped by a road
  // bridge above, or the ramp is too short at the rail grade) comes down to a level crossing on the street surface
  // instead of leaving the deck at head height over the carriageway. Repeated: lowering can expose the next street.
  const down = new Float64Array(N).fill(Infinity), hDn = new RHeap();
  for (let it = 0; it < 6; it++) {
    let added = 0;
    for (const c of xs) {
      if (!c.level) continue;
      const ry = c.gc + (Y[c.a] - c.ga) * (1 - c.t) + (Y[c.b] - c.gb) * c.t;
      if (ry >= c.roadY + MIN_CLEAR || ry <= c.roadY + 0.3) continue; // clears it / already level
      const y = c.roadY - 0.4 + c.comp;
      for (const id of [c.a, c.b]) if (y < down[id] - 1e-6) { down[id] = y; hDn.push(-y, id); added++; }
    }
    if (!added) break;
    while (hDn.size) {
      const v = hDn.pop(), dv = -hDn.top;
      if (dv > down[v] + 1e-6) continue;
      const a = adj[v];
      for (let j = 0; j < a.length; j += 2) {
        const nb = a[j], c = dv + a[j + 1];
        if (c < down[nb] - 1e-6 && c < Y[nb]) { down[nb] = c; hDn.push(-c, nb); }
      }
    }
    for (let v = 0; v < N; v++) if (down[v] < Y[v]) Y[v] = down[v];
  }
  lines.forEach((l, li) => {
    const I = info[li]; if (!I) return;
    const e = elev[li];
    const maxE = l.br ? 25.0 : 5.5;
    for (let i = 0; i < e.length; i++) {
      const y = Y[I.v[i]];
      if (y > I.g[i] + e[i] + 0.01) e[i] = Math.min(maxE, y - I.g[i]);
      else if (down[I.v[i]] < Infinity && y < I.g[i] + e[i] - 0.01) e[i] = Math.max(0, y - I.g[i]);
    }
  });
}

/** Simple uniform grid over world-space road segments for road-surface lookups. */
function makeRoadLookup(roadSegments) {
  const CELL = 24;
  const grid = new Map();
  for (const s of roadSegments || []) {
    if (!s || s.tunnel) continue;
    const x0 = Math.floor(Math.min(s.x1, s.x2) / CELL), x1 = Math.floor(Math.max(s.x1, s.x2) / CELL);
    const z0 = Math.floor(Math.min(s.z1, s.z2) / CELL), z1 = Math.floor(Math.max(s.z1, s.z2) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 100003 + j;
      const l = grid.get(k);
      if (l) l.push(s); else grid.set(k, [s]);
    }
  }
  return (wx, wz, refY) => {
    const l = grid.get(Math.floor(wx / CELL) * 100003 + Math.floor(wz / CELL));
    if (!l) return null;
    let best = null, bestD = Infinity;
    for (const s of l) {
      const vx = s.x2 - s.x1, vz = s.z2 - s.z1;
      const l2 = vx * vx + vz * vz;
      if (l2 < 0.01) continue;
      let t = ((wx - s.x1) * vx + (wz - s.z1) * vz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(wx - s.x1 - vx * t, wz - s.z1 - vz * t);
      if (d > (s.width || 6) * 0.5 + 0.6) continue;
      const y = s.y1 + (s.y2 - s.y1) * t;
      if (Math.abs(y - refY) > 3.0) continue;
      if (d < bestD) { bestD = d; best = y; }
    }
    return best;
  };
}

// ---------------------------------------------------------------- colours
const C = {
  ballast: [0.36, 0.34, 0.31], ballastSide: [0.30, 0.28, 0.26], yard: [0.30, 0.29, 0.27],
  wood: [0.30, 0.23, 0.17], concreteSleeper: [0.56, 0.55, 0.52],
  railTop: [0.74, 0.73, 0.71], railSide: [0.34, 0.29, 0.25],
  streetRail: [0.58, 0.58, 0.59], groove: [0.07, 0.07, 0.07], slot: [0.04, 0.04, 0.04], slotBand: [0.50, 0.48, 0.45],
  deck: [0.66, 0.65, 0.62], deckSide: [0.56, 0.55, 0.53], deckUnder: [0.36, 0.36, 0.35], pier: [0.60, 0.59, 0.56],
  parapetCap: [0.75, 0.74, 0.71], duct: [0.48, 0.47, 0.45],
  pole: [0.22, 0.24, 0.24], wire: [0.10, 0.10, 0.10],
  portal: [0.52, 0.51, 0.48], portalDark: [0.03, 0.03, 0.04],
  tower: [0.45, 0.47, 0.50], station: [0.62, 0.60, 0.56], cable: [0.08, 0.08, 0.08],
  platDeck: [0.64, 0.63, 0.60], platCoping: [0.76, 0.75, 0.72], platFascia: [0.34, 0.34, 0.33],
  tactileYellow: [0.95, 0.78, 0.10], steelDark: [0.22, 0.25, 0.28],
  canopyDeck: [0.72, 0.74, 0.76], canopyGlass: [0.42, 0.62, 0.78], ledWarm: [0.98, 0.94, 0.80],
  timber: [0.55, 0.37, 0.20], signBlue: [0.12, 0.32, 0.62], signFace: [0.92, 0.94, 0.96],
  stairStep: [0.48, 0.48, 0.47],
};

class GeoSink {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, rgb) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  quad(a, b, c, d, rgb) { this.tri(a, b, c, rgb); this.tri(a, c, d, rgb); }
  /** Oriented box (no bottom). t = unit forward (x,z), n = unit side. */
  box(cx, cz, y0, y1, tx, tz, ht, hn, rgb, rgbTop = rgb) {
    const nx = -tz, nz = tx;
    const P = (a, b, y) => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
    const c = [P(-ht, -hn, 0), P(ht, -hn, 0), P(ht, hn, 0), P(-ht, hn, 0)];
    const lo = c.map((q) => [q[0], y0, q[2]]), hi = c.map((q) => [q[0], y1, q[2]]);
    this.quad(hi[0], hi[3], hi[2], hi[1], rgbTop);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(lo[i], lo[j], hi[j], hi[i], rgb);
    }
  }
  /** Sleeper: top + the two long faces only (ends are invisible under the rails / in ballast). */
  sleeper(cx, cz, y0, y1, tx, tz, ht, hn, rgb) {
    const nx = -tz, nz = tx;
    const P = (a, b, y) => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
    this.quad(P(-ht, -hn, y1), P(-ht, hn, y1), P(ht, hn, y1), P(ht, -hn, y1), rgb);
    this.quad(P(-ht, -hn, y0), P(-ht, hn, y0), P(-ht, hn, y1), P(-ht, -hn, y1), rgb);
    this.quad(P(ht, hn, y0), P(ht, -hn, y0), P(ht, -hn, y1), P(ht, hn, y1), rgb);
  }
  toMesh(mat) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const c8 = new Uint8Array(this.col.length);
    for (let i = 0; i < c8.length; i++) c8[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    g.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/**
 * Densifies a world-space polyline (with per-vertex offsets e) to ≤ STEP spacing.
 * Returns arrays x, z, e (linear in e) + cumulative distance s.
 */
function densify(wpts, e) {
  const xs = [], zs = [], es = [], ss = [];
  let s = 0;
  const n = wpts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const ax = wpts[i * 2], az = wpts[i * 2 + 1], bx = wpts[i * 2 + 2], bz = wpts[i * 2 + 3];
    const L = Math.hypot(bx - ax, bz - az);
    const k = Math.max(1, Math.ceil(L / STEP));
    for (let j = 0; j < k; j++) {
      const u = j / k;
      xs.push(ax + (bx - ax) * u); zs.push(az + (bz - az) * u);
      es.push(e[i] + (e[i + 1] - e[i]) * u); ss.push(s + L * u);
    }
    s += L;
  }
  xs.push(wpts[(n - 1) * 2]); zs.push(wpts[(n - 1) * 2 + 1]); es.push(e[n - 1]); ss.push(s);
  return { xs, zs, es, ss };
}

/**
 * Builds rail meshes into `group` (chunk-local coords) and returns the main-thread payload.
 * @param {{lines: Array, stops: Array}} rail
 */
export function buildRailTrack(rail, ox, oz, group, mats, roadSegments, buildingColliders = null, buildingFootprints = null) {
  const out = { lines: [], stops: [] };
  if (!rail || !rail.lines) return out;
  const lines = rail.lines.map(densifyLine); // [rail-road-clearance] crossing raises / caps act locally
  const elev = computeElevations(lines);
  const roadAt = makeRoadLookup(roadSegments);
  const sink = new GeoSink();
  const stationTracks = [];
  let sleeperBudget = 1800;

  // endpoints of tunnels (for portals) and of ground pieces
  const tunnelEnds = new Set();
  for (const l of lines) if (l.tn) { const n = l.p.length / 2; tunnelEnds.add(ekey(l.p[0], l.p[1])); tunnelEnds.add(ekey(l.p[(n - 1) * 2], l.p[(n - 1) * 2 + 1])); }

  const inChunk = (lx, lz) => lx >= -500 && lx < 500 && lz >= -500 && lz < 500;

  // [release-6-integ] street running first, then clear / follow the (bridge-profile lifted) roads
  const stOf = lines.map((l) => {
    const wq = new Float64Array(l.p.length);
    for (let i = 0; i < l.p.length; i += 2) { wq[i] = l.p[i] + ox; wq[i + 1] = l.p[i + 1] + oz; }
    return streetRunning(l, wq, ox, oz, inChunk, roadAt);
  });
  separateFromRoads(lines, elev, stOf, ox, oz, roadSegments);

  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    const e = elev[li];
    const n = l.p.length / 2;
    const wp = new Float64Array(l.p.length);
    for (let i = 0; i < n; i++) { wp[i * 2] = l.p[i * 2] + ox; wp[i * 2 + 1] = l.p[i * 2 + 1] + oz; }

    const st = stOf[li]; // [release-6-integ] decided in the pre-pass (streetRunning)

    const pay = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pay[i * 3] = wp[i * 2]; pay[i * 3 + 1] = wp[i * 2 + 1]; pay[i * 3 + 2] = e[i]; }
    out.lines.push({ k: l.k, st, br: l.br, tn: l.tn, svc: l.svc, p: pay });

    if (l.tn) continue;
    if (l.k === 'aerial') { buildAerial(sink, wp, e, ox, oz, inChunk); continue; }

    const d = densify(wp, e);
    const m = d.xs.length;
    const ys = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const g = railGroundY(d.xs[i], d.zs[i]);
      if (st) {
        const r = roadAt(d.xs[i], d.zs[i], g + 0.6);
        ys[i] = r !== null ? r + STREET_TOP : g + 0.2;
      } else {
        ys[i] = g + d.es[i];
      }
    }
    // per-point mitred normals
    const nxs = new Float32Array(m), nzs = new Float32Array(m), txs = new Float32Array(m), tzs = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
      let tx = d.xs[b] - d.xs[a], tz = d.zs[b] - d.zs[a];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L;
      txs[i] = tx; tzs[i] = tz; nxs[i] = -tz; nzs[i] = tx;
    }
    if (!st && !l.svc && (l.k === 'rail' || l.k === 'subway' || l.k === 'light_rail' || l.k === 'monorail')) {
      const lxs = new Float32Array(m), lzs = new Float32Array(m);
      for (let i = 0; i < m; i++) { lxs[i] = d.xs[i] - ox; lzs[i] = d.zs[i] - oz; }
      stationTracks.push({ k: l.k, br: Boolean(l.br), xs: lxs, zs: lzs, ys, es: d.es, ss: d.ss });
    }
    const P = (i, o, dy) => [d.xs[i] - ox + nxs[i] * o, ys[i] + dy, d.zs[i] - oz + nzs[i] * o];
    const strip = (i, o1, dy1, o2, dy2, rgb) => sink.quad(P(i, o1, dy1), P(i + 1, o1, dy1), P(i + 1, o2, dy2), P(i, o2, dy2), rgb);

    const half = railGauge(l.k) / 2;
    const catenary = (l.k === 'light_rail' || l.k === 'tram') && !l.svc;
    let nextPole = 12, nextPier = 15, nextSleeper = 0;
    const sleeperGap = 1.6;

    for (let i = 0; i < m - 1; i++) {
      const mx = (d.xs[i] + d.xs[i + 1]) / 2 - ox, mz = (d.zs[i] + d.zs[i + 1]) / 2 - oz;
      if (!inChunk(mx, mz)) { nextPole = d.ss[i + 1] + 1; nextSleeper = d.ss[i + 1]; continue; }
      const segL = d.ss[i + 1] - d.ss[i];
      if (segL < 0.05) continue;
      const elevated = Boolean(l.br) && (d.es[i] > 1.8 || d.es[i + 1] > 1.8);

      if (st) {
        // street running: flush grooved rails on the asphalt
        for (const sgn of [-1, 1]) {
          const o = sgn * half;
          strip(i, o - 0.05, 0, o + 0.05, 0, C.streetRail);
          strip(i, o - sgn * 0.05 - 0.02, -0.004, o - sgn * 0.05 + 0.02, -0.004, C.groove);
        }
        if (l.k === 'cable_car') {
          strip(i, -half + 0.08, -0.012, half - 0.08, -0.012, C.slotBand);
          strip(i, -0.035, 0.002, 0.035, 0.002, C.slot);
          strip(i, -0.085, 0.001, -0.035, 0.001, C.streetRail);
          strip(i, 0.035, 0.001, 0.085, 0.001, C.streetRail);
        }
      } else {
        const bedY = 0.30;
        if (elevated) {
          // Box-girder deck slab + side webs + underside soffit
          strip(i, -2.7, bedY, 2.7, bedY, C.deck);
          strip(i, -2.7, -1.1, -2.7, bedY, C.deckSide);
          strip(i, 2.7, bedY, 2.7, -1.1, C.deckSide);
          strip(i, 2.7, -1.1, -2.7, -1.1, C.deckUnder);
          // 3D Parapet walls (outer face, inner face, and overhanging top coping edge)
          strip(i, -2.7, bedY, -2.7, bedY + 0.9, C.deckSide);
          strip(i, -2.44, bedY + 0.9, -2.44, bedY, C.deckSide);
          strip(i, -2.76, bedY + 0.92, -2.40, bedY + 0.92, C.parapetCap);
          strip(i, 2.7, bedY + 0.9, 2.7, bedY, C.deckSide);
          strip(i, 2.44, bedY, 2.44, bedY + 0.9, C.deckSide);
          strip(i, 2.40, bedY + 0.92, 2.76, bedY + 0.92, C.parapetCap);
          // Raised profiled ballast bed crown & shoulders + side cable trough ducts on viaduct deck
          strip(i, -1.85, bedY, -1.52, bedY + 0.08, C.ballastSide);
          strip(i, -1.52, bedY + 0.08, 1.52, bedY + 0.08, C.ballast);
          strip(i, 1.52, bedY + 0.08, 1.85, bedY, C.ballastSide);
          strip(i, -2.36, bedY + 0.06, -1.98, bedY + 0.06, C.duct);
          strip(i, 1.98, bedY + 0.06, 2.36, bedY + 0.06, C.duct);
          while (nextPier <= d.ss[i + 1]) {
            const u = (nextPier - d.ss[i]) / segL;
            const px = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * u, pz = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * u;
            const py = ys[i] + (ys[i + 1] - ys[i]) * u;
            const gy = railGroundY(px, pz) - 0.6;
            if (py - 1.1 - gy > 1.5 && py - gy < 32.0) {
              const lx = px - ox, lz = pz - oz;
              // Base footing plinth + main column shaft + corbel neck + wide hammerhead pier cap
              sink.box(lx, lz, gy, Math.min(py - 1.55, gy + 1.15), txs[i], tzs[i], 0.95, 1.25, C.deckSide);
              sink.box(lx, lz, gy, py - 1.48, txs[i], tzs[i], 0.68, 0.94, C.pier);
              sink.box(lx, lz, py - 1.82, py - 1.44, txs[i], tzs[i], 0.80, 1.68, C.pier);
              sink.box(lx, lz, py - 1.44, py - 1.10, txs[i], tzs[i], 0.92, 2.42, C.parapetCap, C.deck);
            }
            nextPier += 30;
          }
        } else {
          strip(i, -1.7, bedY, 1.7, bedY, l.svc ? C.yard : C.ballast);
          if (!l.svc) { // yards/sidings: flat bed only (triangle budget)
            strip(i, -2.5, -0.08, -1.7, bedY, C.ballastSide);
            strip(i, 1.7, bedY, 2.5, -0.08, C.ballastSide);
          }
          // [release-6-integ] raised ground track (level crossing on a lifted street, viaduct approach): embankment
          const ea = d.es[i], eb = d.es[i + 1];
          if (ea > 0.05 || eb > 0.05) {
            sink.quad(P(i, -2.5 - 1.5 * ea, -0.38 - ea), P(i + 1, -2.5 - 1.5 * eb, -0.38 - eb), P(i + 1, -2.5, -0.08), P(i, -2.5, -0.08), C.ballastSide);
            sink.quad(P(i, 2.5, -0.08), P(i + 1, 2.5, -0.08), P(i + 1, 2.5 + 1.5 * eb, -0.38 - eb), P(i, 2.5 + 1.5 * ea, -0.38 - ea), C.ballastSide);
          }
        }
        // sleepers
        while (!l.svc && nextSleeper <= d.ss[i + 1] && sleeperBudget > 0) {
          if (nextSleeper >= d.ss[i]) {
            const u = (nextSleeper - d.ss[i]) / segL;
            const px = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * u, pz = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * u;
            const py = ys[i] + (ys[i + 1] - ys[i]) * u;
            sink.sleeper(px - ox, pz - oz, py + bedY - 0.02, py + bedY + 0.12, txs[i], tzs[i], 0.13, 1.3,
              l.k === 'subway' || l.k === 'rail' ? C.concreteSleeper : C.wood);
            sleeperBudget--;
          }
          nextSleeper += sleeperGap;
        }
        // rails
        for (const sgn of [-1, 1]) {
          const o = sgn * half;
          strip(i, o - 0.04, RAIL_TOP, o + 0.04, RAIL_TOP, C.railTop);
          if (l.svc) continue;
          strip(i, o - sgn * 0.04, bedY + 0.12, o - sgn * 0.04, RAIL_TOP, C.railSide);
          strip(i, o + sgn * 0.04, RAIL_TOP, o + sgn * 0.04, bedY + 0.12, C.railSide);
        }
      }

      if (catenary) {
        const top = st ? 0 : RAIL_TOP;
        strip(i, -0.025, top + 5.6, 0.025, top + 5.6, C.wire);
        strip(i, 0, top + 5.57, 0, top + 5.63, C.wire);
        if (!st) strip(i, 0, top + 6.5, 0, top + 6.56, C.wire);
        while (nextPole <= d.ss[i + 1]) {
          if (!st && nextPole >= d.ss[i]) {
            const u = (nextPole - d.ss[i]) / segL;
            const bx = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * u;
            const bz = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * u;
            const py = ys[i] + (ys[i + 1] - ys[i]) * u;
            const chosenSide = 3.0;
            if (chosenSide !== 0) {
              const px = bx + nxs[i] * chosenSide;
              const pz = bz + nzs[i] * chosenSide;
              const absSide = Math.abs(chosenSide);
              const sgn = chosenSide >= 0 ? 1 : -1;
              sink.box(px - ox, pz - oz, py - 0.3, py + top + 7.0, txs[i], tzs[i], 0.12, 0.12, C.pole);
              const ax = px - nxs[i] * sgn * (absSide / 2 + 0.1), az = pz - nzs[i] * sgn * (absSide / 2 + 0.1);
              sink.box(ax - ox, az - oz, py + top + 6.15, py + top + 6.3, nzs[i] * sgn, -nxs[i] * sgn, absSide / 2 + 0.15, 0.05, C.pole);
            }
          }
          nextPole += st ? 32 : 45;
        }
      }
    }

    // tunnel portals at ends that dive underground
    if (!st) {
      for (const end of [0, m - 1]) {
        if (!tunnelEnds.has(ekey(d.xs[end] - ox, d.zs[end] - oz))) continue;
        if (!inChunk(d.xs[end] - ox, d.zs[end] - oz)) continue;
        const sgn = end === 0 ? -1 : 1;
        const tx = txs[end] * sgn, tz = tzs[end] * sgn;
        const cx = d.xs[end] - ox, cz = d.zs[end] - oz, y = ys[end];
        const nx = -tz, nz = tx;
        sink.box(cx + nx * 3.1, cz + nz * 3.1, y - 0.5, y + 6.2, tx, tz, 0.6, 0.5, C.portal);
        sink.box(cx - nx * 3.1, cz - nz * 3.1, y - 0.5, y + 6.2, tx, tz, 0.6, 0.5, C.portal);
        sink.box(cx, cz, y + 5.4, y + 7.0, tx, tz, 0.6, 3.6, C.portal);
        const Q = (a, b, yy) => [cx + nx * a + tx * b, yy, cz + nz * a + tz * b];
        sink.quad(Q(-2.6, 0.55, y), Q(2.6, 0.55, y), Q(2.6, 0.55, y + 5.4), Q(-2.6, 0.55, y + 5.4), C.portalDark);
      }
    }
  }

  buildStationPlatforms(sink, rail.stops, stationTracks, tunnelEnds, ox, oz, inChunk, roadSegments, buildingColliders, buildingFootprints);

  for (const s of rail.stops || []) out.stops.push([s[0] + ox, s[1] + oz, s[2], s[3]]);

  const mesh = sink.toMesh(mats.facilityMat);
  if (mesh) { mesh.name = 'rail_track'; group.add(mesh); }
  return out;
}

function buildAerial(sink, wp, e, ox, oz, inChunk) {
  const n = wp.length / 2;
  const ys = [];
  for (let i = 0; i < n; i++) ys.push(railGroundY(wp[i * 2], wp[i * 2 + 1]) + e[i]);
  for (let i = 0; i < n - 1; i++) {
    const ax = wp[i * 2], az = wp[i * 2 + 1], bx = wp[i * 2 + 2], bz = wp[i * 2 + 3];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
    const k = Math.max(1, Math.ceil(L / 12));
    const sag = Math.min(8, L * 0.015);
    for (let j = 0; j < k; j++) {
      const u0 = j / k, u1 = (j + 1) / k;
      const mx = ax + (bx - ax) * (u0 + u1) / 2 - ox, mz = az + (bz - az) * (u0 + u1) / 2 - oz;
      if (!inChunk(mx, mz)) continue;
      const y0 = ys[i] + (ys[i + 1] - ys[i]) * u0 - 4 * sag * u0 * (1 - u0);
      const y1 = ys[i] + (ys[i + 1] - ys[i]) * u1 - 4 * sag * u1 * (1 - u1);
      for (const o of [-2.2, 2.2]) {
        const p0 = [ax + (bx - ax) * u0 - ox + nx * o, y0, az + (bz - az) * u0 - oz + nz * o];
        const p1 = [ax + (bx - ax) * u1 - ox + nx * o, y1, az + (bz - az) * u1 - oz + nz * o];
        sink.quad(p0, p1, [p1[0], p1[1] + 0.08, p1[2]], [p0[0], p0[1] + 0.08, p0[2]], C.cable);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const x = wp[i * 2] - ox, z = wp[i * 2 + 1] - oz;
    if (!inChunk(x, z)) continue;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = wp[b * 2] - wp[a * 2], tz = wp[b * 2 + 1] - wp[a * 2 + 1];
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const g = railGroundY(wp[i * 2], wp[i * 2 + 1]) - 0.4;
    if (i === 0 || i === n - 1) {
      sink.box(x, z, g, ys[i] + 1.5, tx, tz, 5, 4.2, C.station, [0.40, 0.38, 0.36]);
    } else {
      sink.box(x, z, g, ys[i] + 0.4, tx, tz, 0.6, 0.6, C.tower);
      sink.box(x, z, ys[i] + 0.1, ys[i] + 0.5, tx, tz, 0.3, 2.8, C.tower);
    }
  }
}

// ---------------------------------------------------------------- railway station platforms & canopies

function emitPrismST(sink, cx, cz, tx, tz, nx, nz, s0, s1, n0, n1, y0a, y1a, y0b, y1b, rgb, rgbTop = rgb, emitBottom = false) {
  let sA = s0, sB = s1, y0A = y0a, y1A = y1a, y0B = y0b, y1B = y1b;
  if (sA > sB) {
    sA = s1; sB = s0;
    y0A = y0b; y1A = y1b; y0B = y0a; y1B = y1a;
  }
  const nA = Math.min(n0, n1), nB = Math.max(n0, n1);
  if (sB - sA < 1e-4 || nB - nA < 1e-4) return;
  if (Math.max(y1A - y0A, y1B - y0B) < 1e-4) return;
  const P = (s, n, y) => [cx + tx * s + nx * n, y, cz + tz * s + nz * n];
  const lo00 = P(sA, nA, y0A), lo10 = P(sB, nA, y0B), lo11 = P(sB, nB, y0B), lo01 = P(sA, nB, y0A);
  const hi00 = P(sA, nA, y1A), hi10 = P(sB, nA, y1B), hi11 = P(sB, nB, y1B), hi01 = P(sA, nB, y0A + (y1A - y0A));
  sink.quad(hi00, hi01, hi11, hi10, rgbTop);
  if (emitBottom) sink.quad(lo00, lo10, lo11, lo01, rgb);
  sink.quad(lo10, lo00, hi00, hi10, rgb);
  sink.quad(lo01, lo11, hi11, hi01, rgb);
  sink.quad(lo00, lo01, hi01, hi00, rgb);
  sink.quad(lo11, lo10, hi10, hi11, rgb);
}

function emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, s0, s1, n0, y0a, y0b, n1, y1a, y1b, th, rgb) {
  let sA = s0, sB = s1, ya0 = y0a, yb0 = y0b, ya1 = y1a, yb1 = y1b;
  if (sA > sB) {
    sA = s1; sB = s0;
    ya0 = y0b; yb0 = y0a; ya1 = y1b; yb1 = y1a;
  }
  let nA = n0, nB = n1;
  if (nA > nB) {
    nA = n1; nB = n0;
    const tA = ya0, tB = yb0;
    ya0 = ya1; yb0 = yb1; ya1 = tA; yb1 = tB;
  }
  if (sB - sA < 1e-4 || nB - nA < 1e-4 || th < 1e-4) return;
  const P = (s, n, y) => [cx + tx * s + nx * n, y, cz + tz * s + nz * n];
  const b00 = P(sA, nA, ya0), b10 = P(sB, nA, yb0), b11 = P(sB, nB, yb1), b01 = P(sA, nB, ya1);
  const t00 = P(sA, nA, ya0 + th), t10 = P(sB, nA, yb0 + th), t11 = P(sB, nB, yb1 + th), t01 = P(sA, nB, ya1 + th);
  sink.quad(t00, t01, t11, t10, rgb);
  sink.quad(b00, b10, b11, b01, rgb);
  sink.quad(b10, b00, t00, t10, rgb);
  sink.quad(b01, b11, t11, t01, rgb);
  sink.quad(b00, b01, t01, t00, rgb);
  sink.quad(b11, b10, t10, t11, rgb);
}

function emitBeam3D(sink, a, b, hw, hh, rgb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4 || !Number.isFinite(L)) return;
  const fx = dx / L, fy = dy / L, fz = dz / L;
  // pick reference up vector not parallel to beam axis
  const rx = Math.abs(fy) > 0.94 ? 1 : 0, ry = Math.abs(fy) > 0.94 ? 0 : 1, rz = 0;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const uL = Math.hypot(ux, uy, uz) || 1;
  ux /= uL; uy /= uL; uz /= uL;
  const vx = fy * uz - fz * uy, vy = fz * ux - fx * uz, vz = fx * uy - fy * ux;
  const C0 = (p, su, sv) => [p[0] + ux * su * hw + vx * sv * hh, p[1] + uy * su * hw + vy * sv * hh, p[2] + uz * su * hw + vz * sv * hh];
  const a0 = C0(a, -1, -1), a1 = C0(a, 1, -1), a2 = C0(a, 1, 1), a3 = C0(a, -1, 1);
  const b0 = C0(b, -1, -1), b1 = C0(b, 1, -1), b2 = C0(b, 1, 1), b3 = C0(b, -1, 1);
  sink.quad(a0, a1, b1, b0, rgb);
  sink.quad(a1, a2, b2, b1, rgb);
  sink.quad(a2, a3, b3, b2, rgb);
  sink.quad(a3, a0, b0, b3, rgb);
  sink.quad(a0, a3, a2, a1, rgb);
  sink.quad(b0, b1, b2, b3, rgb);
}

function sampleElevationProfile(samples, s) {
  if (s <= samples[0].s) return samples[0].y;
  const last = samples[samples.length - 1];
  if (s >= last.s) return last.y;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (s <= b.s) {
      const span = b.s - a.s;
      const u = span > 1e-5 ? (s - a.s) / span : 0;
      return a.y + (b.y - a.y) * u;
    }
  }
  return last.y;
}

function traceStationSpan(stationTracks, best, tx, tz, nx, nz, trackY, tunnelEnds) {
  const MAX_HALF = 32.0;
  const walkDir = (walkSign) => {
    const wtx = tx * walkSign, wtz = tz * walkSign;
    const pts = [];
    let curTr = best.tr;
    let segDir = walkSign;
    let prevX = best.px, prevZ = best.pz, prevY = trackY;
    let idx = walkSign > 0 ? best.i + 1 : best.i;
    let limitS = 0;
    const visited = new Set([curTr]);

    for (let guard = 0; guard < 128; guard++) {
      if (idx < 0 || idx >= curTr.xs.length) {
        const endIdx = idx < 0 ? 0 : curTr.xs.length - 1;
        const ex = curTr.xs[endIdx], ez = curTr.zs[endIdx];
        if (tunnelEnds.has(ekey(ex, ez))) {
          limitS = Math.max(0, limitS - 2.0);
          break;
        }
        // chain across OSM way splits at matching endpoints
        let nextTr = null, nextIdx = -1, nextDir = 1;
        for (const cand of stationTracks) {
          if (visited.has(cand)) continue;
          const m = cand.xs.length;
          if (m < 2) continue;
          if (Math.hypot(cand.xs[0] - ex, cand.zs[0] - ez) < 0.6) {
            const dx = cand.xs[1] - cand.xs[0], dz = cand.zs[1] - cand.zs[0];
            const L = Math.hypot(dx, dz) || 1;
            if ((dx * wtx + dz * wtz) / L > 0.94) { nextTr = cand; nextIdx = 1; nextDir = 1; break; }
          } else if (Math.hypot(cand.xs[m - 1] - ex, cand.zs[m - 1] - ez) < 0.6) {
            const dx = cand.xs[m - 2] - cand.xs[m - 1], dz = cand.zs[m - 2] - cand.zs[m - 1];
            const L = Math.hypot(dx, dz) || 1;
            if ((dx * wtx + dz * wtz) / L > 0.94) { nextTr = cand; nextIdx = m - 2; nextDir = -1; break; }
          }
        }
        if (!nextTr) break;
        visited.add(nextTr);
        curTr = nextTr;
        idx = nextIdx;
        segDir = nextDir;
      }

      const vx = curTr.xs[idx], vz = curTr.zs[idx], vy = curTr.ys[idx];
      const segDx = vx - prevX, segDz = vz - prevZ;
      const segDist = Math.hypot(segDx, segDz);
      if (segDist > 0.05) {
        const dot = (segDx * wtx + segDz * wtz) / segDist;
        const slope = Math.abs(vy - prevY) / segDist;
        const sProj = (vx - best.px) * wtx + (vz - best.pz) * wtz;
        const nOff = Math.abs((vx - best.px) * nx + (vz - best.pz) * nz);
        if (dot < 0.95 || slope > 0.14 || nOff > 1.25 || Math.abs(vy - trackY) > 3.0) {
          break;
        }
        if (sProj >= MAX_HALF) {
          const prevS = (prevX - best.px) * wtx + (prevZ - best.pz) * wtz;
          const denom = sProj - prevS;
          const u = denom > 1e-4 ? (MAX_HALF - prevS) / denom : 1;
          const yLim = prevY + (vy - prevY) * Math.max(0, Math.min(1, u));
          pts.push({ s: MAX_HALF, y: yLim });
          limitS = MAX_HALF;
          break;
        }
        if (sProj > limitS) {
          limitS = sProj;
          pts.push({ s: sProj, y: vy });
        }
      }
      prevX = vx; prevZ = vz; prevY = vy;
      idx += segDir;
    }
    return { limitS, pts };
  };

  const fwd = walkDir(1);
  const bwd = walkDir(-1);
  const samples = [];
  for (let i = bwd.pts.length - 1; i >= 0; i--) samples.push({ s: -bwd.pts[i].s, y: bwd.pts[i].y });
  samples.push({ s: 0, y: trackY });
  for (let i = 0; i < fwd.pts.length; i++) samples.push(fwd.pts[i]);
  return { sMin: -bwd.limitS, sMax: fwd.limitS, samples };
}

function findCorridorTrackExtent(stationTracks, cx, cz, tx, tz, nx, nz, trackY) {
  const offs = [0];
  for (const tr of stationTracks) {
    for (let i = 0; i < tr.xs.length - 1; i++) {
      const ax = tr.xs[i], az = tr.zs[i], bx = tr.xs[i + 1], bz = tr.zs[i + 1];
      const dx = bx - ax, dz = bz - az;
      const segL = Math.hypot(dx, dz);
      if (segL < 0.05) continue;
      const dot = Math.abs((dx * tx + dz * tz) / segL);
      if (dot < 0.90) continue;
      // project station center (cx, cz) onto segment
      const u = ((cx - ax) * dx + (cz - az) * dz) / (segL * segL);
      if (u < -0.5 || u > 1.5) continue;
      const uc = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = ax + dx * uc, qz = az + dz * uc;
      const sOff = Math.abs((qx - cx) * tx + (qz - cz) * tz);
      if (sOff > 8.0) continue;
      const qy = tr.ys[i] + (tr.ys[i + 1] - tr.ys[i]) * uc;
      if (Math.abs(qy - trackY) > 2.2) continue;
      const nOff = (qx - cx) * nx + (qz - cz) * nz;
      if (Math.abs(nOff) > 1.5 && Math.abs(nOff) < 12.5) offs.push(nOff);
    }
  }
  offs.sort((a, b) => a - b);
  let minN = 0, maxN = 0;
  for (let pass = 0; pass < 4; pass++) {
    for (const o of offs) {
      if (o < minN && minN - o <= 6.2) minN = o;
      if (o > maxN && o - maxN <= 6.2) maxN = o;
    }
  }
  return { minTrackN: minN, maxTrackN: maxN };
}

function emitPlatformDeck(sink, cx, cz, tx, tz, nx, nz, ox, oz, side, nMid, sMin, sMax, yAt, elevated, buildingColliders = null) {
  const nInner = nMid - side * 1.9;
  const nOuter = nMid + side * 1.9;
  const copingInner = nInner - side * 0.06;
  const copingOuter = nInner + side * 0.34;
  const tactA = nInner + side * 0.16;
  const tactB = nInner + side * 0.44;
  const fasciaInner = nInner + side * 0.08;

  let minGroundY = Infinity, minTrackY = Infinity;
  for (const sSample of [sMin, (sMin + sMax) * 0.5, sMax]) {
    const ty = yAt(sSample);
    if (ty < minTrackY) minTrackY = ty;
    for (const nSample of [nInner, nOuter]) {
      const wx = cx + ox + tx * sSample + nx * nSample;
      const wz = cz + oz + tz * sSample + nz * nSample;
      const gy = railGroundY(wx, wz);
      if (gy < minGroundY) minGroundY = gy;
    }
  }
  const bottomY = Math.min(minTrackY, minGroundY) - 0.8;
  const useViaductPiers = elevated && (minTrackY - minGroundY > 2.5);

  const totalL = sMax - sMin;
  const segs = Math.max(1, Math.ceil(totalL / 8.0));
  for (let i = 0; i < segs; i++) {
    const sA = sMin + (totalL * i) / segs;
    const sB = sMin + (totalL * (i + 1)) / segs;
    const yA = yAt(sA), yB = yAt(sB);
    const topA = yA + 1.05, topB = yB + 1.05;

    // Main concrete platform slab + crisp overhanging track-side coping + tactile yellow safety strip
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, copingOuter, nOuter, topA - 0.18, topA, topB - 0.18, topB, C.platFascia, C.platDeck, true);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, copingInner, copingOuter, topA - 0.18, topA, topB - 0.18, topB, C.platCoping, C.platCoping, true);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, tactA, tactB, topA, topA + 0.015, topB, topB + 0.015, C.tactileYellow, C.tactileYellow);

    // Grounded dark concrete fascia (or elevated soffit fascia on tall viaducts)
    const fasBotA = useViaductPiers ? yA - 1.10 : bottomY;
    const fasBotB = useViaductPiers ? yB - 1.10 : bottomY;
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, fasciaInner, nOuter, fasBotA, topA - 0.18, fasBotB, topB - 0.18, C.platFascia, C.platFascia, useViaductPiers);
  }

  if (useViaductPiers) {
    const pierCount = Math.max(2, Math.floor(totalL / 16) + 1);
    for (let k = 0; k < pierCount; k++) {
      const sPier = pierCount === 1 ? 0 : sMin + 4.0 + ((totalL - 8.0) * k) / (pierCount - 1);
      const yP = yAt(sPier);
      const wx = cx + ox + tx * sPier + nx * nMid;
      const wz = cz + oz + tz * sPier + nz * nMid;
      const pierBot = Math.min(bottomY, railGroundY(wx, wz) - 0.8);
      // Cross-beam tying platform soffit to viaduct box girder + grounded pier column & footing
      const tieInner = nMid - side * 2.45;
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sPier - 0.45, sPier + 0.45, tieInner, nMid + side * 1.4, yP - 1.12, yP - 0.40, yP - 1.12, yP - 0.40, C.deckSide, C.deckSide, true);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sPier - 0.55, sPier + 0.55, nMid - 0.65, nMid + 0.65, pierBot, yP - 1.10, pierBot, yP - 1.10, C.pier, C.pier);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sPier - 0.85, sPier + 0.85, nMid - 0.95, nMid + 0.95, pierBot, pierBot + 1.0, pierBot, pierBot + 1.0, C.deckSide, C.deckSide);
    }
  }

  // End safety guardrails at both platform ends
  for (const sEnd of [sMin + 0.14, sMax - 0.14]) {
    const topEnd = yAt(sEnd) + 1.05;
    for (const f of [0.15, 0.5, 0.85]) {
      const nPost = nInner + (nOuter - nInner) * f;
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sEnd - 0.04, sEnd + 0.04, nPost - 0.04, nPost + 0.04, topEnd, topEnd + 0.96, topEnd, topEnd + 0.96, C.steelDark);
    }
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sEnd - 0.04, sEnd + 0.04, nInner + side * 0.35, nOuter - side * 0.25, topEnd + 0.88, topEnd + 0.96, topEnd + 0.88, topEnd + 0.96, C.steelDark);
  }

  if (!useViaductPiers && Array.isArray(buildingColliders)) {
    const nLo = Math.min(copingInner, nOuter);
    const nHi = Math.max(copingInner, nOuter);
    const c0x = cx + tx * sMin + nx * nLo, c0z = cz + tz * sMin + nz * nLo;
    const c1x = cx + tx * sMax + nx * nLo, c1z = cz + tz * sMax + nz * nLo;
    const c2x = cx + tx * sMax + nx * nHi, c2z = cz + tz * sMax + nz * nHi;
    const c3x = cx + tx * sMin + nx * nHi, c3z = cz + tz * sMin + nz * nHi;
    const minX = Math.min(c0x, c1x, c2x, c3x) + ox;
    const maxX = Math.max(c0x, c1x, c2x, c3x) + ox;
    const minZ = Math.min(c0z, c1z, c2z, c3z) + oz;
    const maxZ = Math.max(c0z, c1z, c2z, c3z) + oz;
    const topY = Math.max(yAt(sMin), yAt((sMin + sMax) * 0.5), yAt(sMax)) + 1.05;
    buildingColliders.push({
      minX,
      maxX,
      minZ,
      maxZ,
      h: topY,
      rawH: Math.max(1.2, topY - minGroundY),
      flatOuter: [c0x, c0z, c1x, c1z, c2x, c2z, c3x, c3z],
      ox,
      oz,
      isPlatform: true,
    });
  }
}

function emitPlatformCanopy(sink, cx, cz, tx, tz, nx, nz, side, nMid, sStart, sEnd, yAt, hasOverpass) {
  const span = sEnd - sStart;
  const numBays = Math.max(1, Math.round(span / 8));
  if (numBays < 1 || span < 6.0) return;
  const P = (s, n, y) => [cx + tx * s + nx * n, y, cz + tz * s + nz * n];

  // Y-frame support columns every 8 m
  for (let k = 0; k <= numBays; k++) {
    const sCol = sStart + k * 8;
    if (hasOverpass && Math.abs(sCol) < 0.5) continue;
    const deckY = yAt(sCol) + 1.05;
    const forkY = deckY + 2.48;
    const eaveY = deckY + 3.60;

    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sCol - 0.21, sCol + 0.21, nMid - 0.21, nMid + 0.21, deckY, deckY + 0.26, deckY, deckY + 0.26, C.platFascia);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sCol - 0.13, sCol + 0.13, nMid - 0.13, nMid + 0.13, deckY + 0.24, forkY + 0.08, deckY + 0.24, forkY + 0.08, C.steelDark);
    emitBeam3D(sink, P(sCol, nMid, forkY), P(sCol, nMid - 1.44, eaveY), 0.085, 0.085, C.steelDark);
    emitBeam3D(sink, P(sCol, nMid, forkY), P(sCol, nMid + 1.44, eaveY), 0.085, 0.085, C.steelDark);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sCol - 0.10, sCol + 0.10, nMid - 1.72, nMid + 1.72, eaveY - 0.06, eaveY + 0.08, eaveY - 0.06, eaveY + 0.08, C.steelDark, C.steelDark, true);
  }

  // Canopy roof split into 4 m sub-bays for transverse rafters + slope following
  const subBays = numBays * 2;
  for (let b = 0; b < subBays; b++) {
    const sA = sStart + b * 4;
    const sB = sA + 4;
    const eaveA = yAt(sA) + 1.05 + 3.60;
    const eaveB = yAt(sB) + 1.05 + 3.60;

    // Central dark steel ridge spine
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid - 0.16, nMid + 0.16, eaveA + 0.28, eaveA + 0.44, eaveB + 0.28, eaveB + 0.44, C.steelDark, C.steelDark, true);

    // Twin sloped blue-tinted glass skylight strips + outer aluminum canopy wings + edge fascia/gutters
    for (const sgn of [-1, 1]) {
      emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid + sgn * 0.16, eaveA + 0.36, eaveB + 0.36, nMid + sgn * 1.18, eaveA + 0.16, eaveB + 0.16, 0.055, C.canopyGlass);
      emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid + sgn * 1.18, eaveA + 0.16, eaveB + 0.16, nMid + sgn * 1.80, eaveA + 0.02, eaveB + 0.02, 0.075, C.canopyDeck);
      // Edge fascia trim + longitudinal dark structural purlins
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid + sgn * 1.74, nMid + sgn * 1.82, eaveA - 0.08, eaveA + 0.11, eaveB - 0.08, eaveB + 0.11, C.steelDark, C.steelDark, true);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid + sgn * 0.66, nMid + sgn * 0.74, eaveA + 0.21, eaveA + 0.28, eaveB + 0.21, eaveB + 0.28, C.steelDark, C.steelDark, true);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA, sB, nMid + sgn * 1.15, nMid + sgn * 1.23, eaveA + 0.10, eaveA + 0.18, eaveB + 0.10, eaveB + 0.18, C.steelDark, C.steelDark, true);
      // Warm white under-canopy LED light bar strips
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sA + 0.12, sB - 0.12, nMid + sgn * 0.84, nMid + sgn * 0.98, eaveA + 0.09, eaveA + 0.14, eaveB + 0.09, eaveB + 0.14, C.ledWarm, C.ledWarm, true);
    }

    // Intermediate transverse rafter at sub-bay midpoint (every 4 m)
    const sRaf = sB;
    if (b < subBays - 1 && (!hasOverpass || Math.abs(sRaf) > 1.0)) {
      const eaveR = yAt(sRaf) + 1.05 + 3.60;
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sRaf - 0.06, sRaf + 0.06, nMid - 1.72, nMid + 1.72, eaveR + 0.01, eaveR + 0.12, eaveR + 0.01, eaveR + 0.12, C.steelDark, C.steelDark, true);
    }
  }
}

function emitPlatformFurniture(sink, cx, cz, tx, tz, nx, nz, side, nMid, sStart, sEnd, yAt, hasOverpass) {
  const span = sEnd - sStart;
  const numBays = Math.max(1, Math.round(span / 8));
  if (numBays < 1 || span < 6.0) return;
  const inStairZone = (s) => hasOverpass && s > -2.5 && s < 11.4;

  // Waiting benches (steel frame + warm timber slats) & glass windbreak shelter panels
  for (let b = 0; b < numBays; b++) {
    const sBay = sStart + 4 + b * 8;
    for (const sBench of [sBay - 1.9, sBay + 1.9]) {
      if (inStairZone(sBench)) continue;
      const deckY = yAt(sBench) + 1.05;
      const nB = nMid + side * 0.65;
      for (const sLeg of [sBench - 0.95, sBench + 0.95]) {
        emitPrismST(sink, cx, cz, tx, tz, nx, nz, sLeg - 0.05, sLeg + 0.05, nB - 0.28, nB + 0.28, deckY, deckY + 0.45, deckY, deckY + 0.45, C.steelDark);
      }
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sBench - 1.15, sBench + 1.15, nB - 0.28, nB + 0.26, deckY + 0.43, deckY + 0.50, deckY + 0.43, deckY + 0.50, C.timber, C.timber, true);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sBench - 1.15, sBench + 1.15, nB + side * 0.19, nB + side * 0.27, deckY + 0.54, deckY + 0.90, deckY + 0.54, deckY + 0.90, C.timber);
    }

    if (b % 2 === 0 && !inStairZone(sBay)) {
      const deckY = yAt(sBay) + 1.05;
      const nW = nMid + side * 1.48;
      // Glass windbreak shelter panel
      for (const sPost of [sBay - 1.6, sBay, sBay + 1.6]) {
        emitPrismST(sink, cx, cz, tx, tz, nx, nz, sPost - 0.05, sPost + 0.05, nW - 0.06, nW + 0.06, deckY, deckY + 2.12, deckY, deckY + 2.12, C.steelDark);
      }
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sBay - 1.62, sBay + 1.62, nW - 0.05, nW + 0.05, deckY + 2.04, deckY + 2.14, deckY + 2.04, deckY + 2.14, C.steelDark);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sBay - 1.62, sBay + 1.62, nW - 0.05, nW + 0.05, deckY + 0.18, deckY + 0.26, deckY + 0.18, deckY + 0.26, C.steelDark);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sBay - 1.56, sBay + 1.56, nW - 0.03, nW + 0.03, deckY + 0.26, deckY + 2.04, deckY + 0.26, deckY + 2.04, C.canopyGlass);
    }
  }

  // Blue/white overhead departure signboards suspended under the canopy
  const midS = (sStart + sEnd) * 0.5;
  const signPositions = span >= 32 ? [sStart + 6, sEnd - 6] : [midS];
  for (const sSign of signPositions) {
    if (hasOverpass && Math.abs(sSign) < 2.5) continue;
    const deckY = yAt(sSign) + 1.05;
    const nS = nMid - side * 0.35;
    for (const sRod of [sSign - 0.72, sSign + 0.72]) {
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sRod - 0.03, sRod + 0.03, nS - 0.03, nS + 0.03, deckY + 3.04, deckY + 3.68, deckY + 3.04, deckY + 3.68, C.steelDark);
    }
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sSign - 0.96, sSign + 0.96, nS - 0.08, nS + 0.08, deckY + 2.52, deckY + 3.06, deckY + 2.52, deckY + 3.06, C.signBlue);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sSign - 0.88, sSign + 0.88, nS - 0.095, nS + 0.095, deckY + 2.58, deckY + 2.92, deckY + 2.58, deckY + 2.92, C.signFace);
  }
}

function emitStationOverpass(sink, cx, cz, tx, tz, nx, nz, leftMid, rightMid, yAt) {
  const trackY0 = yAt(0);
  const floorY = trackY0 + 5.6;
  const roofY = floorY + 2.82;
  const spanLeft = leftMid - 1.35;
  const spanRight = rightMid + 1.35;
  const P = (s, n, y) => [cx + tx * s + nx * n, y, cz + tz * s + nz * n];

  // Bridge deck slab + dark steel side box girders
  emitPrismST(sink, cx, cz, tx, tz, nx, nz, -1.72, 1.72, spanLeft, spanRight, floorY - 0.38, floorY, floorY - 0.38, floorY, C.steelDark, C.platDeck, true);

  // Glazed concourse side walls + vertical mullions
  for (const sWall of [-1.64, 1.64]) {
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sWall - 0.07, sWall + 0.07, spanLeft, spanRight, floorY, floorY + 0.42, floorY, floorY + 0.42, C.steelDark);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sWall - 0.04, sWall + 0.04, spanLeft, spanRight, floorY + 0.42, roofY - 0.22, floorY + 0.42, roofY - 0.22, C.canopyGlass);
    emitPrismST(sink, cx, cz, tx, tz, nx, nz, sWall - 0.08, sWall + 0.08, spanLeft, spanRight, roofY - 0.22, roofY, roofY - 0.22, roofY, C.steelDark);
  }
  const mullionCount = Math.max(4, Math.round((spanRight - spanLeft) / 1.9));
  for (let m = 0; m <= mullionCount; m++) {
    const nM = spanLeft + ((spanRight - spanLeft) * m) / mullionCount;
    for (const sWall of [-1.64, 1.64]) {
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sWall - 0.07, sWall + 0.07, nM - 0.06, nM + 0.06, floorY + 0.40, roofY - 0.20, floorY + 0.40, roofY - 0.20, C.steelDark);
    }
  }

  // Covered concourse roof with central glass skylight strip
  emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, -1.86, -0.55, spanLeft - 0.15, roofY, roofY + 0.22, spanRight + 0.15, roofY, roofY + 0.22, 0.08, C.canopyDeck);
  emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, -0.55, 0.55, spanLeft - 0.15, roofY + 0.22, roofY + 0.22, spanRight + 0.15, roofY + 0.22, roofY + 0.22, 0.07, C.canopyGlass);
  emitSlopedPanelST(sink, cx, cz, tx, tz, nx, nz, 0.55, 1.86, spanLeft - 0.15, roofY + 0.22, roofY, spanRight + 0.15, roofY + 0.22, roofY, 0.08, C.canopyDeck);

  // Support portal columns & access stairways down to both platforms
  for (const [side, nMid] of [[-1, leftMid], [1, rightMid]]) {
    const deckY0 = yAt(0) + 1.05;
    for (const sCol of [-1.60, 1.60]) {
      for (const nCol of [nMid - 1.32, nMid + 1.32]) {
        emitPrismST(sink, cx, cz, tx, tz, nx, nz, sCol - 0.15, sCol + 0.15, nCol - 0.15, nCol + 0.15, deckY0, roofY, deckY0, roofY, C.steelDark);
      }
    }
    const nStair0 = nMid + side * 0.05;
    const nStair1 = nMid + side * 1.45;
    const nLo = Math.min(nStair0, nStair1), nHi = Math.max(nStair0, nStair1);
    const sTop = 1.72, sBot = 10.52;
    const deckBotY = yAt(sBot) + 1.05;
    const steps = 14;
    for (let stIdx = 0; stIdx < steps; stIdx++) {
      const f0 = stIdx / steps, f1 = (stIdx + 1) / steps;
      const sa = sTop + (sBot - sTop) * f0;
      const sb = sTop + (sBot - sTop) * f1;
      const stepTop = floorY + (deckBotY - floorY) * f0;
      const stepBot = Math.max(deckBotY, stepTop - 0.42);
      emitPrismST(sink, cx, cz, tx, tz, nx, nz, sa, sb, nLo + 0.06, nHi - 0.06, stepBot, stepTop, stepBot, stepTop, C.stairStep, C.platCoping, true);
    }
    // Stair stringer beams + elevated handrails
    for (const nEdge of [nLo + 0.04, nHi - 0.04]) {
      emitBeam3D(sink, P(sTop, nEdge, floorY - 0.18), P(sBot, nEdge, deckBotY + 0.08), 0.08, 0.16, C.steelDark);
      emitBeam3D(sink, P(sTop, nEdge, floorY + 0.96), P(sBot, nEdge, deckBotY + 0.96), 0.045, 0.045, C.steelDark);
      for (let b = 0; b <= 4; b++) {
        const f = b / 4;
        const sPost = sTop + (sBot - sTop) * f;
        const yPost = floorY + (deckBotY - floorY) * f;
        emitPrismST(sink, cx, cz, tx, tz, nx, nz, sPost - 0.035, sPost + 0.035, nEdge - 0.035, nEdge + 0.035, yPost, yPost + 0.96, yPost, yPost + 0.96, C.steelDark);
      }
    }
  }
}

function pointInRing2D(px, pz, flat) {
  let inside = false;
  const n = flat.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const zi = flat[i + 1], zj = flat[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((flat[j] - flat[i]) * (pz - zi)) / (zj - zi + 1e-12) + flat[i]) {
      inside = !inside;
    }
  }
  return inside;
}

function dist2PointToPoly(px, pz, flat) {
  let best = Infinity;
  const n = flat.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = flat[j], az = flat[j + 1];
    const dx = flat[i] - ax, dz = flat[i + 1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = ax + dx * t - px, qz = az + dz * t - pz;
    const d2 = qx * qx + qz * qz;
    if (d2 < best) best = d2;
  }
  return best;
}

function makeObstacleIndex(ox, oz, roadSegments, buildingColliders, buildingFootprints) {
  const CELL = 24.0;
  const key = (gx, gz) => ((gx + 2048) << 12) | (gz + 2048);
  const bGrid = new Map();
  const rGrid = new Map();
  const bSrc = buildingFootprints && buildingFootprints.length ? buildingFootprints : buildingColliders;

  const insertBox = (grid, minX, minZ, maxX, maxZ, item) => {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = key(gx, gz);
        let list = grid.get(k);
        if (!list) { list = []; grid.set(k, list); }
        list.push(item);
      }
    }
  };

  if (bSrc && bSrc.length) {
    for (let i = 0; i < bSrc.length; i++) {
      const b = bSrc[i];
      if (!b || b.isPlatform || (b.minH != null && b.minH > 2.0)) continue;
      const minX = b.minX - ox, maxX = b.maxX - ox;
      const minZ = b.minZ - oz, maxZ = b.maxZ - oz;
      if (maxX < -540 || minX > 540 || maxZ < -540 || minZ > 540) continue;
      const item = { minX, maxX, minZ, maxZ, flat: b.flatOuter || null };
      insertBox(bGrid, minX - 1.0, minZ - 1.0, maxX + 1.0, maxZ + 1.0, item);
    }
  }

  if (roadSegments && roadSegments.length) {
    for (let i = 0; i < roadSegments.length; i++) {
      const s = roadSegments[i];
      if (!s || s.bridge || s.tunnel) continue;
      const ax = s.x1 - ox, az = s.z1 - oz;
      const bx = s.x2 - ox, bz = s.z2 - oz;
      const hw = (s.width || 6) * 0.5;
      const pad = hw + 2.0;
      const minX = Math.min(ax, bx) - pad, maxX = Math.max(ax, bx) + pad;
      const minZ = Math.min(az, bz) - pad, maxZ = Math.max(az, bz) + pad;
      if (maxX < -540 || minX > 540 || maxZ < -540 || minZ > 540) continue;
      insertBox(rGrid, minX, minZ, maxX, maxZ, { ax, az, bx, bz, hw });
    }
  }

  const hitsBuilding = (lx, lz, margin = 0.6) => {
    const gx = Math.floor(lx / CELL), gz = Math.floor(lz / CELL);
    const m2 = margin * margin;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = bGrid.get(key(gx + dx, gz + dz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (lx < b.minX - margin || lx > b.maxX + margin || lz < b.minZ - margin || lz > b.maxZ + margin) continue;
          if (!b.flat || b.flat.length < 6) return true;
          if (pointInRing2D(lx, lz, b.flat) || dist2PointToPoly(lx, lz, b.flat) < m2) return true;
        }
      }
    }
    return false;
  };

  const hitsRoad = (lx, lz, extra = 1.5) => {
    const gx = Math.floor(lx / CELL), gz = Math.floor(lz / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = rGrid.get(key(gx + dx, gz + dz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          const lim = r.hw + extra;
          if (lx < Math.min(r.ax, r.bx) - lim || lx > Math.max(r.ax, r.bx) + lim || lz < Math.min(r.az, r.bz) - lim || lz > Math.max(r.az, r.bz) + lim) continue;
          const rdx = r.bx - r.ax, rdz = r.bz - r.az;
          const l2 = rdx * rdx + rdz * rdz;
          let t = l2 > 1e-6 ? ((lx - r.ax) * rdx + (lz - r.az) * rdz) / l2 : 0;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const qx = r.ax + rdx * t - lx, qz = r.az + rdz * t - lz;
          if (qx * qx + qz * qz < lim * lim) return true;
        }
      }
    }
    return false;
  };

  return { hitsBuilding, hitsRoad };
}

function buildStationPlatforms(sink, stops, stationTracks, tunnelEnds, ox, oz, inChunk, roadSegments = null, buildingColliders = null, buildingFootprints = null) {
  if (!stops || !stops.length || !stationTracks.length) return;
  const candidates = stops
    .filter((s) => s && s[2] === 1 && Number.isFinite(s[0]) && Number.isFinite(s[1]) && inChunk(s[0], s[1]))
    .sort((a, b) => (b[3] ? 1 : 0) - (a[3] ? 1 : 0));

  const obs = makeObstacleIndex(ox, oz, roadSegments, buildingColliders, buildingFootprints);
  const placed = [];
  const SNAP_R2 = 35 * 35;
  const DEDUP_R2 = 85 * 85;

  for (const s of candidates) {
    const sx = s[0], sz = s[1];
    let best = null, bestD2 = SNAP_R2;
    for (const tr of stationTracks) {
      for (let i = 0; i < tr.xs.length - 1; i++) {
        const ax = tr.xs[i], az = tr.zs[i], bx = tr.xs[i + 1], bz = tr.zs[i + 1];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 0.0025) continue;
        let u = ((sx - ax) * dx + (sz - az) * dz) / l2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const px = ax + dx * u, pz = az + dz * u;
        const d2 = (sx - px) * (sx - px) + (sz - pz) * (sz - pz);
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = { tr, i, u, px, pz, dx, dz, l2 };
        }
      }
    }
    if (!best) continue;

    const segL = Math.sqrt(best.l2);
    const tx = best.dx / segL, tz = best.dz / segL;
    const nx = -tz, nz = tx;
    const { tr, i, u } = best;
    const slope = Math.abs(tr.ys[i + 1] - tr.ys[i]) / segL;
    const trackY = tr.ys[i] + (tr.ys[i + 1] - tr.ys[i]) * u;
    if (slope > 0.14 || !Number.isFinite(trackY)) continue;

    let dup = false;
    for (const p0 of placed) {
      const dxp = best.px - p0.x, dzp = best.pz - p0.z;
      if (dxp * dxp + dzp * dzp < DEDUP_R2) { dup = true; break; }
    }
    if (dup) continue;

    const span = traceStationSpan(stationTracks, best, tx, tz, nx, nz, trackY, tunnelEnds);
    const totalLen = span.sMax - span.sMin;
    if (totalLen < 16.0) continue;

    const midS = (span.sMin + span.sMax) * 0.5;
    const cx = best.px + tx * midS, cz = best.pz + tz * midS;
    const halfLen = totalLen * 0.5;
    const yAt = (sLocal) => sampleElevationProfile(span.samples, sLocal + midS);

    const elevated = tr.br && (tr.es[i] > 1.8 || tr.es[i + 1] > 1.8);
    const trackHalfW = elevated ? 2.55 : 2.2;
    const { minTrackN, maxTrackN } = findCorridorTrackExtent(stationTracks, cx, cz, tx, tz, nx, nz, yAt(0));
    const leftMid = minTrackN - (trackHalfW + 2.3);
    const rightMid = maxTrackN + (trackHalfW + 2.3);

    const numBays = Math.max(2, Math.min(6, Math.floor((totalLen - 2) / 8)));
    const canopyHalf = numBays * 4;

    const sideBounds = new Map();
    const isBlockedAt = (sLocal, nVal, checkRoad) => {
      const lx = cx + tx * sLocal + nx * nVal;
      const lz = cz + tz * sLocal + nz * nVal;
      if (obs.hitsBuilding(lx, lz, 0.6)) return true;
      if (checkRoad && obs.hitsRoad(lx, lz, 1.5)) return true;
      return false;
    };

    for (const [side, nMid] of [[-1, leftMid], [1, rightMid]]) {
      const nInner = nMid - side * 1.9;
      const nOuter = nMid + side * 1.9;
      const nSamples = [nInner, nMid, nOuter];
      const nSteps = Math.max(8, Math.ceil(totalLen / 1.5));
      const ds = totalLen / nSteps;
      let bestStart = 0, bestEnd = -1, bestLen = 0;
      let runStart = null;
      for (let k = 0; k <= nSteps; k++) {
        const sLocal = -halfLen + k * ds;
        const checkRoad = !elevated || (yAt(sLocal) - railGroundY(cx + ox + tx * sLocal + nx * nMid, cz + oz + tz * sLocal + nz * nMid) < 4.5);
        let blocked = false;
        for (let m = 0; m < nSamples.length; m++) {
          if (isBlockedAt(sLocal, nSamples[m], checkRoad)) { blocked = true; break; }
        }
        if (!blocked) {
          if (runStart === null) runStart = sLocal;
          const runLen = sLocal - runStart;
          if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; bestEnd = sLocal; }
        } else {
          runStart = null;
        }
      }
      if (bestLen >= 12.0) {
        sideBounds.set(side, { nMid, sMinSide: bestStart, sMaxSide: bestEnd });
      }
    }

    if (sideBounds.size === 0) continue;

    let hasOverpass = tr.k === 'rail' && numBays >= 4 && totalLen >= 36 && sideBounds.has(-1) && sideBounds.has(1);
    if (hasOverpass) {
      const bL = sideBounds.get(-1), bR = sideBounds.get(1);
      if (bL.sMinSide > -2.2 || bL.sMaxSide < 11.0 || bR.sMinSide > -2.2 || bR.sMaxSide < 11.0) {
        hasOverpass = false;
      } else {
        // Verify overpass bridge deck & stairway landings (sTop=1.72..sBot=10.52) do not hit buildings or roads
        for (let nVal = leftMid - 1.5; nVal <= rightMid + 1.5 && hasOverpass; nVal += 2.0) {
          for (const sVal of [-1.86, 0.0, 1.86]) {
            if (isBlockedAt(sVal, nVal, !elevated)) { hasOverpass = false; break; }
          }
        }
        for (const [side, nMid] of [[-1, leftMid], [1, rightMid]]) {
          if (!hasOverpass) break;
          const nA = nMid + side * 0.05, nB = nMid + side * 1.45;
          for (let sVal = 1.72; sVal <= 10.6; sVal += 1.8) {
            const checkRoad = !elevated || (yAt(sVal) - railGroundY(cx + ox + tx * sVal + nx * nMid, cz + oz + tz * sVal + nz * nMid) < 4.5);
            if (isBlockedAt(sVal, nA, checkRoad) || isBlockedAt(sVal, nB, checkRoad)) {
              hasOverpass = false;
              break;
            }
          }
        }
      }
    }

    for (const [side, info] of sideBounds.entries()) {
      const { nMid, sMinSide, sMaxSide } = info;
      emitPlatformDeck(sink, cx, cz, tx, tz, nx, nz, ox, oz, side, nMid, sMinSide, sMaxSide, yAt, elevated, buildingColliders);

      let canopyS0, canopyS1;
      if (hasOverpass) {
        canopyS0 = Math.max(-canopyHalf, Math.ceil(sMinSide / 8) * 8);
        canopyS1 = Math.min(canopyHalf, Math.floor(sMaxSide / 8) * 8);
      } else {
        const sideLen = sMaxSide - sMinSide;
        const sideBays = Math.max(1, Math.min(6, Math.floor((sideLen - 1.0) / 8)));
        const sideMid = (sMinSide + sMaxSide) * 0.5;
        canopyS0 = sideMid - sideBays * 4;
        canopyS1 = sideMid + sideBays * 4;
      }
      if (canopyS1 - canopyS0 >= 8.0) {
        emitPlatformCanopy(sink, cx, cz, tx, tz, nx, nz, side, nMid, canopyS0, canopyS1, yAt, hasOverpass);
        emitPlatformFurniture(sink, cx, cz, tx, tz, nx, nz, side, nMid, canopyS0, canopyS1, yAt, hasOverpass);
      }
    }

    if (hasOverpass) {
      emitStationOverpass(sink, cx, cz, tx, tz, nx, nz, leftMid, rightMid, yAt);
    }

    placed.push({ x: best.px, z: best.pz });
  }
}
