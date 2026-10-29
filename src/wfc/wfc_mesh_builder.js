import * as THREE from '../../vendor/three.module.js';
import {
  BEIJING_STYLES_24,
  BEIJING_ARCHETYPES,
  FACADE_TILES,
  getStyle24TileWeights,
} from './wfc_archetypes.js';
import {
  createSeededRNG,
  ensureCCWFlatXZ,
  collapseVerticalMassingWFC,
  collapseRooftopGreebleWFC,
  resolveBeijingStyle24,
  applyPaletteMicroTint,
} from './wfc_solver.js';
import { EXTRA_FACADES, PAINT_PALETTES } from '../features/facade_styles.js'; // [roofs]
import { planRoof, roofRise, emitRoof } from '../features/roofs.js'; // [roofs]
import { classifyFamousBuilding } from '../features/company_building_styles.js';

/**
 * Pushes a 3D oriented box in local wall coordinates:
 * - u in [u0, u1]: distance along wall tangent (tx, tz) from (x1, z1)
 * - v in [v0, v1]: vertical height from tier base y0
 * - n in [n0, n1]: protrusion along outward wall normal (nx, nz)
 * Emits flat analytic normals for crisp architectural shading.
 */
function pushWallBox(pos, norm, col, x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, triEntity = null, entityIdx = 0, emissive = false) {
  const p = (u, v, n) => [
    x1 + u * tx + n * nx,
    y0 + v,
    z1 + u * tz + n * nz,
  ];
  const nScale = emissive ? 2.0 : 1.0;

  const pushFace = (a, b, c, d, fnx, fny, fnz, shade = 1.0) => {
    pos.push(
      a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]
    );
    const r = Math.min(1, rgb[0] * shade);
    const g = Math.min(1, rgb[1] * shade);
    const bl = Math.min(1, rgb[2] * shade);
    const snx = fnx * nScale, sny = fny * nScale, snz = fnz * nScale;
    for (let i = 0; i < 6; i++) {
      norm.push(snx, sny, snz);
      col.push(r, g, bl);
    }
    if (triEntity) {
      triEntity.push(entityIdx, entityIdx);
    }
  };

  const fBL = p(u0, v0, n1);
  const fBR = p(u1, v0, n1);
  const fTR = p(u1, v1, n1);
  const fTL = p(u0, v1, n1);
  // Front face (+normal)
  pushFace(fBL, fTL, fTR, fBR, nx, 0, nz, 1.0);

  if (Math.abs(n1 - n0) > 0.02) {
    const bBL = p(u0, v0, n0);
    const bBR = p(u1, v0, n0);
    const bTR = p(u1, v1, n0);
    const bTL = p(u0, v1, n0);

    // Top face (+Y)
    pushFace(bTL, bTR, fTR, fTL, 0, 1, 0, 1.06);
    // Bottom face (-Y)
    pushFace(fBL, fBR, bBR, bBL, 0, -1, 0, 0.72);
    // Left face (-tangent)
    pushFace(bBL, bTL, fTL, fBL, -tx, 0, -tz, 0.88);
    // Right face (+tangent)
    pushFace(fBR, fTR, bTR, bBR, tx, 0, tz, 0.88);
  }
}

/**
 * Pushes a single front-facing quad on a wall at normal offset `nOff` (2 triangles, 6 vertices).
 */
function pushWallQuad(pos, norm, col, x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, nOff, rgb, shadeBottom = 1.0, triEntity = null, entityIdx = 0, emissive = false) {
  const ax = x1 + u0 * tx + nOff * nx, ay = y0 + v0, az = z1 + u0 * tz + nOff * nz;
  const bx = x1 + u0 * tx + nOff * nx, by = y0 + v1, bz = z1 + u0 * tz + nOff * nz;
  const cx = x1 + u1 * tx + nOff * nx, cy = y0 + v1, cz = z1 + u1 * tz + nOff * nz;
  const dx = x1 + u1 * tx + nOff * nx, dy = y0 + v0, dz = z1 + u1 * tz + nOff * nz;

  pos.push(
    ax, ay, az, bx, by, bz, cx, cy, cz,
    ax, ay, az, cx, cy, cz, dx, dy, dz
  );
  const rTop = rgb[0], gTop = rgb[1], bTop = rgb[2];
  const rBot = rgb[0] * shadeBottom, gBot = rgb[1] * shadeBottom, bBot = rgb[2] * shadeBottom;
  const nScale = emissive ? 2.0 : 1.0;
  const snx = nx * nScale, snz = nz * nScale;
  for (let i = 0; i < 6; i++) {
    norm.push(snx, 0, snz);
  }
  col.push(
    rBot, gBot, bBot,
    rTop, gTop, bTop,
    rTop, gTop, bTop,
    rBot, gBot, bBot,
    rTop, gTop, bTop,
    rBot, gBot, bBot
  );
  if (triEntity) {
    triEntity.push(entityIdx, entityIdx);
  }
}

/**
 * Pushes an axis-aligned 3D box at (cx, minY, cz) with size (w, h, d).
 */
function pushWorldBox(pos, norm, col, cx, minY, cz, w, h, d, rgb, triEntity = null, entityIdx = 0, emissive = false) {
  const hw = w * 0.5, hd = d * 0.5;
  const x0 = cx - hw, x1 = cx + hw;
  const z0 = cz - hd, z1 = cz + hd;
  const y0 = minY, y1 = minY + h;
  const nScale = emissive ? 2.0 : 1.0;

  const pushQ = (ax, ay, az, bx, by, bz, cxp, cyp, czp, dx, dy, dz, nx, ny, nz, sh = 1.0) => {
    pos.push(
      ax, ay, az, bx, by, bz, cxp, cyp, czp,
      ax, ay, az, cxp, cyp, czp, dx, dy, dz
    );
    const r = Math.min(1, rgb[0] * sh);
    const g = Math.min(1, rgb[1] * sh);
    const b = Math.min(1, rgb[2] * sh);
    const snx = nx * nScale, sny = ny * nScale, snz = nz * nScale;
    for (let i = 0; i < 6; i++) {
      norm.push(snx, sny, snz);
      col.push(r, g, b);
    }
    if (triEntity) {
      triEntity.push(entityIdx, entityIdx);
    }
  };

  pushQ(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, 1.0);
  pushQ(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, 0.92);
  pushQ(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, 0.88);
  pushQ(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, 0.95);
  pushQ(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, 1.06);
}

/**
 * Emits the 3D articulated geometry for a single collapsed facade cell (bx, by).
 */
export function emitFacadeTile3D(
  pos,
  norm,
  col,
  tileId,
  wall,
  tierY0,
  bx,
  by,
  v0,
  v1,
  palette,
  cellSeed
) {
  const { x1, z1, tx, tz, nx, nz, bayW } = wall;
  const u0 = bx * bayW;
  const u1 = (bx + 1) * bayW;
  const fh = v1 - v0;

  const isLit = ((cellSeed * 2654435761) >>> 24) < 68;
  const glassCol = isLit ? palette.glassLit : palette.glassDark;
  const wallMain = palette.wallPrimary;
  const wallSec = palette.wallSecondary;
  const stoneCol = palette.podiumStone;
  const frameCol = palette.mullion;
  const accCol = palette.accent;

  const emitBox = (lu0, lu1, lv0, lv1, n0, n1, rgb, forceEmissive = false) => {
    const isEmissive = forceEmissive || rgb === palette.glassLit || (rgb === glassCol && isLit);
    pushWallBox(pos, norm, col, x1, tierY0, z1, tx, tz, nx, nz, lu0, lu1, lv0, lv1, n0, n1, rgb, null, 0, isEmissive);
  };

  switch (tileId) {
    case 'G_CORNER_PIER': {
      emitBox(u0, u1, v0, v1, 0.0, 0.24, stoneCol);
      emitBox(u0, u1, v0, v0 + 0.35, 0.24, 0.30, wallSec);
      emitBox(u0, u1, v1 - 0.25, v1, 0.24, 0.30, wallSec);
      break;
    }

    case 'M_CORNER_PIER': {
      emitBox(u0, u1, v0, v1, 0.0, 0.20, wallMain);
      emitBox(u0 + bayW * 0.12, u1 - bayW * 0.12, v0, v1, 0.20, 0.26, wallSec);
      emitBox(u0, u1, v1 - 0.16, v1, 0.20, 0.25, wallSec);
      break;
    }

    case 'G_LOBBY_GLASS': {
      emitBox(u0, u1, v0, v1, 0.0, 0.04, palette.glassLit);
      emitBox(u0, u0 + bayW * 0.16, v0, v1, 0.04, 0.38, stoneCol);
      emitBox(u1 - bayW * 0.16, u1, v0, v1, 0.04, 0.38, stoneCol);
      emitBox(u0 + bayW * 0.16, u1 - bayW * 0.16, v0 + fh * 0.68, v0 + fh * 0.78, 0.04, 1.25, frameCol);
      emitBox(u0 + bayW * 0.18, u1 - bayW * 0.18, v0 + fh * 0.74, v0 + fh * 0.80, 0.08, 1.28, accCol);
      break;
    }

    case 'G_COLONNADE': {
      emitBox(u0, u1, v0, v1, 0.0, 0.03, glassCol);
      emitBox(u0, u0 + bayW * 0.22, v0, v1, 0.03, 0.44, stoneCol);
      emitBox(u1 - bayW * 0.22, u1, v0, v1, 0.03, 0.44, stoneCol);
      emitBox(u0, u1, v1 - fh * 0.22, v1, 0.03, 0.46, stoneCol);
      break;
    }

    case 'G_IMPERIAL_COLONNADE': {
      // White marble Xumi pedestal + vermilion palace wall + twin vermilion pillars + golden lattice window
      emitBox(u0, u1, v0, v0 + fh * 0.22, 0.0, 0.42, stoneCol);
      emitBox(u0, u1, v0 + fh * 0.22, v1, 0.0, 0.08, wallMain);
      emitBox(u0 + bayW * 0.06, u0 + bayW * 0.22, v0 + fh * 0.22, v1, 0.08, 0.36, accCol);
      emitBox(u1 - bayW * 0.22, u1 - bayW * 0.06, v0 + fh * 0.22, v1, 0.08, 0.36, accCol);
      emitBox(u0 + bayW * 0.24, u1 - bayW * 0.24, v0 + fh * 0.28, v0 + fh * 0.86, 0.08, 0.15, frameCol);
      emitBox(u0 + bayW * 0.28, u1 - bayW * 0.28, v0 + fh * 0.32, v0 + fh * 0.82, 0.15, 0.18, glassCol);
      break;
    }

    case 'G_SHOP_RED':
    case 'G_SHOP_BLUE':
    case 'G_SHOP_GOLD': {
      const signCol =
        tileId === 'G_SHOP_RED'
          ? [0.85, 0.22, 0.18]
          : tileId === 'G_SHOP_BLUE'
            ? [0.16, 0.52, 0.84]
            : [0.90, 0.66, 0.16];
      emitBox(u0, u1, v0, v1, 0.0, 0.05, [0.86, 0.78, 0.58]);
      emitBox(u0, u0 + bayW * 0.10, v0, v1, 0.05, 0.26, stoneCol);
      emitBox(u1 - bayW * 0.10, u1, v0, v1, 0.05, 0.26, stoneCol);
      emitBox(u0 + bayW * 0.06, u1 - bayW * 0.06, v0 + fh * 0.68, v0 + fh * 0.94, 0.05, 0.42, signCol);
      emitBox(u0 + bayW * 0.10, u1 - bayW * 0.10, v0 + fh * 0.73, v0 + fh * 0.89, 0.42, 0.46, [0.96, 0.94, 0.88]);
      break;
    }

    case 'G_UNIT_ENTRY': {
      emitBox(u0, u1, v0, v1, 0.0, 0.08, stoneCol);
      emitBox(u0 + bayW * 0.24, u1 - bayW * 0.24, v0 + 0.18, v0 + fh * 0.72, 0.08, 0.12, [0.22, 0.25, 0.28]);
      emitBox(u0 + bayW * 0.14, u1 - bayW * 0.14, v0, v0 + 0.24, 0.08, 0.85, wallSec);
      emitBox(u0 + bayW * 0.10, u1 - bayW * 0.10, v0 + fh * 0.72, v0 + fh * 0.82, 0.08, 0.98, wallSec);
      break;
    }

    case 'G_DADO_WIN': {
      emitBox(u0, u1, v0, v0 + fh * 0.36, 0.0, 0.12, stoneCol);
      emitBox(u0, u1, v0 + fh * 0.36, v1, 0.0, 0.08, wallMain);
      emitBox(u0 + bayW * 0.20, u1 - bayW * 0.20, v0 + fh * 0.38, v0 + fh * 0.82, 0.08, 0.13, frameCol);
      emitBox(u0 + bayW * 0.24, u1 - bayW * 0.24, v0 + fh * 0.42, v0 + fh * 0.78, 0.13, 0.15, glassCol);
      break;
    }

    case 'G_DADO_BALCONY_BASE':
    case 'M_BALCONY_ENC': {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      const bL = u0 + bayW * 0.08;
      const bR = u1 - bayW * 0.08;
      emitBox(bL, bR, v0 + fh * 0.04, v0 + fh * 0.40, 0.06, 0.58, tileId === 'G_DADO_BALCONY_BASE' ? stoneCol : wallSec);
      emitBox(bL, bR, v0 + fh * 0.40, v0 + fh * 0.86, 0.06, 0.54, frameCol);
      emitBox(bL + bayW * 0.05, bR - bayW * 0.05, v0 + fh * 0.44, v0 + fh * 0.82, 0.54, 0.57, glassCol);
      emitBox(bL - bayW * 0.02, bR + bayW * 0.02, v0 + fh * 0.86, v0 + fh * 0.94, 0.06, 0.68, accCol);
      break;
    }

    case 'M_BALCONY_OPEN': {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      emitBox(u0 + bayW * 0.16, u1 - bayW * 0.16, v0 + fh * 0.08, v0 + fh * 0.82, 0.06, 0.10, glassCol);
      const bL = u0 + bayW * 0.08;
      const bR = u1 - bayW * 0.08;
      emitBox(bL, bR, v0, v0 + fh * 0.10, 0.06, 0.58, wallSec);
      emitBox(bL, bR, v0 + fh * 0.36, v0 + fh * 0.42, 0.50, 0.56, [0.22, 0.42, 0.32]);
      emitBox(bL, bL + 0.08, v0 + fh * 0.10, v0 + fh * 0.42, 0.50, 0.56, [0.22, 0.42, 0.32]);
      emitBox(bR - 0.08, bR, v0 + fh * 0.10, v0 + fh * 0.42, 0.50, 0.56, [0.22, 0.42, 0.32]);
      break;
    }

    case 'M_WALL_AC': {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      const wL = u0 + bayW * 0.14;
      const wR = u1 - bayW * 0.28;
      emitBox(wL - 0.04, wR + 0.04, v0 + fh * 0.16, v0 + fh * 0.22, 0.06, 0.18, wallSec);
      emitBox(wL, wR, v0 + fh * 0.22, v0 + fh * 0.80, 0.06, 0.11, frameCol);
      emitBox(wL + 0.05, wR - 0.05, v0 + fh * 0.25, v0 + fh * 0.77, 0.11, 0.13, glassCol);
      const acL = u1 - bayW * 0.24;
      const acR = u1 - bayW * 0.05;
      emitBox(acL, acR, v0 + fh * 0.24, v0 + fh * 0.48, 0.06, 0.38, [0.88, 0.89, 0.90]);
      emitBox(acL + 0.04, acR - 0.16, v0 + fh * 0.28, v0 + fh * 0.44, 0.38, 0.40, [0.22, 0.25, 0.28]);
      break;
    }

    case 'M_RIBBON_WIN': {
      // Horizontal ribbon window + projecting spandrel band (S03 emerald tech / S17 90s white tile)
      emitBox(u0, u1, v0, v0 + fh * 0.34, 0.0, 0.18, wallMain);
      emitBox(u0, u1, v0 + fh * 0.30, v0 + fh * 0.36, 0.18, 0.24, accCol);
      emitBox(u0, u1, v0 + fh * 0.34, v0 + fh * 0.88, 0.0, 0.08, glassCol);
      emitBox(u0 + bayW * 0.48, u0 + bayW * 0.52, v0 + fh * 0.34, v0 + fh * 0.88, 0.08, 0.14, frameCol);
      emitBox(u0, u1, v0 + fh * 0.88, v1, 0.0, 0.18, wallSec);
      break;
    }

    case 'M_ARCH_WIN': {
      // Campus / 50s Soviet red-brick wall + white stone architrave window frame + keystone lintel
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      const wL = u0 + bayW * 0.18;
      const wR = u1 - bayW * 0.18;
      emitBox(wL - 0.08, wR + 0.08, v0 + fh * 0.14, v0 + fh * 0.22, 0.06, 0.24, stoneCol);
      emitBox(wL - 0.06, wR + 0.06, v0 + fh * 0.22, v0 + fh * 0.84, 0.06, 0.16, wallSec);
      emitBox(wL, wR, v0 + fh * 0.24, v0 + fh * 0.78, 0.16, 0.19, glassCol);
      // Top arched lintel / keystone cap
      emitBox(wL - 0.08, wR + 0.08, v0 + fh * 0.78, v0 + fh * 0.88, 0.06, 0.24, stoneCol);
      break;
    }

    case 'M_INDUSTRIAL_LOFT': {
      // 798 Art District red-brick pilaster ribs + large black-steel multi-pane factory window
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      emitBox(u0, u0 + bayW * 0.14, v0, v1, 0.06, 0.24, wallMain);
      emitBox(u1 - bayW * 0.14, u1, v0, v1, 0.06, 0.24, wallMain);
      emitBox(u0 + bayW * 0.14, u1 - bayW * 0.14, v0 + fh * 0.14, v0 + fh * 0.88, 0.06, 0.12, frameCol);
      emitBox(u0 + bayW * 0.18, u1 - bayW * 0.18, v0 + fh * 0.18, v0 + fh * 0.84, 0.12, 0.15, glassCol);
      emitBox(u0 + bayW * 0.14, u1 - bayW * 0.14, v0 + fh * 0.48, v0 + fh * 0.54, 0.12, 0.18, frameCol);
      break;
    }

    case 'M_FRENCH_BALCONY': {
      // Neoclassical stone facade + tall recessed French window + stone sill + black/gold iron balustrade
      emitBox(u0, u1, v0, v1, 0.0, 0.08, wallMain);
      const wL = u0 + bayW * 0.18;
      const wR = u1 - bayW * 0.18;
      emitBox(wL - 0.06, wR + 0.06, v0 + fh * 0.08, v0 + fh * 0.16, 0.08, 0.34, stoneCol);
      emitBox(wL, wR, v0 + fh * 0.16, v0 + fh * 0.86, 0.08, 0.14, glassCol);
      emitBox(wL, wR, v0 + fh * 0.34, v0 + fh * 0.40, 0.26, 0.32, accCol);
      emitBox(wL - 0.04, wR + 0.04, v0 + fh * 0.86, v0 + fh * 0.93, 0.08, 0.24, wallSec);
      break;
    }

    case 'M_PANORAMA_GLASS': {
      // 2020s Fourth-Gen luxury flat: wide panoramic floor-to-ceiling glass + crisp aluminum slab edge
      emitBox(u0, u1, v0, v0 + fh * 0.12, 0.0, 0.22, wallMain);
      emitBox(u0 + bayW * 0.05, u1 - bayW * 0.05, v0 + fh * 0.12, v0 + fh * 0.92, 0.0, 0.10, glassCol);
      emitBox(u0, u0 + bayW * 0.06, v0 + fh * 0.12, v0 + fh * 0.92, 0.0, 0.18, frameCol);
      emitBox(u1 - bayW * 0.06, u1, v0 + fh * 0.12, v0 + fh * 0.92, 0.0, 0.18, frameCol);
      emitBox(u0, u1, v0 + fh * 0.92, v1, 0.0, 0.24, wallSec);
      break;
    }

    case 'M_STAIR_WINDOW': {
      emitBox(u0, u1, v0, v1, 0.0, 0.08, wallMain);
      emitBox(u0 + bayW * 0.12, u0 + bayW * 0.22, v0, v1, 0.08, 0.18, wallSec);
      emitBox(u1 - bayW * 0.22, u1 - bayW * 0.12, v0, v1, 0.08, 0.18, wallSec);
      emitBox(u0 + bayW * 0.28, u1 - bayW * 0.28, v0 + fh * 0.12, v0 + fh * 0.66, 0.08, 0.12, frameCol);
      emitBox(u0 + bayW * 0.32, u1 - bayW * 0.32, v0 + fh * 0.16, v0 + fh * 0.62, 0.12, 0.14, glassCol);
      break;
    }

    case 'G_TOWER_BAY_BASE':
    case 'M_BAY_WINDOW': {
      emitBox(u0, u1, v0, v1, 0.0, 0.07, tileId === 'G_TOWER_BAY_BASE' ? stoneCol : wallMain);
      const wL = u0 + bayW * 0.15;
      const wR = u1 - bayW * 0.15;
      emitBox(wL - 0.06, wR + 0.06, v0 + fh * 0.16, v0 + fh * 0.24, 0.07, 0.46, wallSec);
      emitBox(wL - 0.06, wR + 0.06, v0 + fh * 0.80, v0 + fh * 0.88, 0.07, 0.46, wallSec);
      emitBox(wL, wR, v0 + fh * 0.24, v0 + fh * 0.80, 0.07, 0.42, glassCol);
      emitBox(wL + bayW * 0.22, wR - bayW * 0.22, v0 + fh * 0.24, v0 + fh * 0.80, 0.42, 0.45, frameCol);
      break;
    }

    case 'G_TOWER_LOUVER_BASE':
    case 'M_AC_LOUVER': {
      emitBox(u0, u1, v0, v1, 0.0, 0.08, wallSec);
      emitBox(u0 + bayW * 0.22, u1 - bayW * 0.22, v0 + fh * 0.08, v0 + fh * 0.92, 0.08, 0.14, frameCol);
      for (let s = 0.20; s <= 0.80; s += 0.20) {
        emitBox(u0 + bayW * 0.20, u1 - bayW * 0.20, v0 + fh * s, v0 + fh * (s + 0.06), 0.14, 0.20, stoneCol);
      }
      break;
    }

    case 'M_PILASTER_WIN': {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      emitBox(u0, u0 + bayW * 0.18, v0, v1, 0.06, 0.28, wallSec);
      emitBox(u1 - bayW * 0.18, u1, v0, v1, 0.06, 0.28, wallSec);
      emitBox(u0 + bayW * 0.18, u1 - bayW * 0.18, v0 + fh * 0.16, v0 + fh * 0.84, 0.06, 0.10, glassCol);
      emitBox(u0 + bayW * 0.18, u1 - bayW * 0.18, v0, v0 + fh * 0.14, 0.06, 0.18, wallMain);
      break;
    }

    case 'M_CURTAIN_GLASS':
    case 'M_LOBBY_MEZZANINE': {
      emitBox(u0, u1, v0, v0 + fh * 0.20, 0.0, 0.12, wallPrimaryMix(wallMain, wallSec));
      emitBox(u0, u1, v0 + fh * 0.20, v1, 0.0, 0.07, glassCol);
      emitBox(u0, u0 + 0.12, v0, v1, 0.07, 0.22, frameCol);
      emitBox(u0 + bayW * 0.5 - 0.05, u0 + bayW * 0.5 + 0.05, v0, v1, 0.07, 0.16, frameCol);
      break;
    }

    case 'M_LED_SCREEN': {
      emitBox(u0, u1, v0, v1, 0.0, 0.22, [0.16, 0.18, 0.22]);
      const ledCol = (bx + by) % 2 === 0 ? accCol : [0.18, 0.68, 0.92];
      emitBox(u0 + 0.08, u1 - 0.08, v0 + 0.08, v1 - 0.08, 0.22, 0.28, ledCol);
      break;
    }

    case 'G_MINISTRY_PORTICO': {
      emitBox(u0, u1, v0, v1, 0.0, 0.12, stoneCol);
      emitBox(u0, u1, v0, v0 + 0.36, 0.12, 1.15, stoneCol);
      emitBox(u0 + bayW * 0.08, u0 + bayW * 0.24, v0 + 0.36, v0 + fh * 0.82, 0.65, 1.02, accCol);
      emitBox(u1 - bayW * 0.24, u1 - bayW * 0.08, v0 + 0.36, v0 + fh * 0.82, 0.65, 1.02, accCol);
      emitBox(u0 - 0.05, u1 + 0.05, v0 + fh * 0.82, v0 + fh * 0.96, 0.12, 1.18, wallSec);
      emitBox(u0, u1, v0 + fh * 0.76, v0 + fh * 0.82, 0.12, 1.08, accCol);
      break;
    }

    case 'G_HUTONG_GATE': {
      emitBox(u0, u1, v0, v1, 0.0, 0.08, wallMain);
      emitBox(u0 + bayW * 0.16, u1 - bayW * 0.16, v0 + 0.15, v0 + fh * 0.78, 0.08, 0.14, accCol);
      emitBox(u0 + bayW * 0.12, u0 + bayW * 0.26, v0, v0 + 0.65, 0.14, 0.58, stoneCol);
      emitBox(u1 - bayW * 0.26, u1 - bayW * 0.12, v0, v0 + 0.65, 0.14, 0.58, stoneCol);
      emitBox(u0 + bayW * 0.06, u1 - bayW * 0.06, v0 + fh * 0.78, v0 + fh * 0.92, 0.08, 0.52, palette.roofDeck);
      break;
    }

    case 'G_HUTONG_LATTICE': {
      emitBox(u0, u1, v0, v0 + fh * 0.32, 0.0, 0.10, wallMain);
      emitBox(u0, u1, v0 + fh * 0.32, v1, 0.0, 0.06, wallMain);
      emitBox(u0 + bayW * 0.14, u1 - bayW * 0.14, v0 + fh * 0.32, v0 + fh * 0.82, 0.06, 0.14, frameCol);
      emitBox(u0 + bayW * 0.20, u1 - bayW * 0.20, v0 + fh * 0.36, v0 + fh * 0.78, 0.14, 0.16, glassCol);
      break;
    }

    case 'G_HUTONG_BRICK': {
      emitBox(u0, u1, v0, v1, 0.0, 0.08, wallMain);
      emitBox(u0, u1, v0, v0 + 0.35, 0.08, 0.13, stoneCol);
      emitBox(u0 + bayW * 0.28, u1 - bayW * 0.28, v0 + fh * 0.62, v0 + fh * 0.82, 0.08, 0.13, wallSec);
      break;
    }

    case 'T_PAILOU_CROWN': {
      emitBox(u0, u1, v0, v0 + fh * 0.58, 0.0, 0.10, glassCol);
      emitBox(u0, u0 + bayW * 0.18, v0, v0 + fh * 0.65, 0.10, 0.32, wallSec);
      emitBox(u0, u1, v0 + fh * 0.58, v0 + fh * 0.76, 0.10, 0.46, accCol);
      emitBox(u0 - 0.04, u1 + 0.04, v0 + fh * 0.76, v1, 0.10, 0.74, wallSec);
      break;
    }

    case 'T_MINISTRY_EAVE': {
      emitBox(u0, u1, v0, v0 + fh * 0.55, 0.0, 0.12, wallMain);
      emitBox(u0 + bayW * 0.22, u1 - bayW * 0.22, v0 + fh * 0.12, v0 + fh * 0.52, 0.12, 0.15, glassCol);
      emitBox(u0, u1, v0 + fh * 0.55, v0 + fh * 0.76, 0.12, 0.42, accCol);
      emitBox(u0, u1, v0 + fh * 0.76, v1, 0.12, 0.68, wallSec);
      break;
    }

    case 'T_IMPERIAL_DOUGONG': {
      // Imperial Hexi painted architrave beam + Dougong bracket overhang
      emitBox(u0, u1, v0, v0 + fh * 0.48, 0.0, 0.12, wallMain);
      emitBox(u0, u1, v0 + fh * 0.48, v0 + fh * 0.74, 0.12, 0.48, wallSec);
      emitBox(u0 - 0.04, u1 + 0.04, v0 + fh * 0.74, v1, 0.12, 0.84, accCol);
      break;
    }

    case 'T_HUTONG_EAVE': {
      emitBox(u0, u1, v0, v0 + fh * 0.65, 0.0, 0.08, wallMain);
      emitBox(u0, u1, v0 + fh * 0.65, v1, 0.08, 0.38, wallSec);
      break;
    }

    case 'T_BALCONY_CAP': {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      const bL = u0 + bayW * 0.08;
      const bR = u1 - bayW * 0.08;
      emitBox(bL, bR, v0 + fh * 0.04, v0 + fh * 0.76, 0.06, 0.56, frameCol);
      emitBox(bL + bayW * 0.05, bR - bayW * 0.05, v0 + fh * 0.34, v0 + fh * 0.72, 0.56, 0.59, glassCol);
      emitBox(u0, u1, v0 + fh * 0.76, v1, 0.06, 0.68, wallSec);
      break;
    }

    case 'T_STAIR_BULKHEAD': {
      emitBox(u0, u1, v0, v1 + 0.45, 0.0, 0.22, wallSec);
      emitBox(u0 + bayW * 0.28, u1 - bayW * 0.28, v0 + fh * 0.18, v0 + fh * 0.65, 0.22, 0.26, glassCol);
      emitBox(u0 - 0.05, u1 + 0.05, v1 + 0.25, v1 + 0.55, 0.0, 0.42, wallMain);
      break;
    }

    case 'T_BAY_CAP':
    case 'T_LOUVER_CAP':
    case 'T_CORNER_CROWN':
    case 'T_PARAPET_CORNICE': {
      emitBox(u0, u1, v0, v0 + fh * 0.72, 0.0, 0.10, wallMain);
      if (tileId !== 'T_CORNER_CROWN') {
        emitBox(u0 + bayW * 0.20, u1 - bayW * 0.20, v0 + fh * 0.16, v0 + fh * 0.64, 0.10, 0.14, glassCol);
      }
      emitBox(u0, u1, v0 + fh * 0.72, v1, 0.0, 0.36, wallSec);
      break;
    }

    case 'M_WALL_STD':
    default: {
      emitBox(u0, u1, v0, v1, 0.0, 0.06, wallMain);
      const wL = u0 + bayW * 0.18;
      const wR = u1 - bayW * 0.18;
      emitBox(wL - 0.05, wR + 0.05, v0 + fh * 0.16, v0 + fh * 0.22, 0.06, 0.20, wallSec);
      emitBox(wL, wR, v0 + fh * 0.22, v0 + fh * 0.80, 0.06, 0.11, frameCol);
      emitBox(wL + 0.06, wR - 0.06, v0 + fh * 0.25, v0 + fh * 0.77, 0.11, 0.13, glassCol);
      break;
    }
  }
}

function wallPrimaryMix(c1, c2) {
  return [(c1[0] + c2[0]) * 0.5, (c1[1] + c2[1]) * 0.5, (c1[2] + c2[2]) * 0.5];
}

/**
 * Emits horizontal roof deck cap for a tier + perimeter parapet or pitched traditional roof + rooftop WFC greebles.
 */
function emitTierRoofAndGreebles(pos, norm, col, tier, isTopTier, wfcSolution, triEntity = null, entityIdx = 0) {
  const { palette, roofWfc } = wfcSolution;
  const flatOuter = tier.flatOuter;
  const flatHoles = tier.flatHoles || [];
  const roofY = tier.y1;

  const contour = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flatOuter.length; i += 2) {
    const x = flatOuter[i], z = flatOuter[i + 1];
    contour.push(new THREE.Vector2(x, z));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const holes = [];
  for (const fh of flatHoles) {
    if (fh.length >= 6) {
      const hpts = [];
      for (let i = 0; i < fh.length; i += 2) {
        hpts.push(new THREE.Vector2(fh[i], fh[i + 1]));
      }
      holes.push(hpts);
    }
  }

  // 1. Flat terrace / roof deck cap
  const allPts = [...contour];
  for (const h of holes) allPts.push(...h);
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  const deckCol = isTopTier ? palette.roofDeck : palette.wallSecondary;

  for (const [a, b, c] of tris) {
    const pa = allPts[a], pb = allPts[b], pc = allPts[c];
    pos.push(pa.x, roofY, pa.y, pc.x, roofY, pc.y, pb.x, roofY, pb.y);
    for (let i = 0; i < 3; i++) {
      norm.push(0, 1, 0);
      col.push(deckCol[0], deckCol[1], deckCol[2]);
    }
    if (triEntity) {
      triEntity.push(entityIdx);
    }
  }

  if (!isTopTier) return;

  // 2. Traditional Pitched Roofs for Imperial Palace, Ministry Big-Roof, and Siheyuan Courtyard
  if (
    (roofWfc.roofStyle === 'imperial_golden_roof' ||
      roofWfc.roofStyle === 'xieshan_big_roof' ||
      roofWfc.roofStyle === 'yingshan_grey_tile') &&
    holes.length === 0 &&
    maxX - minX < 110 &&
    maxZ - minZ < 110
  ) {
    const isImperial = roofWfc.roofStyle === 'imperial_golden_roof';
    const isMinistry = roofWfc.roofStyle === 'xieshan_big_roof';
    const eaveOverhang = isImperial ? 1.35 : isMinistry ? 1.15 : 0.55;
    const ridgeH = isImperial
      ? Math.min(5.6, Math.max(2.8, Math.min(maxX - minX, maxZ - minZ) * 0.25))
      : isMinistry
        ? Math.min(4.8, Math.max(2.6, Math.min(maxX - minX, maxZ - minZ) * 0.22))
        : 2.0;
    const insetRidge = insetPolygonFlatXZForRoof(flatOuter, Math.min(maxX - minX, maxZ - minZ) * 0.36);
    const nPts = flatOuter.length / 2;
    const tileRgb = palette.roofDeck;
    const ridgeRgb = isImperial ? palette.accent : palette.wallSecondary;

    for (let k = 0; k < nPts; k++) {
      const kNext = (k + 1) % nPts;
      const x1 = flatOuter[k * 2], z1 = flatOuter[k * 2 + 1];
      const x2 = flatOuter[kNext * 2], z2 = flatOuter[kNext * 2 + 1];
      const rx1 = insetRidge[k * 2], rz1 = insetRidge[k * 2 + 1];
      const rx2 = insetRidge[kNext * 2], rz2 = insetRidge[kNext * 2 + 1];

      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;

      const ex1 = x1 + nx * eaveOverhang;
      const ez1 = z1 + nz * eaveOverhang;
      const ex2 = x2 + nx * eaveOverhang;
      const ez2 = z2 + nz * eaveOverhang;

      const sNormY = 0.78;
      const sNormXZ = 0.62;
      pos.push(
        ex1, roofY, ez1, rx1, roofY + ridgeH, rz1, rx2, roofY + ridgeH, rz2,
        ex1, roofY, ez1, rx2, roofY + ridgeH, rz2, ex2, roofY, ez2
      );
      for (let i = 0; i < 6; i++) {
        norm.push(nx * sNormXZ, sNormY, nz * sNormXZ);
        col.push(tileRgb[0], tileRgb[1], tileRgb[2]);
      }
      if (triEntity) {
        triEntity.push(entityIdx, entityIdx);
      }

      const rMidX = (rx1 + rx2) * 0.5;
      const rMidZ = (rz1 + rz2) * 0.5;
      const rLen = Math.hypot(rx2 - rx1, rz2 - rz1);
      if (rLen > 0.8 && !triEntity) {
        pushWorldBox(pos, norm, col, rMidX, roofY + ridgeH - 0.15, rMidZ, 0.55, 0.48, 0.55, ridgeRgb);
      }
    }

    const ridgeContour = [];
    for (let i = 0; i < insetRidge.length; i += 2) {
      ridgeContour.push(new THREE.Vector2(insetRidge[i], insetRidge[i + 1]));
    }
    const rTris = THREE.ShapeUtils.triangulateShape(ridgeContour, []);
    for (const [a, b, c] of rTris) {
      const pa = ridgeContour[a], pb = ridgeContour[b], pc = ridgeContour[c];
      pos.push(
        pa.x, roofY + ridgeH, pa.y,
        pc.x, roofY + ridgeH, pc.y,
        pb.x, roofY + ridgeH, pb.y
      );
      for (let i = 0; i < 3; i++) {
        norm.push(0, 1, 0);
        col.push(Math.min(1, tileRgb[0] * 1.08), Math.min(1, tileRgb[1] * 1.08), Math.min(1, tileRgb[2] * 1.08));
      }
      if (triEntity) {
        triEntity.push(entityIdx);
      }
    }
    return;
  }

  // 3. Rooftop WFC Greebles for Flat / Crown Roofs
  for (const cell of roofWfc.cells || []) {
    const { cx, cz, size, tileId } = cell;
    if (tileId === 'R_PENTHOUSE') {
      pushWorldBox(pos, norm, col, cx, roofY, cz, size, 3.2, size * 0.85, palette.wallSecondary, triEntity, entityIdx);
      pushWorldBox(pos, norm, col, cx, roofY + 3.2, cz, size * 1.08, 0.32, size * 0.92, palette.wallPrimary, triEntity, entityIdx);
    } else if (tileId === 'R_HVAC_TOWER') {
      pushWorldBox(pos, norm, col, cx - size * 0.24, roofY, cz, size * 0.42, 2.2, size * 0.42, [0.74, 0.77, 0.80], triEntity, entityIdx);
      pushWorldBox(pos, norm, col, cx + size * 0.24, roofY, cz, size * 0.42, 2.2, size * 0.42, [0.74, 0.77, 0.80], triEntity, entityIdx);
    } else if (tileId === 'R_SOLAR_BANK') {
      pushWorldBox(pos, norm, col, cx, roofY, cz, size * 0.90, 0.55, size * 0.70, [0.14, 0.28, 0.48], triEntity, entityIdx);
    } else if (tileId === 'R_SKYLIGHT_ATRIUM') {
      pushWorldBox(pos, norm, col, cx, roofY, cz, size * 0.90, 0.85, size * 0.90, palette.glassLit, triEntity, entityIdx, true);
    }
  }
}

function insetPolygonFlatXZForRoof(flat, insetDist) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i], z = flat[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const spanW = maxX - minX || 1;
  const spanD = maxZ - minZ || 1;
  const sx = Math.max(0.25, (spanW - insetDist * 1.4) / spanW);
  const sz = Math.max(0.25, (spanD - insetDist * 1.4) / spanD);
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push(cx + (flat[i] - cx) * sx, cz + (flat[i + 1] - cz) * sz);
  }
  return out;
}

/**
 * High-speed Compact Batched WFC Building Emitter for Global 40km x 40km Chunk Streaming (`src/chunk_builder.js`).
 *
 * Combines:
 * 1. 24-Style Beijing WFC Palette + Weathering Micro-Tint (`resolveBeijingStyle24` + `applyPaletteMicroTint`)
 * 2. 1D Vertical Massing Setback WFC (`collapseVerticalMassingWFC` for non-part buildings)
 * 3. Merged Vertical Column WFC Grammar (collapses the 1D ground/shaft/crown column grammar along each wall edge,
 *    emitting merged 3D vertical balcony shafts, bay-window shafts, granite pilasters, stairwells, shopfronts,
 *    unit entrance canopies, Pailou/Dougong crowns, and flush window bays at 10x lower triangle count than per-cell boxes)
 * 4. 3D Pitched & Rooftop Greeble WFC (`emitTierRoofAndGreebles`)
 */
export const FACADE_CATALOG = [
  { id: 'glass_curtain_blue', index: 0, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: true, avgColor: [0.5008, 0.6256, 0.7369] },
  { id: 'glass_curtain_dark', index: 1, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: true, avgColor: [0.2950, 0.3286, 0.3522] },
  { id: 'glass_curtain_green', index: 2, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: true, avgColor: [0.4014, 0.5732, 0.5325] },
  { id: 'office_concrete_grid', index: 3, floors: 4, bays: 4, metersPerFloor: 3.7, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.5933, 0.5888, 0.5704] },
  { id: 'office_limestone_modern', index: 4, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.5207, 0.4926, 0.4523] },
  { id: 'office_bronze_fins', index: 5, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: true, avgColor: [0.4646, 0.4447, 0.4044] },
  { id: 'nyc_brownstone', index: 6, floors: 3, bays: 3, metersPerFloor: 3.5, metersPerBay: 3.4, isCurtainWall: false, avgColor: [0.4885, 0.3696, 0.3052] },
  { id: 'nyc_artdeco_limestone', index: 7, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: false, avgColor: [0.5620, 0.5363, 0.4909] },
  { id: 'nyc_red_brick_warehouse', index: 8, floors: 4, bays: 4, metersPerFloor: 3.7, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.4053, 0.3361, 0.3044] },
  { id: 'paris_haussmann', index: 9, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.5, isCurtainWall: false, avgColor: [0.5695, 0.5501, 0.5136] },
  { id: 'london_georgian_brick', index: 10, floors: 4, bays: 4, metersPerFloor: 3.5, metersPerBay: 3.4, isCurtainWall: false, avgColor: [0.4967, 0.4530, 0.3845] },
  { id: 'europe_stucco_pastel', index: 11, floors: 4, bays: 4, metersPerFloor: 3.5, metersPerBay: 3.5, isCurtainWall: false, avgColor: [0.6600, 0.5764, 0.4720] },
  { id: 'tokyo_midrise_tile', index: 12, floors: 4, bays: 4, metersPerFloor: 3.4, metersPerBay: 3.5, isCurtainWall: false, avgColor: [0.4362, 0.4215, 0.3941] },
  { id: 'tokyo_office_white_panel', index: 13, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.5555, 0.5837, 0.5963] },
  { id: 'asia_residential_tower', index: 14, floors: 4, bays: 4, metersPerFloor: 3.2, metersPerBay: 3.6, isCurtainWall: false, avgColor: [0.5604, 0.6011, 0.6278] },
  { id: 'china_hutong_greybrick', index: 15, floors: 2, bays: 3, metersPerFloor: 3.4, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.4727, 0.4050, 0.3881] },
  { id: 'residential_beige_slab', index: 16, floors: 4, bays: 4, metersPerFloor: 3.3, metersPerBay: 3.6, isCurtainWall: false, avgColor: [0.6638, 0.6279, 0.5764] },
  { id: 'retail_storefront_brick', index: 17, floors: 1, bays: 3, metersPerFloor: 4.2, metersPerBay: 4.2, isCurtainWall: false, avgColor: [0.4038, 0.3706, 0.3568] },
  { id: 'parking_garage_concrete', index: 18, floors: 4, bays: 3, metersPerFloor: 3.4, metersPerBay: 4.5, isCurtainWall: false, avgColor: [0.3832, 0.3756, 0.3573] },
  { id: 'china_soviet_redbrick', index: 19, floors: 3, bays: 4, metersPerFloor: 3.3, metersPerBay: 3.5, isCurtainWall: false, avgColor: [0.4108, 0.3145, 0.2615] },
  { id: 'residential_white_modern', index: 20, floors: 4, bays: 3, metersPerFloor: 3.3, metersPerBay: 4.0, isCurtainWall: false, avgColor: [0.5270, 0.5376, 0.5394] },
  { id: 'us_suburban_siding', index: 21, floors: 2, bays: 3, metersPerFloor: 3.2, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.6183, 0.6566, 0.6779] },
  { id: 'retail_storefront_glass', index: 22, floors: 1, bays: 3, metersPerFloor: 4.2, metersPerBay: 4.4, isCurtainWall: true, avgColor: [0.4681, 0.4975, 0.5149] },
  { id: 'industrial_metal_cladding', index: 23, floors: 2, bays: 4, metersPerFloor: 4.5, metersPerBay: 4.5, isCurtainWall: false, avgColor: [0.2679, 0.2896, 0.3041] },
  ...EXTRA_FACADES, // [roofs] procedural regional layers 24.. (features/facade_styles.js)
];

/**
 * [roofs] Facade atlas uv of a layer. Layers < 24: u = index * 1000 + u, v = v (1 = ground). Layers >= 24 keep u small
 * (float32 uv at 36000+ has ~1/256 precision, a 2-pixel jitter on 512 px tiles) and move to v = 999 + (index - 24) * 200 + v.
 */
export function facadeUvBase(index) {
  return index >= 24 ? 0.0 : index * 1000.0;
}
export function facadeV(index, v) {
  return index >= 24 ? 999.0 + (index - 24) * 200.0 + v : v;
}

/** [roofs] Regional facade pools by architectural region (features/roofs.js archRegionFor); null = original pools. */
function archFacadePool(arch, h, btype) {
  const small = h <= 11.5;
  switch (arch) {
    case 'sf': return h >= 40 ? [0, 1, 4, 7, 3] : h >= 17 ? [7, 8, 4, 20, 16, 25] : [24, 24, 24, 25, 24, 6];
    case 'la': return h >= 40 ? [0, 1, 2, 5, 4] : h >= 14 ? [25, 20, 3, 16, 4] : [25, 25, 25, 21, 21, 33];
    case 'us':
      if (h >= 40) return null;
      if (h >= 14) return [8, 3, 4, 16, 20];
      return small ? [21, 33, 21, 33, 21, 25] : [8, 6, 33, 21];
    case 'uk': return h <= 16 ? [10, 10, 10, 8] : null;
    case 'paris': return h >= 48 ? null : h >= 10 ? [9, 9, 9, 9, 4, 20] : [9, 11, 4];
    case 'med': return h >= 45 ? [0, 4, 2] : [26, 26, 26, 11, 26, 11];
    case 'nordic': return h <= 12 ? [29, 29, 29, 29, 11] : h <= 30 ? [20, 16, 11, 29] : [0, 1, 2, 20];
    case 'latam': return h >= 45 ? [20, 0, 16, 1, 27, 20] : h >= 14 ? [27, 20, 16, 27, 11] : [27, 27, 27, 25];
    case 'mideast': return h >= 60 ? [31, 0, 31, 1, 2, 31] : h >= 20 ? [28, 31, 16, 28, 20] : [28, 28, 25, 16];
    case 'japan': return h >= 55 ? null : h >= 14 ? [12, 30, 13, 20, 12] : [32, 32, 30, 12];
    case 'hk': return h >= 40 ? [14, 30, 0, 1, 14] : [30, 30, 12, 14];
    default: return null;
  }
}

export function resolveRegionTag(worldOrigin) {
  if (!worldOrigin || worldOrigin.isBeijing) return 'beijing';
  const lat = Number(worldOrigin.centerLat) || 39.9042;
  const lon = Number(worldOrigin.centerLon) || 116.4074;
  if (lat >= 39.4 && lat <= 40.5 && lon >= 115.8 && lon <= 117.0) return 'beijing';
  if (lat >= 40.4 && lat <= 41.1 && lon >= -74.4 && lon <= -73.6) return 'nyc';
  if (lat >= 48.6 && lat <= 49.1 && lon >= 2.0 && lon <= 2.7) return 'paris';
  if (lat >= 51.2 && lat <= 51.8 && lon >= -0.6 && lon <= 0.4) return 'london';
  if (lat >= 35.3 && lat <= 35.9 && lon >= 139.3 && lon <= 140.1) return 'tokyo';
  if (lat >= 35.0 && lat <= 65.0 && lon >= -11.0 && lon <= 35.0) return 'europe';
  if (lat >= 1.0 && lat <= 48.0 && lon >= 95.0 && lon <= 146.0) return 'asia';
  if (lat >= 24.0 && lat <= 50.0 && lon >= -126.0 && lon <= -66.0) return 'us';
  return 'global';
}

const OSM_NAMED_COLOURS = {
  white: [0.95, 0.95, 0.94],
  offwhite: [0.92, 0.91, 0.88],
  ivory: [0.94, 0.92, 0.86],
  cream: [0.93, 0.89, 0.80],
  beige: [0.85, 0.79, 0.69],
  tan: [0.78, 0.67, 0.54],
  sand: [0.82, 0.74, 0.62],
  sandstone: [0.79, 0.68, 0.55],
  limestone: [0.84, 0.81, 0.75],
  buff: [0.83, 0.74, 0.58],
  ochre: [0.78, 0.58, 0.32],
  yellow: [0.88, 0.78, 0.45],
  lightyellow: [0.93, 0.88, 0.68],
  gold: [0.82, 0.68, 0.38],
  amber: [0.80, 0.58, 0.28],
  orange: [0.82, 0.52, 0.32],
  terracotta: [0.74, 0.42, 0.31],
  brick: [0.64, 0.34, 0.27],
  red: [0.68, 0.32, 0.28],
  darkred: [0.50, 0.22, 0.20],
  maroon: [0.46, 0.20, 0.20],
  burgundy: [0.48, 0.20, 0.24],
  pink: [0.86, 0.66, 0.66],
  rose: [0.80, 0.56, 0.56],
  salmon: [0.84, 0.58, 0.50],
  brown: [0.55, 0.40, 0.31],
  lightbrown: [0.68, 0.53, 0.41],
  darkbrown: [0.38, 0.27, 0.21],
  bronze: [0.52, 0.43, 0.33],
  copper: [0.66, 0.44, 0.34],
  grey: [0.62, 0.63, 0.64],
  gray: [0.62, 0.63, 0.64],
  lightgrey: [0.78, 0.79, 0.80],
  lightgray: [0.78, 0.79, 0.80],
  darkgrey: [0.42, 0.44, 0.46],
  darkgray: [0.42, 0.44, 0.46],
  charcoal: [0.28, 0.30, 0.32],
  slate: [0.44, 0.48, 0.53],
  silver: [0.76, 0.78, 0.80],
  steel: [0.58, 0.63, 0.68],
  black: [0.22, 0.23, 0.25],
  glass: [0.48, 0.64, 0.76],
  blue: [0.42, 0.58, 0.76],
  lightblue: [0.62, 0.76, 0.88],
  darkblue: [0.26, 0.38, 0.56],
  navy: [0.24, 0.34, 0.52],
  teal: [0.34, 0.58, 0.60],
  cyan: [0.46, 0.72, 0.78],
  green: [0.42, 0.58, 0.45],
  lightgreen: [0.62, 0.76, 0.62],
  darkgreen: [0.28, 0.42, 0.32],
  olive: [0.52, 0.54, 0.36],
  purple: [0.52, 0.42, 0.60],
  violet: [0.58, 0.48, 0.68],
};

export function parseOsmBuildingColour(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const first = raw.split(/[;,/]/)[0].trim().toLowerCase();
  if (!first) return null;
  const hex6 = first.match(/^#?([0-9a-f]{6})$/i);
  if (hex6) {
    const h = hex6[1];
    return [
      parseInt(h.slice(0, 2), 16) / 255.0,
      parseInt(h.slice(2, 4), 16) / 255.0,
      parseInt(h.slice(4, 6), 16) / 255.0,
    ];
  }
  const hex3 = first.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const h = hex3[1];
    return [
      parseInt(h[0] + h[0], 16) / 255.0,
      parseInt(h[1] + h[1], 16) / 255.0,
      parseInt(h[2] + h[2], 16) / 255.0,
    ];
  }
  const cleanKey = first.replace(/[-_\s]+/g, '');
  if (OSM_NAMED_COLOURS[cleanKey]) return OSM_NAMED_COLOURS[cleanKey];
  for (const [k, rgb] of Object.entries(OSM_NAMED_COLOURS)) {
    if (cleanKey.includes(k)) return rgb;
  }
  return null;
}

const TECH_CAMPUS_RE = /\b(google|alphabet|youtube|apple|nvidia|meta|facebook|microsoft|amazon|openai|anthropic|salesforce)\b/i;
const CIVIC_GOV_RE = /\b(city hall|capitol|courthouse|parliament|ministry|embassy|federal|municipal|supreme court)\b/i;

export function selectFacadeForBuilding(bldgInfo, seed, region = 'beijing') {
  const h = Number(bldgInfo.height) || 18;
  const btype = String(bldgInfo.btype || '').toLowerCase();
  const name = String(bldgInfo.name || '').toLowerCase();
  const rawStyle = String(bldgInfo.style || '').toLowerCase();

  const famousInfo = classifyFamousBuilding(bldgInfo.name || '', btype, h, 24);
  const techMatch = name.match(TECH_CAMPUS_RE);
  const isTechCampus = Boolean(techMatch) || Boolean(famousInfo && famousInfo.archFeatures.skyGardenAtrium);
  const techBrand = techMatch ? techMatch[1].toLowerCase() : (famousInfo ? famousInfo.brandName.toLowerCase() : null);
  const isCivicBuilding =
    !isTechCampus &&
    (Boolean(famousInfo && famousInfo.archFeatures.colonnadePortico) ||
      btype === 'government' || btype === 'civic' || btype === 'public' || CIVIC_GOV_RE.test(name));

  let pool;
  const archPool = !famousInfo && !isTechCampus && !isCivicBuilding && bldgInfo.arch && !(btype === 'parking' || btype === 'garages' || btype === 'industrial' || btype === 'warehouse' || (btype === 'retail' && h <= 10.5))
    ? archFacadePool(bldgInfo.arch, h, btype) : null; // [roofs]
  if (famousInfo && famousInfo.facadeLayers && famousInfo.facadeLayers.length > 0) {
    pool = famousInfo.facadeLayers;
  } else if (isTechCampus) {
    pool = (techBrand === 'apple' || techBrand === 'nvidia') ? [1, 13, 0, 2] : [0, 2, 1, 13];
  } else if (isCivicBuilding) {
    pool = [7, 4, 9];
  } else if (archPool) {
    pool = archPool;
  } else if (btype === 'parking' || btype === 'garages') {
    pool = [18, 18, 23];
  } else if (btype === 'industrial' || btype === 'warehouse' || btype === 'manufacture') {
    pool = region === 'nyc' || region === 'london' ? [8, 23, 8, 18] : [23, 23, 18, 8];
  } else if (btype === 'retail' && h <= 10.5) {
    pool = [17, 22];
  } else if (region === 'paris') {
    if (h >= 48) {
      pool = [0, 1, 2, 4, 5];
    } else if (h >= 12) {
      pool = [9, 9, 9, 4, 11, 20];
    } else {
      pool = [11, 9, 4];
    }
  } else if (region === 'london') {
    if (h >= 48) {
      pool = [0, 1, 2, 5, 4];
    } else if (h >= 16) {
      pool = [10, 10, 8, 4, 3, 20, 5];
    } else {
      pool = [10, 10, 8, 11];
    }
  } else if (region === 'nyc' || region === 'us') {
    if (h >= 65) {
      pool = [0, 1, 2, 7, 5, 7, 0];
    } else if (h >= 24) {
      pool = [7, 8, 3, 4, 5, 0, 20, 16];
    } else if (h <= 10.5 && (region === 'us' || btype === 'house' || btype === 'detached' || btype === 'residential')) {
      pool = [21, 6, 8, 21];
    } else {
      pool = [6, 6, 8, 7, 10, 21];
    }
  } else if (region === 'tokyo') {
    if (h >= 55) {
      pool = [0, 1, 2, 13, 5, 14];
    } else if (h >= 18) {
      pool = [12, 13, 14, 20, 3, 16, 12];
    } else {
      pool = [12, 12, 13, 20, 16];
    }
  } else if (region === 'beijing' || region === 'asia') {
    if (
      rawStyle.includes('hutong') ||
      rawStyle.includes('palace') ||
      btype === 'temple' ||
      btype === 'historic' ||
      name.includes('宫') ||
      name.includes('庙') ||
      name.includes('寺') ||
      (region === 'beijing' && h <= 10.0)
    ) {
      pool = [15, 15, 19];
    } else if (h >= 65) {
      pool = [0, 1, 2, 5, 13, 4];
    } else if (h <= 25 && (btype.includes('apartments') || btype.includes('residential') || rawStyle !== 'glass')) {
      pool = [19, 19, 16, 20, 12, 14];
    } else if (btype.includes('apartments') || btype.includes('residential')) {
      pool = [14, 14, 16, 20, 19];
    } else if (h >= 24) {
      pool = [13, 3, 4, 5, 0, 14, 20, 16];
    } else {
      pool = [19, 12, 16, 15, 20];
    }
  } else if (region === 'europe') {
    if (h >= 45) {
      pool = [0, 1, 2, 4, 5];
    } else {
      pool = [11, 9, 10, 20, 4, 16];
    }
  } else {
    if (h >= 55) {
      pool = [0, 1, 2, 5, 7, 4];
    } else if (h >= 20) {
      pool = [3, 4, 20, 16, 13, 8, 7];
    } else if (h <= 10.5) {
      pool = [21, 6, 11, 19, 12];
    } else {
      pool = [6, 8, 11, 20, 16, 12];
    }
  }

  const pickIdx = pool[((seed >>> 3) ^ (seed >>> 11)) % pool.length];
  const spec = FACADE_CATALOG[pickIdx] || FACADE_CATALOG[0];

  // Subtle neutral wall tint so AI facade texture colors stay true while neighboring buildings vary slightly
  const shift = (((seed >>> 5) & 0xff) / 255.0 - 0.5) * 0.08;
  const warmShift = (((seed >>> 13) & 0xff) / 255.0 - 0.5) * 0.04;
  const wallTint = [
    Math.max(0.88, Math.min(1.06, 0.97 + shift + warmShift)),
    Math.max(0.88, Math.min(1.06, 0.97 + shift)),
    Math.max(0.88, Math.min(1.06, 0.97 + shift - warmShift)),
  ];

  // [roofs] paintable regional layers: the wall tint is the house paint (trim keeps its own colour, see the shader)
  const palette = PAINT_PALETTES[spec.id];
  if (palette && !bldgInfo.colour) {
    const pc = palette[((seed >>> 9) ^ (seed >>> 17)) % palette.length];
    wallTint[0] = pc[0] * (wallTint[0] / 0.97); wallTint[1] = pc[1] * (wallTint[1] / 0.97); wallTint[2] = pc[2] * (wallTint[2] / 0.97);
  }

  const avg = spec.avgColor;
  const clampC = (v) => Math.max(0.14, Math.min(0.92, v));
  const wallSecondary = [
    clampC(avg[0] * 0.88 + shift),
    clampC(avg[1] * 0.88 + shift),
    clampC(avg[2] * 0.88 + shift),
  ];
  const roofDeck = [
    clampC(avg[0] * 0.52),
    clampC(avg[1] * 0.52),
    clampC(avg[2] * 0.54),
  ];

  // Blend 45% toward real OpenStreetMap building colour (`building.tags.colour`) when present
  const osmRgb = parseOsmBuildingColour(bldgInfo.colour);
  if (osmRgb) {
    const [cr, cg, cb] = osmRgb;
    wallTint[0] = Math.max(0.32, Math.min(1.06, wallTint[0] * 0.55 + (cr * 0.78 + 0.24) * 0.45));
    wallTint[1] = Math.max(0.32, Math.min(1.06, wallTint[1] * 0.55 + (cg * 0.78 + 0.24) * 0.45));
    wallTint[2] = Math.max(0.32, Math.min(1.06, wallTint[2] * 0.55 + (cb * 0.78 + 0.24) * 0.45));
    wallSecondary[0] = clampC(wallSecondary[0] * 0.55 + cr * 0.45);
    wallSecondary[1] = clampC(wallSecondary[1] * 0.55 + cg * 0.45);
    wallSecondary[2] = clampC(wallSecondary[2] * 0.55 + cb * 0.45);
    roofDeck[0] = clampC(roofDeck[0] * 0.70 + cr * 0.75 * 0.30);
    roofDeck[1] = clampC(roofDeck[1] * 0.70 + cg * 0.75 * 0.30);
    roofDeck[2] = clampC(roofDeck[2] * 0.70 + cb * 0.75 * 0.30);
  }

  let parapetAccent = null;
  if (famousInfo) {
    if (famousInfo.secondaryAccentRgb && (seed & 1)) {
      parapetAccent = famousInfo.secondaryAccentRgb;
    } else {
      parapetAccent = famousInfo.accentRgb;
    }
    if (!osmRgb && famousInfo.primaryRgb) {
      const [pr, pg, pb] = famousInfo.primaryRgb;
      wallTint[0] = Math.max(0.84, Math.min(1.06, pr));
      wallTint[1] = Math.max(0.84, Math.min(1.06, pg));
      wallTint[2] = Math.max(0.84, Math.min(1.06, pb));
    }
  } else if (isTechCampus) {
    if (techBrand === 'google' || techBrand === 'alphabet' || techBrand === 'youtube') {
      parapetAccent = (seed & 1) ? [0.26, 0.52, 0.96] : [0.20, 0.66, 0.33]; // #4285f4 / #34a853
    } else if (techBrand === 'nvidia') {
      parapetAccent = [0.46, 0.73, 0.00]; // #76b900
    } else if (techBrand === 'meta' || techBrand === 'facebook') {
      parapetAccent = [0.02, 0.41, 0.88]; // #0668E1
    } else if (techBrand === 'apple') {
      parapetAccent = [0.88, 0.90, 0.93]; // sleek silver-white
      wallSecondary[0] = 0.82; wallSecondary[1] = 0.84; wallSecondary[2] = 0.86;
    } else {
      parapetAccent = [0.18, 0.62, 0.88];
    }
  } else if (isCivicBuilding && !osmRgb) {
    wallTint[0] = 1.02; wallTint[1] = 1.00; wallTint[2] = 0.95;
    wallSecondary[0] = 0.80; wallSecondary[1] = 0.77; wallSecondary[2] = 0.71;
  }

  return {
    spec,
    texIdx: spec.index,
    wallTint,
    wallSecondary,
    roofDeck,
    osmColour: bldgInfo.colour || null,
    isTechCampus,
    techBrand,
    parapetAccent,
    isCivicBuilding,
    famousInfo,
  };
}

export const DOOR_CATALOG = [
  { id: 'door_office_lobby_glass', index: 0, width: 4.2, height: 4.0, hasCanopy: true, hasStoop: false, canopyDepth: 0.78, avgColor: [0.4212, 0.4189, 0.3874] },
  { id: 'door_hotel_canopy', index: 1, width: 4.2, height: 4.0, hasCanopy: true, hasStoop: false, canopyDepth: 0.88, avgColor: [0.3030, 0.2525, 0.2028] },
  { id: 'door_apartment_modern', index: 2, width: 3.1, height: 3.2, hasCanopy: true, hasStoop: false, canopyDepth: 0.48, avgColor: [0.5016, 0.5250, 0.5286] },
  { id: 'door_nyc_brownstone_stoop', index: 3, width: 2.9, height: 3.1, hasCanopy: false, hasStoop: true, canopyDepth: 0.26, avgColor: [0.3580, 0.2630, 0.2203] },
  { id: 'door_paris_porte_cochere', index: 4, width: 3.5, height: 4.0, hasCanopy: false, hasStoop: false, canopyDepth: 0.28, avgColor: [0.4722, 0.4574, 0.4088] },
  { id: 'door_london_georgian', index: 5, width: 2.8, height: 3.5, hasCanopy: false, hasStoop: false, canopyDepth: 0.28, avgColor: [0.5699, 0.5462, 0.5147] },
  { id: 'door_tokyo_apartment', index: 6, width: 3.4, height: 3.2, hasCanopy: true, hasStoop: false, canopyDepth: 0.58, avgColor: [0.4233, 0.4048, 0.3691] },
  { id: 'door_beijing_hutong_gate', index: 7, width: 3.2, height: 3.4, hasCanopy: true, hasStoop: false, canopyDepth: 0.46, avgColor: [0.4770, 0.3618, 0.3252] },
  { id: 'door_soviet_block', index: 8, width: 2.6, height: 2.9, hasCanopy: true, hasStoop: false, canopyDepth: 0.56, avgColor: [0.3767, 0.3257, 0.3006] },
  { id: 'door_shop_glass', index: 9, width: 4.0, height: 3.8, hasCanopy: true, hasStoop: false, canopyDepth: 0.42, avgColor: [0.4969, 0.4968, 0.4906] },
  { id: 'door_garage_roller', index: 10, width: 3.8, height: 3.3, hasCanopy: false, hasStoop: false, canopyDepth: 0.22, avgColor: [0.4814, 0.4937, 0.4883] },
  { id: 'door_us_suburban', index: 11, width: 2.8, height: 3.0, hasCanopy: false, hasStoop: false, canopyDepth: 0.32, avgColor: [0.5257, 0.5462, 0.5627] },
];

export function selectDoorForBuilding(bldgInfo, upperSpec, seed, region = 'beijing') {
  const btype = String(bldgInfo.btype || '').toLowerCase();
  const h = Number(bldgInfo.height) || 18;
  const fid = upperSpec ? upperSpec.id : '';

  if (fid === 'parking_garage_concrete' || fid === 'industrial_metal_cladding' || btype === 'parking' || btype === 'garages' || btype === 'industrial' || btype === 'warehouse') {
    return 10; // door_garage_roller
  }
  if (fid === 'retail_storefront_brick' || fid === 'retail_storefront_glass' || (btype === 'retail' && h <= 12.0)) {
    return 9; // door_shop_glass
  }
  if (fid === 'nyc_brownstone' || ((region === 'nyc' || region === 'us') && fid === 'nyc_red_brick_warehouse' && h <= 24.0)) {
    return 3; // door_nyc_brownstone_stoop
  }
  if (fid === 'paris_haussmann' || (region === 'paris' && h <= 42.0)) {
    return 4; // door_paris_porte_cochere
  }
  if (fid === 'london_georgian_brick' || (region === 'london' && h <= 36.0 && !upperSpec.isCurtainWall)) {
    return 5; // door_london_georgian
  }
  if (fid === 'china_hutong_greybrick' || btype === 'temple' || btype === 'historic') {
    return 7; // door_beijing_hutong_gate
  }
  if (fid === 'china_soviet_redbrick') {
    return 8; // door_soviet_block
  }
  if (fid === 'us_suburban_siding' || ((region === 'us' || region === 'global') && h <= 10.5 && (btype === 'house' || btype === 'detached' || btype === 'residential'))) {
    return 11; // door_us_suburban
  }
  if (fid === 'tokyo_midrise_tile' || fid === 'asia_residential_tower' || ((region === 'tokyo' || region === 'asia') && !upperSpec.isCurtainWall && h <= 45.0)) {
    return 6; // door_tokyo_apartment
  }
  if (fid === 'office_bronze_fins' || fid === 'nyc_artdeco_limestone' || btype === 'hotel') {
    return (seed & 1) === 0 ? 1 : 0; // door_hotel_canopy or door_office_lobby_glass
  }
  if (upperSpec.isCurtainWall || fid === 'office_concrete_grid' || fid === 'office_limestone_modern' || fid === 'tokyo_office_white_panel' || h >= 38.0) {
    return (seed % 3 === 0) ? 1 : 0; // door_office_lobby_glass or door_hotel_canopy
  }
  if (region === 'europe') {
    return (seed & 1) === 0 ? 4 : 2;
  }
  return 2; // door_apartment_modern
}

function pointToSegmentDist2D(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = 0.0;
  if (len2 > 1e-4) {
    t = Math.max(0.0, Math.min(1.0, ((px - x1) * dx + (pz - z1) * dz) / len2));
  }
  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  const vx = cx - px;
  const vz = cz - pz;
  return { d: Math.hypot(vx, vz), vx, vz };
}

function planBuildingEntrances(ccwOuter, localRoads, bldgInfo, upperSpec, retailSpec, hasRetailPodium, primaryDoorIdx, seed) {
  const nPts = ccwOuter.length / 2;
  if (nPts < 3) return new Map();

  const primarySpec = DOOR_CATALOG[primaryDoorIdx] || DOOR_CATALOG[0];
  const minEdgeLen = Math.max(2.6, primarySpec.width + 0.35);
  const edgeCandidates = [];

  for (let i = 0; i < nPts; i++) {
    const iNext = (i + 1) % nPts;
    const rx1 = ccwOuter[i * 2], rz1 = ccwOuter[i * 2 + 1];
    const rx2 = ccwOuter[iNext * 2], rz2 = ccwOuter[iNext * 2 + 1];
    const dx = rx2 - rx1, dz = rz2 - rz1;
    const len = Math.hypot(dx, dz);
    if (len < minEdgeLen) continue;

    const tx = dx / len, tz = dz / len;
    const nx = tz, nz = -tx;
    const emx = (rx1 + rx2) * 0.5;
    const emz = (rz1 + rz2) * 0.5;

    let bestRoadScore = Infinity;
    let bestRoadDist = Infinity;
    let bestDot = -1.0;

    if (localRoads && localRoads.length > 0) {
      for (let rIdx = 0; rIdx < localRoads.length; rIdx++) {
        const r = localRoads[rIdx];
        if (Math.abs(r.mx - emx) > 95.0 || Math.abs(r.mz - emz) > 95.0) continue;
        const { d, vx, vz } = pointToSegmentDist2D(emx, emz, r.x1, r.z1, r.x2, r.z2);
        if (d > 85.0) continue;
        const dot = d > 0.2 ? (vx * nx + vz * nz) / d : 1.0;
        // Edge must generally face toward the road segment
        if (dot < 0.05) continue;
        const align = Math.abs(tx * r.tx + tz * r.tz);
        const footPenalty = r.isFootway ? 9.0 : 0.0;
        const score = d - dot * 11.0 - align * 5.0 + footPenalty - Math.min(len, 22.0) * 0.18;
        if (score < bestRoadScore) {
          bestRoadScore = score;
          bestRoadDist = d;
          bestDot = dot;
        }
      }
    }

    // Fallback score when no road segment is nearby: prefer longer south/east facing facades
    const fallbackScore = 200.0 - Math.min(len, 30.0) * 0.8 - (nx * 0.3 - nz * 0.5) * 4.0;
    edgeCandidates.push({
      edgeIdx: i,
      len,
      roadScore: bestRoadScore,
      roadDist: bestRoadDist,
      dot: bestDot,
      finalScore: bestRoadScore < Infinity ? bestRoadScore : fallbackScore,
    });
  }

  if (edgeCandidates.length === 0) return new Map();
  edgeCandidates.sort((a, b) => a.finalScore - b.finalScore);

  const selectedEdges = [edgeCandidates[0]];
  // Allow corner / block-perimeter buildings to have entrances on secondary street-facing facades
  for (let k = 1; k < edgeCandidates.length && selectedEdges.length < 3; k++) {
    const cand = edgeCandidates[k];
    if (cand.len >= 11.0 && cand.roadDist < 28.0 && cand.dot > 0.42) {
      selectedEdges.push(cand);
    }
  }

  const isRowhouseStyle =
    primaryDoorIdx === 3 || // NYC brownstone stoop
    primaryDoorIdx === 5 || // London Georgian
    primaryDoorIdx === 7 || // Beijing hutong gate
    primaryDoorIdx === 11;  // US suburban porch

  const bayPitch = hasRetailPodium ? retailSpec.metersPerBay : upperSpec.metersPerBay;
  const edgeMap = new Map();

  for (let sIdx = 0; sIdx < selectedEdges.length; sIdx++) {
    const { edgeIdx, len } = selectedEdges[sIdx];
    const nBays = Math.max(1, Math.round(len / bayPitch));
    const bayW = len / nBays;
    const doors = [];

    if (isRowhouseStyle && len >= 10.5 && nBays >= 3) {
      // Brownstone / Georgian / Hutong row: place one entrance per narrow townhouse unit (~6.5-8.5m, every 2 bays)
      const stepBays = bayW >= 5.2 ? 1 : 2;
      const startBay = nBays >= 4 ? 1 : 0;
      for (let b = startBay; b < nBays; b += stepBays) {
        const uCenter = (b + 0.5) * bayW;
        if (uCenter - primarySpec.width * 0.5 >= 0.35 && uCenter + primarySpec.width * 0.5 <= len - 0.35) {
          doors.push({ uCenter, doorIdx: primaryDoorIdx });
        }
      }
      if (doors.length === 0) {
        doors.push({ uCenter: len * 0.5, doorIdx: primaryDoorIdx });
      }
    } else if (len >= 34.0 && nBays >= 7) {
      // Long urban frontage (> 34m): main entrance near center, plus extra doors every ~22-26m (5-6 bays)
      const midBay = Math.floor(nBays * 0.5);
      const stepBays = Math.max(4, Math.round(23.0 / bayW));
      for (let b = midBay % stepBays; b < nBays; b += stepBays) {
        if (b === 0 || b === nBays - 1) continue;
        const uCenter = (b + 0.5) * bayW;
        if (uCenter < 2.4 || uCenter > len - 2.4) continue;
        const isMain = b === midBay || Math.abs(b - midBay) < stepBays * 0.5;
        const dIdx = (!isMain && hasRetailPodium) ? 9 : primaryDoorIdx;
        doors.push({ uCenter, doorIdx: dIdx });
      }
      if (doors.length === 0) {
        doors.push({ uCenter: (midBay + 0.5) * bayW, doorIdx: primaryDoorIdx });
      }
    } else {
      // Standard frontage: single entrance snapped to middle bay (or slightly offset on 2-bay walls)
      const midBay = Math.floor(nBays * 0.5);
      const uCenter = nBays >= 2 ? (midBay + 0.5) * bayW : len * 0.5;
      doors.push({ uCenter, doorIdx: primaryDoorIdx });
    }

    edgeMap.set(edgeIdx, doors);
  }

  return edgeMap;
}

export function appendCompactChunkBuildingWFC(bldgInfo, pos, norm, col, triEntity, entityIdx, uv = null) {
  const {
    id,
    name,
    btype,
    isPart,
    height: rawH,
    minHeight: rawMinH,
    levels: rawLevels,
    style: rawStyle,
    flatOuter,
    flatHoles,
    wx,
    wz,
    baseY,
    topY,
    groundY,
    getEdgeGroundY = null,
    localRoads = null,
    wallOutOffset = 0.0,
    region = 'beijing',
    arch: archRegion = null, // [roofs]
  } = bldgInfo;

  if (!flatOuter || flatOuter.length < 6) return null;

  const seed =
    ((Math.round((wx || 0) * 13.7) * 73856093) ^
      (Math.round((wz || 0) * 13.7) * 19349663) ^
      ((Number(id) || 0) * 83492791)) >>>
    0;

  const styleInfo = resolveBeijingStyle24({
    id,
    name,
    btype,
    height: rawH,
    levels: rawLevels,
    style: rawStyle,
    wx,
    wz,
    seed,
  });
  const styleId = styleInfo.id;
  const arch = BEIJING_ARCHETYPES[styleInfo.archetypeId] || BEIJING_ARCHETYPES.modern_curtain_tower;
  const facadeSel = selectFacadeForBuilding(bldgInfo, seed, region);
  const upperSpec = facadeSel.spec;
  // Choose brick storefront (17) only for brick/terracotta masonry; glass storefront (22) for limestone/concrete/curtain/modern
  const isBrickMasonry =
    upperSpec.id === 'nyc_red_brick_warehouse' ||
    upperSpec.id === 'europe_terracotta_classic' ||
    upperSpec.id === 'london_georgian_brick';
  const retailSpec = FACADE_CATALOG[isBrickMasonry ? 17 : 22];

  const ccwOuter = ensureCCWFlatXZ(flatOuter);
  // [roofs] pitched / mansard roof plan (null = the flat deck + parapet below; tech campuses & civic buildings keep flat / domed roof)
  const roofPlan = (archRegion && !facadeSel.isTechCampus && !facadeSel.isCivicBuilding)
    ? planRoof({ flatOuter: ccwOuter, hasHoles: (flatHoles || []).some((h) => h.length >= 6), rawH, btype, region: archRegion, seed,
      flav: bldgInfo.flav, isPart, minH: rawMinH, osm: bldgInfo.osmRoof || null, facadeId: upperSpec.id })
    : null;
  // True sidewalk/surface ground elevation (distinct from buried foundation baseY)
  const surfY =
    Number.isFinite(groundY) && (rawMinH || 0) <= 0.5
      ? Math.max(baseY, Math.min(topY - 2.6, groundY))
      : baseY;
  const totalSpan = Math.max(3.2, topY - surfY);
  // [roofs] walls stop at the eaves; the roof takes the top of the OSM height (raised where that leaves < 1 storey)
  const yEave = roofPlan ? Math.max(surfY + Math.max(2.7, totalSpan * 0.45), topY - roofRise(roofPlan)) : topY;

  // Use clean 1-3 tier architectural setbacks for tall full buildings; 1 tier for normal buildings
  let tiers;
  if (!roofPlan && !isPart && (rawMinH || 0) <= 0.5 && totalSpan >= 38.0 && ccwOuter.length <= 24) {
    const rng = createSeededRNG(seed ^ 0x9e3779b9);
    const rawTiers = collapseVerticalMassingWFC(ccwOuter, flatHoles, totalSpan, arch, rng, false).slice(0, 3);
    tiers = rawTiers.map((t) => ({
      ...t,
      y0: surfY + t.y0,
      y1: surfY + t.y1,
    }));
  } else {
    tiers = [
      {
        tierIndex: 0,
        role: 'main_shaft',
        y0: surfY,
        y1: yEave, // [roofs] = topY without a pitched roof
        flatOuter: ccwOuter,
        flatHoles: flatHoles || [],
      },
    ];
  }

  const pushUvQuad = (u0, v0, u1, v1) => {
    if (!uv) return;
    uv.push(
      u0, v0,
      u0, v1,
      u1, v1,
      u0, v0,
      u1, v1,
      u1, v0
    );
  };

  const pushRoofUv = (vertCount) => {
    if (!uv) return;
    for (let i = 0; i < vertCount; i++) {
      uv.push(-10.0, -10.0);
    }
  };

  const pushBoxWithRoofUv = (x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, emissive = false) => {
    const before = pos.length;
    pushWallBox(pos, norm, col, x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, triEntity, entityIdx, emissive);
    const addedVerts = (pos.length - before) / 3;
    pushRoofUv(addedVerts);
  };

  // Near-LOD detail sink routing (0 triangles on distant chunks; merged into the 4 quadrant LOD meshes nearby)
  const detailSink = bldgInfo.roofDetail && bldgInfo.roofDetail.pos ? bldgInfo.roofDetail : null;
  const pushDetailWallBox = (x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, emissive = false) => {
    if (detailSink) {
      const before = detailSink.pos.length;
      pushWallBox(detailSink.pos, detailSink.norm, detailSink.col, x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, null, 0, emissive);
      const added = (detailSink.pos.length - before) / 3;
      for (let k = 0; k < added; k++) detailSink.uv.push(-10.0, -10.0);
    } else {
      pushBoxWithRoofUv(x1, y0, z1, tx, tz, nx, nz, u0, u1, v0, v1, n0, n1, rgb, emissive);
    }
  };
  const pushDetailWallQuad = (
    ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz,
    qnx, qny, qnz, rgb, u0 = -10.0, v0 = -10.0, u1 = -10.0, v1 = -10.0
  ) => {
    const tPos = detailSink ? detailSink.pos : pos;
    const tNorm = detailSink ? detailSink.norm : norm;
    const tCol = detailSink ? detailSink.col : col;
    const tUv = detailSink ? detailSink.uv : uv;
    tPos.push(
      ax, ay, az, bx, by, bz, cx, cy, cz,
      ax, ay, az, cx, cy, cz, dx, dy, dz
    );
    for (let k = 0; k < 6; k++) {
      tNorm.push(qnx, qny, qnz);
      tCol.push(rgb[0], rgb[1], rgb[2]);
    }
    if (!detailSink && triEntity) triEntity.push(entityIdx, entityIdx);
    if (tUv) {
      tUv.push(
        u0, v0, u0, v1, u1, v1,
        u0, v0, u1, v1, u1, v0
      );
    }
  };
  const pushDetailWorldBox = (cx, minY, cz, w, h, d, rgb, emissive = false) => {
    if (detailSink) {
      const before = detailSink.pos.length;
      pushWorldBox(detailSink.pos, detailSink.norm, detailSink.col, cx, minY, cz, w, h, d, rgb, null, 0, emissive);
      const added = (detailSink.pos.length - before) / 3;
      for (let k = 0; k < added; k++) detailSink.uv.push(-10.0, -10.0);
    } else {
      const before = pos.length;
      pushWorldBox(pos, norm, col, cx, minY, cz, w, h, d, rgb, triEntity, entityIdx, emissive);
      const added = (pos.length - before) / 3;
      pushRoofUv(added);
    }
  };

  const uBayShift = ((seed >>> 7) % upperSpec.bays) / upperSpec.bays;
  const primaryDoorIdx = selectDoorForBuilding(bldgInfo, upperSpec, seed, region);

  let roofDone = null; // [roofs]
  for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
    const tier = tiers[tIdx];
    const isTopTier = tIdx === tiers.length - 1;
    const tierSpan = tier.y1 - tier.y0;
    if (tierSpan < 0.4) continue;

    const parapetH = roofPlan ? (roofPlan.shape === 'mansard' ? 0.45 : 0.0) : isTopTier ? Math.min(0.85, Math.max(0.35, tierSpan * 0.04)) : 0.42; // [roofs]
    const shaftY1 = Math.max(tier.y0 + 0.2, tier.y1 - parapetH);
    const shaftSpan = shaftY1 - tier.y0;

    // Ground-floor retail storefront podium strictly on explicit retail / department-store / mall buildings
    const hasRetailPodium =
      tIdx === 0 &&
      !isPart &&
      (rawMinH || 0) <= 0.5 &&
      shaftSpan >= 12.0 &&
      (btype === 'retail' || btype === 'mall' || btype === 'supermarket' || btype === 'department_store');

    // Plan ground-level road-facing entrances for tier 0
    const entranceMap =
      tIdx === 0 && !isPart && (rawMinH || 0) <= 0.5 && shaftSpan >= 2.9
        ? planBuildingEntrances(tier.flatOuter, localRoads, bldgInfo, upperSpec, retailSpec, hasRetailPodium, primaryDoorIdx, seed)
        : null;

    // Ground floor plinth height for non-retail-podium buildings (~0.75m - 1.05m stone/concrete base)
    const basePlinthH =
      tIdx === 0 && !isPart && (rawMinH || 0) <= 0.5 && !hasRetailPodium
        ? Math.min(
            shaftSpan * 0.24,
            primaryDoorIdx === 3 ? 0.96 : primaryDoorIdx === 7 || primaryDoorIdx === 11 ? 0.65 : 0.84
          )
        : 0.0;

    const emitRing = (ringPts, isHole) => {
      const nPts = ringPts.length / 2;
      let uAccumMeters = 0.0;

      for (let i = 0; i < nPts; i++) {
        const iNext = (i + 1) % nPts;
        const rx1 = ringPts[i * 2], rz1 = ringPts[i * 2 + 1];
        const rx2 = ringPts[iNext * 2], rz2 = ringPts[iNext * 2 + 1];
        const dx = rx2 - rx1, dz = rz2 - rz1;
        const len = Math.hypot(dx, dz);
        if (len < 0.25) continue;

        const tx = dx / len, tz = dz / len;
        const nx = isHole ? -tz : tz;
        const nz = isHole ? tx : -tx;
        const x1 = rx1 + nx * wallOutOffset;
        const z1 = rz1 + nz * wallOutOffset;
        const x2 = rx2 + nx * wallOutOffset;
        const z2 = rz2 + nz * wallOutOffset;

        // Resolve local sidewalk/terrain elevation at this edge midpoint for tier 0
        let edgeSurfY = tier.y0;
        if (tIdx === 0 && !isHole && getEdgeGroundY && (rawMinH || 0) <= 0.5) {
          const emx = (rx1 + rx2) * 0.5;
          const emz = (rz1 + rz2) * 0.5;
          const sampledY = getEdgeGroundY(emx, emz);
          if (Number.isFinite(sampledY)) {
            edgeSurfY = Math.max(baseY, Math.min(shaftY1 - 2.6, sampledY));
          }
        }

        // Subtle directional sun-warmth variation per wall normal + vertical AO gradient
        const dirShade = 0.96 + 0.04 * (nx * 0.65 + nz * 0.45);
        const botShade = (tIdx === 0 ? 0.85 : 0.93) * dirShade;
        const midShade = 0.94 * dirShade;
        const topShade = 1.02 * dirShade;

        const wCol = facadeSel.wallTint;
        const rB = Math.min(1, wCol[0] * botShade);
        const gB = Math.min(1, wCol[1] * botShade);
        const bB = Math.min(1, wCol[2] * botShade);
        const rM = Math.min(1, wCol[0] * midShade);
        const gM = Math.min(1, wCol[1] * midShade);
        const bM = Math.min(1, wCol[2] * midShade);
        const rT = Math.min(1, wCol[0] * topShade);
        const gT = Math.min(1, wCol[1] * topShade);
        const bT = Math.min(1, wCol[2] * topShade);

        const pCol = facadeSel.wallSecondary;
        const plinthRgb = [
          Math.min(1, pCol[0] * dirShade * 0.84),
          Math.min(1, pCol[1] * dirShade * 0.84),
          Math.min(1, pCol[2] * dirShade * 0.85),
        ];

        // 0. Underground Foundation Skirt (from buried baseY up to sidewalk edgeSurfY on sloped terrain)
        if (tIdx === 0 && edgeSurfY > baseY + 0.04) {
          pos.push(
            x1, baseY, z1,
            x1, edgeSurfY, z1,
            x2, edgeSurfY, z2,
            x1, baseY, z1,
            x2, edgeSurfY, z2,
            x2, baseY, z2
          );
          for (let k = 0; k < 6; k++) {
            norm.push(nx, 0, nz);
            col.push(plinthRgb[0] * 0.88, plinthRgb[1] * 0.88, plinthRgb[2] * 0.88);
          }
          if (triEntity) triEntity.push(entityIdx, entityIdx);
          pushRoofUv(6);
        }

        const edgeSpan = Math.max(0.4, shaftY1 - edgeSurfY);
        const podiumH = hasRetailPodium && !isHole ? Math.min(4.45, Math.max(4.05, edgeSpan * 0.34)) : 0.0;
        const plinthH = !hasRetailPodium && !isHole && tIdx === 0 ? Math.min(basePlinthH, edgeSpan * 0.24) : 0.0;
        const upperY0 = edgeSurfY + podiumH + plinthH;
        const upperSpan = Math.max(0.2, shaftY1 - upperY0);
        const upperFloors = Math.max(1, Math.round(upperSpan / upperSpec.metersPerFloor));
        const upperV1 = upperFloors / upperSpec.floors;

        // Snap straight walls (>= 2.8m) to whole bay counts so building corners align with piers/mullions
        let uStart, uEnd;
        if (len >= 2.8) {
          const nBays = Math.max(1, Math.round(len / upperSpec.metersPerBay));
          uStart = uBayShift;
          uEnd = uBayShift + nBays / upperSpec.bays;
        } else {
          const tileW = upperSpec.bays * upperSpec.metersPerBay;
          uStart = uBayShift + uAccumMeters / tileW;
          uEnd = uBayShift + (uAccumMeters + len) / tileW;
        }

        if (hasRetailPodium && !isHole) {
          // 1a. Ground-Floor Retail Storefront Podium Quad (starts cleanly at sidewalk edgeSurfY)
          pos.push(
            x1, edgeSurfY, z1,
            x1, upperY0, z1,
            x2, upperY0, z2,
            x1, edgeSurfY, z1,
            x2, upperY0, z2,
            x2, edgeSurfY, z2
          );
          for (let k = 0; k < 6; k++) norm.push(nx, 0, nz);
          col.push(
            rB, gB, bB,
            rM, gM, bM,
            rM, gM, bM,
            rB, gB, bB,
            rM, gM, bM,
            rB, gB, bB
          );
          if (triEntity) triEntity.push(entityIdx, entityIdx);

          const retailBays = Math.max(1, Math.round(len / retailSpec.metersPerBay));
          const ru0 = retailSpec.index * 1000.0;
          const ru1 = retailSpec.index * 1000.0 + retailBays / retailSpec.bays;
          pushUvQuad(ru0, 1.0, ru1, 2.0);
        } else if (plinthH > 0.05 && !isHole) {
          // 1a-alt. Ground-Floor Stone / Concrete Plinth Base Band (0.65m - 0.96m proud masonry base)
          const pOff = 0.045;
          const bx1 = x1 + nx * pOff, bz1 = z1 + nz * pOff;
          const bx2 = x2 + nx * pOff, bz2 = z2 + nz * pOff;
          pos.push(
            bx1, edgeSurfY, bz1,
            bx1, upperY0, bz1,
            bx2, upperY0, bz2,
            bx1, edgeSurfY, bz1,
            bx2, upperY0, bz2,
            bx2, edgeSurfY, bz2
          );
          for (let k = 0; k < 6; k++) {
            norm.push(nx, 0, nz);
            col.push(plinthRgb[0], plinthRgb[1], plinthRgb[2]);
          }
          if (triEntity) triEntity.push(entityIdx, entityIdx);
          pushRoofUv(6);
        }

        // 1b. Upper Facade Shaft Quad
        const yBot = !isHole ? upperY0 : edgeSurfY;
        const cBotR = !isHole && (hasRetailPodium || plinthH > 0.05) ? rM : rB;
        const cBotG = !isHole && (hasRetailPodium || plinthH > 0.05) ? gM : gB;
        const cBotB = !isHole && (hasRetailPodium || plinthH > 0.05) ? bM : bB;

        pos.push(
          x1, yBot, z1,
          x1, shaftY1, z1,
          x2, shaftY1, z2,
          x1, yBot, z1,
          x2, shaftY1, z2,
          x2, yBot, z2
        );
        for (let k = 0; k < 6; k++) norm.push(nx, 0, nz);
        col.push(
          cBotR, cBotG, cBotB,
          rT, gT, bT,
          rT, gT, bT,
          cBotR, cBotG, cBotB,
          rT, gT, bT,
          cBotR, cBotG, cBotB
        );
        if (triEntity) triEntity.push(entityIdx, entityIdx);

        const u0 = facadeUvBase(upperSpec.index) + uStart; // [roofs]
        const u1 = facadeUvBase(upperSpec.index) + uEnd;
        pushUvQuad(u0, facadeV(upperSpec.index, 1.0), u1, facadeV(upperSpec.index, 1.0 + upperV1));
        uAccumMeters += len;

        // 1c. Street-Level Architectural Entrances (Door Quad + 3D Frame / Canopy / Stoop + Night Light)
        if (!isHole && entranceMap && entranceMap.has(i)) {
          const edgeDoors = entranceMap.get(i);
          const hostSpec = hasRetailPodium ? retailSpec : upperSpec;
          const hostAvg = hostSpec.avgColor || [0.52, 0.50, 0.48];
          const hostWallRgb = [
            Math.min(1, hostAvg[0] * rM * 1.06),
            Math.min(1, hostAvg[1] * gM * 1.06),
            Math.min(1, hostAvg[2] * bM * 1.06),
          ];
          const frameRgb = [
            Math.min(1, pCol[0] * dirShade * 0.92),
            Math.min(1, pCol[1] * dirShade * 0.92),
            Math.min(1, pCol[2] * dirShade * 0.94),
          ];
          const warmLightRgb = [1.0, 0.84, 0.48];

          const edgeBays = Math.max(1, Math.round(len / hostSpec.metersPerBay));
          const edgeBayW = len / edgeBays;
          for (let dIdx = 0; dIdx < edgeDoors.length; dIdx++) {
            const { uCenter, doorIdx } = edgeDoors[dIdx];
            const dSpec = DOOR_CATALOG[doorIdx] || DOOR_CATALOG[0];
            const targetW = Math.max(dSpec.width, Math.min(edgeBayW * 0.88, dSpec.width * 1.18));
            const dw = Math.min(targetW, len - 0.36);
            const maxDoorH = hasRetailPodium ? Math.max(2.6, podiumH - 0.16) : edgeSpan - 0.25;
            const dh = Math.min(dSpec.height, maxDoorH);
            if (dw < 1.6 || dh < 2.1) continue;

            const du0 = Math.max(0.18, uCenter - dw * 0.5);
            const du1 = Math.min(len - 0.18, uCenter + dw * 0.5);

            if (dSpec.hasStoop && edgeSpan >= 4.2) {
              // NYC Brownstone 4-step 3D sandstone stoop + side cheek balustrades + elevated parlor door
              const stoopH = Math.min(0.84, plinthH > 0.2 ? plinthH : 0.80);
              const stoopW = Math.min(len - 0.2, (du1 - du0) * 0.82);
              const su0 = uCenter - stoopW * 0.5;
              const su1 = uCenter + stoopW * 0.5;
              const stoopCol = [
                Math.min(1, dSpec.avgColor[0] * dirShade * 1.08),
                Math.min(1, dSpec.avgColor[1] * dirShade * 1.08),
                Math.min(1, dSpec.avgColor[2] * dirShade * 1.08),
              ];
              const railCol = [0.16, 0.17, 0.19];

              // 4 ascending steps from sidewalk edgeSurfY up to stoopH
              const nSteps = 4;
              for (let st = 0; st < nSteps; st++) {
                const sv0 = (st / nSteps) * stoopH;
                const sv1 = ((st + 1) / nSteps) * stoopH;
                const sn1 = 1.32 - st * 0.24;
                pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su0, su1, sv0, sv1, 0.02, sn1, stoopCol, false);
              }
              // Left & right stoop cheek walls + wrought-iron top rail
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.16, su0, 0.0, stoopH + 0.32, 0.02, 1.34, stoopCol, false);
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su1, su1 + 0.16, 0.0, stoopH + 0.32, 0.02, 1.34, stoopCol, false);
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.15, su0 - 0.02, stoopH + 0.32, stoopH + 0.58, 0.06, 1.28, railCol, false);
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su1 + 0.02, su1 + 0.15, stoopH + 0.32, stoopH + 0.58, 0.06, 1.28, railCol, false);

              // Door quad sits atop the stoop landing
              const doorY0 = edgeSurfY + stoopH - 0.04;
              const doorY1 = Math.min(shaftY1 - 0.15, doorY0 + dh);
              const dOut = 0.068;
              const dx1 = x1 + du0 * tx + nx * dOut, dz1 = z1 + du0 * tz + nz * dOut;
              const dx2 = x1 + du1 * tx + nx * dOut, dz2 = z1 + du1 * tz + nz * dOut;
              pos.push(
                dx1, doorY0, dz1,
                dx1, doorY1, dz1,
                dx2, doorY1, dz2,
                dx1, doorY0, dz1,
                dx2, doorY1, dz2,
                dx2, doorY0, dz2
              );
              for (let k = 0; k < 6; k++) {
                norm.push(nx, 0, nz);
                col.push(hostWallRgb[0], hostWallRgb[1], hostWallRgb[2]);
              }
              if (triEntity) triEntity.push(entityIdx, entityIdx);
              const doorUvBase = 24000.0 + doorIdx * 1000.0;
              pushUvQuad(doorUvBase + 0.0, 1.0, doorUvBase + 1.0, 2.0);

              // Carved brownstone cornice hood + warm fanlight lantern
              const hoodV0 = (doorY1 - edgeSurfY) - 0.22;
              const hoodV1 = (doorY1 - edgeSurfY) + 0.06;
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.08, su1 + 0.08, hoodV0, hoodV1, 0.04, 0.32, stoopCol, false);
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, uCenter - 0.22, uCenter + 0.22, hoodV0 - 0.08, hoodV0, 0.08, 0.24, warmLightRgb, true);
            } else {
              // Standard Ground-Level Entrance (flush with sidewalk + low stone threshold step)
              const doorY0 = edgeSurfY + 0.03;
              const doorY1 = Math.min(shaftY1 - 0.15, doorY0 + dh);
              const dOut = plinthH > 0.05 ? 0.068 : 0.052;
              const dx1 = x1 + du0 * tx + nx * dOut, dz1 = z1 + du0 * tz + nz * dOut;
              const dx2 = x1 + du1 * tx + nx * dOut, dz2 = z1 + du1 * tz + nz * dOut;

              pos.push(
                dx1, doorY0, dz1,
                dx1, doorY1, dz1,
                dx2, doorY1, dz2,
                dx1, doorY0, dz1,
                dx2, doorY1, dz2,
                dx2, doorY0, dz2
              );
              for (let k = 0; k < 6; k++) {
                norm.push(nx, 0, nz);
                col.push(hostWallRgb[0], hostWallRgb[1], hostWallRgb[2]);
              }
              if (triEntity) triEntity.push(entityIdx, entityIdx);
              const doorUvBase = 24000.0 + doorIdx * 1000.0;
              pushUvQuad(doorUvBase + 0.0, 1.0, doorUvBase + 1.0, 2.0);

              // Low 12cm stone threshold step at sidewalk level
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, du0 - 0.06, du1 + 0.06, 0.0, 0.12, 0.02, 0.30, plinthRgb, false);

              // 3D Left & Right Portal Pilasters + Top Canopy/Cornice Cap + Warm Over-Door Light
              const doorTopRel = doorY1 - edgeSurfY;
              const pilasterCol = [
                Math.min(1, dSpec.avgColor[0] * dirShade * 0.96),
                Math.min(1, dSpec.avgColor[1] * dirShade * 0.96),
                Math.min(1, dSpec.avgColor[2] * dirShade * 0.96),
              ];
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, Math.max(0.02, du0 - 0.11), du0 + 0.03, 0.0, doorTopRel, 0.02, 0.11, pilasterCol, false);
              pushBoxWithRoofUv(x1, edgeSurfY, z1, tx, tz, nx, nz, du1 - 0.03, Math.min(len - 0.02, du1 + 0.11), 0.0, doorTopRel, 0.02, 0.11, pilasterCol, false);

              const canDepth = dSpec.canopyDepth || 0.36;
              const canV0 = doorTopRel - 0.06;
              const canV1 = doorTopRel + 0.11;
              const canCol =
                doorIdx === 1 || doorIdx === 6 || doorIdx === 9
                  ? [0.22, 0.21, 0.20] // Dark bronze/metal canopy
                  : doorIdx === 7
                    ? [0.34, 0.35, 0.37] // Grey tile hutong gatehouse eaves
                    : pilasterCol;
              pushBoxWithRoofUv(
                x1,
                edgeSurfY,
                z1,
                tx,
                tz,
                nx,
                nz,
                Math.max(0.02, du0 - 0.14),
                Math.min(len - 0.02, du1 + 0.14),
                canV0,
                canV1,
                0.02,
                canDepth,
                canCol,
                false
              );

              // Warm downlight / entrance sconce under canopy (glows at sunset & night via vEmissive)
              const lightW = Math.min(0.75, (du1 - du0) * 0.28);
              pushBoxWithRoofUv(
                x1,
                edgeSurfY,
                z1,
                tx,
                tz,
                nx,
                nz,
                uCenter - lightW * 0.5,
                uCenter + lightW * 0.5,
                canV0 - 0.07,
                canV0,
                0.07,
                Math.min(canDepth - 0.04, 0.34),
                warmLightRgb,
                true
              );
            }
          }
        }

        // 1d. Near-LOD 3D Facade Articulation: Inter-story Cornice String Courses, Balconies & Split-AC Units
        if (!isHole && !upperSpec.isCurtainWall && totalSpan >= 9.0 && totalSpan <= 42.0 && len >= 5.2 && upperFloors >= 2) {
          const floorH = upperSpan / upperFloors;
          const ledgeCol = [
            Math.min(1, pCol[0] * dirShade * 0.96),
            Math.min(1, pCol[1] * dirShade * 0.96),
            Math.min(1, pCol[2] * dirShade * 0.97),
          ];
          // Inter-story horizontal stone string-course / cornice ledges every 2-3 floors
          const ledgeStep = upperFloors >= 6 ? 3 : 2;
          for (let fl = ledgeStep; fl < upperFloors; fl += ledgeStep) {
            const lv0 = fl * floorH - 0.09;
            const lv1 = fl * floorH + 0.08;
            pushDetailWallBox(x1, upperY0, z1, tx, tz, nx, nz, 0.0, len, lv0, lv1, 0.01, 0.13, ledgeCol, false);
          }

          // Deterministic Juliette / cantilevered balconies and external split-AC condenser boxes on select bays
          const nWallBays = Math.max(1, Math.round(len / upperSpec.metersPerBay));
          const wBayW = len / nWallBays;
          const maxDetailFloors = Math.min(upperFloors, 8);
          const isResOrApt = !hasRetailPodium && (
            btype === 'apartments' || btype === 'residential' || btype === 'hotel' || btype === 'dormitory' ||
            upperSpec.index >= 6
          );
          if (isResOrApt && wBayW >= 2.3 && nWallBays >= 2) {
            const ironCol = [0.16, 0.17, 0.19];
            const acBodyCol = [0.82, 0.81, 0.78];
            const acGrilleCol = [0.22, 0.24, 0.26];
            const edgeSeed = (seed ^ Math.imul(i + 1, 2654435761) ^ Math.imul(tIdx + 1, 1597334677)) >>> 0;
            const hasBalconies = (edgeSeed % 5) < 3;
            const hasAcUnits = ((edgeSeed >>> 4) % 4) < 2;
            const balStride = nWallBays >= 4 ? 2 : 1;
            const balOffset = (edgeSeed >>> 8) % balStride;

            for (let fl = 1; fl < maxDetailFloors; fl++) {
              const fy0 = fl * floorH;
              if (hasBalconies && (fl % 2 === 1 || upperFloors <= 4)) {
                for (let b = balOffset; b < nWallBays; b += balStride) {
                  const bh = ((edgeSeed ^ Math.imul(fl * 13 + b, 73856093)) >>> 0) % 100;
                  if (bh >= 62) continue;
                  const bu0 = (b + 0.15) * wBayW;
                  const bu1 = (b + 0.85) * wBayW;
                  if (bu1 - bu0 < 1.2) continue;
                  // Cantilevered balcony deck slab + dark balustrade railing
                  pushDetailWallBox(x1, upperY0, z1, tx, tz, nx, nz, bu0, bu1, fy0 - 0.07, fy0 + 0.08, 0.02, 0.68, ledgeCol, false);
                  pushDetailWallBox(x1, upperY0, z1, tx, tz, nx, nz, bu0 + 0.03, bu1 - 0.03, fy0 + 0.08, fy0 + 0.86, 0.58, 0.68, ironCol, false);
                }
              }
              if (hasAcUnits && wBayW >= 2.5) {
                const acBay = (fl * 3 + (edgeSeed >>> 12)) % nWallBays;
                const ah = ((edgeSeed ^ Math.imul(fl * 19 + acBay, 19349663)) >>> 0) % 100;
                if (ah < 48) {
                  const au0 = (acBay + 0.68) * wBayW;
                  const au1 = Math.min(len - 0.14, au0 + 0.74);
                  if (au1 - au0 >= 0.52) {
                    const av0 = fy0 + 0.28;
                    const av1 = av0 + 0.52;
                    pushDetailWallBox(x1, upperY0, z1, tx, tz, nx, nz, au0, au1, av0, av1, 0.02, 0.31, acBodyCol, false);
                    pushDetailWallBox(x1, upperY0, z1, tx, tz, nx, nz, au0 + 0.08, au0 + 0.44, av0 + 0.08, av1 - 0.08, 0.31, 0.34, acGrilleCol, false);
                  }
                }
              }
            }
          }
        }

        // 1e. SF Victorian / Edwardian 3-Sided Projecting Bay Windows & Front Entrance Porch Stoops (Near-LOD detailSink)
        if (
          !isHole &&
          tIdx === 0 &&
          !upperSpec.isCurtainWall &&
          !hasRetailPodium &&
          !facadeSel.isTechCampus &&
          !facadeSel.isCivicBuilding &&
          totalSpan >= 7.0 &&
          totalSpan <= 20.0 &&
          len >= 5.5 &&
          edgeSpan >= 5.5
        ) {
          const isVictorianOrRes =
            archRegion === 'sf' ||
            archRegion === 'uk' ||
            archRegion === 'us' ||
            archRegion === 'nyc' ||
            btype === 'residential' ||
            btype === 'apartments' ||
            btype === 'house' ||
            btype === 'terrace' ||
            upperSpec.index >= 6;
          if (isVictorianOrRes) {
            const edgeDoors = entranceMap && entranceMap.has(i) ? entranceMap.get(i) : null;
            const baySeed = (seed ^ Math.imul(i + 1, 3266489917)) >>> 0;
            const trimRgb = [
              Math.min(1, pCol[0] * dirShade * 1.06),
              Math.min(1, pCol[1] * dirShade * 1.06),
              Math.min(1, pCol[2] * dirShade * 1.04),
            ];
            const bayWallRgb = [rM, gM, bM];
            const stoopStoneRgb = [
              Math.min(1, (pCol[0] * 0.75 + 0.22) * dirShade),
              Math.min(1, (pCol[1] * 0.75 + 0.21) * dirShade),
              Math.min(1, (pCol[2] * 0.75 + 0.19) * dirShade),
            ];

            // Emit Front Entrance Porch Stoop (3 stepped stone stairs + low side cheek walls + cantilevered porch canopy hood)
            if (edgeDoors && edgeDoors.length > 0) {
              for (let dIdx = 0; dIdx < edgeDoors.length; dIdx++) {
                const { uCenter, doorIdx } = edgeDoors[dIdx];
                const dSpec = DOOR_CATALOG[doorIdx] || DOOR_CATALOG[0];
                if (dSpec.hasStoop) continue; // NYC brownstone already emitted 4-step stoop in 1c
                const stW = Math.min(2.1, len * 0.34);
                const su0 = Math.max(0.25, uCenter - stW * 0.5);
                const su1 = Math.min(len - 0.25, uCenter + stW * 0.5);
                if (su1 - su0 < 1.1) continue;
                const stoopH = 0.45;
                for (let st = 0; st < 3; st++) {
                  const sv0 = (st / 3) * stoopH;
                  const sv1 = ((st + 1) / 3) * stoopH;
                  const sn1 = 1.08 - st * 0.26;
                  pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su0, su1, sv0, sv1, 0.02, sn1, stoopStoneRgb, false);
                }
                // Low side cheek walls flanking the stoop steps
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.16, su0, 0.0, stoopH + 0.24, 0.02, 1.12, stoopStoneRgb, false);
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su1, su1 + 0.16, 0.0, stoopH + 0.24, 0.02, 1.12, stoopStoneRgb, false);
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.19, su0 + 0.02, stoopH + 0.24, stoopH + 0.31, 0.02, 1.16, trimRgb, false);
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su1 - 0.02, su1 + 0.19, stoopH + 0.24, stoopH + 0.31, 0.02, 1.16, trimRgb, false);
                // Cantilevered porch canopy hood + decorative side corbel brackets above entrance door
                const hoodY0 = Math.min(edgeSpan - 0.45, Math.max(2.65, dSpec.height - 0.05));
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.18, su1 + 0.18, hoodY0, hoodY0 + 0.18, 0.02, 0.92, trimRgb, false);
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su0 - 0.12, su0 + 0.06, hoodY0 - 0.32, hoodY0, 0.02, 0.68, stoopStoneRgb, false);
                pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, su1 - 0.06, su1 + 0.12, hoodY0 - 0.32, hoodY0, 0.02, 0.68, stoopStoneRgb, false);
              }
            }

            // Emit 3-Sided Projecting Bay Windows (central front quad + two 45-deg side quads + cornice cap)
            const wantBay = archRegion === 'sf' ? (baySeed % 5) < 4 : (baySeed % 3) !== 0;
            if (wantBay && (edgeDoors || (baySeed % 2) === 0)) {
              const nBayStacks = len >= 13.5 ? 2 : 1;
              const segSpan = len / nBayStacks;
              const bayW = Math.min(2.65, Math.max(2.05, segSpan * 0.38));
              const bayDepth = 0.65;
              const chamfer = Math.min(0.54, bayW * 0.25);
              const invSqrt2 = 0.70710678;
              const lnx = (nx - tx) * invSqrt2, lnz = (nz - tz) * invSqrt2;
              const rnx = (nx + tx) * invSqrt2, rnz = (nz + tz) * invSqrt2;
              const bayU0 = facadeUvBase(upperSpec.index);
              const bayU1 = facadeUvBase(upperSpec.index) + 1.0 / upperSpec.bays;

              for (let bIdx = 0; bIdx < nBayStacks; bIdx++) {
                let uMid = (bIdx + 0.5) * segSpan;
                // If an entrance door sits near uMid, shift the bay window beside the door or start it on the second floor
                let overDoor = false;
                if (edgeDoors) {
                  for (let dIdx = 0; dIdx < edgeDoors.length; dIdx++) {
                    const dc = edgeDoors[dIdx].uCenter;
                    if (Math.abs(uMid - dc) < bayW * 0.78) {
                      const shiftSide = dc < len * 0.5 ? 1.0 : -1.0;
                      const candMid = dc + shiftSide * (bayW * 0.85 + 0.85);
                      if (candMid - bayW * 0.5 >= 0.45 && candMid + bayW * 0.5 <= len - 0.45) {
                        uMid = candMid;
                      } else {
                        overDoor = true;
                      }
                    }
                  }
                }
                const bu0 = uMid - bayW * 0.5;
                const bu1 = uMid + bayW * 0.5;
                if (bu0 < 0.35 || bu1 > len - 0.35) continue;

                const by0 = overDoor ? edgeSurfY + Math.min(3.5, edgeSpan * 0.42) : edgeSurfY + 0.80;
                const by1 = shaftY1 - 0.45;
                if (by1 - by0 < 2.4) continue;

                const fu0 = bu0 + chamfer;
                const fu1 = bu1 - chamfer;
                const wOff = 0.04;
                const lx0 = x1 + bu0 * tx + nx * wOff, lz0 = z1 + bu0 * tz + nz * wOff;
                const rx0 = x1 + bu1 * tx + nx * wOff, rz0 = z1 + bu1 * tz + nz * wOff;
                const flx = x1 + fu0 * tx + nx * bayDepth, flz = z1 + fu0 * tz + nz * bayDepth;
                const frx = x1 + fu1 * tx + nx * bayDepth, frz = z1 + fu1 * tz + nz * bayDepth;

                const bayFloors = Math.max(1.0, Math.round((by1 - by0) / upperSpec.floorHeight));
                const bayV0 = facadeV(upperSpec.index, 1.0);
                const bayV1 = facadeV(upperSpec.index, 1.0 + bayFloors / upperSpec.floors);

                // Left 45-degree angled window quad
                pushDetailWallQuad(
                  lx0, by0, lz0, lx0, by1, lz0, flx, by1, flz, flx, by0, flz,
                  lnx, 0, lnz, bayWallRgb, bayU0, bayV0, bayU1, bayV1
                );
                // Central projecting front window quad
                pushDetailWallQuad(
                  flx, by0, flz, flx, by1, flz, frx, by1, frz, frx, by0, frz,
                  nx, 0, nz, bayWallRgb, bayU0, bayV0, bayU1, bayV1
                );
                // Right 45-degree angled window quad
                pushDetailWallQuad(
                  frx, by0, frz, frx, by1, frz, rx0, by1, rz0, rx0, by0, rz0,
                  rnx, 0, rnz, bayWallRgb, bayU0, bayV0, bayU1, bayV1
                );
                // Molded bottom apron base + decorative top cornice crown cap
                pushDetailWallBox(x1, by0, z1, tx, tz, nx, nz, bu0 - 0.04, bu1 + 0.04, -0.22, 0.04, 0.02, bayDepth + 0.05, trimRgb, false);
                pushDetailWallBox(x1, by1, z1, tx, tz, nx, nz, bu0 - 0.08, bu1 + 0.08, -0.04, 0.22, 0.02, bayDepth + 0.14, trimRgb, false);
              }
            }
          }
        }

        // 2. Architectural Parapet / Cornice Band at top of tier (solid stone/metal, uv = -10)
        if (parapetH <= 0.0) continue; // [roofs] pitched roof: the eaves cover the wall top
        const pr = Math.min(1, pCol[0] * dirShade * 1.03);
        const pg = Math.min(1, pCol[1] * dirShade * 1.03);
        const pb = Math.min(1, pCol[2] * dirShade * 1.03);
        const cOff = isHole ? 0.0 : 0.14;
        const px1 = x1 + nx * cOff, pz1 = z1 + nz * cOff;
        const px2 = x2 + nx * cOff, pz2 = z2 + nz * cOff;

        pos.push(
          px1, shaftY1, pz1,
          px1, tier.y1, pz1,
          px2, tier.y1, pz2,
          px1, shaftY1, pz1,
          px2, tier.y1, pz2,
          px2, shaftY1, pz2
        );
        for (let k = 0; k < 6; k++) {
          norm.push(nx, 0, nz);
          col.push(pr, pg, pb);
        }
        if (triEntity) {
          triEntity.push(entityIdx, entityIdx);
        }
        pushRoofUv(6);

        // Near-LOD perimeter parapet coping stone cap on flat roofs (or brand-colored accent trim on Tech Campuses)
        if (!isHole && isTopTier && (totalSpan >= 12.0 || facadeSel.parapetAccent) && len >= 3.0) {
          const acc = facadeSel.parapetAccent;
          const capCol = acc
            ? [Math.min(1, acc[0] * dirShade), Math.min(1, acc[1] * dirShade), Math.min(1, acc[2] * dirShade)]
            : [Math.min(1, pr * 1.08), Math.min(1, pg * 1.08), Math.min(1, pb * 1.08)];
          pushDetailWallBox(x1, tier.y1, z1, tx, tz, nx, nz, 0.0, len, -0.05, 0.14, -0.22, cOff + 0.10, capCol, false);
        }

        // Neoclassical Front Portico Entrance Colonnade & Triangular Pediment on Government / Civic buildings
        if (!isHole && tIdx === 0 && facadeSel.isCivicBuilding && entranceMap && entranceMap.has(i) && len >= 12.0 && edgeSpan >= 6.0) {
          const portW = Math.min(14.0, Math.max(7.2, len * 0.42));
          const pu0 = (len - portW) * 0.5;
          const pu1 = pu0 + portW;
          const portD = 1.65;
          const colH = Math.min(edgeSpan * 0.72, 9.5);
          const stoneCol = [Math.min(1, 0.86 * dirShade), Math.min(1, 0.83 * dirShade), Math.min(1, 0.77 * dirShade)];
          const shadowStone = [stoneCol[0] * 0.9, stoneCol[1] * 0.9, stoneCol[2] * 0.9];
          // Ceremonial stepped stylobate base
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, pu0 - 0.4, pu1 + 0.4, 0.0, 0.42, 0.02, portD + 0.45, shadowStone, false);
          // 4 to 6 neoclassical columns along the portico front
          const nCols = portW >= 10.5 ? 6 : 4;
          for (let cIdx = 0; cIdx < nCols; cIdx++) {
            const cu = pu0 + 0.35 + (cIdx / (nCols - 1)) * (portW - 0.70);
            pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, cu - 0.24, cu + 0.24, 0.42, 0.42 + colH, portD - 0.42, portD, stoneCol, false);
          }
          // Entablature frieze beam + stepped triangular pediment crown
          const entY0 = 0.42 + colH;
          const entY1 = entY0 + 0.68;
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, pu0 - 0.2, pu1 + 0.2, entY0, entY1, 0.02, portD + 0.18, stoneCol, false);
          const pedSteps = 3;
          const pedRise = Math.min(1.65, portW * 0.14);
          for (let s = 0; s < pedSteps; s++) {
            const frac0 = s / pedSteps, frac1 = (s + 1) / pedSteps;
            const inset = frac0 * (portW * 0.42);
            pushDetailWallBox(
              x1, edgeSurfY, z1, tx, tz, nx, nz,
              pu0 + inset, pu1 - inset,
              entY1 + frac0 * pedRise, entY1 + frac1 * pedRise,
              0.04, portD + 0.12, stoneCol, false
            );
          }
        }

        // Corporate / Tech / Finance / Media / Hotel HQ Double-Height Glass Atrium & Cantilevered Entrance Marquee
        const fArch = facadeSel.famousInfo ? facadeSel.famousInfo.archFeatures : null;
        if (!isHole && tIdx === 0 && fArch && fArch.glassAtriumMarquee && entranceMap && entranceMap.has(i) && len >= 10.0 && edgeSpan >= 6.5) {
          const marqW = Math.min(13.0, Math.max(6.2, len * 0.38));
          const mu0 = (len - marqW) * 0.5;
          const mu1 = mu0 + marqW;
          const marqD = 1.85;
          const atriumH = Math.min(edgeSpan * 0.65, 6.8);
          const steelCol = [0.24 * dirShade, 0.26 * dirShade, 0.29 * dirShade];
          const glassAtriumCol = [0.20, 0.34, 0.48];
          const brandAcc = facadeSel.parapetAccent || [0.22, 0.62, 0.96];
          // Double-height projecting glass lobby atrium box + twin brushed-steel portal columns
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu0 + 0.28, mu1 - 0.28, 0.15, atriumH, 0.04, 0.62, glassAtriumCol, false);
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu0, mu0 + 0.34, 0.0, atriumH, 0.02, marqD * 0.85, steelCol, false);
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu1 - 0.34, mu1, 0.0, atriumH, 0.02, marqD * 0.85, steelCol, false);
          // Cantilevered steel-and-glass marquee canopy + brand-colored fascia accent bar + warm underside LED glow
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu0 - 0.45, mu1 + 0.45, atriumH - 0.18, atriumH + 0.14, 0.02, marqD, steelCol, false);
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu0 - 0.48, mu1 + 0.48, atriumH + 0.14, atriumH + 0.34, marqD - 0.22, marqD + 0.06, brandAcc, true);
          pushDetailWallBox(x1, edgeSurfY, z1, tx, tz, nx, nz, mu0 + 0.2, mu1 - 0.2, atriumH - 0.26, atriumH - 0.18, 0.35, marqD - 0.25, [1.0, 0.88, 0.62], true);
        }
      }
    };

    emitRing(tier.flatOuter, false);
    for (const h of tier.flatHoles || []) {
      if (h.length >= 6) emitRing(ensureCCWFlatXZ(h), true);
    }

    // [roofs] pitched / mansard roof instead of the flat deck
    if (roofPlan && isTopTier) {
      if (uv) while (uv.length < (pos.length / 3) * 2) uv.push(-10.0, -10.0);
      const av = upperSpec.avgColor, wt = facadeSel.wallTint;
      const r = emitRoof({ pos, norm, col, uv }, tier.flatOuter, tier.flatHoles || [], roofPlan, tier.y1, {
        wallRgb: [Math.min(1, av[0] * wt[0] * 1.15), Math.min(1, av[1] * wt[1] * 1.15), Math.min(1, av[2] * wt[2] * 1.15)],
        detail: bldgInfo.roofDetail || null, seed, lod: 'full',
        chimneyRgb: archRegion === 'nordic' || archRegion === 'la' ? [0.82, 0.8, 0.76] : [0.5, 0.29, 0.23],
      });
      if (r) {
        roofDone = { shape: roofPlan.shape, ridgeY: r.ridgeY };
        if (triEntity) while (triEntity.length < pos.length / 9) triEntity.push(entityIdx);
        continue;
      }
    }

    // 3. Roof Deck Cap
    const contour = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < tier.flatOuter.length; i += 2) {
      const x = tier.flatOuter[i], z = tier.flatOuter[i + 1];
      contour.push(new THREE.Vector2(x, z));
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const holes = [];
    for (const fh of tier.flatHoles || []) {
      if (fh.length >= 6) {
        const hpts = [];
        for (let i = 0; i < fh.length; i += 2) {
          hpts.push(new THREE.Vector2(fh[i], fh[i + 1]));
        }
        holes.push(hpts);
      }
    }

    const allPts = [...contour];
    for (const h of holes) allPts.push(...h);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const roofY = isTopTier ? tier.y1 - 0.25 : tier.y1;
    const deckCol = isTopTier ? facadeSel.roofDeck : facadeSel.wallSecondary;

    const rCx = (minX + maxX) * 0.5;
    const rCz = (minZ + maxZ) * 0.5;
    for (const [a, b, c] of tris) {
      const pa = allPts[a], pb = allPts[b], pc = allPts[c];
      pos.push(pa.x, roofY, pa.y, pc.x, roofY, pc.y, pb.x, roofY, pb.y);
      for (let k = 0; k < 3; k++) {
        norm.push(0, 1, 0);
        col.push(deckCol[0], deckCol[1], deckCol[2]);
      }
      if (triEntity) {
        triEntity.push(entityIdx);
      }
      if (uv) {
        // rMat = 8 procedural flat-roof coordinates centered at (500, 500) in building-local meters
        uv.push(
          8500.0 + (pa.x - rCx), -20.0 - (500.0 + (pa.y - rCz)),
          8500.0 + (pc.x - rCx), -20.0 - (500.0 + (pc.y - rCz)),
          8500.0 + (pb.x - rCx), -20.0 - (500.0 + (pb.y - rCz))
        );
      }
    }

    // 4. Worker-Built 3D Rooftop Greebles (routed into near-LOD roofDetail sink)
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    if (isTopTier && holes.length === 0 && totalSpan >= 10.0 && spanX >= 9.0 && spanZ >= 9.0) {
      const inOuter = (px, pz) => {
        let inside = false;
        const r = tier.flatOuter;
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
          if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
        }
        return inside;
      };
      const isBoxSafe = (bx, bz, bw, bd, pad = 1.1) => {
        const hw = bw * 0.5 + pad, hd = bd * 0.5 + pad;
        return (
          inOuter(bx, bz) &&
          inOuter(bx - hw, bz - hd) &&
          inOuter(bx + hw, bz - hd) &&
          inOuter(bx + hw, bz + hd) &&
          inOuter(bx - hw, bz + hd)
        );
      };

      const cx = rCx;
      const cz = rCz;
      const pw = Math.min(11.5, Math.max(2.8, spanX * 0.30));
      const pd = Math.min(11.5, Math.max(2.8, spanZ * 0.30));
      const ph = Math.min(3.5, Math.max(2.1, totalSpan * 0.05));
      const secCol = facadeSel.wallSecondary;
      const capCol = [Math.min(1, secCol[0] * 1.1), Math.min(1, secCol[1] * 1.1), Math.min(1, secCol[2] * 1.1)];
      const doorCol = [0.16, 0.18, 0.21];
      const hvacCol = [0.58, 0.61, 0.64];
      const fanCol = [0.20, 0.22, 0.25];
      const ductCol = [0.68, 0.70, 0.73];

      if (isBoxSafe(cx, cz, pw, pd, 0.9)) {
        // 4a. Stairwell / Elevator Penthouse Bulkhead + Overhanging Roof Slab + Recessed Access Door
        if (totalSpan >= 20.0) {
          const beforeLen = pos.length;
          pushWorldBox(pos, norm, col, cx, roofY, cz, pw, ph, pd, secCol, triEntity, entityIdx, false);
          pushRoofUv((pos.length - beforeLen) / 3);
        } else {
          pushDetailWorldBox(cx, roofY, cz, pw, ph, pd, secCol, false);
        }
        pushDetailWorldBox(cx, roofY + ph, cz, pw + 0.28, 0.18, pd + 0.28, capCol, false);
        const doorW = Math.min(1.0, pw * 0.36);
        const doorH = Math.min(1.95, ph * 0.82);
        pushDetailWorldBox(cx, roofY + 0.05, cz + pd * 0.5 + 0.04, doorW, doorH, 0.08, doorCol, false);

        // 4b. Articulated HVAC Chiller Unit + Twin Fan Cowls + Galvanized Ductwork Run
        const hDirX = ((seed & 1) ? 1 : -1);
        const hDirZ = ((seed & 2) ? 1 : -1);
        const hw = Math.min(3.6, Math.max(1.8, spanX * 0.14));
        const hd = Math.min(2.4, Math.max(1.4, spanZ * 0.11));
        const hh = Math.min(1.65, Math.max(1.05, ph * 0.48));
        const hx = cx + hDirX * (pw * 0.5 + hw * 0.5 + 1.8);
        const hz = cz + hDirZ * Math.min(1.6, pd * 0.25);
        if (isBoxSafe(hx, hz, hw, hd, 0.8)) {
          pushDetailWorldBox(hx, roofY, hz, hw, hh, hd, hvacCol, false);
          const cowlS = Math.min(hw * 0.34, hd * 0.62);
          pushDetailWorldBox(hx - hw * 0.24, roofY + hh, hz, cowlS, 0.26, cowlS, fanCol, false);
          pushDetailWorldBox(hx + hw * 0.24, roofY + hh, hz, cowlS, 0.26, cowlS, fanCol, false);
          // Horizontal galvanized duct pipe connecting HVAC chiller to penthouse bulkhead
          const ductX = (cx + hDirX * pw * 0.5 + hx - hDirX * hw * 0.5) * 0.5;
          const ductW = Math.abs(hx - cx) - pw * 0.5 - hw * 0.5 + 0.2;
          if (ductW > 0.3) {
            pushDetailWorldBox(ductX, roofY + hh * 0.55, hz, ductW, 0.46, 0.52, ductCol, false);
          }
        }

        // 4c. Rooftop Water Tank on Steel Support Frame (mid-rise residential/industrial/masonry buildings)
        if (totalSpan >= 14.0 && totalSpan <= 48.0 && ((seed >>> 4) % 3) === 0) {
          const tw = Math.min(2.6, Math.max(1.7, Math.min(spanX, spanZ) * 0.12));
          const legH = 1.15;
          const tankH = tw * 1.18;
          const txTank = cx - hDirX * (pw * 0.5 + tw * 0.5 + 1.9);
          const tzTank = cz - hDirZ * (pd * 0.25);
          if (isBoxSafe(txTank, tzTank, tw, tw, 0.8)) {
            const isWoodTank = region !== 'beijing' && ((seed >>> 7) & 1) === 0;
            const tankCol = isWoodTank ? [0.48, 0.34, 0.22] : [0.60, 0.63, 0.66];
            const legOff = tw * 0.34;
            for (const [lx, lz] of [[-legOff, -legOff], [legOff, -legOff], [-legOff, legOff], [legOff, legOff]]) {
              pushDetailWorldBox(txTank + lx, roofY, tzTank + lz, 0.20, legH, 0.20, fanCol, false);
            }
            pushDetailWorldBox(txTank, roofY + legH - 0.14, tzTank, tw * 0.94, 0.16, tw * 0.94, fanCol, false);
            pushDetailWorldBox(txTank, roofY + legH, tzTank, tw, tankH, tw * 0.76, tankCol, false);
            pushDetailWorldBox(txTank, roofY + legH, tzTank, tw * 0.76, tankH, tw, tankCol, false);
            pushDetailWorldBox(txTank, roofY + legH + tankH, tzTank, tw * 0.62, 0.42, tw * 0.62, capCol, false);
          }
        }

        // 4d. Rooftop Solar Panel Array Banks & Tech Campus Landscaped Sky-Terrace Planters
        if (facadeSel.isTechCampus || (totalSpan >= 10.0 && totalSpan <= 36.0 && ((seed >>> 6) & 1) === 1)) {
          const pvCol = [0.09, 0.15, 0.26];
          const rackCol = [0.60, 0.62, 0.65];
          const pvW = Math.min(facadeSel.isTechCampus ? 6.4 : 4.2, spanX * 0.26);
          const pvD = 1.30;
          const baseZ = cz - hDirZ * (pd * 0.5 + 1.6);
          const nRows = facadeSel.isTechCampus ? 3 : 2;
          for (let rIdx = 0; rIdx < nRows; rIdx++) {
            const pzRow = baseZ - hDirZ * rIdx * 1.85;
            if (isBoxSafe(cx, pzRow, pvW, pvD, 0.8)) {
              pushDetailWorldBox(cx, roofY, pzRow, pvW * 0.9, 0.28, pvD * 0.75, rackCol, false);
              pushDetailWorldBox(cx, roofY + 0.28, pzRow, pvW, 0.12, pvD, pvCol, false);
            }
          }
          if (facadeSel.isTechCampus) {
            const greenCol = [0.24, 0.48, 0.22];
            const planterCol = [0.56, 0.44, 0.30];
            const gx = cx - hDirX * (pw * 0.5 + 2.6);
            const gz = cz + hDirZ * (pd * 0.3);
            const gw = Math.min(4.8, spanX * 0.20), gd = Math.min(3.6, spanZ * 0.18);
            if (isBoxSafe(gx, gz, gw, gd, 0.8)) {
              pushDetailWorldBox(gx, roofY, gz, gw, 0.32, gd, planterCol, false);
              pushDetailWorldBox(gx, roofY + 0.32, gz, gw - 0.3, 0.24, gd - 0.3, greenCol, false);
            }
          }
        }

        // 4e. Neoclassical Civic / Government Central Cupola Dome (copper-patina or gold-accented)
        if (facadeSel.isCivicBuilding && spanX >= 14.0 && spanZ >= 14.0) {
          const isGoldDome = /capitol|state|supreme|parliament/i.test(String(bldgInfo.name || '')) || ((seed >>> 5) % 4 === 0);
          const domeCol = isGoldDome ? [0.84, 0.69, 0.24] : [0.28, 0.56, 0.48]; // gold leaf vs verdigris copper patina
          const drumCol = [0.84, 0.81, 0.75];
          const drumW = Math.min(9.5, Math.max(4.4, Math.min(spanX, spanZ) * 0.26));
          const drumH = drumW * 0.48;
          const baseDomeY = roofY + ph + 0.18;
          // Octagonal neoclassical stone drum (2 crossed boxes) + 3-tier stepped cupola dome + lantern finial
          pushDetailWorldBox(cx, baseDomeY, cz, drumW, drumH, drumW * 0.76, drumCol, false);
          pushDetailWorldBox(cx, baseDomeY, cz, drumW * 0.76, drumH, drumW, drumCol, false);
          const d0Y = baseDomeY + drumH;
          const domeH = drumW * 0.58;
          pushDetailWorldBox(cx, d0Y, cz, drumW * 0.86, domeH * 0.42, drumW * 0.68, domeCol, false);
          pushDetailWorldBox(cx, d0Y, cz, drumW * 0.68, domeH * 0.42, drumW * 0.86, domeCol, false);
          pushDetailWorldBox(cx, d0Y + domeH * 0.42, cz, drumW * 0.64, domeH * 0.36, drumW * 0.52, domeCol, false);
          pushDetailWorldBox(cx, d0Y + domeH * 0.42, cz, drumW * 0.52, domeH * 0.36, drumW * 0.64, domeCol, false);
          pushDetailWorldBox(cx, d0Y + domeH * 0.78, cz, drumW * 0.38, domeH * 0.24, drumW * 0.38, domeCol, false);
          pushDetailWorldBox(cx, d0Y + domeH * 1.02, cz, drumW * 0.16, 1.35, drumW * 0.16, [0.88, 0.74, 0.28], false);
        }

        // 4f. Famous Global Company & Institution Signature Rooftop Architecture
        const fInfo = facadeSel.famousInfo;
        if (fInfo && fInfo.archFeatures) {
          const af = fInfo.archFeatures;
          const accCol = facadeSel.parapetAccent || fInfo.accentRgb || [0.22, 0.64, 0.96];
          // (i) Corporate / Tech / Finance / Auto / Media / Hotel Illuminated Rooftop Sky-Sign Monument Pylon & Atrium Skylight Spine
          if (af.skySignMonument) {
            const signW = Math.min(8.5, Math.max(3.6, pw * 0.88));
            const signH = Math.min(2.2, Math.max(1.1, totalSpan * 0.038));
            const signBaseY = roofY + ph + 0.18;
            pushDetailWorldBox(cx, signBaseY, cz, signW + 0.4, signH + 0.25, 0.48, [0.20, 0.22, 0.26], false);
            pushDetailWorldBox(cx, signBaseY + 0.12, cz, signW, signH, 0.62, accCol, true);
            if (af.skyGardenAtrium && spanX >= 14.0 && spanZ >= 14.0) {
              const skyW = Math.min(12.0, spanX * 0.42);
              const skyD = Math.min(4.2, spanZ * 0.20);
              const skyZ = cz + hDirZ * (pd * 0.5 + skyD * 0.5 + 1.4);
              if (isBoxSafe(cx, skyZ, skyW, skyD, 0.8)) {
                pushDetailWorldBox(cx, roofY, skyZ, skyW, 0.45, skyD, capCol, false);
                pushDetailWorldBox(cx, roofY + 0.45, skyZ, skyW - 0.35, 0.65, skyD * 0.68, [0.20, 0.38, 0.54], false);
                pushDetailWorldBox(cx, roofY + 1.10, skyZ, skyW - 0.9, 0.32, skyD * 0.36, [0.82, 0.92, 1.0], true);
              }
            }
          }
          // (ii) Museum & Performing Arts Central Stepped Glass Pyramid Skylight (Louvre / Great Court style)
          if (af.glassPyramid && spanX >= 13.0 && spanZ >= 13.0) {
            const pyrW = Math.min(11.0, Math.min(spanX, spanZ) * 0.34);
            const pyrH = pyrW * 0.56;
            const pBaseY = roofY + ph + 0.18;
            const glassPyrCol = [0.36, 0.64, 0.84];
            const warmGalleryGlow = [1.0, 0.86, 0.56];
            for (let st = 0; st < 4; st++) {
              const f0 = st / 4, f1 = (st + 1) / 4;
              const wStep = pyrW * (1.0 - f0 * 0.72);
              pushDetailWorldBox(cx, pBaseY + f0 * pyrH, cz, wStep, (f1 - f0) * pyrH, wStep, glassPyrCol, false);
            }
            pushDetailWorldBox(cx, pBaseY + 0.1, cz, pyrW * 0.52, pyrH * 0.45, pyrW * 0.52, warmGalleryGlow, true);
          }
          // (iii) Cathedral / Basilica Twin Gothic Spires or Temple Tiered Pagoda Eave Crown
          if (af.twinSpires && spanX >= 11.0 && spanZ >= 11.0) {
            const spireCol = [0.78, 0.74, 0.66];
            const spireCap = [0.30, 0.34, 0.38];
            const spireSpan = Math.min(9.0, spanX * 0.32);
            const sBaseY = roofY + ph + 0.18;
            const spireH = Math.min(14.0, Math.max(6.5, totalSpan * 0.48));
            for (const sSide of [-1, 1]) {
              const sx = cx + sSide * spireSpan * 0.5;
              if (isBoxSafe(sx, cz, 2.6, 2.6, 0.6)) {
                pushDetailWorldBox(sx, sBaseY, cz, 2.4, spireH * 0.45, 2.4, spireCol, false);
                pushDetailWorldBox(sx, sBaseY + spireH * 0.45, cz, 1.65, spireH * 0.32, 1.65, spireCap, false);
                pushDetailWorldBox(sx, sBaseY + spireH * 0.77, cz, 0.85, spireH * 0.23, 0.85, spireCap, false);
                pushDetailWorldBox(sx, sBaseY + spireH, cz, 0.26, 1.2, 0.26, [0.88, 0.74, 0.28], false);
              }
            }
          } else if (af.pagodaEaves && spanX >= 11.0 && spanZ >= 11.0) {
            const eaveCol = [0.76, 0.48, 0.18];
            const redWall = [0.68, 0.18, 0.16];
            const pW = Math.min(9.5, Math.min(spanX, spanZ) * 0.34);
            const pY = roofY + ph + 0.18;
            pushDetailWorldBox(cx, pY, cz, pW * 0.78, 1.6, pW * 0.78, redWall, false);
            pushDetailWorldBox(cx, pY + 1.4, cz, pW * 1.05, 0.42, pW * 1.05, eaveCol, false);
            pushDetailWorldBox(cx, pY + 1.82, cz, pW * 0.52, 1.3, pW * 0.52, redWall, false);
            pushDetailWorldBox(cx, pY + 2.95, cz, pW * 0.76, 0.38, pW * 0.76, eaveCol, false);
            pushDetailWorldBox(cx, pY + 3.33, cz, 0.42, 1.35, 0.42, [0.92, 0.76, 0.24], true);
          }
          // (iv) Stadium & Arena 4 Corner Floodlight Towers
          if (af.stadiumFloodlights && spanX >= 16.0 && spanZ >= 16.0) {
            const towerH = Math.min(11.0, Math.max(6.5, totalSpan * 0.36));
            const offX = spanX * 0.34;
            const offZ = spanZ * 0.34;
            for (const [sx, sz] of [[-offX, -offZ], [offX, -offZ], [-offX, offZ], [offX, offZ]]) {
              const fx = cx + sx, fz = cz + sz;
              if (isBoxSafe(fx, fz, 1.8, 1.8, 0.6)) {
                pushDetailWorldBox(fx, roofY, fz, 0.55, towerH, 0.55, ductCol, false);
                pushDetailWorldBox(fx, roofY + towerH, fz, 2.4, 1.25, 0.85, [1.0, 0.98, 0.88], true);
              }
            }
          }
        }

        // 4g. High-Rise Telecom Mast & Red Aviation Obstruction Warning Beacons (height >= 45m)
        if (totalSpan >= 45.0) {
          const beaconCol = [1.0, 0.18, 0.08];
          const mastH = Math.min(5.2, Math.max(2.8, totalSpan * 0.045));
          pushDetailWorldBox(cx, roofY + ph + 0.18, cz, 0.22, mastH, 0.22, ductCol, false);
          pushDetailWorldBox(cx, roofY + ph + 0.18 + mastH, cz, 0.42, 0.42, 0.42, beaconCol, true);
        }
      }
    }
  }

  if (uv) {
    const targetUvLen = (pos.length / 3) * 2;
    while (uv.length < targetUvLen) {
      uv.push(-10.0, -10.0);
    }
  }

  const topTier = tiers[tiers.length - 1];
  return {
    styleId,
    arch,
    facadeId: upperSpec.id,
    facadeIndex: upperSpec.index,
    doorId: DOOR_CATALOG[primaryDoorIdx]?.id || 'door_office_lobby_glass',
    doorIndex: primaryDoorIdx,
    topRoofFlat: topTier ? topTier.flatOuter : ccwOuter,
    topRoofHoles: topTier ? (topTier.flatHoles || []) : (flatHoles || []),
    topRoofY: roofDone ? Math.max(topTier.y1, roofDone.ridgeY) : topTier ? topTier.y1 : topY,
    roofShape: roofDone ? roofDone.shape : null, // [roofs]
    eaveY: roofDone ? topTier.y1 : null, // [roofs]
  };
}

/**
 * Builds a complete Three.js Mesh for a solved WFC building (used in `wfc_demo.html`).
 */
export function buildWFCBuildingMesh(wfcSolution, sharedMaterial = null) {
  const t0 = performance.now();
  const pos = [];
  const norm = [];
  const col = [];

  const { tiers, palette, seed } = wfcSolution;

  for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
    const tier = tiers[tIdx];
    const tierH = tier.y1 - tier.y0;
    const nFloors = Math.max(1, tier.levels);

    const floorBounds = new Float32Array(nFloors + 1);
    floorBounds[0] = 0.0;
    if (tier.hasGroundRow && nFloors >= 2) {
      const gfH = Math.min(tierH * 0.45, wfcSolution.archetype.groundFloorHeight);
      const stdH = (tierH - gfH) / (nFloors - 1);
      floorBounds[1] = gfH;
      for (let f = 2; f <= nFloors; f++) {
        floorBounds[f] = gfH + (f - 1) * stdH;
      }
    } else {
      const stdH = tierH / nFloors;
      for (let f = 1; f <= nFloors; f++) {
        floorBounds[f] = f * stdH;
      }
    }

    for (const wall of tier.wallFacades) {
      const collapsed = wall.wfc.collapsed;
      for (let by = 0; by < wall.nFloors; by++) {
        const v0 = floorBounds[by];
        const v1 = floorBounds[by + 1];
        for (let bx = 0; bx < wall.nBays; bx++) {
          const tileId = collapsed[by][bx];
          const cellSeed = ((seed ^ (tIdx * 997) ^ (wall.edgeIndex * 313) ^ (bx * 73) ^ (by * 151)) >>> 0);
          emitFacadeTile3D(pos, norm, col, tileId, wall, tier.y0, bx, by, v0, v1, palette, cellSeed);
        }
      }
    }

    emitTierRoofAndGreebles(pos, norm, col, tier, tIdx === tiers.length - 1, wfcSolution);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const mat =
    sharedMaterial ||
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.14,
    });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    vertexCount: pos.length / 3,
    triangleCount: pos.length / 9,
    meshBuildMs: performance.now() - t0,
  };
  return mesh;
}

/**
 * Builds a Legacy "Flat Box Extrusion" mesh for the exact same building footprint & height,
 * used in Demo 5 to visually compare Legacy Matchbox vs. 3D WFC side-by-side.
 */
export function buildLegacyBoxBuildingMesh(bldgInput, sharedMaterial = null) {
  const pos = [];
  const norm = [];
  const col = [];

  const flatOuter = bldgInput.flatOuter;
  const h = bldgInput.height || 24.0;
  const nPts = flatOuter.length / 2;
  const baseRgb =
    bldgInput.style === 'glass'
      ? [0.46, 0.58, 0.68]
      : bldgInput.style === 'residential'
        ? [0.72, 0.66, 0.58]
        : [0.64, 0.66, 0.68];

  for (let k = 0; k < nPts; k++) {
    const x1 = flatOuter[k * 2], z1 = flatOuter[k * 2 + 1];
    const x2 = flatOuter[((k + 1) % nPts) * 2], z2 = flatOuter[((k + 1) % nPts) * 2 + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len, nz = -dx / len;
    pushWallBox(pos, norm, col, x1, 0, z1, dx / len, dz / len, nx, nz, 0, len, 0, h, 0, 0.02, baseRgb);
  }

  const contour = [];
  for (let i = 0; i < flatOuter.length; i += 2) {
    contour.push(new THREE.Vector2(flatOuter[i], flatOuter[i + 1]));
  }
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [a, b, c] of tris) {
    const pa = contour[a], pb = contour[b], pc = contour[c];
    pos.push(pa.x, h, pa.y, pc.x, h, pc.y, pb.x, h, pb.y);
    for (let i = 0; i < 3; i++) {
      norm.push(0, 1, 0);
      col.push(baseRgb[0] * 0.85, baseRgb[1] * 0.85, baseRgb[2] * 0.85);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const mat =
    sharedMaterial ||
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.05,
    });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a 3D Step-by-Step Wave Collapse Inspection Group for Demo 1.
 */
export function buildStepByStepInspectionMesh(wfcSolution, stepIdx, inspectWallIdx = 0) {
  const group = new THREE.Group();
  const solidPos = [], solidNorm = [], solidCol = [];
  const superPos = [], superNorm = [], superCol = [];

  const tier0 = wfcSolution.tiers[0];
  const wall = tier0.wallFacades[inspectWallIdx] || tier0.wallFacades[0];
  const history = wall.wfc.history || [];
  const clampedStep = Math.max(0, Math.min(history.length - 1, stepIdx));
  const snap = history[clampedStep];

  for (let tIdx = 0; tIdx < wfcSolution.tiers.length; tIdx++) {
    const tier = wfcSolution.tiers[tIdx];
    const tH = tier.y1 - tier.y0;
    const tLvls = Math.max(1, tier.levels);
    const fH = tH / tLvls;

    for (let wIdx = 0; wIdx < tier.wallFacades.length; wIdx++) {
      const w = tier.wallFacades[wIdx];
      const isInspected = tIdx === 0 && wIdx === tier0.wallFacades.indexOf(wall);

      for (let by = 0; by < w.nFloors; by++) {
        const v0 = by * fH;
        const v1 = (by + 1) * fH;
        for (let bx = 0; bx < w.nBays; bx++) {
          if (isInspected && snap) {
            const dom = snap.domains[by][bx];
            const isFocus = snap.focusX === bx && snap.focusY === by;
            if (dom.length === 1) {
              emitFacadeTile3D(
                solidPos,
                solidNorm,
                solidCol,
                dom[0],
                w,
                tier.y0,
                bx,
                by,
                v0,
                v1,
                wfcSolution.palette,
                bx * 73 + by * 151
              );
              if (isFocus) {
                const u0 = bx * w.bayW, u1 = (bx + 1) * w.bayW;
                pushWallBox(
                  superPos,
                  superNorm,
                  superCol,
                  w.x1,
                  tier.y0,
                  w.z1,
                  w.tx,
                  w.tz,
                  w.nx,
                  w.nz,
                  u0,
                  u1,
                  v0,
                  v0 + 0.22,
                  0.0,
                  0.85,
                  [1.0, 0.82, 0.15]
                );
              }
            } else {
              const entropyRgb =
                dom.length >= 4
                  ? [0.16, 0.56, 0.86]
                  : dom.length === 3
                    ? [0.18, 0.78, 0.64]
                    : [0.96, 0.68, 0.18];
              const u0 = bx * w.bayW + 0.12;
              const u1 = (bx + 1) * w.bayW - 0.12;
              pushWallBox(
                superPos,
                superNorm,
                superCol,
                w.x1,
                tier.y0,
                w.z1,
                w.tx,
                w.tz,
                w.nx,
                w.nz,
                u0,
                u1,
                v0 + 0.10,
                v1 - 0.10,
                0.0,
                0.28,
                entropyRgb
              );
            }
          } else {
            emitFacadeTile3D(
              solidPos,
              solidNorm,
              solidCol,
              w.wfc.collapsed[by][bx],
              w,
              tier.y0,
              bx,
              by,
              v0,
              v1,
              wfcSolution.palette,
              bx * 73 + by * 151
            );
          }
        }
      }
    }
    emitTierRoofAndGreebles(solidPos, solidNorm, solidCol, tier, tIdx === wfcSolution.tiers.length - 1, wfcSolution);
  }

  if (solidPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(solidPos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(solidNorm, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(solidCol, 3));
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.14 })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (superPos.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(superPos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(superNorm, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(superCol, 3));
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86,
      })
    );
    group.add(mesh);
  }

  return { group, snap, totalSteps: history.length, wall };
}
