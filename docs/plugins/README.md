# Guía para escribir plugins de PluMd

Esta guía describe la API 1, tal como está implementada. Si algo no está aquí, no existe todavía: al final hay una lista de lo que queda fuera de esta versión.

## 1. Qué es un plugin

Una carpeta con un `manifest.json` y, si hace falta, un módulo JavaScript. Se instala copiando la carpeta; no hay que compilar nada. Un plugin puede ser solo declarativo (por ejemplo, un skin) o llevar código.

Hay tres ejemplos completos en `plugins-ejemplo/` del repositorio:

- `sepia`: un skin, sin código.
- `indice`: panel lateral con los títulos del documento, comando, botón de cinta, barra de estado, eventos y ajustes.
- `grafico`: dibuja los bloques de código ```` ```barras ```` como un gráfico.

## 2. Tu primer plugin en cinco minutos

Crea una carpeta `hola` con estos dos ficheros.

`manifest.json`:

```json
{
  "id": "hola",
  "name": "Hola",
  "version": "1.0.0",
  "apiVersion": 1,
  "main": "index.js"
}
```

`index.js`:

```js
export function activate(plumd) {
  plumd.commands.register({
    id: 'hola.saludar',
    title: 'Insertar un saludo',
    run: () => plumd.editor.insertAtCursor('Hola desde un plugin\n'),
  });
}
```

Para probarlo, arranca PluMd desde una terminal con la carpeta del plugin:

```bash
PluMd.exe --plugin-dev="C:\ruta\a\hola"
```

Los plugins cargados con `--plugin-dev` se activan solos y se marcan como "desarrollo". Pulsa Ctrl+Mayús+P, escribe "saludo" y ejecuta el comando. Cuando cambies el código, usa Ayuda > Recargar plugins.

## 3. Instalación y activación

- Los plugins instalados viven en la carpeta de datos de la aplicación. Ayuda > Carpeta de plugins la abre.
- Ayuda > Administrar plugins lista los plugins instalados, con su estado, y permite activarlos, desactivarlos, abrir sus ajustes, instalar uno desde una carpeta y recargarlos.
- Un plugin recién instalado está desactivado. Al activarlo por primera vez, PluMd muestra sus permisos declarados y avisa de que un plugin activado tiene los mismos permisos que la aplicación.
- PluMd nunca borra plugins. Para desinstalar uno, desactívalo y borra su carpeta desde el Explorador de Windows.

## 4. El manifiesto

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| `id` | sí | Único. Solo minúsculas, números y guiones, hasta 41 caracteres. |
| `name` | sí | Nombre que se muestra. |
| `version` | sí | Versión del plugin, por ejemplo `1.2.0`. |
| `apiVersion` | sí | Entero. Esta guía describe la 1. PluMd rechaza un plugin que pida una API más nueva que la suya. |
| `description`, `author` | no | Se muestran en la pantalla de plugins. |
| `main` | no | Módulo `.js` o `.mjs` dentro de la carpeta. Sin él, el plugin es solo declarativo. |
| `permissions` | no | Lista de textos informativa (`editor`, `ui`, `fs`...). Se muestra al usuario al activar. No se hace cumplir (ver el apartado 11). |
| `activationEvents` | no | Cuándo cargar el código. Sin este campo, o con `onStartup`, se carga al arrancar. Con `["onCommand:mi.comando"]` solo se carga cuando se ejecuta ese comando. |
| `contributes.skins` | no | Skins y paletas (apartado 6). |
| `contributes.commands` | no | Comandos declarados: `[{ "id", "title", "keys"? }]`. Aparecen en la paleta aunque el código aún no se haya cargado. |
| `contributes.settings` | no | Ajustes del plugin (apartado 8). |

Si el manifiesto no es válido, el plugin aparece en la lista como "Inválido", con el motivo, y no se carga.

## 5. La API

El módulo exporta `activate(plumd)`, y opcionalmente `deactivate()`. `plumd` es un objeto congelado con estas áreas. Todo lo que registra un plugin se retira solo cuando se desactiva.

### 5.1 `plumd.app`

`plumd.app.version` (versión de PluMd), `plumd.app.apiVersion`, `plumd.app.pluginId` y `plumd.app.baseUrl` (la dirección `plumd-plugin://tu-id/` para cargar recursos de tu carpeta, por ejemplo imágenes).

### 5.2 Comandos

```js
plumd.commands.register({ id, title, keys?, run })
plumd.commands.execute(id, arg?)
```

`title` hace que el comando aparezca en la paleta (Ctrl+Mayús+P). `keys` es solo una indicación que se muestra en la paleta; no crea ningún atajo de teclado. Un id ya ocupado, también por un comando del núcleo, provoca un error.

### 5.3 Editor

```js
plumd.editor.getActive()          // { path, name, mode, dirty, text, selection: { from, to, text } }
plumd.editor.insertAtCursor(text)
plumd.editor.replaceSelection(text)
plumd.editor.goto(pos)            // coloca el cursor en la posición del texto
plumd.editor.registerExtension(ext)
plumd.editor.registerBlockRenderer({ language, render })
```

`registerExtension` acepta cualquier extensión de CodeMirror 6 (apartado 7). Si es inválida, PluMd la retira y lo cuenta como un fallo del plugin.

### 5.4 Documentos

```js
plumd.documents.open(path)
plumd.documents.list()        // [{ path, name, dirty, active }]
plumd.documents.activePath()
```

### 5.5 Interfaz

```js
plumd.ui.notify(texto)
plumd.ui.confirm({ title, message, okLabel?, danger? })   // promesa de true o false
plumd.ui.prompt({ title?, label?, value? })               // promesa de un texto, o null
plumd.ui.ribbon.addGroup({ tab, label, items })
plumd.ui.ribbon.addTab({ id, label, groups })
plumd.ui.registerPanel({ id, title, mount })
plumd.ui.showPanel(id)
plumd.ui.statusBar.addItem({ id, text?, title?, onClick? })   // devuelve { update({ text, title }), dispose() }
plumd.ui.contextMenu.add({ target, label, run })
```

Cinta. `tab` es el id de una pestaña existente: `home`, `insert`, `view`, `help`, o una creada por un plugin con `addTab`. Cada elemento de `items` es `{ command, label, title?, size?, icon?, svg? }`, donde `command` es el id de un comando, `size` es `lg` (grande, por defecto), `sm` o `ic` (solo icono), `icon` es el nombre de un icono de PluMd (`sidebar`, `table`, `image`, `link`, `palette`, `puzzle`, `info`, `folder`, `search`...) y `svg` es código SVG propio.

Paneles laterales. `mount(el)` recibe el elemento donde dibujar y puede devolver `{ onShow, destroy }`. Cuando hay algún panel de plugin, el panel lateral muestra pestañas: Archivos y los paneles de los plugins.

Menús contextuales (botón derecho). `target` indica dónde aparece la opción:

| `target` | Dónde | `run` recibe |
| --- | --- | --- |
| `explorer-file`, `explorer-folder` | Panel de carpetas | `{ path, isDir }` |
| `editor` | Cualquier punto del editor | `{ path, selection }` |
| `editor-selection` | Editor, con texto seleccionado | `{ path, selection }` |
| `editor-link` | Editor, sobre un vínculo | `{ path, selection, url }` |
| `editor-image` | Editor, sobre una imagen | `{ path, selection, src }` |
| `editor-code` | Editor, dentro de un bloque de código | `{ path, selection, language }` |
| `editor-table` | Celda de una tabla | `{ path }` |
| `tab` | Pestaña de un documento | `{ path }` |

`path` es la ruta del documento, o `null` si aún no está guardado.

### 5.6 Ficheros

```js
await plumd.fs.read(path)
await plumd.fs.list(dir)
await plumd.fs.write(path, texto, { overwrite: false })
```

Solo se permiten rutas dentro de la carpeta abierta en el panel de carpetas o de documentos que ya están abiertos. Se comprueba la ruta real: un enlace simbólico o junction que apunte fuera de la carpeta abierta no cuenta como dentro. `write` solo crea o modifica documentos `.md`, `.markdown` o `.txt`, y no sustituye un fichero existente salvo que pases `{ overwrite: true }`. `list` solo devuelve documentos de texto y carpetas.

### 5.7 Ajustes y datos propios

```js
plumd.settings.get(clave)          // valor guardado, o el predeterminado del manifiesto
plumd.settings.set(clave, valor)
plumd.settings.all()
plumd.settings.onChange((clave, valor) => { ... })
await plumd.storage.get(clave)     // datos libres del plugin, en JSON
await plumd.storage.set(clave, valor)
```

Se guardan en la carpeta de datos de la aplicación, un fichero por plugin, con un máximo de 1 MB. Nunca se escribe nada en las carpetas de documentos del usuario.

### 5.8 Eventos

```js
const sub = plumd.on('document:changed', ({ path }) => { ... })
sub.dispose()
```

| Evento | Cuándo | Datos |
| --- | --- | --- |
| `document:opened` | Se abre un fichero en una pestaña | `{ path }` |
| `document:activated` | Se cambia de pestaña | `{ path }` |
| `document:changed` | Se edita el texto (agrupado, a los 300 ms de dejar de escribir) | `{ path }` |
| `document:saved` | Se guarda | `{ path }` |
| `document:closed` | Se cierra una pestaña | `{ path }` |
| `mode:changed` | Cambia entre Lectura y Código | `{ mode }` |
| `theme:changed` | Cambia el skin o el modo claro u oscuro | `{ skin, theme }` |
| `app:ready` | PluMd ha terminado de arrancar y de cargar los plugins | |

`path` es `null` en un documento que aún no se ha guardado.

## 6. Skins y paletas

Un skin cambia el aspecto sin tocar la distribución. Se declara en el manifiesto, sin código:

```json
"contributes": {
  "skins": [
    { "id": "sepia", "name": "Sepia", "description": "Tonos cálidos", "css": "sepia.css" }
  ]
}
```

Un skin puede ser una hoja CSS (`css`) o solo variables (`vars` para el modo claro y `varsDark` para el oscuro), sin ningún fichero. Los skins aparecen en Vista > Aspecto.

En el CSS, los selectores deben llevar el id del skin, para que solo se apliquen cuando está activo:

```css
:root[data-skin='sepia'] { --bg: #f6efe0; --text: #3b2f1e; }
:root[data-skin='sepia'][data-theme='dark'] { --bg: #262017; --text: #e8dcc4; }
```

Variables que PluMd usa en toda la interfaz:

| Grupo | Variables |
| --- | --- |
| Colores | `--bg`, `--bg-2`, `--bg-3`, `--border`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--on-accent`, `--code-bg`, `--selection` |
| Formas | `--r-s`, `--r-m`, `--r-l` (radios de esquina), `--shadow-pop`, `--shadow-dlg` |
| Tipografía | `--font-ui` (interfaz), `--font-text` (documento), `--font-mono` (código) |
| Sintaxis del código | `--hl-keyword`, `--hl-string`, `--hl-number`, `--hl-comment`, `--hl-function`, `--hl-type`, `--hl-prop`, `--hl-tag`, `--hl-operator`, `--hl-meta` |

Las fuentes y las imágenes de un skin se cargan con rutas relativas a su CSS. Los colores personalizados que elige el usuario (Vista > Personalizar colores) se aplican encima, por cada combinación de skin y modo.

## 7. Bloques de código y extensiones del editor

Un bloque ```` ``` ```` cuyo lenguaje tenga un renderizador se dibuja como contenido propio en el modo Lectura. Si el cursor entra en el bloque, o el usuario pulsa "Editar código", se ve el texto para poder editarlo. En el modo Código siempre se ve el texto.

```js
plumd.editor.registerBlockRenderer({
  language: 'barras',
  render(contenedor, texto, ctx) {
    contenedor.textContent = texto;          // dibuja aquí
    return {
      update(nuevoTexto) { /* repinta */ },  // opcional
      destroy() { /* limpia */ },            // opcional
    };
  },
});
```

`ctx` tiene `language`, `theme` y `skin` (siempre actuales), y `replaceSource(texto)`, que sustituye el contenido del bloque entre las vallas. Así un plugin que edite su propio contenido, como un dibujo, lo guarda dentro del `.md`. Si `render` lanza un error, el bloque muestra el mensaje en lugar de romper el documento.

Para extensiones del editor, `plumd.cm` ofrece las librerías de CodeMirror de PluMd: `state`, `view`, `language`, `commands`, `search`, `markdown` y `lezer`. Usa siempre esas, y no incluyas tu propia copia: dos copias distintas de CodeMirror no son compatibles entre sí.

```js
const { Decoration, ViewPlugin } = plumd.cm.view;
plumd.editor.registerExtension(ViewPlugin.fromClass(class { /* ... */ }));
```

## 8. Ajustes del plugin

Se declaran en el manifiesto y PluMd genera la pantalla (botón "Ajustes" en la lista de plugins):

```json
"settings": {
  "sangria": { "type": "boolean", "label": "Sangrar según el nivel", "default": true },
  "niveles": { "type": "choice", "label": "Niveles", "options": ["2", "3", "6"], "default": "6" },
  "titulo":  { "type": "string", "label": "Título", "default": "" },
  "maximo":  { "type": "number", "label": "Máximo", "default": 10 }
}
```

Las opciones de `choice` pueden ser textos o `{ "value", "label" }`.

## 9. Errores, fallos y modo seguro

- Los errores de un plugin se atribuyen a ese plugin y no rompen la aplicación. Se avisa en pantalla y quedan en la consola de desarrollo.
- Un plugin que falla tres veces se desactiva solo. Se puede volver a activar desde la pantalla de plugins, y eso reinicia el contador.
- Si PluMd se cierra o se bloquea mientras carga los plugins, el siguiente arranque entra en modo seguro: no carga ninguno y lo avisa.
- Para forzar el modo seguro, arranca con `--sin-plugins`. En modo seguro no se puede activar ningún plugin hasta reiniciar.

## 10. Publicar tu plugin

Por ahora, publícalo en tu propio repositorio de GitHub y ofrece la carpeta (o un `.zip` con ella) como descarga. Quien lo use la copia a la carpeta de plugins o usa "Instalar desde carpeta". Un catálogo común está previsto para más adelante.

Incluye en el repositorio una licencia, una descripción de lo que hace y qué permisos declara.

## 11. Seguridad

Un plugin activado se ejecuta dentro de la ventana de PluMd con los mismos permisos que la aplicación. El campo `permissions` informa al usuario de lo que el plugin dice hacer, pero no lo impide: un plugin que se salte la API puede leer y escribir ficheros. Las funciones de `plumd.fs` aplican límites (carpeta abierta, no sobrescribir), pero solo valen para quien las use.

Por eso:

- Activa solo plugins de gente en la que confíes, y lee su código antes si puedes.
- Escribe plugins sin dependencias que no hagas visibles, y declara en `permissions` lo que usas.
- La política de seguridad de la ventana bloquea `fetch`, `XMLHttpRequest`, `WebSocket` y los scripts que no sean de PluMd o del propio plugin. Pero permite cargar imágenes por https, porque el visor las necesita, así que no es una barrera real contra un plugin malicioso que quiera enviar datos fuera.

## 12. Fuera de esta versión

Estas ideas están previstas pero todavía no existen:

- Activación por `onLanguage` y `onFileType`. Hoy solo hay `onStartup` y `onCommand`.
- Tipos de fichero y pestañas con editor propio (por ejemplo, abrir un `.excalidraw`).
- Procesos propios con Node, para servidores o conexiones MCP.
- Plugins aislados en un contenedor, con permisos reales.
- Pestañas, paneles y botones de cinta declarados en el manifiesto (hoy se hacen desde código).
- Instalación desde un `.zip`, desinstalación desde la aplicación y catálogo de plugins.
- Atajos de teclado definidos por plugins y menú contextual del editor.
