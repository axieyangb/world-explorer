/**
 * feature/famous-landmarks — landmark registry (pure data, no THREE: also imported by the chunk worker).
 *
 * Each entry: id (= models/<id>.js), lat/lon of the structure centre, heading (deg clockwise from north
 * that the model's local -Z "front" faces), real height (m, ground to tip), and the suppression footprint
 * in model-local metres: { r } circle or { hw, hd } box (rotated by heading). OSM buildings whose centroid
 * falls inside the footprint are dropped so the hand-built model replaces them. `on: false` = not built yet.
 * Optional `ele` = real ground elevation (m ASL) at the centre: the DEM is lifted there with a smooth summit bump
 * when the coarse/misregistered DEM is too low (e.g. Corcovado).
 */
export const LANDMARKS = [
  // --- New York
  { id: "liberty", name: "Statue of Liberty", nameZh: "自由女神像", lat: 40.68925, lon: -74.0445, heading: 140, height: 93, supp: { r: 52 }, on: true, chip: true },
  { id: "empire", name: "Empire State Building", nameZh: "帝国大厦", lat: 40.74844, lon: -73.98566, heading: 29, height: 443, supp: { hw: 66, hd: 31 }, on: true, chip: true },
  { id: "chrysler", name: "Chrysler Building", nameZh: "克莱斯勒大厦", lat: 40.75162, lon: -73.97545, heading: 29, height: 319, supp: { hw: 32, hd: 27 }, on: true },
  { id: "onewtc", name: "One World Trade Center", nameZh: "世界贸易中心一号楼", lat: 40.713058, lon: -74.013149, heading: 30, height: 541, supp: { hw: 33, hd: 33 }, on: true }, // centre = OSM footprint centroid (was ~40 m SW, so OSM drew a second 417 m tower beside it)
  // --- Paris / Europe
  { id: "eiffel", name: "Eiffel Tower", nameZh: "埃菲尔铁塔", lat: 48.85826, lon: 2.2945, heading: 136, height: 330, supp: { r: 72 }, on: true },
  { id: "arcdetriomphe", name: "Arc de Triomphe", nameZh: "凯旋门", lat: 48.87378, lon: 2.29504, heading: 115, height: 50, supp: { hw: 26, hd: 14 }, on: true },
  { id: "westminster", name: "Palace of Westminster & Big Ben", nameZh: "威斯敏斯特宫与大本钟", lat: 51.499516, lon: -0.124725, heading: 10.4, height: 98, supp: { hw: 56, hd: 142 }, on: true, chip: true },
  { id: "londoneye", name: "London Eye", nameZh: "伦敦眼", lat: 51.503428, lon: -0.120140, heading: 290, height: 135, supp: { r: 45 }, on: true },
  { id: "towerbridge", name: "Tower Bridge", nameZh: "伦敦塔桥", lat: 51.505505, lon: -0.07537, heading: 22.9, height: 65, supp: { hw: 20, hd: 142 }, deck: { y: 10, hw: 9, hd: 146 }, on: true }, // [release-6-integ] deck: level road deck top (m above model base) the OSM bridge ways are pinned to; heading -6.4 -> 22.9 + centre nudged 1.5 m onto the OSM carriageway (was ~29 deg off; road ran into the piers)
  { id: "brandenburg", name: "Brandenburg Gate", nameZh: "勃兰登堡门", lat: 52.51628, lon: 13.3777, heading: 90, height: 26, supp: { hw: 34, hd: 8 }, on: true },
  { id: "colosseum", name: "Colosseum", nameZh: "罗马斗兽场", lat: 41.89021, lon: 12.49223, heading: 25, height: 48, supp: { r: 96 }, on: true },
  { id: "pisa", name: "Leaning Tower of Pisa", nameZh: "比萨斜塔", lat: 43.72297, lon: 10.39659, heading: 0, height: 56, supp: { r: 12 }, on: true},
  { id: "stbasil", name: "St Basil's Cathedral", nameZh: "圣瓦西里大教堂", lat: 55.75253, lon: 37.62308, heading: 0, height: 48, supp: { r: 34 }, on: true },
  // --- San Francisco
  { id: "coit", name: "Coit Tower", nameZh: "科伊特塔", lat: 37.80239, lon: -122.40582, heading: 270, height: 64, supp: { r: 21 }, on: true},
  { id: "transamerica", name: "Transamerica Pyramid", nameZh: "泛美金字塔", lat: 37.79518, lon: -122.40279, heading: 0, height: 260, supp: { hw: 30, hd: 30 }, on: true, chip: true },
  { id: "salesforce", name: "Salesforce Tower", nameZh: "Salesforce 大厦", lat: 37.7897, lon: -122.39689, heading: 45, height: 326, supp: { hw: 40, hd: 40 }, on: true },
  { id: "palacefinearts", name: "Palace of Fine Arts", nameZh: "艺术宫", lat: 37.80285, lon: -122.44833, heading: 90, height: 49, supp: { r: 60 }, on: true },
  { id: "ferrybuilding", name: "Ferry Building", nameZh: "渡轮大厦", lat: 37.79552, lon: -122.39346, heading: 225, height: 75, supp: { hw: 104, hd: 24 }, on: true },
  // --- Americas
  { id: "spaceneedle", name: "Space Needle", nameZh: "太空针塔", lat: 47.62051, lon: -122.3493, heading: 0, height: 184, supp: { r: 24 }, on: true },
  { id: "gatewayarch", name: "Gateway Arch", nameZh: "圣路易斯拱门", lat: 38.62468, lon: -90.1849, heading: 108, height: 192, supp: { hw: 104, hd: 26 }, on: true },
  { id: "cntower", name: "CN Tower", nameZh: "加拿大国家电视塔", lat: 43.64257, lon: -79.38706, heading: 0, height: 553, supp: { r: 34 }, on: true },
  { id: "christ", name: "Christ the Redeemer", nameZh: "基督救世主像", lat: -22.9519, lon: -43.2105, heading: 100, height: 38, supp: { r: 55 }, ele: 710, on: true }, // supp r 55: drops the summit lift/escalator blocks OSM stands 40-50 m W of the statue as 23 m office towers; ele: real ground ASL; Terrarium puts Corcovado ~150 m west and ~60 m low, so fetchGlobalDem lifts terrain here
  // --- Asia / Oceania / Middle East / Africa
  { id: "operahouse", name: "Sydney Opera House", nameZh: "悉尼歌剧院", lat: -33.85678, lon: 151.2153, heading: 337, height: 65, supp: { hw: 70, hd: 100 }, on: true },
  { id: "harbourbridge", name: "Sydney Harbour Bridge", nameZh: "悉尼海港大桥", lat: -33.85234, lon: 151.21071, heading: 10, height: 134, supp: { hw: 30, hd: 290 }, on: true },
  { id: "taj", name: "Taj Mahal", nameZh: "泰姬陵", lat: 27.175024, lon: 78.042084, heading: 180, height: 73, supp: { hw: 56, hd: 56 }, on: true }, // centre on the OSM plinth (was 6.5 m E); wider box drops the OSM minarets that stood beside the modelled ones
  { id: "burj", name: "Burj Khalifa", nameZh: "哈利法塔", lat: 25.1972, lon: 55.27437, heading: 0, height: 828, supp: { r: 60 }, on: true },
  { id: "tokyotower", name: "Tokyo Tower", nameZh: "东京塔", lat: 35.65858, lon: 139.74543, heading: 0, height: 333, supp: { r: 50 }, on: true },
  { id: "skytree", name: "Tokyo Skytree", nameZh: "东京晴空塔", lat: 35.71006, lon: 139.8107, heading: 0, height: 634, supp: { r: 40 }, on: true },
  { id: "pearl", name: "Oriental Pearl Tower", nameZh: "东方明珠", lat: 31.241901, lon: 121.495265, heading: 83, height: 468, supp: { r: 50 }, on: true }, // centre + leg bearing from the OSM tower parts (was ~490 m SE of the real tower, which OSM then drew a second time)
  { id: "petronas", name: "Petronas Towers", nameZh: "双子塔", lat: 3.15797, lon: 101.71176, heading: 318, height: 452, supp: { hw: 78, hd: 47 }, on: true },
  { id: "marinabaysands", name: "Marina Bay Sands", nameZh: "滨海湾金沙", lat: 1.28357, lon: 103.86058, heading: 293.7, height: 200, supp: { hw: 172, hd: 62 }, on: true },
  { id: "khufu", name: "Great Pyramid of Giza", nameZh: "胡夫金字塔", lat: 29.97917, lon: 31.13417, heading: 0, height: 139, supp: { hw: 118, hd: 118 }, groundR: 125, on: true },
  { id: "khafre", name: "Pyramid of Khafre", nameZh: "哈夫拉金字塔", lat: 29.97611, lon: 31.13083, heading: 0, height: 136, supp: { hw: 110, hd: 110 }, groundR: 115, on: true },
  { id: "menkaure", name: "Pyramid of Menkaure", nameZh: "孟卡拉金字塔", lat: 29.9725, lon: 31.12833, heading: 0, height: 61, supp: { hw: 54, hd: 54 }, groundR: 58, on: true },
  { id: "sphinx", name: "Great Sphinx", nameZh: "狮身人面像", lat: 29.97527, lon: 31.13764, heading: 90, height: 20, supp: { hw: 12, hd: 40 }, on: true },
  // --- Beijing (feature/beijing-landmarks). WGS84 / OSM-aligned positions (NOT GCJ-02 map coords). `replaces` lists
  // the old src/landmarks_40.js ids that are disabled while this entry is on (each landmark renders in one system only).
  { id: "tiananmen", name: "Tiananmen Gate", nameZh: "天安门", lat: 39.907338, lon: 116.391265, heading: 178.25, height: 34.7, supp: { hw: 62, hd: 24 }, replaces: ["tiananmen_rostrum"], on: true, chip: true },
  { id: "forbiddencity", name: "Forbidden City", nameZh: "故宫（紫禁城）", lat: 39.916662, lon: 116.390813, heading: 180, height: 35, supp: { hw: 378, hd: 482 }, replaces: ["wumen", "taihedian", "zhonghedian", "baohedian", "shenwumen"], on: true },
  { id: "heroesmonument", name: "Monument to the People's Heroes", nameZh: "人民英雄纪念碑", lat: 39.903197, lon: 116.391422, heading: 180, height: 37.94, supp: { hw: 34, hd: 36 }, replaces: [], on: true }, // centred on the OSM monument terrace (was 29 m S, so OSM extruded the terrace to 38 m as a block over the model); supp covers the terrace's stepped parts
  { id: "greathall", name: "Great Hall of the People", nameZh: "人民大会堂", lat: 39.90344, lon: 116.387089, heading: 90, height: 46.5, supp: { hw: 160, hd: 105 }, replaces: ["great_hall_of_the_people"], on: true },
  { id: "natmuseum", name: "National Museum of China", nameZh: "中国国家博物馆", lat: 39.903729, lon: 116.39579, heading: 270, height: 42.5, supp: { hw: 160, hd: 100 }, replaces: ["national_museum_of_china"], on: true },
  { id: "maomausoleum", name: "Chairman Mao Memorial Hall", nameZh: "毛主席纪念堂", lat: 39.901107, lon: 116.391551, heading: 0, height: 33.6, supp: { hw: 56, hd: 56 }, replaces: [], on: true }, // centred on the OSM hall + colonnade (was 37 m S, so a ring of OSM columns stood in front of the model)
  { id: "taflagpole", name: "Tiananmen Square Flagpole", nameZh: "天安门广场国旗", lat: 39.905574, lon: 116.391302, heading: 180, height: 32.6, supp: { r: 6 }, replaces: [], on: true }, // on the OSM flag enclosure at the north end of the square (was 95 m N, on the far side of the avenue by the moat bridges)
  { id: "zhengyangmen", name: "Zhengyangmen Gate", nameZh: "正阳门", lat: 39.899171, lon: 116.391492, heading: 180, height: 43.7, supp: { hw: 52, hd: 26 }, replaces: ["qianmen_gate"], on: true },
  { id: "qianmenarrow", name: "Zhengyangmen Archery Tower", nameZh: "正阳门箭楼", lat: 39.898, lon: 116.391668, heading: 180, height: 35.4, supp: { hw: 34, hd: 20 }, replaces: ["zhengyangmen_arrow_tower"], on: true },
  { id: "qiniandian", name: "Hall of Prayer for Good Harvests", nameZh: "祈年殿", lat: 39.882257, lon: 116.406623, heading: 180, height: 38, supp: { r: 50 }, replaces: ["temple_of_heaven_qiniandian"], on: true },
  { id: "jingshan", name: "Wanchun Pavilion, Jingshan", nameZh: "景山万春亭", lat: 39.923524, lon: 116.390497, heading: 180, height: 62, supp: { r: 14 }, replaces: ["jingshan_wanchunting"], on: true },
  { id: "beihaidagoba", name: "White Dagoba, Beihai", nameZh: "北海白塔", lat: 39.924425, lon: 116.383025, heading: 180, height: 35.9, supp: { r: 18 }, replaces: ["beihai_white_dagoba"], on: true },
  { id: "birdsnest", name: "Beijing National Stadium (Bird's Nest)", nameZh: "国家体育场（鸟巢）", lat: 39.991459, lon: 116.390227, heading: 0, height: 69.2, supp: { hw: 165, hd: 150 }, replaces: ["birds_nest"], on: true },
  { id: "watercube", name: "National Aquatics Center (Water Cube)", nameZh: "国家游泳中心（水立方）", lat: 39.991576, lon: 116.384172, heading: 0, height: 31, supp: { hw: 89, hd: 89 }, replaces: ["water_cube"], on: true },
  { id: "cctv", name: "CCTV Headquarters", nameZh: "中央电视台总部大楼", lat: 39.913816, lon: 116.457966, heading: 0, height: 234, supp: { hw: 85, hd: 85 }, replaces: ["cctv_headquarters"], on: true },
  { id: "chinazun", name: "CITIC Tower (China Zun)", nameZh: "中信大厦（中国尊）", lat: 39.911501, lon: 116.460238, heading: 0, height: 528, supp: { hw: 40, hd: 40 }, replaces: ["china_zun"], on: true },
];

const _byId = new Map(LANDMARKS.map((l) => [l.id, l]));
export function getLandmark(id) { return _byId.get(id) || null; }

/** World XZ (x east, z south; metres from the world origin centre) of a landmark, or null if outside the 40 km world. */
export function landmarkWorldXZ(l, origin) {
  if (!origin) return null;
  const x = (l.lon - origin.centerLon) * origin.mPerDegLon;
  const z = (origin.centerLat - l.lat) * origin.mPerDegLat;
  if (Math.abs(x) > 19800 || Math.abs(z) > 19800) return null;
  return [x, z];
}

/** True if world point (wx, wz) lies inside landmark l (placed at lx, lz) suppression footprint. */
export function inLandmarkFootprint(l, lx, lz, wx, wz) {
  const dx = wx - lx, dz = wz - lz;
  const s = l.supp || { r: 20 };
  if (s.r) return dx * dx + dz * dz <= s.r * s.r;
  // model local frame: rotation.y = -heading  =>  local = R(+heading) * world
  const a = (l.heading || 0) * Math.PI / 180;
  const c = Math.cos(a), sn = Math.sin(a);
  const ux = dx * c + dz * sn;
  const uz = -dx * sn + dz * c;
  return Math.abs(ux) <= s.hw && Math.abs(uz) <= s.hd;
}

/** Returns fn(wx, wz) -> true when inside any enabled landmark footprint near this origin, or null if none. */
export function makeLandmarkSuppressor(origin) {
  const near = [];
  for (const l of LANDMARKS) {
    if (!l.on) continue;
    const p = landmarkWorldXZ(l, origin);
    if (p) near.push([l, p[0], p[1]]);
  }
  if (!near.length) return null;
  return (wx, wz) => {
    for (let i = 0; i < near.length; i++) {
      const [l, x, z] = near[i];
      if (inLandmarkFootprint(l, x, z, wx, wz)) return true;
    }
    return false;
  };
}
