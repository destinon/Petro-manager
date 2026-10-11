/**
 * PetroCorp Station Management - Formatting Utilities
 */

export function formatCurrency(amount, symbol = '₹') {
    const val = parseFloat(amount);
    if (isNaN(val)) return `${symbol}0.00`;
    // Format in Indian numbering system (e.g., ₹1,23,456.78)
    return `${symbol}${val.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

export function formatLitres(litres) {
    const val = parseFloat(litres);
    if (isNaN(val)) return '0.00 L';
    return `${val.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} L`;
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return dateString;
    }
}

export function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoString;
    }
}

export function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
