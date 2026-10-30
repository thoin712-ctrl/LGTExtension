import { saveExcelDataToDb, getExcelDataFromDb } from '../db/repo.js';
import { getAllDataKetQuaRowsFromDb } from '../db/repo.js';
import { normalizeCompareValue } from '../utils/text.js';
import { DATA_KET_QUA_IDX } from '../db/constants.js';

export const processSourceDocAfterLoad = async ({ excelRows, status, setStatus }) => {
    if (!Array.isArray(excelRows) || excelRows.length === 0) return;

    // Nhóm line theo mã tài liệu
    const docMap = new Map();
    for (const row of excelRows) {
        const doc = String(row.doc || '').trim();
        if (!doc || doc === '-') continue;
        const key = normalizeCompareValue(doc).toUpperCase();
        if (!docMap.has(key)) {
            docMap.set(key, { doc, excelCount: 0, docRows: [] });
        }
        const entry = docMap.get(key);
        entry.excelCount += 1;
        entry.docRows.push(row);
    }

    if (docMap.size === 0) {
        setStatus(status, 'Không tìm thấy mã tài liệu trong file Excel.', 'warn');
        return;
    }

    // Lấy toàn bộ data_ket_qua để so sánh
    const dataRows = await getAllDataKetQuaRowsFromDb();
    const normDoc = (v) => normalizeCompareValue(v).toUpperCase();

    // Đếm line trong data_ket_qua theo mã tài liệu
    for (const entry of docMap.values()) {
        const docKey = normDoc(entry.doc);
        let dataCount = 0;
        for (const r of dataRows.slice(1)) { // Bỏ header
            if (!Array.isArray(r)) continue;
            const docInData = String(r[DATA_KET_QUA_IDX.DOC] || '').trim();
            if (normDoc(docInData) === docKey) {
                dataCount += 1;
            }
        }
        entry.dataCount = dataCount;
    }

    // Lưu từng tài liệu vào Local DB và Firebase, track which were new
    const newDocs = [];
    const existingDocs = [];
    for (const entry of docMap.values()) {
        const { doc, docRows } = entry;
        const saved = await saveExcelDataToDb(doc, docRows);
        if (saved) {
            newDocs.push(entry);
        } else {
            existingDocs.push(entry);
        }
    }

    // Tạo summary
    const summaryLines = [];
    for (const entry of [...newDocs, ...existingDocs]) {
        const { doc, excelCount, dataCount } = entry;
        let statusText = '';
        if (dataCount > excelCount) {
            statusText = 'Đã duyệt dư';
        } else if (dataCount === excelCount) {
            statusText = 'Đã duyệt đủ';
        } else {
            statusText = 'Đã duyệt thiếu';
        }
        const isNew = newDocs.includes(entry);
        summaryLines.push(`${doc} (${isNew ? 'mới' : 'đã có'}): Excel ${excelCount} line | Data ${dataCount} line (${statusText})`);
    }

    setStatus(status, `Đã xử lý ${docMap.size} tài liệu (${newDocs.length} mới, ${existingDocs.length} đã có): ${summaryLines.join('; ')}`, 'ok');
};
