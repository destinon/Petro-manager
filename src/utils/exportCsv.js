/**
 * PetroCorp Station Management - CSV Export Utility
 */

export function exportToCSV(filename, rows, headers) {
    if (!rows || !rows.length) {
        alert('No data to export.');
        return;
    }

    const csvContent = [];
    
    // Add headers if provided
    if (headers && headers.length) {
        csvContent.push(headers.map(escapeCSVCell).join(','));
    }

    // Add row data
    rows.forEach(row => {
        if (Array.isArray(row)) {
            csvContent.push(row.map(escapeCSVCell).join(','));
        } else if (typeof row === 'object') {
            const vals = Object.values(row);
            csvContent.push(vals.map(escapeCSVCell).join(','));
        }
    });

    const csvString = '\uFEFF' + csvContent.join('\r\n'); // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeCSVCell(cell) {
    if (cell === null || cell === undefined) return '""';
    const cellStr = String(cell);
    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n') || cellStr.includes('\r')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
    }
    return `"${cellStr}"`;
}
