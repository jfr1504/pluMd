import { el } from './dialogs.js';
import { nombreDeNota } from '../main/wikilinks.js';
import { refrescar, vinculosEntrantes } from './wikilinkIndex.js';

// Panel «Vínculos entrantes» al pie del panel de carpetas: las notas de la carpeta abierta que enlazan,
// con [[...]], al documento activo. Pulsar una abre la nota en la línea del enlace.
export function createBacklinks({ onOpen }) {
  const box = document.getElementById('sb-backlinks');
  const head = document.getElementById('bl-head');
  const count = document.getElementById('bl-count');
  const list = document.getElementById('bl-list');
  let turno = 0;
  let abierto = true;
  let ultimo = null; // último documento pedido
  let atrasado = false; // hay una actualización pendiente por estar el panel cerrado o plegado

  const pintar = (lista) => {
    list.textContent = '';
    count.textContent = lista.length ? String(lista.reduce((n, x) => n + x.links.length, 0)) : '';
    if (!lista.length) {
      list.append(el('div', 'bl-empty', 'Ninguna nota enlaza a este documento.'));
      return;
    }
    for (const n of lista) {
      const grupo = el('div', 'bl-group');
      const titulo = el('button', 'bl-note', nombreDeNota(n.path));
      titulo.type = 'button';
      titulo.title = n.rel;
      titulo.addEventListener('click', () => onOpen(n.path, n.links[0].line));
      grupo.append(titulo);
      const lineas = new Set();
      for (const l of n.links) {
        if (lineas.has(l.line)) continue; // dos enlaces en la misma línea se muestran una sola vez
        lineas.add(l.line);
        const fila = el('button', 'bl-link', l.text);
        fila.type = 'button';
        fila.title = `Línea ${l.line}`;
        fila.addEventListener('click', () => onOpen(n.path, l.line));
        grupo.append(fila);
      }
      list.append(grupo);
    }
  };

  head.addEventListener('click', () => {
    abierto = !abierto;
    box.classList.toggle('collapsed', !abierto);
    head.setAttribute('aria-expanded', String(abierto));
    if (abierto && atrasado) update(ultimo);
  });

  // Se actualiza al cambiar de documento, al guardar, al abrir otra carpeta y al mostrar el panel. Sin fichero guardado
  // no hay nada que mostrar. Con el panel de carpetas oculto o este bloque plegado no se lee la carpeta (en una raíz
  // enorme cuesta segundos): queda anotado y se actualiza al mostrarlo.
  async function update(file) {
    ultimo = file;
    const mio = ++turno;
    if (!file) { box.hidden = true; atrasado = false; return; }
    if (!abierto || box.closest('#sidebar')?.hidden) { atrasado = true; return; }
    atrasado = false;
    const idx = await refrescar(true);
    if (mio !== turno) return; // llegó una petición más reciente
    box.hidden = !idx.files.length;
    if (!box.hidden) pintar(vinculosEntrantes(file));
  }

  return { update };
}
