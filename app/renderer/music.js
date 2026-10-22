/* The focused game's own music, like a console's game hub. Original code.
   - starts a moment after the focus settles (quick browsing does not play every tile)
   - fades in and out, ducks under the menu's own sounds, stops for a game launch
   - remembers where each game's music was, so it continues after a game or a switch */
(function (root) {
  'use strict';
  class ThemeMusic {
    constructor({ sound, delayMs = 700, fadeInMs = 1400, fadeOutMs = 450 } = {}) {
      this.sound = sound; this.delayMs = delayMs; this.fadeInMs = fadeInMs; this.fadeOutMs = fadeOutMs;
      this.enabled = true; this.volume = 0.5; this.held = 0;       // held > 0: an intro, a game or a dialog keeps it quiet
      this.cur = null;            // { id, tracks, i, el, gain }
      this.want = null; this.timer = 0; this.pos = {}; this.duckUntil = 0; this.events = [];
    }
    _ctx() { return this.sound && this.sound._ctx ? this.sound._ctx() : null; }
    _emit(e) { this.events.push([Math.round(performance.now()), e, this.cur && this.cur.id]); if (this.events.length > 200) this.events.shift(); }
    setEnabled(on) { this.enabled = !!on; if (!on) this.stop(true); else this.focus(this.want && this.want.id, this.want && this.want.tracks, true); }
    setVolume(v) { this.volume = Math.max(0, Math.min(1, Number(v) || 0)); this._level(this.cur, this.held || !this.cur ? 0 : 1, 0.25); }
    target() { return this.volume * (this.sound && this.sound.enabled === false ? 0 : 1); }
    // id: the focused game (null: a tile without music); tracks: urls
    focus(id, tracks, now) {
      tracks = (tracks || []).filter(Boolean);
      this.want = id && tracks.length ? { id, tracks } : null;
      clearTimeout(this.timer);
      if (this.cur && this.want && this.cur.id === this.want.id) { if (!this.held) this._level(this.cur, 1, this.fadeInMs / 2000); return; }
      if (this.cur) this._fadeOut(this.cur);
      this.cur = null;
      if (!this.want || !this.enabled) return;
      const w = this.want;
      this.timer = setTimeout(() => { if (this.want === w && !this.held && this.enabled) this._start(w); }, now ? 0 : this.delayMs);
    }
    hold(on) {
      this.held = Math.max(0, this.held + (on ? 1 : -1));
      if (this.held) { if (this.cur) this._level(this.cur, 0, this.fadeOutMs / 1000, true); }
      else if (this.cur) { this.cur.el.play().catch(() => {}); this._level(this.cur, 1, this.fadeInMs / 1000); }
      else if (this.want) this.focus(this.want.id, this.want.tracks);
    }
    stop(fast) { clearTimeout(this.timer); if (this.cur) this._fadeOut(this.cur, fast); this.cur = null; }
    // the launch: quiet quickly, keep the position
    stopForLaunch() { this.held++; if (this.cur) this._level(this.cur, 0, 0.3, true); }
    positions() { const p = { ...this.pos }; if (this.cur && this.cur.el) p[this.cur.id] = { i: this.cur.i, t: this.cur.el.currentTime }; return p; }
    restore(p) { if (p && typeof p === 'object') this.pos = { ...p }; }
    // a menu sound: the music dips for a moment
    duck() {
      const c = this.cur; if (!c || this.held || c.fading) return;
      clearInterval(c.ramp); c.el.volume = Math.min(c.el.volume, this.target() * 0.45);
      clearTimeout(c.duckT); c.duckT = setTimeout(() => { if (this.cur === c && !this.held) this._level(c, 1, 0.4); }, 120);
      this._emit('duck');
    }
    _start(w) {
      const ctx = this._ctx();
      const saved = this.pos[w.id] || { i: 0, t: 0 };
      const c = { id: w.id, tracks: w.tracks, i: Math.min(saved.i || 0, w.tracks.length - 1), el: new Audio(), gain: null };
      // element volume only: the files come from ps5file:// (another origin), which Web Audio would mute
      c.el.preload = 'auto'; c.el.volume = 0; void ctx;
      c.el.loop = w.tracks.length === 1;
      c.el.addEventListener('ended', () => { if (this.cur !== c) return; c.i = (c.i + 1) % c.tracks.length; this.pos[c.id] = { i: c.i, t: 0 }; c.el.src = c.tracks[c.i]; c.el.play().catch(() => {}); });
      c.el.addEventListener('error', () => { if (this.cur === c) this._emit('error'); });
      c.el.src = c.tracks[c.i];
      const t0 = saved.t || 0;
      if (t0) c.el.addEventListener('loadedmetadata', () => { try { if (t0 < (c.el.duration || 0) - 1) c.el.currentTime = t0; } catch { /* */ } }, { once: true });
      this.cur = c;
      c.el.play().then(() => { if (this.cur === c && !this.held) this._level(c, 1, this.fadeInMs / 1000); }).catch(() => this._emit('blocked'));
      this._emit('start');
    }
    _level(c, to, sec, pauseAfter) {
      if (!c) return;
      const v = to * this.target();
      const v0 = c.el.volume, steps = Math.max(1, Math.round(sec * 30)); let k = 0;
      // an equal-power style curve sounds smoother than a straight line
      clearInterval(c.ramp); c.ramp = setInterval(() => { k++; const x = k / steps; const e = v > v0 ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2); c.el.volume = Math.max(0, Math.min(1, v0 + (v - v0) * e)); if (k >= steps) clearInterval(c.ramp); }, 33);
      if (pauseAfter) setTimeout(() => { if (this.held || this.cur !== c) { try { this.pos[c.id] = { i: c.i, t: c.el.currentTime }; c.el.pause(); } catch { /* */ } } }, sec * 1000 + 60);
    }
    _fadeOut(c, fast) {
      c.fading = true; clearTimeout(c.duckT);
      this.pos[c.id] = { i: c.i, t: c.el.currentTime || 0 };
      const s = fast ? 0.12 : this.fadeOutMs / 1000;
      this._level(c, 0, s);
      setTimeout(() => { try { c.el.pause(); c.el.removeAttribute('src'); c.el.load(); } catch { /* */ } }, s * 1000 + 80);
      this._emit('stop');
    }
    level() { const c = this.cur; return c ? c.el.volume : 0; }
    state() { const c = this.cur; return { id: c ? c.id : null, playing: !!(c && !c.el.paused), t: c ? c.el.currentTime : 0, track: c ? c.i : -1, level: this.level(), held: this.held, want: this.want && this.want.id }; }
  }
  root.ThemeMusic = ThemeMusic;
})(typeof window !== 'undefined' ? window : globalThis);
