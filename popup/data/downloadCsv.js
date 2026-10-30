import { escapeCsvValue } from '../utils/text.js';
import { fetchAllDataKetQuaFromFirebase } from '../services/firebase.js';

export const buildDataKetQuaCsvFromDb = async () => {
    const rows = await fetchAllDataKetQuaFromFirebase();
    if (!Array.isArray(rows) || rows.length === 0) return '';
    return rows
        .map((row) => (Array.isArray(row) ? row : []).map(escapeCsvValue).join(','))
        .join('\r\n');
};

export const downloadCurrentCsv = async (csvContentOverride) => {
    let csvContent = '';
    try {
        csvContent = typeof csvContentOverride === 'string' ? csvContentOverride : await buildDataKetQuaCsvFromDb();
    } catch (error) {
        return { ok: false, error: `Không tải được dữ liệu từ Firebase: ${error?.message || error}` };
    }
    if (!csvContent) return { ok: false, error: 'Không có dữ liệu để xuất.' };
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = 'extension/data_ket_qua.csv';
    return new Promise((resolve) => {
        try {
            chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'overwrite' }, () => {
                const err = chrome.runtime.lastError;
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
                resolve({ ok: !err, error: err ? err.message : '' });
            });
        } catch (e) {
            URL.revokeObjectURL(url);
            resolve({ ok: false, error: String(e && e.message ? e.message : e) });
        }
    });
};
