// STUB (world owns). See DESIGN.md.
export class KaijuDestruction {
  constructor(K) { this.K = K; this.stats = { destroyed: 0, damaged: 0, burning: 0 }; this.onCollapse = null; }
  beginTracking(x, z, radius) {}
  getCityDamage() { return 0; }
  damageSphere(x, y, z, r, amount, opts = {}) { return 0; }
  damageCone(origin, dir, range, halfAngle, amount, opts = {}) { return 0; }
  raycast(origin, dir, maxDist) { return null; }
  applyHit(ref, amount, opts = {}) {}
  getDensestTarget(fromX, fromZ) { return null; }
  update(dt) {}
  restoreAll() {}
}
