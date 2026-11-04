# Contributing

Thanks for your interest in PluMd. Bug reports, ideas and code changes are welcome, in English or Spanish (se aceptan también en español).

## Reporting a bug or suggesting an improvement

Open an Issue on GitHub. Say what you were doing, what you expected to happen and what happened. If the problem involves a specific `.md` file, attach a minimal example that reproduces it (without private data).

## Proposing a code change (Pull Request)

1. Fork the repository and clone it.
2. Create a branch for your change, for example `table-improvement`.
3. Install and run the app:

   ```bash
   npm install
   npm start
   ```

4. Make the change. Follow the style of the existing code: same naming, same amount of comments. Code comments are in Spanish; write new ones in Spanish if you can, otherwise in English.
5. Check that the app starts and that what you changed works, and run `npm test`: the tests also run on every Pull Request. If you change editor behaviour, test both the Lectura [Reading] and Código [Code] views.
6. Open a Pull Request describing what changes and why. A small, focused change is reviewed sooner than a large one.

The maintainer reviews every Pull Request before accepting it and may ask for changes.

## What not to include in a Pull Request

- Generated files: `node_modules/`, `dist/` and `release/` are excluded on purpose.
- Personal data, passwords, keys or paths from your computer.
- Code copied from other projects without stating its origin and licence.

## Licence

By submitting a change you agree that it is published under the project's MIT licence (see `LICENSE`).
