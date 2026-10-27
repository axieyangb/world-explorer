// feature/famous-landmarks: The Shard, London — 1:1 (309.6 m).
// Irregular glass pyramid: eight inclined facets ("shards") rising from a ~58 m irregular base toward a common
// apex. The facets never meet: dark fracture slots run up the corners, and above ~245 m the core stops and
// the glass blades splay apart at different heights around the open spire. Storey bands glow at night,
// the spire top white. Local: orientation along the OSM footprint's long axis (heading 128.1).
const GLASS = 0x9fb7c9, GLASS_LT = 0xb9cddb, CORE = 0x39434d, BAND = 0xc2ccd0, TIP = 0xf4f7ff, STEEL = 0x7d8790;
const TAU = Math.PI * 2;
const APEX = 322;                                         // virtual apex the facets lean toward
const ANG = [0, 42, 95, 138, 180, 226, 274, 318], RAD = [29, 27.5, 26, 30, 28, 27, 25, 29.5];
const TOPS = [306, 288, 297, 279, 301, 285, 293, 272];    // where each glass blade ends
const CORE_TOP = 246;
const B = ANG.map((a, i) => [Math.cos((a * Math.PI) / 180) * RAD[i], Math.sin((a * Math.PI) / 180) * RAD[i]]);
const s = (y) => 1 - y / APEX;                            // plan scale at height y

export const lodDist = 2400;
export const glowStrength = 1.3;
export const colliders = [
  { x: 0, z: 0, r: 26, h: 60 },
  { x: 0, z: 0, r: 20, h: 110 },
  { x: 0, z: 0, r: 13, h: 180 },
  { x: 0, z: 0, r: 7, h: 260 },
];

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function build(k) {
  const hi = k.hi;
  // dark core (shows through the corner fractures and between the splayed blades)
  const coreRing = B.map(([x, z]) => [x * 0.955, z * 0.955]);
  for (let i = 0; i < 8; i++) {
    const a = coreRing[i], b = coreRing[(i + 1) % 8], y1 = CORE_TOP, f = s(y1);
    k.color(CORE).quad([a[0], 0, a[1]], [a[0] * f, y1, a[1] * f], [b[0] * f, y1, b[1] * f], [b[0], 0, b[1]]);
  }
  k.color(CORE).extrude(coreRing.map(([x, z]) => [x * s(CORE_TOP), z * s(CORE_TOP)]), CORE_TOP, 0.4);
  // glass facets: each an inclined plate inset from the corners (the fractures), with its own top
  for (let i = 0; i < 8; i++) {
    const a = B[i], b = B[(i + 1) % 8], top = TOPS[i];
    const a0 = lerp(a, b, 0.035), b0 = lerp(a, b, 0.965);
    const ft = s(top) * 2.4; // blades splay outward above the core: the open crown
    const P = (p, y, f) => [p[0] * f, y, p[1] * f];
    // the upper blades narrow a little more so they read as separate shards
    const at = lerp(a0, b0, top > CORE_TOP ? 0.12 : 0), bt = lerp(a0, b0, top > CORE_TOP ? 0.88 : 1);
    k.color(i % 2 ? GLASS : GLASS_LT);
    k.quad2(P(a0, 0, 1), P(b0, 0, 1), P(bt, top, ft), P(at, top, ft));
    if (hi) {
      // storey bands (lit at night) every 4.2 m on the facet, up to the core top
      k.glow(true).color(BAND);
      for (let y = 4.2; y < Math.min(top, CORE_TOP) - 2; y += 4.2) {
        const t = y / top, f = 1 + (ft - 1) * t; // on the facet plane
        const l = lerp(a0, at, t), r = lerp(b0, bt, t), o = 1.004;
        const L = [l[0] * f * o, y, l[1] * f * o], R = [r[0] * f * o, y, r[1] * f * o];
        k.quad(R, L, [L[0], y + 1.1, L[2]], [R[0], y + 1.1, R[2]]); // outward-facing
      }
      k.glow(false);
    }
  }
  // spire mast and the lit tip
  k.color(STEEL).cyl(0, CORE_TOP, 0, 1.2, 0.3, 309.6 - CORE_TOP - 2, 6);
  k.glow(true).color(TIP).cyl(0, 300, 0, 0.9, 0.2, 9.6, 6);
  for (let i = 0; i < (hi ? 6 : 0); i++) { const a = (i / 6) * TAU; k.box(Math.cos(a) * 2.5, 262 + i * 6, Math.sin(a) * 2.5, 0.5, 0.5, 0.5); }
  k.glow(false);
  // entrance canopy / podium on the south-west side
  k.color(STEEL).box(-4, 0, 30, 36, 9, 8);
  k.color(GLASS).box(-4, 0, 33.5, 34, 8, 1.2);
}
