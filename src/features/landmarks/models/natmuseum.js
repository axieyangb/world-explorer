// feature/beijing-landmarks: National Museum of China (中国国家博物馆) — 1:1.
// 313 x 149 m monument (42.5 m high) facing Tiananmen Square (-Z when heading 270).
// 24 colossal square colonnade columns, green glazed tile eaves, and modern central atrium.
import { rail } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 2.2;

export const colliders = [
  { x: 0, z: 0, hw: 155, hd: 85, h: 42.5 },
];

const GRANITE_PODIUM = 0xc8c2b4;
const MARBLE_WHITE = 0xebe8df;
const COL_STONE = 0xe4ded2;
const CREAM_WALL = 0xded8cc;
const GLAZED_GREEN = 0x2a764a;
const GLAZED_GOLD = 0xf8c630;
const BRONZE = 0x483e34;
const WARM_LIGHT = 0xffe296;

export function build(k) {
  const hi = k.hi;

  // 1. Stepped Granite Podium & White Marble Stylobate (y = 0 .. 4.6 m)
  // Local frame: X = NS (North = +X, South = -X), Z = EW (West/Front = -Z, East/Back = +Z)
  k.color(GRANITE_PODIUM);
  k.box(0, 0, 0, 319, 3.2, 155);
  k.color(MARBLE_WHITE);
  k.box(0, 3.2, 0, 315, 1.4, 151);

  // Grand West Staircase descending toward Tiananmen Square (Z = -74 to -82)
  k.color(GRANITE_PODIUM);
  k.box(0, 0, -78, 140, 3.2, 8);
  k.color(MARBLE_WHITE);
  k.box(0, 3.2, -76, 134, 1.4, 4);

  if (hi) {
    // Stepped granite treads & 5 marble stair ramps along the 140m West Grand Staircase
    for (let s = 0; s < 8; s++) {
      k.color(GRANITE_PODIUM).box(0, s * 0.56, -82.5 + s * 0.95, 136, 0.56, 1.0);
    }
    for (const rx of [-67, -34, 0, 34, 67]) {
      k.color(MARBLE_WHITE).taper(rx, 0.2, -78.5, 0.85, 8.5, 0.85, 1.5, 4.8, 0, 3.5);
    }
    // White Hanbaiyu marble balustrades along West Podium Terrace flanking the grand staircase
    rail(k, -156, -68, -75, 4.6, 22, 1.2);
    rail(k, 68, 156, -75, 4.6, 22, 1.2);
  }

  // 2. West Historic Monumental Portico (24 Colossal Square Columns at Z = -62 + Inner Row of 12 Columns at Z = -58)
  const colXMin = -57.5, colXMax = 57.5;
  for (let c = 0; c < 24; c++) {
    const cx = colXMin + c * ((colXMax - colXMin) / 23);
    k.color(COL_STONE).box(cx, 4.6, -62.0, 1.9, 28.2, 1.9);
    k.color(GRANITE_PODIUM).box(cx, 4.6, -62.0, 2.5, 1.1, 2.5);
    k.color(COL_STONE).box(cx, 32.0, -62.0, 2.4, 0.8, 2.4);
    if (hi) {
      // Carved lotus pedestal & gilded scroll frieze capital + vertical fluting
      k.color(MARBLE_WHITE).box(cx, 5.7, -62.0, 2.2, 0.45, 2.2);
      k.color(GLAZED_GOLD).box(cx, 31.4, -62.0, 2.25, 0.6, 2.25);
      k.color(0xd0c8ba).box(cx, 6.2, -62.0, 1.98, 25.0, 0.55).box(cx, 6.2, -62.0, 0.55, 25.0, 1.98);
      if (c % 2 === 0) {
        // Inner colonnade row in deep portico ambulatory
        k.color(COL_STONE).box(cx, 4.6, -57.8, 1.8, 28.2, 1.8);
      }
    }
  }

  // Recessed ambulatory & bronze entrance wall (Z = -54.0)
  k.color(CREAM_WALL);
  k.box(0, 4.6, -54.0, 126, 28.2, 8.0);

  // 5 Monumental bronze portals with gilded lintels & tall coffered lattice windows
  for (const dx of [-44, -22, 0, 22, 44]) {
    const isMain = Math.abs(dx) <= 22;
    const pw = isMain ? 12.5 : 9.5, ph = isMain ? 13.5 : 11.5;
    k.color(BRONZE).box(dx, 4.6, -58.2, pw, ph, 0.8);
    k.glow(true).color(GLAZED_GOLD).box(dx, 4.6 + ph - 0.6, -58.3, pw + 0.6, 1.1, 0.7);
    k.color(WARM_LIGHT).box(dx, 5.0, -58.3, pw - 1.8, ph - 2.0, 0.4);
    k.glow(false);
    if (hi) {
      // Upper tall bronze-framed coffered windows above portals
      k.color(BRONZE).box(dx, 20.0, -58.15, pw * 0.78, 9.5, 0.5);
      k.glow(true).color(WARM_LIGHT).box(dx, 20.5, -58.2, pw * 0.66, 8.5, 0.3);
      k.glow(false);
    }
  }

  // Gilded Museum Inscription Plaque ("中国国家博物馆")
  k.color(MARBLE_WHITE).box(0, 25.2, -62.8, 21.0, 4.8, 0.7);
  k.glow(true).color(GLAZED_GOLD).box(0, 25.5, -63.0, 19.8, 4.2, 0.6);
  if (hi) {
    // 7 3D golden calligraphy characters on plaque
    k.glow(false).color(0x9e1b1b).box(0, 25.7, -63.1, 19.0, 3.6, 0.5);
    k.glow(true).color(GLAZED_GOLD);
    for (let i = 0; i < 7; i++) {
      k.box(-7.5 + i * 2.5, 26.5, -63.4, 1.6, 2.0, 0.2);
    }
  }
  k.glow(false);

  // Portico Entablature: cream stone + green glazed tile cornice + gold trim
  k.color(CREAM_WALL).box(0, 32.8, -58.0, 122, 2.8, 16.0);
  k.color(GLAZED_GREEN).box(0, 35.6, -58.0, 124, 1.2, 17.5);
  k.glow(true).color(GLAZED_GOLD).box(0, 36.6, -58.0, 125, 0.6, 18.0);
  k.glow(false);

  // 3. North & South Historic Colonnade Wings & Courtyard Courtyards
  for (const xs of [-1, 1]) {
    const wingX = xs * 105.0;
    // Wing hall body
    k.color(CREAM_WALL).box(wingX, 4.6, -42.0, 86, 33.4, 34);

    // Front & side pilasters + tall museum gallery windows between pilasters
    for (let c = -6; c <= 6; c++) {
      const px = wingX + c * 6.5;
      k.color(COL_STONE).box(px, 4.6, -58.5, 1.6, 28.0, 1.6);
      k.box(px, 4.6, -25.0, 1.6, 28.0, 1.6);
      if (hi && c < 6) {
        const wx = px + 3.25;
        k.color(BRONZE).box(wx, 7.2, -59.05, 3.6, 21.5, 0.35);
        k.glow(true).color(WARM_LIGHT).box(wx, 7.8, -59.15, 2.9, 20.2, 0.2);
        k.glow(false);
        // Horizontal window transoms
        k.color(COL_STONE);
        for (const ty of [13.5, 20.5]) k.box(wx, ty, -59.2, 3.6, 0.55, 0.35);
      }
    }
    if (hi) {
      // North/South end-facade pilasters & windows (facing Chang'an Ave at X = +148 and South at X = -148)
      const endX = xs * 148.2;
      for (let z = -54; z <= 54; z += 9) {
        k.color(COL_STONE).box(endX, 4.6, z, 1.4, 31.0, 1.6);
        if (z < 54) {
          k.color(BRONZE).box(endX, 8.0, z + 4.5, 0.5, 21.0, 4.2);
          k.glow(true).color(WARM_LIGHT).box(endX, 8.6, z + 4.5, 0.6, 19.6, 3.4);
          k.glow(false);
        }
      }
      // Dougong golden bracket frieze along wing entablature
      k.glow(true).color(GLAZED_GOLD);
      for (let c = -6; c <= 6; c++) {
        k.box(wingX + c * 6.5, 34.2, -59.6, 2.8, 1.1, 0.5);
      }
      k.glow(false);
    }

    // Wing green glazed eaves
    k.color(GLAZED_GREEN).box(wingX, 35.6, -42.0, 88, 1.2, 36);
    k.glow(true).color(GLAZED_GOLD).box(wingX, 36.6, -42.0, 89, 0.6, 37);
    k.glow(false);
  }

  // 4. Modern Expansion Central Atrium & East Hall (gmp 2011)
  k.color(0xb0a89e).box(0, 4.6, 18.0, 292, 37.0, 96);
  // Green-and-gold glazed cornice encircling the entire modern expansion roof
  k.color(GLAZED_GREEN).box(0, 40.2, 18.0, 295, 1.2, 99);
  k.glow(true).color(GLAZED_GOLD).box(0, 41.2, 18.0, 296, 0.6, 100);
  k.glow(false);

  // Roof lanterns & coffered skylight louver grid across the 260m central hall roof
  k.color(0x78726a).box(0, 41.8, 18.0, 260, 0.9, 76);
  if (hi) {
    for (let x = -110; x <= 110; x += 22) {
      for (let z = -12; z <= 48; z += 20) {
        k.glow(false).color(CREAM_WALL).box(x, 42.7, z, 16, 1.4, 14);
        k.glow(true).color(WARM_LIGHT).box(x, 44.1, z, 14, 0.35, 12);
      }
    }
    // East Facade (Z = +66) modern colonnade of 18 square granite pillars
    k.glow(false).color(COL_STONE);
    for (let x = -102; x <= 102; x += 12) {
      k.box(x, 4.6, 66.5, 1.8, 35.4, 1.8);
    }
  }
}
