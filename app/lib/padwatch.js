'use strict';
// The menu's side of dnac-padwatch.exe (bin/): its HKCU Run entry (Ayarlar > Kumanda bağlanınca
// menüyü aç), starting/stopping it, and the small files it reads (cache\padwatch.txt: game and
// emulator exe names; cache\menu-state.txt: "game" while one runs; cache\menu-closed.txt: when the
// user closed the menu). No admin rights anywhere.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const RUN_NAME = 'Definitely Not a Console - Kumanda';
const EMULATORS = ['shadps4.exe', 'xenia.exe', 'xenia_canary.exe', 'rpcs3.exe', 'pcsx2.exe', 'pcsx2-qt.exe', 'dolphin.exe', 'cemu.exe', 'ryujinx.exe', 'yuzu.exe', 'suyu.exe', 'citron.exe', 'duckstation-qt-x64-releaseltcg.exe', 'ppssppwindows64.exe', 'retroarch.exe', 'vita3k.exe', 'xemu.exe', 'mesen.exe'];

class PadWatch {
  constructor({ binDir, menuExe, dataDir, reg, isWin, log = () => {} }) {
    Object.assign(this, { binDir, menuExe, dataDir, reg, isWin, log });
    this.exe = path.join(binDir, 'dnac-padwatch.exe');
    this.cache = path.join(dataDir, 'cache');
  }
  command() { return `"${this.exe}" --menu "${this.menuExe}" --data "${this.dataDir}"`; }
  write(name, text) { try { fs.mkdirSync(this.cache, { recursive: true }); fs.writeFileSync(path.join(this.cache, name), text); } catch { /* */ } }
  // exe names that mean "a game is running": every game's exe and watch names, plus emulators
  writeList(games) {
    const names = new Set(EMULATORS);
    for (const g of games || []) {
      if (g && g.exe) names.add(path.win32.basename(String(g.exe)).toLowerCase());
      for (const w of (g && g.watch) || []) names.add(String(w).toLowerCase());
    }
    for (const n of [...names]) if (!/\.exe$/.test(n) || /^(cmd|explorer|steam|epicgameslauncher)\.exe$/.test(n)) names.delete(n);
    this.write('padwatch.txt', [...names].sort().join('\n') + '\n');
  }
  gameState(on) { this.write('menu-state.txt', on ? 'game' : 'menu'); }
  closedByUser() { this.write('menu-closed.txt', String(Date.now())); }
  registered() { return (this.reg.list() || []).some((e) => e.name === RUN_NAME); }
  // turn on: Run entry for the next logins, and start it now
  enable() {
    const ok = this.reg.set(RUN_NAME, this.command());
    if (this.isWin && fs.existsSync(this.exe)) { try { spawn(this.exe, ['--menu', this.menuExe, '--data', this.dataDir], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) { this.log('padwatch start', e.message); } }
    return ok;
  }
  disable() {
    this.reg.remove(RUN_NAME);
    if (this.isWin && fs.existsSync(this.exe)) execFile(this.exe, ['--stop'], { windowsHide: true }, () => {});
    return true;
  }
  // Run entry in line with the setting (e.g. after an update moved the exe)
  sync(on) {
    const cur = (this.reg.list() || []).find((e) => e.name === RUN_NAME);
    if (on && (!cur || cur.data !== this.command())) return this.enable();
    if (!on && cur) return this.disable();
    return false;
  }
}
module.exports = { PadWatch, RUN_NAME, EMULATORS };
