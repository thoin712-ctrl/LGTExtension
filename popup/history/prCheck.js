import { getStoredHistory } from './store.js';

const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();

const isMatch = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    return a.includes(b) || b.includes(a);
};

export const findApprovedPrInHistory = async (currentPr) => {
    const pr = norm(currentPr);
    if (!pr) return null;
    const items = await getStoredHistory();
    const hits = items.filter(it => isMatch(norm(it.webCode), pr));
    if (hits.length === 0) return null;
    hits.sort((x, y) => Number(y.ts || 0) - Number(x.ts || 0));
    return hits[0] || null;
};
