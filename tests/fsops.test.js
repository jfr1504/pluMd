const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFsOps, msg } = require('../src/main/fsops');

// Todo ocurre en carpetas temporales locales. Papelera, tipo de unidad y borrado definitivo van simulados:
// ninguna prueba toca una unidad de red. `drive` es el tipo de unidad de Windows (3 fijo, 2 extraíble, 4 red, null desconocido).
function setup({ network = false, drive = network ? 4 : 3 } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plumd-test-'));
  const root = path.join(base, 'raiz');
  const fuera = path.join(base, 'fuera');
  fs.mkdirSync(root);
  fs.mkdirSync(fuera);
  const calls = { trash: [], unlink: [] };
  const ops = createFsOps({
    trash: async (p) => calls.trash.push(p),
    driveType: async () => drive,
    unlink: async (p) => calls.unlink.push(p),
  });
  return { base, root, fuera, ops, calls, done: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('crear no sobrescribe y exige estar dentro de la raíz', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const a = await t.ops.create(t.root, 'nota');
    assert.equal(a.ok, true);
    assert.equal(path.basename(a.path), 'nota.md');
    fs.writeFileSync(a.path, 'contenido');
    const b = await t.ops.create(t.root, 'nota.md');
    assert.equal(b.ok, false);
    assert.equal(fs.readFileSync(a.path, 'utf8'), 'contenido');
    assert.equal((await t.ops.create(t.fuera, 'x')).ok, false);
  } finally {
    t.done();
  }
});

test('nombres no válidos o reservados se rechazan', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    for (const n of ['', '..', 'a/b', 'a:b', 'con', 'nul.md', 'x'.repeat(250)]) {
      assert.equal((await t.ops.create(t.root, n)).ok, false, `debería rechazar «${n}»`);
    }
  } finally {
    t.done();
  }
});

test('renombrar no pisa otro documento; copiar añade " - copia"', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    fs.writeFileSync(path.join(t.root, 'a.md'), 'A');
    fs.writeFileSync(path.join(t.root, 'b.md'), 'B');
    assert.equal((await t.ops.rename(path.join(t.root, 'a.md'), 'b')).ok, false);
    assert.equal(fs.readFileSync(path.join(t.root, 'b.md'), 'utf8'), 'B');
    const c = await t.ops.copy(path.join(t.root, 'a.md'), t.root);
    assert.equal(c.ok, true);
    assert.equal(path.basename(c.path), 'a - copia.md');
    assert.equal(fs.readFileSync(path.join(t.root, 'a.md'), 'utf8'), 'A');
  } finally {
    t.done();
  }
});

test('una junction que sale de la raíz no se lista ni permite operar fuera', async () => {
  const t = setup();
  try {
    fs.writeFileSync(path.join(t.fuera, 'secreto.md'), 'S');
    fs.symlinkSync(t.fuera, path.join(t.root, 'escape'), 'junction');
    fs.mkdirSync(path.join(t.root, 'interna'));
    fs.symlinkSync(path.join(t.root, 'interna'), path.join(t.root, 'atajo'), 'junction');
    await t.ops.setRoot(t.root);

    const nombres = (await t.ops.listDir(t.root)).map((e) => e.name);
    assert.ok(!nombres.includes('escape'), 'la junction externa no debe listarse');
    assert.ok(nombres.includes('interna'));
    assert.ok(nombres.includes('atajo'), 'una junction que queda dentro sí es válida');

    const viaEnlace = path.join(t.root, 'escape');
    await assert.rejects(() => t.ops.listDir(viaEnlace));
    assert.equal((await t.ops.create(viaEnlace, 'nuevo')).ok, false);
    assert.equal(fs.existsSync(path.join(t.fuera, 'nuevo.md')), false);
    assert.equal((await t.ops.rename(path.join(viaEnlace, 'secreto.md'), 'otro')).ok, false);
    assert.equal((await t.ops.copy(path.join(viaEnlace, 'secreto.md'), t.root)).ok, false);
    assert.equal((await t.ops.copy(path.join(t.root, 'interna'), viaEnlace)).ok, false);
    assert.equal((await t.ops.remove(path.join(viaEnlace, 'secreto.md'))).ok, false);
    assert.equal(await t.ops.contains(path.join(viaEnlace, 'secreto.md')), false);
    assert.deepEqual(t.calls.trash, []);
    assert.deepEqual(t.calls.unlink, []);
  } finally {
    t.done();
  }
});

test('borrar en local envía a la Papelera y nunca borra carpetas ni otros tipos', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const f = path.join(t.root, 'a.md');
    fs.writeFileSync(f, 'A');
    fs.writeFileSync(path.join(t.root, 'x.exe'), 'X');
    fs.mkdirSync(path.join(t.root, 'carpeta.md'));
    const r = await t.ops.remove(f);
    assert.equal(r.ok, true);
    assert.equal(r.permanent, false);
    assert.deepEqual(t.calls.trash, [f]);
    assert.equal((await t.ops.remove(path.join(t.root, 'x.exe'))).ok, false);
    assert.equal((await t.ops.remove(path.join(t.root, 'carpeta.md'))).ok, false);
    assert.deepEqual(t.calls.unlink, []);
  } finally {
    t.done();
  }
});

test('en red el borrado exige confirmación expresa y es definitivo', async () => {
  const t = setup({ network: true });
  try {
    const net = await t.ops.setRoot(t.root);
    assert.equal(net.network, true);
    const f = path.join(t.root, 'a.md');
    fs.writeFileSync(f, 'A');
    const sin = await t.ops.remove(f);
    assert.equal(sin.ok, false);
    assert.equal(sin.needsPermanent, true);
    assert.deepEqual(t.calls.unlink, []);
    const con = await t.ops.remove(f, { permanent: true });
    assert.equal(con.ok, true);
    assert.equal(con.permanent, true);
    assert.equal(t.calls.unlink.length, 1);
    assert.deepEqual(t.calls.trash, []);
  } finally {
    t.done();
  }
});

test('si no se puede saber el tipo de unidad se trata como red', async () => {
  const t = setup();
  try {
    const ops = createFsOps({ trash: async () => {}, driveType: async () => null, unlink: async () => {} });
    await ops.setRoot(t.root);
    fs.writeFileSync(path.join(t.root, 'a.md'), 'A');
    const r = await ops.remove(path.join(t.root, 'a.md'));
    assert.equal(r.needsPermanent, true);
  } finally {
    t.done();
  }
});

test('crear carpeta: un solo nivel, sin pisar nada y dentro de la raíz', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const a = await t.ops.createDir(t.root, 'Notas');
    assert.equal(a.ok, true);
    assert.equal(fs.statSync(a.path).isDirectory(), true);
    assert.equal((await t.ops.createDir(t.root, 'notas')).ok, false, 'ya existe (Windows no distingue mayúsculas)');
    fs.writeFileSync(path.join(t.root, 'doc.md'), 'D');
    assert.equal((await t.ops.createDir(t.root, 'doc.md')).ok, false);
    assert.equal(fs.readFileSync(path.join(t.root, 'doc.md'), 'utf8'), 'D');
    assert.equal((await t.ops.createDir(t.fuera, 'x')).ok, false);
    for (const n of ['', '..', 'a/b', 'a\\b', '.oculta', 'punto.', 'con', 'node_modules', 'x'.repeat(250)]) {
      assert.equal((await t.ops.createDir(t.root, n)).ok, false, `debería rechazar «${n}»`);
    }
    assert.equal(fs.existsSync(path.join(t.root, 'a')), false);
  } finally {
    t.done();
  }
});

test('borrar carpeta: a la Papelera; nunca la raíz, un enlace, una de fuera ni en red', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const d = path.join(t.root, 'vieja');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'a.md'), 'A');
    fs.mkdirSync(path.join(t.fuera, 'ajena'));
    fs.symlinkSync(path.join(t.fuera, 'ajena'), path.join(t.root, 'escape'), 'junction');
    fs.mkdirSync(path.join(t.root, 'interna'));
    fs.symlinkSync(path.join(t.root, 'interna'), path.join(t.root, 'atajo'), 'junction');

    assert.equal((await t.ops.removeDir(t.root)).ok, false, 'la carpeta abierta no se borra');
    assert.equal((await t.ops.removeDir(path.join(t.fuera, 'ajena'))).ok, false);
    assert.equal((await t.ops.removeDir(path.join(t.root, 'escape'))).ok, false);
    assert.equal((await t.ops.removeDir(path.join(t.root, 'atajo'))).ok, false, 'un enlace no se borra aunque quede dentro');
    assert.equal((await t.ops.removeDir(path.join(d, 'a.md'))).ok, false, 'un documento no es una carpeta');
    assert.deepEqual(t.calls.trash, []);

    const r = await t.ops.removeDir(d);
    assert.equal(r.ok, true);
    assert.deepEqual(t.calls.trash, [d]);
    assert.deepEqual(t.calls.unlink, []);
  } finally {
    t.done();
  }
});

test('borrar carpeta en red no se hace desde la aplicación', async () => {
  const t = setup({ network: true });
  try {
    await t.ops.setRoot(t.root);
    const d = path.join(t.root, 'vieja');
    fs.mkdirSync(d);
    const r = await t.ops.removeDir(d);
    assert.equal(r.ok, false);
    assert.deepEqual(t.calls.trash, []);
    assert.deepEqual(t.calls.unlink, []);
    assert.equal(fs.existsSync(d), true);
  } finally {
    t.done();
  }
});

test('borrar carpeta solo en discos fijos: no en extraíbles ni si no se sabe el tipo', async () => {
  for (const [drive, permitido] of [[3, true], [2, false], [4, false], [5, false], [null, false]]) {
    const t = setup({ drive });
    try {
      await t.ops.setRoot(t.root);
      const d = path.join(t.root, 'vieja');
      fs.mkdirSync(d);
      const r = await t.ops.removeDir(d);
      assert.equal(r.ok, permitido, `tipo de unidad ${drive}`);
      if (!permitido) assert.equal(r.error, msg.notFixed);
      assert.deepEqual(t.calls.trash, permitido ? [d] : []);
    } finally {
      t.done();
    }
  }
});

test('borrar carpeta: vacía, o solo con documentos de texto y subcarpetas con lo mismo', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const vacia = path.join(t.root, 'vacia');
    const docs = path.join(t.root, 'docs');
    fs.mkdirSync(vacia);
    fs.mkdirSync(path.join(docs, 'sub', 'hondo'), { recursive: true });
    fs.writeFileSync(path.join(docs, 'a.md'), 'A');
    fs.writeFileSync(path.join(docs, 'sub', 'b.TXT'), 'B');
    fs.writeFileSync(path.join(docs, 'sub', 'hondo', 'c.markdown'), 'C');
    assert.deepEqual(await t.ops.canRemoveDir(vacia), { ok: true });
    assert.deepEqual(await t.ops.canRemoveDir(docs), { ok: true });
    assert.equal((await t.ops.removeDir(vacia)).ok, true);
    assert.equal((await t.ops.removeDir(docs)).ok, true);
    assert.deepEqual(t.calls.trash, [vacia, docs]);
  } finally {
    t.done();
  }
});

test('borrar carpeta con ficheros que el panel no muestra se niega y dice cuántos son', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const d = path.join(t.root, 'obra');
    fs.mkdirSync(path.join(d, 'planos'), { recursive: true });
    fs.mkdirSync(path.join(d, '.git'));
    fs.writeFileSync(path.join(d, 'nota.md'), 'visible: no cuenta');
    fs.writeFileSync(path.join(d, 'informe.pdf'), 'otro tipo');
    fs.writeFileSync(path.join(d, 'planos', 'a.dwg'), 'otro tipo, en una subcarpeta');
    fs.writeFileSync(path.join(d, '.nota-oculta.md'), 'oculto aunque sea .md');
    fs.writeFileSync(path.join(d, '.git', 'config'), 'dentro de una carpeta oculta');
    fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'dentro de una carpeta oculta');

    const r = await t.ops.removeDir(d);
    assert.equal(r.ok, false);
    assert.equal(r.error, msg.hiddenFiles(5));
    assert.match(r.error, /5 ficheros que PluMd no muestra/);
    assert.deepEqual(await t.ops.canRemoveDir(d), r, 'la consulta previa da el mismo veredicto');
    assert.deepEqual(t.calls.trash, []);
    assert.equal(fs.existsSync(path.join(d, 'informe.pdf')), true);
  } finally {
    t.done();
  }
});

test('borrar carpeta: un solo fichero oculto va en singular, un enlace cuenta y no se sigue', async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const uno = path.join(t.root, 'uno');
    const conEnlace = path.join(t.root, 'conEnlace');
    fs.mkdirSync(uno);
    fs.writeFileSync(path.join(uno, 'desktop.ini'), '');
    fs.mkdirSync(conEnlace);
    fs.symlinkSync(t.fuera, path.join(conEnlace, 'atajo'), 'junction');
    fs.writeFileSync(path.join(t.fuera, 'x.md'), 'fuera: no debe contarse');

    assert.match((await t.ops.removeDir(uno)).error, /contiene 1 fichero que PluMd no muestra/);
    assert.equal((await t.ops.removeDir(conEnlace)).error, msg.hiddenFiles(1));
    assert.deepEqual(t.calls.trash, []);
  } finally {
    t.done();
  }
});
