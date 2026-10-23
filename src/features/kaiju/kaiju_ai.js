// STUB (creature owns). See DESIGN.md.
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
export class Kaiju {
  constructor(K) { this.K = K; this.position = new THREE.Vector3(); this.yaw = 0; this.maxHp = CFG.KAIJU_HP; this.hp = this.maxHp; this.alive = false; this.state = "idle"; this.enraged = false; this.height = 70; this.breathCharge = 0; this.breathActive = false; this.breathDir = new THREE.Vector3(1, 0, 0); this.breathOrigin = new THREE.Vector3(); this.rising = false; this.hitSpheres = []; }
  spawn(opts) { this.position.set(opts.x, 0, opts.z); this.hp = this.maxHp; this.alive = true; }
  update(dt) {}
  dispose() { this.alive = false; }
  forceHp(v) { this.hp = v; }
  raycast(origin, dir, maxDist) { return null; }
  takeDamage(amount, point, weak) { this.hp = Math.max(0, this.hp - amount); }
  getLockPoint() { return this.position.clone().setY(this.position.y + this.height * 0.6); }
}
