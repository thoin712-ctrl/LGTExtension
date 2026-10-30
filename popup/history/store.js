import { buildHistoryCsv, parseHistoryCsv } from './csv.js';
import { clearHistoryDb, getHistoryItemsFromDb, normalizeHistoryItem, upsertHistoryItemsToDb, updateHistoryNote } from './db.js';

export const getStoredHistory = async () => {
    const fromDb = await getHistoryItemsFromDb();
    if (fromDb.length > 0) return fromDb;
    let legacy = [];
    try { const csvText = localStorage.getItem('history_csv') || ''; if (csvText && csvText.trim()) legacy = parseHistoryCsv(csvText); } catch (e) {}
    if (legacy.length === 0) {
        try {
            const data = await chrome.storage.local.get({ history_items: [] });
            legacy = (Array.isArray(data.history_items) ? data.history_items : []).map(normalizeHistoryItem).filter(it => it.docNumber || it.webCode);
        } catch (e) {}
    }
    if (legacy.length === 0) {
        try {
            const raw = localStorage.getItem('history_items') || '';
            const parsed = raw ? JSON.parse(raw) : [];
            legacy = (Array.isArray(parsed) ? parsed : []).map(normalizeHistoryItem).filter(it => it.docNumber || it.webCode);
        } catch (e) {}
    }
    if (legacy.length > 0) {
        await upsertHistoryItemsToDb(legacy);
        try { localStorage.removeItem('history_csv'); localStorage.removeItem('history_csv_ts'); localStorage.removeItem('history_items'); } catch (e) {}
        return await getHistoryItemsFromDb();
    }
    return [];
};

export const storeHistory = async (items) => { await clearHistoryDb(); await upsertHistoryItemsToDb(items || []); };
export const setHistoryNote = async ({ docNumber, webCode, note }) => { await updateHistoryNote({ docNumber, webCode, note }); };

export const downloadHistoryCsv = async () => {
    const items = await getStoredHistory();
    const csvText = buildHistoryCsv(items);
    if (!csvText || !csvText.trim()) return { ok: false, error: 'Không có history để xuất.' };
    if (!chrome.downloads) return { ok: false, error: 'Thiếu quyền downloads. Hãy reload extension.' };
    const blob = new Blob([`\ufeff${csvText}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = 'extension/history.csv';
    return new Promise((resolve) => {
        try {
            chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'overwrite' }, () => {
                const err = chrome.runtime.lastError;
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
                resolve({ ok: !err, error: err ? err.message : '' });
            });
        } catch (e) { URL.revokeObjectURL(url); resolve({ ok: false, error: String(e && e.message ? e.message : e) }); }
    });
};
