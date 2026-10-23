// feature/famous-landmarks: Statue of Liberty, Liberty Island NY — 1:1 (ground to torch tip 93 m).
// Fort Wood 11-point star (0–6.5 m), stepped concrete foundation (to 19.8 m), granite pedestal
// (to 46.9 m), copper statue 46.05 m (heel to torch). Front (-Z) faces the harbour entrance (SE).
import { Kit } from "../kit.js";

const PATINA = 0x6aa996, PATINA_DK = 0x4f8a79, PATINA_LT = 0x86c0ad;
const GRANITE = 0xc8b9a4, GRANITE_DK = 0xb0a08b, FORT = 0xb9ae98, FORT_TOP = 0xcdc6b2, LAWN = 0x6f8f4e;
const GOLD = 0xffc24a, GOLD_DK = 0xc99a3c;
const BASE = 46.9; // top of pedestal = statue heel

export const lodDist = 1400;
export const glowStrength = 1.5;

export const colliders = [
  { x: 0, z: 0, r: 40, h: 6.5 },          // Fort Wood
  { x: 0, z: 0, hw: 12.6, hd: 12.6, h: 19.8 }, // foundation
  { x: 0, z: 0, hw: 9.7, hd: 9.7, h: BASE },   // pedestal
  { x: 0, z: 0, r: 4.6, h: BASE + 33.9 },      // statue to the crown
  { x: 4.7, z: -0.8, r: 1.8, h: 93 },          // raised arm + torch
];

function pedestal(k) {
  // Fort Wood: 11-point star with a lawn courtyard ring and paved terrace
  k.color(FORT).extrude(Kit.star(11, 46, 33, -Math.PI / 2), 0, 6.5);
  if (k.hi) {
    k.color(FORT_TOP).extrude(Kit.ngon(22, 31, 0), 6.5, 0.15);
    k.color(LAWN).extrude(Kit.ngon(22, 24, 0), 6.65, 0.05);
    // parapet lip along star edges
    const st = Kit.star(11, 46, 33, -Math.PI / 2);
    k.color(FORT_TOP);
    for (let i = 0; i < st.length; i++) {
      const a = st[i], b = st[(i + 1) % st.length];
      k.strut([a[0] * 0.985, 7.0, a[1] * 0.985], [b[0] * 0.985, 7.0, b[1] * 0.985], 0.9);
    }
  }
  // stepped foundation (truncated pyramid in three steps)
  k.color(GRANITE_DK).taper(0, 6.5, 0, 27.7, 27.7, 25.2, 25.2, 4.5);
  k.color(GRANITE).taper(0, 11.0, 0, 24.4, 24.4, 22.4, 22.4, 4.4);
  k.color(GRANITE_DK).taper(0, 15.4, 0, 21.8, 21.8, 20.3, 20.3, 4.4);
  // pedestal
  k.color(GRANITE).box(0, 19.8, 0, 19.4, 3.2, 19.4);              // plinth
  k.color(GRANITE_DK).box(0, 23.0, 0, 18.4, 1.0, 18.4);
  k.color(GRANITE).taper(0, 24.0, 0, 17.4, 17.4, 16.4, 16.4, 14.5); // shaft
  k.color(GRANITE_DK).box(0, 38.5, 0, 18.4, 1.4, 18.4);           // cornice
  k.color(GRANITE).box(0, 39.9, 0, 17.2, 1.6, 17.2);
  k.color(GRANITE).box(0, 41.5, 0, 15.8, 4.3, 15.8);              // attic
  k.color(GRANITE_DK).box(0, 45.8, 0, 16.8, 0.6, 16.8);           // balcony slab
  if (k.hi) {
    k.color(GRANITE).box(0, 46.4, 0, 16.6, 0.5, 16.6);           // parapet
    // loggias: recessed dark panel with 2 columns on each face + attic shields
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.color(0x5d554b).box(0, 29.5, -8.25, 7.6, 7.2, 0.5);
      k.color(GRANITE).box(-2.5, 29.5, -8.55, 0.9, 7.2, 0.9).box(2.5, 29.5, -8.55, 0.9, 7.2, 0.9);
      k.color(GRANITE_DK).box(0, 36.7, -8.6, 9.0, 0.9, 1.0);
      k.color(0x9c8f7d).box(0, 42.6, -8.05, 3.2, 2.2, 0.4);
      k.pop();
    }
  }
}

function statue(k) {
  const hi = k.hi;
  const seg = hi ? 24 : 9;
  // robe / body (slightly elliptical, deeper front-to-back folds)
  k.color(PATINA);
  k.push().translate(0, BASE, 0).scale(1, 1, 0.82);
  k.lathe(0, 0, 0, [
    [5.9, 0], [5.7, 1.6], [5.1, 5], [4.6, 9], [4.3, 13.5], [4.25, 18], [4.5, 21.5],
    [4.75, 24.2], [4.55, 26.2], [3.6, 27.4], [1.7, 28.0], [1.15, 28.6],
  ], seg);
  k.pop();
  if (hi) {
    // vertical robe folds
    k.color(PATINA_DK);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17;
      const top = 14 + 7 * Math.abs(Math.sin(a * 1.7));
      const r0 = 5.75, r1 = 4.35;
      k.pipe([Math.cos(a) * r0, BASE + 0.3, Math.sin(a) * r0 * 0.82], [Math.cos(a) * r1, BASE + top, Math.sin(a) * r1 * 0.82], 0.36, 5);
    }
    // diagonal mantle across the chest (left shoulder -> right hip)
    k.color(PATINA_LT);
    k.pipe([-3.9, BASE + 26.4, -1.2], [3.6, BASE + 15.5, -3.1], 0.85, 7);
    k.pipe([-3.6, BASE + 25.0, 1.9], [3.9, BASE + 13.8, 2.6], 0.8, 7);
    // toes of the right foot stepping forward
    k.color(PATINA_DK).box(1.6, BASE, -5.1, 1.6, 0.7, 1.6);
  }
  // head & neck
  k.color(PATINA).cyl(0, BASE + 27.8, 0, 1.25, 1.1, 1.4, seg);
  k.push().translate(0, BASE + 31.2, -0.1).scale(1, 1.62, 1.1);
  k.sphere(0, 0, 0, 1.6, seg, hi ? 10 : 5);
  k.pop();
  if (hi) {
    k.color(PATINA_DK).pyramid(0, BASE + 30.3, -1.85, 0.5, 0.6, 1.2); // nose
    k.color(PATINA_DK).box(0, BASE + 29.8, -1.6, 0.8, 0.2, 0.3);      // lips
    // hair bun at the back
    k.color(PATINA_DK).sphere(0, BASE + 31.0, 1.5, 0.9, 8, 5);
  }
  // crown band + 7 rays fanning across the front
  k.color(PATINA_LT).cyl(0, BASE + 32.4, -0.1, 1.95, 1.75, 1.1, seg);
  if (hi) {
    k.glow(true).color(0xffe3a0);
    for (let w = 0; w < 9; w++) {
      const a = -Math.PI / 2 + (w - 4) * 0.22;
      k.box(Math.cos(a) * 1.93, BASE + 32.7, Math.sin(a) * 1.93 - 0.1, 0.32, 0.4, 0.2);
    }
    k.glow(false);
  }
  k.color(PATINA_LT);
  for (let i = 0; i < 7; i++) {
    const az = -Math.PI / 2 + (i - 3) * 0.52; // spread -78..+78 deg about the front (-Z)
    const len = 3.2;
    const tilt = 0.32 + Math.abs(i - 3) * 0.04;
    const ox = Math.cos(az) * 1.8, oz = Math.sin(az) * 1.8 - 0.1, oy = BASE + 33.2;
    const tip = [ox + Math.cos(az) * Math.cos(tilt) * len, oy + Math.sin(tilt) * len, oz + Math.sin(az) * Math.cos(tilt) * len];
    k.push();
    k.pipe([ox, oy, oz], tip, hi ? 0.28 : 0.4, hi ? 4 : 3);
    k.pop();
  }

  // right arm raised with the torch (statue's right = +X when facing -Z)
  const sh = [3.7, BASE + 26.6, 0.2], el = [4.9, BASE + 33.0, -0.4], hand = [4.75, BASE + 39.2, -0.75];
  k.color(PATINA);
  k.pipe([3.1, BASE + 24.5, 0.3], sh, 2.0, hi ? 9 : 5);  // sleeve at the shoulder
  k.pipe(sh, el, 1.45, hi ? 9 : 5);
  k.pipe(el, hand, 1.05, hi ? 8 : 5);
  k.sphere(sh[0], sh[1], sh[2], 1.95, hi ? 10 : 5, hi ? 6 : 3);
  k.sphere(el[0], el[1], el[2], 1.3, hi ? 8 : 5, hi ? 5 : 3);
  k.sphere(hand[0], hand[1] + 0.3, hand[2], 1.15, hi ? 8 : 5, hi ? 5 : 3);
  // torch: handle, gilded cup/balcony, flame (glows at night)
  const tx = 4.7, tz = -0.8;
  k.color(PATINA_DK).cyl(tx, BASE + 39.4, tz, 0.5, 0.55, 2.3, hi ? 10 : 5);
  k.color(GOLD_DK).cyl(tx, BASE + 41.7, tz, 0.75, 1.55, 1.3, hi ? 14 : 6);
  if (hi) k.color(PATINA_DK).cyl(tx, BASE + 42.9, tz, 1.75, 1.75, 0.35, 14);
  k.glow(true).color(GOLD);
  k.lathe(tx, BASE + 43.25, tz, [[0.6, 0], [1.05, 0.6], [0.95, 1.3], [0.55, 2.1], [0.0, 2.8]], hi ? 12 : 6);
  k.glow(false);

  // left arm cradling the tablet (JULY IV MDCCLXXVI)
  const lsh = [-3.8, BASE + 26.2, 0.1], lel = [-4.9, BASE + 20.6, -0.3], lhand = [-4.2, BASE + 22.6, -2.4];
  k.color(PATINA);
  k.sphere(lsh[0], lsh[1], lsh[2], 1.7, hi ? 10 : 5, hi ? 6 : 3);
  k.pipe(lsh, lel, 1.35, hi ? 8 : 5);
  k.pipe(lel, lhand, 1.0, hi ? 8 : 5);
  k.push().translate(-5.7, BASE + 21.3, -1.4).rotateZ(0.22).rotateX(-0.12);
  k.color(PATINA_LT).box(0, -3.6, 0, 0.61, 7.19, 4.14);
  if (hi) k.color(PATINA_DK).box(-0.33, -1.2, 0, 0.08, 2.4, 2.9);
  k.pop();
}

export function build(k) {
  pedestal(k);
  statue(k);
}
