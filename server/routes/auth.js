const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { sendEmail } = require('../utils/emailService'); // Keeping one reference if needed for other routes, but mostly using brevoMailer
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const getClientBaseUrl = require('../utils/getClientBaseUrl');
const sendBrevoMail = require('../brevoMailer');
const { renderEmailShell } = require('../utils/emailTemplates');
const { loginRequestLimiter, loginFailureLimiter } = require('../middleware/rateLimiters');


const generateSignature = (password) => {
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(password)
        .digest('hex');
};

const getAdminCredentialKey = () => crypto
    .createHash('sha256')
    .update(process.env.JWT_SECRET || process.env.DEFAULT_ENCRYPTION_SECRET || 'neuralchat-admin-pending')
    .digest();

const encryptPendingAdminPassword = (password) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getAdminCredentialKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const normalizeMobile = (mobile = '') => String(mobile).replace(/\D/g, '').slice(-10);
const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const generateMobileSignature = (mobile) => {
    const normalized = normalizeMobile(mobile);
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`mobile:${normalized}`)
        .digest('hex');
};

const generateEmailSignature = (email) => {
    const normalized = normalizeEmail(email);
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`email:${normalized}`)
        .digest('hex');
};

const rememberEmailSignature = async (user, email) => {
    if (!user || user.email_signature) return;
    await User.updateOne(
        { _id: user._id },
        { $set: { email_signature: generateEmailSignature(email || user.email) } }
    );
};

const findUserByEmail = async (email, filters = {}, select = '') => {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    const signature = generateEmailSignature(normalized);
    let query = User.findOne({ ...filters, email_signature: signature });
    if (select) query = query.select(select);
    const signatureMatch = await query;
    if (signatureMatch) return signatureMatch;

    // Backward-compatible fallback for records saved before email_signature existed.
    let fallbackQuery = User.find(filters);
    if (select) fallbackQuery = fallbackQuery.select(select);
    const users = await fallbackQuery;
    const user = users.find((candidate) => normalizeEmail(candidate.email) === normalized) || null;
    if (user) await rememberEmailSignature(user, normalized);
    return user;
};

const findUserByName = async (name, filters = {}) => {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return null;

    const users = await User.find(filters).select('name role __enc_name');
    return users.find((user) => String(user.name || '').trim().toLowerCase() === normalized) || null;
};

const findUsersByMobile = async (mobile) => {
    const normalized = normalizeMobile(mobile);
    if (!normalized) return [];

    const signature = generateMobileSignature(normalized);
    const matches = [];
    const seenIds = new Set();

    const addMatch = (user) => {
        if (!user) return;
        const id = String(user._id || '');
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);
        matches.push(user);
    };

    const signatureMatches = await User.find({ mobile_signature: signature }).select('name email login_id mobile mobile_signature status role __enc_mobile __enc_email __enc_name');
    signatureMatches.forEach(addMatch);

    // Backward-compatible fallback for users created before mobile_signature existed.
    const users = await User.find({}).select('mobile role email name login_id status __enc_mobile __enc_email __enc_name');
    users.forEach((user) => {
        if (normalizeMobile(user.mobile) === normalized) addMatch(user);
    });

    return matches;
};

const chooseMobileOwner = (users = []) => (
    users.find((user) => user.status === 'approved' && user.login_id) ||
    users.find((user) => user.login_id) ||
    users.find((user) => user.status === 'approved') ||
    users[0] ||
    null
);

const findUserByMobile = async (mobile) => {
    const matches = await findUsersByMobile(mobile);
    return chooseMobileOwner(matches);
};

const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '';
    const [name, domain] = email.split('@');
    if (!name) return `***@${domain}`;
    if (name.length <= 2) return `${name[0]}*@${domain}`;
    return `${name.slice(0, 2)}***@${domain}`;
};

const JWT_SECRET = process.env.JWT_SECRET;

router.get('/check-mobile', async (req, res) => {
    try {
        const cleanMobile = normalizeMobile(req.query.mobile);
        if (!/^\d{10}$/.test(cleanMobile)) {
            return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
        }

        const existingMobileUsers = await findUsersByMobile(cleanMobile);
        if (!existingMobileUsers.length) {
            return res.json({ available: true });
        }

        const existingMobile = chooseMobileOwner(existingMobileUsers);
        const accountLabel = existingMobile.login_id
            ? `account ${existingMobile.login_id}`
            : existingMobile.email
                ? `account ${maskEmail(existingMobile.email)}`
                : 'another account';

        return res.json({
            available: false,
            accountLabel,
            message: `This mobile number is already linked with ${accountLabel}.`
        });
    } catch (err) {
        console.error('Mobile availability check failed:', err);
        return res.status(500).json({ error: 'Unable to check mobile number right now.' });
    }
});

// Register
router.post('/register', async (req, res) => {
    const { name, email, mobile, countryCode, designation } = req.body;

    if (!name || !email || !mobile || !countryCode) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Validations
    const nameRegex = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;
    const mobileRegex = /^\d{10}$/;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

    if (!nameRegex.test(name)) return res.status(400).json({ error: 'Name may contain letters, numbers, spaces, dots, apostrophes, and hyphens.' });
    const cleanMobile = normalizeMobile(mobile);

    if (!mobileRegex.test(cleanMobile)) return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    try {
        // Check duplicates
        const existingMobile = await findUserByMobile(cleanMobile);
        if (existingMobile) {
            return res.status(400).json({ error: 'This number is already taken' });
        }

        const existing = await findUserByEmail(email) || await findUserByName(name);
        if (existing) {
            let field = 'details';
            if (normalizeEmail(existing.email) === normalizeEmail(email)) field = 'email';
            else if (String(existing.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()) field = 'name';

            const role = existing.role === 'admin' ? 'Admin' : 'User';
            return res.status(400).json({ error: `${role} with this ${field} already exists` });
        }

        // Insert as pending
        const newUser = await User.create({ name, displayName: name, email, email_signature: generateEmailSignature(email), mobile: cleanMobile, mobile_signature: generateMobileSignature(cleanMobile), countryCode, designation, status: 'pending', is_temporary_password: false });

        // Emit Socket Event
        if (req.io) {
            const userPayload = {
                id: newUser._id.toString(),
                name,
                email,
                mobile: cleanMobile,
                countryCode,
                designation,
                role: newUser.role,
                status: newUser.status,
                created_at: newUser.created_at
            };
            console.log('Server: Emitting new_registration:', userPayload.email);
            req.io.to('admins').emit('new_registration', userPayload);
        } else {
            console.error('Server: req.io is undefined in /register');
        }

        // Email Admin
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
            const subject = 'New User Registration Request';
            const html = renderEmailShell({
                eyebrow: 'User Approval',
                title: 'New User Registration',
                intro: 'A new user is waiting for approval in your NeuralChat admin dashboard.',
                details: [
                    { label: 'Name', value: name },
                    { label: 'Job Position', value: designation || 'N/A' },
                    { label: 'Email', value: email },
                    { label: 'Mobile', value: `${countryCode} ${cleanMobile}` }
                ],
                actionUrl: `${getClientBaseUrl()}/?showLogin=true&role=admin`,
                actionLabel: 'Open Admin Dashboard',
                note: 'Review the details before approving this account.'
            });
            sendBrevoMail(adminEmail, subject, html, true).catch(err => console.error('Failed to send admin email:', err));
        }

        // Email User
        if (email) {
            const userSubject = 'Registration Request Received';
            const userHtml = renderEmailShell({
                eyebrow: 'Registration',
                title: 'Registration Request Received',
                greeting: `Hi ${name},`,
                intro: [
                    'Your registration request has been submitted successfully to the admin team.',
                    'We will notify you once your account has been approved and your login details are generated.'
                ],
                details: [
                    { label: 'Name', value: name },
                    { label: 'Email', value: email },
                    { label: 'Status', value: 'Pending admin approval' }
                ],
                note: 'No action is needed from your side right now.'
            });
            sendBrevoMail(email, userSubject, userHtml, true).catch(err => console.error('Failed to send user registration email:', err));
        }

        res.json({ message: 'Registration requested. Wait for admin approval.' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', loginRequestLimiter, loginFailureLimiter, async (req, res) => {
    const { email, loginId, password, force, adminLogin } = req.body;

    if (!email && !loginId) return res.status(400).json({ error: 'Missing Login ID or Email', reason: 'missing_identifier' });

    try {
        const user = email
            ? await findUserByEmail(email)
            : await User.findOne({ login_id: loginId });
        if (!user) {
            return res.status(400).json({
                error: adminLogin ? 'Incorrect email' : 'Incorrect Login ID',
                reason: adminLogin ? 'invalid_login_id' : 'invalid_login_id'
            });
        }

        if (adminLogin && user.role !== 'admin') {
            return res.status(403).json({
                error: 'You are not an admin. You do not have permission to access',
                reason: 'invalid_login_id'
            });
        }

        if (user.status !== 'approved') {
            return res.status(403).json({ error: 'Account not approved yet', reason: 'account_not_approved' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials', reason: 'invalid_password' });

        // Check for active sessions using socket rooms
        const activeSockets = req.io ? req.io.sockets.adapter.rooms.get(user.id.toString())?.size || 0 : 0;

        if (!force && activeSockets > 0) {
            return res.status(409).json({ error: 'The user is already signed in', needsForce: true });
        }

        if (force && req.io) {
            // Tell the active client to clear local storage and log out
            req.io.to(user.id.toString()).emit('force_logout');
            // Hard disconnect the sockets shortly after
            setTimeout(() => {
                req.io.in(user.id.toString()).disconnectSockets(true);
            }, 300);
        }

        // One Password One User Policy (Single Session)
        // Increment token version to invalidate previous tokens
        const newVersion = (user.token_version || 0) + 1;
        await User.findByIdAndUpdate(user.id, { token_version: newVersion });

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name, token_version: newVersion },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { 
                id: user.id, 
                name: user.name, // Global name
                displayName: user.displayName || user.name,
                role: user.role, 
                email: user.email, 
                login_id: user.login_id 
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Forgot Password Request
router.post('/forgot-password', async (req, res) => {
    const { email, loginId } = req.body;

    if (!email && !loginId) {
        return res.status(400).json({ error: 'Email or Login ID required' });
    }

    try {
        const user = email
            ? await findUserByEmail(email)
            : await User.findOne({ login_id: loginId });
        if (!user) return res.status(400).json({ error: 'User not found' });

        const newReset = await PasswordReset.create({ user_id: user._id });

        if (req.io) {
            console.log('Server: Emitting new_reset for', user.email);
            req.io.to('admins').emit('new_reset', {
                id: newReset._id,
                user_id: user._id,
                name: user.name,
                email: user.email,
                login_id: user.login_id,
                created_at: newReset.created_at
            });
        } else {
            console.error('Server: req.io is undefined in /forgot-password');
        }

        // Email Admin + User (track status explicitly)
        const adminEmail = process.env.ADMIN_EMAIL;
        const jobs = [];

        if (adminEmail) {
            const subject = 'Password Reset Request';
            const html = renderEmailShell({
                eyebrow: 'Password Reset',
                title: 'Password Reset Requested',
                intro: 'A user has requested help resetting their password.',
                details: [
                    { label: 'User', value: user.name },
                    { label: 'Email', value: user.email },
                    { label: 'Login ID', value: user.login_id || 'N/A' }
                ],
                actionUrl: `${getClientBaseUrl()}/?showLogin=true&role=admin`,
                actionLabel: 'Resolve Request',
                note: 'Allocate a temporary password only after verifying the request.'
            });
            jobs.push(
                sendBrevoMail(adminEmail, subject, html, true).then(() => ({ type: 'admin', ok: true })).catch((err) => ({ type: 'admin', ok: false, error: err?.message || 'Failed to send admin email' }))
            );
        }

        if (user.email) {
            const userSubject = 'Password Reset Request Received';
            const userHtml = renderEmailShell({
                eyebrow: 'Password Reset',
                title: 'We Received Your Request',
                greeting: `Hi ${user.name},`,
                intro: [
                    'Your password reset request has been submitted to the admin team for approval.',
                    'You will receive updated login details once your request is processed.'
                ],
                details: [
                    { label: 'Login ID', value: user.login_id || 'N/A' },
                    { label: 'Status', value: 'Pending admin review' }
                ]
            });
            
            jobs.push(
                sendBrevoMail(user.email, userSubject, userHtml, true).then(() => ({ type: 'user', ok: true })).catch((err) => ({ type: 'user', ok: false, error: err?.message || 'Failed to send user email' }))
            );
        }

        const results = await Promise.all(jobs);
        const adminResult = results.find(r => r.type === 'admin');
        const userResult = results.find(r => r.type === 'user');

        if (results.length > 0 && results.every(r => !r.ok)) {
            return res.status(502).json({
                error: 'Reset request was created, but email delivery failed',
                adminEmailSent: false,
                userEmailSent: false
            });
        }

        console.log(`[DEBUG] Forgot Password for: ${user.name} (ID: ${user.login_id})`);
        res.json({
            message: 'Reset request sent to admin',
            name: user.name,
            destination: maskEmail(user.email),
            adminEmailSent: !!adminResult?.ok,
            userEmailSent: !!userResult?.ok
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Registration (Secret Key Protected)
router.post('/admin/register', async (req, res) => {
    const { name, email, mobile, countryCode, password, secretKey } = req.body;

    const MASTER_KEY = process.env.ADMIN_SECRET;
    if (secretKey !== MASTER_KEY) {
        return res.status(403).json({ error: 'Invalid Admin Secret Key' });
    }

    if (!name || !email || !mobile || !countryCode || !password) return res.status(400).json({ error: 'All fields required' });

    try {
        const cleanMobile = normalizeMobile(mobile);
        if (!/^\d{10}$/.test(cleanMobile)) return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
        if (await findUserByMobile(cleanMobile)) return res.status(400).json({ error: 'This number is already taken' });

        const existing = await findUserByEmail(email);
        if (existing) return res.status(400).json({ error: 'Email already exists' });

        // Check Password Uniqueness
        const signature = generateSignature(password);
        if (await User.findOne({ password_signature: signature })) {
            return res.status(400).json({ error: 'Password already used by another user.' });
        }

        const hash = await bcrypt.hash(password, 10);
        const approvedAdminExists = await User.exists({ role: 'admin', status: 'approved' });
        const newAdmin = await User.create({
            name,
            displayName: name,
            email,
            email_signature: generateEmailSignature(email),
            password: hash,
            password_signature: signature,
            role: 'admin',
            status: approvedAdminExists ? 'pending' : 'approved',
            pending_admin_password: approvedAdminExists ? encryptPendingAdminPassword(password) : undefined,
            mobile: cleanMobile,
            mobile_signature: generateMobileSignature(cleanMobile),
            countryCode
        });

        if (approvedAdminExists) {
            const adminUsers = await User.find({ role: 'admin', status: 'approved' }).select('name email __enc_name __enc_email');
            const recipients = adminUsers.map(admin => admin.email).filter(Boolean);
            if (process.env.ADMIN_EMAIL && !recipients.includes(process.env.ADMIN_EMAIL)) recipients.push(process.env.ADMIN_EMAIL);

            const subject = 'New Admin Registration Received';
            const html = renderEmailShell({
                eyebrow: 'Admin Approval',
                title: 'New Admin Registration Received',
                intro: 'A new admin registration is waiting for your approval.',
                details: [
                    { label: 'Name', value: name },
                    { label: 'Email', value: email },
                    { label: 'Mobile', value: `${countryCode} ${cleanMobile}` },
                    { label: 'Requested Role', value: 'Admin' }
                ],
                actionUrl: `${getClientBaseUrl()}/?showLogin=true&role=admin`,
                actionLabel: 'Review Admin Request',
                note: 'Approving this request transfers admin ownership to the new admin.'
            });
            recipients.forEach(recipient => {
                sendBrevoMail(recipient, subject, html, true).catch(err => console.error('Failed to send admin transfer request email:', err));
            });

            const requesterSubject = 'Admin request submitted';
            const requesterHtml = renderEmailShell({
                eyebrow: 'Admin Request',
                title: 'Admin Request Submitted',
                greeting: `Hi ${name},`,
                intro: [
                    'Your new admin registration request has been submitted to the current admin for review.',
                    'We will notify you by email once the admin approves or rejects your request.'
                ],
                details: [
                    { label: 'Email', value: email },
                    { label: 'Mobile', value: `${countryCode} ${cleanMobile}` },
                    { label: 'Status', value: 'Pending approval' }
                ]
            });
            sendBrevoMail(email, requesterSubject, requesterHtml, true).catch(err => console.error('Failed to send admin request confirmation email:', err));

            if (req.io) {
                req.io.to('admins').emit('new_admin_request', {
                    id: newAdmin._id.toString(),
                    name,
                    email,
                    mobile: cleanMobile,
                    countryCode,
                    role: 'admin',
                    status: 'pending',
                    created_at: newAdmin.created_at
                });
            }

            return res.json({ message: 'Your Request has been sent to the Main Admin for approval' });
        }

        res.json({ message: 'Admin account created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Password Reset (Secret Key Protected)
router.post('/admin/reset', async (req, res) => {
    const { email, newPassword, secretKey } = req.body;

    // Resolve name for UI popup
    let adminName = 'Admin';
    try {
        if (email) {
            const adminUser = await findUserByEmail(email, { role: 'admin' });
            if (adminUser) adminName = adminUser.name;
        }
    } catch (e) {
        console.log("Error looking up admin name", e);
    }

    const MASTER_KEY = process.env.ADMIN_SECRET;
    if (secretKey !== MASTER_KEY) {
        return res.status(403).json({ error: 'Invalid Admin Secret Key', senderName: adminName });
    }

    try {
        const signature = generateSignature(newPassword);

        // Check uniqueness (exclude current admin if same email - though admin email is unique)
        const passExists = await User.findOne({ password_signature: signature });
        // We act on email, need id to exclude.
        const adminUser = await findUserByEmail(email, { role: 'admin' });
        if (passExists && (!adminUser || passExists.id !== adminUser.id)) {
            return res.status(400).json({ error: 'Password already used by another user.' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        const result = await User.updateOne(
            { _id: adminUser?._id, role: 'admin' },
            { password: hash, password_signature: signature }
        );

        if (result.matchedCount === 0) return res.status(404).json({ error: 'Admin email not found', senderName: adminName });

        res.json({ message: 'Password reset successful', senderName: adminName });
    } catch (err) {
        res.status(500).json({ error: err.message, senderName: adminName });
    }
});

// User Self-Service Password Change
router.post('/change-password', async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ error: 'Missing userId or newPassword' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check Password Uniqueness
        const signature = generateSignature(newPassword);
        const passExists = await User.findOne({ password_signature: signature });

        if (passExists && passExists.id !== userId) {
            return res.status(400).json({ error: 'Password already used by another user. Please choose a unique password.' });
        }

        const hash = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(userId, {
            password: hash,
            password_signature: signature,
            is_temporary_password: false
        });

        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset Password using Temporary Password (Unauthenticated)
router.post('/reset-password-temp', async (req, res) => {
    const { loginId, tempPassword, newPassword, allowSamePassword } = req.body;

    if (!loginId || !tempPassword || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const user = await User.findOne({ login_id: loginId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify Temporary Password
        const isMatch = await bcrypt.compare(tempPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Temporary password invalid or expired' });
        }

        // Prevent setting the same password UNLESS explicitly allowed
        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame && !allowSamePassword) {
            return res.status(400).json({ error: 'New password must be different from the temporary password' });
        }

        // Check Password Uniqueness
        const signature = generateSignature(newPassword);
        const passExists = await User.findOne({ password_signature: signature });

        if (passExists && passExists.id !== user.id) {
            return res.status(400).json({ error: 'Password already used by another user. Please choose a unique password.' });
        }

        // Update Password
        const hash = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(user._id, {
            password: hash,
            password_signature: signature,
            is_temporary_password: false
        });

        // Send email to user with new credentials
        const subject = 'Password Reset Successful';
        const baseUrl = getClientBaseUrl();
        const html = renderEmailShell({
            eyebrow: 'Password Updated',
            title: 'Password Reset Successful',
            greeting: `Hi ${user.name},`,
            intro: 'Your password has been successfully reset. Please keep these details secure.',
            details: [
                { label: 'Login ID', value: user.login_id || 'N/A' },
                { label: 'New Password', value: newPassword }
            ],
            actionUrl: `${baseUrl}/?showLogin=true&token=${signature}&id=${user._id}`,
            actionLabel: 'Login to NeuralChat',
            note: 'For your account security, change this password after signing in if it was shared with you.'
        });

        console.log(`Attempting to send reset confirmation email to: ${user.email}`);
        // Non-blocking call to show popup immediately
        sendBrevoMail(user.email, subject, html, true).catch(err => {
            console.error('Failed to send reset confirmation email:', err);
        });

        res.json({ message: 'Password reset successful' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify Temporary Password (for link validation)
router.post('/verify-temp', async (req, res) => {
    const { loginId, tempPassword } = req.body;

    if (!loginId || !tempPassword) {
        return res.status(400).json({ valid: false, message: 'Missing credentials' });
    }

    try {
        const user = await User.findOne({ login_id: loginId });
        if (!user) {
            return res.status(404).json({ valid: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(tempPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ valid: false, message: 'Invalid or expired temporary password' });
        }

        res.json({ valid: true });
    } catch (err) {
        res.status(500).json({ valid: false, error: err.message });
    }
});

// Verify Link Token (For Expiry Check)
router.post('/verify-link-token', async (req, res) => {
    const { userId, token } = req.body;

    if (!userId || !token) {
        return res.status(400).json({ valid: false, message: 'Missing token or userId' });
    }

    try {
        const user = await User.findById(userId).select('+password_signature');
        if (!user) {
            return res.status(404).json({ valid: false, message: 'User not found' });
        }

        // The token should match the current password_signature
        // If password changed, signature changed -> Token Invalid
        if (token !== user.password_signature) {
            return res.status(401).json({ valid: false, message: 'Link expired' });
        }

        res.json({ valid: true });
    } catch (err) {
        res.status(500).json({ valid: false, message: err.message });
    }
});

// Update User Profile (Self)
const twilio = require('twilio');
const VerificationLog = require('../models/VerificationLog');

router.post('/send-call-otp', async (req, res) => {
    const { context, identifier, mobile, countryCode } = req.body;
    let user = null; // Declare user here to make it accessible later
    try {
        let finalMobile = mobile;
        if (!finalMobile && identifier) {
            user = (context.includes('admin') || identifier.includes('@'))
                ? await findUserByEmail(identifier)
                : await User.findOne({ login_id: identifier }); // Assign to the declared user variable
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (!user.mobile) return res.status(400).json({ error: 'No mobile number registered to this account' });
            finalMobile = user.mobile;
        }

        if (!finalMobile) return res.status(400).json({ error: 'Mobile number is required' });

        // Clean mobile number - extract last 10 digits
        const cleanMobile = normalizeMobile(finalMobile);
        if (cleanMobile.length !== 10) return res.status(400).json({ error: 'Invalid mobile number length' });

        if (['register', 'admin_register'].includes(context)) {
            const existingMobile = await findUserByMobile(cleanMobile);
            if (existingMobile) {
                return res.status(400).json({ error: 'This number is already taken' });
            }
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpKey = identifier || cleanMobile;
        const maskedMobile = cleanMobile.slice(0, 2) + 'XXXXXX' + cleanMobile.slice(-2);

        // Save to Database mapping instead of volatile Map
        await VerificationLog.findOneAndUpdate(
            { identifier: otpKey },
            {
                otp,
                context,
                maskedMobile,
                status: 'pending',
                expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
            },
            { upsert: true, returnDocument: 'after' }
        );

        // Setup Twilio
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromPhone = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && fromPhone) {
            const client = twilio(accountSid, authToken);
            const spacedOtp = otp.split('').join(' ');
            const twiml = `<Response><Say>Welcome to Neural Chat. Your verification code is ${spacedOtp}. I repeat, ${spacedOtp}. Once again, ${spacedOtp}. Thank you for using the Call verification system.</Say></Response>`;

            const finalCountryCode = countryCode || user?.countryCode || '+91';
            await client.calls.create({
                twiml: twiml,
                to: finalCountryCode + cleanMobile,
                from: fromPhone
            });
        } else {
            const finalCountryCode = countryCode || user?.countryCode || '+91';
            console.log('\n=============================================');
            console.log(`[TWILIO MOCK] Call to ${finalCountryCode}${cleanMobile}`);
            console.log('[TWILIO MOCK] Body: Welcome... Your OTP is: ' + otp);
            console.log('=============================================\n');
        }

        res.json({ success: true, maskedMobile });
    } catch (err) {
        console.error('Call Error:', err);
        res.status(500).json({ error: 'Failed to initiate call. Please try again.' });
    }
});

router.post('/verify-call-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    let cleanIdentifier = identifier;

    // if identifier was phone number, clean it
    if (/^\d+$/.test(identifier)) {
        cleanIdentifier = identifier.replace(/\D/g, '').slice(-10);
    }

    try {
        const record = await VerificationLog.findOne({
            identifier: { $in: [cleanIdentifier, identifier] },
            status: 'pending'
        });

        if (!record) return res.status(400).json({ error: 'OTP expired or not requested' });
        if (Date.now() > new Date(record.expiresAt).getTime()) {
            await VerificationLog.deleteOne({ _id: record._id });
            return res.status(400).json({ error: 'OTP expired' });
        }

        if (record.otp === otp) {
            record.status = 'verified';
            await record.save();
            return res.json({ success: true });
        } else {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
    } catch (err) {
        console.error('OTP Verification Error:', err);
        return res.status(500).json({ error: 'Server error during verification' });
    }
});

router.put('/update-profile', async (req, res) => {
    const { userId, name, about, mobile, countryCode, privacySettings, image, profile_photo } = req.body;
    console.log('[PROFILE UPDATE] Request received for userId:', userId);

    if (!userId) {
        console.error('[PROFILE UPDATE] Missing userId');
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const updateData = {};
        if (name !== undefined) {
            const trimmedName = String(name || '').trim();
            const nameRegex = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;
            if (!trimmedName) {
                return res.status(400).json({ error: 'Name is required' });
            }
            if (!nameRegex.test(trimmedName)) {
                return res.status(400).json({ error: 'Name may contain letters, numbers, spaces, dots, apostrophes, and hyphens.' });
            }
            updateData.displayName = trimmedName;
        }
        if (about !== undefined) updateData.about = about;
        if (countryCode !== undefined) updateData.countryCode = countryCode;
        if (image !== undefined || profile_photo !== undefined) updateData.image = image || profile_photo || '';
        if (mobile !== undefined) {
            // Basic mobile validation match register logic: strictly 10 digits
            const cleanMobile = normalizeMobile(mobile);
            if (!/^\d{10}$/.test(cleanMobile)) {
                console.error('[PROFILE UPDATE] Invalid mobile format:', mobile);
                return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
            }
            // Check if mobile matches someone else
            const existing = await findUserByMobile(cleanMobile);
            if (existing && String(existing._id) !== String(userId)) {
                console.error('[PROFILE UPDATE] Mobile already in use by:', existing._id);
                return res.status(400).json({ error: 'Mobile number already used by another account' });
            }
            updateData.mobile = cleanMobile;
            updateData.mobile_signature = generateMobileSignature(cleanMobile);
        }

        if (privacySettings !== undefined) {
            const visibilityKeys = ['lastSeen', 'onlineStatus', 'profilePhoto', 'about', 'status', 'readReceipts'];
            const sanitizeChoice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
            const sanitizeNumberChoice = (value, allowed, fallback) => {
                const normalized = Number(value);
                return allowed.includes(normalized) ? normalized : fallback;
            };
            const sanitizeVisibilityRule = (rule) => {
                if (typeof rule === 'boolean') {
                    return rule ? { mode: 'everyone', exceptUserIds: [] } : { mode: 'no_one', exceptUserIds: [] };
                }

                if (typeof rule === 'string') {
                    const normalized = rule.trim().toLowerCase().replace(/[\s-]+/g, '_');
                    if (normalized === 'no_one' || normalized === 'nobody') {
                        return { mode: 'no_one', exceptUserIds: [] };
                    }
                    if (normalized === 'everyone_except' || normalized.startsWith('everyone_except_')) {
                        return { mode: 'everyone_except', exceptUserIds: [] };
                    }
                    return { mode: 'everyone', exceptUserIds: [] };
                }

                const mode = ['everyone', 'everyone_except', 'no_one'].includes(rule?.mode) ? rule.mode : 'everyone';
                const exceptUserIds = Array.isArray(rule?.exceptUserIds)
                    ? [...new Set(rule.exceptUserIds.map(id => String(id || '').trim()).filter(Boolean))]
                    : [];
                return { mode, exceptUserIds };
            };

            updateData.privacySettings = {
                ...(Object.fromEntries(visibilityKeys.map((key) => [key, sanitizeVisibilityRule(privacySettings?.[key])]))),
                typingIndicator: privacySettings?.typingIndicator !== false,
                whoCanMessageMe: sanitizeChoice(privacySettings?.whoCanMessageMe, ['Everyone', 'My Contacts', 'No One'], 'Everyone'),
                messageRequestsRequired: privacySettings?.messageRequestsRequired !== false,
                blockUnknown: privacySettings?.blockUnknown === true,
                whoCanAddMeToGroups: sanitizeChoice(privacySettings?.whoCanAddMeToGroups, ['Everyone', 'My Contacts', 'No One'], 'Everyone'),
                requireConsentBeforeForward: privacySettings?.requireConsentBeforeForward === true,
                forwardLimit: sanitizeNumberChoice(privacySettings?.forwardLimit, [1, 3, 5, 10], 5),
                notifyOnForward: privacySettings?.notifyOnForward === true,
                screenshotDetection: privacySettings?.screenshotDetection !== false,
                notifyOnScreenshot: privacySettings?.notifyOnScreenshot !== false,
                blurOnScreenshot: privacySettings?.blurOnScreenshot === true,
                addWatermark: privacySettings?.addWatermark === true,
                autoArchiveConversations: privacySettings?.autoArchiveConversations === true,
                clearChatDataEnabled: privacySettings?.clearChatDataEnabled === true
            };
        }

        console.log('[PROFILE UPDATE] Updating with:', updateData);
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { returnDocument: 'after' });

        if (!updatedUser) {
            console.error('[PROFILE UPDATE] User not found for ID:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('[PROFILE UPDATE] Successfully updated user:', updatedUser._id);

        if (req.io) {
            req.io.to(updatedUser._id.toString()).emit('user_profile_updated', {
                userId: updatedUser._id,
                name: updatedUser.name,
                displayName: updatedUser.displayName || updatedUser.name,
                mobile: updatedUser.mobile,
                about: updatedUser.about,
                privacySettings: updatedUser.privacySettings
            });
            req.io.emit('user_profile_updated', {
                userId: updatedUser._id,
                name: updatedUser.name,
                displayName: updatedUser.displayName || updatedUser.name,
                mobile: updatedUser.mobile,
                about: updatedUser.about,
                privacySettings: updatedUser.privacySettings
            });
        }

        res.json({
            message: 'Profile updated successfully',
            user: updatedUser.toObject()
        });
    } catch (err) {
        console.error('[PROFILE UPDATE] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
