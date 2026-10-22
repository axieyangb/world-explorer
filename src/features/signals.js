// [feature/street] LOCAL STUB of the shared contract owned by feature/traffic (src/features/signals.js).
// Integrator: keep feature/traffic's real implementation and drop this file.
// Contract: getSignalPhase(intersectionKey, timeSec) -> 'green' | 'yellow' | 'red' for the N-S approach.
// intersectionKey = `${Math.round(x)},${Math.round(z)}` (world meters). E-W approaches use timeSec + 15.
export function getSignalPhase(intersectionKey, timeSec) {
  const t = ((timeSec % 30) + 30) % 30;
  if (t < 13) return 'green';
  if (t < 15) return 'yellow';
  return 'red';
}
