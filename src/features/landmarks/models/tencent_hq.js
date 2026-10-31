// feature/famous-landmarks: Tencent Seafront Towers (Tencent Binhai Mansion), Shenzhen China — 1:1.
// Twin 248m (50-story North) & 194m (39-story South) glass skyscrapers dramatically linked by THREE
// multi-story horizontal interconnected-network skybridges at the 3rd, 22nd, and 35th floors!

export const lodDist = 2800;
export const fineDist = 650;
export const glowStrength = 2.0;

const GLASS = 0x3b5b78, GLASS_LT = 0x6f9ec4, STEEL = 0xe2e7ed, FIN_SILVER = 0xc5cfd9;
const BRIDGE_W = 0xf0f4f8, BRIDGE_WARM = 0xffdca8, TENCENT_BLUE = 0x0052d9, TENCENT_CYAN = 0x26a6ff;
const PLAZA = 0xd6d2c8, LAWN = 0x4b8a44, LIT = 0xe8f4ff;

export const colliders = [
  { x: -34, z: -8, hw: 24, hd: 20, h: 248 },
  { x: 34, z: 8, hw: 24, hd: 20, h: 194 },
  { x: 0, z: 0, hw: 38, hd: 16, h: 168 },
];

function seafrontTower(k, tx, tz, H) {
  const hi = k.hi;
  k.push().translate(tx, 0, tz);

  k.glow(false).color(GLASS).taper(0, 0.4, 0, 44, 36, 40, 33, H - 4.0, 0, 0);
  k.color(STEEL).taper(0, H - 3.6, 0, 40.4, 33.4, 34, 28, 3.6, 0, 0);
  k.glow(true).color(TENCENT_CYAN).box(0, H - 1.8, 0, 38, 1.4, 31);

  k.color(LIT);
  const step = hi ? 6.2 : 19;
  for (let y = 18; y < H - 10; y += step) {
    const s = 1 - (y / H) * 0.08;
    k.box(0, y, 0, 44.3 * s, 2.3, 36.3 * s);
  }
  k.glow(false);

  if (hi) {
    // Angled solar-shading silver curtain-wall brise-soleil fins on all 4 faces
    k.color(FIN_SILVER);
    for (let x = -18; x <= 18; x += 4.5) {
      k.strut([x, 0.4, -18.2], [x * 0.91, H - 3.6, -16.7], 0.34);
      k.strut([x, 0.4, 18.2], [x * 0.91, H - 3.6, 16.7], 0.34);
    }
    for (let z = -15; z <= 15; z += 5.0) {
      k.strut([-22.2, 0.4, z], [-20.2, H - 3.6, z * 0.91], 0.34);
      k.strut([22.2, 0.4, z], [20.2, H - 3.6, z * 0.91], 0.34);
    }
    // Mechanical refuge floor dark louver bands
    k.color(0x233446);
    for (const ry of [62, 126, 182]) {
      if (ry < H - 18) {
        const s = 1 - (ry / H) * 0.08;
        k.box(0, ry, 0, 44.6 * s, 3.4, 36.6 * s);
      }
    }
    // Rooftop crown communications mast & helipad circle
    k.color(STEEL).torus(0, H + 0.15, 0, 10.5, 0.28, 20, 6);
    k.cyl(0, H, 0, 0.55, 0.18, 12.0, 8);
    k.glow(true).color(TENCENT_CYAN).sphere(0, H + 12.2, 0, 0.45, 8, 6);
    k.glow(false);
  }
  k.pop();
}

function linkBridge(k, y0, h, zOffset, hasRoofGarden = false, hasTrack = false) {
  const hi = k.hi;
  k.push().translate(0, 0, zOffset).rotateY(-0.23);

  k.glow(false).color(BRIDGE_W);
  k.box(0, y0, 0, 96, 1.8, 22);
  k.box(0, y0 + h - 1.6, 0, 96, 1.6, 22);

  k.color(GLASS_LT).box(0, y0 + 1.8, 0, 94, h - 3.4, 20.5);
  k.glow(true).color(BRIDGE_WARM).box(0, y0 + 3.2, 0, 94.5, h - 6.2, 21.0);
  k.color(TENCENT_CYAN).box(0, y0 + 0.2, 0, 96.4, 0.8, 22.4);
  k.box(0, y0 + h - 0.6, 0, 96.4, 0.6, 22.4);

  if (hi) {
    // Expressive Vierendeel / Warren mega-truss steel diagrid on both sides of the skybridge
    k.glow(false).color(STEEL);
    for (let x = -42; x < 42; x += 10.5) {
      k.strut([x, y0 + 1.0, -10.8], [x + 5.25, y0 + h - 1.0, -10.8], 0.62);
      k.strut([x + 5.25, y0 + h - 1.0, -10.8], [x + 10.5, y0 + 1.0, -10.8], 0.62);
      k.strut([x, y0 + 1.0, 10.8], [x + 5.25, y0 + h - 1.0, 10.8], 0.62);
      k.strut([x + 5.25, y0 + h - 1.0, 10.8], [x + 10.5, y0 + 1.0, 10.8], 0.62);
      // Vertical truss posts
      k.strut([x, y0 + 1.0, -10.8], [x, y0 + h - 1.0, -10.8], 0.42);
      k.strut([x, y0 + 1.0, 10.8], [x, y0 + h - 1.0, 10.8], 0.42);
    }
    // Soffit LED strips under bridge belly
    k.glow(true).color(LIT);
    for (let x = -36; x <= 36; x += 12) {
      k.box(x, y0 - 0.1, 0, 1.4, 0.18, 18.5);
    }
    // Indoor 300m suspended running track & basketball court visible inside the Health Link (middle bridge)
    if (hasTrack) {
      k.glow(true).color(0xe04828).box(0, y0 + 2.2, 0, 88, 0.35, 19.2);
    }
  }

  if (hasRoofGarden) {
    k.glow(false).color(LAWN).box(0, y0 + h, 0, 68, 0.45, 16);
    if (hi) {
      // Sky-garden trees, wooden pergola & glass safety balustrade along roof terrace
      k.color(GLASS_LT).box(0, y0 + h, -10.2, 72, 1.3, 0.2).box(0, y0 + h, 10.2, 72, 1.3, 0.2);
      for (let gx = -24; gx <= 24; gx += 12) {
        k.color(0x3a7234).sphere(gx, y0 + h + 2.0, 0, 2.2, 8, 5, 0.85);
      }
    }
  }
  k.glow(false);
  k.pop();
}

export function build(k) {
  const hi = k.hi;
  k.glow(false).color(PLAZA).box(0, -2.5, 0, 155, 2.9, 125);
  k.color(LAWN).box(-45, 0.4, 34, 42, 0.25, 26).box(45, 0.4, -34, 42, 0.25, 26);

  seafrontTower(k, -34, -8, 248);
  seafrontTower(k, 34, 8, 194);

  // THREE Iconic Multi-Story Horizontal Skybridges (Culture Link @ L3-5, Health Link @ L21-26, Knowledge Link @ L34-38)
  linkBridge(k, 6.0, 16.0, 2.0, true, false);
  linkBridge(k, 88.0, 22.0, 0.0, true, true);
  linkBridge(k, 144.0, 20.0, -2.0, true, false);

  // Entry Plaza Tencent Blue Logo Wall & Sculptural QQ Penguin Mascot Statue
  k.glow(false).color(0x1f2833).box(0, 0.4, 44, 22, 1.4, 3.2);
  k.glow(true).color(TENCENT_BLUE).box(0, 1.8, 44, 18, 4.2, 1.6);
  k.color(BRIDGE_W).box(0, 3.0, 44, 14, 1.8, 1.9);
  k.glow(false);

  if (hi) {
    // Iconic Tencent QQ Penguin sculpture on circular granite pedestal in front entry plaza (x = -18, z = 42)
    k.push().translate(-18, 0.4, 42);
    k.color(0x88929e).cyl(0, 0, 0, 3.2, 3.6, 0.8, 16);
    // Black tuxedo body & head
    k.color(0x161a20).sphere(0, 3.2, 0, 2.2, 14, 10, 1.25);
    // White belly patch & eyes
    k.glow(true).color(0xfafcff).sphere(0, 3.0, 0.65, 1.65, 12, 8, 1.15);
    k.sphere(-0.48, 4.6, 1.45, 0.32, 8, 6).sphere(0.48, 4.6, 1.45, 0.32, 8, 6);
    // Iconic red scarf & knot + yellow beak & webbed feet
    k.color(0xe62418).torus(0, 3.95, 0.1, 1.65, 0.35, 16, 8);
    k.box(1.1, 2.9, 1.35, 0.55, 1.2, 0.25);
    k.color(0xffa800).box(0, 4.15, 1.75, 1.15, 0.38, 0.65);
    k.box(-0.85, 0.85, 0.8, 0.9, 0.28, 1.2).box(0.85, 0.85, 0.8, 0.9, 0.28, 1.2);
    k.glow(false);
    k.pop();
  }
}
