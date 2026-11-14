const test = require('node:test');
const assert = require('node:assert/strict');

const modelo = () => import('../src/renderer/buscadorModelo.mjs');
const f = (rel) => ({ name: rel.split('/').pop(), path: `C:\\r\\${rel.replace(/\//g, '\\')}`, rel });

test('puntuar ignora mayúsculas y tildes y exige las letras en orden', async () => {
  const { puntuar } = await modelo();
  assert.ok(puntuar('REUNION', 'Reunión semanal') > 0);
  assert.equal(puntuar('zq', 'reunion'), -1);
  assert.equal(puntuar('nr', 'reunion'), -1); // están, pero en otro orden
  assert.equal(puntuar('', 'lo que sea'), 0);
});

test('puntuar prefiere letras seguidas y el inicio de palabra', async () => {
  const { puntuar } = await modelo();
  assert.ok(puntuar('not', 'notas') > puntuar('not', 'a-n-o-t'));
  assert.ok(puntuar('sd', 'semana-dos') > puntuar('sd', 'asado'));
});

test('filtrar prefiere el nombre a la ruta y descarta lo que no coincide', async () => {
  const { filtrar } = await modelo();
  const lista = [f('notas/otro.md'), f('notas.md'), f('diario/hoy.md')];
  const r = filtrar(lista, 'notas');
  assert.deepEqual(r.map((x) => x.rel), ['notas.md', 'notas/otro.md']);
});

test('filtrar sin consulta pone primero los recientes y luego ordena por ruta', async () => {
  const { filtrar } = await modelo();
  const lista = [f('b.md'), f('a.md'), f('c.md')];
  const r = filtrar(lista, '  ', { recientes: [lista[0].path.toUpperCase()] });
  assert.deepEqual(r.map((x) => x.rel), ['b.md', 'a.md', 'c.md']);
});

test('filtrar respeta el máximo de resultados', async () => {
  const { filtrar } = await modelo();
  const lista = Array.from({ length: 10 }, (_, i) => f(`n${i}.md`));
  assert.equal(filtrar(lista, 'n', { max: 3 }).length, 3);
});

test('carpetaDe devuelve la carpeta o vacío en la raíz', async () => {
  const { carpetaDe } = await modelo();
  assert.equal(carpetaDe('a/b/c.md'), 'a/b');
  assert.equal(carpetaDe('c.md'), '');
});
