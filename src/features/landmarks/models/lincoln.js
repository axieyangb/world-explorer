// feature/famous-landmarks: Lincoln Memorial, Washington DC — 1:1 (30 m).
// Greek Doric temple turned sideways: the entrance is the long east side facing the Reflecting Pool.
// 57.8 x 36.1 m colonnade of 36 fluted columns (12 across the front, 8 down each end, 13.4 m tall)
// on a raised granite/marble podium, entablature with carved state names & wreath roundels, recessed attic
// with 36 festoon garlands. Inside the open central chamber & side Ionic colonnades: Daniel Chester French's
// seated Abraham Lincoln statue (with Roman fasces armrests, sculpted hands, boots, bearded head & wall
// inscription), Gettysburg & Second Inaugural Address tablets, and bronze tripod braziers on the East stairs.
const MARBLE = 0xece7dc, MARBLE_DK = 0xd6d0c3, MARBLE_SH = 0xbdb6a8, GRANITE = 0xc9c4b9, STEP = 0xd9d4c8;
const CELLA = 0x4a4540, STATUE = 0xf3efe6, ROOF = 0xb3ada2, BRONZE = 0x5c4f3d;
const W = 57.8, D = 36.1;           // colonnade (stylobate) outline
const P = 4.4;                      // podium top above grade
const COLH = 13.4, CR = 1.13;       // column height / base radius
const Y_ENT = P + 1.0 + COLH;       // entablature base
const Y_ATT = Y_ENT + 4.2;          // attic base

export const lodDist = 1400;
export const glowStrength = 0.5;
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
  if (hi) {
    // 16 Doric vertical flute arris ribs on each Colorado Yule marble column
    k.color(MARBLE_DK);
    for (let f = 0; f < 16; f++) {
      const a = (f / 16) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      k.strut(
        [x + ca * (CR + 0.02), y0 + 0.1, z + sa * (CR + 0.02)],
        [x + ca * (CR * 0.82 + 0.02), y0 + COLH - 1.15, z + sa * (CR * 0.82 + 0.02)],
        0.08
      );
    }
    k.color(MARBLE);
  }
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
  // east stairs: two flights with a landing, cheek-wall buttresses with carved marble tripod braziers
  const sw = 40, z0 = -(D + 10) / 2;
  k.color(STEP);
  const flight = (yTop, yBot, zTop, zBot) => {
    const n = hi ? Math.round((yTop - yBot) / 0.28) : 3;
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
    if (hi) {
      const bx = sx * (sw / 2 + 2), bz = z0 - 4;
      k.color(MARBLE).box(bx, P + 0.6, bz, 3.2, 1.8, 6);
      // Carved pink Tennessee marble Roman tripod braziers & bronze bowls flanking the top of the stairs
      k.color(MARBLE_DK).cyl(bx, P + 2.4, bz, 0.95, 0.72, 1.35, 10);
      k.color(BRONZE).sphere(bx, P + 3.85, bz, 0.85, 8, 5, 0.55);
      // Lower cheek-wall bronze lantern standards
      k.cyl(bx, P * 0.5 + 0.6, z0 - 23, 0.25, 0.16, 2.8, 6);
      k.glow(true).color(0xffe7ab).sphere(bx, P * 0.5 + 3.6, z0 - 23, 0.38, 6, 5);
      k.color(GRANITE);
    }
  }
  // cella (solid marble walls set back inside the colonnade) with the dark open central bay & side Ionic bays
  k.color(MARBLE).box(0, P + 1.0, 0, W - 8, Y_ENT - P - 1.0, D - 8);
  const zf = -(D - 8) / 2 - 0.05;
  k.glow(false).color(CELLA).quad([5.6, P + 1.0, zf], [-5.6, P + 1.0, zf], [-5.6, Y_ENT - 1.5, zf], [5.6, Y_ENT - 1.5, zf]);
  // recess: interior back wall and floor seen through the opening
  k.box(0, P + 1.0, zf + 6.2, 11.2, 0.05, 12.5);
  if (hi) {
    // North & South chamber side openings with 4 interior Ionic columns & Gettysburg / Second Inaugural Address tablets
    for (const sx of [-1, 1]) {
      const cx = sx * 12.6;
      k.glow(false).color(CELLA).quad([cx + 4.4, P + 1.0, zf], [cx - 4.4, P + 1.0, zf], [cx - 4.4, Y_ENT - 2.0, zf], [cx + 4.4, Y_ENT - 2.0, zf]);
      k.glow(true).color(MARBLE_DK);
      k.cyl(cx - 1.8, P + 1.0, zf + 0.8, 0.85, 0.74, COLH - 1.4, 12);
      k.cyl(cx + 1.8, P + 1.0, zf + 0.8, 0.85, 0.74, COLH - 1.4, 12);
      // Engraved limestone speech tablet & Jules Guerin mural frieze on the side wall
      k.color(MARBLE).box(sx * 16.5, P + 2.5, zf + 5.5, 0.35, 6.8, 5.2);
      k.color(0x8c735b).box(sx * 16.5, P + 10.0, zf + 5.5, 0.35, 2.2, 8.5);
    }
    // Royal Cortissoz epitaph wall panel behind Abraham Lincoln ("IN THIS TEMPLE AS IN THE HEARTS OF THE PEOPLE...")
    k.glow(true).color(MARBLE).box(0, P + 10.6, zf + 10.2, 7.6, 2.8, 0.25);
    k.color(MARBLE_SH);
    for (let ly = 0; ly < 4; ly++) {
      k.box(0, P + 11.1 + ly * 0.5, zf + 10.05, 6.2, 0.18, 0.08);
    }
  }
  // Lincoln (5.8 m seated Daniel Chester French sculpture on a 3 m Tennessee marble pedestal) — warm floodlit at night
  k.glow(true).color(STATUE);
  const sz = zf + 7.5, sy = P + 1.05;
  k.box(0, sy, sz, 4.8, 3.0, 4.2);                                   // pedestal
  if (hi) {
    k.color(MARBLE_DK).box(0, sy, sz, 5.4, 0.7, 4.8);                // stepped pedestal base
    k.color(STATUE);
    k.box(0, sy + 3.0, sz + 0.4, 4.2, 2.0, 3.2);                     // curule chair seat
    k.box(0, sy + 3.0, sz + 1.8, 4.4, 5.6, 0.8);                     // high chair back with draped US flag
    // Sculpted armrests with Roman fasces (bound rods of the Union) on the front verticals
    for (const ax of [-1.85, 1.85]) {
      k.box(ax, sy + 3.0, sz + 0.2, 0.65, 3.3, 2.9);
      k.color(MARBLE_DK).cyl(ax, sy + 3.0, sz - 1.28, 0.28, 0.28, 3.2, 8);
      // Lincoln's forearms & sculpted hands resting on the chair arms
      k.color(STATUE).strut([ax * 0.72, sy + 6.8, sz + 0.8], [ax, sy + 6.45, sz - 0.8], 0.52);
      k.sphere(ax, sy + 6.38, sz - 1.15, 0.28, 6, 5);
    }
    k.box(0, sy + 5.0, sz + 0.6, 2.4, 3.3, 1.8);                     // torso & frock coat
    // Legs, knees, shins & angled boots (left foot forward, right foot drawn back)
    k.box(-0.65, sy + 3.2, sz - 0.8, 0.9, 1.8, 2.4); k.box(0.65, sy + 3.2, sz - 1.0, 0.9, 1.8, 2.6);
    k.box(-0.65, sy + 3.0, sz - 1.9, 0.8, 1.9, 0.8); k.box(0.65, sy + 3.0, sz - 2.2, 0.8, 1.9, 0.8);
    k.box(-0.65, sy + 3.0, sz - 2.45, 0.72, 0.45, 1.2); k.box(0.65, sy + 3.0, sz - 2.75, 0.72, 0.45, 1.2);
    // Neck, collar, bearded head, brow, nose & wavy hair
    k.cyl(0, sy + 8.1, sz + 0.55, 0.42, 0.38, 0.6, 8);
    k.sphere(0, sy + 9.0, sz + 0.45, 0.65, 10, 8, 1.22);
    k.color(MARBLE_DK).box(0, sy + 8.55, sz - 0.05, 0.68, 0.52, 0.45); // beard
    k.color(STATUE).pyramid(0, sy + 8.95, sz - 0.22, 0.22, 0.26, 0.38); // nose
  } else {
    k.box(0, sy + 3.0, sz + 0.5, 3.6, 6.4, 3.0);
  }
  // colonnade: 12 x 8 (36 columns representing the 36 states in the Union at Lincoln's death)
  k.glow(true).color(MARBLE);
  const xs = spread(12, W), zs = spread(8, D);
  for (const x of xs) { column(k, x, -D / 2 + 1.5); column(k, x, D / 2 - 1.5); }
  for (const z of zs.slice(1, -1)) { column(k, -W / 2 + 1.5, z); column(k, W / 2 - 1.5, z); }
  // entablature: architrave, frieze (with 48 state-name panels & double pine-cone wreath roundels), projecting cornice
  k.color(MARBLE).box(0, Y_ENT, 0, W, 1.4, D);
  k.color(MARBLE_DK).box(0, Y_ENT + 1.4, 0, W, 1.9, D);
  if (hi) {
    k.glow(false).color(MARBLE_SH);
    for (let i = 0; i < 12; i++) {
      const x = xs[i];
      for (const z of [-D / 2 - 0.05, D / 2 + 0.05]) {
        k.torus(x, Y_ENT + 2.35, z, 0.48, 0.12, 10, 5);
        if (i < 11) {
          // Carved State Name inscription plaque between wreaths
          k.box((xs[i] + xs[i + 1]) * 0.5, Y_ENT + 2.2, z, 2.2, 0.45, 0.06);
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) {
        k.box(x, Y_ENT + 2.05, zs[i], 0.12, 0.85, 0.85);
      }
    }
    // Lion-head waterspout antefixes along the projecting main cornice
    k.glow(true).color(MARBLE);
    for (let i = 0; i < 12; i++) {
      for (const z of [-D / 2 - 0.75, D / 2 + 0.75]) k.box(xs[i], Y_ENT + 3.65, z, 0.45, 0.45, 0.35);
    }
  }
  k.color(MARBLE).box(0, Y_ENT + 3.3, 0, W + 1.4, 0.9, D + 1.4);
  // recessed attic with its own cornice, 48 state festoon garlands & eagles, and the flat roof
  k.color(MARBLE).box(0, Y_ATT, 0, W - 7, 5.2, D - 7);
  if (hi) {
    k.glow(false).color(MARBLE_SH);
    for (let i = 0; i < 12; i++) {
      const fx = -W / 2 + 6 + i * ((W - 12) / 11);
      for (const fz of [-(D - 7) / 2 - 0.06, (D - 7) / 2 + 0.06]) {
        k.box(fx, Y_ATT + 1.6, fz, 2.6, 1.0, 0.12); // carved floral festoons supported by eagles
        k.box(fx - 1.3, Y_ATT + 2.0, fz, 0.42, 0.85, 0.16);
      }
    }
    k.glow(true);
  }
  k.color(MARBLE_DK).box(0, Y_ATT + 5.2, 0, W - 6, 0.9, D - 6);
  k.glow(false).color(ROOF).box(0, Y_ATT + 6.1, 0, W - 10, 0.5, D - 10);
}
