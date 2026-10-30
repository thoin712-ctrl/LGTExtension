import { fetchAllDataKetQuaFromFirebase } from '../services/firebase.js';
import { findHeaderIndex } from '../utils/header.js';
import { escapeHtml } from '../utils/text.js';

const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
const parseNumber = (v) => {
    const s0 = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '').trim();
    if (!s0) return NaN;
    const s = (s0.includes(',') && s0.includes('.')) ? s0.replace(/\./g, '').replace(/,/g, '.') : s0.replace(/,/g, '.');
    return Number(s);
};
const parseDateMs = (raw) => {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return NaN;
    const ms0 = Date.parse(s);
    if (Number.isFinite(ms0)) return ms0;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return NaN;
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    const hh = Number(m[4] || 0), mm = Number(m[5] || 0), ss = Number(m[6] || 0);
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : NaN;
};
const dateStartMs = (yyyyMmDd) => {
    const s = String(yyyyMmDd || '').trim();
    if (!s) return NaN;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
};
const dateEndMs = (yyyyMmDd) => {
    const start = dateStartMs(yyyyMmDd);
    if (!Number.isFinite(start)) return NaN;
    return start + 24 * 60 * 60 * 1000 - 1;
};

export const buildDataKetQuaSummaryReportHtml = async ({ dateFrom, dateTo, docFilter }) => {
    const all = await fetchAllDataKetQuaFromFirebase();
    const header = Array.isArray(all?.[0]) ? all[0] : [];
    if (header.length === 0) return '<div class="p-3 small text-secondary">Chưa có data_ket_qua.</div>';
    const idxDoc = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const idxPrOne = findHeaderIndex(header, [{ type: 'eq', value: 'PR ONE' }]);
    const idxNgay = findHeaderIndex(header, [{ type: 'includes', value: 'NGAY DUYET' }]);
    const idxMa = findHeaderIndex(header, [{ type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
    const idxSl = findHeaderIndex(header, [{ type: 'includes', value: 'SO LUONG' }]);
    const idxStatus = findHeaderIndex(header, [{ type: 'includes', value: 'TRANG THAI' }, { type: 'includes', value: 'STATUS' }]);
    const rows = all.slice(1).filter(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
    const fromMs = dateStartMs(dateFrom);
    const toMs = dateEndMs(dateTo);
    const hasRange = Number.isFinite(fromMs) || Number.isFinite(toMs);
    const docF = norm(docFilter);
    const groups = new Map();
    let skippedInvalidDate = 0;
    for (const r of rows) {
        const ms = idxNgay >= 0 ? parseDateMs(r[idxNgay]) : NaN;
        if (hasRange) {
            if (!Number.isFinite(ms)) { skippedInvalidDate += 1; continue; }
            if (Number.isFinite(fromMs) && ms < fromMs) continue;
            if (Number.isFinite(toMs) && ms > toMs) continue;
        }
        const doc = idxDoc >= 0 ? String(r[idxDoc] == null ? '' : r[idxDoc]).trim() : '';
        if (docF) {
            const d0 = norm(doc);
            if (d0 !== docF && !d0.includes(docF) && !docF.includes(d0)) continue;
        }
        const prOne = idxPrOne >= 0 ? String(r[idxPrOne] == null ? '' : r[idxPrOne]).trim() : '';
        const key = `${norm(doc)}||${norm(prOne)}`;
        const g0 = groups.get(key) || { doc, prOne, rows: 0, mas: new Set(), sum: 0, hasSum: false, latestMs: -Infinity, latestRaw: '', approved: 0, canceled: 0 };
        g0.rows += 1;
        if (idxMa >= 0) { const ma = norm(r[idxMa]); if (ma) g0.mas.add(ma); }
        if (idxSl >= 0) { const n = parseNumber(r[idxSl]); if (Number.isFinite(n)) { g0.sum += n; g0.hasSum = true; } }
        const st = idxStatus >= 0 ? norm(r[idxStatus]) : '';
        if (st.includes('HUY') || st.includes('HỦY')) g0.canceled += 1;
        else g0.approved += 1;
        if (Number.isFinite(ms) && ms > g0.latestMs) { g0.latestMs = ms; g0.latestRaw = idxNgay >= 0 ? String(r[idxNgay] == null ? '' : r[idxNgay]).trim() : ''; }
        groups.set(key, g0);
    }
    const list = Array.from(groups.values()).sort((a, b) => {
        const x = norm(a.doc), y = norm(b.doc);
        if (x !== y) return x < y ? -1 : 1;
        const p = norm(a.prOne), q = norm(b.prOne);
        if (p !== q) return p < q ? -1 : 1;
        return 0;
    });
    const totalRows = list.reduce((acc, g) => acc + g.rows, 0);
    const totalSum = list.reduce((acc, g) => acc + (g.hasSum ? g.sum : 0), 0);
    const totalApproved = list.reduce((acc, g) => acc + (g.approved || 0), 0);
    const totalCanceled = list.reduce((acc, g) => acc + (g.canceled || 0), 0);
    const hasSum = list.some(g => g.hasSum);
    const rangeText = `${dateFrom ? escapeHtml(dateFrom) : '...'} → ${dateTo ? escapeHtml(dateTo) : '...'}`;
    const docText = docFilter ? escapeHtml(String(docFilter)) : '(tất cả)';
    const head = `<div class="p-3 border-bottom"><div class="d-flex flex-wrap gap-2 align-items-center justify-content-between"><div class="fw-semibold">Report summary</div><div class="small text-secondary">Tài liệu: <span class="fw-semibold">${docText}</span> | Ngày duyệt: <span class="fw-semibold">${rangeText}</span></div></div><div class="small text-secondary mt-1">Group: <span class="fw-semibold">${list.length}</span> | Dòng: <span class="fw-semibold">${totalRows}</span> | Duyệt: <span class="fw-semibold">${totalApproved}</span> | Hủy: <span class="fw-semibold">${totalCanceled}</span>${hasSum ? ` | Tổng SL: <span class="fw-semibold">${totalSum}</span>` : ''}${skippedInvalidDate ? ` | Bỏ qua: <span class="fw-semibold">${skippedInvalidDate}</span> (Ngày duyệt lỗi)` : ''}</div></div>`;
    const limit = 200;
    const bodyRows = list.slice(0, limit).map(g => `<tr><td class="col-doc">${escapeHtml(g.doc)}</td><td>${escapeHtml(g.prOne)}</td><td>${g.rows}</td><td>${g.approved || 0}</td><td>${g.canceled || 0}</td><td>${g.mas.size}</td><td>${g.hasSum ? g.sum : ''}</td><td>${escapeHtml(g.latestRaw || '')}</td></tr>`).join('');
    const foot = list.length > limit ? `<div class="p-2 small text-secondary border-top">Preview giới hạn ${limit} group (tổng ${list.length}).</div>` : '';
    const table = `<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-0"><thead class="table-light"><tr><th class="col-doc">Mã tài liệu</th><th>PR One</th><th>Dòng</th><th>Duyệt</th><th>Hủy</th><th>VT</th><th>Tổng SL</th><th>Mới nhất</th></tr></thead><tbody>${bodyRows || `<tr><td colspan="8" class="text-secondary small p-3">Không có dữ liệu phù hợp.</td></tr>`}</tbody></table></div>`;
    return `${head}${table}${foot}`;
};

export const exportDataKetQuaSummaryReportToExcel = async ({ dateFrom, dateTo, docFilter }) => {
    const XLSX = globalThis?.XLSX;
    if (!XLSX || !XLSX.utils) return { ok: false, error: 'Thiếu thư viện XLSX.' };
    const all = await fetchAllDataKetQuaFromFirebase();
    const header = Array.isArray(all?.[0]) ? all[0] : [];
    if (header.length === 0) return { ok: false, error: 'Chưa có data_ket_qua.' };
    const idxDoc = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);
    const idxPrOne = findHeaderIndex(header, [{ type: 'eq', value: 'PR ONE' }]);
    const idxNgay = findHeaderIndex(header, [{ type: 'includes', value: 'NGAY DUYET' }]);
    const idxMa = findHeaderIndex(header, [{ type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
    const idxSl = findHeaderIndex(header, [{ type: 'includes', value: 'SO LUONG' }]);
    const idxStatus = findHeaderIndex(header, [{ type: 'includes', value: 'TRANG THAI' }, { type: 'includes', value: 'STATUS' }]);
    const rows = all.slice(1).filter(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
    const fromMs = dateStartMs(dateFrom);
    const toMs = dateEndMs(dateTo);
    const hasRange = Number.isFinite(fromMs) || Number.isFinite(toMs);
    const docF = norm(docFilter);
    const groups = new Map();
    for (const r of rows) {
        const ms = idxNgay >= 0 ? parseDateMs(r[idxNgay]) : NaN;
        if (hasRange) {
            if (!Number.isFinite(ms)) continue;
            if (Number.isFinite(fromMs) && ms < fromMs) continue;
            if (Number.isFinite(toMs) && ms > toMs) continue;
        }
        const doc = idxDoc >= 0 ? String(r[idxDoc] == null ? '' : r[idxDoc]).trim() : '';
        if (docF) {
            const d0 = norm(doc);
            if (d0 !== docF && !d0.includes(docF) && !docF.includes(d0)) continue;
        }
        const prOne = idxPrOne >= 0 ? String(r[idxPrOne] == null ? '' : r[idxPrOne]).trim() : '';
        const key = `${norm(doc)}||${norm(prOne)}`;
        const g0 = groups.get(key) || { doc, prOne, rows: 0, mas: new Set(), sum: 0, hasSum: false, latestMs: -Infinity, latestRaw: '', approved: 0, canceled: 0 };
        g0.rows += 1;
        if (idxMa >= 0) { const ma = norm(r[idxMa]); if (ma) g0.mas.add(ma); }
        if (idxSl >= 0) { const n = parseNumber(r[idxSl]); if (Number.isFinite(n)) { g0.sum += n; g0.hasSum = true; } }
        const st = idxStatus >= 0 ? norm(r[idxStatus]) : '';
        if (st.includes('HUY') || st.includes('HỦY')) g0.canceled += 1;
        else g0.approved += 1;
        if (Number.isFinite(ms) && ms > g0.latestMs) { g0.latestMs = ms; g0.latestRaw = idxNgay >= 0 ? String(r[idxNgay] == null ? '' : r[idxNgay]).trim() : ''; }
        groups.set(key, g0);
    }
    const list = Array.from(groups.values()).sort((a, b) => norm(a.doc).localeCompare(norm(b.doc)) || norm(a.prOne).localeCompare(norm(b.prOne)));
    const aoa = [['Mã tài liệu', 'PR One', 'Dòng', 'Duyệt', 'Hủy', 'VT', 'Tổng SL', 'Mới nhất'], ...list.map(g => [g.doc, g.prOne, g.rows, g.approved || 0, g.canceled || 0, g.mas.size, g.hasSum ? g.sum : '', g.latestRaw || ''])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const safe = (s) => String(s || '').replace(/[^\w\-]+/g, '_');
    const name = `report_data_ket_qua_${safe(docFilter || 'all')}_${safe(dateFrom || 'from')}_${safe(dateTo || 'to')}.xlsx`;
    XLSX.writeFile(wb, name);
    return { ok: true };
};
