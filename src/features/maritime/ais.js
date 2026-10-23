/**
 * [feature/ferries-ships] Live AIS from Fintraffic Digitraffic (keyless, CORS `*`, open data CC 4.0 BY):
 *   https://meri.digitraffic.fi/api/ais/v1/locations?latitude=&longitude=&radius=   (km)
 *   https://meri.digitraffic.fi/api/ais/v1/vessels                                     (static data)
 * Coverage is the Finnish AIS network (Baltic / Gulf of Finland / Bothnia). Elsewhere every common AIS
 * feed (aisstream.io, MarineTraffic, VesselFinder, AISHub...) needs a key, so callers simulate instead.
 */
const BASE = 'https://meri.digitraffic.fi/api/ais/v1';

export function aisCovers(lat, lon) {
  return lat >= 58.5 && lat <= 66.2 && lon >= 19.0 && lon <= 30.5;
}

let vesselMeta = null; // mmsi -> { name, shipType, length, beam }

async function getJson(url, timeoutMs = 9000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadMeta() {
  if (vesselMeta) return vesselMeta;
  const arr = await getJson(`${BASE}/vessels`, 15000);
  const m = new Map();
  if (Array.isArray(arr)) {
    for (const v of arr) {
      const length = (v.referencePointA || 0) + (v.referencePointB || 0);
      const beam = (v.referencePointC || 0) + (v.referencePointD || 0);
      m.set(v.mmsi, { name: (v.name || '').trim(), shipType: v.shipType | 0, length, beam });
    }
  }
  vesselMeta = m;
  return m;
}

/** Maps AIS ship type + size to one of our vessel models. */
export function modelFor(meta) {
  const t = meta ? meta.shipType : 0;
  const L = meta ? meta.length : 0;
  if (t === 36 || t === 37) return 'sailboat';
  if (t === 31 || t === 32 || t === 52 || t === 50 || t === 53 || t === 30) return 'tug';
  if (t >= 60 && t <= 69) return L > 70 ? 'carferry' : 'ferry';
  if (t >= 80 && t <= 89) return 'tanker';
  if (t >= 70 && t <= 79) return L > 0 && L < 60 ? 'tug' : 'container';
  if (L >= 120) return 'container';
  if (L >= 45) return 'carferry';
  return L > 0 && L < 18 ? 'sailboat' : 'tug';
}

/**
 * Fetches live positions around (lat, lon). Returns [{ mmsi, lat, lon, sog (m/s), cog (rad), heading (rad),
 * model, name, length, t }] or null on failure.
 */
export async function fetchAis(lat, lon, radiusKm = 22) {
  const [meta, loc] = await Promise.all([
    loadMeta(),
    getJson(`${BASE}/locations?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&radius=${radiusKm}`),
  ]);
  if (!loc || !Array.isArray(loc.features)) return null;
  const now = Date.now();
  const out = [];
  for (const f of loc.features) {
    const p = f.properties || {};
    const c = f.geometry && f.geometry.coordinates;
    if (!c) continue;
    const ts = p.timestampExternal || now;
    if (now - ts > 30 * 60 * 1000) continue; // stale
    const m = meta.get(p.mmsi);
    const cog = ((p.cog || 0) * Math.PI) / 180;
    const hdg = p.heading != null && p.heading < 360 ? (p.heading * Math.PI) / 180 : cog;
    out.push({
      mmsi: p.mmsi,
      lat: c[1],
      lon: c[0],
      sog: Math.min(25, (p.sog || 0) * 0.514444),
      cog,
      heading: hdg,
      model: modelFor(m),
      name: m ? m.name : '',
      length: m ? m.length : 0,
      t: ts,
    });
  }
  return out;
}
