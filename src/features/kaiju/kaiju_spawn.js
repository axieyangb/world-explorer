// STUB (creature owns). See DESIGN.md.
export function pickSpawn(K) {
  const p = K.getHeliPos();
  return { x: p.x + 1500, z: p.z, fromWater: false, targetX: p.x, targetZ: p.z };
}
