const test = require('node:test');
const assert = require('node:assert/strict');

const modulo = () => import('../src/renderer/guardado.mjs');

test('sin cambios durante la escritura el dibujo queda guardado', async () => {
  const { trasGuardar } = await modulo();
  assert.deepEqual(trasGuardar('a:1', 'a:1'), { base: 'a:1', dirty: false });
});

test('un trazo hecho mientras se escribía el fichero sigue pendiente', async () => {
  const { trasGuardar } = await modulo();
  const r = trasGuardar('a:1', 'a:1,b:1');
  assert.equal(r.base, 'a:1');
  assert.equal(r.dirty, true);
});

test('la referencia es lo escrito aunque el lienzo ya haya cambiado', async () => {
  const { trasGuardar } = await modulo();
  assert.equal(trasGuardar('x', 'y').base, 'x');
});
