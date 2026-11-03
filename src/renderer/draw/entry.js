// Paquete aparte con Excalidraw y React. No se carga al arrancar: drawView.js lo pide la primera vez
// que se abre un dibujo y lo deja disponible en window.PluMdDraw.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, restore, serializeAsJSON, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './draw.css';

const PADDING_EXPORT = 16; // múltiplo de 4, como el resto de espaciados
const ESCALA_PNG = 2;
const DURACION_VUELTA_MS = 300; // duración del traslado de «Volver al contenido»

let root = null;
let api = null; // API imperativa de la instancia de Excalidraw en pantalla

// Menú del lienzo reducido a lo que tiene sentido dentro de PluMd (sin enlaces sociales ni abrir/guardar propios).
const menu = () =>
  h(MainMenu, null,
    h(MainMenu.DefaultItems.SaveAsImage),
    h(MainMenu.DefaultItems.ClearCanvas),
    h(MainMenu.DefaultItems.ChangeCanvasBackground),
    h(MainMenu.DefaultItems.Help));

// En pantalla completa, el botón de salir va en la propia zona superior derecha de Excalidraw, a la derecha
// del botón Biblioteca, para que nunca se superpongan.
const salirPantallaCompleta = () =>
  document.fullscreenElement
    ? h('button', { type: 'button', className: 'plumd-exit', title: 'Salir de pantalla completa (F11)', onClick: () => document.exitFullscreen() },
        h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round' }, h('path', { d: 'M6 6l12 12 M18 6L6 18' })))
    : null;

window.PluMdDraw = {
  mount(el) {
    if (root) return;
    root = createRoot(el);
    // «Volver al contenido»: Excalidraw salta de golpe; aquí se intercepta el clic (en la fase de captura, antes
    // que su propio manejador) y se traslada la vista con animación.
    el.addEventListener('click', (e) => {
      if (!api || !e.target.closest('.scroll-back-to-content')) return;
      e.preventDefault();
      e.stopPropagation();
      api.scrollToContent(api.getSceneElements(), { animate: true, duration: DURACION_VUELTA_MS });
    }, true);
  },

  // Pinta (o actualiza) el lienzo. Con otra `key` se parte de la escena nueva.
  // `modos`: { rejilla, zen, lectura }, controlados desde la cinta de PluMd.
  // `libreria` y `onLibrary`: la biblioteca de formas guardada y el aviso cuando el usuario la cambia.
  render({ key, escena, theme, modos, libreria, onLibrary, onChange }) {
    const datos = restore({ elements: escena.elements, appState: escena.appState, files: escena.files }, null, null);
    root.render(h(Excalidraw, {
      key,
      initialData: { ...datos, libraryItems: libreria || [], scrollToContent: true },
      excalidrawAPI: (a) => { api = a; },
      theme,
      langCode: 'es-ES',
      autoFocus: true,
      gridModeEnabled: !!modos.rejilla,
      zenModeEnabled: !!modos.zen,
      viewModeEnabled: !!modos.lectura,
      onChange,
      onLibraryChange: onLibrary,
      renderTopRightUI: () => salirPantallaCompleta(), // función nueva en cada pintado: así Excalidraw la vuelve a evaluar
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } },
    }, menu()));
  },

  // Zoom en porcentaje manteniendo fijo el centro de lo que se ve.
  zoom(porcentaje) {
    if (!api) return;
    const s = api.getAppState();
    const z = Math.max(0.1, Math.min(30, porcentaje / 100));
    const cx = s.width / 2 / s.zoom.value - s.scrollX;
    const cy = s.height / 2 / s.zoom.value - s.scrollY;
    api.updateScene({ appState: { zoom: { value: z }, scrollX: s.width / 2 / z - cx, scrollY: s.height / 2 / z - cy } });
  },

  // Posición y zoom actuales de la vista (para comprobar los desplazamientos).
  estado() {
    if (!api) return null;
    const s = api.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value };
  },

  // Ajusta zoom y posición para ver todo el dibujo.
  ajustar() {
    if (!api) return;
    api.scrollToContent(api.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
  },

  // Escena actual -> objeto listo para guardar en el .excalidraw.md
  serialize({ elements, appState, files }) {
    return JSON.parse(serializeAsJSON(elements, appState, files, 'local'));
  },

  // PNG (Uint8Array) o SVG (texto) del dibujo, siempre con fondo y en claro para que se lea en cualquier nota.
  async exportar({ elements, appState, files }, tipo) {
    const opciones = {
      elements: elements.filter((e) => !e.isDeleted),
      appState: { ...appState, exportBackground: true, exportWithDarkMode: false, exportScale: ESCALA_PNG },
      files,
      exportPadding: PADDING_EXPORT,
    };
    if (tipo === 'svg') return new XMLSerializer().serializeToString(await exportToSvg(opciones));
    const blob = await exportToBlob({ ...opciones, mimeType: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  },

  unmount() {
    api = null;
    if (root) root.render(null);
  },
};
