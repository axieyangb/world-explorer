// feature/famous-landmarks: London Eye, South Bank, London — 1:1 (135 m tall, 120 m rim diameter).
// Wheel plane = local XY (spins about local Z); front (-Z) faces the river, the cantilevering
// A-frame + backstays stand on the land side (+Z). 32 egg-shaped glass capsules ride outside the
// rim (axisymmetric about the wheel axis, so they stay "level" as the wheel turns). The wheel is a
// separate part that rotates slowly (1 rev / 10 min). Rim LEDs + capsules glow at night.
const WHITE = 0xeef0f2, STEEL = 0xd6dade, GREY = 0x9aa2aa, LED = 0x9cc4ff, GLASS = 0xa8c6d4;
const DECK = 0x6e737a, CAPRING = 0xc9ced3;
const TAU = Math.PI * 2;
const HUB = 70, R = 60, CAPR = 62.6;

export const lodDist = 1500;
export const glowStrength = 1.6;

export const colliders = [
  { x: 0, z: 0, hw: 26, hd: 8, h: 4.5 },      // boarding platform
  { x: -21, z: 28, r: 2.2, h: 35 },            // A-frame legs (lower part)
  { x: 21, z: 28, r: 2.2, h: 35 },
  { x: 0, z: 6, r: 3, h: HUB + 4 },            // spindle / apex
];

const ring = (r, z, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; p.push([Math.cos(a) * r, HUB + Math.sin(a) * r, z]); }
  return p;
};

function wheel(k) {
  const hi = k.hi, N = hi ? 64 : 32;
  // rim: main tube + two inner chords (triangular truss), lacing struts
  k.glow(false).color(WHITE);
  k.tube(ring(R, 0, N), hi ? 0.75 : 1.1, hi ? 8 : 5);
  if (hi) {
    k.tube(ring(R - 3.2, -2.4, N), 0.4, 6);
    k.tube(ring(R - 3.2, 2.4, N), 0.4, 6);
    k.color(STEEL);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, b = ((i + 0.5) / N) * TAU;
      const o = [Math.cos(a) * R, HUB + Math.sin(a) * R, 0];
      for (const s of [-1, 1]) {
        const q = [Math.cos(b) * (R - 3.2), HUB + Math.sin(b) * (R - 3.2), s * 2.4];
        k.strut(o, q, 0.22);
        const o2 = [Math.cos(a + TAU / N) * R, HUB + Math.sin(a + TAU / N) * R, 0];
        k.strut(q, o2, 0.22);
      }
    }
  }
  // cable spokes: from both hub ends to the rim (bicycle-wheel style)
  k.color(GREY);
  const NS = hi ? 64 : 16;
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * TAU, s = i % 2 ? 1 : -1;
    const rp = [Math.cos(a) * (R - 3.2), HUB + Math.sin(a) * (R - 3.2), 0];
    if (hi) k.pipe([Math.cos(a) * 2.2, HUB + Math.sin(a) * 2.2, s * 10], rp, 0.1, 3);
    else k.strut([0, HUB, s * 10], rp, 0.35);
  }
  // hub + spindle
  k.color(STEEL);
  k.push().translate(0, HUB, 0).rotateX(Math.PI / 2);
  k.cyl(0, -11, 0, 2.6, 2.6, 22, hi ? 16 : 8);
  k.cyl(0, -12.5, 0, 1.6, 1.6, 25, hi ? 12 : 6);
  k.pop();
  // LED ring (night colour wash)
  k.glow(true).color(LED);
  k.tube(ring(R + 0.8, 0, N), 0.25, 4);
  if (hi) for (const z of [-2.4, 2.4]) k.tube(ring(R - 3.2, z, N), 0.42, 4);
  // capsules: axisymmetric glass eggs (long axis = wheel axis), mounted outside the rim
  for (let c = 0; c < 32; c++) {
    const a = (c / 32) * TAU + TAU / 64;
    const cx = Math.cos(a) * CAPR, cy = HUB + Math.sin(a) * CAPR;
    k.glow(false).color(CAPRING);
    k.strut([Math.cos(a) * (R + 0.4), HUB + Math.sin(a) * (R + 0.4), 0], [cx, cy, 0], 0.5);
    k.push().translate(cx, cy, 0).rotateX(Math.PI / 2);
    if (hi) {
      k.cyl(0, -0.9, 0, 2.55, 2.55, 0.35, 12);       // mounting rings
      k.cyl(0, 0.55, 0, 2.55, 2.55, 0.35, 12);
    }
    k.glow(true).color(GLASS);
    const seg = hi ? 12 : 6;
    k.lathe(0, -4, 0, [[0, 0], [1.3, 0.35], [2.0, 1.3], [2.3, 2.6], [2.35, 4], [2.3, 5.4], [2.0, 6.7], [1.3, 7.65], [0, 8]], seg);
    k.pop();
  }
  k.glow(false);
}

function support(k) {
  const hi = k.hi;
  // A-frame legs: from land-side footings up to the spindle end (apex)
  const apex = [0, HUB, 12.5];
  k.glow(false).color(WHITE);
  for (const sx of [-1, 1]) {
    const foot = [sx * 23, 0, 32];
    k.push();
    k.pipe(foot, apex, hi ? 1.6 : 1.9, hi ? 10 : 6);
    k.pop();
    k.color(DECK).box(foot[0], 0, foot[2], 7, 2, 7).color(WHITE);
  }
  // cross ties between the legs
  for (const t of [0.3, 0.55, 0.78]) {
    const pa = [-23 * (1 - t), HUB * t, 32 + (12.5 - 32) * t], pb = [23 * (1 - t), HUB * t, 32 + (12.5 - 32) * t];
    k.pipe(pa, pb, 0.8, hi ? 8 : 5);
  }
  k.cyl(0, HUB - 4, 12.5, 3.2, 3.2, 8, hi ? 12 : 6); // apex casting
  // backstay cables to the land-side anchor
  k.color(GREY);
  for (const sx of [-1, 1]) {
    if (hi) k.pipe([0, HUB + 1, 13], [sx * 6, 0.5, 120], 0.2, 4);
    else k.strut([0, HUB + 1, 13], [sx * 6, 0.5, 120], 0.6);
  }
  k.color(DECK).box(0, 0, 120, 20, 1.5, 6);
  // boarding platform / pier along the bottom of the wheel
  k.color(DECK).box(0, 0, 0, 52, 3.8, 16);
  k.glow(true).color(0xe8e2d0).box(0, 3.8, -7.5, 52, 0.6, 0.6);
  k.glow(false);
  if (hi) {
    k.color(0xbfc4c9);
    for (let x = -24; x <= 24; x += 6) k.box(x, 3.8, 7.6, 0.2, 1.1, 0.2);
    k.box(0, 4.8, 7.6, 52, 0.15, 0.15);
  }
}

export function build(k) {
  support(k);
  k.part("wheel", 0, HUB, 0);
  wheel(k);
  k.part("main");
}

/** Slow rotation: 1 revolution per 10 minutes (real wheel: 30 min). */
export function setup({ parts }) {
  const w = parts("wheel");
  if (!w.length) return null;
  const speed = TAU / 600;
  return {
    update(dt) {
      for (const h of w) h.rotation.z -= speed * dt;
    },
  };
}
