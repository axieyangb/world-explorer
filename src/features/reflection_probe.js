// [hero-vehicles] Sky reflection map for the player's vehicle and avatar. Every few seconds the live sky
// dome (same shader and uniforms, so time of day, clouds, aurora and fog all show) is rendered into a
// prefiltered environment map; materials flagged userData.envProbe pick it up. The rest of the world is
// lit as before.
import * as THREE from '../../vendor/three.module.js';

const REFRESH_S = 2.5;

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
      const old = this.target;
      this.target = this.pmrem.fromScene(this.scene, 0, 0.1, 50);
      if (old) old.dispose();
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
