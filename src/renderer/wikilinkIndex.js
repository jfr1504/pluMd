import { resolver, entrantes } from '../main/wikilinks.js';

// Índice de enlaces internos de la carpeta abierta: documentos y qué enlaza a qué.
// Se pide al proceso principal y se guarda un momento; `refrescar(true)` fuerza una lectura nueva
// (al guardar un documento, abrir otra carpeta o mostrar los vínculos entrantes).
const VIGENCIA_MS = 10000;

let indice = { files: [], links: [], truncated: false };
let leidoEn = 0;
let pendiente = null;

export function refrescar(forzar = false) {
  if (!forzar && Date.now() - leidoEn < VIGENCIA_MS) return Promise.resolve(indice);
  if (pendiente) return pendiente;
  pendiente = window.api.fsScanLinks()
    .then((r) => {
      if (r && r.ok) indice = { files: r.files, links: r.links, truncated: !!r.truncated };
      else indice = { files: [], links: [], truncated: false }; // sin carpeta abierta
      leidoEn = Date.now();
      return indice;
    })
    .catch(() => indice)
    .finally(() => { pendiente = null; });
  return pendiente;
}

export const olvidar = () => { leidoEn = 0; };
export const archivos = () => indice.files;
export const aDondeApunta = (target, desde) => resolver(target, indice.files, desde);
export const vinculosEntrantes = (ruta) => entrantes(ruta, indice.files, indice.links);
