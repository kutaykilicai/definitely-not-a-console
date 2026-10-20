// Browser preview mode (no Electron): serves sample data so the UI can be opened in Chrome.
(function () {
  if (window.ps5) return;
  const noop = async () => ({ ok: true });
  let initData = null;
  window.ps5 = {
    init: async () => { if (!initData) initData = await (await fetch('sample/init.json')).json(); return JSON.parse(JSON.stringify(initData)); },
    launch: async () => ({ ok: false, error: 'Önizleme modu' }), kill: noop, pick: async () => null, saveGame: async () => ({ ok: false, error: 'Önizleme modu' }), moveGame: async () => window.ps5.init(), deleteGame: async () => window.ps5.init(),
    saveState: noop, setSetting: async (k, v) => { initData.settings[k] = v; return initData.settings; }, hideGame: async () => window.ps5.init(),
    open: async () => '', window: noop, power: noop, capture: noop, captureDone: () => {}, on: () => {},
  };
})();
