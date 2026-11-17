// Modelo del selector rápido de ficheros (sin dependencias del editor, para poder probarlo aparte).
// Coincidencia "difusa": las letras de la consulta deben aparecer en orden dentro del texto, sin importar
// mayúsculas ni tildes. Cuanto más juntas y más cerca del inicio de una palabra, mayor la puntuación.

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esSeparador = (c) => /[\s\-_./\\]/.test(c);

// Puntuación de `consulta` dentro de `texto`: -1 si no coincide; mayor es mejor.
export function puntuar(consulta, texto) {
  const q = sinTildes(consulta);
  const t = sinTildes(texto);
  if (!q) return 0;
  let pos = 0;
  let puntos = 0;
  let racha = 0;
  for (const c of q) {
    const i = t.indexOf(c, pos);
    if (i < 0) return -1;
    racha = i === pos && pos > 0 ? racha + 1 : 0;
    puntos += 1 + racha * 2;
    if (i === 0 || esSeparador(t[i - 1])) puntos += 4; // inicio de palabra
    pos = i + 1;
  }
  if (t.includes(q)) puntos += q.length * 2; // la consulta aparece seguida
  return puntos - t.length * 0.01; // a igualdad, gana el texto más corto
}

const nombreSinExt = (n) => n.replace(/\.(excalidraw\.md|md|markdown|txt)$/i, '');

// Ordena y filtra `archivos` ([{ name, path, rel }]) para la consulta.
// Sin consulta: primero los `recientes` (rutas, del más nuevo al más antiguo) y luego el resto por ruta.
export function filtrar(archivos, consulta, { recientes = [], max = 50 } = {}) {
  const q = consulta.trim();
  if (!q) {
    const orden = new Map(recientes.map((p, i) => [p.toLowerCase(), i]));
    const rango = (a) => (orden.has(a.path.toLowerCase()) ? orden.get(a.path.toLowerCase()) : Infinity);
    return [...archivos]
      .sort((a, b) => (rango(a) - rango(b)) || a.rel.localeCompare(b.rel, 'es', { numeric: true, sensitivity: 'base' }))
      .slice(0, max);
  }
  const out = [];
  for (const a of archivos) {
    const porNombre = puntuar(q, nombreSinExt(a.name));
    const porRuta = puntuar(q, a.rel);
    if (porNombre < 0 && porRuta < 0) continue;
    // El nombre pesa el doble que la ruta: escribir «notas» debe preferir notas.md a notas/otro.md.
    out.push({ a, s: Math.max(porNombre >= 0 ? porNombre * 2 : -1, porRuta) });
  }
  return out.sort((x, y) => (y.s - x.s) || x.a.rel.length - y.a.rel.length).slice(0, max).map((x) => x.a);
}

// Carpeta que se muestra junto al nombre: «sub/dir» o '' si está en la raíz.
export const carpetaDe = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
