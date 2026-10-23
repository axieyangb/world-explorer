// feature/famous-landmarks: Salesforce Tower, SF — 1:1 (ground to crown rim 326 m).
// Rounded-square glass tower (~50 m at the base) that tapers and softens toward the top,
// pearl-white horizontal sunshades at every floor and vertical fins, ending in the open
// lattice crown (above ~275 m) whose LED screen glows at night. Faces align with the SoMa grid.

export const lodDist = 2600;
export const glowStrength = 1.9;

const GLASS = 0xa7bccb, GLASS_DK = 0x8ea4b4, FIN = 0xf1efe9, BAND = 0xe9e7e1, LOBBY = 0x5a6670, CORE = 0x6b7177, LED = 0xe8eef6;
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
    // horizontal sunshade bands, one per floor
    k.color(BAND);
    const floors = 60, fh = (TOP - 14) / floors;
    for (let i = 0; i <= floors; i++) {
      const y = 14 + i * fh, h = hwAt(y);
      loft(k, [ring(h, y, N), ring(h + 0.45, y + 0.18, N), ring(h, y + 0.4, N)]);
    }
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
    // lobby fins
    for (let i = 0; i < N; i += 2) {
      const a = ring(hwAt(0) + 0.1, 0, N)[i], b = ring(hwAt(14) + 0.1, 14, N)[i];
      k.strut(a, b, 0.6);
    }
  } else {
    k.color(BAND);
    for (let y = 40; y < TOP; y += 40) loft(k, [ring(hwAt(y), y, N), ring(hwAt(y) + 0.5, y + 1, N), ring(hwAt(y), y + 2, N)]);
  }

  // crown: LED screen inside an open lattice (fins + rings continue the silhouette)
  k.glow(true).color(LED);
  const crownY = PROF.filter(([y]) => y >= TOP);
  loft(k, crownY.filter(([y]) => y <= 315).map(([y, h]) => ring(h * 0.86, y, N)));
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
  } else {
    k.color(FIN);
    loft(k, crownY.map(([y, h]) => ring(h, y, N)));
  }
  k.glow(false);
}
