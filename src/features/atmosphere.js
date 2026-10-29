import * as THREE from '../../vendor/three.module.js';
import { getLang, onLanguageChange } from '../i18n.js';
import { createSkyMaterial } from './sky.js';
import { createRain } from './rain.js';
import { SURFACE_UNIFORMS, installSurfaceShaders } from './surfaces.js';
import { _setDaylightState } from './daylight.js';
import { initNightLights, NIGHT_LIGHT_UNIFORMS } from './night_lights.js'; // [night]

/**
 * Atmosphere system: continuous day/night cycle (real solar position at the current lat/lon,
 * 1 game day = 24 real minutes, starting from the real local solar time), moon + stars, weather
 * (clear / cloudy / rain / fog) with smooth transitions, and the single "time & weather" dock pill.
 *
 * Wiring (main.js): `this.atmosphere = initAtmosphere(this)` after the sky dome + shared materials
 * exist, and `this.atmosphere.update(dt)` once per frame. Everything else is driven from here.
 *
 * The clock follows real local time by default (re-synced on every teleport); picking a time in the
 * menu or ?time= switches to a fast day cycle until "Now" is picked again.
 * URL overrides for testing/sharing: ?time=18.5  (local solar hour)  &weather=rain
 * Debug handle: window.__ATMOSPHERE__ = { setTime(h), jumpTo(h), setWeather(w), getState() }.
 */

const GAME_HOURS_PER_SEC = 1 / 60; // 24 game hours per 24 real minutes
const DEG = Math.PI / 180;

// Look keyframes, taken from the original noon / sunset / night / overcast presets.
const KF = {
  day: {
    zenith: 0x2b6cb0, horizon: 0xbfd8ec, ground: 0x636e72, fog: 0.00011, sunCol: 0xfff4dc, sunInt: 1.55,
    hemiSky: 0xe2f1ff, hemiGround: 0x687064, hemiInt: 0.95, ambCol: 0xffffff, ambInt: 0.35,
    cloudLit: 0xffffff, cloudDark: 0x9aa6b4,
  },
  sunset: {
    zenith: 0x2f4272, horizon: 0xf08c5b, ground: 0x4a3b36, fog: 0.00016, sunCol: 0xff9a52, sunInt: 1.75,
    hemiSky: 0xf0c0a4, hemiGround: 0x5a5060, hemiInt: 0.92, ambCol: 0xc0a0a0, ambInt: 0.45,
    cloudLit: 0xf6b48a, cloudDark: 0x6a5664,
  },
  // [night] a real night: dim blue moonlight + sky fill instead of an evenly lit blue-grey day; streets get
  // their light from lamps, shops and headlights (night_lights.js), the horizon from the city glow below
  night: {
    zenith: 0x040a1a, horizon: 0x15233f, ground: 0x0e1420, fog: 0.00013, sunCol: 0x8aa6e8, sunInt: 0.42,
    hemiSky: 0x3e5a96, hemiGround: 0x1c2232, hemiInt: 0.62, ambCol: 0x3a4c76, ambInt: 0.34,
    cloudLit: 0x3a4660, cloudDark: 0x1c2333,
  },
  overcast: {
    zenith: 0x7c8b99, horizon: 0xb8c4cf, ground: 0x5c646b, fog: 0.00028, sunCol: 0xe2e8f0, sunInt: 0.85,
    hemiSky: 0xc8d4e0, hemiGround: 0x666e75, hemiInt: 0.95, ambCol: 0xd8e0e8, ambInt: 0.45,
    cloudLit: 0xb4bdc6, cloudDark: 0x737d88,
  },
};
const COLOR_KEYS = ['zenith', 'horizon', 'ground', 'sunCol', 'hemiSky', 'hemiGround', 'ambCol', 'cloudLit', 'cloudDark'];
const KFC = {};
for (const [name, kf] of Object.entries(KF)) {
  KFC[name] = {};
  for (const k of COLOR_KEYS) KFC[name][k] = new THREE.Color(kf[k]);
}
const NIGHT_OVERCAST_TINT = new THREE.Color(0x1d232c);
// [night] sodium / LED sky glow over a lit city (horizon, fog and cloud bases) and share of rooms lit by local hour
const CITY_GLOW = new THREE.Color(0.55, 0.36, 0.2);
const GOLDEN_AERIAL_TINT = new THREE.Color(0xff944d);
const LIT_BY_HOUR = [0.3, 0.22, 0.15, 0.11, 0.1, 0.13, 0.24, 0.32, 0.3, 0.26, 0.26, 0.26, 0.26, 0.26, 0.26, 0.28, 0.36,
  0.48, 0.6, 0.66, 0.64, 0.58, 0.5, 0.4];
function litFraction(h) {
  const i = Math.floor(h) % 24, f = h - Math.floor(h);
  return LIT_BY_HOUR[i] + (LIT_BY_HOUR[(i + 1) % 24] - LIT_BY_HOUR[i]) * f;
}
const FOG_GREY = new THREE.Color(0xa9b2ba);

const WEATHER = {
  clear: { cloud: 0.16, rain: 0, fog: 0 },
  cloudy: { cloud: 0.72, rain: 0, fog: 0 },
  rain: { cloud: 0.96, rain: 1, fog: 0.2 },
  fog: { cloud: 0.62, rain: 0, fog: 1 },
};
const WEATHER_ORDER = ['clear', 'cloudy', 'rain', 'fog'];

const LABELS = {
  en: { time: 'Time', weather: 'Weather', now: 'Now', dawn: 'Dawn', noon: 'Noon', dusk: 'Dusk', night: 'Night',
    clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', fog: 'Fog' },
  zh: { time: '时间', weather: '天气', now: '现在', dawn: '清晨', noon: '正午', dusk: '黄昏', night: '夜晚',
    clear: '晴', cloudy: '多云', rain: '雨', fog: '雾' },
};

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function dayOfYear(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return (d.getTime() - start) / 86400000;
}

function moonPhaseAt(d) {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((d.getTime() - ref) / 86400000) / 29.530588;
  return p - Math.floor(p);
}

/** ENU sun/moon direction -> world (+x east, +y up, -z north). */
function celestialDir(out, latRad, decRad, hourAngleRad) {
  const sl = Math.sin(latRad), cl = Math.cos(latRad);
  const sd = Math.sin(decRad), cd = Math.cos(decRad);
  const ch = Math.cos(hourAngleRad), sh = Math.sin(hourAngleRad);
  const up = sl * sd + cl * cd * ch;
  const east = -cd * sh;
  const north = cl * sd - sl * cd * ch;
  return out.set(east, up, -north).normalize();
}

class AtmosphereSystem {
  constructor(app) {
    this.app = app;
    const params = new URLSearchParams(window.location.search);
    const now = new Date();
    const qt = parseFloat(params.get('time'));
    this.realtime = !Number.isFinite(qt);
    this.utcOffsetH = null; // civil UTC offset here, from live weather; null = show solar time
    this.hour = this.realtime ? this._realSolarHour(now) : ((qt % 24) + 24) % 24;
    this.dayN = dayOfYear(now);
    this.moonPhase0 = moonPhaseAt(now);
    this.elapsedDays = 0;
    this.targetHour = null;
    this.time = 0;

    const qw = params.get('weather');
    this.weather = WEATHER[qw] ? qw : 'clear';
    // [live-weather] live targets from live_weather.js; a manual pick (menu or ?weather=) wins
    this.live = null;
    this.manual = !!WEATHER[qw];
    const w0 = WEATHER[this.weather];
    this.cloud = w0.cloud;
    this.rain = w0.rain;
    this.fog = w0.fog;
    this.wet = w0.rain;

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.keyDir = new THREE.Vector3();
    this.lastShadowDir = new THREE.Vector3();
    this.shadowTimer = 0;
    this.labelTimer = 0;
    this.starRot = new THREE.Matrix3();
    this._tmp = new THREE.Color();
    this._fogGrey = new THREE.Color();
    this._aerialCol = new THREE.Color();
    this._bldgMatList = null;
    this._c = {};
    for (const k of COLOR_KEYS) this._c[k] = new THREE.Color();

    // Sky: swap the dome material in place (keeps mesh, render order and follow-camera logic).
    const sky = createSkyMaterial();
    this.sky = sky;
    if (app.skyDome && app.skyDome.mesh) {
      const old = app.skyDome.mesh.material;
      app.skyDome.mesh.material = sky.material;
      app.skyDome.uniforms = sky.uniforms;
      if (old && old.dispose) old.dispose();
    }

    this.rainFx = createRain();
    app.scene.add(this.rainFx.mesh);

    installSurfaceShaders(app.mats);
    this.nightLights = initNightLights(app); // [night] lamp / shop / headlight pools on the ground
    this._glowCol = new THREE.Color();

    this._buildUi();
    this.update(0);

    window.__ATMOSPHERE__ = {
      setTime: (hh) => this.setTime(hh),
      jumpTo: (hh) => this.jumpTo(hh),
      presetHour: (n) => this.presetHour(n),
      setWeather: (w) => this.setWeather(w, true),
      getState: () => this.getState(),
      _rainMesh: () => this.rainFx.mesh,
    };
  }

  getState() {
    return {
      hour: Number(this.hour.toFixed(3)),
      realtime: this.realtime,
      utcOffsetH: this.utcOffsetH,
      weather: this.weather,
      sunElevationDeg: Number((Math.asin(this.sunDir.y) / DEG).toFixed(2)),
      daylight: Number(this.daylight.toFixed(3)),
      cloud: Number(this.cloud.toFixed(2)),
      rain: Number(this.rain.toFixed(2)),
      fog: Number(this.fog.toFixed(2)),
      wet: Number(this.wet.toFixed(2)),
      fogDensity: this.app.scene.fog ? this.app.scene.fog.density : 0,
      exposure: this.app.renderer.toneMappingExposure,
    };
  }

  /** Instantly set local solar hour. */
  setTime(h) {
    this.hour = ((Number(h) % 24) + 24) % 24;
    this.targetHour = null;
    this.realtime = false;
  }

  /** Smoothly fast-forward the clock to the given local solar hour. */
  jumpTo(h) {
    this.targetHour = ((Number(h) % 24) + 24) % 24;
    this.realtime = false;
  }

  /** Back to real local time: fast-forward to now, then follow the real clock. */
  goLive() {
    this.jumpTo(this._realSolarHour(new Date()));
    this.realtime = true;
    this._refreshUi();
  }

  _lon() {
    const o = this.app.worldOrigin;
    const p = this.app.pos;
    if (!o || !o.mPerDegLon || !p) return o?.centerLon ?? 0;
    return o.centerLon + p.x / o.mPerDegLon;
  }

  /** Local solar hour (what the sun does here) for a real moment. */
  _realSolarHour(d) {
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    return (((utcH + this._lon() / 15) % 24) + 24) % 24;
  }

  /** [live-weather] Continuous targets {weather, cloud, rain, fog, label} from real weather. */
  setLive(live) {
    this.live = live;
    if (live && Number.isFinite(live.utcOffsetH)) this.utcOffsetH = live.utcOffsetH;
    if (!this.manual && live && WEATHER[live.weather]) this.weather = live.weather;
    this._refreshUi();
  }

  setWeather(w, instant = false) {
    if (!WEATHER[w]) return;
    this.weather = w;
    this.manual = true; // [live-weather]
    if (instant) {
      const t = WEATHER[w];
      this.cloud = t.cloud;
      this.rain = t.rain;
      this.fog = t.fog;
      this.wet = t.rain;
    }
    this._refreshUi();
  }

  _sunriseHours(latRad, decRad) {
    const c = -Math.tan(latRad) * Math.tan(decRad);
    if (c <= -1) return 0.5; // polar day
    if (c >= 1) return 11.5; // polar night
    return 12 - Math.acos(c) / (15 * DEG);
  }

  presetHour(name) {
    const latRad = (this.app.worldOrigin?.centerLat ?? 39.9) * DEG;
    const dec = -23.44 * DEG * Math.cos((2 * Math.PI * (this.dayN + this.elapsedDays + 10)) / 365);
    const rise = this._sunriseHours(latRad, dec);
    if (name === 'dawn') return rise + 0.35;
    if (name === 'noon') return 12.5;
    if (name === 'dusk') return 24 - rise - 0.45;
    return 23.0;
  }

  _advanceClock(dt) {
    if (this.realtime && this.targetHour === null) {
      const now = new Date();
      const h = this._realSolarHour(now);
      if (h < this.hour - 12) this.elapsedDays += 1; // passed midnight
      this.hour = h;
      return;
    }
    let dh = dt * GAME_HOURS_PER_SEC;
    if (this.targetHour !== null) {
      let remaining = this.targetHour - this.hour;
      if (remaining < 0) remaining += 24;
      const rate = Math.max(0.6, Math.min(7.0, remaining * 2.2));
      dh = Math.min(remaining, rate * dt);
      if (remaining - dh < 1e-3) this.targetHour = null;
    }
    this.hour += dh;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.elapsedDays += 1;
    }
  }

  update(dt) {
    const app = this.app;
    this.time += dt;
    if ((app.teleportGeneration || 0) !== this._gen) {
      this._gen = app.teleportGeneration || 0;
      this.utcOffsetH = null; // new place: solar time until its live weather reports the offset
    }
    this._advanceClock(dt);

    // Weather easing (~6 s for sky/fog, wetness builds in ~15 s and dries in ~60 s)
    const tgt = (!this.manual && this.live) || WEATHER[this.weather]; // [live-weather]
    const k = 1 - Math.exp(-dt / 6);
    this.cloud = lerp(this.cloud, tgt.cloud, k);
    this.rain = lerp(this.rain, tgt.rain, k);
    this.fog = lerp(this.fog, tgt.fog, k);
    const wetK = 1 - Math.exp(-dt / (tgt.rain > this.wet ? 15 : 60));
    this.wet = lerp(this.wet, tgt.rain, wetK);

    // Celestial positions
    const latRad = (app.worldOrigin?.centerLat ?? 39.9) * DEG;
    const days = this.dayN + this.elapsedDays + this.hour / 24;
    const dec = -23.44 * DEG * Math.cos((2 * Math.PI * (days + 10)) / 365);
    const H = (this.hour - 12) * 15 * DEG;
    celestialDir(this.sunDir, latRad, dec, H);
    const phase = (this.moonPhase0 + (this.elapsedDays + this.hour / 24) / 29.530588) % 1;
    celestialDir(this.moonDir, latRad, -dec * Math.cos(2 * Math.PI * phase) * 0.9, H - phase * 2 * Math.PI);

    // Star sphere rotation: rows = east', q', pole in world space
    // pole P = (0, sinLat, -cosLat), east E = (1,0,0), Q = P x E = (0, -cosLat, -sinLat)
    const sl = Math.sin(latRad), cl = Math.cos(latRad);
    const sid = H + (days / 365.25) * 2 * Math.PI;
    const cs = Math.cos(sid), sn = Math.sin(sid);
    // rows: E' = E cos + Q sin, Q' = Q cos - E sin, P
    this.starRot.set(cs, -cl * sn, -sl * sn, -sn, -cl * cs, -sl * cs, 0, sl, -cl);

    const s = this.sunDir.y;
    const dayW = smooth(0.0, 0.32, s);
    const nightW = 1 - smooth(-0.16, -0.03, s);
    const setW = Math.max(0, 1 - dayW - nightW);
    const ovc = smooth(0.3, 0.95, this.cloud);
    const rain = this.rain;
    const fog = this.fog;

    // Blend colors: time keyframes, then weather
    const c = this._c;
    for (const key of COLOR_KEYS) {
      const col = c[key];
      col.setRGB(0, 0, 0);
      col.r = KFC.day[key].r * dayW + KFC.sunset[key].r * setW + KFC.night[key].r * nightW;
      col.g = KFC.day[key].g * dayW + KFC.sunset[key].g * setW + KFC.night[key].g * nightW;
      col.b = KFC.day[key].b * dayW + KFC.sunset[key].b * setW + KFC.night[key].b * nightW;
      col.lerp(KFC.overcast[key], ovc * (1 - nightW) * 0.9);
      if (key !== 'sunCol' && key !== 'hemiSky' && key !== 'ambCol') col.lerp(NIGHT_OVERCAST_TINT, ovc * nightW * 0.45);
      if (rain > 0.001 && key !== 'sunCol') col.multiplyScalar(1 - 0.22 * rain);
    }
    const blendNum = (key) => KF.day[key] * dayW + KF.sunset[key] * setW + KF.night[key] * nightW;
    const dayishOvc = ovc * (1 - nightW);

    // Raw daylight from sun elevation, then weather dimming -> shared contract
    const rawDaylight = smooth(-0.1, 0.22, s);
    this.daylight = Math.max(0, Math.min(1, rawDaylight * (1 - 0.3 * ovc - 0.12 * rain - 0.2 * fog)));
    const darkness = 1 - this.daylight;
    const dark2 = darkness * darkness;

    // Key light: sun while it is up, a moon-ish light at night; direction swaps when intensity ~0
    const sunSide = s > -0.05;
    let keyInt;
    if (sunSide) {
      keyInt = (KF.day.sunInt * dayW + KF.sunset.sunInt * setW) * smooth(-0.05, 0.04, s);
      this.keyDir.copy(this.sunDir);
      if (this.keyDir.y < 0.12) {
        this.keyDir.y = 0.12;
        this.keyDir.normalize();
      }
    } else {
      keyInt = KF.night.sunInt * nightW * smooth(-0.05, -0.12, s);
      const m = this.moonDir;
      this.keyDir.set(m.x, Math.max(Math.abs(m.y), 0.45), m.z).normalize();
    }
    keyInt *= 1 - 0.5 * dayishOvc - 0.25 * ovc * nightW;
    keyInt *= 1 - 0.25 * rain - 0.35 * fog;

    const hemiInt = lerp(blendNum('hemiInt'), KF.overcast.hemiInt, dayishOvc) * (1 - 0.12 * rain);
    const ambInt = lerp(blendNum('ambInt'), KF.overcast.ambInt, dayishOvc);
    let fogDensity = lerp(blendNum('fog'), KF.overcast.fog, dayishOvc);
    fogDensity = Math.max(fogDensity, 0.00042 * rain);
    fogDensity = lerp(fogDensity, 0.0021, fog);

    const skyGlow = setW * (1 - 0.8 * ovc) * (1 - fog) * 0.65;
    // Aerial perspective / distance fog tint: smoothly blends horizon color with warm golden-hour Rayleigh-Mie
    // glow at dawn/dusk and subtle Rayleigh sky scatter by day (zero per-frame allocations).
    const fogCol = this._tmp.copy(c.horizon);
    if (dayW > 0.001) {
      fogCol.lerp(c.hemiSky, dayW * (1 - ovc) * (1 - fog) * 0.08);
    }
    if (skyGlow > 0.001) {
      fogCol.lerp(this._aerialCol.copy(GOLDEN_AERIAL_TINT), skyGlow * 0.28);
    }
    fogCol.lerp(
      this._fogGrey.copy(FOG_GREY).multiplyScalar(0.12 + 0.88 * rawDaylight),
      Math.min(1, fog + 0.4 * rain)
    );
    // [night] urban light pollution: grows with how many street lamps are around (rural places stay dark),
    // brighter under cloud / in fog where the light scatters back down
    const lampOn = 1 - smooth(0.15, 0.6, this.daylight);
    const nl = this.nightLights;
    const urban = nl ? smooth(30, 700, nl.lampCount()) : 0;
    this._urban = this._urban === undefined ? urban : lerp(this._urban, urban, 1 - Math.exp(-dt / 4));
    const cityGlow = lampOn * nightW * (0.25 + 0.75 * this._urban) * (1 + 0.8 * ovc + 0.6 * fog);
    if (cityGlow > 0.001) fogCol.add(this._glowCol.copy(CITY_GLOW).multiplyScalar(0.06 * cityGlow));

    // Apply lights
    if (app.sunLight) {
      app.sunLight.color.copy(c.sunCol);
      app.sunLight.intensity = keyInt;
    }
    if (app.hemiLight) {
      app.hemiLight.color.copy(c.hemiSky);
      app.hemiLight.groundColor.copy(c.hemiGround);
      app.hemiLight.intensity = hemiInt;
    }
    if (app.ambientLight) {
      app.ambientLight.color.copy(c.ambCol);
      app.ambientLight.intensity = ambInt;
    }
    if (app.scene.fog) {
      app.scene.fog.color.copy(fogCol);
      app.scene.fog.density = fogDensity;
    }
    if (app.scene.background && app.scene.background.isColor) app.scene.background.copy(fogCol);
    app.renderer.toneMappingExposure = 1.12 + 0.06 * setW + 0.06 * dayishOvc;

    // Night emissives follow darkness smoothly (zero-allocation cached list)
    const mats = app.mats;
    if (mats && mats.buildingMats) {
      const em = 0.06 + (1.25 - 0.06) * dark2;
      const bList = this._bldgMatList || (this._bldgMatList = Object.values(mats.buildingMats));
      for (let i = 0; i < bList.length; i++) bList[i].emissiveIntensity = em;
    }
    if (mats && mats.wfcBldgMat && mats.wfcBldgMat.userData.nightUniforms) {
      const nu = mats.wfcBldgMat.userData.nightUniforms;
      nu.uNightEmissive.value = 0.04 + (1.85 - 0.04) * dark2;
      if (nu.uLitFrac) nu.uLitFrac.value = litFraction(this.hour); // [night]
      if (nu.uNightClock) nu.uNightClock.value = this.time;
    }
    const lodU = app.skylineInstanced?.material?.userData?.lodNightUniforms;
    if (lodU) lodU.uLodNightEmissive.value = 1.25 * dark2;
    if (app.playerLight) {
      app.playerLight.intensity = 4.0 * dark2; // [night] was 14: it flood-lit the whole street; headlights / lamps do that now
      app.playerLight.distance = 65;
    }

    // Sky
    const u = this.sky.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    u.uZenithColor.value.copy(c.zenith);
    u.uHorizonColor.value.copy(c.horizon);
    u.uGroundColor.value.copy(c.ground);
    u.uSunColor.value.copy(c.sunCol);
    u.uSunIntensity.value = smooth(-0.06, 0.04, s) * (1 - 0.85 * ovc) * (1 - fog);
    u.uMoonIntensity.value =
      (0.3 + 0.7 * nightW) * smooth(-0.02, 0.06, this.moonDir.y) * (1 - 0.9 * ovc) * (1 - fog);
    u.uStars.value = nightW * (1 - ovc) * (1 - fog);
    u.uStarRot.value.copy(this.starRot);
    u.uGlow.value = skyGlow;
    if (u.uCityGlow) u.uCityGlow.value = cityGlow; // [night]
    u.uCloudCover.value = this.cloud;
    u.uCloudLit.value.copy(c.cloudLit);
    u.uCloudDark.value.copy(c.cloudDark);
    u.uFogMix.value = Math.min(1, fog * 0.9 + rain * 0.35);
    // sky shader writes raw (no tone map / sRGB), so hand it the display-space fog color to match fogged terrain
    u.uFogColor.value.copy(fogCol).convertLinearToSRGB().multiplyScalar(0.9);
    u.uHazeColor.value.copy(fogCol).convertLinearToSRGB(); // [ground] = what the fog paints on the far terrain
    u.uHaze.value = 1.0;
    u.uTime.value = this.time;

    // Surfaces (water / wet roads)
    SURFACE_UNIFORMS.uAtmoTime.value = this.time;
    SURFACE_UNIFORMS.uWet.value = this.wet;
    SURFACE_UNIFORMS.uRain.value = rain;
    SURFACE_UNIFORMS.uSkyZenith.value.copy(c.zenith).lerp(fogCol, fog * 0.8);
    SURFACE_UNIFORMS.uSkyHorizon.value.copy(c.horizon).lerp(fogCol, fog * 0.8);
    SURFACE_UNIFORMS.uLightLevel.value = 0.12 + 0.88 * this.daylight;
    SURFACE_UNIFORMS.uNightGlow.value = dark2;
    if (nl) { // [night]
      NIGHT_LIGHT_UNIFORMS.uNightRoadGlow.value.setRGB(0.9, 0.58, 0.3).multiplyScalar(0.4 + 0.6 * this._urban);
      nl.update(lampOn);
    }

    // Rain particles
    const rf = this.rainFx;
    rf.mesh.visible = rain > 0.01;
    if (rf.mesh.visible) {
      rf.uniforms.uCam.value.copy(app.camera.position);
      rf.uniforms.uTime.value = this.time;
      rf.uniforms.uOpacity.value = 0.55 * rain;
      rf.uniforms.uColor.value.copy(c.hemiSky).multiplyScalar(0.3 + 0.75 * this.daylight);
    }

    // Shadow/key light direction: hand to main.js' throttled shadow block. Re-aim at most every
    // 0.5 s and only once the direction moved > ~0.15 deg (or instantly when it jumps a lot).
    if (app.sunDir) {
      this.shadowTimer += dt;
      const cosDelta = this.lastShadowDir.dot(this.keyDir);
      if ((this.shadowTimer > 0.5 && cosDelta < 0.9999966) || cosDelta < 0.995) {
        this.shadowTimer = 0;
        this.lastShadowDir.copy(this.keyDir);
        app.sunDir.copy(this.keyDir);
        app._lastShadowFocusX = 1e9; // forces main.js to re-place sunLight next frame
      }
    }

    _setDaylightState(this.daylight, this.sunDir, this.weather, this.wet);

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.5;
      this._refreshLabel();
    }
  }

  _t(key) {
    return (LABELS[getLang() === 'zh' ? 'zh' : 'en'] || LABELS.en)[key];
  }

  _buildUi() {
    const btn = document.getElementById('time-btn');
    if (!btn) return;
    this.labelEl = document.getElementById('time-btn-label');
    btn.title = 'Time & weather';
    const wrap = document.createElement('div');
    wrap.className = 'dock-dropdown-wrap';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    const pop = document.createElement('div');
    pop.className = 'dock-popover hidden';
    pop.id = 'atmo-menu';
    pop.style.width = '264px';
    const row = (items, kind) =>
      `<div class="popover-mode-row" style="grid-template-columns:repeat(${items.length},1fr)">${items
        .map((it) => `<button type="button" class="popover-mode-btn" data-${kind}="${it}"></button>`)
        .join('')}</div>`;
    pop.innerHTML =
      `<div class="popover-label" data-atmo="time"></div>${row(['now', 'dawn', 'noon', 'dusk', 'night'], 'atmo-time')}` +
      `<div class="popover-label" data-atmo="weather"></div>${row(WEATHER_ORDER, 'atmo-weather')}`;
    wrap.appendChild(pop);
    this.popEl = pop;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.classList.toggle('hidden');
    });
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.atmoTime === 'now') this.goLive();
      else if (b.dataset.atmoTime) { this.jumpTo(this.presetHour(b.dataset.atmoTime)); this._refreshUi(); }
      if (b.dataset.atmoWeather) this.setWeather(b.dataset.atmoWeather);
    });
    document.addEventListener('click', () => pop.classList.add('hidden'));
    onLanguageChange(() => this._refreshUi());
    this._refreshUi();
  }

  _refreshUi() {
    if (!this.popEl) return;
    for (const el of this.popEl.querySelectorAll('[data-atmo]')) el.textContent = this._t(el.dataset.atmo);
    for (const b of this.popEl.querySelectorAll('[data-atmo-time]')) b.textContent = this._t(b.dataset.atmoTime);
    for (const b of this.popEl.querySelectorAll('[data-atmo-weather]')) {
      b.textContent = this._t(b.dataset.atmoWeather);
      b.classList.toggle('active', b.dataset.atmoWeather === this.weather);
    }
    this._refreshLabel();
  }

  _refreshLabel() {
    if (this.popEl) {
      // main.js re-syncs every .popover-mode-btn's "active" to the drive mode; keep ours correct
      for (const b of this.popEl.querySelectorAll('[data-atmo-weather]')) {
        const on = b.dataset.atmoWeather === this.weather;
        if (b.classList.contains('active') !== on) b.classList.toggle('active', on);
      }
      for (const b of this.popEl.querySelectorAll('[data-atmo-time]')) {
        const on = b.dataset.atmoTime === 'now' && this.realtime;
        if (b.classList.contains('active') !== on) b.classList.toggle('active', on);
      }
    }
    if (!this.labelEl) return;
    // Live: the real wall-clock time here (once the UTC offset is known); otherwise the solar hour.
    let shown = this.hour;
    if (this.realtime && this.targetHour === null && this.utcOffsetH !== null) {
      const d = new Date();
      shown = ((((d.getUTCHours() + d.getUTCMinutes() / 60 + this.utcOffsetH) % 24) + 24) % 24);
    }
    const hh = Math.floor(shown);
    const mm = Math.floor((shown - hh) * 60);
    let txt = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (!this.manual && this.live && this.live.label) txt += ` · ${this.live.label}`; // [live-weather]
    else if (this.weather !== 'clear') txt += ` · ${this._t(this.weather)}`;
    if (this.labelEl.textContent !== txt) this.labelEl.textContent = txt;
  }
}

export function initAtmosphere(app) {
  try {
    return new AtmosphereSystem(app);
  } catch (e) {
    console.warn('[atmosphere] init failed', e);
    return null;
  }
}
