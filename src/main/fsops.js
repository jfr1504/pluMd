// Operaciones de ficheros del panel de carpetas.
// Reglas de seguridad:
//  - Solo se opera dentro de la carpeta raíz que el usuario eligió, comparando la ruta REAL: un enlace
//    simbólico o junction que salga de la raíz se trata como fuera de ella.
//  - Solo documentos de texto (.md, .markdown, .txt); nunca se renombra ni se borra una carpeta.
//  - Crear y copiar nunca sobrescriben nada.
//  - Borrar envía a la Papelera de reciclaje. En unidades de red no hay Papelera y el borrado es definitivo:
//    solo se hace si el llamador lo confirma de forma expresa (permanent). Si no se puede determinar el tipo
//    de unidad, se trata como red. La comprobación usa la ruta real, así que una junction al NAS cuenta como red.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { MD_RE, key: norm, within, realPath } = require('./acceso');

const SKIP_DIRS = new Set(['node_modules', '$recycle.bin', 'system volume information']);
const INVALID_WINDOWS = /[<>:"/\\|?*\x00-\x1f]/;
const INVALID_POSIX = /[/\x00-\x1f]/;
const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const msg = {
  outside: 'La ruta está fuera de la carpeta abierta.',
  notDoc: 'Solo se pueden gestionar documentos .md, .markdown o .txt.',
  exists: 'Ya existe un documento con ese nombre.',
  invalidName: 'El nombre no es válido: no puede estar vacío ni llevar \\ / : * ? " < > |',
  network: 'El documento está en una unidad de red: no hay Papelera y el borrado es definitivo.',
};

// Tipo de unidad de Windows (4 = unidad de red). Devuelve null si no se puede saber.
function windowsDriveType(letter) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letter.toUpperCase()}:'").DriveType`],
      { timeout: 8000, windowsHide: true },
      (err, out) => {
        const n = parseInt(String(out || '').trim(), 10);
        resolve(err || Number.isNaN(n) ? null : n);
      },
    );
  });
}

function createFsOps({ trash, driveType = windowsDriveType, unlink = (p) => fs.promises.unlink(p), platform = process.platform } = {}) {
  let root = null;
  const driveCache = new Map();

  // ¿La ruta está dentro de la carpeta abierta, tanto en texto como en su destino real?
  const contains = async (p) => {
    if (!root || !p || typeof p !== 'string') return false;
    if (!within(norm(p), root.key)) return false;
    try {
      return within(norm(await realPath(p)), root.realKey);
    } catch {
      return false;
    }
  };

  async function isNetworkPath(p) {
    if (platform !== 'win32') return false;
    const s = String(p || '');
    if (/^\\\\/.test(s) || /^\/\//.test(s)) return true; // ruta UNC
    const m = /^([a-zA-Z]):/.exec(path.resolve(s));
    if (!m) return true; // sin letra de unidad reconocible: prudencia
    const letter = m[1].toLowerCase();
    if (!driveCache.has(letter)) driveCache.set(letter, driveType(letter));
    const t = await driveCache.get(letter);
    return t === null || t === 4;
  }

  function cleanName(raw, keepExt) {
    let name = String(raw || '').trim();
    const invalid = platform === 'win32' ? INVALID_WINDOWS : INVALID_POSIX;
    const reserved = platform === 'win32' && RESERVED_WINDOWS.test(name);
    if (!name || name === '.' || name === '..' || invalid.test(name) || reserved || name.length > 200) return null;
    if (!MD_RE.test(name)) name += keepExt || '.md';
    return name;
  }

  async function exists(p) {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }

  return {
    isNetworkPath,
    contains,
    getRoot: () => root && root.path,

    async setRoot(dir) {
      const st = await fs.promises.stat(dir);
      if (!st.isDirectory()) throw new Error('No es una carpeta.');
      const p = path.resolve(dir);
      const real = await realPath(p);
      root = { path: p, key: norm(p), realKey: norm(real) };
      return { path: p, network: await isNetworkPath(real) };
    },

    async listDir(dir) {
      if (!(await contains(dir))) throw new Error(msg.outside);
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const out = [];
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue;
        const full = path.join(dir, e.name);
        let isDir = e.isDirectory();
        let isFile = e.isFile();
        if (e.isSymbolicLink()) {
          try {
            // Un enlace o junction que apunta fuera de la carpeta abierta no se muestra.
            if (!(await contains(full))) continue;
            const st = await fs.promises.stat(full);
            isDir = st.isDirectory();
            isFile = st.isFile();
          } catch {
            continue;
          }
        }
        if (isDir) out.push({ name: e.name, path: full, dir: true });
        else if (isFile && MD_RE.test(e.name)) out.push({ name: e.name, path: full, dir: false });
      }
      const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
      out.sort((a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1));
      return out;
    },

    // Crea un documento vacío. Nunca sobrescribe.
    async create(dir, rawName) {
      if (!(await contains(dir))) return { ok: false, error: msg.outside };
      const name = cleanName(rawName);
      if (!name) return { ok: false, error: msg.invalidName };
      const target = path.join(dir, name);
      try {
        await fs.promises.writeFile(target, '', { flag: 'wx' });
        return { ok: true, path: target };
      } catch (e) {
        return { ok: false, error: e.code === 'EEXIST' ? msg.exists : e.message };
      }
    },

    // Cambia el nombre dentro de la misma carpeta. Nunca sobrescribe otro documento.
    async rename(p, rawName) {
      if (!(await contains(p))) return { ok: false, error: msg.outside };
      if (!MD_RE.test(p)) return { ok: false, error: msg.notDoc };
      const name = cleanName(rawName, path.extname(p));
      if (!name) return { ok: false, error: msg.invalidName };
      const target = path.join(path.dirname(p), name);
      if (target === p) return { ok: true, path: p };
      // Un cambio solo de mayúsculas es el mismo fichero en Windows: se permite.
      if (norm(target) !== norm(p) && (await exists(target))) return { ok: false, error: msg.exists };
      try {
        await fs.promises.rename(p, target);
        return { ok: true, path: target };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // Copia un documento a una carpeta. Si el nombre ya existe, añade " - copia". Nunca sobrescribe.
    async copy(src, destDir) {
      if (!(await contains(src)) || !(await contains(destDir))) return { ok: false, error: msg.outside };
      if (!MD_RE.test(src)) return { ok: false, error: msg.notDoc };
      try {
        if (!(await fs.promises.stat(src)).isFile()) return { ok: false, error: msg.notDoc };
        const ext = path.extname(src);
        const base = path.basename(src, ext);
        for (let n = 0; n < 200; n++) {
          const name = n === 0 ? base + ext : `${base} - copia${n > 1 ? ' ' + n : ''}${ext}`;
          const target = path.join(destDir, name);
          try {
            await fs.promises.copyFile(src, target, fs.constants.COPYFILE_EXCL);
            return { ok: true, path: target };
          } catch (e) {
            if (e.code !== 'EEXIST') throw e;
          }
        }
        return { ok: false, error: msg.exists };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // Borra un documento (nunca carpetas). Local: a la Papelera. En red: definitivo, y solo con permanent=true;
    // sin él devuelve needsPermanent para que la interfaz pida una confirmación expresa.
    async remove(p, { permanent = false } = {}) {
      if (!(await contains(p))) return { ok: false, error: msg.outside };
      if (!MD_RE.test(p)) return { ok: false, error: msg.notDoc };
      try {
        const real = await realPath(p);
        const net = await isNetworkPath(real);
        if (net && !permanent) return { ok: false, error: msg.network, needsPermanent: true };
        if (!(await fs.promises.stat(real)).isFile()) return { ok: false, error: msg.notDoc };
        if (net) await unlink(real);
        else await trash(p);
        return { ok: true, permanent: net };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
}

module.exports = { createFsOps, MD_RE, msg };
