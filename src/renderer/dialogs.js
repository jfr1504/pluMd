import { relativeTo } from './images.js';
import { pathToFileUrl } from './commands.js';
import { COLOR_ITEMS, colorOf, savedColors, setColor, resetColors } from './colors.js';

// Los diálogos se apilan: si se abre uno encima de otro (p. ej. una confirmación sobre la pantalla de
// plugins), el de debajo se guarda y reaparece al cerrar el de encima.
function stash(host) {
  if (!host.hidden && host.childNodes.length) (host._stack ||= []).push([...host.childNodes]);
  host.textContent = '';
}

export function closeBox(host) {
  host.textContent = '';
  const prev = host._stack?.pop();
  if (prev) {
    host.append(...prev);
    host.hidden = false;
  } else host.hidden = true;
}

// Diálogo modal genérico. fields: [{ id, label, value, placeholder, browse }]
// Devuelve { [id]: valor } | { remove: true } | null (cancelado).
export function askForm({ title, fields, removable = false, okLabel = 'Aceptar' }) {
  const host = document.getElementById('dlg');
  stash(host);
  const form = document.createElement('form');
  const h = document.createElement('h3');
  h.textContent = title;
  form.append(h);

  const inputs = {};
  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = f.label;
    const row = document.createElement('div');
    row.className = 'dlg-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.value = f.value || '';
    if (f.placeholder) input.placeholder = f.placeholder;
    inputs[f.id] = input;
    row.append(input);
    if (f.browse) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = f.browseLabel || 'Examinar…';
      b.addEventListener('click', async () => {
        const v = await f.browse();
        if (v) input.value = v;
      });
      row.append(b);
    }
    label.append(row);
    form.append(label);
  }

  const actions = document.createElement('div');
  actions.className = 'dlg-actions';
  const mk = (text, type, cls) => {
    const b = document.createElement('button');
    b.type = type;
    b.textContent = text;
    if (cls) b.className = cls;
    return b;
  };
  const bRemove = removable ? mk('Quitar', 'button') : null;
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const bCancel = mk('Cancelar', 'button');
  const bOk = mk(okLabel, 'submit', 'primary');
  if (bRemove) actions.append(bRemove);
  actions.append(spacer, bCancel, bOk);
  form.append(actions);
  host.append(form);
  host.hidden = false;

  const first = fields.find((f) => !f.value) || fields[0];
  inputs[first.id].focus();

  return new Promise((resolve) => {
    const done = (value) => {
      closeBox(host);
      host.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape' && form.isConnected) done(null); };
    host.addEventListener('keydown', onKey);
    bCancel.addEventListener('click', () => done(null));
    if (bRemove) bRemove.addEventListener('click', () => done({ remove: true }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) out[f.id] = inputs[f.id].value.trim();
      const req = fields.find((f) => f.required && !out[f.id]);
      if (req) return inputs[req.id].focus();
      done(out);
    });
  });
}

export const askLink = ({ text = '', url = '', existing = false }) =>
  askForm({
    title: existing ? 'Editar vínculo' : 'Insertar vínculo',
    removable: existing,
    fields: [
      { id: 'text', label: 'Texto', value: text },
      {
        id: 'url',
        label: 'Dirección web o carpeta',
        value: url,
        placeholder: 'https://…  o  /home/usuario/carpeta  o  C:\\carpeta  o  \\\\servidor\\recurso',
        required: true,
        browseLabel: 'Carpeta…',
        browse: async () => {
          const p = await window.api.pickFolder();
          return p ? pathToFileUrl(p) : null;
        },
      },
    ],
  });

// getFile() devuelve la ruta del fichero abierto (para guardar rutas relativas).
export const askImage = ({ alt = '', url = '', existing = false }, getFile) =>
  askForm({
    title: existing ? 'Editar imagen' : 'Insertar imagen',
    removable: existing,
    fields: [
      {
        id: 'url',
        label: 'Ruta o dirección web',
        value: url,
        placeholder: 'imagenes/plano.png  o  https://…',
        required: true,
        browse: async () => {
          const p = await window.api.pickImage();
          if (!p) return null;
          const file = getFile();
          return file ? relativeTo(file, p) : p.replace(/\\/g, '/');
        },
      },
      { id: 'alt', label: 'Texto alternativo', value: alt },
    ],
  });

// ---- Utilidades de los cuadros de diálogo propios ----

export function openBox(cls) {
  const host = document.getElementById('dlg');
  stash(host);
  const box = document.createElement('div');
  box.className = `dlg-box ${cls}`;
  host.append(box);
  host.hidden = false;
  return { host, box };
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Cierra con Escape o clic fuera del cuadro. Devuelve una promesa que se resuelve al cerrar.
export function closable(host, box) {
  return new Promise((resolve) => {
    const done = () => {
      closeBox(host);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('mousedown', onOut);
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape' && box.isConnected) done(); };
    const onOut = (e) => { if (e.target === host && box.isConnected) done(); };
    host.addEventListener('keydown', onKey);
    host.addEventListener('mousedown', onOut);
    box.querySelector('[data-close]').addEventListener('click', done);
    box.querySelector('[data-close]').focus();
  });
}

// ---- Colores personalizables ----

export function openColors(label) {
  const { host, box } = openBox('dlg-colors');
  box.append(el('h3', null, `Colores: ${label}`));
  box.append(el('p', 'dlg-hint', 'Los cambios se aplican al momento y se recuerdan. Cada combinación de aspecto y modo (claro u oscuro) tiene sus propios colores. Se ven en el modo Lectura.'));

  const list = el('div', 'color-list');
  const rows = [];
  for (const [key, label] of COLOR_ITEMS) {
    const row = el('div', 'color-row');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorOf(key);
    const reset = el('button', 'color-reset', 'Restablecer');
    reset.type = 'button';
    const sync = () => { reset.hidden = !savedColors()[key]; };
    input.addEventListener('input', () => { setColor(key, input.value); sync(); });
    reset.addEventListener('click', () => { setColor(key, null); input.value = colorOf(key); sync(); });
    sync();
    row.append(el('span', 'color-label', label), input, reset);
    list.append(row);
    rows.push({ key, input, sync });
  }
  box.append(list);

  const actions = el('div', 'dlg-actions');
  const all = el('button', null, 'Restablecer todo');
  all.type = 'button';
  all.addEventListener('click', () => {
    resetColors();
    rows.forEach((r) => { r.input.value = colorOf(r.key); r.sync(); });
  });
  const close = el('button', 'primary', 'Cerrar');
  close.type = 'button';
  close.dataset.close = '1';
  actions.append(all, el('span', 'spacer'), close);
  box.append(actions);
  return closable(host, box);
}

// ---- Acerca de ----

const MIT_TEXT = `MIT License

Copyright (c) 2026 Jorge Ferreira Rey

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

export const REPO_URL = 'https://github.com/jfr1504/pluMd';

export function showAbout(info) {
  const { host, box } = openBox('dlg-about');
  const head = el('div', 'about-head');
  const logo = document.createElement('img');
  logo.className = 'about-logo';
  logo.src = 'logo.svg';
  logo.alt = '';
  head.append(logo);
  const t = el('div');
  t.append(el('h3', 'about-title', info.name || 'PluMd'), el('div', 'about-version', `Versión ${info.version}`));
  head.append(t);
  box.append(head);

  box.append(el('p', null, 'Editor y visor de Markdown para Windows y Linux, con cinta de opciones tipo Word y vista de lectura editable. Primer servicio de una plataforma de herramientas con arquitectura de plugins.'));

  const dl = el('dl', 'about-data');
  const add = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
  add('Autor', 'Jorge Ferreira Rey');
  add('Copyright', '© 2026 Jorge Ferreira Rey');
  add('Licencia', 'MIT: software libre. Puedes usarlo, copiarlo, modificarlo y distribuirlo conservando el aviso de copyright. Se ofrece sin garantía.');
  add('Código fuente', REPO_URL);
  add('Tecnología', `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · CodeMirror 6`);
  add('Tipografía', 'Inter (skin Mac), de The Inter Project Authors, bajo licencia SIL Open Font License 1.1.');
  box.append(dl);

  const det = el('details', 'about-license');
  det.append(el('summary', null, 'Texto completo de la licencia'), el('pre', null, MIT_TEXT));
  box.append(det);

  const actions = el('div', 'dlg-actions');
  const gh = el('button', null, 'Abrir en GitHub');
  gh.type = 'button';
  gh.addEventListener('click', () => window.api.openExternal(REPO_URL));
  const close = el('button', 'primary', 'Cerrar');
  close.type = 'button';
  close.dataset.close = '1';
  actions.append(gh, el('span', 'spacer'), close);
  box.append(actions);
  return closable(host, box);
}

// ---- Confirmación ----

// Devuelve true si el usuario acepta. Con danger=true el foco empieza en Cancelar.
export function confirmBox({ title, message, okLabel = 'Aceptar', danger = false }) {
  const { host, box } = openBox('dlg-confirm');
  box.append(el('h3', null, title), el('p', 'dlg-msg', message));
  const actions = el('div', 'dlg-actions');
  const cancel = el('button', null, 'Cancelar');
  cancel.type = 'button';
  const ok = el('button', danger ? 'danger' : 'primary', okLabel);
  ok.type = 'button';
  actions.append(el('span', 'spacer'), cancel, ok);
  box.append(actions);
  (danger ? cancel : ok).focus();
  return new Promise((resolve) => {
    const done = (v) => {
      closeBox(host);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('mousedown', onOut);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape' && box.isConnected) done(false); };
    const onOut = (e) => { if (e.target === host && box.isConnected) done(false); };
    host.addEventListener('keydown', onKey);
    host.addEventListener('mousedown', onOut);
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
  });
}
