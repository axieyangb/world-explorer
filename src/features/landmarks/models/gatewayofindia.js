// feature/famous-landmarks: Gateway of India, Mumbai — 1:1 (26 m; corner turrets ~28 m).
// Indo-Saracenic triumphal arch in honey-yellow basalt on the Apollo Bunder waterfront: the 20 m square
// central block pierced by the great pointed arch (front and back) under a pierced-stone parapet, four
// octagonal corner turrets with cupolas, the low central dome behind the parapet, and the two lower
// side wings with their own arched loggias. Front (-Z) faces the harbour (SE). Floodlit at night.
const STONE = 0xcfae78, STONE_DK = 0xae8d5b, STONE_LT = 0xdcc092, SHADOW = 0x4f4232, JALI = 0x8f7550, PAVE = 0xb9ad98;
const WARM = 0xffe0a8, GOLD = 0xdfb438;

export const lodDist = 1100;
export const glowStrength = 0.4;

const CH = 22.5;   // central block parapet base
const WH = 16;     // wing roof

export const colliders = [
  { x: -6, z: 0, hw: 4, hd: 10, h: CH + 3 }, { x: 6, z: 0, hw: 4, hd: 10, h: CH + 3 },
  { x: 0, z: 0, hw: 10, hd: 10, h: CH + 3, }, // roof (walk-over)
  { x: -16.8, z: 0, hw: 6.8, hd: 7, h: WH + 2 }, { x: 16.8, z: 0, hw: 6.8, hd: 7, h: WH + 2 },
];

/** Pointed arch opening (dark recess) on a face at z, centred x, from y0, width w, total height h. */
function arch(k, x, y0, z, w, h, col, dz = -1) {
  const spring = h - w * 0.62, hw = w / 2;
  const n = k.hi ? 10 : 2;
  k.color(col);
  const Q = (a, b, c, d) => (dz > 0 ? k.quad(a, b, c, d) : k.quad(d, c, b, a));
  Q([x - hw, y0, z], [x + hw, y0, z], [x + hw, y0 + spring, z], [x - hw, y0 + spring, z]);
  let prev = [hw, spring];
  for (let i = 1; i <= n; i++) {
    const t = i / n, a = t * (Math.PI / 2);
    const cur = i === n ? [0, h] : [hw * Math.cos(a) * (1 - 0.35 * t), spring + (h - spring) * Math.sin(a)];
    Q([x - prev[0], y0 + prev[1], z], [x + prev[0], y0 + prev[1], z], [x + cur[0], y0 + cur[1], z], [x - cur[0], y0 + cur[1], z]);
    prev = cur;
  }
}

function turret(k, x, z) {
  const hi = k.hi, seg = hi ? 16 : 6;
  k.glow(true).color(STONE_LT).cyl(x, 0, z, 1.9, 1.9, CH + 1.5, 8, { phase: Math.PI / 8, smooth: false }).glow(false);
  if (hi) {
    for (const y of [4.2, 8.5, 12.8, 17.2, CH]) {
      k.color(STONE_DK).cyl(x, y, z, 2.18, 2.18, 0.55, 8, { phase: Math.PI / 8 });
      k.color(STONE_LT).cyl(x, y + 0.55, z, 2.05, 2.05, 0.25, 8, { phase: Math.PI / 8 });
    }
    // Overhanging chhajja stone eave & brackets under the chhatri pavilion
    k.color(STONE_DK).cyl(x, CH + 1.1, z, 2.45, 2.15, 0.4, 8, { phase: Math.PI / 8 });
  }
  // open chhatri + lotus cupola + kalasha finial
  const y = CH + 1.5;
  if (hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = x + Math.cos(a) * 1.45, cz = z + Math.sin(a) * 1.45;
      k.color(STONE).cyl(cx, y, cz, 0.19, 0.16, 2.1, 6, { caps: false });
      k.color(STONE_LT).box(cx, y + 1.9, cz, 0.42, 0.25, 0.42);
    }
  } else k.color(STONE_DK).cyl(x, y, z, 1.4, 1.4, 2.0, 6);
  k.color(STONE_DK).cyl(x, y + 2.1, z, 2.15, 1.95, 0.38, seg);
  k.color(STONE_LT).lathe(x, y + 2.48, z, [[1.65, 0], [1.8, 0.6], [1.45, 1.45], [0.65, 2.15], [0.14, 2.65], [0, 2.75]], seg);
  if (hi) {
    // Gilded Kalasha spire finial on each octagonal turret dome
    k.glow(true).color(GOLD).sphere(x, y + 5.35, z, 0.22, 8, 6).cyl(x, y + 5.5, z, 0.08, 0.02, 0.65, 6).glow(false);
  }
}

export function build(k) {
  const hi = k.hi;
  // Apollo Bunder waterfront basalt seawall, landing steps & paved promenade
  k.color(PAVE).box(0, -1.6, 0, 56, 2.4, 30);
  if (hi) {
    // Harbour seawall parapet & landing ghat steps on -Z waterfront
    k.color(STONE_DK).box(0, 0.8, -14.5, 56, 0.95, 0.65);
    for (let bx = -26; bx <= 26; bx += 6.5) {
      k.color(STONE_LT).box(bx, 0.8, -14.5, 0.85, 1.35, 0.85);
      k.glow(true).color(WARM).sphere(bx, 2.35, -14.5, 0.26, 8, 6).glow(false);
    }
    for (let s = 0; s < 5; s++) {
      k.color(STONE_DK).box(0, -0.2 - s * 0.35, -15.2 - s * 0.65, 16, 0.35, 0.7);
    }
  }
  // central block: two piers (x) leaving the great passage, crown over the arch
  k.glow(true); // floodlit basalt at night
  k.color(STONE).box(-7.25, 0.8, 0, 5.5, CH - 0.8, 20);
  k.color(STONE).box(7.25, 0.8, 0, 5.5, CH - 0.8, 20);
  k.color(STONE).box(0, 17.6, 0, 9.2, CH - 17.6, 20);
  k.glow(false);
  // passage vault ceiling + great pointed arches on both faces
  k.color(SHADOW).box(0, 0.8, 0, 9.0, 16.8, 19.6);
  // stone spandrels around the pointed arch on both faces
  k.glow(true).color(STONE).box(0, 0.8, -10.05, 9.2, 16.8, 0.1).box(0, 0.8, 10.05, 9.2, 16.8, 0.1).glow(false);
  arch(k, 0, 0.8, -10.12, 9.0, 16.8, SHADOW, -1);
  arch(k, 0, 0.8, 10.12, 9.0, 16.8, SHADOW, 1);
  if (hi) {
    // Concentric Indo-Saracenic stepped archivolts, projecting Gujarati jharokha balconies, lotus spandrel medallions & inscription frieze
    for (const sz of [-1, 1]) {
      const zf = sz * 10.08;
      // Stepped archivolt piers & hood moulding
      k.color(STONE_LT).box(-5.0, 0.8, zf, 0.65, 16.8, 0.28).box(5.0, 0.8, zf, 0.65, 16.8, 0.28).box(0, 18.0, zf, 10.8, 0.75, 0.32);
      // Carved lotus medallions in the arch spandrels
      for (const sx of [-3.6, 3.6]) {
        k.push().translate(sx, 15.8, zf + sz * 0.15).rotateX(Math.PI / 2);
        k.color(STONE_LT).cyl(0, 0, 0, 0.85, 0.85, 0.18, 12);
        k.color(STONE_DK).torus(0, 0, 0, 0.65, 0.12, 12, 6);
        k.pop();
      }
      // Projecting corbelled jharokha balconies & pierced jali screens on both piers
      for (const px of [-7.3, 7.3]) {
        k.color(JALI).box(px, 4.2, zf, 3.0, 9.2, 0.16);
        // Projecting lower & upper jharokha balcony hoods with carved brackets
        for (const by of [3.8, 9.2, 14.5]) {
          k.color(STONE_DK).taper(px, by - 0.5, zf + sz * 0.25, 2.2, 0.3, 3.4, 0.85, 0.5);
          k.color(STONE_LT).box(px, by, zf + sz * 0.35, 3.6, 0.45, 0.9);
        }
        // Decorative blind pointed niche inside pier
        arch(k, px, 4.6, zf + sz * 0.12, 2.1, 4.2, SHADOW, sz);
        arch(k, px, 10.0, zf + sz * 0.12, 2.1, 4.0, SHADOW, sz);
      }
      // Commemorative inscription tablet & blind arcade gallery in the attic above the great arch
      k.color(STONE_LT).box(0, 18.9, zf + sz * 0.1, 9.6, 1.3, 0.22);
      for (let i = -4; i <= 4; i++) {
        k.color(STONE_DK).box(i * 1.15, 20.3, zf + sz * 0.12, 0.42, 1.9, 0.22);
      }
    }
    // side arches leading into the wings
    for (const sx of [-1, 1]) arch(k, sx * 10.02, 0.8, 0, 5, 10, SHADOW, 1);
  }
  // cornice + overhanging chhajja eave on carved brackets + pierced parapet with pinnacles
  k.color(STONE_DK).box(0, CH, 0, 21.4, 0.85, 21.4);
  if (hi) {
    // Corbel brackets under the main cornice
    k.color(STONE_LT);
    for (let i = -8; i <= 8; i += 2) {
      k.box(i * 1.1, CH - 0.45, -10.35, 0.35, 0.45, 0.55).box(i * 1.1, CH - 0.45, 10.35, 0.35, 0.45, 0.55);
      k.box(-10.35, CH - 0.45, i * 1.1, 0.55, 0.45, 0.35).box(10.35, CH - 0.45, i * 1.1, 0.55, 0.45, 0.35);
    }
  }
  k.color(hi ? JALI : STONE).box(0, CH + 0.85, 0, 20.4, 1.8, 20.4);
  if (hi) {
    // Merlon crenellations & guldasta pinnacles along parapet
    k.color(STONE_LT);
    for (let i = -4; i <= 4; i++) {
      for (const sz of [-1, 1]) k.cyl(i * 2.1, CH + 2.65, sz * 10.2, 0.28, 0.06, 1.3, 6);
      for (const sx of [-1, 1]) k.cyl(sx * 10.2, CH + 2.65, i * 2.1, 0.28, 0.06, 1.3, 6);
    }
  }
  // Central Indo-Saracenic ribbed dome on octagonal lotus drum + golden kalasha finial
  if (hi) {
    k.color(STONE_DK).cyl(0, CH + 0.8, 0, 6.9, 6.9, 1.2, 16);
    k.color(STONE_LT).sphere(0, CH + 1.8, 0, 6.5, 24, 10, 0.62, 0.5);
    k.glow(true).color(GOLD).sphere(0, CH + 6.0, 0, 0.36, 8, 6).cyl(0, CH + 6.2, 0, 0.12, 0.03, 1.1, 6).glow(false);
  } else {
    k.color(STONE_LT).sphere(0, CH + 0.8, 0, 6.5, 8, 3, 0.55, 0.5);
  }
  // corner turrets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) turret(k, sx * 9.2, sz * 9.2);
  // side wings with front/back loggias & pierced jali parapets
  for (const sx of [-1, 1]) {
    const cx = sx * 16.8;
    k.glow(true).color(STONE).box(cx, 0.8, 0, 13.4, WH - 0.8, 14).glow(false);
    k.color(STONE_DK).box(cx, WH, 0, 14.2, 0.75, 14.8);
    k.color(hi ? JALI : STONE).box(cx, WH + 0.75, 0, 13.4, 1.25, 14);
    for (const sz of [-1, 1]) {
      arch(k, cx, 0.8, sz * 7.02, 6.5, 11.5, SHADOW, sz);
      if (hi) {
        // Triple sub-arcade columns inside each side wing grand arch
        for (const dx of [-1.6, 1.6]) k.color(STONE_LT).cyl(cx + dx, 0.8, sz * 6.85, 0.26, 0.22, 7.8, 8);
        arch(k, cx - 4.6, 2.5, sz * 7.02, 1.8, 4.2, SHADOW, sz);
        arch(k, cx + 4.6, 2.5, sz * 7.02, 1.8, 4.2, SHADOW, sz);
        arch(k, cx - 4.6, 8.2, sz * 7.02, 1.8, 3.8, SHADOW, sz);
        arch(k, cx + 4.6, 8.2, sz * 7.02, 1.8, 3.8, SHADOW, sz);
        k.color(STONE_LT).box(cx, 13.2, sz * 7.18, 8.2, 0.55, 0.38);
      }
    }
    // corner cupolas on the wings
    if (hi) {
      for (const sz of [-1, 1]) {
        const tx = cx + sx * 6.2, tz = sz * 6.5;
        k.color(STONE_LT).cyl(tx, WH + 2.0, tz, 0.95, 0.95, 1.1, 8).sphere(tx, WH + 3.1, tz, 1.0, 10, 6, 1.3, 0.5);
        k.glow(true).color(GOLD).cyl(tx, WH + 4.3, tz, 0.08, 0.02, 0.55, 6).glow(false);
      }
    }
  }
  // floodlights along the plinth (night)
  k.glow(true).color(WARM);
  for (const sz of [-1, 1]) k.box(0, 0.8, sz * 11.6, 46, 0.25, 0.4);
  k.glow(false);
}
