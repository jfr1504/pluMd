const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(require.resolve('../src/renderer/images.js'), 'utf8');
const compiled = { exports: {} };
new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(compiled, compiled.exports);
const { dirname, fileUrl, relativeTo, setBaseDir, resolveImageSrc } = compiled.exports;

test('rutas absolutas Linux conservan la raíz y se convierten en file URLs', () => {
  const previousWindow = global.window;
  global.window = { api: { platform: 'linux' } };
  try {
    assert.equal(dirname('/nota.md'), '/');
    assert.equal(fileUrl('/home/user/plan #1.png'), 'file:///home/user/plan%20%231.png');
    assert.equal(relativeTo('/nota.md', '/imagen.png'), 'imagen.png');
    assert.equal(relativeTo('/home/Docs/nota.md', '/home/docs/imagen.png'), '../docs/imagen.png');
  } finally {
    global.window = previousWindow;
  }
});

test('rutas Windows conservan la comparación insensible a mayúsculas', () => {
  const previousWindow = global.window;
  global.window = { api: { platform: 'win32' } };
  try {
    assert.equal(dirname('C:\\nota.md'), 'C:\\');
    assert.equal(relativeTo('C:\\Docs\\nota.md', 'c:\\docs\\imagen.png'), 'imagen.png');
    assert.equal(relativeTo('C:\\Docs\\nota.md', 'D:\\Imagenes\\imagen.png'), 'D:/Imagenes/imagen.png');
  } finally {
    global.window = previousWindow;
  }
});

for (const [platform, document, expected] of [
  ['linux', '/nota.md', 'file:///imagen%20uno.png'],
  ['win32', 'C:\\nota.md', 'file:///C:/imagen%20uno.png'],
  ['win32', 'C:/nota.md', 'file:///C:/imagen%20uno.png'],
  ['win32', '\\\\servidor\\recurso\\nota.md', 'file://servidor/recurso/imagen%20uno.png'],
]) {
  test(`resolver imagen relativa desde ${document}`, () => {
    const previousWindow = global.window;
    global.window = { api: { platform } };
    try {
      setBaseDir(dirname(document));
      assert.equal(resolveImageSrc('imagen%20uno.png'), expected);
      assert.equal(resolveImageSrc('./imagen%20uno.png'), expected);
    } finally {
      setBaseDir(null);
      global.window = previousWindow;
    }
  });
}

test('relativeTo conserva el nombre de fichero cuando coincide con una carpeta', () => {
  const previousWindow = global.window;
  try {
    for (const platform of ['linux', 'win32']) {
      global.window = { api: { platform } };
      const root = platform === 'win32' ? 'C:' : '';
      assert.equal(relativeTo(`${root}/docs/imagen.png/nota.md`, `${root}/docs/imagen.png`), '../imagen.png');
    }
  } finally {
    global.window = previousWindow;
  }
});

test('Linux conserva barras inversas en directorios, imágenes y vínculos relativos', () => {
  const previousWindow = global.window;
  global.window = { api: { platform: 'linux' } };
  try {
    assert.equal(dirname('/tmp/nota\\uno.md'), '/tmp');
    assert.equal(dirname('/tmp/carpeta\\uno/nota.md'), '/tmp/carpeta\\uno');
    assert.equal(fileUrl('/tmp/foto\\uno.png'), 'file:///tmp/foto%5Cuno.png');
    assert.equal(fileUrl('/tmp/carpeta\\uno/foto.png'), 'file:///tmp/carpeta%5Cuno/foto.png');
    setBaseDir('/tmp/carpeta\\uno');
    assert.equal(resolveImageSrc('foto\\uno.png'), 'file:///tmp/carpeta%5Cuno/foto%5Cuno.png');
    assert.equal(resolveImageSrc('foto%5Cuno.png'), 'file:///tmp/carpeta%5Cuno/foto%5Cuno.png');
    assert.equal(resolveImageSrc('/tmp/foto\\uno.png'), 'file:///tmp/foto%5Cuno.png');
    assert.equal(relativeTo('/tmp/carpeta\\uno/nota.md', '/tmp/carpeta\\uno/foto\\uno.png'), 'foto%5Cuno.png');
    assert.equal(relativeTo('/tmp/carpeta\\uno/nota.md', '/tmp/carpeta/uno/foto.png'), '../carpeta/uno/foto.png');
  } finally {
    setBaseDir(null);
    global.window = previousWindow;
  }
});

test('Windows conserva separadores de imágenes y rutas UNC', () => {
  const previousWindow = global.window;
  global.window = { api: { platform: 'win32' } };
  try {
    assert.equal(fileUrl('C:\\docs\\foto.png'), 'file:///C:/docs/foto.png');
    assert.equal(fileUrl('\\\\server\\share\\foto.png'), 'file://server/share/foto.png');
    setBaseDir('C:\\docs');
    assert.equal(resolveImageSrc('imagenes\\foto.png'), 'file:///C:/docs/imagenes/foto.png');
    assert.equal(relativeTo('\\\\server\\share\\docs\\nota.md', '\\\\server\\share\\foto.png'), '../foto.png');
  } finally {
    setBaseDir(null);
    global.window = previousWindow;
  }
});

test('imagen Linux con barra inversa: vínculo relativo, URL y acceso al fichero real', { skip: process.platform === 'win32' }, async () => {
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'plumd-image-'));
  const previousWindow = global.window;
  global.window = { api: { platform: 'linux' } };
  try {
    const folder = path.join(dir, 'carpeta\\uno');
    fs.mkdirSync(folder);
    const doc = path.join(folder, 'nota\\uno.md');
    const img = path.join(folder, 'foto\\uno.png');
    fs.writeFileSync(doc, '# Nota');
    fs.writeFileSync(img, 'imagen ficticia');
    const relative = relativeTo(doc, img);
    setBaseDir(dirname(doc));
    const url = resolveImageSrc(relative);
    assert.equal(require('node:url').fileURLToPath(url), img);
    const { resolveImagePath } = require('../src/main/acceso');
    for (const source of [relative, url, img]) {
      assert.equal(await resolveImagePath(doc, source, async () => true), fs.realpathSync(img));
    }
  } finally {
    setBaseDir(null);
    global.window = previousWindow;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
