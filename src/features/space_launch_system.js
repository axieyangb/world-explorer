/**
 * Multi-Agency Rocket Launch Physics, Astronomically Accurate Real-Time Galaxy & Celestial Sphere,
 * Top-Down 3D Spherical Earth, and Live Real-Time Space Stations & Satellites System.
 *
 * Core Philosophy: Radical Simplicity & Progressive Disclosure
 * - Zero permanent HUD clutter on the ground: no extra buttons or banners while walking, driving, or flying.
 * - Secret Easter-Egg Discovery at the 6 Global Spaceports:
 *     1. SpaceX Starbase (Boca Chica, TX) — Starship & Super Heavy (121m, Hot-Stage Booster Catch Flip)
 *     2. NASA Kennedy Space Center LC-39B (FL) — SLS Block 1 & Orion MPCV (98m, Twin SRB Separation)
 *     3. Jiuquan Satellite Launch Center Pad 921 (China) — Long March 2F & Shenzhou (62m, 4 Strap-On Cross)
 *     4. Baikonur Cosmodrome Site 1/5 (Kazakhstan) — Soyuz-2.1a & Soyuz MS (46m, Iconic Korolev Cross)
 *     5. ESA Guiana Space Centre ELA-4 (Kourou) — Ariane 6 A64 (63m, 4 P120C Solid Boosters)
 *     6. JAXA Tanegashima Space Center (Japan) — H3 Launch Vehicle (63m, Twin SRB-3 Boosters)
 * - When within 650m of a spaceport pad on the ground, subtle cryogenic LOX vapor puffs vent from the rocket.
 * - Double-clicking / clicking near the rocket pad (or pressing E / F / Enter / Space within 200m) ignites the engines!
 * - Seamless transition from 1:1 pad liftoff & multi-stage booster separation -> Top-Down 3D Spherical Earth in Outer Space,
 *   aligned with the exact real-time J2000/GMST Milky Way Galaxy, Bright Star Catalog, real Sun/Moon ephemeris,
 *   and live ISS / Tiangong / Hubble / CelesTrak satellites!
 */

import * as THREE from "../../vendor/three.module.js";
import {
  json2satrec,
  sgp4,
  jday,
  gstime,
  eciToGeodetic,
} from "../../vendor/satellite.module.js";
import { getBeijingTerrainElevation } from "../environment.js";
import { landmarkWorldXZ } from "./landmarks/registry.js";
import { koppenAt } from "./flora_climate.js";
import { getLang } from "../i18n.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const R_EARTH = 1200; // 3D Spherical Earth radius in outer-space scene units (1 unit ≈ 5.31 km)
const KM_TO_UNIT = R_EARTH / 6371.0;

// ============================================================================
// 1. SIX AUTHENTIC GLOBAL SPACEPORTS & MULTI-STAGE ROCKET SPECIFICATIONS
// ============================================================================
export const SPACEPORTS = [
  {
    id: "spacex_starbase",
    nameEn: "SpaceX Starbase Orbital Launch Mount",
    nameZh: "SpaceX 星舰基地轨道发射台",
    agencyEn: "SpaceX",
    agencyZh: "SpaceX 太空探索技术公司",
    vehicleEn: "Starship & Super Heavy (IFT)",
    vehicleZh: "星舰与超重型助推器 (Starship)",
    spacecraftEn: "Starship S30 Orbital Ship",
    spacecraftZh: "星舰轨道飞船 (Starship)",
    lat: 25.9968,
    lon: -97.1545,
    padLocalX: 0,
    padLocalZ: -12,
    padBaseY: 17.0,
    heightM: 121,
    inclinationDeg: 26.5,
    stagingType: "hot_stage",
    plumeColorCore: 0xc8ebff,
    plumeColorOuter: 0x6b8cff,
    boosterCount: 1,
    boosterSepTime: 7.4,
    fairingSepTime: null,
  },
  {
    id: "nasa_ksc",
    nameEn: "NASA Kennedy Space Center LC-39B",
    nameZh: "NASA 肯尼迪航天中心 LC-39B",
    agencyEn: "NASA",
    agencyZh: "NASA 美国国家航空航天局",
    vehicleEn: "SLS Block 1 & Orion MPCV (Artemis)",
    vehicleZh: "太空发射系统 SLS 与猎户座飞船 (Artemis)",
    spacecraftEn: "Orion Crew Spacecraft (MPCV)",
    spacecraftZh: "猎户座载人飞船 (Orion MPCV)",
    lat: 28.6272,
    lon: -80.6209,
    padLocalX: 0,
    padLocalZ: 0,
    padBaseY: 19.0,
    heightM: 98,
    inclinationDeg: 28.5,
    stagingType: "twin_srb",
    plumeColorCore: 0xffe8b0,
    plumeColorOuter: 0xff8c2b,
    boosterCount: 2,
    boosterSepTime: 6.8,
    lesSepTime: 5.1,
    fairingSepTime: 10.2,
  },
  {
    id: "jiuquan",
    nameEn: "Jiuquan Satellite Launch Center Pad 921",
    nameZh: "中国酒泉卫星发射中心 921 发射工位",
    agencyEn: "CMSA / CNSA (中国载人航天)",
    agencyZh: "中国载人航天工程 (CMSA / CNSA)",
    vehicleEn: "Long March 2F (长征二号F) & Shenzhou",
    vehicleZh: "长征二号F 遥运载火箭与神舟飞船",
    spacecraftEn: "Shenzhou Crew Spacecraft (神舟载人飞船)",
    spacecraftZh: "神舟载人飞船 (Shenzhou)",
    lat: 40.9581,
    lon: 100.2911,
    padLocalX: 0,
    padLocalZ: 0,
    padBaseY: 6.0,
    heightM: 62,
    inclinationDeg: 41.5,
    stagingType: "quad_strapon",
    plumeColorCore: 0xfff0b8,
    plumeColorOuter: 0xff7722,
    boosterCount: 4,
    boosterSepTime: 6.6,
    lesSepTime: 4.8,
    fairingSepTime: 9.2,
  },
  {
    id: "baikonur",
    nameEn: "Baikonur Cosmodrome Site 1/5 (Gagarin's Start)",
    nameZh: "拜科努尔航天发射场一号加加林发射台",
    agencyEn: "Roscosmos",
    agencyZh: "俄罗斯国家航天集团 (Roscosmos)",
    vehicleEn: "Soyuz-2.1a & Soyuz MS",
    vehicleZh: "联盟-2.1a 运载火箭与联盟 MS 飞船",
    spacecraftEn: "Soyuz MS Crew Spacecraft",
    spacecraftZh: "联盟 MS 载人飞船 (Soyuz MS)",
    lat: 45.9203,
    lon: 63.3422,
    padLocalX: 0,
    padLocalZ: 0,
    padBaseY: 4.5,
    heightM: 46,
    inclinationDeg: 51.6,
    stagingType: "korolev_cross",
    plumeColorCore: 0xffe9aa,
    plumeColorOuter: 0xff8420,
    boosterCount: 4,
    boosterSepTime: 6.5,
    lesSepTime: 4.9,
    fairingSepTime: 9.3,
  },
  {
    id: "kourou_esa",
    nameEn: "ESA Guiana Space Centre ELA-4",
    nameZh: "欧洲航天局库鲁航天中心 ELA-4",
    agencyEn: "ESA / Arianespace",
    agencyZh: "欧洲航天局 (ESA / Arianespace)",
    vehicleEn: "Ariane 6 (A64 Heavy)",
    vehicleZh: "阿丽亚娜 6 号重型运载火箭 (Ariane 64)",
    spacecraftEn: "Ariane 6 ULPM & Deep-Space Payload",
    spacecraftZh: "阿丽亚娜 6 号轨道器与深空载荷",
    lat: 5.2360,
    lon: -52.7686,
    padLocalX: 0,
    padLocalZ: 0,
    padBaseY: 8.0,
    heightM: 63,
    inclinationDeg: 5.4,
    stagingType: "quad_srb",
    plumeColorCore: 0xfff2c2,
    plumeColorOuter: 0xff9436,
    boosterCount: 4,
    boosterSepTime: 6.7,
    fairingSepTime: 9.4,
  },
  {
    id: "tanegashima_jaxa",
    nameEn: "JAXA Tanegashima Space Center LP-2",
    nameZh: "日本种子岛宇宙中心吉信第二射点",
    agencyEn: "JAXA",
    agencyZh: "日本宇宙航空研究开发机构 (JAXA)",
    vehicleEn: "H3-22S Launch Vehicle",
    vehicleZh: "H3 主力运载火箭 (JAXA H3)",
    spacecraftEn: "ALOS / HTV-X Orbital Spacecraft",
    spacecraftZh: "HTV-X 新一代货运飞船载荷",
    lat: 30.4009,
    lon: 130.9777,
    padLocalX: 0,
    padLocalZ: 0,
    padBaseY: 8.7,
    heightM: 63,
    inclinationDeg: 30.4,
    stagingType: "twin_srb",
    plumeColorCore: 0xdff2ff,
    plumeColorOuter: 0xff9838,
    boosterCount: 2,
    boosterSepTime: 6.7,
    fairingSepTime: 9.4,
  },
];

const SPACEPORT_BY_ID = new Map(SPACEPORTS.map((s) => [s.id, s]));

// ============================================================================
// 2. ASTRONOMICALLY ACCURATE REAL-TIME J2000 / GMST CELESTIAL EPHEMERIS
// ============================================================================

/**
 * Converts geographic (latDeg, lonDeg) + radius to 3D Earth-Fixed coordinates
 * matching Three.js SphereGeometry equirectangular UV layout:
 *   +Y = North Pole (lat +90°), +X = Prime Meridian (lon 0°), -Z = +90°E, +Z = -90°W.
 */
export function latLonToVec3(latDeg, lonDeg, radius = R_EARTH, out = new THREE.Vector3()) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  out.set(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon)
  );
  return out;
}

/** Exact analytical inverse of latLonToVec3: 3D position -> { lat, lon } in degrees. */
export function vec3ToLatLon(vec) {
  const r = Math.hypot(vec.x, vec.y, vec.z) || 1;
  const lat = Math.asin(THREE.MathUtils.clamp(vec.y / r, -1, 1)) * RAD;
  const lon = Math.atan2(-vec.z, vec.x) * RAD;
  return { lat, lon };
}

/**
 * Computes exact real-time Julian Date (JD), days since J2000.0 (d),
 * Greenwich Mean Sidereal Time (GMST in degrees), Solar (RA, Dec, subsolar lat/lon),
 * and Lunar (RA, Dec, sublunar lat/lon) for `timestampMs` (defaults to `Date.now()`).
 */
export function computeRealTimeAstronomy(timestampMs = Date.now()) {
  const jd = timestampMs / 86400000 + 2440587.5;
  const d = jd - 2451545.0; // Days since J2000.0 epoch (2000-01-01 12:00 TT)

  // IAU Greenwich Mean Sidereal Time (degrees, 0..360)
  const gmstDeg = (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360;

  // Solar ephemeris (Meeus / USNO Astronomical Almanac low-precision formulas, accurate to ~0.01°)
  const L_sun = (((280.460 + 0.9856474 * d) % 360) + 360) % 360;
  const g_sun = (((357.528 + 0.9856003 * d) % 360) + 360) % 360 * DEG;
  const lambdaSun = (L_sun + 1.915 * Math.sin(g_sun) + 0.020 * Math.sin(2 * g_sun)) * DEG;
  const eps = (23.439 - 0.0000004 * d) * DEG;

  const sinLambda = Math.sin(lambdaSun);
  const cosLambda = Math.cos(lambdaSun);
  const raSunDeg = (((Math.atan2(Math.cos(eps) * sinLambda, cosLambda) * RAD) % 360) + 360) % 360;
  const decSunDeg = Math.asin(Math.sin(eps) * sinLambda) * RAD;

  // Geographic subsolar point on Earth at this exact UTC moment
  const sunLat = decSunDeg;
  const sunLon = ((((raSunDeg - gmstDeg) % 360) + 540) % 360) - 180;
  const sunDir = latLonToVec3(sunLat, sunLon, 1.0).normalize();

  // Lunar ephemeris (J2000 ecliptic longitude, latitude, and equatorial RA/Dec)
  const L_moon = (((218.316 + 13.176396 * d) % 360) + 360) % 360 * DEG;
  const M_moon = (((134.963 + 13.064993 * d) % 360) + 360) % 360 * DEG;
  const F_moon = (((93.272 + 13.229350 * d) % 360) + 360) % 360 * DEG;
  const lambdaMoon = L_moon + 6.289 * DEG * Math.sin(M_moon);
  const betaMoon = 5.128 * DEG * Math.sin(F_moon);

  const cosBeta = Math.cos(betaMoon);
  const sinBeta = Math.sin(betaMoon);
  const xm = cosBeta * Math.cos(lambdaMoon);
  const ym = cosBeta * Math.sin(lambdaMoon) * Math.cos(eps) - sinBeta * Math.sin(eps);
  const zm = cosBeta * Math.sin(lambdaMoon) * Math.sin(eps) + sinBeta * Math.cos(eps);
  const raMoonDeg = (((Math.atan2(ym, xm) * RAD) % 360) + 360) % 360;
  const decMoonDeg = Math.asin(THREE.MathUtils.clamp(zm, -1, 1)) * RAD;
  const moonLat = decMoonDeg;
  const moonLon = ((((raMoonDeg - gmstDeg) % 360) + 540) % 360) - 180;
  const moonDir = latLonToVec3(moonLat, moonLon, 1.0).normalize();

  // Galactic Center (Sgr A*: RA = 266.405°, Dec = -28.936°) sub-point on Earth right now
  const galCenterLat = -28.936;
  const galCenterLon = ((((266.405 - gmstDeg) % 360) + 540) % 360) - 180;

  return {
    jd,
    d,
    gmstDeg,
    raSunDeg,
    decSunDeg,
    sunLat,
    sunLon,
    sunDir,
    raMoonDeg,
    decMoonDeg,
    moonLat,
    moonLon,
    moonDir,
    galCenterLat,
    galCenterLon,
  };
}

/**
 * Exact IAU J2000 Galactic (lDeg, bDeg) -> J2000 Equatorial (raDeg, decDeg).
 * Verified:
 *   (l = 0°, b = 0°)   -> RA = 266.405°, Dec = -28.936° (Galactic Center Sgr A*)
 *   (l = *,  b = +90°) -> RA = 192.859°, Dec = +27.128° (North Galactic Pole)
 */
export function galacticToEquatorialJ2000(lDeg, bDeg) {
  const L_NODE = 32.93192 * DEG;     // Galactic longitude of ascending node on J2000 equator
  const RA_NODE = 282.85948 * DEG;   // RA of ascending node (192.85948° + 90°)
  const INCL_GAL = 62.87175 * DEG;   // Inclination of galactic plane to J2000 equator (90° - 27.12825°)

  const u = lDeg * DEG - L_NODE;
  const b = bDeg * DEG;
  const cosB = Math.cos(b);
  const x1 = cosB * Math.cos(u);
  const y1 = cosB * Math.sin(u);
  const z1 = Math.sin(b);

  const cosI = Math.cos(INCL_GAL);
  const sinI = Math.sin(INCL_GAL);
  const x2 = x1;
  const y2 = y1 * cosI - z1 * sinI;
  const z2 = y1 * sinI + z1 * cosI;

  const decDeg = Math.asin(THREE.MathUtils.clamp(z2, -1, 1)) * RAD;
  const raDeg = (((RA_NODE + Math.atan2(y2, x2)) * RAD) % 360 + 360) % 360;
  return { raDeg, decDeg };
}

/**
 * Curated J2000 Bright Star Catalog (60 navigation & constellation stars with true J2000 RA_deg, Dec_deg, Vmag, RGB hex).
 * Includes Polaris (aligned with Earth's North Pole!), Sirius, Canopus, Alpha Centauri, Arcturus, Vega, Capella,
 * Rigel, Betelgeuse, Orion's Belt, Southern Cross, Big Dipper, Cassiopeia, Scorpius, Cygnus, and Leo!
 */
export const BRIGHT_STARS_J2000 = [
  ["Polaris", 37.954, 89.264, 1.98, 0xfff4d8],
  ["Sirius", 101.287, -16.716, -1.46, 0xd8ecff],
  ["Canopus", 95.988, -52.696, -0.74, 0xfff7e4],
  ["Rigil Kentaurus", 219.902, -60.834, -0.27, 0xfff0c8],
  ["Arcturus", 213.915, 19.182, -0.05, 0xffbe76],
  ["Vega", 279.235, 38.784, 0.03, 0xd4e8ff],
  ["Capella", 79.172, 45.998, 0.08, 0xffeaad],
  ["Rigel", 78.634, -8.202, 0.13, 0xc2dfff],
  ["Procyon", 114.825, 5.225, 0.34, 0xfff5df],
  ["Achernar", 24.429, -57.237, 0.46, 0xc4e2ff],
  ["Betelgeuse", 88.793, 7.407, 0.50, 0xff8e4a],
  ["Hadar", 210.956, -60.373, 0.61, 0xc0dfff],
  ["Altair", 297.696, 8.868, 0.76, 0xe8f2ff],
  ["Acrux", 186.650, -63.099, 0.76, 0xbedeff],
  ["Aldebaran", 68.980, 16.509, 0.86, 0xff9c59],
  ["Antares", 247.352, -26.432, 0.96, 0xff7b42],
  ["Spica", 201.298, -11.161, 0.97, 0xc2e0ff],
  ["Pollux", 116.329, 28.026, 1.14, 0xffca8a],
  ["Fomalhaut", 344.413, -29.622, 1.16, 0xe6f0ff],
  ["Deneb", 310.358, 45.280, 1.25, 0xdceeff],
  ["Mimosa", 191.930, -59.689, 1.25, 0xbedeff],
  ["Regulus", 152.093, 11.967, 1.36, 0xcde4ff],
  ["Adhara", 104.656, -28.972, 1.50, 0xc2dfff],
  ["Castor", 113.650, 31.888, 1.58, 0xe8f2ff],
  ["Gacrux", 187.791, -57.113, 1.63, 0xff8a4e],
  ["Shaula", 263.402, -37.104, 1.62, 0xc2e0ff],
  ["Bellatrix", 81.283, 6.350, 1.64, 0xc2dfff],
  ["Elnath", 81.573, 28.608, 1.65, 0xcce6ff],
  ["Miaplacidus", 138.300, -69.717, 1.67, 0xe2eeff],
  ["Alnilam", 84.053, -1.202, 1.69, 0xc2dfff],
  ["Alnitak", 85.190, -1.943, 1.77, 0xc2dfff],
  ["Mintaka", 83.002, -0.299, 2.23, 0xc4e0ff],
  ["Saiph", 86.939, -9.669, 2.07, 0xc4e0ff],
  ["Alioth", 193.507, 55.960, 1.77, 0xeaf2ff],
  ["Dubhe", 165.932, 61.751, 1.79, 0xffcb8c],
  ["Merak", 165.460, 56.382, 2.37, 0xeaf2ff],
  ["Phecda", 178.458, 53.695, 2.44, 0xeaf2ff],
  ["Megrez", 183.857, 57.033, 3.31, 0xeef4ff],
  ["Mizar", 200.981, 54.925, 2.23, 0xeaf2ff],
  ["Alkaid", 206.885, 49.313, 1.86, 0xc4e0ff],
  ["Mirfak", 51.081, 49.861, 1.79, 0xfff1cf],
  ["Wezen", 107.098, -26.393, 1.83, 0xfff2d2],
  ["Sargas", 264.330, -42.998, 1.87, 0xfff0cc],
  ["Kaus Australis", 276.043, -34.385, 1.85, 0xcce6ff],
  ["Nunki", 283.816, -26.297, 2.05, 0xc4e0ff],
  ["Avior", 125.629, -59.509, 1.86, 0xffb36b],
  ["Menkalinan", 89.882, 44.948, 1.90, 0xeaf2ff],
  ["Atria", 252.166, -69.028, 1.91, 0xffaa5c],
  ["Alhena", 99.428, 16.399, 1.93, 0xeaf2ff],
  ["Peacock", 306.412, -56.735, 1.94, 0xc4e0ff],
  ["Alsephina", 131.176, -54.709, 1.96, 0xe6f0ff],
  ["Mirzam", 95.675, -17.956, 1.98, 0xc2dfff],
  ["Alphard", 141.897, -8.659, 1.98, 0xffab62],
  ["Hamal", 31.793, 23.462, 2.00, 0xffc07a],
  ["Diphda", 10.897, -17.987, 2.04, 0xffc47e],
  ["Alpheratz", 2.097, 29.090, 2.06, 0xd4e8ff],
  ["Schedar", 10.127, 56.537, 2.24, 0xffbe78],
  ["Caph", 2.295, 59.150, 2.28, 0xfff2d6],
  ["Gamma Cas", 14.177, 60.717, 2.15, 0xc0e0ff],
  ["Ruchbah", 21.454, 60.235, 2.68, 0xeaf2ff],
  ["Segin", 28.599, 63.670, 3.35, 0xc8e4ff],
  ["Kochab", 222.676, 74.156, 2.08, 0xffb870],
];

// Curated fallback NORAD GP orbital elements (ISS, Tiangong CSS, Hubble, Starlink, Beidou, GPS, Galileo, NOAA-21, Landsat 9)
const FALLBACK_ORBITAL_CATALOG = [
  {
    id: "iss",
    noradId: 25544,
    nameEn: "International Space Station (ISS)",
    nameZh: "国际空间站 (ISS · 25544)",
    agency: "NASA / Roscosmos / ESA / JAXA / CSA",
    kind: "iss",
    altKm: 418,
    speedKmh: 27580,
    inclinationDeg: 51.64,
    raanDeg: 142.5,
    argPerigeeDeg: 85.2,
    meanAnomalyDeg: 35.0,
    meanMotionRevDay: 15.495,
    color: 0x58d5ff,
  },
  {
    id: "tiangong",
    noradId: 48274,
    nameEn: "Tiangong Space Station (CSS 天宫)",
    nameZh: "中国天宫空间站 (CSS · 天和核心舱)",
    agency: "CMSA (中国载人航天)",
    kind: "tiangong",
    altKm: 392,
    speedKmh: 27630,
    inclinationDeg: 41.47,
    raanDeg: 218.0,
    argPerigeeDeg: 40.0,
    meanAnomalyDeg: 112.0,
    meanMotionRevDay: 15.592,
    color: 0xffc84a,
  },
  {
    id: "hubble",
    noradId: 20580,
    nameEn: "Hubble Space Telescope (HST)",
    nameZh: "哈勃空间望远镜 (HST · 20580)",
    agency: "NASA / ESA",
    kind: "hubble",
    altKm: 535,
    speedKmh: 27310,
    inclinationDeg: 28.47,
    raanDeg: 64.0,
    argPerigeeDeg: 150.0,
    meanAnomalyDeg: 210.0,
    meanMotionRevDay: 15.09,
    color: 0xc8a2ff,
  },
  {
    id: "shenzhou_19",
    noradId: 61782,
    nameEn: "Shenzhou Crew Relay / Tianzhou",
    nameZh: "神舟/天舟货运飞船组",
    agency: "CMSA",
    kind: "sat",
    altKm: 395,
    speedKmh: 27620,
    inclinationDeg: 41.48,
    raanDeg: 218.4,
    argPerigeeDeg: 45.0,
    meanAnomalyDeg: 94.0,
    meanMotionRevDay: 15.58,
    color: 0xff8a65,
  },
  {
    id: "starlink_3105",
    noradId: 58214,
    nameEn: "Starlink-G7-12 (V2 Mini)",
    nameZh: "星链卫星 Starlink V2 Mini",
    agency: "SpaceX",
    kind: "sat",
    altKm: 550,
    speedKmh: 27280,
    inclinationDeg: 53.05,
    raanDeg: 18.0,
    argPerigeeDeg: 90.0,
    meanAnomalyDeg: 15.0,
    meanMotionRevDay: 15.06,
    color: 0x90e0ff,
  },
  {
    id: "beidou_3m",
    noradId: 44793,
    nameEn: "BeiDou-3 M19 (BDS Navigation)",
    nameZh: "北斗三号全球导航卫星 (BDS)",
    agency: "CNSA",
    kind: "sat",
    altKm: 1420,
    speedKmh: 25420,
    inclinationDeg: 55.0,
    raanDeg: 295.0,
    argPerigeeDeg: 120.0,
    meanAnomalyDeg: 65.0,
    meanMotionRevDay: 12.8,
    color: 0xffdf70,
  },
  {
    id: "noaa_21",
    noradId: 54234,
    nameEn: "NOAA-21 (JPSS-2 Polar Weather)",
    nameZh: "NOAA-21 极轨气象卫星",
    agency: "NOAA / NASA",
    kind: "sat",
    altKm: 824,
    speedKmh: 26760,
    inclinationDeg: 98.7,
    raanDeg: 110.0,
    argPerigeeDeg: 25.0,
    meanAnomalyDeg: 180.0,
    meanMotionRevDay: 14.21,
    color: 0x72f2b8,
  },
  {
    id: "landsat_9",
    noradId: 49260,
    nameEn: "Landsat 9 Earth Observation",
    nameZh: "陆地卫星 9 号 (Landsat 9)",
    agency: "NASA / USGS",
    kind: "sat",
    altKm: 705,
    speedKmh: 26990,
    inclinationDeg: 98.2,
    raanDeg: 165.0,
    argPerigeeDeg: 75.0,
    meanAnomalyDeg: 280.0,
    meanMotionRevDay: 14.57,
    color: 0x80ffd4,
  },
  {
    id: "galileo_28",
    noradId: 50319,
    nameEn: "Galileo FOC FM24 Navigation",
    nameZh: "伽利略全球导航卫星 (ESA)",
    agency: "ESA",
    kind: "sat",
    altKm: 1380,
    speedKmh: 25510,
    inclinationDeg: 56.0,
    raanDeg: 35.0,
    argPerigeeDeg: 210.0,
    meanAnomalyDeg: 145.0,
    meanMotionRevDay: 12.9,
    color: 0x82b4ff,
  },
  {
    id: "gps_iii",
    noradId: 48859,
    nameEn: "GPS III SV05 (Navstar)",
    nameZh: "GPS III 全球定位卫星",
    agency: "USSF / NASA",
    kind: "sat",
    altKm: 1480,
    speedKmh: 25310,
    inclinationDeg: 55.1,
    raanDeg: 255.0,
    argPerigeeDeg: 310.0,
    meanAnomalyDeg: 230.0,
    meanMotionRevDay: 12.7,
    color: 0xa8d5ff,
  },
];

const FALLBACK_ASTRONAUTS = [
  { name: "Suni Williams", craft: "ISS" },
  { name: "Butch Wilmore", craft: "ISS" },
  { name: "Don Pettit", craft: "ISS" },
  { name: "Alexey Ovchinin", craft: "ISS" },
  { name: "Ivan Vagner", craft: "ISS" },
  { name: "Cai Xuzhe (蔡旭哲)", craft: "Tiangong" },
  { name: "Song Lingdong (宋令东)", craft: "Tiangong" },
  { name: "Wang Haoze (王浩泽)", craft: "Tiangong" },
];

// ============================================================================
// 3. PROCEDURAL + KÖPPEN-GEIGER 3D EARTH TEXTURES & CUSTOM SHADERS
// ============================================================================

function _hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function _fbmLatLon(lat, lon) {
  const x = (lon + 180) * 0.08;
  const y = (90 - lat) * 0.08;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = _hash2(ix, iy);
  const b = _hash2(ix + 1, iy);
  const c = _hash2(ix, iy + 1);
  const d = _hash2(ix + 1, iy + 1);
  const n1 = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  const n2 = Math.sin(lon * 0.23 + lat * 0.19) * 0.5 + 0.5;
  return n1 * 0.68 + n2 * 0.32;
}

// Major global metropolitan clusters for realistic night-hemisphere city lights
const GLOBAL_METRO_CLUSTERS = [
  // North America
  [40.71, -74.0, 7.5], [34.05, -118.24, 6.5], [41.88, -87.63, 5.8], [37.77, -122.42, 5.2],
  [29.76, -95.37, 5.5], [32.78, -96.8, 5.2], [25.76, -80.19, 4.8], [28.54, -81.38, 4.8],
  [38.9, -77.04, 5.5], [43.65, -79.38, 5.2], [19.43, -99.13, 6.2], [25.99, -97.15, 3.2],
  // Europe
  [51.5, -0.12, 6.8], [48.86, 2.35, 6.8], [52.52, 13.4, 5.8], [40.42, -3.7, 5.4],
  [41.9, 12.5, 5.4], [45.46, 9.19, 5.6], [52.37, 4.9, 5.5], [55.75, 37.62, 6.8],
  [50.08, 14.44, 4.8], [48.21, 16.37, 4.8], [59.33, 18.07, 4.4],
  // East & South Asia
  [39.9, 116.4, 8.2], [31.23, 121.47, 8.5], [22.54, 114.06, 7.8], [30.57, 104.07, 6.2],
  [34.26, 108.94, 5.6], [30.59, 114.3, 6.0], [40.96, 100.29, 3.4], [25.03, 121.56, 5.6],
  [35.68, 139.76, 8.2], [34.69, 135.5, 6.4], [37.56, 126.97, 7.2], [1.35, 103.82, 5.5],
  [13.75, 100.5, 5.8], [14.6, 120.98, 5.4], [-6.2, 106.85, 6.2],
  [28.61, 77.21, 7.5], [19.08, 72.88, 7.2], [12.97, 77.59, 6.0], [22.57, 88.36, 6.2],
  // Middle East & Africa
  [30.04, 31.24, 6.5], [25.2, 55.27, 5.8], [24.71, 46.67, 5.2], [32.08, 34.78, 4.8],
  [41.01, 28.98, 6.2], [-26.2, 28.05, 5.2], [6.52, 3.38, 5.4],
  // South America & Oceania
  [-23.55, -46.63, 7.2], [-22.91, -43.17, 5.8], [-34.6, -58.38, 6.4], [4.71, -74.07, 5.0],
  [-33.87, 151.21, 5.6], [-37.81, 144.96, 5.2],
];

function buildEarthTextures() {
  const W = 1024, H = 512;

  const dayCanvas = document.createElement("canvas");
  dayCanvas.width = W;
  dayCanvas.height = H;
  const dayCtx = dayCanvas.getContext("2d");
  const dayImg = dayCtx.createImageData(W, H);
  const dData = dayImg.data;

  const nightCanvas = document.createElement("canvas");
  nightCanvas.width = W;
  nightCanvas.height = H;
  const nightCtx = nightCanvas.getContext("2d");
  const nightImg = nightCtx.createImageData(W, H);
  const nData = nightImg.data;

  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = W;
  cloudCanvas.height = H;
  const cloudCtx = cloudCanvas.getContext("2d");
  const cloudImg = cloudCtx.createImageData(W, H);
  const cData = cloudImg.data;

  for (let py = 0; py < H; py++) {
    const lat = 90 - ((py + 0.5) / H) * 180;
    const absLat = Math.abs(lat);
    for (let px = 0; px < W; px++) {
      const lon = ((px + 0.5) / W) * 360 - 180;
      const idx = (py * W + px) * 4;
      const { cls, coastal } = koppenAt(lat, lon);
      const n = _fbmLatLon(lat, lon);

      let r = 14, g = 46, b = 96;
      let spec = 235; // Ocean specular mask (high on water, low on land)
      let cityGlow = 0;

      if (!cls) {
        // Open ocean / continental shelf bathymetry
        const latDepth = Math.cos(lat * DEG);
        if (absLat > 78 && n > 0.52) {
          // Polar pack ice
          r = 218; g = 232; b = 245; spec = 60;
        } else if (coastal) {
          // Turquoise-azure continental shelf & coral shoals
          r = Math.round(18 + 26 * latDepth + n * 16);
          g = Math.round(68 + 44 * latDepth + n * 20);
          b = Math.round(128 + 42 * latDepth + n * 18);
          spec = 245;
        } else {
          // Deep abyssal ocean
          r = Math.round(8 + 12 * latDepth + n * 8);
          g = Math.round(32 + 28 * latDepth + n * 12);
          b = Math.round(78 + 42 * latDepth + n * 18);
          spec = 250;
        }
      } else {
        spec = 18;
        // Land biomes from Köppen-Geiger climate classification
        if (cls === "EF" || (cls === "ET" && absLat > 66)) {
          // Glaciers, Antarctica, Greenland
          r = 236; g = 242; b = 248; spec = 45;
        } else if (cls === "ET") {
          // High-mountain Tibetan Plateau / Andes / Alpine tundra
          r = Math.round(138 + n * 38);
          g = Math.round(132 + n * 36);
          b = Math.round(118 + n * 34);
        } else if (cls === "BWh" || cls === "BWk") {
          // Sahara, Arabian, Gobi, Atacama, Australian Deserts
          const warm = cls === "BWh" ? 1.0 : 0.78;
          r = Math.round((196 + n * 38) * warm + (1 - warm) * 168);
          g = Math.round((162 + n * 32) * warm + (1 - warm) * 146);
          b = Math.round((112 + n * 24) * warm + (1 - warm) * 114);
        } else if (cls === "BSh" || cls === "BSk") {
          // Semi-arid steppe & Great Plains / Sahel / Kazakh Steppe
          r = Math.round(154 + n * 30);
          g = Math.round(142 + n * 28);
          b = Math.round(92 + n * 20);
        } else if (cls === "Af" || cls === "Am") {
          // Deep emerald Amazon / Congo / Indonesian rainforest
          r = Math.round(28 + n * 22);
          g = Math.round(84 + n * 32);
          b = Math.round(34 + n * 18);
        } else if (cls === "Aw" || cls === "As") {
          // Tropical savanna
          r = Math.round(68 + n * 34);
          g = Math.round(112 + n * 32);
          b = Math.round(46 + n * 20);
        } else if (cls[0] === "C") {
          // Temperate / Mediterranean / Subtropical (Europe, East China, US East/West)
          r = Math.round(52 + n * 32);
          g = Math.round(104 + n * 34);
          b = Math.round(48 + n * 22);
          if (coastal && n > 0.42) cityGlow = 0.45;
          else if (n > 0.62) cityGlow = 0.25;
        } else if (cls[0] === "D") {
          // Boreal taiga & continental forest
          const sub = cls[2] === "c" || cls[2] === "d";
          r = Math.round((sub ? 42 : 58) + n * 26);
          g = Math.round((sub ? 78 : 96) + n * 28);
          b = Math.round((sub ? 48 : 46) + n * 20);
          if (!sub && n > 0.58) cityGlow = 0.22;
        }

        // Boost city lights around real world metropolitan hubs
        if (absLat < 64) {
          for (let m = 0; m < GLOBAL_METRO_CLUSTERS.length; m++) {
            const mc = GLOBAL_METRO_CLUSTERS[m];
            const dLat = lat - mc[0];
            const dLon = (lon - mc[1]) * Math.cos(lat * DEG);
            const dist = Math.hypot(dLat, dLon);
            if (dist < mc[2]) {
              const falloff = Math.pow(1 - dist / mc[2], 1.7);
              cityGlow = Math.max(cityGlow, falloff * (0.65 + 0.35 * _hash2(px, py)));
            }
          }
        }
      }

      dData[idx] = Math.min(255, r);
      dData[idx + 1] = Math.min(255, g);
      dData[idx + 2] = Math.min(255, b);
      dData[idx + 3] = 255;

      // Night city lights (RGB) + Ocean Specular Mask (Alpha)
      const cg = Math.min(1, cityGlow);
      nData[idx] = Math.round(255 * cg);
      nData[idx + 1] = Math.round(198 * cg);
      nData[idx + 2] = Math.round(105 * cg);
      nData[idx + 3] = spec;

      // Cloud bands: ITCZ equatorial belt + mid-latitude cyclone swirls
      const itcz = Math.exp(-Math.pow(lat / 11, 2)) * 0.55;
      const midLat = Math.exp(-Math.pow((absLat - 48) / 16, 2)) * 0.5;
      const swirl =
        Math.sin(lon * 0.14 + Math.sin(lat * 0.18) * 2.4) * 0.5 +
        0.5;
      const cVal = THREE.MathUtils.clamp((n * 0.65 + swirl * 0.35) * (0.45 + itcz + midLat) - 0.26, 0, 1);
      const cByte = Math.round(cVal * 255);
      cData[idx] = 255;
      cData[idx + 1] = 255;
      cData[idx + 2] = 255;
      cData[idx + 3] = cByte;
    }
  }

  dayCtx.putImageData(dayImg, 0, 0);
  nightCtx.putImageData(nightImg, 0, 0);
  cloudCtx.putImageData(cloudImg, 0, 0);

  const dayTex = new THREE.CanvasTexture(dayCanvas);
  dayTex.wrapS = THREE.RepeatWrapping;
  dayTex.wrapT = THREE.ClampToEdgeWrapping;
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.needsUpdate = true;

  const nightSpecTex = new THREE.CanvasTexture(nightCanvas);
  nightSpecTex.wrapS = THREE.RepeatWrapping;
  nightSpecTex.wrapT = THREE.ClampToEdgeWrapping;
  nightSpecTex.needsUpdate = true;

  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.wrapS = THREE.RepeatWrapping;
  cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  cloudTex.needsUpdate = true;

  return { dayTex, nightSpecTex, cloudTex };
}

function createEarthGlobeMaterials(initialSunDir) {
  const { dayTex, nightSpecTex, cloudTex } = buildEarthTextures();
  const sunUniform = { value: initialSunDir.clone().normalize() };

  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uDayTex: { value: dayTex },
      uNightSpecTex: { value: nightSpecTex },
      uSunDir: sunUniform,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D uDayTex;
      uniform sampler2D uNightSpecTex;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);

        vec3 dayCol = texture2D(uDayTex, vUv).rgb;
        vec4 nightSpec = texture2D(uNightSpecTex, vUv);
        vec3 cityLights = nightSpec.rgb;
        float oceanMask = nightSpec.a;

        float ndl = dot(N, L);
        float dayFactor = smoothstep(-0.08, 0.18, ndl);
        float twilight = smoothstep(-0.14, 0.04, ndl) * (1.0 - smoothstep(0.04, 0.24, ndl));

        // Sunlit diffuse + warm golden-orange terminator belt
        vec3 litDay = dayCol * (0.14 + 0.96 * max(0.0, ndl));
        litDay += vec3(0.95, 0.42, 0.14) * twilight * 0.36;

        // Ocean sun glint (Blinn-Phong specular reflection on water)
        vec3 H = normalize(L + V);
        float spec = pow(max(0.0, dot(N, H)), 56.0) * oceanMask * smoothstep(0.0, 0.25, ndl);
        litDay += vec3(1.0, 0.95, 0.84) * spec * 0.58;

        // Night hemisphere: deep midnight blue base + warm golden urban lights
        float nightFactor = 1.0 - smoothstep(-0.12, 0.08, ndl);
        vec3 nightCol = dayCol * vec3(0.03, 0.05, 0.09) + cityLights * nightFactor * 1.45;

        // Subtle atmospheric Rayleigh scattering near the limb
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.2);
        vec3 atmoRim = mix(vec3(0.08, 0.22, 0.55), vec3(0.32, 0.68, 1.0), dayFactor) * fresnel * (0.25 + 0.75 * dayFactor);

        vec3 finalCol = mix(nightCol, litDay, dayFactor) + atmoRim;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `,
  });

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uCloudTex: { value: cloudTex },
      uSunDir: sunUniform,
      uUvShift: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uCloudTex;
      uniform vec3 uSunDir;
      uniform float uUvShift;
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        vec2 uv = vec2(fract(vUv.x + uUvShift), vUv.y);
        float alpha = texture2D(uCloudTex, uv).a;
        if (alpha < 0.02) discard;
        float ndl = dot(normalize(vWorldNormal), normalize(uSunDir));
        float day = smoothstep(-0.12, 0.22, ndl);
        float twi = smoothstep(-0.14, 0.04, ndl) * (1.0 - smoothstep(0.04, 0.22, ndl));
        vec3 col = mix(vec3(0.06, 0.10, 0.18), vec3(0.98, 0.99, 1.0), day);
        col += vec3(0.95, 0.48, 0.20) * twi * 0.45;
        gl_FragColor = vec4(col, alpha * 0.62);
      }
    `,
  });

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: sunUniform,
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        float rim = pow(clamp(1.0 + dot(N, V), 0.0, 1.0), 2.6);
        float sunFacing = smoothstep(-0.28, 0.45, dot(N, L));
        float twi = smoothstep(-0.25, 0.05, dot(N, L)) * (1.0 - smoothstep(0.05, 0.35, dot(N, L)));
        vec3 col = mix(vec3(0.06, 0.18, 0.48), vec3(0.28, 0.68, 1.0), sunFacing);
        col += vec3(0.95, 0.45, 0.15) * twi * 0.55;
        float alpha = rim * (0.18 + 0.72 * sunFacing);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  return { earthMat, cloudMat, atmoMat, sunUniform };
}

// ============================================================================
// 4. ASTRONOMICALLY ACCURATE J2000 MILKY WAY GALAXY, STAR CATALOG, SUN & MOON
// ============================================================================

function _createSoftStarGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(245,250,255,0.85)");
  g.addColorStop(0.6, "rgba(180,210,255,0.22)");
  g.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the J2000 Celestial Sphere Group (`R_SKY = 36000`).
 * Rotating `celestialSphereGroup.rotation.y = -gmstDeg * DEG` aligns the entire Milky Way,
 * J2000 Bright Star Catalog, Galactic Center (Sgr A*), and constellations with the exact
 * real-time sky above every `(lat, lon)` on Earth at `Date.now()`!
 */
function buildCelestialSphereGroup() {
  const R_SKY = 36000;
  const group = new THREE.Group();
  group.name = "j2000-celestial-sphere";

  const starTex = _createSoftStarGlowTexture();

  // 1. Milky Way Galactic Plane Nebula Clouds & Dense Star Field (3,600 particles in true IAU Galactic l, b)
  const mwCount = 3600;
  const mwPos = new Float32Array(mwCount * 3);
  const mwCol = new Float32Array(mwCount * 3);
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  // Deterministic PRNG so the Milky Way structure is crisp and repeatable
  let seed = 133742;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => {
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  for (let i = 0; i < mwCount; i++) {
    let lDeg = 0;
    let bDeg = 0;
    let isCore = false;
    let isLMC = false;

    if (i < 950) {
      // Galactic Core Bulge in Sagittarius / Scorpius (l around 0°, b around 0°)
      lDeg = gauss() * 24.0;
      const spreadB = 9.5 * Math.exp(-Math.abs(lDeg) / 38.0) + 3.0;
      bDeg = gauss() * spreadB;
      isCore = true;
    } else if (i < 2750) {
      // Full 360° Milky Way Galactic Disk (Carina l=287°, Cygnus l=80°, Perseus l=135°)
      lDeg = rand() * 360.0;
      bDeg = gauss() * 6.8;
    } else if (i < 2920) {
      // Large & Small Magellanic Clouds at their true J2000 coordinates
      isLMC = true;
      const smc = i >= 2875;
      const raC = smc ? 13.2 : 80.9;
      const decC = smc ? -72.8 : -69.8;
      const spread = smc ? 2.2 : 4.2;
      const ra = raC + gauss() * spread;
      const dec = decC + gauss() * (spread * 0.65);
      latLonToVec3(dec, ra, R_SKY * 0.99, tmpV);
      mwPos[i * 3] = tmpV.x;
      mwPos[i * 3 + 1] = tmpV.y;
      mwPos[i * 3 + 2] = tmpV.z;
      tmpC.setHSL(0.58 + rand() * 0.08, 0.55, 0.72 + rand() * 0.2);
      mwCol[i * 3] = tmpC.r;
      mwCol[i * 3 + 1] = tmpC.g;
      mwCol[i * 3 + 2] = tmpC.b;
      continue;
    } else {
      // All-sky isotropic background field stars
      const u = rand() * 2 - 1;
      const dec = Math.asin(u) * RAD;
      const ra = rand() * 360.0;
      latLonToVec3(dec, ra, R_SKY, tmpV);
      mwPos[i * 3] = tmpV.x;
      mwPos[i * 3 + 1] = tmpV.y;
      mwPos[i * 3 + 2] = tmpV.z;
      const temp = rand();
      if (temp < 0.25) tmpC.setHex(0xbfdBFF);
      else if (temp < 0.75) tmpC.setHex(0xf8f9ff);
      else tmpC.setHex(0xffe2b8);
      const br = 0.55 + 0.45 * rand();
      mwCol[i * 3] = tmpC.r * br;
      mwCol[i * 3 + 1] = tmpC.g * br;
      mwCol[i * 3 + 2] = tmpC.b * br;
      continue;
    }

    const { raDeg, decDeg } = galacticToEquatorialJ2000(lDeg, bDeg);
    latLonToVec3(decDeg, raDeg, R_SKY * (0.985 + 0.015 * rand()), tmpV);
    mwPos[i * 3] = tmpV.x;
    mwPos[i * 3 + 1] = tmpV.y;
    mwPos[i * 3 + 2] = tmpV.z;

    if (isCore) {
      // Warm golden-amber & cream Sagittarius galactic center star clouds
      tmpC.setHSL(0.09 + rand() * 0.06, 0.68, 0.68 + rand() * 0.25);
    } else {
      // Silvery-blue & rose H-II nebula star clouds along the spiral arms
      const isNebula = Math.abs(lDeg - 287) < 14 || Math.abs(lDeg - 80) < 12;
      if (isNebula && rand() < 0.35) {
        tmpC.setHSL(0.92 + rand() * 0.08, 0.72, 0.68);
      } else {
        tmpC.setHSL(0.58 + rand() * 0.08, 0.48, 0.65 + rand() * 0.28);
      }
    }
    mwCol[i * 3] = tmpC.r;
    mwCol[i * 3 + 1] = tmpC.g;
    mwCol[i * 3 + 2] = tmpC.b;
  }

  const mwGeom = new THREE.BufferGeometry();
  mwGeom.setAttribute("position", new THREE.BufferAttribute(mwPos, 3));
  mwGeom.setAttribute("color", new THREE.BufferAttribute(mwCol, 3));
  const mwMat = new THREE.PointsMaterial({
    size: 210,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(mwGeom, mwMat));

  // Soft diffused Milky Way Galactic Band glow clouds (180 large nebula sprites along b ≈ 0°)
  const nebCount = 180;
  const nebPos = new Float32Array(nebCount * 3);
  const nebCol = new Float32Array(nebCount * 3);
  for (let i = 0; i < nebCount; i++) {
    const lDeg = (i / nebCount) * 360.0 + (rand() - 0.5) * 4.0;
    const distFromCore = Math.min(lDeg, 360 - lDeg);
    const bDeg = (rand() - 0.5) * (distFromCore < 35 ? 10.0 : 5.5);
    const { raDeg, decDeg } = galacticToEquatorialJ2000(lDeg, bDeg);
    latLonToVec3(decDeg, raDeg, R_SKY * 0.98, tmpV);
    nebPos[i * 3] = tmpV.x;
    nebPos[i * 3 + 1] = tmpV.y;
    nebPos[i * 3 + 2] = tmpV.z;

    const coreWeight = Math.exp(-Math.pow(distFromCore / 36.0, 2));
    tmpC.setRGB(
      0.16 + 0.42 * coreWeight,
      0.20 + 0.28 * coreWeight,
      0.34 + 0.12 * coreWeight
    );
    nebCol[i * 3] = tmpC.r;
    nebCol[i * 3 + 1] = tmpC.g;
    nebCol[i * 3 + 2] = tmpC.b;
  }
  const nebGeom = new THREE.BufferGeometry();
  nebGeom.setAttribute("position", new THREE.BufferAttribute(nebPos, 3));
  nebGeom.setAttribute("color", new THREE.BufferAttribute(nebCol, 3));
  const nebMat = new THREE.PointsMaterial({
    size: 3200,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(nebGeom, nebMat));

  // 2. Named J2000 Bright Star Catalog (Sirius, Polaris, Canopus, Betelgeuse, Rigel, Vega, Big Dipper, etc.)
  const bsCount = BRIGHT_STARS_J2000.length;
  const bsPos = new Float32Array(bsCount * 3);
  const bsCol = new Float32Array(bsCount * 3);
  for (let i = 0; i < bsCount; i++) {
    const [, raDeg, decDeg, vMag, hex] = BRIGHT_STARS_J2000[i];
    latLonToVec3(decDeg, raDeg, R_SKY * 0.97, tmpV);
    bsPos[i * 3] = tmpV.x;
    bsPos[i * 3 + 1] = tmpV.y;
    bsPos[i * 3 + 2] = tmpV.z;
    tmpC.setHex(hex);
    const boost = THREE.MathUtils.clamp(1.35 - vMag * 0.18, 0.75, 1.5);
    bsCol[i * 3] = Math.min(1, tmpC.r * boost);
    bsCol[i * 3 + 1] = Math.min(1, tmpC.g * boost);
    bsCol[i * 3 + 2] = Math.min(1, tmpC.b * boost);
  }
  const bsGeom = new THREE.BufferGeometry();
  bsGeom.setAttribute("position", new THREE.BufferAttribute(bsPos, 3));
  bsGeom.setAttribute("color", new THREE.BufferAttribute(bsCol, 3));
  const bsMat = new THREE.PointsMaterial({
    size: 460,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  group.add(new THREE.Points(bsGeom, bsMat));

  return { group, starTex, R_SKY };
}

// ============================================================================
// 5. MULTI-AGENCY ARTICULATED 3D ROCKET STACKS & ORBITAL SPACECRAFT BUILDERS
// ============================================================================

function _makePlumeCone(radiusTop, radiusBottom, length, colorCore, colorOuter) {
  const g = new THREE.Group();
  const outerGeo = new THREE.ConeGeometry(radiusBottom, length, 16, 1, true);
  outerGeo.translate(0, -length * 0.5, 0);
  const outerMat = new THREE.MeshBasicMaterial({
    color: colorOuter,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  g.add(outerMesh);

  const innerGeo = new THREE.ConeGeometry(radiusTop, length * 0.72, 14, 1, true);
  innerGeo.translate(0, -length * 0.36, 0);
  const innerMat = new THREE.MeshBasicMaterial({
    color: colorCore,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  g.add(innerMesh);

  // Mach shock diamonds along the plume axis
  for (let i = 0; i < 4; i++) {
    const dGeo = new THREE.OctahedronGeometry(radiusTop * (0.72 - i * 0.12), 0);
    const dMesh = new THREE.Mesh(dGeo, innerMat);
    dMesh.scale.set(1, 1.8, 1);
    dMesh.position.y = -(i + 0.8) * (length * 0.16);
    g.add(dMesh);
  }
  return g;
}

export function buildArticulatedRocketStack(sp) {
  const root = new THREE.Group();
  root.name = `rocket-stack-${sp.id}`;

  const coreStage = new THREE.Group();
  const boosters = [];
  const fairingHalves = [];
  let escapeTower = null;
  const upperStage = new THREE.Group();
  const solarWings = [];

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.38, metalness: 0.18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.45, metalness: 0.55 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xd4dce4, roughness: 0.24, metalness: 0.82 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.52, metalness: 0.15 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x1858b8, roughness: 0.36, metalness: 0.25 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd9241b, roughness: 0.38, metalness: 0.2 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf2b938, roughness: 0.3, metalness: 0.72 });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x1c4587,
    emissive: 0x0b224a,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.65,
    side: THREE.DoubleSide,
  });

  if (sp.id === "spacex_starbase") {
    // 1. SpaceX Starship (50m upper stage) + Super Heavy Booster (71m lower stage)
    const bGroup = new THREE.Group();
    const bBody = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 69, 24), steelMat);
    bBody.position.y = 34.5;
    bGroup.add(bBody);
    const hotRing = new THREE.Mesh(new THREE.CylinderGeometry(4.65, 4.65, 2.2, 24), darkMat);
    hotRing.position.y = 70.0;
    bGroup.add(hotRing);
    // 4 waffle grid fins
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 0.45), darkMat);
      fin.position.set(Math.cos(a) * 5.7, 67.5, Math.sin(a) * 5.7);
      fin.rotation.y = -a;
      bGroup.add(fin);
    }
    const bPlume = _makePlumeCone(4.4, 9.5, 58, sp.plumeColorCore, sp.plumeColorOuter);
    bPlume.position.y = 0;
    bGroup.add(bPlume);
    bGroup.userData = { dirX: -0.6, dirZ: -0.8, plume: bPlume, isHotStage: true };
    boosters.push(bGroup);
    root.add(bGroup);

    // Upper Stage: Starship S30 (stainless steel + black TPS heatshield + aft & fwd flaps)
    upperStage.position.y = 71.0;
    const shipCyl = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 32, 24), steelMat);
    shipCyl.position.y = 16.0;
    upperStage.add(shipCyl);
    const shipNose = new THREE.Mesh(new THREE.ConeGeometry(4.55, 18, 24), steelMat);
    shipNose.position.y = 41.0;
    upperStage.add(shipNose);
    const tps = new THREE.Mesh(new THREE.BoxGeometry(5.2, 34, 2.2), darkMat);
    tps.position.set(0, 18.0, 3.5);
    upperStage.add(tps);
    for (const sx of [-1, 1]) {
      const aftFlap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 8.8, 0.45), darkMat);
      aftFlap.position.set(sx * 5.4, 6.0, 0);
      upperStage.add(aftFlap);
      const fwdFlap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 5.8, 0.4), darkMat);
      fwdFlap.position.set(sx * 4.2, 38.5, 0);
      upperStage.add(fwdFlap);
    }
    const uPlume = _makePlumeCone(2.6, 5.4, 28, 0xd8f2ff, 0x5c85ff);
    uPlume.position.y = 0;
    uPlume.visible = false;
    upperStage.add(uPlume);
    upperStage.userData.plume = uPlume;
    root.add(upperStage);
  } else if (sp.id === "nasa_ksc") {
    // 2. NASA SLS Block 1 (Orange LH2 core + Twin 5-segment White SRBs + Orion MPCV)
    const coreCyl = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 62, 24), orangeMat);
    coreCyl.position.y = 31.0;
    coreStage.add(coreCyl);
    const interstage = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.3, 8, 24), whiteMat);
    interstage.position.y = 66.0;
    coreStage.add(interstage);
    const cPlume = _makePlumeCone(3.2, 6.5, 42, 0xd8f0ff, 0x62a8ff);
    cPlume.position.y = 0;
    coreStage.add(cPlume);
    coreStage.userData.plume = cPlume;
    root.add(coreStage);

    // Twin Solid Rocket Boosters
    for (const sx of [-1, 1]) {
      const srb = new THREE.Group();
      srb.position.set(sx * 6.5, 0, 0);
      const srbCyl = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 47, 16), whiteMat);
      srbCyl.position.y = 23.5;
      srb.add(srbCyl);
      const srbCone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 6.5, 16), whiteMat);
      srbCone.position.y = 50.25;
      srb.add(srbCone);
      const bPlume = _makePlumeCone(2.1, 5.2, 48, 0xfff8d6, 0xff8c24);
      bPlume.position.y = 0;
      srb.add(bPlume);
      srb.userData = { dirX: sx, dirZ: 0.15 * sx, plume: bPlume };
      boosters.push(srb);
      root.add(srb);
    }

    // Upper Stage: Orion Crew Module + European Service Module + 4 X-Wing Solar Arrays
    upperStage.position.y = 70.0;
    const esm = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 5.2, 20), steelMat);
    esm.position.y = 2.6;
    upperStage.add(esm);
    const capsule = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.55, 3.6, 20), whiteMat);
    capsule.position.y = 7.0;
    upperStage.add(capsule);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const wingPivot = new THREE.Group();
      wingPivot.position.set(Math.cos(a) * 2.2, 2.8, Math.sin(a) * 2.2);
      wingPivot.rotation.y = -a;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 1.6), solarMat);
      panel.position.x = 3.6;
      wingPivot.add(panel);
      wingPivot.scale.set(0.01, 1, 1); // Folded until orbital insertion
      upperStage.add(wingPivot);
      solarWings.push(wingPivot);
    }
    const uPlume = _makePlumeCone(1.5, 3.2, 18, 0xd8f0ff, 0x68a8ff);
    uPlume.visible = false;
    upperStage.add(uPlume);
    upperStage.userData.plume = uPlume;
    root.add(upperStage);

    // Launch Abort System (LAS) Tower
    escapeTower = new THREE.Group();
    escapeTower.position.y = 78.5;
    const shroud = new THREE.Mesh(new THREE.ConeGeometry(2.55, 7.5, 18), whiteMat);
    shroud.position.y = 3.75;
    escapeTower.add(shroud);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 9.5, 12), whiteMat);
    mast.position.y = 11.5;
    escapeTower.add(mast);
    root.add(escapeTower);
  } else {
    // 3..6: Jiuquan (Long March 2F & Shenzhou), Baikonur (Soyuz MS), Kourou (Ariane 6), Tanegashima (H3)
    const isJiuquan = sp.id === "jiuquan";
    const isSoyuz = sp.id === "baikonur";
    const isH3 = sp.id === "tanegashima_jaxa";
    const coreH = isSoyuz ? 29.0 : 41.0;
    const coreR = isSoyuz ? 1.55 : 2.1;

    const coreBodyMat = isH3 ? orangeMat : isSoyuz ? darkMat : whiteMat;
    const coreCyl = new THREE.Mesh(new THREE.CylinderGeometry(coreR, coreR, coreH, 20), coreBodyMat);
    coreCyl.position.y = coreH * 0.5;
    coreStage.add(coreCyl);

    if (isJiuquan) {
      // Blue CMSA bands on Long March 2F
      const band1 = new THREE.Mesh(new THREE.CylinderGeometry(coreR + 0.05, coreR + 0.05, 2.2, 20), blueMat);
      band1.position.y = coreH * 0.72;
      coreStage.add(band1);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, coreR * 2 + 0.16), redMat);
      flag.position.y = coreH * 0.56;
      coreStage.add(flag);
    } else if (isSoyuz) {
      const orangeBand = new THREE.Mesh(new THREE.CylinderGeometry(coreR + 0.06, coreR + 0.06, 2.4, 20), orangeMat);
      orangeBand.position.y = coreH * 0.86;
      coreStage.add(orangeBand);
    }

    const cPlume = _makePlumeCone(coreR * 0.9, coreR * 2.1, 30, sp.plumeColorCore, sp.plumeColorOuter);
    cPlume.position.y = 0;
    coreStage.add(cPlume);
    coreStage.userData.plume = cPlume;
    root.add(coreStage);

    // Strap-on Boosters (4 for CZ-2F, Soyuz Korolev Cross, Ariane 6; 2 for H3)
    const nBoost = sp.boosterCount || 4;
    const bH = isSoyuz ? 19.5 : 22.0;
    const bR = isSoyuz ? 1.35 : 1.25;
    for (let i = 0; i < nBoost; i++) {
      const a = nBoost === 2 ? i * Math.PI : (i / 4) * Math.PI * 2 + Math.PI / 4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const bGroup = new THREE.Group();
      bGroup.position.set(dx * (coreR + bR * 0.92), 0, dz * (coreR + bR * 0.92));

      if (isSoyuz) {
        // Tapered conical R-7 Korolev Cross booster
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, bR, bH, 16), darkMat);
        cone.position.y = bH * 0.5;
        bGroup.add(cone);
      } else {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bR, bR, bH, 16), whiteMat);
        cyl.position.y = bH * 0.5;
        bGroup.add(cyl);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(bR, 4.2, 16), isJiuquan ? blueMat : whiteMat);
        nose.position.y = bH + 2.1;
        bGroup.add(nose);
      }

      const bPlume = _makePlumeCone(bR * 0.85, bR * 1.9, 24, sp.plumeColorCore, sp.plumeColorOuter);
      bPlume.position.y = 0;
      bGroup.add(bPlume);
      bGroup.userData = {
        dirX: dx,
        dirZ: dz,
        plume: bPlume,
        isKorolev: isSoyuz,
      };
      boosters.push(bGroup);
      root.add(bGroup);
    }

    // Upper Stage Orbital Spacecraft (Shenzhou 神舟 / Soyuz MS / Satellite) inside payload fairing
    upperStage.position.y = coreH + 1.0;
    const svcMod = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 4.2, 18), isJiuquan ? whiteMat : steelMat);
    svcMod.position.y = 2.1;
    upperStage.add(svcMod);
    const reentryMod = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 2.8, 18), isJiuquan ? goldMat : darkMat);
    reentryMod.position.y = 5.6;
    upperStage.add(reentryMod);
    const orbMod = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), isJiuquan ? whiteMat : steelMat);
    orbMod.position.y = 8.2;
    upperStage.add(orbMod);

    // Twin Solar Array Wings on the orbital spacecraft
    for (const sx of [-1, 1]) {
      const wingPivot = new THREE.Group();
      wingPivot.position.set(sx * 1.5, 2.4, 0);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 1.75), solarMat);
      panel.position.x = sx * 3.4;
      wingPivot.add(panel);
      wingPivot.scale.set(0.01, 1, 1);
      upperStage.add(wingPivot);
      solarWings.push(wingPivot);
    }
    const uPlume = _makePlumeCone(1.1, 2.4, 15, 0xffe8b0, 0xff8528);
    uPlume.visible = false;
    upperStage.add(uPlume);
    upperStage.userData.plume = uPlume;
    root.add(upperStage);

    // Split Payload Fairing Halves (clam-shell separation)
    const fR = coreR * 1.12;
    const fH = 12.5;
    for (const sx of [-1, 1]) {
      const half = new THREE.Group();
      half.position.set(sx * (fR * 0.42), coreH, 0);
      const hCyl = new THREE.Mesh(new THREE.CylinderGeometry(fR * 0.65, fR * 0.65, fH, 14), whiteMat);
      hCyl.scale.set(0.65, 1, 1.05);
      hCyl.position.y = fH * 0.5;
      half.add(hCyl);
      const hCone = new THREE.Mesh(new THREE.ConeGeometry(fR * 0.65, 5.5, 14), whiteMat);
      hCone.scale.set(0.65, 1, 1.05);
      hCone.position.y = fH + 2.75;
      half.add(hCone);
      half.userData = { dirX: sx };
      fairingHalves.push(half);
      root.add(half);
    }

    if (sp.lesSepTime) {
      escapeTower = new THREE.Group();
      escapeTower.position.y = coreH + fH + 4.5;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 7.8, 10), whiteMat);
      mast.position.y = 3.9;
      escapeTower.add(mast);
      root.add(escapeTower);
    }
  }

  // Max-Q Prandtl-Glauert supersonic shockwave vapor cone
  const machGeo = new THREE.ConeGeometry(16, 22, 28, 1, true);
  const machMat = new THREE.MeshBasicMaterial({
    color: 0xf4f9ff,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const machConeMesh = new THREE.Mesh(machGeo, machMat);
  machConeMesh.position.y = sp.heightM * 0.72;
  root.add(machConeMesh);

  // Re-entry plasma envelope around upperStage
  const plasmaGeo = new THREE.SphereGeometry(8.5, 24, 18);
  const plasmaMat = new THREE.MeshBasicMaterial({
    color: 0xff5a1f,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
  plasmaMesh.scale.set(1.0, 2.2, 1.0);
  plasmaMesh.position.y = 14.0;
  upperStage.add(plasmaMesh);

  const plumeLight = new THREE.PointLight(0xfff0c8, 6.5, 420, 1.1);
  plumeLight.position.set(0, 18, 22);
  root.add(plumeLight);

  return {
    root,
    coreStage,
    boosters,
    fairingHalves,
    escapeTower,
    upperStage,
    solarWings,
    machConeMesh,
    plasmaMesh,
  };
}

/**
 * Builds detailed 3D Orbital Space Station & Satellite models for the 3D Earth view:
 *   - ISS (25544): Integrated Truss + 8 copper solar wings + pressurized module cluster
 *   - Tiangong CSS (48274): T-shaped Tianhe + Wentian + Mengtian + 4 giant golden solar wings
 *   - Hubble Space Telescope (20580): Silver cylindrical mirror tube + open aperture door + twin blue wings
 *   - Active Constellation Satellites: Gold-foil bus + twin blue solar arrays
 */
function buildOrbitalCraftModel(kind, accentHex) {
  const g = new THREE.Group();
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.85 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.25 });
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.65 });
  const copperSolarMat = new THREE.MeshStandardMaterial({
    color: 0xd9822b,
    emissive: 0x6b3808,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.75,
    side: THREE.DoubleSide,
  });
  const goldSolarMat = new THREE.MeshStandardMaterial({
    color: 0xf5b82e,
    emissive: 0x7c5408,
    emissiveIntensity: 0.6,
    roughness: 0.22,
    metalness: 0.8,
    side: THREE.DoubleSide,
  });
  const blueSolarMat = new THREE.MeshStandardMaterial({
    color: 0x1e56a0,
    emissive: 0x0c2d66,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.7,
    side: THREE.DoubleSide,
  });

  if (kind === "iss") {
    // 109m Integrated Truss Structure
    const truss = new THREE.Mesh(new THREE.BoxGeometry(26, 1.1, 1.1), trussMat);
    g.add(truss);
    // Pressurized modules (Zvezda, Zarya, Unity, Destiny, Harmony, Kibo, Columbus)
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 14, 16), whiteMat);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    const crossMod = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 8.5, 14), silverMat);
    crossMod.position.z = 2.8;
    g.add(crossMod);
    // 8 Iconic Copper-Gold Solar Array Wings (4 pairs)
    for (const sx of [-11.5, -7.8, 7.8, 11.5]) {
      for (const sz of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 7.6), copperSolarMat);
        wing.position.set(sx, 0, sz * 4.4);
        g.add(wing);
      }
    }
  } else if (kind === "tiangong") {
    // T-Shaped Chinese Space Station: Tianhe Core + Wentian & Mengtian Lab Modules
    const tianhe = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 13.5, 16), whiteMat);
    tianhe.rotation.x = Math.PI / 2;
    g.add(tianhe);
    const labs = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 16.5, 16), whiteMat);
    labs.rotation.z = Math.PI / 2;
    labs.position.z = 3.2;
    g.add(labs);
    // 4 Giant Golden Flexible Solar Array Wings at the ends of Wentian & Mengtian
    for (const sx of [-7.8, 7.8]) {
      for (const sz of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 8.2), goldSolarMat);
        wing.position.set(sx, 0, 3.2 + sz * 4.8);
        g.add(wing);
      }
    }
  } else if (kind === "hubble") {
    // Silver optical telescope cylinder + aperture door + twin blue solar panels
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.65, 9.5, 20), silverMat);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.25), silverMat);
    door.position.set(0, 1.8, 4.9);
    door.rotation.x = -0.5;
    g.add(door);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 1.8), blueSolarMat);
      wing.position.set(sx * 4.2, 0, 0);
      g.add(wing);
    }
  } else {
    // Active Constellation Satellite
    const bus = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.8), goldSolarMat);
    g.add(bus);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 1.8), blueSolarMat);
      wing.position.set(sx * 4.4, 0, 0);
      g.add(wing);
    }
  }

  // Subtle glowing beacon sphere so the station/satellite stands out against Earth & space
  const beaconMat = new THREE.MeshBasicMaterial({
    color: accentHex || 0x58d5ff,
    transparent: true,
    opacity: 0.85,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), beaconMat);
  g.add(beacon);

  // Invisible larger hit sphere for easy 1-click selection in 3D orbit
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(18, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  g.add(hitMesh);
  g.userData.hitMesh = hitMesh;

  return g;
}

// ============================================================================
// 6. SYNTHESIZED WEBAUDIO ROCKET ROAR & ACOUSTIC CRACKLE ENGINE
// ============================================================================
class RocketAudioEngine {
  constructor() {
    this.ctx = null;
    this.gainNode = null;
    this.subOsc = null;
    this.noiseSource = null;
  }

  startLaunchRoar() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.stop();

      const now = this.ctx.currentTime;
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.01, now);
      master.gain.exponentialRampToValueAtTime(0.32, now + 0.8);
      master.gain.exponentialRampToValueAtTime(0.18, now + 8.0);
      master.gain.exponentialRampToValueAtTime(0.001, now + 14.2);
      master.connect(this.ctx.destination);
      this.gainNode = master;

      // Sub-bass combustion chamber rumble (36 Hz -> 52 Hz)
      const sub = this.ctx.createOscillator();
      sub.type = "sawtooth";
      sub.frequency.setValueAtTime(36, now);
      sub.frequency.linearRampToValueAtTime(52, now + 6.0);
      const subFilter = this.ctx.createBiquadFilter();
      subFilter.type = "lowpass";
      subFilter.frequency.setValueAtTime(110, now);
      sub.connect(subFilter);
      subFilter.connect(master);
      sub.start(now);
      sub.stop(now + 14.5);
      this.subOsc = sub;

      // Filtered pink/brown acoustic crackle noise
      const bufLen = this.ctx.sampleRate * 4;
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufLen; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + w * 0.08;
        b1 = 0.96 * b1 + w * 0.14;
        b2 = 0.85 * b2 + w * 0.25;
        const crackle = Math.random() < 0.015 ? (Math.random() * 2 - 1) * 1.4 : 0;
        data[i] = THREE.MathUtils.clamp(b0 + b1 + b2 + crackle, -1, 1);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = "lowpass";
      bandpass.frequency.setValueAtTime(420, now);
      bandpass.frequency.exponentialRampToValueAtTime(140, now + 13.0);
      noise.connect(bandpass);
      bandpass.connect(master);
      noise.start(now);
      noise.stop(now + 14.5);
      this.noiseSource = noise;
    } catch {
      // Ignore WebAudio autoplay restrictions cleanly
    }
  }

  playStageSeparationThump() {
    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Ignore
    }
  }

  stop() {
    try {
      if (this.subOsc) {
        this.subOsc.stop();
        this.subOsc.disconnect();
      }
    } catch {}
    try {
      if (this.noiseSource) {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      }
    } catch {}
    this.subOsc = null;
    this.noiseSource = null;
  }
}

// ============================================================================
// 7. MINIMAL ORBITAL TELEMETRY PILL CSS (HIDDEN 100% WHEN ON THE GROUND)
// ============================================================================
const ORBITAL_HUD_CSS = `
body.space-launch-active #hud-radar,
body.space-launch-active #hud-speedometer,
body.space-launch-active #hud-controls-hint,
body.space-launch-active #heli-reticle,
body.space-launch-active #property-inspector-card {
  opacity: 0 !important;
  pointer-events: none !important;
}
#space-orbital-hud {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 46;
  display: none;
  flex-direction: column;
  gap: 4px;
  min-width: min(520px, calc(100vw - 28px));
  max-width: min(680px, calc(100vw - 24px));
  padding: 7px 13px;
  border-radius: 16px;
  background: rgba(10, 15, 26, 0.84);
  backdrop-filter: blur(20px) saturate(165%);
  -webkit-backdrop-filter: blur(20px) saturate(165%);
  border: 1px solid rgba(120, 190, 255, 0.26);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.62), 0 0 24px rgba(56, 152, 255, 0.16);
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  user-select: none;
}
#space-orbital-hud.active {
  display: flex;
}
.soh-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.soh-title-wrap {
  display: flex;
   align-items: center;
  gap: 9px;
}
.soh-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  background: rgba(56, 189, 248, 0.2);
  color: #7dd3fc;
  border: 1px solid rgba(125, 211, 252, 0.35);
}
.soh-vehicle {
  font-size: 10px;
  font-weight: 600;
  color: #f8fafc;
}
.soh-stage-status {
  font-size: 10.5px;
  color: #93c5fd;
  font-weight: 500;
}
.soh-metrics {
  display: flex;
  align-items: center;
  gap: 14px;
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: #cbd5e1;
}
.soh-metrics strong {
  color: #f8fafc;
  font-weight: 600;
}
.soh-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}
.soh-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.soh-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 41, 59, 0.68);
  color: #e2e8f0;
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
}
.soh-chip:hover {
  background: rgba(51, 65, 85, 0.88);
  border-color: rgba(125, 211, 252, 0.55);
}
.soh-chip.active {
  background: rgba(14, 116, 144, 0.65);
  border-color: #38bdf8;
  color: #ffffff;
}
.soh-land-btn {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(251, 146, 60, 0.55);
  background: rgba(194, 65, 12, 0.48);
  color: #ffedd5;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}
.soh-land-btn:hover {
  background: rgba(234, 88, 12, 0.75);
  transform: scale(1.03);
}
.soh-subinfo {
  font-size: 10px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
}
`;

// ============================================================================
// 8. MAIN SPACE LAUNCH, 3D EARTH & LIVE SATELLITES ORCHESTRATOR CLASS
// ============================================================================
export class SpaceLaunchSystem {
  constructor(app) {
    this.app = app;
    this.phase = "idle"; // "idle" | "ascent" | "orbit" | "reentry"
    this.activeSpaceport = null;
    this.missionTime = 0;
    this.altitudeKm = 0;
    this.velocityKmh = 0;
    this.stageStatusEn = "";
    this.stageStatusZh = "";

    // Current spacecraft geographic position in orbit
    this.shipLat = 28.6272;
    this.shipLon = -80.6209;
    this.shipAltKm = 380;
    this.shipHeadingRad = 0.45;
    this.focusTargetId = "ship"; // "ship" | "iss" | "tiangong" | "hubble" | sat id

    // Orbit camera spherical angles & zoom distance
    this.orbitCamYaw = 0.0;
    this.orbitCamPitch = 0.58;
    this.orbitCamDist = 310;
    this._draggingOrbit = false;
    this._dragStartX = 0;
    this._dragStartY = 0;

    // Ground pad cryogenic venting particle pool (active only within 650m of a spaceport pad)
    this.cryoGroup = new THREE.Group();
    this.cryoGroup.name = "spaceport-cryo-venting";
    this.cryoGroup.visible = false;
    this.app.scene.add(this.cryoGroup);
    this.cryoPuffs = [];
    this._initCryoVentingPool();

    // Pad liftoff deluge steam & smoke particle pool
    this.delugeGroup = new THREE.Group();
    this.delugeGroup.name = "spaceport-deluge-plume";
    this.delugeGroup.visible = false;
    this.app.scene.add(this.delugeGroup);
    this.delugePuffs = [];
    this._initDelugePool();

    // Articulated ascending rocket stack in local world space
    this.rocketStack = null;
    this.padWorldPos = new THREE.Vector3();
    this._boostersSeparated = false;
    this._lesSeparated = false;
    this._fairingSeparated = false;

    // Lazy-built Outer Space 3D Earth + Celestial Sphere + Live Satellites scene graph
    this.orbitalGroup = null;
    this.earthMesh = null;
    this.cloudMesh = null;
    this.atmoMesh = null;
    this.sunUniform = null;
    this.celestialSphere = null;
    this.sunMeshGroup = null;
    this.moonMesh = null;
    this.orbitalShipRoot = null;
    this.orbitalSatellites = [];
    this.astronauts = [...FALLBACK_ASTRONAUTS];
    this.upcomingLaunchText = "Go for Launch · Nominal Orbital Insertion";
    this.lastAstState = computeRealTimeAstronomy(Date.now());
    this._issPollTimer = 0;
    this._liveApisLoaded = false;

    this.audio = new RocketAudioEngine();
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this._initHud();
    this._bindEvents();
    this._installDebugApi();
  }

  isSpaceportId(id) {
    return SPACEPORT_BY_ID.has(id);
  }

  getSpaceport(id) {
    return SPACEPORT_BY_ID.get(id) || null;
  }

  isControllingCamera() {
    return this.phase !== "idle";
  }

  isInOuterSpace() {
    return (this.phase === "ascent" && this.altitudeKm >= 105) || this.phase === "orbit" || (this.phase === "reentry" && this.altitudeKm >= 55);
  }

  getState() {
    const astro = this.lastAstState || computeRealTimeAstronomy(Date.now());
    return {
      phase: this.phase,
      spaceportId: this.activeSpaceport ? this.activeSpaceport.id : null,
      vehicle: this.activeSpaceport ? this.activeSpaceport.vehicleEn : null,
      missionTime: Number(this.missionTime.toFixed(2)),
      altitudeKm: Number(this.altitudeKm.toFixed(1)),
      velocityKmh: Math.round(this.velocityKmh),
      shipLat: Number(this.shipLat.toFixed(4)),
      shipLon: Number(this.shipLon.toFixed(4)),
      focusTargetId: this.focusTargetId,
      satellitesCount: this.orbitalSatellites.length,
      astronautsCount: this.astronauts.length,
      gmstDeg: Number(astro.gmstDeg.toFixed(3)),
      sunLat: Number(astro.sunLat.toFixed(3)),
      sunLon: Number(astro.sunLon.toFixed(3)),
      moonLat: Number(astro.moonLat.toFixed(3)),
      moonLon: Number(astro.moonLon.toFixed(3)),
      galCenterLon: Number(astro.galCenterLon.toFixed(3)),
    };
  }

  // --------------------------------------------------------------------------
  // Cryo Venting & Water Deluge Particle Pools
  // --------------------------------------------------------------------------
  _initCryoVentingPool() {
    const geo = new THREE.SphereGeometry(1.4, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf4f9ff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.userData = {
        age: (i / 26) * 3.2,
        life: 3.2,
        yOffset: 24 + (i % 7) * 9.5,
        vx: 2.8 + (i % 5) * 0.9,
        vy: 3.2 + (i % 4) * 0.7,
        vz: ((i % 3) - 1) * 1.1,
      };
      this.cryoGroup.add(m);
      this.cryoPuffs.push(m);
    }
  }

  _initDelugePool() {
    const geo = new THREE.SphereGeometry(4.2, 10, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf5f7fa,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const m = new THREE.Mesh(geo, mat.clone());
      m.userData = {
        angle: a,
        speed: 14 + (i % 7) * 6.5,
        upSpeed: 4 + (i % 5) * 3.5,
        phase: (i / 44) * 2.4,
      };
      this.delugeGroup.add(m);
      this.delugePuffs.push(m);
    }
  }

  /** Finds if any of the 6 spaceports is inside the current 40km x 40km world origin. */
  findActiveWorldSpaceport() {
    const o = this.app?.worldOrigin;
    if (!o) return null;
    for (const sp of SPACEPORTS) {
      const xz = landmarkWorldXZ(sp, o);
      if (xz) {
        const padX = xz[0] + (sp.padLocalX || 0);
        const padZ = xz[1] + (sp.padLocalZ || 0);
        const lmItem = this.app.landmarks?.items?.find((it) => it.L && it.L.id === sp.id);
        const terrY = lmItem && Number.isFinite(lmItem.baseY) ? lmItem.baseY : getBeijingTerrainElevation(padX, padZ);
        return {
          spaceport: sp,
          padX,
          padY: terrY + (sp.padBaseY || 6.0),
          padZ,
          terrY,
        };
      }
    }
    return null;
  }

  tryTriggerFromClick(worldPt) {
    if (this.phase !== "idle" || !worldPt) return false;
    const found = this.findActiveWorldSpaceport();
    if (!found) return false;
    const dist = Math.hypot(worldPt.x - found.padX, worldPt.z - found.padZ);
    if (dist <= 135) {
      this.launchFromSpaceport(found.spaceport.id);
      return true;
    }
    return false;
  }

  tryTriggerFromRay(ray) {
    if (this.phase !== "idle" || !ray) return false;
    const found = this.findActiveWorldSpaceport();
    if (!found) return false;
    // Cylinder / sphere check around the rocket stack on the pad
    const padCenter = new THREE.Vector3(found.padX, found.padY + found.spaceport.heightM * 0.45, found.padZ);
    const distSq = ray.distanceSqToPoint(padCenter);
    if (distSq <= 42 * 42) {
      this.launchFromSpaceport(found.spaceport.id);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Launch Sequence Initiation
  // --------------------------------------------------------------------------
  async launchFromSpaceport(spaceportId) {
    const sp = SPACEPORT_BY_ID.get(spaceportId) || SPACEPORTS[0];
    if (!sp) return false;

    // If not currently near this spaceport's world origin, teleport there first so the pad is loaded
    let found = this.findActiveWorldSpaceport();
    if (!found || found.spaceport.id !== sp.id) {
      await this.app.teleportToLocation(sp.lat, sp.lon, sp.nameEn, sp.vehicleEn);
      found = this.findActiveWorldSpaceport();
    }

    if (this.app.propertyInspector) {
      this.app.propertyInspector.dismiss();
    }

    this.activeSpaceport = sp;
    this.phase = "ascent";
    this.missionTime = 0;
    this.altitudeKm = 0;
    this.velocityKmh = 0;
    this._boostersSeparated = false;
    this._lesSeparated = false;
    this._fairingSeparated = false;

    const padX = found ? found.padX : 0;
    const padY = found ? found.padY : 12;
    const padZ = found ? found.padZ : 0;
    this.padWorldPos.set(padX, padY, padZ);

    this.shipLat = sp.lat;
    this.shipLon = sp.lon;
    this.shipAltKm = 380;
    this.shipHeadingRad = (90 - sp.inclinationDeg) * DEG;
    this.focusTargetId = "ship";

    // Build fresh articulated 3D rocket stack on the pad
    if (this.rocketStack && this.rocketStack.root) {
      this.app.scene.remove(this.rocketStack.root);
    }
    this.rocketStack = buildArticulatedRocketStack(sp);
    this.rocketStack.root.position.copy(this.padWorldPos);
    // Slightly scale radially (1.05x) so it cleanly sheaths any static pad rocket mesh during T+0..2s
    this.rocketStack.root.scale.set(1.05, 1.0, 1.05);
    this.app.scene.add(this.rocketStack.root);

    this.cryoGroup.visible = false;
    this.delugeGroup.position.set(padX, found ? found.terrY + 1.5 : padY, padZ);
    this.delugeGroup.visible = true;

    this._ensureOrbitalSceneGraph();
    this._fetchLiveSpaceApis();
    this.audio.startLaunchRoar();

    this.hudEl.classList.add("active");
    if (typeof document !== "undefined") document.body.classList.add("space-launch-active");
    this._updateHudDom();
    return true;
  }

  // --------------------------------------------------------------------------
  // Outer-Space 3D Spherical Earth, J2000 Galaxy & Live Satellites Builder
  // --------------------------------------------------------------------------
  _ensureOrbitalSceneGraph() {
    if (this.orbitalGroup) return;

    this.orbitalGroup = new THREE.Group();
    this.orbitalGroup.name = "outer-space-orbital-group";
    this.orbitalGroup.visible = false;
    this.app.scene.add(this.orbitalGroup);

    const astro = computeRealTimeAstronomy(Date.now());
    this.lastAstState = astro;

    // 1. Astronomically accurate J2000 Celestial Sphere (Milky Way Galactic Plane + Bright Stars)
    const cel = buildCelestialSphereGroup();
    this.celestialSphere = cel.group;
    this.celestialSphere.rotation.y = -astro.gmstDeg * DEG;
    this.orbitalGroup.add(this.celestialSphere);

    // 2. Real-Time 3D Sun + Blazing Solar Corona at true (sunLat, sunLon)
    this.sunMeshGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(520, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfffbe8 })
    );
    this.sunMeshGroup.add(sunCore);
    const coronaSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cel.starTex,
        color: 0xffd280,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coronaSprite.scale.set(4200, 4200, 1);
    this.sunMeshGroup.add(coronaSprite);
    this.sunMeshGroup.position.copy(astro.sunDir).multiplyScalar(28000);
    this.orbitalGroup.add(this.sunMeshGroup);

    // 3. Real-Time 3D Moon at true (moonLat, moonLon)
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xd8dce2,
      roughness: 0.88,
      metalness: 0.05,
    });
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(82, 24, 18), moonMat);
    this.moonMesh.position.copy(astro.moonDir).multiplyScalar(9200);
    this.orbitalGroup.add(this.moonMesh);

    // 4. Ultra-Realistic 3D Spherical Earth (`R_EARTH = 1200`) + Clouds + Rayleigh Atmosphere
    const { earthMat, cloudMat, atmoMat, sunUniform } = createEarthGlobeMaterials(astro.sunDir);
    this.sunUniform = sunUniform;
    this.cloudMat = cloudMat;

    this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 96, 64), earthMat);
    this.earthMesh.name = "spherical-earth-3d";
    this.orbitalGroup.add(this.earthMesh);

    this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.008, 72, 48), cloudMat);
    this.orbitalGroup.add(this.cloudMesh);

    this.atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.034, 72, 48), atmoMat);
    this.orbitalGroup.add(this.atmoMesh);

    // 5. Player's Orbital Spacecraft holder in 3D Earth coordinates
    this.orbitalShipRoot = new THREE.Group();
    this.orbitalShipRoot.name = "player-orbital-spacecraft";
    this.orbitalGroup.add(this.orbitalShipRoot);

    // 6. Build 3D Space Stations & Active Satellites + 3D Orbital Trajectory Rings
    this.orbitalSatellites = [];
    for (const item of FALLBACK_ORBITAL_CATALOG) {
      const mesh = buildOrbitalCraftModel(item.kind, item.color);
      mesh.scale.setScalar(item.kind === "iss" || item.kind === "tiangong" ? 1.55 : 1.15);
      this.orbitalGroup.add(mesh);

      // 3D Orbital Inclination Ring
      const ringGeo = new THREE.BufferGeometry();
      const ringPts = new Float32Array(129 * 3);
      const rOrbit = R_EARTH + Math.max(58, item.altKm * KM_TO_UNIT);
      const inc = item.inclinationDeg * DEG;
      const raan = item.raanDeg * DEG;
      for (let j = 0; j <= 128; j++) {
        const u = (j / 128) * Math.PI * 2;
        const lat = Math.asin(Math.sin(inc) * Math.sin(u)) * RAD;
        const lon = (raan + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u))) * RAD;
        const v = latLonToVec3(lat, lon, rOrbit);
        ringPts[j * 3] = v.x;
        ringPts[j * 3 + 1] = v.y;
        ringPts[j * 3 + 2] = v.z;
      }
      ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPts, 3));
      const ringMat = new THREE.LineBasicMaterial({
        color: item.color,
        transparent: true,
        opacity: item.kind === "iss" || item.kind === "tiangong" ? 0.42 : 0.16,
      });
      const ringLine = new THREE.Line(ringGeo, ringMat);
      this.orbitalGroup.add(ringLine);

      const satEntry = {
        ...item,
        mesh,
        ringLine,
        lat: 0,
        lon: 0,
        liveAltKm: item.altKm,
        liveSpeedKmh: item.speedKmh,
        satrec: null,
        posVec: new THREE.Vector3(),
      };
      mesh.userData.satEntry = satEntry;
      if (mesh.userData.hitMesh) mesh.userData.hitMesh.userData.satEntry = satEntry;
      this.orbitalSatellites.push(satEntry);
    }

    this._propagateAllSatellites(Date.now());
  }

  // --------------------------------------------------------------------------
  // Live Real-Time Space APIs (ISS Telemetry, CelesTrak SGP4, Crew, Launches)
  // --------------------------------------------------------------------------
  async _fetchLiveSpaceApis() {
    this._pollLiveIssTelemetry();
    if (this._liveApisLoaded) return;
    this._liveApisLoaded = true;

    // 1. Live CelesTrak GP JSON for Space Stations (ISS 25544, Tiangong CSS 48274, etc.)
    try {
      const r = await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json");
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) {
          for (const gp of list) {
            const norad = Number(gp.NORAD_CAT_ID);
            const match = this.orbitalSatellites.find((s) => s.noradId === norad);
            if (match) {
              try {
                match.satrec = json2satrec(gp);
              } catch {}
            }
          }
        }
      }
    } catch {}

    // 2. Live Astronauts Currently in Space
    try {
      const r = await fetch("https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json");
      if (r.ok) {
        const data = await r.json();
        if (data && Array.isArray(data.people) && data.people.length > 0) {
          this.astronauts = data.people.map((p) => ({
            name: p.name,
            craft: p.iss ? "ISS" : p.spacecraft || "Tiangong",
          }));
          this._updateHudDom();
        }
      }
    } catch {}

    // 3. Live Upcoming Launch Manifest Status (The Space Devs Launch Library 2)
    try {
      const r = await fetch("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list");
      if (r.ok) {
        const data = await r.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          const next = data.results[0];
          const status = next.status?.abbrev || "Go";
          this.upcomingLaunchText = `Live Manifest: ${next.name} (${status})`;
          this._updateHudDom();
        }
      }
    } catch {}
  }

  async _pollLiveIssTelemetry() {
    try {
      const r = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
      if (!r.ok) return;
      const d = await r.json();
      if (d && Number.isFinite(d.latitude) && Number.isFinite(d.longitude)) {
        const iss = this.orbitalSatellites.find((s) => s.id === "iss");
        if (iss) {
          iss.liveLat = Number(d.latitude);
          iss.liveLon = Number(d.longitude);
          iss.liveAltKm = Number(d.altitude) || 418;
          iss.liveSpeedKmh = Number(d.velocity) || 27580;
          iss.liveTimestamp = Date.now();
        }
      }
    } catch {}
  }

  _propagateAllSatellites(nowMs) {
    if (!this.orbitalSatellites.length) return;
    const nowDate = new Date(nowMs);
    const jd = jday(nowDate);
    const gmst = gstime(jd);
    const secOfDay = (nowMs / 1000) % 86400;

    for (const sat of this.orbitalSatellites) {
      let lat = sat.lat;
      let lon = sat.lon;
      let altKm = sat.liveAltKm || sat.altKm;

      // Priority 1: Direct live API telemetry for ISS (with smooth dead-reckoning between 6s polls)
      if (sat.id === "iss" && Number.isFinite(sat.liveLat) && Number.isFinite(sat.liveLon)) {
        const dtSec = Math.min(12, Math.max(0, (nowMs - (sat.liveTimestamp || nowMs)) / 1000));
        lat = sat.liveLat;
        lon = ((((sat.liveLon + dtSec * 0.062) % 360) + 540) % 360) - 180;
      } else if (sat.satrec) {
        // Priority 2: Real-time SGP4 propagation from CelesTrak OMM
        try {
          const pv = sgp4(sat.satrec, (jd - sat.satrec.jdsatepoch) * 1440.0);
          if (pv && pv.position) {
            const geo = eciToGeodetic(pv.position, gmst);
            lat = THREE.MathUtils.clamp(geo.latitude * RAD, -89.9, 89.9);
            lon = geo.longitude * RAD;
            altKm = THREE.MathUtils.clamp(geo.height, 250, 2500);
          }
        } catch {}
      } else {
        // Priority 3: Analytical Keplerian propagation at `nowMs`
        const revPerSec = (sat.meanMotionRevDay || 15.2) / 86400.0;
        const meanAnom = (sat.meanAnomalyDeg * DEG) + secOfDay * revPerSec * Math.PI * 2;
        const u = (sat.argPerigeeDeg * DEG) + meanAnom;
        const inc = sat.inclinationDeg * DEG;
        const raan = (sat.raanDeg - (secOfDay / 86164.0) * 360.0) * DEG;
        lat = Math.asin(THREE.MathUtils.clamp(Math.sin(inc) * Math.sin(u), -1, 1)) * RAD;
        lon = ((((raan + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u))) * RAD) % 360) + 540) % 360 - 180;
      }

      sat.lat = lat;
      sat.lon = lon;
      sat.liveAltKm = altKm;

      const rOrbit = R_EARTH + Math.max(58, altKm * KM_TO_UNIT);
      latLonToVec3(lat, lon, rOrbit, sat.posVec);
      sat.mesh.position.copy(sat.posVec);
      sat.mesh.lookAt(0, 0, 0);
    }
  }

  // --------------------------------------------------------------------------
  // De-Orbit & Plasma Re-Entry Anywhere on Earth
  // --------------------------------------------------------------------------
  triggerReentryToLatLon(lat, lon, label = "") {
    if (this.phase === "idle" || this.phase === "reentry") return;
    this.phase = "reentry";
    this.reentryTimer = 0;
    this.reentryTarget = {
      lat: THREE.MathUtils.clamp(Number(lat) || 0, -85, 85),
      lon: ((((Number(lon) || 0) % 360) + 540) % 360) - 180,
      label: label || `${Number(lat).toFixed(2)}°, ${Number(lon).toFixed(2)}°`,
    };
    this.shipLat = this.reentryTarget.lat;
    this.shipLon = this.reentryTarget.lon;
    this.focusTargetId = "ship";
    this.audio.playStageSeparationThump();
    this._updateHudDom();
  }

  _finishReentryAndLand() {
    const target = this.reentryTarget || {
      lat: this.activeSpaceport ? this.activeSpaceport.lat : this.shipLat,
      lon: this.activeSpaceport ? this.activeSpaceport.lon : this.shipLon,
      label: "",
    };

    this.audio.stop();
    this.phase = "idle";
    this.altitudeKm = 0;
    this.velocityKmh = 0;

    if (this.orbitalGroup) this.orbitalGroup.visible = false;
    if (this.delugeGroup) this.delugeGroup.visible = false;
    if (this.rocketStack && this.rocketStack.root) {
      if (this.rocketStack.upperStage && this.rocketStack.upperStage.parent !== this.rocketStack.root) {
        this.rocketStack.root.add(this.rocketStack.upperStage);
      }
      this.app.scene.remove(this.rocketStack.root);
      this.rocketStack = null;
    }

    this._setGroundWorldVisible(true);
    this.app.camera.far = 18000;
    this.app.camera.up.set(0, 1, 0);
    this.app.camera.updateProjectionMatrix();

    if (this.hudEl) this.hudEl.classList.remove("active");
    if (typeof document !== "undefined") document.body.classList.remove("space-launch-active");

    // Teleport player directly to the chosen (lat, lon) on Earth!
    this.app.teleportToLocation(target.lat, target.lon, target.label, "");
  }

  _setGroundWorldVisible(vis) {
    const app = this.app;
    if (app.chunksRoot) app.chunksRoot.visible = vis;
    if (app.horizonRoot) app.horizonRoot.visible = vis;
    if (app.skyDome && app.skyDome.mesh) app.skyDome.mesh.visible = vis;
    if (app.landmarks && app.landmarks.root) app.landmarks.root.visible = vis;
    if (app.streetFeatures && app.streetFeatures.root) app.streetFeatures.root.visible = vis;
    if (app.vegetation && app.vegetation.root) app.vegetation.root.visible = vis;
    if (!vis) {
      if (app.vehicleMesh) app.vehicleMesh.visible = false;
      if (app.avatarMesh) app.avatarMesh.visible = false;
      if (app.heliMesh) app.heliMesh.visible = false;
    } else {
      app.setMode(app.mode || "helicopter");
    }
  }

  // --------------------------------------------------------------------------
  // Frame Update Loop (Cryo Venting -> Ascent Staging -> 3D Earth Orbit -> Reentry)
  // --------------------------------------------------------------------------
  update(dt) {
    if (this.phase === "idle") {
      this._updatePadCryoVenting(dt);
      return;
    }

    this.missionTime += dt;

    if (this.phase === "ascent") {
      this._updateAscentSequence(dt);
    } else if (this.phase === "orbit") {
      this._updateOrbitView(dt);
    } else if (this.phase === "reentry") {
      this._updateReentrySequence(dt);
    }
  }

  _updatePadCryoVenting(dt) {
    const found = this.findActiveWorldSpaceport();
    if (!found) {
      this.cryoGroup.visible = false;
      return;
    }
    const camPos = this.app.camera.position;
    const dist = Math.hypot(camPos.x - found.padX, camPos.z - found.padZ);
    if (dist > 650) {
      this.cryoGroup.visible = false;
      return;
    }

    this.cryoGroup.visible = true;
    this.cryoGroup.position.set(found.padX, found.padY, found.padZ);
    const hScale = found.spaceport.heightM / 98.0;

    for (let i = 0; i < this.cryoPuffs.length; i++) {
      const m = this.cryoPuffs[i];
      const ud = m.userData;
      ud.age += dt;
      if (ud.age >= ud.life) ud.age -= ud.life;
      const p = ud.age / ud.life;
      m.position.set(
        3.2 + p * ud.vx * 5.2,
        ud.yOffset * hScale + p * ud.vy * 4.5,
        ud.vz * p * 3.0
      );
      const s = 0.8 + p * 2.8;
      m.scale.set(s, s * 0.75, s);
      m.material.opacity = Math.sin(p * Math.PI) * 0.34;
    }
  }

  _updateAscentSequence(dt) {
    const t = this.missionTime;
    const sp = this.activeSpaceport || SPACEPORTS[0];
    const rs = this.rocketStack;
    if (!rs) return;

    // 1. Realistic multi-stage altitude & velocity profile (0s -> 13.8s)
    if (t < 3.5) {
      // Heavy pad liftoff (TWR ~1.35G) clearing the umbilical tower
      const u = t / 3.5;
      this.altitudeKm = 0.45 * u * u;
      this.velocityKmh = Math.round(520 * u * u);
      this.stageStatusEn = "STAGE 1 IGNITION · LIFTOFF & WATER DELUGE";
      this.stageStatusZh = "一级火箭点火 · 水幕降噪与离台起飞";
    } else if (t < 6.6) {
      // Gravity turn & Max-Q supersonic regime
      const u = (t - 3.5) / 3.1;
      this.altitudeKm = 0.45 + 48.0 * Math.pow(u, 1.65);
      this.velocityKmh = Math.round(520 + 6800 * Math.pow(u, 1.4));
      if (t >= 4.5 && t <= 5.8) {
        this.stageStatusEn = "MAX-Q SUPERSONIC SHOCKWAVE · GRAVITY TURN";
        this.stageStatusZh = "最大动压 (Max-Q) 音障激波锥 · 程序转弯";
      } else {
        this.stageStatusEn = "MAIN ENGINE THRUST · PITCHING DOWNRANGE";
        this.stageStatusZh = "主发动机全推力爬升 · 进入预定倾角走廊";
      }
    } else if (t < 9.6) {
      // Booster / Hot-stage separation & upper stage ignition
      const u = (t - 6.6) / 3.0;
      this.altitudeKm = 48.45 + 110.0 * u;
      this.velocityKmh = Math.round(7320 + 11400 * u);
      if (sp.stagingType === "korolev_cross") {
        this.stageStatusEn = "KOROLEV CROSS BOOSTER SEPARATION · STAGE 2 BURN";
        this.stageStatusZh = "科罗廖夫十字助推器分离 · 二级核心点火";
      } else if (sp.stagingType === "hot_stage") {
        this.stageStatusEn = "HOT-STAGE SEPARATION · SUPER HEAVY BOOSTBACK FLIP";
        this.stageStatusZh = "星舰热分离 · 超重型助推器翻转返场";
      } else {
        this.stageStatusEn = "BOOSTER SEPARATION · UPPER STAGE IGNITION";
        this.stageStatusZh = "助推器分离 · 上面级点火入轨";
      }
    } else {
      // Fairing separation, solar wing deployment & Low Earth Orbit insertion
      const u = Math.min(1, (t - 9.6) / 4.2);
      this.altitudeKm = 158.45 + 221.55 * (1 - Math.pow(1 - u, 2));
      this.velocityKmh = Math.round(18720 + 8880 * u);
      this.stageStatusEn = "FAIRING JETTISON · SOLAR ARRAY DEPLOYMENT · LEO INSERTION";
      this.stageStatusZh = "整流罩分离 · 太阳翼展开 · 进入近地轨道 (LEO)";
    }

    // 2. Update local rocket 3D position & gravity-turn pitch during low-altitude ascent
    const localClimbY =
      t < 3.5
        ? 450 * Math.pow(t / 3.5, 2.15)
        : 450 + (t - 3.5) * 820 + Math.pow(t - 3.5, 2.1) * 260;
    const downrangeDist = t < 3.0 ? 0 : Math.pow(t - 3.0, 2.0) * 95;
    const az = this.shipHeadingRad;

    rs.root.position.set(
      this.padWorldPos.x + Math.sin(az) * downrangeDist,
      this.padWorldPos.y + localClimbY,
      this.padWorldPos.z + Math.cos(az) * downrangeDist
    );

    const pitchAngle = t < 3.2 ? 0 : Math.min(1.08, ((t - 3.2) / 6.5) * 1.08);
    rs.root.rotation.set(pitchAngle * Math.cos(az), 0, -pitchAngle * Math.sin(az));

    // Flicker engine plumes
    const flicker = 0.9 + 0.18 * Math.sin(t * 62.0);
    if (rs.coreStage.userData.plume) {
      rs.coreStage.userData.plume.scale.set(1, flicker, 1);
    }

    // 3. Water Deluge Steam & Smoke Ring Animation on Pad (0 .. 7.5s)
    if (t < 7.5) {
      this.delugeGroup.visible = true;
      for (let i = 0; i < this.delugePuffs.length; i++) {
        const m = this.delugePuffs[i];
        const ud = m.userData;
        const age = (t * 1.35 + ud.phase) % 2.4;
        const p = age / 2.4;
        const rad = 8 + p * ud.speed * 3.6;
        m.position.set(Math.cos(ud.angle) * rad, p * ud.upSpeed * 4.2, Math.sin(ud.angle) * rad);
        const s = 1.2 + p * 4.5;
        m.scale.set(s, s * 0.65, s);
        m.material.opacity = Math.sin(p * Math.PI) * 0.68 * Math.max(0, 1 - t / 7.5);
      }
    } else {
      this.delugeGroup.visible = false;
    }

    // 4. Max-Q Prandtl-Glauert Shockwave Vapor Cone (4.5s .. 5.8s)
    if (rs.machConeMesh) {
      if (t >= 4.4 && t <= 5.9) {
        const w = Math.sin(((t - 4.4) / 1.5) * Math.PI);
        rs.machConeMesh.material.opacity = w * 0.58;
        rs.machConeMesh.scale.set(1 + w * 0.35, 1, 1 + w * 0.35);
      } else {
        rs.machConeMesh.material.opacity = 0;
      }
    }

    // 5. Launch Escape Tower Jettison (t >= sp.lesSepTime)
    if (rs.escapeTower && sp.lesSepTime && t >= sp.lesSepTime) {
      if (!this._lesSeparated) {
        this._lesSeparated = true;
        this.audio.playStageSeparationThump();
      }
      const dtLes = t - sp.lesSepTime;
      rs.escapeTower.position.y += dt * (85 + dtLes * 120);
      rs.escapeTower.position.x += dt * 12;
      rs.escapeTower.rotation.z -= dt * 0.8;
    }

    // 6. Booster / Stage Separation (t >= sp.boosterSepTime)
    const sepT = sp.boosterSepTime || 6.8;
    if (t >= sepT) {
      if (!this._boostersSeparated) {
        this._boostersSeparated = true;
        this.audio.playStageSeparationThump();
        if (rs.upperStage.userData.plume) rs.upperStage.userData.plume.visible = true;
      }
      const dtSep = t - sepT;
      for (let i = 0; i < rs.boosters.length; i++) {
        const b = rs.boosters[i];
        const ud = b.userData;
        if (ud.plume) ud.plume.visible = ud.isHotStage && dtSep > 0.3;
        if (ud.isHotStage) {
          // SpaceX Super Heavy Hot-Staging: booster drops back and flips 180° toward Starbase!
          b.position.y = -dtSep * 38 - dtSep * dtSep * 14;
          b.position.x = ud.dirX * dtSep * 16;
          b.rotation.z = Math.min(Math.PI * 0.85, dtSep * 1.15);
        } else {
          // Korolev Cross / Twin SRB / Quad Strap-On symmetrical outward peel & tumble!
          const radialDist = 4.0 + dtSep * 22.0 + dtSep * dtSep * 8.0;
          b.position.x = ud.dirX * radialDist;
          b.position.z = ud.dirZ * radialDist;
          b.position.y = -dtSep * 26.0 - dtSep * dtSep * 12.0;
          b.rotation.z = -ud.dirX * dtSep * (ud.isKorolev ? 1.45 : 0.95);
          b.rotation.x = ud.dirZ * dtSep * (ud.isKorolev ? 1.45 : 0.95);
        }
      }
    }

    // 7. Payload Fairing Separation & Solar Wing Deployment (t >= sp.fairingSepTime)
    const fairT = sp.fairingSepTime || 9.3;
    if (t >= fairT) {
      if (!this._fairingSeparated) {
        this._fairingSeparated = true;
        this.audio.playStageSeparationThump();
      }
      const dtFair = t - fairT;
      for (const half of rs.fairingHalves) {
        const sx = half.userData.dirX || 1;
        half.position.x += sx * dt * 28;
        half.position.y -= dt * 32;
        half.rotation.z -= sx * dt * 1.4;
      }
      if (sp.id === "nasa_ksc" && rs.coreStage) {
        rs.coreStage.position.y -= dt * 38;
        if (rs.coreStage.userData.plume) rs.coreStage.userData.plume.visible = false;
      }
      // Smoothly unfold orbital spacecraft solar wings
      const unfold = Math.min(1, dtFair / 1.8);
      for (const wing of rs.solarWings) {
        wing.scale.set(Math.max(0.01, unfold), 1, 1);
      }
    }

    // 8. Camera & Scene Transition from Local Pad -> Outer Space Top-Down 3D Spherical Earth
    if (this.altitudeKm < 105) {
      // Phase A: Atmospheric ascent camera orbiting the climbing rocket stack
      this._setGroundWorldVisible(true);
      if (this.orbitalGroup) this.orbitalGroup.visible = false;

      const skyDarken = THREE.MathUtils.clamp(this.altitudeKm / 65.0, 0, 1);
      this.app.scene.background.setRGB(
        THREE.MathUtils.lerp(0.55, 0.01, skyDarken),
        THREE.MathUtils.lerp(0.75, 0.02, skyDarken),
        THREE.MathUtils.lerp(0.92, 0.05, skyDarken)
      );

      rs.root.updateMatrixWorld(true);
      const localFocusY = sp.heightM * (t < sepT ? 0.42 : 0.52);
      const focusPt = rs.root.localToWorld(new THREE.Vector3(0, localFocusY, 0));
      const camAngle = 0.75 + t * 0.14;
      const camDist = THREE.MathUtils.lerp(155, 92, Math.min(1, t / 8.5));
      const shake = t < 4.5 ? (1 - t / 4.5) * 1.25 : 0;

      this.app.camera.position.set(
        focusPt.x + Math.sin(camAngle) * camDist + (Math.random() - 0.5) * shake,
        focusPt.y + (t < 3.5 ? -12 + t * 8 : 18) + (Math.random() - 0.5) * shake,
        focusPt.z + Math.cos(camAngle) * camDist + (Math.random() - 0.5) * shake
      );
      this.app.camera.up.set(0, 1, 0);
      this.app.camera.lookAt(focusPt.x, focusPt.y - 16, focusPt.z);
    } else {
      // Phase B: Above 75 km (approaching Kármán Line) -> Switch to Outer Space 3D Spherical Earth!
      this._enterOuterSpaceScene();
      if (t >= 13.8) {
        this.phase = "orbit";
        this.stageStatusEn = "LOW EARTH ORBIT (LEO) · REAL-TIME SATELLITE & GALAXY TRACKING";
        this.stageStatusZh = "近地轨道巡航 (LEO) · 实时星空银河与全球空间站追踪";
      }
      this._updateOrbitView(dt);
    }

    this._updateHudDom();
  }

  _enterOuterSpaceScene() {
    this._ensureOrbitalSceneGraph();
    this._setGroundWorldVisible(false);
    this.delugeGroup.visible = false;
    this.app.scene.background.setHex(0x010308);
    if (this.app.scene.fog) this.app.scene.fog.density = 0;

    if (this.app.camera.far < 90000) {
      this.app.camera.far = 95000;
      this.app.camera.updateProjectionMatrix();
    }

    this.orbitalGroup.visible = true;

    // Move the upperStage spacecraft into `this.orbitalShipRoot` so it orbits the 3D Earth!
    const rs = this.rocketStack;
    if (rs && rs.upperStage && rs.upperStage.parent !== this.orbitalShipRoot) {
      if (rs.root.parent) this.app.scene.remove(rs.root);
      this.orbitalShipRoot.clear();
      rs.upperStage.position.set(0, 0, 0);
      rs.upperStage.rotation.set(Math.PI * 0.5, 0, 0);
      rs.upperStage.scale.setScalar(0.85);
      for (const wing of rs.solarWings) wing.scale.set(1, 1, 1);
      if (rs.upperStage.userData.plume) rs.upperStage.userData.plume.visible = true;
      this.orbitalShipRoot.add(rs.upperStage);
    }
  }

  _updateOrbitView(dt) {
    this._enterOuterSpaceScene();

    // 1. Real-Time Astronomical Ephemeris (JD, GMST, Sun, Moon, J2000 Milky Way) at Date.now()
    const nowMs = Date.now();
    const astro = computeRealTimeAstronomy(nowMs);
    this.lastAstState = astro;

    if (this.celestialSphere) {
      this.celestialSphere.rotation.y = -astro.gmstDeg * DEG;
    }
    if (this.sunUniform) {
      this.sunUniform.value.copy(astro.sunDir);
    }
    if (this.sunMeshGroup) {
      this.sunMeshGroup.position.copy(astro.sunDir).multiplyScalar(28000);
    }
    if (this.moonMesh) {
      this.moonMesh.position.copy(astro.moonDir).multiplyScalar(9200);
    }
    if (this.cloudMat) {
      this.cloudMat.uniforms.uUvShift.value = (this.cloudMat.uniforms.uUvShift.value + dt * 0.0006) % 1.0;
    }

    // 2. Poll live ISS telemetry every 6 seconds & propagate all 3D satellites
    this._issPollTimer += dt;
    if (this._issPollTimer >= 6.0) {
      this._issPollTimer = 0;
      this._pollLiveIssTelemetry();
    }
    this._propagateAllSatellites(nowMs);

    // 3. Update Player's Orbital Spacecraft position around the 3D Earth (W/A/S/D + orbital drift)
    const keys = this.app.keys;
    const fwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const turn = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);

    if (turn !== 0) {
      this.shipHeadingRad += turn * dt * 1.25;
    }
    const baseOrbitalDegPerSec = 0.55;
    const manualBoostDegPerSec = fwd * 8.5;
    const moveDeg = (baseOrbitalDegPerSec + manualBoostDegPerSec) * dt;

    this.shipLat = THREE.MathUtils.clamp(
      this.shipLat + Math.cos(this.shipHeadingRad) * moveDeg,
      -84,
      84
    );
    this.shipLon = ((((this.shipLon + (Math.sin(this.shipHeadingRad) * moveDeg) / Math.max(0.2, Math.cos(this.shipLat * DEG))) % 360) + 540) % 360) - 180;

    const rShip = R_EARTH + Math.max(68, this.shipAltKm * KM_TO_UNIT);
    const shipPos = latLonToVec3(this.shipLat, this.shipLon, rShip);
    this.orbitalShipRoot.position.copy(shipPos);

    // Orient player spacecraft tangent to Earth along its orbital heading
    const aheadLat = THREE.MathUtils.clamp(this.shipLat + Math.cos(this.shipHeadingRad) * 2.0, -89, 89);
    const aheadLon = this.shipLon + Math.sin(this.shipHeadingRad) * 2.0;
    const aheadPos = latLonToVec3(aheadLat, aheadLon, rShip);
    this.orbitalShipRoot.up.copy(shipPos).normalize();
    this.orbitalShipRoot.lookAt(aheadPos);

    // 4. Position Top-Down / Orbital Camera relative to focused spacecraft or station
    let targetPos = shipPos;
    if (this.focusTargetId !== "ship") {
      const sat = this.orbitalSatellites.find((s) => s.id === this.focusTargetId);
      if (sat) {
        targetPos = sat.posVec;
        this.altitudeKm = sat.liveAltKm;
        this.velocityKmh = sat.liveSpeedKmh;
      }
    } else if (this.phase === "orbit") {
      this.altitudeKm = this.shipAltKm;
      this.velocityKmh = 27600;
    }

    const upDir = targetPos.clone().normalize();
    const worldNorth = new THREE.Vector3(0, 1, 0);
    let eastDir = new THREE.Vector3().crossVectors(worldNorth, upDir);
    if (eastDir.lengthSq() < 1e-4) eastDir.set(1, 0, 0);
    else eastDir.normalize();
    const northDir = new THREE.Vector3().crossVectors(upDir, eastDir).normalize();

    const horizDist = Math.cos(this.orbitCamPitch) * this.orbitCamDist;
    const vertDist = Math.sin(this.orbitCamPitch) * this.orbitCamDist;

    const camOffset = new THREE.Vector3()
      .addScaledVector(upDir, vertDist)
      .addScaledVector(eastDir, Math.sin(this.orbitCamYaw) * horizDist)
      .addScaledVector(northDir, -Math.cos(this.orbitCamYaw) * horizDist);

    this.app.camera.position.copy(targetPos).add(camOffset);
    this.app.camera.up.copy(northDir).addScaledVector(upDir, 0.35).normalize();
    // Look slightly toward Earth's center from the spacecraft so both spacecraft & 3D Earth fill the frame
    const lookTarget = targetPos.clone().lerp(new THREE.Vector3(0, -180, 0), 0.28);
    this.app.camera.lookAt(lookTarget);

    this._updateHudDom();
  }

  _updateReentrySequence(dt) {
    this.reentryTimer = (this.reentryTimer || 0) + dt;
    const p = Math.min(1, this.reentryTimer / 1.8);

    this.altitudeKm = THREE.MathUtils.lerp(360, 1.2, p * p);
    this.velocityKmh = Math.round(THREE.MathUtils.lerp(27600, 420, p));
    this.stageStatusEn = `ATMOSPHERIC PLASMA RE-ENTRY · LANDING AT ${this.reentryTarget?.label || ""}`;
    this.stageStatusZh = `大气层等离子体再入减速 · 正在降落至 ${this.reentryTarget?.label || ""}`;

    if (this.rocketStack && this.rocketStack.plasmaMesh) {
      this.rocketStack.plasmaMesh.material.opacity = Math.sin(p * Math.PI) * 0.88;
    }

    // Zoom camera smoothly down toward the landing point on the 3D Earth sphere
    this.orbitCamDist = THREE.MathUtils.lerp(280, 45, p);
    this._updateOrbitView(dt);

    if (p >= 1.0) {
      this._finishReentryAndLand();
    }
  }

  // --------------------------------------------------------------------------
  // Minimal Orbital Telemetry Pill DOM & Event Listeners
  // --------------------------------------------------------------------------
  _initHud() {
    if (typeof document === "undefined") return;
    if (!document.getElementById("space-orbital-hud-style")) {
      const style = document.createElement("style");
      style.id = "space-orbital-hud-style";
      style.textContent = ORBITAL_HUD_CSS;
      document.head.appendChild(style);
    }

    let hud = document.getElementById("space-orbital-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "space-orbital-hud";
      hud.innerHTML = `
        <div class="soh-top">
          <div class="soh-title-wrap">
            <span class="soh-badge" id="soh-agency-badge">SPACEX</span>
            <span class="soh-vehicle" id="soh-vehicle-name">Starship & Super Heavy</span>
            <span class="soh-stage-status" id="soh-stage-status">LIFTOFF</span>
          </div>
          <div class="soh-metrics">
            <span>ALT <strong id="soh-alt-val">0.0 km</strong></span>
            <span>VEL <strong id="soh-vel-val">0 km/h</strong></span>
            <span>INC <strong id="soh-inc-val">28.5°</strong></span>
          </div>
        </div>
        <div class="soh-bottom">
          <div class="soh-chips" id="soh-focus-chips">
            <button type="button" class="soh-chip active" data-focus="ship">🚀 My Spacecraft</button>
            <button type="button" class="soh-chip" data-focus="iss">🛰️ ISS (Live 25544)</button>
            <button type="button" class="soh-chip" data-focus="tiangong">🏮 Tiangong 天宫 (Live)</button>
            <button type="button" class="soh-chip" data-focus="hubble">🔭 Hubble HST</button>
            <button type="button" class="soh-chip" data-focus="beidou_3m">🧭 BeiDou 北斗</button>
          </div>
          <button type="button" class="soh-land-btn" id="soh-land-btn">🌍 Land Below (Esc)</button>
        </div>
        <div class="soh-subinfo">
          <span id="soh-astro-line">J2000 Galaxy Aligned · Live Crew: 8 in Space</span>
          <span id="soh-hint-line">Drag to orbit · Scroll to zoom · Double-click anywhere on Earth to land</span>
        </div>
      `;
      document.body.appendChild(hud);
    }

    this.hudEl = hud;
    this.badgeEl = hud.querySelector("#soh-agency-badge");
    this.vehicleEl = hud.querySelector("#soh-vehicle-name");
    this.statusEl = hud.querySelector("#soh-stage-status");
    this.altEl = hud.querySelector("#soh-alt-val");
    this.velEl = hud.querySelector("#soh-vel-val");
    this.incEl = hud.querySelector("#soh-inc-val");
    this.astroLineEl = hud.querySelector("#soh-astro-line");
    this.hintLineEl = hud.querySelector("#soh-hint-line");

    for (const evt of ["pointerdown", "pointerup", "click", "dblclick", "mousedown", "mouseup", "wheel"]) {
      hud.addEventListener(evt, (e) => e.stopPropagation());
    }

    hud.querySelectorAll(".soh-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.focusTargetId = btn.dataset.focus || "ship";
        this._updateHudDom();
      });
    });

    const landBtn = hud.querySelector("#soh-land-btn");
    if (landBtn) {
      landBtn.addEventListener("click", () => {
        let lat = this.shipLat;
        let lon = this.shipLon;
        if (this.focusTargetId !== "ship") {
          const sat = this.orbitalSatellites.find((s) => s.id === this.focusTargetId);
          if (sat) {
            lat = sat.lat;
            lon = sat.lon;
          }
        }
        this.triggerReentryToLatLon(lat, lon);
      });
    }
  }

  _updateHudDom() {
    if (!this.hudEl || this.phase === "idle") return;
    const zh = getLang() === "zh";
    const sp = this.activeSpaceport || SPACEPORTS[0];

    this.badgeEl.textContent = zh ? sp.agencyZh.split(" ")[0] : sp.agencyEn.split(" ")[0];
    if (this.focusTargetId === "ship") {
      this.vehicleEl.textContent = zh ? sp.vehicleZh : sp.vehicleEn;
      this.incEl.textContent = `${sp.inclinationDeg.toFixed(1)}°`;
    } else {
      const sat = this.orbitalSatellites.find((s) => s.id === this.focusTargetId);
      if (sat) {
        this.vehicleEl.textContent = zh ? sat.nameZh : sat.nameEn;
        this.incEl.textContent = `${sat.inclinationDeg.toFixed(1)}°`;
      }
    }

    this.statusEl.textContent = zh ? this.stageStatusZh : this.stageStatusEn;
    this.altEl.textContent = `${this.altitudeKm.toFixed(1)} km`;
    this.velEl.textContent = `${Math.round(this.velocityKmh).toLocaleString()} km/h`;

    this.hudEl.querySelectorAll(".soh-chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.focus === this.focusTargetId);
    });

    const astro = this.lastAstState;
    const crewNames = this.astronauts
      .slice(0, 4)
      .map((a) => a.name)
      .join(", ");
    if (this.astroLineEl && astro) {
      this.astroLineEl.textContent = zh
        ? `实时星历 GMST ${astro.gmstDeg.toFixed(1)}° · 太阳直射 (${astro.sunLat.toFixed(1)}°, ${astro.sunLon.toFixed(1)}°) · 在轨宇航员 (${this.astronauts.length}人): ${crewNames}`
        : `Real-Time GMST ${astro.gmstDeg.toFixed(1)}° · Subsolar (${astro.sunLat.toFixed(1)}°, ${astro.sunLon.toFixed(1)}°) · Crew (${this.astronauts.length}): ${crewNames}`;
    }
    if (this.hintLineEl) {
      this.hintLineEl.textContent = zh
        ? `拖拽旋转视角 · 滚轮缩放 (150km–25,000km) · 双击 3D 地球任意位置立即再入降落`
        : `${this.upcomingLaunchText} · Drag to orbit · Scroll to zoom · Double-click Earth to land`;
    }
  }

  _bindEvents() {
    if (typeof window === "undefined" || !this.app?.canvas) return;
    const canvas = this.app.canvas;

    // 1. Key triggers: E / F / Enter / Space near a spaceport pad on the ground launches the rocket;
    //    Escape while in orbit triggers de-orbit re-entry!
    window.addEventListener("keydown", (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) return;

      if (this.phase === "idle") {
        if (e.code === "KeyE" || e.code === "KeyF" || e.code === "Enter" || e.code === "Space") {
          const found = this.findActiveWorldSpaceport();
          if (!found) return;
          const dPlayer = Math.hypot(this.app.pos.x - found.padX, this.app.pos.z - found.padZ);
          const dCam = Math.hypot(this.app.camera.position.x - found.padX, this.app.camera.position.z - found.padZ);
          if (Math.min(dPlayer, dCam) <= 210) {
            e.preventDefault();
            this.launchFromSpaceport(found.spaceport.id);
          }
        }
        return;
      }

      if (e.code === "Escape" && (this.phase === "orbit" || this.phase === "ascent")) {
        e.preventDefault();
        this.triggerReentryToLatLon(this.shipLat, this.shipLon);
      }
    });

    // 2. Mouse drag & wheel zoom in Outer-Space Orbit View + 1-click satellite selection + double-click Earth re-entry
    canvas.addEventListener("pointerdown", (e) => {
      if (this.phase === "idle") return;
      if (e.button === 0) {
        this._draggingOrbit = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this._downClientX = e.clientX;
        this._downClientY = e.clientY;
      }
    });

    window.addEventListener("pointermove", (e) => {
      if (!this._draggingOrbit || this.phase === "idle") return;
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this.orbitCamYaw -= dx * 0.0065;
      this.orbitCamPitch = THREE.MathUtils.clamp(this.orbitCamPitch + dy * 0.0055, -0.45, 1.48);
    });

    window.addEventListener("pointerup", (e) => {
      if (!this._draggingOrbit) return;
      this._draggingOrbit = false;
      if (this.phase !== "orbit") return;
      const moveDist = Math.hypot(e.clientX - (this._downClientX || 0), e.clientY - (this._downClientY || 0));
      if (moveDist < 6) {
        this._handleOrbitClick(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.isInOuterSpace()) return;
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY > 0 ? 1.14 : 0.88;
        this.orbitCamDist = THREE.MathUtils.clamp(this.orbitCamDist * factor, 42, 4600);
      },
      { passive: false }
    );

    canvas.addEventListener("dblclick", (e) => {
      if (!this.isInOuterSpace() || !this.earthMesh) return;
      const rect = canvas.getBoundingClientRect();
      this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._raycaster.setFromCamera(this._ndc, this.app.camera);
      const hits = this._raycaster.intersectObject(this.earthMesh, false);
      if (hits.length > 0) {
        e.stopPropagation();
        const { lat, lon } = vec3ToLatLon(hits[0].point);
        this.triggerReentryToLatLon(lat, lon);
      }
    });
  }

  _handleOrbitClick(clientX, clientY) {
    if (!this.orbitalSatellites.length || !this.app?.canvas) return;
    const rect = this.app.canvas.getBoundingClientRect();
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.app.camera);

    const hitMeshes = this.orbitalSatellites
      .map((s) => s.mesh.userData.hitMesh)
      .filter(Boolean);
    const hits = this._raycaster.intersectObjects(hitMeshes, false);
    if (hits.length > 0 && hits[0].object.userData.satEntry) {
      this.focusTargetId = hits[0].object.userData.satEntry.id;
      this._updateHudDom();
    }
  }

  _installDebugApi() {
    if (typeof window === "undefined") return;
    window.__SPACE_LAUNCH__ = {
      system: this,
      spaceports: SPACEPORTS,
      launch: (id = "spacex_starbase") => this.launchFromSpaceport(id),
      fastForwardToOrbit: async (id = "spacex_starbase") => {
        await this.launchFromSpaceport(id);
        this.missionTime = 14.2;
        this.altitudeKm = 380;
        this.velocityKmh = 27600;
        this.phase = "orbit";
        this.stageStatusEn = "LOW EARTH ORBIT (LEO) · LIVE SATELLITES & GALAXY";
        this.stageStatusZh = "近地轨道 (LEO) · 实时星空银河与空间站追踪";
        this._enterOuterSpaceScene();
        this._updateOrbitView(0.016);
        return this.getState();
      },
      focusSatellite: (satId) => {
        this.focusTargetId = satId;
        this._updateHudDom();
        return this.getState();
      },
      reenterAt: (lat, lon, label = "") => {
        this.triggerReentryToLatLon(lat, lon, label);
      },
      getAstronomyNow: () => computeRealTimeAstronomy(Date.now()),
      getState: () => this.getState(),
    };
  }
}
