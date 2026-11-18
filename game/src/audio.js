// All sound is synthesized live with WebAudio — no audio files, no network.
// Engine hum, siren, gunshots, UI blips and a small bass-driven music loop.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

  /** Must be called from a user gesture (the Start button). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Master gain.
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this._startEngineHum();
    this._startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 1) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  /** speedNorm 0..1 while driving; 0 silences the hum. */
  setEngine(speedNorm, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedNorm * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, t, 0.08);
  }

  /** One-shot: short filtered noise burst. Used for gunshots and impacts. */
  _burst(duration, filterFreq, volume, type = 'bandpass') {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration + 0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  gunshot() {
    this._burst(0.16, 900, 0.5, 'lowpass');
    this._burst(0.05, 3000, 0.25, 'highpass');
  }

  enemyShot() {
    this._burst(0.14, 700, 0.22, 'lowpass');
  }

  crash(strength = 1) {
    this._burst(0.25, 300, 0.4 * Math.min(1, strength), 'lowpass');
  }

  punch() {
    this._burst(0.09, 500, 0.35, 'lowpass');
  }

  pickup() {
    this._blip(880, 0.09, 0.25);
    setTimeout(() => this._blip(1320, 0.12, 0.25), 70);
  }

  cash() {
    this._blip(660, 0.08, 0.25);
    setTimeout(() => this._blip(990, 0.1, 0.25), 80);
    setTimeout(() => this._blip(1320, 0.14, 0.25), 160);
  }

  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._blip(f, 0.16, 0.3), i * 110));
  }

  busted() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 0.3), i * 160));
  }

  _blip(freq, duration, volume) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /** Two-tone police siren that follows the nearest police car. */
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'square';
      this.sirenLfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    } else if (!on && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenLfo.stop();
      } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenGain = null;
    }
  }

  /** A lazy sunny-day groove: bass line + soft hats, 8 steps per bar. */
  _startMusic() {
    // A-minor-ish bass riff, frequencies in Hz.
    const bass = [55, 0, 55, 65.4, 0, 55, 82.4, 65.4, 55, 0, 55, 65.4, 73.4, 65.4, 49, 0];
    const stepMs = 210;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const step = this.musicStep % 16;
      this.musicStep += 1;
      const f = bass[step];
      if (f > 0) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.16, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.19);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
      }
      if (step % 2 === 0) this._burst(0.03, 8000, 0.05, 'highpass'); // hat
    }, stepMs);
  }
}
