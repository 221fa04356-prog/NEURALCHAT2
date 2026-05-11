export const formatDateForSeparator = (dateString, t, locale = 'en-US', currentDate = new Date()) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date(currentDate);
    const yesterday = new Date(currentDate);
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
    };

    if (isSameDay(date, today)) {
        return t ? t('chat_window.today') : 'Today';
    }

    if (isSameDay(date, yesterday)) {
        return t ? t('chat_window.yesterday') : 'Yesterday';
    }

    // Older chat dates use a compact numeric badge instead of weekday names.
    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7) {
        return formatNumericChatDate(date, locale);
    }

    return formatNumericChatDate(date, locale);
};

export const formatNumericChatDate = (dateString, locale = 'en-US') => {
    if (!dateString) return '';
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(locale, {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    });
};
