/**
 * [aurora] Real live aurora in the night sky, from NOAA SWPC's OVATION nowcast (keyless, CORS `*`).
 *
 * The nowcast is a global 1-degree grid of aurora probability (0..100). It is fetched at most every
 * 10 min, and only while the game sky is dark at a latitude where aurora could be seen (below ~35 deg
 * only when the planetary Kp index says a big storm is on). The ~900 KB JSON is packed into a 65 KB
 * Uint8Array and dropped.
 *
 * Aurora sits ~100-250 km up, so it is visible from up to ~1200 km away. Around the player we sample
 * the grid out to that range and reduce it to one auroral arc: intensity, the horizontal direction
 * toward it (poleward, usually) and its ground distance. The sky shader (sky.js) draws curtains on
 * that arc in true geometry: a near arc stands high in the sky, a far one hugs the horizon and bends
 * down at its ends. Visibility follows the same darkness as the stars (uStars), so daytime, overcast
 * and fog hide it; clouds occlude it in the shader.
 *
 * ?aurora=0..1 forces an intensity (demo/test), ?aurora=off disables it. window.__AURORA__ for debug.
 * Offline / blocked: silently nothing.
 */

const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const KP_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const REFRESH_S = 600;
const RETRY_S = 120;
const KM_PER_DEG = 111.2;
const RANGE_KM = 1400;
const DEG = Math.PI / 180;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** OVATION `coordinates` ([lon 0..359, lat -90..90, prob]) -> Uint8Array[(lat + 90) * 360 + lon]. */
export function packOvation(coords) {
  const g = new Uint8Array(360 * 181);
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const lon = ((Math.round(c[0]) % 360) + 360) % 360;
    const lat = Math.round(c[1]) + 90;
    if (lat >= 0 && lat <= 180) g[lat * 360 + lon] = Math.max(0, Math.min(100, c[2] | 0));
  }
  return g;
}

/**
 * Reduce the grid around (lat, lon) to one visible arc. Returns { intensity 0..1, dirX, dirZ
 * (world xz unit vector, -z = north), distKm }. `out` is reused (no allocation per call).
 */
export function sampleAurora(grid, lat, lon, out) {
  const cosLat = Math.max(0.1, Math.cos(lat * DEG));
  let best = 0, sx = 0, sz = 0, sw = 0, se = 0, sn = 0;
  for (let dn = -RANGE_KM; dn <= RANGE_KM; dn += 100) {
    const la = Math.round(lat + dn / KM_PER_DEG);
    if (la < -90 || la > 90) continue;
    const row = (la + 90) * 360;
    for (let de = -RANGE_KM; de <= RANGE_KM; de += 200) {
      const d = Math.hypot(dn, de);
      if (d > RANGE_KM) continue;
      const lo = ((Math.round(lon + de / (KM_PER_DEG * cosLat)) % 360) + 360) % 360;
      // probability -> brightness (OVATION ~5% is a faint glow, 40%+ a bright display), fading with range
      const w = smooth(4, 40, grid[row + lo]) * (1 - smooth(500, RANGE_KM, d));
      if (w <= 0) continue;
      if (w > best) best = w;
      if (d > 1) { sx += (w * de) / d; sz -= (w * dn) / d; }
      sw += w * w;
      se += w * w * de;
      sn += w * w * dn;
    }
  }
  out.intensity = best;
  const l = Math.hypot(sx, sz);
  if (l > 1e-3) { out.dirX = sx / l; out.dirZ = sz / l; }
  else { out.dirX = 0; out.dirZ = lat >= 0 ? -1 : 1; } // overhead / nothing: look poleward
  // Ground distance to the arc along that direction (weighted toward the brightest samples)
  // (~0 when the oval is overhead: then the arc passes near the zenith)
  out.distKm = sw > 0 ? Math.max(40, (se * out.dirX - sn * out.dirZ) / sw) : 400;
  return out;
}

export class Aurora {
  constructor(app) {
    this.app = app;
    this.grid = null;
    this.kp = null;
    this.obsTime = null;
    this.fetchedAt = -1e9;
    this.timer = 2;
    this.inFlight = false;
    this.time = 0;
    this.level = 0; // smoothed on-screen intensity
    this.arc = { intensity: 0, dirX: 0, dirZ: -1, distKm: 400 };
    this._sampleAt = [NaN, NaN];
    this._gen = app.teleportGeneration || 0;
    const q = new URLSearchParams(location.search).get('aurora');
    this.off = q === 'off' || q === 'false';
    const f = q == null || this.off ? NaN : parseFloat(q);
    this.forced = Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : null;
    window.__AURORA__ = {
      state: () => this.state(),
      refresh: () => { this.fetchedAt = -1e9; this.timer = 0; },
      force: (v) => { this.forced = v == null ? null : Math.max(0, Math.min(1, +v || 0)); },
    };
  }

  _latLon() {
    const o = this.app.worldOrigin;
    if (!o || !o.mPerDegLat) return null;
    const p = this.app.pos;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  async _fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? r.json() : null;
  }

  async _fetch(lat) {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      // Near the equator never; low latitudes only in a severe storm: ask the small Kp feed first.
      if (Math.abs(lat) < 20) { this.fetchedAt = this.time; return; }
      if (Math.abs(lat) < 35) {
        const k = await this._fetchJson(KP_URL);
        const last = Array.isArray(k) && k.length ? k[k.length - 1] : null;
        if (last) this.kp = Number(last.estimated_kp ?? last.kp_index) || 0;
        if (!(this.kp >= 7)) { this.fetchedAt = this.time; return; }
      } else {
        this._fetchJson(KP_URL).then((k) => {
          const last = Array.isArray(k) && k.length ? k[k.length - 1] : null;
          if (last) this.kp = Number(last.estimated_kp ?? last.kp_index) || 0;
        }).catch(() => {});
      }
      const j = await this._fetchJson(OVATION_URL);
      if (j && Array.isArray(j.coordinates)) {
        this.grid = packOvation(j.coordinates);
        this.obsTime = j['Observation Time'] || null;
        this.fetchedAt = this.time;
        this._sampleAt[0] = NaN; // re-sample with the new grid
      }
    } catch {
      // offline / blocked: no aurora, try again later
      this.timer = RETRY_S;
    } finally {
      this.inFlight = false;
    }
  }

  update(dt) {
    this.time += dt;
    const app = this.app;
    const u = app.atmosphere && app.atmosphere.sky && app.atmosphere.sky.uniforms;
    if (!u || !u.uAurora || this.off) return;
    // Same darkness that drives the stars (night, clear, no fog), set by atmosphere.js each frame
    const dark = u.uStars.value;
    if ((app.teleportGeneration || 0) !== this._gen) {
      this._gen = app.teleportGeneration || 0;
      this._sampleAt[0] = NaN;
      if (!this.grid) this.fetchedAt = -1e9; // the grid is global; only a skipped fetch needs a retry
    }

    let target = 0;
    if (this.forced != null || dark > 0.01) {
      const ll = this._latLon();
      if (ll && this.forced == null) {
        this.timer -= dt;
        if (this.timer <= 0 && !app.isTeleporting && !document.hidden) {
          this.timer = 5;
          if (this.time - this.fetchedAt >= REFRESH_S) this._fetch(ll[0]);
        }
      }
      // Re-reduce the grid after moving ~0.25 deg (cheap: ~400 lookups)
      if (ll && this.grid && !(Math.abs(ll[0] - this._sampleAt[0]) < 0.25 && Math.abs(ll[1] - this._sampleAt[1]) < 0.25)) {
        this._sampleAt[0] = ll[0];
        this._sampleAt[1] = ll[1];
        sampleAurora(this.grid, ll[0], ll[1], this.arc);
      }
      if (this.forced != null) {
        target = this.forced;
        if (!(this.arc.intensity > 0.05)) { // no real arc around: a demo arc ~350 km poleward
          this.arc.dirX = 0;
          this.arc.dirZ = ll && ll[0] < 0 ? 1 : -1;
          this.arc.distKm = 350;
        }
      } else if (this.grid) {
        target = this.arc.intensity;
      }
      target *= dark;
      u.uAuroraDir.value.set(this.arc.dirX, this.arc.dirZ);
      u.uAuroraDist.value = this.arc.distKm;
    }
    this.level += (target - this.level) * (1 - Math.exp(-dt / 3));
    if (this.level < 0.002 && target === 0) this.level = 0;
    u.uAurora.value = this.level;
  }

  state() {
    const ll = this._latLon();
    return {
      off: this.off,
      forced: this.forced,
      hasData: !!this.grid,
      observation: this.obsTime,
      kp: this.kp,
      ageS: this.grid ? Math.round(this.time - this.fetchedAt) : null,
      latLon: ll ? [Number(ll[0].toFixed(2)), Number(ll[1].toFixed(2))] : null,
      arc: { ...this.arc, intensity: Number(this.arc.intensity.toFixed(3)), distKm: Math.round(this.arc.distKm) },
      level: Number(this.level.toFixed(3)),
    };
  }
}

export function initAurora(app) {
  try {
    return new Aurora(app);
  } catch (e) {
    console.warn('[aurora] init failed', e);
    return null;
  }
}
