// feature/famous-landmarks: Parthenon, Acropolis of Athens — 1:1 (13.7 m to the cornice, ~19 m to the pediment apex).
// Doric peripteral temple, stylobate 69.5 x 30.9 m on three steps; 8 x 17 fluted columns (10.4 m, 1.9 m
// diameter) with echinus capitals, architrave, triglyph frieze, cornice, the two pediments. Shown as the ruin
// it is today: roofless, the cella reduced to the west chamber walls and the inner porch columns, gaps in the
// middle of the long colonnades (1687 explosion). Sits on a patch of Acropolis rock. Floodlit at night.
// Local: axis = Z, front -Z = east facade (heading 77.1), +X = south side.
const MARBLE = 0xdccfb3, MARBLE_DK = 0xc6b694, MARBLE_SH = 0xab9a78, ROCK = 0xa89a83, ROCK_DK = 0x8f826d;
const TAU = Math.PI * 2;
const SW = 30.9, SL = 69.5;               // stylobate
const ST = 1.6;                           // three steps total
const CH = 10.43, CR = 0.95;              // column height / lower radius
const Y_ENT = ST + CH;                    // entablature base

export const lodDist = 1300;
export const glowStrength = 0.65;
export const colliders = [
  { x: 0, z: 0, hw: SW / 2 + 1.2, hd: SL / 2 + 1.2, h: ST },
  { x: -SW / 2 + 1.2, z: 0, hw: 1.3, hd: SL / 2, h: Y_ENT + 3.3 },
  { x: SW / 2 - 1.2, z: 0, hw: 1.3, hd: SL / 2, h: Y_ENT + 3.3 },
  { x: 0, z: -SL / 2 + 1.2, hw: SW / 2, hd: 1.3, h: Y_ENT + 3.3 },
  { x: 0, z: SL / 2 - 1.2, hw: SW / 2, hd: 1.3, h: Y_ENT + 3.3 },
  { x: 0, z: 17, hw: 10, hd: 6, h: 9 },
];

const front = Array.from({ length: 8 }, (_, i) => -SW / 2 + 1.2 + i * ((SW - 2.4) / 7));
const side = Array.from({ length: 17 }, (_, i) => -SL / 2 + 1.2 + i * ((SL - 2.4) / 16));
// long-side columns lost in 1687 (index along the side, 0 = east end): north re-erected in part, south gap
const LOST = { [-1]: new Set([7, 8, 9]), [1]: new Set([6, 7, 8, 9, 10]) };

function column(k, x, z, h = CH) {
  const hi = k.hi, seg = hi ? 20 : 6;
  // entasis: slightly swelling taper; flutes = flat facets (smooth: false)
  k.color(MARBLE).lathe(x, ST, z, [[CR, 0], [CR * 0.95, h * 0.4], [CR * 0.8, h - 0.9]], seg, { smooth: !hi, caps: false });
  if (h < CH) { k.color(MARBLE_SH).cyl(x, ST + h - 0.9, z, CR * 0.8, CR * 0.6, 0.6, seg); return; }
  k.color(MARBLE_DK).cyl(x, ST + h - 0.9, z, CR * 0.8, CR * 1.12, 0.55, seg);   // echinus
  k.color(MARBLE).box(x, ST + h - 0.35, z, CR * 2.3, 0.35, CR * 2.3);          // abacus
}

// entablature run between two points along an axis; frieze with triglyphs facing outward
function entab(k, cx, cz, len, alongZ, out, hi) {
  const w = alongZ ? 2.0 : len, d = alongZ ? len : 2.0;
  k.color(MARBLE).box(cx, Y_ENT, cz, w, 1.35, d);                // architrave
  k.color(MARBLE_DK).box(cx, Y_ENT + 1.35, cz, w * (alongZ ? 0.95 : 1), 1.35, d * (alongZ ? 1 : 0.95)); // frieze
  k.color(MARBLE).box(cx, Y_ENT + 2.7, cz, alongZ ? 2.5 : len + 0.6, 0.6, alongZ ? len + 0.6 : 2.5);   // cornice
  if (!hi) return;
  k.color(MARBLE_SH);
  const n = Math.round(len / 1.32);
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + i * (len / n);
    if (alongZ) k.box(cx + out * 0.97, Y_ENT + 1.4, cz + t, 0.08, 1.2, 0.55);
    else k.box(cx + t, Y_ENT + 1.4, cz + out * 0.97, 0.55, 1.2, 0.08);
  }
}

function pediment(k, z, out, hi) {
  // triangular tympanum + raking cornices over the end facade at plane z, facing out (+-1 along Z)
  const y0 = Y_ENT + 3.3, ph = 3.4, hw = SW / 2 + 0.3, zf = z + out * 1.0, zb = z - out * 1.0;
  k.color(MARBLE).tri([hw, y0, zf], [-hw, y0, zf], [0, y0 + ph, zf]).tri([0, y0 + ph, zf], [-hw, y0, zf], [hw, y0, zf]);
  k.tri([hw, y0, zb], [-hw, y0, zb], [0, y0 + ph, zb]).tri([0, y0 + ph, zb], [-hw, y0, zb], [hw, y0, zb]);
  k.color(MARBLE_DK).quad2([-hw - 0.3, y0, zf + out * 0.4], [-hw - 0.3, y0, zb], [0, y0 + ph + 0.4, zb], [0, y0 + ph + 0.4, zf + out * 0.4]);
  k.quad2([0, y0 + ph + 0.4, zf + out * 0.4], [0, y0 + ph + 0.4, zb], [hw + 0.3, y0, zb], [hw + 0.3, y0, zf + out * 0.4]);
  if (hi) { // remnants of the pediment sculptures (west better preserved)
    k.color(MARBLE_SH);
    for (const [x, h] of out > 0 ? [[-9, 1.4], [-5, 2.0], [4, 1.8], [8, 1.1]] : [[-7, 1.3], [6, 1.5]]) k.box(x, y0, zf + out * 0.15, 1.6, h, 0.6);
  }
}

export function build(k) {
  const hi = k.hi;
  // Acropolis rock under the temple (reaches down so a coarse DEM never leaves it floating)
  k.glow(false).color(ROCK).taper(0, -14, 0, SW + 34, SL + 34, SW + 14, SL + 14, 14);
  if (hi) {
    k.color(ROCK_DK);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, r = 1 + (i % 3) * 0.6;
      k.sphere(Math.cos(a) * (SW / 2 + 10), -0.4, Math.sin(a) * (SL / 2 + 10), r * 1.6, 6, 3, 0.5, 0.5);
    }
  }
  // crepidoma: three steps
  k.glow(true);
  for (let i = 0; i < 3; i++) k.color(i === 2 ? MARBLE : MARBLE_DK).box(0, (i * ST) / 3, 0, SW + 2.4 - i * 0.8, ST / 3, SL + 2.4 - i * 0.8);
  // peristyle
  for (const x of front) { column(k, x, -SL / 2 + 1.2); column(k, x, SL / 2 - 1.2); }
  for (const sx of [-1, 1]) {
    side.forEach((z, i) => {
      if (i === 0 || i === 16) return;
      if (LOST[sx].has(i)) { if (hi && i % 2) column(k, sx * (SW / 2 - 1.2), z, 1.4 + (i % 3)); return; }
      column(k, sx * (SW / 2 - 1.2), z);
    });
  }
  // entablature: complete on the ends, broken over the lost columns on the long sides
  entab(k, 0, -SL / 2 + 1.2, SW, false, -1, hi);
  entab(k, 0, SL / 2 - 1.2, SW, false, 1, hi);
  for (const sx of [-1, 1]) {
    const x = sx * (SW / 2 - 1.2), lost = [...LOST[sx]];
    const zA = side[Math.min(...lost) - 1], zB = side[Math.max(...lost) + 1];
    entab(k, x, (-SL / 2 + 1.2 + zA) / 2, zA - (-SL / 2 + 1.2), true, sx, hi);
    entab(k, x, (zB + SL / 2 - 1.2) / 2, SL / 2 - 1.2 - zB, true, sx, hi);
  }
  pediment(k, -SL / 2 + 1.2, -1, hi);
  pediment(k, SL / 2 - 1.2, 1, hi);
  // cella remains: west chamber walls, the inner west porch (6 prostyle columns), wall stubs east
  k.color(MARBLE_DK);
  k.box(0, ST, 11, 19.5, 8.5, 1.2);                               // cross wall
  for (const sx of [-1, 1]) k.box(sx * 9.6, ST, 17.5, 1.2, 9.5, 13);
  if (hi) {
    for (let i = 0; i < 6; i++) column(k, -8 + i * 3.2, 25.4, CH - 1.1);
    k.color(MARBLE_SH);
    for (const [x, z, h] of [[-9.6, -5, 2.2], [9.6, -9, 1.4], [-9.6, -14, 1.0], [9.6, 2, 3.0]]) k.box(x, ST, z, 1.2, h, 5);
  }
  k.glow(false);
}
