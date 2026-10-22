/**
 * Shared daylight contract (owned by feature/atmosphere).
 *
 *   getDaylight() -> number 0..1   1 = full day, 0 = deep night. Already includes weather dimming
 *                                  (heavy cloud / rain / fog makes it darker earlier), so lights that
 *                                  should switch on "when it gets dark" can simply test it.
 *   isNight()     -> boolean       true when getDaylight() < 0.3 (with a little hysteresis).
 *   onDaylightChange(cb) -> unsubscribe fn
 *                                  cb({ daylight, night }) fires when daylight moves by >= 0.01
 *                                  or isNight() flips. Called from the render loop (cheap callbacks only).
 *
 * Extra read-only helpers (optional): getSunDirection() (world unit vector, +x east, +y up, -z north),
 * getWeather() ('clear' | 'cloudy' | 'rain' | 'fog'), getWetness() 0..1.
 *
 * Safe to import from anywhere on the main thread; it has no dependencies. Before the atmosphere system
 * starts, it reports full day.
 */

const state = {
  daylight: 1.0,
  night: false,
  weather: 'clear',
  wetness: 0.0,
  sunDir: [0.45, 0.78, -0.42],
};

const listeners = new Set();
let lastNotified = -1;
let lastNight = false;

export function getDaylight() {
  return state.daylight;
}

export function isNight() {
  return state.night;
}

export function onDaylightChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSunDirection() {
  return state.sunDir;
}

export function getWeather() {
  return state.weather;
}

export function getWetness() {
  return state.wetness;
}

/** Internal: written by src/features/atmosphere.js every frame. */
export function _setDaylightState(daylight, sunDir, weather, wetness) {
  const d = Math.max(0, Math.min(1, daylight));
  state.daylight = d;
  state.night = state.night ? d < 0.34 : d < 0.3;
  if (sunDir) {
    state.sunDir[0] = sunDir.x;
    state.sunDir[1] = sunDir.y;
    state.sunDir[2] = sunDir.z;
  }
  if (weather) state.weather = weather;
  state.wetness = wetness || 0;
  if (Math.abs(d - lastNotified) >= 0.01 || state.night !== lastNight) {
    lastNotified = d;
    lastNight = state.night;
    for (const cb of listeners) {
      try {
        cb({ daylight: d, night: state.night });
      } catch (e) {
        console.warn('daylight listener failed', e);
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.__DAYLIGHT__ = { getDaylight, isNight, onDaylightChange, getSunDirection, getWeather, getWetness };
}
