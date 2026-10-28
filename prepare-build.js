// Vercel build preparation: inject the durable persistence adapter into the
// existing Express entrypoint without changing the existing application logic.
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const adapterMarker = "require('./blob-persistence.js');";
if (!source.includes(adapterMarker)) {
    const anchor = "const fs = require('fs');";
    if (!source.includes(anchor)) {
        throw new Error('prepare-build: no se encontró el punto seguro de inyección en server.js');
    }
    source = source.replace(anchor, `${anchor}\n${adapterMarker}`);
}

// Temporary, read/write verification route used only to prove that the exact
// Mongoose models now survive a Vercel instance replacement through Blob.
const testMarker = "// VIP_NORTE_PERSISTENCE_TEST_ROUTE";
if (!source.includes(testMarker)) {
    const modelAnchor = "const ConfiguracionIndex = mongoose.model('ConfiguracionIndex', configuracionSchema);";
    const testRoute = `${testMarker}\napp.get('/api/_persistence-test', async (req, res) => {\n    const testKey = '__vip_norte_persistence_test__';\n    try {\n        const before = await ConfiguracionIndex.findOne({ clave: testKey });\n        const now = new Date().toISOString();\n        await ConfiguracionIndex.updateOne({ clave: testKey }, { $set: { clave: testKey, whatsappTexto: now } }, { upsert: true });\n        const after = await ConfiguracionIndex.findOne({ clave: testKey });\n        await ConfiguracionIndex.findOneAndDelete({ clave: testKey });\n        res.json({ success: true, durable: Boolean(after && after.whatsappTexto === now), beforeExists: Boolean(before), roundTrip: after?.whatsappTexto || null });\n    } catch (error) {\n        console.error('VIP Norte persistence test failed:', error);\n        res.status(500).json({ success: false, durable: false, error: error.message });\n    }\n});`;
    if (!source.includes(modelAnchor)) {
        throw new Error('prepare-build: no se encontró el punto seguro para la prueba de persistencia');
    }
    source = source.replace(modelAnchor, `${modelAnchor}\n${testRoute}`);
}

fs.writeFileSync(serverPath, source, 'utf8');
