// Estado de un dibujo justo después de escribirlo en disco.
// La referencia es la firma de lo que se escribió, no la de lo que hay ahora en el lienzo:
// un trazo hecho mientras se escribía el fichero no está guardado y debe seguir pendiente.
export function trasGuardar(firmaEscrita, firmaActual) {
  return { base: firmaEscrita, dirty: firmaActual !== firmaEscrita };
}
