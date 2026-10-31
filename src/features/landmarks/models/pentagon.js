// feature/famous-landmarks: The Pentagon, Arlington / Washington DC — 1:1 (38.8719, -77.0563).
// Iconic 5-sided concentric 5-ring (Rings A, B, C, D, E) Indiana limestone headquarters (R_outer = 235 m,
// R_inner = 92 m, H = 22 m), with 10 radial connecting corridors across the light wells, hipped slate roofs
// on every concentric pentagonal ring, Neoclassical River & Mall portico entrances, 9/11 Pentagon Memorial
// illuminated benches & reflecting pools, Metro/Bus Transit Center canopies, and the 5-acre central
// pentagonal courtyard park with the Ground Zero Cafe pavilion at its exact center.

const STONE = 0xebe6da, STONE_SH = 0xd4cec0, ROOF = 0x55606b, ROOF_LT = 0x677380;
const WIN = 0x354452, LAWN = 0x4f8c46, PATH = 0xd9d4c7, TREE = 0x3d7637, LIT = 0xfff1cf;
const WATER = 0x4ea8de, STEEL = 0xc5ced6, BRONZE = 0x5c4f3d;
const TAU = Math.PI * 2;

export const lodDist = 2800;
export const fineDist = 650;
export const glowStrength = 1.85;

const RO = 235, RI = 92, H = 21.8;

// 5 sector box colliders for the 5 outer pentagonal wedges
export const colliders = Array.from({ length: 5 }, (_, s) => {
  const a0 = (s / 5) * TAU - Math.PI / 2;
  const a1 = ((s + 1) / 5) * TAU - Math.PI / 2;
  const am = (a0 + a1) * 0.5;
  const rm = (RO + RI) * 0.5 * Math.cos(Math.PI / 5);
  return {
    x: Math.cos(am) * rm,
    z: Math.sin(am) * rm,
    hw: (RO - RI) * 0.42,
    hd: RO * Math.sin(Math.PI / 5) * 0.92,
    h: H,
    rot: (-am * 180) / Math.PI,
  };
});

/** Builds one concentric 5-sided pentagonal building ring between inner vertex radius rIn and outer vertex radius rOut. */
function pentagonRing(k, rIn, rOut, hWall, hRoof, isOuterOrInner) {
  const hi = k.hi;
  const rMid = (rIn + rOut) * 0.5;
  const vIn = [], vOut = [], vMid = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    vIn.push([c * rIn, s * rIn]);
    vOut.push([c * rOut, s * rOut]);
    vMid.push([c * rMid, s * rMid]);
  }

  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    const am = ((i + 0.5) / 5) * TAU - Math.PI / 2;
    const nx = Math.cos(am), nz = Math.sin(am);
    const tx = -nz, tz = nx;

    const oi0 = [vOut[i][0], 0.4, vOut[i][1]], oi1 = [vOut[j][0], 0.4, vOut[j][1]];
    const ot0 = [vOut[i][0], hWall, vOut[i][1]], ot1 = [vOut[j][0], hWall, vOut[j][1]];
    const ii0 = [vIn[i][0], 0.4, vIn[i][1]], ii1 = [vIn[j][0], 0.4, vIn[j][1]];
    const it0 = [vIn[i][0], hWall, vIn[i][1]], it1 = [vIn[j][0], hWall, vIn[j][1]];
    const pk0 = [vMid[i][0], hWall + hRoof, vMid[i][1]], pk1 = [vMid[j][0], hWall + hRoof, vMid[j][1]];

    // Outer & inner limestone walls of this ring
    k.glow(isOuterOrInner).color(STONE).quadN(oi0, oi1, ot1, ot0, [nx, 0, nz]);
    k.color(STONE_SH).quadN(ii0, ii1, it1, it0, [-nx, 0, -nz]);

    // Glowing night window bands along the outer & inner ring walls
    if (hi || isOuterOrInner) {
      k.glow(true).color(LIT);
      for (const yf of [3.5, 9.5, 15.5]) {
        const f0 = yf / hWall, f1 = (yf + 2.4) / hWall;
        const lerp = (A, B, t, push) => [
          A[0] + (B[0] - A[0]) * t + nx * push,
          A[1] + (B[1] - A[1]) * t,
          A[2] + (B[2] - A[2]) * t + nz * push,
        ];
        k.quadN(lerp(oi0, ot0, f0, 0.18), lerp(oi1, ot1, f0, 0.18), lerp(oi1, ot1, f1, 0.18), lerp(oi0, ot0, f1, 0.18), [nx, 0, nz]);
        k.quadN(lerp(ii0, it0, f0, -0.18), lerp(ii1, it1, f0, -0.18), lerp(ii1, it1, f1, -0.18), lerp(ii0, it0, f1, -0.18), [-nx, 0, -nz]);
      }
    }

    // Hipped slate roof (outer slope + inner slope meeting at ridge pk0..pk1)
    k.glow(false).color(ROOF).quadN(ot0, ot1, pk1, pk0, [nx * 0.3, 1, nz * 0.3]);
    k.color(ROOF_LT).quadN(it0, it1, pk1, pk0, [-nx * 0.3, 1, -nz * 0.3]);

    // Close-up vertical limestone piers & slate-roof dormer windows on outer/inner rings
    if (hi && isOuterOrInner) {
      k.color(STONE_SH);
      const nPiers = rOut > 200 ? 18 : 10;
      for (let p = 1; p < nPiers; p++) {
        const u = p / nPiers;
        const px = oi0[0] + (oi1[0] - oi0[0]) * u + nx * 0.25;
        const pz = oi0[2] + (oi1[2] - oi0[2]) * u + nz * 0.25;
        k.box(px, 0.4, pz, 0.9, hWall, 0.9);
      }
      // Copper ridge cap & dormer housings along the hipped slate roof
      k.color(BRONZE).strut([pk0[0], pk0[1] + 0.12, pk0[2]], [pk1[0], pk1[1] + 0.12, pk1[2]], 0.45);
      for (let d = 1; d <= 5; d++) {
        const u = d / 6;
        const dx = (ot0[0] + pk0[0]) * 0.5 * (1 - u) + (ot1[0] + pk1[0]) * 0.5 * u;
        const dz = (ot0[2] + pk0[2]) * 0.5 * (1 - u) + (ot1[2] + pk1[2]) * 0.5 * u;
        k.color(STONE).box(dx + tx * 0.1, hWall + 0.8, dz + tz * 0.1, 2.2, 1.6, 2.2);
        k.color(ROOF_LT).pyramid(dx + tx * 0.1, hWall + 2.4, dz + tz * 0.1, 2.5, 2.5, 0.8);
      }
    }
  }
}

export function build(k) {
  const hi = k.hi;

  // 1. Pentagonal stone base plinth & 5-acre central courtyard lawn
  const basePts = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * TAU - Math.PI / 2;
    return [Math.cos(a) * (RO + 28), Math.sin(a) * (RO + 28)];
  });
  const courtPts = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * TAU - Math.PI / 2;
    return [Math.cos(a) * (RI - 1), Math.sin(a) * (RI - 1)];
  });
  k.glow(false).color(PATH).extrude(basePts, -3.0, 3.4);
  k.color(LAWN).extrude(courtPts, 0.3, 0.25);

  // 2. Five concentric pentagonal building rings: E (outer) -> D -> C -> B -> A (inner)
  const rings = [
    [214, 235, true],   // Ring E (outermost monumental limestone facade)
    [184, 203, false],  // Ring D
    [154, 173, false],  // Ring C
    [124, 143, false],  // Ring B
    [92, 113, true],    // Ring A (innermost ring facing courtyard)
  ];
  for (const [rIn, rOut, isEdge] of rings) {
    pentagonRing(k, rIn, rOut, 18.8, 3.2, isEdge);
  }

  // 3. 10 radial connecting corridors spanning from Ring A to Ring E
  k.glow(false).color(STONE_SH);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    const r0 = 96 * (i % 2 === 0 ? 1 : Math.cos(Math.PI / 5));
    const r1 = 228 * (i % 2 === 0 ? 1 : Math.cos(Math.PI / 5));
    k.strut([c * r0, 9.2, s * r0], [c * r1, 9.2, s * r1], 14.5);
    if (hi) {
      k.color(ROOF).strut([c * r0, 17.5, s * r0], [c * r1, 17.5, s * r1], 11.2).color(STONE_SH);
    }
  }

  // 4. Monumental Neoclassical Portico Entrances on the outer E-Ring faces (River, Mall, Metro, Heliport, Memorial)
  for (let s = 0; s < 5; s++) {
    const am = ((s + 0.5) / 5) * TAU - Math.PI / 2;
    const rm = RO * Math.cos(Math.PI / 5) + 1.8;
    k.push().translate(Math.cos(am) * rm, 0.4, Math.sin(am) * rm).rotateY(-am + Math.PI / 2);
    k.glow(true).color(STONE).box(0, 0, 0, 42, 20.5, 6.5);
    k.color(STONE_SH).box(0, 20.5, 0, 44, 1.5, 7.5);
    if (hi) {
      k.glow(false);
      for (let st = 0; st < 4; st++) {
        k.color(st % 2 ? STONE : STONE_SH).box(0, st * 0.25, -4.5 + st * 0.7, 38 - st * 1.2, 0.28, 3.2);
      }
      for (let c = -4; c <= 4; c++) {
        k.color(STONE).cyl(c * 4.2, 0.4, -3.4, 0.68, 0.58, 18.8, 10);
        k.color(STONE_SH).box(c * 4.2, 0.4, -3.4, 1.55, 0.65, 1.55);
        k.box(c * 4.2, 18.7, -3.4, 1.6, 0.65, 1.6);
      }
      for (let d = -2; d <= 2; d++) {
        k.color(BRONZE).box(d * 6.5, 0.8, -3.28, 2.8, 4.2, 0.25);
        k.glow(true).color(LIT).box(d * 6.5, 5.4, -3.28, 2.6, 1.8, 0.22).glow(false);
      }
      k.color(STONE).box(0, 22.0, -1.2, 26, 2.2, 4.5);
      k.color(STEEL).cyl(0, 24.2, -2.5, 0.12, 0.06, 9.5, 6);
    }
    k.pop();
  }

  // 5. Close-up 9/11 Pentagon Memorial (West Lawn, sector s = 3) & Metro/Bus Transit Canopies (South-East, s = 1)
  if (hi) {
    const aMem = ((3 + 0.5) / 5) * TAU - Math.PI / 2;
    const rMem = RO * Math.cos(Math.PI / 5) + 15.5;
    k.push().translate(Math.cos(aMem) * rMem, 0.4, Math.sin(aMem) * rMem).rotateY(-aMem + Math.PI / 2);
    k.glow(false).color(PATH).box(0, 0.02, -4, 68, 0.16, 16);
    for (let r = 0; r < 3; r++) {
      for (let b = -5; b <= 5; b++) {
        const bx = b * 5.4 + (r % 2) * 2.2, bz = -1.2 - r * 4.2;
        k.glow(true).color(WATER).box(bx, 0.18, bz, 3.2, 0.18, 0.95);
        k.glow(false).color(STEEL).strut([bx - 1.5, 0.35, bz], [bx + 1.5, 0.85, bz], 0.42);
      }
    }
    for (let t = -4; t <= 4; t += 2) {
      k.color(0x583e26).cyl(t * 7.2, 0.2, -9.5, 0.28, 0.18, 2.4, 5);
      k.color(TREE).sphere(t * 7.2, 3.4, -9.5, 2.2, 7, 5, 0.85);
    }
    k.pop();

    const aMet = ((1 + 0.5) / 5) * TAU - Math.PI / 2;
    const rMet = RO * Math.cos(Math.PI / 5) + 15.0;
    k.push().translate(Math.cos(aMet) * rMet, 0.4, Math.sin(aMet) * rMet).rotateY(-aMet + Math.PI / 2);
    for (const zBus of [-3.5, -9.5]) {
      k.glow(false).color(STEEL).box(0, 4.2, zBus, 54, 0.45, 3.6);
      k.glow(true).color(LIT).box(0, 4.0, zBus, 52, 0.15, 2.4).glow(false);
      for (let c = -4; c <= 4; c++) {
        k.color(STEEL).cyl(c * 6.0, 0.2, zBus, 0.22, 0.22, 4.0, 6);
      }
    }
    k.pop();
  }

  // 6. Central Courtyard Ground Zero Cafe octagonal pavilion & radial paths + trees + outdoor umbrella tables
  k.glow(false).color(PATH);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    k.strut([0, 0.6, 0], [Math.cos(a) * (RI - 4), 0.6, Math.sin(a) * (RI - 4)], 4.5);
  }
  if (hi) {
    k.color(PATH).cyl(0, 0.52, 0, 21.0, 21.0, 0.12, 16);
    k.color(STONE).cyl(0, 8.8, 0, 4.2, 4.2, 2.2, 8);
    k.glow(true).color(LIT).cyl(0, 9.1, 0, 4.3, 4.3, 1.4, 8).glow(false);
    k.color(ROOF).cone(0, 11.0, 0, 4.8, 2.4, 8);
    for (let u = 0; u < 10; u++) {
      const ua = (u / 10) * TAU;
      const ux = Math.cos(ua) * 16.8, uz = Math.sin(ua) * 16.8;
      k.color(STEEL).cyl(ux, 0.6, uz, 0.12, 0.12, 2.4, 5);
      k.color(0xdfd9ce).cyl(ux, 1.3, uz, 1.1, 1.1, 0.12, 6);
      k.color(u % 2 ? 0x9e342b : 0x2b547e).cone(ux, 2.8, uz, 2.1, 0.85, 8);
    }
  }
  k.glow(true).color(STONE).cyl(0, 0.55, 0, 12.5, 12.5, 5.2, 8);
  k.glow(false).color(ROOF).cyl(0, 5.75, 0, 13.5, 1.2, 3.2, 8);

  const nTrees = hi ? 28 : 10;
  for (let i = 0; i < nTrees; i++) {
    const a = i * 2.39996, r = 24 + ((i * 17) % 50);
    const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
    k.color(0x583e26).cyl(tx, 0.5, tz, 0.42, 0.28, 3.0, 5);
    k.color(TREE).sphere(tx, 5.0, tz, 3.6 + (i % 3) * 0.6, hi ? 8 : 5, 5, 0.85);
  }
  k.glow(false);
}
