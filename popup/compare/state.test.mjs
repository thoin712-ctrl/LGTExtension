import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompareSourceRows } from './state.js';

test('uses web rows when no right Excel file is selected', () => {
    const webRows = [{ ma: 'M1', ten: 'Web item' }];
    assert.deepEqual(resolveCompareSourceRows({ leftRows: [], webRows, rightExcelRows: [] }), webRows);
});

test('uses right Excel rows when a right Excel file is selected', () => {
    const webRows = [{ ma: 'M1', ten: 'Web item' }];
    const rightExcelRows = [{ ma: 'M2', ten: 'Right Excel item' }];
    assert.deepEqual(resolveCompareSourceRows({ leftRows: [], webRows, rightExcelRows }), rightExcelRows);
});
