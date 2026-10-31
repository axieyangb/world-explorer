// feature/famous-landmarks: Hagia Sophia, Istanbul — 1:1 (main dome crown 55.6 m).
// Rose-ochre rendered block (~70 x 70 m) with the double narthex on the west (front, -Z) and the apse
// on the east; the 31 m ribbed central dome on its drum of 40 windows, carried by four great arches
// whose north / south tympanum walls show as round-topped gables, east / west semi-domes with their
// small exedra half-domes, the massive buttress towers & west flying buttresses, Ottoman Şadırvan
// ablution fountain, Imperial Tombs, and the four Ottoman minarets with muqarnas balconies & golden
// crescent finials (alem). Floodlit at night.
const WALL = 0xd59d7c, WALL_DK = 0xb98065, WALL_LT = 0xe2b393, LEAD = 0x7c858c, LEAD_DK = 0x646c73;
const WIN = 0x6a4436, STONE = 0xe6e0d4, STONE_DK = 0xc9c1b2, BRICK = 0xa8604a, GOLD = 0xd8b24c;

export const lodDist = 1400;
export const glowStrength = 0.55;

const DB = 43;      // dome springing
const DR = 16;      // dome radius
const CT = 33;      // top of the central square / arch springing

export const colliders = [
  { x: 0, z: -3, hw: 35, hd: 33, h: 24 },
  { x: 0, z: -41, hw: 35, hd: 6, h: 16 },
  { x: 0, z: 0, hw: 18, hd: 18, h: 50 },
  { x: 0, z: 0, r: 15, h: 55 },
  { x: -34, z: -52, r: 3, h: 60 }, { x: 34, z: -52, r: 3, h: 60 },
  { x: -33, z: 43, r: 3, h: 56 }, { x: 36, z: 32, r: 3, h: 56 },
];

/** Ottoman golden crescent finial (alem) at (x, y, z). */
function alem(k, x, y, z, s = 1.0) {
  k.color(GOLD).cyl(x, y, z, 0.14 * s, 0.08 * s, 1.8 * s, 5);
  if (!k.hi) return;
  k.sphere(x, y + 0.7 * s, z, 0.24 * s, 6, 4);
  k.sphere(x, y + 1.3 * s, z, 0.18 * s, 6, 4);
  // Open crescent horns at top
  k.strut([x - 0.45 * s, y + 2.05 * s, z], [x, y + 1.65 * s, z], 0.11 * s);
  k.strut([x + 0.45 * s, y + 2.05 * s, z], [x, y + 1.65 * s, z], 0.11 * s);
  k.strut([x - 0.45 * s, y + 2.05 * s, z], [x - 0.25 * s, y + 2.45 * s, z], 0.09 * s);
  k.strut([x + 0.45 * s, y + 2.05 * s, z], [x + 0.25 * s, y + 2.45 * s, z], 0.09 * s);
}

/** Round-topped tympanum gable in the plane x = px (facing ±X), centred z = 0. */
function tympanum(k, px, sx) {
  const n = k.hi ? 12 : 5, r = 15.5;
  k.color(WALL);
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n);
    const p = (a) => [px, CT + Math.sin(a) * r, Math.cos(a) * r];
    const q = (a) => [px, CT, Math.cos(a) * r];
    if (sx > 0) k.quad(q(a0), q(a1), p(a1), p(a0)); else k.quad(q(a0), p(a0), p(a1), q(a1));
  }
  // lead-covered arch rim
  k.color(LEAD_DK);
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n);
    k.strut([px, CT + Math.sin(a0) * r, Math.cos(a0) * r], [px, CT + Math.sin(a1) * r, Math.cos(a1) * r], 1.6);
  }
  if (k.hi) {
    // window rows in the tympanum
    k.color(WIN);
    const off = px + sx * 0.08;
    for (let i = -3; i <= 3; i++) k.box(off, CT + 1.5, i * 3.6, 0.1, 5.5, 1.7);
    for (let i = -2; i <= 2; i++) k.box(off, CT + 8.5, i * 3.6, 0.1, 3.8, 1.7);
  }
}

function minaret(k, x, z, h, shaft) {
  const hi = k.hi, seg = hi ? 16 : 6;
  k.color(STONE_DK).box(x, 0, z, 6.2, 9, 6.2);
  if (hi) k.color(STONE).taper(x, 9, z, 6.0, 6.0, 4.4, 4.4, 2.2); // Turkish triangle transition boot (küp)
  k.color(shaft).cyl(x, 11, z, 2.1, 1.85, h - 21, seg);
  if (hi) {
    // Vertical flutes on Sinan's western minarets
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.color(STONE_DK).strut([x + Math.cos(a) * 2.12, 11.5, z + Math.sin(a) * 2.12],
                              [x + Math.cos(a) * 1.87, h - 10.5, z + Math.sin(a) * 1.87], 0.14);
    }
  }
  const balconies = h > 58 ? [0.52, 0.7, 0.86] : [0.6, 0.84];
  for (const f of balconies) {
    const y = 11 + (h - 21) * f;
    k.color(STONE).cyl(x, y - 1.2, z, 1.95, 3.0, 1.2, seg);
    if (hi) {
      // Muqarnas stalactite corbel brackets under balcony
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.color(STONE_DK).box(x + Math.cos(a) * 2.4, y - 0.8, z + Math.sin(a) * 2.4, 0.45, 0.8, 0.45);
      }
    }
    k.color(STONE_DK).cyl(x, y, z, 3.0, 3.0, 1.0, seg, { caps: false });
  }
  const top = h - 10;
  k.color(shaft).cyl(x, top - 1, z, 1.85, 1.85, 1, seg);
  k.color(LEAD).cyl(x, top, z, 2.2, 0.0, 9.2, seg);
  alem(k, x, top + 9.0, z, 0.9);
}

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 40 : 14;
  // main block (nave + aisles + galleries) and lead aisle roofs
  k.color(WALL).box(0, 0, -3, 70, 22, 64);
  if (hi) {
    // Alternating horizontal red-brick and cream-stone courses along lower walls
    k.color(STONE);
    for (const y of [4.5, 9.5, 14.5, 19.5]) k.box(0, y, -3, 70.2, 0.45, 64.2);
  }
  k.color(LEAD_DK).taper(0, 22, -3, 70.5, 64.5, 62, 58, 2.2);
  // double narthex on the west (front)
  k.color(WALL_DK).box(0, 0, -41, 68, 15, 12);
  k.color(LEAD).taper(0, 15, -41, 68.5, 12.5, 66, 6, 2.0);
  if (hi) {
    k.color(WIN);
    for (let i = -6; i <= 6; i++) {
      k.box(i * 5, 6, -47.06, 2.0, 5.5, 0.1);
      k.box(i * 5, 1.0, -47.06, 2.4, 3.5, 0.1);
    }
    // 4 Massive West Facade Flying Buttress Piers (Roman-Byzantine buttresses facing the atrium, z = -47..-53)
    for (const bx of [-18, -6, 6, 18]) {
      k.color(WALL_DK).box(bx, 0, -50, 3.2, 11.5, 6.2);
      k.color(WALL).strut([bx, 11.0, -52.2], [bx, 17.5, -41.0], 2.2);
      k.color(LEAD).box(bx, 11.5, -50, 3.4, 0.4, 6.4);
    }
    // gallery windows along both flanks
    for (const sx of [-1, 1]) {
      for (let i = -5; i <= 5; i++) {
        k.color(WIN).box(sx * 35.06, 13, -3 + i * 5.5, 0.1, 5.5, 2.2);
        k.box(sx * 35.06, 4, -3 + i * 5.5, 0.1, 4.0, 2.2);
      }
    }
    // Ottoman Şadırvan (Domed Ablution Fountain) on the SW courtyard (-22, 0, -56)
    const fx = -21, fz = -56;
    k.color(STONE).cyl(fx, 0, fz, 5.2, 5.2, 1.2, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.color(STONE).cyl(fx + Math.cos(a) * 4.5, 1.2, fz + Math.sin(a) * 4.5, 0.25, 0.22, 3.6, 6);
    }
    k.color(LEAD).cyl(fx, 4.8, fz, 6.2, 3.8, 1.8, 8);
    k.sphere(fx, 6.6, fz, 3.8, 12, 6, 0.75, 0.5);
    alem(k, fx, 9.2, fz, 0.55);

    // Imperial Ottoman Mausoleums (Tombs of Sultan Selim II & Murad III) on the SE courtyard (x = 24, z = 44)
    for (const [tx, tz, tr] of [[21, 44, 7.2], [7, 46, 5.6]]) {
      k.color(STONE).cyl(tx, 0, tz, tr, tr, 9.5, 8, { phase: Math.PI / 8, smooth: false });
      k.color(LEAD).sphere(tx, 9.5, tz, tr * 0.92, 12, 6, 0.75, 0.5);
      alem(k, tx, 9.5 + tr * 0.68, tz, 0.5);
    }
  }
  // apse (east) with half dome & external three-sided buttresses
  k.color(WALL).cyl(0, 0, 29, 10, 10, 24, hi ? 16 : 8);
  k.color(LEAD).sphere(0, 24, 29, 10, hi ? 16 : 8, hi ? 5 : 3, 0.7, 0.5);
  // central square of the four great piers
  k.color(WALL_LT).box(0, 22, 0, 34, CT - 22, 34);
  // buttress towers (north / south flanks) with lead caps
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = sx * 25, bz = sz * 13;
      k.color(WALL_DK).box(bx, 0, bz, 13, 36, 9);
      k.color(LEAD_DK).taper(bx, 36, bz, 13.4, 9.4, 4, 2, 4);
      if (hi) {
        k.color(WALL).strut([bx - sx * 6.5, 33, bz], [sx * 16.8, 40, bz], 2.6);
        // Brick relieving arches on the massive flank buttresses
        k.color(WIN).box(bx + sx * 6.55, 16, bz, 0.15, 7, 3.2);
      }
    }
  }
  // north / south tympanum gables
  tympanum(k, 17, 1);
  tympanum(k, -17, -1);
  // east / west semi-domes (with the small exedra half-domes at their corners)
  for (const sz of [-1, 1]) {
    k.color(WALL).box(0, 22, sz * 22.5, 31, CT - 22, 13);
    k.push().translate(0, CT, sz * 16);
    k.push().rotateY(sz > 0 ? 0 : Math.PI);
    // quarter sphere bulging toward +Z of this frame
    const n = hi ? 12 : 4, m = hi ? 6 : 3, r = 15.5;
    k.color(LEAD);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const a0 = Math.PI * (i / n), a1 = Math.PI * ((i + 1) / n);
        const b0 = (Math.PI / 2) * (j / m), b1 = (Math.PI / 2) * ((j + 1) / m);
        const P = (a, b) => [Math.cos(a) * r * Math.cos(b), Math.sin(b) * r * 0.95, Math.sin(a) * r * Math.cos(b)];
        k.quad(P(a0, b0), P(a0, b1), P(a1, b1), P(a1, b0));
      }
    }
    k.pop();
    k.pop();
    if (hi) {
      // Semi-dome windows & golden alem finials
      for (let i = -2; i <= 2; i++) {
        k.color(WIN).box(i * 4.2, CT + 1.2, sz * 30.5, 1.4, 3.2, 0.2);
      }
      alem(k, 0, CT + 14.5, sz * 20, 0.75);
    }
    for (const sx of [-1, 1]) k.color(LEAD_DK).sphere(sx * 10.5, 24, sz * 25, 6.5, hi ? 10 : 6, hi ? 4 : 2, 0.8, 0.5);
  }
  // drum with 40 windows and buttressing ribs, then the shallow ribbed dome
  k.color(WALL_LT).cyl(0, CT, 0, DR + 1.5, DR + 1.5, DB - CT, seg);
  if (hi) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, a2 = a + Math.PI / 40;
      k.color(WIN).push().translate(Math.cos(a2) * (DR + 1.52), 0, Math.sin(a2) * (DR + 1.52)).rotateY(-a2 + Math.PI / 2);
      k.box(0, DB - 3.4, 0, 1.0, 2.6, 0.1);
      k.pop();
      k.color(WALL).box(Math.cos(a) * (DR + 2.0), DB - 4.4, Math.sin(a) * (DR + 2.0), 1.0, 4.4, 1.0);
      k.color(LEAD_DK).box(Math.cos(a) * (DR + 2.0), DB, Math.sin(a) * (DR + 2.0), 1.1, 0.35, 1.1);
    }
  }
  k.color(LEAD).lathe(0, DB, 0, [[DR + 1.4, 0], [DR + 0.6, 2.5], [DR - 1.5, 6], [DR - 5, 9.5], [DR - 9.5, 11.6], [3, 12.4], [0, 12.6]], seg);
  if (hi) {
    k.color(LEAD_DK);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      k.tube([[c * (DR + 1.45), DB + 0.2, s * (DR + 1.45)], [c * (DR + 0.65), DB + 2.7, s * (DR + 0.65)], [c * (DR - 1.45), DB + 6.2, s * (DR - 1.45)], [c * (DR - 4.95), DB + 9.7, s * (DR - 4.95)], [c * 3, DB + 12.5, s * 3]], 0.18, 3);
    }
  }
  alem(k, 0, DB + 12.5, 0, 1.4);
  // floodlit lower walls at night
  k.glow(true).color(WALL_LT);
  k.box(0, 0.2, -3, 70.3, 1.0, 64.3);
  k.glow(false);
  // minarets: two Sinan minarets at the west, the brick (SE) and slender white (NE) ones at the east
  minaret(k, -34, -52, 62, STONE);
  minaret(k, 34, -52, 62, STONE);
  minaret(k, -33, 43, 56, BRICK);
  minaret(k, 36, 32, 56, STONE);
}
