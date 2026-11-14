import { EditorState, Annotation } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { livePreview } from './livePreview.js';
import { tableField } from './tables.js';
import { blockField } from './plugins/blockRenderers.js';
import { codeLanguages, codeHighlight } from './highlight.js';

// Vista dividida: el editor de la izquierda en Código y, a la derecha, el mismo documento en Lectura.
// El panel derecho es un segundo editor de solo lectura. Los dos textos son siempre idénticos: cada cambio
// de un panel se copia al otro con el mismo conjunto de cambios (la anotación evita que rebote). Así también
// llegan al texto los cambios que hace la propia vista, como marcar una tarea o editar una celda de tabla.
const desdeOtroPanel = Annotation.define();

const extensiones = (onChange) => [
  markdown({ base: markdownLanguage, codeLanguages }),
  codeHighlight,
  EditorView.lineWrapping,
  livePreview({ reveal: false }),
  tableField,
  blockField,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.updateListener.of((u) => {
    if (u.docChanged && !u.transactions.some((t) => t.annotation(desdeOtroPanel))) onChange(u.changes);
  }),
];

// main: el EditorView principal. left y right: los contenedores con desplazamiento propio de cada panel.
export function createSplitView({ main, left, right }) {
  let mirror = null;
  let soltar = null; // quita los avisos de desplazamiento al cerrar
  let pideAvance = false;

  // Desplazamiento proporcional: el panel que se mueve arrastra al otro hasta el mismo punto del texto.
  const sincronizarScroll = () => {
    const seguir = (de, a) => () => {
      if (pideAvance) return;
      const espacio = de.scrollHeight - de.clientHeight;
      if (espacio <= 0) return;
      pideAvance = true;
      a.scrollTop = (de.scrollTop / espacio) * Math.max(0, a.scrollHeight - a.clientHeight);
      requestAnimationFrame(() => { pideAvance = false; });
    };
    const l = seguir(left, right);
    const r = seguir(right, left);
    left.addEventListener('scroll', l, { passive: true });
    right.addEventListener('scroll', r, { passive: true });
    return () => {
      left.removeEventListener('scroll', l);
      right.removeEventListener('scroll', r);
    };
  };

  const estado = (doc) => EditorState.create({
    doc,
    extensions: extensiones((changes) => main.dispatch({ changes, annotations: desdeOtroPanel.of(true) })),
  });

  return {
    isOpen: () => !!mirror,
    open(doc) {
      if (mirror) return;
      right.hidden = false;
      main.dom.closest('main')?.classList.add('split');
      mirror = new EditorView({ parent: right, state: estado(doc) });
      soltar = sincronizarScroll();
    },
    // Otro documento en el panel principal: la vista derecha se rehace con su texto.
    update(doc) {
      if (mirror) mirror.setState(estado(doc));
    },
    // Copia al panel derecho un cambio hecho en el principal.
    forward(u) {
      if (!mirror || !u.docChanged || u.transactions.some((t) => t.annotation(desdeOtroPanel))) return;
      mirror.dispatch({ changes: u.changes, annotations: desdeOtroPanel.of(true) });
    },
    close() {
      if (!mirror) return;
      soltar?.();
      mirror.destroy();
      mirror = null;
      right.hidden = true;
      main.dom.closest('main')?.classList.remove('split');
    },
  };
}
