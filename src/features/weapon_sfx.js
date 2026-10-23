// Weapon sound effects for Fly mode (gunship cannon / Hydra rockets / impacts / building collapse) and Kaiju Defense.
// Procedural Web Audio, no sample files. One shared engine = one AudioContext, master gain, compressor and mute
// (the Kaiju HUD mute button) for every weapon and kaiju sound. Vehicle engine, rotor, tire, horn and collision
// audio stay muted (see vehicles.js / heli_flight.js / city_traffic.js).
import { KaijuAudio } from "./kaiju/kaiju_audio.js";

const MAX_VOICES = 24;                                        // global polyphony cap across all sounds
const MIN_GAP = { cannon: 0.045, spark: 0.05, explosion: 0.06, missileLaunch: 0.05, punch: 0.08 }; // s between voices
const KEEP = new Set(["breath", "laserFire", "lowHpAlarm"]);  // long-running voices never stolen by the global cap
const GESTURES = ["pointerdown", "keydown", "touchstart", "mousedown"];
const NOP = { stop() {} };

let _shared = null;
/** Shared weapon/kaiju sound engine (created lazily; the AudioContext starts on the first user gesture). */
export function getWeaponSfx(app) {
  if (!_shared) _shared = new WeaponSfx(app);
  return _shared;
}

export class WeaponSfx extends KaijuAudio {
  constructor(app) {
    super(app); // KaijuAudio only reads K.camera for distance attenuation + stereo pan
    this.stats = { played: 0, dropped: 0, stolen: 0, peak: 0 };
    this._last = {};
    this._unlock();
    if (typeof window !== "undefined") window.__WEAPON_SFX__ = this;
  }

  // Browser autoplay policy: resume the context on the first user gesture.
  _unlock() {
    if (typeof window === "undefined") return;
    const off = () => GESTURES.forEach((e) => window.removeEventListener(e, on, true));
    const on = () => {
      this.resume();
      const c = this.ctx;
      if (c && c.state === "running") off();
      else if (c) c.resume().then(() => { if (c.state === "running") off(); }).catch(() => {});
    };
    GESTURES.forEach((e) => window.addEventListener(e, on, true));
  }

  play(name, opts = {}) {
    const ctx = this._init();
    if (!ctx || this.muted) return NOP;
    const gap = MIN_GAP[name];
    if (gap) {
      const t = ctx.currentTime;
      if (t - (this._last[name] ?? -1) < gap) { this.stats.dropped++; return NOP; }
      this._last[name] = t;
    }
    const h = super.play(name, opts);
    if (h.voice) this.stats.played++;
    return h;
  }

  /** Live voices across all sounds (tests / debugging). */
  activeVoices() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    let n = 0;
    for (const k in this.voices) for (const v of this.voices[k]) if (!v.stopped && v.end >= now) n++;
    return n;
  }

  // Per-sound caps (KaijuAudio) + a global cap: steal the oldest stealable voice.
  _voice(name, opts, dur, reverb) {
    const v = super._voice(name, opts, dur, reverb);
    const now = this.ctx.currentTime;
    let live = 0;
    for (const k in this.voices) {
      const l = this.voices[k];
      for (let i = l.length - 1; i >= 0; i--) if (l[i].stopped || l[i].end < now) l.splice(i, 1);
      live += l.length;
    }
    while (live > MAX_VOICES) {
      let old = null, oldList = null;
      for (const k in this.voices) {
        if (KEEP.has(k)) continue;
        for (const x of this.voices[k]) if (x !== v && !this.loops.includes(x) && (!old || x.t0 < old.t0)) { old = x; oldList = this.voices[k]; }
      }
      if (!old) break;
      this._stopVoice(old, 0.03);
      oldList.splice(oldList.indexOf(old), 1);
      this.stats.stolen++;
      live--;
    }
    if (live > this.stats.peak) this.stats.peak = live;
    return v;
  }

  // ---------- weapon recipes ----------
  // Rotary cannon round: short, punchy, slightly varied so sustained fire reads as a rhythmic "brrrt".
  _s_cannon(o) {
    const v = this._voice("cannon", o, 0.12, 0.06);
    const t = v.t0, p = 0.9 + Math.random() * 0.2;
    const n = this._noise(false), bp = this._filter("bandpass", 1500 * p, 0.9), ng = this._gain();
    n.connect(bp); bp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.001, 0.45, 0.04);
    const s = this._osc("square", 190 * p), lp = this._filter("lowpass", 900), sg = this._gain();
    s.frequency.setValueAtTime(190 * p, t);
    s.frequency.exponentialRampToValueAtTime(70 * p, t + 0.05);
    s.connect(lp); lp.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.001, 0.3, 0.05);
    const k = this._osc("sine", 120 * p), kg = this._gain();
    k.frequency.setValueAtTime(120 * p, t);
    k.frequency.exponentialRampToValueAtTime(45, t + 0.07);
    k.connect(kg); kg.connect(v.in);
    this._env(kg.gain, t, 0.001, 0.6, 0.07);
    this._start(v, n); this._start(v, s); this._start(v, k);
    return v;
  }

  // Round hitting a building / ground: tiny crack + thud.
  _s_spark(o) {
    const v = this._voice("spark", o, 0.12, 0.08);
    const t = v.t0, p = 0.85 + Math.random() * 0.3;
    const n = this._noise(false), hp = this._filter("highpass", 2200 * p, 0.7), ng = this._gain();
    n.connect(hp); hp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.001, 0.35, 0.03);
    const th = this._osc("sine", 160 * p), tg = this._gain();
    th.frequency.setValueAtTime(160 * p, t);
    th.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    th.connect(tg); tg.connect(v.in);
    this._env(tg.gain, t, 0.001, 0.4, 0.06);
    this._start(v, n); this._start(v, th);
    return v;
  }

  // Walker punch thump.
  _s_punch(o) {
    const v = this._voice("punch", o, 0.2, 0.03);
    const t = v.t0;
    const s = this._osc("sine", 140), sg = this._gain();
    s.frequency.setValueAtTime(150, t);
    s.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    s.connect(sg); sg.connect(v.in);
    this._env(sg.gain, t, 0.002, 0.7, 0.1);
    const n = this._noise(false), lp = this._filter("lowpass", 1400), ng = this._gain();
    n.connect(lp); lp.connect(ng); ng.connect(v.in);
    this._env(ng.gain, t, 0.002, 0.3, 0.05);
    this._start(v, s); this._start(v, n);
    return v;
  }

  // Railgun: capacitor charge whine snapping into the existing crack + discharge.
  _s_railgun(o) {
    const v = super._s_railgun(o);
    const t = v.t0;
    const w = this._osc("sine", 600), wg = this._gain();
    w.frequency.setValueAtTime(600, t);
    w.frequency.exponentialRampToValueAtTime(4200, t + 0.12);
    w.connect(wg); wg.connect(v.in);
    this._env(wg.gain, t, 0.08, 0.18, 0.06);
    this._start(v, w);
    return v;
  }
}
