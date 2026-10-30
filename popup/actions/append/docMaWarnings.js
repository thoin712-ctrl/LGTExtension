import { normalizeDupValue } from '../../utils/text.js';

export const buildDocMaWarningLines = async ({ compareWebRows, existsInDataKetQuaByDocMa, getDataKetQuaStatusesByDocMa, limit = 40 }) => {
    const warnByRow = new Map();
    const docMaCounts = new Map();
    for (let i = 0; i < compareWebRows.length; i += 1) {
        const r = compareWebRows[i];
        if (!r) continue;
        const doc = String(r.doc == null ? '' : r.doc).trim();
        const ma = String(r.ma == null ? '' : r.ma).trim();
        const key = `${normalizeDupValue(doc || '-')}||${normalizeDupValue(ma || '-')}`;
        const prev = docMaCounts.get(key) || { count: 0, doc, ma, indices: [] };
        prev.count += 1;
        prev.indices.push(i + 1);
        docMaCounts.set(key, prev);
    }
    for (const x of Array.from(docMaCounts.values())) {
        if ((x.count || 0) < 2) continue;
        for (const idx of (x.indices || [])) {
            const prev = warnByRow.get(idx) || { doc: x.doc, ma: x.ma, reasons: new Set() };
            prev.reasons.add('trùng trong lần gửi này');
            warnByRow.set(idx, prev);
        }
    }
    for (let i = 0; i < compareWebRows.length; i += 1) {
        const r = compareWebRows[i];
        if (!r) continue;
        const ok = await existsInDataKetQuaByDocMa(r.doc, r.ma);
        if (ok !== true) continue;
        const idx = i + 1;
        const prev = warnByRow.get(idx) || { doc: r.doc, ma: r.ma, reasons: new Set(), statuses: new Set() };
        prev.reasons.add('đã có trong data_ket_qua');
        if (typeof getDataKetQuaStatusesByDocMa === 'function') {
            try {
                const list = await getDataKetQuaStatusesByDocMa(r.doc, r.ma);
                for (const s of (list || [])) prev.statuses.add(String(s || '').trim());
            } catch (e) {}
        }
        warnByRow.set(idx, prev);
    }
    const rowsSorted = Array.from(warnByRow.entries()).sort((a, b) => a[0] - b[0]);
    const limited = rowsSorted.slice(0, limit);
    const fmtStatuses = (info) => {
        const arr = Array.from(info?.statuses || []).map(s => String(s || '').trim()).filter(Boolean);
        return arr.length > 0 ? ` | Trạng thái: ${arr.join(' | ')}` : '';
    };
    const lines = limited.map(([idx, info]) => `Row ${idx}: ${info.doc} / ${info.ma} (${Array.from(info.reasons || []).join(', ')})${fmtStatuses(info)}`);
    if (rowsSorted.length > limited.length) lines.push(`... +${rowsSorted.length - limited.length} dòng warning`);
    return lines;
};
