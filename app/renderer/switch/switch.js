/* Nintendo Switch style HOME Menu. Original code and drawings; no Nintendo artwork, icons, fonts or
   sounds are used or bundled. Layout values were measured on 1080p captures of the HOME Menu
   (system 20.x, the layout current firmware still uses) and are in 1920x1080 units; see
   reference/switch/SPEC.md (not in the package). */
(function (root) {
  'use strict';
  const NAV = root.NSWNAV;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cssUrl = (u) => (u ? `url("${String(u).replace(/"/g, '%22')}")` : '');
  const svg = (body, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const S = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';

  // ---- original line glyphs for the round buttons (drawn for this project) ----
  const IC = {
    library: svg(`<rect x="9" y="9" width="12.5" height="12.5" rx="2.5" fill="currentColor"/><rect x="26.5" y="9" width="12.5" height="12.5" rx="2.5" fill="currentColor"/><rect x="9" y="26.5" width="12.5" height="12.5" rx="2.5" fill="currentColor"/><rect x="26.5" y="26.5" width="12.5" height="12.5" rx="2.5" fill="currentColor"/>`),
    stats: svg(`<path ${S} d="M8 40h32"/><rect ${S} x="11" y="24" width="6" height="12"/><rect ${S} x="21" y="14" width="6" height="22"/><rect ${S} x="31" y="19" width="6" height="17"/>`),
    add: svg(`<rect ${S} x="8" y="8" width="32" height="32" rx="5"/><path ${S} d="M24 15v18M15 24h18"/>`),
    desktop: svg(`<rect ${S} x="7" y="10" width="34" height="22" rx="2"/><path ${S} d="M17 39h14M24 32v7"/>`),
    consoles: svg(`<path ${S} d="M10 18h26l-6-6M38 30H12l6 6"/>`),
    manage: svg(`<path ${S} d="M16 13h23M16 24h23M16 35h23"/><circle cx="10" cy="13" r="2" fill="currentColor"/><circle cx="10" cy="24" r="2" fill="currentColor"/><circle cx="10" cy="35" r="2" fill="currentColor"/>`),
    updates: svg(`<rect ${S} x="13" y="7" width="22" height="34" rx="2.5"/><path ${S} d="M24 15v13M19 23l5 5 5-5"/><path ${S} d="M19 34h10"/>`),
    settings: svg(`<circle ${S} cx="24" cy="24" r="8"/><path ${S} d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M11.3 36.7l4.2-4.2M32.5 15.5l4.2-4.2"/>`),
    power: svg(`<path ${S} d="M24 8v15"/><path ${S} d="M15 14a13 13 0 1 0 18 0"/>`),
    all: svg(`<rect x="10" y="10" width="10" height="10" rx="2" fill="currentColor"/><rect x="28" y="10" width="10" height="10" rx="2" fill="currentColor"/><rect x="10" y="28" width="10" height="10" rx="2" fill="currentColor"/><rect x="28" y="28" width="10" height="10" rx="2" fill="currentColor"/>`),
    wifi: svg(`<path d="M4 17a28 28 0 0 1 40 0l-4 4a22 22 0 0 0-32 0z" fill="currentColor"/><path d="M11 24a18 18 0 0 1 26 0l-4 4a12 12 0 0 0-18 0z" fill="currentColor"/><path d="M18 31a8 8 0 0 1 12 0l-6 7z" fill="currentColor"/>`),
    pad: svg(`<path fill="currentColor" fill-rule="evenodd" d="M16 10h16c7 0 10 5 11.5 11l2.4 10c1.3 6-5 10-9.6 5.6L32 32H16l-4.3 4.6C7.1 41 .8 37 2.1 31l2.4-10C6 15 9 10 16 10zm-1 6v4h-4v4h4v4h4v-4h4v-4h-4v-4zm18 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm-4.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm9 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM33 25a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>`),
  };

  // Round system buttons, left to right, in the console's slots and colours.
  const BUTTONS = [
    { kind: 'library', icon: 'library', label: 'library', fill: true, color: 'var(--n-red)' },
    { kind: 'stats', icon: 'stats', label: 'stats', color: 'var(--n-green)' },
    { kind: 'add', icon: 'add', label: 'addGame', color: 'var(--n-orange)' },
    { kind: 'desktop', icon: 'desktop', label: 'desktop', color: 'var(--n-blue)' },
    { kind: 'consoles', icon: 'consoles', label: 'nswConsoles', color: 'var(--n-teal)' },
    { kind: 'manage', icon: 'manage', label: 'manageGames', color: 'var(--n-glyph)' },
    { kind: 'updates', icon: 'updates', label: 'updates', color: 'var(--n-glyph)' },
    { kind: 'settings', icon: 'settings', label: 'settings', color: 'var(--n-glyph)' },
    { kind: 'power', icon: 'power', label: 'power', color: 'var(--n-glyph)' },
  ];

  // Face button glyphs in the Switch manner: a filled disc with the letter cut out (original drawing).
  function glyphNs(k, mode) {
    if (mode === 'keyboard') {
      const key = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', menu: '+', options: 'O', view: 'Tab', home: 'Home' }[k] || k;
      return `<span class="kbd">${esc(key)}</span>`;
    }
    const letter = k === 'menu' || k === 'options' || k === '+' ? null : String(k).slice(0, 1).toUpperCase();
    if (!letter) return '<svg viewBox="0 0 40 40" class="n-g"><circle cx="20" cy="20" r="19" fill="currentColor"/><path d="M20 11v18M11 20h18" stroke="var(--n-bg)" stroke-width="4.4"/></svg>';
    return `<svg viewBox="0 0 40 40" class="n-g"><circle cx="20" cy="20" r="19" fill="currentColor"/><text x="20" y="27.6" text-anchor="middle" font-size="21" font-weight="700" fill="var(--n-bg)" font-family="var(--n-font)">${esc(letter)}</text></svg>`;
  }

  // ---- layout, 1920x1080 units ----
  const L = {
    tileX: 161, tileY: 291, tile: 384, stride: 405, visible: 4,
    iconY: 762, icon: 108, iconStride: 135, avatarX: 91, avatarY: 52, avatar: 91,
  };
  const MAX_ROW = 12;   // like the console: twelve recent titles, then "all software"

  function hueOf(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.codePointAt(0)) % 360; return h; }

  class Home {
    constructor(opts) {
      this.o = opts;   // { el, t, sound, glyphMode(), action(kind, payload), lang(), running(), theme() }
      this.el = opts.el; this.nav = null; this.forcedScene = null; this.pads = []; this.badges = {};
      this.el.innerHTML = '<div class="n-bg"></div><div class="n-theme"><div class="nt"></div><div class="nt"></div></div>'
        + '<div class="n-users"></div><div class="n-status"><span class="n-clock"></span><span class="n-wifi"></span><span class="n-bat"><span class="pct"></span><span class="cell"><i></i></span></span></div>'
        + '<div class="n-title"></div><div class="n-row"><div class="n-track"></div></div><div class="n-empty"></div>'
        + '<div class="n-icons"></div><div class="n-label"></div><div class="n-ring"></div>'
        + '<div class="n-sep"></div><div class="n-pads"></div><div class="n-hints"></div>';
      this.q = (s) => this.el.querySelector(s);
      this.clock(); this.clockT = setInterval(() => this.clock(), 5000);
      this.battery();
    }
    t(k) { return this.o.t(k); }

    build(data, scene) {
      this.data = data; this.forcedScene = scene || null;
      const sc = scene || {};
      const games = sc.tiles ? sc.tiles.map((x, i) => ({ id: `scene${i}`, title: x.title || '', art: { icon: x.image }, _scene: x })) : (data.games || []).filter((g) => g._console === 'switch')
        .slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (a.order ?? 0) - (b.order ?? 0));
      this.allCount = games.length;
      this.tiles = games.slice(0, MAX_ROW).map((g) => ({ kind: 'game', game: g }));
      if (games.length > MAX_ROW) this.tiles.push({ kind: 'all' });
      this.users = sc.users ? sc.users.map((u) => ({ kind: 'user', image: u.image })) : [{ kind: 'user' }];
      const keepId = this.nav && this.tiles[this.nav.i.games] && this.tiles[this.nav.i.games].game ? this.tiles[this.nav.i.games].game.id : null;
      const ctx = this.ctx();
      if (!this.nav) this.nav = NAV.initial(ctx);
      if (keepId) { const k = this.tiles.findIndex((x) => x.game && x.game.id === keepId); if (k >= 0) this.nav.i.games = k; }
      if (sc.focus) { this.nav.row = sc.focus.row; this.nav.i[sc.focus.row] = sc.focus.index; }
      this.nav = NAV.clamp(this.nav, ctx);
      this.render();
    }
    ctx() { return { users: this.users.length, games: this.tiles.length, icons: BUTTONS.length, visible: L.visible }; }

    render() {
      const sc = this.forcedScene || {};
      const st = (this.data && this.data.settings) || {};
      this.el.dataset.theme = (sc.theme || st.switchTheme) === 'black' ? 'black' : 'white';
      // users
      const av = sc.avatar || (this.data && this.data.user && this.data.user.avatar);
      const name = sc.username || st.username || 'Oyuncu';
      this.q('.n-users').innerHTML = this.users.map((u, i) => { const pic = u.image || (i === 0 ? av : null); return `<div class="n-av" data-i="${i}" style="left:${i * 108}px;${pic ? `background-image:${esc(cssUrl(pic))}` : ''}">${pic ? '' : esc(String(name).slice(0, 1).toUpperCase())}</div>`; }).join('');
      this.q('.n-users').querySelectorAll('.n-av').forEach((e) => e.addEventListener('mousedown', (ev) => { ev.preventDefault(); this.mouse('user', +e.dataset.i); }));
      // software row
      const tr = this.q('.n-track'); tr.innerHTML = '';
      this.tiles.forEach((x, i) => {
        const d = document.createElement('div'); d.className = 'n-tl'; d.dataset.i = i; d.style.left = `${i * L.stride}px`;
        if (x.kind === 'all') { d.classList.add('all'); d.innerHTML = `<div class="ic">${IC.all}</div><div class="lb">${esc(this.t('nswAllSoftware'))}</div>`; }
        else {
          const g = x.game; const art = g.art || {}; const pic = art.icon || art.cover || art.background;
          if (pic) { d.style.backgroundImage = cssUrl(pic); if (!art.icon && art.cover) d.classList.add('cover'); }
          else if (art.exeIcon) { d.classList.add('exe'); d.style.setProperty('--h', hueOf(g.title || g.id)); d.innerHTML = `<div class="exeic" style="background-image:${esc(cssUrl(art.exeIcon))}"></div>`; }
          else { d.classList.add('plain'); d.style.setProperty('--h', hueOf(g.title || g.id)); d.innerHTML = `<div class="nm">${esc(g.title)}</div>`; }
          if (this.o.running && this.o.running() === g.id) d.insertAdjacentHTML('beforeend', '<i class="run"></i>');
        }
        d.addEventListener('mousedown', (e) => { e.preventDefault(); this.mouse('games', i); });
        tr.appendChild(d);
      });
      const empty = this.q('.n-empty');
      if (!this.tiles.length) {
        empty.innerHTML = `<div class="msg">${esc(sc.emptyText || this.t('nswEmpty'))}</div>${[0, 1, 2, 3, 4].map((i) => `<div class="ph" style="left:${L.tileX + i * L.stride}px"></div>`).join('')}`;
        empty.classList.add('on');
      } else { empty.innerHTML = ''; empty.classList.remove('on'); }
      // round buttons
      const n = BUTTONS.length; const x0 = Math.round((1920 - (n * L.icon + (n - 1) * (L.iconStride - L.icon))) / 2);
      this.iconX = x0;
      this.q('.n-icons').innerHTML = BUTTONS.map((b, i) => `<div class="n-ib${b.fill ? ' fill' : ''}${this.badges[b.kind] ? ' dot' : ''}" data-i="${i}" style="left:${x0 + i * L.iconStride}px;--c:${b.color}"><div class="gl">${IC[b.icon]}</div></div>`).join('');
      this.q('.n-icons').querySelectorAll('.n-ib').forEach((e) => e.addEventListener('mousedown', (ev) => { ev.preventDefault(); this.mouse('icons', +e.dataset.i); }));
      this.renderPads(); this.clock(); this.battery();
      this.layout(true);
    }
    setBadge(kind, on) { if (!!this.badges[kind] === !!on) return; this.badges[kind] = !!on; const e = this.q(`.n-icons .n-ib[data-i="${BUTTONS.findIndex((b) => b.kind === kind)}"]`); if (e) e.classList.toggle('dot', !!on); }
    setPads(pads) { this.pads = Array.isArray(pads) ? pads : []; this.renderPads(); }
    renderPads() {
      const sc = this.forcedScene || {};
      const pads = sc.pads != null ? Array.from({ length: sc.pads }, (_, i) => ({ i })) : this.pads;
      // one pad drawn per connected controller; a keyboard-only PC shows the plain pad outline
      const n = Math.max(1, Math.min(4, pads.length));
      this.q('.n-pads').innerHTML = Array.from({ length: n }, (_, k) => `<span class="pd${pads.length ? '' : ' none'}">${IC.pad}<i class="leds">${[0, 1, 2, 3].map((j) => `<b class="${j === k ? 'on' : ''}"></b>`).join('')}</i></span>`).join('');
    }
    clock() {
      const sc = this.forcedScene || {};
      const lang = this.o.lang ? this.o.lang() : 'tr';
      const txt = sc.clock || new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: (this.data && this.data.settings && this.data.settings.timeZone) || undefined }).format(new Date());
      const c = this.q('.n-clock'); if (c && c.textContent !== txt) c.textContent = txt;
      const w = this.q('.n-wifi'); if (w) { const on = sc.wifi != null ? sc.wifi : navigator.onLine; w.innerHTML = IC.wifi; w.classList.toggle('off', !on); }
    }
    // The PC's own battery (laptops); desktops have none and show no battery, like a docked console.
    async battery() {
      const box = this.q('.n-bat'); if (!box) return;
      const tok = (this.batTok = (this.batTok || 0) + 1);
      const show = (lvl, chg) => { if (tok !== this.batTok) return; if (lvl == null) { box.classList.remove('on'); return; } box.classList.add('on'); box.querySelector('.pct').textContent = `${Math.round(lvl * 100)}%`; box.querySelector('.cell i').style.width = `${Math.max(6, Math.round(lvl * 100))}%`; box.classList.toggle('chg', !!chg); box.classList.toggle('low', lvl <= 0.15 && !chg); };
      const sc = this.forcedScene || {};
      if (sc.battery != null) { show(sc.battery, sc.charging); return; }
      try {
        if (!navigator.getBattery) { show(null); return; }
        const b = await navigator.getBattery(); if (tok !== this.batTok) return;
        const upd = () => show(b.charging && b.level >= 0.999 && b.chargingTime === 0 && b.dischargingTime === Infinity ? null : b.level, b.charging);
        b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); upd();
      } catch { show(null); }
    }

    focusEl() {
      const r = this.nav.row; const i = this.nav.i[r];
      if (r === 'user') return { el: this.q(`.n-users .n-av[data-i="${i}"]`), kind: 'user' };
      if (r === 'games') return { el: this.q(`.n-track .n-tl[data-i="${i}"]`), kind: 'tile' };
      return { el: this.q(`.n-icons .n-ib[data-i="${i}"]`), kind: 'icon' };
    }
    layout(instant) {
      const tr = this.q('.n-track');
      if (instant) tr.style.transition = 'none';
      tr.style.transform = `translateX(${-this.nav.scroll * L.stride}px)`;
      if (instant) { void tr.offsetWidth; tr.style.transition = ''; }
      this.el.querySelectorAll('.focus').forEach((e) => e.classList.remove('focus'));
      const f = this.focusEl(); const ring = this.q('.n-ring'); const label = this.q('.n-label'); const title = this.q('.n-title');
      ring.className = 'n-ring'; label.className = 'n-label'; title.className = 'n-title';
      if (f.el) {
        f.el.classList.add('focus');
        if (instant) ring.style.transition = 'none';
        if (f.kind === 'tile') {
          const i = this.nav.i.games; const x = L.tileX + (i - this.nav.scroll) * L.stride;
          Object.assign(ring.style, { left: `${x - 15}px`, top: `${L.tileY - 15}px`, width: `${L.tile + 30}px`, height: `${L.tile + 30}px` });
          ring.classList.add('on', 'sq');
          const tl = this.tiles[i]; title.textContent = tl.kind === 'all' ? this.t('nswAllSoftware') : tl.game.title;
          // centred over the tile, kept inside the screen margins (long names end in an ellipsis)
          title.style.left = '0px'; title.style.maxWidth = '1738px'; const w = Math.min(title.scrollWidth, 1738);
          title.style.left = `${Math.max(91, Math.min(1829 - w, Math.round(x + L.tile / 2 - w / 2)))}px`; title.classList.add('on');
        } else if (f.kind === 'icon') {
          const i = this.nav.i.icons; const x = this.iconX + i * L.iconStride;
          Object.assign(ring.style, { left: `${x - 12}px`, top: `${L.iconY - 12}px`, width: `${L.icon + 24}px`, height: `${L.icon + 24}px` });
          ring.classList.add('on', 'rd');
          label.textContent = this.t(BUTTONS[i].label); label.style.left = `${x + L.icon / 2}px`; label.style.top = `${L.iconY + L.icon + 16}px`; label.classList.add('on');
        } else {
          const x = L.avatarX + this.nav.i.user * 108; const e = Math.round(L.avatar * 0.05) + 4; Object.assign(ring.style, { left: `${x - e}px`, top: `${L.avatarY - e}px`, width: `${L.avatar + 2 * e}px`, height: `${L.avatar + 2 * e}px` });
          ring.classList.add('on', 'rd', 'av');
          const st = (this.data && this.data.settings) || {};
          label.textContent = (this.forcedScene && this.forcedScene.userLabel) || st.username || 'Oyuncu'; label.style.left = `${x + L.avatar / 2}px`; label.style.top = `${L.avatarY + L.avatar + 8}px`; label.classList.add('on', 'up');
        }
        if (instant) { void ring.offsetWidth; ring.style.transition = ''; }
      }
      this.hints();
      if (this.o.onFocus) this.o.onFocus();
      this.applyTheme(instant);
    }
    hints() {
      const mode = this.o.glyphMode ? this.o.glyphMode() : 'pad';
      const sc = this.forcedScene || {};
      const list = sc.hints || (this.nav.row === 'games' && this.tiles[this.nav.i.games] && this.tiles[this.nav.i.games].kind === 'game' ? [['menu', this.t('options')], ['A', this.t('nswStart')]] : [['A', this.t('nswOk')]]);
      this.q('.n-hints').innerHTML = list.map(([k, l]) => `<span class="n-h">${glyphNs(k, mode)}<span>${esc(l)}</span></span>`).join('');
    }

    // The focused game's own picture behind the HOME Menu, very soft, like a theme (only when the
    // game theme setting is on). Other rows keep the last game's picture.
    applyTheme(instant) {
      clearTimeout(this.themeT);
      const on = this.o.theme && this.o.theme() && !this.forcedScene;
      const g = this.currentGame();
      if (!on) { this.setTheme(null, true); return; }
      if (!g) return;
      const art = g.art || {}; const pic = art.background || art.cover || null;
      if (!pic) { this.setTheme(null); return; }
      this.themeT = setTimeout(() => this.setTheme({ id: g.id, pic }), instant ? 0 : 700);
    }
    setTheme(th, instant) {
      const key = th ? `${th.id}|${th.pic}` : null; if (key === this.themeKey) return; this.themeKey = key;
      const box = this.q('.n-theme'); const [a, b] = box.querySelectorAll('.nt');
      const front = a.classList.contains('on') ? a : b, back = front === a ? b : a;
      front.classList.remove('on');
      if (!th) { box.classList.remove('on'); return; }
      back.style.backgroundImage = cssUrl(th.pic);
      if (instant) { back.style.transition = 'none'; void back.offsetWidth; }
      back.classList.add('on'); box.classList.add('on');
      if (instant) { void back.offsetWidth; back.style.transition = ''; }
    }
    currentGame() { if (!this.nav || this.nav.row !== 'games') return null; const x = this.tiles[this.nav.i.games]; return x && x.kind === 'game' && !this.forcedScene ? x.game : null; }
    current() {
      if (!this.nav) return null;
      const r = this.nav.row; const i = this.nav.i[r];
      if (r === 'games') { const x = this.tiles[i]; return { row: r, index: i, kind: x ? x.kind : null, game: x && x.game }; }
      if (r === 'icons') return { row: r, index: i, kind: BUTTONS[i].kind };
      return { row: r, index: i, kind: 'user' };
    }
    mouse(row, i) {
      if (this.nav.row === row && this.nav.i[row] === i) { this.input('select'); return; }
      this.nav = { ...this.nav, row, i: { ...this.nav.i, [row]: i } };
      if (row === 'games') this.nav.scroll = NAV.scrollFor(i, this.nav.scroll, this.ctx());
      this.o.sound.play('focus'); this.layout(false);
    }
    input(a) {
      const { state, fx } = NAV.reduce(this.nav, a, this.ctx());
      this.nav = state;
      for (const f of fx) {
        if (f.type === 'focus') { this.o.sound.play('focus'); this.layout(false); }
        else if (f.type === 'bump') this.o.sound.play('bump');
        else if (f.type === 'activate') {
          if (f.row === 'games') { const x = this.tiles[f.index]; if (!x) continue; this.o.action(x.kind === 'all' ? 'library' : 'game', x); }
          else if (f.row === 'icons') this.o.action(BUTTONS[f.index].kind, {});
          else this.o.action('user', {});
        } else if (f.type === 'menu') { const x = this.tiles[f.index]; if (x && x.kind === 'game') this.o.action('menu', x); }
      }
      return true;
    }
  }

  root.NSW = { Home, glyphNs, IC, BUTTONS, L };
})(typeof window !== 'undefined' ? window : globalThis);
