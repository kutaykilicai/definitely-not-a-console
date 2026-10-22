// Console menus: which games belong to which menu, and the rules for switching between menus
// with up/down. Pure logic (no DOM) so it can be tested in Node.
(function (root) {
  // Order matters: "up" goes to the previous entry, "down" to the next one (wrapping).
  const CONSOLES = [
    { id: 'ps5', name: 'PlayStation 5', badges: /^(ps5|ps4|ps3|ps2|ps1|psp|psv|pc)?$/i },
    { id: 'x360', name: 'Xbox 360', badges: /^(x360|xbox ?360|xb360)$/i },
    { id: 'switch', name: 'Nintendo Switch', badges: /^(switch|nsw|ns|nintendo ?switch)$/i },
  ];
  const IDS = CONSOLES.map((c) => c.id);

  // Old entries have no "console" field: they stay in the PS5 menu. A badge such as "X360"
  // or an explicit console value moves a game to that menu.
  function consoleOf(g) {
    const c = String((g && g.console) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c) { if (IDS.includes(c)) return c; if (/^(xbox360|xb360)$/.test(c)) return 'x360'; if (/^(nsw|ns|nintendoswitch|switch1)$/.test(c)) return 'switch'; if (/^ps\d?$/.test(c)) return 'ps5'; }
    const b = String((g && g.badge) || '').trim();
    for (const k of CONSOLES) if (k.id !== 'ps5' && k.badges.test(b)) return k.id;
    return 'ps5';
  }
  function neighbour(cur, dir, list = IDS) {
    const i = Math.max(0, list.indexOf(cur));
    const j = dir === 'up' ? (i - 1 + list.length) % list.length : (i + 1) % list.length;
    return list[j];
  }
  const normalize = (v) => (IDS.includes(v) ? v : 'ps5');

  // Guards a switch against key/pad auto-repeat and double triggers. A switch needs a fresh
  // press: an up/down that arrives less than repeatGap ms after the previous up/down is a
  // repeat of a held direction. Nothing switches while an animation runs or during cooldown.
  class SwitchGuard {
    constructor(opts = {}) { this.repeatGap = opts.repeatGap ?? 170; this.cooldown = opts.cooldown ?? 140; this.last = -1e9; this.busyUntil = 0; }
    // Call for every up/down the menu receives. Returns true when this press may switch.
    press(now) { const fresh = now - this.last > this.repeatGap; this.last = now; return fresh && now >= this.busyUntil; }
    start(now, ms) { this.busyUntil = now + ms + this.cooldown; }
    busy(now) { return now < this.busyUntil; }
  }

  const api = { CONSOLES, IDS, consoleOf, neighbour, normalize, SwitchGuard };
  if (typeof module !== 'undefined') module.exports = api; else root.CONSOLES = api;
})(typeof window !== 'undefined' ? window : globalThis);
