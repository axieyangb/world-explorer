// Shared traffic-signal timing (owned by feature/traffic, read by street furniture).
//
// Contract:
//   getSignalPhase(intersectionKey, timeSec?, axis = 'ns') -> 'green' | 'yellow' | 'red'
//   - intersectionKey: `${Math.round(x)},${Math.round(z)}` of the intersection node in world meters.
//     For a chunk "tl" facility [type, fx, fy, fz] (chunk-local, placed at node + 5.5m), use
//     signalKeyFromFacility(fx, fz, ox, oz) so both branches derive the exact same key.
//   - timeSec: shared clock; omit it (or pass signalTime()) so every consumer stays in sync.
//   - axis: 'ns' for approaches running mostly along world Z, 'ew' for mostly along world X
//     (see approachAxis(dx, dz)).
// Cycle: 30s. N-S: 0-13s green, 13-15s yellow, 15-30s red. E-W is the same, offset by 15s.

export const SIGNAL_CYCLE = 30;
const GREEN_END = 13;
const YELLOW_END = 15;

export function signalTime() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

export function signalKeyFromFacility(fx, fz, ox = 0, oz = 0) {
  return `${Math.round(ox + fx - 5.5)},${Math.round(oz + fz - 5.5)}`;
}

export function approachAxis(dx, dz) {
  return Math.abs(dz) >= Math.abs(dx) ? 'ns' : 'ew';
}

function localTime(timeSec, axis) {
  const t = (timeSec === undefined || timeSec === null ? signalTime() : timeSec) + (axis === 'ew' ? 15 : 0);
  return ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
}

// eslint-disable-next-line no-unused-vars
export function getSignalPhase(intersectionKey, timeSec, axis = 'ns') {
  const lt = localTime(timeSec, axis);
  return lt < GREEN_END ? 'green' : lt < YELLOW_END ? 'yellow' : 'red';
}

// Phase plus seconds left in it (used by pedestrians to decide whether to start crossing).
export function getSignalInfo(intersectionKey, timeSec, axis = 'ns') {
  const lt = localTime(timeSec, axis);
  if (lt < GREEN_END) return { phase: 'green', timeLeft: GREEN_END - lt };
  if (lt < YELLOW_END) return { phase: 'yellow', timeLeft: YELLOW_END - lt };
  return { phase: 'red', timeLeft: SIGNAL_CYCLE - lt };
}
