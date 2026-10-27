// feature/famous-landmarks: Atomium, Brussels — 1:1 (102 m).
// An iron-crystal unit cell (body-centred cubic) magnified 165 billion times, standing on a corner with its body
// diagonal vertical: nine 18 m stainless-steel spheres, 45 m cube edge, the 12 edge tubes and 8 diagonal tubes
// (3 m), the vertical lift tube through the centre, three bipods carrying the lower spheres, the entrance
// pavilion under the bottom sphere. At night the spheres sparkle with rings of lights (setup toggles them).
// Local: plan orientation from the OSM outline (lower spheres toward bearings 30 / 150 / 270, heading 270).
const STEEL = 0xd5dae0, STEEL_DK = 0xaab1b9, TUBE = 0xc4cad1, BASE = 0x8d9298, GLASS = 0x46525e, LAMP = 0xfff3d6;
const TAU = Math.PI * 2;
const A = 45, R = 9, TR = 1.5, Y0 = 14;     // cube edge, sphere radius, tube radius, bottom sphere centre height
const S3 = Math.sqrt(3), S2 = Math.sqrt(2), S6 = Math.sqrt(6);

// cube vertex (sx, sy, sz in +-1) -> model position, body diagonal (1,1,1) vertical
const P = (sx, sy, sz) => {
  const x = (sx * A) / 2, y = (sy * A) / 2, z = (sz * A) / 2;
  return [(x - y) / S2, Y0 + (A * S3) / 2 + (x + y + z) / S3, (x + y - 2 * z) / S6];
};
const V = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) V.push({ s: [sx, sy, sz], p: P(sx, sy, sz) });
const C = P(0, 0, 0);
const LOWER = V.filter((v) => v.s[0] + v.s[1] + v.s[2] === -1);

export const lodDist = 1600;
export const glowStrength = 1.4;
export const colliders = [
  ...V.map((v) => ({ x: v.p[0], z: v.p[2], r: R, h: v.p[1] + R })).filter((c) => c.h < 40),
  { x: 0, z: 0, r: 5, h: 102 },
  { x: 0, z: 0, hw: 14, hd: 14, h: 6 },
];

function sphere(k, p, hi) {
  k.color(STEEL).sphere(p[0], p[1], p[2], R, hi ? 22 : 10, hi ? 12 : 6);
  if (!hi) return;
  // panel seams: a few meridian/latitude bands and the windows of the visitable spheres
  k.color(STEEL_DK);
  k.lathe(p[0], p[1] - 0.25, p[2], [[R + 0.05, 0], [R + 0.05, 0.5]], 22, { caps: false });
  for (const f of [-0.55, 0.55]) {
    const r = Math.sqrt(R * R - (f * R) ** 2) + 0.05;
    k.lathe(p[0], p[1] + f * R - 0.2, p[2], [[r, 0], [r, 0.4]], 20, { caps: false });
  }
  k.color(GLASS);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    k.push().translate(p[0], p[1], p[2]).rotateY(-a).quad([1.2, 0.4, -R - 0.04], [-1.2, 0.4, -R - 0.04], [-1.2, 1.6, -R - 0.04], [1.2, 1.6, -R - 0.04]).pop();
  }
}

export function build(k) {
  const hi = k.hi;
  // entrance pavilion and plaza
  k.color(BASE).box(0, -1.5, 0, 34, 1.7, 34);
  k.color(GLASS).box(0, 0.2, 0, 22, 4.6, 22);
  k.color(STEEL_DK).box(0, 4.8, 0, 24, 0.6, 24);
  // the vertical lift tube from the ground to the top sphere (through the centre sphere)
  k.color(TUBE).cyl(0, 0, 0, 2.2, 2.2, V[7].p[1] - R + 1, hi ? 16 : 8);
  // 12 edge tubes + 8 diagonals (to the centre)
  k.color(TUBE);
  const seg = hi ? 10 : 6;
  for (let i = 0; i < V.length; i++) {
    for (let j = i + 1; j < V.length; j++) {
      const d = V[i].s.reduce((n, s, q) => n + (s !== V[j].s[q] ? 1 : 0), 0);
      if (d === 1) k.pipe(V[i].p, V[j].p, TR, seg);
    }
    k.pipe(V[i].p, C, TR, seg);
  }
  // bipods: two inclined legs under each lower sphere, splayed outward
  k.color(STEEL_DK);
  for (const v of LOWER) {
    const [x, y, z] = v.p, h = Math.hypot(x, z), ux = x / h, uz = z / h;
    for (const side of [-1, 1]) {
      const fx = x + ux * 8 - uz * side * 7, fz = z + uz * 8 + ux * side * 7;
      k.pipe([fx, 0, fz], [x, y - R * 0.8, z], 1.1, hi ? 8 : 5);
      k.box(fx, 0, fz, 3, 1.2, 3);
    }
  }
  // spheres
  for (const v of V) sphere(k, v.p, hi);
  sphere(k, C, hi);
  // the top sphere's panorama window band
  if (hi) {
    const t = V[7].p;
    k.color(GLASS).lathe(t[0], t[1] + 1.0, t[2], [[R + 0.08, 0], [R - 0.3, 2.4]], 24, { caps: false });
  }
  // night: rings of lamps on every sphere (part "lights", only visible at night)
  k.part("lights").glow(true).color(LAMP);
  const n = hi ? 18 : 8;
  for (const p of [...V.map((v) => v.p), C]) {
    for (const f of [-0.7, -0.35, 0, 0.35, 0.7]) {
      const r = Math.sqrt(1 - f * f) * R + 0.12;
      for (let i = 0; i < n; i++) {
        const a = ((i + (f * 7 % 1)) / n) * TAU;
        k.box(p[0] + Math.cos(a) * r, p[1] + f * R - 0.2, p[2] + Math.sin(a) * r, 0.4, 0.4, 0.4);
      }
    }
  }
  k.part("main").glow(false);
}

export function setup({ parts }) {
  const lights = parts("lights");
  let on = null;
  return {
    update(dt, t, night) {
      // a slow chase: the lamp rings switch on in the evening and twinkle every few seconds
      const v = night > 0.2 && (t % 6) > 0.35;
      if (v === on) return;
      on = v;
      for (const o of lights) o.visible = v;
    },
  };
}
