// Rutas reales, lista de accesos autorizados y escritura atómica.
// El renderer nunca decide por sí solo qué ficheros se leen o escriben: solo se puede operar sobre
//  - ficheros que el usuario eligió (diálogo, arrastre, argumento de arranque o vínculo abierto), y
//  - documentos dentro de la carpeta abierta, comparando siempre la ruta REAL (sin enlaces ni junctions).
const fs = require('fs');
const path = require('path');

const MD_RE = /\.(md|markdown|txt)$/i;

const key = (p) => path.resolve(p).toLowerCase();

// ¿`childKey` es `parentKey` o está dentro? Ambas ya normalizadas con key().
function within(childKey, parentKey) {
  const base = parentKey.endsWith(path.sep) ? parentKey : parentKey + path.sep;
  return childKey === parentKey || childKey.startsWith(base);
}

// Ruta real: resuelve enlaces simbólicos y junctions. Si el último tramo aún no existe (fichero por crear),
// resuelve su carpeta y le añade el nombre. Un enlace roto se rechaza.
async function realPath(p) {
  const abs = path.resolve(p);
  try {
    return await fs.promises.realpath(abs);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    try {
      await fs.promises.lstat(abs);
      throw new Error('Enlace roto: ' + abs);
    } catch (e2) {
      if (e2.code !== 'ENOENT') throw e2;
    }
    const dir = path.dirname(abs);
    if (dir === abs) throw e;
    return path.join(await realPath(dir), path.basename(abs));
  }
}

// Guarda en un temporal de la misma carpeta y lo cambia por el original: un corte a mitad de escritura
// deja el documento anterior intacto en vez de truncado.
async function writeAtomic(file, content) {
  const real = await realPath(file);
  const tmp = path.join(path.dirname(real), `.${path.basename(real)}.${process.pid}.${Date.now()}.tmp`);
  const fh = await fs.promises.open(tmp, 'wx');
  try {
    await fh.writeFile(content, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.promises.rename(tmp, real);
  } catch (e) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw e;
  }
}

// Guarda una imagen pegada en la carpeta «imagenes» junto al documento, con nombre aammdd_hhmm.png
// (los dos puntos no son válidos en nombres de Windows). Nunca sobrescribe: si el nombre existe añade _2, _3...
// Si «imagenes» fuera un enlace o junction hacia fuera de la carpeta del documento, se rechaza.
async function savePastedImage(docPath, png, now = new Date()) {
  const docDir = path.dirname(await realPath(docPath));
  const dir = path.join(docDir, 'imagenes');
  await fs.promises.mkdir(dir, { recursive: true });
  if (!within(key(await realPath(dir)), key(docDir))) {
    throw new Error('La carpeta «imagenes» apunta fuera de la carpeta del documento.');
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${p2(now.getFullYear() % 100)}${p2(now.getMonth() + 1)}${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;
  for (let n = 1; n < 100; n++) {
    const name = `${stamp}${n === 1 ? '' : '_' + n}.png`;
    try {
      await fs.promises.writeFile(path.join(dir, name), png, { flag: 'wx' });
      return { name, relative: 'imagenes/' + name, path: path.join(dir, name) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Demasiadas imágenes con el mismo nombre en el mismo minuto.');
}

const IMG_RE = /\.(png|jpe?g|gif|bmp|webp|svg|ico)$/i;
const DENIED = 'Acceso no autorizado a ese fichero.';

// Ruta real de una imagen que un documento enseña, a partir de lo escrito en su vínculo: file://, ruta absoluta o
// relativa al documento. Siempre exige que el documento esté autorizado (`isAuthorized`), sea cual sea la forma
// de la ruta. Solo imágenes locales: las remotas no pasan por aquí.
async function resolveImagePath(docPath, src, isAuthorized) {
  if (typeof src !== 'string' || !src || /^(https?|data):/i.test(src)) throw new Error('Solo se pueden usar imágenes guardadas en este equipo.');
  if (!(await isAuthorized(docPath))) throw new Error(DENIED);
  let p;
  if (/^file:/i.test(src)) p = require('url').fileURLToPath(src);
  else if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('\\\\')) p = src;
  else {
    let rel = src;
    try { rel = decodeURI(src); } catch { /* se usa tal cual */ }
    p = path.resolve(path.dirname(docPath), rel);
  }
  if (!IMG_RE.test(p) || !(await fs.promises.stat(p)).isFile()) throw new Error('No se encontró el fichero de imagen.');
  return p;
}

const MAX_ROOTS = 20;

// Carpetas y ficheros autorizados. Las carpetas elegidas se recuerdan entre sesiones (el panel reabre la última).
function createAccess({ storeFile = null } = {}) {
  const files = new Set();
  let roots = [];
  if (storeFile) {
    try {
      const v = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      if (Array.isArray(v)) roots = v.filter((x) => typeof x === 'string').slice(0, MAX_ROOTS);
    } catch {
      /* primera vez o fichero ilegible: sin carpetas recordadas */
    }
  }
  const save = () => {
    if (!storeFile) return;
    try {
      fs.writeFileSync(storeFile, JSON.stringify(roots));
    } catch {
      /* sin persistencia: solo valen las carpetas de esta sesión */
    }
  };

  return {
    async allowFile(p) {
      try {
        files.add(key(await realPath(p)));
      } catch {
        /* ruta inválida: no se autoriza */
      }
    },
    async allowRoot(p) {
      try {
        const real = await realPath(p);
        roots = [real, ...roots.filter((r) => key(r) !== key(real))].slice(0, MAX_ROOTS);
        save();
      } catch {
        /* ruta inválida: no se autoriza */
      }
    },
    async fileAllowed(p) {
      try {
        return files.has(key(await realPath(p)));
      } catch {
        return false;
      }
    },
    async rootAllowed(p) {
      try {
        const k = key(await realPath(p));
        return roots.some((r) => key(r) === k);
      } catch {
        return false;
      }
    },
  };
}

module.exports = { MD_RE, DENIED, key, within, realPath, writeAtomic, savePastedImage, resolveImagePath, createAccess };
