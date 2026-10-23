// feature/famous-landmarks: Sydney Harbour Bridge — 1:1 (arch top 134 m above the water).
// Two-hinged steel through-arch, 503 m between bearings, two arch trusses 30 m apart (top chord 134 m,
// bottom chord 116 m at the crown, springing from granite skewbacks), 49 m wide deck at ~49 m with
// hangers / posts, and four 89 m granite-faced pylons (two per shore). Bridge axis = local Z
// (front -Z = north / Milsons Point).
const STEEL = 0x7f868c, STEEL_DK = 0x60676d, STEEL_LT = 0x969da3;
const GRANITE = 0xbcae96, GRANITE_DK = 0xa39580, GRANITE_SH = 0x6e6556;
const ROAD = 0x4b4d50, LAMP = 0xffe7b0;
const L = 251.5;            // half span between bearings
const DECK = 49;            // deck surface
const XT = 15;              // truss planes
const NP = 28;              // panels

export const lodDist = 2200;
export const glowStrength = 1.6;

const PY = { x: 36, zc: L + 20, w: 22, d: 34 };
export const colliders = [
  { x: PY.x, z: PY.zc, hw: 12, hd: 18, h: 89 }, { x: -PY.x, z: PY.zc, hw: 12, hd: 18, h: 89 },
  { x: PY.x, z: -PY.zc, hw: 12, hd: 18, h: 89 }, { x: -PY.x, z: -PY.zc, hw: 12, hd: 18, h: 89 },
];

const topY = (z) => 134 - 1.7 - 60.3 * (z / L) ** 2; // centreline (outer surface 134 at crown)
const botY = (z) => 116 - 108 * (z / L) ** 2 + 2;    // springs at ~10 m on the skewbacks

function pylon(k, x, zc) {
  const hi = k.hi;
  const { w, d } = PY;
  k.color(GRANITE_DK).box(x, 0, zc, w + 4, 10, d + 4);                     // footing
  k.color(GRANITE).taper(x, 10, zc, w, d, w - 2, d - 3, 58);               // shaft to 68
  k.color(GRANITE_DK).box(x, 68, zc, w + 0.6, 2.2, d + 0.6);               // cornice
  k.color(GRANITE).taper(x, 70.2, zc, w - 2.4, d - 3.4, w - 4, d - 6, 11);  // upper stage
  k.color(GRANITE_DK).box(x, 81.2, zc, w - 3.2, 1.6, d - 5.2);
  k.color(GRANITE).taper(x, 82.8, zc, w - 5.5, d - 8, w - 7.5, d - 11, 6.2); // crown to 89
  if (hi) {
    // big arched openings through the pylon (dark recesses on all four faces)
    k.color(GRANITE_SH);
    const archFace = (fx, fz, nx, nz, span) => {
      k.push().translate(fx, 0, fz).rotateY(Math.atan2(nx, nz));
      k.box(0, 46, 0.02, span, 14, 0.4);
      k.taper(0, 60, 0.02, span, 0.4, span * 0.35, 0.4, 3.5);
      k.pop();
    };
    archFace(x, zc - d / 2 + 1.1, 0, -1, 9);
    archFace(x, zc + d / 2 - 1.1, 0, 1, 9);
    archFace(x - w / 2 + 0.8, zc, -1, 0, 12);
    archFace(x + w / 2 - 0.8, zc, 1, 0, 12);
    // rusticated courses
    k.color(GRANITE_DK);
    for (let y = 16; y < 66; y += 8) {
      const f = (y - 10) / 58;
      k.box(x, y, zc, w - 2 * f + 0.3, 0.5, d - 3 * f + 0.3);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const pz = [];
  for (let i = 0; i <= NP; i++) pz.push(-L + (2 * L * i) / NP);
  // ---- arch trusses
  for (const sx of [-1, 1]) {
    const x = sx * XT;
    const T = pz.map((z) => [x, topY(z), z]);
    const B = pz.map((z) => [x, botY(z), z]);
    k.color(STEEL);
    for (let i = 0; i < NP; i++) {
      k.strut(T[i], T[i + 1], 3.4);
      k.strut(B[i], B[i + 1], 4.4);
    }
    // end posts (bearing -> top chord end) and verticals / diagonals
    k.color(STEEL_DK);
    for (let i = 0; i <= NP; i++) {
      if (!hi && i % 2 && i !== 0 && i !== NP) continue;
      k.strut(B[i], T[i], i === 0 || i === NP ? 3.4 : 1.6);
    }
    if (hi) {
      k.color(STEEL_LT);
      for (let i = 0; i < NP; i++) {
        const mid = NP / 2;
        // Pratt-style: diagonals slope down toward the crown
        if (i < mid) k.strut(T[i], B[i + 1], 1.3); else k.strut(B[i], T[i + 1], 1.3);
      }
    }
    // hangers (arch above deck) and posts (arch below deck)
    k.color(STEEL_DK);
    for (let i = 1; i < NP; i++) {
      const z = pz[i], yb = botY(z);
      if (yb > DECK + 3) k.strut([x, yb, z], [x, DECK - 0.5, z], hi ? 0.9 : 1.4);
      else if (yb < DECK - 4) k.strut([x, yb, z], [x, DECK - 2.2, z], 1.8);
    }
    // skewback bearings
    k.color(GRANITE_DK).box(x, 0, -L - 2, 10, 9, 12).box(x, 0, L + 2, 10, 9, 12);
  }
  // ---- lateral bracing between the trusses
  k.color(STEEL_DK);
  for (let i = 0; i <= NP; i++) {
    const z = pz[i];
    if (!hi && i % 2) continue;
    if (botY(z) > DECK + 6 || botY(z) < DECK - 6) {
      k.strut([-XT, topY(z), z], [XT, topY(z), z], hi ? 1.4 : 2);
      if (botY(z) > DECK + 6) k.strut([-XT, botY(z), z], [XT, botY(z), z], hi ? 1.6 : 2);
    }
    if (hi && i < NP) {
      const z1 = pz[i + 1];
      k.strut([-XT, topY(z), z], [XT, topY(z1), z1], 0.9);
      k.strut([XT, topY(z), z], [-XT, topY(z1), z1], 0.9);
    }
  }
  // ---- deck
  const DL = 302;
  k.color(STEEL_DK).box(0, DECK - 3.2, 0, 49, 2.6, DL * 2);       // deck structure
  k.color(ROAD).box(0, DECK - 0.6, 0, 34, 0.6, DL * 2);           // roadway
  k.color(STEEL).box(-20.5, DECK - 0.6, 0, 8, 0.5, DL * 2).box(20.5, DECK - 0.6, 0, 8, 0.5, DL * 2); // rail / footway
  k.color(STEEL).box(-24.3, DECK - 4.6, 0, 0.6, 5.6, DL * 2).box(24.3, DECK - 4.6, 0, 0.6, 5.6, DL * 2); // fascia girders
  if (hi) {
    // parapet rails + lane lines + lamps
    k.color(STEEL_LT).box(-24.5, DECK, 0, 0.3, 1.2, DL * 2).box(24.5, DECK, 0, 0.3, 1.2, DL * 2);
    k.color(0xd8d8d0);
    for (const lx of [-8.5, 0, 8.5]) k.box(lx, DECK + 0.01, 0, 0.25, 0.02, DL * 2);
    k.glow(true).color(LAMP);
    for (let z = -DL + 10; z <= DL - 10; z += 24) {
      k.box(-17.4, DECK, z, 0.3, 7, 0.3).box(17.4, DECK, z, 0.3, 7, 0.3);
      k.box(-17, DECK + 7, z, 1.2, 0.4, 0.6).box(17, DECK + 7, z, 1.2, 0.4, 0.6);
    }
    // necklace of lights along both top chords
    for (const sx of [-1, 1]) for (let i = 1; i < NP; i++) {
      const z = pz[i] + (pz[1] - pz[0]) / 2;
      k.box(sx * (XT + 1.9), topY(z) - 0.3, z, 0.6, 0.6, 0.6);
    }
    k.glow(false);
  }
  // ---- pylons and end piers
  for (const sz of [-1, 1]) {
    pylon(k, PY.x, sz * PY.zc);
    pylon(k, -PY.x, sz * PY.zc);
    // abutment wall carrying the deck between each pylon pair
    k.color(GRANITE_DK).box(0, 0, sz * PY.zc, 50, DECK - 3.2, 30);
    // approach pier at the end of the modelled deck
    k.color(GRANITE).box(0, 0, sz * (DL - 6), 44, DECK - 3.2, 10);
    if (hi) k.color(GRANITE_SH).box(0, 8, sz * (DL - 6), 18, DECK - 20, 10.2);
  }
}
