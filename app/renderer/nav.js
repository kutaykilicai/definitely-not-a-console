// Pure navigation logic for the home screen. No DOM, so it can be tested in Node.
(function (root) {
  const TOP = ['tab-games', 'tab-media', 'search', 'settings', 'profile'];

  function initial(defaultRow = 0) {
    return { tab: 'games', zone: 'row', row: defaultRow, action: 0, card: 0, top: 0, defaultRow };
  }

  // ctx: { rowLen, kind(i) -> 'game'|'desktop'|'library'|'media', cardsLen, actionsLen(i) }
  function reduce(s, a, ctx) {
    const n = { ...s };
    const fx = [];
    const kind = (i) => (ctx.kind ? ctx.kind(i) : 'game');
    const actionsLen = (i) => (ctx.actionsLen ? ctx.actionsLen(i) : (kind(i) === 'game' ? 2 : 1));
    const cardsLen = ctx.cardsLen ?? 3;
    const rowLen = ctx.rowLen ?? 0;

    if (a === 'tabPrev' || a === 'tabNext' || a === 'tabToggle') {
      const next = a === 'tabPrev' ? 'games' : a === 'tabNext' ? 'media' : (s.tab === 'games' ? 'media' : 'games');
      if (next !== s.tab) { n.tab = next; n.zone = 'row'; n.row = 0; n.action = 0; fx.push({ type: 'tab', tab: next }); }
      else fx.push({ type: 'bump' });
      return { state: n, fx };
    }
    if (a === 'home') {
      n.zone = 'row'; n.action = 0; n.card = 0;
      if (s.tab !== 'games') { n.tab = 'games'; n.row = s.defaultRow; fx.push({ type: 'tab', tab: 'games' }); }
      fx.push({ type: 'home' });
      return { state: n, fx };
    }

    switch (s.zone) {
      case 'row':
        if (a === 'left') { if (s.row > 0) { n.row--; fx.push({ type: 'focus' }); } else fx.push({ type: 'bump' }); }
        else if (a === 'right') { if (s.row < rowLen - 1) { n.row++; fx.push({ type: 'focus' }); } else fx.push({ type: 'bump' }); }
        else if (a === 'up') { n.zone = 'top'; n.top = s.tab === 'games' ? 0 : 1; fx.push({ type: 'zone' }); }
        else if (a === 'down') { if (rowLen > 0) { n.zone = 'actions'; n.action = 0; fx.push({ type: 'zone' }); } }
        else if (a === 'select') { if (rowLen > 0) fx.push({ type: 'activate', index: s.row }); }
        else if (a === 'options') { if (rowLen > 0 && kind(s.row) !== 'library') fx.push({ type: 'menu', index: s.row }); }
        else if (a === 'back') { if (s.row !== s.defaultRow && rowLen > s.defaultRow && s.tab === 'games') { n.row = s.defaultRow; fx.push({ type: 'focus' }); } }
        break;
      case 'actions': {
        const len = actionsLen(s.row);
        if (a === 'left') { if (s.action > 0) { n.action--; fx.push({ type: 'zone' }); } }
        else if (a === 'right') { if (s.action < len - 1) { n.action++; fx.push({ type: 'zone' }); } }
        else if (a === 'up' || a === 'back') { n.zone = 'row'; fx.push({ type: 'zone', back: a === 'back' }); }
        else if (a === 'down') { if (kind(s.row) === 'game' && cardsLen > 0) { n.zone = 'cards'; n.card = 0; fx.push({ type: 'zone' }); } }
        else if (a === 'select') fx.push(s.action === 0 ? { type: 'activate', index: s.row } : { type: 'menu', index: s.row });
        else if (a === 'options') fx.push({ type: 'menu', index: s.row });
        break;
      }
      case 'cards':
        if (a === 'left') { if (s.card > 0) { n.card--; fx.push({ type: 'zone' }); } }
        else if (a === 'right') { if (s.card < cardsLen - 1) { n.card++; fx.push({ type: 'zone' }); } }
        else if (a === 'up' || a === 'back') { n.zone = 'actions'; fx.push({ type: 'zone', back: a === 'back' }); }
        else if (a === 'select') fx.push({ type: 'card', index: s.card, row: s.row });
        else if (a === 'options') fx.push({ type: 'menu', index: s.row });
        break;
      case 'top':
        if (a === 'left') { if (s.top > 0) { n.top--; fx.push({ type: 'zone' }); } }
        else if (a === 'right') { if (s.top < TOP.length - 1) { n.top++; fx.push({ type: 'zone' }); } }
        else if (a === 'down' || a === 'back') { n.zone = 'row'; fx.push({ type: 'zone', back: a === 'back' }); }
        else if (a === 'select') {
          const t = TOP[s.top];
          if (t === 'tab-games' || t === 'tab-media') {
            const tab = t === 'tab-games' ? 'games' : 'media';
            if (tab !== s.tab) { n.tab = tab; n.row = tab === 'games' ? s.defaultRow : 0; fx.push({ type: 'tab', tab }); }
            n.zone = 'row';
          } else fx.push({ type: 'open', what: t });
        }
        break;
      default: break;
    }
    return { state: n, fx };
  }

  // Generic vertical list (menus, settings) and grid (library).
  function listMove(i, a, len) {
    if (a === 'up') return Math.max(0, i - 1);
    if (a === 'down') return Math.min(len - 1, i + 1);
    return i;
  }
  function gridMove(i, a, len, cols) {
    if (a === 'left') return i % cols ? i - 1 : i;
    if (a === 'right') return (i % cols) < cols - 1 && i + 1 < len ? i + 1 : i;
    if (a === 'up') return i - cols >= 0 ? i - cols : i;
    if (a === 'down') return i + cols < len ? i + cols : (Math.floor(i / cols) < Math.floor((len - 1) / cols) ? len - 1 : i);
    return i;
  }

  // Row geometry from SPEC.md (1920x1080 units).
  const G = { small: 106, big: 168, pitch: 114, gapBig: 17, top: 125, focusX: 172, firstX: 48 };
  function tileX(i, focus) {
    const fx = focus === 0 ? G.firstX : G.focusX;
    if (i === focus) return fx;
    if (i < focus) return fx - G.gapBig - 1 - G.small - (focus - 1 - i) * G.pitch;
    return fx + G.big + G.gapBig + (i - focus - 1) * G.pitch;
  }

  const api = { TOP, initial, reduce, listMove, gridMove, tileX, G };
  if (typeof module !== 'undefined') module.exports = api; else root.NAV = api;
})(typeof window !== 'undefined' ? window : globalThis);
