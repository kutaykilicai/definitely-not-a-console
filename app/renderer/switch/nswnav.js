// Nintendo Switch style HOME navigation: three rows (users at the top, the software row, the round
// system buttons). Pure logic (no DOM) so it can be tested in Node.
//   state: { row: 'user'|'games'|'icons', i: { user, games, icons }, scroll }
//   ctx:   { users, games, icons, visible }   counts; visible = tiles that fit on screen
(function (root) {
  const ROWS = ['user', 'games', 'icons'];
  const initial = (ctx) => ({ row: ctx.games > 0 ? 'games' : 'icons', i: { user: 0, games: 0, icons: 0 }, scroll: 0 });
  const count = (ctx, row) => (row === 'user' ? ctx.users : row === 'games' ? ctx.games : ctx.icons);
  // Software row scroll: the focus moves freely over the tiles on screen; past the last one the row
  // slides by one tile (like the console), never leaving empty room at the end.
  function scrollFor(i, scroll, ctx) {
    const vis = Math.max(1, ctx.visible || 4);
    let s = scroll;
    if (i < s) s = i;
    if (i > s + vis - 1) s = i - vis + 1;
    return Math.max(0, Math.min(s, Math.max(0, ctx.games - vis)));
  }
  function reduce(state, a, ctx) {
    const st = { ...state, i: { ...state.i } }; const fx = [];
    const n = count(ctx, st.row);
    if (a === 'left' || a === 'right') {
      const d = a === 'left' ? -1 : 1; const j = st.i[st.row] + d;
      if (j < 0 || j >= n) fx.push({ type: 'bump' });
      else { st.i[st.row] = j; if (st.row === 'games') st.scroll = scrollFor(j, st.scroll, ctx); fx.push({ type: 'focus' }); }
    } else if (a === 'up' || a === 'down') {
      let k = ROWS.indexOf(st.row) + (a === 'up' ? -1 : 1);
      while (k >= 0 && k < ROWS.length && count(ctx, ROWS[k]) === 0) k += a === 'up' ? -1 : 1;
      if (k < 0 || k >= ROWS.length) fx.push({ type: 'bump' });
      else {
        st.row = ROWS[k]; st.i[st.row] = Math.min(st.i[st.row], count(ctx, st.row) - 1);
        if (st.row === 'games') st.scroll = scrollFor(st.i.games, st.scroll, ctx);
        fx.push({ type: 'focus' });
      }
    } else if (a === 'select') fx.push({ type: 'activate', row: st.row, index: st.i[st.row] });
    else if (a === 'options' && st.row === 'games') fx.push({ type: 'menu', index: st.i.games });
    else if (a === 'back') fx.push({ type: 'none' });
    return { state: st, fx };
  }
  // After the list changes (a game added or removed): keep the focus on something that exists.
  function clamp(state, ctx) {
    const st = { ...state, i: { ...state.i } };
    for (const r of ROWS) st.i[r] = Math.max(0, Math.min(st.i[r], count(ctx, r) - 1));
    if (count(ctx, st.row) === 0) st.row = ctx.games > 0 ? 'games' : 'icons';
    st.scroll = scrollFor(st.i.games, st.scroll, ctx);
    return st;
  }
  const api = { ROWS, initial, reduce, clamp, scrollFor };
  if (typeof module !== 'undefined') module.exports = api; else root.NSWNAV = api;
})(typeof window !== 'undefined' ? window : globalThis);
