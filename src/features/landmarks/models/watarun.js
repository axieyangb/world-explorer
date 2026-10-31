// feature/famous-landmarks: Wat Arun (Temple of Dawn), Bangkok — 1:1 (central prang ~79 m).
// The Khmer-style central prang on the riverside terrace: three steep redented terraces with Naga
// stairways & Demon/Monkey caryatid friezes on every face, the niche storey (Indra on 3-headed Erawan),
// the tall corncob of receding tiers studded with Benjarong porcelain rosettes, and the golden metal
// spire with its 9-tier crown and Trident of Shiva (Trisula); four satellite prangs on the terrace
// corners, four mondop pavilions at the mid-sides, and the riverfront gate guarded by twin Yaksha giants.
// Front (-Z) faces the Chao Phraya (E).
const PLASTER = 0xece4d4, PLASTER_DK = 0xd3c9b5, SHADE = 0xbcb19b, PORC_A = 0xd98aa0, PORC_B = 0x6f9fc2;
const PORC_C = 0x86b07a, PORC_D = 0xe5c35c, SPIRE = 0xd8b24c, TERR = 0xcfc6b3, ROOF_G = 0x3f7a4c, ROOF_O = 0xc9772e;
const WARM = 0xf3e3c3, GOLD = 0xe8c24c;

export const lodDist = 1300;
export const glowStrength = 0.55;

export const colliders = [
  { x: 0, z: 0, hw: 27, hd: 27, h: 3.2 },
  { x: 0, z: 0, hw: 16, hd: 16, h: 18 },
  { x: 0, z: 0, hw: 9, hd: 9, h: 40 },
  { x: 0, z: 0, r: 4.5, h: 70 },
  { x: -23, z: -23, r: 4, h: 30 }, { x: 23, z: -23, r: 4, h: 30 }, { x: -23, z: 23, r: 4, h: 30 }, { x: 23, z: 23, r: 4, h: 30 },
];

/** Unit redented (indented-corner) square plan, half width 1. */
const PLAN = (() => {
  const n = 0.16;
  const q = [[1, -(1 - 2 * n)], [1, 1 - 2 * n], [1 - n, 1 - 2 * n], [1 - n, 1 - n], [1 - 2 * n, 1 - n], [1 - 2 * n, 1]];
  const out = [];
  for (let r = 0; r < 4; r++) {
    const a = (r * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    for (const [x, z] of q.slice(r === 0 ? 0 : 1)) out.push([x * c - z * s, x * s + z * c]);
  }
  out.pop();
  return out;
})();

function loft(k, x, z, y0, h0, y1, h1) {
  const n = PLAN.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = PLAN[i], [bx, bz] = PLAN[(i + 1) % n];
    k.quad([x + ax * h0, y0, z + az * h0], [x + ax * h1, y1, z + az * h1], [x + bx * h1, y1, z + bz * h1], [x + bx * h0, y0, z + bz * h0]);
  }
}
function cap(k, x, z, y, h) {
  k.push().translate(x, 0, z).scale(h, 1, h);
  k.extrude(PLAN, y - 0.1, 0.1);
  k.pop();
}

/**
 * One prang scaled by s (s = 1: the central 79 m prang). Profile = [y, half width] pairs;
 * terraces get stairways, caryatids & Naga balustrades, the upper tiers get ledges and porcelain studs.
 */
function prang(k, x, z, s, glow) {
  const hi = k.hi;
  const P = [
    [0, 17], [7.5, 15.4], [8.1, 13.2], [18, 11.6], [18.6, 9.6], [27, 8.7], [28, 8.3], [38, 7.7],
  ];
  if (glow) k.glow(true);
  for (let i = 0; i < P.length - 1; i++) {
    const [y0, h0] = P[i], [y1, h1] = P[i + 1];
    k.color(y1 - y0 < 1 ? PLASTER_DK : PLASTER);
    loft(k, x, z, y0 * s, h0 * s, y1 * s, h1 * s);
  }
  // corncob: receding tiers with protruding ledges & antefix flame petals
  const tiers = hi ? 9 : 4;
  const hw = (y) => 7.6 * Math.pow(Math.max(0, 1 - Math.pow((y - 38) / 34, 1.6)), 0.8) + 0.5; // convex bud
  for (let i = 0; i < tiers; i++) {
    const y0 = 38 + (i * 32) / tiers, y1 = 38 + ((i + 1) * 32) / tiers;
    k.color(i % 2 ? PLASTER : PLASTER_DK);
    loft(k, x, z, y0 * s, hw(y0) * 1.06 * s, (y0 + 0.6) * s, hw(y0) * 1.06 * s);
    loft(k, x, z, (y0 + 0.6) * s, hw(y0) * s, y1 * s, hw(y1) * s);
  }
  cap(k, x, z, 70 * s, hw(70) * s);
  if (glow) k.glow(false);
  // Golden metal spire (Noppasul) with 7 umbrella rings and multi-pronged Vajra / Trident of Shiva
  k.color(SPIRE).cyl(x, 70 * s, z, 0.9 * s, 0.12 * s, 9 * s, hi ? 10 : 4);
  if (hi) {
    for (const f of [0.15, 0.3, 0.45, 0.6, 0.75, 0.88]) {
      const rRing = (0.9 - 0.75 * f) * s + 0.22 * s;
      k.color(GOLD).cyl(x, (70 + 9 * f) * s, z, rRing, rRing * 0.85, 0.28 * s, 8);
    }
    if (s > 0.6) {
      for (const dx of [-0.65, -0.32, 0.32, 0.65]) {
        k.strut([x, 76.8 * s, z], [x + dx * s, 79.0 * s, z], 0.11);
        k.strut([x, 76.8 * s, z], [x, 79.0 * s, z + dx * s], 0.11);
      }
      // 4 gold stabilization chains from spire crown to top corncob corners
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        k.strut([x, 77.5 * s, z], [x + sx * 1.4 * s, 69.5 * s, z + sz * 1.4 * s], 0.05);
      }
    }
  }
  if (!hi) return;
  // stairways up the middle of each face of the three terraces + 3-headed Erawan niches + porcelain studs
  for (let f = 0; f < 4; f++) {
    k.push().translate(x, 0, z).rotateY((f * Math.PI) / 2);
    k.color(SHADE);
    for (const [y0, y1, h0, h1] of [[0, 7.5, 17, 15.4], [8.1, 18, 13.2, 11.6], [18.6, 27, 9.6, 8.7]]) {
      k.taper(0, y0 * s, -(h0 + 1.2) * s, 2.6 * s, 2.4 * s, 2.2 * s, 0.6 * s, (y1 - y0) * s, 0, (h0 - h1) * s + 1.0 * s);
      // Gilded Naga balustrades flanking each steep stairway flight
      if (s > 0.6) {
        for (const sx of [-1.35, 1.35]) {
          k.color(GOLD).strut([sx * s, (y0 + 0.6) * s, -(h0 + 2.1) * s], [sx * 0.9 * s, (y1 + 0.5) * s, -(h1 + 0.2) * s], 0.18 * s);
        }
        k.color(SHADE);
      }
    }
    // Niche with Indra on 3-Headed Erawan (white elephant) under a gilded Thai flame-arch pediment
    k.color(PLASTER_DK).box(0, 29 * s, -8.25 * s, 4.2 * s, 8.2 * s, 0.6 * s);
    k.color(GOLD).tri([-2.3 * s, 37.2 * s, -8.55 * s], [2.3 * s, 37.2 * s, -8.55 * s], [0, 40.5 * s, -8.55 * s]);
    k.color(0x526b48).box(0, 32.2 * s, -8.55 * s, 1.6 * s, 3.6 * s, 0.3 * s); // Green Indra figure
    // Three white elephant heads & trunks of Erawan
    k.color(0xf7f4ee);
    for (const dx of [-0.75, 0, 0.75]) {
      k.cyl(dx * s, 29.2 * s, -8.75 * s, 0.42 * s, 0.32 * s, 2.2 * s, 6);
      k.sphere(dx * s, 31.6 * s, -8.75 * s, 0.48 * s, 6, 4);
    }
    // Kinnari / Demon (Yak) / Monkey (Krabi) caryatid figures supporting terrace ledges
    if (s > 0.6) {
      k.color(PLASTER);
      for (const [cy, ch] of [[6.2, 15.6], [16.5, 11.8], [25.5, 8.8]]) {
        for (const dx of [-0.65, -0.45, -0.25, 0.25, 0.45, 0.65]) {
          k.box(dx * ch, cy, -ch - 0.18, 0.42, 1.1, 0.32);
        }
      }
    }
    // Benjarong porcelain floral rosettes on the terrace faces and corncob tiers
    const cols = [PORC_A, PORC_B, PORC_C, PORC_D];
    let ci = f;
    for (const [y, h] of [[4, 16.2], [13, 12.4], [22.5, 9.2], [33, 8.0], [44, 7.4], [52, 6.6], [60, 5.2]]) {
      for (const dx of [-0.62, -0.38, -0.18, 0.18, 0.38, 0.62]) {
        k.color(cols[ci++ % 4]).cyl(dx * h * s, y * s, -h * s - 0.08, 0.38 * s, 0.38 * s, 0.14, 6);
      }
    }
    k.pop();
  }
}

/** Mondop pavilion with a tiered green-and-orange spire at a terrace mid-side. */
function mondop(k, x, z, hi) {
  k.color(PLASTER).box(x, 3.2, z, 6, 6, 6);
  if (hi) {
    // Gilded gable pediments on all 4 sides of the Mondop
    k.color(GOLD);
    k.box(x, 8.8, z, 6.4, 0.4, 6.4);
  }
  for (let t = 0; t < (hi ? 4 : 2); t++) {
    const w = 7.2 - t * 1.4;
    k.color(t % 2 ? ROOF_O : ROOF_G).taper(x, 9.2 + t * 1.8, z, w, w, w - 1.0, w - 1.0, 1.8);
  }
  k.color(GOLD).cyl(x, 9.2 + (hi ? 4 : 2) * 1.8, z, 1.4, 0.1, 6, hi ? 8 : 4);
}

export function build(k) {
  const hi = k.hi;
  // riverside terrace: square with corner bastions and mid-side porches, balustrade
  k.color(TERR).box(0, 0, 0, 54, 3.2, 54);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 24.5, 0, sz * 24.5, 7, 3.2, 7);
  for (const [dx, dz, w, d] of [[0, -26, 14, 4], [0, 26, 14, 4], [-26, 0, 4, 14], [26, 0, 4, 14]]) k.box(dx, 0, dz, w, 3.2, d);
  if (hi) {
    k.color(PLASTER);
    for (const [dx, dz, w, d] of [[0, -27.2, 54, 0.4], [0, 27.2, 54, 0.4], [-27.2, 0, 0.4, 54], [27.2, 0, 0.4, 54]]) k.box(dx, 3.2, dz, w, 1.0, d);
    // Riverfront Entrance Gate (Suma Pier / Ordination Hall Gate at -Z) & Twin Yaksha Guardian Giants
    // (White Sahatsadecha on left, Green Totsakan on right)
    for (const [gx, bodyCol] of [[-5.2, 0xf2efe6], [5.2, 0x3b7a4a]]) {
      k.color(PLASTER_DK).box(gx, 0, -31.5, 2.4, 1.4, 2.4);
      k.color(bodyCol).cyl(gx, 1.4, -31.5, 0.85, 0.65, 3.8, 8);
      k.color(GOLD).box(gx, 3.2, -31.5, 1.6, 1.4, 1.2); // Golden shoulder armor
      k.color(bodyCol).sphere(gx, 5.5, -31.5, 0.55, 6, 4);
      k.color(GOLD).cyl(gx, 5.9, -31.5, 0.45, 0.08, 1.5, 6); // Thai Chada crown spire
      k.color(0x5a4838).cyl(gx + (gx < 0 ? 0.85 : -0.85), 1.4, -32.2, 0.12, 0.12, 4.6, 5); // Giant's club (Gada)
    }
    // Chinese stone guardian lions & pagodas (ballast sculptures) at terrace corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.color(0x8c887e).cyl(sx * 26.5, 3.2, sz * 26.5, 0.65, 0.45, 3.4, 6);
    }
  }
  // central prang on the terrace
  k.push().translate(0, 3.2, 0);
  prang(k, 0, 0, 0.955, true);
  k.pop();
  // four satellite prangs on the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.push().translate(0, 3.2, 0);
    prang(k, sx * 23, sz * 23, 0.36, false);
    k.pop();
  }
  // four mondops at the mid-sides
  mondop(k, 0, -21, hi); mondop(k, 0, 21, hi); mondop(k, -21, 0, hi); mondop(k, 21, 0, hi);
  // warm floodlights at the terrace foot (night)
  k.glow(true).color(WARM);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 18, 3.2, sz * 18, 0.6, 0.4, 0.6);
  k.glow(false);
}
