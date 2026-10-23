// STUB (world owns). See DESIGN.md.
export class KaijuCrowd {
  constructor(K) { this.K = K; this.stats = { fleeing: 0, carsDestroyed: 0 }; }
  activate() {}
  deactivate() {}
  update(dt) {}
  addThreat(x, z, radius, seconds) {}
  burnZone(x, z, radius) {}
}
