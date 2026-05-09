const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const ScheduledMessage = require('../models/ScheduledMessage');
const ChatDeletion = require('../models/ChatDeletion');
const PasswordReset = require('../models/PasswordReset');
const Community = require('../models/Community');
const ReactionLog = require('../models/ReactionLog'); // Import ReactionLog model for audit
const ChatActionLog = require('../models/ChatActionLog');
const { sendEmail } = require('../utils/emailService');
const sendBrevoMail = require('../brevoMailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const getClientBaseUrl = require('../utils/getClientBaseUrl');
const { renderEmailShell } = require('../utils/emailTemplates');

const SCHEDULED_PENDING_STATUSES = ['scheduled', 'sending'];
const JWT_SECRET = process.env.JWT_SECRET;
const REVIEW_CHAT_TOTP_PERIOD_SECONDS = Number(process.env.REVIEW_CHAT_TOTP_PERIOD_SECONDS || 60);
const REVIEW_CHAT_UNLOCK_TTL_SECONDS = Number(process.env.REVIEW_CHAT_UNLOCK_TTL_SECONDS || 10 * 60);

const normalizeBase32 = (value = '') => String(value).replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();

const base32ToBuffer = (value = '') => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = normalizeBase32(value);
    let bits = '';
    for (const char of clean) {
        const index = alphabet.indexOf(char);
        if (index === -1) throw new Error('Invalid base32 secret');
        bits += index.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
};

const bufferToBase32 = (buffer) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.slice(i, i + 5).padEnd(5, '0');
        output += alphabet[parseInt(chunk, 2)];
    }
    return output;
};

const getReviewChatTotpSecret = () => {
    if (process.env.REVIEW_CHAT_TOTP_SECRET) return normalizeBase32(process.env.REVIEW_CHAT_TOTP_SECRET);
    const seed = process.env.JWT_SECRET || process.env.DEFAULT_ENCRYPTION_SECRET || 'neuralchat-review-chat';
    return bufferToBase32(crypto.createHash('sha256').update(`review-chat:${seed}`).digest().subarray(0, 20));
};

const generateTotpCode = (secret, timeStep) => {
    const key = base32ToBuffer(secret);
    const counter = Buffer.alloc(8);
    counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
    counter.writeUInt32BE(timeStep >>> 0, 4);
    const hmac = crypto.createHmac('sha1', key).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(binary % 1000000).padStart(6, '0');
};

const verifyReviewChatTotp = (code) => {
    const normalizedCode = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) return false;
    const secret = getReviewChatTotpSecret();
    const acceptedPeriods = [...new Set([REVIEW_CHAT_TOTP_PERIOD_SECONDS, 30, 60].filter(Boolean))];
    const now = Math.floor(Date.now() / 1000);

    for (const period of acceptedPeriods) {
        const currentStep = Math.floor(now / period);
        for (let offset = -1; offset <= 1; offset += 1) {
            if (generateTotpCode(secret, currentStep + offset) === normalizedCode) return true;
        }
    }
    return false;
};

const signReviewChatAccessToken = (adminId, userId) => jwt.sign(
    { type: 'review-chat-access', adminId: String(adminId), userId: String(userId) },
    JWT_SECRET,
    { expiresIn: REVIEW_CHAT_UNLOCK_TTL_SECONDS }
);

const requireReviewChatAccess = (req, res, next) => {
    const reviewedUserId = String(req.params.userId || req.query.userId || req.body.userId || '');
    const token = req.headers['x-review-chat-token'];
    if (!reviewedUserId || !token) {
        return res.status(423).json({ error: 'Review chat is locked. Enter the current authenticator code.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (
            decoded?.type !== 'review-chat-access'
            || String(decoded.adminId) !== String(req.adminUser._id)
            || String(decoded.userId) !== reviewedUserId
        ) {
            return res.status(403).json({ error: 'Review chat unlock is not valid for this user.' });
        }
        next();
    } catch (_) {
        return res.status(423).json({ error: 'Review chat unlock expired. Enter a fresh authenticator code.' });
    }
};

const buildScheduledPreviewMessage = (scheduled, senderName = '') => {
    const row = scheduled.toObject ? scheduled.toObject() : scheduled;
    const payload = row.payload || {};
    const isGroup = row.target_type === 'group';
    return {
        _id: `scheduled-${row._id}`,
        id: `scheduled-${row._id}`,
        role: 'user',
        user_id: row.sender_id,
        sender_id: row.sender_id,
        receiver_id: isGroup ? null : row.target_id,
        group_id: isGroup ? row.target_id : null,
        sender_name: senderName || 'User',
        content: payload.content || payload.email_content || '',
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
        event: payload.event || undefined,
        ciphertext: payload.ciphertext,
        session_header: payload.session_header,
        sender_key_id: payload.sender_key_id,
        created_at: row.created_at,
        scheduled_message_id: row._id,
        scheduled: row,
        scheduled_at: row.scheduled_at,
        scheduled_requested_at: row.created_at,
        scheduled_sent_at: row.sent_at,
        is_scheduled: true,
        is_scheduled_preview: true,
        is_scheduled_delivery: false
    };
};

const generateSignature = (password) => {
    // HMAC SHA256 with Global Secret (Pepper)
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(password)
        .digest('hex');
};

const getAdminCredentialKey = () => crypto
    .createHash('sha256')
    .update(process.env.JWT_SECRET || process.env.DEFAULT_ENCRYPTION_SECRET || 'neuralchat-admin-pending')
    .digest();

const decryptPendingAdminPassword = (payload = '') => {
    const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
    if (!ivHex || !tagHex || !encryptedHex) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', getAdminCredentialKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final()
    ]).toString('utf8');
};

const isValidEmailAddress = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());

const sendTransferMail = async (to, subject, html, label) => {
    const recipient = String(to || '').trim();
    if (!recipient) {
        console.warn(`[ADMIN TRANSFER MAIL] Skipped ${label}: missing recipient email`);
        return { label, to, ok: false, skipped: true, error: 'Missing recipient email' };
    }
    if (!isValidEmailAddress(recipient)) {
        console.warn(`[ADMIN TRANSFER MAIL] Skipped ${label}: invalid recipient email`);
        return { label, to: recipient, ok: false, skipped: true, error: 'Invalid recipient email' };
    }

    try {
        await sendBrevoMail(recipient, subject, html, true);
        console.log(`[ADMIN TRANSFER MAIL] Sent ${label} to ${recipient}`);
        return { label, to: recipient, ok: true };
    } catch (err) {
        const error = err?.response?.body?.message || err?.message || 'Email delivery failed';
        console.error(`[ADMIN TRANSFER MAIL] Failed ${label} to ${recipient}:`, error);
        return { label, to: recipient, ok: false, error };
    }
};

const authenticateAdmin = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Admin authentication required' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('name email role status token_version __enc_name __enc_email');
        if (!user) return res.status(401).json({ error: 'Admin authentication required' });
        if (typeof user.decryptFieldsSync === 'function') {
            user.decryptFieldsSync();
        }
        if (user.role !== 'admin' || user.status !== 'approved') {
            return res.status(403).json({ error: 'You are not an admin. You do not have permission to access' });
        }
        if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        req.adminUser = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
};

router.use(authenticateAdmin);

router.get('/me', async (req, res) => {
    res.json({
        id: req.adminUser._id,
        name: req.adminUser.name,
        email: req.adminUser.email,
        role: req.adminUser.role
    });
});

router.get('/chat/review-lock/setup', async (req, res) => {
    const secret = getReviewChatTotpSecret();
    const hasConfiguredSecret = Boolean(process.env.REVIEW_CHAT_TOTP_SECRET);
    const issuer = encodeURIComponent(process.env.REVIEW_CHAT_TOTP_ISSUER || 'NeuralChat');
    const label = encodeURIComponent(`NeuralChat Review Chat:${req.adminUser.email || req.adminUser.name || 'Admin'}`);

    res.json({
        secret: hasConfiguredSecret ? undefined : secret,
        setupRequired: !hasConfiguredSecret,
        period: REVIEW_CHAT_TOTP_PERIOD_SECONDS,
        digits: 6,
        algorithm: 'SHA1',
        otpauthUrl: hasConfiguredSecret ? undefined : `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&period=${REVIEW_CHAT_TOTP_PERIOD_SECONDS}&digits=6`
    });
});

router.post('/chat/review-lock/verify', async (req, res) => {
    const { userId, code } = req.body || {};
    if (!userId || !code) return res.status(400).json({ error: 'Missing user or authenticator code' });

    const reviewedUser = await User.exists({ _id: userId, role: { $ne: 'admin' } });
    if (!reviewedUser) return res.status(404).json({ error: 'Reviewed user not found' });
    if (!verifyReviewChatTotp(code)) {
        return res.status(401).json({ error: 'Invalid or expired authenticator code' });
    }

    res.json({
        reviewToken: signReviewChatAccessToken(req.adminUser._id, userId),
        expiresIn: REVIEW_CHAT_UNLOCK_TTL_SECONDS
    });
});

const USER_PUBLIC_SELECT = [
    'name',
    'displayName',
    'email',
    'mobile',
    'countryCode',
    'designation',
    'about',
    'login_id',
    'role',
    'status',
    'token_version',
    'is_temporary_password',
    'favorites',
    'isOnline',
    'lastSeen',
    'created_at',
    'bannedUntil',
    'rejectionCount',
    'adminLock',
    'blockedUsers',
    'unethicalCount',
    'messagingBlocked',
    'unblockRequested',
    'unblockRequestReason',
    'privacySettings',
    '__enc_name',
    '__enc_displayName',
    '__enc_email',
    '__enc_mobile',
    '__enc_about',
    '__enc_designation'
].join(' ');

const toDecryptedUserObject = (user) => {
    if (!user) return null;
    if (typeof user.decryptFieldsSync === 'function') {
        user.decryptFieldsSync();
    }
    return user.toObject ? user.toObject() : user;
};

const getDecryptedUserSnapshot = (user) => {
    const obj = toDecryptedUserObject(user);
    if (!obj) return null;
    return {
        ...obj,
        id: obj._id?.toString?.() || obj.id
    };
};

// Get all users
router.get('/users', async (req, res) => {
    try {
        const rawUsers = await User.find().select(USER_PUBLIC_SELECT);
        const users = rawUsers.map(toDecryptedUserObject);

        // Add flagged count for each user
        const usersWithFlags = await Promise.all(users.map(async (u) => {
            const flaggedCount = await Message.countDocuments({ user_id: u._id, is_flagged: true });
            return { ...u, id: u._id, flaggedCount };
        }));

        res.json(usersWithFlags);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve User & Set Password and Login ID
router.post('/approve', async (req, res) => {
    const { userId, loginId, password } = req.body;
    if (!userId || !password || !loginId) return res.status(400).json({ error: 'Missing userId, loginId or password' });

    try {
        // Check if loginId exists (excluding current user if needed, but here it's new assignment)
        const existing = await User.findOne({ login_id: loginId });
        if (existing && existing.id !== userId) {
            return res.status(400).json({ error: 'Login ID already taken' });
        }

        // Check Password Uniqueness (Signature)
        const signature = generateSignature(password);

        const passExists = await User.findOne({ password_signature: signature });

        if (passExists && passExists.id !== userId) {
            return res.status(400).json({ error: 'Password already used by another user. Please choose a unique password.' });
        }

        // Check Legacy Passwords (No signature yet)
        // REMOVED FOR PERFORMANCE: We no longer check legacy users (O(N) cost).
        // New passwords might collide with old users who haven't logged in recently, but this is acceptable.

        const hash = await bcrypt.hash(password, 10);
        await User.findByIdAndUpdate(userId, {
            password: hash,
            password_signature: signature,
            login_id: loginId,
            status: 'approved',
            is_temporary_password: true,
            created_at: new Date()
        });

        res.json({ message: 'User approved with Login ID and Password' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('user_approved', { userId });
        }

        // Email User
        const user = await User.findById(userId);
        if (user && user.email) {
            const subject = 'Account Approved - Login Details';
            const baseUrl = getClientBaseUrl();
            const html = renderEmailShell({
                eyebrow: 'Account Approved',
                title: 'Welcome to NeuralChat',
                greeting: `Hi ${user.name || 'User'},`,
                intro: 'Your account has been approved. Use the login details below to access NeuralChat.',
                details: [
                    { label: 'Login ID', value: loginId },
                    { label: 'Temporary Password', value: password }
                ],
                actionUrl: `${baseUrl}/reset`,
                actionLabel: 'Reset Password',
                note: 'Please reset your temporary password before using your account regularly.'
            });
            console.log(`Attempting to send approval email to: ${user.email}`);
            await sendBrevoMail(user.email, subject, html, true).catch(err => {
                console.error('Failed to send user approval email:', err);
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/admin-transfer/approve', async (req, res) => {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'Missing admin request id' });

    try {
        const requestedAdmin = await User.findOne({ _id: requestId, role: 'admin', status: 'pending' })
            .select('name displayName email role status token_version created_at __enc_name __enc_displayName __enc_email +pending_admin_password +password_signature');
        if (!requestedAdmin) return res.status(404).json({ error: 'Admin request not found' });

        const plainPassword = decryptPendingAdminPassword(requestedAdmin.pending_admin_password || '');
        const requestedAdminSnapshot = getDecryptedUserSnapshot(requestedAdmin);
        const requestedAdminName = requestedAdminSnapshot?.displayName || requestedAdminSnapshot?.name || 'new admin';
        const requestedAdminEmail = String(requestedAdminSnapshot?.email || '').trim();

        const previousAdmins = await User.find({ role: 'admin', status: 'approved', _id: { $ne: requestedAdmin._id } }).select('name displayName email __enc_name __enc_displayName __enc_email');
        if (
            req.adminUser?.email &&
            !previousAdmins.some(admin => String(admin._id) === String(req.adminUser._id))
        ) {
            previousAdmins.push(req.adminUser);
        }
        const previousAdminSnapshots = previousAdmins
            .map(getDecryptedUserSnapshot)
            .filter(admin => admin?._id || admin?.id);
        const previousAdminIds = previousAdmins.map(admin => admin._id);

        await User.updateMany(
            { _id: { $in: previousAdminIds } },
            { $set: { role: 'user' }, $inc: { token_version: 1 } }
        );

        requestedAdmin.status = 'approved';
        requestedAdmin.pending_admin_password = undefined;
        requestedAdmin.token_version = (requestedAdmin.token_version || 0) + 1;
        requestedAdmin.created_at = new Date();
        await requestedAdmin.save();

        if (req.io) {
            req.io.to('admins').emit('admin_transfer_approved', {
                newAdminId: requestedAdmin._id.toString(),
                previousAdminIds: previousAdminIds.map(String)
            });
            previousAdminIds.forEach(id => req.io.to(String(id)).emit('force_logout'));
        }

        const subject = 'You have been approved and allotted as the new Admin';
        const baseUrl = getClientBaseUrl();
        const html = renderEmailShell({
            eyebrow: 'Admin Approved',
            title: 'You Are the New Admin',
            greeting: `Hi ${requestedAdminName},`,
            intro: 'Your admin request has been approved. You can now sign in to the admin dashboard with the credentials you provided while registering.',
            details: [
                { label: 'Email', value: requestedAdminEmail },
                ...(plainPassword ? [{ label: 'Password', value: plainPassword }] : []),
                { label: 'Role', value: 'Admin' }
            ],
            actionUrl: `${baseUrl}/?showLogin=true&role=admin`,
            actionLabel: 'Login to Admin Dashboard',
            note: 'You now have administrative privileges for this NeuralChat workspace.'
        });
        const transferSubject = `Your Admin ownership has been transferred to ${requestedAdminName}`;
        const transferHtml = (oldAdminName = 'Admin') => renderEmailShell({
            eyebrow: 'Ownership Transfer',
            title: 'Admin Ownership Transferred',
            greeting: `Hi ${oldAdminName},`,
            intro: [
                `Your admin ownership has been transferred to ${requestedAdminName}.`,
                'You can no longer access the admin dashboard or use administrative privileges for this NeuralChat workspace.'
            ],
            details: [
                { label: 'New Admin', value: requestedAdminName },
                { label: 'Previous Admin', value: oldAdminName },
                { label: 'Status', value: 'Admin access removed' }
            ],
            note: 'If you believe this transfer was not expected, please contact the new admin directly.'
        });
        const mailResults = await Promise.all([
            sendTransferMail(requestedAdminEmail, subject, html, 'new admin approval'),
            ...previousAdminSnapshots
                .filter(admin => admin.email)
                .map(admin => sendTransferMail(admin.email, transferSubject, transferHtml(admin.displayName || admin.name), 'previous admin transfer'))
        ]);

        res.json({
            message: 'Admin accountship transferred successfully',
            mailSent: mailResults.every(result => result.ok),
            mailResults
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Password Reset Requests
router.get('/resets', async (req, res) => {
    try {
        const resets = await PasswordReset.find({ status: 'pending' }).populate({ path: 'user_id', select: 'name email login_id __enc_name __enc_email' });

        // Transform to match previous flat structure
        const formatted = resets.map(r => {
            if (!r.user_id) return null; 
            const user = r.user_id;
            return {
                id: r.id,
                user_id: user?._id || user?.id,
                name: user?.name,
                email: user?.email,
                login_id: user?.login_id,
                created_at: r.created_at
            };
        }).filter(item => item !== null);

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resolve Reset Request (Set new password)
router.post('/reset-password', async (req, res) => {
    const { requestId, userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'Missing userId or newPassword' });

    try {
        const signature = generateSignature(newPassword);

        // Check uniqueness
        const passExists = await User.findOne({ password_signature: signature });
        if (passExists && passExists.id !== userId) {
            return res.status(400).json({ error: 'Password already used by another user.' });
        }

        // Prevent setting the temporary password same as the user's current password
        const targetUser = await User.findById(userId);
        if (targetUser) {
            const isSame = await bcrypt.compare(newPassword, targetUser.password);
            if (isSame) {
                if (targetUser.is_temporary_password) {
                    return res.status(400).json({ error: "Same temporary password cant be used" });
                } else {
                    return res.status(400).json({ error: "Temporary password Cant be same as user password" });
                }
            }
        }

        const hash = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(userId, {
            password: hash,
            password_signature: signature,
            is_temporary_password: true
        });

        if (requestId) {
            await PasswordReset.findByIdAndUpdate(requestId, { status: 'resolved' });
        }

        res.json({ message: 'Password updated' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('reset_resolved', { requestId });
        }



        // ... (existing helper functions) ...

        // Email User
        const user = await User.findById(userId);
        if (user && user.email) {
            const subject = 'Temporary Password Allocated';
            // Use configured CLIENT_URL or auto-detect local IP
            const baseUrl = getClientBaseUrl();

            const html = renderEmailShell({
                eyebrow: 'Password Reset',
                title: 'Temporary Password Allocated',
                greeting: `Hi ${user.name || 'User'},`,
                intro: 'The admin has allocated a temporary password for your account.',
                details: [
                    { label: 'Temporary Password', value: newPassword }
                ],
                actionUrl: `${baseUrl}/reset?token=${signature}&id=${user._id}`,
                actionLabel: 'Reset Password',
                note: 'Use this temporary password only to reset your account password.'
            });
            console.log(`Attempting to send temporary password email to: ${user.email}`);
            await sendBrevoMail(user.email, subject, html, true).catch(err => {
                console.error('Failed to send user reset email:', err);
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Reset Request
router.delete('/reset/:id', async (req, res) => {
    try {
        await PasswordReset.findByIdAndDelete(req.params.id);
        res.json({ message: 'Request deleted' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('reset_deleted', { requestId: req.params.id });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete User
router.delete('/user/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        await Message.deleteMany({ user_id: userId });
        await PasswordReset.deleteMany({ user_id: userId });
        await User.findByIdAndDelete(userId);
        res.json({ message: 'User deleted' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('user_deleted', { userId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve Unblock Request
router.post('/approve-unblock', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        await User.findByIdAndUpdate(userId, {
            messagingBlocked: false,
            unblockRequested: false,
            unethicalCount: 0,
            unblockRequestReason: null
        });

        res.json({ message: 'User messaging unblocked' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('user_unblocked', { userId });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reject Unblock Request
router.post('/reject-unblock', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        await User.findByIdAndUpdate(userId, {
            unblockRequested: false,
            unblockRequestReason: "Request Rejected by Admin" // Optional: Update reason or clear it
        });

        res.json({ message: 'Unblock request rejected' });

        // Emit Socket Event
        if (req.io) {
            req.io.emit('unblock_request_rejected', { userId });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Chat for a user
router.delete('/chat/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        await Message.deleteMany({ user_id: userId });
        res.json({ message: 'Chat history deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete specific messages
router.delete('/chat/messages/delete', requireReviewChatAccess, async (req, res) => {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
        return res.status(400).json({ error: 'Invalid message IDs' });
    }
    try {
        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $set: { is_deleted_by_admin: true } }
        );
        res.json({ message: 'Messages soft-deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Advanced Chat Review Routes ---

// Get all contacts a user has interacted with (including AI)
router.get('/chat/contacts/:userId', requireReviewChatAccess, async (req, res) => {
    try {
        const { userId } = req.params;

        // Find all unique people this user has messaged or received messages from
        const sentTo = await Message.distinct('receiver_id', { user_id: userId, receiver_id: { $ne: null } });
        const receivedFrom = await Message.distinct('user_id', { receiver_id: userId });
        const scheduledTargets = await ScheduledMessage.distinct('target_id', {
            sender_id: userId,
            target_type: 'user',
            status: { $in: SCHEDULED_PENDING_STATUSES }
        });

        // Merge and unique IDs
        const contactIds = [...new Set([
            ...sentTo.map(id => id.toString()),
            ...receivedFrom.map(id => id.toString()),
            ...scheduledTargets.map(id => id.toString())
        ])];

        // Fetch user details for these contacts
        const contactsRaw = await User.find({ _id: { $in: contactIds } }).select('name email __enc_name __enc_email');
        const contacts = contactsRaw.map(c => c.toObject());

        // Fetch groups this user is a member of
        const groups = await Group.find({ members: new mongoose.Types.ObjectId(userId) }).select('name').then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Check if user has AI messages
        const hasAI = await Message.exists({ user_id: userId, receiver_id: null });

        const groupIds = groups.map(g => g._id);
        const communities = await Community.find({
            $or: [
                { groups: { $in: groupIds } },
                { announcements: { $in: groupIds } }
            ]
        }).populate('groups', 'name').select('name groups announcements').then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        const result = [
            ...contacts.map(c => ({ id: c._id, name: c.name, email: c.email, type: 'user', subtext: 'Peer-to-Peer Chat' })),
            ...groups.map(g => {
                let name = g.name || 'Unnamed Group';
                let subtext = 'Group Chat';

                const commAsAnn = communities.find(c => String(c.announcements) === String(g._id));
                const commAsGroup = communities.find(c => c.groups.some(cg => String(cg._id || cg) === String(g._id)));

                if (commAsAnn) {
                    name = name === 'Announcements' || name === 'Unnamed Group' || !name ? `${commAsAnn.name} Announcements` : name;
                    if (commAsAnn.groups && commAsAnn.groups.length > 0) {
                        const groupNames = commAsAnn.groups.map(gr => gr.name);
                        if (groupNames.length === 1) {
                            subtext = `Integrated with group ${groupNames[0]}`;
                        } else if (groupNames.length === 2) {
                            subtext = `Integrated with groups ${groupNames[0]} and ${groupNames[1]}`;
                        } else {
                            const last = groupNames.pop();
                            subtext = `Integrated with groups ${groupNames.join(', ')} and ${last}`;
                        }
                    } else {
                        subtext = `No groups are present in the community`;
                    }
                } else if (commAsGroup) {
                    subtext = `Integrated with ${commAsGroup.name}`;
                }

                return { id: g._id, name: name, email: 'Group', type: 'group', subtext: subtext };
            })
        ];

        if (hasAI) {
            result.unshift({ id: 'ai', name: 'AI Assistant', email: 'System', type: 'ai' });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get unique dates for a specific conversation
router.get('/chat/dates/:userId/:otherUserId', requireReviewChatAccess, async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;
        let query = {};

        if (otherUserId === 'ai') {
            query = { user_id: userId, receiver_id: null };
            const messages = await Message.find(query).select('created_at').sort({ created_at: -1 });
            const dates = [...new Set(messages.map(m => m.created_at.toISOString().split('T')[0]))];
            return res.json(dates);
        } else {
            // Check if it's a group
            const isGroup = await Group.exists({ _id: otherUserId });
            if (isGroup) {
                const groupMessages = await GroupMessage.find({ group_id: otherUserId }).select('created_at').sort({ created_at: -1 });
                const scheduledRows = await ScheduledMessage.find({
                    sender_id: userId,
                    target_type: 'group',
                    target_id: otherUserId,
                    status: { $in: SCHEDULED_PENDING_STATUSES }
                }).select('created_at');
                const dates = [...new Set([
                    ...groupMessages.map(m => m.created_at.toISOString().split('T')[0]),
                    ...scheduledRows.map(m => m.created_at.toISOString().split('T')[0])
                ])];
                return res.json(dates);
            } else {
                query = {
                    $or: [
                        { user_id: userId, receiver_id: otherUserId },
                        { user_id: otherUserId, receiver_id: userId }
                    ]
                };
                const messages = await Message.find(query).select('created_at').sort({ created_at: -1 });
                const scheduledRows = await ScheduledMessage.find({
                    sender_id: userId,
                    target_type: 'user',
                    target_id: otherUserId,
                    status: { $in: SCHEDULED_PENDING_STATUSES }
                }).select('created_at');
                const dates = [...new Set([
                    ...messages.map(m => m.created_at.toISOString().split('T')[0]),
                    ...scheduledRows.map(m => m.created_at.toISOString().split('T')[0])
                ])];
                return res.json(dates);
            }
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get history for a specific date and contact
// Get statistics for the dashboard overview
router.get('/stats', async (req, res) => {
    try {
        const blockActionMatch = { action: { $in: ['block', 'unblock'] } };
        const [blockCount, reportCount, blockMembers, reportMembers] = await Promise.all([
            ChatActionLog.countDocuments(blockActionMatch),
            ChatActionLog.countDocuments({ action: 'report' }),
            ChatActionLog.distinct('actor_id', blockActionMatch),
            ChatActionLog.distinct('actor_id', { action: 'report' })
        ]);

        const metrics = {
            totalUsers: await User.countDocuments({
                role: { $ne: 'admin' },
                status: 'approved',
                login_id: { $exists: true, $ne: null }
            }),
            pendingApprovals: await User.countDocuments({ status: 'pending', role: 'user' }),
            adminRequests: await User.countDocuments({ status: 'pending', role: 'admin' }),
            activeResets: await PasswordReset.countDocuments({ status: 'pending' }),
            unblockRequests: await User.countDocuments({ unblockRequested: true }),
            totalBlocks: blockCount,
            blockMembers: blockMembers.length,
            totalReports: reportCount,
            reportMembers: reportMembers.length
        };

        // Registration Trends (Day/Month/Year)
        const now = new Date();

        // Helper for local date string YYYY-MM-DD
        const toLocalYMD = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Helper for local month string YYYY-MM
        const toLocalYM = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}`;
        };

        // Aggregation with timezone handling (assuming generic or UTC, but grouping by day)
        // Note: For strict local time accuracy in Mongo, we'd need $dateToString with timezone.
        // We'll stick to basic UTC grouping from Mongo but map mostly correctly.
        // Ideally: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "+05:30" } }
        // For now, we'll keep the existing simple aggregation but fix the filling logic which was the main issue.

        // 1. Day View (Last 7 days)
        // Reset 'now' to strictly local midnight to avoid drift
        now.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

        // 2. Month View (Last 7 months)
        const twelveMonthsAgo = new Date(now);
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);

        // 3. Year View (Last 7 years)
        const tenYearsAgo = new Date(now);
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 9);
        tenYearsAgo.setMonth(0);
        tenYearsAgo.setDate(1);

        const aggregateByPeriod = async (Model, match, format) => (
            Model.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dateToString: { format, date: "$created_at", timezone: "+05:30" } },
                        count: { $sum: 1 }
                    }
                }
            ])
        );

        const aggregateUsersByStatus = async (startDate, format, status) => (
            User.aggregate([
                { $match: { created_at: { $gte: startDate }, role: { $ne: 'admin' }, status } },
                {
                    $group: {
                        _id: { $dateToString: { format, date: "$created_at", timezone: "+05:30" } },
                        count: { $sum: 1 }
                    }
                }
            ])
        );

        const [
            dailyApproved,
            dailyPending,
            dailyResets,
            dailyUnblocks,
            monthlyApproved,
            monthlyPending,
            monthlyResets,
            monthlyUnblocks,
            yearlyApproved,
            yearlyPending,
            yearlyResets,
            yearlyUnblocks,
            dailyBlocks,
            dailyReports,
            monthlyBlocks,
            monthlyReports,
            yearlyBlocks,
            yearlyReports
        ] = await Promise.all([
            aggregateUsersByStatus(thirtyDaysAgo, "%Y-%m-%d", 'approved'),
            aggregateUsersByStatus(thirtyDaysAgo, "%Y-%m-%d", 'pending'),
            aggregateByPeriod(PasswordReset, { created_at: { $gte: thirtyDaysAgo }, status: 'pending' }, "%Y-%m-%d"),
            aggregateByPeriod(User, { created_at: { $gte: thirtyDaysAgo }, role: { $ne: 'admin' }, unblockRequested: true }, "%Y-%m-%d"),
            aggregateUsersByStatus(twelveMonthsAgo, "%Y-%m", 'approved'),
            aggregateUsersByStatus(twelveMonthsAgo, "%Y-%m", 'pending'),
            aggregateByPeriod(PasswordReset, { created_at: { $gte: twelveMonthsAgo }, status: 'pending' }, "%Y-%m"),
            aggregateByPeriod(User, { created_at: { $gte: twelveMonthsAgo }, role: { $ne: 'admin' }, unblockRequested: true }, "%Y-%m"),
            aggregateUsersByStatus(tenYearsAgo, "%Y", 'approved'),
            aggregateUsersByStatus(tenYearsAgo, "%Y", 'pending'),
            aggregateByPeriod(PasswordReset, { created_at: { $gte: tenYearsAgo }, status: 'pending' }, "%Y"),
            aggregateByPeriod(User, { created_at: { $gte: tenYearsAgo }, role: { $ne: 'admin' }, unblockRequested: true }, "%Y"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: thirtyDaysAgo }, action: { $in: ['block', 'unblock'] } }, "%Y-%m-%d"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: thirtyDaysAgo }, action: 'report' }, "%Y-%m-%d"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: twelveMonthsAgo }, action: { $in: ['block', 'unblock'] } }, "%Y-%m"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: twelveMonthsAgo }, action: 'report' }, "%Y-%m"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: tenYearsAgo }, action: { $in: ['block', 'unblock'] } }, "%Y"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: tenYearsAgo }, action: 'report' }, "%Y")
        ]);

        const actionPeopleRaw = await ChatActionLog.aggregate([
            { $match: { action: { $in: ['block', 'unblock', 'report'] } } },
            {
                $group: {
                    _id: {
                        actor_id: '$actor_id',
                        action: {
                            $cond: [{ $in: ['$action', ['block', 'unblock']] }, 'block', '$action']
                        }
                    },
                    count: { $sum: 1 },
                    lastActionAt: { $max: '$created_at' }
                }
            },
            { $lookup: { from: 'users', localField: '_id.actor_id', foreignField: '_id', as: 'actor' } },
            { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } },
            { $sort: { count: -1, lastActionAt: -1 } }
        ]);

        const actionActorIds = [...new Set(actionPeopleRaw.map(row => String(row._id.actor_id)).filter(Boolean))];
        const actionActors = await User.find({ _id: { $in: actionActorIds } }).select('name login_id blockedUsers __enc_name');
        const actionActorMap = new Map(actionActors.map(user => {
            const userObj = toDecryptedUserObject(user);
            return [String(userObj._id), userObj];
        }));

        const actionPeople = actionPeopleRaw.map(row => {
            const actor = actionActorMap.get(String(row._id.actor_id));
            return ({
            userId: row._id.actor_id,
            action: row._id.action,
            count: row.count,
            lastActionAt: row.lastActionAt,
            name: actor?.name || row.actor?.name || 'Unknown member',
            login_id: actor?.login_id || row.actor?.login_id || ''
            });
        });

        const actionDetailsRaw = await ChatActionLog.find({})
            .sort({ created_at: -1 })
            .limit(500)
            .populate('actor_id', 'name login_id __enc_name')
            .lean();

        const targetIdsByType = actionDetailsRaw.reduce((acc, log) => {
            if (log.target_id && log.target_type) {
                acc[log.target_type] = acc[log.target_type] || new Set();
                acc[log.target_type].add(String(log.target_id));
            }
            return acc;
        }, {});
        const [targetUsers, targetGroups, targetCommunities] = await Promise.all([
            targetIdsByType.p2p?.size ? User.find({ _id: { $in: [...targetIdsByType.p2p] } }).select('name login_id mobile email messagingBlocked unblockRequested unblockRequestReason __enc_name __enc_mobile __enc_email') : [],
            targetIdsByType.group?.size ? Group.find({ _id: { $in: [...targetIdsByType.group] } }).select('name members').lean() : [],
            targetIdsByType.community?.size ? Community.find({ _id: { $in: [...targetIdsByType.community] } }).select('name members').lean() : []
        ]);
        const targetMap = new Map([
            ...targetUsers.map(target => {
                const targetObj = toDecryptedUserObject(target);
                return [`p2p:${String(targetObj._id)}`, {
                    name: targetObj.name || 'Unknown user',
                    login_id: targetObj.login_id || '',
                    mobile: targetObj.mobile || '',
                    email: targetObj.email || '',
                    messagingBlocked: !!targetObj.messagingBlocked,
                    unblockRequested: !!targetObj.unblockRequested,
                    unblockRequestReason: targetObj.unblockRequestReason || ''
                }];
            }),
            ...targetGroups.map(target => [`group:${String(target._id)}`, {
                name: target.name || 'Unknown group',
                members: Array.isArray(target.members) ? target.members.length : 0
            }]),
            ...targetCommunities.map(target => [`community:${String(target._id)}`, {
                name: target.name || 'Unknown community',
                members: Array.isArray(target.members) ? target.members.length : 0
            }])
        ]);

        const actionDetails = actionDetailsRaw.map(log => {
            const actorId = log.actor_id?._id || log.actor_id;
            const actor = actionActorMap.get(String(actorId));
            const targetInfo = targetMap.get(`${log.target_type}:${String(log.target_id)}`) || {};
            const currentBlocked = log.target_type === 'p2p'
                ? (actor?.blockedUsers || []).some(blockedId => String(blockedId) === String(log.target_id))
                : null;
            return {
                id: String(log._id),
                userId: String(actorId || ''),
                action: log.action === 'unblock' ? 'block' : log.action,
                eventAction: log.action,
                currentBlocked,
                targetType: log.target_type,
                targetId: String(log.target_id || ''),
                targetName: targetInfo.name || log.target_name || '',
                targetLoginId: targetInfo.login_id || '',
                targetMobile: targetInfo.mobile || '',
                targetEmail: targetInfo.email || '',
                targetMembers: targetInfo.members || 0,
                resolutionStatus: log.target_type === 'p2p'
                    ? (targetInfo.unblockRequested ? 'pending' : (targetInfo.messagingBlocked ? 'pending' : 'solved'))
                    : 'pending',
                unblockRequestReason: targetInfo.unblockRequestReason || '',
                reason: log.reason || '',
                created_at: log.created_at,
                name: actor?.name || 'Unknown member',
                login_id: actor?.login_id || ''
            };
        });

        const actionContainers = ['block', 'report'].map(action => {
            const people = actionPeople.filter(item => item.action === action);
            return {
                key: action,
                label: action === 'block' ? 'Block Actions' : 'Report Actions',
                total: action === 'block' ? blockCount : reportCount,
                members: action === 'block' ? blockMembers.length : reportMembers.length,
                people: people.map(person => ({
                    ...person,
                    events: actionDetails.filter(detail => (
                        detail.action === action && String(detail.userId) === String(person.userId)
                    ))
                }))
            };
        });

        // Helper to fill missing data points
        const fillMissing = (baseDate, count, type, seriesSources) => {
            const result = [];

            for (let i = 0; i < count; i++) {
                const currentD = new Date(baseDate);
                if (type === 'day') currentD.setDate(currentD.getDate() + i);
                if (type === 'month') currentD.setMonth(currentD.getMonth() + i);
                if (type === 'year') currentD.setFullYear(currentD.getFullYear() + i);

                let dateStr = "";
                let displayLabel = "";

                if (type === 'day') {
                    dateStr = toLocalYMD(currentD);
                    displayLabel = dateStr;
                } else if (type === 'month') {
                    dateStr = toLocalYM(currentD);
                    displayLabel = dateStr;
                } else if (type === 'year') {
                    dateStr = currentD.getFullYear().toString();
                    displayLabel = dateStr;
                }

                result.push({
                    name: displayLabel,
                    ...Object.fromEntries(
                        Object.entries(seriesSources).map(([seriesKey, rows]) => [
                            seriesKey,
                            rows.find(r => r._id === dateStr)?.count || 0
                        ])
                    )
                });
            }
            return result;
        };

        console.log('Sending Stats:', metrics);
        res.json({
            ...metrics,
            chartData: {
                day: fillMissing(thirtyDaysAgo, 30, 'day', {
                    approved: dailyApproved,
                    pending: dailyPending,
                    resets: dailyResets,
                    unblocks: dailyUnblocks,
                    blocks: dailyBlocks,
                    reports: dailyReports
                }),
                month: fillMissing(twelveMonthsAgo, 12, 'month', {
                    approved: monthlyApproved,
                    pending: monthlyPending,
                    resets: monthlyResets,
                    unblocks: monthlyUnblocks,
                    blocks: monthlyBlocks,
                    reports: monthlyReports
                }),
                year: fillMissing(tenYearsAgo, 10, 'year', {
                    approved: yearlyApproved,
                    pending: yearlyPending,
                    resets: yearlyResets,
                    unblocks: yearlyUnblocks,
                    blocks: yearlyBlocks,
                    reports: yearlyReports
                })
            },
            actionContainers,
            actionDetails
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/debug-unblock', async (req, res) => {
    try {
        const users = await User.find({ unblockRequested: true });
        res.json({ count: users.length, users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/chat/history-filtered', requireReviewChatAccess, async (req, res) => {
    try {
        const { userId, otherUserId, date } = req.query;
        if (!userId || !otherUserId || !date) return res.status(400).json({ error: 'Missing parameters' });

        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        let query = {
            created_at: { $gte: start, $lte: end }
        };

        let messages = [];
        if (otherUserId === 'ai') {
            query.user_id = userId;
            query.receiver_id = null;
            messages = await Message.find(query).sort({ created_at: 1 }).populate('reply_to', 'content type file_path role');
        } else {
            const isGroup = await Group.exists({ _id: otherUserId });
            if (isGroup) {
                query.group_id = otherUserId;
                const groupMsgs = await GroupMessage.find(query).sort({ created_at: 1 }).populate('sender_id', 'name __enc_name');
                messages = groupMsgs.map(m => {
                    const obj = m.toObject();
                    obj.user_id = m.sender_id?._id || m.sender_id;
                    obj.sender_name = m.sender_id?.name || 'Unknown';
                    return obj;
                });
            } else {
                query.$or = [
                    { user_id: userId, receiver_id: otherUserId },
                    { user_id: otherUserId, receiver_id: userId }
                ];
                messages = await Message.find(query).sort({ created_at: 1 }).populate('reply_to', 'content type file_path role');
            }
        }

        // --- Enrich messages with scheduled delivery details and reaction history (Audit Trail) ---
        const messageIds = messages.map(m => m._id);
        const scheduledIds = messages
            .map(m => m.scheduled_message_id)
            .filter(Boolean);
        const scheduledRows = scheduledIds.length > 0
            ? await ScheduledMessage.find({ _id: { $in: scheduledIds } })
                .select('scheduled_at created_at sent_at status target_type sender_id target_id')
            : [];
        const scheduledById = new Map(scheduledRows.map(row => [String(row._id), row.toObject()]));

        const reactionLogs = await ReactionLog.find({ message_id: { $in: messageIds } })
            .populate('user_id', 'name __enc_name')
            .sort({ timestamp: 1 });

        const historyWithAudit = messages.map(m => {
            const mObj = m.toObject ? m.toObject() : m;
            const scheduledInfo = mObj.scheduled_message_id
                ? scheduledById.get(String(mObj.scheduled_message_id))
                : null;
            if (scheduledInfo) {
                mObj.scheduled = scheduledInfo;
                mObj.scheduled_at = scheduledInfo.scheduled_at;
                mObj.scheduled_requested_at = scheduledInfo.created_at;
                mObj.scheduled_sent_at = scheduledInfo.sent_at;
                mObj.is_scheduled_delivery = true;
            }
            mObj.reaction_history = reactionLogs.filter(log => String(log.message_id) === String(mObj._id));
            return mObj;
        });

        const pendingScheduledQuery = {
            sender_id: userId,
            status: { $in: SCHEDULED_PENDING_STATUSES },
            created_at: { $gte: start, $lte: end }
        };
        if (otherUserId !== 'ai') {
            const isGroup = await Group.exists({ _id: otherUserId });
            if (isGroup) {
                pendingScheduledQuery.target_type = 'group';
                pendingScheduledQuery.target_id = otherUserId;
            } else {
                pendingScheduledQuery.target_type = 'user';
                pendingScheduledQuery.target_id = otherUserId;
            }
        }

        const pendingScheduledRows = otherUserId === 'ai'
            ? []
            : await ScheduledMessage.find(pendingScheduledQuery)
                .select('sender_id target_type target_id payload scheduled_at status sent_message_id sent_at error created_at')
                .sort({ created_at: 1 });
        const reviewedSender = pendingScheduledRows.length > 0
            ? await User.findById(userId).select('name __enc_name')
            : null;
        const pendingScheduledPreviews = pendingScheduledRows.map(row => buildScheduledPreviewMessage(row, reviewedSender?.name));

        // Check if user has deleted this contact
        const deletions = await ChatDeletion.find({
            userId: userId,
            contactId: otherUserId
        }).populate('userId', 'name __enc_name').sort({ deletedAt: 1 });

        const enrichedMessages = [...historyWithAudit, ...pendingScheduledPreviews];

        if (deletions.length > 0) {
            deletions.forEach(del => {
                // Add a synthetic system message for each deletion
                enrichedMessages.push({
                    _id: `deletion-${del._id}`,
                    role: 'system',
                    type: 'text',
                    content: `These chat were delted by the ${del.userId?.name || del.contactName || 'unknown'}`,
                    created_at: del.deletedAt,
                    is_system_notice: true
                });
            });
        }
        enrichedMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        res.json(enrichedMessages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GLOBAL REACTION AUDIT LOGS ---
router.get('/reaction-logs', async (req, res) => {
    try {
        const ReactionLog = require('../models/ReactionLog');
        const Message = require('../models/Message');
        const GroupMessage = require('../models/GroupMessage');

        const logs = await ReactionLog.find({})
            .populate('user_id', 'name login_id email')
            .sort({ timestamp: -1 })
            .limit(300);

        const enrichedLogs = await Promise.all(logs.map(async (log) => {
            const logObj = log.toObject();
            let message = await Message.findById(log.message_id).populate('user_id receiver_id', 'name');
            if (!message) {
                message = await GroupMessage.findById(log.message_id).populate('sender_id group_id', 'name');
            }

            if (message) {
                logObj.contentSnippet = message.content ? (message.content.length > 30 ? message.content.substring(0, 30) + '...' : message.content) : `[${message.type}]`;
                logObj.type = message.type;
                if (log.isGroup) {
                    logObj.context = `Group: ${message.group_id?.name || 'Unknown'}`;
                    logObj.participants = `Sent by: ${message.sender_id?.name || 'Unknown'}`;
                } else {
                    const sender = message.user_id?.name || 'Unknown';
                    const receiver = message.receiver_id?.name || 'Unknown';
                    logObj.context = `Private Chat`;
                    logObj.participants = `${sender} ➔ ${receiver}`;
                }
            } else {
                logObj.contentSnippet = "[Message Deleted]";
                logObj.context = "N/A";
                logObj.participants = "N/A";
            }
            return logObj;
        }));

        res.json(enrichedLogs);
    } catch (err) {
        console.error('Error fetching global reaction logs:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
