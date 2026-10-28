const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { realPath, writeAtomic, savePastedImage, resolveImagePath, createAccess, within, key, DENIED } = require('../src/main/acceso');
const { pathToFileURL } = require('url');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'plumd-test-'));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });

test('within distingue carpeta propia de otra con el mismo prefijo', () => {
  assert.equal(within(key('C:\\a\\b'), key('C:\\a')), true);
  assert.equal(within(key('C:\\a'), key('C:\\a')), true);
  assert.equal(within(key('C:\\ab'), key('C:\\a')), false);
  assert.equal(within(key('C:\\a\\b'), key('C:\\')), true);
});

test('realPath resuelve una junction y un fichero que aún no existe', async () => {
  const d = tmp();
  try {
    fs.mkdirSync(path.join(d, 'real'));
    fs.symlinkSync(path.join(d, 'real'), path.join(d, 'enlace'), 'junction');
    const r = await realPath(path.join(d, 'enlace', 'nuevo.md'));
    assert.equal(key(r), key(path.join(fs.realpathSync.native(d), 'real', 'nuevo.md')));
  } finally {
    rm(d);
  }
});

test('realPath rechaza un enlace roto', async () => {
  const d = tmp();
  try {
    fs.mkdirSync(path.join(d, 'destino'));
    fs.symlinkSync(path.join(d, 'destino'), path.join(d, 'roto'), 'junction');
    fs.rmdirSync(path.join(d, 'destino'));
    await assert.rejects(() => realPath(path.join(d, 'roto')));
  } finally {
    rm(d);
  }
});

test('writeAtomic escribe, sustituye y no deja temporales', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'a.md');
    await writeAtomic(f, '# uno\r\ncon tildes: áéí\r\n');
    assert.equal(fs.readFileSync(f, 'utf8'), '# uno\r\ncon tildes: áéí\r\n');
    await writeAtomic(f, 'dos');
    assert.equal(fs.readFileSync(f, 'utf8'), 'dos');
    assert.deepEqual(fs.readdirSync(d), ['a.md']);
  } finally {
    rm(d);
  }
});

test('writeAtomic con carpeta inexistente falla sin crear nada', async () => {
  const d = tmp();
  try {
    await assert.rejects(() => writeAtomic(path.join(d, 'no', 'existe', 'a.md'), 'x'));
    assert.deepEqual(fs.readdirSync(d), []);
  } finally {
    rm(d);
  }
});

test('un fichero solo se autoriza tras allowFile, y por su ruta real', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'a.md');
    fs.writeFileSync(f, 'x');
    fs.symlinkSync(d, path.join(d, 'j'), 'junction');
    const acc = createAccess();
    assert.equal(await acc.fileAllowed(f), false);
    await acc.allowFile(f);
    assert.equal(await acc.fileAllowed(f), true);
    assert.equal(await acc.fileAllowed(path.join(d, 'j', 'a.md')), true); // mismo fichero
    assert.equal(await acc.fileAllowed(path.join(d, 'otro.md')), false);
  } finally {
    rm(d);
  }
});

test('las carpetas autorizadas se recuerdan entre sesiones', async () => {
  const d = tmp();
  try {
    const store = path.join(d, 'carpetas.json');
    const carpeta = path.join(d, 'docs');
    fs.mkdirSync(carpeta);
    const a = createAccess({ storeFile: store });
    assert.equal(await a.rootAllowed(carpeta), false);
    await a.allowRoot(carpeta);
    const b = createAccess({ storeFile: store });
    assert.equal(await b.rootAllowed(carpeta), true);
    assert.equal(await b.rootAllowed(d), false);
  } finally {
    rm(d);
  }
});

test('savePastedImage crea «imagenes», nombra aammdd_hhmm y no sobrescribe', async () => {
  const d = tmp();
  try {
    const doc = path.join(d, 'nota.md');
    fs.writeFileSync(doc, '# x');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const hora = new Date(2026, 9, 26, 14, 32, 5); // 26/10/2026 14:32
    const a = await savePastedImage(doc, png, hora);
    assert.equal(a.name, '261026_1432.png');
    assert.equal(a.relative, 'imagenes/261026_1432.png');
    const b = await savePastedImage(doc, Buffer.from([1, 2, 3]), hora);
    assert.equal(b.name, '261026_1432_2.png');
    assert.deepEqual(fs.readFileSync(a.path), png);
    assert.deepEqual(fs.readdirSync(path.join(d, 'imagenes')).sort(), ['261026_1432.png', '261026_1432_2.png']);
  } finally {
    rm(d);
  }
});

test('savePastedImage rechaza una carpeta «imagenes» que sea un enlace hacia fuera', async () => {
  const d = tmp();
  try {
    const doc = path.join(d, 'docs', 'nota.md');
    fs.mkdirSync(path.join(d, 'docs'));
    fs.mkdirSync(path.join(d, 'fuera'));
    fs.writeFileSync(doc, '# x');
    fs.symlinkSync(path.join(d, 'fuera'), path.join(d, 'docs', 'imagenes'), 'junction');
    await assert.rejects(() => savePastedImage(doc, Buffer.from([1])), /fuera de la carpeta/);
    assert.deepEqual(fs.readdirSync(path.join(d, 'fuera')), []);
  } finally {
    rm(d);
  }
});

// Documento con una imagen al lado y otra en una carpeta con espacios; `autorizados` son los documentos permitidos.
function imagenes() {
  const d = tmp();
  const doc = path.join(d, 'nota.md');
  fs.mkdirSync(path.join(d, 'mis fotos'));
  fs.writeFileSync(doc, '# x');
  fs.writeFileSync(path.join(d, 'a.png'), 'png');
  fs.writeFileSync(path.join(d, 'mis fotos', 'b.jpg'), 'jpg');
  fs.writeFileSync(path.join(d, 'script.js'), 'no es una imagen');
  const autorizados = (...docs) => async (f) => docs.includes(f);
  return { d, doc, autorizados };
}

test('resolveImagePath resuelve rutas relativas, absolutas y file:// de un documento autorizado', async () => {
  const t = imagenes();
  try {
    const ok = t.autorizados(t.doc);
    assert.equal(await resolveImagePath(t.doc, 'a.png', ok), path.join(t.d, 'a.png'));
    assert.equal(await resolveImagePath(t.doc, 'mis%20fotos/b.jpg', ok), path.join(t.d, 'mis fotos', 'b.jpg'));
    assert.equal(await resolveImagePath(t.doc, path.join(t.d, 'a.png'), ok), path.join(t.d, 'a.png'));
    assert.equal(await resolveImagePath(t.doc, pathToFileURL(path.join(t.d, 'a.png')).href, ok), path.join(t.d, 'a.png'));
  } finally {
    rm(t.d);
  }
});

test('resolveImagePath exige un documento autorizado también con rutas absolutas y file://', async () => {
  const t = imagenes();
  try {
    const nadie = t.autorizados();
    const abs = path.join(t.d, 'a.png');
    for (const src of ['a.png', abs, pathToFileURL(abs).href]) {
      await assert.rejects(() => resolveImagePath(t.doc, src, nadie), { message: DENIED }, src);
    }
    await assert.rejects(() => resolveImagePath(null, abs, t.autorizados(t.doc)), { message: DENIED }, 'documento sin guardar');
  } finally {
    rm(t.d);
  }
});

test('resolveImagePath solo admite imágenes locales que existan', async () => {
  const t = imagenes();
  try {
    const ok = t.autorizados(t.doc);
    for (const src of ['https://example.com/a.png', 'http://example.com/a.png', 'data:image/png;base64,AAAA', '', 'no-existe.png', 'script.js', 'mis fotos']) {
      await assert.rejects(() => resolveImagePath(t.doc, src, ok), Error, `debería rechazar «${src}»`);
    }
  } finally {
    rm(t.d);
  }
});
