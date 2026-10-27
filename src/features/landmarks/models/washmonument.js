// feature/famous-landmarks: Washington Monument, Washington DC — 1:1 (169.3 m).
// Hollow marble obelisk: 16.8 m square at the base tapering to 10.5 m at the top of the 152.4 m shaft,
// then a 16.9 m pyramidion. The visible change of marble shade at ~46 m (construction halted 1854-79).
// Two observation windows per face just under the pyramidion, red aviation lights blinking at night,
// a ring of 50 US flags around the round granite plaza; door on the east face. Floodlit at night.
// Local: -Z = north (heading 0), +X = east (entrance side).
const MARBLE_LO = 0xf2ede3, MARBLE_HI = 0xe3dacb, PLAZA = 0xbab3a6, PLAZA_DK = 0x9c968b, DOOR = 0x3a3631;
const WIN = 0x2b2b2e, POLE = 0xd8d8d8, RED = 0xb22234, WHITE = 0xf4f4f4, BLUE = 0x3c3b6e, LAMP = 0xff2a1a;
const TAU = Math.PI * 2;
const B0 = 16.8, B1 = 10.51, SHAFT = 152.4, TOP = 169.3, SPLIT = 46;

export const lodDist = 2200;
export const glowStrength = 1.1;
export const colliders = [
  { x: 0, z: 0, hw: 8.4, hd: 8.4, h: 80 },
  { x: 0, z: 0, hw: 6.6, hd: 6.6, h: 150 },
  { x: 0, z: 0, hw: 4.0, hd: 4.0, h: 165 },
];

const w = (y) => B0 + (B1 - B0) * (y / SHAFT); // shaft width at height y

function flag(k, x, z, a) {
  // 1.5 x 2.4 m flag hanging off a 7.6 m pole, blowing toward angle a (tangent to the ring)
  const dx = Math.cos(a), dz = Math.sin(a), y0 = 5.8, y1 = 7.3, L = 2.4;
  k.color(POLE).cyl(x, 0, z, 0.06, 0.04, 7.7, 4);
  const P = (u, v) => [x + dx * (0.1 + u * L), y0 + v * (y1 - y0), z + dz * (0.1 + u * L)];
  for (let s = 0; s < 7; s++) {
    const v0 = s / 7, v1 = (s + 1) / 7;
    const u0 = s >= 3 ? 0.42 : 0;
    k.color(s % 2 ? WHITE : RED).quad2(P(u0, v0), P(1, v0), P(1, v1), P(u0, v1));
  }
  k.color(BLUE).quad2(P(0, 3 / 7), P(0.42, 3 / 7), P(0.42, 1), P(0, 1));
}

export function build(k) {
  const hi = k.hi;
  // granite plaza (thick so a sloping knoll never shows under it) + ring walk
  k.glow(false).color(PLAZA).cyl(0, -3, 0, 31, 31, 3.12, hi ? 48 : 16);
  if (hi) {
    k.color(PLAZA_DK).cyl(0, 0.12, 0, 12.5, 12.5, 0.06, 32);
    for (let i = 0; i < 16; i++) { // radial joints of the paving
      const a = (i / 16) * TAU;
      k.strut([Math.cos(a) * 12.5, 0.15, Math.sin(a) * 12.5], [Math.cos(a) * 30.5, 0.15, Math.sin(a) * 30.5], 0.12);
    }
  }
  // low stepped marble plinth
  k.glow(true).color(MARBLE_LO).box(0, 0, 0, B0 + 3.2, 0.5, B0 + 3.2);
  k.box(0, 0.5, 0, B0 + 1.6, 0.5, B0 + 1.6);
  // shaft in two marble shades
  k.taper(0, 1.0, 0, B0, B0, w(SPLIT), w(SPLIT), SPLIT - 1.0);
  k.color(MARBLE_HI).taper(0, SPLIT, 0, w(SPLIT), w(SPLIT), B1, B1, SHAFT - SPLIT);
  // pyramidion
  k.color(0xe1d9ca).pyramid(0, SHAFT, 0, B1, B1, TOP - SHAFT - 0.25);
  k.glow(false).color(0xb8b8b8).pyramid(0, TOP - 0.3, 0, 0.3, 0.3, 0.3); // aluminium cap
  // the faint stone courses (every ~10 m) and the colour seam
  if (hi) {
    k.glow(true).color(0xd2c9b9);
    for (let y = 10; y < SHAFT; y += 10.2) {
      const ww = w(y) + 0.04;
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        k.push().rotateY(a);
        k.quad([ww / 2, y, -ww / 2], [-ww / 2, y, -ww / 2], [-ww / 2, y + 0.12, -ww / 2], [ww / 2, y + 0.12, -ww / 2]);
        k.pop();
      }
    }
  }
  // observation windows (2 per face at ~150 m) and aviation lamps between them
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(a);
    const y = 149.3, half = w(y) / 2 + 0.03;
    k.glow(false).color(WIN);
    for (const x of [-1.35, 1.35]) k.quad([x + 0.45, y, -half], [x - 0.45, y, -half], [x - 0.45, y + 0.95, -half], [x + 0.45, y + 0.95, -half]);
    k.pop();
  }
  // east door
  k.push().rotateY(-Math.PI / 2);
  k.glow(false).color(DOOR).quad([1.4, 1.0, -B0 / 2 - 0.03], [-1.4, 1.0, -B0 / 2 - 0.03], [-1.4, 5.2, -B0 / 2 - 0.03], [1.4, 5.2, -B0 / 2 - 0.03]);
  k.pop();
  // red aviation lights (part "lamps": toggled/blinked in setup)
  k.part("lamps").glow(true).color(LAMP);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(a);
    const half = w(150.6) / 2 + 0.12;
    k.box(0, 150.3, -half, 0.45, 0.45, 0.22);
    k.pop();
  }
  k.part("main").glow(false);
  // 50 flags around the plaza
  if (hi) for (let i = 0; i < 50; i++) {
    const a = (i / 50) * TAU;
    flag(k, Math.cos(a) * 29, Math.sin(a) * 29, a + Math.PI / 2 + 0.5);
  }
}

export function setup({ parts }) {
  const lamps = parts("lamps");
  let on = null;
  return {
    update(dt, t, night) {
      const v = night > 0.15 && (t % 2.0) < 1.1;
      if (v === on) return;
      on = v;
      for (const o of lamps) o.visible = v;
    },
  };
}
