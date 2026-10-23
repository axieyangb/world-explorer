// feature/famous-landmarks: Ferry Building, Embarcadero SF — 1:1 (ground to flagpole tip 75 m).
// ~200 m x 36 m two-storey arcaded Colusa-sandstone hall with a skylit clerestory nave, end
// pavilions, and the 75 m Giralda-style clock tower at the centre of the waterfront facade.
// Front (-Z) faces up Market Street (SW); the long axis runs along the Embarcadero.
// At night the stonework is floodlit and the four clock faces glow.

export const lodDist = 1600;
export const glowStrength = 0.9;

const STONE = 0xdcd2bb, STONE_LT = 0xe8e0cc, TRIM = 0xc4b79c, GLASS = 0x2f3438, SHOP = 0x3a3832;
const ROOF = 0x7b8580, SKY = 0x9fb2bb, FACE = 0xfff6dc, BEZEL = 0x3b3a36, HAND = 0x1e1e1e, COPPER = 0x8a9a86;

const L = 100, D = 18;     // half length / half depth of the hall
const TZ = -9.5;           // tower centre (z)

export const colliders = [
  { x: 0, z: 0, hw: L, hd: D, h: 19 },
  { x: 0, z: -0.6, hw: 16, hd: 19.3, h: 21 },
  { x: 0, z: TZ, hw: 8, hd: 8, h: 54 },
  { x: 0, z: TZ, hw: 6, hd: 6, h: 63 },
  { x: 0, z: TZ, r: 4.6, h: 75 },
];

function archPts(w, h, n) {
  const r = w / 2, hs = h - r, pts = [[-r, 0], [r, 0]];
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI; pts.push([r * Math.cos(t), hs + r * Math.sin(t)]); }
  return pts;
}

/** Arch panel on the plane z (front-facing, -Z), protruding `dep` toward -Z. */
function arch(k, x, y0, z, w, h, dep = 0.25, n = 8) {
  k.push().translate(x, y0, z).rotateX(-Math.PI / 2);
  k.extrude(archPts(w, h, n), 0, dep);
  k.pop();
}

/** One long facade of the hall (front-local: plane z = -D). */
function longFacade(k, front) {
  const hi = k.hi;
  const z = -D;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 12; i++) {
      const x = side * (20.5 + i * 5.85);
      if (Math.abs(x) > 86) continue;
      if (hi) {
        k.glow(false).color(SHOP); arch(k, x, 0.6, z + 0.05, 4.0, 7.0, 0.2, 8);
        k.color(GLASS); arch(k, x, 10.9, z + 0.05, 2.4, 4.6, 0.2, 6);
        k.glow(true).color(TRIM);
        k.box(x + side * 2.925, 0, z - 0.2, 1.0, 17, 0.45);       // pilaster between bays
        k.box(x, 7.75, z - 0.12, 1.0, 0.8, 0.3);                  // keystone
      }
    }
  }
  if (!hi) {
    k.glow(false).color(SHOP).box(-53, 0.6, z - 0.1, 66, 6.5, 0.2).box(53, 0.6, z - 0.1, 66, 6.5, 0.2);
    k.color(GLASS).box(-53, 11, z - 0.1, 66, 4, 0.2).box(53, 11, z - 0.1, 66, 4, 0.2);
  }
  k.glow(true);
  // end pavilions: three arches each on the long face
  if (hi) for (const ex of [-94, 94]) {
    for (const dx of [-3.4, 0, 3.4]) {
      k.glow(false).color(SHOP); arch(k, ex + dx, 0.6, z - 0.85, 2.6, 6.2, 0.2, 6);
      k.color(GLASS); arch(k, ex + dx, 10.9, z - 0.85, 2.0, 4.4, 0.2, 6);
      k.color(GLASS); arch(k, ex + dx, 15.6, z - 0.85, 1.6, 2.8, 0.2, 5);
    }
    k.glow(true);
  }
  if (!front && hi) {
    // bay side: central loggia with 5 big arches toward the ferry slips
    k.glow(false).color(SHOP);
    for (let i = -2; i <= 2; i++) arch(k, i * 5.6, 0.6, z + 0.05, 4.2, 8.5, 0.2, 8);
    k.color(GLASS);
    for (let i = -2; i <= 2; i++) arch(k, i * 5.6, 10.9, z + 0.05, 2.6, 4.6, 0.2, 6);
    k.glow(true);
  }
}

function hall(k) {
  const hi = k.hi;
  k.glow(true);
  k.color(STONE).box(0, 0, 0, 2 * L, 9.4, 2 * D);
  k.color(TRIM).box(0, 9.4, 0, 2 * L + 0.8, 0.6, 2 * D + 0.8);          // string course
  k.color(STONE).box(0, 10, 0, 2 * L, 7.0, 2 * D);
  k.color(TRIM).box(0, 17, 0, 2 * L + 1.4, 0.9, 2 * D + 1.4);           // cornice
  k.color(STONE_LT);                                                       // parapet ring
  k.box(0, 17.9, -D + 0.3, 2 * L, 1.0, 0.6).box(0, 17.9, D - 0.3, 2 * L, 1.0, 0.6);
  k.box(-L + 0.3, 17.9, 0, 0.6, 1.0, 2 * D).box(L - 0.3, 17.9, 0, 0.6, 1.0, 2 * D);
  k.glow(false).color(ROOF).box(0, 17.9, 0, 2 * L - 1.2, 0.5, 2 * D - 1.2);
  // clerestory nave with skylit roof
  k.glow(true).color(STONE).box(0, 17.9, 2, 2 * L - 24, 4.2, 13);
  if (hi) {
    k.glow(false).color(GLASS);
    for (let x = -82; x <= 82; x += 4.4) {
      if (Math.abs(x) < 10) continue;
      k.box(x, 18.8, 2 - 6.6, 2.2, 2.6, 0.2).box(x, 18.8, 2 + 6.6, 2.2, 2.6, 0.2);
    }
  }
  k.glow(false).color(ROOF).taper(0, 22.1, 2, 2 * L - 23, 14.2, 2 * L - 26, 3.4, 2.4);
  k.color(SKY).box(0, 24.5, 2, 2 * L - 30, 0.35, 3.0);

  // end pavilions with hipped roofs
  for (const ex of [-94, 94]) {
    k.glow(true).color(STONE).box(ex, 0, 0, 12.6, 20.5, 2 * D + 1.8);
    k.color(TRIM).box(ex, 20.5, 0, 13.6, 0.8, 2 * D + 2.8);
    k.glow(false).color(ROOF).taper(ex, 21.3, 0, 13.2, 2 * D + 2.4, 5, 2 * D - 6, 3.2);
  }

  longFacade(k, true);
  k.push().rotateY(Math.PI); longFacade(k, false); k.pop();

  // short end faces (±X): arches
  if (hi) for (const s of [-1, 1]) {
    k.push().rotateY(s * Math.PI / 2);   // local -Z now points to ∓X
    k.glow(false);
    for (let i = -2; i <= 2; i++) {
      k.color(SHOP); arch(k, i * 6.2, 0.6, -L - 0.25, 3.6, 6.6, 0.2, 6);
      k.color(GLASS); arch(k, i * 6.2, 10.9, -L - 0.25, 2.2, 4.6, 0.2, 6);
    }
    k.glow(true);
    k.pop();
  }

  // central entrance pavilion under the tower (front)
  k.glow(true).color(STONE_LT).box(0, 0, -0.6, 32, 21, 2 * D + 1.4);
  k.color(TRIM).box(0, 21, -0.6, 33, 0.9, 2 * D + 2.4);
  if (hi) {
    const z = -D - 0.7;
    k.glow(false).color(SHOP);
    arch(k, 0, 0, z, 8.6, 13.5, 0.25, 12);
    arch(k, -9.2, 0, z, 4.6, 9.0, 0.25, 8);
    arch(k, 9.2, 0, z, 4.6, 9.0, 0.25, 8);
    k.color(GLASS);
    arch(k, -9.2, 11.2, z, 2.6, 5.4, 0.2, 6);
    arch(k, 9.2, 11.2, z, 2.6, 5.4, 0.2, 6);
    for (const x of [-13.2, 13.2]) arch(k, x, 11.2, z, 1.6, 4.4, 0.2, 5);
    k.glow(true).color(TRIM);
    for (const x of [-15.4, -4.7, 4.7, 15.4]) k.box(x, 0, z - 0.25, 1.4, 21, 0.6);   // pilasters
    k.color(0xb6a582).box(0, 15.0, z - 0.3, 11, 1.6, 0.5);                          // sign band
    k.color(STONE_LT).box(0, 0, z - 0.2, 32, 0.6, 0.6);
  } else {
    k.glow(false).color(SHOP).box(0, 0, -D - 0.75, 8.6, 13, 0.3);
  }
}

function tower(k) {
  const hi = k.hi;
  k.push().translate(0, 0, TZ);
  k.glow(true);
  // base stage above the roof line
  k.color(STONE_LT).box(0, 21.9, 0, 16.8, 4.4, 16.8);
  k.color(TRIM).box(0, 26.3, 0, 17.6, 0.8, 17.6);
  // shaft
  k.color(STONE).box(0, 27.1, 0, 14.4, 18.2, 14.4);
  // clock stage
  k.color(TRIM).box(0, 45.3, 0, 15.8, 0.7, 15.8);
  k.color(STONE_LT).box(0, 46.0, 0, 15.2, 7.6, 15.2);
  k.color(TRIM).box(0, 53.6, 0, 17.0, 0.9, 17.0);                // balcony
  // belfry
  k.color(STONE).box(0, 54.5, 0, 12.0, 7.0, 12.0);
  k.color(TRIM).box(0, 61.5, 0, 13.0, 0.8, 13.0);
  k.color(STONE_LT).box(0, 62.3, 0, 12.0, 0.9, 12.0);
  // lantern (octagonal) + dome + finial
  const oct = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; oct.push([Math.cos(a) * 4.7, Math.sin(a) * 4.7]); }
  k.color(STONE).extrude(oct, 63.2, 4.4);
  k.color(TRIM).cyl(0, 67.6, 0, 5.0, 5.0, 0.5, 8, { phase: Math.PI / 8, smooth: false });
  k.glow(false).color(COPPER).lathe(0, 68.1, 0, [[4.3, 0], [4.1, 1.2], [3.4, 2.4], [2.2, 3.4], [0.9, 4.0], [0.5, 4.3]], hi ? 16 : 8);
  k.color(TRIM).cyl(0, 72.4, 0, 0.55, 0.35, 0.9, 8);
  k.color(HAND).cyl(0, 73.3, 0, 0.12, 0.08, 1.7, 5);

  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    k.glow(true).color(TRIM);
    // corner pilasters of the shaft (one corner per face)
    k.box(6.9, 27.1, -6.9, 1.6, 18.2, 1.6);
    if (hi) {
      k.box(6.2, 54.5, -6.2, 1.2, 7.0, 1.2);                    // belfry corner piers
      k.color(STONE_LT).cyl(5.6, 63.2, -5.6, 0.55, 0.3, 2.2, 6); // corner urns / pinnacles
      // shaft slit windows & quoin bands
      k.glow(false).color(GLASS);
      k.box(-2.2, 30, -7.25, 1.1, 10, 0.2).box(2.2, 30, -7.25, 1.1, 10, 0.2);
      arch(k, -2.2, 40.5, -7.2, 1.1, 3.0, 0.15, 5);
      arch(k, 2.2, 40.5, -7.2, 1.1, 3.0, 0.15, 5);
      arch(k, 0, 22.9, -8.4, 3.2, 3.2, 0.15, 6);
      // belfry: three tall arched openings
      for (const x of [-3.5, 0, 3.5]) arch(k, x, 55.3, -6.0, 2.4, 5.4, 0.15, 6);
      // lantern openings
      k.push().rotateY(Math.PI / 4); arch(k, 0, 64.0, -4.40, 1.4, 3.0, 0.12, 5); k.pop();
      arch(k, 0, 64.0, -4.40, 1.4, 3.0, 0.12, 5);
      // balcony balustrade posts
      k.glow(true).color(STONE_LT);
      for (let x = -7.5; x <= 7.6; x += 1.5) k.box(x, 54.5, -8.1, 0.35, 1.0, 0.35);
      k.box(0, 55.5, -8.1, 15.6, 0.3, 0.45);
    }
    // clock face (bezel, glowing dial, hands at ~10:10)
    const cy = 49.8, fz = -7.6;
    k.push().translate(0, cy, fz).rotateX(Math.PI / 2);   // cylinder axis -> +Z (into the wall)
    k.glow(false).color(BEZEL).cyl(0, -0.35, 0, 3.75, 3.75, 0.5, hi ? 28 : 10);
    k.glow(true).color(FACE).cyl(0, -0.5, 0, 3.3, 3.3, 0.4, hi ? 28 : 10);
    k.pop();
    if (hi) {
      k.glow(false).color(HAND);
      k.push().translate(0, cy, fz - 0.55);
      k.push().rotateZ(0.95); k.box(0, 0, 0, 0.32, 2.0, 0.1); k.pop();   // hour hand
      k.push().rotateZ(-0.95); k.box(0, 0, 0, 0.24, 2.9, 0.1); k.pop();  // minute hand
      for (let h = 0; h < 12; h++) { k.push().rotateZ((h / 12) * Math.PI * 2); k.box(0, 2.75, 0, 0.18, 0.45, 0.1); k.pop(); }
      k.pop();
    }
    k.pop();
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  hall(k);
  tower(k);
}
