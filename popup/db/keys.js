import { normalizeDupValue, normalizeHeaderForSearch } from '../utils/text.js';
import { findHeaderIndex } from '../utils/header.js';

export const computeDupKeyFromFields = ({ doc, ma, dv, sl }) => {
    return `${normalizeDupValue(doc)}||${normalizeDupValue(ma)}||${normalizeDupValue(dv)}||${normalizeDupValue(sl)}`;
};

export const computeDocMaKeyFromFields = ({ doc, ma, allowDash }) => {
    const d0 = normalizeDupValue(doc);
    const m0 = normalizeDupValue(ma);
    const d = allowDash ? (d0 || '-') : d0;
    const m = allowDash ? (m0 || '-') : m0;
    if (!allowDash && (!d || !m || d === '-')) return '';
    return `${d}||${m}`;
};

export const getDupKeyByHeader = (headerRow, row) => {
    const r = Array.isArray(row) ? row : [];
    const header = Array.isArray(headerRow) ? headerRow : [];
    const headerNorm = header.map(h => normalizeHeaderForSearch(h));
    const hasPrColumns = headerNorm.includes('PR ONE') && headerNorm.includes('PR SAP');
    const offset = (hasPrColumns ? 2 : 0) + (headerNorm.includes('NGAY DUYET') || headerNorm.includes('NGAYDUYET') ? 1 : 0);
    const idxDoc = findHeaderIndex(headerRow, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const idxMa = findHeaderIndex(headerRow, [{ type: 'includes', value: 'MA SAN PHAM' }, { type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
    const idxDv = findHeaderIndex(headerRow, [{ type: 'eq', value: 'DVT' }, { type: 'includes', value: 'DON VI' }]);
    const idxSl = findHeaderIndex(headerRow, [{ type: 'includes', value: 'SO LUONG' }, { type: 'eq', value: 'SL' }, { type: 'eq', value: 'QTY' }]);
    const cDoc = normalizeDupValue(idxDoc >= 0 ? r[idxDoc] : r[0]);
    const cMa = normalizeDupValue(idxMa >= 0 ? r[idxMa] : r[4 + offset]);
    const cDv = normalizeDupValue(idxDv >= 0 ? r[idxDv] : r[7 + offset]);
    const cSl = normalizeDupValue(idxSl >= 0 ? r[idxSl] : r[6 + offset]);
    return `${cDoc}||${cMa}||${cDv}||${cSl}`;
};

export const formatDupColumnsByHeader = (headerRow, row) => {
    const r = Array.isArray(row) ? row : [];
    const header = Array.isArray(headerRow) ? headerRow : [];
    const headerNorm = header.map(h => normalizeHeaderForSearch(h));
    const hasPrColumns = headerNorm.includes('PR ONE') && headerNorm.includes('PR SAP');
    const offset = (hasPrColumns ? 2 : 0) + (headerNorm.includes('NGAY DUYET') || headerNorm.includes('NGAYDUYET') ? 1 : 0);
    const idxDoc = findHeaderIndex(headerRow, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const idxMa = findHeaderIndex(headerRow, [{ type: 'includes', value: 'MA SAN PHAM' }, { type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
    const idxDv = findHeaderIndex(headerRow, [{ type: 'eq', value: 'DVT' }, { type: 'includes', value: 'DON VI' }]);
    const idxSl = findHeaderIndex(headerRow, [{ type: 'includes', value: 'SO LUONG' }, { type: 'eq', value: 'SL' }, { type: 'eq', value: 'QTY' }]);
    const doc = normalizeDupValue(idxDoc >= 0 ? r[idxDoc] : r[0]);
    const ma = normalizeDupValue(idxMa >= 0 ? r[idxMa] : r[4 + offset]);
    const dv = normalizeDupValue(idxDv >= 0 ? r[idxDv] : r[7 + offset]);
    const sl = normalizeDupValue(idxSl >= 0 ? r[idxSl] : r[6 + offset]);
    return `Số tài liệu="${doc}", Mã="${ma}", ĐVT="${dv}", Số lượng="${sl}"`;
};
