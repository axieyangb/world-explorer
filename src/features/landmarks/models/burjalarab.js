// feature/famous-landmarks: Burj Al Arab, Dubai — 1:1 (mast tip 321 m).
// V-shaped plan: two guest-room wings fan out from the concrete mast (sea side, +Z) and are closed at
// the front (-Z, toward the beach) by the white double-skin fabric sail stretched over the atrium.
// The plan shrinks with height along a spinnaker curve until the wings meet the mast at ~205 m;
// white steel exoskeleton trusses (leading-edge arches + giant X braces) on the wing faces, the
// Al Muntaha restaurant across the mast top, the round helipad cantilevered off the wing, and the
// mast spire above. At night the sail is washed in slowly changing colours.
const FABRIC = 0xf6f5f0, FABRIC_RIB = 0xdedcd4, WING = 0x7f9cb2, WING_DK = 0x5f7d93, GRID = 0xe9ecee;
const STEEL = 0xf2f2ef, MAST = 0xd9d8d1, MAST_DK = 0xb9b8b1, BASE = 0xcfcac0, PAD = 0x5b6168, PAD_MK = 0xf0f0f0;
const POOL = 0x1b8fb8, SAND = 0xe8d9b8, GOLD = 0xdfb438;

export const lodDist = 2000;
export const glowStrength = 1.0;

const ZM = 54;      // mast line (local +Z)
const D0 = 108;     // ground-level depth from the mast to the sail bulge
const HT = 205;     // wings meet the mast
const TIP = 0.861;  // wing tip depth as a fraction of the bulge depth
const SPAN = 39;    // ground-level wing tip half span

const depth = (y) => {
  const t = Math.min(1, y / HT);
  return D0 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.7);
};

export const colliders = [
  { x: 0, z: 0, hw: 32, hd: 48, h: 90 },
  { x: 0, z: 16, hw: 22, hd: 36, h: 160 },
  { x: 0, z: 40, hw: 12, hd: 16, h: HT },
  { x: 0, z: ZM, hw: 6, hd: 6, h: 300 },
];

/** Plan ring at height y: mast, right tip, sail curve (n points), left tip. */
function plan(y, n) {
  const D = depth(y), hs = SPAN * D / D0, zt = ZM - TIP * D, zb = ZM - D;
  const pts = [[0, ZM], [hs, zt]];
  for (let i = 1; i < n; i++) {
    const s = 1 - (2 * i) / n; // +1 right tip .. -1 left tip
    pts.push([hs * s, zt + (zb - zt) * (1 - s * s)]);
  }
  pts.push([-hs, zt]);
  return pts;
}

export function setup({ mats }) {
  return {
    update(dt, t, night) {
      if (night <= 0) return;
      mats.glow.emissive.setHSL((0.55 + t * 0.012) % 1, 0.8, 0.42);
    },
  };
}

export function build(k) {
  const hi = k.hi;
  const n = hi ? 16 : 4;
  const ys = [];
  const step = hi ? 5.5 : 26;
  for (let y = 0; y < HT - 0.01; y += step) ys.push(y);
  ys.push(HT);
  // Man-made triangular island podium + rock-armour tetrapod breakwater + Burj Al Arab Terrace infinity pool deck (+Z seaward)
  k.color(BASE).extrude(plan(0, n).map(([x, z]) => [x * 1.18, ZM + (z - ZM) * 1.12]), -2, 8);
  if (hi) {
    // Seaward Burj Al Arab Terrace fan-shaped luxury deck (+Z = 56 .. 118) with twin turquoise infinity pools & beach cabanas
    const terrPts = [[-28, ZM], [28, ZM], [42, ZM + 42], [18, ZM + 64], [-18, ZM + 64], [-42, ZM + 42]];
    k.color(SAND).extrude(terrPts, 0, 3.8);
    k.color(POOL).cyl(0, 3.85, ZM + 26, 16, 16, 0.3, 20).cyl(0, 3.85, ZM + 48, 12, 12, 0.3, 20);
    // Shoreward curved vehicular causeway bridge (-Z = -60 .. -96) with water fountain jets at hotel drop-off
    k.color(BASE).box(0, 2.0, -76, 14, 2.2, 36);
    k.glow(true).color(0xffe8a8).torus(0, 6.2, -52, 8.5, 0.45, 20, 6).glow(false);
    // Perimeter wave-dissipating concrete armour blocks around island rim
    k.color(0x9a948a);
    for (let i = -6; i <= 6; i++) {
      k.box(i * 7.2, 0.5, -58 + Math.abs(i) * 2.2, 3.2, 2.2, 3.2);
    }
  }
  const rings = ys.map((y) => plan(y, n));
  for (let i = 0; i < ys.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], y0 = ys[i], y1 = ys[i + 1];
    const m = A.length;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const a0 = [A[j][0], y0, A[j][1]], b0 = [A[j2][0], y0, A[j2][1]];
      const a1 = [B[j][0], y1, B[j][1]], b1 = [B[j2][0], y1, B[j2][1]];
      const sail = j >= 1 && j < m - 1;
      if (sail) {
        k.glow(true).color(hi && i % 2 ? FABRIC_RIB : FABRIC);
        k.quad(a0, b0, b1, a1);
        k.glow(false);
      } else {
        k.color(i % 3 === 2 ? GRID : (i % 2 ? WING : WING_DK));
        k.quad(a0, b0, b1, a1);
      }
    }
    // Prominent horizontal arched fiberglass sail ribs bow across the teflon atrium screen
    if (hi && i > 0 && i < ys.length - 1) {
      k.color(STEEL);
      for (let j = 1; j < m - 1; j++) {
        const p0 = [A[j][0], y0, A[j][1] - 0.35], p1 = [A[j + 1][0], y0, A[j + 1][1] - 0.35];
        k.strut(p0, p1, 0.42);
      }
    }
  }
  // wing room-floor lines (white grid) & vertical duplex bay mullions on both outer faces
  if (hi) {
    k.color(GRID);
    for (let y = 9; y < HT - 6; y += 6.2) {
      const D = depth(y), hs = SPAN * D / D0, zt = ZM - TIP * D;
      for (const sx of [-1, 1]) {
        const ox = sx * 0.25;
        k.strut([ox, y, ZM - 0.4], [sx * hs + ox, y, zt], 0.5);
      }
    }
    // Vertical curtain-wall mullions along both guest-room wings
    for (let u = 0.15; u <= 0.85; u += 0.14) {
      for (const sx of [-1, 1]) {
        const pBot = [sx * SPAN * u, 6, ZM - TIP * D0 * u];
        const yTop = HT * (1 - u * 0.45), dTop = depth(yTop);
        const pTop = [sx * (SPAN * dTop / D0) * u, yTop, ZM - TIP * dTop * u];
        k.strut(pBot, pTop, 0.35);
      }
    }
  }
  // roof over the meeting point
  k.color(MAST).extrude(plan(HT, n), HT, 0.6);
  // exoskeleton: leading-edge arch along each wing tip + giant X braces between tip and mast lines
  const T = (sx, y) => {
    const D = depth(y);
    return [sx * (SPAN * D / D0 + 1.6), y, ZM - TIP * D];
  };
  const Mst = (sx, y) => [sx * 2.5, y, ZM + 1.5];
  k.color(STEEL);
  const ar = hi ? 1.45 : 2.2, aseg = hi ? 10 : 4;
  const tipYs = [];
  for (let y = 0; y <= HT; y += hi ? 8 : 41) tipYs.push(Math.min(y, HT));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < tipYs.length - 1; i++) k.pipe(T(sx, tipYs[i]), T(sx, tipYs[i + 1]), ar, aseg);
    // X braces: three tiers + circular pinned gusset nodes at intersections
    const lv = [0, 62, 124, 186];
    for (let i = 0; i < 3; i++) {
      const ya = lv[i], yb = lv[i + 1];
      const ta = T(sx, ya), tb = T(sx, yb), ma = Mst(sx, ya), mb = Mst(sx, yb);
      const off = (p) => [p[0] + sx * 1.2, p[1], p[2]];
      k.pipe(off(ta), off(mb), ar * 0.8, aseg);
      k.pipe(off(ma), off(tb), ar * 0.8, aseg);
      k.pipe(off(tb), off(mb), ar * 0.6, aseg);
      if (hi) {
        // Center X-node pin hub
        const xm = (ta[0] + tb[0] + ma[0] + mb[0]) * 0.25 + sx * 1.2;
        const ym = (ya + yb) * 0.5;
        const zm = (ta[2] + tb[2] + ma[2] + mb[2]) * 0.25;
        k.sphere(xm, ym, zm, 1.7, 10, 6);
      }
    }
  }
  // mast: tapered concrete core with banding, lattice spire to 321 m
  k.color(MAST).taper(0, 0, ZM + 3, 12, 9, 7, 6, HT + 24);
  if (hi) {
    // Seaward (+Z) panoramic express glass elevator shaft & gold-accented lobby crown
    k.glow(true).color(0xffeab0).box(0, 6, ZM + 7.6, 3.2, HT - 18, 0.8).glow(false);
    k.color(MAST_DK);
    for (let y = 20; y < HT + 20; y += 16) {
      const f = y / (HT + 24);
      k.box(0, y, ZM + 3, 12 - 5 * f + 0.5, 0.9, 9 - 3 * f + 0.5);
    }
  }
  k.color(MAST).lathe(0, HT + 24, ZM + 3, [[3.2, 0], [2.6, 30], [1.6, 60], [0.9, 80], [0.25, 92]], hi ? 14 : 5);
  if (hi) {
    k.color(STEEL);
    for (let y = HT + 30; y < HT + 84; y += 7) {
      const r = 3.0 - ((y - HT - 24) / 92) * 2.6;
      k.cyl(0, y, ZM + 3, r + 0.45, r + 0.45, 0.6, 12, { caps: false });
    }
  }
  k.glow(true).color(0xff4030).sphere(0, HT + 116.5, ZM + 3, 0.6, 8, 5).glow(false);
  // Al Muntaha: long tapered sky-restaurant pod across the mast top (27 m either side at 200 m)
  k.color(STEEL).taper(0, HT - 10, ZM + 2, 58, 11, 52, 9, 7.5);
  k.glow(true).color(0xd8ecff).box(0, HT - 7.8, ZM + 2, 56.4, 3.0, 11.4).glow(false);
  if (hi) {
    // Window mullions & diagonal support struts under the Al Muntaha pod
    k.color(STEEL);
    for (let x = -24; x <= 24; x += 6) k.box(x, HT - 7.8, ZM + 2, 0.35, 3.0, 11.6);
    for (const sx of [-1, 1]) {
      k.strut([sx * 3, HT - 32, ZM + 2], [sx * 25, HT - 10, ZM + 2], 1.4);
      k.strut([sx * 3, HT - 24, ZM + 2], [sx * 16, HT - 10, ZM + 2], 1.1);
    }
  }
  // helipad cantilevered out from the -Z sail crown at 212 m
  const hy = HT - 4, hx = -26, hz = ZM - 12;
  k.color(STEEL).cyl(hx, hy, hz, 12, 12, 1.6, hi ? 28 : 10);
  k.color(PAD).cyl(hx, hy + 1.6, hz, 11, 11, 0.12, hi ? 28 : 10);
  if (hi) {
    // White aiming circle, H marking & perimeter safety net ring around helipad
    k.color(PAD_MK).torus(hx, hy + 1.74, hz, 8.2, 0.22, 24, 6);
    k.box(hx - 2.4, hy + 1.75, hz, 0.9, 0.05, 6.2).box(hx + 2.4, hy + 1.75, hz, 0.9, 0.05, 6.2).box(hx, hy + 1.75, hz, 4.8, 0.05, 0.9);
    k.color(STEEL).torus(hx, hy + 1.5, hz, 13.0, 0.16, 24, 6);
    k.strut([hx + 6, hy, hz], [-3, hy - 30, ZM - 2], 1.2).strut([hx, hy, hz + 6], [-2, hy - 26, ZM + 1], 1.0);
  }
}
