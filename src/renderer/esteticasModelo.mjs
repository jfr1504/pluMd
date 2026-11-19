// Estéticas de PluMd: una capa sobre el aspecto (skin) y el modo (claro u oscuro). Un skin cambia el cromo de la
// aplicación; una estética cambia cómo se presenta el documento (tipografía, márgenes, movimiento).
// Sin dependencias del navegador, para poder probar que cada estética tiene su hoja y su nombre.

export const ESTETICA_BASE = 'clasica';

export const ESTETICAS = [
  { id: 'clasica', name: 'Clásica', description: 'El aspecto de siempre de PluMd', icon: 'estclasica', css: null },
  {
    id: 'folio',
    name: 'Folio',
    description: 'Estética editorial: titulares con serifa, columna de lectura y movimiento suave',
    icon: 'estfolio',
    css: 'esteticas/folio.css',
  },
];

export const esEstetica = (id) => ESTETICAS.some((e) => e.id === id);
export const buscarEstetica = (id) => ESTETICAS.find((e) => e.id === id) || ESTETICAS[0];
