from pathlib import Path

path = Path('blob-persistence.js')
text = path.read_text(encoding='utf-8')
marker = "    static async findOneAndUpdate(filter, update, options = {}) {"
if "    static async create(data)" not in text:
    insert = '''    static async create(data) {
        const doc = new BlobModel(data || {}, this);
        await doc.save();
        return doc;
    }

'''
    if marker not in text:
        raise SystemExit('No se encontró el punto de inserción de BlobModel.create.')
    text = text.replace(marker, insert + marker, 1)
    path.write_text(text, encoding='utf-8')
