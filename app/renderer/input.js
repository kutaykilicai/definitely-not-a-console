// Xbox controller (XInput via the standard Gamepad mapping) + keyboard -> menu actions.
(function (root) {
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16 };
  const DIRS = ['up', 'down', 'left', 'right'];

  class PadMapper {
    constructor(opts = {}) {
      this.first = opts.first ?? 400; this.repeat = opts.repeat ?? 120;
      this.dz = opts.deadzone ?? 0.5; this.dzOff = opts.release ?? 0.35;
      this.prev = {}; this.dirState = {}; this.stick = { x: 0, y: 0 };
      this.comboUsed = false;
      // Stick presses (L3 / R3) switch the console menu. They count on release, and only when the
      // stick stayed near the centre while it was down and the press was short: a click that happens
      // while steering with the stick, or a long hold, is not a request to change menus.
      this.click = {}; this.clickMax = opts.clickMax ?? 700; this.clickTravel = opts.clickTravel ?? 0.5;
      // prime: buttons and directions already held the first time a pad is seen (menu reopening after
      // a game while A, the Xbox button or a stick is still down, a pad plugged in mid-press) count
      // only after they are let go, so they do not start a game again or close the pause menu.
      this.prime = !!opts.prime;
    }
    // buttons: array of booleans/pressed objects; axes: array; returns actions list.
    update(buttons, axes, now) {
      const pressed = (i) => { const b = buttons[i]; return !!(b && (b.pressed === undefined ? (b === true || b > 0.5) : b.pressed)); };
      const out = [];
      const edge = (i) => pressed(i) && !this.prev[i];
      const release = (i) => !pressed(i) && this.prev[i];

      const ax = axes[0] || 0, ay = axes[1] || 0;
      const sx = Math.abs(ax) > (this.stick.x ? this.dzOff : this.dz) ? Math.sign(ax) : 0;
      const sy = Math.abs(ay) > (this.stick.y ? this.dzOff : this.dz) ? Math.sign(ay) : 0;
      this.stick = { x: sx, y: sy };
      const dirHeld = {
        up: pressed(B.UP) || sy < 0, down: pressed(B.DOWN) || sy > 0,
        left: pressed(B.LEFT) || sx < 0, right: pressed(B.RIGHT) || sx > 0,
      };
      if (this.prime) {
        this.prime = false;
        for (let i = 0; i < 17; i++) this.prev[i] = pressed(i);
        for (const d of DIRS) if (dirHeld[d]) this.dirState[d] = { next: Infinity };
        if (pressed(B.VIEW) || pressed(B.MENU)) this.comboUsed = true;
        return out;
      }
      for (const d of DIRS) {
        const st = this.dirState[d];
        if (dirHeld[d]) {
          if (!st) { out.push(d); this.dirState[d] = { next: now + this.first }; }
          else if (now >= st.next) { out.push(d); st.next = now + this.repeat; }
        } else delete this.dirState[d];
      }

      if (edge(B.A)) out.push('select');
      if (edge(B.B)) out.push('back');
      if (edge(B.LB)) out.push('tabPrev');
      if (edge(B.RB)) out.push('tabNext');
      if (edge(B.GUIDE)) out.push('home');
      if (edge(B.X)) out.push('x');
      if (edge(B.Y)) out.push('y');
      for (const [btn, ix, iy, act] of [[B.LS, 0, 1, 'consolePrev'], [B.RS, 2, 3, 'consoleNext']]) {
        const mag = Math.hypot(axes[ix] || 0, axes[iy] || 0);
        if (edge(btn)) this.click[btn] = { t: now, moved: mag > this.clickTravel };
        else if (pressed(btn) && this.click[btn] && mag > this.clickTravel) this.click[btn].moved = true;
        if (release(btn) && this.click[btn]) { const c = this.click[btn]; if (!c.moved && now - c.t <= this.clickMax) out.push(act); delete this.click[btn]; }
      }
      // View + Menu together = home (fallback when Game Bar/Steam owns the Guide button).
      if (pressed(B.VIEW) && pressed(B.MENU) && (edge(B.VIEW) || edge(B.MENU))) { out.push('home'); this.comboUsed = true; }
      if (release(B.MENU)) { if (!this.comboUsed) out.push('options'); }
      if (release(B.VIEW)) { if (!this.comboUsed) out.push('tabToggle'); }
      if (!pressed(B.VIEW) && !pressed(B.MENU)) this.comboUsed = false;

      for (let i = 0; i < 17; i++) this.prev[i] = pressed(i);
      return out;
    }
  }

  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'select', NumpadEnter: 'select', ' ': 'select',
    Escape: 'back', Backspace: 'back', BrowserBack: 'back',
    Tab: 'tabToggle', q: 'tabPrev', Q: 'tabPrev', e: 'tabNext', E: 'tabNext',
    ContextMenu: 'options', o: 'options', O: 'options', F10: 'options',
    Home: 'home', h: 'home', H: 'home',
    // Not used anywhere else in the menu: switch to the previous / next console menu.
    PageUp: 'consolePrev', PageDown: 'consoleNext',
  };
  function keyAction(ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return null;
    if (ev.key === 'Tab' && ev.shiftKey) return 'tabToggle';
    return KEYMAP[ev.key] || null;
  }

  const api = { PadMapper, keyAction, BUTTONS: B };
  if (typeof module !== 'undefined') module.exports = api; else root.INPUT = api;
})(typeof window !== 'undefined' ? window : globalThis);
