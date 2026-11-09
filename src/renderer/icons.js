// Iconos de trazo (viewBox 24×24). Se pintan con currentColor.
const P = (d) => `<path d="${d}"/>`;

export const ICONS = {
  save: P('M5 3h11l3 3v15H5z M8 3v6h7V3 M8 21v-7h8v7'),
  undo: P('M9 14L4 9l5-5 M4 9h10a6 6 0 010 12h-3'),
  redo: P('M15 14l5-5-5-5 M20 9H10a6 6 0 000 12h3'),
  paste: P('M9 4h6v3H9z M7 5.5H5v15h14v-15h-2 M9 12h6 M9 16h6'),
  cut: P('M6 9a3 3 0 100-6 3 3 0 000 6z M6 21a3 3 0 100-6 3 3 0 000 6z M20 4L8.1 15.9 M14.5 14.5L20 20 M8.1 8.1L12 12'),
  copy: P('M9 9h11v11H9z M5 15V4h11'),
  bold: P('M7 4h6a4 4 0 010 8H7z M7 12h7a4 4 0 010 8H7z'),
  italic: P('M19 4h-9 M14 20H5 M15 4L9 20'),
  underline: P('M7 4v7a5 5 0 0010 0V4 M5 21h14'),
  strike: P('M4 12h16 M16 7c0-2-2-3-4-3s-4 1-4 3c0 4 8 2 8 6 0 2-2 4-4 4s-4-1-4-3'),
  code: P('M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16'),
  eraser: P('M4 16l9-9 6 6-6 6H8z M13 19h8 M9 11l6 6'),
  ul: P('M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01'),
  ol: P('M10 6h10 M10 12h10 M10 18h10 M4 4.5l1.5-1v5 M3.5 13.5c0-1 2.5-1 2.5.3 0 1-2.5 2-2.5 3.2h2.7 M3.5 19.5h2.2l-1 1.2c1.3 0 1.5 2-.2 2'),
  task: P('M4 4h6v6H4z M5.5 7l1.5 1.5L9 5.5 M14 7h6 M4 14h6v6H4z M14 17h6'),
  outdent: P('M3 6h18 M11 12h10 M3 18h18 M7 9l-4 3 4 3'),
  indent: P('M3 6h18 M11 12h10 M3 18h18 M3 9l4 3-4 3'),
  quote: P('M5 7h5v5H5z M5 12c0 3 1 4 3 5 M14 7h5v5h-5z M14 12c0 3 1 4 3 5'),
  search: P('M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.5-4.5'),
  replace: P('M4 7h13l-3-3 M20 17H7l3 3'),
  selectall: P('M4 4h16v16H4z M8 8h8v8H8z'),
  table: P('M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14 M15 5v14'),
  image: P('M3 5h18v14H3z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 16l-5-5-8 8'),
  link: P('M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1 M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'),
  hr: P('M3 12h18 M7 6h10 M7 18h10'),
  codeblock: P('M3 4h18v16H3z M9 9l-3 3 3 3 M15 9l3 3-3 3'),
  comment: P('M4 4h16v12H9l-5 4z'),
  props: P('M4 5h16v14H4z M8 9h8 M8 13h5'),
  open: P('M3 6h6l2 2h10v11H3z'),
  eye: P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z'),
  filecode: P('M7 3h8l4 4v14H7z M15 3v4h4 M11 12l-2 2 2 2 M15 12l2 2-2 2'),
  sun: P('M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M19 5l-1.5 1.5 M6.5 17.5L5 19'),
  moon: P('M20 14A8 8 0 1110 4a6 6 0 0010 10z'),
  zoomin: P('M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.5-4.5 M8 11h6 M11 8v6'),
  zoomout: P('M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.5-4.5 M8 11h6'),
  chevron: P('M6 9l6 6 6-6'),
  chevronup: P('M6 15l6-6 6 6'),
  close: P('M6 6l12 12 M18 6L6 18'),
  palette: P('M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4-4-8-9-8z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01'),
  skinpl: P('M5 4h11l3 3v13H5z M16 4v3h3 M8 15l5-5 2 2-5 5H8z'),
  skinwin: P('M4 5l7-1v7H4z M13 3.8L20 3v8h-7z M4 13h7v7l-7-1z M13 13h7v8l-7-1z'),
  skinmac: P('M4 5h16v14H4z M4 9h16 M7 7h.01 M9.5 7h.01 M12 7h.01'),
  folder: P('M3 6h6l2 2h10v11H3z'),
  folderopen: P('M3 19V6h6l2 2h8v3 M3 19l3-8h17l-3 8z'),
  filenew: P('M7 3h8l4 4v14H7z M15 3v4h4 M13 11v6 M10 14h6'),
  filetext: P('M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6'),
  refresh: P('M20 11A8 8 0 006.3 6.3L4 9 M4 4v5h5 M4 13a8 8 0 0013.7 4.7L20 15 M20 20v-5h-5'),
  trash: P('M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6'),
  pencil: P('M4 20l4-1 11-11-3-3L5 16z M14 7l3 3'),
  sidebar: P('M3 4h18v16H3z M9 4v16'),
  paste2: P('M9 4h6v3H9z M7 5.5H5v15h14v-15h-2 M12 11v6 M9 14h6'),
  reveal: P('M3 6h6l2 2h10v11H3z M12 13h5 M14.5 10.5L17 13l-2.5 2.5'),
  puzzle: P('M10 4a2 2 0 114 0v1h4v4h-1a2 2 0 100 4h1v4h-4v-1a2 2 0 10-4 0v1H6v-4H5a2 2 0 110-4h1V5h4z'),
  info: P('M12 3a9 9 0 100 18 9 9 0 000-18z M12 11v6 M12 7.5h.01'),
  fullscreen: P('M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5'),
  fit: P('M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M8 8h8v8H8z'),
  grid: P('M4 4h16v16H4z M4 9.3h16 M4 14.7h16 M9.3 4v16 M14.7 4v16'),
  eyeoff: P('M2 12s4-7 10-7c2 0 3.8.6 5.2 1.5 M22 12s-4 7-10 7c-2 0-3.8-.6-5.2-1.5 M4 4l16 16 M10 10a3 3 0 004 4'),
  lock: P('M6 11h12v9H6z M8 11V8a4 4 0 118 0v3'),
  export: P('M12 3v12 M7 8l5-5 5 5 M4 15v6h16v-6'),
  insertdraw: P('M7 3h8l4 4v14H7z M15 3v4h4 M9 17l3-3 2 2 3-3'),
  saveas: P('M5 3h11l3 3v6 M5 3v18h7 M8 3v6h7V3 M15 19l2 2 4-5'),
};

export function icon(name, size) {
  const s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="ico" viewBox="0 0 24 24"${s} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.removeAttribute('data-icon');
  });
}
