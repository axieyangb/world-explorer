/**
 * Beijing Explorer - Batch 02 Landmarks: Forbidden City Three Great Halls & North Gate
 *
 * 1. Hall of Supreme Harmony (太和殿 - taihedian)
 * 2. Hall of Central Harmony (中和殿 - zhonghedian)
 * 3. Hall of Preserving Harmony (保和殿 - baohedian)
 * 4. Gate of Divine Prowess (神武门 - shenwumen)
 */

const C_GOLD_ROOF = [232, 176, 38];
const C_GOLD_RIDGE = [248, 208, 68];
const C_ROOF_TRIM = [218, 160, 32];
const C_VERMILION = [176, 42, 38];
const C_WALL_RED = [162, 38, 34];
const C_COLUMN_RED = [196, 46, 38];
const C_DOUGONG_GREEN = [42, 118, 96];
const C_MARBLE = [242, 239, 232];
const C_MARBLE_BAL = [250, 248, 242];
const C_MARBLE_SHADOW = [224, 220, 212];
const C_DRAGON_STONE = [230, 228, 222];
const C_DRAGON_ACCENT = [210, 206, 198];
const C_BRONZE = [64, 58, 52];
const C_GILT_BRONZE = [228, 180, 58];
const C_GATE_DARK = [32, 24, 24];
const C_LANTERN_WARM = [255, 208, 115];
const C_GOLD_GLOW = [255, 224, 138];
const C_PLAQUE_BLUE = [24, 48, 108];
const C_BRICK_GREY = [120, 122, 126];

/**
 * Perimeter white marble balustrades with corner watchposts
 */
function addPerimeterBalustrades(b, cx, cz, sx, sz, y, balH = 1.05, balW = 0.45, color = C_MARBLE_BAL) {
  const hw = sx * 0.5 - balW * 0.5;
  const hd = sz * 0.5 - balW * 0.5;
  b.addBox(cx, y, cz - hd, sx, balH, balW, 0, color, false);
  b.addBox(cx, y, cz + hd, sx, balH, balW, 0, color, false);
  b.addBox(cx - hw, y, cz, balW, balH, sz - balW * 2, 0, color, false);
  b.addBox(cx + hw, y, cz, balW, balH, sz - balW * 2, 0, color, false);

  const postH = balH + 0.22;
  const postW = balW * 1.25;
  for (const sxSign of [-1, 1]) {
    for (const szSign of [-1, 1]) {
      b.addBox(cx + sxSign * hw, y, cz + szSign * hd, postW, postH, postW, 0, color, false);
      b.addCylinder(cx + sxSign * hw, y + postH, cz + szSign * hd, postW * 0.45, postW * 0.15, 0.22, 8, 0, color, false);
    }
  }
}

/**
 * Carved dragon water spouts (螭首 / 千龙吐水) along terrace tier basements
 */
function addDragonSpouts(b, cx, cz, sx, sz, y, countX = 8, countZ = 5) {
  const hw = sx * 0.5;
  const hd = sz * 0.5;
  const spoutW = 0.32, spoutH = 0.24, spoutL = 0.55;
  for (let i = 1; i < countX; i++) {
    const lx = -hw + (i / countX) * sx;
    b.addBox(cx + lx, y, cz + hd + spoutL * 0.5, spoutW, spoutH, spoutL, 0, C_MARBLE_BAL, false);
    b.addBox(cx + lx, y, cz - hd - spoutL * 0.5, spoutW, spoutH, spoutL, 0, C_MARBLE_BAL, false);
  }
  for (let j = 1; j < countZ; j++) {
    const lz = -hd + (j / countZ) * sz;
    b.addBox(cx + hw + spoutL * 0.5, y, cz + lz, spoutL, spoutH, spoutW, 0, C_MARBLE_BAL, false);
    b.addBox(cx - hw - spoutL * 0.5, y, cz + lz, spoutL, spoutH, spoutW, 0, C_MARBLE_BAL, false);
  }
}

/**
 * Precise, mathematically closed sloping stair flight along Z axis
 */
function addStairRampAlongZ(b, cx, y0, zGround, zTop, width, height, color = C_MARBLE_SHADOW, balColor = C_MARBLE_BAL) {
  const xL = cx - width * 0.5;
  const xR = cx + width * 0.5;
  const yTop = y0 + height;

  if (zGround > zTop) {
    // Descends South (+Z)
    b.addQuad(xL, y0, zGround, xR, y0, zGround, xR, yTop, zTop, xL, yTop, zTop, color, false);
    b.addTri(xR, y0, zGround, xR, y0, zTop, xR, yTop, zTop, color, false);
    b.addTri(xL, y0, zGround, xL, yTop, zTop, xL, y0, zTop, color, false);

    const balW = 0.38, balH = 0.95;
    for (const sideSign of [-1, 1]) {
      const bx = cx + sideSign * (width * 0.5 + balW * 0.5);
      const bL = bx - balW * 0.5, bR = bx + balW * 0.5;
      b.addQuad(bL, y0 + balH, zGround, bR, y0 + balH, zGround, bR, yTop + balH, zTop, bL, yTop + balH, zTop, balColor, false);
      b.addQuad(bL, y0, zGround, bL, y0 + balH, zGround, bL, yTop + balH, zTop, bL, yTop, zTop, balColor, false);
      b.addQuad(bR, y0, zGround, bR, yTop, zTop, bR, yTop + balH, zTop, bR, y0 + balH, zGround, balColor, false);
    }
  } else {
    // Descends North (-Z)
    b.addQuad(xR, y0, zGround, xL, y0, zGround, xL, yTop, zTop, xR, yTop, zTop, color, false);
    b.addTri(xR, y0, zGround, xR, yTop, zTop, xR, y0, zTop, color, false);
    b.addTri(xL, y0, zGround, xL, y0, zTop, xL, yTop, zTop, color, false);

    const balW = 0.38, balH = 0.95;
    for (const sideSign of [-1, 1]) {
      const bx = cx + sideSign * (width * 0.5 + balW * 0.5);
      const bL = bx - balW * 0.5, bR = bx + balW * 0.5;
      b.addQuad(bR, y0 + balH, zGround, bL, y0 + balH, zGround, bL, yTop + balH, zTop, bR, yTop + balH, zTop, balColor, false);
      b.addQuad(bL, y0, zGround, bL, yTop, zTop, bL, yTop + balH, zTop, bL, y0 + balH, zGround, balColor, false);
      b.addQuad(bR, y0, zGround, bR, y0 + balH, zGround, bR, yTop + balH, zTop, bR, yTop, zTop, balColor, false);
    }
  }
}

/**
 * Cloud-Dragon imperial ramp (御路丹陛) along Z axis
 */
function addDragonRampAlongZ(b, cx, y0, zGround, zTop, width, height) {
  const xL = cx - width * 0.5;
  const xR = cx + width * 0.5;
  const yTop = y0 + height;
  const yOff = 0.12;

  if (zGround > zTop) {
    b.addQuad(xL, y0 + yOff, zGround, xR, y0 + yOff, zGround, xR, yTop + yOff, zTop, xL, yTop + yOff, zTop, C_DRAGON_STONE, false);
    const cw = width * 0.55;
    b.addQuad(cx - cw * 0.5, y0 + yOff + 0.08, zGround, cx + cw * 0.5, y0 + yOff + 0.08, zGround, cx + cw * 0.5, yTop + yOff + 0.08, zTop, cx - cw * 0.5, yTop + yOff + 0.08, zTop, C_DRAGON_ACCENT, false);
    const gw = width * 0.32;
    b.addQuad(cx - gw * 0.5, y0 + yOff + 0.12, zGround - 0.5, cx + gw * 0.5, y0 + yOff + 0.12, zGround - 0.5, cx + gw * 0.5, yTop + yOff + 0.12, zTop + 0.5, cx - gw * 0.5, yTop + yOff + 0.12, zTop + 0.5, C_GOLD_GLOW, true);
  } else {
    b.addQuad(xR, y0 + yOff, zGround, xL, y0 + yOff, zGround, xL, yTop + yOff, zTop, xR, yTop + yOff, zTop, C_DRAGON_STONE, false);
    const cw = width * 0.55;
    b.addQuad(cx + cw * 0.5, y0 + yOff + 0.08, zGround, cx - cw * 0.5, y0 + yOff + 0.08, zGround, cx - cw * 0.5, yTop + yOff + 0.08, zTop, cx + cw * 0.5, yTop + yOff + 0.08, zTop, C_DRAGON_ACCENT, false);
    const gw = width * 0.32;
    b.addQuad(cx + gw * 0.5, y0 + yOff + 0.12, zGround + 0.5, cx - gw * 0.5, y0 + yOff + 0.12, zGround + 0.5, cx - gw * 0.5, yTop + yOff + 0.12, zTop - 0.5, cx + gw * 0.5, yTop + yOff + 0.12, zTop - 0.5, C_GOLD_GLOW, true);
  }
}

/**
 * Precise sloping stair flight along X axis (for East/West terrace steps)
 */
function addStairRampAlongX(b, xGround, xTop, y0, cz, depth, height, color = C_MARBLE_SHADOW, balColor = C_MARBLE_BAL) {
  const zL = cz - depth * 0.5;
  const zR = cz + depth * 0.5;
  const yTop = y0 + height;

  if (xGround > xTop) {
    // Descends East (+X)
    b.addQuad(xGround, y0, zR, xGround, y0, zL, xTop, yTop, zL, xTop, yTop, zR, color, false);
    b.addTri(xGround, y0, zL, xTop, y0, zL, xTop, yTop, zL, color, false);
    b.addTri(xGround, y0, zR, xTop, yTop, zR, xTop, y0, zR, color, false);

    const balW = 0.38, balH = 0.95;
    for (const sideSign of [-1, 1]) {
      const bz = cz + sideSign * (depth * 0.5 + balW * 0.5);
      const bL = bz - balW * 0.5, bR = bz + balW * 0.5;
      b.addQuad(xGround, y0 + balH, bR, xGround, y0 + balH, bL, xTop, yTop + balH, bL, xTop, yTop + balH, bR, balColor, false);
    }
  } else {
    // Descends West (-X)
    b.addQuad(xGround, y0, zL, xGround, y0, zR, xTop, yTop, zR, xTop, yTop, zL, color, false);
    b.addTri(xGround, y0, zL, xTop, y0, zL, xTop, yTop, zL, color, false);
    b.addTri(xGround, y0, zR, xTop, yTop, zR, xTop, y0, zR, color, false);

    const balW = 0.38, balH = 0.95;
    for (const sideSign of [-1, 1]) {
      const bz = cz + sideSign * (depth * 0.5 + balW * 0.5);
      const bL = bz - balW * 0.5, bR = bz + balW * 0.5;
      b.addQuad(xGround, y0 + balH, bL, xGround, y0 + balH, bR, xTop, yTop + balH, bR, xTop, yTop + balH, bL, balColor, false);
    }
  }
}

/**
 * Authentic Ming/Qing Arched Portal Tunnel through fortress wall (along Z)
 */
function addArchTunnel(b, cx, y0, cz, width, totalH, tunnelD, color = C_GATE_DARK, trimColor = C_MARBLE_SHADOW) {
  const r = width * 0.5;
  const jambH = totalH - r;
  const ySpring = y0 + jambH;

  // Lower rectangular tunnel
  b.addBox(cx, y0, cz, width, jambH, tunnelD, 0, color, false);

  // Arched barrel vault (along Z axis)
  const segs = 8;
  const zH = tunnelD * 0.5;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI - (i / segs) * Math.PI;
    const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
    const x0 = cx + Math.cos(a0) * r, yA0 = ySpring + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, yA1 = ySpring + Math.sin(a1) * r;
    b.addQuad(x0, yA0, -zH + cz, x1, yA1, -zH + cz, x1, yA1, zH + cz, x0, yA0, zH + cz, color, false);

    // Stone arch trim voussoirs on North and South facades
    const rTrim = r + 0.35;
    const tx0 = cx + Math.cos(a0) * rTrim, ty0 = ySpring + Math.sin(a0) * rTrim;
    const tx1 = cx + Math.cos(a1) * rTrim, ty1 = ySpring + Math.sin(a1) * rTrim;
    b.addQuad(x0, yA0, -zH + cz - 0.05, tx0, ty0, -zH + cz - 0.05, tx1, ty1, -zH + cz - 0.05, x1, yA1, -zH + cz - 0.05, trimColor, false);
    b.addQuad(x1, yA1, zH + cz + 0.05, tx1, ty1, zH + cz + 0.05, tx0, ty0, zH + cz + 0.05, x0, yA0, zH + cz + 0.05, trimColor, false);
  }
}

/**
 * Authentic Double-Eave Hip-and-Gable Roof (重檐歇山顶) with distinct triangular gables (山花) on East & West
 */
function addXieshanUpperRoof(b, cx, y0, cz, sx, sz, roofH, overhang, roofColor, trimColor, ridgeColor) {
  // 1. Dougong frieze and under-eave lantern strip
  b.addBox(cx, y0 - 0.8, cz, sx + 0.4, 0.65, sz + 0.4, 0, C_DOUGONG_GREEN, false);
  b.addBox(cx, y0 - 0.22, cz, sx + 0.7, 0.25, sz + 0.7, 0, C_LANTERN_WARM, true);

  // 2. Lower flared hip eave skirt
  const w0 = sx + overhang * 2.1;
  const d0 = sz + overhang * 2.1;
  const w1 = sx + overhang * 0.8;
  const d1 = sz + overhang * 0.8;
  const w2 = sx * 0.72;
  const ridgeW = sx * 0.64; // Gables taper inward gently toward the main ridge
  const d2 = sz * 0.42;

  const h1 = roofH * 0.22;
  const h2 = roofH * 0.64;

  // Eave trim and lower slope
  b.addFrustumBox(cx, y0, cz, w0 + 0.4, d0 + 0.4, w0, d0, 0.35, 0, trimColor, false, false);
  b.addFrustumBox(cx, y0 + 0.3, cz, w0, d0, w1, d1, h1, 0, roofColor, false, false);
  b.addFrustumBox(cx, y0 + 0.3 + h1, cz, w1, d1, w2, d2, h2 - h1, 0, roofColor, false, false);

  // 3. Upper Xieshan Structure: South & North sloped faces
  const yHip = y0 + 0.3 + h2;
  const yApex = y0 + 0.3 + roofH;
  const ridgeD = 0.85;

  // South roof slope (trapezoid)
  b.addQuad(
    cx - w2 * 0.5, yHip, cz + d2 * 0.5,
    cx + w2 * 0.5, yHip, cz + d2 * 0.5,
    cx + ridgeW * 0.5, yApex, cz + ridgeD * 0.5,
    cx - ridgeW * 0.5, yApex, cz + ridgeD * 0.5,
    roofColor, false
  );

  // North roof slope (trapezoid)
  b.addQuad(
    cx + w2 * 0.5, yHip, cz - d2 * 0.5,
    cx - w2 * 0.5, yHip, cz - d2 * 0.5,
    cx - ridgeW * 0.5, yApex, cz - ridgeD * 0.5,
    cx + ridgeW * 0.5, yApex, cz - ridgeD * 0.5,
    roofColor, false
  );

  // East & West recessed vertical triangular gable walls (山花) + sloped verge boards
  for (const endSign of [-1, 1]) {
    const gxBot = cx + endSign * (w2 * 0.5 - 0.35);
    const gxTop = cx + endSign * (ridgeW * 0.5);
    if (endSign > 0) {
      b.addTri(gxBot, yHip, cz - d2 * 0.5, gxBot, yHip, cz + d2 * 0.5, gxTop, yApex, cz, C_WALL_RED, false);
      b.addStrut(cx + w2 * 0.5, yHip, cz - d2 * 0.5, gxTop, yApex, cz, 0.32, C_ROOF_TRIM, false);
      b.addStrut(cx + w2 * 0.5, yHip, cz + d2 * 0.5, gxTop, yApex, cz, 0.32, C_ROOF_TRIM, false);
      b.addBox((gxBot + gxTop) * 0.5 + 0.08, yApex - (yApex - yHip) * 0.45, cz, 0.18, (yApex - yHip) * 0.42, 1.2, 0, C_GOLD_RIDGE, true);
    } else {
      b.addTri(gxBot, yHip, cz + d2 * 0.5, gxBot, yHip, cz - d2 * 0.5, gxTop, yApex, cz, C_WALL_RED, false);
      b.addStrut(cx - w2 * 0.5, yHip, cz + d2 * 0.5, gxTop, yApex, cz, 0.32, C_ROOF_TRIM, false);
      b.addStrut(cx - w2 * 0.5, yHip, cz - d2 * 0.5, gxTop, yApex, cz, 0.32, C_ROOF_TRIM, false);
      b.addBox((gxBot + gxTop) * 0.5 - 0.08, yApex - (yApex - yHip) * 0.45, cz, 0.18, (yApex - yHip) * 0.42, 1.2, 0, C_GOLD_RIDGE, true);
    }
  }

  // 4. Main Ridge Beam (正脊) and Golden Chiwen Finials (鸱吻)
  b.addBox(cx, yApex - 0.1, cz, ridgeW + 0.6, 0.75, ridgeD, 0, ridgeColor, false);
  for (const endSign of [-1, 1]) {
    const fx = cx + endSign * (ridgeW * 0.48);
    b.addBox(fx, yApex + 0.48, cz, 1.15, 1.5, 1.15, 0, [255, 218, 88], true);
  }
}

export const BATCH_02 = [
  // =========================================================================
  // 1. Hall of Supreme Harmony (太和殿 - taihedian)
  // =========================================================================
  {
    id: 'taihedian',
    nameZh: '太和殿',
    nameEn: 'Hall of Supreme Harmony',
    category: 'imperial',
    cx: -578,
    cz: -796,
    exclR: 85,
    height: 36,
    osmIds: [8854043, 40168674],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // -----------------------------------------------------------------------
      // 1. Grand 3-Tier White Hanbaiyu Marble Xumi Terrace (88x56m base, 8.2m high)
      // -----------------------------------------------------------------------
      const tierH1 = 2.7, tierH2 = 2.7, tierH3 = 2.8;
      const t1Y = y0;
      const t2Y = y0 + tierH1;
      const t3Y = t2Y + tierH2;
      const terraceTop = t3Y + tierH3; // y0 + 8.2m

      // Tier 1 (Bottom): 88m x 56m x 2.7m
      b.addBox(cx, t1Y, cz, 88.0, tierH1, 56.0, 0, C_MARBLE, false);
      b.addBox(cx, t1Y + tierH1 * 0.4, cz, 88.6, tierH1 * 0.2, 56.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 88.0, 56.0, t2Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 88.0, 56.0, t2Y, 14, 9);

      // Tier 2 (Middle): 82m x 50m x 2.7m
      b.addBox(cx, t2Y, cz, 82.0, tierH2, 50.0, 0, C_MARBLE, false);
      b.addBox(cx, t2Y + tierH2 * 0.4, cz, 82.6, tierH2 * 0.2, 50.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 82.0, 50.0, t3Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 82.0, 50.0, t3Y, 12, 7);

      // Tier 3 (Top): 76m x 44m x 2.8m
      b.addBox(cx, t3Y, cz, 76.0, tierH3, 44.0, 0, C_MARBLE, false);
      b.addBox(cx, t3Y + tierH3 * 0.4, cz, 76.6, tierH3 * 0.2, 44.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 76.0, 44.0, terraceTop, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 76.0, 44.0, terraceTop, 11, 6);

      // -----------------------------------------------------------------------
      // 2. South Triple Imperial Flight Staircase (三出陛阶)
      // Descends smoothly from cz + 22.0 to cz + 37.0
      // -----------------------------------------------------------------------
      const sTopZ = cz + 22.0, sGndZ = cz + 37.0;
      addDragonRampAlongZ(b, cx, y0, sGndZ, sTopZ, 4.4, 8.2);
      addStairRampAlongZ(b, cx - 3.4, y0, sGndZ, sTopZ, 2.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 3.4, y0, sGndZ, sTopZ, 2.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // Left & Right imperial stair flights (左阶、右阶)
      addStairRampAlongZ(b, cx - 8.6, y0, sGndZ, sTopZ, 3.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 8.6, y0, sGndZ, sTopZ, 3.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 3. North Triple Imperial Flight Staircase (北三出阶)
      // Descends smoothly from cz - 22.0 to cz - 37.0
      // -----------------------------------------------------------------------
      const nTopZ = cz - 22.0, nGndZ = cz - 37.0;
      addDragonRampAlongZ(b, cx, y0, nGndZ, nTopZ, 4.4, 8.2);
      addStairRampAlongZ(b, cx - 3.4, y0, nGndZ, nTopZ, 2.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 3.4, y0, nGndZ, nTopZ, 2.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx - 8.6, y0, nGndZ, nTopZ, 3.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 8.6, y0, nGndZ, nTopZ, 3.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 4. East and West Side Terrace Stair Flights (东西两阶)
      // -----------------------------------------------------------------------
      addStairRampAlongX(b, cx + 45.0, cx + 41.0, y0, cz, 9.0, 5.4, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongX(b, cx - 45.0, cx - 41.0, y0, cz, 9.0, 5.4, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 5. Main Imperial Palace Hall: 11 Bays Wide x 5 Bays Deep (64x37m)
      // -----------------------------------------------------------------------
      const hallW = 64.0, hallD = 37.0, wallH = 14.5, roofH = 13.8;

      b.addBox(cx, terraceTop, cz, hallW * 0.94, wallH, hallD * 0.94, 0, C_WALL_RED, false);

      // Vermilion colonnade: 12 columns in front and rear (11 bays), 6 on sides (5 bays)
      const nBaysX = 11, nBaysZ = 5;
      for (let i = 0; i <= nBaysX; i++) {
        const lx = -hallW * 0.48 + (i / nBaysX) * hallW * 0.96;
        for (const zSign of [-1, 1]) {
          const lz = zSign * hallD * 0.48;
          b.addCylinder(cx + lx, terraceTop, cz + lz, 0.52, 0.48, wallH, 8, 0, C_COLUMN_RED, false, false);
          if (i < nBaysX) {
            const midLx = lx + (hallW * 0.96) / (nBaysX * 2);
            b.addBox(cx + midLx, terraceTop + wallH * 0.18, cz + zSign * (hallD * 0.475), 4.2, wallH * 0.62, 0.35, 0, C_GOLD_GLOW, true);
          }
        }
      }
      for (let j = 1; j < nBaysZ; j++) {
        const lz = -hallD * 0.48 + (j / nBaysZ) * hallD * 0.96;
        for (const xSign of [-1, 1]) {
          b.addCylinder(cx + xSign * (hallW * 0.48), terraceTop, cz + lz, 0.52, 0.48, wallH, 8, 0, C_COLUMN_RED, false, false);
        }
      }

      // Emerald Dougong beam band
      b.addBox(cx, terraceTop + wallH * 0.56, cz, hallW * 0.98, 0.75, hallD * 0.98, 0, C_DOUGONG_GREEN, false);

      // -----------------------------------------------------------------------
      // 6. Double-Eave Golden Hip Roof (重檐庑殿顶)
      // -----------------------------------------------------------------------
      const lowRoofY = terraceTop + wallH * 0.58;
      b.addChineseRoof(cx, lowRoofY, cz, hallW * 1.05, hallD * 1.05, roofH * 0.38, 3.2, 0, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_ROOF);

      // Upper Clerestory Wall
      const clerestoryY = lowRoofY + roofH * 0.22;
      const clereW = hallW * 0.84, clereD = hallD * 0.84, clereH = wallH * 0.46;
      b.addBox(cx, clerestoryY, cz, clereW, clereH, clereD, 0, C_WALL_RED, false);

      // Imperial Inscribed Plaque "建极绥猷" (affixed directly to South upper clerestory wall)
      const plaqueZ = cz + clereD * 0.5 + 0.12;
      const plaqueY = clerestoryY + clereH * 0.48;
      b.addBox(cx, plaqueY, plaqueZ, 5.2, 2.6, 0.22, 0, C_GOLD_RIDGE, true);
      b.addBox(cx, plaqueY, plaqueZ + 0.08, 4.6, 2.2, 0.18, 0, C_PLAQUE_BLUE, true);

      // Upper Main Hip Roof (上檐大庑殿顶)
      const upRoofY = terraceTop + wallH + roofH * 0.14;
      b.addChineseRoof(cx, upRoofY, cz, hallW * 0.88, hallD * 0.88, roofH * 0.82, 3.6, 0, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_RIDGE);

      // -----------------------------------------------------------------------
      // 7. Ceremonial Court Furnishings on the Upper Terrace
      // -----------------------------------------------------------------------
      // 18 Bronze Tripod Dings (18省铜鼎) along East and West terrace edges
      for (let i = 0; i < 9; i++) {
        const lz = -17.0 + i * 4.25;
        for (const lx of [-35.0, 35.0]) {
          b.addBox(cx + lx, terraceTop, cz + lz, 1.1, 0.4, 1.1, 0, C_MARBLE_SHADOW, false);
          b.addCylinder(cx + lx, terraceTop + 0.4, cz + lz, 0.55, 0.65, 0.85, 8, 0, C_BRONZE, false);
          b.addBox(cx + lx - 0.48, terraceTop + 1.0, cz + lz, 0.12, 0.35, 0.2, 0, C_BRONZE, false);
          b.addBox(cx + lx + 0.48, terraceTop + 1.0, cz + lz, 0.12, 0.35, 0.2, 0, C_BRONZE, false);
          b.addBox(cx + lx, terraceTop + 1.2, cz + lz, 0.3, 0.1, 0.3, 0, [255, 145, 60], true);
        }
      }

      // Bronze Cranes & Tortoises (铜鹤铜龟) in front of the South facade
      for (const sx of [-22, 22]) {
        // Bronze Tortoise (铜龟)
        b.addBox(cx + sx, terraceTop, cz + 20, 2.0, 0.55, 2.4, 0, C_MARBLE_SHADOW, false);
        b.addEllipticalSlice(cx + sx, terraceTop + 0.55, cz + 20, 0.85, 1.15, 0.65, 0.95, 0.65, 8, 0, C_BRONZE, false);
        b.addCylinder(cx + sx, terraceTop + 0.9, cz + 20.8, 0.18, 0.15, 0.55, 6, 0.45, C_BRONZE, false);

        // Bronze Crane (铜鹤)
        b.addBox(cx + sx * 0.72, terraceTop, cz + 20, 1.3, 0.55, 1.3, 0, C_MARBLE_SHADOW, false);
        b.addCylinder(cx + sx * 0.72, terraceTop + 0.55, cz + 20, 0.14, 0.12, 1.9, 6, 0, C_BRONZE, false);
        b.addEllipticalSlice(cx + sx * 0.72, terraceTop + 2.0, cz + 20, 0.45, 0.6, 0.35, 0.5, 0.55, 6, 0, C_BRONZE, false);
      }

      // Southeast: Sundial (日晷)
      b.addBox(cx + 27, terraceTop, cz + 17, 1.5, 1.3, 1.5, 0, C_MARBLE, false);
      b.addCylinder(cx + 27, terraceTop + 1.3, cz + 17, 0.75, 0.75, 0.22, 12, 0.7, C_MARBLE_SHADOW, false);
      b.addStrut(cx + 27, terraceTop + 1.4, cz + 17, cx + 27, terraceTop + 2.05, cz + 16.5, 0.08, C_GILT_BRONZE, true);

      // Southwest: Standard Grain Measure (嘉量)
      b.addBox(cx - 27, terraceTop, cz + 17, 1.8, 1.2, 1.8, 0, C_MARBLE, false);
      b.addBox(cx - 27, terraceTop + 1.2, cz + 17, 1.4, 0.9, 1.4, 0, C_MARBLE_SHADOW, false);
      b.addFrustumBox(cx - 27, terraceTop + 2.1, cz + 17, 1.8, 1.8, 0.25, 0.25, 0.75, 0, C_GOLD_ROOF, true);

      // 4 Large Gilded Bronze Fire Vats (鎏金铜缸)
      for (const vx of [-13, 13]) {
        for (const vz of [17, 21]) {
          b.addBox(cx + vx, terraceTop, cz + vz, 1.8, 0.35, 1.8, 0, C_MARBLE_SHADOW, false);
          b.addCylinder(cx + vx, terraceTop + 0.35, cz + vz, 0.88, 0.78, 1.15, 12, 0, C_GILT_BRONZE, false);
          b.addCylinder(cx + vx, terraceTop + 1.4, cz + vz, 0.96, 0.96, 0.15, 12, 0, C_GOLD_RIDGE, true);
        }
      }
    },
  },

  // =========================================================================
  // 2. Hall of Central Harmony (中和殿 - zhonghedian)
  // =========================================================================
  {
    id: 'zhonghedian',
    nameZh: '中和殿',
    nameEn: 'Hall of Central Harmony',
    category: 'imperial',
    cx: -573,
    cz: -863,
    exclR: 38,
    height: 24,
    osmIds: [8854349, 40168675],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // -----------------------------------------------------------------------
      // 1. 3-Tier Square White Marble Terrace (8.2m high)
      // -----------------------------------------------------------------------
      const tierH1 = 2.7, tierH2 = 2.7, tierH3 = 2.8;
      const t1Y = y0;
      const t2Y = y0 + tierH1;
      const t3Y = t2Y + tierH2;
      const terraceTop = t3Y + tierH3; // y0 + 8.2m

      // Tier 1 (Bottom): 44m x 44m x 2.7m
      b.addBox(cx, t1Y, cz, 44.0, tierH1, 44.0, 0, C_MARBLE, false);
      b.addBox(cx, t1Y + tierH1 * 0.4, cz, 44.5, tierH1 * 0.2, 44.5, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 44.0, 44.0, t2Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 44.0, 44.0, t2Y, 7, 7);

      // Tier 2 (Middle): 38m x 38m x 2.7m
      b.addBox(cx, t2Y, cz, 38.0, tierH2, 38.0, 0, C_MARBLE, false);
      b.addBox(cx, t2Y + tierH2 * 0.4, cz, 38.5, tierH2 * 0.2, 38.5, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 38.0, 38.0, t3Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 38.0, 38.0, t3Y, 6, 6);

      // Tier 3 (Top): 32m x 32m x 2.8m
      b.addBox(cx, t3Y, cz, 32.0, tierH3, 32.0, 0, C_MARBLE, false);
      b.addBox(cx, t3Y + tierH3 * 0.4, cz, 32.5, tierH3 * 0.2, 32.5, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 32.0, 32.0, terraceTop, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 32.0, 32.0, terraceTop, 5, 5);

      // -----------------------------------------------------------------------
      // 2. Authentic Four-Sided Staircases ("四面出阶")
      // South & North have 3 flights each; East & West have 1 central flight
      // -----------------------------------------------------------------------
      const sTopZ = cz + 16.0, sGndZ = cz + 26.0;
      addDragonRampAlongZ(b, cx, y0, sGndZ, sTopZ, 3.6, 8.2);
      addStairRampAlongZ(b, cx - 4.8, y0, sGndZ, sTopZ, 2.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 4.8, y0, sGndZ, sTopZ, 2.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      const nTopZ = cz - 16.0, nGndZ = cz - 26.0;
      addDragonRampAlongZ(b, cx, y0, nGndZ, nTopZ, 3.6, 8.2);
      addStairRampAlongZ(b, cx - 4.8, y0, nGndZ, nTopZ, 2.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 4.8, y0, nGndZ, nTopZ, 2.6, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // East & West (1 central flight each descending from terraceTop to ground)
      addStairRampAlongX(b, cx + 26.0, cx + 16.0, y0, cz, 5.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongX(b, cx - 26.0, cx - 16.0, y0, cz, 5.4, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 3. 4 Bronze Incense Burners (铜香炉) on the Terrace Corners
      // -----------------------------------------------------------------------
      for (const [bx, bz] of [[-13, -13], [13, -13], [13, 13], [-13, 13]]) {
        b.addBox(cx + bx, terraceTop, cz + bz, 1.0, 0.35, 1.0, 0, C_MARBLE_SHADOW, false);
        b.addCylinder(cx + bx, terraceTop + 0.35, cz + bz, 0.52, 0.6, 0.78, 8, 0, C_BRONZE, false);
        b.addBox(cx + bx, terraceTop + 1.1, cz + bz, 0.28, 0.08, 0.28, 0, [255, 145, 60], true);
      }

      // -----------------------------------------------------------------------
      // 4. Square Vermilion Hall (3 bays x 3 bays, 21x21m, wallH 8.2m)
      // -----------------------------------------------------------------------
      const wallH = 8.2;
      b.addBox(cx, terraceTop, cz, 20.2, wallH, 20.2, 0, C_WALL_RED, false);

      // Vermilion perimeter columns & lattice doors (4 columns per side = 3 bays)
      for (let i = 0; i <= 3; i++) {
        const u = -9.8 + (i / 3) * 19.6;
        for (const zSign of [-1, 1]) {
          b.addCylinder(cx + u, terraceTop, cz + zSign * 10.1, 0.46, 0.42, wallH, 8, 0, C_COLUMN_RED, false);
          if (i < 3) {
            const midU = u + 19.6 / 6;
            b.addBox(cx + midU, terraceTop + wallH * 0.2, cz + zSign * 10.05, 4.4, wallH * 0.6, 0.35, 0, C_GOLD_GLOW, true);
          }
        }
        for (const xSign of [-1, 1]) {
          b.addCylinder(cx + xSign * 10.1, terraceTop, cz + u, 0.46, 0.42, wallH, 8, 0, C_COLUMN_RED, false);
          if (i < 3) {
            const midU = u + 19.6 / 6;
            b.addBox(cx + xSign * 10.05, terraceTop + wallH * 0.2, cz + midU, 0.35, wallH * 0.6, 4.4, 0, C_GOLD_GLOW, true);
          }
        }
      }

      // Emerald-blue painted Dougong beam band
      b.addBox(cx, terraceTop + wallH - 0.75, cz, 21.6, 0.65, 21.6, 0, C_DOUGONG_GREEN, false);
      b.addBox(cx, terraceTop + wallH - 0.2, cz, 22.2, 0.25, 22.2, 0, C_LANTERN_WARM, true);

      // -----------------------------------------------------------------------
      // 5. Authentic Square Single-Eave Pyramidal Roof (单檐四角攒尖顶)
      // -----------------------------------------------------------------------
      const roofBaseY = terraceTop + wallH;
      // Flared eave trim skirt with upturned corners
      b.addFrustumBox(cx, roofBaseY, cz, 28.5, 28.5, 27.2, 27.2, 0.45, 0, C_ROOF_TRIM, false);
      // Tier 1 gentle lower slope
      b.addFrustumBox(cx, roofBaseY + 0.4, cz, 27.2, 27.2, 17.5, 17.5, 2.2, 0, C_GOLD_ROOF, false);
      // Tier 2 mid concave slope
      b.addFrustumBox(cx, roofBaseY + 2.5, cz, 17.5, 17.5, 4.5, 4.5, 3.8, 0, C_GOLD_ROOF, false);
      // Tier 3 upper ridge collar
      b.addFrustumBox(cx, roofBaseY + 6.2, cz, 4.5, 4.5, 1.8, 1.8, 0.8, 0, C_GOLD_RIDGE, false);

      // -----------------------------------------------------------------------
      // 6. Crowning Gilded Spherical Treasure Finial (鎏金宝顶)
      // -----------------------------------------------------------------------
      const apexY = roofBaseY + 7.0;
      b.addCylinder(cx, apexY, cz, 1.4, 1.15, 0.45, 12, 0, C_GILT_BRONZE, false);
      b.addCylinder(cx, apexY + 0.45, cz, 1.25, 1.25, 1.25, 16, 0, C_GOLD_RIDGE, true);
      b.addCylinder(cx, apexY + 1.7, cz, 0.95, 0.15, 0.95, 12, 0, [255, 232, 105], true);
    },
  },

  // =========================================================================
  // 3. Hall of Preserving Harmony (保和殿 - baohedian)
  // =========================================================================
  {
    id: 'baohedian',
    nameZh: '保和殿',
    nameEn: 'Hall of Preserving Harmony',
    category: 'imperial',
    cx: -580,
    cz: -921,
    exclR: 68,
    height: 30,
    osmIds: [8854507, 40168673],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // -----------------------------------------------------------------------
      // 1. Northern 3-Tier White Marble Terrace (68x42m base, 8.2m high)
      // -----------------------------------------------------------------------
      const tierH1 = 2.7, tierH2 = 2.7, tierH3 = 2.8;
      const t1Y = y0;
      const t2Y = y0 + tierH1;
      const t3Y = t2Y + tierH2;
      const terraceTop = t3Y + tierH3; // y0 + 8.2m

      // Tier 1 (Bottom): 68m x 42m x 2.7m
      b.addBox(cx, t1Y, cz, 68.0, tierH1, 42.0, 0, C_MARBLE, false);
      b.addBox(cx, t1Y + tierH1 * 0.4, cz, 68.6, tierH1 * 0.2, 42.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 68.0, 42.0, t2Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 68.0, 42.0, t2Y, 11, 7);

      // Tier 2 (Middle): 62m x 36m x 2.7m
      b.addBox(cx, t2Y, cz, 62.0, tierH2, 36.0, 0, C_MARBLE, false);
      b.addBox(cx, t2Y + tierH2 * 0.4, cz, 62.6, tierH2 * 0.2, 36.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 62.0, 36.0, t3Y, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 62.0, 36.0, t3Y, 10, 6);

      // Tier 3 (Top): 56m x 30m x 2.8m
      b.addBox(cx, t3Y, cz, 56.0, tierH3, 30.0, 0, C_MARBLE, false);
      b.addBox(cx, t3Y + tierH3 * 0.4, cz, 56.6, tierH3 * 0.2, 30.6, 0, C_MARBLE_SHADOW, false);
      addPerimeterBalustrades(b, cx, cz, 56.0, 30.0, terraceTop, 1.05, 0.45, C_MARBLE_BAL);
      addDragonSpouts(b, cx, cz, 56.0, 30.0, terraceTop, 9, 5);

      // -----------------------------------------------------------------------
      // 2. South Triple Imperial Flight Staircase
      // Descends smoothly from cz + 15.0 to cz + 28.0
      // -----------------------------------------------------------------------
      const sTopZ = cz + 15.0, sGndZ = cz + 28.0;
      addDragonRampAlongZ(b, cx, y0, sGndZ, sTopZ, 4.0, 8.2);
      addStairRampAlongZ(b, cx - 3.2, y0, sGndZ, sTopZ, 2.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 3.2, y0, sGndZ, sTopZ, 2.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx - 7.5, y0, sGndZ, sTopZ, 3.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 7.5, y0, sGndZ, sTopZ, 3.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 3. Colossal "Cloud and Dragon" Large Stone Carving (云龙大石雕) on North Ramp
      // 16.5m long, 3.8m wide, China's largest monolithic marble carving!
      // -----------------------------------------------------------------------
      const nTopZ = cz - 15.0, nGndZ = cz - 32.0;
      addDragonRampAlongZ(b, cx, y0, nGndZ, nTopZ, 4.0, 8.2);

      // Flanking stone stair flights with balustrades
      addStairRampAlongZ(b, cx - 4.6, y0, nGndZ, nTopZ, 3.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongZ(b, cx + 4.6, y0, nGndZ, nTopZ, 3.2, 8.2, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // East and West side stairs
      addStairRampAlongX(b, cx + 34.0, cx + 30.0, y0, cz, 8.0, 5.4, C_MARBLE_SHADOW, C_MARBLE_BAL);
      addStairRampAlongX(b, cx - 34.0, cx - 30.0, y0, cz, 8.0, 5.4, C_MARBLE_SHADOW, C_MARBLE_BAL);

      // -----------------------------------------------------------------------
      // 4. Main Palace Hall: 9 Bays Wide x 5 Bays Deep (52x26m)
      // -----------------------------------------------------------------------
      const hallW = 52.0, hallD = 26.0, wallH = 12.0, roofH = 10.5;

      b.addBox(cx, terraceTop, cz, hallW * 0.94, wallH, hallD * 0.94, 0, C_WALL_RED, false);

      // Colonnade: 10 columns along front and rear (9 bays), 6 along sides (5 bays)
      const nBaysX = 9, nBaysZ = 5;
      for (let i = 0; i <= nBaysX; i++) {
        const lx = -hallW * 0.48 + (i / nBaysX) * hallW * 0.96;
        for (const zSign of [-1, 1]) {
          const lz = zSign * hallD * 0.48;
          b.addCylinder(cx + lx, terraceTop, cz + lz, 0.48, 0.44, wallH, 8, 0, C_COLUMN_RED, false, false);
          if (i < nBaysX) {
            const midLx = lx + (hallW * 0.96) / (nBaysX * 2);
            b.addBox(cx + midLx, terraceTop + wallH * 0.18, cz + zSign * (hallD * 0.475), 4.0, wallH * 0.62, 0.35, 0, C_GOLD_GLOW, true);
          }
        }
      }
      for (let j = 1; j < nBaysZ; j++) {
        const lz = -hallD * 0.48 + (j / nBaysZ) * hallD * 0.96;
        for (const xSign of [-1, 1]) {
          b.addCylinder(cx + xSign * (hallW * 0.48), terraceTop, cz + lz, 0.48, 0.44, wallH, 8, 0, C_COLUMN_RED, false, false);
        }
      }

      // Emerald Dougong beam band
      b.addBox(cx, terraceTop + wallH * 0.58, cz, hallW * 0.98, 0.7, hallD * 0.98, 0, C_DOUGONG_GREEN, false);

      // -----------------------------------------------------------------------
      // 5. Authentic Double-Eave Hip-and-Gable Roof (重檐歇山顶)
      // -----------------------------------------------------------------------
      // Lower Eave (腰檐)
      const lowRoofY = terraceTop + wallH * 0.58;
      b.addChineseRoof(cx, lowRoofY, cz, hallW * 1.05, hallD * 1.05, roofH * 0.38, 2.8, 0, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_ROOF);

      // Upper Clerestory Wall
      const clerestoryY = lowRoofY + roofH * 0.22;
      const clereW = hallW * 0.84, clereD = hallD * 0.84, clereH = wallH * 0.44;
      b.addBox(cx, clerestoryY, cz, clereW, clereH, clereD, 0, C_WALL_RED, false);

      // Imperial Inscribed Plaque "皇建有极" (South upper clerestory wall)
      const plaqueZ = cz + clereD * 0.5 + 0.12;
      const plaqueY = clerestoryY + clereH * 0.48;
      b.addBox(cx, plaqueY, plaqueZ, 4.6, 2.4, 0.2, 0, C_GOLD_RIDGE, true);
      b.addBox(cx, plaqueY, plaqueZ + 0.08, 4.0, 2.0, 0.16, 0, C_PLAQUE_BLUE, true);

      // Upper Main Xieshan Roof with East & West triangular gables (歇山山花)
      const upRoofY = terraceTop + wallH + roofH * 0.12;
      addXieshanUpperRoof(b, cx, upRoofY, cz, hallW * 0.86, hallD * 0.86, roofH * 0.84, 3.2, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_RIDGE);

      // -----------------------------------------------------------------------
      // 6. 4 Bronze Incense Burners (铜香炉) on the Terrace Corners
      // -----------------------------------------------------------------------
      for (const [bx, bz] of [[-25, -13], [25, -13], [25, 13], [-25, 13]]) {
        b.addBox(cx + bx, terraceTop, cz + bz, 0.95, 0.35, 0.95, 0, C_MARBLE_SHADOW, false);
        b.addCylinder(cx + bx, terraceTop + 0.35, cz + bz, 0.52, 0.6, 0.78, 8, 0, C_BRONZE, false);
        b.addBox(cx + bx, terraceTop + 1.1, cz + bz, 0.26, 0.08, 0.26, 0, [255, 145, 60], true);
      }
    },
  },

  // =========================================================================
  // 4. Gate of Divine Prowess (神武门 - shenwumen)
  // =========================================================================
  {
    id: 'shenwumen',
    nameZh: '神武门',
    nameEn: 'Gate of Divine Prowess',
    category: 'imperial',
    cx: -591,
    cz: -1357,
    exclR: 55,
    height: 31,
    osmIds: [8858781, 40168692],
    build(b, p1, p2, p3) {
      const cx = p3 !== undefined ? p1 : this.cx;
      const y0 = p3 !== undefined ? p2 : p1;
      const cz = p3 !== undefined ? p3 : this.cz;

      // -----------------------------------------------------------------------
      // 1. Massive Battered Crimson Fortress Bastion (城台 58x24x11.2m)
      // -----------------------------------------------------------------------
      const baseW = 58.0, baseD = 24.0, baseH = 11.2;

      // White marble Xumi pedestal base along bottom of bastion (0 to 1.2m)
      b.addBox(cx, y0, cz, baseW + 1.6, 1.2, baseD + 1.6, 0, C_MARBLE, false);
      b.addBox(cx, y0 + 0.8, cz, baseW + 2.0, 0.35, baseD + 2.0, 0, C_MARBLE_BAL, false);

      // Battered crimson fortress walls
      b.addFrustumBox(cx, y0 + 1.2, cz, baseW, baseD, baseW * 0.93, baseD * 0.93, baseH - 1.2, 0, C_VERMILION, false);

      // White marble balustrade surrounding top terrace of the bastion
      const topTerraceY = y0 + baseH;
      const topW = baseW * 0.93, topD = baseD * 0.93;
      addPerimeterBalustrades(b, cx, cz, topW, topD, topTerraceY, 1.2, 0.45, C_MARBLE_BAL);
      b.addBox(cx, topTerraceY - 0.5, cz, topW * 0.98, 0.25, topD * 0.98, 0, C_LANTERN_WARM, true);

      // -----------------------------------------------------------------------
      // 2. Three Arched Entry Portals (3个券门洞) with Curved Semicircular Arches
      // -----------------------------------------------------------------------
      // Central Imperial Arched Portal
      addArchTunnel(b, cx, y0, cz, 5.4, 7.2, baseD + 1.8, C_GATE_DARK, C_MARBLE_SHADOW);
      b.addBox(cx, y0 + 1.2, cz, 4.4, 0.25, baseD * 0.9, 0, C_LANTERN_WARM, true);

      // Left & Right Arched Portals
      for (const sx of [-13.5, 13.5]) {
        addArchTunnel(b, cx + sx, y0, cz, 4.2, 6.2, baseD + 1.8, C_GATE_DARK, C_MARBLE_SHADOW);
        b.addBox(cx + sx, y0 + 1.0, cz, 3.4, 0.25, baseD * 0.9, 0, C_LANTERN_WARM, true);
      }

      // -----------------------------------------------------------------------
      // 3. Lower North Facade Plaque: "故宫博物院" (above central arch)
      // -----------------------------------------------------------------------
      const plaqueY = y0 + baseH * 0.74;
      const plaqueZ = cz - baseD * 0.47;
      b.addBox(cx, plaqueY, plaqueZ, 7.8, 2.2, 0.22, 0, C_GOLD_RIDGE, true);
      b.addBox(cx, plaqueY, plaqueZ - 0.08, 7.2, 1.8, 0.18, 0, [22, 24, 30], true);

      // -----------------------------------------------------------------------
      // 4. Connecting Forbidden City Defensive Rampart Extensions (East & West)
      // -----------------------------------------------------------------------
      const rampartH = 10.5;
      const rampartD = 14.0;
      for (const wallSign of [-1, 1]) {
        const wx = cx + wallSign * (baseW * 0.5 + 13.0);
        b.addFrustumBox(wx, y0, cz, 26.0, rampartD, 24.5, rampartD * 0.92, rampartH, 0, C_WALL_RED, false);
        b.addBox(wx, y0 + rampartH, cz, 25.5, 1.2, rampartD * 0.92, 0, C_MARBLE_BAL, false);

        // Sloping Horse Ramps (马道) on South side inside the palace
        const rampStart = cz + rampartD * 0.5 + 5.0;
        const rampEnd = cz + rampartD * 0.5;
        addStairRampAlongZ(b, wx, y0, rampStart, rampEnd, 5.0, rampartH, C_BRICK_GREY, C_MARBLE_BAL);
      }

      // -----------------------------------------------------------------------
      // 5. Upper Gatehouse Pavilion Tower: 5 Bays Wide x 1 Bay Deep (38x16m)
      // -----------------------------------------------------------------------
      const hallW = 38.0, hallD = 16.0, hallH = 9.2;
      b.addBox(cx, topTerraceY, cz, hallW * 1.04, 0.8, hallD * 1.04, 0, C_MARBLE, false);
      const pavilionBaseY = topTerraceY + 0.8;

      b.addBox(cx, pavilionBaseY, cz, hallW * 0.92, hallH, hallD * 0.92, 0, C_WALL_RED, false);

      // Perimeter Colonnade: 6 columns on front & back (5 bays), 4 on sides
      const nBaysX = 5, nBaysZ = 3;
      for (let i = 0; i <= nBaysX; i++) {
        const lx = -hallW * 0.46 + (i / nBaysX) * hallW * 0.92;
        for (const zSign of [-1, 1]) {
          const lz = zSign * hallD * 0.47;
          b.addCylinder(cx + lx, pavilionBaseY, cz + lz, 0.44, 0.4, hallH, 8, 0, C_COLUMN_RED, false);
          if (i < nBaysX) {
            const midLx = lx + (hallW * 0.92) / (nBaysX * 2);
            b.addBox(cx + midLx, pavilionBaseY + hallH * 0.18, cz + zSign * (hallD * 0.465), 4.2, hallH * 0.62, 0.32, 0, C_GOLD_GLOW, true);
          }
        }
      }
      for (let j = 1; j < nBaysZ; j++) {
        const lz = -hallD * 0.47 + (j / nBaysZ) * hallD * 0.94;
        for (const xSign of [-1, 1]) {
          b.addCylinder(cx + xSign * (hallW * 0.46), pavilionBaseY, cz + lz, 0.44, 0.4, hallH, 8, 0, C_COLUMN_RED, false);
        }
      }

      // Emerald Dougong beam band
      b.addBox(cx, pavilionBaseY + hallH * 0.56, cz, hallW * 0.96, 0.65, hallD * 0.96, 0, C_DOUGONG_GREEN, false);

      // Upper Facade Plaque: "神武门" (North upper facade)
      const upPlaqueY = pavilionBaseY + hallH * 0.72;
      const upPlaqueZ = cz - hallD * 0.47 - 0.15;
      b.addBox(cx, upPlaqueY, upPlaqueZ, 2.8, 3.8, 0.22, 0, C_GOLD_RIDGE, true);
      b.addBox(cx, upPlaqueY, upPlaqueZ - 0.08, 2.3, 3.3, 0.18, 0, C_PLAQUE_BLUE, true);

      // -----------------------------------------------------------------------
      // 6. Double-Eave Golden Glazed Hip Roof (重檐庑殿顶)
      // Authentic proportions: Lower eave skirt + Upper hip roof (6.6m high, total H ~30.5m)
      // -----------------------------------------------------------------------
      // Lower Eave (腰檐)
      const lowRoofY = pavilionBaseY + hallH * 0.58;
      b.addChineseRoof(cx, lowRoofY, cz, hallW * 1.06, hallD * 1.12, 3.4, 2.6, 0, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_ROOF);

      // Upper Clerestory Wall
      const clereY = lowRoofY + 1.4;
      b.addBox(cx, clereY, cz, hallW * 0.82, hallH * 0.44, hallD * 0.82, 0, C_WALL_RED, false);

      // Upper Main Hip Roof (上檐庑殿顶)
      const upRoofY = pavilionBaseY + hallH + 0.25;
      const upRoofH = 6.6;
      b.addChineseRoof(cx, upRoofY, cz, hallW * 0.88, hallD * 0.95, upRoofH, 3.2, 0, C_GOLD_ROOF, C_ROOF_TRIM, C_GOLD_RIDGE);
    },
  },
];
