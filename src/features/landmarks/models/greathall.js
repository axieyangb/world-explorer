// feature/beijing-landmarks: Great Hall of the People (人民大会堂) — 1:1.
// 336 x 206 m tripartite neoclassical palace (46.5 m high) facing Tiananmen Square (-Z when heading 90).
// 12 monumental fluted marble columns (25 m tall) with carved lotus bases & gilded scroll capitals,
// 5 Hanbaiyu marble cloud ramps & balustrades across the Red Carpet East Staircase, detailed 3D National Emblem
// flanked by 10 red flags, green-and-gold glazed eaves with dougong frieze, and 10,000-Seat Auditorium star dome.
import { C, rail } from "../cn_arch.js";

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

  // Grand East Staircase descending toward Tiananmen Square (Z = -96 to -108)
  k.box(0, 0, -101, 140, 4.8, 10);
  k.box(-105, 0, -99, 110, 4.8, 6);
  k.box(105, 0, -99, 110, 4.8, 6);

  // 2. Central Section (Auditorium & East Grand Entrance Portico)
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
  if (hi) {
    // 5 Grand Ceremonial Bronze-and-Glass Door Portals with gilded lattice transoms inside the East Loggia
    for (const dx of [-36, -18, 0, 18, 36]) {
      k.glow(false).color(CREAM_STONE).box(dx, 4.8, portZ - 2.95, 7.6, 10.8, 0.55);
      k.color(BRONZE_DOORS).box(dx, 4.8, portZ - 3.12, 6.2, 6.2, 0.35);
      k.glow(true).color(GLAZED_GOLD).box(dx, 11.2, portZ - 3.12, 6.2, 3.6, 0.32);
    }
  }
  k.glow(false);

  // 12 Colossal Fluted Marble Columns (25 m Tall, 2.7 m Diameter, at Z = -72.0)
  const colXOffsets = [
    -55.0, -45.2, -35.6, -26.2, -17.0, -6.6,
    6.6, 17.0, 26.2, 35.6, 45.2, 55.0,
  ];
  for (const cx of colXOffsets) {
    k.color(MARBLE_COL);
    k.cyl(cx, 4.8, -72.0, 1.35, 1.25, 25.0, hi ? 18 : 12);
    if (hi) {
      // Carved white-marble lotus pedestal base (莲花柱础), 12 vertical flute ribs & gilded scroll capital
      k.color(C.BALUSTRADE).box(cx, 4.8, -72.0, 3.5, 1.2, 3.5);
      k.cyl(cx, 6.0, -72.0, 1.62, 1.42, 0.85, 16);
      k.color(CREAM_DK);
      for (let f = 0; f < 12; f++) {
        const a = (f / 12) * Math.PI * 2;
        k.strut(
          [cx + Math.cos(a) * 1.37, 6.85, -72.0 + Math.sin(a) * 1.37],
          [cx + Math.cos(a) * 1.27, 28.5, -72.0 + Math.sin(a) * 1.27],
          0.11
        );
      }
      k.glow(true).color(GLAZED_GOLD).cyl(cx, 28.5, -72.0, 1.32, 1.72, 1.1, 16).glow(false);
    }
    // Base & capital lighting
    k.glow(true).color(WARM_UPLIGHT);
    k.box(cx, 4.8, -72.0, 3.2, 0.5, 3.2);
    k.box(cx, 29.4, -72.0, 3.4, 0.5, 3.4);
    k.glow(false);
  }

  // Portico Entablature, Attic & Green-Gold Glazed Tile Eaves
  k.color(CREAM_STONE);
  k.box(0, 29.8, -70.0, 134, 4.5, 14);

  // Green glazed tile frieze & gold trim + traditional golden dougong brackets
  k.color(GLAZED_GREEN);
  k.box(0, 34.3, -70.0, 136, 1.8, 16);
  k.glow(true).color(GLAZED_GOLD);
  k.box(0, 36.1, -70.0, 138, 0.6, 17);
  if (hi) {
    for (let bx = -64; bx <= 64; bx += 4.0) {
      k.box(bx, 33.6, -77.6, 1.2, 0.75, 0.9);
    }
  }
  k.glow(false);

  // Attic wall above portico
  k.color(CREAM_STONE);
  k.box(0, 36.7, -68.0, 124, 7.5, 12);

  // National Emblem of the PRC (国徽, centered on East attic facade) + 10 Red Silk Flags (红旗)
  k.glow(true).color(EMBLEM_RED);
  k.cyl(0, 40.5, -74.2, 2.8, 2.8, 0.35, 20);
  k.color(GLAZED_GOLD);
  k.cyl(0, 40.5, -74.4, 2.2, 2.2, 0.2, 20);
  if (hi) {
    // 3D golden wheat-sheaf outer ring, Tiananmen gate relief, cogwheel & 5 stars on the National Emblem
    k.color(EMBLEM_RED).cyl(0, 40.5, -74.48, 1.82, 1.82, 0.16, 16);
    k.color(GLAZED_GOLD);
    k.box(0, 39.6, -74.58, 1.5, 0.65, 0.14); // Tiananmen silhouette
    k.sphere(0, 41.5, -74.58, 0.32, 5, 4);    // central star
    for (const [sx, sy] of [[-0.85, 41.0], [-0.55, 41.6], [0.55, 41.6], [0.85, 41.0]]) {
      k.sphere(sx, sy, -74.58, 0.16, 5, 4);
    }
    // 10 Ceremonial Red Flags (5 on each side of the portico terrace)
    for (const side of [-1, 1]) {
      for (let f = 0; f < 5; f++) {
        const fx = side * (16 + f * 7.5), fz = -78.5;
        k.glow(false).color(GLAZED_GOLD).cyl(fx, 4.8, fz, 0.11, 0.06, 9.5, 6);
        k.glow(true).color(EMBLEM_RED).box(fx, 11.2, fz - 1.4, 0.16, 2.4, 2.8);
      }
    }
  }
  k.glow(false);

  // 3. North Wing (State Banquet Hall) & South Wing (NPC Standing Committee)
  for (const xs of [-1, 1]) {
    const wingX = xs * 108.0;
    k.color(CREAM_STONE);
    k.box(wingX, 4.8, 5.0, 92, 26.0, 150);

    // Front colonnade along the East facade (stands proud of the wall at z = -70)
    k.color(MARBLE_COL);
    for (let c = -9; c <= 9; c++) {
      k.box(wingX + c * 4.75, 4.8, -71.0, 1.7, 24.4, 1.7);
      if (hi) {
        k.color(C.BALUSTRADE).box(wingX + c * 4.75, 4.8, -71.0, 2.1, 0.85, 2.1);
        k.glow(true).color(GLAZED_GOLD).box(wingX + c * 4.75, 28.6, -71.0, 2.0, 0.65, 2.0).glow(false);
        k.color(MARBLE_COL);
      }
    }
    if (hi) facade(k, wingX, -70, 92, 0, 19);

    // Wing green glazed eaves
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
    // Hanbaiyu marble balustrade along the podium edge & 12-step Grand East Staircase with Red Carpet & 5 marble ramps
    rail(k, -170, 170, -96.0, 4.8, 56, 1.2, false);
    rail(k, -170, 170, 96.0, 4.8, 56, 1.2, false);
    for (let i = 1; i <= 10; i++) {
      const sz = -96 - i * 1.15, sy = 4.8 * (1 - i / 10);
      k.color(i % 2 ? GRANITE_PODIUM : CREAM_STONE).box(0, 0, sz, 140, sy, 1.2);
      // Central ceremonial Red Carpet runner down the East Grand Staircase
      k.color(EMBLEM_RED).box(0, sy + 0.02, sz, 16.0, 0.06, 1.22);
    }
    for (const rx of [-58, -28, 0, 28, 58]) {
      k.color(C.BALUSTRADE).strut([rx, 4.9, -96.0], [rx, 0.3, -107.5], 1.45);
    }
  }

  // 4. Central 10,000-Seat Grand Auditorium High Roof & Red Star Skylight Dome
  k.color(0xb9b7ad);
  k.box(0, 36.8, 15.0, 100, 7.7, 90);
  k.box(0, 44.5, 15.0, 72, 2.0, 68);
  if (hi) {
    // Glazed green & gold cornice around the Auditorium high roof + circular skylight dome
    k.color(GLAZED_GREEN).box(0, 43.2, 15.0, 102, 1.3, 92);
    k.glow(true).color(GLAZED_GOLD).box(0, 44.5, 15.0, 103, 0.45, 93);
    k.color(WARM_UPLIGHT).cyl(0, 46.5, 15.0, 16.5, 14.0, 1.4, 24);
    k.color(EMBLEM_RED).cyl(0, 47.9, 15.0, 4.5, 0.5, 0.8, 5);
    k.glow(false);
  }
}
