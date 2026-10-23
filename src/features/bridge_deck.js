/**
 * Bridge deck fill: OSM often maps one wide bridge as several narrow parallel ways (carriageways,
 * sidewalks, cycle tracks) at slightly different heights, leaving visual and physical gaps between
 * them (cars fell into the river between the ways of Pont d'Iena). For every pair of parallel bridge
 * ways that overlap along their length, sit at a similar height and leave an edge gap <= MAX_GAP,
 * emit a deck strip that fills the gap (rendered) and a synthetic deck segment (physics only, never
 * seen by traffic/navigation). Worker-safe: no THREE / DOM.
 */

const MAX_GAP = 18.0;     // edge-to-edge metres
const MAX_OFFSET = 26.0;  // centre-to-centre metres
const MAX_DY = 1.2;       // similar deck height
const MIN_DOT = 0.94;     // ~20 degrees
const HCELL = 40.0;
const DECK_RGB = [0.46, 0.47, 0.5];

export function buildBridgeDecks(roadSegments, ox, oz) {
  const br = [];
  for (const s of roadSegments) {
    if (!s.bridge || s.tunnel) continue;
    const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (L >= 2) br.push({ s, L });
  }
  const segs = [], pos = [], col = [];
  if (br.length < 2) return { segs, pos, col };
  const hash = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (let i = 0; i < br.length; i++) {
    const s = br[i].s;
    const k = key(Math.floor((s.x1 + s.x2) * 0.5 / HCELL), Math.floor((s.z1 + s.z2) * 0.5 / HCELL));
    let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(i);
  }
  for (let i = 0; i < br.length; i++) {
    const A = br[i].s, LA = br[i].L;
    let dx = (A.x2 - A.x1) / LA, dz = (A.z2 - A.z1) / LA;
    let flip = false;
    if (dx < 0 || (dx === 0 && dz < 0)) { dx = -dx; dz = -dz; flip = true; }
    const nx = -dz, nz = dx;
    const mx = (A.x1 + A.x2) * 0.5, mz = (A.z1 + A.z2) * 0.5;
    const ymA = (A.y1 + A.y2) * 0.5;
    // A's along-coordinates for its endpoints in the canonical direction
    const aA0 = -LA / 2, aA1 = LA / 2;
    const yAt = (a) => { const t = (a - aA0) / LA; return flip ? A.y2 + (A.y1 - A.y2) * t : A.y1 + (A.y2 - A.y1) * t; };
    const reach = Math.ceil((LA / 2 + MAX_OFFSET + 40) / HCELL);
    const hcx = Math.floor(mx / HCELL), hcz = Math.floor(mz / HCELL);
    let best = null;
    for (let gx = hcx - reach; gx <= hcx + reach; gx++) for (let gz = hcz - reach; gz <= hcz + reach; gz++) {
      const l = hash.get(key(gx, gz)); if (!l) continue;
      for (const j of l) {
        if (j === i) continue;
        const B = br[j].s, LB = br[j].L;
        const bdx = (B.x2 - B.x1) / LB, bdz = (B.z2 - B.z1) / LB;
        if (Math.abs(bdx * dx + bdz * dz) < MIN_DOT) continue;
        const a1 = (B.x1 - mx) * dx + (B.z1 - mz) * dz, a2 = (B.x2 - mx) * dx + (B.z2 - mz) * dz;
        const o1 = (B.x1 - mx) * nx + (B.z1 - mz) * nz, o2 = (B.x2 - mx) * nx + (B.z2 - mz) * nz;
        const lo = Math.max(Math.min(a1, a2), aA0), hi = Math.min(Math.max(a1, a2), aA1);
        if (hi - lo < 1.0) continue;
        const am = (lo + hi) * 0.5;
        const t = Math.abs(a2 - a1) > 1e-6 ? (am - a1) / (a2 - a1) : 0.5;
        const o = o1 + (o2 - o1) * t;
        if (o <= 0 || o > MAX_OFFSET) continue;
        const gap = o - (A.width + B.width) * 0.5;
        if (gap < 0.3 || gap > MAX_GAP) continue;
        const yB = B.y1 + (B.y2 - B.y1) * t;
        if (Math.abs(yB - yAt(am)) > MAX_DY || Math.abs(yB - ymA) > MAX_DY + 1.5) continue;
        if (!best || o < best.o) {
          const tb0 = Math.abs(a2 - a1) > 1e-6 ? (lo - a1) / (a2 - a1) : 0.5;
          const tb1 = Math.abs(a2 - a1) > 1e-6 ? (hi - a1) / (a2 - a1) : 0.5;
          best = { o, lo, hi, B, yB0: B.y1 + (B.y2 - B.y1) * tb0, yB1: B.y1 + (B.y2 - B.y1) * tb1 };
        }
      }
    }
    if (!best) continue;
    const { o, lo, hi, B } = best;
    const y0 = (yAt(lo) + best.yB0) * 0.5, y1 = (yAt(hi) + best.yB1) * 0.5;
    const cx0 = mx + dx * lo + nx * o * 0.5, cz0 = mz + dz * lo + nz * o * 0.5;
    const cx1 = mx + dx * hi + nx * o * 0.5, cz1 = mz + dz * hi + nz * o * 0.5;
    segs.push({
      x1: cx0, y1: y0, z1: cz0, x2: cx1, y2: y1, z2: cz1, width: o,
      bridge: true, tunnel: false, deck: true, layer: A.layer, cls: A.cls, name: A.name, rawName: A.rawName, ref: A,
    });
    // rendered strip from A's edge to B's edge (slightly overlapping under both, 3 cm below the ways)
    const e0 = A.width * 0.5 - 0.2, e1 = o - B.width * 0.5 + 0.2;
    const ly0 = yAt(lo) - 0.03, ly1 = yAt(hi) - 0.03, ry0 = best.yB0 - 0.03, ry1 = best.yB1 - 0.03;
    const ax0 = mx + dx * lo + nx * e0 - ox, az0 = mz + dz * lo + nz * e0 - oz;
    const ax1 = mx + dx * hi + nx * e0 - ox, az1 = mz + dz * hi + nz * e0 - oz;
    const bx0 = mx + dx * lo + nx * e1 - ox, bz0 = mz + dz * lo + nz * e1 - oz;
    const bx1 = mx + dx * hi + nx * e1 - ox, bz1 = mz + dz * hi + nz * e1 - oz;
    pos.push(ax0, ly0, az0, bx0, ry0, bz0, bx1, ry1, bz1, ax0, ly0, az0, bx1, ry1, bz1, ax1, ly1, az1); // +Y facing
    for (let k = 0; k < 6; k++) col.push(DECK_RGB[0], DECK_RGB[1], DECK_RGB[2]);
  }
  return { segs, pos, col };
}

/**
 * Bridges over water: the renderer gives each way class its own height (minor ways compressed to
 * <= 0.85 m, long footway bridges forced to 5.5 m, scenic arches raw) on top of the DEM, which dips
 * into the riverbed. One bridge mapped as a carriageway + two sidewalks therefore became ribbons up to
 * 5 m apart (cars fell between them). For bridge ways that cross water, every vertex over water gets
 * a deck height interpolated between the two banks found by marching along the way's axis (so all
 * parallel ways of one bridge share the same deck line) + 1 m; land vertices stay <= 1 m above terrain
 * for minor ways so the deck meets the streets flush. Major ways keep their profile but never dip below
 * the deck. Edits rawYs in place.
 */
const MINOR_CLS = new Set(['footway', 'pedestrian', 'cycleway', 'steps', 'residential', 'service', 'unclassified', 'living_street', 'path']);

/** Major (non-minor) bridge ways of a chunk as [x, rawY, z, ...] polylines, for levelWaterBridgeRawYs. */
export function collectMajorBridgeWays(roads) {
  const out = [];
  for (const r of roads || []) {
    const cls = r[1], isBridge = r[7], isTunnel = r[8], flat = r[10];
    if (!isBridge || isTunnel || !flat || flat.length < 6 || MINOR_CLS.has(cls)) continue;
    out.push(flat);
  }
  return out;
}

export function worldXZToLatLon(wx, wz, worldOrigin) {
  if (!worldOrigin || !worldOrigin.mPerDegLat || !worldOrigin.mPerDegLon) return null;
  return [
    worldOrigin.centerLat - wz / worldOrigin.mPerDegLat,
    worldOrigin.centerLon + wx / worldOrigin.mPerDegLon,
  ];
}

export function isGoldenGateBridgeWay(name, wx, wz, worldOrigin) {
  if (name && /golden\s*gate|金门大桥/i.test(name)) return true;
  const ll = worldXZToLatLon(wx, wz, worldOrigin);
  if (!ll) return false;
  const [lat, lon] = ll;
  return lat >= 37.803 && lat <= 37.837 && lon >= -122.486 && lon <= -122.470;
}

export function isBayBridgeWay(name, wx, wz, worldOrigin) {
  if (name && /bay\s*bridge|海湾大桥/i.test(name)) return true;
  const ll = worldXZToLatLon(wx, wz, worldOrigin);
  if (!ll) return false;
  const [lat, lon] = ll;
  return lat >= 37.785 && lat <= 37.826 && lon >= -122.392 && lon <= -122.325;
}

// bank-to-bank deck line (+1 m, plus shipping-channel arch on wide water crossings) through (lx, lz) along axis (ax, az), absolute Y
function bankDeckY(lx, lz, ax, az, ox, oz, isPointInWater, terrainAt, minor = false) {
  const march = (sx, sz) => {
    for (let d = 4; d <= 1200; d += 6) {
      const px = lx + sx * d, pz = lz + sz * d;
      if (!isPointInWater(px, pz, 0)) return [px, pz, d];
    }
    return [lx + sx * 1200, lz + sz * 1200, 1200];
  };
  const [px0, pz0, d0] = march(-ax, -az);
  const [px1, pz1, d1] = march(ax, az);
  const h0 = terrainAt(ox + px0, oz + pz0), h1 = terrainAt(ox + px1, oz + pz1);
  const span = d0 + d1;
  const u = d0 / Math.max(1e-6, span);
  const arch = !minor && span >= 140 ? Math.min(24.0, span * 0.03) * (4 * u * (1 - u)) : 0.0;
  return h0 + (h1 - h0) * u + 1.0 + arch;
}

// height of the nearest roughly-parallel major bridge way within 25 m, as rendered after levelling
// (terrain + max(rawY, bank deck along the major's own axis)), or null
function majorDeckY(majors, lx, lz, ax, az, ox, oz, terrainAt, isPointInWater) {
  let best = 25.0, y = null;
  for (const f of majors) {
    for (let k = 0; k + 5 < f.length; k += 3) {
      const x1 = f[k], z1 = f[k + 2], x2 = f[k + 3], z2 = f[k + 5];
      const vx = x2 - x1, vz = z2 - z1, l2 = vx * vx + vz * vz;
      if (l2 < 1) continue;
      const l = Math.sqrt(l2);
      if (Math.abs((vx * ax + vz * az) / l) < 0.85) continue;
      let t = ((lx - x1) * vx + (lz - z1) * vz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = x1 + vx * t, qz = z1 + vz * t;
      const d = Math.hypot(lx - qx, lz - qz);
      if (d < best) {
        best = d;
        const raw = terrainAt(ox + qx, oz + qz) + f[k + 1] + (f[k + 4] - f[k + 1]) * t;
        y = isPointInWater(qx, qz, 0) ? Math.max(raw, bankDeckY(qx, qz, vx / l, vz / l, ox, oz, isPointInWater, terrainAt)) : raw;
      }
    }
  }
  return y;
}

export function levelWaterBridgeRawYs(flat, rawYs, nPts, ox, oz, minor, isPointInWater, terrainAt, majors = null, name = '', cls = '', worldOrigin = null) {
  const midIdx = Math.floor(nPts * 0.5) * 3;
  const mwx = ox + flat[midIdx], mwz = oz + flat[midIdx + 2];

  // 1. Golden Gate Bridge high suspension deck profile (~58m at bluff anchorages -> 67.5m at mid-span 37.8199)
  if (isGoldenGateBridgeWay(name, mwx, mwz, worldOrigin)) {
    for (let i = 0; i < nPts; i++) {
      const lx = flat[i * 3], lz = flat[i * 3 + 2];
      const wx = ox + lx, wz = oz + lz;
      const ll = worldXZToLatLon(wx, wz, worldOrigin);
      const lat = ll ? ll[0] : 37.8199;
      const u = Math.max(-1.0, Math.min(1.0, (lat - 37.8199) / 0.0125));
      const targetAsl = 67.5 - 9.5 * u * u;
      const t0 = terrainAt(wx, wz);
      rawYs[i] = Math.max(rawYs[i], targetAsl - t0);
    }
    return true;
  }

  // 2. San Francisco-Oakland Bay Bridge high shipping-channel profile (~52m ASL over water)
  if (isBayBridgeWay(name, mwx, mwz, worldOrigin)) {
    for (let i = 0; i < nPts; i++) {
      const lx = flat[i * 3], lz = flat[i * 3 + 2];
      const wx = ox + lx, wz = oz + lz;
      const t0 = terrainAt(wx, wz);
      const targetAsl = 52.0;
      rawYs[i] = Math.max(rawYs[i], targetAsl - t0);
    }
    return true;
  }

  let wet = false;
  for (let i = 0; i < nPts && !wet; i++) {
    const x = flat[i * 3], z = flat[i * 3 + 2];
    if (isPointInWater(x, z, 0)) wet = true;
    else if (i + 1 < nPts && isPointInWater((x + flat[(i + 1) * 3]) * 0.5, (z + flat[(i + 1) * 3 + 2]) * 0.5, 0)) wet = true;
  }
  if (!wet) return false;
  let ax = flat[(nPts - 1) * 3] - flat[0], az = flat[(nPts - 1) * 3 + 2] - flat[2];
  const al = Math.hypot(ax, az);
  if (al < 1) return false;
  ax /= al; az /= al;
  const anchor = new Uint8Array(nPts);
  for (let i = 0; i < nPts; i++) {
    const lx = flat[i * 3], lz = flat[i * 3 + 2];
    if (!isPointInWater(lx, lz, 0)) {
      if (minor) rawYs[i] = Math.min(rawYs[i], 1.0);
      if (i === 0 || i === nPts - 1) anchor[i] = 1;
      continue;
    }
    anchor[i] = 1;
    // local tangent (curved ways: a sidewalk that turns from the quay onto the bridge)
    const ia = Math.max(0, i - 1), ib = Math.min(nPts - 1, i + 1);
    let tx = flat[ib * 3] - flat[ia * 3], tz = flat[ib * 3 + 2] - flat[ia * 3 + 2];
    const tl = Math.hypot(tx, tz);
    if (tl > 0.5) { tx /= tl; tz /= tl; } else { tx = ax; tz = az; }
    let deckY = bankDeckY(lx, lz, tx, tz, ox, oz, isPointInWater, terrainAt, minor);
    // sidewalks / cycle tracks of a road bridge ride at the carriageway's height
    if (minor && majors && majors.length) {
      const my = majorDeckY(majors, lx, lz, tx, tz, ox, oz, terrainAt, isPointInWater);
      if (my !== null) deckY = Math.max(deckY, my);
    }
    const t0 = terrainAt(ox + lx, oz + lz);
    const deck = deckY - t0; // as a rawY (height above local terrain)
    rawYs[i] = minor ? deck : Math.max(rawYs[i], deck);
  }
  // interior land vertices (e.g. a low riverside quay passing under the bridge) never dip below the
  // straight deck line between the neighbouring anchors (way ends / over-water vertices)
  const cum = new Float64Array(nPts);
  for (let i = 1; i < nPts; i++) cum[i] = cum[i - 1] + Math.hypot(flat[i * 3] - flat[(i - 1) * 3], flat[i * 3 + 2] - flat[(i - 1) * 3 + 2]);
  const absY = (i) => terrainAt(ox + flat[i * 3], oz + flat[i * 3 + 2]) + rawYs[i];
  let prev = 0;
  for (let i = 1; i < nPts; i++) {
    if (!anchor[i]) continue;
    if (i - prev > 1) {
      const y0 = absY(prev), y1 = absY(i);
      for (let k = prev + 1; k < i; k++) {
        const u = (cum[k] - cum[prev]) / Math.max(1e-6, cum[i] - cum[prev]);
        const tk = terrainAt(ox + flat[k * 3], oz + flat[k * 3 + 2]);
        rawYs[k] = Math.max(rawYs[k], y0 + (y1 - y0) * u - tk);
      }
    }
    prev = i;
  }
  return true;
}
