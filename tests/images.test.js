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
