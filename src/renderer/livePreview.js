import { syntaxTree } from '@codemirror/language';
import { Decoration, ViewPlugin, EditorView, WidgetType } from '@codemirror/view';
import { resolveImageSrc, getBaseDir } from './images.js';
import { isRenderedBlock } from './plugins/blockRenderers.js';
import { parseAlt, enableResize, enableMove } from './imageEdit.js';
import { parseWikilinks } from '../main/wikilinks.js';

// Marcas de sintaxis Markdown que se ocultan (el resto de casos se decide en build()).
const HIDE = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'QuoteMark', 'CodeInfo']);
const LINK_PARENTS = new Set(['Link', 'Image']);
const INLINE_TAGS = { u: 'cm-lp-underline', sub: 'cm-lp-sub', sup: 'cm-lp-sup', mark: 'cm-lp-mark', kbd: 'cm-lp-kbd' };

// ---- Widgets ----

class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-bullet';
    s.textContent = '•';
    return s;
  }
}

class Rule extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-hr';
    return s;
  }
}

class LineBreak extends WidgetType {
  eq() { return true; }
  toDOM() { return document.createElement('br'); }
}

class Check extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }
  eq(o) { return o.checked === this.checked; }
  toDOM(view) {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = this.checked;
    i.className = 'cm-lp-check';
    i.addEventListener('mousedown', (e) => e.preventDefault());
    i.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(i);
      const cur = view.state.sliceDoc(pos + 1, pos + 2);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: cur === ' ' ? 'x' : ' ' }, userEvent: 'input.task' });
    });
    return i;
  }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(src, alt, base) {
    super();
    this.src = src;
    ({ alt: this.alt, width: this.width } = parseAlt(alt));
    this.base = base;
  }
  eq(o) { return o.src === this.src && o.alt === this.alt && o.width === this.width && o.base === this.base; }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-lp-img';
    const url = resolveImageSrc(this.src);
    const fail = () => {
      wrap.classList.add('broken');
      wrap.textContent = `Imagen no encontrada: ${this.alt || this.src}`;
      view.requestMeasure();
    };
    const load = () => {
      wrap.classList.remove('blocked');
      wrap.replaceChildren();
      const img = new Image();
      img.alt = this.alt;
      img.title = this.alt;
      img.onload = () => view.requestMeasure();
      img.onerror = fail;
      if (this.width) img.style.width = `${this.width}px`;
      img.src = url;
      wrap.append(img);
      enableResize(wrap, img, view);
    };
    if (!url) fail();
    else if (/^https?:/i.test(url)) {
      // Un documento ajeno podría usar una imagen remota para saber cuándo y desde dónde se abre.
      // No se carga hasta que el usuario lo pide.
      wrap.classList.add('blocked');
      let host = url;
      try { host = new URL(url).host; } catch { /* se deja la URL */ }
      wrap.textContent = `Imagen remota bloqueada (${host}). Pulsa el botón para cargarla.`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Cargar';
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); load(); view.requestMeasure(); });
      wrap.append(' ', btn);
      view.requestMeasure();
    } else load();
    // Un clic selecciona la imagen entera; el botón Imagen de la cinta permite editarla.
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      let n = syntaxTree(view.state).resolveInner(pos, 1);
      while (n && n.name !== 'Image') n = n.parent;
      if (n) view.dispatch({ selection: { anchor: n.from, head: n.to } });
      view.focus();
    });
    enableMove(wrap, view);
    return wrap;
  }
  ignoreEvent() { return true; }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new Bullet() });
const rule = Decoration.replace({ widget: new Rule() });
const lineBreak = Decoration.replace({ widget: new LineBreak() });
const lineDeco = (cls, attributes) => Decoration.line({ class: cls, attributes });
const markDeco = (cls) => Decoration.mark({ class: cls });

// Bloque de propiedades YAML al principio del documento: devuelve su posición final o 0.
function frontmatterEnd(doc) {
  if (doc.lines < 3 || doc.line(1).text.trim() !== '---') return 0;
  for (let n = 2; n <= Math.min(doc.lines, 200); n++) {
    if (doc.line(n).text.trim() === '---') return doc.line(n).to;
  }
  return 0;
}

// reveal=true: las marcas reaparecen en la línea del cursor.
// reveal=false: nunca se ven (modo Lectura editable, como un procesador de textos).
function build(view, reveal) {
  const { state } = view;
  const doc = state.doc;
  const base = getBaseDir();
  const active = new Set();
  if (reveal) {
    for (const r of state.selection.ranges) {
      const a = doc.lineAt(r.from).number;
      const z = doc.lineAt(r.to).number;
      for (let n = a; n <= z; n++) active.add(n);
    }
  }

  const items = [];
  const protectedRanges = []; // código: no se interpreta HTML en línea dentro
  const eachLine = (from, to, cls, skipLast = false) => {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last - (skipLast ? 1 : 0); n++) {
      const l = doc.line(n);
      items.push([l.from, l.from, lineDeco(cls), -1]);
    }
  };

  const fm = frontmatterEnd(doc);
  if (fm) {
    const last = doc.lineAt(fm).number;
    for (let n = 1; n <= last; n++) {
      const l = doc.line(n);
      items.push([l.from, l.from, lineDeco(n === 1 || n === last ? 'cm-lp-fm cm-lp-fm-edge' : 'cm-lp-fm'), -1]);
    }
    protectedRanges.push([0, fm]);
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name;
        if (name === 'Table') return false; // lo dibuja el widget de tablas
        if (fm && name !== 'Document' && node.to <= fm) return false; // zona de propiedades YAML
        const line = doc.lineAt(node.from);
        const onActive = active.has(line.number);
        const parent = node.node.parent?.name;

        const h = /^ATXHeading(\d)$/.exec(name);
        const sx = /^SetextHeading(\d)$/.exec(name);
        if (h) items.push([line.from, line.from, lineDeco(`cm-lp-h${h[1]}`), -1]);
        else if (sx) {
          eachLine(node.from, node.to, `cm-lp-h${sx[1]}`, true);
          const lastLine = doc.lineAt(node.to);
          if (!onActive) items.push([lastLine.from, lastLine.from, lineDeco('cm-lp-collapsed'), -1]);
        } else if (name === 'Blockquote') eachLine(node.from, node.to, 'cm-lp-quote');
        else if (name === 'FencedCode') {
          if (isRenderedBlock(state, node)) return false; // lo dibuja el plugin de ese lenguaje
          const marks = node.node.getChildren('CodeMark');
          const info = node.node.getChild('CodeInfo');
          const lang = info ? state.sliceDoc(info.from, info.to).trim() : '';
          const closed = marks.length >= 2;
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            const l = doc.line(n);
            let cls = 'cm-lp-codeblock';
            if (n === first) cls += ' cm-lp-cb-first';
            if (n === last) cls += ' cm-lp-cb-last';
            const fence = n === first || (closed && n === last);
            if (fence && !active.has(n)) cls += ' cm-lp-fence';
            items.push([l.from, l.from, lineDeco(cls, n === first && lang ? { 'data-lang': lang } : undefined), -1]);
          }
          protectedRanges.push([node.from, node.to]);
        } else if (name === 'CodeBlock') {
          eachLine(node.from, node.to, 'cm-lp-codeblock cm-lp-cb-first cm-lp-cb-last');
          protectedRanges.push([node.from, node.to]);
        } else if (name === 'HorizontalRule') {
          if (!onActive) items.push([node.from, node.to, rule, 1]);
        } else if (name === 'Image') {
          if (!onActive) {
            const marks = node.node.getChildren('LinkMark');
            const u = node.node.getChild('URL');
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : '';
            const src = u ? state.sliceDoc(u.from, u.to) : '';
            items.push([node.from, node.to, Decoration.replace({ widget: new ImageWidget(src, alt, base) }), 1]);
          }
          return false;
        } else if (name === 'StrongEmphasis') items.push([node.from, node.to, markDeco('cm-lp-strong'), 0]);
        else if (name === 'Emphasis') items.push([node.from, node.to, markDeco('cm-lp-em'), 0]);
        else if (name === 'Strikethrough') items.push([node.from, node.to, markDeco('cm-lp-strike'), 0]);
        else if (name === 'InlineCode') {
          items.push([node.from, node.to, markDeco('cm-lp-code'), 0]);
          protectedRanges.push([node.from, node.to]);
        } else if (name === 'Link') {
          if (node.node.getChild('URL') || node.node.getChild('LinkLabel')) items.push([node.from, node.to, markDeco('cm-lp-link'), 0]);
        } else if (name === 'Autolink') items.push([node.from, node.to, markDeco('cm-lp-link'), 0]);
        else if (name === 'URL' && !['Link', 'Image', 'LinkReference', 'Autolink'].includes(parent)) {
          items.push([node.from, node.to, markDeco('cm-lp-link'), 0]);
        } else if (name === 'LinkReference') eachLine(node.from, node.to, 'cm-lp-linkref');
        else if (name === 'CommentBlock') eachLine(node.from, node.to, 'cm-lp-comment');
        else if (name === 'Comment') items.push([node.from, node.to, markDeco('cm-lp-comment'), 0]);
        else if (name === 'Task') {
          const m = node.node.getChild('TaskMarker');
          if (m && /[xX]/.test(state.sliceDoc(m.from + 1, m.from + 2)) && node.to > m.to) {
            items.push([m.to, node.to, markDeco('cm-lp-done'), 0]);
          }
        } else if (name === 'TaskMarker') {
          if (!onActive) {
            const checked = /[xX]/.test(state.sliceDoc(node.from + 1, node.from + 2));
            items.push([node.from, node.to, Decoration.replace({ widget: new Check(checked) }), 1]);
          }
        } else if (name === 'ListMark' && !onActive) {
          const li = node.node.parent;
          if (li?.getChild('Task')) {
            const end = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            items.push([node.from, end, hidden, 1]);
          } else if (li?.parent?.name === 'BulletList') items.push([node.from, node.to, bullet, 1]);
        } else if (name === 'Escape' && !onActive) {
          items.push([node.from, node.from + 1, hidden, 1]);
        } else if (name === 'HardBreak' && !onActive && state.sliceDoc(node.from, node.from + 1) === '\\') {
          items.push([node.from, node.from + 1, hidden, 1]);
        }

        if (onActive) return;
        let hide = false;
        if (HIDE.has(name)) hide = true;
        else if (name === 'LinkMark') {
          // Los corchetes solo se ocultan si hay un enlace de verdad (con dirección o referencia). Un texto
          // entre corchetes sin más, como "[pendiente]", se queda tal cual.
          const pn = node.node.parent;
          hide = !!pn && (pn.name === 'Image' || pn.name === 'Autolink' || (pn.name === 'Link' && !!(pn.getChild('URL') || pn.getChild('LinkLabel'))));
        }
        else if (name === 'URL' || name === 'LinkTitle') hide = LINK_PARENTS.has(parent);
        else if (name === 'LinkLabel') hide = parent === 'Link';
        if (hide) {
          let end = node.to;
          // Oculta también el espacio que sigue a "#" y ">".
          if ((name === 'HeaderMark' || name === 'QuoteMark') && state.sliceDoc(end, end + 1) === ' ') end++;
          // El espacio que separa la URL del título también se oculta.
          const start = name === 'LinkTitle' && state.sliceDoc(node.from - 1, node.from) === ' ' ? node.from - 1 : node.from;
          if (end > start) items.push([start, end, hidden, 1]);
        }
      },
    });
  }

  // HTML en línea permitido (<u>, <sub>, <sup>, <mark>, <kbd>, <br>): se detecta por texto, línea a línea.
  const inProtected = (p) => protectedRanges.some(([a, z]) => p >= a && p < z);
  const re = /<(u|sub|sup|mark|kbd)>(.+?)<\/\1>|<br\s*\/?>/gi;
  for (const { from, to } of view.visibleRanges) {
    for (let p = from; p <= to; ) {
      const l = doc.lineAt(p);
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(l.text))) {
        const a = l.from + m.index;
        const z = a + m[0].length;
        if (inProtected(a)) continue;
        const off = !active.has(l.number);
        if (m[1]) {
          const tag = m[1].toLowerCase();
          const open = tag.length + 2;
          items.push([a + open, z - open - 1, markDeco(INLINE_TAGS[tag]), 0]);
          if (off) {
            items.push([a, a + open, hidden, 1]);
            items.push([z - open - 1, z, hidden, 1]);
          }
        } else if (off) items.push([a, z, lineBreak, 1]);
      }
      p = l.to + 1;
    }
  }

  // Enlaces internos [[Nota]] y [[Nota|texto]]: fuera de la línea activa solo se ve el texto, como un vínculo.
  for (const { from, to } of view.visibleRanges) {
    for (let p = from; p <= to; ) {
      const l = doc.lineAt(p);
      if (l.text.includes('[[')) {
        for (const w of parseWikilinks(l.text)) {
          const a = l.from + w.from;
          const z = l.from + w.to;
          if (inProtected(a)) continue;
          // Con alias se ve solo lo que sigue a la barra; sin él, el nombre (y el título si lo hay).
          const bar = w.alias ? l.text.indexOf('|', w.from) : -1;
          const shownFrom = bar >= 0 ? l.from + bar + 1 : a + 2;
          if (active.has(l.number) || z - 2 <= shownFrom) {
            items.push([a, z, markDeco('cm-lp-wikilink'), 0]);
          } else {
            items.push([a, shownFrom, hidden, 1]);
            items.push([shownFrom, z - 2, markDeco('cm-lp-wikilink'), 0]);
            items.push([z - 2, z, hidden, 1]);
          }
        }
      }
      p = l.to + 1;
    }
  }

  // Decoration.set con sort=true ordena por posición y lado de inicio.
  const toSet = (list) => Decoration.set(list.map(([f, t, d]) => d.range(f, t)), true);
  const isAtomic = (d) => d === hidden || d === bullet || d === rule || d === lineBreak || d.spec?.widget;
  return { all: toSet(items), atomic: toSet(items.filter(([, , d]) => isAtomic(d))) };
}

let currentPlugin = null;

// Avanza `pos` sobre las marcas ocultas contiguas, para dejar el cursor FUERA del formato
// (si no, al final de una línea se quedaría antes de la marca de cierre oculta).
export function skipHiddenForward(view, pos) {
  const p = currentPlugin && view.plugin(currentPlugin);
  if (!p) return pos;
  const lineEnd = view.state.doc.lineAt(pos).to;
  let out = pos;
  p.atomic.between(pos, lineEnd, (from, to) => {
    if (from === out && to > out) out = to;
  });
  return out;
}

export function livePreview({ reveal = true } = {}) {
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.refresh(view);
      }
      update(u) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.refresh(u.view);
      }
      refresh(view) {
        const b = build(view, reveal);
        this.decorations = b.all;
        this.atomic = b.atomic;
      }
    },
    { decorations: (v) => v.decorations },
  );
  currentPlugin = plugin;
  // Con las marcas ocultas, el cursor las salta y Retroceso las borra como una unidad.
  return [plugin, EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)];
}
