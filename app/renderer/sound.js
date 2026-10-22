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
    // Original synthesized boot sounds (used when the user has no <kind>-boot.wav/.mp3/.ogg).
    // Events follow the measured picture timeline in boot.js. Returns stop(fadeSeconds).
    bootSynth(kind) {
      if (!this.enabled) return null;
      const ctx = this._ctx(); if (!ctx) return null;
      const out = ctx.createGain(); out.gain.value = 1; out.connect(this.master);
      const t0 = ctx.currentTime + 0.02; const nodes = [];
      const noise = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return b; })();
      const pad = (at, f, dur, g, type = 'sine', attack = 0.3) => {
        const o = ctx.createOscillator(); const e = ctx.createGain(); o.type = type; o.frequency.value = f;
        e.gain.setValueAtTime(0.0001, t0 + at); e.gain.exponentialRampToValueAtTime(g, t0 + at + attack); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(e); e.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05); nodes.push(o);
      };
      const whoosh = (at, dur, f0, f1, g) => {
        const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
        f.frequency.setValueAtTime(f0, t0 + at); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur * 0.6); f.frequency.exponentialRampToValueAtTime(f0, t0 + at + dur);
        const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0 + at); e.gain.exponentialRampToValueAtTime(g, t0 + at + dur * 0.45); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        s.connect(f); f.connect(e); e.connect(out); s.start(t0 + at); s.stop(t0 + at + dur + 0.05); nodes.push(s);
      };
      if (kind === 'switch') {
        // two short clicks as the halves meet, then a soft high blip
        const click = (at, f, g) => { const s = ctx.createBufferSource(); s.buffer = noise; const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = f; hp.Q.value = 3; const e = ctx.createGain(); e.gain.setValueAtTime(g, t0 + at); e.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.045); s.connect(hp); hp.connect(e); e.connect(out); s.start(t0 + at); s.stop(t0 + at + 0.06); nodes.push(s); };
        click(0.70, 2600, 0.5); click(0.775, 3400, 0.42);
        pad(0.8, 1568, 0.35, 0.025, 'sine', 0.01);
      } else if (kind === 'x360') {
        // player time (0 = 0.40 s into the measured sequence)
        whoosh(0.0, 0.9, 500, 2400, 0.10);
        whoosh(0.8, 1.2, 700, 1800, 0.06); pad(0.8, 110, 2.2, 0.03, 'sine', 0.6);
        whoosh(2.95, 1.05, 300, 3000, 0.16);
        whoosh(3.9, 0.8, 900, 2600, 0.07);
        [659.25, 987.77, 1318.5, 1661.2].forEach((f, i) => { pad(4.72 + i * 0.035, f, 2.6, 0.05 - i * 0.008, 'sine', 0.02); pad(4.72 + i * 0.035, f * 1.004, 2.2, 0.02, 'triangle', 0.02); });
        pad(4.72, 164.8, 2.4, 0.04, 'sine', 0.05);
      } else {
        // PS5: a low swell rising with the light, an airy lift at the flare, a soft warm chord with the specks.
        [110, 164.81].forEach((f) => pad(0.1, f, 4.2, 0.03, 'sine', 3.2));
        whoosh(2.6, 1.6, 1200, 4200, 0.03);
        [440, 554.37, 659.25, 880].forEach((f, i) => pad(3.75 + i * 0.05, f, 3.2, 0.03 - i * 0.004, 'sine', 0.12));
      }
      return (fade = 0.4) => { const n = ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0.0001, n + Math.max(0.02, fade)); setTimeout(() => { for (const o of nodes) { try { o.stop(); } catch { /* */ } } out.disconnect(); }, fade * 1000 + 80); };
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
        case 'switch': this._tone(t, 520, 0.22, 0.045, 'sine', 1040); this._tone(t + 0.06, 1560, 0.2, 0.03, 'sine', 2080); break;
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
