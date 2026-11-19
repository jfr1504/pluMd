import { resolver, entrantes } from '../main/wikilinks.js';

// Índice de enlaces internos de la carpeta abierta: documentos y qué enlaza a qué.
// Se pide al proceso principal y se guarda un momento; `refrescar(true)` fuerza una lectura nueva
// (al guardar un documento, abrir otra carpeta o mostrar los vínculos entrantes).
// En una carpeta enorme la primera lectura puede tardar unos segundos: `leido()` dice si ya hay un índice de
// esta carpeta, para que el autocompletado avise de que sigue indexando en lugar de quedarse en blanco.
const VIGENCIA_MS = 30000;

const VACIO = { files: [], links: [], truncated: false };
let indice = VACIO;
let leidoEn = 0;
let hayIndice = false;
let pendiente = null;

export function refrescar(forzar = false) {
  if (!forzar && Date.now() - leidoEn < VIGENCIA_MS) return Promise.resolve(indice);
  if (pendiente) return pendiente;
  pendiente = window.api.fsScanLinks()
    .then((r) => {
      indice = r && r.ok ? { files: r.files, links: r.links, truncated: !!r.truncated } : VACIO; // sin carpeta abierta
      leidoEn = Date.now();
      hayIndice = true;
      return indice;
    })
    .catch(() => indice)
    .finally(() => { pendiente = null; });
  return pendiente;
}

// Al abrir otra carpeta se descarta el índice de la anterior: no debe ofrecer sus notas.
export const olvidar = () => { leidoEn = 0; hayIndice = false; indice = VACIO; };
export const leido = () => hayIndice;
export const archivos = () => indice.files;
export const aDondeApunta = (target, desde) => resolver(target, indice.files, desde);
export const vinculosEntrantes = (ruta) => entrantes(ruta, indice.files, indice.links);
