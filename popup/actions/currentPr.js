import { extractWebPrInfo, extractWebPrType } from '../services/webExtract.js';

export const refreshCurrentPr = async ({ currentPrInput, currentPrType, getActiveTab }) => {
    if (!currentPrInput) return;
    const tab = await getActiveTab();
    if (!tab?.id) { currentPrInput.value = ''; if (currentPrType) currentPrType.textContent = ''; return; }
    try {
        const prInfo = await extractWebPrInfo(tab.id);
        currentPrInput.value = prInfo?.prSap || prInfo?.prOne || '';
        if (currentPrType) {
            let type = '';
            try { type = await extractWebPrType(tab.id); } catch (e) { type = ''; }
            currentPrType.textContent = type ? `Loại PR: ${type}` : '';
        }
    } catch (e) { currentPrInput.value = ''; if (currentPrType) currentPrType.textContent = ''; }
};
