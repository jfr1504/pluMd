const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, ClipboardItem, nativeImage, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { createFsOps } = require('./fsops');
const { MD_RE, DENIED, createAccess, writeAtomic, savePastedImage, resolveImagePath } = require('./acceso');
const { readClipboardPng } = require('./portapapeles');
const { createPlugins, registerScheme } = require('./plugins');

// El esquema plumd-plugin:// (ficheros de los plugins) debe registrarse antes de que la app esté lista.
registerScheme(protocol);

// Un único proceso: un doble clic con la app abierta abre el fichero en la ventana existente.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let pendingFile = null;

function fileFromArgs(argv) {
  const args = app.isPackaged ? argv.slice(1) : argv.slice(2);
  return args.find((a) => !a.startsWith('-') && /\.(md|markdown|txt)$/i.test(a) && fs.existsSync(a)) || null;
}

async function sendOpen(file) {
  if (access) await access.allowFile(file);
  if (win && !win.webContents.isLoading()) win.webContents.send('open-file', file);
  else pendingFile = file;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff',
    title: 'PluMd',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  // La ventana nunca navega fuera de la aplicación (p. ej. al soltar un fichero fuera de la zona de arrastre).
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Cerrar con documentos sin guardar: pide confirmación.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Salir sin guardar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Cambios sin guardar',
      message: 'Hay documentos con cambios sin guardar. ¿Salir de todos modos?',
    });
    if (choice === 0) e.preventDefault(); // ignora el bloqueo y deja cerrar
  });
  win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      win.webContents.send('open-file', pendingFile);
      pendingFile = null;
    }
  });
  win.on('closed', () => (win = null));
}

app.on('second-instance', (_e, argv) => {
  const f = fileFromArgs(argv);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  if (f) sendOpen(f);
});

// macOS-style open event; también útil si se arranca ya con fichero.
app.on('open-file', (e, f) => {
  e.preventDefault();
  sendOpen(f);
});

let plugins = null;
let access = null; // ficheros y carpetas autorizados (acceso.js)

app.whenReady().then(() => {
  access = createAccess({ storeFile: path.join(app.getPath('userData'), 'carpetas.json') });
  plugins = createPlugins({ userDataDir: app.getPath('userData'), argv: process.argv });
  plugins.installProtocol(protocol, net);
  pendingFile = fileFromArgs(process.argv);
  if (pendingFile) access.allowFile(pendingFile);
  createWindow();
});

app.on('window-all-closed', () => app.quit());

// ---- IPC: panel de carpetas ----
// Todo pasa por fsops.js: solo se opera dentro de la carpeta que el usuario eligió, nunca se sobrescribe
// y borrar solo envía a la Papelera y se niega en unidades de red.
const ops = createFsOps({ trash: (p) => shell.trashItem(p) });
const guard = (fn) => async (_e, ...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

ipcMain.handle('fs:pickFolder', async (_e, startAt) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    ...(typeof startAt === 'string' && startAt ? { defaultPath: startAt } : {}),
  });
  if (r.canceled) return null;
  await access.allowRoot(r.filePaths[0]);
  return r.filePaths[0];
});
// Un fichero o carpeta soltado en la ventana: la ruta sale de webUtils.getPathForFile en el preload,
// que solo devuelve ruta para ficheros reales del disco, no para objetos fabricados por la página.
// Las lecturas y escrituras siguientes esperan a que termine (authQueue), porque llegan justo detrás.
let authQueue = Promise.resolve();
ipcMain.on('access:dropped', (_e, p) => {
  if (typeof p !== 'string' || !p) return;
  authQueue = authQueue.then(async () => {
    try {
      if ((await fs.promises.stat(p)).isDirectory()) await access.allowRoot(p);
      else if (MD_RE.test(p)) await access.allowFile(p);
    } catch {
      /* ruta inexistente: no se autoriza */
    }
  });
});
ipcMain.handle('fs:isDir', async (_e, p) => {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
});
ipcMain.handle('fs:setRoot', guard(async (dir) => {
  await authQueue;
  if (!(await access.rootAllowed(dir))) throw new Error('Esa carpeta no está autorizada: ábrela con «Abrir carpeta» o arrástrala a la ventana.');
  return { ok: true, ...(await ops.setRoot(dir)) };
}));
ipcMain.handle('fs:listDir', guard(async (dir) => ({ ok: true, entries: await ops.listDir(dir) })));
ipcMain.handle('fs:create', guard((dir, name) => ops.create(dir, name)));
ipcMain.handle('fs:rename', guard((p, name) => ops.rename(p, name)));
ipcMain.handle('fs:copy', guard((src, dir) => ops.copy(src, dir)));
ipcMain.handle('fs:delete', guard((p, permanent) => ops.remove(p, { permanent: permanent === true })));
ipcMain.handle('fs:mkdir', guard((dir, name) => ops.createDir(dir, name)));
ipcMain.handle('fs:checkDir', guard((p) => ops.canRemoveDir(p)));
ipcMain.handle('fs:deleteDir', guard((p) => ops.removeDir(p)));
// Mostrar en el Explorador: documentos de la carpeta abierta o que el usuario eligió (pestañas abiertas).
ipcMain.handle('fs:reveal', async (_e, p) => {
  if ((await ops.contains(p)) || (await access.fileAllowed(p))) shell.showItemInFolder(p);
});

// ---- IPC: ficheros ----
// Solo se lee y escribe un fichero que el usuario eligió o un documento dentro de la carpeta abierta.
// Borrar y renombrar solo ocurren desde el panel de carpetas (fsops.js).
async function mayUse(file) {
  await authQueue;
  if (typeof file !== 'string' || !file) return false;
  if (await access.fileAllowed(file)) return true;
  return MD_RE.test(file) && (await ops.contains(file));
}
const denied = () => new Error(DENIED);

ipcMain.handle('file:read', async (_e, file) => {
  if (!(await mayUse(file))) throw denied();
  const [content, stat] = await Promise.all([fs.promises.readFile(file, 'utf8'), fs.promises.stat(file)]);
  return { path: file, content: content.replace(/^﻿/, ''), mtimeMs: stat.mtimeMs };
});

// Si el fichero cambió en disco desde que se abrió (p. ej. carpeta de red compartida), avisa en vez de pisar.
ipcMain.handle('file:write', async (_e, { path: file, content, expectedMtimeMs, force }) => {
  if (!(await mayUse(file))) throw denied();
  if (!force && expectedMtimeMs != null) {
    try {
      const stat = await fs.promises.stat(file);
      if (Math.abs(stat.mtimeMs - expectedMtimeMs) > 1) return { ok: false, conflict: true };
    } catch {
      /* el fichero ya no existe: se escribe de nuevo */
    }
  }
  await writeAtomic(file, String(content));
  const stat = await fs.promises.stat(file);
  return { ok: true, mtimeMs: stat.mtimeMs };
});

ipcMain.handle('file:openDialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  });
  if (r.canceled) return null;
  await access.allowFile(r.filePaths[0]);
  return r.filePaths[0];
});

ipcMain.handle('file:saveAsDialog', async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: suggested,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (r.canceled) return null;
  await access.allowFile(r.filePath);
  return r.filePath;
});

// Solo se abren enlaces web y de correo; nunca rutas locales ni otros esquemas.
ipcMain.handle('shell:openExternal', async (_e, url) => {
  try {
    const u = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) await shell.openExternal(u.href);
  } catch {
    /* URL no válida: se ignora */
  }
});

// Vínculos locales (file:// o ruta relativa): una carpeta se abre en el Explorador; un fichero solo
// se devuelve al renderer, que decide (únicamente abre Markdown). Nunca se ejecuta ni se borra nada.
ipcMain.handle('shell:openLocal', async (_e, url, baseDir) => {
  let p;
  try {
    if (/^file:/i.test(url)) p = require('url').fileURLToPath(url);
    else if (baseDir) p = path.resolve(baseDir, decodeURI(url));
    else return { kind: 'missing', path: url };
  } catch {
    return { kind: 'missing', path: url };
  }
  try {
    const st = await fs.promises.stat(p);
    if (st.isDirectory()) {
      const err = await shell.openPath(p);
      return err ? { kind: 'missing', path: p } : { kind: 'dir', path: p };
    }
    // El usuario ha pulsado el vínculo: si es Markdown se autoriza para que el renderer lo abra.
    if (MD_RE.test(p)) await access.allowFile(p);
    return { kind: 'file', path: p };
  } catch {
    return { kind: 'missing', path: p };
  }
});

ipcMain.handle('file:pickImage', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

// Imagen del portapapeles (p. ej. una captura) -> «imagenes/aammdd_hhmm.png» junto al documento.
// La imagen la lee el proceso principal del propio portapapeles: el renderer no envía datos.
ipcMain.handle('image:pasteClipboard', async (_e, docPath) => {
  if (!(await mayUse(docPath))) throw denied();
  const png = await readClipboardPng(clipboard, nativeImage);
  if (!png) return { ok: false };
  return { ok: true, ...(await savePastedImage(docPath, png)) };
});
// Imágenes del documento (menú contextual): la ruta se resuelve a partir de lo escrito en el vínculo (acceso.js)
// y solo se copia al portapapeles o se muestra en el Explorador: nunca se abre ni se ejecuta.
const localImagePath = (docPath, src) => resolveImagePath(docPath, src, mayUse);
ipcMain.handle('image:copy', guard(async (docPath, src) => {
  const img = nativeImage.createFromPath(await localImagePath(docPath, src));
  if (img.isEmpty()) return { ok: false, error: 'No se pudo leer la imagen (los SVG no se pueden copiar como imagen).' };
  // Desde Electron 45 el portapapeles es asíncrono y ya no existe writeImage().
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]);
  return { ok: true };
}));
ipcMain.handle('image:reveal', guard(async (docPath, src) => {
  shell.showItemInFolder(await localImagePath(docPath, src));
  return { ok: true };
}));
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

ipcMain.handle('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
}));

// ---- IPC: plugins ----
ipcMain.handle('plugins:list', () => plugins.list());
ipcMain.handle('plugins:setEnabled', (_e, id, on, consentVersion) => plugins.setEnabled(id, on, consentVersion));
ipcMain.handle('plugins:failure', (_e, id) => plugins.recordFailure(id));
ipcMain.handle('plugins:markLoading', (_e, v) => plugins.markLoading(v));
ipcMain.handle('plugins:dataGet', (_e, id) => plugins.dataGet(id));
ipcMain.handle('plugins:dataSet', (_e, id, obj) => plugins.dataSet(id, obj));
ipcMain.handle('plugins:openFolder', () => shell.openPath(plugins.dir));
ipcMain.handle('plugins:install', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Elige la carpeta del plugin', properties: ['openDirectory'] });
  if (r.canceled) return { ok: false, canceled: true };
  return plugins.install(r.filePaths[0]);
});

ipcMain.handle('window:setTitle', (_e, t) => win && win.setTitle(t));
