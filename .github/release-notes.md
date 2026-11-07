PluMd 0.3.0: Excalidraw drawings, and resizing and moving images.

The interface is in Spanish; menu names are given as they appear in the app, with their meaning in brackets. [Versión en español: ver `README.es.md`.]

## Download

- `PluMd-Setup-0.3.0.exe`: installer. Lets you choose the folder, adds a Start menu shortcut and registers `.md` files so they open with a double click.
- `PluMd-portable-0.3.0.exe`: no installation needed. Download it and run it with a double click.
- `SHA256SUMS.txt`: checksums of both `.exe` files. GitHub builds them from the code in this repository.

## Before running it

- Windows SmartScreen may show "Windows protected your PC", because the program is not signed yet. Click "More info" and then "Run anyway".
- The portable version does not register `.md` files. To open them with a double click, use "Open with" on a `.md` file once and choose PluMd, or use the installer.
- This is a work-in-progress version (0.3.0): there is no MCP connection or plugin catalogue yet.

## New in 0.3.0

- Drawings with Excalidraw, contributed by @Ohkuninush (Archivo > Nuevo dibujo [File > New drawing]):
  - A drawing is a `.excalidraw.md` note in the same format as the Excalidraw plugin for Obsidian, so each program can open the other's files.
  - A new drawing is created straight away in your Downloads folder (changeable in the Dibujo [Drawing] tab) and is saved automatically a moment after each change.
  - The Dibujo tab has full screen (F11), grid, zen and read-only modes, fit to content, export to PNG or SVG, and inserting the drawing into the open note as an image in `imagenes/`.
  - The Excalidraw shape library (Biblioteca [Library]) is kept between sessions.
  - Excalidraw is loaded only when the first drawing is opened, so the editor starts as fast as before. The installer is about 2.5 MB larger than in 0.2.6 because it includes Excalidraw.
- Image size and position, also by @Ohkuninush: drag the handle at the bottom-right corner of an image to resize it (double-click it to restore the original size); the width is stored Obsidian-style in the description, `![text|300](path)`. Drag the image itself through the text to move it; Esc cancels.

## Earlier changes (0.2.1 to 0.2.6)

- Right-click menus in the editor, tables, tabs and folder panel (0.2.6, contributed by @Ohkuninush). Plugins can add entries to them (`contextMenu` targets `editor`, `editor-selection`, `editor-link`, `editor-image`, `editor-code`, `editor-table` and `tab`; see `docs/plugins/README.md`).
- Deleting a folder sends it to the Recycle Bin, and only if it is empty or holds nothing but `.md`, `.markdown` and `.txt` files (and subfolders with the same), on a fixed disk. Anything the panel does not show (other file types, hidden files, links) blocks the deletion, and the message says how many such files there are. Folders on network or removable drives are not deleted from PluMd.
- Copying an image or showing it in Explorer requires a saved document that PluMd is allowed to open.
- Documentation: the README is in English, with the Spanish version in `README.es.md`.

- Windows installer (NSIS) alongside the portable version.
- Tables: drag the header border to resize a column (double click to make them equal); the width is kept in the Markdown itself as dash counts in the delimiter row, the Pandoc convention. Cell text wraps instead of being cut.
- Tabs: all of them can be closed; with no documents open, a screen offers Nuevo [New] and Abrir [Open].
- Pasting images: Ctrl+V with a screenshot saves it as `imagenes/yymmdd_hhmm.png` next to the document and inserts the link. The document must be saved first.
- Folder panel: typing a path in the box and pressing Enter opens the folder dialog already placed there (for example `C:\Data` or `\\server\share`).
- Security: junctions and links leading outside the open folder are not listed or used; reading and saving only work on files chosen by the user or inside the open folder (plugins included); atomic saving with an error warning; remote images blocked until you click «Cargar» [Load].
- Deleting a file on a network drive is possible after a separate confirmation warning that it is permanent (there is no Recycle Bin). On local drives it goes to the Recycle Bin.
- Automated tests (`npm test`) on every Pull Request.

MIT licence.
