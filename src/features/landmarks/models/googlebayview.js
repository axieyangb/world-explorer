// feature/famous-landmarks: Google Bay View Campus, Mountain View — 1:1 (37.4184, -122.0575).
// BIG (Bjarke Ingels Group) & Heatherwick Studio dragonscale catenary canopy campus:
// sweeping silver-grey curved catenary solar roof domes supported on angled piers with curved
// clerestory window bands between every catenary wave, perimeter glass curtain walls, courtyard bridge,
// colorful Google-palette plaza parasols, and a 3D GOOGLE monument sculpture.

const G_BLUE = 0x4285f4, G_RED = 0xea4335, G_YELLOW = 0xfbbc05, G_GREEN = 0x34a853;
const G_COLS = [G_BLUE, G_RED, G_YELLOW, G_GREEN, G_BLUE, G_RED];
const SCALE_A = 0xdce2e9, SCALE_B = 0xc5ced8, SCALE_DK = 0x9aa6b4;
const GLASS = 0x4e6c86, GLASS_LT = 0x86a9c7, STEEL = 0xcfd5dc;
const LAWN = 0x528d49, PAVE = 0xdad5ca, LIT = 0xfff2d2, WHITE = 0xf7f8fa;

export const lodDist = 2400;
export const fineDist = 600;
export const glowStrength = 1.9;

export const colliders = [
  { x: -45, z: 0, hw: 88, hd: 68, h: 25 },
  { x: 96, z: 10, hw: 52, hd: 46, h: 21 },
];

/** Sweeping multi-bay catenary dragonscale canopy building. */
function dragonscaleCanopyBuilding(k, cx, cz, w, d, hPeak, baysX, baysZ) {
  const hi = k.hi;
  const nx = hi ? baysX * 6 : baysX * 3;
  const nz = hi ? baysZ * 6 : baysZ * 3;
  k.push().translate(cx, 0, cz);

  // Lower 2-story glass curtain-wall base volume & glowing night interior
  k.glow(false).color(PAVE).box(0, -2.5, 0, w * 0.92, 2.9, d * 0.92);
  k.color(GLASS).box(0, 0.4, 0, w * 0.84, 8.8, d * 0.84);
  k.glow(true).color(LIT);
  k.box(0, 1.4, 0, w * 0.85, 2.6, d * 0.82);
  k.box(0, 5.2, 0, w * 0.82, 2.6, d * 0.85);
  k.glow(false);

  // Catenary wave height function: overall dome envelope modulated by baysX x baysZ catenary peaks
  const roofY = (u, v) => {
    const env = Math.max(0.12, 1 - 0.62 * (u * u + v * v));
    const wx = Math.cos(u * baysX * Math.PI * 0.5 * 2);
    const wz = Math.cos(v * baysZ * Math.PI * 0.5 * 2);
    const cat = 0.5 + 0.5 * wx * wz;
    return 6.8 + (hPeak - 6.8) * env * (0.62 + 0.38 * cat);
  };

  for (let ix = 0; ix < nx; ix++) {
    const u0 = -1 + (2 * ix) / nx, u1 = -1 + (2 * (ix + 1)) / nx;
    const x0 = u0 * (w / 2), x1 = u1 * (w / 2);
    for (let iz = 0; iz < nz; iz++) {
      const v0 = -1 + (2 * iz) / nz, v1 = -1 + (2 * (iz + 1)) / nz;
      const z0 = v0 * (d / 2), z1 = v1 * (d / 2);
      const p00 = [x0, roofY(u0, v0), z0], p10 = [x1, roofY(u1, v0), z0];
      const p11 = [x1, roofY(u1, v1), z1], p01 = [x0, roofY(u0, v1), z1];
      // Dragonscale solar shimmer pattern
      k.color((ix + iz) % 3 === 0 ? SCALE_A : (ix + iz) % 3 === 1 ? SCALE_B : SCALE_DK);
      k.quadN(p00, p10, p11, p01, [0, 1, 0]);
    }
  }

  // Clerestory window bands rising under the catenary wave peaks (glowing warmly at night)
  for (let bx = 0; bx < baysX; bx++) {
    const u = -1 + ((2 * bx + 1) / baysX);
    const x = u * (w * 0.42);
    for (let bz = 0; bz < baysZ; bz++) {
      const v = -1 + ((2 * bz + 1) / baysZ);
      const z = v * (d * 0.42);
      const yTop = roofY(u, v);
      const cw = (w / baysX) * 0.48, cd = (d / baysZ) * 0.48;
      k.glow(true).color(GLASS_LT).box(x, yTop - 3.6, z, cw, 2.2, cd);
      if (hi) {
        // Eyebrow clerestory arch frame & vertical structural mullions
        k.glow(false).color(STEEL);
        k.box(x, yTop - 1.35, z, cw + 1.2, 0.38, cd + 1.2);
        for (let m = -2; m <= 2; m++) {
          k.box(x + m * (cw * 0.2), yTop - 3.6, z + cd * 0.5, 0.22, 2.2, 0.28);
          k.box(x + m * (cw * 0.2), yTop - 3.6, z - cd * 0.5, 0.22, 2.2, 0.28);
        }
      }
    }
  }
  k.glow(false);

  // Angled perimeter steel V-piers anchoring the catenary canopy eaves to the ground plaza
  k.color(STEEL);
  const nPiers = hi ? 10 : 5;
  for (let i = 0; i <= nPiers; i++) {
    const u = -0.92 + (1.84 * i) / nPiers;
    const x = u * (w / 2);
    for (const sz of [-1, 1]) {
      const z = sz * (d / 2);
      k.strut([x * 0.94, 0.2, z * 0.9], [x, roofY(u, sz), z], 0.65);
    }
  }
  k.pop();
}

export function build(k) {
  // Open central courtyard promenade between the canopies (flush with surrounding terrain)
  k.glow(false).color(LAWN).box(28, -0.3, 0, 190, 0.36, 76);
  k.color(PAVE).box(25, -0.2, 0, 220, 0.30, 42);

  // Main West Dragonscale Canopy (3x3 catenary dome matrix, 180m x 140m, 25m tall)
  dragonscaleCanopyBuilding(k, -45, 0, 180, 140, 25.0, 3, 3);

  // East Dragonscale Canopy (2x2 catenary dome matrix, 108m x 96m, 21m tall)
  dragonscaleCanopyBuilding(k, 96, 10, 108, 96, 21.0, 2, 2);

  // Covered courtyard bridge & colorful Google parasols between the two canopies
  k.color(SCALE_A).box(32, 6.2, 4, 28, 0.8, 14);
  for (let i = 0; i < 6; i++) {
    const px = 22 + (i % 3) * 10, pz = -18 + Math.floor(i / 3) * 36;
    k.glow(true).color(G_COLS[i]).cyl(px, 3.4, pz, 3.4, 0.2, 1.2, 8);
  }

  // Colorful 3D GOOGLE monument sign on the south entrance plaza
  k.glow(true).color(WHITE).box(28, 0.3, -58, 38, 1.2, 4.0);
  for (let i = 0; i < 6; i++) {
    k.color(G_COLS[i]).box(28 + (i - 2.5) * 5.4, 1.5, -58, 4.0, 5.6, 1.6);
  }
  k.glow(false);
}
