// Vista de dibujo: monta Excalidraw dentro de #draw. El paquete (draw.js + draw.css) pesa varios MB,
// así que no se carga al arrancar sino la primera vez que se abre un dibujo.
let cargando = null;
let actual = null; // { doc, onChange } del dibujo visible

function cargar() {
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
  window.PluMdDraw.render({ key: doc.id, escena: latest || escena, theme: tema(), onChange });
}

// Muestra el dibujo del documento en el contenedor. `onChange(elements, appState, files)` avisa de cada cambio.
export async function mostrar(contenedor, doc, onChange) {
  actual = { doc, onChange };
  await cargar();
  if (!actual || actual.doc !== doc) return; // mientras cargaba se cambió de pestaña
  window.PluMdDraw.mount(contenedor);
  pintar();
}

// El modo claro/oscuro de la aplicación manda sobre el lienzo.
export function actualizarTema() {
  if (actual && window.PluMdDraw) pintar();
}

export function ocultar() {
  actual = null;
  if (window.PluMdDraw) window.PluMdDraw.unmount();
}

export const serializar = (latest) => window.PluMdDraw.serialize(latest);
