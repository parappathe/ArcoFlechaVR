// Sons sintetizados com Web Audio (sem arquivos).
export class Sfx {
  constructor() { this.ctx = null; this.creakGain = null; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _out(pan = 0) {
    const c = this.ctx;
    if (!c.createStereoPanner) return this.master;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  _tone(freq, dur, vol, pan = 0, type = 'sine', bend = 1, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._out(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, freq, q, pan = 0, attack = 0.002, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this._out(pan));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // Rangido contínuo enquanto puxa a corda (amount 0..1; 0 desliga).
  creak(amount) {
    if (!this.ctx) return;
    if (!this.creakGain) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 8;
      this.creakFilter = f;
      this.creakGain = this.ctx.createGain(); this.creakGain.gain.value = 0;
      s.connect(f); f.connect(this.creakGain); this.creakGain.connect(this.master); s.start();
    }
    const t = this.ctx.currentTime;
    this.creakGain.gain.setTargetAtTime(amount > 0 ? 0.04 + amount * 0.08 : 0, t, 0.05);
    this.creakFilter.frequency.setTargetAtTime(500 + amount * 900, t, 0.05);
  }

  release(pan = 0) { this._tone(170, 0.25, 0.35, pan, 'triangle', 0.7); this._noise(0.12, 0.25, 2500, 1, pan); }
  whoosh(pan = 0) { this._noise(0.35, 0.12, 1200, 0.8, pan, 0.08); }
  thunk(pan = 0) { this._tone(110, 0.12, 0.5, pan, 'sine', 0.6); this._noise(0.08, 0.35, 700, 1.5, pan); }
  thud(pan = 0) { this._tone(80, 0.1, 0.25, pan, 'sine', 0.7); this._noise(0.06, 0.12, 400, 1, pan); }
  click() { this._tone(660, 0.05, 0.2, 0, 'square', 1.2); }
  bullseye() { [880, 1175, 1568].forEach((f, i) => this._tone(f, 0.18, 0.18, 0, 'triangle', 1, i * 0.08)); this.cheer(); }
  cheer() { this._noise(1.4, 0.18, 1300, 0.5, -0.3, 0.2); this._noise(1.4, 0.18, 1800, 0.5, 0.3, 0.25); }
  fanfare(win = true) {
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this._tone(f, 0.35, 0.22, 0, 'triangle', 1, i * 0.16));
  }
}
