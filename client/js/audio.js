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
    if (weapon === 'deer') {
      this.noise(0.5, 1800, 0.6, 1.0 * fall, 'lowpass', pan);
      this.tone(70, 0.4, 0.5 * fall, 'sine', -40);
      setTimeout(() => this.noise(0.6, 600, 0.5, 0.25 * fall, 'lowpass', pan), 120); // echo across the fields
    } else if (weapon === 'ak') {
      this.noise(0.16, 1700, 0.9, 0.6 * fall, 'bandpass', pan);
      this.noise(0.06, 5000, 0.7, 0.2 * fall, 'highpass', pan);
      this.tone(80, 0.14, 0.45 * fall, 'sine', -40);
    } else if (weapon === 'smg') {
      this.noise(0.08, 2800, 0.9, 0.35 * fall, 'bandpass', pan);
      this.noise(0.04, 8000, 0.7, 0.12 * fall, 'highpass', pan);
      this.tone(120, 0.06, 0.25 * fall, 'sine', -50);
    } else if (weapon === 'pistol') {
      this.noise(0.1, 3200, 0.8, 0.45 * fall, 'bandpass', pan);
      this.noise(0.05, 7500, 0.7, 0.2 * fall, 'highpass', pan);
      this.tone(140, 0.08, 0.3 * fall, 'sine', -60);
    } else if (weapon === 'shotgun') {
      this.noise(0.35, 900, 0.7, 0.9 * fall, 'lowpass', pan);
      this.tone(90, 0.25, 0.4 * fall, 'sine', -50);
    } else {
      this.noise(0.12, 2400, 0.9, 0.45 * fall, 'bandpass', pan);
      this.noise(0.05, 7000, 0.7, 0.18 * fall, 'highpass', pan);   // crack
      this.tone(95, 0.1, 0.35 * fall, 'sine', -45);                 // thump
    }
  }

  // hitmarker: short bright tick with a little noise transient
  hit(head) {
    if (head) { this.tone(2100, 0.09, 0.22, 'triangle'); this.tone(3150, 0.06, 0.12, 'sine'); this.noise(0.03, 5000, 1, 0.15, 'highpass'); }
    else { this.tone(1350, 0.05, 0.2, 'triangle'); this.noise(0.025, 4000, 1, 0.12, 'highpass'); }
  }
  // kill confirm: punchy low thunk + rising chime
  kill(head) {
    this.tone(120, 0.18, 0.35, 'sine', -60);
    this.noise(0.06, 1200, 1, 0.25);
    setTimeout(() => this.tone(880, 0.12, 0.18, 'triangle'), 40);
    setTimeout(() => this.tone(head ? 1760 : 1320, 0.25, 0.18, 'triangle'), 120);
  }
  hurt() { this.noise(0.18, 500, 1, 0.35); this.tone(140, 0.15, 0.2, 'sawtooth', -60); }
  jump() { this.noise(0.08, 600, 1, 0.08); }
  boing() { this.tone(220, 0.35, 0.25, 'sine', 500); }
  reload() { this.tone(300, 0.05, 0.1, 'square'); setTimeout(() => this.tone(420, 0.05, 0.1, 'square'), 140); }
  empty() { this.tone(900, 0.03, 0.08, 'square'); }
  ding() { this.tone(880, 0.15, 0.15, 'sine'); setTimeout(() => this.tone(660, 0.25, 0.15, 'sine'), 140); }
  step(sprint) { this.noise(0.05, sprint ? 900 : 700, 1, 0.05); }
}
