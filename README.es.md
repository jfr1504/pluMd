<p align="center"><img src="assets/logo.png" alt="Logo de PluMd" width="128"></p>

<p align="center"><a href="README.md">English</a> | Español</p>

# PluMd

Editor y visor de ficheros Markdown (`.md`) para Windows, con cinta de opciones tipo Word. Pensado como primer servicio de una plataforma de herramientas internas con arquitectura de plugins.

<p align="center"><img src="docs/screenshots/plumd-oscuro.png" alt="PluMd con el panel de carpetas, pestañas de documentos y la cinta de opciones, en modo oscuro"></p>

## Descargar

Ve a la página de [versiones](https://github.com/jfr1504/pluMd/releases/latest) y descarga `PluMd-Setup-X.Y.Z.exe` (instalador, registra los `.md`) o `PluMd-portable-X.Y.Z.exe` (no necesita instalación: se ejecuta con doble clic).

- Windows SmartScreen puede mostrar "Windows protegió su PC", porque el programa aún no está firmado. Pulsa "Más información" y luego "Ejecutar de todos modos".
- Cada versión incluye `SHA256SUMS.txt` para comprobar que el fichero descargado es el publicado. El `.exe` lo compila GitHub a partir del código de este repositorio.
- El portable no registra por sí solo los `.md` como suyos. Para abrirlos con doble clic, usa "Abrir con" sobre un `.md` una vez y elige PluMd, o instala con el instalador.

## Qué hace

- Abre un fichero `.md` suelto (doble clic, botón Abrir o Ctrl+O). No necesita carpeta de trabajo.
- Dos vistas: Lectura (documento limpio y editable, sin símbolos Markdown) y Código (el Markdown tal cual). Ctrl+E alterna.
- Cinta de opciones a todo el ancho, con pestañas Inicio, Insertar, Vista y Ayuda: estilos de título, negrita, cursiva, subrayado, listas, tareas, tablas editables (el ancho de las columnas se ajusta arrastrando el borde de la cabecera y el texto se ajusta a la celda), imágenes, vínculos (a páginas web o a carpetas, incluidas las de red), bloques de código con resaltado, búsqueda y zoom. Al escribir `/` en el editor se abre un menú de comandos para insertar títulos, listas, tablas y más.
- Pegar imágenes: Ctrl+V con una captura en el portapapeles la guarda en `imagenes/aammdd_hhmm.png` junto al documento y deja el vínculo. El documento debe estar guardado. Las imágenes remotas (https) no se cargan hasta pulsar «Cargar» en cada una.
- Varios documentos a la vez en pestañas. Se abren con Abrir, con doble clic o arrastrando los `.md` sobre la ventana. Se pueden cerrar todas; sin documentos abiertos aparece una pantalla con Nuevo y Abrir.
- Panel de carpetas a la izquierda, abierto por defecto (se cierra con la cruz y se vuelve a abrir desde Vista) (Archivo > Abrir carpeta, o arrastrando una carpeta): muestra los `.md`, `.markdown` y `.txt`, se abren en pestaña con un clic y se recuerda la última carpeta. Escribir una ruta (`C:\Datos` o `\\servidor\recurso`) en la caja del panel y pulsar Intro abre el diálogo de carpeta ya situado en ella. Con el botón derecho: nuevo documento, nueva carpeta, renombrar, copiar, duplicar, pegar, copiar la ruta o el nombre y borrar. Borrar envía a la Papelera con confirmación; en unidades de red no hay Papelera, así que pide una confirmación aparte y el borrado es definitivo. Una carpeta solo se puede borrar si está vacía o contiene únicamente `.md`, `.markdown` y `.txt` (y subcarpetas con lo mismo), y solo en un disco fijo; va a la Papelera tras una confirmación. Cualquier otra cosa, ficheros ocultos incluidos, se borra desde el Explorador de Windows. Nada se sobrescribe y solo se actúa dentro de la carpeta abierta.
- Los títulos se pueden contraer con la flecha de su izquierda, como en Obsidian.
- Menús del botón derecho: en el editor (cortar, copiar, pegar, formato, convertir en título, lista o cita), sobre vínculos, imágenes, tablas (insertar y eliminar filas y columnas, alinear), bloques de código (copiar, cambiar el lenguaje) y títulos (contraer la sección); en las pestañas (cerrar, copiar ruta); y en el panel de carpetas.
- Tres aspectos (PluMd, Windows y Mac), cada uno en modo claro y oscuro (Vista > Aspecto). Solo cambian el aspecto, no la distribución. Los skins son hojas CSS con un registro (`src/renderer/skins.js`), pensado para que los futuros plugins añadan los suyos.
- Colores personalizables para títulos, negrita, texto, vínculos y más (Vista > Personalizar colores).
- Plugins: se pueden añadir aspectos, botones y grupos de cinta, comandos (con paleta Ctrl+Mayús+P), paneles laterales, bloques de código con contenido propio, extensiones del editor y ajustes. Se gestionan en Ayuda > Administrar plugins. Guía para escribir uno en [docs/plugins/README.md](docs/plugins/README.md) y ejemplos en [plugins-ejemplo/](plugins-ejemplo/).
- Solo toca tus ficheros cuando se lo pides: al guardar, al pegar una imagen (crea `imagenes/`), o al crear, renombrar, copiar o borrar desde el panel. Avisa si un fichero cambió en disco desde que se abrió y no lo sobrescribe sin preguntar.

## Capturas

| Windows, modo claro | Mac, modo oscuro |
| --- | --- |
| <img src="docs/screenshots/windows-claro.png" alt="Aspecto Windows en modo claro"> | <img src="docs/screenshots/mac-oscuro.png" alt="Aspecto Mac en modo oscuro"> |

Los documentos de las capturas son ficticios.

## Desarrollo

Requisitos: Node.js 24 o superior.

```bash
npm install
npm start          # compila y abre la aplicación
npm test           # pruebas del acceso a ficheros, el pegado de imágenes y el modelo de tablas
npm run dist       # genera el instalador y la versión portable en release/
```

## Estructura

- `src/main/`: proceso principal de Electron (ventana, ficheros, portapapeles). `acceso.js` guarda las rutas reales, los accesos autorizados y la escritura atómica; `fsops.js` las operaciones del panel de carpetas.
- `src/renderer/`: interfaz (editor CodeMirror 6, cinta, tablas, imágenes, diálogos, panel de carpetas, skins).
- `src/renderer/plugins/` y `src/main/plugins.js`: sistema de plugins (registros, API, cargador, pantalla de plugins).
- `plugins-ejemplo/` y `docs/`: plugins de ejemplo y documentación.
- `tests/`: pruebas con `node:test`, que se ejecutan también en cada Pull Request.
- `scripts/build.js`: empaquetado del renderer con esbuild.
- `.github/workflows/`: compilación del instalador y el portable en GitHub y publicación de versiones al crear una etiqueta `vX.Y.Z`.

## Estado

Versión de trabajo. Las operaciones con ficheros comprueban siempre la ruta real (sin seguir enlaces fuera de la carpeta abierta), solo se lee y guarda lo que el usuario eligió o está en la carpeta abierta, y el guardado es atómico. El instalador y el portable aún no están firmados. El sistema de plugins está en su primera versión (API 1). Pendiente: tipos de fichero y pestañas con editor propio para plugins, conexión MCP para agentes y un catálogo de plugins.

## Colaborar

Las propuestas de cambio (Pull Requests) y los avisos de errores (Issues) son bienvenidos, en español o en inglés. Las normas están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE) © 2026 Jorge Ferreira Rey

## Créditos

- La tipografía Inter del aspecto Mac es de The Inter Project Authors, bajo licencia SIL Open Font License 1.1.
- Electron, CodeMirror y Lezer, bajo licencia MIT.
