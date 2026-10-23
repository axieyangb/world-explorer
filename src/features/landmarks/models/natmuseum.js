// feature/beijing-landmarks: National Museum of China (中国国家博物馆) — 1:1.
// 313 x 149 m monument (42.5 m high) facing Tiananmen Square (-Z when heading 270).
// 24 colossal square colonnade columns, green glazed tile eaves, and modern central atrium.
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

  // 2. West Historic Monumental Portico (24 Colossal Square Columns at Z = -62)
  const colXMin = -57.5, colXMax = 57.5;
  k.color(COL_STONE);
  for (let c = 0; c < 24; c++) {
    const cx = colXMin + c * ((colXMax - colXMin) / 23);
    k.box(cx, 4.6, -62.0, 1.9, 28.2, 1.9);
    // Base & capital
    k.box(cx, 4.6, -62.0, 2.5, 0.9, 2.5);
    k.box(cx, 32.0, -62.0, 2.4, 0.8, 2.4);
  }

  // Recessed ambulatory & bronze entrance wall (Z = -54.0)
  k.color(CREAM_WALL);
  k.box(0, 4.6, -54.0, 126, 28.2, 8.0);

  // 3 Monumental bronze portals with gilded lintels
  k.color(BRONZE);
  for (const dx of [-28, 0, 28]) {
    k.box(dx, 4.6, -58.2, 14.0, 12.0, 0.8);
    k.glow(true).color(GLAZED_GOLD);
    k.box(dx, 16.0, -58.3, 14.4, 1.2, 0.7);
    k.color(WARM_LIGHT);
    k.box(dx, 5.0, -58.3, 12.0, 10.0, 0.4);
    k.glow(false);
  }

  // Gilded Museum Inscription Plaque ("中国国家博物馆")
  k.glow(true).color(GLAZED_GOLD);
  k.box(0, 25.5, -58.3, 20.0, 4.5, 0.6);
  k.glow(false);

  // Portico Entablature: cream stone + green glazed tile cornice + gold trim
  k.color(CREAM_WALL);
  k.box(0, 32.8, -58.0, 122, 2.8, 16.0);
  k.color(GLAZED_GREEN);
  k.box(0, 35.6, -58.0, 124, 1.2, 17.5);
  k.glow(true).color(GLAZED_GOLD);
  k.box(0, 36.6, -58.0, 125, 0.6, 18.0);
  k.glow(false);

  // 3. North & South Historic Colonnade Wings
  for (const xs of [-1, 1]) {
    const wingX = xs * 105.0;
    // Wing hall body
    k.color(CREAM_WALL);
    k.box(wingX, 4.6, -42.0, 86, 33.4, 34);

    // Front pilasters
    k.color(COL_STONE);
    for (let c = -6; c <= 6; c++) {
      k.box(wingX + c * 6.5, 4.6, -58.5, 1.6, 28.0, 1.6);
    }

    // Wing green glazed eaves
    k.color(GLAZED_GREEN);
    k.box(wingX, 35.6, -42.0, 88, 1.2, 36);
    k.glow(true).color(GLAZED_GOLD);
    k.box(wingX, 36.6, -42.0, 89, 0.6, 37);
    k.glow(false);
  }

  // 4. Modern Expansion Central Atrium & East Hall (gmp 2011)
  k.color(0xb0a89e);
  k.box(0, 4.6, 18.0, 280, 37.0, 88);
  // Roof lanterns / skylight louvers
  k.color(0x78726a);
  k.box(0, 41.6, 18.0, 260, 0.9, 76);
}
