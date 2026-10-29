/**
 * [live-ships] Live vessel positions. Every source here is keyless and callable from the browser
 * (verified with an Origin header); each returns the same normalised record:
 *   { id, lat, lon, sog (m/s or null), cog (rad or null), heading (rad or null), model, livery, name,
 *     length, beam, t (ms) }
 *
 *  - Fintraffic Digitraffic: full AIS (every ship), Finnish waters / Gulf of Finland / Bothnia. CORS `*`,
 *    CC BY 4.0. https://meri.digitraffic.fi/api/ais/v1/locations + /vessels (static data: type, size).
 *  - Entur (Norway's national journey planner): live positions of Norwegian public-transport ferries.
 *    CORS `*`, NLOD. GraphQL https://api.entur.io/realtime/v2/vehicles/graphql (mode FERRY + bbox).
 *  - WSDOT Washington State Ferries: live vessel positions in Puget Sound. No CORS header, but the API
 *    answers JSONP (`?callback=`), so it loads through a <script> tag.
 *
 * Everywhere else the optional same-origin relay in server.py (GET api/ships, advertised with an
 * `X-Live-Ships` header) can add aisstream.io (global AIS; needs a free key set on the server, since
 * aisstream refuses browser connections) and GTFS-realtime ferry feeds without CORS (NYC Ferry,
 * Brisbane CityCat). Without a source the caller simulates traffic instead.
 */
const DT_BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const ENTUR_URL = 'https://api.entur.io/realtime/v2/vehicles/graphql';
const WSF_URL = 'https://www.wsdot.wa.gov/ferries/api/vessels/rest/vessellocations';
const KN = 0.514444;
const DEG = Math.PI / 180;
const STALE_MS = 30 * 60 * 1000;

async function getJson(url, timeoutMs = 9000, init = undefined) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, { ...(init || {}), ...(ctl ? { signal: ctl.signal } : {}) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let jsonpSeq = 0;
/** JSONP for APIs that answer `callback(...)` but send no CORS header. */
function jsonp(url, timeoutMs = 9000) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const cb = `__weShips${++jsonpSeq}`;
    const s = document.createElement('script');
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { delete window[cb]; } catch { window[cb] = undefined; }
      s.remove();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window[cb] = (data) => finish(data);
    s.onerror = () => finish(null);
    s.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.head.appendChild(s);
  });
}

function hash01(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/**
 * Maps an AIS ship type + size to one of our vessel models (and a livery hint for patrol boats).
 * meta: { shipType, length, beam, id }
 */
export function modelFor(meta) {
  const t = meta ? meta.shipType | 0 : 0;
  const L = meta ? meta.length || 0 : 0;
  const h = hash01(meta ? meta.id : 0);
  if (t === 30) return ['fishing'];
  if (t === 31 || t === 32 || t === 52 || t === 53 || t === 54 || t === 34) return ['tug'];
  if (t === 33) return [L > 70 ? 'cargo' : 'tug'];
  if (t === 35) return ['patrol', 'navy'];
  if (t === 55) return ['patrol', 'police'];
  if (t === 51 || t === 58) return ['patrol', 'sar'];
  if (t === 50) return ['patrol', 'pilot'];
  if (t === 36) return ['sailboat'];
  if (t === 37) return [L >= 25 ? 'speedboat' : h < 0.55 ? 'sailboat' : 'speedboat'];
  if (t >= 40 && t <= 49) return ['ferry'];
  if (t >= 60 && t <= 69) return [L > 0 && L < 70 ? 'ferry' : 'carferry'];
  if (t >= 80 && t <= 89) return ['tanker'];
  if (t >= 70 && t <= 79) return [L >= 200 ? 'container' : L > 0 && L < 90 ? 'cargo' : h < 0.55 ? 'container' : 'cargo'];
  // Other / unknown types: big hulls are cargo ships; mid-size ones (icebreakers, research and work vessels,
  // offshore supply) read best as a scaled-up tug.
  if (L >= 150) return [h < 0.5 ? 'container' : 'cargo'];
  if (L >= 120) return ['cargo'];
  if (L >= 18) return ['tug'];
  return [L > 0 ? 'speedboat' : 'tug'];
}

// ------------------------------------------------------------------ Digitraffic (Finland, full AIS)
let dtMeta = null; // mmsi -> { name, shipType, length, beam }
let dtMetaT = 0;
async function dtLoadMeta() {
  if (dtMeta && Date.now() - dtMetaT < 6 * 3600e3) return dtMeta;
  const arr = await getJson(`${DT_BASE}/vessels`, 15000);
  const m = dtMeta || new Map();
  if (Array.isArray(arr)) {
    for (const v of arr) {
      const length = (v.referencePointA || 0) + (v.referencePointB || 0);
      const beam = (v.referencePointC || 0) + (v.referencePointD || 0);
      m.set(v.mmsi, { name: (v.name || '').trim(), shipType: v.shipType | 0, length, beam });
    }
    dtMetaT = Date.now();
  }
  dtMeta = m;
  return m;
}

async function fetchDigitraffic(lat, lon, radiusKm) {
  const [meta, loc] = await Promise.all([
    dtLoadMeta(),
    getJson(`${DT_BASE}/locations?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&radius=${radiusKm}`),
  ]);
  if (!loc || !Array.isArray(loc.features)) return null;
  const now = Date.now();
  const out = [];
  for (const f of loc.features) {
    const p = f.properties || {};
    const c = f.geometry && f.geometry.coordinates;
    if (!c) continue;
    const ts = p.timestampExternal || now;
    if (now - ts > STALE_MS) continue;
    const m = meta.get(p.mmsi);
    const cog = p.cog != null && p.cog < 360 ? p.cog * DEG : null;
    const hdg = p.heading != null && p.heading < 360 ? p.heading * DEG : cog;
    const [model, livery] = modelFor(m ? { ...m, id: p.mmsi } : { id: p.mmsi });
    out.push({
      id: `fi${p.mmsi}`, lat: c[1], lon: c[0], sog: p.sog != null && p.sog < 102.3 ? Math.min(25, p.sog * KN) : null,
      cog, heading: hdg, model, livery, name: m ? m.name : '', length: m ? m.length : 0, beam: m ? m.beam : 0, t: ts,
    });
  }
  return out;
}

// ------------------------------------------------------------------ Entur (Norway, public ferries)
async function fetchEntur(lat, lon, radiusKm) {
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.max(0.2, Math.cos(lat * DEG)));
  const q = `{ vehicles(mode: FERRY, boundingBox: {minLat: ${(lat - dLat).toFixed(4)}, minLon: ${(lon - dLon).toFixed(4)}, maxLat: ${(lat + dLat).toFixed(4)}, maxLon: ${(lon + dLon).toFixed(4)}}) { vehicleId lastUpdated location { latitude longitude } bearing speed line { lineName } } }`;
  const d = await getJson(ENTUR_URL, 9000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  const list = d && d.data && d.data.vehicles;
  if (!Array.isArray(list)) return null;
  const now = Date.now();
  const out = [];
  for (const v of list) {
    const loc = v.location;
    if (!loc || loc.latitude == null) continue;
    const t = Date.parse(v.lastUpdated) || now;
    if (now - t > STALE_MS) continue;
    const hdg = v.bearing != null ? v.bearing * DEG : null;
    out.push({
      id: `no${v.vehicleId}`, lat: loc.latitude, lon: loc.longitude, sog: v.speed != null ? v.speed : null, cog: hdg, heading: hdg,
      model: 'carferry', name: (v.line && v.line.lineName) || '', length: 95, beam: 17, t,
    });
  }
  return out;
}

// ------------------------------------------------------------------ WSDOT (Puget Sound ferries)
async function fetchWsf() {
  const arr = await jsonp(WSF_URL);
  if (!Array.isArray(arr)) return null;
  const now = Date.now();
  const out = [];
  for (const v of arr) {
    if (v.Latitude == null || v.Longitude == null || v.InService === false) continue;
    const m = /Date\((\d+)/.exec(v.TimeStamp || '');
    const t = m ? +m[1] : now;
    if (now - t > STALE_MS) continue;
    const hdg = v.Heading != null ? v.Heading * DEG : null;
    out.push({
      id: `wsf${v.VesselID}`, lat: v.Latitude, lon: v.Longitude, sog: (v.Speed || 0) * KN, cog: hdg, heading: hdg,
      model: 'carferry', name: v.VesselName || '', length: 110, beam: 26, t,
    });
  }
  return out;
}

/** Browser-direct providers, first match wins. `full` = every vessel (AIS), not just ferries. */
export const PROVIDERS = [
  {
    id: 'digitraffic', name: 'Fintraffic Digitraffic', full: true, poll: 30,
    covers: (lat, lon) => lat >= 58.5 && lat <= 66.2 && lon >= 19.0 && lon <= 30.5,
    fetch: (lat, lon) => fetchDigitraffic(lat, lon, 22),
  },
  {
    id: 'entur', name: 'Entur', full: false, poll: 15,
    covers: (lat, lon) => lat >= 57.8 && lat <= 71.5 && lon >= 4.0 && lon <= 31.5 && !(lon > 11.2 && lat < 59.2),
    fetch: (lat, lon) => fetchEntur(lat, lon, 25),
  },
  {
    id: 'wsf', name: 'WSDOT Ferries', full: false, poll: 20,
    covers: (lat, lon) => lat >= 47.0 && lat <= 49.0 && lon >= -123.4 && lon <= -122.1,
    fetch: () => fetchWsf(),
  },
];

export function providerFor(lat, lon) {
  return PROVIDERS.find((p) => p.covers(lat, lon)) || null;
}

/** Back-compat helpers. */
export function aisCovers(lat, lon) {
  return !!providerFor(lat, lon);
}

let relayProbe = null;
/** True when the page is served by server.py with the api/ships relay (X-Live-Ships header). */
export function detectShipRelay() {
  if (relayProbe) return relayProbe;
  relayProbe = (async () => {
    if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return false;
    try {
      const r = await fetch(location.pathname || '/', { method: 'HEAD', cache: 'no-store' });
      return r.headers.get('X-Live-Ships') === '1';
    } catch {
      return false;
    }
  })();
  return relayProbe;
}

/**
 * Relay: GET api/ships?lat&lon -> { source, full, ships: [[id, name, lat, lon, sog m/s|null, cog deg|null,
 * heading deg|null, shipType, length, beam, ageS], ...] }. Returns { name, full, list } or null.
 */
export async function fetchRelay(lat, lon) {
  const d = await getJson(`api/ships?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, 12000, { cache: 'no-store' });
  if (!d || !Array.isArray(d.ships) || !d.source || d.source === 'none') return null;
  const now = Date.now();
  const list = [];
  for (const s of d.ships) {
    const [id, name, la, lo, sog, cog, hdg, type, length, beam, age] = s;
    if (la == null || lo == null) continue;
    const meta = { shipType: type | 0, length: length || 0, beam: beam || 0, id };
    let [model, livery] = modelFor(meta);
    if (d.ferries) model = (length || 0) >= 70 ? 'carferry' : 'ferry';
    const h = hdg != null && hdg < 360 ? hdg * DEG : cog != null && cog < 360 ? cog * DEG : null;
    list.push({
      id: `r${id}`, lat: la, lon: lo, sog: sog != null ? Math.min(25, sog) : null, cog: cog != null && cog < 360 ? cog * DEG : null, heading: h,
      model, livery, name: name || '', length: length || 0, beam: beam || 0, t: now - (age || 0) * 1000,
    });
  }
  return { name: d.source, full: !!d.full, list };
}
