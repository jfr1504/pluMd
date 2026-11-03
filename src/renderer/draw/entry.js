// Paquete aparte con Excalidraw y React. No se carga al arrancar: drawView.js lo pide la primera vez
// que se abre un dibujo y lo deja disponible en window.PluMdDraw.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './draw.css';

let root = null;

// Menú del lienzo reducido a lo que tiene sentido dentro de PluMd (sin enlaces sociales ni abrir/guardar propios).
const menu = () =>
  h(MainMenu, null,
    h(MainMenu.DefaultItems.SaveAsImage),
    h(MainMenu.DefaultItems.ClearCanvas),
    h(MainMenu.DefaultItems.ChangeCanvasBackground),
    h(MainMenu.DefaultItems.Help));

window.PluMdDraw = {
  mount(el) {
    if (!root) root = createRoot(el);
  },

  // Pinta (o actualiza) el lienzo. Con otra `key` se parte de la escena nueva.
  render({ key, escena, theme, onChange }) {
    const datos = restore({ elements: escena.elements, appState: escena.appState, files: escena.files }, null, null);
    root.render(h(Excalidraw, {
      key,
      initialData: { ...datos, scrollToContent: true },
      theme,
      langCode: 'es-ES',
      autoFocus: true,
      onChange,
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } },
    }, menu()));
  },

  // Escena actual -> objeto listo para guardar en el .excalidraw.md
  serialize({ elements, appState, files }) {
    return JSON.parse(serializeAsJSON(elements, appState, files, 'local'));
  },

  unmount() {
    if (root) root.render(null);
  },
};
