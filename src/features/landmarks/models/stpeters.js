// feature/famous-landmarks: St Peter's Basilica, Vatican City — 1:1 (136.6 m to the cross).
// Maderno's travertine facade (115 x 46 m: giant Corinthian order, central pediment, the attic with the 13
// statues of Christ and the apostles, clocks on the end bays) before the nave; Michelangelo's Greek-cross core
// with the three rounded tribunes; the double-shell dome (42 m) on its drum of paired columns, 16 lead ribs,
// lantern, ball and cross; Vignola's two minor cupolas. Floodlit at night.
// Local: axis = Z, front -Z = facade facing St Peter's Square (east, heading 89.4), +Z = west apse.
const TRAV = 0xe4d9c2, TRAV_DK = 0xcfc2a6, TRAV_SH = 0xb7aa8d, LEAD = 0x8f9aa3, LEAD_DK = 0x6f7a84, WIN = 0x34363a;
const CLOCK = 0xf1ece0, GOLD = 0xc9a24a;
const TAU = Math.PI * 2;
const ZF = -108, CZ = 12;        // facade plane, crossing (dome) centre
const H = 45;                    // main cornice / attic top of the body

export const lodDist = 1800;
export const glowStrength = 0.55;
export const colliders = [
  { x: 0, z: ZF + 6, hw: 57, hd: 6, h: 50 },
  { x: 0, z: -50, hw: 32, hd: 50, h: H },
  { x: 0, z: CZ, hw: 48, hd: 48, h: H },
  { x: 0, z: CZ, r: 27, h: 78 },
  { x: 0, z: CZ, r: 20, h: 108 },
  { x: 0, z: CZ, r: 6, h: 133 },
  ...[[-1, 0], [1, 0], [0, 1]].map(([sx, sz]) => ({ x: sx * 52, z: CZ + sz * 52, r: 22, h: H })),
];

// pilastered wall strip facing -Z at plane z (local), from x0..x1, height h; windows in 2 tiers
function order(k, x0, x1, z, h, bay, hi) {
  if (!hi) return;
  const n = Math.max(1, Math.round((x1 - x0) / bay)), b = (x1 - x0) / n;
  k.glow(true).color(TRAV_DK);
  for (let i = 0; i <= n; i++) k.box(x0 + i * b, 2, z - 0.4, 2.0, h - 6, 0.8);
  k.glow(false).color(WIN);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * b, w = Math.min(4, b * 0.35);
    for (const [y0, hh] of [[8, 9], [24, 6]]) k.quad([x + w / 2, y0, z - 0.05], [x - w / 2, y0, z - 0.05], [x - w / 2, y0 + hh, z - 0.05], [x + w / 2, y0 + hh, z - 0.05]);
  }
  k.glow(true);
}

function facade(k) {
  const hi = k.hi, z = ZF, W = 115, D = 12;
  k.glow(true).color(TRAV).box(0, 0, z + D / 2, W, H - 4, D);
  k.color(TRAV_DK).box(0, H - 4, z + D / 2, W + 1, 2, D + 1);                   // main cornice
  k.color(TRAV).box(0, H - 2, z + D / 2, W - 2, 5.5, D - 1);                    // attic
  // giant order: 8 columns in the centre, pilasters elsewhere
  const cols = [-25, -17.5, -10.5, -3.5, 3.5, 10.5, 17.5, 25];
  for (const x of cols) {
    k.color(TRAV).cyl(x, 2, z - 1.5, 1.45, 1.3, 26, hi ? 14 : 6);
    if (hi) k.color(TRAV_DK).box(x, 27.6, z - 1.5, 3.6, 2.4, 3.6);
  }
  k.color(TRAV_SH).box(0, 2, z - 0.1, 54, 28, 0.4);                             // shaded wall behind the columns
  for (const x of [-55, -47, -40, -33, 33, 40, 47, 55]) k.color(TRAV_DK).box(x, 2, z - 0.6, 2.6, 28, 1.2);
  k.color(TRAV_DK).box(0, 30, z - 0.9, W + 0.6, 3.2, 1.8);                     // entablature over the order
  // central pediment
  k.color(TRAV).tri([16, 33.2, z - 1.6], [-16, 33.2, z - 1.6], [0, 39.5, z - 1.6]).tri([0, 39.5, z - 1.6], [-16, 33.2, z - 1.6], [16, 33.2, z - 1.6]);
  k.color(TRAV_DK).quad2([-16, 33.2, z - 1.6], [-16, 33.2, z + 4], [0, 39.5, z + 4], [0, 39.5, z - 1.6]).quad2([0, 39.5, z - 1.6], [0, 39.5, z + 4], [16, 33.2, z + 4], [16, 33.2, z - 1.6]);
  // portals, loggia of the Blessings and windows
  k.glow(false).color(WIN);
  for (const x of [-21, -10.5, 0, 10.5, 21]) {
    const w = x === 0 ? 5 : 4;
    k.quad([x + w / 2, 2, z - 0.3], [x - w / 2, 2, z - 0.3], [x - w / 2, 12, z - 0.3], [x + w / 2, 12, z - 0.3]);
    k.quad([x + w / 2, 18, z - 0.3], [x - w / 2, 18, z - 0.3], [x - w / 2, 25, z - 0.3], [x + w / 2, 25, z - 0.3]);
  }
  for (const x of [-44, -36.5, 36.5, 44]) k.quad([x + 1.6, 8, z - 0.7], [x - 1.6, 8, z - 0.7], [x - 1.6, 16, z - 0.7], [x + 1.6, 16, z - 0.7]);
  // clocks on the end bays
  k.glow(true).color(CLOCK);
  for (const sx of [-1, 1]) {
    k.color(TRAV).box(sx * 51, H + 3.5, z + 4, 12, 6, 8);
    k.color(CLOCK).cyl(sx * 51, H + 0.5, z - 0.3, 2.4, 2.4, 0.2, 16);
  }
  // 13 statues on the attic balustrade (Christ in the middle, 5.7 m)
  k.color(TRAV);
  for (let i = 0; i < 13; i++) {
    const x = -42 + i * 7, y = H + 3.5;
    k.cyl(x, y, z + 1.5, 0.75, 0.45, 4.3, hi ? 8 : 4);
    k.sphere(x, y + 4.9, z + 1.5, 0.5, hi ? 6 : 4, 3);
  }
}

// rounded tribune (apse) of the Greek-cross core, centred at (cx, cz), radius r
function tribune(k, cx, cz, r, hi) {
  k.glow(true).color(TRAV).lathe(cx, -8, cz, [[r, 0], [r, H + 8]], hi ? 28 : 12, { caps: false });
  k.color(TRAV_DK).lathe(cx, H - 2, cz, [[r + 0.8, 0], [r + 0.8, 2], [r - 2, 2]], hi ? 28 : 12, { caps: false });
  k.glow(false).color(LEAD).lathe(cx, H, cz, [[r - 2, 0], [0.2, 9]], hi ? 28 : 12);
  if (!hi) return;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    k.push().translate(cx, 0, cz).rotateY(-a);
    k.glow(true).color(TRAV_DK).box(0, 0, -r - 0.4, 2.0, H - 4, 0.8);
    k.rotateY(-TAU / 40).glow(false).color(WIN).quad([0.8, 10, -r - 0.05], [-0.8, 10, -r - 0.05], [-0.8, 22, -r - 0.05], [0.8, 22, -r - 0.05]);
    k.pop();
  }
}

function dome(k, hi) {
  const seg = hi ? 32 : 16, D0 = H + 3;
  k.glow(true).color(TRAV_DK).cyl(0, H - 2, CZ, 28, 28, 5, seg);              // square-ish base ring
  // drum with 16 projecting pairs of columns and windows
  k.color(TRAV).cyl(0, D0, CZ, 24, 24, 21, seg);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    k.push().translate(0, 0, CZ).rotateY(-a);
    k.glow(true).color(TRAV_DK).box(0, D0, -25.2, 3.6, 21, 2.6);              // buttress with paired columns
    if (hi) for (const dx of [-1.1, 1.1]) k.color(TRAV).cyl(dx, D0, -26.7, 0.6, 0.55, 18, 6);
    k.rotateY(-TAU / 32);                                                       // window between two buttresses
    k.glow(false).color(WIN).quad([1.5, D0 + 6, -24.05], [-1.5, D0 + 6, -24.05], [-1.5, D0 + 15, -24.05], [1.5, D0 + 15, -24.05]);
    k.pop();
  }
  k.glow(true).color(TRAV_DK).cyl(0, D0 + 21, CZ, 26.5, 26.5, 2.2, seg);      // drum cornice
  k.color(TRAV).cyl(0, D0 + 23.2, CZ, 23.5, 23, 6, seg);                       // attic
  // outer shell: slightly ogival (raised) profile, 16 travertine ribs, three tiers of dormers
  const S0 = D0 + 29.2, R = 22.5, SH = 33;
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = t * Math.PI / 2;
    prof.push([Math.max(4.6, R * Math.cos(a) * (1 - 0.08 * t)), SH * Math.pow(Math.sin(a), 0.85)]);
  }
  k.glow(false).color(LEAD).lathe(0, S0, CZ, prof, seg);
  k.glow(true).color(TRAV);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + TAU / 32;
    const pts = prof.map(([r, y]) => [Math.cos(a) * (r + 0.25), S0 + y, CZ + Math.sin(a) * (r + 0.25)]);
    for (let j = 0; j < pts.length - 1; j++) k.strut(pts[j], pts[j + 1], hi ? 1.1 : 1.6);
  }
  if (hi) {
    k.glow(false).color(LEAD_DK);
    for (const [j, n] of [[2, 16], [5, 16], [7, 16]]) {
      const [r, y] = prof[j];
      for (let i = 0; i < n; i++) {
        const a = (i / 16) * TAU;
        k.push().translate(0, 0, CZ).rotateY(-a);
        k.box(0, S0 + y - 0.2, -r - 0.3, 1.6, 1.6, 1.0);
        k.pop();
      }
    }
  }
  // lantern: drum of paired columns, little lead cupola, ball and cross
  const L0 = S0 + SH;
  k.glow(true).color(TRAV).cyl(0, L0 - 0.5, CZ, 5.6, 5.6, 2, hi ? 16 : 8);
  k.color(TRAV_DK).cyl(0, L0 + 1.5, CZ, 4.0, 4.0, 9, hi ? 16 : 8);
  if (hi) for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; k.color(TRAV).cyl(Math.cos(a) * 4.9, L0 + 1.5, CZ + Math.sin(a) * 4.9, 0.35, 0.32, 9, 5); }
  k.color(TRAV).cyl(0, L0 + 10.5, CZ, 5.4, 5.4, 1.4, hi ? 16 : 8);
  k.glow(false).color(LEAD).lathe(0, L0 + 11.9, CZ, [[4.6, 0], [3.0, 3.0], [0.6, 6.2]], hi ? 16 : 8);
  k.glow(true).color(GOLD).sphere(0, L0 + 19.2, CZ, 1.25, 10, 6);
  k.box(0, L0 + 20.2, CZ, 0.35, 4.2, 0.35).box(0, L0 + 22.6, CZ, 1.9, 0.35, 0.35);
}

function cupola(k, x, z, hi) {
  const seg = hi ? 16 : 8;
  k.glow(true).color(TRAV).cyl(x, H, z, 8.5, 8.5, 9, seg);
  k.color(TRAV_DK).cyl(x, H + 9, z, 9.2, 9.2, 1.2, seg);
  k.glow(false).color(LEAD).sphere(x, H + 10.2, z, 8.2, seg, 6, 1.15, 0.5);
  k.glow(true).color(TRAV).cyl(x, H + 19.5, z, 1.8, 1.8, 4, 8);
  k.glow(false).color(LEAD).cyl(x, H + 23.5, z, 1.8, 0.2, 3.5, 8);
}

export function build(k) {
  const hi = k.hi;
  facade(k);
  // nave + aisles/chapels between the facade and the crossing, barrel-vault roof
  const nz0 = ZF + 12, nz1 = CZ - 20;
  k.glow(true).color(TRAV).box(0, -8, (nz0 + nz1) / 2, 64, H + 8 - 2, nz1 - nz0);
  k.color(TRAV_DK).box(0, H - 2, (nz0 + nz1) / 2, 65, 2, nz1 - nz0 + 0.5);
  k.glow(false).color(LEAD).push().translate(0, H, (nz0 + nz1) / 2).rotateX(Math.PI / 2);
  k.lathe(0, -(nz1 - nz0) / 2, 0, [[14, 0], [14, nz1 - nz0]], hi ? 12 : 6, { caps: false });
  k.pop();
  for (const sx of [-1, 1]) {
    k.push().translate(sx * 32, 0, (nz0 + nz1) / 2).rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    order(k, -(nz1 - nz0) / 2, (nz1 - nz0) / 2, -0.05, H - 2, 9, hi);
    k.pop();
  }
  // Greek-cross core around the crossing with three rounded tribunes (N, S, W)
  k.glow(true).color(TRAV).box(0, -8, CZ, 96, H + 6, 96);
  k.color(TRAV_DK).box(0, H - 2, CZ, 97, 2, 97);
  for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    k.push().translate(0, 0, CZ).rotateY(a);
    order(k, -48, 48, -48.05, H - 2, 9.5, hi);
    k.pop();
  }
  tribune(k, -50, CZ, 22, hi);
  tribune(k, 50, CZ, 22, hi);
  tribune(k, 0, CZ + 50, 22, hi);
  // flat terrace roof of the core (travertine-coloured) and the dome
  k.glow(false).color(TRAV_SH).box(0, H, CZ, 94, 0.6, 94);
  dome(k, hi);
  // Vignola's minor cupolas at the front corners of the core
  cupola(k, -34, CZ - 36, hi);
  cupola(k, 34, CZ - 36, hi);
  k.glow(false);
}
