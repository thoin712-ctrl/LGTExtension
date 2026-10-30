import { normalizeDupValue } from '../utils/text.js';
import { updateCompareSummaryFromDom } from './summary.js';
import { COMPARE_TABLE_IDX } from '../db/constants.js';

export const createCompareCheck = ({ compareTableBody, compareSummary, existsInDataKetQuaByDocMa, statusEl, setStatus }) => {
    let autoCheckTimer = null;
    const compareRowCheckTimers = new WeakMap();
    const checkDocMa = async (doc, ma) => {
        try {
            return { value: await existsInDataKetQuaByDocMa(doc, ma), error: null };
        } catch (error) {
            setStatus?.(statusEl, `Không kiểm tra được dữ liệu Firebase: ${error?.message || error}`, 'err');
            return { value: null, error };
        }
    };
    
    const updateCheckForCompareRow = async (tr) => {
        if (!tr) return;
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) return;
        const rightMissing = tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.classList?.contains('missing-cell') || false;
        if (rightMissing) return;
        const checkCell = tds[COMPARE_TABLE_IDX.RIGHT_CHECK];
        if (!checkCell) return;
        const btn = checkCell.querySelector?.('button.js-check-row');
        if (!btn) return;
        const doc = tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.innerText || '';
        const ma = tds[COMPARE_TABLE_IDX.RIGHT_MA]?.innerText || '';
        const d = normalizeDupValue(doc);
        const m = normalizeDupValue(ma);
        btn.disabled = false;
        const result = (!d || d === '-' || !m) ? { value: null, error: null } : await checkDocMa(doc, ma);
        const ok = result.value;
        const old = checkCell.querySelector?.('.tag-ok, .tag-no, .tag-muted');
        if (old) old.remove();
        const tag = document.createElement('span');
        if (result.error) { tag.className = 'tag-muted'; tag.textContent = '!'; tag.title = result.error?.message || String(result.error); }
        else if (ok === null) { tag.className = 'tag-muted'; tag.textContent = '?'; }
        else if (ok) { tag.className = 'tag-no'; tag.textContent = 'DUP'; }
        else { tag.className = 'tag-ok'; tag.textContent = 'OK'; }
        checkCell.appendChild(document.createTextNode(' '));
        checkCell.appendChild(tag);
    };

    const refreshCompareCheckTags = async () => {
        if (!compareTableBody) return;
        const trs = Array.from(compareTableBody.querySelectorAll('tr'));
        for (const tr of trs) {
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) continue;
            const rightMissing = tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.classList?.contains('missing-cell') || false;
            if (rightMissing) continue;
            await updateCheckForCompareRow(tr);
        }
        updateCompareSummaryFromDom({ compareSummary, compareTableBody });
    };

    const scheduleCheckForCompareRow = (tr) => {
        if (!tr) return;
        const prev = compareRowCheckTimers.get(tr);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
            try { await updateCheckForCompareRow(tr); updateCompareSummaryFromDom({ compareSummary, compareTableBody }); } catch (e) {}
        }, 250);
        compareRowCheckTimers.set(tr, t);
    };

    // Auto-check when table is rendered
    if (compareTableBody) {
        const observer = new MutationObserver(() => {
            if (autoCheckTimer) clearTimeout(autoCheckTimer);
            autoCheckTimer = setTimeout(async () => {
                try {
                    await refreshCompareCheckTags();
                } catch (e) {}
            }, 100);
        });
        observer.observe(compareTableBody, { childList: true, subtree: true });
    }

    const onCompareTableClick = async (ev) => {
        const target = ev?.target || null;
        const btn = target?.closest?.('button.js-check-row') || null;
        if (!btn) return;
        const tr = btn.closest('tr');
        if (!tr) return;
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) return;
        const doc = tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.innerText || '';
        const ma = tds[COMPARE_TABLE_IDX.RIGHT_MA]?.innerText || '';
        const d = normalizeDupValue(doc);
        const m = normalizeDupValue(ma);
        const result = (!d || d === '-' || !m) ? { value: null, error: null } : await checkDocMa(doc, ma);
        const ok = result.value;
        const cell = btn.closest('td');
        if (!cell) return;
        const old = cell.querySelector?.('.tag-ok, .tag-no, .tag-muted');
        if (old) old.remove();
        const tag = document.createElement('span');
        if (result.error) { tag.className = 'tag-muted'; tag.textContent = '!'; tag.title = result.error?.message || String(result.error); }
        else if (ok === null) { tag.className = 'tag-muted'; tag.textContent = '?'; }
        else if (ok) { tag.className = 'tag-no'; tag.textContent = 'DUP'; }
        else { tag.className = 'tag-ok'; tag.textContent = 'OK'; }
        cell.appendChild(document.createTextNode(' '));
        cell.appendChild(tag);
        updateCompareSummaryFromDom({ compareSummary, compareTableBody });
    };

    return { scheduleCheckForCompareRow, refreshCompareCheckTags, onCompareTableClick };
};
