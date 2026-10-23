// feature/beijing-landmarks: CCTV Headquarters (中央广播电视总台总部大楼) — 1:1.
// 234 m continuous folded loop of two 6-degree leaning towers connected by an L-shaped base
// and a dramatic 75 m cantilever overhang skybridge suspended 162 m in the air.
export const lodDist = 2000;
export const glowStrength = 2.5;

export const colliders = [
  { x: -40, z: -30, hw: 28, hd: 28, h: 234 },
  { x: 40, z: 35, hw: 26, hd: 26, h: 210 },
  { x: -10, z: 20, hw: 45, hd: 36, h: 198 },
];

const GLASS = 0x28384a;
const STEEL = 0x8c98a6;
const STEEL_LIT = 0xacd2ff;
const PLAZA = 0x48505a;

export function build(k) {
  const hi = k.hi;

  // 1. Broad Plaza Podium Base
  k.color(PLAZA);
  k.box(0, 0, 0, 188, 1.2, 178);
  k.box(0, 1.2, 0, 178, 1.2, 168);

  // 2. Horizontal L-shaped Media Production Podium
  // North wing along z = -42
  k.color(GLASS);
  k.box(0, 2.4, -42, 156, 37.6, 46);
  k.color(STEEL);
  k.box(0, 40.0, -42, 157, 1.2, 47);

  // East wing along x = +52
  k.color(GLASS);
  k.box(52, 2.4, 15.5, 46, 31.6, 115);
  k.color(STEEL);
  k.box(52, 34.0, 15.5, 47, 1.2, 116);

  // Reflecting pool in southwest courtyard
  k.glow(true).color(0x325f8c);
  k.box(-20, 2.5, 20, 36, 0.4, 36);
  k.glow(false);

  // 3. Leaning Tower 1 (North-West, 234 m tall)
  // Continuous inward lean dx=+22 m, dz=+22 m
  const t1_pts = [
    [2.4, -52, -42, 52],
    [64, -46.2, -36.2, 49],
    [128, -40.2, -30.2, 46],
    [185, -34.6, -24.6, 43.5],
    [234, -30.0, -20.0, 42],
  ];

  for (let i = 0; i < t1_pts.length - 1; i++) {
    const [y0, x0, z0, w0] = t1_pts[i];
    const [y1, x1, z1, w1] = t1_pts[i + 1];
    k.color(GLASS);
    k.taper((x0 + x1) / 2, y0, (z0 + z1) / 2, w0, w0, w1, w1, y1 - y0, x1 - x0, z1 - z0);
    // Diagrid corner struts
    k.color(STEEL);
    for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      k.strut([x0 + sx * w0, y0, z0 + sz * w0], [x1 + sx * w1, y1, z1 + sz * w1], 1.2);
    }
  }

  // Tower 1 crown & antenna
  k.color(STEEL);
  k.box(-30, 234, -20, 34, 4.5, 34);
  k.glow(true).color(STEEL_LIT);
  k.cyl(-30, 238.5, -20, 1.4, 0.35, 17.5, 8);
  k.glow(false);

  // 4. Leaning Tower 2 (South-East, 210 m tall)
  // Continuous inward lean dx=-22 m, dz=-22 m
  const t2_pts = [
    [2.4, 52, 48, 50],
    [60, 45.9, 41.9, 47],
    [120, 39.5, 35.5, 44.5],
    [175, 33.7, 29.7, 42],
    [210, 30.0, 26.0, 40],
  ];

  for (let i = 0; i < t2_pts.length - 1; i++) {
    const [y0, x0, z0, w0] = t2_pts[i];
    const [y1, x1, z1, w1] = t2_pts[i + 1];
    k.color(GLASS);
    k.taper((x0 + x1) / 2, y0, (z0 + z1) / 2, w0, w0, w1, w1, y1 - y0, x1 - x0, z1 - z0);
    k.color(STEEL);
    for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      k.strut([x0 + sx * w0, y0, z0 + sz * w0], [x1 + sx * w1, y1, z1 + sz * w1], 1.2);
    }
  }

  // Tower 2 crown
  k.color(STEEL);
  k.box(30, 210, 26, 32, 4.0, 32);

  // 5. The Dramatic 75 m Cantilever Skybridge Overhang (162 m .. 198 m)
  // Arm A (N-S wing from Tower 1 Southward)
  k.color(GLASS);
  k.box(-33.0, 162, 12.5, 38, 36, 69);
  k.color(STEEL);
  k.box(-33.0, 198, 12.5, 39, 1.5, 70);

  // Arm B (E-W wing from Tower 2 Westward to meet Arm A)
  k.color(GLASS);
  k.box(-10.5, 162, 28, 83, 36, 38);
  k.color(STEEL);
  k.box(-10.5, 198, 28, 84, 1.5, 39);

  // 6. External Diagrid Bracing across Cantilever Faces
  if (hi) {
    k.color(STEEL);
    // Arm A West facade
    for (let t = 0; t < 3; t++) {
      const y0 = 162 + t * 12.0, y1 = y0 + 12.0;
      for (let s = 0; s < 3; s++) {
        const z0 = -22 + s * 23.0, z1 = z0 + 23.0;
        k.strut([-52.0, y0, z0], [-52.0, y1, z1], 0.8);
        k.strut([-52.0, y0, z1], [-52.0, y1, z0], 0.8);
      }
    }
    // Arm B South facade
    for (let t = 0; t < 3; t++) {
      const y0 = 162 + t * 12.0, y1 = y0 + 12.0;
      for (let s = 0; s < 3; s++) {
        const x0 = -52 + s * 27.6, x1 = x0 + 27.6;
        k.strut([x0, y0, 47.0], [x1, y1, 47.0], 0.8);
        k.strut([x1, y0, 47.0], [x0, y1, 47.0], 0.8);
      }
    }

    // Glowing night window ribbons on cantilever soffit
    k.glow(true).color(STEEL_LIT);
    k.box(-33.0, 161.8, 12.5, 28, 0.4, 60);
    k.box(-10.5, 161.8, 28, 70, 0.4, 28);
    k.glow(false);
  }
}
