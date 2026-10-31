// feature/famous-landmarks: Taipei 101 — 1:1 (roof 449 m, spire tip 508 m).
// Double-notched square plan ("sawtooth" corners) throughout: a truncated-pyramid pedestal (floors
// 1–26) with a giant ruyi coin medallion on each face, eight stacked eight-storey modules flaring
// outward like a bamboo stalk / pagoda (floors 27–90) with curled ruyi dragon-cloud corner scrolls,
// the visible 660-tonne golden Tuned Mass Damper at floors 87–92, stepped top floors, LOVE sculpture at
// the north plaza, and the pinnacle spire. Front (-Z) = Xinyi Road side (north).
const GLASS = 0x67958f, GLASS_DK = 0x4f7d78, FIN = 0xa8c0bc, FRAME = 0xcfd9d6;
const RIM = 0xffe6a8, BAND = 0x6f9c8f, GOLD = 0xc9a24a, GOLD_LT = 0xf2c95e, SPIRE = 0xb9c2c4;

export const lodDist = 2400;
export const glowStrength = 2.0;

const PED = 109;         // pedestal top (floor 26)
const MOD = 34;          // module height (8 floors)
const M0 = PED + 2;      // first module base
const TOP = M0 + 8 * MOD; // 383: base of the top floors
const ROOF = 449;
const N = 0.075;         // corner notch step (fraction of the half width)

export const colliders = [
  { x: 0, z: 0, hw: 27, hd: 27, h: PED },
  { x: 0, z: 0, hw: 23, hd: 23, h: TOP },
  { x: 0, z: 0, hw: 16, hd: 16, h: ROOF },
];

/** Unit double-notched square (half width 1), counter-clockwise from +x. */
const PLAN = (() => {
  const q = [[1, -(1 - 2 * N)], [1, 1 - 2 * N], [1 - N, 1 - 2 * N], [1 - N, 1 - N], [1 - 2 * N, 1 - N], [1 - 2 * N, 1]];
  const out = [];
  for (let r = 0; r < 4; r++) {
    const a = (r * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    for (const [x, z] of q.slice(r === 0 ? 0 : 1)) out.push([x * c - z * s, x * s + z * c]);
  }
  out.pop(); // last corner point closes onto the first
  return out;
})();

/** Lofted band of the plan from half width h0 at y0 to h1 at y1 (+ optional flat cap). */
function loft(k, y0, h0, y1, h1, cap = true) {
  const n = PLAN.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = PLAN[i], [bx, bz] = PLAN[(i + 1) % n];
    k.quad([ax * h0, y0, az * h0], [ax * h1, y1, az * h1], [bx * h1, y1, bz * h1], [bx * h0, y0, bz * h0]);
  }
  if (cap) {
    k.push().scale(h1, 1, h1);
    k.extrude(PLAN, y1 - 0.15, 0.15);
    k.pop();
  }
}

/** Ruyi medallion (ancient coin with square hole & cloud scroll) on the face facing -Z at distance d, centre height y. */
function ruyi(k, y, d, r) {
  const hi = k.hi;
  const seg = hi ? 24 : 8;
  k.push().translate(0, y, -d).rotateX(Math.PI / 2);
  k.color(GOLD).cyl(0, -0.6, 0, r, r, 1.2, seg);
  if (hi) k.color(FRAME).cyl(0, -0.7, 0, r * 0.86, r * 0.86, 1.35, seg, { caps: false });
  k.color(GLASS_DK).box(0, -0.8, 0, r * 0.56, 1.6, r * 0.56);
  if (hi) {
    // Gold border around the central square hole
    k.color(GOLD_LT);
    for (const s of [-1, 1]) {
      k.box(0, -0.82, s * r * 0.3, r * 0.64, 1.65, 0.45);
      k.box(s * r * 0.3, -0.82, 0, 0.45, 1.65, r * 0.64);
    }
    // Ruyi cloud lobes above & below the coin
    k.color(GOLD);
    for (const sx of [-1, 0, 1]) {
      k.cyl(sx * r * 0.55, -0.5, -r * (sx ? 0.95 : 1.18), r * 0.34, r * 0.34, 1.05, 12);
      k.cyl(sx * r * 0.48, -0.5, r * (sx ? 0.95 : 1.12), r * 0.26, r * 0.26, 0.95, 10);
    }
  }
  k.pop();
}

/** Curled Ruyi / Bamboo-scroll ornament projecting from a module corner. */
function cornerRuyiScroll(k, sx, sz, yTop) {
  const ang = Math.atan2(sz, sx);
  k.push().translate(sx * 21.8, yTop - 3.8, sz * 21.8).rotateY(-ang);
  k.color(FRAME).box(1.2, 0, 0, 2.8, 2.6, 1.4);
  k.color(GOLD).cyl(2.8, 1.3, 0, 1.25, 1.25, 1.5, 10, { caps: true });
  k.color(GOLD_LT).cyl(3.6, 2.1, 0, 0.75, 0.75, 1.55, 8, { caps: true });
  k.color(GLASS_DK).cyl(2.8, 1.3, 0, 0.55, 0.55, 1.6, 8);
  k.pop();
}

export function build(k) {
  const hi = k.hi;
  // pedestal: slight inward taper, with a lit stripe per floor pair
  k.color(GLASS);
  loft(k, 0, 28.5, PED, 24.2);
  if (hi) {
    k.color(FIN);
    for (let y = 8; y < PED - 2; y += 8.4) {
      const f = y / PED, h = 28.5 + (24.2 - 28.5) * f;
      loft(k, y, h + 0.15, y + 0.6, h + 0.12, false);
    }
    // Vertical curtain-wall mullions on pedestal faces
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.color(FIN);
      for (let x = -18; x <= 18; x += 4.5) {
        k.strut([x, 0, -28.55], [x * (24.2 / 28.5), PED, -24.25], 0.18);
      }
      k.pop();
    }
    // North Entrance Wave Canopy & Robert Indiana "LOVE" Sculpture at Xinyi Road plaza (-Z)
    k.color(FRAME).box(0, 6.2, -31.0, 18.0, 0.45, 5.2);
    k.color(GLASS).box(0, 6.65, -31.0, 17.4, 0.2, 4.8);
    for (const x of [-7.5, -2.5, 2.5, 7.5]) k.color(FRAME).cyl(x, 0, -33.0, 0.22, 0.22, 6.2, 6);
    // Red LOVE sculpture at (18, 0, -33)
    const lx = 18, lz = -33;
    k.color(0x888c90).box(lx, 0, lz, 3.2, 0.8, 1.6);
    k.color(0xd82222);
    // L (upper left)
    k.box(lx - 0.7, 2.3, lz, 0.35, 1.5, 0.8).box(lx - 0.35, 2.3, lz, 1.0, 0.35, 0.8);
    // O (tilted upper right)
    k.push().translate(lx + 0.65, 3.05, lz).rotateZ(-0.45);
    k.cyl(0, 0, -0.4, 0.72, 0.72, 0.8, 10);
    k.pop();
    // V (lower left)
    k.strut([lx - 1.05, 2.2, lz], [lx - 0.55, 0.85, lz], 0.34);
    k.strut([lx - 0.05, 2.2, lz], [lx - 0.55, 0.85, lz], 0.34);
    // E (lower right)
    k.box(lx + 0.25, 0.8, lz, 0.32, 1.45, 0.8);
    for (const dy of [0.8, 1.4, 2.0]) k.box(lx + 0.65, dy, lz, 0.95, 0.28, 0.8);
  }
  // ruyi medallions on all four faces of the pedestal top
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    ruyi(k, PED - 10, 25.2, 7.0);
    k.pop();
  }
  // collar between pedestal and first module
  k.color(FRAME);
  loft(k, PED, 23, M0, 23);
  // eight flaring modules
  for (let m = 0; m < 8; m++) {
    const y0 = M0 + m * MOD, y1 = y0 + MOD;
    k.color(m % 2 ? GLASS : GLASS_DK);
    loft(k, y0, 20.5, y1 - 1.6, 24.5);
    // overhanging rim at the module top
    k.color(FRAME);
    loft(k, y1 - 1.6, 24.5, y1 - 0.5, 24.9);
    loft(k, y1 - 0.5, 24.9, y1, 21);
    if (hi) {
      // floor lines (pale mullion bands)
      k.color(FIN);
      for (let j = 1; j < 8; j++) {
        const y = y0 + j * 4.05, f = (y - y0) / (MOD - 1.6), h = 20.5 + 4 * f;
        loft(k, y, h + 0.1, y + 0.45, h + 0.16, false);
      }
      // vertical mullions on module faces
      for (let f = 0; f < 4; f++) {
        k.push().rotateY((f * Math.PI) / 2);
        k.color(FIN);
        for (let x = -15; x <= 15; x += 5) {
          k.strut([x * (20.5 / 24.5), y0, -20.55], [x, y1 - 1.6, -24.55], 0.16);
        }
        k.pop();
      }
      // window glow bands
      k.glow(true).color(BAND);
      for (let j = 0; j < 8; j++) {
        const y = y0 + j * 4.05 + 1.2, f = (y - y0) / (MOD - 1.6), h = 20.5 + 4 * f;
        loft(k, y, h + 0.05, y + 2.0, h + 0.06 + (4 * 2) / MOD, false);
      }
      k.glow(false);
    }
    // lit rim
    k.glow(true).color(RIM);
    loft(k, y1 - 1.4, 24.62, y1 - 0.7, 24.82, false);
    k.glow(false);
    if (hi) {
      // Curled ruyi dragon-cloud corner scrolls at each module's 4 corners
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cornerRuyiScroll(k, sx, sz, y1);
    }
  }
  // top floors (91–101): stepped setbacks
  k.color(GLASS_DK);
  loft(k, TOP, 19, TOP + 16, 18);
  k.color(FRAME);
  loft(k, TOP + 16, 19, TOP + 17.5, 19);
  if (hi) {
    // 660-tonne Golden Tuned Mass Damper (Wind Damper) visible through 88F–91F observation windows
    const dY = TOP + 6.5;
    k.glow(true).color(GOLD_LT).sphere(0, dY, 0, 5.2, 20, 12).glow(false);
    // Horizontal stacked steel plate rings on the damper sphere
    k.color(GOLD);
    for (const dy of [-2.8, -1.4, 0, 1.4, 2.8]) {
      const rr = Math.sqrt(Math.max(0, 5.2 * 5.2 - dy * dy)) + 0.12;
      k.cyl(0, dY + dy - 0.18, 0, rr, rr, 0.36, 20);
    }
    // 8 suspension cables & lower hydraulic bumper ring
    k.color(SPIRE);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.strut([Math.cos(a) * 3.8, dY + 3.2, Math.sin(a) * 3.8], [Math.cos(a) * 5.5, TOP + 16, Math.sin(a) * 5.5], 0.2);
      k.strut([Math.cos(a) * 2.8, dY - 4.5, Math.sin(a) * 2.8], [Math.cos(a) * 5.2, TOP + 0.5, Math.sin(a) * 5.2], 0.28);
    }
    // Glowing observation gallery windows on all 4 faces of 89F-90F so the golden damper gleams through
    k.glow(true).color(GOLD_LT);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.box(0, TOP + 3.5, -18.6, 11.0, 7.0, 0.25);
      k.pop();
    }
    k.glow(false);
    // Floor 91 Outdoor Observatory safety railing fence
    k.color(SPIRE);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.box(0, TOP + 18.8, -18.6, 28, 0.2, 0.2);
      for (let x = -14; x <= 14; x += 2.8) k.cyl(x, TOP + 17.5, -18.6, 0.1, 0.1, 1.5, 4);
      k.pop();
    }
  }
  k.color(GLASS);
  loft(k, TOP + 17.5, 15.5, TOP + 40, 14.5);
  k.color(FRAME);
  loft(k, TOP + 40, 15.5, TOP + 41.5, 15.5);
  k.color(GLASS_DK);
  loft(k, TOP + 41.5, 11.5, TOP + 58, 10.5);
  k.color(FRAME);
  loft(k, TOP + 58, 9.5, ROOF, 7.5);
  k.glow(true).color(RIM);
  loft(k, TOP + 16.2, 19.08, TOP + 17.3, 19.08, false);
  loft(k, TOP + 40.2, 15.58, TOP + 41.3, 15.58, false);
  k.glow(false);
  // pinnacle spire 449 -> 508 m
  const seg = hi ? 16 : 6;
  k.color(SPIRE).lathe(0, ROOF, 0, [[3.4, 0], [3.0, 14], [2.2, 30], [1.4, 45], [0.6, 55], [0.15, 59]], seg);
  if (hi) {
    k.color(FRAME);
    for (const [y, r] of [[ROOF + 8, 3.6], [ROOF + 15, 3.3], [ROOF + 22, 3.0], [ROOF + 29, 2.6], [ROOF + 36, 2.2]]) k.cyl(0, y, 0, r, r, 0.9, seg);
    k.glow(true).color(0xff3020).sphere(0, ROOF + 59.2, 0, 0.45, 8, 4).glow(false);
  }
  k.glow(true).color(0xfff4dc).cyl(0, ROOF + 46, 0, 1.2, 1.0, 2.0, seg);
  k.glow(false);
}
