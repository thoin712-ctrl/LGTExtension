import { getAllDataKetQuaRecordsFromDb, updateDataKetQuaRecordById, getExcelDataFromDb, getAllExcelDocNumbers } from '../db/repo.js';
import { DATA_KET_QUA_CANONICAL_HEADER } from '../db/constants.js';

const fold = (value) => {
    try {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    } catch (e) {
        return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
    }
};

const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const clean = (value, fallback = '-') => {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text || fallback;
};

const isCanceledStatus = (status) => fold(status).includes('HUY');

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const getPrLabel = (record) => {
    const prOne = clean(record?.prOne, '');
    const prSap = clean(record?.prSap, '');
    return prOne !== '-' && prOne !== '' ? prOne : (prSap !== '-' && prSap !== '' ? prSap : '-');
};

const normalizeLabel = (s) => {
    try {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    } catch (e) {
        return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
};

const isHeaderRow = (row) => {
    if (!Array.isArray(row)) return false;
    const header = Array.isArray(DATA_KET_QUA_CANONICAL_HEADER) ? DATA_KET_QUA_CANONICAL_HEADER : [];
    if (header.length === 0) return false;
    let matches = 0;
    const maxCheck = Math.min(row.length, header.length);
    for (let i = 0; i < maxCheck; i += 1) {
        const cell = normalizeLabel(row[i]);
        const lab = normalizeLabel(header[i]);
        if (!cell) continue;
        if (cell === lab || cell.includes(lab) || lab.includes(cell)) matches += 1;
    }
    // Treat as header when a reasonable fraction of header columns match
    return matches >= Math.max(1, Math.floor(header.length * 0.25));
};

const aggregateRelationRows = (records, keyword, docExcelMap = new Map()) => {
    const body = Array.isArray(records) ? records : [];
    const docMap = new Map();
    const prMap = new Map();
    const q = fold(keyword || '');
    
    console.log('[aggregateRelationRows] docExcelMap keys:', Array.from(docExcelMap.keys()));

    for (const record of body) {
        if (!record || typeof record !== 'object') continue;
        const doc = clean(record.doc);
        const pr = getPrLabel(record);
        const status = clean(record.status, 'ĐÃ DUYỆT');
        const canceled = isCanceledStatus(status);
        const approved = canceled ? 0 : 1;
        const canceledCount = canceled ? 1 : 0;
        const docKey = fold(doc);
        const prKey = fold(pr);
        const maKey = fold(record.ma);
        const tenKey = fold(record.ten);
        const searchBlob = `${docKey} ${prKey} ${maKey} ${tenKey}`;
        if (q && !searchBlob.includes(q)) continue;

        if (!docMap.has(docKey)) {
            const excelLines = docExcelMap?.get(docKey)?.count || 0;
            if (docExcelMap.size > 0 && excelLines === 0) {
                console.log(`[aggregateRelationRows] docKey "${docKey}" (doc="${doc}") not found in docExcelMap, available keys:`, Array.from(docExcelMap.keys()));
            }
            docMap.set(docKey, {
                doc,
                totalLines: 0,
                approvedLines: 0,
                canceledLines: 0,
                excelLines,
                prs: new Map()
            });
        }
        const docEntry = docMap.get(docKey);
        docEntry.totalLines += 1;
        docEntry.approvedLines += approved;
        docEntry.canceledLines += canceledCount;
        if (!docEntry.prs.has(prKey)) {
            docEntry.prs.set(prKey, { pr, totalLines: 0, approvedLines: 0, canceledLines: 0 });
        }
        const docPr = docEntry.prs.get(prKey);
        docPr.totalLines += 1;
        docPr.approvedLines += approved;
        docPr.canceledLines += canceledCount;

        if (!prMap.has(prKey)) {
            prMap.set(prKey, {
                pr,
                totalLines: 0,
                approvedLines: 0,
                canceledLines: 0,
                docs: new Map()
            });
        }
        const prEntry = prMap.get(prKey);
        prEntry.totalLines += 1;
        prEntry.approvedLines += approved;
        prEntry.canceledLines += canceledCount;
        if (!prEntry.docs.has(docKey)) {
            const excelLines = docExcelMap?.get(docKey)?.count || 0;
            prEntry.docs.set(docKey, { doc, totalLines: 0, approvedLines: 0, canceledLines: 0, excelLines });
        }
        const prDoc = prEntry.docs.get(docKey);
        prDoc.totalLines += 1;
        prDoc.approvedLines += approved;
        prDoc.canceledLines += canceledCount;
    }

    const docEntries = Array.from(docMap.values())
        .map((entry) => ({ ...entry, prCount: entry.prs.size, prList: Array.from(entry.prs.values()).sort((a, b) => b.totalLines - a.totalLines || a.pr.localeCompare(b.pr)) }))
        .sort((a, b) => b.totalLines - a.totalLines || b.prCount - a.prCount || a.doc.localeCompare(b.doc));

    const prEntries = Array.from(prMap.values())
        .map((entry) => ({ ...entry, docCount: entry.docs.size, docList: Array.from(entry.docs.values()).sort((a, b) => b.totalLines - a.totalLines || a.doc.localeCompare(b.doc)) }))
        .sort((a, b) => b.totalLines - a.totalLines || b.docCount - a.docCount || a.pr.localeCompare(b.pr));

    const stats = docEntries.reduce((acc, entry) => {
        acc.totalDocs += 1;
        acc.totalLines += entry.totalLines;
        acc.approvedLines += entry.approvedLines;
        acc.canceledLines += entry.canceledLines;
        return acc;
    }, { totalDocs: 0, totalPrs: prEntries.length, totalLines: 0, approvedLines: 0, canceledLines: 0 });

    const totalExcelLines = Array.from(docExcelMap.values()).reduce((sum, entry) => sum + (entry.count || 0), 0);

    return { docEntries, prEntries, stats, totalExcelLines };
};

const renderSummary = ({ summaryEl, infoEl }, stats, mapCount, totalMapCount, totalExcelLines) => {
    if (summaryEl) {
        let text = `PR: ${formatNumber(stats.totalPrs)} | Tài liệu: ${formatNumber(stats.totalDocs)} | Line: ${formatNumber(stats.totalLines)} | Duyệt: ${formatNumber(stats.approvedLines)} | Hủy: ${formatNumber(stats.canceledLines)}`;
        if (totalExcelLines) text += ` | Excel: ${formatNumber(totalExcelLines)} line`;
        summaryEl.textContent = text;
    }
    if (infoEl) {
        infoEl.textContent = totalMapCount > mapCount ? `${formatNumber(mapCount)}/${formatNumber(totalMapCount)} PR` : `${formatNumber(totalMapCount)} PR`;
    }
};

const renderGraph = (graphEl, prEntries) => {
    if (!graphEl) return;
    if (!prEntries.length) {
        graphEl.innerHTML = '<div class="relation-empty">Không có dữ liệu quan hệ phù hợp.</div>';
        return;
    }
    const limited = prEntries.slice(0, 80);
    graphEl.innerHTML = limited.map((entry) => `
        <div class="relation-map-row">
            <button type="button" class="relation-node relation-node-pr" data-relation-value="${escapeHtml(entry.pr)}" data-relation-kind="pr">
                <span class="relation-node-title">${escapeHtml(entry.pr)}</span>
                <span class="relation-node-meta">${formatNumber(entry.docCount)} tài liệu | ${formatNumber(entry.totalLines)} line</span>
            </button>
            <div class="relation-map-arrow">-></div>
            <div class="relation-doc-stack">
                ${entry.docList.map((doc) => `
                    <button type="button" class="relation-chip" data-relation-value="${escapeHtml(doc.doc)}" data-relation-kind="doc">
                        <span class="relation-chip-title">${escapeHtml(doc.doc)}</span>
                        <span class="relation-chip-meta">${doc.excelLines ? `Excel: ${formatNumber(doc.excelLines)} line | ` : ''}${formatNumber(doc.approvedLines)} duyệt / ${formatNumber(doc.canceledLines)} hủy</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
};

const renderTable = (tableBodyEl, docEntries) => {
    if (!tableBodyEl) return;
    if (!docEntries.length) {
        tableBodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-secondary">Không có dữ liệu để trace.</td></tr>';
        return;
    }
    tableBodyEl.innerHTML = docEntries.map((entry) => `
        <tr>
            <td><button type="button" class="relation-link-btn" data-relation-value="${escapeHtml(entry.doc)}" data-relation-kind="doc">${escapeHtml(entry.doc)}</button></td>
            <td>${entry.excelLines ? formatNumber(entry.excelLines) : '-'}</td>
            <td>${formatNumber(entry.totalLines)}</td>
            <td class="text-success fw-semibold">${formatNumber(entry.approvedLines)}</td>
            <td class="text-danger fw-semibold">${formatNumber(entry.canceledLines)}</td>
            <td>${formatNumber(entry.prCount)}</td>
            <td>
                <div class="relation-pill-list">
                    ${entry.prList.map((pr) => `
                        <button type="button" class="relation-pill" data-relation-value="${escapeHtml(pr.pr)}" data-relation-kind="pr">
                            <span class="relation-pill-title">${escapeHtml(pr.pr)}</span>
                            <span class="relation-pill-meta">${formatNumber(pr.totalLines)} line | ${formatNumber(pr.approvedLines)} duyệt | ${formatNumber(pr.canceledLines)} hủy</span>
                        </button>
                    `).join('')}
                </div>
            </td>
        </tr>
    `).join('');
};

const getFilteredDetailRecords = (records, scope, detailSearch = '') => {
    const all = Array.isArray(records) ? records : [];
    const q = fold(detailSearch || '');
    const filtered = [];
    for (const record of all) {
        if (!record || typeof record !== 'object') continue;
        if (scope?.kind && scope?.value) {
            const key = fold(scope.value);
            if (scope.kind === 'pr' && fold(getPrLabel(record)) !== key) continue;
            if (scope.kind === 'doc' && fold(clean(record.doc)) !== key) continue;
        } else if (!q) {
            continue;
        }
        if (q) {
            const blob = `${fold(record.ma)} ${fold(record.ten)} ${fold(record.status)} ${fold(record.ghiChu)} ${fold(record.doc)} ${fold(getPrLabel(record))}`;
            if (!blob.includes(q)) continue;
        }
        filtered.push(record);
    }
    return filtered;
};

const groupDetailRecords = (records) => {
    const groups = new Map();
    for (const item of (Array.isArray(records) ? records : [])) {
        const doc = clean(item?.doc);
        const pr = getPrLabel(item);
        const key = `${fold(doc)}||${fold(pr)}`;
        if (!groups.has(key)) {
            groups.set(key, {
                doc,
                pr,
                items: [],
                approved: 0,
                canceled: 0
            });
        }
        const group = groups.get(key);
        group.items.push(item);
        if (isCanceledStatus(item?.status)) group.canceled += 1;
        else group.approved += 1;
    }
    return Array.from(groups.values())
        .sort((a, b) => b.items.length - a.items.length || a.doc.localeCompare(b.doc) || a.pr.localeCompare(b.pr));
};

const renderDetailTable = (tableBodyEl, summaryEl, records, scope, detailSearch = '') => {
    if (!tableBodyEl || !summaryEl) return;
    const items = getFilteredDetailRecords(records, scope, detailSearch);
    const hasScope = !!(scope?.kind && scope?.value);
    const hasDetailSearch = !!fold(detailSearch || '');
    if (!hasScope && !hasDetailSearch) {
        summaryEl.textContent = 'Chưa chọn PR hoặc tài liệu.';
        tableBodyEl.innerHTML = '<tr><td colspan="13" class="text-center text-secondary">Bấm vào PR hoặc mã tài liệu để xem từng line, hoặc nhập tìm kiếm Tên VT trên toàn bộ dữ liệu.</td></tr>';
        return;
    }
    const approved = items.filter((item) => !isCanceledStatus(item.status)).length;
    const canceled = items.length - approved;
    let scopeText = '';
    if (hasScope) scopeText += `${scope.kind === 'pr' ? 'PR' : 'Tài liệu'}: ${scope.value} | `;
    if (hasDetailSearch) scopeText += `Tìm: "${detailSearch.trim()}" | `;
    summaryEl.textContent = `${scopeText}${formatNumber(items.length)} line | ${formatNumber(approved)} duyệt | ${formatNumber(canceled)} hủy`;
    if (!items.length) {
        tableBodyEl.innerHTML = '<tr><td colspan="13" class="text-center text-secondary">Không có line nào phù hợp.</td></tr>';
        return;
    }
    let lineNo = 0;
    tableBodyEl.innerHTML = groupDetailRecords(items).map((group) => {
        const groupHeader = `
            <tr class="relation-group-row">
                <td colspan="13">
                    <div class="relation-group-head">
                        <span class="relation-group-key">Tài liệu: ${escapeHtml(group.doc)}</span>
                        <span class="relation-group-key">PR: ${escapeHtml(group.pr)}</span>
                        <span class="relation-group-meta">${formatNumber(group.items.length)} line | ${formatNumber(group.approved)} duyệt | ${formatNumber(group.canceled)} hủy</span>
                    </div>
                </td>
            </tr>
        `;
        const rows = group.items.map((item) => {
            lineNo += 1;
            return `
                <tr data-id="${escapeHtml(item.id)}" data-dirty="0">
                    <td>${lineNo}</td>
                    <td contenteditable="true" data-field="doc">${escapeHtml(item.doc || '')}</td>
                    <td contenteditable="true" data-field="prOne">${escapeHtml(item.prOne || '')}</td>
                    <td contenteditable="true" data-field="prSap">${escapeHtml(item.prSap || '')}</td>
                    <td contenteditable="true" data-field="ma">${escapeHtml(item.ma || '')}</td>
                    <td contenteditable="true" data-field="ten">${escapeHtml(item.ten || '')}</td>
                    <td contenteditable="true" data-field="dv">${escapeHtml(item.dv || '')}</td>
                    <td contenteditable="true" data-field="sl">${escapeHtml(item.sl || '')}</td>
                    <td contenteditable="true" data-field="status">${escapeHtml(item.status || '')}</td>
                    <td contenteditable="true" data-field="ghiChu">${escapeHtml(item.ghiChu || '')}</td>
                    <td contenteditable="true" data-field="sttExcel">${escapeHtml(item.sttExcel || '')}</td>
                    <td contenteditable="true" data-field="sttWeb">${escapeHtml(item.sttWeb || '')}</td>
                    <td contenteditable="true" data-field="ngayDuyet">${escapeHtml(item.ngayDuyet || '')}</td>
                </tr>
            `;
        }).join('');
        return `${groupHeader}${rows}`;
    }).join('');
};

const readRowPatch = (tr) => {
    const patch = {};
    const cells = Array.from(tr.querySelectorAll('[data-field]'));
    for (const cell of cells) {
        const field = String(cell.getAttribute('data-field') || '').trim();
        if (!field) continue;
        patch[field] = String(cell.innerText || '').replace(/\s+/g, ' ').trim();
    }
    return patch;
};

export const createRelationMapUi = ({ statusEl, setStatus, searchInputEl, btnReloadEl, infoEl, summaryEl, graphEl, tableBodyEl, detailSummaryEl, detailSearchInputEl, btnDetailSaveEl, btnDetailClearEl, detailTableBodyEl, mappingSummaryEl, mappingTableBodyEl, excelPasteEl, docNumberInputEl }) => {
    const state = { records: [], loaded: false, detailScope: null, excelRows: [], docExcelMap: new Map() };

    const loadExcel = async () => {
        try {
            console.log('[loadExcel] Starting...');
            const docRowCountMap = new Map(); // Count rows by doc value
            
            // 1. Load ALL source docs from Firebase and count rows by their doc field
            const { fetchAllSourceDocsFromFirebase, extractRowsFromFirebaseSourceDocNode } = await import('../services/firebase.js');
            const allDocs = await fetchAllSourceDocsFromFirebase();
            console.log('[loadExcel] All docs from Firebase:', allDocs);
            
            for (const [sanitizedKey, data] of Object.entries(allDocs)) {
                try {
                    const extracted = extractRowsFromFirebaseSourceDocNode(data, sanitizedKey);
                    
                    if (!extracted) {
                        console.log(`[loadExcel] Extract failed for key ${sanitizedKey}, skipping...`);
                        continue;
                    }
                    
                    const rows = extracted.rows;
                    if (!Array.isArray(rows) || rows.length === 0) {
                        continue;
                    }
                    
                    // Iterate through all rows — skip first only if it looks like a header
                    const startIdx = isHeaderRow(rows[0]) ? 1 : 0;
                    if (startIdx === 1) console.log(`[loadExcel] Detected header row for ${sanitizedKey}, skipping index 0`);
                    for (let i = startIdx; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row) continue;
                        
                        // Extract doc from row (could be object.doc or array[DOC_IDX])
                        let docValue = '';
                        if (typeof row === 'object' && row.doc) {
                            docValue = String(row.doc).trim();
                        } else if (Array.isArray(row)) {
                            // Assume doc is first element in array
                            docValue = String(row[0] || '').trim();
                        }
                        
                        if (!docValue || docValue === '-') continue;
                        
                        const docKey = fold(docValue);
                        const prev = docRowCountMap.get(docKey) || { doc: docValue, count: 0 };
                        prev.count += 1;
                        docRowCountMap.set(docKey, prev);
                    }
                } catch (e) {
                    console.error(`Error processing doc ${sanitizedKey}:`, e);
                }
            }
            
            console.log('[loadExcel] docRowCountMap from source_docs:', docRowCountMap);
            state.docExcelMap = docRowCountMap;
            
            // 2. Also load from current excel paste to track unsaved docs
            const { parseExcelPaste } = await import('../compare/excel.js');
            const excelText = excelPasteEl?.value || '';
            const pasteRows = parseExcelPaste(excelText);
            state.excelRows = pasteRows;
            
        } catch (e) {
            console.error('Error loading Excel map:', e);
            state.excelRows = [];
            state.docExcelMap = new Map();
        }
    };

    const render = async () => {
        await loadExcel();
        const { docEntries, prEntries, stats, totalExcelLines } = aggregateRelationRows(state.records, searchInputEl?.value || '', state.docExcelMap);
        renderSummary({ summaryEl, infoEl }, stats, Math.min(prEntries.length, 80), prEntries.length, totalExcelLines);
        renderGraph(graphEl, prEntries);
        renderTable(tableBodyEl, docEntries);
        renderDetailTable(detailTableBodyEl, detailSummaryEl, state.records, state.detailScope, detailSearchInputEl?.value || '');
    };

    const reload = async () => {
        try {
            setStatus(statusEl, 'Đang tải map quan hệ PR - tài liệu...', 'info');
            await loadExcel();
            state.records = await getAllDataKetQuaRecordsFromDb();
            state.loaded = true;
            render();
            const total = state.records?.length || 0;
            setStatus(statusEl, `Đã tải map quan hệ từ ${formatNumber(total)} dòng DB.`, 'ok');
        } catch (e) {
            setStatus(statusEl, 'Không tải được map quan hệ PR - tài liệu.', 'err');
            if (graphEl) graphEl.innerHTML = '<div class="relation-empty">Không tải được dữ liệu.</div>';
            if (tableBodyEl) tableBodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Không tải được dữ liệu.</td></tr>';
            if (detailTableBodyEl) detailTableBodyEl.innerHTML = '<tr><td colspan="13" class="text-center text-danger">Không tải được dữ liệu line.</td></tr>';
        }
    };

    const ensureLoaded = async () => {
        if (!state.loaded) await reload();
        else await render();
    };

    const applyQuickFilter = (value) => {
        if (!searchInputEl) return;
        searchInputEl.value = String(value || '').trim();
        render();
    };

    const openDetail = (kind, value) => {
        state.detailScope = { kind, value: String(value || '').trim() };
        applyQuickFilter(value);
    };

    const saveDetailChanges = async () => {
        if (!detailTableBodyEl) return;
        const dirtyRows = Array.from(detailTableBodyEl.querySelectorAll('tr[data-dirty="1"]'));
        if (!dirtyRows.length) {
            setStatus(statusEl, 'Chưa có line nào thay đổi.', 'warn');
            return;
        }
        setStatus(statusEl, `Đang lưu ${formatNumber(dirtyRows.length)} line chỉnh sửa...`, 'info');
        let updated = 0;
        for (const tr of dirtyRows) {
            const id = Number(tr.getAttribute('data-id') || 0);
            if (!id) continue;
            const ok = await updateDataKetQuaRecordById(id, readRowPatch(tr));
            if (ok) updated += 1;
        }
        await reload();
        setStatus(statusEl, updated > 0 ? `Đã lưu ${formatNumber(updated)} line chỉnh sửa.` : 'Không lưu được line nào.', updated > 0 ? 'ok' : 'err');
    };

    searchInputEl?.addEventListener('input', render);
    btnReloadEl?.addEventListener('click', reload);
    excelPasteEl?.addEventListener('input', render);
    docNumberInputEl?.addEventListener('input', () => {
        const value = String(docNumberInputEl?.value || '').trim();
        if (value) {
            openDetail('doc', value);
        } else {
            state.detailScope = null;
            render();
        }
    });
    graphEl?.addEventListener('click', (ev) => {
        const btn = ev.target?.closest?.('[data-relation-value]');
        if (!btn) return;
        openDetail(btn.getAttribute('data-relation-kind') || 'doc', btn.getAttribute('data-relation-value') || '');
    });
    tableBodyEl?.addEventListener('click', (ev) => {
        const btn = ev.target?.closest?.('[data-relation-value]');
        if (!btn) return;
        openDetail(btn.getAttribute('data-relation-kind') || 'doc', btn.getAttribute('data-relation-value') || '');
    });
    detailTableBodyEl?.addEventListener('input', (ev) => {
        const td = ev.target?.closest?.('[data-field]');
        const tr = td?.closest?.('tr[data-id]');
        if (!tr) return;
        tr.setAttribute('data-dirty', '1');
        tr.classList.add('relation-row-dirty');
    });
    detailSearchInputEl?.addEventListener('input', render);
    btnDetailSaveEl?.addEventListener('click', saveDetailChanges);
    btnDetailClearEl?.addEventListener('click', () => {
        state.detailScope = null;
        if (detailSearchInputEl) detailSearchInputEl.value = '';
        renderDetailTable(detailTableBodyEl, detailSummaryEl, state.records, state.detailScope, '');
    });
    if (mappingSummaryEl && !mappingSummaryEl.textContent) mappingSummaryEl.textContent = 'Chưa chọn tài liệu để map.';

    return { reload, render, ensureLoaded };
};
