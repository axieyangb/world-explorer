import { getBeijingTerrainElevation } from './environment.js';

/**
 * High-Detail Procedural 3D Architectural Geometry Kernel for Beijing's 40 Iconic Landmarks.
 * Compatible with both Main Thread and Web Worker.
 *
 * Emits shared-vertex indexed geometry:
 * - `positions`: Float32Array (3 floats per vertex)
 * - `normals`: Float32Array (3 floats per vertex; length === 2.0 for nighttime/sunset emissive faces, 1.0 for standard faces)
 * - `colors`: Uint8Array (3 normalized bytes 0..255 per vertex)
 * - `indices`: Uint32Array (3 vertex indices per triangle)
 */
export class LandmarkGeometryBuilder {
  constructor(getElevationFn = getBeijingTerrainElevation) {
    this.getElevation = getElevationFn || getBeijingTerrainElevation;
    this.pos = [];
    this.norm = [];
    this.col = [];
    this.idx = [];
  }

  _hash(a, b, c = 0) {
    let h = ((a * 374761393) ^ (b * 668265263) ^ (c * 1274126177)) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295.0;
  }

  _pushVert(x, y, z, nx, ny, nz, r, g, b, emissive = false) {
    const vIdx = this.pos.length / 3;
    const nScale = emissive ? 2.0 : 1.0;
    this.pos.push(x, y, z);
    this.norm.push(nx * nScale, ny * nScale, nz * nScale);
    this.col.push(
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b)))
    );
    return vIdx;
  }

  addQuad(
    x0, y0, z0,
    x1, y1, z1,
    x2, y2, z2,
    x3, y3, z3,
    color,
    emissive = false
  ) {
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x3 - x0, vy = y3 - y0, vz = z3 - z0;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1.0;
    nx /= len;
    ny /= len;
    nz /= len;
    const [r, g, b] = Array.isArray(color)
      ? color
      : [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    const i0 = this._pushVert(x0, y0, z0, nx, ny, nz, r, g, b, emissive);
    const i1 = this._pushVert(x1, y1, z1, nx, ny, nz, r, g, b, emissive);
    const i2 = this._pushVert(x2, y2, z2, nx, ny, nz, r, g, b, emissive);
    const i3 = this._pushVert(x3, y3, z3, nx, ny, nz, r, g, b, emissive);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  addTri(
    x0, y0, z0,
    x1, y1, z1,
    x2, y2, z2,
    color,
    emissive = false
  ) {
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1.0;
    nx /= len;
    ny /= len;
    nz /= len;
    const [r, g, b] = Array.isArray(color)
      ? color
      : [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    const i0 = this._pushVert(x0, y0, z0, nx, ny, nz, r, g, b, emissive);
    const i1 = this._pushVert(x1, y1, z1, nx, ny, nz, r, g, b, emissive);
    const i2 = this._pushVert(x2, y2, z2, nx, ny, nz, r, g, b, emissive);
    this.idx.push(i0, i1, i2);
  }

  /**
   * 3D Structural Strut / Tube connecting arbitrary 3D points (x1,y1,z1) -> (x2,y2,z2).
   * Essential for Bird's Nest interwoven steel lattice, Water Cube foam frame, CCTV diagrid, and spires.
   */
  addStrut(x1, y1, z1, x2, y2, z2, thickness, color, emissive = false) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    const tx = dx / len, ty = dy / len, tz = dz / len;
    let upX = 0, upY = 1, upZ = 0;
    if (Math.abs(ty) > 0.92) {
      upX = 1;
      upY = 0;
    }
    let rx = ty * upZ - tz * upY;
    let ry = tz * upX - tx * upZ;
    let rz = tx * upY - ty * upX;
    const rLen = Math.hypot(rx, ry, rz) || 1.0;
    const hw = thickness * 0.5;
    rx = (rx / rLen) * hw;
    ry = (ry / rLen) * hw;
    rz = (rz / rLen) * hw;
    const ux = (ty * rz - tz * ry);
    const uy = (tz * rx - tx * rz);
    const uz = (tx * ry - ty * rx);
    const uLen = Math.hypot(ux, uy, uz) || 1.0;
    const bx = (ux / uLen) * hw;
    const by = (uy / uLen) * hw;
    const bz = (uz / uLen) * hw;

    const p00 = [x1 - rx - bx, y1 - ry - by, z1 - rz - bz];
    const p10 = [x1 + rx - bx, y1 + ry - by, z1 + rz - bz];
    const p11 = [x1 + rx + bx, y1 + ry + by, z1 + rz + bz];
    const p01 = [x1 - rx + bx, y1 - ry + by, z1 - rz + bz];

    const q00 = [x2 - rx - bx, y2 - ry - by, z2 - rz - bz];
    const q10 = [x2 + rx - bx, y2 + ry - by, z2 + rz - bz];
    const q11 = [x2 + rx + bx, y2 + ry + by, z2 + rz + bz];
    const q01 = [x2 - rx + bx, y2 - ry + by, z2 - rz + bz];

    this.addQuad(...p00, ...p10, ...q10, ...q00, color, emissive);
    this.addQuad(...p10, ...p11, ...q11, ...q10, color, emissive);
    this.addQuad(...p11, ...p01, ...q01, ...q11, color, emissive);
    this.addQuad(...p01, ...p00, ...q00, ...q01, color, emissive);
  }

  /**
   * Adds an oriented 3D box (5 faces: N, S, E, W, Top) centered at (cx, cz) with base at y0.
   */
  addBox(cx, y0, cz, sx, sy, sz, yaw, color, emissive = false) {
    const hw = sx * 0.5;
    const hd = sz * 0.5;
    const y1 = y0 + sy;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];

    const [x00, z00] = rot(-hw, -hd);
    const [x10, z10] = rot(hw, -hd);
    const [x11, z11] = rot(hw, hd);
    const [x01, z01] = rot(-hw, hd);

    this.addQuad(x01, y0, z01, x11, y0, z11, x11, y1, z11, x01, y1, z01, color, emissive);
    this.addQuad(x10, y0, z10, x00, y0, z00, x00, y1, z00, x10, y1, z10, color, emissive);
    this.addQuad(x11, y0, z11, x10, y0, z10, x10, y1, z10, x11, y1, z11, color, emissive);
    this.addQuad(x00, y0, z00, x01, y0, z01, x01, y1, z01, x00, y1, z00, color, emissive);
    const topCol = emissive
      ? color
      : [Math.round(color[0] * 0.92), Math.round(color[1] * 0.92), Math.round(color[2] * 0.92)];
    this.addQuad(x01, y1, z01, x11, y1, z11, x10, y1, z10, x00, y1, z00, topCol, emissive);
  }

  /**
   * Adds a tapered 4-sided frustum box from bottom (sx0, sz0) at y0 to top (sx1, sz1) at y0 + sy.
   */
  addFrustumBox(cx, y0, cz, sx0, sz0, sx1, sz1, sy, yaw, color, emissive = false, capTop = true) {
    const hw0 = sx0 * 0.5, hd0 = sz0 * 0.5;
    const hw1 = sx1 * 0.5, hd1 = sz1 * 0.5;
    const y1 = y0 + sy;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];

    const [b00x, b00z] = rot(-hw0, -hd0);
    const [b10x, b10z] = rot(hw0, -hd0);
    const [b11x, b11z] = rot(hw0, hd0);
    const [b01x, b01z] = rot(-hw0, hd0);

    const [t00x, t00z] = rot(-hw1, -hd1);
    const [t10x, t10z] = rot(hw1, -hd1);
    const [t11x, t11z] = rot(hw1, hd1);
    const [t01x, t01z] = rot(-hw1, hd1);

    this.addQuad(b01x, y0, b01z, b11x, y0, b11z, t11x, y1, t11z, t01x, y1, t01z, color, emissive);
    this.addQuad(b10x, y0, b10z, b00x, y0, b00z, t00x, y1, t00z, t10x, y1, t10z, color, emissive);
    this.addQuad(b11x, y0, b11z, b10x, y0, b10z, t10x, y1, t10z, t11x, y1, t11z, color, emissive);
    this.addQuad(b00x, y0, b00z, b01x, y0, b01z, t01x, y1, t01z, t00x, y1, t00z, color, emissive);
    if (capTop && (sx1 > 0.05 || sz1 > 0.05)) {
      const topCol = emissive
        ? color
        : [Math.round(color[0] * 0.92), Math.round(color[1] * 0.92), Math.round(color[2] * 0.92)];
      this.addQuad(t01x, y1, t01z, t11x, y1, t11z, t10x, y1, t10z, t00x, y1, t00z, topCol, emissive);
    }
  }

  /**
   * Adds a regular polygon cylinder or cone frustum with `segs` sides.
   */
  addCylinder(cx, y0, cz, r0, r1, sy, segs, yaw, color, emissive = false, capTop = true) {
    return this.addEllipticalSlice(cx, y0, cz, r0, r0, r1, r1, sy, segs, yaw, color, emissive, capTop);
  }

  /**
   * Adds an elliptical frustum slice from (rx0, rz0) at y0 to (rx1, rz1) at y0 + sy.
   */
  addEllipticalSlice(cx, y0, cz, rx0, rz0, rx1, rz1, sy, segs, yaw, color, emissive = false, capTop = true) {
    const y1 = y0 + sy;
    const topCol = emissive
      ? color
      : [Math.round(color[0] * 0.92), Math.round(color[1] * 0.92), Math.round(color[2] * 0.92)];
    const cYaw = Math.cos(yaw), sYaw = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * cYaw - lz * sYaw, cz + lx * sYaw + lz * cYaw];

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      const [bx0, bz0] = rot(c0 * rx0, s0 * rz0);
      const [bx1, bz1] = rot(c1 * rx0, s1 * rz0);
      const [tx0, tz0] = rot(c0 * rx1, s0 * rz1);
      const [tx1, tz1] = rot(c1 * rx1, s1 * rz1);

      this.addQuad(bx0, y0, bz0, bx1, y0, bz1, tx1, y1, tz1, tx0, y1, tz0, color, emissive);
      if (capTop && (rx1 > 0.05 || rz1 > 0.05)) {
        this.addTri(cx, y1, cz, tx0, y1, tz0, tx1, y1, tz1, topCol, emissive);
      }
    }
  }

  /**
   * High-Detail 3D Curtain-Wall Box with vertical mullions, floor spandrel ledges, corner pilasters,
   * and per-window deterministic day/night lighting (matches WFC 3D facade fidelity).
   */
  addCurtainWallBox(
    cx, y0, cz, sx, sy, sz, yaw,
    frameColor = [155, 168, 182],
    glassColor = [62, 92, 122],
    litWarm = [255, 224, 150],
    litCool = [175, 228, 255],
    floorH = 4.0,
    bayW = 4.2,
    litProb = 0.42,
    seed = 1
  ) {
    // 1. Base structural core box in dark glass color
    this.addBox(cx, y0, cz, sx, sy, sz, yaw, glassColor, false);

    // 2. Corner vertical pilasters & roof parapet
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const hw = sx * 0.5, hd = sz * 0.5;
    const pilW = Math.min(1.2, Math.max(0.45, Math.min(sx, sz) * 0.04));
    for (const [ cornerX, cornerZ ] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const [px, pz] = rot(cornerX, cornerZ);
      this.addBox(px, y0, pz, pilW, sy + 0.4, pilW, yaw, frameColor, false);
    }

    // 3. Floor spandrel bands & individual lit window panes on all 4 facades
    const floors = Math.max(1, Math.round(sy / floorH));
    const dfh = sy / floors;
    const spandrelH = Math.min(0.85, dfh * 0.24);
    for (let f = 0; f < floors; f++) {
      const fy = y0 + f * dfh;
      this.addBox(cx, fy, cz, sx + 0.24, spandrelH, sz + 0.24, yaw, frameColor, false);
    }

    const emitWallWindows = (faceIdx, len, offsetDist, dirX, dirZ, rightX, rightZ) => {
      const bays = Math.max(2, Math.round(len / bayW));
      const dbw = len / bays;
      const winW = dbw * 0.72;
      const winH = dfh * 0.64;
      for (let f = 0; f < floors; f++) {
        const wy0 = y0 + f * dfh + spandrelH + (dfh - spandrelH - winH) * 0.5;
        const wy1 = wy0 + winH;
        for (let b = 0; b < bays; b++) {
          const hVal = this._hash(seed + faceIdx * 31, f * 17 + 3, b * 13 + 7);
          if (hVal > litProb) continue;
          const uCenter = -len * 0.5 + (b + 0.5) * dbw;
          const u0 = uCenter - winW * 0.5;
          const u1 = uCenter + winW * 0.5;
          const lx0 = dirX * offsetDist + rightX * u0;
          const lz0 = dirZ * offsetDist + rightZ * u0;
          const lx1 = dirX * offsetDist + rightX * u1;
          const lz1 = dirZ * offsetDist + rightZ * u1;
          const [wx0, wz0] = rot(lx0, lz0);
          const [wx1, wz1] = rot(lx1, lz1);
          const col = hVal < litProb * 0.65 ? litWarm : litCool;
          this.addQuad(wx0, wy0, wz0, wx1, wy0, wz1, wx1, wy1, wz1, wx0, wy1, wz0, col, true);
        }
      }
    };

    emitWallWindows(0, sx - pilW, hd + 0.08, 0, 1, 1, 0);
    emitWallWindows(1, sx - pilW, hd + 0.08, 0, -1, -1, 0);
    emitWallWindows(2, sz - pilW, hw + 0.08, 1, 0, 0, -1);
    emitWallWindows(3, sz - pilW, hw + 0.08, -1, 0, 0, 1);
  }

  /**
   * High-Detail 3D Curtain-Wall Frustum with spandrel rings, corner ribs, and per-window night lighting.
   * Ideal for China Zun (waisted vessel), CWTC 3A/3B tapered obelisks, and tapered skyscrapers.
   */
  addCurtainWallFrustum(
    cx, y0, cz, sx0, sz0, sx1, sz1, sy, yaw,
    frameColor = [175, 190, 208],
    glassColor = [58, 88, 122],
    litWarm = [255, 226, 155],
    litCool = [180, 232, 255],
    floors = 8,
    bays = 8,
    litProb = 0.44,
    seed = 1,
    capTop = true
  ) {
    this.addFrustumBox(cx, y0, cz, sx0, sz0, sx1, sz1, sy, yaw, glassColor, false, capTop);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];

    // Corner diagonal structural ribs
    for (const [sgX, sgZ] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const [bx, bz] = rot(sgX * sx0, sgZ * sz0);
      const [tx, tz] = rot(sgX * sx1, sgZ * sz1);
      this.addStrut(bx, y0, bz, tx, y0 + sy, tz, 0.9, frameColor, false);
    }

    for (let f = 0; f < floors; f++) {
      const t0 = f / floors;
      const t1 = (f + 1) / floors;
      const tm0 = t0 + (t1 - t0) * 0.22;
      const tm1 = t0 + (t1 - t0) * 0.86;
      const wy0 = y0 + sy * tm0;
      const wy1 = y0 + sy * tm1;

      // Spandrel collar at floor base
      const spSx = sx0 + (sx1 - sx0) * t0 + 0.25;
      const spSz = sz0 + (sz1 - sz0) * t0 + 0.25;
      this.addBox(cx, y0 + sy * t0, cz, spSx, Math.max(0.35, (sy / floors) * 0.18), spSz, yaw, frameColor, false);

      const curSx0 = sx0 + (sx1 - sx0) * tm0;
      const curSz0 = sz0 + (sz1 - sz0) * tm0;
      const curSx1 = sx0 + (sx1 - sx0) * tm1;
      const curSz1 = sz0 + (sz1 - sz0) * tm1;

      for (let b = 0; b < bays; b++) {
        const u0 = -0.44 + (b / bays) * 0.88 + (0.88 / bays) * 0.14;
        const u1 = -0.44 + ((b + 1) / bays) * 0.88 - (0.88 / bays) * 0.14;

        // +Z & -Z faces
        for (const [fIdx, zSign] of [[0, 1], [1, -1]]) {
          const hVal = this._hash(seed + fIdx * 29, f * 19 + 5, b * 11 + 3);
          if (hVal <= litProb) {
            const col = hVal < litProb * 0.68 ? litWarm : litCool;
            const zOff0 = zSign * (curSz0 * 0.5 + 0.08);
            const zOff1 = zSign * (curSz1 * 0.5 + 0.08);
            const [p0x, p0z] = rot(zSign * u0 * curSx0, zOff0);
            const [p1x, p1z] = rot(zSign * u1 * curSx0, zOff0);
            const [p2x, p2z] = rot(zSign * u1 * curSx1, zOff1);
            const [p3x, p3z] = rot(zSign * u0 * curSx1, zOff1);
            this.addQuad(p0x, wy0, p0z, p1x, wy0, p1z, p2x, wy1, p2z, p3x, wy1, p3z, col, true);
          }
        }
        // +X & -X faces
        for (const [fIdx, xSign] of [[2, 1], [3, -1]]) {
          const hVal = this._hash(seed + fIdx * 29, f * 19 + 5, b * 11 + 3);
          if (hVal <= litProb) {
            const col = hVal < litProb * 0.68 ? litWarm : litCool;
            const xOff0 = xSign * (curSx0 * 0.5 + 0.08);
            const xOff1 = xSign * (curSx1 * 0.5 + 0.08);
            const [p0x, p0z] = rot(xOff0, -xSign * u0 * curSz0);
            const [p1x, p1z] = rot(xOff0, -xSign * u1 * curSz0);
            const [p2x, p2z] = rot(xOff1, -xSign * u1 * curSz1);
            const [p3x, p3z] = rot(xOff1, -xSign * u0 * curSz1);
            this.addQuad(p0x, wy0, p0z, p1x, wy0, p1z, p2x, wy1, p2z, p3x, wy1, p3z, col, true);
          }
        }
      }
    }
  }

  /**
   * Adds a Skewed / Leaning 3D Tower Segment from bottom center (x0, z0, sx0, sz0, y0)
   * to top center (x1, z1, sx1, sz1, y1) with external diagrid steel bracing and lit horizontal window bands.
   * Essential for CCTV Headquarters ("Big Pants").
   */
  addSkewedDiagridTower(
    x0, z0, sx0, sz0, y0,
    x1, z1, sx1, sz1, y1,
    yaw,
    glassColor = [46, 62, 78],
    steelColor = [125, 138, 152],
    litWarm = [255, 220, 145],
    litCool = [170, 225, 255],
    floors = 14,
    bays = 6,
    litProb = 0.45,
    seed = 1
  ) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cornerAt = (t, sgX, sgZ, pad = 0) => {
      const cx = x0 + (x1 - x0) * t;
      const cz = z0 + (z1 - z0) * t;
      const sx = (sx0 + (sx1 - sx0) * t) * 0.5 + pad;
      const sz = (sz0 + (sz1 - sz0) * t) * 0.5 + pad;
      const lx = sgX * sx, lz = sgZ * sz;
      return [cx + lx * c - lz * s, y0 + (y1 - y0) * t, cz + lx * s + lz * c];
    };

    const b00 = cornerAt(0, -1, -1), b10 = cornerAt(0, 1, -1), b11 = cornerAt(0, 1, 1), b01 = cornerAt(0, -1, 1);
    const t00 = cornerAt(1, -1, -1), t10 = cornerAt(1, 1, -1), t11 = cornerAt(1, 1, 1), t01 = cornerAt(1, -1, 1);

    this.addQuad(...b01, ...b11, ...t11, ...t01, glassColor, false);
    this.addQuad(...b10, ...b00, ...t00, ...t10, glassColor, false);
    this.addQuad(...b11, ...b10, ...t10, ...t11, glassColor, false);
    this.addQuad(...b00, ...b01, ...t01, ...t00, glassColor, false);
    this.addQuad(...t01, ...t11, ...t10, ...t00, steelColor, false);
    this.addQuad(...b00, ...b10, ...b11, ...b01, steelColor, false);

    // Corner edges
    this.addStrut(...b00, ...t00, 0.9, steelColor, false);
    this.addStrut(...b10, ...t10, 0.9, steelColor, false);
    this.addStrut(...b11, ...t11, 0.9, steelColor, false);
    this.addStrut(...b01, ...t01, 0.9, steelColor, false);

    // External Rem Koolhaas steel diagrid X-bracing across all 4 faces
    const diagTiers = Math.max(2, Math.round(floors / 3));
    const faceCorners = [
      [[-1, 1], [1, 1]],
      [[1, -1], [-1, -1]],
      [[1, 1], [1, -1]],
      [[-1, -1], [-1, 1]],
    ];
    for (let d = 0; d < diagTiers; d++) {
      const ta = d / diagTiers;
      const tb = (d + 1) / diagTiers;
      for (const [cA, cB] of faceCorners) {
        const pA0 = cornerAt(ta, cA[0], cA[1], 0.12);
        const pB0 = cornerAt(ta, cB[0], cB[1], 0.12);
        const pA1 = cornerAt(tb, cA[0], cA[1], 0.12);
        const pB1 = cornerAt(tb, cB[0], cB[1], 0.12);
        this.addStrut(...pA0, ...pB1, 0.55, steelColor, false);
        this.addStrut(...pB0, ...pA1, 0.55, steelColor, false);
        this.addStrut(...pA1, ...pB1, 0.48, steelColor, false);
      }
    }

    // Lit office window quads per floor & bay
    for (let f = 0; f < floors; f++) {
      const ta = (f + 0.22) / floors;
      const tb = (f + 0.78) / floors;
      for (let fIdx = 0; fIdx < 4; fIdx++) {
        const [cA, cB] = faceCorners[fIdx];
        const a0 = cornerAt(ta, cA[0], cA[1], 0.08);
        const b0 = cornerAt(ta, cB[0], cB[1], 0.08);
        const a1 = cornerAt(tb, cA[0], cA[1], 0.08);
        const b1 = cornerAt(tb, cB[0], cB[1], 0.08);
        for (let b = 0; b < bays; b++) {
          const hVal = this._hash(seed + fIdx * 41, f * 17 + 3, b * 23 + 5);
          if (hVal > litProb) continue;
          const u0 = (b + 0.15) / bays;
          const u1 = (b + 0.85) / bays;
          const lerp3 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
          const w00 = lerp3(a0, b0, u0);
          const w10 = lerp3(a0, b0, u1);
          const w11 = lerp3(a1, b1, u1);
          const w01 = lerp3(a1, b1, u0);
          const col = hVal < litProb * 0.65 ? litWarm : litCool;
          this.addQuad(...w00, ...w10, ...w11, ...w01, col, true);
        }
      }
    }
  }

  /**
   * Adds an Elliptical Curvilinear Ribbon Slice with white aluminum spandrel bands and glowing ribbon windows.
   * Ideal for Zaha Hadid landmarks (Wangjing SOHO, Galaxy SOHO, Leeza SOHO) and Ice Ribbon.
   */
  addEllipticalRibbonSlice(
    cx, y0, cz, rx0, rz0, rx1, rz1, sy, segs, yaw,
    spandrelColor = [236, 240, 245],
    glassColor = [52, 78, 108],
    litColor = [215, 240, 255],
    litProb = 0.65,
    seed = 1,
    capTop = false
  ) {
    const spH = sy * 0.42;
    const winH = sy - spH;
    // Lower white curvilinear aluminum ribbon band
    this.addEllipticalSlice(cx, y0, cz, rx0, rz0, rx0 + (rx1 - rx0) * 0.42, rz0 + (rz1 - rz0) * 0.42, spH, segs, yaw, spandrelColor, false, false);
    // Upper recessed glass band with segmented lit panes
    const yWin0 = y0 + spH;
    const yWin1 = y0 + sy;
    const rxM = (rx0 + rx1) * 0.5 * 0.97;
    const rzM = (rz0 + rz1) * 0.5 * 0.97;
    const cYaw = Math.cos(yaw), sYaw = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * cYaw - lz * sYaw, cz + lx * sYaw + lz * cYaw];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const [bx0, bz0] = rot(Math.cos(a0) * rxM, Math.sin(a0) * rzM);
      const [bx1, bz1] = rot(Math.cos(a1) * rxM, Math.sin(a1) * rzM);
      const isLit = this._hash(seed, i, Math.round(y0)) <= litProb;
      this.addQuad(bx0, yWin0, bz0, bx1, yWin0, bz1, bx1, yWin1, bz1, bx0, yWin1, bz0, isLit ? litColor : glassColor, isLit);
    }
    if (capTop) {
      this.addEllipticalSlice(cx, y0 + sy - 0.35, cz, rx1, rz1, rx1 * 0.96, rz1 * 0.96, 0.35, segs, yaw, spandrelColor, false, true);
    }
  }

  /**
   * Authentic Concave-Curved Chinese Pitched Roof (`反宇飞檐歇山顶/庑殿顶`) with 3 slope segments,
   * upturned corner eaves, emerald-blue-gold painted beam band (`和玺彩画`), golden roof ridge & finials (`正脊吻兽`),
   * and warm under-eave lantern glow (`emissive = true`).
   */
  addChineseRoof(cx, y0, cz, sx, sz, roofH, overhang, yaw, roofColor, trimColor, ridgeColor) {
    // 1. Emerald-blue-gold painted Dougong beam frieze (`斗拱额枋彩画`) + warm under-eave lantern strip
    const beamCol = [42, 118, 96];
    this.addBox(cx, y0 - 0.85, cz, sx + 0.4, 0.65, sz + 0.4, yaw, beamCol, false);
    this.addBox(cx, y0 - 0.25, cz, sx + 0.8, 0.28, sz + 0.8, yaw, [255, 205, 115], true);

    // 2. Concave 3-tier curved roof slope (flatter upturned lower eave -> steeper upper pitch)
    const w0 = sx + overhang * 2.15;
    const d0 = sz + overhang * 2.15;
    const w1 = sx + overhang * 0.85;
    const d1 = sz + overhang * 0.85;
    const w2 = Math.max(2.5, sx * 0.56);
    const d2 = Math.max(1.6, sz * 0.24);
    const w3 = Math.max(2.0, sx * 0.44);
    const d3 = Math.max(0.7, sz * 0.08);

    const h1 = roofH * 0.18;
    const h2 = roofH * 0.56;
    const h3 = roofH;

    // Upturned eave trim skirt
    this.addFrustumBox(cx, y0, cz, w0 + 0.5, d0 + 0.5, w0, d0, 0.38, yaw, trimColor || roofColor, false, false);
    // Tier 1: gentle flare
    this.addFrustumBox(cx, y0 + 0.32, cz, w0, d0, w1, d1, h1, yaw, roofColor, false, false);
    // Tier 2: mid concave curve
    const midRoofCol = [
      Math.min(255, Math.round(roofColor[0] * 0.96)),
      Math.min(255, Math.round(roofColor[1] * 0.96)),
      Math.min(255, Math.round(roofColor[2] * 0.96)),
    ];
    this.addFrustumBox(cx, y0 + 0.32 + h1, cz, w1, d1, w2, d2, h2 - h1, yaw, midRoofCol, false, false);
    // Tier 3: steep upper ridge slope
    this.addFrustumBox(cx, y0 + 0.32 + h2, cz, w2, d2, w3, d3, h3 - h2, yaw, roofColor, false, true);

    // 3. Main ridge beam (`正脊`) and golden owl-tail finials (`鸱吻`) at both ends
    const rCol = ridgeColor || [246, 198, 68];
    const ridgeW = Math.max(2.4, w3 * 1.06);
    this.addBox(cx, y0 + 0.32 + roofH - 0.15, cz, ridgeW, 0.72, 0.75, yaw, rCol, false);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const endSign of [-1, 1]) {
      const fx = cx + endSign * (ridgeW * 0.48) * c;
      const fz = cz + endSign * (ridgeW * 0.48) * s;
      this.addBox(fx, y0 + 0.32 + roofH + 0.45, fz, 0.85, 1.15, 0.95, yaw, [250, 210, 82], true);
    }
  }

  /**
   * Adds a White Marble Xumi Terrace (`汉白玉须弥座台基`) with perimeter carved marble balustrades (`望柱栏板`)
   * and central imperial dragon-carved ramp (`丹陛御路`).
   */
  addMarbleTerrace(cx, y0, cz, sx, sz, terraceH, tiers = 3, yaw = 0, marbleColor = [242, 239, 232]) {
    const tierH = terraceH / Math.max(1, tiers);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];

    for (let t = 0; t < tiers; t++) {
      const shrink = t * 3.2;
      const tw = Math.max(8, sx - shrink * 2);
      const td = Math.max(8, sz - shrink * 2);
      const ty = y0 + t * tierH;
      this.addBox(cx, ty, cz, tw, tierH, td, yaw, marbleColor, false);
      // Carved waist molding (`束腰`) and top balustrade (`汉白玉栏杆`)
      const balH = 1.05;
      const hw = tw * 0.5 - 0.35;
      const hd = td * 0.5 - 0.35;
      const [nX, nZ] = rot(0, -hd);
      const [sX, sZ] = rot(0, hd);
      const [eX, eZ] = rot(hw, 0);
      const [wX, wZ] = rot(-hw, 0);
      this.addBox(nX, ty + tierH, nZ, tw - 0.5, balH, 0.45, yaw, [250, 248, 242], false);
      this.addBox(sX, ty + tierH, sZ, tw - 0.5, balH, 0.45, yaw, [250, 248, 242], false);
      this.addBox(eX, ty + tierH, eZ, 0.45, balH, td - 0.5, yaw, [250, 248, 242], false);
      this.addBox(wX, ty + tierH, wZ, 0.45, balH, td - 0.5, yaw, [250, 248, 242], false);
    }

    // South & North central imperial stair ramps (`御路丹陛`)
    for (const zSign of [1, -1]) {
      const [rx, rz] = rot(0, zSign * (sz * 0.5 + 1.8));
      this.addFrustumBox(rx, y0, rz, Math.min(14, sx * 0.24), 5.6, Math.min(11, sx * 0.20), 2.2, terraceH + 0.5, yaw, [236, 232, 224], false);
    }
  }

  /**
   * Adds a complete Imperial Palace Hall (Xumi marble terrace + vermilion colonnade pillars + golden lattice windows
   * + double-eave or single-eave curved golden roof + nighttime palace lantern illumination).
   */
  addImperialPalace(
    cx, y0, cz, sx, sz, terraceH, tiers, wallH, roofH, yaw,
    roofColor = [232, 176, 38],
    wallColor = [172, 42, 36],
    marbleColor = [242, 239, 232],
    doubleEave = true
  ) {
    if (terraceH > 0.2) {
      this.addMarbleTerrace(cx, y0, cz, sx + tiers * 5.2, sz + tiers * 5.2, terraceH, tiers, yaw, marbleColor);
    }
    const baseTop = y0 + terraceH;
    // Recessed red sanctuary wall
    this.addBox(cx, baseTop, cz, sx * 0.94, wallH, sz * 0.94, yaw, wallColor, false);

    // Projecting vermilion perimeter colonnade pillars (`朱红檐柱`) & warm golden lattice windows (`隔扇槛窗`)
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
    const nBaysX = Math.max(5, Math.min(11, Math.round(sx / 5.5) | 1));
    const nBaysZ = Math.max(3, Math.min(5, Math.round(sz / 5.5) | 1));
    const colRgb = [196, 46, 38];
    const winRgb = [255, 210, 118];

    for (let i = 0; i <= nBaysX; i++) {
      const lx = -sx * 0.48 + (i / nBaysX) * sx * 0.96;
      for (const zSign of [-1, 1]) {
        const [px, pz] = rot(lx, zSign * sz * 0.48);
        this.addCylinder(px, baseTop, pz, 0.48, 0.45, wallH, 8, yaw, colRgb, false, false);
        if (i < nBaysX) {
          const midLx = lx + (sx * 0.96) / (nBaysX * 2);
          const [wx, wz] = rot(midLx, zSign * sz * 0.475);
          this.addBox(wx, baseTop + wallH * 0.22, wz, (sx * 0.65) / nBaysX, wallH * 0.56, 0.35, yaw, winRgb, true);
        }
      }
    }
    for (let j = 1; j < nBaysZ; j++) {
      const lz = -sz * 0.48 + (j / nBaysZ) * sz * 0.96;
      for (const xSign of [-1, 1]) {
        const [px, pz] = rot(xSign * sx * 0.48, lz);
        this.addCylinder(px, baseTop, pz, 0.48, 0.45, wallH, 8, yaw, colRgb, false, false);
      }
    }

    if (doubleEave) {
      // Lower eave skirt + upper hall clerestory + upper main curved roof
      const lowY = baseTop + wallH * 0.58;
      this.addChineseRoof(cx, lowY, cz, sx * 1.04, sz * 1.04, roofH * 0.38, 2.8, yaw, roofColor, roofColor, roofColor);
      this.addBox(cx, lowY + roofH * 0.22, cz, sx * 0.84, wallH * 0.46, sz * 0.84, yaw, wallColor, false);
      this.addChineseRoof(
        cx,
         baseTop + wallH + roofH * 0.12,
        cz,
        sx * 0.86,
        sz * 0.86,
        roofH * 0.82,
        3.2,
        yaw,
        roofColor,
        roofColor,
        [248, 206, 74]
      );
    } else {
      this.addChineseRoof(cx, baseTop + wallH, cz, sx, sz, roofH, 3.0, yaw, roofColor, roofColor, [248, 206, 74]);
    }
  }

  /**
   * Adds a Ming/Qing Fortified City Gatehouse or Arrow Tower (`城楼/箭楼`) with battered grey-brick fortress base,
   * arched portal tunnels, arrow-slit embrasures (`箭窗`), white marble parapet, and double-eave gatehouse hall.
   */
  addCityGatehouse(
    cx, y0, cz, baseW, baseD, baseH, hallW, hallD, hallH, roofH, yaw,
    wallColor = [118, 122, 128],
    roofColor = [78, 136, 96],
    isArrowTower = false
  ) {
    // 1. Battered grey-brick fortress bastion (`城台`)
    this.addFrustumBox(cx, y0, cz, baseW, baseD, baseW * 0.90, baseD * 0.90, baseH, yaw, wallColor, false);
    // White crenellated parapet (`雉堞女墙`) & warm floodlight band at top of fortress wall
    this.addBox(cx, y0 + baseH - 0.5, cz, baseW * 0.92, 1.35, baseD * 0.92, yaw, [225, 224, 218], false);
    this.addBox(cx, y0 + baseH - 1.1, cz, baseW * 0.91, 0.35, baseD * 0.91, yaw, [255, 198, 108], true);

    // Central arched gateway portal (`城门券洞`)
    this.addBox(cx, y0, cz, Math.min(9.0, baseW * 0.16), Math.min(7.8, baseH * 0.58), baseD + 0.6, yaw, [32, 26, 26], false);

    const topY = y0 + baseH + 0.6;
    if (isArrowTower) {
      // Arrow Tower (`箭楼`): tall grey-and-red brick bastion with 4 rows × 12 columns of white-framed arrow slits
      this.addBox(cx, topY, cz, hallW, hallH, hallD, yaw, [142, 46, 40], false);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
      for (let r = 0; r < 4; r++) {
        const wy = topY + 1.4 + r * ((hallH - 2.4) / 4);
        for (let col = 0; col < 11; col++) {
          const lx = -hallW * 0.44 + (col / 10) * hallW * 0.88;
          for (const zSign of [-1, 1]) {
            const [ax, az] = rot(lx, zSign * (hallD * 0.5 + 0.12));
            const isLit = (r + col) % 2 === 0;
            this.addBox(ax, wy, az, 1.15, 1.25, 0.25, yaw, isLit ? [255, 215, 130] : [238, 238, 238], isLit);
          }
        }
      }
      this.addChineseRoof(cx, topY + hallH, cz, hallW + 1.5, hallD + 1.5, roofH, 3.2, yaw, roofColor, roofColor, [242, 196, 68]);
    } else {
      this.addImperialPalace(cx, topY, cz, hallW, hallD, 0, 0, hallH, roofH, yaw, roofColor, [172, 42, 36], [242, 239, 232], true);
    }
  }

  /**
   * Adds a Classical Monumental Colonnade Hall (for Great Hall of the People, National Museum, Military Museum).
   */
  addClassicalColonnadeWing(
    cx, y0, cz, sx, sy, sz, yaw,
    stoneColor = [232, 224, 206],
    colColor = [244, 238, 224],
    corniceColor = [238, 192, 68],
    litColor = [255, 220, 140],
    nColsX = 12,
    nColsZ = 16
  ) {
    // Granite podium base
    const podH = Math.min(4.8, sy * 0.14);
    this.addBox(cx, y0, cz, sx + 4.0, podH, sz + 4.0, yaw, [196, 190, 180], false);
    const bodyY = y0 + podH;
    const bodyH = sy - podH - 2.6;
    this.addBox(cx, bodyY, cz, sx - 2.2, bodyH, sz - 2.2, yaw, stoneColor, false);

    // Tall vertical recessed hall windows (warmly lit at night) and colonnade columns around perimeter
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rot = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];

    for (let i = 0; i <= nColsX; i++) {
      const lx = -sx * 0.47 + (i / nColsX) * sx * 0.94;
      for (const zSign of [-1, 1]) {
        const [px, pz] = rot(lx, zSign * sz * 0.49);
        this.addCylinder(px, bodyY, pz, 0.85, 0.78, bodyH, 8, yaw, colColor, false, false);
        if (i < nColsX) {
          const midX = lx + (sx * 0.94) / (nColsX * 2);
          const [wx, wz] = rot(midX, zSign * (sz * 0.49 - 1.0));
          this.addBox(wx, bodyY + bodyH * 0.16, wz, (sx * 0.52) / nColsX, bodyH * 0.68, 0.4, yaw, litColor, true);
        }
      }
    }
    for (let j = 0; j <= nColsZ; j++) {
      const lz = -sz * 0.47 + (j / nColsZ) * sz * 0.94;
      for (const xSign of [-1, 1]) {
        const [px, pz] = rot(xSign * sx * 0.49, lz);
        this.addCylinder(px, bodyY, pz, 0.85, 0.78, bodyH, 8, yaw, colColor, false, false);
        if (j < nColsZ) {
          const midZ = lz + (sz * 0.94) / (nColsZ * 2);
          const [wx, wz] = rot(xSign * (sx * 0.49 - 1.0), midZ);
          this.addBox(wx, bodyY + bodyH * 0.16, wz, 0.4, bodyH * 0.68, (sz * 0.52) / nColsZ, yaw, litColor, true);
        }
      }
    }

    // Classical entablature & glazed green-and-gold roof cornice
    this.addBox(cx, bodyY + bodyH, cz, sx + 1.6, 1.6, sz + 1.6, yaw, colColor, false);
    this.addBox(cx, bodyY + bodyH + 1.6, cz, sx + 2.4, 1.1, sz + 2.4, yaw, corniceColor, true);
  }

  /**
   * Adds a Liao/Jin Multi-Eave Octagonal Pagoda (`密檐式八角塔` for Tianning Pagoda & Yuquan Pagoda).
   */
  addOctagonalPagoda(cx, y0, cz, baseR, baseH, bodyH, stories, eaveR, spireH, bodyColor, eaveColor) {
    // Octagonal Xumi pedestal with carved reliefs
    this.addCylinder(cx, y0, cz, baseR * 1.18, baseR * 1.04, baseH * 0.55, 8, Math.PI / 8, bodyColor, false);
    this.addCylinder(cx, y0 + baseH * 0.55, cz, baseR * 0.96, baseR * 1.06, baseH * 0.45, 8, Math.PI / 8, [226, 212, 188], false);
    // Tall first-story shaft with warm shrine niche glow on 4 cardinal faces
    const shaftY = y0 + baseH;
    this.addCylinder(cx, shaftY, cz, baseR * 0.86, baseR * 0.82, bodyH, 8, Math.PI / 8, bodyColor, false);
    this.addCylinder(cx, shaftY + bodyH * 0.35, cz, baseR * 0.88, baseR * 0.88, bodyH * 0.28, 8, Math.PI / 8, [255, 208, 120], true, false);

    let curY = shaftY + bodyH;
    for (let i = 0; i < stories; i++) {
      const t = i / Math.max(1, stories - 1);
      const r = eaveR * (1.0 - t * 0.36);
      this.addCylinder(cx, curY, cz, r * 0.72, r * 1.08, 0.85, 8, Math.PI / 8, eaveColor, false);
      this.addCylinder(cx, curY + 0.85, cz, r * 0.68, r * 0.66, 0.95, 8, Math.PI / 8, bodyColor, i % 2 === 0);
      curY += 1.8;
    }
    this.addCylinder(cx, curY, cz, eaveR * 0.44, 0.35, spireH, 8, 0, [242, 198, 72], true);
  }

  /**
   * Adds a Tibetan-style White Dagoba (`藏式覆钵白塔` for Beihai White Dagoba & Miaoying White Dagoba).
   */
  addWhiteDagoba(cx, y0, cz, baseW, baseH, bellyR, bellyH, spireH) {
    const white = [245, 244, 238];
    const gold = [238, 190, 58];
    // 3-stepped cross-shaped Sumeru pedestal (`折角须弥座`)
    this.addBox(cx, y0, cz, baseW, baseH * 0.42, baseW, 0, white, false);
    this.addBox(cx, y0 + baseH * 0.42, cz, baseW * 0.84, baseH * 0.32, baseW * 0.84, 0, white, false);
    this.addBox(cx, y0 + baseH * 0.74, cz, baseW * 0.70, baseH * 0.26, baseW * 0.70, 0, [255, 228, 158], true);

    // 3 lotus petal rings + bulbous inverted-bowl belly (`覆钵塔身`)
    let curY = y0 + baseH;
    this.addCylinder(cx, curY, cz, bellyR * 0.84, bellyR * 1.02, bellyH * 0.26, 16, 0, white, false);
    this.addCylinder(cx, curY + bellyH * 0.26, cz, bellyR * 1.02, bellyR * 0.96, bellyH * 0.38, 16, 0, white, false);
    this.addCylinder(cx, curY + bellyH * 0.64, cz, bellyR * 0.96, bellyR * 0.56, bellyH * 0.36, 16, 0, white, false);
    // South-facing ceremonial眼光门 shrine emblem
    this.addBox(cx, curY + bellyH * 0.36, cz + bellyR * 0.96, 2.4, 3.2, 0.6, 0, [212, 62, 48], true);

    // 13-ring conical Dharmachakra neck (`十三天相轮`) + gilded bronze canopy (`华盖`) +宝顶 finial
    curY += bellyH;
    this.addCylinder(cx, curY, cz, bellyR * 0.44, bellyR * 0.28, spireH * 0.68, 12, 0, [224, 178, 76], true);
    this.addCylinder(cx, curY + spireH * 0.68, cz, bellyR * 0.54, bellyR * 0.54, spireH * 0.10, 16, 0, gold, true);
    this.addCylinder(cx, curY + spireH * 0.78, cz, bellyR * 0.22, 0.2, spireH * 0.22, 12, 0, gold, true);
  }

  toGeometryArrays() {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.norm),
      colors: new Uint8Array(this.col),
      indices: new Uint32Array(this.idx),
    };
  }
}
