// Worker-safe lane-graph builder for AI traffic & pedestrians (no THREE dependency).
// Turns a chunk's world-space road sub-segments into a compact polyline graph:
// nodes = intersections / dead ends / chunk-border ends, edges = polylines between them.

// Class codes: 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary, 5 residential,
// 6 service/other, 7 *_link, 8 footway/pedestrian/path, 9 cycleway (ignored).
const CLS_CODE = {
  motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4,
  residential: 5, unclassified: 5, living_street: 5, minor: 5, street: 5,
  service: 6, track: 6,
  footway: 8, path: 8, pedestrian: 8, steps: 8,
  cycleway: 9,
};

export function trafficClassCode(cls) {
  const c = String(cls || '');
  if (c in CLS_CODE) return CLS_CODE[c];
  if (c.endsWith('_link')) return 7;
  return 6;
}

export function buildTrafficGraph(segs, signalNodes, ox = 0, oz = 0) {
  const nx = [], ny = [], nz = [];
  const cell = new Map();
  const nodeSegs = [];
  const find = (x, y, z) => {
    const qx = Math.round(x * 2), qz = Math.round(z * 2);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const l = cell.get((qx + i) * 100003 + (qz + j));
        if (!l) continue;
        for (const n of l) {
          if (Math.abs(nx[n] - x) < 0.3 && Math.abs(nz[n] - z) < 0.3 && Math.abs(ny[n] - y) < 2.5) return n;
        }
      }
    }
    const n = nx.length;
    nx.push(x); ny.push(y); nz.push(z); nodeSegs.push([]);
    const k = qx * 100003 + qz;
    const l = cell.get(k);
    if (l) l.push(n); else cell.set(k, [n]);
    return n;
  };

  const sA = [], sB = [], sSig = [], sMeta = [];
  for (const s of segs || []) {
    const code = trafficClassCode(s.cls);
    if (code === 9 || s.tunnel) continue;
    const a = find(s.x1, s.y1, s.z1);
    const b = find(s.x2, s.y2, s.z2);
    if (a === b) continue;
    const i = sA.length;
    sA.push(a); sB.push(b);
    const lanes = Math.max(1, Math.min(6, s.lanes | 0 || 1));
    const width = Math.max(2, Number(s.width) || 5);
    const oneway = (s.oneway ? 1 : 0) | (s.bridge ? 2 : 0);
    sMeta.push([code, lanes, oneway, width]);
    sSig.push(`${code}|${lanes}|${oneway}|${width}|${s.id}`);
    nodeSegs[a].push(i);
    nodeSegs[b].push(i);
  }

  // Signalized intersections: exactly the ones feature/street renders lights at (shared keys).
  // signalNodes = street payload Float32Array [x, z, R, stopDist]* in chunk-local meters.
  // Every degree>=3 graph node inside the street intersection radius gets the street node's key, and a
  // stop distance so cars halt just behind the painted stop line. No street lights -> no signals.
  const N = nx.length;
  const sigKey = new Array(N).fill(null);
  const sigStop = new Float32Array(N).fill(-1);
  const sn = signalNodes || [];
  for (let k = 0; k + 3 < sn.length; k += 4) {
    const wx = ox + sn[k], wz = oz + sn[k + 1];
    const R = Math.max(3, sn[k + 2]), stop = sn[k + 3];
    const key = `${Math.round(wx)},${Math.round(wz)}`;
    let best = -1, bd = Infinity;
    for (let n = 0; n < N; n++) {
      if (nodeSegs[n].length < 3) continue;
      const d = Math.hypot(nx[n] - wx, nz[n] - wz);
      if (d < bd) { bd = d; best = n; }
      if (d > R) continue;
      sigKey[n] = key;
      sigStop[n] = Math.max(2, stop - d);
    }
    if (best >= 0 && sigKey[best] === null && bd < R + 4) { sigKey[best] = key; sigStop[best] = Math.max(2, stop - bd); }
  }

  const isBreak = (n) => {
    const l = nodeSegs[n];
    return l.length !== 2 || sigKey[n] !== null || sSig[l[0]] !== sSig[l[1]];
  };

  const remap = new Int32Array(N).fill(-1);
  const outNodes = [];
  const mapNode = (n) => {
    if (remap[n] < 0) { remap[n] = outNodes.length; outNodes.push(n); }
    return remap[n];
  };

  const visited = new Uint8Array(sA.length);
  const eA = [], eB = [], eMeta = [], ptOff = [0], pts = [];
  const walk = (start, firstSeg) => {
    const chain = [start];
    let cur = start, seg = firstSeg, fwdCount = 0;
    for (;;) {
      visited[seg] = 1;
      const next = sA[seg] === cur ? sB[seg] : sA[seg];
      if (sA[seg] === cur) fwdCount++; else fwdCount--;
      chain.push(next);
      if (next === start || isBreak(next)) break;
      const l = nodeSegs[next];
      const ns = l[0] === seg ? l[1] : l[0];
      if (visited[ns]) break;
      cur = next; seg = ns;
    }
    const meta = sMeta[firstSeg];
    if (meta[2] && fwdCount < 0) chain.reverse();
    eA.push(mapNode(chain[0]));
    eB.push(mapNode(chain[chain.length - 1]));
    eMeta.push(meta);
    for (const n of chain) pts.push(nx[n], ny[n], nz[n]);
    ptOff.push(pts.length / 3);
  };
  for (let n = 0; n < N; n++) {
    if (!isBreak(n)) continue;
    for (const si of nodeSegs[n]) if (!visited[si]) walk(n, si);
  }
  for (let si = 0; si < sA.length; si++) if (!visited[si]) walk(sA[si], si);

  const M = outNodes.length, E = eA.length;
  const nodes = new Float32Array(M * 3);
  const sigKeys = [];
  for (let i = 0; i < M; i++) {
    const n = outNodes[i];
    nodes[i * 3] = nx[n]; nodes[i * 3 + 1] = ny[n]; nodes[i * 3 + 2] = nz[n];
    if (sigKey[n] !== null) sigKeys.push([i, sigKey[n], sigStop[n]]);
  }
  const eCls = new Uint8Array(E), eLanes = new Uint8Array(E), eOneway = new Uint8Array(E);
  const eWidth = new Float32Array(E);
  for (let i = 0; i < E; i++) {
    eCls[i] = eMeta[i][0]; eLanes[i] = eMeta[i][1]; eOneway[i] = eMeta[i][2]; eWidth[i] = eMeta[i][3];
  }
  return {
    nodes,
    sigKeys,
    eA: Uint32Array.from(eA),
    eB: Uint32Array.from(eB),
    eCls, eLanes, eOneway, eWidth,
    ptOff: Uint32Array.from(ptOff),
    pts: Float32Array.from(pts),
  };
}

export function trafficGraphBuffers(g) {
  if (!g) return [];
  return [g.nodes, g.eA, g.eB, g.eCls, g.eLanes, g.eOneway, g.eWidth, g.ptOff, g.pts].map((a) => a.buffer);
}

// Left-hand traffic regions (coarse lat/lon boxes).
const LHT_BOXES = [
  [49.8, 61.0, -11.0, 2.0],    // UK
  [51.3, 55.5, -10.7, -5.9],   // Ireland
  [30.9, 41.6, 129.5, 142.2],  // Japan (Honshu/Kyushu/Shikoku)
  [41.3, 45.6, 139.3, 146.0],  // Japan (Hokkaido)
  [24.0, 28.5, 122.9, 131.4],  // Japan (Okinawa)
  [22.1, 22.6, 113.8, 114.5],  // Hong Kong
  [22.05, 22.22, 113.52, 113.6], // Macau
  [-44.0, -10.0, 112.0, 154.0], // Australia
  [-47.5, -34.0, 166.0, 179.0], // New Zealand
  [6.0, 35.5, 68.0, 89.0],     // India
  [5.9, 9.9, 79.5, 82.0],      // Sri Lanka
  [20.5, 26.7, 88.0, 92.7],    // Bangladesh
  [26.3, 30.5, 80.0, 88.2],    // Nepal
  [23.5, 37.0, 60.8, 77.8],    // Pakistan
  [5.6, 20.5, 97.3, 102.0],    // Thailand
  [0.8, 7.5, 99.5, 119.5],     // Malaysia (+Borneo)
  [1.15, 1.5, 103.6, 104.1],   // Singapore
  [-11.0, 6.0, 95.0, 141.0],   // Indonesia
  [-35.0, -22.0, 16.0, 33.0],  // South Africa
  [-27.0, -15.5, 19.9, 33.0],  // Botswana/Zimbabwe
  [-12.0, 5.0, 33.9, 41.9],    // Kenya/Tanzania/Uganda
  [17.7, 18.6, -78.4, -76.2],  // Jamaica
];

export function isLeftHandTraffic(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  for (const [a, b, c, d] of LHT_BOXES) {
    if (lat >= a && lat <= b && lon >= c && lon <= d) return true;
  }
  return false;
}
