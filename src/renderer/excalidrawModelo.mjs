// Modelo de las notas Excalidraw: lectura y escritura del formato `.excalidraw.md`
// del plugin de Obsidian, sin depender del DOM para poder probarlo con `node --test`.
//
// Estructura del fichero:
//   ---  frontmatter (excalidraw-plugin: parsed)  ---
//   (texto libre y aviso del plugin)
//   # Excalidraw Data
//   ## Text Elements      -> «texto ^id», uno por elemento de texto
//   ## Embedded Files     -> (opcional) imágenes incrustadas
//   ## Drawing            -> escena JSON, comprimida (compressed-json) o plana (json)
import LZString from 'lz-string';

const CABECERA_DATOS = '# Excalidraw Data';
const TAM_BLOQUE = 256; // el plugin parte el base64 en líneas de 256 caracteres
const ID_TEXTO = '[A-Za-z0-9_-]{8}';

const FRONTMATTER = '---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n';
const AVISO = "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'\n\n\n";

export const ESCENA_VACIA = () => ({
  type: 'excalidraw',
  version: 2,
  source: 'plumd',
  elements: [],
  appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
  files: {},
});

// ¿Es una nota Excalidraw? Por el nombre o por la marca del frontmatter.
export function esExcalidraw(nombre, texto = '') {
  if (/\.excalidraw\.md$/i.test(nombre || '')) return true;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  return !!fm && /^excalidraw-plugin\s*:/m.test(fm[1]);
}

// Texto crudo de una sección «## Nombre» hasta la siguiente sección, `%%` o el final.
function seccion(texto, nombre) {
  const m = new RegExp(`^## ${nombre}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |^%%|^\`\`\`compressed-json|^\`\`\`json|(?![\\s\\S]))`, 'm').exec(texto);
  return m ? m[1] : null;
}

// «texto ^id» -> Map(id -> texto). El texto puede ocupar varias líneas.
function leerTextos(bloque) {
  const mapa = new Map();
  if (!bloque) return mapa;
  const limpio = bloque.replace(/^\s+/, '');
  const re = new RegExp(`([\\s\\S]*?) \\^(${ID_TEXTO})(?:\\r?\\n\\r?\\n|\\r?\\n?$)`, 'g');
  let m;
  while ((m = re.exec(limpio)) !== null) mapa.set(m[2], m[1]);
  return mapa;
}

function leerDibujo(texto) {
  const m = /^```(compressed-json|json)[ \t]*\r?\n([\s\S]*?)\r?\n?```/m.exec(texto);
  if (!m) throw new Error('No se encontró el bloque de dibujo (## Drawing)');
  const crudo = m[1] === 'compressed-json'
    ? LZString.decompressFromBase64(m[2].replace(/\s+/g, ''))
    : m[2];
  if (!crudo) throw new Error('El bloque de dibujo está dañado y no se pudo descomprimir');
  try {
    return JSON.parse(crudo);
  } catch {
    throw new Error('El bloque de dibujo no contiene un JSON válido');
  }
}

// Texto -> { antes, escena, embebidos }
//  antes: todo lo anterior a «# Excalidraw Data» (frontmatter y notas del usuario), se conserva tal cual.
//  embebidos: texto crudo de «## Embedded Files», se conserva tal cual.
export function parseExcalidraw(texto) {
  const t = texto.replace(/^﻿/, '');
  const i = t.indexOf(CABECERA_DATOS);
  if (i < 0) throw new Error('No es una nota Excalidraw: falta «# Excalidraw Data»');
  const antes = t.slice(0, i);
  const datos = t.slice(i);

  const escena = leerDibujo(datos);
  if (!Array.isArray(escena.elements)) escena.elements = [];
  escena.files = escena.files || {};
  escena.appState = escena.appState || {};

  // La sección de textos manda sobre el JSON: así se pueden corregir a mano desde cualquier editor.
  const textos = leerTextos(seccion(datos, 'Text Elements'));
  for (const el of escena.elements) {
    if (el.type === 'text' && textos.has(el.id)) {
      const crudo = textos.get(el.id);
      el.text = crudo;
      el.originalText = crudo;
    }
  }
  return { antes, escena, embebidos: seccion(datos, 'Embedded Files') };
}

function trocear(s, n) {
  const partes = [];
  for (let k = 0; k < s.length; k += n) partes.push(s.slice(k, k + n));
  return partes.join('\n\n');
}

// { antes?, escena, embebidos? } -> texto del fichero
export function serializeExcalidraw({ antes, escena, embebidos = null }) {
  const textos = escena.elements
    .filter((el) => el.type === 'text' && !el.isDeleted)
    .map((el) => `${el.originalText ?? el.text} ^${el.id}`)
    .join('\n\n');
  const comprimido = trocear(LZString.compressToBase64(JSON.stringify(escena)), TAM_BLOQUE);

  return (
    (antes ?? FRONTMATTER + AVISO) +
    `${CABECERA_DATOS}\n\n## Text Elements\n${textos ? textos + '\n\n' : ''}` +
    (embebidos != null ? `## Embedded Files\n${embebidos}` : '') +
    `%%\n## Drawing\n\`\`\`compressed-json\n${comprimido}\n\`\`\`\n%%\n`
  );
}

// Nota nueva y vacía.
export function nuevaExcalidraw() {
  return serializeExcalidraw({ escena: ESCENA_VACIA() });
}
