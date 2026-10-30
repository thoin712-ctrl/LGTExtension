import { findHeaderIndex } from '../utils/header.js';
import { escapeHtml } from '../utils/text.js';

const insertTextAtCaret = (text) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (!node) return false;
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
};

const normFilterValue = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

export const createDataTableRenderer = ({ dataTableHead, dataTableBody, dataPageInfo, btnDataPrev, btnDataNext, dataSummary }) => {
    let dataCurrentPage = 1;
    let dataPageSize = 250;
    let externalFilter = null;
    let emptyHint = '';
    const columnFilters = new Map();
    let activeFilterPopup = null;
    let documentCloseHandler = null;
    let onColumnFiltersChanged = null;
    let remotePageInfo = null;

    const setPageSize = (n) => { dataPageSize = Number.isFinite(n) && n > 0 ? n : 250; dataCurrentPage = 1; };
    const setPage = (p) => { dataCurrentPage = Math.max(1, p); };
    const setRemotePageInfo = (current, total, hasMore = false) => {
        remotePageInfo = { current, total, hasMore };
        if (dataPageInfo) dataPageInfo.textContent = `${current}/${total}`;
        if (btnDataPrev) btnDataPrev.disabled = current <= 1;
        if (btnDataNext) btnDataNext.disabled = !hasMore;
    };
    const getState = () => ({ dataCurrentPage, dataPageSize });
    const setExternalFilter = (fn, hint) => { externalFilter = typeof fn === 'function' ? fn : null; emptyHint = String(hint == null ? '' : hint); };
    const setOnColumnFiltersChanged = (cb) => { onColumnFiltersChanged = typeof cb === 'function' ? cb : null; };
    const fireFiltersChanged = () => { try { onColumnFiltersChanged && onColumnFiltersChanged(); } catch (e) {} };

    const getColumnFilter = (colIdx) => columnFilters.get(colIdx);
    const setColumnFilter = (colIdx, values) => {
        const prevSize = columnFilters.size;
        if (!values || (values instanceof Set && values.size === 0) || (Array.isArray(values) && values.length === 0)) {
            columnFilters.delete(colIdx);
        } else {
            const s = values instanceof Set ? values : new Set(Array.from(values).map(normFilterValue).filter(v => v !== ''));
            if (s.size === 0) columnFilters.delete(colIdx);
            else columnFilters.set(colIdx, s);
        }
        if (columnFilters.size !== prevSize) fireFiltersChanged();
    };
    const clearAllColumnFilters = () => { const prevSize = columnFilters.size; columnFilters.clear(); if (prevSize !== 0) fireFiltersChanged(); };
    const hasAnyColumnFilter = () => columnFilters.size > 0;

    const removeDocumentCloseHandler = () => {
        if (documentCloseHandler) {
            document.removeEventListener('mousedown', documentCloseHandler, true);
            documentCloseHandler = null;
        }
    };
    const closeActiveFilterPopup = () => {
        if (activeFilterPopup && activeFilterPopup.parentNode) activeFilterPopup.parentNode.removeChild(activeFilterPopup);
        activeFilterPopup = null;
        removeDocumentCloseHandler();
    };

    const buildUniqueValuesForCol = (colIdx, items) => {
        const map = new Map();
        for (const it of items) {
            const raw = it?.row?.[colIdx];
            const key = normFilterValue(raw);
            if (!key) continue;
            if (!map.has(key)) map.set(key, raw == null ? '' : String(raw));
        }
        return Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }))
            .map(([key, raw]) => ({ key, display: normFilterValue(raw) }));
    };

    const createFilterPopup = ({ colIdx, colLabel, items, currentSelection, onApply, onCancel, anchor }) => {
        const wrap = document.createElement('div');
        wrap.className = 'qt-col-filter';
        wrap.dataset.colIdx = String(colIdx);
        const header = document.createElement('div');
        header.className = 'qt-col-filter-head';
        header.innerHTML = `<strong>${escapeHtml(colLabel)}</strong>`;
        const toolRow = document.createElement('div');
        toolRow.className = 'qt-col-filter-tools';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'form-control form-control-sm';
        searchInput.placeholder = 'Tìm giá trị...';
        const btnBar = document.createElement('div');
        btnBar.className = 'd-flex gap-1 mt-1';
        const btnSelectAll = document.createElement('button');
        btnSelectAll.type = 'button';
        btnSelectAll.className = 'btn btn-xs btn-outline-secondary';
        btnSelectAll.textContent = 'Chọn tất';
        const btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.className = 'btn btn-xs btn-outline-secondary';
        btnClear.textContent = 'Bỏ chọn';
        btnBar.append(btnSelectAll, btnClear);
        toolRow.append(searchInput, btnBar);
        const listWrap = document.createElement('div');
        listWrap.className = 'qt-col-filter-list';
        const foot = document.createElement('div');
        foot.className = 'qt-col-filter-foot';
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn btn-sm btn-outline-secondary';
        btnCancel.textContent = 'HỦY';
        const btnApply = document.createElement('button');
        btnApply.type = 'button';
        btnApply.className = 'btn btn-sm btn-primary';
        btnApply.textContent = 'ÁP DỤNG';
        foot.append(btnCancel, btnApply);
        wrap.append(header, toolRow, listWrap, foot);

        let localSelection = new Set(currentSelection ? Array.from(currentSelection) : []);
        const uniques = buildUniqueValuesForCol(colIdx, items);

        const renderList = () => {
            const q = normFilterValue(searchInput.value).toUpperCase();
            listWrap.innerHTML = '';
            const rows = q ? uniques.filter(u => u.display.toUpperCase().includes(q)) : uniques;
            if (rows.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'text-secondary small p-2 text-center';
                empty.textContent = 'Không có giá trị.';
                listWrap.appendChild(empty);
                return;
            }
            const frag = document.createDocumentFragment();
            for (const u of rows) {
                const lab = document.createElement('label');
                lab.className = 'qt-col-filter-item';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = u.key;
                cb.checked = localSelection.has(u.key);
                cb.addEventListener('change', () => {
                    if (cb.checked) localSelection.add(u.key);
                    else localSelection.delete(u.key);
                });
                const span = document.createElement('span');
                span.className = 'text-truncate';
                span.title = u.display;
                span.textContent = u.display || '(trống)';
                lab.append(cb, span);
                frag.appendChild(lab);
            }
            listWrap.appendChild(frag);
        };
        renderList();
        searchInput.addEventListener('input', renderList);
        btnSelectAll.addEventListener('click', () => {
            localSelection = new Set(uniques.map(u => u.key));
            renderList();
        });
        btnClear.addEventListener('click', () => {
            localSelection = new Set();
            renderList();
        });
        btnCancel.addEventListener('click', () => { onCancel && onCancel(); });
        btnApply.addEventListener('click', () => { onApply && onApply(localSelection); });

        const style = getComputedStyle(document.body);
        const padding = 4;
        let left = 0;
        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            left = rect.left + scrollX;
            let top = rect.bottom + scrollY + padding;
            wrap.style.position = 'absolute';
            wrap.style.left = `${left}px`;
            wrap.style.top = `${top}px`;
            wrap.style.zIndex = '9999';
            const maxLeft = (window.scrollX || 0) + Math.max(document.documentElement.clientWidth, window.innerWidth || 0) - 300;
            if (left > maxLeft) wrap.style.left = `${Math.max(padding, maxLeft)}px`;
        }
        return wrap;
    };

    const renderHeaderCellWithFilter = ({ headerEl, colIdx, th, headerLabel, sourceItems, rerender }) => {
        const iconWrap = document.createElement('span');
        iconWrap.className = 'qt-col-filter-btn' + (columnFilters.has(colIdx) ? ' is-active' : '');
        iconWrap.title = columnFilters.has(colIdx) ? `Lọc đang bật (${columnFilters.get(colIdx).size})` : 'Lọc cột (giống Excel)';
        iconWrap.innerHTML = '▾';
        iconWrap.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (activeFilterPopup && activeFilterPopup.dataset.colIdx === String(colIdx)) { closeActiveFilterPopup(); return; }
            closeActiveFilterPopup();
            const current = columnFilters.get(colIdx);
            const popup = createFilterPopup({
                colIdx,
                colLabel: headerLabel,
                items: sourceItems,
                currentSelection: current,
                onApply: (selection) => {
                    setColumnFilter(colIdx, selection);
                    closeActiveFilterPopup();
                    dataCurrentPage = 1;
                    rerender();
                },
                onCancel: () => { closeActiveFilterPopup(); },
                anchor: iconWrap
            });
            document.body.appendChild(popup);
            activeFilterPopup = popup;
            removeDocumentCloseHandler();
            documentCloseHandler = (e) => {
                if (!activeFilterPopup) return;
                if (activeFilterPopup.contains(e.target)) return;
                if (iconWrap.contains(e.target)) return;
                closeActiveFilterPopup();
            };
            document.addEventListener('mousedown', documentCloseHandler, true);
        });
        th.appendChild(document.createTextNode(' '));
        th.appendChild(iconWrap);
    };

    const applyColumnFilters = (items) => {
        if (columnFilters.size === 0) return items;
        return items.filter(it => {
            const r = it.row;
            if (!Array.isArray(r)) return false;
            for (const [colIdx, set] of columnFilters) {
                const key = normFilterValue(r[colIdx]);
                if (!set.has(key)) return false;
            }
            return true;
        });
    };

    const syncVisibleDataTableToState = (stateRows) => {
        if (!dataTableBody) return;
        const header = Array.isArray(stateRows?.[0]) ? stateRows[0] : [];
        const idxDoc = header.length > 0 ? findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]) : -1;
        const trs = Array.from(dataTableBody.querySelectorAll('tr'));
        for (const tr of trs) {
            const idxRaw = tr?.dataset?.rowIndex || '';
            if (!idxRaw || !/^\d+$/.test(idxRaw)) continue;
            const stateIndex = Number(idxRaw);
            const stateRow = stateRows[stateIndex];
            if (!Array.isArray(stateRow)) continue;
            const tds = Array.from(tr.querySelectorAll('td')).slice(1);
            for (let i = 0; i < tds.length; i += 1) {
                if (tds[i]?.innerText == null) { stateRow[i] = ''; continue; }
                const raw = String(tds[i].innerText);
                stateRow[i] = (i === idxDoc) ? raw : raw.trim();
            }
        }
    };

    const renderDataTable = ({ rows, filterText, stateRows, setStateRowNull }) => {
        if (!dataTableHead || !dataTableBody) return;
        closeActiveFilterPopup();
        dataTableHead.innerHTML = ''; dataTableBody.innerHTML = '';
        const arr = Array.isArray(rows) ? rows : [];
        const header = Array.isArray(arr[0]) ? arr[0] : [];
        if (header.length === 0) return;
        const filter = String(filterText || '').trim().toUpperCase();
        const hasTextFilter = !!filter;
        const hasColFilters = hasAnyColumnFilter();
        const hasAnyFilter = hasTextFilter || !!externalFilter || hasColFilters;
        const idxDoc0 = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);

        if (!hasAnyFilter) {
            const headTr = document.createElement('tr');
            const thAct = document.createElement('th'); thAct.textContent = 'Action'; headTr.appendChild(thAct);
            const indexed = arr.slice(1).map((r, i) => ({ stateIndex: i + 1, row: r }));
            const alive = indexed.filter(x => Array.isArray(x.row) && x.row.length > 0);
            const rerender = () => renderDataTable({ rows, filterText, stateRows, setStateRowNull });
            header.forEach((h, i) => {
                const th = document.createElement('th');
                th.textContent = String(h == null ? '' : h);
                if (i === idxDoc0) th.classList.add('col-doc');
                renderHeaderCellWithFilter({
                    headerEl: dataTableHead,
                    colIdx: i,
                    th,
                    headerLabel: String(h == null ? '' : h),
                    sourceItems: alive,
                    rerender
                });
                headTr.appendChild(th);
            });
            dataTableHead.appendChild(headTr);
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = header.length + 1;
            td.className = 'same-cell';
            td.innerText = 'Nhập vào ô tìm kiếm hoặc dùng nút lọc ở tiêu đề để hiển thị data_ket_qua.';
            tr.appendChild(td);
            dataTableBody.appendChild(tr);
            if (remotePageInfo) setRemotePageInfo(remotePageInfo.current, remotePageInfo.total, remotePageInfo.hasMore);
            else {
                if (dataPageInfo) dataPageInfo.textContent = '1/1';
                if (btnDataPrev) btnDataPrev.disabled = true;
                if (btnDataNext) btnDataNext.disabled = true;
            }
            if (dataSummary) {
                const total = Math.max(0, arr.length - 1);
                dataSummary.textContent = `Tổng: ${total} | Đang lọc: 0`;
            }
            return;
        }
        const idxDoc = findHeaderIndex(header, [{ type: 'includes', value: 'SO TAI LIEU' }]);
        const idxPrOne = findHeaderIndex(header, [{ type: 'eq', value: 'PR ONE' }]);
        const idxPrSap = findHeaderIndex(header, [{ type: 'eq', value: 'PR SAP' }]);
        const idxNgay = findHeaderIndex(header, [{ type: 'includes', value: 'NGAY DUYET' }]);
        const idxMa = findHeaderIndex(header, [{ type: 'includes', value: 'MA SAN PHAM' }, { type: 'includes', value: 'MA VT' }, { type: 'eq', value: 'MA' }]);
        const idxStatus = findHeaderIndex(header, [{ type: 'includes', value: 'TRANG THAI' }, { type: 'includes', value: 'STATUS' }]);
        const headTr = document.createElement('tr');
        const thAct = document.createElement('th'); thAct.textContent = 'Action'; headTr.appendChild(thAct);
        dataTableHead.appendChild(headTr);
        const indexed = arr.slice(1).map((r, i) => ({ stateIndex: i + 1, row: r }));
        const alive = indexed.filter(x => Array.isArray(x.row) && x.row.length > 0);
        const rerender = () => renderDataTable({ rows, filterText, stateRows, setStateRowNull });
        header.forEach((h, i) => {
            const th = document.createElement('th');
            th.textContent = String(h == null ? '' : h);
            if (i === idxDoc) th.classList.add('col-doc');
            renderHeaderCellWithFilter({
                headerEl: dataTableHead,
                colIdx: i,
                th,
                headerLabel: String(h == null ? '' : h),
                sourceItems: alive,
                rerender
            });
            headTr.appendChild(th);
        });
        const extFiltered = (externalFilter && !filter) ? alive.filter(x => { try { return externalFilter(x.row, header); } catch (e) { return false; } }) : alive;
        const filterTokens = filter
            ? filter.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean)
            : [];
        const afterText = filterTokens.length > 0 ? alive.filter(x => {
            const r = x.row;
            const allCells = r.map(v => String(v == null ? '' : v)).join(' ').toUpperCase();
            return filterTokens.some(tok => allCells.includes(tok));
        }) : extFiltered;
        const filtered = applyColumnFilters(afterText);
        if (dataSummary) {
            const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
            const countDistinct = (idx, items) => {
                if (idx < 0) return 0;
                const s = new Set();
                for (const it of items) { const v = norm(it?.row?.[idx] || ''); if (v) s.add(v); }
                return s.size;
            };
            const countDistinctPrPair = (items) => {
                const s = new Set();
                for (const it of items) {
                    const a = idxPrOne >= 0 ? norm(it?.row?.[idxPrOne] || '') : '';
                    const b = idxPrSap >= 0 ? norm(it?.row?.[idxPrSap] || '') : '';
                    const key = `${a}||${b}`.replace(/\|+$/g, '');
                    if (key.replace(/\|/g, '').trim()) s.add(key);
                }
                return s.size;
            };
            let latest = '';
            let maxMs = -Infinity;
            if (idxNgay >= 0) {
                for (const it of filtered) {
                    const raw = String(it?.row?.[idxNgay] == null ? '' : it.row[idxNgay]).trim();
                    if (!raw) continue;
                    const ms = Date.parse(raw);
                    if (Number.isFinite(ms) && ms > maxMs) { maxMs = ms; latest = raw; }
                    if (!latest) latest = raw;
                }
            }
            const total = alive.length;
            const shown = filtered.length;
            const distinctDoc = countDistinct(idxDoc >= 0 ? idxDoc : 0, filtered);
            const distinctPrOne = countDistinct(idxPrOne, filtered);
            const distinctPrSap = countDistinct(idxPrSap, filtered);
            const distinctPrPair = countDistinctPrPair(filtered);
            const distinctMa = countDistinct(idxMa, filtered);
            const filterHint = hasColFilters ? ` | Lọc cột: ${columnFilters.size}` : '';
            dataSummary.textContent = `Tổng: ${total} | Đang lọc: ${shown} | Tài liệu: ${distinctDoc} | PR pair: ${distinctPrPair} | PR One: ${distinctPrOne} | PR SAP: ${distinctPrSap} | VT: ${distinctMa}${latest ? ` | Mới nhất: ${latest}` : ''}${filterHint}`;
        }
        const totalPages = Math.max(1, Math.ceil(filtered.length / Math.max(1, dataPageSize)));
        dataCurrentPage = Math.max(1, Math.min(totalPages, dataCurrentPage));
        if (remotePageInfo) setRemotePageInfo(remotePageInfo.current, remotePageInfo.total, remotePageInfo.hasMore);
        else {
            if (dataPageInfo) dataPageInfo.textContent = `${dataCurrentPage}/${totalPages}`;
            if (btnDataPrev) btnDataPrev.disabled = dataCurrentPage <= 1;
            if (btnDataNext) btnDataNext.disabled = dataCurrentPage >= totalPages;
        }
        const start = (dataCurrentPage - 1) * dataPageSize;
        const limited = filtered.slice(start, start + dataPageSize);
        if (limited.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = header.length + 1;
            td.className = 'same-cell';
            td.innerText = emptyHint ? String(emptyHint) : 'Không có dữ liệu.';
            tr.appendChild(td);
            dataTableBody.appendChild(tr);
            return;
        }
        for (const item of limited) {
            const r0 = item.row; const tr = document.createElement('tr'); tr.dataset.rowIndex = String(item.stateIndex);
            const tdAct = document.createElement('td');
            const del = document.createElement('button'); del.type = 'button'; del.className = 'btn-mini btn-gray'; del.textContent = 'DEL';
            del.addEventListener('click', () => { const idxRaw = tr?.dataset?.rowIndex || ''; if (idxRaw && /^\d+$/.test(idxRaw)) setStateRowNull(Number(idxRaw)); tr.remove(); });
            tdAct.appendChild(del); tr.appendChild(tdAct);
            const normStatus = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
            const isCancel = (value) => {
                const v = normStatus(value).toUpperCase();
                return v.includes('HUY') || v.includes('HỦY');
            };
            const isApproved = (value) => {
                const v = normStatus(value).toUpperCase();
                return v.includes('DUYET') || v.includes('DUYỆT');
            };
            for (let i = 0; i < header.length; i += 1) {
                const td = document.createElement('td');
                if (i === idxDoc) {
                    td.classList.add('col-doc');
                    td.contentEditable = 'true';
                    td.innerText = r0[i] == null ? '' : String(r0[i]);
                    td.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            const ok = insertTextAtCaret('\n');
                            if (!ok) td.innerText = `${td.innerText}\n`;
                            try { if (Array.isArray(stateRows?.[item.stateIndex])) stateRows[item.stateIndex][i] = String(td.innerText); } catch (err) {}
                        }
                    });
                } else if (i === idxStatus) {
                    const current = normStatus(r0[i] == null ? '' : r0[i]) || 'ĐÃ DUYỆT';
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-mini btn-status';
                    btn.textContent = current;
                    if (isCancel(current)) btn.classList.add('btn-status-cancel');
                    else if (isApproved(current)) btn.classList.add('btn-status-ok');
                    btn.addEventListener('click', () => {
                        const next = isCancel(btn.textContent) ? 'ĐÃ DUYỆT' : 'ĐÃ HỦY';
                        btn.textContent = next;
                        btn.classList.remove('btn-status-cancel', 'btn-status-ok');
                        if (isCancel(next)) btn.classList.add('btn-status-cancel');
                        else if (isApproved(next)) btn.classList.add('btn-status-ok');
                        try { if (Array.isArray(stateRows?.[item.stateIndex])) stateRows[item.stateIndex][i] = next; } catch (e) {}
                    });
                    td.appendChild(btn);
                    td.contentEditable = 'false';
                    td.classList.add('same-cell');
                } else {
                    td.contentEditable = 'true';
                    td.innerText = r0[i] == null ? '' : String(r0[i]);
                }
                tr.appendChild(td);
            }
            dataTableBody.appendChild(tr);
        }
    };

    return { setPageSize, setPage, getState, setExternalFilter, syncVisibleDataTableToState, renderDataTable, clearAllColumnFilters, hasAnyColumnFilter, setOnColumnFiltersChanged, setRemotePageInfo };
};
