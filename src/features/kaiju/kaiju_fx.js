// Kaiju Defense: pooled GPU particles, persistent emitters, footprint decals.
//
// Particles are simulated analytically in the vertex shader: each one stores its spawn state
// (position, velocity, spawn time, life, drag, vertical acceleration) and the GPU evaluates the
// closed-form trajectory every frame. CPU work is only the write at spawn time into a ring buffer,
// uploaded with addUpdateRange. Pause / slow-mo come for free (the clock advances by scaled dt).
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
import { getBeijingTerrainElevation } from "../../environment.js";
import { getDaylight } from "../daylight.js";

const RAMP_W = 32;
// Ramp rows: [ [t, hexColor, alpha], ... ] sampled by normalized age.
const RAMPS = {
  spark:     [[0, 0xffffff, 1], [0.15, 0xfff0b0, 1], [0.5, 0xffa040, 0.9], [1, 0xc03010, 0]],
  tracer:    [[0, 0xfff4c8, 1], [0.9, 0xffc060, 1], [1, 0xff8030, 0]],
  muzzle:    [[0, 0xffffff, 1], [0.3, 0xffe0a0, 0.9], [1, 0xff8020, 0]],
  fireball:  [[0, 0xffffff, 1], [0.12, 0xffe6a0, 1], [0.35, 0xffa040, 0.85], [0.7, 0xc04010, 0.45], [1, 0x301008, 0]],
  fire:      [[0, 0xfff0c0, 0], [0.1, 0xffd070, 0.9], [0.45, 0xff8a28, 0.75], [0.8, 0xb83010, 0.3], [1, 0x200804, 0]],
  flameCore: [[0, 0xfff6e0, 0.9], [0.4, 0xffd890, 0.7], [1, 0xff9a40, 0]],
  flame:     [[0, 0xffd090, 0.3], [0.1, 0xffb050, 0.55], [0.3, 0xff8228, 0.55], [0.6, 0xc8400e, 0.35], [1, 0x200804, 0]],
  smoke:     [[0, 0x3a3836, 0], [0.08, 0x2e2c2a, 0.7], [0.5, 0x3c3a38, 0.5], [1, 0x55524e, 0]],
  smokeLight:[[0, 0x9a9690, 0], [0.08, 0x8a8682, 0.55], [0.5, 0x8c8884, 0.35], [1, 0xa09c98, 0]],
  flameSmoke:[[0, 0x201a16, 0], [0.3, 0x1c1814, 0], [0.5, 0x262220, 0.55], [1, 0x403c3a, 0]],
  dust:      [[0, 0x8a7c68, 0], [0.06, 0x80745f, 0.8], [0.5, 0x8c8272, 0.55], [1, 0x9a9284, 0]],
  debris:    [[0, 0x2a2622, 1], [0.85, 0x2a2622, 1], [1, 0x2a2622, 0]],
  trail:     [[0, 0xe8e4de, 0], [0.04, 0xdedad4, 0.6], [0.4, 0xc8c4be, 0.35], [1, 0xc0bcb6, 0]],
};
const ROW = {};
Object.keys(RAMPS).forEach((k, i) => { ROW[k] = i; });

const SHAPE_SOFT = 0, SHAPE_CHUNK = 1, STREAK = 2; // shape >= 2 => streak, tail = shape - 2 (s)

const VERT = /* glsl */ `
attribute vec4 aP0;   // xyz, t0
attribute vec4 aV0;   // velocity, life
attribute vec4 aSz;   // size0, size1, drag, accelY
attribute vec4 aMisc; // rot0, rotSpeed, rampRow, shape
attribute vec4 aTint; // rgb gain, groundY
uniform float uTime;
uniform float uRows;
uniform sampler2D uRamp;
uniform float uFogDensity;
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
varying float vSeed;
varying float vFog;
varying float vAge;

vec3 posAt(float t) {
  float k = aSz.z;
  vec3 a = vec3(0.0, aSz.w, 0.0);
  vec3 p;
  if (k > 1e-3) {
    float e = (1.0 - exp(-k * t)) / k;
    p = aP0.xyz + (a / k) * t + (aV0.xyz - a / k) * e;
  } else {
    p = aP0.xyz + aV0.xyz * t + 0.5 * a * t * t;
  }
  p.y = max(p.y, aTint.w);
  return p;
}

void main() {
  float age = uTime - aP0.w;
  float life = aV0.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float f = age / life;
  vec4 ramp = texture2D(uRamp, vec2(f * ${((RAMP_W - 1) / RAMP_W).toFixed(5)} + ${(0.5 / RAMP_W).toFixed(5)}, (aMisc.z + 0.5) / uRows));
  float g = 1.0 - (1.0 - f) * (1.0 - f);
  vec4 mv = viewMatrix * vec4(posAt(age), 1.0);
  // Clamp screen coverage (fill-rate guard): at most ~half the view height.
  float size = min(mix(aSz.x, aSz.y, g), max(-mv.z, 0.0) * 0.55 + 0.5);
  if (aMisc.w >= 2.0) {
    vec4 mv2 = viewMatrix * vec4(posAt(max(age - (aMisc.w - 2.0), 0.0)), 1.0);
    vec3 axis = mv.xyz - mv2.xyz;
    float len = length(axis);
    vec3 ax = len > 1e-4 ? axis / len : vec3(0.0, 1.0, 0.0);
    vec3 side = normalize(cross(ax, normalize(mv.xyz)));
    float w = max(size, -mv.z * 0.0024); // keep streaks >= ~1.5 px wide at range
    vec3 p = mix(mv2.xyz, mv.xyz, position.y + 0.5) + side * position.x * w + ax * position.y * w;
    mv = vec4(p, 1.0);
  } else {
    float rot = aMisc.x + aMisc.y * age;
    float c = cos(rot), s = sin(rot);
    mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
  }
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  float dist = -mv.z;
  // Fade sprites that swallow the camera (looks better, saves fill rate).
  float near = smoothstep(size * 0.35, size * 1.2 + 1.0, dist);
  if (near < 0.002) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vCol = vec4(ramp.rgb * ramp.rgb * aTint.rgb, ramp.a * near);
  vShape = aMisc.w;
  vSeed = fract(aMisc.x * 0.1591 + aMisc.z * 0.37);
  vAge = age;
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uAdditive;
uniform float uGain;
uniform float uAmbient;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
varying float vSeed;
varying float vFog;
varying float vAge;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r2 = dot(c, c);
  float a;
  if (vShape < 0.5) {
    if (r2 >= 1.0) discard;
    float n = texture2D(uNoise, vUv * 0.55 + vec2(vSeed, vSeed * 1.7)).r;
    float n2 = texture2D(uNoise, vUv * 1.3 + vec2(vSeed * 2.3, vAge * 0.07)).r;
    float m = 1.0 - r2;
    a = smoothstep(0.0, 0.55, m * (0.35 + 0.85 * n + 0.35 * n2) - 0.15);
    if (uAdditive > 0.5) a *= a * (0.6 + 0.4 * m); // softer core falloff, avoids flat saturated plateaus
  } else if (vShape < 1.5) {
    vec2 q = abs(c);
    float d = max(q.x + q.y * 0.55, q.y * 1.15);
    float n = texture2D(uNoise, vUv * 0.4 + vSeed).r;
    a = 1.0 - step(0.55 + 0.35 * n, d);
    if (a < 0.5) discard;
  } else {
    float w = 1.0 - abs(c.x);
    a = w * w * (1.0 - smoothstep(0.55, 1.0, abs(c.y)));
  }
  float alpha = vCol.a * a;
  if (alpha < 0.004) discard;
  if (uAdditive > 0.5) {
    gl_FragColor = vec4(vCol.rgb * uGain * (1.0 - vFog), alpha);
  } else {
    gl_FragColor = vec4(mix(vCol.rgb * uAmbient, uFogColor, vFog), alpha);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const DECAL_VERT = /* glsl */ `
attribute float aBirth;
uniform float uTime;
uniform float uFogDensity;
varying vec2 vUv;
varying float vA;
varying float vFog;
void main() {
  vUv = uv;
  float age = uTime - aBirth;
  vA = aBirth < -1.0 ? 0.0 : 1.0 - smoothstep(50.0, 60.0, age);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
}
`;
const DECAL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uAmbient;
uniform vec3 uFogColor;
varying vec2 vUv;
varying float vA;
varying float vFog;
void main() {
  float m = texture2D(uMap, vUv).a;
  float a = m * vA * 0.85;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(0.05, 0.045, 0.04) * uAmbient, uFogColor, vFog), a * (1.0 - vFog));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeRampTexture() {
  const names = Object.keys(RAMPS);
  const data = new Uint8Array(RAMP_W * names.length * 4);
  const ca = new THREE.Color(), cb = new THREE.Color();
  names.forEach((name, row) => {
    const keys = RAMPS[name];
    for (let i = 0; i < RAMP_W; i++) {
      const t = i / (RAMP_W - 1);
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const k0 = keys[k], k1 = keys[k + 1];
      const u = THREE.MathUtils.clamp((t - k0[0]) / Math.max(1e-5, k1[0] - k0[0]), 0, 1);
      ca.setHex(k0[1]); cb.setHex(k1[1]); // linear working space
      ca.lerp(cb, u);
      const o = (row * RAMP_W + i) * 4;
      data[o] = Math.round(Math.sqrt(ca.r) * 255); // sqrt-encoded for dark precision
      data[o + 1] = Math.round(Math.sqrt(ca.g) * 255);
      data[o + 2] = Math.round(Math.sqrt(ca.b) * 255);
      data[o + 3] = Math.round((k0[2] + (k1[2] - k0[2]) * u) * 255);
    }
  });
  const tex = new THREE.DataTexture(data, RAMP_W, names.length, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, rows: names.length };
}

function makeNoiseTexture() {
  const N = 64;
  const grid = (s) => {
    const g = new Float32Array(s * s);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return g;
  };
  const octs = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]].map(([s, w]) => ({ s, w, g: grid(s) }));
  const data = new Uint8Array(N * N * 4);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const o of octs) {
        const fx = (x / N) * o.s, fy = (y / N) * o.s;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = sm(fx - ix), ty = sm(fy - iy);
        const x0 = ix % o.s, x1 = (ix + 1) % o.s, y0 = iy % o.s, y1 = (iy + 1) % o.s;
        const a = o.g[y0 * o.s + x0], b = o.g[y0 * o.s + x1], c = o.g[y1 * o.s + x0], d = o.g[y1 * o.s + x1];
        v += o.w * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
      const o4 = (y * N + x) * 4;
      const b = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
      data[o4] = data[o4 + 1] = data[o4 + 2] = b;
      data[o4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function makeFootprintTexture() {
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.shadowColor = "#000";
  g.shadowBlur = 6;
  // Heel / sole pad (print points +Y in texture = forward).
  g.beginPath();
  g.ellipse(64, 80, 26, 34, 0, 0, Math.PI * 2);
  g.fill();
  // Three forward toes with claw tips, one small rear toe.
  const toe = (ang, len, w) => {
    g.save();
    g.translate(64, 64);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-w, 0);
    g.quadraticCurveTo(-w * 1.1, -len * 0.7, 0, -len);
    g.quadraticCurveTo(w * 1.1, -len * 0.7, w, 0);
    g.closePath();
    g.fill();
    g.restore();
  };
  toe(-0.42, 58, 11);
  toe(0, 62, 12);
  toe(0.42, 58, 11);
  toe(Math.PI, 50, 7);
  // Cracks radiating out.
  g.shadowBlur = 0;
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    let x = 64 + Math.cos(a) * 30, y = 70 + Math.sin(a) * 36;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      x += Math.cos(a + (Math.random() - 0.5)) * 9;
      y += Math.sin(a + (Math.random() - 0.5)) * 9;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// One blending pool: InstancedBufferGeometry quad + 5 vec4 instanced attributes.
class Pool {
  constructor(size, additive, uniforms, scene) {
    this.size = size;
    this.head = 0;
    this.serial = new Uint32Array(size);
    this.serialCounter = 1;
    // dirty spans of contiguous spawned indices [start, end)
    this.spans = new Int32Array(16);
    this.spanCount = 0;
    this.kills = new Int32Array(64);
    this.killCount = 0;
    this.fullUpload = false;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.attrs = [];
    for (const name of ["aP0", "aV0", "aSz", "aMisc", "aTint"]) {
      const arr = new Float32Array(size * 4);
      const at = new THREE.InstancedBufferAttribute(arr, 4);
      at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, at);
      this.attrs.push(at);
    }
    this.P0 = this.attrs[0].array; this.V0 = this.attrs[1].array; this.SZ = this.attrs[2].array;
    this.MI = this.attrs[3].array; this.TI = this.attrs[4].array;
    for (let i = 0; i < size; i++) { this.P0[i * 4 + 3] = -1e6; this.V0[i * 4 + 3] = 0; }
    geo.instanceCount = size;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uAdditive: { value: additive ? 1 : 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide, // streak quads can face either way
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 11;
    this.mesh.name = additive ? "kaijuFxAdd" : "kaijuFxAlpha";
    scene.add(this.mesh);
  }

  // Returns the slot index. Caller fills arrays through write().
  alloc() {
    const i = this.head;
    this.head = (i + 1) % this.size;
    this.serial[i] = this.serialCounter++;
    const n = this.spanCount;
    if (n > 0 && this.spans[(n - 1) * 2 + 1] === i) {
      this.spans[(n - 1) * 2 + 1] = i + 1;
    } else if (n < 8) {
      this.spans[n * 2] = i; this.spans[n * 2 + 1] = i + 1; this.spanCount = n + 1;
    } else {
      this.fullUpload = true;
    }
    return i;
  }

  kill(i, serial) {
    if (this.serial[i] !== serial) return;
    this.V0[i * 4 + 3] = 0;
    if (this.killCount < this.kills.length) this.kills[this.killCount++] = i;
    else this.fullUpload = true;
  }

  clear() {
    for (let i = 0; i < this.size; i++) this.V0[i * 4 + 3] = 0;
    this.fullUpload = true;
  }

  upload() {
    if (this.fullUpload) {
      for (const at of this.attrs) { at.clearUpdateRanges(); at.needsUpdate = true; }
      this.fullUpload = false; this.spanCount = 0; this.killCount = 0;
      return;
    }
    if (this.spanCount === 0 && this.killCount === 0) return;
    // three.js clears updateRanges after uploading; ranges accumulate if a frame was not rendered.
    if (this.attrs[1].updateRanges.length > 96) {
      for (const at of this.attrs) { at.clearUpdateRanges(); at.needsUpdate = true; }
      this.spanCount = 0; this.killCount = 0;
      return;
    }
    for (let a = 0; a < 5; a++) {
      const at = this.attrs[a];
      for (let s = 0; s < this.spanCount; s++) {
        const st = this.spans[s * 2], en = this.spans[s * 2 + 1];
        at.addUpdateRange(st * 4, (en - st) * 4);
      }
      if (a === 1) for (let k = 0; k < this.killCount; k++) at.addUpdateRange(this.kills[k] * 4, 4);
      if (at.updateRanges.length) at.needsUpdate = true;
    }
    this.spanCount = 0;
    this.killCount = 0;
  }

  live(time) {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const age = time - this.P0[i * 4 + 3];
      if (age >= 0 && age < this.V0[i * 4 + 3]) n++;
    }
    return n;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

export class KaijuFx {
  constructor(K) {
    this.K = K;
    this.scene = K?.scene || K?.app?.scene;
    this.time = 0;
    this.dt = 1 / 60;
    const ramp = makeRampTexture();
    this.noise = makeNoiseTexture();
    this.ramp = ramp.tex;
    const shared = {
      uTime: { value: 0 },
      uRows: { value: ramp.rows },
      uRamp: { value: ramp.tex },
      uNoise: { value: this.noise },
      uFogDensity: { value: 0 },
      uFogColor: { value: new THREE.Color(0xbfd8ec) },
      uGain: { value: 1 },
      uAmbient: { value: 1 },
    };
    this.uniforms = shared;
    const max = CFG.MAX_PARTICLES || 6000;
    const addN = Math.floor(max * 0.45);
    this.add = new Pool(addN, true, shared, this.scene);
    this.alpha = new Pool(max - addN, false, shared, this.scene);
    this._flameAcc = 0;
    this._flameSmokeAcc = 0;
    this._lastSlot = -1;
    this._lastPool = null;

    // Emitters
    this.maxEmitters = CFG.MAX_EMITTERS || 96;
    this.emitters = [];
    this._emitterSerial = 0;

    // Decals
    this.maxDecals = CFG.MAX_DECALS || 64;
    this._decalHead = 0;
    const dgeo = new THREE.PlaneGeometry(1, 1);
    dgeo.rotateX(-Math.PI / 2);
    const births = new Float32Array(this.maxDecals).fill(-1e6);
    this.decalBirth = new THREE.InstancedBufferAttribute(births, 1);
    this.decalBirth.setUsage(THREE.DynamicDrawUsage);
    dgeo.setAttribute("aBirth", this.decalBirth);
    this.decalTex = makeFootprintTexture();
    this.decalMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uMap: { value: this.decalTex },
        uAmbient: shared.uAmbient,
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
      },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.decals = new THREE.InstancedMesh(dgeo, this.decalMat, this.maxDecals);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    this.decals.name = "kaijuDecals";
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.maxDecals; i++) this.decals.setMatrixAt(i, _m);
    this.scene?.add(this.decals);
  }

  // ---------- low level ----------
  // Writes one particle. Returns slot index (pool remembered in this._lastPool).
  _emit(pool, x, y, z, vx, vy, vz, life, s0, s1, drag, accY, row, shape, rotSpeed, tr, tg, tb, groundY) {
    const i = pool.alloc();
    const o = i * 4;
    const P = pool.P0, V = pool.V0, S = pool.SZ, M = pool.MI, T = pool.TI;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = this.time;
    V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = life;
    S[o] = s0; S[o + 1] = s1; S[o + 2] = drag; S[o + 3] = accY;
    M[o] = rnd() * 6.2832; M[o + 1] = rotSpeed; M[o + 2] = row; M[o + 3] = shape;
    T[o] = tr; T[o + 1] = tg; T[o + 2] = tb; T[o + 3] = groundY;
    this._lastPool = pool;
    this._lastSlot = i;
    return i;
  }

  // Random unit vector into _d, optionally biased toward dir (bias 0..1).
  _randDir(dir, bias) {
    let x, y, z, l;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
    l = 1 / Math.sqrt(l);
    _d.set(x * l, y * l, z * l);
    if (dir && bias > 0) { _d.multiplyScalar(1 - bias).addScaledVector(dir, bias * 1.5).normalize(); }
    return _d;
  }

  // ---------- public API ----------
  spawn(type, pos, opts = {}) {
    if (!pos) return;
    const sc = opts.scale ?? 1;
    const px = pos.x, py = pos.y, pz = pos.z;
    const col = opts.color;
    const cr = col ? col.r : 1, cg = col ? col.g : 1, cb = col ? col.b : 1;
    const dir = opts.dir || null;
    const NOG = -1e5; // no ground clamp
    switch (type) {
      case "spark": {
        const n = opts.count ?? 10;
        const sp = opts.speed ?? 45;
        for (let i = 0; i < n; i++) {
          const d = this._randDir(dir, dir ? 0.55 : 0);
          const v = sp * rr(0.35, 1.0) * sc;
          this._emit(this.add, px, py, pz, d.x * v, d.y * v, d.z * v, (opts.life ?? 0.4) * rr(0.5, 1.1),
            0.22 * sc, 0.12 * sc, 2.2, -14, ROW.spark, STREAK + 0.035, 0, cr * 2.2, cg * 2.2, cb * 2.2, NOG);
        }
        break;
      }
      case "debris": {
        const n = opts.count ?? 6;
        const sp = opts.speed ?? 16;
        const gy = getBeijingTerrainElevation(px, pz) + 0.1;
        for (let i = 0; i < n; i++) {
          const d = this._randDir(dir || _up, 0.45);
          const v = sp * rr(0.4, 1.1) * Math.sqrt(sc);
          const s = 0.5 * sc * rr(0.5, 1.4);
          this._emit(this.alpha, px, py, pz, d.x * v, d.y * v, d.z * v, (opts.life ?? 2.6) * rr(0.6, 1.2),
            s, s, 0.25, -22, ROW.debris, SHAPE_CHUNK, rr(-9, 9), cr, cg, cb, gy);
        }
        break;
      }
      case "muzzle": {
        const n = opts.count ?? 3;
        for (let i = 0; i < n; i++) {
          const k = dir ? i * 0.7 * sc : 0;
          const v = dir ? 25 : 0;
          this._emit(this.add, px + (dir ? dir.x * k : 0), py + (dir ? dir.y * k : 0), pz + (dir ? dir.z * k : 0),
            dir ? dir.x * v : 0, dir ? dir.y * v : 0, dir ? dir.z * v : 0, (opts.life ?? 0.07) * rr(0.8, 1.2),
            (1.6 - i * 0.35) * sc, (2.2 - i * 0.4) * sc, 0, 0, ROW.muzzle, SHAPE_SOFT, 0, cr * 3, cg * 3, cb * 3, NOG);
        }
        break;
      }
      case "explosion":
      case "bigExplosion": {
        const big = type === "bigExplosion";
        const s = sc * (big ? 2.2 : 1);
        const gy = getBeijingTerrainElevation(px, pz) + 0.1;
        // flash
        this._emit(this.add, px, py, pz, 0, 0, 0, big ? 0.18 : 0.12, 6 * s, 14 * s, 0, 0, ROW.muzzle, SHAPE_SOFT, 0, 4, 3.6, 3, NOG);
        const nf = opts.count ?? (big ? 28 : 14);
        for (let i = 0; i < nf; i++) {
          const d = this._randDir(_up, 0.25);
          const v = rr(5, 16) * s;
          this._emit(this.add, px + d.x * s, py + d.y * s, pz + d.z * s, d.x * v, d.y * v * 0.8, d.z * v,
            rr(0.6, 1.1) * (big ? 1.25 : 1), rr(2, 3.5) * s, rr(6, 9) * s, 3.0, 3, ROW.fireball, SHAPE_SOFT, rr(-1, 1), 1.5, 1.3, 1.15, gy);
        }
        const ns = big ? 18 : 9;
        for (let i = 0; i < ns; i++) {
          const d = this._randDir(_up, 0.4);
          const v = rr(3, 9) * s;
          this._emit(this.alpha, px + d.x * 2 * s, py + d.y * s, pz + d.z * 2 * s, d.x * v, d.y * v * 0.6 + 2, d.z * v,
            rr(3.5, 6) * (big ? 1.3 : 1), rr(3, 5) * s, rr(11, 16) * s, 1.1, 2.6, ROW.smoke, SHAPE_SOFT, rr(-0.4, 0.4), 1, 1, 1, gy);
        }
        const nk = big ? 30 : 16;
        for (let i = 0; i < nk; i++) {
          const d = this._randDir(_up, 0.2);
          const v = rr(20, 70) * Math.sqrt(s);
          this._emit(this.add, px, py, pz, d.x * v, d.y * v, d.z * v, rr(0.4, 1.0), 0.3 * Math.sqrt(s), 0.15, 1.2, -16,
            ROW.spark, STREAK + 0.05, 0, 2.4, 2.2, 1.8, gy);
        }
        const nd = big ? 12 : 6;
        for (let i = 0; i < nd; i++) {
          const d = this._randDir(_up, 0.45);
          const v = rr(10, 28) * Math.sqrt(s);
          const z = 0.45 * Math.sqrt(s) * rr(0.6, 1.6);
          this._emit(this.alpha, px, py, pz, d.x * v, d.y * v, d.z * v, rr(2, 3.5), z, z, 0.2, -22, ROW.debris, SHAPE_CHUNK, rr(-9, 9), 1, 1, 1, gy);
        }
        break;
      }
      case "smoke": {
        const n = opts.count ?? 1;
        const light = opts.light;
        for (let i = 0; i < n; i++) {
          const up = opts.speed ?? 3;
          this._emit(this.alpha, px + rr(-1, 1) * sc, py, pz + rr(-1, 1) * sc,
            rr(-0.8, 0.8) * sc, up * rr(0.6, 1.2) * sc, rr(-0.8, 0.8) * sc,
            (opts.life ?? 9) * rr(0.7, 1.15), 2.5 * sc * rr(0.8, 1.2), 13 * sc * rr(0.8, 1.3), 0.3, 2.6 * sc,
            light ? ROW.smokeLight : ROW.smoke, SHAPE_SOFT, rr(-0.25, 0.25), cr, cg, cb, NOG);
        }
        break;
      }
      case "trail": {
        const n = opts.count ?? 1;
        for (let i = 0; i < n; i++) {
          this._emit(this.alpha, px + rr(-0.3, 0.3), py + rr(-0.3, 0.3), pz + rr(-0.3, 0.3),
            rr(-0.6, 0.6), rr(-0.2, 0.8), rr(-0.6, 0.6), (opts.life ?? 2.6) * rr(0.8, 1.2),
            0.9 * sc, 4.2 * sc, 0.6, 0.5, ROW.trail, SHAPE_SOFT, rr(-0.5, 0.5), cr, cg, cb, NOG);
        }
        break;
      }
      case "fire": {
        const n = opts.count ?? 1;
        for (let i = 0; i < n; i++) {
          this._emit(this.add, px + rr(-1, 1) * sc, py + rr(0, 0.6) * sc, pz + rr(-1, 1) * sc,
            rr(-0.6, 0.6) * sc, rr(2, 4) * sc, rr(-0.6, 0.6) * sc, (opts.life ?? 1.0) * rr(0.7, 1.2),
            2.6 * sc * rr(0.8, 1.2), 1.1 * sc, 1.4, 5 * sc, ROW.fire, SHAPE_SOFT, rr(-1.5, 1.5), cr * 2, cg * 1.8, cb * 1.6, NOG);
        }
        break;
      }
      case "dust": {
        const n = opts.count ?? 18;
        const gy = getBeijingTerrainElevation(px, pz) + 1;
        for (let i = 0; i < n; i++) {
          const a = rnd() * 6.2832;
          const h = rr(4, 14) * sc;
          const v = rr(0.6, 1) * h;
          this._emit(this.alpha, px + Math.cos(a) * 4 * sc, py + rr(0, 8) * sc, pz + Math.sin(a) * 4 * sc,
            Math.cos(a) * v, rr(1, 6) * sc, Math.sin(a) * v, (opts.life ?? 8) * rr(0.7, 1.2),
            8 * sc * rr(0.8, 1.2), 30 * sc * rr(0.8, 1.2), 0.7, 0.5, ROW.dust, SHAPE_SOFT, rr(-0.2, 0.2), cr, cg, cb, gy);
        }
        break;
      }
      case "dustRing": {
        const n = opts.count ?? 24;
        const gy = getBeijingTerrainElevation(px, pz);
        const y0 = Math.max(py, gy) + 1.5 * sc;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.2832 + rr(-0.1, 0.1);
          const v = rr(14, 22) * sc;
          this._emit(this.alpha, px + Math.cos(a) * 3 * sc, y0, pz + Math.sin(a) * 3 * sc,
            Math.cos(a) * v, rr(0.5, 2.5) * sc, Math.sin(a) * v, (opts.life ?? 2.6) * rr(0.75, 1.2),
            3 * sc, 11 * sc * rr(0.8, 1.2), 2.0, 0.4, ROW.dust, SHAPE_SOFT, rr(-0.3, 0.3), cr, cg, cb, gy + 0.5);
        }
        break;
      }
      case "flame": {
        // Called every frame while breathing. Count derives from frame dt for frame-rate independence.
        const d0 = dir || _up;
        const speed = opts.speed ?? 230;
        const dt = Math.min(this.dt, 0.05);
        this._flameAcc += (opts.rate ?? 520) * dt * sc;
        this._flameSmokeAcc += 70 * dt * sc;
        let n = Math.min(40, Math.floor(this._flameAcc));
        this._flameAcc -= n;
        const spread = opts.spread ?? 0.09;
        for (let i = 0; i < n; i++) {
          const core = rnd() < 0.2;
          _v.set(d0.x + rr(-spread, spread), d0.y + rr(-spread, spread), d0.z + rr(-spread, spread)).normalize();
          const v = speed * rr(0.85, 1.1) * (core ? 0.8 : 1);
          if (core) {
            this._emit(this.add, px + rr(-0.6, 0.6), py + rr(-0.6, 0.6), pz + rr(-0.6, 0.6), _v.x * v, _v.y * v, _v.z * v,
              rr(0.22, 0.38), 1.6 * sc, 8 * sc, 0.35, 0, ROW.flameCore, SHAPE_SOFT, rr(-3, 3), 1.7, 1.55, 1.4, NOG);
          } else {
            this._emit(this.add, px + rr(-1, 1), py + rr(-1, 1), pz + rr(-1, 1), _v.x * v, _v.y * v, _v.z * v,
              rr(1.6, 2.3), 2.5 * sc, rr(22, 34) * sc, 0.3, 7, ROW.flame, SHAPE_SOFT, rr(-2, 2), cr * 1.25, cg * 0.95, cb * 0.75, NOG);
          }
        }
        let m = Math.min(10, Math.floor(this._flameSmokeAcc));
        this._flameSmokeAcc -= m;
        for (let i = 0; i < m; i++) {
          _v.set(d0.x + rr(-spread, spread) * 1.3, d0.y + rr(-spread, spread), d0.z + rr(-spread, spread) * 1.3).normalize();
          const v = speed * rr(0.75, 1.0);
          this._emit(this.alpha, px, py, pz, _v.x * v, _v.y * v, _v.z * v, rr(3.0, 4.2), 6 * sc, rr(40, 55) * sc, 0.32, 9,
            ROW.flameSmoke, SHAPE_SOFT, rr(-0.5, 0.5), 1, 1, 1, NOG);
        }
        break;
      }
      default:
        break;
    }
  }

  // Ballistic tracer streak; returns a handle number (slot*2^20 + serial low bits) for killTracer.
  spawnTracer(pos, vel, life, gravity = 0, opts = {}) {
    const col = opts.color;
    const w = opts.width ?? 0.35;
    const i = this._emit(this.add, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, life, w, w, 0, -gravity,
      ROW.tracer, STREAK + (opts.tail ?? 0.03), 0, (col ? col.r : 1) * 3, (col ? col.g : 1) * 2.6, (col ? col.b : 1) * 2.0, -1e5);
    return { slot: i, serial: this.add.serial[i] };
  }

  killTracer(h) {
    if (h) this.add.kill(h.slot, h.serial);
  }

  addTracer(from, to, life = 0.08) {
    if (!from || !to) return;
    const inv = 1 / Math.max(1e-3, life);
    _t1.subVectors(to, from).multiplyScalar(inv);
    this.spawnTracer(from, _t1, life, 0, { tail: life * 0.6 });
  }

  addEmitter(type, pos, opts = {}) {
    if (this.emitters.length >= this.maxEmitters) {
      // recycle the oldest
      let oi = 0;
      for (let i = 1; i < this.emitters.length; i++) if (this.emitters[i].serial < this.emitters[oi].serial) oi = i;
      this.emitters[oi].alive = false;
      this.emitters.splice(oi, 1);
    }
    const base = EMIT_DEFAULT[type] || EMIT_DEFAULT.smoke;
    const e = {
      type,
      pos: pos ? pos.clone() : new THREE.Vector3(),
      rate: opts.rate ?? base.rate,
      life: opts.life ?? Infinity,
      radius: opts.radius ?? base.radius,
      scale: opts.scale ?? 1,
      age: 0,
      acc: rnd(),
      acc2: rnd(),
      alive: true,
      serial: ++this._emitterSerial,
      stop: null,
    };
    e.stop = () => { e.alive = false; };
    this.emitters.push(e);
    return e;
  }

  addDecal(x, z, yaw = 0, scale = 1) {
    const i = this._decalHead;
    this._decalHead = (i + 1) % this.maxDecals;
    const y = getBeijingTerrainElevation(x, z) + 0.25;
    const L = 12 * scale;
    _q.setFromAxisAngle(_up, yaw);
    _s.set(L * 0.8, 1, L);
    _v.set(x, y, z);
    _m.compose(_v, _q, _s);
    this.decals.setMatrixAt(i, _m);
    const im = this.decals.instanceMatrix;
    if (im.updateRanges.length > 32) im.clearUpdateRanges(); // full upload fallback
    else im.addUpdateRange(i * 16, 16);
    im.needsUpdate = true;
    this.decalBirth.array[i] = this.time;
    if (this.decalBirth.updateRanges.length > 32) this.decalBirth.clearUpdateRanges();
    else this.decalBirth.addUpdateRange(i, 1);
    this.decalBirth.needsUpdate = true;
  }

  update(dt) {
    dt = Math.max(0, dt || 0);
    this.dt = dt;
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    const fog = this.scene?.fog;
    if (fog) {
      u.uFogDensity.value = fog.density ?? 0;
      u.uFogColor.value.copy(fog.color);
    }
    let day = 1;
    try { day = getDaylight(); } catch (e) { day = 1; }
    if (!(day >= 0)) day = 1;
    u.uGain.value = 1 + 0.35 * (1 - day);
    u.uAmbient.value = 0.25 + 0.75 * day;

    if (dt > 0) this._updateEmitters(dt);
    this.add.upload();
    this.alpha.upload();
  }

  _updateEmitters(dt) {
    const cam = this.K?.camera || this.K?.app?.camera;
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    const list = this.emitters;
    // Global budget: scale emission so emitters alone stay within ~60% of each pool.
    let demandAdd = 0, demandAlpha = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const b = EMIT_DEFAULT[e.type] || EMIT_DEFAULT.smoke;
      demandAdd += e.rate * b.addLife;
      demandAlpha += e.rate * b.alphaLife;
    }
    const kAdd = demandAdd > 0 ? Math.min(1, (this.add.size * 0.55) / demandAdd) : 1;
    const kAlpha = demandAlpha > 0 ? Math.min(1, (this.alpha.size * 0.55) / demandAlpha) : 1;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.age += dt;
      if (e.age > e.life) e.alive = false;
      if (!e.alive) continue;
      list[w++] = e;
      const dx = e.pos.x - cx, dz = e.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2500 * 2500) continue;
      // Far emitters spawn fewer, bigger particles.
      const far = d2 > 900 * 900 ? 0.5 : 1;
      const sz = e.scale * (far < 1 ? 1.35 : 1);
      const b = EMIT_DEFAULT[e.type] || EMIT_DEFAULT.smoke;
      e.acc += e.rate * dt * far * (b.addLife > 0 ? kAdd : kAlpha);
      let n = Math.min(8, Math.floor(e.acc));
      e.acc -= n;
      const r = e.radius;
      for (let k = 0; k < n; k++) {
        _t2.set(e.pos.x + rr(-r, r), e.pos.y, e.pos.z + rr(-r, r));
        if (e.type === "fire" || e.type === "wreck") {
          this.spawn("fire", _t2, { scale: sz });
        } else if (e.type === "smoke") {
          this.spawn("smoke", _t2, { scale: sz });
        } else if (e.type === "dust") {
          this.spawn("smoke", _t2, { scale: sz, light: true, speed: 1.5 });
        } else {
          this.spawn(e.type, _t2, { scale: sz });
        }
      }
      // fire emitters also feed a smoke column
      if (b.smoke > 0) {
        e.acc2 += e.rate * b.smoke * dt * far * kAlpha;
        let m = Math.min(4, Math.floor(e.acc2));
        e.acc2 -= m;
        for (let k = 0; k < m; k++) {
          _t2.set(e.pos.x + rr(-r, r) * 0.6, e.pos.y + 3 * e.scale, e.pos.z + rr(-r, r) * 0.6);
          this.spawn("smoke", _t2, { scale: sz * 1.2, speed: 4 });
        }
      }
    }
    list.length = w;
  }

  reset() {
    this.add.clear();
    this.alpha.clear();
    for (const e of this.emitters) e.alive = false;
    this.emitters.length = 0;
    this.decalBirth.array.fill(-1e6);
    this.decalBirth.clearUpdateRanges();
    this.decalBirth.needsUpdate = true;
    this._flameAcc = this._flameSmokeAcc = 0;
  }

  // Debug / test helper.
  stats() {
    return {
      add: this.add.live(this.time),
      alpha: this.alpha.live(this.time),
      cap: this.add.size + this.alpha.size,
      emitters: this.emitters.length,
    };
  }

  dispose() {
    this.add.dispose();
    this.alpha.dispose();
    this.decals.parent?.remove(this.decals);
    this.decals.geometry.dispose();
    this.decalMat.dispose();
    this.decalTex.dispose();
    this.noise.dispose();
    this.ramp.dispose();
  }
}

// Emitter defaults: rate (spawns/s), radius, expected particle lives (for the budget), smoke ratio.
const EMIT_DEFAULT = {
  fire:  { rate: 12, radius: 4, addLife: 1.0, alphaLife: 0, smoke: 0.3 },
  wreck: { rate: 7, radius: 1.5, addLife: 1.0, alphaLife: 0, smoke: 0.35 },
  smoke: { rate: 3, radius: 5, addLife: 0, alphaLife: 7, smoke: 0 },
  dust:  { rate: 2, radius: 8, addLife: 0, alphaLife: 7, smoke: 0 },
  flame: { rate: 1, radius: 0, addLife: 2, alphaLife: 0, smoke: 0 },
  spark: { rate: 2, radius: 1, addLife: 4, alphaLife: 0, smoke: 0 },
};
