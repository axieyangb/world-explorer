// feature/famous-landmarks: Samsung Town / Seocho Headquarters Towers, Seoul Korea — 1:1.
// Trio of sleek blue-glass crystalline high-rise towers (Tower C 203m, Tower B 153m, Tower A 145m)
// with geometric cantilevered sky-lounges, silver curtain-wall mullions, and sunken media plaza pavilion!

export const lodDist = 2600;
export const fineDist = 600;
export const glowStrength = 1.9;

const GLASS_BLUE = 0x2c5684, GLASS_CRYSTAL = 0x5c92c4, STEEL = 0xe2e8f0, MULLION = 0xbec9d6;
const SAMSUNG_BLUE = 0x1428a0, SAMSUNG_GLOW = 0x3b78ff;
const GRANITE = 0xd2cfc8, LAWN = 0x4b8a44, WATER = 0x2b769e, LIT = 0xebf5ff;

export const colliders = [
  { x: -42, z: -20, hw: 24, hd: 22, h: 203 },
  { x: 38, z: -22, hw: 22, hd: 20, h: 153 },
  { x: 40, z: 32, hw: 22, hd: 20, h: 145 },
];

function samsungTower(k, tx, tz, w, d, H, loungeYs) {
  const hi = k.hi;
  k.push().translate(tx, 0, tz);

  k.glow(false).color(GLASS_BLUE).box(0, 0.4, 0, w, H - 8.0, d);
  k.color(GLASS_CRYSTAL).box(0, H - 7.6, 0, w - 3.5, 7.6, d - 3.5);
  k.color(STEEL).box(0, H - 8.2, 0, w + 1.2, 1.0, d + 1.2).box(0, H, 0, w - 2.0, 1.0, d - 2.0);

  // Protruding KPF geometric sky-lounge box volumes & corner notches
  for (let idx = 0; idx < loungeYs.length; idx++) {
    const ly = loungeYs[idx];
    const sx = idx % 2 === 0 ? 1 : -1;
    k.glow(false).color(STEEL).box(sx * w * 0.14, ly - 0.8, d * 0.14, w * 0.82, 9.6, d * 0.82);
    k.glow(true).color(GLASS_CRYSTAL).box(sx * w * 0.15, ly, d * 0.15, w * 0.84, 8.0, d * 0.84);
    if (hi) {
      // Sky-lounge horizontal sunshade fins & landscaped sky-terrace parapet
      k.glow(false).color(STEEL);
      for (let fy = ly + 1.6; fy < ly + 7.5; fy += 2.0) {
        k.box(sx * w * 0.15, fy, d * 0.15, w * 0.86, 0.25, d * 0.86);
      }
      k.color(LAWN).box(sx * w * 0.15, ly + 8.85, d * 0.15, w * 0.72, 0.35, d * 0.72);
    }
  }

  k.glow(true).color(LIT);
  const step = hi ? 6.0 : 18.0;
  for (let y = 12; y < H - 12; y += step) {
    k.box(0, y, 0, w + 0.3, 2.2, d + 0.3);
  }
  k.color(SAMSUNG_GLOW).box(0, H - 2.2, 0, w - 1.4, 1.5, d - 1.4);
  k.glow(false);

  if (hi) {
    // Silver curtain-wall vertical & horizontal mullions on all 4 faces
    k.color(MULLION);
    for (let x = -w * 0.42; x <= w * 0.42; x += 5.2) {
      k.strut([x, 0.4, -d * 0.5 - 0.18], [x, H - 8.0, -d * 0.5 - 0.18], 0.3);
      k.strut([x, 0.4, d * 0.5 + 0.18], [x, H - 8.0, d * 0.5 + 0.18], 0.3);
    }
    for (let z = -d * 0.42; z <= d * 0.42; z += 5.2) {
      k.strut([-w * 0.5 - 0.18, 0.4, z], [-w * 0.5 - 0.18, H - 8.0, z], 0.3);
      k.strut([w * 0.5 + 0.18, 0.4, z], [w * 0.5 + 0.18, H - 8.0, z], 0.3);
    }
    // Mechanical penthouse louver crown & helipad circle on roof
    k.color(0x9aa6b4).box(0, H + 1.0, 0, w * 0.55, 2.8, d * 0.55);
    k.color(STEEL).torus(0, H + 3.9, 0, w * 0.22, 0.25, 16, 6);
    // Double-height glass entrance canopy at tower base
    k.color(STEEL).box(0, 7.2, d * 0.5 + 3.2, w * 0.58, 0.55, 6.4);
    k.glow(true).color(LIT).box(0, 6.9, d * 0.5 + 3.2, w * 0.52, 0.2, 5.6);
    k.glow(false);
  }
  k.pop();
}

export function build(k) {
  const hi = k.hi;

  k.glow(false).color(GRANITE).box(0, -2.5, 6, 165, 2.9, 140);
  k.color(LAWN).box(-42, 0.4, 34, 46, 0.25, 38);
  k.color(WATER).box(-2, 0.45, 12, 26, 0.25, 56);

  samsungTower(k, -42, -20, 44, 38, 203, [58, 118, 166]);
  samsungTower(k, 38, -22, 38, 34, 153, [52, 108]);
  samsungTower(k, 40, 32, 38, 34, 145, [48, 98]);

  // Samsung D'light Experience Center Glass Pavilion & Sunken Amphitheater Plaza
  k.glow(false).color(GLASS_CRYSTAL).box(-4, 0.4, -22, 36, 14.5, 28);
  k.color(STEEL).box(-4, 14.9, -22, 40, 1.1, 32);
  k.glow(true).color(LIT).box(-4, 2.5, -22, 36.4, 4.5, 28.4).box(-4, 9.2, -22, 36.4, 4.2, 28.4);
  k.glow(false);

  if (hi) {
    // D'light Pavilion external structural steel diagrid & media wall
    k.color(STEEL);
    for (let x = -20; x <= 12; x += 8) {
      k.strut([x, 0.4, -7.8], [x + 4, 14.9, -7.8], 0.28);
      k.strut([x + 4, 0.4, -7.8], [x, 14.9, -7.8], 0.28);
    }
    // Sunken Media Plaza stepped granite amphitheater & illuminated water fountain jets
    for (let s = 0; s < 4; s++) {
      k.glow(false).color(GRANITE).box(-2, 0.4 + s * 0.35, -18 - s * 1.4, 24, 0.35, 1.4);
    }
    for (let z = -10; z <= 32; z += 7) {
      k.glow(false).color(STEEL).box(-2, 0.55, z, 26.5, 0.22, 1.2); // pedestrian stone bridges over reflecting pool
      k.glow(true).color(SAMSUNG_GLOW).cyl(-8, 0.65, z + 3.5, 0.35, 0.12, 2.2, 8);
      k.cyl(4, 0.65, z + 3.5, 0.35, 0.12, 2.2, 8);
    }
    // Landscaped Korean pine & zelkova tree allees along the plaza promenade
    k.glow(false);
    for (let z = -30; z <= 45; z += 15) {
      for (const tx of [-72, 72]) {
        k.color(0x5c4430).cyl(tx, 0.4, z, 0.35, 0.25, 2.8, 6);
        k.color(LAWN).sphere(tx, 4.2, z, 2.8, 8, 6, 0.85);
      }
    }
  }

  // Iconic Tilted Blue Elliptical SAMSUNG Monument Sign at Plaza Entrance
  k.push().translate(-12, 0, 56);
  k.glow(false).color(0x1e2530).box(0, 0.4, 0, 22, 1.5, 3.6);
  k.push().translate(0, 4.4, 0).rotateZ(0.14).scale(1.45, 0.72, 1);
  k.glow(true).color(SAMSUNG_BLUE). rotateX(Math.PI / 2).cyl(0, -1.0, 0, 8.8, 8.8, 2.0, hi ? 24 : 10);
  k.pop();
  // Crisp 3D white letters S A M S U N G across the tilted blue ellipse
  if (hi) {
    k.glow(true).color(0xffffff);
    for (let i = 0; i < 7; i++) {
      const lx = -6.6 + i * 2.2, ly = 4.0 + (i - 3) * 0.28;
      k.box(lx, ly, 1.05, 1.45, 1.9, 0.35);
      k.box(lx, ly, -1.05, 1.45, 1.9, 0.35);
    }
  } else {
    k.glow(true).color(STEEL).box(0, 3.9, 0, 13.5, 2.1, 2.2);
  }
  k.glow(false);
  k.pop();
}
