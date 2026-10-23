// STUB (combat owns). See DESIGN.md.
export class KaijuFx {
  constructor(K) { this.K = K; }
  update(dt) {}
  reset() {}
  spawn(type, pos, opts = {}) {}
  addEmitter(type, pos, opts = {}) { return { stop() {}, pos }; }
  addDecal(x, z, yaw, scale) {}
  addTracer(from, to, life) {}
}
