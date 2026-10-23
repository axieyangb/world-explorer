// feature/famous-landmarks: Great Sphinx of Giza — 1:1 (73 m long incl. paws, 19 m wide, 20 m tall).
// Recumbent lion carved from the bedrock, layered/weathered body, lighter restoration masonry at the
// base, nemes headdress with flaring lappets, nose and beard missing, Dream Stele between the paws.
// Front (-Z) = face, looking due east (registry heading 90).
const BODY = 0xc29d6b, BODY_DK = 0xa9845a, HEAD = 0xcfad7f, NEMES = 0xc7a474, NEMES_DK = 0xb48f60;
const REPAIR = 0xd9c4a0, DARK = 0x46372a, STELE = 0x6f6259;

export const lodDist = 1200;
export const glowStrength = 0.5;

export const colliders = [
  { x: 0, z: 11, hw: 7.2, hd: 25, h: 11 },    // body + rump
  { x: 0, z: -16, hw: 6.5, hd: 5, h: 15 },    // chest + neck
  { x: 0, z: -18, hw: 3.6, hd: 3.2, h: 20 },  // head
  { x: 0, z: -28, hw: 6, hd: 8.5, h: 2.6 },   // forepaws
];

export function build(k) {
  const hi = k.hi, seg = hi ? 16 : 7;
  k.glow(true);
  // restoration masonry skirt (sunk a little to hide the uneven floor)
  k.color(REPAIR).box(0, -1.5, 9, 14.2, 3.0, 54);
  // body: block + rounded back running to the rump
  k.color(BODY).box(0, 0, 6, 13, 6.5, 40);
  k.push().translate(0, 6.5, -14).rotateX(Math.PI / 2).scale(6.5, 1, 4.2);
  k.cyl(0, 0, 0, 1, 1, 40, seg, { caps: false });
  k.pop();
  k.push().translate(0, 5.6, 26).scale(6.5, 5.0, 9.6);
  k.sphere(0, 0, 0, 1, seg, hi ? 8 : 4);
  k.pop();
  // folded hind legs along the flanks
  for (const s of [-1, 1]) {
    k.push().translate(s * 6.3, 3.0, 24).scale(1.9, 3.0, 8.5);
    k.sphere(0, 0, 0, 1, hi ? 10 : 6, hi ? 6 : 3);
    k.pop();
  }
  // chest (shoulders) and forelegs
  k.color(BODY).taper(0, 0, -16.5, 13.4, 9, 12, 7.5, 11.5, 0, 0.6);
  for (const s of [-1, 1]) {
    k.taper(s * 4.6, 0, -19.5, 4.2, 8, 3.6, 5, 5.0, 0, 1.2);  // forearm
    k.color(BODY_DK).box(s * 3.5, 0, -28.6, 4.0, 2.6, 15.6);  // paw
    if (hi) for (let t = 0; t < 4; t++) k.color(BODY).box(s * 3.5 + (t - 1.5) * 0.95, 0, -36.2, 0.8, 2.3, 0.9); // toes
    k.color(BODY);
  }
  // neck
  k.color(BODY).taper(0, 10.5, -17.0, 7.0, 6.2, 5.6, 5.0, 4.5);
  // head + face
  k.color(HEAD).box(0, 13.0, -17.6, 4.6, 5.6, 5.4);
  // nemes headdress: domed headcloth, frontlet band, flaring lappets, back flap
  k.color(NEMES).sphere(0, 18.0, -17.3, 3.1, seg, hi ? 6 : 3, 0.645, 0.5);
  k.color(NEMES_DK).box(0, 17.5, -17.6, 6.0, 0.7, 5.6);
  for (const s of [-1, 1]) {
    k.color(NEMES).taper(s * 4.5, 11.4, -18.6, 2.8, 2.6, 1.5, 2.6, 6.4, -s * 1.35, 0);
    if (hi) {
      k.color(NEMES_DK);
      for (let j = 0; j < 5; j++) {
        const y = 12.2 + j * 1.15, f = (y - 11.4) / 6.4;
        const xc = s * (4.5 - 1.35 * f), w = 2.8 + (1.5 - 2.8) * f;
        k.box(xc, y, -19.95, w * 0.98, 0.35, 0.12);
      }
    }
  }
  k.color(NEMES_DK).taper(0, 11.0, -13.4, 6.4, 2.4, 5.4, 2.0, 7.0, 0, -0.6);
  k.glow(false);
  if (hi) {
    // face features: brow, eyes, broken nose stub, mouth
    k.color(BODY_DK).box(0, 17.0, -20.42, 3.8, 0.35, 0.2);
    k.color(DARK).box(-0.95, 16.1, -20.42, 0.9, 0.45, 0.2).box(0.95, 16.1, -20.42, 0.9, 0.45, 0.2);
    k.color(HEAD).box(0, 14.9, -20.6, 0.9, 1.4, 0.5);
    k.color(BODY_DK).box(0, 14.4, -20.6, 0.7, 0.3, 0.2);
    k.color(DARK).box(0, 13.9, -20.42, 1.5, 0.2, 0.2);
    // ears under the nemes
    k.color(HEAD).box(-2.6, 15.0, -16.8, 0.6, 1.8, 1.2).box(2.6, 15.0, -16.8, 0.6, 1.8, 1.2);
    // weathered strata bands along the body
    k.color(BODY_DK);
    for (const y of [1.6, 3.4, 5.2]) k.box(0, y, 6, 13.15, 0.45, 39.6);
    // tail curled over the right haunch
    k.color(BODY_DK).tube([[4.0, 0.6, 35.3], [6.6, 0.7, 31.5], [8.0, 1.0, 26], [7.9, 1.3, 20.5]], 0.45, 6);
    // Dream Stele of Thutmose IV between the paws + small altar
    k.color(STELE).box(0, 0, -21.6, 2.2, 3.6, 0.7);
    k.color(REPAIR).box(0, 0, -25.5, 1.6, 0.9, 1.4);
  }
}
