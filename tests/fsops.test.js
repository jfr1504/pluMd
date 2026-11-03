const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFsOps } = require('../src/main/fsops');

// Todo ocurre en carpetas temporales locales. Papelera, tipo de unidad y borrado definitivo van simulados:
// ninguna prueba toca una unidad de red.
function setup({ network = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'plumd-test-'));
  const root = path.join(base, 'raiz');
  const fuera = path.join(base, 'fuera');
  fs.mkdirSync(root);
  fs.mkdirSync(fuera);
  const calls = { trash: [], unlink: [] };
  const ops = createFsOps({
    trash: async (p) => calls.trash.push(p),
    driveType: async () => (network ? 4 : 3),
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
    const invalid = ['', '..', 'a/b', 'x'.repeat(250)];
    if (process.platform === 'win32') invalid.push('a:b', 'con', 'nul.md');
    for (const n of invalid) {
      assert.equal((await t.ops.create(t.root, n)).ok, false, `debería rechazar «${n}»`);
    }
    if (process.platform !== 'win32') {
      assert.equal((await t.ops.create(t.root, 'a:b')).ok, true);
      assert.equal((await t.ops.create(t.root, 'con')).ok, true);
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

test('en Linux renombrar conserva la distinción de mayúsculas y no pisa archivos', { skip: process.platform === 'win32' }, async () => {
  const t = setup();
  try {
    await t.ops.setRoot(t.root);
    const lower = path.join(t.root, 'nota.md');
    const upper = path.join(t.root, 'NOTA.md');
    fs.writeFileSync(lower, 'minúsculas');
    fs.writeFileSync(upper, 'mayúsculas');
    const r = await t.ops.rename(lower, 'NOTA.md');
    assert.equal(r.ok, false);
    assert.equal(fs.readFileSync(lower, 'utf8'), 'minúsculas');
    assert.equal(fs.readFileSync(upper, 'utf8'), 'mayúsculas');
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

test('Linux usa la papelera del escritorio sin tratar rutas locales como unidades de red', { skip: process.platform === 'win32' }, async () => {
  const t = setup({ network: true });
  try {
    const root = await t.ops.setRoot(t.root);
    assert.equal(root.network, false);
    const f = path.join(t.root, 'a.md');
    fs.writeFileSync(f, 'A');
    const r = await t.ops.remove(f);
    assert.equal(r.ok, true);
    assert.equal(r.permanent, false);
    assert.deepEqual(t.calls.trash, [f]);
    assert.deepEqual(t.calls.unlink, []);
  } finally {
    t.done();
  }
});

test('en red el borrado exige confirmación expresa y es definitivo', { skip: process.platform !== 'win32' }, async () => {
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

test('si no se puede saber el tipo de unidad se trata como red', { skip: process.platform !== 'win32' }, async () => {
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
