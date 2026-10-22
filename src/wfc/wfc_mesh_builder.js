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
const ARCHITECTURAL_PALETTES = [
  // 0: Silver-Blue Glass Curtain Wall Tower
  {
    styleBucket: 0,
    wallPrimary: [0.74, 0.78, 0.83],
    wallSecondary: [0.64, 0.68, 0.74],
    roofDeck: [0.24, 0.27, 0.30],
    accent: [0.54, 0.59, 0.65],
  },
  // 1: Warm Limestone & Travertine Commercial/Civic
  {
    styleBucket: 1,
    wallPrimary: [0.83, 0.79, 0.72],
    wallSecondary: [0.75, 0.71, 0.64],
    roofDeck: [0.31, 0.29, 0.27],
    accent: [0.68, 0.63, 0.56],
  },
  // 2: Deep Charcoal & Brushed Aluminum High-Rise
  {
    styleBucket: 2,
    wallPrimary: [0.40, 0.43, 0.48],
    wallSecondary: [0.33, 0.36, 0.40],
    roofDeck: [0.20, 0.22, 0.25],
    accent: [0.55, 0.58, 0.63],
  },
  // 3: Warm Sandstone & Terracotta Mid-Rise
  {
    styleBucket: 3,
    wallPrimary: [0.78, 0.69, 0.60],
    wallSecondary: [0.70, 0.61, 0.52],
    roofDeck: [0.29, 0.27, 0.25],
    accent: [0.84, 0.78, 0.70],
  },
  // 4: Crisp White Precast & Glass Residential
  {
    styleBucket: 4,
    wallPrimary: [0.87, 0.88, 0.90],
    wallSecondary: [0.78, 0.80, 0.83],
    roofDeck: [0.30, 0.32, 0.35],
    accent: [0.68, 0.71, 0.75],
  },
  // 5: Classic Urban Masonry & Brownstone
  {
    styleBucket: 5,
    wallPrimary: [0.66, 0.51, 0.43],
    wallSecondary: [0.77, 0.73, 0.66],
    roofDeck: [0.25, 0.25, 0.27],
    accent: [0.80, 0.76, 0.69],
  },
  // 6: Champagne Bronze Financial Tower
  {
    styleBucket: 6,
    wallPrimary: [0.76, 0.72, 0.64],
    wallSecondary: [0.65, 0.61, 0.54],
    roofDeck: [0.25, 0.25, 0.27],
    accent: [0.58, 0.54, 0.47],
  },
  // 7: Heritage Courtyard / Traditional Civic
  {
    styleBucket: 7,
    wallPrimary: [0.56, 0.57, 0.60],
    wallSecondary: [0.47, 0.49, 0.52],
    roofDeck: [0.24, 0.25, 0.28],
    accent: [0.64, 0.36, 0.32],
  },
];

function selectArchitecturalPalette(bldgInfo, seed) {
  const h = Number(bldgInfo.height) || 18;
  const btype = String(bldgInfo.btype || '').toLowerCase();
  const name = String(bldgInfo.name || '').toLowerCase();
  const rawStyle = String(bldgInfo.style || '').toLowerCase();

  let idx = Math.abs(seed) % 7;
  if (
    rawStyle.includes('palace') ||
    rawStyle.includes('hutong') ||
    btype === 'temple' ||
    btype === 'historic' ||
    name.includes('宫') ||
    name.includes('庙') ||
    name.includes('寺') ||
    (h <= 9.5 && (Math.abs(seed) % 5 === 0))
  ) {
    idx = 7;
  } else if (h >= 75) {
    const tallChoices = [0, 2, 6, 0, 1];
    idx = tallChoices[Math.abs(seed) % tallChoices.length];
  } else if (h >= 36) {
    const midChoices = [0, 1, 2, 4, 6];
    idx = midChoices[Math.abs(seed) % midChoices.length];
  } else if (btype.includes('apartments') || btype.includes('residential')) {
    const resChoices = [3, 4, 1, 5];
    idx = resChoices[Math.abs(seed) % resChoices.length];
  }

  const base = ARCHITECTURAL_PALETTES[idx];
  const shift = (((seed >>> 5) & 0xff) / 255.0 - 0.5) * 0.07;
  const warmShift = (((seed >>> 13) & 0xff) / 255.0 - 0.5) * 0.035;
  const tint = (c) => [
    Math.max(0.12, Math.min(0.95, c[0] + shift + warmShift)),
    Math.max(0.12, Math.min(0.95, c[1] + shift)),
    Math.max(0.12, Math.min(0.95, c[2] + shift - warmShift)),
  ];

  return {
    styleBucket: base.styleBucket,
    wallPrimary: tint(base.wallPrimary),
    wallSecondary: tint(base.wallSecondary),
    roofDeck: tint(base.roofDeck),
    accent: tint(base.accent),
  };
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
    wallOutOffset = 0.0,
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
  const palette = selectArchitecturalPalette(bldgInfo, seed);
  const styleBucket = palette.styleBucket;

  const ccwOuter = ensureCCWFlatXZ(flatOuter);
  const totalSpan = Math.max(3.2, topY - baseY);

  // Use clean 1-3 tier architectural setbacks for tall full buildings; 1 tier for normal buildings
  let tiers;
  if (!isPart && (rawMinH || 0) <= 0.5 && totalSpan >= 38.0 && ccwOuter.length <= 24) {
    const rng = createSeededRNG(seed ^ 0x9e3779b9);
    const rawTiers = collapseVerticalMassingWFC(ccwOuter, flatHoles, totalSpan, arch, rng, false).slice(0, 3);
    tiers = rawTiers.map((t) => ({
      ...t,
      y0: baseY + t.y0,
      y1: baseY + t.y1,
    }));
  } else {
    tiers = [
      {
        tierIndex: 0,
        role: 'main_shaft',
        y0: baseY,
        y1: topY,
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

  for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
    const tier = tiers[tIdx];
    const isTopTier = tIdx === tiers.length - 1;
    const tierSpan = tier.y1 - tier.y0;
    if (tierSpan < 0.4) continue;

    const parapetH = isTopTier ? Math.min(0.85, Math.max(0.35, tierSpan * 0.04)) : 0.42;
    const shaftY1 = Math.max(tier.y0 + 0.2, tier.y1 - parapetH);
    const vBase0 = Math.max(0.0, tier.y0 - baseY);
    const vShaft1 = Math.max(vBase0 + 0.2, shaftY1 - baseY);

    const emitRing = (ringPts, isHole) => {
      const nPts = ringPts.length / 2;
      let uAccum = 0.0;

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

        // Subtle directional sun-warmth variation per wall normal + vertical AO gradient
        const dirShade = 0.96 + 0.05 * (nx * 0.65 + nz * 0.45);
        const botShade = (tIdx === 0 ? 0.84 : 0.92) * dirShade;
        const topShade = 1.02 * dirShade;

        const wCol = palette.wallPrimary;
        const rB = Math.min(1, wCol[0] * botShade);
        const gB = Math.min(1, wCol[1] * botShade);
        const bB = Math.min(1, wCol[2] * botShade);
        const rT = Math.min(1, wCol[0] * topShade);
        const gT = Math.min(1, wCol[1] * topShade);
        const bT = Math.min(1, wCol[2] * topShade);

        // 1. Main Facade Wall Quad (2 triangles = 6 vertices)
        pos.push(
          x1, tier.y0, z1,
          x1, shaftY1, z1,
          x2, shaftY1, z2,
          x1, tier.y0, z1,
          x2, shaftY1, z2,
          x2, tier.y0, z2
        );
        for (let k = 0; k < 6; k++) {
          norm.push(nx, 0, nz);
        }
        col.push(
          rB, gB, bB,
          rT, gT, bT,
          rT, gT, bT,
          rB, gB, bB,
          rT, gT, bT,
          rB, gB, bB
        );
        if (triEntity) {
          triEntity.push(entityIdx, entityIdx);
        }

        const u0 = styleBucket * 1000.0 + uAccum;
        const u1 = styleBucket * 1000.0 + uAccum + len;
        pushUvQuad(u0, vBase0, u1, vShaft1);
        uAccum += len;

        // 2. Architectural Parapet / Cornice Band at top of tier (solid stone/metal, uv = -10)
        const pCol = palette.wallSecondary;
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
      }
    };

    emitRing(tier.flatOuter, false);
    for (const h of tier.flatHoles || []) {
      if (h.length >= 6) emitRing(ensureCCWFlatXZ(h), true);
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
    const deckCol = isTopTier ? palette.roofDeck : palette.wallSecondary;

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
      pushRoofUv(3);
    }

    // 4. Compact Rooftop Mechanical Penthouse on Top Tier of Mid/High-Rise Buildings
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    if (isTopTier && holes.length === 0 && totalSpan >= 20.0 && spanX >= 14.0 && spanZ >= 14.0) {
      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const pw = Math.min(12.0, spanX * 0.34);
      const pd = Math.min(12.0, spanZ * 0.34);
      const ph = Math.min(3.4, Math.max(2.0, totalSpan * 0.05));
      const beforeLen = pos.length;
      pushWorldBox(pos, norm, col, cx, roofY, cz, pw, ph, pd, palette.wallSecondary, triEntity, entityIdx, false);
      const addedVerts = (pos.length - beforeLen) / 3;
      pushRoofUv(addedVerts);
    }
  }

  if (uv) {
    const targetUvLen = (pos.length / 3) * 2;
    while (uv.length < targetUvLen) {
      uv.push(-10.0, -10.0);
    }
  }

  return { styleId, arch, palette };
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
