// feature/famous-landmarks: Burj Khalifa, Dubai — 1:1 (828 m to the spire tip).
// Y-shaped (tripartite) plan: hexagonal core buttressed by three wings at 120°. The wings step back
// one at a time in an upward spiral (27 setbacks) until only the core remains (~590 m), then the
// glazed spire base and the steel pinnacle. Silver glass with stainless fins; at night the wing
// noses and the pinnacle light up.
import { Kit } from "../kit.js";

const GLASS = 0xc3cfda, GLASS_DK = 0xaab8c6, FIN = 0xd3d9df, STEEL = 0xc4cad0, PODIUM = 0x9aa3ab;

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
  const nose = hi ? 10 : 3;
  // podium / entrance base
  k.color(PODIUM).extrude(Kit.ngon(6, 52, Math.PI / 6), 0, hi ? 8 : 6);
  if (hi) {
    // Hymenocallis (spider-lily) 3-petal glass entrance pavilions & terraced Burj Lake steps
    k.color(0xb4bcc4).extrude(Kit.ngon(6, 58, Math.PI / 6), 0, 2.2);
    k.color(0xc8d0d8).extrude(Kit.ngon(6, 55, Math.PI / 6), 2.2, 2.0);
    for (let a = 0; a < 3; a++) {
      const ang = WING_ANG[a] + Math.PI / 3; // between the 3 main wings
      const c = Math.cos(ang), s = Math.sin(ang);
      const petal = rot(wingPts(56, 22, 8), ang);
      k.color(GLASS_DK).extrude(petal, 0, 5.8);
      k.color(FIN).extrude(rot(wingPts(57, 23, 8), ang), 5.8, 0.7);
      // spider-lily radial roof ribs & glowing entrance lobby
      k.glow(true).color(0xdfe9ff).box(c * 46, 0.4, s * 46, 8, 4.8, 8);
      k.glow(false).color(FIN);
      for (const off of [-6, 0, 6]) {
        k.strut([c * 20 - s * off, 6.5, s * 20 + c * off], [c * 54 - s * (off * 0.4), 6.5, s * 54 + c * (off * 0.4)], 0.35);
      }
    }
    // Burj Lake turquoise water reflection basins & palm-lined promenade piers
    k.color(0x287892);
    for (let a = 0; a < 3; a++) {
      const ang = WING_ANG[a], c = Math.cos(ang), s = Math.sin(ang);
      k.cyl(c * 60, 0, s * 60, 14, 14, 0.35, 12);
      k.color(0xd8d2c5).cyl(c * 60, 0, s * 60, 14.8, 14.8, 0.5, 12, { caps: false });
      k.color(0x287892);
    }
  }

  for (let i = 0; i < NT; i++) {
    const y0 = i * TIER, h = TIER;
    const t = y0 / (NT * TIER);
    const w = 30 - 10 * t;               // wing width tapers slightly
    const core = 17 - 5 * t;
    k.color(GLASS);
    k.extrude(Kit.ngon(6, core, 0), y0, h);
    if (hi && i % 4 === 3) {
      // Dark double-height mechanical louver band & stainless bullnose ring every 4th tier
      k.color(0x525e6a).extrude(Kit.ngon(6, core + 0.25, 0), y0 + h - 3.6, 2.4);
    }
    for (let a = 0; a < 3; a++) {
      const L = PLAN[i][a];
      if (L < core + 2) continue;
      const ww = Math.min(w, L * 0.9);
      const pts = rot(wingPts(L, ww, nose), WING_ANG[a]);
      k.color(GLASS).extrude(pts, y0, h);
      // mechanical band/parapet at each setback roof
      if (hi) {
        k.color(FIN).extrude(rot(wingPts(L + 0.3, ww + 0.6, nose), WING_ANG[a]), y0 + h - 1.2, 1.2);
        // Setback terrace skylight / beacon at wing step-down
        if (i < NT - 1 && PLAN[i + 1][a] < L - 1) {
          const c = Math.cos(WING_ANG[a]), s = Math.sin(WING_ANG[a]);
          const rNose = ww / 2, cxNose = Math.max(rNose, L - rNose);
          k.glow(true).color(0xdfe9ff).cyl(cxNose * c, y0 + h, cxNose * s, rNose * 0.55, rNose * 0.55, 0.6, 8);
          k.glow(false);
        }
        // Dark mechanical louver band every 4th tier
        if (i % 4 === 3) {
          k.color(0x525e6a).extrude(rot(wingPts(L + 0.18, ww + 0.3, nose), WING_ANG[a]), y0 + h - 3.6, 2.2);
          k.color(FIN).extrude(rot(wingPts(L + 0.28, ww + 0.45, nose), WING_ANG[a]), y0 + h - 3.9, 0.35);
        }
      }
      if (hi) {
        // stainless vertical fins on the flanks
        const c = Math.cos(WING_ANG[a]), s = Math.sin(WING_ANG[a]);
        k.glow(true).color(0xaeb6c0);   // fins carry the facade lighting at night
        for (let f = 1; f <= 3; f++) {
          const d = core + ((L - w / 2 - core) * f) / 4;
          if (d < core + 1) continue;
          for (const side of [-1, 1]) {
            const px = d * c - side * (w / 2 + 0.25) * s, pz = d * s + side * (w / 2 + 0.25) * c;
            k.box(px, y0, pz, 0.7, h - 1.2, 0.7);
          }
        }
        // lit nose strip
        k.color(0xdfe9ff);
        const nx = (L + 0.25) * c, nz = (L + 0.25) * s;
        k.box(nx, y0, nz, 0.9, h - 1.2, 0.9);
        k.glow(false);
        // [lm-materials] the dense stainless fin rhythm: a fin every 3.2 m along both flanks and round the nose
        if (!k.fine) continue;
        k.color(FIN);
        const r = ww / 2, cx = Math.max(r, L - r);
        for (let d = core + 1.6; d < cx; d += 3.2) {
          for (const side of [-1, 1]) {
            k.push().translate(d * c - side * (r + 0.3) * s, y0, d * s + side * (r + 0.3) * c).rotateY(-WING_ANG[a]);
            k.box(0, 0, 0, 0.32, h - 1.2, 0.6);
            k.pop();
          }
        }
        for (let q = 1; q < 6; q++) {
          const an = -Math.PI / 2 + (q / 6) * Math.PI, fx = cx + Math.cos(an) * (r + 0.3), fz = Math.sin(an) * (r + 0.3);
          k.push().translate(fx * c - fz * s, y0, fx * s + fz * c).rotateY(-WING_ANG[a] - an);
          k.box(0, 0, 0, 0.6, h - 1.2, 0.32);
          k.pop();
        }
      }
    }
  }
  // Observation decks: Level 124 ("At the Top", y ≈ 452 m) and Level 148 ("At the Top SKY", y ≈ 555 m)
  if (hi) {
    for (const [yObs, rObs, wIdx] of [[452, 16.5, 1], [555, 13.8, 2]]) {
      const ang = WING_ANG[wIdx], c = Math.cos(ang), s = Math.sin(ang);
      const deckPts = rot(wingPts(rObs + 9, 13, 8), ang);
      k.color(FIN).extrude(deckPts, yObs, 1.0);
      k.glow(true).color(0xfff0c8).extrude(rot(wingPts(rObs + 8.6, 12.2, 8), ang), yObs + 1.0, 3.2);
      k.glow(false).color(STEEL).extrude(rot(wingPts(rObs + 9.2, 13.4, 8), ang), yObs + 4.2, 0.6);
      // Glass observation parapet & steel posts around outdoor terrace
      for (let q = -3; q <= 3; q++) {
        const a = ang + (q / 3) * (Math.PI / 2.2);
        k.color(FIN).box(Math.cos(a) * (rObs + 6.5), yObs + 1.0, Math.sin(a) * (rObs + 6.5), 0.25, 2.2, 0.25);
      }
      // Core warm-lit observation band
      k.glow(true).color(0xffeab8).extrude(Kit.ngon(6, rObs - 2.2, 0), yObs + 0.8, 3.0);
      k.glow(false);
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
    // Horizontal bullnose collar rings along glazed spire base
    for (let r = 1; r <= 5; r++) {
      const yr = yTop + 31.5 + r * 16, rr = 9.6 - (r / 6) * 4.8;
      k.lathe(0, yr, 0, [[rr + 0.35, 0], [rr + 0.35, 0.7]], 12, { smooth: false });
    }
  }
  // steel pinnacle (710 -> 828 m)
  const yP = yTop + 126.5;
  k.color(STEEL).lathe(0, yP, 0, [[4.4, 0], [3.0, 50], [1.6, 95], [0.35, 828 - yP]], hi ? 10 : 5);
  if (hi) {
    k.color(FIN);
    for (let r = 0; r < 6; r++) k.lathe(0, yP + 8 + r * 15, 0, [[4.4 - r * 0.25, 0], [4.4 - r * 0.25, 0.8]], 10);
    // Upper communication whip rings & white xenon strobe beacons
    k.glow(true).color(0xffffff);
    for (const ys of [745, 780, 808]) k.sphere(0, ys, 0, 0.65, 6, 4);
    k.glow(false);
  }
  k.glow(true).color(0xff4a3a).sphere(0, 822, 0, hi ? 1.0 : 2.0, 6, 4);
  k.color(0xeaf2ff).lathe(0, yP - 4, 0, [[5.0, 0], [5.0, 2.5]], hi ? 10 : 5);
  k.glow(false);
}
