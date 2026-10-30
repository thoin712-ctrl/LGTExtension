import { FIREBASE_CONFIG } from '../popup/db/constants.js';

const TARGET_ORIGIN = 'https://one.vasgroup.vn';
const TARGET_PATH = '/app17/requests/edit';

const APPROVAL_DB_NAME = 'qt_approvals_db';
const APPROVAL_DB_VERSION = 1;
const APPROVAL_STORE = 'approve_history';

const openApprovalsDb = () => new Promise((resolve, reject) => {
  try {
    const req = indexedDB.open(APPROVAL_DB_NAME, APPROVAL_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(APPROVAL_STORE)) {
        const store = db.createObjectStore(APPROVAL_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('code', 'code', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('open db failed'));
  } catch (e) { reject(e); }
});

const saveApprovalToIndexedDb = async ({ code, url, ts }) => {
  const db = await openApprovalsDb();
  return await new Promise((resolve) => {
    const tx = db.transaction(APPROVAL_STORE, 'readwrite');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.objectStore(APPROVAL_STORE).add({ code, url, ts, ngayDuyet: new Date(ts).toISOString() });
  });
};

const sanitizeFirebaseKey = (key) => String(key || '').replace(/[.#$\[\]]/g, '_');

const buildFirebaseUrl = (path) => {
  const base = String(FIREBASE_CONFIG.databaseURL || '').trim();
  if (!base) return '';
  const qs = new URLSearchParams();
  if (FIREBASE_CONFIG.apiKey) qs.set('auth', FIREBASE_CONFIG.apiKey);
  return `${base.replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}.json?${qs.toString()}`;
};

const saveApprovalToFirebase = async ({ code, url, ts }) => {
  if (!FIREBASE_CONFIG.syncEnabled) return false;
  const historyUrl = buildFirebaseUrl('history_web');
  const latestUrl = buildFirebaseUrl(`history_web_latest/${sanitizeFirebaseKey(code)}`);
  if (!historyUrl || !latestUrl) return false;
  const payload = { code, url, ts, ngayDuyet: new Date(ts).toISOString() };
  try { await fetch(historyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) {}
  try { await fetch(latestUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) {}
  return true;
};

const recentApprovalTsByCode = new Map();
const shouldDedupApproval = ({ code, ts }) => {
  const prev = recentApprovalTsByCode.get(code) || 0;
  if (ts - prev < 1500) return true;
  recentApprovalTsByCode.set(code, ts);
  return false;
};

const shouldInject = (urlString) => {
  try {
    const u = new URL(urlString);
    if (u.origin !== TARGET_ORIGIN) return false;
    if (u.pathname !== TARGET_PATH) return false;
    return u.searchParams.has('code') && String(u.searchParams.get('code') || '').trim() !== '';
  } catch (e) {
    return false;
  }
};

const injectContentScript = async (tabId) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/one-requests-panel.js']
    });
  } catch (e) {}
};

const openExtensionPopup = async (tab) => {
  try {
    console.log('[qt_debug] openExtensionPopup', { tab });
    const tabIdParam = tab?.id != null ? `&tabId=${encodeURIComponent(tab.id)}` : '';
    const popupUrl = chrome.runtime.getURL(`popup.html?window=1${tabIdParam}`);
    console.log('[qt_debug] popup url', popupUrl);
    const win = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      focused: true,
      width: 460,
      height: 760
    });
    console.log('[qt_debug] popup opened', { windowId: win?.id });
    return { ok: true, via: 'window', windowId: win?.id };
  } catch (e) {
    console.error('[qt_debug] openExtensionPopup error', e);
    return { ok: false, error: String(e?.message || e) };
  }
};

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await openExtensionPopup(tab);
  } catch (e) {
    console.error('Failed to open popup on action click:', e);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab?.url) return;
  if (!shouldInject(tab.url)) return;
  injectContentScript(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) return;
    if (!shouldInject(tab.url)) return;
    await injectContentScript(tabId);
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'qt_open_popup') {
    (async () => {
      const respond = (payload) => { try { sendResponse?.(payload); } catch (e) {} };
      try {
        const result = await openExtensionPopup(sender?.tab);
        respond(result);
      } catch (e) {
        respond({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
  if (msg.type === 'qt_mark_approved') {
    (async () => {
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      const code = String(payload.code || '').trim();
      const url = String(payload.url || '').trim();
      const ts = Date.now();
      if (!code) { sendResponse?.({ ok: false }); return; }
      if (shouldDedupApproval({ code, ts })) { sendResponse?.({ ok: true, dedup: true }); return; }
      const okLocal = await saveApprovalToIndexedDb({ code, url, ts });
      const okRemote = await saveApprovalToFirebase({ code, url, ts });
      sendResponse?.({ ok: true, local: okLocal, firebase: okRemote });
    })();
    return true;
  }
});
