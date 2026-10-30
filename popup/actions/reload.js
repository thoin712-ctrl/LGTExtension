import { loadSelectedExcelFile } from './loadExcel.js';
import { refreshCurrentPr } from './currentPr.js';
import { setStatus } from '../ui/status.js';

export const doReload = async ({ status, setMessage, compareState, excelFile, excelPaste, currentPrInput, currentPrType, getActiveTab }) => {
    setMessage('');
    setStatus(status, 'Đang reload dữ liệu web + file...', 'info');
    await loadSelectedExcelFile({ excelFile, excelPaste, setMessage });
    await compareState.resetWebState();
    await compareState.refreshWebMapped();
    await refreshCurrentPr({ currentPrInput, currentPrType, getActiveTab });
    await compareState.refreshCompareViewFromExcelText(excelPaste?.value || '');
    setStatus(status, 'Đã reload.', 'ok');
};
