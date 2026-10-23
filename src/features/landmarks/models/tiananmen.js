// feature/beijing-landmarks: Tiananmen (Gate of Heavenly Peace), Beijing — 1:1. Placed on the OSM footprint
// (platform 117.8 x 38.9 m, axis heading 178.25 deg = the city's central axis, front = south = local -Z).
// Red brick platform (13 m incl. parapet) on a white-marble base, pierced by five round-arched gateways
// (central one largest); 9 x 5 bay timber hall with a double-eave hip-and-gable (xieshan) roof in yellow glazed
// tiles (total 34.7 m); Mao portrait over the central gate and the two slogan boards; eight red lanterns
// under the eaves; Outer Golden Water River crossed by five white-marble bridges (the river itself is OSM
// water), huabiao columns and stone lions in front. Chang'an Avenue (≈100 m south) is left untouched.
// Local +X = west (heading ~180). Floodlit at night (walls, roof, portrait), lanterns glow red.
import { C, hall, terrace, archWall, wallRun, lantern, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 0.6;

const PW = 117.8, PD = 38.9, PH = 12.0, BASE = 1.0; // platform; parapet adds 1.2 m
const TOP = BASE + PH;
// arches: x (local), width, height (spring + radius). Central gate 5.3 m wide.
const ARCHES = [
  { x: 0, w: 5.6, h: 7.6 },
  { x: 14, w: 4.6, h: 6.6 }, { x: -14, w: 4.6, h: 6.6 },
  { x: 27.5, w: 4.0, h: 5.8 }, { x: -27.5, w: 4.0, h: 5.8 },
];
const RIVER_Z = -62, RIVER_W = 18; // OSM Outer Golden Water River centre / width (local)

export const colliders = [
  { x: 0, z: 0, hw: PW / 2, hd: PD / 2, h: TOP + 1.2 },
  { x: 0, z: 0, hw: 30, hd: 13.5, h: 34.5 },
  { x: 19, z: -86, r: 1.4, h: 9.6 }, { x: -19, z: -86, r: 1.4, h: 9.6 },
];

// 9-character slogans, drawn as white pseudo-glyph strokes (legible as text from a distance).
function glyph(k, cx, cy, z, s, seed) {
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const t = s * 0.13;
  // frame strokes typical of Han characters: 2-3 horizontals, 1-2 verticals, a couple of diagonals
  const nh = 2 + Math.floor(rnd() * 3), nv = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < nh; i++) {
    const yy = cy - s * 0.42 + (s * 0.84 * (i + 0.5 * rnd())) / nh;
    const ww = s * (0.5 + 0.45 * rnd());
    k.box(cx + (rnd() - 0.5) * s * 0.15, yy, z, ww, t, 0.06);
  }
  for (let i = 0; i < nv; i++) {
    const xx = cx - s * 0.3 + (s * 0.6 * (i + 0.5)) / nv + (rnd() - 0.5) * s * 0.1;
    const hh = s * (0.55 + 0.4 * rnd());
    k.box(xx, cy - hh / 2, z, t, hh, 0.06);
  }
  for (let i = 0; i < 2; i++) { // dots / short ticks
    k.box(cx + (rnd() - 0.5) * s * 0.7, cy + (rnd() - 0.5) * s * 0.7, z, t * 1.3, t * 1.6, 0.06);
  }
  for (let i = 0; i < 2; i++) {
    const sx = rnd() > 0.5 ? 1 : -1;
    const x0 = cx + (rnd() - 0.5) * s * 0.3, y0 = cy - s * 0.1 * rnd();
    k.quad([x0, y0, z], [x0 + t, y0 + t * 0.5, z], [x0 + sx * s * 0.38 + t, y0 - s * 0.38, z], [x0 + sx * s * 0.38, y0 - s * 0.4, z]);
  }
}

function slogan(k, x0, x1, y, z, seed) {
  const n = 9, pitch = (x1 - x0) / n, s = pitch * 0.82;
  k.color(0xf4efe6);
  for (let i = 0; i < n; i++) {
    const cx = x0 + pitch * (i + 0.5);
    // front faces -Z: emit quads so they face the viewer (quad() is CCW from the front)
    k.push().translate(cx, y, z).rotateY(Math.PI);
    glyph(k, 0, 0, 0, s, seed + i * 7);
    k.pop();
  }
}

function portrait(k, y0) {
  const z = -PD / 2 - 0.25;
  const W = 4.6, H = 6.0;
  k.glow(true);
  k.color(0x5b3a1e).box(0, y0, z, W + 0.5, H + 0.5, 0.3);           // frame
  k.color(0xc9ccc8).box(0, y0 + 0.25, z - 0.17, W, H, 0.06);         // light background
  if (k.hi) {
    const zf = z - 0.22;
    k.color(0x3c4552).taper(0, y0 + 0.25, zf, W * 0.95, 0.06, W * 0.5, 0.06, H * 0.42); // jacket
    k.color(0x353d48).box(0, y0 + 0.25 + H * 0.38, zf - 0.01, 0.9, 0.5, 0.05);         // collar
    k.push().translate(0, y0 + 0.25 + H * 0.62, zf - 0.02).scale(1, 1.25, 0.12);
    k.color(0xd7a888).sphere(0, 0, 0, 0.95, 10, 6);                                      // face
    k.pop();
    k.color(0x1e1d1c).box(0, y0 + 0.25 + H * 0.78, zf - 0.07, 1.7, 0.45, 0.05);         // hair
  }
  k.glow(false);
}

function huabiao(k, x, z) {
  const hi = k.hi;
  k.glow(true).color(C.MARBLE);
  k.box(x, 0, z, 2.6, 0.5, 2.6);
  k.color(C.MARBLE_DK).box(x, 0.5, z, 2.0, 0.9, 2.0);
  k.color(C.MARBLE).box(x, 1.4, z, 2.3, 0.3, 2.3);
  // octagonal shaft (with a carved coiling dragon suggested by offset rings)
  k.cyl(x, 1.7, z, 0.5, 0.46, 6.4, 8, { smooth: false });
  if (hi) for (let i = 0; i < 7; i++) k.cyl(x + Math.cos(i * 1.8) * 0.12, 2.1 + i * 0.85, z + Math.sin(i * 1.8) * 0.12, 0.55, 0.55, 0.32, 8);
  // cloud board (云板) through the top of the shaft
  k.box(x, 6.9, z, 2.6, 0.7, 0.28);
  // dew plate + seated beast (犼)
  k.cyl(x, 8.1, z, 0.85, 0.85, 0.28, hi ? 12 : 6);
  k.cyl(x, 8.38, z, 0.55, 0.62, 0.22, hi ? 12 : 6);
  k.box(x, 8.6, z, 0.55, 0.65, 0.9);
  k.sphere(x, 9.3, z - 0.32, 0.3, hi ? 8 : 4, hi ? 5 : 3);
  if (hi) for (const sx of [-1, 1]) k.cyl(x + sx * 0.6, 1.4, z, 0.06, 0.06, 0.6, 4); // fence posts hint
  k.glow(false);
}

function lion(k, x, z, faceX) {
  // seated guardian lion on a pedestal; faceX: which way it turns (inward toward the axis)
  const hi = k.hi;
  const S = 0xb8b2a4, S2 = 0xa59f92;
  k.color(C.MARBLE_DK).box(x, 0, z, 2.0, 1.5, 3.0);
  k.color(C.MARBLE).box(x, 1.5, z, 2.2, 0.25, 3.2);
  const y = 1.75;
  k.color(S);
  if (hi) {
    k.push().translate(x, y, z);
    k.sphere(0, 0.75, 0.6, 0.85, 8, 5, 0.9);         // haunches
    k.sphere(0, 1.45, -0.15, 0.75, 8, 5, 1.2);       // chest
    k.color(S2).sphere(faceX * 0.15, 2.45, -0.45, 0.72, 8, 5);   // mane
    k.color(S).sphere(faceX * 0.25, 2.4, -0.85, 0.45, 8, 5);     // face
    for (const sx of [-0.35, 0.35]) k.strut([sx, 1.3, -0.55], [sx, 0.05, -0.85], 0.32); // front legs
    k.sphere(faceX * 0.65, 0.35, -0.85, 0.3, 6, 4);  // ball / cub under the paw
    k.pop();
  } else {
    k.box(x, y, z, 1.3, 2.4, 2.2);
    k.box(x, y + 2.0, z - 0.6, 1.1, 1.0, 1.0);
  }
}

function bridge(k, x, w, nArch) {
  // spans the river from local z = -48 (gate side) to -76 (square side); arched marble bridge with balustrades
  const z0 = RIVER_Z + 14, z1 = RIVER_Z - 14, L = z0 - z1, zc = (z0 + z1) / 2;
  const H = 1.15;
  k.push().translate(x, -0.6, zc).rotateY(Math.PI / 2);
  // archWall's x axis now runs along the bridge (local z), its depth along local x = bridge width
  const arches = nArch === 3 ? [{ x: 0, w: 4.4, h: 2.0 }, { x: 6.2, w: 3.2, h: 1.6 }, { x: -6.2, w: 3.2, h: 1.6 }] : [{ x: 0, w: 4.2, h: 1.9 }];
  archWall(k, 0, 0, 0, L, H + 0.6, w, arches, { color: C.MARBLE, door: C.MARBLE_SH, cheap: true });
  k.pop();
  // gentle hump on the deck
  const yd = H;
  k.color(C.MARBLE_DK);
  k.taper(x, yd - 0.01, zc, w, L, w, L * 0.4, 0.45);
  // balustrades along both edges
  for (const sx of [-1, 1]) {
    rail(k, x + sx * (w / 2 - 0.2), z1, x + sx * (w / 2 - 0.2), zc - L * 0.2, yd, { h: 1.0, spacing: 2.0 });
    rail(k, x + sx * (w / 2 - 0.2), zc - L * 0.2, x + sx * (w / 2 - 0.2), zc + L * 0.2, yd + 0.45, { h: 1.0, spacing: 2.0 });
    rail(k, x + sx * (w / 2 - 0.2), zc + L * 0.2, x + sx * (w / 2 - 0.2), z0, yd, { h: 1.0, spacing: 2.0 });
  }
}

export function build(k) {
  const hi = k.hi;
  // --- platform: marble Xumizuo base, red brick body with five arched gates, parapet with yellow coping
  terrace(k, 0, 0, 0, PW + 1.2, PD + 1.2, BASE, { rail: false, glow: true });
  k.glow(true);
  archWall(k, 0, BASE, 0, PW, PH, PD, ARCHES, { color: C.WALL });
  k.glow(false).color(0x6b655c);
  for (const g of ARCHES) k.box(g.x, BASE, 0, g.w + 0.05, 0.06, PD + 1.4); // dark stone tunnel floors
  k.glow(true);
  k.glow(true).color(C.WALL_DK).box(0, TOP - 0.6, 0, PW + 0.5, 0.6, PD + 0.5); // cornice band
  k.glow(false);
  k.color(C.PAVE_DK).box(0, TOP, 0, PW - 1.4, 0.08, PD - 1.4); // grey paved rostrum deck
  wallRun(k, [[-PW / 2 + 0.4, -PD / 2 + 0.4], [PW / 2 - 0.4, -PD / 2 + 0.4], [PW / 2 - 0.4, PD / 2 - 0.4], [-PW / 2 + 0.4, PD / 2 - 0.4]], 1.25, 0.7, { closed: true, y0: TOP, glow: true, base: C.WALL });
  // gate doors: gold door-nail grid on the central doors
  if (hi) {
    k.color(C.GOLD);
    for (const a of ARCHES) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
        k.box(a.x - a.w * 0.36 + (a.w * 0.72 * c) / 3, BASE + 0.8 + r * ((a.h - a.w / 2) * 0.8) / 5, -0.2, 0.18, 0.18, 0.08);
      }
    }
  }
  // portrait + slogans on the south face (local +X = west: "中华人民共和国万岁" on the west / left)
  portrait(k, 6.9);
  if (hi) {
    k.glow(true);
    slogan(k, 8.5, 41, 8.3, -PD / 2 - 0.08, 11);
    slogan(k, -41, -8.5, 8.3, -PD / 2 - 0.08, 37);
    k.glow(false);
  }
  // --- the gate tower hall (城楼): 9 x 5 bays, double-eave hip-and-gable roof, total 34.7 m
  hall(k, {
    x: 0, z: 0, y0: TOP, w: 52, d: 20.5, bays: 9, baysD: 5, colH: 6.0, colR: 0.42,
    base: { h: 1.0, margin: 3.6, rail: true, stairs: [] },
    roof: "xieshan", double: true, upperH: 2.2, upperInset: 3.4, rise: 9.4, rise2: 7.0,
    ribs: 0.9, beasts: 7, glow: true, glowRoof: true, doors: "front",
  });
  // eight red lanterns under the lower eave (between the front columns, not the centre bay)
  const bw = 52 / 9;
  for (let i = 1; i <= 4; i++) for (const sx of [-1, 1]) lantern(k, sx * bw * i, TOP + 1.0 + 3.9, -20.5 / 2 - 0.6, 1.05);
  // --- five Golden Water bridges (centre one for the emperor, widest)
  bridge(k, 0, 7.4, 3);
  bridge(k, 14, 5.0, 1); bridge(k, -14, 5.0, 1);
  bridge(k, 27.5, 4.2, 1); bridge(k, -27.5, 4.2, 1);
  // marble river embankment balustrades (between bridges)
  if (hi) {
    const edges = [RIVER_Z + RIVER_W / 2 + 0.3, RIVER_Z - RIVER_W / 2 - 0.3];
    const spans = [[-58, -30], [-25, -16.9], [-11.1, -4.5], [4.5, 11.1], [16.9, 25], [30, 58]];
    for (const ez of edges) for (const [a, b] of spans) rail(k, a, ez, b, ez, 0.05, { h: 1.0, spacing: 2.2 });
  }
  // --- huabiao pair and guardian lions (south of the river), lions north of the river at the gate
  huabiao(k, 19, -86); huabiao(k, -19, -86);
  lion(k, 8.5, -80, -1); lion(k, -8.5, -80, 1);
  lion(k, 8.5, -27, -1); lion(k, -8.5, -27, 1);
}
