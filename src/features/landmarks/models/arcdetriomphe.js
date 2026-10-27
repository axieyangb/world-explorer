// feature/famous-landmarks: Arc de Triomphe, Paris — 1:1 (50 m tall, 45 m wide, 22 m deep).
// Main arch 29.19 m x 14.62 m through the long faces (local -Z faces down the Champs-Élysées),
// transverse arches 18.68 m x 8.44 m through the short faces, high relief groups on the pier
// fronts, frieze, heavy cornice and attic with shields. Limestone floodlit warm at night.
const STONE = 0xddd5c1, STONE_DK = 0xc4baa2, STONE_LT = 0xe9e2d0, RELIEF = 0xa89e88, SHADOW = 0x7d7564;
const SCULPT = 0x9a917d, SCULPT_DK = 0x847b69, GRIME = 0xb3a993, COFFER = 0x9c9380;
const W = 45, D = 22, HB = 37.6; // width, depth, top of main body (cornice base)
const MA_W = 14.62, MA_H = 29.19, SA_W = 8.44, SA_H = 18.68;

export const lodDist = 1400;
export const glowStrength = 1.0;

export const colliders = [
  { x: -15, z: -7.4, hw: 7.5, hd: 3.6, h: 50 },
  { x: 15, z: -7.4, hw: 7.5, hd: 3.6, h: 50 },
  { x: -15, z: 7.4, hw: 7.5, hd: 3.6, h: 50 },
  { x: 15, z: 7.4, hw: 7.5, hd: 3.6, h: 50 },
];

// round arch outline points from (-r, ys) over to (r, ys), centre cx
function arcPts(cx, ys, r, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; p.push([cx + Math.cos(a) * r, ys + Math.sin(a) * r]); }
  return p;
}
// extrude an XY polygon through z in [za, zb]
function slabXY(k, pts, za, zb) {
  k.push().rotateX(-Math.PI / 2);
  k.extrude(pts, -zb, zb - za);
  k.pop();
}
// extrude a ZY polygon ([z, y], symmetric in z) through x in [xa, xb]
function slabZY(k, pts, xa, xb) {
  k.push().rotateY(Math.PI / 2).rotateX(-Math.PI / 2);
  k.extrude(pts, -xb, xb - xa);
  k.pop();
}

function body(k) {
  const hi = k.hi, n = hi ? 16 : 8, r = MA_W / 2, rs = SA_W / 2;
  const mainArch = arcPts(0, MA_H - r, r, n);
  const front = [[-W / 2, 0], [-r, 0], ...mainArch, [r, 0], [W / 2, 0], [W / 2, HB], [-W / 2, HB]];
  k.glow(true).color(STONE);
  slabXY(k, front, -D / 2, -rs);
  slabXY(k, front, rs, D / 2);
  // crown over the main vault between the transverse passages
  slabXY(k, [...mainArch.slice().reverse().map(([x, y]) => [x, y]), [-r, HB], [r, HB]].reverse(), -rs, rs);
  // pier middles above the transverse arches
  const sideArch = arcPts(0, SA_H - rs, rs, n);
  const mid = [...sideArch.slice().reverse(), [-rs, HB], [rs, HB]];
  slabZY(k, mid, -W / 2, -r);
  slabZY(k, mid, r, W / 2);
  // vault soffits (darker) so the passages read as deep openings
  k.glow(false).color(SHADOW);
  k.push().translate(0, MA_H - r, 0).rotateX(Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
    const p0 = [Math.cos(a0) * (r - 0.02), Math.sin(a0) * (r - 0.02)], p1 = [Math.cos(a1) * (r - 0.02), Math.sin(a1) * (r - 0.02)];
    // vault surface in rotated frame: x, (z->y) ; rotateX(+90) maps y->z, z->-y
    k.quad([p1[0], -D / 2, -p1[1]], [p0[0], -D / 2, -p0[1]], [p0[0], D / 2, -p0[1]], [p1[0], D / 2, -p1[1]]);
  }
  k.pop();
}

function details(k) {
  const hi = k.hi, r = MA_W / 2;
  // base plinth + impost cornices + archivolts
  k.glow(true).color(STONE_DK);
  for (const sx of [-1, 1]) {
    const cx = sx * (W / 2 + r) / 2, pw = W / 2 - r;
    k.box(cx, 0, 0, pw + 0.6, 1.4, D + 0.6);
    k.box(cx, MA_H - r - 1.0, 0, pw + 0.4, 1.0, D + 0.4); // impost of main arch
  }
  // frieze band and great cornice
  k.color(RELIEF).box(0, 31.2, 0, W + 0.2, 3.4, D + 0.2);
  k.color(STONE_LT).box(0, 34.6, 0, W + 0.5, 0.8, D + 0.5);
  k.color(STONE_DK).box(0, HB, 0, W + 1.8, 1.6, D + 1.8);
  k.color(STONE_LT).box(0, HB + 1.6, 0, W + 2.4, 0.7, D + 2.4);
  // attic
  k.color(STONE).box(0, HB + 2.3, 0, W, 8.6, D);
  k.color(STONE_DK).box(0, HB + 10.9, 0, W + 0.8, 0.9, D + 0.8);
  k.color(STONE).box(0, HB + 11.8, 0, W - 0.4, 0.6, D - 0.4);
  if (!hi) return;
  // attic shields (30 around) + pilaster strips
  k.color(RELIEF);
  const shield = (x, z, nx) => {
    if (nx) k.box(x, HB + 5.4, z, 0.25, 2.2, 1.6); else k.box(x, HB + 5.4, z, 1.6, 2.2, 0.25);
  };
  for (let i = 0; i < 10; i++) { const x = -W / 2 + 2.25 + i * (W - 4.5) / 9; shield(x, -D / 2 - 0.1, false); shield(x, D / 2 + 0.1, false); }
  for (let i = 0; i < 5; i++) { const z = -D / 2 + 2.2 + i * (D - 4.4) / 4; shield(-W / 2 - 0.1, z, true); shield(W / 2 + 0.1, z, true); }
  // main archivolt rings (front/back)
  k.color(STONE_LT);
  for (const z of [-D / 2 - 0.15, D / 2 + 0.15]) {
    const pts = arcPts(0, MA_H - r, r + 0.6, 16).map(([x, y]) => [x, y, z]);
    k.tube(pts, 0.45, 4);
  }
  // spandrel Victories: winged figures leaning into the arch, trumpet raised
  for (const z of [-D / 2 - 0.2, D / 2 + 0.2]) {
    for (const sx of [-1, 1]) {
      k.color(SCULPT);
      k.push().translate(sx * (r + 3.0), MA_H - 2.2, z).rotateZ(sx * 1.15);
      k.box(0, 0, 0, 1.0, 4.6, 0.6);                                   // reclining body
      k.box(-sx * 0.1, 4.6, 0, 0.6, 0.7, 0.6);                         // head
      k.push().translate(sx * 0.5, 2.6, 0).rotateZ(-sx * 0.5);
      k.box(sx * 0.8, 0, 0, 1.8, 2.6, 0.35);                           // swept wing
      k.pop();
      k.pop();
    }
  }
  // the four great high-relief groups on the pier fronts (La Marseillaise, Triumph of 1810, Resistance,
  // Peace): pedestal, a crowd of standing figures, a winged genius above, then the upper bas-relief panel
  const rnd = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
  let n = 0;
  for (const z of [-D / 2 - 0.2, D / 2 + 0.2]) {
    const dz = z < 0 ? -1 : 1;
    for (const sx of [-1, 1]) {
      const cx = sx * (W / 2 + r) / 2;
      k.color(STONE_DK).box(cx, 1.4, z + dz * 0.9, 10.5, 4.2, 2.2);      // pedestal
      k.color(GRIME).box(cx, 1.4, z + dz * 2.02, 10.5, 0.5, 0.04);
      k.color(SCULPT_DK).box(cx, 5.6, z + dz * 0.3, 8.8, 7.4, 0.8);       // shadowed backing
      for (let f = 0; f < 5; f++, n++) {
        const fx = cx + (f - 2) * 1.75 + (rnd(n) - 0.5) * 0.5, fh = 4.6 + rnd(n + 7) * 1.4, fz = z + dz * (1.2 + rnd(n + 3) * 0.5);
        k.color(f % 2 ? SCULPT : SCULPT_DK);
        k.cyl(fx, 5.6, fz, 0.7, 0.45, fh, 6);                              // draped figure
        k.color(SCULPT).sphere(fx, 5.6 + fh + 0.35, fz, 0.38, 6, 4);      // head
        if (f % 2 === 0) k.strut([fx, 5.6 + fh - 1.0, fz], [fx + (rnd(n + 11) - 0.5) * 2.2, 5.6 + fh + 0.9, fz - dz * 0.3], 0.3); // raised arm
      }
      // winged genius flying above the group
      k.color(SCULPT);
      k.push().translate(cx + sx * 0.6, 12.6, z + dz * 0.6).rotateZ(-sx * 0.3);
      k.box(0, -1.2, 0, 1.0, 3.0, 0.7);                                 // body
      k.sphere(0, 2.1, 0, 0.42, 6, 4);                                  // head
      for (const w of [-1, 1]) {
        k.push().translate(w * 0.4, 1.0, 0).rotateZ(w * -0.7);
        k.box(w * 0.2, 0, 0, 0.9, 2.8, 0.3);                            // raised wings
        k.pop();
      }
      k.pop();
      k.color(STONE_LT).box(cx, 15.6, z + dz * 0.25, 9.6, 0.5, 0.5);     // moulding
      // upper bas-relief: framed panel with a frieze of small figures
      k.color(STONE_LT).box(cx, 17.0, z + dz * 0.2, 9.6, 6.6, 0.32);
      k.color(SCULPT).box(cx, 17.4, z + dz * 0.38, 8.6, 5.8, 0.12);
      k.color(SCULPT_DK);
      for (let f = 0; f < 7; f++) {
        const fx = cx + (f - 3) * 1.15 + (rnd(n + f) - 0.5) * 0.4, fh = 3.3 + rnd(n + f + 5) * 0.8;
        k.box(fx, 17.8, z + dz * 0.5, 0.55, fh, 0.18).box(fx, 17.95 + fh, z + dz * 0.5, 0.42, 0.45, 0.18);
      }
      // weathering streaks running down from the cornice
      k.color(GRIME).box(cx + 3.6, 24, z + dz * 0.05, 0.9, 7, 0.04).box(cx - 2.8, 25.5, z + dz * 0.05, 0.7, 5.5, 0.04);
    }
  }
  // grand frieze (the departure and return of the armies): darker band crowded with small figures
  k.color(SCULPT);
  for (const z of [-D / 2 - 0.15, D / 2 + 0.15]) {
    for (let i = 0; i < 46; i++) k.box(-W / 2 + 0.6 + i * ((W - 1.2) / 45), 31.6, z, 0.42, 2.3 + (i % 3) * 0.25, 0.12);
  }
  for (const x of [-W / 2 - 0.15, W / 2 + 0.15]) {
    for (let i = 0; i < 22; i++) k.box(x, 31.6, -D / 2 + 0.6 + i * ((D - 1.2) / 21), 0.12, 2.3 + (i % 3) * 0.25, 0.42);
  }
  // modillions under the great cornice
  k.color(STONE_LT);
  for (const z of [-D / 2 - 0.55, D / 2 + 0.55]) for (let i = 0; i < 30; i++) k.box(-W / 2 + 0.6 + i * ((W - 1.2) / 29), HB - 0.45, z, 0.45, 0.45, 0.5);
  // coffered vault: rosette grid inside the main arch
  k.color(COFFER);
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI, rr = r - 0.06;
    k.push().translate(Math.cos(a) * rr, MA_H - r + Math.sin(a) * rr, 0).rotateZ(a + Math.PI / 2);
    k.box(0, 0, 0, 0.35, 0.12, D - 1);
    k.pop();
  }
  // transverse archivolts
  k.color(STONE_LT);
  for (const sx of [-1, 1]) {
    const pts = arcPts(0, SA_H - SA_W / 2, SA_W / 2 + 0.5, 12).map(([z, y]) => [sx * (W / 2 + 0.15), y, z]);
    k.tube(pts, 0.35, 4);
    k.color(RELIEF).box(sx * (W / 2 + 0.2), 22.5, 0, 0.4, 6, 14);
    k.color(STONE_LT);
  }
}

export function build(k) {
  body(k);
  details(k);
  if (k.hi) {
    // Tomb of the Unknown Soldier: flame (glows) under the vault
    k.glow(false).color(0x6b6355).box(0, 0, 0, 2.2, 0.15, 3.6);
    k.glow(true).color(0xffb347).cyl(0, 0.15, -1.6, 0.25, 0.02, 0.8, 5);
  }
  k.glow(false);
}
