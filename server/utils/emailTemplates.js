const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderDetailRows = (rows = []) => rows
    .filter(row => row && row.value !== undefined && row.value !== null && row.value !== '')
    .map(row => `
        <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #e6edf3;color:#64748b;font-size:13px;font-weight:600;width:38%;">${escapeHtml(row.label)}</td>
            <td style="padding:12px 14px;border-bottom:1px solid #e6edf3;color:#0f172a;font-size:14px;font-weight:700;">${row.raw ? row.value : escapeHtml(row.value)}</td>
        </tr>
    `).join('');

const renderDetailsTable = (rows = []) => {
    const content = renderDetailRows(rows);
    if (!content) return '';
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;margin:22px 0;border:1px solid #e6edf3;border-radius:10px;overflow:hidden;background:#ffffff;">
            <tbody>${content}</tbody>
        </table>
    `;
};

const renderButton = (href, label) => {
    if (!href || !label) return '';
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
            <tr>
                <td style="border-radius:10px;background:#0ea5be;">
                    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 18px;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0;border-radius:10px;">${escapeHtml(label)}</a>
                </td>
            </tr>
        </table>
    `;
};

const renderEmailShell = ({
    eyebrow = 'NeuralChat',
    title,
    greeting,
    intro = [],
    details = [],
    actionUrl = '',
    actionLabel = '',
    note = '',
    footer = 'This is an automated notification from NeuralChat.'
}) => {
    const introHtml = (Array.isArray(intro) ? intro : [intro])
        .filter(Boolean)
        .map(text => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.65;">${escapeHtml(text)}</p>`)
        .join('');

    return `
        <div style="margin:0;padding:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f8fb;margin:0;padding:28px 12px;">
                <tr>
                    <td align="center">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
                            <tr>
                                <td style="padding:24px 28px;background:#0f172a;">
                                    <div style="font-size:13px;color:#67e8f9;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(eyebrow)}</div>
                                    <div style="margin-top:8px;color:#ffffff;font-size:24px;line-height:1.3;font-weight:800;">${escapeHtml(title)}</div>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:28px;">
                                    ${greeting ? `<p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:800;">${escapeHtml(greeting)}</p>` : ''}
                                    ${introHtml}
                                    ${renderDetailsTable(details)}
                                    ${renderButton(actionUrl, actionLabel)}
                                    ${note ? `<div style="margin-top:22px;padding:14px 16px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;color:#155e75;font-size:14px;line-height:1.55;">${escapeHtml(note)}</div>` : ''}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5;">
                                    ${escapeHtml(footer)}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    `;
};

module.exports = {
    escapeHtml,
    renderEmailShell
};
