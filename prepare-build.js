// Vercel build preparation: inject the durable persistence adapter into the
// existing Express entrypoint without changing the repository's application
// logic or removing any existing routes/features.
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const marker = "require('./blob-persistence.js');";
if (!source.includes(marker)) {
    const anchor = "const fs = require('fs');";
    if (!source.includes(anchor)) {
        throw new Error('prepare-build: no se encontró el punto seguro de inyección en server.js');
    }
    source = source.replace(anchor, `${anchor}\n${marker}`);
    fs.writeFileSync(serverPath, source, 'utf8');
}
