export const escapeCsvValue = (value) => {
    const text = value == null ? '' : String(value);
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

export const escapeHtml = (value) => {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const normalizeCompareValue = (value) => String(value == null ? '' : value).trim();
export const normalizeCompareUpper = (value) => normalizeCompareValue(value).toUpperCase();
export const normalizeCompareUpperNoSpaces = (value) => normalizeCompareUpper(value).replace(/\s+/g, '');
export const normalizeDupValue = (value) => String(value == null ? '' : value).trim().toUpperCase();

export const normalizeHeaderForSearch = (value) => {
    const text = normalizeCompareValue(value);
    try {
        return text.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[＊*]/g, '')
            .replace(/[đĐ]/g, 'D')
            .trim().toUpperCase();
    } catch (e) {
        return text.replace(/\s+/g, ' ')
            .replace(/[＊*]/g, '')
            .replace(/[đĐ]/g, 'D')
            .trim().toUpperCase();
    }
};

export const compareMaVT = (a, b) => {
    const x = normalizeCompareUpper(a);
    const y = normalizeCompareUpper(b);
    if (x === y) return 0;
    return x < y ? -1 : 1;
};
