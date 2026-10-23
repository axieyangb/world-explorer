// STUB (game owns). See DESIGN.md.
export class KaijuMode {
  constructor(app) { this.app = app; this.active = false; this.state = "off"; this.paused = false; }
  scaleDt(dt) { return dt; }
  enter() {}
  exit() {}
  update(dt) {}
  postCamera(dt) {}
}
