// Resolución de rutas de imagen respecto al fichero abierto.

let baseDir = null;

export function setBaseDir(dir) {
  baseDir = dir;
}
export const getBaseDir = () => baseDir;

export const dirname = (p) => {
  const i = window.api.platform === 'win32'
    ? Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
    : p.lastIndexOf('/');
  if (i < 0) return '';
  if (i === 0) return p.slice(0, 1);
  if (i === 2 && /^[a-zA-Z]:[\\/]/.test(p)) return p.slice(0, 3);
  return p.slice(0, i);
};

const encodePath = (p) => p.split('/').map((part, i) => (i === 0 && !part ? '' : encodeURIComponent(part))).join('/');

export function fileUrl(p) {
  // En POSIX, una barra inversa forma parte del nombre, no es un separador.
  if (window.api.platform !== 'win32' && p.startsWith('/')) return 'file://' + encodePath(p);
  const s = p.replace(/\\/g, '/');
  if (/^\/(?!\/)/.test(s)) return 'file://' + encodePath(s);
  const enc = (parts) => parts.map((x, i) => (i === 0 && /^[a-zA-Z]:$/.test(x) ? x : encodeURIComponent(x))).join('/');
  if (s.startsWith('//')) return 'file:' + '//' + enc(s.slice(2).split('/'));
  return 'file:///' + enc(s.split('/'));
}

export function resolveImageSrc(src) {
  if (!src) return null;
  if (/^(https?:|data:|file:)/i.test(src)) return src;
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('\\\\') ||
      (window.api.platform !== 'win32' && src.startsWith('/'))) return fileUrl(src);
  if (!baseDir) return null;
  try {
    const relative = window.api.platform === 'win32' ? src : src.replace(/\\/g, '%5C');
    return new URL(relative, fileUrl(baseDir).replace(/\/?$/, '/')).href;
  } catch {
    return null;
  }
}

// Ruta relativa de `target` respecto al fichero `mdPath` (con / y espacios codificables).
// Si están en unidades distintas devuelve la ruta absoluta.
export function relativeTo(mdPath, target) {
  const normalize = (p) => window.api.platform === 'win32' ? p.replace(/\\/g, '/') : p;
  const base = normalize(dirname(mdPath));
  const destination = normalize(target);
  const encodeBackslashes = (p) => window.api.platform === 'win32' ? p : p.replace(/\\/g, '%5C');
  const root = (p) => {
    if (/^[a-zA-Z]:\//.test(p)) return p.slice(0, 2);
    if (p.startsWith('//')) return p.split('/').slice(0, 4).join('/');
    return p.startsWith('/') ? '/' : '';
  };
  const fromRoot = root(base);
  const toRoot = root(destination);
  const fold = (s) => window.api.platform === 'win32' ? s.toLowerCase() : s;
  if (fold(fromRoot) !== fold(toRoot)) return encodeBackslashes(destination);
  const a = base.slice(fromRoot.length).split('/').filter(Boolean);
  const b = destination.slice(toRoot.length).split('/').filter(Boolean);
  let i = 0;
  // El último segmento de destino es el fichero, incluso si coincide con una carpeta de origen.
  while (i < a.length && i < b.length - 1 && fold(a[i]) === fold(b[i])) i++;
  return encodeBackslashes([...Array(a.length - i).fill('..'), ...b.slice(i)].join('/'));
}
