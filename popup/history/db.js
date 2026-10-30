import { openDataKetQuaDb } from '../db/openDb.js';
import { HISTORY_STORE, HISTORY_MAX_ITEMS } from '../db/constants.js';
import { syncToFirebase } from '../services/firebase.js';

export const normalizeHistoryItem = (it) => {
    const obj = it && typeof it === 'object' ? it : {};
    const docNumber = obj.docNumber != null ? String(obj.docNumber).trim() : '';
    const webCode = obj.webCode != null ? String(obj.webCode).trim() : '';
    const pageUrl = obj.pageUrl != null ? String(obj.pageUrl).trim() : '';
    const prType = obj.prType != null ? String(obj.prType).trim() : '';
    const note = obj.note != null ? String(obj.note).trim() : '';
    const ts = typeof obj.ts === 'number' ? obj.ts : 0;
    return { docNumber, webCode, pageUrl, prType, note, ts };
};

const historyKey = (docNumber, webCode) => `${String(docNumber || '').trim()}||${String(webCode || '').trim()}`;

export const upsertHistoryItemsToDb = async (items) => {
    const db = await openDataKetQuaDb();
    await new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.oncomplete = () => {
            resolve(true);
        };
        tx.onerror = () => resolve(false);
        const store = tx.objectStore(HISTORY_STORE);
        for (const it0 of (items || [])) {
            const it = normalizeHistoryItem(it0);
            if (!it.docNumber && !it.webCode) continue;
            store.put({ key: historyKey(it.docNumber, it.webCode), ...it });
        }
    });
    try {
        const extraKeys = [];
        await new Promise((resolve) => {
            const tx = db.transaction(HISTORY_STORE, 'readonly');
            const idx = tx.objectStore(HISTORY_STORE).index('ts');
            const req = idx.openCursor(null, 'prev');
            let kept = 0;
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return resolve();
                if (kept < HISTORY_MAX_ITEMS) kept += 1;
                else extraKeys.push(cursor.primaryKey);
                cursor.continue();
            };
            req.onerror = () => resolve();
        });
        if (extraKeys.length > 0) await new Promise((resolve) => {
            const tx = db.transaction(HISTORY_STORE, 'readwrite');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            const store = tx.objectStore(HISTORY_STORE);
            for (const k of extraKeys) store.delete(k);
        });
    } catch (e) {}

    // Đồng bộ lên firebase sau khi update
    try {
        const items = await getHistoryItemsFromDb();
        syncToFirebase(items, 'history_tool');
    } catch (e) {}
};

export const getHistoryItemsFromDb = async () => {
    const db = await openDataKetQuaDb();
    const out = [];
    await new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const idx = tx.objectStore(HISTORY_STORE).index('ts');
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            out.push(normalizeHistoryItem(cursor.value || {}));
            if (out.length >= HISTORY_MAX_ITEMS) return resolve();
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return out;
};

export const updateHistoryNote = async ({ docNumber, webCode, note }) => {
    const doc = String(docNumber || '').trim();
    const web = String(webCode || '').trim();
    if (!doc && !web) return false;
    const key = historyKey(doc, web);
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        const store = tx.objectStore(HISTORY_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
            const cur = req.result || {};
            store.put({ ...cur, key, docNumber: doc, webCode: web, note: String(note == null ? '' : note).trim(), ts: typeof cur.ts === 'number' ? cur.ts : Date.now() });
            // Đồng bộ sau khi update note
            getHistoryItemsFromDb().then(items => syncToFirebase(items, 'history_tool'));
        };
        req.onerror = () => resolve(false);
    });
};

export const clearHistoryDb = async () => {
    const db = await openDataKetQuaDb();
    await new Promise((resolve) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.objectStore(HISTORY_STORE).clear();
    });
};
