import { parseDelimitedText } from '../utils/delimited.js';
import { findHeaderIndex } from '../utils/header.js';
import { normalizeDataKetQuaRowsForPrColumns } from '../db/migrate.js';
import { DATA_KET_QUA_CANONICAL_HEADER, DATA_KET_QUA_IDX } from '../db/constants.js';
import { setStatus } from '../ui/status.js';
import { appendDataKetQuaRowsToFirebase, fetchDataKetQuaRowsByDoc } from '../services/firebase.js';

export const importDataKetQuaFile = async ({ file, status, setMessage, onAfterImport }) => {
    if (!file) return;
    try {
        const name = String(file?.name || '').toLowerCase();
        let rows0 = [];
        if (name.endsWith('.xlsx')) {
            if (!window.XLSX?.read || !window.XLSX?.utils) { setStatus(status, 'Thiếu thư viện đọc Excel. Hãy reload extension.', 'err'); return; }
            const buf = await file.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const sheetName = wb?.SheetNames?.[0] || '';
            const ws = sheetName ? wb.Sheets[sheetName] : null;
            if (!ws) { setStatus(status, 'Không đọc được sheet trong file Excel.', 'err'); return; }
            rows0 = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        } else rows0 = parseDelimitedText(await file.text());
        const imported0 = normalizeDataKetQuaRowsForPrColumns(rows0);
        if (!imported0?.length || !Array.isArray(imported0[0]) || imported0[0].length === 0) { setStatus(status, 'File import không có dữ liệu.', 'warn'); return; }
        const toCanonical = (rowsIn) => {
            const clean = Array.isArray(rowsIn) ? rowsIn.filter(r => Array.isArray(r) && r.length > 0) : [];
            if (clean.length === 0) return [DATA_KET_QUA_CANONICAL_HEADER];
            const header = clean[0] || [];
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
            const getAt = (row, idx) => (idx >= 0 && idx < row.length ? (row[idx] == null ? '' : String(row[idx])) : '');
            const out = [DATA_KET_QUA_CANONICAL_HEADER];
            for (const r of clean.slice(1)) {
                const row = Array.isArray(r) ? r : [];
                const status = idxStatus >= 0 ? getAt(row, idxStatus) : 'ĐÃ DUYỆT';
                const canonicalRow = new Array(DATA_KET_QUA_CANONICAL_HEADER.length).fill('');
                canonicalRow[DATA_KET_QUA_IDX.DOC] = getAt(row, idxDoc >= 0 ? idxDoc : 0);
                canonicalRow[DATA_KET_QUA_IDX.PR_ONE] = getAt(row, idxPrOne);
                canonicalRow[DATA_KET_QUA_IDX.PR_SAP] = getAt(row, idxPrSap);
                canonicalRow[DATA_KET_QUA_IDX.NGAY_DUYET] = getAt(row, idxNgayDuyet);
                canonicalRow[DATA_KET_QUA_IDX.PR_TYPE] = getAt(row, idxPrType);
                canonicalRow[DATA_KET_QUA_IDX.MA_VT] = getAt(row, idxMa);
                canonicalRow[DATA_KET_QUA_IDX.TEN_VT] = getAt(row, idxTen);
                canonicalRow[DATA_KET_QUA_IDX.DVT] = getAt(row, idxDv);
                canonicalRow[DATA_KET_QUA_IDX.SL] = getAt(row, idxSl);
                canonicalRow[DATA_KET_QUA_IDX.STATUS] = status;
                canonicalRow[DATA_KET_QUA_IDX.GHI_CHU] = getAt(row, idxGhiChu);
                out.push(canonicalRow);
            }
            return out;
        };
        const imported = toCanonical(imported0);
        const incomingRows = imported.slice(1).filter(row => Array.isArray(row) && row.some(value => String(value || '').trim()));
        const seen = new Set();
        const uniqueIncoming = [];
        let dropped = 0;
        for (const row of incomingRows) {
            const key = JSON.stringify(row);
            if (seen.has(key)) { dropped += 1; continue; }
            seen.add(key);
            uniqueIncoming.push(row);
        }

        const docs = Array.from(new Set(uniqueIncoming
            .map(row => String(row[DATA_KET_QUA_IDX.DOC] || '').trim())
            .filter(doc => doc && doc !== '-')));
        const existingKeys = new Set();
        for (let i = 0; i < docs.length; i += 8) {
            const batch = await Promise.all(docs.slice(i, i + 8).map(doc => fetchDataKetQuaRowsByDoc(doc)));
            for (const records of batch) {
                for (const { row } of records) existingKeys.add(JSON.stringify(row));
            }
        }
        const rowsToAppend = uniqueIncoming.filter(row => {
            const key = JSON.stringify(row);
            if (existingKeys.has(key)) { dropped += 1; return false; }
            existingKeys.add(key);
            return true;
        });
        await appendDataKetQuaRowsToFirebase(rowsToAppend);
        setStatus(status, `Đã import trực tiếp lên Firebase. Thêm ${rowsToAppend.length} dòng, bỏ duplicate: ${dropped} dòng.`, 'ok');
        if (typeof onAfterImport === 'function') await onAfterImport();
    } catch (e) {
        setStatus(status, `Không import được data_ket_qua lên Firebase: ${e?.message || e}`, 'err');
        setMessage('');
    }
};
