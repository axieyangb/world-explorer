// feature/famous-landmarks: Golden Gate Bridge, San Francisco — 1:1 (towers 227 m above the water).
// Suspension bridge in International Orange: 1280 m main span between the two Art Deco towers (legs 27.4 m
// apart, four stepped portal struts above the road, X-bracing below it), 343 m side spans to the concrete
// pylons, main cables (sag 143 m) with suspenders every 15.2 m, 7.6 m deep stiffening truss under the road,
// the steel arch over Fort Point, and the south / north cable anchorages. Positions from the OSM tower /
// pylon / anchorage ways. The road deck is crowned (highest at mid-span) and OSM traffic is pinned onto it
// (registry `deck`, same crown). Towers are floodlit at night; red aviation lights blink on top.
// Local: long axis = Z, -Z = north (Marin), +Z = south (San Francisco); model y = 0 at the water.
import { landmarkDeckY } from "../registry.js";

const ORANGE = 0xc44a30, ORANGE_DK = 0xa13a29, ORANGE_LT = 0xd2583c, CONC = 0xb8b2a6, CONC_DK = 0x9d978b;
const ROADBED = 0x4a4a4c, LAMP = 0xff2a1a;
export const DECK = { y: 67, hw: 16, hd: 1095, crown: 5 }; // registry deck (keep in sync)
const TS = 637.7;                         // tower distance from mid-span (1275 m centre to centre)
const CX = 13.7;                          // cable / tower-leg plane (27.4 m apart)
const TOP = 227, SAD = 222, LOW = 79;      // tower top, cable saddle, cable low point at mid-span
const PYL = { S1: 977, S2: 1090, N1: -980, N2: -1076 };
const ANCH_S = [1094, 1196], ANCH_N = [-1060, -985];
const Z0 = -1060, Z1 = 1094;              // truss extent (north anchorage .. south anchorage)
const PANEL = 15.24;                      // suspender spacing / truss panel
const ZS_END = ANCH_S[0] + 6, ZN_END = ANCH_N[1] - 4; // main cables enter the anchorages
const road = (z) => landmarkDeckY(DECK, z);

export const lodDist = 2600;
export const glowStrength = 1.2;
export const colliders = [
  ...[-TS, TS].flatMap((z) => [-1, 1].map((sx) => ({ x: sx * CX, z, hw: 4.3, hd: 7.5, h: TOP }))),
  ...Object.values(PYL).flatMap((z) => [-1, 1].map((sx) => ({ x: sx * 15, z, hw: 3, hd: 5.5, h: road(z) + 10 }))),
  { x: 0, z: (ANCH_S[0] + ANCH_S[1]) / 2, hw: 20, hd: (ANCH_S[1] - ANCH_S[0]) / 2, h: road(ANCH_S[0]) - 2.5 },
  { x: 0, z: (ANCH_N[0] + ANCH_N[1]) / 2, hw: 22, hd: (ANCH_N[1] - ANCH_N[0]) / 2, h: road(ANCH_N[1]) - 2.5 },
];

/** main cable height at z (main span parabola; side spans: chord to the anchorage with a slight sag) */
function cableY(z) {
  const a = Math.abs(z);
  if (a <= TS) return LOW + (SAD - LOW) * (z / TS) ** 2;
  const end = z > 0 ? ZS_END : -ZN_END, yEnd = road(end) - 1.5;
  const t = Math.min(1, (a - TS) / (end - TS));
  return SAD + (yEnd - SAD) * t - 14 * 4 * t * (1 - t);
}

// ------------------------------------------------------------------------------------------- towers
function tower(k, zt, pierTop) {
  const hi = k.hi, rd = road(zt);
  // legs: stepped sections [y0, y1, w (lateral), d (along the bridge)]
  const SEC = [[pierTop, 120, 10.0, 16.2], [120, 160, 8.6, 13.8], [160, 191, 7.6, 12.0], [191, 219, 6.8, 10.4], [219, TOP - 2.6, 6.2, 9.2]];
  k.glow(true);
  for (const sx of [-1, 1]) {
    const x = sx * CX;
    for (const [y0, y1, w, d] of SEC) {
      k.color(ORANGE).box(x, y0, zt, w, y1 - y0, d);
      if (hi) {
        // Art Deco vertical fluting: ribs on the faces along the bridge and on the outer face
        k.color(ORANGE_LT);
        for (const fz of [-1, 1]) for (const rx of [-0.3, 0, 0.3]) k.box(x + rx * w, y0 + 1.2, zt + fz * (d / 2 + 0.15), w * 0.12, y1 - y0 - 2.4, 0.3);
        k.box(x + sx * (w / 2 + 0.15), y0 + 1.2, zt, 0.3, y1 - y0 - 2.4, d * 0.18);
        k.color(ORANGE_DK).box(x, y1 - 0.6, zt, w + 0.5, 0.6, d + 0.5); // setback ledge
      }
    }
    // saddle housing on the leg top
    k.color(ORANGE).box(x, TOP - 2.6, zt, 5.4, 2.2, 8.2);
    k.color(ORANGE_DK).taper(x, TOP - 0.4, zt, 5.4, 8.2, 3.6, 6.4, 0.4);
  }
  // portal struts above the road (Art Deco panels) and the crown strut
  for (const [y0, y1] of [[120, 126], [160, 166], [191, 197], [219, TOP - 2.6]]) {
    k.color(ORANGE).box(0, y0, zt, 2 * CX, y1 - y0, 5.4);
    if (hi) {
      k.color(ORANGE_DK);
      for (const fz of [-1, 1]) for (const px of [-6, -2, 2, 6]) k.box(px, y0 + 0.9, zt + fz * 2.75, 2.4, y1 - y0 - 1.8, 0.12);
      // stepped corner brackets in the portal openings
      k.color(ORANGE);
      for (const sx of [-1, 1]) {
        const xi = sx * (CX - 4.4);
        k.box(xi - sx * 1.0, y0 - 1.6, zt, 2.0, 1.6, 4.4);
        k.box(xi - sx * 0.5, y0 - 3.0, zt, 1.0, 1.4, 4.4);
      }
    }
  }
  // below the road: deck-support strut and two stacked X-braces between the legs (both faces)
  k.color(ORANGE_DK).box(0, rd - 13, zt, 2 * CX, 4.5, 6.5);
  const xb = (ya, yb) => {
    for (const fz of [-1, 1]) {
      const z = zt + fz * 5.6, xi = CX - 4.5;
      k.strut([-xi, ya, z], [xi, yb, z], 1.8);
      k.strut([xi, ya, z], [-xi, yb, z], 1.8);
    }
    k.box(0, yb - 1.5, zt, 2 * CX, 3, 4.5);
  };
  const ymid = pierTop + (rd - 13 - pierTop) / 2;
  xb(pierTop + 2, ymid);
  xb(ymid, rd - 13);
  k.glow(false);
}

function pier(k, zt, top, fender) {
  k.color(CONC).box(0, -14, zt, 50, top + 14, 28);
  k.color(CONC_DK).box(0, top - 0.8, zt, 51, 0.8, 29);
  if (fender) {
    // the south tower stands in open water inside an oval concrete fender
    k.color(CONC).push().translate(0, -12, zt).scale(1, 1, 0.56);
    k.lathe(0, 0, 0, [[46, 0], [46, 19], [43.5, 19], [43.5, 0]], k.hi ? 40 : 16, { smooth: false });
    k.pop();
  }
}

function pylon(k, z) {
  const hi = k.hi, rd = road(z);
  k.glow(true).color(CONC);
  for (const sx of [-1, 1]) {
    const x = sx * 15;
    k.box(x, -25, z, 6.4, rd + 25 + 6, 11);
    k.box(x, rd + 6, z, 5.2, 3.2, 9.4);
    k.taper(x, rd + 9.2, z, 5.2, 9.4, 3.2, 7.0, 1.6);
    if (hi) { k.color(CONC_DK); for (const rz of [-2.5, 0, 2.5]) k.box(x + sx * 3.25, rd - 30, z + rz, 0.2, 34, 0.8); k.color(CONC); }
  }
  k.box(0, rd - 9, z, 30, 7.6, 7);
  k.glow(false);
}

// ------------------------------------------------------------------------------------------- deck
function truss(k) {
  const hi = k.hi;
  const n = Math.ceil((Z1 - Z0) / PANEL);
  const dz = (Z1 - Z0) / n;
  k.color(ORANGE);
  for (let i = 0; i < n; i++) {
    const za = Z0 + i * dz, zb = za + dz, ya = road(za), yb = road(zb);
    // road bed (just under the pinned OSM carriageways) and floor
    k.color(ROADBED).quad([-CX, ya - 0.4, za], [-CX, yb - 0.4, zb], [CX, yb - 0.4, zb], [CX, ya - 0.4, za]);
    k.color(ORANGE_DK).quad([-CX, yb - 1.6, zb], [-CX, ya - 1.6, za], [CX, ya - 1.6, za], [CX, yb - 1.6, zb]);
    for (const sx of [-1, 1]) {
      const x = sx * CX;
      if (hi) {
        k.color(ORANGE);
        k.strut([x, ya - 0.3, za], [x, yb - 0.3, zb], 0.8);       // top chord
        k.strut([x, ya - 7.6, za], [x, yb - 7.6, zb], 0.9);       // bottom chord
        k.strut([x, ya - 0.3, za], [x, ya - 7.6, za], 0.55);      // vertical
        if (i % 2) k.strut([x, ya - 0.3, za], [x, yb - 7.6, zb], 0.5);
        else k.strut([x, ya - 7.6, za], [x, yb - 0.3, zb], 0.5);
        k.color(ORANGE_LT).strut([x + sx * 0.4, ya + 1.15, za], [x + sx * 0.4, yb + 1.15, zb], 0.18); // outer railing
        k.strut([x + sx * 0.4, ya, za], [x + sx * 0.4, ya + 1.2, za], 0.14);
      } else if (i % 4 === 0) {
        const zc = Math.min(Z1, za + dz * 4), yc = road(zc);
        k.color(ORANGE).quad2([x, ya - 7.6, za], [x, yc - 7.6, zc], [x, yc + 1.0, zc], [x, ya + 1.0, za]);
      }
    }
    if (hi && i % 2 === 0) { // bottom lateral bracing
      k.color(ORANGE_DK);
      k.strut([-CX, ya - 7.6, za], [CX, yb - 7.6, zb], 0.4);
      k.strut([CX, ya - 7.6, za], [-CX, yb - 7.6, zb], 0.4);
    }
  }
}

function fortPointArch(k) {
  const za = PYL.S1 + 5.5, zb = PYL.S2 - 5.5, zm = (za + zb) / 2, half = (zb - za) / 2;
  const spring = 16, crown = road(zm) - 9;
  const archY = (z) => spring + (crown - spring) * (1 - ((z - zm) / half) ** 2);
  const n = k.hi ? 16 : 8;
  k.color(ORANGE);
  for (const sx of [-1, 1]) {
    const x = sx * 11;
    for (let i = 0; i < n; i++) {
      const z0 = za + (i / n) * (zb - za), z1 = za + ((i + 1) / n) * (zb - za);
      k.strut([x, archY(z0), z0], [x, archY(z1), z1], 2.4);
      if (k.hi && i > 0) k.strut([x, archY(z0), z0], [x, road(z0) - 7.6, z0], 0.7); // spandrel posts
    }
  }
  if (k.hi) for (let i = 1; i < n; i += 2) {
    const z = za + (i / n) * (zb - za);
    k.color(ORANGE_DK).strut([-11, archY(z), z], [11, archY(z), z], 0.8);
  }
}

// ------------------------------------------------------------------------------------------- cables
function cables(k) {
  const hi = k.hi, r = hi ? 0.55 : 1.1, seg = hi ? 6 : 4;
  for (const sx of [-1, 1]) {
    const x = sx * CX, pts = [];
    // north side span, main span, south side span
    const push = (za, zb, n) => { for (let i = 0; i <= n; i++) { const z = za + ((zb - za) * i) / n; if (!pts.length || pts[pts.length - 1][2] !== z) pts.push([x, cableY(z), z]); } };
    push(ZN_END, -TS, hi ? 14 : 5);
    push(-TS, TS, hi ? 72 : 24);
    push(TS, ZS_END, hi ? 18 : 6);
    k.color(ORANGE).tube(pts, r, seg);
    // cable bands at the saddles
    for (const z of [-TS, TS]) k.box(x, SAD - 1.6, z, 2.4, 3.2, 9.0);
  }
  if (!hi) return;
  // suspenders: main span and the side spans out to pylons S1 / N1
  k.color(ORANGE_DK);
  const zList = [];
  for (let z = -TS + PANEL; z < TS - 4; z += PANEL) zList.push(z);
  for (let z = TS + PANEL; z < PYL.S1 - 6; z += PANEL) zList.push(z, -z);
  for (const z of zList) {
    const yt = cableY(z), yb = road(z) - 0.3;
    if (yt - yb < 1.0) continue;
    for (const sx of [-1, 1]) k.box(sx * CX, yb, z, 0.32, yt - yb, 0.32);
  }
}

function anchorage(k, za, zb, hw, high) {
  const top = road(high) - 2.5;
  k.color(CONC).box(0, -20, (za + zb) / 2, hw * 2, top + 20, zb - za);
  if (k.hi) {
    k.color(CONC_DK);
    for (const fx of [-1, 1]) for (let i = 1; i < 6; i++) k.box(fx * (hw + 0.1), top - 16, za + (i / 6) * (zb - za), 0.3, 14, 1.2);
  }
}

export function build(k) {
  pier(k, TS, 13, true);
  pier(k, -TS, 10, false);
  tower(k, TS, 13);
  tower(k, -TS, 10);
  for (const z of Object.values(PYL)) pylon(k, z);
  anchorage(k, ANCH_S[0], ANCH_S[1], 20, ANCH_S[0]);
  anchorage(k, ANCH_N[0], ANCH_N[1], 22, ANCH_N[1]);
  truss(k);
  fortPointArch(k);
  cables(k);
  // red aviation lights on the tower tops and at the cable low points (blink at night)
  k.part("lamps").glow(true).color(LAMP);
  for (const z of [-TS, TS]) for (const sx of [-1, 1]) k.box(sx * CX, TOP, z, 0.8, 0.8, 0.8);
  for (const sx of [-1, 1]) k.box(sx * CX, LOW + 0.8, 0, 0.6, 0.6, 0.6);
  k.part("main").glow(false);
}

export function setup({ parts }) {
  const lamps = parts("lamps");
  let on = null;
  return {
    update(dt, t, night) {
      const v = night > 0.15 && (t % 2.4) < 1.3;
      if (v === on) return;
      on = v;
      for (const o of lamps) o.visible = v;
    },
  };
}
