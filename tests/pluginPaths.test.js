const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('esbuild');

const compiled = { exports: {} };
const source = fs.readFileSync(require.resolve('../src/renderer/plugins/api.js'), 'utf8');
// Solo se comprueba el acceso a archivos; no se carga CodeMirror ni se registra ningún plugin.
new Function('require', 'module', 'exports', transformSync(source, { format: 'cjs' }).code)(
  () => ({ cm: {} }), compiled, compiled.exports,
);

for (const platform of ['linux', 'win32']) {
  test(`autorización de rutas del plugin en ${platform}`, async () => {
    const previousWindow = global.window;
    const calls = [];
    global.window = { api: { platform, readFile: async (path) => { calls.push(path); return { content: 'ok' }; } } };
    try {
      const root = platform === 'linux' ? '/tmp/carpeta\\uno' : 'C:\\Docs';
      const api = compiled.exports.createApi({
        id: 'prueba', manifest: {}, entry: { data: {} },
        host: { version: 'test', explorerRoot: () => root, listDocs: () => [] },
      });
      const allowed = platform === 'linux' ? root + '/nota.md' : 'c:/docs/nota.md';
      const denied = platform === 'linux'
        ? ['/tmp/carpeta/uno/nota.md', '/tmp/carpeta\\uno\\nota.md', '/tmp/carpeta\\uno-extra/nota.md', '/tmp/Carpeta\\uno/nota.md']
        : ['C:\\Docs-extra\\nota.md', 'D:\\Docs\\nota.md'];
      assert.equal(await api.fs.read(allowed), 'ok');
      for (const path of denied) await assert.rejects(() => api.fs.read(path), /fuera de la carpeta/);
      assert.deepEqual(calls, [allowed]);
    } finally {
      global.window = previousWindow;
    }
  });
}
