const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const renderer = path.join(raiz, 'src', 'renderer');
const modelo = () => import('../src/renderer/esteticasModelo.mjs');

test('cada estética tiene id y nombre únicos, y la base no necesita hoja', async () => {
  const { ESTETICAS, ESTETICA_BASE, esEstetica, buscarEstetica } = await modelo();
  assert.equal(new Set(ESTETICAS.map((e) => e.id)).size, ESTETICAS.length);
  assert.equal(new Set(ESTETICAS.map((e) => e.name)).size, ESTETICAS.length);
  assert.equal(buscarEstetica(ESTETICA_BASE).css, null);
  assert.equal(esEstetica('folio'), true);
  assert.equal(esEstetica('inexistente'), false);
  assert.equal(buscarEstetica('inexistente').id, ESTETICA_BASE); // un valor desconocido cae en la base
});

test('cada hoja de estética existe y early.js la carga al arrancar', async () => {
  const { ESTETICAS } = await modelo();
  const early = fs.readFileSync(path.join(renderer, 'early.js'), 'utf8');
  for (const e of ESTETICAS.filter((x) => x.css)) {
    assert.ok(fs.existsSync(path.join(renderer, e.css)), `falta ${e.css}`);
    assert.ok(early.includes(`'${e.css}'`), `early.js no conoce ${e.css}`);
  }
});

test('las fuentes que usa Folio existen en node_modules y el script de build las copia', () => {
  const css = fs.readFileSync(path.join(renderer, 'esteticas', 'folio.css'), 'utf8');
  const build = fs.readFileSync(path.join(raiz, 'scripts', 'build.js'), 'utf8');
  for (const [, nombre] of css.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)) {
    assert.ok(build.includes(nombre), `build.js no copia ${nombre}`);
    const paquete = nombre.split('-latin')[0];
    assert.ok(fs.existsSync(path.join(raiz, 'node_modules', '@fontsource-variable', paquete, 'files', nombre)), `falta la fuente ${nombre}`);
  }
});

test('Folio solo anima transform y opacity y respeta «reducir movimiento»', () => {
  const css = fs.readFileSync(path.join(renderer, 'esteticas', 'folio.css'), 'utf8');
  // Los fotogramas (@keyframes) solo pueden mover transform y opacity.
  for (const [, cuerpo] of css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\}\s*\})/g)) {
    for (const [, prop] of cuerpo.matchAll(/([\w-]+)\s*:/g)) assert.ok(['opacity', 'transform'].includes(prop), `@keyframes anima ${prop}`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/, 'falta el bloque de reducir movimiento');
  const reducido = css.slice(css.indexOf('prefers-reduced-motion'));
  assert.match(reducido, /view-transition-old/, 'reducir movimiento debe apagar también los fundidos de ventana');
});
