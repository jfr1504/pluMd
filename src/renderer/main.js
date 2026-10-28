import { EditorState, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, drawSelection, lineNumbers, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo, selectAll } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { livePreview, skipHiddenForward } from './livePreview.js';
import { tableField, tableCellAt } from './tables.js';
import { showMenu } from './contextmenu.js';
import { editorMenuItems, tableMenuItems, pluginItems } from './editorMenu.js';
import { codeLanguages, codeHighlight } from './highlight.js';
import { headingFolding, foldKeymap, foldAllHeadings, expandAll } from './folding.js';
import { setScope } from './colors.js';
import { applySkin, listSkins, getSkin, hasSkin } from './skins.js';
import { setBaseDir, dirname } from './images.js';
import {
  toggleWrap, setParagraphStyle, toggleList, toggleTaskList, changeIndent, insertRule, insertCodeBlock, exitCodeBlock,
  insertComment, insertFrontmatter, clearFormat, paragraphEnter, softBreak, exitEmptyListItem, clipCopy, clipPaste, formatState,
  insertTable, insertLink, insertImage, linkAt, normalizeUrl,
} from './commands.js';
import { askLink, askImage, askForm, openColors, showAbout, confirmBox, REPO_URL } from './dialogs.js';
import { createRibbon } from './ribbon.js';
import { createExplorer } from './explorer.js';
import { on, emit, items, removeItem, reportError, registerCommand, getCommand, executeCommand } from './plugins/registry.js';
import { blockField, refreshBlocks } from './plugins/blockRenderers.js';
import { initPlugins, startPlugins, reloadPlugins, failedCount } from './plugins/loader.js';
import { openPluginsDialog, openPalette } from './plugins/ui.js';
import { initSidebarPanels } from './plugins/sidebar.js';
import { initStatusItems } from './plugins/statusbar.js';
import { slashMenu } from './slashMenu.js';

const $ = (id) => document.getElementById(id);
const scroller = () => document.querySelector('main');

const state = { mode: 'read', zoom: 100 };
const modeCompartment = new Compartment();
const pluginCompartment = new Compartment(); // extensiones de CodeMirror que aportan los plugins
const pluginExtensions = () => items('extensions').map((e) => e.ext);
let ribbon = null;
let explorer = null;

// ---- Documentos abiertos (una pestaña por documento) ----
// Cada documento conserva su propio EditorState: texto, deshacer, selección y pliegues.
const docs = [];
let cur = null;
let nextId = 1;
let untitledCount = 0;

// Lectura: documento limpio (marcas ocultas), editable como en un procesador de textos.
// Código: el Markdown tal cual.
const modeExtensions = (mode) =>
  mode === 'read' ? [livePreview({ reveal: false }), tableField, blockField] : [lineNumbers()];

// Ctrl+clic sobre un enlace lo abre en el navegador.
const linkClicks = EditorView.domEventHandlers({
  click(e, v) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
    const l = pos == null ? null : linkAt(v.state, pos);
    if (!l) return false;
    openLink(l.url);
    return true;
  },
});

// Pega la imagen del portapapeles en «imagenes/» junto al documento y deja el vínculo en el texto.
async function pasteImage(v) {
  if (!cur || !cur.file) return showBanner('Guarda el documento antes de pegar una imagen: se guarda en una carpeta «imagenes» junto a él.');
  let r;
  try {
    r = await window.api.pasteImage(cur.file);
  } catch (e) {
    return showBanner(`No se pudo pegar la imagen: ${e.message}`);
  }
  if (!r.ok) return;
  v.dispatch(v.state.replaceSelection(`![](${r.relative})`), { scrollIntoView: true, userEvent: 'input.paste' });
  toast(`Imagen guardada como ${r.relative}`);
}

// Ctrl+V con una imagen en el portapapeles (y sin texto): se guarda como fichero en vez de pegarse.
const imagePaste = EditorView.domEventHandlers({
  paste(e, v) {
    const t = e.clipboardData;
    if (!t || t.types.includes('text/plain')) return false;
    if (![...t.items].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) return false;
    e.preventDefault();
    pasteImage(v);
    return true;
  },
});

// Web y correo van al navegador; una carpeta se abre en el Explorador; un .md se abre en una pestaña.
async function openLink(url) {
  const u = normalizeUrl(url);
  if (/^(https?|mailto):/i.test(u)) return window.api.openExternal(u);
  if (u.startsWith('#')) return;
  const r = await window.api.openLocal(u, cur && cur.file ? dirname(cur.file) : null);
  if (r.kind === 'missing') toast(`No existe: ${r.path || url}`);
  else if (r.kind === 'file') {
    if (MD_RE.test(r.path)) openFile(r.path);
    else toast('Solo se abren carpetas y documentos Markdown desde un vínculo.');
  }
}

function endKey(v, extend) {
  const sel = v.state.selection.main;
  const pos = skipHiddenForward(v, v.moveToLineBoundary(sel, true).head);
  v.dispatch({ selection: extend ? { anchor: sel.anchor, head: pos } : { anchor: pos }, scrollIntoView: true });
  return true;
}

const askImageHere = (d) => askImage(d, () => cur && cur.file);

let countTimer = null;
function updateCount(s) {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    const n = (s.doc.toString().match(/\S+/g) || []).length;
    $('wordcount').textContent = `${n} ${n === 1 ? 'palabra' : 'palabras'}`;
  }, 200);
}

// Aviso de cambio de documento para los plugins, agrupado para no saturarlos al escribir.
let changedTimer = null;
function scheduleChanged() {
  clearTimeout(changedTimer);
  changedTimer = setTimeout(() => emit('document:changed', { path: cur?.file || null }), 300);
}

const baseExtensions = [
  history(),
  drawSelection(),
  EditorView.lineWrapping,
  placeholder('Escribe aquí o abre un fichero .md (Ctrl+O)'),
  markdown({ base: markdownLanguage, codeLanguages }),
  codeHighlight,
  headingFolding,
  slashMenu(),
  // Con las marcas de formato ocultas, Fin e Intro dejan el cursor fuera del formato: así un Intro
  // al final de un texto en negrita no parte la negrita entre dos párrafos.
  Prec.highest(keymap.of([
    {
      key: 'Enter',
      run: (v) => {
        if (exitEmptyListItem(v)) return true;
        const s = v.state.selection.main;
        if (s.empty) {
          const p = skipHiddenForward(v, s.head);
          if (p !== s.head) v.dispatch({ selection: { anchor: p } });
        }
        if (state.mode === 'read' && paragraphEnter(v)) return true;
        return false; // sigue el Intro normal (continuar lista, etc.)
      },
    },
    { key: 'Shift-Enter', run: (v) => state.mode === 'read' && softBreak(v) },
    { key: 'End', run: (v) => endKey(v, false), shift: (v) => endKey(v, true) },
  ])),
  keymap.of([
    { key: 'Mod-b', run: (v) => (toggleWrap(v, '**'), true) },
    { key: 'Mod-i', run: (v) => (toggleWrap(v, '*'), true) },
    { key: 'Mod-u', run: (v) => (toggleWrap(v, '<u>', '</u>'), true) },
    { key: 'Mod-k', run: (v) => (insertLink(v, askLink), true) },
    { key: 'Mod-h', run: (v) => (openSearchPanel(v), true) },
    // Tab sangra los elementos de lista; en texto normal no hace nada (Markdown no tiene sangría de párrafo).
    { key: 'Tab', run: (v) => changeIndent(v, 1) || true },
    { key: 'Shift-Tab', run: (v) => changeIndent(v, -1) || true },
    { key: 'Mod-Enter', run: (v) => exitCodeBlock(v) },
    { key: 'ArrowDown', run: (v) => exitCodeBlock(v, true) },
    ...foldKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap,
  ]),
  linkClicks,
  imagePaste,
  modeCompartment.of(modeExtensions(state.mode)),
  pluginCompartment.of(pluginExtensions()),
  EditorView.updateListener.of((u) => {
    if (u.docChanged && cur) {
      if (!cur.dirty) { cur.dirty = true; renderTabs(); }
      updateTitle();
      updateCount(u.state);
      scheduleChanged();
    }
    if ((u.docChanged || u.selectionSet) && ribbon) ribbon.update(formatState(u.state));
  }),
];

function newDocObj(file, content, mtimeMs) {
  return {
    id: nextId++,
    file,
    mtimeMs,
    dirty: false,
    scroll: 0,
    untitled: file ? 0 : ++untitledCount,
    state: EditorState.create({ doc: content, extensions: baseExtensions }),
  };
}

const first = newDocObj(null, '', null);
docs.push(first);
cur = first;

const view = new EditorView({ parent: $('editor'), state: first.state });

const docName = (d) => (d.file ? d.file.split(/[\\/]/).pop() : d.untitled > 1 ? `Documento sin título ${d.untitled}` : 'Documento sin título');

function updateTitle() {
  if (!cur) {
    $('filename').textContent = '';
    $('dirty').hidden = true;
    window.api.setTitle('PluMd');
    return;
  }
  $('filename').textContent = docName(cur);
  $('dirty').hidden = !cur.dirty;
  window.api.setTitle(`${cur.dirty ? '● ' : ''}${docName(cur)} — PluMd`);
}

// Sin documentos abiertos: se oculta el editor y se ofrece crear uno nuevo o abrir un fichero.
function showNoDocs(on) {
  $('editor').hidden = on;
  $('no-docs').hidden = !on;
  if (on) $('wordcount').textContent = '';
}

function showBanner(text, actions = [], sticky = false) {
  const b = $('banner');
  b.dataset.sticky = sticky ? '1' : '';
  b.innerHTML = '';
  b.append(text + ' ');
  for (const [label, fn] of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => { b.hidden = true; fn(); };
    b.append(btn);
  }
  b.hidden = false;
}

// ---- Pestañas ----
function renderTabs() {
  const bar = $('doctabs');
  bar.textContent = '';
  for (const d of docs) {
    const t = document.createElement('div');
    t.className = 'dtab' + (d === cur ? ' active' : '');
    t.setAttribute('role', 'tab');
    t.title = d.file || docName(d);
    const name = document.createElement('span');
    name.className = 'dtab-name';
    name.textContent = docName(d);
    const dot = document.createElement('span');
    dot.className = 'dtab-dirty';
    dot.textContent = '●';
    dot.hidden = !d.dirty;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dtab-close';
    close.title = 'Cerrar (Ctrl+W)';
    close.textContent = '×';
    t.append(name, dot, close);
    t.addEventListener('click', (e) => (e.target.closest('.dtab-close') ? closeDoc(d) : activate(d)));
    t.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeDoc(d); } });
    bar.append(t);
  }
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'dtab-new';
  plus.title = 'Nuevo documento (Ctrl+N)';
  plus.textContent = '+';
  plus.addEventListener('click', () => newDoc());
  bar.append(plus);
  bar.querySelector('.dtab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function activate(doc) {
  if (cur && cur !== doc) {
    cur.state = view.state;
    cur.scroll = scroller().scrollTop;
  }
  cur = doc;
  showNoDocs(false);
  // La carpeta base se fija antes de montar el estado para que las imágenes relativas se resuelvan bien.
  setBaseDir(doc.file ? dirname(doc.file) : null);
  view.setState(doc.state);
  view.dispatch({ effects: modeCompartment.reconfigure(modeExtensions(state.mode)) });
  applyPluginExtensions();
  $('editor').classList.toggle('source', state.mode === 'source');
  if (!$('banner').dataset.sticky) $('banner').hidden = true;
  renderTabs();
  updateTitle();
  updateCount(view.state);
  ribbon?.update(formatState(view.state));
  explorer?.setActive(doc.file);
  requestAnimationFrame(() => { scroller().scrollTop = doc.scroll; });
  view.focus();
  emit('document:activated', { path: doc.file || null });
}

// Aplica las extensiones de CodeMirror de los plugins activos al documento visible. Si alguna no es
// válida, se identifica de qué plugin es, se retira y se le cuenta como fallo, en lugar de dejar el
// editor roto o quitar las extensiones de los demás plugins.
function applyPluginExtensions() {
  const apply = () => view.dispatch({ effects: [pluginCompartment.reconfigure(pluginExtensions()), refreshBlocks.of(null)] });
  try {
    apply();
    return;
  } catch (e) {
    console.error('[plugins] extensión de editor no válida', e);
  }
  for (const entry of [...items('extensions')]) {
    try {
      EditorState.create({ extensions: [entry.ext] });
    } catch (err) {
      removeItem('extensions', entry);
      reportError(entry.owner, new Error(`Aportó una extensión del editor no válida (${err.message})`));
    }
  }
  try {
    apply();
  } catch {
    try { view.dispatch({ effects: [pluginCompartment.reconfigure([]), refreshBlocks.of(null)] }); } catch { /* sin extensiones */ }
    toast('Las extensiones de los plugins no son válidas y se han retirado. Revisa Ayuda > Administrar plugins.');
  }
}

function newDoc() {
  const d = newDocObj(null, '', null);
  docs.push(d);
  activate(d);
}

// Devuelve false si el usuario decidió no cerrar un documento con cambios sin guardar.
function closeDoc(d) {
  if (!d) return true;
  if (d.dirty && !confirm(`«${docName(d)}» tiene cambios sin guardar. ¿Cerrar sin guardar?`)) return false;
  const i = docs.indexOf(d);
  docs.splice(i, 1);
  emit('document:closed', { path: d.file || null });
  if (!docs.length) {
    // Se puede cerrar todo: no se abre otro documento solo. La numeración de «sin título» vuelve a empezar.
    cur = null;
    untitledCount = 0;
    showNoDocs(true);
    renderTabs();
    updateTitle();
    explorer?.setActive(null);
    ribbon?.update(formatState(view.state));
    return true;
  }
  if (d === cur) activate(docs[Math.min(i, docs.length - 1)]);
  else renderTabs();
  return true;
}

// Cierra varios documentos en orden; se detiene si el usuario cancela uno con cambios sin guardar.
function closeDocs(list) {
  for (const d of list) if (!closeDoc(d)) return;
}

async function openFile(path) {
  if (!path) return;
  const same = docs.find((d) => d.file && d.file.toLowerCase() === path.toLowerCase());
  if (same) return activate(same);
  try {
    const f = await window.api.readFile(path);
    const doc = newDocObj(f.path, f.content, f.mtimeMs);
    // Un documento nuevo, vacío y sin tocar se reutiliza en vez de dejar una pestaña vacía.
    const pristine = !!cur && !cur.file && !cur.dirty && view.state.doc.length === 0;
    if (pristine) docs[docs.indexOf(cur)] = doc;
    else docs.push(doc);
    if (pristine) cur = null;
    activate(doc);
    emit('document:opened', { path: doc.file });
  } catch (e) {
    showBanner(`No se pudo abrir el fichero: ${e.message}`);
  }
}

async function save(force = false) {
  const d = cur;
  if (!d) return;
  if (!d.file) return saveAs();
  const content = view.state.doc.toString();
  let r;
  try {
    r = await window.api.writeFile({ path: d.file, content, expectedMtimeMs: d.mtimeMs, force });
  } catch (e) {
    // El documento sigue marcado como no guardado.
    showBanner(`No se pudo guardar: ${e.message}`);
    return;
  }
  if (r.conflict) {
    showBanner('El fichero ha cambiado en disco desde que lo abriste.', [
      ['Sobrescribir', () => save(true)],
      ['Cancelar', () => {}],
    ]);
    return;
  }
  d.mtimeMs = r.mtimeMs;
  d.dirty = false;
  renderTabs();
  if (d === cur) updateTitle();
  emit('document:saved', { path: d.file });
}

async function saveAs() {
  const d = cur;
  if (!d) return;
  const content = view.state.doc.toString();
  const p = await window.api.saveAsDialog(d.file || 'sin-titulo.md');
  if (!p) return;
  let r;
  try {
    r = await window.api.writeFile({ path: p, content, expectedMtimeMs: null, force: true });
  } catch (e) {
    showBanner(`No se pudo guardar: ${e.message}`);
    return;
  }
  d.file = p;
  d.mtimeMs = r.mtimeMs;
  d.dirty = false;
  if (d === cur) setBaseDir(dirname(p));
  renderTabs();
  if (d === cur) { updateTitle(); explorer?.setActive(p); }
  explorer?.refresh();
}

function setMode(mode) {
  state.mode = mode;
  view.dispatch({ effects: modeCompartment.reconfigure(modeExtensions(mode)) });
  $('editor').classList.toggle('source', mode === 'source');
  ribbon.setActive({ 'mode-read': mode === 'read', 'mode-source': mode === 'source' });
  view.focus();
  emit('mode:changed', { mode });
}

// Aspecto = skin (forma) x modo (claro/oscuro). Los colores personalizados son de cada combinación.
function refreshAppearance() {
  const root = document.documentElement;
  const skin = root.dataset.skin || 'plumd';
  const theme = root.dataset.theme || 'light';
  setScope(skin, theme);
  const active = { 'theme-light': theme === 'light', 'theme-dark': theme === 'dark' };
  for (const k of listSkins()) active[`skin-${k.id}`] = k.id === skin;
  ribbon.setActive(active);
  // Los bloques que dibujan los plugins se repintan con el aspecto nuevo.
  view.dispatch({ effects: refreshBlocks.of(null) });
  emit('theme:changed', { skin, theme });
}
function chooseTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch {}
  refreshAppearance();
}
async function chooseSkin(id) {
  const applied = await applySkin(id);
  try { localStorage.setItem('skin', applied); } catch {}
  refreshAppearance();
}
const appearanceLabel = () => {
  const root = document.documentElement;
  return `${getSkin(root.dataset.skin).name}, modo ${root.dataset.theme === 'dark' ? 'oscuro' : 'claro'}`;
};

function setZoom(z) {
  state.zoom = Math.max(50, Math.min(250, Math.round(z)));
  $('editor').style.setProperty('--zoom', state.zoom / 100);
  $('zoom').value = state.zoom;
  $('zoomval').textContent = `${state.zoom}%`;
}

// ---- Comandos de la cinta ----
const commands = {
  // Archivo
  new: () => newDoc(),
  open: async () => openFile(await window.api.openDialog()),
  save: () => save(),
  saveas: () => saveAs(),
  close: () => closeDoc(cur),
  'open-folder': () => explorer.openFolderDialog(),
  'toggle-sidebar': () => explorer.toggle(),
  about: async () => showAbout(await window.api.appInfo()),
  repo: () => window.api.openExternal(REPO_URL),
  // Portapapeles y edición
  undo: (v) => (undo(v), v.focus()),
  redo: (v) => (redo(v), v.focus()),
  paste: (v) => clipPaste(v, pasteImage),
  cut: (v) => clipCopy(v, true),
  copy: (v) => clipCopy(v, false),
  find: (v) => openSearchPanel(v),
  replace: (v) => openSearchPanel(v),
  selectall: (v) => (selectAll(v), v.focus()),
  // Fuente
  bold: (v) => toggleWrap(v, '**'),
  italic: (v) => toggleWrap(v, '*'),
  underline: (v) => toggleWrap(v, '<u>', '</u>'),
  strike: (v) => toggleWrap(v, '~~'),
  sub: (v) => toggleWrap(v, '<sub>', '</sub>'),
  sup: (v) => toggleWrap(v, '<sup>', '</sup>'),
  code: (v) => toggleWrap(v, '`'),
  clear: (v) => clearFormat(v),
  // Párrafo
  ul: (v) => toggleList(v, 'ul'),
  ol: (v) => toggleList(v, 'ol'),
  task: (v) => toggleTaskList(v),
  outdent: (v) => changeIndent(v, -1),
  indent: (v) => changeIndent(v, 1),
  rule: (v) => insertRule(v),
  // Insertar
  link: (v) => insertLink(v, askLink),
  image: (v) => insertImage(v, askImageHere),
  table: (v, a) => insertTable(v, a?.rows || 3, a?.cols || 3),
  codeblock: (v) => insertCodeBlock(v, ribbon.codeLang()),
  comment: (v) => insertComment(v),
  props: (v) => insertFrontmatter(v),
  // Vista
  'mode-read': () => setMode('read'),
  'mode-source': () => setMode('source'),
  'zoom-in': () => setZoom(state.zoom + 10),
  'zoom-out': () => setZoom(state.zoom - 10),
  'zoom-reset': () => setZoom(100),
  'theme-light': () => chooseTheme('light'),
  'theme-dark': () => chooseTheme('dark'),
  'fold-all': (v) => (foldAllHeadings(v), v.focus()),
  'unfold-all': (v) => (expandAll(v), v.focus()),
  colors: () => openColors(appearanceLabel()),
};
Object.assign(commands, {
  plugins: () => openPluginsDialog(pluginHost),
  'plugins-folder': () => window.api.pluginsOpenFolder(),
  'plugins-reload': async () => {
    await reloadPlugins();
    toast('Plugins recargados.');
  },
  palette: () => openPalette(ribbon.entries()),
});
for (const k of listSkins()) commands[`skin-${k.id}`] = () => chooseSkin(k.id);
for (const n of [1, 2, 3, 4, 5, 6]) commands[`style-h${n}`] = (v) => setParagraphStyle(v, `h${n}`);
commands['style-normal'] = (v) => setParagraphStyle(v, 'normal');
commands['style-quote'] = (v) => setParagraphStyle(v, 'quote');

// Los comandos del núcleo viven en el mismo registro que los de los plugins.
// Sin documento abierto, los comandos que actúan sobre el texto (los que reciben el editor) no hacen nada.
for (const [id, fn] of Object.entries(commands)) registerCommand({ id, run: (arg) => (fn.length > 0 && !cur ? undefined : fn(view, arg)) });
function syncSkinCommands() {
  for (const k of listSkins()) if (!getCommand(`skin-${k.id}`)) registerCommand({ id: `skin-${k.id}`, run: () => chooseSkin(k.id) });
}

ribbon = createRibbon({ run: (cmd, arg) => { executeCommand(cmd, arg).catch((e) => console.error(e)); } });
on('registry:ribbon', () => ribbon.setContributions(items('ribbon')));
// Un plugin puede añadir o quitar skins: la cinta (grupo Aspecto) y los comandos se actualizan.
on('registry:skins', () => {
  syncSkinCommands();
  ribbon.setContributions(items('ribbon'));
  refreshAppearance();
});
on('panel:show', () => explorer?.show());
on('registry:extensions', applyPluginExtensions);
on('registry:blocks', () => view.dispatch({ effects: refreshBlocks.of(null) }));
initSidebarPanels();
initStatusItems();
ribbon.update(formatState(view.state));

// ---- Panel de carpetas ----
const sameFile = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
// ¿El fichero está dentro de esa carpeta (a cualquier profundidad)?
const winKey = (p) => p.replace(/\//g, '\\').toLowerCase();
const insideDir = (file, dir) => !!file && !!dir && winKey(file).startsWith(winKey(dir).replace(/\\+$/, '') + '\\');
let bannerTimer = null;
function toast(text, sticky = false) {
  showBanner(text, [], sticky);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    if ($('banner').textContent.startsWith(text)) {
      $('banner').hidden = true;
      $('banner').dataset.sticky = '';
    }
  }, sticky ? 14000 : 8000);
}

explorer = createExplorer({
  onOpen: (p) => openFile(p),
  // Un documento renombrado desde el panel sigue abierto con su nuevo nombre.
  onRenamed: (oldP, newP) => {
    for (const d of docs) if (sameFile(d.file, oldP)) d.file = newP;
    if (cur && sameFile(cur.file, newP)) setBaseDir(dirname(newP));
    renderTabs();
    updateTitle();
  },
  // Un documento enviado a la Papelera (solo o dentro de una carpeta) deja su pestaña abierta como documento
  // sin guardar, para no perder el texto si fue un error (con Guardar como se recupera).
  onDeleted: (p, isDir) => {
    let hit = 0;
    for (const d of docs) {
      if (!(isDir ? insideDir(d.file, p) : sameFile(d.file, p))) continue;
      d.file = null;
      d.mtimeMs = null;
      d.dirty = true;
      d.untitled = ++untitledCount;
      hit++;
    }
    renderTabs();
    updateTitle();
    const what = isDir ? 'La carpeta' : 'El documento';
    toast(hit
      ? `${what} se movió a la Papelera. ${hit > 1 ? 'Sus pestañas siguen abiertas como documentos sin guardar.' : 'Su pestaña sigue abierta como documento sin guardar.'}`
      : `${what} se movió a la Papelera.`);
  },
  isOpenDirty: (p, isDir) => docs.some((d) => d.dirty && (isDir ? insideDir(d.file, p) : sameFile(d.file, p))),
  confirm: confirmBox,
  notify: toast,
  onVisibility: (v) => ribbon.setActive({ sidebar: v }),
});
explorer.restore();

// ---- Menú contextual (botón derecho) del editor, las tablas y las pestañas ----
// El dibujo del menú está en contextmenu.js y sus opciones en editorMenu.js; aquí solo se conecta con la aplicación.
const menuDeps = () => ({
  view,
  run: (id, arg) => executeCommand(id, arg).catch((e) => console.error(e)),
  openLink,
  docPath: () => (cur && cur.file) || null,
  notify: (text) => toast(text),
  copyText: (text) => window.api.clipboardWrite(text),
});

$('editor').addEventListener('contextmenu', (e) => {
  if (!cur) return;
  e.preventDefault();
  const d = menuDeps();
  const cell = tableCellAt(e.target);
  if (cell) return showMenu(e.clientX, e.clientY, tableMenuItems(d, cell));
  // Como en cualquier editor: el botón derecho fuera de la selección lleva el cursor al punto pulsado.
  // Sobre una imagen no se toca: al pulsar ya quedó seleccionada entera (y su mitad derecha cae fuera de ella).
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
  const sel = view.state.selection.main;
  if (pos != null && !e.target.closest('.cm-lp-img') && (sel.empty || pos < sel.from || pos > sel.to)) view.dispatch({ selection: { anchor: pos } });
  showMenu(e.clientX, e.clientY, editorMenuItems({ ...d, pos }));
}, true);

function tabMenuItems(d, i) {
  const unsaved = d.file ? undefined : 'El documento aún no está guardado.';
  const items = [
    { label: 'Cerrar', icon: 'close', key: 'Ctrl+W', run: () => closeDoc(d) },
    { label: 'Cerrar las demás', disabled: docs.length < 2, run: () => { activate(d); closeDocs(docs.filter((x) => x !== d)); } },
    { label: 'Cerrar a la derecha', disabled: i === docs.length - 1, run: () => closeDocs(docs.slice(i + 1)) },
    { label: 'Cerrar todas', run: () => closeDocs([...docs]) },
    '-',
    { label: 'Copiar ruta', icon: 'copy', disabled: !d.file, title: unsaved, run: () => { window.api.clipboardWrite(d.file); toast('Ruta copiada.'); } },
    { label: 'Mostrar en el Explorador de Windows', icon: 'reveal', disabled: !d.file, title: unsaved, run: () => window.api.reveal(d.file) },
  ];
  const extra = pluginItems(['tab'], { path: d.file || null });
  return extra.length ? [...items, '-', ...extra] : items;
}

$('doctabs').addEventListener('contextmenu', (e) => {
  const tab = e.target.closest('.dtab');
  if (!tab) return;
  e.preventDefault();
  const i = [...$('doctabs').querySelectorAll('.dtab')].indexOf(tab);
  if (docs[i]) showMenu(e.clientX, e.clientY, tabMenuItems(docs[i], i));
});

// Lo que la aplicación ofrece a los plugins (ver src/renderer/plugins/api.js).
const pluginHost = {
  version: '',
  getView: () => view,
  getActive: () => cur,
  getMode: () => state.mode,
  docName,
  listDocs: () => docs.map((d) => ({ path: d.file || null, name: docName(d), dirty: !!d.dirty, active: d === cur })),
  openFile,
  notify: (text) => toast(text, true),
  confirm: confirmBox,
  prompt: async ({ title = 'Escribe un valor', label = '', value = '' } = {}) => {
    const r = await askForm({ title, fields: [{ id: 'v', label, value, required: true }] });
    return r ? r.v : null;
  },
  explorerRoot: () => explorer.getRoot(),
};

// early.js ya fijó el tema y el skin guardados antes de pintar; aquí solo se sincronizan colores y cinta.
refreshAppearance();
setMode('read');
setZoom(100);
renderTabs();
updateTitle();
$('nd-new').addEventListener('click', () => newDoc());
$('nd-open').addEventListener('click', () => commands.open());

// Plugins: se cargan al final, cuando la interfaz ya está lista. Si fallan, la aplicación sigue funcionando.
(async () => {
  try {
    pluginHost.version = (await window.api.appInfo()).version;
    initPlugins(pluginHost);
    await startPlugins();
    if (failedCount()) toast(`${failedCount()} ${failedCount() === 1 ? 'plugin no se ha podido cargar' : 'plugins no se han podido cargar'}. Revisa Ayuda > Administrar plugins.`, true);
    let savedSkin = null;
    try { savedSkin = localStorage.getItem('skin'); } catch { /* sin almacenamiento */ }
    // Un skin de plugin no existe al arrancar: se aplica ahora que ya está registrado.
    if (savedSkin && hasSkin(savedSkin) && document.documentElement.dataset.skin !== savedSkin) await chooseSkin(savedSkin);
    emit('app:ready');
  } catch (e) {
    console.error('[plugins] error al iniciar', e);
  }
})();

$('zoom').addEventListener('input', (e) => setZoom(+e.target.value));
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(state.zoom + (e.deltaY < 0 ? 10 : -10));
}, { passive: false });

window.api.onOpenFile(openFile);

// ---- Arrastrar ficheros .md sobre la ventana: cada uno se abre en su pestaña ----
const MD_RE = /\.(md|markdown|txt)$/i;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
let dragDepth = 0;
const endDrag = () => { dragDepth = 0; $('dropzone').hidden = true; };
// En fase de captura, para que el editor no inserte el contenido del fichero como texto.
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  $('dropzone').hidden = false;
}, true);
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
}, true);
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) endDrag();
}, true);
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  endDrag();
  const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
  const files = [];
  let skipped = 0;
  for (const p of paths) {
    if (await window.api.isDir(p)) await explorer.setRoot(p); // una carpeta abre el panel de carpetas
    else if (MD_RE.test(p)) files.push(p);
    else skipped++;
  }
  if (skipped) showBanner('Solo se pueden abrir ficheros .md, .markdown o .txt, o carpetas.');
  for (const p of files) await openFile(p);
}, true);

window.addEventListener('beforeunload', (e) => {
  if (docs.some((d) => d.dirty)) { e.preventDefault(); e.returnValue = ''; }
});

window.addEventListener('keydown', async (e) => {
  if (!e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
  else if (k === 'o' && !e.shiftKey) { e.preventDefault(); commands.open(); }
  else if (k === 'n') { e.preventDefault(); newDoc(); }
  else if (k === 'w') { e.preventDefault(); closeDoc(cur); }
  else if (k === 'tab') {
    e.preventDefault();
    if (docs.length < 2) return;
    const i = docs.indexOf(cur);
    activate(docs[(i + (e.shiftKey ? docs.length - 1 : 1)) % docs.length]);
  }
  else if (k === 'p' && e.shiftKey) { e.preventDefault(); commands.palette(); }
  else if (k === 'e' && e.shiftKey) { e.preventDefault(); explorer.toggle(); }
  else if (k === 'o' && e.shiftKey) { e.preventDefault(); explorer.openFolderDialog(); }
  else if (k === 'e') { e.preventDefault(); setMode(state.mode === 'read' ? 'source' : 'read'); }
  else if (k === '=' || k === '+') { e.preventDefault(); setZoom(state.zoom + 10); }
  else if (k === '-') { e.preventDefault(); setZoom(state.zoom - 10); }
  else if (k === '0') { e.preventDefault(); setZoom(100); }
});
