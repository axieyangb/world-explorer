// feature/famous-landmarks: Great Sphinx of Giza — 1:1 (73 m long incl. paws, 19 m wide, 20 m tall).
// Recumbent lion carved from the bedrock: long low body lofted from cross-sections (dipped back, rounded
// haunch), deeply weathered horizontal strata, pale restoration masonry along the base, small head on a
// thin neck with the striped nemes headdress, royal Uraeus cobra and lappets, nose and beard missing,
// forelegs and 15 m paws with the Dream Stele between them, inside the rock-cut enclosure + Sphinx Temple ruins.
const BODY = 0xc4a578, BODY_DK = 0x957a58, BODY_LT = 0xd3ba90, HEAD = 0xcdb38a, NEMES = 0xc8ad82, NEMES_DK = 0xa99169;
const EYE = 0x6e5c46, REPAIR = 0xd8c8a6, REPAIR_DK = 0xc4b18c, DARK = 0x4a3c2e, STELE = 0x9a5a47, ROCK = 0xc3a87e, ROCK_DK = 0xb09670, FLOOR = 0xd3bf98;

export const lodDist = 1200;
export const glowStrength = 0.55; // warm floodlights (sound & light show)

export const colliders = [
  { x: 0, z: 11, hw: 7.2, hd: 26, h: 9 },     // body + rump
  { x: 0, z: -15, hw: 6.8, hd: 5, h: 13 },    // chest + neck
  { x: 0, z: -17.5, hw: 3.4, hd: 3.2, h: 20 }, // head
  { x: 0, z: -28, hw: 6, hd: 8.5, h: 2.6 },   // forepaws
];

const SECT = [
  [-16, 6.4, 11.6], [-11, 6.9, 10.6], [-5, 6.8, 9.2], [2, 6.5, 8.5], [10, 6.4, 8.2], [18, 6.8, 8.7],
  [25, 7.0, 8.8], [30.5, 6.6, 8.0], [34, 5.4, 6.4], [36.3, 3.6, 4.2], [37.4, 1.4, 1.8],
];

function outline(w, h, n) {
  const pts = [[-w, 0], [-w, h * 0.5]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const sc = Math.sign(c) * Math.pow(Math.abs(c), 0.6), ss = Math.pow(s, 0.6);
    pts.push([w * sc, h * 0.5 + h * 0.5 * ss]);
  }
  pts.push([w, h * 0.5], [w, 0]);
  return pts;
}

function loft(k, sects, n, grow = 0, y0 = 0, hScale = 1) {
  const rings = sects.map(([z, w, h]) => outline(w + grow, h * hScale, n).map(([x, y]) => [x, y + y0, z]));
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let i = 0; i < A.length - 1; i++) k.quad(A[i], B[i], B[i + 1], A[i + 1]);
  }
  const F = rings[0], R = rings[rings.length - 1];
  const fc = [0, y0 + sects[0][2] * hScale * 0.45, sects[0][0]], rc = [0, y0 + sects[sects.length - 1][2] * hScale * 0.45, sects[sects.length - 1][0]];
  for (let i = 0; i < F.length - 1; i++) { k.tri(fc, F[i], F[i + 1]); k.tri(rc, R[i + 1], R[i]); }
}

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
  // rock-cut hollow: sandy floor and broken bedrock rim on three sides + Sphinx Temple ruins in front (-Z)
  k.glow(false).color(FLOOR).box(0, -0.6, 0, 44, 0.64, 104);
  const rim = [[-21, -36, 1.2], [-22, -18, 1.9], [-22.5, 0, 2.4], [-22, 18, 2.6], [-20.5, 34, 2.2], [-11, 45, 1.9], [0, 46.5, 1.6],
    [11, 45, 1.8], [20.5, 34, 2.1], [22, 18, 2.5], [22.5, 0, 2.2], [22, -18, 1.6], [21, -36, 1.1]];
  for (let i = 0; i < rim.length - 1; i++) {
    const [xa, za, ha] = rim[i], [xb, zb, hb] = rim[i + 1];
    const dx = xb - xa, dz = zb - za, L = Math.hypot(dx, dz);
    k.color(i % 2 ? ROCK : ROCK_DK);
    k.push().translate((xa + xb) / 2, 0, (za + zb) / 2).rotateY(-Math.atan2(dz, dx));
    k.taper(-L * 0.26, -1.2, 0, L * 0.52, 4.6, L * 0.4, 1.0, ha * 0.7 + 1.2);
    k.taper(L * 0.27, -1.2, 0, L * 0.46, 4.2, L * 0.34, 0.9, hb * 0.6 + 1.2);
    k.pop();
  }
  // Old Kingdom Sphinx Temple megalithic limestone court immediately in front of the paws (-Z = -39 .. -51)
  k.color(ROCK_DK).box(0, -0.2, -45, 34, 2.8, 11);
  k.color(DARK).box(0, 0.4, -45, 26, 2.4, 7.5);
  k.color(STELE);
  for (let px = -10; px <= 10; px += 4) {
    k.box(px, 0.4, -42.5, 0.95, 2.6, 0.95);
    k.box(px, 0.4, -47.5, 0.95, 2.6, 0.95);
  }
}

function body(k) {
  const hi = k.hi, n = hi ? 14 : 4;
  k.glow(true);
  // pale restoration masonry casing the lower flanks + stepped Thutmose/Roman brick courses
  k.color(REPAIR);
  loft(k, SECT.slice(0, -1), 2, 0.3, -1.2, 0.34);
  if (hi) {
    // Stepped restoration masonry courses & dorsal fissure scar across the back
    for (let z = -12; z <= 32; z += 4.5) {
      k.color(z % 9 === 0 ? REPAIR : REPAIR_DK);
      k.box(-6.95, 0, z, 0.85, 2.2, 3.8).box(6.95, 0, z, 0.85, 2.2, 3.8);
      k.box(-6.6, 2.2, z, 0.75, 1.2, 3.6).box(6.6, 2.2, z, 0.75, 1.2, 3.6);
    }
  }
  // bedrock body
  k.color(BODY);
  loft(k, SECT, n);
  // chest block under the head, with lion pectoral Boss (lion's heart projection) & shoulders
  k.color(BODY).taper(0, 0, -17.6, 12.6, 6.4, 10.4, 5.0, 12.2, 0, 0.8);
  if (hi) {
    k.color(BODY_LT).sphere(0, 5.8, -19.8, 2.4, 10, 6, 1.2);
  }
  // forelegs reaching forward along the sides, then the long paws with carved toes & ankle masonry
  for (const s of [-1, 1]) {
    k.color(BODY).taper(s * 4.4, 0, -21.6, 4.4, 6.0, 3.8, 4.4, 4.8, 0, 0.8);
    k.color(REPAIR).box(s * 4.0, -0.4, -21.6, 4.6, 1.5, 6.4);
    k.color(BODY_DK).box(s * 4.0, 0, -29.6, 4.0, 2.6, 13.4);
    k.color(BODY).box(s * 4.0, 2.6, -28.2, 3.7, 0.5, 10.6);
    if (hi) {
      k.color(BODY_DK);
      for (let t = 0; t < 5; t++) {
        const tx = s * 4.0 + (t - 2) * 0.78;
        k.box(tx, 0, -36.6, 0.68, 2.1, 1.2); // 5 carved lion toes + knuckle pads
        k.color(REPAIR).box(tx, 1.2, -37.0, 0.52, 0.65, 0.45);
        k.color(BODY_DK);
      }
      k.color(REPAIR_DK).box(s * 4.0, -0.4, -29.6, 4.5, 1.0, 13.8);
      // Individual small Roman restoration limestone blocks along the outer paw wall
      for (let pz = -35; pz <= -23; pz += 1.6) {
        k.color(pz % 3.2 === 0 ? REPAIR : REPAIR_DK).box(s * 5.95, 0.5, pz, 0.5, 1.6, 1.45);
      }
    }
  }
  // folded hind leg & muscular haunch along each flank of the rump
  if (hi) {
    k.color(BODY_LT);
    for (const s of [-1, 1]) {
      k.push().translate(s * 6.75, 2.6, 26).scale(1.15, 2.8, 7.8);
      k.sphere(0, 0, 0, 1, 14, 8);
      k.pop();
      // Hind paw extending forward from the folded haunch
      k.color(REPAIR).box(s * 6.9, 0.2, 16.5, 1.4, 1.6, 5.2);
    }
  }
  if (!hi) { k.glow(false); return; }
  // deep geological Member II weathering strata along the flanks and the back
  k.color(BODY_DK);
  for (const y of [1.1, 2.1, 3.1, 4.2, 5.4]) stratum(k, y, 0.42, -16, 36);
  k.color(BODY_LT);
  for (const y of [1.65, 2.65, 3.7, 4.85]) stratum(k, y, 0.26, -11, 32);
  // tail curled around the right haunch + Perring's hole on top of the head/back
  k.color(BODY_DK).tube([[3.8, 0.5, 36.6], [6.5, 0.6, 33.5], [7.7, 0.85, 28.5], [7.7, 1.2, 22.5], [7.1, 2.6, 19.5]], 0.48, 8);
  k.glow(false);
}

function head(k) {
  const hi = k.hi, seg = hi ? 20 : 7;
  k.glow(true);
  // deeply eroded neck with horizontal Member II strata rings
  k.color(BODY).taper(0, 11.2, -17.2, 5.6, 5.4, 4.6, 4.4, 3.4);
  if (hi) {
    k.color(BODY_DK);
    for (const ny of [11.6, 12.4, 13.1]) k.cyl(0, ny, -17.2, 2.7, 2.6, 0.28, 12);
  }
  // face block (sculpted cheekbones, chin & temples)
  k.color(HEAD).taper(0, 13.4, -17.7, 4.2, 4.8, 4.6, 5.2, 4.4, 0, 0.1);
  // nemes: domed headcloth, frontal diadem band, flaring pleated lappets down to the chest, pigtail braid at the back
  k.color(NEMES).sphere(0, 17.2, -17.4, 3.05, seg, hi ? 10 : 3, 0.95, 0.5);
  k.color(NEMES_DK).box(0, 17.0, -17.6, 5.8, 0.6, 5.4);
  for (const s of [-1, 1]) {
    // Flaring side wings of the Nemes headdress
    k.color(NEMES).taper(s * 3.2, 13.6, -17.2, 1.8, 3.6, 2.8, 4.2, 3.6, s * 0.4, 0);
    // Chest lappets with horizontal relief pleats
    k.color(NEMES).taper(s * 3.6, 9.4, -18.6, 2.0, 2.0, 2.6, 2.4, 8.2, -s * 0.15, 0);
    if (hi) {
      k.color(NEMES_DK);
      for (let j = 0; j < 10; j++) {
        const y = 9.8 + j * 0.78;
        k.box(s * (3.6 - 0.15 * (y - 9.4) / 8.2), y, -19.64 - 0.2 * (y - 9.4) / 8.2, 2.35, 0.24, 0.14);
      }
    }
  }
  k.color(NEMES_DK).taper(0, 11.2, -14.6, 5.4, 2.4, 4.6, 1.8, 6.6, 0, -0.4);
  if (hi) {
    // Pleated stripes round the headcloth above the diadem band
    k.color(NEMES_DK);
    for (const y of [17.6, 18.1, 18.6, 19.1]) {
      const r = Math.sqrt(Math.max(0.2, 9.2 - (y - 17.2) ** 2 / 0.9)) + 0.05;
      k.lathe(0, y, -17.4, [[r, 0], [r - 0.08, 0.18]], 20, { caps: false });
    }
    // Royal Uraeus (hooded cobra) relief above the brow on the Nemes diadem
    k.color(HEAD).box(0, 17.0, -20.42, 0.68, 1.35, 0.35).sphere(0, 18.35, -20.45, 0.32, 8, 6);
    k.glow(false);
    // Face features: brow ridges, almond eyes with cosmetic lines, broken nose cavity, full lips, royal ears
    k.color(BODY_DK).box(0, 16.5, -20.36, 3.5, 0.32, 0.24);
    for (const sx of [-0.95, 0.95]) {
      k.color(EYE).box(sx, 15.65, -20.33, 0.85, 0.36, 0.16);
      k.color(HEAD).sphere(sx, 15.82, -20.28, 0.28, 8, 6);
    }
    // Broken nose bridge scar & philtrum
    k.color(DARK).box(0, 14.7, -20.38, 0.68, 0.95, 0.22);
    k.color(HEAD).box(-1.1, 14.6, -20.25, 1.1, 0.9, 0.3).box(1.1, 14.6, -20.25, 1.1, 0.9, 0.3); // cheekbones
    // Sculpted upper & lower lips
    k.color(HEAD).box(0, 14.12, -20.38, 1.55, 0.24, 0.28).box(0, 13.82, -20.35, 1.45, 0.24, 0.25);
    k.color(DARK).box(0, 13.98, -20.4, 1.5, 0.1, 0.22);
    // Ears flanking the face
    k.color(HEAD).box(-2.45, 14.6, -17.2, 0.55, 1.85, 1.15).box(2.45, 14.6, -17.2, 0.55, 1.85, 1.15);
  }
  k.glow(false);
}

export function build(k) {
  if (k.hi) enclosure(k);
  body(k);
  head(k);
  if (k.hi) {
    // Red Granite Dream Stele of Thutmose IV (1401 BC) with arched lunette top & winged sun relief between the paws
    k.color(STELE).box(0, 0, -21.8, 2.2, 3.2, 0.65);
    k.arch(0, 3.2, -21.8, 2.2, 0.95, 0.32, 12, 8);
    k.color(NEMES).box(0, 3.3, -22.15, 1.6, 0.35, 0.12); // winged sun disk engraving
    // Roman sacrificial altar & side stelae between the forepaws
    k.color(REPAIR).box(0, 0, -26.0, 1.8, 1.0, 1.6).box(0, 1.0, -26.0, 2.1, 0.25, 1.9);
  }
}
