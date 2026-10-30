export const initThemeSwitch = () => {
    const uiCss = document.getElementById('qt_ui_css');
    const inputs = Array.from(document.querySelectorAll('input[name="ui_theme"]'));
    const apply = (theme) => {
        let t = theme;
        if (t !== 'ios' && t !== 'admin' && t !== 'google') t = 'google';
        try { localStorage.setItem('ui_theme', t); } catch (e) {}
        if (uiCss) uiCss.setAttribute('href', `popup/themes/${t}.css`);
        for (const el of inputs) el.checked = (el.value === t);
        document.documentElement.dataset.uiTheme = t;
    };
    const fromStorage = (() => { try { return localStorage.getItem('ui_theme') || ''; } catch (e) { return ''; } })();
    apply(fromStorage || 'google');
    for (const el of inputs) el.addEventListener('change', () => { if (el.checked) apply(el.value); });
    
    // Active link handling
    const navLinks = Array.from(document.querySelectorAll('.qt-nav-link'));
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    return { apply };
};
