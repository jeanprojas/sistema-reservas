from pathlib import Path

# 1) Read Blob objects concurrently instead of one-by-one.
path = Path('blob-persistence.js')
text = path.read_text(encoding='utf-8')
old = '''    const docs = [];
    for (const blob of blobs) {
        try {
            const doc = await readJson(blob.pathname);
            if (doc) docs.push(doc);
        } catch (error) {
            console.warn(`VIP Norte Blob: no se pudo leer ${blob.pathname}:`, error.message);
        }
    }
    return docs;'''
new = '''    const docs = new Array(blobs.length);
    let readCursor = 0;
    const concurrency = Math.min(20, Math.max(1, blobs.length));
    async function worker() {
        while (true) {
            const index = readCursor++;
            if (index >= blobs.length) return;
            const blob = blobs[index];
            try {
                const doc = await readJson(blob.pathname);
                if (doc) docs[index] = doc;
            } catch (error) {
                console.warn(`VIP Norte Blob: no se pudo leer ${blob.pathname}:`, error.message);
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return docs.filter(Boolean);'''
if old not in text:
    raise SystemExit('No se encontró el bloque secuencial de Blob.')
path.write_text(text.replace(old, new, 1), encoding='utf-8')

# 2) Fix history sync: BlobModel.find() is thenable and does not return a Promise,
# so chaining .then() after it produced undefined and synchronized zero rows.
path = Path('server.js')
text = path.read_text(encoding='utf-8')
old = "const reservas = await Reserva.find({}).then(rows => rows.map(row => row.toObject ? row.toObject() : row));"
new = "const filasReservas = await Reserva.find({});\n        const reservas = filasReservas.map(row => row.toObject ? row.toObject() : row);"
if old not in text:
    raise SystemExit('No se encontró la línea defectuosa del historial.')
text = text.replace(old, new, 1)

# 3) Read the synchronization status snapshot once instead of scanning Blob three times.
start = text.index("app.get('/api/admin/sincronizar-sheets/estado'")
end = text.index("\n});", start) + len("\n});")
block = '''app.get('/api/admin/sincronizar-sheets/estado', async (req, res) => {
    try {
        if (isMemoryMode()) {
            return res.json({
                success: true,
                pendientes: reservasEnColaGoogleMemoria.size,
                total: memoryDb.reservas.length,
                conErrores: [...reservasEnColaGoogleMemoria.values()].filter(item => Number(item.intentos || 0) > 0).length
            });
        }
        const filas = await Reserva.find({});
        const total = filas.length;
        const pendientes = filas.filter(r => r.sheetsSyncPending === true).length;
        const conErrores = filas.filter(r => r.sheetsSyncPending === true && Number(r.sheetsSyncAttempts || 0) > 0).length;
        res.json({ success: true, pendientes, total, conErrores });
    } catch (e) {
        res.status(500).json({ success: false, mensaje: 'No se pudo consultar el estado de sincronización.' });
    }
});'''
text = text[:start] + block + text[end:]
path.write_text(text, encoding='utf-8')
