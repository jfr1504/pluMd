// Operaciones de ficheros del panel de carpetas.
// Reglas de seguridad:
//  - Solo se opera dentro de la carpeta raíz que el usuario eligió, comparando la ruta REAL: un enlace
//    simbólico o junction que salga de la raíz se trata como fuera de ella.
//  - Los documentos son de texto (.md, .markdown, .txt); nunca se renombra una carpeta. Una carpeta solo se crea
//    (un nivel) o se envía a la Papelera, y solo si está en un disco fijo y no guarda nada que el panel no
//    muestre (otros tipos de fichero, ocultos, enlaces). Nunca la abierta en el panel ni un enlace.
//  - Crear y copiar nunca sobrescriben nada.
//  - Borrar envía a la Papelera de reciclaje. En unidades de red no hay Papelera y el borrado es definitivo:
//    solo se hace si el llamador lo confirma de forma expresa (permanent). Si no se puede determinar el tipo
//    de unidad, se trata como red. La comprobación usa la ruta real, así que una junction al NAS cuenta como red.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { MD_RE, key: norm, within, realPath } = require('./acceso');

const SKIP_DIRS = new Set(['node_modules', '$recycle.bin', 'system volume information']);
const INVALID = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FIXED_DRIVE = 3; // tipos de unidad de Windows: 3 = disco fijo, 4 = red
const NETWORK_DRIVE = 4;
const MAX_SCAN = 20000; // entradas que se revisan como máximo antes de borrar una carpeta

// El panel no muestra los nombres que empiezan por punto ni estas carpetas.
const isHidden = (name) => name.startsWith('.') || SKIP_DIRS.has(name.toLowerCase());
const fail = (error) => ({ ok: false, error });

const msg = {
  outside: 'La ruta está fuera de la carpeta abierta.',
  notDoc: 'Solo se pueden gestionar documentos .md, .markdown o .txt.',
  exists: 'Ya existe un documento con ese nombre.',
  invalidName: 'El nombre no es válido: no puede estar vacío ni llevar \\ / : * ? " < > |',
  network: 'El documento está en una unidad de red: no hay Papelera y el borrado es definitivo.',
  existsDir: 'Ya existe una carpeta o un documento con ese nombre.',
  invalidDirName: 'El nombre no es válido: no puede estar vacío, empezar por un punto, acabar en punto o espacio, ni llevar \\ / : * ? " < > |',
  isRoot: 'No se puede borrar la carpeta abierta en el panel.',
  linkDir: 'Es un enlace o una unión a otra carpeta: bórrala desde el Explorador de Windows.',
  notFixed: 'Solo se pueden borrar carpetas en discos fijos. Bórrala desde el Explorador de Windows.',
  hiddenFiles: (n) => `Esta carpeta contiene ${n} ${n === 1 ? 'fichero' : 'ficheros'} que PluMd no muestra (otros tipos, ocultos o enlaces). Bórrala desde el Explorador de Windows.`,
  tooBig: 'La carpeta tiene demasiados elementos para comprobarla. Bórrala desde el Explorador de Windows.',
  notDir: 'No es una carpeta.',
};

// Tipo de unidad de Windows (3 = disco fijo, 4 = red). Devuelve null si no se puede saber.
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

// Cuenta los ficheros de `dir` (a cualquier profundidad) que el panel no muestra: todo lo que no sea un documento
// de texto visible, es decir otros tipos, ocultos y enlaces. Falla si hay demasiadas entradas para revisarlas.
async function countHiddenFiles(dir, budget = { left: MAX_SCAN }, shown = true) {
  let count = 0;
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (--budget.left < 0) throw new Error(msg.tooBig);
    const visible = shown && !isHidden(e.name);
    if (e.isDirectory()) count += await countHiddenFiles(path.join(dir, e.name), budget, visible);
    else if (!(visible && e.isFile() && MD_RE.test(e.name))) count++;
  }
  return count;
}

function createFsOps({ trash, driveType = windowsDriveType, unlink = (p) => fs.promises.unlink(p) } = {}) {
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

  // Tipo de unidad de la ruta: una ruta UNC es de red; sin letra de unidad reconocible o sin poder saberlo, null.
  async function driveTypeOf(p) {
    const s = String(p || '');
    if (/^\\\\/.test(s) || /^\/\//.test(s)) return NETWORK_DRIVE;
    const m = /^([a-zA-Z]):/.exec(path.resolve(s));
    if (!m) return null;
    const letter = m[1].toLowerCase();
    if (!driveCache.has(letter)) driveCache.set(letter, driveType(letter));
    return driveCache.get(letter);
  }

  // En caso de duda (tipo desconocido) se trata como red: es lo prudente para el borrado definitivo.
  async function isNetworkPath(p) {
    const t = await driveTypeOf(p);
    return t === null || t === NETWORK_DRIVE;
  }

  // Disco fijo: ni extraíble, ni de red, ni de tipo desconocido.
  const isFixedDrive = async (p) => (await driveTypeOf(p)) === FIXED_DRIVE;

  function cleanName(raw, keepExt) {
    let name = String(raw || '').trim();
    if (!name || name === '.' || name === '..' || INVALID.test(name) || RESERVED.test(name) || name.length > 200) return null;
    if (!MD_RE.test(name)) name += keepExt || '.md';
    return name;
  }

  // Nombre de carpeta: sin extensión añadida, sin puntos ni espacios finales (Windows los descarta) y sin
  // empezar por punto ni llamarse como las carpetas que el panel oculta (no se vería después de crearla).
  function cleanDirName(raw) {
    const name = String(raw || '').trim();
    if (!name || name === '.' || name === '..' || INVALID.test(name) || RESERVED.test(name) || name.length > 200) return null;
    if (isHidden(name) || name.endsWith('.')) return null;
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

  // Reglas para borrar una carpeta: null si se puede, o { ok: false, error } con el motivo. Nunca la carpeta
  // abierta en el panel ni un enlace; solo en un disco fijo (en red o extraíbles no se garantiza la Papelera);
  // y solo si no guarda nada que el panel no muestre, para no mandar a la Papelera ficheros que el usuario no ve.
  async function dirBlocker(p) {
    if (!(await contains(p))) return fail(msg.outside);
    try {
      const real = await realPath(p);
      if (norm(p) === root.key || norm(real) === root.realKey) return fail(msg.isRoot);
      if ((await fs.promises.lstat(p)).isSymbolicLink()) return fail(msg.linkDir);
      if (!(await fs.promises.stat(real)).isDirectory()) return fail(msg.notDir);
      if (!(await isFixedDrive(real))) return fail(msg.notFixed);
      const hidden = await countHiddenFiles(real);
      return hidden ? fail(msg.hiddenFiles(hidden)) : null;
    } catch (e) {
      return fail(e.message);
    }
  }

  return {
    isNetworkPath,
    isFixedDrive,
    contains,
    getRoot: () => root && root.path,

    async setRoot(dir) {
      const st = await fs.promises.stat(dir);
      if (!st.isDirectory()) throw new Error('No es una carpeta.');
      const p = path.resolve(dir);
      const real = await realPath(p);
      root = { path: p, key: norm(p), realKey: norm(real) };
      return { path: p, network: await isNetworkPath(real), fixed: await isFixedDrive(real) };
    },

    async listDir(dir) {
      if (!(await contains(dir))) throw new Error(msg.outside);
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const out = [];
      for (const e of entries) {
        if (isHidden(e.name)) continue;
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

    // Crea una carpeta (un solo nivel) dentro de la carpeta abierta. Nunca sobrescribe.
    async createDir(dir, rawName) {
      if (!(await contains(dir))) return { ok: false, error: msg.outside };
      const name = cleanDirName(rawName);
      if (!name) return { ok: false, error: msg.invalidDirName };
      const target = path.join(dir, name);
      try {
        await fs.promises.mkdir(target);
        return { ok: true, path: target };
      } catch (e) {
        return { ok: false, error: e.code === 'EEXIST' ? msg.existsDir : e.message };
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
      if (target.toLowerCase() !== p.toLowerCase() && (await exists(target))) return { ok: false, error: msg.exists };
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

    // ¿Se puede borrar esta carpeta? { ok: true }, o { ok: false, error } con el motivo. Lo usa la interfaz
    // para avisar antes de pedir la confirmación; removeDir vuelve a comprobarlo.
    async canRemoveDir(p) {
      return (await dirBlocker(p)) || { ok: true };
    },

    // Envía una carpeta a la Papelera, para poder recuperarla, si dirBlocker no lo impide.
    async removeDir(p) {
      const blocked = await dirBlocker(p);
      if (blocked) return blocked;
      try {
        await trash(p);
        return { ok: true };
      } catch (e) {
        return fail(e.message);
      }
    },
  };
}

module.exports = { createFsOps, MD_RE, msg };
