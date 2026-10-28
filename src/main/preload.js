const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (args) => ipcRenderer.invoke('file:write', args),
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  saveAsDialog: (name) => ipcRenderer.invoke('file:saveAsDialog', name),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openLocal: (url, baseDir) => ipcRenderer.invoke('shell:openLocal', url, baseDir),
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  pasteImage: (docPath) => ipcRenderer.invoke('image:pasteClipboard', docPath),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (t) => ipcRenderer.invoke('clipboard:write', t),
  appInfo: () => ipcRenderer.invoke('app:info'),
  // Ruta real de un fichero soltado en la ventana (Electron ya no expone file.path).
  // La ruta se comunica también al proceso principal, que la autoriza (solo existe para ficheros reales).
  pathForFile: (f) => {
    const p = webUtils.getPathForFile(f);
    if (p) ipcRenderer.send('access:dropped', p);
    return p;
  },
  pickFolder: (startAt) => ipcRenderer.invoke('fs:pickFolder', startAt),
  isDir: (p) => ipcRenderer.invoke('fs:isDir', p),
  fsSetRoot: (p) => ipcRenderer.invoke('fs:setRoot', p),
  fsListDir: (p) => ipcRenderer.invoke('fs:listDir', p),
  fsCreate: (dir, name) => ipcRenderer.invoke('fs:create', dir, name),
  fsRename: (p, name) => ipcRenderer.invoke('fs:rename', p, name),
  fsCopy: (src, dir) => ipcRenderer.invoke('fs:copy', src, dir),
  fsDelete: (p, permanent) => ipcRenderer.invoke('fs:delete', p, permanent === true),
  fsMkdir: (dir, name) => ipcRenderer.invoke('fs:mkdir', dir, name),
  fsCheckDir: (p) => ipcRenderer.invoke('fs:checkDir', p),
  fsDeleteDir: (p) => ipcRenderer.invoke('fs:deleteDir', p),
  reveal: (p) => ipcRenderer.invoke('fs:reveal', p),
  imageCopy: (docPath, src) => ipcRenderer.invoke('image:copy', docPath, src),
  imageReveal: (docPath, src) => ipcRenderer.invoke('image:reveal', docPath, src),
  pluginsList: () => ipcRenderer.invoke('plugins:list'),
  pluginsSetEnabled: (id, on, v) => ipcRenderer.invoke('plugins:setEnabled', id, on, v),
  pluginsFailure: (id) => ipcRenderer.invoke('plugins:failure', id),
  pluginsMarkLoading: (v) => ipcRenderer.invoke('plugins:markLoading', v),
  pluginsDataGet: (id) => ipcRenderer.invoke('plugins:dataGet', id),
  pluginsDataSet: (id, obj) => ipcRenderer.invoke('plugins:dataSet', id, obj),
  pluginsOpenFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  pluginsInstall: () => ipcRenderer.invoke('plugins:install'),
  setTitle: (t) => ipcRenderer.invoke('window:setTitle', t),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, f) => cb(f)),
});
