import { COMPARE_TABLE_IDX } from '../db/constants.js';

export const updateCompareSummaryFromDom = ({ compareSummary, compareTableBody }) => {
    if (!compareSummary || !compareTableBody) return;
    if (compareSummary?.dataset?.lock === '1') return;
    const trs = Array.from(compareTableBody.querySelectorAll('tr'));
    let total = 0, matched = 0, diff = 0, same = 0, missingExcel = 0, missingWeb = 0, checkOk = 0, checkNo = 0, checkNa = 0;
    for (const tr of trs) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < COMPARE_TABLE_IDX.TOTAL_COLS) continue;
        total += 1;
        const leftMissing = tds[COMPARE_TABLE_IDX.LEFT_DOC]?.classList?.contains('missing-cell') || false;
        const rightMissing = tds[COMPARE_TABLE_IDX.RIGHT_DOC]?.classList?.contains('missing-cell') || false;
        if (leftMissing && !rightMissing) missingExcel += 1;
        if (!leftMissing && rightMissing) missingWeb += 1;
        if (!leftMissing && !rightMissing) {
            matched += 1;
            const rowHasDiff = tds.slice(0, COMPARE_TABLE_IDX.RIGHT_CHECK).some(td => td?.classList?.contains('diff-cell'));
            if (rowHasDiff) diff += 1;
            else same += 1;
        }
        if (!rightMissing) {
            const checkCell = tds[COMPARE_TABLE_IDX.RIGHT_CHECK];
            if (checkCell?.querySelector) {
                if (checkCell.querySelector('.tag-ok')) checkOk += 1;
                else if (checkCell.querySelector('.tag-no')) checkNo += 1;
                else checkNa += 1;
            } else checkNa += 1;
        }
    }
    compareSummary.textContent = `Tổng: ${total} | Match: ${matched} | Same: ${same} | Diff: ${diff} | Thiếu Excel: ${missingExcel} | Thiếu Web: ${missingWeb} | Check OK: ${checkOk} | NO: ${checkNo} | -: ${checkNa}`;
};
