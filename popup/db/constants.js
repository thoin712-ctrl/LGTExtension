export const DATA_KET_QUA_CANONICAL_HEADER = ['Số tài liệu', 'PR One', 'PR SAP', 'Ngày duyệt', 'Loại PR', 'Mã VT', 'Tên VT', 'ĐVT', 'Số lượng', 'Trạng thái', 'Ghi chú', 'STT Excel', 'STT Web'];

export const DATA_KET_QUA_IDX = {
    DOC: 0,
    PR_ONE: 1,
    PR_SAP: 2,
    NGAY_DUYET: 3,
    PR_TYPE: 4,
    MA_VT: 5,
    TEN_VT: 6,
    DVT: 7,
    SL: 8,
    STATUS: 9,
    GHI_CHU: 10,
    STT_EXCEL: 11,
    STT_WEB: 12
};

export const WEB_EXTRACT_IDX = {
    PR_SAP: 1,
    MA: 3,
    TEN: 4,
    SL: 5,
    SL_BOUGHT: 6,
    DV: 6
};

export const EXCEL_PARSE_IDX = {
    DOC: 0,
    MA: 1,
    TEN: 2,
    DV: 3,
    SL: 4,
    GHI_CHU: 5
};

export const COMPARE_TABLE_IDX = {
    LEFT_STT: 0,
    LEFT_DOC: 1,
    LEFT_MA: 2,
    LEFT_TEN: 3,
    LEFT_DV: 4,
    LEFT_SL: 5,
    RIGHT_START: 6,
    RIGHT_STT: 6,
    RIGHT_DOC: 7,
    RIGHT_MA: 8,
    RIGHT_TEN: 9,
    RIGHT_DV: 10,
    RIGHT_SL: 11,
    RIGHT_GHI_CHU: 12,
    RIGHT_CHECK: 13,
    TOTAL_COLS: 14
};

export const DATA_KET_QUA_DB_NAME = 'logistics_tool_db';
export const DATA_KET_QUA_DB_VERSION = 4;
export const DATA_KET_QUA_STORE = 'data_ket_qua_rows';
export const DATA_KET_QUA_META = 'data_ket_qua_meta';
export const HISTORY_STORE = 'history_items';
export const HISTORY_MAX_ITEMS = 200;
export const EXCEL_DATA_STORE = 'excel_data_rows';
export const ACTIVITY_LOG_STORE = 'activity_log_items';
export const ACTIVITY_LOG_MAX_ITEMS = 1500;

export const FIREBASE_CONFIG = {
    databaseURL: 'https://round-essence-496312-v7-default-rtdb.asia-southeast1.firebasedatabase.app/', // e.g., 'https://your-project-id.firebaseio.com'
    apiKey: '',
    syncEnabled: true
};
