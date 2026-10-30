import { escapeHtml } from '../utils/text.js';
import { getStoredHistory, storeHistory } from './store.js';

const formatHistoryTime = (ts) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
};

export const createHistoryUI = ({ historyTableBody, historyPageInfo, btnHistoryPrev, btnHistoryNext, historyPageSizeSelect }) => {
    let historyCurrentPage = 1;
    let highlightWebCode = '';
    let historySearchText = '';
    let historyPageSize = (() => {
        const raw = historyPageSizeSelect && historyPageSizeSelect.value ? String(historyPageSizeSelect.value) : '30';
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 30;
    })();
    const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();

    const renderHistory = async () => {
        if (!historyTableBody) return;
        const items = await getStoredHistory();
        if (items.length === 0) {
            historyTableBody.innerHTML = '<tr><td colspan="5" class="same-cell">Chưa có history.</td></tr>';
            if (historyPageInfo) historyPageInfo.textContent = '1/1';
            if (btnHistoryPrev) btnHistoryPrev.disabled = true;
            if (btnHistoryNext) btnHistoryNext.disabled = true;
            return;
        }
        const highlightNorm = highlightWebCode ? norm(highlightWebCode) : '';
        const searchNorm = norm(historySearchText);
        const filtered0 = searchNorm ? items.filter(it => `${it.docNumber || ''} ${it.webCode || ''} ${it.note || ''}`.toUpperCase().includes(searchNorm)) : items;
        const ordered = highlightNorm ? [...filtered0.filter(it => norm(it.webCode) === highlightNorm), ...filtered0.filter(it => norm(it.webCode) !== highlightNorm)] : filtered0;
        const totalPages = Math.max(1, Math.ceil(ordered.length / Math.max(1, historyPageSize)));
        historyCurrentPage = Math.max(1, Math.min(totalPages, historyCurrentPage));
        if (historyPageInfo) historyPageInfo.textContent = `${historyCurrentPage}/${totalPages}`;
        if (btnHistoryPrev) btnHistoryPrev.disabled = historyCurrentPage <= 1;
        if (btnHistoryNext) btnHistoryNext.disabled = historyCurrentPage >= totalPages;
        const start = (historyCurrentPage - 1) * historyPageSize;
        const pageItems = ordered.slice(start, start + historyPageSize);
        historyTableBody.innerHTML = pageItems.map(it => {
            const isHit = highlightNorm && norm(it.webCode) === highlightNorm;
            const trClass = isHit ? 'table-warning' : '';
            const note = it.note != null ? String(it.note) : '';
            return `<tr class="${trClass}" data-doc="${escapeHtml(it.docNumber)}" data-web="${escapeHtml(it.webCode)}"><td>${escapeHtml(formatHistoryTime(it.ts))}</td><td>${escapeHtml(it.docNumber)}</td><td class="col-name">${escapeHtml(it.webCode)}</td><td>${escapeHtml(it.prType || '')}</td><td class="col-name"><div class="small text-secondary" contenteditable="true" data-note="1">${escapeHtml(note)}</div></td></tr>`;
        }).join('');
    };

    const addHistoryItem = async ({ docNumber, webCode, pageUrl, prType }) => {
        const doc = String(docNumber == null ? '' : docNumber).trim();
        const web = String(webCode == null ? '' : webCode).trim();
        if (!doc && !web) return;
        const key = `${doc}||${web}`;
        const items = await getStoredHistory();
        const filtered = items.filter(it => `${it.docNumber}||${it.webCode}` !== key);
        filtered.unshift({ docNumber: doc, webCode: web, pageUrl: String(pageUrl || ''), prType: String(prType || ''), ts: Date.now() });
        const limited = filtered.slice(0, 60);
        await storeHistory(limited);
        historyCurrentPage = 1;
        await renderHistory();
    };

    const setHighlightWebCode = (webCode) => {
        highlightWebCode = String(webCode == null ? '' : webCode).trim();
        if (highlightWebCode) historyCurrentPage = 1;
    };
    const setSearchText = (text) => { historySearchText = String(text == null ? '' : text); historyCurrentPage = 1; };

    const onPageSizeChange = async () => {
        const raw = historyPageSizeSelect && historyPageSizeSelect.value ? String(historyPageSizeSelect.value) : '30';
        const n = Number(raw);
        historyPageSize = Number.isFinite(n) && n > 0 ? n : 30;
        historyCurrentPage = 1;
        await renderHistory();
    };
    const onPrev = async () => { historyCurrentPage = Math.max(1, historyCurrentPage - 1); await renderHistory(); };
    const onNext = async () => { historyCurrentPage = historyCurrentPage + 1; await renderHistory(); };

    return { renderHistory, addHistoryItem, setHighlightWebCode, setSearchText, onPageSizeChange, onPrev, onNext };
};
