// feature/famous-landmarks: Palace of Fine Arts, Marina SF — 1:1 (ground to dome top 49 m).
// Bernard Maybeck's 1915 Beaux-Arts ruin: open octagonal rotunda (8 arched bays on paired-column
// piers, sculpted attic, drum and ochre dome), flanked by two curved peristyle colonnades crowned
// with the "weeping women" flower boxes, wrapping around the lagoon. Origin = rotunda centre,
// front (-Z) faces the lagoon (east); the colonnade arcs are concave towards the lagoon.
import { Kit } from "../kit.js";

const SALMON = 0xd9a07c, SALMON_DK = 0xbf835f, OCHRE = 0xd49157, DOME = 0xc98650, DOME_DK = 0xae6f40;
const BUFF = 0xe6cba6, BUFF_DK = 0xcfae86, GREEN = 0x7f9a7c, PAVE = 0xcfc4b0;
const SEG = 8, RP = 18.5;                 // octagon: pier centres on radius RP
const APO = RP * Math.cos(Math.PI / SEG); // apothem to the middle of a bay
const SPRING = 16.5, ENT = 23.5, ATTIC = 26, DRUM = 32, DOME0 = 34.5, DR = 15.5, TOP = 49;
// colonnade arcs: centre towards the lagoon
const CZ = -108, RC = 130, PHI0 = 0.21, PHI1 = 1.08, COLH = 12.5;

export const lodDist = 1300;
export const glowStrength = 1.3;

export const colliders = (() => {
  const out = [{ x: 0, z: 0, r: 21, h: TOP }];
  for (let i = -4; i <= 4; i++) {          // exhibition hall
    const p = i * 0.22, r = RC + 34;
    out.push({ x: Math.sin(p) * r, z: CZ + Math.cos(p) * r, hw: (r * 0.22) / 2 + 1, hd: 18, h: 22, rot: (-p * 180) / Math.PI });
  }
  for (const s of [-1, 1]) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const p = PHI0 + ((i + 0.5) / n) * (PHI1 - PHI0), dp = (PHI1 - PHI0) / n;
      const r = RC + 3;
      out.push({ x: s * Math.sin(p) * r, z: CZ + Math.cos(p) * r, hw: (r * dp) / 2 + 0.5, hd: 4.5, h: COLH + 6, rot: (-s * p * 180) / Math.PI });
    }
  }
  return out;
})();

/** Arch-topped panel (rectangle with semicircular opening cut out) in plane z, extruded t towards +Z. */
function spandrel(k, w, y0, y1, ys, r, z, t, seg = 10) {
  const pts = [[-w / 2, -y1], [w / 2, -y1], [w / 2, -ys], [r, -ys]];
  for (let i = 1; i < seg; i++) { const a = (i / seg) * Math.PI; pts.push([Math.cos(a) * r, -(ys + Math.sin(a) * r)]); }
  pts.push([-r, -ys], [-w / 2, -ys]);
  k.push().translate(0, 0, z).rotateX(Math.PI / 2);
  k.extrude(pts, 0, t);
  k.pop();
  if (y0 < ys) {
    // jambs below the springing line
    k.box(-(w / 2 + r) / 2, y0, z + t / 2, w / 2 - r, ys - y0, t);
    k.box((w / 2 + r) / 2, y0, z + t / 2, w / 2 - r, ys - y0, t);
  }
}

/** Curved slab between radii r0..r1 of the colonnade circle, angles p0..p1 (one side s = +-1). */
function arcSlab(k, s, r0, r1, y0, y1, p0, p1, n) {
  const P = (r, p, y) => [s * Math.sin(p) * r, y, CZ + Math.cos(p) * r];
  for (let i = 0; i < n; i++) {
    const a = p0 + ((p1 - p0) * i) / n, b = p0 + ((p1 - p0) * (i + 1)) / n;
    const q = (A, B, C, D) => (s > 0 ? k.quad(A, B, C, D) : k.quad(D, C, B, A));
    q(P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1));    // outer
    q(P(r0, b, y0), P(r0, a, y0), P(r0, a, y1), P(r0, b, y1));    // inner (lagoon side)
    q(P(r0, a, y1), P(r1, a, y1), P(r1, b, y1), P(r0, b, y1));    // top
    q(P(r0, b, y0), P(r1, b, y0), P(r1, a, y0), P(r0, a, y0));    // bottom
  }
  // end caps
  const c = (p, flip) => {
    const A = P(r0, p, y0), B = P(r1, p, y0), C = P(r1, p, y1), D = P(r0, p, y1);
    if ((s > 0) !== flip) k.quad(A, B, C, D); else k.quad(D, C, B, A);
  };
  c(p0, false); c(p1, true);
}

function rotunda(k) {
  const hi = k.hi;
  // stepped octagonal platform
  k.color(PAVE).extrude(Kit.ngon(SEG, 26, Math.PI / SEG), -1.5, 2.1);
  k.color(BUFF_DK).extrude(Kit.ngon(SEG, 23.5, Math.PI / SEG), 0.6, 0.6);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;           // pier angle
    k.push().rotateY(-a + Math.PI / 2).translate(0, 0, -RP);
    // pier
    k.color(SALMON).box(0, 1.2, 0, 4.6, ENT - 1.2, 4.6);
    k.color(BUFF).box(0, 1.2, 0, 5.4, 1.2, 5.4);
    if (hi) {
      // paired corinthian columns on the outer face + capitals
      for (const x of [-1.5, 1.5]) {
        k.color(SALMON_DK).cyl(x, 2.4, -3.0, 0.8, 0.68, 17.6, 10);
        k.color(BUFF).box(x, 20.0, -3.0, 2.0, 1.4, 2.0);
        k.color(BUFF_DK).box(x, 1.2, -3.0, 2.0, 1.2, 2.0);
      }
      k.color(BUFF).box(0, 21.4, -2.6, 5.6, 2.1, 3.4);   // column entablature block
      // flower box / urn on top of the column pair
      k.color(OCHRE).box(0, ENT, -2.8, 4.2, 2.6, 3.2);
      k.color(GREEN).box(0, ENT + 2.6, -2.8, 3.6, 0.7, 2.6);
    }
    k.pop();
    // arched bay between pier i and i+1
    const b = a + Math.PI / SEG;
    k.push().rotateY(-b + Math.PI / 2);
    const w = 2 * RP * Math.sin(Math.PI / SEG) - 4.6;  // clear span between piers
    k.color(SALMON);
    spandrel(k, w + 0.4, SPRING, ENT, SPRING, w / 2 - 0.2, -APO - 1.6, 3.2, hi ? 12 : 6);
    if (hi) { k.color(BUFF).box(0, SPRING + w / 2 - 0.9, -APO - 1.8, 1.4, 1.9, 0.6); } // keystone
    k.pop();
  }
  // entablature, sculpted attic, drum, dome
  k.color(BUFF).extrude(Kit.ngon(SEG, 23.2, Math.PI / SEG), ENT, ATTIC - ENT);
  k.color(SALMON).extrude(Kit.ngon(SEG, 21.6, Math.PI / SEG), ATTIC, DRUM - ATTIC);
  if (hi) {
    // relief panels on the attic faces
    for (let i = 0; i < SEG; i++) {
      k.push().rotateY(-(i + 0.5) * (Math.PI * 2 / SEG) - Math.PI / SEG + Math.PI / 2);
      k.color(BUFF_DK).box(0, ATTIC + 1.2, -21.6 * Math.cos(Math.PI / SEG) - 0.1, 11, 3.8, 0.4);
      k.pop();
    }
  }
  k.color(BUFF).extrude(Kit.ngon(SEG, 22.2, Math.PI / SEG), DRUM - 0.9, 0.9);
  k.color(DOME_DK).cyl(0, DRUM, 0, 17.4, 17.0, DOME0 - DRUM, hi ? 32 : 12);
  k.color(DOME).sphere(0, DOME0, 0, DR, hi ? 32 : 12, hi ? 10 : 5, (TOP - 0.9 - DOME0) / DR, 0.5);
  if (hi) {
    // ribs
    k.color(DOME_DK);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, pts = [];
      for (let j = 0; j <= 6; j++) {
        const t = (j / 6) * (Math.PI / 2) * 0.93;
        const r = Math.cos(t) * (DR + 0.12), y = DOME0 + Math.sin(t) * (TOP - 0.9 - DOME0);
        pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
      k.tube(pts, 0.28, 4);
    }
  }
  k.color(DOME_DK).cyl(0, TOP - 1.4, 0, 2.6, 1.6, 1.4, hi ? 16 : 8);   // oculus ring cap
  // floor under the rotunda
  k.color(PAVE).extrude(Kit.ngon(SEG, 17, Math.PI / SEG), 1.2, 0.05);
  // floodlit interior glow ring (the rotunda is lit warm at night)
  k.glow(true).color(0xf6d9b0).extrude(Kit.ngon(SEG, 16.2, Math.PI / SEG), DRUM - 0.95, 0.1);
  k.glow(false);
}

function colonnades(k) {
  const hi = k.hi;
  for (const s of [-1, 1]) {
    const len = (PHI1 - PHI0) * RC;
    const n = Math.round(len / 5.2);
    // stylobate + entablature + cornice across both rows
    k.color(PAVE).push(); arcSlab(k, s, RC - 2.5, RC + 8.5, -1.0, 1.0, PHI0, PHI1, hi ? 24 : 8); k.pop();
    k.color(BUFF).push(); arcSlab(k, s, RC - 1.2, RC + 7.2, COLH + 1.0, COLH + 3.0, PHI0, PHI1, hi ? 24 : 8); k.pop();
    k.color(BUFF_DK).push(); arcSlab(k, s, RC - 1.6, RC + 7.6, COLH + 3.0, COLH + 3.6, PHI0, PHI1, hi ? 24 : 8); k.pop();
    for (let i = 0; i <= n; i++) {
      const p = PHI0 + ((PHI1 - PHI0) * i) / n;
      for (const r of [RC, RC + 6]) {
        const x = s * Math.sin(p) * r, z = CZ + Math.cos(p) * r;
        if (hi) {
          k.color(BUFF_DK).box(x, 1.0, z, 1.9, 0.8, 1.9);
          k.color(SALMON).cyl(x, 1.8, z, 0.72, 0.6, COLH - 1.8, 10);
          k.color(BUFF).box(x, COLH - 0.2, z, 1.8, 1.2, 1.8);
        } else if (i % 2 === 0) {
          k.color(SALMON).box(x, 1.0, z, 1.3, COLH, 1.3);
        }
      }
      // flower boxes ("weeping women") above every third bay
      if (i % 3 === 0) {
        const r = RC + 3, x = s * Math.sin(p) * r, z = CZ + Math.cos(p) * r;
        k.push().translate(x, COLH + 3.6, z).rotateY(s * p);
        k.color(OCHRE).box(0, 0, 0, 5.2, hi ? 3.4 : 3.0, 7.6);
        if (hi) {
          k.color(BUFF).box(0, 3.4, 0, 5.8, 0.5, 8.2);
          k.color(GREEN).box(0, 3.9, 0, 4.4, 0.9, 6.6);
          k.color(SALMON_DK);
          for (const cx of [-2.4, 2.4]) for (const cz of [-3.6, 3.6]) k.box(cx, 0, cz, 0.7, 3.1, 0.7);
        }
        k.pop();
      }
    }
  }
}

/** The curved exhibition hall (Exploratorium / theatre) wrapping behind the colonnades. */
function hall(k) {
  const hi = k.hi, n = hi ? 40 : 12, p0 = -1.0, p1 = 1.0;
  const HR0 = RC + 16, HR1 = RC + 52;
  for (const s of [1]) {
    const one = (r0, r1, y0, y1, c) => { k.color(c); arcSlab(k, 1, r0, r1, y0, y1, 0, p1, n / 2); arcSlab(k, -1, r0, r1, y0, y1, 0, -p0, n / 2); };
    one(HR0, HR1, 0, 17, 0xd2b795);
    one(HR0 - 0.4, HR1 + 0.4, 17, 18, 0xe0c7a4);
    one(HR0 + 6, HR1 - 6, 18, 22, 0xa39686);   // raised roof
  }
  if (hi) {
    // dark entrance bays on the colonnade-facing (inner) wall
    k.color(0x5f554b);
    for (let i = -6; i <= 6; i++) {
      const p = i * 0.15, r = HR0 - 0.15;
      k.push().translate(Math.sin(p) * r, 0, CZ + Math.cos(p) * r).rotateY(p);
      k.box(0, 0, 0, 5, 7, 0.4);
      k.pop();
    }
  }
}

export function build(k) {
  rotunda(k);
  colonnades(k);
  hall(k);
}
