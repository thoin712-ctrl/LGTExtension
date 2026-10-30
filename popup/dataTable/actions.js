import { fetchDataKetQuaPage, fetchDataKetQuaRowsByDoc, searchDataKetQuaOnFirebase, updateDataKetQuaRowsOnFirebase } from '../services/firebase.js';
import { DATA_KET_QUA_CANONICAL_HEADER } from '../db/constants.js';
import { normalizeDupValue } from '../utils/text.js';
import { downloadCurrentCsv } from '../data/downloadCsv.js';
import { setStatus } from '../ui/status.js';

export const createDataTableActions = ({ renderer, status, setMessage, dataSearchInput, btnDataClearFilters }) => {
    let lastLoadedDataRows = [];
    let firebaseKeys = [];
    let originalRowsByKey = new Map();
    let remotePage = 1;
    let remotePageSize = 250;
    let remoteTotalRows = 0;
    let remoteHasMore = false;
    let pageStartKeys = [1];
    let searchResults = null;
    let activeSearchQuery = '';
    let isSearchMode = false;
    let searchRequestId = 0;
    let searchTimer = null;
    const setStateRowNull = (stateIndex) => { if (stateIndex >= 1 && stateIndex < lastLoadedDataRows.length) lastLoadedDataRows[stateIndex] = null; };
    const updateClearFiltersBtn = () => {
        if (!btnDataClearFilters) return;
        if (typeof renderer.clearAllColumnFilters !== 'function') { btnDataClearFilters.disabled = true; return; }
        const has = typeof renderer.hasAnyColumnFilter === 'function' ? renderer.hasAnyColumnFilter() : false;
        btnDataClearFilters.disabled = !has;
    };
    const render = () => { renderer.renderDataTable({ rows: lastLoadedDataRows, filterText: dataSearchInput?.value || '', stateRows: lastLoadedDataRows, setStateRowNull }); updateClearFiltersBtn(); };

    const onClearFilters = () => {
        renderer.syncVisibleDataTableToState(lastLoadedDataRows);
        if (typeof renderer.clearAllColumnFilters === 'function') renderer.clearAllColumnFilters();
        if (typeof renderer.setPage === 'function') renderer.setPage(1);
        render();
    };
    if (typeof renderer.setOnColumnFiltersChanged === 'function') {
        renderer.setOnColumnFiltersChanged(() => updateClearFiltersBtn());
    }
    if (btnDataClearFilters) {
        btnDataClearFilters.addEventListener('click', onClearFilters);
        updateClearFiltersBtn();
    }

    const syncPager = () => {
        const totalPages = Math.max(remotePage, Math.ceil(remoteTotalRows / remotePageSize), 1);
        renderer.setRemotePageInfo(remotePage, totalPages, remoteHasMore);
    };

    const captureOriginalRows = (rows, keys) => {
        originalRowsByKey = new Map();
        keys.forEach((key, index) => {
            const row = rows[index + 1];
            originalRowsByKey.set(key, Array.isArray(row) ? [...row] : null);
        });
    };

    const loadDataTableFromDb = async (page = remotePage) => {
        const query = String(dataSearchInput?.value || '').trim();
        if (query) {
            activeSearchQuery = query;
            searchRequestId += 1;
            if (searchTimer) clearTimeout(searchTimer);
            setStatus(status, 'Đang tìm trong toàn bộ data_ket_qua trên Firebase...', 'warn');
            await runFirebaseSearch(query, searchRequestId);
            return;
        }
        searchRequestId += 1;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = null;
        searchResults = null;
        isSearchMode = false;
        try {
            const startKey = pageStartKeys[page] || 1;
            const result = await fetchDataKetQuaPage({ page, pageSize: remotePageSize, startKey });
            lastLoadedDataRows = result.rows;
            firebaseKeys = result.keys;
            captureOriginalRows(lastLoadedDataRows, firebaseKeys);
            remotePage = result.page;
            remoteTotalRows = result.totalRows;
            remoteHasMore = result.hasMore;
            pageStartKeys[page + 1] = result.nextStartKey;
            renderer.setPageSize(Math.max(1, result.pageSize));
            renderer.setPage(1);
            render();
            syncPager();
            setStatus(status, remoteTotalRows > 0 ? `Đã tải ${firebaseKeys.length}/${remoteTotalRows} dòng từ Firebase (trang ${remotePage}).` : 'Chưa có data_ket_qua trên Firebase.', remoteTotalRows > 0 ? 'ok' : 'warn');
        } catch (error) {
            setStatus(status, `Không tải được data_ket_qua từ Firebase: ${error?.message || error}`, 'err');
        }
    };

    const saveDataTableToCsv = async () => {
        renderer.syncVisibleDataTableToState(lastLoadedDataRows);
        const updates = {};
        firebaseKeys.forEach((key, index) => {
            const row = lastLoadedDataRows[index + 1];
            const originalRow = originalRowsByKey.get(key);
            const nextRow = Array.isArray(row) ? row : null;
            if (JSON.stringify(nextRow) !== JSON.stringify(originalRow)) {
                updates[key] = nextRow;
            }
        });
        if (Object.keys(updates).length === 0) {
            setStatus(status, 'Không có dòng nào thay đổi.', 'warn');
            return;
        }
        try {
            await updateDataKetQuaRowsOnFirebase(updates);
        } catch (error) {
            setStatus(status, `Không thể lưu data_ket_qua lên Firebase: ${error?.message || error}`, 'err');
            return;
        }
        for (const [key, row] of Object.entries(updates)) {
            if (Array.isArray(row)) originalRowsByKey.set(key, [...row]);
            else originalRowsByKey.set(key, null);
        }
        setStatus(status, `Đã cập nhật ${Object.keys(updates).length} dòng thay đổi trên Firebase.`, 'ok');
        if (isSearchMode && activeSearchQuery) {
            searchTimer = setTimeout(() => runFirebaseSearch(activeSearchQuery, ++searchRequestId), 0);
        }
    };

    const exportDataKetQua = async () => {
        const downloaded = await downloadCurrentCsv();
        setStatus(status, downloaded.ok ? 'Đã xuất file: Downloads/extension/data_ket_qua.csv' : 'Không thể xuất file.', downloaded.ok ? 'ok' : 'err');
        if (!downloaded.ok && downloaded.error) setMessage(downloaded.error);
    };

    const displaySearchPage = (page) => {
        if (!Array.isArray(searchResults)) return;
        const totalPages = Math.max(1, Math.ceil(searchResults.length / remotePageSize));
        remotePage = Math.min(Math.max(1, page), totalPages);
        const start = (remotePage - 1) * remotePageSize;
        const pageRecords = searchResults.slice(start, start + remotePageSize);
        lastLoadedDataRows = [DATA_KET_QUA_CANONICAL_HEADER, ...pageRecords.map(record => record.row)];
        firebaseKeys = pageRecords.map(record => record.key);
        captureOriginalRows(lastLoadedDataRows, firebaseKeys);
        remoteTotalRows = searchResults.length;
        remoteHasMore = remotePage < totalPages;
        pageStartKeys = [1];
        renderer.setPageSize(remotePageSize);
        renderer.setPage(1);
        render();
        syncPager();
    };

    const runFirebaseSearch = async (query, requestId) => {
        try {
            const records = await searchDataKetQuaOnFirebase(query);
            if (requestId !== searchRequestId) return;
            searchResults = records;
            isSearchMode = true;
            displaySearchPage(1);
            setStatus(status, `Tìm thấy ${records.length} dòng trên Firebase.`, records.length > 0 ? 'ok' : 'warn');
        } catch (error) {
            if (requestId !== searchRequestId) return;
            setStatus(status, `Không tìm được data_ket_qua trên Firebase: ${error?.message || error}`, 'err');
        }
    };

    const onSearchInput = () => {
        renderer.syncVisibleDataTableToState(lastLoadedDataRows);
        renderer.setPage(1);
        const query = String(dataSearchInput?.value || '').trim();
        if (query === activeSearchQuery && (query ? isSearchMode : !isSearchMode)) {
            render();
            syncPager();
            return;
        }
        activeSearchQuery = query;
        searchRequestId += 1;
        const requestId = searchRequestId;
        if (searchTimer) clearTimeout(searchTimer);
        if (!query) {
            searchResults = null;
            isSearchMode = false;
            loadDataTableFromDb(1);
            return;
        }
        setStatus(status, 'Đang tìm trong toàn bộ data_ket_qua trên Firebase...', 'warn');
        searchTimer = setTimeout(() => runFirebaseSearch(query, requestId), 350);
    };
    const onPageSizeChange = async (raw) => {
        renderer.syncVisibleDataTableToState(lastLoadedDataRows);
        const n = Number(raw);
        remotePageSize = Number.isFinite(n) && n > 0 ? Math.min(1000, n) : 250;
        if (isSearchMode) {
            displaySearchPage(1);
            return;
        }
        remotePage = 1;
        pageStartKeys = [1];
        await loadDataTableFromDb(remotePage);
    };
    const onPrev = async () => {
        if (remotePage <= 1) return;
        if (isSearchMode) { displaySearchPage(remotePage - 1); return; }
        await loadDataTableFromDb(remotePage - 1);
    };
    const onNext = async () => {
        if (!remoteHasMore) return;
        if (isSearchMode) { displaySearchPage(remotePage + 1); return; }
        await loadDataTableFromDb(remotePage + 1);
    };

    const loadRowsByDocMaPairs = async (pairs) => {
        const validPairs = Array.isArray(pairs) ? pairs.filter(pair => pair && pair.doc && pair.ma) : [];
        const docs = Array.from(new Set(validPairs.map(pair => String(pair.doc).trim())));
        const wanted = new Set(validPairs.map(pair => `${normalizeDupValue(pair.doc)}||${normalizeDupValue(pair.ma)}`));
        const records = [];
        for (let i = 0; i < docs.length; i += 8) {
            const batches = await Promise.all(docs.slice(i, i + 8).map(doc => fetchDataKetQuaRowsByDoc(doc)));
            for (const batch of batches) {
                for (const record of batch) {
                    const key = `${normalizeDupValue(record.row[0])}||${normalizeDupValue(record.row[5])}`;
                    if (wanted.has(key)) records.push(record);
                }
            }
        }
        lastLoadedDataRows = [DATA_KET_QUA_CANONICAL_HEADER, ...records.map(record => record.row)];
        firebaseKeys = records.map(record => record.key);
        captureOriginalRows(lastLoadedDataRows, firebaseKeys);
        remotePage = 1;
        remoteTotalRows = records.length;
        remoteHasMore = false;
        pageStartKeys = [1];
        remotePageSize = Math.max(1, records.length);
        renderer.setPageSize(remotePageSize);
        renderer.setPage(1);
        render();
        syncPager();
    };

    const setRowsAndRerender = (rows) => { lastLoadedDataRows = rows; renderer.setPage(1); render(); syncPager(); };
    const getRows = () => lastLoadedDataRows;

    return { loadDataTableFromDb, saveDataTableToCsv, exportDataKetQua, onSearchInput, onPageSizeChange, onPrev, onNext, loadRowsByDocMaPairs, setRowsAndRerender, getRows };
};
