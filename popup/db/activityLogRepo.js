import { openDataKetQuaDb } from './openDb.js';
import { ACTIVITY_LOG_MAX_ITEMS, ACTIVITY_LOG_STORE } from './constants.js';

const normalize = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

export const addActivityLog = async ({ kind, msg, data }) => {
    const k = normalize(kind) || 'event';
    const m = normalize(msg);
    const payload = (data && typeof data === 'object') ? data : {};
    const db = await openDataKetQuaDb();
    await new Promise((resolve) => {
        const tx = db.transaction(ACTIVITY_LOG_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.objectStore(ACTIVITY_LOG_STORE).add({ ts: Date.now(), kind: k, msg: m, data: payload });
    });
    try {
        const extraIds = [];
        await new Promise((resolve) => {
            const tx = db.transaction(ACTIVITY_LOG_STORE, 'readonly');
            const idx = tx.objectStore(ACTIVITY_LOG_STORE).index('ts');
            const req = idx.openCursor(null, 'prev');
            let kept = 0;
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return resolve();
                if (kept < ACTIVITY_LOG_MAX_ITEMS) kept += 1;
                else extraIds.push(cursor.primaryKey);
                cursor.continue();
            };
            req.onerror = () => resolve();
        });
        if (extraIds.length > 0) await new Promise((resolve) => {
            const tx = db.transaction(ACTIVITY_LOG_STORE, 'readwrite');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            const store = tx.objectStore(ACTIVITY_LOG_STORE);
            for (const id of extraIds) store.delete(id);
        });
    } catch (e) {}
};

export const listActivityLogs = async ({ query, kind, limit = 300 } = {}) => {
    const q = normalize(query).toUpperCase();
    const k = normalize(kind);
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 300;
    const db = await openDataKetQuaDb();
    const out = [];
    await new Promise((resolve) => {
        const tx = db.transaction(ACTIVITY_LOG_STORE, 'readonly');
        const idx = tx.objectStore(ACTIVITY_LOG_STORE).index('ts');
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            const v = cursor.value || {};
            const kk = normalize(v.kind);
            const mm = normalize(v.msg);
            const line = `${kk} ${mm} ${JSON.stringify(v.data || {})}`.toUpperCase();
            if (k && kk !== k) { cursor.continue(); return; }
            if (q && !line.includes(q)) { cursor.continue(); return; }
            out.push({ id: v.id, ts: v.ts, kind: kk, msg: mm, data: v.data || {} });
            if (out.length >= max) return resolve();
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return out;
};

export const clearActivityLogs = async () => {
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(ACTIVITY_LOG_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.objectStore(ACTIVITY_LOG_STORE).clear();
    });
};
