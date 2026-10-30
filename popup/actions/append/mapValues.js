import { DATA_KET_QUA_IDX } from '../../db/constants.js';

export const mapValuesToRowByHeader = (headerRow, values) => {
    const header = Array.isArray(headerRow) ? headerRow : [];
    const row = Array.from({ length: header.length }, () => '');
    const setAt = (idx, val) => { if (idx < 0 || idx >= row.length) return; row[idx] = val == null ? '' : String(val); };
    
    setAt(DATA_KET_QUA_IDX.DOC, values.doc);
    setAt(DATA_KET_QUA_IDX.PR_ONE, values.prOne);
    setAt(DATA_KET_QUA_IDX.PR_SAP, values.prSap);
    setAt(DATA_KET_QUA_IDX.NGAY_DUYET, values.ngayDuyet);
    setAt(DATA_KET_QUA_IDX.PR_TYPE, values.prType);
    setAt(DATA_KET_QUA_IDX.MA_VT, values.ma);
    setAt(DATA_KET_QUA_IDX.TEN_VT, values.ten);
    setAt(DATA_KET_QUA_IDX.DVT, values.dv);
    setAt(DATA_KET_QUA_IDX.SL, values.sl);
    setAt(DATA_KET_QUA_IDX.STATUS, values.status);
    setAt(DATA_KET_QUA_IDX.GHI_CHU, values.ghiChu);
    setAt(DATA_KET_QUA_IDX.STT_EXCEL, values.sttExcel);
    setAt(DATA_KET_QUA_IDX.STT_WEB, values.sttWeb);
    
    return row;
};
