PluMd 0.4.0: first release with Linux packages, experimental and community-supported.

The interface is in Spanish; menu names are given as they appear in the app, with their meaning in brackets. [Versión en español: ver `README.es.md`.]

## Download

Windows (main platform):

- `PluMd-Setup-0.4.0.exe`: installer. Lets you choose the folder, adds a Start menu shortcut and registers `.md` files so they open with a double click.
- `PluMd-portable-0.4.0.exe`: no installation needed. Download it and run it with a double click.

Linux (experimental, community-supported):

- `PluMd-0.4.0-amd64.deb`: primary format for Debian and Ubuntu, with desktop integration for Markdown files.
- `PluMd-0.4.0-x86_64.AppImage`: portable alternative. It needs executable permissions (`chmod +x PluMd-*.AppImage`) and FUSE 2. Use the `.deb` if FUSE is unavailable.

`SHA256SUMS.txt` has the checksums of every file in the release. GitHub builds them from the code in this repository. The Linux packages are published only if the Linux build succeeds; a Linux build failure does not block the Windows files.

## Before running it

- None of the files are signed yet. Windows SmartScreen may show "Windows protected your PC": click "More info" and then "Run anyway".
- The portable version does not register `.md` files. To open them with a double click, use "Open with" on a `.md` file once and choose PluMd, or use the installer.
- On Ubuntu 24.04 and later, AppArmor may stop the AppImage from starting, because it restricts the user namespaces that Electron's sandbox needs. Follow the application-specific profile guidance in the README; do not disable the Electron sandbox or the global AppArmor restrictions.
- This is a work-in-progress version (0.4.0): there is no MCP connection or plugin catalogue yet.

## New in 0.4.0

- Linux port, contributed by @mjuliac and tested on KDE and Ubuntu by @alonsomaniaco:
  - Paths, images and drawings follow the rules of each system: case sensitivity on Linux, backslash separators and UNC paths on Windows.
  - Local documents go to the desktop Trash. If sending a document to the Trash fails, it is not deleted.
  - Network filesystems (NFS, SMB/CIFS, sshfs, GVFS, WebDAV, rclone and others) are detected from `/proc/mounts`. Deleting a document there needs an explicit confirmation and is permanent. If the mount cannot be determined, deletion is blocked.
  - Deleting folders from PluMd is not available on Linux; use the file manager.
  - The `.deb` registers `.md` and `.markdown` files with the desktop. The interface fonts fall back to Cantarell, Ubuntu, Noto Sans and DejaVu Sans Mono when Segoe UI or Cascadia Code are missing.
  - The workflow builds and tests both platforms on every Pull Request. The port was checked on Windows with the automated tests and a manual test before release.
- Thanks to both for the work and for the patience through the review rounds.

## Changes in 0.3.0

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
