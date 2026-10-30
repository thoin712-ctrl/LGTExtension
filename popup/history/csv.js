import { escapeCsvValue } from '../utils/text.js';
import { parseDelimitedText } from '../utils/delimited.js';
import { HISTORY_MAX_ITEMS } from '../db/constants.js';

export const buildHistoryCsv = (items) => {
    const lines = ['Thời gian,Mã tài liệu,Mã web,Loại PR,Link,Note'];
    for (const it of (items || [])) {
        const time = it && it.ts ? new Date(it.ts).toISOString() : '';
        const doc = it && it.docNumber ? String(it.docNumber) : '';
        const web = it && it.webCode ? String(it.webCode) : '';
        const prType = it && it.prType ? String(it.prType) : '';
        const link = it && it.pageUrl ? String(it.pageUrl) : '';
        const note = it && it.note ? String(it.note) : '';
        lines.push([time, doc, web, prType, link, note].map(escapeCsvValue).join(','));
    }
    return lines.join('\r\n');
};

export const parseHistoryCsv = (csvText) => {
    const parsed = parseDelimitedText(csvText);
    if (!parsed || parsed.length === 0) return [];
    if (parsed[0] && parsed[0][0]) parsed[0][0] = String(parsed[0][0]).replace(/^\ufeff/, '');
    let start = 0;
    const first = parsed[0] || [];
    const joined = first.map(c => String(c == null ? '' : c).trim().toLowerCase()).join(' ');
    if (/\b(thoi|thời|time|ma tai lieu|mã tài liệu|ma web|mã web|loai pr|loại pr|link|url)\b/i.test(joined)) start = 1;
    const out = [];
    for (const row of parsed.slice(start)) {
        const r = Array.isArray(row) ? row : [];
        const timeRaw = r[0] != null ? String(r[0]).trim() : '';
        const docNumber = r[1] != null ? String(r[1]).trim() : '';
        const webCode = r[2] != null ? String(r[2]).trim() : '';
        const prType = r[3] != null ? String(r[3]).trim() : '';
        const pageUrl = r[4] != null ? String(r[4]).trim() : '';
        const note = r[5] != null ? String(r[5]).trim() : '';
        if (!docNumber && !webCode) continue;
        let ts = 0;
        if (timeRaw) {
            const num = Number(timeRaw);
            if (Number.isFinite(num) && num > 0) ts = Math.trunc(num);
            if (!ts) { const parsedTs = Date.parse(timeRaw); if (!Number.isNaN(parsedTs)) ts = parsedTs; }
        }
        out.push({ docNumber, webCode, pageUrl, prType, note, ts });
    }
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const seen = new Set(), unique = [];
    for (const it of out) {
        const key = `${it.docNumber}||${it.webCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(it);
    }
    return unique.slice(0, HISTORY_MAX_ITEMS);
};
