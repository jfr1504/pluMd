import { openBox, closeBox, el } from './dialogs.js';
import { filtrar, carpetaDe } from './buscadorModelo.mjs';

const MAX_SHOWN = 50;

// Selector rápido de ficheros (Ctrl+P): busca por nombre entre los documentos de la carpeta abierta y los
// que están abiertos en pestañas. `abiertos` son rutas, de la pestaña actual hacia atrás; salen primero.
// Devuelve una promesa que se resuelve al cerrar el cuadro.
export async function openQuickOpen({ abiertos, onOpen }) {
  const { host, box } = openBox('dlg-palette');
  const input = el('input', 'pal-input');
  input.type = 'text';
  input.placeholder = 'Escribe parte del nombre de un documento…';
  input.autocomplete = 'off';
  const list = el('div', 'pal-list');
  const nota = el('div', 'pal-note');
  nota.hidden = true;
  box.append(input, list, nota);

  let archivos = [];
  let shown = [];
  let sel = 0;
  let finish;
  const cerrado = new Promise((res) => { finish = res; });

  const draw = () => {
    shown = filtrar(archivos, input.value, { recientes: abiertos, max: MAX_SHOWN });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.textContent = '';
    shown.forEach((a, i) => {
      const row = el('div', `pal-row${i === sel ? ' sel' : ''}`);
      row.title = a.path;
      row.append(el('span', 'pal-title', a.name));
      const dir = carpetaDe(a.rel);
      if (dir) row.append(el('span', 'pal-dir', dir));
      row.addEventListener('mousedown', (ev) => { ev.preventDefault(); run(a); });
      list.append(row);
    });
    if (!shown.length) list.append(el('div', 'pal-empty', archivos.length ? 'Ningún documento coincide.' : 'No hay documentos que mostrar.'));
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => {
    closeBox(host);
    finish();
  };
  const run = (a) => {
    close();
    onOpen(a.path);
  };

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) run(shown[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  host.addEventListener('mousedown', (e) => { if (e.target === host) close(); }, { once: true });
  input.focus();

  // Primero lo que ya se sabe (pestañas abiertas); la carpeta se lee a continuación.
  const nombre = (p) => p.split(/[\\/]/).pop();
  archivos = abiertos.map((p) => ({ name: nombre(p), path: p, rel: nombre(p) }));
  draw();
  const r = await window.api.fsListAll().catch(() => null);
  if (r && r.ok) {
    const vistos = new Set(r.files.map((f) => f.path.toLowerCase()));
    archivos = [...r.files, ...archivos.filter((a) => !vistos.has(a.path.toLowerCase()))];
    if (r.truncated) {
      nota.textContent = 'La carpeta tiene muchos documentos: se muestran solo los primeros.';
      nota.hidden = false;
    }
    draw();
  }
  return cerrado;
}
