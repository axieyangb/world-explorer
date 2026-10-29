/**
 * Real-Estate World Model & Live Geolocated Photo-to-3D Parcel Reconstruction Pipeline.
 *
 * Bridges:
 *  1. Zero-key CORS-enabled Geosearch APIs (Wikimedia Commons Geosearch + Wikidata Entity Claims
 *     P18 image, P149 architectural style, P571 inception/year built, P84 architect, P1101 floors,
 *     P186 material) + RESO / ATTOM / Regrid-aligned deterministic parcel assessor attributes.
 *  2. Real-Time Photo-to-3D Parcel Reconstructor: analyzes any real-world building photograph or
 *     user-uploaded listing photo on an offscreen canvas to extract exterior wall albedo palette,
 *     trim/mullion tones, roof color, and a Sobel luminance normal/bump map, then constructs a
 *     custom multi-layered 3D architectural mesh (plinth, recessed window pilasters, cornice bands,
 *     and pitched/parapet roof) fitted onto the exact OSM polygon footprint in the live Three.js scene.
 *  3. World Labs Marble / Atlas .GLB Override Loader: self-contained GLB 2.0 binary parser with
 *     optional OpenCV-to-OpenGL coordinate conversion (`scale(1, -1, -1)`) that fits external
 *     3D meshes directly onto any parcel footprint.
 */

import * as THREE from "../../vendor/three.module.js";
import { getBeijingTerrainElevation } from "../environment.js";

const DATA_CACHE_STORAGE_KEY = "wx_re_building_data_v1";
const PARCEL_RECON_STORAGE_KEY = "wx_re_custom_parcels_v1";
const MAX_MEM_CACHE = 120;
const MAX_SAVED_PARCELS = 32;

const memDataCache = new Map();

// Curated Wikidata QID -> Architectural Style label lookup for common P149 values
const WIKIDATA_STYLE_LABELS = {
  Q46261: { en: "Gothic Revival", zh: "哥特复兴式" },
  Q170377: { en: "Beaux-Arts", zh: "布杂艺术风格" },
  Q173782: { en: "Art Deco", zh: "装饰艺术风格" },
  Q2463431: { en: "Modern Architecture", zh: "现代主义建筑" },
  Q185363: { en: "Neoclassical", zh: "新古典主义" },
  Q213119: { en: "Brutalist Architecture", zh: "粗野主义建筑" },
  Q236122: { en: "Postmodern Architecture", zh: "后现代主义建筑" },
  Q1323192: { en: "Victorian Architecture", zh: "维多利亚风格" },
  Q1142103: { en: "High-Tech Architecture", zh: "高技派现代建筑" },
  Q237500: { en: "Deconstructivism", zh: "解构主义建筑" },
  Q840829: { en: "International Style", zh: "国际主义玻璃幕墙" },
  Q1295040: { en: "Mediterranean Revival", zh: "地中海复兴风格" },
};

const WIKIDATA_MATERIAL_LABELS = {
  Q11469: { en: "Glass & Curtain Wall", zh: "玻璃幕墙与钢构" },
  Q22657: { en: "Reinforced Concrete", zh: "钢筋混凝土" },
  Q11427: { en: "Structural Steel", zh: "结构钢与玻璃" },
  Q40089: { en: "Red Brick & Masonry", zh: "红砖与砌体结构" },
  Q41177: { en: "Natural Granite", zh: "天然花岗岩石材" },
  Q40861: { en: "Carrara Marble", zh: "大理石石材" },
  Q287: { en: "Timber & Wood Frame", zh: "木结构框架" },
  Q23757: { en: "Limestone Facade", zh: "石灰岩立面" },
};

function coordCacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function deterministicSeed(lat, lon) {
  const s = Math.sin(lat * 127.1 + lon * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function stripHtmlTags(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function loadLocalJsonMap(key) {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveLocalJsonMap(key, obj) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (_) {
    // Ignore storage quota errors
  }
}

/**
 * Generates RESO / ATTOM / Regrid-aligned baseline property attributes for any (lat, lon) parcel,
 * enriched whenever live Wikidata or Wikimedia metadata arrives.
 */
export function synthesizeAssessorRecord(lat, lon, profile = {}) {
  const seed = deterministicSeed(lat, lon);
  const seed2 = deterministicSeed(lon, lat);
  const floors = Math.max(1, profile.floors || Math.round((profile.height || 14) / 3.6));
  const footprintSqm = Math.max(48, profile.areaM2 || 220);
  const lotSizeSqm = Math.round(footprintSqm * (1.28 + seed * 0.65));
  const livingAreaSqm = Math.round(footprintSqm * floors);
  const livingAreaSqft = Math.round(livingAreaSqm * 10.7639);

  // Realistic Year Built distribution by building height & region
  let baseYear = 1968;
  if ((profile.height || 14) > 85) {
    baseYear = 1988 + Math.floor(seed * 35);
  } else if (floors <= 3) {
    baseYear = 1924 + Math.floor(seed * 88);
  } else {
    baseYear = 1955 + Math.floor(seed * 66);
  }
  const yearBuilt = Math.min(2025, Math.max(1890, baseYear));

  // Assessor Parcel Number (APN) formatted like county tax records (Book-Page-Parcel)
  const book = String(100 + Math.floor(seed * 899)).padStart(3, "0");
  const page = String(10 + Math.floor(seed2 * 89)).padStart(2, "0");
  const lot = String(1 + Math.floor(((seed + seed2) % 1) * 98)).padStart(3, "0");
  const apn = `${book}-${page}-${lot}`;

  // Material & style defaults
  let materialEn = "Architectural Glass & Precast";
  let materialZh = "建筑玻璃与预制石材";
  if (floors <= 3) {
    materialEn = seed > 0.5 ? "Timber Frame & Stucco" : "Brick Masonry & Wood Trim";
    materialZh = seed > 0.5 ? "木结构框架与灰泥立面" : "砖石砌体与木质装饰";
  } else if ((profile.height || 14) >= 60) {
    materialEn = "Unitized Curtain Wall Glass";
    materialZh = "单元式Low-E玻璃幕墙";
  }

  let styleEn = profile.archEn || (floors <= 3 ? "Contemporary Residence" : "Modern Commercial");
  let styleZh = profile.archZh || (floors <= 3 ? "现代住宅建筑" : "现代商业建筑");

  const estValueUsd = profile.estValueUsd || Math.max(380000, livingAreaSqm * 8200 * (0.85 + seed * 0.35));
  const pricePerSqft = Math.max(220, Math.round(estValueUsd / Math.max(400, livingAreaSqft)));

  return {
    apn,
    yearBuilt,
    floors,
    footprintSqm,
    lotSizeSqm,
    livingAreaSqm,
    livingAreaSqft,
    pricePerSqft,
    estValueUsd,
    styleEn,
    styleZh,
    materialEn,
    materialZh,
    architectEn: "",
    architectZh: "",
    wikidataId: "",
    photoUrl: "",
    photoThumbUrl: "",
    photoTitle: "",
    photoAttribution: "",
    photoSource: "",
    descriptionEn: "",
  };
}

/**
 * Fetches live geolocated building photography & architectural facts from:
 *  1. Wikimedia Commons Geosearch API (`action=query&generator=geosearch&ggsnamespace=6`)
 *  2. Wikidata Geosearch + Entity Claims (`P18` image, `P149` architectural style, `P571` year built,
 *     `P84` architect, `P1101` floors, `P186` material)
 * Uses LRU in-memory + `localStorage` caching for instant repeat lookups.
 */
export async function fetchRealBuildingData(lat, lon, name = "", profile = {}) {
  const key = coordCacheKey(lat, lon);
  const baseline = synthesizeAssessorRecord(lat, lon, profile);

  if (memDataCache.has(key)) {
    return { ...baseline, ...memDataCache.get(key) };
  }

  const storedMap = loadLocalJsonMap(DATA_CACHE_STORAGE_KEY);
  if (storedMap[key] && storedMap[key].ts && Date.now() - storedMap[key].ts < 1000 * 60 * 60 * 24 * 7) {
    memDataCache.set(key, storedMap[key]);
    return { ...baseline, ...storedMap[key] };
  }

  const cleanName = (name || "")
    .replace(/^Parcel\s+[\d.]+[NS].*$/i, "")
    .replace(/^\d+\s+/, "")
    .trim();

  const [commonsRes, wikidataRes] = await Promise.allSettled([
    queryWikimediaCommonsGeo(lat, lon, cleanName, profile.isLandmark),
    queryWikidataGeo(lat, lon, cleanName),
  ]);

  const commons = commonsRes.status === "fulfilled" ? commonsRes.value : null;
  const wikidata = wikidataRes.status === "fulfilled" ? wikidataRes.value : null;

  const merged = {
    ...baseline,
    ts: Date.now(),
  };

  if (wikidata) {
    if (wikidata.yearBuilt) merged.yearBuilt = wikidata.yearBuilt;
    if (wikidata.floors) merged.floors = wikidata.floors;
    if (wikidata.styleEn) {
      merged.styleEn = wikidata.styleEn;
      merged.styleZh = wikidata.styleZh || wikidata.styleEn;
    }
    if (wikidata.materialEn) {
      merged.materialEn = wikidata.materialEn;
      merged.materialZh = wikidata.materialZh || wikidata.materialEn;
    }
    if (wikidata.architectEn) {
      merged.architectEn = wikidata.architectEn;
      merged.architectZh = wikidata.architectZh || wikidata.architectEn;
    }
    if (wikidata.wikidataId) merged.wikidataId = wikidata.wikidataId;
    if (wikidata.descriptionEn) merged.descriptionEn = wikidata.descriptionEn;
    if (wikidata.photoThumbUrl) {
      merged.photoUrl = wikidata.photoUrl || wikidata.photoThumbUrl;
      merged.photoThumbUrl = wikidata.photoThumbUrl;
      merged.photoTitle = wikidata.label || name || "Wikidata Building Photo";
      merged.photoSource = "Wikidata P18 · Live Geo";
    }
  }

  if (commons && commons.photoThumbUrl) {
    merged.photoUrl = commons.photoUrl || commons.photoThumbUrl;
    merged.photoThumbUrl = commons.photoThumbUrl;
    merged.photoTitle = commons.photoTitle || merged.photoTitle || name;
    merged.photoAttribution = commons.photoAttribution || "";
    merged.photoSource = commons.photoSource || "Wikimedia Commons · Live Geo";
    if (!merged.descriptionEn && commons.descriptionEn) {
      merged.descriptionEn = commons.descriptionEn;
    }
    if (!wikidata?.yearBuilt && commons.inferredYear) {
      merged.yearBuilt = commons.inferredYear;
    }
  }

  if (memDataCache.size >= MAX_MEM_CACHE) {
    const oldestKey = memDataCache.keys().next().value;
    memDataCache.delete(oldestKey);
  }
  memDataCache.set(key, merged);

  const keys = Object.keys(storedMap);
  if (keys.length > 80) {
    delete storedMap[keys[0]];
  }
  storedMap[key] = merged;
  saveLocalJsonMap(DATA_CACHE_STORAGE_KEY, storedMap);

  return merged;
}

async function queryWikimediaCommonsGeo(lat, lon, cleanName = "", isLandmark = false) {
  const radii = isLandmark ? [250, 650] : [120, 360];
  for (const radius of radii) {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch` +
      `&ggsprimary=all&ggsnamespace=6&ggsradius=${radius}` +
      `&ggscoord=${lat.toFixed(6)}|${lon.toFixed(6)}&ggslimit=6` +
      `&prop=imageinfo|pageterms&iiprop=url|extmetadata&iiurlwidth=480&format=json&origin=*`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const best = pickBestCommonsPage(pages, cleanName);
      if (best) return best;
    } catch (_) {
      // Network or CORS offline fallback
    }
  }

  // Fallback for named landmarks/campuses when exact coordinate geosearch has no tagged file within radius
  if (cleanName && cleanName.length >= 4 && isLandmark) {
    try {
      const searchUrl =
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${cleanName} building OR exterior`)}` +
        `&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480&format=json&origin=*`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        const best = pickBestCommonsPage(pages, cleanName);
        if (best) {
          best.photoSource = "Wikimedia Commons · Named Match";
          return best;
        }
      }
    } catch (_) {
      // Ignore fallback error
    }
  }

  return null;
}

function pickBestCommonsPage(pages, cleanName = "") {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  const qLower = (cleanName || "").toLowerCase();

  let bestPage = null;
  let bestScore = -999;

  for (const p of pages) {
    const ii = p?.imageinfo?.[0];
    if (!ii || (!ii.thumburl && !ii.url)) continue;
    const thumb = ii.thumburl || ii.url;
    const title = (p.title || "").replace(/^File:/i, "").replace(/\.[^.]+$/, "");
    const lowerTitle = title.toLowerCase();

    // Skip icons, maps, diagrams, plaques, logos, or interior-only portraits
    if (/\.(svg|pdf|ogg|webm|tif)$/i.test(ii.url || "")) continue;
    if (/(logo|icon|map|plaque|diagram|signature|portrait|coat_of_arms|flag)/i.test(lowerTitle)) continue;

    let score = 0;
    if (qLower && lowerTitle.includes(qLower)) score += 35;
    if (/(building|exterior|facade|tower|hall|center|campus|street|house|aerial|view)/i.test(lowerTitle)) {
      score += 15;
    }
    const ext = ii.extmetadata || {};
    const desc = stripHtmlTags(ext.ImageDescription?.value || ext.ObjectName?.value || "");
    if (qLower && desc.toLowerCase().includes(qLower)) score += 20;

    if (score > bestScore) {
      bestScore = score;
      const artist = stripHtmlTags(ext.Artist?.value || "");
      const yearMatch = `${title} ${desc}`.match(/\b(18\d{2}|19\d{2}|20[0-2]\d)\b/);
      bestPage = {
        photoThumbUrl: thumb,
        photoUrl: ii.thumburl || ii.url,
        photoTitle: stripHtmlTags(ext.ObjectName?.value || title).slice(0, 72),
        photoAttribution: artist ? `Photo: ${artist.slice(0, 40)}` : "Wikimedia Commons",
        photoSource: "Wikimedia Commons · Live Geo",
        descriptionEn: desc.slice(0, 140),
        inferredYear: yearMatch ? Number(yearMatch[1]) : null,
      };
    }
  }

  return bestPage;
}

async function queryWikidataGeo(lat, lon, cleanName = "") {
  try {
    const geoUrl =
      `https://www.wikidata.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat.toFixed(6)}|${lon.toFixed(6)}&gsradius=260&gslimit=5&format=json&origin=*`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    const list = geoData?.query?.geosearch || [];
    if (list.length === 0) return null;

    const ids = list.map((item) => item.title).filter((id) => /^Q\d+$/.test(id));
    if (ids.length === 0) return null;

    const entUrl =
      `https://www.wikidata.org/w/api.php?action=wbgetentities` +
      `&ids=${ids.slice(0, 4).join("|")}&props=labels|descriptions|claims&languages=en|zh&format=json&origin=*`;
    const entRes = await fetch(entUrl);
    if (!entRes.ok) return null;
    const entData = await entRes.json();
    const entities = entData?.entities ? Object.values(entData.entities) : [];
    if (entities.length === 0) return null;

    const qLower = (cleanName || "").toLowerCase();
    let chosen = entities[0];
    for (const ent of entities) {
      const lblEn = (ent.labels?.en?.value || "").toLowerCase();
      if (qLower && lblEn && (lblEn.includes(qLower) || qLower.includes(lblEn))) {
        chosen = ent;
        break;
      }
    }

    const claims = chosen.claims || {};
    const out = {
      wikidataId: chosen.id || "",
      label: chosen.labels?.en?.value || chosen.labels?.zh?.value || "",
      descriptionEn: chosen.descriptions?.en?.value || "",
      yearBuilt: null,
      floors: null,
      styleEn: "",
      styleZh: "",
      materialEn: "",
      materialZh: "",
      architectEn: "",
      photoThumbUrl: "",
      photoUrl: "",
    };

    // P571: inception / year built
    const p571 = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time;
    if (typeof p571 === "string") {
      const ym = p571.match(/([12]\d{3})/);
      if (ym) out.yearBuilt = Number(ym[1]);
    }

    // P1101: floors above ground
    const p1101 = claims.P1101?.[0]?.mainsnak?.datavalue?.value?.amount;
    if (p1101) {
      const fl = parseInt(String(p1101).replace(/^\+/, ""), 10);
      if (Number.isFinite(fl) && fl > 0 && fl < 220) out.floors = fl;
    }

    // P149: architectural style
    const p149Id = claims.P149?.[0]?.mainsnak?.datavalue?.value?.id;
    if (p149Id && WIKIDATA_STYLE_LABELS[p149Id]) {
      out.styleEn = WIKIDATA_STYLE_LABELS[p149Id].en;
      out.styleZh = WIKIDATA_STYLE_LABELS[p149Id].zh;
    }

    // P186: material used
    const p186Id = claims.P186?.[0]?.mainsnak?.datavalue?.value?.id;
    if (p186Id && WIKIDATA_MATERIAL_LABELS[p186Id]) {
      out.materialEn = WIKIDATA_MATERIAL_LABELS[p186Id].en;
      out.materialZh = WIKIDATA_MATERIAL_LABELS[p186Id].zh;
    }

    // P18: Commons image filename -> Special:FilePath CORS redirect with width=480
    const p18File = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof p18File === "string" && p18File.length > 0) {
      const encoded = encodeURIComponent(p18File.replace(/ /g, "_"));
      out.photoThumbUrl = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encoded}&width=480`;
      out.photoUrl = out.photoThumbUrl;
    }

    return out;
  } catch (_) {
    return null;
  }
}

/**
 * Analyzes an exterior building photograph on an offscreen 2D `<canvas>` to extract:
 *  - Roof color (`roofColor`, `roofHex`) from upper facade/roofline band
 *  - Primary wall albedo (`wallColor`, `wallHex`) from mid-facade band (excluding dark window pixels & sky)
 *  - Mullion / window recess / trim color (`trimColor`, `trimHex`)
 *  - Ground plinth color (`plinthColor`, `plinthHex`)
 *  - Window grid frequency estimate (`glazingRatio`)
 *  - High-detail architectural facade `THREE.CanvasTexture` + Sobel luminance normal map `THREE.CanvasTexture`
 */
export async function analyzeBuildingPhotoAndBuildTextures(imgSource, floors = 4) {
  const img = await loadImageCrossOrigin(imgSource);
  const W = 256;
  const H = 256;

  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = W;
  analysisCanvas.height = H;
  const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });

  if (img) {
    ctx.drawImage(img, 0, 0, W, H);
  } else {
    // Fallback architectural gradient if image blocked by strict third-party CORS
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#5c6e82");
    grad.addColorStop(0.5, "#d8cfc2");
    grad.addColorStop(1, "#8d8275");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, W, H);
  } catch (_) {
    // Tainted canvas fallback
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#d9d0c5";
    ctx.fillRect(0, 0, W, H);
    imgData = ctx.getImageData(0, 0, W, H);
  }

  const data = imgData.data;

  // Sample 3 vertical architectural bands: roof (8%-24%), facade wall (24%-78%), plinth (78%-95%)
  const roofSamples = [];
  const wallLightSamples = [];
  const wallDarkSamples = [];
  const plinthSamples = [];

  for (let y = Math.floor(H * 0.08); y < Math.floor(H * 0.95); y += 2) {
    const ny = y / H;
    for (let x = Math.floor(W * 0.12); x < Math.floor(W * 0.88); x += 2) {
      const idx = (y * W + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Filter out bright cyan/blue sky pixels in upper band
      const isSky = ny < 0.42 && b > r * 1.22 && b > 135 && lum > 130;
      if (isSky) continue;

      if (ny < 0.24) {
        roofSamples.push([r, g, b, lum]);
      } else if (ny < 0.78) {
        if (lum >= 88) {
          wallLightSamples.push([r, g, b, lum]);
        } else {
          wallDarkSamples.push([r, g, b, lum]);
        }
      } else {
        plinthSamples.push([r, g, b, lum]);
      }
    }
  }

  const avgRgb = (arr, fallback) => {
    if (!arr || arr.length === 0) return fallback;
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < arr.length; i++) {
      sr += arr[i][0];
      sg += arr[i][1];
      sb += arr[i][2];
    }
    const n = arr.length;
    return [sr / n, sg / n, sb / n];
  };

  const wallRgb = avgRgb(wallLightSamples, [214, 205, 192]);
  const trimRgb = avgRgb(wallDarkSamples, [54, 66, 82]);
  const roofRgb = avgRgb(roofSamples, [96, 84, 76]);
  const plinthRgb = avgRgb(plinthSamples, [118, 114, 108]);

  const totalWallPixels = Math.max(1, wallLightSamples.length + wallDarkSamples.length);
  const glazingRatio = Math.min(0.78, Math.max(0.18, wallDarkSamples.length / totalWallPixels));

  // Build crisp tileable architectural facade texture that fuses the real photo with structured window bays
  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const aCtx = albedoCanvas.getContext("2d");

  // Base wall color fill
  aCtx.fillStyle = rgbToHex(wallRgb[0], wallRgb[1], wallRgb[2]);
  aCtx.fillRect(0, 0, W, H);

  // Project real photo onto the facade with subtle architectural leveling
  if (img) {
    aCtx.save();
    aCtx.globalAlpha = 0.78;
    const sx = Math.floor(img.width * 0.12);
    const sy = Math.floor(img.height * 0.14);
    const sw = Math.max(1, Math.floor(img.width * 0.76));
    const sh = Math.max(1, Math.floor(img.height * 0.74));
    aCtx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    aCtx.restore();
  }

  // Overlay crisp architectural floor spandrels, window mullions, and cornice shadow lines
  const numFloors = Math.max(2, Math.min(16, floors));
  const floorPx = H / numFloors;
  const cols = 6;
  const colPx = W / cols;

  for (let f = 0; f < numFloors; f++) {
    const fy = f * floorPx;
    aCtx.fillStyle = `rgba(${Math.round(trimRgb[0] * 0.7)}, ${Math.round(trimRgb[1] * 0.7)}, ${Math.round(trimRgb[2] * 0.75)}, 0.42)`;
    aCtx.fillRect(0, fy, W, Math.max(2, floorPx * 0.12));

    const winTop = fy + floorPx * 0.2;
    const winH = floorPx * 0.62;
    for (let c = 0; c < cols; c++) {
      const wx = c * colPx + colPx * 0.16;
      const winW = colPx * 0.68;
      aCtx.fillStyle = `rgba(${Math.round(trimRgb[0] * 0.55)}, ${Math.round(trimRgb[1] * 0.68)}, ${Math.round(trimRgb[2] * 0.85)}, 0.34)`;
      aCtx.fillRect(wx, winTop, winW, winH);
      aCtx.strokeStyle = `rgba(${Math.round(wallRgb[0])}, ${Math.round(wallRgb[1])}, ${Math.round(wallRgb[2])}, 0.45)`;
      aCtx.lineWidth = 1.2;
      aCtx.strokeRect(wx, winTop, winW, winH);
    }
  }

  // Compute Sobel luminance normal map (`normalCanvas`) from the composite facade for realistic 3D relief lighting
  const compData = aCtx.getImageData(0, 0, W, H).data;
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = W;
  normalCanvas.height = H;
  const nCtx = normalCanvas.getContext("2d");
  const normImg = nCtx.createImageData(W, H);
  const nData = normImg.data;

  const lumAt = (x, y) => {
    const cx = (x + W) % W;
    const cy = Math.max(0, Math.min(H - 1, y));
    const i = (cy * W + cx) * 4;
    return (0.299 * compData[i] + 0.587 * compData[i + 1] + 0.114 * compData[i + 2]) / 255;
  };

  const strength = 2.6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tl = lumAt(x - 1, y - 1);
      const t = lumAt(x, y - 1);
      const tr = lumAt(x + 1, y - 1);
      const l = lumAt(x - 1, y);
      const r = lumAt(x + 1, y);
      const bl = lumAt(x - 1, y + 1);
      const b = lumAt(x, y + 1);
      const br = lumAt(x + 1, y + 1);

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * W + x) * 4;
      nData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      nData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nData[idx + 3] = 255;
    }
  }
  nCtx.putImageData(normImg, 0, 0);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.wrapS = THREE.RepeatWrapping;
  albedoTex.wrapT = THREE.ClampToEdgeWrapping;
  if (albedoTex.colorSpace !== undefined && THREE.SRGBColorSpace) {
    albedoTex.colorSpace = THREE.SRGBColorSpace;
  }
  albedoTex.needsUpdate = true;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.ClampToEdgeWrapping;
  normalTex.needsUpdate = true;

  return {
    wallHex: rgbToHex(wallRgb[0], wallRgb[1], wallRgb[2]),
    trimHex: rgbToHex(trimRgb[0], trimRgb[1], trimRgb[2]),
    roofHex: rgbToHex(roofRgb[0], roofRgb[1], roofRgb[2]),
    plinthHex: rgbToHex(plinthRgb[0], plinthRgb[1], plinthRgb[2]),
    wallColor: new THREE.Color(rgbToHex(wallRgb[0], wallRgb[1], wallRgb[2])),
    trimColor: new THREE.Color(rgbToHex(trimRgb[0], trimRgb[1], trimRgb[2])),
    roofColor: new THREE.Color(rgbToHex(roofRgb[0], roofRgb[1], roofRgb[2])),
    plinthColor: new THREE.Color(rgbToHex(plinthRgb[0], plinthRgb[1], plinthRgb[2])),
    glazingRatio,
    albedoTex,
    normalTex,
  };
}

function loadImageCrossOrigin(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    const timer = setTimeout(() => resolve(null), 6500);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function signedRingArea2(ring) {
  let area2 = 0;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    area2 += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return area2;
}

function normalizeFootprintRing(ringPts, cx, cz) {
  const pts = [];
  if (Array.isArray(ringPts) && ringPts.length >= 6) {
    for (let i = 0; i < ringPts.length; i += 2) {
      const x = ringPts[i] - cx;
      const z = ringPts[i + 1] - cz;
      if (pts.length >= 2) {
        const dx = x - pts[pts.length - 2];
        const dz = z - pts[pts.length - 1];
        if (Math.hypot(dx, dz) < 0.25) continue;
      }
      pts.push(x, z);
    }
  }
  if (pts.length >= 4) {
    const dx = pts[0] - pts[pts.length - 2];
    const dz = pts[1] - pts[pts.length - 1];
    if (Math.hypot(dx, dz) < 0.25) {
      pts.pop();
      pts.pop();
    }
  }
  if (pts.length < 6) {
    const hw = 12;
    const hd = 12;
    return [-hw, -hd, -hw, hd, hw, hd, hw, -hd];
  }
  // Ensure consistent counter-clockwise winding around +Y (signedRingArea2 <= 0)
  if (signedRingArea2(pts) > 0) {
    const rev = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) {
      rev.push(pts[i], pts[i + 1]);
    }
    return rev;
  }
  return pts;
}

function buildReconstructedParcelGroup(targetProfile, analysis) {
  const cx = targetProfile.cx;
  const cz = targetProfile.cz;
  const baseY = targetProfile.baseY;
  const height = Math.max(5, targetProfile.height || targetProfile.topY - targetProfile.baseY || 14);
  const floors = Math.max(1, targetProfile.floors || Math.round(height / 3.6));
  const localRing = normalizeFootprintRing(targetProfile.ringPts, cx, cz);

  const group = new THREE.Group();
  group.name = `reconstructed_parcel:${targetProfile.id}`;
  group.position.set(cx, baseY, cz);

  const expandedRing = offsetPolygonRingOutward(localRing, 0.08);
  const plinthRing = offsetPolygonRingOutward(localRing, 0.16);
  const corniceRing = offsetPolygonRingOutward(localRing, 0.24);

  const plinthH = Math.min(4.0, Math.max(1.5, height * 0.12));
  const mainWallBottomY = plinthH;
  const mainWallTopY = height;

  // 1. Solid Double-Sided Textured & Normal-Mapped Main Facade Wall Perimeter (never backface-culled)
  const wallGeom = buildExtrudedPerimeterGeometry(expandedRing, mainWallBottomY, mainWallTopY, 18.0);
  const wallMat = new THREE.MeshStandardMaterial({
    map: analysis.albedoTex,
    normalMap: analysis.normalTex,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: Math.max(0.28, 0.68 - analysis.glazingRatio * 0.45),
    metalness: Math.min(0.65, 0.12 + analysis.glazingRatio * 0.55),
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 2. Ground-Floor Granite / Masonry Plinth Base + Cornice Ledges + Corner Pilasters
  const trimMat = new THREE.MeshStandardMaterial({
    color: analysis.plinthColor,
    roughness: 0.72,
    metalness: 0.15,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  const plinthGeom = buildExtrudedPerimeterGeometry(plinthRing, -1.2, plinthH, 12.0);
  const plinthMesh = new THREE.Mesh(plinthGeom, trimMat);
  plinthMesh.castShadow = true;
  plinthMesh.receiveShadow = true;
  group.add(plinthMesh);

  const corniceHeights = [plinthH, height - 0.3];
  if (floors >= 5) {
    corniceHeights.push(plinthH + (height - plinthH) * 0.5);
  }
  for (const cy of corniceHeights) {
    const bandGeom = buildExtrudedPerimeterGeometry(corniceRing, cy - 0.18, cy + 0.22, 10.0);
    const bandMesh = new THREE.Mesh(bandGeom, trimMat);
    bandMesh.castShadow = true;
    group.add(bandMesh);
  }

  const n = expandedRing.length;
  const pilasterH = height - plinthH;
  const pilasterGeom = new THREE.BoxGeometry(0.36, pilasterH, 0.36);
  for (let i = 0; i < n; i += 2) {
    const px = expandedRing[i];
    const pz = expandedRing[i + 1];
    const pilaster = new THREE.Mesh(pilasterGeom, trimMat);
    pilaster.position.set(px, plinthH + pilasterH * 0.5, pz);
    pilaster.castShadow = true;
    group.add(pilaster);
  }

  // 3. Solid Opaque Roof Cap + Architectural Roof Structure
  const roofMat = new THREE.MeshStandardMaterial({
    color: analysis.roofColor,
    roughness: 0.62,
    metalness: 0.18,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });

  if (floors <= 4 && height <= 20) {
    const pitchH = Math.min(4.8, Math.max(2.0, Math.sqrt(targetProfile.areaM2 || 160) * 0.2));
    const pitchedGeom = buildPitchedRoofGeometry(corniceRing, height, height + pitchH);
    const pitchedMesh = new THREE.Mesh(pitchedGeom, roofMat);
    pitchedMesh.castShadow = true;
    pitchedMesh.receiveShadow = true;
    group.add(pitchedMesh);
  } else {
    const capGeom = buildPitchedRoofGeometry(corniceRing, height, height + 0.35);
    const capMesh = new THREE.Mesh(capGeom, roofMat);
    capMesh.receiveShadow = true;
    group.add(capMesh);

    const setbackRing = scalePolygonRing(localRing, 0.56);
    const pentH = Math.min(5.2, Math.max(2.2, height * 0.08));
    const pentWallGeom = buildExtrudedPerimeterGeometry(setbackRing, height, height + pentH, 10.0);
    const pentMesh = new THREE.Mesh(pentWallGeom, wallMat);
    pentMesh.castShadow = true;
    group.add(pentMesh);

    const pentCapGeom = buildPitchedRoofGeometry(setbackRing, height + pentH, height + pentH + 0.35);
    const pentCapMesh = new THREE.Mesh(pentCapGeom, roofMat);
    pentCapMesh.castShadow = true;
    group.add(pentCapMesh);
  }

  return group;
}

function offsetPolygonRingOutward(ring, offsetM) {
  const n = ring.length;
  if (n < 6) return ring.slice();

  const area2 = signedRingArea2(ring);
  const outSign = area2 <= 0 ? 1 : -1;

  const out = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const prev = (i - 2 + n) % n;
    const next = (i + 2) % n;

    const dx1 = ring[i] - ring[prev];
    const dz1 = ring[i + 1] - ring[prev + 1];
    const l1 = Math.max(1e-4, Math.hypot(dx1, dz1));
    const nx1 = (-dz1 / l1) * outSign;
    const nz1 = (dx1 / l1) * outSign;

    const dx2 = ring[next] - ring[i];
    const dz2 = ring[next + 1] - ring[i + 1];
    const l2 = Math.max(1e-4, Math.hypot(dx2, dz2));
    const nx2 = (-dz2 / l2) * outSign;
    const nz2 = (dx2 / l2) * outSign;

    let bx = nx1 + nx2;
    let bz = nz1 + nz2;
    const bl = Math.hypot(bx, bz);
    if (bl > 1e-4) {
      bx /= bl;
      bz /= bl;
    } else {
      bx = nx1;
      bz = nz1;
    }

    const dot = Math.max(0.45, bx * nx1 + bz * nz1);
    const miter = Math.min(1.45, 1.0 / dot) * offsetM;

    out[i] = ring[i] + bx * miter;
    out[i + 1] = ring[i + 1] + bz * miter;
  }
  return out;
}

function scalePolygonRing(ring, factor) {
  const out = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    out[i] = ring[i] * factor;
  }
  return out;
}

function buildExtrudedPerimeterGeometry(ring, bottomY, topY, tileWidthM = 16.0) {
  const n = ring.length;
  const positions = [];
  const normals = [];
  const uvs = [];
  const area2 = signedRingArea2(ring);
  const outSign = area2 <= 0 ? 1 : -1;

  let accumU = 0;
  for (let i = 0; i < n; i += 2) {
    const next = (i + 2) % n;
    const x0 = ring[i];
    const z0 = ring[i + 1];
    const x1 = ring[next];
    const z1 = ring[next + 1];

    const dx = x1 - x0;
    const dz = z1 - z0;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.05) continue;

    let nx = (-dz / segLen) * outSign;
    let nz = (dx / segLen) * outSign;

    const u0 = accumU / tileWidthM;
    const u1 = (accumU + segLen) / tileWidthM;
    accumU += segLen;

    const crossDot = -dz * nx + dx * nz;
    if (crossDot >= 0) {
      positions.push(
        x0, bottomY, z0,
        x1, bottomY, z1,
        x1, topY, z1,
        x0, bottomY, z0,
        x1, topY, z1,
        x0, topY, z0
      );
      uvs.push(
        u0, 0,
        u1, 0,
        u1, 1,
        u0, 0,
        u1, 1,
        u0, 1
      );
    } else {
      positions.push(
        x1, bottomY, z1,
        x0, bottomY, z0,
        x0, topY, z0,
        x1, bottomY, z1,
        x0, topY, z0,
        x1, topY, z1
      );
      uvs.push(
        u1, 0,
        u0, 0,
        u0, 1,
        u1, 0,
        u0, 1,
        u1, 1
      );
    }
    for (let k = 0; k < 6; k++) {
      normals.push(nx, 0, nz);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeBoundingSphere();
  return geom;
}

function buildPitchedRoofGeometry(ring, eaveY, peakY) {
  const n = ring.length;
  const positions = [];
  const uvs = [];
  const area2 = signedRingArea2(ring);

  for (let i = 0; i < n; i += 2) {
    const next = (i + 2) % n;
    const x0 = ring[i];
    const z0 = ring[i + 1];
    const x1 = ring[next];
    const z1 = ring[next + 1];

    if (area2 <= 0) {
      positions.push(
        x0, eaveY, z0,
        x1, eaveY, z1,
        0, peakY, 0
      );
      uvs.push(0, 0, 1, 0, 0.5, 1);
    } else {
      positions.push(
        x1, eaveY, z1,
        x0, eaveY, z0,
        0, peakY, 0
      );
      uvs.push(1, 0, 0, 0, 0.5, 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Self-contained Binary GLTF 2.0 (`.glb`) / `.gltf` parser that converts a World Labs Marble / Atlas
 * or custom 3D `.glb` ArrayBuffer into a Three.js `THREE.Group` without external loader dependencies.
 * Automatically handles World Labs OpenCV-to-OpenGL coordinate conversion (`scale(1, -1, -1)`)
 * when detected or requested, and fits the model onto the target parcel footprint `(cx, baseY, cz)`.
 */
export async function parseGlbBufferToGroup(arrayBuffer, options = {}) {
  const dv = new DataView(arrayBuffer);
  const magic = dv.getUint32(0, true);
  let json = null;
  let binBuffer = null;

  if (magic === 0x46546c67) {
    const totalLen = dv.getUint32(8, true);
    let offset = 12;
    while (offset + 8 <= totalLen) {
      const chunkLen = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x4e4f534a) {
        const jsonBytes = new Uint8Array(arrayBuffer, offset, chunkLen);
        const text = new TextDecoder("utf-8").decode(jsonBytes);
        json = JSON.parse(text);
      } else if (chunkType === 0x004e4942) {
        binBuffer = arrayBuffer.slice(offset, offset + chunkLen);
      }
      offset += chunkLen;
    }
  } else {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
    json = JSON.parse(text);
  }

  if (!json || !Array.isArray(json.meshes)) {
    throw new Error("Invalid GLB/GLTF structure: no meshes found");
  }

  const group = new THREE.Group();
  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];
  const materials = json.materials || [];

  const getAccessorArray = (accIdx) => {
    const acc = accessors[accIdx];
    if (!acc || !binBuffer) return null;
    const bv = bufferViews[acc.bufferView];
    if (!bv) return null;
    const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const numComps =
      acc.type === "VEC4" ? 4 : acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : 1;
    const length = acc.count * numComps;

    switch (acc.componentType) {
      case 5126:
        return new Float32Array(binBuffer, byteOffset, length);
      case 5123:
        return new Uint16Array(binBuffer, byteOffset, length);
      case 5125:
        return new Uint32Array(binBuffer, byteOffset, length);
      case 5121:
        return new Uint8Array(binBuffer, byteOffset, length);
      default:
        return null;
    }
  };

  for (const meshDef of json.meshes) {
    for (const prim of meshDef.primitives || []) {
      const attrs = prim.attributes || {};
      if (attrs.POSITION === undefined) continue;
      const posArr = getAccessorArray(attrs.POSITION);
      if (!posArr) continue;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));

      if (attrs.NORMAL !== undefined) {
        const normArr = getAccessorArray(attrs.NORMAL);
        if (normArr) geom.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normArr), 3));
      }
      if (attrs.TEXCOORD_0 !== undefined) {
        const uvArr = getAccessorArray(attrs.TEXCOORD_0);
        if (uvArr) geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvArr), 2));
      }
      if (attrs.COLOR_0 !== undefined) {
        const colArr = getAccessorArray(attrs.COLOR_0);
        const acc = accessors[attrs.COLOR_0];
        if (colArr && acc) {
          const itemSize = acc.type === "VEC4" ? 4 : 3;
          geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colArr), itemSize));
        }
      }
      if (prim.indices !== undefined) {
        const idxArr = getAccessorArray(prim.indices);
        if (idxArr) geom.setIndex(new THREE.BufferAttribute(idxArr, 1));
      }
      if (!geom.attributes.normal) {
        geom.computeVertexNormals();
      }
      geom.computeBoundingBox();

      let baseColor = new THREE.Color(0xd8d2c7);
      let roughness = 0.55;
      let metalness = 0.15;
      if (prim.material !== undefined && materials[prim.material]) {
        const pbr = materials[prim.material].pbrMetallicRoughness;
        if (pbr?.baseColorFactor) {
          baseColor.setRGB(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
        }
        if (typeof pbr?.roughnessFactor === "number") roughness = pbr.roughnessFactor;
        if (typeof pbr?.metallicFactor === "number") metalness = pbr.metallicFactor;
      }

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness,
        metalness,
        vertexColors: Boolean(geom.attributes.color),
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Check if exported from World Labs Marble / Atlas (OpenCV coordinate convention: +Y down, +Z forward)
  const generatorStr = String(json.asset?.generator || json.asset?.copyright || "").toLowerCase();
  const isOpenCv = options.openCvCoords || generatorStr.includes("world labs") || generatorStr.includes("marble");
  if (isOpenCv) {
    group.scale.set(1, -1, -1);
    group.updateMatrixWorld(true);
  }

  return group;
}

/**
 * Manager attached to `app.realEstateWorldModel` (or created lazily by `PropertyInspector`)
 * that stores active 3D reconstructed parcels in the scene and persists them in `localStorage`.
 */
export class RealEstateWorldModel {
  constructor(app) {
    this.app = app;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "RealEstateReconstructedParcels";
    if (this.app && this.app.scene) {
      this.app.scene.add(this.rootGroup);
    }
    this.activeMeshes = new Map(); // parcelKey -> { group, meta }
    this.restoreSavedParcelsForOrigin();
  }

  getParcelKey(profile) {
    if (!profile) return "";
    const lat = Number(profile.lat || 0).toFixed(4);
    const lon = Number(profile.lon || 0).toFixed(4);
    return `${profile.id || "bldg"}_${lat}_${lon}`;
  }

  hasCustomReconstruction(profile) {
    return this.activeMeshes.has(this.getParcelKey(profile));
  }

  getCustomReconstructionMeta(profile) {
    return this.activeMeshes.get(this.getParcelKey(profile))?.meta || null;
  }

  _findSceneLandmarkEntry(targetProfile) {
    const items = this.app?.landmarks?.items;
    if (!Array.isArray(items) || !targetProfile) return null;
    if (targetProfile.id) {
      const byId = items.find((it) => it.L && it.L.id === targetProfile.id);
      if (byId) return byId;
    }
    if (Number.isFinite(targetProfile.cx) && Number.isFinite(targetProfile.cz)) {
      let best = null;
      let bestD = 160;
      for (const it of items) {
        const d = Math.hypot(it.x - targetProfile.cx, it.z - targetProfile.cz);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
      return best;
    }
    return null;
  }

  _applyLandmarkPhotoMaterialTint(lmItem, analysis) {
    if (!lmItem || !lmItem.group) return;
    const tint = new THREE.Color(0xffffff).lerp(analysis.wallColor, 0.42);
    const rough = Math.max(0.26, 0.66 - analysis.glazingRatio * 0.4);
    const metal = Math.min(0.62, 0.1 + analysis.glazingRatio * 0.48);

    lmItem.group.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (!obj.userData.__origLmMat) {
        obj.userData.__origLmMat = obj.material;
        obj.userData.__origLmColorHex = obj.material.color ? obj.material.color.getHex() : 0xffffff;
        obj.userData.__origLmRoughness = obj.material.roughness;
        obj.userData.__origLmMetalness = obj.material.metalness;
      }
      if (obj.material.color) {
        obj.material.color.copy(tint);
      }
      if (typeof obj.material.roughness === "number") {
        obj.material.roughness = rough;
      }
      if (typeof obj.material.metalness === "number") {
        obj.material.metalness = metal;
      }
      obj.material.needsUpdate = true;
    });
  }

  _restoreLandmarkOriginalMaterial(lmItem) {
    if (!lmItem || !lmItem.group) return;
    lmItem.group.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.__origLmMat) return;
      obj.material = obj.userData.__origLmMat;
      if (obj.material.color && obj.userData.__origLmColorHex !== undefined) {
        obj.material.color.setHex(obj.userData.__origLmColorHex);
      }
      if (typeof obj.userData.__origLmRoughness === "number") {
        obj.material.roughness = obj.userData.__origLmRoughness;
      }
      if (typeof obj.userData.__origLmMetalness === "number") {
        obj.material.metalness = obj.userData.__origLmMetalness;
      }
      obj.material.needsUpdate = true;
      delete obj.userData.__origLmMat;
    });
  }

  /**
   * Reconstructs the target building in the live 3D scene from a real-world photograph or listing image.
   * For bespoke 3D landmarks (`targetProfile.isLandmark` or matched landmark in `app.landmarks`),
   * applies the photo-extracted architectural surface palette directly onto the landmark's 3D meshes
   * with zero surrounding box walls.
   */
  async reconstructParcelFromImage(targetProfile, imgSource, options = {}) {
    if (!targetProfile || !this.app) return null;
    const key = this.getParcelKey(targetProfile);

    const analysis = await analyzeBuildingPhotoAndBuildTextures(
      imgSource,
      targetProfile.floors || Math.max(1, Math.round((targetProfile.height || 14) / 3.6))
    );

    const lmItem = targetProfile.isLandmark ? this._findSceneLandmarkEntry(targetProfile) : null;
    if (targetProfile.isLandmark || lmItem) {
      if (lmItem) {
        this._applyLandmarkPhotoMaterialTint(lmItem, analysis);
      }
      const markerGroup = new THREE.Group();
      markerGroup.name = `reconstructed_landmark:${targetProfile.id}`;
      markerGroup.position.set(targetProfile.cx || 0, targetProfile.baseY || 0, targetProfile.cz || 0);
      this._mountParcelGroup(key, markerGroup, {
        type: "photo3d",
        isLandmark: true,
        landmarkId: lmItem?.L?.id || targetProfile.id,
        imgSource,
        wallHex: analysis.wallHex,
        trimHex: analysis.trimHex,
        roofHex: analysis.roofHex,
        glazingRatio: Math.round(analysis.glazingRatio * 100),
        updatedAt: Date.now(),
      });
      if (options.persist !== false) {
        this._saveParcelToStorage(key, targetProfile, imgSource);
      }
      return this.activeMeshes.get(key)?.meta;
    }

    const meshGroup = buildReconstructedParcelGroup(targetProfile, analysis);
    this._mountParcelGroup(key, meshGroup, {
      type: "photo3d",
      imgSource,
      wallHex: analysis.wallHex,
      trimHex: analysis.trimHex,
      roofHex: analysis.roofHex,
      glazingRatio: Math.round(analysis.glazingRatio * 100),
      updatedAt: Date.now(),
    });

    if (options.persist !== false) {
      this._saveParcelToStorage(key, targetProfile, imgSource);
    }

    return this.activeMeshes.get(key)?.meta;
  }

  /**
   * Loads a custom `.glb` / `.gltf` 3D mesh (e.g., exported from World Labs Marble / Atlas)
   * and fits it directly onto the selected parcel footprint.
   */
  async loadParcelGlbOverride(targetProfile, arrayBuffer, fileName = "model.glb", options = {}) {
    if (!targetProfile || !arrayBuffer) return null;
    const key = this.getParcelKey(targetProfile);
    const rawGroup = await parseGlbBufferToGroup(arrayBuffer, options);

    const box = new THREE.Box3().setFromObject(rawGroup);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const targetSpan = Math.max(12, Math.sqrt(targetProfile.areaM2 || 220) * 1.15);
    const targetH = Math.max(8, targetProfile.height || 18);
    const modelHorizSpan = Math.max(0.01, Math.max(size.x, size.z));
    const scaleFactor = Math.min(targetSpan / modelHorizSpan, (targetH * 1.25) / Math.max(0.01, size.y));

    const wrapper = new THREE.Group();
    wrapper.name = `glb_parcel:${targetProfile.id}`;
    wrapper.position.set(targetProfile.cx, targetProfile.baseY, targetProfile.cz);

    rawGroup.scale.multiplyScalar(scaleFactor);
    rawGroup.position.set(
      -center.x * scaleFactor,
      -box.min.y * scaleFactor,
      -center.z * scaleFactor
    );
    wrapper.add(rawGroup);

    this._mountParcelGroup(key, wrapper, {
      type: "glb3d",
      fileName,
      wallHex: "#60a5fa",
      trimHex: "#38bdf8",
      roofHex: "#1e293b",
      glazingRatio: 50,
      updatedAt: Date.now(),
    });

    return this.activeMeshes.get(key)?.meta;
  }

  removeParcelReconstruction(targetProfile) {
    const key = this.getParcelKey(targetProfile);
    const existing = this.activeMeshes.get(key);
    if (existing) {
      if (existing.meta?.isLandmark || targetProfile?.isLandmark) {
        const lmItem = this._findSceneLandmarkEntry(targetProfile);
        if (lmItem) this._restoreLandmarkOriginalMaterial(lmItem);
      }
      this.rootGroup.remove(existing.group);
      this._disposeGroup(existing.group);
      this.activeMeshes.delete(key);
    }
    const saved = loadLocalJsonMap(PARCEL_RECON_STORAGE_KEY);
    if (saved[key]) {
      delete saved[key];
      saveLocalJsonMap(PARCEL_RECON_STORAGE_KEY, saved);
    }
  }

  _mountParcelGroup(key, group, meta) {
    const prev = this.activeMeshes.get(key);
    if (prev) {
      this.rootGroup.remove(prev.group);
      this._disposeGroup(prev.group);
    }
    this.rootGroup.add(group);
    this.activeMeshes.set(key, { group, meta });
  }

  _disposeGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        if (obj.material.normalMap) obj.material.normalMap.dispose();
        obj.material.dispose();
      }
    });
  }

  _saveParcelToStorage(key, profile, imgSource) {
    if (typeof imgSource === "string" && imgSource.length > 120000) return;
    const saved = loadLocalJsonMap(PARCEL_RECON_STORAGE_KEY);
    const keys = Object.keys(saved);
    if (keys.length >= MAX_SAVED_PARCELS) {
      delete saved[keys[0]];
    }
    saved[key] = {
      id: profile.id,
      isLandmark: Boolean(profile.isLandmark),
      lat: profile.lat,
      lon: profile.lon,
      height: profile.height,
      floors: profile.floors,
      areaM2: profile.areaM2,
      localRing: normalizeFootprintRing(profile.ringPts, profile.cx, profile.cz),
      imgSource,
      ts: Date.now(),
    };
    saveLocalJsonMap(PARCEL_RECON_STORAGE_KEY, saved);
  }

  restoreSavedParcelsForOrigin() {
    const o = this.app?.worldOrigin;
    if (!o) return;

    for (const [, entry] of this.activeMeshes) {
      this.rootGroup.remove(entry.group);
      this._disposeGroup(entry.group);
    }
    this.activeMeshes.clear();

    const saved = loadLocalJsonMap(PARCEL_RECON_STORAGE_KEY);
    for (const [, item] of Object.entries(saved)) {
      if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lon) || !item.imgSource) continue;
      const wx = (item.lon - o.centerLon) * (o.mPerDegLon || 88000);
      const wz = (o.centerLat - item.lat) * (o.mPerDegLat || 111000);
      if (Math.hypot(wx, wz) > 15000) continue;

      const baseY = getBeijingTerrainElevation(wx, wz);
      const ringPts = [];
      const lr = item.localRing || [-10, -10, 10, -10, 10, 10, -10, 10];
      for (let i = 0; i < lr.length; i += 2) {
        ringPts.push(wx + lr[i], wz + lr[i + 1]);
      }

      this.reconstructParcelFromImage(
        {
          id: item.id,
          isLandmark: Boolean(item.isLandmark),
          lat: item.lat,
          lon: item.lon,
          cx: wx,
          cz: wz,
          baseY,
          topY: baseY + (item.height || 16),
          height: item.height || 16,
          floors: item.floors || 4,
          areaM2: item.areaM2 || 220,
          ringPts,
        },
        item.imgSource,
        { persist: false }
      );
    }
  }
}
