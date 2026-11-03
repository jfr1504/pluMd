// Vista de dibujo: monta Excalidraw dentro de #draw. El paquete (draw.js + draw.css) pesa varios MB,
// así que no se carga al arrancar sino la primera vez que se abre un dibujo.
let cargando = null;
let actual = null; // { doc, onChange } del dibujo visible
let zoomPct = 100; // zoom del lienzo según el último aviso de Excalidraw
const modos = { rejilla: false, zen: false, lectura: false };

export function listo() {
  if (window.PluMdDraw) return Promise.resolve();
  if (cargando) return cargando;
  // Excalidraw busca sus tipografías en esta ruta (se copian en la compilación).
  window.EXCALIDRAW_ASSET_PATH = new URL('excalidraw-assets/', document.baseURI).href;
  cargando = new Promise((ok, fallo) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'draw.css';
    const js = document.createElement('script');
    js.src = 'draw.js';
    js.onload = ok;
    js.onerror = () => { cargando = null; fallo(new Error('No se pudo cargar el editor de dibujos')); };
    document.head.append(css, js);
  });
  return cargando;
}

const tema = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

// Identifica el contenido del dibujo: si cambia, el documento tiene cambios sin guardar.
export const firma = (elements) => (elements || []).map((e) => `${e.id}:${e.version}`).join('|');

function pintar() {
  const { doc, onChange } = actual;
  const { latest, escena } = doc.draw;
  window.PluMdDraw.render({ key: doc.id, escena: latest || escena, theme: tema(), modos, onChange });
}

// Muestra el dibujo del documento en el contenedor. `onChange(elements, appState, files)` avisa de cada cambio.
export async function mostrar(contenedor, doc, onChange) {
  actual = { doc, onChange };
  await listo();
  if (!actual || actual.doc !== doc) return; // mientras cargaba se cambió de pestaña
  window.PluMdDraw.mount(contenedor);
  pintar();
}

// Repinta el lienzo con el estado actual: tema claro/oscuro de la aplicación y pantalla completa.
export function repintar() {
  if (actual && window.PluMdDraw) pintar();
}

export function ocultar() {
  actual = null;
  if (window.PluMdDraw) window.PluMdDraw.unmount();
}

// Cuadrícula, zen y solo lectura: la cinta los activa y Excalidraw los avisa si cambian por su cuenta (atajos).
export const verModos = () => ({ ...modos });
export function ponerModo(nombre, valor) {
  modos[nombre] = !!valor;
  if (actual && window.PluMdDraw) pintar();
}
// Solo se adopta un modo cuando Excalidraw lo cambia respecto al último aviso (p. ej. con un atajo): un aviso
// atrasado, anterior a que el lienzo aplique el modo que acaba de pedir la cinta, no debe deshacerlo.
const visto = { rejilla: false, zen: false, lectura: false };
export function sincronizar(appState) {
  const actual = { rejilla: !!appState.gridModeEnabled, zen: !!appState.zenModeEnabled, lectura: !!appState.viewModeEnabled };
  for (const k of Object.keys(visto)) {
    if (actual[k] !== visto[k]) modos[k] = actual[k];
    visto[k] = actual[k];
  }
  zoomPct = Math.round(appState.zoom.value * 100);
  return { ...modos, zoom: zoomPct };
}

export const zoomActual = () => zoomPct;
export const zoom = (pct) => window.PluMdDraw && window.PluMdDraw.zoom(pct);
export const ajustar = () => window.PluMdDraw && window.PluMdDraw.ajustar();
export const serializar = (latest) => window.PluMdDraw.serialize(latest);
export const exportar = async (escena, tipo) => (await listo(), window.PluMdDraw.exportar(escena, tipo));
