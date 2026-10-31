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
    const at = lerp(a0, b0, top > CORE_TOP ? 0.12 : 0), bt = lerp(a0, b0, top > CORE_TOP ? 0.88 : 1);
    k.color(i % 2 ? GLASS : GLASS_LT);
    k.quad2(P(a0, 0, 1), P(b0, 0, 1), P(bt, top, ft), P(at, top, ft));
    if (hi) {
      // storey bands (lit at night) every 4.2 m on the facet, up to the core top
      k.glow(true).color(BAND);
      for (let y = 4.2; y < Math.min(top, CORE_TOP) - 2; y += 4.2) {
        const t = y / top, f = 1 + (ft - 1) * t;
        const l = lerp(a0, at, t), r = lerp(b0, bt, t), o = 1.004;
        const L = [l[0] * f * o, y, l[1] * f * o], R = [r[0] * f * o, y, r[1] * f * o];
        k.quad(R, L, [L[0], y + 1.1, L[2]], [R[0], y + 1.1, R[2]]);
      }
      k.glow(false);
      // Exposed silver curtain-wall vertical mullions & jagged shard upper edge framing ribs
      k.color(STEEL);
      const nMul = 4;
      for (let m = 0; m <= nMul; m++) {
        const u = m / nMul;
        const pBot = P(lerp(a0, b0, u), 0, 1);
        const pTop = P(lerp(at, bt, u), top, ft);
        k.strut(pBot, pTop, m === 0 || m === nMul ? 0.32 : 0.18);
      }
      // Jagged stepped diagonal upper tip edge on each glass shard above CORE_TOP
      k.strut(P(at, top, ft), P(bt, top - 4.5, ft * 0.98), 0.35);
      // Mechanical louver bands at levels 31-33 (y=118m) & 66-67 (y=226m)
      k.color(0x525e6a);
      for (const my of [118, 226]) {
        const t = my / top, f = (1 + (ft - 1) * t) * 1.007;
        const l = lerp(a0, at, t), r = lerp(b0, bt, t);
        const L = [l[0] * f, my, l[1] * f], R = [r[0] * f, my, r[1] * f];
        k.quad(R, L, [L[0], my + 3.2, L[2]], [R[0], my + 3.2, R[2]]);
      }
    }
  }
  // Open-air Viewing Gallery & internal multi-tier steel space-frame truss inside the open crown (y = 246 .. 305 m)
  if (hi) {
    // Viewing gallery decks at 68th/69th/72nd floors (y = 244, 248, 256 m)
    for (const dy of [244, 248.5, 256]) {
      const rDeck = 24 * s(dy);
      k.glow(true).color(0xffe9ba).cyl(0, dy, 0, rDeck, rDeck, 1.2, 16);
      k.glow(false).color(STEEL).torus(0, dy + 1.3, 0, rDeck + 0.3, 0.22, 16, 6);
    }
    // Exposed steel radiator lattice & diagonal wind-bracing cage in the open crown
    k.color(STEEL);
    for (let y = CORE_TOP; y < 298; y += 6.5) {
      const r0 = 18 * s(y), r1 = 18 * s(y + 6.5);
      k.torus(0, y, 0, r0, 0.24, 12, 6);
      for (let c = 0; c < 8; c++) {
        const a0 = (c / 8) * TAU, a1 = ((c + 1) / 8) * TAU;
        const p0 = [Math.cos(a0) * r0, y, Math.sin(a0) * r0];
        const p1 = [Math.cos(a0) * r1, y + 6.5, Math.sin(a0) * r1];
        const p2 = [Math.cos(a1) * r1, y + 6.5, Math.sin(a1) * r1];
        k.strut(p0, p1, 0.26);
        k.strut(p0, p2, 0.18);
      }
    }
  }
  // spire mast and the lit tip
  k.color(STEEL).cyl(0, CORE_TOP, 0, 1.2, 0.3, 309.6 - CORE_TOP - 2, 8);
  k.glow(true).color(TIP).cyl(0, 296, 0, 1.0, 0.2, 13.6, 8);
  for (let i = 0; i < (hi ? 6 : 0); i++) { const a = (i / 6) * TAU; k.box(Math.cos(a) * 2.5, 262 + i * 6, Math.sin(a) * 2.5, 0.5, 0.5, 0.5); }
  k.glow(false);
  // London Bridge station concourse podium & cantilevered inclined glass entrance canopy
  k.color(STEEL).box(-4, 0, 30, 38, 9.5, 10);
  k.color(GLASS).box(-4, 0, 34.5, 36, 8.2, 1.4);
  if (hi) {
    // Inclined glass entrance canopy supported by V-shaped steel raking struts
    k.color(GLASS_LT).box(-4, 8.8, 37.5, 38, 0.45, 7.5);
    k.color(STEEL);
    for (let x = -20; x <= 12; x += 8) {
      k.strut([x, 0, 35.5], [x - 1.5, 8.8, 40.5], 0.32);
      k.strut([x, 0, 35.5], [x + 1.5, 8.8, 40.5], 0.32);
    }
  }
}
