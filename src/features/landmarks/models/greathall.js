// feature/beijing-landmarks: Great Hall of the People (人民大会堂) — 1:1.
// 336 x 206 m tripartite neoclassical palace (46.5 m high) facing Tiananmen Square (-Z when heading 90).
// 12 monumental fluted marble columns (25 m tall), National Emblem, and green-and-gold glazed eaves.
export const lodDist = 1800;
export const glowStrength = 2.2;

export const colliders = [
  { x: 0, z: 0, hw: 95, hd: 165, h: 46.5 },
];

const GRANITE_PODIUM = 0xcecaa0;
const CREAM_STONE = 0xece6da;
const MARBLE_COL = 0xf8f4ec;
const LOGGIA_SHADOW = 0x48423c;
const GLAZED_GREEN = 0x2a764a;
const GLAZED_GOLD = 0xf8c630;
const EMBLEM_RED = 0xd72620;
const WARM_UPLIGHT = 0xffe091;
const BRONZE_DOORS = 0x443628;
const WINDOW = 0x3b4148;
const ROOF = 0xb3b0a6;
const CREAM_DK = 0xd9d1c1;

/** Window rhythm on a wall facing -Z at depth z (local), centred x, width w: n bays, two storeys of dark windows between pilaster strips. */
function facade(k, x, z, w, rotY, n) {
  k.push().translate(x, 0, z).rotateY(rotY);
  const bay = w / n;
  for (let i = 0; i < n; i++) {
    const bx = -w / 2 + (i + 0.5) * bay;
    k.color(WINDOW);
    k.box(bx, 9.5, -0.12, bay * 0.42, 5.2, 0.12);
    k.box(bx, 18.0, -0.12, bay * 0.42, 6.4, 0.12);
    k.color(CREAM_DK);
    k.box(bx - bay / 2, 4.8, -0.2, 0.7, 25.6, 0.2);
  }
  k.pop();
}

export function build(k) {
  const hi = k.hi;

  // 1. Monumental Elevated Granite Podium Base (346 m NS x 194 m EW x 4.8 m High)
  // Local frame: X = NS (South = +X, North = -X), Z = EW (East/Front = -Z, West/Back = +Z)
  k.color(GRANITE_PODIUM);
  k.box(0, 0, 0, 340, 4.8, 192);

  // Grand East Staircase descending toward Tiananmen Square (Z = -96 to -106)
  k.box(0, 0, -101, 140, 4.8, 10);
  k.box(-105, 0, -99, 110, 4.8, 6);
  k.box(105, 0, -99, 110, 4.8, 6);

  // 2. Central Section (Auditorium & East Grand Entrance Portico)
  // Central Hall Main Body
  k.color(CREAM_STONE);
  k.box(0, 4.8, 0, 146, 32.0, 130);

  // Portico Loggia recess facing East (-Z)
  const portZ = -65.0;
  k.color(LOGGIA_SHADOW);
  k.box(0, 4.8, portZ, 126, 25.0, 6.0);

  // Monumental Bronze Portals & Warm Loggia Glow
  k.color(BRONZE_DOORS);
  k.box(0, 4.8, portZ - 2.5, 96, 9.6, 0.8);
  k.glow(true).color(WARM_UPLIGHT);
  k.box(0, 7.5, portZ - 2.8, 92, 6.0, 0.4);
  k.glow(false);

  // 12 Colossal Fluted Marble Columns (25 m Tall, 2.7 m Diameter, at Z = -72.0)
  const colXOffsets = [
    -55.0, -45.2, -35.6, -26.2, -17.0, -6.6,
    6.6, 17.0, 26.2, 35.6, 45.2, 55.0
  ];
  k.color(MARBLE_COL);
  for (const cx of colXOffsets) {
    k.cyl(cx, 4.8, -72.0, 1.35, 1.25, 25.0, 12);
    // Base & capital lighting
    k.glow(true).color(WARM_UPLIGHT);
    k.box(cx, 4.8, -72.0, 3.2, 0.5, 3.2);
    k.box(cx, 29.4, -72.0, 3.4, 0.5, 3.4);
    k.glow(false);
  }

  // Portico Entablature, Attic & Green-Gold Glazed Tile Eaves
  k.color(CREAM_STONE);
  k.box(0, 29.8, -70.0, 134, 4.5, 14);

  // Green glazed tile frieze & gold trim
  k.color(GLAZED_GREEN);
  k.box(0, 34.3, -70.0, 136, 1.8, 16);
  k.glow(true).color(GLAZED_GOLD);
  k.box(0, 36.1, -70.0, 138, 0.6, 17);
  k.glow(false);

  // Attic wall above portico
  k.color(CREAM_STONE);
  k.box(0, 36.7, -68.0, 124, 7.5, 12);

  // National Emblem of the PRC (国徽, centered on East attic facade)
  k.glow(true).color(EMBLEM_RED);
  k.cyl(0, 40.5, -74.2, 2.8, 2.8, 0.35, 16);
  k.color(GLAZED_GOLD);
  k.cyl(0, 40.5, -74.4, 2.2, 2.2, 0.2, 16);
  k.glow(false);

  // 3. North Wing (State Banquet Hall) & South Wing (NPC Standing Committee)
  for (const xs of [-1, 1]) {
    const wingX = xs * 108.0;
    // Wing hall body
    k.color(CREAM_STONE);
    k.box(wingX, 4.8, 5.0, 92, 26.0, 150);

    // Front colonnade along the East facade (stands proud of the wall at z = -70)
    k.color(MARBLE_COL);
    for (let c = -9; c <= 9; c++) {
      k.box(wingX + c * 4.75, 4.8, -71.0, 1.7, 24.4, 1.7);
    }
    if (hi) facade(k, wingX, -70, 92, 0, 19);

    // Wing green glazed eaves: a tiled band round the parapet with a gold lip; the flat roof itself is grey
    k.color(ROOF);
    k.box(wingX, 30.8, 5.0, 94, 1.4, 152);
    k.color(GLAZED_GREEN);
    for (const [ex, ez, ew, ed] of [[0, -76, 96, 2], [0, 86, 96, 2], [-47, 5, 2, 154], [47, 5, 2, 154]]) k.box(wingX + ex, 30.8, ez, ew, 1.6, ed);
    k.glow(true).color(GLAZED_GOLD);
    for (const [ex, ez, ew, ed] of [[0, -77, 97, 0.6], [0, 87, 97, 0.6], [-48, 5, 0.6, 155], [48, 5, 0.6, 155]]) k.box(wingX + ex, 32.4, ez, ew, 0.5, ed);
    k.glow(false);
  }

  if (hi) {
    for (const xs of [-1, 1]) {
      facade(k, xs * 108, 80, 92, Math.PI, 19);                         // west (back) faces
      k.push().translate(xs * 154, 0, 5).rotateY(-xs * Math.PI / 2);
      facade(k, 0, 0, 150, 0, 30);                                       // north / south end faces
      k.pop();
    }
    // balustrade along the podium edge and the stair cheeks
    k.color(CREAM_STONE);
    k.box(0, 4.8, -96.4, 340, 1.1, 0.6).box(0, 4.8, 96.4, 340, 1.1, 0.6);
    k.box(-170.2, 4.8, 0, 0.6, 1.1, 192).box(170.2, 4.8, 0, 0.6, 1.1, 192);
    k.color(GRANITE_PODIUM);
    for (let i = 1; i <= 4; i++) k.box(0, 0, -96 - i * 2.5, 140, 4.8 - i * 0.96, 2.5); // grand stair treads
  }

  // 4. Central Grand Auditorium High Roof Dome / Deck
  k.color(0xb9b7ad);
  k.box(0, 36.8, 15.0, 100, 9.7, 90);
  k.box(0, 44.5, 15.0, 72, 2.0, 68);
}
