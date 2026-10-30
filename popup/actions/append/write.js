import { appendDataKetQuaRowsToFirebase, overwriteDataKetQuaRowsOnFirebase } from '../../services/firebase.js';
import { setStatus } from '../../ui/status.js';

export const appendRowsToDbAndDownload = async ({ dataRows, status }) => {
    setStatus(status, 'Đang ghi dữ liệu trực tiếp lên Firebase...', 'info');
    const written = await appendDataKetQuaRowsToFirebase(dataRows);
    return { ok: written === dataRows.length, count: written };
};

export const overwriteRowsByDupKeysToDbAndDownload = async ({ dataRows, dupKeys, docs, status }) => {
    setStatus(status, 'Đang ghi đè dữ liệu trực tiếp trên Firebase...', 'info');
    const written = await overwriteDataKetQuaRowsOnFirebase(dataRows, dupKeys, docs);
    return { ok: written === dataRows.length, count: written };
};
