// feature/famous-landmarks: Marina Bay Sands, Singapore — 1:1 (SkyPark deck ~200 m).
// Three 55-storey hotel towers in a row (109 m apart, local X; Tower 1 at -X/south, Tower 3 at
// +X/north). Each tower = a straight east leg and a curved west leg splaying out at the base,
// joined at level 23. The 340 m boat-shaped Sands SkyPark spans all three and cantilevers 66.5 m
// past Tower 3. Front (-Z) faces Marina Bay (WNW).
import { Kit } from "../kit.js";

const GLASS = 0xaab7be, FRAME = 0xeef0f1, CORE = 0x7d8b95, HULL = 0xd9dde0, HULL_DK = 0xa9b0b6;
const DECK = 0xc9c2b4, POOL = 0x3fa6c9, GREEN = 0x5f8f4a;

export const lodDist = 1800;
export const glowStrength = 0.85; // glazing glows softly at night (lit rooms); hull light band brighter

const TX = [-109.4, 0, 109.4];
const TW = 40;         // tower width along the row
const ROOF = 191;      // tower roof / SkyPark underside
const JOIN = 72;       // legs join (level 23)
const SPLAY = 38;      // west-leg outward splay at the ground

export const colliders = [
  ...TX.map((x) => ({ x, z: 0, hw: TW / 2, hd: 23, h: 200 })),
  ...TX.map((x) => ({ x, z: -38, hw: TW / 2, hd: 16, h: 28 })),
];

const off = (y) => (y >= JOIN ? 0 : SPLAY * Math.pow(1 - y / JOIN, 1.7));

function leg(k, x, zIn, zOut, curved) {
  // zIn = inner face, zOut = outer face (sign gives side)
  const hi = k.hi;
  const step = hi ? 3.2 : 32;
  const s = Math.sign(zOut);
  for (let y = 0; y < ROOF - 0.01; y += step) {
    const h = Math.min(step, ROOF - y);
    const o0 = curved ? off(y) : 0, o1 = curved ? off(y + h) : 0;
    const c0 = (zIn + zOut) / 2 + s * o0, c1 = (zIn + zOut) / 2 + s * o1;
    const d = Math.abs(zOut - zIn);
    k.glow(true).color(GLASS).taper(x, y, c0, TW, d, TW, d, h, 0, c1 - c0);
    k.glow(false);
    if (hi) {
      // white floor band + end frames
      k.color(FRAME).taper(x, y + h - 0.45, c1 - (c1 - c0) * (0.45 / h), TW + 0.5, d + 0.7, TW + 0.5, d + 0.7, 0.45, 0, (c1 - c0) * (0.45 / h));
    }
  }
  if (hi) {
    // vertical frame strips on the long faces
    k.color(FRAME);
    for (const fx of [-TW / 2, TW / 2]) {
      for (let y = 0; y < ROOF - 0.01; y += step) {
        const h = Math.min(step, ROOF - y);
        const o0 = curved ? off(y) : 0, o1 = curved ? off(y + h) : 0;
        const c0 = (zIn + zOut) / 2 + s * o0, c1 = (zIn + zOut) / 2 + s * o1;
        const d = Math.abs(zOut - zIn) + 0.4;
        k.taper(x + fx, y, c0, 1.2, d, 1.2, d, h, 0, c1 - c0);
      }
    }
  }
}

function hullPlan(n, inset) {
  // boat outline along X from -142 to 198, beam 38 m; pointed bow at the cantilever (north) end
  const x0 = -142, x1 = 198, L = x1 - x0;
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + L * t;
    let w = 19 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.0)), 0.28);
    if (t > 0.8) w *= 1 - 0.35 * ((t - 0.8) / 0.2);
    w = Math.max(0.5, w - inset);
    top.push([x, -w]);
    bot.push([x, w]);
  }
  return top.concat(bot.reverse());
}

export function build(k) {
  const hi = k.hi;
  for (const x of TX) {
    leg(k, x, 2.5, 22.5, false);   // east leg (rear, +Z): straight
    leg(k, x, -2.5, -22.5, true);  // west leg (front, -Z): curved, splayed at the base
    // atrium glazing between the legs at the top
    k.color(CORE, "glass").box(x, JOIN, 0, TW - 2, ROOF - JOIN, 5.2);
    // rooftop edge lights
    if (hi) { k.glow(true).color(0xfff1d6).box(x, ROOF - 3, -23.2, TW, 1.2, 0.6).box(x, ROOF - 3, 23.2, TW, 1.2, 0.6); k.glow(false); }
  }
  // lobby atrium podium linking the tower bases
  k.color(FRAME).box(0, 0, 2, 2 * 109.4, hi ? 14 : 12, 22);

  // SkyPark: tapered hull + deck
  const n = hi ? 40 : 12;
  k.color(HULL_DK).extrude(hullPlan(n, 4), ROOF - 1, 3);
  k.color(HULL).extrude(hullPlan(n, 1.5), ROOF + 2, 3.5);
  k.glow(true).color(0xe8f1ff).extrude(hullPlan(n, 0.6), ROOF + 5.5, 1.2);
  k.glow(false);
  k.color(DECK).extrude(hullPlan(n, 0), ROOF + 6.7, 1.3);
  const yd = ROOF + 8.0; // 199
  if (k.fine) {
    // [lm-materials] hull: transverse ribs under the soffit, a steel rail along the sides, glass balustrade on top
    const hp = hullPlan(n, 4), half = hp.length / 2;
    k.color(HULL_DK);
    for (let i = 1; i < half - 1; i += 1) {
      const [xa, za] = hp[i], zb = hp[hp.length - 1 - i][1];
      k.box(xa, ROOF - 2.2, (za + zb) / 2, 0.5, 1.2, Math.abs(zb - za) - 1);
    }
    const hq = hullPlan(n, 0.2);
    k.color(0xd9dde0, "glass");
    for (let i = 0; i < hq.length; i++) {
      const a2 = hq[i], b2 = hq[(i + 1) % hq.length];
      k.quad2([a2[0], yd, a2[1]], [b2[0], yd, b2[1]], [b2[0], yd + 1.3, b2[1]], [a2[0], yd + 1.3, a2[1]]);
    }
    // infinity pool along the bay (front, -Z) edge, ~150 m long over towers 1-2
    k.color(POOL).box(-55, yd, -10, 150, 0.4, 13);
    k.color(FRAME).box(-55, yd, -16.8, 150, 0.8, 0.6);
    // gardens / palm planters and pavilions
    k.color(GREEN);
    for (let x = -120; x <= 150; x += 9) k.box(x, yd, 7 + ((x / 9) % 2) * 3, 3, 0.6, 3);
    if (!k.fine) for (let x = -115; x <= 150; x += 18) { k.color(0x6b5a44).box(x, yd, 4, 0.4, 0.6, 0.4); k.color(GREEN).sphere(x, yd + 0.8, 4, 1.0, 6, 3); }
    // palms: curved trunk + a crown of fronds
    for (let x = -115; x <= 150 && k.fine; x += 9) {
      const pz = 4 + ((x / 9) % 2 ? 3 : -3);
      k.color(0x6b5a44).tube([[x, yd, pz], [x + 0.3, yd + 3, pz], [x + 0.8, yd + 5.5, pz]], 0.18, 5);
      k.color(GREEN);
      for (let f = 0; f < 7; f++) {
        const a3 = (f / 7) * Math.PI * 2;
        k.quad2([x + 0.8, yd + 5.5, pz], [x + 0.8 + Math.cos(a3) * 1.4, yd + 5.9, pz + Math.sin(a3) * 1.4], [x + 0.8 + Math.cos(a3) * 2.6, yd + 4.9, pz + Math.sin(a3) * 2.6], [x + 0.8 + Math.cos(a3 + 0.25) * 1.3, yd + 5.6, pz + Math.sin(a3 + 0.25) * 1.3]);
      }
    }
    // pool deck (timber) and cabanas
    k.color(0xb08a5c, "wood").box(-55, yd - 0.05, -1.5, 150, 0.1, 4);
    for (let x = -120; x <= 10; x += 12) k.color(0xeef0f1).box(x, yd, 1.8, 3, 2.4, 2.4);
    k.color(FRAME).box(-20, yd, 9, 22, 1.0, 10).box(80, yd, 9, 22, 1.0, 10);
    // observation deck railing at the cantilever tip
    k.color(FRAME).box(185, yd, 0, 20, 0.9, 0.5);
  }
}
