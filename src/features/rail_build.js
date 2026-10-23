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
    for (let i = 0; i < e.length; i++) {
      const y = Y[I.v[i]];
      if (y > I.g[i] + e[i] + 0.01) e[i] = y - I.g[i];
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
  pole: [0.22, 0.24, 0.24], wire: [0.10, 0.10, 0.10],
  portal: [0.52, 0.51, 0.48], portalDark: [0.03, 0.03, 0.04],
  tower: [0.45, 0.47, 0.50], station: [0.62, 0.60, 0.56], cable: [0.08, 0.08, 0.08],
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
export function buildRailTrack(rail, ox, oz, group, mats, roadSegments) {
  const out = { lines: [], stops: [] };
  if (!rail || !rail.lines) return out;
  const lines = rail.lines.map(densifyLine); // [rail-road-clearance] crossing raises / caps act locally
  const elev = computeElevations(lines);
  const roadAt = makeRoadLookup(roadSegments);
  const sink = new GeoSink();
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
      const elevated = d.es[i] > 2 || d.es[i + 1] > 2;

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
          strip(i, -2.7, bedY, 2.7, bedY, C.deck);
          strip(i, -2.7, -1.1, -2.7, bedY, C.deckSide);
          strip(i, 2.7, bedY, 2.7, -1.1, C.deckSide);
          strip(i, 2.7, -1.1, -2.7, -1.1, C.deckUnder);
          strip(i, -2.7, bedY, -2.7, bedY + 0.9, C.deckSide); // parapets
          strip(i, 2.7, bedY + 0.9, 2.7, bedY, C.deckSide);
          strip(i, -1.6, bedY + 0.02, 1.6, bedY + 0.02, C.ballast);
          while (nextPier <= d.ss[i + 1]) {
            const u = (nextPier - d.ss[i]) / segL;
            const px = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * u, pz = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * u;
            const py = ys[i] + (ys[i + 1] - ys[i]) * u;
            const gy = railGroundY(px, pz) - 0.6;
            if (py - 1.1 - gy > 1.5) sink.box(px - ox, pz - oz, gy, py - 1.1, txs[i], tzs[i], 0.7, 0.9, C.pier);
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
          if (l.svc || l.k === 'rail') continue; // web side only where it is seen close up (triangle budget)
          strip(i, o - sgn * 0.04, bedY + 0.12, o - sgn * 0.04, RAIL_TOP, C.railSide);
        }
      }

      if (catenary) {
        const top = st ? 0 : RAIL_TOP;
        strip(i, -0.025, top + 5.6, 0.025, top + 5.6, C.wire);
        strip(i, 0, top + 5.57, 0, top + 5.63, C.wire);
        if (!st) strip(i, 0, top + 6.5, 0, top + 6.56, C.wire);
        while (nextPole <= d.ss[i + 1]) {
          if (nextPole >= d.ss[i]) {
            const u = (nextPole - d.ss[i]) / segL;
            const side = st ? 4.6 : 3.0;
            const px = d.xs[i] + (d.xs[i + 1] - d.xs[i]) * u + nxs[i] * side;
            const pz = d.zs[i] + (d.zs[i + 1] - d.zs[i]) * u + nzs[i] * side;
            const py = ys[i] + (ys[i + 1] - ys[i]) * u;
            sink.box(px - ox, pz - oz, py - 0.3, py + top + 7.0, txs[i], tzs[i], 0.12, 0.12, C.pole);
            const ax = px - nxs[i] * (side / 2 + 0.1), az = pz - nzs[i] * (side / 2 + 0.1);
            sink.box(ax - ox, az - oz, py + top + 6.15, py + top + 6.3, nzs[i], -nxs[i], side / 2 + 0.15, 0.05, C.pole);
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
