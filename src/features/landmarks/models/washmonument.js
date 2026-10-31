// feature/famous-landmarks: Washington Monument, Washington DC — 1:1 (169.3 m).
// Hollow marble obelisk: 16.8 m square at the base tapering to 10.5 m at the top of the 152.4 m shaft,
// then a 16.9 m pyramidion. The visible change of marble shade at ~46 m (construction halted 1854-79).
// Two observation windows per face just under the pyramidion, red aviation lights blinking at night,
// a ring of 50 US flags around the round granite plaza; door on the east face. Floodlit at night.
// Local: -Z = north (heading 0), +X = east (entrance side).
const MARBLE_LO = 0xf2ede3, MARBLE_MID = 0xebe3d5, MARBLE_HI = 0xe3dacb, PLAZA = 0xbab3a6, PLAZA_DK = 0x9c968b, DOOR = 0x3a3631;
const WIN = 0x2b2b2e, POLE = 0xd8d8d8, RED = 0xb22234, WHITE = 0xf4f4f4, BLUE = 0x3c3b6e, LAMP = 0xff2a1a;
const TAU = Math.PI * 2;
const B0 = 16.8, B1 = 10.51, SHAFT = 152.4, TOP = 169.3, SPLIT = 46;

export const lodDist = 2200;
export const glowStrength = 0.5;
export const colliders = [
  { x: 0, z: 0, hw: 8.4, hd: 8.4, h: 80 },
  { x: 0, z: 0, hw: 6.6, hd: 6.6, h: 150 },
  { x: 0, z: 0, hw: 4.0, hd: 4.0, h: 165 },
];

const w = (y) => B0 + (B1 - B0) * (y / SHAFT);

function flag(k, x, z, a) {
  // 1.5 x 2.4 m flag hanging off a 7.6 m pole, blowing toward angle a (tangent to the ring)
  const dx = Math.cos(a), dz = Math.sin(a), y0 = 5.8, y1 = 7.3, L = 2.4;
  k.color(POLE).cyl(x, 0, z, 0.08, 0.04, 7.7, 6);
  k.color(0xdfb438).sphere(x, 7.78, z, 0.1, 6, 4);
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
  // granite plaza + concentric dual-tone granite rings & benches
  k.glow(false).color(PLAZA).cyl(0, -3, 0, 35, 35, 3.12, hi ? 48 : 16);
  if (hi) {
    k.color(PLAZA_DK).cyl(0, 0.12, 0, 22.5, 22.5, 0.05, 40);
    k.color(PLAZA).cyl(0, 0.17, 0, 17.5, 17.5, 0.05, 40);
    k.color(PLAZA_DK).cyl(0, 0.22, 0, 12.8, 12.8, 0.05, 32);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      k.strut([Math.cos(a) * 12.8, 0.25, Math.sin(a) * 12.8], [Math.cos(a) * 34.5, 0.15, Math.sin(a) * 34.5], 0.14);
      // Curved granite visitor benches around the inner plaza ring
      if (i % 2 === 0) {
        const bm = a + Math.PI / 16;
        k.color(0xd8d2c6).box(Math.cos(bm) * 23.5, 0.18, Math.sin(bm) * 23.5, 2.2, 0.55, 0.75);
        k.color(PLAZA_DK);
      }
    }
  }
  // low stepped marble plinth
  k.glow(true).color(MARBLE_LO).box(0, 0, 0, B0 + 3.2, 0.5, B0 + 3.2);
  k.box(0, 0.5, 0, B0 + 1.6, 0.5, B0 + 1.6);
  // shaft in three historical marble shades (1848-54 Maryland marble, 1879-80 Massachusetts marble band, 1880-84 Cockeysville marble)
  k.taper(0, 1.0, 0, B0, B0, w(SPLIT), w(SPLIT), SPLIT - 1.0);
  k.color(MARBLE_MID).taper(0, SPLIT, 0, w(SPLIT), w(SPLIT), w(SPLIT + 8), w(SPLIT + 8), 8.0);
  k.color(MARBLE_HI).taper(0, SPLIT + 8, 0, w(SPLIT + 8), w(SPLIT + 8), B1, B1, SHAFT - SPLIT - 8);
  // pyramidion with 12 horizontal stone courses + cast-aluminium apex cap & platinum-tipped lightning rods
  k.color(0xe1d9ca).pyramid(0, SHAFT, 0, B1, B1, TOP - SHAFT - 0.25);
  k.glow(false).color(0xd0d6dc).pyramid(0, TOP - 0.35, 0, 0.42, 0.42, 0.38); // 1884 Tiffany aluminium apex pyramidion
  if (hi) {
    // Lightning rod crown spikes around the aluminium cap
    k.color(0xe4e8ee);
    for (const sx of [-0.22, 0.22]) for (const sz of [-0.22, 0.22]) k.cyl(sx, TOP - 0.25, sz, 0.025, 0.01, 0.55, 4);
    // Horizontal ashlar masonry course seams up the shaft & pyramidion
    k.glow(true).color(0xd2c9b9);
    for (let y = 6; y < SHAFT; y += 6.1) {
      const ww = w(y) + 0.05;
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        k.push().rotateY(a);
        k.quad([ww / 2, y, -ww / 2], [-ww / 2, y, -ww / 2], [-ww / 2, y + 0.12, -ww / 2], [ww / 2, y + 0.12, -ww / 2]);
        k.pop();
      }
    }
    for (let py = SHAFT + 2.8; py < TOP - 1.5; py += 2.8) {
      const pw = B1 * (1 - (py - SHAFT) / (TOP - SHAFT)) + 0.04;
      k.box(0, py, 0, pw, 0.1, pw);
    }
  }
  // Recessed observation windows (2 per face at ~150 m) with bevelled marble reveals and aviation lamps between them
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    k.push().rotateY(a);
    const y = 149.3, half = w(y) / 2 + 0.03;
    for (const x of [-1.45, 1.45]) {
      if (hi) {
        k.glow(false).color(0xc8bfb0).box(x, y - 0.12, -half, 1.15, 1.18, 0.16);
        k.color(WIN).box(x, y, -half - 0.04, 0.92, 0.95, 0.14);
        k.glow(true).color(0xfff0c8).box(x, y + 0.08, -half - 0.06, 0.72, 0.78, 0.12);
      } else {
        k.glow(false).color(WIN).quad([x + 0.45, y, -half], [x - 0.45, y, -half], [x - 0.45, y + 0.95, -half], [x + 0.45, y + 0.95, -half]);
      }
    }
    k.pop();
  }
  // East entrance portal (+X) with Egyptian cavetto cornice lintel, winged sun-disc relief & glass security screening pavilion
  k.push().rotateY(-Math.PI / 2);
  const zDoor = -B0 / 2 - 0.04;
  k.glow(false).color(DOOR).quad([1.4, 1.0, zDoor], [-1.4, 1.0, zDoor], [-1.4, 5.2, zDoor], [1.4, 5.2, zDoor]);
  if (hi) {
    k.color(MARBLE_LO).box(-1.65, 1.0, zDoor - 0.18, 0.5, 4.4, 0.4).box(1.65, 1.0, zDoor - 0.18, 0.5, 4.4, 0.4);
    k.taper(0, 5.2, zDoor - 0.25, 3.8, 0.45, 4.4, 0.75, 0.95);
    k.color(0xd8b248).sphere(0, 5.65, zDoor - 0.52, 0.28, 8, 6).box(0, 5.58, zDoor - 0.48, 2.2, 0.18, 0.12);
    // East glass-and-steel security screening vestibule pavilion
    k.color(0xd8dde2).box(0, 0.2, zDoor - 4.2, 7.6, 3.8, 8.2);
    k.glow(true).color(0xd8ecff).box(0, 0.5, zDoor - 4.2, 7.2, 3.1, 7.8);
    k.glow(false).color(MARBLE_LO).box(0, 4.0, zDoor - 4.2, 8.2, 0.45, 8.8);
  }
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
  // 50 flags around the plaza + ground floodlight banks
  if (hi) {
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * TAU;
      flag(k, Math.cos(a) * 31.5, Math.sin(a) * 31.5, a + Math.PI / 2 + 0.5);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const fx = Math.cos(a) * 18.5, fz = Math.sin(a) * 18.5;
      k.glow(false).color(0x3a3e44).box(fx, 0.2, fz, 1.4, 0.55, 1.4);
      k.glow(true).color(0xfff5dc).box(fx, 0.72, fz, 1.1, 0.15, 1.1);
    }
    k.glow(false);
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
