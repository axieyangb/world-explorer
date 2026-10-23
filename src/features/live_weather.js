import * as THREE from '../../vendor/three.module.js';

/**
 * [live-weather] Real current weather from Open-Meteo (keyless, CORS-friendly) drives the existing
 * atmosphere system: cloud cover, rain, fog from visibility (SF fog!), plus snow and wind.
 * Refreshed every 10 min and after each teleport. A manual weather pick in the time pill (or
 * ?weather=) still wins. The time pill shows a tiny readout, e.g. "14:05 · ☁ 14°C".
 * If the request fails, nothing changes (atmosphere keeps its own default weather).
 */

const REFRESH_S = 600;
const DEG = Math.PI / 180;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** WMO weather code + current values -> atmosphere targets. */
export function weatherFromOpenMeteo(cur) {
  const code = cur.weather_code | 0;
  const cover = Math.max(0, Math.min(100, cur.cloud_cover ?? 0)) / 100;
  const precip = Math.max(0, cur.precipitation ?? 0);
  const vis = Number.isFinite(cur.visibility) ? cur.visibility : 24000;
  const isFog = code === 45 || code === 48;
  const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const isThunder = code >= 95;
  const isRain = !isSnow && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || isThunder);
  const drizzle = code >= 51 && code <= 57;

  let cloud = 0.12 + 0.84 * cover;
  if (code === 3) cloud = Math.max(cloud, 0.85);
  let rain = 0;
  if (isRain) rain = Math.max(drizzle ? 0.3 : 0.5, Math.min(1, 0.35 + precip / 3));
  if (isThunder) rain = 1;
  let snow = 0;
  if (isSnow) snow = Math.max(0.4, Math.min(1, 0.4 + precip / 2));
  if (rain || snow) cloud = Math.max(cloud, 0.9);
  // Visibility -> fog: 10 km+ clear, ~600 m thick fog
  let fog = smooth(10000, 600, vis);
  if (isFog) fog = Math.max(fog, 0.8);
  if (snow) fog = Math.max(fog, 0.25 * snow);

  const weather = rain > 0 || snow > 0 ? 'rain' : fog > 0.5 ? 'fog' : cloud > 0.55 ? 'cloudy' : 'clear';
  const icon = isThunder ? 'ϟ' : snow ? '❄' : rain ? '☂' : fog > 0.5 ? '≋' : cloud > 0.75 ? '☁' : cloud > 0.4 ? '⛅' : '☀';
  const windMs = Math.max(0, (cur.wind_speed_10m ?? 0) / 3.6);
  const windTo = ((cur.wind_direction_10m ?? 0) + 180) * DEG; // direction the wind blows toward
  return {
    weather, cloud, rain, fog, snow, icon,
    tempC: Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null,
    wind: { x: Math.sin(windTo) * windMs, z: -Math.cos(windTo) * windMs, ms: windMs },
    code, visibility: vis,
  };
}

function createSnow(count = 5000) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.random();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uBox: { value: new THREE.Vector3(70, 40, 70) },
    uWind: { value: new THREE.Vector2(0, 0) },
    uColor: { value: new THREE.Color(0xf4f7fb) },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform vec3 uCam; uniform float uTime; uniform vec3 uBox; uniform vec2 uWind;
      varying float vA;
      void main() {
        float speed = 1.1 + position.x * 0.7;
        vec3 p = position * uBox;
        p.y -= uTime * speed;
        p.xz += uWind * uTime * 0.6 + vec2(sin(uTime * 0.9 + position.z * 40.0), cos(uTime * 0.7 + position.x * 40.0)) * 0.6;
        vec3 base = uCam - uBox * 0.5;
        vec3 w = base + mod(p - base, uBox);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        float d = -mv.z;
        vA = smoothstep(uBox.x * 0.5, uBox.x * 0.2, length(w.xz - uCam.xz)) * smoothstep(0.5, 2.0, d);
        gl_PointSize = clamp(90.0 / max(d, 0.1), 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.2, length(c));
        gl_FragColor = vec4(uColor, a * vA * uOpacity);
      }
    `,
  });
  const mesh = new THREE.Points(geom, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return { mesh, uniforms };
}

export class LiveWeather {
  constructor(app) {
    this.app = app;
    this.data = null;
    this.timer = 1;
    this.inFlight = false;
    this.time = 0;
    this.snowLevel = 0;
    this.wind = new THREE.Vector2();
    this._gen = app.teleportGeneration || 0;
    this.snow = createSnow();
    app.scene.add(this.snow.mesh);
    window.__LIVE_WEATHER__ = { state: () => this.state(), refresh: () => this._fetch() };
  }

  _latLon() {
    const o = this.app.worldOrigin;
    if (!o || !o.mPerDegLat) return null;
    const p = this.app.pos;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  async _fetch() {
    if (this.inFlight || this.app.isTeleporting) return;
    const ll = this._latLon();
    if (!ll) return;
    this.inFlight = true;
    const gen = this._gen;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + ll[0].toFixed(3) + '&longitude=' + ll[1].toFixed(3) +
      '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,visibility,is_day';
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (j && j.current && gen === this._gen) {
        this._syncClock(ll[1], gen);
        this.data = weatherFromOpenMeteo(j.current);
        this.data.at = new Date().toISOString();
        this._apply();
      }
    } catch {
      // offline / blocked: keep the current atmosphere silently
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Live sky = live clock too: once per arrival, set the day/night cycle to the real local solar time
   * here (the atmosphere is created before the start teleport, so it would otherwise keep the
   * previous region's clock). ?time= still wins.
   */
  _syncClock(lon, gen) {
    const atmo = this.app.atmosphere;
    if (!atmo || this._clockGen === gen || new URLSearchParams(location.search).has('time')) return;
    this._clockGen = gen;
    const d = new Date();
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    atmo.setTime((((utcH + lon / 15) % 24) + 24) % 24);
  }

  _apply() {
    const atmo = this.app.atmosphere;
    const d = this.data;
    if (!atmo || !d || typeof atmo.setLive !== 'function') return;
    const label = d.tempC == null ? d.icon : `${d.icon} ${d.tempC}°C`;
    atmo.setLive({ weather: d.weather, cloud: d.cloud, rain: d.rain, fog: d.fog, label });
  }

  update(dt) {
    this.time += dt;
    const app = this.app;
    if ((app.teleportGeneration || 0) !== this._gen) {
      this._gen = app.teleportGeneration || 0;
      this.timer = 1.0; // re-fetch once the new region settles
    }
    this.timer -= dt;
    if (this.timer <= 0 && !app.isTeleporting) {
      this.timer = REFRESH_S;
      this._fetch();
    }

    const atmo = app.atmosphere;
    const liveOn = !!(this.data && atmo && atmo.live && !atmo.manual);
    const d = this.data;
    const tw = liveOn ? d.wind : { x: 2.2, z: 0.8 }; // atmosphere's default drift when not live
    const k = 1 - Math.exp(-dt / 4);
    this.wind.x += (tw.x - this.wind.x) * k;
    this.wind.y += (tw.z - this.wind.y) * k;

    // Rain streaks lean with the wind (rain.js uses horizontal m/s against a 9 m/s fall)
    const rf = atmo && atmo.rainFx;
    if (rf && rf.uniforms.uWind) rf.uniforms.uWind.value.set(
      Math.max(-12, Math.min(12, this.wind.x * 0.8)), Math.max(-12, Math.min(12, this.wind.y * 0.8)));

    // Snow
    const tSnow = liveOn ? d.snow : 0;
    this.snowLevel += (tSnow - this.snowLevel) * (1 - Math.exp(-dt / 6));
    const sm = this.snow.mesh;
    sm.visible = this.snowLevel > 0.01;
    if (sm.visible) {
      const u = this.snow.uniforms;
      u.uCam.value.copy(app.camera.position);
      u.uTime.value = this.time;
      u.uWind.value.copy(this.wind);
      const dl = atmo ? Math.max(0.25, atmo.daylight ?? 1) : 1;
      u.uColor.value.setRGB(0.95 * dl + 0.05, 0.96 * dl + 0.05, 0.98 * dl + 0.06);
      u.uOpacity.value = 0.85 * this.snowLevel;
    }

    // Light wind drift on an airborne helicopter (a gentle push, never fights the controls)
    const heli = app.heli;
    if (liveOn && app.mode === 'helicopter' && heli && heli.state && !heli.state.grounded) {
      const ws = Math.min(1.5, this.wind.length() * 0.06);
      const wl = this.wind.length() || 1;
      app.pos.x += (this.wind.x / wl) * ws * dt;
      app.pos.z += (this.wind.y / wl) * ws * dt;
    }
  }

  state() {
    const atmo = this.app.atmosphere;
    return {
      live: !!(atmo && atmo.live && !atmo.manual),
      data: this.data,
      atmosphere: atmo ? atmo.getState() : null,
      snowLevel: Number(this.snowLevel.toFixed(2)),
      wind: [Number(this.wind.x.toFixed(2)), Number(this.wind.y.toFixed(2))],
      pill: document.getElementById('time-btn-label')?.textContent || '',
    };
  }
}

export function initLiveWeather(app) {
  try {
    return new LiveWeather(app);
  } catch (e) {
    console.warn('[live-weather] init failed', e);
    return null;
  }
}
