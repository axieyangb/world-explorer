// feature/famous-landmarks: Great Sphinx of Giza — 1:1 (73 m long incl. paws, 19 m wide, 20 m tall).
// Recumbent lion carved from the bedrock: long low body lofted from cross-sections (dipped back, rounded
// haunch), deeply weathered horizontal strata, pale restoration masonry along the base, small head on a
// thin neck with the striped nemes headdress and lappets, nose and beard missing, forelegs and 15 m paws
// with the Dream Stele between them, inside the rock-cut enclosure. Front (-Z) = face, looking due east.
const BODY = 0xc4a578, BODY_DK = 0x957a58, BODY_LT = 0xd3ba90, HEAD = 0xcdb38a, NEMES = 0xc8ad82, NEMES_DK = 0xa99169;
const EYE = 0x6e5c46, REPAIR = 0xd8c8a6, REPAIR_DK = 0xc4b18c, DARK = 0x4a3c2e, STELE = 0x7a6c5e, ROCK = 0xc3a87e, ROCK_DK = 0xb09670, FLOOR = 0xd3bf98;

export const lodDist = 1200;
export const glowStrength = 0.55; // warm floodlights (sound & light show)

export const colliders = [
  { x: 0, z: 11, hw: 7.2, hd: 26, h: 9 },     // body + rump
  { x: 0, z: -15, hw: 6.8, hd: 5, h: 13 },    // chest + neck
  { x: 0, z: -17.5, hw: 3.4, hd: 3.2, h: 20 }, // head
  { x: 0, z: -28, hw: 6, hd: 8.5, h: 2.6 },   // forepaws
];

// body cross-sections [z, half-width, height]: shoulders high behind the chest, back dipping, haunch
const SECT = [
  [-16, 6.4, 11.6], [-11, 6.9, 10.6], [-5, 6.8, 9.2], [2, 6.5, 8.5], [10, 6.4, 8.2], [18, 6.8, 8.7],
  [25, 7.0, 8.8], [30.5, 6.6, 8.0], [34, 5.4, 6.4], [36.3, 3.6, 4.2], [37.4, 1.4, 1.8],
];

/** Section outline (x, y) bottom-left -> over the top -> bottom-right; straight flanks, rounded back. */
function outline(w, h, n) {
  const pts = [[-w, 0], [-w, h * 0.5]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const sc = Math.sign(c) * Math.pow(Math.abs(c), 0.6), ss = Math.pow(s, 0.6); // superellipse: squarish shoulders
    pts.push([w * sc, h * 0.5 + h * 0.5 * ss]);
  }
  pts.push([w, h * 0.5], [w, 0]);
  return pts;
}

/** Loft between consecutive sections (outer skin only; ends capped at the front and rear). */
function loft(k, sects, n, grow = 0, y0 = 0, hScale = 1) {
  const rings = sects.map(([z, w, h]) => outline(w + grow, h * hScale, n).map(([x, y]) => [x, y + y0, z]));
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let i = 0; i < A.length - 1; i++) k.quad(A[i], B[i], B[i + 1], A[i + 1]);
  }
  // front cap (faces -Z) and rear cap (faces +Z) as fans
  const F = rings[0], R = rings[rings.length - 1];
  const fc = [0, y0 + sects[0][2] * hScale * 0.45, sects[0][0]], rc = [0, y0 + sects[sects.length - 1][2] * hScale * 0.45, sects[sects.length - 1][0]];
  for (let i = 0; i < F.length - 1; i++) { k.tri(fc, F[i], F[i + 1]); k.tri(rc, R[i + 1], R[i]); }
}

/** Darker horizontal weathering groove on both flanks at height y, following the section widths. */
function stratum(k, y, t, z0, z1) {
  const S = SECT.filter(([z, , h]) => z >= z0 && z <= z1 && h * 0.5 > y + t);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < S.length - 1; i++) {
      const [za, wa] = S[i], [zb, wb] = S[i + 1];
      const xa = sx * (wa + 0.07), xb = sx * (wb + 0.07);
      if (sx < 0) k.quad([xa, y, za], [xb, y, zb], [xb, y + t, zb], [xa, y + t, za]);
      else k.quad([xb, y, zb], [xa, y, za], [xa, y + t, za], [xb, y + t, zb]);
    }
  }
}

function enclosure(k) {
  // rock-cut hollow: sandy floor and a low, broken bedrock rim on three sides (open to the east)
  k.glow(false).color(FLOOR).box(0, -0.6, 4, 40, 0.64, 88);
  const rim = [[-21, -36, 1.2], [-22, -18, 1.9], [-22.5, 0, 2.4], [-22, 18, 2.6], [-20.5, 34, 2.2], [-11, 45, 1.9], [0, 46.5, 1.6],
    [11, 45, 1.8], [20.5, 34, 2.1], [22, 18, 2.5], [22.5, 0, 2.2], [22, -18, 1.6], [21, -36, 1.1]];
  for (let i = 0; i < rim.length - 1; i++) {
    const [xa, za, ha] = rim[i], [xb, zb, hb] = rim[i + 1];
    const dx = xb - xa, dz = zb - za, L = Math.hypot(dx, dz);
    k.color(i % 2 ? ROCK : ROCK_DK);
    k.push().translate((xa + xb) / 2, 0, (za + zb) / 2).rotateY(-Math.atan2(dz, dx));
    // two blocks per side with a weathered notch between them
    k.taper(-L * 0.26, -1.2, 0, L * 0.52, 4.6, L * 0.4, 1.0, ha * 0.7 + 1.2);
    k.taper(L * 0.27, -1.2, 0, L * 0.46, 4.2, L * 0.34, 0.9, hb * 0.6 + 1.2);
    k.pop();
  }
}

function body(k) {
  const hi = k.hi, n = hi ? 10 : 4;
  k.glow(true);
  // pale restoration masonry casing the lower flanks (proud of the bedrock, sunk below the floor)
  k.color(REPAIR);
  loft(k, SECT.slice(0, -1), 2, 0.3, -1.2, 0.34);
  // bedrock body
  k.color(BODY);
  loft(k, SECT, n);
  // chest block under the head, and shoulders
  k.color(BODY).taper(0, 0, -17.6, 12.6, 6.4, 10.4, 5.0, 12.2, 0, 0.8);
  // forelegs reaching forward along the sides, then the long paws
  for (const s of [-1, 1]) {
    k.color(BODY).taper(s * 4.4, 0, -21.6, 4.4, 6.0, 3.8, 4.4, 4.8, 0, 0.8);
    k.color(REPAIR).box(s * 4.0, -0.4, -21.6, 4.6, 1.5, 6.4);
    k.color(BODY_DK).box(s * 4.0, 0, -29.6, 4.0, 2.6, 13.4);
    k.color(BODY).box(s * 4.0, 2.6, -28.2, 3.7, 0.5, 10.6);
    if (hi) {
      k.color(BODY_DK);
      for (let t = 0; t < 4; t++) k.box(s * 4.0 + (t - 1.5) * 0.95, 0, -36.6, 0.82, 2.2, 0.9); // toes
      k.color(REPAIR_DK).box(s * 4.0, -0.4, -29.6, 4.5, 1.0, 13.8);
    }
  }
  // folded hind leg along each flank of the haunch
  if (hi) {
    k.color(BODY_LT);
    for (const s of [-1, 1]) {
      k.push().translate(s * 6.75, 2.6, 26).scale(1.0, 2.6, 7.5);
      k.sphere(0, 0, 0, 1, 10, 6);
      k.pop();
    }
  }
  if (!hi) { k.glow(false); return; }
  // deep weathering strata along the flanks and the back
  k.color(BODY_DK);
  for (const y of [1.3, 2.5, 3.5]) stratum(k, y, 0.5, -16, 36);
  k.color(BODY_LT);
  for (const y of [2.1, 3.15]) stratum(k, y, 0.28, -11, 31);
  // tail curled around the right haunch
  k.color(BODY_DK).tube([[3.8, 0.5, 36.6], [6.4, 0.6, 33.5], [7.6, 0.8, 28.5], [7.6, 1.0, 22.5]], 0.45, 6);
  k.glow(false);
}

function head(k) {
  const hi = k.hi, seg = hi ? 16 : 7;
  k.glow(true);
  // thin weathered neck
  k.color(BODY).taper(0, 11.2, -17.2, 5.6, 5.4, 4.6, 4.4, 3.4);
  // face block (slightly narrower at the chin)
  k.color(HEAD).taper(0, 13.4, -17.7, 4.2, 4.8, 4.6, 5.2, 4.4, 0, 0.1);
  // nemes: domed headcloth, frontal band, flaring lappets down to the chest, braid at the back
  k.color(NEMES).sphere(0, 17.2, -17.4, 3.0, seg, hi ? 6 : 3, 0.95, 0.5);
  k.color(NEMES_DK).box(0, 17.0, -17.6, 5.8, 0.6, 5.4);
  for (const s of [-1, 1]) {
    k.color(NEMES).taper(s * 3.6, 9.4, -18.6, 2.0, 2.0, 2.6, 2.4, 8.2, -s * 0.15, 0);
    if (hi) {
      k.color(NEMES_DK);
      for (let j = 0; j < 7; j++) { const y = 10.0 + j * 1.12; k.box(s * (3.6 - 0.15 * (y - 9.4) / 8.2), y, -19.64 - 0.2 * (y - 9.4) / 8.2, 2.3, 0.32, 0.12); } // stripes
    }
  }
  k.color(NEMES_DK).taper(0, 11.2, -14.6, 5.4, 2.4, 4.6, 1.8, 6.6, 0, -0.4);
  if (hi) {
    // stripes round the headcloth above the band
    k.color(NEMES_DK);
    for (const y of [17.9, 18.7]) { const r = Math.sqrt(9 - (y - 17.2) ** 2 / 0.9) + 0.05; k.lathe(0, y, -17.4, [[r, 0], [r - 0.1, 0.22]], 16, { caps: false }); }
    k.glow(false);
    // face: brow, eyes, broken nose (flat scar), mouth, ears under the nemes
    k.color(BODY_DK).box(0, 16.5, -20.36, 3.4, 0.3, 0.2);
    k.color(EYE).box(-0.9, 15.6, -20.33, 0.8, 0.34, 0.14).box(0.9, 15.6, -20.33, 0.8, 0.34, 0.14);
    k.color(HEAD).box(0, 14.6, -20.42, 0.8, 1.0, 0.24);   // broken nose stump
    k.color(BODY_DK).box(0, 14.0, -20.33, 1.3, 0.14, 0.14);
    k.color(HEAD).box(-2.45, 14.6, -17.0, 0.5, 1.8, 1.1).box(2.45, 14.6, -17.0, 0.5, 1.8, 1.1);
  }
  k.glow(false);
}

export function build(k) {
  if (k.hi) enclosure(k);
  body(k);
  head(k);
  if (k.hi) {
    // Dream Stele of Thutmose IV between the paws + altar
    k.color(STELE).box(0, 0, -21.8, 2.4, 3.8, 0.7);
    k.color(REPAIR).box(0, 0, -26.0, 1.6, 0.9, 1.4);
  }
}
