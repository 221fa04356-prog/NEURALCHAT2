const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'neural_secret_77';

// --- Multer Configuration (Sync with chat.js) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', // Images
            'application/pdf',         // PDF
            'application/msword',      // .doc
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'audio/webm', 'audio/mp4', 'audio/mp3', 'audio/mpeg', 'audio/ogg', // Audio
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm' // Videos
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.doc', '.docx', '.pdf', '.webm', '.mp3', '.m4a', '.ogg', '.mp4', '.avi', '.mkv', '.mov'];

        const isAllowedType = allowedTypes.includes(file.mimetype) ||
            file.mimetype.startsWith('audio/') ||
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('image/');

        if (isAllowedType && allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type (${file.mimetype}, ext: ${ext}). Only Images, PDFs, Word, Audio, and Video files are allowed.`));
        }
    }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        console.warn('[GROUPS AUTH] No token provided');
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('[GROUPS AUTH] Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }
        console.log('[GROUPS AUTH] Token verified for:', user.id);
        req.user = user;
        next();
    });
};

// POST /api/groups/create - Create a new group
router.post('/create', authenticateToken, async (req, res) => {
    try {
        console.log('[GROUP CREATE] req.body:', JSON.stringify(req.body, null, 2));
        const { name, icon, memberIds, permissions } = req.body;
        const adminId = req.user.id;

        if (!memberIds || memberIds.length === 0) {
            return res.status(400).json({ error: 'At least one member required' });
        }

        // Ensure admin is in members list and filter out any invalid IDs
        const allMembers = [...new Set([adminId, ...memberIds])].filter(id => id);

        console.log('[GROUP CREATE] Creating group with admin:', adminId, 'and members:', memberIds);

        const group = await Group.create({
            name: name || '',
            icon: icon || null,
            members: allMembers,
            admin: adminId,
            permissions: permissions || { editSettings: true, sendMessages: true }
        });

        console.log('[GROUP CREATE] Group created successfully:', group._id);

        // Populate members for response
        const populatedGroup = await Group.findById(group._id)
            .populate('members', 'name email _id isOnline lastSeen')
            .populate('admin', 'name _id');

        // Create the system message "group created"
        await GroupMessage.create({
            group_id: group._id,
            sender_id: adminId,
            type: 'system',
            is_system: true,
            content: 'created this group'
        });

        // Emit socket event to all members
        if (req.io) {
            allMembers.forEach(memberId => {
                if (memberId) {
                    req.io.to(memberId.toString()).emit('group_created', {
                        group: populatedGroup,
                        createdBy: adminId
                    });
                }
            });
        }

        res.json({ status: 'created', group: populatedGroup });
    } catch (err) {
        console.error('[GROUP CREATE ERROR] Full detail:', err);
        // Specifically check for validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation failed: ' + Object.keys(err.errors).map(k => err.errors[k].message).join(', ') });
        }
        res.status(500).json({ error: err.message || 'Internal server error in group creation' });
    }
});

// GET /api/groups/my-groups - Get all groups for current user
router.get('/my-groups', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // 0. Get current user's favorites once
        const currentUserObj = await User.findById(userId).select('favorites');
        const userFavorites = currentUserObj?.favorites || [];

        const groups = await Group.find({
            $or: [{ members: userId }, { removedMembers: userId }],
            isAnnouncementGroup: { $ne: true }
        })
            .populate('members', 'name email _id isOnline lastSeen')
            .populate('admin', 'name _id')
            .sort({ created_at: -1 });

        // Enrich each group with last message and unread count
        const enriched = await Promise.all(groups.map(async (g) => {
            const lastMsg = await GroupMessage.findOne({
                group_id: g._id,
                deleted_for: { $ne: userId }
            })
                .sort({ created_at: -1 })
                .populate('sender_id', 'name')
                .lean();

            // Calculate unread count for current user
            const userIdObj = new mongoose.Types.ObjectId(userId);
            const unreadCount = await GroupMessage.countDocuments({
                group_id: g._id,
                sender_id: { $ne: userIdObj },
                read_by: { $ne: userIdObj },
                is_system: { $ne: true }
            });

            return {
                ...g.toObject(),
                lastMessage: lastMsg,
                unreadCount,
                isGroup: true,
                isFavorite: userFavorites.some(favId => String(favId) === String(g._id))
            };
        }));

        res.json(enriched);
    } catch (err) {
        console.error('[MY GROUPS ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/groups/:groupId - Get single group metadata
router.get('/:groupId', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        const group = await Group.findById(groupId)
            .populate('members', 'name email _id isOnline lastSeen about mobile countryCode')
            .populate('admin', 'name _id')
            .populate('admins', 'name _id');

        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m._id || m) === String(userId));
        const isRem = (group.removedMembers || []).some(m => String(m._id || m) === String(userId));

        if (!isMem && !isRem) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        res.json(group);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/groups/:groupId/messages - Get messages for a group
router.get('/:groupId/messages', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Ensure user is a member or was a member
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(userId));
        const isRem = (group.removedMembers || []).some(m => String(m) === String(userId));

        if (!isMem && !isRem) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        const messages = await GroupMessage.find({
            group_id: groupId,
            deleted_for: { $ne: userId }
        })
            .populate('sender_id', 'name _id')
            .populate('read_by', 'name image _id')
            .populate('read_details.user_id', 'name image _id')
            .sort({ created_at: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/:groupId/send - Send a message to a group
router.post('/:groupId/send', authenticateToken, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        let { content, type, file_path, fileName, fileSize, duration, isForwarded, forward_count, is_view_once } = req.body;
        const senderId = req.user.id;
        const groupId = req.params.groupId;
        const file = req.file;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(senderId));
        const isRemoved = (group.removedMembers || []).some(m => String(m) === String(senderId));
        const isOwner = String(group.admin) === String(senderId);

        if (isRemoved && !isMem && !isOwner) {
            return res.status(403).json({ error: 'You have been removed from this group and cannot send messages.' });
        }

        if (!(group.members || []).some(m => String(m) === String(senderId))) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        // Handle physical file upload
        if (file) {
            file_path = '/uploads/' + file.filename;
            fileName = file.originalname;
            fileSize = file.size;

            if (req.body.type === 'audio' || file.mimetype.startsWith('audio/')) {
                type = 'audio';
            } else if (file.mimetype.startsWith('video/')) {
                type = 'video';
            } else if (file.mimetype.startsWith('image/')) {
                type = 'image';
            } else {
                type = 'file';
            }
        }

        const msg = await GroupMessage.create({
            group_id: groupId,
            sender_id: senderId,
            content: content || '',
            type: type || 'text',
            file_path: file_path || null,
            fileName: fileName || null,
            fileSize: fileSize || 0,
            duration: duration || 0,
            is_view_once: is_view_once === 'true' || is_view_once === true,
            is_forwarded: isForwarded === true || isForwarded === 'true',
            forward_count: forward_count || 0
        });

        const populated = await GroupMessage.findById(msg._id)
            .populate('sender_id', 'name _id');

        // Emit to all group members
        if (req.io) {
            group.members.forEach(memberId => {
                req.io.to(memberId.toString()).emit('group_message', {
                    groupId,
                    message: populated
                });
            });
        }

        res.json({ status: 'sent', message: populated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/groups/:groupId/name - Update group name
router.patch('/:groupId/name', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name } = req.body;
        const userId = req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (!(group.members || []).some(m => String(m) === String(userId))) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        group.name = name || '';
        await group.save();

        // Emit update to all members
        if (req.io) {
            group.members.forEach(memberId => {
                req.io.to(memberId.toString()).emit('group_updated', { groupId, name: group.name });
            });
        }

        res.json({ status: 'updated', group });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle Star for Group Message
router.post('/message/:id/toggle', authenticateToken, async (req, res) => {
    const { action, value } = req.body;
    const userId = req.user.id;

    try {
        const msg = await GroupMessage.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Group message not found' });

        if (action === 'star') {
            if (!msg.starred_by) msg.starred_by = [];
            const index = msg.starred_by.indexOf(userId);
            if (value && index === -1) {
                msg.starred_by.push(userId);
            } else if (!value && index > -1) {
                msg.starred_by.splice(index, 1);
            }
        }

        await msg.save();
        res.json({ status: 'success', is_starred: msg.starred_by.includes(userId) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark group messages as read
router.post('/:groupId/messages/mark-read', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(userId));
        const isRem = (group.removedMembers || []).some(m => String(m) === String(userId));

        if (!isMem && !isRem) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        // Find unread group messages not sent by the current user
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const messagesToUpdate = await GroupMessage.find({
            group_id: groupId,
            sender_id: { $ne: userIdObj },
            read_by: { $ne: userIdObj }
        });

        if (messagesToUpdate.length > 0) {
            const messageIds = messagesToUpdate.map(m => m._id);

            await GroupMessage.updateMany(
                { _id: { $in: messageIds } },
                {
                    $addToSet: { read_by: userIdObj },
                    $push: { read_details: { user_id: userIdObj, read_at: new Date() } }
                }
            );

            // Emit partial read to all members
            const messageIdStrings = messageIds.map(id => id.toString());
            if (req.io) {
                group.members.forEach(memberId => {
                    req.io.to(memberId.toString()).emit('group_message_partial_read', {
                        groupId: groupId.toString(),
                        messageIds: messageIdStrings,
                        readerId: userId.toString(),
                        readAt: new Date().toISOString()
                    });
                });
            }

            // Now check if any of these messages have been read by ALL members (except the sender)
            const requiredReads = group.members.length - 1;

            if (requiredReads > 0) {
                const updatedMessages = await GroupMessage.find({ _id: { $in: messageIds } });
                const fullyReadMsgIds = updatedMessages
                    .filter(m => m.read_by && m.read_by.length >= requiredReads)
                    .map(m => m._id);

                if (fullyReadMsgIds.length > 0) {
                    await GroupMessage.updateMany(
                        { _id: { $in: fullyReadMsgIds } },
                        { $set: { is_read: true } }
                    );

                    // Notify group members that these messages are fully read
                    if (req.io) {
                        group.members.forEach(memberId => {
                            req.io.to(memberId.toString()).emit('group_messages_read', {
                                groupId,
                                messageIds: fullyReadMsgIds,
                                readerId: userId
                            });
                        });
                    }
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/groups/:groupId/admin - Add or remove group admin
router.patch('/:groupId/admin', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { memberId, action } = req.body;
        const userId = req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        
        // Verify current user is a group admin
        const isAdmin = String(userId) === String(group.admin) || (group.admins || []).some(admin => String(admin) === String(userId));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Only admins can modify group admins' });
        }

        // Verify TARGET is a member
        if (!(group.members || []).some(m => String(m) === String(memberId))) {
            return res.status(400).json({ error: 'User is not a member of the group' });
        }
        
        // Cannot modify original creator
        if (String(memberId) === String(group.admin)) {
            return res.status(400).json({ error: 'Cannot modify permissions for group creator' });
        }

        if (!group.admins) group.admins = [];
        const isCurrentAdmin = group.admins.some(admin => String(admin) === String(memberId));

        if (action === 'add' && !isCurrentAdmin) {
            group.admins.push(memberId);
        } else if (action === 'remove' && isCurrentAdmin) {
            group.admins = group.admins.filter(a => String(a) !== String(memberId));
        }

        await group.save();

        if (req.io) {
            group.members.forEach(memId => {
                req.io.to(memId.toString()).emit('group_admin_updated', {
                    groupId,
                    memberId,
                    isAdmin: action === 'add'
                });
            });
        }

        res.json({ status: 'success', group });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/groups/:groupId/members - Add members to group
router.patch('/:groupId/members', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const { memberIds } = req.body;
        const userId = req.user.id;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        
        // Check if current user is an admin
        const isAdmin = String(userId) === String(group.admin) || (group.admins || []).some(admin => String(admin) === String(userId));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Only admins can add members' });
        }

        const newMemberIds = (memberIds || []).filter(id => !group.members.some(m => String(m) === String(id)));
        if (newMemberIds.length === 0) return res.json({ status: 'success', group });

        group.members.push(...newMemberIds);
        
        // remove from removedMembers if they were there
        if (group.removedMembers) {
            group.removedMembers = group.removedMembers.filter(m => !newMemberIds.some(id => String(id) === String(m)));
        }

        await group.save();

        // SYNC WITH COMMUNITY
        // If this group belongs to a community, ensure members are added there too
        const Community = require('../models/Community');
        const community = await Community.findOne({ groups: groupId });
        if (community) {
            const idsObjToAdd = newMemberIds.map(id => new mongoose.Types.ObjectId(id));
            
            await Community.updateOne(
                { _id: community._id },
                { 
                    $addToSet: { members: { $each: idsObjToAdd } },
                    $pull: { removedMembers: { $in: idsObjToAdd } }
                }
            );

            if (community.announcements) {
                await Group.updateOne(
                    { _id: community.announcements },
                    { 
                        $addToSet: { members: { $each: idsObjToAdd } },
                        $pull: { removedMembers: { $in: idsObjToAdd } }
                    }
                );
            }

            // Optional: notify about community member addition
            if (req.io) {
                const updatedComm = await Community.findById(community._id)
                    .populate('creator', 'name mobile countryCode _id')
                    .populate('members', 'name mobile countryCode _id about')
                    .populate('admins', 'name mobile countryCode _id about')
                    .populate('announcements', 'name icon _id members admin')
                    .lean();

                const communityData = { ...updatedComm, id: updatedComm._id, is_community: true };
                
                // Notify all members of community about update
                const allMembers = [
                    updatedComm.creator?._id || updatedComm.creator,
                    ...(updatedComm.members || []).map(m => m._id || m)
                ];
                allMembers.forEach(uid => {
                    req.io.to(uid.toString()).emit('community_updated', {
                        community: communityData
                    });
                });
            }
        }

        // Emit to all members
        if (req.io) {
            const populated = await Group.findById(groupId).populate('members', 'name image mobile about');
            group.members.forEach(m => {
                req.io.to(m.toString()).emit('group_members_updated', { 
                    groupId, 
                    members: populated.members 
                });
            });
        }

        res.json({ status: 'success', group });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
