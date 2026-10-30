import { FIREBASE_CONFIG, DATA_KET_QUA_CANONICAL_HEADER } from '../db/constants.js';
import { normalizeDupValue } from '../utils/text.js';

const lastSyncedHashByType = new Map();
let fullDataKetQuaCache = null;
let fullDataKetQuaCacheVersion = null;
let searchableDataKetQuaCache = null;
let searchableDataKetQuaCacheVersion = null;
const dataKetQuaDocCache = new Map();
const dataKetQuaPrSapCache = new Map();
const DATA_KET_QUA_QUERY_CACHE_MS = 15000;
const stableJsonStringify = (value) => {
    try { return JSON.stringify(value); } catch (e) { return ''; }
};
const fnv1a32 = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
};
const computeHash = (value) => fnv1a32(stableJsonStringify(value));
const encodeFirebasePath = (path) => String(path == null ? '' : path).split('/').map(s => encodeURIComponent(String(s))).join('/');
const firebaseBaseUrl = () => String(FIREBASE_CONFIG.databaseURL || '').replace(/\/+$/g, '');
const toFirebaseData = (type, data) => {
    if (type !== 'data_ket_qua' || !Array.isArray(data)) return data;
    return data.map(row => {
        const obj = {};
        DATA_KET_QUA_CANONICAL_HEADER.forEach((label, i) => {
            const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase();
            obj[key] = row[i] == null ? '' : row[i];
        });
        return obj;
    });
};

const fetchFirebaseVersion = async (type) => {
    const safeType = encodeFirebasePath(String(type || ''));
    const base = firebaseBaseUrl();
    const versionUrl = `${base}/${safeType}_version.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
    const response = await fetch(versionUrl);
    if (!response.ok) return null;
    const version = await response.json();
    return {
        version: version?.version || 0,
        timestamp: version?.timestamp || '',
        hash: version?.hash || '',
        nextKey: Number.isInteger(version?.nextKey) ? version.nextKey : null,
        count: Number.isInteger(version?.count) ? version.count : null
    };
};

const fetchFirebaseData = async (type, version) => {
    const safeType = encodeFirebasePath(String(type || ''));
    const base = firebaseBaseUrl();
    const url = `${base}/${safeType}.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;

    let rows = data;
    if (type === 'data_ket_qua' && Array.isArray(data)) {
        rows = data.map(obj => {
            const row = new Array(DATA_KET_QUA_CANONICAL_HEADER.length).fill('');
            DATA_KET_QUA_CANONICAL_HEADER.forEach((label, i) => {
                const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase();
                row[i] = obj[key] || '';
            });
            return row;
        });
    }

    return { rows, ...version };
};

const firebaseUrl = (path, params = {}) => {
    const base = firebaseBaseUrl();
    const query = new URLSearchParams();
    if (FIREBASE_CONFIG.apiKey) query.set('auth', FIREBASE_CONFIG.apiKey);
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    return `${base}/${encodeFirebasePath(path)}.json?${query.toString()}`;
};

const requestFirebaseJson = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Firebase request failed (${response.status}): ${details || response.statusText}`);
    }
    if (response.status === 204) return null;
    return await response.json();
};

const rowFromFirebaseObject = (value) => {
    const row = new Array(DATA_KET_QUA_CANONICAL_HEADER.length).fill('');
    if (!value || typeof value !== 'object') return row;
    DATA_KET_QUA_CANONICAL_HEADER.forEach((label, i) => {
        const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase();
        row[i] = value[key] == null ? '' : value[key];
    });
    return row;
};

const getNextDataKetQuaKey = async (version) => {
    if (Number.isInteger(version?.nextKey) && version.nextKey >= 0) return version.nextKey;
    const last = await requestFirebaseJson(firebaseUrl('data_ket_qua', { orderBy: '"$key"', limitToLast: 1 }));
    if (!last || typeof last !== 'object') return 0;
    const key = Object.keys(last).sort((a, b) => Number(a) - Number(b)).pop();
    return key != null && /^\d+$/.test(key) ? Number(key) + 1 : 0;
};

export const fetchDataKetQuaPage = async ({ page = 1, pageSize = 250, startKey = 1 } = {}) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageSize = Math.min(1000, Math.max(1, Math.floor(Number(pageSize) || 250)));
    const version = await fetchFirebaseVersion('data_ket_qua');
    const nextKey = await getNextDataKetQuaKey(version);
    const totalRows = Math.max(0, Number.isInteger(version?.count) ? version.count : nextKey - 1);
    const safeStartKey = Math.max(1, Math.floor(Number(startKey) || 1));
    const data = await requestFirebaseJson(firebaseUrl('data_ket_qua', {
        orderBy: '"$key"',
        startAt: JSON.stringify(String(safeStartKey)),
        limitToFirst: safePageSize
    }));
    const entries = data && typeof data === 'object' ? Object.entries(data) : [];
    entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    const lastKey = entries.length > 0 ? Number(entries[entries.length - 1][0]) : safeStartKey - 1;
    return {
        rows: [DATA_KET_QUA_CANONICAL_HEADER, ...entries.map(([, value]) => rowFromFirebaseObject(value))],
        keys: entries.map(([key]) => key),
        totalRows,
        page: safePage,
        pageSize: safePageSize,
        nextStartKey: Number.isFinite(lastKey) ? lastKey + 1 : safeStartKey,
        hasMore: entries.length === safePageSize
    };
};

export const searchDataKetQuaOnFirebase = async (query) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const tokens = String(query == null ? '' : query)
        .trim()
        .toUpperCase()
        .split(/[\s,;]+/)
        .filter(Boolean);
    if (tokens.length === 0) return [];

    const version = await fetchFirebaseVersion('data_ket_qua');
    if (!version) throw new Error('Không đọc được metadata data_ket_qua trên Firebase.');
    if (!searchableDataKetQuaCache || version.version !== searchableDataKetQuaCacheVersion) {
        const data = await requestFirebaseJson(firebaseUrl('data_ket_qua'));
        const entries = data && typeof data === 'object' ? Object.entries(data) : [];
        searchableDataKetQuaCache = entries
            .filter(([key]) => /^\d+$/.test(key) && key !== '0')
            .map(([key, value]) => ({ key, row: rowFromFirebaseObject(value) }));
        searchableDataKetQuaCacheVersion = version.version;
    }

    return searchableDataKetQuaCache.filter(({ row }) => {
        const searchableText = row.map(value => String(value == null ? '' : value)).join(' ').toUpperCase();
        return tokens.some(token => searchableText.includes(token));
    });
};

export const fetchDataKetQuaRowsByDoc = async (doc) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const value = String(doc == null ? '' : doc).trim();
    if (!value || value === '-') return [];
    const normalized = normalizeDupValue(value);
    const cached = dataKetQuaDocCache.get(normalized);
    if (cached && Date.now() - cached.timestamp < DATA_KET_QUA_QUERY_CACHE_MS) return cached.records;
    // Firebase rules should index both queried fields to keep these lookups efficient.
    const variants = Array.from(new Set([value, value.toUpperCase(), value.toLowerCase()]));
    const results = await Promise.all(variants.map(variant => requestFirebaseJson(firebaseUrl('data_ket_qua', {
        orderBy: '"so_tai_lieu"',
        equalTo: JSON.stringify(variant)
    }))));
    const recordsByKey = new Map();
    for (const data of results) {
        if (!data || typeof data !== 'object') continue;
        for (const [key, record] of Object.entries(data)) {
            if (!/^\d+$/.test(key) || key === '0') continue;
            const row = rowFromFirebaseObject(record);
            if (normalizeDupValue(row[0]) === normalized) recordsByKey.set(key, { key, row });
        }
    }
    const records = Array.from(recordsByKey.values());
    dataKetQuaDocCache.set(normalized, { timestamp: Date.now(), records });
    return records;
};

export const fetchDataKetQuaRowsByPrSap = async (prSap) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const value = String(prSap == null ? '' : prSap).trim();
    if (!value) return [];
    const normalized = normalizeDupValue(value);
    const cached = dataKetQuaPrSapCache.get(normalized);
    if (cached && Date.now() - cached.timestamp < DATA_KET_QUA_QUERY_CACHE_MS) return cached.records;
    const variants = Array.from(new Set([value, value.toUpperCase(), value.toLowerCase()]));
    const results = await Promise.all(variants.map(variant => requestFirebaseJson(firebaseUrl('data_ket_qua', {
        orderBy: '"pr_sap"',
        equalTo: JSON.stringify(variant)
    }))));
    const recordsByKey = new Map();
    for (const data of results) {
        if (!data || typeof data !== 'object') continue;
        for (const [key, record] of Object.entries(data)) {
            if (!/^\d+$/.test(key) || key === '0') continue;
            const row = rowFromFirebaseObject(record);
            if (normalizeDupValue(row[2]) === normalized) recordsByKey.set(key, { key, row });
        }
    }
    const records = Array.from(recordsByKey.values());
    dataKetQuaPrSapCache.set(normalized, { timestamp: Date.now(), records });
    return records;
};

const getDataKetQuaKeysByDupKeys = async (dupKeys, rawDocs = []) => {
    const keyList = dupKeys instanceof Set ? Array.from(dupKeys) : Array.isArray(dupKeys) ? dupKeys : [dupKeys];
    const keys = Array.from(new Set(keyList.map(key => String(key || '')).filter(Boolean)));
    if (keys.length === 0) return [];
    const docKeys = new Set([
        ...Array.from(rawDocs || []).map(doc => String(doc || '').trim()).filter(Boolean),
        ...keys.map(key => key.split('||')[0]).filter(Boolean)
    ]);
    const updates = {};
    for (const doc of docKeys) {
        const records = await fetchDataKetQuaRowsByDoc(doc);
        for (const { key, row } of records) {
            const dupKey = [
                normalizeDupValue(row[0]),
                normalizeDupValue(row[5]),
                normalizeDupValue(row[7]),
                normalizeDupValue(row[8])
            ].join('||');
            if (keys.includes(dupKey)) updates[key] = null;
        }
    }
    return Object.keys(updates);
};

export const updateDataKetQuaStatusesByCancelKeys = async (cancelKeys, statusText) => {
    const keys = cancelKeys instanceof Set ? Array.from(cancelKeys) : Array.isArray(cancelKeys) ? cancelKeys : [cancelKeys];
    const keySet = new Set(keys.map(key => String(key || '')).filter(Boolean));
    if (keySet.size === 0) return 0;
    const prSaps = new Set(Array.from(keySet, key => key.split('||')[0]).filter(Boolean));
    const updates = {};
    for (const prSap of prSaps) {
        const records = await fetchDataKetQuaRowsByPrSap(prSap);
        for (const { key, row } of records) {
            const normQty = (value) => normalizeDupValue(value).replace(/[,\s]+/g, '');
            const cancelKey = `${normalizeDupValue(row[2])}||${normalizeDupValue(row[5])}||${normalizeDupValue(row[7])}||${normQty(row[8])}`;
            if (keySet.has(cancelKey)) {
                row[9] = String(statusText == null ? '' : statusText).trim();
                updates[key] = row;
            }
        }
    }
    const count = Object.keys(updates).length;
    if (count > 0) await updateDataKetQuaRowsOnFirebase(updates);
    return count;
};

export const appendDataKetQuaRowsToFirebase = async (rows, keysToDelete = []) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const cleanRows = Array.isArray(rows) ? rows.filter(row => Array.isArray(row) && row.length > 0) : [];
    if (cleanRows.length === 0) return 0;
    const version = await fetchFirebaseVersion('data_ket_qua');
    let nextKey = await getNextDataKetQuaKey(version);
    const updates = {};
    const validDeleteKeys = Array.from(new Set(Array.from(keysToDelete || []).map(String).filter(key => /^\d+$/.test(key))));
    for (const key of validDeleteKeys) updates[`data_ket_qua/${key}`] = null;
    if (nextKey === 0) {
        updates['data_ket_qua/0'] = toFirebaseData('data_ket_qua', [DATA_KET_QUA_CANONICAL_HEADER])[0];
        nextKey = 1;
    }
    const converted = toFirebaseData('data_ket_qua', cleanRows);
    converted.forEach((record, index) => { updates[`data_ket_qua/${nextKey + index}`] = record; });
    updates['data_ket_qua_version/nextKey'] = nextKey + converted.length;
    updates['data_ket_qua_version/count'] = Math.max(0, (Number.isInteger(version?.count) ? version.count : nextKey - 1) - validDeleteKeys.length + converted.length);
    updates['data_ket_qua_version/version'] = Date.now();
    updates['data_ket_qua_version/timestamp'] = new Date().toISOString();
    await requestFirebaseJson(firebaseUrl(''), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    fullDataKetQuaCache = null;
    fullDataKetQuaCacheVersion = null;
    searchableDataKetQuaCache = null;
    searchableDataKetQuaCacheVersion = null;
    dataKetQuaDocCache.clear();
    dataKetQuaPrSapCache.clear();
    return converted.length;
};

export const overwriteDataKetQuaRowsOnFirebase = async (rows, dupKeys, rawDocs = []) => {
    const keysToDelete = await getDataKetQuaKeysByDupKeys(dupKeys, rawDocs);
    return await appendDataKetQuaRowsToFirebase(rows, keysToDelete);
};

export const updateDataKetQuaRowsOnFirebase = async (recordsByKey) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase chưa được bật hoặc chưa cấu hình.');
    }
    const updates = {};
    for (const [key, row] of Object.entries(recordsByKey || {})) {
        if (!/^\d+$/.test(key)) continue;
        updates[`data_ket_qua/${key}`] = Array.isArray(row)
            ? toFirebaseData('data_ket_qua', [row])[0]
            : null;
    }
    if (Object.keys(updates).length === 0) return;
    const deletedCount = Object.values(recordsByKey || {}).filter(row => !Array.isArray(row)).length;
    if (deletedCount > 0) {
        const version = await fetchFirebaseVersion('data_ket_qua');
        const nextKey = await getNextDataKetQuaKey(version);
        updates['data_ket_qua_version/count'] = Math.max(0, (Number.isInteger(version?.count) ? version.count : nextKey - 1) - deletedCount);
    }
    updates['data_ket_qua_version/version'] = Date.now();
    updates['data_ket_qua_version/timestamp'] = new Date().toISOString();
    await requestFirebaseJson(firebaseUrl(''), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    fullDataKetQuaCache = null;
    fullDataKetQuaCacheVersion = null;
    searchableDataKetQuaCache = null;
    searchableDataKetQuaCacheVersion = null;
    dataKetQuaDocCache.clear();
    dataKetQuaPrSapCache.clear();
};

export const fetchAllDataKetQuaFromFirebase = async () => {
    const version = await fetchFirebaseVersion('data_ket_qua');
    if (!version) throw new Error('Không đọc được metadata data_ket_qua trên Firebase.');
    if (fullDataKetQuaCache && version.version === fullDataKetQuaCacheVersion) return fullDataKetQuaCache;
    const remote = await fetchFirebaseData('data_ket_qua', version);
    if (!remote) {
        fullDataKetQuaCache = [DATA_KET_QUA_CANONICAL_HEADER];
        fullDataKetQuaCacheVersion = version.version;
        return fullDataKetQuaCache;
    }
    const entries = Array.isArray(remote.rows)
        ? remote.rows
        : Object.entries(remote.rows || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, row]) => rowFromFirebaseObject(row));
    fullDataKetQuaCache = [DATA_KET_QUA_CANONICAL_HEADER, ...entries.slice(1)];
    fullDataKetQuaCacheVersion = version.version;
    return fullDataKetQuaCache;
};

export const extractRowsFromFirebaseSourceDocNode = (value, fallbackDoc = '') => {
    if (Array.isArray(value)) return { rows: value, doc: fallbackDoc };
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value.rows)) {
        let doc = String(value.doc || value.originalDoc || value.originalDocNumber || value.docNumber || fallbackDoc || '').trim();
        if (!doc && Array.isArray(value.rows) && value.rows.length > 0) {
            const firstRow = value.rows[0];
            if (firstRow && typeof firstRow === 'object' && firstRow.doc) {
                doc = String(firstRow.doc).trim();
            }
        }
        return { rows: value.rows, doc };
    }
    const seen = new Set();
    const walk = (node, currentDoc) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return null;
        seen.add(node);
        if (Array.isArray(node.rows)) {
            let doc = String(node.doc || node.originalDoc || node.originalDocNumber || node.docNumber || currentDoc || '').trim();
            if (!doc && Array.isArray(node.rows) && node.rows.length > 0) {
                const firstRow = node.rows[0];
                if (firstRow && typeof firstRow === 'object' && firstRow.doc) {
                    doc = String(firstRow.doc).trim();
                }
            }
            return { rows: node.rows, doc };
        }
        for (const child of Object.values(node)) {
            const found = walk(child, currentDoc);
            if (found) return found;
        }
        return null;
    };
    return walk(value, fallbackDoc);
};

export const syncToFirebase = async (data, type = 'data_ket_qua') => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return;
    if (type === 'data_ket_qua') {
        console.error('Full data_ket_qua sync is disabled; use the targeted Firebase APIs.');
        return;
    }

    // Chạy ngầm k ảnh hưởng đến luồng chính
    (async () => {
        try {
            const safeType = encodeFirebasePath(String(type || ''));
            const base = firebaseBaseUrl();
            const url = `${base}/${safeType}.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
            const versionUrl = `${base}/${safeType}_version.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
            
            const dataToSync = toFirebaseData(type, data);

            const hash = computeHash(dataToSync);
            if (lastSyncedHashByType.get(type) === hash) return;

            try {
                const verRes = await fetch(versionUrl);
                if (verRes.ok) {
                    const ver = await verRes.json();
                    if (ver?.hash && ver.hash === hash) {
                        lastSyncedHashByType.set(type, hash);
                        return;
                    }
                }
            } catch (e) {}

            // Sync data
            const response = await fetch(url, {
                method: 'PUT',
                body: JSON.stringify(dataToSync),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.error(`Firebase sync failed for ${type}:`, await response.text());
                return;
            }

            // Sync version
            const version = Date.now();
            await fetch(versionUrl, {
                method: 'PUT',
                body: JSON.stringify({ version, timestamp: new Date().toISOString(), hash }),
                headers: { 'Content-Type': 'application/json' }
            });

            lastSyncedHashByType.set(type, hash);
            console.log(`Firebase sync successful for ${type} (version: ${version})`);
        } catch (e) {
            console.error(`Firebase sync error for ${type}:`, e);
        }
    })();
};

export const fetchFromFirebase = async (type = 'data_ket_qua') => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return null;
    try {
        const version = await fetchFirebaseVersion(type);
        if (!version) return null;
        return await fetchFirebaseData(type, version);
    } catch (e) {
        console.error(`Firebase fetch error for ${type}:`, e);
        return null;
    }
};

export const syncTwoWayWithFirebase = async (statusEl) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return;
    try {
        await fetchFirebaseVersion('data_ket_qua');
    } catch (e) {
        console.error('Firebase metadata check error for data_ket_qua:', e);
    }
};

const sanitizeFirebaseKey = (key) => String(key || '').replace(/[.#$\[\]]/g, '_');

export const saveSourceDocDataToFirebase = async (docNumber, rows) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL || !docNumber || !rows || rows.length === 0) return;
    const sanitizedKey = sanitizeFirebaseKey(docNumber);
    try {
        const base = firebaseBaseUrl();
        const url = `${base}/${encodeFirebasePath(`source_docs/${sanitizedKey}`)}.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
        const hash = computeHash(rows);
        try {
            const existingRes = await fetch(url);
            if (existingRes.ok) {
                const existing = await existingRes.json();
                if (existing?.hash && existing.hash === hash) return;
            }
        } catch (e) {}
        
        // Extract actual doc from first row if it's an object with .doc property
        let actualDoc = docNumber;
        if (rows.length > 0) {
            const firstRow = rows[0];
            if (typeof firstRow === 'object' && firstRow.doc) {
                actualDoc = String(firstRow.doc).trim();
            }
        }
        
        // Save doc explicitly so we can map back to actual doc value
        await fetch(url, {
            method: 'PATCH',
            body: JSON.stringify({ rows, doc: actualDoc, ts: Date.now(), hash }),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error(`Firebase saveSourceDocData error for ${docNumber}:`, e);
    }
};

export const fetchSourceDocDataFromFirebase = async (docNumber) => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL || !docNumber) return null;
    const sanitizedKey = sanitizeFirebaseKey(docNumber);
    try {
        const base = firebaseBaseUrl();
        const url = `${base}/${encodeFirebasePath(`source_docs/${sanitizedKey}`)}.json${FIREBASE_CONFIG.apiKey ? `?auth=${FIREBASE_CONFIG.apiKey}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data ? data : null; // return full data so we can get originalDoc too!
    } catch (e) {
        console.error(`Firebase fetchSourceDocData error for ${docNumber}:`, e);
        return null;
    }
};

export const fetchAllSourceDocKeysFromFirebase = async () => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return [];
    try {
        const base = firebaseBaseUrl();
        const qs = new URLSearchParams();
        if (FIREBASE_CONFIG.apiKey) qs.set('auth', FIREBASE_CONFIG.apiKey);
        qs.set('shallow', 'true');
        const url = `${base}/source_docs.json?${qs.toString()}`;
        
        const res = await fetch(url);
        if (!res.ok) return [];
        
        const obj = await res.json();
        if (!obj || typeof obj !== 'object') return [];
        
        return Object.keys(obj);
    } catch (e) {
        console.error('Firebase fetchAllSourceDocKeys error:', e);
        return [];
    }
};

export const fetchAllSourceDocsFromFirebase = async () => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return {};
    try {
        const base = firebaseBaseUrl();
        const qs = new URLSearchParams();
        if (FIREBASE_CONFIG.apiKey) qs.set('auth', FIREBASE_CONFIG.apiKey);
        // Don't use shallow—fetch the whole source_docs object!
        const url = `${base}/source_docs.json?${qs.toString()}`;
        
        console.log('[fetchAllSourceDocsFromFirebase] Fetching all docs from:', url);
        const res = await fetch(url);
        if (!res.ok) {
            console.error('[fetchAllSourceDocsFromFirebase] Fetch failed with status:', res.status, res.statusText);
            return {};
        }
        
        const allDocs = await res.json();
        console.log('[fetchAllSourceDocsFromFirebase] Got all docs:', allDocs);
        if (!allDocs || typeof allDocs !== 'object') return {};
        
        return allDocs;
    } catch (e) {
        console.error('Firebase fetchAllSourceDocs error:', e);
        return {};
    }
};

export const fetchAllSourceDocNumbersFromFirebase = async () => {
    if (!FIREBASE_CONFIG.syncEnabled || !FIREBASE_CONFIG.databaseURL) return [];
    try {
        const base = firebaseBaseUrl();
        const makeUrl = (path, shallow) => {
            const qs = new URLSearchParams();
            if (FIREBASE_CONFIG.apiKey) qs.set('auth', FIREBASE_CONFIG.apiKey);
            if (shallow) qs.set('shallow', 'true');
            return `${base}/${encodeFirebasePath(path)}.json?${qs.toString()}`;
        };

        const fetchShallowKeys = async (path) => {
            const res = await fetch(makeUrl(path, true));
            if (!res.ok) return null;
            const obj = await res.json();
            if (!obj || typeof obj !== 'object') return null;
            return Object.keys(obj);
        };

        const initial = await fetchShallowKeys('source_docs');
        if (!initial || initial.length === 0) return [];

        const out = [];
        const seen = new Set();
        let queue = initial.map(k => String(k));

        const maxNodes = 5000;
        const maxDepth = 12;
        const batchSize = 12;
        let nodes = 0;

        while (queue.length > 0 && nodes < maxNodes) {
            const batch = queue.slice(0, batchSize);
            queue = queue.slice(batchSize);

            const results = await Promise.all(batch.map(async (prefix) => {
                const depth = String(prefix).split('/').filter(Boolean).length;
                if (depth > maxDepth) return { prefix, kind: 'skip' };
                const keys = await fetchShallowKeys(`source_docs/${prefix}`);
                return { prefix, kind: 'keys', keys };
            }));

            for (const r of results) {
                nodes += 1;
                if (!r || r.kind !== 'keys') continue;
                const prefix = String(r.prefix || '');
                const keys = Array.isArray(r.keys) ? r.keys : null;
                if (!prefix || !keys || keys.length === 0) continue;

                if (keys.includes('rows')) {
                    if (!seen.has(prefix)) { seen.add(prefix); out.push(prefix); }
                    continue;
                }

                for (const k of keys) {
                    const child = `${prefix}/${k}`;
                    if (seen.has(child)) continue;
                    queue.push(child);
                }
            }
        }

        return out.sort();
    } catch (e) {
        console.error('Firebase fetchAllSourceDocNumbers error:', e);
        return [];
    }
};
