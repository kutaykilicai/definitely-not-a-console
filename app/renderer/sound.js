// Original UI sounds synthesised with Web Audio. Files in assets/user/sounds override them.
(function (root) {
  class Sound {
    constructor() { this.ctx = null; this.enabled = true; this.volume = 0.6; this.buffers = {}; this.user = {}; this.ambient = null; }
    _ctx() {
      if (!this.ctx) { const C = root.AudioContext || root.webkitAudioContext; if (!C) return null; this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
    async loadUser(map) {
      this.user = map || {};
      const ctx = this._ctx(); if (!ctx) return;
      for (const [k, url] of Object.entries(this.user)) {
        if (k === 'ambient') continue;
        try { const r = await fetch(url); this.buffers[k] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('sound', k, e); }
      }
    }
    startAmbient(on) {
      if (!this.user.ambient) return;
      if (!this.ambient) { this.ambient = new Audio(this.user.ambient); this.ambient.loop = true; }
      this.ambient.volume = Math.min(1, this.volume * 0.5);
      if (on && this.enabled) this.ambient.play().catch(() => {}); else this.ambient.pause();
    }
    _tone(t0, freq, dur, gain, type = 'sine', glideTo) {
      const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0); if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    play(name) {
      if (!this.enabled) return;
      const ctx = this._ctx(); if (!ctx) return;
      if (this.buffers[name]) { const s = ctx.createBufferSource(); s.buffer = this.buffers[name]; s.connect(this.master); s.start(); return; }
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'focus': this._tone(t, 2350, 0.045, 0.05); this._tone(t, 1175, 0.05, 0.025); break;
        case 'select': this._tone(t, 880, 0.12, 0.08); this._tone(t + 0.05, 1320, 0.16, 0.06); break;
        case 'back': this._tone(t, 990, 0.09, 0.06, 'sine', 660); break;
        case 'bump': this._tone(t, 220, 0.06, 0.05, 'triangle'); break;
        case 'menu': this._tone(t, 1480, 0.07, 0.05); break;
        case 'error': this._tone(t, 330, 0.12, 0.07, 'triangle'); this._tone(t + 0.1, 262, 0.16, 0.07, 'triangle'); break;
        case 'launch':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(t + i * 0.07, f, 0.9 - i * 0.12, 0.05));
          break;
        default: break;
      }
    }
  }
  root.SOUND = new Sound();
})(typeof window !== 'undefined' ? window : globalThis);
