import * as THREE from '../../vendor/three.module.js';
import { selectFacadeForBuilding, facadeUvBase, facadeV, DOOR_CATALOG } from '../wfc/wfc_mesh_builder.js';
import { RM, planRoof, roofRise, emitRoof } from './roofs.js'; // [roofs]
import { roofFlav, addHouse, roofSinkFor } from './roofs_chunk.js'; // [roofs]

/**
 * [ground] Infill buildings: the footprints past the per-chunk detailed-build budget (global_tiles.js flags them with
 * tuple[13] = 1). Dense districts map 1-2.5k buildings per km^2 and only the 420 biggest get the full WFC build;
 * these fill the rest of the block as rich, multi-archetype 3D architectural models (foundation plinths, entrance doors,
 * porches, garage wings, rowhouse stoops & bay windows, East Asian gates & lattices, Mediterranean loggias & turrets,
 * mid-rise retail podiums & balconies, and multi-tier high-rise setbacks) while staying fast and memory-efficient.
 */
export const INFILL_MAX = 2000; // per chunk, on top of the 420 detailed ones

const tmpContour = [];

// Deterministic hash helper -> [0, 1)
function hash01(seed, salt) {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function scaleRgb(rgb, s) {
  return [clamp01(rgb[0] * s), clamp01(rgb[1] * s), clamp01(rgb[2] * s)];
}

function mixRgb(a, b, t) {
  const it = 1 - t;
  return [
    clamp01(a[0] * it + b[0] * t),
    clamp01(a[1] * it + b[1] * t),
    clamp01(a[2] * it + b[2] * t),
  ];
}

// ------------------------------------------------------------------------------------------------------------------
// Low-allocation buffer emission primitives (guaranteed pos/norm/col/uv/triEntity sync)
// ------------------------------------------------------------------------------------------------------------------

function syncTriEntity(out) {
  if (!out) return;
  const totalVerts = (out.pos.length / 3) | 0;
  if (out.uv) {
    const targetUv = totalVerts * 2;
    while (out.uv.length < targetUv) out.uv.push(0.0, 0.0);
  }
  if (Array.isArray(out.triEntity)) {
    const targetTris = (out.pos.length / 9) | 0;
    const eIdx = out.entityIdx ?? 0;
    while (out.triEntity.length < targetTris) {
      out.triEntity.push(eIdx);
    }
  }
}

function pushTri(
  out,
  ax, ay, az,
  bx, by, bz,
  cx, cy, cz,
  nx, ny, nz,
  r, g, b,
  uA = 0.0, vA = 0.0,
  uB = 0.0, vB = 0.0,
  uC = 0.0, vC = 0.0,
  emissive = false
) {
  const { pos, norm, col, uv, triEntity } = out;
  const nScale = emissive ? 2.0 : 1.0;
  const snx = nx * nScale, sny = ny * nScale, snz = nz * nScale;
  pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  norm.push(snx, sny, snz, snx, sny, snz, snx, sny, snz);
  col.push(r, g, b, r, g, b, r, g, b);
  if (uv) uv.push(uA, vA, uB, vB, uC, vC);
  if (triEntity) triEntity.push(out.entityIdx ?? 0);
}

/**
 * Emits a 2-triangle quad with vertices A (bottom-left), B (top-left), C (top-right), D (bottom-right).
 */
function pushQuadGrad(
  out,
  ax, ay, az,
  bx, by, bz,
  cx, cy, cz,
  dx, dy, dz,
  nx, ny, nz,
  rB, gB, bB,
  rT, gT, bT,
  u0 = 0.0, v0 = 0.0,
  u1 = 0.0, v1 = 0.0,
  emissive = false
) {
  const { pos, norm, col, uv, triEntity } = out;
  const nScale = emissive ? 2.0 : 1.0;
  const snx = nx * nScale, sny = ny * nScale, snz = nz * nScale;
  pos.push(
    ax, ay, az, bx, by, bz, cx, cy, cz,
    ax, ay, az, cx, cy, cz, dx, dy, dz
  );
  for (let k = 0; k < 6; k++) norm.push(snx, sny, snz);
  col.push(
    rB, gB, bB, rT, gT, bT, rT, gT, bT,
    rB, gB, bB, rT, gT, bT, rB, gB, bB
  );
  if (uv) {
    uv.push(
      u0, v0, u0, v1, u1, v1,
      u0, v0, u1, v1, u1, v0
    );
  }
  if (triEntity) {
    const eIdx = out.entityIdx ?? 0;
    triEntity.push(eIdx, eIdx);
  }
}

function pushQuadFlat(
  out,
  ax, ay, az,
  bx, by, bz,
  cx, cy, cz,
  dx, dy, dz,
  nx, ny, nz,
  rgb,
  shade = 1.0,
  u0 = 0.0, v0 = 0.0,
  u1 = 0.0, v1 = 0.0,
  emissive = false
) {
  const r = clamp01(rgb[0] * shade);
  const g = clamp01(rgb[1] * shade);
  const b = clamp01(rgb[2] * shade);
  pushQuadGrad(
    out,
    ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz,
    nx, ny, nz,
    r, g, b, r, g, b,
    u0, v0, u1, v1,
    emissive
  );
}

/**
 * Pushes a 3D box in local wall coordinates:
 * - u in [u0, u1]: distance along wall tangent (tx, tz) from (x1, z1)
 * - v in [v0, v1]: vertical height above base y0
 * - n in [n0, n1]: normal offset along outward normal (nx, nz)
 * Solid architectural trim uses uv = (0, 0) so wfcBldgMat shades vertex RGB with full PBR lighting.
 */
function pushWallBox(out, x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, emissive = false) {
  const fBLx = x1 + u0 * tx + n1 * nx, fBLz = z1 + u0 * tz + n1 * nz;
  const fBRx = x1 + u1 * tx + n1 * nx, fBRz = z1 + u1 * tz + n1 * nz;
  const yBot = y0 + v0, yTop = y0 + v1;

  // Front face (+normal)
  pushQuadFlat(
    out,
    fBLx, yBot, fBLz,
    fBLx, yTop, fBLz,
    fBRx, yTop, fBRz,
    fBRx, yBot, fBRz,
    nx, 0, nz,
    rgb, 1.0, 0.0, 0.0, 0.0, 0.0, emissive
  );

  if (Math.abs(n1 - n0) > 0.02) {
    const bBLx = x1 + u0 * tx + n0 * nx, bBLz = z1 + u0 * tz + n0 * nz;
    const bBRx = x1 + u1 * tx + n0 * nx, bBRz = z1 + u1 * tz + n0 * nz;

    // Top face (+Y)
    pushQuadFlat(
      out,
      bBLx, yTop, bBLz,
      bBRx, yTop, bBRz,
      fBRx, yTop, fBRz,
      fBLx, yTop, fBLz,
      0, 1, 0,
      rgb, 1.06, 0.0, 0.0, 0.0, 0.0, emissive
    );
    // Bottom face (-Y) when protruding significantly
    if (Math.abs(n1 - n0) > 0.14) {
      pushQuadFlat(
        out,
        fBLx, yBot, fBLz,
        fBRx, yBot, fBRz,
        bBRx, yBot, bBRz,
        bBLx, yBot, bBLz,
        0, -1, 0,
        rgb, 0.72, 0.0, 0.0, 0.0, 0.0, emissive
      );
    }
    // Left face (-tangent)
    pushQuadFlat(
      out,
      bBLx, yBot, bBLz,
      bBLx, yTop, bBLz,
      fBLx, yTop, fBLz,
      fBLx, yBot, fBLz,
      -tx, 0, -tz,
      rgb, 0.88, 0.0, 0.0, 0.0, 0.0, emissive
    );
    // Right face (+tangent)
    pushQuadFlat(
      out,
      fBRx, yBot, fBRz,
      fBRx, yTop, fBRz,
      bBRx, yTop, bBRz,
      bBRx, yBot, bBRz,
      tx, 0, tz,
      rgb, 0.88, 0.0, 0.0, 0.0, 0.0, emissive
    );
  }
}

/**
 * Pushes a 3D sloped overhang/canopy/porch roof in wall coordinates:
 * - Slopes from height (y0 + vBack) at normal offset n0 down to (y0 + vFront) at normal offset n1.
 * - Uses procedural roof UVs (u = rMat * 1000 + 300 + s, v = -20 - t) on the sloped top surface.
 */
function pushSlopedWallCanopy(
  out, x1, y0, z1, tx, tz, nx, nz,
  u0, u1, vBack, vFront, n0, n1,
  roofRgb, trimRgb, rMat = RM.shingle
) {
  const bLx = x1 + u0 * tx + n0 * nx, bLz = z1 + u0 * tz + n0 * nz;
  const bRx = x1 + u1 * tx + n0 * nx, bRz = z1 + u1 * tz + n0 * nz;
  const fLx = x1 + u0 * tx + n1 * nx, fLz = z1 + u0 * tz + n1 * nz;
  const fRx = x1 + u1 * tx + n1 * nx, fRz = z1 + u1 * tz + n1 * nz;
  const yB = y0 + vBack;
  const yF = y0 + vFront;
  const fasciaH = 0.09;
  const yFBot = yF - fasciaH;

  const dn = Math.max(0.05, n1 - n0);
  const dv = Math.max(0.0, vBack - vFront);
  const slopeLen = Math.hypot(dn, dv);
  const snx = (dv / slopeLen) * nx;
  const sny = dn / slopeLen;
  const snz = (dv / slopeLen) * nz;

  const spanU = Math.max(0.2, u1 - u0);
  const uBase = rMat * 1000.0 + 300.0;
  // Sloped top roof quad
  pushQuadFlat(
    out,
    fLx, yF, fLz,
    bLx, yB, bLz,
    bRx, yB, bRz,
    fRx, yF, fRz,
    snx, sny, snz,
    roofRgb, 1.04,
    uBase, -20.0,
    uBase + spanU, -20.0 - slopeLen
  );

  // Front fascia trim band
  pushQuadFlat(
    out,
    fLx, yFBot, fLz,
    fLx, yF, fLz,
    fRx, yF, fRz,
    fRx, yFBot, fRz,
    nx, 0, nz,
    trimRgb, 0.98
  );

  // Underside soffit quad
  pushQuadFlat(
    out,
    fLx, yFBot, fLz,
    fRx, yFBot, fRz,
    bRx, yFBot, bRz,
    bLx, yFBot, bLz,
    0, -1, 0,
    trimRgb, 0.74
  );

  // Left & right gable cheek triangles
  const rSide = clamp01(trimRgb[0] * 0.88);
  const gSide = clamp01(trimRgb[1] * 0.88);
  const bSide = clamp01(trimRgb[2] * 0.88);
  pushTri(out, bLx, yFBot, bLz, bLx, yB, bLz, fLx, yF, fLz, -tx, 0, -tz, rSide, gSide, bSide);
  pushTri(out, fRx, yF, fRz, bRx, yB, bRz, bRx, yFBot, bRz, tx, 0, tz, rSide, gSide, bSide);
}

/**
 * Pushes an oriented 3D box in chunk-local world coordinates centered at (cx, cz) from y0 to y0 + h,
 * with half-extents (hw along axis (ax, az), hd along perpendicular (-az, ax)).
 */
function pushOrientedBox(out, cx, y0, cz, ax, az, hw, h, hd, rgb, emissive = false) {
  const px = -az, pz = ax;
  const x00 = cx - ax * hw - px * hd, z00 = cz - az * hw - pz * hd;
  const x10 = cx + ax * hw - px * hd, z10 = cz + az * hw - pz * hd;
  const x11 = cx + ax * hw + px * hd, z11 = cz + az * hw + pz * hd;
  const x01 = cx - ax * hw + px * hd, z01 = cz - az * hw + pz * hd;
  const y1 = y0 + h;

  // 4 side walls
  pushQuadFlat(out, x01, y0, z01, x01, y1, z01, x11, y1, z11, x11, y0, z11, px, 0, pz, rgb, 1.0, 0, 0, 0, 0, emissive);
  pushQuadFlat(out, x10, y0, z10, x10, y1, z10, x00, y1, z00, x00, y0, z00, -px, 0, -pz, rgb, 0.90, 0, 0, 0, 0, emissive);
  pushQuadFlat(out, x11, y0, z11, x11, y1, z11, x10, y1, z10, x10, y0, z10, ax, 0, az, rgb, 0.95, 0, 0, 0, 0, emissive);
  pushQuadFlat(out, x00, y0, z00, x00, y1, z00, x01, y1, z01, x01, y0, z01, -ax, 0, -az, rgb, 0.86, 0, 0, 0, 0, emissive);
  // Top face (+Y)
  pushQuadFlat(out, x00, y1, z00, x10, y1, z10, x11, y1, z11, x01, y1, z01, 0, 1, 0, rgb, 1.06, 0, 0, 0, 0, emissive);
}

/**
 * Pushes a pyramidal / hipped roof cap over an oriented rectangle centered at (cx, cz) at base height y0.
 */
function pushPyramidalRoofCap(out, cx, y0, cz, ax, az, hw, rise, hd, roofRgb, rMat = RM.terracotta) {
  const px = -az, pz = ax;
  const x00 = cx - ax * hw - px * hd, z00 = cz - az * hw - pz * hd;
  const x10 = cx + ax * hw - px * hd, z10 = cz + az * hw - pz * hd;
  const x11 = cx + ax * hw + px * hd, z11 = cz + az * hw + pz * hd;
  const x01 = cx - ax * hw + px * hd, z01 = cz - az * hw + pz * hd;
  const yPeak = y0 + rise;
  const uBase = rMat * 1000.0 + 300.0;
  const vBase = -20.0;
  const vTop = -20.0 - Math.hypot(hd, rise);

  const r1 = clamp01(roofRgb[0] * 1.02), g1 = clamp01(roofRgb[1] * 1.02), b1 = clamp01(roofRgb[2] * 1.02);
  const r2 = clamp01(roofRgb[0] * 0.92), g2 = clamp01(roofRgb[1] * 0.92), b2 = clamp01(roofRgb[2] * 0.92);

  // +P slope
  pushTri(out, x01, y0, z01, cx, yPeak, cz, x11, y0, z11, px * 0.6, 0.8, pz * 0.6, r1, g1, b1, uBase, vBase, uBase + hw, vTop, uBase + hw * 2, vBase);
  // -P slope
  pushTri(out, x10, y0, z10, cx, yPeak, cz, x00, y0, z00, -px * 0.6, 0.8, -pz * 0.6, r2, g2, b2, uBase, vBase, uBase + hw, vTop, uBase + hw * 2, vBase);
  // +A slope
  pushTri(out, x11, y0, z11, cx, yPeak, cz, x10, y0, z10, ax * 0.6, 0.8, az * 0.6, r1, g1, b1, uBase, vBase, uBase + hd, vTop, uBase + hd * 2, vBase);
  // -A slope
  pushTri(out, x00, y0, z00, cx, yPeak, cz, x01, y0, z01, -ax * 0.6, 0.8, -az * 0.6, r2, g2, b2, uBase, vBase, uBase + hd, vTop, uBase + hd * 2, vBase);
}

/**
 * Emits a flat roof polygon for a CCW ring [x0, z0, x1, z1, ...] at height yTop with procedural flat-roof UVs.
 */
function emitFlatRoofRing(out, ringCoords, yTop, cx, cz, roofRgb, rMat = RM.gravel) {
  const n = (ringCoords.length / 2) | 0;
  if (n < 3) return;
  const uCenter = rMat * 1000.0 + 500.0;
  const r = roofRgb[0], g = roofRgb[1], b = roofRgb[2];

  if (n === 4) {
    const x0 = ringCoords[0], z0 = ringCoords[1];
    const x1 = ringCoords[2], z1 = ringCoords[3];
    const x2 = ringCoords[4], z2 = ringCoords[5];
    const x3 = ringCoords[6], z3 = ringCoords[7];
    pushTri(
      out,
      x0, yTop, z0, x2, yTop, z2, x1, yTop, z1,
      0, 1, 0, r, g, b,
      uCenter + (x0 - cx), -20.0 - (500.0 + (z0 - cz)),
      uCenter + (x2 - cx), -20.0 - (500.0 + (z2 - cz)),
      uCenter + (x1 - cx), -20.0 - (500.0 + (z1 - cz))
    );
    pushTri(
      out,
      x0, yTop, z0, x3, yTop, z3, x2, yTop, z2,
      0, 1, 0, r, g, b,
      uCenter + (x0 - cx), -20.0 - (500.0 + (z0 - cz)),
      uCenter + (x3 - cx), -20.0 - (500.0 + (z3 - cz)),
      uCenter + (x2 - cx), -20.0 - (500.0 + (z2 - cz))
    );
    return;
  }

  tmpContour.length = 0;
  for (let i = 0; i < n; i++) {
    tmpContour.push(new THREE.Vector2(ringCoords[i * 2], ringCoords[i * 2 + 1]));
  }
  const tris = THREE.ShapeUtils.triangulateShape(tmpContour, []);
  for (let t = 0; t < tris.length; t++) {
    const tri = tris[t];
    const pa = tmpContour[tri[0]], pb = tmpContour[tri[1]], pc = tmpContour[tri[2]];
    pushTri(
      out,
      pa.x, yTop, pa.y, pc.x, yTop, pc.y, pb.x, yTop, pb.y,
      0, 1, 0, r, g, b,
      uCenter + (pa.x - cx), -20.0 - (500.0 + (pa.y - cz)),
      uCenter + (pc.x - cx), -20.0 - (500.0 + (pc.y - cz)),
      uCenter + (pb.x - cx), -20.0 - (500.0 + (pb.y - cz))
    );
  }
}

/**
 * Emits a perimeter rooftop parapet + stone coping cap around a CCW ring at yTop.
 */
function emitPerimeterParapet(out, ringCoords, yTop, parapetH, wallRgb, copingRgb) {
  const n = (ringCoords.length / 2) | 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ringCoords[i * 2], z1 = ringCoords[i * 2 + 1];
    const x2 = ringCoords[j * 2], z2 = ringCoords[j * 2 + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const tx = dx / len, tz = dz / len;
    const nx = tz, nz = -tx;
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, 0.0, len, 0.0, parapetH, -0.22, 0.04, wallRgb, false);
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, -0.03, len + 0.03, parapetH, parapetH + 0.08, -0.25, 0.09, copingRgb, false);
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype Selection & Shared Architectural Elements
// ------------------------------------------------------------------------------------------------------------------

const ARCH_SUBURBAN = 0;     // Archetype A: Suburban Detached House w/ Garage Wing & Front Porch
const ARCH_ROWHOUSE = 1;     // Archetype B: Urban Rowhouse / Brownstone / Victorian Terrace
const ARCH_EAST_ASIAN = 2;   // Archetype C: Traditional East Asian Courtyard / Siheyuan / Machiya
const ARCH_MED_VILLA = 3;    // Archetype D: Mediterranean / Spanish Revival / Middle Eastern Villa
const ARCH_MID_RISE = 4;     // Archetype E: Mid-Rise Apartment / Mixed-Use Shophouse (9m-28m)
const ARCH_HIGH_RISE = 5;    // Archetype F: High-Rise / Modern Commercial Infill (>28m)

function selectInfillArchetype(archKey, btype, totalH, polyArea, maxSpan, minSpan, seed) {
  const bt = String(btype || 'yes').toLowerCase();

  // Archetype F: High-Rise / Modern Commercial Infill (height > 28m or tall commercial tower)
  if (totalH > 28.0 || ((bt === 'office' || bt === 'commercial' || bt === 'hotel') && totalH >= 22.0)) {
    return ARCH_HIGH_RISE;
  }

  // Archetype E: Mid-Rise Apartment / Mixed-Use Shophouse (9m - 28m)
  const isRowhouseRegion = archKey === 'nyc' || archKey === 'sf' || archKey === 'uk' || archKey === 'paris' || archKey === 'eu';
  const isNarrowLot = minSpan < 8.8 || polyArea < 125.0 || bt === 'terrace' || bt === 'semidetached_house';
  if (totalH >= 9.2) {
    if (isRowhouseRegion && totalH <= 14.8 && isNarrowLot && bt !== 'commercial' && bt !== 'office' && bt !== 'retail') {
      return ARCH_ROWHOUSE;
    }
    return ARCH_MID_RISE;
  }

  // Low-rise (< 9.2m): select among regional residential/vernacular archetypes A, B, C, D
  if (archKey === 'beijing' || archKey === 'china' || archKey === 'japan' || archKey === 'hk' || archKey === 'seasia') {
    return ARCH_EAST_ASIAN;
  }
  if (archKey === 'med' || archKey === 'mideast') {
    return ARCH_MED_VILLA;
  }
  if (archKey === 'latam') {
    return hash01(seed, 11) < 0.68 ? ARCH_MED_VILLA : ARCH_SUBURBAN;
  }
  if (archKey === 'la') {
    return hash01(seed, 13) < 0.42 ? ARCH_MED_VILLA : ARCH_SUBURBAN;
  }
  if (archKey === 'nyc' || archKey === 'paris') {
    return (polyArea > 165.0 && hash01(seed, 17) < 0.35) ? ARCH_SUBURBAN : ARCH_ROWHOUSE;
  }
  if (archKey === 'sf') {
    return (minSpan < 9.5 || hash01(seed, 19) < 0.65) ? ARCH_ROWHOUSE : ARCH_SUBURBAN;
  }
  if (archKey === 'uk' || archKey === 'eu') {
    if (bt === 'terrace' || bt === 'semidetached_house' || polyArea < 105.0 || (hash01(seed, 23) < 0.45 && polyArea < 160.0)) {
      return ARCH_ROWHOUSE;
    }
    return ARCH_SUBURBAN;
  }
  return ARCH_SUBURBAN;
}

function selectDoorIndexForArchetype(archetype, archKey, seed) {
  switch (archetype) {
    case ARCH_HIGH_RISE:
      return hash01(seed, 31) < 0.55 ? 0 : 1; // door_office_lobby_glass or door_hotel_canopy
    case ARCH_MID_RISE:
      return hash01(seed, 33) < 0.48 ? 9 : 2; // door_shop_glass or door_apartment_modern
    case ARCH_EAST_ASIAN:
      return archKey === 'japan' ? 6 : 7;     // door_tokyo_apartment or door_beijing_hutong_gate
    case ARCH_ROWHOUSE:
      if (archKey === 'uk') return 5;        // door_london_georgian
      if (archKey === 'paris') return 4;     // door_paris_porte_cochere
      return 3;                               // door_nyc_brownstone_stoop
    case ARCH_MED_VILLA:
      return 4;                               // arched wood/iron porte-cochere door
    case ARCH_SUBURBAN:
    default:
      return archKey === 'uk' ? 5 : 11;       // door_us_suburban
  }
}

/**
 * Emits a 3D entrance door (atlas-mapped door quad + recessed jamb/lintel frame + stoop step + overhead canopy + warm porch light).
 */
function emitEntranceDoorAssembly(
  out, x1, surfY, z1, tx, tz, nx, nz,
  uCenter, edgeLen, maxWallH, doorIdx,
  wallRgb, trimRgb, stoneRgb, withStoopStairs = false, withHood = true
) {
  const dSpec = DOOR_CATALOG[doorIdx] || DOOR_CATALOG[0];
  const dw = Math.min(dSpec.width * 0.78, edgeLen - 0.5, 2.6);
  const dh = Math.min(dSpec.height * 0.82, maxWallH - (withStoopStairs ? 0.95 : 0.35), 3.1);
  if (dw < 0.95 || dh < 1.75) return;

  const u0 = Math.max(0.22, uCenter - dw * 0.5);
  const u1 = Math.min(edgeLen - 0.22, uCenter + dw * 0.5);
  if (u1 - u0 < 0.85) return;

  const stoopH = withStoopStairs ? Math.min(0.82, maxWallH * 0.22) : 0.18;
  const stoopDepth = withStoopStairs ? 1.18 : 0.48;

  if (withStoopStairs) {
    // 4-step brownstone/rowhouse stoop stairway + flanking cheek walls + wrought-iron top rails
    const nSteps = 4;
    const stW = (u1 - u0) + 0.16;
    const su0 = uCenter - stW * 0.5;
    const su1 = uCenter + stW * 0.5;
    for (let st = 0; st < nSteps; st++) {
      const sv0 = (st / nSteps) * stoopH;
      const sv1 = ((st + 1) / nSteps) * stoopH;
      const sn1 = stoopDepth * (1.0 - (st / nSteps) * 0.68);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su0, su1, sv0, sv1, 0.02, sn1, stoneRgb, false);
    }
    // Flanking cheek balustrades + iron handrails
    const railRgb = [0.15, 0.16, 0.18];
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su0 - 0.16, su0, 0.0, stoopH + 0.28, 0.02, stoopDepth + 0.04, stoneRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su1, su1 + 0.16, 0.0, stoopH + 0.28, 0.02, stoopDepth + 0.04, stoneRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su0 - 0.18, su0 + 0.02, stoopH + 0.28, stoopH + 0.35, 0.02, stoopDepth + 0.08, trimRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su1 - 0.02, su1 + 0.18, stoopH + 0.28, stoopH + 0.35, 0.02, stoopDepth + 0.08, trimRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su0 - 0.13, su0 - 0.03, stoopH + 0.35, stoopH + 0.58, 0.06, stoopDepth * 0.92, railRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, su1 + 0.03, su1 + 0.13, stoopH + 0.35, stoopH + 0.58, 0.06, stoopDepth * 0.92, railRgb, false);
  } else {
    // Low stone threshold step + sub-step
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.18, u1 + 0.18, 0.0, stoopH * 0.55, 0.02, stoopDepth + 0.18, stoneRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.12, u1 + 0.12, stoopH * 0.55, stoopH, 0.02, stoopDepth, stoneRgb, false);
  }

  const doorY0 = surfY + stoopH;
  const doorY1 = doorY0 + dh;
  const dOut = 0.072;

  // Door atlas quad (u = 24000 + doorIdx * 1000 + u01, v = 1.0 + v01)
  const doorUvBase = 24000.0 + doorIdx * 1000.0;
  const dx1 = x1 + u0 * tx + nx * dOut, dz1 = z1 + u0 * tz + nz * dOut;
  const dx2 = x1 + u1 * tx + nx * dOut, dz2 = z1 + u1 * tz + nz * dOut;
  pushQuadFlat(
    out,
    dx1, doorY0, dz1,
    dx1, doorY1, dz1,
    dx2, doorY1, dz2,
    dx2, doorY0, dz2,
    nx, 0, nz,
    wallRgb, 1.04,
    doorUvBase + 0.0, 1.0,
    doorUvBase + 1.0, 2.0
  );

  // 3D Pilaster jambs & lintel surround frame
  const v0Rel = stoopH;
  const v1Rel = stoopH + dh;
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.11, u0 + 0.02, v0Rel, v1Rel + 0.10, 0.02, 0.15, trimRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u1 - 0.02, u1 + 0.11, v0Rel, v1Rel + 0.10, 0.02, 0.15, trimRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.15, u1 + 0.15, v1Rel, v1Rel + 0.16, 0.02, 0.22, trimRgb, false);

  // Overhead canopy hood + warm porch light fixture
  if (withHood) {
    const hoodDepth = Math.min(0.68, dSpec.canopyDepth || 0.48);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.22, u1 + 0.22, v1Rel + 0.12, v1Rel + 0.24, 0.02, hoodDepth, trimRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, u0 - 0.25, u1 + 0.25, v1Rel + 0.24, v1Rel + 0.30, 0.02, hoodDepth + 0.05, stoneRgb, false);
  }
  const warmLightRgb = [1.0, 0.84, 0.48];
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, uCenter - 0.18, uCenter + 0.18, v1Rel + 0.04, v1Rel + 0.12, 0.08, 0.26, warmLightRgb, true);
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype A: Suburban Detached House with Attached Garage Wing, Front Porch, Bay Window & Chimney
// ------------------------------------------------------------------------------------------------------------------

function emitSuburbanHouseDetails(
  out, edges, frontIdx, surfY, yTop, cx, cz,
  wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, seed
) {
  const fe = edges[frontIdx];
  if (!fe || fe.len < 3.4) return;
  const { x1, z1, tx, tz, nx, nz, len } = fe;
  const wallH = Math.max(2.6, yTop - surfY);

  // Decide layout along front facade (or side garage wing if front is moderate width)
  const garageOnFront = len >= 7.8;
  const porchLeft = hash01(seed, 41) < 0.5;

  // 1. Attached 1-Story Garage Wing & 3D Roll-Up Garage Door + Driveway Apron
  const gEdge = garageOnFront
    ? fe
    : edges[(frontIdx + 1) % edges.length] && edges[(frontIdx + 1) % edges.length].len >= 4.2
      ? edges[(frontIdx + 1) % edges.length]
      : fe;

  if (gEdge && gEdge.len >= 4.0) {
    const gw = Math.min(4.2, Math.max(2.8, gEdge.len * (garageOnFront ? 0.42 : 0.62)));
    const gh = Math.min(wallH - 0.15, 2.85);
    const gu0 = garageOnFront
      ? (porchLeft ? gEdge.len - gw - 0.28 : 0.28)
      : (gEdge.len - gw) * 0.5;
    const gu1 = gu0 + gw;
    const gOut = 1.35; // Projecting 1-story attached garage wing

    // Projecting 1-story garage wing body + foundation plinth + pitched shingle secondary roof
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, gu0, gu1, 0.0, 0.52, 0.02, gOut + 0.04, plinthRgb, false);
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, gu0, gu1, 0.52, gh, 0.02, gOut, wallRgb, false);
    pushSlopedWallCanopy(
      out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz,
      gu0 - 0.16, gu1 + 0.16, Math.min(wallH - 0.05, gh + 0.72), gh, 0.02, gOut + 0.22,
      roofRgb, trimRgb, RM.shingle
    );

    // 3D Paneled Roll-Up Garage Door on the front face of the garage wing (at normal offset gOut)
    const doorW = Math.min(gw - 0.56, 3.1);
    const doorH = Math.min(gh - 0.42, 2.25);
    const du0 = gu0 + (gw - doorW) * 0.5;
    const du1 = du0 + doorW;
    const panelChoices = [
      [0.92, 0.92, 0.90], // crisp white paneled door
      [0.54, 0.36, 0.22], // warm cedar wood door
      [0.26, 0.28, 0.31], // modern charcoal door
      [0.82, 0.78, 0.71], // almond/taupe door
    ];
    const panelRgb = panelChoices[(seed >>> 5) % panelChoices.length];
    const recessRgb = scaleRgb(panelRgb, 0.76);

    // Garage door frame jambs + header at gOut
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0 - 0.10, du0, 0.0, doorH + 0.10, gOut - 0.02, gOut + 0.08, trimRgb, false);
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du1, du1 + 0.10, 0.0, doorH + 0.10, gOut - 0.02, gOut + 0.08, trimRgb, false);
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0 - 0.12, du1 + 0.12, doorH, doorH + 0.12, gOut - 0.02, gOut + 0.10, trimRgb, false);

    // Recessed garage door backing + 4 horizontal raised ribbed panels
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0, du1, 0.02, doorH, gOut - 0.01, gOut + 0.02, recessRgb, false);
    const nPanels = 4;
    const pStep = doorH / nPanels;
    for (let p = 0; p < nPanels; p++) {
      const pv0 = p * pStep + 0.04;
      const pv1 = (p + 1) * pStep - 0.03;
      if (p === nPanels - 1) {
        // Top panel with transom window strip (3 glazed panes)
        pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0 + 0.04, du1 - 0.04, pv0, pv1, gOut + 0.02, gOut + 0.055, panelRgb, false);
        const winGlassRgb = hash01(seed, 47) < 0.35 ? [0.95, 0.78, 0.46] : [0.18, 0.24, 0.32];
        const winEmissive = hash01(seed, 47) < 0.35;
        const paneSpan = (doorW - 0.32) / 3;
        for (let k = 0; k < 3; k++) {
          const wu0 = du0 + 0.12 + k * (paneSpan + 0.04);
          const wu1 = wu0 + paneSpan - 0.04;
          pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, wu0, wu1, pv0 + 0.06, pv1 - 0.06, gOut + 0.05, gOut + 0.068, winGlassRgb, winEmissive);
        }
      } else {
        pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0 + 0.04, du1 - 0.04, pv0, pv1, gOut + 0.02, gOut + 0.058, panelRgb, false);
      }
    }

    // Concrete driveway apron slab extending out from the garage door
    const apronRgb = [0.62, 0.61, 0.59];
    pushWallBox(out, gEdge.x1, surfY, gEdge.z1, gEdge.tx, gEdge.tz, gEdge.nx, gEdge.nz, du0 - 0.25, du1 + 0.25, 0.0, 0.07, gOut, gOut + 2.25, apronRgb, false);
  }

  // 2. Covered Front Porch + Columns + Railing + Entrance Door + Projecting Bay Window
  const porchSpan = garageOnFront ? Math.min(4.4, len * 0.46) : Math.min(4.8, len * 0.58);
  const pu0 = garageOnFront
    ? (porchLeft ? 0.32 : Math.max(0.32, len - porchSpan - 0.32))
    : Math.max(0.28, (len - porchSpan) * 0.5);
  const pu1 = Math.min(len - 0.25, pu0 + porchSpan);
  const pWidth = pu1 - pu0;

  if (pWidth >= 2.1) {
    const deckH = 0.32;
    const porchDepth = 1.28;
    const eaveH = Math.min(wallH - 0.15, 2.75);
    const deckRgb = [0.56, 0.47, 0.38];

    // Raised porch deck + front steps
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu0, pu1, 0.0, deckH, 0.02, porchDepth, plinthRgb, false);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu0 - 0.04, pu1 + 0.04, deckH, deckH + 0.06, 0.02, porchDepth + 0.04, deckRgb, false);
    const doorU = pu0 + pWidth * 0.5;
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, doorU - 0.65, doorU + 0.65, 0.0, deckH * 0.52, porchDepth, porchDepth + 0.38, plinthRgb, false);

    // 2 or 3 Square Timber/White Columns + Porch Railing
    const nCols = pWidth >= 3.6 ? 3 : 2;
    for (let c = 0; c < nCols; c++) {
      const tCol = nCols === 2 ? c : (c === 1 ? 0.32 : c * 0.5);
      const cu = pu0 + 0.12 + tCol * (pWidth - 0.24);
      // Base pedestal + column shaft + capital
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, cu - 0.11, cu + 0.11, deckH + 0.06, deckH + 0.42, porchDepth - 0.24, porchDepth - 0.02, plinthRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, cu - 0.08, cu + 0.08, deckH + 0.42, eaveH - 0.12, porchDepth - 0.20, porchDepth - 0.04, trimRgb, false);
    }
    // Top porch header beam + front balustrade rails flanking entrance step
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu0 - 0.04, pu1 + 0.04, eaveH - 0.14, eaveH, 0.02, porchDepth, trimRgb, false);
    if (doorU - 0.72 > pu0 + 0.25) {
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu0 + 0.12, doorU - 0.68, deckH + 0.56, deckH + 0.64, porchDepth - 0.16, porchDepth - 0.06, trimRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu0 + 0.12, doorU - 0.68, deckH + 0.14, deckH + 0.56, porchDepth - 0.13, porchDepth - 0.09, scaleRgb(trimRgb, 0.92), false);
    }
    if (pu1 - 0.25 > doorU + 0.72) {
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, doorU + 0.68, pu1 - 0.12, deckH + 0.56, deckH + 0.64, porchDepth - 0.16, porchDepth - 0.06, trimRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, doorU + 0.68, pu1 - 0.12, deckH + 0.14, deckH + 0.56, porchDepth - 0.13, porchDepth - 0.09, scaleRgb(trimRgb, 0.92), false);
    }

    // Secondary Sloped Porch Overhang Roof
    pushSlopedWallCanopy(
      out, x1, surfY, z1, tx, tz, nx, nz,
      pu0 - 0.14, pu1 + 0.14, Math.min(wallH, eaveH + 0.68), eaveH, 0.02, porchDepth + 0.16,
      roofRgb, trimRgb, RM.shingle
    );

    // Front Entrance Door inside the porch
    emitEntranceDoorAssembly(
      out, x1, surfY + deckH, z1, tx, tz, nx, nz,
      doorU, len, wallH - deckH, doorIdx,
      wallRgb, trimRgb, plinthRgb, false, false
    );
  } else {
    emitEntranceDoorAssembly(
      out, x1, surfY, z1, tx, tz, nx, nz,
      len * 0.5, len, wallH, doorIdx,
      wallRgb, trimRgb, plinthRgb, false, true
    );
  }

  // 3. Projecting Front Bay Window or Upper Gable Dormer
  const bayEdge = !garageOnFront && len >= 5.8 ? fe : (edges[(frontIdx + 2) % edges.length] || fe);
  if (bayEdge && bayEdge.len >= 3.8 && wallH >= 2.8) {
    const buMid = bayEdge === fe ? (porchLeft ? Math.min(len - 1.2, pu1 + 1.1) : Math.max(1.2, pu0 - 1.1)) : bayEdge.len * 0.5;
    const bw = 1.65;
    if (buMid - bw * 0.5 >= 0.25 && buMid + bw * 0.5 <= bayEdge.len - 0.25) {
      const bv0 = 0.72, bv1 = Math.min(wallH - 0.35, 2.45);
      if (bv1 - bv0 >= 1.0) {
        pushWallBox(out, bayEdge.x1, surfY, bayEdge.z1, bayEdge.tx, bayEdge.tz, bayEdge.nx, bayEdge.nz, buMid - bw * 0.5, buMid + bw * 0.5, bv0, bv1, 0.02, 0.46, wallRgb, false);
        pushWallBox(out, bayEdge.x1, surfY, bayEdge.z1, bayEdge.tx, bayEdge.tz, bayEdge.nx, bayEdge.nz, buMid - bw * 0.54, buMid + bw * 0.54, bv0 - 0.08, bv0, 0.02, 0.50, trimRgb, false);
        const glassRgb = [0.16, 0.23, 0.32];
        pushWallBox(out, bayEdge.x1, surfY, bayEdge.z1, bayEdge.tx, bayEdge.tz, bayEdge.nx, bayEdge.nz, buMid - bw * 0.38, buMid + bw * 0.38, bv0 + 0.14, bv1 - 0.14, 0.44, 0.49, glassRgb, false);
        pushSlopedWallCanopy(
          out, bayEdge.x1, surfY, bayEdge.z1, bayEdge.tx, bayEdge.tz, bayEdge.nx, bayEdge.nz,
          buMid - bw * 0.56, buMid + bw * 0.56, bv1 + 0.34, bv1, 0.02, 0.54,
          roofRgb, trimRgb, RM.metal
        );
      }
    }
  }

  // Upper Gable Roof Dormer on the front roof slope
  if (len >= 5.0) {
    const dormU = len * 0.5;
    const dormW = 1.45;
    const dormBack = -1.25, dormFront = -0.25;
    const dormH = 1.22;
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, dormU - dormW * 0.5, dormU + dormW * 0.5, -0.15, dormH, dormBack, dormFront, wallRgb, false);
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, dormU - dormW * 0.34, dormU + dormW * 0.34, 0.16, dormH - 0.18, dormFront - 0.02, dormFront + 0.04, [0.18, 0.25, 0.34], hash01(seed, 53) < 0.35);
    const dCx = x1 + dormU * tx + ((dormBack + dormFront) * 0.5) * nx;
    const dCz = z1 + dormU * tz + ((dormBack + dormFront) * 0.5) * nz;
    pushPyramidalRoofCap(out, dCx, yTop + dormH, dCz, tx, tz, dormW * 0.56, 0.52, 0.56, roofRgb, RM.shingle);
  }

  // 4. Brick Chimney Stack rising through the roof
  const chimRgb = [0.54, 0.29, 0.23];
  const chimCapRgb = [0.68, 0.66, 0.63];
  const sideSign = porchLeft ? 1 : -1;
  const chimX = cx + tx * (sideSign * Math.min(2.2, len * 0.28)) - nx * 0.65;
  const chimZ = cz + tz * (sideSign * Math.min(2.2, len * 0.28)) - nz * 0.65;
  const chimH = 2.15;
  pushOrientedBox(out, chimX, yTop - 0.35, chimZ, tx, tz, 0.34, chimH, 0.28, chimRgb, false);
  pushOrientedBox(out, chimX, yTop - 0.35 + chimH, chimZ, tx, tz, 0.40, 0.12, 0.34, chimCapRgb, false);
  pushOrientedBox(out, chimX - tx * 0.12, yTop - 0.23 + chimH, chimZ - tz * 0.12, tx, tz, 0.09, 0.28, 0.09, [0.68, 0.38, 0.26], false);
  pushOrientedBox(out, chimX + tx * 0.12, yTop - 0.23 + chimH, chimZ + tz * 0.12, tx, tz, 0.09, 0.28, 0.09, [0.68, 0.38, 0.26], false);
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype B: Urban Rowhouse / Brownstone / Victorian Terrace
// ------------------------------------------------------------------------------------------------------------------

function emitRowhouseDetails(
  out, edges, frontIdx, surfY, yTop,
  wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, seed
) {
  const fe = edges[frontIdx];
  if (!fe || fe.len < 2.8) return;
  const { x1, z1, tx, tz, nx, nz, len } = fe;
  const wallH = Math.max(3.2, yTop - surfY);

  const doorLeft = hash01(seed, 61) < 0.5;
  const doorU = len >= 4.6
    ? (doorLeft ? Math.min(1.65, len * 0.30) : Math.max(len - 1.65, len * 0.70))
    : len * 0.5;

  // 1. Elevated Front Stoop Stairway (4 steps + side cheek walls) + Parlor Entrance Door
  emitEntranceDoorAssembly(
    out, x1, surfY, z1, tx, tz, nx, nz,
    doorU, len, wallH, doorIdx,
    wallRgb, trimRgb, plinthRgb, true, true
  );

  // 2. Projecting 3-Sided Angled Bay Window across Floors 1-2
  if (len >= 4.4 && wallH >= 4.8) {
    const bayU = doorLeft ? len * 0.68 : len * 0.32;
    const bayHalfW = Math.min(1.35, len * 0.22);
    const bu0 = bayU - bayHalfW;
    const bu1 = bayU + bayHalfW;
    if (bu0 >= 0.22 && bu1 <= len - 0.22) {
      const bayDepth = 0.62;
      const chamfer = bayHalfW * 0.42;
      const yB0 = surfY + 0.72;
      const yB1 = yTop - 0.52;

      // 4 plan points of the 3-sided bay: wall-left (A), outer-left (B), outer-right (C), wall-right (D)
      const ax = x1 + bu0 * tx + 0.02 * nx, az = z1 + bu0 * tz + 0.02 * nz;
      const bx = x1 + (bu0 + chamfer) * tx + bayDepth * nx, bz = z1 + (bu0 + chamfer) * tz + bayDepth * nz;
      const cxp = x1 + (bu1 - chamfer) * tx + bayDepth * nx, czp = z1 + (bu1 - chamfer) * tz + bayDepth * nz;
      const dx = x1 + bu1 * tx + 0.02 * nx, dz = z1 + bu1 * tz + 0.02 * nz;

      const ldx = bx - ax, ldz = bz - az, lLen = Math.hypot(ldx, ldz) || 1;
      const lnx = ldz / lLen, lnz = -ldx / lLen;
      const rdx = dx - cxp, rdz = dz - czp, rLen = Math.hypot(rdx, rdz) || 1;
      const rnx = rdz / rLen, rnz = -rdx / rLen;

      // Left angled facet, center flat facet, right angled facet
      pushQuadFlat(out, ax, yB0, az, ax, yB1, az, bx, yB1, bz, bx, yB0, bz, lnx, 0, lnz, wallRgb, 0.92);
      pushQuadFlat(out, bx, yB0, bz, bx, yB1, bz, cxp, yB1, czp, cxp, yB0, czp, nx, 0, nz, wallRgb, 1.02);
      pushQuadFlat(out, cxp, yB0, czp, cxp, yB1, czp, dx, yB1, dz, dx, yB0, dz, rnx, 0, rnz, wallRgb, 0.90);

      // Recessed bay window glass panes on each floor of the bay
      const nBayFloors = Math.max(1, Math.min(3, Math.round((yB1 - yB0) / 3.2)));
      const floorStep = (yB1 - yB0) / nBayFloors;
      for (let f = 0; f < nBayFloors; f++) {
        const fy0 = yB0 + f * floorStep + 0.28;
        const fy1 = yB0 + (f + 1) * floorStep - 0.28;
        const lit = hash01(seed, 71 + f * 7) < 0.38;
        const glassCol = lit ? [0.96, 0.78, 0.46] : [0.16, 0.22, 0.30];
        if (fy1 > fy0 + 0.3) {
          pushWallBox(out, x1, 0, z1, tx, tz, nx, nz, bu0 + chamfer + 0.08, bu1 - chamfer - 0.08, fy0, fy1, bayDepth - 0.01, bayDepth + 0.04, glassCol, lit);
        }
        // Horizontal spandrel cornice band between bay floors
        pushWallBox(out, x1, 0, z1, tx, tz, nx, nz, bu0 - 0.04, bu1 + 0.04, yB0 + (f + 1) * floorStep - 0.10, yB0 + (f + 1) * floorStep + 0.04, 0.02, bayDepth + 0.07, trimRgb, false);
      }
      // Base corbel & top sloped cap over the 3-sided bay
      pushWallBox(out, x1, 0, z1, tx, tz, nx, nz, bu0 - 0.04, bu1 + 0.04, yB0 - 0.14, yB0, 0.02, bayDepth + 0.05, trimRgb, false);
      pushSlopedWallCanopy(
        out, x1, 0, z1, tx, tz, nx, nz,
        bu0 - 0.06, bu1 + 0.06, yB1 + 0.28, yB1, 0.02, bayDepth + 0.10,
        roofRgb, trimRgb, RM.zinc
      );
    }
  }

  // 3. Classic Molded Crown Cornice Ledge + Rhythmic Corbel Brackets
  pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, -0.05, len + 0.05, -0.36, -0.18, 0.02, 0.24, trimRgb, false);
  pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, -0.08, len + 0.08, -0.18, 0.06, 0.02, 0.38, scaleRgb(trimRgb, 1.06), false);
  const nBrackets = Math.max(3, Math.min(10, Math.round(len / 0.95)));
  for (let b = 0; b <= nBrackets; b++) {
    const bu = 0.12 + (b / nBrackets) * (len - 0.24);
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, bu - 0.06, bu + 0.06, -0.52, -0.18, 0.02, 0.28, trimRgb, false);
  }

  // 4. Brick Party-Wall Parapet Dividers along the left & right side edges of the roof
  for (let ei = 0; ei < edges.length; ei++) {
    if (ei === frontIdx) continue;
    const e = edges[ei];
    const dot = Math.abs(e.tx * tx + e.tz * tz);
    if (dot < 0.45 && e.len >= 2.5) {
      // Side party wall parapet firewall
      pushWallBox(out, e.x1, yTop, e.z1, e.tx, e.tz, e.nx, e.nz, 0.0, e.len, 0.0, 0.56, -0.26, 0.04, wallRgb, false);
      pushWallBox(out, e.x1, yTop, e.z1, e.tx, e.tz, e.nx, e.nz, -0.02, e.len + 0.02, 0.56, 0.65, -0.30, 0.08, trimRgb, false);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype C: Traditional East Asian Courtyard / Siheyuan / Machiya House
// ------------------------------------------------------------------------------------------------------------------

function emitEastAsianHouseDetails(
  out, edges, frontIdx, surfY, yTop, archKey,
  wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, seed
) {
  const fe = edges[frontIdx];
  if (!fe || fe.len < 2.8) return;
  const { x1, z1, tx, tz, nx, nz, len } = fe;
  const wallH = Math.max(2.8, yTop - surfY);
  const isJapan = archKey === 'japan';

  const timberRgb = isJapan ? [0.24, 0.16, 0.11] : [0.30, 0.29, 0.31]; // dark cedar vs traditional grey-brick pilaster
  const redGateRgb = isJapan ? [0.46, 0.26, 0.15] : [0.64, 0.16, 0.14]; // cedar lattice vs vermilion hutong gate
  const tileRgb = [0.24, 0.26, 0.30];

  // 1. Dark Timber / Grey-Brick Corner Pilasters & Waist Rail on All Edges
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    if (e.len < 1.8) continue;
    const pilW = Math.min(0.28, e.len * 0.12);
    pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, 0.0, pilW, 0.0, wallH, 0.01, 0.08, timberRgb, false);
    pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, e.len - pilW, e.len, 0.0, wallH, 0.01, 0.08, timberRgb, false);
    // Upturned eave purlin & corner flying-rafter spurs (fei-yan)
    pushWallBox(out, e.x1, yTop, e.z1, e.tx, e.tz, e.nx, e.nz, -0.14, e.len + 0.14, -0.22, -0.04, 0.01, 0.20, timberRgb, false);
    pushWallBox(out, e.x1, yTop, e.z1, e.tx, e.tz, e.nx, e.nz, -0.28, 0.36, -0.04, 0.14, 0.10, 0.42, tileRgb, false);
    pushWallBox(out, e.x1, yTop, e.z1, e.tx, e.tz, e.nx, e.nz, e.len - 0.36, e.len + 0.28, -0.04, 0.14, 0.10, 0.42, tileRgb, false);
  }

  // 2. Projecting Tiled Entry Gate Canopy (Menlou / Genkan) with Warm Red/Wood Double Doors
  const gateW = Math.min(3.1, Math.max(1.9, len * 0.42));
  const gu0 = (len - gateW) * 0.5;
  const gu1 = gu0 + gateW;
  const gateH = Math.min(wallH - 0.15, 2.95);
  const gateOut = 0.56;

  // Flanking masonry/timber gate piers + threshold step + stone drum stones (mendun)
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu0 - 0.22, gu0 + 0.06, 0.0, gateH, 0.02, gateOut, timberRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu1 - 0.06, gu1 + 0.22, 0.0, gateH, 0.02, gateOut, timberRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu0 - 0.24, gu1 + 0.24, 0.0, 0.20, 0.02, gateOut + 0.26, plinthRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu0 - 0.18, gu0 + 0.08, 0.20, 0.62, gateOut, gateOut + 0.32, plinthRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu1 - 0.08, gu1 + 0.18, 0.20, 0.62, gateOut, gateOut + 0.32, plinthRgb, false);

  // Double leaf red/wood entrance door + carved overhead lintel beam + lantern
  const doorH = Math.min(gateH - 0.38, 2.35);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu0 + 0.06, gu1 - 0.06, 0.20, 0.20 + doorH, 0.04, gateOut * 0.45, redGateRgb, false);
  // Center seam & brass door studs
  const midU = (gu0 + gu1) * 0.5;
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, midU - 0.03, midU + 0.03, 0.20, 0.20 + doorH, gateOut * 0.45, gateOut * 0.45 + 0.03, timberRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, gu0 - 0.26, gu1 + 0.26, gateH - 0.22, gateH, 0.02, gateOut + 0.08, redGateRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, midU - 0.16, midU + 0.16, gateH - 0.42, gateH - 0.22, gateOut * 0.5, gateOut + 0.12, [1.0, 0.72, 0.36], true);

  // Projecting tiled gate canopy roof (RM.jptile = 7) with upturned eaves
  pushSlopedWallCanopy(
    out, x1, surfY, z1, tx, tz, nx, nz,
    gu0 - 0.42, gu1 + 0.42, Math.min(wallH + 0.25, gateH + 0.62), gateH, 0.02, gateOut + 0.34,
    tileRgb, timberRgb, RM.jptile
  );

  // 3. Upper-Floor Wooden Lattice Window Balcony (Machiya Koshi / Shophouse Veranda)
  if (wallH >= 4.5 && len >= 3.8) {
    const lu0 = 0.38, lu1 = len - 0.38;
    const lv0 = Math.max(gateH + 0.28, wallH * 0.52);
    const lv1 = Math.min(wallH - 0.28, lv0 + 1.45);
    const woodRgb = [0.44, 0.28, 0.16];
    if (lv1 > lv0 + 0.55) {
      // Balcony deck & top beam
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0, lu1, lv0 - 0.10, lv0, 0.02, 0.42, woodRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0, lu1, lv0 + 0.68, lv0 + 0.76, 0.02, 0.44, woodRgb, false);
      // Vertical wooden lattice bars (koshi)
      const nBars = Math.max(4, Math.min(12, Math.round((lu1 - lu0) / 0.48)));
      for (let b = 0; b <= nBars; b++) {
        const bu = lu0 + (b / nBars) * (lu1 - lu0);
        pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu - 0.03, bu + 0.03, lv0, lv0 + 0.68, 0.34, 0.42, woodRgb, false);
      }
      // Warm shoji screen glow behind lattice
      if (hash01(seed, 83) < 0.45) {
        pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0 + 0.25, lu1 - 0.25, lv0 + 0.08, lv1 - 0.12, 0.04, 0.10, [0.98, 0.82, 0.52], true);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype D: Mediterranean / Spanish Revival / Middle Eastern Villa
// ------------------------------------------------------------------------------------------------------------------

function emitMedVillaDetails(
  out, edges, frontIdx, surfY, yTop, cx, cz, archKey,
  wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, seed
) {
  const fe = edges[frontIdx];
  if (!fe || fe.len < 3.0) return;
  const { x1, z1, tx, tz, nx, nz, len } = fe;
  const wallH = Math.max(3.0, yTop - surfY);
  const terracottaRgb = [0.64, 0.31, 0.20];
  const ironRgb = [0.16, 0.17, 0.19];
  const cedarRgb = [0.42, 0.26, 0.15];

  // 1. Covered Arched Loggia / Pergola Terrace + Entrance Door
  const loggiaW = Math.min(4.8, Math.max(2.4, len * 0.54));
  const lu0 = (len - loggiaW) * 0.5;
  const lu1 = lu0 + loggiaW;
  const loggiaDepth = 1.25;
  const loggiaH = Math.min(wallH - 0.25, 2.95);

  // Raised terracotta-tiled terrace deck
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0, lu1, 0.0, 0.28, 0.02, loggiaDepth, plinthRgb, false);
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0 - 0.04, lu1 + 0.04, 0.28, 0.34, 0.02, loggiaDepth + 0.04, terracottaRgb, false);

  // 3 Stucco Masonry Piers with Stepped Arch-Springing Imposts + Spandrel Lintel Beam
  const nPiers = loggiaW >= 3.4 ? 3 : 2;
  for (let p = 0; p < nPiers; p++) {
    const pu = lu0 + 0.14 + (p / (nPiers - 1)) * (loggiaW - 0.28);
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu - 0.15, pu + 0.15, 0.34, loggiaH - 0.38, loggiaDepth - 0.30, loggiaDepth, wallRgb, false);
    // Stepped arch haunch imposts
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, pu - 0.26, pu + 0.26, loggiaH - 0.38, loggiaH - 0.20, loggiaDepth - 0.32, loggiaDepth + 0.02, trimRgb, false);
  }
  pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, lu0 - 0.04, lu1 + 0.04, loggiaH - 0.20, loggiaH, 0.02, loggiaDepth + 0.02, wallRgb, false);

  // Clay-tiled loggia roof + exposed cedar pergola rafter tails
  pushSlopedWallCanopy(
    out, x1, surfY, z1, tx, tz, nx, nz,
    lu0 - 0.16, lu1 + 0.16, Math.min(wallH, loggiaH + 0.58), loggiaH, 0.02, loggiaDepth + 0.18,
    terracottaRgb, cedarRgb, RM.terracotta
  );
  const nRafters = Math.max(4, Math.round(loggiaW / 0.65));
  for (let r = 0; r <= nRafters; r++) {
    const ru = lu0 + (r / nRafters) * loggiaW;
    pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, ru - 0.04, ru + 0.04, loggiaH - 0.08, loggiaH + 0.02, loggiaDepth, loggiaDepth + 0.32, cedarRgb, false);
  }

  emitEntranceDoorAssembly(
    out, x1, surfY + 0.34, z1, tx, tz, nx, nz,
    (lu0 + lu1) * 0.5, len, wallH - 0.34, doorIdx,
    wallRgb, trimRgb, plinthRgb, false, false
  );

  // 2. Projecting Clay-Tiled Window Awnings & Wrought-Iron Juliet Balconies on Upper/Side Windows
  if (wallH >= 4.8 && len >= 3.8) {
    const winY = surfY + Math.min(wallH - 1.1, Math.max(3.3, wallH * 0.62));
    const nAwns = len >= 7.2 ? 2 : 1;
    for (let a = 0; a < nAwns; a++) {
      const au = nAwns === 1 ? len * 0.5 : len * (0.28 + a * 0.44);
      const aw = 1.45;
      if (au - aw * 0.5 < 0.25 || au + aw * 0.5 > len - 0.25) continue;
      // Wrought-iron balcony box below window + terracotta awning above window
      pushWallBox(out, x1, 0, z1, tx, tz, nx, nz, au - aw * 0.52, au + aw * 0.52, winY - 1.05, winY - 0.93, 0.02, 0.42, trimRgb, false);
      pushWallBox(out, x1, 0, z1, tx, tz, nx, nz, au - aw * 0.50, au + aw * 0.50, winY - 0.93, winY - 0.28, 0.34, 0.42, ironRgb, false);
      pushSlopedWallCanopy(
        out, x1, 0, z1, tx, tz, nx, nz,
        au - aw * 0.55, au + aw * 0.55, winY + 0.42, winY + 0.08, 0.02, 0.55,
        terracottaRgb, cedarRgb, RM.terracotta
      );
    }
  }

  // 3. Rooftop Stepped Parapet / Corner Mirador Turret Tower (Windcatcher / Belvedere)
  const turW = Math.min(2.6, Math.max(1.75, len * 0.32));
  const turH = archKey === 'mideast' ? 2.45 : 1.95;
  const turSide = hash01(seed, 91) < 0.5 ? -1 : 1;
  const turCx = cx + tx * (turSide * Math.min(1.8, len * 0.22));
  const turCz = cz + tz * (turSide * Math.min(1.8, len * 0.22));
  pushOrientedBox(out, turCx, yTop - 0.25, turCz, tx, tz, turW * 0.5, turH, turW * 0.5, wallRgb, false);
  // Recessed dark louver vents / arched belvedere openings on the turret
  pushOrientedBox(out, turCx, yTop + turH * 0.38, turCz, tx, tz, turW * 0.53, turH * 0.28, turW * 0.32, ironRgb, false);
  pushOrientedBox(out, turCx, yTop + turH * 0.38, turCz, tx, tz, turW * 0.32, turH * 0.28, turW * 0.53, ironRgb, false);
  // Cornice collar + pyramidal terracotta roof cap (or stepped windcatcher crown)
  pushOrientedBox(out, turCx, yTop - 0.25 + turH, turCz, tx, tz, turW * 0.56, 0.16, turW * 0.56, trimRgb, false);
  pushPyramidalRoofCap(out, turCx, yTop - 0.09 + turH, turCz, tx, tz, turW * 0.60, 0.68, turW * 0.60, terracottaRgb, RM.terracotta);
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype E: Mid-Rise Apartment / Mixed-Use Shophouse (height 9m - 28m)
// ------------------------------------------------------------------------------------------------------------------

function emitMidRiseDetails(
  out, edges, frontIdx, ringCoords, surfY, yTop, cx, cz,
  wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, spec, seed
) {
  const fe = edges[frontIdx];
  if (!fe || fe.len < 3.2) return;
  const { x1, z1, tx, tz, nx, nz, len } = fe;
  const wallH = Math.max(8.5, yTop - surfY);
  const podiumH = Math.min(4.1, Math.max(3.4, wallH * 0.24));

  // 1. Ground-Floor Retail/Lobby Plinth Cornice + Projecting Storefront Awning Canopy + Entrance Door
  const awningChoices = [
    [0.68, 0.18, 0.16], // burgundy café awning
    [0.16, 0.38, 0.26], // forest green bistro awning
    [0.18, 0.28, 0.46], // navy blue shop awning
    [0.28, 0.30, 0.33], // architectural dark bronze metal canopy
  ];
  const awningRgb = awningChoices[(seed >>> 6) % awningChoices.length];

  // Continuous belt-course ledge at podiumH around all edges
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, -0.04, e.len + 0.04, podiumH - 0.10, podiumH + 0.12, 0.02, 0.18, trimRgb, false);
    // Corner masonry piers on ground floor
    if (e.len >= 3.5) {
      pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, 0.0, 0.34, 0.0, podiumH, 0.02, 0.12, plinthRgb, false);
      pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, e.len - 0.34, e.len, 0.0, podiumH, 0.02, 0.12, plinthRgb, false);
    }
  }

  // Storefront awning + entrance door on front edge
  if (len >= 4.2) {
    const awU0 = 0.42, awU1 = len - 0.42;
    pushSlopedWallCanopy(
      out, x1, surfY, z1, tx, tz, nx, nz,
      awU0, awU1, podiumH - 0.12, podiumH - 0.58, 0.04, 0.86,
      awningRgb, trimRgb, RM.metal
    );
  }
  emitEntranceDoorAssembly(
    out, x1, surfY, z1, tx, tz, nx, nz,
    len * 0.5, len, podiumH, doorIdx,
    wallRgb, trimRgb, plinthRgb, false, false
  );

  // 2. Inter-Story String-Course Ledges & Projecting 3D Apartment Balconies with Railings
  const floorH = spec.metersPerFloor || 3.3;
  const upperFloors = Math.max(2, Math.round((wallH - podiumH) / floorH));
  const railRgb = [0.20, 0.22, 0.25];
  const balcCols = Math.max(1, Math.min(3, Math.floor((len - 1.6) / 3.8)));
  const balcW = Math.min(2.15, (len - 1.2) / Math.max(1.5, balcCols * 1.45));

  for (let f = 1; f <= upperFloors; f++) {
    const fy = podiumH + (f - 1) * ((wallH - podiumH) / upperFloors);
    if (fy + 1.8 > wallH) break;

    // String-course ledge every 2 floors
    if (f % 2 === 0) {
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, -0.03, len + 0.03, fy - 0.06, fy + 0.06, 0.02, 0.10, trimRgb, false);
    }

    // Projecting 3D apartment balconies on front facade
    for (let c = 0; c < balcCols; c++) {
      const buMid = ((c + 0.5) / balcCols) * len;
      const bu0 = buMid - balcW * 0.5;
      const bu1 = buMid + balcW * 0.5;
      if (bu0 < 0.35 || bu1 > len - 0.35) continue;
      const bOut = 0.72;
      // Concrete balcony slab
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu0, bu1, fy - 0.08, fy + 0.08, 0.02, bOut, trimRgb, false);
      // Front & side balcony railings + top handrail
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu0, bu1, fy + 0.08, fy + 0.92, bOut - 0.08, bOut, railRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu0, bu0 + 0.07, fy + 0.08, fy + 0.92, 0.02, bOut, railRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu1 - 0.07, bu1, fy + 0.08, fy + 0.92, 0.02, bOut, railRgb, false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, bu0 - 0.02, bu1 + 0.02, fy + 0.92, fy + 0.99, 0.02, bOut + 0.03, trimRgb, false);
    }
  }

  // 3. Perimeter Parapet Wall + Rooftop Elevator/HVAC Penthouse Box
  emitPerimeterParapet(out, ringCoords, yTop, 0.55, wallRgb, trimRgb);
  const phW = Math.min(3.4, Math.max(2.0, len * 0.32));
  const phD = Math.min(2.8, Math.max(1.8, len * 0.26));
  const phH = 2.35;
  pushOrientedBox(out, cx, yTop, cz, tx, tz, phW * 0.5, phH, phD * 0.5, scaleRgb(wallRgb, 0.92), false);
  pushOrientedBox(out, cx, yTop + phH, cz, tx, tz, phW * 0.54, 0.14, phD * 0.54, trimRgb, false);
  // Adjacent metallic HVAC chiller unit with dark louver screen
  const hvacX = cx + tx * (phW * 0.72), hvacZ = cz + tz * (phW * 0.72);
  pushOrientedBox(out, hvacX, yTop, hvacZ, tx, tz, 0.85, 1.35, 0.75, [0.58, 0.61, 0.64], false);
  pushOrientedBox(out, hvacX, yTop + 0.25, hvacZ, tx, tz, 0.89, 0.85, 0.55, [0.22, 0.25, 0.28], false);
}

// ------------------------------------------------------------------------------------------------------------------
// Archetype F: High-Rise / Modern Commercial Infill (2- or 3-Tier Setback Massing + Mullions + Crown + Mast)
// ------------------------------------------------------------------------------------------------------------------

function isStarShapedAroundCenter(ringCoords, cx, cz) {
  const n = (ringCoords.length / 2) | 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ringCoords[i * 2] - cx, az = ringCoords[i * 2 + 1] - cz;
    const bx = ringCoords[j * 2] - cx, bz = ringCoords[j * 2 + 1] - cz;
    // In CCW (x, z), cross = ax * bz - az * bx > 0 when origin is strictly inside each edge half-plane
    if (ax * bz - az * bx <= 0.2) return false;
  }
  return true;
}

function scaleRingAroundCenter(ringCoords, cx, cz, scale) {
  const outRing = new Array(ringCoords.length);
  for (let i = 0; i < ringCoords.length; i += 2) {
    outRing[i] = cx + (ringCoords[i] - cx) * scale;
    outRing[i + 1] = cz + (ringCoords[i + 1] - cz) * scale;
  }
  return outRing;
}

function emitWallRingWithFacadeUv(
  out, ringCoords, yBot, yTop, spec, wallRgb, uShift, botShadeMul = 0.88
) {
  const n = (ringCoords.length / 2) | 0;
  const spanH = Math.max(0.4, yTop - yBot);
  const floors = Math.max(1, Math.round(spanH / spec.metersPerFloor));
  const v0 = facadeV(spec.index, 1.0);
  const v1 = facadeV(spec.index, 1.0 + floors / spec.floors);
  const uBase = facadeUvBase(spec.index) + uShift;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ringCoords[i * 2], z1 = ringCoords[i * 2 + 1];
    const x2 = ringCoords[j * 2], z2 = ringCoords[j * 2 + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) continue;
    const nx = dz / len, nz = -dx / len;
    const shade = 0.96 + 0.04 * (nx * 0.65 + nz * 0.45);
    const bays = Math.max(1, Math.round(len / spec.metersPerBay));
    const u0 = uBase, u1 = uBase + bays / spec.bays;

    const rB = clamp01(wallRgb[0] * shade * botShadeMul);
    const gB = clamp01(wallRgb[1] * shade * botShadeMul);
    const bB = clamp01(wallRgb[2] * shade * botShadeMul);
    const rT = clamp01(wallRgb[0] * shade);
    const gT = clamp01(wallRgb[1] * shade);
    const bT = clamp01(wallRgb[2] * shade);

    pushQuadGrad(
      out,
      x1, yBot, z1, x1, yTop, z1, x2, yTop, z2, x2, yBot, z2,
      nx, 0, nz,
      rB, gB, bB, rT, gT, bT,
      u0, v0, u1, v1
    );
  }
}

function emitHighRiseInfillBuilding(
  out, ringCoords, edges, frontIdx, y0, surfY, yTop, cx, cz,
  spec, wallRgb, trimRgb, plinthRgb, roofRgb, doorIdx, uShift, seed
) {
  const totalH = Math.max(22.0, yTop - surfY);
  const starOk = isStarShapedAroundCenter(ringCoords, cx, cz);
  const hasCrownTier = totalH >= 42.0 && starOk;

  const podiumH = Math.min(8.4, Math.max(5.8, totalH * 0.20));
  const yPodiumTop = surfY + podiumH;
  const yShaftTop = hasCrownTier ? surfY + totalH * 0.82 : yTop;

  const ringTier0 = ringCoords;
  const ringTier1 = starOk ? scaleRingAroundCenter(ringCoords, cx, cz, 0.86) : ringCoords;
  const ringTier2 = hasCrownTier ? scaleRingAroundCenter(ringCoords, cx, cz, 0.72) : ringTier1;

  // 1. Buried Foundation & Ground Plinth Band around Tier 0
  const plinthH = 0.85;
  const yPlinthTop = surfY + plinthH;
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    pushWallBox(out, e.x1, y0, e.z1, e.tx, e.tz, e.nx, e.nz, 0.0, e.len, 0.0, yPlinthTop - y0, 0.0, 0.06, plinthRgb, false);
    pushWallBox(out, e.x1, surfY, e.z1, e.tx, e.tz, e.nx, e.nz, -0.03, e.len + 0.03, plinthH, plinthH + 0.09, 0.0, 0.11, trimRgb, false);
  }

  // 2. Tier 0: 2-Story Podium Base + Grand Lobby Entrance Portal + Podium Roof Terrace
  emitWallRingWithFacadeUv(out, ringTier0, yPlinthTop, yPodiumTop, spec, wallRgb, uShift, 0.86);
  emitFlatRoofRing(out, ringTier0, yPodiumTop, cx, cz, roofRgb, RM.gravel);
  emitPerimeterParapet(out, ringTier0, yPodiumTop, 0.42, wallRgb, trimRgb);

  const fe = edges[frontIdx];
  if (fe && fe.len >= 3.6) {
    // Grand commercial lobby entrance + deep cantilevered glass/metal architectural canopy
    emitEntranceDoorAssembly(
      out, fe.x1, surfY, fe.z1, fe.tx, fe.tz, fe.nx, fe.nz,
      fe.len * 0.5, fe.len, podiumH, doorIdx,
      wallRgb, trimRgb, plinthRgb, false, false
    );
    const canW = Math.min(5.6, fe.len * 0.58);
    const cu0 = (fe.len - canW) * 0.5;
    const cu1 = cu0 + canW;
    const canY = Math.min(podiumH - 0.35, 4.2);
    pushWallBox(out, fe.x1, surfY, fe.z1, fe.tx, fe.tz, fe.nx, fe.nz, cu0, cu1, canY, canY + 0.22, 0.02, 1.38, [0.22, 0.25, 0.29], false);
    pushWallBox(out, fe.x1, surfY, fe.z1, fe.tx, fe.tz, fe.nx, fe.nz, cu0 + 0.25, cu1 - 0.25, canY - 0.05, canY, 0.18, 1.18, [0.95, 0.88, 0.72], true);
  }

  // 3. Tier 1: Inset Upper Tower Shaft + Vertical Mullion Pilaster Strips
  emitWallRingWithFacadeUv(out, ringTier1, yPodiumTop, yShaftTop, spec, wallRgb, uShift, 0.92);
  const n1 = (ringTier1.length / 2) | 0;
  const shaftSpan = yShaftTop - yPodiumTop;
  for (let i = 0; i < n1; i++) {
    const j = (i + 1) % n1;
    const x1 = ringTier1[i * 2], z1 = ringTier1[i * 2 + 1];
    const x2 = ringTier1[j * 2], z2 = ringTier1[j * 2 + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 3.0) continue;
    const tx = dx / len, tz = dz / len;
    const nx = tz, nz = -tx;
    // Corner and mid-span vertical mullion pilaster fins
    const nMullions = Math.max(2, Math.min(5, Math.round(len / 4.8) + 1));
    for (let m = 0; m < nMullions; m++) {
      const mu = 0.16 + (m / (nMullions - 1)) * (len - 0.32);
      pushWallBox(out, x1, yPodiumTop, z1, tx, tz, nx, nz, mu - 0.11, mu + 0.11, 0.0, shaftSpan, 0.01, 0.15, trimRgb, false);
    }
  }

  // 4. Tier 2: Tapered Crown Tier (if tall high-rise)
  if (hasCrownTier) {
    emitFlatRoofRing(out, ringTier1, yShaftTop, cx, cz, roofRgb, RM.gravel);
    emitPerimeterParapet(out, ringTier1, yShaftTop, 0.45, wallRgb, trimRgb);
    emitWallRingWithFacadeUv(out, ringTier2, yShaftTop, yTop, spec, wallRgb, uShift, 0.96);
  }

  // 5. Top Roof Deck + Perimeter Parapet + Mechanical Chiller Penthouse + Aviation Mast & Beacon
  const topRing = hasCrownTier ? ringTier2 : ringTier1;
  emitFlatRoofRing(out, topRing, yTop, cx, cz, roofRgb, RM.gravel);
  emitPerimeterParapet(out, topRing, yTop, 0.78, wallRgb, trimRgb);

  const ax = fe ? fe.tx : 1.0;
  const az = fe ? fe.tz : 0.0;
  const mechW = Math.min(5.2, Math.max(2.6, (fe ? fe.len : 8.0) * 0.34));
  const mechD = Math.min(4.2, Math.max(2.2, mechW * 0.78));
  const mechH = Math.min(3.6, Math.max(2.4, totalH * 0.07));
  pushOrientedBox(out, cx, yTop, cz, ax, az, mechW * 0.5, mechH, mechD * 0.5, scaleRgb(wallRgb, 0.88), false);
  pushOrientedBox(out, cx, yTop + mechH * 0.22, cz, ax, az, mechW * 0.53, mechH * 0.52, mechD * 0.38, [0.18, 0.21, 0.25], false);
  pushOrientedBox(out, cx, yTop + mechH, cz, ax, az, mechW * 0.54, 0.18, mechD * 0.54, trimRgb, false);

  // Illuminated crown accent band on mechanical penthouse + aviation spire & red night beacon
  if (hash01(seed, 97) < 0.65) {
    pushOrientedBox(out, cx, yTop + mechH - 0.24, cz, ax, az, mechW * 0.55, 0.16, mechD * 0.55, [0.88, 0.92, 1.0], true);
  }
  const mastH = Math.min(8.5, Math.max(4.2, totalH * 0.14));
  pushOrientedBox(out, cx, yTop + mechH + 0.18, cz, ax, az, 0.14, mastH, 0.14, [0.68, 0.71, 0.75], false);
  pushOrientedBox(out, cx, yTop + mechH + 0.18 + mastH, cz, ax, az, 0.26, 0.26, 0.26, [1.0, 0.16, 0.10], true);
}

// ------------------------------------------------------------------------------------------------------------------
// Main Entry Point: appendInfillBuilding
// ------------------------------------------------------------------------------------------------------------------

/**
 * Appends one infill building to the chunk's merged facade buffers.
 *  = building tuple,  = terrain height at chunk-local xz,  = { pos, norm, col, uv, triEntity, entityIdx, colliders, roof, roofCtx, detail }.
 */
export function appendInfillBuilding(b, ox, oz, getY, region, out) {
  const [osmId, , btype, , rawH, rawMinH, , style, , , , flatOuter] = b;
  if (!flatOuter || flatOuter.length < 6) return;
  const n = (flatOuter.length / 2) | 0;

  // CCW in (x, z) so (dz, -dx) points outward
  let area2 = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x = flatOuter[i * 2], z = flatOuter[i * 2 + 1];
    area2 += x * flatOuter[j * 2 + 1] - flatOuter[j * 2] * z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const flip = area2 < 0;
  const px = (i) => flatOuter[(flip ? n - 1 - i : i) * 2];
  const pz = (i) => flatOuter[(flip ? n - 1 - i : i) * 2 + 1];

  const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
  if (out.isPointInWater && btype !== 'boathouse' && btype !== 'bridge' && btype !== 'pier') {
    const inW = out.isPointInWater;
    if (inW(cx, cz, 1.0) || inW(minX, minZ, 0.8) || inW(maxX, minZ, 0.8) || inW(minX, maxZ, 0.8) || inW(maxX, maxZ, 0.8)) return;
    for (let i = 0; i < n; i++) {
      const x1 = px(i), z1 = pz(i), x2 = px((i + 1) % n), z2 = pz((i + 1) % n);
      if (inW(x1, z1, 0.8) || inW((x1 + x2) * 0.5, (z1 + z2) * 0.5, 0.8)) return;
    }
  }

  const gC = getY(cx, cz);
  const g00 = getY(minX, minZ), g10 = getY(maxX, minZ), g01 = getY(minX, maxZ), g11 = getY(maxX, maxZ);
  const gLow = Math.min(gC, g00, g10, g01, g11);
  const gHigh = Math.max(gC, g00, g10, g01, g11);
  const gTopBase = gHigh > gC + 0.35 ? gHigh : gC;

  let effMinH = 0;
  if ((rawMinH || 0) > 0.5 && out && Array.isArray(out.colliders)) {
    const wcx = ox + cx, wcz = oz + cz;
    for (let ci = 0; ci < out.colliders.length; ci++) {
      const bc = out.colliders[ci];
      if (wcx >= bc.minX && wcx <= bc.maxX && wcz >= bc.maxZ * 0 + bc.minZ && wcz <= bc.maxZ && bc.h >= gTopBase + rawMinH - 2.0) {
        effMinH = rawMinH;
        break;
      }
    }
  }

  const y0 = effMinH > 0.5 ? gTopBase + effMinH : gLow - 1.2;
  const surfY = effMinH > 0.5 ? y0 : gTopBase;
  const totalH = Math.max(3.2, Number(rawH) || 6.0);
  let yTop = gTopBase + totalH;

  const rc = out.roof || out.roofCtx || null; // [roofs]
  const detailSink = out.detail || (rc && typeof rc.detailFor === 'function' ? rc.detailFor(cx, cz) : rc && rc.sinks ? roofSinkFor(rc, cx, cz) : null);

  const wx = ox + cx, wz = oz + cz;
  const seed = ((Math.round(wx * 13.7) * 73856093) ^ (Math.round(wz * 13.7) * 19349663) ^ ((Number(osmId) || 0) * 83492791)) >>> 0;
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanZ);
  const minSpan = Math.min(spanX, spanZ);
  const polyArea = Math.abs(area2) * 0.5;
  const archKey = (rc && rc.arch) ? rc.arch : (region || 'beijing');

  const sel = selectFacadeForBuilding({ height: totalH, btype, style, name: '', arch: rc ? rc.arch : archKey, span: maxSpan }, seed, region);
  const spec = sel.spec;

  // Build CCW ring & edge records
  const ring = new Array(n * 2);
  const edges = [];
  let frontIdx = 0;
  let bestFrontScore = -Infinity;

  for (let i = 0; i < n; i++) {
    const x1 = px(i), z1 = pz(i);
    const x2 = px((i + 1) % n), z2 = pz((i + 1) % n);
    ring[i * 2] = x1;
    ring[i * 2 + 1] = z1;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) continue;
    const tx = dx / len, tz = dz / len;
    const nx = tz, nz = -tx;
    const eIdx = edges.length;
    edges.push({ x1, z1, x2, z2, dx, dz, len, tx, tz, nx, nz });
    // Prefer a long, street-eligible edge with slight sun/seed bias
    const score = len * (1.0 + 0.08 * (nx * 0.4 + nz * 0.6) + 0.05 * hash01(seed, 101 + i));
    if (score > bestFrontScore) {
      bestFrontScore = score;
      frontIdx = eIdx;
    }
  }
  if (!edges.length) return;

  // Deterministically select one of the 6 3D architectural archetypes
  const archetype = selectInfillArchetype(archKey, btype, totalH, polyArea, maxSpan, minSpan, seed);
  const doorIdx = selectDoorIndexForArchetype(archetype, archKey, seed);
  const uShift = ((seed >>> 7) % spec.bays) / spec.bays;

  // Compute architectural surface palettes (wall, plinth, trim, roof)
  const wallTint = sel.wallTint;
  const av = spec.avgColor || [0.58, 0.56, 0.52];
  let wallSolidRgb = [
    clamp01(av[0] * wallTint[0] * 1.15),
    clamp01(av[1] * wallTint[1] * 1.15),
    clamp01(av[2] * wallTint[2] * 1.15),
  ];
  if (archetype === ARCH_MED_VILLA) {
    wallSolidRgb = mixRgb(wallSolidRgb, [0.90, 0.80, 0.66], 0.45);
  }
  const sec = sel.wallSecondary || scaleRgb(wallSolidRgb, 0.82);
  const plinthRgb = [
    clamp01(sec[0] * 0.78),
    clamp01(sec[1] * 0.77),
    clamp01(sec[2] * 0.76),
  ];
  const trimRgb = [
    clamp01(wallSolidRgb[0] * 0.82 + 0.18),
    clamp01(wallSolidRgb[1] * 0.82 + 0.17),
    clamp01(wallSolidRgb[2] * 0.80 + 0.16),
  ];
  const roofDeckRgb = sel.roofDeck || [0.36, 0.37, 0.39];

  // High-Rise / Modern Commercial Infill (Archetype F) uses multi-tier setback massing
  if (archetype === ARCH_HIGH_RISE && effMinH <= 0.5) {
    emitHighRiseInfillBuilding(
      out, ring, edges, frontIdx, y0, surfY, yTop, cx, cz,
      spec, wallTint, trimRgb, plinthRgb, roofDeckRgb, doorIdx, uShift, seed
    );
    syncTriEntity(out);
    out.colliders.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: yTop, flatOuter, ox, oz, id: osmId });
    return;
  }

  // [roofs] Plan pitched / mansard roof for low-rise & eligible mid-rise infill buildings (walls stop at eaves)
  let plan = null;
  if (archetype !== ARCH_MID_RISE && effMinH <= 0.5) {
    const roofReg = (rc && rc.arch && rc.arch !== 'beijing') ? rc.arch : (archKey === 'beijing' ? 'china' : archKey);
    plan = planRoof({
      flatOuter: ring,
      rawH: totalH,
      btype,
      region: roofReg,
      seed,
      flav: rc ? roofFlav(rc, cx, cz) : 0.65,
      isPart: false,
      minH: rawMinH,
      osm: null,
      facadeId: spec.id,
      hasHoles: false,
    });
    if (plan) {
      yTop = Math.max(Math.max(y0, gLow) + 2.8, yTop - roofRise(plan));
    }
  }

  // 1. Foundation Plinth Band (0.55m-0.88m above surfY, extending down to buried y0) & Eave Fascia Trim on All Edges
  const wallSpan = Math.max(2.6, yTop - surfY);
  const plinthH = effMinH > 0.5 ? 0.0 : Math.min(wallSpan * 0.22, archetype === ARCH_ROWHOUSE ? 0.82 : 0.64);
  const yWallStart = surfY + plinthH;
  const floors = Math.max(1, Math.round((yTop - yWallStart) / spec.metersPerFloor));
  const v0 = facadeV(spec.index, 1.0);
  const v1 = facadeV(spec.index, 1.0 + floors / spec.floors);
  const uBase = facadeUvBase(spec.index) + uShift;

  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    const { x1, z1, x2, z2, len, tx, tz, nx, nz } = e;
    const shade = 0.96 + 0.04 * (nx * 0.65 + nz * 0.45);

    // 1a. Recessed/projecting masonry/concrete foundation plinth band from buried y0 up to yWallStart
    if (effMinH <= 0.5) {
      pushWallBox(out, x1, y0, z1, tx, tz, nx, nz, 0.0, len, 0.0, yWallStart - y0, 0.0, 0.055, scaleRgb(plinthRgb, shade), false);
      pushWallBox(out, x1, surfY, z1, tx, tz, nx, nz, -0.02, len + 0.02, plinthH, plinthH + 0.07, 0.0, 0.09, scaleRgb(trimRgb, shade), false);
    }

    // 1b. Main Facade Wall Quad (from yWallStart up to yTop)
    const bays = Math.max(1, Math.round(len / spec.metersPerBay));
    const u0 = uBase, u1 = uBase + bays / spec.bays;
    const rB = clamp01(wallTint[0] * shade * 0.88);
    const gB = clamp01(wallTint[1] * shade * 0.88);
    const bB = clamp01(wallTint[2] * shade * 0.88);
    const rT = clamp01(wallTint[0] * shade);
    const gT = clamp01(wallTint[1] * shade);
    const bT = clamp01(wallTint[2] * shade);

    pushQuadGrad(
      out,
      x1, yWallStart, z1, x1, yTop, z1, x2, yTop, z2, x2, yWallStart, z2,
      nx, 0, nz,
      rB, gB, bB, rT, gT, bT,
      u0, v0, u1, v1
    );

    // 1c. Continuous Eave Fascia Molding Trim at yTop
    pushWallBox(out, x1, yTop, z1, tx, tz, nx, nz, -0.03, len + 0.03, -0.20, 0.02, 0.01, 0.11, scaleRgb(trimRgb, shade), false);
  }

  // 2. Emit Archetype-Specific 3D Architectural Details
  const roofColor = plan && plan.rgb ? plan.rgb : roofDeckRgb;
  if (effMinH <= 0.5) {
    switch (archetype) {
      case ARCH_SUBURBAN:
        emitSuburbanHouseDetails(out, edges, frontIdx, surfY, yTop, cx, cz, wallSolidRgb, trimRgb, plinthRgb, roofColor, doorIdx, seed);
        break;
      case ARCH_ROWHOUSE:
        emitRowhouseDetails(out, edges, frontIdx, surfY, yTop, wallSolidRgb, trimRgb, plinthRgb, roofColor, doorIdx, seed);
        break;
      case ARCH_EAST_ASIAN:
        emitEastAsianHouseDetails(out, edges, frontIdx, surfY, yTop, archKey, wallSolidRgb, trimRgb, plinthRgb, roofColor, doorIdx, seed);
        break;
      case ARCH_MED_VILLA:
        emitMedVillaDetails(out, edges, frontIdx, surfY, yTop, cx, cz, archKey, wallSolidRgb, trimRgb, plinthRgb, roofColor, doorIdx, seed);
        break;
      case ARCH_MID_RISE:
      default:
        emitMidRiseDetails(out, edges, frontIdx, ring, surfY, yTop, cx, cz, wallSolidRgb, trimRgb, plinthRgb, roofColor, doorIdx, spec, seed);
        break;
    }
  }

  // 3. Emit Roof (Pitched/Mansard via emitRoof, or Procedural Flat Roof + Parapet)
  if (plan) {
    const r = emitRoof(out, ring, [], plan, yTop, {
      wallRgb: wallSolidRgb,
      lod: detailSink ? 'full' : 'cheap',
      detail: detailSink,
      seed,
    });
    if (detailSink) syncTriEntity(detailSink);
    if (r) {
      syncTriEntity(out);
      out.colliders.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: r.ridgeY, flatOuter, ox, oz, id: osmId, pitched: true });
      if (rc) addHouse(rc, ring, cx, cz, osmId, plan.shape, btype);
      return;
    }
  }

  // Flat roof fallback (with perimeter parapet if not already emitted by Mid-Rise)
  emitFlatRoofRing(out, ring, yTop, cx, cz, roofDeckRgb, RM.gravel);
  if (archetype !== ARCH_MID_RISE) {
    emitPerimeterParapet(out, ring, yTop, 0.34, wallSolidRgb, trimRgb);
  }
  syncTriEntity(out);

  out.colliders.push({ minX: minX + ox, maxX: maxX + ox, minZ: minZ + oz, maxZ: maxZ + oz, h: yTop, flatOuter, ox, oz, id: osmId });
}
