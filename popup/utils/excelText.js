import { parseDelimitedText } from './delimited.js';
import { normalizeCompareValue } from './text.js';

export const looksLikeExcelHeaderRow = (cells) => {
    const joined = (cells || []).map(c => String(c == null ? '' : c).trim()).join(' ').toLowerCase();
    return /\b(mã\s*vt|ma\s*vt|tên\s*vt|ten\s*vt|đơn\s*vị|don\s*vi|số\s*lượng|so\s*luong|qty|unit)\b/i.test(joined);
};

export const aoaToPasteText = (aoa) => {
    const rows = (aoa || []).map(r => (Array.isArray(r) ? r : []).map(v => String(v == null ? '' : v).trim()));
    if (rows.length === 0) return '';
    const lines = [];
    for (const cols of rows) {
        if (!cols || cols.length === 0) continue;
        const nonEmpty = cols.filter(c => String(c || '').trim() !== '');
        if (nonEmpty.length === 0) continue;
        const colsExpanded = (() => {
            if (cols.length !== 1) return cols;
            const one = String(cols[0] || '').trim();
            if (!one) return cols;
            const parsed = parseDelimitedText(one);
            if (parsed && parsed[0] && Array.isArray(parsed[0]) && parsed[0].length > 1) return parsed[0];
            return cols;
        })();
        let out = [];
        if (colsExpanded.length >= 6) out = [colsExpanded[0] || '', colsExpanded[1] || '', colsExpanded[2] || '', colsExpanded[3] || '', colsExpanded[4] || '', colsExpanded[5] || ''];
        else if (colsExpanded.length >= 5) out = [colsExpanded[0] || '', colsExpanded[1] || '', colsExpanded[2] || '', colsExpanded[3] || '', colsExpanded[4] || '', ''];
        else if (colsExpanded.length >= 4) out = ['', colsExpanded[0] || '', colsExpanded[1] || '', colsExpanded[2] || '', colsExpanded[3] || '', ''];
        else continue;
        const hasAny = out.some((v, idx) => idx !== 0 && normalizeCompareValue(v) !== '');
        if (!hasAny) continue;
        lines.push(out.join('\t'));
    }
    return lines.join('\n');
};
