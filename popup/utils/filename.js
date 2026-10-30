export const sanitizeFilenamePart = (name) => {
    const raw = String(name == null ? '' : name).trim();
    const cleaned = raw.replace(/[\\/:*?"<>|]/g, '_')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
    const finalName = cleaned ? cleaned : 'diff';
    return finalName.length > 120 ? finalName.slice(0, 120).trim() : finalName;
};

export const formatTimestamp = (d) => {
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
};
