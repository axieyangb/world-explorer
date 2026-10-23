// feature/famous-landmarks: Tower Bridge, London — 1:1. Bridge axis = local Z (north = -Z).
// Two 65 m Gothic stone towers on river piers 61 m apart (closed bascule leaves between them),
// twin high-level lattice walkways at ~42-46 m, curved blue/white suspension chains over the 82 m
// side spans to the shore abutment towers. Origin = river surface at mid-span.
// Night: stone floodlit, blue lattice glows.
const STONE = 0xd3c8ae, STONE_DK = 0xb8ab8f, ROOF = 0x4b525b, GOLD = 0xd8b65a, WIN = 0x2f3236;
const BLUE = 0x6aa6db, WHITE = 0xf2f2ee, ROAD = 0x45484c, PIER = 0x9c968a;
const TAU = Math.PI * 2;
const DECK = 10, TZ = 40.5, TD = 10; // deck top, tower centre z, tower half-depth
const AZ = 134; // abutment tower centre

export const lodDist = 1500;
export const glowStrength = 1.1;

export const colliders = [
  // towers / abutments are split into piers either side of the 10 m road arch so traffic passes through
  { x: -8.25, z: -TZ, hw: 3.25, hd: 11, h: 61 },
  { x: 8.25, z: -TZ, hw: 3.25, hd: 11, h: 61 },
  { x: -8.25, z: TZ, hw: 3.25, hd: 11, h: 61 },
  { x: 8.25, z: TZ, hw: 3.25, hd: 11, h: 61 },
  { x: -6.75, z: -AZ, hw: 1.75, hd: 6, h: 27 },
  { x: 6.75, z: -AZ, hw: 1.75, hd: 6, h: 27 },
  { x: -6.75, z: AZ, hw: 1.75, hd: 6, h: 27 },
  { x: 6.75, z: AZ, hw: 1.75, hd: 6, h: 27 },
];

// extrude an XY polygon ([x, y] points) through z in [za, zb]
function slabXY(k, pts, za, zb) {
  k.push().rotateX(-Math.PI / 2);
  k.extrude(pts, -zb, zb - za);
  k.pop();
}
// dark lancet window in the plane z (facing -Z)
function lancet(k, xm, ya, z, ww, hh) {
  const xa = xm - ww / 2, xb = xm + ww / 2, yb = ya + hh;
  k.quad([xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]);
  k.tri([xb, yb, z], [xa, yb, z], [xm, yb + ww * 0.7, z]);
}
const OCT = { smooth: false, phase: Math.PI / 8 };

function tower(k, tz) {
  const hi = k.hi;
  // river pier with cutwaters (river flows along X)
  k.glow(false).color(PIER);
  k.push().translate(0, 0, tz);
  k.extrude([[-17, -12], [17, -12], [26, 0], [17, 12], [-17, 12], [-26, 0]], 0, DECK - 1.5);
  k.pop();
  // main body with the pointed road arch through Z
  k.glow(true).color(STONE);
  const arch = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; arch.push([-5 + 5 * t, DECK + 8 + Math.sin(t * Math.PI / 2) * 6]); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; arch.push([5 * t, DECK + 14 - (1 - Math.cos(t * Math.PI / 2)) * 6]); }
  slabXY(k, [[-11.5, DECK - 1.5], [-5, DECK - 1.5], [-5, DECK + 8], ...arch, [5, DECK - 1.5], [11.5, DECK - 1.5], [11.5, 50], [-11.5, 50]], tz - 7.5, tz + 7.5);
  k.box(0, DECK - 1.5, tz, 26, 1.2, 18); // plinth band
  // corner turrets
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = sx * 11.6, z = tz + sz * 7.6;
    k.glow(true).color(STONE).lathe(x, DECK - 1.5, z, [[3.3, 0], [3.3, 52 - DECK + 1.5], [3.7, 52 - DECK + 1.5], [3.7, 53.5 - DECK + 1.5], [3.3, 53.5 - DECK + 1.5]], 8, OCT);
    k.glow(false).color(ROOF).cyl(x, 53.5, z, 3.3, 0.2, 7.5, 8, OCT);
    k.glow(true).color(GOLD).cyl(x, 61, z, 0.18, 0.05, 1.6, 4);
    if (hi) {
      k.glow(false).color(WIN);
      for (const y of [22, 30, 38, 46]) {
        k.push().translate(x, 0, z).rotateY(Math.atan2(sx, sz) + Math.PI);
        lancet(k, 0, y, -3.32, 0.8, 2.6);
        k.pop();
      }
    }
  }
  // steep central roof with gablets and finial (65 m)
  k.glow(false).color(ROOF).taper(0, 50, tz, 21, 13, 3, 0.6, 11);
  k.glow(true).color(GOLD).cyl(0, 61, tz, 0.5, 0.12, 4, 6);
  k.glow(true).color(STONE).box(0, 50, tz, 23.6, 1.2, 15.6); // cornice
  if (!hi) { k.glow(false); return; }
  for (const s of [-1, 1]) {
    // gabled dormers on the river faces (±X) and road faces (±Z)
    k.glow(true).color(STONE);
    k.push().translate(0, 0, tz);
    k.box(s * 9.6, 51.2, 0, 1.6, 3.5, 4.2);
    k.push().translate(s * 9.6, 54.7, 0).rotateY(Math.PI / 2);
    k.quad2([-2.1, 0, 0], [2.1, 0, 0], [0, 3.2, 0], [0, 3.2, 0]);
    k.pop();
    k.box(0, 51.2, s * 6.2, 5, 3.5, 1.6);
    k.quad2([-2.5, 54.7, s * 6.2], [2.5, 54.7, s * 6.2], [0, 58, s * 6.2], [0, 58, s * 6.2]);
    k.pop();
  }
  // facade detail: string courses, lancet windows on all four faces
  k.glow(true).color(STONE_DK);
  for (const y of [DECK + 16, 28, 40, 48]) {
    k.box(0, y, tz - 7.6, 17, 0.6, 0.3); k.box(0, y, tz + 7.6, 17, 0.6, 0.3);
    k.box(-11.65, y, tz, 0.3, 0.6, 9); k.box(11.65, y, tz, 0.3, 0.6, 9);
  }
  k.glow(false).color(WIN);
  for (const a of [0, Math.PI]) {
    k.push().translate(0, 0, tz).rotateY(a);
    for (const y of [29.5, 41.5]) for (const xm of [-4.5, -1.5, 1.5, 4.5]) lancet(k, xm, y, -7.56, 1.2, 4.2);
    k.pop();
  }
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    k.push().translate(0, 0, tz).rotateY(a);
    for (const y of [DECK + 3, 21, 29.5, 41.5]) for (const xm of [-2.2, 2.2]) lancet(k, xm, y, -11.56, 1.3, 4.6);
    k.pop();
  }
  k.glow(false);
}

function walkway(k, x) {
  const hi = k.hi, z0 = -TZ + TD, z1 = TZ - TD, yb = 41.5, yt = 46, w = 3.6;
  k.glow(true).color(BLUE);
  if (!hi) {
    k.box(x, yb, 0, w, yt - yb, z1 - z0);
    k.glow(false);
    return;
  }
  // chords + floor + roof
  for (const sx of [-1, 1]) {
    const xx = x + sx * w / 2;
    k.color(BLUE).box(xx, yb, 0, 0.5, 0.9, z1 - z0);
    k.color(BLUE).box(xx, yt - 0.9, 0, 0.5, 0.9, z1 - z0);
    k.color(WHITE).box(xx + sx * 0.2, yt - 1.3, 0, 0.15, 0.3, z1 - z0);
    k.color(BLUE);
    const n = 14, step = (z1 - z0) / n;
    for (let i = 0; i <= n; i++) {
      const z = z0 + i * step;
      k.box(xx, yb + 0.9, z, 0.4, yt - yb - 1.8, 0.4);
      if (i < n) {
        k.strut([xx, yb + 0.9, z], [xx, yt - 0.9, z + step / 2], 0.22);
        k.strut([xx, yt - 0.9, z + step / 2], [xx, yb + 0.9, z + step], 0.22);
      }
    }
  }
  k.color(WHITE).box(x, yb - 0.2, 0, w + 0.6, 0.3, z1 - z0);
  k.color(0x5c8fbf).box(x, yt, 0, w + 0.8, 0.35, z1 - z0);
  // glazed walkway interior
  k.color(0x9fc6e6).box(x, yb + 0.9, 0, w - 0.6, yt - yb - 1.8, z1 - z0 - 0.2);
  // curved quarter-arch brackets under the walkway ends
  k.color(BLUE);
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push([x, yb - 9 * Math.sin(a), s * (z1 - 9 * Math.cos(a))]); }
    k.tube(pts, 0.35, 5);
    k.strut([x, yb, s * (z1 - 4)], [x, yb - 6.5, s * (z1 - 0.3)], 0.25);
  }
  k.glow(false);
}

// suspension chain curve (side span, s = ±1): y(z)
const ZV = 98.7, YV = 11.5, A = 0.01356;
const chainY = (az) => YV + A * (az - ZV) * (az - ZV);

function sideSpan(k, s) {
  const hi = k.hi, za = TZ + TD, zb = AZ - 6;
  // deck
  k.glow(false).color(ROAD).box(0, DECK - 1.2, s * (za + zb) / 2, 16, 1.2, zb - za);
  k.color(BLUE).box(-8.6, DECK - 2, s * (za + zb) / 2, 0.6, 2.4, zb - za);
  k.box(8.6, DECK - 2, s * (za + zb) / 2, 0.6, 2.4, zb - za);
  // chains (stiffened, two chords) + hangers
  const n = hi ? 24 : 8;
  for (const x of [-8.6, 8.6]) {
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const az = za + ((zb - za) * i) / n, y = chainY(az);
      top.push([x, y + 1.6, s * az]);
      bot.push([x, y, s * az]);
    }
    k.glow(true).color(BLUE);
    k.tube(top, hi ? 0.45 : 0.8, hi ? 6 : 4);
    if (hi) {
      k.tube(bot, 0.4, 6);
      k.color(WHITE);
      for (let i = 0; i < n; i++) { k.strut(top[i], bot[i + 1], 0.18); k.strut(bot[i], top[i], 0.2); }
      k.glow(false).color(0x5f8fb8);
      for (let az = za + 4; az < zb - 2; az += 4) {
        const y = chainY(az);
        if (y > DECK + 1.5) k.box(x, DECK, s * az, 0.18, y - DECK, 0.18);
      }
    }
  }
  k.glow(false);
}

function abutment(k, z) {
  const hi = k.hi;
  k.glow(false).color(PIER).box(0, 0, z, 22, DECK - 1.2, 16);
  // abutment tower with a road opening (x in [-5, 5], 7 m clear) through Z
  k.glow(true).color(STONE).box(-6.75, DECK - 1.2, z, 3.5, 26 - DECK + 1.2, 11).box(6.75, DECK - 1.2, z, 3.5, 26 - DECK + 1.2, 11);
  k.box(0, DECK + 7, z, 10, 26 - DECK - 7, 11);
  k.glow(false).color(ROOF).taper(0, 26, z, 12, 10, 1, 1, 5);
  k.glow(true).color(STONE);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    k.lathe(sx * 6.5, DECK - 1.2, z + sz * 5.5, [[1.6, 0], [1.6, 26 - DECK + 3]], 8, OCT);
    k.glow(false).color(ROOF).cyl(sx * 6.5, 27.8, z + sz * 5.5, 1.6, 0.1, 4, 8, OCT);
    k.glow(true).color(STONE);
  }
  if (hi) {
    k.glow(false).color(WIN);
    for (const a of [0, Math.PI]) { k.push().translate(0, 0, z).rotateY(a); lancet(k, 0, DECK + 1, -5.56, 4.5, 6); k.pop(); }
  }
  k.glow(false);
}

export function build(k) {
  const hi = k.hi;
  for (const s of [-1, 1]) tower(k, s * TZ);
  for (const x of [-7, 7]) walkway(k, x);
  // bascule span (closed) between the towers
  const L = 2 * (TZ - TD);
  k.glow(false).color(ROAD).box(0, DECK - 1.6, 0, 15, 1.6, L);
  k.color(BLUE).box(-7.8, DECK - 2.6, 0, 0.6, 3.2, L).box(7.8, DECK - 2.6, 0, 0.6, 3.2, L);
  if (hi) {
    k.color(0x2c2e31).box(0, DECK + 0.01, 0, 15, 0.02, 0.15); // leaf joint
    k.color(WHITE).box(-7.8, DECK, 0, 0.4, 1.1, L).box(7.8, DECK, 0, 0.4, 1.1, L);
    k.glow(true).color(0xffe9b0);
    for (let z = -L / 2 + 5; z < L / 2; z += 10) for (const x of [-7.8, 7.8]) k.box(x, DECK + 1.1, z, 0.3, 3.2, 0.3);
    k.glow(false);
  }
  for (const s of [-1, 1]) { sideSpan(k, s); abutment(k, s * AZ); }
  // short approach decks beyond the abutments
  k.color(ROAD);
  for (const s of [-1, 1]) k.box(0, DECK - 1.2, s * (AZ + 10), 16, 1.2, 8);
}
