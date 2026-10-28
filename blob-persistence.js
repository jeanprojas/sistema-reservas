// VIP Norte - durable persistence adapter for Vercel.
// This is intentionally additive: it preserves the existing Express/API/UI
// and replaces the non-durable Mongo fallback with Vercel Blob-backed models
// when MONGO_URI is not configured. Each record is stored as its own private
// JSON object, avoiding a single shared JSON file and reducing write races.

const mongoose = require('mongoose');
const { put, get, list, del } = require('@vercel/blob');

const PREFIX = 'sistema-reservas-db';
const ACCESS = 'private';

function collectionFor(modelName) {
    if (modelName === 'Reserva') return 'reservas';
    if (modelName === 'Usuario') return 'usuarios';
    if (modelName === 'ConfiguracionIndex') return 'configuracion';
    return String(modelName).toLowerCase();
}

function idFor(modelName, doc) {
    if (modelName === 'ConfiguracionIndex') return String(doc.clave || 'global');
    return String(doc.id || doc._id || '');
}

function pathFor(modelName, id) {
    return `${PREFIX}/${collectionFor(modelName)}/${encodeURIComponent(String(id))}.json`;
}

async function readJson(pathname) {
    const result = await get(pathname, { access: ACCESS, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return text ? JSON.parse(text) : null;
}

async function writeJson(pathname, value, etag) {
    const options = {
        access: ACCESS,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0
    };
    if (etag) options.ifMatch = etag;
    return put(pathname, JSON.stringify(value), options);
}

async function listCollection(modelName) {
    const prefix = `${PREFIX}/${collectionFor(modelName)}/`;
    let cursor;
    const blobs = [];
    do {
        const result = await list({ prefix, limit: 1000, cursor });
        blobs.push(...(result.blobs || []));
        cursor = result.cursor;
    } while (cursor);

    const docs = new Array(blobs.length);
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
    return docs.filter(Boolean);
}

function valueAt(doc, key) {
    return key.split('.').reduce((value, part) => value == null ? undefined : value[part], doc);
}

function matchesCondition(value, condition, doc) {
    if (condition instanceof RegExp) return condition.test(String(value ?? ''));
    if (condition == null) return value == null;
    if (typeof condition !== 'object' || Array.isArray(condition)) return String(value) === String(condition);

    if ('$regex' in condition) {
        const flags = condition.$options || '';
        const regex = new RegExp(String(condition.$regex), flags);
        return regex.test(String(value ?? ''));
    }
    if ('$exists' in condition) return condition.$exists ? value !== undefined : value === undefined;
    if ('$lte' in condition && !(value <= condition.$lte)) return false;
    if ('$lt' in condition && !(value < condition.$lt)) return false;
    if ('$gte' in condition && !(value >= condition.$gte)) return false;
    if ('$gt' in condition && !(value > condition.$gt)) return false;
    if ('$ne' in condition && String(value) === String(condition.$ne)) return false;
    if ('$in' in condition && !condition.$in.some(item => String(item) === String(value))) return false;
    return true;
}

function matches(doc, filter = {}) {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (Array.isArray(filter.$or) && !filter.$or.some(item => matches(doc, item))) return false;
    if (Array.isArray(filter.$and) && !filter.$and.every(item => matches(doc, item))) return false;

    for (const [key, condition] of Object.entries(filter)) {
        if (key === '$or' || key === '$and') continue;
        const value = valueAt(doc, key);
        if (!matchesCondition(value, condition, doc)) return false;
    }
    return true;
}

function applyUpdate(doc, update) {
    if (!update || typeof update !== 'object') return doc;
    const direct = Object.keys(update).some(key => !key.startsWith('$'));
    if (direct) {
        for (const [key, value] of Object.entries(update)) {
            if (key.startsWith('$')) continue;
            doc[key] = value;
        }
    }
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
        for (const [key, amount] of Object.entries(update.$inc)) {
            doc[key] = Number(doc[key] || 0) + Number(amount || 0);
        }
    }
    if (update.$unset) {
        for (const key of Object.keys(update.$unset)) delete doc[key];
    }
    return doc;
}

function makeDocument(model, raw) {
    const doc = { ...raw };
    doc.toObject = () => ({ ...doc, toObject: undefined, save: undefined });
    doc.save = async () => {
        const id = idFor(model.modelName, doc);
        if (!id) throw new Error(`VIP Norte Blob: ${model.modelName} requiere un identificador.`);
        const pathname = pathFor(model.modelName, id);
        const current = await get(pathname, { access: ACCESS, useCache: false });
        const etag = current?.blob?.etag;
        await writeJson(pathname, sanitize(doc), etag);
        return doc;
    };
    return doc;
}

function sanitize(doc) {
    const out = {};
    for (const [key, value] of Object.entries(doc || {})) {
        if (key === 'save' || key === 'toObject') continue;
        if (value instanceof Date) out[key] = value;
        else out[key] = value;
    }
    return out;
}

function applySchemaDefaults(schema, data) {
    const out = { ...data };
    if (schema?.paths) {
        for (const [key, path] of Object.entries(schema.paths)) {
            if (key === '_id' || key === '__v') continue;
            if (out[key] !== undefined) continue;
            if (typeof path.defaultValue === 'function') {
                try { out[key] = path.defaultValue(); } catch (_) {}
            } else if (path.defaultValue !== undefined) {
                out[key] = path.defaultValue;
            }
        }
    }
    return out;
}

class BlobModel {
    constructor(data = {}, schema, modelName) {
        this.modelName = modelName;
        this.schema = schema;
        const normalized = applySchemaDefaults(schema, data);
        Object.assign(this, makeDocument(this, normalized));
    }

    static async _all() { return listCollection(this.modelName); }

    static find(filter = {}) {
        const Model = this;
        let sortSpec = null;
        let limitValue = null;
        const query = {
            sort(spec) { sortSpec = spec; return query; },
            limit(value) { limitValue = Number(value); return query; },
            async then(resolve, reject) {
                try {
                    let rows = (await Model._all()).filter(row => matches(row, filter));
                    if (sortSpec) {
                        const entries = Object.entries(sortSpec);
                        rows.sort((a, b) => {
                            for (const [key, direction] of entries) {
                                const av = valueAt(a, key);
                                const bv = valueAt(b, key);
                                if (av === bv) continue;
                                if (av == null) return direction > 0 ? -1 : 1;
                                if (bv == null) return direction > 0 ? 1 : -1;
                                return (av > bv ? 1 : -1) * (direction > 0 ? 1 : -1);
                            }
                            return 0;
                        });
                    }
                    if (limitValue != null) rows = rows.slice(0, limitValue);
                    const docs = rows.map(row => makeDocument(Model, row));
                    resolve(docs);
                } catch (error) { reject(error); }
            }
        };
        return query;
    }

    static async findOne(filter = {}) {
        const row = (await this._all()).find(item => matches(item, filter));
        return row ? makeDocument(this, row) : null;
    }

    static async countDocuments(filter = {}) {
        return (await this._all()).filter(item => matches(item, filter)).length;
    }

    static async updateOne(filter, update, options = {}) {
        const Model = this;
        const rows = await Model._all();
        let row = rows.find(item => matches(item, filter));
        if (!row && options.upsert) {
            row = {};
            for (const [key, value] of Object.entries(filter || {})) {
                if (!key.startsWith('$') && !(value && typeof value === 'object')) row[key] = value;
            }
            row = applySchemaDefaults(Model.schema, row);
            applyUpdate(row, update);
            await writeJson(pathFor(Model.modelName, idFor(Model.modelName, row)), sanitize(row));
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        if (!row) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        applyUpdate(row, update);
        const pathname = pathFor(Model.modelName, idFor(Model.modelName, row));
        const current = await get(pathname, { access: ACCESS, useCache: false });
        await writeJson(pathname, sanitize(row), current?.blob?.etag);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }

    static async findOneAndUpdate(filter, update, options = {}) {
        const Model = this;
        let row = await Model.findOne(filter);
        if (!row && options.upsert) {
            const seed = {};
            for (const [key, value] of Object.entries(filter || {})) {
                if (!key.startsWith('$') && !(value && typeof value === 'object')) seed[key] = value;
            }
            row = new Model(seed);
        }
        if (!row) return null;
        applyUpdate(row, update);
        await row.save();
        return row;
    }

    static async findOneAndDelete(filter = {}) {
        const row = await this.findOne(filter);
        if (!row) return null;
        const pathname = pathFor(this.modelName, idFor(this.modelName, row));
        const current = await get(pathname, { access: ACCESS, useCache: false });
        if (current?.blob?.url) await del(current.blob.url);
        return row;
    }
}

function createModel(modelName, schema) {
    class Model extends BlobModel {
        constructor(data) { super(data, schema, modelName); }
    }
    Model.modelName = modelName;
    Model.schema = schema;
    return Model;
}

// Only activate the adapter when MongoDB is not explicitly configured.
// If MONGO_URI exists, the existing Mongoose/Atlas path remains untouched.
if (!process.env.MONGO_URI && process.env.BLOB_READ_WRITE_TOKEN) {
    const originalModel = mongoose.model.bind(mongoose);
    const originalConnect = mongoose.connect.bind(mongoose);

    mongoose.connect = async function durableBlobConnect() {
        // Tell the existing application that its database connection is ready,
        // so it uses its normal database-backed code paths instead of memoryDb.
        mongoose.connection.readyState = 1;
        return mongoose;
    };

    mongoose.model = function durableBlobModel(name, schema) {
        if (['Reserva', 'Usuario', 'ConfiguracionIndex'].includes(name)) {
            return createModel(name, schema);
        }
        return originalModel(name, schema);
    };

    console.log('VIP Norte: persistencia durable Vercel Blob activada (sin MONGO_URI).');
}
