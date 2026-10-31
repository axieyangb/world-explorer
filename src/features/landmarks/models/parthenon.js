// feature/famous-landmarks: Parthenon, Acropolis of Athens — 1:1 (13.7 m to the cornice, ~19 m to the pediment apex).
// Doric peripteral temple, stylobate 69.5 x 30.9 m on three steps; 8 x 17 fluted columns (10.4 m, 1.9 m
// diameter) with echinus capitals, architrave, triglyph & sculpted metope frieze, cornice with lion-head spouts,
// the two pediments with Pheidian sculptural remnants, inner pronaos/opisthodomos porches, Panathenaic cella frieze,
// Athena Parthenos pedestal, and fallen marble column drums on the Acropolis rock. Floodlit at night.
// Local: axis = Z, front -Z = east facade (heading 77.1), +X = south side.
const MARBLE = 0xdccfb3, MARBLE_DK = 0xc6b694, MARBLE_SH = 0xab9a78, MARBLE_NEW = 0xefe6d2;
const ROCK = 0xa89a83, ROCK_DK = 0x8f826d;
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

function column(k, x, z, h = CH, rScale = 1.0) {
  const hi = k.hi, seg = hi ? 20 : 6;
  const r = CR * rScale;
  // entasis: slightly swelling taper; flutes = flat facets (smooth: false)
  k.color(MARBLE).lathe(x, ST, z, [[r, 0], [r * 0.95, h * 0.4], [r * 0.8, h - 0.9]], seg, { smooth: !hi, caps: false });
  if (h < CH * 0.92) { k.color(MARBLE_SH).cyl(x, ST + h - 0.9, z, r * 0.8, r * 0.6, 0.6, seg); return; }
  k.color(MARBLE_DK).cyl(x, ST + h - 0.9, z, r * 0.8, r * 1.12, 0.55, seg);   // echinus
  k.color(MARBLE).box(x, ST + h - 0.35, z, r * 2.3, 0.35, r * 2.3);          // abacus
}

// entablature run between two points along an axis; frieze with triglyphs & sculpted metopes facing outward
function entab(k, cx, cz, len, alongZ, out, hi) {
  const w = alongZ ? 2.0 : len, d = alongZ ? len : 2.0;
  k.color(MARBLE).box(cx, Y_ENT, cz, w, 1.35, d);                // architrave
  k.color(MARBLE_DK).box(cx, Y_ENT + 1.35, cz, w * (alongZ ? 0.95 : 1), 1.35, d * (alongZ ? 1 : 0.95)); // frieze
  k.color(MARBLE).box(cx, Y_ENT + 2.7, cz, alongZ ? 2.5 : len + 0.6, 0.6, alongZ ? len + 0.6 : 2.5);   // cornice
  if (!hi) return;
  const n = Math.round(len / 1.32);
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + i * (len / n);
    // Triglyph block with vertical glyphs
    k.color(MARBLE_SH);
    if (alongZ) k.box(cx + out * 0.97, Y_ENT + 1.4, cz + t, 0.09, 1.22, 0.52);
    else k.box(cx + t, Y_ENT + 1.4, cz + out * 0.97, 0.52, 1.22, 0.09);
    // Regulae & guttae peg strip beneath each triglyph
    if (alongZ) k.box(cx + out * 1.01, Y_ENT + 1.24, cz + t, 0.08, 0.1, 0.52);
    else k.box(cx + t, Y_ENT + 1.24, cz + out * 1.01, 0.52, 0.1, 0.08);
    // Sculpted Metope high-relief figures (Centauromachy / Gigantomachy) between triglyphs
    if (i < n) {
      const tm = -len / 2 + (i + 0.5) * (len / n);
      k.color(i % 3 === 0 ? MARBLE_NEW : MARBLE);
      if (alongZ) {
        k.box(cx + out * 0.95, Y_ENT + 1.55, cz + tm - 0.14, 0.12, 0.85, 0.24);
        k.box(cx + out * 0.95, Y_ENT + 1.62, cz + tm + 0.16, 0.12, 0.72, 0.22);
      } else {
        k.box(cx + tm - 0.14, Y_ENT + 1.55, cz + out * 0.95, 0.24, 0.85, 0.12);
        k.box(cx + tm + 0.16, Y_ENT + 1.62, cz + out * 0.95, 0.22, 0.72, 0.12);
      }
    }
    // Roof sima palmette antefixes along the long cornice
    if (alongZ && i % 2 === 0) {
      k.color(MARBLE).box(cx + out * 1.15, Y_ENT + 3.3, cz + t, 0.18, 0.38, 0.28);
    }
  }
}

function pediment(k, z, out, hi) {
  // triangular tympanum + raking cornices over the end facade at plane z, facing out (+-1 along Z)
  const y0 = Y_ENT + 3.3, ph = 3.4, hw = SW / 2 + 0.3, zf = z + out * 1.0, zb = z - out * 1.0;
  k.color(MARBLE).tri([hw, y0, zf], [-hw, y0, zf], [0, y0 + ph, zf]).tri([0, y0 + ph, zf], [-hw, y0, zf], [hw, y0, zf]);
  k.tri([hw, y0, zb], [-hw, y0, zb], [0, y0 + ph, zb]).tri([0, y0 + ph, zb], [-hw, y0, zb], [hw, y0, zb]);
  k.color(MARBLE_DK).quad2([-hw - 0.3, y0, zf + out * 0.4], [-hw - 0.3, y0, zb], [0, y0 + ph + 0.4, zb], [0, y0 + ph + 0.4, zf + out * 0.4]);
  k.quad2([0, y0 + ph + 0.4, zf + out * 0.4], [0, y0 + ph + 0.4, zb], [hw + 0.3, y0, zb], [hw + 0.3, y0, zf + out * 0.4]);
  if (hi) {
    // Remnants of the pediment sculptures (East: Birth of Athena & Horses of Helios/Selene; West: Cecrops & Callirrhoe)
    k.color(MARBLE_NEW);
    const figs = out > 0
      ? [[-11.5, 0.9], [-9.2, 1.45], [-6.8, 1.85], [-4.5, 2.1], [3.8, 1.9], [6.5, 1.5], [9.5, 1.1], [11.8, 0.75]]
      : [[-12.0, 0.85], [-9.5, 1.3], [-7.0, 1.6], [6.2, 1.55], [9.2, 1.2], [11.8, 0.8]];
    for (const [x, h] of figs) {
      k.cyl(x, y0, zf + out * 0.22, 0.55, 0.42, h * 0.78, 6);
      k.sphere(x, y0 + h * 0.86, zf + out * 0.22, 0.34, 6, 4);
    }
    // Corner lion-head water spouts on the raking sima
    for (const sx of [-1, 1]) {
      k.color(MARBLE).box(sx * (hw + 0.15), y0 + 0.1, zf + out * 0.45, 0.55, 0.5, 0.65);
    }
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
    // Fallen fluted marble column drums & architrave blocks scattered on the Acropolis rock
    for (const [dx, dz, rot] of [[-20.5, -8, 0.4], [-21.2, 4, 1.1], [20.8, -4, -0.5], [21.5, 9, 0.8], [19.8, 16, 0.2], [-19.5, -18, -0.7]]) {
      k.push().translate(dx, 0, dz).rotateY(rot).rotateZ(Math.PI / 2);
      k.color(MARBLE).cyl(0, -0.8, 0, 0.88, 0.88, 1.5, 14, { smooth: false });
      k.pop();
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
      if (LOST[sx].has(i)) { if (hi && i % 2) column(k, sx * (SW / 2 - 1.2), z, 1.8 + (i % 3) * 1.2); return; }
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
  k.box(0, ST, 11, 19.5, 8.5, 1.2);                               // cross wall between Naos and Parthenon chamber
  for (const sx of [-1, 1]) k.box(sx * 9.6, ST, 17.5, 1.2, 9.5, 13);
  if (hi) {
    // Inner West Porch (Opisthodomos): 6 columns + architrave + Panathenaic Ionic Frieze
    for (let i = 0; i < 6; i++) column(k, -8 + i * 3.2, 25.4, CH - 0.8, 0.88);
    k.color(MARBLE).box(0, ST + CH - 0.8, 25.4, 18.2, 1.1, 1.5);
    k.color(MARBLE_NEW).box(0, ST + CH + 0.3, 25.4, 18.0, 1.0, 1.4); // Continuous Panathenaic frieze band
    // Inner East Porch (Pronaos): 6 column stubs facing East (-Z)
    for (let i = 0; i < 6; i++) column(k, -8 + i * 3.2, -25.4, i === 2 || i === 3 ? 2.4 : 7.5, 0.88);
    // Naos interior double-tiered Doric colonnade stylobate & Pheidias' Athena Parthenos statue pedestal
    k.color(MARBLE_SH);
    k.box(0, ST, 5.5, 8.2, 0.65, 4.2);                            // Athena Parthenos dark Eleusinian-stone & marble base
    k.color(MARBLE_NEW).box(0, ST + 0.65, 5.5, 7.6, 0.45, 3.6);
    // Shallow reflecting pool basin in front of Athena Parthenos
    k.color(MARBLE_DK).box(0, ST, -4.0, 9.5, 0.18, 9.0);
    // Naos wall blocks & fresh white Pentelic marble anastylosis patches
    for (const [x, z, h] of [[-9.6, -5, 3.4], [9.6, -9, 2.2], [-9.6, -14, 1.6], [9.6, 2, 4.2]]) {
      k.color(MARBLE_SH).box(x, ST, z, 1.2, h, 5);
      k.color(MARBLE_NEW).box(x, ST + h * 0.4, z, 1.24, h * 0.35, 2.2);
    }
  }
  k.glow(false);
}
