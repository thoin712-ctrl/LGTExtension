export const setStatus = (statusEl, text, kind) => {
    const el = statusEl || null;
    if (!el) return;
    const t = String(text == null ? '' : text);
    el.innerText = t;
    const k0 = String(kind == null ? '' : kind).trim();
    const k = k0 || (() => {
        const u = t.trim().toUpperCase();
        if (!u) return 'info';
        if (u.startsWith('KHÔNG') || u.startsWith('KO ') || u.startsWith('LỖI') || u.startsWith('THIẾU')) return 'err';
        if (u.includes('CẢNH BÁO') || u.includes('CHỜ') || u.includes('HỦY')) return 'warn';
        if (u.startsWith('ĐÃ') || u.includes('XONG')) return 'ok';
        return 'info';
    })();
    el.dataset.kind = k;
};
