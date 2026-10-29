/**
 * Destructible trees. [tree-damage]
 *
 * Works on the pooled instance scheme of VegetationSystem (no chunk rebuilds):
 *   - VegetationSystem._rebuild() registers every placed instance here (live arrays + a coarse spatial grid) and
 *     asks `state(src)` which instances are dead / scorched. Per-table state lives in a WeakMap keyed by the chunk's
 *     instance table (or the OSM tree table), so it is remembered while the chunk stays loaded and dropped with it.
 *     Each per-table map is capped (oldest entries evicted).
 *   - A hit chips hit points: leaf / splinter bursts (own pooled particles), scorch tint written straight into the
 *     bucket's instanceColor. A kill hides the slot (zero matrix) and hands the tree to a pooled single-instance
 *     InstancedMesh that topples (rigid rod about the root, or about a snap point leaving a stump), bounces, lies,
 *     optionally burns, then sinks away. Bushes / banana / cactus shred instead of falling.
 *   - Caps: MAX_FALLING falling/lying trees (oldest recycled), MAX_PARTICLES leaf + splinter particles.
 *
 * Public entry points (through VegetationSystem): raycast, impact, damageSphere, damageCone, ram.
 */
import * as THREE from '../../vendor/three.module.js';
import { SP_BUSH, SP_CACTUS, SP_BANANA, SP_BAMBOO, SP_PALM, SP_DATEPALM, SP_COLUMN, SPECIES_COUNT } from './flora_climate.js';
import { TREE_DIM, PARTICLE_UV, buildTreeGeometry, buildStumpGeometry, getFloraAtlas } from './tree_models.js';

const MAX_FALLING = 10;
const MAX_PARTICLES = 640;
const STATE_CAP = 384; // per instance table
const LIE_TIME = 22;
const SINK_TIME = 3;
const GRID_CELL = 24;
const GRID_N = 56; // 56 * 24 m = 1344 m square around the last rebuild centre
const HP_K = { [SP_BUSH]: 0.3, [SP_CACTUS]: 0.6, [SP_BANANA]: 0.25, [SP_BAMBOO]: 0.7, [SP_PALM]: 1.1, [SP_DATEPALM]: 1.2, [SP_COLUMN]: 0.8 };
const SHRED = (sp) => sp === SP_BUSH || sp === SP_BANANA || sp === SP_CACTUS;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _fxP = new THREE.Vector3();
const _fxD = new THREE.Vector3();

export class TreeDamage {
  constructor(veg) {
    this.veg = veg;
    this._state = new WeakMap();
    // live instance registry (filled by VegetationSystem._rebuild)
    this.n = 0;
    this._cap = 0;
    this._grow(4096);
    this.srcs = [];
    this.gStart = new Int32Array(GRID_N * GRID_N + 1);
    this.gItems = new Int32Array(4096);
    this.gx0 = 0;
    this.gz0 = 0;
    this._hit = { dist: 0, i: -1, trunk: false };
    this._lastRay = { i: -1, x: 0, y: 0, z: 0, trunk: false, t: -1e9 };
    this.stats = { hits: 0, felled: 0, falling: 0, particles: 0 };

    // falling tree pool
    this.root = new THREE.Group();
    this.root.name = 'tree-damage';
    veg.root.add(this.root);
    this.falling = [];
    // stumps (one InstancedMesh, re-gathered on rebuild, appended on snap)
    this.stumps = new THREE.InstancedMesh(buildStumpGeometry(), veg.nearMat, 512);
    this.stumps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(512 * 3).fill(1), 3);
    this.stumps.count = 0;
    this.stumps.frustumCulled = false;
    this.stumps.castShadow = true;
    this.stumps.receiveShadow = true;
    this.root.add(this.stumps);
    this._initParticles();
    if (typeof window !== 'undefined') window.__TREE_DAMAGE__ = this;
  }

  _grow(cap) {
    const old = this._cap ? this : null;
    const mk = (T, k = 1) => new T(cap * k);
    const f = ['x', 'y', 'z', 's', 'sy', 'r', 'lx', 'lz', 'cr', 'cg', 'cb'];
    for (const k of f) {
      const a = mk(Float32Array);
      if (old) a.set(this[k].subarray(0, this.n));
      this[k] = a;
    }
    for (const [k, T] of [['sp', Uint8Array], ['src', Int32Array], ['idx', Int32Array], ['bk', Int16Array], ['slot', Int32Array]]) {
      const a = mk(T);
      if (old) a.set(this[k].subarray(0, this.n));
      this[k] = a;
    }
    this._cap = cap;
  }

  /** Damage state of one instance table (created on demand). */
  state(src, create = false) {
    let st = this._state.get(src);
    if (!st && create) {
      st = { hp: new Map(), dead: new Map(), scorch: new Map() };
      this._state.set(src, st);
    }
    return st || null;
  }

  // ---------------------------------------------------------------------------------------------
  // Registry (called from VegetationSystem._rebuild)
  // ---------------------------------------------------------------------------------------------
  beginRebuild(cx, cz) {
    this.n = 0;
    this.srcs.length = 0;
    this.gx0 = cx - (GRID_N * GRID_CELL) / 2;
    this.gz0 = cz - (GRID_N * GRID_CELL) / 2;
    this.stumps.count = 0;
  }

  addSource(src) {
    this.srcs.push(src);
    return this.srcs.length - 1;
  }

  add(si, idx, sp, x, y, z, s, sy, r, lx, lz, cr, cg, cb, bk, slot) {
    if (this.n >= this._cap) this._grow(this._cap * 2);
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.s[i] = s; this.sy[i] = sy; this.r[i] = r; this.lx[i] = lx; this.lz[i] = lz;
    this.cr[i] = cr; this.cg[i] = cg; this.cb[i] = cb;
    this.sp[i] = sp; this.src[i] = si; this.idx[i] = idx; this.bk[i] = bk; this.slot[i] = slot;
  }

  addStump(x, y, z, rad, h, rot) {
    const m = this.stumps;
    if (m.count >= 512) return;
    _q.setFromAxisAngle(_axis.set(0, 1, 0), rot);
    _m.compose(_v.set(x, y, z), _q, _s.set(rad, h / 0.9, rad));
    m.setMatrixAt(m.count, _m);
    m.count++;
    m.instanceMatrix.needsUpdate = true;
  }

  endRebuild() {
    // counting-sort grid of live trees
    const n = this.n, st = this.gStart;
    st.fill(0);
    if (this.gItems.length < n) this.gItems = new Int32Array(this._cap);
    const cellOf = (i) => {
      const gx = Math.floor((this.x[i] - this.gx0) / GRID_CELL), gz = Math.floor((this.z[i] - this.gz0) / GRID_CELL);
      return gx < 0 || gz < 0 || gx >= GRID_N || gz >= GRID_N ? -1 : gz * GRID_N + gx;
    };
    for (let i = 0; i < n; i++) { const c = cellOf(i); if (c >= 0) st[c + 1]++; }
    for (let c = 0; c < GRID_N * GRID_N; c++) st[c + 1] += st[c];
    const fill = this._fill && this._fill.length >= GRID_N * GRID_N ? this._fill : (this._fill = new Int32Array(GRID_N * GRID_N));
    fill.fill(0);
    for (let i = 0; i < n; i++) { const c = cellOf(i); if (c >= 0) this.gItems[st[c] + fill[c]++] = i; }
    this.stumps.instanceMatrix.needsUpdate = true;
  }

  /** Calls fn(i) for live trees whose grid cell overlaps the xz box. */
  _query(x0, z0, x1, z1, fn) {
    const gx0 = Math.max(0, Math.floor((x0 - this.gx0) / GRID_CELL)), gx1 = Math.min(GRID_N - 1, Math.floor((x1 - this.gx0) / GRID_CELL));
    const gz0 = Math.max(0, Math.floor((z0 - this.gz0) / GRID_CELL)), gz1 = Math.min(GRID_N - 1, Math.floor((z1 - this.gz0) / GRID_CELL));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gz * GRID_N + gx;
        for (let k = this.gStart[c]; k < this.gStart[c + 1]; k++) {
          const i = this.gItems[k];
          if (this.sp[i] !== 255) fn(i);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Hit tests
  // ---------------------------------------------------------------------------------------------
  /** First tree along a ray (trunk cylinder or canopy sphere). Returns a reused {dist, i, trunk} or null. */
  raycast(o, d, maxDist) {
    const n = this.n;
    let best = maxDist, bi = -1, bt = false;
    const hl = Math.hypot(d.x, d.z);
    for (let i = 0; i < n; i++) {
      const sp = this.sp[i];
      if (sp === 255) continue;
      const D = TREE_DIM[sp];
      const s = this.s[i], sy = this.sy[i];
      const cr = D.cr * s * 0.85, cy = this.y[i] + D.cy * sy;
      const px = this.x[i] - o.x, pz = this.z[i] - o.z;
      // horizontal broadphase: distance of the tree axis from the ray's ground track
      if (hl > 1e-4) {
        const along = (px * d.x + pz * d.z) / hl;
        if (along < -cr || along > best * hl + cr) continue;
        const perp = Math.abs(px * d.z - pz * d.x) / hl;
        if (perp > cr + 0.5) continue;
      } else if (px * px + pz * pz > cr * cr) continue;
      // canopy sphere
      const py = cy - o.y;
      const b = px * d.x + py * d.y + pz * d.z;
      const c = px * px + py * py + pz * pz - cr * cr;
      const disc = b * b - c;
      if (disc > 0) {
        const t = b - Math.sqrt(disc);
        if (t > 0.5 && t < best) { best = t; bi = i; bt = false; }
      }
      // trunk: vertical cylinder from base to canopy centre
      const tr = Math.max(0.25, D.tr * s * 1.4);
      if (hl > 1e-4) {
        const a = d.x * d.x + d.z * d.z;
        const bb = -(px * d.x + pz * d.z);
        const cc = px * px + pz * pz - tr * tr;
        const dd = bb * bb - a * cc;
        if (dd > 0) {
          const t = (-bb - Math.sqrt(dd)) / a;
          const y = o.y + d.y * t;
          if (t > 0.5 && t < best && y >= this.y[i] - 0.2 && y <= cy) { best = t; bi = i; bt = true; }
        }
      }
    }
    if (bi < 0) return null;
    const h = this._hit;
    h.dist = best;
    h.i = bi;
    h.trunk = bt;
    // remembered for impact(): projectiles fly from the muzzle, so their end point can sit a few metres off the tree
    const L = this._lastRay;
    L.i = bi; L.x = o.x + d.x * best; L.y = o.y + d.y * best; L.z = o.z + d.z * best; L.trunk = bt; L.t = performance.now();
    return h;
  }

  /** Live tree whose trunk/canopy contains p (direct hits), or -1. */
  _treeAt(px, py, pz, slack = 0.8) {
    let best = -1, bd = Infinity;
    this._query(px - 8, pz - 8, px + 8, pz + 8, (i) => {
      const D = TREE_DIM[this.sp[i]];
      const s = this.s[i], sy = this.sy[i];
      const dx = px - this.x[i], dz = pz - this.z[i];
      const h2 = dx * dx + dz * dz;
      const cy = this.y[i] + D.cy * sy;
      const tr = D.tr * s + slack;
      let d = Infinity;
      if (py <= cy + 0.5 && h2 < tr * tr) d = Math.sqrt(h2) * 0.5;
      const dy = py - cy;
      const cd = Math.sqrt(h2 + dy * dy * 1.3) - D.cr * s - slack;
      if (cd < 0) d = Math.min(d, Math.sqrt(h2 + dy * dy));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // ---------------------------------------------------------------------------------------------
  // Damage entry points
  // ---------------------------------------------------------------------------------------------
  /** Weapon impact at p: splash > 0 = explosion radius (m), units = building-damage units (rifle 0.06 .. railgun 2.5). */
  impact(p, splash, units, dir) {
    if (!p || !this.n) return 0;
    const px = p.x, py = p.y, pz = p.z;
    let killed = 0;
    let direct = this._treeAt(px, py, pz, splash > 0 ? 1.2 : 0.8);
    let hx = px, hy = py, hz = pz;
    const L = this._lastRay;
    if (direct < 0 && L.i >= 0 && this.sp[L.i] !== 255 && performance.now() - L.t < 4000 && (L.x - px) ** 2 + (L.y - py) ** 2 + (L.z - pz) ** 2 < 49) {
      direct = L.i;
      (hx = L.x), (hy = L.y), (hz = L.z);
    }
    if (direct >= 0) {
      const D = TREE_DIM[this.sp[direct]];
      const trunk = hy < this.y[direct] + D.cy * this.sy[direct] - D.cr * this.s[direct] * 0.45;
      const dmg = Math.min(420, Math.max(5, units * 150));
      if (this._damage(direct, dmg, { px: hx, py: hy, pz: hz, trunk, fire: splash > 0, dirX: dir ? dir.x : NaN, dirZ: dir ? dir.z : NaN, burst: 1 })) killed++;
    }
    if (splash > 0) {
      const R = splash * 1.3, power = 140 + units * 170;
      this._query(px - R, pz - R, px + R, pz + R, (i) => {
        if (i === direct) return;
        const dx = this.x[i] - px, dz = this.z[i] - pz;
        const dy = Math.max(0, this.y[i] - py, py - (this.y[i] + TREE_DIM[this.sp[i]].h * this.sy[i]));
        const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (d > R) return;
        const f = 1 - d / R;
        if (this._damage(i, power * f, { px, py, pz, trunk: false, fire: f > 0.45, dirX: dx, dirZ: dz, burst: 0.6, scorch: f * 0.7 })) killed++;
      });
    }
    return killed;
  }

  /** Kaiju stomp / body / tail / laser / missile: everything inside r falls away from the centre. */
  damageSphere(x, y, z, r, amount, opts) {
    if (!(r > 0) || !this.n) return 0;
    const fire = Boolean(opts && opts.fire);
    const power = 260 + 320 * (amount || 1);
    let killed = 0;
    this._query(x - r, z - r, x + r, z + r, (i) => {
      const dx = this.x[i] - x, dz = this.z[i] - z;
      const dy = Math.max(0, this.y[i] - y, y - (this.y[i] + TREE_DIM[this.sp[i]].h * this.sy[i]));
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 > r * r) return;
      if (this._damage(i, power * (1 - 0.5 * Math.sqrt(d2) / r), { px: x, py: y, pz: z, fire, dirX: dx, dirZ: dz, burst: 0.4, scorch: fire ? 0.8 : 0 })) killed++;
    });
    return killed;
  }

  /** Kaiju breath cone (called every frame while breathing): sets trees alight and burns them down. */
  damageCone(o, dir, range, half, amount) {
    if (!(range > 0) || !this.n) return 0;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dl, dy = dir.y / dl, dz = dir.z / dl;
    const tanH = Math.tan(Math.min(1.2, Math.max(0.01, half)));
    const ex = o.x + dx * range, ez = o.z + dz * range, sp = range * tanH + 10;
    let killed = 0;
    this._query(Math.min(o.x, ex) - sp, Math.min(o.z, ez) - sp, Math.max(o.x, ex) + sp, Math.max(o.z, ez) + sp, (i) => {
      const vx = this.x[i] - o.x, vz = this.z[i] - o.z;
      const vy = this.y[i] + TREE_DIM[this.sp[i]].cy * this.sy[i] - o.y;
      const t = vx * dx + vy * dy + vz * dz;
      if (t < 0 || t > range) return;
      const perp2 = vx * vx + vy * vy + vz * vz - t * t;
      const allow = t * tanH + TREE_DIM[this.sp[i]].cr * this.s[i];
      if (perp2 > allow * allow) return;
      if (this._damage(i, 9 + 30 * (amount || 0.2), { px: o.x, py: o.y, pz: o.z, fire: true, dirX: dx, dirZ: dz, burst: 0.08, scorch: 0.05 })) killed++;
    });
    return killed;
  }

  /**
   * Player vehicle vs trees (every frame while driving). Returns a speed multiplier: ~1 when nothing was hit,
   * < 1 when a tree was knocked down (bigger trees bite more), and a hard stop factor when the car is too slow.
   */
  ram(pos, yaw, speed, length, mass) {
    if (!this.n) return 1;
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    const half = Math.max(1.4, (length || 4.4) * 0.5), wid = 1.3 * Math.sqrt(mass);
    const fx = pos.x + sx * half * 0.6, fz = pos.z + sz * half * 0.6;
    let mult = 1;
    const asp = Math.abs(speed);
    this._query(fx - half - 2, fz - half - 2, fx + half + 2, fz + half + 2, (i) => {
      const dx = this.x[i] - pos.x, dz = this.z[i] - pos.z;
      const along = dx * sx + dz * sz, side = Math.abs(dx * sz - dz * sx);
      const sp = this.sp[i];
      const tr = TREE_DIM[sp].tr * this.s[i];
      if (Math.abs(along) > half + tr || side > wid + tr) return;
      if (Math.abs(this.y[i] - pos.y) > 3) return;
      if (Math.sign(along) !== Math.sign(speed) && asp > 0.5) return; // only what the bumper meets
      const dmg = 0.55 * asp * asp * mass;
      const hp0 = this._maxHp(i);
      const dirX = sx * Math.sign(speed || 1), dirZ = sz * Math.sign(speed || 1);
      if (asp < 2.5 && !SHRED(sp)) {
        mult = Math.min(mult, 0.2);
        return;
      }
      const killed = this._damage(i, dmg, { px: this.x[i] - dirX, py: this.y[i] + 1, pz: this.z[i] - dirZ, trunk: true, dirX, dirZ, burst: 0.7, ram: asp });
      if (SHRED(sp)) mult = Math.min(mult, 0.97);
      else if (killed) mult = Math.min(mult, Math.max(0.55, 1 - hp0 / (dmg * 2.5)));
      else mult = Math.min(mult, 0.15);
    });
    return mult;
  }

  // ---------------------------------------------------------------------------------------------
  // Damage core
  // ---------------------------------------------------------------------------------------------
  _maxHp(i) {
    const s = this.s[i];
    return 90 * Math.pow(Math.max(0.3, s), 1.6) * (HP_K[this.sp[i]] || 1);
  }

  _damage(i, dmg, o) {
    const sp = this.sp[i];
    if (sp === 255 || !(dmg > 0)) return false;
    const src = this.srcs[this.src[i]];
    const st = this.state(src, true);
    const idx = this.idx[i];
    const maxHp = this._maxHp(i);
    const hp = (st.hp.has(idx) ? st.hp.get(idx) : maxHp) - dmg;
    this.stats.hits++;
    if (o.scorch > 0 || o.fire) this._scorch(i, st, Math.max(o.scorch || 0, o.fire ? 0.25 : 0));
    if (hp > 0) {
      capSet(st.hp, idx, hp);
      this._burst(i, o, Math.min(1.5, (dmg / maxHp) * 2 + 0.25) * (o.burst ?? 1));
      return false;
    }
    st.hp.delete(idx);
    this._fell(i, st, dmg / maxHp, o);
    return true;
  }

  _scorch(i, st, k) {
    const idx = this.idx[i];
    const sc = Math.min(1, (st.scorch.get(idx) || 0) + k);
    capSet(st.scorch, idx, sc);
    const b = this._bucket(i);
    if (!b) return;
    const ca = b.mesh.instanceColor.array, o = this.slot[i] * 3;
    const f = 1 - 0.72 * sc;
    ca[o] = this.cr[i] * f * (1 + 0.15 * sc);
    ca[o + 1] = this.cg[i] * f * (1 - 0.25 * sc);
    ca[o + 2] = this.cb[i] * f * (1 - 0.3 * sc);
    b.mesh.instanceColor.needsUpdate = true;
  }

  _bucket(i) {
    const bk = this.bk[i];
    if (bk < 0) return null;
    const lod = (bk / SPECIES_COUNT) | 0, sp = bk % SPECIES_COUNT;
    const B = this.veg.buckets[sp];
    return lod === 0 ? B.near : lod === 1 ? B.mid : B.far;
  }

  _fell(i, st, overkill, o) {
    const sp = this.sp[i];
    const idx = this.idx[i];
    const D = TREE_DIM[sp];
    const s = this.s[i], sy = this.sy[i];
    const shred = SHRED(sp);
    const snap = !shred && !o.ram && overkill > 2.2 && sp !== SP_BAMBOO;
    const hb = snap ? (0.5 + Math.random() * 0.9) * Math.min(1.5, sy) : 0;
    capSet(st.dead, idx, snap ? hb : -1);
    this.stats.felled++;
    // hide the instance in its bucket
    const b = this._bucket(i);
    if (b) {
      const a = b.mesh.instanceMatrix.array, off = this.slot[i] * 16;
      for (let k = 0; k < 16; k++) a[off + k] = 0;
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    this.sp[i] = 255;
    if (snap) this.addStump(this.x[i], this.y[i], this.z[i], D.tr * s * 1.05, hb + 0.15, this.r[i]);
    // fall direction
    let dx = o.dirX, dz = o.dirZ;
    if (!(Number.isFinite(dx) && Number.isFinite(dz)) || dx * dx + dz * dz < 1e-6) {
      const cam = this.veg._camPos;
      dx = this.x[i] - (cam ? cam.x : 0);
      dz = this.z[i] - (cam ? cam.z : 0);
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // spray of leaves / splinters from the canopy and the break
    const cy = this.y[i] + D.cy * sy;
    this._emit(i, this.x[i], cy, this.z[i], D.cr * s * 0.8, shred ? 46 : 30, 0, dx, dz, 3.5);
    this._emit(i, this.x[i], this.y[i] + Math.max(0.6, hb), this.z[i], D.tr * s, shred ? 6 : 14, 1, dx, dz, 6);
    const fx = this.veg._fx();
    if (shred) {
      if (fx && o.fire) fx.spawn('fire', _fxP.set(this.x[i], this.y[i] + 0.6, this.z[i]), { count: 3, scale: 0.7 });
      return;
    }
    this._startFall(i, sp, snap, hb, dx, dz, o);
  }

  _startFall(i, sp, snap, hb, dx, dz, o) {
    let f = null;
    for (const e of this.falling) if (!e.active) { f = e; break; }
    if (!f && this.falling.length < MAX_FALLING) {
      const mesh = new THREE.InstancedMesh(buildTreeGeometry(sp, 0), this.veg.nearMat, 1);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      f = { mesh, active: false };
      this.falling.push(f);
    }
    if (!f) {
      // recycle the tree that has been lying longest
      let best = null;
      for (const e of this.falling) if (!best || e.age > best.age) best = e;
      f = best;
    }
    const D = TREE_DIM[sp];
    const s = this.s[i], sy = this.sy[i];
    f.active = true;
    f.age = 0;
    f.sp = sp;
    f.mesh.geometry = buildTreeGeometry(sp, 0);
    f.mesh.visible = true;
    // local instance transform: species rotation / scale / lean, shifted so the break point sits on the pivot
    const r = this.r[i], cr = Math.cos(r), sr = Math.sin(r), lx = this.lx[i], lz = this.lz[i];
    const a = f.mesh.instanceMatrix.array;
    const c0 = [cr * s, 0, -sr * s], c1 = [0, sy, 0], c2 = [sr * s, 0, cr * s];
    const lean = (v) => [v[0] - lz * v[1], lz * v[0] + v[1] - lx * v[2], lx * v[1] + v[2]];
    const L0 = lean(c0), L1 = lean(c1), L2 = lean(c2);
    a.set([L0[0], L0[1], L0[2], 0, L1[0], L1[1], L1[2], 0, L2[0], L2[1], L2[2], 0, 0, -hb, 0, 1]);
    f.mesh.instanceMatrix.needsUpdate = true;
    const burn = Boolean(o.fire);
    const ic = f.mesh.instanceColor.array;
    const k = burn ? 0.3 : 1;
    ic[0] = this.cr[i] * k * (burn ? 1.5 : 1);
    ic[1] = this.cg[i] * k;
    ic[2] = this.cb[i] * k * 0.8;
    f.mesh.instanceColor.needsUpdate = true;
    f.x = this.x[i];
    f.y = this.y[i] + hb;
    f.z = this.z[i];
    f.ax = dz;
    f.az = -dx; // axis = up x dir
    f.dx = dx;
    f.dz = dz;
    f.H = Math.max(1.5, D.h * sy - hb);
    f.theta = 0.03;
    f.omega = (o.ram ? Math.min(1.6, o.ram / f.H * 1.2) : 0.35 + Math.random() * 0.5) + (snap ? 0.5 : 0);
    f.maxT = Math.PI / 2 - Math.atan2(D.cr * s * 0.55 + hb * 0.3, f.H) * 0.8;
    f.slide = snap ? 1.2 + Math.random() : 0;
    f.rest = false;
    f.burn = burn ? 7 + Math.random() * 5 : 0;
    f.fireT = 0;
    f.sink = 0;
    f.cr = D.cr * s;
    f.cy = D.cy * sy - hb;
    f.src = i;
    f.leaf = [this.cr[i], this.cg[i], this.cb[i]];
    this._placeFalling(f);
  }

  _placeFalling(f) {
    _q.setFromAxisAngle(_axis.set(f.ax, 0, f.az), f.theta);
    f.mesh.position.set(f.x, f.y - f.sink, f.z);
    f.mesh.quaternion.copy(_q);
    f.mesh.updateMatrix();
    f.mesh.matrixWorldNeedsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------------------------------------------
  update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    let nf = 0;
    for (const f of this.falling) {
      if (!f.active) continue;
      nf++;
      f.age += dt;
      if (!f.rest) {
        // rigid rod about the pivot: alpha = 1.5 g / H * sin(theta)
        f.omega += (14.7 / f.H) * Math.sin(f.theta) * dt;
        f.theta += f.omega * dt;
        if (f.slide > 0) {
          f.x += f.dx * f.slide * dt;
          f.z += f.dz * f.slide * dt;
          f.slide = Math.max(0, f.slide - 2.5 * dt);
        }
        if (f.theta >= f.maxT) {
          f.theta = f.maxT;
          if (f.omega > 0.7) {
            // canopy slams down: dust + leaf burst, small bounce
            const fx = this.veg._fx();
            const reach = f.cy;
            _fxP.set(f.x + f.dx * reach, f.y, f.z + f.dz * reach);
            if (fx) fx.spawn('dust', _fxP, { count: 3, scale: 0.35, life: 3 });
            this._emitAt(_fxP.x, _fxP.y + 0.6, _fxP.z, f.cr, 18, 0, f.dx, f.dz, 2.5, f.leaf, f.y);
            f.omega = -f.omega * 0.22;
          } else {
            f.omega = 0;
            f.rest = true;
          }
        }
        this._placeFalling(f);
      }
      if (f.burn > 0) {
        f.burn -= dt;
        f.fireT -= dt;
        if (f.fireT <= 0) {
          f.fireT = 0.16;
          const fx = this.veg._fx();
          if (fx) {
            const t = Math.random();
            const st = Math.sin(f.theta), ct = Math.cos(f.theta);
            const along = (0.2 + t * 0.8) * f.cy;
            _fxP.set(f.x + f.dx * st * along, f.y - f.sink + ct * along + 0.4, f.z + f.dz * st * along);
            fx.spawn(f.burn > 2.5 ? 'fire' : 'smoke', _fxP, f.burn > 2.5 ? { count: 1, scale: 0.9 } : { count: 1, scale: 0.35, life: 4, speed: 1.5 });
          }
        }
      }
      if (f.age > LIE_TIME || (f.rest && nf > MAX_FALLING - 2 && f.age > 8)) {
        // sink below the ground, then release the slot
        f.sink += (f.cr * 1.4 / SINK_TIME) * dt;
        this._placeFalling(f);
        if (f.sink > f.cr * 1.4) {
          f.active = false;
          f.mesh.visible = false;
        }
      }
    }
    this.stats.falling = nf;
    this._updateParticles(dt);
  }

  // ---------------------------------------------------------------------------------------------
  // Leaf / splinter particles (two pooled InstancedMeshes, CPU integrated, no per-frame allocation)
  // ---------------------------------------------------------------------------------------------
  _initParticles() {
    const atlas = getFloraAtlas();
    this.pMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    this.pMeshes = [];
    for (const kind of ['leaf', 'splinter']) {
      const g = new THREE.PlaneGeometry(1, 1);
      const [u0, v0, u1, v1] = PARTICLE_UV[kind];
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
      const m = new THREE.InstancedMesh(g, this.pMat, MAX_PARTICLES);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      this.root.add(m);
      this.pMeshes.push(m);
    }
    const N = MAX_PARTICLES * 2;
    this.pN = 0;
    this.pp = new Float32Array(N * 3); // position
    this.pv = new Float32Array(N * 3); // velocity
    this.pa = new Float32Array(N * 4); // spin axis xyz + angle
    this.pl = new Float32Array(N * 4); // life, max life, size, ground y
    this.pc = new Float32Array(N * 3);
    this.pk = new Uint8Array(N); // 0 leaf, 1 splinter
    this.pw = new Float32Array(N); // spin rate
  }

  _burst(i, o, k) {
    if (!(k > 0.02)) return;
    const D = TREE_DIM[this.sp[i]];
    const s = this.s[i];
    const leaves = Math.round((o.trunk ? 6 : 18) * k + 3);
    const chips = o.trunk ? Math.round(10 * k + 4) : 0;
    const dx = this.x[i] - o.px, dz = this.z[i] - o.pz, l = Math.hypot(dx, dz) || 1;
    const hx = Number.isFinite(o.px) ? o.px : this.x[i], hy = Number.isFinite(o.py) ? o.py : this.y[i] + D.cy * this.sy[i];
    const hz = Number.isFinite(o.pz) ? o.pz : this.z[i];
    if (o.trunk) {
      this._emit(i, hx, hy, hz, 0.15, chips, 1, -dx / l, -dz / l, 5);
      this._emit(i, this.x[i], this.y[i] + D.cy * this.sy[i], this.z[i], D.cr * s * 0.7, leaves, 0, dx / l, dz / l, 1.5);
    } else {
      this._emit(i, hx, hy, hz, Math.min(1.2, D.cr * s * 0.3), leaves, 0, dx / l, dz / l, 3);
    }
  }

  _emit(i, x, y, z, rad, n, kind, dx, dz, speed) {
    const col = kind === 0 ? [this.cr[i], this.cg[i], this.cb[i]] : null;
    this._emitAt(x, y, z, rad, n, kind, dx, dz, speed, col, this.y[i]);
  }

  _emitAt(x, y, z, rad, n, kind, dx, dz, speed, leafCol, groundY) {
    for (let k = 0; k < n; k++) {
      if (this.pN >= MAX_PARTICLES * 2 - 1) return;
      const p = this.pN++;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * rad;
      this.pp[p * 3] = x + Math.cos(a) * rr;
      this.pp[p * 3 + 1] = y + (Math.random() - 0.5) * rad * 0.8;
      this.pp[p * 3 + 2] = z + Math.sin(a) * rr;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pv[p * 3] = (Math.cos(a) * 0.7 + dx * 0.8) * sp;
      this.pv[p * 3 + 1] = (kind ? 2.5 : 1.2) + Math.random() * speed * 0.6;
      this.pv[p * 3 + 2] = (Math.sin(a) * 0.7 + dz * 0.8) * sp;
      let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
      const al = Math.hypot(ax, ay, az) || 1;
      this.pa[p * 4] = ax / al; this.pa[p * 4 + 1] = ay / al; this.pa[p * 4 + 2] = az / al; this.pa[p * 4 + 3] = Math.random() * 6.28;
      this.pw[p] = (kind ? 9 : 4) * (0.5 + Math.random());
      const life = kind ? 2.5 + Math.random() * 2 : 4 + Math.random() * 4;
      this.pl[p * 4] = life; this.pl[p * 4 + 1] = life;
      this.pl[p * 4 + 2] = kind ? 0.16 + Math.random() * 0.2 : 0.2 + Math.random() * 0.16;
      this.pl[p * 4 + 3] = groundY;
      this.pk[p] = kind;
      if (kind === 0 && leafCol) {
        const v = 0.75 + Math.random() * 0.4;
        // leaf base colour (atlas leaf is pale) times the tree's tint
        this.pc[p * 3] = 0.32 * leafCol[0] * v; this.pc[p * 3 + 1] = 0.5 * leafCol[1] * v; this.pc[p * 3 + 2] = 0.2 * leafCol[2] * v;
      } else {
        const v = 0.8 + Math.random() * 0.3;
        this.pc[p * 3] = 0.9 * v; this.pc[p * 3 + 1] = 0.78 * v; this.pc[p * 3 + 2] = 0.6 * v;
      }
    }
  }

  _updateParticles(dt) {
    let n = this.pN;
    if (!n && !this.pMeshes[0].count && !this.pMeshes[1].count) return;
    const P = this.pp, Vv = this.pv, A = this.pa, L = this.pl;
    for (let p = 0; p < n; p++) {
      L[p * 4] -= dt;
      if (L[p * 4] <= 0) {
        // swap-remove
        n--;
        if (p !== n) {
          for (let k = 0; k < 3; k++) { P[p * 3 + k] = P[n * 3 + k]; Vv[p * 3 + k] = Vv[n * 3 + k]; this.pc[p * 3 + k] = this.pc[n * 3 + k]; }
          for (let k = 0; k < 4; k++) { A[p * 4 + k] = A[n * 4 + k]; L[p * 4 + k] = L[n * 4 + k]; }
          this.pk[p] = this.pk[n];
          this.pw[p] = this.pw[n];
        }
        p--;
        continue;
      }
      const leaf = this.pk[p] === 0;
      const gy = L[p * 4 + 3];
      if (P[p * 3 + 1] > gy + 0.03) {
        const drag = leaf ? 2.2 : 0.4;
        Vv[p * 3] -= Vv[p * 3] * drag * dt;
        Vv[p * 3 + 2] -= Vv[p * 3 + 2] * drag * dt;
        Vv[p * 3 + 1] -= (leaf ? 4.0 : 9.8) * dt;
        if (leaf && Vv[p * 3 + 1] < -1.3) Vv[p * 3 + 1] = -1.3; // leaves flutter down
        if (leaf) {
          const t = L[p * 4] * 3.1 + p;
          Vv[p * 3] += Math.sin(t) * 1.6 * dt;
          Vv[p * 3 + 2] += Math.cos(t * 0.8) * 1.6 * dt;
        }
        P[p * 3] += Vv[p * 3] * dt;
        P[p * 3 + 1] += Vv[p * 3 + 1] * dt;
        P[p * 3 + 2] += Vv[p * 3 + 2] * dt;
        A[p * 4 + 3] += this.pw[p] * dt;
        if (P[p * 3 + 1] < gy + 0.03) {
          P[p * 3 + 1] = gy + 0.03;
          L[p * 4] = Math.min(L[p * 4], 1.5);
        }
      }
    }
    this.pN = n;
    // write matrices
    const cnt = [0, 0];
    for (let p = 0; p < n; p++) {
      const kind = this.pk[p];
      const m = this.pMeshes[kind];
      if (cnt[kind] >= MAX_PARTICLES) continue;
      const k = cnt[kind]++;
      const life = L[p * 4], sz = L[p * 4 + 2] * Math.min(1, life / 0.8);
      _q.setFromAxisAngle(_axis.set(A[p * 4], A[p * 4 + 1], A[p * 4 + 2]), A[p * 4 + 3]);
      _m.compose(_v.set(P[p * 3], P[p * 3 + 1], P[p * 3 + 2]), _q, _s.set(sz * (kind ? 1.8 : 1), sz, sz));
      _m.toArray(m.instanceMatrix.array, k * 16);
      m.instanceColor.array[k * 3] = this.pc[p * 3];
      m.instanceColor.array[k * 3 + 1] = this.pc[p * 3 + 1];
      m.instanceColor.array[k * 3 + 2] = this.pc[p * 3 + 2];
    }
    for (let kind = 0; kind < 2; kind++) {
      const m = this.pMeshes[kind];
      m.count = cnt[kind];
      m.visible = cnt[kind] > 0;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    this.stats.particles = n;
  }

  /** Drop every falling tree / particle (teleport). Per-table state lives with the tables. */
  clear() {
    for (const f of this.falling) {
      f.active = false;
      f.mesh.visible = false;
    }
    this.pN = 0;
  }
}

function capSet(map, k, v) {
  if (map.has(k)) map.delete(k);
  map.set(k, v);
  if (map.size > STATE_CAP) map.delete(map.keys().next().value);
}
