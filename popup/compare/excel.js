import { parseDelimitedText } from '../utils/delimited.js';
import { normalizeCompareValue } from '../utils/text.js';
import { EXCEL_PARSE_IDX } from '../db/constants.js';

export const parseExcelPaste = (text) => {
    const parsed = Array.isArray(text) ? text : parseDelimitedText(text);
    if (parsed.length === 0) return [];
    const toExcelQuantity = (value) => (value == null ? '' : String(value).replace(/[\r\n]+/g, ' ').trim());
    const cleanCell = (v) => (v == null ? '' : String(v).replace(/[\r\n]+/g, ' ').trim());
    const rows = [];
    for (const cols0 of parsed) {
        const cols = (cols0 || []).map(cleanCell);
        const nonEmpty = cols.filter(c => c !== '');
        if (nonEmpty.length === 0) continue;
        if (cols.length >= 6) rows.push({ stt: '', doc: cols[EXCEL_PARSE_IDX.DOC] || '-', ma: cols[EXCEL_PARSE_IDX.MA] || '', ten: cols[EXCEL_PARSE_IDX.TEN] || '', dv: cols[EXCEL_PARSE_IDX.DV] || '', sl: toExcelQuantity(cols[EXCEL_PARSE_IDX.SL]), ghiChu: cols[EXCEL_PARSE_IDX.GHI_CHU] || '' });
        else if (cols.length >= 5) rows.push({ stt: '', doc: cols[EXCEL_PARSE_IDX.DOC] || '-', ma: cols[EXCEL_PARSE_IDX.MA] || '', ten: cols[EXCEL_PARSE_IDX.TEN] || '', dv: cols[EXCEL_PARSE_IDX.DV] || '', sl: toExcelQuantity(cols[EXCEL_PARSE_IDX.SL]), ghiChu: '' });
        else if (cols.length >= 4) rows.push({ stt: '', doc: '', ma: cols[0] || '', ten: cols[1] || '', dv: cols[2] || '', sl: toExcelQuantity(cols[3]), ghiChu: '' });
        else if (cols.length >= 2) rows.push({ stt: '', doc: '', ma: cols[0] || '', ten: cols[1] || '', dv: cols[2] || '', sl: toExcelQuantity(cols[3]), ghiChu: '' });
    }
    const filtered = rows.filter(r => normalizeCompareValue(r.ma) !== '' || normalizeCompareValue(r.ten) !== '' || normalizeCompareValue(r.dv) !== '' || normalizeCompareValue(r.sl) !== '');
    let currentDoc = '';
    const sttByDoc = new Map();
    // Không normalize mã tài liệu để giữ nguyên dấu "/"
    const keepOriginalDoc = (v) => String(v || '').trim();
    const normDocKey = (v) => normalizeCompareValue(v).toUpperCase();
    for (const r of filtered) {
        const docRaw = keepOriginalDoc(r.doc);
        const docKey = normDocKey(docRaw);
        if (docKey && docKey !== '-') currentDoc = docRaw;
        // Lưu lại mã tài liệu gốc để giữ dấu "/"
        r.doc = currentDoc || docRaw || '-';
        const key = normDocKey(currentDoc) || '';
        const next = (sttByDoc.get(key) || 0) + 1;
        sttByDoc.set(key, next);
        r.stt = String(next);
    }
    return filtered;
};
