export const getFileSizeBytes = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

export const formatFileSize = (value) => {
    const bytes = getFileSizeBytes(value);
    if (!bytes) return '';

    if (bytes < 1024) return `${bytes} B`;

    const units = ['kB', 'MB', 'GB', 'TB'];
    let size = bytes / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const decimals = size < 10 && unitIndex > 0 ? 2 : 1;
    const rounded = Number(size.toFixed(decimals));
    return `${rounded} ${units[unitIndex]}`;
};
