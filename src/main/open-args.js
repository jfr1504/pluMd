const fs = require('fs');
const { fileURLToPath } = require('url');
const { MD_RE } = require('./acceso');

function fileFromArgs(argv, isPackaged) {
  for (const arg of argv.slice(isPackaged ? 1 : 2)) {
    if (arg.startsWith('-')) continue;
    let file = arg;
    if (/^file:/i.test(arg)) {
      try {
        file = fileURLToPath(arg);
      } catch {
        continue;
      }
    }
    if (MD_RE.test(file) && fs.existsSync(file)) return file;
  }
  return null;
}

module.exports = { fileFromArgs };
