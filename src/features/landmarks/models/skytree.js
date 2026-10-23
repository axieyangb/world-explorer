// feature/famous-landmarks: Tokyo Skytree — 1:1 (634 m). White steel diagrid whose plan morphs from an
// equilateral triangle (68 m sides) at the base to a circle by ~300 m, around a concrete core;
// Tembo Deck (340-355 m), Tembo Galleria ring (445-452 m), gain tower and mast.
// At night the lattice glows "Iki" light blue (glow emissive tinted in setup()).
const WHITE = 0xe9eef2, WHITE_DK = 0xc9d0d6, CORE = 0xb8bcbf, GLASS = 0x5b6f80, LIT = 0xeaf4ff;

export const lodDist = 2200;
export const glowStrength = 1.5;

export const colliders = [
  { x: 0, z: 0, r: 30, h: 60 },
  { x: 0, z: 0, r: 22, h: 200 },
  { x: 0, z: 0, r: 26, h: 356 },
  { x: 0, z: 0, r: 19, h: 452 },
  { x: 0, z: 0, r: 9, h: 500 },
  { x: 0, z: 0, r: 4, h: 634 },
];

const TRI_R = 68 / Math.sqrt(3); // circumradius of the base triangle
// circle radius the plan converges to, by height
const RC = [[0, 30], [100, 23], [200, 19], [300, 17], [340, 16.4], [360, 15.6], [445, 14], [452, 13.4], [497, 9]];
function lerpT(T, y) {
  for (let i = 0; i < T.length - 1; i++) {
    const [y0, a] = T[i], [y1, b] = T[i + 1];
    if (y <= y1) return a + (b - a) * (y - y0) / (y1 - y0);
  }
  return T[T.length - 1][1];
}
// plan radius at angle th (triangle vertex pointing -Z) and height y
function rad(th, y) {
  const m = Math.min(1, y / 310), mm = m * m * (3 - 2 * m);
  const u = (((th + Math.PI / 2) % (2 * Math.PI / 3)) + 2 * Math.PI / 3) % (2 * Math.PI / 3) - Math.PI / 3;
  const rt = (TRI_R * 0.5) / Math.cos(u);
  const scale = 1 - 0.55 * Math.min(1, y / 310);
  return rt * scale * (1 - mm) + lerpT(RC, y) * mm;
}

function diagrid(k, y0, y1, levels, n, chord, diag) {
  const P = (i, y) => { const th = (i / n) * Math.PI * 2 - Math.PI / 2; const r = rad(th, y); return [Math.cos(th) * r, y, Math.sin(th) * r]; };
  for (let l = 0; l < levels; l++) {
    const ya = y0 + ((y1 - y0) * l) / levels, yb = y0 + ((y1 - y0) * (l + 1)) / levels;
    for (let i = 0; i < n; i++) {
      const a = P(i, ya);
      if (k.hi) {
        k.strut(a, P(i + 1, yb), diag);
        k.strut(a, P(i - 1, yb), diag);
        if (l % 2 === 0) k.strut(P(i, yb), P(i + 1, yb), diag * 0.8);
      }
      if (i % (k.hi ? 1 : 3) === 0) k.strut(a, P(i, yb), k.hi ? chord : chord * 3.2);
    }
  }
}

export function build(k) {
  const hi = k.hi;
  // concrete core (seen through the lattice)
  k.color(CORE).cyl(0, 0, 0, 8, 7.5, 375, hi ? 16 : 8);
  // lattice (glows blue at night)
  k.glow(true).color(WHITE);
  // three corner legs at the base (vertices of the triangle)
  if (hi) diagrid(k, 0, 336, 28, 24, 1.3, 0.7);
  else diagrid(k, 0, 336, 7, 24, 1.3, 0.7);
  if (hi) diagrid(k, 356, 444, 9, 20, 1.0, 0.55);
  else diagrid(k, 356, 444, 3, 20, 1.0, 0.55);
  if (!hi) {
    // far LOD: translucent-looking solid shell (lathe, average radius)
    k.color(WHITE_DK);
    const prof = [];
    for (let y = 0; y <= 336; y += 24) prof.push([lerpT(RC, y) * (y < 300 ? 0.95 : 0.98), y]);
    k.lathe(0, 0, 0, prof, 10, { caps: false });
    k.lathe(0, 0, 0, [[15.4, 356], [13.8, 444]], 10, { caps: false });
    k.color(WHITE);
  }
  // base: three corner leg shoes
  if (hi) {
    for (let v = 0; v < 3; v++) {
      const th = -Math.PI / 2 + v * 2 * Math.PI / 3;
      k.color(WHITE_DK).cyl(Math.cos(th) * TRI_R * 0.97, 0, Math.sin(th) * TRI_R * 0.97, 3.2, 2.2, 40, 8);
    }
    k.color(WHITE);
  }
  k.glow(false);

  const seg = hi ? 40 : 14;
  // Tembo Deck 340-355 m
  k.color(WHITE_DK).lathe(0, 0, 0, [[16.4, 333], [24.5, 339], [26, 340.5]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[26, 340.5], [26.4, 345], [26, 350]], seg, { caps: false });
  k.glow(false).color(WHITE).lathe(0, 0, 0, [[26, 350], [26.6, 350.6], [25.4, 351.5]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[25.4, 351.5], [24.6, 354.5]], seg, { caps: false });
  k.glow(false).color(WHITE_DK).lathe(0, 0, 0, [[24.6, 354.5], [20, 357], [15.6, 358.5]], seg, { caps: false });
  // Tembo Galleria 445-452 m
  k.color(WHITE_DK).lathe(0, 0, 0, [[14, 442], [19.2, 445.5]], seg, { caps: false });
  k.glow(true).color(LIT).lathe(0, 0, 0, [[19.2, 445.5], [19.6, 448.5], [19.2, 451.5]], seg, { caps: false });
  k.glow(false).color(WHITE_DK).lathe(0, 0, 0, [[19.2, 451.5], [13.4, 455]], seg, { caps: false });
  // upper shaft to the gain tower
  k.color(WHITE).lathe(0, 0, 0, [[13.4, 454], [11, 475], [9, 497], [6.5, 500]], seg, { caps: true });
  // gain tower (antenna lattice) 500-625 m and mast
  k.glow(true).color(WHITE);
  if (hi) {
    const n = 8;
    for (let l = 0; l < 12; l++) {
      const ya = 500 + l * 10, yb = ya + 10;
      const ra = 5.2 - l * 0.22, rb = 5.2 - (l + 1) * 0.22;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        const A = [Math.cos(t0) * ra, ya, Math.sin(t0) * ra];
        k.strut(A, [Math.cos(t0) * rb, yb, Math.sin(t0) * rb], 0.55);
        k.strut(A, [Math.cos(t1) * rb, yb, Math.sin(t1) * rb], 0.3);
      }
    }
    k.color(WHITE_DK).cyl(0, 500, 0, 3.2, 2.2, 122, 10);
  } else {
    k.cyl(0, 500, 0, 5.2, 2.6, 122, 6);
  }
  k.glow(false);
  k.color(WHITE).cyl(0, 622, 0, 1.4, 0.4, 12, hi ? 8 : 4);
  if (hi) {
    k.glow(true).color(0xff3020);
    for (const y of [497, 560, 625]) k.sphere(0, y, -6, 0.8, 6, 3);
    k.sphere(0, 633.6, 0, 0.5, 6, 3);
    k.glow(false);
  }
}

/** Iki light-blue night illumination: tint the glow emissive (white lattice -> blue at night). */
export function setup({ mats }) {
  if (mats && mats.glow) mats.glow.emissive.setHex(0x5aa8ff);
  return null;
}
