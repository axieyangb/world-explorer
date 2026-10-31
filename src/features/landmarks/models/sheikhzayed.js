// feature/famous-landmarks: Sheikh Zayed Grand Mosque, Abu Dhabi — 1:1 (minarets ~107 m, main dome 85 m).
// White-marble complex ~183 x 242 m on the WSW-ENE qibla axis: the prayer hall at the west end (+Z) under
// the 37 m main dome flanked by two large domes and rows of smaller ones; the vast courtyard with its
// floral marble floor, ringed by arcades of pointed arches on gilded columns, each bay under a small
// gold-tipped dome; the domed east entrance (front, -Z) and four minarets at the corners.
// At night the whole mosque is washed in its pale blue-grey "lunar" light.
const MARBLE = 0xf4f3ef, MARBLE_DK = 0xdcdad3, MARBLE_SH = 0xc2c0b9, GOLD = 0xd6ad4a, ARCH = 0x9ea4a8;
const FLOOR = 0xe9e7e0, FLOWER = 0x7f9a6a, FLOWER2 = 0xc9a65a, HALL_WIN = 0x6b7680;

export const lodDist = 1600;
export const glowStrength = 0.5; // pale floodlit marble at night

const HW = 91;          // building half width (local X)
const ZF = -121, ZB = 121; // east (front) and west ends
const CXW = 80;         // courtyard arcade line (x)
const CZF = -108, CZB = 25; // courtyard east / west arcade lines (z)
const HALL0 = 33;       // prayer hall front wall
const AH = 13;          // arcade roof height

export const colliders = [
  { x: 0, z: (HALL0 + ZB) / 2, hw: 84, hd: (ZB - HALL0) / 2, h: 24 },
  { x: 0, z: 77, r: 18, h: 78 },
  { x: -46, z: 73, r: 12, h: 55 }, { x: 46, z: 73, r: 12, h: 55 },
  { x: -86, z: -40, hw: 6, hd: 80, h: AH }, { x: 86, z: -40, hw: 6, hd: 80, h: AH },
  { x: 0, z: -114, hw: 92, hd: 7, h: AH },
  { x: -80, z: -109, r: 5, h: 107 }, { x: 80, z: -109, r: 5, h: 107 },
  { x: -80, z: 75, r: 5, h: 107 }, { x: 80, z: 75, r: 5, h: 107 },
];

/** Onion dome on a drum: centre (x, z), drum from y0 (height dh, radius r), white with gold finial. */
function dome(k, x, z, y0, r, dh, seg, finial = true) {
  k.color(MARBLE_DK).cyl(x, y0, z, r * 1.04, r * 1.04, dh, seg);
  const d = y0 + dh;
  k.glow(true).color(MARBLE).lathe(x, d, z, [
    [r, 0], [r * 1.08, r * 0.25], [r * 1.1, r * 0.5], [r * 1.02, r * 0.8], [r * 0.82, r * 1.1],
    [r * 0.52, r * 1.38], [r * 0.22, r * 1.6], [r * 0.06, r * 1.72],
  ], seg);
  k.glow(false);
  if (finial) {
    const t = d + r * 1.72;
    k.color(GOLD).cyl(x, t - 0.2, z, r * 0.07, r * 0.05, r * 0.3, 6);
    k.sphere(x, t + r * 0.17, z, r * 0.08, 6, 3);
    k.cyl(x, t + r * 0.22, z, r * 0.03, r * 0.01, r * 0.38, 4);
  }
}

/** Arcade run from (ax, az) to (bx, bz): outer wall, roof slab, pointed-arch colonnade on the court side. */
function arcade(k, ax, az, bx, bz, nx, nz, domes) {
  const hi = k.hi;
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const bays = Math.round(len / 7.6);
  const W = 11; // arcade depth toward the outside (n points to the court)
  // roof slab + outer wall, drawn as a rotated box via taper on a frame
  const mx = (ax + bx) / 2 - nx * W / 2, mz = (az + bz) / 2 - nz * W / 2;
  const ang = Math.atan2(ux, uz);
  k.push().translate(mx, 0, mz).rotateY(ang);
  k.color(MARBLE).box(-W / 2 + 0.6, 0, 0, 1.2, AH, len);           // outer wall side (frame x)
  k.color(MARBLE_DK).box(0, AH - 1.6, 0, W + 1.2, 1.6, len + 1.2);  // roof slab
  k.color(MARBLE).box(0, AH, 0, W + 1.4, 0.5, len + 1.4);
  k.pop();
  // columns + arches on the court side
  for (let i = 0; i <= bays; i++) {
    const t = i / bays;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (hi) {
      k.color(MARBLE_DK).cyl(px, 0, pz, 0.78, 0.72, 0.55, 8); // octagonal marble pedestal base
      k.color(MARBLE).cyl(px, 0.55, pz, 0.6, 0.6, AH - 4.75, 6);
      // 24-karat gold date-palm frond capital (iconic gilded crown at column top)
      k.color(GOLD).cyl(px, AH - 4.2, pz, 0.62, 0.95, 0.9, 6);
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * Math.PI * 2;
        k.strut([px + Math.cos(fa) * 0.45, AH - 4.0, pz + Math.sin(fa) * 0.45], [px + Math.cos(fa) * 1.15, AH - 3.2, pz + Math.sin(fa) * 1.15], 0.14);
      }
    } else if (i % 3 === 0) k.color(MARBLE).box(px, 0, pz, 1.4, AH - 1.6, 1.4);
    if (domes && i < bays && (hi || i % 2 === 0)) {
      const dx = px + (bx - ax) / bays / 2 - nx * W / 2, dz = pz + (bz - az) / bays / 2 - nz * W / 2;
      dome(k, dx, dz, AH + 0.5, 3.0, 1.0, hi ? 8 : 5, false);
      if (hi) k.color(GOLD).cyl(dx, AH + 6.6, dz, 0.18, 0, 1.4, 3);
    }
  }
  if (hi) {
    // spandrel band with pointed-arch openings: dark arch recesses under the slab
    k.color(ARCH);
    for (let i = 0; i < bays; i++) {
      const t0 = i / bays, t1 = (i + 1) / bays;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      const pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const y0 = AH - 3.3, y1 = AH - 1.0;
      const off = (p, y) => [p[0] - nx * 0.5, y, p[1] - nz * 0.5];
      k.quad2(off(p0, y0), off(p1, y0), off(pm, y1), off(pm, y1 - 0.01));
    }
    k.color(MARBLE_SH);
    k.strut([ax - nx * 0.4, AH - 1.6, az - nz * 0.4], [bx - nx * 0.4, AH - 1.6, bz - nz * 0.4], 0.5);
  }
}

function minaret(k, x, z) {
  const hi = k.hi, seg = hi ? 16 : 8;
  k.color(MARBLE).box(x, 0, z, 10, 30, 10);
  k.color(MARBLE_DK).box(x, 30, z, 11, 1.2, 11);
  k.color(MARBLE).extrude(Array.from({ length: 8 }, (_, i) => [x + Math.cos(i * Math.PI / 4 + Math.PI / 8) * 4.6, z + Math.sin(i * Math.PI / 4 + Math.PI / 8) * 4.6]), 31.2, 28);
  k.color(MARBLE_DK).cyl(x, 59.2, z, 4.2, 5.8, 1.8, seg).cyl(x, 61, z, 5.8, 5.8, 1.0, seg, { caps: false });
  k.color(MARBLE).cyl(x, 62, z, 3.6, 3.4, 22, seg);
  k.color(MARBLE_DK).cyl(x, 84, z, 3.4, 5.0, 1.6, seg).cyl(x, 85.6, z, 5.0, 5.0, 0.9, seg, { caps: false });
  // lantern pavilion
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.color(MARBLE).cyl(x + Math.cos(a) * 2.6, 86.5, z + Math.sin(a) * 2.6, 0.32, 0.32, 5, 5, { caps: false });
    }
    k.color(HALL_WIN).cyl(x, 86.5, z, 1.8, 1.8, 5, 8);
  } else k.color(MARBLE_SH).cyl(x, 86.5, z, 2.8, 2.8, 5, 6);
  k.color(MARBLE).cyl(x, 91.5, z, 3.4, 3.4, 0.8, seg);
  k.color(GOLD).lathe(x, 92.3, z, [[3.1, 0], [3.5, 2.2], [2.8, 4.6], [1.4, 6.6], [0.4, 8.0], [0, 8.4]], seg);
  k.color(GOLD).cyl(x, 100.5, z, 0.25, 0.1, 6.5, 5);
}

export function build(k) {
  const hi = k.hi;
  // podium + courtyard floor with floral inlay
  k.color(MARBLE_DK).box(0, 0, 0, HW * 2 + 4, 1.0, ZB - ZF + 4);
  if (hi) {
    // 10 dark-blue mosaic Reflective Pools flanking the North, South, and East outer arcades
    for (const sx of [-1, 1]) {
      // Long lateral reflecting pools along North (+X) and South (-X) flanks
      k.color(MARBLE).box(sx * (HW + 10), 0, -4, 15, 0.85, 216);
      k.glow(true).color(0x1f5b82).box(sx * (HW + 10), 0.35, -4, 13, 0.45, 212);
      k.glow(false);
      // East entrance flanking reflecting pools
      k.color(MARBLE).box(sx * 52, 0, ZF - 11, 56, 0.85, 16);
      k.glow(true).color(0x1f5b82).box(sx * 52, 0.35, ZF - 11, 53, 0.45, 13.5);
      k.glow(false);
    }
  }
  k.color(FLOOR).box(0, 1.0, (CZF + CZB) / 2, CXW * 2, 0.12, CZB - CZF);
  if (hi) {
    for (let i = -3; i <= 3; i++) {
      for (let j = 0; j < 7; j++) {
        const fx = i * 20, fz = CZF + 14 + j * 17.5;
        k.color((i + j) % 2 ? FLOWER : FLOWER2);
        k.extrude(rosette(fx, fz, 4.2, 1.6), 1.12, 0.04);
      }
    }
  }
  k.push().translate(0, 1, 0);
  // courtyard arcades with small domes: north / south sides, east side, and the west (hall) side
  arcade(k, -CXW, CZF, -CXW, ZB - 6, 1, 0, true);
  arcade(k, CXW, ZB - 6, CXW, CZF, -1, 0, true);
  arcade(k, CXW, CZF, -CXW, CZF, 0, 1, true);
  arcade(k, -CXW + 12, CZB, CXW - 12, CZB, 0, -1, true);
  // east entrance portal + dome
  k.color(MARBLE).box(0, 0, CZF - 7, 26, 22, 14);
  k.color(ARCH).box(0, 0, CZF - 14.1, 10, 15, 0.3);
  dome(k, 0, CZF - 3, 22, 6.6, 3, hi ? 16 : 8);
  // prayer hall (floodlit)
  k.glow(true).color(MARBLE).box(0, 0, (HALL0 + ZB) / 2 - 1, (CXW - 4) * 2, 22, ZB - HALL0 - 6);
  k.glow(false).color(MARBLE_DK).box(0, 22, (HALL0 + ZB) / 2 - 1, (CXW - 4) * 2 + 1, 1.2, ZB - HALL0 - 5);
  if (hi) {
    k.color(HALL_WIN);
    for (let i = -6; i <= 6; i++) k.box(i * 11, 4, HALL0 + 1.9, 4.5, 12, 0.2);
  }
  // hall portico with its dome on the courtyard side
  k.color(MARBLE).box(0, 0, CZB + 5, 30, 20, 10);
  dome(k, 0, CZB + 7, 20, 7.7, 3, hi ? 16 : 8);
  // main dome (crown ~85 m) and the two large flanking domes
  dome(k, 0, 77, 23, 18.6, 12, hi ? 36 : 14);
  dome(k, -46, 73, 23, 12.6, 6, hi ? 24 : 10);
  dome(k, 46, 73, 23, 12.6, 6, hi ? 24 : 10);
  if (hi) {
    // Arched stained-glass clerestory windows around the main dome and flanking dome drums
    k.glow(true).color(0x88b0d8);
    for (let w = 0; w < 24; w++) {
      const a = (w / 24) * Math.PI * 2;
      k.push().translate(Math.cos(a) * 19.3, 25.5, 77 + Math.sin(a) * 19.3).rotateY(-a);
      k.box(0, 0, 0, 0.2, 6.5, 1.8);
      k.pop();
    }
    for (const sx of [-46, 46]) {
      for (let w = 0; w < 16; w++) {
        const a = (w / 16) * Math.PI * 2;
        k.push().translate(sx + Math.cos(a) * 13.1, 24.2, 73 + Math.sin(a) * 13.1).rotateY(-a);
        k.box(0, 0, 0, 0.18, 3.6, 1.4);
        k.pop();
      }
    }
    k.glow(false);
    // Qibla Mihrab golden apse niche protruding from the west exterior wall (+Z = 117)
    k.color(MARBLE).cyl(0, 0, ZB - 3.5, 6.5, 6.5, 18, 12);
    dome(k, 0, ZB - 3.5, 18, 4.8, 1.8, 12);
  }
  // rows of medium domes over the hall wings and the back
  for (const sx of [-1, 1]) {
    for (const [x, z] of [[24, 48], [66, 48], [24, 104], [66, 104], [66, 76]]) dome(k, sx * x, z, 23, 6.2, 2.5, hi ? 14 : 7);
  }
  dome(k, 0, 108, 23, 6.9, 2.5, hi ? 14 : 7);
  k.pop();
  // minarets at the courtyard / hall corners
  for (const [x, z] of [[-80, -109], [80, -109], [-80, 75], [80, 75]]) minaret(k, x, z);
}

/** Eight-pointed floral rosette (star polygon) for the courtyard floor. */
function rosette(x, z, ro, ri) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = i % 2 ? ri : ro;
    out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return out;
}
