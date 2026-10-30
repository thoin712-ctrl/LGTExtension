import { setStatus } from '../ui/status.js';

export const performApproveClick = async ({ status, setMessage, getActiveTab }) => {
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus(status, 'Không tìm thấy tab hiện tại.', 'err'); return { ok: false }; }
    setStatus(status, 'Auto click DUYỆT đã tắt. Vui lòng tự nhấn DUYỆT trên web.', 'warn');
    setMessage('Auto click DUYỆT đã tắt. Vui lòng tự nhấn DUYỆT trên web.');
    return { ok: true, skipped: true };
};
