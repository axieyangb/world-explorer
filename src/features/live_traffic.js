import * as THREE from '../../vendor/three.module.js';
import { decodeMvtTile, latLonToTileXY } from '../global_tiles.js';
import { lonToMx, latToMy } from './map_tiles.js';
import { getLang } from '../i18n.js';

/**
 * [live-traffic] Congestion layer for the AI traffic (city_traffic.js). Every lane-graph direction gets
 * a speed ratio (0..1 of free flow) and a density multiplier; the sim uses them for spawn density,
 * target speed, smooth slow-downs and stop-and-go queues on slow stretches. Sources, layered:
 *  1. Typical pattern, everywhere, no network: local civil time + weekday/weekend (atmosphere clock and
 *     utcOffsetH from live weather), road class, how urban the chunk is (road density) and rain.
 *     Weekday rush hours jam the arterials (each direction gets its own morning/evening peak), 3 am is empty.
 *  2. Keyless live feeds (CORS `*`, fetched straight from the browser, only while the player is in that city):
 *     - NYC DOT real-time link speeds (Socrata i4gi-tjb9): expressway/bridge links, speed in mph.
 *     - TfL (London): corridor status (Good/Moderate/Serious/Severe) slows the A-roads in its bounds, and
 *       active roadworks/incidents from /Road/all/Disruption put cones on the nearest road and slow it.
 *     - Hong Kong Transport Department detectors (data.gov.hk raw speed/volume, every 30 s), placed with
 *       the detector location table.
 *     Rows older than 30 min count as stale and are ignored.
 *  3. TomTom Traffic Flow vector tiles (relative flow), worldwide, only with a key the user pastes into
 *     the time & weather menu (localStorage only; off without one). Tiles at z14 around the player, cached
 *     3 min, at most 120 requests an hour, exponential back-off on errors, disabled on 401/403.
 * Live data only applies while the clock follows real time; a picked time (menu, ?time=, setTime) uses
 * the typical pattern for that hour. ?traffic=live|typical|off overrides the menu choice (off = the old
 * synthetic traffic). Any failure falls back silently to the typical pattern.
 * Debug handle: window.__LIVE_TRAFFIC__ = { state(), setMode(m), setDay(d), refresh() }.
 */

const STALE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const CELL = 32;
const OBS_SPAN = 4200; // live samples kept within this of the player (rebuilt as the player moves)
const MAX_CONES = 260;
const TT_Z = 14;
const TT_TTL_MS = 180 * 1000;
const TT_HOURLY_CAP = 120;
const LS_MODE = 'we.traffic.mode';
const LS_KEY = 'we.traffic.tomtomKey';
const LS_OVERLAY = 'we.traffic.overlay';

// Sim free-flow speed (m/s) by traffic class code = city_traffic CAR_SPEED; observed speeds are judged against
// what a car would do on an empty road of that class.
export const FREE_FLOW = [25, 20, 14, 12.5, 11, 8, 6, 12, 0, 0];
// How hard each class jams at full rush: motorway, trunk, primary, secondary, tertiary, residential, service, link.
const JAM_CAP = [0.88, 0.82, 0.6, 0.48, 0.36, 0.12, 0.05, 0.7, 0, 0];
// Live sensor feeds (NYC DOT, HK detectors) sit on expressways, bridges and arterials only.
const HIGHWAY_CLS = [true, true, true, false, false, false, false, true, false, false];

// Weekday / weekend demand by local hour (0..24), 1 = rush-hour peak.
const WEEKDAY = [0.17, 0.11, 0.08, 0.07, 0.09, 0.2, 0.46, 0.84, 1.0, 0.86, 0.68, 0.66, 0.7, 0.7, 0.72, 0.82, 0.93, 1.0, 0.94, 0.72, 0.54, 0.44, 0.34, 0.24, 0.17];
const WEEKEND = [0.3, 0.22, 0.15, 0.1, 0.08, 0.09, 0.13, 0.22, 0.34, 0.48, 0.6, 0.68, 0.72, 0.73, 0.72, 0.7, 0.68, 0.66, 0.62, 0.56, 0.5, 0.46, 0.42, 0.36, 0.3];

const TFL_SEV = { Good: 1, Moderate: 0.88, Serious: 0.72, Severe: 0.5 }; // a whole corridor's box: keep it gentle
const TFL_WORK_SEV = { Minimal: 0.72, Moderate: 0.5, Serious: 0.3, Severe: 0.18 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const inBox = (lat, lon, b) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function curve(tab, h) {
  const i = Math.floor(h), f = h - i;
  return tab[i % 24] + (tab[(i + 1) % 25] - tab[i % 24]) * f;
}

/** Deterministic 0..1 hash of a position (per-edge jam variety that stays put across refreshes). */
function hash01(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 0..1 value noise (cell size s metres): neighbouring road pieces get similar jam levels. */
function vnoise(x, z, s) {
  const gx = x / s, gz = z / s, ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iz), b = hash01(ix + 1, iz), c = hash01(ix, iz + 1), d = hash01(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

async function getJson(url, text = false, signal) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: signal || ac.signal });
    if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
    return text ? await r.text() : await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** UTC offset (ms) of an IANA zone at a moment; 0 when Intl can't tell. */
function zoneOffsetMs(tz, date = new Date()) {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) p[x.type] = x.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
  } catch { return 0; }
}
const floatingIso = (ms) => new Date(ms).toISOString().slice(0, 19);

/** Google encoded polyline -> [[lat, lon]]. */
function decodePolyline(s) {
  const out = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    let b, sh = 0, r = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32 && i < s.length);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    sh = 0; r = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32 && i < s.length);
    lon += r & 1 ? ~(r >> 1) : r >> 1;
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1) rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Keyless city feeds. Each returns { lines: [{ pts:[[lat,lon]..], ms?, ratio?, R, hw }], corridors, works, at }.
// ---------------------------------------------------------------------------------------------

async function fetchNyc() {
  const nyOff = zoneOffsetMs('America/New_York');
  const since = floatingIso(Date.now() + nyOff - STALE_MS);
  const url = 'https://data.cityofnewyork.us/resource/i4gi-tjb9.json?$limit=1000&$order=data_as_of%20DESC' +
    '&$where=' + encodeURIComponent(`data_as_of > '${since}'`);
  const rows = await getJson(url);
  const latest = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const t = Date.parse(String(r.data_as_of || '').slice(0, 19) + 'Z') - nyOff; // floating New York time
    if (!Number.isFinite(t) || Date.now() - t > STALE_MS) continue;
    const prev = latest.get(r.link_id);
    if (!prev || prev.t < t) latest.set(r.link_id, { r, t });
  }
  const lines = [];
  let at = 0;
  for (const { r, t } of latest.values()) {
    const mph = parseFloat(r.speed);
    if (String(r.status) !== '0' || !Number.isFinite(mph) || mph <= 0) continue; // -101 = no reading
    // link_points is truncated by the API; the encoded polyline is whole (its backslashes come doubled)
    const lp = String(r.link_points || '').trim().split(/\s+/).map((s) => s.split(',').map(Number))
      .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) > 1 && Math.abs(p[1]) > 1);
    let pts = r.encoded_poly_line ? decodePolyline(String(r.encoded_poly_line).replace(/\\\\/g, '\\')) : [];
    if (!pts.length || !lp.length || Math.abs(pts[0][0] - lp[0][0]) > 2e-3 || Math.abs(pts[0][1] - lp[0][1]) > 2e-3 || pts.length < lp.length) pts = lp.slice(0, -1);
    if (pts.length < 2) continue;
    lines.push({ pts, ms: mph * 0.44704, R: 24, hw: true, name: r.link_name });
    at = Math.max(at, t);
  }
  return { lines, at: at || null };
}

async function fetchTfl() {
  const [roads, dis] = await Promise.all([
    getJson('https://api.tfl.gov.uk/Road').catch(() => null),
    getJson('https://api.tfl.gov.uk/Road/all/Disruption').catch(() => null),
  ]);
  if (!roads && !dis) throw new Error('tfl down');
  const corridors = [];
  for (const c of Array.isArray(roads) ? roads : []) {
    const mul = TFL_SEV[c.statusSeverity];
    if (!mul || mul >= 1) continue;
    try {
      const b = JSON.parse(c.bounds); // [[lon,lat],[lon,lat]]
      corridors.push({ box: [Math.min(b[0][1], b[1][1]), Math.min(b[0][0], b[1][0]), Math.max(b[0][1], b[1][1]), Math.max(b[0][0], b[1][0])], mul, name: c.displayName });
    } catch { /* malformed bounds */ }
  }
  const works = [];
  const now = Date.now();
  let at = 0;
  for (const d of Array.isArray(dis) ? dis : []) {
    if (!/^Active/.test(d.status || '')) continue;
    const mul = TFL_WORK_SEV[d.severity];
    if (!mul) continue;
    const s = Date.parse(d.startDateTime), e = Date.parse(d.endDateTime);
    if ((Number.isFinite(s) && s > now) || (Number.isFinite(e) && e < now)) continue;
    let p = null;
    try { p = JSON.parse(d.point); } catch { /* no point */ }
    if (!Array.isArray(p) || !Number.isFinite(p[1])) continue;
    works.push({ lat: p[1], lon: p[0], mul, cones: d.category !== 'Hazards', kind: d.category, text: d.location });
    at = Math.max(at, Date.parse(d.lastModifiedTime) || 0);
  }
  return { lines: [], corridors, works, at: roads ? now : at || now };
}

let hkSites = null; // detector id -> [lat, lon, headingRad], fetched once a session
async function fetchHk() {
  if (!hkSites) {
    const csv = await getJson('https://static.data.gov.hk/td/traffic-data-strategic-major-roads/info/traffic_speed_volume_occ_info.csv', true);
    const rows = parseCsv(csv.replace(/^﻿/, ''));
    const h = rows[0] || [];
    const ci = (n) => h.indexOf(n);
    const iId = ci('AID_ID_Number'), iLa = ci('Latitude'), iLo = ci('Longitude'), iRot = ci('Rotation');
    const m = new Map();
    for (const r of rows.slice(1)) {
      const la = parseFloat(r[iLa]), lo = parseFloat(r[iLo]), rot = parseFloat(r[iRot]);
      if (Number.isFinite(la) && Number.isFinite(lo) && Number.isFinite(rot)) m.set(String(r[iId]).trim(), [la, lo, rot * Math.PI / 180]);
    }
    if (!m.size) throw new Error('hk sites');
    hkSites = m;
  }
  const xml = await getJson('https://resource.data.one.gov.hk/td/traffic-detectors/rawSpeedVol-all.xml', true);
  const date = (xml.match(/<date>([\d-]+)<\/date>/) || [])[1];
  const best = new Map();
  for (const per of xml.split('<period>').slice(1)) {
    const to = (per.match(/<period_to>([\d:]+)<\/period_to>/) || [])[1];
    const t = Date.parse(`${date}T${to}+08:00`);
    if (!Number.isFinite(t) || Date.now() - t > STALE_MS) continue;
    const reDet = /<detector_id>([^<]+)<\/detector_id>([\s\S]*?)<\/detector>/g;
    let m;
    while ((m = reDet.exec(per))) {
      const prev = best.get(m[1]);
      if (prev && prev.t >= t) continue;
      let sw = 0, vw = 0;
      const reLane = /<speed>([\d.]+)<\/speed>[\s\S]*?<volume>([\d.]+)<\/volume>[\s\S]*?<valid>([YN])<\/valid>/g;
      let l;
      while ((l = reLane.exec(m[2]))) {
        if (l[3] !== 'Y') continue;
        const w = 1 + parseFloat(l[2]);
        sw += parseFloat(l[1]) * w; vw += w;
      }
      if (vw > 0) best.set(m[1], { t, kmh: sw / vw });
    }
  }
  const lines = [];
  let at = 0;
  for (const [id, { t, kmh }] of best) {
    const s = hkSites.get(id);
    if (!s || kmh <= 0) continue;
    const dLat = Math.cos(s[2]) * 35 / 111000, dLon = Math.sin(s[2]) * 35 / (111000 * Math.cos(s[0] * Math.PI / 180));
    lines.push({ pts: [[s[0] - dLat, s[1] - dLon], [s[0] + dLat, s[1] + dLon]], ms: kmh / 3.6, R: 30, hw: true });
    at = Math.max(at, t);
  }
  return { lines, at: at || null };
}

const FEEDS = [
  { id: 'nyc', name: 'NYC DOT', box: [40.45, -74.3, 40.95, -73.65], every: 120, fetch: fetchNyc },
  { id: 'tfl', name: 'Powered by TfL Open Data', box: [51.25, -0.56, 51.72, 0.34], every: 300, fetch: fetchTfl },
  { id: 'hk', name: 'HK Transport Dept', box: [22.13, 113.82, 22.58, 114.45], every: 120, fetch: fetchHk },
];

// ---------------------------------------------------------------------------------------------
// Road-works cone: lathed body with a reflective collar on a square foot (~180 triangles).
// ---------------------------------------------------------------------------------------------
function createConeMesh() {
  const O = 0, W = 1; // orange / white per profile point; doubled points give crisp reflective bands
  const prof = [[0.13, 0.04, O], [0.118, 0.12, O], [0.1, 0.27, O], [0.1, 0.27, W], [0.086, 0.36, W], [0.086, 0.36, O],
    [0.076, 0.42, O], [0.076, 0.42, W], [0.063, 0.5, W], [0.063, 0.5, O], [0.03, 0.68, O], [0.001, 0.7, O]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  body.computeVertexNormals();
  const foot = new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0);
  const tone = [new THREE.Color(0xff5a12), new THREE.Color(0xf2f2ee)], black = new THREE.Color(0x1b1b1b);
  const pos = [], nor = [], col = [], idx = [];
  for (const g of [foot, body]) {
    const base = pos.length / 3;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = g === foot ? black : tone[prof[i % prof.length][2]];
      col.push(c.r, c.g, c.b);
    }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(base + ix[i]);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_CONES);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.name = 'live_traffic_cones';
  return mesh;
}

/** Point + travel direction at arc length s along a lane-graph edge (edge order). */
function edgeAt(e, s, out) {
  const cum = e.cum, p = e.pts, n = e.n;
  s = clamp(s, 0, e.len);
  let i = 0;
  while (i < n - 2 && cum[i + 1] < s) i++;
  const j = i * 3, L = cum[i + 1] - cum[i] || 1e-6, t = clamp((s - cum[i]) / L, 0, 1);
  const dx = p[j + 3] - p[j], dz = p[j + 5] - p[j + 2];
  out.x = p[j] + dx * t; out.y = p[j + 1] + (p[j + 4] - p[j + 1]) * t; out.z = p[j + 2] + dz * t;
  out.ux = dx / L; out.uz = dz / L;
  return out;
}

export class LiveTraffic {
  constructor(app, traffic) {
    this.app = app;
    this.traffic = traffic;
    const q = new URLSearchParams(window.location.search).get('traffic');
    this.urlMode = ['live', 'typical', 'off'].includes(q) ? q : null;
    const saved = store.get(LS_MODE);
    this.mode = this.urlMode || (['live', 'typical', 'off'].includes(saved) ? saved : 'live');
    this.overlay = store.get(LS_OVERLAY) === '1';
    this.ttKey = store.get(LS_KEY) || '';
    this.gen = 1;
    this.demand = 1;
    this._busy = 1;
    this.jam = 0;
    this.rain = 0;
    this.dayOverride = null;
    this.hour = 12;
    this.weekend = false;
    this.liveOn = false;
    this.feedState = new Map(); // feed id -> { data, nextAt, fails, inFlight, at, ok }
    this.tt = { tiles: new Map(), nextAt: 0, fails: 0, inFlight: 0, hour: 0, count: 0, err: '', at: 0 };
    this.cells = new Map();
    this.corridors = [];
    this.works = [];
    this._workDirs = [];
    this.obsCenter = null;
    this.obsDirty = true;
    this._demandT = 0;
    this._feedT = 0;
    this._worksT = 0;
    this._worksEdges = -1;
    this._uiT = 0;
    this._lastOrigin = null;
    this._ov = null;
    this._ovT = 0;
    this._s = { x: 0, y: 0, z: 0, ux: 0, uz: 0 };
    this.cones = createConeMesh();
    traffic.group.add(this.cones);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3(1.25, 1.25, 1.25); // ~0.9 m works cones
    this._axis = new THREE.Vector3(0, 1, 0);
    app.liveTraffic = this;
    window.__LIVE_TRAFFIC__ = {
      state: () => this.state(),
      setMode: (m) => this.setMode(m),
      setDay: (d) => { this.dayOverride = d == null ? null : ((d | 0) % 7 + 7) % 7; this._demandT = 0; },
      refresh: () => { for (const s of this.feedState.values()) s.nextAt = 0; this.tt.nextAt = 0; for (const t of this.tt.tiles.values()) t.at = 0; },
    };
  }

  // ---------------- clock / typical pattern ----------------

  /** Local civil hour + weekday (0 = Sunday) from the atmosphere clock. */
  _clock() {
    const atmo = this.app.atmosphere;
    const o = this.app.worldOrigin || {};
    const off = atmo && atmo.utcOffsetH !== null && Number.isFinite(atmo.utcOffsetH) ? atmo.utcOffsetH : Math.round((o.centerLon || 0) / 15);
    const d = new Date();
    const local = new Date(d.getTime() + off * 3600000);
    let hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    let wd = local.getUTCDay();
    const real = !atmo || (atmo.realtime && atmo.targetHour === null);
    if (atmo && !real) {
      const h = atmo.targetHour !== null && Number.isFinite(atmo.targetHour) ? atmo.targetHour : atmo.hour;
      if (Number.isFinite(h)) hour = ((h % 24) + 24) % 24;
      wd = (wd + (atmo.elapsedDays | 0)) % 7;
    }
    if (this.dayOverride !== null) wd = this.dayOverride;
    return { hour, wd, real };
  }

  _updateDemand() {
    const { hour, wd, real } = this._clock();
    const weekend = wd === 0 || wd === 6;
    let D = curve(weekend ? WEEKEND : WEEKDAY, hour);
    if (wd === 5 && hour > 19) D = Math.max(D, 0.55 - (hour - 19) * 0.04); // Friday night out
    const atmo = this.app.atmosphere;
    const rain = atmo && Number.isFinite(atmo.rain) ? atmo.rain : 0;
    D *= 1 + 0.08 * rain;
    const jam = Math.pow(smooth01((D - 0.58) / 0.42), 1.2);
    const liveOn = this.mode === 'live' && real;
    const changed = Math.abs(D - this.demand) > 0.015 || Math.abs(jam - this.jam) > 0.015 || Math.abs(rain - this.rain) > 0.05 ||
      weekend !== this.weekend || liveOn !== this.liveOn;
    this.hour = hour;
    this.wd = wd;
    this.weekend = weekend;
    if (liveOn !== this.liveOn) this._worksEdges = -1; // cones only while live
    if (changed) {
      this.demand = D;
      this._busy = smooth01((D - 0.35) / 0.4);
      this.jam = jam;
      this.rain = rain;
      this.liveOn = liveOn;
      this.gen++;
    }
  }

  /** Typical-pattern speed ratio for one direction of an edge. */
  _typical(d) {
    let b = d._ltB;
    if (!b) { // static per direction: how bad this stretch gets and which way its commuter tide runs
      const e = d.e, p = e.pts, k = (e.n - 1) * 3, sgn = d.fwd ? 1 : -1;
      const mx = (p[0] + p[k]) * 0.5, mz = (p[2] + p[k + 2]) * 0.5;
      const urb = e.urb == null ? 0.5 : e.urb;
      // one heading peaks in the morning, the opposite one in the evening (smooth along a road)
      const hD = 0.5 + 0.5 * Math.sin(Math.atan2((p[k] - p[0]) * sgn, (p[k + 2] - p[2]) * sgn) + vnoise(mx + 5e4, mz - 3e4, 1800) * 6.283);
      b = d._ltB = {
        jam: JAM_CAP[e.cls] * (0.35 + 0.65 * urb) * (0.6 + 0.7 * vnoise(mx, mz, 650)),
        busy: JAM_CAP[e.cls] * urb * 0.16, // midday friction downtown
        am: 0.6 + 0.7 * hD, pm: 0.6 + 0.7 * (1 - hD),
      };
    }
    const tide = this.weekend ? 0.8 : this.hour < 13 ? b.am : b.pm;
    const r = 1 - b.jam * this.jam * tide - b.busy * this._busy;
    return clamp(r * (1 - 0.14 * this.rain), 0.07, 1);
  }

  // ---------------- per-direction state (cached per generation) ----------------

  /** Speed ratio (0..1 of free flow) for a lane-graph direction. */
  ratio(d) {
    if (this.mode === 'off') return 1;
    if (d._ltGen !== this.gen) this._eval(d);
    return d._ltR;
  }

  /** Spawn density multiplier for a lane-graph direction (time of day x how jammed it is). */
  density(d) {
    if (this.mode === 'off') return 1;
    if (d._ltGen !== this.gen) this._eval(d);
    return d._ltK;
  }

  _eval(d) {
    const e = d.e;
    let r = this._typical(d), src = 0;
    if (this.liveOn) {
      const lv = this._matchLive(d);
      if (lv !== null) { r = lv; src = 1; }
      if (!src && this.corridors.length && e.cls <= 2) { // TfL corridor status slows its A-roads
        const s = edgeAt(e, e.len * 0.5, this._s);
        let mul = 1;
        for (const c of this.corridors) if (s.x >= c.x0 && s.x <= c.x1 && s.z >= c.z0 && s.z <= c.z1) mul = Math.min(mul, c.mul);
        if (mul < 1) { r *= mul; src = 2; }
      }
    }
    if (d.ltWork) { r *= d.ltWork.mul; src = src || 3; }
    d._ltR = r;
    d._ltSrc = src;
    d._ltK = clamp((0.08 + 0.92 * this.demand) * (1 + 2.6 * Math.pow(1 - r, 1.3)), 0.06, 3.6); // queues: slow roads hold more cars
    d._ltGen = this.gen;
  }

  /** Mean live ratio over three samples of this direction, or null when no feed covers it. */
  _matchLive(d) {
    if (!this.cells.size) return null;
    const e = d.e, s = this._s, hw = HIGHWAY_CLS[e.cls];
    const sgn = d.fwd ? 1 : -1;
    let sum = 0, hits = 0, tries = 0;
    const fr = e.len < 40 ? [0.5] : [0.2, 0.5, 0.8];
    for (const f of fr) {
      edgeAt(e, e.len * f, s);
      const hx = s.ux * sgn, hz = s.uz * sgn;
      tries++;
      const cx = Math.floor(s.x / CELL), cz = Math.floor(s.z / CELL);
      let best = null, bd = Infinity;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const l = this.cells.get((cx + i) * 73856 + (cz + j));
        if (!l) continue;
        for (const o of l) {
          if (o.hw && !hw) continue;
          const dx = o.x - s.x, dz = o.z - s.z, dd = dx * dx + dz * dz;
          if (dd > o.R * o.R || dd >= bd) continue;
          if (o.hx * hx + o.hz * hz < 0.72) continue;
          bd = dd; best = o;
        }
      }
      if (best) { hits++; sum += best.ratio != null ? best.ratio : clamp(best.ms / (FREE_FLOW[e.cls] * 0.9), 0.04, 1); }
    }
    return hits && hits * 2 >= tries ? sum / hits : null;
  }

  // ---------------- live observations -> spatial hash ----------------

  _toWorld(lat, lon) {
    const o = this.app.worldOrigin;
    return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
  }

  _rebuildObs() {
    const o = this.app.worldOrigin, p = this.app.pos;
    this.obsDirty = false;
    this.cells.clear();
    this.corridors = [];
    this.works = [];
    if (!o || !o.mPerDegLat || !p) return;
    this.obsCenter = { x: p.x, z: p.z };
    const add = (ln) => {
      let prev = null;
      for (const [la, lo] of ln.pts) {
        const w = this._toWorld(la, lo);
        if (prev) {
          const dx = w[0] - prev[0], dz = w[1] - prev[1], L = Math.hypot(dx, dz);
          if (L > 0.5 && Math.abs(prev[0] - p.x) < OBS_SPAN + L && Math.abs(prev[1] - p.z) < OBS_SPAN + L) {
            const hx = dx / L, hz = dz / L, steps = Math.max(1, Math.ceil(L / 10));
            for (let k = 0; k <= steps; k++) {
              const x = prev[0] + dx * (k / steps), z = prev[1] + dz * (k / steps);
              if (Math.abs(x - p.x) > OBS_SPAN || Math.abs(z - p.z) > OBS_SPAN) continue;
              const key = Math.floor(x / CELL) * 73856 + Math.floor(z / CELL);
              const ent = { x, z, hx, hz, ms: ln.ms, ratio: ln.ratio, R: ln.R, hw: ln.hw };
              const l = this.cells.get(key);
              if (l) l.push(ent); else this.cells.set(key, [ent]);
            }
          }
        }
        prev = w;
      }
    };
    for (const f of FEEDS) {
      const st = this.feedState.get(f.id);
      if (!st || !st.data || !st.fresh) continue;
      for (const ln of st.data.lines || []) add(ln);
      for (const c of st.data.corridors || []) {
        const a = this._toWorld(c.box[2], c.box[1]), b = this._toWorld(c.box[0], c.box[3]);
        this.corridors.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], mul: c.mul, name: c.name });
      }
      for (const w of st.data.works || []) {
        const [x, z] = this._toWorld(w.lat, w.lon);
        if (Math.abs(x - p.x) < 2500 && Math.abs(z - p.z) < 2500) this.works.push({ ...w, x, z });
      }
    }
    for (const t of this.tt.tiles.values()) for (const ln of t.lines || []) add(ln);
    this._worksEdges = -1; // re-place cones
    this.gen++;
  }

  // ---------------- fetching ----------------

  _playerLatLon() {
    const o = this.app.worldOrigin, p = this.app.pos;
    if (!o || !o.mPerDegLat || !p) return null;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  _pumpFeeds(now) {
    const ll = this._playerLatLon();
    if (!ll || this.app.isTeleporting) return;
    for (const f of FEEDS) {
      let st = this.feedState.get(f.id);
      if (!st) { st = { data: null, nextAt: 0, fails: 0, inFlight: false, fresh: false }; this.feedState.set(f.id, st); }
      // stale data ages out even without a refresh
      const fresh = !!(st.data && st.data.at && now - st.data.at < STALE_MS + 5 * 60000);
      if (fresh !== st.fresh) { st.fresh = fresh; this.obsDirty = true; }
      if (!inBox(ll[0], ll[1], f.box) || st.inFlight || now < st.nextAt) continue;
      st.inFlight = true;
      f.fetch().then((data) => {
        st.data = data;
        st.fails = 0;
        st.ok = true;
        st.fresh = !!(data && data.at && Date.now() - data.at < STALE_MS);
        st.nextAt = Date.now() + f.every * 1000;
        this.obsDirty = true;
      }).catch(() => {
        st.fails++;
        st.ok = false;
        st.nextAt = Date.now() + Math.min(1800, 60 * 2 ** Math.min(5, st.fails)) * 1000; // silent back-off
      }).finally(() => { st.inFlight = false; });
    }
  }

  _pumpTomTom(now) {
    const tt = this.tt;
    if (!this.ttKey || tt.disabled === this.ttKey || now < tt.nextAt || tt.inFlight > 1) return;
    const ll = this._playerLatLon();
    if (!ll || this.app.isTeleporting) return;
    const hourSlot = Math.floor(now / 3600000);
    if (hourSlot !== tt.hour) { tt.hour = hourSlot; tt.count = 0; }
    tt.nextAt = now + 15000;
    const dLat = 750 / 111000, dLon = 750 / (111000 * Math.cos(ll[0] * Math.PI / 180));
    const [x0, y0] = latLonToTileXY(ll[0] + dLat, ll[1] - dLon, TT_Z);
    const [x1, y1] = latLonToTileXY(ll[0] - dLat, ll[1] + dLon, TT_Z);
    const want = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) want.push(`${x}/${y}`);
    for (const k of tt.tiles.keys()) if (!want.includes(k) && now - tt.tiles.get(k).at > TT_TTL_MS) { tt.tiles.delete(k); this.obsDirty = true; }
    for (const k of want) {
      const t = tt.tiles.get(k);
      if (t && (t.pending || now - t.at < TT_TTL_MS)) continue;
      if (tt.count >= TT_HOURLY_CAP || tt.inFlight > 1) break;
      const [x, y] = k.split('/').map(Number);
      const host = 'abcd'[(x + y) & 3];
      const url = `https://${host}.api.tomtom.com/traffic/map/4/tile/flow/relative/${TT_Z}/${x}/${y}.pbf?key=${encodeURIComponent(this.ttKey)}`;
      const ent = t || { at: 0, lines: [] };
      ent.pending = true;
      tt.tiles.set(k, ent);
      tt.count++;
      tt.inFlight++;
      const key = this.ttKey;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      fetch(url, { signal: ac.signal }).then(async (r) => {
        if (r.status === 401 || r.status === 403) { tt.disabled = key; tt.err = 'key rejected'; throw new Error('auth'); }
        if (!r.ok) throw new Error('http ' + r.status);
        const layers = decodeMvtTile(await r.arrayBuffer(), TT_Z, x, y, new Set(['Traffic flow']));
        const lines = [];
        for (const f of layers['Traffic flow'] || []) {
          const tg = f.tags || {};
          let ratio = Number(tg.traffic_level);
          if (tg.road_closure) ratio = 0.03;
          if (!Number.isFinite(ratio)) continue;
          for (const pts of Array.isArray(f.geom) ? f.geom : []) if (pts.length >= 2) lines.push({ pts, ratio: clamp(ratio, 0.03, 1), R: 18, hw: false });
        }
        ent.lines = lines;
        ent.at = Date.now();
        tt.at = ent.at;
        tt.fails = 0;
        tt.err = '';
        this.obsDirty = true;
      }).catch(() => {
        tt.fails++;
        ent.at = Date.now() - TT_TTL_MS + Math.min(1800, 30 * 2 ** Math.min(6, tt.fails)) * 1000; // back off this tile
        tt.nextAt = Date.now() + Math.min(1800, 30 * 2 ** Math.min(6, tt.fails)) * 1000;
      }).finally(() => { clearTimeout(timer); ent.pending = false; tt.inFlight--; });
    }
  }

  // ---------------- road works ----------------

  /** Snap each live roadwork/incident to the nearest car road and lay out its cones. */
  _placeWorks() {
    const T = this.traffic;
    for (const d of this._workDirs) { d.ltWork = null; d._ltGen = 0; }
    this._workDirs.length = 0;
    const m4 = this._m4, q = this._q, v = this._v;
    let n = 0;
    if (this.mode !== 'off' && this.liveOn) {
      for (const w of this.works) {
        let best = null, bd = 35 * 35, bs = 0;
        for (const rec of T.chunkRecs.values()) {
          for (const e of rec.edges) {
            if (!e.car || e.cls > 5 || w.x < e.minX - 35 || w.x > e.maxX + 35 || w.z < e.minZ - 35 || w.z > e.maxZ + 35) continue;
            const p = e.pts;
            for (let i = 0; i < e.n - 1; i++) {
              const ax = p[i * 3], az = p[i * 3 + 2], bx = p[i * 3 + 3], bz = p[i * 3 + 5];
              const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
              const t = clamp(((w.x - ax) * dx + (w.z - az) * dz) / L2, 0, 1);
              const ex = ax + dx * t - w.x, ez = az + dz * t - w.z, dd = ex * ex + ez * ez;
              if (dd < bd) { bd = dd; best = e; bs = e.cum[i] + t * Math.sqrt(L2); }
            }
          }
        }
        if (!best) continue;
        const e = best;
        const d = e.dirs[0];
        const half = clamp(e.len * 0.4, 8, 22);
        const s0 = clamp(bs - half, 0, e.len), s1 = clamp(bs + half, 0, e.len);
        const lane = d.nLanes - 1; // the kerb lane of the first direction is coned off
        d.ltWork = { s0, s1, lane: d.nLanes > 1 ? lane : -1, mul: w.mul };
        d._ltGen = 0;
        this._workDirs.push(d);
        if (e.dirs[1]) { e.dirs[1].ltWork = { s0: e.len - s1, s1: e.len - s0, lane: -1, mul: Math.min(1, w.mul + 0.25) }; e.dirs[1]._ltGen = 0; this._workDirs.push(e.dirs[1]); }
        if (!w.cones) continue;
        const side = T.lht ? -1 : 1;
        const kerb = (e.oneway ? 1 : side) * (e.width * 0.5 - 0.35);
        let outer = kerb, line = kerb;
        if (d.nLanes > 1) { // cones along the closed lane's inner edge, tapering in from the kerb
          outer = e.oneway ? (lane + 1 - d.nLanes * 0.5) * d.laneW - 0.4 : side * ((lane + 1) * d.laneW - 0.4);
          line = e.oneway ? (lane - d.nLanes * 0.5) * d.laneW : side * lane * d.laneW;
        }
        const s = this._s;
        const span = s1 - s0, count = Math.max(4, Math.floor(span / 2.6));
        for (let k = 0; k <= count && n < MAX_CONES; k++) {
          const u = k / count;
          const taper = d.nLanes > 1 ? smooth01(Math.min(u, 1 - u) * 6) : 1;
          const off = outer + (line - outer) * taper;
          edgeAt(e, s0 + span * u, s);
          v.set(s.x - s.uz * off, s.y + 0.03, s.z + s.ux * off);
          q.setFromAxisAngle(this._axis, Math.atan2(s.ux, s.uz) + k * 0.7);
          m4.compose(v, q, this._sc);
          this.cones.setMatrixAt(n++, m4);
        }
      }
    }
    this.cones.count = n;
    this.cones.instanceMatrix.needsUpdate = true;
    this.gen++;
  }

  // ---------------- frame ----------------

  update(dt) {
    const app = this.app;
    if (app.worldOrigin !== this._lastOrigin) {
      this._lastOrigin = app.worldOrigin;
      this.obsDirty = true;
    }
    this._demandT -= dt;
    if (this._demandT <= 0) { this._demandT = 2; this._updateDemand(); }
    if (this.mode === 'off') {
      if (this.cones.count) { this.cones.count = 0; }
      this._ui(dt);
      return;
    }
    const now = Date.now();
    this._feedT -= dt;
    if (this._feedT <= 0) {
      this._feedT = 1;
      if (this.mode === 'live') { this._pumpFeeds(now); this._pumpTomTom(now); }
      const p = app.pos;
      if (this.obsCenter && p && (Math.abs(p.x - this.obsCenter.x) > 1500 || Math.abs(p.z - this.obsCenter.z) > 1500)) this.obsDirty = true;
      if (this.obsDirty) this._rebuildObs();
    }
    this._worksT -= dt;
    if (this._worksT <= 0) {
      this._worksT = 3;
      const ne = this.traffic.stats.edges;
      if (ne !== this._worksEdges && (this.works.length || this.cones.count)) { this._worksEdges = ne; this._placeWorks(); }
    }
    this._ui(dt);
  }

  setMode(m) {
    if (!['live', 'typical', 'off'].includes(m) || m === this.mode) return;
    this.mode = m;
    store.set(LS_MODE, m);
    this.obsDirty = true;
    this._worksEdges = -1;
    this._demandT = 0;
    this.gen++;
    this._refreshUi();
  }

  setKey(k) {
    k = String(k || '').trim();
    if (k === this.ttKey) return;
    this.ttKey = k;
    store.set(LS_KEY, k);
    this.tt.tiles.clear();
    this.tt.disabled = null;
    this.tt.err = '';
    this.tt.nextAt = 0;
    this.tt.fails = 0;
    this.obsDirty = true;
  }

  /** Source credit, e.g. "Live traffic · NYC DOT · 3 min ago"; null when nothing live is shown. */
  credit() {
    if (this.mode === 'off') return null;
    const zh = getLang() === 'zh';
    const parts = [];
    let at = 0;
    if (this.liveOn) {
      for (const f of FEEDS) {
        const st = this.feedState.get(f.id);
        if (st && st.fresh && st.data) { parts.push(f.name); at = Math.max(at, st.data.at || 0); }
      }
      if (this.ttKey && this.tt.at && Date.now() - this.tt.at < TT_TTL_MS * 3) { parts.push('© TomTom'); at = Math.max(at, this.tt.at); }
    }
    if (!parts.length) return zh ? '典型路况' : 'Typical traffic';
    const min = Math.max(0, Math.round((Date.now() - at) / 60000));
    const ago = min < 1 ? (zh ? '刚刚' : 'just now') : zh ? `${min} 分钟前` : `${min} min ago`;
    return `${zh ? '实时路况' : 'Live traffic'} · ${parts.join(' · ')} · ${ago}`;
  }

  // ---------------- map overlay ----------------

  /** Congestion lines (green / amber / red) on the minimap and world map; drawn only when toggled on. */
  drawMap(ctx, toSx, toSy, full) {
    if (!this.overlay || this.mode === 'off') return;
    const now = performance.now(), pp = this.app.pos;
    let ov = this._ov;
    if (!ov || ov.gen !== this.gen || (now - this._ovT > 1000 && Math.hypot(pp.x - ov.x, pp.z - ov.z) > 150)) { this._ovT = now; ov = this._ov = this._buildOverlay(); }
    const near = full ? Infinity : 560; // the minimap only needs the roads around the player
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = full ? 3 : 2.2;
    for (let b = 0; b < 4; b++) {
      const lines = ov.buckets[b];
      if (!lines.length) continue;
      ctx.beginPath();
      for (const pts of lines) {
        if (Math.abs(pts.dx + ov.x - pp.x) > near + pts.r || Math.abs(pts.dz + ov.z - pp.z) > near + pts.r) continue;
        for (let i = 0; i < pts.length; i += 2) {
          const x = toSx(pts[i]), y = toSy(pts[i + 1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.globalAlpha = [0.5, 0.8, 0.9, 0.95][b] * (full ? 1 : 0.9); // free flow stays quiet, jams stand out
      ctx.strokeStyle = ['#2fae5a', '#f2b311', '#e8453c', '#9c1a1a'][b];
      ctx.stroke();
    }
    ctx.restore();
  }

  _buildOverlay() {
    const T = this.traffic, o = this.app.worldOrigin, p = this.app.pos;
    const buckets = [[], [], [], []];
    if (!o || !p) return { buckets, gen: this.gen, x: 0, z: 0 };
    const R = 1300;
    const side = T.lht ? -1 : 1;
    for (const rec of T.chunkRecs.values()) {
      for (const e of rec.edges) {
        if (!e.car || e.cls > 5 || e.maxX < p.x - R || e.minX > p.x + R || e.maxZ < p.z - R || e.minZ > p.z + R) continue;
        for (const d of e.dirs) {
          if (!d) continue;
          const r = this.ratio(d);
          if (e.cls === 5 && !d._ltSrc && r > 0.45) continue; // side streets only show when jammed
          const b = r > 0.72 ? 0 : r > 0.45 ? 1 : r > 0.2 ? 2 : 3;
          const off = e.oneway ? 0 : side * Math.min(4, e.width * 0.25);
          const sgn = d.fwd ? 1 : -1;
          const out = [];
          const step = Math.max(1, Math.floor(e.n / 6));
          for (let i = 0; i < e.n; i += step) this._ovPt(e, i, off, sgn, out);
          if ((e.n - 1) % step) this._ovPt(e, e.n - 1, off, sgn, out);
          if (out.length < 4) continue;
          out.dx = (e.minX + e.maxX) * 0.5 - p.x; out.dz = (e.minZ + e.maxZ) * 0.5 - p.z; out.r = Math.max(e.maxX - e.minX, e.maxZ - e.minZ) * 0.5;
          buckets[b].push(out);
        }
      }
    }
    return { buckets, gen: this.gen, x: p.x, z: p.z };
  }

  _ovPt(e, i, off, sgn, out) {
    const p = e.pts, o = this.app.worldOrigin;
    const a = Math.max(0, i - 1), b = Math.min(e.n - 1, i + 1);
    let ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const L = Math.hypot(ux, uz) || 1;
    ux = ux / L * sgn; uz = uz / L * sgn;
    const x = p[i * 3] - uz * off, z = p[i * 3 + 2] + ux * off;
    out.push(lonToMx(o.centerLon + x / o.mPerDegLon), latToMy(o.centerLat - z / o.mPerDegLat));
  }

  // ---------------- UI: folded into the time & weather menu, the map's attribution and its buttons ----------------

  _ui(dt) {
    this._uiT -= dt;
    if (this._uiT > 0) return;
    this._uiT = 0.5;
    if (!this._uiBuilt) this._buildUi();
    this._refreshUi();
  }

  _buildUi() {
    const pop = document.getElementById('atmo-menu');
    const modal = document.getElementById('world-map-modal');
    if (!pop || !modal || !modal.querySelector('.wm-attrib')) return;
    this._uiBuilt = true;
    const sec = document.createElement('div');
    sec.className = 'lt-menu';
    sec.innerHTML =
      '<div class="popover-label"><span data-lt="title"></span></div>' +
      '<div class="popover-mode-row" style="grid-template-columns:repeat(3,1fr)">' +
      ['live', 'typical', 'off'].map((m) => `<button type="button" class="popover-mode-btn" data-lt-mode="${m}"></button>`).join('') +
      '</div><div class="lt-src" data-lt="src"></div>' +
      '<input class="lt-key" type="password" autocomplete="off" spellcheck="false" data-lt="key" />';
    pop.appendChild(sec);
    this.menuEl = sec;
    const keyEl = sec.querySelector('[data-lt="key"]');
    keyEl.value = this.ttKey;
    keyEl.addEventListener('change', () => this.setKey(keyEl.value));
    keyEl.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { this.setKey(keyEl.value); keyEl.blur(); } });
    sec.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const b = ev.target.closest('[data-lt-mode]');
      if (b) { b.blur(); this.setMode(b.dataset.ltMode); }
    });

    const attrib = modal.querySelector('.wm-attrib');
    this.creditEl = document.createElement('span');
    this.creditEl.className = 'lt-credit';
    attrib.appendChild(this.creditEl);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wm-icon-btn wm-glass lt-map-btn';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="5" y="1.5" width="6" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<circle cx="8" cy="4.6" r="1.25" fill="#e8453c"/><circle cx="8" cy="8" r="1.25" fill="#f2b311"/><circle cx="8" cy="11.4" r="1.25" fill="#2fae5a"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.overlay = !this.overlay;
      store.set(LS_OVERLAY, this.overlay ? '1' : null);
      this._refreshUi();
      const ms = this.app.mapSystem;
      if (ms) { ms._mmForce = true; if (ms.isOpen && ms._requestRender) ms._requestRender(); }
    });
    (modal.querySelector('.wm-locate') || attrib).insertAdjacentElement('beforebegin', btn);
    this.mapBtn = btn;

    const st = document.createElement('style');
    st.textContent =
      '.lt-menu{display:flex;flex-direction:column;gap:6px;margin-top:4px}' +
      '.lt-src{font-size:10.5px;color:var(--text-muted,#9aa3ad);padding:0 2px;line-height:1.35}' +
      '.lt-key{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;' +
      'padding:5px 8px;color:var(--text-main,#e9ebee);font-size:11px;font-family:inherit;outline:none}' +
      '.lt-key:focus{border-color:rgba(77,171,247,0.6)}' +
      '.lt-map-btn{bottom:70px;right:18px}.lt-map-btn.active{color:#fff;border-color:rgba(77,171,247,0.6)}' +
      '.lt-credit:not(:empty)::before{content:" · "}';
    document.head.appendChild(st);
  }

  _refreshUi() {
    if (!this._uiBuilt) return;
    const zh = getLang() === 'zh';
    const T = (en, cn) => (zh ? cn : en);
    const sec = this.menuEl;
    const set = (el, txt) => { if (el && el.textContent !== txt) el.textContent = txt; };
    set(sec.querySelector('[data-lt="title"]'), T('Traffic', '路况'));
    for (const b of sec.querySelectorAll('[data-lt-mode]')) {
      set(b, { live: T('Live', '实时'), typical: T('Typical', '典型'), off: T('Off', '关闭') }[b.dataset.ltMode]);
      const on = b.dataset.ltMode === this.mode;
      if (b.classList.contains('active') !== on) b.classList.toggle('active', on); // main.js re-syncs mode buttons
    }
    const credit = this.credit();
    let src = credit || T('Synthetic traffic', '模拟交通');
    if (this.mode === 'live' && !this.liveOn) src = T('Typical traffic (a picked time; Now goes live)', '典型路况（已选时间；选“现在”恢复实时）');
    if (this.tt.err) src += T(' · TomTom key rejected', ' · TomTom 密钥无效');
    set(sec.querySelector('[data-lt="src"]'), src);
    const keyEl = sec.querySelector('[data-lt="key"]');
    keyEl.style.display = this.mode === 'live' ? '' : 'none';
    const ph = T('TomTom key (optional, live anywhere)', 'TomTom 密钥（可选，全球实时）');
    if (keyEl.placeholder !== ph) keyEl.placeholder = ph;
    set(this.creditEl, credit && credit !== 'Typical traffic' && credit !== '典型路况' ? credit : '');
    this.mapBtn.classList.toggle('active', this.overlay);
    const tip = T('Traffic overlay', '路况图层');
    if (this.mapBtn.title !== tip) this.mapBtn.title = tip;
  }

  state() {
    const T = this.traffic;
    let dirs = 0, live = 0, sum = 0, slow = 0, works = 0;
    for (const rec of T.chunkRecs.values()) for (const e of rec.edges) for (const d of e.dirs) {
      if (!d) continue;
      const r = this.ratio(d);
      dirs++; sum += r;
      if (d._ltSrc === 1) live++;
      if (r < 0.4) slow++;
      if (d.ltWork) works++;
    }
    const feeds = {};
    for (const [k, s] of this.feedState) feeds[k] = { ok: s.ok, fresh: s.fresh, lines: s.data ? (s.data.lines || []).length : 0, corridors: s.data ? (s.data.corridors || []).length : 0, works: s.data ? (s.data.works || []).length : 0, at: s.data && s.data.at ? new Date(s.data.at).toISOString() : null, fails: s.fails };
    return {
      mode: this.mode, liveOn: this.liveOn, hour: Number(this.hour.toFixed(2)), wd: this.wd, demand: Number(this.demand.toFixed(3)), jam: Number(this.jam.toFixed(3)),
      dirs, liveDirs: live, slowDirs: slow, meanRatio: dirs ? Number((sum / dirs).toFixed(3)) : 1, workDirs: works, cones: this.cones.count,
      obsCells: this.cells.size, corridors: this.corridors.length, worksNear: this.works.length, feeds,
      tomtom: { key: !!this.ttKey, tiles: this.tt.tiles.size, err: this.tt.err, count: this.tt.count },
      cars: T.stats.cars, carTarget: T.carTarget, credit: this.credit(), overlay: this.overlay,
    };
  }
}
