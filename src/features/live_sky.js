import * as THREE from '../../vendor/three.module.js';
import { getBeijingTerrainElevation, getBeijingDemState } from '../environment.js';
import { isNight } from './daylight.js';

/**
 * [live-sky] Real aircraft overhead, from live ADS-B (OpenSky Network, adsb.fi / adsb.lol fallback).
 *
 * The feeds don't send CORS headers for third-party origins, so the page talks to the same-origin
 * proxy in server.py (GET /api/sky). The page only polls when the server advertises the proxy with
 * an `X-Live-Sky` header; otherwise (static hosting / file://) it stays silent and the simulated
 * runway + sky airliners in places.js keep flying as before.
 *
 * Rendering: instanced pools (airliner body/tail, light aircraft, helicopter body/rotor, strobes),
 * ~6 draw calls for up to MAX aircraft. Positions are dead-reckoned between ~12 s polls and blended
 * onto each new fix. Live traffic replaces the simulated sky jets while any live plane is nearby,
 * and hides a simulated runway loop when real traffic is using that runway.
 */

const POLL_S = 12;
const MAX = 64;
const DRAW_M = 30000;
const LABEL_M = 1500;
const LABEL_MAX = 6;
const STALE_S = 45;
const DEG = Math.PI / 180;

const LIVERY = {
  UAL: 0x0b2a6f, AAL: 0x9aa4ad, DAL: 0xc8102e, SWA: 0x304cb2, ASA: 0x01426a, JBU: 0x1b3f8f, FFT: 0x2f7a3c,
  NKS: 0xf5d000, SKW: 0x1c3b70, ACA: 0xd52b1e, BAW: 0x1b2f63, AFR: 0x002157, DLH: 0x0a1d3d, KLM: 0x00a1de,
  UAE: 0xc8102e, QFA: 0xe0001b, JAL: 0xcc0000, ANA: 0x13448f, CPA: 0x006564, SIA: 0xf0ab00, CCA: 0xc8102e,
  CES: 0x1a3d8f, CSN: 0x1b6bb5, KAL: 0x7ab8e1, EVA: 0x00704a, HAL: 0x5b2a86, FDX: 0x4d148c, UPS: 0x5b3a1a,
  QXE: 0x01426a, RPA: 0x0b2a6f, ENY: 0x9aa4ad, EJA: 0x8c8f94,
};
const PALETTE = [0x003a70, 0xc8102e, 0x0b6e4f, 0x00a3e0, 0xf2a900, 0x5c2d91, 0x8c8f94];

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler(0, 0, 0, 'YXZ');
const P = new THREE.Vector3();
const SC = new THREE.Vector3();
const COL = new THREE.Color();
const QR = new THREE.Quaternion();
const UP = new THREE.Vector3();

function partMat(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tx, ty, tz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}

function merge(parts) {
  const pos = [], nrm = [], col = [];
  for (const [geom, rgb, m] of parts) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nrm.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
    g.dispose();
    geom.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function buildGeoms() {
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const white = [0.95, 0.95, 0.96], grey = [0.7, 0.72, 0.75], dark = [0.14, 0.15, 0.17], red = [0.75, 0.12, 0.1];
  // Light aircraft (Cessna-like high wing, nose +Z), ~8 m long, 11 m span
  const light = merge([
    [box(1.15, 1.25, 6.8), white, partMat(0, 1.45, 0.2)],
    [box(1.17, 0.18, 6.0), red, partMat(0, 1.25, 0.2)],
    [box(11, 0.14, 1.5), white, partMat(0, 2.15, 0.6)],
    [box(0.12, 1.4, 1.1), white, partMat(0, 2.35, -3.0)],
    [box(3.4, 0.1, 0.9), white, partMat(0, 1.6, -3.1)],
    [box(1.9, 0.08, 0.06), dark, partMat(0, 1.45, 3.65)],
    [box(0.9, 0.5, 0.8), [0.25, 0.35, 0.45], partMat(0, 2.0, 1.1)],
    [box(2.2, 0.08, 0.1), dark, partMat(0, 0.45, 0.6)],
    [box(0.12, 0.9, 0.12), dark, partMat(0.95, 0.5, 0.6)],
    [box(0.12, 0.9, 0.12), dark, partMat(-0.95, 0.5, 0.6)],
    [box(0.12, 0.9, 0.12), dark, partMat(0, 0.5, 2.6)],
  ]);
  // Helicopter (nose +Z), ~12 m with tail boom; rotor is a separate spinning pool
  const heli = merge([
    [new THREE.SphereGeometry(1, 12, 8), white, partMat(0, 1.75, 0.6, 0, 0, 0, 1.25, 1.15, 2.1)],
    [new THREE.SphereGeometry(1, 10, 6), [0.25, 0.35, 0.45], partMat(0, 1.95, 1.9, 0, 0, 0, 0.95, 0.75, 0.9)],
    [cyl(0.32, 0.18, 5.6, 8), white, partMat(0, 2.05, -3.6, Math.PI / 2, 0, 0)],
    [box(0.1, 1.4, 0.8), red, partMat(0, 2.5, -6.3)],
    [box(1.8, 0.08, 0.5), white, partMat(0, 2.05, -5.8)],
    [box(0.5, 0.5, 0.9), grey, partMat(0, 2.95, 0.2)],
    [box(0.1, 0.1, 3.6), dark, partMat(0.95, 0.05, 0.6)],
    [box(0.1, 0.1, 3.6), dark, partMat(-0.95, 0.05, 0.6)],
    [box(0.08, 0.8, 0.08), dark, partMat(0.85, 0.45, 1.5, 0, 0, 0.2)],
    [box(0.08, 0.8, 0.08), dark, partMat(-0.85, 0.45, 1.5, 0, 0, -0.2)],
    [box(0.08, 0.8, 0.08), dark, partMat(0.85, 0.45, -0.3, 0, 0, 0.2)],
    [box(0.08, 0.8, 0.08), dark, partMat(-0.85, 0.45, -0.3, 0, 0, -0.2)],
  ]);
  const rotor = merge([
    [box(10.4, 0.05, 0.32), dark, null],
    [box(0.32, 0.05, 10.4), dark, null],
  ]);
  const strobe = new THREE.SphereGeometry(0.55, 6, 5);
  return { light, heli, rotor, strobe };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pick a model and scale from category, callsign, speed and altitude. */
function classify(cs, cat, gs, altM, onGround) {
  const airline = /^[A-Z]{3}\d/.test(cs);
  if (cat === 'heli') return { kind: 2, scale: 1 };
  if (cat === 'light') return { kind: 1, scale: 1 };
  if (cat === 'heavy') return { kind: 0, scale: 1.55 };
  if (cat === 'jet') return { kind: 0, scale: 1.05 };
  if (cat === 'small') return { kind: 0, scale: airline ? 0.8 : 0.6 };
  if (airline) return { kind: 0, scale: /^(UAE|QFA|CPA|SIA|BAW|AFR|DLH|KLM|JAL|ANA|KAL|EVA|CCA|CES|CSN|FDX|UPS)/.test(cs) ? 1.5 : 1.0 };
  const slow = onGround ? true : gs < 85 && (altM == null || altM < 3500);
  return slow ? { kind: 1, scale: 1 } : { kind: 0, scale: 0.55 };
}

function liveryFor(cs) {
  const code = cs.slice(0, 3);
  if (LIVERY[code] !== undefined) return LIVERY[code];
  return PALETTE[hashStr(cs || 'x') % PALETTE.length];
}

const shortAngle = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

export class LiveSky {
  constructor(app) {
    this.app = app;
    this.enabled = false;
    this.source = 'none';
    this.aircraft = new Map();
    this.pollTimer = 2;
    this.inFlight = false;
    this.lastPoll = 0;
    this.time = 0;
    this.liveNear = 0;
    this.simHidden = false;
    this._gen = app.teleportGeneration || 0;

    const places = app.places;
    this.root = new THREE.Group();
    this.root.name = 'live_sky';
    app.scene.add(this.root);
    const g = buildGeoms();
    const std = (places && places.mats && places.mats.std) ||
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 });
    const planeGeo = places && places.geoms && places.geoms.plane;
    const tailGeo = places && places.geoms && places.geoms.planeTail;
    this.pools = {
      body: this._pool(planeGeo || g.light, std, true),
      tail: this._pool(tailGeo || g.light, std, true, true),
      light: this._pool(g.light, std, true),
      heli: this._pool(g.heli, std, true),
      rotor: this._pool(g.rotor, std, false),
      strobe: this._pool(g.strobe, new THREE.MeshBasicMaterial({ color: 0xffffff }), false, true),
    };

    this.labels = [];
    this.labelTex = new Map();
    for (let i = 0; i < LABEL_MAX; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      sp.visible = false;
      sp.renderOrder = 11;
      sp.userData.key = '';
      this.root.add(sp);
      this.labels.push(sp);
    }

    this._detectProxy();
    window.__LIVE_SKY__ = { stats: () => this.stats(), list: () => this.list(), poll: () => this._poll() };
  }

  _pool(geom, material, cast, colored = false) {
    const m = new THREE.InstancedMesh(geom, material, MAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = cast;
    m.receiveShadow = false;
    this.root.add(m);
    return m;
  }

  async _detectProxy() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch(location.pathname || '/', { method: 'HEAD', cache: 'no-store' });
      this.enabled = r.headers.get('X-Live-Sky') === '1';
      if (this.enabled) this.pollTimer = 0;
    } catch {
      this.enabled = false;
    }
  }

  _origin() {
    return this.app.worldOrigin;
  }

  _toWorld(lat, lon) {
    const o = this._origin();
    return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
  }

  _toLatLon(x, z) {
    const o = this._origin();
    return [o.centerLat - z / o.mPerDegLat, o.centerLon + x / o.mPerDegLon];
  }

  async _poll() {
    if (!this.enabled || this.inFlight || document.hidden || this.app.isTeleporting) return;
    const o = this._origin();
    if (!o || !o.mPerDegLat) return;
    const [lat, lon] = this._toLatLon(this.app.pos.x, this.app.pos.z);
    this.inFlight = true;
    const gen = this._gen;
    try {
      const r = await fetch(`api/sky?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`, { cache: 'no-store' });
      const data = r.ok ? await r.json() : null;
      if (data && gen === this._gen) this._ingest(data);
    } catch {
      // network hiccup: keep dead-reckoning, try again next poll
    } finally {
      this.inFlight = false;
      this.lastPoll = this.time;
    }
  }

  _ingest(data) {
    this.source = data.source || 'none';
    const now = this.time;
    const baseAsl = (getBeijingDemState() && getBeijingDemState().baseAslM) || 0;
    const seen = new Set();
    for (const s of data.ac || []) {
      const [id, csRaw, lat, lon, altM, onGround, gs, track, vrate, cat, age] = s;
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const cs = (csRaw || '').trim().toUpperCase();
      const [x, z] = this._toWorld(lat, lon);
      const a0 = Math.min(30, Math.max(0, age || 0));
      const trk = (track || 0) * DEG;
      const sp = gs || 0;
      const vx = Math.sin(trk) * sp;
      const vz = -Math.cos(trk) * sp;
      const fixT = now - a0;
      const ground = !!onGround || altM == null;
      const y = ground ? 0 : altM - baseAsl;
      let ac = this.aircraft.get(id);
      if (!ac) {
        const c = classify(cs, cat, sp, altM, ground);
        ac = {
          id, cs, kind: c.kind, scale: c.scale, livery: liveryFor(cs),
          rx: x + vx * a0, ry: y, rz: z + vz * a0, ox: 0, oy: 0, oz: 0,
          yaw: Math.PI - trk, roll: 0, pitch: 0, phase: hashStr(id) % 100 / 100,
        };
        this.aircraft.set(id, ac);
      } else {
        // keep what is on screen; fold the jump into a decaying offset
        const px = x + vx * (now - fixT), pz = z + vz * (now - fixT);
        ac.ox = ac.rx - px;
        ac.oz = ac.rz - pz;
        ac.oy = ground === ac.ground ? ac.ry - (y + (vrate || 0) * (now - fixT)) : 0;
        if (Math.hypot(ac.ox, ac.oz) > 3000) ac.ox = ac.oz = ac.oy = 0;
        if (cs) ac.cs = cs;
      }
      ac.fx = x; ac.fy = y; ac.fz = z; ac.fixT = fixT;
      ac.vx = vx; ac.vz = vz; ac.vy = ground ? 0 : (vrate || 0); ac.gs = sp;
      ac.ground = ground;
      ac.tYaw = Math.PI - trk;
      ac.seen = now;
      seen.add(id);
    }
    for (const [id, ac] of this.aircraft) if (!seen.has(id) && now - ac.seen > STALE_S) this.aircraft.delete(id);
  }

  _reset() {
    this.aircraft.clear();
    this.pollTimer = 1.5;
    this.source = 'none';
  }

  update(dt) {
    this.time += dt;
    const app = this.app;
    if ((app.teleportGeneration || 0) !== this._gen) {
      this._gen = app.teleportGeneration || 0;
      this._reset();
    }
    this.pollTimer -= dt;
    if (this.pollTimer <= 0) {
      this.pollTimer = POLL_S;
      this._poll();
    }

    const cam = app.camera.position;
    const px = app.pos.x, pz = app.pos.z;
    const now = this.time;
    const decay = Math.exp(-dt / 2.0);
    const list = [];
    let near = 0;
    for (const ac of this.aircraft.values()) {
      const t = Math.min(25, now - ac.fixT);
      ac.ox *= decay; ac.oy *= decay; ac.oz *= decay;
      const x = ac.fx + ac.vx * t + ac.ox;
      const z = ac.fz + ac.vz * t + ac.oz;
      const terr = getBeijingTerrainElevation(x, z);
      let y;
      if (ac.ground) y = terr + 0.36;
      else y = Math.max(terr + 3, ac.fy + ac.vy * t + ac.oy);
      // heading / bank / pitch
      const dy = shortAngle(ac.tYaw - ac.yaw);
      const turn = Math.max(-0.35, Math.min(0.35, dy * 1.2)) * (ac.ground ? 2.5 : 1);
      ac.yaw += turn * dt;
      const tRoll = ac.ground ? 0 : Math.max(-0.45, Math.min(0.45, Math.atan((turn * ac.gs) / 9.81)));
      ac.roll += (tRoll - ac.roll) * Math.min(1, dt * 1.5);
      const tPitch = ac.ground ? 0 : Math.max(-0.25, Math.min(0.3, Math.atan2(ac.vy, Math.max(30, ac.gs))));
      ac.pitch += (tPitch - ac.pitch) * Math.min(1, dt * 1.5);
      ac.rx = x; ac.ry = y; ac.rz = z;
      const dCam = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      ac.dCam = dCam;
      const dPl = Math.hypot(x - px, z - pz);
      ac.agl = y - terr;
      if (!ac.ground && dPl < 20000) near++;
      if (Math.hypot(x - cam.x, z - cam.z) < DRAW_M) list.push(ac);
    }
    this.liveNear = near;
    list.sort((a, b) => a.dCam - b.dCam);
    if (list.length > MAX) list.length = MAX;
    this._draw(list);
    this._labels(list);
    this._simVisibility();
  }

  _draw(list) {
    const pl = this.pools;
    let nb = 0, nl = 0, nh = 0, ns = 0;
    const night = isNight();
    const blink = (this.time % 1.2) < 0.12;
    for (const ac of list) {
      // far planes get a mild apparent-size boost so traffic reads at altitude
      const s = ac.scale * Math.min(2.5, Math.max(1, ac.dCam / 5000));
      E.set(-ac.pitch, ac.yaw, ac.roll, 'YXZ');
      Q.setFromEuler(E);
      P.set(ac.rx, ac.ry, ac.rz);
      SC.setScalar(s);
      M4.compose(P, Q, SC);
      if (ac.kind === 0) {
        pl.body.setMatrixAt(nb, M4);
        pl.tail.setMatrixAt(nb, M4);
        pl.tail.setColorAt(nb, COL.setHex(ac.livery));
        nb++;
      } else if (ac.kind === 1) {
        pl.light.setMatrixAt(nl++, M4);
      } else {
        pl.heli.setMatrixAt(nh, M4);
        E.set(0, this.time * 28 + ac.phase * 6, 0, 'YXZ');
        QR.setFromEuler(E);
        UP.set(0, 3.25, 0.2).multiplyScalar(s).applyQuaternion(Q);
        P.add(UP);
        Q.multiply(QR);
        M4.compose(P, Q, SC);
        pl.rotor.setMatrixAt(nh, M4);
        nh++;
      }
      if ((night || ac.dCam > 1500) && ns < MAX) {
        // anti-collision strobe / beacon: keeps distant traffic visible as a blinking dot
        const on = blink || (night && ((this.time + ac.phase) % 1.0) < 0.5);
        const ss = Math.max(1, ac.dCam / 900) * (on ? 1 : 0.0001);
        SC.setScalar(ss);
        P.set(ac.rx, ac.ry + 1.0 * s, ac.rz);
        M4.compose(P, Q.identity(), SC);
        pl.strobe.setMatrixAt(ns, M4);
        pl.strobe.setColorAt(ns, COL.setHex(night && !blink ? 0xff3322 : 0xffffff));
        ns++;
      }
    }
    pl.body.count = nb; pl.tail.count = nb; pl.light.count = nl; pl.heli.count = nh; pl.rotor.count = nh; pl.strobe.count = ns;
    for (const m of Object.values(pl)) {
      if (m.count) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  _labelTexture(text) {
    let e = this.labelTex.get(text);
    if (e) return e;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 20;
    c.width = w;
    c.height = 40;
    ctx.font = font;
    ctx.fillStyle = 'rgba(12,16,22,0.55)';
    const r = 12;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 2, w, 36, r) : ctx.rect(0, 2, w, 36);
    ctx.fill();
    ctx.fillStyle = '#f3f6fa';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, 21);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    e = { tex, aspect: w / 40 };
    this.labelTex.set(text, e);
    if (this.labelTex.size > 48) {
      const k = this.labelTex.keys().next().value;
      this.labelTex.get(k).tex.dispose();
      this.labelTex.delete(k);
    }
    return e;
  }

  _labels(list) {
    let n = 0;
    for (const ac of list) {
      if (n >= LABEL_MAX || ac.dCam > LABEL_M) break;
      if (!ac.cs) continue;
      const sp = this.labels[n++];
      const e = this._labelTexture(ac.cs);
      if (sp.userData.key !== ac.cs) {
        sp.material.map = e.tex;
        sp.material.needsUpdate = true;
        sp.userData.key = ac.cs;
      }
      const h = Math.max(2.2, ac.dCam * 0.024);
      sp.scale.set(h * e.aspect, h, 1);
      sp.position.set(ac.rx, ac.ry + 9 * ac.scale + h * 0.8, ac.rz);
      sp.visible = true;
    }
    for (let i = n; i < LABEL_MAX; i++) this.labels[i].visible = false;
  }

  /** Live traffic replaces the simulated sky jets; a runway loop pauses when real traffic uses it. */
  _simVisibility() {
    const places = this.app.places;
    if (!places) return;
    const live = this.enabled && this.aircraft.size > 0;
    places.liveSkyNear = live && this.liveNear > 0;
    for (const rp of places._runwayPlanes || []) {
      let busy = false;
      if (live) {
        const mx = rp.mx ?? (rp.rw ? (rp.rw.x0 + rp.rw.x1) * 0.5 : 0);
        const mz = rp.mz ?? (rp.rw ? (rp.rw.z0 + rp.rw.z1) * 0.5 : 0);
        for (const ac of this.aircraft.values()) {
          if ((ac.ground || ac.agl < 600) && Math.hypot(ac.rx - mx, ac.rz - mz) < 6000) { busy = true; break; }
        }
      }
      rp.liveBusy = busy;
    }
  }

  /** 2D map overlay: tiny plane glyphs (+ callsign on the full map). */
  drawMap(ctx, toSx, toSy, lonToMx, latToMy, full = false) {
    if (!this.aircraft.size || !this._origin()) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.font = '600 10px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    const sz = full ? 7 : 5.5;
    for (const ac of this.aircraft.values()) {
      const [lat, lon] = this._toLatLon(ac.rx, ac.rz);
      const sx = toSx(lonToMx(lon));
      const sy = toSy(latToMy(lat));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI - ac.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.18, -sz * 0.25);
      ctx.lineTo(sz, sz * 0.15);
      ctx.lineTo(sz * 0.18, sz * 0.12);
      ctx.lineTo(sz * 0.12, sz * 0.7);
      ctx.lineTo(sz * 0.4, sz);
      ctx.lineTo(-sz * 0.4, sz);
      ctx.lineTo(-sz * 0.12, sz * 0.7);
      ctx.lineTo(-sz * 0.18, sz * 0.12);
      ctx.lineTo(-sz, sz * 0.15);
      ctx.lineTo(-sz * 0.18, -sz * 0.25);
      ctx.closePath();
      ctx.fillStyle = ac.ground ? '#9aa3ad' : '#ffffff';
      ctx.strokeStyle = 'rgba(20,26,34,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      if (full && ac.cs) {
        ctx.fillStyle = 'rgba(20,26,34,0.75)';
        ctx.fillText(ac.cs, sx + sz + 3, sy + 0.5);
      }
    }
    ctx.restore();
  }

  stats() {
    const kinds = [0, 0, 0];
    let ground = 0;
    for (const ac of this.aircraft.values()) { kinds[ac.kind]++; if (ac.ground) ground++; }
    return {
      enabled: this.enabled,
      source: this.source,
      tracked: this.aircraft.size,
      airliners: kinds[0], light: kinds[1], helis: kinds[2], onGround: ground,
      drawn: this.pools.body.count + this.pools.light.count + this.pools.heli.count,
      liveNear: this.liveNear,
      labels: this.labels.filter((l) => l.visible).map((l) => l.userData.key),
      simSkyVisible: (this.app.places?._skyPlanes || []).filter((s) => s.mesh && s.mesh.visible).length,
      simRunwayVisible: (this.app.places?._runwayPlanes || []).filter((s) => s.mesh && s.mesh.visible).length,
      secondsSincePoll: Number((this.time - this.lastPoll).toFixed(1)),
    };
  }

  list() {
    return [...this.aircraft.values()]
      .sort((a, b) => (a.dCam || 0) - (b.dCam || 0))
      .map((a) => ({ cs: a.cs, kind: a.kind, ground: a.ground, x: Math.round(a.rx), y: Math.round(a.ry), z: Math.round(a.rz), agl: Math.round(a.agl || 0), gs: Math.round(a.gs), dCam: Math.round(a.dCam || 0) }));
  }
}

export function initLiveSky(app) {
  try {
    return new LiveSky(app);
  } catch (e) {
    console.warn('[live-sky] init failed', e);
    return null;
  }
}
