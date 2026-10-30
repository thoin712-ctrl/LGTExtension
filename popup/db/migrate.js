import { parseDelimitedText } from '../utils/delimited.js';
import { normalizeHeaderForSearch } from '../utils/text.js';
import { findHeaderIndex } from '../utils/header.js';
import { DATA_KET_QUA_CANONICAL_HEADER } from './constants.js';
import { countDataKetQuaDbRows, replaceDataKetQuaDbWithRows } from './repo.js';

export const normalizeDataKetQuaRowsForPrColumns = (rows) => {
    const clean = Array.isArray(rows) ? rows.filter(r => Array.isArray(r) && r.length > 0) : [];
    if (clean.length === 0) return [];
    const header = clean[0] || [];
    const headerNorm = header.map(h => normalizeHeaderForSearch(h));
    const hasPrOne = headerNorm.includes('PR ONE');
    const hasPrSap = headerNorm.includes('PR SAP');
    const hasNgayDuyet = headerNorm.includes('NGAY DUYET') || headerNorm.includes('NGAYDUYET');
    const hasPrType = headerNorm.includes('LOAI PR');
    if (hasPrOne && hasPrSap && hasNgayDuyet && hasPrType) return clean;
    const idxDoc = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const docIdx = idxDoc >= 0 ? idxDoc : 0;
    const fixedHeader = header.slice();
    const insertAt = (arr, at, value) => arr.splice(Math.max(0, Math.min(arr.length, at)), 0, value);
    let insertPos = docIdx + 1;
    if (!hasPrOne) { insertAt(fixedHeader, insertPos, 'PR One'); insertPos += 1; } else insertPos = fixedHeader.map(h => normalizeHeaderForSearch(h)).indexOf('PR ONE') + 1;
    if (!hasPrSap) { insertAt(fixedHeader, insertPos, 'PR SAP'); insertPos += 1; } else insertPos = fixedHeader.map(h => normalizeHeaderForSearch(h)).indexOf('PR SAP') + 1;
    if (!hasNgayDuyet) { insertAt(fixedHeader, insertPos, 'Ngày duyệt'); insertPos += 1; } else insertPos = fixedHeader.map(h => normalizeHeaderForSearch(h)).indexOf(headerNorm.includes('NGAY DUYET') ? 'NGAY DUYET' : 'NGAYDUYET') + 1;
    if (!hasPrType) insertAt(fixedHeader, insertPos, 'Loại PR');
    const fixedHeaderNorm = fixedHeader.map(h => normalizeHeaderForSearch(h));
    const idxPrOneNew = fixedHeaderNorm.indexOf('PR ONE');
    const idxPrSapNew = fixedHeaderNorm.indexOf('PR SAP');
    const idxNgayDuyetNew = fixedHeaderNorm.includes('NGAY DUYET') ? fixedHeaderNorm.indexOf('NGAY DUYET') : fixedHeaderNorm.indexOf('NGAYDUYET');
    const idxPrTypeNew = fixedHeaderNorm.indexOf('LOAI PR');
    const out = [fixedHeader];
    for (const row of clean.slice(1)) {
        const r0 = Array.isArray(row) ? row.slice() : [];
        while (r0.length < header.length) r0.push('');
        const next = r0.slice();
        if (!hasPrOne && idxPrOneNew >= 0) next.splice(idxPrOneNew, 0, '');
        if (!hasPrSap && idxPrSapNew >= 0) next.splice(idxPrSapNew, 0, '');
        if (!hasNgayDuyet && idxNgayDuyetNew >= 0) next.splice(idxNgayDuyetNew, 0, '');
        if (!hasPrType && idxPrTypeNew >= 0) next.splice(idxPrTypeNew, 0, '');
        out.push(next);
    }
    return out;
};

export const migrateDataKetQuaFromLocalStorageToDbIfNeeded = async () => {
    let csvText = '';
    try { csvText = localStorage.getItem('data_ket_qua_csv') || ''; } catch (e) { csvText = ''; }
    if (!csvText || !csvText.trim()) return { ok: true, migrated: false };
    const count = await countDataKetQuaDbRows();
    if (count > 0) return { ok: true, migrated: false };
    const rows0 = parseDelimitedText(csvText) || [];
    if (rows0[0] && rows0[0][0]) rows0[0][0] = String(rows0[0][0]).replace(/^\ufeff/, '');
    const normalized = normalizeDataKetQuaRowsForPrColumns(rows0);
    if (!normalized || normalized.length <= 1) return { ok: true, migrated: false };
    const header = normalized[0] || [];
    const idxDoc = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const idxPrOne = findHeaderIndex(header, [{ type: 'eq', value: 'PR ONE' }]);
    const idxPrSap = findHeaderIndex(header, [{ type: 'eq', value: 'PR SAP' }]);
    const idxNgayDuyet = findHeaderIndex(header, [{ type: 'includes', value: 'NGAY DUYET' }, { type: 'includes', value: 'NGAYDUYET' }]);
    const idxPrType = findHeaderIndex(header, [{ type: 'includes', value: 'LOAI PR' }]);
    const idxMa = findHeaderIndex(header, [{ type: 'includes', value: 'MA SAN PHAM' }, { type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
    const idxTen = findHeaderIndex(header, [{ type: 'includes', value: 'TEN SAN PHAM' }, { type: 'includes', value: 'TEN VT' }, { type: 'eq', value: 'TEN' }]);
    const idxDv = findHeaderIndex(header, [{ type: 'eq', value: 'DVT' }, { type: 'includes', value: 'DON VI' }]);
    const idxSl = findHeaderIndex(header, [{ type: 'includes', value: 'SO LUONG' }, { type: 'eq', value: 'SL' }, { type: 'eq', value: 'QTY' }]);
    const idxStatus = findHeaderIndex(header, [{ type: 'includes', value: 'TRANG THAI' }, { type: 'includes', value: 'STATUS' }]);
    const idxGhiChu = findHeaderIndex(header, [{ type: 'includes', value: 'GHI CHU' }, { type: 'includes', value: 'NOTE' }]);
    const canonical = [DATA_KET_QUA_CANONICAL_HEADER];
    for (const r of normalized.slice(1)) {
        const row = Array.isArray(r) ? r : [];
        const getAt = (idx) => (idx >= 0 && idx < row.length ? (row[idx] == null ? '' : String(row[idx])) : '');
        const status = idxStatus >= 0 ? getAt(idxStatus) : 'ĐÃ DUYỆT';
        canonical.push([
            getAt(idxDoc >= 0 ? idxDoc : 0),
            getAt(idxPrOne),
            getAt(idxPrSap),
            getAt(idxNgayDuyet),
            getAt(idxPrType),
            getAt(idxMa),
            getAt(idxTen),
            getAt(idxDv),
            getAt(idxSl),
            status,
            getAt(idxGhiChu)
        ]);
    }
    await replaceDataKetQuaDbWithRows(canonical);
    try { localStorage.removeItem('data_ket_qua_csv'); localStorage.removeItem('data_ket_qua_csv_ts'); } catch (e) {}
    return { ok: true, migrated: true };
};
