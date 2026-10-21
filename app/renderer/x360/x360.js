/* Xbox 360 style dashboard view. Original code and drawings; no Microsoft artwork, fonts or
   sounds are used. Layout values come from reference/x360/SPEC.md (1920x1080 units). */
(function (root) {
  'use strict';
  const NAVX = root.X360NAV;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cssUrl = (u) => (u ? `url("${String(u).replace(/"/g, '%22')}")` : '');

  // ---- original line icons (white, drawn for this project) ----
  const svg = (body, vb = '0 0 72 72') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const IC = {
    disc: svg('<circle cx="36" cy="36" r="34" fill="currentColor"/><circle cx="36" cy="36" r="13" fill="var(--x-green)"/><circle cx="36" cy="36" r="6" fill="currentColor"/>'),
    pin: svg('<path fill="currentColor" transform="translate(36 35.7) scale(1.26) translate(-37.5 -34)" d="M44 4l24 24-6 3-9-1-12 12 1 11-5 5-11-11L10 63l-3 1 1-3 16-16L13 34l5-5 11 1 12-12-1-9z"/>'),
    clock: svg('<circle cx="34.7" cy="33.5" r="32.6" fill="none" stroke="currentColor" stroke-width="4.6"/><path d="M35.2 14.6v20.6h18" fill="none" stroke="currentColor" stroke-width="5"/>'),
    friends: svg('<g fill="currentColor"><circle cx="24" cy="19" r="11.5"/><path d="M6 37h36l-11 26h-14z"/><circle cx="72" cy="19" r="11.5"/><path d="M54 37h36l-11 26h-14z"/></g>', '0 0 96 72'),
    search: svg('<circle cx="40" cy="30" r="18" fill="none" stroke="currentColor" stroke-width="6"/><path d="M27 43L10 60" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>'),
    plus: svg('<path d="M36 8v56M8 36h56" stroke="currentColor" stroke-width="7"/>'),
    pad: svg('<path fill="currentColor" fill-rule="evenodd" d="M22 18h28c9 0 14 7 16 15l4 17c2 9-7 15-14 9l-7-7H23l-7 7c-7 6-16 0-14-9l4-17c2-8 7-15 16-15zm-2 10v6h-6v6h6v6h6v-6h6v-6h-6v-6zm31 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm-7 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm14 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm-7 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>'),
    gear: svg('<path fill="currentColor" fill-rule="evenodd" d="M31 4h10l2 9 6 3 8-5 7 7-5 8 3 6 9 2v10l-9 2-3 6 5 8-7 7-8-5-6 3-2 9H31l-2-9-6-3-8 5-7-7 5-8-3-6-9-2V31l9-2 3-6-5-8 7-7 8 5 6-3zm5 20a12 12 0 1 0 0 24 12 12 0 0 0 0-24z"/>'),
    power: svg('<path d="M36 6v28" stroke="currentColor" stroke-width="7"/><path d="M20 16a27 27 0 1 0 32 0" fill="none" stroke="currentColor" stroke-width="7"/>'),
    desktop: svg('<rect x="6" y="10" width="60" height="38" fill="none" stroke="currentColor" stroke-width="6"/><path d="M24 62h24M36 48v14" stroke="currentColor" stroke-width="6"/>'),
    grid: svg('<rect x="6" y="6" width="26" height="26" fill="currentColor"/><rect x="40" y="6" width="26" height="26" fill="currentColor"/><rect x="6" y="40" width="26" height="26" fill="currentColor"/><rect x="40" y="40" width="26" height="26" fill="currentColor"/>'),
    swap: svg('<path d="M14 26h40l-11-11M58 46H18l11 11" fill="none" stroke="currentColor" stroke-width="6"/>'),
    list: svg('<path d="M8 14h56M8 30h56M8 46h56M8 62h36" stroke="currentColor" stroke-width="6"/>'),
    exit: svg('<path d="M30 8H8v56h22" fill="none" stroke="currentColor" stroke-width="6"/><path d="M26 36h38M50 22l14 14-14 14" fill="none" stroke="currentColor" stroke-width="6"/>'),
  };

  // Xbox 360 style face button glyphs: a glossy coloured disc with a light letter (original drawing).
  // The guide button glyph: the sphere from the user's x360-logo.png when there is one.
  let HOME_MARK = null;
  const FACE = { A: ['#74ba3c', '#5a9c2e'], B: ['#e8503e', '#b42a1c'], X: ['#4592e4', '#2463b4'], Y: ['#f2c232', '#cc9410'] };
  function glyph360(k, mode) {
    if (mode === 'keyboard') {
      const key = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', menu: 'O', view: 'Tab', lb: 'Q', rb: 'E', home: 'Home' }[k] || k;
      return `<span class="kbd">${esc(key)}</span>`;
    }
    const c = FACE[k];
    if (c) {
      const id = `xg${k}`;
      return `<svg viewBox="0 0 40 40"><defs><radialGradient id="${id}" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient></defs><circle cx="20" cy="19" r="17.5" fill="url(#${id})"/><text x="21" y="27" text-anchor="middle" font-size="21" font-weight="700" fill="rgba(0,0,0,0.45)" font-family="Segoe UI, Selawik, sans-serif">${k}</text><text x="20" y="26" text-anchor="middle" font-size="21" font-weight="700" fill="#eef6ea" font-family="Segoe UI, Selawik, sans-serif">${k}</text></svg>`;
    }
    if (k === 'lb' || k === 'rb') return `<svg viewBox="0 0 58 40" style="width:58px"><rect x="1" y="8" width="56" height="24" rx="10" fill="#e8e8e8"/><text x="29" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#333" font-family="Segoe UI, Selawik, sans-serif">${k.toUpperCase()}</text></svg>`;
    if (k === 'home' && HOME_MARK) return `<img class="hm" src="${HOME_MARK}" alt="">`;
    if (k === 'home') return '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#d9d9d9"/><circle cx="20" cy="20" r="13" fill="#7cc13a"/><path d="M13 13l14 14M27 13L13 27" stroke="#f4f8ee" stroke-width="4"/></svg>';
    return '';
  }

  // ---- layout (panel-local x, absolute y; 1920x1080 units) ----
  const COL = 261, GAP = 6, ROW = 195, TOP = 267;
  const RY = [TOP, TOP + ROW + 6, TOP + 2 * (ROW + 6)];               // 267, 468, 669
  const HOME_SLOTS = {
    c1: { x: 0, y: RY[0], w: COL, h: ROW }, c2: { x: 0, y: RY[1], w: COL, h: ROW }, c3: { x: 0, y: RY[2], w: COL, h: ROW },
    feat: { x: 267, y: RY[0], w: 699, h: 2 * ROW + 6 },
    r1: { x: 972, y: RY[0], w: COL, h: ROW }, r2: { x: 972, y: RY[1], w: COL, h: ROW },
    b1: { x: 267, y: RY[2], w: 345, h: ROW }, b2: { x: 618, y: RY[2], w: 348, h: ROW }, b3: { x: 972, y: RY[2], w: COL, h: ROW },
  };
  const PANEL_GAP = 237;
  const HOME_LEFT = 348;

  function hueOf(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.codePointAt(0)) % 360; return h; }

  // Blurred, darkened backdrop for box art: the cover drawn at 48x48 and stretched by CSS. A live
  // CSS blur filter is much more costly while the menu animates (switch, panel slide).
  function softBackdrop(cv, url) {
    if (!cv || !url) return;
    const img = new Image();
    img.onload = () => {
      const s = document.createElement('canvas'); s.width = 12; s.height = 12;
      s.getContext('2d').drawImage(img, 0, 0, 12, 12);
      const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
      c.drawImage(s, 0, 0, 48, 48);
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, 0, 48, 48);
    };
    img.src = url;
  }

  class Dash {
    constructor(opts) {
      this.o = opts;               // { el, t, api, sound, glyphMode(), onConsole(dir), action(kind, payload), lang() }
      this.el = opts.el;
      this.panels = []; this.nav = NAVX.initial(1); this.forcedScene = null;
      this.el.innerHTML = '<div class="x-bg"></div><div class="x-track"></div><div class="x-tabs"></div><div class="x-user"><span class="gt"></span><span class="pic"></span></div><div class="x-hints"></div>';
      this.track = this.el.querySelector('.x-track'); this.tabsEl = this.el.querySelector('.x-tabs');
    }
    t(k) { return this.o.t(k); }

    // Build panels from the user's Xbox 360 games, or from a fixed scene (measurement fixture).
    build(data, scene) {
      this.data = data; this.forcedScene = scene || null;
      const panels = scene ? this.sceneFrom(scene) : this.panelsFrom(data);
      const keep = this.panels.length && this.panels[this.nav.panel] ? this.panels[this.nav.panel].id : null;
      this.panels = panels;
      const home = Math.max(0, panels.findIndex((p) => p.id === 'home'));
      const focus = {};
      if (this.nav && this.panels.length) Object.assign(focus, this.nav.focus);
      this.nav = NAVX.initial(home, scene ? {} : focus);
      const k = keep ? panels.findIndex((p) => p.id === keep) : -1;
      this.nav.panel = k >= 0 ? k : (scene && scene.panel != null ? scene.panel : home);
      if (scene && scene.focus != null) this.nav.focus[this.nav.panel] = scene.focus;
      for (const p in this.nav.focus) if (!this.panels[p] || !this.panels[p].tiles[this.nav.focus[p]]) delete this.nav.focus[p];
      this.render();
    }

    gamesOf(data) {
      const list = (data.games || []).filter((g) => g._console === 'x360');
      return list.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (a.order ?? 0) - (b.order ?? 0));
    }

    gameTile(g, slot) {
      const art = g.art || {};
                  const tile = { ...slot, kind: 'game', game: g, label: g.title, running: this.o.running() === g.id };
      if (art.background) { tile.style = 'art'; tile.image = art.background; }
      else if (art.cover || art.icon || art.exeIcon) {
        // box art (portrait cover) or the program icon, on a colour from the title
        tile.style = 'boxart'; tile.icon = art.cover || art.icon || art.exeIcon; tile.small = !art.cover; tile.hue = hueOf(g.title || g.id);
      }
      else { tile.style = 'green'; tile.icon = 'pad'; }
      return tile;
    }
    sys(kind, slot) {
      const T = (k) => this.t(k);
      const def = {
        add: { icon: 'plus', label: T('addGame') }, library: { icon: 'pin', label: T('x360MyGames') }, recent: { icon: 'clock', label: T('x360Recent') },
        ps5: { icon: 'swap', label: T('x360ToPs5') }, desktop: { icon: 'desktop', label: T('desktop') }, settings: { icon: 'gear', label: T('settings') },
        power: { icon: 'power', label: T('power') }, manage: { icon: 'list', label: T('manageGames') }, search: { icon: 'search', label: T('x360Search'), style: 'dark' },
        exit: { icon: 'exit', label: T('exitMenu') }, allgames: { icon: 'grid', label: T('x360AllGames') },
      }[kind] || { icon: 'grid', label: kind };
      return { ...slot, kind, style: def.style || 'green', icon: def.icon, label: def.label };
    }

    panelsFrom(data) {
      const games = this.gamesOf(data);
      const S = HOME_SLOTS;
      const home = { id: 'home', label: this.t('x360TabHome'), width: 1233, tiles: [] };
      home.tiles.push(this.sys('add', S.c1), this.sys('library', S.c2), this.sys('recent', S.c3));
      const slots = ['feat', 'r1', 'r2', 'b1', 'b2', 'b3'];
      const fill = ['ps5', 'desktop', 'settings', 'power', 'manage', 'exit'];
      const gs = games.slice(0, 6);
      slots.forEach((s, i) => {
        if (gs[i]) home.tiles.push(this.gameTile(gs[i], S[s]));
        else if (i === 0) home.tiles.push({ ...this.sys('add', S[s]), label: this.t('x360AddFirst') });
        else home.tiles.push(this.sys(fill.shift(), S[s]));
      });
      home.defaultFocus = 3;   // the featured tile (the most recent game)
      // search: one dark tile, like the console's search pivot
      const search = { id: 'search', label: this.t('x360TabSearch'), width: COL, tiles: [this.sys('search', { x: 0, y: RY[1], w: COL, h: ROW })] };
      // games: every Xbox 360 game, three rows, then "add"
      const gt = []; const all = [...games];
      all.forEach((g, i) => { const c = Math.floor(i / 3), r = i % 3; gt.push(this.gameTile(g, { x: c * (COL + GAP), y: RY[r], w: COL, h: ROW })); });
      const n = all.length; gt.push(this.sys('add', { x: Math.floor(n / 3) * (COL + GAP), y: RY[n % 3], w: COL, h: ROW }));
      const gamesP = { id: 'games', label: this.t('x360TabGames'), width: (Math.floor(n / 3) + 1) * (COL + GAP) - GAP, tiles: gt };
      const apps = { id: 'apps', label: this.t('x360TabApps'), width: 2 * COL + GAP, tiles: [
        this.sys('ps5', { x: 0, y: RY[0], w: COL, h: ROW }), this.sys('desktop', { x: COL + GAP, y: RY[0], w: COL, h: ROW }),
        this.sys('allgames', { x: 0, y: RY[1], w: COL, h: ROW }), this.sys('manage', { x: COL + GAP, y: RY[1], w: COL, h: ROW }),
      ] };
      const settings = { id: 'settings', label: this.t('settings').toLocaleLowerCase(this.o.lang()), width: 2 * COL + GAP, tiles: [
        this.sys('settings', { x: 0, y: RY[0], w: COL, h: ROW }), this.sys('power', { x: COL + GAP, y: RY[0], w: COL, h: ROW }),
        this.sys('exit', { x: 0, y: RY[1], w: COL, h: ROW }),
      ] };
      return [search, home, gamesP, apps, settings];
    }

    // A fixed scene for the reference comparison: panels with explicit tiles (see tools/x360).
    sceneFrom(sc) {
      return sc.panels.map((p) => ({ id: p.id, label: p.label, width: p.width, left: p.left, defaultFocus: p.defaultFocus, extras: p.extras || [], tiles: p.tiles.map((t) => ({ ...t })) }));
    }

    panelX(i) {
      // the current panel's left edge sits at HOME_LEFT; neighbours keep PANEL_GAP between them
      const xs = []; let x = 0;
      this.panels.forEach((p, k) => { xs[k] = p.left != null ? p.left : x; x = xs[k] + p.width + PANEL_GAP; });
      return xs[i];
    }

    render() {
      const tr = this.track; tr.innerHTML = '';
      this.panels.forEach((p, i) => {
        const pe = document.createElement('div'); pe.className = 'x-panel'; pe.dataset.p = i;
        pe.style.left = `${this.panelX(i)}px`; pe.style.width = `${p.width}px`;
        p.tiles.forEach((t, k) => pe.appendChild(this.tileEl(t, i, k)));
        (p.extras || []).forEach((x) => pe.appendChild(this.extraEl(x)));
        tr.appendChild(pe);
      });
      const sc = this.forcedScene;
      this.tabsEl.innerHTML = sc && sc.tabs ? sc.tabs.map((l, i) => `<div class="x-tab" data-t="${i}">${esc(l)}</div>`).join('')
        : this.panels.map((p, i) => `<div class="x-tab" data-p="${i}">${esc(p.label)}</div>`).join('');
      this.tabsEl.querySelectorAll('.x-tab[data-p]').forEach((e) => e.addEventListener('click', () => this.goPanel(+e.dataset.p)));
      this.renderUser(); this.hints();
      this.layout(true);
    }
    extraEl(x) {
      const d = document.createElement('div');
      if (x.kind === 'caption') { d.className = 'x-cap'; d.textContent = x.text; }
      else if (x.kind === 'bubble') { d.className = 'x-bubble'; d.textContent = x.text; if (x.tail != null) d.style.setProperty('--tail', `${x.tail}px`); }
      Object.assign(d.style, { left: `${x.x}px`, top: `${x.y}px` }, x.w ? { width: `${x.w}px` } : {}, x.h ? { height: `${x.h}px` } : {});
      return d;
    }
    tileEl(t, pi, k) {
      const d = document.createElement('div');
      d.className = `x-tile ${t.style || 'green'}`; d.dataset.k = k;
      Object.assign(d.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` });
      if (t.color) d.style.backgroundColor = t.color;
      let html = '';
      if (t.style === 'art') { d.style.backgroundImage = cssUrl(t.image); if (t.label) html += '<div class="strip"></div>'; }
      else if (t.style === 'boxart') {
        d.style.setProperty('--h1', `hsl(${t.hue} 45% 34%)`); d.style.setProperty('--h2', `hsl(${(t.hue + 30) % 360} 50% 14%)`);
        const bg = t.small ? '' : '<canvas class="boxbg" width="48" height="48"></canvas>';
        html += `${bg}<div class="boxic" style="background-image:${esc(cssUrl(t.icon))}"></div><div class="strip"></div>`; d.classList.add('art');
        if (t.w < 400) d.classList.add('sm');
        if (t.small) d.classList.add('icon');
      } else if (t.icon && IC[t.icon]) html += t.ic ? `<div class="ic at" style="left:${t.ic[0]}px;top:${t.ic[1]}px;width:${t.ic[2]}px;height:${t.ic[3] || t.ic[2]}px">${IC[t.icon]}</div>` : `<div class="ic">${IC[t.icon]}</div>`;
      if (t.label) html += `<div class="lb">${esc(t.label)}</div>`;
      if (t.running) html += '<i class="run"></i>';
      d.innerHTML = html;
      if (t.style === 'boxart' && !t.small) softBackdrop(d.querySelector('.boxbg'), t.icon);
      d.addEventListener('mousedown', (e) => { e.preventDefault(); this.mouse(pi, k); });
      return d;
    }
    renderUser() {
      const st = (this.data && this.data.settings) || {};
      const sc = this.forcedScene || {};
      this.el.querySelector('.gt').textContent = sc.gamertag || st.gamertag || st.username || 'Oyuncu';
      const pic = this.el.querySelector('.pic');
      const av = sc.avatar || (this.data && this.data.user && this.data.user.avatar);
      if (av) { pic.style.backgroundImage = cssUrl(av); pic.textContent = ''; } else { pic.style.backgroundImage = ''; pic.textContent = String(st.username || 'K').slice(0, 1).toUpperCase(); }
    }
    hints() {
      const h = this.el.querySelector('.x-hints');
      const mode = this.o.glyphMode();
      const p = this.panels[this.nav.panel];
      const list = (this.forcedScene && this.forcedScene.hints) || (p && p.id === 'home' ? [['A', this.t('select')]] : [['A', this.t('select')], ['B', this.t('back')]]);
      h.innerHTML = list.map(([k, l]) => `<span class="h">${glyph360(k, mode)}<span>${esc(l)}</span></span>`).join('');
    }

    focusIndex(p = this.nav.panel) { return NAVX.focusOf(this.nav, this.panels, p); }
    layout(instant) {
      const cur = this.nav.panel;
      const x = HOME_LEFT - this.panelX(cur);
      if (instant) this.track.style.transition = 'none';
      this.track.style.transform = `translateX(${x}px)`;
      this.track.querySelectorAll('.x-panel').forEach((pe) => {
        const i = +pe.dataset.p; if (instant) pe.style.transition = 'none';
        pe.classList.toggle('cur', i === cur);
        const f = i === cur ? this.focusIndex(i) : -1;
        pe.querySelectorAll('.x-tile').forEach((te) => { if (instant) te.style.transition = 'none'; te.classList.toggle('focus', +te.dataset.k === f); });
      });
      const sc = this.forcedScene;
      this.tabsEl.querySelectorAll('.x-tab').forEach((e) => e.classList.toggle('sel', sc && sc.tabs ? +e.dataset.t === sc.tabSel : +e.dataset.p === cur));
      // keep the selected tab on screen: shift the strip once it would pass x = 1700
      const sel = this.tabsEl.querySelector('.x-tab.sel');
      let shift = 0;
      if (sel) { const right = sel.offsetLeft + sel.offsetWidth + this.tabsEl.offsetLeft; if (right > 1700) shift = 1700 - right; }
      if (instant) this.tabsEl.style.transition = 'none';
      this.tabsEl.style.transform = shift ? `translateX(${shift}px)` : '';
      if (instant) {
        void this.track.offsetWidth;
        this.track.style.transition = ''; this.tabsEl.style.transition = '';
        this.track.querySelectorAll('.x-panel, .x-tile').forEach((e) => { e.style.transition = ''; });
      }
      this.hints();
    }

    goPanel(i) { if (i === this.nav.panel || !this.panels[i]) return; this.nav = { ...this.nav, panel: i }; this.o.sound.play('focus'); this.layout(false); }
    mouse(pi, k) {
      if (pi !== this.nav.panel) { this.nav.focus[pi] = k; this.goPanel(pi); return; }
      if (this.focusIndex() === k) { this.input('select'); return; }
      this.nav.focus[pi] = k; this.o.sound.play('focus'); this.layout(false);
    }

    // Returns true when the action was handled here.
    input(a) {
      const { state, fx } = NAVX.reduce(this.nav, a, this.panels);
      this.nav = state;
      for (const f of fx) {
        if (f.type === 'focus') { this.o.sound.play('focus'); this.layout(false); }
        else if (f.type === 'panel') { this.o.sound.play('focus'); this.layout(false); }
        else if (f.type === 'bump') this.o.sound.play('bump');
        else if (f.type === 'console') this.o.onConsole(f.dir);
        else if (f.type === 'home') this.layout(false);
        else if (f.type === 'activate') { const t = this.panels[f.panel].tiles[f.index]; if (t) this.o.action(t.kind, t); }
        else if (f.type === 'menu') { const t = this.panels[f.panel].tiles[f.index]; if (t && t.kind === 'game') this.o.action('menu', t); }
      }
      return true;
    }
    current() { const p = this.panels[this.nav.panel]; return p ? { panel: p.id, tile: p.tiles[this.focusIndex()] } : null; }
  }

  const setHomeMark = (url) => { HOME_MARK = url || null; };
  root.X360 = { Dash, glyph360, setHomeMark, IC, HOME_SLOTS, HOME_LEFT, PANEL_GAP };
})(typeof window !== 'undefined' ? window : globalThis);
