// [feature/rail-transit] Main-thread rail network + animated vehicles + live BART positions.
//
// • Stitches the per-chunk rail payloads (rail_build.js) into one graph: OSM vertices become nodes, tile-cut
//   ends are welded, so vehicles run continuously along the real line geometry across chunks.
// • Vehicles: SF cable cars, Muni LRVs / historic streetcars, BART, Caltrain-style commuters, generic
//   trams / metros / gondolas elsewhere. They follow every vertex, ride the terrain / road surface, hide in
//   tunnels, stop at stations (OSM railway POIs), yield to cars (trams), and knock the player on impact.
// • Live: BART's official public API key (keyless-equivalent, CORS-enabled) → real-time departure estimates
//   are converted into train positions on the local track. Muni (511.org) needs a private key, so Muni
//   vehicles and everything outside the Bay Area run on a schedule-like simulation.
//
// Hooked from main.js: `this.railTransit = new RailTransit(this)` + `this.railTransit.update(dt)`.

import * as THREE from '../../vendor/three.module.js';
import { RAIL_FAMILY, RAIL_TOP, TUNNEL_E, railGroundY } from './rail_build.js';
import { getRailModels } from './rail_models.js';
import { sampleRoadSurfaceIndexed } from './road_grid.js';

const BART_KEY = 'MW9S-E7SL-26DU-VV8V'; // BART's published public API key (api.bart.gov/docs/overview/index.aspx)
const BART_API = 'https://api.bart.gov/api';
const PROFILE_STEP = 5;
const SIM_RADIUS = 1150;     // spawn within
const DESPAWN_RADIUS = 1600;
const DRAW_RADIUS = 1250;

const TYPE = {
  cable_car: { model: 'cable_car', cars: [1, 1], gap: 0, vmax: 4.2, acc: 0.7, dec: 1.1, dwell: 9, label: 'Cable car' },
  lrv: { model: 'lrv', cars: [2, 4], gap: 0.35, vmax: 13, acc: 1.1, dec: 1.4, dwell: 14, label: 'Muni Metro' },
  pcc: { model: 'pcc', cars: [1, 1], gap: 0, vmax: 11, acc: 1.0, dec: 1.4, dwell: 12, label: 'Historic streetcar' },
  tram: { model: 'tram', cars: [3, 3], gap: 0.25, vmax: 14, acc: 1.1, dec: 1.4, dwell: 14, label: 'Tram' },
  bart: { model: 'bart', cars: [5, 7], gap: 0.4, vmax: 28, acc: 1.2, dec: 1.3, dwell: 20, label: 'BART' },
  metro: { model: 'metro', cars: [5, 6], gap: 0.4, vmax: 22, acc: 1.2, dec: 1.3, dwell: 18, label: 'Metro' },
  commuter: { model: 'commuter', cars: [4, 6], gap: 0.5, vmax: 30, acc: 0.8, dec: 1.0, dwell: 28, label: 'Train' },
  funicular: { model: 'funicular', cars: [1, 1], gap: 0, vmax: 4, acc: 0.6, dec: 0.8, dwell: 12, label: 'Funicular' },
  gondola: { model: 'gondola', cars: [1, 1], gap: 0, vmax: 5, acc: 1, dec: 1, dwell: 0, label: 'Gondola' },
};
const FAMILY_CAP = { cable: 7, light: 7, heavy: 6, funicular: 2, aerial: 8 };
const FAMILY_SPACING = { cable: 420, light: 650, heavy: 1300, funicular: 400, aerial: 140 };
const MAX_INSTANCES = 64;
const PCC_LIVERIES = [[0.25, 0.48, 0.30], [0.90, 0.55, 0.12], [0.85, 0.75, 0.25], [0.20, 0.35, 0.60], [0.70, 0.16, 0.14], [0.55, 0.62, 0.42]];

const inBayArea = (o) => o && o.centerLat > 37.15 && o.centerLat < 38.15 && o.centerLon > -122.65 && o.centerLon < -121.7;
const inSF = (o) => o && o.centerLat > 37.6 && o.centerLat < 37.9 && o.centerLon > -122.6 && o.centerLon < -122.3;

function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hexRgb(hex) { const n = parseInt(String(hex || '').replace('#', ''), 16); return Number.isFinite(n) ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] : null; }

export class RailTransit {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.models = getRailModels();
    this.meshes = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
    for (const [k, m] of Object.entries(this.models)) {
      const body = new THREE.InstancedMesh(m.body, mat, MAX_INSTANCES);
      const accent = new THREE.InstancedMesh(m.accent, mat, MAX_INSTANCES);
      for (const im of [body, accent]) {
        im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.name = `rail_${k}`;
        this.scene.add(im);
      }
      accent.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[k] = { body, accent, n: 0 };
    }
    this.nodes = new Map();
    this.edges = [];
    this.edgeByKey = new Map();
    this.trains = [];
    this.seq = 0;
    this._sig = '';
    this._rebuildT = 0;
    this._spawnT = 0;
    this._origin = null;
    this.live = { stations: null, etd: null, ok: null, t: 0, busy: false, lastFetch: 0 };
    this.knock = null;
    this.stats = { edges: 0, nodes: 0, trains: 0, cars: 0, live: 0, stops: 0 };
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
    this._chip = null;
    if (typeof window !== 'undefined') window.__railTransit = this;
  }

  // ------------------------------------------------------------------ graph
  _chunksSignature() {
    let s = 0, n = 0;
    for (const [k, g] of this.app.loadedChunks) { if (g.userData && g.userData.rail) { s = (s + hash32(k)) >>> 0; n++; } }
    return `${n}:${s}`;
  }

  _rebuildGraph() {
    const app = this.app;
    const segs = new Map(); // dedupe identical segments shipped by neighbouring chunks
    const stopsRaw = new Map();
    const q = (v) => Math.round(v * 2);
    for (const g of app.loadedChunks.values()) {
      const rail = g.userData && g.userData.rail;
      if (!rail) continue;
      for (const l of rail.lines) {
        const p = l.p, n = p.length / 3;
        for (let i = 0; i < n - 1; i++) {
          const ax = p[i * 3], az = p[i * 3 + 1], bx = p[i * 3 + 3], bz = p[i * 3 + 4];
          const ka = `${q(ax)},${q(az)}`, kb = `${q(bx)},${q(bz)}`;
          if (ka === kb) continue;
          const key = ka < kb ? `${ka}|${kb}|${l.k}` : `${kb}|${ka}|${l.k}`;
          if (segs.has(key)) continue;
          segs.set(key, { key, ka, kb, ax, az, bx, bz, ea: p[i * 3 + 2], eb: p[i * 3 + 5], k: l.k, st: l.st, tn: l.tn, br: l.br, svc: l.svc });
        }
      }
      for (const s of rail.stops || []) {
        const k = `${Math.round(s[0] / 6)},${Math.round(s[1] / 6)},${s[2]}`;
        if (!stopsRaw.has(k)) stopsRaw.set(k, s);
      }
    }
    // nodes + weld dangling ends (tile cuts) within 1.6 m
    const pts = new Map();
    const deg = new Map();
    for (const s of segs.values()) {
      if (!pts.has(s.ka)) pts.set(s.ka, [s.ax, s.az]);
      if (!pts.has(s.kb)) pts.set(s.kb, [s.bx, s.bz]);
      deg.set(s.ka, (deg.get(s.ka) || 0) + 1);
      deg.set(s.kb, (deg.get(s.kb) || 0) + 1);
    }
    const parent = new Map();
    const find = (a) => { let r = a; while (parent.has(r)) r = parent.get(r); return r; };
    const cell = new Map();
    const ck = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
    for (const [k, [x, z]] of pts) { const c = ck(x, z); const l = cell.get(c); if (l) l.push(k); else cell.set(c, [k]); }
    for (const [k, d] of deg) {
      if (d !== 1) continue;
      const [x, z] = pts.get(k);
      let best = null, bd = 1.6;
      const cx = Math.floor(x / 2), cz = Math.floor(z / 2);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const o of cell.get(`${cx + i},${cz + j}`) || []) {
          if (o === k || find(o) === find(k)) continue;
          const [ox, oz] = pts.get(o);
          const dd = Math.hypot(ox - x, oz - z);
          if (dd < bd) { bd = dd; best = o; }
        }
      }
      if (best) parent.set(find(k), find(best));
    }
    const nodes = new Map();
    const node = (k) => {
      const r = find(k);
      let nd = nodes.get(r);
      if (!nd) { const [x, z] = pts.get(r); nd = { key: r, x, z, edges: [] }; nodes.set(r, nd); }
      return nd;
    };
    const edges = [];
    const edgeByKey = new Map();
    for (const s of segs.values()) {
      const a = node(s.ka), b = node(s.kb);
      if (a === b) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.05) continue;
      const old = this.edgeByKey.get(s.key);
      const e = {
        key: s.key, a, b, len, k: s.k, fam: RAIL_FAMILY[s.k] || 'heavy', st: s.st, tn: s.tn, br: s.br, svc: s.svc,
        ea: s.ea, eb: s.eb, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, stops: [],
        prof: old && !old.profDirty && old.len === len ? old.prof : null, profDirty: false,
      };
      a.edges.push(e); b.edges.push(e);
      edges.push(e);
      edgeByKey.set(s.key, e);
    }
    this.nodes = nodes; this.edges = edges; this.edgeByKey = edgeByKey;

    // stops → projected onto nearby edges of a compatible family
    let nStops = 0;
    const grid = new Map();
    for (const e of edges) {
      if (e.svc) continue;
      const x0 = Math.floor(Math.min(e.a.x, e.b.x) / 50), x1 = Math.floor(Math.max(e.a.x, e.b.x) / 50);
      const z0 = Math.floor(Math.min(e.a.z, e.b.z) / 50), z1 = Math.floor(Math.max(e.a.z, e.b.z) / 50);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; const l = grid.get(k); if (l) l.push(e); else grid.set(k, [e]); }
    }
    for (const s of stopsRaw.values()) {
      const [sx, sz, type, name] = s;
      const fams = type === 0 ? ['light', 'cable', 'funicular'] : type === 1 ? ['heavy', 'light', 'funicular'] : ['aerial'];
      const R = type === 1 ? 70 : 30;
      const seen = new Set();
      const gx = Math.floor(sx / 50), gz = Math.floor(sz / 50);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        for (const e of grid.get(`${gx + i},${gz + j}`) || []) {
          if (seen.has(e) || !fams.includes(e.fam)) continue;
          seen.add(e);
          let t = (sx - e.a.x) * e.ux + (sz - e.a.z) * e.uz;
          t = Math.max(0, Math.min(e.len, t));
          const d = Math.hypot(e.a.x + e.ux * t - sx, e.a.z + e.uz * t - sz);
          if (d < R) { e.stops.push({ t, name, type }); nStops++; }
        }
      }
    }
    this.stats.edges = edges.length; this.stats.nodes = nodes.size; this.stats.stops = nStops;

    // re-bind running trains to the fresh edges (drop trains whose track disappeared)
    this.trains = this.trains.filter((tr) => {
      for (const arr of [tr.seq, tr.ahead]) {
        for (const st of arr) { const ne = edgeByKey.get(st.e.key); if (!ne) return false; st.e = ne; }
      }
      return true;
    });
  }

  _edgeProfile(e) {
    if (e.prof) return e.prof;
    const n = Math.max(2, Math.ceil(e.len / PROFILE_STEP) + 1);
    const prof = new Float32Array(n);
    let dirty = false;
    const sag = e.fam === 'aerial' ? Math.min(8, e.len * 0.015) : 0;
    const ya = e.fam === 'aerial' ? railGroundY(e.a.x, e.a.z) + e.ea : 0;
    const yb = e.fam === 'aerial' ? railGroundY(e.b.x, e.b.z) + e.eb : 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = e.a.x + (e.b.x - e.a.x) * u, z = e.a.z + (e.b.z - e.a.z) * u;
      if (e.fam === 'aerial') { prof[i] = ya + (yb - ya) * u - 4 * sag * u * (1 - u); continue; }
      const g = railGroundY(x, z);
      if (e.tn) { prof[i] = g + TUNNEL_E; continue; }
      if (e.st) {
        const r = sampleRoadSurfaceIndexed(this.app, x, g + 0.6, z);
        if (r && Number.isFinite(r.y)) prof[i] = r.y - 0.01;
        else { prof[i] = g + 0.2; dirty = true; }
      } else {
        prof[i] = g + e.ea + (e.eb - e.ea) * u + RAIL_TOP;
      }
    }
    e.prof = prof;
    e.profDirty = dirty;
    return prof;
  }

  _yOn(e, t) {
    const prof = this._edgeProfile(e);
    const f = Math.max(0, Math.min(1, t / e.len)) * (prof.length - 1);
    const i = Math.min(prof.length - 2, Math.floor(f));
    return prof[i] + (prof[i + 1] - prof[i]) * (f - i);
  }

  // ------------------------------------------------------------------ steps
  _startNode(st) { return st.dir > 0 ? st.e.a : st.e.b; }
  _endNode(st) { return st.dir > 0 ? st.e.b : st.e.a; }

  /** Picks the straightest compatible continuation at `node` arriving along (dx, dz). */
  _chooseNext(node, fromEdge, dx, dz, tr) {
    let best = null, bestScore = 0.45;
    for (const e of node.edges) {
      if (e === fromEdge) continue;
      if (e.fam !== tr.fam) continue;
      const dir = e.a === node ? 1 : -1;
      const ox = e.ux * dir, oz = e.uz * dir;
      let score = dx * ox + dz * oz;
      if (score < 0.5) continue;
      if (e.svc) score -= 0.3;
      if (e.k === tr.kind) score += 0.08;
      if (score > bestScore) { bestScore = score; best = { e, dir }; }
    }
    return best;
  }

  _stepDir(st) { return [st.e.ux * st.dir, st.e.uz * st.dir]; }

  _ensureAhead(tr) {
    let total = tr.seq[tr.seq.length - 1].e.len - tr.headOff;
    for (const st of tr.ahead) total += st.e.len;
    tr.endAhead = false;
    while (total < 320) {
      const last = tr.ahead.length ? tr.ahead[tr.ahead.length - 1] : tr.seq[tr.seq.length - 1];
      const [dx, dz] = this._stepDir(last);
      const nx = this._chooseNext(this._endNode(last), last.e, dx, dz, tr);
      if (!nx) { tr.endAhead = true; break; }
      tr.ahead.push(nx);
      total += nx.e.len;
      if (tr.ahead.length > 400) break;
    }
    return total;
  }

  _extendBack(tr) {
    const first = tr.seq[0];
    const [dx, dz] = this._stepDir(first);
    const nx = this._chooseNext(this._startNode(first), first.e, -dx, -dz, tr);
    if (!nx) return false;
    tr.seq.unshift({ e: nx.e, dir: -nx.dir });
    return true;
  }

  /** Position `d` metres behind the head. Returns {i, off} (step index + offset from step start). */
  _locateBack(tr, d) {
    let i = tr.seq.length - 1, off = tr.headOff, rem = d;
    while (rem > off) {
      rem -= off;
      i--;
      if (i < 0) {
        if (tr.seq.length < 600 && this._extendBack(tr)) { i = 0; }
        else return { i: 0, off: 0 };
      }
      off = tr.seq[i].e.len;
    }
    return { i, off: off - rem };
  }

  _pointAt(st, off, out) {
    const e = st.e;
    const t = st.dir > 0 ? off : e.len - off;
    out.x = e.a.x + e.ux * t; out.z = e.a.z + e.uz * t;
    out.y = this._yOn(e, t);
    out.tn = e.tn; out.fam = e.fam;
    return out;
  }

  _pointBack(tr, d, out) {
    const r = this._locateBack(tr, d);
    // _extendBack may have shifted indices; recompute the head index each call
    return this._pointAt(tr.seq[r.i], r.off, out);
  }

  // ------------------------------------------------------------------ trains
  _typeFor(e) {
    const o = this.app.worldOrigin;
    switch (e.fam) {
      case 'cable': return 'cable_car';
      case 'funicular': return 'funicular';
      case 'aerial': return 'gondola';
      case 'light':
        if (inSF(o)) return e.k === 'tram' ? 'pcc' : 'lrv';
        return e.k === 'light_rail' ? 'lrv' : 'tram';
      default:
        if (e.k === 'subway' || e.k === 'monorail') return inBayArea(o) ? 'bart' : 'metro';
        return 'commuter';
    }
  }

  _labelFor(type, x, z) {
    const o = this.app.worldOrigin;
    if (type === 'cable_car' && inSF(o) && o.mPerDegLat) {
      const lat = o.centerLat - z / o.mPerDegLat, lon = o.centerLon + x / o.mPerDegLon;
      if (lat < 37.7935 && lon > -122.4225 && lon < -122.395 && Math.abs(lat - 37.7915) < 0.0025) return 'California St cable car';
      if (lon < -122.417) return 'Powell–Hyde cable car';
      if (lat > 37.7952 && lon < -122.4105) return 'Powell–Mason cable car';
      return 'Powell St cable car';
    }
    if (type === 'pcc') return 'Muni F streetcar';
    if (type === 'commuter' && inBayArea(o)) return 'Caltrain';
    return TYPE[type].label;
  }

  _makeTrain(e, dir, headT, opts = {}) {
    const type = opts.type || this._typeFor(e);
    const T = TYPE[type];
    const h = hash32(`${e.key}:${this.seq}`);
    const cars = opts.cars || T.cars[0] + (h % (T.cars[1] - T.cars[0] + 1));
    const M = this.models[T.model];
    let accent = M.accentRgb || [1, 1, 1];
    if (type === 'pcc') accent = PCC_LIVERIES[h % PCC_LIVERIES.length];
    if (opts.accent) accent = opts.accent;
    const tr = {
      id: ++this.seq, type, model: T.model, fam: e.fam, kind: e.k, cars, carLen: M.len, gap: T.gap,
      len: cars * M.len + (cars - 1) * T.gap, vmax: T.vmax * (0.9 + (h % 20) / 100), acc: T.acc, dec: T.dec,
      v: opts.v !== undefined ? opts.v : T.vmax * 0.6, seq: [{ e, dir }], headOff: dir > 0 ? headT : e.len - headT, ahead: [],
      state: 'run', dwell: 0, odo: 0, stopCool: 0, accent, live: !!opts.live, liveKey: opts.liveKey || null,
      label: opts.label || '', speedBias: 1, endAhead: false, horn: 0,
    };
    if (!tr.label) {
      const x = e.a.x + e.ux * headT, z = e.a.z + e.uz * headT;
      tr.label = this._labelFor(type, x, z);
    }
    this._ensureAhead(tr);
    return tr;
  }

  _nearPlayer(x, z) { return Math.hypot(x - this.app.pos.x, z - this.app.pos.z); }

  _occupied(x, z, r) {
    const P = { x: 0, y: 0, z: 0 };
    for (const tr of this.trains) {
      this._pointAt(tr.seq[tr.seq.length - 1], tr.headOff, P);
      if (Math.hypot(P.x - x, P.z - z) < r + tr.len) return true;
    }
    return false;
  }

  _spawn() {
    const px = this.app.pos.x, pz = this.app.pos.z;
    const famLen = {}, cands = {};
    for (const e of this.edges) {
      if (e.svc) continue;
      const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
      if (Math.hypot(mx - px, mz - pz) > SIM_RADIUS) continue;
      famLen[e.fam] = (famLen[e.fam] || 0) + e.len;
      (cands[e.fam] || (cands[e.fam] = [])).push(e);
    }
    const liveBart = this.live.ok && inBayArea(this.app.worldOrigin);
    for (const fam of Object.keys(cands)) {
      const count = this.trains.filter((t) => t.fam === fam).length;
      const target = Math.min(FAMILY_CAP[fam] || 4, Math.ceil((famLen[fam] || 0) / FAMILY_SPACING[fam]));
      if (count >= target) continue;
      const list = cands[fam];
      let pick = null;
      for (let attempt = 0; attempt < 6 && !pick; attempt++) {
        let r = Math.random() * famLen[fam];
        let e = list[0];
        for (const c of list) { r -= c.len; if (r <= 0) { e = c; break; } }
        if (e.tn && Math.random() < 0.8) continue; // favour visible track
        if (liveBart && fam === 'heavy' && e.k === 'subway') continue; // BART positions come from the live feed
        const t = Math.random() * e.len;
        const x = e.a.x + e.ux * t, z = e.a.z + e.uz * t;
        if (this._occupied(x, z, fam === 'aerial' ? 40 : 120)) continue;
        pick = { e, t };
      }
      if (!pick) continue;
      const tr = this._makeTrain(pick.e, Math.random() < 0.5 ? 1 : -1, pick.t);
      this.trains.push(tr);
    }
  }

  _distToStop(tr) {
    let acc = 0;
    const all = [tr.seq[tr.seq.length - 1], ...tr.ahead];
    for (let k = 0; k < all.length; k++) {
      const st = all[k];
      const from = k === 0 ? tr.headOff : 0;
      let best = Infinity;
      for (const s of st.e.stops) {
        const pos = st.dir > 0 ? s.t : st.e.len - s.t;
        const target = pos + Math.min(tr.len * 0.5, 45);
        if (target > from + 0.3 && target - from < best) best = target - from;
      }
      if (best < Infinity) {
        const d = acc + best;
        if (tr.odo + d > tr.stopCool) return d;
      }
      acc += st.e.len - from;
      if (acc > 400) break;
    }
    return Infinity;
  }

  _distToEnd(tr) {
    if (!tr.endAhead) return Infinity;
    let d = tr.seq[tr.seq.length - 1].e.len - tr.headOff;
    for (const st of tr.ahead) d += st.e.len;
    return d;
  }

  _obstacleAhead(tr, hx, hz, dirx, dirz) {
    let d = Infinity;
    const P = { x: 0, y: 0, z: 0 };
    for (const o of this.trains) {
      if (o === tr || o.fam !== tr.fam) continue;
      for (const back of [0, o.len]) {
        this._pointBack(o, back, P);
        const dx = P.x - hx, dz = P.z - hz;
        const along = dx * dirx + dz * dirz;
        if (along <= 0.5 || along > 140) continue;
        if (Math.abs(dx * dirz - dz * dirx) > 2.2) continue;
        d = Math.min(d, along - 10);
      }
    }
    if (tr.fam === 'light' || tr.fam === 'cable') {
      const traffic = this.app.traffic;
      if (traffic && traffic.cars) {
        for (const c of traffic.cars) {
          if (!c.active) continue;
          const dx = c.x - hx, dz = c.z - hz;
          if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
          const along = dx * dirx + dz * dirz;
          if (along <= 0 || along > 40) continue;
          if (Math.abs(dx * dirz - dz * dirx) > 1.9) continue;
          d = Math.min(d, along - (c.len || 4.5) * 0.5 - 3);
        }
      }
      const app = this.app;
      if (app.mode === 'drive' || app.mode === 'walk') {
        const dx = app.pos.x - hx, dz = app.pos.z - hz;
        const along = dx * dirx + dz * dirz;
        if (along > 0 && along < 35 && Math.abs(dx * dirz - dz * dirx) < 2.2) { d = Math.min(d, along - 4); tr.horn = 1.2; }
      }
    }
    return d;
  }

  _reverse(tr) {
    const r = this._locateBack(tr, tr.len);
    const keep = tr.seq.slice(r.i).reverse().map((st) => ({ e: st.e, dir: -st.dir }));
    tr.seq = keep;
    tr.headOff = tr.seq[tr.seq.length - 1].e.len - r.off;
    tr.ahead = [];
    tr.stopCool = tr.odo + tr.len + 25;
    this._ensureAhead(tr);
  }

  _advance(tr, dt) {
    if (tr.state === 'dwell') {
      tr.dwell -= dt;
      if (tr.dwell <= 0) {
        if (tr.reverseAfter) { tr.reverseAfter = false; this._reverse(tr); }
        tr.state = 'run';
      }
      return;
    }
    const head = tr.seq[tr.seq.length - 1];
    const P = this._pointAt(head, tr.headOff, { x: 0, y: 0, z: 0 });
    const [dirx, dirz] = this._stepDir(head);
    const dStop = this._distToStop(tr);
    const dEnd = this._distToEnd(tr);
    const dObs = this._obstacleAhead(tr, P.x, P.z, dirx, dirz);
    let vT = tr.vmax * tr.speedBias;
    if (head.e.st) vT = Math.min(vT, tr.fam === 'cable' ? vT : 12);
    const brake = (d) => Math.sqrt(2 * tr.dec * Math.max(0, d));
    vT = Math.min(vT, brake(dStop - 0.3), brake(dEnd - 1), brake(dObs));
    if (dObs < 1) vT = 0;
    if (tr.v < vT) tr.v = Math.min(vT, tr.v + tr.acc * dt);
    else tr.v = Math.max(vT, tr.v - tr.dec * 2.2 * dt);
    if (tr.v < 0) tr.v = 0;
    if (tr.fam !== 'aerial' && dStop < 1.2 && tr.v < 0.8) {
      tr.state = 'dwell'; tr.v = 0;
      tr.dwell = TYPE[tr.type].dwell * (0.7 + Math.random() * 0.6);
      tr.stopCool = tr.odo + 60;
      return;
    }
    if (dEnd < 2 && tr.v < 0.8) {
      tr.state = 'dwell'; tr.v = 0; tr.reverseAfter = true;
      tr.dwell = tr.fam === 'aerial' ? 3 : Math.max(6, TYPE[tr.type].dwell);
      return;
    }
    const mv = tr.v * dt;
    tr.headOff += mv;
    tr.odo += mv;
    while (tr.headOff > tr.seq[tr.seq.length - 1].e.len) {
      if (!tr.ahead.length) { tr.headOff = tr.seq[tr.seq.length - 1].e.len; tr.v = 0; break; }
      tr.headOff -= tr.seq[tr.seq.length - 1].e.len;
      tr.seq.push(tr.ahead.shift());
    }
    // trim history behind the last car
    let behind = tr.headOff;
    for (let i = tr.seq.length - 2; i >= 0; i--) {
      if (behind > tr.len + 40) { tr.seq.splice(0, i + 1); break; }
      behind += tr.seq[i].e.len;
    }
    this._ensureAhead(tr);
  }

  // ------------------------------------------------------------------ live BART
  async _liveTick(now) {
    const L = this.live;
    if (!inBayArea(this.app.worldOrigin) || L.busy) return;
    if (L.ok === false && now - L.lastFetch < 120000) return;
    if (now - L.lastFetch < 30000) return;
    L.busy = true; L.lastFetch = now;
    try {
      if (!L.stations) {
        const r = await fetch(`${BART_API}/stn.aspx?cmd=stns&key=${BART_KEY}&json=y`);
        const j = await r.json();
        L.stations = new Map(j.root.stations.station.map((s) => [s.abbr, { abbr: s.abbr, name: s.name, lat: +s.gtfs_latitude, lon: +s.gtfs_longitude }]));
      }
      const r = await fetch(`${BART_API}/etd.aspx?cmd=etd&orig=ALL&key=${BART_KEY}&json=y`);
      const j = await r.json();
      L.etd = j.root.station || [];
      L.ok = true;
      L.t = now;
      this._applyLive();
    } catch (err) {
      L.ok = false; // CORS / network: fall back to simulation
    } finally {
      L.busy = false;
    }
  }

  _worldOf(lat, lon) {
    const o = this.app.worldOrigin;
    return [(lon - o.centerLon) * o.mPerDegLon, (o.centerLat - lat) * o.mPerDegLat];
  }

  _applyLive() {
    const L = this.live;
    if (!L.stations || !L.etd || !this.edges.length) return;
    const px = this.app.pos.x, pz = this.app.pos.z;
    const subway = this.edges.filter((e) => e.k === 'subway' && !e.svc);
    if (!subway.length) return;
    const seen = new Set();
    let nLive = 0;
    for (const st of L.etd) {
      const S = L.stations.get(st.abbr);
      if (!S) continue;
      const [sx, sz] = this._worldOf(S.lat, S.lon);
      if (Math.hypot(sx - px, sz - pz) > 4000) continue;
      for (const etd of st.etd || []) {
        const D = L.stations.get(etd.abbreviation);
        const est = (etd.estimate || [])[0];
        if (!D || !est) continue;
        const m = est.minutes === 'Leaving' ? 0 : Number(est.minutes);
        if (!Number.isFinite(m) || m > 4) continue;
        const [dx, dz] = this._worldOf(D.lat, D.lon);
        let tx = dx - sx, tz = dz - sz;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        // track at the station, right-hand running toward the destination
        let best = null, bestScore = Infinity;
        for (const e of subway) {
          let t = (sx - e.a.x) * e.ux + (sz - e.a.z) * e.uz;
          if (t < 0 || t > e.len) continue;
          const qx = e.a.x + e.ux * t, qz = e.a.z + e.uz * t;
          const d = Math.hypot(qx - sx, qz - sz);
          if (d > 150) continue;
          const dir = e.ux * tx + e.uz * tz >= 0 ? 1 : -1;
          const right = ((qx - sx) * -tz + (qz - sz) * tx) * -1; // >0 when right of travel
          const score = d - (right > 0 ? 6 : 0);
          if (score < bestScore) { bestScore = score; best = { e, t, dir }; }
        }
        if (!best) continue;
        const key = `${S.abbr}>${D.abbr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const back = m * 60 * 12;
        // Build a probe train at the station, then walk it back by the ETA distance
        const probe = this._makeTrain(best.e, best.dir, best.t, { type: 'bart', cars: Math.max(4, Math.min(8, Number(est.length) || 6)), accent: hexRgb(est.hexcolor), live: true, liveKey: key, label: `BART → ${D.name} · live` });
        if (back > 0) {
          const r = this._locateBack(probe, back);
          probe.seq = probe.seq.slice(0, r.i + 1);
          probe.headOff = r.off;
          probe.ahead = [];
          this._ensureAhead(probe);
        } else {
          probe.state = 'dwell'; probe.dwell = 15; probe.v = 0; probe.stopCool = 0;
        }
        const P = this._pointAt(probe.seq[probe.seq.length - 1], probe.headOff, { x: 0, y: 0, z: 0 });
        if (this._nearPlayer(P.x, P.z) > SIM_RADIUS + 200) continue;
        // reconcile with an existing live train heading to the same destination nearby
        const exist = this.trains.find((tr) => tr.live && tr.label === probe.label && (() => {
          const Q = this._pointAt(tr.seq[tr.seq.length - 1], tr.headOff, { x: 0, y: 0, z: 0 });
          return Math.hypot(Q.x - P.x, Q.z - P.z) < 700;
        })());
        if (exist) { nLive++; continue; }
        if (this._occupied(P.x, P.z, 60)) continue;
        if (this.trains.filter((t) => t.fam === 'heavy').length >= FAMILY_CAP.heavy + 2) continue;
        if (back > 0) probe.v = 14;
        this.trains.push(probe);
        nLive++;
      }
    }
    this.stats.live = nLive;
  }

  // ------------------------------------------------------------------ interaction
  /** Called from CityTraffic._buildObstacles so AI cars brake for street-level rail vehicles. */
  addTrafficObstacles(traffic) {
    if (!this._carPoses) return;
    for (const c of this._carPoses) {
      if (c.hidden || c.elev) continue;
      traffic._addObstacle(c.x, c.z, c.hx, c.hz, c.hl, c.hw, c.v, 0, null);
    }
  }

  _collide(dt) {
    const app = this.app;
    const poses = this._carPoses || [];
    // AI cars at level crossings get shoved by heavy trains
    const traffic = app.traffic;
    if (traffic && traffic.cars) {
      for (const c of poses) {
        if (c.hidden || c.elev || c.v < 1) continue;
        for (const car of traffic.cars) {
          if (!car.active) continue;
          const dx = car.x - c.x, dz = car.z - c.z;
          if (Math.abs(dx) > c.hl + 4 || Math.abs(dz) > c.hl + 4) continue;
          const along = dx * c.hx + dz * c.hz, lat = dx * c.hz - dz * c.hx;
          if (Math.abs(along) > c.hl + 1.5 || Math.abs(lat) > c.hw + 1.0) continue;
          const s = Math.sign(-lat) || 1;
          const nx = c.hz * s * -1, nz = -c.hx * s * -1;
          car.kvx = (car.kvx || 0) + nx * 5 + c.hx * c.v * 0.5;
          car.kvz = (car.kvz || 0) + nz * 5 + c.hz * c.v * 0.5;
          car.v = 0; car.bumpT = Math.max(car.bumpT || 0, 2.0);
          if (c.v > 8 && traffic.damage) traffic.damage.hit(car, 30, c.x, c.y, c.z, 'train', 0); // [car-explosions]
        }
      }
    }
    if (app.mode !== 'drive' && app.mode !== 'walk') { this.knock = null; return; }
    const r = app.mode === 'drive' ? 1.6 : 0.45;
    for (const c of poses) {
      if (c.hidden) continue;
      const dx = app.pos.x - c.x, dz = app.pos.z - c.z;
      if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      if (Math.abs(app.pos.y - c.y) > 4.2) continue;
      const along = dx * c.hx + dz * c.hz;
      const lat = dx * c.hz - dz * c.hx; // + = left of travel
      const pa = c.hl + r - Math.abs(along), pl = c.hw + r - Math.abs(lat);
      if (pa <= 0 || pl <= 0) continue;
      let nx, nz, depth;
      if (pl < pa) { const s = Math.sign(lat) || 1; nx = c.hz * s; nz = -c.hx * s; depth = pl; }
      else { const s = Math.sign(along) || 1; nx = c.hx * s; nz = c.hz * s; depth = pa; }
      app.pos.x += nx * depth; app.pos.z += nz * depth;
      if (c.v > 1.5) {
        const k = 3 + c.v * 0.7;
        this.knock = { vx: nx * k + c.hx * c.v * 0.8, vz: nz * k + c.hz * c.v * 0.8, t: 0.8 };
        if (app.mode === 'drive') app.speed = (app.speed || 0) * -0.25;
        else app.speed = 0;
        if (app.collision) app.collision.shake = Math.min(1, Math.max(app.collision.shake || 0, c.v / 14));
        this.stats.hits = (this.stats.hits || 0) + 1;
      }
    }
    if (this.knock) {
      const kn = this.knock;
      const f = Math.max(0, kn.t / 0.8);
      app.pos.x += kn.vx * f * dt; app.pos.z += kn.vz * f * dt;
      kn.t -= dt;
      if (kn.t <= 0) this.knock = null;
    }
    if (app.mode === 'drive' && app.vehicleMesh) app.vehicleMesh.position.x = app.pos.x, app.vehicleMesh.position.z = app.pos.z;
    if (app.mode === 'walk' && app.avatarMesh) app.avatarMesh.position.x = app.pos.x, app.avatarMesh.position.z = app.pos.z;
  }

  // ------------------------------------------------------------------ render
  _render() {
    const cam = this.app.camera.position;
    for (const m of Object.values(this.meshes)) m.n = 0;
    const F = { x: 0, y: 0, z: 0 }, R = { x: 0, y: 0, z: 0 };
    const poses = [];
    let cars = 0;
    for (const tr of this.trains) {
      const M = this.meshes[tr.model];
      for (let c = 0; c < tr.cars; c++) {
        const front = c * (tr.carLen + tr.gap);
        const fb = front + tr.carLen * 0.16, rb = front + tr.carLen * 0.84;
        this._pointBack(tr, fb, F);
        this._pointBack(tr, rb, R);
        let hx = F.x - R.x, hz = F.z - R.z;
        const hl = Math.hypot(hx, hz) || 1;
        hx /= hl; hz /= hl;
        const x = (F.x + R.x) / 2, z = (F.z + R.z) / 2, y = (F.y + R.y) / 2;
        const hidden = F.tn || R.tn;
        const elev = !hidden && y - railGroundY(x, z) > 2.5;
        poses.push({ x, y, z, hx, hz, hl: tr.carLen / 2, hw: (this.models[tr.model].wid || 2.6) / 2, v: tr.v, hidden, elev, tr });
        if (hidden || M.n >= MAX_INSTANCES) continue;
        if (Math.hypot(x - cam.x, z - cam.z) > DRAW_RADIUS) continue;
        const yaw = Math.atan2(hx, hz);
        const pitch = tr.fam === 'aerial' ? 0 : Math.atan2(F.y - R.y, hl);
        this._e.set(-pitch, yaw, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._v.set(x, y, z);
        this._m4.compose(this._v, this._q, this._s);
        M.body.setMatrixAt(M.n, this._m4);
        M.accent.setMatrixAt(M.n, this._m4);
        this._c.setRGB(tr.accent[0], tr.accent[1], tr.accent[2]);
        M.accent.setColorAt(M.n, this._c);
        M.n++;
        cars++;
      }
    }
    for (const m of Object.values(this.meshes)) {
      m.body.count = m.n; m.accent.count = m.n;
      if (m.n) {
        m.body.instanceMatrix.needsUpdate = true; m.accent.instanceMatrix.needsUpdate = true;
        if (m.accent.instanceColor) m.accent.instanceColor.needsUpdate = true;
      }
    }
    this._carPoses = poses;
    this.stats.cars = cars;
    this.stats.trains = this.trains.length;
  }

  /** Distance-culls per-chunk track meshes (static geometry) so only nearby chunks pay for rails. */
  _trackLod() {
    const app = this.app;
    const allow = !app.layerVisibility || app.layerVisibility.railways !== false;
    const cam = app.camera.position;
    const reach = 1300 + Math.min(900, Math.max(0, cam.y - railGroundY(cam.x, cam.z)) * 2);
    for (const g of app.loadedChunks.values()) {
      const ud = g.userData;
      const sg = ud && ud.subGroups && ud.subGroups.railways;
      if (!sg || !ud.rail) continue;
      const dx = Math.max(0, Math.abs(ud.ox - cam.x) - 500), dz = Math.max(0, Math.abs(ud.oz - cam.z) - 500);
      sg.visible = allow && Math.hypot(dx, dz) < reach;
    }
  }

  /** Tiny progressive chip naming the nearest vehicle when the player is right next to it. */
  _updateChip() {
    if (typeof document === 'undefined') return;
    const app = this.app;
    let best = null, bd = 55;
    if (app.mode === 'drive' || app.mode === 'walk' || (app.camera.position.y - railGroundY(app.pos.x, app.pos.z) < 60)) {
      for (const c of this._carPoses || []) {
        if (c.hidden) continue;
        const d = Math.hypot(c.x - app.pos.x, c.z - app.pos.z);
        if (d < bd) { bd = d; best = c.tr; }
      }
    }
    if (!this._chip) {
      const el = document.createElement('div');
      el.id = 'rail-chip';
      el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);padding:4px 10px;border-radius:999px;' +
        'background:rgba(16,18,22,.62);color:#e9edf2;font:500 12px/1.4 system-ui,sans-serif;letter-spacing:.2px;' +
        'pointer-events:none;opacity:0;transition:opacity .35s;z-index:20;white-space:nowrap';
      document.body.appendChild(el);
      this._chip = el;
    }
    const txt = best ? best.label : '';
    if (txt && this._chip.textContent !== txt) this._chip.textContent = txt;
    this._chip.style.opacity = txt ? '1' : '0';
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const app = this.app;
    if (!app.loadedChunks) return;
    if (app.worldOrigin !== this._origin) {
      this._origin = app.worldOrigin;
      this.trains = [];
      this.edges = []; this.nodes = new Map(); this.edgeByKey = new Map(); this._sig = '';
      this.live.lastFetch = 0; this.live.etd = null; this.live.ok = null;
    }
    this._rebuildT -= dt;
    if (this._rebuildT <= 0) {
      this._rebuildT = 1.0;
      const sig = this._chunksSignature();
      if (sig !== this._sig) { this._sig = sig; this._rebuildGraph(); }
      else for (const e of this.edges) if (e.profDirty) { e.prof = null; e.profDirty = false; }
    }
    const now = performance.now();
    if (this.edges.length) this._liveTick(now);
    this._spawnT -= dt;
    if (this._spawnT <= 0 && this.edges.length) {
      this._spawnT = 1.5;
      const P = { x: 0, y: 0, z: 0 };
      this.trains = this.trains.filter((tr) => {
        this._pointAt(tr.seq[tr.seq.length - 1], tr.headOff, P);
        return this._nearPlayer(P.x, P.z) < DESPAWN_RADIUS;
      });
      this._spawn();
    }
    this._lodT = (this._lodT || 0) - dt;
    if (this._lodT <= 0) { this._lodT = 0.5; this._trackLod(); }
    const step = Math.min(dt, 0.05);
    for (const tr of this.trains) this._advance(tr, step);
    this._render();
    this._collide(step);
    this._chipT = (this._chipT || 0) - dt;
    if (this._chipT <= 0) { this._chipT = 0.25; this._updateChip(); }
  }
}
