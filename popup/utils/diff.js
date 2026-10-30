import { escapeHtml } from './text.js';

export const diffMarkupByPrefixSuffixFull = (left, right) => {
    const a = String(left == null ? '' : left);
    const b = String(right == null ? '' : right);
    if (a === b) {
        const html = escapeHtml(a);
        return { leftHtml: html, rightHtml: html, equal: true };
    }
    const maxPrefix = Math.min(a.length, b.length);
    let prefix = 0;
    while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix += 1;
    let suffix = 0;
    const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
    while (suffix < maxSuffix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
    const aHead = a.slice(0, prefix);
    const bHead = b.slice(0, prefix);
    const aMid = a.slice(prefix, a.length - suffix);
    const bMid = b.slice(prefix, b.length - suffix);
    const aTail = a.slice(a.length - suffix);
    const bTail = b.slice(b.length - suffix);
    const leftHtml = `${escapeHtml(aHead)}<span class="diff-char">${escapeHtml(aMid)}</span>${escapeHtml(aTail)}`;
    const rightHtml = `${escapeHtml(bHead)}<span class="diff-char">${escapeHtml(bMid)}</span>${escapeHtml(bTail)}`;
    return { leftHtml, rightHtml, equal: false };
};
