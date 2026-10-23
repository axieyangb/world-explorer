/**
 * [feature/ferries-ships] Small geometry helpers shared by piers, ferries and ships.
 * World coords: x east, z south, metres from the world origin (same as global_tiles.js).
 */
import { tileLocalToLatLon } from '../../global_tiles.js';

export function llToWorld(o, lat, lon) {
  return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
}

export function worldToLl(o, x, z) {
  return [o.centerLat - z / o.mPerDegLat, o.centerLon + x / o.mPerDegLon];
}

/** World-space box [minX, minZ, maxX, maxZ] of a slippy tile. */
export function tileBoxWorld(o, z, tx, ty) {
  const [la0, lo0] = tileLocalToLatLon(z, tx, ty, 0, 0);
  const [la1, lo1] = tileLocalToLatLon(z, tx, ty, 4096, 4096);
  const [x0, z0] = llToWorld(o, la0, lo0);
  const [x1, z1] = llToWorld(o, la1, lo1);
  return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)];
}

/** Sutherland-Hodgman clip of a closed ring [[x,z],...] to an axis-aligned box. */
export function clipRing(pts, b) {
  const edges = [
    (p) => p[0] >= b[0], (p) => p[0] <= b[2], (p) => p[1] >= b[1], (p) => p[1] <= b[3],
  ];
  const cut = [
    (a, c) => { const t = (b[0] - a[0]) / (c[0] - a[0]); return [b[0], a[1] + (c[1] - a[1]) * t]; },
    (a, c) => { const t = (b[2] - a[0]) / (c[0] - a[0]); return [b[2], a[1] + (c[1] - a[1]) * t]; },
    (a, c) => { const t = (b[1] - a[1]) / (c[1] - a[1]); return [a[0] + (c[0] - a[0]) * t, b[1]]; },
    (a, c) => { const t = (b[3] - a[1]) / (c[1] - a[1]); return [a[0] + (c[0] - a[0]) * t, b[3]]; },
  ];
  let out = pts;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) {
        if (!pi) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cut[e](prev, cur));
      }
    }
  }
  return out.length >= 3 ? out : null;
}

/** Clips an open polyline to a box; returns a list of pieces (each >= 2 points). */
export function clipLine(pts, b) {
  const inside = (p) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
  const pieces = [];
  let cur = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (inside(p)) {
      if (!cur) {
        cur = [];
        if (i > 0) cur.push(edgeCross(pts[i - 1], p, b));
      }
      cur.push(p);
    } else if (cur) {
      cur.push(edgeCross(p, pts[i - 1], b));
      if (cur.length >= 2) pieces.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length >= 2) pieces.push(cur);
  return pieces;
}

// Point where the segment from outside point `a` to inside point `c` crosses the box.
function edgeCross(a, c, b) {
  let t = 0;
  const dx = c[0] - a[0], dz = c[1] - a[1];
  if (a[0] < b[0] && dx) t = Math.max(t, (b[0] - a[0]) / dx);
  if (a[0] > b[2] && dx) t = Math.max(t, (b[2] - a[0]) / dx);
  if (a[1] < b[1] && dz) t = Math.max(t, (b[1] - a[1]) / dz);
  if (a[1] > b[3] && dz) t = Math.max(t, (b[3] - a[1]) / dz);
  return [a[0] + dx * t, a[1] + dz * t];
}

export function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a * 0.5;
}

export function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const zi = pts[i][1], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < pts[i][0] + ((z - zi) * (pts[j][0] - pts[i][0])) / (zj - zi)) inside = !inside;
  }
  return inside;
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Cumulative distances for a polyline. */
export function cumulative(pts) {
  const d = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) d[i] = d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

/** Position + unit tangent at distance s along a polyline (binary search on cumulative). */
export function sampleAlong(pts, cum, s, out) {
  const n = pts.length;
  if (s <= 0) s = 0;
  const L = cum[n - 1];
  if (s >= L) s = L;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m; else hi = m;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  const a = pts[lo], b = pts[hi];
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  out.dx = (b[0] - a[0]) / seg;
  out.dz = (b[1] - a[1]) / seg;
  return out;
}

/** Chaikin corner cutting (keeps the endpoints). */
export function chaikin(pts, iters = 2) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
