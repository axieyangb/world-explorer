// feature/famous-landmarks: United States Capitol, Washington DC — 1:1 (88 m to the Statue of Freedom).
// 229 x 107 m: the central building with the rotunda, connecting corridors, and the Senate (north) and
// House (south) wings, each with a pedimented Corinthian east portico with sculpted relief figures & flagpoles;
// the central east portico with its pediment & monumental cheek walls; the projecting west front over Olmsted's
// double-dogleg grand staircase terraces. The cast-iron dome: peristyle of 36 fluted columns with brackets,
// windowed attic drum, ribbed dome, tholos lantern and the bronze Statue of Freedom.
// Local: long axis = X (+X = north / Senate), front -Z = west (Mall side, heading 270), +Z = east plaza.
const WHITE = 0xeeebe3, WHITE_DK = 0xd9d4c8, SHADE = 0xc2bcae, WIN = 0x3b3d42, ROOF = 0x8d9394, BRONZE = 0x4d4a3f;
const FLAG_BLUE = 0x1e3264, FLAG_RED = 0xb8262a;
const TAU = Math.PI * 2;
const H = 23;            // main cornice / balustrade height
const SINK = -10;        // blocks reach below the base so the hillside never shows a gap

export const lodDist = 1800;
export const glowStrength = 0.55;
export const colliders = [
  { x: 0, z: 0, hw: 53, hd: 24, h: H + 2 },
  { x: 0, z: -27, hw: 26, hd: 6, h: H },
  { x: 0, z: 0, r: 22, h: 55 },
  { x: 0, z: 0, r: 12, h: 76 },
  { x: 60, z: 0, hw: 8, hd: 16, h: H }, { x: -60, z: 0, hw: 8, hd: 16, h: H },
  { x: 91, z: 0, hw: 23, hd: 37, h: H + 3 }, { x: -91, z: 0, hw: 23, hd: 37, h: H + 3 },
];

// a block with window rows, pilasters, window pediments and a balustrade; windows on faces listed in `faces` (-z, +z, -x, +x)
function block(k, cx, cz, w, d, h, faces = [1, 1, 1, 1]) {
  k.glow(true).color(WHITE).box(cx, SINK, cz, w, h - SINK, d);
  k.color(WHITE_DK).box(cx, h, cz, w + 0.6, 1.0, d + 0.6);           // cornice
  k.color(WHITE).box(cx, h + 1.0, cz, w - 0.4, 1.3, d - 0.4);         // balustrade
  k.color(WHITE_DK).box(cx, 6.2, cz, w + 0.3, 0.6, d + 0.3);          // string course over the rusticated ground floor
  if (!k.hi) return;
  const F = [[0, w, d / 2, -1], [Math.PI, w, d / 2, 1], [-Math.PI / 2, d, w / 2, 1], [Math.PI / 2, d, w / 2, -1]];
  F.forEach(([a, len, half], i) => {
    if (!faces[i]) return;
    k.push().translate(cx, 0, cz).rotateY(a);
    const n = Math.max(1, Math.floor(len / 4.6));
    for (let j = 0; j < n; j++) {
      const x = -len / 2 + (j + 0.5) * (len / n);
      k.glow(false).color(WIN);
      for (const [y0, hh] of [[2.0, 3.0], [8.4, 5.2], [16.0, 3.6]]) {
        k.quad([x + 0.75, y0, -half - 0.05], [x - 0.75, y0, -half - 0.05], [x - 0.75, y0 + hh, -half - 0.05], [x + 0.75, y0 + hh, -half - 0.05]);
      }
      // Corinthian pilaster between window bays & triangular window pediment over main piano nobile windows
      k.glow(true).color(WHITE_DK);
      k.box(x + (len / n) * 0.5, 6.8, -half - 0.15, 0.65, h - 7.2, 0.35);
      k.tri([x + 1.1, 13.8, -half - 0.18], [x - 1.1, 13.8, -half - 0.18], [x, 14.7, -half - 0.18]);
    }
    k.pop();
  });
  k.glow(true);
}

// Corinthian portico on face z = zf (dir -1 = facing -Z, +1 = facing +Z): n columns over width w, depth dd
function portico(k, cx, zf, dir, w, n, dd, pediment) {
  const hi = k.hi, zc = zf + (dir * dd) / 2, h0 = 7.0, ch = H - h0 - 2.4;
  k.glow(true).color(WHITE_DK).box(cx, SINK, zc, w + 2, h0 - SINK, dd);          // podium (the ground floor)
  // steps up to the portico + stepped marble cheek walls & bronze lamp standards
  k.color(WHITE);
  for (let i = 0; i < 8; i++) k.box(cx, SINK, zf + dir * (dd + 6 - i * 0.75), w * 0.6, (h0 - SINK) * ((i + 1) / 8), 0.76);
  if (hi && dir > 0) {
    for (const sx of [-1, 1]) {
      const wx = cx + sx * (w * 0.3 + 1.1);
      k.color(WHITE_DK).box(wx, SINK, zf + dir * (dd + 3.0), 2.2, h0 - SINK + 0.8, 6.4);
      k.color(BRONZE).cyl(wx, h0 + 0.8, zf + dir * (dd + 5.4), 0.25, 0.18, 2.8, 6);
      k.glow(true).color(0xfff2cc).sphere(wx, h0 + 3.8, zf + dir * (dd + 5.4), 0.42, 6, 4);
    }
    // Bronze Columbus Doors at the central portal behind the portico
    k.glow(false).color(BRONZE).box(cx, h0, zf + dir * 0.25, 3.2, 6.8, 0.25).glow(true);
  }
  const seg = hi ? 12 : 6;
  for (const zz of hi ? [zf + dir * (dd - 1.2), zf + dir * (dd - 4.5)] : [zf + dir * (dd - 1.2)]) {
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + 1 + i * ((w - 2) / (n - 1));
      k.color(WHITE).cyl(x, h0, zz, 0.75, 0.64, ch, seg);
      if (hi) {
        k.color(WHITE_DK).cyl(x, h0 + ch - 1.2, zz, 0.66, 0.96, 0.8, 8);
        k.box(x, h0 + ch - 0.4, zz, 1.9, 0.6, 1.9);
      }
    }
  }
  k.color(WHITE_DK).box(cx, H - 2.4, zc, w + 1, 2.4, dd + 0.4);                 // entablature
  k.color(SHADE).box(cx, h0, zf + dir * 0.05, w, ch, 0.3);                      // shaded back wall
  if (pediment) {
    // triangular prism from the wall (zf) to the portico front, double-sided faces
    const zb = zf + dir * (dd + 0.2), ph = w * 0.16, x0 = cx - w / 2 - 0.5, x1 = cx + w / 2 + 0.5;
    const A = [x0, H, zb], B = [x1, H, zb], C = [cx, H + ph, zb];
    k.color(WHITE).tri(A, B, C).tri(C, B, A);
    k.color(ROOF).quad2([x0, H, zf], A, C, [cx, H + ph, zf]).quad2(B, [x1, H, zf], [cx, H + ph, zf], C);
    if (hi) {
      const zt = zb + dir * 0.06, A2 = [x0 + 3, H + 0.8, zt], B2 = [x1 - 3, H + 0.8, zt], C2 = [cx, H + ph - 1.2, zt];
      k.glow(false).color(SHADE).tri(A2, B2, C2).tri(C2, B2, A2);
      // Sculpted marble pediment figures ("Genius of America" / "Progress of Civilization" / "Apotheosis of Democracy")
      k.glow(true).color(WHITE);
      for (const [fx, fh] of [[-w * 0.22, ph * 0.32], [-w * 0.11, ph * 0.48], [0, ph * 0.64], [w * 0.11, ph * 0.48], [w * 0.22, ph * 0.32]]) {
        k.cyl(cx + fx, H + 0.8, zt + dir * 0.15, 0.48, 0.36, fh * 0.8, 6);
        k.sphere(cx + fx, H + 0.8 + fh * 0.88, zt + dir * 0.15, 0.28, 6, 4);
      }
    }
  }
}

function usFlag(k, x, y, z) {
  if (!k.hi) return;
  k.glow(false).color(WHITE_DK).cyl(x, y, z, 0.12, 0.08, 10.5, 6);
  k.color(FLAG_RED).box(x + 1.8, y + 8.8, z, 3.5, 2.0, 0.08);
  k.color(WHITE).box(x + 1.8, y + 9.2, z, 3.5, 0.35, 0.1).box(x + 1.8, y + 9.9, z, 3.5, 0.35, 0.1);
  k.color(FLAG_BLUE).box(x + 0.8, y + 9.8, z, 1.5, 1.0, 0.12);
  k.glow(true);
}

function dome(k) {
  const hi = k.hi, seg = hi ? 36 : 16;
  const Y0 = H + 2.3;
  k.glow(true).color(WHITE_DK).cyl(0, Y0 - 3, 0, 23.5, 23.5, 3.0, seg);          // stepped base
  k.color(WHITE).cyl(0, Y0, 0, 22.5, 22.5, 2.2, seg);
  // peristyle: 36 columns around the drum wall with radial brackets & balustrade
  k.color(SHADE).cyl(0, Y0 + 2.2, 0, 18.6, 18.6, 11, seg);
  if (hi) {
    k.glow(false).color(WIN);
    for (let i = 0; i < 36; i++) {
      const a = ((i + 0.5) / 36) * TAU;
      k.push().rotateY(-a).quad([0.9, Y0 + 4.5, -18.7], [-0.9, Y0 + 4.5, -18.7], [-0.9, Y0 + 10, -18.7], [0.9, Y0 + 10, -18.7]).pop();
    }
    k.glow(true);
  }
  k.color(WHITE);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU, x = Math.cos(a) * 21.3, z = Math.sin(a) * 21.3;
    k.cyl(x, Y0 + 2.2, z, 0.62, 0.55, 9.6, hi ? 10 : 4);
    if (hi) {
      k.color(WHITE_DK).box(x, Y0 + 11.3, z, 1.5, 0.6, 1.5);
      // Radial cast-iron console brackets under the peristyle column ring
      k.strut([Math.cos(a) * 18.6, Y0 + 0.4, Math.sin(a) * 18.6], [x, Y0 + 2.2, z], 0.45);
      // Balustrade posts on top of peristyle entablature
      k.color(WHITE).box(Math.cos(a) * 21.8, Y0 + 13.5, Math.sin(a) * 21.8, 0.45, 1.5, 0.45);
    }
  }
  k.color(WHITE_DK).cyl(0, Y0 + 11.9, 0, 22.3, 22.3, 1.6, seg);                 // entablature
  k.color(WHITE).cyl(0, Y0 + 13.5, 0, 21.6, 21.6, 1.4, seg);                    // balustrade
  // attic drum with windows and pilasters, cornice
  const A0 = Y0 + 13.5;
  k.color(WHITE).cyl(0, A0, 0, 18.4, 18.4, 9.5, seg);
  if (hi) {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      k.push().rotateY(-a);
      k.glow(true).color(WHITE_DK).box(0, A0 + 0.5, -18.5, 0.9, 8.5, 0.4);
      k.box(0.7, A0 + 8.2, -18.5, 1.2, 0.8, 0.35);                              // floral festoon garland above window
      k.glow(false).color(WIN).quad([1.0 + 0.5, A0 + 2.6, -18.45], [0.4 + 0.5, A0 + 2.6, -18.45], [0.4 + 0.5, A0 + 6.6, -18.45], [1.0 + 0.5, A0 + 6.6, -18.45]);
      k.pop();
    }
    k.glow(true);
  }
  k.color(WHITE_DK).cyl(0, A0 + 9.5, 0, 19.0, 19.0, 1.2, seg);
  k.color(WHITE).cyl(0, A0 + 10.7, 0, 17.6, 17.2, 2.4, seg);
  // ribbed dome shell
  const D0 = A0 + 13.1, R = 17.0, DH = 17.5;
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * (Math.PI / 2) * 0.9;
    prof.push([Math.max(4.2, R * Math.cos(t)), (DH * Math.sin(t)) / Math.sin((Math.PI / 2) * 0.9)]);
  }
  k.color(WHITE).lathe(0, D0, 0, prof, seg);
  if (hi) {
    k.color(WHITE_DK);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const pts = prof.map(([r, y]) => [Math.cos(a) * (r + 0.15), D0 + y, Math.sin(a) * (r + 0.15)]);
      for (let j = 0; j < pts.length - 1; j++) k.strut(pts[j], pts[j + 1], 0.45);
    }
    // three tiers of small dormer windows / coffered panels on the dome
    k.glow(false).color(WIN);
    for (const [t, cnt] of [[0.18, 36], [0.45, 36], [0.7, 18]]) {
      const j = Math.floor(t * 10), r = prof[j][0] + 0.2, y = D0 + prof[j][1];
      for (let i = 0; i < cnt; i++) {
        const a = ((i + 0.5) / cnt) * TAU;
        k.push().rotateY(-a).quad([0.45, y, -r], [-0.45, y, -r], [-0.45, y + 1.1, -r], [0.45, y + 1.1, -r]).pop();
      }
    }
    k.glow(true);
  }
  // tholos lantern, its cap & balustrade, the Statue of Freedom
  const L0 = D0 + DH;
  k.color(WHITE).cyl(0, L0, 0, 4.6, 4.6, 1.0, hi ? 16 : 8);
  k.color(SHADE).cyl(0, L0 + 1.0, 0, 3.2, 3.2, 4.6, hi ? 12 : 6);
  if (hi) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.color(WHITE).cyl(Math.cos(a) * 4.0, L0 + 1.0, Math.sin(a) * 4.0, 0.28, 0.25, 4.6, 6);
      k.box(Math.cos(a) * 4.7, L0, Math.sin(a) * 4.7, 0.25, 1.1, 0.25); // tholos gallery railing
    }
  }
  k.color(WHITE_DK).cyl(0, L0 + 5.6, 0, 4.4, 4.4, 0.8, hi ? 16 : 8);
  k.color(WHITE).sphere(0, L0 + 6.4, 0, 3.6, hi ? 16 : 8, 5, 0.75, 0.5);
  k.cyl(0, L0 + 9.0, 0, 1.0, 0.8, 1.6, 8);
  // Statue of Freedom (5.9 m, bronze) on its globe with eagle-feather crest, shield & sword
  k.glow(false).color(BRONZE);
  const S0 = L0 + 10.6;
  k.sphere(0, S0 + 0.4, 0, 0.7, 8, 5);
  k.cyl(0, S0 + 0.9, 0, 0.75, 0.42, 3.4, 8);
  k.sphere(0, S0 + 4.6, 0, 0.36, 6, 4);
  if (hi) {
    k.cyl(0, S0 + 4.8, 0, 0.5, 0.0, 1.2, 6);                                    // eagle-feather helmet crest
    k.strut([0.5, S0 + 2.6, 0], [0.7, S0 + 4.0, -0.3], 0.18);                   // right arm with sheathed sword
    k.cyl(-0.6, S0 + 1.4, -0.2, 0.45, 0.45, 0.16, 8);                           // US shield & laurel wreath
  }
  k.glow(true);
}

export function build(k) {
  const hi = k.hi;
  // central (old) building with the west-front projection
  block(k, 0, 0, 106, 46, H);
  block(k, 0, -27, 52, 10, H, [1, 0, 1, 1]);
  // shallow roofs behind the balustrades + Senate/House chamber skylights
  k.glow(false).color(ROOF).taper(0, H + 1.0, 0, 104, 44, 96, 30, 2.2);
  // connecting corridors and the Senate (+X) / House (-X) wings
  for (const sx of [-1, 1]) {
    block(k, sx * 60.5, 0, 15, 32, H - 1.5, [1, 1, 0, 0]);
    block(k, sx * 91, 0, 46, 74, H);
    k.glow(false).color(ROOF).taper(sx * 91, H + 1.0, 0, 44, 72, 30, 52, 2.6);
    if (hi) {
      // Illuminated chamber roof skylights over Senate (+X) and House (-X)
      k.glow(true).color(0xd8e6f2).box(sx * 91, H + 3.6, 0, 22, 0.4, 34);
    }
    // wing east portico (pediment) and west colonnade
    portico(k, sx * 91, 37, 1, 30, 8, 6, true);
    portico(k, sx * 91, -37, -1, 32, 10, 3.2, false);
    // Senate & House Wing Rooftop Flagpoles (flown when Congress is in session)
    usFlag(k, sx * 91, H + 3.5, 0);
  }
  // central east portico (pediment, double row) and west-front loggia
  portico(k, 0, 23, 1, 42, 8, 9, true);
  portico(k, 0, -32, -1, 30, 8, 3, false);
  // East & West Front Central Flagpoles
  usFlag(k, 0, H + 2.2, 21);
  usFlag(k, 0, H + 2.2, -31);
  // west terrace (Olmsted terrace) below the west front with symmetrical double-dogleg grand staircases
  k.glow(true).color(WHITE_DK).box(0, SINK, -48, 150, 3.5 - SINK, 22);
  k.color(WHITE).box(0, 3.5, -48, 150, 1.0, 22.4);
  for (let i = 0; i < 6; i++) k.color(WHITE_DK).box(0, SINK, -59.5 - i * 0.8, 24, 3.5 - SINK - i * 0.6, 0.8);
  if (hi) {
    // Olmsted West Front Symmetrical Curved/Dogleg Marble Staircases & Central Grotto Fountain Niche
    k.glow(false).color(WIN).box(0, -3.5, -59.1, 6.0, 5.2, 0.4);
    k.glow(true).color(0x70c4e8).box(0, -4.0, -61.2, 8.5, 0.6, 3.5); // Terrace fountain basin
    for (const sx of [-1, 1]) {
      k.color(WHITE);
      k.strut([sx * 8, 3.5, -54], [sx * 22, -2.5, -62], 3.8);
      k.strut([sx * 22, -2.5, -62], [sx * 12, -7.5, -69], 3.8);
      k.color(WHITE_DK).box(sx * 22, SINK, -62, 6.5, -2.0 - SINK, 6.5);
    }
    // Olmsted Terrace parapet piers & bronze lanterns along the 150 m West Front
    for (let x = -72; x <= 72; x += 12) {
      k.color(WHITE_DK).box(x, 3.5, -59.0, 1.4, 1.6, 1.4);
      k.color(BRONZE).cyl(x, 5.1, -59.0, 0.16, 0.12, 1.8, 5);
      k.glow(true).color(0xfff2cc).sphere(x, 7.1, -59.0, 0.3, 6, 4);
    }
  }
  dome(k);
  k.glow(false);
}
