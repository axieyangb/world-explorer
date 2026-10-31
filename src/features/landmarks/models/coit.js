// feature/famous-landmarks: Coit Tower, Telegraph Hill SF — 1:1 (ground to crown 64 m).
// Art-deco fluted unpainted-concrete column (~11.3 m dia) rising from a low square lobby building,
// observation level with tall arched openings, crenellated crown. Front (-Z) = west entrance
// facing the Pioneer Park parking circle with Columbus statue. Floodlit white at night.
import { Kit } from "../kit.js";

const CONC = 0xebe6da, CONC_DK = 0xd3cdbf, CONC_LT = 0xf4f0e6, WIN = 0x34373e, PAVE = 0xb8b2a4, ROOF = 0xc9c3b4;
const BRONZE = 0x4a5846, LAWN = 0x4d8242, MURAL_GOLD = 0xffdf9a;
const R = 5.65;          // shaft radius
const SHAFT0 = 7.2, OBS0 = 51.5, OBS1 = 59.4, TOP = 64;

export const lodDist = 1200;
export const glowStrength = 0.72;

export const colliders = [
  { x: 0, z: 0, hw: 14.5, hd: 14.5, h: SHAFT0 },
  { x: 0, z: 0, r: 6.1, h: TOP },
];

/** Arched opening (rect + semicircle) in the plane z, extruded t towards +Z. */
function arch(k, cx, y0, w, h, z, t, seg = 8) {
  const r = w / 2, ys = y0 + h - r;
  const pts = [[cx - r, -y0], [cx + r, -y0]];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; pts.push([cx + Math.cos(a) * r, -(ys + Math.sin(a) * r)]); }
  k.push().translate(0, 0, z).rotateX(Math.PI / 2);
  k.extrude(pts, 0, t);
  k.pop();
}

function base(k) {
  const hi = k.hi;
  // terrace / plinth and the lobby building (WPA murals inside)
  k.color(PAVE).box(0, -2, 0, 35, 2.4, 35);
  k.color(CONC_DK).box(0, 0, 0, 28.5, 6.4, 28.5);
  k.color(CONC).box(0, 6.4, 0, 29.4, 0.8, 29.4);              // cornice / roof terrace edge
  k.color(ROOF).box(0, 7.2, 0, 27.6, 0.15, 27.6);
  if (hi) {
    // Pioneer Park circular turnaround apron & central Christopher Columbus bronze statue on stone pedestal (-Z side)
    k.color(PAVE).cyl(0, -1.8, -26, 13.5, 14.5, 2.0, 28);
    k.color(LAWN).cyl(0, 0.2, -26, 7.2, 7.5, 0.35, 24);
    k.color(CONC_DK).box(0, 0.5, -26, 2.6, 2.8, 2.6).box(0, 3.3, -26, 2.0, 0.5, 2.0);
    k.color(BRONZE).cyl(0, 3.8, -26, 0.48, 0.38, 2.5, 10).sphere(0, 6.5, -26, 0.32, 8, 6);
    // Low stone perimeter balustrade wall with viewing telescopes overlooking the Bay
    k.color(CONC_DK).torus(0, 0.65, -26, 13.2, 0.45, 24, 6, Math.PI);

    k.color(CONC_LT);
    for (const s of [-1, 1]) for (const t of [-1, 1]) k.box(s * 13.6, 7.2, t * 13.6, 1.4, 1.1, 1.4); // corner piers
    // Art Deco fluted roof parapet with vertical relief slots
    k.color(CONC).box(0, 7.2, -14.1, 27.6, 0.9, 0.5).box(0, 7.2, 14.1, 27.6, 0.9, 0.5)
      .box(-14.1, 7.2, 0, 0.5, 0.9, 27.6).box(14.1, 7.2, 0, 0.5, 0.9, 27.6);
    k.color(CONC_DK);
    for (let x = -11; x <= 11; x += 2.2) {
      k.box(x, 7.35, -14.38, 0.35, 0.6, 0.12).box(x, 7.35, 14.38, 0.35, 0.6, 0.12);
      k.box(-14.38, 7.35, x, 0.12, 0.6, 0.35).box(14.38, 7.35, x, 0.12, 0.6, 0.35);
    }
    // west entrance loggia: three tall arches + Art Deco eagle relief keystone + warm WPA mural glow inside
    for (const x of [-5, 0, 5]) {
      k.glow(false).color(CONC_LT);
      arch(k, x, 0.3, 3.8, 5.5, -14.3, 0.25);
      k.color(WIN);
      arch(k, x, 0.3, 3.4, 5.2, -14.36, 0.5);
      k.glow(true).color(MURAL_GOLD).box(x, 0.8, -14.22, 2.6, 3.8, 0.15);
      // Art Deco bronze transom grille & keystone ornament
      k.glow(false).color(BRONZE).box(x, 3.6, -14.38, 3.3, 0.22, 0.18).box(x, 0.3, -14.38, 0.22, 4.8, 0.18);
      k.color(CONC_LT).box(x, 5.3, -14.42, 0.65, 0.85, 0.28);
    }
    k.color(PAVE).box(0, -0.4, -16.2, 14, 0.5, 3).box(0, -0.8, -17.6, 16, 0.5, 2.5);
    // small square windows with Art Deco grilles & WPA mural glow on the other faces
    for (let f = 1; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (const x of [-9, -4.5, 0, 4.5, 9]) {
        k.glow(false).color(CONC_LT).box(x, 2.4, -14.28, 2.0, 2.6, 0.18);
        k.color(WIN).box(x, 2.6, -14.32, 1.6, 2.2, 0.2);
        k.glow(true).color(MURAL_GOLD).box(x, 2.75, -14.34, 1.3, 1.8, 0.16);
      }
      k.pop();
    }
    k.glow(false);
  }
}

function tower(k) {
  const hi = k.hi;
  k.glow(true);                                         // the whole column is floodlit at night
  // fluted shaft (24 deep Art Deco flutes)
  k.color(CONC);
  if (hi) k.extrude(Kit.star(24, R, R - 0.36, 0), SHAFT0, OBS0 - 1 - SHAFT0);
  else k.cyl(0, SHAFT0, 0, R, R, OBS0 - 1 - SHAFT0, 10);
  k.color(CONC_LT).cyl(0, SHAFT0, 0, R + 0.45, R + 0.25, 1.8, hi ? 32 : 10); // stepped Art Deco base collar
  if (hi) k.color(CONC_DK).cyl(0, SHAFT0 + 1.8, 0, R + 0.22, R + 0.12, 0.8, 32);
  // Entasis necking rings under observation belvedere
  k.color(CONC_LT).cyl(0, OBS0 - 1.6, 0, R + 0.15, R + 0.35, 0.8, hi ? 32 : 10);
  k.color(CONC_DK).cyl(0, OBS0 - 0.8, 0, R + 0.35, R + 0.42, 0.8, hi ? 32 : 10);
  // observation level
  k.color(CONC).cyl(0, OBS0, 0, R, R, OBS1 - OBS0, hi ? 32 : 10);
  k.color(CONC_LT).cyl(0, OBS1, 0, R + 0.48, R + 0.48, 1.3, hi ? 32 : 10);   // cornice
  k.color(CONC).cyl(0, OBS1 + 1.3, 0, R + 0.15, R + 0.15, TOP - 0.6 - OBS1 - 1.3, hi ? 32 : 10); // crown parapet
  k.color(CONC_LT).cyl(0, TOP - 0.6, 0, R + 0.32, R + 0.32, 0.6, hi ? 32 : 10);  // crown cap
  if (hi) {
    // Stepped Art Deco penthouse lantern drum & lightning finial on top of crown
    k.color(CONC_DK).cyl(0, TOP, 0, 3.2, 2.9, 1.6, 24);
    k.color(CONC_LT).dome(0, TOP + 1.6, 0, 2.8, 20, 8, 0.45);
    k.glow(false).color(BRONZE).cyl(0, TOP + 2.8, 0, 0.08, 0.03, 2.8, 8);
  }
  k.glow(false);
  // 12 Belvedere arched openings with Art Deco colonnette piers, bronze balustrades & warm interior glow
  const nArch = hi ? 12 : 6;
  for (let i = 0; i < nArch; i++) {
    k.push().rotateY((i / nArch) * Math.PI * 2);
    if (hi) {
      k.glow(false).color(WIN);
      arch(k, 0, OBS0 + 0.8, 1.9, 6.3, -R - 0.06, 0.4);
      // Warm interior observation gallery glow + bronze safety railing & mullion crossbars
      k.glow(true).color(MURAL_GOLD).box(0, OBS0 + 1.2, -R + 0.08, 1.5, 4.6, 0.15);
      k.glow(false).color(BRONZE);
      k.box(0, OBS0 + 1.4, -R - 0.12, 1.85, 0.18, 0.18);
      k.box(0, OBS0 + 0.8, -R - 0.12, 0.14, 5.8, 0.16);
      // Fluted pier pilaster between belvedere arches
      k.color(CONC_LT).box(1.42, OBS0 + 0.4, -R - 0.12, 0.55, 7.1, 0.28);
    } else {
      k.color(WIN).box(0, OBS0 + 0.8, -R - 0.02, 2.2, 6.0, 0.3);
    }
    k.pop();
  }
  if (hi) {
    // 24 crenellated Art Deco crown slots & vertical relief fins between cornice and cap
    for (let i = 0; i < 24; i++) {
      k.push().rotateY(((i + 0.5) / 24) * Math.PI * 2);
      k.color(WIN).box(0, OBS1 + 1.6, -R - 0.17, 0.58, 1.7, 0.22);
      k.color(CONC_LT).box(0.68, OBS1 + 1.3, -R - 0.22, 0.34, 2.7, 0.26);
      k.pop();
    }
    // Staircase window slits up the shaft on N/S/E/W axes
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (let y = 14; y < 48; y += 7.5) {
        k.glow(false).color(WIN).box(0, y, -R - 0.05, 0.68, 1.7, 0.3);
        k.glow(true).color(MURAL_GOLD).box(0, y + 0.15, -R - 0.07, 0.42, 1.35, 0.2);
      }
      k.pop();
    }
    k.glow(false);
  }
}

export function build(k) {
  base(k);
  tower(k);
}
