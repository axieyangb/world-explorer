// feature/famous-landmarks: Sky Tower, Auckland — 1:1 (328 m to the mast tip).
// Slim 12 m concrete shaft on eight splayed legs, the main pod (observation and revolving-restaurant
// levels, 186–200 m) with its glass bands under a sloping roof, the smaller Sky Deck pod at 220 m, and
// the white steel mast with its stepped sections and antenna. Glass bands and the aviation lights glow
// at night.
const CONC = 0xd6d4ce, CONC_DK = 0xb9b7b1, GLASS = 0x51667a, POD = 0xe7e6e1, POD_DK = 0xa9adb1, MAST = 0xf0f0ee;
const MAST_DK = 0xc4c6c8, LIT = 0xffe7b8, RED = 0xff3020;

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
  const seg = hi ? 28 : 12;
  // eight splayed legs merging into the shaft
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a), s = Math.sin(a);
    k.color(CONC).strut([c * 13.5, 0, s * 13.5], [c * 5.6, 48, s * 5.6], hi ? 2.6 : 3.2);
  }
  k.color(CONC_DK).cyl(0, 0, 0, 15, 15, 0.6, 16);
  // shaft
  k.color(CONC).cyl(0, 0, 0, 6.4, 6.0, PB, seg);
  if (hi) {
    // lift-shaft glazing stripe + vertical ribs
    k.color(POD_DK);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.push().rotateY(a);
      k.box(0, 50, -6.2, 0.9, PB - 52, 0.5);
      k.pop();
    }
  }
  // main pod: underside cone, stacked observation levels with glass bands, sloping roof
  k.color(POD).lathe(0, PB, 0, [[6.0, 0], [12, 3.5], [19, 7], [20.5, 8]], seg);
  const lv = [[186, 20.5], [190.8, 20.8], [195.6, 20.4], [200.4, 19.4]];
  for (let i = 0; i < lv.length; i++) {
    const [y, r] = lv[i];
    k.color(i % 2 ? POD : POD_DK).cyl(0, y, 0, r, r, 1.4, seg);
    if (i < lv.length - 1) {
      k.glow(true).color(i === 1 ? LIT : GLASS).cyl(0, y + 1.4, 0, r - 0.6, lv[i + 1][1] - 0.6, 3.4, seg, { caps: false });
      k.glow(false);
    }
  }
  k.color(POD).lathe(0, 201.8, 0, [[19.4, 0], [16, 2.6], [11.5, 5.0], [9.5, 7.2], [9.5, 10.2]], seg);
  // Sky Deck pod
  k.color(POD_DK).cyl(0, SD, 0, 10.5, 10.5, 1.0, seg);
  k.glow(true).color(GLASS).cyl(0, SD + 1, 0, 10.2, 9.8, 7.5, seg, { caps: false }).glow(false);
  k.color(POD).lathe(0, SD + 8.5, 0, [[10.6, 0], [9.6, 1.6], [6.5, 3.6], [4.0, 5.5]], seg);
  // mast: stepped white sections, then the antenna
  const ms = hi ? 12 : 6;
  k.color(MAST).cyl(0, MB, 0, 3.4, 3.0, 30, ms);
  k.color(MAST_DK).cyl(0, MB + 30, 0, 3.4, 3.4, 1.2, ms);
  k.color(MAST).cyl(0, MB + 31.2, 0, 2.6, 2.2, 28, ms);
  k.color(MAST_DK).cyl(0, MB + 59.2, 0, 2.6, 2.6, 1.0, ms);
  k.color(MAST).cyl(0, MB + 60.2, 0, 1.6, 1.1, 22, ms);
  k.color(MAST_DK).cyl(0, MB + 82.2, 0, 0.6, 0.15, 19.8, hi ? 8 : 4);
  if (hi) {
    k.color(MAST_DK);
    for (let y = MB + 4; y < MB + 58; y += 6) k.cyl(0, y, 0, y < MB + 30 ? 3.35 : 2.55, y < MB + 30 ? 3.35 : 2.55, 0.4, ms, { caps: false });
  }
  // aviation lights
  k.glow(true).color(RED);
  k.sphere(0, 328, 0, 0.5, 6, 3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.box(Math.cos(a) * 3.3, MB + 29, Math.sin(a) * 3.3, 0.5, 0.5, 0.5);
  }
  k.glow(false);
}
