import { imageAt, linkAt, codeBlockAt, setCodeLanguage } from './commands.js';
import { sectionAt, toggleSection } from './folding.js';
import { LANGS } from './highlight.js';
import { slashEntries } from './slashMenu.js';
import { contextItems } from './plugins/registry.js';

// Elementos del menú contextual (botón derecho) del editor y de las tablas.
// Primero van las opciones del elemento sobre el que se hizo clic (vínculo, imagen, código, título),
// luego las generales (portapapeles, formato, convertir en). Las ejecutan los mismos comandos de la cinta.
//
// `d` trae lo que depende de la aplicación: { view, pos, run(id, arg), openLink(url), docPath(), notify(texto), copyText(texto) }.

const isRemote = (src) => /^(https?|data):/i.test(src);

// Junta grupos de opciones con un separador entre los que no están vacíos.
function groups(...list) {
  const out = [];
  for (const g of list.filter((x) => x && x.length)) {
    if (out.length) out.push('-');
    out.push(...g);
  }
  return out;
}

// Opciones que aportan los plugins para esos destinos (api.ui.contextMenu.add con target 'editor', 'editor-link'...).
export function pluginItems(targets, arg) {
  const out = [];
  for (const target of targets) {
    for (const ci of contextItems(target)) out.push({ label: ci.label, icon: 'puzzle', run: () => ci.run(arg) });
  }
  return out;
}

function linkGroup(d, link) {
  const { view } = d;
  return [
    { label: 'Abrir vínculo', icon: 'link', run: () => d.openLink(link.url) },
    { label: 'Copiar dirección', icon: 'copy', run: async () => { await d.copyText(link.url); d.notify('Dirección copiada.'); } },
    {
      label: 'Editar vínculo…',
      icon: 'pencil',
      key: 'Ctrl+K',
      run: () => {
        view.dispatch({ selection: { anchor: link.from } });
        d.run('link');
      },
    },
    {
      label: 'Quitar vínculo',
      icon: 'eraser',
      run: () => {
        view.dispatch({ changes: { from: link.from, to: link.to, insert: link.text }, userEvent: 'input.format' });
        view.focus();
      },
    },
  ];
}

function imageGroup(d, img) {
  const { view } = d;
  // Solo imágenes locales y de un documento ya guardado: el proceso principal comprueba que el documento esté autorizado.
  const remote = isRemote(img.url);
  const saved = !!d.docPath();
  const unavailable = remote || !saved;
  const why = remote ? 'Solo para imágenes guardadas en este equipo.' : !saved ? 'Guarda el documento primero.' : undefined;
  // El proceso principal resuelve la ruta; aquí solo se muestra el aviso (éxito o error).
  const runImage = async (fn, done) => {
    const r = await fn(d.docPath(), img.url);
    if (!r.ok) d.notify(r.error);
    else if (done) d.notify(done);
  };
  return [
    { label: 'Copiar imagen', icon: 'copy', disabled: unavailable, title: why, run: () => runImage(window.api.imageCopy, 'Imagen copiada.') },
    { label: 'Copiar dirección', icon: 'link', run: async () => { await d.copyText(img.url); d.notify('Dirección copiada.'); } },
    { label: 'Mostrar en el Explorador de Windows', icon: 'reveal', disabled: unavailable, title: why, run: () => runImage(window.api.imageReveal) },
    { label: 'Editar texto alternativo y ruta…', icon: 'pencil', run: () => d.run('image') },
    {
      label: 'Eliminar imagen',
      icon: 'trash',
      run: () => {
        view.dispatch({ changes: { from: img.from, to: img.to }, userEvent: 'delete.image' });
        view.focus();
      },
    },
  ];
}

function codeGroup(d, block) {
  const { view } = d;
  const current = block.lang.toLowerCase();
  const langs = [
    { label: '(ninguno)', checked: !current, run: () => setCodeLanguage(view, block, '') },
    ...LANGS.map(([name, aliases]) => ({
      label: name,
      checked: aliases.includes(current),
      run: () => setCodeLanguage(view, block, aliases[0]),
    })),
  ];
  return [
    {
      label: 'Copiar el código',
      icon: 'copy',
      disabled: !block.code,
      run: async () => { await d.copyText(block.code); d.notify('Código copiado.'); },
    },
    { label: 'Cambiar el lenguaje', icon: 'codeblock', items: langs },
  ];
}

function headingGroup(d, at) {
  const sec = sectionAt(d.view.state, at);
  if (!sec) return [];
  return [
    { label: sec.folded ? 'Expandir esta sección' : 'Contraer esta sección', icon: sec.folded ? 'chevron' : 'chevronup', run: () => toggleSection(d.view, at) },
    { label: 'Contraer todo', run: () => d.run('fold-all') },
    { label: 'Expandir todo', run: () => d.run('unfold-all') },
  ];
}

export function editorMenuItems(d) {
  const { state } = d.view;
  const sel = state.selection.main;
  const hasSel = !sel.empty;
  const at = d.pos ?? sel.head;
  const text = state.sliceDoc(sel.from, sel.to);
  const line = state.doc.lineAt(sel.head);

  const link = linkAt(state, at);
  // Una imagen cuenta si está seleccionada entera (clic sobre ella) o si el cursor está dentro de su código.
  const found = imageAt(state);
  const img = found && ((sel.from === found.from && sel.to === found.to) || (!hasSel && sel.head > found.from && sel.head < found.to)) ? found : null;
  const block = codeBlockAt(state, at);

  const contextual = [];
  if (!hasSel && line.text.trim() === '') {
    contextual.push([{
      label: 'Insertar',
      icon: 'filenew',
      items: slashEntries().map((e) => ({ label: e.label, run: () => d.run(e.id) })),
    }]);
  }
  if (link && !img) contextual.push(linkGroup(d, link));
  if (img) contextual.push(imageGroup(d, img));
  if (block) contextual.push(codeGroup(d, block));
  contextual.push(headingGroup(d, at));

  const clipboard = [
    { label: 'Cortar', icon: 'cut', key: 'Ctrl+X', disabled: !hasSel, run: () => d.run('cut') },
    { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', disabled: !hasSel, run: () => d.run('copy') },
    { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', run: () => d.run('paste') },
    { label: 'Seleccionar todo', icon: 'selectall', key: 'Ctrl+A', run: () => d.run('selectall') },
  ];

  const format = [
    { label: 'Negrita', icon: 'bold', key: 'Ctrl+B', run: () => d.run('bold') },
    { label: 'Cursiva', icon: 'italic', key: 'Ctrl+I', run: () => d.run('italic') },
    { label: 'Subrayado', icon: 'underline', key: 'Ctrl+U', run: () => d.run('underline') },
    { label: 'Código en línea', icon: 'code', run: () => d.run('code') },
  ];
  if (!link && !img) format.push({ label: hasSel ? 'Convertir en vínculo…' : 'Insertar vínculo…', icon: 'link', key: 'Ctrl+K', run: () => d.run('link') });

  const convert = block
    ? []
    : [{
        label: 'Convertir en…',
        icon: 'ul',
        items: [
          ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `Título ${n}`, run: () => d.run(`style-h${n}`) })),
          { label: 'Párrafo normal', run: () => d.run('style-normal') },
          { label: 'Cita', icon: 'quote', run: () => d.run('style-quote') },
          '-',
          { label: 'Lista con viñetas', icon: 'ul', run: () => d.run('ul') },
          { label: 'Lista numerada', icon: 'ol', run: () => d.run('ol') },
          { label: 'Lista de tareas', icon: 'task', run: () => d.run('task') },
        ],
      }];

  const targets = ['editor'];
  if (hasSel) targets.push('editor-selection');
  if (link) targets.push('editor-link');
  if (img) targets.push('editor-image');
  if (block) targets.push('editor-code');
  const arg = { path: d.docPath(), selection: text, ...(link ? { url: link.url } : {}), ...(img ? { src: img.url } : {}), ...(block ? { language: block.lang } : {}) };

  return groups(...contextual, clipboard, format, convert, pluginItems(targets, arg));
}

// Menú de una celda de tabla. `cell` viene de tableCellAt() (tables.js).
export function tableMenuItems(d, cell) {
  const { ops, r, rows, cols, align } = cell;
  const isHeader = r === 0;
  const lastDataRow = rows <= 2;
  const lastColumn = cols <= 1;
  const alignItem = (label, value) => ({ label, checked: align === value, run: () => ops.setAlign(value) });
  const rowWhy = isHeader ? 'La cabecera no se puede eliminar.' : lastDataRow ? 'La tabla necesita al menos una fila de datos.' : undefined;
  return groups(
    [
      { label: 'Insertar fila arriba', icon: 'table', disabled: isHeader, title: isHeader ? 'No se puede insertar encima de la cabecera.' : undefined, run: () => ops.addRow(true) },
      { label: 'Insertar fila debajo', icon: 'table', run: () => ops.addRow(false) },
      { label: 'Insertar columna a la izquierda', icon: 'table', run: () => ops.addCol(true) },
      { label: 'Insertar columna a la derecha', icon: 'table', run: () => ops.addCol(false) },
    ],
    [
      { label: 'Eliminar fila', icon: 'trash', disabled: isHeader || lastDataRow, title: rowWhy, run: () => ops.delRow() },
      { label: 'Eliminar columna', icon: 'trash', disabled: lastColumn, title: lastColumn ? 'La tabla necesita al menos una columna.' : undefined, run: () => ops.delCol() },
    ],
    [{
      label: 'Alinear columna',
      icon: 'indent',
      items: [alignItem('Izquierda', 'left'), alignItem('Centro', 'center'), alignItem('Derecha', 'right'), alignItem('Sin alineación', null)],
    }],
    [{ label: 'Eliminar tabla', icon: 'trash', run: () => ops.delTable() }],
    pluginItems(['editor-table'], { path: d.docPath() }),
  );
}
