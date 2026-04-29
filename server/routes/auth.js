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


const generateSignature = (password) => {
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(password)
        .digest('hex');
};

const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '';
    const [name, domain] = email.split('@');
    if (!name) return `***@${domain}`;
    if (name.length <= 2) return `${name[0]}*@${domain}`;
    return `${name.slice(0, 2)}***@${domain}`;
};

const JWT_SECRET = process.env.JWT_SECRET;

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
    if (!mobileRegex.test(mobile)) return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    try {
        // Check duplicates
        const existing = await User.findOne({ $or: [{ email }, { mobile }, { name }] });
        if (existing) {
            let field = 'details';
            if (existing.email === email) field = 'email';
            else if (existing.mobile === mobile) field = 'mobile number';
            else if (existing.name === name) field = 'name';

            const role = existing.role === 'admin' ? 'Admin' : 'User';
            return res.status(400).json({ error: `${role} with this ${field} already exists` });
        }

        // Insert as pending
        const newUser = await User.create({ name, displayName: name, email, mobile, countryCode, designation, status: 'pending', is_temporary_password: false });

        // Emit Socket Event
        if (req.io) {
            const userPayload = {
                id: newUser._id.toString(),
                name: newUser.name,
                email: newUser.email,
                mobile: newUser.mobile,
                designation: newUser.designation,
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
            const html = `
                <h3>New User Registration</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Job Position:</strong> ${designation || 'N/A'}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Mobile:</strong> ${countryCode} ${mobile}</p>
                <p>Please login to the admin dashboard to approve this user.</p>
            `;
            sendBrevoMail(adminEmail, subject, html, true).catch(err => console.error('Failed to send admin email:', err));
        }

        // Email User
        if (email) {
            const userSubject = 'Registration Request Received';
            const userHtml = `
                <h3>Registration Successful</h3>
                <p>Hi ${name},</p>
                <p>Your registration request has been submitted successfully to the admin team.</p>
                <p>We will notify you once your account has been approved and your login details are generated.</p>
                <p>Thank you for choosing NeuralChat.</p>
            `;
            sendBrevoMail(email, userSubject, userHtml, true).catch(err => console.error('Failed to send user registration email:', err));
        }

        res.json({ message: 'Registration requested. Wait for admin approval.' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, loginId, password, force } = req.body;

    let query = {};
    if (email) query.email = email;
    else if (loginId) query.login_id = loginId;
    else return res.status(400).json({ error: 'Missing Login ID or Email' });

    try {
        const user = await User.findOne(query);
        if (!user) return res.status(400).json({ error: 'User not found' });

        if (user.status !== 'approved') {
            return res.status(403).json({ error: 'Account not approved yet' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

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
        let query = {};
        if (email) query.email = email;
        else if (loginId) query.login_id = loginId;

        const user = await User.findOne(query);
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
            const html = `
                <h3>Password Reset Requested</h3>
                <p><strong>User:</strong> ${user.name}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Login ID:</strong> ${user.login_id}</p>
                <p>Please login to the admin dashboard to resolve this request.</p>
            `;
            jobs.push(
                sendBrevoMail(adminEmail, subject, html, true).then(() => ({ type: 'admin', ok: true })).catch((err) => ({ type: 'admin', ok: false, error: err?.message || 'Failed to send admin email' }))
            );
        }

        if (user.email) {
            const userSubject = 'Password Reset Request Received';
            const userHtml = `
                <h3>We received your password reset request</h3>
                <p>Hi ${user.name},</p>
                <p>Your request has been submitted to the admin team for approval.</p>
                <p><strong>Login ID:</strong> ${user.login_id}</p>
                <p>You will receive updated login details once your request is processed.</p>
            `;
            
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
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists' });

        // Check Password Uniqueness
        const signature = generateSignature(password);
        if (await User.findOne({ password_signature: signature })) {
            return res.status(400).json({ error: 'Password already used by another user.' });
        }

        const hash = await bcrypt.hash(password, 10);

        await User.create({
            name,
            displayName: name,
            email,
            password: hash,
            password_signature: signature,
            role: 'admin',
            status: 'approved',
            mobile,
            countryCode
        });

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
            const adminUser = await User.findOne({ email, role: 'admin' });
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
        const adminUser = await User.findOne({ email, role: 'admin' });
        if (passExists && (!adminUser || passExists.id !== adminUser.id)) {
            return res.status(400).json({ error: 'Password already used by another user.' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        const result = await User.updateOne(
            { email: email, role: 'admin' },
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
        const html = `
            <h3>Password Reset Successful</h3>
            <p>Dear ${user.name},</p>
            <p>Your password has been successfully reset.</p>
            <p><strong>Login ID:</strong> ${user.login_id}</p>
            <p><strong>New Password:</strong> ${newPassword}</p>
            <p>Please keep this information secure and login to your account.</p>
            <br>
            <p>You can login here: <a href="${baseUrl}/?showLogin=true&token=${signature}&id=${user._id}">Login Here</a></p>
            <br>
        `;

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
            let query = {};
            if (context.includes('admin') || identifier.includes('@')) query.email = identifier;
            else query.login_id = identifier;

            user = await User.findOne(query); // Assign to the declared user variable
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (!user.mobile) return res.status(400).json({ error: 'No mobile number registered to this account' });
            finalMobile = user.mobile;
        }

        if (!finalMobile) return res.status(400).json({ error: 'Mobile number is required' });

        // Clean mobile number - extract last 10 digits
        const cleanMobile = finalMobile.replace(/\D/g, '').slice(-10);
        if (cleanMobile.length !== 10) return res.status(400).json({ error: 'Invalid mobile number length' });

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
    const { userId, name, about, mobile, countryCode, privacySettings } = req.body;
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
        if (mobile !== undefined) {
            // Basic mobile validation match register logic: strictly 10 digits
            if (!/^\d{10}$/.test(mobile)) {
                console.error('[PROFILE UPDATE] Invalid mobile format:', mobile);
                return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
            }
            // Check if mobile matches someone else
            const existing = await User.findOne({ mobile, _id: { $ne: userId } });
            if (existing) {
                console.error('[PROFILE UPDATE] Mobile already in use by:', existing._id);
                return res.status(400).json({ error: 'Mobile number already used by another account' });
            }
            updateData.mobile = mobile;
        }

        if (privacySettings !== undefined) {
            const visibilityKeys = ['lastSeen', 'onlineStatus', 'profilePhoto', 'about', 'status', 'readReceipts'];
            const sanitizeChoice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
            const sanitizeNumberChoice = (value, allowed, fallback) => {
                const normalized = Number(value);
                return allowed.includes(normalized) ? normalized : fallback;
            };
            const sanitizeVisibilityRule = (rule) => {
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
                addWatermark: privacySettings?.addWatermark === true
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
