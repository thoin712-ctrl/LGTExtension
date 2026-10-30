import { listActivityLogs, clearActivityLogs } from './popup/db/activityLogRepo.js';
import { escapeHtml } from './popup/utils/text.js';

const fmt = (ts) => { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } };

const els = {
    search: document.getElementById('log_search'),
    kind: document.getElementById('log_kind'),
    btnRefresh: document.getElementById('btn_log_refresh'),
    btnClear: document.getElementById('btn_log_clear'),
    tbody: document.getElementById('log_tbody'),
    hint: document.getElementById('log_hint')
};

const render = async () => {
    const query = String(els.search?.value || '').trim();
    const kind = String(els.kind?.value || '').trim();
    const items = await listActivityLogs({ query, kind, limit: 600 });
    if (els.hint) els.hint.textContent = items.length > 0 ? `Hiển thị ${items.length} logs (mới nhất trước).` : 'Chưa có logs.';
    if (!els.tbody) return;
    els.tbody.innerHTML = items.map(it => {
        const dataText = (() => { try { return JSON.stringify(it.data || {}, null, 0); } catch (e) { return ''; } })();
        return `<tr><td class="small">${escapeHtml(fmt(it.ts))}</td><td class="small fw-semibold">${escapeHtml(it.kind)}</td><td>${escapeHtml(it.msg)}</td><td><code class="small" style="white-space: pre-wrap; display:block; max-height: 140px; overflow:auto;">${escapeHtml(dataText)}</code></td></tr>`;
    }).join('');
};

els.btnRefresh?.addEventListener('click', () => { render(); });
els.search?.addEventListener('input', () => { setTimeout(() => render(), 120); });
els.kind?.addEventListener('change', () => { render(); });
els.btnClear?.addEventListener('click', async () => { await clearActivityLogs(); await render(); });

render();
