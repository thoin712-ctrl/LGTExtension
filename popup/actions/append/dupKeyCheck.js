import { getDupKeyByHeader, formatDupColumnsByHeader } from '../../db/keys.js';

export const findDuplicateItems = async ({ storedHeader, dataRows, allowDuplicate, dataKetQuaDupKeyExists }) => {
    if (allowDuplicate) return [];
    const batchKeySet = new Set();
    const duplicateItems = [];
    for (let i = 0; i < dataRows.length; i += 1) {
        const row = dataRows[i];
        const key = getDupKeyByHeader(storedHeader, row);
        const dupInExisting = await dataKetQuaDupKeyExists(key, row?.[0] || '');
        const dupInBatch = batchKeySet.has(key);
        if (dupInExisting || dupInBatch) duplicateItems.push({ index: i + 1, row, dupKey: key, dupInExisting, dupInBatch });
        else batchKeySet.add(key);
    }
    return duplicateItems;
};

export const formatDuplicateLines = ({ storedHeader, duplicateItems }) => {
    return duplicateItems.map(item => {
        const reason = item.dupInExisting ? 'đã có trong data_ket_qua' : 'trùng trong lần gửi này';
        return `Row ${item.index}: ${formatDupColumnsByHeader(storedHeader, item.row)} (${reason})`;
    });
};
