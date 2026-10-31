// feature/famous-landmarks: Sky Tower, Auckland — 1:1 (328 m to the mast tip).
// Slim 12 m concrete shaft on eight splayed legs with steel collar rings, the main pod (observation,
// SkyJump pergola, and Orbit revolving-restaurant levels, 186–200 m) with its inclined glass bands,
// the Sky Deck pod at 220 m, and the white steel mast with microwave dish arrays and antenna.
const CONC = 0xd6d4ce, CONC_DK = 0xb9b7b1, GLASS = 0x51667a, POD = 0xe7e6e1, POD_DK = 0xa9adb1, MAST = 0xf0f0ee;
const MAST_DK = 0xc4c6c8, LIT = 0xffe7b8, RED = 0xff3020, GOLD_COL = 0xd4a838;

export const lodDist = 2000;
export const glowStrength = 1.3;

const PB = 178;     // pod underside start
const SD = 212;     // Sky Deck base
const MB = 226;     // mast base

export const colliders = [
  { x: 0, z: 0, r: 12, h: 30 },
  { x: 0, z: 0, r: 6.5, h: PB },
  { x: 0, z: 0, r: 20, h: 206 },
  { x: 0, z: 0, r: 10, h: MB },
  { x: 0, z: 0, r: 2.5, h: 320 },
];

export function build(k) {
  const hi = k.hi;
  const seg = hi ? 32 : 12;
  // SkyCity Circular Entrance Rotunda Podium & Plaza
  k.color(CONC_DK).cyl(0, -2, 0, 24, 25, 2.6, seg);
  if (hi) {
    k.color(GLASS).cyl(0, 0.6, 0, 17.5, 17.5, 5.2, 24);
    k.glow(true).color(LIT).cyl(0, 1.2, 0, 17.7, 17.7, 3.6, 24).glow(false);
    k.color(POD).cyl(0, 5.8, 0, 19.2, 18.8, 0.9, 24);
  }
  // eight splayed concrete legs merging into the shaft at y = 48 m with golden-bronze structural node collars
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a), s = Math.sin(a);
    k.color(CONC).strut([c * 14.2, 0, s * 14.2], [c * 5.8, 48, s * 5.8], hi ? 2.4 : 3.2);
    if (hi) {
      k.color(GOLD_COL).cyl(c * 14.2, 0.5, s * 14.2, 1.8, 1.6, 1.8, 10);
      k.strut([c * 5.8, 46, s * 5.8], [c * 8.8, 32, s * 8.8], 0.65);
    }
  }
  if (hi) {
    // Structural steel collar ring where the 8 splayed legs meet the shaft at y = 48m
    k.color(GOLD_COL).torus(0, 48, 0, 6.65, 0.65, 28, 8);
    k.color(POD_DK).torus(0, 26, 0, 10.2, 0.42, 24, 6);
  }
  // shaft
  k.color(CONC).cyl(0, 0, 0, 6.4, 6.0, PB, seg);
  if (hi) {
    // 3 express glass lift-shaft stripes + vertical concrete flutes & horizontal construction joint rings
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.push().rotateY(a);
      k.color(POD_DK).box(0, 50, -6.18, 1.2, PB - 52, 0.55);
      k.glow(true).color(0xd8ecff).box(0, 52, -6.32, 0.72, PB - 56, 0.35).glow(false);
      k.pop();
    }
    k.color(CONC_DK);
    for (let y = 18; y < PB - 6; y += 16) {
      const r = 6.4 - 0.4 * (y / PB) + 0.12;
      k.torus(0, y, 0, r, 0.14, 24, 6);
    }
  }
  // main pod: ribbed aluminium underside cone, stacked observation & Orbit restaurant levels, sloping roof
  k.color(POD).lathe(0, PB, 0, [[6.0, 0], [12, 3.5], [19, 7], [20.5, 8]], seg);
  if (hi) {
    // 16 radial structural ribs under the pod belly & SkyJump launch platform at y = 192m
    k.color(POD_DK);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.strut([Math.cos(a) * 6.2, PB + 0.2, Math.sin(a) * 6.2], [Math.cos(a) * 20.4, PB + 8.0, Math.sin(a) * 20.4], 0.38);
    }
    // Cantilevered SkyJump platform on the -Z side of the main pod
    k.color(RED).box(0, 191.2, -22.2, 4.2, 0.45, 3.8);
    k.color(MAST).box(-1.9, 191.6, -22.2, 0.2, 1.4, 3.6).box(1.9, 191.6, -22.2, 0.2, 1.4, 3.6);
  }
  const lv = [[186, 20.5], [190.8, 20.8], [195.6, 20.4], [200.4, 19.4]];
  for (let i = 0; i < lv.length; i++) {
    const [y, r] = lv[i];
    k.color(i % 2 ? POD : POD_DK).cyl(0, y, 0, r, r, 1.4, seg);
    if (i < lv.length - 1) {
      const rNext = lv[i + 1][1];
      k.glow(true).color(i === 1 ? LIT : 0x99c2e6).cyl(0, y + 1.4, 0, r - 0.5, rNext - 0.5, 3.4, seg, { caps: false });
      k.glow(false);
      if (hi) {
        // Inclined window mullions around the observation & restaurant glass bands
        k.color(POD_DK);
        for (let m = 0; m < 24; m++) {
          const a = (m / 24) * Math.PI * 2;
          k.strut([Math.cos(a) * (r - 0.35), y + 1.4, Math.sin(a) * (r - 0.35)], [Math.cos(a) * (rNext - 0.35), y + 4.8, Math.sin(a) * (rNext - 0.35)], 0.22);
        }
      }
    }
  }
  k.color(POD).lathe(0, 201.8, 0, [[19.4, 0], [16, 2.6], [11.5, 5.0], [9.5, 7.2], [9.5, 10.2]], seg);
  // Sky Deck pod (220 m) with open SkyWalk catwalk ring & safety frame
  k.color(POD_DK).cyl(0, SD, 0, 10.5, 10.5, 1.0, seg);
  k.glow(true).color(LIT).cyl(0, SD + 1, 0, 10.2, 9.8, 7.5, seg, { caps: false }).glow(false);
  if (hi) {
    // SkyWalk outer catwalk grating & overhead safety harness rail at y = SD
    k.color(MAST_DK).torus(0, SD + 0.3, 0, 11.6, 0.45, 28, 6);
    k.color(GOLD_COL).torus(0, SD + 3.2, 0, 11.4, 0.16, 28, 6);
    for (let m = 0; m < 16; m++) {
      const a = (m / 16) * Math.PI * 2;
      k.color(POD_DK).strut([Math.cos(a) * 10.2, SD + 1, Math.sin(a) * 10.2], [Math.cos(a) * 9.8, SD + 8.5, Math.sin(a) * 9.8], 0.22);
    }
  }
  k.color(POD).lathe(0, SD + 8.5, 0, [[10.6, 0], [9.6, 1.6], [6.5, 3.6], [4.0, 5.5]], seg);
  // mast: stepped white sections, microwave dish arrays, and the antenna
  const ms = hi ? 16 : 6;
  k.color(MAST).cyl(0, MB, 0, 3.4, 3.0, 30, ms);
  k.color(MAST_DK).cyl(0, MB + 30, 0, 3.8, 3.8, 1.2, ms);
  k.color(MAST).cyl(0, MB + 31.2, 0, 2.6, 2.2, 28, ms);
  k.color(MAST_DK).cyl(0, MB + 59.2, 0, 3.0, 3.0, 1.0, ms);
  k.color(MAST).cyl(0, MB + 60.2, 0, 1.6, 1.1, 22, ms);
  k.color(MAST_DK).cyl(0, MB + 82.2, 0, 0.6, 0.15, 19.8, hi ? 10 : 4);
  if (hi) {
    k.color(MAST_DK);
    for (let y = MB + 4; y < MB + 58; y += 6) {
      const mr = y < MB + 30 ? 3.35 : 2.55;
      k.cyl(0, y, 0, mr, mr, 0.4, ms, { caps: false });
    }
    // White microwave communications drum dishes mounted around lower mast platforms
    k.color(MAST);
    for (const dy of [MB + 6, MB + 18, MB + 34]) {
      for (let d = 0; d < 6; d++) {
        const a = (d / 6) * Math.PI * 2 + dy * 0.2;
        const r = dy < MB + 30 ? 3.6 : 2.8;
        k.push().translate(Math.cos(a) * r, dy, Math.sin(a) * r).rotateY(-a + Math.PI / 2).rotateX(Math.PI / 2);
        k.cyl(0, 0, 0, 0.95, 0.95, 0.45, 10);
        k.pop();
      }
    }
  }
  // aviation lights
  k.glow(true).color(RED);
  k.sphere(0, 328, 0, 0.55, 8, 5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.box(Math.cos(a) * 3.8, MB + 30.6, Math.sin(a) * 3.8, 0.5, 0.5, 0.5);
    if (hi) k.box(Math.cos(a) * 3.0, MB + 59.7, Math.sin(a) * 3.0, 0.42, 0.42, 0.42);
  }
  k.glow(false);
}
