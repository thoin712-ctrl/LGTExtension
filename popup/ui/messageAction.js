export const createMessageAction = ({ message, btnAcceptDuplicate, btnOverwriteDuplicate, btnCancelAction }) => {
    const setMessage = (text) => { if (message) message.innerText = text || ''; };
    let pendingMessageAction = null;
    const hideMessageActionButtons = () => {
        if (btnAcceptDuplicate) btnAcceptDuplicate.style.display = 'none';
        if (btnOverwriteDuplicate) btnOverwriteDuplicate.style.display = 'none';
        if (btnCancelAction) btnCancelAction.style.display = 'none';
        pendingMessageAction = null;
    };
    const showMessageConfirm = ({ text, okText, overwriteText, showOverwrite, cancelText, showCancel, kind, action }) => {
        setMessage(text || '');
        if (btnAcceptDuplicate) { btnAcceptDuplicate.textContent = okText || 'OK'; btnAcceptDuplicate.style.display = ''; }
        const allowOverwrite = showOverwrite === true;
        if (btnOverwriteDuplicate && allowOverwrite) { btnOverwriteDuplicate.textContent = overwriteText || 'OVERWRITE'; btnOverwriteDuplicate.style.display = ''; }
        else if (btnOverwriteDuplicate) btnOverwriteDuplicate.style.display = 'none';
        const allowCancel = showCancel !== false;
        if (btnCancelAction && allowCancel) { btnCancelAction.textContent = cancelText || 'CANCEL'; btnCancelAction.style.display = ''; }
        else if (btnCancelAction) btnCancelAction.style.display = 'none';
        pendingMessageAction = { kind: kind || '', action: action || null };
    };
    const getPending = () => (pendingMessageAction && pendingMessageAction.kind ? pendingMessageAction : null);
    return { setMessage, showMessageConfirm, hideMessageActionButtons, getPending };
};
