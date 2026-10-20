// electron-builder afterPack hook: puts the app icon and version info into the exe with resedit,
// so the Windows build can be made on Linux without wine (signAndEditExecutable is off).
const fs = require('fs'); const path = require('path');
exports.default = async (context) => {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'resedit', 'dist', 'index.js'));
  const PELibrary = await import(path.join(__dirname, '..', '..', 'tools', 'node', 'node_modules', 'pe-library', 'dist', 'index.js'));
  const info = context.packager.appInfo;
  fs.rmSync(path.join(context.appOutDir, 'resources', 'default_app.asar'), { force: true }); // Electron's demo app, unused
  const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
  const pe = PELibrary.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PELibrary.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icons', 'app.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const gid = groups.length ? groups[0].id : 1; const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [a, b, c] = info.version.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: info.productName, ProductName: info.productName, CompanyName: 'Kutay Kılıç',
    OriginalFilename: `${info.productFilename}.exe`, InternalName: info.productName, LegalCopyright: 'Copyright (c) 2026 Kutay Kılıç, MIT',
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • afterPack: icon + version info set on', path.basename(exe));
};
