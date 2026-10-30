import { normalizeHeaderForSearch } from './text.js';

export const findHeaderIndex = (headerRow, matchers) => {
    const header = Array.isArray(headerRow) ? headerRow : [];
    for (let i = 0; i < header.length; i += 1) {
        const h = normalizeHeaderForSearch(header[i]);
        for (const m of matchers) {
            if (m.type === 'eq' && h === m.value) return i;
            if (m.type === 'includes' && h.includes(m.value)) return i;
        }
    }
    return -1;
};

export const looksLikeHeaderRow = (row) => {
    if (!Array.isArray(row) || row.length === 0) return false;
    const cells = row.map(v => (v == null ? '' : String(v)).trim()).filter(v => v !== '');
    if (cells.length === 0) return false;
    const joined = cells.join(' ').toLowerCase();
    const keywordRegex = /\b(stt|no\.?|mã|ten|tên|số lượng|sl\b|qty|đvt|unit|đơn giá|thành tiền|ngày|ghi chú|mã sản phẩm|tên sản phẩm)\b/i;
    if (keywordRegex.test(joined)) return true;
    const numericCount = cells.reduce((acc, c) => acc + (/\d/.test(c) ? 1 : 0), 0);
    return (numericCount / cells.length) <= 0.2 && cells.length >= 2;
};
