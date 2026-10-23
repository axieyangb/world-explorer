// feature/famous-landmarks: Coit Tower, Telegraph Hill SF — 1:1 (ground to crown 64 m).
// Art-deco fluted unpainted-concrete column (~11.3 m dia) rising from a low square lobby building,
// observation level with tall arched openings, crenellated crown. Front (-Z) = west entrance
// facing the Pioneer Park parking circle. Floodlit white at night.
import { Kit } from "../kit.js";

const CONC = 0xebe6da, CONC_DK = 0xd3cdbf, CONC_LT = 0xf4f0e6, WIN = 0x34373e, PAVE = 0xb8b2a4, ROOF = 0xc9c3b4;
const R = 5.65;          // shaft radius
const SHAFT0 = 7.2, OBS0 = 51.5, OBS1 = 59.4, TOP = 64;

export const lodDist = 1200;
export const glowStrength = 0.72;

export const colliders = [
  { x: 0, z: 0, hw: 14.5, hd: 14.5, h: SHAFT0 },
  { x: 0, z: 0, r: 6.1, h: TOP },
];

/** Arched opening (rect + semicircle) in the plane z, extruded t towards +Z. */
function arch(k, cx, y0, w, h, z, t, seg = 6) {
  const r = w / 2, ys = y0 + h - r;
  const pts = [[cx - r, -y0], [cx + r, -y0]];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI; pts.push([cx + Math.cos(a) * r, -(ys + Math.sin(a) * r)]); }
  k.push().translate(0, 0, z).rotateX(Math.PI / 2);
  k.extrude(pts, 0, t);
  k.pop();
}

function base(k) {
  const hi = k.hi;
  // terrace / plinth and the lobby building (murals inside)
  k.color(PAVE).box(0, -2, 0, 33, 2.4, 33);
  k.color(CONC_DK).box(0, 0, 0, 28.5, 6.4, 28.5);
  k.color(CONC).box(0, 6.4, 0, 29.4, 0.8, 29.4);              // cornice / roof terrace edge
  k.color(ROOF).box(0, 7.2, 0, 27.6, 0.15, 27.6);
  if (hi) {
    k.color(CONC_LT);
    for (const s of [-1, 1]) for (const t of [-1, 1]) k.box(s * 13.6, 7.2, t * 13.6, 1.4, 1.1, 1.4); // corner piers
    // parapet
    k.color(CONC).box(0, 7.2, -14.1, 27.6, 0.9, 0.5).box(0, 7.2, 14.1, 27.6, 0.9, 0.5)
      .box(-14.1, 7.2, 0, 0.5, 0.9, 27.6).box(14.1, 7.2, 0, 0.5, 0.9, 27.6);
    // west entrance loggia: three tall arches + steps
    k.color(WIN);
    for (const x of [-5, 0, 5]) arch(k, x, 0.3, 3.4, 5.2, -14.35, 0.5);
    k.color(PAVE).box(0, -0.4, -16.2, 14, 0.5, 3).box(0, -0.8, -17.6, 16, 0.5, 2.5);
    // small square windows on the other faces
    for (let f = 1; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      for (const x of [-9, -4.5, 0, 4.5, 9]) k.box(x, 2.6, -14.3, 1.6, 2.2, 0.2);
      k.pop();
    }
  }
}

function tower(k) {
  const hi = k.hi;
  k.glow(true);                                         // the whole column is floodlit at night
  // fluted shaft
  k.color(CONC);
  if (hi) k.extrude(Kit.star(32, R, R - 0.32, 0), SHAFT0, OBS0 - 1 - SHAFT0);
  else k.cyl(0, SHAFT0, 0, R, R, OBS0 - 1 - SHAFT0, 10);
  k.color(CONC_LT).cyl(0, SHAFT0, 0, R + 0.35, R + 0.2, 1.6, hi ? 32 : 10); // base moulding
  k.color(CONC_LT).cyl(0, OBS0 - 1, 0, R + 0.1, R + 0.3, 1.0, hi ? 32 : 10); // band under observation level
  // observation level
  k.color(CONC).cyl(0, OBS0, 0, R, R, OBS1 - OBS0, hi ? 32 : 10);
  k.color(CONC_LT).cyl(0, OBS1, 0, R + 0.45, R + 0.45, 1.3, hi ? 32 : 10);   // cornice
  k.color(CONC).cyl(0, OBS1 + 1.3, 0, R + 0.15, R + 0.15, TOP - 0.6 - OBS1 - 1.3, hi ? 32 : 10); // crown parapet
  k.color(CONC_LT).cyl(0, TOP - 0.6, 0, R + 0.3, R + 0.3, 0.6, hi ? 32 : 10);  // crown cap
  k.glow(false);
  // openings (dark by day)
  k.color(WIN);
  const nArch = hi ? 12 : 6;
  for (let i = 0; i < nArch; i++) {
    k.push().rotateY((i / nArch) * Math.PI * 2);
    if (hi) {
      arch(k, 0, OBS0 + 0.8, 1.9, 6.3, -R - 0.06, 0.4);
    } else k.box(0, OBS0 + 0.8, -R - 0.02, 2.2, 6.0, 0.3);
    k.pop();
  }
  if (hi) {
    // crown slots between cornice and cap
    for (let i = 0; i < 24; i++) {
      k.push().rotateY(((i + 0.5) / 24) * Math.PI * 2);
      k.box(0, OBS1 + 1.8, -R - 0.17, 0.6, 1.4, 0.2);
      k.pop();
    }
    // small lobby-door/stair-window slits up the shaft
    for (let y = 14; y < 48; y += 8.5) k.box(0, y, -R - 0.05, 0.7, 1.6, 0.3);
  }
}

export function build(k) {
  base(k);
  tower(k);
}
