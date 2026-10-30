import { escapeHtml, normalizeCompareUpper, normalizeCompareUpperNoSpaces, normalizeCompareValue, normalizeDupValue } from '../utils/text.js';
import { diffMarkupByPrefixSuffixFull } from '../utils/diff.js';
import { COMPARE_TABLE_IDX } from '../db/constants.js';

export const renderCompareTables = ({ compareTableBody }, leftRows, rightRows, opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const rightEditable = options.rightEditable !== false;
    const leftEditable = options.leftEditable === true;
    const showCheck = options.showCheck !== false;
    const useSttMatching = options.matchByStt === true;
    const showSplitSttColumns = options.showSplitSttColumns === true;
    const showFullLeftColumns = options.showFullLeftColumns === true;
    const hideDocColumn = options.hideDocColumn === true;
    if (compareTableBody) compareTableBody.innerHTML = '';
    const isMissingMa = (value) => { const v = normalizeCompareValue(value); return v === '' || v === '-'; };
    const normalizeStt = (value) => String(value == null ? '' : value).trim().replace(/\s+/g, '').toUpperCase();
    const normalizeNameForMatch = (value) => { const raw = String(value == null ? '' : value).trim(); if (!raw || raw === '-') return ''; try { return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); } catch (e) { return raw.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); } };
    const tokenizeName = (value) => normalizeNameForMatch(value).split(' ').filter(Boolean).filter(t => t.length >= 2 || /^\d+$/.test(t));
    const wordSimilarity = (a0, b0) => { const aTokens = tokenizeName(a0), bTokens = tokenizeName(b0); if (aTokens.length === 0 || bTokens.length === 0) return { score: 0, inter: 0 }; const aSet = new Set(aTokens), bSet = new Set(bTokens); let inter = 0; for (const t of aSet) if (bSet.has(t)) inter += 1; if (inter === 0) return { score: 0, inter: 0 }; const denom = Math.max(aSet.size, bSet.size); return { score: denom === 0 ? 0 : inter / denom, inter }; };
    const rightQueuesByMa = new Map();
    for (const r of rightRows) { if (!r || isMissingMa(r.ma)) continue; const key = normalizeCompareUpper(r.ma); if (!rightQueuesByMa.has(key)) rightQueuesByMa.set(key, []); rightQueuesByMa.get(key).push(r); }
    const rightQueuesByStt = new Map();
    for (const r of rightRows) { if (!r) continue; const key = normalizeStt(r.stt); if (!key) continue; if (!rightQueuesByStt.has(key)) rightQueuesByStt.set(key, []); rightQueuesByStt.get(key).push(r); }
    const buildAIMatchMapping = (pairs) => {
        const leftToRightMap = new Map();
        const rightUsedSet = new Set();
        if (!Array.isArray(pairs)) return { leftToRightMap, rightUsedSet };
        for (const item of pairs) {
            if (!item) continue;
            let left = null;
            let right = null;
            if (typeof item.leftIndex === 'number') left = leftRows[item.leftIndex];
            if (typeof item.rightIndex === 'number' && item.rightIndex >= 0) right = rightRows[item.rightIndex];
            if (!left && item.leftId != null) left = leftRows.find(r => r && r.id != null && String(r.id) === String(item.leftId));
            if (!right && item.rightId != null) right = rightRows.find(r => r && r.id != null && String(r.id) === String(item.rightId));
            if (!left && item.left && typeof item.left === 'object' && item.left.id != null) left = leftRows.find(r => r && r.id != null && String(r.id) === String(item.left.id));
            if (!right && item.right && typeof item.right === 'object' && item.right.id != null) right = rightRows.find(r => r && r.id != null && String(r.id) === String(item.right.id));
            if (!left && item.left && typeof item.left === 'object') left = leftRows.find(r => r && String(r.ma) === String(item.left.ma) && String(r.ten) === String(item.left.ten));
            if (!right && item.right && typeof item.right === 'object') right = rightRows.find(r => r && String(r.ma) === String(item.right.ma) && String(r.ten) === String(item.right.ten));
            if (!left) continue;
            leftToRightMap.set(left, right || null);
            if (right) rightUsedSet.add(right);
        }
        return { leftToRightMap, rightUsedSet };
    };
    let leftToRight = new Map();
    let rightUsed = new Set();
    const leftUnmatched = [];
    if (Array.isArray(options.aiMatchPairs)) {
        const result = buildAIMatchMapping(options.aiMatchPairs);
        leftToRight = result.leftToRightMap;
        rightUsed = result.rightUsedSet;
        for (const l of leftRows) {
            if (!l) continue;
            if (!leftToRight.has(l)) leftUnmatched.push(l);
        }
    } else {
        leftToRight = new Map();
        rightUsed = new Set();
        for (const l of leftRows) {
            if (!l) continue;
            if (useSttMatching) {
                const sttKey = normalizeStt(l.stt);
                if (sttKey) {
                    const q = rightQueuesByStt.get(sttKey) || [];
                    if (q.length > 0) {
                        const r = q.shift();
                        leftToRight.set(l, r);
                        rightUsed.add(r);
                        continue;
                    }
                }
            }
            if (!isMissingMa(l.ma)) { const key = normalizeCompareUpper(l.ma); const q = rightQueuesByMa.get(key) || []; if (q.length > 0) { const r = q.shift(); leftToRight.set(l, r); rightUsed.add(r); continue; } }
            leftUnmatched.push(l);
        }
    }
    const rightUnmatched = rightRows.filter(r => r && !rightUsed.has(r));
    if (leftUnmatched.length > 0 && rightUnmatched.length > 0) {
        const calcRowSimilarity = (l, r) => {
            const nameSim = wordSimilarity(l.ten, r.ten);
            const lMaNorm = normalizeCompareUpper(l.ma);
            const rMaNorm = normalizeCompareUpper(r.ma);
            const lMaNoSpace = normalizeCompareUpperNoSpaces(l.ma);
            const rMaNoSpace = normalizeCompareUpperNoSpaces(r.ma);
            const maSim = (!isMissingMa(l.ma) && !isMissingMa(r.ma)) ? ((lMaNorm === rMaNorm || (lMaNoSpace && lMaNoSpace === rMaNoSpace)) ? 1 : 0) : 0;
            const lDvNorm = normalizeCompareUpper(l.dv);
            const rDvNorm = normalizeCompareUpper(r.dv);
            const lDvNoSpace = normalizeCompareUpperNoSpaces(l.dv);
            const rDvNoSpace = normalizeCompareUpperNoSpaces(r.dv);
            const dvMatch = ((lDvNorm === rDvNorm || (lDvNoSpace && lDvNoSpace === rDvNoSpace)) && lDvNorm !== '') ? 1 : 0;
            const lSlNorm = normalizeCompareUpper(l.sl);
            const rSlNorm = normalizeCompareUpper(r.sl);
            const lSlNoSpace = normalizeCompareUpperNoSpaces(l.sl);
            const rSlNoSpace = normalizeCompareUpperNoSpaces(r.sl);
            const slMatch = ((lSlNorm === rSlNorm || (lSlNoSpace && lSlNoSpace === rSlNoSpace)) && lSlNorm !== '') ? 1 : 0;
            const combinedScore = (nameSim.score * 0.6) + (maSim * 0.2) + (dvMatch * 0.1) + (slMatch * 0.1);
            const interCount = nameSim.inter;
            return { score: combinedScore, inter: interCount, nameSim: nameSim.score, maSim, dvMatch, slMatch };
        };
        const tryFuzzyMatch = ({ minScore }) => {
            const candidates = [];
            for (let i = 0; i < leftUnmatched.length; i += 1) {
                for (let j = 0; j < rightUnmatched.length; j += 1) {
                    const l = leftUnmatched[i], r = rightUnmatched[j];
                    if (!l || !r) continue;
                    const sim = calcRowSimilarity(l, r);
                    if (sim.score <= 0) continue;
                    if (sim.nameSim <= 0 && sim.maSim <= 0) continue;
                    if (sim.inter < 2 && sim.score < minScore) continue;
                    candidates.push({ i, j, ...sim });
                }
            }
            candidates.sort((a, b) => (b.score - a.score) || (b.inter - a.inter) || (b.maSim - a.maSim));
            const usedLeft = new Set(), usedRight = new Set();
            let added = 0;
            for (const c of candidates) {
                if (usedLeft.has(c.i) || usedRight.has(c.j)) continue;
                usedLeft.add(c.i); usedRight.add(c.j);
                const l = leftUnmatched[c.i], r = rightUnmatched[c.j];
                if (!l || !r) continue;
                leftToRight.set(l, r); rightUsed.add(r);
                added += 1;
            }
            return added;
        };
        const added1 = tryFuzzyMatch({ minScore: 0.25 });
        if (leftToRight.size === 0 && added1 === 0) {
            tryFuzzyMatch({ minScore: 0.22 });
        }
    }
    const pairs = [];
    let pairIndex = 0;
    for (const l of leftRows) { if (!l) continue; const r = leftToRight.get(l) || null; pairs.push({ left: l, right: r, pairIndex: pairIndex++ }); }
    for (const r of rightRows) { if (!r) continue; if (rightUsed.has(r)) continue; pairs.push({ left: null, right: r, pairIndex: pairIndex++ }); }
    
    // Group unmatched pairs by similarity for better visualization
    const matchedPairs = pairs.filter(p => p.left && p.right);
    const unmatchedPairs = pairs.filter(p => !p.left || !p.right);
    
    if (options.sortPairs === true && unmatchedPairs.length > 0) {
        const calcUnmatchedSim = (p1, p2) => {
            const r1 = p1.left || p1.right, r2 = p2.left || p2.right;
            if (!r1 || !r2) return 0;
            const nameSim = wordSimilarity(r1.ten, r2.ten);
            const r1MaNorm = normalizeCompareUpper(r1.ma);
            const r2MaNorm = normalizeCompareUpper(r2.ma);
            const r1MaNoSpace = normalizeCompareUpperNoSpaces(r1.ma);
            const r2MaNoSpace = normalizeCompareUpperNoSpaces(r2.ma);
            const maSim = (!isMissingMa(r1.ma) && !isMissingMa(r2.ma)) ? ((r1MaNorm === r2MaNorm || (r1MaNoSpace && r1MaNoSpace === r2MaNoSpace)) ? 1 : 0) : 0;
            const r1DvNorm = normalizeCompareUpper(r1.dv);
            const r2DvNorm = normalizeCompareUpper(r2.dv);
            const r1DvNoSpace = normalizeCompareUpperNoSpaces(r1.dv);
            const r2DvNoSpace = normalizeCompareUpperNoSpaces(r2.dv);
            const dvMatch = ((r1DvNorm === r2DvNorm || (r1DvNoSpace && r1DvNoSpace === r2DvNoSpace)) && r1DvNorm !== '') ? 1 : 0;
            return (nameSim.score * 0.6) + (maSim * 0.2) + (dvMatch * 0.2);
        };
        
        const sorted = [];
        const used = new Set();
        for (let i = 0; i < unmatchedPairs.length; i++) {
            if (used.has(i)) continue;
            used.add(i);
            sorted.push(unmatchedPairs[i]);
            
            let bestJ = -1, bestSim = -1;
            for (let j = i + 1; j < unmatchedPairs.length; j++) {
                if (used.has(j)) continue;
                const sim = calcUnmatchedSim(unmatchedPairs[i], unmatchedPairs[j]);
                if (sim > bestSim) { bestSim = sim; bestJ = j; }
            }
            
            if (bestJ >= 0 && bestSim > 0) {
                used.add(bestJ);
                sorted.push(unmatchedPairs[bestJ]);
            }
        }
        
        pairs.length = 0;
        pairs.push(...matchedPairs, ...sorted);
    } else {
        pairs.length = 0;
        pairs.push(...matchedPairs, ...unmatchedPairs);
    }

    if (options.sortPairs === true) {
        const normQty = (v) => normalizeCompareUpper(String(v == null ? '' : v)).replace(/[,\s]+/g, '');
        const nameKey = (value) => tokenizeName(value).slice(0, 4).join(' ');
        const pick = (p) => p.left || p.right || null;
        const groupKey = (row) => {
            if (!row) return '';
            const ma = normalizeCompareUpperNoSpaces(row.ma);
            if (ma) return `MA:${ma}`;
            const dv = normalizeCompareUpperNoSpaces(row.dv);
            if (dv) return `DV:${dv}`;
            const name = nameKey(row.ten);
            return `NM:${name}`;
        };
        const keyOf = (p) => {
            const row = pick(p);
            if (!row) return { group: '', doc: '', ma: '', name: '', dv: '', sl: '' };
            return {
                group: groupKey(row),
                doc: normalizeCompareUpper(row.doc),
                ma: normalizeCompareUpper(row.ma),
                name: nameKey(row.ten),
                dv: normalizeCompareUpper(row.dv),
                sl: normQty(row.sl)
            };
        };
        const cmp = (a, b) => {
            const ka = keyOf(a), kb = keyOf(b);
            if (ka.group !== kb.group) return ka.group < kb.group ? -1 : 1;
            if (ka.doc !== kb.doc) return ka.doc < kb.doc ? -1 : 1;
            if (ka.ma && kb.ma && ka.ma !== kb.ma) return ka.ma < kb.ma ? -1 : 1;
            if (ka.ma && !kb.ma) return -1;
            if (!ka.ma && kb.ma) return 1;
            if (ka.name !== kb.name) return ka.name < kb.name ? -1 : 1;
            if (ka.dv !== kb.dv) return ka.dv < kb.dv ? -1 : 1;
            if (ka.sl !== kb.sl) return ka.sl < kb.sl ? -1 : 1;
            return a.pairIndex - b.pairIndex;
        };
        pairs.sort(cmp);
    }
    const stripSpaces = (value) => normalizeCompareUpper(value).replace(/\s+/g, '');
    const cellClass = (a, b, hasOther) => {
        if (!hasOther) return 'diff-cell';
        const aNorm = normalizeCompareUpper(a);
        const bNorm = normalizeCompareUpper(b);
        if (aNorm === bNorm) return 'same-cell';
        if (aNorm.replace(/\s+/g, '') === bNorm.replace(/\s+/g, '')) return 'same-cell';
        return 'diff-cell';
    };
    const missingCells = (n) => Array.from({ length: n }, () => '<td class="missing-cell"></td>').join('');
    const buildSideCells = (row, otherRow, isLeft) => {
        if (!row) {
            if (isLeft) {
                let cellCount = showFullLeftColumns ? 14 : (showSplitSttColumns ? 8 : COMPARE_TABLE_IDX.RIGHT_START);
                if (hideDocColumn) cellCount -= 1;
                return missingCells(cellCount);
            }
            let cellCount = showFullLeftColumns ? 7 : (COMPARE_TABLE_IDX.TOTAL_COLS - COMPARE_TABLE_IDX.RIGHT_START);
            if (hideDocColumn) cellCount -= 1;
            return missingCells(cellCount);
        }
        const hasOther = Boolean(otherRow);
        const effectiveDoc = (!isLeft && otherRow?.doc) ? otherRow.doc : row.doc;
        const docClass = hasOther ? 'same-cell' : 'diff-cell';
        const sttClass = docClass;
        const maClass = cellClass(row.ma, otherRow ? otherRow.ma : '', hasOther);
        const tenClass = cellClass(row.ten, otherRow ? otherRow.ten : '', hasOther);
        const dvClass = cellClass(row.dv, otherRow ? otherRow.dv : '', hasOther);
        const slClass = cellClass(row.sl, otherRow ? otherRow.sl : '', hasOther);
        let maHtml = escapeHtml(row.ma), tenHtml = escapeHtml(row.ten), slHtml = escapeHtml(row.sl);
        if (hasOther) { maHtml = diffMarkupByPrefixSuffixFull(row.ma, otherRow.ma).leftHtml; tenHtml = diffMarkupByPrefixSuffixFull(row.ten, otherRow.ten).leftHtml; slHtml = diffMarkupByPrefixSuffixFull(row.sl, otherRow.sl).leftHtml; }
        const leftAttrs = leftEditable ? ' contenteditable="true"' : '';
        const webAttrs = (isLeft || !rightEditable) ? '' : ' contenteditable="true"';
        const ghiChuHtml = escapeHtml(row.ghiChu || '');
        const checkCell = (() => {
            if (isLeft) return '';
            if (!showCheck) return '<td class="missing-cell"></td>';
            const d = normalizeDupValue(effectiveDoc), m = normalizeDupValue(row.ma);
            const tagHtml = (!d || d === '-' || !m) ? '<span class="tag-muted">-</span>' : '<span class="tag-muted">?</span>';
            return `<td class="same-cell"><button type="button" class="btn-mini btn-gray js-check-row">CHECK</button> ${tagHtml}</td>`;
        })();
        const sttText = escapeHtml(row.stt == null ? '' : row.stt);
        const sttAttrs = isLeft ? `${leftAttrs} data-field="sttExcel"` : (rightEditable ? ' contenteditable="true" data-field="sttWeb"' : '');
        const docCell = hideDocColumn ? '' : `<td class="${docClass} col-doc"${isLeft ? leftAttrs : webAttrs}>${escapeHtml(effectiveDoc)}</td>`;
        if (isLeft) {
            if (showFullLeftColumns) {
                const sttExcelText = escapeHtml(row.sttExcel == null ? '' : row.sttExcel);
                const sttWebText = escapeHtml(row.sttWeb == null ? '' : row.sttWeb);
                const prOneText = escapeHtml(row.prOne == null ? '' : row.prOne);
                const prSapText = escapeHtml(row.prSap == null ? '' : row.prSap);
                const ngayDuyetText = escapeHtml(row.ngayDuyet == null ? '' : row.ngayDuyet);
                const prTypeText = escapeHtml(row.prType == null ? '' : row.prType);
                const statusText = escapeHtml(row.status == null ? '' : row.status);
                const leftGhiChuHtml = escapeHtml(row.ghiChu == null ? '' : row.ghiChu);
                return `<td class="${sttClass}"${leftAttrs} data-field="sttExcel">${sttExcelText}</td><td class="${sttClass}"${leftAttrs} data-field="sttWeb">${sttWebText}</td>${docCell}<td class="${docClass}"${leftAttrs} data-field="prOne">${prOneText}</td><td class="${docClass}"${leftAttrs} data-field="prSap">${prSapText}</td><td class="${docClass}"${leftAttrs} data-field="ngayDuyet">${ngayDuyetText}</td><td class="${docClass}"${leftAttrs} data-field="prType">${prTypeText}</td><td class="${maClass}"${leftAttrs} data-field="ma">${maHtml}</td><td class="${tenClass} col-name"${leftAttrs} data-field="ten">${tenHtml}</td><td class="${dvClass}"${leftAttrs} data-field="dv">${escapeHtml(row.dv)}</td><td class="${slClass}"${leftAttrs} data-field="sl">${slHtml}</td><td class="${docClass}"${leftAttrs} data-field="status">${statusText}</td><td class="${docClass}"${leftAttrs} data-field="ghiChu">${leftGhiChuHtml}</td>`;
            }
            if (showSplitSttColumns) {
                const sttExcelText = escapeHtml(row.sttExcel == null ? '' : row.sttWeb);
                const sttWebText = escapeHtml(row.sttWeb == null ? '' : row.sttWeb);
                return `<td class="${sttClass}"${leftAttrs} data-field="sttExcel">${sttExcelText}</td><td class="${sttClass}"${leftAttrs} data-field="sttWeb">${sttWebText}</td>${docCell}<td class="${maClass}"${leftAttrs} data-field="ma">${maHtml}</td><td class="${tenClass} col-name"${leftAttrs} data-field="ten">${tenHtml}</td><td class="${dvClass}"${leftAttrs} data-field="dv">${escapeHtml(row.dv)}</td><td class="${slClass}"${leftAttrs} data-field="sl">${slHtml}</td>`;
            }
            return `<td class="${sttClass}"${sttAttrs}>${sttText}</td>${docCell}<td class="${maClass}"${leftAttrs} data-field="ma">${maHtml}</td><td class="${tenClass} col-name"${leftAttrs} data-field="ten">${tenHtml}</td><td class="${dvClass}"${leftAttrs} data-field="dv">${escapeHtml(row.dv)}</td><td class="${slClass}"${leftAttrs} data-field="sl">${slHtml}</td>`;
        }
        return `<td class="${sttClass}"${sttAttrs}>${sttText}</td>${docCell}<td class="${maClass}"${webAttrs}>${maHtml}</td><td class="${tenClass} col-name"${webAttrs}>${tenHtml}</td><td class="${dvClass}"${webAttrs}>${escapeHtml(row.dv)}</td><td class="${slClass}"${webAttrs}>${slHtml}</td><td class="diff-cell"${webAttrs}>${ghiChuHtml}</td>${checkCell}`;
    };
    const rowsHtml = [];
    for (const pair of pairs) {
        const rowId = pair.left?.id ? `data-id="${escapeHtml(pair.left.id)}"` : '';
        rowsHtml.push(`<tr ${rowId}>${buildSideCells(pair.left, pair.right, true)}${buildSideCells(pair.right, pair.left, false)}</tr>`);
    }
    if (compareTableBody) compareTableBody.innerHTML = rowsHtml.join('');
};
