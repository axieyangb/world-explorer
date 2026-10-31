// feature/famous-landmarks: Statue of Liberty, Liberty Island NY — 1:1 (ground to torch tip 93 m).
// Fort Wood 11-point star (0–6.5 m) with sally port & bastion embrasures, stepped concrete foundation (to 19.8 m),
// Richard Morris Hunt rusticated granite pedestal with doric colonnade loggias & bronze shields (to 46.9 m),
// and Bartholdi's 46.05 m copper statue (sculpted drapery folds, broken shackles & chain at feet, Roman numeral
// tablet, 25-window crown with 7 rays, copper torch gallery balustrade, and multi-tongued 24k gold-leaf flame).
import { Kit } from "../kit.js";

const PATINA = 0x6aa996, PATINA_DK = 0x4f8a79, PATINA_LT = 0x86c0ad;
const GRANITE = 0xc8b9a4, GRANITE_DK = 0xb0a08b, FORT = 0xb9ae98, FORT_TOP = 0xcdc6b2, LAWN = 0x6f8f4e;
const GOLD = 0xffc24a, GOLD_DK = 0xc99a3c;
const BASE = 46.9; // top of pedestal = statue heel

export const lodDist = 1400;
export const glowStrength = 1.5;

export const colliders = [
  { x: 0, z: 0, r: 40, h: 6.5 },
  { x: 0, z: 0, hw: 12.6, hd: 12.6, h: 19.8 },
  { x: 0, z: 0, hw: 9.7, hd: 9.7, h: BASE },
  { x: 0, z: 0, r: 4.6, h: BASE + 33.9 },
  { x: 4.7, z: -0.8, r: 1.8, h: 93 },
];

function pedestal(k) {
  k.color(FORT).extrude(Kit.star(11, 46, 33, -Math.PI / 2), 0, 6.5);
  if (k.hi) {
    k.color(FORT_TOP).extrude(Kit.ngon(22, 31, 0), 6.5, 0.15);
    k.color(LAWN).extrude(Kit.ngon(22, 24, 0), 6.65, 0.05);
    const st = Kit.star(11, 46, 33, -Math.PI / 2);
    k.color(FORT_TOP);
    for (let i = 0; i < st.length; i++) {
      const a = st[i], b = st[(i + 1) % st.length];
      k.strut([a[0] * 0.985, 7.0, a[1] * 0.985], [b[0] * 0.985, 7.0, b[1] * 0.985], 0.9);
      if (i % 2 === 0) {
        k.color(GRANITE_DK).cyl(a[0] * 0.96, 6.5, a[1] * 0.96, 1.4, 1.4, 1.1, 6);
        k.color(FORT_TOP);
      }
    }
    k.color(GRANITE_DK).box(0, 0, -34.5, 5.2, 5.2, 4.5);
    k.color(0x2a2622).box(0, 0, -35.8, 3.2, 4.0, 2.4);
  }
  k.color(GRANITE_DK).taper(0, 6.5, 0, 27.7, 27.7, 25.2, 25.2, 4.5);
  k.color(GRANITE).taper(0, 11.0, 0, 24.4, 24.4, 22.4, 22.4, 4.4);
  k.color(GRANITE_DK).taper(0, 15.4, 0, 21.8, 21.8, 20.3, 20.3, 4.4);
  k.color(GRANITE).box(0, 19.8, 0, 19.4, 3.2, 19.4);
  k.color(GRANITE_DK).box(0, 23.0, 0, 18.4, 1.0, 18.4);
  k.color(GRANITE).taper(0, 24.0, 0, 17.4, 17.4, 16.4, 16.4, 14.5);
  k.color(GRANITE_DK).box(0, 38.5, 0, 18.4, 1.4, 18.4);
  k.color(GRANITE).box(0, 39.9, 0, 17.2, 1.6, 17.2);
  k.color(GRANITE).box(0, 41.5, 0, 15.8, 4.3, 15.8);
  k.color(GRANITE_DK).box(0, 45.8, 0, 16.8, 0.6, 16.8);
  if (k.hi) {
    k.color(GRANITE).box(0, 46.4, 0, 16.6, 0.5, 16.6);
    for (const yh of [25.8, 27.8, 37.2]) {
      k.color(GRANITE_DK).box(0, yh, 0, 17.3, 0.45, 17.3);
    }
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.color(0x4a433b).box(0, 29.5, -8.25, 8.2, 7.2, 0.6);
      for (const cx of [-3.3, -1.1, 1.1, 3.3]) {
        k.color(GRANITE).cyl(cx, 29.5, -8.55, 0.46, 0.42, 7.2, 8);
        k.color(GRANITE_DK).box(cx, 36.4, -8.55, 1.05, 0.35, 1.05);
      }
      k.color(GRANITE_DK).box(0, 36.7, -8.6, 9.4, 0.9, 1.0);
      for (const sx of [-4.2, 0, 4.2]) {
        k.color(0x9c8f7d).box(sx, 42.6, -8.05, 2.2, 2.2, 0.4);
      }
      for (let dx = -7.5; dx <= 7.5; dx += 1.5) {
        k.color(GRANITE).box(dx, 38.1, -8.9, 0.7, 0.45, 0.45);
      }
      k.glow(true).color(0xfff0c8).box(0, 6.7, -18.5, 3.6, 0.45, 0.85).glow(false);
      k.pop();
    }
  }
}

function statue(k) {
  const hi = k.hi;
  const seg = hi ? 28 : 9;
  k.color(PATINA);
  k.push().translate(0, BASE, 0).scale(1, 1, 0.82);
  k.lathe(0, 0, 0, [
    [5.9, 0], [5.7, 1.6], [5.1, 5], [4.6, 9], [4.3, 13.5], [4.25, 18], [4.5, 21.5],
    [4.75, 24.2], [4.55, 26.2], [3.6, 27.4], [1.7, 28.0], [1.15, 28.6],
  ], seg);
  k.pop();
  if (hi) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.12;
      const top = 14 + 8 * Math.abs(Math.sin(a * 1.7));
      const r0 = 5.78, r1 = 4.35;
      k.color(i % 2 === 0 ? PATINA_DK : PATINA_LT);
      k.pipe([Math.cos(a) * r0, BASE + 0.3, Math.sin(a) * r0 * 0.82], [Math.cos(a) * r1, BASE + top, Math.sin(a) * r1 * 0.82], 0.34, 6);
    }
    k.color(PATINA_LT);
    k.pipe([-3.9, BASE + 26.4, -1.2], [3.6, BASE + 15.5, -3.1], 0.85, 8);
    k.pipe([-3.5, BASE + 24.4, -1.6], [3.4, BASE + 13.5, -2.9], 0.68, 7);
    k.pipe([-3.6, BASE + 25.0, 1.9], [3.9, BASE + 13.8, 2.6], 0.8, 8);
    k.color(PATINA_DK).box(1.6, BASE, -5.1, 1.6, 0.7, 1.6);
    for (let t = -2; t <= 2; t++) {
      k.color(PATINA_LT).sphere(1.6 + t * 0.28, BASE + 0.25, -5.9, 0.16, 5, 4);
    }
    k.color(PATINA_DK).torus(-2.2, BASE + 0.35, -4.8, 0.65, 0.18, 10, 6, Math.PI * 1.4);
    for (let c = 0; c < 4; c++) {
      k.torus(-1.1 + c * 0.75, BASE + 0.25, -5.1 - (c % 2) * 0.25, 0.42, 0.14, 8, 5);
    }
  }
  k.color(PATINA).cyl(0, BASE + 27.8, 0, 1.25, 1.1, 1.4, seg);
  k.push().translate(0, BASE + 31.2, -0.1).scale(1, 1.62, 1.1);
  k.sphere(0, 0, 0, 1.6, seg, hi ? 12 : 5);
  k.pop();
  if (hi) {
    k.color(PATINA_DK);
    k.box(0, BASE + 31.35, -1.68, 1.35, 0.22, 0.35);
    for (const ex of [-0.42, 0.42]) {
      k.sphere(ex, BASE + 31.1, -1.65, 0.20, 6, 5);
    }
    k.pyramid(0, BASE + 30.3, -1.85, 0.48, 0.6, 1.15);
    k.box(0, BASE + 29.8, -1.62, 0.76, 0.20, 0.32);
    k.sphere(0, BASE + 29.25, -1.48, 0.38, 6, 5);
    for (const hx of [-1.45, 1.45]) {
      k.pipe([hx, BASE + 32.2, -0.6], [hx * 0.92, BASE + 28.6, 0.3], 0.42, 6);
    }
    k.sphere(0, BASE + 31.0, 1.55, 0.95, 8, 6);
  }
  k.color(PATINA_LT).cyl(0, BASE + 32.4, -0.1, 1.95, 1.75, 1.1, seg);
  if (hi) {
    k.color(PATINA_DK).cyl(0, BASE + 32.35, -0.1, 2.02, 2.02, 0.16, seg);
    k.cyl(0, BASE + 33.4, -0.1, 1.82, 1.82, 0.16, seg);
    k.glow(true).color(0xffe3a0);
    for (let w = 0; w < 15; w++) {
      const a = -Math.PI / 2 + (w - 7) * 0.16;
      k.box(Math.cos(a) * 1.93, BASE + 32.65, Math.sin(a) * 1.93 - 0.1, 0.24, 0.52, 0.2);
    }
    k.glow(false);
  }
  k.color(PATINA_LT);
  for (let i = 0; i < 7; i++) {
    const az = -Math.PI / 2 + (i - 3) * 0.52;
    const len = 3.35;
    const tilt = 0.32 + Math.abs(i - 3) * 0.04;
    const ox = Math.cos(az) * 1.8, oz = Math.sin(az) * 1.8 - 0.1, oy = BASE + 33.2;
    const tip = [ox + Math.cos(az) * Math.cos(tilt) * len, oy + Math.sin(tilt) * len, oz + Math.sin(az) * Math.cos(tilt) * len];
    k.push();
    k.pipe([ox, oy, oz], tip, hi ? 0.28 : 0.4, hi ? 5 : 3);
    k.pop();
  }

  const sh = [3.7, BASE + 26.6, 0.2], el = [4.9, BASE + 33.0, -0.4], hand = [4.75, BASE + 39.2, -0.75];
  k.color(PATINA);
  k.pipe([3.1, BASE + 24.5, 0.3], sh, 2.0, hi ? 10 : 5);
  k.pipe(sh, el, 1.45, hi ? 10 : 5);
  k.pipe(el, hand, 1.05, hi ? 10 : 5);
  k.sphere(sh[0], sh[1], sh[2], 1.95, hi ? 10 : 5, hi ? 6 : 3);
  k.sphere(el[0], el[1], el[2], 1.3, hi ? 8 : 5, hi ? 5 : 3);
  k.sphere(hand[0], hand[1] + 0.3, hand[2], 1.15, hi ? 8 : 5, hi ? 5 : 3);
  const tx = 4.7, tz = -0.8;
  k.color(PATINA_DK).cyl(tx, BASE + 39.4, tz, 0.5, 0.55, 2.3, hi ? 12 : 5);
  k.color(GOLD_DK).cyl(tx, BASE + 41.7, tz, 0.75, 1.55, 1.3, hi ? 16 : 6);
  if (hi) {
    k.color(PATINA_DK).cyl(tx, BASE + 42.9, tz, 1.82, 1.82, 0.28, 16);
    k.cyl(tx, BASE + 43.65, tz, 1.82, 1.82, 0.14, 16);
    for (let p = 0; p < 12; p++) {
      const a = (p / 12) * Math.PI * 2;
      k.cyl(tx + Math.cos(a) * 1.75, BASE + 43.15, tz + Math.sin(a) * 1.75, 0.07, 0.07, 0.52, 4);
    }
  }
  k.glow(true).color(GOLD);
  k.lathe(tx, BASE + 43.25, tz, [[0.6, 0], [1.05, 0.6], [0.95, 1.3], [0.55, 2.1], [0.0, 2.85]], hi ? 14 : 6);
  if (hi) {
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2;
      const fx = tx + Math.cos(fa) * 0.55, fz = tz + Math.sin(fa) * 0.55;
      k.pipe([fx, BASE + 43.7, fz], [tx + Math.cos(fa + 0.5) * 0.25, BASE + 45.8 + (f % 2) * 0.35, tz + Math.sin(fa + 0.5) * 0.25 + 0.25], 0.26, 6);
    }
  }
  k.glow(false);

  const lsh = [-3.8, BASE + 26.2, 0.1], lel = [-4.9, BASE + 20.6, -0.3], lhand = [-4.2, BASE + 22.6, -2.4];
  k.color(PATINA);
  k.sphere(lsh[0], lsh[1], lsh[2], 1.7, hi ? 10 : 5, hi ? 6 : 3);
  k.pipe(lsh, lel, 1.35, hi ? 8 : 5);
  k.pipe(lel, lhand, 1.0, hi ? 8 : 5);
  k.push().translate(-5.7, BASE + 21.3, -1.4).rotateZ(0.22).rotateX(-0.12);
  k.color(PATINA_LT).box(0, -3.6, 0, 0.61, 7.19, 4.14);
  if (hi) {
    k.color(PATINA).box(-0.32, -3.2, 0, 0.08, 6.4, 3.6);
    k.color(PATINA_DK);
    k.box(-0.36, 1.4, 0, 0.09, 0.45, 2.2);
    k.box(-0.36, 0.4, 0, 0.09, 0.45, 2.9);
    for (let fg = 0; fg < 4; fg++) {
      k.color(PATINA_LT).box(-0.38, -0.5 + fg * 0.28, -1.95, 0.32, 0.20, 0.55);
    }
  }
  k.pop();
}

export function build(k) {
  pedestal(k);
  statue(k);
}
