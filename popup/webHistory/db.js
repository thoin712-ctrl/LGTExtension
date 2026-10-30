const WEB_HISTORY_DB_NAME = 'qt_approvals_db';
const WEB_HISTORY_DB_VERSION = 1;
const WEB_HISTORY_STORE = 'approve_history';

export const openWebHistoryDb = () => new Promise((resolve, reject) => {
    try {
        const req = indexedDB.open(WEB_HISTORY_DB_NAME, WEB_HISTORY_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(WEB_HISTORY_STORE)) {
                const store = db.createObjectStore(WEB_HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('code', 'code', { unique: false });
                store.createIndex('ts', 'ts', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Không mở được DB history web.'));
    } catch (e) { reject(e); }
});

export const getWebApprovalHistoryFromDb = async (limit = 200) => {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
    const db = await openWebHistoryDb();
    const out = [];
    await new Promise((resolve) => {
        const tx = db.transaction(WEB_HISTORY_STORE, 'readonly');
        const store = tx.objectStore(WEB_HISTORY_STORE);
        const idx = store.index('ts');
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            const v = cursor.value || {};
            out.push({ code: String(v.code || '').trim(), url: String(v.url || '').trim(), ts: typeof v.ts === 'number' ? v.ts : 0, ngayDuyet: String(v.ngayDuyet || '').trim() });
            if (out.length >= max) return resolve();
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return out;
};

export const getWebApprovalHistoryKeySetFromDb = async (limit = 5000) => {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5000;
    const db = await openWebHistoryDb();
    const keys = new Set();
    await new Promise((resolve) => {
        const tx = db.transaction(WEB_HISTORY_STORE, 'readonly');
        const store = tx.objectStore(WEB_HISTORY_STORE);
        const idx = store.index('ts');
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            const v = cursor.value || {};
            const code = String(v.code || '').trim();
            const ts = typeof v.ts === 'number' ? v.ts : 0;
            const url = String(v.url || '').trim();
            const ngayDuyet = String(v.ngayDuyet || '').trim();
            if (code && ts) keys.add(`${code}||${ts}`);
            else if (code && (url || ngayDuyet)) keys.add(`${code}||${url}||${ngayDuyet}`);
            if (keys.size >= max) return resolve();
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return keys;
};

export const appendWebApprovalHistoryToDb = async (items, existingKeySet) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return 0;
    const existing = existingKeySet instanceof Set ? existingKeySet : new Set();
    const db = await openWebHistoryDb();
    return await new Promise((resolve) => {
        let added = 0;
        const tx = db.transaction(WEB_HISTORY_STORE, 'readwrite');
        tx.oncomplete = () => resolve(added);
        tx.onerror = () => resolve(added);
        const store = tx.objectStore(WEB_HISTORY_STORE);
        for (const it0 of list) {
            const it = it0 && typeof it0 === 'object' ? it0 : {};
            const code = String(it.code || '').trim();
            const url = String(it.url || '').trim();
            const ts0 = typeof it.ts === 'number' ? it.ts : Number(it.ts || 0);
            const ts = Number.isFinite(ts0) ? ts0 : 0;
            const ngayDuyet = String(it.ngayDuyet || '').trim();
            if (!code) continue;
            const key = ts ? `${code}||${ts}` : `${code}||${url}||${ngayDuyet}`;
            if (existing.has(key)) continue;
            existing.add(key);
            store.add({ code, url, ts, ngayDuyet: ngayDuyet || (ts ? new Date(ts).toISOString() : '') });
            added += 1;
        }
    });
};
