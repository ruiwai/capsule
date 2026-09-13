// SYNTHETIC fixture. Registered by operator setup, never by a task.
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2];
const marker = path.join(process.cwd(), 'effects');
fs.appendFileSync(marker, 'x');
if (mode === 'command-fail') { console.log(JSON.stringify({ certified: false, complete: false })); process.exitCode = 7; }
else if (mode === 'fail') console.log(JSON.stringify({ certified: false, complete: false }));
else if (mode === 'null') console.log(JSON.stringify({ certified: null, complete: null }));
else if (mode === 'recover') console.log(JSON.stringify({ certified: fs.readFileSync(marker).length > 1, complete: true }));
else if (mode === 'slow') setTimeout(() => console.log(JSON.stringify({ certified: true, complete: true })), 300);
else console.log(JSON.stringify({ certified: true, complete: true }));
