import { SURFACE_UNIFORMS } from './surfaces.js';

/**
 * [sea-state] Real live sea state on the water. Open-Meteo Marine (keyless, CORS-friendly) gives the
 * current significant wave height, swell height/direction/period and wind-wave height near the
 * player; wind comes from live_weather.js (no second forecast request). The result drives the water
 * shader uniforms in surfaces.js: chop amplitude (and how strongly it lines up with the wind), one
 * long swell from the real direction with its wavenumber from the period (deep water: k = 4π²/(gT²)),
 * and whitecap coverage once the sea gets rough. Ships (maritime.js) and a wrecked car
 * (water_physics.js) read `motion` / `waveHeight` for their bob and roll.
 *
 * Fetched on arrival (teleportGeneration change) and every 20 min, one request with a small ring of
 * points so a city block that is inland on the marine grid still finds the nearest sea cell. All
 * nulls (truly inland) -> a calm-to-moderate state from the wind speed. Fails silently offline.
 * `?sea=calm|moderate|rough|storm` wins over live data (demos/tests). Debug: window.__SEA__.state().
 */

const REFRESH_S = 1200;
const DEG = Math.PI / 180;
const G = 9.81;
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const FIELDS = 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height';
// Lookup ring (degrees): centre first, then ~9 km, then ~25 km; the first non-null cell wins.
const RING = [[0, 0], [0.08, 0], [-0.08, 0], [0, 0.1], [0, -0.1], [0.22, 0], [-0.22, 0], [0, 0.28], [0, -0.28]];

// Hand-picked states for ?sea= (Hs metres, swell period s, wind m/s). Direction stays live/default.
const PRESETS = {
  calm: { hs: 0.15, swellH: 0.1, period: 6, windWaveH: 0.05, wind: 1.5 },
  moderate: { hs: 1.2, swellH: 0.9, period: 9, windWaveH: 0.5, wind: 7 },
  rough: { hs: 3.2, swellH: 2.4, period: 11, windWaveH: 1.6, wind: 14 },
  storm: { hs: 6.5, swellH: 4.5, period: 13, windWaveH: 3.5, wind: 23 },
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const num = (v) => (Number.isFinite(v) ? v : null);

/** Open-Meteo marine `current` block -> sea description, or null when the cell is land (all nulls). */
export function seaFromMarine(cur) {
  if (!cur) return null;
  const hs = num(cur.wave_height);
  if (hs == null) return null;
  const swellH = num(cur.swell_wave_height);
  return {
    hs,
    swellH: swellH ?? hs * 0.7,
    period: num(cur.swell_wave_period) ?? num(cur.wave_period) ?? 8,
    fromDeg: num(cur.swell_wave_direction) ?? num(cur.wave_direction),
    windWaveH: num(cur.wind_wave_height) ?? hs * 0.5,
  };
}

/** Inland / no marine data: a fetch-limited sea from the wind alone, capped at moderate. */
function seaFromWind(ms) {
  const hs = Math.min(1.4, 0.018 * ms * ms + 0.05);
  return { hs, swellH: hs * 0.5, period: clamp(2.5 + 0.45 * ms, 2.5, 7), fromDeg: null, windWaveH: hs * 0.8 };
}

export class SeaState {
  constructor(app) {
    this.app = app;
    const q = new URLSearchParams(location.search).get('sea');
    this.preset = q && PRESETS[q.toLowerCase()] ? q.toLowerCase() : null;
    this.source = this.preset ? 'url' : 'default';
    this.marine = null; // last raw sea description from the marine feed (or null)
    this.at = null;
    this.timer = 1.5;
    this.inFlight = false;
    this._gen = app.teleportGeneration || 0;
    // Targets and eased values (scalars only: nothing allocated per frame)
    this.tgt = { hs: 0.6, swellH: 0.4, period: 7, windWaveH: 0.3, wind: 4, dirX: 0.94, dirZ: 0.34, windX: 0.94, windZ: 0.34 };
    this.cur = { ...this.tgt };
    this.waveHeight = this.cur.hs; // public: significant wave height (m), eased
    this.motion = 1; // public: bob/roll multiplier for floating things (1 = previous fixed look)
    this.applied = { chop: 0, windAlign: 0, swellK: 0, swellSlope: 0, whitecap: 0, roughness: 0 };
    if (this.preset) this._setTarget(PRESETS[this.preset], null);
    window.__SEA__ = { state: () => this.state(), refresh: () => this._fetch() };
  }

  _latLon() {
    const o = this.app.worldOrigin;
    if (!o || !o.mPerDegLat) return null;
    const p = this.app.pos;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  _liveWind() {
    const lw = this.app.liveWeather;
    return lw && lw.data && lw.data.wind ? lw.data.wind : null;
  }

  async _fetch() {
    if (this.preset || this.inFlight || this.app.isTeleporting) return;
    const ll = this._latLon();
    if (!ll) return;
    this.inFlight = true;
    const gen = this._gen;
    const lats = RING.map((d) => (ll[0] + d[0]).toFixed(3)).join(',');
    const lons = RING.map((d) => (ll[1] + d[1]).toFixed(3)).join(',');
    try {
      const r = await fetch(`${MARINE_URL}?latitude=${lats}&longitude=${lons}&current=${FIELDS}`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (j && gen === this._gen) {
        const list = Array.isArray(j) ? j : [j];
        let sea = null;
        for (const e of list) if ((sea = seaFromMarine(e && e.current))) break;
        this.marine = sea;
        this.at = new Date().toISOString();
        this.source = sea ? 'marine' : 'wind';
      }
    } catch {
      // offline / blocked: keep whatever sea we have
    } finally {
      this.inFlight = false;
    }
  }

  /** sea: { hs, swellH, period, fromDeg, windWaveH, wind? }; wind: live {x, z, ms} or null. */
  _setTarget(sea, wind) {
    const t = this.tgt;
    const ms = sea.wind ?? (wind ? wind.ms : 4);
    t.hs = sea.hs; t.swellH = sea.swellH; t.period = sea.period; t.windWaveH = sea.windWaveH; t.wind = ms;
    if (wind && wind.ms > 0.3) { t.windX = wind.x / wind.ms; t.windZ = wind.z / wind.ms; }
    if (sea.fromDeg != null) {
      const to = (sea.fromDeg + 180) * DEG; // swell propagates away from where it comes from
      t.dirX = Math.sin(to); t.dirZ = -Math.cos(to);
    } else {
      t.dirX = t.windX; t.dirZ = t.windZ; // no swell direction: wind sea
    }
  }

  update(dt) {
    const app = this.app;
    if ((app.teleportGeneration || 0) !== this._gen) {
      this._gen = app.teleportGeneration || 0;
      this.timer = 1.5;
      if (!this.preset) { this.marine = null; this.source = 'default'; }
    }
    this.timer -= dt;
    if (this.timer <= 0 && !app.isTeleporting) {
      this.timer = REFRESH_S;
      this._fetch();
    }

    const wind = this._liveWind();
    if (this.preset) this._setTarget(PRESETS[this.preset], wind);
    else if (this.marine) this._setTarget(this.marine, wind);
    else if (wind) { this._setTarget(seaFromWind(wind.ms), wind); if (this.source === 'default') this.source = 'wind'; }

    // Ease everything over a few seconds (arrivals and refreshes never pop)
    const t = this.tgt, c = this.cur;
    const k = 1 - Math.exp(-dt / 3);
    c.hs += (t.hs - c.hs) * k; c.swellH += (t.swellH - c.swellH) * k; c.period += (t.period - c.period) * k;
    c.windWaveH += (t.windWaveH - c.windWaveH) * k; c.wind += (t.wind - c.wind) * k;
    c.dirX += (t.dirX - c.dirX) * k; c.dirZ += (t.dirZ - c.dirZ) * k;
    c.windX += (t.windX - c.windX) * k; c.windZ += (t.windZ - c.windZ) * k;
    const dl = Math.hypot(c.dirX, c.dirZ) || 1;
    const wl = Math.hypot(c.windX, c.windZ) || 1;

    // Sea description -> shader terms. Slopes are exaggerated (~2x) so a real 1-2 m swell reads on a
    // screen; normals-only waves would otherwise look flat at these wavelengths.
    const a = this.applied;
    a.chop = clamp(0.22 + 0.06 * c.wind + 0.35 * c.windWaveH, 0.22, 2.0);
    a.windAlign = smooth(2, 12, c.wind) * 0.85;
    a.swellK = (4 * Math.PI * Math.PI) / (G * c.period * c.period);
    // (a few cm of swell in a harbour should read glassy, so tiny swells fade out entirely)
    a.swellSlope = clamp(c.swellH * 0.5 * a.swellK * 1.4 * smooth(0.05, 0.8, c.swellH), 0, 0.32);
    a.whitecap = clamp(smooth(1.3, 5.5, c.hs) * 0.9 + smooth(9, 20, c.wind) * 0.35, 0, 1);
    a.roughness = 0.07 + 0.16 * smooth(0.5, 5, c.hs);
    this.waveHeight = c.hs;
    this.motion = clamp(0.35 + c.hs * 0.55, 0.35, 4);

    const U = SURFACE_UNIFORMS;
    U.uSeaChop.value = a.chop;
    U.uSeaWind.value.set(c.windX / wl, c.windZ / wl, a.windAlign);
    U.uSwell.value.set(c.dirX / dl, c.dirZ / dl, a.swellK, a.swellSlope);
    U.uWhitecap.value = a.whitecap;
    const wm = app.mats && app.mats.waterMat;
    if (wm) wm.roughness = a.roughness;
  }

  state() {
    const c = this.cur;
    const r2 = (x) => Number(x.toFixed(2));
    const toDeg = ((Math.atan2(c.dirX, -c.dirZ) / DEG) + 360) % 360;
    return {
      source: this.source, preset: this.preset, at: this.at, marine: this.marine,
      waveHeight: r2(c.hs), swellHeight: r2(c.swellH), period: r2(c.period), windWaveHeight: r2(c.windWaveH),
      wind: r2(c.wind), swellFromDeg: Math.round((toDeg + 180) % 360), motion: r2(this.motion),
      applied: Object.fromEntries(Object.entries(this.applied).map(([k, v]) => [k, Number(v.toFixed(4))])),
    };
  }
}

export function initSeaState(app) {
  try {
    return new SeaState(app);
  } catch (e) {
    console.warn('[sea-state] init failed', e);
    return null;
  }
}
