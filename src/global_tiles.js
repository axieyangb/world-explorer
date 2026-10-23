import { STYLE_24_KEYS } from "./wfc/wfc_archetypes.js";
import { extractLandcoverPolys } from "./features/vegetation_extract.js"; // [feature/vegetation]
import { extractPlaceFeatures } from "./features/places_extract.js"; // feature/places

const DEFAULT_TILE_TEMPLATE = "https://tiles.openfreemap.org/planet/20261018_080001_pt/{z}/{x}/{y}.pbf";
let resolvedTileTemplate = null;
let templatePromise = null;

const tileCache = new Map();     // "z/x/y" -> decoded layers
const tileInFlight = new Map();  // "z/x/y" -> Promise
const MAX_CACHED_TILES = 160;

export const QUICK_WORLD_DESTINATIONS = [
  { id: "nyc_times_sq", name: "New York · Times Square", nameZh: "纽约 · 时代广场", street: "Broadway & 7th Ave", city: "New York, US", cityZh: "美国 纽约", lat: 40.7580, lon: -73.9855 },
  { id: "tokyo_shibuya", name: "Tokyo · Shibuya", nameZh: "东京 · 涩谷十字路口", street: "Shibuya Crossing", city: "Tokyo, JP", cityZh: "日本 东京", lat: 35.6595, lon: 139.7004 },
  { id: "sf_embarcadero", name: "San Francisco · Embarcadero", nameZh: "旧金山 · 内河码头", street: "The Embarcadero", city: "San Francisco, US", cityZh: "美国 旧金山", lat: 37.7955, lon: -122.3937 },
  { id: "london_westminster", name: "London · Westminster", nameZh: "伦敦 · 威斯敏斯特", street: "Bridge St · Westminster", city: "London, UK", cityZh: "英国 伦敦", lat: 51.5007, lon: -0.1246 },
  { id: "paris_eiffel", name: "Paris · Eiffel Tower", nameZh: "巴黎 · 埃菲尔铁塔", street: "Quai Jacques Chirac", city: "Paris, FR", cityZh: "法国 巴黎", lat: 48.8584, lon: 2.2945 },
  { id: "hk_central", name: "Hong Kong · Central", nameZh: "香港 · 中环维港", street: "Connaught Rd Central", city: "Hong Kong, CN", cityZh: "中国 香港", lat: 22.2819, lon: 114.1581 },
  { id: "bj_guomao", name: "Beijing · CBD Guomao", nameZh: "北京 · 国贸 CBD", street: "East 3rd Ring Rd · CBD", city: "Beijing, CN", cityZh: "中国 北京", lat: 39.9095, lon: 116.4615 },
  { id: "bj_forbidden_city", name: "Beijing · Forbidden City", nameZh: "北京 · 故宫天安门", street: "Chang\x27an Ave", city: "Beijing, CN", cityZh: "中国 北京", lat: 39.9087, lon: 116.3975 },
];

export function computeWorldOrigin(lat, lon, displayName = "Beijing, CN", streetName = "") {
  const latRad = (lat * Math.PI) / 180.0;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
  const distBeijingKm = Math.hypot((lat - 39.9087) * 111.0, (lon - 116.3975) * 85.4);
  return {
    centerLat: lat,
    centerLon: lon,
    mPerDegLat: distBeijingKm < 30.0 ? 111033.0 : mPerDegLat,
    mPerDegLon: distBeijingKm < 30.0 ? 85387.0 : mPerDegLon,
    name: displayName,
    street: streetName,
    isBeijing: distBeijingKm < 30.0,
  };
}

export async function discoverTileTemplate() {
  if (resolvedTileTemplate) return resolvedTileTemplate;
  if (templatePromise) return templatePromise;
  templatePromise = (async () => {
    try {
      const resp = await fetch("https://tiles.openfreemap.org/planet");
      if (resp.ok) {
        const json = await resp.json();
        if (json && Array.isArray(json.tiles) && json.tiles[0]) {
          resolvedTileTemplate = json.tiles[0];
          return resolvedTileTemplate;
        }
      }
    } catch {
      // Fallback to default planet snapshot template
    }
    resolvedTileTemplate = DEFAULT_TILE_TEMPLATE;
    return resolvedTileTemplate;
  })();
  return templatePromise;
}

export function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180.0;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lon + 180.0) / 360.0) * n)));
  const y = Math.max(
    0,
    Math.min(n - 1, Math.floor(((1.0 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0) * n))
  );
  return [x, y];
}

export function tileLocalToLatLon(z, tx, ty, gx, gy, extent = 4096) {
  const n = Math.pow(2, z);
  const lon = ((tx + gx / extent) / n) * 360.0 - 180.0;
  const latRad = Math.atan(Math.sinh(Math.PI * (1.0 - (2.0 * (ty + gy / extent)) / n)));
  const lat = (latRad * 180.0) / Math.PI;
  return [lat, lon];
}

const textDecoder = new TextDecoder();

function readVarint(buf, p) {
  let val = 0;
  let shift = 0;
  while (p.i < buf.length) {
    const b = buf[p.i++];
    val += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) return val;
    shift += 7;
  }
  return val;
}

function skipField(buf, p, wire) {
  if (wire === 0) readVarint(buf, p);
  else if (wire === 1) p.i += 8;
  else if (wire === 2) p.i += readVarint(buf, p);
  else if (wire === 5) p.i += 4;
  else p.i = buf.length;
}

function decodeZigZag(n) {
  return (n >>> 1) ^ -(n & 1);
}

function decodeMvtGeometry(geomCmds, ftype, z, tx, ty, extent) {
  let cx = 0;
  let cy = 0;
  let i = 0;
  const rings = [];
  let curRing = null;

  while (i < geomCmds.length) {
    const cmdInt = geomCmds[i++];
    const cmd = cmdInt & 0x7;
    const count = cmdInt >>> 3;
    if (cmd === 1) {
      // MoveTo
      for (let k = 0; k < count && i + 1 < geomCmds.length; k++) {
        cx += decodeZigZag(geomCmds[i++]);
        cy += decodeZigZag(geomCmds[i++]);
        if (curRing && curRing.length > 0) rings.push(curRing);
        curRing = [[cx, cy]];
      }
    } else if (cmd === 2) {
      // LineTo
      if (!curRing) curRing = [];
      for (let k = 0; k < count && i + 1 < geomCmds.length; k++) {
        cx += decodeZigZag(geomCmds[i++]);
        cy += decodeZigZag(geomCmds[i++]);
        curRing.push([cx, cy]);
      }
    } else if (cmd === 7) {
      // ClosePath
      if (curRing && curRing.length >= 3) {
        const first = curRing[0];
        const last = curRing[curRing.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          curRing.push([first[0], first[1]]);
        }
      }
    }
  }
  if (curRing && curRing.length > 0) rings.push(curRing);

  if (ftype === 1) {
    // POINT
    const pts = [];
    for (const r of rings) {
      for (const [gx, gy] of r) {
        pts.push(tileLocalToLatLon(z, tx, ty, gx, gy, extent));
      }
    }
    return pts;
  }

  if (ftype === 2) {
    // LINESTRING
    const lines = [];
    for (const r of rings) {
      if (r.length < 2) continue;
      const line = new Array(r.length);
      for (let k = 0; k < r.length; k++) {
        line[k] = tileLocalToLatLon(z, tx, ty, r[k][0], r[k][1], extent);
      }
      lines.push(line);
    }
    return lines;
  }

  if (ftype === 3) {
    // POLYGON: classify exterior vs interior hole rings by screen-space signed area
    const polys = [];
    let currentPoly = null;
    for (const r of rings) {
      if (r.length < 3) continue;
      let area2 = 0;
      for (let k = 0; k < r.length; k++) {
        const p1 = r[k];
        const p2 = r[(k + 1) % r.length];
        area2 += p1[0] * p2[1] - p2[0] * p1[1];
      }
      // Remove duplicate closing vertex
      const cleanLen =
        r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]
          ? r.length - 1
          : r.length;
      const latLonRing = new Array(cleanLen);
      for (let k = 0; k < cleanLen; k++) {
        latLonRing[k] = tileLocalToLatLon(z, tx, ty, r[k][0], r[k][1], extent);
      }
      if (area2 >= 0 || !currentPoly) {
        currentPoly = { outer: latLonRing, holes: [] };
        polys.push(currentPoly);
      } else {
        currentPoly.holes.push(latLonRing);
      }
    }
    return polys;
  }

  return [];
}

const INTERESTING_LAYERS = new Set([
  "transportation",
  "transportation_name",
  "building",
  "water",
  "waterway",
  "park",
  "landuse",
  "landcover",
  "place",
  "poi", // feature/places
  "housenumber",
  "aeroway", // feature/places
]);

export function decodeMvtTile(arrayBuffer, z, tx, ty) {
  const buf = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const layers = {};
  const p = { i: 0 };

  while (p.i < buf.length) {
    const tag = readVarint(buf, p);
    const fn = tag >>> 3;
    const wire = tag & 7;
    if (fn === 3 && wire === 2) {
      const layerLen = readVarint(buf, p);
      const layerEnd = p.i + layerLen;
      let layerName = "";
      let extent = 4096;
      const keys = [];
      const vals = [];
      const rawFeats = [];

      while (p.i < layerEnd) {
        const ltag = readVarint(buf, p);
        const lfn = ltag >>> 3;
        const lwire = ltag & 7;
        if (lfn === 1 && lwire === 2) {
          const slen = readVarint(buf, p);
          layerName = textDecoder.decode(buf.subarray(p.i, p.i + slen));
          p.i += slen;
          if (layerName && !INTERESTING_LAYERS.has(layerName)) {
            p.i = layerEnd;
            break;
          }
        } else if (lfn === 2 && lwire === 2) {
          const flen = readVarint(buf, p);
          rawFeats.push(p.i, p.i + flen);
          p.i += flen;
        } else if (lfn === 3 && lwire === 2) {
          const klen = readVarint(buf, p);
          keys.push(textDecoder.decode(buf.subarray(p.i, p.i + klen)));
          p.i += klen;
        } else if (lfn === 4 && lwire === 2) {
          const vlen = readVarint(buf, p);
          const vend = p.i + vlen;
          let val = null;
          while (p.i < vend) {
            const vtag = readVarint(buf, p);
            const vfn = vtag >>> 3;
            const vw = vtag & 7;
            if (vfn === 1 && vw === 2) {
              const s = readVarint(buf, p);
              val = textDecoder.decode(buf.subarray(p.i, p.i + s));
              p.i += s;
            } else if (vfn === 2 && vw === 5) {
              val = dv.getFloat32(p.i, true);
              p.i += 4;
            } else if (vfn === 3 && vw === 1) {
              val = dv.getFloat64(p.i, true);
              p.i += 8;
            } else if ((vfn === 4 || vfn === 5) && vw === 0) {
              val = readVarint(buf, p);
            } else if (vfn === 6 && vw === 0) {
              val = decodeZigZag(readVarint(buf, p));
            } else if (vfn === 7 && vw === 0) {
              val = Boolean(readVarint(buf, p));
            } else {
              skipField(buf, p, vw);
            }
          }
          vals.push(val);
        } else if (lfn === 5 && lwire === 0) {
          extent = readVarint(buf, p);
        } else {
          skipField(buf, p, lwire);
        }
      }

      if (!INTERESTING_LAYERS.has(layerName)) {
        p.i = layerEnd;
        continue;
      }

      const decodedFeats = [];
      for (let fIdx = 0; fIdx < rawFeats.length; fIdx += 2) {
        const fp = { i: rawFeats[fIdx] };
        const fend = rawFeats[fIdx + 1];
        let fid = (fIdx >>> 1) + 1;
        let ftype = 0;
        const tags = {};
        const geomCmds = [];

        while (fp.i < fend) {
          const ft = readVarint(buf, fp);
          const ffn = ft >>> 3;
          const fw = ft & 7;
          if (ffn === 1 && fw === 0) {
            fid = readVarint(buf, fp);
          } else if (ffn === 2 && fw === 2) {
            const tlen = readVarint(buf, fp);
            const tend = fp.i + tlen;
            while (fp.i < tend) {
              const ki = readVarint(buf, fp);
              const vi = readVarint(buf, fp);
              if (ki < keys.length && vi < vals.length) {
                tags[keys[ki]] = vals[vi];
              }
            }
          } else if (ffn === 3 && fw === 0) {
            ftype = readVarint(buf, fp);
          } else if (ffn === 4 && fw === 2) {
            const glen = readVarint(buf, fp);
            const gend = fp.i + glen;
            while (fp.i < gend) {
              geomCmds.push(readVarint(buf, fp));
            }
          } else if (ffn === 4 && fw === 0) {
            geomCmds.push(readVarint(buf, fp));
          } else {
            skipField(buf, fp, fw);
          }
        }

        if (ftype > 0 && geomCmds.length > 0) {
          const geom = decodeMvtGeometry(geomCmds, ftype, z, tx, ty, extent);
          decodedFeats.push({ id: fid, type: ftype, tags, geom });
        }
      }
      layers[layerName] = decodedFeats;
    } else {
      skipField(buf, p, wire);
    }
  }
  return layers;
}

export async function fetchDecodedMvtTile(z, tx, ty) {
  const key = `${z}/${tx}/${ty}`;
  if (tileCache.has(key)) return tileCache.get(key);
  if (tileInFlight.has(key)) return tileInFlight.get(key);

  const prom = (async () => {
    try {
      const tpl = await discoverTileTemplate();
      const url = tpl.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
      const resp = await fetch(url);
      if (!resp.ok) return {};
      let buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b && typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("gzip");
        const stream = new Blob([buf]).stream().pipeThrough(ds);
        buf = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      const decoded = decodeMvtTile(buf, z, tx, ty);
      if (tileCache.size >= MAX_CACHED_TILES) {
        const oldestKey = tileCache.keys().next().value;
        tileCache.delete(oldestKey);
      }
      tileCache.set(key, decoded);
      return decoded;
    } catch {
      return {};
    } finally {
      tileInFlight.delete(key);
    }
  })();

  tileInFlight.set(key, prom);
  return prom;
}

/**
 * Clips a 2D polygon ring `[x0, z0, x1, z1, ...]` to axis-aligned box `[minB, maxB] x [minB, maxB]`
 * via Sutherland-Hodgman clipping.
 */
function clipRingToBoxXZ(flatXZ, minB, maxB) {
  let pts = [];
  for (let i = 0; i < flatXZ.length; i += 2) {
    pts.push([flatXZ[i], flatXZ[i + 1]]);
  }
  const clipPlane = (input, insideFn, intersectFn) => {
    const out = [];
    const n = input.length;
    if (n === 0) return out;
    for (let i = 0; i < n; i++) {
      const cur = input[i];
      const prev = input[(i - 1 + n) % n];
      const curIn = insideFn(cur);
      const prevIn = insideFn(prev);
      if (curIn) {
        if (!prevIn) out.push(intersectFn(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersectFn(prev, cur));
      }
    }
    return out;
  };

  pts = clipPlane(pts, (p) => p[0] >= minB, (a, b) => [minB, a[1] + ((b[1] - a[1]) * (minB - a[0])) / (b[0] - a[0] || 1e-9)]);
  pts = clipPlane(pts, (p) => p[0] <= maxB, (a, b) => [maxB, a[1] + ((b[1] - a[1]) * (maxB - a[0])) / (b[0] - a[0] || 1e-9)]);
  pts = clipPlane(pts, (p) => p[1] >= minB, (a, b) => [a[0] + ((b[0] - a[0]) * (minB - a[1])) / (b[1] - a[1] || 1e-9), minB]);
  pts = clipPlane(pts, (p) => p[1] <= maxB, (a, b) => [a[0] + ((b[0] - a[0]) * (maxB - a[1])) / (b[1] - a[1] || 1e-9), maxB]);

  const outFlat = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (outFlat.length >= 2 && Math.hypot(x - outFlat[outFlat.length - 2], z - outFlat[outFlat.length - 1]) < 0.25) {
      continue;
    }
    outFlat.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
  }
  return outFlat;
}

const ROAD_CLASS_MAP = {
  motorway: { cls: "motorway", linkCls: "motorway_link", lanes: 3, width: 12.5, oneway: 1 },
  trunk: { cls: "trunk", linkCls: "trunk_link", lanes: 3, width: 11.5, oneway: 1 },
  primary: { cls: "primary", linkCls: "primary_link", lanes: 2, width: 9.5, oneway: 0 },
  secondary: { cls: "secondary", linkCls: "secondary_link", lanes: 2, width: 8.0, oneway: 0 },
  tertiary: { cls: "tertiary", linkCls: "tertiary_link", lanes: 2, width: 6.5, oneway: 0 },
  minor: { cls: "residential", linkCls: "residential", lanes: 1, width: 5.5, oneway: 0 },
  street: { cls: "residential", linkCls: "residential", lanes: 1, width: 5.5, oneway: 0 },
  residential: { cls: "residential", linkCls: "residential", lanes: 1, width: 5.5, oneway: 0 },
  service: { cls: "service", linkCls: "service", lanes: 1, width: 3.8, oneway: 0 },
  track: { cls: "service", linkCls: "service", lanes: 1, width: 3.5, oneway: 0 },
  path: { cls: "footway", linkCls: "footway", lanes: 1, width: 2.2, oneway: 0 },
  pedestrian: { cls: "pedestrian", linkCls: "pedestrian", lanes: 1, width: 4.5, oneway: 0 },
};

const LINK_SPECS = {
  motorway_link: { lanes: 1, width: 6.0, oneway: 1 },
  trunk_link: { lanes: 1, width: 5.8, oneway: 1 },
  primary_link: { lanes: 1, width: 5.2, oneway: 1 },
  secondary_link: { lanes: 1, width: 4.8, oneway: 1 },
  tertiary_link: { lanes: 1, width: 4.5, oneway: 1 },
};

const HIGH_RISE_STYLES = [
  "S01_zgc_pailou_glass",
  "S02_cbd_sapphire_curtain",
  "S03_emerald_ribbon_tech",
  "S04_granite_rib_financial",
  "S05_champagne_artdeco_tower",
  "S11_90s_yayuncun_bluewhite",
  "S12_05s_haidian_sienna_bay",
  "S13_10s_wangjing_khaki_modern",
  "S14_15s_neoclassical_stone",
  "S15_20s_silver_minimal_flat",
  "S21_sanlitun_obsidian_retail",
  "S22_90s_bronze_hotel",
];

const MID_LOW_STYLES_GLOBAL = [
  "S06_50s_soviet_redbrick",
  "S07_80s_zhichunli_brick_stucco",
  "S08_80s_huangzhuang_ochre",
  "S09_90s_fangzhuang_redtile",
  "S10_renovated_pastel_slab",
  "S14_15s_neoclassical_stone",
  "S16_50s_sanlihe_ministry",
  "S17_90s_whitetile_blueglass",
  "S18_campus_redbrick_arch",
  "S19_798_industrial_loft",
  "S20_wudaokou_vibrant_mall",
  "S21_sanlitun_obsidian_retail",
];

/**
 * Fetches intersecting Zoom-14 OpenFreeMap vector tiles and converts features into the exact
 * chunk schema expected by `chunk_builder.js`.
 */
export async function fetchGlobalChunkData(cx, cz, worldOrigin) {
  const origin = worldOrigin || computeWorldOrigin(39.9087, 116.3975, "Beijing, CN");
  const { centerLat, centerLon, mPerDegLat, mPerDegLon, isBeijing } = origin;
  const ox = -20000 + cx * 1000 + 500;
  const oz = -20000 + cz * 1000 + 500;

  const padM = 620.0;
  const minLat = centerLat - (oz + padM) / mPerDegLat;
  const maxLat = centerLat - (oz - padM) / mPerDegLat;
  const minLon = centerLon + (ox - padM) / mPerDegLon;
  const maxLon = centerLon + (ox + padM) / mPerDegLon;

  const z = 14;
  const [tx0, ty0] = latLonToTileXY(maxLat, minLon, z);
  const [tx1, ty1] = latLonToTileXY(minLat, maxLon, z);

  const tilePromises = [];
  for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
    for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
      tilePromises.push(fetchDecodedMvtTile(z, tx, ty));
    }
  }
  const tiles = await Promise.all(tilePromises);

  const toLocalXZ = (lat, lon) => [
    (lon - centerLon) * mPerDegLon - ox,
    (centerLat - lat) * mPerDegLat - oz,
  ];

  // 1. Collect road names & route refs from `transportation_name`
  const formatRouteRef = (rawRef, network) => {
    if (!rawRef) return "";
    const first = String(rawRef).split(";")[0].trim();
    if (!first) return "";
    const net = String(network || "").toUpperCase();
    if (/^[0-9]+[A-Z]?$/.test(first)) {
      if (net.includes("US:I") || net.includes("INTERSTATE")) return "I-" + first;
      if (net.includes("US:US")) return "US " + first;
      if (net.includes("US:CA")) return "CA " + first;
      if (net.includes("US:NY")) return "NY " + first;
    }
    return first;
  };
  const namedRoadSamples = [];
  const pushSample = (lx, lz, dx, dz, nm, nmZh, ref, cls) => {
    if (lx >= -680 && lx <= 680 && lz >= -680 && lz <= 680) {
      namedRoadSamples.push({ lx, lz, dx, dz, name: nm, nameZh: nmZh, ref, cls });
    }
  };
  const highwayJunctions = [];
  const seenJunctionKeys = new Set();
  for (const t of tiles) {
    for (const f of t.transportation_name || []) {
      const nm = f.tags["name:en"] || f.tags.name_en || f.tags["name:latin"] || f.tags.name || "";
      const nmZh = f.tags.name || nm;
      const subCls = f.tags.subclass || "";
      const rawCls = f.tags.class || "";
      if (subCls === "junction" || rawCls === "junction") {
        const rawJuncRef = String(f.tags.ref || f.tags.route_1 || "").split(";")[0].trim();
        if (rawJuncRef && f.type === 1) {
          for (const pt of f.geom) {
            const [lx, lz] = toLocalXZ(pt[0], pt[1]);
            if (lx >= -620 && lx <= 620 && lz >= -620 && lz <= 620) {
              const jKey = `${Math.round(lx / 6)},${Math.round(lz / 6)},${rawJuncRef}`;
              if (!seenJunctionKeys.has(jKey)) {
                seenJunctionKeys.add(jKey);
                highwayJunctions.push({
                  lx: Math.round(lx * 10) / 10,
                  lz: Math.round(lz * 10) / 10,
                  ref: rawJuncRef,
                  name: nm,
                });
              }
            }
          }
        }
        continue;
      }
      const net = f.tags.network || f.tags.route_1_network || "";
      // Ignore walking/cycling trail route networks (rwn, lwn, nwn, rcn, lcn, ncn) when extracting highway refs
      const isTrailNet = /^[rln][wc]n$/i.test(String(net).trim());
      const ref = isTrailNet ? "" : formatRouteRef(f.tags.ref || f.tags.route_1 || "", net);
      const cls = rawCls || subCls;
      if (
        cls === "path" || cls === "footway" || cls === "pedestrian" || cls === "steps" ||
        cls === "cycleway" || cls === "corridor" || cls === "ferry" || cls === "aerialway" ||
        cls === "pier" || cls.endsWith("_construction")
      ) continue;
      if (nm.includes("...") || nm.includes("Herb Caen")) continue;
      if (!nm && !ref) continue;
      if (f.type === 1) {
        for (const pt of f.geom) {
          const [lx, lz] = toLocalXZ(pt[0], pt[1]);
          pushSample(lx, lz, 0, 0, nm, nmZh, ref, cls);
        }
      } else if (f.type === 2) {
        for (const line of f.geom) {
          for (let i = 0; i < line.length; i++) {
            const [lx, lz] = toLocalXZ(line[i][0], line[i][1]);
            let dx = 0, dz = 0;
            if (i + 1 < line.length) {
              const [nx, nz] = toLocalXZ(line[i + 1][0], line[i + 1][1]);
              const segD = Math.hypot(nx - lx, nz - lz);
              if (segD > 1e-3) {
                dx = (nx - lx) / segD;
                dz = (nz - lz) / segD;
              }
              pushSample(lx, lz, dx, dz, nm, nmZh, ref, cls);
              if (segD > 18) {
                const steps = Math.min(16, Math.floor(segD / 16));
                for (let s = 1; s < steps; s++) {
                  const u = s / steps;
                  pushSample(lx + (nx - lx) * u, lz + (nz - lz) * u, dx, dz, nm, nmZh, ref, cls);
                }
              }
            } else if (i > 0) {
              const [px, pz] = toLocalXZ(line[i - 1][0], line[i - 1][1]);
              const segD = Math.hypot(lx - px, lz - pz);
              if (segD > 1e-3) {
                dx = (lx - px) / segD;
                dz = (lz - pz) / segD;
              }
              pushSample(lx, lz, dx, dz, nm, nmZh, ref, cls);
            }
          }
        }
      }
    }
  }

  // 2. Collect raw roads & railways from `transportation`
  const rawRoads = [];
  const railways = [];
  const groundNodeCounts = new Map();
  const bridgeNodeCounts = new Map();
  let roadIdSeq = (cx * 40 + cz) * 10000 + 1;

  for (const t of tiles) {
    for (const f of t.transportation || []) {
      if (f.type !== 2) continue;
      const rawCls = f.tags.class || "";
      const subCls = f.tags.subclass || "";

      if (rawCls === "rail" || rawCls === "transit") {
        const isBridge = f.tags.brunnel === "bridge" || (f.tags.layer || 0) > 0 ? 1 : 0;
        const isTunnel = f.tags.brunnel === "tunnel" || (f.tags.layer || 0) < 0 ? 1 : 0;
        if (isTunnel) continue;
        const layer = f.tags.layer !== undefined ? Number(f.tags.layer) : isBridge ? 1 : 0;
        const rY = isBridge ? Math.max(1, layer || 1) * 7.4 : 0.0;
        for (const line of f.geom) {
          let inBounds = false;
          const flatXYZ = [];
          for (let i = 0; i < line.length; i++) {
            const [lx, lz] = toLocalXZ(line[i][0], line[i][1]);
            if (lx >= -540 && lx <= 540 && lz >= -540 && lz <= 540) inBounds = true;
            flatXYZ.push(Math.round(lx * 10) / 10, rY, Math.round(lz * 10) / 10);
          }
          if (inBounds && flatXYZ.length >= 6) {
            const rtype = subCls === "subway" || rawCls === "transit" ? "subway" : "rail";
            railways.push([roadIdSeq++, rtype, f.tags.name || "", "#0092d8", isBridge, isTunnel, layer, flatXYZ]);
          }
        }
        continue;
      }

      const baseSpec = ROAD_CLASS_MAP[rawCls] || ROAD_CLASS_MAP[subCls];
      if (!baseSpec) continue;

      const isRamp = Boolean(f.tags.ramp);
      let cls = isRamp ? baseSpec.linkCls : baseSpec.cls;
      if (rawCls === "path") {
        if (subCls === "pedestrian" || subCls === "platform") cls = "pedestrian";
        else if (subCls === "cycleway") cls = "cycleway";
        else cls = "footway";
      }
      const linkSpec = LINK_SPECS[cls];
      const lanes = Number(f.tags.lanes) || (linkSpec ? linkSpec.lanes : baseSpec.lanes);
      const widthM = linkSpec ? linkSpec.width : baseSpec.width;
      const oneway = f.tags.oneway !== undefined ? (f.tags.oneway ? 1 : 0) : linkSpec ? linkSpec.oneway : baseSpec.oneway;
      const onewayRev = Number(f.tags.oneway) === -1; // OSM oneway=-1: traffic flows against the way geometry
      const isBridge = f.tags.brunnel === "bridge" || (f.tags.layer || 0) > 0 ? 1 : 0;
      const isTunnel = f.tags.brunnel === "tunnel" || (f.tags.layer || 0) < 0 ? 1 : 0;
      const layer = f.tags.layer !== undefined ? Number(f.tags.layer) : isBridge ? 1 : isTunnel ? -1 : 0;

      for (const rawLine of f.geom) {
        if (rawLine.length < 2) continue;
        const line = onewayRev ? rawLine.slice().reverse() : rawLine;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const ptsXZ = new Array(line.length);
        for (let i = 0; i < line.length; i++) {
          const [lx, lz] = toLocalXZ(line[i][0], line[i][1]);
          ptsXZ[i] = [lx, lz];
          if (lx < minX) minX = lx;
          if (lx > maxX) maxX = lx;
          if (lz < minZ) minZ = lz;
          if (lz > maxZ) maxZ = lz;
        }
        if (maxX < -540 || minX > 540 || maxZ < -540 || minZ > 540) continue;

        const startKey = `${Math.round(ptsXZ[0][0] / 2)},${Math.round(ptsXZ[0][1] / 2)}`;
        const endKey = `${Math.round(ptsXZ[ptsXZ.length - 1][0] / 2)},${Math.round(ptsXZ[ptsXZ.length - 1][1] / 2)}`;
        if (isBridge) {
          bridgeNodeCounts.set(startKey, (bridgeNodeCounts.get(startKey) || 0) + 1);
          bridgeNodeCounts.set(endKey, (bridgeNodeCounts.get(endKey) || 0) + 1);
        } else if (!isTunnel) {
          groundNodeCounts.set(startKey, (groundNodeCounts.get(startKey) || 0) + 1);
          groundNodeCounts.set(endKey, (groundNodeCounts.get(endKey) || 0) + 1);
        }

        rawRoads.push({
          id: roadIdSeq++,
          cls,
          rawCls,
          name: f.tags["name:en"] || f.tags.name_en || f.tags.name || "",
          ref: f.tags.ref || "",
          lanes,
          widthM,
          oneway,
          isBridge,
          isTunnel,
          layer,
          ptsXZ,
          startKey,
          endKey,
        });
      }
    }
  }

  // 3. Match road names & compute 3D elevation profile with smooth cosine ramps at bridge abutments
  const roads = [];
  const intersectionNodes = new Map();

  for (const r of rawRoads) {
    let { id, cls, rawCls, name, ref, lanes, widthM, oneway, isBridge, isTunnel, layer, ptsXZ, startKey, endKey } = r;

    const isPedOrService = cls === "footway" || cls === "pedestrian" || cls === "steps" || cls === "cycleway" || cls === "service";
    if (!isPedOrService && (!name || !ref) && namedRoadSamples.length > 0) {
      const midIdx = Math.floor(ptsXZ.length * 0.5);
      const mid = ptsXZ[midIdx];
      const p0 = ptsXZ[0];
      const p1 = ptsXZ[ptsXZ.length - 1];
      const q1 = [p0[0] * 0.7 + mid[0] * 0.3, p0[1] * 0.7 + mid[1] * 0.3];
      const q2 = [p1[0] * 0.7 + mid[0] * 0.3, p1[1] * 0.7 + mid[1] * 0.3];
      const rLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const rdx = rLen > 1e-3 ? (p1[0] - p0[0]) / rLen : 0;
      const rdz = rLen > 1e-3 ? (p1[1] - p0[1]) / rLen : 0;
      let bestD2 = 26.0 * 26.0;
      for (let k = 0; k < namedRoadSamples.length; k++) {
        const ns = namedRoadSamples[k];
        if (ns.cls && ns.cls !== rawCls) continue;
        if ((ns.dx !== 0 || ns.dz !== 0) && (rdx !== 0 || rdz !== 0)) {
          if (Math.abs(rdx * ns.dx + rdz * ns.dz) < 0.72) continue;
        }
        const dMid = (mid[0] - ns.lx) ** 2 + (mid[1] - ns.lz) ** 2;
        const dQ1 = (q1[0] - ns.lx) ** 2 + (q1[1] - ns.lz) ** 2;
        const dQ2 = (q2[0] - ns.lx) ** 2 + (q2[1] - ns.lz) ** 2;
        const d2 = Math.min(dMid, dQ1, dQ2);
        if (d2 < bestD2) {
          bestD2 = d2;
          if (!name && ns.name) name = ns.name;
          if (!ref && ns.ref) ref = ns.ref;
        }
      }
    }

    if (isBridge && ptsXZ.length >= 2) {
      const dense = [ptsXZ[0]];
      for (let i = 1; i < ptsXZ.length; i++) {
        const [x0, z0] = ptsXZ[i - 1];
        const [x1, z1] = ptsXZ[i];
        const segD = Math.hypot(x1 - x0, z1 - z0);
        const steps = Math.max(1, Math.min(32, Math.ceil(segD / 4.0)));
        for (let s = 1; s <= steps; s++) {
          const u = s / steps;
          dense.push([x0 + (x1 - x0) * u, z0 + (z1 - z0) * u]);
        }
      }
      ptsXZ = dense;
    }

    const nPts = ptsXZ.length;
    const cumDist = new Float32Array(nPts);
    let totalLen = 0;
    for (let i = 1; i < nPts; i++) {
      totalLen += Math.hypot(ptsXZ[i][0] - ptsXZ[i - 1][0], ptsXZ[i][1] - ptsXZ[i - 1][1]);
      cumDist[i] = totalLen;
    }

    const targetElev = isBridge ? Math.max(1, layer || 1) * 7.4 : isTunnel ? -6.8 : 0.0;

    const flatXYZ = [];
    for (let i = 0; i < nPts; i++) {
      const [lx, lz] = ptsXZ[i];
      const y = targetElev;
      flatXYZ.push(Math.round(lx * 10) / 10, Math.round(y * 100) / 100, Math.round(lz * 10) / 10);
    }

    // Track major intersections for traffic lights & highway gantries
    if (!isTunnel && cls !== "footway" && cls !== "service") {
      for (const ep of [ptsXZ[0], ptsXZ[nPts - 1]]) {
        if (ep[0] >= -480 && ep[0] <= 480 && ep[1] >= -480 && ep[1] <= 480) {
          const nk = `${Math.round(ep[0] / 8)},${Math.round(ep[1] / 8)}`;
          let info = intersectionNodes.get(nk);
          if (!info) {
            info = { lx: ep[0], lz: ep[1], y: isBridge ? targetElev : 0, deg: 0, isMotorway: false, isLink: false };
            intersectionNodes.set(nk, info);
          }
          info.deg++;
          if (cls === "motorway" || cls === "trunk") info.isMotorway = true;
          if (cls.endsWith("_link")) info.isLink = true;
        }
      }
    }

    const roadTuple = [id, cls, name, ref, lanes, widthM, oneway, isBridge, isTunnel, layer, flatXYZ];
    roads.push(roadTuple);
  }

  // 3b. Extract POI points & `housenumber` street address points for building name/role binding
  const pointInFlatRingXZ = (px, pz, flat) => {
    let inside = false;
    for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
      const xi = flat[i], zi = flat[i + 1];
      const xj = flat[j], zj = flat[j + 1];
      if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
  const pointToFlatRingDistXZ = (px, pz, flat) => {
    let minD2 = Infinity;
    for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
      const x1 = flat[j], z1 = flat[j + 1];
      const x2 = flat[i], z2 = flat[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2)) : 0;
      const cxp = x1 + dx * t, czp = z1 + dz * t;
      const d2 = (px - cxp) * (px - cxp) + (pz - czp) * (pz - czp);
      if (d2 < minD2) minD2 = d2;
    }
    return Math.sqrt(minD2);
  };
  const classifyPoiRole = (cls, subCls, rank) => {
    const c = String(cls || "").toLowerCase();
    const s = String(subCls || "").toLowerCase();
    const rPenalty = Math.min(20, Math.max(0, Number(rank) || 10));
    if (c === "hospital" || s === "hospital" || s === "clinic" || s === "doctors") return { btype: "hospital", priority: 100 - rPenalty };
    if (c === "university" || s === "university") return { btype: "university", priority: 98 - rPenalty };
    if (c === "college" || s === "college") return { btype: "college", priority: 96 - rPenalty };
    if (c === "school" || s === "school" || s === "kindergarten") return { btype: s === "kindergarten" ? "kindergarten" : "school", priority: 94 - rPenalty };
    if (c === "town_hall" || s === "town_hall" || s === "courthouse" || s === "embassy" || s === "government" || s === "community_centre") return { btype: "government", priority: 96 - rPenalty };
    if (c === "museum" || c === "library" || s === "museum" || s === "library" || s === "art_gallery" || s === "theatre" || s === "arts_centre") return { btype: "civic", priority: 92 - rPenalty };
    if (c === "police" || c === "fire_station" || c === "post" || s === "police" || s === "fire_station" || s === "post_office") return { btype: "public", priority: 90 - rPenalty };
    if (c === "place_of_worship" || s === "place_of_worship" || s === "church" || s === "cathedral" || s === "temple" || s === "mosque" || s === "shrine") {
      const bt = s === "temple" || s === "shrine" ? "temple" : s === "mosque" ? "mosque" : s === "cathedral" ? "cathedral" : "church";
      return { btype: bt, priority: 92 - rPenalty };
    }
    if (c === "stadium" || s === "stadium" || s === "sports_centre" || s === "arena" || c === "Ice_rink" || c === "swimming_pool") {
      return { btype: c === "stadium" || s === "stadium" ? "stadium" : "sports_centre", priority: 92 - rPenalty };
    }
    if (c === "railway" || s === "station" || s === "subway" || s === "bus_station" || s === "ferry_terminal") return { btype: "train_station", priority: 90 - rPenalty };
    if (c === "lodging" || s === "hotel" || s === "motel" || s === "hostel" || s === "guest_house") return { btype: "hotel", priority: 88 - rPenalty };
    if (c === "attraction" || c === "castle" || c === "monument" || c === "memorial" || c === "historic") return { btype: "civic", priority: 86 - rPenalty };
    if (c === "office" || s === "office" || s === "company" || s === "financial" || c === "bank" || s === "bank") return { btype: "office", priority: 78 - rPenalty };
    if (s === "supermarket" || c === "supermarket" || s === "department_store" || s === "mall" || s === "marketplace") {
      return { btype: s === "supermarket" || c === "supermarket" ? "supermarket" : "commercial", priority: 76 - rPenalty };
    }
    if (c === "parking" || s === "parking") return { btype: "parking", priority: 72 - rPenalty };
    if (c === "industrial" || s === "industrial" || s === "warehouse") return { btype: "industrial", priority: 70 - rPenalty };
    if (c === "shop" || c === "grocery" || c === "clothing_store" || c === "restaurant" || c === "cafe" || c === "fast_food" || c === "bar" || c === "pharmacy" || c === "bakery" || c === "commercial" || c === "retail") {
      return { btype: "retail", priority: 58 - rPenalty };
    }
    return { btype: "commercial", priority: 50 - rPenalty };
  };

  const chunkPois = [];
  for (const t of tiles) {
    for (const f of t.poi || []) {
      if (f.type !== 1) continue;
      const cls = f.tags.class || "";
      const subCls = f.tags.subclass || "";
      const nm = String(f.tags["name:en"] || f.tags.name_en || f.tags.name || "").trim();
      if (!nm && !cls && !subCls) continue;
      const role = classifyPoiRole(cls, subCls, f.tags.rank);
      for (const pt of f.geom) {
        const [lx, lz] = toLocalXZ(pt[0], pt[1]);
        if (lx < -520 || lx > 520 || lz < -520 || lz > 520) continue;
        chunkPois.push({ lx, lz, name: nm, btype: role.btype, priority: role.priority });
      }
    }
  }

  // Collect road name sample points in chunk-local XZ for pairing `housenumber` points with their street name
  const localStreetPts = [];
  for (const r of roads) {
    const [, rCls, rName, , , , , , , , flatXYZ] = r;
    if (!rName || rCls === "footway" || rCls === "steps" || rCls === "cycleway") continue;
    for (let i = 0; i < flatXYZ.length; i += 6) {
      localStreetPts.push({ lx: flatXYZ[i], lz: flatXYZ[i + 2], name: rName });
    }
  }
  const chunkHousenumbers = [];
  const seenHnKeys = new Set();
  for (const t of tiles) {
    for (const f of t.housenumber || []) {
      if (f.type !== 1) continue;
      const rawHn = String(f.tags.housenumber || "").trim();
      if (!rawHn || rawHn.length > 16) continue;
      for (const pt of f.geom) {
        const [lx, lz] = toLocalXZ(pt[0], pt[1]);
        if (lx < -515 || lx > 515 || lz < -515 || lz > 515) continue;
        const hk = `${Math.round(lx / 3)},${Math.round(lz / 3)},${rawHn}`;
        if (seenHnKeys.has(hk)) continue;
        seenHnKeys.add(hk);
        chunkHousenumbers.push({ lx, lz, num: rawHn });
      }
    }
  }

  // 4. Extract 3D Buildings from `building` layer
  const buildings = [];
  const seenBldgKeys = new Set();
  let bldgIdSeq = (cx * 40 + cz) * 50000 + 1;

  for (const t of tiles) {
    for (const f of t.building || []) {
      if (f.type !== 3) continue;
      if (f.tags.hide_3d === true || f.tags.hide_3d === 1) continue;

      for (const poly of f.geom) {
        const outer = poly.outer;
        if (!outer || outer.length < 3) continue;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const flatOuter = [];
        for (let i = 0; i < outer.length; i++) {
          const [lx, lz] = toLocalXZ(outer[i][0], outer[i][1]);
          flatOuter.push(Math.round(lx * 10) / 10, Math.round(lz * 10) / 10);
          if (lx < minX) minX = lx;
          if (lx > maxX) maxX = lx;
          if (lz < minZ) minZ = lz;
          if (lz > maxZ) maxZ = lz;
        }

        const bcx = (minX + maxX) * 0.5;
        const bcz = (minZ + maxZ) * 0.5;
        if (bcx < -500.0 || bcx >= 500.0 || bcz < -500.0 || bcz >= 500.0) continue;

        const dedupKey = `${Math.round((ox + bcx) * 0.5)},${Math.round((oz + bcz) * 0.5)},${Math.round(f.tags.render_min_height || 0)}`;
        if (seenBldgKeys.has(dedupKey)) continue;
        seenBldgKeys.add(dedupKey);

        const flatHoles = [];
        for (const hRing of poly.holes || []) {
          if (hRing.length < 3) continue;
          const fh = [];
          for (let i = 0; i < hRing.length; i++) {
            const [lx, lz] = toLocalXZ(hRing[i][0], hRing[i][1]);
            fh.push(Math.round(lx * 10) / 10, Math.round(lz * 10) / 10);
          }
          flatHoles.push(fh);
        }

        const spanW = maxX - minX;
        const spanD = maxZ - minZ;
        const approxArea = spanW * spanD;
        const bSeed = (((Math.round(ox + bcx) * 73856093) ^ (Math.round(oz + bcz) * 19349663) ^ ((f.id || bldgIdSeq) * 2654435761)) >>> 0);

        let rawH = Number(f.tags.render_height) || 0;
        const rawMinH = Math.max(0, Number(f.tags.render_min_height) || 0);
        if (rawH <= 2.5) {
          if (approxArea > 1800) rawH = 28 + (bSeed % 36);
          else if (approxArea > 600) rawH = 16 + (bSeed % 22);
          else rawH = 9 + (bSeed % 12);
        }
        if (rawH <= rawMinH + 2.0) rawH = rawMinH + 6.0;

        const levels = Math.max(1, Math.round(rawH / 3.4));
        const isPart = rawMinH > 0 ? 1 : 0;

        let styleKey;
        if (isBeijing && rawH <= 8.5 && Math.hypot(ox + bcx, oz + bcz) < 4200 && (bSeed % 10) < 5) {
          styleKey = "S23_shichahai_siheyuan";
        } else if (rawH >= 42.0) {
          styleKey = HIGH_RISE_STYLES[bSeed % HIGH_RISE_STYLES.length];
        } else if (rawH <= 20.0) {
          styleKey = MID_LOW_STYLES_GLOBAL[bSeed % MID_LOW_STYLES_GLOBAL.length];
        } else {
          styleKey = STYLE_24_KEYS[bSeed % 22];
        }

        if (approxArea < 16.0 && rawH < 12.0) continue;
        let bName = f.tags["name:en"] || f.tags.name_en || f.tags.name || "";
        let btype = f.tags.class || f.tags.building || "yes";

        // Spatially bind POI points and `housenumber` addresses inside or within 14m of building footprint
        if (!bName || btype === "yes") {
          let bestPoi = null;
          let bestPoiScore = -Infinity;
          let bestNamedPoi = null;
          let bestNamedPoiScore = -Infinity;
          for (let pIdx = 0; pIdx < chunkPois.length; pIdx++) {
            const p = chunkPois[pIdx];
            if (p.lx < minX - 14.0 || p.lx > maxX + 14.0 || p.lz < minZ - 14.0 || p.lz > maxZ + 14.0) continue;
            const inside = pointInFlatRingXZ(p.lx, p.lz, flatOuter);
            const dist = inside ? 0.0 : pointToFlatRingDistXZ(p.lx, p.lz, flatOuter);
            if (!inside && dist > 14.0) continue;
            const sc = p.priority * 10.0 - (inside ? 0.0 : dist * 5.5);
            if (sc > bestPoiScore) {
              bestPoiScore = sc;
              bestPoi = p;
            }
            if (p.name && sc > bestNamedPoiScore) {
              bestNamedPoiScore = sc;
              bestNamedPoi = p;
            }
          }
          if (bestPoi && btype === "yes" && bestPoi.btype) {
            btype = bestPoi.btype === "retail" && rawH > 36.0 ? "commercial" : bestPoi.btype;
          }
          if (!bName && bestNamedPoi && (bestNamedPoi.priority >= 68 || rawH <= 28.0)) {
            bName = bestNamedPoi.name;
          }
          if (!bName && chunkHousenumbers.length > 0) {
            let bestHn = null;
            let bestHnDist = 14.01;
            for (let hIdx = 0; hIdx < chunkHousenumbers.length; hIdx++) {
              const hn = chunkHousenumbers[hIdx];
              if (hn.lx < minX - 14.0 || hn.lx > maxX + 14.0 || hn.lz < minZ - 14.0 || hn.lz > maxZ + 14.0) continue;
              const inside = pointInFlatRingXZ(hn.lx, hn.lz, flatOuter);
              const dist = inside ? 0.0 : pointToFlatRingDistXZ(hn.lx, hn.lz, flatOuter);
              if (dist < bestHnDist) {
                bestHnDist = dist;
                bestHn = hn;
                if (inside) break;
              }
            }
            if (bestHn) {
              let nearStreet = "";
              let bestRoadD2 = 135.0 * 135.0;
              for (let sIdx = 0; sIdx < localStreetPts.length; sIdx++) {
                const sp = localStreetPts[sIdx];
                const d2 = (bestHn.lx - sp.lx) * (bestHn.lx - sp.lx) + (bestHn.lz - sp.lz) * (bestHn.lz - sp.lz);
                if (d2 < bestRoadD2) {
                  bestRoadD2 = d2;
                  nearStreet = sp.name;
                }
              }
              if (nearStreet) {
                bName = /[\u4e00-\u9fa5]/.test(nearStreet)
                  ? `${nearStreet}${bestHn.num}号`
                  : `${bestHn.num} ${nearStreet}`;
              } else {
                bName = `No. ${bestHn.num}`;
              }
            }
          }
          if (!bName && bestNamedPoi) {
            bName = bestNamedPoi.name;
          }
        }

        const bId = f.id || bldgIdSeq++;
        buildings.push({
          score: rawH * Math.sqrt(Math.max(16.0, approxArea)) + (bName ? 500 : 0),
          tuple: [
            bId,
            bName,
            btype,
            isPart,
            Math.round(rawH * 10) / 10,
            Math.round(rawMinH * 10) / 10,
            levels,
            styleKey,
            "flat",
            f.tags.colour || null,
            null,
            flatOuter,
            flatHoles,
          ],
        });
      }
    }
  }
  if (buildings.length > 420) {
    buildings.sort((a, b) => b.score - a.score);
    buildings.length = 420;
  }
  for (let i = 0; i < buildings.length; i++) {
    buildings[i] = buildings[i].tuple;
  }

  // 5. Extract `water_polys` and `water_lines`
  const water_polys = [];
  const water_lines = [];
  const seenWaterKeys = new Set();
  let waterIdSeq = (cx * 40 + cz) * 5000 + 1;

  for (const t of tiles) {
    for (const f of t.water || []) {
      if (f.type !== 3) continue;
      for (const poly of f.geom) {
        const rawOuter = [];
        for (let i = 0; i < poly.outer.length; i++) {
          const [lx, lz] = toLocalXZ(poly.outer[i][0], poly.outer[i][1]);
          rawOuter.push(lx, lz);
        }
        const clippedOuter = clipRingToBoxXZ(rawOuter, -502.0, 502.0);
        if (clippedOuter.length < 6) continue;

        let sx = 0, sz = 0;
        for (let i = 0; i < clippedOuter.length; i += 2) {
          sx += clippedOuter[i];
          sz += clippedOuter[i + 1];
        }
        const n = clippedOuter.length / 2;
        const wKey = `${Math.round(sx / n / 8)},${Math.round(sz / n / 8)},${ n }`;
        if (seenWaterKeys.has(wKey)) continue;
        seenWaterKeys.add(wKey);

        const clippedHoles = [];
        for (const hRing of poly.holes || []) {
          const rawH = [];
          for (let i = 0; i < hRing.length; i++) {
            const [lx, lz] = toLocalXZ(hRing[i][0], hRing[i][1]);
            rawH.push(lx, lz);
          }
          const ch = clipRingToBoxXZ(rawH, -502.0, 502.0);
          if (ch.length >= 6) clippedHoles.push(ch);
        }

        water_polys.push([waterIdSeq++, f.tags.name || "", clippedOuter, clippedHoles]);
      }
    }

    for (const f of t.waterway || []) {
      if (f.type !== 2) continue;
      if (f.tags.brunnel === "tunnel" || Number(f.tags.layer) < 0) continue;
      const wCls = f.tags.class || "river";
      const widthM = wCls === "river" ? 26.0 : wCls === "canal" ? 15.0 : 8.0;
      for (const line of f.geom) {
        const flatXZ = [];
        let inChunk = false;
        for (let i = 0; i < line.length; i++) {
          const [lx, lz] = toLocalXZ(line[i][0], line[i][1]);
          if (lx >= -520 && lx <= 520 && lz >= -520 && lz <= 520) inChunk = true;
          flatXZ.push(Math.round(lx * 10) / 10, Math.round(lz * 10) / 10);
        }
        if (inChunk && flatXZ.length >= 4) {
          water_lines.push([waterIdSeq++, wCls, f.tags.name || "", widthM, flatXZ]);
        }
      }
    }
  }

  // 6. Extract `parks` from `park`, `landuse`, and `landcover`
  const parks = [];
  const seenParkKeys = new Set();
  let parkIdSeq = (cx * 40 + cz) * 5000 + 1;
  const PARK_LANDUSE = new Set([
    "park", "grass", "cemetery", "pitch", "stadium", "recreation_ground", "garden", "village_green", "playground", "golf_course"
  ]);
  const PARK_LANDCOVER = new Set(["grass", "wood", "forest"]);

  for (const t of tiles) {
    const parkCandidates = [
      ...(t.park || []).filter((f) => f.type === 3),
      ...(t.landuse || []).filter((f) => f.type === 3 && PARK_LANDUSE.has(f.tags.class)),
      ...(t.landcover || []).filter((f) => f.type === 3 && PARK_LANDCOVER.has(f.tags.class)),
    ];
    for (const f of parkCandidates) {
      const ptype = f.tags.class === "pitch" || f.tags.class === "stadium" ? "pitch" : "park";
      for (const poly of f.geom) {
        const rawOuter = [];
        for (let i = 0; i < poly.outer.length; i++) {
          const [lx, lz] = toLocalXZ(poly.outer[i][0], poly.outer[i][1]);
          rawOuter.push(lx, lz);
        }
        const clipped = clipRingToBoxXZ(rawOuter, -500.0, 500.0);
        if (clipped.length < 6) continue;
        let sx = 0, sz = 0;
        for (let i = 0; i < clipped.length; i += 2) {
          sx += clipped[i];
          sz += clipped[i + 1];
        }
        const n = clipped.length / 2;
        const pKey = `${Math.round(sx / n / 12)},${Math.round(sz / n / 12)}`;
        if (seenParkKeys.has(pKey)) continue;
        seenParkKeys.add(pKey);
        parks.push([parkIdSeq++, f.tags.name || "", ptype, clipped]);
      }
    }
  }

  // 7. Synthesize `facilities` (traffic signals `tl`, crosswalks `cr`, highway gantry signs `mj`)
  const facilities = [];
  for (const info of intersectionNodes.values()) {
    if (info.isMotorway && info.isLink) {
      facilities.push(["mj", Math.round(info.lx * 10) / 10, info.y, Math.round(info.lz * 10) / 10]);
    } else if (info.deg >= 3 && info.y === 0) {
      facilities.push(["tl", Math.round((info.lx + 5.5) * 10) / 10, 0, Math.round((info.lz + 5.5) * 10) / 10]);
      facilities.push(["cr", Math.round((info.lx - 4.5) * 10) / 10, 0, Math.round(info.lz * 10) / 10]);
    }
  }

  return {
    roads,
    railways,
    buildings,
    water_polys,
    water_lines,
    parks,
    facilities,
    highwayJunctions,
    osm_trees: [],
    vegetation: { lat: centerLat, landcover: extractLandcoverPolys(tiles, toLocalXZ) }, // [feature/vegetation]
    places: extractPlaceFeatures(tiles, toLocalXZ, origin), // feature/places
  };
}

/**
 * Fetches Zoom-12 AWS Terrarium elevation PNG tiles covering [-20000m, +20000m] around (centerLat, centerLon)
 * and builds a 201x201 DEM state compatible with `environment.js` and `chunk_worker.js`.
 */
export async function fetchGlobalDem(centerLat, centerLon) {
  const origin = computeWorldOrigin(centerLat, centerLon);
  const { mPerDegLat, mPerDegLon, isBeijing } = origin;
  const gridSize = 201;
  const stepM = 200.0;
  const minWorld = -20000.0;

  if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") {
    return {
      gridSize,
      stepM,
      minWorld,
      baseAslM: 0,
      elevations: new Float32Array(gridSize * gridSize),
      osmPeaks: [],
      isBeijing,
    };
  }

  // Use Zoom-12 AWS Terrarium elevation PNG tiles covering [-20000m, +20000m]
  const z = 12;
  const minLat = centerLat - 20500.0 / mPerDegLat;
  const maxLat = centerLat + 20500.0 / mPerDegLat;
  const minLon = centerLon - 20500.0 / mPerDegLon;
  const maxLon = centerLon + 20500.0 / mPerDegLon;

  const [tx0, ty0] = latLonToTileXY(maxLat, minLon, z);
  const [tx1, ty1] = latLonToTileXY(minLat, maxLon, z);

  const tilePixelMap = new Map();
  const tasks = [];
  for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
    for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
      tasks.push(
        (async () => {
          try {
            const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const blob = await resp.blob();
            const bmp = await createImageBitmap(blob);
            const canvas =
              typeof OffscreenCanvas !== "undefined"
                ? new OffscreenCanvas(256, 256)
                : Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bmp, 0, 0);
            if (bmp.close) bmp.close();
            const imgData = ctx.getImageData(0, 0, 256, 256).data;
            tilePixelMap.set(`${tx}/${ty}`, imgData);
          } catch {
            // Ignore failed elevation tile
          }
        })()
      );
    }
  }
  await Promise.all(tasks);

  const sampleRawAsl = (lat, lon) => {
    const n = Math.pow(2, z);
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
    const latRad = (clampedLat * Math.PI) / 180.0;
    const fx = ((lon + 180.0) / 360.0) * n;
    const fy = ((1.0 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0) * n;
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const pixels = tilePixelMap.get(`${tx}/${ty}`);
    if (!pixels) return 0.0;
    const px = Math.max(0, Math.min(255, Math.floor((fx - tx) * 256)));
    const py = Math.max(0, Math.min(255, Math.floor((fy - ty) * 256)));
    const idx = (py * 256 + px) * 4;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    const elev = r * 256.0 + g + b / 256.0 - 32768.0;
    return Math.max(0.0, elev);
  };

  const baseAslM = sampleRawAsl(centerLat, centerLon);
  const elevations = new Array(gridSize * gridSize);
  let ptr = 0;
  for (let iz = 0; iz < gridSize; iz++) {
    const wz = minWorld + iz * stepM;
    const lat = centerLat - wz / mPerDegLat;
    for (let ix = 0; ix < gridSize; ix++) {
      const wx = minWorld + ix * stepM;
      const lon = centerLon + wx / mPerDegLon;
      const rel = sampleRawAsl(lat, lon) - baseAslM;
      elevations[ptr++] = Math.round(Math.max(-2.0, rel) * 10) / 10;
    }
  }

  return {
    gridSize,
    stepM,
    minWorld,
    baseAslM: Math.round(baseAslM * 10) / 10,
    elevations,
    osmPeaks: [],
    isBeijing,
  };
}

/**
 * Builds a dynamic global overview (macro arterials, water, parks, subways) around `worldOrigin`
 * from Zoom-12 OpenFreeMap tiles so the Horizon layer and World Map (`M`) work anywhere on Earth.
 */
export async function buildGlobalOverviewFromTiles(worldOrigin) {
  const { centerLat, centerLon, mPerDegLat, mPerDegLon } = worldOrigin;
  const z = 12;
  const spanM = 16000.0;
  const [tx0, ty0] = latLonToTileXY(centerLat + spanM / mPerDegLat, centerLon - spanM / mPerDegLon, z);
  const [tx1, ty1] = latLonToTileXY(centerLat - spanM / mPerDegLat, centerLon + spanM / mPerDegLon, z);

  const proms = [];
  for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
    for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
      proms.push(fetchDecodedMvtTile(z, tx, ty));
    }
  }
  const tiles = await Promise.all(proms);

  const toWorldXZ = (lat, lon) => [
    Math.round((lon - centerLon) * mPerDegLon),
    Math.round((centerLat - lat) * mPerDegLat),
  ];

  const arterials = [];
  const water = [];
  const parks = [];
  const subways = [];
  let seq = 1;

  for (const t of tiles) {
    for (const f of t.transportation || []) {
      if (f.type !== 2) continue;
      const cls = f.tags.class || "";
      if (cls === "rail" || cls === "transit") {
        for (const line of f.geom) {
          const flat = [];
          for (let i = 0; i < line.length; i++) {
            const [wx, wz] = toWorldXZ(line[i][0], line[i][1]);
            flat.push(wx, wz);
          }
          if (flat.length >= 4) subways.push([seq++, f.tags.name || "", "#0092d8", flat]);
        }
        continue;
      }
      if (cls !== "motorway" && cls !== "trunk" && cls !== "primary" && cls !== "secondary") continue;
      const isBridge = f.tags.brunnel === "bridge" || (f.tags.layer || 0) > 0 ? 1 : 0;
      const isTunnel = f.tags.brunnel === "tunnel" || (f.tags.layer || 0) < 0 ? 1 : 0;
      const layer = isBridge ? 1 : 0;
      const widthM = cls === "motorway" || cls === "trunk" ? 12.0 : 9.0;
      const rY = isBridge ? 6.0 : 0.0;
      for (const line of f.geom) {
        const flatXYZ = [];
        for (let i = 0; i < line.length; i++) {
          const [wx, wz] = toWorldXZ(line[i][0], line[i][1]);
          flatXYZ.push(wx, rY, wz);
        }
        if (flatXYZ.length >= 6) {
          arterials.push([seq++, cls, f.tags.name || "", widthM, isBridge, isTunnel, layer, flatXYZ]);
        }
      }
    }

    for (const f of t.water || []) {
      if (f.type !== 3) continue;
      for (const poly of f.geom) {
        const flat = [];
        for (let i = 0; i < poly.outer.length; i++) {
          const [wx, wz] = toWorldXZ(poly.outer[i][0], poly.outer[i][1]);
          flat.push(wx, wz);
        }
        if (flat.length >= 6) {
          water.push([seq++, f.tags.name || "", "poly", 0, flat]);
        }
      }
    }

    for (const f of t.park || []) {
      if (f.type !== 3) continue;
      for (const poly of f.geom) {
        const flat = [];
        for (let i = 0; i < poly.outer.length; i++) {
          const [wx, wz] = toWorldXZ(poly.outer[i][0], poly.outer[i][1]);
          flat.push(wx, wz);
        }
        if (flat.length >= 6) {
          parks.push([seq++, "park", flat, f.tags.name || ""]);
        }
      }
    }
  }

  return {
    meta: worldOrigin,
    bookmarks: [],
    arterials,
    water,
    parks,
    subways,
    stations: [],
    skyline: [],
  };
}

/**
 * Geocodes any global address, landmark, city, or "lat, lon" coordinate string.
 */
export async function searchAddress(query) {
  const q = (query || "").trim();
  if (!q) return QUICK_WORLD_DESTINATIONS;

  // 1. Direct "lat, lon" coordinate input
  const coordMatch = q.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
      return [
        {
          name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          street: `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
          city: "Custom Coordinates",
          lat,
          lon,
        },
      ];
    }
  }

  // 2. Match curated destinations first for instant response
  const ql = q.toLowerCase();
  const localMatches = QUICK_WORLD_DESTINATIONS.filter(
    (d) =>
      d.name.toLowerCase().includes(ql) ||
      d.nameZh.includes(q) ||
      d.street.toLowerCase().includes(ql) ||
      d.city.toLowerCase().includes(ql)
  );

  // 3. Query Photon (Komoot OpenStreetMap geocoder)
  try {
    const resp = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`);
    if (resp.ok) {
      const data = await resp.json();
      const results = [...localMatches];
      for (const feat of data.features || []) {
        const [lon, lat] = feat.geometry?.coordinates || [];
        if (typeof lat !== "number" || typeof lon !== "number") continue;
        const p = feat.properties || {};
        const primary = p.name || p.street || p.city || q;
        const city = [p.city || p.state || p.county, p.countrycode || p.country].filter(Boolean).join(", ");
        const street = p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : primary;
        results.push({
          name: city ? `${primary} · ${city}` : primary,
          street,
          city: city || p.country || "Earth",
          lat,
          lon,
        });
      }
      if (results.length > 0) return results.slice(0, 7);
    }
  } catch {
    // Fallback to Nominatim below
  }

  // 4. Fallback to Nominatim OpenStreetMap search
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6`
    );
    if (resp.ok) {
      const items = await resp.json();
      const results = [...localMatches];
      for (const it of items || []) {
        const lat = parseFloat(it.lat);
        const lon = parseFloat(it.lon);
        if (isNaN(lat) || isNaN(lon)) continue;
        const parts = (it.display_name || q).split(",").map((s) => s.trim());
        const primary = parts[0] || q;
        const city = parts.slice(1, 3).join(", ") || "Earth";
        results.push({
          name: `${primary} · ${city}`,
          street: primary,
          city,
          lat,
          lon,
        });
      }
      if (results.length > 0) return results.slice(0, 7);
    }
  } catch {
    // Ignore network error
  }

  return localMatches;
}

export const BEIJING_DEFAULT_ORIGIN = computeWorldOrigin(39.9087, 116.3975, "Beijing", "Chang\x27an Ave");
export const createWorldOrigin = computeWorldOrigin;
