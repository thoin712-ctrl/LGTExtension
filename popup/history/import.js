import { parseHistoryCsv } from './csv.js';
import { getStoredHistory, storeHistory } from './store.js';
import { setStatus } from '../ui/status.js';

export const importHistoryFile = async ({ file, status, setMessage, renderHistory }) => {
    if (!file) return;
    try {
        const text = await file.text();
        const imported = parseHistoryCsv(text);
        const existing = await getStoredHistory();
        const byKey = new Map();
        for (const it of [...existing, ...imported]) {
            const docNumber = it?.docNumber != null ? String(it.docNumber).trim() : '';
            const webCode = it?.webCode != null ? String(it.webCode).trim() : '';
            if (!docNumber && !webCode) continue;
            const key = `${docNumber}||${webCode}`;
            const prev = byKey.get(key);
            const note = it?.note != null ? String(it.note).trim() : '';
            if (!prev) { byKey.set(key, { docNumber, webCode, pageUrl: it?.pageUrl ? String(it.pageUrl).trim() : '', note, ts: typeof it?.ts === 'number' ? it.ts : 0 }); continue; }
            const ts = typeof it?.ts === 'number' ? it.ts : 0;
            if (ts > (prev.ts || 0)) prev.ts = ts;
            if (!prev.pageUrl && it?.pageUrl) prev.pageUrl = String(it.pageUrl).trim();
            if (!prev.note && note) prev.note = note;
        }
        const merged = Array.from(byKey.values()).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200);
        await storeHistory(merged);
        await renderHistory();
        setStatus(status, `Đã import (append) history. Tổng: ${merged.length} dòng, bỏ duplicate: ${Math.max(0, existing.length + imported.length - merged.length)} dòng.`, 'ok');
    } catch (e) { setStatus(status, 'Không import được history.', 'err'); setMessage(''); }
};
