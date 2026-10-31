// feature/famous-landmarks: Transamerica Pyramid, SF — 1:1 (ground to spire tip 260 m).
// White quartz-aggregate precast pyramid: 53 m square at the base tapering to 13.7 m at the top floor
// (~195 m), vertical "wings" on the east (elevators) and west (stairs/smoke tower) faces from floor 29,
// 65 m hollow aluminium-clad spire whose crown is lit at night, and the trussed base arcade.
// Local +X = east, -Z = north (heading 0, aligned with the Montgomery St grid).

const WHITE = 0xeeebe3, WHITE_DK = 0xd9d5cb, GLASS = 0x5d6974, GLASS_DK = 0x2f363d, ALU = 0xd6d9dc, LIT = 0xfff1cf, RED = 0xff3a2a;
const H_BODY = 195, W0 = 53, W1 = 13.7, H_TIP = 260, PODIUM = 16;
const WING0 = 113, WING1 = 201;
const hw = (y) => (W0 + (W1 - W0) * (y / H_BODY)) / 2;   // half width of the pyramid body
const sw = (y) => (W1 / 2) * (H_TIP - y) / (H_TIP - H_BODY); // half width of the spire
const WX = hw(WING0) + 0.4;                                // outer face of a wing

export const lodDist = 2400;
export const glowStrength = 1.7;

export const colliders = [
  { x: 0, z: 0, hw: 26.5, hd: 26.5, h: 40 },
  { x: 0, z: 0, hw: 22.5, hd: 22.5, h: 80 },
  { x: 0, z: 0, hw: 18.4, hd: 18.4, h: 120 },
  { x: 0, z: 0, hw: 14.4, hd: 14.4, h: 160 },
  { x: 0, z: 0, hw: 10.4, hd: 10.4, h: H_BODY },
  { x: 0, z: 0, hw: 4.5, hd: 4.5, h: 235 },
  { x: 11.6, z: 0, hw: WX - 11.6, hd: 4.8, h: WING1 },
  { x: -11.6, z: 0, hw: WX - 11.6, hd: 4.8, h: WING1 },
];

/** Quad on the sloping north (-Z) face between heights ya..yb, spanning u0..u1 of the half width (-1..1). */
function faceQuad(k, ya, yb, u0, u1, e) {
  const a = hw(ya), b = hw(yb);
  k.quad([u1 * a, ya, -a - e], [u0 * a, ya, -a - e], [u0 * b, yb, -b - e], [u1 * b, yb, -b - e]);
}

function body(k) {
  const hi = k.hi;
  // podium: recessed glass lobby behind the trussed arcade
  k.color(GLASS_DK).box(0, 0, 0, 2 * hw(PODIUM) - 5, PODIUM, 2 * hw(PODIUM) - 5);
  // main pyramid
  k.color(WHITE).taper(0, PODIUM, 0, 2 * hw(PODIUM), 2 * hw(PODIUM), W1, W1, H_BODY - PODIUM);
  k.color(WHITE_DK).taper(0, PODIUM - 1.4, 0, 2 * hw(PODIUM) + 0.6, 2 * hw(PODIUM) + 0.6, 2 * hw(PODIUM), 2 * hw(PODIUM), 1.4);
  // four corner edges continue to the ground as massive legs
  k.color(WHITE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.strut([sx * (hw(0) - 1.2), 0, sz * (hw(0) - 1.2)], [sx * (hw(PODIUM) - 1.2), PODIUM, sz * (hw(PODIUM) - 1.2)], 2.6);
  }
  for (let f = 0; f < 4; f++) {
    k.push().rotateY((f * Math.PI) / 2);
    // base truss: inverted Vs along each face
    k.color(WHITE);
    const n = hi ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const u0 = -1 + (2 * i) / n, u1 = -1 + (2 * (i + 1)) / n, um = (u0 + u1) / 2;
      const g = hw(0) - 1.4, t = hw(PODIUM) - 1.4;
      k.strut([um * g, 0, -g], [u0 * t, PODIUM - 0.6, -t], hi ? 1.4 : 2);
      k.strut([um * g, 0, -g], [u1 * t, PODIUM - 0.6, -t], hi ? 1.4 : 2);
    }
    // windows: rows of punched windows (grid) on the sloping faces
    const isWingFace = f === 1 || f === 3; // after rotation these map to +-X faces
    k.color(GLASS);
    if (hi) {
      for (let y = PODIUM + 2.2; y < H_BODY - 2; y += 3.95) {
        const half = hw(y);
        const nw = Math.max(4, Math.round((2 * half * 0.92) / 1.7));
        for (let j = 0; j < nw; j++) {
          const u0 = -0.92 + (1.84 * j) / nw, u1 = u0 + (1.84 / nw) * 0.62;
          if (isWingFace && y > WING0 - 2 && Math.abs((u0 + u1) / 2) * half < 5.4) continue;
          faceQuad(k, y, y + 1.55, u0, u1, 0.06);
        }
      }
    } else {
      for (let y = PODIUM + 2.2; y < H_BODY - 2; y += 11.85) faceQuad(k, y, y + 3.2, -0.9, 0.9, 0.06);
    }
    k.pop();
  }
}

function wings(k) {
  const hi = k.hi;
  for (const s of [-1, 1]) {
    k.color(WHITE).box(s * (WX + 4) / 2, WING0, 0, WX - 4, WING1 - WING0, 9.6);
    // the wing's underside steps down into the sloping face
    k.color(WHITE_DK).taper(s * (WX - 1.5), WING0 - 6, 0, 1.0, 9.6, 3.0, 9.6, 6, s * -0.0, 0);
    k.color(WHITE).box(s * (WX + 4) / 2, WING1, 0, WX - 4.6, 1.2, 9.0); // rounded-ish cap
    if (hi) {
      k.color(GLASS);
      for (let y = WING0 + 3; y < WING1 - 3; y += 3.95) k.box(s * (WX + 0.04), y, 0, 0.1, 1.5, 1.4);
    }
  }
}

function spire(k) {
  const hi = k.hi;
  // hollow aluminium-clad spire: white lower part with louvre bands, lit crown, needle
  const yA = H_BODY, yB = 232, yC = 254;
  k.color(WHITE).taper(0, yA, 0, 2 * sw(yA), 2 * sw(yA), 2 * sw(yB), 2 * sw(yB), yB - yA);
  if (hi) {
    k.color(GLASS_DK);
    for (let y = yA + 4; y < yB - 3; y += 6) {
      for (let f = 0; f < 4; f++) {
        k.push().rotateY((f * Math.PI) / 2);
        const a = sw(y), b = sw(y + 2.2), e = 0.05;
        k.quad([a * 0.7, y, -a - e], [-a * 0.7, y, -a - e], [-b * 0.7, y + 2.2, -b - e], [b * 0.7, y + 2.2, -b - e]);
        k.pop();
      }
    }
  }
  k.glow(true).color(LIT).taper(0, yB, 0, 2 * sw(yB), 2 * sw(yB), 2 * sw(yC), 2 * sw(yC), yC - yB);
  if (hi) {
    // Crisp aluminium corner ridge mullions & horizontal lattice bands along the illuminated glass crown
    k.glow(false).color(ALU);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.strut([sx * sw(yA), yA, sz * sw(yA)], [sx * sw(yC), yC, sz * sw(yC)], 0.28);
    }
    for (let y = yB + 3.5; y < yC; y += 3.5) {
      const w = sw(y) * 2 + 0.14;
      k.box(0, y, 0, w, 0.18, w);
    }
  }
  k.glow(false).color(ALU).taper(0, yC, 0, 2 * sw(yC), 2 * sw(yC), 0.25, 0.25, H_TIP - 0.6 - yC);
  k.glow(true).color(RED).box(0, H_TIP - 0.6, 0, 0.5, 0.6, 0.5);  // aircraft beacon
  k.glow(false);
}

export function build(k) {
  body(k);
  wings(k);
  spire(k);
}
