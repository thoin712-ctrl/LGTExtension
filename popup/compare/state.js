import { parseExcelPaste } from './excel.js';
import { mapWebToCompareRows } from './webMap.js';
import { renderCompareTables } from './render.js';
import { COMPARE_TABLE_IDX } from '../db/constants.js';

export const resolveCompareSourceRows = ({ leftRows, webRows, rightExcelRows }) => {
    if (Array.isArray(rightExcelRows) && rightExcelRows.length > 0) return rightExcelRows;
    return Array.isArray(webRows) ? webRows : leftRows;
};

export const createCompareState = ({ getActiveTab, runExtraction, compareTableBody, getWebMapOptions }) => {
    let lastWebExtractedRows = [];
    let lastWebMappedRows = [];
    let lastExcelRows = [];
    let lastRightExcelRows = [];
    const getOpts = async (tab) => {
        if (typeof getWebMapOptions !== 'function') return {};
        try { return await getWebMapOptions(tab); } catch (e) { return {}; }
    };

    const getCompareWebRows = () => {
        const body = compareTableBody;
        if (!body) return [];
        const rows = Array.from(body.querySelectorAll('tr'));
        const normalizeCell = (v) => { const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return t === '' ? '-' : t; };
        const readCellText = (td) => {
            if (!td) return '';
            const text = String(td.textContent == null ? '' : td.textContent).replace(/\s+/g, ' ').trim();
            if (text) return text;
            return String(td.innerText == null ? '' : td.innerText).replace(/\s+/g, ' ').trim();
        };
        const out = [];
        for (const tr of rows) {
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) continue;
            const sttExcel = normalizeCell(readCellText(tds[COMPARE_TABLE_IDX.LEFT_STT]));
            const sttWeb = normalizeCell(readCellText(tds[COMPARE_TABLE_IDX.RIGHT_STT]));
            const doc = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.innerText || '');
            const ma = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_MA]?.innerText || '');
            const ten = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_TEN]?.innerText || '');
            const dv = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_DV]?.innerText || '');
            const sl = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_SL]?.innerText || '');
            const ghiChu = normalizeCell(tds[COMPARE_TABLE_IDX.RIGHT_GHI_CHU]?.innerText || '');
            if (doc === '-' && ma === '-' && ten === '-' && dv === '-' && sl === '-') continue;
            out.push({ stt: sttWeb === '-' ? '' : sttWeb, sttExcel: sttExcel === '-' ? '' : sttExcel, sttWeb: sttWeb === '-' ? '' : sttWeb, doc, ma, ten, dv, sl, ghiChu: ghiChu === '-' ? '' : ghiChu });
        }
        return out;
    };

    const saveWebCompareRows = async () => {
        const tab = await getActiveTab();
        const tabId = tab && tab.id != null ? tab.id : 0;
        if (!tabId) return;
        const rows = getCompareWebRows();
        try { localStorage.setItem(`web_compare_rows_${tabId}`, JSON.stringify(rows)); localStorage.setItem(`web_compare_rows_${tabId}_ts`, String(Date.now())); } catch (e) {}
    };

    const clearSavedWebCompareRows = async () => {
        const tab = await getActiveTab();
        const tabId = tab && tab.id != null ? tab.id : 0;
        if (!tabId) return;
        try { localStorage.removeItem(`web_compare_rows_${tabId}`); localStorage.removeItem(`web_compare_rows_${tabId}_ts`); } catch (e) {}
    };

    const refreshWebMapped = async () => {
        const tab = await getActiveTab();
        if (!tab || !tab.id) { lastWebExtractedRows = []; lastWebMappedRows = []; return; }
        const tabId = tab.id;
        console.log('[qt_debug] refreshWebMapped start', { tabId });
        let extracted;
        try {
            extracted = await runExtraction(tabId);
            console.log('[qt_debug] refreshWebMapped extracted', { tabId, rows: extracted?.rows?.length || 0, fileLinks: extracted?.fileLinks?.length || 0, pageUrl: extracted?.pageUrl });
        } catch (e) {
            console.error('[qt_debug] refreshWebMapped runExtraction error', e, { tabId });
            lastWebExtractedRows = [];
            lastWebMappedRows = [];
            return;
        }
        lastWebExtractedRows = extracted?.rows || [];
        lastWebMappedRows = mapWebToCompareRows(lastWebExtractedRows, await getOpts(tab));
    };

    const refreshCompareViewFromExcelText = async (excelText, rightExcelRows = null) => {
        lastExcelRows = parseExcelPaste(excelText);
        const tab = await getActiveTab();
        const tabId = tab && tab.id != null ? tab.id : 0;
        let saved = null;
        try { const raw = localStorage.getItem(`web_compare_rows_${tabId}`) || ''; saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
        if (Array.isArray(saved) && saved.length > 0) lastWebMappedRows = saved;
        else lastWebMappedRows = mapWebToCompareRows(lastWebExtractedRows, await getOpts(tab));
        if (Array.isArray(rightExcelRows) && rightExcelRows.length > 0) lastRightExcelRows = rightExcelRows;
        else if (rightExcelRows === null) lastRightExcelRows = lastRightExcelRows;
        else lastRightExcelRows = [];
        const rightRows = resolveCompareSourceRows({ leftRows: lastExcelRows, webRows: lastWebMappedRows, rightExcelRows: lastRightExcelRows });
        renderCompareTables({ compareTableBody }, lastExcelRows, rightRows);
    };

    const setRightExcelRows = (rows) => {
        lastRightExcelRows = Array.isArray(rows) ? rows : [];
    };

    const getWebRowsForCompare = async () => {
        const tab = await getActiveTab();
        const tabId = tab && tab.id != null ? tab.id : 0;
        if (tabId) {
            try {
                const raw = localStorage.getItem(`web_compare_rows_${tabId}`) || '';
                const parsed = raw ? JSON.parse(raw) : null;
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (e) {}
        }
        const fromTable = getCompareWebRows();
        if (fromTable.length > 0) return fromTable;
        if (Array.isArray(lastWebMappedRows) && lastWebMappedRows.length > 0) return lastWebMappedRows;
        await refreshWebMapped();
        return Array.isArray(lastWebMappedRows) ? lastWebMappedRows : [];
    };

    return {
        getCompareWebRows,
        saveWebCompareRows,
        clearSavedWebCompareRows,
        refreshWebMapped,
        refreshCompareViewFromExcelText,
        setRightExcelRows,
        getWebRowsForCompare,
        getLastWebExtractedRows: () => lastWebExtractedRows,
        getLastWebMappedRows: () => lastWebMappedRows,
        getLastExcelRows: () => lastExcelRows,
        getLastRightExcelRows: () => lastRightExcelRows,
        resetWebState: async () => { lastWebExtractedRows = []; lastWebMappedRows = []; await clearSavedWebCompareRows(); }
    };
};
