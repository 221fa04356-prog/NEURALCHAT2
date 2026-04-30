const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const ChatDeletion = require('../models/ChatDeletion');
const PasswordReset = require('../models/PasswordReset');
const Community = require('../models/Community');
const ReactionLog = require('../models/ReactionLog'); // Import ReactionLog model for audit
const ChatActionLog = require('../models/ChatActionLog');
const { sendEmail } = require('../utils/emailService');
const sendBrevoMail = require('../brevoMailer');
const crypto = require('crypto');
const getClientBaseUrl = require('../utils/getClientBaseUrl');

const generateSignature = (password) => {
    // HMAC SHA256 with Global Secret (Pepper)
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(password)
        .digest('hex');
};

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
            const html = `
                <h3>Welcome to NeuralChat</h3>
                <p>Your account has been approved.</p>
                <p><strong>Login ID:</strong> ${loginId}</p>
                <p><strong>Password:</strong> ${password}</p>
                <p>Reset your password using below link</p>
                <p><a href="${baseUrl}/reset">Reset Here</a></p>
            `;
            console.log(`Attempting to send approval email to: ${user.email}`);
            await sendBrevoMail(user.email, subject, html, true).catch(err => {
                console.error('Failed to send user approval email:', err);
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
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

            const html = `
                <h3>Temporary Password</h3>
                <p>You have been allocated with Temporary Password by the admin.</p>
                <p><strong>Temporary Password:</strong> ${newPassword}</p>
                <p>Reset your password using below link</p>
                <p><a href="${baseUrl}/reset?token=${signature}&id=${user._id}">Reset Here</a></p>
            `;
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
router.delete('/chat/messages/delete', async (req, res) => {
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
router.get('/chat/contacts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Find all unique people this user has messaged or received messages from
        const sentTo = await Message.distinct('receiver_id', { user_id: userId, receiver_id: { $ne: null } });
        const receivedFrom = await Message.distinct('user_id', { receiver_id: userId });

        // Merge and unique IDs
        const contactIds = [...new Set([...sentTo.map(id => id.toString()), ...receivedFrom.map(id => id.toString())])];

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
router.get('/chat/dates/:userId/:otherUserId', async (req, res) => {
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
                const dates = [...new Set(groupMessages.map(m => m.created_at.toISOString().split('T')[0]))];
                return res.json(dates);
            } else {
                query = {
                    $or: [
                        { user_id: userId, receiver_id: otherUserId },
                        { user_id: otherUserId, receiver_id: userId }
                    ]
                };
                const messages = await Message.find(query).select('created_at').sort({ created_at: -1 });
                const dates = [...new Set(messages.map(m => m.created_at.toISOString().split('T')[0]))];
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
        const [blockCount, reportCount, blockMembers, reportMembers] = await Promise.all([
            ChatActionLog.countDocuments({ action: 'block' }),
            ChatActionLog.countDocuments({ action: 'report' }),
            ChatActionLog.distinct('actor_id', { action: 'block' }),
            ChatActionLog.distinct('actor_id', { action: 'report' })
        ]);

        const metrics = {
            totalUsers: await User.countDocuments({
                role: { $ne: 'admin' },
                status: 'approved',
                login_id: { $exists: true, $ne: null }
            }),
            pendingApprovals: await User.countDocuments({ status: 'pending', role: 'user' }),
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
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: thirtyDaysAgo }, action: 'block' }, "%Y-%m-%d"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: thirtyDaysAgo }, action: 'report' }, "%Y-%m-%d"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: twelveMonthsAgo }, action: 'block' }, "%Y-%m"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: twelveMonthsAgo }, action: 'report' }, "%Y-%m"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: tenYearsAgo }, action: 'block' }, "%Y"),
            aggregateByPeriod(ChatActionLog, { created_at: { $gte: tenYearsAgo }, action: 'report' }, "%Y")
        ]);

        const actionPeopleRaw = await ChatActionLog.aggregate([
            {
                $group: {
                    _id: { actor_id: '$actor_id', action: '$action' },
                    count: { $sum: 1 },
                    lastActionAt: { $max: '$created_at' }
                }
            },
            { $lookup: { from: 'users', localField: '_id.actor_id', foreignField: '_id', as: 'actor' } },
            { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } },
            { $sort: { count: -1, lastActionAt: -1 } }
        ]);

        const actionActorIds = [...new Set(actionPeopleRaw.map(row => String(row._id.actor_id)).filter(Boolean))];
        const actionActors = await User.find({ _id: { $in: actionActorIds } }).select('name login_id __enc_name');
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

        const actionContainers = ['block', 'report'].map(action => {
            const people = actionPeople.filter(item => item.action === action);
            return {
                key: action,
                label: action === 'block' ? 'Block Actions' : 'Report Actions',
                total: action === 'block' ? blockCount : reportCount,
                members: action === 'block' ? blockMembers.length : reportMembers.length,
                people
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
            actionContainers
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

router.get('/chat/history-filtered', async (req, res) => {
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

        // --- Enrich messages with reaction history (Audit Trail) ---
        const messageIds = messages.map(m => m._id);
        const reactionLogs = await ReactionLog.find({ message_id: { $in: messageIds } })
            .populate('user_id', 'name __enc_name')
            .sort({ timestamp: 1 });

        const historyWithAudit = messages.map(m => {
            const mObj = m.toObject ? m.toObject() : m;
            mObj.reaction_history = reactionLogs.filter(log => String(log.message_id) === String(mObj._id));
            return mObj;
        });

        // Check if user has deleted this contact
        const deletions = await ChatDeletion.find({
            userId: userId,
            contactId: otherUserId
        }).populate('userId', 'name __enc_name').sort({ deletedAt: 1 });

        const enrichedMessages = [...historyWithAudit];

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
            // Re-sort by created_at since we added messages
            enrichedMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }

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
