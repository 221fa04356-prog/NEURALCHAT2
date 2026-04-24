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
const UnethicalLog = require('../models/UnethicalLog');


const JWT_SECRET = process.env.JWT_SECRET;
const MIN_VALID_AUDIO_BYTES = 1024; // Only flag extremely tiny blobs as suspicious
const { handleMembershipJoin, handleMembershipExit } = require('../utils/membership');
const axios = require('axios');
const { uploadLocalFileToGridFS } = require('../utils/gridfsMedia');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const badWords = ['damn', 'idiot', 'stupid', 'hate', 'kill', 'abuse', 'fuck', 'shit', 'bastard', 'asshole']; // Precise bad words

const inferTypeFromUrl = (rawUrl = '') => {
    const url = String(rawUrl || '').toLowerCase();
    if (!url) return 'text';
    if (/\.(mp3|m4a|wav|ogg|webm)(\?|$)/.test(url) || url.includes('/voice_messages/')) return 'audio';
    if (/\.(mp4|mov|avi|mkv)(\?|$)/.test(url) || url.includes('/video/upload/')) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(url) || url.includes('/image/upload/')) return 'image';
    return 'file';
};

const checkUnethicalWithAI = async (text) => {
    if (!text) return { isUnethical: false };
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "Analyze this message for unethical content (hate speech, harassment, explicit violence, self-harm, sexual content). Return ONLY a JSON object: { \"isUnethical\": boolean, \"reason\": \"short reason\" }." },
                { role: "user", content: text }
            ],
            model: "llama-3.3-70b-versatile",
        });
        const content = completion.choices[0]?.message?.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { isUnethical: false };
    } catch (e) {
        console.error("AI Moderation Error:", e);
        return { isUnethical: false };
    }
};

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
        // 0. Get current user's favorites and name overrides once
        const currentUserObj = await User.findById(userId).select('favorites nameOverrides');
        const userFavorites = currentUserObj?.favorites || [];
        const nameOverrides = currentUserObj?.nameOverrides || new Map();

        const groups = await Group.find({
            $or: [{ members: userId }, { removedMembers: userId }],
            isAnnouncementGroup: { $ne: true }
        })
            .populate('members', 'name email _id isOnline lastSeen __enc_name __enc_email')
            .populate('admin', 'name _id __enc_name')
            .sort({ created_at: -1 });

        // Enrich each group with last message and unread count
        const enriched = await Promise.all(groups.map(async (g) => {
            // Apply overrides to members
            if (g.members) {
                g.members.forEach(m => {
                    const customName = nameOverrides instanceof Map ? nameOverrides.get(String(m._id)) : nameOverrides[String(m._id)];
                    if (customName) m.name = customName;
                });
            }
            if (g.admin) {
                const customAdminName = nameOverrides instanceof Map ? nameOverrides.get(String(g.admin._id)) : nameOverrides[String(g.admin._id)];
                if (customAdminName) g.admin.name = customAdminName;
            }

            const lastMsg = await GroupMessage.findOne({
                group_id: g._id,
                deleted_for: { $ne: userId }
            })
                .sort({ created_at: -1 })
                .populate('sender_id', 'name __enc_name')
                .then(r => {
                    if (r && r.sender_id) {
                        const customSenderName = nameOverrides instanceof Map ? nameOverrides.get(String(r.sender_id._id)) : nameOverrides[String(r.sender_id._id)];
                        if (customSenderName) r.sender_id.name = customSenderName;
                    }
                    return r ? r.toObject() : null;
                });

            const userIdObj = new mongoose.Types.ObjectId(userId);
            
            // Check if the current user is a joined member (member, admin, or creator)
            const isMem = (g.members || []).some(m => String(m._id || m) === String(userId));
            const isGrpAdmin = (g.admins || []).some(a => String(a?._id || a) === String(userId));
            const isCreatorMatch = String(g.admin?._id || g.admin) === String(userId);
            
            // A user is only active if they are in the members array.
            const isJoined = isMem || isGrpAdmin || (isCreatorMatch && isMem);

            let unreadCount = 0;
            if (isJoined) {
                // Find user's visibleFrom for this group
                const history = (g.userHistory || g.toObject?.().userHistory || []).find(h => String(h.user) === String(userId));
                const visibleFrom = history?.visibleFrom || new Date(0);

                unreadCount = await GroupMessage.countDocuments({
                    group_id: g._id,
                    sender_id: { $ne: userIdObj },
                    read_by: { $ne: userIdObj },
                    is_system: { $ne: true },
                    created_at: { $gte: visibleFrom }
                });
            }

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

        const currentUserObj = await User.findById(userId).select('nameOverrides');
        const nameOverrides = currentUserObj?.nameOverrides || new Map();

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
            if (m.sender_id) {
                const customName = nameOverrides instanceof Map ? nameOverrides.get(String(m.sender_id._id)) : nameOverrides[String(m.sender_id._id)];
                if (customName) m.sender_id.name = customName;
            }
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
        const isAdmin = (group.admins || []).some(a => String(a) === String(senderId));

        if (isRemoved && !isMem && !isOwner && !isAdmin) {
            return res.status(403).json({ error: 'You have been removed from this group and cannot send polls.' });
        }

        if (!isMem && !isOwner && !isAdmin) {
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
// POST /api/groups/event/send - Send a group event message
router.post('/event/send', authenticateToken, async (req, res) => {
    try {
        const { groupId, eventData } = req.body;
        const senderId = req.user.id;

        if (!groupId) return res.status(400).json({ error: 'Group ID required' });
        if (!eventData || !eventData.name) return res.status(400).json({ error: 'Event name required' });

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(senderId));
        const isOwner = String(group.admin) === String(senderId);
        const isAdmin = (group.admins || []).some(a => String(a) === String(senderId));

        if (!isMem && !isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        const msg = await GroupMessage.create({
            group_id: groupId,
            sender_id: senderId,
            role: 'user',
            content: eventData.name,
            type: 'event',
            event: {
                ...eventData,
                participants: [senderId] // Creator is participant
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
        console.error('[EVENT SEND GROUP]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/event/:messageId/respond - Respond to a group event
router.post('/event/:messageId/respond', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body; // 'Going', 'Maybe', 'Not going'
        const userId = req.user.id;
        const userObjId = new mongoose.Types.ObjectId(userId);

        if (!['Going', 'Maybe', 'Not going'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const msg = await GroupMessage.findById(messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        // Update participants array for backward compatibility
        msg.event.participants = (msg.event.participants || []).filter(id => String(id) !== String(userId));
        if (status === 'Going') {
            msg.event.participants.push(userObjId);
        }

        // Update responses array
        msg.event.responses = msg.event.responses || [];
        const responseIdx = msg.event.responses.findIndex(r => String(r.user_id) === String(userId));
        if (responseIdx >= 0) {
            msg.event.responses[responseIdx].status = status;
            msg.event.responses[responseIdx].updated_at = new Date();
        } else {
            msg.event.responses.push({ user_id: userObjId, status, updated_at: new Date() });
        }

        // Maintain response history (avoid duplicates if same status)
        msg.event.response_history = msg.event.response_history || [];
        const lastUserResponse = [...msg.event.response_history].reverse().find(h => String(h.user_id) === String(userId));
        
        if (!lastUserResponse || lastUserResponse.status !== status) {
            msg.event.response_history.push({
                user_id: userObjId,
                status,
                timestamp: new Date()
            });
        }

        msg.markModified('event');
        await msg.save();

        const msgObj = msg.toObject();

        if (req.io) {
            const group = await Group.findById(msg.group_id);
            if (group) {
                group.members.forEach(memberId => {
                    req.io.to(memberId.toString()).emit('event_responded', {
                        messageId: msg._id,
                        event: msgObj.event,
                        isGroup: true,
                        groupId: String(msg.group_id)
                    });
                });
            }
            // Also notify admins
            req.io.to('admins').emit('event_responded', {
                messageId: msg._id,
                event: msgObj.event,
                isGroup: true,
                groupId: String(msg.group_id)
            });
        }
        
        res.json({ status: 'success', event: msgObj.event });
    } catch (err) {
        console.error('[EVENT RESPOND GROUP] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/event/:messageId/edit - Edit a group event
router.post('/event/:messageId/edit', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const msg = await GroupMessage.findById(messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        // Only creator can edit for now
        if (String(msg.sender_id) !== String(userId)) return res.status(403).json({ error: 'Not allowed' });

        const { name, description, location, startDate, startTime, endDate, endTime } = req.body;
        if (name) msg.event.name = name;
        if (description !== undefined) msg.event.description = description;
        if (location !== undefined) msg.event.location = location;
        if (startDate !== undefined) msg.event.startDate = startDate;
        if (startTime !== undefined) msg.event.startTime = startTime;
        if (endDate !== undefined) msg.event.endDate = endDate;
        if (endTime !== undefined) msg.event.endTime = endTime;

        msg.markModified('event');
        await msg.save();

        const msgObj = msg.toObject();

        if (req.io) {
            const group = await Group.findById(msg.group_id);
            if (group) {
                group.members.forEach(memberId => {
                    req.io.to(memberId.toString()).emit('event_updated', { messageId: msg._id, event: msgObj.event, isGroup: true, groupId: String(msg.group_id) });
                });
            }
            // Also notify admins
            req.io.to('admins').emit('event_updated', { messageId: msg._id, event: msgObj.event, isGroup: true, groupId: String(msg.group_id) });
        }

        res.json({ status: 'success', event: msgObj.event });
    } catch (err) {
        console.error('[EVENT EDIT GROUP] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/groups/event/:messageId/cancel - Cancel a group event
router.post('/event/:messageId/cancel', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const msg = await GroupMessage.findById(messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        // Only creator can cancel for now
        if (String(msg.sender_id) !== String(userId)) return res.status(403).json({ error: 'Not allowed' });

        msg.event = msg.event || {};
        msg.event.cancelled = true;
        msg.event.cancelledBy = userId;
        msg.event.cancelledAt = new Date();
        msg.markModified('event');
        await msg.save();

        const msgObj = msg.toObject();

        if (req.io) {
            const group = await Group.findById(msg.group_id);
            if (group) {
                group.members.forEach(memberId => {
                    req.io.to(memberId.toString()).emit('event_updated', { messageId: msg._id, event: msgObj.event, isGroup: true, groupId: String(msg.group_id) });
                });
            }
            // Also notify admins
            req.io.to('admins').emit('event_updated', { messageId: msg._id, event: msgObj.event, isGroup: true, groupId: String(msg.group_id) });
        }

        // Create a system message in the group about cancellation
        const sysMsg = await GroupMessage.create({
            group_id: msg.group_id,
            sender_id: userId,
            role: 'system',
            type: 'system',
            is_system: true,
            content: `cancelled the event: ${msg.event.name}`
        });

        const populated = await GroupMessage.findById(sysMsg._id).populate('sender_id', 'name _id __enc_name');
        const sysObj = populated.toObject();

        if (req.io) {
            const group = await Group.findById(msg.group_id);
            if (group) {
                group.members.forEach(memberId => {
                    req.io.to(memberId.toString()).emit('group_message', { groupId: msg.group_id, message: sysObj });
                });
            }
        }

        res.json({ status: 'success', event: msgObj.event, system: sysObj });
    } catch (err) {
        console.error('[EVENT CANCEL GROUP] Error:', err);
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
        const isAdmin = (group.admins || []).some(a => String(a) === String(senderId));

        if (isRemoved && !isMem && !isOwner && !isAdmin) {
            return res.status(403).json({ error: 'You have been removed from this group and cannot send messages.' });
        }

        if (group.isAnnouncementGroup && !isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Only admins can send messages to this announcement group.' });
        }

        if (!isMem && !isOwner && !isAdmin) {
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

            // Guardrail: tiny audio blobs are suspicious, but do not block sending.
            if (type === 'audio' && fileSize < MIN_VALID_AUDIO_BYTES) {
                console.warn(`[GROUP AUDIO WARN] Very small audio blob received (${fileSize} bytes): ${file.originalname}`);
            }

            // Permanent durability: persist every uploaded attachment in Mongo GridFS.
            if (['audio', 'video', 'image', 'file'].includes(type)) {
                try {
                    const absPath = path.join(__dirname, '../uploads', file.filename);
                    const { fileId } = await uploadLocalFileToGridFS(absPath, file.originalname || file.filename, {
                        senderId,
                        groupId,
                        legacyPath: file_path,
                        mimeType: file.mimetype,
                        messageType: type
                    });
                    file_path = `/api/chat/media/file/${String(fileId)}`;
                } catch (gridErr) {
                    console.error('[GROUP GRIDFS UPLOAD ERROR]', gridErr);
                    return res.status(500).json({ error: 'Failed to store media permanently' });
                }
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
            type = type || inferTypeFromUrl(file_path);
            fileName = req.body.fileName;
            fileSize = req.body.fileSize;
            req.body.pageCount = req.body.pageCount || 0;
            req.body.thumbnail_path = req.body.thumbnail_path || null;
        }

        // --- PRE-SEND BLOCK CHECK ---
        const currentUserProfile = await User.findById(senderId);
        if (currentUserProfile && currentUserProfile.messagingBlocked) {
            return res.status(403).json({ 
                error: 'Messaging Blocked', 
                blocked: true,
                unblockRequested: currentUserProfile.unblockRequested 
            });
        }

        // === Global Safety & Ethics Check (AI-Driven) ===
        let isFlagged = false;
        let flagReason = "";

        if (content && content.length > 0) {
            const aiResult = await checkUnethicalWithAI(content);
            if (aiResult.isUnethical) {
                isFlagged = true;
                flagReason = aiResult.reason;
            }
        }

        if (isFlagged) {
            // Log violation and increment count
            const updatedUser = await User.findById(senderId);
            const count = (updatedUser.unethicalCount || 0) + 1;
            await User.findByIdAndUpdate(senderId, { $set: { unethicalCount: count } });

            // Create entry for admin dashboard
            await UnethicalLog.create({
                user_id: senderId,
                content: content || 'Group Media/File',
                reason: flagReason,
                type: content && badWords.some(word => content.toLowerCase().includes(word)) ? 'direct' : 'indirect'
            });

            // Check if this violation pushes them over the limit
            if (count > 5) {
                await User.findByIdAndUpdate(senderId, { $set: { messagingBlocked: true } });
                
                // Emit socket event for real-time blocking
                if (req.io) {
                    req.io.to(senderId).emit('user_blocked', { blocked: true });
                }
            }
        }

        // Detect URL for preview
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = content ? content.match(urlRegex) : null;
        let linkPreview = null;
        if (urlMatch && type !== 'image' && type !== 'video') {
            linkPreview = await fetchLinkPreview(urlMatch[0]);
        }

        let eventData = req.body.event;
        if (typeof eventData === 'string') {
            try { eventData = JSON.parse(eventData); } catch (e) { eventData = null; }
        }
        let pollData = req.body.poll;
        if (typeof pollData === 'string') {
            try { pollData = JSON.parse(pollData); } catch (e) { pollData = null; }
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
            duration: Number(req.body.duration || 0),
            is_view_once: is_view_once === 'true' || is_view_once === true,
            is_forwarded: isForwarded === true || isForwarded === 'true',
            forward_count: forward_count || 0,
            
            // E2EE fields
            ciphertext: req.body.ciphertext,
            sender_key_id: req.body.sender_key_id,

            // Forwarded Data
            event: eventData || undefined,
            poll: pollData || undefined
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
            const group = await Group.findById(msg.group_id);
            if (group) {
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

// Mark group messages as unread
router.post('/:groupId/messages/mark-unread', authenticateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const userIdObj = new mongoose.Types.ObjectId(userId);

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const isMem = (group.members || []).some(m => String(m) === String(userId));
        const isRem = (group.removedMembers || []).some(m => String(m) === String(userId));

        if (!isMem && !isRem) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        // Find messages in this group that WERE read by this user
        // Usually we unread the most recent batch or just all of them to trigger grey ticks
        const messagesToUnread = await GroupMessage.find({
            group_id: groupId,
            read_by: userIdObj
        });

        if (messagesToUnread.length > 0) {
            const messageIds = messagesToUnread.map(m => m._id);

            // 1. Remove user from reading lists
            await GroupMessage.updateMany(
                { _id: { $in: messageIds } },
                {
                    $pull: { 
                        read_by: userIdObj,
                        read_details: { user_id: userIdObj }
                    }
                }
            );

            // 2. Check each message to see if it should no longer be 'is_read: true'
            // We do this by checking the new read_by counts
            const requiredReads = (group.members || []).length - 1;
            
            // Recalculate is_read for these messages
            const updatedMessages = await GroupMessage.find({ _id: { $in: messageIds } });
            const noLongerFullyReadIds = updatedMessages
                .filter(m => !m.read_by || m.read_by.length < requiredReads)
                .map(m => m._id);

            if (noLongerFullyReadIds.length > 0) {
                await GroupMessage.updateMany(
                    { _id: { $in: noLongerFullyReadIds } },
                    { $set: { is_read: false } }
                );

                // Notify all members about the change back to grey ticks
                if (req.io) {
                    group.members.forEach(memberId => {
                        req.io.to(memberId.toString()).emit('group_messages_unread', {
                            groupId,
                            messageIds: noLongerFullyReadIds,
                            readerId: userId
                        });
                    });
                }
            }
        }

        res.json({ success: true, count: messagesToUnread.length });
    } catch (err) {
        console.error('[MARK_UNREAD_GROUP] Error:', err);
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
