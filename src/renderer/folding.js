import { foldService, foldGutter, codeFolding, foldKeymap, syntaxTree } from '@codemirror/language';
import { foldEffect, unfoldEffect, unfoldAll, foldedRanges } from '@codemirror/language';

// Sección de un título: desde el final de su línea hasta justo antes del siguiente título
// del mismo nivel o superior (o hasta el final del documento).
function sectionRange(state, lineStart) {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  let node = syntaxTree(state).resolveInner(line.from, 1);
  while (node && !/^(ATX|Setext)Heading[1-6]$/.test(node.name)) node = node.parent;
  if (!node || doc.lineAt(node.from).number !== line.number) return null;
  const level = +node.name.slice(-1);
  let end = doc.length;
  for (let n = node.nextSibling; n; n = n.nextSibling) {
    const h = /Heading([1-6])$/.exec(n.name);
    if (h && +h[1] <= level) {
      end = doc.lineAt(n.from).from - 1; // el salto de línea anterior al siguiente título
      break;
    }
  }
  const from = node.to;
  const to = Math.max(from, end);
  // Si no hay nada debajo del título no hay nada que plegar.
  return to > from && doc.sliceString(from, to).trim() !== '' ? { from, to } : null;
}

// Pliega todos los títulos (los anidados quedan plegados al desplegar el de arriba).
export function foldAllHeadings(view) {
  const effects = [];
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n);
    const r = sectionRange(view.state, line.from);
    if (r) effects.push(foldEffect.of(r));
  }
  if (effects.length) view.dispatch({ effects });
}

export const expandAll = (view) => unfoldAll(view);

// Sección del título que hay en la línea de `pos`: { range, folded }, o null si no es un título con contenido debajo.
export function sectionAt(state, pos) {
  const range = sectionRange(state, state.doc.lineAt(pos).from);
  if (!range) return null;
  let folded = false;
  foldedRanges(state).between(range.from, range.from, (from) => { if (from === range.from) folded = true; });
  return { range, folded };
}

// Contrae o expande la sección del título de la línea de `pos`.
export function toggleSection(view, pos) {
  const s = sectionAt(view.state, pos);
  if (!s) return;
  view.dispatch({ effects: (s.folded ? unfoldEffect : foldEffect).of(s.range) });
  view.focus();
}

function arrow(open) {
  const s = document.createElement('span');
  s.className = 'cm-fold-arrow' + (open ? '' : ' closed');
  s.textContent = open ? '▾' : '▸';
  s.title = open ? 'Contraer' : 'Expandir';
  return s;
}

export const headingFolding = [
  foldService.of((state, lineStart) => sectionRange(state, lineStart)),
  codeFolding({
    placeholderDOM(_view, onclick) {
      const s = document.createElement('span');
      s.className = 'cm-fold-chip';
      s.textContent = '⋯';
      s.title = 'Mostrar el contenido plegado';
      s.addEventListener('click', onclick);
      return s;
    },
  }),
  foldGutter({ markerDOM: arrow }),
];

export { foldKeymap };
