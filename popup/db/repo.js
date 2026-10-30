import { openDataKetQuaDb } from './openDb.js';
import { DATA_KET_QUA_CANONICAL_HEADER, DATA_KET_QUA_STORE, DATA_KET_QUA_META, DATA_KET_QUA_IDX, EXCEL_DATA_STORE } from './constants.js';
import { computeDupKeyFromFields, computeDocMaKeyFromFields } from './keys.js';
import { normalizeDupValue } from '../utils/text.js';
import {
    saveSourceDocDataToFirebase,
    fetchSourceDocDataFromFirebase,
    fetchDataKetQuaRowsByDoc,
    updateDataKetQuaStatusesByCancelKeys as updateFirebaseStatusesByCancelKeys
} from '../services/firebase.js';

export const getDataKetQuaHeader = async () => DATA_KET_QUA_CANONICAL_HEADER;

export const saveExcelDataToDb = async (docNumber, rows) => {
    if (!docNumber || docNumber === '-') return false;
    
    // First, check if document already exists on Firebase!
    const existingRemote = await fetchSourceDocDataFromFirebase(docNumber);
    if (existingRemote && Array.isArray(existingRemote.rows) && existingRemote.rows.length > 0) {
        return false; // Already exists, don't save again!
    }
    
    // Save to Firebase (Cloud) only, no IndexedDB!
    await saveSourceDocDataToFirebase(docNumber, rows);
    return true;
};

export const getExcelDataFromDb = async (docNumber) => {
    if (!docNumber) return null;
    // Only use Firebase!
    return await fetchSourceDocDataFromFirebase(docNumber);
};

// Since we're not using IndexedDB, getAllExcelDocNumbers needs to fetch from Firebase!
// Let's add a helper to fetch all source doc keys from Firebase in services/firebase.js
export const getAllExcelDocNumbers = async () => {
    try {
        const { fetchAllSourceDocKeysFromFirebase } = await import('../services/firebase.js');
        return await fetchAllSourceDocKeysFromFirebase();
    } catch (e) {
        return [];
    }
};

export const setDataKetQuaHeader = async () => {
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_META, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.objectStore(DATA_KET_QUA_META).put({ key: 'header', value: DATA_KET_QUA_CANONICAL_HEADER });
    });
};

export const dataKetQuaRecordFromCanonicalRow = (row) => {
    const r = Array.isArray(row) ? row : [];
    const getAt = (idx) => (r[idx] != null ? String(r[idx]).trim() : '');
    const docRaw = r[DATA_KET_QUA_IDX.DOC] != null ? String(r[DATA_KET_QUA_IDX.DOC]) : '';
    const docTrimmed = docRaw.trim();
    const doc = docRaw;
    const prOne = getAt(DATA_KET_QUA_IDX.PR_ONE);
    const prSap = getAt(DATA_KET_QUA_IDX.PR_SAP);
    const ngayDuyet = getAt(DATA_KET_QUA_IDX.NGAY_DUYET);
    const prType = getAt(DATA_KET_QUA_IDX.PR_TYPE);
    const ma = getAt(DATA_KET_QUA_IDX.MA_VT);
    const ten = getAt(DATA_KET_QUA_IDX.TEN_VT);
    const dv = getAt(DATA_KET_QUA_IDX.DVT);
    const sl = getAt(DATA_KET_QUA_IDX.SL);
    const status = getAt(DATA_KET_QUA_IDX.STATUS) || 'ĐÃ DUYỆT';
    const ghiChu = getAt(DATA_KET_QUA_IDX.GHI_CHU);
    const sttExcel = getAt(DATA_KET_QUA_IDX.STT_EXCEL);
    const sttWeb = getAt(DATA_KET_QUA_IDX.STT_WEB);
    return { doc, prOne, prSap, ngayDuyet, prType, ma, ten, dv, sl, status, ghiChu, sttExcel, sttWeb, dupKey: computeDupKeyFromFields({ doc: docTrimmed, ma, dv, sl }), docMaKey: computeDocMaKeyFromFields({ doc: docTrimmed, ma, allowDash: true }) };
};

export const importDataKetQuaRows = async (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readwrite');
        let count = 0;
        tx.oncomplete = () => resolve(count);
        tx.onerror = () => resolve(count);
        const store = tx.objectStore(DATA_KET_QUA_STORE);
        for (const r of rows) {
            const rec = dataKetQuaRecordFromCanonicalRow(r);
            store.put(rec);
            count += 1;
        }
    });
};

export const dataKetQuaDocMaExists = async (doc, ma) => {
    const d = normalizeDupValue(doc), m = normalizeDupValue(ma);
    if (!d || d === '-' || !m) return null;
    const matches = await fetchDataKetQuaRowsByDoc(doc);
    return matches.some(({ row }) => normalizeDupValue(row[DATA_KET_QUA_IDX.MA_VT]) === m);
};

export const dataKetQuaDupKeyExists = async (dupKey, doc = '') => {
    const key = String(dupKey || '');
    if (!key) return false;
    const sourceDoc = String(doc || key.split('||')[0] || '').trim();
    const matches = await fetchDataKetQuaRowsByDoc(sourceDoc);
    return matches.some(({ row }) => computeDupKeyFromFields({
        doc: row[DATA_KET_QUA_IDX.DOC],
        ma: row[DATA_KET_QUA_IDX.MA_VT],
        dv: row[DATA_KET_QUA_IDX.DVT],
        sl: row[DATA_KET_QUA_IDX.SL]
    }) === key);
};

export const getAllDataKetQuaRowsFromDb = async () => {
    const out = [DATA_KET_QUA_CANONICAL_HEADER];
    const db = await openDataKetQuaDb();
    await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readonly');
        const req = tx.objectStore(DATA_KET_QUA_STORE).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            const v = cursor.value || {};
            const row = new Array(DATA_KET_QUA_CANONICAL_HEADER.length).fill('');
            row[DATA_KET_QUA_IDX.DOC] = v.doc || '';
            row[DATA_KET_QUA_IDX.PR_ONE] = v.prOne || '';
            row[DATA_KET_QUA_IDX.PR_SAP] = v.prSap || '';
            row[DATA_KET_QUA_IDX.NGAY_DUYET] = v.ngayDuyet || '';
            row[DATA_KET_QUA_IDX.PR_TYPE] = v.prType || '';
            row[DATA_KET_QUA_IDX.MA_VT] = v.ma || '';
            row[DATA_KET_QUA_IDX.TEN_VT] = v.ten || '';
            row[DATA_KET_QUA_IDX.DVT] = v.dv || '';
            row[DATA_KET_QUA_IDX.SL] = v.sl || '';
            row[DATA_KET_QUA_IDX.STATUS] = v.status || 'ĐÃ DUYỆT';
            row[DATA_KET_QUA_IDX.GHI_CHU] = v.ghiChu || '';
            row[DATA_KET_QUA_IDX.STT_EXCEL] = v.sttExcel || '';
            row[DATA_KET_QUA_IDX.STT_WEB] = v.sttWeb || '';
            out.push(row);
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return out;
};

export const getAllDataKetQuaRecordsFromDb = async () => {
    const out = [];
    const db = await openDataKetQuaDb();
    await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readonly');
        const req = tx.objectStore(DATA_KET_QUA_STORE).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return resolve();
            const v = cursor.value || {};
            out.push({
                id: v.id,
                doc: v.doc || '',
                prOne: v.prOne || '',
                prSap: v.prSap || '',
                ngayDuyet: v.ngayDuyet || '',
                prType: v.prType || '',
                ma: v.ma || '',
                ten: v.ten || '',
                dv: v.dv || '',
                sl: v.sl || '',
                status: v.status || 'ĐÃ DUYỆT',
                ghiChu: v.ghiChu || '',
                sttExcel: v.sttExcel || '',
                sttWeb: v.sttWeb || '',
                dupKey: v.dupKey || '',
                docMaKey: v.docMaKey || ''
            });
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return out;
};

export const updateDataKetQuaRecordById = async (id, patch) => {
    const rowId = Number(id);
    if (!Number.isFinite(rowId) || rowId <= 0) return false;
    const next = patch && typeof patch === 'object' ? patch : {};
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readwrite');
        tx.onerror = () => resolve(false);
        const store = tx.objectStore(DATA_KET_QUA_STORE);
        const req = store.get(rowId);
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
            const current = req.result;
            if (!current) return resolve(false);
            const merged = {
                ...current,
                doc: next.doc != null ? String(next.doc) : (current.doc || ''),
                prOne: next.prOne != null ? String(next.prOne).trim() : (current.prOne || ''),
                prSap: next.prSap != null ? String(next.prSap).trim() : (current.prSap || ''),
                ngayDuyet: next.ngayDuyet != null ? String(next.ngayDuyet).trim() : (current.ngayDuyet || ''),
                prType: next.prType != null ? String(next.prType).trim() : (current.prType || ''),
                ma: next.ma != null ? String(next.ma).trim() : (current.ma || ''),
                ten: next.ten != null ? String(next.ten).trim() : (current.ten || ''),
                dv: next.dv != null ? String(next.dv).trim() : (current.dv || ''),
                sl: next.sl != null ? String(next.sl).trim() : (current.sl || ''),
                status: next.status != null ? String(next.status).trim() : (current.status || 'ĐÃ DUYỆT'),
                ghiChu: next.ghiChu != null ? String(next.ghiChu).trim() : (current.ghiChu || ''),
                sttExcel: next.sttExcel != null ? String(next.sttExcel).trim() : (current.sttExcel || ''),
                sttWeb: next.sttWeb != null ? String(next.sttWeb).trim() : (current.sttWeb || '')
            };
            const docTrimmed = (merged.doc || '').trim();
            merged.dupKey = computeDupKeyFromFields({ doc: docTrimmed, ma: merged.ma, dv: merged.dv, sl: merged.sl });
            merged.docMaKey = computeDocMaKeyFromFields({ doc: docTrimmed, ma: merged.ma, allowDash: true });
            const putReq = store.put(merged);
            putReq.onsuccess = () => resolve(true);
            putReq.onerror = () => resolve(false);
        };
    });
};

export const updateDataKetQuaStatusByDupKey = async (dupKey, statusText) => {
    const key = String(dupKey || '');
    if (!key) return 0;
    const text = String(statusText == null ? '' : statusText).trim();
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        let updated = 0;
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readwrite');
        tx.oncomplete = () => resolve(updated);
        tx.onerror = () => resolve(updated);
        const idx = tx.objectStore(DATA_KET_QUA_STORE).index('dupKey');
        const req = idx.openCursor(key);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const v = cursor.value || {};
            v.status = text;
            cursor.update(v);
            updated += 1;
            cursor.continue();
        };
        req.onerror = () => resolve(updated);
    });
};

export const updateDataKetQuaStatusByCancelKeys = async (cancelKeys, statusText) => {
    return await updateFirebaseStatusesByCancelKeys(cancelKeys, statusText);
};

export const getDataKetQuaStatusesByDupKey = async (dupKey, limit = 5, doc = '') => {
    const key = String(dupKey || '');
    if (!key) return [];
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
    const matches = await fetchDataKetQuaRowsByDoc(doc || key.split('||')[0]);
    return Array.from(new Set(matches
        .filter(({ row }) => computeDupKeyFromFields({
            doc: row[DATA_KET_QUA_IDX.DOC], ma: row[DATA_KET_QUA_IDX.MA_VT],
            dv: row[DATA_KET_QUA_IDX.DVT], sl: row[DATA_KET_QUA_IDX.SL]
        }) === key)
        .map(({ row }) => String(row[DATA_KET_QUA_IDX.STATUS] || 'ĐÃ DUYỆT').trim() || 'ĐÃ DUYỆT'))).slice(0, max);
};

export const getDataKetQuaStatusesByDocMa = async (doc, ma, limit = 5) => {
    const key = computeDocMaKeyFromFields({ doc, ma, allowDash: true });
    if (!key) return [];
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
    const matches = await fetchDataKetQuaRowsByDoc(doc);
    return Array.from(new Set(matches
        .filter(({ row }) => normalizeDupValue(row[DATA_KET_QUA_IDX.MA_VT]) === normalizeDupValue(ma))
        .map(({ row }) => String(row[DATA_KET_QUA_IDX.STATUS] || 'ĐÃ DUYỆT').trim() || 'ĐÃ DUYỆT'))).slice(0, max);
};

export const replaceDataKetQuaDbWithRows = async (rows) => {
    const clean = Array.isArray(rows) ? rows.filter(r => Array.isArray(r) && r.length > 0) : [];
    const body = clean.slice(1);
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        const store = tx.objectStore(DATA_KET_QUA_STORE);
        store.clear();
        for (const r of body) store.add(dataKetQuaRecordFromCanonicalRow(r));
    });
};

export const countDataKetQuaDbRows = async () => {
    const db = await openDataKetQuaDb();
    return await new Promise((resolve) => {
        const tx = db.transaction(DATA_KET_QUA_STORE, 'readonly');
        const req = tx.objectStore(DATA_KET_QUA_STORE).count();
        req.onsuccess = () => resolve(Number(req.result || 0));
        req.onerror = () => resolve(0);
    });
};
