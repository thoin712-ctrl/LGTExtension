import { WEB_EXTRACT_IDX } from '../db/constants.js';

export const mapWebToCompareRows = (rows, opts) => {
    const mode = (opts && opts.mode) ? String(opts.mode) : '';
    const prSapFallback = opts && opts.prSap ? String(opts.prSap) : '';
    const clean = (rows || []).filter(r => Array.isArray(r) && r.length > 0);
    if (clean.length === 0) return [];
    const out = [];
    const fold = (s) => {
        const t = String(s == null ? '' : s);
        try { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
        catch (e) { return t.replace(/\s+/g, ' ').trim().toUpperCase(); }
    };
    const looksLikeWebMainHeaderRow = (row) => {
        const cells = (row || []).map(c => fold(c)).filter(Boolean);
        if (cells.length === 0) return false;
        const keys = [
            'DUYET',
            'CHI TIET',
            'STT',
            'MA SAN PHAM',
            'MA VT',
            'TEN SAN PHAM',
            'TEN VT',
            'SO LUONG',
            'DVT',
            'NGAY NHAN HANG',
            'GIA UOC TINH'
        ];
        let hit = 0;
        for (const k of keys) {
            if (cells.some(c => c === k || c.includes(k))) hit += 1;
        }
        return hit >= 3;
    };

    for (const row of clean) {
        if (!Array.isArray(row)) continue;
        if (looksLikeWebMainHeaderRow(row)) continue;
        const toDashIfEmpty = (value) => {
            if (value == null) return '-';
            const t = String(value).trim();
            return t === '' ? '-' : t;
        };
        
        const prSap0 = (row[WEB_EXTRACT_IDX.PR_SAP] != null ? row[WEB_EXTRACT_IDX.PR_SAP] : prSapFallback);
        const prSap = toDashIfEmpty(prSap0 != null ? prSap0 : prSapFallback);
        const ma = toDashIfEmpty(row[WEB_EXTRACT_IDX.MA]);
        const ten = toDashIfEmpty(row[WEB_EXTRACT_IDX.TEN]);
        const sl0 = toDashIfEmpty(row[WEB_EXTRACT_IDX.SL]);
        const sl = sl0;
        const dv0 = (mode === 'cancel' ? (row[7] != null ? row[7] : row[WEB_EXTRACT_IDX.DV]) : row[WEB_EXTRACT_IDX.DV]);
        const dv = toDashIfEmpty(dv0);
        const ghiChu = '-';
        
        const stt = String(out.length + 1);
        const res = { stt, doc: '-', ma, ten, dv, sl, ghiChu };
        if (mode === 'cancel') res.prSap = prSap;
        out.push(res);
    }
    return out;
};
