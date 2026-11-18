// Zero-asset procedural WebAudio ambient soundscape & unified mute manager.
// Respects autoplay policies (AudioContext created lazily in unlock()) and syncs window.__weMuted.

const MUTE_STORAGE_KEY = 'we_muted';
const MASTER_AMBIENT_VOLUME = 0.18;

function readStoredMute() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    }
  } catch (_) {}
  return false;
}

function writeStoredMute(muted) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    }
  } catch (_) {}
}

function createNoiseBuffers(ctx, seconds = 3) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);

  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  const w = white.getChannelData(0);

  // Paul Kellet pink-noise filter state + leaky brownian integrator
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let lastBrown = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;

    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.96900 * b2 + x * 0.1538520;
    b3 = 0.86650 * b3 + x * 0.3104856;
    b4 = 0.55000 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.0168980;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;

    lastBrown = (lastBrown + 0.02 * x) / 1.02;
    b[i] = Math.max(-1, Math.min(1, lastBrown * 3.2));
  }

  return { pink, brown, white };
}

function makeLoopSource(ctx, buffer, offsetSec = 0) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(0, offsetSec % Math.max(0.1, buffer.duration));
  return src;
}

export class AmbientAudio {
  constructor() {
    this.muted = readStoredMute();
    if (typeof window !== 'undefined') {
      window.__weMuted = this.muted;
    }
    this.ctx = null;
    this.masterGain = null;
    this.ambientBus = null;
    this._sources = [];
    this._nodes = null;
    this._disposed = false;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeStoredMute(this.muted);
    if (typeof window !== 'undefined') {
      window.__weMuted = this.muted;
    }
    if (this.ctx && this.masterGain) {
      try {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.05);
      } catch (_) {}
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  unlock() {
    if (this._disposed || typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    try {
      const ctx = new AC();
      const masterGain = ctx.createGain();
      masterGain.gain.value = this.muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      const ambientBus = ctx.createGain();
      ambientBus.gain.value = MASTER_AMBIENT_VOLUME;
      ambientBus.connect(masterGain);

      const { pink, brown, white } = createNoiseBuffers(ctx, 3);
      const sources = [];

      // 1. Wind / altitude air rush (bandpass pink noise + faint high-altitude air tone)
      const windSrc = makeLoopSource(ctx, pink, 0.0);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 260;
      windFilter.Q.value = 0.85;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ambientBus);
      sources.push(windSrc);

      // 2. Subtle city / outdoor hum (lowpass brown noise + very soft 54 Hz warm air resonance)
      const citySrc = makeLoopSource(ctx, brown, 0.7);
      const cityFilter = ctx.createBiquadFilter();
      cityFilter.type = 'lowpass';
      cityFilter.frequency.value = 180;
      cityFilter.Q.value = 0.65;
      const cityGain = ctx.createGain();
      cityGain.gain.value = 0;
      citySrc.connect(cityFilter);
      cityFilter.connect(cityGain);
      cityGain.connect(ambientBus);
      sources.push(citySrc);

      const cityOsc = ctx.createOscillator();
      cityOsc.type = 'sine';
      cityOsc.frequency.value = 54;
      const cityOscGain = ctx.createGain();
      cityOscGain.gain.value = 0.04;
      cityOsc.connect(cityOscGain);
      cityOscGain.connect(cityGain);
      cityOsc.start();
      sources.push(cityOsc);

      // 3. Ocean / harbor surf (slow-LFO modulated lowpass pink noise)
      const surfSrc = makeLoopSource(ctx, pink, 1.4);
      const surfFilter = ctx.createBiquadFilter();
      surfFilter.type = 'lowpass';
      surfFilter.frequency.value = 460;
      surfFilter.Q.value = 0.6;
      const surfWaveGain = ctx.createGain();
      surfWaveGain.gain.value = 0.55;
      const surfGain = ctx.createGain();
      surfGain.gain.value = 0;

      const surfLfo = ctx.createOscillator();
      surfLfo.type = 'sine';
      surfLfo.frequency.value = 0.14; // ~7 s ocean swell cycle
      const surfLfoAmp = ctx.createGain();
      surfLfoAmp.gain.value = 0.32;
      const surfFilterLfoAmp = ctx.createGain();
      surfFilterLfoAmp.gain.value = 180;
      surfLfo.connect(surfLfoAmp);
      surfLfoAmp.connect(surfWaveGain.gain);
      surfLfo.connect(surfFilterLfoAmp);
      surfFilterLfoAmp.connect(surfFilter.frequency);
      surfLfo.start();
      sources.push(surfLfo);

      surfSrc.connect(surfFilter);
      surfFilter.connect(surfWaveGain);
      surfWaveGain.connect(surfGain);
      surfGain.connect(ambientBus);
      sources.push(surfSrc);

      // 4. Tire drift squeal (high-Q bandpass filtered noise, 1100-1600 Hz)
      const driftSrc = makeLoopSource(ctx, white, 0.3);
      const driftFilter = ctx.createBiquadFilter();
      driftFilter.type = 'bandpass';
      driftFilter.frequency.value = 1280;
      driftFilter.Q.value = 9.0;
      const driftGain = ctx.createGain();
      driftGain.gain.value = 0;
      driftSrc.connect(driftFilter);
      driftFilter.connect(driftGain);
      driftGain.connect(ambientBus);
      sources.push(driftSrc);

      this.ctx = ctx;
      this.masterGain = masterGain;
      this.ambientBus = ambientBus;
      this._sources = sources;
      this._nodes = {
        windFilter,
        windGain,
        cityGain,
        surfGain,
        driftFilter,
        driftGain,
      };

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (_) {
      this.ctx = null;
      this.masterGain = null;
      this.ambientBus = null;
      this._sources = [];
      this._nodes = null;
    }
  }

  update(dt, state = {}) {
    if (this._disposed || !this.ctx || !this._nodes) return;
    if (this.ctx.state !== 'running') return;

    const mode = state.mode || 'walk';
    const speed = Math.abs(Number(state.speed) || 0);
    const alt = Number(state.alt) || 0;
    const inWater = Boolean(state.inWater);
    const nearWater = Boolean(state.nearWater);
    const driftSlip = Math.max(0, Math.min(1, Number(state.driftSlip) || 0));

    const now = this.ctx.currentTime;
    const tau = Math.max(0.06, Math.min(0.25, (Number(dt) || 0.016) * 4));
    const n = this._nodes;

    // 1. Wind / altitude air rush
    const speedT = speed > 12 ? Math.min(1, (speed - 12) / 55) : 0;
    const altT = alt > 25 ? Math.min(1, (alt - 25) / 220) : 0;
    const isAirMode = mode === 'helicopter' || mode === 'airliner';
    const airIdle = isAirMode && (alt > 8 || speed > 5) ? 0.10 : 0;
    const windLevel = Math.min(1, Math.max(speedT * 0.88, altT * 0.78, airIdle));
    const windFreq = 220 + windLevel * 1180;
    const windTarget = windLevel * 0.65;
    n.windFilter.frequency.setTargetAtTime(windFreq, now, tau);
    n.windGain.gain.setTargetAtTime(windTarget, now, tau);

    // 2. Subtle city / outdoor ground hum
    const onGround = alt < 40 && !inWater && (mode === 'walk' || mode === 'drive');
    const altFade = onGround ? Math.min(1, Math.max(0, (40 - alt) / 20)) : 0;
    const cityTarget = altFade * 0.26;
    n.cityGain.gain.setTargetAtTime(cityTarget, now, 0.18);

    // 3. Ocean / harbor surf
    const altSurfFade = alt > 90 ? 0 : (alt > 40 ? (90 - alt) / 50 : 1);
    let surfTarget = 0;
    if (mode === 'boat') surfTarget = 0.52;
    else if (inWater) surfTarget = 0.44;
    else if (nearWater) surfTarget = 0.36;
    surfTarget *= altSurfFade;
    n.surfGain.gain.setTargetAtTime(surfTarget, now, 0.22);

    // 4. Tire drift squeal
    const slipActive = mode === 'drive' && !inWater && driftSlip > 0.25;
    const slipNorm = slipActive ? Math.min(1, (driftSlip - 0.25) / 0.75) : 0;
    const driftFreq = 1120 + slipNorm * 440;
    const driftTarget = slipNorm * 0.22;
    n.driftFilter.frequency.setTargetAtTime(driftFreq, now, 0.04);
    n.driftGain.gain.setTargetAtTime(driftTarget, now, 0.04);
  }

  dispose() {
    this._disposed = true;
    for (const src of this._sources) {
      try { src.stop(); } catch (_) {}
      try { src.disconnect(); } catch (_) {}
    }
    this._sources = [];
    if (this.ambientBus) {
      try { this.ambientBus.disconnect(); } catch (_) {}
    }
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch (_) {}
    }
    if (this.ctx) {
      try { this.ctx.close().catch(() => {}); } catch (_) {}
    }
    this.ctx = null;
    this.masterGain = null;
    this.ambientBus = null;
    this._nodes = null;
  }
}
