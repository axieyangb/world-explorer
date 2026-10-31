// feature/famous-landmarks: Eiffel Tower, Paris — 1:1 (330 m incl. antennas, 125 m square base).
// Four curved lattice legs joined by the decorative arches, platforms at 57.6 / 115.7 / 276 m,
// single lattice shaft above ~180 m. Lattice glows gold at night with a periodic white sparkle.
const BRONZE = 0x7d6650, BRONZE_DK = 0x5e4b3b, DECK = 0x6a5644, CABIN = 0x8a7764;

export const lodDist = 1500;
export const glowStrength = 3.0;

export const colliders = [
  { x: 49.5, z: 49.5, hw: 13, hd: 13, h: 57.6 },
  { x: -49.5, z: 49.5, hw: 13, hd: 13, h: 57.6 },
  { x: 49.5, z: -49.5, hw: 13, hd: 13, h: 57.6 },
  { x: -49.5, z: -49.5, hw: 13, hd: 13, h: 57.6 },
  { x: 0, z: 0, hw: 17, hd: 17, h: 280 },
  { x: 0, z: 0, r: 3, h: 330 },
];

// outer half-width of the tower silhouette at height y
const HW = [[0, 62.5], [20, 52.5], [40, 44], [57.6, 37.5], [80, 30], [115.7, 21.5], [150, 15.2], [180, 11.6], [220, 8.6], [250, 6.9], [276, 5.6], [300, 3.6]];
function hw(y) {
  for (let i = 0; i < HW.length - 1; i++) {
    const [y0, a] = HW[i], [y1, b] = HW[i + 1];
    if (y <= y1) { const t = (y - y0) / (y1 - y0); return a + (b - a) * t; }
  }
  return HW[HW.length - 1][1];
}
// leg width (from the outer corner toward the centre) — legs merge into one shaft at ~180 m
function lw(y) { return y < 180 ? 25.5 - (y / 180) * 14 : hw(y); }

function legLattice(k, sx, sz, y0, y1, levels, chord, diag) {
  // corners of one leg cross-section at height y: outer corner (sx*hw, sz*hw) and inner square of width lw
  const ring = (y) => {
    const o = hw(y), w = Math.min(lw(y), o);
    const i = o - w;
    return [[sx * o, y, sz * o], [sx * i, y, sz * o], [sx * i, y, sz * i], [sx * o, y, sz * i]];
  };
  lattice(k, ring, y0, y1, k.fine ? levels * 2 : levels, chord, diag);
}

function shaftLattice(k, y0, y1, levels) {
  const ring = (y) => { const o = hw(y); return [[o, y, o], [-o, y, o], [-o, y, -o], [o, y, -o]]; };
  lattice(k, ring, y0, y1, k.fine ? levels * 2 : levels, 1.25, 0.55);
}

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
/**
 * [lm-materials] Wrought-iron lattice between rings of 4 corners: each corner post is a laced box girder (four
 * angle chords + zig-zag lacing), each face a double-X web with a centre post, horizontals at every level.
 */
function lattice(k, ring, y0, y1, levels, chord, diag) {
  let prev = ring(y0);
  for (let l = 1; l <= levels; l++) {
    const y = y0 + ((y1 - y0) * l) / levels;
    const cur = ring(y);
    const t = 1 - y / 330;
    const ch = chord * (0.55 + 0.45 * t), dg = diag * (0.6 + 0.4 * t);
    for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4;
      if (k.fine) {
        // corner girder: four angle chords round the corner line, laced on two faces
        const o = ch * 0.38;
        const off = [[o, o], [-o, o], [-o, -o], [o, -o]];
        for (const [ox, oz] of off) k.strut([prev[c][0] + ox, prev[c][1], prev[c][2] + oz], [cur[c][0] + ox, cur[c][1], cur[c][2] + oz], ch * 0.3);
        const sgn = l % 2 ? 1 : -1;
        k.strut([prev[c][0] + o, prev[c][1], prev[c][2] - o * sgn], [cur[c][0] + o, cur[c][1], cur[c][2] + o * sgn], ch * 0.16);
        k.strut([prev[c][0] - o * sgn, prev[c][1], prev[c][2] + o], [cur[c][0] + o * sgn, cur[c][1], cur[c][2] + o], ch * 0.16);
        // face web: double X + centre post, and the level horizontal
        const mp = mid(prev[c], prev[n]), mc = mid(cur[c], cur[n]);
        k.strut(mp, mc, dg * 0.7);
        k.strut(prev[c], mc, dg).strut(mp, cur[c], dg).strut(mp, cur[n], dg).strut(prev[n], mc, dg);
        k.strut(cur[c], cur[n], dg * 0.8);
      } else {
        k.strut(prev[c], cur[c], ch);
        if (k.hi) k.strut(prev[c], cur[n], dg).strut(prev[n], cur[c], dg).strut(cur[c], cur[n], dg * 0.8);
      }
    }
    prev = cur;
  }
}

function platformFrame(k, y, h, outer, inner, color) {
  const w = outer - inner;
  k.color(color);
  k.box(0, y, -(inner + w / 2), outer * 2, h, w);
  k.box(0, y, inner + w / 2, outer * 2, h, w);
  k.box(-(inner + w / 2), y, 0, w, h, inner * 2);
  k.box(inner + w / 2, y, 0, w, h, inner * 2);
}

export function build(k) {
  const hi = k.hi;
  k.glow(true).color(BRONZE); // lattice: lit bronze by day, golden at night
  if (hi) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      legLattice(k, sx, sz, 0, 57.6, 7, 2.6, 0.9);
      legLattice(k, sx, sz, 57.6, 115.7, 8, 2.1, 0.75);
      legLattice(k, sx, sz, 115.7, 180, 9, 1.7, 0.6);
      // Inclined masonry foundation shoes at the 4 leg corners + inclined hydraulic lift tracks & glowing cabins
      const o0 = hw(0), w0 = lw(0), m0 = o0 - w0 / 2;
      const o1 = hw(57.6), w1 = lw(57.6), m1 = o1 - w1 / 2;
      const o2 = hw(115.7), w2 = lw(115.7), m2 = o2 - w2 / 2;
      k.glow(false).color(0xb8b0a0).taper(sx * m0, -2, sz * m0, w0 * 0.95, w0 * 0.95, w0 * 0.82, w0 * 0.82, 4.5);
      k.glow(true).color(BRONZE_DK);
      k.strut([sx * m0, 2, sz * m0], [sx * m1, 57.6, sz * m1], 0.45);
      k.strut([sx * m1, 57.6, sz * m1], [sx * m2, 115.7, sz * m2], 0.38);
      // Glowing double-deck Funicular Elevator cabin ascending each leg
      const tCab = 0.45 + (sx > 0 ? 0.15 : 0) + (sz > 0 ? 0.1 : 0);
      const cy = 57.6 * tCab, cm = m0 + (m1 - m0) * tCab;
      k.color(0xffe096).box(sx * cm, cy, sz * cm, 2.6, 3.8, 2.6);
      k.color(BRONZE);
    }
    shaftLattice(k, 180, 276, 16);
    // decorative arches on each face under the first platform
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      // decorative arch: two curved booms 2.2 m apart laced by a zig-zag web, ornamental hangers up to the frieze
      const pts = [], pin = [], N = k.fine ? 32 : 16;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = -37 + 74 * t;
        const y = 39 - 30 * Math.pow(Math.abs(2 * t - 1), 2.2);
        pts.push([x, y, -hw(y) + 1.0]);
        pin.push([x, y + 2.2, -hw(y + 2.2) + 1.0]);
      }
      k.tube(pts, 0.55, 6);
      // 72 Golden Engraved Names of French Scientists (18 gilded relief plaques along each of the 4 first-floor friezes)
      k.color(0xe2b857);
      for (let s = 0; s < 18; s++) {
        const sx = -33.5 + s * (67 / 17);
        k.box(sx, 53.3, -hw(53.5) + 0.35, 2.6, 0.65, 0.18);
      }
      k.color(BRONZE);
      if (!k.fine) { for (let i = 1; i < N; i += 2) k.strut(pts[i], [pts[i][0], 55, -hw(55) + 1.0], 0.35); k.pop(); continue; }
      k.tube(pin, 0.45, 6);
      for (let i = 0; i < N; i++) k.strut(i % 2 ? pts[i] : pin[i], i % 2 ? pin[i + 1] : pts[i + 1], 0.22);
      for (let i = 2; i < N - 1; i += 2) {
        k.strut(pin[i], [pin[i][0], 55, -hw(55) + 1.0], 0.26);
        if (i % 4 === 0) k.pipe([pin[i][0], (pin[i][1] + 55) / 2 - 0.6, -hw(48) + 0.9], [pin[i][0], (pin[i][1] + 55) / 2 + 0.6, -hw(48) + 0.9], 0.7, 8);
      }
      // the frieze girder under the first platform
      k.strut([-37, 52, -hw(52) + 1.0], [37, 52, -hw(52) + 1.0], 1.1).strut([-37, 55, -hw(55) + 1.0], [37, 55, -hw(55) + 1.0], 0.8);
      k.pop();
    }
  } else {
    // far impostor: solid tapered legs + shaft (reads as the silhouette at distance)
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const seg = [[0, 57.6], [57.6, 115.7], [115.7, 180]];
      for (const [a, b] of seg) {
        const oa = hw(a), ob = hw(b), wa = Math.min(lw(a), oa) * 0.8, wb = Math.min(lw(b), ob) * 0.8;
        k.taper(sx * (oa - wa / 2), a, sz * (oa - wa / 2), wa, wa, wb, wb, b - a, sx * ((ob - wb / 2) - (oa - wa / 2)), sz * ((ob - wb / 2) - (oa - wa / 2)));
      }
    }
    k.taper(0, 180, 0, hw(180) * 1.6, hw(180) * 1.6, hw(276) * 1.6, hw(276) * 1.6, 96);
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; const y = 39 - 30 * Math.pow(Math.abs(2 * t - 1), 2.2); pts.push([-37 + 74 * t, y, -hw(y) + 1]); }
      k.tube(pts, 1.4, 3);
      k.pop();
    }
  }
  k.glow(false);

  // platforms
  platformFrame(k, 52.5, 5.1, 36.5, 22.5, DECK);
  if (hi) {
    platformFrame(k, 57.6, 1.8, 36.8, 35.6, BRONZE_DK); // railing band
    // 1st Floor Madame Brasserie / Pavillon Ferrié glazed pavilions & central glass floor rim
    for (const f of [0, 1, 2, 3]) {
      k.push().rotateY((f * Math.PI) / 2);
      k.color(CABIN).box(0, 57.6, -29.5, 36, 4.6, 9.5);
      k.glow(true).color(0xffe5ad).box(0, 58.4, -34.3, 34, 2.8, 0.25);
      k.glow(false).color(BRONZE_DK).taper(0, 62.2, -29.5, 37, 10.2, 34, 7.5, 1.4);
      k.pop();
    }
    // Historic gilded Bust of Gustave Eiffel by Bourdelle at the foot of the North Pillar
    k.color(0xb8b0a0).box(-38, 0, -54, 1.6, 2.6, 1.6);
    k.glow(true).color(0xe2b857).sphere(-38, 3.0, -54, 0.45, 6, 4);
    k.glow(false);
  }
  platformFrame(k, 112.5, 3.2, 21.6, 11.5, DECK);
  if (hi) {
    k.color(CABIN).box(0, 115.7, 0, 13, 4.5, 13);      // 2nd floor lift landing & Le Jules Verne restaurant
    k.glow(true).color(0xffe5ad).box(0, 116.5, 0, 13.4, 2.4, 13.4);
    k.glow(false).color(DECK).box(0, 120.2, 0, 19.5, 1.4, 19.5); // upper 2nd-floor observation deck
    k.color(BRONZE_DK).box(0, 57.6, 0, 10, 2.5, 10);
  }
  // top: observation deck, cabins, roof and antennas
  k.color(DECK).box(0, 274, 0, 16.5, 2.4, 16.5);
  k.color(CABIN).box(0, 276.4, 0, 12.5, 5.2, 12.5);
  k.color(BRONZE_DK).box(0, 281.6, 0, 9.5, 4.5, 9.5);
  k.glow(true).color(BRONZE);
  k.taper(0, 286.1, 0, 7.2, 7.2, 4.0, 4.0, 14);
  k.glow(false);
  k.color(0xb8b2a8).cyl(0, 300, 0, 1.6, 1.1, 12, hi ? 10 : 5);
  k.color(0xc9c4ba).cyl(0, 312, 0, 0.8, 0.35, 18, hi ? 8 : 4);
  if (hi) {
    k.color(0xd9d4ca);
    for (let i = 0; i < 4; i++) k.box(0, 304 + i * 3.4, 0, 2.6, 0.5, 2.6);
  }
  // beacon at the top
  k.glow(true).color(0xfff2c8).sphere(0, 301.5, 0, hi ? 2.0 : 2.6, hi ? 8 : 5, hi ? 5 : 3);
  k.glow(false);
}

/** Night sparkle: a few thousand bulbs twinkling for 10 s at the start of every minute. */
export function setup({ THREE, parts, group }) {
  const mains = parts("main");
  if (!mains.length) return null;
  const host = group; // [lm-materials] on the LOD itself (not a level), so the bulbs twinkle at every distance
  const sets = [];
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let n = 0; n < 4; n++) {
    const pos = [];
    for (let i = 0; i < 700; i++) {
      const y = Math.pow(rnd(), 1.35) * 300;
      const o = hw(y) * (0.92 + rnd() * 0.08);
      const side = Math.floor(rnd() * 4);
      const u = (rnd() * 2 - 1) * o;
      const p = side === 0 ? [u, y, o] : side === 1 ? [u, y, -o] : side === 2 ? [o, y, u] : [-o, y, u];
      pos.push(p[0], p[1], p[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    pts.visible = false;
    pts.frustumCulled = false;
    host.add(pts);
    sets.push(pts);
  }
  return {
    update(dt, t, night) {
      const on = night > 0.6 && (t % 60) < 10;
      for (const s of sets) s.visible = on && Math.random() < 0.5;
    },
  };
}
