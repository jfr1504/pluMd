const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { fileFromArgs } = require('../src/main/open-args');

test('acepta rutas y URI locales y omite argumentos inválidos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plumd-args-'));
  try {
    const file = path.join(dir, 'nota con espacio #.md');
    fs.writeFileSync(file, '');
    const uri = pathToFileURL(file).href;
    assert.equal(fileFromArgs(['app', uri], true), file);
    assert.equal(fileFromArgs(['electron', '.', '--opcion', 'file://remote/nota.md', 'file:///mal%ZZ.md', uri], false), file);
    assert.equal(fileFromArgs(['app', file], true), file);
    assert.equal(fileFromArgs(['app', path.join(dir, 'ausente.md')], true), null);
    assert.equal(fileFromArgs(['app', 'https://ejemplo.test/nota.md'], true), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
