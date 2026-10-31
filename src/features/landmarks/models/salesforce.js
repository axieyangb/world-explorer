// feature/famous-landmarks: Salesforce Tower, SF — 1:1 (ground to crown rim 326 m).
// Rounded-square glass tower (~50 m at the base) that tapers and softens toward the top,
// pearl-white horizontal sunshades at every floor and vertical fins, 5-story glazed lobby with
// Mission St entrance canopy & 4th-floor pedestrian skybridge to Salesforce Park, ending in the
// open lattice crown (above ~275 m) whose Jim Campbell "Day for Night" LED screen glows at night.

export const lodDist = 2600;
export const glowStrength = 1.9;

const GLASS = 0xa7bccb, GLASS_DK = 0x8ea4b4, FIN = 0xf1efe9, BAND = 0xe9e7e1, LOBBY = 0x5a6670, CORE = 0x6b7177, LED = 0xe8eef6;
const LED_BLUE = 0x8cb8f2, LED_PINK = 0xe8b8d8;
const EXP = 3.3;          // superellipse exponent (rounded square)
const TOP = 275;          // top of the enclosed tower
// half-width profile [y, hw]
const PROF = [[0, 25], [60, 24.6], [120, 24.0], [180, 23.0], [230, 21.8], [275, 20.4], [290, 19.6], [305, 18.1], [315, 16.4], [322, 14.3], [326, 12.4]];
const hwAt = (y) => {
  for (let i = 0; i < PROF.length - 1; i++) {
    const [y0, h0] = PROF[i], [y1, h1] = PROF[i + 1];
    if (y <= y1) return h0 + ((y - y0) / (y1 - y0)) * (h1 - h0);
  }
  return PROF[PROF.length - 1][1];
};

export const colliders = [
  { x: 0, z: 0, hw: 24.5, hd: 24.5, h: 120 },
  { x: 0, z: 0, hw: 23, hd: 23, h: 230 },
  { x: 0, z: 0, hw: 20.5, hd: 20.5, h: 300 },
  { x: 0, z: 0, hw: 16, hd: 16, h: 326 },
];

function ring(hw, y, N) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / EXP), y, hw * Math.sign(s) * Math.pow(Math.abs(s), 2 / EXP)]);
  }
  return pts;
}

/** Smooth-shaded loft between consecutive rings (same N, theta increasing). */
function loft(k, rings) {
  const N = rings[0].length;
  const nrm = (R, i) => {
    const a = R[(i + N - 1) % N], b = R[(i + 1) % N];
    const tx = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(tx, tz) || 1;
    return [tz / l, 0, -tx / l];
  };
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const na = nrm(A, i), nb = nrm(A, j);
      k._emit(A[i], B[i], A[j], na, na, nb);
      k._emit(A[j], B[i], B[j], nb, na, nb);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  const N = hi ? 56 : 20;

  // enclosed glass body
  const levels = PROF.filter(([y]) => y <= TOP);
  k.glow(true).color(LOBBY);
  loft(k, [ring(hwAt(0) - 1.2, 0, N), ring(hwAt(14) - 1.2, 14, N)]);  // recessed lobby
  k.glow(false).color(GLASS);
  loft(k, [ring(hwAt(14), 14, N), ...levels.filter(([y]) => y > 14).map(([y, h]) => ring(h, y, N))]);
  k.color(CORE).extrude(ring(hwAt(TOP) - 0.5, 0, N).map(([x, , z]) => [x, z]), TOP - 0.5, 0.6); // roof slab
  k.color(CORE).extrude(ring(hwAt(TOP) * 0.62, 0, N).map(([x, , z]) => [x, z]), TOP, 12);      // mechanical core

  if (hi) {
    // horizontal sunshade bands, one per floor (61 floors up to Ohana Floor)
    k.color(BAND);
    const floors = 60, fh = (TOP - 14) / floors;
    for (let i = 0; i <= floors; i++) {
      const y = 14 + i * fh, h = hwAt(y);
      loft(k, [ring(h, y, N), ring(h + 0.45, y + 0.18, N), ring(h, y + 0.4, N)]);
    }
    // Warm-lit double-height 61st Floor "Ohana Floor" observation lounge band just below the crown (y = 266..274 m)
    k.glow(true).color(0xffeed4);
    loft(k, [ring(hwAt(266) + 0.05, 266, N), ring(hwAt(273) + 0.05, 273, N)]);
    k.glow(false);
    // vertical fins following the taper
    k.color(FIN);
    const ys = levels.map(([y]) => y).filter((y) => y >= 14);
    ys.unshift(14);
    for (let i = 0; i < N; i += 1) {
      for (let s = 0; s < ys.length - 1; s++) {
        const a = ring(hwAt(ys[s]) + 0.3, ys[s], N)[i], b = ring(hwAt(ys[s + 1]) + 0.3, ys[s + 1], N)[i];
        k.strut(a, b, 0.32);
      }
    }
    // lobby fins & horizontal glass transoms
    for (let i = 0; i < N; i += 2) {
      const a = ring(hwAt(0) + 0.1, 0, N)[i], b = ring(hwAt(14) + 0.1, 14, N)[i];
      k.strut(a, b, 0.6);
    }
    for (const ly of [4.6, 9.2, 13.8]) {
      loft(k, [ring(hwAt(ly) - 0.9, ly, N), ring(hwAt(ly) - 0.9, ly + 0.25, N)]);
    }
    // Mission Street Cantilevered Glass Entrance Canopy (-Z front) & Plaza Planter Benches
    k.color(FIN).box(0, 6.2, -27.5, 22, 0.45, 6.2);
    k.color(GLASS).box(0, 6.65, -27.5, 21.2, 0.2, 5.6);
    // Elevated Pedestrian Skybridge at Floor 5 (y = 21 m, +Z south face) linking to Salesforce Park
    k.color(FIN).box(0, 20.5, 31.0, 6.4, 0.65, 14.0).box(0, 24.8, 31.0, 6.4, 0.5, 14.0);
    k.glow(true).color(GLASS_DK).box(0, 21.15, 31.0, 5.8, 3.65, 13.6).glow(false);
    for (let bz = 25; bz <= 37; bz += 3) {
      k.color(FIN).strut([-3.1, 20.8, bz], [-3.1, 24.8, bz + 1.5], 0.18);
      k.strut([3.1, 20.8, bz], [3.1, 24.8, bz + 1.5], 0.18);
    }
  } else {
    k.color(BAND);
    for (let y = 40; y < TOP; y += 40) loft(k, [ring(hwAt(y), y, N), ring(hwAt(y) + 0.5, y + 1, N), ring(hwAt(y), y + 2, N)]);
  }

  // crown: Jim Campbell "Day for Night" multi-band LED screen inside an open lattice (fins + rings + internal trusses)
  k.glow(true);
  const crownY = PROF.filter(([y]) => y >= TOP);
  if (hi) {
    k.color(LED_BLUE);
    loft(k, [ring(hwAt(275) * 0.86, 275, N), ring(hwAt(292) * 0.86, 292, N)]);
    k.color(LED);
    loft(k, [ring(hwAt(292) * 0.86, 292, N), ring(hwAt(305) * 0.86, 305, N)]);
    k.color(LED_PINK);
    loft(k, [ring(hwAt(305) * 0.86, 305, N), ring(hwAt(316) * 0.86, 316, N)]);
  } else {
    k.color(LED);
    loft(k, crownY.filter(([y]) => y <= 315).map(([y, h]) => ring(h * 0.86, y, N)));
  }
  if (hi) {
    k.color(FIN);
    for (let y = TOP + 3; y <= 326.01; y += 3.4) {
      const yy = Math.min(y, 325.6), h = hwAt(yy);
      loft(k, [ring(h, yy, N), ring(h + 0.4, yy + 0.2, N), ring(h, yy + 0.4, N)]);
    }
    for (let i = 0; i < N; i++) {
      for (let s = 0; s < crownY.length - 1; s++) {
        const a = ring(crownY[s][1] + 0.15, crownY[s][0], N)[i], b = ring(crownY[s + 1][1] + 0.15, crownY[s + 1][0], N)[i];
        k.strut(a, b, 0.42);
      }
    }
    // Internal horizontal structural wind-bracing catwalk rings inside the open crown
    k.glow(false).color(CORE);
    for (const cy of [290, 305, 318]) {
      const rIn = ring(hwAt(cy) * 0.92, cy, 16);
      for (let i = 0; i < 16; i++) k.strut(rIn[i], rIn[(i + 1) % 16], 0.45);
    }
  } else {
    k.color(FIN);
    loft(k, crownY.map(([y, h]) => ring(h, y, N)));
  }
  k.glow(false);
}
