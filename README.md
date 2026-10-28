<p align="center"><img src="assets/logo.png" alt="PluMd logo" width="128"></p>

<p align="center">English | <a href="README.es.md">Español</a></p>

# PluMd

Markdown (`.md`) editor and viewer for Windows, with a Word-style ribbon. It is the first service of a platform of internal tools built around plugins.

The interface is in Spanish. Menu and button names below are given as they appear in the app, with their meaning in brackets.

<p align="center"><img src="docs/screenshots/plumd-oscuro.png" alt="PluMd with the folder panel, document tabs and the ribbon, in dark mode"></p>

## Download

Go to the [releases](https://github.com/jfr1504/pluMd/releases/latest) page and download `PluMd-Setup-X.Y.Z.exe` (installer, registers `.md` files) or `PluMd-portable-X.Y.Z.exe` (no installation, runs with a double click).

- Windows SmartScreen may show "Windows protected your PC", because the program is not signed yet. Click "More info" and then "Run anyway".
- Each release includes `SHA256SUMS.txt` to check that the downloaded file is the published one. GitHub builds the `.exe` files from the code in this repository.
- The portable version does not register `.md` files by itself. To open them with a double click, use "Open with" on a `.md` file once and choose PluMd, or use the installer.

## Features

- Opens a single `.md` file (double click, Abrir [Open] button or Ctrl+O). No working folder needed.
- Two views: Lectura [Reading], a clean editable document without Markdown symbols, and Código [Code], the raw Markdown. Ctrl+E switches between them.
- Full-width ribbon with the Inicio [Home], Insertar [Insert], Vista [View] and Ayuda [Help] tabs: heading styles, bold, italic, underline, lists, tasks, editable tables (drag the header border to resize a column; text wraps inside the cell), images, links (to web pages or to folders, including network shares), code blocks with highlighting, search and zoom. Typing `/` in the editor opens a command menu to insert headings, lists, tables and more.
- Pasting images: Ctrl+V with a screenshot on the clipboard saves it as `imagenes/yymmdd_hhmm.png` next to the document and inserts the link. The document must be saved first. Remote images (https) are not loaded until you click «Cargar» [Load] on each one.
- Several documents at once in tabs. Open them with Abrir, with a double click or by dragging `.md` files onto the window. All tabs can be closed; with no documents open, a screen offers Nuevo [New] and Abrir.
- Folder panel on the left, open by default (close it with the cross and reopen it from Vista; open a folder with Archivo > Abrir carpeta [File > Open folder] or by dragging it in). It shows `.md`, `.markdown` and `.txt` files, opens them in a tab with one click and remembers the last folder. Typing a path (`C:\Data` or `\\server\share`) in the panel box and pressing Enter opens the folder dialog already placed there. Right click offers new document, new folder, rename, copy, duplicate, paste, copy path or name, and delete. Delete sends the file to the Recycle Bin after a confirmation; network drives have no Recycle Bin, so a separate confirmation is required and the deletion is permanent. A folder can only be deleted if it is empty or holds nothing but `.md`, `.markdown` and `.txt` files (and subfolders with the same), and only on a fixed disk; it goes to the Recycle Bin after a confirmation. Anything else, hidden files included, must be deleted from Windows Explorer. Nothing is overwritten and nothing is touched outside the open folder.
- Headings can be collapsed with the arrow on their left, as in Obsidian.
- Right-click menus: in the editor (cut, copy, paste, formatting, convert to heading, list or quote), on links, images, tables (insert and delete rows and columns, align), code blocks (copy, change language) and headings (collapse the section); on the tabs (close, copy path); and in the folder panel.
- Three looks (PluMd, Windows and Mac), each in light and dark mode (Vista > Aspecto [View > Look]). They change the appearance only, not the layout. Skins are CSS sheets with a registry (`src/renderer/skins.js`), so future plugins can add their own.
- Custom colours for headings, bold, text, links and more (Vista > Personalizar colores [View > Custom colours]).
- Plugins can add looks, ribbon buttons and groups, commands (with a palette, Ctrl+Shift+P), side panels, code blocks with their own content, editor extensions and settings. They are managed in Ayuda > Administrar plugins [Help > Manage plugins]. The guide for writing one is in [docs/plugins/README.md](docs/plugins/README.md) (in Spanish) and there are examples in [plugins-ejemplo/](plugins-ejemplo/).
- It only touches your files when you ask: when saving, when pasting an image (it creates `imagenes/`), or when creating, renaming, copying or deleting from the panel. It warns if a file changed on disk since it was opened and does not overwrite it without asking.

## Screenshots

| Windows, light mode | Mac, dark mode |
| --- | --- |
| <img src="docs/screenshots/windows-claro.png" alt="Windows look in light mode"> | <img src="docs/screenshots/mac-oscuro.png" alt="Mac look in dark mode"> |

The documents in the screenshots are fictitious.

## Development

Requirements: Node.js 24 or later.

```bash
npm install
npm start          # builds and opens the app
npm test           # tests for file access, image pasting and the table model
npm run dist       # builds the installer and the portable version in release/
```

## Structure

- `src/main/`: Electron main process (window, files, clipboard). `acceso.js` handles real paths, authorized access and atomic writes; `fsops.js` the folder panel operations.
- `src/renderer/`: interface (CodeMirror 6 editor, ribbon, tables, images, dialogs, folder panel, skins).
- `src/renderer/plugins/` and `src/main/plugins.js`: plugin system (registries, API, loader, plugin screen).
- `plugins-ejemplo/` and `docs/`: example plugins and documentation.
- `tests/`: tests with `node:test`, also run on every Pull Request.
- `scripts/build.js`: renderer bundling with esbuild.
- `.github/workflows/`: builds the installer and the portable version on GitHub and publishes a release when a `vX.Y.Z` tag is created.

Code comments and some file names are in Spanish.

## Status

Work in progress. File operations always check the real path (links leading outside the open folder are not followed), only files the user chose or that are inside the open folder are read and saved, and saving is atomic. The installer and the portable version are not signed yet. The plugin system is in its first version (API 1). Pending: file types and tabs with their own editor for plugins, an MCP connection for agents and a plugin catalogue.

## Contributing

Pull Requests and Issues are welcome, in English or Spanish. The guidelines are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © 2026 Jorge Ferreira Rey

## Credits

- The Inter typeface used in the Mac look is by The Inter Project Authors, under the SIL Open Font License 1.1.
- Electron, CodeMirror and Lezer, under the MIT licence.
