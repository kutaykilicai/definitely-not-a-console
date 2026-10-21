// Xbox 360 style dashboard: pure navigation logic (no DOM, testable in Node).
// A dashboard is a row of panels (one per tab). Each panel holds tiles with a rectangle in
// 1920x1080 units, relative to the panel's left edge. The focus moves spatially between tiles;
// leaving a panel sideways goes to the neighbouring panel, leaving the grid at the top or the
// bottom hands control back to the console switcher (fx 'console').
(function (root) {
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // Best tile in direction dir from tile cur. Returns index or -1.
  function spatial(tiles, cur, dir) {
    const a = tiles[cur]; if (!a) return -1;
    const ca = center(a);
    let best = -1, bestScore = Infinity;
    tiles.forEach((b, i) => {
      if (i === cur || b.focusable === false) return;
      const cb = center(b);
      let gap, off, overlap;
      if (dir === 'left' || dir === 'right') {
        gap = dir === 'right' ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
        if (gap < -2) return;
        overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        off = overlap > 0 ? 0 : Math.abs(cb.y - ca.y);
        // Same row first: prefer the tile that shares the most height with the current one.
        const score = gap + off * 3 - Math.max(0, overlap) * 0.05 + Math.abs(b.y - a.y) * 0.02;
        if (score < bestScore) { bestScore = score; best = i; }
      } else {
        gap = dir === 'down' ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
        if (gap < -2) return;
        overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        off = overlap > 0 ? 0 : Math.abs(cb.x - ca.x);
        // Within the overlapping tiles, take the one whose left edge is closest (column feel).
        const score = gap + off * 3 + Math.abs(b.x - a.x) * 0.05;
        if (score < bestScore) { bestScore = score; best = i; }
      }
    });
    return best;
  }

  // Nearest tile to a point (used when entering a panel from the side).
  function nearestFromSide(tiles, side, y) {
    let best = -1, bestScore = Infinity;
    const xs = tiles.filter((t) => t.focusable !== false).map((t) => (side === 'left' ? t.x : t.x + t.w));
    if (!xs.length) return -1;
    const edge = side === 'left' ? Math.min(...xs) : Math.max(...xs);
    tiles.forEach((t, i) => {
      if (t.focusable === false) return;
      const ex = side === 'left' ? t.x : t.x + t.w;
      const dy = y < t.y ? t.y - y : y > t.y + t.h ? y - (t.y + t.h) : 0;
      const s = Math.abs(ex - edge) * 2 + dy * 3;
      if (s < bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  function initial(home = 0, focus = {}) { return { panel: home, home, focus: { ...focus } }; }
  function focusOf(s, panels, p = s.panel) {
    const tiles = (panels[p] && panels[p].tiles) || [];
    const f = s.focus[p];
    if (f != null && tiles[f] && tiles[f].focusable !== false) return f;
    const d = panels[p] && panels[p].defaultFocus;
    if (d != null && tiles[d]) return d;
    return tiles.findIndex((t) => t.focusable !== false);
  }

  // panels: [{ id, tiles: [{x,y,w,h,focusable}] , defaultFocus }]
  function reduce(s, a, panels) {
    const n = { ...s, focus: { ...s.focus } };
    const fx = [];
    const p = panels[s.panel]; const tiles = (p && p.tiles) || [];
    const cur = focusOf(s, panels);
    const goPanel = (np, enterFrom) => {
      if (np < 0 || np >= panels.length) { fx.push({ type: 'bump' }); return; }
      n.panel = np;
      if (enterFrom && n.focus[np] == null) {
        const t = tiles[cur]; const y = t ? t.y + t.h / 2 : 540;
        const k = nearestFromSide(panels[np].tiles || [], enterFrom, y); if (k >= 0) n.focus[np] = k;
      }
      fx.push({ type: 'panel', from: s.panel, to: np });
    };
    switch (a) {
      case 'left': case 'right': {
        const k = cur >= 0 ? spatial(tiles, cur, a) : -1;
        if (k >= 0) { n.focus[s.panel] = k; fx.push({ type: 'focus' }); }
        else goPanel(s.panel + (a === 'left' ? -1 : 1), a === 'left' ? 'right' : 'left');
        break;
      }
      case 'up': case 'down': {
        const k = cur >= 0 ? spatial(tiles, cur, a) : -1;
        if (k >= 0) { n.focus[s.panel] = k; fx.push({ type: 'focus' }); }
        else fx.push({ type: 'console', dir: a });
        break;
      }
      case 'tabPrev': goPanel(s.panel - 1, null); break;
      case 'tabNext': goPanel(s.panel + 1, null); break;
      case 'select': if (cur >= 0) fx.push({ type: 'activate', panel: s.panel, index: cur }); break;
      case 'options': if (cur >= 0) fx.push({ type: 'menu', panel: s.panel, index: cur }); break;
      case 'back': case 'home':
        if (s.panel !== s.home) goPanel(s.home, null);
        else if (a === 'back' && p && p.defaultFocus != null && cur !== p.defaultFocus) { n.focus[s.panel] = p.defaultFocus; fx.push({ type: 'focus' }); }
        else if (a === 'home') fx.push({ type: 'home' });
        break;
      case 'y': { const i = panels.findIndex((q) => q.id === 'search'); if (i >= 0 && i !== s.panel) goPanel(i, null); break; }
      default: break;
    }
    return { state: n, fx };
  }

  const api = { spatial, nearestFromSide, initial, reduce, focusOf };
  if (typeof module !== 'undefined') module.exports = api; else root.X360NAV = api;
})(typeof window !== 'undefined' ? window : globalThis);
