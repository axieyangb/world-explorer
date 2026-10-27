// Kaiju Defense: procedural Web Audio. No sample files; every sound is synthesized on demand.
import * as THREE from "../../../vendor/three.module.js";

// Max simultaneous voices per sound; the oldest voice is stolen.
const VOICES = {
  cannon: 6, hit: 4, hitWeak: 3, missileLaunch: 4, explosion: 6, bigExplosion: 5, footstep: 4,
  roar: 2, breath: 2, collapse: 4, lock: 1, alarm: 1, heliHit: 2, crash: 1,
  laserBeep: 2, laserFire: 1, dash: 2, lowHpAlarm: 1, pickup: 2, railgun: 2, emp: 2, orbital: 1,
};
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();

export class KaijuAudio {
  constructor(K) {
    this.K = K;
    this.muted = false;
    this.ctx = null;
    this.listener = new THREE.Vector3();
    this.voices = {};   // name -> [voice]
    this.loops = [];    // positional voices that need per-frame updates
    this.siren = null;
  }

  // ---------- setup ----------
  _init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    // Shared reverb send (generated impulse response).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.6);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.55;
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(this.master);
    // Noise buffers.
    const n = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, n, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      last = (last + 0.02 * x) / 1.02;
      b[i] = last * 3.5;
    }
    // Soft clip curve for growls.
    this.curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; this.curve[i] = Math.tanh(x * 3); }
    return ctx;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  resume() {
    const ctx = this._init();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  setMuted(b) {
    this.muted = !!b;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, t, 0.05);
    }
  }

  // ---------- helpers ----------
  _noise(brown, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.white;
    s.loop = true; // 2 s buffer; always loop and start at random offset
    s._off = Math.random() * 1.9;
    return s;
  }
  _osc(type, f) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  }
  _gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }
  _filter(type, f, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  // Exponential-ish envelope: attack to peak, decay to ~0.
  _env(param, t, a, peak, d) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(0.0001, t + a, d / 4);
  }

  // Builds the voice output chain: src... -> voice.in -> lowpass -> gain -> pan -> master (+ reverb send).
  _voice(name, opts, dur, reverb = 0.2) {
    const ctx = this.ctx;
    const v = { name, nodes: [], srcs: [], end: 0, pos: null, base: opts.gain ?? 1, stopped: false };
    v.in = this._gain(1);
    v.lp = this._filter("lowpass", 18000, 0.5);
    v.out = this._gain(1);
    v.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    v.in.connect(v.lp);
    v.lp.connect(v.out);
    if (v.pan) { v.out.connect(v.pan); v.pan.connect(this.master); } else v.out.connect(this.master);
    if (reverb > 0) {
      v.send = this._gain(reverb);
      v.out.connect(v.send);
      v.send.connect(this.reverbIn);
    }
    v.delay = 0;
    if (opts.pos) {
      v.pos = opts.pos.clone ? opts.pos.clone() : null;
      if (opts.follow) v.pos = opts.pos; // track a live vector (loops)
      this._spatialize(v, true);
    } else {
      v.out.gain.value = v.base;
    }
    v.t0 = ctx.currentTime + 0.005 + v.delay;
    v.end = v.t0 + dur;
    // Voice limit: steal the oldest.
    const list = this.voices[name] || (this.voices[name] = []);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].stopped || list[i].end < ctx.currentTime) list.splice(i, 1);
    const cap = VOICES[name] || 4;
    while (list.length >= cap) this._stopVoice(list.shift(), 0.03);
    list.push(v);
    return v;
  }

  _spatialize(v, initial) {
    if (!v.pos) return;
    const cam = this.K?.camera || this.K?.app?.camera;
    const L = cam ? cam.position : this.listener;
    _v.subVectors(v.pos, L);
    const d = _v.length();
    const g = v.base * Math.min(1, 60 / (60 + Math.max(0, d - 20) * 0.9));
    const cut = Math.max(350, Math.min(18000, 18000 * Math.exp(-d / 700)));
    let pan = 0;
    if (cam && d > 1) {
      _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
      pan = Math.max(-0.85, Math.min(0.85, _r.dot(_v) / d));
    }
    if (initial) {
      v.out.gain.value = g;
      v.lp.frequency.value = cut;
      if (v.pan) v.pan.pan.value = pan;
      v.delay = Math.min(2.5, d / 343); // speed of sound
    } else {
      const t = this.ctx.currentTime;
      v.out.gain.setTargetAtTime(g, t, 0.08);
      v.lp.frequency.setTargetAtTime(cut, t, 0.08);
      if (v.pan) v.pan.pan.setTargetAtTime(pan, t, 0.08);
    }
  }

  _start(v, src, t = v.t0, dur = v.end - v.t0) {
    if (src._off !== undefined) src.start(t, src._off); else src.start(t);
    src.stop(t + dur + 0.1);
    v.srcs.push(src);
    // Unplug the voice once its last source ends: finished voices left connected to the shared reverb pile up
    // and starve the audio thread in long fights (sound drops out until it catches up).
    v.pending = (v.pending || 0) + 1;
    src.onended = () => { if (--v.pending <= 0) this._release(v); };
  }

  _release(v) {
    if (v.released) return;
    v.released = true;
    v.stopped = true;
    for (const n of [v.in, v.lp, v.out, v.pan, v.send]) {
      if (!n) continue;
      try { n.disconnect(); } catch (e) { /* already disconnected */ }
    }
    for (const s of v.srcs) { try { s.disconnect(); } catch (e) { /* ended */ } }
    v.srcs.length = 0;
    const i = this.loops.indexOf(v);
    if (i >= 0) this.loops.splice(i, 1);
  }

  _stopVoice(v, fade = 0.15) {
    if (!v || v.stopped) return;
    v.stopped = true;
    const t = this.ctx.currentTime;
    try {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, fade / 3);
      for (const s of v.srcs) s.stop(t + fade + 0.05);
    } catch (e) { /* already stopped */ }
    const i = this.loops.indexOf(v);
    if (i >= 0) this.loops.splice(i, 1);
  }

  // ---------- public ----------
  play(name, opts = {}) {
    const ctx = this._init();
    const nop = { stop() {} };
    if (!ctx || this.muted) return nop;
    const fn = this["_s_" + name];
    if (!fn) return nop;
    let v;
    try { v = fn.call(this, opts); } catch (e) { return nop; }
    if (!v) return nop;
    return { stop: () => this._stopVoice(v, 0.35), voice: v };
  }

  update(dt, listenerPos) {
    if (listenerPos) this.listener.copy(listenerPos);
    if (!this.ctx) return;
    for (let i = 0; i < this.loops.length; i++) this._spatialize(this.loops[i], false);
  }

  stopAll() {
    if (!this.ctx) return;
    for (const k in this.voices) {
      for (const v of this.voices[k]) this._stopVoice(v, 0.1);
      this.voices[k].length = 0;
    }
    this.loops.length = 0;
    this.stopSiren();
  }

  // Distant city air-raid siren: two sirens, slow rise/fall, through a feedback delay network.
  startSiren() {
    const ctx = this._init();
    if (!ctx || this.siren) return;
    const t = ctx.currentTime;
    const bus = this._gain(0);
    bus.gain.setTargetAtTime(0.11, t, 1.5);
    const lp = this._filter("lowpass", 1400, 0.4);
    bus.connect(lp);
    lp.connect(this.master);
    // delay network
    const dA = ctx.createDelay(1), dB = ctx.createDelay(1);
    dA.delayTime.value = 0.37; dB.delayTime.value = 0.53;
    const fb = this._gain(0.45), dl = this._filter("lowpass", 900, 0.4), wet = this._gain(0.6);
    lp.connect(dA); dA.connect(dB); dB.connect(dl); dl.connect(fb); fb.connect(dA);
    dB.connect(wet); wet.connect(this.master); dA.connect(this.reverbIn);
    const srcs = [];
    [[0.11, 430, 260, -0.5, 0], [0.085, 395, 230, 0.55, 2.7]].forEach(([rate, base, depth, pan, off]) => {
      const o = this._osc("sawtooth", base);
      const o2 = this._osc("square", base * 1.005);
      const lfo = this._osc("sine", rate);
      const lg = this._gain(depth);
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      const bp = this._filter("bandpass", 800, 0.9);
      const g = this._gain(0.5);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(bp); o2.connect(bp); bp.connect(g);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(bus); } else g.connect(bus);
      o.start(t + off); o2.start(t + off); lfo.start(t + off);
      srcs.push(o, o2, lfo);
    });
    this.siren = { bus, srcs };
  }

  stopSiren() {
    if (!this.siren || !this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.siren;
    this.siren = null;
    s.bus.gain.cancelScheduledValues(t);
    s.bus.gain.setTargetAtTime(0, t, 0.6);
    for (const o of s.srcs) { try { o.stop(t + 3); } catch (e) { /* noop */ } }
  }

  // ---------- sound recipes ----------
  _s_cannon(o) {
    const v = this._voice("cannon", o, 0.25, 0.05);
    const t = v.t0;
    const n = this._noise(false), bp = this._filter("bandpass", 1700, 0.8), hp = this._filter("highpass", 500), g = this._gain();
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(v.in);
    this._env(g.gain, t, 0.002, 0.55, 0.06);
    const th = this._osc("sine", 120), tg = this._gain();
    th.frequency.setValueAtTime(130, t);
    th.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    th.connect(tg); tg.connect(v.in);
    this._env(tg.gain, t, 0.002, 0.9, 0.1);
    this._start(v, n); this._start(v, th);
    return v;
  }

  _s_hit(o) {
    const v = this._voice("hit", o, 0.15, 0.05);
    const t = v.t0;
    for (const [f, a] of [[2350, 0.22], [3710, 0.15], [5230, 0.08]]) {
      const s = this._osc("square", f * (0.95 + Math.random() * 0.1)), g = this._gain();
      s.connect(g); g.connect(v.in);
      this._env(g.gain, t, 0.001, a, 0.05);
      this._start(v, s);
    }
    return v;
  }

  _s_hitWeak(o) {
    const v = this._voice("hitWeak", o, 0.5, 0.15);
    const t = v.t0;
    const p = this._osc("sine", 2600), pg = this._gain();
    p.frequency.setValueAtTime(3100, t);
    p.frequency.exponentialRampToValueAtTime(2300, t + 0.3);
    p.connect(pg); pg.connect(v.in);
    this._env(pg.gain, t, 0.002, 0.35, 0.3);
    const p2 = this._osc("triangle", 4650), pg2 = this._gain();
    p2.connect(pg2); pg2.connect(v.in);
    this._env(pg2.gain, t, 0.002, 0.15, 0.18);
    const n = this._noise(false), bp = this._filter("bandpass", 900, 1.2), ng = this._gain();
    n.connect(bp); bp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.003, 0.7, 0.12);
    this._start(v, p); this._start(v, p2); this._start(v, n);
    return v;
  }

  _s_missileLaunch(o) {
    const v = this._voice("missileLaunch", o, 2.2, 0.25);
    const t = v.t0;
    const n = this._noise(false), bp = this._filter("bandpass", 400, 1.4), g = this._gain();
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    bp.frequency.exponentialRampToValueAtTime(900, t + 2.0);
    n.connect(bp); bp.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.06);
    g.gain.setTargetAtTime(0.0001, t + 0.35, 0.45);
    const r = this._noise(true), rl = this._filter("lowpass", 220), rg = this._gain();
    r.connect(rl); rl.connect(rg); rg.connect(v.in);
    this._env(rg.gain, t, 0.03, 0.7, 0.9);
    this._start(v, n); this._start(v, r);
    return v;
  }

  _boom(name, o, len, size) {
    const v = this._voice(name, o, len, 0.45);
    const t = v.t0;
    const n = this._noise(false), lp = this._filter("lowpass", 3000 * size, 0.6), g = this._gain();
    lp.frequency.setValueAtTime(3200 * size, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + len * 0.7);
    n.connect(lp); lp.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.0, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + 0.05, len * 0.28);
    const b = this._noise(true), bl = this._filter("lowpass", 260), bg = this._gain();
    b.connect(bl); bl.connect(bg); bg.connect(v.in);
    this._env(bg.gain, t, 0.02, 1.0 * size, len * 0.9);
    const sub = this._osc("sine", 70), sg = this._gain();
    sub.frequency.setValueAtTime(75, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + len * 0.5);
    sub.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.005, 1.1 * size, len * 0.45);
    this._start(v, n); this._start(v, b); this._start(v, sub);
    // crackle tail
    if (size > 1) {
      const c = this._noise(false), cb = this._filter("bandpass", 2200, 2), cg = this._gain();
      c.connect(cb); cb.connect(cg); cg.connect(v.in);
      cg.gain.setValueAtTime(0, t);
      for (let i = 0; i < 18; i++) {
        const tt = t + 0.15 + Math.random() * len * 0.6;
        cg.gain.setValueAtTime(0.5 * Math.random(), tt);
        cg.gain.setTargetAtTime(0, tt + 0.005, 0.01);
      }
      this._start(v, c);
    }
    return v;
  }
  _s_explosion(o) { return this._boom("explosion", o, 2.2, 1.0); }
  _s_bigExplosion(o) { return this._boom("bigExplosion", o, 3.4, 1.35); }

  _s_footstep(o) {
    const v = this._voice("footstep", o, 1.6, 0.35);
    const t = v.t0;
    const s = this._osc("sine", 46), sg = this._gain();
    s.frequency.setValueAtTime(52, t);
    s.frequency.exponentialRampToValueAtTime(26, t + 0.6);
    s.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.01, 1.3, 0.7);
    const b = this._noise(true), bl = this._filter("lowpass", 160), bg = this._gain();
    b.connect(bl); bl.connect(bg); bg.connect(v.in);
    this._env(bg.gain, t, 0.02, 1.4, 1.3);
    this._start(v, s); this._start(v, b);
    return v;
  }

  _s_roar(o) {
    const len = o.duration ?? 2.6;
    const v = this._voice("roar", o, len + 0.6, 0.5);
    const t = v.t0;
    const ctx = this.ctx;
    const base = (o.pitch ?? 1) * 68;
    const mix = this._gain(1);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.curve;
    shaper.oversample = "2x";
    // Growl amplitude modulation (vocal fold roughness).
    const am = this._gain(0.6), lfo = this._osc("sine", 31), lg = this._gain(0.4);
    lfo.connect(lg); lg.connect(am.gain);
    mix.connect(shaper); shaper.connect(am);
    // Formants morph from a closed "o" to an open "a" and back.
    const env = this._gain();
    const fm = [[380, 720, 6], [900, 1200, 7], [2300, 2600, 9]];
    for (const [f0, f1, q] of fm) {
      const bp = this._filter("bandpass", f0, q);
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + len * 0.35);
      bp.frequency.linearRampToValueAtTime(f0 * 0.9, t + len);
      const fg = this._gain(f0 < 500 ? 1.0 : f0 < 1000 ? 0.7 : 0.35);
      am.connect(bp); bp.connect(fg); fg.connect(env);
    }
    const low = this._filter("lowpass", 300, 0.7), lowg = this._gain(0.9);
    am.connect(low); low.connect(lowg); lowg.connect(env);
    env.connect(v.in);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.25);
    env.gain.linearRampToValueAtTime(1.0, t + len * 0.6);
    env.gain.setTargetAtTime(0.0001, t + len * 0.75, len * 0.12);
    for (const det of [-14, 0, 9, 21]) {
      const s = this._osc("sawtooth", base);
      s.detune.value = det;
      s.frequency.setValueAtTime(base * 0.75, t);
      s.frequency.exponentialRampToValueAtTime(base * 1.35, t + len * 0.3);
      s.frequency.exponentialRampToValueAtTime(base * 1.15, t + len * 0.7);
      s.frequency.exponentialRampToValueAtTime(base * 0.6, t + len);
      const sg = this._gain(0.28);
      s.connect(sg); sg.connect(mix);
      this._start(v, s, t, len + 0.4);
    }
    const sub = this._osc("sine", base * 0.5), sbg = this._gain(0.5);
    sub.frequency.setValueAtTime(base * 0.4, t);
    sub.frequency.exponentialRampToValueAtTime(base * 0.6, t + len * 0.3);
    sub.frequency.exponentialRampToValueAtTime(base * 0.3, t + len);
    sub.connect(sbg); sbg.connect(mix);
    // Breath rasp.
    const n = this._noise(false), nb = this._filter("bandpass", 650, 1.2), ng = this._gain(0.9);
    nb.frequency.setValueAtTime(500, t);
    nb.frequency.linearRampToValueAtTime(1100, t + len * 0.4);
    nb.frequency.linearRampToValueAtTime(450, t + len);
    n.connect(nb); nb.connect(ng); ng.connect(mix);
    lfo.frequency.setValueAtTime(24, t);
    lfo.frequency.linearRampToValueAtTime(36, t + len * 0.4);
    lfo.frequency.linearRampToValueAtTime(18, t + len);
    this._start(v, sub, t, len + 0.4); this._start(v, n, t, len + 0.4); this._start(v, lfo, t, len + 0.4);
    return v;
  }

  // Loops until stop(); pass { pos, follow:true } to track a moving vector.
  _s_breath(o) {
    const v = this._voice("breath", o, 3600, 0.4);
    const t = v.t0;
    const n = this._noise(false), lp = this._filter("lowpass", 1100, 0.8), bp = this._filter("bandpass", 420, 0.9), g = this._gain();
    n.connect(lp); lp.connect(g); n.connect(bp); bp.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.3);
    const r = this._noise(true), rl = this._filter("lowpass", 180), rg = this._gain();
    r.connect(rl); rl.connect(rg); rg.connect(v.in);
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(1.2, t + 0.4);
    // Flutter of the torrent.
    const lfo = this._osc("sine", 7), lg = this._gain(250);
    lfo.connect(lg); lg.connect(lp.frequency);
    this._start(v, n); this._start(v, r); this._start(v, lfo);
    if (v.pos) this.loops.push(v);
    return v;
  }

  _s_collapse(o) {
    const len = 4.5;
    const v = this._voice("collapse", o, len, 0.5);
    const t = v.t0;
    const b = this._noise(true), bl = this._filter("lowpass", 320), bg = this._gain();
    b.connect(bl); bl.connect(bg); bg.connect(v.in);
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(1.5, t + 0.5);
    bg.gain.setTargetAtTime(0.0001, t + 1.8, 0.9);
    const c = this._noise(false), cb = this._filter("bandpass", 1300, 1.5), cg = this._gain();
    c.connect(cb); cb.connect(cg); cg.connect(v.in);
    cg.gain.setValueAtTime(0, t);
    for (let i = 0; i < 26; i++) {
      const tt = t + 0.1 + Math.pow(Math.random(), 1.6) * (len - 1);
      cg.gain.setValueAtTime(0.25 + Math.random() * 0.45, tt);
      cg.gain.setTargetAtTime(0, tt + 0.01, 0.04 + Math.random() * 0.06);
    }
    const sub = this._osc("sine", 38), sg = this._gain();
    sub.frequency.setValueAtTime(40, t);
    sub.frequency.exponentialRampToValueAtTime(22, t + 2.5);
    sub.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.2, 0.8, 2.4);
    this._start(v, b); this._start(v, c); this._start(v, sub);
    return v;
  }

  _beeps(name, o, seq, type = "square", amp = 0.18) {
    const total = seq.reduce((m, s) => Math.max(m, s[0] + s[2]), 0);
    const v = this._voice(name, o, total + 0.1, 0.02);
    const t = v.t0;
    const s = this._osc(type, seq[0][1]), g = this._gain(0);
    const lp = this._filter("lowpass", 3500);
    s.connect(lp); lp.connect(g); g.connect(v.in);
    for (const [at, f, d] of seq) {
      s.frequency.setValueAtTime(f, t + at);
      g.gain.setValueAtTime(amp, t + at);
      g.gain.setValueAtTime(0, t + at + d);
    }
    this._start(v, s);
    return v;
  }
  _s_lock(o) { return this._beeps("lock", o, [[0, 1250, 0.05], [0.08, 1250, 0.05], [0.16, 1650, 0.16]]); }
  _s_alarm(o) {
    const seq = [];
    for (let i = 0; i < 6; i++) seq.push([i * 0.36, i % 2 ? 660 : 880, 0.3]);
    return this._beeps("alarm", o, seq, "sawtooth", 0.12);
  }

  _s_heliHit(o) {
    const v = this._voice("heliHit", o, 0.8, 0.15);
    const t = v.t0;
    const n = this._noise(false), bp = this._filter("bandpass", 1100, 0.9), g = this._gain();
    n.connect(bp); bp.connect(g); g.connect(v.in);
    this._env(g.gain, t, 0.002, 1.0, 0.18);
    const m = this._osc("square", 410), mg = this._gain(), ml = this._filter("lowpass", 1800);
    m.frequency.setValueAtTime(420, t);
    m.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    m.connect(ml); ml.connect(mg); mg.connect(v.in);
    this._env(mg.gain, t, 0.002, 0.4, 0.2);
    const c = this._osc("square", 1500), cg = this._gain(0);
    c.connect(cg); cg.connect(v.in);
    cg.gain.setValueAtTime(0.12, t + 0.25); cg.gain.setValueAtTime(0, t + 0.33);
    cg.gain.setValueAtTime(0.12, t + 0.42); cg.gain.setValueAtTime(0, t + 0.5);
    this._start(v, n); this._start(v, m); this._start(v, c);
    return v;
  }

  _s_crash(o) {
    const v = this._boom("crash", o, 3.0, 1.2);
    const t = v.t0;
    const m = this._noise(false), mb = this._filter("bandpass", 2400, 3), mg = this._gain();
    m.connect(mb); mb.connect(mg); mg.connect(v.in);
    mg.gain.setValueAtTime(0, t);
    for (let i = 0; i < 12; i++) {
      const tt = t + Math.random() * 1.2;
      mg.gain.setValueAtTime(0.6 * Math.random(), tt);
      mg.gain.setTargetAtTime(0, tt + 0.005, 0.03);
    }
    for (const f of [520, 790, 1130]) {
      const s = this._osc("triangle", f), sg = this._gain();
      s.connect(sg); sg.connect(v.in);
      this._env(sg.gain, t + 0.02, 0.002, 0.12, 0.9);
      this._start(v, s);
    }
    this._start(v, m);
    return v;
  }

  // ---------- dodge + laser (player) ----------
  // Lock-on chirp; opts.pitch (~1..2) rises as the laser charges.
  _s_laserBeep(o) {
    const p = Math.max(0.5, Math.min(3, o.pitch || 1));
    const v = this._voice("laserBeep", o, 0.12, 0.05);
    const t = v.t0;
    const s = this._osc("square", 1150 * p), s2 = this._osc("sine", 2300 * p), lp = this._filter("lowpass", 4200), g = this._gain();
    s.connect(lp); s2.connect(lp); lp.connect(g); g.connect(v.in);
    this._env(g.gain, t, 0.003, 0.13, 0.07);
    this._start(v, s); this._start(v, s2);
    return v;
  }

  // Beam firing: hard zap, then a looping charged hum + crackle until handle.stop().
  _s_laserFire(o) {
    const opts = o.gain === undefined ? Object.assign({}, o, { gain: 1.6 }) : o;
    const v = this._voice("laserFire", opts, 3600, 0.3);
    const t = v.t0;
    // zap
    const z = this._osc("sawtooth", 2400), zg = this._gain(), zl = this._filter("lowpass", 6000);
    z.frequency.setValueAtTime(2400, t);
    z.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    z.connect(zl); zl.connect(zg); zg.connect(v.in);
    this._env(zg.gain, t, 0.002, 0.5, 0.3);
    // hum (detuned saws through a resonant band, slow wobble)
    const h1 = this._osc("sawtooth", 96), h2 = this._osc("sawtooth", 97.3), h3 = this._osc("square", 192.4);
    const bp = this._filter("bandpass", 700, 2.5), hg = this._gain();
    h1.connect(bp); h2.connect(bp); h3.connect(bp); bp.connect(hg); hg.connect(v.in);
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.linearRampToValueAtTime(0.55, t + 0.12);
    const wob = this._osc("sine", 9), wg = this._gain(260);
    wob.connect(wg); wg.connect(bp.frequency);
    // high whine
    const w = this._osc("sine", 3100), wl = this._gain(0), vib = this._osc("sine", 23), vg = this._gain(40);
    vib.connect(vg); vg.connect(w.frequency);
    w.connect(wl); wl.connect(v.in);
    wl.gain.setValueAtTime(0, t);
    wl.gain.linearRampToValueAtTime(0.05, t + 0.2);
    // crackle: white noise gated by a fast random-ish square
    const n = this._noise(false), nb = this._filter("highpass", 2500, 0.8), ng = this._gain(0.0), gate = this._osc("square", 31), gg = this._gain(0.18);
    gate.connect(gg); gg.connect(ng.gain);
    n.connect(nb); nb.connect(ng); ng.connect(v.in);
    const gate2 = this._osc("square", 13.7), gg2 = this._gain(0.12);
    gate2.connect(gg2); gg2.connect(ng.gain);
    for (const src of [z, h1, h2, h3, wob, w, vib, n, gate, gate2]) this._start(v, src);
    if (v.pos) this.loops.push(v);
    return v;
  }

  // Dodge whoosh.
  _s_dash(o) {
    const v = this._voice("dash", o, 0.6, 0.1);
    const t = v.t0;
    const n = this._noise(false), bp = this._filter("bandpass", 500, 1.4), g = this._gain();
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    n.connect(bp); bp.connect(g); g.connect(v.in);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.1);
    g.gain.setTargetAtTime(0.0001, t + 0.18, 0.1);
    const r = this._noise(true), rl = this._filter("lowpass", 260), rg = this._gain();
    r.connect(rl); rl.connect(rg); rg.connect(v.in);
    this._env(rg.gain, t, 0.04, 0.6, 0.4);
    this._start(v, n); this._start(v, r);
    return v;
  }

  // Low hull warning: soft two-note chirp once a second, looping until handle.stop().
  _s_lowHpAlarm(o) {
    const ctx = this.ctx;
    if (!this._chirpBuf) {
      const sr = ctx.sampleRate, len = Math.floor(sr * 1.0);
      const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      const note = (t0, dur, f) => {
        const a = Math.floor(t0 * sr), m = Math.floor(dur * sr);
        for (let i = 0; i < m; i++) {
          const x = i / m;
          const env = Math.min(1, x * 25) * Math.pow(1 - x, 1.6);
          d[a + i] += Math.sin((2 * Math.PI * f * i) / sr) * env * 0.5;
        }
      };
      note(0, 0.09, 1480);
      note(0.14, 0.11, 1175);
      this._chirpBuf = b;
    }
    const v = this._voice("lowHpAlarm", o, 3600, 0.05);
    const s = ctx.createBufferSource();
    s.buffer = this._chirpBuf;
    s.loop = true;
    const g = this._gain(0.35);
    s.connect(g); g.connect(v.in);
    this._start(v, s);
    return v;
  }

  // Supply pickup chime
  _s_pickup(o) {
    const v = this._voice("pickup", o, 0.55, 0.08);
    const t = v.t0;
    const notes = [587.33, 880, 1174.66];
    for (let i = 0; i < notes.length; i++) {
      const osc = this._osc("triangle", notes[i]);
      const g = this._gain();
      osc.connect(g); g.connect(v.in);
      this._env(g.gain, t + i * 0.075, 0.005, 0.25, 0.14);
      this._start(v, osc, t + i * 0.075);
    }
    return v;
  }

  // Hyper-velocity railgun crack + electromagnetic discharge
  _s_railgun(o) {
    const v = this._voice("railgun", o, 0.85, 0.15);
    const t = v.t0;
    const z = this._osc("sawtooth", 3200), zg = this._gain(), lp = this._filter("lowpass", 6500);
    z.frequency.setValueAtTime(3200, t);
    z.frequency.exponentialRampToValueAtTime(65, t + 0.38);
    z.connect(lp); lp.connect(zg); zg.connect(v.in);
    this._env(zg.gain, t, 0.002, 0.65, 0.38);
    const n = this._noise(false), bp = this._filter("bandpass", 1800, 1.2), ng = this._gain();
    n.connect(bp); bp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.002, 0.7, 0.28);
    this._start(v, z); this._start(v, n);
    return v;
  }

  // Cryo-EMP pulse
  _s_emp(o) {
    const v = this._voice("emp", o, 1.3, 0.2);
    const t = v.t0;
    const sub = this._osc("sine", 160), sg = this._gain();
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(32, t + 0.9);
    sub.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.008, 0.85, 0.85);
    const hi = this._osc("triangle", 1900), hg = this._gain();
    hi.frequency.setValueAtTime(1900, t);
    hi.frequency.exponentialRampToValueAtTime(420, t + 0.55);
    hi.connect(hg); hg.connect(v.in);
    this._env(hg.gain, t, 0.004, 0.35, 0.5);
    this._start(v, sub); this._start(v, hi);
    return v;
  }

  // Orbital ion strike
  _s_orbital(o) {
    const v = this._voice("orbital", o, 2.8, 0.3);
    const t = v.t0;
    const s1 = this._osc("sawtooth", 72), s2 = this._osc("square", 144.5), lp = this._filter("lowpass", 900), g = this._gain();
    s1.connect(lp); s2.connect(lp); lp.connect(g); g.connect(v.in);
    this._env(g.gain, t, 0.08, 0.65, 2.4);
    const n = this._noise(true), nlp = this._filter("lowpass", 320), ng = this._gain();
    n.connect(nlp); nlp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.05, 0.7, 2.5);
    this._start(v, s1); this._start(v, s2); this._start(v, n);
    return v;
  }
}
