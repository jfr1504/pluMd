const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWikilinks, enlacesDeDocumento, resolver, entrantes, nombreDeNota } = require('../src/main/wikilinks');

const f = (rel) => ({ name: rel.split('/').pop(), path: `C:\\r\\${rel.replace(/\//g, '\\')}`, rel });

test('parseWikilinks lee nombre, título y texto, con sus posiciones', () => {
  const [a, b, c] = parseWikilinks('Ver [[Nota]], [[Nota#Intro]] y [[Nota#Intro|el inicio]].');
  assert.deepEqual([a.target, a.heading, a.alias, a.display], ['Nota', '', '', 'Nota']);
  assert.deepEqual([b.target, b.heading, b.display], ['Nota', 'Intro', 'Nota › Intro']);
  assert.deepEqual([c.alias, c.display], ['el inicio', 'el inicio']);
  assert.equal('Ver [[Nota]], [[Nota#Intro]] y [[Nota#Intro|el inicio]].'.slice(a.from, a.to), '[[Nota]]');
});

test('parseWikilinks ignora incrustados, vacíos y corchetes sueltos', () => {
  assert.equal(parseWikilinks('![[imagen.png]]').length, 0);
  assert.equal(parseWikilinks('[[]] y [[ ]]').length, 0);
  assert.equal(parseWikilinks('[uno] [[dos').length, 0);
  assert.equal(parseWikilinks('[[a]][[b]]').length, 2);
});

test('enlacesDeDocumento da la línea y no cuenta el código', () => {
  const md = 'Hola [[Uno]]\n```\n[[Falso]]\n```\nuna `[[Otro falso]]` y [[Dos]]';
  const r = enlacesDeDocumento(md);
  assert.deepEqual(r.map((x) => [x.target, x.line]), [['Uno', 1], ['Dos', 5]]);
  assert.match(r[0].text, /Hola/);
});

test('resolver ignora mayúsculas y tildes, acepta ruta y prefiere la carpeta del documento', () => {
  const lista = [f('Reunión.md'), f('a/Diario.md'), f('b/Diario.md'), f('x/y/larga.md')];
  assert.equal(resolver('reunion', lista).rel, 'Reunión.md');
  assert.equal(resolver('b/diario', lista).rel, 'b/Diario.md');
  assert.equal(resolver('Diario', lista, 'C:\\r\\b\\otra.md').rel, 'b/Diario.md');
  assert.equal(resolver('Diario', lista, 'C:\\r\\a\\otra.md').rel, 'a/Diario.md');
  assert.equal(resolver('larga.md', lista).rel, 'x/y/larga.md');
  assert.equal(resolver('no existe', lista), null);
  assert.equal(resolver('  ', lista), null);
});

test('entrantes lista las notas que enlazan al destino, sin contar la propia', () => {
  const lista = [f('a.md'), f('b.md'), f('c.md')];
  const L = (target, line) => ({ target, heading: '', line, text: `[[${target}]]` });
  const indice = [
    { path: lista[0].path, links: [L('b', 1), L('c', 2)] },
    { path: lista[1].path, links: [L('B', 1)] }, // se enlaza a sí misma
    { path: lista[2].path, links: [L('b', 3), L('b', 7)] },
  ];
  const r = entrantes(lista[1].path, lista, indice);
  assert.deepEqual(r.map((x) => [x.rel, x.links.length]), [['a.md', 1], ['c.md', 2]]);
});

test('nombreDeNota quita carpeta y extensión', () => {
  assert.equal(nombreDeNota('C:\\r\\sub\\Mi nota.md'), 'Mi nota');
  assert.equal(nombreDeNota('x/y.txt'), 'y');
});
