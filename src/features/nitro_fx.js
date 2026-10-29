// [nitro-fx] Boost (Shift) effects in a modern racing-game style.
// - Chassis-local exhaust flames: one camera-facing ribbon per exhaust tip with a noise-driven shader (hot
//   core, coloured outer flame, flicker, optional shock diamonds) plus a soft nozzle glow that fakes bloom.
//   Built per hero model by createNitroRig(); animated by updateNitroRig() from updateEntityNitroVfx().
// - One world-space system (NitroFx, created once in main.js): exhaust pops / backfire sparks, diesel soot,
//   wind streaks passing the car, thin tail-light trails, a screen-edge speed-line overlay, camera shake, an
//   FOV kick and boost audio through the shared WebAudio engine.
// Everything is pooled and preallocated; hidden pieces have visible = false so idle cost is zero.
import * as THREE from '../../vendor/three.module.js';
import { getWeaponSfx } from './weapon_sfx.js';

// ---------------------------------------------------------------- styles
// core: white-hot centre; mid/tip: outer flame along its length; glow: nozzle halo; dia: shock diamonds.
const STYLES = {
  plasma: { core: 0xf2ffff, mid: 0x18e8ff, tip: 0xff2a9a, glow: 0x40f0ff, dia: 0xff6ad5, diaN: 5.0, len: 3.4, radius: 0.17, flow: 9.0, turb: 0.35, coreLen: 0.7, bright: 1.25, trail: [0xff2a85, 0x00f5ff] },
  formula: { core: 0xf4f8ff, mid: 0x4d86ff, tip: 0x6a3cff, glow: 0x7fb0ff, dia: 0xfff0c8, diaN: 4.0, len: 3.0, radius: 0.2, flow: 7.5, turb: 0.45, coreLen: 0.5, bright: 1.1, trail: [0xff2030] },
  fire: { core: 0xfff1d0, mid: 0xff7a18, tip: 0xd82a00, glow: 0xff8a30, root: 0x8fb4ff, len: 2.3, radius: 0.16, flow: 6.5, turb: 0.7, coreLen: 0.25, bright: 1.1, trail: [0xff1830] },
  blue: { core: 0xeef5ff, mid: 0x3f7dff, tip: 0x5530e0, glow: 0x6aa2ff, len: 2.4, radius: 0.16, flow: 6.5, turb: 0.55, coreLen: 0.4, bright: 1.15, trail: [0xff1830] },
  diesel: { core: 0xffe2a0, mid: 0xff8a1e, tip: 0xa83200, glow: 0xff9a40, len: 2.6, radius: 0.24, flow: 4.2, turb: 1.0, coreLen: 0.28, bright: 1.15, soot: true, trail: [0xff2a20] },
  turbine: { core: 0xe6f2ff, mid: 0x6fa8ff, tip: 0x3a50c0, glow: 0x8ab8ff, len: 2.4, radius: 0.2, flow: 5.0, turb: 0.6, coreLen: 0.3, bright: 0.75, trail: [0xcfe6ff], trailGain: 0.3 },
};
const STYLE_BY_TYPE = {
  cyber_mach1: 'plasma', aero_formula: 'formula', supercar: 'fire',
  bus: 'diesel', tow_truck: 'diesel', tank: 'diesel', cybertruck: 'blue',
};
export function nitroStyleFor(typeId) { return STYLE_BY_TYPE[typeId] || 'blue'; }

// ---------------------------------------------------------------- shaders
const NOISE = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.15 * vnoise(p * 4.37 + 3.3); }
`;

const FLAME_VS = /* glsl */ `
uniform float uTime, uLevel, uPop, uLenK, uWidthK;
attribute vec3 aST;   // s across (-1..1), t along (0..1) | glow quad corner; z = 1 for the glow quad
attribute vec3 aP;    // nozzle radius, base length, seed
varying vec3 vST;
varying float vSeed, vEnd;
void main() {
  vec3 o = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 ax = normalize((modelMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  float r = aP.x * uWidthK, seed = aP.z, tm = uTime + seed * 13.7;
  float flick = 0.86 + 0.08 * sin(tm * 41.0) + 0.06 * sin(tm * 27.3) + 0.05 * sin(tm * 73.1);
  float L = aP.y * uLenK * (0.3 + 0.7 * uLevel) * flick * (1.0 + 0.6 * uPop);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p;
  if (aST.z < 0.5) {
    float t = aST.y;
    vec3 c = o + ax * (t * L);
    vec3 toCam = normalize(cameraPosition - c);
    vec3 sd = cross(ax, toCam);
    float sl = length(sd);
    sd = sl > 0.02 ? sd / sl : camR;
    float endOn = 1.0 - clamp(sl, 0.0, 1.0);   // looking down the jet: widen it so it still reads
    float w = r * (1.0 + 1.5 * t) * (1.0 - 0.72 * t * t) * (1.0 + 0.5 * uPop) * (1.0 + 0.9 * endOn);
    p = c + sd * aST.x * w;
    vEnd = endOn;
  } else {
    vec3 toCam = normalize(cameraPosition - o);
    float gs = r * (3.0 + 1.8 * uPop) * (0.6 + 0.4 * max(uLevel, uPop));
    p = o + ax * (r * 0.5) + toCam * (r * 2.5) + (camR * aST.x + camU * aST.y) * gs;
    vEnd = 0.0;
  }
  vST = aST; vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FLAME_FS = /* glsl */ `
uniform float uTime, uLevel, uPop, uFlow, uTurb, uCoreLen, uBright, uDia, uDiaN;
uniform vec3 uCore, uMid, uTip, uGlow, uDiaC, uRoot;
varying vec3 vST;
varying float vSeed, vEnd;
${NOISE}
void main() {
  if (vST.z > 0.5) {
    float d = length(vST.xy);
    float g = max(0.0, exp(-d * d * 4.5) - 0.011);
    gl_FragColor = vec4(uGlow * g * (0.45 * uLevel + 0.8 * uPop) * uBright, 1.0);
    return;
  }
  float t = vST.y, s = vST.x, as = abs(s);
  float n = fbm(vec2(s * 1.7 + vSeed * 9.0, t * 3.2 - uTime * uFlow));
  float n2 = vnoise(vec2(s * 3.1 - vSeed, t * 8.0 - uTime * uFlow * 1.7));
  float wob = (n - 0.5) * uTurb * (0.25 + t);
  float edge = 1.0 - smoothstep(0.25, 1.0, as + wob);
  float tip = 1.0 - smoothstep(0.2 + 0.3 * n, 1.0, t);
  float body = edge * tip * smoothstep(0.0, 0.04, t);
  vec3 outer = mix(uMid, uTip, smoothstep(0.1, 0.85, t + (n - 0.5) * 0.35));
  outer = mix(uRoot, outer, smoothstep(0.0, 0.18, t));          // bluish root on fuel flames
  vec3 col = outer * body * (0.45 + 0.95 * n2);
  float coreW = 0.4 * (1.0 - 0.5 * t);
  float core = (1.0 - smoothstep(0.0, coreW, as + (n2 - 0.5) * 0.12)) * (1.0 - smoothstep(0.03, uCoreLen, t));
  col += uCore * core * 1.25;
  if (uDia > 0.0) {   // standing shock diamonds: fixed bands along the jet
    float bands = pow(max(0.0, cos((t * uDiaN - 0.35) * 6.2832)), 12.0);
    col += uDiaC * bands * (1.0 - smoothstep(0.0, 0.32, as)) * (1.0 - smoothstep(0.12, 0.75, t)) * uDia;
  }
  col *= uBright * (uLevel + 0.8 * uPop) * mix(1.0, 0.55, vEnd);
  gl_FragColor = vec4(col, 1.0);
}`;

const FLAME_SEG = 16;
function flameGeometry(radius, length, seed) {
  const nv = (FLAME_SEG + 1) * 2 + 4;
  const st = new Float32Array(nv * 3), pr = new Float32Array(nv * 3), pos = new Float32Array(nv * 3);
  const idx = [];
  for (let i = 0; i <= FLAME_SEG; i++) {
    const t = Math.pow(i / FLAME_SEG, 1.35);
    for (let k = 0; k < 2; k++) {
      const v = i * 2 + k;
      st[v * 3] = k ? 1 : -1; st[v * 3 + 1] = t; st[v * 3 + 2] = 0;
    }
    if (i < FLAME_SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g0 = (FLAME_SEG + 1) * 2;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], j) => { const v = g0 + j; st[v * 3] = x; st[v * 3 + 1] = y; st[v * 3 + 2] = 1; });
  idx.push(g0, g0 + 1, g0 + 2, g0, g0 + 2, g0 + 3);
  for (let v = 0; v < nv; v++) { pr[v * 3] = radius; pr[v * 3 + 1] = length; pr[v * 3 + 2] = seed; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aST', new THREE.BufferAttribute(st, 3));
  geo.setAttribute('aP', new THREE.BufferAttribute(pr, 3));
  geo.setIndex(idx);
  return geo;
}

function flameMaterial(cfg) {
  const c = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace); // raw display values (no tone map)
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLevel: { value: 0 }, uPop: { value: 0 }, uLenK: { value: 1 }, uWidthK: { value: 1 },
      uFlow: { value: cfg.flow }, uTurb: { value: cfg.turb }, uCoreLen: { value: cfg.coreLen }, uBright: { value: cfg.bright },
      uDia: { value: cfg.dia ? 1 : 0 }, uDiaN: { value: cfg.diaN || 4 },
      uCore: { value: c(cfg.core) }, uMid: { value: c(cfg.mid) }, uTip: { value: c(cfg.tip) }, uGlow: { value: c(cfg.glow) },
      uDiaC: { value: c(cfg.dia || 0) }, uRoot: { value: c(cfg.root ?? cfg.mid) },
    },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

const _NEG_Z = new THREE.Vector3(0, 0, -1);
const _d = new THREE.Vector3();

/**
 * Builds the boost rig under `parent` (the model's nitroVfx group, chassis-local).
 * opts: { style, exhausts: [[x, y, z] | { pos: [x,y,z], dir: [x,y,z] }], trails: [[x, y, z]], radius?, length?,
 *         trailColors?: [hex...] }. Returns the rig stored as vfxParts.rig.
 */
export function createNitroRig(parent, opts) {
  const cfg = STYLES[opts.style] || STYLES.blue;
  const mat = flameMaterial(cfg);
  const flames = [];
  const radius = opts.radius ?? cfg.radius;
  const length = opts.length ?? cfg.len;
  (opts.exhausts || []).forEach((e, i) => {
    const pos = Array.isArray(e) ? e : e.pos;
    const dir = Array.isArray(e) ? null : e.dir;
    const m = new THREE.Mesh(flameGeometry(radius, length, i * 0.37 + 0.11), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (dir) m.quaternion.setFromUnitVectors(_NEG_Z, _d.set(dir[0], dir[1], dir[2]).normalize());
    m.frustumCulled = false;
    m.renderOrder = 5;
    parent.add(m);
    flames.push(m);
  });
  const colors = opts.trailColors || cfg.trail;
  const trailAnchors = (opts.trails || []).map((p, i) => {
    const a = new THREE.Object3D();
    a.position.set(p[0], p[1], p[2]);
    parent.add(a);
    return { obj: a, color: new THREE.Color(colors[i % colors.length]) };
  });
  return {
    style: opts.style, cfg, group: parent, mat, flames, trailAnchors,
    level: 0, pop: 0, active: false, lastT: -1, speed: 0, flapLift: 0, aeroFlaps: opts.aeroFlaps || [],
  };
}

/** Per-frame flame animation (called from updateEntityNitroVfx). Eases in fast, out slower. */
export function updateNitroRig(rig, show, speed, timeSec) {
  const dt = rig.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0, timeSec - rig.lastT));
  rig.lastT = timeSec;
  rig.active = show;
  rig.speed = speed;
  rig.level += ((show ? 1 : 0) - rig.level) * Math.min(1, dt * (show ? 9 : 4.5));
  if (!show && rig.level < 0.004) rig.level = 0;
  rig.pop = Math.max(0, rig.pop - dt * 4.5);
  rig.flapLift += ((show ? 1 : 0) - rig.flapLift) * Math.min(1, dt * 6);
  for (let i = 0; i < rig.aeroFlaps.length; i++) rig.aeroFlaps[i].rotation.x = 0.32 * rig.flapLift;
  const vis = rig.level > 0.004 || rig.pop > 0.01;
  rig.group.visible = vis;
  if (!vis) return;
  const u = rig.mat.uniforms;
  u.uTime.value = timeSec;
  u.uLevel.value = rig.level;
  u.uPop.value = rig.pop;
  u.uLenK.value = 0.85 + Math.min(0.5, speed / 110);
}

// ---------------------------------------------------------------- world-space streak particles
const STREAK_VS = /* glsl */ `
attribute vec3 iPos, iDir;
attribute vec4 iCol;
attribute float iSize;
varying vec2 vQ;
varying vec4 vCol;
varying float vL;
void main() {
  vec4 h = modelViewMatrix * vec4(iPos, 1.0);
  vec4 e = modelViewMatrix * vec4(iPos + iDir, 1.0);
  if (h.z > -0.3 || e.z > -0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 d = e.xy / -e.z - h.xy / -h.z;
  float Ls = length(d);
  vec2 dir = Ls > 1e-5 ? d / Ls : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 p = mix(h, e, position.y);
  p.xy += nrm * position.x * iSize + dir * (position.y * 2.0 - 1.0) * iSize;
  vQ = position.xy; vCol = iCol;
  vL = Ls * -h.z / iSize;
  gl_Position = projectionMatrix * p;
}`;
const STREAK_FS = (additive) => /* glsl */ `
varying vec2 vQ;
varying vec4 vCol;
varying float vL;
${NOISE}
void main() {
  float a = -1.0 + vQ.y * (vL + 2.0);
  float ex = a < 0.0 ? a : max(0.0, a - vL);
  float d = length(vec2(vQ.x, ex));
  float shape = 1.0 - smoothstep(0.0, 1.0, d);
  float fade = 1.0 - 0.85 * clamp(a / max(vL, 0.001), 0.0, 1.0);
  ${additive
    ? 'gl_FragColor = vec4(vCol.rgb * vCol.a * shape * shape * fade, 1.0);'
    : 'float n = vnoise(vQ * 2.5 + vCol.a * 17.0); gl_FragColor = vec4(vCol.rgb, vCol.a * shape * (0.55 + 0.45 * n));'}
}`;

const K_SPARK = 0, K_WIND = 1, K_SOOT = 2, K_DUST = 3;

class StreakPool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.shut = new Float32Array(max);
    this.kind = new Uint8Array(max);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iDir = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iDir', this.iDir);
    geo.setAttribute('iCol', this.iCol); geo.setAttribute('iSize', this.iSize);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: STREAK_VS, fragmentShader: STREAK_FS(additive),
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = additive ? 6 : 4;
    scene.add(this.mesh);
  }

  spawn(kind, x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, drag, grav, shutter) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.grow[i] = grow; this.a0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav; this.shut[i] = shutter; this.kind[i] = kind;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.c[i3 + k] = this.c[j3 + k]; }
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.shut[i] = this.shut[j]; this.kind[i] = this.kind[j];
  }

  // camV: camera/vehicle velocity, used for the motion-blur stretch of every streak.
  update(dt, camV, camPos) {
    if (this.n === 0) { this.mesh.visible = false; return; }
    const P = this.iPos.array, D = this.iDir.array, C = this.iCol.array, S = this.iSize.array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); i--; continue; }
      const i3 = i * 3, f = 1 / (1 + this.drag[i] * dt);
      this.v[i3] *= f; this.v[i3 + 1] = (this.v[i3 + 1] - this.grav[i] * dt) * f; this.v[i3 + 2] *= f;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4, t = this.age[i] / this.life[i], k = this.kind[i];
      let a;
      if (k === K_SPARK) a = this.a0[i] * (1 - t * t);
      else if (k === K_WIND) {
        const dx = this.p[i3] - camPos.x, dy = this.p[i3 + 1] - camPos.y, dz = this.p[i3 + 2] - camPos.z;
        a = this.a0[i] * Math.min(1, t * 6) * (1 - t) * Math.min(1, (dx * dx + dy * dy + dz * dz) / 9);
      } else a = this.a0[i] * Math.min(1, t * 10) * Math.pow(1 - t, 1.6);
      const sh = this.shut[i];
      P[i3] = this.p[i3]; P[i3 + 1] = this.p[i3 + 1]; P[i3 + 2] = this.p[i3 + 2];
      D[i3] = (camV.x - this.v[i3]) * sh; D[i3 + 1] = (camV.y - this.v[i3 + 1]) * sh; D[i3 + 2] = (camV.z - this.v[i3 + 2]) * sh;
      C[i4] = this.c[i3]; C[i4 + 1] = this.c[i3 + 1]; C[i4 + 2] = this.c[i3 + 2]; C[i4 + 3] = a;
      S[i] = this.size[i] + this.grow[i] * this.age[i];
    }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.iPos.needsUpdate = this.iDir.needsUpdate = this.iCol.needsUpdate = this.iSize.needsUpdate = true;
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
}

// ---------------------------------------------------------------- tail-light trails (world space ribbons)
const TRAIL_MAX = 4, TRAIL_N = 48;
const TRAIL_VS = /* glsl */ `
attribute vec3 color;
attribute float aU;
varying vec3 vCol;
varying float vU;
void main() { vCol = color; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TRAIL_FS = /* glsl */ `
varying vec3 vCol;
varying float vU;
void main() {
  float c = 1.0 - vU * vU;
  float m = max(vCol.r, max(vCol.g, vCol.b));
  gl_FragColor = vec4(vCol * c * c + vec3(pow(c, 10.0) * 0.55 * m), 1.0);
}`;

class TrailSet {
  constructor(scene) {
    this.px = new Float32Array(TRAIL_MAX * TRAIL_N); this.py = new Float32Array(TRAIL_MAX * TRAIL_N);
    this.pz = new Float32Array(TRAIL_MAX * TRAIL_N); this.pt = new Float32Array(TRAIL_MAX * TRAIL_N);
    this.head = new Int32Array(TRAIL_MAX); this.count = new Int32Array(TRAIL_MAX);
    this.col = [];
    for (let i = 0; i < TRAIL_MAX; i++) this.col.push(new THREE.Color());
    const nv = TRAIL_MAX * TRAIL_N * 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colA = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const u = new Float32Array(nv);
    for (let v = 0; v < nv; v++) u[v] = v & 1 ? 1 : -1;
    const idx = [];
    for (let t = 0; t < TRAIL_MAX; t++) for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = (t * TRAIL_N + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setAttribute('position', this.pos); geo.setAttribute('color', this.colA);
    geo.setAttribute('aU', new THREE.BufferAttribute(u, 1)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.used = 0;
  }

  reset() { this.count.fill(0); this.used = 0; this.mesh.visible = false; }

  push(ti, x, y, z, now) {
    const b = ti * TRAIL_N;
    const h = (this.head[ti] + 1) % TRAIL_N;
    this.head[ti] = h;
    this.px[b + h] = x; this.py[b + h] = y; this.pz[b + h] = z; this.pt[b + h] = now;
    if (this.count[ti] < TRAIL_N) this.count[ti]++;
    if (ti + 1 > this.used) this.used = ti + 1;
  }

  // Rebuilds the camera-facing strips; samples older than `life` fade out and drop.
  update(now, life, width, gain, cam) {
    const P = this.pos.array, C = this.colA.array;
    let any = false;
    for (let t = 0; t < TRAIL_MAX; t++) {
      const b = t * TRAIL_N;
      while (this.count[t] > 0) {
        const oldest = (this.head[t] - this.count[t] + 1 + TRAIL_N) % TRAIL_N;
        if (now - this.pt[b + oldest] > life) this.count[t]--; else break;
      }
      const cnt = t < this.used ? this.count[t] : 0;
      for (let i = 0; i < TRAIL_N; i++) {
        const v = (b + i) * 2;
        if (i >= cnt || cnt < 2) {
          for (let k = 0; k < 6; k++) { P[v * 3 + k] = 0; C[v * 3 + k] = 0; }
          continue;
        }
        any = true;
        const s = (this.head[t] - i + TRAIL_N) % TRAIL_N;          // i = 0 is the newest sample
        const sp = (this.head[t] - Math.max(0, i - 1) + TRAIL_N) % TRAIL_N;
        const sn = (this.head[t] - Math.min(cnt - 1, i + 1) + TRAIL_N) % TRAIL_N;
        const x = this.px[b + s], y = this.py[b + s], z = this.pz[b + s];
        const dx = this.px[b + sp] - this.px[b + sn], dy = this.py[b + sp] - this.py[b + sn], dz = this.pz[b + sp] - this.pz[b + sn];
        const ex = cam.x - x, ey = cam.y - y, ez = cam.z - z;
        let sx = dy * ez - dz * ey, sy = dz * ex - dx * ez, sz = dx * ey - dy * ex;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const f = Math.max(0, 1 - (now - this.pt[b + s]) / life);
        const w = width * (0.35 + 0.65 * f);
        sx *= w / sl; sy *= w / sl; sz *= w / sl;
        P[v * 3] = x - sx; P[v * 3 + 1] = y - sy; P[v * 3 + 2] = z - sz;
        P[v * 3 + 3] = x + sx; P[v * 3 + 4] = y + sy; P[v * 3 + 5] = z + sz;
        const k = f * f * gain, c = this.col[t];
        C[v * 3] = C[v * 3 + 3] = c.r * k; C[v * 3 + 1] = C[v * 3 + 4] = c.g * k; C[v * 3 + 2] = C[v * 3 + 5] = c.b * k;
      }
    }
    this.mesh.visible = any;
    if (any) { this.pos.needsUpdate = true; this.colA.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------- screen-edge speed lines
const LINES_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const LINES_FS = /* glsl */ `
uniform float uAmt, uTime, uAspect;
uniform vec2 uCenter;
uniform vec3 uTint;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(p);
  float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
  float N = 150.0;
  float cell = floor(ang * N), f = fract(ang * N);
  float h = h11(cell), h2 = h11(cell + 31.7);
  float lw = 0.05 + 0.1 * h2;
  float line = 1.0 - smoothstep(lw * 0.4, lw, abs(f - 0.5));
  float seg = fract(r * 0.8 - uTime * (1.4 + 1.6 * h) + h * 7.0);
  float len = 0.22 + 0.33 * h2;
  float dash = smoothstep(0.0, 0.04, seg) * (1.0 - smoothstep(len * 0.6, len, seg));
  float on = step(0.36, h);
  float mask = smoothstep(0.38, 1.0, r);
  float a = line * dash * on * mask * uAmt * 0.45;
  float vig = smoothstep(0.7, 1.5, r) * uAmt * 0.32;
  gl_FragColor = vec4(uTint * a, a + vig * (1.0 - a));
}`;

// ---------------------------------------------------------------- audio recipes (installed on the shared engine)
// Each is a normal engine voice: its sources stop on schedule (or on handle.stop()) and _release disconnects them.
const RECIPES = {
  _s_nitroOn(o) {
    const v = this._voice('nitroOn', o, 1.2, 0.12);
    const t = v.t0, low = o.kind === 'diesel' ? 0.6 : 1, srcs = [];
    if (o.kind !== 'turbine') {
      const n = this._noise(false), bp = this._filter('bandpass', 380 * low, 1.3), g = this._gain();
      bp.frequency.setValueAtTime(380 * low, t);
      bp.frequency.exponentialRampToValueAtTime(2900 * low, t + 0.22);
      bp.frequency.exponentialRampToValueAtTime(800 * low, t + 1.0);
      n.connect(bp); bp.connect(g); g.connect(v.in);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.07); g.gain.setTargetAtTime(0.0001, t + 0.25, 0.2);
      srcs.push(n);
    }
    if (o.kind !== 'walk') {
      const s = this._osc('triangle', 420 * low), sg = this._gain();
      s.frequency.setValueAtTime(420 * low, t); s.frequency.exponentialRampToValueAtTime(2600 * low, t + 0.75);
      s.connect(sg); sg.connect(v.in);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.07, t + 0.2); sg.gain.setTargetAtTime(0.0001, t + 0.7, 0.12);
      const k = this._osc('sine', 95 * low), kg = this._gain();
      k.frequency.setValueAtTime(95 * low, t); k.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      k.connect(kg); kg.connect(v.in);
      this._env(kg.gain, t, 0.003, 0.55, 0.2);
      srcs.push(s, k);
    }
    for (const s of srcs) this._start(v, s);
    return v;
  },
  // Sustained roar while boosting; caller sets v.in.gain to the boost level and stops it with handle.stop().
  _s_nitroRoar(o) {
    const v = this._voice('nitroRoar', o, 3600, 0.04);
    const low = o.kind === 'diesel' ? 0.55 : o.kind === 'turbine' ? 1.8 : 1;
    const r = this._noise(true), lp = this._filter('lowpass', 480 * low, 0.9), rg = this._gain(0.9);
    r.connect(lp); lp.connect(rg); rg.connect(v.in);
    const lfo = this._osc('sine', 7.3), lg = this._gain(120 * low);
    lfo.connect(lg); lg.connect(lp.frequency);
    const n = this._noise(false), bp = this._filter('bandpass', 1700 * low, 0.7), ng = this._gain(0.09);
    n.connect(bp); bp.connect(ng); ng.connect(v.in);
    v.in.gain.value = 0;
    this._start(v, r); this._start(v, lfo); this._start(v, n);
    return v;
  },
  _s_nitroOff(o) {
    const pops = o.pops || 0;
    const v = this._voice('nitroOff', o, 0.9, 0.18);
    const t = v.t0;
    const n = this._noise(false), hp = this._filter('highpass', 2600, 0.7), g = this._gain();
    n.connect(hp); hp.connect(g); g.connect(v.in);
    this._env(g.gain, t, 0.01, o.kind === 'walk' ? 0.12 : 0.28, 0.45);
    this._start(v, n, t, 0.6);
    for (let i = 0; i < pops; i++) {
      const at = t + 0.06 + i * (0.09 + Math.random() * 0.08);
      const b = this._noise(true), bl = this._filter('lowpass', 900, 0.8), bg = this._gain();
      b.connect(bl); bl.connect(bg); bg.connect(v.in);
      this._env(bg.gain, at, 0.002, 0.9, 0.07);
      const k = this._osc('sine', 130), kg = this._gain();
      k.frequency.setValueAtTime(130, at); k.frequency.exponentialRampToValueAtTime(48, at + 0.06);
      k.connect(kg); kg.connect(v.in);
      this._env(kg.gain, at, 0.002, 0.6, 0.07);
      this._start(v, b, at, 0.14); this._start(v, k, at, 0.14);
    }
    return v;
  },
};

// ---------------------------------------------------------------- the world-space system
const _v = new THREE.Vector3(), _col = new THREE.Color(), _SPARK = new THREE.Color(1.0, 0.72, 0.35);
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class NitroFx {
  constructor(app) {
    this.app = app;
    const scene = app.scene;
    this.add = new StreakPool(scene, 320, true);    // sparks + wind streaks
    this.alpha = new StreakPool(scene, 96, false);  // soot + dust
    this.trails = new TrailSet(scene);
    this.lines = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTint: { value: new THREE.Color(0.92, 0.95, 1.0) } },
      vertexShader: LINES_VS, fragmentShader: LINES_FS, transparent: true, depthTest: false, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 9999;
    scene.add(this.lines);

    this.fovAdd = 0;
    this.level = 0;          // eased boost level of the active entity (0..1)
    this.time = 0;
    this.kick = 0;           // start kick (shake + FOV), decays
    this.wasActive = false;
    this.entity = null;
    this.lastPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hasLast = false;
    this.windAcc = 0; this.sootAcc = 0; this.dustAcc = 0;
    this.pending = 0; this.pendingT = 0; // backfire pops still to fire after release
    this.roar = null;
    this.roarGain = -1;
    this._warm(app);
  }

  // Compile every shader once up front so the first boost does not hitch.
  _warm(app) {
    try {
      const sc = new THREE.Scene(), g = new THREE.Group();
      sc.add(g);
      for (const k of Object.keys(STYLES)) { createNitroRig(g, { style: k, exhausts: [[0, 0, 0]] }); }
      sc.add(this.add.mesh.clone(), this.alpha.mesh.clone(), this.trails.mesh.clone(), this.lines.clone());
      sc.traverse((o) => { o.visible = true; });
      app.renderer.compile(sc, app.camera);
      g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    } catch (e) { /* warm-up is optional */ }
  }

  _sfx() {
    const s = getWeaponSfx(this.app);
    if (!s._s_nitroOn) Object.assign(s, RECIPES);
    return s;
  }

  _kind() {
    const a = this.app;
    if (a.mode === 'helicopter') return 'heli';
    if (a.mode === 'walk') return 'walk';
    return 'drive';
  }

  update(dt) {
    const app = this.app, cam = app.camera;
    if (!cam || dt <= 0) return;
    this.time += dt;
    const kind = this._kind();
    const ent = kind === 'heli' ? app.heliMesh : kind === 'walk' ? app.avatarMesh : app.vehicleMesh;
    const rig = ent && ent.userData && ent.userData.vfxParts ? ent.userData.vfxParts.rig : null;
    const speed = Math.abs(app.speed || 0);
    const active = kind === 'drive' ? Boolean(rig && rig.active) : Boolean(app.nitroActive && speed > (kind === 'walk' ? 2 : 5));

    // Entity velocity from position deltas (teleports / swaps reset the history).
    if (ent !== this.entity) { this.entity = ent; this.hasLast = false; this.trails.reset(); }
    if (ent) {
      if (this.hasLast) {
        _v.subVectors(ent.position, this.lastPos);
        if (_v.lengthSq() > 80 * 80) { this.vel.set(0, 0, 0); this.trails.reset(); }
        else this.vel.lerp(_v.multiplyScalar(1 / dt), Math.min(1, dt * 20));
      }
      this.lastPos.copy(ent.position); this.hasLast = true;
    }

    // Start / end edges
    if (active && !this.wasActive) this._onStart(kind, ent, rig);
    else if (!active && this.wasActive) this._onEnd(kind, rig);
    this.wasActive = active;
    this.level += ((active ? 1 : 0) - this.level) * Math.min(1, dt * (active ? 5 : 2.5));
    if (!active && this.level < 0.003) this.level = 0;
    this.kick = Math.max(0, this.kick - dt * 2.2);

    // Delayed backfire pops after release
    if (this.pending > 0 && rig) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) { this.pending--; this.pendingT = rnd(0.08, 0.17); rig.pop = 1; this._sparks(rig, 8, 0.8); }
    }

    const busy = this.level > 0 || this.add.n > 0 || this.alpha.n > 0 || this.trails.mesh.visible || this.kick > 0;
    if (!busy) { this.fovAdd = 0; this.lines.visible = false; this._roarLevel(0); return; }

    // Continuous emitters
    if (this.level > 0.05 && ent) {
      this._wind(dt, kind, ent, speed);
      if (rig && rig.cfg.soot && active) this._soot(dt, rig);
      if (kind === 'walk' && active) this._dust(dt, ent);
    }
    if (rig && rig.trailAnchors.length) this._trails(rig, active, speed);
    else if (this.trails.mesh.visible) this.trails.update(this.time, 0.3, 0.05, 1, cam.position);

    this.add.update(dt, this.vel, cam.position);
    this.alpha.update(dt, this.vel, cam.position);

    // Camera: subtle shake + FOV kick (fovAdd is read by main.js _updateCamera)
    const lv = this.level, topdown = app.camMode === 'topdown';
    const spdK = Math.min(1, speed / (kind === 'walk' ? 20 : 110));
    const amp = topdown ? 0 : lv * (kind === 'walk' ? 0.008 : kind === 'heli' ? 0.02 : 0.018 + 0.03 * spdK) + this.kick * 0.05;
    if (amp > 0.0005) {
      const t = this.time;
      _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const sx = Math.sin(t * 31.1) * 0.6 + Math.sin(t * 47.3 + 1.3) * 0.4;
      const sy = Math.sin(t * 37.7 + 0.5) * 0.6 + Math.sin(t * 53.9) * 0.4;
      cam.position.addScaledVector(_right, sx * amp).addScaledVector(_up, sy * amp);
      cam.rotateZ(Math.sin(t * 23.0) * amp * 0.12);
    }
    this.fovAdd = (kind === 'walk' ? 3 : 5) * this.kick * this.kick;

    // Speed lines
    const amt = lv * (topdown ? 0.25 : kind === 'walk' ? 0.55 : kind === 'heli' ? 0.75 : 0.55 + 0.45 * spdK);
    this.lines.visible = amt > 0.01;
    if (this.lines.visible) {
      const u = this.lines.material.uniforms;
      u.uAmt.value = amt; u.uTime.value = this.time;
      u.uAspect.value = cam.aspect || 1;
      if (ent && this.vel.lengthSq() > 1) {
        _ndc.copy(ent.position).addScaledVector(_fwd.copy(this.vel).normalize(), 200).project(cam);
        if (_ndc.z < 1) u.uCenter.value.set(THREE.MathUtils.clamp(_ndc.x * 0.5 + 0.5, 0.25, 0.75), THREE.MathUtils.clamp(_ndc.y * 0.5 + 0.5, 0.3, 0.7));
      }
    }
    this._roarLevel(active ? lv : 0);
  }

  _onStart(kind, ent, rig) {
    this.kick = 1;
    this.pending = 0;
    if (rig) { rig.pop = 1; this._sparks(rig, 14, 1); if (rig.cfg.soot) this._sootBurst(rig); }
    const k = kind === 'walk' ? 'walk' : kind === 'heli' ? 'turbine' : rig ? (rig.cfg.soot ? 'diesel' : rig.style) : 'blue';
    try {
      const s = this._sfx();
      s.play('nitroOn', { gain: kind === 'walk' ? 0.5 : 0.8, kind: k });
      if (kind !== 'walk' && !this.roar) {
        const h = s.play('nitroRoar', { gain: kind === 'heli' ? 0.35 : 0.55, kind: k });
        if (h.voice) { this.roar = h; s.loops.push(h.voice); this.roarGain = 0; } // loops: never stolen by the voice cap
      }
    } catch (e) { /* audio optional */ }
  }

  _onEnd(kind, rig) {
    const drive = kind === 'drive' && rig && rig.flames.length;
    if (drive) { rig.pop = 1; this._sparks(rig, 10, 0.9); this.pending = 1 + Math.floor(Math.random() * 2); this.pendingT = rnd(0.1, 0.16); }
    try {
      this._sfx().play('nitroOff', { gain: 0.7, kind: kind === 'walk' ? 'walk' : 'car', pops: drive ? 1 + this.pending : 0 });
    } catch (e) { /* audio optional */ }
    if (this.roar) { this.roar.stop(); this.roar = null; this.roarGain = -1; }
  }

  _roarLevel(l) {
    if (!this.roar) return;
    const v = this.roar.voice;
    if (!v || v.stopped) { this.roar = null; return; }
    if (Math.abs(l - this.roarGain) < 0.03) return;
    this.roarGain = l;
    try { v.in.gain.setTargetAtTime(l, v.lp.context.currentTime, 0.06); } catch (e) { /* closed */ }
  }

  // Hot sparks out of every exhaust mouth (pops / backfire).
  _sparks(rig, perExhaust, k) {
    if (rig.style === 'turbine') return;
    for (const f of rig.flames) {
      f.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(f.matrixWorld);
      _fwd.set(0, 0, -1).transformDirection(f.matrixWorld);
      _col.setHex(rig.cfg.glow).lerp(_SPARK, 0.6);
      for (let i = 0; i < perExhaust; i++) {
        const sp = rnd(5, 16) * k;
        this.add.spawn(K_SPARK, _v.x, _v.y, _v.z,
          this.vel.x + _fwd.x * sp + rnd(-2.5, 2.5), this.vel.y + _fwd.y * sp + rnd(-0.5, 3), this.vel.z + _fwd.z * sp + rnd(-2.5, 2.5),
          rnd(0.2, 0.5), rnd(0.02, 0.035), 0, _col.r * 1.6, _col.g * rnd(1.1, 1.5), _col.b * 1.2, rnd(1.2, 2.2), 2.5, 9.8, 0.035);
      }
    }
  }

  _sootBurst(rig) {
    for (const f of rig.flames) {
      f.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(f.matrixWorld);
      for (let i = 0; i < 4; i++) {
        this.alpha.spawn(K_SOOT, _v.x, _v.y, _v.z, this.vel.x * 0.7 + rnd(-1, 1), rnd(1, 3), this.vel.z * 0.7 + rnd(-1, 1),
          rnd(0.9, 1.5), rnd(0.3, 0.5), rnd(1.6, 2.6), 0.16, 0.15, 0.14, 0.8, 1.6, -0.8, 0);
      }
    }
  }

  _soot(dt, rig) {
    this.sootAcc += dt * 30 * rig.flames.length;
    while (this.sootAcc >= 1) {
      this.sootAcc -= 1;
      const f = rig.flames[(Math.random() * rig.flames.length) | 0];
      f.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(f.matrixWorld);
      _fwd.set(0, 0, -1).transformDirection(f.matrixWorld);
      this.alpha.spawn(K_SOOT, _v.x + _fwd.x * 0.6, _v.y + _fwd.y * 0.6, _v.z + _fwd.z * 0.6,
        this.vel.x * 0.75 + _fwd.x * 4 + rnd(-0.6, 0.6), _fwd.y * 4 + rnd(0.6, 2), this.vel.z * 0.75 + _fwd.z * 4 + rnd(-0.6, 0.6),
        rnd(0.6, 1.1), rnd(0.25, 0.4), rnd(1.2, 2.2), 0.22, 0.21, 0.2, 0.65, 1.8, -0.6, 0);
    }
  }

  _dust(dt, ent) {
    this.dustAcc += dt * 14;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      this.alpha.spawn(K_DUST, ent.position.x + rnd(-0.25, 0.25), ent.position.y + 0.08, ent.position.z + rnd(-0.25, 0.25),
        this.vel.x * 0.15 + rnd(-0.6, 0.6), rnd(0.3, 0.9), this.vel.z * 0.15 + rnd(-0.6, 0.6),
        rnd(0.5, 0.8), 0.12, 0.9, 0.62, 0.6, 0.56, 0.22, 2, -0.2, 0);
    }
  }

  // Air / dust streaks: world-fixed motes ahead of the car that blur past (stretched by the car's velocity).
  _wind(dt, kind, ent, speed) {
    const sp = Math.max(speed, this.vel.length());
    if (sp < 4) return;
    const rate = this.level * Math.min(140, sp * (kind === 'walk' ? 3 : 1.6));
    this.windAcc += dt * rate;
    if (this.windAcc < 1) return;
    _fwd.copy(this.vel).normalize();
    _right.set(_fwd.z, 0, -_fwd.x).normalize();
    const ahead = kind === 'walk' ? 8 : 18;
    const spread = kind === 'heli' ? 14 : kind === 'walk' ? 4 : 8;
    const shutter = kind === 'walk' ? 0.06 : 0.035;
    while (this.windAcc >= 1) {
      this.windAcc -= 1;
      const side = (Math.random() < 0.5 ? -1 : 1) * rnd(kind === 'walk' ? 1 : 2.2, spread);
      const d = rnd(ahead * 0.5, ahead * 2.2);
      const y = ent.position.y + (kind === 'heli' ? rnd(-6, 8) : rnd(0.15, kind === 'walk' ? 3 : 4.5));
      const life = Math.min(1.2, (d + 12) / sp);
      const g = rnd(0.75, 1);
      this.add.spawn(K_WIND, ent.position.x + _fwd.x * d + _right.x * side, y, ent.position.z + _fwd.z * d + _right.z * side,
        rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5), life, rnd(0.008, 0.02), 0, 0.8 * g, 0.86 * g, 0.95 * g, rnd(0.2, 0.45), 0, 0, shutter);
    }
  }

  _trails(rig, active, speed) {
    const cam = this.app.camera;
    const emit = active && rig.level > 0.15;
    const life = THREE.MathUtils.clamp(26 / Math.max(1, speed), 0.12, 0.45);
    const ts = this.trails;
    for (let i = 0; i < rig.trailAnchors.length && i < TRAIL_MAX; i++) {
      const a = rig.trailAnchors[i];
      ts.col[i].copy(a.color);
      if (!emit) continue;
      a.obj.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(a.obj.matrixWorld);
      ts.push(i, _v.x, _v.y, _v.z, this.time);
    }
    ts.update(this.time, life, 0.028, rig.cfg.trailGain ?? 1.2, cam.position);
  }
}
