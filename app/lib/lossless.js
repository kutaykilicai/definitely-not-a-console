'use strict';
// Lossless Scaling (Steam app) integration: find it, read its Settings.xml, start it quietly.
// The menu never writes LS settings at runtime: the per-game profile (Path filter + Auto Scale)
// is set up once in LS itself. If no profile matches, we fall back to LS's scale hotkey.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const P = path.win32;
const EXE = 'LosslessScaling.exe';

function steamLibraries(steamRoot = 'C:\\Program Files (x86)\\Steam') {
  const out = [steamRoot];
  try {
    const vdf = fs.readFileSync(P.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) out.push(m[1].replace(/\\\\/g, '\\'));
  } catch { /* no steam */ }
  return [...new Set(out)];
}

function findExe(configured) {
  const list = [];
  if (configured) list.push(configured);
  for (const lib of steamLibraries()) list.push(P.join(lib, 'steamapps', 'common', 'Lossless Scaling', EXE));
  return list.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}

function settingsPath(env = process.env) {
  return env.LOCALAPPDATA ? P.join(env.LOCALAPPDATA, 'Lossless Scaling', 'Settings.xml') : null;
}

const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? m[1].trim() : null; };
const unxml = (s) => (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseProfiles(xml) {
  const out = [];
  for (const m of (xml || '').matchAll(/<Profile>([\s\S]*?)<\/Profile>/g)) {
    const b = m[1];
    out.push({
      title: unxml(tag(b, 'Title')), filter: unxml(tag(b, 'Path') || ''),
      autoScale: tag(b, 'AutoScale') === 'true', autoScaleDelay: Number(tag(b, 'AutoScaleDelay') || 0),
      frameGeneration: tag(b, 'FrameGeneration'), scalingType: tag(b, 'ScalingType'),
    });
  }
  return out;
}

// LS filters: ';'-separated exe paths, exe names or window titles with * wildcards.
function filterMatches(filter, exePath, windowTitle = '') {
  const exe = (exePath || '').toLowerCase(); const base = P.basename(exe);
  for (let f of (filter || '').split(';')) {
    f = f.trim().toLowerCase(); if (!f) continue;
    if (f.includes('*')) {
      const re = new RegExp('^' + f.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
      if (re.test(windowTitle) || re.test(base) || re.test(exe)) return true;
    } else if (f === exe || f === base || (windowTitle && f === windowTitle.toLowerCase())) return true;
  }
  return false;
}

function profileFor(xml, exePath, windowTitle) {
  return parseProfiles(xml).find((p) => p.filter && filterMatches(p.filter, exePath, windowTitle)) || null;
}

// "S" + "Alt Control" -> { mods: 'ac', vk: 0x53 }
function hotkey(xml) {
  const key = tag(xml || '', 'Hotkey') || 'S';
  const mods = (tag(xml || '', 'HotkeyModifierKeys') || 'Alt Control').split(/[\s,]+/);
  const m = (mods.includes('Control') ? 'c' : '') + (mods.includes('Alt') ? 'a' : '') + (mods.includes('Shift') ? 's' : '') + (mods.includes('Windows') ? 'w' : '');
  let vk = 0;
  if (/^[A-Z0-9]$/i.test(key)) vk = key.toUpperCase().charCodeAt(0);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) vk = 0x6f + Number(key.slice(1));
  else if (/^D[0-9]$/.test(key)) vk = key.charCodeAt(1);
  return vk ? { mods: m, vk, label: `${mods.join('+')}+${key}` } : null;
}

// Clone a template profile into a new one bound to exePath with Auto Scale. Pure string edit, used
// by the one-time setup script; keeps every other setting of the template exactly.
function addProfile(xml, { title, exePath, delay = 5, template = null }) {
  const blocks = [...xml.matchAll(/([ \t]*)<Profile>([\s\S]*?)<\/Profile>/g)];
  if (!blocks.length) throw new Error('no <Profile> in Settings.xml');
  const src = (template && blocks.find((b) => unxml(tag(b[2], 'Title')) === template)) || blocks[0];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let body = src[0];
  body = body.replace(/<Title>[\s\S]*?<\/Title>/, `<Title>${esc(title)}</Title>`);
  body = body.replace(/\s*<Path>[\s\S]*?<\/Path>/, '').replace(/\s*<Path\s*\/>/, '');
  const ind = (body.match(/\n([ \t]*)<Title>/) || [, '      '])[1];
  body = body.replace(/(<Title>[\s\S]*?<\/Title>)/, `$1\n${ind}<Path>${esc(exePath)}</Path>`);
  body = body.replace(/<AutoScale>[\s\S]*?<\/AutoScale>/, '<AutoScale>true</AutoScale>');
  body = body.replace(/<AutoScaleDelay>[\s\S]*?<\/AutoScaleDelay>/, `<AutoScaleDelay>${delay}</AutoScaleDelay>`);
  const last = blocks[blocks.length - 1];
  const at = last.index + last[0].length;
  return xml.slice(0, at) + '\n' + body + xml.slice(at);
}

// Profiles this menu made itself ("<game> (PS5 Menu)", "<game> (Definitely Not PS5 Menu)").
const isMenuProfile = (title) => /\((Definitely Not )?PS5 Menu\)$/.test(title || '');

// Set Auto Scale delay of one profile (by title). Pure string edit; everything else stays.
function setAutoScaleDelay(xml, title, delay) {
  let done = false;
  const out = xml.replace(/<Profile>[\s\S]*?<\/Profile>/g, (b) => {
    if (done || unxml(tag(b, 'Title')) !== title) return b;
    done = true;
    return /<AutoScaleDelay>/.test(b) ? b.replace(/<AutoScaleDelay>[\s\S]*?<\/AutoScaleDelay>/, `<AutoScaleDelay>${delay}</AutoScaleDelay>`) : b;
  });
  return done ? out : xml;
}

// Start LS minimized without taking focus. `start /min` passes SW_SHOWMINNOACTIVE to the new process.
function startMinimized(exe) {
  return new Promise((resolve) => {
    try {
      const p = spawn('cmd.exe', ['/d', '/c', `start "" /min "${exe}"`], { cwd: P.dirname(exe), windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore', detached: true });
      p.once('error', () => resolve(false));
      p.once('exit', (c) => resolve(c === 0));
      p.unref();
    } catch { resolve(false); }
  });
}

module.exports = { findExe, settingsPath, parseProfiles, filterMatches, profileFor, hotkey, addProfile, setAutoScaleDelay, isMenuProfile, startMinimized, steamLibraries, EXE, MENU_DELAY: 1 };
