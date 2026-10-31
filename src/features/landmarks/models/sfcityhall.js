// feature/famous-landmarks: San Francisco City Hall, Civic Center, SF — 1:1 (ground to finial 93.7 m).
// Bakewell & Brown 1915 Beaux-Arts monument: Sierra white granite rectangular palace (119 m x 86 m,
// cornice 26 m) with rusticated ground arcade, monumental Doric colonnade wings, projecting pedimented
// entrance porticos facing Civic Center Plaza (East, -Z at heading 90) and Van Ness Ave (West, +Z),
// stepped square drum podium, circular Corinthian peristyle drum, and the ornate green-patina copper
// & gold-leaf Baroque ribbed dome + tall lantern rising to 94 m.

const GRANITE = 0xeeebe3, GRANITE_SH = 0xd7d2c6, GRANITE_DK = 0xbdb7a9;
const PATINA = 0x4c7e6f, PATINA_DK = 0x386155, GOLD = 0xdfb43c, GOLD_LT = 0xf7d058;
const WIN = 0x32404d, ROOF = 0x6c757e, LIT = 0xfff0cf;
const TAU = Math.PI * 2;

export const lodDist = 2600;
export const fineDist = 600;
export const glowStrength = 1.95;

const W = 118, D = 84, H_BASE = 6.2, H_MAIN = 25.0;

export const colliders = [
  { x: 0, z: 0, hw: W * 0.5, hd: D * 0.5, h: H_MAIN + 3 },
  { x: 0, z: 0, r: 21, h: 66 },
  { x: 0, z: 0, r: 14, h: 94 },
];

/** Projecting Beaux-Arts pedimented portico on the front (-Z) or back (+Z) facade. */
function pedimentPortico(k, sz) {
  const hi = k.hi;
  const zFace = sz * (D * 0.5 + 3.2);
  // Broad granite entrance steps
  k.glow(true).color(GRANITE_SH);
  for (let s = 0; s < 5; s++) {
    k.box(0, -1.5, zFace + sz * (2.6 + s * 1.1), 32 + s * 1.4, H_BASE + 1.5 - s * 1.0, 2.2);
  }
  // Rusticated base arcade block under portico
  k.color(GRANITE_SH).box(0, -2, sz * (D * 0.5 + 1.8), 30, H_BASE + 2, 4.0);
  // 6 giant Doric columns supporting the entablature + triangular pediment
  k.color(GRANITE);
  for (let i = 0; i < 6; i++) {
    const cx = -12.5 + i * 5.0;
    k.cyl(cx, H_BASE, zFace, 0.88, 0.76, H_MAIN - H_BASE - 2.6, hi ? 12 : 6);
    if (hi) k.box(cx, H_MAIN - 3.0, zFace, 2.0, 0.65, 2.0);
  }
  // Entablature + triangular classical pediment with gold-leaf tympanum relief
  const yEnt = H_MAIN - 2.4;
  k.color(GRANITE).box(0, yEnt, sz * (D * 0.5 + 2.0), 31.2, 2.6, 4.6);
  const zPed = sz * (D * 0.5 + 4.1);
  const wPed = 15.6, hPed = 5.4;
  k.color(GRANITE_SH);
  k.quadN([-wPed, yEnt + 2.6, zPed], [wPed, yEnt + 2.6, zPed], [0, yEnt + 2.6 + hPed, zPed], [0, yEnt + 2.6 + hPed, zPed], [0, 0, sz]);
  k.strut([-wPed - 0.5, yEnt + 2.5, zPed], [0, yEnt + 2.9 + hPed, zPed], 0.9);
  k.strut([wPed + 0.5, yEnt + 2.5, zPed], [0, yEnt + 2.9 + hPed, zPed], 0.9);
  if (hi) {
    k.color(GOLD).sphere(0, yEnt + 4.4, zPed + sz * 0.25, 1.4, 8, 5);
  }
}

function palaceWings(k) {
  const hi = k.hi;
  // 1. Rusticated granite podium base (sunk 3m below grade for uneven terrain)
  k.glow(true).color(GRANITE_SH).box(0, -3.0, 0, W + 2.0, H_BASE + 3.0, D + 2.0);
  k.color(GRANITE_DK).box(0, H_BASE - 0.6, 0, W + 2.8, 0.65, D + 2.8);

  // 2. Main 3-story Beaux-Arts granite body + projecting corner pavilions
  k.color(GRANITE).box(0, H_BASE, 0, W, H_MAIN - H_BASE, D);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.color(GRANITE).box(sx * (W * 0.5 - 10), H_BASE, sz * (D * 0.5 - 8), 21.5, H_MAIN - H_BASE + 1.8, 17.5);
      k.color(GRANITE_SH).box(sx * (W * 0.5 - 10), H_MAIN + 1.8, sz * (D * 0.5 - 8), 22.4, 1.1, 18.4);
    }
  }

  // 3. Recessed window bays & colonnade columns along the East (-Z) and West (+Z) wing facades
  for (const sz of [-1, 1]) {
    const zCol = sz * (D * 0.5 + 0.35);
    const zWin = sz * (D * 0.5 + 0.08);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = sx * (19.5 + i * 4.6);
        // Engaged colonnade column
        k.glow(true).color(GRANITE).cyl(x, H_BASE + 0.4, zCol, 0.65, 0.56, H_MAIN - H_BASE - 3.0, hi ? 10 : 6);
        // Tall arched Beaux-Arts window + warm night glow
        k.glow(true).color(LIT).box(x + sx * 2.3, H_BASE + 1.8, zWin, 2.2, 11.5, 0.25);
        k.glow(false).color(WIN).box(x + sx * 2.3, H_BASE + 2.1, zWin + sz * 0.06, 1.8, 10.8, 0.2);
      }
    }
    k.glow(true);
    pedimentPortico(k, sz);
  }

  // 4. Crowning entablature cornice, roof balustrade & copper mansard roof
  k.glow(true).color(GRANITE_SH).box(0, H_MAIN - 1.6, 0, W + 2.6, 1.6, D + 2.6);
  k.color(GRANITE).box(0, H_MAIN, 0, W + 1.2, 1.3, D + 1.2);
  k.glow(false).color(ROOF).taper(0, H_MAIN + 1.3, 0, W - 4, D - 4, W - 18, D - 18, 2.8);
}

function baroqueDome(k) {
  const hi = k.hi, seg = hi ? 36 : 16;
  const Y0 = H_MAIN + 2.5;

  // 1. Stepped octagonal/square tambour transition base (27.5m -> 36.5m)
  k.glow(true).color(GRANITE_SH).box(0, Y0, 0, 42, 5.2, 42);
  k.color(GRANITE).box(0, Y0 + 5.2, 0, 36, 3.8, 36);
  if (hi) {
    // Corner Baroque scrolled pedestals with gold accents
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.color(GRANITE).box(sx * 16.5, Y0 + 5.2, sz * 16.5, 4.2, 5.4, 4.2);
      k.color(GOLD).sphere(sx * 16.5, Y0 + 11.2, sz * 16.5, 1.1, 8, 5);
    }
  }

  // 2. Tall Corinthian Peristyle Drum (36.5m -> 52.5m) with 24 columns & gold-trimmed arched windows
  const D0 = Y0 + 9.0;
  k.color(GRANITE_SH).cyl(0, D0, 0, 17.6, 17.6, 14.5, seg);
  const nCols = hi ? 24 : 12;
  for (let i = 0; i < nCols; i++) {
    const a = (i / nCols) * TAU, c = Math.cos(a), s = Math.sin(a);
    k.glow(true).color(GRANITE).cyl(c * 19.2, D0 + 0.6, s * 19.2, 0.58, 0.5, 12.2, hi ? 8 : 5);
    if (hi) {
      k.color(GOLD).box(c * 19.2, D0 + 12.6, s * 19.2, 1.35, 0.55, 1.35);
      const aw = a + Math.PI / nCols;
      k.color(LIT).box(Math.cos(aw) * 17.65, D0 + 2.4, Math.sin(aw) * 17.65, 1.5, 7.8, 1.5);
    }
  }
  // Drum entablature, cornice & attic story with gilded festoons (51.0m -> 58.0m)
  k.color(GRANITE).cyl(0, D0 + 13.0, 0, 19.8, 19.8, 1.8, seg);
  k.color(GOLD).cyl(0, D0 + 14.8, 0, 20.0, 20.0, 0.55, seg);
  k.color(GRANITE).cyl(0, D0 + 15.35, 0, 17.2, 16.8, 5.2, seg);
  k.color(GRANITE_SH).cyl(0, D0 + 20.55, 0, 17.8, 17.4, 1.2, seg);

  // 3. Ornate Green-Patina & 23.5k Gold-Leaf Ribbed Baroque Dome Shell (58.3m -> 77.5m)
  const S0 = D0 + 21.75, R = 16.6, SH = 19.2;
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * (Math.PI * 0.46);
    prof.push([Math.max(3.8, R * Math.cos(t)), (SH * Math.sin(t)) / Math.sin(Math.PI * 0.46)]);
  }
  k.glow(false).color(PATINA).lathe(0, S0, 0, prof, seg);

  // Gold-leaf ribs & gilded oculus dormers up the green-patina dome
  const nRibs = hi ? 16 : 8;
  k.glow(true).color(GOLD);
  for (let i = 0; i < nRibs; i++) {
    const a = (i / nRibs) * TAU, c = Math.cos(a), s = Math.sin(a);
    const pts = prof.map(([r, y]) => [c * (r + 0.16), S0 + y, s * (r + 0.16)]);
    for (let j = 0; j < pts.length - 1; j++) k.strut(pts[j], pts[j + 1], 0.48);
    if (hi && i % 2 === 0) {
      // Ornate gold-framed Baroque dormer windows (lower & middle tiers) with scrolled pediments
      const rd = prof[2][0] + 0.35, yd = S0 + prof[2][1];
      k.color(GOLD_LT).box(c * rd, yd, s * rd, 1.6, 2.6, 1.6);
      k.sphere(c * rd, yd + 2.8, s * rd, 0.65, 8, 5);
      const rd2 = prof[5][0] + 0.28, yd2 = S0 + prof[5][1];
      k.box(c * rd2, yd2, s * rd2, 1.15, 1.8, 1.15);
      k.color(GOLD);
    }
  }
  // Horizontal gold band rings around dome base and crown
  k.color(GOLD).cyl(0, S0, 0, R + 0.35, R + 0.25, 0.7, seg);
  k.color(GOLD).cyl(0, S0 + SH - 0.5, 0, 4.3, 4.3, 0.75, seg);

  // 4. Tall Baroque Lantern, Cupola & Gilded Finial Spire (77.5m -> 93.7m)
  const L0 = S0 + SH;
  k.color(GRANITE).cyl(0, L0, 0, 4.2, 4.0, 1.4, hi ? 16 : 8);
  k.color(LIT).cyl(0, L0 + 1.4, 0, 2.8, 2.8, 6.2, hi ? 12 : 8);
  if (hi) {
    k.color(GRANITE);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      k.cyl(Math.cos(a) * 3.5, L0 + 1.4, Math.sin(a) * 3.5, 0.32, 0.28, 6.2, 6);
    }
  }
  k.color(GOLD).cyl(0, L0 + 7.6, 0, 3.9, 3.6, 1.1, hi ? 16 : 8);
  k.color(PATINA_DK).sphere(0, L0 + 8.7, 0, 3.1, hi ? 16 : 8, 5, 0.9, 0.5);
  k.color(GOLD_LT).cyl(0, L0 + 11.4, 0, 0.85, 0.25, 3.2, 8);
  k.sphere(0, L0 + 14.8, 0, 0.65, 8, 5);
  k.cyl(0, L0 + 15.2, 0, 0.16, 0.04, 1.5, 6);
  k.glow(false);
}

export function build(k) {
  palaceWings(k);
  baroqueDome(k);
  k.glow(false);
}
