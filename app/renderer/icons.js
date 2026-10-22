// Original vector glyphs (drawn for this project). No Sony or Microsoft artwork.
(function (root) {
  function gearPath(cx, cy, rOut, rIn, teeth) {
    const pts = [];
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step - Math.PI / 2;
      const w = step * 0.24;
      pts.push([a - step / 2 + w * 0.55, rIn], [a - w, rOut], [a + w, rOut], [a + step / 2 - w * 0.55, rIn]);
    }
    return 'M' + pts.map(([a, r]) => `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`).join('L') + 'Z';
  }
  const svg = (vb, body, cls = '') => `<svg class="ico ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const I = {
    search: svg('0 0 32 32', '<circle cx="13" cy="13" r="9.2" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M19.8 19.8 L28.6 28.6" stroke="currentColor" stroke-width="3.8" stroke-linecap="round"/>'),
    gear: svg('0 0 32 32', `<path fill="currentColor" fill-rule="evenodd" d="${gearPath(16, 16, 15.2, 11.6, 8)} M16 10.6 A5.4 5.4 0 1 0 16.001 10.6Z"/>`),
    dots: svg('0 0 40 8', '<circle cx="6.5" cy="4" r="3" fill="currentColor"/><circle cx="20" cy="4" r="3" fill="currentColor"/><circle cx="33.5" cy="4" r="3" fill="currentColor"/>'),
    library: svg('0 0 48 48', '<rect x="4" y="5" width="11" height="11" rx="2.5" fill="currentColor"/><rect x="18.5" y="5" width="11" height="11" rx="2.5" fill="currentColor"/><rect x="33" y="5" width="11" height="11" rx="2.5" fill="currentColor"/><rect x="4" y="19.5" width="11" height="11" rx="2.5" fill="currentColor"/><path fill="currentColor" d="M22 22.5h16.5c3.3 0 5.4 2.4 5.9 5.6l1.5 9.2c.6 3.8-3.6 6-6.2 3.3l-3.2-3.3h-12.5l-3.2 3.3c-2.6 2.7-6.8.5-6.2-3.3l1.5-9.2c.5-3.2 2.6-5.6 5.9-5.6zm1.4 4.2v2.6h-2.6v2.6h2.6v2.6h2.6v-2.6h2.6v-2.6h-2.6v-2.6z"/><rect x="4" y="34" width="11" height="9" rx="2.5" fill="currentColor"/>'),
    desktop: svg('0 0 48 48', '<rect x="5" y="8" width="38" height="25" rx="3" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M18 41h12M24 33v8" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>'),
    pad: svg('0 0 48 48', '<path fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" d="M15 13h18c5.2 0 8.4 3.6 9.3 8.6l1.9 10.6c.9 5.1-4.6 8.2-8.1 4.6L31.5 32h-15l-4.6 4.8c-3.5 3.6-9 .5-8.1-4.6l1.9-10.6C6.6 16.6 9.8 13 15 13z"/><path d="M15 20v8M11 24h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="31" cy="21.5" r="2.1" fill="currentColor"/><circle cx="35.5" cy="26" r="2.1" fill="currentColor"/>'),
    trophy: svg('0 0 32 32', '<path fill="currentColor" d="M9 4h14v3h5v3.5c0 4-2.8 6.6-6.4 7.2-1.1 2-2.8 3.3-4.6 3.7V25h5v3H10v-3h5v-3.6c-1.8-.4-3.5-1.7-4.6-3.7C6.8 17.1 4 14.5 4 10.5V7h5zm-2 6v.5c0 2 1.1 3.4 2.6 4C9.2 13.2 9 11.7 9 10zm16 0c0 1.7-.2 3.2-.6 4.5 1.5-.6 2.6-2 2.6-4V10z"/>'),
    clock: svg('0 0 32 32', '<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 9v7.5l5 3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    info: svg('0 0 32 32', '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="14.5" y="14" width="3" height="9" rx="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.9" fill="currentColor"/>'),
    folder: svg('0 0 32 32', '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" d="M4 8.5C4 7.1 5.1 6 6.5 6h6l3 3h10C26.9 9 28 10.1 28 11.5v12c0 1.4-1.1 2.5-2.5 2.5h-19C5.1 26 4 24.9 4 23.5z"/>'),
    plus: svg('0 0 32 32', '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M16 6v20M6 16h20"/>'),
    up: svg('0 0 32 32', '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M8 19l8-8 8 8"/>'),
    down: svg('0 0 32 32', '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M8 13l8 8 8-8"/>'),
    music: svg('0 0 32 32', '<path fill="currentColor" d="M12 6l14-3v17.5a4 4 0 1 1-2.4-3.7V8.6L14.4 10.6v13a4 4 0 1 1-2.4-3.7z"/>'),
    chart: svg('0 0 32 32', '<path fill="currentColor" d="M5 26h22v2.4H5zM7 16h4v8H7zm7-6h4v14h-4zm7 3h4v11h-4z"/>'),
    update: svg('0 0 32 32', '<path d="M25 13a9.5 9.5 0 1 0 .6 6" fill="none" stroke="currentColor" stroke-width="2.6"/><path fill="currentColor" d="M27 6v9h-9z"/>'),
    battery: svg('0 0 32 32', '<rect x="3" y="10" width="23" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="26.5" y="13.5" width="2.5" height="5" fill="currentColor"/>'),
    image: svg('0 0 32 32', '<rect x="5" y="7" width="22" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path fill="currentColor" d="M8 22l6-7 4 4.5 3-3 4 5.5z"/><circle cx="21" cy="12.5" r="2" fill="currentColor"/>'),
    edit: svg('0 0 32 32', '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" d="M6 26l1.4-5.6L21 6.8l4.2 4.2-13.6 13.6zM18.4 9.4l4.2 4.2"/>'),
    power: svg('0 0 32 32', '<path d="M16 4v11" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M9.5 8.3a10.5 10.5 0 1 0 13 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    check: svg('0 0 32 32', '<path d="M7 16.5l6 6L25.5 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    // Boot screen emblem: an original stylised controller in a ring (not a platform logo).
    boot: svg('0 0 100 100', '<path fill="currentColor" d="M33 34h34c9 0 14.6 6.3 16.2 15l3.3 18.6c1.6 8.9-8 14.3-14.2 8L64 67.2H36l-8.3 8.4c-6.2 6.3-15.8.9-14.2-8L16.8 49C18.4 40.3 24 34 33 34zm0 9.5v5.5h-5.5v5.5H33V60h5.5v-5.5H44V49h-5.5v-5.5zm32.5 1.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm-7.3 7.3a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm14.6 0a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm-7.3 7.3a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>'),
  };
  // Controller / keyboard hint glyphs (original drawings). kind: A B X Y menu view lb rb.
  const FACE = { A: '#5fbf3f', B: '#e5483c', X: '#3d8be8', Y: '#f2b632' };
  function glyph(kind, mode) {
    if (mode === 'keyboard') {
      const key = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', menu: 'O', view: 'Tab', lb: 'Q', rb: 'E', home: 'Home' }[kind] || kind;
      return `<span class="kbd">${key}</span>`;
    }
    if (FACE[kind]) {
      return `<svg class="glyph" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#1b1b1d" stroke="${FACE[kind]}" stroke-width="2"/><text x="16" y="21.6" text-anchor="middle" font-size="16" font-weight="700" fill="${FACE[kind]}" font-family="inherit">${kind}</text></svg>`;
    }
    if (kind === 'menu') return '<svg class="glyph" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#1b1b1d" stroke="#d8d8d8" stroke-width="2"/><path d="M10 11.5h12M10 16h12M10 20.5h12" stroke="#f2f2f2" stroke-width="2.2" stroke-linecap="round"/></svg>';
    if (kind === 'view') return '<svg class="glyph" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#1b1b1d" stroke="#d8d8d8" stroke-width="2"/><rect x="9" y="10" width="10" height="8" rx="1.5" fill="none" stroke="#f2f2f2" stroke-width="2"/><rect x="13" y="14" width="10" height="8" rx="1.5" fill="#1b1b1d" stroke="#f2f2f2" stroke-width="2"/></svg>';
    if (kind === 'lb' || kind === 'rb') return `<svg class="glyph wide" viewBox="0 0 48 32"><rect x="1.5" y="5" width="45" height="22" rx="8" fill="#1b1b1d" stroke="#d8d8d8" stroke-width="2"/><text x="24" y="21.5" text-anchor="middle" font-size="14" font-weight="700" fill="#f2f2f2" font-family="inherit">${kind.toUpperCase()}</text></svg>`;
    if (kind === 'home') return '<svg class="glyph" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#1b1b1d" stroke="#d8d8d8" stroke-width="2"/><circle cx="16" cy="16" r="7" fill="none" stroke="#f2f2f2" stroke-width="2.4"/></svg>';
    return '';
  }
  root.ICONS = I; root.glyph = glyph;
})(typeof window !== 'undefined' ? window : globalThis);
