// [feature/street] LOCAL STUB of the shared contract owned by feature/atmosphere (src/features/daylight.js).
// Integrator: keep feature/atmosphere's real implementation and drop this file.
// Derives daylight from the current time-of-day preset label in the HUD (no hooks needed).
let labelEl = null;
export function getDaylight() {
  if (typeof document === 'undefined') return 1;
  if (!labelEl || !labelEl.isConnected) labelEl = document.getElementById('time-btn-label');
  const txt = labelEl ? (labelEl.textContent || '').trim().toUpperCase() : '';
  if (txt === 'NIGHT' || txt === '夜景') return 0.0;
  if (txt === 'SUNSET' || txt === '黄昏' || txt === '日落' || txt === '傍晚') return 0.35;
  if (txt === 'OVERCAST' || txt === '阴天') return 0.75;
  return 1.0;
}
export function isNight() {
  return getDaylight() < 0.25;
}
