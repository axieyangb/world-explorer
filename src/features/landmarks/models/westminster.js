// feature/famous-landmarks: Palace of Westminster & Elizabeth Tower (Big Ben), London — 1:1.
// Long axis = local Z: Elizabeth Tower (96 m, four lit clock dials) at the north end (z = -128),
// Victoria Tower (98.5 m) at the south end (z = +128), octagonal Central Tower (91 m) between.
// River (Thames) side = local +X with the ~265 m Perpendicular Gothic river front; Westminster Hall
// on the west. Stone is floodlit at night (glow bucket), dials glow white.
const STONE = 0xcdb88d, STONE_DK = 0xb7a177, STONE_OLD = 0xb5a684, ROOF = 0x56616b, WIN = 0x36373b;
const GOLD = 0xd0a84e, SPIRE = 0x323e4a, DIAL = 0xfff9ea, HANDS = 0x18181a, FLAG = 0xc8102e;
const TAU = Math.PI * 2;

export const lodDist = 1600;
export const fineDist = 320; // [lm-materials] recessed window tracery only up close
export const glowStrength = 0.9;

export const colliders = [
  { x: 33, z: 2, hw: 10, hd: 120, h: 24 },     // river front
  { x: 8, z: -62, hw: 10, hd: 50, h: 21 },     // Commons range
  { x: 4, z: 64, hw: 11, hd: 48, h: 21 },      // Lords range
  { x: 15, z: 0, hw: 12, hd: 18, h: 25 },      // central lobby block
  { x: -26, z: -11, hw: 10.5, hd: 36.5, h: 24 }, // Westminster Hall
  { x: 0, z: -128, hw: 6.6, hd: 6.6, h: 72 },  // Elizabeth Tower
  { x: 0, z: -128, r: 3, h: 96 },
  { x: 0, z: 128, hw: 11, hd: 11, h: 92 },     // Victoria Tower
  { x: 10, z: 0, r: 8.5, h: 62 },              // Central Tower
  { x: 10, z: 0, r: 4, h: 88 },
];

// --------------------------------------------------------------------------- helpers
// one Gothic facade in local frame: plane z = -half facing -Z, spanning x in [-len/2, len/2]
function face(k, len, h, half, o) {
  const n = Math.max(1, Math.round(len / (o.bay || 4.6)));
  const bay = len / n, zf = -half, rows = o.rows || 3;
  k.glow(true).color(STONE_DK);
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + i * bay;
    k.box(x, 0, zf - 0.3, 0.8, h + 1.5, 0.6);
    if (o.pin !== false) k.pyramid(x, h + 1.5, zf - 0.3, 0.8, 0.8, 2.8);
  }
  // [lm-materials] Perpendicular Gothic windows: recessed in moulded frames, two mullions, transoms; blind
  // panelling (thin ribs) between the storeys
  const band = (h - 4) / rows;
  if (!k.fine) {
    k.glow(false).color(WIN);
    const zw = zf - 0.07;
    for (let i = 0; i < n; i++) {
      const xm = -len / 2 + (i + 0.5) * bay, ww = Math.min(bay * 0.44, 2.3);
      for (let r = 0; r < rows; r++) {
        const ya = 3 + r * band + band * 0.14, yb = ya + band * 0.56;
        k.quad([xm + ww / 2, ya, zw], [xm - ww / 2, ya, zw], [xm - ww / 2, yb, zw], [xm + ww / 2, yb, zw]);
        k.tri([xm + ww / 2, yb, zw], [xm - ww / 2, yb, zw], [xm, yb + ww * 0.5, zw]);
      }
    }
  }
  for (let i = 0; i < n && k.fine; i++) {
    const xm = -len / 2 + (i + 0.5) * bay, ww = Math.min(bay * 0.44, 2.3);
    for (let r = 0; r < rows; r++) {
      const ya = 3 + r * band + band * 0.14, hh = band * 0.56 + ww * 0.5;
      k.glow(true).framedArch(xm, ya, zf, ww, hh, 0.35, 1, ww * 0.8, 0.22, { back: "glass", mullions: ww > 1.8 ? 2 : 1, rk: 0.7, col: { face: STONE, side: STONE_DK, back: WIN } });
      k.color(STONE_DK);
      const rib = band - hh - 0.5;
      if (rib > 0.2) k.box(xm, ya + hh + 0.3, zf - 0.08, 0.12, rib, 0.16);
    }
  }
  k.glow(true).color(STONE).box(0, h, zf + 0.3, len, 1.1, 0.6); // parapet
}

function block(k, cx, cz, w, d, h, o = {}) {
  k.glow(true).color(o.col || STONE).box(cx, 0, cz, w, h, d);
  const rh = o.rh ?? Math.min(w, d) * 0.3;
  if (rh > 0) {
    k.glow(false).color(ROOF);
    if (d >= w) k.taper(cx, h, cz, w - 1.2, d - 1.2, 0.3, Math.max(0.3, d - w), rh);
    else k.taper(cx, h, cz, w - 1.2, d - 1.2, Math.max(0.3, w - d), 0.3, rh);
  }
  if (!k.hi) return;
  const fs = o.faces || [1, 1, 1, 1];
  const F = [[0, w, d / 2], [Math.PI, w, d / 2], [Math.PI / 2, d, w / 2], [-Math.PI / 2, d, w / 2]];
  F.forEach(([a, len, half], i) => {
    if (!fs[i]) return;
    k.push().translate(cx, 0, cz).rotateY(a);
    face(k, len, h, half, o);
    k.pop();
  });
}

// flat disc facing -Z at plane z
function disc(k, x, y, z, r, seg) {
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * TAU, a1 = ((s + 1) / seg) * TAU;
    k.tri([x, y, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z]);
  }
}

// dark lancet window facing -Z
function lancet(k, xm, ya, z, ww, hh) {
  const xa = xm - ww / 2, xb = xm + ww / 2, yb = ya + hh;
  k.quad([xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]);
  k.tri([xb, yb, z], [xa, yb, z], [xm, yb + ww * 0.6, z]);
}

const FACES4 = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// --------------------------------------------------------------------------- Elizabeth Tower
function elizabeth(k, x, z) {
  const hi = k.hi;
  k.glow(true).color(STONE).box(x, 0, z, 12, 52, 12);
  for (const a of FACES4) {
    k.push().translate(x, 0, z).rotateY(a);
    if (hi) {
      k.glow(true).color(STONE_DK);
      for (let j = -2; j <= 2; j++) k.box(j * 2.3, 4, -6.12, 0.35, 47, 0.25);
      for (const y of [4, 15, 26, 37, 48]) k.box(0, y, -6.15, 12, 0.6, 0.3);
      for (const y of [17, 28, 39]) for (const xm of [-1.15, 1.15]) {
        if (!k.fine) { k.glow(false).color(WIN); lancet(k, xm, y, -6.2, 1.1, 5.2); continue; }
        k.glow(true).framedArch(xm, y, -6.0, 1.1, 5.2, 0.4, 2, 0.75, 0.25, { back: "glass", mullions: 1, col: { face: STONE_DK, side: STONE, back: WIN } });
      }
      k.glow(false);
    }
    // clock stage
    k.glow(true).color(STONE).box(0, 52, 0, 13.4, 11, 13.4);
    k.glow(true).color(GOLD).box(0, 52.6, -6.75, 9.6, 9.8, 0.3);
    k.glow(true).color(DIAL);
    if (hi) k.roseWindow(0, 57.5, -7.22, 3.5, 0.3, 12, { frame: GOLD, glass: DIAL, tracery: HANDS }); // cast-iron dial tracery, opal glass
    else disc(k, 0, 57.5, -6.95, 3.5, 12);
    if (hi) {
      k.glow(false).color(HANDS);
      // 10:08 — hour hand + minute hand + chapter ring dots
      const hand = (ang, len, wd) => {
        const dx = Math.sin(ang), dy = Math.cos(ang), px = -dy * wd, py = dx * wd;
        k.quad2([px, 57.5 + py, -7.3], [-px, 57.5 - py, -7.3], [dx * len - px, 57.5 + dy * len - py, -7.3], [dx * len + px, 57.5 + dy * len + py, -7.3]);
      };
      hand(-((10 + 8 / 60) / 12) * TAU, 2.0, 0.14);
      hand(-(8 / 60) * TAU, 3.0, 0.09);
      for (let m = 0; m < 12; m++) {
        const a = (m / 12) * TAU;
        k.box(Math.sin(a) * 3.15, 57.5 + Math.cos(a) * 3.15 - 0.2, -7.3, 0.18, 0.4, 0.05);
      }
    }
    // belfry 63..72 with arcade
    k.glow(true).color(STONE).box(0, 63, 0, 12.4, 9, 12.4);
    k.glow(false).color(WIN);
    for (const xm of [-3.4, 0, 3.4]) lancet(k, xm, 64.3, -6.25, 2.0, 5.0);
    if (hi) {
      k.glow(true).color(GOLD);
      k.box(0, 71.4, -6.3, 12.6, 0.6, 0.3);
      k.pyramid(0, 72, -6.1, 3.2, 0.6, 4.5); // gablet
    }
    k.pop();
  }
  // corner pinnacles around the belfry
  k.glow(true).color(GOLD);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    k.cyl(x + sx * 6.6, 63, z + sz * 6.6, 0.75, 0.75, 8, hi ? 8 : 4);
    if (hi) k.pinnacle(x + sx * 6.6, 71, z + sz * 6.6, 1.3, 5.5);
    else k.cyl(x + sx * 6.6, 71, z + sz * 6.6, 0.95, 0, 5, 4);
  }
  // iron spire: steep pyramid, Ayrton lantern, upper spire, finial
  k.glow(false).color(SPIRE).taper(x, 72, z, 12.4, 12.4, 6.2, 6.2, 10);
  if (hi) {
    // 13.5-tonne Great Bell "Big Ben" suspended inside the belfry arch void + glowing Ayrton Light lantern at y = 82.5 m
    k.color(0x7c683c).lathe(x, 64.5, z, [[1.35, 0], [1.05, 0.6], [0.85, 1.6], [0.45, 2.2]], 10);
    k.glow(true).color(0xffe8a8).cyl(x, 82.4, z, 2.2, 2.2, 3.4, 8);
    k.color(GOLD);
    for (const a of FACES4) {
      k.push().translate(x, 0, z).rotateY(a);
      k.box(0, 74, -5.4, 1.4, 3, 1.2);
      k.pyramid(0, 77, -5.4, 1.4, 1.2, 2.2);
      // Gilded spandrel shields & Latin inscription band ("DOMINE SALVAM FAC REGINAM NOSTRAM VICTORIAM PRIMAM") below dial
      k.box(0, 52.8, -6.82, 8.8, 0.55, 0.14);
      for (const sx of [-3.6, 3.6]) for (const sy of [54.2, 60.8]) k.cyl(sx, sy, -6.82, 0.55, 0.55, 0.15, 6);
      k.pop();
    }
  }
  k.glow(true).color(GOLD).box(x, 82, z, 6.2, 4.2, 6.2);
  k.glow(false).color(SPIRE).taper(x, 86.2, z, 5.8, 5.8, 0.4, 0.4, 8.3);
  k.glow(true).color(GOLD).cyl(x, 94.5, z, 0.3, 0.08, 1.5, 6);
}

// --------------------------------------------------------------------------- Victoria Tower
function victoria(k, x, z) {
  const hi = k.hi, W = 22, H = 84;
  k.glow(true).color(STONE).box(x, 0, z, W, H, W);
  for (const a of FACES4) {
    k.push().translate(x, 0, z).rotateY(a);
    if (hi) {
      k.glow(true).color(STONE_DK);
      for (let j = -3; j <= 3; j++) k.box(j * 2.6, 14, -W / 2 - 0.12, 0.4, H - 16, 0.25);
      for (const y of [14, 32, 48, 60, 79]) k.box(0, y, -W / 2 - 0.15, W, 0.8, 0.3);
      k.glow(false).color(WIN);
      for (const xm of [-5.2, 0, 5.2]) lancet(k, xm, 63, -W / 2 - 0.2, 3.0, 12);
      for (const y of [35, 50]) for (const xm of [-6.5, -1.3, 1.3, 6.5]) lancet(k, xm, y, -W / 2 - 0.2, 1.4, 7);
    }
    k.glow(true).color(STONE_DK).box(0, H, -W / 2 + 0.4, W + 0.6, 3.2, 0.8); // openwork parapet
    if (hi) {
      k.glow(true).color(STONE);
      for (const xm of [-5.5, 0, 5.5]) { k.cyl(xm, H, -W / 2 + 0.4, 0.6, 0.6, 5, 6); k.cyl(xm, H + 5, -W / 2 + 0.4, 0.75, 0, 3.5, 6); }
    }
    k.pop();
  }
  // Sovereign's Entrance arches (south + west faces)
  k.glow(false).color(WIN);
  for (const a of [Math.PI, Math.PI / 2]) { k.push().translate(x, 0, z).rotateY(a); lancet(k, 0, 0, -W / 2 - 0.2, 7, 9); k.pop(); }
  // octagonal corner turrets with crowns
  k.glow(true).color(STONE);
  const seg = hi ? 8 : 6, ph = { smooth: false, phase: Math.PI / 8 };
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tx = x + sx * (W / 2 - 0.6), tz = z + sz * (W / 2 - 0.6);
    k.lathe(tx, 0, tz, [[2.4, 0], [2.4, H + 4], [2.9, H + 4], [2.9, H + 6], [2.4, H + 6]], seg, ph);
    k.glow(true).color(GOLD).cyl(tx, H + 6, tz, 2.3, 0.15, 8.2, seg, ph);
    k.glow(true).color(STONE);
  }
  k.glow(false).color(ROOF).taper(x, H, z, W - 2, W - 2, 3, 3, 6);
  k.glow(true).color(GOLD).cyl(x, H + 6, z, 0.25, 0.18, 8.5, 6);
  if (hi) k.glow(false).color(FLAG).quad2([x, H + 11.5, z], [x, H + 14.3, z], [x + 4.6, H + 14.3, z], [x + 4.6, H + 11.5, z]);
}

// --------------------------------------------------------------------------- Central Tower
function central(k, x, z) {
  const hi = k.hi, seg = 8, ph = { smooth: false, phase: Math.PI / 8 };
  block(k, x, z, 20, 20, 25, { rh: 0, rows: 3 });
  k.glow(true).color(STONE).lathe(x, 25, z, [[8.6, 0], [8.6, 30], [9.0, 30], [9.0, 32], [8.0, 32]], seg, ph);
  if (hi) {
    k.glow(false).color(WIN);
    for (let i = 0; i < 8; i++) {
      k.push().translate(x, 0, z).rotateY((i / 8) * TAU);
      lancet(k, 0, 33, -8.0, 2.4, 14);
      k.pop();
    }
  }
  k.glow(true).color(STONE).lathe(x, 57, z, [[7.6, 0], [4.2, 16], [0.3, 33]], seg, ph);
  k.glow(true).color(GOLD).cyl(x, 90, z, 0.2, 0.05, 1.0, 5);
  k.glow(true).color(STONE);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8, px = x + Math.cos(a) * 8.8, pz = z + Math.sin(a) * 8.8;
    k.cyl(px, 55, pz, 0.8, 0.8, 7, hi ? 6 : 4);
    k.cyl(px, 62, pz, 0.95, 0, 6.5, hi ? 6 : 4);
  }
}

// --------------------------------------------------------------------------- Westminster Hall
function hall(k) {
  const cx = -26, cz = -11, w = 21, d = 73, hw = 15;
  k.glow(true).color(STONE_OLD).box(cx, 0, cz, w, hw, d);
  k.glow(false).color(ROOF).taper(cx, hw, cz, w + 0.8, d, 0.4, d, 13);
  const zn = cz - d / 2 - 0.05;
  k.glow(true).color(STONE_OLD).tri([cx + w / 2, hw, zn], [cx - w / 2, hw, zn], [cx, hw + 13, zn]);
  k.glow(false).color(WIN);
  lancet(k, cx, 9, zn - 0.05, 9, 9);
  // north front towers
  k.glow(true).color(STONE_OLD);
  for (const sx of [-1, 1]) {
    k.box(cx + sx * 9.5, 0, cz - d / 2 + 2, 5, 25, 5);
    k.pyramid(cx + sx * 9.5, 25, cz - d / 2 + 2, 5, 5, 4);
  }
  k.glow(false).color(ROOF).box(cx, hw + 12, cz, 3, 2.5, 4);
  k.pyramid(cx, hw + 14.5, cz, 3, 4, 3);
  if (!k.hi) return;
  k.glow(true).color(STONE_DK);
  for (let i = 0; i <= 12; i++) {
    const zz = cz - d / 2 + 4 + i * ((d - 8) / 12);
    for (const sx of [-1, 1]) {
      k.box(cx + sx * (w / 2 + 0.6), 0, zz, 1.2, hw + 1, 1.4);
      // External flying buttresses braced against Westminster Hall's medieval walls (every other bay on west side)
      if (sx < 0 && i % 2 === 1 && i < 12) {
        k.box(cx - w / 2 - 3.8, 0, zz, 1.3, 11.5, 1.5);
        k.pinnacle(cx - w / 2 - 3.8, 11.5, zz, 1.1, 3.2);
        k.strut([cx - w / 2 - 3.4, 9.2, zz], [cx - w / 2 - 0.2, 13.8, zz], 0.55);
      }
    }
  }
}

// --------------------------------------------------------------------------- build
export function build(k) {
  // river front (+X) with end and middle pavilions
  block(k, 33, 2, 18, 236, 22, { rows: 3 });
  block(k, 34, -108, 22, 18, 28, { rh: 9, rows: 4 });
  block(k, 34, 112, 22, 18, 28, { rh: 9, rows: 4 });
  block(k, 35, -40, 20, 14, 25, { rh: 7, rows: 3 });
  block(k, 35, 44, 20, 14, 25, { rh: 7, rows: 3 });
  // north (Commons / Bridge St) and south ranges
  block(k, 14, -117, 30, 14, 21);
  block(k, 14, 116, 30, 14, 21);
  // inner Commons + Lords ranges, cross ranges, St Stephen's
  block(k, 8, -64, 18, 92, 20);
  block(k, 4, 64, 22, 92, 20);
  block(k, 17, 0, 14, 36, 20);
  block(k, 16, -76, 18, 10, 18);
  block(k, 16, 78, 18, 10, 18);
  block(k, -7.5, -2, 15, 10, 20);
  central(k, 10, 0);
  hall(k);
  elizabeth(k, 0, -128);
  victoria(k, 0, 128);
  if (k.hi) {
    // Thames Embankment Terrace (House of Commons & House of Lords river terrace, x = 42..50, z = -100..104)
    k.glow(false).color(0x8e887c).box(46, -2, 2, 8.5, 3.2, 204);
    k.color(STONE).box(50.1, 1.2, 2, 0.45, 1.1, 204);
    // Ornate Victorian cast-iron dolphin lamp standards with glowing globes along the River Terrace wall
    for (let lz = -96; lz <= 100; lz += 14) {
      k.color(0x283230).cyl(50.1, 2.3, lz, 0.14, 0.1, 2.4, 6);
      k.glow(true).color(0xffe8b0).sphere(50.1, 4.85, lz, 0.28, 6, 4);
      k.glow(false);
    }
    // White-and-green canvas House of Commons / Lords terrace marquees on the riverfront
    for (const mz of [-68, 72]) {
      k.color(0xf2efe6).box(45.5, 1.2, mz, 5.2, 2.8, 18);
      k.color(0x24583c).taper(45.5, 4.0, mz, 5.6, 18.4, 0.4, 16, 1.6);
    }
    // St Stephen's Entrance twin polygonal Gothic turrets & porch (west facade at x = -15, z = -2)
    for (const sz of [-5.5, 1.5]) {
      k.glow(true).color(STONE).cyl(-15.2, 0, sz, 1.35, 1.35, 26, 8);
      k.color(GOLD).pinnacle(-15.2, 26, sz, 1.2, 5.5);
    }
    // Famous Westminster bronze statues on stone plinths:
    // 1. Oliver Cromwell statue outside Westminster Hall (x = -39, z = -18)
    k.glow(false).color(STONE_DK).box(-39, 0, -18, 2.2, 3.0, 2.2);
    k.color(0x3b4a42).cyl(-39, 3.0, -18, 0.38, 0.3, 2.4, 6).sphere(-39, 5.6, -18, 0.22, 6, 4);
    // 2. Richard Coeur de Lion (Lionheart) equestrian statue in Old Palace Yard (x = -19, z = 44)
    k.color(STONE_DK).box(-19, 0, 44, 2.0, 2.8, 3.8);
    k.color(0x3b4a42).box(-19, 2.8, 44, 0.85, 1.6, 2.4).cyl(-19, 4.2, 43.8, 0.35, 0.28, 1.5, 6);
    k.strut([-19, 5.2, 43.6], [-19, 6.6, 43.4], 0.08); // raised sword
  }
}
