import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { parseTable, serialize, toDashes } from './tablaModelo.mjs';

// ---- Localizar la tabla que corresponde a un widget ----

function tableRange(view, wrap) {
  let pos;
  try { pos = view.posAtDOM(wrap); } catch { return null; }
  let n = syntaxTree(view.state).resolveInner(pos, 1);
  while (n && n.name !== 'Table') n = n.parent;
  return n ? { from: n.from, to: n.to } : null;
}

function commit(wrap, view, model) {
  const text = serialize(model);
  wrap._text = text; // el DOM ya refleja este texto: updateDOM no tendrá que reconstruirlo
  const r = tableRange(view, wrap);
  if (!r || view.state.sliceDoc(r.from, r.to) === text) return;
  view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, userEvent: 'input.table' });
}

// ---- Render del widget ----

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function focusCell(wrap, r, c, selectAll = false) {
  const cols = wrap._model.cells[0].length;
  const inp = wrap.querySelectorAll('textarea')[r * cols + c];
  if (inp) {
    inp.focus();
    if (selectAll) inp.select();
    else inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

// El texto de una celda se ajusta al ancho de su columna: la celda crece en alto en vez de cortarse.
function fit(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
const fitAll = (wrap) => wrap.querySelectorAll('textarea').forEach(fit);
// ¿El texto de la celda ocupa más de una línea visual?
const multiLine = (ta) => ta.scrollHeight > parseFloat(getComputedStyle(ta).lineHeight) * 1.5 + 14;

function renderTable(wrap, view, model, focus) {
  wrap._model = model;
  wrap.textContent = '';
  // Reajusta las alturas cuando cambia el ancho disponible (ventana, panel lateral) y al insertarse en el documento.
  wrap._ro?.disconnect();
  wrap._ro = new ResizeObserver(() => fitAll(wrap));
  wrap._ro.observe(wrap);
  const cols = model.cells[0].length;
  const cur = () => ({ r: wrap._r ?? model.cells.length - 1, c: wrap._c ?? cols - 1 });

  const apply = (nextFocus) => {
    commit(wrap, view, model);
    renderTable(wrap, view, model, nextFocus);
    view.requestMeasure();
  };

  // Operaciones sobre la celda activa; las usan los botones de la barra y el menú contextual (wrap._ops).
  // La fila de cabecera no admite fila encima: la fila nueva siempre queda debajo de ella.
  const addRow = (above) => {
    const { r, c } = cur();
    const at = above ? Math.max(1, r) : r + 1;
    model.cells.splice(at, 0, Array(cols).fill(''));
    apply({ r: at, c });
  };
  const delRow = () => {
    const { r, c } = cur();
    if (r === 0 || model.cells.length <= 2) return;
    model.cells.splice(r, 1);
    apply({ r: Math.min(r, model.cells.length - 1), c });
  };
  const addCol = (left) => {
    const { r, c } = cur();
    const at = left ? c : c + 1;
    model.cells.forEach((row) => row.splice(at, 0, ''));
    model.align.splice(at, 0, null);
    if (model.widths) model.widths.splice(at, 0, Math.round(model.widths.reduce((x, y) => x + y, 0) / model.widths.length));
    apply({ r, c: at });
  };
  const delCol = () => {
    const { r, c } = cur();
    if (cols <= 1) return;
    model.cells.forEach((row) => row.splice(c, 1));
    model.align.splice(c, 1);
    if (model.widths) model.widths.splice(c, 1);
    apply({ r, c: Math.min(c, cols - 2) });
  };
  const setAlign = (a) => {
    const { r, c } = cur();
    model.align[c] = a;
    apply({ r, c });
  };
  const delTable = () => {
    const r = tableRange(view, wrap);
    if (!r) return;
    const to = Math.min(view.state.doc.length, r.to + 1);
    view.dispatch({ changes: { from: r.from, to }, userEvent: 'delete.table' });
    view.focus();
  };
  wrap._ops = { addRow, delRow, addCol, delCol, setAlign, delTable };

  const tools = el('div', 'tbl-tools');
  const tool = (label, title, fn) => {
    const b = el('button', null, label);
    b.title = title;
    b.type = 'button';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', fn);
    tools.append(b);
  };
  tool('+ Fila', 'Insertar fila debajo de la celda activa', () => addRow(false));
  tool('− Fila', 'Eliminar la fila de la celda activa', delRow);
  tool('+ Columna', 'Insertar columna a la derecha de la celda activa', () => addCol(false));
  tool('− Columna', 'Eliminar la columna de la celda activa', delCol);
  tool('Eliminar tabla', 'Eliminar la tabla entera (se puede deshacer con Ctrl+Z)', delTable);
  wrap.append(tools);

  const table = el('table');
  const colgroup = el('colgroup');
  const sum = model.widths ? model.widths.reduce((x, y) => x + y, 0) : cols;
  for (let c = 0; c < cols; c++) {
    const col = el('col');
    col.style.width = ((model.widths ? model.widths[c] : 1) / sum) * 100 + '%';
    colgroup.append(col);
  }
  table.append(colgroup);

  // Arrastrar el borde derecho de una cabecera reparte el ancho entre esa columna y la siguiente.
  const startResize = (e, c, grip) => {
    e.preventDefault();
    e.stopPropagation();
    const MIN = 40;
    const cols$ = [...colgroup.children];
    const px = [...table.rows[0].cells].map((th) => th.getBoundingClientRect().width);
    const total = px.reduce((x, y) => x + y, 0);
    const pair = px[c] + px[c + 1];
    const x0 = e.clientX;
    let next = null;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('dragging');
    const move = (ev) => {
      const left = pair < 2 * MIN ? pair / 2 : Math.min(pair - MIN, Math.max(MIN, px[c] + ev.clientX - x0));
      next = px.slice();
      next[c] = left;
      next[c + 1] = pair - left;
      next.forEach((w, i) => { cols$[i].style.width = (w / total) * 100 + '%'; });
      fitAll(wrap);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.classList.remove('dragging');
      if (!next) return;
      model.widths = toDashes(next);
      commit(wrap, view, model);
      view.requestMeasure();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };

  model.cells.forEach((row, r) => {
    const tr = el('tr');
    row.forEach((val, c) => {
      const td = el(r === 0 ? 'th' : 'td');
      const inp = el('textarea');
      inp.rows = 1;
      inp.value = val;
      inp.spellcheck = false;
      if (model.align[c]) inp.style.textAlign = model.align[c];
      inp.addEventListener('focus', () => { wrap._r = r; wrap._c = c; });
      inp.addEventListener('input', () => {
        // Una celda Markdown es una sola línea: un salto pegado se convierte en espacio.
        if (inp.value.includes('\n') || inp.value.includes('\r')) inp.value = inp.value.replace(/[\r\n]+/g, ' ');
        model.cells[r][c] = inp.value;
        fit(inp);
        commit(wrap, view, model);
        view.requestMeasure();
      });
      inp.addEventListener('keydown', (e) => {
        const rows = model.cells.length;
        const go = (nr, nc) => { e.preventDefault(); focusCell(wrap, nr, nc); };
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (c > 0) go(r, c - 1); else if (r > 0) go(r - 1, cols - 1); else e.preventDefault();
          } else if (c < cols - 1) go(r, c + 1);
          else if (r < rows - 1) go(r + 1, 0);
          else { e.preventDefault(); model.cells.push(Array(cols).fill('')); apply({ r: rows, c: 0 }); }
        } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
          // En una celda de varias líneas, la flecha recorre primero sus líneas.
          if (e.key === 'ArrowDown' && multiLine(inp) && inp.selectionStart !== inp.value.length) return;
          if (r < rows - 1) go(r + 1, c);
          else if (e.key === 'Enter') { e.preventDefault(); model.cells.push(Array(cols).fill('')); apply({ r: rows, c }); }
        } else if (e.key === 'ArrowUp') {
          if (multiLine(inp) && inp.selectionStart !== 0) return;
          if (r > 0) go(r - 1, c);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          view.focus();
        }
      });
      td.append(inp);
      if (r === 0 && c < cols - 1) {
        const grip = el('span', 'tbl-grip');
        grip.title = 'Arrastra para cambiar el ancho de la columna (doble clic: igualar anchos)';
        grip.addEventListener('pointerdown', (e) => startResize(e, c, grip));
        grip.addEventListener('dblclick', (e) => {
          e.preventDefault();
          model.widths = null;
          apply(null);
        });
        td.append(grip);
      }
      tr.append(td);
    });
    table.append(tr);
  });
  wrap.append(table);
  fitAll(wrap);

  if (focus) focusCell(wrap, focus.r, focus.c);
}

class TableWidget extends WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }
  eq(other) {
    return other.text === this.text;
  }
  toDOM(view) {
    const wrap = el('div', 'cm-table-widget');
    wrap._text = this.text;
    renderTable(wrap, view, parseTable(this.text));
    return wrap;
  }
  updateDOM(dom, view) {
    // Si el DOM ya refleja este texto (cambio hecho desde el propio widget), se conserva el foco.
    if (dom._text !== this.text) {
      dom._text = this.text;
      renderTable(dom, view, parseTable(this.text));
    }
    return true;
  }
  destroy(dom) {
    dom._ro?.disconnect();
  }
  ignoreEvent() {
    return true;
  }
}

function buildTables(state) {
  const out = [];
  syntaxTree(state).iterate({
    enter(n) {
      if (n.name === 'Table') {
        out.push(
          Decoration.replace({ widget: new TableWidget(state.sliceDoc(n.from, n.to)), block: true }).range(n.from, n.to),
        );
        return false;
      }
    },
  });
  return Decoration.set(out);
}

export const tableField = StateField.define({
  create: buildTables,
  update(value, tr) {
    return tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? buildTables(tr.state) : value;
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f)),
  ],
});

// Celda de tabla bajo el elemento `target` (clic derecho), o null si no está en una tabla.
// Deja esa celda como la activa, que es sobre la que actúan las operaciones de `ops`.
export function tableCellAt(target) {
  const wrap = target.closest?.('.cm-table-widget');
  if (!wrap || !wrap._ops || !wrap._model) return null;
  const td = target.closest('td, th');
  if (td) {
    wrap._r = td.parentElement.rowIndex;
    wrap._c = td.cellIndex;
  }
  const r = wrap._r ?? 0;
  const c = wrap._c ?? 0;
  const cells = wrap._model.cells;
  return { ops: wrap._ops, r, c, rows: cells.length, cols: cells[0].length, align: wrap._model.align[c] || null };
}

// Lleva el foco a la primera celda de la tabla que empieza en `pos`.
export function focusTableAt(view, pos) {
  for (const w of view.dom.querySelectorAll('.cm-table-widget')) {
    let p;
    try { p = view.posAtDOM(w); } catch { continue; }
    if (p === pos) {
      focusCell(w, 0, 0, true);
      return true;
    }
  }
  return false;
}
