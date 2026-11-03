import {
  on, emit, registerCommand, replaceStub, executeCommand, addRibbonGroup, addRibbonTab, addEditorExtension,
  addBlockRenderer, addPanel, addStatusItem, addContextItem, reportError,
} from './registry.js';
import { cm } from './cmExports.js';

export const API_VERSION = 1;

const foldCase = (p) => window.api.platform === 'win32' ? p.toLowerCase() : p;
const same = (a, b) => !!a && !!b && foldCase(String(a)) === foldCase(String(b));
const norm = (p) => foldCase(String(p).replace(/\\/g, '/'));
const inside = (child, parent) => {
  const c = norm(child);
  const p = norm(parent).replace(/\/+$/, '');
  return c === p || c.startsWith((p || '') + '/');
};

// Construye el objeto `plumd` que recibe un plugin. Todo lo que registra queda marcado con su id para
// poder retirarlo al desactivarlo. `host` son las funciones de la aplicación; `entry` guarda sus datos.
export function createApi({ id, manifest, host, entry }) {
  const owner = id;
  const settingsSchema = manifest.contributes?.settings || {};

  const persist = () => window.api.pluginsDataSet(id, entry.data);
  const view = () => host.getView();

  // Un callback del plugin: sus errores se atribuyen al plugin y no rompen la aplicación.
  const safe = (fn) => (...args) => {
    try {
      const r = fn(...args);
      return r && typeof r.catch === 'function' ? r.catch((e) => reportError(owner, e)) : r;
    } catch (e) {
      reportError(owner, e);
      return undefined;
    }
  };

  const allowedPath = (p) => {
    const root = host.explorerRoot();
    if (root && inside(p, root)) return true;
    return host.listDocs().some((d) => same(d.path, p));
  };
  const needPath = (p) => {
    if (typeof p !== 'string' || !p) throw new Error('Falta la ruta.');
    if (!allowedPath(p)) throw new Error('Ruta fuera de la carpeta abierta y de los documentos abiertos.');
  };

  const api = {
    apiVersion: API_VERSION,
    app: Object.freeze({ version: host.version, apiVersion: API_VERSION, pluginId: id, baseUrl: `plumd-plugin://${id}/` }),
    cm,

    commands: {
      register(def) {
        replaceStub(def.id, owner);
        return registerCommand({ ...def, run: safe(def.run) }, owner);
      },
      execute: (cmd, arg) => executeCommand(cmd, arg),
    },

    editor: {
      getActive() {
        const v = view();
        const sel = v.state.selection.main;
        const d = host.getActive();
        return {
          path: d.file || null,
          name: host.docName(d),
          mode: host.getMode(),
          dirty: !!d.dirty,
          text: v.state.doc.toString(),
          selection: { from: sel.from, to: sel.to, text: v.state.sliceDoc(sel.from, sel.to) },
        };
      },
      insertAtCursor(text) {
        const v = view();
        const head = v.state.selection.main.head;
        v.dispatch({ changes: { from: head, insert: String(text) }, selection: { anchor: head + String(text).length }, scrollIntoView: true, userEvent: 'input.plugin' });
        v.focus();
      },
      replaceSelection(text) {
        const v = view();
        v.dispatch(v.state.replaceSelection(String(text)), { scrollIntoView: true, userEvent: 'input.plugin' });
        v.focus();
      },
      goto(pos) {
        const v = view();
        const p = Math.max(0, Math.min(v.state.doc.length, Number(pos) || 0));
        v.dispatch({ selection: { anchor: p }, scrollIntoView: true });
        v.focus();
      },
      registerExtension: (ext) => addEditorExtension(ext, owner),
      registerBlockRenderer: (def) => addBlockRenderer(def, owner),
    },

    documents: {
      open: (path) => host.openFile(path),
      list: () => host.listDocs(),
      activePath: () => host.getActive().file || null,
    },

    ui: {
      notify: (text) => host.notify(String(text)),
      confirm: (opts) => host.confirm(opts),
      prompt: (opts) => host.prompt(opts),
      ribbon: {
        addGroup(def) {
          if (!def || typeof def.tab !== 'string' || !Array.isArray(def.items)) throw new Error('addGroup necesita "tab" (id de la pestaña) e "items".');
          return addRibbonGroup(def, owner);
        },
        addTab(def) {
          if (!def || typeof def.id !== 'string' || !def.label) throw new Error('addTab necesita "id" y "label".');
          return addRibbonTab(def, owner);
        },
      },
      registerPanel: (def) => addPanel({ ...def, mount: safe(def.mount) }, owner),
      // Muestra el panel lateral propio del plugin (id sin prefijo) y abre la barra lateral si estaba oculta.
      showPanel: (panelId) => emit('panel:show', `${owner}:${panelId}`),
      statusBar: { addItem: (def) => addStatusItem({ ...def, onClick: def.onClick && safe(def.onClick) }, owner) },
      contextMenu: { add: (def) => addContextItem({ ...def, run: safe(def.run) }, owner) },
    },

    fs: {
      async read(path) {
        needPath(path);
        return (await window.api.readFile(path)).content;
      },
      async list(dir) {
        needPath(dir);
        const r = await window.api.fsListDir(dir);
        if (!r.ok) throw new Error(r.error);
        return r.entries;
      },
      // No sobrescribe un fichero existente salvo que se pida con { overwrite: true }.
      async write(path, content, { overwrite = false } = {}) {
        needPath(path);
        if (!overwrite) {
          const exists = await window.api.readFile(path).then(() => true, () => false);
          if (exists) throw new Error('El fichero ya existe. Usa { overwrite: true } para sustituirlo.');
        }
        await window.api.writeFile({ path, content: String(content), expectedMtimeMs: null, force: true });
      },
    },

    settings: {
      get(key) {
        const v = entry.data.settings?.[key];
        return v !== undefined ? v : settingsSchema[key]?.default;
      },
      set(key, value) {
        entry.data.settings = { ...entry.data.settings, [key]: value };
        persist();
        entry.notifySettings(key, value);
      },
      all() {
        const out = {};
        for (const k of Object.keys(settingsSchema)) out[k] = api.settings.get(k);
        return out;
      },
      onChange(cb) {
        const f = safe(cb);
        entry.settingsListeners.add(f);
        return { dispose: () => entry.settingsListeners.delete(f) };
      },
    },

    storage: {
      get: (key) => entry.data.storage?.[key],
      set(key, value) {
        entry.data.storage = { ...entry.data.storage, [key]: value };
        return persist();
      },
    },

    on: (event, cb) => on(event, cb, owner),
  };
  return Object.freeze(api);
}
