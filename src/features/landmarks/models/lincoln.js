// feature/famous-landmarks: Lincoln Memorial, Washington DC — 1:1 (30 m).
// Greek Doric temple turned sideways: the entrance is the long east side facing the Reflecting Pool.
// 57.8 x 36.1 m colonnade of 36 fluted columns (12 across the front, 8 down each end, 13.4 m tall)
// on a raised granite/marble podium, plain entablature with the frieze of state names, recessed attic.
// Through the open central bay: the dark cella and the seated statue of Lincoln. Broad stair flights
// with a mid landing and cheek-wall buttresses descend east. Floodlit at night, warm-lit cella.
// Local: long axis = X (north-south), front -Z = east (heading 90).
const MARBLE = 0xece7dc, MARBLE_DK = 0xd6d0c3, MARBLE_SH = 0xbdb6a8, GRANITE = 0xc9c4b9, STEP = 0xd9d4c8;
const CELLA = 0x4a4540, STATUE = 0xf3efe6, ROOF = 0xb3ada2;
const W = 57.8, D = 36.1;           // colonnade (stylobate) outline
const P = 4.4;                      // podium top above grade
const COLH = 13.4, CR = 1.13;       // column height / base radius
const Y_ENT = P + 1.0 + COLH;       // entablature base
const Y_ATT = Y_ENT + 4.2;          // attic base

export const lodDist = 1400;
export const glowStrength = 1.0;
export const colliders = [
  { x: 0, z: 0, hw: W / 2 + 1, hd: D / 2 + 1, h: Y_ATT },
  { x: 0, z: 0, hw: W / 2 - 4, hd: D / 2 - 4, h: 30 },
  { x: 0, z: -D / 2 - 14, hw: 21, hd: 9, h: 3.2 },
];

// x positions of n columns spread over length L (corner columns flush with the stylobate edge)
const spread = (n, L) => Array.from({ length: n }, (_, i) => -L / 2 + 1.5 + i * ((L - 3) / (n - 1)));

function column(k, x, z) {
  const hi = k.hi, seg = hi ? 16 : 6, y0 = P + 1.0;
  k.cyl(x, y0, z, CR, CR * 0.82, COLH - 1.1, seg, { smooth: !hi });
  k.cyl(x, y0 + COLH - 1.1, z, CR * 0.84, CR * 1.12, 0.5, seg);
  k.box(x, y0 + COLH - 0.6, z, CR * 2.6, 0.6, CR * 2.6);
}

export function build(k) {
  const hi = k.hi;
  // podium: thick block (reaches below grade so a slope never shows a gap), coping, stylobate steps
  k.glow(true).color(GRANITE).box(0, -4, 0, W + 10, P + 4, D + 10);
  k.color(MARBLE_DK).box(0, P - 0.4, 0, W + 10.6, 0.4, D + 10.6);
  k.color(MARBLE).box(0, P, 0, W + 3.2, 0.5, D + 3.2);
  k.box(0, P + 0.5, 0, W + 1.6, 0.5, D + 1.6);
  // east stairs: two flights with a landing, cheek-wall buttresses with blocks (tripods omitted)
  const sw = 40, z0 = -(D + 10) / 2;
  k.color(STEP);
  const flight = (yTop, yBot, zTop, zBot) => {
    const n = hi ? Math.round((yTop - yBot) / 0.32) : 3;
    for (let i = 0; i < n; i++) {
      const y = yBot + ((yTop - yBot) * i) / n, zz = zBot + ((zTop - zBot) * i) / n;
      k.box(0, -3, (zz + zTop) / 2, sw, y + 3 + (yTop - yBot) / n, Math.abs(zTop - zz) + 0.01);
    }
  };
  flight(P, P * 0.5, z0, z0 - 12);
  k.box(0, -3, z0 - 17, sw, P * 0.5 + 3, 10);             // landing terrace
  flight(P * 0.5, 0, z0 - 22, z0 - 40);
  k.color(GRANITE);
  for (const sx of [-1, 1]) {
    k.box(sx * (sw / 2 + 2), -3, z0 - 11, 4, P + 3.6, 22);
    k.box(sx * (sw / 2 + 2), -3, z0 - 31, 4, P * 0.5 + 3.6, 18);
    if (hi) k.color(MARBLE).box(sx * (sw / 2 + 2), P + 0.6, z0 - 4, 3.2, 1.8, 6).color(GRANITE);
  }
  // cella (solid marble walls set back inside the colonnade) with the dark open central bay
  k.color(MARBLE).box(0, P + 1.0, 0, W - 8, Y_ENT - P - 1.0, D - 8);
  const zf = -(D - 8) / 2 - 0.05;
  k.glow(false).color(CELLA).quad([5.2, P + 1.0, zf], [-5.2, P + 1.0, zf], [-5.2, Y_ENT - 1.5, zf], [5.2, Y_ENT - 1.5, zf]);
  // recess: interior back wall and floor seen through the opening
  k.box(0, P + 1.0, zf + 6.2, 10.2, 0.05, 12);
  // Lincoln (5.8 m seated, on a 3 m pedestal) — warm floodlit at night
  k.glow(true).color(STATUE);
  const sz = zf + 7.5, sy = P + 1.05;
  k.box(0, sy, sz, 4.8, 3.0, 4.2);                                   // pedestal
  if (hi) {
    k.box(0, sy + 3.0, sz + 0.4, 4.2, 2.0, 3.2);                     // chair seat
    k.box(0, sy + 3.0, sz + 1.8, 4.4, 5.6, 0.8);                     // chair back
    k.box(0, sy + 5.0, sz + 0.6, 2.4, 3.3, 1.8);                     // torso
    k.box(-0.6, sy + 3.2, sz - 0.9, 0.9, 1.8, 2.4); k.box(0.6, sy + 3.2, sz - 0.9, 0.9, 1.8, 2.4); // knees
    k.box(-0.6, sy + 3.0, sz - 2.0, 0.8, 1.9, 0.8); k.box(0.6, sy + 3.0, sz - 2.0, 0.8, 1.9, 0.8); // shins
    k.sphere(0, sy + 8.9, sz + 0.5, 0.65, 8, 5, 1.2);               // head
  } else k.box(0, sy + 3.0, sz + 0.5, 3.6, 6.4, 3.0);
  // colonnade: 12 x 8 (36 columns)
  k.glow(true).color(MARBLE);
  const xs = spread(12, W), zs = spread(8, D);
  for (const x of xs) { column(k, x, -D / 2 + 1.5); column(k, x, D / 2 - 1.5); }
  for (const z of zs.slice(1, -1)) { column(k, -W / 2 + 1.5, z); column(k, W / 2 - 1.5, z); }
  // entablature: architrave, frieze (with state-name panels), projecting cornice
  k.color(MARBLE).box(0, Y_ENT, 0, W, 1.4, D);
  k.color(MARBLE_DK).box(0, Y_ENT + 1.4, 0, W, 1.9, D);
  if (hi) {
    k.glow(false).color(MARBLE_SH);
    for (let i = 0; i < 12; i++) { // wreath roundels between the state names, front and back
      const x = (xs[i]);
      for (const z of [-D / 2 - 0.04, D / 2 + 0.04]) k.box(x, Y_ENT + 2.05, z, 0.8, 0.8, 0.08);
    }
    for (let i = 0; i < 8; i++) for (const x of [-W / 2 - 0.04, W / 2 + 0.04]) k.box(x, Y_ENT + 2.05, zs[i], 0.08, 0.8, 0.8);
    k.glow(true);
  }
  k.color(MARBLE).box(0, Y_ENT + 3.3, 0, W + 1.4, 0.9, D + 1.4);
  // recessed attic with its own cornice and the flat roof (skylight lantern)
  k.color(MARBLE).box(0, Y_ATT, 0, W - 7, 5.2, D - 7);
  if (hi) {
    k.glow(false).color(MARBLE_SH);
    for (let i = 0; i < 12; i++) k.box(-W / 2 + 6 + i * ((W - 12) / 11), Y_ATT + 1.6, -(D - 7) / 2 - 0.05, 2.6, 1.0, 0.1); // festoons
    k.glow(true);
  }
  k.color(MARBLE_DK).box(0, Y_ATT + 5.2, 0, W - 6, 0.9, D - 6);
  k.glow(false).color(ROOF).box(0, Y_ATT + 6.1, 0, W - 10, 0.5, D - 10);
}
