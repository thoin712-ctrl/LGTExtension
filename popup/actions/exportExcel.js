import { extractWebFileBaseName, runExtraction } from '../services/webExtract.js';
import { setStatus } from '../ui/status.js';

export const exportWebToExcel = async ({ status, setMessage, getActiveTab }) => {
    if (!chrome.downloads) { setStatus(status, 'Thiếu quyền downloads. Hãy reload extension.', 'err'); return; }
    if (!window.XLSX?.utils || !window.XLSX?.write) { setStatus(status, 'Thiếu thư viện đọc Excel. Hãy reload extension.', 'err'); return; }
    setStatus(status, 'Đang lấy dữ liệu Web...', 'info');
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus(status, 'Không tìm thấy tab hiện tại.', 'err'); return; }
    const tabId = tab.id;
    console.log('[qt_debug] exportWebToExcel start', { tabId });
    let extracted;
    try {
        extracted = await runExtraction(tabId);
        console.log('[qt_debug] exportWebToExcel extracted', { tabId, rows: extracted?.rows?.length || 0, fileLinks: extracted?.fileLinks?.length || 0, pageUrl: extracted?.pageUrl });
    } catch (e) {
        console.error('[qt_debug] exportWebToExcel runExtraction error', e, { tabId });
        setStatus(status, 'Không thể lấy dữ liệu trang.', 'err');
        return;
    }
    const aoa = extracted?.rows && Array.isArray(extracted.rows) ? extracted.rows : [];
    if (aoa.length === 0) { setStatus(status, 'Không tìm thấy bảng dữ liệu để xuất.', 'warn'); setMessage('Hãy mở trang có bảng dữ liệu trước khi bấm nút.'); return; }
    const sanitizeFilename = (name) => String(name == null ? '' : name).trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim();
    let baseName = 'web';
    try { const n = await extractWebFileBaseName(tab.id); if (n) baseName = n; } catch (e) {}
    const suggested = sanitizeFilename(`${baseName}.xlsx`) || 'web.xlsx';
    const asked = prompt('Tên file Excel (.xlsx):', suggested);
    if (asked == null) { setStatus(status, 'Đã hủy xuất file.', 'warn'); return; }
    let fileName = sanitizeFilename(asked);
    if (!fileName) { setStatus(status, 'Đã hủy xuất file.', 'warn'); return; }
    if (!fileName.toLowerCase().endsWith('.xlsx')) fileName += '.xlsx';
    fileName = sanitizeFilename(fileName);
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Web');
    const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const filename = `extension/${fileName}`;
    setStatus(status, 'Đang xuất Web ra Excel...', 'info');
    chrome.downloads.download({ url, filename, saveAs: true, conflictAction: 'uniquify' }, () => {
        const err = chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        if (err) { setStatus(status, 'Không thể xuất file.', 'err'); setMessage(err.message || String(err)); return; }
        setStatus(status, 'Đã xuất Excel.', 'ok');
    });
};
