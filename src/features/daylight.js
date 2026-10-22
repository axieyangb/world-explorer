// Shared daylight contract (owned by feature/atmosphere). This is a minimal stub so feature/places
// runs standalone: it derives daylight from the app's current time-of-day preset.
// If feature/atmosphere provides this file, its version wins at merge time.

const PRESET_ORDER = ['noon', 'sunset', 'night', 'overcast'];
const PRESET_DAYLIGHT = { noon: 1.0, sunset: 0.4, night: 0.0, overcast: 0.7 };

function currentPreset() {
  const api = typeof window !== 'undefined' ? window.__WORLD_EXPLORER__ : null;
  const idx = api && api.app ? api.app.timePresetIdx || 0 : 0;
  return PRESET_ORDER[idx] || 'noon';
}

/** @returns {number} 0 (night) .. 1 (full day) */
export function getDaylight() {
  const v = PRESET_DAYLIGHT[currentPreset()];
  return v === undefined ? 1.0 : v;
}

export function isNight() {
  return getDaylight() < 0.2;
}
