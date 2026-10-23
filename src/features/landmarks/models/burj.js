// feature/famous-landmarks: Burj Khalifa, Dubai — 1:1 (828 m to the spire tip).
// Y-shaped (tripartite) plan: hexagonal core buttressed by three wings at 120°. The wings step back
// one at a time in an upward spiral (27 setbacks) until only the core remains (~590 m), then the
// glazed spire base and the steel pinnacle. Silver glass with stainless fins; at night the wing
// noses and the pinnacle light up.
import { Kit } from "../kit.js";

const GLASS = 0xa7b6c4, GLASS_DK = 0x8798a9, FIN = 0xd3d9df, STEEL = 0xc4cad0, PODIUM = 0x9aa3ab;

export const lodDist = 2500;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, r: 46, h: 120 },
  { x: 0, z: 0, r: 36, h: 280 },
  { x: 0, z: 0, r: 26, h: 430 },
  { x: 0, z: 0, r: 16, h: 590 },
  { x: 0, z: 0, r: 7, h: 700 },
  { x: 0, z: 0, r: 2.5, h: 828 },
];

const TIER = 21.6;            // floors between setbacks (~5 floors of 4.3 m)
const NT = 27;                // number of wing tiers
const WING_ANG = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]; // wing A faces -Z (front)

/** Wing outline along +X: straight flanks, rounded nose; length L from the centre, width w. */
function wingPts(L, w, n) {
  const r = w / 2, pts = [[0, -r]];
  const cx = Math.max(r, L - r);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([cx + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([0, r]);
  return pts;
}
const rot = (pts, a) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, z]) => [x * c - z * s, x * s + z * c]); };

// wing lengths per tier: the shortening wing cycles A -> B -> C (spiral)
function wingPlan() {
  const L = [58, 58, 58];
  const out = [];
  for (let i = 0; i < NT; i++) {
    out.push(L.slice());
    const w = i % 3;
    const t = i / NT;
    L[w] -= 3.2 + 4.2 * t; // setbacks grow toward the top
  }
  return out;
}
const PLAN = wingPlan();

export function build(k) {
  const hi = k.hi;
  const nose = hi ? 6 : 3;
  // podium / entrance base
  k.color(PODIUM).extrude(Kit.ngon(6, 52, Math.PI / 6), 0, hi ? 8 : 6);

  for (let i = 0; i < NT; i++) {
    const y0 = i * TIER, h = TIER;
    const t = y0 / (NT * TIER);
    const w = 30 - 10 * t;               // wing width tapers slightly
    const core = 17 - 5 * t;
    k.color(i % 2 ? GLASS : GLASS_DK);
    k.extrude(Kit.ngon(6, core, 0), y0, h);
    for (let a = 0; a < 3; a++) {
      const L = PLAN[i][a];
      if (L < core + 2) continue;
      const pts = rot(wingPts(L, Math.min(w, L * 0.9), nose), WING_ANG[a]);
      k.color(i % 2 ? GLASS : GLASS_DK).extrude(pts, y0, h);
      // mechanical band/parapet at each setback roof
      if (hi) k.color(FIN).extrude(rot(wingPts(L + 0.3, Math.min(w, L * 0.9) + 0.6, nose), WING_ANG[a]), y0 + h - 1.2, 1.2);
      if (hi) {
        // stainless vertical fins on the flanks
        const c = Math.cos(WING_ANG[a]), s = Math.sin(WING_ANG[a]);
        k.color(FIN);
        for (let f = 1; f <= 3; f++) {
          const d = core + ((L - w / 2 - core) * f) / 4;
          if (d < core + 1) continue;
          for (const side of [-1, 1]) {
            const px = d * c - side * (w / 2 + 0.25) * s, pz = d * s + side * (w / 2 + 0.25) * c;
            k.box(px, y0, pz, 0.7, h - 1.2, 0.7);
          }
        }
        // lit nose strip
        k.glow(true).color(0xdfe9ff);
        const nx = (L + 0.25) * c, nz = (L + 0.25) * s;
        k.box(nx, y0, nz, 0.9, h - 1.2, 0.9);
        k.glow(false);
      }
    }
  }
  // crown: core cluster above the last setback
  const yTop = NT * TIER; // 583.2
  k.color(GLASS).lathe(0, yTop, 0, [[12, 0], [11, 14], [10.2, 30]], hi ? 12 : 6, { smooth: false });
  k.color(FIN).lathe(0, yTop + 30, 0, [[10.6, 0], [10.6, 1.5]], hi ? 12 : 6);
  // glazed spire base with fins
  k.color(GLASS_DK).lathe(0, yTop + 31.5, 0, [[9.6, 0], [7.5, 45], [4.6, 95]], hi ? 12 : 6, { smooth: false });
  if (hi) {
    k.color(FIN);
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2 + Math.PI / 6;
      k.strut([Math.cos(a) * 10.2, yTop + 31.5, Math.sin(a) * 10.2], [Math.cos(a) * 5.0, yTop + 126.5, Math.sin(a) * 5.0], 0.9);
    }
  }
  // steel pinnacle (710 -> 828 m)
  const yP = yTop + 126.5;
  k.color(STEEL).lathe(0, yP, 0, [[4.4, 0], [3.0, 50], [1.6, 95], [0.35, 828 - yP]], hi ? 10 : 5);
  if (hi) {
    k.color(FIN);
    for (let r = 0; r < 6; r++) k.lathe(0, yP + 8 + r * 15, 0, [[4.4 - r * 0.25, 0], [4.4 - r * 0.25, 0.8]], 10);
  }
  k.glow(true).color(0xff4a3a).sphere(0, 822, 0, hi ? 1.0 : 2.0, 6, 4);
  k.color(0xeaf2ff).lathe(0, yP - 4, 0, [[5.0, 0], [5.0, 2.5]], hi ? 10 : 5);
  k.glow(false);
}
