// [people-agents] Groundwork for brain-driven pedestrians (no model calls here: an external "brain" reads
// the world through this API and decides behaviour and speech; pedestrians keep their built-in reflexes).
//
//   const P = window.app.people;
//   P.nearby(n = 10) -> [{ id, persona, groupId, pos: {x, y, z}, heading, speed, state, action,
//                          events: [...], ongoing: {...}, dirty }]
//       The n most relevant tracked pedestrians (the ~20 nearest the player): closer first, people with
//       unprocessed events or a changed situation (`dirty`) ahead of the rest.
//   P.ack(ids)        mark those people processed: clears `dirty` and flags their current events `acked`.
//   P.act(id, { action, target?, say?, duration? }) -> true if the person exists. Actions:
//       walk_to {target: {x, z}} | flee_from {target} | stop_and_watch {target} | turn_to {target} |
//       wave {target?} | phone_call | idle | follow {target}.
//       target = {x, z} | person id | 'player'. `say` shows a speech bubble (also heard by people within 10 m).
//   P.say(id, text, seconds = 4)
//   P.get(id) -> the same record as nearby() for one person (or null).
//
// Identity: each pedestrian gets a deterministic id + persona from its spawn seed (spawn position and spawn
// order), so it survives the pool recycling the instance slot. persona = { name, sex, ageBand, temperament,
// occupation }.
// Events are perception-filtered per person (hearing range by loudness, sight within ~60 m and roughly
// facing): { type, t, dist, dir: 'ahead'|'left'|'right'|'behind', seen, heard, actor?, severity 0..1,
// acked? } — types: gunshot, rocket, railgun, explosion, crash, impact, person_hit, near_miss, speech,
// player_approach, carjacked. At most 8 per person (oldest dropped).
// ongoing = { playerNear?: m, playerArmed?: 'rifle'|'rpg'|'railgun' (within 15 m), fire?: dir (burning
// wreck within 30 m), peopleRunning?: count within 25 m, vehicleNear?: m (player driving within 8 m) }.
// Cost when unused: tracking starts on the first API call; until then update() only polls weapon fire for
// the built-in reflexes (no allocation).
import * as THREE from '../../vendor/three.module.js';

const MAX_TRACK = 20;
const MAX_EVENTS = 8;
const HEAR = { gunshot: 150, rocket: 160, railgun: 150, explosion: 400, crash: 80, impact: 40, person_hit: 50, near_miss: 30, speech: 10, player_approach: 0, carjacked: 45 }; // [polish] carjacked
const SIGHT = 60;
const ACTIONS = new Set(['walk_to', 'flee_from', 'stop_and_watch', 'turn_to', 'wave', 'phone_call', 'idle', 'follow']);
// Shader idle-pose modes driven by actions (person_model.js PERSON_ANIM_GLSL).
export const POSE_WAVE = 3, POSE_CALL = 4;

const NAMES = {
  any: { m: ['James', 'Lucas', 'Noah', 'Oliver', 'Leo', 'Daniel', 'Marco', 'Tom', 'Felix', 'Samuel', 'Hugo', 'Matteo', 'Ethan', 'Jonas', 'Pierre', 'Diego'],
    f: ['Emma', 'Olivia', 'Mia', 'Sofia', 'Lea', 'Chloe', 'Anna', 'Julia', 'Clara', 'Grace', 'Nora', 'Laura', 'Elena', 'Ines', 'Lucy', 'Marie'] },
  asia: { m: ['Haruto', 'Ren', 'Kenji', 'Wei', 'Jun', 'Min-jun', 'Hiroshi', 'Takumi', 'Chen', 'Yuto', 'Ji-ho', 'Sota'],
    f: ['Yui', 'Sakura', 'Mei', 'Hana', 'Aoi', 'Li Na', 'Seo-yeon', 'Yuna', 'Xiao', 'Rin', 'Ji-woo', 'Mio'] },
  africa: { m: ['Kwame', 'Tunde', 'Sipho', 'Kofi', 'Juma', 'Chidi', 'Amadou', 'Thabo'], f: ['Amara', 'Zola', 'Nia', 'Adaeze', 'Wanjiru', 'Fatou', 'Thandi', 'Ayo'] },
  south: { m: ['Arjun', 'Rohan', 'Vikram', 'Aditya', 'Rahul', 'Kabir', 'Imran', 'Dev'], f: ['Priya', 'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Saanvi', 'Zara'] },
};
const TEMPERS = ['calm', 'nervous', 'curious', 'grumpy', 'cheerful', 'brave', 'shy', 'chatty', 'distracted', 'stoic'];
const JOBS = ['student', 'office worker', 'tourist', 'delivery rider', 'nurse', 'shop owner', 'barista', 'engineer', 'artist',
  'chef', 'teacher', 'construction worker', 'lawyer', 'street musician', 'photographer', 'software developer', 'taxi driver', 'banker'];
const JOBS_OLD = ['retiree', 'retiree', 'shop owner', 'grandparent out shopping', 'retired teacher', 'doctor'];

function region(lat, lon) {
  if (lat > 18 && lat < 46 && lon > 95 && lon < 146) return 'asia';
  if (lat > -35 && lat < 15 && lon > -18 && lon < 52) return 'africa';
  if (lat > 5 && lat < 35 && lon > 60 && lon < 95) return 'south';
  return 'any';
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(a, b, c) {
  let h = 2166136261 >>> 0;
  for (const v of [a | 0, b | 0, c | 0]) { h ^= v; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
  return h >>> 0;
}

export class PeopleAgents {
  constructor(app, traffic) {
    this.app = app;
    this.T = traffic;
    this.enabled = false;
    this.spawnN = 0;
    this.groupN = 0;
    this.recs = new Map();          // id -> record
    this.track = new Array(MAX_TRACK).fill(null); // nearest walking peds
    this.nTrack = 0;
    this.trackT = 0;
    this.time = 0;
    this.seenFx = new WeakSet();
    this.bubbles = [];
    this._v = new THREE.Vector3();
  }

  // ---------------- hooks from city_traffic ----------------
  /** New pedestrian: deterministic seed/id from spawn position + order (persona built lazily). */
  onSpawn(ped, leader = null) {
    this.spawnN++;
    ped.seed = hash3(Math.round(ped.x * 2), Math.round(ped.z * 2), this.spawnN);
    ped.pid = 'p' + ped.seed.toString(36);
    ped.groupId = leader ? leader.groupId || (leader.groupId = 'g' + (++this.groupN).toString(36)) : null;
    ped.agentCmd = null;
    ped.poseMode = -1;
    ped.extraStyle = 0;
    ped.flinchT = 0;
  }

  /**
   * [polish] The player pulled a driver out of a car at (x, z) (carjack.js): a 'carjacked' event for the people
   * around, and the built-in reflex — close bystanders bolt, the others stop and turn to look.
   * except: the people involved (the jacked driver and passengers).
   */
  onCarjack(x, y, z, except = null) {
    this.emit('carjacked', x, y, z, { actor: 'player', severity: 0.85 });
    for (const ped of this.T.peds) {
      if (!ped.active || ped.state !== 'walking' || ped.dFlee > 0 || ped.kFlee > 0 || (except && except.includes(ped))) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d > 22) continue;
      if (d < 9 || Math.random() < 0.35) this._flee(ped, x, z);
      else { ped.flinchT = 0.5 + Math.random() * 0.5; this._faceDir(ped, x - ped.x, z - ped.z, 1); }
    }
  }

  /** Impact sphere (punch, kaiju stomp, weapon splash) reported by city_traffic.triggerImpactSphere. */
  onImpact(x, y, z, radius, opts) {
    const src = opts && typeof opts === 'object' ? opts.source : null;
    this.emit(src === 'punch' ? 'impact' : radius > 10 ? 'explosion' : 'impact', x, y, z, { severity: Math.min(1, radius / 12), actor: src || undefined });
  }

  /** Runs the agent command for a pedestrian; true = it handled movement this frame. */
  drive(ped, dt) {
    if (ped.flinchT > 0) { ped.flinchT -= dt; this._settle(ped, dt); return true; }
    const c = ped.agentCmd;
    if (!c) return false;
    c.t -= dt;
    const tgt = this._targetPos(c.target, ped);
    switch (c.action) {
      case 'walk_to': case 'follow': case 'return': {
        if (!tgt) { this._end(ped); return true; }
        const dx = tgt.x - ped.x, dz = tgt.z - ped.z, d = Math.hypot(dx, dz);
        const stopAt = c.action === 'follow' ? 2.0 : 0.4;
        if (d > stopAt) {
          const v = Math.min(ped.v * (c.action === 'follow' && d > 6 ? 1.6 : 1), d - stopAt + 0.2);
          const nx = ped.x + (dx / d) * v * dt, nz = ped.z + (dz / d) * v * dt;
          if (this.T && this.T._isPedInWater && this.T._isPedInWater(nx, ped.y, nz)) {
            this._settle(ped, dt);
            if (c.action === 'return') { this._resume(ped); return false; }
            this._end(ped);
            return true;
          }
          ped.x = nx; ped.z = nz;
          ped.hx = dx / d; ped.hz = dz / d;
          ped.amp += ((c.action === 'follow' && d > 6 ? 0.95 : 0.5) - ped.amp) * Math.min(1, dt * 6);
          this._faceDir(ped, dx, dz, dt);
        } else {
          this._settle(ped, dt);
          if (c.action === 'return') { this._resume(ped); return false; }
          if (c.action === 'walk_to') c.t = Math.min(c.t, 2);
        }
        break;
      }
      default: {
        // stop_and_watch / turn_to / wave / phone_call / idle: stand (pose mode set at command time)
        this._settle(ped, dt);
        if (tgt && c.action !== 'idle' && c.action !== 'phone_call') this._faceDir(ped, tgt.x - ped.x, tgt.z - ped.z, dt);
      }
    }
    if (c.t <= 0) this._end(ped);
    return true;
  }

  // ---------------- per frame ----------------
  update(dt) {
    this.time += dt;
    this._pollWeapons();
    this._updateBubbles(dt);
    if (!this.enabled) return;
    this.trackT -= dt;
    if (this.trackT > 0) return;
    this.trackT = 0.3;
    this._retrack();
    this._ongoing();
  }

  // ---------------- public API ----------------
  nearby(n = 10) {
    this._enable();
    const out = [];
    const p = this.app.pos;
    for (let i = 0; i < this.nTrack; i++) {
      const r = this._rec(this.track[i]);
      if (r) out.push(r);
    }
    const score = (r) => Math.hypot(r.ped.x - p.x, r.ped.z - p.z) - (r.dirty ? 15 : 0) - 3 * r.events.filter((e) => !e.acked).length;
    out.sort((a, b) => score(a) - score(b));
    return out.slice(0, n).map((r) => this._view(r));
  }

  get(id) {
    this._enable();
    const ped = this._find(id);
    return ped ? this._view(this._rec(ped)) : null;
  }

  ack(ids) {
    for (const id of ids || []) {
      const r = this.recs.get(id);
      if (!r) continue;
      r.dirty = false;
      for (const e of r.events) e.acked = true;
    }
  }

  act(id, cmd = {}) {
    this._enable();
    const ped = this._find(id);
    if (!ped) return false;
    if (cmd.say) this.say(id, cmd.say);
    const a = cmd.action;
    if (!a || !ACTIONS.has(a)) return !!cmd.say;
    if (ped.state !== 'walking') return false;
    this._clearPose(ped);
    if (a === 'flee_from') {
      const tgt = this._targetPos(cmd.target, ped) || this.app.pos;
      this._flee(ped, tgt.x, tgt.z);
      return true;
    }
    const dur = Number.isFinite(cmd.duration) ? cmd.duration : { walk_to: 60, follow: 30, stop_and_watch: 6, turn_to: 3, wave: 3, phone_call: 12, idle: 6 }[a];
    ped.agentCmd = { action: a, target: cmd.target ?? null, t: dur, graph: this._graphPos(ped) };
    if (a === 'wave') ped.poseMode = POSE_WAVE;
    if (a === 'phone_call') { ped.poseMode = POSE_CALL; ped.extraStyle = 1 << 17; } // OPT.PHONE bit
    return true;
  }

  say(id, text, seconds = 4) {
    const ped = this._find(id);
    if (!ped || !text) return false;
    let b = this.bubbles.find((x) => x.ped === ped) || this.bubbles.find((x) => !x.ped);
    if (!b) {
      if (this.bubbles.length >= 8) b = this.bubbles.reduce((m, x) => (x.t < m.t ? x : m));
      else {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:0;top:0;padding:4px 10px;border-radius:12px;max-width:220px;' +
          'background:rgba(16,18,22,.72);color:#e9edf2;font:500 12px/1.35 system-ui,sans-serif;letter-spacing:.2px;' +
          'pointer-events:none;z-index:20;white-space:normal;text-align:center;display:none;will-change:transform';
        document.body.appendChild(el);
        b = { el, ped: null, t: 0 };
        this.bubbles.push(b);
      }
    }
    b.ped = ped; b.t = seconds;
    b.el.textContent = String(text).slice(0, 160);
    this.emit('speech', ped.x, ped.y, ped.z, { actor: ped.pid, severity: 0.2, text: b.el.textContent, except: ped });
    return true;
  }

  /** Perception-filtered event: added to each tracked person who could hear or see it. */
  emit(type, x, y, z, { severity = 0.5, actor, text, except } = {}) {
    if (!this.enabled) return;
    const hear = HEAR[type] ?? 50;
    for (let i = 0; i < this.nTrack; i++) {
      const ped = this.track[i];
      if (!ped || ped === except || !ped.active) continue;
      const dx = x - ped.x, dz = z - ped.z, d = Math.hypot(dx, dz);
      const fx = Math.sin(ped.ryaw || 0), fz = Math.cos(ped.ryaw || 0);
      const fwd = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const heard = d <= hear;
      const seen = type !== 'speech' && d <= SIGHT && fwd > -0.2; // words are only heard
      if (!heard && !seen) continue;
      const left = dx * Math.cos(ped.ryaw || 0) - dz * Math.sin(ped.ryaw || 0); // +local X = the person's left
      const dir = fwd > 0.707 ? 'ahead' : fwd < -0.707 ? 'behind' : left > 0 ? 'left' : 'right';
      const r = this._rec(ped);
      const ev = { type, t: +this.time.toFixed(2), dist: +d.toFixed(1), dir, seen, heard, severity: +Math.min(1, severity * (heard && !seen ? 0.8 : 1)).toFixed(2) };
      if (actor !== undefined) ev.actor = actor;
      if (text) ev.text = text;
      r.events.push(ev);
      if (r.events.length > MAX_EVENTS) r.events.shift();
      r.dirty = true;
    }
  }

  // ---------------- internals ----------------
  _enable() {
    if (this.enabled) return;
    this.enabled = true;
    this._retrack();
  }

  _retrack() {
    const p = this.app.pos, tr = this.track;
    let n = 0;
    for (let i = 0; i < MAX_TRACK; i++) tr[i] = null;
    const dist = (q) => (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
    for (const ped of this.T.peds) {
      if (!ped.active || ped.state !== 'walking' || !ped.pid) continue;
      const d = dist(ped);
      if (n < MAX_TRACK) { tr[n++] = ped; }
      else {
        let w = 0;
        for (let i = 1; i < n; i++) if (dist(tr[i]) > dist(tr[w])) w = i;
        if (d < dist(tr[w])) tr[w] = ped; else continue;
      }
    }
    this.nTrack = n;
    // forget records of people gone for a while
    if ((this._gc = (this._gc || 0) + 1) % 30 === 0) {
      for (const [id, r] of this.recs) if (this.time - r.lastSeen > 30) this.recs.delete(id);
    }
    for (let i = 0; i < n; i++) this._rec(tr[i]).lastSeen = this.time;
  }

  _rec(ped) {
    let r = this.recs.get(ped.pid);
    if (!r) {
      r = { id: ped.pid, ped, persona: this._persona(ped), events: [], ongoing: {}, ongoingKey: '', dirty: true, lastSeen: this.time };
      this.recs.set(ped.pid, r);
    }
    r.ped = ped;
    return r;
  }

  _persona(ped) {
    const r = mulberry(ped.seed);
    const L = ped.look || {};
    const female = ((L.style || 0) >> 12) & 1;
    const o = this.app.worldOrigin || {};
    const pool = NAMES[region(o.centerLat || 0, o.centerLon || 0)] || NAMES.any;
    const names = female ? pool.f : pool.m;
    return {
      name: names[Math.floor(r() * names.length)],
      sex: female ? 'female' : 'male',
      ageBand: L.older ? '65+' : ['18-29', '18-29', '30-44', '30-44', '45-64'][Math.floor(r() * 5)],
      temperament: TEMPERS[Math.floor(r() * TEMPERS.length)],
      occupation: L.older ? JOBS_OLD[Math.floor(r() * JOBS_OLD.length)] : JOBS[Math.floor(r() * JOBS.length)],
    };
  }

  _view(r) {
    const p = r.ped;
    return {
      id: r.id, persona: r.persona, groupId: p.groupId || null,
      pos: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
      heading: +(p.ryaw || 0).toFixed(2), speed: +(p.gspd || 0).toFixed(2),
      state: !p.active ? 'gone' : p.state !== 'walking' ? p.state : p.dFlee > 0 || p.kFlee > 0 ? 'fleeing'
        : p.agentCmd ? p.agentCmd.action : p.crossState === 1 ? 'waiting_to_cross' : p.crossState === 2 ? 'crossing' : 'walking',
      action: p.agentCmd ? p.agentCmd.action : null,
      events: r.events.map((e) => ({ ...e })),
      ongoing: { ...r.ongoing },
      dirty: r.dirty,
    };
  }

  _find(id) {
    if (!id) return null;
    const r = this.recs.get(id);
    if (r && r.ped.active && r.ped.pid === id) return r.ped;
    for (const ped of this.T.peds) if (ped.active && ped.pid === id) return ped;
    return null;
  }

  _targetPos(t, self) {
    if (!t) return null;
    if (t === 'player') return this.app.pos;
    if (typeof t === 'string') { const q = this._find(t); return q && q !== self ? q : null; }
    if (Number.isFinite(t.x) && Number.isFinite(t.z)) return t;
    return null;
  }

  _graphPos(ped) {
    const x = ped.x, y = ped.y, z = ped.z, hx = ped.hx, hz = ped.hz;
    let g = null;
    if (ped.e && ped.e.alive) { this.T._pedPose(ped); g = { x: ped.x, z: ped.z }; }
    ped.x = x; ped.y = y; ped.z = z; ped.hx = hx; ped.hz = hz;
    return g;
  }

  _settle(ped, dt) {
    ped.amp += (0 - ped.amp) * Math.min(1, dt * 6);
  }

  _faceDir(ped, dx, dz, dt) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-3) return;
    let dy = Math.atan2(dx, dz) - ped.ryaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    ped.ryaw += dy * Math.min(1, dt * 6);
  }

  _clearPose(ped) { ped.poseMode = -1; ped.extraStyle = 0; }

  _end(ped) {
    const c = ped.agentCmd;
    this._clearPose(ped);
    const g = c && c.graph;
    if (g && Math.hypot(g.x - ped.x, g.z - ped.z) > 0.6) ped.agentCmd = { action: 'return', target: g, t: 40, graph: null };
    else this._resume(ped);
  }

  _resume(ped) {
    ped.agentCmd = null;
    ped.px = ped.x; ped.pz = ped.z;
    if (!ped.e || !ped.e.alive) ped.active = false; // off the graph for good: recycle
  }

  _flee(ped, x, z) {
    // Reuse the built-in explosion flee (vehicle_damage.ped reads these fields), or run directly in Kaiju mode.
    let hx = ped.x - x, hz = ped.z - z;
    const l = Math.hypot(hx, hz) || 1;
    ped.dHx = hx / l; ped.dHz = hz / l;
    ped.dFlee = 3 + Math.random() * 2; ped.dSpd = 3.6 + Math.random() * 1.2;
    ped.crossState = 0;
    ped.agentCmd = null;
  }

  // Built-in reflexes + events from the player's / soldiers' weapons (read-only polling of walker_weapons).
  _pollWeapons() {
    const W = this.app.walkerWeapons;
    if (!W) return;
    const P = this.app.pos, seen = this.seenFx;
    // New entries are appended: walk back from the end until an already-seen one (no allocation).
    const pr = W.projectiles;
    if (pr) for (let i = pr.length - 1; i >= 0 && !seen.has(pr[i]); i--) {
      const o = pr[i];
      seen.add(o);
      const at = o.pos || (o.mesh && o.mesh.position);
      if (!at) continue;
      const fromPlayer = Math.hypot(at.x - P.x, at.z - P.z) < 3;
      this._shot(o.isRocket ? 'rocket' : 'gunshot', at.x, at.y, at.z, fromPlayer ? 'player' : 'soldier', o.isRocket ? 0.8 : 0.6);
    }
    const bm = W.beams;
    if (bm) for (let i = bm.length - 1; i >= 0 && !seen.has(bm[i]); i--) { seen.add(bm[i]); this._shot('railgun', P.x, P.y, P.z, 'player', 0.8); }
    const ex = W.explosions;
    if (ex) for (let i = ex.length - 1; i >= 0 && !seen.has(ex[i]); i--) {
      const o = ex[i];
      seen.add(o);
      if (o.maxRadius >= 3 && o.mesh) this._shot('explosion', o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, undefined, Math.min(1, o.maxRadius / 6));
    }
  }

  _shot(type, x, y, z, actor, severity) {
    this.emit(type, x, y, z, { actor, severity });
    // Instant reflexes (independent of any brain): duck/flinch, nearby people bolt.
    const R = type === 'explosion' ? 45 : 30;
    for (const ped of this.T.peds) {
      if (!ped.active || ped.state !== 'walking' || ped.dFlee > 0 || ped.kFlee > 0) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d > R) continue;
      if (d < R * 0.6 || Math.random() < 0.4) this._flee(ped, x, z);
      else { ped.flinchT = 0.4 + Math.random() * 0.4; this._faceDir(ped, x - ped.x, z - ped.z, 1); }
    }
  }

  _ongoing() {
    const app = this.app, P = app.pos;
    const W = app.walkerWeapons;
    const armed = W && W.weaponRig && W.weaponRig.visible && app.mode === 'walk' ? String(W.activeWeapon || 'rifle').toLowerCase() : null;
    const threats = this.T.damage && this.T.damage.threats;
    for (let i = 0; i < this.nTrack; i++) {
      const ped = this.track[i];
      const r = this._rec(ped);
      const og = r.ongoing;
      for (const k in og) delete og[k];
      const dP = Math.hypot(P.x - ped.x, P.z - ped.z);
      if (app.mode === 'walk' && dP < 5) og.playerNear = +dP.toFixed(1);
      if (armed && dP < 15) og.playerArmed = armed;
      if (app.mode === 'drive' && dP < 8 && Math.abs(app.speed || 0) > 5) og.vehicleNear = +dP.toFixed(1);
      if (threats) {
        for (const th of threats) {
          const d = Math.hypot(th.x - ped.x, th.z - ped.z);
          if (d < 30) { og.fire = this._dir(ped, th.x, th.z); break; }
        }
      }
      let running = 0;
      for (let j = 0; j < this.nTrack; j++) {
        const q = this.track[j];
        if (q !== ped && q.amp > 0.8 && Math.hypot(q.x - ped.x, q.z - ped.z) < 25) running++;
      }
      if (running) og.peopleRunning = running;
      const key = `${og.playerNear ? 1 : 0}${og.playerArmed || ''}${og.vehicleNear ? 1 : 0}${og.fire || ''}${running > 2 ? 'R' : running ? 'r' : ''}`;
      if (key !== r.ongoingKey) {
        if (og.playerNear && !r.ongoingKey.startsWith('1')) this.emit('player_approach', P.x, P.y, P.z, { actor: 'player', severity: armed ? 0.7 : 0.2 });
        if (og.vehicleNear && Math.abs(app.speed || 0) > 12) this.emit('near_miss', P.x, P.y, P.z, { actor: 'player', severity: 0.8 });
        r.ongoingKey = key;
        r.dirty = true;
      }
    }
  }

  _dir(ped, x, z) {
    const dx = x - ped.x, dz = z - ped.z, d = Math.hypot(dx, dz) || 1;
    const fwd = (dx * Math.sin(ped.ryaw) + dz * Math.cos(ped.ryaw)) / d;
    const left = dx * Math.cos(ped.ryaw) - dz * Math.sin(ped.ryaw);
    return fwd > 0.707 ? 'ahead' : fwd < -0.707 ? 'behind' : left > 0 ? 'left' : 'right';
  }

  _updateBubbles(dt) {
    if (!this.bubbles.length) return;
    const cam = this.app.camera;
    const W = window.innerWidth, H = window.innerHeight;
    for (const b of this.bubbles) {
      if (!b.ped) continue;
      b.t -= dt;
      const p = b.ped;
      const L = p.look || { hScale: 1 };
      const v = this._v.set(p.x, (p.state === 'walking' ? p.y : p.groundY || p.y) + 2.05 * L.hScale, p.z);
      const d = cam ? v.distanceTo(cam.position) : 0;
      if (b.t <= 0 || !p.active || p.state !== 'walking' || !cam || d > 45) { b.el.style.display = 'none'; if (b.t <= 0 || !p.active) b.ped = null; continue; }
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = 'block';
      b.el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2) * W}px,${((1 - v.y) / 2) * H}px)`;
    }
  }
}
