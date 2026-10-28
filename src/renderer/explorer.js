import { icon } from './icons.js';
import { contextItems } from './plugins/registry.js';
import { showMenu } from './contextmenu.js';

// Panel de carpetas: árbol de documentos Markdown con menú contextual.
// Todas las operaciones de disco pasan por el proceso principal (src/main/fsops.js), que solo actúa
// dentro de la carpeta elegida, nunca sobrescribe y solo borra enviando a la Papelera (no en red).

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

const NOT_FIXED_MSG = 'Solo se pueden borrar carpetas en discos fijos. Bórrala desde el Explorador de Windows.';

const base = (p) => p.split(/[\\/]/).pop();
const parent = (p) => p.replace(/[\\/][^\\/]*$/, '');
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function createExplorer({ onOpen, onRenamed, onDeleted, isOpenDirty, confirm, notify, onVisibility }) {
  const $ = (id) => document.getElementById(id);
  const side = $('sidebar');
  const tree = $('sb-tree');
  const filter = $('sb-filter');
  const empty = $('sb-empty');
  const note = $('sb-note');
  const titleEl = $('sb-title');

  let root = null;
  let rootNet = false;
  let rootFixed = false;
  let activePath = null;
  let selected = null;
  let clip = null;
  let expanded = new Set();

  const expKey = () => `sb:exp:${root}`;
  const saveExpanded = () => store.set(expKey(), JSON.stringify([...expanded]));

  // ---- Visibilidad y ancho ----
  function setVisible(v) {
    side.hidden = !v;
    $('splitter').hidden = !v;
    store.set('sb:open', v ? '1' : '0');
    onVisibility?.(v);
  }
  const isVisible = () => !side.hidden;

  function setWidth(w) {
    const px = Math.max(170, Math.min(520, Math.round(w)));
    document.documentElement.style.setProperty('--sb-w', `${px}px`);
    store.set('sb:w', String(px));
  }
  const w0 = parseInt(store.get('sb:w') || '', 10);
  if (w0) setWidth(w0);

  $('splitter').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const move = (ev) => setWidth(ev.clientX - side.getBoundingClientRect().left);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // ---- Construcción del árbol ----
  async function listDir(dir) {
    const r = await window.api.fsListDir(dir);
    if (!r.ok) throw new Error(r.error);
    return r.entries;
  }

  function buildNode(entry, depth) {
    const node = document.createElement('div');
    node.className = 'tn';
    node.dataset.path = entry.path;
    node.dataset.dir = entry.dir ? '1' : '';
    node.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'tn-row';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.title = entry.path;
    const arrow = document.createElement('span');
    arrow.className = 'tn-arrow';
    arrow.textContent = entry.dir ? '▸' : '';
    row.append(arrow);
    row.insertAdjacentHTML('beforeend', icon(entry.dir ? 'folder' : 'filetext', 15));
    const name = document.createElement('span');
    name.className = 'tn-name';
    name.textContent = entry.name;
    row.append(name);
    node.append(row);
    node._depth = depth;
    if (entry.dir) {
      const kids = document.createElement('div');
      kids.className = 'tn-children';
      kids.hidden = true;
      node.append(kids);
    }
    if (same(entry.path, activePath)) row.classList.add('active');
    return node;
  }

  async function fillChildren(node) {
    const kids = node.querySelector(':scope > .tn-children');
    const dir = node.dataset.path;
    kids.textContent = '';
    let entries;
    try {
      entries = await listDir(dir);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'tn-msg';
      err.textContent = `No se pudo leer la carpeta: ${e.message}`;
      kids.append(err);
      node._loaded = true;
      return;
    }
    if (!entries.length) {
      const m = document.createElement('div');
      m.className = 'tn-msg';
      m.style.paddingLeft = `${8 + (node._depth + 1) * 14}px`;
      m.textContent = 'Sin documentos';
      kids.append(m);
    }
    for (const e of entries) kids.append(buildNode(e, node._depth + 1));
    node._loaded = true;
    // Restaura las carpetas que estaban desplegadas.
    for (const child of kids.querySelectorAll(':scope > .tn[data-dir="1"]')) {
      if (expanded.has(child.dataset.path)) await toggle(child, true);
    }
    applyFilter();
  }

  async function toggle(node, force) {
    const kids = node.querySelector(':scope > .tn-children');
    const arrow = node.querySelector(':scope > .tn-row .tn-arrow');
    const open = force === undefined ? kids.hidden : force;
    if (open) {
      if (!node._loaded) await fillChildren(node);
      kids.hidden = false;
      arrow.textContent = '▾';
      expanded.add(node.dataset.path);
    } else {
      kids.hidden = true;
      arrow.textContent = '▸';
      expanded.delete(node.dataset.path);
    }
    saveExpanded();
  }

  async function renderRoot() {
    tree.textContent = '';
    let entries = [];
    try {
      entries = await listDir(root);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'tn-msg';
      err.textContent = `No se pudo leer la carpeta: ${e.message}`;
      tree.append(err);
      return;
    }
    if (!entries.length) {
      const m = document.createElement('div');
      m.className = 'tn-msg';
      m.textContent = 'Esta carpeta no tiene documentos Markdown.';
      tree.append(m);
    }
    for (const e of entries) tree.append(buildNode(e, 0));
    for (const child of tree.querySelectorAll(':scope > .tn[data-dir="1"]')) {
      if (expanded.has(child.dataset.path)) await toggle(child, true);
    }
    applyFilter();
  }

  const nodeFor = (p) => [...tree.querySelectorAll('.tn')].find((n) => same(n.dataset.path, p));

  async function refreshDir(dir) {
    if (!root) return;
    if (same(dir, root)) return renderRoot();
    const n = nodeFor(dir);
    if (!n) return;
    n._loaded = false;
    await fillChildren(n);
    n.querySelector(':scope > .tn-children').hidden = false;
  }

  async function refresh() {
    if (root) await renderRoot();
  }

  // ---- Raíz ----
  async function setRoot(dir, { silent = false } = {}) {
    const r = await window.api.fsSetRoot(dir);
    if (!r.ok) {
      if (!silent) notify(`No se pudo abrir la carpeta: ${r.error}`);
      return false;
    }
    root = r.path;
    rootNet = r.network;
    rootFixed = r.fixed;
    clip = null;
    selected = null;
    store.set('sb:root', root);
    try { expanded = new Set(JSON.parse(store.get(expKey()) || '[]')); } catch { expanded = new Set(); }
    titleEl.textContent = base(root) || root;
    titleEl.title = root;
    note.textContent = rootNet ? 'Unidad de red: aquí no hay Papelera, así que borrar es definitivo.' : '';
    note.hidden = !rootNet;
    empty.hidden = true;
    tree.hidden = false;
    filter.value = '';
    await renderRoot();
    setVisible(true);
    return true;
  }

  async function openFolderDialog() {
    const dir = await window.api.pickFolder();
    if (dir) await setRoot(dir);
  }

  async function restore() {
    const saved = store.get('sb:root');
    if (saved) {
      const ok = await setRoot(saved, { silent: true });
      if (ok && store.get('sb:open') === '0') setVisible(false);
      if (!ok) showEmpty(`No se pudo abrir la carpeta guardada (${saved}). Puede estar desconectada.`);
    } else {
      showEmpty();
    }
    // Por defecto el panel aparece abierto; solo se oculta si el usuario lo cerró.
    if (store.get('sb:open') !== '0') setVisible(true);
  }

  function showEmpty(text) {
    tree.hidden = true;
    empty.hidden = false;
    empty.querySelector('.sb-empty-text').textContent = text || 'Abre una carpeta para ver sus documentos Markdown y abrirlos en pestañas con un clic.';
    titleEl.textContent = 'Carpeta';
    titleEl.title = '';
    note.hidden = true;
  }

  // ---- Selección, activo y filtro ----
  function select(node) {
    selected?.querySelector(':scope > .tn-row')?.classList.remove('sel');
    selected = node;
    node?.querySelector(':scope > .tn-row')?.classList.add('sel');
  }

  function setActive(p) {
    activePath = p;
    for (const r of tree.querySelectorAll('.tn-row.active')) r.classList.remove('active');
    const n = p && nodeFor(p);
    n?.querySelector(':scope > .tn-row')?.classList.add('active');
  }

  // Una ruta (C:\carpeta o \servidor\recurso) no es un filtro: se usa para cambiar de carpeta con Intro.
  const isPathText = (t) => /^[a-zA-Z]:[\\/]/.test(t) || /^\\\\[^\\]/.test(t);

  function applyFilter() {
    const q = isPathText(filter.value.trim()) ? '' : filter.value.trim().toLowerCase();
    const visit = (el) => {
      let any = false;
      for (const n of el.querySelectorAll(':scope > .tn')) {
        const isDir = n.dataset.dir === '1';
        const nameHit = !q || base(n.dataset.path).toLowerCase().includes(q);
        let show = nameHit;
        if (isDir) {
          const kids = n.querySelector(':scope > .tn-children');
          const sub = visit(kids);
          show = nameHit || sub;
          if (q && sub) kids.hidden = false;
        }
        n.hidden = !show;
        any = any || show;
      }
      return any;
    };
    visit(tree);
  }
  filter.addEventListener('input', applyFilter);
  filter.addEventListener('keydown', async (e) => {
    const t = filter.value.trim().replace(/^"|"$/g, '');
    if (e.key !== 'Enter' || !isPathText(t)) return;
    e.preventDefault();
    if (!(await window.api.isDir(t))) return notify(`No existe la carpeta: ${t}`);
    // Por seguridad, la carpeta se confirma en el diálogo del sistema, que se abre ya en esa ruta.
    const dir = await window.api.pickFolder(t);
    if (dir) await setRoot(dir);
  });

  // ---- Entrada de nombre en línea ----
  function inlineInput({ value, depth, selectBase, submit, cancel, iconName = 'filetext' }) {
    const row = document.createElement('div');
    row.className = 'tn-row editing';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.insertAdjacentHTML('beforeend', `<span class="tn-arrow"></span>${icon(iconName, 15)}`);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tn-input';
    input.value = value;
    input.spellcheck = false;
    row.append(input);
    let busy = false;
    let closed = false;
    const close = () => { closed = true; cancel(); };
    input.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (busy) return;
        busy = true;
        const ok = await submit(input.value);
        busy = false;
        if (ok) closed = true;
        else input.focus();
      }
    });
    input.addEventListener('blur', () => { if (!busy && !closed) close(); });
    requestAnimationFrame(() => {
      input.focus();
      const dot = value.lastIndexOf('.');
      if (selectBase && dot > 0) input.setSelectionRange(0, dot);
      else input.select();
    });
    return row;
  }

  // ---- Acciones ----
  async function newDoc(dirNode) {
    const dir = dirNode ? dirNode.dataset.path : root;
    if (!dir) return;
    let host = tree;
    let depth = 0;
    if (dirNode) {
      await toggle(dirNode, true);
      host = dirNode.querySelector(':scope > .tn-children');
      depth = dirNode._depth + 1;
    }
    host.querySelector(':scope > .tn-msg')?.remove();
    const row = inlineInput({
      value: 'Nuevo documento.md',
      depth,
      selectBase: true,
      cancel: () => row.remove(),
      submit: async (name) => {
        const r = await window.api.fsCreate(dir, name);
        if (!r.ok) { notify(r.error); return false; }
        row.remove();
        await refreshDir(dir);
        setActive(r.path);
        onOpen(r.path);
        return true;
      },
    });
    host.prepend(row);
  }

  async function newFolder(dirNode) {
    const dir = dirNode ? dirNode.dataset.path : root;
    if (!dir) return;
    let host = tree;
    let depth = 0;
    if (dirNode) {
      await toggle(dirNode, true);
      host = dirNode.querySelector(':scope > .tn-children');
      depth = dirNode._depth + 1;
    }
    host.querySelector(':scope > .tn-msg')?.remove();
    const row = inlineInput({
      value: 'Nueva carpeta',
      depth,
      selectBase: false,
      iconName: 'folder',
      cancel: () => row.remove(),
      submit: async (name) => {
        const r = await window.api.fsMkdir(dir, name);
        if (!r.ok) { notify(r.error); return false; }
        row.remove();
        await refreshDir(dir);
        const n = nodeFor(r.path);
        if (n) select(n);
        return true;
      },
    });
    host.prepend(row);
  }

  function rename(node) {
    const p = node.dataset.path;
    if (node.dataset.dir === '1') return notify('Solo se pueden renombrar documentos, no carpetas.');
    const rowEl = node.querySelector(':scope > .tn-row');
    const nameEl = rowEl.querySelector('.tn-name');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tn-input';
    input.value = base(p);
    input.spellcheck = false;
    nameEl.replaceWith(input);
    let busy = false;
    let closed = false;
    const restore = () => {
      closed = true;
      input.replaceWith(nameEl);
    };
    input.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); restore(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (busy) return;
        busy = true;
        const r = await window.api.fsRename(p, input.value);
        busy = false;
        if (!r.ok) { notify(r.error); input.focus(); return; }
        closed = true;
        await refreshDir(parent(p));
        if (!same(r.path, p)) onRenamed(p, r.path);
        if (same(p, activePath)) setActive(r.path);
      }
    });
    input.addEventListener('blur', () => { if (!busy && !closed) restore(); });
    requestAnimationFrame(() => {
      input.focus();
      const dot = input.value.lastIndexOf('.');
      if (dot > 0) input.setSelectionRange(0, dot);
      else input.select();
    });
  }

  function copy(node) {
    if (node.dataset.dir === '1') return notify('Solo se pueden copiar documentos, no carpetas.');
    clip = { path: node.dataset.path };
    notify(`«${base(clip.path)}» copiado. Usa Pegar en una carpeta.`);
  }

  async function paste(dir) {
    if (!clip) return;
    const r = await window.api.fsCopy(clip.path, dir);
    if (!r.ok) return notify(r.error);
    await refreshDir(dir);
    notify(`Copiado como «${base(r.path)}».`);
    const n = nodeFor(r.path);
    if (n) select(n);
  }

  // Copia el documento en su propia carpeta: fsCopy le pone « - copia» al nombre si ya existe.
  async function duplicate(node) {
    const p = node.dataset.path;
    const r = await window.api.fsCopy(p, parent(p));
    if (!r.ok) return notify(r.error);
    await refreshDir(parent(p));
    notify(`Duplicado como «${base(r.path)}».`);
    const n = nodeFor(r.path);
    if (n) select(n);
  }

  async function copyText(text, what) {
    await window.api.clipboardWrite(text);
    notify(`${what} copiado.`);
  }

  // Una carpeta solo se borra si el proceso principal lo permite (disco fijo y nada que el panel no muestre).
  // Se consulta antes de pedir la confirmación, para no hacer confirmar algo que luego se rechaza.
  async function removeFolder(p) {
    const check = await window.api.fsCheckDir(p);
    if (!check.ok) return notify(check.error);
    const warnDirty = isOpenDirty(p, true) ? ' Ojo: hay documentos de esa carpeta con cambios sin guardar en pestañas abiertas.' : '';
    const ok = await confirm({
      title: 'Mover carpeta a la Papelera',
      message: `La carpeta «${base(p)}» y los documentos que contiene se moverán a la Papelera de reciclaje, de donde se pueden recuperar.${warnDirty}`,
      okLabel: 'Mover a la Papelera',
      danger: true,
    });
    if (!ok) return;
    const r = await window.api.fsDeleteDir(p);
    if (!r.ok) return notify(r.error);
    expanded.delete(p);
    saveExpanded();
    await refreshDir(parent(p));
    onDeleted(p, true);
  }

  async function remove(node) {
    const p = node.dataset.path;
    if (node.dataset.dir === '1') return removeFolder(p);
    const dirty = isOpenDirty(p);
    const warnDirty = dirty ? ' Ojo: tiene cambios sin guardar en una pestaña abierta.' : '';
    const ask = (permanent) => confirm(permanent
      ? {
          title: 'Eliminar definitivamente',
          message: `«${base(p)}» está en una unidad de red, donde no hay Papelera: se eliminará de forma definitiva y no se podrá recuperar.${warnDirty}`,
          okLabel: 'Eliminar definitivamente',
          danger: true,
        }
      : {
          title: 'Mover a la Papelera',
          message: `«${base(p)}» se moverá a la Papelera de reciclaje, de donde se puede recuperar.${warnDirty}`,
          okLabel: 'Mover a la Papelera',
          danger: true,
        });
    // En red se pide la confirmación definitiva de entrada. Si la carpeta parece local pero el documento
    // resulta estar en red (un enlace o junction), el proceso principal lo avisa y se vuelve a preguntar.
    if (!(await ask(rootNet))) return;
    let r = await window.api.fsDelete(p, rootNet);
    if (r.needsPermanent) {
      if (!(await ask(true))) return;
      r = await window.api.fsDelete(p, true);
    }
    if (!r.ok) return notify(r.error);
    await refreshDir(parent(p));
    onDeleted(p);
  }

  // ---- Menú contextual ----
  // El menú en sí (dibujo, submenús, teclado) está en contextmenu.js; aquí solo se decide qué opciones lleva.
  function menuFor(node) {
    const isDir = !!node && node.dataset.dir === '1';
    const dirOf = () => (node ? (isDir ? node : nodeFor(parent(node.dataset.path))) : null);
    const pasteTarget = () => (dirOf() ? dirOf().dataset.path : root);
    const items = [];
    if (node && !isDir) {
      items.push({ label: 'Abrir', icon: 'filetext', run: () => onOpen(node.dataset.path) });
      items.push('-');
    }
    items.push({ label: 'Nuevo documento', icon: 'filenew', run: () => newDoc(dirOf()) });
    items.push({ label: 'Nueva carpeta', icon: 'folder', run: () => newFolder(dirOf()) });
    if (node && !isDir) {
      items.push({ label: 'Renombrar', icon: 'pencil', key: 'F2', run: () => rename(node) });
      items.push({ label: 'Copiar', icon: 'copy', key: 'Ctrl+C', run: () => copy(node) });
      items.push({ label: 'Duplicar', icon: 'copy', run: () => duplicate(node) });
    }
    items.push({ label: 'Pegar', icon: 'paste2', key: 'Ctrl+V', disabled: !clip, run: () => paste(pasteTarget()) });
    if (node) {
      items.push('-');
      items.push({ label: 'Copiar ruta completa', icon: 'copy', run: () => copyText(node.dataset.path, 'Ruta') });
      items.push({ label: 'Copiar nombre', icon: 'copy', run: () => copyText(base(node.dataset.path), 'Nombre') });
      items.push('-');
      items.push({
        label: isDir ? 'Borrar carpeta (a la Papelera)' : rootNet ? 'Borrar (definitivo, sin Papelera)' : 'Borrar (a la Papelera)',
        icon: 'trash',
        key: 'Supr',
        disabled: isDir && !rootFixed,
        title: isDir && !rootFixed ? NOT_FIXED_MSG : undefined,
        run: () => remove(node),
      });
    }
    // Entradas aportadas por plugins (api.ui.contextMenu.add con target 'explorer-file' o 'explorer-folder').
    const extra = node ? contextItems(isDir ? 'explorer-folder' : 'explorer-file') : [];
    if (extra.length) {
      items.push('-');
      for (const ci of extra) items.push({ label: ci.label, icon: 'puzzle', run: () => ci.run({ path: node.dataset.path, isDir }) });
    }
    items.push('-');
    items.push({ label: 'Actualizar', icon: 'refresh', run: () => (isDir ? refreshDir(node.dataset.path) : refresh()) });
    if (node) items.push({ label: 'Mostrar en el Explorador de Windows', icon: 'reveal', run: () => window.api.reveal(node.dataset.path) });
    return items;
  }

  tree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const node = e.target.closest('.tn');
    if (node) select(node);
    showMenu(e.clientX, e.clientY, menuFor(node));
  });

  // ---- Clic y teclado ----
  tree.addEventListener('click', async (e) => {
    const node = e.target.closest('.tn');
    if (!node || e.target.closest('.tn-input')) return;
    select(node);
    tree.focus({ preventScroll: true });
    if (node.dataset.dir === '1') await toggle(node);
    else onOpen(node.dataset.path);
  });

  tree.tabIndex = 0;
  tree.addEventListener('keydown', async (e) => {
    const node = selected;
    const rows = () => [...tree.querySelectorAll('.tn')].filter((n) => !n.hidden && n.offsetParent !== null && !n.closest('.tn-children[hidden]') && n.dataset.path);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = rows();
      const i = list.indexOf(node);
      const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { select(next); next.scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'ArrowRight' && node?.dataset.dir === '1') { e.preventDefault(); await toggle(node, true); }
    else if (e.key === 'ArrowLeft' && node?.dataset.dir === '1') { e.preventDefault(); await toggle(node, false); }
    else if (e.key === 'Enter' && node) { e.preventDefault(); node.dataset.dir === '1' ? await toggle(node) : onOpen(node.dataset.path); }
    else if (e.key === 'F2' && node) { e.preventDefault(); rename(node); }
    else if (e.key === 'Delete' && node) { e.preventDefault(); remove(node); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && node) { e.preventDefault(); copy(node); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      const dir = node ? (node.dataset.dir === '1' ? node.dataset.path : parent(node.dataset.path)) : root;
      paste(dir);
    }
  });

  // ---- Botones de la cabecera ----
  $('sb-open').addEventListener('click', openFolderDialog);
  $('sb-empty-open').addEventListener('click', openFolderDialog);
  $('sb-new').addEventListener('click', () => {
    if (!root) return openFolderDialog();
    const n = selected;
    newDoc(n ? (n.dataset.dir === '1' ? n : nodeFor(parent(n.dataset.path))) : null);
  });
  $('sb-refresh').addEventListener('click', refresh);
  $('sb-close').addEventListener('click', () => setVisible(false));

  return {
    setRoot,
    openFolderDialog,
    restore,
    refresh,
    setActive,
    isVisible,
    toggle: () => setVisible(!isVisible()),
    show: () => setVisible(true),
    getRoot: () => root,
  };
}
