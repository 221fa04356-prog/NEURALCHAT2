const ScheduledMessage = require('../models/ScheduledMessage');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const Group = require('../models/Group');
const Community = require('../models/Community');
const { calculateMessageHash } = require('./messageHash');
const { sendEmail } = require('./emailService');

let schedulerHandle = null;
let isProcessing = false;

const appName = process.env.EMAIL_FROM_NAME || 'Neural Chat';
const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
};

const toDatePart = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
    }
    return String(value).split('T')[0];
};

const formatEventDateTime = (dateValue, timeValue) => {
    const datePart = toDatePart(dateValue);
    if (!datePart) return '';
    const timePart = String(timeValue || '00:00').slice(0, 5);
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return '';
    const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-IN', { month: 'short' });
    const hour12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${day} ${monthName} ${year}, ${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
};

const getUserName = (user) => user?.displayName || user?.name || user?.email || 'User';

const describeMessage = (payload = {}) => {
    if (payload.type === 'event') return `Event: ${payload.event?.name || payload.content || 'Untitled event'}`;
    if (payload.type === 'contact') {
        const contacts = parseContacts(payload);
        if (contacts.length > 1) {
            return `${contacts[0]?.name || contacts[0]?.mobile || 'Contact'} and ${contacts.length - 1} other contact${contacts.length > 2 ? 's' : ''}`;
        }
        return `Contact: ${contacts[0]?.name || contacts[0]?.mobile || payload.email_content || 'Contact'}`;
    }
    if (payload.fileName) return payload.fileName;
    if (payload.email_content) return payload.email_content;
    if (payload.content) return payload.content;
    return payload.type || 'Message';
};

const getMessageKind = (payload = {}) => {
    if (payload.type === 'event') return 'event';
    if (payload.fileName) return 'file';
    if (payload.type === 'image') return 'photo';
    if (payload.type === 'video') return 'video';
    if (payload.type === 'audio') return 'voice message';
    if (payload.type === 'contact') return 'contact card';
    return 'message';
};

const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (!value) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const getFileTypeLabel = (payload = {}) => {
    const name = String(payload.fileName || '');
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
    if (payload.type === 'audio') return ext ? `${ext} audio` : 'Audio file';
    if (payload.type === 'image') return ext ? `${ext} image` : 'Image';
    if (payload.type === 'video') return ext ? `${ext} video` : 'Video';
    if (ext === 'PDF') return 'PDF document';
    if (['DOC', 'DOCX', 'RTF', 'ODT'].includes(ext)) return 'Word document';
    if (['XLS', 'XLSX', 'CSV', 'ODS'].includes(ext)) return 'Spreadsheet';
    if (['PPT', 'PPTX', 'ODP'].includes(ext)) return 'Presentation';
    return ext ? `${ext} file` : 'File';
};

const renderDetailRows = (rows) => rows
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `
        <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#64748b;width:36%;">${escapeHtml(label)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:600;">${escapeHtml(value)}</td>
        </tr>
    `).join('');

const parseContacts = (payload = {}) => {
    const raw = payload.content || payload.email_content || '';
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const contacts = Array.isArray(parsed) ? parsed : [parsed];
        return contacts.filter(contact => contact && typeof contact === 'object');
    } catch (error) {
        return [{ name: String(raw) }];
    }
};

const formatPhone = (contact = {}) => {
    const countryCode = String(contact.countryCode || '').trim();
    const mobile = String(contact.mobile || contact.phone || '').trim();
    if (!mobile) return '';
    if (!countryCode || mobile.startsWith(countryCode)) return mobile;
    return `${countryCode} ${mobile}`;
};

const renderPayloadDetails = (payload = {}) => {
    if (payload.type === 'event') {
        const event = payload.event || {};
        const rows = renderDetailRows([
            ['Status', event.cancelled ? 'Cancelled' : event.rescheduledAt ? 'Rescheduled' : 'Scheduled'],
            ['Title', event.name || payload.content],
            ['Description', event.description],
            ['Starts', formatEventDateTime(event.startDate, event.startTime)],
            ['Ends', event.endDate || event.endTime ? formatEventDateTime(event.endDate || event.startDate, event.endTime || event.startTime) : ''],
            ['Location', event.location],
            ['Reminder', event.reminderTiming && event.reminderTiming !== 'default' ? event.reminderTiming : 'Default']
        ]);
        return rows ? `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0 18px;">${rows}</table>` : '';
    }

    if (payload.type === 'contact') {
        const contacts = parseContacts(payload);
        return contacts.map((contact, index) => {
            const rows = renderDetailRows([
                ['Name', contact.name],
                ['Mobile', formatPhone(contact)],
                ['Email', contact.email],
                ['About', contact.about],
                ['Designation', contact.designation]
            ]);
            if (!rows) return '';
            const heading = contacts.length > 1 ? `<div style="font-weight:700;margin:12px 0 6px;">Contact ${index + 1}</div>` : '';
            return `${heading}<table style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 18px;">${rows}</table>`;
        }).join('');
    }

    if (['file', 'image', 'video', 'audio'].includes(payload.type) || payload.fileName) {
        const rows = renderDetailRows([
            ['File name', payload.fileName],
            ['File type', getFileTypeLabel(payload)],
            ['Size', formatBytes(payload.fileSize)],
            ['Pages', payload.pageCount ? `${payload.pageCount}` : ''],
            ['Duration', payload.duration ? `${Math.round(Number(payload.duration))} seconds` : '']
        ]);
        return rows ? `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0 18px;">${rows}</table>` : '';
    }

    if (payload.type === 'poll' && payload.poll) {
        const rows = renderDetailRows([
            ['Question', payload.poll.question],
            ['Options', (payload.poll.options || []).map((o) => o.text).join(', ')],
            ['Multiple answers', payload.poll.allowMultipleAnswers ? 'Allowed' : 'Not allowed']
        ]);
        return rows ? `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0 18px;">${rows}</table>` : '';
    }

    return '';
};

const renderRecipientRows = (recipients) => recipients.map((recipient) => `
    <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(getUserName(recipient))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#2563eb;">${escapeHtml(recipient.email || '')}</td>
    </tr>
`).join('');

const renderShell = (title, body) => `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#111827;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;background:#0f172a;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;">${escapeHtml(title)}</div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">${escapeHtml(appName)}</div>
            </div>
            <div style="padding:22px;">${body}</div>
        </div>
    </div>
`;

const sendMailSafe = async (...args) => {
    try {
        await sendEmail(...args);
    } catch (error) {
        console.error('[SCHEDULED EMAIL]', error.message || error);
    }
};

const notifySenderScheduled = async ({ sender, recipients, payload, scheduledAt, targetName }) => {
    if (!sender?.email || !adminEmail) return;
    const rows = renderRecipientRows(recipients);
    const kind = getMessageKind(payload);
    await sendMailSafe(sender.email, `Scheduled in ${appName}`, `
        ${renderShell('Scheduled successfully', `
            <p style="margin:0 0 14px;line-height:1.55;">Your ${escapeHtml(kind)} has been scheduled for <strong>${escapeHtml(formatDateTime(scheduledAt))}</strong>${targetName ? ` in <strong>${escapeHtml(targetName)}</strong>` : ''}.</p>
            <div style="padding:14px 16px;background:#f1f5f9;border-radius:8px;margin-bottom:18px;line-height:1.5;">${escapeHtml(describeMessage(payload))}</div>
            ${renderPayloadDetails(payload)}
            <div style="font-weight:700;margin-bottom:8px;">Recipients</div>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
                <thead><tr><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Name</th><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Email</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="2" style="padding:10px 12px;">No registered emails found.</td></tr>'}</tbody>
            </table>
        `)}
    `);
};

const notifyRecipientDelivered = async ({ sender, recipient, payload, groupName }) => {
    if (!recipient?.email) return;
    const kind = getMessageKind(payload);
    await sendMailSafe(recipient.email, payload.type === 'event' ? `New event from ${getUserName(sender)}` : `New ${kind} from ${getUserName(sender)}`, renderShell(payload.type === 'event' ? 'New event' : 'New message', `
        <p style="margin:0 0 14px;line-height:1.55;"><strong>${escapeHtml(getUserName(sender))}</strong>${groupName ? ` posted in <strong>${escapeHtml(groupName)}</strong>` : ' sent you a new update'}.</p>
        <div style="padding:14px 16px;background:#f1f5f9;border-radius:8px;margin-bottom:14px;line-height:1.5;">${escapeHtml(describeMessage(payload))}</div>
        ${renderPayloadDetails(payload)}
    `), {
        from: `"${getUserName(sender)}" <${adminEmail || process.env.EMAIL_USER}>`,
        replyTo: sender?.email
    });
};

const notifySenderDelivered = async ({ sender, recipients, payload, groupName }) => {
    if (!sender?.email || !adminEmail) return;
    const rows = renderRecipientRows(recipients);
    const kind = getMessageKind(payload);
    await sendMailSafe(sender.email, `${payload.type === 'event' ? 'Event' : 'Message'} delivered`, `
        ${renderShell('Delivery summary', `
            <p style="margin:0 0 14px;line-height:1.55;">Your ${escapeHtml(kind)}${groupName ? ` in <strong>${escapeHtml(groupName)}</strong>` : ''} has been delivered.</p>
            <div style="padding:14px 16px;background:#f1f5f9;border-radius:8px;margin-bottom:18px;line-height:1.5;">${escapeHtml(describeMessage(payload))}</div>
            ${renderPayloadDetails(payload)}
            <div style="font-weight:700;margin-bottom:8px;">Delivered to</div>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
                <thead><tr><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Name</th><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Email</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="2" style="padding:10px 12px;">No registered emails found.</td></tr>'}</tbody>
            </table>
        `)}
    `);
};

const getGroupRecipients = async (group, senderId) => {
    const memberIds = (group?.members || []).map(String).filter((id) => id !== String(senderId));
    if (!memberIds.length) return [];
    return User.find({ _id: { $in: memberIds } }).select('name displayName email __enc_name __enc_displayName __enc_email');
};

const scheduleMessage = async ({ senderId, targetType, targetId, payload, scheduledAt }) => {
    if (!scheduledAt) return null;
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid schedule time.');
    }
    if (date <= new Date(Date.now() + 30000)) {
        throw new Error('Schedule time must be at least 30 seconds in the future.');
    }

    const scheduled = await ScheduledMessage.create({
        sender_id: senderId,
        target_type: targetType,
        target_id: targetId,
        payload,
        scheduled_at: date
    });

    const sender = await User.findById(senderId).select('name displayName email __enc_name __enc_displayName __enc_email');
    let recipients = [];
    let targetName = '';
    if (targetType === 'user') {
        const recipient = await User.findById(targetId).select('name displayName email __enc_name __enc_displayName __enc_email');
        if (recipient) recipients = [recipient];
    } else {
        const group = await Group.findById(targetId).select('name members');
        targetName = group?.name || 'Group';
        recipients = await getGroupRecipients(group, senderId);
    }
    await notifySenderScheduled({ sender, recipients, payload, scheduledAt: date, targetName });
    return scheduled;
};

const sendP2PNow = async ({ scheduled, io }) => {
    const payload = scheduled.payload || {};
    const senderId = String(scheduled.sender_id);
    const receiverId = String(scheduled.target_id);
    const lastMsg = await Message.findOne({
        $or: [{ user_id: senderId, receiver_id: receiverId }, { user_id: receiverId, receiver_id: senderId }]
    }).sort({ created_at: -1 });
    const timestamp = new Date();
    const previousHash = lastMsg ? lastMsg.message_hash : 'GENESIS_BLOCK';
    const msg = await Message.create({
        user_id: senderId,
        receiver_id: receiverId,
        role: 'user',
        content: payload.content || '',
        type: payload.type || 'text',
        file_path: payload.file_path || null,
        fileName: payload.fileName || null,
        fileSize: payload.fileSize || 0,
        pageCount: payload.pageCount || 0,
        thumbnail_path: payload.thumbnail_path || null,
        duration: payload.duration || 0,
        is_view_once: !!payload.is_view_once,
        reply_to: payload.reply_to || null,
        poll: payload.poll || undefined,
        event: payload.event ? { ...payload.event, participants: [senderId] } : undefined,
        ciphertext: payload.ciphertext,
        session_header: payload.session_header,
        message_hash: calculateMessageHash({ previousHash, senderId, receiverId, content: payload.content || '', ciphertext: payload.ciphertext, timestamp }),
        previous_message_hash: previousHash,
        scheduled_message_id: scheduled._id,
        scheduled_created_at: scheduled.created_at,
        created_at: timestamp
    });
    const msgObj = (await Message.findById(msg._id)).toObject();
    if (io) {
        io.to(receiverId).emit('receive_message', msgObj);
        io.to(senderId).emit('scheduled_message_sent', { scheduledId: String(scheduled._id), message: msgObj, isGroup: false });
        io.to('admins').emit('receive_message', msgObj);
    }
    const [sender, recipient] = await Promise.all([
        User.findById(senderId).select('name displayName email __enc_name __enc_displayName __enc_email'),
        User.findById(receiverId).select('name displayName email __enc_name __enc_displayName __enc_email')
    ]);
    await notifyRecipientDelivered({ sender, recipient, payload });
    await notifySenderDelivered({ sender, recipients: recipient ? [recipient] : [], payload });
    return msg;
};

const sendGroupNow = async ({ scheduled, io }) => {
    const payload = scheduled.payload || {};
    const senderId = String(scheduled.sender_id);
    const groupId = String(scheduled.target_id);
    const group = await Group.findById(groupId).select('name members');
    if (!group) throw new Error('Group not found');
    const timestamp = new Date();
    const lastMsg = await GroupMessage.findOne({ group_id: groupId }).sort({ created_at: -1 });
    const previousHash = lastMsg ? lastMsg.message_hash : 'GENESIS_BLOCK';
    const msg = await GroupMessage.create({
        group_id: groupId,
        sender_id: senderId,
        role: 'user',
        content: payload.content || '',
        type: payload.type || 'text',
        file_path: payload.file_path || null,
        fileName: payload.fileName || null,
        fileSize: payload.fileSize || 0,
        pageCount: payload.pageCount || 0,
        thumbnail_path: payload.thumbnail_path || null,
        duration: payload.duration || 0,
        is_view_once: !!payload.is_view_once,
        poll: payload.poll || undefined,
        event: payload.event ? { ...payload.event, participants: [senderId] } : undefined,
        ciphertext: payload.ciphertext,
        sender_key_id: payload.sender_key_id,
        message_hash: calculateMessageHash({ previousHash, senderId, groupId, content: payload.content || '', ciphertext: payload.ciphertext, timestamp }),
        previous_message_hash: previousHash,
        scheduled_message_id: scheduled._id,
        scheduled_created_at: scheduled.created_at,
        created_at: timestamp
    });
    const msgObj = (await GroupMessage.findById(msg._id).populate('sender_id', 'name _id __enc_name')).toObject();
    if (io) {
        group.members.forEach((memberId) => io.to(String(memberId)).emit('group_message', { groupId, message: msgObj }));
        io.to(senderId).emit('scheduled_message_sent', { scheduledId: String(scheduled._id), message: msgObj, isGroup: true, groupId });
    }
    const sender = await User.findById(senderId).select('name displayName email __enc_name __enc_displayName __enc_email');
    const recipients = await getGroupRecipients(group, senderId);
    await Promise.all(recipients.map((recipient) => notifyRecipientDelivered({ sender, recipient, payload, groupName: group.name || 'Group' })));
    await notifySenderDelivered({ sender, recipients, payload, groupName: group.name || 'Group' });
    return msg;
};

const notifyEventCreated = async ({ senderId, targetType, targetId, payload }) => {
    const sender = await User.findById(senderId).select('name displayName email __enc_name __enc_displayName __enc_email');
    if (targetType === 'user') {
        const recipient = await User.findById(targetId).select('name displayName email __enc_name __enc_displayName __enc_email');
        await notifyRecipientDelivered({ sender, recipient, payload });
        await notifySenderDelivered({ sender, recipients: recipient ? [recipient] : [], payload });
        return;
    }
    const group = await Group.findById(targetId).select('name members');
    if (!group) return;
    const recipients = await getGroupRecipients(group, senderId);
    await Promise.all(recipients.map((recipient) => notifyRecipientDelivered({ sender, recipient, payload, groupName: group.name || 'Group' })));
    await notifySenderDelivered({ sender, recipients, payload, groupName: group.name || 'Group' });
};

const getEventChangeTitle = (action) => {
    if (action === 'cancelled') return 'Event cancelled';
    if (action === 'rescheduled') return 'Event rescheduled';
    return 'Event updated';
};

const notifyEventChanged = async ({ senderId, targetType, targetId, event, action = 'updated' }) => {
    const sender = await User.findById(senderId).select('name displayName email __enc_name __enc_displayName __enc_email');
    const payload = { type: 'event', content: event?.name || 'Untitled event', event };
    const title = getEventChangeTitle(action);
    let recipients = [];
    let groupName = '';

    if (targetType === 'user') {
        const recipient = await User.findById(targetId).select('name displayName email __enc_name __enc_displayName __enc_email');
        if (recipient) recipients = [recipient];
    } else {
        const group = await Group.findById(targetId).select('name members');
        if (!group) return;
        groupName = group.name || 'Group';
        recipients = await getGroupRecipients(group, senderId);
    }

    const recipientBody = (recipient) => renderShell(title, `
        <p style="margin:0 0 14px;line-height:1.55;"><strong>${escapeHtml(getUserName(sender))}</strong> ${escapeHtml(action)} an event${groupName ? ` in <strong>${escapeHtml(groupName)}</strong>` : ''}.</p>
        <div style="padding:14px 16px;background:#f1f5f9;border-radius:8px;margin-bottom:14px;line-height:1.5;">${escapeHtml(describeMessage(payload))}</div>
        ${renderPayloadDetails(payload)}
    `);

    await Promise.all(recipients.filter(recipient => recipient?.email).map((recipient) => sendMailSafe(
        recipient.email,
        `${title} from ${getUserName(sender)}`,
        recipientBody(),
        { from: `"${getUserName(sender)}" <${adminEmail || process.env.EMAIL_USER}>`, replyTo: sender?.email }
    )));

    if (sender?.email) {
        const rows = renderRecipientRows(recipients);
        await sendMailSafe(sender.email, `${title} sent`, renderShell(title, `
            <p style="margin:0 0 14px;line-height:1.55;">Your event update${groupName ? ` in <strong>${escapeHtml(groupName)}</strong>` : ''} has been emailed.</p>
            <div style="padding:14px 16px;background:#f1f5f9;border-radius:8px;margin-bottom:18px;line-height:1.5;">${escapeHtml(describeMessage(payload))}</div>
            ${renderPayloadDetails(payload)}
            <div style="font-weight:700;margin-bottom:8px;">Recipients</div>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
                <thead><tr><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Name</th><th align="left" style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Email</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="2" style="padding:10px 12px;">No registered emails found.</td></tr>'}</tbody>
            </table>
        `));
    }
};

const processDueScheduledMessages = async (io) => {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const due = await ScheduledMessage.find({
            status: 'scheduled',
            scheduled_at: { $lte: new Date() }
        }).sort({ scheduled_at: 1 }).limit(25);

        for (const scheduled of due) {
            try {
                scheduled.status = 'sending';
                await scheduled.save();
                const msg = scheduled.target_type === 'group'
                    ? await sendGroupNow({ scheduled, io })
                    : await sendP2PNow({ scheduled, io });
                scheduled.status = 'sent';
                scheduled.sent_message_id = msg._id;
                scheduled.sent_at = new Date();
                scheduled.error = '';
                await scheduled.save();
            } catch (error) {
                scheduled.status = 'failed';
                scheduled.error = error.message || 'Scheduled send failed';
                await scheduled.save();
                console.error('[SCHEDULED SEND]', error);
            }
        }
    } finally {
        isProcessing = false;
    }
};

const startScheduledMessaging = (io) => {
    if (schedulerHandle) return schedulerHandle;
    schedulerHandle = setInterval(() => processDueScheduledMessages(io), 30000);
    processDueScheduledMessages(io).catch((error) => console.error('[SCHEDULED START]', error));
    return schedulerHandle;
};

module.exports = {
    scheduleMessage,
    notifyEventCreated,
    notifyEventChanged,
    startScheduledMessaging,
    processDueScheduledMessages
};
