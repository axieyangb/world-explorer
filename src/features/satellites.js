import * as THREE from '../../vendor/three.module.js';
import { json2satrec, sgp4, jday, gstime, sunPos, eciToGeodetic } from '../../vendor/satellite.module.js';
import { isTouchDevice } from './touch_controls.js';

/**
 * [satellites] Real satellites and the ISS crossing the night sky. Orbits come from CelesTrak GP
 * JSON (keyless, CORS): space stations, the ~150 brightest objects and recently launched Starlink
 * "trains" (?sats=starlink adds the whole constellation, ?sats=off disables). Fetched once per
 * session and cached in localStorage for 2 h, as CelesTrak asks. SGP4 (vendored satellite.js) runs
 * on real time (Date.now(), not the game clock) in time-sliced snapshots STEP s apart; the vertex
 * shader interpolates between two snapshots, so a frame only sets a couple of uniforms.
 * A satellite shows only when it is sunlit (real sun, cylindrical Earth shadow), above the horizon,
 * and the game sky is dark enough for stars (atmosphere uStars), and it hides behind sky clouds.
 * Offline / blocked: nothing is drawn, silently.
 */

const DEG = Math.PI / 180;
const STEP = 1.0; // s between SGP4 snapshots
const R_SKY = 15000; // m, points sphere (inside the 16800 m sky dome, before the 18000 m far plane)
const RE_KM = 6378.137;
const E2 = 0.00669437999014; // WGS84 eccentricity^2
const CACHE_MS = 2 * 3600 * 1000;
const CACHE_KEY = 'we.sats.v1.';
const MAX_SATS = 12000;
const ISS_ID = 25544;
const BASE = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&GROUP=';
// class -> [size px, brightness]
// starlink = recent launches (low, bright "trains"); faint = the rest of the constellation (?sats=starlink)
const KIND = { iss: [7.0, 2.6], station: [4.5, 1.5], visual: [3.6, 1.3], starlink: [3.0, 0.9], faint: [2.2, 0.3] };
const OMM_KEYS = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'NORAD_CAT_ID', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

async function fetchGroup(group) {
  const key = CACHE_KEY + group;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    cached = null;
  }
  if (cached && Array.isArray(cached.d) && Date.now() - cached.t < CACHE_MS) return cached.d;
  try {
    const r = await fetch(BASE + group);
    const j = r.ok ? await r.json() : null;
    if (Array.isArray(j) && j.length) {
      const d = j.map((o) => {
        const s = {};
        for (const k of OMM_KEYS) s[k] = o[k];
        return s;
      });
      try {
        localStorage.setItem(key, JSON.stringify({ t: Date.now(), d }));
      } catch {
        // quota / private mode: no cache
      }
      return d;
    }
  } catch {
    // offline: fall through to a stale cache, if any
  }
  return cached && Array.isArray(cached.d) ? cached.d : [];
}

function createPoints(n) {
  const geom = new THREE.BufferGeometry();
  const a = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const b = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const v = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
  const k = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
  geom.setAttribute('position', a); // snapshot A direction (named position so three.js draws n vertices)
  geom.setAttribute('aB', b);
  geom.setAttribute('aVis', v);
  geom.setAttribute('aKind', k);
  return geom;
}

export class Satellites {
  constructor(app, sky, opts) {
    this.app = app;
    this.full = opts.full;
    this.light = isTouchDevice();
    this.recs = [];
    this.kind = [];
    this.names = [];
    this.n = 0;
    this.issIdx = -1;
    this.loaded = false;
    this.active = false;
    this.mesh = null;
    this.sky = sky;
    // Ring of 3 snapshots: [A, B, filling]. dir = unit topocentric direction in world axes, vis = sunlit * range factor.
    this.snaps = [];
    this.cursor = 0; // next sat index for the snapshot being filled
    this.fillIdx = 0; // which snapshot is being filled (0..2), -1 when all three are done
    this.lastMs = 0; // ms spent propagating during the last completed snapshot
    this._ms = 0;
    this._obs = new Float64Array(6); // observer ECF xyz + sin/cos lat, lon in snapshot frame
    this._sun = new Float64Array(3);
    this._issDir = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.label = null;
    window.__SATELLITES__ = { stats: () => this.stats(), list: (max) => this.list(max) };
    this._load();
  }

  async _load() {
    const groups = ['stations', 'visual', 'last-30-days'];
    if (this.full) groups.push('starlink');
    const res = await Promise.all(groups.map(fetchGroup));
    const seen = new Set();
    const now = new Date();
    const jd = jday(now);
    const stationPos = [];
    const add = (o, kind) => {
      if (this.recs.length >= MAX_SATS || !o || seen.has(o.NORAD_CAT_ID)) return;
      let rec;
      try {
        rec = json2satrec(o);
      } catch {
        return;
      }
      const pv = sgp4(rec, (jd - rec.jdsatepoch) * 1440);
      if (!pv || !pv.position || !Number.isFinite(pv.position.x)) return;
      if (kind === 'station' || kind === 'iss') {
        // modules / docked vehicles share their station's orbit: keep one dot per station
        const p = pv.position;
        for (const q of stationPos) if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 15) return;
        stationPos.push(p);
      }
      seen.add(o.NORAD_CAT_ID);
      if (o.NORAD_CAT_ID === ISS_ID) this.issIdx = this.recs.length;
      this.recs.push(rec);
      this.kind.push(kind);
      this.names.push(o.OBJECT_NAME || String(o.NORAD_CAT_ID));
    };
    const [stations, visual, recent, all = []] = res;
    stations.sort((x, y) => (x.NORAD_CAT_ID === ISS_ID ? -1 : y.NORAD_CAT_ID === ISS_ID ? 1 : 0));
    for (const o of stations) add(o, o.NORAD_CAT_ID === ISS_ID ? 'iss' : 'station');
    for (const o of visual) add(o, 'visual');
    for (const o of recent) if (/^STARLINK/.test(o.OBJECT_NAME || '')) add(o, 'starlink');
    for (const o of all) add(o, 'faint');
    if (!this.recs.length) return;
    this._build();
  }

  _build() {
    const n = (this.n = this.recs.length);
    for (let s = 0; s < 3; s++) this.snaps.push({ t: 0, done: false, dir: new Float32Array(n * 3), vis: new Float32Array(n), el: new Float32Array(n) });
    const geom = createPoints(n);
    const k = geom.attributes.aKind.array;
    for (let i = 0; i < n; i++) {
      const c = KIND[this.kind[i]];
      k[i * 2] = c[0];
      k[i * 2 + 1] = c[1];
    }
    const su = this.sky.uniforms;
    this.uniforms = {
      uF: { value: 0 },
      uR: { value: R_SKY },
      uOpacity: { value: 0 },
      uPx: { value: this.app.renderer.getPixelRatio() },
      // shared by reference with the sky dome so satellites hide behind the same clouds
      uCloudCover: su.uCloudCover,
      uFogMix: su.uFogMix,
      uTime: su.uTime,
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
      vertexShader: `
        attribute vec3 aB; attribute vec2 aVis; attribute vec2 aKind;
        uniform float uF, uR, uOpacity, uPx, uCloudCover, uFogMix, uTime;
        varying float vA;
        float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = rot * p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
          return s;
        }
        void main() {
          vec3 dir = normalize(mix(position, aB, uF) + vec3(0.0, 1e-6, 0.0));
          float a = mix(aVis.x, aVis.y, uF) * aKind.y * uOpacity;
          a *= smoothstep(0.0, 0.08, dir.y) * (1.0 - uFogMix); // horizon extinction
          if (uCloudCover > 0.01 && a > 0.0) { // same domain-warped cloud layer as sky.js
            float domeY = sqrt(max(dir.y, 0.0) * max(dir.y, 0.0) + 0.035) + 0.04;
            vec2 cuv = dir.xz / domeY * 0.62 + vec2(uTime * 0.0055, uTime * 0.0018);
            vec2 q = cuv + 0.55 * vec2(fbm(cuv), fbm(cuv + vec2(5.2, 1.3)));
            float n = fbm(cuv + 0.85 * vec2(fbm(q * 1.9 + vec2(1.7, 9.2)), fbm(q * 1.9 + vec2(2.8, 8.3))));
            float thresh = 0.76 - uCloudCover * 0.58;
            float cov = smoothstep(thresh, thresh + 0.32, n - 0.12 * (1.0 - 0.52 * uCloudCover));
            a *= 1.0 - cov * 0.98;
          }
          vA = a;
          vec4 mv = modelViewMatrix * vec4(dir * uR, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = a > 0.003 ? aKind.x * uPx * (0.6 + 0.4 * min(a, 1.5)) : 0.0;
          if (a <= 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off-screen
        }
      `,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(0.5, 0.0, d); // bright core + soft halo; vA > 1 saturates to a larger white dot
          float halo = (1.0 - d) * (1.0 - d) * 0.45;
          float a = max(core + halo * step(d, 1.0), 0.0) * vA;
          gl_FragColor = vec4(vec3(0.93, 0.95, 1.0) * a, 1.0); // additive: adds color * a
        }
      `,
    });
    this.mesh = new THREE.Points(geom, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9; // right after the sky dome (-10) within the transparent pass
    this.mesh.visible = false;
    this.app.scene.add(this.mesh);
    if (this.issIdx >= 0) this._makeLabel();
    this.loaded = true;
  }

  _makeLabel() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d');
    ctx.font = '600 20px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(232,238,248,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISS', 6, 17);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    sp.center.set(-0.1, 0.5); // text sits just right of the dot
    sp.renderOrder = -8;
    sp.visible = false;
    this.label = sp;
    this.app.scene.add(sp);
  }

  _latLon() {
    const o = this.app.worldOrigin;
    if (!o || !o.mPerDegLat) return null;
    const p = this.app.pos;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  /** Per-snapshot setup: observer ECF + sun direction (ECI) for the snapshot's time. */
  _beginSnap(snap) {
    const ll = this._latLon() || [0, 0];
    const jd = jday(new Date(snap.t));
    snap.jd = jd;
    snap.gmst = gstime(jd);
    const lat = ll[0] * DEG;
    const lon = ll[1] * DEG;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    const N = RE_KM / Math.sqrt(1 - E2 * sl * sl);
    const ob = this._obs;
    ob[0] = N * cl * Math.cos(lon);
    ob[1] = N * cl * Math.sin(lon);
    ob[2] = N * (1 - E2) * sl;
    snap.lat = lat;
    snap.lon = lon;
    const rs = sunPos(jd).rsun;
    const len = Math.hypot(rs.x, rs.y, rs.z);
    this._sun[0] = rs.x / len;
    this._sun[1] = rs.y / len;
    this._sun[2] = rs.z / len;
  }

  /** Propagate sats [i0, i1) into snap. */
  _fill(snap, i0, i1) {
    const ob = this._obs, sun = this._sun;
    const g = snap.gmst, cg = Math.cos(g), sg = Math.sin(g);
    const sl = Math.sin(snap.lat), cl = Math.cos(snap.lat), so = Math.sin(snap.lon), co = Math.cos(snap.lon);
    const dir = snap.dir, vis = snap.vis, elv = snap.el;
    for (let i = i0; i < i1; i++) {
      const rec = this.recs[i];
      let pv = null;
      try {
        pv = sgp4(rec, (snap.jd - rec.jdsatepoch) * 1440);
      } catch {
        pv = null;
      }
      const p = pv && pv.position;
      if (!p || !Number.isFinite(p.x)) {
        vis[i] = 0;
        elv[i] = -90;
        continue;
      }
      // Earth shadow (cylinder): behind the Earth relative to the sun and within one Earth radius of the axis
      const ds = p.x * sun[0] + p.y * sun[1] + p.z * sun[2];
      let lit = 1;
      if (ds < 0) {
        const px = p.x - ds * sun[0], py = p.y - ds * sun[1], pz = p.z - ds * sun[2];
        if (px * px + py * py + pz * pz < RE_KM * RE_KM) lit = 0;
      }
      // ECI -> ECF -> topocentric ENU
      const x = p.x * cg + p.y * sg - ob[0];
      const y = -p.x * sg + p.y * cg - ob[1];
      const z = p.z - ob[2];
      const e = -so * x + co * y;
      const nn = -sl * co * x - sl * so * y + cl * z;
      const u = cl * co * x + cl * so * y + sl * z;
      const rng = Math.sqrt(e * e + nn * nn + u * u) || 1;
      // world axes: +x east, +y up, -z north
      dir[i * 3] = e / rng;
      dir[i * 3 + 1] = u / rng;
      dir[i * 3 + 2] = -nn / rng;
      elv[i] = Math.asin(u / rng) / DEG;
      vis[i] = elv[i] > -1 ? lit * Math.max(0.6, Math.min(1.3, 900 / rng)) : 0;
    }
  }

  _restart(now) {
    const s = this.snaps;
    s[0].t = now + 50; // first two snapshots fill in a frame or two
    s[1].t = s[0].t + STEP * 1000;
    s[2].t = s[1].t + STEP * 1000;
    for (const x of s) x.done = false;
    this.fillIdx = 0;
    this.cursor = 0;
  }

  /** Spend a bounded slice of this frame on the next pending snapshot. */
  _work() {
    if (this.fillIdx < 0) return;
    const t0 = performance.now();
    const budget = this.light ? 1.0 : 2.0;
    while (this.fillIdx >= 0) {
      const snap = this.snaps[this.fillIdx];
      if (this.cursor === 0) {
        this._beginSnap(snap);
        this._ms = 0;
      }
      const a = performance.now();
      const i1 = Math.min(this.n, this.cursor + 128);
      this._fill(snap, this.cursor, i1);
      this.cursor = i1;
      this._ms += performance.now() - a;
      if (this.cursor >= this.n) {
        snap.done = true;
        this.lastMs = this._ms;
        this.cursor = 0;
        this.fillIdx = this.snaps.findIndex((x) => !x.done);
        if (this.fillIdx === 0 || this.fillIdx === 1) this._upload();
      }
      if (performance.now() - t0 > budget) break;
    }
  }

  _upload() {
    const g = this.mesh.geometry;
    const A = this.snaps[0], B = this.snaps[1];
    g.attributes.position.array.set(A.dir);
    g.attributes.aB.array.set(B.done ? B.dir : A.dir);
    const v = g.attributes.aVis.array;
    for (let i = 0; i < this.n; i++) {
      v[i * 2] = A.vis[i];
      v[i * 2 + 1] = B.done ? B.vis[i] : A.vis[i];
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aB.needsUpdate = true;
    g.attributes.aVis.needsUpdate = true;
  }

  update() {
    if (!this.loaded) return;
    const atmo = this.app.atmosphere;
    const stars = atmo && atmo.sky ? atmo.sky.uniforms.uStars.value : 0;
    if (stars < 0.02 || this.app.isTeleporting) {
      // daytime / overcast: nothing per frame, snapshots go stale and restart at dusk
      if (this.active) {
        this.active = false;
        this.mesh.visible = false;
        if (this.label) this.label.visible = false;
      }
      return;
    }
    const now = Date.now();
    const s = this.snaps;
    if (!this.active || now > s[1].t + 2 * STEP * 1000 || (this._gen ?? -1) !== (this.app.teleportGeneration || 0)) {
      this._gen = this.app.teleportGeneration || 0;
      this.active = true;
      this._restart(now);
    }
    // rotate A <- B <- C once real time passes B and C is ready
    if (now >= s[1].t && s[2].done) {
      const a = s.shift();
      a.t = s[1].t + STEP * 1000;
      a.done = false;
      s.push(a);
      this.fillIdx = 2;
      this.cursor = 0;
      this._upload();
    }
    this._work();
    const ready = s[0].done && s[1].done;
    this.mesh.visible = ready;
    if (!ready) return;
    const f = Math.max(0, Math.min(1, (now - s[0].t) / (s[1].t - s[0].t)));
    const u = this.uniforms;
    u.uF.value = f;
    u.uOpacity.value = Math.min(1, stars * 1.25);
    u.uPx.value = this.app.renderer.getPixelRatio();
    const cam = this.app.camera;
    this.mesh.position.copy(cam.position);
    this._updateLabel(f, stars, cam);
  }

  _updateLabel(f, stars, cam) {
    const sp = this.label;
    if (!sp) return;
    const i = this.issIdx;
    const A = this.snaps[0], B = this.snaps[1];
    const vis = A.vis[i] + (B.vis[i] - A.vis[i]) * f;
    const d = this._issDir.set(
      A.dir[i * 3] + (B.dir[i * 3] - A.dir[i * 3]) * f,
      A.dir[i * 3 + 1] + (B.dir[i * 3 + 1] - A.dir[i * 3 + 1]) * f,
      A.dir[i * 3 + 2] + (B.dir[i * 3 + 2] - A.dir[i * 3 + 2]) * f).normalize();
    cam.getWorldDirection(this._fwd);
    const look = this._fwd.dot(d); // label only while looking near the ISS (~25 deg)
    const a = vis > 0.05 && d.y > 0.05 ? stars * Math.max(0, Math.min(1, (look - 0.9) / 0.04)) : 0;
    sp.visible = a > 0.01;
    if (!sp.visible) return;
    sp.material.opacity = 0.85 * a;
    const r = R_SKY * 0.98;
    sp.position.copy(cam.position).addScaledVector(d, r);
    const h = r * 0.022; // constant angular size
    sp.scale.set(h * 2, h, 1);
  }

  stats() {
    const out = { loaded: this.n, active: this.active, aboveHorizon: 0, visible: 0, propagateMs: Number(this.lastMs.toFixed(2)), iss: null };
    if (!this.n || !this.snaps.length || !this.snaps[0].done) return out;
    const A = this.snaps[0];
    const stars = this.app.atmosphere ? this.app.atmosphere.sky.uniforms.uStars.value : 0;
    out.sunlitAbove = 0;
    for (let i = 0; i < this.n; i++) {
      if (A.el[i] <= 0) continue;
      out.aboveHorizon++;
      if (A.vis[i] > 0) out.sunlitAbove++;
    }
    out.visible = stars >= 0.02 ? out.sunlitAbove : 0; // sunlit + above horizon + dark game sky
    if (this.issIdx >= 0) {
      const i = this.issIdx;
      const az = Math.atan2(A.dir[i * 3], -A.dir[i * 3 + 2]) / DEG;
      out.iss = { az: Number(((az + 360) % 360).toFixed(2)), el: Number(A.el[i].toFixed(2)), sunlit: A.vis[i] > 0, t: new Date(A.t).toISOString() };
      const jd = jday(new Date(A.t));
      const pv = sgp4(this.recs[i], (jd - this.recs[i].jdsatepoch) * 1440);
      if (pv && pv.position) {
        const geo = eciToGeodetic(pv.position, gstime(jd));
        out.iss.lat = Number((geo.latitude / DEG).toFixed(3));
        out.iss.lon = Number((((geo.longitude / DEG + 540) % 360) - 180).toFixed(3));
        out.iss.altKm = Number(geo.height.toFixed(1));
      }
    }
    out.stars = Number(stars.toFixed(3));
    return out;
  }

  list(max = 20) {
    const A = this.snaps[0];
    if (!A || !A.done) return [];
    const r = [];
    for (let i = 0; i < this.n; i++) if (A.el[i] > 0) r.push({ name: this.names[i], kind: this.kind[i], el: Number(A.el[i].toFixed(1)), lit: A.vis[i] > 0 });
    return r.sort((a, b) => b.el - a.el).slice(0, max);
  }
}

export function initSatellites(app) {
  try {
    const q = new URLSearchParams(location.search).get('sats');
    if (q === 'off' || q === '0') return null;
    const sky = app.atmosphere && app.atmosphere.sky;
    if (!sky) return null;
    return new Satellites(app, sky, { full: q === 'starlink' || q === 'all' });
  } catch (e) {
    console.warn('[satellites] init failed', e);
    return null;
  }
}
