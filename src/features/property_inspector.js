/**
 * Atlas-Inspired Interactive Property & Landmark Inspector + Cinematic Drone Orbit Camera
 * + Real-World Geolocated Photo & Photo-to-3D Parcel Reconstructor.
 *
 * Core Philosophy: Radical Simplicity & Progressive Disclosure
 * - Zero clutter by default: nothing extra is shown during normal driving, walking, or flying.
 * - Step 1 (Compact Pill): On Double-Click (or Alt-Click) on any 3D building/landmark, or when jumping
 *   to a named Landmark via search/chips, displays a compact floating glass pill card with:
 *     1. Crisp 44×44px rounded real-world photo thumbnail (when resolved)
 *     2. Title (Landmark/Campus name or street parcel address)
 *     3. One short metadata line (Floors · Height · Area · Archetype · Est. Value)
 *     4. "Real Photo / 3D" progressive-disclosure toggle + "Drone Orbit" button + "×" close button.
 * - Step 2 (Progressive Disclosure Drawer on click): Clicking the 44×44px thumbnail or "Real Photo / 3D"
 *   reveals a sleek drawer with the real-world exterior photo, verified property/architectural details,
 *   and 1-click "Project Photo to 3D Building" + "Upload Photo / .GLB" live 3D parcel reconstruction.
 * - Zero per-frame overhead when idle: `update(dt)` is a single boolean check (`if (!this.orbitActive) return;`).
 */

import * as THREE from "../../vendor/three.module.js";
import { getBeijingTerrainElevation } from "../environment.js";
import { pointInRing2D } from "../chunk_builder.js";
import { LANDMARKS, landmarkWorldXZ } from "./landmarks/registry.js";
import { LANDMARKS_40 } from "../landmarks_40.js";
import { getLang, onLanguageChange, translateRoadName } from "../i18n.js";
import { classifyFamousBuilding } from "./company_building_styles.js";
import {
  fetchRealBuildingData,
  synthesizeAssessorRecord,
  RealEstateWorldModel,
} from "./real_estate_world_model.js";

const MOVEMENT_EXIT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Escape",
]);

// Curated architectural metadata for iconic landmarks & tech campuses
const LANDMARK_META = {
  applepark: {
    categoryEn: "Corporate Campus · Foster + Partners",
    categoryZh: "科技总部园区 · 诺曼·福斯特设计",
    floors: 4,
    areaM2: 260000,
    valueEn: "$12.0B Est.",
    valueZh: "估值 $120亿",
  },
  googleplex: {
    categoryEn: "Tech Campus · Mountain View",
    categoryZh: "科技总部园区 · 山景城",
    floors: 4,
    areaM2: 190000,
    valueEn: "$4.8B Est.",
    valueZh: "估值 $48亿",
  },
  googlebayview: {
    categoryEn: "Canopy Campus · BIG & Heatherwick",
    categoryZh: "龙鳞天幕园区 · BIG 设计",
    floors: 3,
    areaM2: 102000,
    valueEn: "$2.1B Est.",
    valueZh: "估值 $21亿",
  },
  nvidiahq: {
    categoryEn: "Tech Campus · Endeavor & Voyager",
    categoryZh: "科技总部园区 · 星舰双子楼",
    floors: 4,
    areaM2: 116000,
    valueEn: "$3.2B Est.",
    valueZh: "估值 $32亿",
  },
  metahq: {
    categoryEn: "Tech Campus · Frank Gehry",
    categoryZh: "科技总部园区 · 弗兰克·盖里设计",
    floors: 3,
    areaM2: 135000,
    valueEn: "$2.6B Est.",
    valueZh: "估值 $26亿",
  },
  sfcityhall: {
    categoryEn: "Beaux-Arts Civic Dome",
    categoryZh: "布杂艺术市政穹顶地标",
    floors: 5,
    areaM2: 46000,
    valueEn: "$1.45B Civic",
    valueZh: "市政地标 $14.5亿",
  },
  hollywoodsign: {
    categoryEn: "Cultural Monument · Mount Lee",
    categoryZh: "文化地标 · 李山山脊",
    floors: 1,
    areaM2: 3600,
    valueEn: "Historic Icon",
    valueZh: "历史文化地标",
  },
  griffith: {
    categoryEn: "Art Deco Observatory",
    categoryZh: "装饰艺术天文台地标",
    floors: 3,
    areaM2: 6200,
    valueEn: "$680M Civic",
    valueZh: "公共地标 $6.8亿",
  },
  transamerica: {
    categoryEn: "Futurist Pyramid Tower",
    categoryZh: "未来主义金字塔摩天楼",
    floors: 48,
    areaM2: 49000,
    valueEn: "$1.1B Est.",
    valueZh: "估值 $11亿",
  },
  salesforce: {
    categoryEn: "Supertall Glass Office Tower",
    categoryZh: "超高层玻璃幕墙写字楼",
    floors: 61,
    areaM2: 132000,
    valueEn: "$2.2B Est.",
    valueZh: "估值 $22亿",
  },
  ferrybuilding: {
    categoryEn: "Beaux-Arts Maritime Terminal",
    categoryZh: "布杂艺术渡轮航站大厦",
    floors: 3,
    areaM2: 24000,
    valueEn: "$420M Est.",
    valueZh: "估值 $4.2亿",
  },
  palacefinearts: {
    categoryEn: "Greco-Roman Rotunda & Colonnade",
    categoryZh: "古罗马复兴圆顶艺术宫",
    floors: 2,
    areaM2: 11300,
    valueEn: "Historic Landmark",
    valueZh: "历史保护建筑",
  },
  coit: {
    categoryEn: "Art Deco Fluted Observation Tower",
    categoryZh: "装饰艺术观景纪念塔",
    floors: 13,
    areaM2: 1380,
    valueEn: "Historic Landmark",
    valueZh: "历史保护地标",
  },
  empire: {
    categoryEn: "Art Deco Supertall Skyscraper",
    categoryZh: "装饰艺术超高层摩天大楼",
    floors: 102,
    areaM2: 208000,
    valueEn: "$2.5B Est.",
    valueZh: "估值 $25亿",
  },
  chrysler: {
    categoryEn: "Art Deco Crown Skyscraper",
    categoryZh: "装饰艺术不锈钢冠摩天楼",
    floors: 77,
    areaM2: 111000,
    valueEn: "$850M Est.",
    valueZh: "估值 $8.5亿",
  },
  onewtc: {
    categoryEn: "Supertall Glass Commercial Tower",
    categoryZh: "超高层玻璃幕墙世贸中心",
    floors: 94,
    areaM2: 325000,
    valueEn: "$3.8B Est.",
    valueZh: "估值 $38亿",
  },
  liberty: {
    categoryEn: "Neoclassical Copper Monument",
    categoryZh: "新古典主义铜像纪念碑",
    floors: 22,
    areaM2: 8500,
    valueEn: "World Heritage",
    valueZh: "世界文化遗产",
  },
  eiffel: {
    categoryEn: "Wrought-Iron Lattice Tower",
    categoryZh: "镂空铸铁埃菲尔铁塔",
    floors: 3,
    areaM2: 15600,
    valueEn: "World Icon",
    valueZh: "世界级地标",
  },
  westminster: {
    categoryEn: "Gothic Revival Parliament & Clock Tower",
    categoryZh: "哥特复兴式议会大厦与大本钟",
    floors: 11,
    areaM2: 32000,
    valueEn: "World Heritage",
    valueZh: "世界文化遗产",
  },
  whitehouse: {
    categoryEn: "Neoclassical Executive Residence",
    categoryZh: "新古典主义行政官邸",
    floors: 6,
    areaM2: 5100,
    valueEn: "National Landmark",
    valueZh: "国家级历史地标",
  },
  pentagon: {
    categoryEn: "Five-Ring Concentric Headquarters",
    categoryZh: "五环同心国防总部大楼",
    floors: 7,
    areaM2: 600000,
    valueEn: "National Landmark",
    valueZh: "国家级地标建筑",
  },
  forbiddencity: {
    categoryEn: "Imperial Palace Complex",
    categoryZh: "明清皇家宫殿建筑群",
    floors: 3,
    areaM2: 720000,
    valueEn: "World Heritage",
    valueZh: "世界文化遗产",
  },
  tiananmen: {
    categoryEn: "Imperial Rostrum Gate",
    categoryZh: "皇家城楼礼仪地标",
    floors: 2,
    areaM2: 4800,
    valueEn: "National Emblem",
    valueZh: "国家象征地标",
  },
  cctv: {
    categoryEn: "Deconstructivist Loop Skyscraper",
    categoryZh: "解构主义悬挑环形大厦",
    floors: 51,
    areaM2: 473000,
    valueEn: "$2.9B Est.",
    valueZh: "估值 $29亿",
  },
  chinazun: {
    categoryEn: "Supertall Ceremonial Vessel Tower",
    categoryZh: "尊形超高层摩天大厦",
    floors: 109,
    areaM2: 437000,
    valueEn: "$3.6B Est.",
    valueZh: "估值 $36亿",
  },
  spacex_starbase: {
    categoryEn: "Orbital Launch Site · Starship & Mechazilla",
    categoryZh: "重型轨道发射基地 · 星舰与机械哥斯拉发射塔",
    floors: 14,
    areaM2: 185000,
    valueEn: "$3.0B Spaceport",
    valueZh: "发射基地 $30亿 · 双击火箭发射",
  },
  nasa_ksc: {
    categoryEn: "NASA Launch Complex 39B & VAB · Artemis SLS",
    categoryZh: "美国宇航局肯尼迪发射场 LC-39B · 阿尔忒弥斯 SLS",
    floors: 36,
    areaM2: 340000,
    valueEn: "$6.5B Spaceport",
    valueZh: "航天中心 $65亿 · 双击火箭发射",
  },
  jiuquan: {
    categoryEn: "CMSA Launch Complex 921 · Long March 2F & Shenzhou",
    categoryZh: "中国酒泉载人航天发射场 921 工位 · 长征二号F与神舟",
    floors: 18,
    areaM2: 240000,
    valueEn: "National Spaceport",
    valueZh: "国家级航天发射场 · 双击火箭发射",
  },
  baikonur: {
    categoryEn: "Site 1/5 Gagarin's Start · Soyuz-2.1a & Soyuz MS",
    categoryZh: "拜科努尔一号加加林发射台 · 联盟号载人火箭",
    floors: 12,
    areaM2: 195000,
    valueEn: "Historic Cosmodrome",
    valueZh: "人类首飞发射场 · 双击火箭发射",
  },
  kourou_esa: {
    categoryEn: "ESA Guiana Space Centre ELA-4 · Ariane 6",
    categoryZh: "欧洲航天局库鲁发射中心 ELA-4 · 阿丽亚娜6号",
    floors: 16,
    areaM2: 210000,
    valueEn: "European Spaceport",
    valueZh: "欧洲赤道航天港 · 双击火箭发射",
  },
  tanegashima_jaxa: {
    categoryEn: "JAXA Yoshinobu Launch Complex · H3 Rocket",
    categoryZh: "日本种子岛宇宙中心吉信射点 · H3 主力火箭",
    floors: 15,
    areaM2: 165000,
    valueEn: "Pacific Spaceport",
    valueZh: "太平洋海岸航天港 · 双击火箭发射",
  },
};

const INSPECTOR_CSS = `
#property-inspector-card {
  position: fixed;
  left: calc(22px + env(safe-area-inset-left, 0px));
  top: calc(74px + env(safe-area-inset-top, 0px));
  z-index: 38;
  display: flex;
  flex-direction: column;
  max-width: min(600px, calc(100vw - 44px));
  padding: 8px 11px 8px 13px;
  border-radius: 26px;
  background: rgba(16, 20, 28, 0.82);
  backdrop-filter: blur(18px) saturate(155%);
  -webkit-backdrop-filter: blur(18px) saturate(155%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.44);
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", sans-serif;
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease, border-color 0.22s ease, border-radius 0.2s ease;
  user-select: none;
}
#property-inspector-card.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
#property-inspector-card.orbiting {
  border-color: rgba(96, 178, 255, 0.55);
  box-shadow: 0 10px 30px rgba(32, 128, 255, 0.24), 0 6px 20px rgba(0, 0, 0, 0.45);
}
#property-inspector-card.drawer-open {
  border-radius: 20px;
  max-width: min(440px, calc(100vw - 32px));
}
.prop-insp-pill-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
#prop-insp-thumb-btn {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(30, 41, 59, 0.75);
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  display: none;
  position: relative;
  transition: transform 0.14s ease, border-color 0.16s ease;
}
#prop-insp-thumb-btn.has-photo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
#prop-insp-thumb-btn:hover {
  transform: scale(1.04);
  border-color: rgba(125, 211, 252, 0.75);
}
#prop-insp-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.prop-insp-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}
.prop-insp-title {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.15px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
}
.prop-insp-meta {
  font-size: 11.5px;
  font-weight: 450;
  color: rgba(214, 226, 242, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
  margin-top: 1px;
}
.prop-insp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
#prop-insp-photo-btn,
#prop-insp-orbit-btn {
  appearance: none;
  border: 1px solid rgba(110, 190, 255, 0.36);
  background: rgba(58, 141, 255, 0.22);
  color: #eef6ff;
  font: 600 11.5px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  letter-spacing: 0.2px;
  padding: 7px 11px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
  white-space: nowrap;
}
#prop-insp-photo-btn {
  border-color: rgba(148, 163, 184, 0.34);
  background: rgba(255, 255, 255, 0.09);
  color: #e2e8f0;
}
#prop-insp-photo-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(186, 230, 253, 0.55);
}
#prop-insp-photo-btn.active {
  background: rgba(16, 185, 129, 0.24);
  border-color: rgba(52, 211, 153, 0.58);
  color: #ecfdf5;
}
#prop-insp-orbit-btn:hover {
  background: rgba(58, 141, 255, 0.38);
  border-color: rgba(130, 205, 255, 0.65);
}
#prop-insp-photo-btn:active,
#prop-insp-orbit-btn:active {
  transform: scale(0.97);
}
#property-inspector-card.orbiting #prop-insp-orbit-btn {
  background: rgba(255, 108, 92, 0.28);
  border-color: rgba(255, 138, 122, 0.58);
  color: #ffece8;
}
#property-inspector-card.orbiting #prop-insp-orbit-btn:hover {
  background: rgba(255, 108, 92, 0.42);
}
#prop-insp-close-btn {
  appearance: none;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(226, 234, 245, 0.78);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
#prop-insp-close-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}
/* Progressive Disclosure Drawer */
.prop-insp-drawer {
  display: none;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.11);
}
#property-inspector-card.drawer-open .prop-insp-drawer {
  display: flex;
}
.prop-insp-hero-wrap {
  position: relative;
  width: 100%;
  height: 152px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.12);
}
#prop-insp-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
}
#prop-insp-hero-img.loaded {
  display: block;
}
.prop-insp-hero-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(148, 163, 184, 0.88);
  font-size: 11.5px;
  padding: 12px;
  text-align: center;
}
.prop-insp-source-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  font-size: 10px;
  font-weight: 500;
}
.prop-insp-swatches {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.16);
}
.prop-insp-swatches.visible {
  display: inline-flex;
}
.prop-insp-swatch {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.45);
}
.prop-insp-specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.prop-insp-spec-cell {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 9px;
  padding: 6px 8px;
  min-width: 0;
}
.prop-insp-spec-label {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: rgba(148, 163, 184, 0.85);
}
.prop-insp-spec-val {
  font-size: 11.5px;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.prop-insp-drawer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
#prop-insp-reconstruct-btn {
  flex: 1 1 auto;
  appearance: none;
  border: 1px solid rgba(52, 211, 153, 0.48);
  background: rgba(16, 185, 129, 0.25);
  color: #ecfdf5;
  font: 600 11.5px/1.1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  padding: 8px 11px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
#prop-insp-reconstruct-btn:hover {
  background: rgba(16, 185, 129, 0.38);
  border-color: rgba(110, 231, 183, 0.75);
}
#prop-insp-upload-btn,
#prop-insp-reset-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  font: 500 11px/1.1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}
#prop-insp-upload-btn:hover,
#prop-insp-reset-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
#prop-insp-reset-btn {
  display: none;
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.32);
}
#prop-insp-reset-btn.visible {
  display: inline-block;
}
@media (max-width: 640px) {
  #property-inspector-card {
    left: 12px;
    right: 12px;
    top: calc(64px + env(safe-area-inset-top, 0px));
    max-width: calc(100vw - 24px);
    padding: 8px 10px 8px 12px;
  }
}
`;

function computePolygonAreaM2(flatOuter) {
  if (!flatOuter || flatOuter.length < 6) return 0;
  let area2 = 0;
  const n = flatOuter.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    area2 += flatOuter[j] * flatOuter[i + 1] - flatOuter[i] * flatOuter[j + 1];
  }
  return Math.abs(area2) * 0.5;
}

function computePolygonCentroid(flatOuter, ox = 0, oz = 0) {
  if (!flatOuter || flatOuter.length < 6) return null;
  let sx = 0;
  let sz = 0;
  const count = flatOuter.length >> 1;
  for (let i = 0; i < flatOuter.length; i += 2) {
    sx += flatOuter[i] + ox;
    sz += flatOuter[i + 1] + oz;
  }
  return { x: sx / count, z: sz / count };
}

function deterministicHash(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function formatDollarEst(valUsd, zh = false) {
  if (valUsd >= 1e9) {
    const b = (valUsd / 1e9).toFixed(valUsd >= 10e9 ? 1 : 2).replace(/\.0$/, "");
    return zh ? `估值 $${b}B` : `$${b}B Est.`;
  }
  if (valUsd >= 1e6) {
    const m = (valUsd / 1e6).toFixed(valUsd >= 25e6 ? 1 : 2).replace(/\.0$/, "");
    return zh ? `估值 $${m}M` : `$${m}M Est.`;
  }
  const k = Math.max(180, Math.round(valUsd / 1000 / 5) * 5);
  return zh ? `估值 $${k}K` : `$${k}K Est.`;
}

export class PropertyInspector {
  constructor(app) {
    this.app = app;
    this.orbitActive = false;
    this.drawerOpen = false;
    this.selected = null;
    this.realData = null;
    this._fetchReqId = 0;

    this.worldModel = new RealEstateWorldModel(app);
    if (this.app) {
      this.app.realEstateWorldModel = this.worldModel;
    }

    this.orbitAngle = 0;
    this.orbitSpeed = 0.34; // rad/s cinematic aerial 360° orbit
    this.orbitBlend = 0;
    this._startCamPos = new THREE.Vector3();
    this._startLookAt = new THREE.Vector3();
    this._curLookAt = new THREE.Vector3();

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this.cardEl = null;
    this.thumbBtnEl = null;
    this.thumbImgEl = null;
    this.titleEl = null;
    this.metaEl = null;
    this.photoBtnEl = null;
    this.orbitBtnEl = null;
    this.closeBtnEl = null;
    this.drawerEl = null;
    this.heroImgEl = null;
    this.heroEmptyEl = null;
    this.sourceBadgeEl = null;
    this.swatchesEl = null;
    this.specsEl = null;
    this.reconstructBtnEl = null;
    this.uploadBtnEl = null;
    this.resetBtnEl = null;
    this.fileInputEl = null;
    this.highlightLine = null;

    this._initDom();
    this._initHighlightMesh();
    this._bindEvents();

    onLanguageChange(() => {
      if (this.selected) this._renderCard();
    });
  }

  _initDom() {
    if (typeof document === "undefined") return;
    if (!document.getElementById("property-inspector-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "property-inspector-styles";
      styleEl.textContent = INSPECTOR_CSS;
      document.head.appendChild(styleEl);
    }

    let card = document.getElementById("property-inspector-card");
    if (!card) {
      card = document.createElement("aside");
      card.id = "property-inspector-card";
      card.setAttribute("role", "region");
      card.setAttribute("aria-label", "Property Inspector");
      card.innerHTML = `
        <div class="prop-insp-pill-row">
          <button type="button" id="prop-insp-thumb-btn" title="View Real Photo & 3D Reconstruction">
            <img id="prop-insp-thumb-img" alt="" crossorigin="anonymous" />
          </button>
          <div class="prop-insp-text">
            <div class="prop-insp-title" id="prop-insp-title"></div>
            <div class="prop-insp-meta" id="prop-insp-meta"></div>
          </div>
          <div class="prop-insp-actions">
            <button type="button" id="prop-insp-fsd-btn">FSD Here</button>
            <button type="button" id="prop-insp-photo-btn">Real Photo</button>
            <button type="button" id="prop-insp-orbit-btn">Drone Orbit</button>
            <button type="button" id="prop-insp-close-btn" title="Close [Esc]" aria-label="Close">×</button>
          </div>
        </div>
        <div class="prop-insp-drawer" id="prop-insp-drawer">
          <div class="prop-insp-hero-wrap">
            <img id="prop-insp-hero-img" alt="" crossorigin="anonymous" />
            <div class="prop-insp-hero-empty" id="prop-insp-hero-empty"></div>
            <div class="prop-insp-source-badge" id="prop-insp-source-badge"></div>
            <div class="prop-insp-swatches" id="prop-insp-swatches"></div>
          </div>
          <div class="prop-insp-specs" id="prop-insp-specs"></div>
          <div class="prop-insp-drawer-actions">
            <button type="button" id="prop-insp-reconstruct-btn">Project Photo to 3D Building</button>
            <button type="button" id="prop-insp-upload-btn">Upload Photo / .GLB</button>
            <button type="button" id="prop-insp-reset-btn">Reset</button>
            <input type="file" id="prop-insp-file-input" accept="image/*,.glb,.gltf" style="display:none" />
          </div>
        </div>
      `;
      document.body.appendChild(card);
    }

    this.cardEl = card;
    this.thumbBtnEl = card.querySelector("#prop-insp-thumb-btn");
    this.thumbImgEl = card.querySelector("#prop-insp-thumb-img");
    this.titleEl = card.querySelector("#prop-insp-title");
    this.metaEl = card.querySelector("#prop-insp-meta");
    this.fsdBtnEl = card.querySelector("#prop-insp-fsd-btn");
    this.photoBtnEl = card.querySelector("#prop-insp-photo-btn");
    this.orbitBtnEl = card.querySelector("#prop-insp-orbit-btn");
    this.closeBtnEl = card.querySelector("#prop-insp-close-btn");
    this.drawerEl = card.querySelector("#prop-insp-drawer");
    this.heroImgEl = card.querySelector("#prop-insp-hero-img");
    this.heroEmptyEl = card.querySelector("#prop-insp-hero-empty");
    this.sourceBadgeEl = card.querySelector("#prop-insp-source-badge");
    this.swatchesEl = card.querySelector("#prop-insp-swatches");
    this.specsEl = card.querySelector("#prop-insp-specs");
    this.reconstructBtnEl = card.querySelector("#prop-insp-reconstruct-btn");
    this.uploadBtnEl = card.querySelector("#prop-insp-upload-btn");
    this.resetBtnEl = card.querySelector("#prop-insp-reset-btn");
    this.fileInputEl = card.querySelector("#prop-insp-file-input");

    const stopProp = (e) => e.stopPropagation();
    for (const evt of ["pointerdown", "pointerup", "click", "dblclick", "mousedown", "mouseup", "touchstart", "wheel"]) {
      card.addEventListener(evt, stopProp);
    }

    const toggleDrawer = () => {
      this.drawerOpen = !this.drawerOpen;
      this._renderCard();
    };
    this.thumbBtnEl.addEventListener("click", toggleDrawer);
    this.photoBtnEl.addEventListener("click", toggleDrawer);

    if (this.fsdBtnEl) {
      this.fsdBtnEl.addEventListener("click", () => {
        if (!this.selected || !this.app) return;
        if (this.orbitActive) this.stopOrbit();
        const zh = getLang() === "zh";
        const label = zh ? this.selected.titleZh : this.selected.titleEn;
        if (typeof this.app.setFsdDestination === "function") {
          this.app.setFsdDestination(this.selected.cx, this.selected.cz, label);
        }
      });
    }

    this.orbitBtnEl.addEventListener("click", () => {
      if (this.orbitActive) {
        this.stopOrbit();
      } else {
        this.startOrbit();
      }
    });

    this.closeBtnEl.addEventListener("click", () => {
      this.dismiss();
    });

    this.reconstructBtnEl.addEventListener("click", async () => {
      if (!this.selected) return;
      const zh = getLang() === "zh";
      this.reconstructBtnEl.textContent = zh ? "正在生成 3D 建筑..." : "Reconstructing 3D...";
      const photoSrc = this.realData?.photoUrl || this.realData?.photoThumbUrl || "";
      await this.worldModel.reconstructParcelFromImage(this.selected, photoSrc);
      this._renderCard();
    });

    this.uploadBtnEl.addEventListener("click", () => {
      if (this.fileInputEl) this.fileInputEl.click();
    });

    this.fileInputEl.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file || !this.selected) return;
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
        const buf = await file.arrayBuffer();
        await this.worldModel.loadParcelGlbOverride(this.selected, buf, file.name);
        if (this.realData) {
          this.realData.photoSource = `3D Model · ${file.name}`;
        }
        this._renderCard();
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || "");
          if (!dataUrl) return;
          if (!this.realData) {
            this.realData = synthesizeAssessorRecord(this.selected.lat, this.selected.lon, this.selected);
          }
          this.realData.photoThumbUrl = dataUrl;
          this.realData.photoUrl = dataUrl;
          this.realData.photoSource = getLang() === "zh" ? "实景照片上传" : "Custom Listing Photo";
          await this.worldModel.reconstructParcelFromImage(this.selected, dataUrl);
          this._renderCard();
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    });

    this.resetBtnEl.addEventListener("click", () => {
      if (!this.selected) return;
      this.worldModel.removeParcelReconstruction(this.selected);
      this._renderCard();
    });
  }

  _initHighlightMesh() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(128 * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x5ab4ff,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
    });
    this.highlightLine = new THREE.LineLoop(geom, mat);
    this.highlightLine.visible = false;
    this.highlightLine.frustumCulled = false;
    this.highlightLine.renderOrder = 18;
    if (this.app && this.app.scene) {
      this.app.scene.add(this.highlightLine);
    }
  }

  _updateHighlightRing(ringPts, y) {
    if (!this.highlightLine) return;
    if (!ringPts || ringPts.length < 6) {
      this.highlightLine.visible = false;
      return;
    }
    const maxVerts = 128;
    const count = Math.min(maxVerts, ringPts.length >> 1);
    const posAttr = this.highlightLine.geometry.getAttribute("position");
    const arr = posAttr.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] = ringPts[i * 2];
      arr[i * 3 + 1] = y + 0.35;
      arr[i * 3 + 2] = ringPts[i * 2 + 1];
    }
    posAttr.needsUpdate = true;
    this.highlightLine.geometry.setDrawRange(0, count);
    this.highlightLine.geometry.computeBoundingSphere();
    this.highlightLine.visible = true;
  }

  _bindEvents() {
    if (typeof window === "undefined" || !this.app || !this.app.canvas) return;
    const canvas = this.app.canvas;

    // Double-click on any building or landmark in the 3D world
    canvas.addEventListener("dblclick", (e) => {
      if (e.button !== 0) return;
      this.inspectAtScreenPoint(e.clientX, e.clientY);
    });

    // Alt-click on any building or landmark in the 3D world
    let altDownPos = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 0 && e.altKey) {
        altDownPos = { x: e.clientX, y: e.clientY };
      } else {
        altDownPos = null;
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      if (altDownPos && e.button === 0 && Math.hypot(e.clientX - altDownPos.x, e.clientY - altDownPos.y) < 8) {
        this.inspectAtScreenPoint(e.clientX, e.clientY);
      }
      altDownPos = null;
    });

    // Pressing any movement key or Escape stops Drone Orbit immediately
    window.addEventListener(
      "keydown",
      (e) => {
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
          return;
        }
        if (this.orbitActive && MOVEMENT_EXIT_CODES.has(e.code)) {
          this.stopOrbit();
          if (e.code === "Escape") {
            this.dismiss();
          }
          return;
        }
        if (e.code === "Escape" && this.selected) {
          this.dismiss();
        }
      },
      true
    );
  }

  inspectAtScreenPoint(clientX, clientY) {
    const app = this.app;
    if (!app || !app.camera || !app.canvas) return null;
    const rect = app.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, app.camera);

    if (app.spaceLaunch && app.spaceLaunch.isControllingCamera()) return null;
    const ray = this._raycaster.ray;
    if (app.spaceLaunch && app.spaceLaunch.tryTriggerFromRay(ray)) {
      this.dismiss();
      return null;
    }
    const lmHit = this._raycastLandmarks(ray);
    const bldgHit = this._raycastChunkBuildings(ray);

    let chosen = null;
    if (lmHit && bldgHit) {
      chosen = lmHit.t <= bldgHit.t + 8.0 ? lmHit : bldgHit;
    } else {
      chosen = lmHit || bldgHit;
    }

    if (!chosen) return null;
    if (app.spaceLaunch && app.spaceLaunch.tryTriggerFromClick({ x: chosen.wx, z: chosen.wz })) {
      this.dismiss();
      return null;
    }

    const profile =
      chosen.kind === "landmark"
        ? this._buildLandmarkProfile(chosen.landmark, chosen.wx, chosen.wz, chosen.baseY, chosen.topY)
        : this._buildBuildingProfile(chosen.entity, chosen.chunk, chosen.wx, chosen.wz);

    this.selectProfile(profile);
    return profile;
  }

  onLocationJump(lat, lon, displayName = "", streetName = "", forceInspect = false) {
    if (this.orbitActive) {
      this.stopOrbit();
    }
    if (this.worldModel) {
      this.worldModel.restoreSavedParcelsForOrigin();
    }
    if (!forceInspect) {
      this.dismiss();
      return null;
    }
    const app = this.app;
    if (!app || !app.worldOrigin) return null;

    const qName = `${displayName} ${streetName}`.toLowerCase();
    let bestLm = null;
    let bestDistM = 480;

    for (const L of LANDMARKS) {
      if (!L.on) continue;
      const dLat = (L.lat - lat) * 111132;
      const dLon = (L.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
      const distM = Math.hypot(dLat, dLon);
      const nameMatch =
        qName.length > 2 &&
        (qName.includes(L.name.toLowerCase()) ||
          L.name.toLowerCase().includes(displayName.toLowerCase().trim() || "__none__") ||
          (L.nameZh && qName.includes(L.nameZh)));
      if (distM < bestDistM || (nameMatch && distM < 1800)) {
        bestDistM = distM;
        bestLm = L;
      }
    }

    if (bestLm) {
      const xz = landmarkWorldXZ(bestLm, app.worldOrigin);
      if (xz) {
        const lmItem = app.landmarks?.items?.find((it) => it.L && it.L.id === bestLm.id);
        const baseY = lmItem && Number.isFinite(lmItem.baseY) ? lmItem.baseY : getBeijingTerrainElevation(xz[0], xz[1]);
        const topY = baseY + (bestLm.height || 36);
        const profile = this._buildLandmarkProfile(bestLm, xz[0], xz[1], baseY, topY);
        this.selectProfile(profile);
        return profile;
      }
    }

    if (app.worldOrigin.isBeijing) {
      const wx = (lon - app.worldOrigin.centerLon) * app.worldOrigin.mPerDegLon;
      const wz = (app.worldOrigin.centerLat - lat) * app.worldOrigin.mPerDegLat;
      for (const lm40 of LANDMARKS_40) {
        const d = Math.hypot(wx - lm40.wx, wz - lm40.wz);
        if (d < 260) {
          const baseY = getBeijingTerrainElevation(lm40.wx, lm40.wz);
          const h = lm40.height || 45;
          const profile = this._buildLandmarkProfile(
            {
              id: lm40.id,
              name: lm40.nameEn || lm40.nameZh,
              nameZh: lm40.nameZh,
              lat,
              lon,
              height: h,
              supp: { hw: (lm40.w || 40) * 0.5, hd: (lm40.d || 40) * 0.5 },
            },
            lm40.wx,
            lm40.wz,
            baseY,
            baseY + h
          );
          this.selectProfile(profile);
          return profile;
        }
      }
    }

    if (forceInspect) {
      const wx = (lon - app.worldOrigin.centerLon) * app.worldOrigin.mPerDegLon;
      const wz = (app.worldOrigin.centerLat - lat) * app.worldOrigin.mPerDegLat;
      const near = this._findNearestBuildingEntity(wx, wz, 140);
      if (near) {
        const profile = this._buildBuildingProfile(near.entity, near.chunk, wx, wz, displayName || streetName);
        this.selectProfile(profile);
        return profile;
      }
    }

    this.dismiss();
    return null;
  }

  searchLandmarks(query) {
    const q = (query || "").trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    for (const L of LANDMARKS) {
      if (!L.on) continue;
      if (
        L.name.toLowerCase().includes(q) ||
        (L.nameZh && L.nameZh.includes(q)) ||
        L.id.toLowerCase().includes(q)
      ) {
        const meta = LANDMARK_META[L.id];
        out.push({
          id: L.id,
          name: getLang() === "zh" ? L.nameZh || L.name : L.name,
          sub: meta
            ? getLang() === "zh"
              ? meta.categoryZh
              : meta.categoryEn
            : `${L.lat.toFixed(4)}°, ${L.lon.toFixed(4)}°`,
          street: L.name,
          city: meta ? (getLang() === "zh" ? meta.categoryZh : meta.categoryEn) : "Landmark",
          lat: L.lat,
          lon: L.lon,
          isLandmark: true,
        });
      }
    }
    return out.slice(0, 5);
  }

  _raycastLandmarks(ray) {
    const app = this.app;
    let bestHit = null;

    const lmSys = app.landmarks;
    const lmGroup = (lmSys && (lmSys.group || lmSys.root)) || null;
    if (lmGroup && lmGroup.children && lmGroup.children.length > 0) {
      const meshes = [];
      lmGroup.traverseVisible((obj) => {
        if (obj.isMesh && obj.geometry && obj.geometry.attributes?.position?.array) {
          meshes.push(obj);
        }
      });
      if (meshes.length > 0) {
        const hits = this._raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const hit = hits[0];
          let cur = hit.object;
          let lmId = null;
          while (cur) {
            if (cur.userData && cur.userData.landmark) {
              lmId = cur.userData.landmark;
              break;
            }
            if (typeof cur.name === "string" && cur.name.startsWith("landmark:")) {
              lmId = cur.name.slice("landmark:".length);
              break;
            }
            cur = cur.parent;
          }
          const item = lmSys.items ? lmSys.items.find((it) => it.L && it.L.id === lmId) : null;
          if (item && item.L) {
            const h = (item.stats && item.stats.modelHeight) || item.L.height || 36;
            bestHit = {
              kind: "landmark",
              t: hit.distance,
              landmark: item.L,
              wx: item.x,
              wz: item.z,
              baseY: item.baseY,
              topY: item.baseY + h,
            };
          }
        }
      }
    }

    if (lmSys && Array.isArray(lmSys.items)) {
      const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
      const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
      for (const it of lmSys.items) {
        if (!it || !it.L) continue;
        const s = it.L.supp || { r: 24 };
        const rx = s.r || s.hw || 28;
        const rz = s.r || s.hd || 28;
        const h = (it.stats && it.stats.modelHeight) || it.L.height || 36;
        const minX = it.x - rx, maxX = it.x + rx;
        const minZ = it.z - rz, maxZ = it.z + rz;
        const minY = it.baseY, maxY = it.baseY + h;
        const t = this._intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ);
        if (t !== null && t < 3500 && (!bestHit || t < bestHit.t)) {
          bestHit = {
            kind: "landmark",
            t,
            landmark: it.L,
            wx: it.x,
            wz: it.z,
            baseY: minY,
            topY: maxY,
          };
        }
      }
    }

    return bestHit;
  }

  _raycastChunkBuildings(ray) {
    const app = this.app;
    if (!app || !app.loadedChunks) return null;

    const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
    const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    let bestT = 2800;
    let bestEntity = null;
    let bestChunk = null;
    let bestHitX = 0;
    let bestHitZ = 0;

    const raycastableMeshes = [];
    for (const chunk of app.loadedChunks.values()) {
      const bGroup = chunk.userData?.subGroups?.buildings;
      if (!bGroup || !bGroup.visible) continue;
      bGroup.traverseVisible((obj) => {
        if (obj.isMesh && obj.geometry && obj.geometry.attributes?.position?.array) {
          raycastableMeshes.push(obj);
        }
      });
    }
    if (raycastableMeshes.length > 0) {
      const meshHits = this._raycaster.intersectObjects(raycastableMeshes, false);
      if (meshHits.length > 0 && meshHits[0].distance < bestT) {
        const pt = meshHits[0].point;
        const near = this._findNearestBuildingEntity(pt.x, pt.z, 45);
        if (near) {
          bestT = meshHits[0].distance;
          bestEntity = near.entity;
          bestChunk = near.chunk;
          bestHitX = pt.x;
          bestHitZ = pt.z;
        }
      }
    }

    for (const chunk of app.loadedChunks.values()) {
      const ud = chunk.userData;
      if (!ud) continue;

      const chunkMinX = ud.ox - 580, chunkMaxX = ud.ox + 580;
      const chunkMinZ = ud.oz - 580, chunkMaxZ = ud.oz + 580;
      const chunkT = this._intersectRayAABB(ox, oy, oz, dx, dy, dz, chunkMinX, -50, chunkMinZ, chunkMaxX, 900, chunkMaxZ);
      if (chunkT === null || chunkT > bestT) continue;

      const entities = ud.buildingEntities || [];
      for (let i = 0; i < entities.length; i++) {
        const b = entities[i];
        const baseY = b.baseY !== undefined ? b.baseY : (b.terrainY || 0);
        const topY = b.topY !== undefined ? b.topY : (b.h || baseY + (b.height || 12));
        const tBox = this._intersectRayAABB(ox, oy, oz, dx, dy, dz, b.minX, baseY, b.minZ, b.maxX, topY, b.maxZ);
        if (tBox === null || tBox >= bestT) continue;

        const tPrism = this._intersectRayPolygonPrism(
          ox, oy, oz, dx, dy, dz,
          b.flatOuter, b.ox || ud.ox, b.oz || ud.oz,
          baseY, topY, tBox
        );
        if (tPrism !== null && tPrism < bestT) {
          bestT = tPrism;
          bestEntity = b;
          bestChunk = chunk;
          bestHitX = ox + dx * tPrism;
          bestHitZ = oz + dz * tPrism;
        }
      }

      const colliders = ud.buildingColliders || [];
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const topY = c.h || 15;
        const baseY = topY - 80;
        const tBox = this._intersectRayAABB(ox, oy, oz, dx, dy, dz, c.minX, baseY, c.minZ, c.maxX, topY, c.maxZ);
        if (tBox === null || tBox >= bestT) continue;
        const tPrism = this._intersectRayPolygonPrism(
          ox, oy, oz, dx, dy, dz,
          c.flatOuter, c.ox || ud.ox, c.oz || ud.oz,
          baseY, topY, tBox
        );
        if (tPrism !== null && tPrism < bestT) {
          if (c.landmark) {
            const lm = LANDMARKS.find((l) => l.id === c.landmark);
            if (lm) {
              const xz = landmarkWorldXZ(lm, app.worldOrigin) || [(c.minX + c.maxX) * 0.5, (c.minZ + c.maxZ) * 0.5];
              const gY = getBeijingTerrainElevation(xz[0], xz[1]);
              return {
                kind: "landmark",
                t: tPrism,
                landmark: lm,
                wx: xz[0],
                wz: xz[1],
                baseY: gY,
                topY: gY + (lm.height || 36),
              };
            }
          }
          bestT = tPrism;
          const gY = getBeijingTerrainElevation((c.minX + c.maxX) * 0.5, (c.minZ + c.maxZ) * 0.5);
          bestEntity = {
            id: c.id,
            name: c.name || "",
            minX: c.minX,
            maxX: c.maxX,
            minZ: c.minZ,
            maxZ: c.maxZ,
            baseY: gY,
            topY: c.h,
            height: Math.max(4, c.h - gY),
            levels: Math.max(1, Math.round(Math.max(4, c.h - gY) / 3.5)),
            flatOuter: c.flatOuter,
            ox: c.ox || ud.ox,
            oz: c.oz || ud.oz,
          };
          bestChunk = chunk;
          bestHitX = ox + dx * tPrism;
          bestHitZ = oz + dz * tPrism;
        }
      }
    }

    if (!bestEntity) return null;

    const cx = (bestEntity.minX + bestEntity.maxX) * 0.5;
    const cz = (bestEntity.minZ + bestEntity.maxZ) * 0.5;
    if (app.landmarks && Array.isArray(app.landmarks.items)) {
      for (const it of app.landmarks.items) {
        if (!it || !it.L) continue;
        const s = it.L.supp || { r: 30 };
        const rad = Math.max(40, (s.r || Math.hypot(s.hw || 30, s.hd || 30)) * 1.15);
        if (Math.hypot(cx - it.x, cz - it.z) <= rad) {
          const h = (it.stats && it.stats.modelHeight) || it.L.height || 36;
          return {
            kind: "landmark",
            t: bestT,
            landmark: it.L,
            wx: it.x,
            wz: it.z,
            baseY: it.baseY,
            topY: it.baseY + h,
          };
        }
      }
    }

    return {
      kind: "building",
      t: bestT,
      entity: bestEntity,
      chunk: bestChunk,
      wx: bestHitX,
      wz: bestHitZ,
    };
  }

  _findNearestBuildingEntity(wx, wz, maxDist = 120) {
    const app = this.app;
    if (!app || !app.loadedChunks) return null;
    let best = null;
    let bestD = maxDist;
    for (const chunk of app.loadedChunks.values()) {
      const entities = chunk.userData?.buildingEntities || [];
      for (let i = 0; i < entities.length; i++) {
        const b = entities[i];
        const cx = (b.minX + b.maxX) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        const d = Math.hypot(wx - cx, wz - cz);
        const insideBox = wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ;
        const score = insideBox ? d * 0.15 : d;
        if (score < bestD) {
          bestD = score;
          best = { entity: b, chunk };
        }
      }
    }
    return best;
  }

  _intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
    const invX = Math.abs(dx) > 1e-8 ? 1.0 / dx : 1e8;
    const invY = Math.abs(dy) > 1e-8 ? 1.0 / dy : 1e8;
    const invZ = Math.abs(dz) > 1e-8 ? 1.0 / dz : 1e8;

    const t1 = (minX - ox) * invX;
    const t2 = (maxX - ox) * invX;
    const t3 = (minY - oy) * invY;
    const t4 = (maxY - oy) * invY;
    const t5 = (minZ - oz) * invZ;
    const t6 = (maxZ - oz) * invZ;

    const tMin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
    const tMax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

    if (tMax < 0 || tMin > tMax) return null;
    return tMin >= 0 ? tMin : tMax;
  }

  _intersectRayPolygonPrism(ox, oy, oz, dx, dy, dz, flatOuter, chunkOx, chunkOz, baseY, topY, fallbackT) {
    if (!flatOuter || flatOuter.length < 6) return fallbackT;

    let bestT = Infinity;

    if (dy < -1e-6) {
      const tRoof = (topY - oy) / dy;
      if (tRoof > 0) {
        const hx = ox + dx * tRoof - chunkOx;
        const hz = oz + dz * tRoof - chunkOz;
        if (pointInRing2D(hx, hz, flatOuter)) {
          bestT = tRoof;
        }
      }
    }

    const n = flatOuter.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = flatOuter[j] + chunkOx;
      const az = flatOuter[j + 1] + chunkOz;
      const ex = flatOuter[i] + chunkOx - ax;
      const ez = flatOuter[i + 1] + chunkOz - az;

      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-8) continue;

      const wx = ax - ox;
      const wz = az - oz;
      const t = (wx * ez - wz * ex) / den;
      if (t <= 0 || t >= bestT) continue;

      const u = (wx * dz - wz * dx) / den;
      if (u < 0 || u > 1) continue;

      const hy = oy + dy * t;
      if (hy >= baseY - 0.5 && hy <= topY + 0.5) {
        bestT = t;
      }
    }

    return bestT < Infinity ? bestT : null;
  }

  _buildLandmarkProfile(L, wx, wz, baseY, topY) {
    const o = this.app?.worldOrigin || { centerLat: 37.7955, centerLon: -122.3937, mPerDegLat: 111000, mPerDegLon: 88000 };
    const lat = Number.isFinite(L.lat) ? L.lat : o.centerLat - wz / (o.mPerDegLat || 111000);
    const lon = Number.isFinite(L.lon) ? L.lon : o.centerLon + wx / (o.mPerDegLon || 88000);

    const height = Math.max(8, Math.round(topY - baseY));
    const meta = LANDMARK_META[L.id] || {};
    const floors = meta.floors || Math.max(1, Math.round(height / 4.2));
    const s = L.supp || { r: 30 };
    const areaM2 =
      meta.areaM2 ||
      Math.round(s.r ? Math.PI * s.r * s.r : Math.max(400, (s.hw || 25) * 2 * (s.hd || 25) * 2));
    const catEn = meta.categoryEn || "Iconic Landmark";
    const catZh = meta.categoryZh || "城市地标建筑";
    const estValueUsd = areaM2 * floors * 9500;
    const valEn = meta.valueEn || formatDollarEst(estValueUsd, false);
    const valZh = meta.valueZh || formatDollarEst(estValueUsd, true);

    const titleEn = L.name || "Landmark";
    const titleZh = L.nameZh || L.name || "地标建筑";

    const floorsLabelEn = floors > 1 ? `${floors} Floors · ` : "";
    const floorsLabelZh = floors > 1 ? `${floors}层 · ` : "";
    const metaEn = `${floorsLabelEn}${height}m · ${catEn} · ${valEn}`;
    const metaZh = `${floorsLabelZh}${height}米 · ${catZh} · ${valZh}`;

    const ringPts = [];
    const fpRadius = s.r ? s.r : Math.hypot(s.hw || 28, s.hd || 28);
    if (s.r) {
      const segs = 40;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        ringPts.push(wx + Math.cos(a) * s.r, wz + Math.sin(a) * s.r);
      }
    } else {
      const hw = s.hw || 28;
      const hd = s.hd || 28;
      const rad = ((L.heading || 0) * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      for (const [ux, uz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
        ringPts.push(wx + ux * cos - uz * sin, wz + ux * sin + uz * cos);
      }
    }

    const orbitRadius = Math.max(45, height * 1.65, fpRadius * 1.38);
    const orbitY = topY + Math.max(28, height * 0.55);
    const lookY = baseY + height * 0.56;

    return {
      isLandmark: true,
      id: L.id,
      lat,
      lon,
      floors,
      areaM2,
      archEn: catEn,
      archZh: catZh,
      estValueUsd,
      titleEn,
      titleZh,
      metaEn,
      metaZh,
      cx: wx,
      cz: wz,
      baseY,
      topY,
      height,
      radius: orbitRadius,
      orbitY,
      lookY,
      ringPts,
    };
  }

  _buildBuildingProfile(entity, chunk, hitX, hitZ, overrideTitle = "") {
    const app = this.app;
    const o = app.worldOrigin || { centerLat: 37.7955, centerLon: -122.3937, mPerDegLat: 111000, mPerDegLon: 88000 };

    const centroid =
      computePolygonCentroid(entity.flatOuter, entity.ox || 0, entity.oz || 0) || {
        x: (entity.minX + entity.maxX) * 0.5,
        z: (entity.minZ + entity.maxZ) * 0.5,
      };
    const cx = centroid.x;
    const cz = centroid.z;
    const baseY = entity.baseY !== undefined ? entity.baseY : getBeijingTerrainElevation(cx, cz);
    const topY = entity.topY !== undefined ? entity.topY : baseY + (entity.height || 14);
    const height = Math.max(4, Math.round(topY - baseY));
    const floors = Math.max(1, entity.levels || Math.round(height / 3.6));

    const polyArea = computePolygonAreaM2(entity.flatOuter);
    const boxArea = Math.max(36, (entity.maxX - entity.minX) * (entity.maxZ - entity.minZ) * 0.72);
    const areaM2 = Math.max(42, Math.round(polyArea > 12 ? polyArea : boxArea));

    const lat = o.centerLat - cz / (o.mPerDegLat || 111000);
    const lon = o.centerLon + cx / (o.mPerDegLon || 88000);
    const hVal = deterministicHash(cx, cz);

    let poiNameEn = "";
    let poiNameZh = "";
    if (chunk && chunk.userData?.places?.piNotable) {
      let bestPoiDist = 42;
      for (const [px, pz, , , nameZh, nameEn] of chunk.userData.places.piNotable) {
        const d = Math.hypot(px - cx, pz - cz);
        if (d < bestPoiDist && (nameEn || nameZh)) {
          bestPoiDist = d;
          poiNameEn = nameEn || nameZh;
          poiNameZh = nameZh || nameEn;
        }
      }
    }

    let streetNameEn = "";
    let streetNameZh = "";
    if (chunk && Array.isArray(chunk.userData?.roadSegments)) {
      let bestRoadDist = 180;
      for (const s of chunk.userData.roadSegments) {
        if (!s.name || s.cls === "footway" || s.cls === "steps" || s.cls === "service") continue;
        const mx = (s.x1 + s.x2) * 0.5;
        const mz = (s.z1 + s.z2) * 0.5;
        const d = Math.hypot(mx - cx, mz - cz);
        if (d < bestRoadDist) {
          bestRoadDist = d;
          streetNameEn = translateRoadName(s.name);
          streetNameZh = s.nameZh || s.name;
        }
      }
    }
    if (!streetNameEn && app.currentRoadName) {
      streetNameEn = translateRoadName(app.currentRoadName);
      streetNameZh = app.currentRoadName;
    }

    const houseNum = 100 + (Math.floor(hVal * 1850) & ~1);
    const hasRealOsmName =
      entity.name &&
      !entity.name.includes("沿线") &&
      !entity.name.includes("层)") &&
      !entity.name.includes("建筑") &&
      !entity.name.includes("大厦") &&
      !entity.name.includes("写字楼");

    let titleEn = overrideTitle || poiNameEn || entity.nameEn || (hasRealOsmName ? entity.name : "");
    let titleZh = overrideTitle || poiNameZh || (hasRealOsmName ? entity.name : "");

    if (!titleEn) {
      if (streetNameEn) {
        titleEn = `${houseNum} ${streetNameEn}`;
      } else {
        titleEn = `Parcel ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;
      }
    }
    if (!titleZh) {
      if (streetNameZh) {
        titleZh = `${streetNameZh} ${houseNum}号`;
      } else {
        titleZh = titleEn;
      }
    }

    const famous = classifyFamousBuilding(
      overrideTitle || poiNameEn || entity.nameEn || entity.name || "",
      entity.btype || "",
      height,
      Math.sqrt(areaM2)
    );
    if (famous && !overrideTitle && !poiNameEn && !hasRealOsmName) {
      titleEn = famous.brandName;
      titleZh = famous.brandNameZh || famous.brandName;
    }

    const arch = famous
      ? { en: famous.sectorEn, zh: famous.sectorZh, ratePerSqm: famous.ratePerSqm }
      : this._classifyArchetype(entity, height, floors, areaM2, lat, lon, hVal);

    const baseSqmRate = arch.ratePerSqm * (0.85 + hVal * 0.35);
    const totalFloorArea = areaM2 * floors;
    const estValueUsd = Math.max(320000, totalFloorArea * baseSqmRate);
    const valEn = formatDollarEst(estValueUsd, false);
    const valZh = formatDollarEst(estValueUsd, true);

    const areaFmt = areaM2.toLocaleString("en-US");
    const metaEn = `${floors} ${floors === 1 ? "Floor" : "Floors"} · ${height}m · ${areaFmt} m² · ${arch.en} · ${valEn}`;
    const metaZh = `${floors}层 · ${height}米 · ${areaFmt} m² · ${arch.zh} · ${valZh}`;

    const ringPts = [];
    if (entity.flatOuter && entity.flatOuter.length >= 6) {
      const ox = entity.ox || 0;
      const oz = entity.oz || 0;
      for (let i = 0; i < entity.flatOuter.length; i += 2) {
        ringPts.push(entity.flatOuter[i] + ox, entity.flatOuter[i + 1] + oz);
      }
    } else {
      ringPts.push(
        entity.minX, entity.minZ,
        entity.maxX, entity.minZ,
        entity.maxX, entity.maxZ,
        entity.minX, entity.maxZ
      );
    }

    const spanRadius = Math.max(12, Math.hypot(entity.maxX - entity.minX, entity.maxZ - entity.minZ) * 0.5);
    const orbitRadius = Math.max(45, height * 1.65, spanRadius * 1.45);
    const orbitY = topY + Math.max(28, height * 0.55);
    const lookY = baseY + height * 0.58;

    return {
      isLandmark: false,
      id: entity.id || `${Math.round(cx)},${Math.round(cz)}`,
      lat,
      lon,
      floors,
      areaM2,
      archEn: arch.en,
      archZh: arch.zh,
      estValueUsd,
      titleEn,
      titleZh,
      metaEn,
      metaZh,
      cx,
      cz,
      baseY,
      topY,
      height,
      radius: orbitRadius,
      orbitY,
      lookY,
      ringPts,
    };
  }

  _classifyArchetype(entity, height, floors, areaM2, lat, lon, hVal) {
    const style = (entity.style || "").toLowerCase();
    const btype = (entity.btype || "").toLowerCase();
    const isSF = Math.abs(lat - 37.78) < 0.15 && Math.abs(lon - -122.42) < 0.15;
    const isSiliconValley = lat >= 37.25 && lat <= 37.60 && lon >= -122.30 && lon <= -121.85 && !isSF;
    const isLA = Math.abs(lat - 34.05) < 0.35 && Math.abs(lon - -118.25) < 0.35;

    if (style === "imperial") {
      return { en: "Imperial Courtyard Palace", zh: "皇家古建殿宇", ratePerSqm: 14500 };
    }
    if (style === "hutong") {
      return { en: "Historic Courtyard Residence", zh: "传统四合院民居", ratePerSqm: 12800 };
    }
    if (btype === "civic" || btype === "public" || btype === "government" || btype === "museum" || btype === "university") {
      return { en: "Civic Building", zh: "公共市政建筑", ratePerSqm: 8600 };
    }
    if (height >= 95 || floors >= 26) {
      return { en: "Glass Commercial Tower", zh: "超高层玻璃幕墙大厦", ratePerSqm: 11200 };
    }
    if (height >= 42 || floors >= 11 || style === "glass") {
      return hVal > 0.45
        ? { en: "Glass Commercial Tower", zh: "现代玻璃幕墙写字楼", ratePerSqm: 9400 }
        : { en: "High-Rise Residential Tower", zh: "高层公寓塔楼", ratePerSqm: 8800 };
    }
    if (isSiliconValley && areaM2 >= 1800 && floors <= 6) {
      return { en: "Tech Research Campus", zh: "科技研发园区楼宇", ratePerSqm: 9800 };
    }
    if (floors <= 3 && areaM2 <= 420) {
      if (isSF) {
        return { en: "Victorian Bay Residence", zh: "维多利亚凸窗住宅", ratePerSqm: 10500 };
      }
      if (isLA || isSiliconValley || (lat > 32 && lat < 44)) {
        return hVal > 0.5
          ? { en: "Mediterranean Villa", zh: "地中海风格别墅", ratePerSqm: 8400 }
          : { en: "Victorian Bay Residence", zh: "经典独立住宅", ratePerSqm: 7900 };
      }
      return { en: "Townhouse Residence", zh: "城市联排住宅", ratePerSqm: 6800 };
    }
    if (floors >= 4 && floors <= 10) {
      return hVal > 0.4
        ? { en: "Mid-Rise Apartment", zh: "中层精品公寓", ratePerSqm: 7400 }
        : { en: "Commercial Mixed-Use", zh: "商业综合办公楼", ratePerSqm: 7800 };
    }
    return { en: "Civic Building", zh: "城市综合建筑", ratePerSqm: 7200 };
  }

  selectProfile(profile) {
    if (!profile) return;
    const wasOrbiting = this.orbitActive;
    this.selected = profile;
    this.realData = synthesizeAssessorRecord(profile.lat, profile.lon, profile);
    this._updateHighlightRing(profile.kind === "landmark" ? null : profile.ringPts, profile.baseY);
    if (wasOrbiting) {
      this._initOrbitTrajectory();
    }
    this._renderCard();

    // Fetch live geolocated building photo & Wikidata architectural metadata asynchronously
    const reqId = ++this._fetchReqId;
    fetchRealBuildingData(profile.lat, profile.lon, profile.titleEn, profile).then((liveData) => {
      if (reqId !== this._fetchReqId || !this.selected) return;
      this.realData = liveData;
      this._renderCard();
    });
  }

  _renderCard() {
    if (!this.cardEl || !this.selected) return;
    const zh = getLang() === "zh";
    this.titleEl.textContent = zh ? this.selected.titleZh : this.selected.titleEn;
    this.metaEl.textContent = zh ? this.selected.metaZh : this.selected.metaEn;

    if (this.fsdBtnEl) {
      this.fsdBtnEl.textContent = zh ? "自动驾驶" : "FSD Here";
    }
    this.photoBtnEl.textContent = zh ? "实景与3D" : "Real Photo";
    this.photoBtnEl.classList.toggle("active", this.drawerOpen);

    this.orbitBtnEl.textContent = this.orbitActive
      ? zh
        ? "停止环绕"
        : "Stop Orbit"
      : zh
        ? "无人机环绕"
        : "Drone Orbit";

    const d = this.realData || synthesizeAssessorRecord(this.selected.lat, this.selected.lon, this.selected);
    const hasPhoto = Boolean(d.photoThumbUrl);

    if (this.thumbBtnEl && this.thumbImgEl) {
      if (hasPhoto) {
        this.thumbImgEl.src = d.photoThumbUrl;
        this.thumbBtnEl.classList.add("has-photo");
      } else {
        this.thumbImgEl.removeAttribute("src");
        this.thumbBtnEl.classList.remove("has-photo");
      }
    }

    // Progressive Disclosure Drawer contents
    if (this.drawerOpen) {
      if (hasPhoto) {
        this.heroImgEl.src = d.photoUrl || d.photoThumbUrl;
        this.heroImgEl.classList.add("loaded");
        this.heroEmptyEl.style.display = "none";
        this.sourceBadgeEl.textContent = d.photoSource || (zh ? "Wikimedia 实景地理库" : "Wikimedia Commons · Live Geo");
      } else {
        this.heroImgEl.removeAttribute("src");
        this.heroImgEl.classList.remove("loaded");
        this.heroEmptyEl.style.display = "flex";
        this.heroEmptyEl.textContent = zh
          ? "暂无公开街景照片 · 可一键生成 3D 建筑或上传房源照片/.GLB"
          : "No street photo in Commons within 360m · Project 3D or Upload Listing Photo / .GLB";
        this.sourceBadgeEl.textContent = zh ? "地籍评估与 3D 重建" : "Assessor Record · 3D Ready";
      }

      const customMeta = this.worldModel ? this.worldModel.getCustomReconstructionMeta(this.selected) : null;
      if (customMeta && this.swatchesEl) {
        this.swatchesEl.classList.add("visible");
        this.swatchesEl.innerHTML = `
          <span class="prop-insp-swatch" style="background:${customMeta.wallHex}" title="Wall"></span>
          <span class="prop-insp-swatch" style="background:${customMeta.trimHex}" title="Trim"></span>
          <span class="prop-insp-swatch" style="background:${customMeta.roofHex}" title="Roof"></span>
        `;
      } else if (this.swatchesEl) {
        this.swatchesEl.classList.remove("visible");
        this.swatchesEl.innerHTML = "";
      }

      if (this.specsEl) {
        const specs = [
          {
            label: zh ? "建造年份" : "Year Built",
            val: String(d.yearBuilt || "1998"),
          },
          {
            label: zh ? "建筑风格" : "Style",
            val: zh ? d.styleZh || d.styleEn : d.styleEn,
          },
          {
            label: zh ? "建筑面积" : "Floor Area",
            val: `${Number(d.livingAreaSqft || 2400).toLocaleString("en-US")} ft²`,
          },
          {
            label: zh ? "单价估值" : "Price / ft²",
            val: `$${Number(d.pricePerSqft || 680).toLocaleString("en-US")}/ft²`,
          },
          {
            label: zh ? "外立面材质" : "Material",
            val: zh ? d.materialZh || d.materialEn : d.materialEn,
          },
          {
            label: zh ? "宗地编号" : "Parcel APN",
            val: d.wikidataId ? `${d.apn} · ${d.wikidataId}` : d.apn,
          },
        ];
        this.specsEl.innerHTML = specs
          .map(
            (s) => `
            <div class="prop-insp-spec-cell">
              <div class="prop-insp-spec-label">${s.label}</div>
              <div class="prop-insp-spec-val" title="${s.val}">${s.val}</div>
            </div>
          `
          )
          .join("");
      }

      if (this.reconstructBtnEl) {
        this.reconstructBtnEl.textContent = customMeta
          ? zh
            ? "已投射至 3D 建筑 (重新生成)"
            : "3D Reconstructed (Re-apply)"
          : zh
            ? "投射实景照片至 3D 建筑"
            : "Project Photo to 3D Building";
      }
      if (this.uploadBtnEl) {
        this.uploadBtnEl.textContent = zh ? "上传照片 / .GLB" : "Upload Photo / .GLB";
      }
      if (this.resetBtnEl) {
        this.resetBtnEl.textContent = zh ? "还原" : "Reset";
        this.resetBtnEl.classList.toggle("visible", Boolean(customMeta));
      }
    }

    this.cardEl.classList.toggle("drawer-open", this.drawerOpen);
    this.cardEl.classList.toggle("orbiting", this.orbitActive);
    this.cardEl.classList.add("visible");
  }

  startOrbit() {
    if (!this.selected || !this.app || !this.app.camera) return;
    this.orbitActive = true;
    this._initOrbitTrajectory();
    this._renderCard();
  }

  _initOrbitTrajectory() {
    const cam = this.app.camera;
    const s = this.selected;
    this._startCamPos.copy(cam.position);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const distToCenter = Math.max(30, Math.hypot(cam.position.x - s.cx, cam.position.z - s.cz));
    this._startLookAt.copy(cam.position).addScaledVector(fwd, distToCenter);
    this._curLookAt.copy(this._startLookAt);

    this.orbitAngle = Math.atan2(cam.position.x - s.cx, cam.position.z - s.cz);
    this.orbitBlend = 0;
  }

  stopOrbit() {
    if (!this.orbitActive) return;
    this.orbitActive = false;
    if (this.app) {
      this.app._camArm = 0;
    }
    if (this.selected) {
      this._renderCard();
    } else if (this.cardEl) {
      this.cardEl.classList.remove("orbiting");
    }
  }

  dismiss() {
    if (this.orbitActive) {
      this.stopOrbit();
    }
    this.drawerOpen = false;
    this.selected = null;
    this.realData = null;
    if (this.highlightLine) {
      this.highlightLine.visible = false;
    }
    if (this.cardEl) {
      this.cardEl.classList.remove("visible", "orbiting", "drawer-open");
    }
  }

  /**
   * Per-frame update.
   * Zero overhead when idle: single boolean check (`if (!this.orbitActive) return;`) taking 0.000 ms and 0 allocations.
   */
  update(dt) {
    if (!this.orbitActive) return;
    const s = this.selected;
    const app = this.app;
    if (!s || !app || !app.camera) {
      this.orbitActive = false;
      return;
    }

    this.orbitAngle += this.orbitSpeed * dt;
    this.orbitBlend = Math.min(1.0, this.orbitBlend + dt * 1.85);
    const ease = 1.0 - Math.pow(1.0 - this.orbitBlend, 3);

    const orbitX = s.cx + Math.sin(this.orbitAngle) * s.radius;
    const orbitZ = s.cz + Math.cos(this.orbitAngle) * s.radius;
    const terrY = getBeijingTerrainElevation(orbitX, orbitZ);
    const orbitY = Math.max(s.orbitY, terrY + 26.0);

    const cam = app.camera;
    cam.position.set(
      THREE.MathUtils.lerp(this._startCamPos.x, orbitX, ease),
      THREE.MathUtils.lerp(this._startCamPos.y, orbitY, ease),
      THREE.MathUtils.lerp(this._startCamPos.z, orbitZ, ease)
    );

    const lx = THREE.MathUtils.lerp(this._startLookAt.x, s.cx, ease);
    const ly = THREE.MathUtils.lerp(this._startLookAt.y, s.lookY, ease);
    const lz = THREE.MathUtils.lerp(this._startLookAt.z, s.cz, ease);
    cam.lookAt(lx, ly, lz);

    app.camYaw = Math.atan2(lx - cam.position.x, lz - cam.position.z);
  }
}
