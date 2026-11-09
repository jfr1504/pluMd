const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDibujos, nombreSeguro, esPng } = require('../src/main/dibujos');

function entorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plumd-dib-'));
  const descargas = path.join(base, 'Descargas');
  fs.mkdirSync(descargas);
  const d = createDibujos({ settingsFile: path.join(base, 'ajustes', 'dibujos.json'), defaultDir: descargas, libraryFile: path.join(base, 'ajustes', 'biblioteca.json') });
  return { base, descargas, d, limpiar: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('el nombre se limpia y siempre acaba en .excalidraw.md', () => {
  assert.equal(nombreSeguro('Dibujo 2026-11-02 21.09.02.excalidraw.md'), 'Dibujo 2026-11-02 21.09.02.excalidraw.md');
  assert.equal(nombreSeguro('nota.md'), 'nota.excalidraw.md');
  assert.equal(nombreSeguro('a<b>:c?.png'), 'abc.png.excalidraw.md');
  assert.equal(nombreSeguro(''), 'Dibujo.excalidraw.md');
});

test('el nombre no puede salirse de la carpeta', () => {
  assert.equal(nombreSeguro('..\\..\\fuera.excalidraw.md'), 'fuera.excalidraw.md');
  assert.equal(nombreSeguro('../../fuera'), 'fuera.excalidraw.md');
});

test('sin carpeta elegida se usa Descargas', async () => {
  const { d, descargas, limpiar } = entorno();
  const i = await d.info();
  assert.equal(i.folder, descargas);
  assert.equal(i.isDefault, true);
  assert.equal(i.name, 'Descargas');
  limpiar();
});

test('la carpeta elegida se recuerda y se nombra por su última carpeta', async () => {
  const { d, base, limpiar } = entorno();
  const mia = path.join(base, 'Mis dibujos');
  fs.mkdirSync(mia);
  await d.setFolder(mia);
  const i = await d.info();
  assert.equal(i.folder, mia);
  assert.equal(i.isDefault, false);
  assert.equal(i.name, 'Mis dibujos');
  limpiar();
});

test('si la carpeta elegida desaparece se vuelve a Descargas', async () => {
  const { d, base, descargas, limpiar } = entorno();
  const mia = path.join(base, 'Temporal');
  fs.mkdirSync(mia);
  await d.setFolder(mia);
  fs.rmdirSync(mia);
  assert.equal((await d.info()).folder, descargas);
  limpiar();
});

test('no se acepta como carpeta algo que no existe', async () => {
  const { d, base, limpiar } = entorno();
  await assert.rejects(() => d.setFolder(path.join(base, 'no-existe')), /no existe/);
  limpiar();
});

test('un dibujo nuevo se crea en la carpeta y nunca pisa otro', async () => {
  const { d, descargas, limpiar } = entorno();
  const a = await d.createNew('Dibujo 1.excalidraw.md', 'uno');
  const b = await d.createNew('Dibujo 1.excalidraw.md', 'dos');
  assert.equal(a.path, path.join(descargas, 'Dibujo 1.excalidraw.md'));
  assert.equal(b.path, path.join(descargas, 'Dibujo 1_2.excalidraw.md'));
  assert.equal(fs.readFileSync(a.path, 'utf8'), 'uno');
  assert.equal(fs.readFileSync(b.path, 'utf8'), 'dos');
  assert.equal(a.folderName, 'Descargas');
  limpiar();
});

test('la biblioteca de formas empieza vacía y se conserva entre lecturas', async () => {
  const { d, limpiar } = entorno();
  assert.deepEqual(await d.leerBiblioteca(), []);
  const items = [{ id: 'a', status: 'unpublished', created: 1, elements: [{ id: 'r1', type: 'rectangle' }] }];
  await d.guardarBiblioteca(items);
  assert.deepEqual(await d.leerBiblioteca(), items);
  limpiar();
});

test('una biblioteca dañada o que no es una lista se lee como vacía', async () => {
  const { d, base, limpiar } = entorno();
  fs.mkdirSync(path.join(base, 'ajustes'));
  fs.writeFileSync(path.join(base, 'ajustes', 'biblioteca.json'), '{ no es json');
  assert.deepEqual(await d.leerBiblioteca(), []);
  fs.writeFileSync(path.join(base, 'ajustes', 'biblioteca.json'), '{"a":1}');
  assert.deepEqual(await d.leerBiblioteca(), []);
  limpiar();
});

test('no se guarda una biblioteca que no es una lista', async () => {
  const { d, limpiar } = entorno();
  await assert.rejects(() => d.guardarBiblioteca({ a: 1 }), /no es válida/);
  limpiar();
});

test('al guardar la biblioteca no queda ningún temporal', async () => {
  const { d, base, limpiar } = entorno();
  await d.guardarBiblioteca([]);
  assert.deepEqual(fs.readdirSync(path.join(base, 'ajustes')), ['biblioteca.json']);
  limpiar();
});

test('solo se acepta como PNG lo que lleva la firma completa de 8 bytes', () => {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.equal(esPng(Buffer.from([...firma, 0, 0, 0, 0])), true);
  assert.equal(esPng(Buffer.from(firma)), true);
});

test('se rechaza lo que solo empieza como un PNG, lo corto y lo que no es un buffer', () => {
  assert.equal(esPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])), false);
  assert.equal(esPng(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(esPng(Buffer.alloc(0)), false);
  assert.equal(esPng(Buffer.from('<svg></svg>')), false);
  assert.equal(esPng('PNG'), false);
  assert.equal(esPng(null), false);
});
