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
const { handleMembershipJoin, handleMembershipExit } = require('../utils/membership');
const axios = require('axios');

// --- Link Preview Helper ---
const fetchLinkPreview = async (url) => {
    try {
        // Special handling for YouTube
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYouTube) {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const res = await axios.get(oembedUrl, { timeout: 5000 });
            return {
                title: res.data.title,
                description: res.data.author_name,
                image: res.data.thumbnail_url,
                url: url,
                domain: 'youtube.com'
            };
        }

        // Generic Metadata Extraction
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000
        });
        const html = response.data;

        const getMetaTag = (html, property) => {
            const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
            let match = html.match(regex);
            if (!match) {
                const regexName = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
                match = html.match(regexName);
            }
            return match ? match[1] : null;
        };

        const title = getMetaTag(html, 'og:title') || getMetaTag(html, 'twitter:title') || (html.match(/<title>(.*?)<\/title>/i) || [])[1];
        const description = getMetaTag(html, 'og:description') || getMetaTag(html, 'twitter:description') || getMetaTag(html, 'description');
        const image = getMetaTag(html, 'og:image') || getMetaTag(html, 'twitter:image');
        const domain = new URL(url).hostname;

        return { title, description, image, url, domain };
    } catch (err) {
        console.error('Link preview error:', err.message);
        return null;
    }
};
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
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', // Videos
            'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-m4a' // Audio
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.doc', '.docx', '.pdf', '.mp4', '.avi', '.mkv', '.mov', '.mp3', '.m4a', '.ogg', '.wav', '.webm'];

        const isAllowedType = allowedTypes.includes(file.mimetype) ||
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('image/') ||
            file.mimetype.startsWith('audio/');

        if (isAllowedType && allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type (${file.mimetype}, ext: ${ext}). Only Images, PDFs, Word, Video, and Audio files are allowed.`));
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

        const group = new Group({
            name: name || '',
            icon: icon || null,
            members: [],
            admin: adminId,
            permissions: permissions || { editSettings: true, sendMessages: true }
        });

        handleMembershipJoin(group, allMembers);
        await group.save();

        console.log('[GROUP CREATE] Group created successfully:', group._id);

        // Populate members for response
        const populatedGroup = await Group.findById(group._id)
            .populate('members', 'name email _id isOnline lastSeen __enc_name __enc_email')
            .populate('admin', 'name _id __enc_name');

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
            .populate('members', 'name email _id isOnline lastSeen __enc_name __enc_email')
            .populate('admin', 'name _id __enc_name')
            .sort({ created_at: -1 });

        // Enrich each group with last message and unread count
        const enriched = await Promise.all(groups.map(async (g) => {
            const lastMsg = await GroupMessage.findOne({
                group_id: g._id,
                deleted_for: { $ne: userId }
            })
                .sort({ created_at: -1 })
                .populate('sender_id', 'name __enc_name')
                .then(r => r ? r.toObject() : null);

            const userIdObj = new mongoose.Types.ObjectId(userId);
            
            // Find user's visibleFrom for this group
            const history = (g.userHistory || g.toObject?.().userHistory || []).find(h => String(h.user) === String(userId));
            const visibleFrom = history?.visibleFrom || new Date(0);

            const unreadCount = await GroupMessage.countDocuments({
                group_id: g._id,
                sender_id: { $ne: userIdObj },
                read_by: { $ne: userIdObj },
                is_system: { $ne: true },
                created_at: { $gte: visibleFrom }
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
            .populate('members', 'name email _id isOnline lastSeen about mobile countryCode __enc_name __enc_email __enc_about __enc_mobile')
            .populate('admin', 'name _id __enc_name')
            .populate('admins', 'name _id __enc_name');

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

        // Find user's visibleFrom for this group
        const history = (group.userHistory || []).find(h => String(h.user) === String(userId));
        const visibleFrom = history?.visibleFrom || new Date(0);

        const messages = await GroupMessage.find({
            group_id: groupId,
            deleted_for: { $ne: userId },
            created_at: { $gte: visibleFrom }
        })
            .populate('sender_id', 'name _id __enc_name')
            .populate('read_by', 'name image _id')
            .populate('read_details.user_id', 'name image _id')
            .sort({ created_at: 1 });

        const enriched = messages.map(msg => {
            const m = msg.toObject();
            m.is_starred = (msg.starred_by || []).some(id => String(id) === String(userId));
            m.is_edited = msg.is_edited || false;
            return m;
        });
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/poll/send - Send a group poll message
router.post('/poll/send', authenticateToken, async (req, res) => {
    try {
        const { groupId, question, options, allowMultipleAnswers } = req.body;
        const senderId = req.user.id;

        if (!groupId) return res.status(400).json({ error: 'Group ID required' });
        if (!question || !question.trim()) return res.status(400).json({ error: 'Poll question required' });
        if (!options || options.length < 2) return res.status(400).json({ error: 'At least 2 options required' });

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(senderId));
        const isRemoved = (group.removedMembers || []).some(m => String(m) === String(senderId));
        const isOwner = String(group.admin) === String(senderId);

        if (isRemoved && !isMem && !isOwner) {
            return res.status(403).json({ error: 'You have been removed from this group and cannot send polls.' });
        }

        if (!isMem && !isOwner) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        const pollOptions = options.map(opt => ({ text: opt, voters: [] }));

        const msg = await GroupMessage.create({
            group_id: groupId,
            sender_id: senderId,
            role: 'user',
            content: question,
            type: 'poll',
            poll: {
                question,
                options: pollOptions,
                allowMultipleAnswers: allowMultipleAnswers !== false
            }
        });

        const populated = await GroupMessage.findById(msg._id).populate('sender_id', 'name _id __enc_name');
        const msgObj = populated.toObject();

        if (req.io) {
            group.members.forEach(memberId => {
                req.io.to(memberId.toString()).emit('group_message', {
                    groupId,
                    message: msgObj
                });
            });
        }

        res.json({ status: 'sent', message: msgObj });
    } catch (err) {
        console.error('[POLL SEND GROUP]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/poll/:messageId/vote - Vote on a group poll
router.post('/poll/:messageId/vote', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { optionIndexes } = req.body;
        const userId = req.user.id;
        const userObjId = new mongoose.Types.ObjectId(userId);

        const msg = await GroupMessage.findById(messageId);
        if (!msg || msg.type !== 'poll') return res.status(404).json({ error: 'Poll not found' });

        const group = await Group.findById(msg.group_id);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const allowMultiple = msg.poll.allowMultipleAnswers;
        const indexes = Array.isArray(optionIndexes) ? optionIndexes : [optionIndexes];

        if (!allowMultiple && indexes.length > 1) {
            return res.status(400).json({ error: 'Multiple answers not allowed' });
        }

        // Remove user from all options first
        msg.poll.options.forEach(opt => {
            opt.voters = (opt.voters || []).filter(v => String(v) !== String(userId));
        });

        // Add vote to chosen options
        indexes.forEach(idx => {
            if (idx >= 0 && idx < msg.poll.options.length) {
                msg.poll.options[idx].voters.push(userObjId);
            }
        });

        msg.markModified('poll');
        await msg.save();

        const updated = await GroupMessage.findById(messageId);
        const msgObj = updated.toObject();

        if (req.io) {
            const notifyIds = new Set((group.members || []).map(id => id.toString()));
            if (group.admin) notifyIds.add(group.admin.toString());
            
            notifyIds.forEach(memberId => {
                req.io.to(memberId).emit('poll_voted', {
                    messageId,
                    poll: msgObj.poll,
                    isGroup: true,
                    groupId: String(msg.group_id)
                });
            });
        }

        res.json({ status: 'voted', poll: msgObj.poll });
    } catch (err) {
        console.error('[POLL VOTE GROUP]', err);
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
        let { content, type, file_path, fileName, fileSize, isForwarded, forward_count, is_view_once } = req.body;
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

            if (file.mimetype.startsWith('video/')) {
                type = 'video';
            } else if (file.mimetype.startsWith('audio/')) {
                type = 'audio';
            } else if (file.mimetype.startsWith('image/')) {
                type = 'image';
            } else {
                type = 'file';
            }

            // Extract page count for PDF
            if (file.mimetype === 'application/pdf') {
                try {
                    const dataBuffer = fs.readFileSync(path.join(__dirname, '../uploads', file.filename));
                    const pdfParse = require('pdf-parse');
                    if (typeof pdfParse === 'function') {
                        const data = await pdfParse(dataBuffer);
                        req.body.pageCount = data.numpages;
                    }
                } catch (e) {
                    console.error("Group PDF Page Count Failed", e);
                }
            }
        } else if (req.body.file_path) {
            // Forwarded file
            file_path = req.body.file_path;
            fileName = req.body.fileName;
            fileSize = req.body.fileSize;
            req.body.pageCount = req.body.pageCount || 0;
            req.body.thumbnail_path = req.body.thumbnail_path || null;
        }

        // Detect URL for preview
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = content ? content.match(urlRegex) : null;
        let linkPreview = null;
        if (urlMatch && type !== 'image' && type !== 'video') {
            linkPreview = await fetchLinkPreview(urlMatch[0]);
        }

        const msg = await GroupMessage.create({
            group_id: groupId,
            sender_id: senderId,
            content: content || '',
            type: type || 'text',
            file_path: file_path || null,
            fileName: fileName || null,
            fileSize: fileSize || 0,
            pageCount: req.body.pageCount || 0,
            thumbnail_path: req.body.thumbnail_path || null,
            link_preview: linkPreview,
            duration: req.body.duration,
            is_view_once: is_view_once === 'true' || is_view_once === true,
            is_forwarded: isForwarded === true || isForwarded === 'true',
            forward_count: forward_count || 0,
            
            // E2EE fields
            ciphertext: req.body.ciphertext,
            sender_key_id: req.body.sender_key_id
        });

        const populated = await GroupMessage.findById(msg._id)
            .populate('sender_id', 'name _id __enc_name');

        // Re-fetch to guarantee decryption before sending to socket/response
        const decryptedPopulated = await GroupMessage.findById(msg._id).populate('sender_id', 'name _id __enc_name');

        // Emit to all group members
        if (req.io) {
            group.members.forEach(memberId => {
                req.io.to(memberId.toString()).emit('group_message', {
                    groupId,
                    message: decryptedPopulated.toObject()
                });
            });
        }

        res.json({ status: 'sent', message: decryptedPopulated.toObject() });
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
        
        // RE-FETCH for decryption transparency
        const refreshed = await GroupMessage.findById(msg._id);
        const starred = refreshed ? (refreshed.starred_by || []) : (msg.starred_by || []);
        res.json({ status: 'success', is_starred: starred.includes(userId) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Edit Group Message - Secured with Auth
router.post('/message/:id/edit', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    try {
        const msg = await GroupMessage.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Group message not found' });

        // Permission check: only sender can edit
        if (msg.sender_id.toString() !== userId) {
            return res.status(403).json({ error: 'Unauthorized to edit this message' });
        }

        // Permission check: removed read restriction for now

        msg.content = content;
        msg.is_edited = true;
        msg.edited_at = new Date();
        await msg.save();

        // Notify participants via socket
        if (req.io) {
            const updatedMsg = await GroupMessage.findById(msg._id);
            group.members.forEach(mId => {
                req.io.to(mId.toString()).emit('group_message_edited', {
                    groupId: msg.group_id,
                    messageId: msg._id,
                    content: updatedMsg.content,
                    is_edited: true,
                    edited_at: msg.edited_at
                });
            });
        }

        res.json({
            status: 'success',
            messageId: msg._id,
            is_edited: true,
            content: msg.content
        });
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

        handleMembershipJoin(group, newMemberIds);
        await group.save();

        // SYNC WITH COMMUNITY
        // If this group belongs to a community, ensure members are added there too
        const Community = require('../models/Community');
        const community = await Community.findOne({ groups: groupId });
        if (community) {
            const idsObjToAdd = newMemberIds.map(id => new mongoose.Types.ObjectId(id));
            
            handleMembershipJoin(community, idsObjToAdd);
            await community.save();

            if (community.announcements) {
                const annGroup = await Group.findById(community.announcements);
                if (annGroup) {
                    handleMembershipJoin(annGroup, idsObjToAdd);
                    await annGroup.save();
                }
            }

            // Optional: notify about community member addition
            if (req.io) {
                const updatedComm = await Community.findById(community._id)
                    .populate('creator', 'name mobile countryCode _id __enc_name __enc_mobile')
                    .populate('members', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
                    .populate('admins', 'name mobile countryCode _id about __enc_name __enc_mobile __enc_about')
                    .populate('announcements', 'name icon _id members admin')
                    .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

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
            const populated = await Group.findById(groupId).populate('members', 'name image mobile about __enc_name __enc_mobile __enc_about');
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

// POST /api/groups/:groupId/join - Join a group (if permited, e.g. community member)
router.post('/:groupId/join', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const userObjId = new mongoose.Types.ObjectId(userId);

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        // Check if already a member
        if (group.members.some(m => String(m) === String(userId))) {
            return res.status(400).json({ error: 'Already a member' });
        }

        // Check if removed
        if (group.removedMembers?.some(m => String(m) === String(userId))) {
            return res.status(403).json({ error: 'You were removed from this group and cannot join.' });
        }

        // Check if group belongs to a community the user is in
        const Community = require('../models/Community');
        const community = await Community.findOne({ groups: groupId });
        
        if (!community) {
            return res.status(403).json({ error: 'This group is private and cannot be joined without an invite.' });
        }

        const isCommMem = (community.members || []).some(m => String(m) === String(userId));
        const isCommOwner = String(community.creator) === String(userId);
        const isCommAdmin = (community.admins || []).some(a => String(a) === String(userId));

        if (!(isCommMem || isCommOwner || isCommAdmin)) {
            return res.status(403).json({ error: 'You must be a member of the community to join its groups.' });
        }

        // Join allowed
        handleMembershipJoin(group, userObjId);
        await group.save();

        // System message
        const sysMsg = await GroupMessage.create({
            group_id: groupId,
            sender_id: userId,
            type: 'system',
            is_system: true,
            content: 'joined via community'
        });

        const populatedGroup = await Group.findById(groupId)
            .populate('members', 'name email _id isOnline lastSeen about mobile image __enc_name __enc_email __enc_about __enc_mobile')
            .populate('admin', 'name _id __enc_name')
            .populate('admins', 'name _id __enc_name');

        // Emit to all members
        if (req.io) {
            populatedGroup.members.forEach(m => {
                req.io.to(String(m._id)).emit('group_members_updated', {
                    groupId,
                    members: populatedGroup.members
                });
                
                // If it's the joining user, also notify them clearly
                if (String(m._id) === String(userId)) {
                    req.io.to(String(userId)).emit('group_joined', {
                        group: {
                            ...populatedGroup.toObject(),
                            isGroup: true
                        }
                    });
                }
            });
            
            // Also emit the system message
            populatedGroup.members.forEach(m => {
                req.io.to(String(m._id)).emit('group_message', {
                    groupId,
                    message: sysMsg
                });
            });
        }

        res.json({ status: 'success', group: populatedGroup });
    } catch (err) {
        console.error('[GROUP JOIN ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
