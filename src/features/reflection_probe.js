// [hero-vehicles] Sky reflection map for the player's vehicle and avatar. The live sky dome (same shader
// and uniforms, so time of day, clouds, aurora and fog all show) is rendered into a prefiltered environment
// map; materials flagged userData.envProbe pick it up. The rest of the world is lit as before.
// The map is only re-rendered when the sky has visibly changed since the last capture (checked every
// REFRESH_S): the prefilter costs 60-175 ms, which used to be a hitch every 2.5 s.
import * as THREE from '../../vendor/three.module.js';

const REFRESH_S = 2.5;
const CHANGE_EPS = 0.03; // per uniform component (colours, intensities, sun / moon direction)
const SKIP_UNIFORMS = new Set(['uTime', 'uStarRot']); // cloud drift / star spin: not worth a re-filter

// Flattens the dome's numeric uniforms into `out`; returns how many values were written.
function readSky(uniforms, out) {
  let n = 0;
  for (const k in uniforms) {
    if (SKIP_UNIFORMS.has(k)) continue;
    const v = uniforms[k] && uniforms[k].value;
    if (typeof v === 'number') out[n++] = v;
    else if (v && v.isColor) { out[n++] = v.r; out[n++] = v.g; out[n++] = v.b; }
    else if (v && v.isVector3) { out[n++] = v.x; out[n++] = v.y; out[n++] = v.z; }
    else if (v && v.isVector2) { out[n++] = v.x; out[n++] = v.y; }
  }
  return n;
}

export class ReflectionProbe {
  constructor(renderer, skyDome) {
    this.renderer = renderer;
    this.skyDome = skyDome;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial());
    this.scene.add(this.mesh);
    this.target = null;
    this._srcMat = null;
    this._timer = REFRESH_S;
    this._seen = []; // sky uniform values at the last capture
    this._now = [];
  }

  _skyChanged() {
    const u = this.mesh.material.uniforms;
    if (!u) return true;
    const now = this._now, seen = this._seen;
    const n = readSky(u, now);
    let changed = !this.target || seen.length !== n;
    for (let i = 0; i < n && !changed; i++) {
      // relative for large values (uAuroraDist is hundreds of metres), absolute otherwise
      if (Math.abs(now[i] - seen[i]) > CHANGE_EPS * Math.max(1, Math.abs(seen[i]))) changed = true;
    }
    if (changed) { seen.length = n; for (let i = 0; i < n; i++) seen[i] = now[i]; }
    return changed;
  }

  // The dome shader writes display-referred colour; the probe needs linear light.
  _syncMaterial() {
    const src = this.skyDome && this.skyDome.mesh && this.skyDome.mesh.material;
    if (!src || !src.isShaderMaterial || src === this._srcMat) return Boolean(src && src.isShaderMaterial);
    this._srcMat = src;
    const frag = src.fragmentShader;
    const end = frag.lastIndexOf('}');
    this.mesh.material.dispose();
    this.mesh.material = new THREE.ShaderMaterial({
      uniforms: src.uniforms,
      vertexShader: src.vertexShader,
      fragmentShader: frag.slice(0, end) + '  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));\n}',
      side: THREE.BackSide,
      depthWrite: false,
    });
    return true;
  }

  get texture() {
    return this.target ? this.target.texture : null;
  }

  update(dt, roots) {
    this._timer += dt;
    if (this._timer >= REFRESH_S && this._syncMaterial()) {
      this._timer = 0;
      if (this._skyChanged()) {
        const old = this.target;
        this.target = this.pmrem.fromScene(this.scene, 0, 0.1, 50);
        if (old) old.dispose();
      }
    }
    const tex = this.texture;
    if (!tex) return;
    for (const root of roots) {
      if (!root || !root.visible) continue;
      root.traverse((o) => {
        const m = o.material;
        if (!m || !m.userData || !m.userData.envProbe || m.envMap === tex) return;
        if (!m.envMap) m.needsUpdate = true;
        m.envMap = tex;
      });
    }
  }

  dispose() {
    if (this.target) this.target.dispose();
    this.pmrem.dispose();
  }
}
