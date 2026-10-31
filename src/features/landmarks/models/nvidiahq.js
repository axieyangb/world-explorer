// feature/famous-landmarks: NVIDIA HQ — Endeavor & Voyager, Santa Clara — 1:1 (37.3707, -121.9642).
// Gensler-designed twin polyhedral triangular headquarters buildings (Endeavor & Voyager):
// angled perimeter glass curtain walls, giant multi-faceted triangular space-frame roof canopies
// studded with triangular skylight lattices, glowing NVIDIA green (#76B900) architectural trim,
// landscaped creek bridge plaza, and a monumental 3D NVIDIA eye-logo & block-letter sign.

const NV_GREEN = 0x76b900, NV_GLOW = 0x92e000;
const ROOF_A = 0xe8ecf0, ROOF_B = 0xd2dae2;
const SKYLIGHT = 0x99c9e8, GLASS = 0x3b5369;
const STEEL = 0xcbd2da, DARK = 0x1f252c, PAVE = 0xd6d2c8, LAWN = 0x4c8544, LIT = 0xeffad6;

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 2.1;

export const colliders = [
  { x: -66, z: 24, r: 64, h: 25 },  // Endeavor (SW triangle building)
  { x: 64, z: -20, r: 74, h: 28 },  // Voyager (NE polyhedral triangle building)
];

/** 3D block letter for "N V I D I A" centred at (cx, y0, z). */
function nvidiaLetter(k, ch, cx, y0, z, w, h, d) {
  const t = w * 0.24;
  if (ch === "N") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx + w / 2 - t / 2, y0, z, t, h, d);
    k.strut([cx - w / 2 + t / 2, y0 + h - t * 0.5, z], [cx + w / 2 - t / 2, y0 + t * 0.5, z], t);
  } else if (ch === "V") {
    k.strut([cx - w / 2 + t / 2, y0 + h, z], [cx, y0 + t * 0.4, z], t);
    k.strut([cx + w / 2 - t / 2, y0 + h, z], [cx, y0 + t * 0.4, z], t);
  } else if (ch === "I") {
    k.box(cx, y0, z, t * 1.15, h, d);
  } else if (ch === "D") {
    k.box(cx - w / 2 + t / 2, y0, z, t, h, d);
    k.box(cx - t * 0.3, y0 + h - t, z, w * 0.78, t, d);
    k.box(cx - t * 0.3, y0, z, w * 0.78, t, d);
    k.box(cx + w / 2 - t / 2, y0 + t * 0.8, z, t, h - t * 1.6, d);
  } else if (ch === "A") {
    k.strut([cx - w / 2 + t / 2, y0, z], [cx, y0 + h - t * 0.3, z], t);
    k.strut([cx + w / 2 - t / 2, y0, z], [cx, y0 + h - t * 0.3, z], t);
    k.box(cx, y0 + h * 0.4, z, w * 0.62, t * 0.85, d);
  }
}

/**
 * Polyhedral triangular NVIDIA HQ building (Endeavor or Voyager):
 * - 3 chamfered base corners at radius R, rotated by rot
 * - outward-leaning glass curtain walls from y=0 to yEave
 * - multi-ring triangular faceted roof rising to yPeak with glowing triangular skylight apertures
 */
function polyhedralTriangleBuilding(k, cx, cz, R, yEave, yPeak, rot) {
  const hi = k.hi;
  const TAU = Math.PI * 2;
  k.push().translate(cx, 0, cz).rotateY(rot);

  // 6-vertex chamfered triangle footprint (3 long sides + 3 clipped corners)
  const verts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    const aL = a - 0.14, aR = a + 0.14;
    verts.push([Math.cos(aL) * R, Math.sin(aL) * R]);
    verts.push([Math.cos(aR) * R, Math.sin(aR) * R]);
  }

  // Plinth base
  k.glow(false).color(PAVE).extrude(verts.map(([x, z]) => [x * 1.04, z * 1.04]), -2.5, 2.9);

  // Outward-leaning glass curtain walls + night-lit floor bands
  const nV = verts.length;
  for (let i = 0; i < nV; i++) {
    const j = (i + 1) % nV;
    const b0 = [verts[i][0] * 0.92, 0.4, verts[i][1] * 0.92];
    const b1 = [verts[j][0] * 0.92, 0.4, verts[j][1] * 0.92];
    const t0 = [verts[i][0], yEave, verts[i][1]];
    const t1 = [verts[j][0], yEave, verts[j][1]];
    const nx = (verts[i][0] + verts[j][0]) * 0.5, nz = (verts[i][1] + verts[j][1]) * 0.5;
    k.glow(false).color(GLASS).quadN(b0, b1, t1, t0, [nx, 0, nz]);

    // Glowing interior floor strips & NVIDIA green roofline accent ribbon
    for (const frac of [0.25, 0.62]) {
      const f0 = frac, f1 = frac + 0.18;
      const lerpP = (A, B, t) => [
        (A[0] + (B[0] - A[0]) * t) * 1.003,
        A[1] + (B[1] - A[1]) * t,
        (A[2] + (B[2] - A[2]) * t) * 1.003,
      ];
      k.glow(true).color(LIT).quadN(lerpP(b0, t0, f0), lerpP(b1, t1, f0), lerpP(b1, t1, f1), lerpP(b0, t0, f1), [nx, 0, nz]);
    }
    // Glowing NVIDIA Green eave fascia band
    k.glow(true).color(NV_GREEN);
    k.strut([t0[0] * 1.01, yEave, t0[2] * 1.01], [t1[0] * 1.01, yEave, t1[2] * 1.01], 0.95);
  }
  k.glow(false);

  // Polyhedral triangular roof canopy: 3 concentric tiers stepping up to central high skylight clerestory dome
  const tiers = [
    { s: 1.02, y: yEave },
    { s: 0.66, y: yEave + (yPeak - yEave) * 0.48 },
    { s: 0.34, y: yEave + (yPeak - yEave) * 0.84 },
    { s: 0.08, y: yPeak },
  ];
  for (let t = 0; t < tiers.length - 1; t++) {
    const A = tiers[t], B = tiers[t + 1];
    for (let i = 0; i < nV; i++) {
      const j = (i + 1) % nV;
      const p00 = [verts[i][0] * A.s, A.y, verts[i][1] * A.s];
      const p10 = [verts[j][0] * A.s, A.y, verts[j][1] * A.s];
      const p11 = [verts[j][0] * B.s, B.y, verts[j][1] * B.s];
      const p01 = [verts[i][0] * B.s, B.y, verts[i][1] * B.s];
      k.glow(false).color((i + t) % 2 === 0 ? ROOF_A : ROOF_B);
      k.quadN(p00, p10, p11, p01, [0, 1, 0]);

      // Triangular skylight lattice panels set into the long roof facets
      if (i % 2 === 1) {
        const cxm = (p00[0] + p10[0] + p11[0] + p01[0]) * 0.25;
        const cym = (p00[1] + p10[1] + p11[1] + p01[1]) * 0.25 + 0.14;
        const czm = (p00[2] + p10[2] + p11[2] + p01[2]) * 0.25;
        const inset = (P) => [
          cxm + (P[0] - cxm) * 0.62,
          cym + (P[1] - cym) * 0.62,
          czm + (P[2] - czm) * 0.62,
        ];
        const q00 = inset(p00), q10 = inset(p10), q11 = inset(p11), q01 = inset(p01);
        k.glow(true).color(SKYLIGHT);
        k.quadN(q00, q10, q11, q01, [0, 1, 0]);
        if (hi) {
          // Internal triangular space-frame skylight sub-trusses
          k.glow(false).color(STEEL);
          k.strut(q00, q11, 0.24);
          k.strut(q10, q01, 0.24);
          k.strut(
            [(q00[0] + q10[0]) * 0.5, (q00[1] + q10[1]) * 0.5, (q00[2] + q10[2]) * 0.5],
            [(q01[0] + q11[0]) * 0.5, (q01[1] + q11[1]) * 0.5, (q01[2] + q11[2]) * 0.5],
            0.22
          );
        }
      }

      // Crisp white/silver polyhedral ridge struts
      if (hi) {
        k.glow(false).color(STEEL);
        k.strut(p00, p01, 0.55);
        k.strut(p00, p10, 0.45);
        k.strut(p00, p11, 0.38);
      }
    }
  }
  // Top apex cap
  const topPts = verts.map(([x, z]) => [x * 0.08, z * 0.08]);
  k.glow(true).color(SKYLIGHT).extrude(topPts, yPeak - 0.4, 0.6);
  k.glow(false);
  k.pop();
}

export function build(k) {
  // 1. Campus park ground & geometric triangular pathways + San Tomas creek channel
  k.glow(false).color(LAWN).box(0, -2.5, 0, 290, 2.7, 230);
  k.color(PAVE).box(0, 0.2, 0, 120, 0.25, 52);
  k.color(0x285f7a).box(0, 0.15, 0, 16, 0.2, 220); // creek channel between Endeavor & Voyager
  // Geometric bridge across the creek with glowing NVIDIA green side rails
  k.color(PAVE).box(0, 0.4, 4, 34, 0.6, 18);
  k.glow(true).color(NV_GREEN).box(0, 1.0, -4.6, 34, 0.7, 0.5).box(0, 1.0, 12.6, 34, 0.7, 0.5);
  k.glow(false);

  // 2. Endeavor (SW polyhedral triangle building, R=64m, peak 24m)
  polyhedralTriangleBuilding(k, -66, 24, 64, 13.5, 24.5, 0.25);

  // 3. Voyager (NE polyhedral triangle building, R=74m, peak 28m)
  polyhedralTriangleBuilding(k, 64, -20, 74, 15.0, 28.0, Math.PI + 0.25);

  // 4. Monumental NVIDIA Green Claw/Eye Logo + 3D "N V I D I A" Sign at the front plaza
  k.push().translate(0, 0, 62);
  k.glow(false).color(DARK).box(0, 0.2, 0, 48, 1.5, 5.2);
  // Glowing NVIDIA Green eye/spiral emblem monolith on the left of the sign
  k.glow(true).color(NV_GLOW);
  k.box(-19, 1.7, 0, 6.8, 6.8, 1.8);
  k.color(DARK).box(-19, 3.2, 0, 3.8, 3.8, 2.0);
  k.color(NV_GLOW).box(-19, 4.2, 0, 1.8, 1.8, 2.2);

  // 3D "N V I D I A" letters
  const word = ["N", "V", "I", "D", "I", "A"];
  for (let i = 0; i < word.length; i++) {
    k.color(i < 2 ? NV_GLOW : ROOF_A);
    nvidiaLetter(k, word[i], -9.5 + i * 5.6, 1.7, 0, 4.0, 6.0, 1.6);
  }
  k.glow(false);
  k.pop();
}
