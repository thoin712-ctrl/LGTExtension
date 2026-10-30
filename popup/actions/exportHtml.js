import { escapeHtml } from '../utils/text.js';
import { sanitizeFilenamePart, formatTimestamp } from '../utils/filename.js';
import { parseExcelPaste } from '../compare/excel.js';
import { mapWebToCompareRows } from '../compare/webMap.js';
import { renderCompareTables } from '../compare/render.js';
import { extractWebFileBaseName, runExtraction } from '../services/webExtract.js';
import { setStatus } from '../ui/status.js';

const getDecisionInfo = (text) => {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return { text: '', className: '' };
    let folded = raw;
    try { folded = folded.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    folded = folded.replace(/\s+/g, ' ').trim().toUpperCase();
    if (folded === 'DUYET') return { text: 'DUYỆT', className: 'ok' };
    if (folded === 'KHONG DUYET') return { text: 'KHÔNG DUYỆT', className: 'no' };
    return { text: '', className: '' };
};

const buildDiffHtmlDoc = ({ titleText, pageUrl, docNumber, decisionText, decisionClassName, tableHtml }) => {
    const safeTitle = escapeHtml(titleText || '');
    const safeUrl = escapeHtml(pageUrl || '');
    const safeDoc = escapeHtml(docNumber || '');
    const safeDecision = escapeHtml(decisionText || '');
    const safeDecisionClass = decisionClassName === 'ok' ? 'ok' : decisionClassName === 'no' ? 'no' : '';
    const safeNow = escapeHtml(new Date().toLocaleString());
    const decisionHtml = safeDecision ? `<div class="decision-banner ${safeDecisionClass}">${safeDecision}</div>` : '';
    const css2 = `
body{margin:16px;font-family:sans-serif;background:#f6f7f9;color:#111}
.card{max-width:1400px;margin:0 auto;background:#fff;border:1px solid #e9e9e9;border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
h2{margin:0 0 8px 0;font-size:16px}
.decision-banner{margin:8px 0 10px 0;border-radius:10px;padding:10px 12px;font-weight:900;font-size:26px;text-align:center;letter-spacing:.6px}
.decision-banner.ok{background:#e9f7ef;color:#1e7e34;border:2px solid #bfe6cc}
.decision-banner.no{background:#fdecee;color:#b00020;border:2px solid #f5c2c7}
.meta{font-size:12px;color:#444;display:grid;gap:6px;margin-bottom:10px}
.meta a{color:#0d6efd;text-decoration:none;word-break:break-all}
.table-wrap{overflow:auto;border:1px solid #eee;border-radius:8px}
#compare_table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:1180px;font-size:12px}
#compare_table th,#compare_table td{border:1px solid #e6e8eb;padding:6px 8px;vertical-align:top}
#compare_table th{background:#fafafa;text-align:left;position:sticky;z-index:3}
#compare_table thead tr:nth-child(1) th{top:0;z-index:5}
#compare_table thead tr:nth-child(2) th{top:28px;z-index:4}
#compare_table tbody tr:hover>td{background:rgba(13,110,253,0.04)}
td.col-name{white-space:normal}
td.col-doc,th.col-doc{white-space:normal;word-break:break-word}
.same-cell{background:rgba(108,117,125,0.08)}
.diff-cell{background:rgba(220,53,69,0.10)}
.missing-cell{background:rgba(255,193,7,0.16)}
.diff-char{background:rgba(220,53,69,0.26)}
.tag-ok,.tag-no,.tag-muted{display:inline-block;padding:2px 6px;border-radius:999px;font-weight:800;font-size:11px}
.tag-ok{background:#d1fae5;color:#065f46}
.tag-no{background:#fee2e2;color:#991b1b}
.tag-muted{background:#f3f4f6;color:#374151}
.btn-mini{width:auto;padding:4px 8px;font-size:11px;font-weight:900;border-radius:6px;border:none}
.btn-gray{background:#6c757d;color:#fff}
#compare_table thead tr:nth-child(2) th:nth-child(6),
#compare_table tbody td:nth-child(6){border-right:2px solid rgba(108,117,125,0.35)}
#compare_table thead tr:nth-child(2) th:nth-child(7),
#compare_table tbody td:nth-child(7){border-left:2px solid rgba(108,117,125,0.35)}
#compare_table thead tr:nth-child(2) th:nth-child(1),
#compare_table tbody td:nth-child(1),
#compare_table thead tr:nth-child(2) th:nth-child(7),
#compare_table tbody td:nth-child(7){width:52px}
#compare_table thead tr:nth-child(2) th:nth-child(2),
#compare_table tbody td:nth-child(2),
#compare_table thead tr:nth-child(2) th:nth-child(8),
#compare_table tbody td:nth-child(8){width:140px}
#compare_table thead tr:nth-child(2) th:nth-child(3),
#compare_table tbody td:nth-child(3),
#compare_table thead tr:nth-child(2) th:nth-child(9),
#compare_table tbody td:nth-child(9){width:110px}
#compare_table thead tr:nth-child(2) th:nth-child(4),
#compare_table tbody td:nth-child(4),
#compare_table thead tr:nth-child(2) th:nth-child(10),
#compare_table tbody td:nth-child(10){width:320px}
#compare_table thead tr:nth-child(2) th:nth-child(5),
#compare_table tbody td:nth-child(5),
#compare_table thead tr:nth-child(2) th:nth-child(11),
#compare_table tbody td:nth-child(11){width:90px}
#compare_table thead tr:nth-child(2) th:nth-child(6),
#compare_table tbody td:nth-child(6),
#compare_table thead tr:nth-child(2) th:nth-child(12),
#compare_table tbody td:nth-child(12){width:90px}
#compare_table thead tr:nth-child(2) th:nth-child(13),
#compare_table tbody td:nth-child(13){width:220px}
#compare_table thead tr:nth-child(2) th:nth-child(14),
#compare_table tbody td:nth-child(14){width:120px}
#compare_table tbody td{overflow-wrap:anywhere}
`.trim();
    const css = `body{margin:16px;font-family:sans-serif;background:#f6f7f9;color:#111}.card{max-width:1200px;margin:0 auto;background:#fff;border:1px solid #e9e9e9;border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}h2{margin:0 0 8px 0;font-size:16px}.decision-banner{margin:8px 0 10px 0;border-radius:10px;padding:10px 12px;font-weight:900;font-size:26px;text-align:center;letter-spacing:.6px}.decision-banner.ok{background:#e9f7ef;color:#1e7e34;border:2px solid #bfe6cc}.decision-banner.no{background:#fdecee;color:#b00020;border:2px solid #f5c2c7}.meta{font-size:12px;color:#444;display:grid;gap:6px;margin-bottom:10px}.meta a{color:#0d6efd;text-decoration:none;word-break:break-all}.table-wrap{overflow:auto;border:1px solid #eee;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #eee;padding:6px 8px;vertical-align:top;white-space:nowrap}td.col-name{white-space:normal}th{background:#fafafa;text-align:left;position:sticky;top:0;z-index:1}.same-cell{background:#f2f2f2}.diff-cell{background:#ff9b9b}.missing-cell{background:#ffe3b0}.diff-char{background:#ff4d4d}tr.dup-group>td{background-image:linear-gradient(90deg,var(--dup-stripe,transparent) 0 10px,transparent 10px),repeating-linear-gradient(45deg,var(--dup-hatch,transparent) 0 4px,transparent 4px 8px);background-size:100% 100%,12px 12px;background-repeat:no-repeat,repeat;background-position:left top,left top}.tag-ok,.tag-no,.tag-muted{display:inline-block;padding:2px 6px;border-radius:999px;font-weight:800;font-size:11px}.tag-ok{background:#d1fae5;color:#065f46}.tag-no{background:#fee2e2;color:#991b1b}.tag-muted{background:#f3f4f6;color:#374151}.btn-mini{width:auto;padding:4px 8px;font-size:11px;font-weight:900;border-radius:6px;border:none}.btn-gray{background:#6c757d;color:#fff}#compare_table thead tr:nth-child(2) th:nth-child(5),#compare_table tbody td:nth-child(5){border-right:3px solid #c7c7c7}#compare_table thead tr:nth-child(2) th:nth-child(6),#compare_table tbody td:nth-child(6){border-left:3px solid #c7c7c7}`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${safeTitle || 'HTML Diff'}</title><style>${css2}</style></head><body><div class="card"><h2>${safeTitle || 'HTML Diff'}</h2>${decisionHtml}<div class="meta"><div><strong>Số tài liệu:</strong> ${safeDoc}</div><div><strong>Trang:</strong> <a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${safeUrl}</a></div><div><strong>Thời gian:</strong> ${safeNow}</div></div><div class="table-wrap">${tableHtml || ''}</div></div></body></html>`;
};

export const exportHtmlDiff = async ({ docNumberInput, approveDecisionInput, excelPaste, compareTableBody, status, setMessage, getActiveTab, addHistoryItem }) => {
    setMessage('');
    const docNumber = docNumberInput?.value ? String(docNumberInput.value).trim() : '';
    const docNumberMeta = docNumber || 'Nhiều tài liệu';
    if (!chrome.downloads) { setStatus(status, 'Thiếu quyền downloads. Hãy reload extension.', 'err'); return; }
    setStatus(status, 'Đang lấy dữ liệu để xuất HTML diff...', 'info');
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus(status, 'Không tìm thấy tab hiện tại.', 'err'); return; }
    const isRestrictedUrl = (url) => {
        const u = String(url || '').trim();
        if (!u) return false;
        return u.startsWith('chrome://') || u.startsWith('edge://') || u.startsWith('about:') || u.startsWith('chrome-extension://');
    };
    try {
        const t = await chrome.tabs.get(tab.id);
        if (isRestrictedUrl(t?.url)) { setStatus(status, 'Không thể xuất từ tab hệ thống (chrome://). Hãy mở tab ONE rồi thử lại.', 'err'); return; }
    } catch (e) {}
    let extracted = null;
    try { extracted = await runExtraction(tab.id); } catch (e) { extracted = null; }
    const pageUrl = extracted?.pageUrl ? String(extracted.pageUrl) : '';
    const webRows = extracted?.rows ? extracted.rows : [];
    const rightRows = mapWebToCompareRows(webRows);
    let titleFromWeb = '';
    try { titleFromWeb = await extractWebFileBaseName(tab.id); } catch (e) { titleFromWeb = ''; }
    const fileBase = sanitizeFilenamePart(titleFromWeb || docNumberMeta || 'diff');
    const filename = `extension/${fileBase}_${formatTimestamp(new Date())}.html`;
    const table = document.getElementById('compare_table');
    const existingRowCount = table?.querySelectorAll?.('tbody tr')?.length || 0;
    let tableHtml = table ? table.outerHTML : '';
    const leftRows = parseExcelPaste(excelPaste?.value || '');
    if (leftRows.length === 0 && existingRowCount === 0) { setStatus(status, 'Chưa có dữ liệu Excel.', 'warn'); return; }
    if (leftRows.length > 0 || existingRowCount === 0) {
        renderCompareTables({ compareTableBody }, leftRows, rightRows);
        const table2 = document.getElementById('compare_table');
        tableHtml = table2 ? table2.outerHTML : '';
    }
    const decisionInfo = getDecisionInfo(approveDecisionInput?.value || '');
    let historyOk = false;
    try {
        if (typeof addHistoryItem === 'function') {
            await addHistoryItem({ docNumber: docNumberMeta, webCode: titleFromWeb, pageUrl });
            historyOk = true;
        }
    } catch (e) {
        historyOk = false;
    }
    if (!historyOk) {
        try {
            const { getStoredHistory, storeHistory } = await import('../history/store.js');
            const doc = String(docNumberMeta == null ? '' : docNumberMeta).trim();
            const web = String(titleFromWeb == null ? '' : titleFromWeb).trim();
            if (doc || web) {
                const key = `${doc}||${web}`;
                const items = await getStoredHistory();
                const filtered = (items || []).filter(it => `${String(it?.docNumber || '').trim()}||${String(it?.webCode || '').trim()}` !== key);
                filtered.unshift({ docNumber: doc, webCode: web, pageUrl: String(pageUrl || ''), prType: '', ts: Date.now(), note: '' });
                await storeHistory(filtered.slice(0, 60));
            }
        } catch (e) {}
    }
    const html = buildDiffHtmlDoc({ titleText: titleFromWeb || fileBase, pageUrl, docNumber: docNumberMeta, decisionText: decisionInfo.text, decisionClassName: decisionInfo.className, tableHtml });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setStatus(status, 'Đang xuất file HTML diff...', 'info');
    chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'overwrite' }, () => {
        const err = chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        if (err) { setStatus(status, 'Không thể xuất file.', 'err'); setMessage(err.message || String(err)); return; }
        setStatus(status, `Đã xuất file: Downloads/${filename}`, 'ok');
    });
};
