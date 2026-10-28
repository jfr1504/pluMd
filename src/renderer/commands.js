import { EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { focusTableAt } from './tables.js';

// Comandos de formato Markdown sobre un EditorView de CodeMirror.

const isWordChar = (c) => /[\p{L}\p{N}_]/u.test(c);

// Envuelve la selección con marcas (**, *, <u>…</u>). Si ya está envuelta, las quita.
export function toggleWrap(view, before, after = before) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    let { from, to } = range;
    if (from === to) {
      // Sin selección: usa la palabra bajo el cursor.
      const line = state.doc.lineAt(from);
      const text = line.text;
      let a = from - line.from;
      let z = a;
      while (a > 0 && isWordChar(text[a - 1])) a--;
      while (z < text.length && isWordChar(text[z])) z++;
      from = line.from + a;
      to = line.from + z;
    }

    const doc = state.doc;
    const pre = doc.sliceString(Math.max(0, from - before.length), from);
    const post = doc.sliceString(to, to + after.length);
    const farPre = doc.sliceString(Math.max(0, from - before.length - 1), from - before.length);
    const farPost = doc.sliceString(to + after.length, to + after.length + 1);
    // Para "*" evita confundir cursiva con la negrita "**".
    const ambiguous = before === '*' && (farPre === '*' || farPost === '*');

    if (pre === before && post === after && !ambiguous) {
      return {
        changes: [
          { from: from - before.length, to: from },
          { from: to, to: to + after.length },
        ],
        range: EditorSelection.range(from - before.length, to - before.length),
      };
    }
    // También detecta marcas incluidas dentro de la selección.
    const sel = doc.sliceString(from, to);
    if (from !== to && sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after) && !ambiguous) {
      return {
        changes: [
          { from, to: from + before.length },
          { from: to - after.length, to },
        ],
        range: EditorSelection.range(from, to - before.length - after.length),
      };
    }
    if (from === to) {
      return {
        changes: { from, insert: before + after },
        range: EditorSelection.cursor(from + before.length),
      };
    }
    return {
      changes: [
        { from, insert: before },
        { from: to, insert: after },
      ],
      range: EditorSelection.range(from + before.length, to + before.length),
    };
  });
  view.dispatch(tr, { scrollIntoView: true, userEvent: 'input.format' });
  view.focus();
}

// Fija el nivel de título de la línea (1–4). Repetir el mismo nivel lo quita.
export function setHeading(view, level) {
  const { state } = view;
  const changes = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const z = state.doc.lineAt(r.to).number;
    for (let n = a; n <= z; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = /^(#{1,6})\s+/.exec(line.text);
      const current = m ? m[1].length : 0;
      const prefixLen = m ? m[0].length : 0;
      const insert = current === level ? '' : '#'.repeat(level) + ' ';
      changes.push({ from: line.from, to: line.from + prefixLen, insert });
    }
  }
  applyLineChanges(view, changes);
}

// Texto de separación previo para que el bloque insertado quede en párrafo propio.
function leadFor(state, line) {
  if (line.text.trim() !== '') return '\n\n';
  if (line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '') return '\n';
  return '';
}
const insertPos = (line) => (line.text.trim() === '' ? line.from : line.to);

// Inserta una tabla de `rows` filas (la primera es la cabecera) por `cols` columnas, en línea nueva.
export function insertTable(view, rows = 3, cols = 3) {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const lead = leadFor(state, line);
  const row = (f) => '| ' + Array.from({ length: cols }, (_, i) => f(i)).join(' | ') + ' |';
  const out = [row((i) => `Columna ${i + 1}`), row(() => '---')];
  for (let r = 1; r < rows; r++) out.push(row(() => ' '));
  const text = lead + out.join('\n') + '\n';
  const insertAt = insertPos(line);
  const start = insertAt + lead.length;
  view.dispatch({
    changes: { from: insertAt, insert: text },
    selection: { anchor: start },
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  // Con la tabla ya dibujada, el cursor pasa a su primera celda (en modo Código no hay widget).
  requestAnimationFrame(() => {
    if (!focusTableAt(view, start)) view.focus();
  });
}

// ---- Enlaces ----

// Resuelve [texto][id] buscando su definición "[id]: url" en el documento.
function referenceUrl(state, label) {
  const id = label.replace(/^\[|\]$/g, '').trim().toLowerCase();
  const re = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s|$)/gm;
  const text = state.doc.toString();
  let m;
  while ((m = re.exec(text))) if (m[1].trim().toLowerCase() === id) return m[2];
  return null;
}

// Devuelve { from, to, text, url, kind } si `pos` está dentro de un enlace.
// kind: 'inline' [t](u) | 'ref' [t][id] | 'auto' <url> | 'bare' url suelta (GFM).
export function linkAt(state, pos) {
  let found = null;
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter(n) {
      if (n.name === 'Link') {
        const marks = n.node.getChildren('LinkMark');
        const urlNode = n.node.getChild('URL');
        const label = n.node.getChild('LinkLabel');
        if (marks.length >= 2 && urlNode) {
          found = { from: n.from, to: n.to, kind: 'inline', url: state.sliceDoc(urlNode.from, urlNode.to), text: state.sliceDoc(marks[0].to, marks[1].from) };
        } else if (marks.length >= 2 && label) {
          const url = referenceUrl(state, state.sliceDoc(label.from, label.to));
          if (url) found = { from: n.from, to: n.to, kind: 'ref', url, text: state.sliceDoc(marks[0].to, marks[1].from) };
        }
      } else if (n.name === 'Autolink') {
        const u = n.node.getChild('URL');
        if (u) found = { from: n.from, to: n.to, kind: 'auto', url: state.sliceDoc(u.from, u.to), text: state.sliceDoc(u.from, u.to) };
      } else if (n.name === 'URL' && !['Link', 'Image', 'LinkReference', 'Autolink'].includes(n.node.parent?.name)) {
        const u = state.sliceDoc(n.from, n.to);
        found = { from: n.from, to: n.to, kind: 'bare', url: u, text: u };
      }
    },
  });
  return found;
}

// Añade https:// si falta el esquema; deja intactas rutas relativas y anclas.
export function normalizeUrl(u) {
  if (/^[a-z]:[\\/]/i.test(u) || u.startsWith('\\\\')) return pathToFileUrl(u); // C:\carpeta o \\servidor\recurso
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^[.\/#\\]/.test(u)) return u;
  return 'https://' + u;
}

// Ruta de Windows a dirección file:// (las rutas de red \\servidor\recurso quedan como file://servidor/recurso).
export function pathToFileUrl(p) {
  const s = p.replace(/\\/g, '/').replace(/%(?![0-9a-f]{2})/gi, '%25');
  const enc = encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return s.startsWith('//') ? `file:${enc}` : `file:///${enc}`;
}

const encodeUrl = (u) => u.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

// `ask` abre el diálogo y devuelve { text, url } | { remove } | null.
export async function insertLink(view, ask) {
  const { state } = view;
  const sel = state.selection.main;
  const existing = linkAt(state, sel.from);
  const from = existing ? existing.from : sel.from;
  const to = existing ? existing.to : sel.to;
  const initialText = existing ? existing.text : state.sliceDoc(sel.from, sel.to);
  const res = await ask({ text: initialText, url: existing ? existing.url : '', existing: !!existing });
  if (!res) return view.focus();
  if (res.remove) {
    view.dispatch({ changes: { from, to, insert: existing.text }, userEvent: 'input.format' });
    return view.focus();
  }
  const url = encodeUrl(normalizeUrl(res.url));
  const text = res.text || res.url;
  const insert = `[${text}](${url})`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.format',
  });
  view.focus();
}

// ---- Imágenes ----

// Imagen que toca la selección: { from, to, alt, url }.
export function imageAt(state) {
  const sel = state.selection.main;
  let found = null;
  syntaxTree(state).iterate({
    from: Math.max(0, sel.from - 1),
    to: Math.min(state.doc.length, sel.to + 1),
    enter(n) {
      if (n.name !== 'Image' || n.from > sel.to || n.to < sel.from) return;
      const marks = n.node.getChildren('LinkMark');
      const u = n.node.getChild('URL');
      found = {
        from: n.from,
        to: n.to,
        alt: marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : '',
        url: u ? state.sliceDoc(u.from, u.to) : '',
      };
    },
  });
  return found;
}

// `ask` devuelve { url, alt } | { remove } | null.
export async function insertImage(view, ask) {
  const { state } = view;
  const sel = state.selection.main;
  const existing = imageAt(state);
  const from = existing ? existing.from : sel.from;
  const to = existing ? existing.to : sel.to;
  const res = await ask({ alt: existing ? existing.alt : state.sliceDoc(sel.from, sel.to), url: existing ? existing.url : '', existing: !!existing });
  if (!res) return view.focus();
  if (res.remove) {
    view.dispatch({ changes: { from, to }, userEvent: 'delete.image' });
    return view.focus();
  }
  const insert = `![${res.alt || ''}](${encodeUrl(res.url)})`;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.format' });
  view.focus();
}

// ---- Estilos de párrafo, listas y otros ----

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;
const TASK_RE = /^(\s*)([-*+])\s+\[[ xX]\]\s+/;
const quoteLen = (t) => /^(>\s?)*/.exec(t)[0].length;

function eachSelectedLine(state, fn) {
  const seen = new Set();
  const out = [];
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const z = state.doc.lineAt(r.to).number;
    for (let n = a; n <= z; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(fn(state.doc.line(n), out.length));
    }
  }
  return out.flat().filter(Boolean);
}

// Aplica cambios al principio de líneas dejando el cursor DESPUÉS del texto insertado
// (por defecto un cursor en el mismo punto se quedaría antes del prefijo recién añadido).
function applyLineChanges(view, changes) {
  const cs = view.state.changes(changes);
  view.dispatch({ changes: cs, selection: view.state.selection.map(cs, 1), userEvent: 'input.format' });
  view.focus();
}

// Estilo de párrafo: 'normal' | 'h1'…'h6' | 'quote'. Repetir el mismo estilo lo deja en Normal.
export function setParagraphStyle(view, style) {
  const { state } = view;
  const current = formatState(state).style;
  const target = current === style ? 'normal' : style;
  const prefix = target === 'quote' ? '> ' : /^h\d$/.test(target) ? '#'.repeat(+target[1]) + ' ' : '';
  const isHeading = /^#{1,6} $/.test(prefix);
  const changes = eachSelectedLine(state, (line) => {
    const m = /^(#{1,6}\s+|>\s?)/.exec(line.text);
    let strip = m ? m[0].length : 0;
    // Un título sobre un elemento de lista lo convierte en título (se quita la viñeta o el número).
    if (isHeading && !m) {
      const lm = LIST_RE.exec(line.text);
      if (lm) strip = lm[0].length;
    }
    return { from: line.from, to: line.from + strip, insert: prefix };
  });
  applyLineChanges(view, changes);
}

// Lista con viñetas ('ul') o numerada ('ol'). Si todas las líneas ya la tienen, se quita.
export function toggleList(view, kind) {
  const { state } = view;
  const lines = eachSelectedLine(state, (line) => [line]);
  const isKind = (t) => {
    const m = LIST_RE.exec(t.slice(quoteLen(t)));
    return m && !m[3] && (kind === 'ul' ? /[-*+]/.test(m[2]) : /\d/.test(m[2]));
  };
  const allOn = lines.every((l) => isKind(l.text));
  const changes = lines.map((line, i) => {
    const ql = quoteLen(line.text);
    const m = LIST_RE.exec(line.text.slice(ql));
    const strip = m ? m[0].length : 0;
    const indent = m ? m[1] : '';
    const insert = allOn ? indent : indent + (kind === 'ul' ? '- ' : `${i + 1}. `);
    return { from: line.from + ql, to: line.from + ql + strip, insert };
  });
  applyLineChanges(view, changes);
}

// Lista de tareas "- [ ] texto". Si todas las líneas ya lo son, vuelven a ser viñetas.
export function toggleTaskList(view) {
  const { state } = view;
  const lines = eachSelectedLine(state, (line) => [line]);
  const allOn = lines.every((l) => TASK_RE.test(l.text.slice(quoteLen(l.text))));
  const changes = lines.map((line) => {
    const ql = quoteLen(line.text);
    const rest = line.text.slice(ql);
    const m = LIST_RE.exec(rest);
    const indent = m ? m[1] : '';
    const strip = m ? m[0].length : 0;
    const insert = indent + (allOn ? '- ' : '- [ ] ');
    return { from: line.from + ql, to: line.from + ql + strip, insert };
  });
  applyLineChanges(view, changes);
}

// Aumenta o reduce la sangría de los elementos de lista seleccionados. Devuelve false si no hay ninguno.
export function changeIndent(view, delta) {
  const { state } = view;
  let any = false;
  const changes = eachSelectedLine(state, (line) => {
    const ql = quoteLen(line.text);
    const rest = line.text.slice(ql);
    const m = LIST_RE.exec(rest);
    if (!m) return null;
    any = true;
    const step = /\d/.test(m[2]) ? 4 : 2;
    if (delta > 0) return { from: line.from + ql, insert: ' '.repeat(step) };
    const lead = /^ */.exec(rest)[0].length;
    const n = Math.min(step, lead);
    return n ? { from: line.from + ql, to: line.from + ql + n } : null;
  });
  if (!any) return false;
  if (changes.length) applyLineChanges(view, changes);
  view.focus();
  return true;
}

export function insertRule(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const lead = leadFor(state, line);
  const at = insertPos(line);
  view.dispatch({ changes: { from: at, insert: lead + '***\n\n' }, selection: { anchor: at + lead.length + 5 }, userEvent: 'input.format' });
  view.focus();
}

// ---- Bloques de código ----

export function insertCodeBlock(view, lang = '') {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) {
    const a = state.doc.lineAt(sel.from);
    const z = state.doc.lineAt(sel.to);
    view.dispatch({
      changes: [{ from: a.from, insert: '```' + lang + '\n' }, { from: z.to, insert: '\n```' }],
      userEvent: 'input.format',
    });
    return view.focus();
  }
  const line = state.doc.lineAt(sel.head);
  const lead = leadFor(state, line);
  const at = insertPos(line);
  const head = '```' + lang + '\n';
  view.dispatch({
    changes: { from: at, insert: lead + head + '\n```\n' },
    selection: { anchor: at + lead.length + head.length },
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  view.focus();
}

// Bloque de código ``` que contiene `pos`: { from, to, lang, infoFrom, infoTo, code }. `code` es el contenido sin las vallas.
export function codeBlockAt(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name !== 'FencedCode') continue;
    const open = n.node.getChild('CodeMark');
    const info = n.node.getChild('CodeInfo');
    const closed = n.node.getChildren('CodeMark').length >= 2;
    const first = state.doc.lineAt(n.from).number;
    const last = state.doc.lineAt(n.to).number;
    const lines = [];
    for (let i = first + 1; i <= (closed ? last - 1 : last); i++) lines.push(state.doc.line(i).text);
    return {
      from: n.from,
      to: n.to,
      lang: info ? state.sliceDoc(info.from, info.to).trim() : '',
      infoFrom: info ? info.from : open.to,
      infoTo: info ? info.to : open.to,
      code: lines.join('\n'),
    };
  }
  return null;
}

// Cambia el lenguaje de un bloque de código ('' lo deja sin lenguaje).
export function setCodeLanguage(view, block, lang) {
  view.dispatch({ changes: { from: block.infoFrom, to: block.infoTo, insert: lang }, userEvent: 'input.format' });
  view.focus();
}

// Con el cursor en el último renglón de un bloque de código, salta a un párrafo debajo del bloque.
export function exitCodeBlock(view, onlyLastLine = false) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  let block = null;
  for (let n = syntaxTree(state).resolveInner(sel.head, -1); n; n = n.parent) {
    if (n.name === 'FencedCode') { block = n; break; }
  }
  if (!block) return false;
  const closed = block.getChildren('CodeMark').length >= 2;
  const endLine = state.doc.lineAt(block.to).number;
  const lastContent = closed ? endLine - 1 : endLine;
  const curLine = state.doc.lineAt(sel.head).number;
  if (onlyLastLine && curLine < lastContent) return false;
  if (block.to >= state.doc.length) {
    view.dispatch({ changes: { from: block.to, insert: '\n\n' }, selection: { anchor: block.to + 2 }, scrollIntoView: true });
  } else {
    const next = state.doc.lineAt(block.to + 1);
    if (next.text.trim() === '') view.dispatch({ selection: { anchor: next.from }, scrollIntoView: true });
    else view.dispatch({ changes: { from: block.to, insert: '\n' }, selection: { anchor: block.to + 1 }, scrollIntoView: true });
  }
  return true;
}

// ---- Otros elementos ----

export function insertComment(view) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `<!-- ${text} -->` },
    selection: { anchor: from + 5, head: from + 5 + text.length },
    userEvent: 'input.format',
  });
  view.focus();
}

// Bloque de propiedades YAML al principio del documento.
export function insertFrontmatter(view) {
  if (/^---\s*\n/.test(view.state.sliceDoc(0, 8))) {
    view.dispatch({ selection: { anchor: 4 }, scrollIntoView: true });
    return view.focus();
  }
  const text = '---\ntitulo: \n---\n\n';
  view.dispatch({ changes: { from: 0, insert: text }, selection: { anchor: 12 }, scrollIntoView: true, userEvent: 'input.format' });
  view.focus();
}

// Quita negrita, cursiva, tachado, subrayado y código en línea de la selección (o de la línea actual).
export function clearFormat(view) {
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  const from = sel.empty ? line.from : sel.from;
  const to = sel.empty ? line.to : sel.to;
  const src = state.sliceDoc(from, to);
  let out = src;
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<(u|sub|sup|mark|kbd)>(.*?)<\/\1>/gi, '$2');
    if (out === before) break;
  }
  if (out !== src) view.dispatch({ changes: { from, to, insert: out }, userEvent: 'input.format' });
  view.focus();
}

// ---- Portapapeles (los atajos de teclado normales los gestiona el propio editor) ----

export async function clipCopy(view, cut = false) {
  const { from, to } = view.state.selection.main;
  if (from === to) return view.focus();
  await window.api.clipboardWrite(view.state.sliceDoc(from, to));
  if (cut) view.dispatch({ changes: { from, to }, userEvent: 'delete.cut' });
  view.focus();
}

// Si el portapapeles no tiene texto, `onNoText` (p. ej. pegar una imagen) recibe el turno.
export async function clipPaste(view, onNoText) {
  const text = await window.api.clipboardRead();
  if (text) view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' });
  else if (onNoText) await onNoText(view);
  view.focus();
}

// ---- Formato activo en la posición del cursor, para marcar los botones de la cinta ----

function insideTag(line, text, head, tag) {
  const re = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const a = line.from + m.index;
    if (head >= a && head <= a + m[0].length) return true;
  }
  return false;
}

export function formatState(state) {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const text = line.text;
  const hm = /^(#{1,6})\s/.exec(text);
  const style = hm ? `h${hm[1].length}` : /^>/.test(text) ? 'quote' : 'normal';
  const lm = LIST_RE.exec(text.slice(quoteLen(text)));
  const list = lm ? (lm[3] ? 'task' : /\d/.test(lm[2]) ? 'ol' : 'ul') : null;

  const names = new Set();
  for (const side of [-1, 1]) {
    for (let n = syntaxTree(state).resolveInner(head, side); n; n = n.parent) names.add(n.name);
  }
  return {
    style,
    list,
    bold: names.has('StrongEmphasis'),
    italic: names.has('Emphasis'),
    strike: names.has('Strikethrough'),
    code: names.has('InlineCode'),
    underline: insideTag(line, text, head, 'u'),
    sub: insideTag(line, text, head, 'sub'),
    sup: insideTag(line, text, head, 'sup'),
  };
}

// ---- Intro como en un procesador de textos ----

const NOT_PARAGRAPH = ['ListItem', 'Blockquote', 'Table', 'FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock', 'LinkReference'];

// Intro en un párrafo normal crea un párrafo nuevo (línea en blanco): en Markdown un solo salto
// de línea se fusionaría con el párrafo anterior al leerlo en otro visor. Devuelve false si no aplica.
export function paragraphEnter(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.doc.lineAt(sel.head).text.trim() === '') return false;
  let inPara = false;
  for (let n = syntaxTree(state).resolveInner(sel.head, -1); n; n = n.parent) {
    if (NOT_PARAGRAPH.includes(n.name) || /Heading/.test(n.name)) return false;
    if (n.name === 'Paragraph') inPara = true;
  }
  if (!inPara) return false;
  view.dispatch({ changes: { from: sel.head, insert: '\n\n' }, selection: { anchor: sel.head + 2 }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

// Mayús+Intro: salto de línea dentro del mismo párrafo (en Markdown, barra invertida al final de línea).
export function softBreak(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  for (let n = syntaxTree(state).resolveInner(sel.head, -1); n; n = n.parent) {
    if (NOT_PARAGRAPH.includes(n.name) || /Heading/.test(n.name)) return false;
  }
  view.dispatch({ changes: { from: sel.head, insert: '\\\n' }, selection: { anchor: sel.head + 2 }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

// Intro en un elemento de lista vacío: sale de la lista (o reduce un nivel si está sangrado)
// dejando una línea en blanco, para que el texto siguiente no se pegue al último elemento.
export function exitEmptyListItem(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const q = quoteLen(line.text);
  const m = /^(\s*)([-*+]|\d+[.)])\s*(\[[ xX]\]\s*)?$/.exec(line.text.slice(q));
  if (!m || sel.head !== line.to) return false;
  if (m[1].length > 0) return changeIndent(view, -1);
  const prevBlank = line.number === 1 || state.doc.line(line.number - 1).text.trim() === '';
  const insert = prevBlank ? '' : '\n';
  view.dispatch({
    changes: { from: line.from + q, to: line.to, insert },
    selection: { anchor: line.from + q + insert.length },
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
}
