import { getDataKetQuaHeader, setDataKetQuaHeader, dataKetQuaDocMaExists, dataKetQuaDupKeyExists, updateDataKetQuaStatusByCancelKeys, getDataKetQuaStatusesByDupKey, getDataKetQuaStatusesByDocMa } from '../../db/repo.js';
import { extractWebFileBaseName, extractWebPrInfo, extractWebPrType } from '../../services/webExtract.js';
import { normalizeDupValue } from '../../utils/text.js';
import { mapValuesToRowByHeader } from './mapValues.js';
import { buildDocMaWarningLines } from './docMaWarnings.js';
import { findDuplicateItems } from './dupKeyCheck.js';
import { appendRowsToDbAndDownload, overwriteRowsByDupKeysToDbAndDownload } from './write.js';
import { performApproveClick } from '../approveClick.js';
import { setStatus } from '../../ui/status.js';
import { formatDupColumnsByHeader } from '../../db/keys.js';

export const createAppendController = ({ status, docNumberInput, compareState, getActiveTab, setMessage, showMessageConfirm, hideMessageActionButtons, getPendingAction, addHistoryItem }) => {
    let pendingDuplicateAction = '';
    const existsInDataKetQuaByDocMa = dataKetQuaDocMaExists;

    const appendCurrentWebDataToStoreAndCsv = async ({ allowDuplicate, skipDocMaWarning, overwriteDuplicate, action } = {}) => {
        const tab = await getActiveTab();
        if (!tab?.id) { setStatus(status, 'Không tìm thấy tab hiện tại.', 'err'); return { ok: false, kind: 'missing_tab' }; }
        const fallbackDocNumber = (docNumberInput?.value ? String(docNumberInput.value) : '').trim();
        setStatus(status, 'Đang append dữ liệu từ bảng so sánh...', 'info');
        try {
            const storedHeader = await getDataKetQuaHeader();
            await setDataKetQuaHeader(storedHeader);
            let prInfo = { prOne: '', prSap: '', raw: '' };
            try { prInfo = await extractWebPrInfo(tab.id); } catch (e) {}
            let prType = '';
            try { prType = await extractWebPrType(tab.id); } catch (e) {}
            const fold = (s) => { try { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); } catch (e) { return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase(); } };
            const isCancelPr = fold(prType).includes('HUY PR');
            const rowStatus = 'ĐÃ DUYỆT';
            let compareWebRows = [];
            if (isCancelPr) {
                await compareState.refreshWebMapped();
                const webMapped = compareState.getLastWebMappedRows() || [];
                compareWebRows = webMapped.map(r => ({ sttWeb: r.stt || '', sttExcel: '', doc: fallbackDocNumber || '-', ma: r.ma, ten: r.ten, dv: r.dv, sl: r.sl, prSap: r.prSap || '', ghiChu: r.ghiChu || '' })).filter(r => String(r.ma || '').trim() || String(r.ten || '').trim() || String(r.dv || '').trim() || String(r.sl || '').trim() || String(r.prSap || '').trim());
            } else {
                const compareWebRows0 = compareState.getCompareWebRows();
                if (!compareWebRows0?.length) { setStatus(status, 'Chưa có dữ liệu bảng so sánh để gửi.', 'warn'); return { ok: false, kind: 'no_rows' }; }
                compareWebRows = compareWebRows0.map(r => ({ ...r, doc: (r.doc && r.doc !== '-') ? r.doc : (fallbackDocNumber || '-') }));
            }
            if (compareWebRows.length === 0) { setStatus(status, isCancelPr ? 'Chưa có dữ liệu Web để ghi.' : 'Không có dữ liệu để ghi.', 'warn'); return { ok: false, kind: 'no_data' }; }
            const dataRows = compareWebRows.map(r => mapValuesToRowByHeader(storedHeader, { doc: r.doc, prOne: prInfo.prOne || '', prSap: (isCancelPr ? (r.prSap || '') : (prInfo.prSap || '')), ngayDuyet: new Date().toLocaleString(), prType, ma: r.ma, ten: r.ten, dv: r.dv, sl: r.sl, status: rowStatus, ghiChu: r.ghiChu || '', sttExcel: r.sttExcel || '', sttWeb: r.sttWeb || r.stt || '' }));
            if (dataRows.length === 0) { setStatus(status, 'Không có dữ liệu để ghi.', 'warn'); return { ok: false, kind: 'no_data' }; }
            const effectiveAllowDuplicate = Boolean(allowDuplicate) || isCancelPr;
            const effectiveSkipDocMaWarning = Boolean(skipDocMaWarning) || isCancelPr;
            const warningLines = (!effectiveAllowDuplicate && !effectiveSkipDocMaWarning) ? await buildDocMaWarningLines({ compareWebRows, existsInDataKetQuaByDocMa, getDataKetQuaStatusesByDocMa }) : [];
            if (isCancelPr) {
                const normQty = (v) => normalizeDupValue(v).replace(/[,\s]+/g, '');
                const keySet = new Set();
                for (const r of compareWebRows) {
                    const prSap = r.prSap || '';
                    const ma = r.ma || '';
                    const dv = r.dv || '';
                    const sl = r.sl || '';
                    keySet.add(`${normalizeDupValue(prSap)}||${normalizeDupValue(ma)}||${normalizeDupValue(dv)}||${normQty(sl)}`);
                }
                const updatedExisting = await updateDataKetQuaStatusByCancelKeys(keySet, 'ĐÃ HỦY');
                if (updatedExisting > 0) setStatus(status, `Đã cập nhật trạng thái ĐÃ HỦY cho ${updatedExisting} dòng (match theo PR SAP + Mã VT + ĐVT + Số lượng).`, 'warn');
            }
            const duplicateItems = await findDuplicateItems({ storedHeader, dataRows, allowDuplicate: effectiveAllowDuplicate, dataKetQuaDupKeyExists });
            if (duplicateItems.length > 0 && !overwriteDuplicate) {
                const existingDupLines = [];
                const batchDupLines = [];
                
                for (const item of duplicateItems) {
                    const colInfo = formatDupColumnsByHeader(storedHeader, item.row);
                    if (item.dupInExisting) {
                        let statusText = '';
                        if (item.dupKey) {
                            try {
                                const sts = await getDataKetQuaStatusesByDupKey(item.dupKey, 5, item.row?.[0] || '');
                                if (Array.isArray(sts) && sts.length > 0) statusText = ` | Trạng thái: ${sts.join(' | ')}`;
                            } catch (e) {}
                        }
                        existingDupLines.push(`Row ${item.index}: ${colInfo}${statusText}`);
                    } else if (item.dupInBatch) {
                        batchDupLines.push(`Row ${item.index}: ${colInfo}`);
                    }
                }
                
                let warningMsg = 'Phát hiện trùng lặp (so sánh UPPERCASE, tiêu chí: Mã tài liệu + Mã VT + ĐVT + Số lượng):\n';
                if (existingDupLines.length > 0) {
                    warningMsg += `\n[TRÙNG TRONG DATABASE]:\n${existingDupLines.join('\n')}\n`;
                }
                if (batchDupLines.length > 0) {
                    warningMsg += `\n[TRÙNG TRONG DỮ LIỆU WEB HIỆN TẠI]:\n${batchDupLines.join('\n')}\n`;
                }

                const warningText = warningLines.length > 0 ? `\n\nCẢNH BÁO (Mã tài liệu + Mã VT):\n${warningLines.join('\n')}` : '';
                showMessageConfirm({ text: `${warningMsg}${warningText}\n\nChọn ACCEPT DUPLICATE để vẫn ghi (allow duplicate) hoặc OVERWRITE để ghi đè các dòng trùng trong Database.`, okText: 'ACCEPT DUPLICATE', overwriteText: 'OVERWRITE', showOverwrite: existingDupLines.length > 0, cancelText: 'CANCEL', showCancel: true, kind: 'dup_choice', action: action || pendingDuplicateAction || 'run' });
                setStatus(status, 'Không append vì có duplicate.', 'warn');
                return { ok: false, kind: 'duplicate' };
            }
            if (duplicateItems.length > 0 && overwriteDuplicate) {
                const hasBatchDup = duplicateItems.some(x => x.dupInBatch);
                if (hasBatchDup) { setStatus(status, 'Không thể OVERWRITE vì dữ liệu Web hiện tại bị trùng trong chính nó.', 'err'); return { ok: false, kind: 'duplicate_batch' }; }
                const existingDuplicates = duplicateItems.filter(x => x.dupInExisting);
                const dupKeys = Array.from(new Set(existingDuplicates.map(x => String(x.dupKey || '')).filter(Boolean)));
                const docs = Array.from(new Set(existingDuplicates.map(x => String(x.row?.[0] || '').trim()).filter(Boolean)));
                const result = await overwriteRowsByDupKeysToDbAndDownload({ dataRows, dupKeys, docs, status });
                setStatus(status, result.ok ? 'Đã cập nhật dữ liệu trực tiếp trên Firebase.' : 'Không thể ghi dữ liệu lên Firebase.', result.ok ? 'ok' : 'err');
                if (!result.ok && result.error) { setMessage(result.error); return { ok: false, kind: 'write_failed' }; }
                try {
                    const webCode = await extractWebFileBaseName(tab.id);
                    const docForHistory = compareWebRows[0]?.doc ? String(compareWebRows[0].doc) : (fallbackDocNumber || '');
                    let pageUrl = '';
                    try {
                        const t = await chrome.tabs.get(tab.id);
                        pageUrl = String(t?.url || '');
                    } catch (e) {}
                    await addHistoryItem?.({ docNumber: docForHistory, webCode, pageUrl, prType });
                } catch (e) {}
                return { ok: true, kind: 'ok' };
            }
            if (warningLines.length > 0) {
                showMessageConfirm({ text: `CẢNH BÁO (Mã tài liệu + Mã VT):\n${warningLines.join('\n')}\n\nChọn OK để tiếp tục ghi dữ liệu, hoặc CANCEL để dừng và kiểm tra lại.`, okText: 'OK', cancelText: 'CANCEL', kind: 'docma_warning', action: action || pendingDuplicateAction || 'run' });
                setStatus(status, 'Đang chờ xác nhận cảnh báo...', 'warn');
                return { ok: false, kind: 'waiting_confirm' };
            }
            const downloaded = await appendRowsToDbAndDownload({ dataRows, status });
            setStatus(status, downloaded.ok ? 'Đã ghi dữ liệu trực tiếp lên Firebase.' : 'Không thể ghi dữ liệu lên Firebase.', downloaded.ok ? 'ok' : 'err');
            if (!downloaded.ok && downloaded.error) { setMessage(downloaded.error); return { ok: false, kind: 'download_failed' }; }
            try {
                const webCode = await extractWebFileBaseName(tab.id);
                const docForHistory = compareWebRows[0]?.doc ? String(compareWebRows[0].doc) : (fallbackDocNumber || '');
                let pageUrl = '';
                try {
                    const t = await chrome.tabs.get(tab.id);
                    pageUrl = String(t?.url || '');
                } catch (e) {}
                await addHistoryItem?.({ docNumber: docForHistory, webCode, pageUrl, prType });
            } catch (e) {}
            return { ok: true, kind: 'ok' };
        } catch (e) { setStatus(status, `Lỗi khi lưu dữ liệu lên Firebase: ${e?.message || e}`, 'err'); return { ok: false, kind: 'store_failed' }; }
    };

    const onRun = async () => { setMessage(''); hideMessageActionButtons(); pendingDuplicateAction = 'run'; const res = await appendCurrentWebDataToStoreAndCsv({ allowDuplicate: false, skipDocMaWarning: false, action: 'run' }); if (res?.ok) pendingDuplicateAction = ''; };
    const onApprove = async () => { setMessage(''); hideMessageActionButtons(); pendingDuplicateAction = 'approve'; const res = await appendCurrentWebDataToStoreAndCsv({ allowDuplicate: false, skipDocMaWarning: false, action: 'approve' }); if (!res?.ok) return; pendingDuplicateAction = ''; await performApproveClick({ status, setMessage, getActiveTab }); };
    const onAccept = async () => {
        const act = getPendingAction();
        hideMessageActionButtons();
        if (!act) return;
        if (act.kind === 'dup_choice') {
            const action = act.action || pendingDuplicateAction || 'run';
            pendingDuplicateAction = '';
            const res = await appendCurrentWebDataToStoreAndCsv({ allowDuplicate: true, skipDocMaWarning: true, action });
            if (res?.ok && action === 'approve') await performApproveClick({ status, setMessage, getActiveTab });
            return;
        }
        if (act.kind === 'docma_warning') {
            const action = act.action || pendingDuplicateAction || 'run';
            const res = await appendCurrentWebDataToStoreAndCsv({ allowDuplicate: false, skipDocMaWarning: true, action });
            if (res?.ok) { pendingDuplicateAction = ''; if (action === 'approve') await performApproveClick({ status, setMessage, getActiveTab }); }
        }
    };
    const onOverwrite = async () => {
        const act = getPendingAction();
        hideMessageActionButtons();
        if (!act) return;
        if (act.kind !== 'dup_choice') return;
        const action = act.action || pendingDuplicateAction || 'run';
        pendingDuplicateAction = '';
        const res = await appendCurrentWebDataToStoreAndCsv({ allowDuplicate: false, skipDocMaWarning: true, overwriteDuplicate: true, action });
        if (res?.ok && action === 'approve') await performApproveClick({ status, setMessage, getActiveTab });
    };
    const onCancel = async () => { hideMessageActionButtons(); pendingDuplicateAction = ''; setStatus(status, 'Đã hủy thao tác.', 'warn'); setMessage('Đã hủy thao tác.'); };
    return { onRun, onApprove, onAccept, onOverwrite, onCancel };
};
