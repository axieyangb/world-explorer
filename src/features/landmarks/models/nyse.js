// feature/famous-landmarks: New York Stock Exchange & Federal Hall, Wall Street NY — 1:1.
// Iconic 6-column Corinthian Georgia-marble NYSE facade with sculpted triangular pediment and giant
// red-white-and-blue American Flag banner draped across the columns, plus adjacent Federal Hall steps & George Washington statue!

export const lodDist = 1800;
export const fineDist = 500;
export const glowStrength = 1.8;

const MARBLE = 0xf2efe8, MARBLE_SH = 0xd6d0c4, GRANITE = 0xb8b2a6;
const GLASS = 0x2f3b48, BRONZE = 0x4a3b2a, STATUE_BRONZE = 0x5c4c38, GOLD = 0xdfb438;
const FLAG_RED = 0xb22234, FLAG_WHITE = 0xfafbfd, FLAG_BLUE = 0x1a2d5a;
const LIT = 0xffecc4;

export const colliders = [
  { x: -16, z: 6, hw: 24, hd: 26, h: 42 },
  { x: 26, z: -12, hw: 18, hd: 24, h: 24 },
];

function americanFlagBanner(k, cx, yBot, yTop, zPlane, width) {
  const wHalf = width * 0.5;
  const h = yTop - yBot;
  const cantonW = width * 0.42, cantonH = h * 0.54;
  k.glow(true);
  k.color(FLAG_BLUE).box(cx - wHalf + cantonW * 0.5, yTop - cantonH, zPlane, cantonW, cantonH, 0.25);

  const nStripes = 13, sh = h / nStripes;
  for (let i = 0; i < nStripes; i++) {
    const sy = yTop - (i + 1) * sh;
    const isUpper = i < 7;
    const xStart = isUpper ? cx - wHalf + cantonW : cx - wHalf;
    const sw = isUpper ? width - cantonW : width;
    k.color(i % 2 === 0 ? FLAG_RED : FLAG_WHITE);
    k.box(xStart + sw * 0.5, sy, zPlane, sw, sh * 0.96, 0.22);
  }

  if (k.hi) {
    k.color(FLAG_WHITE);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const sx = cx - wHalf + 1.2 + c * (cantonW - 2.4) / 5;
        const sy = yTop - 1.1 - r * (cantonH - 2.2) / 4;
        k.box(sx, sy, zPlane - 0.14, 0.42, 0.42, 0.08);
      }
    }
  }
  k.glow(false);
}

function nyseBuilding(k) {
  const hi = k.hi;
  const bx = -16, bz = 6;
  k.push().translate(bx, 0, bz);

  k.glow(false).color(MARBLE_SH).box(0, -2.5, 0, 46, 3.0, 50);
  k.color(MARBLE).box(0, 0.5, 0, 44, 9.0, 48);
  k.color(MARBLE_SH).box(0, 9.5, 0, 45.6, 1.0, 49.6);

  k.color(MARBLE).box(0, 10.5, 2, 42, 22.0, 44);
  k.color(MARBLE_SH).box(0, 32.5, 4, 36, 9.5, 36);

  const fz = -22.2;
  if (hi) {
    // Rusticated ground-floor marble arcade (3 grand arched entrance portals + balustraded podium terrace)
    for (const ax of [-11, 0, 11]) {
      k.color(BRONZE).box(ax, 0.5, -24.1, 5.4, 6.8, 0.5);
      k.glow(true).color(LIT).box(ax, 1.0, -24.2, 4.2, 5.6, 0.35);
      k.glow(false).color(MARBLE_SH).arch(ax, 6.8, -24.2, 5.4, 2.2, 0.45, 12, 8);
    }
    // Marble balustrade along top of ground-floor podium (y = 10.5m)
    k.color(MARBLE_SH).box(0, 10.5, -24.1, 44.5, 1.1, 0.55);
  }

  // Giant 18m glass curtain wall behind colonnade + ornate bronze lattice mullion grid
  k.glow(true).color(LIT).box(0, 11.2, fz + 1.5, 34, 18.2, 0.8);
  k.glow(false).color(BRONZE);
  for (let x = -14; x <= 14; x += 3.5) k.box(x, 11.0, fz + 1.15, 0.38, 18.6, 0.5);
  if (hi) {
    for (let y = 14; y <= 26; y += 4.0) k.box(0, y, fz + 1.15, 34.5, 0.38, 0.5);
  }

  // 6 Fluted Corinthian Columns + 2 flanking square marble corner pilasters
  const colSeg = hi ? 20 : 8;
  for (let i = 0; i < 6; i++) {
    const cx = -16.5 + i * 6.6;
    if (hi) {
      k.glow(false).color(MARBLE_SH).box(cx, 10.5, fz, 2.5, 1.1, 2.5);
      k.color(MARBLE).extrude(k.constructor.star ? k.constructor.star(16, 1.06, 0.96, 0) : [[-1, -1], [1, -1], [1, 1], [-1, 1]], 11.6, 17.2);
      // Wait: extrude is around (0,0), so translate to cx, fz!
    } else {
      k.glow(false).color(MARBLE).cyl(cx, 10.5, fz, 1.05, 0.92, 18.5, colSeg);
    }
    k.color(MARBLE_SH).box(cx, 29.0, fz, 2.5, 1.4, 2.5);
  }
  if (hi) {
    for (let i = 0; i < 6; i++) {
      const cx = -16.5 + i * 6.6;
      k.color(MARBLE).cyl(cx, 11.6, fz, 1.08, 0.94, 17.4, 20);
      // Ornate Corinthian acanthus leaf bell capital & volutes
      k.color(MARBLE_SH).cyl(cx, 28.2, fz, 0.96, 1.35, 1.2, 16);
      k.color(MARBLE).box(cx, 29.4, fz, 2.6, 0.55, 2.6);
    }
    // Flanking square Corinthian corner antae pilasters
    for (const sx of [-20.5, 20.5]) {
      k.color(MARBLE).box(sx, 10.5, fz + 0.4, 2.2, 19.5, 2.2);
      k.color(MARBLE_SH).box(sx, 28.8, fz + 0.4, 2.6, 1.4, 2.6);
    }
  }

  americanFlagBanner(k, 0, 13.5, 26.8, fz - 1.15, 24.5);

  // Classical Entablature, Dentil Cornice & Sculpted Triangular Pediment ("Integrity Protecting the Works of Man")
  k.glow(false).color(MARBLE).box(0, 30.4, fz - 0.2, 44.5, 2.4, 5.2);
  if (hi) {
    k.color(MARBLE_SH);
    for (let dx = -21; dx <= 21; dx += 1.5) k.box(dx, 32.2, fz - 2.75, 0.65, 0.5, 0.45);
  }
  const pz0 = fz - 2.6, pz1 = fz + 2.2;
  k.color(MARBLE_SH);
  k.tri([-22.8, 32.8, pz0], [22.8, 32.8, pz0], [0, 40.2, pz0]);
  k.tri([22.8, 32.8, pz1], [-22.8, 32.8, pz1], [0, 40.2, pz1]);
  k.color(MARBLE);
  k.quadN([-22.8, 32.8, pz0], [0, 40.2, pz0], [0, 40.2, pz1], [-22.8, 32.8, pz1], [-0.4, 1, 0]);
  k.quadN([0, 40.2, pz0], [22.8, 32.8, pz0], [22.8, 32.8, pz1], [0, 40.2, pz1], [0.4, 1, 0]);

  if (hi) {
    // 11 Sculpted allegorical figures in the tympanum centered on winged Integrity
    const figX = [-15, -11.5, -8.2, -5.0, -2.4, 0, 2.4, 5.0, 8.2, 11.5, 15];
    const figH = [1.6, 2.4, 3.3, 4.2, 4.9, 5.8, 4.9, 4.2, 3.3, 2.4, 1.6];
    k.glow(true).color(MARBLE);
    for (let i = 0; i < figX.length; i++) {
      const fx = figX[i], fh = figH[i];
      k.cyl(fx, 33.0, pz0 - 0.35, 0.55, 0.42, fh - 0.5, 8);
      k.sphere(fx, 33.0 + fh - 0.2, pz0 - 0.35, 0.36, 8, 6);
    }
    // Outstretched wings on central Integrity figure
    k.box(-1.1, 36.8, pz0 - 0.25, 1.6, 1.2, 0.25).box(1.1, 36.8, pz0 - 0.25, 1.6, 1.2, 0.25);
    k.glow(false);
  }

  k.pop();
}

function federalHall(k) {
  const hi = k.hi;
  const fx = 26, fz = -12;
  k.push().translate(fx, 0, fz);

  k.glow(false).color(GRANITE);
  for (let s = 0; s < 7; s++) {
    k.box(0, s * 0.52, -17.5 - (6 - s) * 1.1, 28, 0.58, 2.4);
  }
  // George Washington Bronze Statue on granite pedestal at the center of the steps
  k.color(MARBLE_SH).box(0, 1.8, -21.5, 3.0, 3.4, 3.0).box(0, 5.0, -21.5, 3.4, 0.45, 3.4);
  k.color(STATUE_BRONZE).cyl(0, 5.45, -21.5, 0.68, 0.52, 3.4, 12);
  k.sphere(0, 9.15, -21.5, 0.48, 10, 8);
  if (hi) {
    // Outstretched right arm taking the oath of office + ceremonial cape
    k.strut([0.45, 8.2, -21.5], [1.45, 7.6, -22.2], 0.28);
    k.strut([-0.45, 8.2, -21.5], [-0.95, 6.8, -21.5], 0.28);
  }

  k.color(MARBLE).box(0, 3.6, 2, 30, 14.5, 38);
  // 8 Fluted Greek Doric Columns on North & South hexastyle/octastyle porticos
  const colSeg = hi ? 16 : 6;
  for (let i = 0; i < 8; i++) {
    const cx = -12.6 + i * 3.6;
    k.color(MARBLE).cyl(cx, 3.6, -17.5, 0.88, 0.74, 12.8, colSeg);
    if (hi) {
      // Doric echinus & square abacus capital
      k.color(MARBLE_SH).cyl(cx, 16.2, -17.5, 0.74, 1.05, 0.35, 12).box(cx, 16.55, -17.5, 2.1, 0.35, 2.1);
    }
  }
  k.color(MARBLE_SH).box(0, 16.8, 0, 31.2, 2.0, 42);
  if (hi) {
    // Doric triglyph & metope frieze along the entablature
    k.color(MARBLE);
    for (let x = -14; x <= 14; x += 2.0) k.box(x, 17.2, -21.1, 0.55, 1.2, 0.25);
  }
  k.color(MARBLE).tri([-15.6, 18.8, -21.0], [15.6, 18.8, -21.0], [0, 23.2, -21.0]);
  k.color(MARBLE_SH).tri([15.6, 18.8, -16.5], [-15.6, 18.8, -16.5], [0, 23.2, -16.5]);
  k.color(MARBLE);
  k.quadN([-15.6, 18.8, -21.0], [0, 23.2, -21.0], [0, 23.2, -16.5], [-15.6, 18.8, -16.5], [-0.3, 1, 0]);
  k.quadN([0, 23.2, -21.0], [15.6, 18.8, -21.0], [15.6, 18.8, -16.5], [0, 23.2, -16.5], [0.3, 1, 0]);
  // Low saucer Pantheon dome & oculus lantern on roof
  k.color(GRANITE).sphere(0, 18.5, 2, 10.5, hi ? 24 : 8, hi ? 10 : 6, 0.45, 0.5);
  if (hi) k.glow(true).color(LIT).cyl(0, 23.1, 2, 2.2, 2.2, 0.6, 16).glow(false);

  k.pop();
}

export function build(k) {
  const hi = k.hi;
  k.glow(false).color(GRANITE).box(4, -2.5, -2, 105, 3.0, 88);
  nyseBuilding(k);
  federalHall(k);

  if (hi) {
    // Wall Street pedestrian security bollards, ornate cast-iron streetlamps, and the Fearless Girl & Charging Bull bronze sculptures!
    for (let x = -36; x <= 38; x += 9) {
      k.color(0x282d33).cyl(x, 0.5, -26, 0.22, 0.22, 1.1, 8);
      if (x % 18 === 0) {
        k.cyl(x, 0.5, -24, 0.14, 0.09, 4.2, 8);
        k.glow(true).color(LIT).sphere(x, 4.85, -24, 0.36, 8, 6).glow(false);
      }
    }
    // Fearless Girl bronze statue facing the NYSE facade (at x = -16, z = -23.5)
    k.color(STATUE_BRONZE).cyl(-16, 0.5, -23.5, 0.22, 0.16, 1.15, 8).sphere(-16, 1.8, -23.5, 0.16, 8, 6);
    // Wall Street Charging Bull bronze sculpture on cobblestone island (at x = 6, z = 22)
    k.push().translate(6, 0.5, 22).rotateY(-0.4);
    k.color(0x888279).box(0, 0, 0, 4.2, 0.25, 6.8);
    k.color(STATUE_BRONZE).sphere(0, 1.6, 0.5, 1.35, 12, 8, 0.85).sphere(0, 1.85, -1.2, 1.55, 12, 8, 0.92);
    k.sphere(0.2, 1.7, -2.6, 0.85, 10, 8); // lowered charging head
    k.color(GOLD).pipe([-0.5, 2.1, -2.8], [-1.3, 2.5, -3.5], 0.12, 6).pipe([0.8, 2.1, -2.8], [1.6, 2.5, -3.5], 0.12, 6); // horns
    k.color(STATUE_BRONZE);
    for (const [lx, lz] of [[-0.8, -1.6], [0.8, -1.4], [-0.8, 1.5], [0.8, 1.6]]) k.cyl(lx, 0.2, lz, 0.22, 0.16, 1.3, 6);
    k.pop();
  }
}
