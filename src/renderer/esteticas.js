import { ESTETICAS, buscarEstetica } from './esteticasModelo.mjs';

export const listEsteticas = () => ESTETICAS;

// Cambia de estética sin parpadeo, como applySkin: carga la hoja nueva y solo entonces quita la anterior.
// Devuelve una promesa con el id aplicado cuando ya está activa.
export function applyEstetica(id) {
  const est = buscarEstetica(id);
  const root = document.documentElement;
  const old = [...document.querySelectorAll('link[data-estetica]')];
  return new Promise((resolve) => {
    const finish = () => {
      old.filter((l) => l.dataset.estetica !== est.id).forEach((l) => l.remove());
      root.dataset.estetica = est.id;
      resolve(est.id);
    };
    if (!est.css || old.some((l) => l.dataset.estetica === est.id)) return finish();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = est.css;
    link.dataset.estetica = est.id;
    link.addEventListener('load', finish);
    link.addEventListener('error', finish);
    document.head.appendChild(link);
  });
}
