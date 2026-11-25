/**
 * Dedicated 3D architectural emitters for unmistakable special-site buildings:
 * Airports (Terminals & Hangars), Train Stations, Ferry Terminals, Hospitals, Museums, and Shopping Malls.
 *
 * All geometry keeps pos (3), norm (3), col (3), uv (2), and triEntity (1/tri) 100% aligned.
 * Solid architectural materials use uv = (0, 0); emissive elements scale objectNormal by 2.0
 * to trigger vEmissive in chunk_builder.js.
 */

export const SPECIAL_SITE_TYPES = new Set([
  'airport_terminal',
  'airport_hangar',
  'train_station',
  'ferry_terminal',
  'hospital',
  'museum',
  'mall',
]);

const GENERIC_SRC_BTYPES = new Set([
  '',
  'yes',
  'building',
  'commercial',
  'retail',
  'industrial',
  'transportation',
  'public',
  'civic',
  'office',
  'supermarket',
]);

const BTYPE_ALIASES = {
  airport_terminal: 'airport_terminal',
  terminal: 'airport_terminal',
  airport_hangar: 'airport_hangar',
  hangar: 'airport_hangar',
  train_station: 'train_station',
  ferry_terminal: 'ferry_terminal',
  hospital: 'hospital',
  museum: 'museum',
  art_gallery: 'museum',
  mall: 'mall',
  department_store: 'mall',
};

const HANGAR_NAME_RE = /\b(hangar)\b|机库/i;
const AIRPORT_TERM_RE = /\b(terminal|concourse|airport|aeroport|flughafen)\b|航站楼|机场|空港/i;
const AIRPORT_EXCLUDE_RE = /\b(hotel|inn|suites|motel|parking|garage|marriott|hilton|hyatt|sheraton|holiday inn|car rental|rental car|fire\s+station|firehouse|police)\b/i;
const FERRY_NAME_RE = /\b(ferry terminal|ferry building|cruise terminal|passenger terminal|pier terminal)\b|客运码头|轮渡站|渡轮码头|邮轮码头/i;
const TRAIN_NAME_RE = /\b(train station|railway station|central station|grand central|penn station|union station|rail station|metro station|subway station|gare|bahnhof|shinjuku|tokyo station)\b|火车站|高铁站|火车南站|火车东站|火车北站|站房/i;
const TRAIN_GENERIC_STATION_RE = /\b(station)\b/i;
const TRAIN_EXCLUDE_RE = /\b(fire|police|power|gas|petrol|fuel|service|substation|pumping|radio|tv|television|broadcast|weather|ranger|coast guard|lifeguard|ambulance|charging|cafe|pub|bar|grill|hotel)\b|消防站|派出所|变电站|加油站|充电站|广播站|气象站/i;
const HOSPITAL_NAME_RE = /\b(hospital|medical center|medical centre|infirmary)\b|医院|医疗中心/i;
const MUSEUM_NAME_RE = /\b(museum|art gallery|kunsthalle|musee|musée|museo)\b|博物馆|美术馆|博物院/i;
const MALL_NAME_RE = /\b(shopping mall|shopping center|shopping centre|galleria|department store|mall)\b|购物中心|百货大楼|百货公司|万达广场|大悦城|太古里/i;

function cleanSiteName(rawName) {
  const s = String(rawName || '').trim();
  if (!s) return '';
  if (s.includes('沿线 · ') || /\(\d+层\)$/.test(s)) return '';
  return s;
}

/**
 * Resolves a building into one of the 7 canonical SPECIAL_SITE_TYPES, or null if ordinary.
 */
export function resolveSpecialSiteType(btype, name = '', area = null) {
  if (Number.isFinite(area) && area < 220) return null;
  const bt = String(btype || '').toLowerCase();
  if (BTYPE_ALIASES[bt]) return BTYPE_ALIASES[bt];
  if (!GENERIC_SRC_BTYPES.has(bt)) return null;

  const nm = cleanSiteName(name);
  if (!nm) return null;

  if (HANGAR_NAME_RE.test(nm)) return 'airport_hangar';
  if (AIRPORT_TERM_RE.test(nm) && !AIRPORT_EXCLUDE_RE.test(nm)) return 'airport_terminal';
  if (FERRY_NAME_RE.test(nm)) return 'ferry_terminal';
  if (TRAIN_NAME_RE.test(nm) && !TRAIN_EXCLUDE_RE.test(nm)) return 'train_station';
  if (TRAIN_GENERIC_STATION_RE.test(nm) && !TRAIN_EXCLUDE_RE.test(nm)) return 'train_station';
  if (HOSPITAL_NAME_RE.test(nm)) return 'hospital';
  if (MUSEUM_NAME_RE.test(nm)) return 'museum';
  if (MALL_NAME_RE.test(nm)) return 'mall';
  return null;
}

/**
 * Returns true if the building qualifies for dedicated 3D special-site architecture.
 */
export function isSpecialSiteBuilding(btype, name = '', area = null) {
  return resolveSpecialSiteType(btype, name, area) !== null;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pointInFlatRingXZ(px, pz, ring) {
  if (!ring || ring.length < 6) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInFootprint(px, pz, ccwOuter, holes) {
  if (!pointInFlatRingXZ(px, pz, ccwOuter)) return false;
  if (holes) {
    for (let h = 0; h < holes.length; h++) {
      if (holes[h] && holes[h].length >= 6 && pointInFlatRingXZ(px, pz, holes[h])) return false;
    }
  }
  return true;
}

/**
 * Computes minimum-area oriented bounding box (OBB) for a flat XZ ring.
 * U = (ux, uz) is always the long axis; V = (vx, vz) = (-uz, ux) is the short axis.
 */
function computeFootprintOBB(ccwOuter, fallbackMinX, fallbackMaxX, fallbackMinZ, fallbackMaxZ) {
  const n = ccwOuter ? ccwOuter.length / 2 : 0;
  if (n < 3) {
    const cx = (fallbackMinX + fallbackMaxX) * 0.5;
    const cz = (fallbackMinZ + fallbackMaxZ) * 0.5;
    const sx = Math.max(4, fallbackMaxX - fallbackMinX);
    const sz = Math.max(4, fallbackMaxZ - fallbackMinZ);
    const xLong = sx >= sz;
    const ux = xLong ? 1 : 0, uz = xLong ? 0 : 1;
    const vx = -uz, vz = ux;
    const uLen = xLong ? sx : sz;
    const vLen = xLong ? sz : sx;
    return { ux, uz, vx, vz, uMin: -uLen * 0.5, uMax: uLen * 0.5, vMin: -vLen * 0.5, vMax: vLen * 0.5, obx: cx, obz: cz, uLen, vLen };
  }

  const candidates = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ccwOuter[j * 2] - ccwOuter[i * 2];
    const dz = ccwOuter[j * 2 + 1] - ccwOuter[i * 2 + 1];
    const len = Math.hypot(dx, dz);
    if (len > 1.0) candidates.push({ dx: dx / len, dz: dz / len, len });
  }
  candidates.sort((a, b) => b.len - a.len);
  const tested = candidates.slice(0, 12);
  if (tested.length === 0) tested.push({ dx: 1, dz: 0, len: 1 });

  let best = null;
  let bestArea = Infinity;
  for (let c = 0; c < tested.length; c++) {
    const ax = tested[c].dx, az = tested[c].dz;
    const bx = -az, bz = ax;
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const px = ccwOuter[i * 2], pz = ccwOuter[i * 2 + 1];
      const u = px * ax + pz * az;
      const v = px * bx + pz * bz;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const uSpan = uMax - uMin, vSpan = vMax - vMin;
    const area = uSpan * vSpan;
    if (area < bestArea) {
      bestArea = area;
      best = { ax, az, bx, bz, uMin, uMax, vMin, vMax, uSpan, vSpan };
    }
  }

  let ux = best.ax, uz = best.az, uMin = best.uMin, uMax = best.uMax;
  let vMin = best.vMin, vMax = best.vMax;
  if (best.vSpan > best.uSpan) {
    ux = best.bx;
    uz = best.bz;
    uMin = best.vMin;
    uMax = best.vMax;
    // Rotate -90 deg for V so right-handedness is maintained: vx = -uz, vz = ux
    vMin = -best.uMax;
    vMax = -best.uMin;
  }
  const vx = -uz, vz = ux;
  const uMid = (uMin + uMax) * 0.5;
  const vMid = (vMin + vMax) * 0.5;
  const obx = ux * uMid + vx * vMid;
  const obz = uz * uMid + vz * vMid;
  return {
    ux, uz, vx, vz,
    uMin: uMin - uMid,
    uMax: uMax - uMid,
    vMin: vMin - vMid,
    vMax: vMax - vMid,
    obx, obz,
    uLen: Math.max(4, uMax - uMin),
    vLen: Math.max(4, vMax - vMin),
  };
}

function obbToWorld(obb, u, v) {
  return [obb.obx + u * obb.ux + v * obb.vx, obb.obz + u * obb.uz + v * obb.vz];
}

function findSafeRoofPoint(ccwOuter, holes, obb, prefU = 0, prefV = 0, pad = 2.0) {
  const isOk = (u, v) => {
    const [wx, wz] = obbToWorld(obb, u, v);
    if (!pointInFootprint(wx, wz, ccwOuter, holes)) return false;
    if (pad <= 0.2) return true;
    const offs = [[-pad, -pad], [pad, -pad], [pad, pad], [-pad, pad]];
    for (let i = 0; i < 4; i++) {
      const [px, pz] = obbToWorld(obb, u + offs[i][0], v + offs[i][1]);
      if (!pointInFootprint(px, pz, ccwOuter, holes)) return false;
    }
    return true;
  };
  if (isOk(prefU, prefV)) return { u: prefU, v: prefV, valid: true };
  for (const rScale of [0.25, 0.5, 0.72]) {
    const stepU = obb.uLen * 0.25 * rScale;
    const stepV = obb.vLen * 0.25 * rScale;
    for (let du = -2; du <= 2; du++) {
      for (let dv = -2; dv <= 2; dv++) {
        const cu = prefU + du * stepU;
        const cv = prefV + dv * stepV;
        if (isOk(cu, cv)) return { u: cu, v: cv, valid: true };
      }
    }
  }
  return { u: 0, v: 0, valid: pointInFootprint(obb.obx, obb.obz, ccwOuter, holes) };
}

/**
 * Finds the longest edge of ccwOuter aligned mostly with the U axis to determine the primary front side (+1 or -1 in V).
 */
function pickPrimaryFrontSide(ccwOuter, obb) {
  const n = ccwOuter ? ccwOuter.length / 2 : 0;
  let posWeight = 0, negWeight = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ccwOuter[i * 2], z1 = ccwOuter[i * 2 + 1];
    const x2 = ccwOuter[j * 2], z2 = ccwOuter[j * 2 + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 3.0) continue;
    const alignU = Math.abs((dx * obb.ux + dz * obb.uz) / len);
    if (alignU < 0.65) continue;
    const mx = (x1 + x2) * 0.5 - obb.obx;
    const mz = (z1 + z2) * 0.5 - obb.obz;
    const vCoord = mx * obb.vx + mz * obb.vz;
    if (vCoord >= 0) posWeight += len;
    else negWeight += len;
  }
  return posWeight >= negWeight ? 1 : -1;
}

/**
 * Creates a buffer-aligned geometry emitter writing to main chunk buffers (or detailSink for near-LOD trim).
 */
function createEmitter(ctx) {
  const { pos, norm, col, uv, triEntity, entityIdx, detailSink } = ctx;
  const hasDetail = Boolean(detailSink && detailSink.pos && detailSink.norm && detailSink.col);

  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, rgb, emissive = false, useDetail = false, triUv = null) => {
    const det = useDetail && hasDetail;
    const tPos = det ? detailSink.pos : pos;
    const tNorm = det ? detailSink.norm : norm;
    const tCol = det ? detailSink.col : col;
    const tUv = det ? detailSink.uv : uv;

    if (nx === null || ny === null || nz === null) {
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      let cnx = aby * acz - abz * acy;
      let cny = abz * acx - abx * acz;
      let cnz = abx * acy - aby * acx;
      const len = Math.hypot(cnx, cny, cnz) || 1.0;
      nx = cnx / len;
      ny = cny / len;
      nz = cnz / len;
    }

    const nScale = emissive ? 2.0 : 1.0;
    const snx = nx * nScale, sny = ny * nScale, snz = nz * nScale;
    const r = clamp(rgb[0], 0, 1);
    const g = clamp(rgb[1], 0, 1);
    const b = clamp(rgb[2], 0, 1);

    tPos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    tNorm.push(snx, sny, snz, snx, sny, snz, snx, sny, snz);
    tCol.push(r, g, b, r, g, b, r, g, b);

    if (!det && triEntity) {
      triEntity.push(entityIdx);
    }
    if (tUv) {
      if (triUv) {
        tUv.push(triUv[0], triUv[1], triUv[2], triUv[3], triUv[4], triUv[5]);
      } else {
        tUv.push(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
      }
    }
  };

  const pushQuad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, rgb, emissive = false, useDetail = false, uvQuad = null) => {
    const shadeRgb = rgb;
    const uv1 = uvQuad ? [uvQuad[0], uvQuad[1], uvQuad[2], uvQuad[3], uvQuad[4], uvQuad[5]] : null;
    const uv2 = uvQuad ? [uvQuad[0], uvQuad[1], uvQuad[4], uvQuad[5], uvQuad[6], uvQuad[7]] : null;
    pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, shadeRgb, emissive, useDetail, uv1);
    pushTri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz, shadeRgb, emissive, useDetail, uv2);
  };

  const shaded = (rgb, factor) => [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];

  const pushOrientedBox = (cx, y0, cz, ux, uz, vx, vz, halfU, h, halfV, rgb, emissive = false, useDetail = false) => {
    const y1 = y0 + h;
    const pt = (su, y, sv) => [
      cx + su * halfU * ux + sv * halfV * vx,
      y,
      cz + su * halfU * uz + sv * halfV * vz,
    ];
    const p000 = pt(-1, y0, -1), p100 = pt(1, y0, -1), p101 = pt(1, y0, 1), p001 = pt(-1, y0, 1);
    const p010 = pt(-1, y1, -1), p110 = pt(1, y1, -1), p111 = pt(1, y1, 1), p011 = pt(-1, y1, 1);

    // +V front
    pushQuad(p001[0], p001[1], p001[2], p011[0], p011[1], p011[2], p111[0], p111[1], p111[2], p101[0], p101[1], p101[2], vx, 0, vz, rgb, emissive, useDetail);
    // -V back
    pushQuad(p100[0], p100[1], p100[2], p110[0], p110[1], p110[2], p010[0], p010[1], p010[2], p000[0], p000[1], p000[2], -vx, 0, -vz, shaded(rgb, 0.92), emissive, useDetail);
    // +U right
    pushQuad(p101[0], p101[1], p101[2], p111[0], p111[1], p111[2], p110[0], p110[1], p110[2], p100[0], p100[1], p100[2], ux, 0, uz, shaded(rgb, 0.90), emissive, useDetail);
    // -U left
    pushQuad(p000[0], p000[1], p000[2], p010[0], p010[1], p010[2], p011[0], p011[1], p011[2], p001[0], p001[1], p001[2], -ux, 0, -uz, shaded(rgb, 0.88), emissive, useDetail);
    // +Y top
    pushQuad(p011[0], p011[1], p011[2], p010[0], p010[1], p010[2], p110[0], p110[1], p110[2], p111[0], p111[1], p111[2], 0, 1, 0, shaded(rgb, 1.06), emissive, useDetail);
    // -Y bottom
    pushQuad(p000[0], p000[1], p000[2], p001[0], p001[1], p001[2], p101[0], p101[1], p101[2], p100[0], p100[1], p100[2], 0, -1, 0, shaded(rgb, 0.72), emissive, useDetail);
  };

  /**
   * Emits a 3D rectangular structural strut/beam connecting point A(ax, ay, az) to B(bx, by, bz).
   */
  const pushStrut = (ax, ay, az, bx, by, bz, rad, rgb, emissive = false, useDetail = false) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    const tx = dx / len, ty = dy / len, tz = dz / len;
    // Orthogonal basis (p, q) perpendicular to t
    let px = Math.abs(ty) < 0.9 ? -tz : 1, py = 0, pz = Math.abs(ty) < 0.9 ? tx : 0;
    const pLen = Math.hypot(px, py, pz) || 1;
    px /= pLen; py /= pLen; pz /= pLen;
    const qx = ty * pz - tz * py;
    const qy = tz * px - tx * pz;
    const qz = tx * py - ty * px;

    const ring = (x, y, z) => [
      [x + (px + qx) * rad, y + (py + qy) * rad, z + (pz + qz) * rad],
      [x + (-px + qx) * rad, y + (-py + qy) * rad, z + (-pz + qz) * rad],
      [x + (-px - qx) * rad, y + (-py - qy) * rad, z + (-pz - qz) * rad],
      [x + (px - qx) * rad, y + (py - qy) * rad, z + (pz - qz) * rad],
    ];
    const rA = ring(ax, ay, az);
    const rB = ring(bx, by, bz);
    const norms = [
      [qx, qy, qz, 1.0],
      [-px, -py, -pz, 0.90],
      [-qx, -qy, -qz, 0.84],
      [px, py, pz, 0.94],
    ];
    for (let s = 0; s < 4; s++) {
      const sNext = (s + 1) % 4;
      const a0 = rA[s], a1 = rA[sNext], b1 = rB[sNext], b0 = rB[s];
      const [nx, ny, nz, sh] = norms[s];
      pushQuad(a0[0], a0[1], a0[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], a1[0], a1[1], a1[2], nx, ny, nz, shaded(rgb, sh), emissive, useDetail);
    }
    pushQuad(rB[0][0], rB[0][1], rB[0][2], rB[1][0], rB[1][1], rB[1][2], rB[2][0], rB[2][1], rB[2][2], rB[3][0], rB[3][1], rB[3][2], tx, ty, tz, shaded(rgb, 1.04), emissive, useDetail);
  };

  /**
   * Emits a regular N-sided prism or frustum centered at (cx, y0, cz) with bottom radius rBot and top radius rTop.
   */
  const pushCylinder = (cx, y0, cz, rBot, rTop, h, sides, rgb, emissive = false, useDetail = false, rotOffset = 0) => {
    const y1 = y0 + h;
    for (let s = 0; s < sides; s++) {
      const a0 = rotOffset + (s / sides) * Math.PI * 2;
      const a1 = rotOffset + ((s + 1) / sides) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const cm = Math.cos(am), sm = Math.sin(am);
      const shade = 0.88 + 0.14 * (0.5 + 0.5 * sm);
      pushQuad(
        cx + c0 * rBot, y0, cz + s0 * rBot,
        cx + c0 * rTop, y1, cz + s0 * rTop,
        cx + c1 * rTop, y1, cz + s1 * rTop,
        cx + c1 * rBot, y0, cz + s1 * rBot,
        cm, 0, sm, shaded(rgb, shade), emissive, useDetail
      );
      if (rTop > 0.02) {
        pushTri(cx, y1, cz, cx + c1 * rTop, y1, cz + s1 * rTop, cx + c0 * rTop, y1, cz + s0 * rTop, 0, 1, 0, shaded(rgb, 1.06), emissive, useDetail);
      }
    }
  };

  /**
   * Emits a continuous curved/arched roof slab running along U from u0..u1, sampled at V points from profileFn(t) -> yOffset.
   * profilePts: array of { v, y } across the V section.
   */
  const pushSweptRoofProfile = (obb, u0, u1, profilePts, thickness, topRgb, botRgb, edgeRgb, emissiveTop = false, useDetail = false) => {
    const m = profilePts.length;
    if (m < 2) return;
    const pTop = (u, pt) => [
      obb.obx + u * obb.ux + pt.v * obb.vx,
      pt.y,
      obb.obz + u * obb.uz + pt.v * obb.vz,
    ];
    for (let k = 0; k < m - 1; k++) {
      const a = profilePts[k], b = profilePts[k + 1];
      const dv = b.v - a.v;
      const dy = b.y - a.y;
      const sLen = Math.hypot(dv, dy) || 1;
      const nv = -dy / sLen, ny = dv / sLen;
      const ntx = nv * obb.vx, nty = ny, ntz = nv * obb.vz;

      const a0 = pTop(u0, a), b0 = pTop(u0, b), b1 = pTop(u1, b), a1 = pTop(u1, a);
      const panelRgb = typeof topRgb === 'function' ? topRgb(k, m - 1) : topRgb;
      pushQuad(a0[0], a0[1], a0[2], b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], a1[0], a1[1], a1[2], ntx, nty, ntz, panelRgb, emissiveTop, useDetail);

      if (thickness > 0.02) {
        // Underside soffit
        pushQuad(
          a0[0], a0[1] - thickness, a0[2],
          a1[0], a1[1] - thickness, a1[2],
          b1[0], b1[1] - thickness, b1[2],
          b0[0], b0[1] - thickness, b0[2],
          -ntx, -nty, -ntz, botRgb, false, useDetail
        );
        // +U and -U end fascia rims
        pushQuad(
          a1[0], a1[1] - thickness, a1[2],
          a1[0], a1[1], a1[2],
          b1[0], b1[1], b1[2],
          b1[0], b1[1] - thickness, b1[2],
          obb.ux, 0, obb.uz, edgeRgb, false, useDetail
        );
        pushQuad(
          b0[0], b0[1] - thickness, b0[2],
          b0[0], b0[1], b0[2],
          a0[0], a0[1], a0[2],
          a0[0], a0[1] - thickness, a0[2],
          -obb.ux, 0, -obb.uz, edgeRgb, false, useDetail
        );
      }
    }
    if (thickness > 0.02) {
      // -V and +V outer edge fascia trims
      const first = profilePts[0], last = profilePts[m - 1];
      const f0 = pTop(u0, first), f1 = pTop(u1, first);
      pushQuad(
        f0[0], f0[1] - thickness, f0[2], f0[0], f0[1], f0[2],
        f1[0], f1[1], f1[2], f1[0], f1[1] - thickness, f1[2],
        -obb.vx, 0, -obb.vz, edgeRgb, false, useDetail
      );
      const l0 = pTop(u0, last), l1 = pTop(u1, last);
      pushQuad(
        l1[0], l1[1] - thickness, l1[2], l1[0], l1[1], l1[2],
        l0[0], l0[1], l0[2], l0[0], l0[1] - thickness, l0[2],
        obb.vx, 0, obb.vz, edgeRgb, false, useDetail
      );
    }
  };

  return { pushTri, pushQuad, pushOrientedBox, pushStrut, pushCylinder, pushSweptRoofProfile, shaded };
}

/**
 * 1. AIRPORT TERMINAL:
 * - Sweeping curved gull-wing overhanging titanium roof + warm soffit + roof rib seams
 * - Angled white tubular V-strut columns along concourse eaves
 * - Structural curtain-wall mullions & dark spandrel trim
 * - Curbside departure canopy + glowing blue/white signage band + warm under-canopy lighting
 * - Roof clerestory light monitors along terminal spine
 * - Integrated Ramp Control Tower Cab (area >= 2400 m²) with 360° green-tinted glass, radome, and red beacons
 */
function clampProjAt(ctx, wx, wz, nx, nz, proj, minKeep = 0.8) {
  if (!ctx.getNeighborClearance || proj <= 0) return proj;
  const clr = ctx.getNeighborClearance(wx, wz, nx, nz, proj + 0.5, ctx.entityIdx ?? -1);
  const clamped = Math.min(proj, Math.max(0, clr - 0.35));
  return clamped < minKeep ? 0 : clamped;
}

function clampFacadeProjV(ctx, obb, uSamples, vEdge, dirSign, proj, minKeep = 0.8) {
  if (!ctx.getNeighborClearance || proj <= 0) return proj;
  const nx = dirSign * obb.vx, nz = dirSign * obb.vz;
  let out = proj;
  for (let i = 0; i < uSamples.length; i++) {
    const [wx, wz] = obbToWorld(obb, uSamples[i], vEdge);
    out = Math.min(out, clampProjAt(ctx, wx, wz, nx, nz, proj, minKeep));
    if (out === 0) return 0;
  }
  return out;
}

function clampFacadeProjU(ctx, obb, uEdge, vSamples, dirSign, proj, minKeep = 0.8) {
  if (!ctx.getNeighborClearance || proj <= 0) return proj;
  const nx = dirSign * obb.ux, nz = dirSign * obb.uz;
  let out = proj;
  for (let i = 0; i < vSamples.length; i++) {
    const [wx, wz] = obbToWorld(obb, uEdge, vSamples[i]);
    out = Math.min(out, clampProjAt(ctx, wx, wz, nx, nz, proj, minKeep));
    if (out === 0) return 0;
  }
  return out;
}

function emitAirportTerminal(ctx, obb, emit) {
  const { yBase, yTop, totalH, area, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;

  const rawOverhangV = clamp(obb.vLen * 0.14, 3.5, 5.5);
  const rawOverhangU = clamp(obb.uLen * 0.04, 2.0, 4.2);
  const overhangVPlus = clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], halfV, 1, rawOverhangV);
  const overhangVMinus = clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], -halfV, -1, rawOverhangV);
  const overhangUPlus = clampFacadeProjU(ctx, obb, halfU, [-halfV * 0.6, 0, halfV * 0.6], 1, rawOverhangU);
  const overhangUMinus = clampFacadeProjU(ctx, obb, -halfU, [-halfV * 0.6, 0, halfV * 0.6], -1, rawOverhangU);
  const wingU0 = -halfU - overhangUMinus;
  const wingU1 = halfU + overhangUPlus;

  // Gull-wing cross-section: dipped central spine + arched shoulders + soaring upturned wingtips
  const gullLift = (t) => {
    const a = Math.abs(t);
    return 0.85 + 3.45 * (0.28 * Math.sin(a * Math.PI * 0.5) + 0.72 * a * a);
  };
  const segs = 10;
  const gullPts = [];
  for (let i = 0; i <= segs; i++) {
    const t = -1.0 + (2.0 * i) / segs;
    const halfSpanV = t < 0 ? halfV + overhangVMinus : halfV + overhangVPlus;
    gullPts.push({ v: t * halfSpanV, y: yTop + gullLift(t) });
  }

  const titaniumCol = [0.85, 0.89, 0.93];
  const soffitCedar = [0.68, 0.55, 0.42];
  const fasciaCol = [0.22, 0.25, 0.30];
  emit.pushSweptRoofProfile(obb, wingU0, wingU1, gullPts, 0.55, titaniumCol, soffitCedar, fasciaCol);

  // Exterior structural titanium roof ribs every ~14m along U
  const nRibs = clamp(Math.round(obb.uLen / 14.0), 3, 14);
  for (let r = 0; r <= nRibs; r++) {
    const ru = wingU0 + 0.6 + (r / nRibs) * (wingU1 - wingU0 - 1.2);
    const ribPts = gullPts.map((pt) => ({ v: pt.v, y: pt.y + 0.28 }));
    emit.pushSweptRoofProfile(obb, ru - 0.22, ru + 0.22, ribPts, 0.30, fasciaCol, fasciaCol, fasciaCol, false, false);
  }

  // White tubular V-strut columns supporting the overhanging gull-wing eaves along both long concourse sides
  const strutCol = [0.94, 0.96, 0.99];
  const nBays = clamp(Math.round(obb.uLen / 11.5), 3, 14);
  const baySpan = obb.uLen / nBays;
  const eaveY = yTop + gullLift(0.95) - 0.45;
  const wallV = halfV + 0.25;
  for (const sgn of [-1, 1]) {
    const sideOv = sgn > 0 ? overhangVPlus : overhangVMinus;
    if (sideOv <= 0) continue;
    const eaveV = (halfV + sideOv) * 0.93;
    for (let b = 0; b < nBays; b++) {
      const uCenter = -halfU + (b + 0.5) * baySpan;
      const spreadU = Math.min(3.8, baySpan * 0.42);
      const [bx, bz] = obbToWorld(obb, uCenter, sgn * wallV);
      const [ltx, ltz] = obbToWorld(obb, uCenter - spreadU, sgn * eaveV);
      const [rtx, rtz] = obbToWorld(obb, uCenter + spreadU, sgn * eaveV);
      // Base pier + twin diagonal V-arms
      emit.pushOrientedBox(bx, yBase, bz, obb.ux, obb.uz, obb.vx, obb.vz, 0.45, 0.75, 0.45, fasciaCol, false, true);
      emit.pushStrut(bx, yBase + 0.6, bz, ltx, eaveY, ltz, 0.22, strutCol);
      emit.pushStrut(bx, yBase + 0.6, bz, rtx, eaveY, rtz, 0.22, strutCol);
    }
  }

  // Concourse panoramic curtain-wall mullions & horizontal steel spandrel bands along long facades
  const spandrelCol = [0.16, 0.20, 0.26];
  const spandrelY = yBase + Math.min(totalH * 0.52, 5.4);
  if (totalH >= 7.0) {
    for (const sgn of [-1, 1]) {
      const [sx, sz] = obbToWorld(obb, 0, sgn * (halfV + 0.08));
      emit.pushOrientedBox(sx, spandrelY, sz, obb.ux, obb.uz, obb.vx, obb.vz, halfU + 0.1, 0.36, 0.16, spandrelCol, false, true);
    }
  }

  // Curbside Departure Canopy & Signage Band along the primary front wall
  const canopyLen = Math.min(obb.uLen * 0.82, Math.max(14.0, obb.uLen - 4.0));
  const canopyY = yBase + clamp(totalH * 0.36, 4.1, 5.2);
  const canopyProj = clampFacadeProjV(ctx, obb, [-canopyLen * 0.4, 0, canopyLen * 0.4], frontSign * halfV, frontSign, 3.8);
  if (canopyProj > 0) {
    const [canX, canZ] = obbToWorld(obb, 0, frontSign * (halfV + canopyProj * 0.5));
    emit.pushOrientedBox(canX, canopyY, canZ, obb.ux, obb.uz, obb.vx, obb.vz, canopyLen * 0.5, 0.22, canopyProj * 0.5, [0.24, 0.48, 0.68]);
    // Steel frame fascia & crisp blue/white departure signage band
    const [fasX, fasZ] = obbToWorld(obb, 0, frontSign * (halfV + canopyProj + 0.06));
    emit.pushOrientedBox(fasX, canopyY + 0.22, fasZ, obb.ux, obb.uz, obb.vx, obb.vz, canopyLen * 0.5 + 0.2, 0.42, 0.18, [0.10, 0.44, 0.88], true);
    emit.pushOrientedBox(fasX, canopyY + 0.64, fasZ, obb.ux, obb.uz, obb.vx, obb.vz, canopyLen * 0.5 + 0.2, 0.14, 0.20, [0.95, 0.97, 1.0], false);
    // Warm under-canopy departure lighting strip
    const [ledX, ledZ] = obbToWorld(obb, 0, frontSign * (halfV + canopyProj * 0.45));
    emit.pushOrientedBox(ledX, canopyY - 0.12, ledZ, obb.ux, obb.uz, obb.vx, obb.vz, canopyLen * 0.46, 0.08, 0.35, [1.0, 0.88, 0.64], true, true);
  }

  // Roof Clerestory Light Monitor running along the terminal spine
  const clereLen = obb.uLen * 0.72;
  const clereHalfV = clamp(obb.vLen * 0.12, 1.4, 2.6);
  const clereBaseY = yTop + 0.85;
  const [clX, clZ] = obbToWorld(obb, 0, 0);
  if (pointInFootprint(clX, clZ, ccwOuter, holes)) {
    emit.pushOrientedBox(clX, clereBaseY, clZ, obb.ux, obb.uz, obb.vx, obb.vz, clereLen * 0.5, 1.65, clereHalfV, [0.42, 0.72, 0.92], true);
    emit.pushOrientedBox(clX, clereBaseY + 1.65, clZ, obb.ux, obb.uz, obb.vx, obb.vz, clereLen * 0.5 + 0.35, 0.26, clereHalfV + 0.35, fasciaCol);
  }

  // Integrated Ramp Control Tower Cab on large terminals (area >= 2400 m²)
  let topRoofY = yTop + 4.5;
  if (area >= 2400) {
    const anchor = findSafeRoofPoint(ccwOuter, holes, obb, obb.uLen * 0.18, 0, 2.8);
    if (anchor.valid) {
      const [tx, tz] = obbToWorld(obb, anchor.u, anchor.v);
      const towerBaseY = yTop + 0.8;
      const shaftH = clamp(totalH * 0.65, 11.0, 17.5);
      const cabBotY = towerBaseY + shaftH;
      const shaftCol = [0.88, 0.90, 0.92];
      const collarCol = [0.24, 0.28, 0.34];
      const cabGlassCol = [0.22, 0.58, 0.48];

      // Flared shaft + observation collar + 360° tilted green-tinted cab + cap + radome + red beacons
      emit.pushCylinder(tx, towerBaseY, tz, 2.2, 1.85, shaftH, 8, shaftCol, false, false, Math.PI / 8);
      emit.pushCylinder(tx, cabBotY, tz, 1.9, 3.3, 1.1, 8, collarCol, false, false, Math.PI / 8);
      emit.pushCylinder(tx, cabBotY + 1.1, tz, 3.2, 3.85, 2.9, 8, cabGlassCol, true, false, Math.PI / 8);
      emit.pushCylinder(tx, cabBotY + 4.0, tz, 4.1, 3.4, 0.65, 8, shaftCol, false, false, Math.PI / 8);
      // Roof radar dome + twin aviation beacons
      emit.pushCylinder(tx, cabBotY + 4.65, tz, 1.15, 0.75, 1.0, 8, [0.96, 0.97, 0.99]);
      emit.pushCylinder(tx, cabBotY + 5.65, tz, 0.75, 0.15, 0.55, 8, [0.96, 0.97, 0.99]);
      for (const bOff of [-2.4, 2.4]) {
        const bx = tx + bOff * obb.ux, bz = tz + bOff * obb.uz;
        emit.pushOrientedBox(bx, cabBotY + 4.65, bz, obb.ux, obb.uz, obb.vx, obb.vz, 0.18, 0.38, 0.18, [1.0, 0.16, 0.10], true);
      }
      topRoofY = Math.max(topRoofY, cabBotY + 6.2);
    }
  }
  return { topRoofY };
}

/**
 * 2. AIRPORT HANGAR:
 * - Wide-span 8-segment arched barrel-vault steel roof across short axis with dark steel arch ribs every 8-10m
 * - End curved gable tympanum walls
 * - Giant multi-panel sliding hangar doors with horizontal rib panels & yellow/black safety chevron lintel beam
 * - Twin red aviation corner beacons
 */
function emitAirportHangar(ctx, obb, emit) {
  const { yBase, yTop, totalH, ccwOuter } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;
  const vaultRise = clamp(obb.vLen * 0.18, 3.0, 7.5);

  const segs = 8;
  const vaultPts = [];
  for (let i = 0; i <= segs; i++) {
    const t = -1.0 + (2.0 * i) / segs;
    const angle = t * Math.PI * 0.5;
    vaultPts.push({ v: t * (halfV + 0.45), y: yTop + vaultRise * Math.cos(angle) });
  }

  const metalRoofCol = [0.62, 0.67, 0.72];
  const steelRibCol = [0.20, 0.23, 0.27];
  const tympanumCol = [0.50, 0.54, 0.59];
  emit.pushSweptRoofProfile(obb, -halfU - 0.4, halfU + 0.4, vaultPts, 0.35, metalRoofCol, steelRibCol, steelRibCol);

  // Raised exterior dark-steel arch ribs every 8-10 m
  const ribSpacing = 9.0;
  const nRibs = clamp(Math.round(obb.uLen / ribSpacing), 3, 14);
  const ribPts = vaultPts.map((pt) => ({ v: pt.v, y: pt.y + 0.34 }));
  for (let r = 0; r <= nRibs; r++) {
    const ru = -halfU + (r / nRibs) * obb.uLen;
    emit.pushSweptRoofProfile(obb, ru - 0.22, ru + 0.22, ribPts, 0.36, steelRibCol, steelRibCol, steelRibCol);
  }

  // Close arched tympanums at both U ends
  for (const endU of [-halfU, halfU]) {
    const nx = endU > 0 ? obb.ux : -obb.ux;
    const nz = endU > 0 ? obb.uz : -obb.uz;
    for (let k = 0; k < segs; k++) {
      const a = vaultPts[k], b = vaultPts[k + 1];
      const [ax, az] = obbToWorld(obb, endU, a.v);
      const [bx, bz] = obbToWorld(obb, endU, b.v);
      const [cx, cz] = obbToWorld(obb, endU, b.v);
      const [dx, dz] = obbToWorld(obb, endU, a.v);
      if (endU > 0) {
        emit.pushQuad(dx, yTop, dz, ax, a.y, az, bx, b.y, bz, cx, yTop, cz, nx, 0, nz, tympanumCol);
      } else {
        emit.pushQuad(cx, yTop, cz, bx, b.y, bz, ax, a.y, az, dx, yTop, dz, nx, 0, nz, tympanumCol);
      }
    }
  }

  // Giant Multi-Panel Sliding Hangar Doors on the primary apron-facing wide wall
  const doorTotalW = Math.min(obb.uLen * 0.82, obb.uLen - 3.0);
  const doorH = Math.max(4.0, totalH * 0.82);
  const nPanels = clamp(Math.round(doorTotalW / 7.5), 4, 8);
  const panelW = doorTotalW / nPanels;
  const doorV = frontSign * (halfV + 0.16);
  const doorBgCol = [0.16, 0.19, 0.23];
  const doorPanelCol = [0.26, 0.30, 0.36];
  const doorRibCol = [0.38, 0.42, 0.48];

  const [dCx, dCz] = obbToWorld(obb, 0, doorV);
  emit.pushOrientedBox(dCx, yBase, dCz, obb.ux, obb.uz, obb.vx, obb.vz, doorTotalW * 0.5, doorH, 0.12, doorBgCol);
  for (let p = 0; p < nPanels; p++) {
    const pu = -doorTotalW * 0.5 + (p + 0.5) * panelW;
    const stepOut = (p % 2 === 0 ? 0.16 : 0.28);
    const [px, pz] = obbToWorld(obb, pu, frontSign * (halfV + stepOut));
    emit.pushOrientedBox(px, yBase + 0.05, pz, obb.ux, obb.uz, obb.vx, obb.vz, panelW * 0.47, doorH - 0.15, 0.12, doorPanelCol);
    // Horizontal door stiffener ribs (near-LOD)
    for (const hFrac of [0.28, 0.56, 0.82]) {
      emit.pushOrientedBox(px, yBase + doorH * hFrac, pz, obb.ux, obb.uz, obb.vx, obb.vz, panelW * 0.46, 0.14, 0.16, doorRibCol, false, true);
    }
  }

  // Yellow / black safety chevron lintel beam across the top of the sliding hangar door bay
  const lintelY = yBase + doorH;
  const [linX, linZ] = obbToWorld(obb, 0, frontSign * (halfV + 0.32));
  emit.pushOrientedBox(linX, lintelY, linZ, obb.ux, obb.uz, obb.vx, obb.vz, doorTotalW * 0.5 + 0.6, 0.65, 0.32, steelRibCol);
  const nChev = clamp(Math.round(doorTotalW / 1.8), 8, 28);
  const chevW = doorTotalW / nChev;
  for (let c = 0; c < nChev; c++) {
    const cu = -doorTotalW * 0.5 + (c + 0.5) * chevW;
    const [cxp, czp] = obbToWorld(obb, cu, frontSign * (halfV + 0.50));
    const isYellow = (c & 1) === 0;
    emit.pushOrientedBox(
      cxp, lintelY + 0.06, czp, obb.ux, obb.uz, obb.vx, obb.vz,
      chevW * 0.48, 0.52, 0.16,
      isYellow ? [0.96, 0.76, 0.08] : [0.11, 0.12, 0.14],
      isYellow
    );
  }

  // Twin red aviation corner beacons on opposite roof corners
  for (const [bu, bv] of [[-halfU + 1.2, -halfV + 1.2], [halfU - 1.2, halfV - 1.2]]) {
    const [bx, bz] = obbToWorld(obb, bu, bv);
    emit.pushOrientedBox(bx, yTop, bz, obb.ux, obb.uz, obb.vx, obb.vz, 0.12, 1.5, 0.12, steelRibCol);
    emit.pushOrientedBox(bx, yTop + 1.5, bz, obb.ux, obb.uz, obb.vx, obb.vz, 0.24, 0.34, 0.24, [1.0, 0.16, 0.10], true);
  }
  return { topRoofY: yTop + vaultRise + 0.4 };
}

/**
 * 3. TRAIN STATION:
 * - 10-segment grand vaulted steel-and-glass train shed roof with sky-blue skylight crown & charcoal arch trusses every 9m
 * - Glazed arched end tympanum walls with radiating steel spokes
 * - Monumental stone/steel entrance portico + Square Station Clock Tower (area >= 900 m²) with 4 illuminated clock faces, clock hands & copper spire
 */
function emitTrainStation(ctx, obb, emit) {
  const { yBase, yTop, totalH, area, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;
  const vaultRise = clamp(obb.vLen * 0.22, 3.8, 9.0);

  const segs = 10;
  const vaultPts = [];
  for (let i = 0; i <= segs; i++) {
    const t = -1.0 + (2.0 * i) / segs;
    vaultPts.push({ v: t * (halfV + 0.35), y: yTop + vaultRise * Math.cos(t * Math.PI * 0.5) });
  }

  const haunchCol = [0.34, 0.38, 0.44];
  const skylightGlass = [0.40, 0.72, 0.92];
  const trussCol = [0.17, 0.19, 0.23];
  const glassEndCol = [0.34, 0.62, 0.82];

  // Vault skin: outer 25% metal haunches, central 50% translucent sky-blue skylight
  const panelColorFn = (k, total) => (k >= 2 && k < total - 2 ? skylightGlass : haunchCol);
  emit.pushSweptRoofProfile(obb, -halfU - 0.35, halfU + 0.35, vaultPts, 0.32, panelColorFn, [0.45, 0.50, 0.56], trussCol);

  // Dark charcoal exterior structural arch trusses every ~9m
  const nTrusses = clamp(Math.round(obb.uLen / 9.0), 3, 16);
  const trussPts = vaultPts.map((pt) => ({ v: pt.v, y: pt.y + 0.36 }));
  for (let tIdx = 0; tIdx <= nTrusses; tIdx++) {
    const tu = -halfU + (tIdx / nTrusses) * obb.uLen;
    emit.pushSweptRoofProfile(obb, tu - 0.24, tu + 0.24, trussPts, 0.38, trussCol, trussCol, trussCol);
  }

  // Glazed arched end tympanum walls with radiating steel spokes at both U ends
  for (const endU of [-halfU, halfU]) {
    const nx = endU > 0 ? obb.ux : -obb.ux;
    const nz = endU > 0 ? obb.uz : -obb.uz;
    const [cxp, czp] = obbToWorld(obb, endU, 0);
    for (let k = 0; k < segs; k++) {
      const a = vaultPts[k], b = vaultPts[k + 1];
      const [ax, az] = obbToWorld(obb, endU, a.v);
      const [bx, bz] = obbToWorld(obb, endU, b.v);
      if (endU > 0) {
        emit.pushTri(cxp, yTop, czp, ax, a.y, az, bx, b.y, bz, nx, 0, nz, glassEndCol, true);
      } else {
        emit.pushTri(cxp, yTop, czp, bx, b.y, bz, ax, a.y, az, nx, 0, nz, glassEndCol, true);
      }
      // Radiating steel spoke mullions
      if (k > 0) {
        emit.pushStrut(cxp, yTop, czp, ax, a.y, az, 0.14, trussCol, false, false);
      }
    }
  }

  let topRoofY = yTop + vaultRise + 0.4;
  if (area >= 900) {
    // Central grand arched stone/steel entrance portico on front facade
    const portW = clamp(obb.uLen * 0.28, 8.0, 18.0);
    const portH = clamp(totalH * 0.85, 6.5, 11.5);
    const stoneCol = [0.82, 0.79, 0.72];
    const portMaxProj = clampFacadeProjV(ctx, obb, [-portW * 0.4, 0, portW * 0.4], frontSign * halfV, frontSign, 3.85);
    if (portMaxProj >= 1.95) {
      const [pCx, pCz] = obbToWorld(obb, 0, frontSign * (halfV + 0.9));
      emit.pushOrientedBox(pCx, yBase, pCz, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.5, portH, 0.95, stoneCol);
      // Glazed arch recess & warm canopy marquee
      const [gCx, gCz] = obbToWorld(obb, 0, frontSign * (halfV + 1.88));
      emit.pushOrientedBox(gCx, yBase + 0.2, gCz, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.34, portH * 0.72, 0.12, [0.22, 0.44, 0.62], true);
      const canDepth = Math.min(2.7, portMaxProj - 1.15);
      if (canDepth >= 0.8) {
        const [canX, canZ] = obbToWorld(obb, 0, frontSign * (halfV + 1.15 + canDepth * 0.5));
        emit.pushOrientedBox(canX, yBase + clamp(portH * 0.44, 3.8, 5.2), canZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.46, 0.26, canDepth * 0.5, trussCol);
        emit.pushOrientedBox(canX, yBase + clamp(portH * 0.44, 3.8, 5.2) - 0.10, canZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.42, 0.08, Math.max(0.3, canDepth * 0.37), [1.0, 0.88, 0.60], true, true);
      }
    }

    // Monumental Square Station Clock Tower rising 10-16 m above vault crown
    const anchor = findSafeRoofPoint(ccwOuter, holes, obb, 0, frontSign * halfV * 0.45, 2.5);
    if (anchor.valid) {
      const [twX, twZ] = obbToWorld(obb, anchor.u, anchor.v);
      const twW = clamp(Math.min(obb.uLen, obb.vLen) * 0.16, 4.4, 7.0);
      const halfTw = twW * 0.5;
      const twBaseY = yTop + vaultRise * 0.45;
      const twRise = clamp(10.5 + Math.sqrt(area) * 0.08, 10.5, 16.0);
      const twTopY = yTop + vaultRise + twRise;
      const shaftH = twTopY - twBaseY;

      emit.pushOrientedBox(twX, twBaseY, twZ, obb.ux, obb.uz, obb.vx, obb.vz, halfTw, shaftH, halfTw, stoneCol);
      emit.pushOrientedBox(twX, twTopY - 0.5, twZ, obb.ux, obb.uz, obb.vx, obb.vz, halfTw + 0.35, 0.5, halfTw + 0.35, [0.68, 0.64, 0.58]);

      // Illuminated ivory clock faces + bronze bezel + dark clock hands on all 4 sides
      const clockY = twTopY - halfTw * 1.15 - 0.8;
      const faceHalf = halfTw * 0.56;
      const dialIvory = [0.98, 0.96, 0.88];
      const bezelBronze = [0.24, 0.20, 0.16];
      const handDark = [0.10, 0.11, 0.13];

      const sides = [
        { su: 0, sv: 1, ax: obb.ux, az: obb.uz, bx: obb.vx, bz: obb.vz },
        { su: 0, sv: -1, ax: -obb.ux, az: -obb.uz, bx: -obb.vx, bz: -obb.vz },
        { su: 1, sv: 0, ax: -obb.vx, az: -obb.vz, bx: obb.ux, bz: obb.uz },
        { su: -1, sv: 0, ax: obb.vx, az: obb.vz, bx: -obb.ux, bz: -obb.uz },
      ];
      for (const sd of sides) {
        const fx = twX + sd.su * (halfTw + 0.08) * obb.ux + sd.sv * (halfTw + 0.08) * obb.vx;
        const fz = twZ + sd.su * (halfTw + 0.08) * obb.uz + sd.sv * (halfTw + 0.08) * obb.vz;
        emit.pushOrientedBox(fx, clockY - faceHalf * 1.12, fz, sd.ax, sd.az, sd.bx, sd.bz, faceHalf * 1.12, faceHalf * 2.24, 0.10, bezelBronze);
        emit.pushOrientedBox(fx + sd.bx * 0.08, clockY - faceHalf, fz + sd.bz * 0.08, sd.ax, sd.az, sd.bx, sd.bz, faceHalf, faceHalf * 2.0, 0.08, dialIvory, true);
        // Vertical 12-o'clock minute hand + angled 2-o'clock hour hand
        const hx = fx + sd.bx * 0.18, hz = fz + sd.bz * 0.18;
        emit.pushOrientedBox(hx, clockY, hz, sd.ax, sd.az, sd.bx, sd.bz, 0.08, faceHalf * 0.78, 0.05, handDark);
        emit.pushOrientedBox(hx + sd.ax * faceHalf * 0.28, clockY - 0.05, hz + sd.az * faceHalf * 0.28, sd.ax, sd.az, sd.bx, sd.bz, faceHalf * 0.30, 0.11, 0.05, handDark);
      }

      // Verdigris copper pyramidal spire + finial needle
      const spireH = clamp(twW * 1.15, 4.5, 8.0);
      const spireCol = [0.26, 0.56, 0.48];
      emit.pushCylinder(twX, twTopY, twZ, halfTw * 1.38, 0.18, spireH, 4, spireCol, false, false, Math.PI / 4);
      emit.pushCylinder(twX, twTopY + spireH, twZ, 0.16, 0.05, 2.4, 4, [0.85, 0.78, 0.48]);
      topRoofY = Math.max(topRoofY, twTopY + spireH + 2.4);
    }
  }
  return { topRoofY };
}

/**
 * 4. FERRY TERMINAL:
 * - Undulating dual-crest white marine-grade sweeping wave roof with overhanging eaves & warm cedar timber soffit
 * - Panoramic waterfront promenade balcony band + railings
 * - Nautical signal mast with yardarm & glowing marine beacon
 */
function emitFerryTerminal(ctx, obb, emit) {
  const { yBase, yTop, totalH, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;
  const rawOvU = clamp(obb.uLen * 0.06, 2.5, 4.2);
  const rawOvV = clamp(obb.vLen * 0.14, 2.8, 4.2);
  const ovUPlus = clampFacadeProjU(ctx, obb, halfU, [-halfV * 0.6, 0, halfV * 0.6], 1, rawOvU);
  const ovUMinus = clampFacadeProjU(ctx, obb, -halfU, [-halfV * 0.6, 0, halfV * 0.6], -1, rawOvU);
  const ovVPlus = clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], halfV, 1, rawOvV);
  const ovVMinus = clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], -halfV, -1, rawOvV);

  // Dual-crest sinusoidal nautical wave profile along U (swept across V)
  const waveSegs = 12;
  const waveAmp = clamp(totalH * 0.16, 1.4, 3.0);
  const waveTopCol = [0.94, 0.96, 0.99];
  const cedarSoffit = [0.64, 0.42, 0.24];
  const marineTrim = [0.16, 0.42, 0.66];

  const v0 = -halfV - ovVMinus, v1 = halfV + ovVPlus;
  const uStart = -halfU - ovUMinus, uEnd = halfU + ovUPlus;
  const waveY = (t) => yTop + 0.55 + waveAmp * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.5 - Math.PI * 0.35));

  for (let i = 0; i < waveSegs; i++) {
    const t0 = i / waveSegs, t1 = (i + 1) / waveSegs;
    const ua = uStart + t0 * (uEnd - uStart);
    const ub = uStart + t1 * (uEnd - uStart);
    const ya = waveY(t0), yb = waveY(t1);
    const du = ub - ua, dy = yb - ya;
    const sLen = Math.hypot(du, dy) || 1;
    const nu = -dy / sLen, ny = du / sLen;
    const ntx = nu * obb.ux, nty = ny, ntz = nu * obb.uz;

    const aL = obbToWorld(obb, ua, v0), aR = obbToWorld(obb, ua, v1);
    const bL = obbToWorld(obb, ub, v0), bR = obbToWorld(obb, ub, v1);
    emit.pushQuad(aL[0], ya, aL[1], aR[0], ya, aR[1], bR[0], yb, bR[1], bL[0], yb, bL[1], ntx, nty, ntz, waveTopCol);
    emit.pushQuad(aL[0], ya - 0.48, aL[1], bL[0], yb - 0.48, bL[1], bR[0], yb - 0.48, bR[1], aR[0], ya - 0.48, aR[1], -ntx, -nty, -ntz, cedarSoffit);
    // Overhang fascia trim along +V and -V eaves
    emit.pushQuad(aR[0], ya - 0.48, aR[1], aR[0], ya, aR[1], bR[0], yb, bR[1], bR[0], yb - 0.48, bR[1], obb.vx, 0, obb.vz, marineTrim);
    emit.pushQuad(bL[0], yb - 0.48, bL[1], bL[0], yb, bL[1], aL[0], ya, aL[1], aL[0], ya - 0.48, aL[1], -obb.vx, 0, -obb.vz, marineTrim);
  }

  // Harbor concourse promenade deck & white marine railing along the front/harbor sides
  const promY = yBase + clamp(totalH * 0.42, 3.6, 4.8);
  for (const sgn of [-1, 1]) {
    const promDepth = clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], sgn * halfV, sgn, 2.25);
    if (promDepth <= 0) continue;
    const [px, pz] = obbToWorld(obb, 0, sgn * (halfV + promDepth * 0.5));
    emit.pushOrientedBox(px, promY, pz, obb.ux, obb.uz, obb.vx, obb.vz, halfU + 0.6, 0.24, promDepth * 0.5, waveTopCol);
    const [rx, rz] = obbToWorld(obb, 0, sgn * (halfV + promDepth - 0.1));
    emit.pushOrientedBox(rx, promY + 0.95, rz, obb.ux, obb.uz, obb.vx, obb.vz, halfU + 0.6, 0.08, 0.08, waveTopCol, false, true);
  }

  // Nautical signal mast with yardarm, radar scanner bar & cyan/amber beacon
  let topRoofY = yTop + 0.55 + waveAmp;
  const anchor = findSafeRoofPoint(ccwOuter, holes, obb, obb.uLen * 0.2, frontSign * obb.vLen * 0.15, 1.5);
  if (anchor.valid) {
    const [mx, mz] = obbToWorld(obb, anchor.u, anchor.v);
    const mBaseY = yTop + waveAmp * 0.6;
    const mastH = clamp(totalH * 0.65, 7.5, 11.5);
    emit.pushCylinder(mx, mBaseY, mz, 0.34, 0.12, mastH, 6, [0.92, 0.94, 0.97]);
    // Cross-yardarm + radar bar + beacon
    emit.pushOrientedBox(mx, mBaseY + mastH * 0.68, mz, obb.ux, obb.uz, obb.vx, obb.vz, 2.4, 0.14, 0.14, [0.92, 0.94, 0.97]);
    emit.pushOrientedBox(mx, mBaseY + mastH * 0.86, mz, obb.ux, obb.uz, obb.vx, obb.vz, 1.1, 0.24, 0.18, [0.22, 0.25, 0.30]);
    emit.pushOrientedBox(mx, mBaseY + mastH, mz, obb.ux, obb.uz, obb.vx, obb.vz, 0.28, 0.42, 0.28, [0.20, 0.92, 0.96], true);
    topRoofY = Math.max(topRoofY, mBaseY + mastH + 0.5);
  }
  return { topRoofY };
}

/**
 * 5. HOSPITAL:
 * - Crisp horizontal white sun-visor floor slabs along primary facades
 * - Emergency / Ambulance Drop-Off Porte-Cochère Canopy with red fascia trim + warm ambulance bay lighting
 * - Prominent 3D Red Cross (+) emblem on both entrance canopy and upper main facade
 * - Detailed Rooftop Octagonal Helipad ('H', perimeter safety net, green threshold lights, windsock)
 */
function emitHospital(ctx, obb, emit) {
  const { yBase, yTop, totalH, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;

  const crispWhite = [0.95, 0.97, 0.99];
  const medRed = [0.90, 0.12, 0.12];
  const darkSlate = [0.20, 0.22, 0.25];

  // Horizontal clinical sun-visor slabs along both long walls
  const slabStep = 3.8;
  const nSlabs = clamp(Math.floor((totalH - 4.2) / slabStep), 1, 14);
  const visorOk = {
    [-1]: clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], -halfV, -1, 0.56, 0.5) > 0,
    [1]: clampFacadeProjV(ctx, obb, [-halfU * 0.7, 0, halfU * 0.7], halfV, 1, 0.56, 0.5) > 0,
  };
  for (let s = 1; s <= nSlabs; s++) {
    const sy = yBase + 4.2 + s * slabStep;
    if (sy > yTop - 0.8) break;
    if (s % 2 === 1 || nSlabs <= 4) {
      for (const sgn of [-1, 1]) {
        if (!visorOk[sgn]) continue;
        const [sx, sz] = obbToWorld(obb, 0, sgn * (halfV + 0.24));
        emit.pushOrientedBox(sx, sy, sz, obb.ux, obb.uz, obb.vx, obb.vz, halfU + 0.18, 0.16, 0.32, crispWhite, false, true);
      }
    }
  }

  // Helper to emit a crisp 3D Red Cross (+) emblem facing along normal (frontSign * V)
  const emitRedCross = (cx, cy, cz, size) => {
    const plaqueR = size * 0.68;
    const armLen = size * 0.48;
    const armThick = size * 0.17;
    const fVx = frontSign * obb.vx, fVz = frontSign * obb.vz;
    emit.pushOrientedBox(cx, cy - plaqueR, cz, obb.ux, obb.uz, fVx, fVz, plaqueR, plaqueR * 2, 0.12, crispWhite, true);
    const [rx, rz] = [cx + fVx * 0.16, cz + fVz * 0.16];
    emit.pushOrientedBox(rx, cy - armLen, rz, obb.ux, obb.uz, fVx, fVz, armThick, armLen * 2, 0.10, medRed, true);
    emit.pushOrientedBox(rx, cy - armThick, rz, obb.ux, obb.uz, fVx, fVz, armLen, armThick * 2, 0.10, medRed, true);
  };

  // Emergency / Ambulance Drop-Off Porte-Cochère Canopy on primary front
  const portW = clamp(obb.uLen * 0.34, 8.5, 16.0);
  const portProj = clampFacadeProjV(ctx, obb, [-portW * 0.4, 0, portW * 0.4], frontSign * halfV, frontSign, 4.8);
  const portY = yBase + clamp(totalH * 0.32, 4.0, 4.8);
  if (portProj > 0) {
    const [canX, canZ] = obbToWorld(obb, 0, frontSign * (halfV + portProj * 0.5));
    emit.pushOrientedBox(canX, portY, canZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.5, 0.38, portProj * 0.5, crispWhite);
    // Bold red emergency fascia trim around canopy front & sides
    const [fasX, fasZ] = obbToWorld(obb, 0, frontSign * (halfV + portProj + 0.06));
    emit.pushOrientedBox(fasX, portY + 0.32, fasZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.5 + 0.15, 0.38, 0.16, medRed, true);
    // Twin crisp white canopy support piers
    if (portProj >= 1.2) {
      for (const colU of [-portW * 0.42, portW * 0.42]) {
        const [cxp, czp] = obbToWorld(obb, colU, frontSign * (halfV + Math.max(0.4, portProj - 0.55)));
        emit.pushOrientedBox(cxp, yBase, czp, obb.ux, obb.uz, obb.vx, obb.vz, 0.32, portY, 0.32, crispWhite);
      }
    }
    // Bright warm ambulance bay under-canopy light
    const [ambX, ambZ] = obbToWorld(obb, 0, frontSign * (halfV + portProj * 0.45));
    emit.pushOrientedBox(ambX, portY - 0.12, ambZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.38, 0.08, Math.min(0.8, portProj * 0.3), [1.0, 0.95, 0.86], true, true);
    // Canopy Red Cross
    emitRedCross(fasX + frontSign * obb.vx * 0.16, portY + 0.55, fasZ + frontSign * obb.vz * 0.16, 1.35);
  }
  if (totalH >= 8.5) {
    const upperSize = clamp(totalH * 0.15, 1.8, 3.8);
    const upperY = Math.max(portY + upperSize + 1.4, yTop - upperSize * 0.95 - 0.6);
    const [uCx, uCz] = obbToWorld(obb, 0, frontSign * (halfV + 0.18));
    emitRedCross(uCx, upperY, uCz, upperSize);
  }

  // Detailed Rooftop Octagonal Helipad
  let topRoofY = yTop;
  const minSpan = Math.min(obb.uLen, obb.vLen);
  if (minSpan >= 9.0) {
    const heliR = clamp(minSpan * 0.28, 3.8, 6.2);
    const anchor = findSafeRoofPoint(ccwOuter, holes, obb, 0, 0, heliR * 0.65);
    if (anchor.valid) {
      const [hx, hz] = obbToWorld(obb, anchor.u, anchor.v);
      const padY = yTop + 0.45;
      // Support pedestal + octagonal perimeter safety net + dark landing pad
      emit.pushCylinder(hx, yTop - 0.1, hz, heliR * 0.72, heliR * 0.78, 0.55, 8, [0.68, 0.72, 0.76], false, false, Math.PI / 8);
      emit.pushCylinder(hx, padY - 0.12, hz, heliR + 0.95, heliR + 1.05, 0.12, 8, [0.46, 0.50, 0.55], false, true, Math.PI / 8);
      emit.pushCylinder(hx, padY, hz, heliR, heliR, 0.24, 8, darkSlate, false, false, Math.PI / 8);

      // White octagonal circle border + bright Red 'H' marking
      const hSpan = heliR * 0.72;
      const hThick = Math.max(0.28, heliR * 0.11);
      const padTop = padY + 0.24;
      emit.pushOrientedBox(hx - hSpan * 0.42 * obb.ux, padTop, hz - hSpan * 0.42 * obb.uz, obb.ux, obb.uz, obb.vx, obb.vz, hThick * 0.5, 0.08, hSpan * 0.5, medRed, true);
      emit.pushOrientedBox(hx + hSpan * 0.42 * obb.ux, padTop, hz + hSpan * 0.42 * obb.uz, obb.ux, obb.uz, obb.vx, obb.vz, hThick * 0.5, 0.08, hSpan * 0.5, medRed, true);
      emit.pushOrientedBox(hx, padTop, hz, obb.ux, obb.uz, obb.vx, obb.vz, hSpan * 0.42, 0.08, hThick * 0.5, medRed, true);

      // 8 perimeter green threshold beacon lights
      const greenLight = [0.16, 0.96, 0.42];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const lx = hx + Math.cos(ang) * (heliR * 0.88);
        const lz = hz + Math.sin(ang) * (heliR * 0.88);
        emit.pushOrientedBox(lx, padTop, lz, obb.ux, obb.uz, obb.vx, obb.vz, 0.16, 0.22, 0.16, greenLight, true);
      }
      // Orange windsock mast beside pad
      const wx = hx + (heliR + 0.8) * obb.ux, wz = hz + (heliR + 0.8) * obb.uz;
      emit.pushOrientedBox(wx, padY, wz, obb.ux, obb.uz, obb.vx, obb.vz, 0.07, 1.9, 0.07, crispWhite, false, true);
      emit.pushOrientedBox(wx + 0.42 * obb.ux, padY + 1.6, wz + 0.42 * obb.uz, obb.ux, obb.uz, obb.vx, obb.vz, 0.38, 0.26, 0.14, [0.98, 0.42, 0.08], true, true);
      topRoofY = Math.max(topRoofY, padY + 2.0);
    }
  }
  return { topRoofY };
}

/**
 * 6. MUSEUM:
 * - Broad front travertine stone entrance steps + raised stylobate terrace
 * - Full fluted classical front colonnade with entablature, true angled triangular pediment & vertical exhibition banners
 * - Central rooftop crystalline glass pyramid (or vaulted skylight dome)
 */
function emitMuseum(ctx, obb, emit) {
  const { yBase, yTop, totalH, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;

  const limestone = [0.89, 0.85, 0.77];
  const stepStone = [0.81, 0.77, 0.69];
  const shadowStone = [0.74, 0.70, 0.62];

  // Monumental front colonnade & stepped terrace along primary facade
  const colW = clamp(obb.uLen * 0.56, 10.0, 28.0);
  const rawPortDepth = clamp(obb.vLen * 0.14, 2.4, 3.8);
  const maxStairExt = clampFacadeProjV(ctx, obb, [-colW * 0.42, 0, colW * 0.42], frontSign * halfV, frontSign, rawPortDepth + 1.5);
  const portDepth = maxStairExt > 0 ? clampFacadeProjV(ctx, obb, [-colW * 0.42, 0, colW * 0.42], frontSign * halfV, frontSign, rawPortDepth) : 0;
  const colH = clamp(totalH * 0.72, 5.2, 10.5);
  const stepRise = 0.85;

  // 3 wide front entrance stone steps + stylobate deck
  if (maxStairExt > 0) {
    const stepStride = Math.min(0.52, maxStairExt * 0.16);
    for (let st = 0; st < 3; st++) {
      const ext = Math.max(0.4, maxStairExt - st * stepStride);
      const [sx, sz] = obbToWorld(obb, 0, frontSign * (halfV + ext * 0.5));
      emit.pushOrientedBox(sx, yBase + st * 0.28, sz, obb.ux, obb.uz, obb.vx, obb.vz, colW * 0.5 + (2 - st) * 0.45, 0.28, ext * 0.5, stepStone);
    }
  }

  // Fluted front columns + vertical exhibition banners between bays + entablature + pediment
  if (portDepth > 0) {
    const nCols = clamp(Math.round(colW / 3.2) | 1, 5, 11); // odd count creates clear central entry bay
    const colCenterV = frontSign * (halfV + portDepth - 0.55);
    const colSpanU = colW - 1.4;
    const colBaseY = yBase + stepRise;
    const colShaftH = Math.max(3.6, colH - 0.7);
    for (let c = 0; c < nCols; c++) {
      const cu = -colSpanU * 0.5 + (c / (nCols - 1)) * colSpanU;
      const [cxp, czp] = obbToWorld(obb, cu, colCenterV);
      emit.pushOrientedBox(cxp, colBaseY, czp, obb.ux, obb.uz, obb.vx, obb.vz, 0.44, 0.34, 0.44, shadowStone);
      emit.pushCylinder(cxp, colBaseY + 0.34, czp, 0.36, 0.30, colShaftH, 10, limestone);
      emit.pushOrientedBox(cxp, colBaseY + 0.34 + colShaftH, czp, obb.ux, obb.uz, obb.vx, obb.vz, 0.46, 0.36, 0.46, limestone);

      // Vertical cultural exhibition banners in outer bays (leaving central entry bay open)
      if (c < nCols - 1 && Math.abs(c - (nCols - 2) * 0.5) > 0.6 && c % 2 === 0) {
        const bu = cu + colSpanU / ((nCols - 1) * 2);
        const [bx, bz] = obbToWorld(obb, bu, colCenterV - frontSign * 0.22);
        const bannerCol = (c % 4 === 0) ? [0.74, 0.16, 0.20] : [0.16, 0.36, 0.66];
        emit.pushOrientedBox(bx, colBaseY + colShaftH * 0.26, bz, obb.ux, obb.uz, obb.vx, obb.vz, 0.55, colShaftH * 0.58, 0.06, bannerCol, false, true);
      }
    }

    // Entablature frieze beam + true angled triangular pediment
    const entY = colBaseY + 0.34 + colShaftH + 0.36;
    const entH = 0.85;
    const [entX, entZ] = obbToWorld(obb, 0, frontSign * (halfV + portDepth * 0.5));
    emit.pushOrientedBox(entX, entY, entZ, obb.ux, obb.uz, obb.vx, obb.vz, colW * 0.5 + 0.35, entH, portDepth * 0.5 + 0.25, limestone);

    const pedY0 = entY + entH;
    const pedRise = clamp(colW * 0.11, 1.5, 3.0);
    const pedHalfU = colW * 0.5 + 0.45;
    const vIn = frontSign * halfV;
    const vOut = frontSign * (halfV + portDepth + 0.30);
    const [pLIn, pRIn, pApexIn] = [obbToWorld(obb, -pedHalfU, vIn), obbToWorld(obb, pedHalfU, vIn), obbToWorld(obb, 0, vIn)];
    const [pLOut, pROut, pApexOut] = [obbToWorld(obb, -pedHalfU, vOut), obbToWorld(obb, pedHalfU, vOut), obbToWorld(obb, 0, vOut)];
    const fNx = frontSign * obb.vx, fNz = frontSign * obb.vz;

    if (frontSign > 0) {
      emit.pushTri(pLOut[0], pedY0, pLOut[1], pApexOut[0], pedY0 + pedRise, pApexOut[1], pROut[0], pedY0, pROut[1], fNx, 0, fNz, shadowStone);
      emit.pushTri(pRIn[0], pedY0, pRIn[1], pApexIn[0], pedY0 + pedRise, pApexIn[1], pLIn[0], pedY0, pLIn[1], -fNx, 0, -fNz, shadowStone);
      emit.pushQuad(pLIn[0], pedY0, pLIn[1], pApexIn[0], pedY0 + pedRise, pApexIn[1], pApexOut[0], pedY0 + pedRise, pApexOut[1], pLOut[0], pedY0, pLOut[1], null, null, null, limestone);
      emit.pushQuad(pApexIn[0], pedY0 + pedRise, pApexIn[1], pRIn[0], pedY0, pRIn[1], pROut[0], pedY0, pROut[1], pApexOut[0], pedY0 + pedRise, pApexOut[1], null, null, null, limestone);
    } else {
      emit.pushTri(pROut[0], pedY0, pROut[1], pApexOut[0], pedY0 + pedRise, pApexOut[1], pLOut[0], pedY0, pLOut[1], fNx, 0, fNz, shadowStone);
      emit.pushTri(pLIn[0], pedY0, pLIn[1], pApexIn[0], pedY0 + pedRise, pApexIn[1], pRIn[0], pedY0, pRIn[1], -fNx, 0, -fNz, shadowStone);
      emit.pushQuad(pLOut[0], pedY0, pLOut[1], pApexOut[0], pedY0 + pedRise, pApexOut[1], pApexIn[0], pedY0 + pedRise, pApexIn[1], pLIn[0], pedY0, pLIn[1], null, null, null, limestone);
      emit.pushQuad(pApexOut[0], pedY0 + pedRise, pApexOut[1], pROut[0], pedY0, pROut[1], pRIn[0], pedY0, pRIn[1], pApexIn[0], pedY0 + pedRise, pApexIn[1], null, null, null, limestone);
    }
  }

  // Central Rooftop Crystalline Glass Pyramid or Vaulted Skylight Dome
  let topRoofY = yTop;
  const minSpan = Math.min(obb.uLen, obb.vLen);
  if (minSpan >= 11.0) {
    const atrSize = clamp(minSpan * 0.44, 5.5, 16.0);
    const anchor = findSafeRoofPoint(ccwOuter, holes, obb, 0, 0, atrSize * 0.45);
    if (anchor.valid) {
      const [ax, az] = obbToWorld(obb, anchor.u, anchor.v);
      const usePyramid = (hashStr(ctx.name || '') & 1) === 0;
      const glassCol = [0.36, 0.68, 0.88];
      const frameCol = [0.18, 0.21, 0.25];
      const warmGlow = [1.0, 0.88, 0.62];

      // Stone plinth curb
      emit.pushOrientedBox(ax, yTop - 0.1, az, obb.ux, obb.uz, obb.vx, obb.vz, atrSize * 0.54, 0.55, atrSize * 0.54, limestone);
      if (usePyramid) {
        const pyrH = clamp(atrSize * 0.62, 3.8, 9.5);
        const py0 = yTop + 0.45;
        const hS = atrSize * 0.50;
        const c0 = obbToWorld(obb, anchor.u - hS, anchor.v - hS);
        const c1 = obbToWorld(obb, anchor.u + hS, anchor.v - hS);
        const c2 = obbToWorld(obb, anchor.u + hS, anchor.v + hS);
        const c3 = obbToWorld(obb, anchor.u - hS, anchor.v + hS);
        const apexY = py0 + pyrH;
        emit.pushTri(c0[0], py0, c0[1], ax, apexY, az, c1[0], py0, c1[1], null, null, null, glassCol, true);
        emit.pushTri(c1[0], py0, c1[1], ax, apexY, az, c2[0], py0, c2[1], null, null, null, glassCol, true);
        emit.pushTri(c2[0], py0, c2[1], ax, apexY, az, c3[0], py0, c3[1], null, null, null, glassCol, true);
        emit.pushTri(c3[0], py0, c3[1], ax, apexY, az, c0[0], py0, c0[1], null, null, null, glassCol, true);
        for (const corner of [c0, c1, c2, c3]) {
          emit.pushStrut(corner[0], py0, corner[1], ax, apexY, az, 0.14, frameCol);
        }
        topRoofY = Math.max(topRoofY, apexY);
      } else {
        const drumR = atrSize * 0.46;
        const drumH = 1.6;
        const domeH = clamp(drumR * 0.85, 2.8, 6.8);
        const dy0 = yTop + 0.45;
        emit.pushCylinder(ax, dy0, az, drumR, drumR, drumH, 10, limestone);
        emit.pushCylinder(ax, dy0 + drumH, az, drumR * 0.96, drumR * 0.58, domeH * 0.55, 10, glassCol, true);
        emit.pushCylinder(ax, dy0 + drumH + domeH * 0.55, az, drumR * 0.58, 0.25, domeH * 0.45, 10, glassCol, true);
        emit.pushCylinder(ax, dy0 + drumH + domeH, az, 0.65, 0.20, 1.3, 8, warmGlow, true);
        topRoofY = Math.max(topRoofY, dy0 + drumH + domeH + 1.3);
      }
    }
  }
  return { topRoofY };
}

/**
 * 7. SHOPPING MALL:
 * - Double-height glazed retail entrance portal with cantilevered glass-and-steel marquee
 * - Warm-lit architectural signage fascia bands
 * - Longitudinal vaulted glass skylight atrium running along the roof center
 */
function emitMall(ctx, obb, emit) {
  const { yBase, yTop, totalH, ccwOuter, holes } = ctx;
  const frontSign = pickPrimaryFrontSide(ccwOuter, obb);
  const halfU = obb.uLen * 0.5;
  const halfV = obb.vLen * 0.5;

  const steelCol = [0.22, 0.25, 0.29];
  const glassCol = [0.36, 0.66, 0.88];
  const amberSign = [0.98, 0.72, 0.20];
  const cyanSign = [0.18, 0.72, 0.96];
  const warmGlow = [1.0, 0.88, 0.60];

  // Double-height glazed retail entrance portal + cantilevered glass marquee
  const portW = clamp(obb.uLen * 0.34, 8.0, 18.0);
  const portH = clamp(totalH * 0.58, 5.2, 8.2);
  const marqProj = clampFacadeProjV(ctx, obb, [-portW * 0.42, 0, portW * 0.42], frontSign * halfV, frontSign, 3.2);
  if (marqProj > 0) {
    const [pCx, pCz] = obbToWorld(obb, 0, frontSign * (halfV + 0.35));
    emit.pushOrientedBox(pCx, yBase, pCz, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.46, portH, 0.45, glassCol, true);
    for (const colU of [-portW * 0.48, portW * 0.48]) {
      const [cxp, czp] = obbToWorld(obb, colU, frontSign * (halfV + 0.55));
      emit.pushOrientedBox(cxp, yBase, czp, obb.ux, obb.uz, obb.vx, obb.vz, 0.34, portH + 0.5, 0.48, steelCol);
    }

    const [marqX, marqZ] = obbToWorld(obb, 0, frontSign * (halfV + marqProj * 0.5));
    emit.pushOrientedBox(marqX, yBase + portH - 0.15, marqZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.52, 0.24, marqProj * 0.5, [0.26, 0.52, 0.72]);
    const [fasX, fasZ] = obbToWorld(obb, 0, frontSign * (halfV + marqProj + 0.08));
    emit.pushOrientedBox(fasX, yBase + portH + 0.05, fasZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.54, 0.42, 0.14, amberSign, true);
    emit.pushOrientedBox(marqX, yBase + portH - 0.26, marqZ, obb.ux, obb.uz, obb.vx, obb.vz, portW * 0.44, 0.08, Math.min(0.55, marqProj * 0.25), warmGlow, true, true);
  }

  // Upper facade architectural signage fascia band
  if (totalH >= 8.0) {
    const [upX, upZ] = obbToWorld(obb, 0, frontSign * (halfV + 0.18));
    emit.pushOrientedBox(upX, yTop - 1.35, upZ, obb.ux, obb.uz, obb.vx, obb.vz, Math.min(halfU * 0.75, 22.0), 0.45, 0.16, cyanSign, true);
  }

  // Longitudinal Vaulted Glass Skylight Atrium along roof center
  let topRoofY = yTop;
  const atrLen = obb.uLen * 0.68;
  const atrHalfV = clamp(obb.vLen * 0.15, 1.8, 5.5);
  const atrRise = clamp(atrHalfV * 0.65, 1.4, 3.6);
  const anchor = findSafeRoofPoint(ccwOuter, holes, obb, 0, 0, Math.min(atrHalfV * 0.7, 2.5));
  if (anchor.valid && atrLen >= 8.0) {
    const curbY = yTop - 0.05;
    const curbH = 0.65;
    const [ax, az] = obbToWorld(obb, anchor.u, anchor.v);
    emit.pushOrientedBox(ax, curbY, az, obb.ux, obb.uz, obb.vx, obb.vz, atrLen * 0.5, curbH, atrHalfV + 0.25, [0.76, 0.77, 0.79]);
    // Warm glowing atrium core under skylight
    emit.pushOrientedBox(ax, curbY + curbH * 0.4, az, obb.ux, obb.uz, obb.vx, obb.vz, atrLen * 0.46, atrRise * 0.45, atrHalfV * 0.55, warmGlow, true);

    const segs = 6;
    const vaultPts = [];
    for (let i = 0; i <= segs; i++) {
      const t = -1.0 + (2.0 * i) / segs;
      vaultPts.push({ v: anchor.v + t * atrHalfV, y: curbY + curbH + atrRise * Math.cos(t * Math.PI * 0.5) });
    }
    const u0 = anchor.u - atrLen * 0.5;
    const u1 = anchor.u + atrLen * 0.5;
    emit.pushSweptRoofProfile(obb, u0, u1, vaultPts, 0.16, glassCol, warmGlow, steelCol, true);

    // Transverse aluminum skylight arch ribs every ~5.5m
    const nRibs = clamp(Math.round(atrLen / 5.5), 3, 14);
    const ribPts = vaultPts.map((pt) => ({ v: pt.v, y: pt.y + 0.16 }));
    for (let r = 0; r <= nRibs; r++) {
      const ru = u0 + (r / nRibs) * atrLen;
      emit.pushSweptRoofProfile(obb, ru - 0.14, ru + 0.14, ribPts, 0.18, [0.88, 0.90, 0.93], steelCol, steelCol);
    }
    topRoofY = Math.max(topRoofY, curbY + curbH + atrRise + 0.25);
  }
  return { topRoofY };
}

/**
 * Main entry point: emits dedicated 3D architectural geometry for a special site building.
 * @param {object} ctx
 * @returns {{ specialType: string, topRoofY: number } | null}
 */
export function emitSpecialSiteArchitecture(ctx) {
  if (!ctx || !ctx.pos || !ctx.norm || !ctx.col) return null;
  const specialType = resolveSpecialSiteType(ctx.btype, ctx.name, ctx.area);
  if (!specialType) return null;

  const obb = computeFootprintOBB(ctx.ccwOuter, ctx.minX, ctx.maxX, ctx.minZ, ctx.maxZ);
  const emit = createEmitter(ctx);

  let res = null;
  switch (specialType) {
    case 'airport_terminal':
      res = emitAirportTerminal(ctx, obb, emit);
      break;
    case 'airport_hangar':
      res = emitAirportHangar(ctx, obb, emit);
      break;
    case 'train_station':
      res = emitTrainStation(ctx, obb, emit);
      break;
    case 'ferry_terminal':
      res = emitFerryTerminal(ctx, obb, emit);
      break;
    case 'hospital':
      res = emitHospital(ctx, obb, emit);
      break;
    case 'museum':
      res = emitMuseum(ctx, obb, emit);
      break;
    case 'mall':
      res = emitMall(ctx, obb, emit);
      break;
    default:
      return null;
  }

  // Ensure uv buffer stays synchronized if any caller omitted uv entries earlier
  if (ctx.uv) {
    const targetUvLen = (ctx.pos.length / 3) * 2;
    while (ctx.uv.length < targetUvLen) ctx.uv.push(0.0, 0.0);
  }

  return {
    specialType,
    topRoofY: res && Number.isFinite(res.topRoofY) ? res.topRoofY : ctx.yTop,
  };
}
