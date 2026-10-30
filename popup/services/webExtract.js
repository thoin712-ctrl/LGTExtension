const extractPageData = () => {
    const fold = (s) => {
        const t = String(s == null ? '' : s);
        try { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
        catch (e) { return t.replace(/\s+/g, ' ').trim().toUpperCase(); }
    };
    const getCellValue = (cell) => {
        const inputs = Array.from(cell.querySelectorAll('input, select, textarea'));
        if (inputs.length > 0) {
            const values = inputs.map(el => {
                if (el.matches('input[type=checkbox], input[type=radio]')) return el.checked ? (el.value || 'on') : '';
                return el.value || el.placeholder || '';
            }).filter(Boolean);
            if (values.length > 0) return values.join(' | ');
        }
        return cell.innerText.replace(/\s+/g, ' ').trim();
    };
    const isCancelPrPage = () => {
        try {
            const labels = Array.from(document.querySelectorAll('label'));
            for (const lb of labels) {
                const t = fold(lb.textContent || '');
                if (!t.includes('LOAI PR')) continue;
                const parent = lb.closest('.ant-form-item, .form-group, .ant-row, .row, div') || lb.parentElement;
                const inputNear = parent ? parent.querySelector('input[type="text"], input:not([type]), textarea, select') : null;
                const value = inputNear && inputNear.value != null ? String(inputNear.value || '').trim() : '';
                if (fold(value).includes('HUY PR') || fold(value).includes('HUY')) return true;
            }
        } catch (e) {}
        return false;
    };
    const fromHtmlTables = () => {
        return Array.from(document.querySelectorAll('table')).flatMap(table =>
            Array.from(table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')).map(tr =>
                Array.from(tr.querySelectorAll(':scope > td, :scope > th')).map(getCellValue)
            )
        ).filter(r => r.length > 0);
    };
    const fromAntTables = () => {
        const out = [];
        const roots = Array.from(document.querySelectorAll('.ant-table, .ant-table-wrapper, .ant-table-container, .ant-table-content, .rc-virtual-list'));
        const rootCount = roots.length;
        const pushRow = (cells) => { if (Array.isArray(cells) && cells.length > 0) out.push(cells); };
        for (const root of roots) {
            const headRows = Array.from(root.querySelectorAll('.ant-table-thead > tr, thead > tr'));
            for (const tr of headRows) pushRow(Array.from(tr.querySelectorAll('th, td')).map(getCellValue));
            const bodyTrs = Array.from(root.querySelectorAll('.ant-table-tbody > tr, tbody > tr'));
            if (bodyTrs.length > 0) {
                for (const tr of bodyTrs) pushRow(Array.from(tr.querySelectorAll('td, th')).map(getCellValue));
                continue;
            }
            const virtualRows = Array.from(root.querySelectorAll('.ant-table-body .ant-table-row, .ant-table-body [role="row"], .ant-table-body [data-row-key], .rc-virtual-list .ant-table-row, .rc-virtual-list [role="row"], .rc-virtual-list [data-row-key]'));
            for (const r of virtualRows) {
                const cells = Array.from(r.querySelectorAll('.ant-table-cell, [role="gridcell"], [role="cell"], td, th')).map(getCellValue);
                if (cells.length > 0) pushRow(cells);
            }
        }
        return { rows: out.filter(r => r.length > 0), rootCount };
    };
    const fromRoleRows = () => {
        const out = [];
        const pushRow = (cells) => { if (Array.isArray(cells) && cells.length > 0) out.push(cells); };
        const roleRows = Array.from(document.querySelectorAll('[role="row"]'));
        for (const r of roleRows) {
            const cells = Array.from(r.querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"], .ant-table-cell')).map(getCellValue);
            if (cells.length === 0) continue;
            pushRow(cells);
        }
        return { rows: out, roleRowCount: roleRows.length };
    };
    const htmlRows = fromHtmlTables();
    const ant = fromAntTables();
    const antRows = ant.rows || [];
    const role = fromRoleRows();
    const roleRows = role.rows || [];
    const rows = [...htmlRows, ...antRows];
    const rows2 = rows.length > 0 ? rows : [...antRows, ...roleRows];

    const selectMainWebTableByHeader = (allRows) => {
        const required = [
            'DUYET',
            'CHI TIET',
            'STT',
            'MA SAN PHAM',
            'TEN SAN PHAM',
            'SO LUONG',
            'DVT',
            'GIA UOC TINH',
            'NGAY NHAN HANG'
        ];
        const scoreRow = (row) => {
            if (!Array.isArray(row) || row.length === 0) return 0;
            const cells = row.map(c => fold(c));
            if (cells.length === 0) return 0;
            let hit = 0;
            for (const key of required) {
                if (cells.some(c => c === key || c.includes(key))) hit += 1;
            }
            return hit;
        };
        let bestIdx = -1;
        let bestScore = 0;
        for (let i = 0; i < allRows.length; i += 1) {
            const s = scoreRow(allRows[i]);
            if (s > bestScore) { bestScore = s; bestIdx = i; }
        }
        if (bestIdx < 0 || bestScore < 4) return { rows: allRows, bestIdx, bestScore, headerRow: null };
        const out = [allRows[bestIdx]];
        for (let i = bestIdx + 1; i < allRows.length; i += 1) {
            const r = allRows[i];
            if (!Array.isArray(r) || r.length === 0) continue;
            const s = scoreRow(r);
            if (s >= bestScore && out.length > 1) break;
            out.push(r);
        }
        return { rows: out, bestIdx, bestScore, headerRow: allRows[bestIdx] || null };
    };

    const isCancel = isCancelPrPage();
    const selected = isCancel ? { rows: rows2, bestIdx: -1, bestScore: -1, headerRow: null } : selectMainWebTableByHeader(rows2);
    const finalRows = selected.rows || [];
    const normalizeLink = (href) => { try { return new URL(href, document.baseURI).href; } catch (e) { return href; } };
    const fileExtensionsRegex = /\.(pdf|xls|xlsx|doc|docx|ppt|pptx|csv|txt)(?:[?#].*)?$/i;
    const downloadSelectors = ['a.ant-upload-list-item-name[href]'];
    const getHref = (el) => el.href || el.getAttribute('href') || '';
    const links = downloadSelectors.map(sel => Array.from(document.querySelectorAll(sel))).flat().map(el => normalizeLink(getHref(el))).filter(href => typeof href === 'string' && fileExtensionsRegex.test(href.toLowerCase()));
    const debug = {
        isCancelPr: isCancel,
        counts: {
            htmlRows: htmlRows.length,
            antRows: antRows.length,
            antRoots: ant.rootCount || 0,
            roleRows: roleRows.length,
            roleRowNodes: role.roleRowCount || 0,
            combinedRows: rows.length,
            rowsAfterFallback: rows2.length,
            finalRows: finalRows.length
        },
        headerPick: {
            bestIdx: selected.bestIdx,
            bestScore: selected.bestScore,
            headerSample: Array.isArray(selected.headerRow) ? selected.headerRow.slice(0, 14) : null
        },
        sample: finalRows.slice(0, 3).map(r => Array.isArray(r) ? r.slice(0, 14) : [])
    };
    console.log('[qt_debug] extractPageData result', {
        pageUrl: window.location.href,
        counts: debug.counts,
        headerPick: debug.headerPick,
        sample: debug.sample
    });
    return { rows: finalRows, fileLinks: links, pageUrl: window.location.href, debug };
};

export const runExtraction = async (tabId) => {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: extractPageData });
    const parts = (results || []).map(r => r?.result || null).filter(Boolean);
    if (parts.length === 0) return null;
    const rows = [];
    const fileLinks = [];
    let pageUrl = '';
    const debugParts = [];
    for (const p of parts) {
        if (!pageUrl && p.pageUrl) pageUrl = String(p.pageUrl);
        for (const r of (p.rows || [])) rows.push(r);
        for (const l of (p.fileLinks || [])) fileLinks.push(l);
        if (p.debug) debugParts.push(p.debug);
    }
    const uniq = (arr) => Array.from(new Set(arr.map(x => String(x || '')).filter(Boolean)));
    const uniqRows = (() => {
        const seen = new Set();
        const out = [];
        for (const r of rows) {
            const key = JSON.stringify(r || []);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(r);
        }
        return out;
    })();
    const pickDebug = (() => {
        if (debugParts.length === 0) return null;
        let best = debugParts[0];
        for (const d of debugParts) {
            const a = d?.counts?.finalRows || 0;
            const b = best?.counts?.finalRows || 0;
            if (a > b) best = d;
        }
        return best;
    })();
    try {
        console.log('[qt_debug] runExtraction', {
            tabId,
            frames: parts.length,
            rowsTotal: rows.length,
            uniqRows: uniqRows.length,
            fileLinks: fileLinks.length,
            pageUrl,
            bestDebug: pickDebug
        });
    } catch (e) {}
    return { rows: uniqRows, fileLinks: uniq(fileLinks), pageUrl, debug: pickDebug };
};

export const extractWebFileBaseName = async (tabId) => {
    const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
            const spans = Array.from(document.querySelectorAll('span.fz-13'));
            for (const el of spans) { const text = (el?.textContent ? String(el.textContent) : '').trim(); if (text) return { ok: true, text }; }
            return { ok: false, text: '' };
        }
    });
    const okResult = (results || []).map(r => r?.result || null).find(r => r && r.ok && r.text);
    return okResult?.text ? String(okResult.text) : '';
};

export const extractWebPrInfo = async (tabId) => {
    const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
            const el = document.querySelector('span.fz-13');
            if (!el) return { ok: false, prOne: '', prSap: '', raw: '' };
            const raw = (el.textContent ? String(el.textContent) : '').trim();
            const textNodes = Array.from(el.childNodes || []).filter(n => n && n.nodeType === Node.TEXT_NODE);
            const prOneFromTextNode = textNodes.map(n => String(n.textContent || '')).join(' ').replace(/\s+/g, ' ').trim();
            let prSap = '';
            for (const s of Array.from(el.querySelectorAll('span'))) {
                const t = (s?.textContent ? String(s.textContent) : '').replace(/\s+/g, ' ').trim();
                if (!t) continue;
                const pipeIdx = t.indexOf('|');
                if (pipeIdx >= 0) { prSap = t.slice(pipeIdx + 1).trim(); break; }
            }
            if (!prSap && raw.includes('|')) prSap = raw.split('|').slice(1).join('|').trim();
            let prOne = prOneFromTextNode;
            if (!prOne && raw) prOne = raw.includes('|') ? raw.split('|')[0].trim() : raw;
            return { ok: true, prOne, prSap, raw };
        }
    });
    const okResult = (results || []).map(r => r?.result || null).find(r => r && r.ok);
    if (!okResult) return { prOne: '', prSap: '', raw: '' };
    return { prOne: okResult.prOne ? String(okResult.prOne).trim() : '', prSap: okResult.prSap ? String(okResult.prSap).trim() : '', raw: okResult.raw ? String(okResult.raw).trim() : '' };
};

export const extractWebPrType = async (tabId) => {
    const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
            const fold = (s) => {
                const t = String(s == null ? '' : s);
                try { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
                catch (e) { return t.replace(/\s+/g, ' ').trim().toUpperCase(); }
            };
            const labels = Array.from(document.querySelectorAll('label'));
            for (const lb of labels) {
                const t = fold(lb.textContent || '');
                if (!t.includes('LOAI PR')) continue;
                const parent = lb.closest('.ant-form-item, .form-group, .ant-row, .row, div') || lb.parentElement;
                const inputNear = parent ? parent.querySelector('input[type="text"], input:not([type]), textarea, select') : null;
                if (inputNear && inputNear.value != null) return { ok: true, type: String(inputNear.value || '').trim() };
                const sib = lb.nextElementSibling;
                if (sib && sib.matches('input, textarea, select')) return { ok: true, type: String(sib.value || '').trim() };
                if (sib) {
                    const inSib = sib.querySelector ? sib.querySelector('input[type="text"], input:not([type]), textarea, select') : null;
                    if (inSib && inSib.value != null) return { ok: true, type: String(inSib.value || '').trim() };
                }
            }
            const disabledInputs = Array.from(document.querySelectorAll('input[disabled][value]')).map(el => String(el.value || '').trim()).filter(Boolean);
            const hit = disabledInputs.find(v => fold(v).includes('HUY PR') || fold(v).includes('HUY'));
            if (hit) return { ok: true, type: hit };
            return { ok: false, type: '' };
        }
    });
    const okResult = (results || []).map(r => r?.result || null).find(r => r && r.ok && r.type);
    return okResult?.type ? String(okResult.type).trim() : '';
};
