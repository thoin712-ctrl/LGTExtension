import { DATA_KET_QUA_DB_NAME, DATA_KET_QUA_DB_VERSION, DATA_KET_QUA_STORE, DATA_KET_QUA_META, HISTORY_STORE, ACTIVITY_LOG_STORE, EXCEL_DATA_STORE } from './constants.js';

let dbPromise = null;
export const openDataKetQuaDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(DATA_KET_QUA_DB_NAME, DATA_KET_QUA_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(DATA_KET_QUA_STORE)) {
                    const store = db.createObjectStore(DATA_KET_QUA_STORE, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('dupKey', 'dupKey', { unique: false });
                    store.createIndex('docMaKey', 'docMaKey', { unique: false });
                }
                if (!db.objectStoreNames.contains(DATA_KET_QUA_META)) db.createObjectStore(DATA_KET_QUA_META, { keyPath: 'key' });
                if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                    const hs = db.createObjectStore(HISTORY_STORE, { keyPath: 'key' });
                    hs.createIndex('ts', 'ts', { unique: false });
                }
                if (!db.objectStoreNames.contains(EXCEL_DATA_STORE)) {
                    db.createObjectStore(EXCEL_DATA_STORE, { keyPath: 'docNumber' });
                }
                if (!db.objectStoreNames.contains(ACTIVITY_LOG_STORE)) {
                    const ls = db.createObjectStore(ACTIVITY_LOG_STORE, { keyPath: 'id', autoIncrement: true });
                    ls.createIndex('ts', 'ts', { unique: false });
                    ls.createIndex('kind', 'kind', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB.'));
        } catch (e) { reject(e); }
    });
    return dbPromise;
};
