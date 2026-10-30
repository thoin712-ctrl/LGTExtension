export const createTabService = () => {
    const params = new URLSearchParams(window.location.search);
    const fixedTabIdRaw = params.get('tabId');
    const fixedTabId = fixedTabIdRaw && /^\d+$/.test(fixedTabIdRaw) ? Number(fixedTabIdRaw) : null;
    const isWindowMode = params.get('window') === '1';
    const getActiveTab = async () => {
        if (fixedTabId != null) {
            console.log('[qt_debug] getActiveTab using fixedTabId', fixedTabId);
            try {
                const tab = await chrome.tabs.get(fixedTabId);
                console.log('[qt_debug] getActiveTab found fixedTabId tab', tab);
                return tab || null;
            } catch (e) {
                console.error('[qt_debug] getActiveTab fixedTabId failed', e, { fixedTabId });
            }
        }
        try {
            const tabs = await chrome.tabs.query({});
            console.log('[qt_debug] getActiveTab query all tabs', { count: tabs.length });
            const target = tabs.find((t) => {
                if (!t || typeof t.url !== 'string') return false;
                return t.url.includes('one.vasgroup.vn/app17/requests/edit');
            });
            if (target) {
                console.log('[qt_debug] getActiveTab found matching URL tab', target);
                return target;
            }
        } catch (e) {
            console.error('[qt_debug] getActiveTab query all tabs failed', e);
        }
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('[qt_debug] getActiveTab active tab fallback', { tab });
            return tab || null;
        } catch (e) {
            console.error('[qt_debug] getActiveTab active tab fallback failed', e);
            return null;
        }
    };
    console.log('[qt_debug] createTabService', { fixedTabId, isWindowMode, search: window.location.search });
    return { params, fixedTabId, isWindowMode, getActiveTab };
};
