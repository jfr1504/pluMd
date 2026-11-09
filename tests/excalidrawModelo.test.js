const test = require('node:test');
const assert = require('node:assert/strict');

const modelo = () => import('../src/renderer/excalidrawModelo.mjs');

const texto = (id, text) => ({ id, type: 'text', text, originalText: text, x: 0, y: 0 });
const rect = (id) => ({ id, type: 'rectangle', x: 10, y: 20, width: 100, height: 50 });

test('una nota nueva se lee de vuelta como escena vacía', async () => {
  const { nuevaExcalidraw, parseExcalidraw } = await modelo();
  const { escena } = parseExcalidraw(nuevaExcalidraw());
  assert.equal(escena.type, 'excalidraw');
  assert.deepEqual(escena.elements, []);
});

test('la nota usa el formato de Obsidian: frontmatter, secciones y bloque comprimido', async () => {
  const { nuevaExcalidraw } = await modelo();
  const md = nuevaExcalidraw();
  assert.match(md, /^---\n\nexcalidraw-plugin: parsed\ntags: \[excalidraw\]\n\n---\n/);
  assert.match(md, /# Excalidraw Data\n\n## Text Elements\n%%\n## Drawing\n```compressed-json\n/);
  assert.match(md, /\n```\n%%\n$/);
});

test('escribir y leer conserva los elementos', async () => {
  const { serializeExcalidraw, parseExcalidraw, ESCENA_VACIA } = await modelo();
  const escena = { ...ESCENA_VACIA(), elements: [rect('aaaaaaaa'), texto('bbbbbbbb', 'Hola')] };
  const leido = parseExcalidraw(serializeExcalidraw({ escena }));
  assert.deepEqual(leido.escena.elements, escena.elements);
});

test('los textos se escriben en «## Text Elements» con su id', async () => {
  const { serializeExcalidraw, ESCENA_VACIA } = await modelo();
  const escena = { ...ESCENA_VACIA(), elements: [texto('bbbbbbbb', 'Hola'), texto('cccccccc', 'Dos\nlíneas')] };
  const md = serializeExcalidraw({ escena });
  assert.match(md, /## Text Elements\nHola \^bbbbbbbb\n\nDos\nlíneas \^cccccccc\n\n%%/);
});

test('el texto de la sección manda sobre el del JSON', async () => {
  const { serializeExcalidraw, parseExcalidraw, ESCENA_VACIA } = await modelo();
  const escena = { ...ESCENA_VACIA(), elements: [texto('bbbbbbbb', 'Hola')] };
  const editado = serializeExcalidraw({ escena }).replace('Hola ^bbbbbbbb', 'Adiós ^bbbbbbbb');
  const el = parseExcalidraw(editado).escena.elements[0];
  assert.equal(el.text, 'Adiós');
  assert.equal(el.originalText, 'Adiós');
});

test('los elementos de texto borrados no se escriben en la sección', async () => {
  const { serializeExcalidraw, ESCENA_VACIA } = await modelo();
  const borrado = { ...texto('bbbbbbbb', 'Fuera'), isDeleted: true };
  const md = serializeExcalidraw({ escena: { ...ESCENA_VACIA(), elements: [borrado] } });
  assert.doesNotMatch(md, /Fuera \^/);
});

test('el bloque comprimido se parte en líneas de 256 caracteres', async () => {
  const { serializeExcalidraw, ESCENA_VACIA } = await modelo();
  const elements = Array.from({ length: 40 }, (_, i) => rect(`r${String(i).padStart(7, '0')}`));
  const md = serializeExcalidraw({ escena: { ...ESCENA_VACIA(), elements } });
  const bloque = /```compressed-json\n([\s\S]*?)\n```/.exec(md)[1];
  const lineas = bloque.split('\n\n');
  assert.ok(lineas.length > 1);
  assert.ok(lineas.slice(0, -1).every((l) => l.length === 256));
  assert.ok(lineas.at(-1).length <= 256);
});

test('el texto de antes del bloque de datos y los archivos incrustados se conservan', async () => {
  const { serializeExcalidraw, parseExcalidraw, ESCENA_VACIA } = await modelo();
  const antes = '---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw, idea]\n\n---\nMi nota previa\n\n';
  const escena = { ...ESCENA_VACIA(), elements: [rect('aaaaaaaa')] };
  const md = serializeExcalidraw({ antes, escena, embebidos: 'abc123: [[foto.png]]\n\n' });
  const leido = parseExcalidraw(md);
  assert.equal(leido.antes, antes);
  assert.equal(leido.embebidos, 'abc123: [[foto.png]]\n\n');
  assert.equal(serializeExcalidraw(leido), md);
});

test('también se lee el bloque json sin comprimir', async () => {
  const { parseExcalidraw, ESCENA_VACIA } = await modelo();
  const escena = { ...ESCENA_VACIA(), elements: [rect('aaaaaaaa')] };
  const md = `---\n\nexcalidraw-plugin: raw\n\n---\n# Excalidraw Data\n\n## Text Elements\n%%\n## Drawing\n\`\`\`json\n${JSON.stringify(escena)}\n\`\`\`\n%%\n`;
  assert.deepEqual(parseExcalidraw(md).escena.elements, escena.elements);
});

test('se rechazan los ficheros que no son notas Excalidraw o están dañados', async () => {
  const { parseExcalidraw } = await modelo();
  assert.throws(() => parseExcalidraw('# Una nota cualquiera'), /falta/);
  assert.throws(() => parseExcalidraw('# Excalidraw Data\n\n## Drawing\n'), /bloque de dibujo/);
  assert.throws(() => parseExcalidraw('# Excalidraw Data\n\n## Drawing\n```compressed-json\n!!!\n```\n'), /dañado/);
});

test('se reconoce una nota Excalidraw por el nombre o por el frontmatter', async () => {
  const { esExcalidraw } = await modelo();
  assert.equal(esExcalidraw('Dibujo 2026-11-02.excalidraw.md'), true);
  assert.equal(esExcalidraw('nota.md', '---\nexcalidraw-plugin: parsed\n---\n'), true);
  assert.equal(esExcalidraw('nota.md', '---\ntags: [a]\n---\n'), false);
  assert.equal(esExcalidraw('nota.md', '# Hola'), false);
});

test('los ids de texto de Excalidraw (21) y de Obsidian (8) se leen con la edición de la sección', async () => {
  const { serializeExcalidraw, parseExcalidraw, ESCENA_VACIA } = await modelo();
  const largo = 'lVsFMQS_er-1gL9-NQdac';
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const escena = { ...ESCENA_VACIA(), elements: [texto(largo, 'uno'), texto(uuid, 'dos'), texto('cccccccc', 'tres')] };
  const md = serializeExcalidraw({ escena })
    .replace(`uno ^${largo}`, `UNO editado ^${largo}`)
    .replace(`dos ^${uuid}`, `DOS editado ^${uuid}`)
    .replace('tres ^cccccccc', 'TRES editado ^cccccccc');
  const leido = parseExcalidraw(md).escena.elements.map((e) => e.text);
  assert.deepEqual(leido, ['UNO editado', 'DOS editado', 'TRES editado']);
});

test('un texto que termina en « ^2» no se confunde con un id', async () => {
  const { serializeExcalidraw, parseExcalidraw, ESCENA_VACIA } = await modelo();
  const escena = { ...ESCENA_VACIA(), elements: [texto('aaaaaaaa', 'x ^2\n\ny'), texto('bbbbbbbb', 'fin')] };
  const leido = parseExcalidraw(serializeExcalidraw({ escena })).escena.elements.map((e) => e.text);
  assert.deepEqual(leido, ['x ^2\n\ny', 'fin']);
});
