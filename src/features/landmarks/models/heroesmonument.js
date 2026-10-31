// feature/beijing-landmarks: Monument to the People's Heroes (人民英雄纪念碑) — 1:1.
// 37.94 m granite obelisk in the center of Tiananmen Square, on a double-tiered white-marble
// Sumeru terrace with 8 historical marble bas-reliefs, 8 carved floral wreath garlands, and gold inscriptions ("人民英雄永垂不朽").
import { C, terrace, rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.0;

export const colliders = [
  { x: 0, z: 0, hw: 18, hd: 18, h: 4.5 },
  { x: 0, z: 0, hw: 3.5, hd: 2.5, h: 37.94 },
];

const GRANITE = 0x8a847a;
const GRANITE_LT = 0xa39d93;
const RELIEF = 0xe8e4da;
const GOLD = 0xdfb438;
const PINE = 0x2c5c34;

export function build(k) {
  const hi = k.hi;

  // 1. Two-Tier White Hanbaiyu Marble Terrace Base with 4 Directional Ceremonial Staircases
  terrace(k, 0, 0, 0, 50, 50, 1.6, { rail: true, glow: true, railSpacing: 2.2 });
  terrace(k, 0, 1.6, 0, 32, 32, 1.8, { rail: true, glow: true, railSpacing: 2.0 });

  if (hi) {
    // 4 Directional Hanbaiyu marble ceremonial staircases with central cloud-carved Danbi ramps
    for (const s of [-1, 1]) {
      for (let st = 0; st < 6; st++) {
        const sy = st * 0.56, o = 26.8 - st * 1.4;
        k.color(C.MARBLE).box(0, sy, s * o, 9.2, 0.56, 1.5);
        k.box(s * o, sy, 0, 1.5, 0.56, 9.2);
      }
      // Central imperial cloud-carved stone ramp (丹陛) on N & S axes
      k.color(C.MARBLE_SH).taper(0, 0.1, s * 22.5, 2.4, 8.8, 2.4, 1.5, 3.35, 0, -s * 3.5);
    }
    // Surrounding pine & cypress hedge border boxes around the monument apron
    for (const sx of [-28, 28]) {
      k.color(C.MARBLE_SH).box(sx, 0, 0, 4.2, 0.55, 42);
      for (let pz = -18; pz <= 18; pz += 6) {
        k.color(PINE).cone(sx, 0.55, pz, 1.6, 3.6, 8);
      }
    }
  }

  // 2. Lower Sumeru Pedestal with 8 Historical Bas-Relief Panels (大须弥座, y = 3.4 .. 6.6 m)
  k.color(C.MARBLE).box(0, 3.4, 0, 13.8, 0.85, 11.8);
  k.color(RELIEF).box(0, 4.25, 0, 13.0, 2.0, 11.0);
  if (hi) {
    // Multi-figure 3D sculpted historical bas-relief friezes around all 4 sides of the Sumeru waist
    for (const zs of [-1, 1]) {
      for (let p = -1; p <= 1; p++) {
        const px = p * 3.8, pz = zs * 5.56;
        k.color(C.MARBLE_SH).box(px, 4.4, pz, 3.4, 1.65, 0.16);
        // Sculpted heroic figures inside each relief panel
        k.color(C.MARBLE);
        for (let f = -2; f <= 2; f++) {
          k.cyl(px + f * 0.58, 4.5, pz + zs * 0.08, 0.16, 0.12, 1.15, 6);
          k.sphere(px + f * 0.58, 5.75, pz + zs * 0.08, 0.12, 6, 4);
        }
      }
    }
    for (const xs of [-1, 1]) {
      for (const pz of [-2.4, 2.4]) {
        const px = xs * 6.56;
        k.color(C.MARBLE_SH).box(px, 4.4, pz, 0.16, 1.65, 4.2);
        k.color(C.MARBLE);
        for (let f = -2; f <= 2; f++) {
          k.cyl(px + xs * 0.08, 4.5, pz + f * 0.68, 0.16, 0.12, 1.15, 6);
          k.sphere(px + xs * 0.08, 5.75, pz + f * 0.68, 0.12, 6, 4);
        }
      }
    }
    // Corner carved pillar pilasters on the Sumeru pedestal
    k.color(C.MARBLE);
    for (const sx of [-6.5, 6.5]) for (const sz of [-5.5, 5.5]) {
      k.box(sx, 4.25, sz, 0.65, 2.0, 0.65);
    }
  }
  // Pedestal lotus cornice cap
  k.color(C.MARBLE).box(0, 6.25, 0, 14.0, 0.85, 12.0);

  // 3. Upper Sumeru Pedestal (小须弥座, y = 7.1 .. 10.2 m) with 8 Carved Floral Wreath Garlands (peony, lotus, chrysanthemum)
  k.color(GRANITE).box(0, 7.1, 0, 10.2, 1.7, 8.2);
  k.color(GRANITE_LT).box(0, 8.8, 0, 9.2, 1.4, 7.2);
  if (hi) {
    // 8 Carved White Marble Floral Wreaths (花环) around the upper pedestal waist
    k.glow(true).color(C.MARBLE);
    for (const zs of [-1, 1]) {
      for (const wx of [-2.4, 2.4]) {
        k.push().translate(wx, 9.5, zs * 3.68).rotateX(Math.PI / 2);
        k.torus(0, 0, 0, 0.52, 0.16, 12, 8);
        k.pop();
      }
    }
    for (const xs of [-1, 1]) {
      for (const wz of [-1.8, 1.8]) {
        k.push().translate(xs * 4.68, 9.5, wz).rotateZ(Math.PI / 2);
        k.torus(0, 0, 0, 0.52, 0.16, 12, 8);
        k.pop();
      }
    }
    k.glow(false);
  }

  // 4. Stele Shaft (碑身, y = 10.2 .. 35.5 m) — 100-ton Qingdao granite monolith with bevelled border frame & scroll volutes
  k.color(GRANITE_LT).taper(0, 10.2, 0, 6.8, 5.0, 5.8, 4.2, 25.3);
  if (hi) {
    // Carved raised border moulding & side scrolling cloud-volute bands up the East & West flanks
    k.color(GRANITE);
    for (let y = 11.5; y <= 33.5; y += 2.2) {
      const f = (y - 10.2) / 25.3;
      const w = 6.8 - 1.0 * f, d = 5.0 - 0.8 * f;
      k.box(-w * 0.5 - 0.08, y, 0, 0.22, 1.4, d * 0.72);
      k.box(w * 0.5 + 0.08, y, 0, 0.22, 1.4, d * 0.72);
    }
  }

  // Inscriptions: North face (+Z, facing Tiananmen Gate): Mao Zedong's "人民英雄永垂不朽" in 2.2m high gilded bronze characters
  k.glow(true).color(GOLD);
  for (let i = 0; i < 8; i++) {
    const cy = 32.2 - i * 2.55;
    const f = (cy - 10.2) / 25.3;
    const zFace = (5.0 - 0.8 * f) * 0.5 + 0.06;
    k.box(0, cy, zFace, 1.35, 1.65, 0.1);
    if (hi) {
      k.box(0, cy + 0.4, zFace + 0.05, 1.55, 0.28, 0.08);
      k.box(0, cy, zFace + 0.05, 0.32, 1.75, 0.08);
      k.box(-0.45, cy - 0.2, zFace + 0.05, 0.25, 0.9, 0.08);
      k.box(0.45, cy - 0.2, zFace + 0.05, 0.25, 0.9, 0.08);
    }
  }

  // South face (-Z): Zhou Enlai's 150-character calligraphy epitaph in gilded bronze
  for (let col = -3; col <= 3; col++) {
    for (let r = 0; r < 8; r++) {
      const cy = 31.0 - r * 2.1;
      const f = (cy - 10.2) / 25.3;
      const zFace = -((5.0 - 0.8 * f) * 0.5 + 0.06);
      k.box(col * 0.62, cy, zFace, 0.38, 0.68, 0.06);
    }
  }
  k.glow(false);

  // 5. Crown (碑顶, y = 35.5 .. 37.94 m): Traditional Chinese Lus顶 (盝顶) hipped granite roof with carved ridge & corner eaves
  k.color(GRANITE).box(0, 35.5, 0, 6.4, 0.65, 4.8);
  k.color(GRANITE_LT).taper(0, 36.15, 0, 6.8, 5.2, 2.8, 1.6, 1.55);
  k.color(GRANITE).box(0, 37.7, 0, 3.0, 0.28, 1.8);
  if (hi) {
    // 4 Corner hip ridges & red-star ornament on top of the Lus roof
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.strut([sx * 1.4, 37.7, sz * 0.8], [sx * 3.45, 36.15, sz * 2.65], 0.24);
    }
  }
}
