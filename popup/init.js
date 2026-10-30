import { getElements } from './ui/elements.js';
import { createMessageAction } from './ui/messageAction.js';
import { createTabService } from './services/tab.js';
import { ensureWindowMode } from './actions/windowMode.js';
import { migrateDataKetQuaFromLocalStorageToDbIfNeeded } from './db/migrate.js';
import { createCompareState } from './compare/state.js';
import { createCompareCheck } from './compare/checkTags.js';
import { runExtraction, extractWebPrInfo, extractWebPrType } from './services/webExtract.js';
import { dataKetQuaDocMaExists } from './db/repo.js';
import { createDataTableRenderer } from './dataTable/render.js';
import { createDataTableActions } from './dataTable/actions.js';
import { createAppendController } from './actions/append/controller.js';
import { setStatus } from './ui/status.js';
import { addActivityLog } from './db/activityLogRepo.js';
import { COMPARE_TABLE_IDX } from './db/constants.js';
import { createWebHistoryUi } from './webHistory/ui.js';
import { findApprovedPrInHistory } from './history/prCheck.js';

export const initPopup = () => {
    document.addEventListener('DOMContentLoaded', async () => {
        const els = getElements();
        const { setMessage, showMessageConfirm, hideMessageActionButtons, getPending } = createMessageAction(els);
        const tabSvc = createTabService();
        const log = async (kind, msg, data) => { try { await addActivityLog({ kind, msg, data }); } catch (e) {} };
        els.navOpenLog?.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            try { chrome.tabs.create({ url: chrome.runtime.getURL('log.html') }); } catch (e) {}
            log('ui', 'open_activity_log', {});
        });
        const closed = await ensureWindowMode({ isWindowMode: tabSvc.isWindowMode, params: tabSvc.params });
        if (closed.closed) return;
        await import('./ui/theme.js').then(m => m.initThemeSwitch());
        try { const lastDoc = localStorage.getItem('doc_number') || ''; if (els.docNumberInput) els.docNumberInput.value = lastDoc; } catch (e) {}
        try { const lastAIMatchApiKey = localStorage.getItem('compare_ai_match_api_key') || ''; if (els.compareAIMatchApiKey) els.compareAIMatchApiKey.value = lastAIMatchApiKey; } catch (e) {}
        try { const aiMatchEnabled = localStorage.getItem('compare_ai_match_enabled'); if (els.compareAIMatchToggle) els.compareAIMatchToggle.checked = aiMatchEnabled === '1'; } catch (e) {}
        try { await migrateDataKetQuaFromLocalStorageToDbIfNeeded(); } catch (e) {}
        
        await log('ui', 'popup_open', {});
        const fold = (s) => { try { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); } catch (e) { return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase(); } };
        const isCancelPrOnTab = async (tab) => {
            if (!tab?.id) return false;
            try { return fold(await extractWebPrType(tab.id)).includes('HUY PR'); } catch (e) { return false; }
        };
        const setCompareHeadMode = (mode) => {
            const thTop = Array.from(document.querySelectorAll('#compare_table thead tr:nth-child(1) th'));
            const thRow = Array.from(document.querySelectorAll('#compare_table thead tr:nth-child(2) th'));
            if (els.compareSummary && els.compareSummary.dataset) els.compareSummary.dataset.lock = mode === 'cancel' ? '1' : '0';
            if (thTop.length >= 2) {
                thTop[0].textContent = mode === 'cancel' ? 'Web (Hủy PR)' : 'Excel';
                thTop[1].textContent = mode === 'cancel' ? 'Data kết quả' : 'Web';
            }
            if (thRow.length >= 14) {
                thRow[1].textContent = mode === 'cancel' ? 'PR SAP' : 'Mã tài liệu';
                thRow[12].textContent = 'Ghi chú';
                thRow[13].textContent = mode === 'cancel' ? '' : 'Check';
            }
        };
        const isCompareCancelMode = () => {
            const th = document.querySelector('#compare_table thead tr:nth-child(2) th:nth-child(2)');
            return fold(th?.textContent || '') === 'PR SAP';
        };
        const fillDocNumberIntoCompareTable = (fallbackDocNumber) => {
            if (isCompareCancelMode()) return;
            const fallback = String(fallbackDocNumber == null ? '' : fallbackDocNumber).trim();
            const body = els.compareTableBody;
            if (!body) return;
            const normalizeCell = (v) => {
                const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
                return t === '' ? '-' : t;
            };
            const trs = Array.from(body.querySelectorAll('tr'));
            for (const tr of trs) {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) continue;
                const leftDoc = normalizeCell(tds[COMPARE_TABLE_IDX.LEFT_DOC]?.innerText || '');
                const rightDocCell = tds[COMPARE_TABLE_IDX.RIGHT_DOC] || null;
                if (!rightDocCell || rightDocCell.classList?.contains('missing-cell')) continue;
                const rightDoc = normalizeCell(rightDocCell.innerText || '');
                const sourceDoc = (leftDoc && leftDoc !== '-') ? leftDoc : fallback;
                if (!sourceDoc || sourceDoc === '-') continue;
                if (leftDoc && leftDoc !== '-') {
                    if (rightDoc !== leftDoc) rightDocCell.innerText = leftDoc;
                } else {
                    if (rightDoc === '-' || !rightDoc) rightDocCell.innerText = sourceDoc;
                }
            }
        };
        const compareState = createCompareState({
            getActiveTab: tabSvc.getActiveTab,
            runExtraction,
            compareTableBody: els.compareTableBody,
            getWebMapOptions: async (tab) => {
                if (!(await isCancelPrOnTab(tab))) return {};
                let prSap = '';
                try { prSap = (await extractWebPrInfo(tab.id)).prSap || ''; } catch (e) { prSap = ''; }
                return { mode: 'cancel', prSap };
            }
        });
        const compareCheck = createCompareCheck({ compareTableBody: els.compareTableBody, compareSummary: els.compareSummary, existsInDataKetQuaByDocMa: dataKetQuaDocMaExists, statusEl: els.status, setStatus });
        let saveWebCompareTimer = null, compareSummaryTimer = null;
        els.compareTableBody?.addEventListener('input', async (ev) => {
            const { updateCompareSummaryFromDom } = await import('./compare/summary.js');
            const td = ev?.target?.closest?.('td[contenteditable="true"]') || null;
            if (!td) return;
            const tr = td.closest?.('tr') || null;
            if (tr) compareCheck.scheduleCheckForCompareRow(tr);
            if (saveWebCompareTimer) clearTimeout(saveWebCompareTimer);
            saveWebCompareTimer = setTimeout(() => { compareState.saveWebCompareRows(); }, 500);
            if (compareSummaryTimer) clearTimeout(compareSummaryTimer);
            compareSummaryTimer = setTimeout(() => { updateCompareSummaryFromDom({ compareSummary: els.compareSummary, compareTableBody: els.compareTableBody }); }, 200);
        });
        els.compareTableBody?.addEventListener('blur', () => { if (saveWebCompareTimer) clearTimeout(saveWebCompareTimer); saveWebCompareTimer = null; compareState.saveWebCompareRows(); }, true);
        const dataRenderer = createDataTableRenderer({ dataTableHead: els.dataTableHead, dataTableBody: els.dataTableBody, dataPageInfo: els.dataPageInfo, btnDataPrev: els.btnDataPrev, btnDataNext: els.btnDataNext, dataSummary: els.dataSummary });
        const dataActions = createDataTableActions({ renderer: dataRenderer, status: els.status, setMessage, dataSearchInput: els.dataSearchInput, btnDataClearFilters: els.btnDataClearFilters });
        const applyDupFilterFromCompareTable = async () => {
            if (isCompareCancelMode()) return;
            const body = els.compareTableBody;
            if (!body) return;
            const normCell = (v) => { const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return t === '' ? '-' : t; };
            const fallbackDoc = String(els.docNumberInput?.value || '').trim();
            const dupSet = new Set();
            const dupPairs = [];
            const trs = Array.from(body.querySelectorAll('tr'));
            for (const tr of trs) {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) continue;
                const tag = tds[COMPARE_TABLE_IDX.RIGHT_CHECK]?.querySelector?.('.tag-ok, .tag-no, .tag-muted') || null;
                if (!tag || !tag.classList?.contains('tag-no')) continue;
                const doc0 = normCell(tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.innerText || '');
                const ma0 = normCell(tds[COMPARE_TABLE_IDX.RIGHT_MA]?.innerText || '');
                const doc = (doc0 && doc0 !== '-') ? doc0 : (fallbackDoc || '-');
                const ma = ma0;
                if (!doc || doc === '-' || !ma || ma === '-') continue;
                dupSet.add(`${fold(doc)}||${fold(ma)}`);
                dupPairs.push({ doc, ma });
            }
            if (dupSet.size === 0) {
                dataRenderer.setExternalFilter(null, '');
                await dataActions.loadDataTableFromDb(1);
                return;
            }
            try {
                await dataActions.loadRowsByDocMaPairs(dupPairs);
                dataRenderer.setExternalFilter(() => true, '');
                dataActions.onSearchInput();
            } catch (error) {
                setStatus(els.status, `Không tải được dòng trùng từ Firebase: ${error?.message || error}`, 'err');
            }
        };
        els.compareTableBody?.addEventListener('click', async (ev) => { await compareCheck.onCompareTableClick(ev); await applyDupFilterFromCompareTable(); });
        els.btnDataLoad?.addEventListener('click', async () => { setMessage(''); await log('data', 'data_load', {}); await dataActions.loadDataTableFromDb(); });
        els.btnDataSave?.addEventListener('click', async () => { setMessage(''); await log('data', 'data_save', {}); await dataActions.saveDataTableToCsv(); });
        els.btnDataExport?.addEventListener('click', async () => { setMessage(''); await log('data', 'data_export', {}); await dataActions.exportDataKetQua(); });
        els.dataSearchInput?.addEventListener('input', () => dataActions.onSearchInput());
        els.dataPageSizeSelect?.addEventListener('change', () => dataActions.onPageSizeChange(els.dataPageSizeSelect?.value || '250'));
        els.btnDataPrev?.addEventListener('click', () => dataActions.onPrev());
        els.btnDataNext?.addEventListener('click', () => dataActions.onNext());
        els.btnDataImport?.addEventListener('click', async () => { setMessage(''); try { if (els.dataFile) els.dataFile.value = ''; } catch (e) {} els.dataFile?.click(); });
        els.dataFile?.addEventListener('change', async () => { const { importDataKetQuaFile } = await import('./dataTable/import.js'); setMessage(''); const file = els.dataFile?.files?.[0] || null; await log('data', 'data_import', { name: String(file?.name || '') }); await importDataKetQuaFile({ file, status: els.status, setMessage, onAfterImport: dataActions.loadDataTableFromDb }); });
        const appendCtrl = createAppendController({ status: els.status, docNumberInput: els.docNumberInput, compareState, getActiveTab: tabSvc.getActiveTab, setMessage, showMessageConfirm, hideMessageActionButtons, getPendingAction: getPending, addHistoryItem: async () => {} });
        els.btnRun?.addEventListener('click', async () => { await log('append', 'run_click', {}); await appendCtrl.onRun(); });
        els.btnApprove?.addEventListener('click', async () => { await log('append', 'approve_click', {}); await appendCtrl.onApprove(); });
        els.btnAcceptDuplicate?.addEventListener('click', appendCtrl.onAccept);
        els.btnOverwriteDuplicate?.addEventListener('click', appendCtrl.onOverwrite);
        els.btnCancelAction?.addEventListener('click', appendCtrl.onCancel);
        els.btnExportExcel?.addEventListener('click', async () => { const { exportWebToExcel } = await import('./actions/exportExcel.js'); setMessage(''); await log('export', 'export_web_excel', {}); await exportWebToExcel({ status: els.status, setMessage, getActiveTab: tabSvc.getActiveTab }); });
        els.btnExportHtml?.addEventListener('click', async () => { const { exportHtmlDiff } = await import('./actions/exportHtml.js'); await log('export', 'export_html_diff', {}); await exportHtmlDiff({ docNumberInput: els.docNumberInput, approveDecisionInput: els.approveDecisionInput, excelPaste: els.excelPaste, compareTableBody: els.compareTableBody, status: els.status, setMessage, getActiveTab: tabSvc.getActiveTab, addHistoryItem: async () => {} }); });
        const safeString = (value) => {
            if (value == null) return '';
            return String(value).trim();
        };
        const normalizeCompareRow = (row, index) => {
            if (!row || typeof row !== 'object') return { id: index, ma: '', ten: '', dv: '', sl: '', stt: '', doc: '' };
            return {
                id: row.id != null ? row.id : index,
                ma: safeString(row.ma),
                ten: safeString(row.ten),
                dv: safeString(row.dv),
                sl: safeString(row.sl),
                stt: safeString(row.stt),
                doc: safeString(row.doc),
                ghiChu: safeString(row.ghiChu)
            };
        };
        const validateAIMatchPair = (item, leftRows, rightRows) => {
            if (!item || typeof item !== 'object') return null;
            if (typeof item.leftIndex === 'number' && typeof item.rightIndex === 'number') {
                const left = leftRows[item.leftIndex];
                const right = rightRows[item.rightIndex];
                if (!left || !right) return null;
                return { leftIndex: item.leftIndex, rightIndex: item.rightIndex };
            }
            if (item.leftId != null && item.rightId != null) {
                const left = leftRows.find(r => r && r.id != null && String(r.id) === String(item.leftId));
                const right = rightRows.find(r => r && r.id != null && String(r.id) === String(item.rightId));
                if (!left || !right) return null;
                return { leftId: item.leftId, rightId: item.rightId };
            }
            if (item.left && item.right && typeof item.left === 'object' && typeof item.right === 'object') {
                const left = leftRows.find(r => r && String(r.ma) === String(item.left.ma) && String(r.ten) === String(item.left.ten));
                const right = rightRows.find(r => r && String(r.ma) === String(item.right.ma) && String(r.ten) === String(item.right.ten));
                if (!left || !right) return null;
                return { leftIndex: leftRows.indexOf(left), rightIndex: rightRows.indexOf(right) };
            }
            return null;
        };
        const normalizeAIMatchResponse = (result, leftRows, rightRows) => {
            if (!result) return null;
            const pairs = Array.isArray(result) ? result : (result.aiMatchPairs || result.pairs || result.matches);
            if (!Array.isArray(pairs)) return null;
            const validated = [];
            for (const item of pairs) {
                const valid = validateAIMatchPair(item, leftRows, rightRows);
                if (valid) validated.push(valid);
            }
            return validated.length > 0 ? validated : null;
        };
        const parseJSONFromText = (text) => {
            if (!text || typeof text !== 'string') return null;
            const trimmed = text.trim();
            try {
                return JSON.parse(trimmed);
            } catch (err) {
                const firstBrace = trimmed.indexOf('{');
                const lastBrace = trimmed.lastIndexOf('}');
                if (firstBrace >= 0 && lastBrace > firstBrace) {
                    try {
                        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
                    } catch (err2) {}
                }
                const firstBracket = trimmed.indexOf('[');
                const lastBracket = trimmed.lastIndexOf(']');
                if (firstBracket >= 0 && lastBracket > firstBracket) {
                    try {
                        return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
                    } catch (err3) {}
                }
            }
            return null;
        };
        const requestAIMatch = async ({ apiKey, leftRows, rightRows }) => {
            if (!apiKey) throw new Error('No Google AI Studio API key provided.');
            const normalizedLeftRows = leftRows.map(normalizeCompareRow);
            const normalizedRightRows = rightRows.map(normalizeCompareRow);
            const endpoint = 'http://127.0.0.1:5000/match';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, leftRows: normalizedLeftRows, rightRows: normalizedRightRows }),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    throw new Error(`AI backend trả về ${response.status}: ${text || 'No response body'}`);
                }
                const result = await response.json();
                if (!result || !Array.isArray(result.aiMatchPairs)) {
                    throw new Error('AI backend trả về response không hợp lệ.');
                }
                if (result.aiMatchPairs.length === 0) {
                    throw new Error('AI backend trả về không có cặp match.');
                }
                return result.aiMatchPairs;
            } catch (err) {
                if (err.name === 'AbortError') {
                    throw new Error('AI match request timeout sau 20 giây.');
                }
                throw err;
            } finally {
                clearTimeout(timeout);
            }
        };

        els.btnCompare?.addEventListener('click', async () => {
            const tab = await tabSvc.getActiveTab();
            if (await isCancelPrOnTab(tab)) { setMessage(''); await log('compare', 'compare_cancel', {}); setStatus(els.status, 'Hủy PR: đang match Web với data_ket_qua...', 'info'); await compareState.refreshWebMapped(); await applyCancelMatchView(); setStatus(els.status, 'Hủy PR: đã match xong.', 'ok'); return; }
            setCompareHeadMode('');

            // Parse và xử lý tài liệu
            const { parseExcelPaste } = await import('./compare/excel.js');
            const excelRows = parseExcelPaste(els.excelPaste?.value || '');

            const [{ renderCompareTables }] = await Promise.all([import('./compare/render.js')]);
            setMessage('');
            await log('compare', 'compare_click', {});
            setStatus(els.status, 'Đang lấy dữ liệu từ Excel và Web để so sánh...', 'info');
            if (excelRows.length === 0) { setStatus(els.status, 'Chưa có dữ liệu Excel.', 'warn'); return; }
            const rightRows = await compareState.getWebRowsForCompare();
            const normalizedExcelRows = excelRows.map(normalizeCompareRow);
            const normalizedRightRows = rightRows.map(normalizeCompareRow);
            const opts = { sortPairs: true };
            if (els.compareAIMatchToggle?.checked) {
                const apiKey = String(els.compareAIMatchApiKey?.value || '').trim();
                if (!apiKey) {
                    setStatus(els.status, 'AI match bật nhưng chưa nhập API key.', 'warn');
                    setMessage('Nhập Google AI Studio API key để dùng chế độ AI.');
                    return;
                }
                setStatus(els.status, 'Đang gọi AI match backend...', 'info');
                try {
                    const aiPairs = await requestAIMatch({ apiKey, leftRows: normalizedExcelRows, rightRows: normalizedRightRows });
                    opts.aiMatchPairs = aiPairs;
                    setStatus(els.status, 'AI match thành công, đang render bảng...', 'info');
                    setMessage('AI match thành công.');
                } catch (err) {
                    const errorMessage = err?.message || 'AI match thất bại.';
                    setStatus(els.status, 'AI match không thành công, dùng match nội bộ.', 'warn');
                    setMessage(`AI match lỗi: ${errorMessage}`);
                }
            }
            renderCompareTables({ compareTableBody: els.compareTableBody }, normalizedExcelRows, normalizedRightRows, opts);
            fillDocNumberIntoCompareTable(els.docNumberInput?.value || '');
            await compareCheck.refreshCompareCheckTags();
            await applyDupFilterFromCompareTable();
            setStatus(els.status, 'Đã so sánh xong.', 'ok');
        });
        const renderDataReport = async () => {
            if (!els.dataReportPreview) return;
            try {
                const { buildDataKetQuaSummaryReportHtml } = await import('./report/dataKetQuaReport.js');
                const dateFrom = String(els.reportDateFrom?.value || '').trim();
                const dateTo = String(els.reportDateTo?.value || '').trim();
                const docFilter = String(els.reportDocFilter?.value || '').trim();
                els.dataReportPreview.innerHTML = await buildDataKetQuaSummaryReportHtml({ dateFrom, dateTo, docFilter });
                els.dataReportPreview.dataset.active = '1';
            } catch (error) {
                const message = `Không tải được report từ Firebase: ${error?.message || error}`;
                els.dataReportPreview.textContent = message;
                setStatus(els.status, message, 'err');
            }
        };
        const openReportDialog = async () => {
            setMessage('');
            if (!els.reportDialog || typeof els.reportDialog.showModal !== 'function') return;
            try { els.reportDialog.showModal(); } catch (e) { try { els.reportDialog.setAttribute('open', ''); } catch (e2) {} }
            await renderDataReport();
        };
        els.btnDataReport?.addEventListener('click', openReportDialog);
        els.btnReportRefresh?.addEventListener('click', async () => { setMessage(''); await renderDataReport(); });
        els.btnReportExport?.addEventListener('click', async () => {
            setMessage('');
            setStatus(els.status, 'Đang xuất report Excel...', 'info');
            const { exportDataKetQuaSummaryReportToExcel } = await import('./report/dataKetQuaReport.js');
            const dateFrom = String(els.reportDateFrom?.value || '').trim();
            const dateTo = String(els.reportDateTo?.value || '').trim();
            const docFilter = String(els.reportDocFilter?.value || '').trim();
            try {
                const res = await exportDataKetQuaSummaryReportToExcel({ dateFrom, dateTo, docFilter });
                if (res?.ok) { setStatus(els.status, 'Đã xuất report Excel.', 'ok'); return; }
                setStatus(els.status, 'Không thể xuất report.', 'err');
                if (res?.error) setMessage(res.error);
            } catch (error) {
                setStatus(els.status, `Không thể xuất report từ Firebase: ${error?.message || error}`, 'err');
            }
        });
        els.btnClearReport?.addEventListener('click', () => { if (!els.dataReportPreview) return; els.dataReportPreview.innerHTML = ''; els.dataReportPreview.dataset.active = '0'; });
        els.btnReportClose?.addEventListener('click', () => { try { els.reportDialog?.close?.(); } catch (e) { try { els.reportDialog?.removeAttribute?.('open'); } catch (e2) {} } });
        const scheduleReportRerenderIfActive = () => {
            if (!els.reportDialog?.open) return;
            if (els.dataReportPreview?.dataset?.active !== '1') return;
            setTimeout(() => { renderDataReport(); }, 200);
        };
        els.reportDocFilter?.addEventListener('input', scheduleReportRerenderIfActive);
        els.reportDateFrom?.addEventListener('change', scheduleReportRerenderIfActive);
        els.reportDateTo?.addEventListener('change', scheduleReportRerenderIfActive);
        async function applyCancelMatchView() {
            const tab = await tabSvc.getActiveTab();
            const isCancel = await isCancelPrOnTab(tab);
            if (!isCancel) {
                dataRenderer.setExternalFilter(null, '');
                dataActions.onSearchInput();
                setCompareHeadMode('');
                return;
            }
            let webRows = compareState.getLastWebMappedRows() || [];
            if (webRows.length === 0) {
                const raw = compareState.getLastWebExtractedRows() || [];
                const toDashIfEmpty = (value) => {
                    if (value == null) return '-';
                    const t = String(value).replace(/\s+/g, ' ').trim();
                    return t === '' ? '-' : t;
                };
                const headerRow = raw.find(r => Array.isArray(r) && r.some(c => fold(c).includes('MA SAP PR') || fold(c) === 'PR SAP')) || null;
                const header = headerRow ? headerRow.map(c => fold(c)) : [];
                const idx = (pred) => header.findIndex(pred);
                const idxPrSap = headerRow ? idx(h => h.includes('MA SAP PR') || h === 'PR SAP') : -1;
                const idxMa = headerRow ? idx(h => h.includes('MA SAN PHAM') || h.includes('MA VT') || h === 'MA') : -1;
                const idxTen = headerRow ? idx(h => h.includes('TEN SAN PHAM') || h.includes('TEN VT') || h === 'TEN') : -1;
                const idxSl = headerRow ? idx(h => h.includes('SL YEU CAU') || h.includes('SO LUONG') || h === 'SL' || h === 'QTY') : -1;
                const idxDv = headerRow ? idx(h => h === 'DVT' || h.includes('DON VI')) : -1;
                const at = (row, i) => (i >= 0 && i < (row?.length || 0) ? row[i] : null);
                const isHeaderLike = (row) => {
                    const j = fold((row || []).join(' '));
                    return j.includes('MA SAN PHAM') || j.includes('TEN SAN PHAM') || j.includes('SL YEU CAU') || j.includes('MA SAP PR') || j.includes('DVT');
                };
                const mapped = [];
                for (const r of raw) {
                    if (!Array.isArray(r) || r.length < 6) continue;
                    if (isHeaderLike(r)) continue;
                    const prSap = toDashIfEmpty(at(r, idxPrSap >= 0 ? idxPrSap : 1));
                    const ma = toDashIfEmpty(at(r, idxMa >= 0 ? idxMa : 3));
                    const ten = toDashIfEmpty(at(r, idxTen >= 0 ? idxTen : 4));
                    const sl = toDashIfEmpty(at(r, idxSl >= 0 ? idxSl : 5));
                    const dv = toDashIfEmpty(at(r, idxDv >= 0 ? idxDv : 7));
                    if (ma === '-' && ten === '-' && sl === '-' && dv === '-') continue;
                    if (ma !== '-' || ten !== '-' || sl !== '-' || dv !== '-') mapped.push({ doc: '-', prSap, ma, ten, dv, sl });
                }
                if (mapped.length > 0) webRows = mapped;
            }
            if (webRows.length === 0) { dataRenderer.setExternalFilter(() => false, 'Không có dữ liệu Web để match (Hủy PR).'); dataActions.onSearchInput(); setCompareHeadMode('cancel'); if (els.compareSummary) els.compareSummary.textContent = 'Hủy PR: chưa có dữ liệu Web.'; if (els.compareTableBody) els.compareTableBody.innerHTML = ''; return; }
            const normQty = (v) => fold(v).replace(/[,\s]+/g, '');
            const keyOf = (prSap, ma, dv, sl) => `${fold(prSap)}||${fold(ma)}||${fold(dv)}||${normQty(sl)}`;
            const keySet = new Set(webRows.map(r => keyOf(r.prSap || '', r.ma || '', r.dv || '', r.sl || '')));
            let all = dataActions.getRows();
            if (!Array.isArray(all) || all.length <= 1) { await dataActions.loadDataTableFromDb(); all = dataActions.getRows(); }
            const header = Array.isArray(all?.[0]) ? all[0] : [];
            const findIdx = (name) => header.map(h => fold(h)).indexOf(name);
            const idxPrSap = findIdx('PR SAP');
            const idxMa = (() => { const keys = header.map(h => fold(h)); const a = keys.findIndex(h => h.includes('MA VT') || h.includes('MA SAN PHAM') || h === 'MA'); return a; })();
            const idxTen = (() => { const keys = header.map(h => fold(h)); const a = keys.findIndex(h => h.includes('TEN VT') || h.includes('TEN SAN PHAM') || h === 'TEN'); return a; })();
            const idxDv = (() => { const keys = header.map(h => fold(h)); const a = keys.findIndex(h => h === 'DVT' || h.includes('DON VI')); return a; })();
            const idxSl = (() => { const keys = header.map(h => fold(h)); const a = keys.findIndex(h => h.includes('SO LUONG') || h === 'SL' || h === 'QTY'); return a; })();
            const getAt = (r, idx) => (idx >= 0 && idx < (r?.length || 0) ? r[idx] : '');
            const matchedRows = [];
            for (const r0 of (all || []).slice(1)) {
                if (!Array.isArray(r0)) continue;
                const k = keyOf(getAt(r0, idxPrSap), getAt(r0, idxMa), getAt(r0, idxDv), getAt(r0, idxSl));
                if (keySet.has(k)) matchedRows.push(r0);
            }
            const hint = matchedRows.length > 0 ? '' : 'Không có dòng trùng với dữ liệu Web (Hủy PR).';
            dataRenderer.setExternalFilter((row) => {
                const k = keyOf(getAt(row, idxPrSap), getAt(row, idxMa), getAt(row, idxDv), getAt(row, idxSl));
                return keySet.has(k);
            }, hint);
            dataActions.onSearchInput();
            setCompareHeadMode('cancel');
            const { renderCompareTables } = await import('./compare/render.js');
            const leftRows = webRows.map(r => ({ doc: r.prSap || '-', ma: r.ma || '', ten: r.ten || '', dv: r.dv || '', sl: r.sl || '' }));
            const rightRows = matchedRows.map(r => ({ doc: getAt(r, idxPrSap) || '-', ma: getAt(r, idxMa) || '', ten: getAt(r, idxTen) || '', dv: getAt(r, idxDv) || '', sl: getAt(r, idxSl) || '' }));
            if (els.compareSummary) els.compareSummary.textContent = `Hủy PR: Web ${leftRows.length} dòng | Match data_ket_qua: ${rightRows.length} dòng`;
            renderCompareTables({ compareTableBody: els.compareTableBody }, leftRows, rightRows, { rightEditable: false, showCheck: false });
        }
        const showPrApprovedWarning = async () => {
            try {
                const currentPr = String(els.currentPrInput?.value || '').trim();
                if (!currentPr) return;
                const approved = await findApprovedPrInHistory(currentPr);
                if (!approved) return;
                setStatus(els.status, `PR này đã được ghi lịch sử trước đó: ${approved.webCode || approved.docNumber || ''}`, 'warn');
            } catch (e) {
                // Không ảnh hưởng đến luồng chính nếu kiểm tra lịch sử thất bại
            }
        };

        els.btnReload?.addEventListener('click', async () => {
            const { doReload } = await import('./actions/reload.js');
            await log('action', 'reload_click', {});
            await doReload({ status: els.status, setMessage, compareState, excelFile: els.excelFile, excelPaste: els.excelPaste, currentPrInput: els.currentPrInput, currentPrType: els.currentPrType, getActiveTab: tabSvc.getActiveTab });
            await applyCancelMatchView();
            const tab = await tabSvc.getActiveTab();
            if (!(await isCancelPrOnTab(tab))) { fillDocNumberIntoCompareTable(els.docNumberInput?.value || ''); await compareCheck.refreshCompareCheckTags(); await applyDupFilterFromCompareTable(); }
            await showPrApprovedWarning();
        });
        els.btnClearExcel?.addEventListener('click', async () => { setMessage(''); await log('action', 'clear_excel', {}); try { if (els.excelFile) els.excelFile.value = ''; } catch (e) {} setStatus(els.status, 'Đã clear Excel.', 'ok'); if (els.excelPaste) els.excelPaste.value = ''; await compareState.refreshCompareViewFromExcelText(''); await compareCheck.refreshCompareCheckTags(); });
        els.btnClearRightExcel?.addEventListener('click', async () => { setMessage(''); await log('action', 'clear_right_excel', {}); try { if (els.rightExcelFile) els.rightExcelFile.value = ''; } catch (e) {} setStatus(els.status, 'Đã clear file phải.', 'ok'); if (els.rightExcelPaste) els.rightExcelPaste.value = ''; compareState.setRightExcelRows([]); await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || ''); await compareCheck.refreshCompareCheckTags(); });
        els.btnClearWeb?.addEventListener('click', async () => { setMessage(''); await log('action', 'clear_web', {}); await compareState.resetWebState(); dataRenderer.setExternalFilter(null, ''); dataActions.onSearchInput(); setCompareHeadMode(''); setStatus(els.status, 'Đã clear Web.', 'ok'); await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || ''); fillDocNumberIntoCompareTable(els.docNumberInput?.value || ''); await compareCheck.refreshCompareCheckTags(); });
        els.excelFile?.addEventListener('change', async () => {
            setMessage('');
            const { loadSelectedExcelFile } = await import('./actions/loadExcel.js');
            const loaded = await loadSelectedExcelFile({ excelFile: els.excelFile, excelPaste: els.excelPaste, setMessage });
            if (!loaded) return;
            await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || '');
            fillDocNumberIntoCompareTable(els.docNumberInput?.value || '');
            await compareCheck.refreshCompareCheckTags();
            await applyDupFilterFromCompareTable();
        });
        els.rightExcelFile?.addEventListener('change', async () => {
            setMessage('');
            const { loadSelectedExcelFile } = await import('./actions/loadExcel.js');
            const loaded = await loadSelectedExcelFile({ excelFile: els.rightExcelFile, excelPaste: els.rightExcelPaste, setMessage });
            if (!loaded) return;
            const { parseExcelPaste } = await import('./compare/excel.js');
            const rightExcelRows = parseExcelPaste(els.rightExcelPaste?.value || '');
            compareState.setRightExcelRows(rightExcelRows);
            await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || '', rightExcelRows);
            await compareCheck.refreshCompareCheckTags();
        });
        els.excelPaste?.addEventListener('input', async () => {
            setMessage('');
            await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || '');
            fillDocNumberIntoCompareTable(els.docNumberInput?.value || '');
            await compareCheck.refreshCompareCheckTags();
            await applyDupFilterFromCompareTable();
        });
        els.docNumberInput?.addEventListener('input', async () => {
            const doc = String(els.docNumberInput?.value || '').trim();
            try { localStorage.setItem('doc_number', doc); } catch (e) {}
        });
        els.compareAIMatchApiKey?.addEventListener('input', async () => {
            const apiKey = String(els.compareAIMatchApiKey?.value || '').trim();
            try { localStorage.setItem('compare_ai_match_api_key', apiKey); } catch (e) {}
        });
        els.compareAIMatchToggle?.addEventListener('change', async () => {
            const enabled = els.compareAIMatchToggle?.checked ? '1' : '0';
            try { localStorage.setItem('compare_ai_match_enabled', enabled); } catch (e) {}
        });
        await compareState.refreshWebMapped();
        const { refreshCurrentPr } = await import('./actions/currentPr.js');
        await refreshCurrentPr({ currentPrInput: els.currentPrInput, currentPrType: els.currentPrType, getActiveTab: tabSvc.getActiveTab });
        await compareState.refreshCompareViewFromExcelText(els.excelPaste?.value || '');
        fillDocNumberIntoCompareTable(els.docNumberInput?.value || '');
        await compareCheck.refreshCompareCheckTags();
        await applyDupFilterFromCompareTable();
        const webHistoryUi = createWebHistoryUi({ statusEl: els.status, setStatus, tableBodyEl: els.webHistoryTableBody, searchInputEl: els.webHistorySearchInput, infoEl: els.webHistoryInfo, btnReloadEl: els.btnWebHistoryReload });
        await webHistoryUi.syncFromFirebase();
        await dataActions.loadDataTableFromDb();
        await applyCancelMatchView();
        setStatus(els.status, 'Sẵn sàng...', 'info');
    });
};
