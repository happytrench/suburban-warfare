// Synthesized sound effects (Web Audio) — nothing to download.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.noiseBuf = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  noise(dur, freq, q, gain, type = 'lowpass', pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = g;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    src.connect(f); f.connect(g); node.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }

  tone(freq, dur, gain, type = 'square', slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  shot(weapon, dist = 0, pan = 0) {
    const fall = 1 / (1 + dist / 18);
    if (weapon === 'shotgun') {
      this.noise(0.35, 900, 0.7, 0.9 * fall, 'lowpass', pan);
      this.tone(90, 0.25, 0.4 * fall, 'sine', -50);
    } else {
      this.noise(0.12, 2400, 0.9, 0.45 * fall, 'bandpass', pan);
      this.tone(160, 0.08, 0.15 * fall, 'square', -80);
    }
  }

  hit(head) { this.tone(head ? 1500 : 1100, 0.07, 0.18, 'triangle'); }
  kill() { this.tone(660, 0.12, 0.2, 'triangle'); setTimeout(() => this.tone(990, 0.2, 0.2, 'triangle'), 90); }
  hurt() { this.noise(0.18, 500, 1, 0.35); this.tone(140, 0.15, 0.2, 'sawtooth', -60); }
  jump() { this.noise(0.08, 600, 1, 0.08); }
  boing() { this.tone(220, 0.35, 0.25, 'sine', 500); }
  reload() { this.tone(300, 0.05, 0.1, 'square'); setTimeout(() => this.tone(420, 0.05, 0.1, 'square'), 140); }
  empty() { this.tone(900, 0.03, 0.08, 'square'); }
  ding() { this.tone(880, 0.15, 0.15, 'sine'); setTimeout(() => this.tone(660, 0.25, 0.15, 'sine'), 140); }
  step(sprint) { this.noise(0.05, sprint ? 900 : 700, 1, 0.05); }
}
