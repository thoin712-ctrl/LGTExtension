import { escapeHtml } from '../utils/text.js';
import { FIREBASE_CONFIG } from '../db/constants.js';
import { getWebApprovalHistoryFromDb, getWebApprovalHistoryKeySetFromDb, appendWebApprovalHistoryToDb } from './db.js';

const normText = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const fold = (v) => normText(v).toUpperCase();
const parseTs = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v || 0);
    if (Number.isFinite(n) && n > 0) return n;
    const s = normText(v);
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
};

export const createWebHistoryUi = ({ statusEl, setStatus, tableBodyEl, searchInputEl, infoEl, btnReloadEl }) => {
    const state = { all: [], filtered: [] };
    let syncing = false;

    const applyFilter = () => {
        const q = fold(searchInputEl?.value || '');
        state.filtered = q ? state.all.filter(it => fold(it.code).includes(q) || fold(it.url).includes(q)) : state.all;
    };

    const render = () => {
        if (!tableBodyEl) return;
        const rows = state.filtered;
        tableBodyEl.innerHTML = rows.map(it => {
            const ts = it.ts ? new Date(it.ts).toLocaleString() : '';
            const ngay = it.ngayDuyet ? String(it.ngayDuyet) : ts;
            const url = normText(it.url);
            const link = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(url)}</a>` : '';
            return `<tr><td>${escapeHtml(ngay)}</td><td class="fw-semibold">${escapeHtml(it.code)}</td><td>${link}</td></tr>`;
        }).join('');
        if (infoEl) infoEl.textContent = `Tổng: ${state.filtered.length}`;
    };

    const load = async () => {
        if (!tableBodyEl) return;
        setStatus(statusEl, 'Đang tải history web...', 'info');
        try {
            state.all = await getWebApprovalHistoryFromDb(300);
            applyFilter();
            render();
            setStatus(statusEl, 'Đã tải history web.', 'ok');
        } catch (e) {
            setStatus(statusEl, 'Không tải được history web.', 'err');
        }
    };

    const buildFirebaseHistoryUrl = () => {
        if (!FIREBASE_CONFIG.syncEnabled) return '';
        const base = String(FIREBASE_CONFIG.databaseURL || '').trim().replace(/\/+$/, '');
        if (!base) return '';
        const qs = new URLSearchParams();
        if (FIREBASE_CONFIG.apiKey) qs.set('auth', FIREBASE_CONFIG.apiKey);
        qs.set('orderBy', '"$key"');
        qs.set('limitToLast', '600');
        return `${base}/history_web.json?${qs.toString()}`;
    };

    const fetchHistoryFromFirebase = async () => {
        const baseUrl = buildFirebaseHistoryUrl();
        if (!baseUrl) return [];
        const tryFetch = async (url) => {
            const res = await fetch(url);
            const text = await res.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
            return { ok: res.ok, status: res.status, json };
        };

        let data = null;
        try {
            const r = await tryFetch(baseUrl);
            if (!r.ok) return [];
            data = r.json;
        } catch (e) {
            return [];
        }

        const values = data && typeof data === 'object' ? Object.values(data) : [];
        const out = [];
        for (const v0 of values) {
            const v = v0 && typeof v0 === 'object' ? v0 : {};
            const code = normText(v.code);
            const url0 = normText(v.url);
            const ngayDuyet = normText(v.ngayDuyet || v.ngay_duyet || v.ngayDuyetText || v.time || v.timestamp || '');
            const ts = parseTs(v.ts || v.timestamp || v.time || ngayDuyet);
            if (!code) continue;
            out.push({ code, url: url0, ts, ngayDuyet });
        }
        out.sort((a, b) => (b.ts - a.ts) || fold(a.code).localeCompare(fold(b.code)));
        return out.slice(0, 600);
    };

    const syncFromFirebase = async () => {
        if (syncing) return;
        syncing = true;
        try {
            setStatus(statusEl, 'Đang sync history web từ Firebase...', 'info');
            const remote = await fetchHistoryFromFirebase();
            if (remote.length === 0) { await load(); setStatus(statusEl, 'Không có dữ liệu history web trên Firebase.', 'warn'); return; }
            const existingKeys = await getWebApprovalHistoryKeySetFromDb(8000);
            const added = await appendWebApprovalHistoryToDb(remote, existingKeys);
            await load();
            setStatus(statusEl, added > 0 ? `Đã sync history web: thêm ${added} dòng mới.` : 'History web đã mới nhất (không có dòng mới).', 'ok');
        } catch (e) {
            setStatus(statusEl, 'Không sync được history web từ Firebase.', 'err');
            await load();
        } finally {
            syncing = false;
        }
    };

    searchInputEl?.addEventListener('input', () => { applyFilter(); render(); });
    btnReloadEl?.addEventListener('click', syncFromFirebase);

    return { load, syncFromFirebase };
};
