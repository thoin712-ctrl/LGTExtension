import { aoaToPasteText } from '../utils/excelText.js';

export const loadSelectedExcelFile = async ({ excelFile, excelPaste, setMessage }) => {
    try {
        const files = excelFile?.files ? Array.from(excelFile.files) : [];
        if (files.length === 0) return false;
        const parts = [];
        for (const file of files) {
            const name = String(file?.name || '').toLowerCase();
            if (name.endsWith('.xlsx')) {
                if (!window.XLSX?.read || !window.XLSX?.utils) { setMessage('Thiếu thư viện đọc Excel. Hãy reload extension.'); return false; }
                const buf = await file.arrayBuffer();
                const wb = window.XLSX.read(buf, { type: 'array' });
                const sheetName = wb?.SheetNames?.[0] || '';
                const ws = sheetName ? wb.Sheets[sheetName] : null;
                if (!ws) { setMessage('Không đọc được sheet trong file Excel.'); return false; }
                const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                parts.push(aoaToPasteText(aoa));
            } else parts.push(await file.text());
        }
        const text = parts.filter(Boolean).join('\n');
        if (excelPaste) excelPaste.value = text;
        return Boolean(text && text.trim());
    } catch (e) { setMessage('Không đọc được file.'); return false; }
};
