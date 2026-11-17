// Gestión de plugins en el proceso principal: descubrir, validar, servir sus ficheros y recordar su estado.
// El código de los plugins se ejecuta en la ventana (ver src/renderer/plugins/). Aquí solo se leen
// carpetas de plugins y se guardan datos en la carpeta de datos de la aplicación.
//
// Seguridad: un plugin activado tiene los mismos permisos que la propia aplicación. Por eso los plugins
// empiezan desactivados, hay un modo seguro (--sin-plugins, o automático tras un bloqueo al cargarlos)
// y un plugin que falla varias veces seguidas se desactiva solo. Esta capa no borra nada: desinstalar un
// plugin es borrar su carpeta a mano, porque la carpeta de datos puede estar en una unidad de red.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const API_VERSION = 1;
const SCHEME = 'plumd-plugin';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_FAILURES = 3;
const MAX_DATA_BYTES = 1024 * 1024;

// Debe llamarse antes de que la aplicación esté lista.
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

const isInside = (child, parent) => {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  const normalizedChild = process.platform === 'win32' ? c.toLowerCase() : c;
  const normalizedParent = process.platform === 'win32' ? p.toLowerCase() : p;
  return normalizedChild === normalizedParent || normalizedChild.startsWith(normalizedParent + path.sep);
};

// Devuelve un mensaje de error en español o null si el manifiesto es válido.
function validateManifest(m, dir) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'manifest.json no es un objeto JSON.';
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return 'El "id" debe tener solo minúsculas, números y guiones (máximo 41 caracteres).';
  if (typeof m.name !== 'string' || !m.name.trim()) return 'Falta el "name".';
  if (typeof m.version !== 'string' || !m.version.trim()) return 'Falta la "version".';
  if (!Number.isInteger(m.apiVersion)) return 'Falta "apiVersion" (un número entero).';
  if (m.apiVersion > API_VERSION) return `Necesita la API ${m.apiVersion} y esta versión de PluMd solo entiende la ${API_VERSION}. Actualiza PluMd.`;
  if (m.apiVersion < 1) return '"apiVersion" no es válida.';
  const inPlugin = (rel) => typeof rel === 'string' && rel && !path.isAbsolute(rel) && isInside(path.join(dir, rel), dir);
  if (m.main != null) {
    if (!inPlugin(m.main) || !/\.m?js$/i.test(m.main)) return '"main" debe ser un fichero .js o .mjs dentro de la carpeta del plugin.';
    if (!fs.existsSync(path.join(dir, m.main))) return `No existe el fichero "main" (${m.main}).`;
  }
  if (m.permissions != null && (!Array.isArray(m.permissions) || m.permissions.some((p) => typeof p !== 'string'))) return '"permissions" debe ser una lista de textos.';
  if (m.activationEvents != null && (!Array.isArray(m.activationEvents) || m.activationEvents.some((p) => typeof p !== 'string'))) return '"activationEvents" debe ser una lista de textos.';
  const c = m.contributes;
  if (c != null) {
    if (typeof c !== 'object' || Array.isArray(c)) return '"contributes" debe ser un objeto.';
    for (const s of c.skins || []) {
      if (!s || typeof s.id !== 'string' || !ID_RE.test(s.id) || typeof s.name !== 'string') return 'Cada skin necesita "id" (minúsculas, números y guiones) y "name".';
      if (s.css != null && (!inPlugin(s.css) || !fs.existsSync(path.join(dir, s.css)))) return `El CSS del skin "${s.id}" no existe dentro de la carpeta del plugin.`;
      if (s.css == null && s.vars == null && s.varsDark == null) return `El skin "${s.id}" necesita "css" o "vars".`;
    }
    for (const cmd of c.commands || []) {
      if (!cmd || typeof cmd.id !== 'string' || typeof cmd.title !== 'string') return 'Cada comando necesita "id" y "title".';
    }
    if (c.settings != null && (typeof c.settings !== 'object' || Array.isArray(c.settings))) return '"settings" debe ser un objeto.';
  }
  return null;
}

function createPlugins({ userDataDir, argv = [] }) {
  const dir = path.join(userDataDir, 'plugins');
  const dataDir = path.join(userDataDir, 'plugin-data');
  const statePath = path.join(userDataDir, 'plugins-state.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const devDirs = argv.filter((a) => a.startsWith('--plugin-dev=')).map((a) => a.slice('--plugin-dev='.length).replace(/^"|"$/g, ''));
  const flagSafe = argv.includes('--sin-plugins');

  let state = { enabled: [], consented: {}, failures: {}, loading: false };
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) };
  } catch {
    /* primera ejecución o fichero dañado: se parte de cero */
  }
  // Si la última vez se quedó marcado "cargando", la carga de plugins bloqueó la ventana: modo seguro.
  const recovered = state.loading === true;
  const safeMode = flagSafe || recovered;
  if (recovered) {
    state.loading = false;
    save();
  }

  function save() {
    try {
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch {
      /* sin permisos de escritura: el estado vale solo para esta sesión */
    }
  }

  let installed = new Map(); // id -> { id, dir, manifest, error, dev }

  function scan() {
    const found = new Map();
    const add = (pdir, dev) => {
      const mf = path.join(pdir, 'manifest.json');
      let manifest = null;
      let error = null;
      try {
        manifest = JSON.parse(fs.readFileSync(mf, 'utf8').replace(/^﻿/, ''));
        error = validateManifest(manifest, pdir);
      } catch (e) {
        error = fs.existsSync(mf) ? `manifest.json no es un JSON válido: ${e.message}` : 'No hay manifest.json en la carpeta.';
      }
      const id = manifest && typeof manifest.id === 'string' && ID_RE.test(manifest.id) ? manifest.id : `invalido-${path.basename(pdir).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)}`;
      if (found.has(id)) {
        found.set(`${id}~${found.size}`, { id: `${id}~${found.size}`, dir: pdir, manifest, error: `Hay otro plugin con el mismo id ("${id}").`, dev });
        return;
      }
      found.set(id, { id, dir: pdir, manifest, error, dev });
    };
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !e.name.startsWith('.')) add(path.join(dir, e.name), false);
      }
    } catch {
      /* carpeta de plugins ilegible: queda la lista vacía */
    }
    for (const d of devDirs) if (fs.existsSync(d)) add(d, true);
    installed = found;
    return found;
  }

  const isEnabled = (id) => state.enabled.includes(id);

  function list() {
    scan();
    return {
      dir,
      apiVersion: API_VERSION,
      safeMode,
      recovered,
      maxFailures: MAX_FAILURES,
      plugins: [...installed.values()].map((p) => ({
        id: p.id,
        dir: p.dir,
        dev: p.dev,
        error: p.error,
        manifest: p.manifest,
        enabled: !p.error && isEnabled(p.id),
        // Los plugins de desarrollo (--plugin-dev) los pone el propio desarrollador: se activan solos.
        autoEnabled: p.dev && !p.error,
        consentedVersion: state.consented[p.id] || null,
        failures: state.failures[p.id] || 0,
      })),
    };
  }

  function setEnabled(id, on, consentVersion) {
    if (!installed.has(id)) scan();
    if (!installed.has(id)) return { ok: false, error: 'Plugin no encontrado.' };
    const set = new Set(state.enabled);
    if (on) {
      set.add(id);
      if (consentVersion) state.consented[id] = consentVersion;
      state.failures[id] = 0;
    } else set.delete(id);
    state.enabled = [...set];
    save();
    return { ok: true };
  }

  function recordFailure(id) {
    state.failures[id] = (state.failures[id] || 0) + 1;
    const disabled = state.failures[id] >= MAX_FAILURES;
    if (disabled) state.enabled = state.enabled.filter((x) => x !== id);
    save();
    return { failures: state.failures[id], disabled };
  }

  function markLoading(v) {
    state.loading = !!v;
    save();
  }

  // Datos propios de cada plugin: un JSON por plugin en la carpeta de datos de la aplicación.
  const dataFile = (id) => path.join(dataDir, `${id}.json`);
  function dataGet(id) {
    if (!ID_RE.test(id)) return {};
    try {
      return JSON.parse(fs.readFileSync(dataFile(id), 'utf8'));
    } catch {
      return {};
    }
  }
  function dataSet(id, obj) {
    if (!ID_RE.test(id)) return { ok: false, error: 'id no válido' };
    const text = JSON.stringify(obj ?? {});
    if (Buffer.byteLength(text) > MAX_DATA_BYTES) return { ok: false, error: 'Los datos del plugin superan 1 MB.' };
    try {
      fs.writeFileSync(dataFile(id), text);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Instala copiando una carpeta de plugin a la carpeta de plugins. Nunca sobrescribe ni borra.
  async function install(srcDir) {
    const mf = path.join(srcDir, 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(mf, 'utf8').replace(/^﻿/, ''));
    } catch {
      return { ok: false, error: 'La carpeta no tiene un manifest.json válido.' };
    }
    const error = validateManifest(manifest, srcDir);
    if (error) return { ok: false, error };
    const dest = path.join(dir, manifest.id);
    if (fs.existsSync(dest)) return { ok: false, error: `Ya hay un plugin instalado con el id "${manifest.id}". Para actualizarlo, sustituye su carpeta a mano.` };
    try {
      await fs.promises.cp(srcDir, dest, {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: (s) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(s),
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    scan();
    return { ok: true, id: manifest.id };
  }

  // Sirve los ficheros de un plugin por plumd-plugin://<id>/<ruta>. Nunca sale de la carpeta del plugin.
  function installProtocol(protocol, net) {
    protocol.handle(SCHEME, async (request) => {
      try {
        const url = new URL(request.url);
        const p = installed.get(url.hostname) || (scan(), installed.get(url.hostname));
        if (!p || p.error) return new Response('No encontrado', { status: 404 });
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const file = path.resolve(p.dir, rel);
        if (!isInside(file, p.dir)) return new Response('Prohibido', { status: 403 });
        const res = await net.fetch(pathToFileURL(file).toString());
        const headers = new Headers(res.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'no-store');
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response('No encontrado', { status: 404 });
      }
    });
  }

  return {
    dir,
    list,
    setEnabled,
    recordFailure,
    markLoading,
    dataGet,
    dataSet,
    install,
    installProtocol,
    isSafeMode: () => safeMode,
  };
}

module.exports = { createPlugins, registerScheme, validateManifest, API_VERSION, SCHEME, ID_RE };
