// Tamaño y posición de las imágenes dentro del texto.
// El ancho se guarda como en Obsidian, dentro del texto alternativo: ![descripción|300](ruta).
import { syntaxTree } from '@codemirror/language';

const MIN_WIDTH = 32;
const DRAG_THRESHOLD = 4;
const SCROLL_EDGE = 32;
const SCROLL_STEP = 16;
const ALT_WIDTH = /^(.*?)\|(\d+)(?:x\d+)?$/;

// «descripción|300» -> { alt: 'descripción', width: 300 }; sin tamaño, width es 0.
export function parseAlt(raw) {
  const m = ALT_WIDTH.exec(raw);
  return m ? { alt: m[1], width: Number(m[2]) } : { alt: raw, width: 0 };
}

export const withWidth = (alt, width) => (width ? `${alt}|${width}` : alt);

// Posiciones de la imagen en el texto a partir de su elemento en pantalla.
function locate(view, wrap) {
  let n = syntaxTree(view.state).resolveInner(view.posAtDOM(wrap), 1);
  while (n && n.name !== 'Image') n = n.parent;
  if (!n) return null;
  const marks = n.getChildren('LinkMark');
  if (marks.length < 2) return null;
  return { from: n.from, to: n.to, altFrom: marks[0].to, altTo: marks[1].from };
}

function setWidth(view, wrap, width) {
  const at = locate(view, wrap);
  if (!at) return;
  const { alt, width: before } = parseAlt(view.state.sliceDoc(at.altFrom, at.altTo));
  if (before === width) return;
  view.dispatch({ changes: { from: at.altFrom, to: at.altTo, insert: withWidth(alt, width) }, userEvent: 'input' });
}

// Asa en la esquina inferior derecha: arrastrar la cambia el ancho; doble clic vuelve al tamaño original.
export function enableResize(wrap, img, view) {
  const grip = document.createElement('span');
  grip.className = 'cm-lp-img-grip';
  grip.title = 'Arrastra para cambiar el tamaño (doble clic: tamaño original)';
  grip.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const line = wrap.closest('.cm-line');
    const max = Math.max(MIN_WIDTH, line ? line.clientWidth : startW);
    let width = Math.round(startW);
    let moved = false;
    wrap.classList.add('resizing');
    const move = (ev) => {
      moved = true;
      width = Math.min(max, Math.max(MIN_WIDTH, Math.round(startW + ev.clientX - startX)));
      img.style.width = `${width}px`;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      wrap.classList.remove('resizing');
      if (moved) setWidth(view, wrap, width);
      view.requestMeasure();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  grip.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    img.style.width = '';
    setWidth(view, wrap, 0);
  });
  wrap.append(grip);
}

// Punto del texto donde caería la imagen: si ocupa su propia línea se coloca entre líneas,
// y si está dentro de un párrafo, justo donde se suelta.
function dropTarget(view, at, text, alone, x, y) {
  const doc = view.state.doc;
  const pos = view.posAtCoords({ x, y }, false);
  if (alone) {
    const line = doc.lineAt(pos);
    const own = doc.lineAt(at.from);
    if (line.number === own.number) return null;
    const block = view.lineBlockAt(pos);
    const before = y < view.documentTop + block.top + block.height / 2;
    return {
      before,
      at: before ? line.from : line.to,
      insert: before ? `${text}\n\n` : `\n\n${text}`,
      y: view.documentTop + block.top + (before ? 0 : block.height),
    };
  }
  if (pos >= at.from && pos <= at.to) return null;
  const c = view.coordsAtPos(pos);
  return c ? { at: pos, insert: text, x: c.left, y: c.top, h: c.bottom - c.top } : null;
}

function removeRange(doc, at, alone) {
  if (!alone) return { from: at.from, to: at.to };
  // La imagen es un bloque entre líneas en blanco: al quitarla se va también una de ellas.
  const line = doc.lineAt(at.from);
  const blank = (n) => n < 1 || n > doc.lines || !doc.line(n).text.trim();
  if (line.number < doc.lines) {
    const next = doc.line(line.number + 1);
    const both = blank(line.number - 1) && blank(line.number + 1);
    return { from: line.from, to: Math.min(doc.length, (both ? next.to : line.to) + 1) };
  }
  return { from: Math.max(0, line.from - 1), to: line.to };
}

// Mover: arrastrar la imagen por el texto y soltarla en otro punto.
export function enableMove(wrap, view) {
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.cm-lp-img-grip, button')) return;
    const at = locate(view, wrap);
    if (!at) return;
    const doc = view.state.doc;
    const text = doc.sliceString(at.from, at.to);
    const alone = doc.lineAt(at.from).text.trim() === text;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let target = null;
    const mark = document.createElement('div');
    mark.className = 'cm-lp-drop';

    const finish = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('keydown', key, true);
      document.body.classList.remove('img-dragging');
      wrap.classList.remove('dragging');
      mark.remove();
    };
    const move = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        wrap.classList.add('dragging');
        document.body.classList.add('img-dragging');
        document.body.append(mark);
      }
      const box = view.scrollDOM.getBoundingClientRect();
      if (ev.clientY < box.top + SCROLL_EDGE) view.scrollDOM.scrollTop -= SCROLL_STEP;
      else if (ev.clientY > box.bottom - SCROLL_EDGE) view.scrollDOM.scrollTop += SCROLL_STEP;
      target = dropTarget(view, at, text, alone, ev.clientX, ev.clientY);
      mark.hidden = !target;
      if (!target) return;
      const content = view.contentDOM.getBoundingClientRect();
      if (target.h === undefined) {
        Object.assign(mark.style, { left: `${content.left}px`, width: `${content.width}px`, top: `${target.y - 1}px`, height: '2px' });
      } else {
        Object.assign(mark.style, { left: `${target.x - 1}px`, width: '2px', top: `${target.y}px`, height: `${target.h}px` });
      }
    };
    const up = () => {
      const drop = dragging ? target : null;
      finish();
      if (!drop) return;
      view.dispatch({ changes: [removeRange(doc, at, alone), { from: drop.at, insert: drop.insert }], userEvent: 'move' });
      view.focus();
    };
    const key = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      target = null;
      finish();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('keydown', key, true);
  });
}
