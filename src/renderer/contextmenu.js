import { icon } from './icons.js';

// Menú contextual compartido (editor, pestañas y panel de carpetas).
// Elementos: '-' (separador) | { label, icon?, key?, title?, disabled?, checked?, run } | { label, icon?, items } (submenú).
// Se maneja con el ratón y con el teclado (flechas, Intro, Escape).

let panels = []; // menú principal y submenús abiertos; el último es el más profundo
let hot = null; // opción resaltada con el teclado

export function closeMenu() {
  for (const p of panels) p.remove();
  panels = [];
  hot = null;
}

function closeFrom(level) {
  while (panels.length > level) panels.pop().remove();
}

function setHot(btn) {
  hot?.classList.remove('hot');
  hot = btn;
  hot?.classList.add('hot');
}

function place(el, x, y) {
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 6))}px`;
  el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 6))}px`;
}

function openSub(btn, items, level) {
  closeFrom(level + 1);
  const sub = build(items, level + 1);
  sub._owner = btn;
  document.body.append(sub);
  panels.push(sub);
  const parent = btn.closest('.ctx').getBoundingClientRect();
  const row = btn.getBoundingClientRect();
  const w = sub.getBoundingClientRect().width;
  // Se abre a la derecha del menú; si no cabe, a la izquierda.
  const x = parent.right - 2 + w > window.innerWidth - 6 ? parent.left - w + 2 : parent.right - 2;
  place(sub, x, row.top - 6);
  return sub;
}

function build(items, level) {
  const m = document.createElement('div');
  m.className = 'popup menu ctx';
  m.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === '-') {
      m.append(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.disabled = !!it.disabled;
    if (it.title) b.title = it.title;
    if (it.icon) b.insertAdjacentHTML('beforeend', icon(it.icon, 16));
    else b.insertAdjacentHTML('beforeend', `<span class="ctx-ico">${it.checked ? '✓' : ''}</span>`);
    const t = document.createElement('span');
    t.textContent = it.label;
    b.append(t);
    if (it.key) b.insertAdjacentHTML('beforeend', `<kbd>${it.key}</kbd>`);
    if (it.items) b.insertAdjacentHTML('beforeend', '<span class="ctx-arrow">▸</span>');
    // El ratón no le quita el foco al editor: el comando actúa sobre la selección que había.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('mouseenter', () => {
      if (b.disabled) return;
      setHot(b);
      if (it.items) openSub(b, it.items, level);
      else closeFrom(level + 1);
    });
    b.addEventListener('click', () => {
      if (it.items) return openSub(b, it.items, level);
      closeMenu();
      try {
        it.run();
      } catch (e) {
        console.error(e);
      }
    });
    b._item = it;
    b._level = level;
    m.append(b);
  }
  return m;
}

export function showMenu(x, y, items) {
  closeMenu();
  const m = build(items, 0);
  document.body.append(m);
  panels.push(m);
  place(m, x, y);
}

document.addEventListener('mousedown', (e) => { if (panels.length && !e.target.closest('.ctx')) closeMenu(); }, true);
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

document.addEventListener('keydown', (e) => {
  if (!panels.length) return;
  const top = panels[panels.length - 1];
  const buttons = [...top.querySelectorAll(':scope > button:not(:disabled)')];
  const handled = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') {
    handled();
    if (panels.length > 1) {
      const owner = top._owner;
      closeFrom(panels.length - 1);
      setHot(owner);
    } else closeMenu();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    handled();
    if (!buttons.length) return;
    const i = buttons.indexOf(hot);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    setHot(buttons[i < 0 ? (step > 0 ? 0 : buttons.length - 1) : (i + step + buttons.length) % buttons.length]);
  } else if (e.key === 'ArrowRight') {
    if (!hot?._item?.items) return;
    handled();
    const sub = openSub(hot, hot._item.items, hot._level);
    setHot(sub.querySelector(':scope > button:not(:disabled)'));
  } else if (e.key === 'ArrowLeft') {
    if (panels.length < 2) return;
    handled();
    const owner = top._owner;
    closeFrom(panels.length - 1);
    setHot(owner);
  } else if ((e.key === 'Enter' || e.key === ' ') && hot) {
    handled();
    hot.click();
  }
}, true);
