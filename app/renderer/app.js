/* PS5-style home screen. Original code. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const stage = $('#stage');
  const api = window.ps5;
  const NAV = window.NAV, INPUT = window.INPUT, SOUND = window.SOUND, ICONS = window.ICONS, glyph = window.glyph;
  const CONS = window.CONSOLES, X360 = window.X360, BOOT = window.BOOT;
  const qs = new URLSearchParams(location.search);
  const forced = qs.get('state') ? JSON.parse(qs.get('state')) : {};
  const CAPTURE = qs.get('capture') === '1';
  // screenshots stay as they were unless a test asks for the theme (forced.theme)
  const CAPTURE_PLAIN = CAPTURE && !forced.theme;
  // Set when the menu window is made again after (or during) a game: no intro, straight to home.
  const REOPEN = qs.get('reopen');

  let S = null;            // strings
  let data = null;         // init payload
  let items = [];          // current row items
  let nav = NAV.initial(0);
  let overlays = [];
  let inputMode = 'pad';
  let running = null;
  let paused = false;      // the running game is paused behind the menu (hold Esc / Xbox button)
  let launching = false;
  // Opened by holding Esc in a game: that Esc may still be down. Its auto-repeat must not act as
  // "back" here; the guard ends when Esc is released.
  let escGuard = REOPEN === 'home' ? performance.now() + 1500 : 0;
  const timers = {};
  let lastMouse = 0; let moveTimes = [];
  // Console menus: 'ps5' (this file's home screen) or 'x360' (renderer/x360). L3 / R3 on the pad
  // (PageUp / PageDown on the keyboard) switch between them; up/down navigate as before.
  let consoleId = 'ps5';
  let switching = false;
  const guard = new CONS.SwitchGuard();
  let xdash = null;
  // Console boot intros (boot.js): once per app start for each console menu, never after a game.
  const markPath = (ICONS.boot.match(/ d="([^"]+)"/) || [])[1];
  const bootP = new BOOT.Player($('#boot'), { sound: SOUND, markPath });
  // The focused game's own music (music.js); menu sounds duck it.
  const MUSIC = new window.ThemeMusic({ sound: SOUND, delayMs: forced.musicDelay != null ? forced.musicDelay : 700 });
  { const play = SOUND.play.bind(SOUND); SOUND.play = (n) => { play(n); if (n !== 'launch') MUSIC.duck(); }; }
  const cOf = (g) => CONS.consoleOf(g);
  // Treat the mouse as in use only after real movement (several events), not a single synthetic move.
  const mouseLive = () => moveTimes.length >= 3 && performance.now() - lastMouse < 400;

  // ---------- helpers ----------
  const t = (k, vars) => { let s = (S && S[k]) || k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const later = (name, ms, fn) => { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); };
  const cssUrl = (u) => (u ? `url("${u.replace(/"/g, '%22')}")` : '');
  const sw = () => parseFloat(stage.style.width) || 1920;

  function fit() {
    const z = window.innerHeight / 1080;
    stage.style.zoom = z;
    stage.style.width = `${Math.max(1920 * 0.75, window.innerWidth / z)}px`;
    // The Xbox 360 dashboard is drawn for 16:9; on other shapes its frame is centred in what is
    // visible (x360.css). 0 on 16:9, so nothing moves there.
    const vis = window.innerWidth / z, w = Math.max(1920 * 0.75, vis), xo = (Math.min(w, vis) - 1920) / 2;
    stage.style.setProperty('--xo', `${xo}px`); stage.style.setProperty('--xr', `${Math.max(xo, -96) + (w - vis)}px`); stage.style.setProperty('--xvis', `${vis}`);
  }
  window.addEventListener('resize', () => { fit(); layoutRow(); if (xdash) xdash.layout(true); });
  fit();

  function fmtDuration(sec) {
    if (!sec) return '0 ' + t('minutes');
    if (sec < 60) return t('lessThanMinute');
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h} ${t('hours')} ${m} ${t('minutes')}` : `${m} ${t('minutes')}`;
  }
  function fmtLast(ts) {
    if (!ts) return t('never');
    const tz = (data && data.settings.timeZone) || 'Europe/Istanbul';
    const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const diff = Math.round((Date.parse(day(new Date())) - Date.parse(day(new Date(ts)))) / 86400000);
    if (diff <= 0) return t('today');
    if (diff === 1) return t('yesterday');
    return t('daysAgo', { n: diff });
  }
  function clock() {
    const tz = (data && data.settings.timeZone) || 'Europe/Istanbul';
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const h = String(parseInt(p.find((x) => x.type === 'hour').value, 10)); const m = p.find((x) => x.type === 'minute').value;
    const el = $('.clock'); const txt = forced.clock || `${h}:${m}`;
    if (el.textContent !== txt) el.textContent = txt;
  }

  // ---------- items ----------
  function buildItems() {
    const tab = nav.tab;
    const games = data.games.filter((g) => cOf(g) === 'ps5' && (g.section || 'games') === (tab === 'games' ? 'games' : 'media'));
    const manual = data.settings.rowOrder === 'manual';
    games.sort((a, b) => (manual ? 0 : (b.lastPlayed || 0) - (a.lastPlayed || 0)) || (a.order ?? 0) - (b.order ?? 0));
    const list = games.map((g) => ({ kind: 'game', id: g.id, g }));
    if (tab === 'games') {
      if (data.settings.rowStart !== 'none') list.unshift({ kind: 'desktop', id: '_desktop' });
      list.push({ kind: 'add', id: '_add' });
      list.push({ kind: 'library', id: '_library' });
    }
    return list;
  }
  const libraryEmpty = () => !data.games.some((g) => cOf(g) === 'ps5' && (g.section || 'games') === 'games');
  const defaultRow = () => {
    if (nav.tab !== 'games') return 0;
    if (libraryEmpty()) return Math.max(0, items.findIndex((x) => x.kind === 'add'));
    return data.settings.rowStart !== 'none' && items.length > 2 ? 1 : 0;
  };
  // Tiles for games without art: a colour from the name, the program's own icon and the title.
  function hueOf(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.codePointAt(0)) % 360; return h; }
  function genTile(g) {
    const h = hueOf(g.title || g.id);
    const ic = g.art && g.art.exeIcon ? `<img class="exeic" src="${g.art.exeIcon}" alt="">` : '';
    return { style: `linear-gradient(150deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 18%))`, html: `${ic}<div class="ph">${esc(g.title)}</div>` };
  }
  const cur = () => items[nav.row];

  function renderRow() {
    const row = $('#row'); row.innerHTML = '';
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'tile'; d.dataset.i = i;
      if (it.kind === 'game') {
        if (it.g.art && it.g.art.icon) d.style.backgroundImage = cssUrl(it.g.art.icon);
        else { const gt = genTile(it.g); d.style.backgroundImage = gt.style; d.classList.add('gen'); d.innerHTML = gt.html; }
        if (!it.g.installed) d.classList.add('dim');
      } else {
        d.classList.add('sys');
        d.innerHTML = it.kind === 'desktop' ? ICONS.desktop : it.kind === 'add' ? ICONS.plus : ICONS.library;
      }
      d.addEventListener('mousedown', (e) => { e.preventDefault(); mouseTile(i); });
      row.appendChild(d);
    });
    $('#stage').classList.toggle('media', nav.tab === 'media');
    $('#stage').classList.toggle('empty', items.length === 0);
    $('#mediaempty').classList.toggle('on', items.length === 0);
    $('#stage').classList.toggle('firstrun', nav.tab === 'games' && libraryEmpty());
    layoutRow(true);
  }
  function layoutRow(instant) {
    const tiles = [...$('#row').children];
    const W = sw();
    tiles.forEach((d, i) => {
      const x = NAV.tileX(i, nav.row);
      if (instant) d.style.transition = 'none';
      d.style.left = `${x}px`;
      d.classList.toggle('big', i === nav.row);
      d.style.visibility = x > W + 20 || x < -200 ? 'hidden' : '';
      const it = items[i];
      let r = d.querySelector('.run');
      if (it && it.kind === 'game' && running === it.id) { if (!r) { r = document.createElement('i'); r.className = 'run'; d.appendChild(r); } r.classList.toggle('paused', paused); } else if (r) r.remove();
      if (instant) { void d.offsetWidth; d.style.transition = ''; }
    });
    const ring = $('#ring');
    if (instant) ring.style.transition = 'none';
    ring.style.left = `${NAV.tileX(nav.row, nav.row) - 6}px`;
    if (instant) { void ring.offsetWidth; ring.style.transition = ''; }
  }

  function updateRowTitle() {
    const it = cur();
    const rt = $('#rowtitle');
    rt.style.left = `${NAV.tileX(nav.row, nav.row) + 168 + 17}px`;
    if (!it) { rt.querySelector('.text').textContent = ''; rt.querySelector('.badge').textContent = ''; return; }
    rt.querySelector('.badge').textContent = it.kind === 'game' ? (it.g.badge || '') : '';
    rt.querySelector('.text').textContent = it.kind === 'game' ? it.g.title : it.kind === 'desktop' ? t('desktop') : it.kind === 'add' ? t('addGame') : t('library');
  }

  // ---------- hero / background ----------
  let bgKey = null; let bgFront = 'A';
  function bgFor(it) {
    if (!it) return null;
    if (it.kind === 'game') return (it.g.art && (it.g.art.background || it.g.art.icon)) || null;
    return null;
  }
  function setBackground(url, instant) {
    const key = url || '_none';
    if (key === bgKey) return;
    bgKey = key;
    const front = $(`#bg${bgFront}`); const backName = bgFront === 'A' ? 'B' : 'A'; const back = $(`#bg${backName}`);
    if (instant) {
      front.className = 'bgimg'; back.className = 'bgimg';
      if (url) { back.style.backgroundImage = cssUrl(url); back.style.transition = 'none'; back.classList.add('show'); void back.offsetWidth; back.style.transition = ''; bgFront = backName; }
      return;
    }
    front.classList.remove('show'); front.classList.add('out');
    const show = () => {
      if (bgKey !== key) return;
      if (!url) { bgFront = backName; return; }
      back.className = 'bgimg'; back.style.backgroundImage = cssUrl(url);
      void back.offsetWidth; back.classList.add('show'); bgFront = backName;
    };
    if (!url) { setTimeout(show, 120); return; }
    const img = new Image(); img.src = url;
    const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    Promise.all([ready, new Promise((r) => setTimeout(r, 150))]).then(show);
  }

  function renderHero() {
    const it = cur();
    const hero = $('#hero'); const logo = hero.querySelector('.logo'); const img = logo.querySelector('img');
    const btn = $('.btn.primary'); const round = $('.btn.round'); const side = $('#side'); const hub = $('#hub');
    if (!it) { hero.style.display = 'none'; $('#actions').style.display = 'none'; side.style.display = 'none'; hub.innerHTML = ''; return; }
    hero.style.display = ''; $('#actions').style.display = '';
    let title, desc, label, dimmed = false, logoUrl = null;
    if (it.kind === 'game') {
      const g = it.g;
      title = g.title; desc = g.description || ''; logoUrl = g.art && g.art.logo;
      label = running === g.id ? t('resume') : (data.settings.playLabel || t('play'));
      dimmed = !g.installed;
    } else if (it.kind === 'desktop') { title = t('desktop'); desc = data.settings.language === 'en' ? 'Minimise the menu and go to the Windows desktop.' : 'Menüyü küçültüp Windows masaüstüne geç.'; label = t('openDesktop'); }
    else if (it.kind === 'add') { const first = libraryEmpty(); title = first ? t('firstRunTitle') : t('addGame'); desc = first ? t('firstRunDesc') : t('addDesc'); label = t('add'); }
    else { title = t('library'); desc = data.settings.language === 'en' ? 'All your games in one place.' : 'Tüm oyunların tek bir yerde.'; label = t('open'); }
    logo.querySelector('.logotext').textContent = title;
    // Upper-casing follows the title's own language: "inFAMOUS" must not become "İNFAMOUS" under lang=tr.
    logo.querySelector('.logotext').lang = /[çğıİöşüÇĞÖŞÜ]/.test(title) ? 'tr' : 'en';
    if (logoUrl) { img.src = logoUrl; logo.classList.add('has'); img.onerror = () => logo.classList.remove('has'); } else { logo.classList.remove('has'); img.removeAttribute('src'); }
    const lt = logo.querySelector('.logotext');
    lt.style.fontSize = title.length > 26 ? '64px' : title.length > 16 ? '76px' : '84px';
    lt.style.lineHeight = title.length > 26 ? '64px' : title.length > 16 ? '74px' : '80px';
    hero.querySelector('.desc').textContent = desc;
    btn.querySelector('.label').textContent = label;
    btn.classList.toggle('dimmed', dimmed);
    round.innerHTML = ICONS.dots; round.style.display = it.kind === 'game' ? '' : 'none';

    if (it.kind === 'game') {
      const g = it.g;
      side.style.display = forced.side === false ? 'none' : '';
      const art = (g.art && (g.art.cover || g.art.icon)) || null;
      side.querySelector('.img').style.backgroundImage = art ? cssUrl(art) : genTile(g).style;
      side.querySelector('.tag').textContent = /ps4|ps3|ps2/i.test(g.badge || '') ? t('ps4Game').replace('PS4', g.badge.toUpperCase()) : t('pcGame');
      side.querySelector('.status').textContent = running === g.id ? (paused ? t('pausedStatus') : t('running')) : g.installed ? t('installed') : t('notFound');
      side.querySelector('.ic').innerHTML = ICONS.clock;
      const [l, r] = side.querySelectorAll('.col');
      l.querySelector('.k').textContent = t('playTime'); l.querySelector('.v').textContent = fmtDuration(g.playSeconds);
      r.querySelector('.k').textContent = t('lastPlayed'); r.querySelector('.v').textContent = fmtLast(g.lastPlayed);
      const cards = [
        { ic: ICONS.info, l: t('gameInfo'), v: [g.titleId || (g.titleIds && g.titleIds[0]) || '', srcLabel(g.source)].filter(Boolean).join(' · ') },
        { ic: ICONS.folder, l: t('fileLocation'), v: g.exe || t('notFound') },
        { ic: ICONS.edit, l: t('editGame'), v: g.losslessScaling ? 'Lossless Scaling' : '' },
      ];
      if (forced.hub) { cards.length = 0; forced.hub.forEach((l) => cards.push({ ic: ICONS.pad, l, v: '' })); }
      hub.innerHTML = cards.map((c, i) => `<div class="hcard" data-c="${i}"><div class="hi">${c.ic}</div><div class="hl">${esc(c.l)}</div><div class="hv">${esc(c.v)}</div></div>`).join('');
      hub.querySelectorAll('.hcard').forEach((c) => c.addEventListener('click', () => { nav.zone = 'cards'; nav.card = +c.dataset.c; applyZone(); dispatch('select'); }));
    } else { side.style.display = 'none'; hub.innerHTML = ''; }
    applyZone();
  }
  const srcLabel = (s) => ({ shortcut: t('srcShortcut'), seed: t('srcSeed'), missing: t('srcMissing') }[s] || (s ? t('srcManual') : ''));
  const baseName = (p) => String(p || '').split(/[\\/]/).pop();

  // ---------- theme: music and colour of the focused game ----------
  const themeOn = () => data && data.settings.theme !== false && !CAPTURE_PLAIN;
  function focusedGame() {
    if (consoleId === 'x360') { const c = xdash && xdash.current(); return c && c.tile && c.tile.kind === 'game' ? c.tile.game : null; }
    const it = cur(); return it && it.kind === 'game' ? it.g : null;
  }
  function themeFocus(now) {
    const g = focusedGame();
    MUSIC.focus(g ? g.id : null, g && g.theme ? g.theme.music : [], now);
    // PS5: a game without a picture of its own shows its icon as the background; the theme colour
    // tints it (games with their own picture look exactly as before).
    const tint = $('#scrim .s-tint');
    const own = g && g.art && g.art.background;
    const acc = themeOn() && g && !own && g.theme && g.theme.accent;
    if (tint) { if (acc) tint.style.setProperty('--gacc', acc); tint.classList.toggle('on', !!acc && consoleId === 'ps5'); }
  }
  function onFocusChanged(instant) {
    themeFocus(instant);
    layoutRow(instant);
    const ring = $('#ring'); const rt = $('#rowtitle');
    ring.classList.remove('on'); rt.classList.remove('on');
    const it = cur();
    const url = bgFor(it);
    const sameBg = (url || '_none') === bgKey;
    if (instant) {
      updateRowTitle(); renderHero(); setBackground(url, true);
      if (nav.zone === 'row' && it) { ring.classList.add('on'); rt.classList.add('on'); }
      return;
    }
    later('title', 195, () => { updateRowTitle(); if (nav.zone === 'row' && cur()) ring.classList.add('on'); if (cur()) rt.classList.add('on'); });
    if (sameBg) { later('hero', 200, () => renderHero()); return; }
    later('bg', 175, () => {
      $('#page').classList.add('fadeout');
      setBackground(url, false);
      later('hero', 140, () => { renderHero(); $('#page').classList.remove('fadeout'); });
    });
  }

  function applyZone() {
    const z = nav.zone;
    $('#ring').classList.toggle('on', z === 'row' && !!cur() && $('#rowtitle').classList.contains('on'));
    document.querySelectorAll('.btn[data-a]').forEach((b) => b.classList.toggle('focus', z === 'actions' && +b.dataset.a === nav.action));
    document.querySelectorAll('.hcard').forEach((c) => c.classList.toggle('focus', z === 'cards' && +c.dataset.c === nav.card));
    document.querySelectorAll('#topbar [data-t]').forEach((e) => e.classList.toggle('focus', z === 'top' && +e.dataset.t === nav.top));
    document.querySelectorAll('.tab').forEach((e) => e.classList.toggle('sel', (+e.dataset.t === 0) === (nav.tab === 'games')));
    stage.classList.toggle('scrolled', z === 'cards');
  }

  // ---------- overlays ----------
  function hints(list) {
    const h = $('#hints');
    if (!list) { h.classList.remove('on'); return; }
    const gl = consoleId === 'x360' ? X360.glyph360 : glyph;
    h.innerHTML = list.map(([k, l]) => `<span class="h">${gl(k, inputMode)}<span>${esc(l)}</span></span>`).join('');
    h.classList.add('on');
  }
  function pushOverlay(o) { overlays.push(o); $('#overlay').appendChild(o.el); o.render(); hints(o.hints || [['A', t('select')], ['B', t('back')]]); SOUND.play('menu'); }
  function popOverlay(silent) {
    const o = overlays.pop(); if (!o) return;
    o.el.remove(); if (!silent) SOUND.play('back');
    const top = overlays[overlays.length - 1];
    if (top) hints(top.hints || [['A', t('select')], ['B', t('back')]]); else hints(null);
  }
  function closeAll() { while (overlays.length) popOverlay(true); hints(null); }

  // A full-screen list or grid taller than the screen (Ayarlar has 15 rows, the library can have
  // many games) scrolls with the focus. At the top nothing is moved or clipped, so the first view is
  // exactly as before; once scrolled, what went above the list's top edge is clipped so it does not
  // run under the title. Stage units: the overlay is always 1080 tall (the stage is zoomed).
  function keepInView(box, f, pad = 0) {
    if (!f) return;
    const room = (box.offsetParent ? box.offsetParent.clientHeight : 1080) - 60 - box.offsetTop;
    let scroll = +box.dataset.scroll || 0;
    const top = f.offsetTop - pad, bot = f.offsetTop + f.offsetHeight + pad;
    if (bot - scroll > room) scroll = bot - room;
    if (top - scroll < 0) scroll = top;
    scroll = Math.max(0, Math.round(scroll));
    box.dataset.scroll = scroll;
    box.style.transform = scroll ? `translateY(${-scroll}px)` : '';
    box.style.clipPath = scroll ? `inset(${scroll}px -40px -4000px -40px)` : '';
  }
  // A vertical list overlay. entries: [{label, icon, value, danger, run}]
  function listOverlay({ entries, cls = 'pop', style = {}, title, full = false, keepOpen = false }) {
    const wrap = document.createElement('div');
    let box = wrap;
    if (full) { wrap.className = 'full'; wrap.innerHTML = `<h1>${esc(title || '')}</h1><div class="panel"></div>`; box = wrap.querySelector('.panel'); }
    else { wrap.className = cls; Object.assign(wrap.style, style); }
    const o = { el: wrap, index: 0, entries };
    o.render = () => {
      const ents = typeof o.entries === 'function' ? o.entries() : o.entries;
      box.innerHTML = ents.map((e, i) => `<div class="it${i === o.index ? ' focus' : ''}${e.danger ? ' danger' : ''}" data-i="${i}">${e.icon || ''}<span>${esc(e.label)}</span>${e.value != null ? `<span class="val">${esc(e.value)}</span>` : ''}</div>`).join('');
      if (full) keepInView(box, box.querySelector('.it.focus'));
      box.querySelectorAll('.it').forEach((el) => {
        el.addEventListener('mousemove', () => { if (!mouseLive() || o.index === +el.dataset.i) return; o.index = +el.dataset.i; o.render(); });
        el.addEventListener('click', () => { o.index = +el.dataset.i; o.input('select'); });
      });
    };
    o.input = (a) => {
      const ents = typeof o.entries === 'function' ? o.entries() : o.entries;
      if (a === 'up' || a === 'down') { const n = NAV.listMove(o.index, a, ents.length); if (n !== o.index) { o.index = n; SOUND.play('focus'); o.render(); } else SOUND.play('bump'); }
      else if (a === 'back' || a === 'options') popOverlay();
      else if (a === 'select') { const e = ents[o.index]; if (!e) return; SOUND.play('select'); if (!keepOpen && !e.stay) popOverlay(true); if (e.run) e.run(); o.render && overlays.includes(o) && o.render(); }
    };
    return o;
  }

  function confirmDialog(q, onYes) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="dimbg"></div><div class="dialog"><div class="q">${esc(q)}</div><div class="opts"><div class="btn" data-i="0">${esc(t('no'))}</div><div class="btn" data-i="1">${esc(t('yes'))}</div></div></div>`;
    const o = { el, index: 0 };
    o.render = () => el.querySelectorAll('.opts .btn').forEach((b) => { b.classList.toggle('focus', +b.dataset.i === o.index); b.onclick = () => { o.index = +b.dataset.i; o.input('select'); }; });
    o.input = (a) => {
      if (a === 'left' || a === 'right') { o.index = a === 'left' ? 0 : 1; SOUND.play('focus'); o.render(); }
      else if (a === 'back') popOverlay();
      else if (a === 'select') { popOverlay(true); if (o.index === 1) { SOUND.play('select'); onYes(); } else SOUND.play('back'); }
    };
    pushOverlay(o);
  }

  // A PS5-style question with a short explanation and two or three buttons in a row.
  // options: [{ label, run }]; focus: the button selected at first; cancel: the one B/Esc picks.
  function choiceDialog({ title, body, options, focus = 0, cancel = null, hintOk }) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="dimbg"></div><div class="dialog choice"><div class="q">${esc(title)}</div>${body ? `<div class="sub">${esc(body)}</div>` : ''}<div class="opts">${options.map((o, i) => `<div class="btn" data-i="${i}">${esc(o.label)}</div>`).join('')}</div></div>`;
    const o = { el, index: focus, kind: 'choice', hints: [['A', hintOk || t('select')], ['B', cancel != null ? options[cancel].label : t('back')]] };
    o.render = () => el.querySelectorAll('.opts .btn').forEach((b) => { b.classList.toggle('focus', +b.dataset.i === o.index); b.onclick = () => { o.index = +b.dataset.i; o.input('select'); }; });
    o.input = (a) => {
      if (a === 'left' || a === 'right') { const n = Math.max(0, Math.min(options.length - 1, o.index + (a === 'left' ? -1 : 1))); if (n !== o.index) { o.index = n; SOUND.play('focus'); o.render(); } else SOUND.play('bump'); }
      else if (a === 'back') { popOverlay(); if (cancel != null && options[cancel].run) options[cancel].run(); }
      else if (a === 'select') { popOverlay(true); SOUND.play('select'); const c = options[o.index]; if (c && c.run) c.run(); }
    };
    pushOverlay(o);
    return o;
  }
  const runningGame = () => data.games.find((x) => x.id === running) || (data.allGames || []).find((x) => x.id === running);

  // Starting another game while one is open: like the console, the open one is closed first.
  function switchDialog(g) {
    const cur = runningGame();
    choiceDialog({
      title: t('switchTitle', { name: cur ? cur.title : '' }),
      body: t('switchBody', { name: g.title }),
      options: [{ label: t('cancel') }, { label: t('ok'), run: () => launch(g, { replace: true }) }],
      focus: 1, cancel: 0,
    });
  }
  // Alt+F4 / Menüden Çık while a game is open.
  function quitDialog(d) {
    if (overlays.some((o) => o.kind === 'choice' && o.quit)) return;
    const o = choiceDialog({
      title: t('quitTitle'),
      body: t('quitBody', { name: (d && d.title) || '' }),
      options: [{ label: t('cancel'), run: () => api.quit('cancel') }, { label: t('quitMenuOnly'), run: () => api.quit('menu') }, { label: t('quitBoth'), run: () => api.quit('both') }],
      focus: 2, cancel: 0,
    });
    o.quit = true;
  }

  function gameMenu(g, from) {
    const entries = [];
    if (running === g.id) entries.push({ label: t('closeGame'), icon: ICONS.power, danger: true, run: () => api.kill() });
    entries.push({ label: t('info'), icon: ICONS.info, run: () => infoOverlay(g) });
    entries.push({ label: t('openLocation'), icon: ICONS.folder, run: () => api.open('game-folder', g.id).then((r) => r && toast(t('notFound'), r)) });
    entries.push({ label: t('editGame'), icon: ICONS.edit, run: () => editOverlay(g) });
    entries.push({ label: t('removeHome'), icon: ICONS.check, run: async () => { data = await api.hideGame(g.id); refresh(); } });
    const style = from === 'row' ? { left: `${NAV.tileX(nav.row, nav.row)}px`, top: '310px' } : { left: '522px', bottom: '250px' };
    pushOverlay(listOverlay({ entries, style }));
  }

  // ---------- game manager ----------
  // A one-line text field. Keyboard: type, Enter saves, Esc cancels. Pad: A saves, B cancels.
  function textDialog(label, value, onOk) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="dimbg"></div><div class="dialog"><div class="q">${esc(label)}</div><input class="field" type="text" spellcheck="false"><div class="fh">${esc(t('typeHint'))}</div></div>`;
    const inp = el.querySelector('input'); inp.value = value || '';
    const o = { el, hints: [['A', t('fSave')], ['B', t('fCancel')]] };
    const done = (ok) => { popOverlay(!ok); if (ok) { SOUND.play('select'); onOk(inp.value.trim()); } };
    o.render = () => { setTimeout(() => { inp.focus(); inp.select(); }, 0); };
    o.input = (a) => { if (a === 'select') done(true); else if (a === 'back') done(false); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
    pushOverlay(o);
  }

  function artLabel(d) {
    if (d.iconFile || d.backgroundFile) return t('artImage');
    if (d.sceSys) return t('artSce');
    if (!d.clearArt && d.artPaths && d.artPaths.icon) return /icon0\.png$/i.test(d.artPaths.icon) ? t('artSce') : t('artImage');
    return t('artAuto');
  }

  function editOverlay(g, preset) {
    const ls = data.lossless && data.lossless.installed;
    const d = g ? { id: g.id, title: g.title, exe: g.exe || '', args: g.args || '', workingDir: g.workingDir || '', sceSys: g.sceSys || '', losslessScaling: !!g.losslessScaling, suspendInMenu: g.suspendInMenu !== false, hidden: !!g.hidden, badge: g.badge || '', artPaths: g.artPaths,
      music: g.music || 'auto', musicShuffle: !!g.musicShuffle, themeBg: g.themeBg || 'auto', accent: g.accent || 'auto' }
      : { title: '', exe: '', args: '', workingDir: '', sceSys: '', losslessScaling: false, suspendInMenu: true, badge: '', music: 'auto', musicShuffle: false, themeBg: 'auto', accent: 'auto' };
    const th = (g && g.theme) || {};
    d.console = g ? cOf(g) : CONS.normalize((preset && preset.console) || consoleId);
    const pickExe = async () => {
      const r = await api.pick('exe', d.exe); if (!r) return;
      if (r.error) { toast(t('fExe'), r.error); return; }
      d.exe = r.exe; d.args = r.args || d.args; d.workingDir = r.workingDir || '';
      if (!d.title) d.title = r.name || '';
      if (!d.badge && r.badge) d.badge = r.badge;
      o.render();
    };
    const artMenu = () => pushOverlay(listOverlay({ style: { left: '560px', top: '420px' }, entries: [
      { label: t('artPick'), icon: ICONS.image, run: async () => { const r = await api.pick('image'); if (r && r.path) { d.iconFile = r.path; d.clearArt = true; o.render(); } } },
      { label: t('artBg'), icon: ICONS.image, run: async () => { const r = await api.pick('image'); if (r && r.path) { d.backgroundFile = r.path; o.render(); } } },
      { label: t('artPickSce'), icon: ICONS.folder, run: async () => {
        const r = await api.pick('scesys'); if (!r) return;
        if (r.error) { toast(t('fArt'), r.error); return; }
        d.sceSys = r.sceSys; d.clearArt = true; delete d.iconFile; delete d.backgroundFile;
        if (!d.title && r.title) d.title = r.title;
        if (!d.badge) d.badge = 'PS4';
        o.render();
      } },
      { label: t('artUseIcon'), icon: ICONS.pad, run: () => { d.sceSys = ''; d.clearArt = true; delete d.iconFile; delete d.backgroundFile; o.render(); } },
    ] }));
    const dirMenu = () => pushOverlay(listOverlay({ style: { left: '560px', top: '380px' }, entries: [
      { label: t('dirPick'), icon: ICONS.folder, run: async () => { const r = await api.pick('folder', d.workingDir || d.exe); if (r && r.path) { d.workingDir = r.path; o.render(); } } },
      { label: t('dirReset'), icon: ICONS.check, run: () => { d.workingDir = ''; o.render(); } },
    ] }));
    const srcName = (x) => ({ picked: t('srcPicked'), user: t('srcUserMusic'), sce: t('srcSce'), 'sce-pending': t('srcScePending'), 'sce-noffmpeg': t('srcSceNoFf'), folder: t('srcFolder') }[x] || t('srcNone'));
    const musicLabel = () => d.music === 'off' ? t('musicOffOpt') : Array.isArray(d.music) ? `${d.music.length === 1 ? baseName(d.music[0]) : d.music.length + ' ' + t('files')}${d.musicShuffle ? ' · ' + t('musicShuffle') : ''}` : `${t('musicAuto')} · ${srcName(th.musicSource)}`;
    const musicMenu = () => pushOverlay(listOverlay({ style: { left: '560px', top: '420px' }, entries: [
      { label: t('musicAuto'), icon: ICONS.check, run: () => { d.music = 'auto'; o.render(); if (th.musicSource === 'sce-noffmpeg') toast(t('ffmpegMissing'), t('ffmpegHint')); } },
      { label: t('musicPick'), icon: ICONS.folder, run: async () => { const r = await api.pick('audio'); if (r && r.paths && r.paths.length) { d.music = r.paths; o.render(); } } },
      { label: `${t('musicShuffle')}: ${d.musicShuffle ? t('on') : t('off')}`, icon: ICONS.pad, run: () => { d.musicShuffle = !d.musicShuffle; o.render(); } },
      { label: t('musicOffOpt'), icon: ICONS.power, run: () => { d.music = 'off'; o.render(); } },
    ] }));
    const bgLabel = () => d.themeBg === 'off' ? t('bgOff') : d.backgroundFile ? baseName(d.backgroundFile) : t('bgAuto');
    const bgMenu = () => pushOverlay(listOverlay({ style: { left: '560px', top: '440px' }, entries: [
      { label: t('bgAuto'), icon: ICONS.check, run: () => { d.themeBg = 'auto'; delete d.backgroundFile; o.render(); } },
      { label: t('bgPick'), icon: ICONS.image, run: async () => { const r = await api.pick('image'); if (r && r.path) { d.backgroundFile = r.path; d.themeBg = 'auto'; o.render(); } } },
      { label: t('bgOff'), icon: ICONS.power, run: () => { d.themeBg = 'off'; delete d.backgroundFile; o.render(); } },
    ] }));
    const PALETTE = ['auto', '#e8503e', '#f2a63a', '#f2d23a', '#74ba3c', '#3fbfa8', '#4592e4', '#8a6ae8', '#e85aa8'];
    const accentLabel = () => d.accent === 'auto' ? `${t('accentAuto')}${th.accent && th.accentAuto ? ' ' + th.accent : ''}` : d.accent;
    const save = async () => {
      if (!d.exe) { SOUND.play('error'); toast(t('fSave'), t('pickFirst')); return; }
      const { artPaths, ...draft } = d;
      const r = await api.saveGame(draft);
      if (r && r.init) data = r.init;
      if (!r || !r.ok) { SOUND.play('error'); toast(t('fSave'), (r && r.error) || ''); return; }
      popOverlay(true);
      const top = overlays[overlays.length - 1];
      if (top && top.kind === 'manage') top.render();
      refresh(overlays.length ? undefined : r.id);
      const lsMsg = r.ls && r.ls.created ? t('lsCreated') : r.ls && r.ls.reason === 'running' ? t('lsRunning') : '';
      toast(t('saved'), lsMsg || d.title);
    };
    const entries = () => {
      const list = [
        { label: t('fExe'), icon: ICONS.folder, value: d.exe ? baseName(d.exe) : t('empty'), stay: true, run: pickExe },
        { label: t('fName'), icon: ICONS.edit, value: d.title || t('empty'), stay: true, run: () => textDialog(t('fName'), d.title, (v) => { d.title = v; o.render(); }) },
        { label: t('fArgs'), icon: ICONS.edit, value: d.args || '-', stay: true, run: () => textDialog(t('fArgs'), d.args, (v) => { d.args = v; o.render(); }) },
        { label: t('fDir'), icon: ICONS.folder, value: d.workingDir ? baseName(d.workingDir) : t('exeFolder'), stay: true, run: dirMenu },
        { label: t('fArt'), icon: ICONS.image, value: artLabel(d), stay: true, run: artMenu },
        { label: t('fConsole'), icon: ICONS.pad, value: (CONS.CONSOLES.find((c) => c.id === d.console) || CONS.CONSOLES[0]).name, stay: true, run: () => { d.console = CONS.neighbour(d.console, 'down'); o.render(); } },
        ls ? { label: t('fLs'), icon: ICONS.desktop, value: d.losslessScaling ? t('on') : t('off'), stay: true, run: () => { d.losslessScaling = !d.losslessScaling; o.render(); } }
          : { label: t('lsMissing'), icon: ICONS.info, value: '', stay: true, run: () => toast(t('lsMissing'), t('lsMissingHint')) },
        { label: t('fSuspend'), icon: ICONS.pad, value: d.suspendInMenu ? t('on') : t('off'), stay: true, run: () => { d.suspendInMenu = !d.suspendInMenu; o.render(); if (!d.suspendInMenu) toast(t('fSuspend'), t('fSuspendOffHint')); } },
        { label: t('fMusic'), icon: ICONS.music || ICONS.pad, value: musicLabel(), stay: true, run: musicMenu },
        { label: t('fThemeBg'), icon: ICONS.image, value: bgLabel(), stay: true, run: bgMenu },
        { label: t('fAccent'), icon: ICONS.image, value: accentLabel(), stay: true, run: () => { d.accent = PALETTE[(PALETTE.indexOf(d.accent) + 1) % PALETTE.length]; o.render(); } },
      ];
      if (d.hidden) list.push({ label: t('showHome'), icon: ICONS.check, value: t('off'), stay: true, run: () => { d.hidden = false; o.render(); } });
      list.push({ label: t('fSave'), icon: ICONS.check, stay: true, run: save });
      if (g) list.push({ label: t('fDelete'), icon: ICONS.power, danger: true, stay: true, run: () => confirmDialog(t('confirmDelete', { name: g.title }), async () => { data = await api.deleteGame(g.id); popOverlay(true); const top = overlays[overlays.length - 1]; if (top && top.kind === 'manage') { top.index = 0; top.render(); } refresh(); }) });
      return list;
    };
    const o = listOverlay({ entries, full: true, title: g ? t('editGame') : t('addGame'), keepOpen: true });
    o.kind = 'edit';
    o.hints = [['A', t('select')], ['B', t('fCancel')]];
    pushOverlay(o);
    if (!g) setTimeout(() => { if (overlays.includes(o) && !d.exe) pickExe(); }, 250);
  }

  function manageOverlay() {
    const games = () => data.allGames || data.games;
    const entries = () => [
      { label: t('addGame'), icon: ICONS.plus, stay: true, run: () => editOverlay(null) },
      ...games().map((g) => ({ label: g.title, icon: ICONS.pad, value: g.hidden ? t('hiddenTag') : (g.badge || ''), stay: true, run: () => gameActions(g) })),
    ];
    const o = listOverlay({ entries, full: true, title: t('manageGames'), keepOpen: true });
    o.kind = 'manage';
    const move = async (g, delta) => {
      data = await api.moveGame(g.id, delta);
      const i = games().findIndex((x) => x.id === g.id); if (i >= 0) o.index = i + 1;
      o.render(); refresh();
    };
    const gameActions = (g) => pushOverlay(listOverlay({ style: { left: '760px', top: `${Math.min(700, 250 + o.index * 84)}px` }, entries: [
      { label: t('editGame'), icon: ICONS.edit, run: () => editOverlay(games().find((x) => x.id === g.id) || g) },
      { label: t('moveUp'), icon: ICONS.up, run: () => move(g, -1) },
      { label: t('moveDown'), icon: ICONS.down, run: () => move(g, 1) },
      { label: t('fDelete'), icon: ICONS.power, danger: true, run: () => confirmDialog(t('confirmDelete', { name: g.title }), async () => { data = await api.deleteGame(g.id); o.index = Math.min(o.index, games().length); o.render(); refresh(); }) },
    ] }));
    pushOverlay(o);
  }

  function infoOverlay(g) {
    const el = document.createElement('div'); el.className = 'full';
    const rows = [
      [t('library') === 'Game Library' ? 'Name' : 'Ad', g.title], [t('path'), g.exe || t('notFound')], [t('args'), g.args || '-'],
      [t('fDir'), g.workingDir || '-'], [t('titleId'), (g.titleIds || []).join(', ') || '-'], [t('source'), srcLabel(g.source)],
      [t('playTime'), fmtDuration(g.playSeconds)], [t('lastPlayed'), fmtLast(g.lastPlayed)],
      [t('fArt'), (g.artPaths && g.artPaths.sceSys) || (g.artPaths && g.artPaths.icon) || '-'],
    ];
    el.innerHTML = `<h1>${esc(g.title)}</h1><div class="info">${rows.map(([k, v]) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>`;
    const o = { el, render() {}, input(a) { if (a === 'back' || a === 'select' || a === 'options') popOverlay(); }, hints: [['B', t('back')]] };
    pushOverlay(o);
  }

  function libraryOverlay(order) {
    const el = document.createElement('div'); el.className = 'full';
    const games = data.games.filter((g) => cOf(g) === consoleId).sort((a, b) => (order === 'recent' ? (b.lastPlayed || 0) - (a.lastPlayed || 0) : 0) || a.title.localeCompare(b.title, 'tr'));
    el.innerHTML = `<h1>${esc(t('library'))}</h1><div class="grid"></div>`;
    const grid = el.querySelector('.grid');
    const o = { el, index: 0, hints: [['A', t('play')], ['menu', t('options')], ['B', t('back')]] };
    o.render = () => {
      grid.innerHTML = games.map((g, i) => `<div class="gitem${i === o.index ? ' focus' : ''}" data-i="${i}"><div class="gi" style="background-image:${g.art && g.art.icon ? esc(cssUrl(g.art.icon)) : 'none'}"></div><div class="gt">${esc(g.title)}</div></div>`).join('');
      grid.querySelectorAll('.gitem').forEach((e) => { const g = games[+e.dataset.i]; const gi = e.querySelector('.gi'); if (g.art && g.art.icon) gi.style.backgroundImage = cssUrl(g.art.icon); else { const gt = genTile(g); gi.style.backgroundImage = gt.style; gi.classList.add('gen'); gi.innerHTML = g.art && g.art.exeIcon ? `<img class="exeic" src="${g.art.exeIcon}" alt="">` : ''; } });
      keepInView(grid, grid.querySelector('.gitem.focus'), 10);
      grid.querySelectorAll('.gitem').forEach((e) => e.addEventListener('click', () => { if (o.index === +e.dataset.i) o.input('select'); else { o.index = +e.dataset.i; o.render(); } }));
    };
    o.input = (a) => {
      if (['up', 'down', 'left', 'right'].includes(a)) { const n = NAV.gridMove(o.index, a, games.length, 6); if (n !== o.index) { o.index = n; SOUND.play('focus'); o.render(); } else SOUND.play('bump'); }
      else if (a === 'back') popOverlay();
      else if (a === 'select' && games[o.index]) { popOverlay(true); launch(games[o.index]); }
      else if (a === 'options' && games[o.index]) gameMenu(games[o.index], 'lib');
    };
    pushOverlay(o);
  }

  function settingsOverlay() {
    const st = data.settings;
    const intros = ['press', 'fade', 'none'];
    const introLabel = (v) => ({ press: t('introPress'), fade: t('introFade'), none: t('introNone') }[v]);
    // Redraw once the new value is saved: the row used to show the old value until the next move.
    const set = async (k, v) => { data.settings = await api.setSetting(k, v); applySettings(); Object.assign(st, data.settings); if (overlays.includes(o)) o.render(); };
    const entries = () => [
      { label: t('manageGames'), icon: ICONS.edit, stay: true, run: () => manageOverlay() },
      { label: t('rowOrder'), icon: ICONS.library, value: st.rowOrder === 'manual' ? t('orderManual') : t('orderRecent'), stay: true, run: () => set('rowOrder', data.settings.rowOrder === 'manual' ? 'recent' : 'manual').then(() => refresh()) },
      { label: 'Dil / Language', icon: ICONS.info, value: st.language === 'en' ? 'English' : 'Türkçe', stay: true, run: () => set('language', data.settings.language === 'en' ? 'tr' : 'en').then(() => { refresh(); const top = overlays[overlays.length - 1]; if (top) { top.el.querySelector('h1').textContent = t('settings'); hints([['A', t('select')], ['B', t('back')]]); } }) },
      { label: t('userFolder'), icon: ICONS.folder, stay: true, run: () => api.open('user-assets') },
      { label: t('sounds'), icon: ICONS.check, value: st.sounds ? t('on') : t('off'), stay: true, run: () => set('sounds', !data.settings.sounds) },
      { label: t('themeMusic'), icon: ICONS.music || ICONS.check, value: st.themeMusic !== false ? t('on') : t('off'), stay: true, run: () => set('themeMusic', data.settings.themeMusic === false) },
      { label: t('themeVolume'), icon: ICONS.music || ICONS.check, value: `%${Math.round((st.themeVolume ?? 0.5) * 100)}`, stay: true, run: () => { const v = [0.2, 0.35, 0.5, 0.7, 0.85, 1]; const i = v.findIndex((x) => x > (data.settings.themeVolume ?? 0.5) + 0.01); set('themeVolume', v[i < 0 ? 0 : i]); } },
      { label: t('themeOn'), icon: ICONS.image, value: st.theme !== false ? t('on') : t('off'), stay: true, run: () => set('theme', data.settings.theme === false).then(() => { themeFocus(true); if (xdash) xdash.applyTheme(true); }) },
      { label: t('bootIntro'), icon: ICONS.info, value: st.bootIntro === 'off' ? t('bootOff') : t('bootOnce'), stay: true, run: () => set('bootIntro', data.settings.bootIntro === 'off' ? 'once' : 'off') },
      { label: t('introScreen'), icon: ICONS.info, value: introLabel(st.intro), stay: true, run: () => set('intro', intros[(intros.indexOf(data.settings.intro) + 1) % 3]) },
      { label: t('autostart'), icon: ICONS.power, value: st.autostart ? t('on') : t('off'), stay: true, run: () => set('autostart', !data.settings.autostart) },
      { label: t('fullscreen'), icon: ICONS.desktop, value: st.fullscreen !== false ? t('on') : t('off'), stay: true, run: () => set('fullscreen', data.settings.fullscreen === false) },
      { label: t('homeEsc'), icon: ICONS.pad, value: st.homeEsc !== false ? t('on') : t('off'), stay: true, run: () => set('homeEsc', data.settings.homeEsc === false) },
      { label: t('homeEscMs'), icon: ICONS.clock, value: holdLabel(st.homeEscMs), stay: true, run: () => set('homeEscMs', nextHold(data.settings.homeEscMs)) },
      { label: t('homePad'), icon: ICONS.pad, value: st.homePad !== false ? t('on') : t('off'), stay: true, run: () => set('homePad', data.settings.homePad === false) },
      { label: t('homePadMs'), icon: ICONS.clock, value: holdLabel(st.homePadMs), stay: true, run: () => set('homePadMs', nextHold(data.settings.homePadMs)) },
      { label: t('exitMenu'), icon: ICONS.power, danger: true, run: () => api.window('quit') },
    ];
    const o = listOverlay({ entries: () => { Object.assign(st, data.settings); return entries(); }, full: true, title: t('settings'), keepOpen: true });
    o.input = ((orig) => (a) => { orig(a); })(o.input);
    pushOverlay(o);
  }

  // Hold time for going home during a game: 0,6 / 1 / 1,5 / 2 s.
  const HOLDS = [600, 1000, 1500, 2000];
  const holdOf = (v) => (HOLDS.includes(Number(v)) ? Number(v) : 1000);
  const nextHold = (v) => HOLDS[(HOLDS.indexOf(holdOf(v)) + 1) % HOLDS.length];
  const holdLabel = (v) => `${(holdOf(v) / 1000).toLocaleString(data.settings.language === 'en' ? 'en-GB' : 'tr-TR')} ${t('seconds')}`;

  function powerMenu() {
    const entries = [
      { label: t('sleep'), icon: ICONS.power, run: () => confirmDialog(t('confirmSleep'), () => api.power('sleep')) },
      { label: t('restart'), icon: ICONS.power, run: () => confirmDialog(t('confirmRestart'), () => api.power('restart')) },
      { label: t('shutdown'), icon: ICONS.power, run: () => confirmDialog(t('confirmShutdown'), () => api.power('shutdown')) },
      { label: t('exitMenu'), icon: ICONS.power, danger: true, run: () => api.window('quit') },
    ];
    pushOverlay(listOverlay({ entries, style: { right: '150px', top: '110px' } }));
  }

  // ---------- toast ----------
  function toast(t1, t2, icon) {
    const el = $('#toast');
    el.querySelector('.t1').textContent = t1 || ''; el.querySelector('.t2').textContent = t2 || '';
    const ic = el.querySelector('.ic');
    if (icon) { ic.style.backgroundImage = cssUrl(icon); ic.innerHTML = ''; } else { ic.style.backgroundImage = ''; ic.innerHTML = ICONS.info; }
    el.classList.add('on');
    later('toast', Math.max(3500, (t2 || '').length * 60), () => el.classList.remove('on'));
  }

  // ---------- launch screen ----------
  // art: game art, fading to black, spinner | busy: black + spinner | black: black only | off
  function launchScreen(mode, g) {
    const el = $('#launch'); const art = el.querySelector('.art');
    el.classList.remove('dark', 'busy', 'instant', 'prog');
    if (mode === 'off') { el.classList.remove('on'); return; }
    if (mode === 'art') {
      const src = g && g.art && (g.art.background || g.art.cover || g.art.icon);
      art.style.backgroundImage = src ? `url("${src}")` : 'none';
      // Show the art at once, then let it fade to black (CSS: 900 ms hold, 1.1 s fade).
      art.style.transition = 'none'; art.style.opacity = '1'; void art.offsetWidth;
      art.style.transition = ''; art.style.opacity = '';
      el.classList.add('on', 'busy');
      requestAnimationFrame(() => requestAnimationFrame(() => { if (el.classList.contains('on')) el.classList.add('dark'); }));
      return;
    }
    el.classList.add('on', 'dark', 'instant');
    if (mode === 'busy') el.classList.add('busy');
  }

  // The game's own loading before its first picture (main.js trackLoad): percent, or a moving bar
  // when there is no number. Shown on the launch screen until the game takes over.
  function launchProgress(d) {
    const el = $('#launch'); const p = el.querySelector('.prog');
    if (!d || !el.classList.contains('on')) return;
    const warn = { stalled: 'loadStalled', timeout: 'loadStalled', due: 'loadStalled', failed: 'loadStalled', hung: 'loadHung' }[d.state];
    if (warn) {
      if (!el.classList.contains('prog')) return;
      p.classList.remove('indet'); p.classList.add('warn');
      p.querySelector('.lb').textContent = t(warn);
      return;
    }
    if (d.state !== 'run' && d.state !== 'ready') { el.classList.remove('prog'); return; }
    p.classList.remove('warn');
    const g = data.games.find((x) => x.id === d.id) || (data.allGames || []).find((x) => x.id === d.id);
    if (!el.classList.contains('prog')) {
      const src = g && g.art && (g.art.icon || g.art.cover);
      p.querySelector('.ic').style.backgroundImage = src ? cssUrl(src) : '';
      p.querySelector('.tt').textContent = (g && g.title) || '';
      el.classList.add('prog');
    }
    const label = t(d.label === 'loading' ? 'loadGeneric' : 'loadShaders');
    const pct = d.pct == null ? null : Math.max(0, Math.min(100, Math.round(d.pct)));
    p.classList.toggle('indet', pct == null);
    p.querySelector('.bar i').style.width = pct == null ? '' : `${pct}%`;
    p.querySelector('.lb').textContent = pct == null ? `${label}…` : t('loadPct', { label, n: pct });
    p.dataset.pct = pct == null ? '' : String(pct);
  }

  // ---------- actions ----------
  async function launch(g, opts = {}) {
    if (launching) return;
    if (running && running === g.id) { const r = await api.window('hide'); if (r !== 'none') return; running = null; paused = false; }
    if (!g.exe) { SOUND.play('error'); toast(t('launchFailed'), t('missingExe'), g.art && g.art.icon); return; }
    if (running && !opts.replace) { switchDialog(g); return; }
    launching = true;
    const b = $('.btn.primary'); b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 140);
    SOUND.play('launch');
    const bo = $('#blackout'); bo.classList.add('fast'); bo.classList.remove('off');
    launchScreen('art', g);
    api.saveState({ musicPos: MUSIC.positions() });
    await new Promise((r) => setTimeout(r, 320));
    const res = await api.launch(g.id, opts.replace ? { replace: true } : {});
    launching = false;
    if (opts.replace && res && res.ok) { running = null; paused = false; }
    if (!res || !res.ok) {
      launchScreen('off');
      bo.classList.add('off'); setTimeout(() => bo.classList.remove('fast'), 400);
      SOUND.play('error'); toast(t('launchFailed'), (res && res.error) || '', g.art && g.art.icon);
      return;
    }
    running = g.id; paused = false;
    g.lastPlayed = Date.now();
    SOUND.startAmbient(false);
  }

  function activate(i) {
    const it = items[i]; if (!it) return;
    if (it.kind === 'game') launch(it.g);
    else if (it.kind === 'desktop') { SOUND.play('select'); api.window('minimize'); }
    else if (it.kind === 'library') { SOUND.play('select'); libraryOverlay(); }
    else if (it.kind === 'add') { SOUND.play('select'); editOverlay(null); }
  }

  // ---------- console menus (PS5 <-> Xbox 360) ----------
  const SWITCH_MS = 520;
  function x360Action(kind, tile) {
    const g = tile && tile.game;
    if (kind === 'game' && g) launch(g);
    else if (kind === 'menu' && g) gameMenu(g, 'x360');
    else if (kind === 'add') { SOUND.play('select'); editOverlay(null, { console: 'x360' }); }
    else if (kind === 'library' || kind === 'allgames' || kind === 'search') { SOUND.play('select'); libraryOverlay(); }
    else if (kind === 'recent') { SOUND.play('select'); libraryOverlay('recent'); }
    else if (kind === 'ps5') switchConsole('down', 'ps5');
    else if (kind === 'desktop') { SOUND.play('select'); api.window('minimize'); }
    else if (kind === 'settings') { SOUND.play('select'); settingsOverlay(); }
    else if (kind === 'power') { SOUND.play('select'); powerMenu(); }
    else if (kind === 'manage') { SOUND.play('select'); manageOverlay(); }
    else if (kind === 'exit') { SOUND.play('select'); api.window('quit'); }
  }
  function ensureX360() {
    if (xdash) return xdash;
    xdash = new X360.Dash({
      el: $('#x360'), t, api, sound: SOUND, glyphMode: () => inputMode, lang: () => (data.settings.language === 'en' ? 'en' : 'tr'),
      running: () => running,
      action: x360Action,
      onFocus: () => themeFocus(false),
      theme: () => themeOn(),
    });
    return xdash;
  }
  function buildX360() { if (consoleId === 'x360' || xdash) ensureX360().build({ ...data, games: data.games.map((g) => ({ ...g, _console: cOf(g) })) }, data.settings.x360Scene || null); }
  function applyConsole() {
    stage.classList.toggle('c-x360', consoleId === 'x360');
    if (consoleId === 'x360') buildX360();
    // Build the other menu in the background once the PS5 menu is up, so the first switch only animates.
    else setTimeout(() => { if (!xdash) { ensureX360(); buildX360(); } }, 1200);
  }
  // Both menus live in this window: the outgoing one slides away and fades while the incoming one
  // slides in from the side the user pressed towards. No window is closed or reopened.
  function bootWanted(kind) {
    return data.settings.bootIntro !== 'off' && !REOPEN && !running && !(CAPTURE && !forced.bootPlay) && !(data.boot && data.boot.shown && data.boot.shown[kind]);
  }
  function playBoot(kind, opts = {}) {
    if (data.boot) data.boot.shown = { ...(data.boot.shown || {}), [kind]: true };
    if (api.bootShown) api.bootShown(kind);
    const files = (data.boot && data.boot.files && data.boot.files[kind]) || {};
    return bootP.play(kind, files, { volume: SOUND.volume, muted: !SOUND.enabled, text: t('bootWarn'), ...opts });
  }
  // The first time a console menu comes up in this run its boot intro plays first: it covers the
  // screen, the menu is switched underneath without the slide, and the intro fades into it.
  function bootSwitch(to) {
    switching = true; guard.start(performance.now(), SWITCH_MS);
    if (to === 'x360' && !xdash) { ensureX360(); buildX360(); }
    playBoot(to, { fadeIn: 260, onCovered: () => {
      consoleId = to;
      stage.classList.toggle('c-x360', to === 'x360');
      if (to === 'ps5') { layoutRow(true); applyZone(); } else if (xdash) xdash.layout(true);
      api.saveState({ console: to });
      window.__ps5switches = (window.__ps5switches || 0) + 1;
    } }).then(() => { switching = false; guard.start(performance.now(), 0); });
  }
  function switchConsole(dir, target) {
    const to = target || CONS.neighbour(consoleId, dir);
    const now = performance.now();
    if (switching || to === consoleId) return;
    if (guard.busy(now)) return;
    if (bootWanted(to)) { bootSwitch(to); return; }
    switching = true; guard.start(now, SWITCH_MS);
    if (to === 'x360' && !xdash) { ensureX360(); buildX360(); }
    const fromEl = consoleId === 'x360' ? $('#x360') : $('#ps5view');
    const toEl = to === 'x360' ? $('#x360') : $('#ps5view');
    const off = 300 * (dir === 'up' ? 1 : -1);  // up: the new menu comes down from above
    stage.classList.add('c-anim');
    SOUND.play('switch');
    const ease = 'cubic-bezier(0.25, 0.85, 0.3, 1)';
    const ms = forced.switchMs || SWITCH_MS;
    // The Xbox 360 layer is opaque and sits above the PS5 one, so only its opacity animates; that
    // gives the same crossfade while the PS5 layer (blur/backdrop effects inside) is only moved.
    const fade = (el, o0, o1) => (el.id === 'x360' ? { opacity: [o0, o1] } : {});
    const a1 = fromEl.animate({ transform: ['translateY(0px)', `translateY(${fromEl.id === 'x360' ? off : 0}px)`], ...fade(fromEl, 1, 0) }, { duration: ms, easing: ease, fill: 'forwards' });
    const a2 = toEl.animate({ transform: [`translateY(${toEl.id === 'x360' ? -off : 0}px)`, 'translateY(0px)'], ...fade(toEl, 0, 1) }, { duration: ms, easing: ease, fill: 'forwards' });
    consoleId = to;
    stage.classList.toggle('c-x360', to === 'x360');
    if (to === 'ps5') { layoutRow(true); applyZone(); }
    api.saveState({ console: to });
    window.__ps5switches = (window.__ps5switches || 0) + 1;
    a2.finished.catch(() => {}).then(() => {
      a1.cancel(); a2.cancel();
      stage.classList.remove('c-anim');
      switching = false;
    });
  }

  function dispatch(a) {
    if (!data) return;
    // During a boot intro: A/Enter (and the other buttons) skip it; directions and the console
    // switch (L3/R3, PageUp/PageDown) are swallowed.
    if (bootP.on) {
      if (['select', 'back', 'home', 'options', 'any', 'x', 'y'].includes(a)) bootP.skip();
      return;
    }
    if ($('#intro').classList.contains('on')) { if (['select', 'home', 'back', 'options'].includes(a) || a === 'any') dismissIntro(); return; }
    if (a === 'home') { closeAll(); }
    // Console switch: L3 / PageUp = previous menu, R3 / PageDown = next one. Not while a dialog or
    // overlay is open, during a switch, or while a game is being started.
    if (a === 'consolePrev' || a === 'consoleNext') {
      if (!overlays.length && !launching && !$('#launch').classList.contains('on')) switchConsole(a === 'consolePrev' ? 'up' : 'down');
      return;
    }
    if (overlays.length) { overlays[overlays.length - 1].input(a); return; }
    if (switching) return;
    if (consoleId === 'x360') { ensureX360().input(a); return; }
    const ctx = { rowLen: items.length, kind: (i) => (items[i] ? items[i].kind : 'game'), cardsLen: 3 };
    const prevZone = nav.zone;
    const { state, fx } = NAV.reduce(nav, a, ctx);
    nav = state;
    for (const f of fx) {
      if (f.type === 'focus') { SOUND.play('focus'); onFocusChanged(false); }
      else if (f.type === 'zone') { SOUND.play(f.back ? 'back' : 'focus'); applyZone(); if (prevZone !== nav.zone && nav.zone === 'row') { $('#ring').classList.add('on'); } }
      else if (f.type === 'bump') SOUND.play('bump');
      else if (f.type === 'tab') { SOUND.play('select'); items = buildItems(); nav.defaultRow = defaultRow(); nav.row = f.tab === 'games' ? nav.defaultRow : 0; renderRow(); onFocusChanged(true); applyZone(); }
      else if (f.type === 'home') { SOUND.play('back'); onFocusChanged(true); applyZone(); }
      else if (f.type === 'activate') activate(f.index);
      else if (f.type === 'menu') { const it = items[f.index]; if (it && it.kind === 'game') gameMenu(it.g, prevZone === 'row' ? 'row' : 'btn'); }
      else if (f.type === 'card') { const g = items[f.row].g; SOUND.play('select'); if (f.index === 0) infoOverlay(g); else if (f.index === 1) api.open('game-folder', g.id); else editOverlay(g); }
      else if (f.type === 'open') { SOUND.play('select'); if (f.what === 'search') libraryOverlay(); else if (f.what === 'settings') settingsOverlay(); else if (f.what === 'profile') powerMenu(); }
    }
  }

  // ---------- mouse ----------
  function mouseTile(i) {
    if (overlays.length) return;
    if (nav.zone !== 'row') { nav.zone = 'row'; applyZone(); }
    if (i === nav.row) { activate(i); return; }
    nav.row = i; SOUND.play('focus'); onFocusChanged(false);
  }
  function wireMouse() {
    $('.btn.primary').addEventListener('click', () => { nav.zone = 'actions'; nav.action = 0; applyZone(); activate(nav.row); });
    $('.btn.round').addEventListener('click', () => { nav.zone = 'actions'; nav.action = 1; applyZone(); dispatch('options'); });
    document.querySelectorAll('#topbar [data-t]').forEach((e) => e.addEventListener('click', () => { nav.zone = 'top'; nav.top = +e.dataset.t; applyZone(); dispatch('select'); }));
    let wheelLock = 0;
    window.addEventListener('wheel', (e) => { if (Date.now() < wheelLock) return; wheelLock = Date.now() + 90; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; dispatch(d > 0 ? (overlays.length ? 'down' : 'right') : (overlays.length ? 'up' : 'left')); }, { passive: true });
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); dispatch(overlays.length ? 'back' : 'options'); });
    let hideT = 0;
    window.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) { const n = performance.now(); lastMouse = n; moveTimes = moveTimes.filter((x) => n - x < 500); moveTimes.push(n); } document.body.classList.remove('nocursor'); clearTimeout(hideT); hideT = setTimeout(() => document.body.classList.add('nocursor'), 2500); });
    $('#intro').addEventListener('click', () => dismissIntro());
    $('#boot').addEventListener('click', () => bootP.skip());
  }

  // ---------- input ----------
  function setMode(m) { if (m === inputMode) return; inputMode = m; renderIntroMsg(); const top = overlays[overlays.length - 1]; if (top) hints(top.hints || [['A', t('select')], ['B', t('back')]]); }
  window.addEventListener('keyup', (e) => { if (e.key === 'Escape') escGuard = 0; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && escGuard && (e.repeat || performance.now() < escGuard)) { e.preventDefault(); return; }
    if (e.target && e.target.tagName === 'INPUT') return;   // text fields handle their own keys
    const a = INPUT.keyAction(e);
    // A held PageUp/PageDown must not switch again and again with the key repeat.
    if ((a === 'consolePrev' || a === 'consoleNext') && e.repeat) { e.preventDefault(); return; }
    if (a) { e.preventDefault(); setMode('keyboard'); document.body.classList.add('nocursor'); dispatch(a); }
    else if ($('#intro').classList.contains('on')) dismissIntro();
  });
  const mappers = {};
  function pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = performance.now();
    // A pad that was unplugged starts from a clean state when it comes back (no stale held buttons).
    for (const k of Object.keys(mappers)) if (![...pads].some((p) => p && p.connected && String(p.index) === k)) delete mappers[k];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const m = mappers[p.index] || (mappers[p.index] = new INPUT.PadMapper({ prime: true }));
      const acts = m.update(p.buttons, p.axes, now);
      if (acts.length) { setMode('pad'); document.body.classList.add('nocursor'); }
      for (const a of acts) dispatch(a);
    }
    requestAnimationFrame(pollPads);
  }

  // ---------- intro ----------
  function renderIntroMsg() {
    const s = inputMode === 'keyboard' ? t('pressStartKb') : t('pressStart');
    $('#intro .msg').innerHTML = esc(s).replace('{A}', glyph('A', inputMode));
  }
  let bokehRaf = 0;
  function startIntro() {
    const intro = $('#intro');
    const custom = data.user.boot;
    $('#intro .emblem').innerHTML = custom ? `<img src="${custom}" style="width:100px;height:100px;object-fit:contain">` : ICONS.boot;
    renderIntroMsg();
    intro.classList.add('on');
    const cv = intro.querySelector('canvas'); const ctx = cv.getContext('2d');
    const W = 1920, H = 1080; cv.width = W; cv.height = H;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const parts = Array.from({ length: 260 }, () => {
      const band = rnd();
      return { x: rnd() * W, y: 520 + (rnd() - 0.5) * 420 + (band - 0.5) * 120 + (rnd() * W) * 0.05, r: rnd() < 0.85 ? 1 + rnd() * 4 : 6 + rnd() * 12, a: 0.25 + rnd() * 0.65, v: 4 + rnd() * 14, ph: rnd() * 6.28 };
    });
    const t0 = performance.now();
    const draw = (now) => {
      const tt = (now - t0) / 1000;
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a2522'); g.addColorStop(0.45, '#0e0f14'); g.addColorStop(1, '#06070b');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const beam = ctx.createRadialGradient(330, -80, 20, 330, -80, 900); beam.addColorStop(0, 'rgba(255,236,214,0.30)'); beam.addColorStop(1, 'rgba(255,236,214,0)');
      ctx.fillStyle = beam; ctx.fillRect(0, 0, W, H);
      const floor = ctx.createLinearGradient(0, 820, 0, H); floor.addColorStop(0, 'rgba(120,140,160,0)'); floor.addColorStop(1, 'rgba(110,130,150,0.22)');
      ctx.fillStyle = floor; ctx.fillRect(0, 820, W, 260);
      for (const p of parts) {
        const x = (p.x + tt * p.v) % (W + 40) - 20; const y = p.y + Math.sin(tt * 0.4 + p.ph) * 8;
        const tw = 0.75 + 0.25 * Math.sin(tt * 1.3 + p.ph);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, p.r);
        gr.addColorStop(0, `rgba(255,208,140,${p.a * tw})`); gr.addColorStop(p.r > 6 ? 0.7 : 0.4, `rgba(230,170,95,${p.a * tw * 0.55})`); gr.addColorStop(1, 'rgba(230,170,95,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283); ctx.fill();
      }
      if (intro.classList.contains('on')) bokehRaf = requestAnimationFrame(draw);
    };
    bokehRaf = requestAnimationFrame(draw);
  }
  function dismissIntro() {
    const intro = $('#intro');
    if (!intro.classList.contains('on') || intro.classList.contains('out')) return;
    SOUND.play('launch');
    intro.classList.add('out');
    setTimeout(() => { intro.classList.remove('on', 'out'); cancelAnimationFrame(bokehRaf); SOUND.startAmbient(true); }, 620);
  }

  // ---------- setup ----------
  function applySettings() {
    const st = data.settings;
    S = Object.assign({}, window.STRINGS.tr, window.STRINGS[st.language] || {}, st.strings || {});
    SOUND.enabled = st.sounds !== false; SOUND.setVolume(st.volume ?? 0.6);
    MUSIC.setEnabled(st.themeMusic !== false && !CAPTURE_PLAIN); MUSIC.setVolume(st.themeVolume ?? 0.5);
    document.documentElement.lang = st.language || 'tr';
    $('.tab[data-t="0"]').textContent = t('games'); $('.tab[data-t="1"]').textContent = t('media');
    $('.tb[data-t="2"]').innerHTML = ICONS.search; $('.tb[data-t="3"]').innerHTML = ICONS.gear;
    const pic = $('.avatar .pic');
    if (data.user.avatar) { pic.style.backgroundImage = cssUrl(data.user.avatar); pic.textContent = ''; } else pic.textContent = (st.username || 'K').slice(0, 1).toUpperCase();
    $('#mediaempty .t').textContent = t('noMedia'); $('#mediaempty .h').textContent = t('noMediaHint');
  }
  function loadFonts(list) {
    if (!list || !list.length) return;
    const css = list.map((f) => `@font-face{font-family:'UserUI';src:url("${f.url}");font-weight:${f.variable ? '100 900' : f.weight};}`).join('\n');
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }
  function refresh(focusId) {
    const keep = focusId || (cur() && cur().id);
    data.games.forEach((g, i) => { g._order = i; });
    items = buildItems();
    nav.defaultRow = defaultRow();
    const idx = items.findIndex((x) => x.id === keep);
    nav.row = idx >= 0 ? idx : Math.min(nav.defaultRow, Math.max(0, items.length - 1));
    renderRow(); onFocusChanged(true); applyZone();
    buildX360();
  }

  api.on('game-started', (d) => { if (!d || !d.seamless) setTimeout(() => launchScreen('black'), 400); });
  api.on('game-error', (d) => { running = null; launching = false; launchScreen('off'); $('#blackout').classList.add('off'); toast(t('launchFailed'), d.message); });
  // The game window is in front: the launch screen becomes the black backdrop behind it.
  api.on('launch-progress', (d) => launchProgress(d));
  api.on('game-handoff', () => { $('#blackout').classList.remove('off'); launchScreen('black'); });
  api.on('game-returning', () => { closeAll(); $('#blackout').classList.remove('off'); launchScreen('busy'); });
  api.on('game-resumed', () => { closeAll(); paused = false; $('#blackout').classList.add('fast'); $('#blackout').classList.remove('off'); launchScreen('black'); });
  api.on('game-paused', (d) => { if (d && d.id) { running = d.id; paused = true; layoutRow(true); renderHero(); } });
  api.on('confirm-quit', (d) => quitDialog(d));
  // snd0.at9 was turned into Ogg in the background: the game has music now
  api.on('theme-update', (d) => {
    if (!d || !data) return;
    for (const g of [...data.games, ...(data.allGames || [])]) if (g.id === d.id && g.theme) { g.theme.music = d.music; g.theme.musicSource = d.source; }
    const f = focusedGame(); if (f && f.id === d.id) themeFocus(true);
  });
  // Home over a running game (Ctrl+Alt+Home, Alt+Tab to the menu).
  api.on('show-home', (d) => {
    launchScreen('off'); const bo = $('#blackout'); bo.classList.remove('fast'); bo.classList.add('off');
    if (d && d.id) { running = d.id; paused = !!d.paused; nav.zone = 'row'; if (nav.tab !== 'games') { nav.tab = 'games'; } refresh(d.id); }
  });
  api.on('game-exited', async (d) => {
    running = null; paused = false;
    const fresh = await api.init(); data = fresh; applySettings();
    nav.zone = 'row'; nav.tab = 'games'; closeAll();
    refresh(d.id);
    const bo = $('#blackout'); bo.classList.remove('fast'); bo.classList.add('off');
    launchScreen('off');
    if (d.failed) toast(t('launchFailed'), '');
    else { const g = data.games.find((x) => x.id === d.id); if (g && d.seconds > 20) toast(t('gameClosed', { name: g.title }), `${t('playTime')}: ${fmtDuration(d.seconds)}`, g.art && g.art.icon); }
    SOUND.startAmbient(true);
  });

  // Capture mode: one still frame of a boot intro at forced.boot.t seconds (reference comparison).
  async function bootFrame(b) {
    const el = $('#boot'); el.className = 'on'; el.innerHTML = '<canvas width="1920" height="1080"></canvas>';
    const files = (data.boot && data.boot.files && data.boot.files[b.kind]) || {};
    const logo = await BOOT.loadImage(b.logo === false ? null : files.logo);
    BOOT.frame(b.kind, el.firstChild.getContext('2d'), b.t || 0, { logo, text: t('bootWarn') });
  }

  async function main() {
    data = await api.init();
    running = data.running; paused = !!data.paused;
    applySettings(); loadFonts(data.user.fonts);
    // The user's console logos (intro folder): the PS symbol for the press screen emblem (unless
    // assets\boot.png is there), the Xbox 360 sphere for the guide button glyph.
    const lf = (data.boot && data.boot.files) || {};
    if (lf.ps5 && lf.ps5.logo && !data.user.boot) data.user.boot = (await BOOT.markUrl(lf.ps5.logo, 'ps5').catch(() => null)) || null;
    if (lf.x360 && lf.x360.logo) X360.setHomeMark(await BOOT.markUrl(lf.x360.logo, 'x360').catch(() => null));
    SOUND.loadUser(data.user.sounds);
    MUSIC.restore(data.state && data.state.musicPos);
    // Quiet while an intro plays, a game starts or runs, or the menu is hidden.
    let quiet = null;
    setInterval(() => {
      const q = !!(bootP.on || $('#intro').classList.contains('on') || launching || running || $('#launch').classList.contains('on') || document.hidden);
      if (q !== quiet) { if (quiet !== null || q) MUSIC.hold(q); quiet = q; }
    }, 150);
    if (forced.tab) nav.tab = forced.tab;
    consoleId = CONS.normalize(forced.console || (data.state && data.state.console));
    if (forced.scrim === false) stage.classList.add('noscrim');
    refresh((REOPEN && data.running) || (data.state && data.state.focusId));
    if (forced.row != null) { nav.row = forced.row; onFocusChanged(true); }
    if (forced.zone) { nav.zone = forced.zone; nav.action = forced.action || 0; nav.card = forced.card || 0; nav.top = forced.top || 0; applyZone(); }
    if (forced.overlay === 'menu') gameMenu(cur().g, forced.zone === 'row' ? 'row' : 'btn');
    if (forced.overlay === 'settings') settingsOverlay();
    if (forced.overlay === 'library') libraryOverlay();
    if (forced.inputMode) setMode(forced.inputMode);
    applyConsole();
    if (forced.x360 && xdash) { const x = forced.x360; if (x.panel != null) xdash.nav.panel = x.panel; if (x.focus != null) xdash.nav.focus[xdash.nav.panel] = x.focus; xdash.layout(true); }
    if (forced.switchTo) setTimeout(() => switchConsole(forced.switchTo), 50);
    wireMouse(); clock(); setInterval(clock, 1000);
    if (forced.boot) await bootFrame(forced.boot);
    let bootVideo = false;
    if (!forced.boot && bootWanted(consoleId)) {
      const f = data.boot && data.boot.files && data.boot.files[consoleId];
      // A user's PS5 video already ends on the console's own "press the button" screen, so the
      // menu's press screen is not shown a second time after it.
      bootVideo = consoleId === 'ps5' && !!(f && f.video);
      playBoot(consoleId);
    }
    const intro = REOPEN || bootVideo ? 'none' : (forced.intro || data.settings.intro);
    if (intro === 'press') startIntro();
    requestAnimationFrame(() => $('#blackout').classList.add('off'));
    if (intro === 'none' || CAPTURE) { const bo = $('#blackout'); bo.style.transition = 'none'; bo.classList.add('off'); }
    if (REOPEN === 'returning') { $('#blackout').classList.remove('off'); launchScreen('busy'); }
    requestAnimationFrame(pollPads);
    if (CAPTURE) {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, forced.wait || 1200));
      if (forced.intro !== 'press') { const i = $('#intro'); i.classList.remove('on'); }
      await new Promise((r) => setTimeout(r, 100));
      try { await api.capture(); } finally { api.captureDone(); }
    }
    window.__ps5 = { dispatch, get nav() { return nav; }, get items() { return items; }, get overlays() { return overlays.length; },
      get console() { return consoleId; }, get boot() { return bootP.on ? bootP.active.kind : null; }, skipBoot: () => bootP.skip(), get switching() { return switching; }, get guardInfo() { return { switching, launching, busyMs: Math.round(guard.busyUntil - performance.now()), consoleId, running: !!running, bootWanted: { ps5: bootWanted('ps5'), x360: bootWanted('x360') }, bootActive: !!bootP.active, shown: data && data.boot && data.boot.shown }; }, get x360() { return xdash && xdash.current(); }, get xdash() { return xdash; }, get music() { return MUSIC.state(); }, get musicEvents() { return MUSIC.events; }, themeFocus, openList: (w) => (w === 'library' ? libraryOverlay() : w === 'manage' ? manageOverlay() : settingsOverlay()),
      launchScreen: (mode, id) => launchScreen(mode, data.games.find((g) => g.id === id)) };
  }
  main().catch((e) => { document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:20px;top:20px;color:#f88;z-index:99;font:16px monospace;white-space:pre-wrap">${esc(e.stack || e)}</pre>`); });
})();
