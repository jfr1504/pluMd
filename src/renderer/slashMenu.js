import { autocompletion, completionKeymap, closeCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { items, executeCommand } from './plugins/registry.js';

// Menú que se abre al escribir "/" al principio de una línea o tras un espacio, como en Obsidian.
// Elegir una opción borra lo escrito ("/tab") y ejecuta el comando.
const CORE = [
  ['style-h1', 'Título 1'], ['style-h2', 'Título 2'], ['style-h3', 'Título 3'],
  ['style-h4', 'Título 4'], ['style-h5', 'Título 5'], ['style-h6', 'Título 6'],
  ['style-normal', 'Párrafo normal'], ['style-quote', 'Cita'],
  ['ul', 'Lista con viñetas'], ['ol', 'Lista numerada'], ['task', 'Lista de tareas'],
  ['table', 'Tabla'], ['image', 'Imagen'], ['link', 'Vínculo'],
  ['codeblock', 'Bloque de código'], ['rule', 'Línea horizontal'],
  ['comment', 'Comentario oculto'], ['props', 'Propiedades del documento'],
];

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const NO_SLASH = ['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'CommentBlock', 'Comment', 'HTMLBlock', 'URL', 'FrontMatter'];

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) if (NO_SLASH.includes(n.name)) return true;
  return false;
}

// Comandos del menú "/": los del núcleo y los de los plugins que tienen título. También los usa el menú contextual.
export const slashEntries = () => [
  ...CORE.map(([id, label]) => ({ id, label })),
  ...items('commands').filter((c) => c.title && c.owner !== 'core').map((c) => ({ id: c.id, label: c.title, plugin: c.owner })),
];

function source(ctx) {
  const m = ctx.matchBefore(/(?:^|\s)\/[^\s/]*/);
  if (!m) return null;
  const from = m.from + (m.text.startsWith('/') ? 0 : 1);
  if (inCode(ctx.state, from)) return null;
  const entries = slashEntries();
  return {
    from,
    filter: false,
    options: entries.map((e) => ({
      label: e.label,
      detail: e.plugin || undefined,
      type: 'slash',
      // El texto que se compara con lo escrito tras la barra, sin acentos ni mayúsculas.
      _match: norm(e.label),
      apply: (view, _c, f, t) => {
        view.dispatch({ changes: { from: f, to: t }, userEvent: 'delete.slash' });
        view.focus();
        executeCommand(e.id).catch((err) => console.error(err));
      },
    })).filter((o) => o._match.includes(norm(ctx.state.sliceDoc(from + 1, ctx.pos)))),
    validFor: () => false,
  };
}

export const slashMenu = () => [
  autocompletion({
    override: [source],
    icons: false,
    defaultKeymap: false,
    closeOnBlur: true,
    tooltipClass: () => 'slash-menu',
  }),
  Prec.highest(keymap.of([...completionKeymap, { key: 'Escape', run: closeCompletion }])),
];
