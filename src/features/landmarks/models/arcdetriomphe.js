// feature/famous-landmarks: Arc de Triomphe, Paris — 1:1 (50 m tall, 45 m wide, 22 m deep).
// Main arch 29.19 m x 14.62 m through the long faces (local -Z faces down the Champs-Élysées),
// transverse arches 18.68 m x 8.44 m through the short faces, high relief groups on the pier
// fronts, frieze, heavy cornice and attic with shields. Limestone floodlit warm at night.
const STONE = 0xdcd0b4, STONE_DK = 0xc6b998, STONE_LT = 0xe6dcc3, RELIEF = 0xb5a787, SHADOW = 0x8e846e;
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
  // spandrel Victories (relief panels) and the pier relief groups
  k.color(RELIEF);
  for (const z of [-D / 2 - 0.2, D / 2 + 0.2]) {
    for (const sx of [-1, 1]) {
      k.box(sx * (r + 3.2), MA_H - 1.5, z, 4.2, 2.6, 0.4);
      // large high-relief group on a pedestal (e.g. "La Marseillaise")
      const cx = sx * (W / 2 + r) / 2, dz = z < 0 ? -1 : 1;
      k.color(STONE_DK).box(cx, 1.4, z + dz * 0.9, 10.5, 4.2, 2.2);
      k.color(RELIEF);
      k.box(cx, 5.6, z + dz * 0.8, 8.4, 6.5, 1.6);
      k.box(cx - 2.2, 12.1, z + dz * 0.6, 3.0, 2.2, 1.0);   // winged genius above
      k.box(cx + 1.6, 12.1, z + dz * 0.6, 1.4, 3.0, 1.0);
      k.box(cx, 15.6, z + dz * 0.25, 9.6, 0.5, 0.5);        // moulding
      k.box(cx, 18.0, z + dz * 0.2, 9.0, 6.2, 0.4);         // upper bas-relief panel
    }
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
