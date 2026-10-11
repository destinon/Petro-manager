/**
 * PetroCorp Station Management - Unified Theme Controller
 * Supports System Preference Detection, Seamless LocalStorage Persistence,
 * Cross-tab sync, and SVG / Emoji Toggle Button synchronization.
 */

const STORAGE_KEY = 'petrocorp-theme';

export function getPreferredTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') {
            return saved;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    } catch (e) {}
    return 'light';
}

export function applyTheme(theme) {
    const validTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', validTheme);
    document.documentElement.style.colorScheme = validTheme;

    // Synchronize all theme toggle buttons on the page
    const toggleBtns = document.querySelectorAll('#theme-toggle, .theme-toggle-btn');
    toggleBtns.forEach(btn => {
        const isDark = validTheme === 'dark';
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');

        // Update emoji fallback if present
        const emojiIcon = btn.querySelector('#theme-icon');
        if (emojiIcon) {
            emojiIcon.textContent = isDark ? '☀️' : '🌙';
        }
    });

    return validTheme;
}

export function setTheme(theme) {
    const applied = applyTheme(theme);
    try {
        localStorage.setItem(STORAGE_KEY, applied);
    } catch (e) {}
    return applied;
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    return setTheme(next);
}

export function initThemeController() {
    // 1. Initial application
    const initialTheme = getPreferredTheme();
    applyTheme(initialTheme);

    // 2. Attach click listeners (delegated)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#theme-toggle, .theme-toggle-btn');
        if (btn) {
            e.preventDefault();
            toggleTheme();
        }
    });

    // 3. Listen to storage events from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
            applyTheme(e.newValue);
        }
    });

    // 4. Listen to OS system preference changes (if user hasn't explicitly set preference)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    return initialTheme;
}
