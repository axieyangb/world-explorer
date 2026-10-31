// feature/famous-landmarks: Atomium, Brussels — 1:1 (102 m).
// An iron-crystal unit cell (body-centred cubic) magnified 165 billion times, standing on a corner with its body
// diagonal vertical: nine 18 m stainless-steel spheres with meridian/equatorial ribs & circular portholes, 45 m
// cube edge, the 12 edge tubes and 8 diagonal tubes (3 m) with circumferential structural ring collars, the
// vertical lift tube crowned by its glass elevator penthouse, three open-lattice bipods carrying the lower
// spheres, and the Expo 58 entrance pavilion + "ATOMIUM" sign under the bottom sphere.
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
  k.color(STEEL).sphere(p[0], p[1], p[2], R, hi ? 24 : 10, hi ? 14 : 6);
  if (!hi) return;
  // panel seams: 9 great-circle meridian/latitude bands and circular porthole windows of the visitable spheres
  k.color(STEEL_DK);
  k.lathe(p[0], p[1] - 0.25, p[2], [[R + 0.06, 0], [R + 0.06, 0.5]], 24, { caps: false });
  for (const f of [-0.65, -0.35, 0.35, 0.65]) {
    const r = Math.sqrt(Math.max(0, R * R - (f * R) ** 2)) + 0.05;
    k.lathe(p[0], p[1] + f * R - 0.18, p[2], [[r, 0], [r, 0.36]], 20, { caps: false });
  }
  // 4 meridian seam arcs around each sphere
  for (let m = 0; m < 4; m++) {
    const a = (m / 4) * Math.PI;
    const pts = [];
    for (let s = 0; s <= 12; s++) {
      const th = (s / 12) * TAU;
      pts.push([p[0] + Math.cos(a) * Math.sin(th) * (R + 0.05), p[1] + Math.cos(th) * (R + 0.05), p[2] + Math.sin(a) * Math.sin(th) * (R + 0.05)]);
    }
    k.tube(pts, 0.12, 4);
  }
  k.color(GLASS);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    k.push().translate(p[0], p[1], p[2]).rotateY(-a);
    k.quad([1.2, 0.4, -R - 0.04], [-1.2, 0.4, -R - 0.04], [-1.2, 1.6, -R - 0.04], [1.2, 1.6, -R - 0.04]);
    // Circular porthole window below main window band
    k.cyl(0, -1.6, -R - 0.06, 0.65, 0.65, 0.12, 8);
    k.pop();
  }
}

export function build(k) {
  const hi = k.hi;
  // Expo 58 entrance pavilion, boomerang canopy and plaza
  k.color(BASE).cyl(0, -1.5, 0, 26, 28, 1.7, hi ? 32 : 12);
  k.color(GLASS).cyl(0, 0.2, 0, 13.5, 14.5, 4.6, hi ? 24 : 8);
  k.color(STEEL_DK).cyl(0, 4.8, 0, 16.5, 15.5, 0.6, hi ? 24 : 8);
  if (hi) {
    // Expo 58 V-columns around the circular glass entrance pavilion & boomerang entry canopy
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, a2 = ((i + 0.5) / 16) * TAU;
      k.color(STEEL).strut([Math.cos(a) * 15.2, 0.2, Math.sin(a) * 15.2], [Math.cos(a2) * 15.8, 4.8, Math.sin(a2) * 15.8], 0.2);
      k.strut([Math.cos(a) * 15.2, 0.2, Math.sin(a) * 15.2], [Math.cos(a - TAU / 32) * 15.8, 4.8, Math.sin(a - TAU / 32) * 15.8], 0.2);
    }
    // Iconic silver/white "ATOMIUM" block letters on the forecourt (-Z side)
    k.color(STEEL);
    for (let l = -3; l <= 3; l++) {
      k.box(l * 1.45, 0.2, -21.5, 0.95, 1.4, 0.45);
    }
  }
  // the vertical lift tube from the ground to the top sphere (through the centre sphere)
  k.color(TUBE).cyl(0, 0, 0, 2.2, 2.2, V[7].p[1] - R + 1, hi ? 16 : 8);
  if (hi) {
    // Structural ring collars along the central vertical elevator shaft
    k.color(STEEL_DK);
    for (let y = 7; y < V[7].p[1] - R; y += 5.5) k.cyl(0, y, 0, 2.38, 2.38, 0.35, 12);
  }
  // 12 edge tubes + 8 diagonals (to the centre) + circumferential ring ribs
  k.color(TUBE);
  const seg = hi ? 12 : 6;
  const ringTube = (p0, p1) => {
    k.color(TUBE).pipe(p0, p1, TR, seg);
    if (!hi) return;
    k.color(STEEL_DK);
    for (const f of [0.28, 0.42, 0.58, 0.72]) {
      const pa = [p0[0] + (p1[0] - p0[0]) * (f - 0.01), p0[1] + (p1[1] - p0[1]) * (f - 0.01), p0[2] + (p1[2] - p0[2]) * (f - 0.01)];
      const pb = [p0[0] + (p1[0] - p0[0]) * (f + 0.01), p0[1] + (p1[1] - p0[1]) * (f + 0.01), p0[2] + (p1[2] - p0[2]) * (f + 0.01)];
      k.pipe(pa, pb, TR + 0.16, 10);
    }
  };
  for (let i = 0; i < V.length; i++) {
    for (let j = i + 1; j < V.length; j++) {
      const d = V[i].s.reduce((n, s, q) => n + (s !== V[j].s[q] ? 1 : 0), 0);
      if (d === 1) ringTube(V[i].p, V[j].p);
    }
    ringTube(V[i].p, C);
  }
  // bipods: two open-lattice A-frame legs under each lower sphere, splayed outward + external stairways
  k.color(STEEL_DK);
  for (const v of LOWER) {
    const [x, y, z] = v.p, h = Math.hypot(x, z), ux = x / h, uz = z / h;
    for (const side of [-1, 1]) {
      const fx = x + ux * 8 - uz * side * 7, fz = z + uz * 8 + ux * side * 7;
      const topP = [x, y - R * 0.8, z];
      if (hi) {
        // Double-chord open-webbed bipod leg with cross-rungs
        const ox = -uz * side * 0.65, oz = ux * side * 0.65;
        const c1a = [fx - ox, 0, fz - oz], c1b = [topP[0] - ox * 0.6, topP[1], topP[2] - oz * 0.6];
        const c2a = [fx + ox, 0, fz + oz], c2b = [topP[0] + ox * 0.6, topP[1], topP[2] + oz * 0.6];
        k.color(STEEL).strut(c1a, c1b, 0.55).strut(c2a, c2b, 0.55);
        k.color(STEEL_DK);
        for (let r = 1; r <= 7; r++) {
          const t = r / 8;
          const pA = [c1a[0] + (c1b[0] - c1a[0]) * t, c1a[1] + (c1b[1] - c1a[1]) * t, c1a[2] + (c1b[2] - c1a[2]) * t];
          const pB = [c2a[0] + (c2b[0] - c2a[0]) * t, c2a[1] + (c2b[1] - c2a[1]) * t, c2a[2] + (c2b[2] - c2a[2]) * t];
          k.strut(pA, pB, 0.32);
        }
      } else {
        k.pipe([fx, 0, fz], topP, 1.1, 5);
      }
      k.color(BASE).box(fx, 0, fz, 3.6, 1.4, 3.6);
    }
  }
  // spheres
  for (const v of V) sphere(k, v.p, hi);
  sphere(k, C, hi);
  // the top sphere's panorama restaurant window band & rooftop glass elevator view dome (102 m)
  if (hi) {
    const t = V[7].p;
    k.glow(true).color(GLASS).lathe(t[0], t[1] + 0.6, t[2], [[R + 0.1, 0], [R - 0.15, 2.6]], 24, { caps: false }).glow(false);
    k.color(STEEL);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      k.strut([t[0] + Math.cos(a) * (R + 0.12), t[1] + 0.6, t[2] + Math.sin(a) * (R + 0.12)],
              [t[0] + Math.cos(a) * (R - 0.12), t[1] + 3.2, t[2] + Math.sin(a) * (R - 0.12)], 0.16);
    }
    // Top pinnacle antenna & red aviation beacon at 102 m
    k.color(STEEL_DK).cyl(t[0], t[1] + R - 0.2, t[2], 1.8, 1.4, 1.6, 10);
    k.cyl(t[0], t[1] + R + 1.4, t[2], 0.15, 0.06, 4.5, 6);
    k.glow(true).color(0xff3020).sphere(t[0], t[1] + R + 6.0, t[2], 0.35, 6, 4).glow(false);
  }
  // night: rings of lamps on every sphere (part "lights", only visible at night)
  k.part("lights").glow(true).color(LAMP);
  const n = hi ? 18 : 8;
  for (const p of [...V.map((v) => v.p), C]) {
    for (const f of [-0.7, -0.35, 0, 0.35, 0.7]) {
      const r = Math.sqrt(1 - f * f) * R + 0.12;
      for (let i = 0; i < n; i++) {
        const a = ((i + ((f * 7) % 1)) / n) * TAU;
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
