import { syntaxTree } from '@codemirror/language';
import { archivos, refrescar } from './wikilinkIndex.js';
import { nombreDeNota } from '../main/wikilinks.js';

// Autocompletado al escribir «[[»: ofrece los documentos de la carpeta abierta por su nombre.
// Elegir uno escribe el nombre y cierra con «]]» (si ya estaban, no los duplica).
const NO_ENLACE = ['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'CommentBlock', 'Comment', 'HTMLBlock', 'FrontMatter'];
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const enCodigo = (state, pos) => {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) if (NO_ENLACE.includes(n.name)) return true;
  return false;
};

export function wikilinkSource(ctx) {
  const m = ctx.matchBefore(/\[\[[^\[\]\n|#]*/);
  if (!m || enCodigo(ctx.state, m.from)) return null;
  const from = m.from + 2;
  const q = sinTildes(ctx.state.sliceDoc(from, ctx.pos));
  refrescar(); // por si la lista está desactualizada; las opciones salen de la última lectura
  const opciones = archivos()
    .map((a) => ({ a, nombre: nombreDeNota(a.name) }))
    .filter(({ nombre, a }) => !q || sinTildes(nombre).includes(q) || sinTildes(a.rel).includes(q))
    .sort((x, y) => (sinTildes(x.nombre).startsWith(q) ? 0 : 1) - (sinTildes(y.nombre).startsWith(q) ? 0 : 1) || x.a.rel.length - y.a.rel.length)
    .slice(0, 50)
    .map(({ a, nombre }) => ({
      label: nombre,
      detail: a.rel.includes('/') ? a.rel.slice(0, a.rel.lastIndexOf('/')) : undefined,
      type: 'wikilink',
      apply: (view, _c, f, t) => {
        const cierre = view.state.sliceDoc(t, t + 2) === ']]';
        const insert = cierre ? nombre : `${nombre}]]`;
        view.dispatch({ changes: { from: f, to: t, insert }, selection: { anchor: f + nombre.length + 2 }, userEvent: 'input.complete' });
      },
    }));
  return opciones.length ? { from, filter: false, options: opciones, validFor: () => false } : null;
}
