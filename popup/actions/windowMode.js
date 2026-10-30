export const ensureWindowMode = async ({ isWindowMode, params }) => {
    try {
        if (isWindowMode) return { ok: true, closed: false };
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabIdParam = activeTab?.id != null ? `&tabId=${encodeURIComponent(activeTab.id)}` : '';
        const currentWindow = await chrome.windows.getCurrent();
        const width = 1100, height = 740;
        const left = Math.max(0, Math.round((currentWindow.left || 0) + ((currentWindow.width || width) - width) / 2));
        const top = Math.max(0, Math.round((currentWindow.top || 0) + ((currentWindow.height || height) - height) / 2));
        await chrome.windows.create({ url: chrome.runtime.getURL(`popup.html?window=1${tabIdParam}`), type: 'popup', width, height, left, top });
        window.close();
        return { ok: true, closed: true };
    } catch (e) { return { ok: false, closed: false }; }
};
