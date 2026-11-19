// Enlaces internos [[Nota]], [[Nota|texto]] y [[Nota#Título]] (la misma sintaxis que Obsidian).
// Módulo puro, sin dependencias, en CommonJS: lo usan el proceso principal (para buscar vínculos entrantes)
// y el editor (esbuild lo incluye en el paquete).
// No se tratan como enlaces los incrustados ![[...]], que Obsidian usa para insertar otra nota o una imagen.

const RE = /(!?)\[\[([^\[\]\n|#]+?)(?:#([^\[\]\n|]*))?(?:\|([^\[\]\n]*))?\]\]/g;

// Enlaces de una línea (o texto): [{ from, to, target, heading, alias, display }]; from/to son posiciones en `text`.
function parseWikilinks(text) {
  const out = [];
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text))) {
    if (m[1]) continue; // ![[...]]: incrustado, no es un enlace
    const target = m[2].trim();
    if (!target) continue;
    const heading = m[3] != null ? m[3].trim() : '';
    const alias = m[4] != null ? m[4].trim() : '';
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      target,
      heading,
      alias,
      display: alias || (heading ? `${target} › ${heading}` : target),
    });
  }
  return out;
}

// Quita bloques de código (``` o ~~~) y código en línea, conservando la longitud y los saltos de línea,
// para que un [[ejemplo]] dentro de código no cuente como enlace.
function sinCodigo(text) {
  const blanco = (s) => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?=\n|$)|$)/gm, blanco)
    .replace(/`[^`\n]*`/g, blanco);
}

// Enlaces de un documento entero, con su número de línea (desde 1) y el texto de esa línea.
function enlacesDeDocumento(text) {
  const lineas = sinCodigo(text).split('\n');
  const originales = text.split('\n');
  const out = [];
  lineas.forEach((l, i) => {
    if (!l.includes('[[')) return;
    for (const w of parseWikilinks(l)) out.push({ ...w, line: i + 1, text: originales[i].trim().slice(0, 200) });
  });
  return out;
}

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sinExt = (s) => s.replace(/\.(md|markdown|txt)$/i, '');
const carpeta = (p) => p.replace(/\\/g, '/').replace(/\/[^/]*$/, '');

// Nombre con el que se enlaza un fichero: su nombre sin extensión.
const nombreDeNota = (file) => sinExt(file.replace(/\\/g, '/').split('/').pop());

// Fichero al que apunta `target`. `archivos` es [{ name, path, rel }] (rel con «/»).
// Como en Obsidian: sin distinguir mayúsculas ni tildes; vale el nombre o la ruta desde la raíz; si hay varios
// con el mismo nombre gana el de la carpeta del documento que enlaza y, después, el de la ruta más corta.
function resolver(target, archivos, desde = null) {
  const t = sinTildes(sinExt(target.trim().replace(/\\/g, '/')));
  if (!t) return null;
  const candidatos = archivos.filter((a) => {
    const r = sinTildes(sinExt(a.rel));
    return r === t || r.endsWith(`/${t}`);
  });
  if (!candidatos.length) return null;
  const dir = desde ? sinTildes(carpeta(desde)) : null;
  const mismaCarpeta = (a) => (dir && sinTildes(carpeta(a.path)) === dir ? 0 : 1);
  return [...candidatos].sort((a, b) => (mismaCarpeta(a) - mismaCarpeta(b)) || a.rel.length - b.rel.length)[0];
}

// Vínculos entrantes: notas que enlazan a `destino` (ruta). `indice` es [{ path, links: [{ target, heading, line, text }] }].
function entrantes(destino, archivos, indice) {
  const meta = destino.toLowerCase();
  const out = [];
  for (const nota of indice) {
    if (nota.path.toLowerCase() === meta) continue; // una nota no es vínculo entrante de sí misma
    const hits = nota.links.filter((l) => resolver(l.target, archivos, nota.path)?.path.toLowerCase() === meta);
    if (hits.length) out.push({ path: nota.path, rel: archivos.find((a) => a.path === nota.path)?.rel || nota.path, links: hits });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel, 'es', { numeric: true, sensitivity: 'base' }));
}

module.exports = { parseWikilinks, sinCodigo, enlacesDeDocumento, nombreDeNota, resolver, entrantes };
