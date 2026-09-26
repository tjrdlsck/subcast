(() => {
    const menu = document.querySelector('.header-display-menu');
    if (!menu) return;

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) menu.open = false;
    });

    menu.addEventListener('click', (event) => {
        if (event.target.closest('.header-display-options a, .header-display-options button')) {
            menu.open = false;
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menu.open) {
            menu.open = false;
            menu.querySelector('summary').focus();
        }
    });
})();
