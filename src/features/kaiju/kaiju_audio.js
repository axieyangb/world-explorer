// STUB (combat owns). See DESIGN.md.
export class KaijuAudio {
  constructor(K) { this.K = K; this.muted = false; }
  resume() {}
  setMuted(b) { this.muted = !!b; }
  play(name, opts = {}) { return { stop() {} }; }
  startSiren() {}
  stopSiren() {}
  update(dt, listenerPos) {}
  stopAll() {}
}
