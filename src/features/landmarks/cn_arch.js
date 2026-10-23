/**
 * feature/beijing-landmarks — shared procedural kit for traditional Chinese (Ming/Qing imperial) architecture.
 * Used by the Beijing landmark models (Tiananmen, Forbidden City, Qianmen, Jingshan, Temple of Heaven ...).
 *
 * All helpers draw into a landmarks Kit (see kit.js) in model space (metres, +Y up, front = -Z) and respect
 * k.hi (LOD 0 = full detail, LOD 1 = far impostor: no columns / balustrade posts / tile ribs, coarse roofs).
 *
 *   roof(k, x, y, z, hw, hd, rise, { type: "hip" | "xieshan" | "pyramid" | "gable", ... })  curved glazed roof
 *   hall(k, { x, z, w, d, ... })            complete timber hall: columns, walls, doors, brackets, (double) roof
 *   terrace(k, x, y0, z, w, d, h, { ... })  white-marble Xumizuo platform with balustrade + stairs
 *   archWall(k, x, y0, z, w, h, depth, arches)  solid wall/platform pierced by round-arched tunnels
 *   wallRun(k, pts, h, t, { ... })          red perimeter wall with yellow-tile coping along a polyline
 *   lantern(k, x, y, z, s)                  red palace lantern (glow bucket)
 */
const TAU = Math.PI * 2;

export const C = {
  TILE: 0xd9a021, TILE_DK: 0xb07d14, TILE_LT: 0xe8b83a,          // imperial yellow glazed tiles
  BLUE_TILE: 0x1f4f95, BLUE_TILE_DK: 0x173b70,                   // Temple of Heaven
  GREEN_TILE: 0x2f7a4c, GREEN_TILE_DK: 0x245e3a,
  RED: 0xa3231b, RED_DK: 0x7a1a14, WALL: 0x93271f, WALL_DK: 0x6e1f19, // vermilion columns / purple-red walls
  DOOR: 0x8f2418, LATTICE: 0xb9852f,
  MARBLE: 0xebe8df, MARBLE_DK: 0xcac5b8, MARBLE_SH: 0xb3ad9f,       // Han white marble
  BRACKET: 0x2d6a5e, BRACKET_B: 0x2a4f86, BEAM: 0x3d7f72, GOLD: 0xd8ae45,
  GRAY: 0x77736c, BRICK: 0x6f6a63, PAVE: 0xbcb4a6, PAVE_DK: 0xa39b8d,
  LANTERN: 0xff3b1c, LAMP: 0xffd59a,
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Curved Chinese roof over an eave rectangle (half extents hw along x, hd along z) whose eave line is at y.
 *  type  "hip"     庑殿 four slopes + main ridge (highest rank: Taihedian, Wumen)
 *        "xieshan" 歇山 hip-and-gable (Tiananmen, Baohedian, corner pavilions)
 *        "pyramid" 攒尖 square pyramid (Zhonghedian, pavilions); "gable" 悬山 two slopes
 *  o.tEnd   stop at this fraction (0..1) of the rise -> lower "skirt" eave of a double-eave building
 *  o.lift   corner upturn (m), o.ribs tile-row spacing (m, hero roofs only), o.color / o.colorDk tiles
 *  o.wallHw / o.wallHd  soffit closes back to this rectangle (default: 0.72 of the eave extents)
 * Returns { ridgeY, P } (P(t, side, s) -> point on the surface, for callers' ornaments).
 */
export function roof(k, x, y, z, hw, hd, rise, o = {}) {
  const type = o.type || "hip";
  const hi = k.hi && !o.cheap;
  const N = hi ? (o.rings || 7) : 3;
  const M = hi ? (o.seg || 6) : 2;
  const tEnd = o.tEnd ?? 1;
  const lift = o.lift ?? Math.min(1.8, hd * 0.11);
  const tg = o.tg ?? 0.45;
  const G = o.gableHw ?? Math.max(hw * 0.35, hw - hd * tg);
  const rhw = type === "pyramid" ? 0 : (o.ridgeHw ?? Math.max(0.4, hw - hd));
  const col = o.color ?? C.TILE, colDk = o.colorDk ?? C.TILE_DK;
  const A = (t) => {
    if (type === "pyramid") return hw * (1 - t);
    if (type === "gable") return hw;
    if (type === "xieshan") return t < tg ? lerp(hw, G, t / tg) : G;
    return lerp(hw, rhw, t);
  };
  const B = (t) => hd * (1 - t);
  const Y = (t) => y + rise * (0.32 * t + 0.68 * t * t);
  const liftT = (t) => {
    if (type === "gable") return 0;
    const T = type === "xieshan" ? tg : 1;
    const u = Math.max(0, 1 - t / T);
    return lift * u * Math.sqrt(u);
  };
  // side 0 front(-z) x:+A..-A, 1 left(-x) z:-B..+B, 2 back(+z) x:-A..+A, 3 right(+x) z:+B..-B
  const P = (t, side, s) => {
    const a = A(t), b = B(t);
    let px, pz;
    if (side === 0) { px = -s * a; pz = -b; }
    else if (side === 1) { px = -a; pz = s * b; }
    else if (side === 2) { px = s * a; pz = b; }
    else { px = a; pz = -s * b; }
    const l = liftT(t) * Math.pow(Math.abs(s), 3);
    return [x + px, Y(t) + l, z + pz];
  };
  const ts = [];
  for (let i = 0; i <= N; i++) ts.push((i / N) * tEnd);
  const ss = [];
  for (let m = 0; m <= 2 * M; m++) ss.push(-1 + m / M);
  // tile surface
  for (let i = 0; i < N; i++) {
    k.color(i === 0 ? colDk : col);
    for (let side = 0; side < 4; side++) {
      for (let m = 0; m < 2 * M; m++) {
        k.quad(P(ts[i], side, ss[m]), P(ts[i], side, ss[m + 1]), P(ts[i + 1], side, ss[m + 1]), P(ts[i + 1], side, ss[m]));
      }
    }
  }
  // eave fascia + soffit (painted rafters underneath)
  const th = o.eaveTh ?? (hi ? 0.45 : 0.6);
  const wHw = o.wallHw ?? hw * 0.72, wHd = o.wallHd ?? hd * 0.72;
  const D = (p) => [p[0], p[1] - th, p[2]];
  const inner = (side, s) => {
    let px, pz;
    if (side === 0) { px = -s * wHw; pz = -wHd; }
    else if (side === 1) { px = -wHw; pz = s * wHd; }
    else if (side === 2) { px = s * wHw; pz = wHd; }
    else { px = wHw; pz = -s * wHd; }
    return [x + px, y - th - (o.soffitDrop ?? 0.6), z + pz];
  };
  for (let side = 0; side < 4; side++) {
    for (let m = 0; m < 2 * M; m++) {
      const a = P(0, side, ss[m]), b = P(0, side, ss[m + 1]);
      k.color(colDk).quad(D(a), D(b), b, a);
      k.color(o.soffit ?? C.BRACKET).quad(D(a), inner(side, ss[m]), inner(side, ss[m + 1]), D(b));
    }
  }
  // skirt roof: close the top edge against the upper wall (flashing strip)
  if (tEnd < 1) return { ridgeY: Y(tEnd), P, topHw: A(tEnd), topHd: B(tEnd) };
  const ridgeY = Y(1);
  const RH = o.ridgeH ?? Math.max(0.8, rise * 0.09);
  k.color(colDk);
  if (type !== "pyramid") {
    k.box(x, ridgeY - RH * 0.35, z, rhw * 2 + 0.4, RH, 0.9);
    // chiwen (dragon-head ridge ends)
    if (hi || rise > 6) {
      for (const sx of [-1, 1]) {
        const cx = x + sx * (rhw + 0.2);
        k.box(cx, ridgeY - RH * 0.35, z, 1.0, RH * 2.6, 1.3);
        k.box(cx - sx * 0.55, ridgeY + RH * 1.4, z, 0.9, RH * 0.9, 1.1);
      }
    }
  } else if (o.finial !== false) {
    k.color(o.finialColor ?? C.GOLD).cyl(x, ridgeY - 0.3, z, 0.9, 0.5, 1.4, hi ? 10 : 6);
    k.sphere(x, ridgeY + 1.9, z, 0.85, hi ? 10 : 6, hi ? 6 : 3);
  }
  // hip / gable ridges following the curve
  if (hi || rise > 8) {
    k.color(colDk);
    const rt = hi ? 0.55 : 0.8;
    for (const [side, s] of [[0, -1], [0, 1], [2, -1], [2, 1]]) {
      const tTop = type === "xieshan" ? tg : 1;
      let prev = P(0, side, s);
      prev = [prev[0], prev[1] + 0.25, prev[2]];
      const steps = hi ? N : 2;
      for (let i = 1; i <= steps; i++) {
        const q = P((i / steps) * tTop, side, s);
        const qq = [q[0], q[1] + 0.25, q[2]];
        k.strut(prev, qq, rt);
        prev = qq;
      }
      if (type === "xieshan") { // gable ridge up the gable edge to the main ridge
        const steps2 = hi ? 4 : 1;
        for (let i = 1; i <= steps2; i++) {
          const q = P(tg + (i / steps2) * (1 - tg), side, s);
          const qq = [q[0], q[1] + 0.25, q[2]];
          k.strut(prev, qq, rt * 0.85);
          prev = qq;
        }
      }
      // ridge beasts (仙人走兽) along the lower hip ridge
      if (hi && o.beasts !== false) {
        const nb = o.beasts ?? 5;
        for (let b = 0; b < nb; b++) {
          const q = P(0.05 + (b / nb) * 0.25 * (type === "xieshan" ? 1 : 0.7), side, s);
          k.box(q[0], q[1] + 0.35, q[2], 0.35, 0.55, 0.35);
        }
      }
    }
    if (type === "xieshan" && hi) { // gable pediment boards (博风板) - red with gold studs
      for (const sx of [-1, 1]) {
        const gx = x + sx * (G + 0.05);
        const b0 = B(tg), y0 = Y(tg), y1 = ridgeY;
        k.color(C.RED_DK);
        if (sx > 0) k.tri([gx, y0, z + b0], [gx, y0, z - b0], [gx, y1, z]);
        else k.tri([gx, y0, z - b0], [gx, y0, z + b0], [gx, y1, z]);
        k.color(C.GOLD).box(gx, (y0 + y1) / 2 - 0.4, z, 0.12, 0.8, 0.8);
      }
    }
  }
  // tile rows (筒瓦) - hero roofs only
  if (hi && o.ribs) {
    k.color(col);
    const tTop = type === "xieshan" ? 1 : 1;
    for (const side of [0, 2, 1, 3]) {
      const len = side % 2 === 0 ? 2 * hw : 2 * hd;
      const n = Math.floor(len / o.ribs);
      for (let r = 1; r < n; r++) {
        const s = -1 + (2 * r) / n;
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const t = ts[i] * tTop;
          // stop where the rib leaves this face (hip triangle shrinks)
          const a = A(t), b = B(t);
          const lim = side % 2 === 0 ? a / Math.max(1e-3, hw) : b / Math.max(1e-3, hd);
          if (Math.abs(s) * (side % 2 === 0 ? hw : hd) > (side % 2 === 0 ? a : b) + 0.01) break;
          const ps = side % 2 === 0 ? (s * hw) / Math.max(1e-3, a) : (s * hd) / Math.max(1e-3, b);
          void lim;
          const q = P(t, side, Math.max(-1, Math.min(1, ps)));
          const n0 = side === 0 ? [0, 0.12, -0.12] : side === 2 ? [0, 0.12, 0.12] : side === 1 ? [-0.12, 0.12, 0] : [0.12, 0.12, 0];
          const qq = [q[0] + n0[0], q[1] + n0[1], q[2] + n0[2]];
          if (prev) k.strut(prev, qq, 0.22);
          prev = qq;
        }
      }
    }
  }
  return { ridgeY, P };
}

/** Painted bracket band (额枋 + 斗拱) around a rectangle, stepping outward; returns its top y. */
export function brackets(k, x, y, z, hw, hd, h = 1.6, o = {}) {
  const hi = k.hi && !o.cheap;
  k.color(o.beam ?? C.BEAM).box(x, y, z, hw * 2 + 0.3, h * 0.38, hd * 2 + 0.3);
  k.color(o.color ?? C.BRACKET).taper(x, y + h * 0.38, z, hw * 2 + 0.3, hd * 2 + 0.3, hw * 2 + h * 1.1, hd * 2 + h * 1.1, h * 0.62);
  if (hi && o.blocks !== false) {
    // dougong clusters: small gold/blue blocks along the front and back
    const n = Math.max(2, Math.round((hw * 2) / (o.spacing ?? 2.2)));
    for (let i = 0; i <= n; i++) {
      const bx = x - hw + (2 * hw * i) / n;
      k.color(i % 2 ? C.BRACKET_B : C.GOLD);
      for (const sz of [-1, 1]) k.box(bx, y + h * 0.18, z + sz * (hd + 0.2), 0.45, h * 0.32, 0.25);
    }
  }
  return y + h;
}

/**
 * Timber hall on its own base. o = {
 *   x, z, y0=0, w, d (column-line extents), bays=9, baysD=5, colH=7, colR=0.45,
 *   base: { h, margin, tiers, rail, stairs } | false, roof: "hip"|"xieshan"|"pyramid"|"gable",
 *   double: false, rise, over (eave overhang), tile, upperH, glow (floodlit walls at night), doors: "front"|"both"
 *   veranda: true (front columns stand free of the wall), cheap: false (force low detail)
 * } Returns { top, ridgeY, baseTop }.
 */
export function hall(k, o) {
  const hi = k.hi && !o.cheap;
  const x = o.x || 0, z = o.z || 0, y0 = o.y0 || 0;
  const w = o.w, d = o.d, bays = o.bays || 9, baysD = o.baysD || 5;
  const colH = o.colH ?? 7, colR = o.colR ?? Math.max(0.3, colH * 0.055);
  let y = y0;
  if (o.base !== false) {
    const b = o.base || {};
    const bh = b.h ?? 1.5, mg = b.margin ?? 3;
    terrace(k, x, y0, z, w + 2 * mg, d + 2 * mg, bh, { rail: b.rail ?? false, stairs: b.stairs ?? [{ side: "front", x: 0, w: Math.min(w * 0.3, 8) }], cheap: o.cheap, tiers: b.tiers });
    y = y0 + bh * (b.tiers || 1);
  }
  const baseTop = y;
  const glow = !!o.glow;
  const inset = o.veranda === false ? 0 : Math.min(d / baysD, 3.2) * 0.75;
  // walls
  k.glow(glow).color(o.wall ?? C.WALL);
  k.box(x, y, z, w - 2 * inset * (o.sideVeranda ? 1 : 0.15), colH, d - 2 * inset);
  // doors / lattice windows on the front (and back)
  const bw = w / bays;
  if (hi) {
    for (const sz of o.doors === "both" ? [-1, 1] : [-1]) {
      const fz = z + sz * (d / 2 - inset + 0.04);
      for (let i = 0; i < bays; i++) {
        const bx = x - w / 2 + bw * (i + 0.5);
        const isDoor = Math.abs(i - (bays - 1) / 2) <= (bays >= 7 ? 2 : 1);
        k.color(C.DOOR).box(bx, y + 0.4, fz, bw * 0.84, colH * (isDoor ? 0.78 : 0.62) + (isDoor ? 0 : colH * 0.16), 0.08);
        k.color(C.LATTICE);
        const lh = colH * 0.42, ly = y + colH * 0.32;
        k.box(bx, ly, fz + sz * 0.05, bw * 0.7, 0.08, 0.05);
        k.box(bx, ly + lh, fz + sz * 0.05, bw * 0.7, 0.08, 0.05);
        for (let q = 0; q <= 3; q++) k.box(bx - bw * 0.35 + (bw * 0.7 * q) / 3, ly, fz + sz * 0.05, 0.07, lh, 0.05);
      }
    }
  }
  // columns
  if (hi) {
    k.color(o.colColor ?? C.RED);
    const seg = o.cheap ? 5 : 8;
    for (let i = 0; i <= bays; i++) {
      const cx = x - w / 2 + bw * i;
      for (const sz of [-1, 1]) {
        k.cyl(cx, y, z + sz * d / 2, colR, colR * 0.92, colH, seg, { caps: false });
        if (!o.cheap) k.color(C.MARBLE_DK).cyl(cx, y, z + sz * d / 2, colR * 1.5, colR * 1.3, 0.25, seg).color(o.colColor ?? C.RED);
      }
    }
    const bd = d / baysD;
    for (let j = 1; j < baysD; j++) for (const sx of [-1, 1]) k.cyl(x + sx * w / 2, y, z - d / 2 + bd * j, colR, colR * 0.92, colH, seg, { caps: false });
  }
  y += colH;
  const bh = o.bracketH ?? Math.max(1.1, colH * 0.2);
  y = brackets(k, x, y, z, w / 2, d / 2, bh, { cheap: o.cheap });
  const over = o.over ?? (2.2 + colH * 0.22);
  const rise = o.rise ?? (d * 0.36 + 2);
  const roofOpts = { type: o.roof || "hip", color: o.tile ?? C.TILE, colorDk: o.tileDk ?? C.TILE_DK, ribs: o.ribs, cheap: o.cheap, lift: o.lift, beasts: o.beasts, wallHw: w / 2, wallHd: d / 2 };
  let ridgeY;
  k.glow(!!o.glowRoof);
  if (o.double) {
    // lower (skirt) eave, then the upper storey wall + brackets + main roof
    const r1 = roof(k, x, y, z, w / 2 + over, d / 2 + over, rise * 0.8, { ...roofOpts, tEnd: 0.34, type: "hip" });
    const uw = w - 2 * (o.upperInset ?? bw * 0.9), ud = d - 2 * (o.upperInset ?? bw * 0.9);
    const uH = o.upperH ?? colH * 0.5;
    const uy = r1.ridgeY - 0.6;
    k.glow(glow).color(o.wall ?? C.WALL).box(x, uy, z, uw, uH + 0.6, ud);
    if (hi) { // upper columns peeking out + lattice band
      k.color(C.LATTICE);
      for (const sz of [-1, 1]) k.box(x, uy + 0.9, z + sz * (ud / 2 + 0.03), uw * 0.9, uH * 0.45, 0.06);
    }
    let yy = uy + uH + 0.6;
    yy = brackets(k, x, yy, z, uw / 2, ud / 2, bh * 0.9, { cheap: o.cheap });
    k.glow(!!o.glowRoof);
    const over2 = o.over2 ?? over * 0.95;
    ridgeY = roof(k, x, yy, z, uw / 2 + over2, ud / 2 + over2, o.rise2 ?? (ud * 0.42 + 2), { ...roofOpts, wallHw: uw / 2, wallHd: ud / 2 }).ridgeY;
  } else {
    ridgeY = roof(k, x, y, z, w / 2 + over, d / 2 + over, rise, roofOpts).ridgeY;
  }
  k.glow(false);
  return { top: y, ridgeY, baseTop };
}

/** One straight balustrade run from (ax,az) to (bx,bz) at height y (posts + rail + panels). */
export function rail(k, ax, az, bx, bz, y, o = {}) {
  const hi = k.hi && !o.cheap;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  if (L < 0.3) return;
  const h = o.h ?? 1.15;
  const ang = Math.atan2(dz, dx);
  k.push().translate(ax, y, az).rotateY(-ang);
  k.color(o.color ?? C.MARBLE);
  if (hi) {
    const n = Math.max(1, Math.round(L / (o.spacing ?? 1.8)));
    for (let i = 0; i <= n; i++) {
      const px = (L * i) / n;
      k.box(px, 0, 0, 0.24, h + 0.22, 0.24);
    }
    k.box(L / 2, h - 0.2, 0, L, 0.16, 0.16);          // hand rail
    k.color(o.panel ?? C.MARBLE_DK).box(L / 2, 0.1, 0, L, h * 0.55, 0.1); // carved panels
  } else {
    k.box(L / 2, 0, 0, L, h, 0.2);
  }
  k.pop();
}

/**
 * White marble Xumizuo (须弥座) platform. o = {
 *   rail: true, tiers: 1 (stacked, each inset by o.step), step: 3, stairs: [{ side: "front"|"back"|"left"|"right", x|z, w }],
 *   color, glow
 * } Returns top y.
 */
export function terrace(k, x, y0, z, w, d, h, o = {}) {
  const hi = k.hi && !o.cheap;
  const tiers = o.tiers || 1;
  const step = o.step ?? 3;
  let y = y0, cw = w, cd = d;
  const stairs = o.stairs || [];
  for (let t = 0; t < tiers; t++) {
    k.glow(!!o.glow);
    // plinth, waist (darker, inset), cornice
    k.color(o.color ?? C.MARBLE).box(x, y, z, cw + 0.5, h * 0.22, cd + 0.5);
    k.color(o.waist ?? C.MARBLE_DK).box(x, y + h * 0.22, z, cw - 0.3, h * 0.56, cd - 0.3);
    k.color(o.color ?? C.MARBLE).box(x, y + h * 0.78, z, cw + 0.3, h * 0.22, cd + 0.3);
    k.glow(false);
    y += h;
    // stairs on each tier
    for (const s of stairs) stair(k, x, z, cw, cd, y - h, h, s, hi);
    // balustrade with gaps at the stairs
    if (o.rail !== false) {
      const e = 0.35;
      const hw = cw / 2 - e, hd = cd / 2 - e;
      const gaps = (side) => stairs.filter((s) => (s.side || "front") === side).map((s) => [(s.x ?? s.z ?? 0) - s.w / 2 - 0.2, (s.x ?? s.z ?? 0) + s.w / 2 + 0.2]);
      const run = (side, a0, a1, fixed, alongX) => {
        const g = gaps(side).sort((p, q) => p[0] - q[0]);
        let cur = a0;
        const segs = [];
        for (const [g0, g1] of g) { if (g0 > cur) segs.push([cur, g0]); cur = Math.max(cur, g1); }
        if (cur < a1) segs.push([cur, a1]);
        for (const [p, q] of segs) {
          if (alongX) rail(k, x + p, z + fixed, x + q, z + fixed, y, { cheap: o.cheap });
          else rail(k, x + fixed, z + p, x + fixed, z + q, y, { cheap: o.cheap });
        }
      };
      run("front", -hw, hw, -hd, true);
      run("back", -hw, hw, hd, true);
      run("left", -hd, hd, -hw, false);
      run("right", -hd, hd, hw, false);
    }
    cw -= 2 * step; cd -= 2 * step;
  }
  return y;
}

function stair(k, x, z, cw, cd, ybot, h, s, hi) {
  const side = s.side || "front";
  const sw = s.w;
  const run = s.len ?? h * 2.2;
  const n = hi ? Math.max(3, Math.round(h / 0.17)) : 1;
  k.push();
  // local frame: stair climbs toward +z' from outside (z' = -run) to the platform edge (z' = 0)
  if (side === "front") k.translate(x + (s.x || 0), ybot, z - cd / 2);
  else if (side === "back") k.translate(x + (s.x || 0), ybot, z + cd / 2).rotateY(Math.PI);
  else if (side === "left") k.translate(x - cw / 2, ybot, z + (s.z || 0)).rotateY(-Math.PI / 2);
  else k.translate(x + cw / 2, ybot, z + (s.z || 0)).rotateY(Math.PI / 2);
  k.color(C.MARBLE);
  if (hi) {
    for (let i = 0; i < n; i++) {
      const sh = (h * (i + 1)) / n;
      const zs = -run + (run * i) / n;
      k.box(0, 0, zs / 2, sw, sh, -zs);
    }
    if (sw > 7) { // central carved imperial ramp (御路)
      k.color(C.MARBLE_DK);
      const rw = sw * 0.28;
      k.quad([rw / 2, 0.05, -run], [-rw / 2, 0.05, -run], [-rw / 2, h + 0.05, 0], [rw / 2, h + 0.05, 0]);
    }
    // side cheek walls
    k.color(C.MARBLE);
    for (const sx of [-1, 1]) k.taper(sx * (sw / 2 + 0.3), 0, -run / 2, 0.6, run, 0.6, 0.6, h + 0.6, 0, run / 2 - 0.3);
  } else {
    k.taper(0, 0, -run / 2, sw, run, sw, 0.6, h, 0, run / 2 - 0.3);
  }
  k.pop();
}

/**
 * Solid block (e.g. a gate platform) from y0 to y0+h, centred (x, z), width w along x, depth along z,
 * pierced front-to-back by round-arched tunnels: arches = [{ x, w, h }] (x relative to centre, h = spring+radius).
 * o.batter: inward slope of the walls (m over the full height), o.color.
 */
export function archWall(k, x, y0, z, w, h, depth, arches, o = {}) {
  const hi = k.hi && !o.cheap;
  const pts = []; // outline in (x, y) - counter-clockwise
  const hw = w / 2;
  const sorted = arches.slice().sort((a, b) => b.x - a.x); // walk the bottom edge from +x to -x
  pts.push([hw, 0], [hw, h], [-hw, h], [-hw, 0]);
  // bottom edge from -x to +x with arch notches
  const notch = [];
  for (const a of sorted.slice().reverse()) {
    const r = a.w / 2, spring = Math.max(0.1, a.h - r);
    const segs = hi ? 10 : 4;
    notch.push([a.x - r, 0], [a.x - r, spring]);
    for (let i = 1; i < segs; i++) {
      const th = Math.PI - (i / segs) * Math.PI;
      notch.push([a.x + Math.cos(th) * r, spring + Math.sin(th) * r]);
    }
    notch.push([a.x + r, spring], [a.x + r, 0]);
  }
  for (const p of notch) pts.push(p);
  k.push().translate(x, y0, z - depth / 2).rotateX(Math.PI / 2); // local +y (extrusion) -> world +z
  k.color(o.color ?? C.WALL);
  // extrude maps polygon (px, pz) -> (px, -pz) after rotateX(+90deg): feed (x, -y) to get +y up
  k.extrude(pts.map(([px, py]) => [px, -py]), 0, depth);
  k.pop();
  // darker tunnel floors / doors set back inside each arch
  if (hi) {
    const g = k._glow;
    k.glow(false);
    for (const a of arches) {
      k.color(o.door ?? 0x4a140e).box(x + a.x, y0, z, a.w * 0.98, (a.h - a.w / 2) * 0.98, 0.3);
    }
    k.glow(g);
  }
}

/** Red wall with yellow glazed coping along a polyline pts=[[x,z],...]; h wall height, t thickness. */
export function wallRun(k, pts, h, t, o = {}) {
  const hi = k.hi && !o.cheap;
  const closed = !!o.closed;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.2) continue;
    const ang = Math.atan2(bz - az, bx - ax);
    k.push().translate((ax + bx) / 2, o.y0 || 0, (az + bz) / 2).rotateY(-ang);
    k.glow(!!o.glow).color(o.base ?? C.MARBLE_DK).box(0, 0, 0, L + t * 0.2, 0.6, t + 0.2);
    k.color(o.color ?? C.WALL).box(0, 0.6, 0, L, h - 0.6, t);
    k.glow(false);
    if (o.coping !== false) {
      k.color(o.tile ?? C.TILE).taper(0, h, 0, L + 0.6, t + 1.0, L + 0.6, 0.25, Math.max(0.5, t * 0.45));
      if (hi) k.color(o.tileDk ?? C.TILE_DK).box(0, h - 0.25, 0, L + 0.6, 0.25, t + 0.9);
    }
    k.pop();
  }
}

/** Red palace lantern (glows at night). s = overall scale (1 = ~2 m tall). */
export function lantern(k, x, y, z, s = 1, o = {}) {
  const hi = k.hi && !o.cheap;
  k.glow(true).color(o.color ?? C.LANTERN);
  k.sphere(x, y, z, 0.95 * s, hi ? 10 : 5, hi ? 6 : 3, 0.85);
  k.color(C.GOLD);
  k.cyl(x, y + 0.72 * s, z, 0.45 * s, 0.45 * s, 0.18 * s, hi ? 8 : 4);
  k.cyl(x, y - 0.9 * s, z, 0.45 * s, 0.45 * s, 0.18 * s, hi ? 8 : 4);
  if (hi) k.cyl(x, y - 1.6 * s, z, 0.06 * s, 0.25 * s, 0.7 * s, 5);
  k.glow(false);
}

export { TAU };
