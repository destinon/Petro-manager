/**
 * PetroCorp Station Management - Toast Notification System
 */

let toastContainer = null;

function ensureContainer() {
    if (!toastContainer) {
        toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
    }
    return toastContainer;
}

export function showToast(message, type = 'info', duration = 3500) {
    const container = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-enter`;

    const iconMap = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    const icon = iconMap[type] || 'ℹ';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-message">${escapeHtml(message)}</div>
        <button class="toast-close" aria-label="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-show');
    });

    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }

    return toast;
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('toast-show');
    toast.classList.add('toast-exit');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

export const toast = {
    success: (msg, d) => showToast(msg, 'success', d),
    error: (msg, d) => showToast(msg, 'error', d || 4500),
    warning: (msg, d) => showToast(msg, 'warning', d || 4000),
    info: (msg, d) => showToast(msg, 'info', d)
};
