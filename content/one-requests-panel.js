(() => {
  const TARGET_ORIGIN = 'https://one.vasgroup.vn';
  const TARGET_PATH = '/app17/requests/edit';

  const matchesTargetUrl = () => {
    try {
      const u = new URL(location.href);
      if (u.origin !== TARGET_ORIGIN) return false;
      if (u.pathname !== TARGET_PATH) return false;
      return true;
    } catch (e) {
      return false;
    }
  };

  const getCodeFromUrl = () => {
    try {
      const u = new URL(location.href);
      if (u.origin !== TARGET_ORIGIN) return '';
      if (u.pathname !== TARGET_PATH) return '';
      return String(u.searchParams.get('code') || '').trim();
    } catch (e) {
      return '';
    }
  };

  const getCodeFromDom = () => {
    try {
      const el = document.querySelector('span.fz-13');
      const t = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
      return t;
    } catch (e) {
      return '';
    }
  };

  let code = getCodeFromDom() || getCodeFromUrl();
  if (!code) return;

  const MODAL_ID = 'qt-one-modal-root';

  const ensureStyle = () => {
    const id = 'qt-one-panel-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
#${MODAL_ID}{position:fixed;inset:0;z-index:2147483647;display:none}
#${MODAL_ID}[data-open="1"]{display:block}
#${MODAL_ID} .qt-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45)}
#${MODAL_ID} .qt-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 28px));background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,.12);box-shadow:0 24px 90px rgba(0,0,0,.45);padding:12px}
#${MODAL_ID} .qt-modal h3{margin:0 0 8px 0;font-size:14px}
#${MODAL_ID} .qt-modal p{margin:0 0 12px 0;font-size:13px;color:#111;opacity:.9}
#${MODAL_ID} .qt-modal .qt-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
#${MODAL_ID} .qt-modal .qt-btn{border-radius:10px;padding:8px 10px;font-weight:900;font-size:12px;cursor:pointer;border:1px solid rgba(0,0,0,.12)}
#${MODAL_ID} .qt-modal .qt-btn.ok{background:#16a34a;color:#fff;border-color:#16a34a}
#${MODAL_ID} .qt-modal .qt-btn.no{background:#fff;color:#111}
`;
    document.documentElement.appendChild(style);
  };

  const ensureModal = () => {
    if (document.getElementById(MODAL_ID)) return;
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.innerHTML = `
      <div class="qt-backdrop" data-qt-close></div>
      <div class="qt-modal" role="dialog" aria-modal="true">
        <h3>Bạn đã duyệt trên tool chưa?</h3>
        <p>PR: <strong data-qt-pr>${escapeHtml(code)}</strong></p>
        <div class="qt-actions">
          <button type="button" class="qt-btn no" data-qt-notyet>CHƯA DUYỆT</button>
          <button type="button" class="qt-btn ok" data-qt-approved>ĐÃ DUYỆT</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const modal = root.querySelector('.qt-modal');
    if (modal) {
      modal.addEventListener('mousedown', (ev) => { ev.stopPropagation(); }, true);
    }
    root.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-qt-close]')) {
        ev.stopPropagation();
        closeModal();
      }
      if (ev.target.closest('[data-qt-notyet]')) {
        ev.stopPropagation();
        pendingClick = null;
        openToolPopup();
        closeModal();
        return;
      }
      if (ev.target.closest('[data-qt-approved]')) {
        ev.stopPropagation();
        const fn = pendingClick;
        pendingClick = null;
        const send = () => new Promise((resolve) => {
          try { chrome.runtime.sendMessage({ type: 'qt_mark_approved', payload: { code, url: location.href } }, () => resolve(true)); } catch (e) { resolve(false); }
        });
        (async () => {
          try { await Promise.race([send(), new Promise(r => setTimeout(r, 800))]); } catch (e) {}
          closeModal();
          if (fn && typeof fn === 'function') fn();
        })();
      }
    });
  };

  const updateModalCode = () => {
    const root = document.getElementById(MODAL_ID);
    if (!root) return;
    const prEl = root.querySelector('[data-qt-pr]');
    if (!prEl) return;
    prEl.textContent = code;
  };

  const openModal = () => {
    ensureModal();
    const el = document.getElementById(MODAL_ID);
    if (el) el.dataset.open = '1';
    updateModalCode();
  };

  const closeModal = () => {
    const el = document.getElementById(MODAL_ID);
    if (el) el.dataset.open = '0';
  };

  const openToolPopup = () => {
    try {
      chrome.runtime.sendMessage({ type: 'qt_open_popup' });
      return true;
    } catch (e) {
      return false;
    }
  };

  const cleanup = () => {
    try { document.getElementById(MODAL_ID)?.remove(); } catch (e) {}
  };

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let pendingClick = null;
  let allowNextMenuClick = false;
  let lastBlockedMenuItemText = '';

  const matchesSecondMenuItem = (li) => {
    const text = (li?.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    if (text.includes('Chuyển phê duyệt')) return true;
    return false;
  };

  const clickMenuItemNode = (node) => {
    if (!node) return false;
    allowNextMenuClick = true;
    const clickTarget = node.querySelector?.('.ant-dropdown-menu-title-content') || node;
    const rect = node.getBoundingClientRect?.();
    const clientX = rect ? Math.round(rect.left + Math.min(rect.width - 2, Math.max(2, rect.width / 2))) : 1;
    const clientY = rect ? Math.round(rect.top + Math.min(rect.height - 2, Math.max(2, rect.height / 2))) : 1;
    const pointerOpts = { bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX, clientY, view: window };
    const mouseDownOpts = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, clientX, clientY, view: window };
    const mouseUpOpts = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 0, clientX, clientY, view: window };
    try { node.focus?.(); } catch (e) {}
    try { clickTarget.dispatchEvent(new PointerEvent('pointerdown', pointerOpts)); } catch (e) {}
    try { clickTarget.dispatchEvent(new MouseEvent('mousedown', mouseDownOpts)); } catch (e) {}
    try { clickTarget.dispatchEvent(new PointerEvent('pointerup', { ...pointerOpts, buttons: 0 })); } catch (e) {}
    try { clickTarget.dispatchEvent(new MouseEvent('mouseup', mouseUpOpts)); } catch (e) {}
    try { clickTarget.click(); return true; } catch (e) {}
    try { clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 0, clientX, clientY, view: window })); return true; } catch (e) {}
    return false;
  };

  const replayBlockedMenuClick = (opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const preferNode = options.node || null;
    if (preferNode && preferNode.isConnected && clickMenuItemNode(preferNode)) return true;
    const uls = Array.from(document.querySelectorAll('ul[role="menu"]')).filter(x => x && String(x.className || '').includes('ant-dropdown-menu'));
    const last = uls.length ? uls[uls.length - 1] : null;
    const candidate = last ? Array.from(last.querySelectorAll('li[role="menuitem"]')).find(x => matchesSecondMenuItem(x)) : null;
    if (candidate && clickMenuItemNode(candidate)) return true;
    if (options.openMenuAgain && lastBlockedMenuItemText) {
      const triggers = Array.from(document.querySelectorAll('[role="button"],button,a,span,div'))
        .filter(el => String(el?.innerText || '').replace(/\s+/g, ' ').trim().includes(lastBlockedMenuItemText));
      const trigger = triggers.length ? triggers[0] : null;
      if (trigger) {
        try { trigger.click(); } catch (e) {}
        const uls2 = Array.from(document.querySelectorAll('ul[role="menu"]')).filter(x => x && String(x.className || '').includes('ant-dropdown-menu'));
        const last2 = uls2.length ? uls2[uls2.length - 1] : null;
        const cand2 = last2 ? Array.from(last2.querySelectorAll('li[role="menuitem"]')).find(x => matchesSecondMenuItem(x)) : null;
        if (cand2 && clickMenuItemNode(cand2)) return true;
      }
    }
    return false;
  };

  const interceptClicks = () => {
    document.addEventListener('click', (ev) => {
      if (allowNextMenuClick) {
        allowNextMenuClick = false;
        return;
      }
      const li = ev.target?.closest?.('li[role="menuitem"]');
      if (!li) return;
      const ul = li.closest('ul[role="menu"]');
      if (!ul) return;
      if (!ul.className || !String(ul.className).includes('ant-dropdown-menu')) return;
      if (!matchesSecondMenuItem(li)) return;
      lastBlockedMenuItemText = (li?.innerText || '').replace(/\s+/g, ' ').trim();

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const clickMenuItem = () => {
        replayBlockedMenuClick({ node: li, openMenuAgain: true });
      };

      pendingClick = () => {
        clickMenuItem();
      };
      openModal();
    }, true);
  };

  ensureStyle();
  interceptClicks();

  const mo = new MutationObserver(() => {
    if (!matchesTargetUrl()) {
      cleanup();
      return;
    }
    const next = getCodeFromDom() || getCodeFromUrl();
    if (next && next !== code) {
      code = next;
      updateModalCode();
    }
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  const patchHistory = () => {
    try {
      const orig = history.pushState;
      history.pushState = function (...args) {
        const res = orig.apply(this, args);
        setTimeout(() => { if (!matchesTargetUrl()) cleanup(); }, 0);
        return res;
      };
    } catch (e) {}
    try {
      const orig = history.replaceState;
      history.replaceState = function (...args) {
        const res = orig.apply(this, args);
        setTimeout(() => { if (!matchesTargetUrl()) cleanup(); }, 0);
        return res;
      };
    } catch (e) {}
    try {
      window.addEventListener('popstate', () => { if (!matchesTargetUrl()) cleanup(); }, true);
    } catch (e) {}
  };
  patchHistory();
})();
