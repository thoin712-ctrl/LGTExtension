import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DATA_KET_QUA_CANONICAL_HEADER } from '../db/constants.js';
import { createDataTableActions } from '../dataTable/actions.js';
import {
    fetchDataKetQuaPage,
    overwriteDataKetQuaRowsOnFirebase,
    searchDataKetQuaOnFirebase
} from './firebase.js';

const firebaseFields = DATA_KET_QUA_CANONICAL_HEADER.map(label =>
    label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase()
);

const createFirebaseRecord = (doc) => Object.fromEntries([
    [firebaseFields[0], doc],
    [firebaseFields[5], 'ITEM-1'],
    [firebaseFields[7], 'EA'],
    [firebaseFields[8], '1']
]);

test('loads only the requested Firebase page', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url) => {
        requests.push(String(url));
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith('/data_ket_qua_version.json')) {
            return { ok: true, async json() { return { version: 4, nextKey: 1001, count: 1000 }; } };
        }
        if (parsed.searchParams.has('limitToFirst')) {
            return {
                ok: true,
                async json() {
                    return { '1': createFirebaseRecord('DOC-1'), '2': createFirebaseRecord('DOC-2') };
                }
            };
        }
        throw new Error(`Unexpected Firebase read: ${url}`);
    };

    try {
        const page = await fetchDataKetQuaPage({ page: 1, pageSize: 2, startKey: 1 });
        assert.equal(page.totalRows, 1000);
        assert.deepEqual(page.keys, ['1', '2']);
        assert.equal(page.nextStartKey, 3);
        assert.equal(page.hasMore, true);
        assert.deepEqual(page.rows[0], DATA_KET_QUA_CANONICAL_HEADER);
        assert.equal(requests.length, 2);
        assert.ok(requests[1].includes('limitToFirst=2'));
        assert.ok(!requests.some(url => url.endsWith('/data_ket_qua.json')));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('searches all Firebase rows for substring matches and reuses the versioned cache', async () => {
    const originalFetch = globalThis.fetch;
    let dataReads = 0;
    const rows = {
        '0': {},
        '1': createFirebaseRecord('DOC-ONE'),
        '2': { ...createFirebaseRecord('DOC-TWO'), [firebaseFields[5]]: 'ITEM-2' }
    };
    globalThis.fetch = async (url) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith('/data_ket_qua_version.json')) {
            return { ok: true, async json() { return { version: 8 }; } };
        }
        if (parsed.pathname.endsWith('/data_ket_qua.json') && !parsed.searchParams.has('orderBy')) {
            dataReads += 1;
            return { ok: true, async json() { return rows; } };
        }
        throw new Error(`Unexpected Firebase read: ${url}`);
    };

    try {
        const itemMatches = await searchDataKetQuaOnFirebase('item-2');
        assert.deepEqual(itemMatches.map(record => record.key), ['2']);
        const docMatches = await searchDataKetQuaOnFirebase('DOC-ONE');
        assert.deepEqual(docMatches.map(record => record.key), ['1']);
        assert.equal(dataReads, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('saves only changed data table rows to Firebase', async () => {
    const originalFetch = globalThis.fetch;
    const patches = [];
    globalThis.fetch = async (url, options = {}) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith('/data_ket_qua_version.json')) {
            return { ok: true, async json() { return { version: 12, nextKey: 3, count: 2 }; } };
        }
        if (parsed.pathname.endsWith('/data_ket_qua.json') && parsed.searchParams.has('limitToFirst')) {
            return {
                ok: true,
                async json() {
                    return { '1': createFirebaseRecord('DOC-1'), '2': createFirebaseRecord('DOC-2') };
                }
            };
        }
        if (options.method === 'PATCH') {
            patches.push(JSON.parse(options.body));
            return { ok: true, async json() { return null; } };
        }
        throw new Error(`Unexpected Firebase request: ${options.method || 'GET'} ${url}`);
    };

    const renderer = {
        renderDataTable() {},
        setPageSize() {},
        setPage() {},
        setRemotePageInfo() {},
        syncVisibleDataTableToState() {}
    };
    const status = { dataset: {} };
    const actions = createDataTableActions({ renderer, status, dataSearchInput: null });
    try {
        await actions.loadDataTableFromDb(1);
        actions.getRows()[1][5] = 'ITEM-EDITED';
        await actions.saveDataTableToCsv();

        assert.equal(patches.length, 1);
        assert.ok(patches[0]['data_ket_qua/1']);
        assert.equal(patches[0]['data_ket_qua/1'][firebaseFields[5]], 'ITEM-EDITED');
        assert.ok(!Object.hasOwn(patches[0], 'data_ket_qua/2'));
        assert.equal(status.innerText, 'Đã cập nhật 1 dòng thay đổi trên Firebase.');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('overwrites matching records with one incremental Firebase patch', async () => {
    const originalFetch = globalThis.fetch;
    let patchBody = null;
    globalThis.fetch = async (url, options = {}) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith('/data_ket_qua_version.json')) {
            return { ok: true, async json() { return { version: 4, nextKey: 5, count: 4 }; } };
        }
        if (parsed.pathname.endsWith('/data_ket_qua.json') && parsed.searchParams.has('equalTo')) {
            return { ok: true, async json() { return { '3': createFirebaseRecord('DOC-OVERWRITE-TEST') }; } };
        }
        if (options.method === 'PATCH') {
            patchBody = JSON.parse(options.body);
            return { ok: true, async json() { return null; } };
        }
        throw new Error(`Unexpected Firebase request: ${options.method || 'GET'} ${url}`);
    };

    try {
        await overwriteDataKetQuaRowsOnFirebase(
            [['DOC-OVERWRITE-TEST', '', '', '', '', 'ITEM-1', '', 'EA', '1', 'OK', '']],
            ['DOC-OVERWRITE-TEST||ITEM-1||EA||1'],
            ['DOC-OVERWRITE-TEST']
        );
        assert.equal(patchBody['data_ket_qua/3'], null);
        assert.ok(patchBody['data_ket_qua/5']);
        assert.equal(patchBody['data_ket_qua_version/count'], 4);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
