// feature/beijing-landmarks: Wanchun Pavilion, Jingshan (景山万春亭) — 1:1.
// 26 m imperial summit pavilion overlooking the Forbidden City from Jingshan peak:
// 2-tier white-marble terrace with 4 cardinal staircases & dragon spirit ramps, ancient summit cypresses,
// vermilion colonnade with golden dougong brackets & 万春亭 imperial plaques, triple-eave yellow glazed
// roof with gilded treasure finial, and the historic Ming Chongzhen Locust Tree site (罪己槐) on the east slope.
import { C, hall, roof, terrace, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.4;

export const colliders = [
  { x: 0, z: 0, hw: 14, hd: 14, h: 26 },
];

const GOLD_FINIAL = 0xffdf48, PLAQUE_BLUE = 0x1b3468, BRONZE = 0x5c482c, PINE = 0x2b5430, TRUNK = 0x4e3928;

export function build(k) {
  const hi = k.hi;

  // 1. Two-Tier Marble & Stone Terrace on Summit (y = 0 .. 3.2 m)
  // Tier 1: 32 x 28 m, h = 1.6 m with marble balustrades
  terrace(k, 0, 0, 0, 32, 28, 1.6, { rail: true, glow: true, railSpacing: 2.0 });

  // South overlook projection platform facing Forbidden City (-Z)
  k.color(C.MARBLE);
  k.box(0, 0, -15.5, 14.0, 1.6, 3.5);
  rail(k, -6.8, -17.2, 6.8, -17.2, 1.6, { h: 1.05, spacing: 1.8 });

  // Tier 2: 24 x 22 m, h = 1.6 m with balustrades
  terrace(k, 0, 1.6, 0, 24, 22, 1.6, { rail: true, glow: true, railSpacing: 1.8 });

  if (hi) {
    // 4 Cardinal Marble Staircases with Central Carved Dragon Spirit Ramps (丹陛)
    for (let d = 0; d < 4; d++) {
      k.push().rotateY((d * Math.PI) / 2);
      const zOut = d % 2 === 0 ? (d === 0 ? -17.2 : -14.0) : -16.0;
      const zIn = d % 2 === 0 ? -11.0 : -12.0;
      // Lower flight steps
      for (let s = 0; s < 6; s++) {
        k.color(C.MARBLE).box(0, s * 0.26, zOut - 2.4 + s * 0.42, 4.6, 0.28, 0.5);
      }
      // Upper flight steps up to Tier 2 (y = 1.6 .. 3.2)
      for (let s = 0; s < 6; s++) {
        k.color(C.MARBLE).box(0, 1.6 + s * 0.26, zIn - 2.2 + s * 0.38, 4.2, 0.28, 0.45);
      }
      // Central sloped cloud-and-dragon spirit stone slab
      k.color(C.MARBLE_DK).strut([0, 1.65, zIn - 2.1], [0, 3.22, zIn], 1.3);
      k.pop();
    }

    // Twin Bronze Incense Burners (铜香炉) on the South Overlook Terrace
    for (const sx of [-4.6, 4.6]) {
      k.color(C.MARBLE).box(sx, 1.6, -15.5, 1.3, 0.35, 1.3);
      k.color(BRONZE).cyl(sx, 1.95, -15.5, 0.52, 0.38, 0.9, 8);
      k.sphere(sx, 2.95, -15.5, 0.55, 8, 5);
      k.cyl(sx, 3.45, -15.5, 0.28, 0.08, 0.55, 6);
    }

    // Seated Golden Vairochana Buddha (毗卢遮那佛) on Lotus Throne inside the Ground Floor Pavilion
    k.color(C.MARBLE).cyl(0, 3.6, 0, 2.2, 2.4, 0.8, 12);
    k.glow(true).color(GOLD_FINIAL);
    k.cyl(0, 4.4, 0, 1.65, 1.85, 0.55, 12); // Golden lotus petals
    k.cyl(0, 4.95, 0, 1.15, 0.85, 2.2, 10); // Seated torso
    k.sphere(0, 7.55, 0, 0.52, 8, 6);       // Head
    k.cyl(0, 8.0, 0, 0.38, 0.15, 0.45, 8);  // Five-Buddha crown
    k.glow(false);

    // Ancient Jingshan Summit Cypress Trees around the terrace perimeter
    for (const [tx, tz, th] of [[-14.5, -12.5, 7.5], [14.5, -12.5, 7.8], [-14.5, 12.5, 8.2], [14.5, 12.5, 7.2]]) {
      k.color(TRUNK).cyl(tx, 0, tz, 0.36, 0.24, th * 0.45, 6);
      k.color(PINE).sphere(tx, th * 0.58, tz, 2.4, 8, 5, 0.85).sphere(tx, th * 0.82, tz, 1.8, 8, 5, 0.8);
    }

    // Historic Ming Chongzhen Emperor Locust Tree & Memorial Stele (明思宗殉国处碑, East foot x = 18.5, z = 4.0)
    k.color(TRUNK).cyl(18.5, 0, 4.0, 0.42, 0.28, 4.2, 6);
    k.strut([18.5, 3.2, 4.0], [19.8, 5.2, 3.2], 0.22);
    k.color(PINE).sphere(19.2, 5.6, 3.6, 2.2, 8, 5, 0.75);
    k.color(C.MARBLE).box(17.2, 0, 1.8, 0.9, 0.35, 0.55);
    k.color(0x88847c).box(17.2, 0.35, 1.8, 0.72, 2.1, 0.22); // Carved stone stele
  }

  // 2. Triple-Eave Summit Pavilion (y = 3.2 .. 26.0 m)
  // Ground floor hall with lower skirt eave (y = 3.2 .. 10.5 m)
  hall(k, {
    x: 0, z: 0, y0: 3.2, w: 17.0, d: 17.0, bays: 5, baysD: 5, colH: 4.8, colR: 0.36,
    base: { h: 0.4, margin: 1.8, rail: true, stairs: [] },
    roof: "xieshan", double: false, rise: 3.2, lift: 1.0, ribs: 0.7, glow: true, glowRoof: true, doors: "all",
  });

  // Middle floor with waist skirt eave (y = 9.5 .. 16.5 m)
  k.color(C.RED);
  k.box(0, 9.5, 0, 12.0, 3.8, 12.0);
  if (hi) {
    // Golden &青绿 Dougong bracket friezes and lattice windows on middle & upper tiers
    for (let f = 0; f < 4; f++) {
      k.push().rotateY((f * Math.PI) / 2);
      k.color(C.DOUGONG).box(0, 8.0, -8.55, 16.8, 0.45, 0.35);
      k.box(0, 12.4, -6.05, 12.2, 0.45, 0.35);
      k.box(0, 18.8, -4.85, 9.8, 0.45, 0.35);
      // Imperial blue-and-gold plaque "万春亭" under the South (-Z) upper & middle eaves
      if (f === 0) {
        for (const [py, pz, pw, ph] of [[12.1, -6.2, 2.2, 0.95], [18.5, -5.0, 1.9, 0.85]]) {
          k.color(GOLD_FINIAL).box(0, py, pz, pw, ph, 0.14);
          k.color(PLAQUE_BLUE).box(0, py + 0.08, pz - 0.04, pw - 0.2, ph - 0.16, 0.12);
          k.glow(true).color(GOLD_FINIAL);
          for (const dx of [-0.45, 0, 0.45]) k.box(dx, py + ph * 0.35, pz - 0.09, 0.22, 0.28, 0.08);
          k.glow(false);
        }
      }
      k.pop();
    }
  }
  roof(k, 0, 12.8, 0, 8.2, 8.2, 3.0, {
    type: "pyramid", lift: 1.1, glow: true, tEnd: 0.65,
  });

  // Upper floor with grand pyramid roof and gold finial (y = 15.5 .. 26.0 m)
  hall(k, {
    x: 0, z: 0, y0: 15.5, w: 9.6, d: 9.6, bays: 3, baysD: 3, colH: 3.6, colR: 0.32,
    base: { h: 0.3, margin: 1.0, rail: false, stairs: [] },
    roof: "pyramid", double: false, rise: 5.5, lift: 1.3, ribs: 0.6, glow: true, glowRoof: true, doors: "all",
  });

  // Gilded treasure finial on the summit (鎏金宝顶, y = 23.5 .. 26.5 m)
  k.glow(true).color(GOLD_FINIAL);
  if (hi) k.cyl(0, 23.6, 0, 1.35, 0.95, 0.65, 12); // Carved lotus base of finial
  k.sphere(0, 24.6, 0, 1.1, 14, 8);
  if (hi) k.cyl(0, 25.3, 0, 0.72, 0.85, 0.35, 10); // Cloud collar
  k.cyl(0, 25.6, 0, 0.45, 0.08, 1.2, 10);
  k.glow(false);
}
