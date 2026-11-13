// Carpeta de los dibujos nuevos y creación segura de sus ficheros (guardado automático).
// El renderer solo pide «crea este dibujo»: la carpeta la decide y la recuerda el proceso principal.
const fs = require('fs');
const path = require('path');

const EXT = '.excalidraw.md';
const MAX_INTENTOS = 100;
const MAX_BIBLIOTECA = 20 * 1024 * 1024; // la biblioteca de formas no debería acercarse a esto

// Nombre válido en Windows: solo el último tramo, sin caracteres prohibidos y con la extensión del dibujo.
function nombreSeguro(nombre) {
  const limpio = path.win32
    .basename(String(nombre || ''))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\.excalidraw\.md$/i, '')
    .replace(/\.md$/i, '')
    .replace(/[. ]+$/, '')
    .trim();
  return (limpio || 'Dibujo') + EXT;
}

// Firma completa de un PNG (8 bytes): evita aceptar como imagen cualquier cosa que solo empiece igual.
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const esPng = (buf) => Buffer.isBuffer(buf) && buf.length >= FIRMA_PNG.length && buf.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG);

function createDibujos({ settingsFile, defaultDir, libraryFile }) {
  async function leerAjustes() {
    try {
      return JSON.parse(await fs.promises.readFile(settingsFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  async function esCarpeta(p) {
    try {
      return typeof p === 'string' && !!p && (await fs.promises.stat(p)).isDirectory();
    } catch {
      return false;
    }
  }

  // Carpeta elegida por el usuario o, si no hay o ya no existe, la de Descargas.
  async function info() {
    const { folder } = await leerAjustes();
    const dir = (await esCarpeta(folder)) ? folder : defaultDir;
    const isDefault = path.resolve(dir).toLowerCase() === path.resolve(defaultDir).toLowerCase();
    return { folder: dir, isDefault, name: isDefault ? 'Descargas' : path.basename(dir) || dir };
  }

  async function setFolder(dir) {
    if (!(await esCarpeta(dir))) throw new Error('La carpeta elegida no existe.');
    await fs.promises.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.promises.writeFile(settingsFile, JSON.stringify({ folder: dir }), 'utf8');
  }

  // Crea el fichero sin sobrescribir nunca: si el nombre existe añade _2, _3…
  async function createNew(nombre, contenido) {
    const { folder, isDefault, name } = await info();
    await fs.promises.mkdir(folder, { recursive: true });
    const base = nombreSeguro(nombre).slice(0, -EXT.length);
    for (let n = 1; n < MAX_INTENTOS; n++) {
      const file = path.join(folder, `${base}${n === 1 ? '' : '_' + n}${EXT}`);
      try {
        await fs.promises.writeFile(file, String(contenido), { encoding: 'utf8', flag: 'wx' });
      } catch (e) {
        if (e.code === 'EEXIST') continue;
        throw e;
      }
      return { path: file, mtimeMs: (await fs.promises.stat(file)).mtimeMs, folder, isDefault, folderName: name };
    }
    throw new Error('Demasiados dibujos con el mismo nombre en esa carpeta.');
  }

  // Biblioteca de formas de Excalidraw: una lista que se guarda tal cual y se devuelve al abrir un dibujo.
  async function leerBiblioteca() {
    try {
      const v = JSON.parse(await fs.promises.readFile(libraryFile, 'utf8'));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  // Escritura atómica: un corte a mitad no deja la biblioteca truncada.
  async function guardarBiblioteca(items) {
    if (!Array.isArray(items)) throw new Error('La biblioteca no es válida.');
    const json = JSON.stringify(items);
    if (json.length > MAX_BIBLIOTECA) throw new Error('La biblioteca es demasiado grande.');
    await fs.promises.mkdir(path.dirname(libraryFile), { recursive: true });
    const tmp = `${libraryFile}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, json, 'utf8');
    await fs.promises.rename(tmp, libraryFile);
  }

  return { info, setFolder, createNew, leerBiblioteca, guardarBiblioteca };
}

module.exports = { createDibujos, nombreSeguro, esPng, EXT };
