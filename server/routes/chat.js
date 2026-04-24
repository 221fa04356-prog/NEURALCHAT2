const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const ChatDeletion = require('../models/ChatDeletion');
const User = require('../models/User'); // Import User model
const Group = require('../models/Group'); // Import Group model
const MessageRequest = require('../models/MessageRequest'); // Import MessageRequest model
const ReactionLog = require('../models/ReactionLog'); // Import ReactionLog model for audit logs
const Groq = require('groq-sdk');
const UnethicalLog = require('../models/UnethicalLog');
const pdfParse = require('pdf-parse'); // Renamed to avoid confusion
const mammoth = require('mammoth');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios'); // For link preview
const { uploadLocalFileToGridFS, streamGridFSFileWithRange } = require('../utils/gridfsMedia');
const cloudinaryUpload = require('../middleware/multer');
const { isCloudinaryConfigured } = require('../config/cloudinary');

const badWords = ['damn', 'idiot', 'stupid', 'hate', 'kill', 'abuse', 'fuck', 'shit', 'bastard', 'asshole']; // Precise bad words without substring issues

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const MIN_VALID_AUDIO_BYTES = 1024; // Only flag extremely tiny blobs as suspicious

const isTransientDbError = (err) => {
    const name = String(err?.name || '');
    const code = String(err?.code || '');
    const msg = String(err?.message || '').toLowerCase();
    return (
        name.includes('MongoNetworkError') ||
        name.includes('MongoServerSelectionError') ||
        name.includes('MongooseServerSelectionError') ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        msg.includes('topology was destroyed') ||
        msg.includes('server selection timed out') ||
        msg.includes('connection') && msg.includes('timed out')
    );
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

const checkUnethicalWithAI = async (text) => {
    if (!text) return { isUnethical: false };
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "Analyze this message for unethical content specifically hate speech, harassment, explicit violence, self-harm, or overt sexual content/slang. Return ONLY a JSON object: { \"isUnethical\": boolean, \"category\": \"Profanity|Sexual Content|Harassment|Unethical Conduct|Self-Harm\", \"reason\": \"A professional 1-sentence explanation of why it was flagged.\" }." },
                { role: "user", content: text }
            ],
            model: "llama-3.3-70b-versatile",
        });
        const content = completion.choices[0]?.message?.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const finalReason = parsed.category ? `${parsed.category}: ${parsed.reason}` : parsed.reason;
            return { isUnethical: !!parsed.isUnethical, reason: finalReason || "AI Detected Unethical Content" };
        }
        return { isUnethical: false, reason: "" };
    } catch (e) {
        console.error("AI Moderation Error:", e);
        return { isUnethical: false };
    }
};

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('[AUTH DEBUG] No token found');
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('[AUTH DEBUG] Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }
        console.log('[AUTH DEBUG] Token verified for user:', user.id);
        req.user = user;
        next();
    });
};

const verifyTokenFromRequest = (req) => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = bearer || req.query.token;
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (_) {
        return null;
    }
};

const isPrivateOrLocalHost = (host = '') => {
    const normalized = String(host || '').toLowerCase().split(':')[0];
    if (!normalized) return false;
    return normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '0.0.0.0'
        || normalized.startsWith('10.')
        || normalized.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
};

const allowDevMediaBypass = (req) => {
    if (process.env.NODE_ENV === 'production') return false;
    const candidates = [
        req.get('origin'),
        req.get('referer'),
        req.hostname,
        req.ip
    ].filter(Boolean);

    for (const value of candidates) {
        try {
            const host = /^https?:\/\//i.test(String(value))
                ? new URL(String(value)).hostname
                : String(value);
            if (isPrivateOrLocalHost(host)) return true;
        } catch (_) { }
    }

    return false;
};

const safeResolveMediaPath = (rawPath) => {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const uploadsRoot = path.resolve(__dirname, '../uploads');
    const normalized = rawPath
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/^\/+uploads\/?/i, '')
        .replace(/^\/+/, '');
    const resolved = path.resolve(uploadsRoot, normalized);
    if (!resolved.startsWith(uploadsRoot)) return null;
    return resolved;
};

const findByFilenameRecursive = (dir, filename) => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === filename) return full;
        if (entry.isDirectory()) {
            const found = findByFilenameRecursive(full, filename);
            if (found) return found;
        }
    }
    return null;
};

const streamFileWithRange = (req, res, absPath) => {
    const stat = fs.statSync(absPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(absPath).toLowerCase();
    const typeMap = {
        '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4',
        '.wav': 'audio/wav',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/x-m4v'
    };
    const contentType = typeMap[ext] || 'application/octet-stream';

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        const file = fs.createReadStream(absPath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=86400'
        });
        file.pipe(res);
        return;
    }

    res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400'
    });
    fs.createReadStream(absPath).pipe(res);
};

const inferTypeFromUrl = (rawUrl = '') => {
    const url = String(rawUrl || '').toLowerCase();
    if (!url) return 'text';
    if (/\.(mp3|m4a|wav|ogg|opus|webm)(\?|$)/.test(url) || url.includes('/voice_messages/')) return 'audio';
    if (/\.(mp4|mov|avi|mkv)(\?|$)/.test(url) || url.includes('/video/upload/')) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(url) || url.includes('/image/upload/')) return 'image';
    return 'file';
};

// Authenticated media endpoint with path recovery for legacy files.
router.get('/media', (req, res) => {
    const decoded = verifyTokenFromRequest(req);
    if (!decoded && !allowDevMediaBypass(req)) {
        return res.status(401).json({ error: 'Unauthorized media access' });
    }

    const requestedPath = req.query.path || '';
    const requestedName = req.query.name || '';
    const uploadsRoot = path.resolve(__dirname, '../uploads');

    let candidate = safeResolveMediaPath(requestedPath);
    if (!candidate && requestedName) {
        candidate = safeResolveMediaPath(`/uploads/${requestedName}`);
    }

    if (!candidate || !fs.existsSync(candidate)) {
        const fallbackName = requestedName || path.basename(String(requestedPath || ''));
        if (!fallbackName) {
            return res.status(404).json({ error: 'Media not found' });
        }
        const found = findByFilenameRecursive(uploadsRoot, fallbackName);
        if (!found) return res.status(404).json({ error: 'Media not found' });
        candidate = found;
    }

    try {
        streamFileWithRange(req, res, candidate);
    } catch (err) {
        console.error('[MEDIA STREAM ERROR]', err);
        return res.status(500).json({ error: 'Media stream failed' });
    }
});

router.get('/media/file/:id', (req, res) => {
    const decoded = verifyTokenFromRequest(req);
    if (!decoded && !allowDevMediaBypass(req)) {
        return res.status(401).json({ error: 'Unauthorized media access' });
    }
    return streamGridFSFileWithRange(req, res, req.params.id).catch((err) => {
        console.error('[GRIDFS MEDIA STREAM ERROR]', err);
        return res.status(500).json({ error: 'Media stream failed' });
    });
});

// Upload voice note to Cloudinary and return permanent URL.
router.post('/upload-audio', authenticateToken, (req, res, next) => {
    if (!isCloudinaryConfigured) {
        return res.status(503).json({ error: 'Cloudinary is not configured on server' });
    }
    cloudinaryUpload.single('audio')(req, res, (err) => {
        if (err) {
            console.error('[CLOUDINARY UPLOAD ERROR]', err);
            const status = err?.http_code || err?.statusCode || err?.status || 502;
            return res.status(status >= 400 && status < 600 ? status : 502).json({
                error: err.message || 'Audio upload failed'
            });
        }
        next();
    });
}, (req, res) => {
    if (!req.file || !req.file.path) {
        return res.status(400).json({ error: 'No audio file uploaded' });
    }
    const mimeType = String(req.file.mimetype || '');
    if (!mimeType.startsWith('audio/')) {
        return res.status(400).json({ error: 'Invalid upload type. Only audio is allowed.' });
    }

    return res.json({
        audioUrl: req.file.path,
        publicId: req.file.filename || req.file.public_id || null,
        mimeType
    });
});

// Resolve media by message id (robust fallback for stale/broken file URLs).
router.get('/media/message/:messageId', async (req, res) => {
    try {
        const decoded = verifyTokenFromRequest(req);
        if (!decoded && !allowDevMediaBypass(req)) {
            return res.status(401).json({ error: 'Unauthorized media access' });
        }
        req.user = decoded || req.user || {};

        const { messageId } = req.params;
        const wantsGroup = req.query.isGroup === 'true';
        const currentUserId = String(req.user?.id || '');

        let msg = null;
        let isGroupMsg = false;

        if (wantsGroup) {
            msg = await GroupMessage.findById(messageId).select('+__enc_file_path +__enc_fileName type file_path fileName group_id sender_id');
            isGroupMsg = !!msg;
        } else {
            msg = await Message.findById(messageId).select('+__enc_file_path +__enc_fileName type file_path fileName user_id receiver_id');
            if (!msg) {
                msg = await GroupMessage.findById(messageId).select('+__enc_file_path +__enc_fileName type file_path fileName group_id sender_id');
                isGroupMsg = !!msg;
            }
        }

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        if (isGroupMsg && currentUserId) {
            const group = await Group.findById(msg.group_id).select('members admin admins removedMembers');
            if (!group) return res.status(404).json({ error: 'Group not found' });
            const isMember = (group.members || []).some((m) => String(m) === currentUserId);
            const isOwner = String(group.admin) === currentUserId;
            const isAdmin = (group.admins || []).some((a) => String(a) === currentUserId);
            const wasMember = (group.removedMembers || []).some((m) => String(m) === currentUserId);
            if (!isMember && !isOwner && !isAdmin && !wasMember) {
                return res.status(403).json({ error: 'Not authorized for group media' });
            }
        } else if (currentUserId) {
            const isSender = String(msg.user_id) === currentUserId;
            const isReceiver = String(msg.receiver_id) === currentUserId;
            if (!isSender && !isReceiver) {
                return res.status(403).json({ error: 'Not authorized for media' });
            }
        }

        const rawPath = String(msg.file_path || '');
        const fileName = String(msg.fileName || '');
        if (!rawPath && !fileName) {
            const fallbackPath = String(req.query.legacyPath || req.query.path || '');
            const fallbackName = String(req.query.name || '');
            if (!fallbackPath && !fallbackName) {
                return res.status(404).json({ error: 'Media path not found' });
            }

            let candidate = safeResolveMediaPath(fallbackPath);
            if (!candidate && fallbackName) {
                candidate = safeResolveMediaPath(`/uploads/${fallbackName}`);
            }
            if (!candidate || !fs.existsSync(candidate)) {
                const found = findByFilenameRecursive(path.resolve(__dirname, '../uploads'), fallbackName || path.basename(fallbackPath));
                if (!found) return res.status(404).json({ error: 'Media not found' });
                candidate = found;
            }
            return streamFileWithRange(req, res, candidate);
        }

        // GridFS-backed route path
        if (/\/api\/chat\/media\/file\//i.test(rawPath)) {
            const idMatch = rawPath.match(/\/api\/chat\/media\/file\/([^/?#]+)/i);
            if (idMatch?.[1]) {
                req.query.name = req.query.name || fileName;
                req.query.legacyPath = req.query.legacyPath || rawPath;
                return streamGridFSFileWithRange(req, res, idMatch[1]).catch((err) => {
                    console.error('[MESSAGE MEDIA GRIDFS ERROR]', err);
                    return res.status(500).json({ error: 'Media stream failed' });
                });
            }
        }

        // Legacy uploads path fallback
        let candidate = safeResolveMediaPath(rawPath);
        if (!candidate && fileName) {
            candidate = safeResolveMediaPath(`/uploads/${fileName}`);
        }
        if ((!candidate || !fs.existsSync(candidate)) && req.query.legacyPath) {
            candidate = safeResolveMediaPath(String(req.query.legacyPath));
        }
        if ((!candidate || !fs.existsSync(candidate)) && req.query.name) {
            candidate = safeResolveMediaPath(`/uploads/${String(req.query.name)}`);
        }
        if (!candidate || !fs.existsSync(candidate)) {
            try {
                req.query.name = req.query.name || fileName;
                req.query.legacyPath = req.query.legacyPath || rawPath;
                return await streamGridFSFileWithRange(req, res, '');
            } catch (gridErr) {
                console.error('[MESSAGE MEDIA GRIDFS FALLBACK ERROR]', gridErr);
            }

            const fallbackLookupName = String(req.query.name || fileName || path.basename(rawPath));
            const found = findByFilenameRecursive(path.resolve(__dirname, '../uploads'), fallbackLookupName);
            if (!found) return res.status(404).json({ error: 'Media not found' });
            candidate = found;
        }

        return streamFileWithRange(req, res, candidate);
    } catch (err) {
        console.error('[MESSAGE MEDIA ERROR]', err);
        return res.status(500).json({ error: 'Media stream failed' });
    }
});

// Configure Multer
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
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/csv',
            'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-m4a', 'audio/opus'
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.doc', '.docx', '.docm', '.dot', '.dotx', '.rtf', '.odt',
            '.pdf', '.txt', '.csv',
            '.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.ods',
            '.ppt', '.pptx', '.pptm', '.pot', '.potx', '.pps', '.ppsx', '.odp',
            '.mp3', '.m4a', '.ogg', '.opus', '.wav', '.aac', '.flac',
            '.mp4', '.avi', '.mkv', '.mov', '.webm', '.m4v'
        ];

        const mime = (file.mimetype || '').toLowerCase();
        const isAllowedType = allowedTypes.includes(mime) ||
            file.mimetype.startsWith('audio/') ||
            file.mimetype.startsWith('video/') ||
            file.mimetype.startsWith('image/') ||
            mime === 'application/octet-stream';

        const isAllowedExt = allowedExts.includes(ext);
        // Allow by extension (source of truth list), and tolerate generic/octet-stream MIME.
        if (isAllowedExt || isAllowedType) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type (${file.mimetype}, ext: ${ext}). This file type is not supported.`));
        }
    }
});

// Get Chat History (AI Chat) - Kept open (No Auth) as per previous state, but AI Widget sends token anyway.
router.get('/history/:userId', async (req, res) => {
    try {
        const messages = await Message.find({
            user_id: req.params.userId,
            receiver_id: null // Only AI messages
        })
            .sort({ created_at: 1 })
            .populate('reply_to', 'content type file_path user_id sender_id');
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Current User Profile - Secured with Auth
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('name email mobile designation about role isOnline lastSeen bannedUntil rejectionCount adminLock messagingBlocked unblockRequested nameOverrides __enc_name __enc_email __enc_mobile __enc_designation __enc_about');
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Convert to plain object to modify response without affecting DB
        const userObj = user.toObject();
        
        // Apply self-override if it exists
        if (userObj.nameOverrides) {
            const myId = req.user.id.toString();
            const overrides = userObj.nameOverrides;
            
            // Mongoose Maps can be retrieved via .get() or via direct key access on plain objects
            let customName = null;
            if (overrides instanceof Map) {
                customName = overrides.get(myId);
            } else if (overrides && typeof overrides === 'object') {
                // Try both direct access and string key access
                customName = overrides[myId] || overrides[myId.toString()];
            }
            
            if (customName) {
                console.log(`[DEBUG] /me: Applying self-override for ${myId}: ${userObj.name} -> ${customName}`);
                userObj.name = customName;
            }
        }
        
        res.json(userObj);
    } catch (err) {
        console.error('[DEBUG] /me error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get All Users (for Contacts) - Secured with Auth
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // Base query: only approved users
        let query = { status: 'approved' };

        // If requester is a regular user, hide all admins
        if (currentUserRole !== 'admin') {
            query.role = { $ne: 'admin' };
        }

        const users = await User.find(query).select('name email mobile _id role about isOnline lastSeen messagingBlocked __enc_name __enc_email __enc_mobile __enc_about __enc_designation');
        console.log(`[DEBUG] /users: Found ${users.length} raw users for requester ${currentUserId} (Role: ${currentUserRole})`);

        if (!currentUserId) {
            console.log(`[DEBUG] /users: No currentUserId, returning raw users`);
            return res.json(users);
        }

        // 0. Get current user's favorites and name overrides once
        const currentUserObj = await User.findById(currentUserId).select('favorites nameOverrides');
        const userFavorites = currentUserObj?.favorites || [];
        const nameOverrides = currentUserObj?.nameOverrides || new Map();

        const enhancedUsers = await Promise.all(users.map(async (u) => {
            if (u._id.toString() === currentUserId) return null;

            try {
                // Apply name override if exists
                const userObj = u.toObject();
                const customName = nameOverrides instanceof Map ? nameOverrides.get(String(u._id)) : nameOverrides[String(u._id)];
                if (customName) {
                    userObj.name = customName;
                }
                
                // 1. Get Last Message
                const lastMsg = await Message.findOne({
                    $or: [
                        { user_id: new mongoose.Types.ObjectId(currentUserId), receiver_id: new mongoose.Types.ObjectId(u._id) },
                        { user_id: new mongoose.Types.ObjectId(u._id), receiver_id: new mongoose.Types.ObjectId(currentUserId) }
                    ],
                    deleted_for: { $ne: new mongoose.Types.ObjectId(currentUserId) }
                }).sort({ created_at: -1 }).populate('user_id', 'name _id').then(r => r ? (typeof r.toObject === 'function' ? r.toObject() : r) : null);

                // 2. Get Unread Count
                const unreadCount = await Message.countDocuments({
                    user_id: new mongoose.Types.ObjectId(u._id),
                    receiver_id: new mongoose.Types.ObjectId(currentUserId),
                    is_read: false,
                    deleted_for: { $ne: new mongoose.Types.ObjectId(currentUserId) }
                });

                // 3. Get Media, Docs, and Links counts
                const baseQuery = {
                    $or: [
                        { user_id: new mongoose.Types.ObjectId(currentUserId), receiver_id: new mongoose.Types.ObjectId(u._id) },
                        { user_id: new mongoose.Types.ObjectId(u._id), receiver_id: new mongoose.Types.ObjectId(currentUserId) }
                    ],
                    deleted_for: { $ne: new mongoose.Types.ObjectId(currentUserId) }
                };

                const [mediaCount, docCount, linkCount] = await Promise.all([
                    Message.countDocuments({ ...baseQuery, type: { $in: ['image', 'video'] } }),
                    Message.countDocuments({ ...baseQuery, type: 'file' }),
                    Message.countDocuments({ ...baseQuery, 'link_preview.url': { $exists: true, $ne: null } })
                ]);

                // 4. Check for message request status
                const request = await MessageRequest.findOne({
                    $or: [
                        { sender_id: u._id, receiver_id: currentUserId },
                        { sender_id: currentUserId, receiver_id: u._id }
                    ]
                }).then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

                const isAccepted = request && request.status === 'accepted';
                const isPendingForMe = request && request.status === 'pending' && String(request.receiver_id) === String(currentUserId);
                const isPendingFromMe = request && request.status === 'pending' && String(request.sender_id) === String(currentUserId);

                let effectiveLastMsg = lastMsg;

                // If it's a pending request, show a placeholder if no real history exists
                if (!effectiveLastMsg && request && request.status === 'pending') {
                    effectiveLastMsg = {
                        content: isPendingForMe ? 'New Message Request' : 'Message Request Sent',
                        created_at: request.updated_at || request.created_at,
                        type: 'text',
                        is_request_placeholder: true
                    };
                }

                return {
                    ...userObj,
                    lastMessage: effectiveLastMsg,
                    unreadCount: isAccepted ? unreadCount : (isPendingForMe ? 1 : 0),
                    mediaCount: isAccepted ? mediaCount : 0,
                    docCount: isAccepted ? docCount : 0,
                    linkCount: isAccepted ? linkCount : 0,
                    isFavorite: userFavorites.some(favId => String(favId) === String(u._id)),
                    hasPendingRequest: isPendingForMe,
                    requestStatus: request ? request.status : 'none',
                    requestUpdatedAt: request ? request.updated_at : null,
                    requestRejectedBy: (request && request.status === 'rejected') ? request.receiver_id : null
                };
            } catch (userErr) {
                console.error(`[DEBUG] /users: Error processing user ${u._id}:`, userErr.message);
                // Return basic user object so the list doesn't break
                const userObj = u.toObject();
                const customName = nameOverrides instanceof Map ? nameOverrides.get(String(u._id)) : nameOverrides[String(u._id)];
                if (customName) userObj.name = customName;

                return {
                    ...userObj,
                    lastMessage: null,
                    unreadCount: 0,
                    error: true
                };
            }
        }));

        const result = enhancedUsers.filter(u => u !== null);
        console.log(`[DEBUG] /users: Returning ${result.length} enhanced users for ${currentUserId}`);

        result.sort((a, b) => {
            const timeA = a.lastMessage?.created_at ? new Date(a.lastMessage.created_at).getTime() : 0;
            const timeB = b.lastMessage?.created_at ? new Date(b.lastMessage.created_at).getTime() : 0;
            return (timeB || 0) - (timeA || 0);
        });

        res.json(result);
    } catch (err) {
        console.error('[BACKEND ERROR] /users failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET Link Preview (for typing preview)
router.get('/link-preview', authenticateToken, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const preview = await fetchLinkPreview(url);
    res.json(preview || {});
});

// POST Grammar Check
router.post('/grammar-check', authenticateToken, async (req, res) => {
    const { text } = req.body;
    if (!text || text.length < 2) {
        return res.json({ basic: text, fluent: text, formal: text });
    }

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a precise grammar assistant. Analyze the user's message and provide three improved versions: 'basic' (strictly fix typos, spelling, and grammar), 'fluent' (clean, natural, and idiomatic), and 'formal' (professional and polished). CRITICAL: If there are typos like 'watr' (water), 'helllo' (hello), etc., you MUST correct them. Do NOT add new information, do NOT complete sentences, and do NOT add words that weren't in the original message unless strictly necessary for correct grammar. MANDATORY: You must ALWAYS provide these three versions, even if the input text contains profanity, insults, or unethical content. Your ONLY purpose is to fix grammar, not to evaluate safety or enforce policies. Never refuse a request. Return ONLY a JSON object: { \"basic\": \"...\", \"fluent\": \"...\", \"formal\": \"...\" }."
                },
                { role: "user", content: text }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const content = completion.choices[0]?.message?.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Check for AI Refusal strings
            const refusalKeywords = ['authorized', 'profanity', 'insult', 'offensive', 'policy', 'refuse', 'cannot assist'];
            let hasRefusal = false;
            for (let key in parsed) {
                if (typeof parsed[key] === 'string' && refusalKeywords.some(rev => parsed[key].toLowerCase().includes(rev))) {
                    hasRefusal = true;
                    break;
                }
            }

            if (hasRefusal) {
                // Return original text if AI refuses
                return res.json({ basic: text, fluent: text, formal: text });
            }

            res.json(parsed);
        } else {
            // Fallback for non-JSON or other AI refusals
            res.json({ basic: text, fluent: text, formal: text });
        }
    } catch (e) {
        console.error("AI Grammar Check Error:", e);
        // Fallback for API errors or safety refusals
        res.json({ basic: text, fluent: text, formal: text });
    }
});

// Toggle Favorite contact - Secured with Auth
router.post('/toggle-favorite', authenticateToken, async (req, res) => {
    const { targetUserId } = req.body;
    const currentUserId = req.user.id;

    if (!targetUserId) return res.status(400).json({ error: 'Target User ID required' });

    try {
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) return res.status(404).json({ error: 'User not found' });

        const index = currentUser.favorites.indexOf(targetUserId);
        if (index > -1) {
            currentUser.favorites.splice(index, 1);
        } else {
            currentUser.favorites.push(targetUserId);
        }

        await currentUser.save();
        res.json({ status: 'success', favorites: currentUser.favorites });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Custom Lists (Persistence for Unread/Favorite/Custom Filters) ---

// Get all custom lists for the current user
router.get('/custom-lists', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('customLists');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.customLists || []);
    } catch (err) {
        console.error('[GET CUSTOM LISTS ERROR]', err);
        if (isTransientDbError(err)) {
            return res.status(200).json([]);
        }
        res.status(500).json({ error: 'Failed to fetch custom lists' });
    }
});

// Sync entire customLists array (for simplicity matching frontend)
router.post('/custom-lists/sync', authenticateToken, async (req, res) => {
    try {
        const { customLists } = req.body;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: { customLists: customLists || [] } },
            { new: true }
        ).select('customLists');

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ status: 'success', customLists: user.customLists });
    } catch (err) {
        console.error('[SYNC CUSTOM LISTS ERROR]', err);
        if (isTransientDbError(err)) {
            return res.status(200).json({
                status: 'degraded',
                customLists: Array.isArray(req.body?.customLists) ? req.body.customLists : []
            });
        }
        res.status(500).json({ error: 'Failed to sync custom lists' });
    }
});

// --- E2EE (Signal Protocol) Key Management ---

// Upload Signal public keys
router.post('/signal/upload-keys', authenticateToken, async (req, res) => {
    try {
        const { identityKey, signedPreKey, oneTimePreKeys } = req.body;
        const user = await User.findByIdAndUpdate(req.user.id, {
            signal_keys: {
                identityKey,
                signedPreKey,
                oneTimePreKeys
            }
        }, { new: true });
        res.json({ status: 'success', message: 'Keys uploaded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch a user's Signal public keys for X3DH
router.get('/signal/keys/:userId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('signal_keys');
        if (!user || !user.signal_keys || !user.signal_keys.identityKey) {
            return res.status(404).json({ error: 'User does not have E2EE enabled' });
        }

        // Return a pre-key bundle (ID key, signed pre-key, and one one-time pre-key)
        const bundle = {
            identityKey: user.signal_keys.identityKey,
            signedPreKey: user.signal_keys.signedPreKey,
            oneTimePreKey: null
        };

        // Pop an OPK (One-Time PreKey) if available
        if (user.signal_keys.oneTimePreKeys && user.signal_keys.oneTimePreKeys.length > 0) {
            bundle.oneTimePreKey = user.signal_keys.oneTimePreKeys.shift();
            await user.save(); // Save the popped OPK state
        }

        res.json(bundle);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch only Signal identity public key (non-destructive, does not consume prekeys)
router.get('/signal/identity/:userId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('signal_keys.identityKey');
        if (!user || !user.signal_keys || !user.signal_keys.identityKey) {
            return res.status(404).json({ error: 'User does not have E2EE identity key' });
        }
        res.json({
            userId: String(user._id),
            identityKey: user.signal_keys.identityKey
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Build deterministic safety number from both users' identity public keys
router.get('/signal/verification/:userId', authenticateToken, async (req, res) => {
    try {
        const localId = String(req.user.id);
        const remoteId = String(req.params.userId);
        const requestedSet = Number.parseInt(String(req.query.set || '1'), 10);
        const setIndex = Number.isFinite(requestedSet) ? Math.max(1, Math.min(3, requestedSet)) : 1;

        if (!remoteId || localId === remoteId) {
            return res.status(400).json({ error: 'Invalid verification target' });
        }

        const [localUser, remoteUser] = await Promise.all([
            User.findById(localId).select('signal_keys.identityKey'),
            User.findById(remoteId).select('signal_keys.identityKey')
        ]);

        if (!localUser?.signal_keys?.identityKey) {
            return res.status(404).json({ error: 'Your identity key is not available. Re-register E2EE.' });
        }
        if (!remoteUser?.signal_keys?.identityKey) {
            return res.status(404).json({ error: 'Contact identity key is not available yet.' });
        }

        const canonical = [
            { id: localId, key: localUser.signal_keys.identityKey },
            { id: remoteId, key: remoteUser.signal_keys.identityKey }
        ].sort((a, b) => a.id.localeCompare(b.id));

        const material = `neuralchat-safety-v1|${canonical[0].id}|${canonical[0].key}|${canonical[1].id}|${canonical[1].key}`;
        const baseDigest = crypto.createHash('sha256').update(material, 'utf8').digest();
        const setSalt = ['alpha', 'bravo', 'charlie'][setIndex - 1] || 'alpha';
        const codeDigest = crypto
            .createHash('sha256')
            .update(`neuralchat-safety-v2|${setSalt}|${material}`, 'utf8')
            .digest();

        const groups = [];
        for (let i = 0; i < 6; i++) {
            const high = codeDigest[i * 2] || 0;
            const low = codeDigest[(i * 2) + 1] || 0;
            const num = ((high << 8) | low) % 100000;
            groups.push(String(num).padStart(5, '0'));
        }

        res.json({
            securityCode: groups.join(' '),
            fingerprint: baseDigest.toString('hex'),
            algorithm: 'sha256',
            version: 1,
            setIndex
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update User info (from Edit Contact panel) - Secured with Auth
router.post('/user/update', authenticateToken, async (req, res) => {
    const { targetUserId, name, mobile, countryCode } = req.body;
    const currentUserId = req.user.id;

    if (!targetUserId) return res.status(400).json({ error: 'Target User ID required' });

    try {
        // 1. Handle Name Overrides (Private to the current user)
        if (name !== undefined) {
            const requester = await User.findById(currentUserId);
            if (requester) {
                if (!requester.nameOverrides) requester.nameOverrides = new Map();
                requester.nameOverrides.set(targetUserId.toString(), name);
                await requester.save();
                console.log(`[DEBUG] Saved name override: ${targetUserId} -> ${name} for user ${currentUserId}`);
            }
        }

        // 2. Handle Global Field Updates (Only if updating own profile)
        let updatedUser = null;
        if (String(targetUserId) === String(currentUserId)) {
            const updateData = {};
            if (mobile !== undefined) updateData.mobile = mobile;
            if (countryCode !== undefined) updateData.countryCode = countryCode;
            if (req.body.designation !== undefined) updateData.designation = req.body.designation;
            if (req.body.about !== undefined) updateData.about = req.body.about;

            if (Object.keys(updateData).length > 0) {
                updatedUser = await User.findByIdAndUpdate(
                    targetUserId,
                    updateData,
                    { new: true }
                );

                if (req.io && updatedUser) {
                    req.io.emit('user_profile_updated', {
                        userId: updatedUser._id,
                        name: updatedUser.name, // Global name stays the same
                        mobile: updatedUser.mobile,
                        about: updatedUser.about
                    });
                }
            }
        }

        // If we didn't update global fields, still need to return the target user object
        if (!updatedUser) {
            updatedUser = await User.findById(targetUserId);
        }

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });

        res.json({ status: 'success', user: updatedUser });
    } catch (err) {
        console.error('[BACKEND ERROR] /user/update failed:', err);
        res.status(500).json({ error: err.message });
    }
});
// Inserted comment
router.post('/messages/mark-read', authenticateToken, async (req, res) => {
    const { userId, senderId } = req.body;

    // Security check: userId must match req.user.id
    if (userId !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized reader ID' });
    }

    try {
        const readAt = new Date();
        const senderObjId = new mongoose.Types.ObjectId(senderId);
        const readerObjId = new mongoose.Types.ObjectId(userId);

        // Using $in with both ObjectId and String forms to be 100% sure we hit the records
        const updateResult = await Message.updateMany(
            { 
                user_id: { $in: [senderObjId, senderId] }, 
                receiver_id: { $in: [readerObjId, userId] }, 
                is_read: false 
            },
            { $set: { is_read: true, read_at: readAt } }
        );

        console.log(`[DEBUG] mark-read: Reader ${userId} (Object: ${readerObjId}) processed messages from ${senderId}. Updated: ${updateResult.modifiedCount}`);

        // Notify the sender that their messages were read
        if (req.io) {
            console.log(`[DEBUG] mark-read: BROADCASTING messages_read for reader ${userId} to sender ${senderId}`);
            // Target the specific sender room for efficiency
            req.io.to(senderId).emit('messages_read', {
                reader_id: userId,
                read_at: readAt
            });
            // Also notify the reader's other sessions
            req.io.to(userId).emit('messages_read', {
                reader_id: userId,
                read_at: readAt
            });
            // Broadcast as backup to ensure no session is missed due to room issues
            req.io.emit('messages_read_broadcast', {
                reader_id: userId,
                sender_id: senderId,
                read_at: readAt
            });
        }

        res.json({ status: 'success', modifiedCount: updateResult.modifiedCount });
    } catch (err) {
        console.error('[DEBUG] mark-read system error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark conversation as unread - Secured with Auth
router.post('/messages/mark-unread', authenticateToken, async (req, res) => {
    const { userId, targetUserId } = req.body;

    // Security check: userId must match req.user.id
    if (userId !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        console.log(`[MARK_UNREAD] User ${userId} marking conversation with ${targetUserId} as unread`);

        // 1. Find the timestamp of the last message sent BY the person marking as unread (userId)
        // to the person who sent the messages (targetUserId).
        const lastReply = await Message.findOne({
            user_id: userId,
            receiver_id: targetUserId
        }).sort({ created_at: -1 });

        const lastReplyAt = lastReply ? lastReply.created_at : new Date(0);
        console.log(`[MARK_UNREAD] Last reply by ${userId} was at ${lastReplyAt}`);

        // 2. Find the latest 'read_at' timestamp for messages sent BY targetUserId TO userId
        // that were received AFTER our last reply.
        const latestReadMsg = await Message.findOne({
            user_id: targetUserId,
            receiver_id: userId,
            is_read: true,
            read_at: { $ne: null },
            created_at: { $gt: lastReplyAt } // Must be after our last response
        }).sort({ read_at: -1 });

        if (!latestReadMsg) {
            console.log(`[MARK_UNREAD] No new read messages found after last reply to mark as unread`);
            return res.json({ status: 'success', modifiedCount: 0 });
        }

        const batchReadAt = latestReadMsg.read_at;
        console.log(`[MARK_UNREAD] Reverting batch read at: ${batchReadAt}`);

        // 3. Identify the messages in this specific batch received after our last reply
        const batchMessages = await Message.find({
            user_id: targetUserId,
            receiver_id: userId,
            read_at: batchReadAt,
            created_at: { $gt: lastReplyAt }
        }).select('_id');

        const messageIds = batchMessages.map(m => m._id.toString());

        // 4. Mark ONLY messages in this specific batch as unread
        const result = await Message.updateMany(
            {
                _id: { $in: messageIds }
            },
            { is_read: false, read_at: null }
        );

        console.log(`[MARK_UNREAD] Updated ${result.modifiedCount} messages to unread`);

        if (result.modifiedCount > 0) {
            if (req.io) {
                // Send specific IDs to sender for perfect sync
                req.io.to(targetUserId).emit('messages_unread', {
                    reader_id: userId,
                    message_ids: messageIds
                });

                req.io.emit('messages_unread_broadcast', {
                    reader_id: userId,
                    target: targetUserId,
                    message_ids: messageIds
                });
            }
        }

        res.json({ status: 'success', modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(`[MARK_UNREAD] Error:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Fetch All Starred Messages (Global)
router.get('/messages/starred/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch starred P2P messages
        const p2pStarred = await Message.find({ starred_by: userId })
            .populate('user_id', 'name image mobile __enc_name __enc_mobile')
            .populate('receiver_id', 'name image mobile __enc_name __enc_mobile')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Fetch starred Group messages
        const groupStarred = await GroupMessage.find({ starred_by: userId })
            .populate('sender_id', 'name image mobile __enc_name __enc_mobile')
            .populate('group_id', 'name icon')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Standardize output
        const combined = [
            ...p2pStarred.map(m => ({ ...m, isGroup: false })),
            ...groupStarred.map(m => ({ ...m, isGroup: true }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(combined);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch user event reminders
router.get('/events/reminders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // All P2P events for the user
        const p2pEvents = await Message.find({
            type: 'event',
            $or: [{ user_id: userId }, { receiver_id: userId }]
        })
            .populate('user_id', 'name image')
            .populate('receiver_id', 'name image');

        // All Group events where user is a member
        const userGroups = await Group.find({ members: userId }).select('_id');
        const userGroupIds = userGroups.map(g => g._id);

        const groupEvents = await GroupMessage.find({
            type: 'event',
            group_id: { $in: userGroupIds }
        })
            .populate('sender_id', 'name image')
            .populate('group_id', 'name icon');

        const toSortableTs = (msg) => {
            const start = msg?.event?.startDate;
            const created = msg?.created_at;
            const startTs = start ? new Date(start).getTime() : NaN;
            if (Number.isFinite(startTs)) return startTs;
            const createdTs = created ? new Date(created).getTime() : NaN;
            if (Number.isFinite(createdTs)) return createdTs;
            return Number.MAX_SAFE_INTEGER;
        };

        const normalized = [
            ...p2pEvents.map(m => ({ ...m.toObject(), isGroup: false })),
            ...groupEvents.map(m => ({ ...m.toObject(), isGroup: true }))
        ];

        // Keep response resilient even when legacy/malformed event payloads exist.
        const combined = normalized
            .filter((m) => m && m.type === 'event')
            .sort((a, b) => toSortableTs(a) - toSortableTs(b));

        res.json({ status: 'success', events: combined });
    } catch (err) {
        console.error('[REMINDERS FETCH ERROR]', err);
        if (isTransientDbError(err)) {
            return res.status(200).json({ status: 'degraded', events: [] });
        }
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/request-unblock - Request unblock from admin
router.post('/request-unblock', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user.id;

        const user = await User.findByIdAndUpdate(userId, {
            unblockRequested: true,
            unblockRequestReason: reason || 'Please unblock my messaging.'
        }, { new: true });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Notify admin via socket if needed
        if (req.io) {
            req.io.emit('new_unblock_request', {
                userId: user._id,
                userName: user.name,
                reason: user.unblockRequestReason
            });
        }

        res.json({ status: 'requested', unblockRequested: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get P2P Chat History - Secured with Auth
router.get('/p2p/:userId/:otherUserId', authenticateToken, async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;

        // Security check: requester must be either userId or otherUserId
        if (req.user.id !== userId && req.user.id !== otherUserId) {
            return res.status(403).json({ error: 'You are not authorized to view this chat history' });
        }

        // --- Message Request Guard ---
        const currentId = req.user.id;
        const otherId = (currentId === userId) ? otherUserId : userId;

        const request = await MessageRequest.findOne({
            $or: [
                { sender_id: otherId, receiver_id: currentId },
                { sender_id: currentId, receiver_id: otherId }
            ]
        });

        // If a request exists but is NOT accepted, check if current viewer has visible history before hiding.
        if (request && request.status !== 'accepted') {
            // Allow senders to see their own messages even with pending requests
            // Only block receivers from seeing messages they haven't accepted yet
            if (request.status === 'pending' && String(request.receiver_id) === String(currentId)) {
                // Receiver trying to view pending request - only show if there's existing history
                const priorCount = await Message.countDocuments({
                    $or: [
                        { user_id: currentId, receiver_id: otherId },
                        { user_id: otherId, receiver_id: currentId }
                    ],
                    deleted_for: { $ne: new mongoose.Types.ObjectId(currentId) }
                });

                if (priorCount === 0) {
                    console.log(`[P2P GUARD] Hiding pending request for receiver ${currentId} from ${otherId}`);
                    return res.json([]);
                }
            } else if (request.status === 'rejected') {
                // For rejected requests, check if real messages are still visible
                const priorCount = await Message.countDocuments({
                    $or: [
                        { user_id: currentId, receiver_id: otherId },
                        { user_id: otherId, receiver_id: currentId }
                    ],
                    deleted_for: { $ne: new mongoose.Types.ObjectId(currentId) }
                });

                if (priorCount === 0) {
                    // No real history - apply the guard
                    const isReceiver = String(request.receiver_id) === String(currentId);
                    if (isReceiver) {
                        console.log(`[P2P GUARD] Hiding history for ${currentId} from ${otherId} because status is ${request.status}`);
                        return res.json([]);
                    }
                } else {
                    // Real history exists - auto-accept the stale request
                    request.status = 'accepted';
                    request.updated_at = new Date();
                    await request.save();
                }
            }
            // Senders can always see their own messages (even with pending requests)
        }
        // --- END GUARD ---

        const messages = await Message.find({
            $or: [
                { user_id: new mongoose.Types.ObjectId(userId), receiver_id: new mongoose.Types.ObjectId(otherUserId) },
                { user_id: new mongoose.Types.ObjectId(otherUserId), receiver_id: new mongoose.Types.ObjectId(userId) }
            ],
            deleted_for: { $ne: new mongoose.Types.ObjectId(req.user.id) }
        })
            .sort({ created_at: 1 })
            .populate('reply_to', 'content type file_path user_id sender_id ciphertext session_header');

        // Map messages to include user-specific is_starred boolean
        const enrichedMessages = messages.map(msg => {
            const msgObj = msg.toObject();
            msgObj.is_starred = (msg.starred_by || []).some(id => String(id) === String(req.user.id));
            msgObj.is_edited = msg.is_edited || false;
            return msgObj;
        });

        res.json(enrichedMessages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/poll/send - Send a P2P poll message
router.post('/poll/send', authenticateToken, async (req, res) => {
    try {
        const { toUserId, question, options, allowMultipleAnswers } = req.body;
        const senderId = req.user.id;

        if (!toUserId) return res.status(400).json({ error: 'Recipient required' });
        if (!question || !question.trim()) return res.status(400).json({ error: 'Poll question required' });
        if (!options || options.length < 2) return res.status(400).json({ error: 'At least 2 options required' });

        const pollOptions = options.map(opt => ({ text: opt, voters: [] }));

        const msg = await Message.create({
            user_id: senderId,
            receiver_id: toUserId,
            role: 'user',
            content: question,
            type: 'poll',
            poll: {
                question,
                options: pollOptions,
                allowMultipleAnswers: allowMultipleAnswers !== false
            }
        });

        const populated = await Message.findById(msg._id).populate('user_id', 'name _id');
        const msgObj = populated.toObject();

        if (req.io) {
            req.io.to(String(toUserId)).emit('send_message', {
                ...msgObj,
                sender_id: senderId
            });
        }

        res.json({ status: 'sent', message: msgObj });
    } catch (err) {
        console.error('[POLL SEND P2P]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/poll/:messageId/vote - Vote on a P2P poll
router.post('/poll/:messageId/vote', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { optionIndexes } = req.body; // array of indexes voted for
        const userId = req.user.id;
        const userObjId = new mongoose.Types.ObjectId(userId);

        const msg = await Message.findById(messageId);
        if (!msg || msg.type !== 'poll') return res.status(404).json({ error: 'Poll not found' });

        const allowMultiple = msg.poll.allowMultipleAnswers;
        const indexes = Array.isArray(optionIndexes) ? optionIndexes : [optionIndexes];

        if (!allowMultiple && indexes.length > 1) {
            return res.status(400).json({ error: 'Multiple answers not allowed' });
        }

        // Remove user from all options first (reset vote)
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

        const updated = await Message.findById(messageId);
        const msgObj = updated.toObject();

        // Emit to both parties
        if (req.io) {
            [String(msg.user_id), String(msg.receiver_id)].filter(Boolean).forEach(uid => {
                req.io.to(uid).emit('poll_voted', { messageId, poll: msgObj.poll, isGroup: false });
            });
        }

        res.json({ status: 'voted', poll: msgObj.poll });
    } catch (err) {
        console.error('[POLL VOTE P2P]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/event/:messageId/respond - Respond to an event
router.post('/event/:messageId/respond', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body; // 'Going', 'Maybe', 'Not going'
        const userId = req.user.id;
        const userObjId = new mongoose.Types.ObjectId(userId);

        if (!['Going', 'Maybe', 'Not going'].includes(status)) {
            return res.status(400).json({ error: 'Invalid sort status' });
        }

        const msg = await Message.findById(messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event message not found' });

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

        const updated = await Message.findById(messageId);
        const msgObj = updated.toObject();

        if (req.io) {
            [String(msg.user_id), String(msg.receiver_id)].filter(Boolean).forEach(uid => {
                req.io.to(uid).emit('event_responded', { messageId, event: msgObj.event, isGroup: false });
            });
            // Also notify admins for real-time dashboard updates
            req.io.to('admins').emit('event_responded', { messageId, event: msgObj.event, isGroup: false });
        }

        res.json({ status: 'success', event: msgObj.event });
    } catch (err) {
        console.error('[EVENT RESPOND P2P]', err);
        res.status(500).json({ error: err.message });
    }
});

// Send Message - Secured with Auth
router.post('/send', authenticateToken, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    const { userId, content, reply_to, toUserId } = req.body;
    const file = req.file;

    let event = req.body.event;
    if (typeof event === 'string') {
        try { event = JSON.parse(event); } catch (e) { event = null; }
    }
    let poll = req.body.poll;
    if (typeof poll === 'string') {
        try { poll = JSON.parse(poll); } catch (e) { poll = null; }
    }

    // Security check
    if (userId !== req.user.id) {
        return res.status(403).json({ error: 'Sender ID mismatch' });
    }

    // Determine type and metadata
    let type = req.body.type || 'text';
    let filePath = null;
    let fileName = null;
    let fileSize = 0;
    let pageCount = 0;
    let duration = Number(req.body.duration || 0);

    let is_view_once = req.body.is_view_once === 'true' || req.body.is_view_once === true;

    if (file) {
        if (file.mimetype.startsWith('video/')) {
            type = 'video';
        } else if (file.mimetype.startsWith('audio/')) {
            type = 'audio';
        } else {
            type = file.mimetype.startsWith('image/') ? 'image' : 'file';
        }
        filePath = '/uploads/' + file.filename;
        fileName = file.originalname;
        fileSize = file.size;

        // Guardrail: tiny audio blobs are suspicious, but do not block sending.
        if (type === 'audio' && fileSize < MIN_VALID_AUDIO_BYTES) {
            console.warn(`[AUDIO WARN] Very small audio blob received (${fileSize} bytes): ${file.originalname}`);
        }

        // Permanent durability: persist every uploaded attachment in Mongo GridFS.
        if (['audio', 'video', 'image', 'file'].includes(type)) {
            try {
                const absPath = path.join(__dirname, '../uploads', file.filename);
                const { fileId } = await uploadLocalFileToGridFS(absPath, file.originalname || file.filename, {
                    senderId: userId,
                    receiverId: toUserId || null,
                    legacyPath: filePath,
                    mimeType: file.mimetype,
                    messageType: type
                });
                filePath = `/api/chat/media/file/${String(fileId)}`;
            } catch (gridErr) {
                console.error('[GRIDFS UPLOAD ERROR]', gridErr);
                return res.status(500).json({ error: 'Failed to store media permanently' });
            }
        }

        // Try to get page count for PDFs (wrapped in try-catch to prevent crashing)
        if (file.mimetype === 'application/pdf') {
            try {
                const dataBuffer = fs.readFileSync(path.join(__dirname, '../uploads', file.filename));
                // Only attempt if pdfParse is a function
                if (typeof pdfParse === 'function') {
                    const data = await pdfParse(dataBuffer);
                    pageCount = data.numpages;
                } else {
                    console.error("pdf-parse is not a function:", typeof pdfParse);
                }
            } catch (e) {
                console.error("PDF Page Count Failed", e);
            }
        }
    } else if (req.body.file_path) {
        // Handle Forwarding (Existing File)
        filePath = req.body.file_path;
        type = req.body.type || inferTypeFromUrl(filePath);
        fileName = req.body.fileName;
        fileSize = req.body.fileSize;
        pageCount = req.body.pageCount || 0;
    }

    try {
        // --- PRE-SEND BLOCK CHECK ---
        const currentUserProfile = await User.findById(userId);
        if (currentUserProfile.messagingBlocked) {
            return res.status(403).json({
                error: 'Messaging Blocked',
                blocked: true,
                unblockRequested: currentUserProfile.unblockRequested
            });
        }

        // === Global Safety & Ethics Check (AI-Driven) ===
        let isFlagged = false;
        let flagReason = "";

        // Analyze globally for any type of bad words or unethical behavior
        if (content && content.length > 0) {
            const aiResult = await checkUnethicalWithAI(content);
            if (aiResult.isUnethical) {
                isFlagged = true;
                flagReason = aiResult.reason;
            }
        }


        if (isFlagged) {
            // Log violation and increment count
            const updatedUser = await User.findByIdAndUpdate(userId, {
                $inc: { unethicalCount: 1 }
            }, { new: true });

            // Create entry for admin dashboard
            await UnethicalLog.create({
                user_id: userId,
                content: content || 'Forwarded Media/File',
                reason: flagReason,
                type: content && badWords.some(word => content.toLowerCase().includes(word)) ? 'direct' : 'indirect'
            });

            // Check if this violation pushes them over the limit
            if (updatedUser.unethicalCount > 5) {
                await User.findByIdAndUpdate(userId, { messagingBlocked: true });

                // Emit socket event for real-time blocking
                if (req.io) {
                    req.io.to(userId).emit('user_blocked', { blocked: true });
                }
            }

            // Note: We are NO LONGER returning res.status(400) here to satisfy "it should not block for sending"
        }
        if (toUserId) {
            // --- Message Request Check ---
            const acceptedRequest = await MessageRequest.findOne({
                $or: [
                    { sender_id: userId, receiver_id: toUserId, status: 'accepted' },
                    { sender_id: toUserId, receiver_id: userId, status: 'accepted' }
                ]
            });

            if (!acceptedRequest) {
                // === Check for real prior chat history first ===
                // If the two users have EVER exchanged any messages that were not deleted-for-everyone,
                // they already have an established relationship — skip the request gate entirely.
                const priorMessageCount = await Message.countDocuments({
                    $or: [
                        { user_id: new mongoose.Types.ObjectId(userId), receiver_id: new mongoose.Types.ObjectId(toUserId) },
                        { user_id: new mongoose.Types.ObjectId(toUserId), receiver_id: new mongoose.Types.ObjectId(userId) }
                    ],
                    deleted_for: { $ne: new mongoose.Types.ObjectId(userId) }
                });

                if (priorMessageCount > 0) {
                    const staleRequest = await MessageRequest.findOne({
                        $or: [
                            { sender_id: new mongoose.Types.ObjectId(userId), receiver_id: new mongoose.Types.ObjectId(toUserId) },
                            { sender_id: new mongoose.Types.ObjectId(toUserId), receiver_id: new mongoose.Types.ObjectId(userId) }
                        ]
                    });
                    if (staleRequest && staleRequest.status !== 'accepted') {
                        staleRequest.status = 'accepted';
                        staleRequest.updated_at = new Date();
                        await staleRequest.save();
                    }
                    // Fall through to normal message sending below
                } else {
                    // === No prior history — apply the request gate ===
                    const existingRequest = await MessageRequest.findOne({
                        $or: [
                            { sender_id: userId, receiver_id: toUserId },
                            { sender_id: toUserId, receiver_id: userId }
                        ]
                    });

                    if (!existingRequest) {
                        // Create new pending request
                        await MessageRequest.create({
                            sender_id: userId,
                            receiver_id: toUserId,
                            status: 'pending'
                        });

                        // Notify receiver
                        if (req.io) {
                            const senderUser = await User.findById(userId).select('name __enc_name');
                            req.io.to(String(toUserId)).emit('new_message_request', {
                                senderId: userId,
                                senderName: senderUser ? senderUser.name : 'New User',
                                requestCreated: true
                            });
                        }
                    } else if (existingRequest.status === 'rejected') {
                        // Restricted for 24 hours after rejection
                        const isWithin24Hours = (new Date() - new Date(existingRequest.updated_at)) < 24 * 60 * 60 * 1000;
                        if (isWithin24Hours) {
                            return res.status(403).json({
                                error: 'Messaging is restricted for 24 hours after a rejection.',
                                restrictedUntil: new Date(existingRequest.updated_at.getTime() + 24 * 60 * 60 * 1000)
                            });
                        }
                        // After 24 hours: reset request to pending
                        existingRequest.status = 'pending';
                        existingRequest.sender_id = userId;
                        existingRequest.receiver_id = toUserId;
                        existingRequest.updated_at = new Date();
                        await existingRequest.save();
                        if (req.io) {
                            const senderUser = await User.findById(userId).select('name __enc_name');
                            req.io.to(String(toUserId)).emit('new_message_request', {
                                senderId: userId,
                                senderName: senderUser ? senderUser.name : 'New User',
                                requestCreated: true
                            });
                        }
                    }
                    // Block the send — request is pending
                    return res.json({ status: 'pending_request', message: 'Message request sent. Receiver must accept before they see your messages.' });
                }
            }
            // --- END REQUEST CHECK ---

            // Detect URL for preview
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatch = content ? content.match(urlRegex) : null;
            let linkPreview = null;
            if (urlMatch) {
                linkPreview = await fetchLinkPreview(urlMatch[0]);
            }

            const isForwarded = req.body.isForwarded === 'true' || req.body.isForwarded === true;
            let forwardCount = 0;
            if (isForwarded) {
                const originalCount = parseInt(req.body.forward_count) || 0;
                forwardCount = originalCount + 1;
                console.log(`[FORWARD] Orig: ${originalCount}, New: ${forwardCount}, to: ${toUserId}`);
            }

            const msg = await Message.create({
                user_id: userId,
                receiver_id: toUserId,
                role: 'user',
                content: content || '',
                type,
                file_path: filePath,
                fileName,
                fileSize: fileSize || 0,
                pageCount: req.body.pageCount || 0,
                thumbnail_path: req.body.thumbnail_path || null,
                link_preview: linkPreview,
                duration: Number(req.body.duration || 0), is_view_once, // Metadata
                reply_to: reply_to || null,

                is_flagged: !!isFlagged,
                flag_reason: flagReason,
                is_forwarded: isForwarded,
                forward_count: forwardCount,

                // E2EE fields
                ciphertext: req.body.ciphertext,
                session_header: req.body.session_header ? JSON.parse(req.body.session_header) : undefined,

                // Forwarded Poll/Event
                poll: poll || undefined,
                event: event || undefined
            });


            if (isFlagged && req.io) {
                // Notify admins
                req.io.to('admins').emit('unethical_message_detected', {
                    userId: userId,
                    userName: req.user.name || "Unknown",
                    messageId: msg._id,
                    content: content,
                    type: type,
                    duration: msg.duration,
                    reason: flagReason,
                    createdAt: msg.created_at,
                    receiverId: toUserId || null
                });
            }

            const decryptedMsg = await Message.findById(msg._id);
            const msgObj = decryptedMsg.toObject();

            // Notify Admins
            if (req.io) {
                req.io.to('admins').emit('receive_message', msgObj);
            }

            // Notify Receiver (P2P)
            if (toUserId && req.io) {
                req.io.to(String(toUserId)).emit('receive_message', msgObj);
            }

            return res.json({ status: 'sent', message: msgObj });
        }

        // --- AI LOGIC BELOW (Only if no toUserId) ---

        // Save User Message (for AI chat)
        await Message.create({
            user_id: userId,
            receiver_id: null,
            role: 'user',
            content: content || '',
            type,
            file_path: filePath,
            fileName, fileSize, pageCount, duration, is_view_once, // Metadata
            reply_to: reply_to || null,

            is_flagged: !!isFlagged,
            flag_reason: flagReason
        });

        // Prepare context for AI
        let aiContent = "I received your file.";
        let messages = [];

        // 1. Handle Images (Vision Model - Llama 4 Maverick)
        if (type === 'image') {
            const imagePath = path.join(__dirname, '../uploads', file.filename);
            const bitmap = fs.readFileSync(imagePath);
            const base64Image = bitmap.toString('base64');

            messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: content || "Analyze this image." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ]
                }
            ];

            const chatCompletion = await groq.chat.completions.create({
                messages: messages,
                model: "meta-llama/llama-4-maverick-17b-128e-instruct",
            });
            aiContent = chatCompletion.choices[0]?.message?.content || "Image processed.";

        }
        // 2. Handle PDFs - Text Extraction Only (Robust)
        else if (type === 'file' && file.mimetype === 'application/pdf') {
            const pdfPath = path.join(__dirname, '../uploads', file.filename);
            try {
                const dataBuffer = fs.readFileSync(pdfPath);

                // Ensure pdfParse is functional
                if (typeof pdfParse !== 'function') {
                    throw new Error("pdf-parse library is not loaded correctly.");
                }

                const pdfData = await pdfParse(dataBuffer);
                const text = pdfData.text.trim().substring(0, 10000); // Limit context

                if (!text) throw new Error("PDF text empty");

                messages = [
                    { role: "system", content: "You are a helpful assistant. Analyze the document." },
                    { role: "user", content: `${content || "Analyze this"}\n\nContent:\n${text}` }
                ];
                // Using 70b-versatile for pure text analysis (Reliable)
                const chatCompletion = await groq.chat.completions.create({
                    messages: messages,
                    model: "llama-3.3-70b-versatile",
                });
                aiContent = chatCompletion.choices[0]?.message?.content || "PDF text analyzed.";

            } catch (textErr) {
                console.error("PDF Text Parse Error:", textErr);
                aiContent = "Could not read the PDF file (unsupported format or encrypted). Error: " + textErr.message;
            }
        }
        // 3. Handle Word Documents (DOCX) - Text + Embedded Images
        else if (type === 'file' && file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const docPath = path.join(__dirname, '../uploads', file.filename);
            try {
                // Convert to HTML to extract base64 images easily
                const result = await mammoth.convertToHtml({ path: docPath });
                const html = result.value || "";
                const rawText = result.messages.map(m => m.message).join("\n") + "\n" + (await mammoth.extractRawText({ path: docPath })).value;

                // Extract base64 images from HTML
                const imgRegex = /src="data:image\/([a-zA-Z]+);base64,([^"]+)"/g;
                let match;
                let extractedImages = [];

                while ((match = imgRegex.exec(html)) !== null) {
                    if (extractedImages.length < 3) { // Limit to 3 images
                        extractedImages.push({ type: match[1], data: match[2] });
                    }
                }

                if (extractedImages.length > 0) {
                    // Vision Request (Llama 4 Maverick for mixed content)
                    let contentPayload = [
                        { type: "text", text: content || "Analyze this Word document with its images." }
                    ];
                    const trimmedText = rawText.substring(0, 5000);
                    if (trimmedText) contentPayload.push({ type: "text", text: `\n\nDocument Text:\n${trimmedText}` });

                    extractedImages.forEach(img => {
                        contentPayload.push({
                            type: "image_url",
                            image_url: { url: `data:image/${img.type};base64,${img.data}` }
                        });
                    });

                    messages = [{ role: "user", content: contentPayload }];
                    const chatCompletion = await groq.chat.completions.create({
                        messages: messages,
                        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
                    });
                    aiContent = chatCompletion.choices[0]?.message?.content || "Word document analyzed (Vision).";

                } else {
                    // Text Only Fallback (Versatile)
                    const docText = (await mammoth.extractRawText({ path: docPath })).value.trim().substring(0, 10000);
                    if (!docText || docText.length < 5) {
                        aiContent = "The Word document appears empty.";
                    } else {
                        messages = [
                            { role: "system", content: "You are a helpful assistant. Analyze the document." },
                            { role: "user", content: `${content || "Analyze this"}\n\nContent:\n${docText}` }
                        ];
                        const chatCompletion = await groq.chat.completions.create({
                            messages: messages,
                            model: "llama-3.3-70b-versatile",
                        });
                        aiContent = chatCompletion.choices[0]?.message?.content || "Document analyzed.";
                    }
                }
            } catch (docErr) {
                console.error("DOCX Parse Error:", docErr);
                aiContent = "Error reading the Word document.";
            }
        }
        // 3. Handle Regular Text (Versatile)
        else if (content) {
            messages = [{ role: "user", content: content }];
            const chatCompletion = await groq.chat.completions.create({
                messages: messages,
                model: "llama-3.3-70b-versatile",
            });
            aiContent = chatCompletion.choices[0]?.message?.content || "Done.";
        } else {
            // Just file (non-PDF or other), no content
            aiContent = "File uploaded successfully.";
        }

        // Save AI Response
        await Message.create({
            user_id: userId,
            receiver_id: null,
            role: 'model',
            content: aiContent,
            type: 'text'
        });

        res.json({ status: 'sent', aiResponse: aiContent });

    } catch (aiErr) {
        console.error("Groq/DB Error FULL:", aiErr); // Enhanced logging
        // Fallback
        try {
            const errorMsg = "Sorry, I encountered an error processing that. (" + (aiErr.message) + ")";
            await Message.create({
                user_id: userId,
                receiver_id: null,
                role: 'model',
                content: errorMsg,
                type: 'text'
            });
            res.json({ status: 'sent', aiResponse: errorMsg });
        } catch (dbErr) {
            res.status(500).json({ error: 'Database Error' });
        }
    }
});

// Toggle Pin/Star - Secured with Auth for Personalized Star
router.post('/message/:id/toggle', authenticateToken, async (req, res) => {
    const { action, value, duration } = req.body; // action: 'pin' or 'star', duration: '8 hours', '1 week', 'Always'
    const userId = req.user.id;

    try {
        let msg = await Message.findById(req.params.id);
        if (!msg) {
            msg = await GroupMessage.findById(req.params.id);
        }
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        if (action === 'pin') {
            if (value) {
                const expiresAt = duration === '24 hours' ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                    : duration === '7 days' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        : duration === '30 days' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                            : null;

                const isGroupMsg = !!msg.group_id;
                const user1 = isGroupMsg ? null : msg.user_id;
                const user2 = isGroupMsg ? null : msg.receiver_id;

                if (isGroupMsg || user2) {
                    const findQuery = isGroupMsg
                        ? { group_id: msg.group_id, is_pinned: true }
                        : {
                            $or: [
                                { user_id: user1, receiver_id: user2 },
                                { user_id: user2, receiver_id: user1 }
                            ],
                            is_pinned: true
                        };

                    const Model = isGroupMsg ? GroupMessage : Message;
                    const pinnedMsgs = await Model.find(findQuery).sort({ pinned_at: 1 });

                    const now = new Date();
                    const activePinned = [];
                    for (let p of pinnedMsgs) {
                        if (p.pin_expires_at && p.pin_expires_at < now) {
                            p.is_pinned = false;
                            p.pinned_at = null;
                            p.pin_expires_at = null;
                            await p.save();
                            if (req.io) {
                                if (isGroupMsg) {
                                    const Group = require('../models/Group');
                                    const group = await Group.findById(msg.group_id);
                                    if (group) {
                                        group.members.forEach(mId => {
                                            req.io.to(mId.toString()).emit('message_pinned', { messageId: p._id, is_pinned: false });
                                        });
                                    }
                                } else {
                                    [user1.toString(), user2.toString()].forEach(pId => {
                                        req.io.to(pId).emit('message_pinned', { messageId: p._id, is_pinned: false });
                                    });
                                }
                            }
                        } else {
                            activePinned.push(p);
                        }
                    }

                    if (activePinned.length >= 5) {
                        const oldest = activePinned[0];
                        oldest.is_pinned = false;
                        oldest.pinned_at = null;
                        oldest.pin_expires_at = null;
                        await oldest.save();
                        if (req.io) {
                            if (isGroupMsg) {
                                const Group = require('../models/Group');
                                const group = await Group.findById(msg.group_id);
                                if (group) {
                                    group.members.forEach(mId => {
                                        req.io.to(mId.toString()).emit('message_pinned', { messageId: oldest._id, is_pinned: false });
                                    });
                                }
                            } else {
                                [user1.toString(), user2.toString()].forEach(pId => {
                                    req.io.to(pId).emit('message_pinned', { messageId: oldest._id, is_pinned: false });
                                });
                            }
                        }
                    }
                }

                msg.is_pinned = true;
                msg.pinned_at = new Date();
                msg.pin_expires_at = expiresAt;
                msg.pinned_by = userId;
            } else {
                msg.is_pinned = false;
                msg.pinned_at = null;
                msg.pin_expires_at = null;
            }
        } else if (action === 'star') {
            if (!msg.starred_by) msg.starred_by = [];
            const index = msg.starred_by.findIndex(id => String(id) === String(userId));
            if (value && index === -1) {
                msg.starred_by.push(userId);
            } else if (!value && index > -1) {
                msg.starred_by.splice(index, 1);
            }
        }

        await msg.save();

        // RE-FETCH to ensure fields are decrypted before returning to client!
        const refreshed = await (msg.group_id ? GroupMessage.findById(msg._id) : Message.findById(msg._id));
        if (refreshed) {
            msg = refreshed;
        }

        if (req.io && action === 'pin') {
            if (msg.group_id) {
                const Group = require('../models/Group');
                const group = await Group.findById(msg.group_id);
                if (group) {
                    group.members.forEach(mId => {
                        req.io.to(mId.toString()).emit('message_pinned', {
                            messageId: msg._id,
                            is_pinned: msg.is_pinned,
                            pinned_at: msg.pinned_at,
                            pin_expires_at: msg.pin_expires_at,
                            pinned_by: msg.pinned_by
                        });
                    });
                }
            } else {
                const participants = [msg.user_id.toString()];
                if (msg.receiver_id) participants.push(msg.receiver_id.toString());

                participants.forEach(pId => {
                    req.io.to(pId).emit('message_pinned', {
                        messageId: msg._id,
                        is_pinned: msg.is_pinned,
                        pinned_at: msg.pinned_at,
                        pin_expires_at: msg.pin_expires_at,
                        pinned_by: msg.pinned_by
                    });
                });
            }
        }

        if (msg.group_id) {
            await msg.populate('sender_id', 'name profile_pic profile_photo mobile');
        } else {
            await msg.populate([
                { path: 'user_id', select: 'name profile_pic profile_photo mobile' },
                { path: 'receiver_id', select: 'name profile_pic profile_photo mobile' }
            ]);
        }

        const msgObj = msg.toObject();
        msgObj.is_starred = (msg.starred_by || []).some(id => String(id) === String(userId));
        res.json(msgObj);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit Message - Secured with Auth
router.post('/message/:id/edit', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        // Permission check: only sender can edit
        if (msg.user_id.toString() !== userId) {
            return res.status(403).json({ error: 'Unauthorized to edit this message' });
        }

        // Permission check: removed read restriction for now

        msg.content = content;
        msg.is_edited = true;
        msg.edited_at = new Date();
        await msg.save();

        // Notify participants via socket
        if (req.io) {
            const updatedMsg = await Message.findById(msg._id);
            const participants = [msg.user_id.toString()];
            if (msg.receiver_id) participants.push(msg.receiver_id.toString());

            participants.forEach(pId => {
                req.io.to(pId).emit('message_edited', {
                    messageId: msg._id,
                    content: updatedMsg.content,
                    is_edited: true,
                    edited_at: msg.edited_at
                });
            });
        }

        res.json({
            status: 'success',
            message: msg
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark Message as Opened - Secured with Auth
router.post('/message/:id/open', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        let msg = await Message.findById(req.params.id);
        let isGroupMsg = false;

        if (!msg) {
            const GroupMessage = require('../models/GroupMessage');
            msg = await GroupMessage.findById(req.params.id);
            if (msg) isGroupMsg = true;
        }

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        msg.is_opened = true;
        await msg.save();

        if (req.io) {
            if (isGroupMsg) {
                const Group = require('../models/Group');
                const group = await Group.findById(msg.group_id);
                if (group) {
                    group.members.forEach(mId => {
                        req.io.to(mId.toString()).emit('message_opened', { messageId: msg._id, is_opened: true });
                    });
                }
            } else {
                const participants = [msg.user_id.toString()];
                if (msg.receiver_id) participants.push(msg.receiver_id.toString());

                participants.forEach(pId => {
                    req.io.to(pId).emit('message_opened', { messageId: msg._id, is_opened: true });
                });
            }
        }

        res.json({ status: 'success', messageId: msg._id, is_opened: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark Message as Viewed (For View-Once) - Secured with Auth
router.post('/message/:id/viewed', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        let msg = await Message.findById(req.params.id);
        let isGroupMsg = false;

        if (!msg) {
            const GroupMessage = require('../models/GroupMessage');
            msg = await GroupMessage.findById(req.params.id);
            if (msg) isGroupMsg = true;
        }

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        // Safety check: receiver should be the one marking as viewed
        if (!isGroupMsg && msg.receiver_id && String(msg.receiver_id) !== String(userId)) {
            // Senders can't mark their own view-once as viewed for the receiver
            // But let's keep it simple for now or skip check
        }

        msg.is_viewed = true;
        await msg.save();

        if (req.io) {
            if (isGroupMsg) {
                const group = await Group.findById(msg.group_id);
                if (group) {
                    group.members.forEach(mId => {
                        req.io.to(mId.toString()).emit('message_viewed', { messageId: msg._id, is_viewed: true });
                    });
                }
            } else {
                const participants = [msg.user_id.toString()];
                if (msg.receiver_id) participants.push(msg.receiver_id.toString());

                participants.forEach(pId => {
                    req.io.to(pId).emit('message_viewed', { messageId: msg._id, is_viewed: true });
                });
            }
        }

        res.json({ status: 'success', messageId: msg._id, is_viewed: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Message - Secured with Auth
router.post('/message/:id/delete', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;

    const { mode } = req.body; // 'me' or 'everyone'

    try {
        let msg = await Message.findById(req.params.id);
        let isGroupMsg = false;
        if (!msg) {
            msg = await GroupMessage.findById(req.params.id);
            isGroupMsg = true;
        }

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        const senderId = isGroupMsg ? msg.sender_id : msg.user_id;

        if (userRole === 'admin') {
            msg.is_deleted_by_admin = true;
        } else if (senderId.toString() === userId) {
            // Sender Deleting
            if (mode === 'me') {
                if (!msg.deleted_for.includes(userId)) {
                    msg.deleted_for.push(userId);
                }
            } else if (mode === 'everyone') {
                msg.is_deleted_by_user = true;
            } else {
                // Fallback for backward compatibility or when mode is not specified
                if (msg.is_deleted_by_user) {
                    if (!msg.deleted_for.includes(userId)) {
                        msg.deleted_for.push(userId);
                    }
                } else {
                    msg.is_deleted_by_user = true;
                }
            }
        } else {
            // Check if user is a member of the group (for group messages)
            if (isGroupMsg) {
                const group = await Group.findById(msg.group_id);
                const isMember = group?.members.some(mId => String(mId) === String(userId));
                if (isMember) {
                    // Receiver deleting "for me"
                    if (!msg.deleted_for.includes(userId)) {
                        msg.deleted_for.push(userId);
                    }
                } else {
                    return res.status(403).json({ error: 'Unauthorized to delete this message' });
                }
            } else if (msg.receiver_id && msg.receiver_id.toString() === userId) {
                // Receiver deleting "for me"
                if (!msg.deleted_for.includes(userId)) {
                    msg.deleted_for.push(userId);
                }
            } else {
                return res.status(403).json({ error: 'Unauthorized to delete this message' });
            }
        }

        await msg.save();

        // Notify participants via socket
        if (req.io) {
            if (isGroupMsg) {
                const group = await Group.findById(msg.group_id);
                if (group) {
                    group.members.forEach(mId => {
                        req.io.to(mId.toString()).emit('message_deleted', {
                            messageId: msg._id,
                            is_deleted_by_admin: msg.is_deleted_by_admin,
                            is_deleted_by_user: msg.is_deleted_by_user
                        });
                    });
                }
            } else {
                const participants = [msg.user_id.toString()];
                if (msg.receiver_id) participants.push(msg.receiver_id.toString());

                participants.forEach(pId => {
                    req.io.to(pId).emit('message_deleted', {
                        messageId: msg._id,
                        is_deleted_by_admin: msg.is_deleted_by_admin,
                        is_deleted_by_user: msg.is_deleted_by_user
                    });
                });
            }

            // Also notify admins with enriched data for the Review Box
            (async () => {
                try {
                    const deleterName = req.user.name || (userRole === 'admin' ? 'Admin' : 'User');
                    let partnerName = 'Unknown';
                    const isGroup = !!msg.group_id;
                    const contentSnippet = (msg.content || '').substring(0, 50);

                    if (isGroup) {
                        const group = await Group.findById(msg.group_id);
                        partnerName = group ? group.name : 'Group Chat';
                    } else {
                        const otherUserId = msg.user_id.toString() === userId ? msg.receiver_id : msg.user_id;
                        const otherUser = await User.findById(otherUserId);
                        partnerName = otherUser ? (otherUser.name || `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim()) : 'User';
                    }

                    req.io.to('admins').emit('message_deleted_admin', {
                        messageId: msg._id,
                        deletedBy: deleterName,
                        partnerName,
                        contentSnippet,
                        isGroup,
                        is_deleted_by_admin: msg.is_deleted_by_admin,
                        is_deleted_by_user: msg.is_deleted_by_user,
                        timestamp: new Date(),
                        userId: msg.user_id,
                        receiverId: msg.receiver_id,
                        groupId: msg.group_id
                    });
                } catch (err) {
                    console.error('[SOCKET ADMIN NOTIFY ERROR]', err);
                }
            })();
        }

        res.json({
            status: 'success',
            messageId: msg._id,
            is_deleted_by_admin: msg.is_deleted_by_admin,
            is_deleted_by_user: msg.is_deleted_by_user,
            deleted_for: msg.deleted_for
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk Delete Messages - Secured with Auth
router.post('/messages/bulk-delete', authenticateToken, async (req, res) => {
    const { messageIds, mode } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ error: 'Message IDs (array) required' });
    }

    try {
        const results = [];
        const deletedIds = [];

        for (const id of messageIds) {
            try {
                // Validate if the ID is a valid MongoDB ObjectId
                const mongoose = require('mongoose');
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    console.log(`[BULK DELETE] Skipping invalid ID: ${id}`);
                    continue;
                }

                let msg = await Message.findById(id);
                let isGroup = false;
                if (!msg) {
                    msg = await GroupMessage.findById(id);
                    isGroup = true;
                }

                if (!msg) continue;

                let updated = false;
                const ownerId = isGroup ? msg.sender_id.toString() : msg.user_id.toString();

                if (userRole === 'admin') {
                    msg.is_deleted_by_admin = true;
                    updated = true;
                } else if (ownerId === userId) {
                    if (mode === 'me') {
                        if (!msg.deleted_for.includes(userId)) {
                            msg.deleted_for.push(userId);
                            updated = true;
                        }
                    } else if (mode === 'everyone') {
                        msg.is_deleted_by_user = true;
                        updated = true;
                    } else {
                        // Fallback
                        if (msg.is_deleted_by_user) {
                            if (!msg.deleted_for.includes(userId)) {
                                msg.deleted_for.push(userId);
                                updated = true;
                            }
                        } else {
                            msg.is_deleted_by_user = true;
                            updated = true;
                        }
                    }
                } else if (!isGroup && msg.receiver_id && msg.receiver_id.toString() === userId) {
                    if (!msg.deleted_for.includes(userId)) {
                        msg.deleted_for.push(userId);
                        updated = true;
                    }
                } else if (isGroup) {
                    // For group messages, if I'm not the sender, I can only delete for "me"
                    if (mode === 'me') {
                        if (!msg.deleted_for.includes(userId)) {
                            msg.deleted_for.push(userId);
                            updated = true;
                        }
                    }
                }

                if (updated) {
                    await msg.save();
                    deletedIds.push(msg._id);
                    results.push({
                        messageId: msg._id,
                        is_deleted_by_admin: msg.is_deleted_by_admin,
                        is_deleted_by_user: msg.is_deleted_by_user,
                        deleted_for: msg.deleted_for
                    });

                    // Notify via socket for each message
                    if (req.io) {
                        const participants = isGroup ? [] : [msg.user_id.toString()];
                        if (!isGroup && msg.receiver_id) participants.push(msg.receiver_id.toString());

                        if (isGroup) {
                            const group = await Group.findById(msg.group_id);
                            if (group) {
                                group.members.forEach(mId => participants.push(mId.toString()));
                            }
                        }

                        [...new Set(participants)].forEach(pId => {
                            req.io.to(pId).emit('message_deleted', {
                                messageId: msg._id,
                                is_deleted_by_admin: msg.is_deleted_by_admin,
                                is_deleted_by_user: msg.is_deleted_by_user
                            });
                        });

                        // Also notify admins with enriched data
                        (async () => {
                            try {
                                const deleterName = req.user.name || (userRole === 'admin' ? 'Admin' : 'User');
                                let partnerName = 'Unknown';
                                const contentSnippet = (msg.content || '').substring(0, 50);

                                if (isGroup) {
                                    const group = await Group.findById(msg.group_id);
                                    partnerName = group ? group.name : 'Group Chat';
                                } else {
                                    const otherUserId = ownerId === userId ? msg.receiver_id : msg.user_id;
                                    const otherUser = await User.findById(otherUserId);
                                    partnerName = otherUser ? (otherUser.name || `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim()) : 'User';
                                }

                                req.io.to('admins').emit('message_deleted_admin', {
                                    messageId: msg._id,
                                    deletedBy: deleterName,
                                    partnerName,
                                    contentSnippet,
                                    isGroup,
                                    is_deleted_by_admin: msg.is_deleted_by_admin,
                                    is_deleted_by_user: msg.is_deleted_by_user,
                                    recordType: 'deletion',
                                    timestamp: new Date(),
                                    userId: isGroup ? msg.sender_id : msg.user_id,
                                    receiverId: isGroup ? null : msg.receiver_id,
                                    groupId: isGroup ? msg.group_id : null
                                });
                            } catch (err) {
                                console.error('[BULK SOCKET ADMIN NOTIFY ERROR]', err);
                            }
                        })();
                    }
                }
            } catch (innerErr) {
                console.error(`[BULK DELETE] Error processing message ${id}:`, innerErr);
                // Continue to next message instead of failing whole request
            }
        }

        res.json({ status: 'success', results, deletedIds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Delete complete chat history (For Me)
router.post('/chat/delete-history', authenticateToken, async (req, res) => {
    const { contactId, isGroup, contactName } = req.body;
    const userId = req.user.id;
    try {
        if (isGroup) {
            await GroupMessage.updateMany(
                { group_id: contactId },
                { $addToSet: { deleted_for: userId } }
            );
        } else {
            // First, record the deletion for admin tracking
            await ChatDeletion.create({
                userId: userId,
                contactId: contactId,
                contactName: contactName,
                deletedAt: new Date()
            });

            // Then, hide existing messages for the user
            await Message.updateMany(
                {
                    $or: [
                        { user_id: userId, receiver_id: contactId },
                        { user_id: contactId, receiver_id: userId }
                    ]
                },
                { $addToSet: { deleted_for: userId } }
            );

            // Also reset the message request status to 'pending' or remove it 
            // so starting a new chat requires a fresh request.
            await MessageRequest.deleteMany({
                $or: [
                    { sender_id: new mongoose.Types.ObjectId(userId), receiver_id: new mongoose.Types.ObjectId(contactId) },
                    { sender_id: new mongoose.Types.ObjectId(contactId), receiver_id: new mongoose.Types.ObjectId(userId) }
                ]
            });
        }
        res.json({ status: 'success' });
    } catch (err) {
        console.error('[DELETE HISTORY ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Unethical Messages (Persistence) - Admin Only
router.get('/admin/unethical-messages', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
        // Fetch last 50 flagged messages
        const messages = await Message.find({ is_flagged: true })
            .sort({ created_at: -1 })

            .populate('user_id', 'name email __enc_name __enc_email');

        const alerts = [];
        for (const msg of messages) {
            let userDoc = msg.user_id;
            let name = 'Unknown';

            if (userDoc) {
                // Determine if it was populated or remains an ID
                if (typeof userDoc.toObject === 'function') {
                    // Try to get name from populated document
                    const uObj = userDoc.toObject({ virtuals: true });
                    name = uObj.name || 'Unknown';

                    // FALLBACK: If name is still a hash (contains colon), perform a fresh fetch
                    if (name.includes(':') && name.length > 50) {
                        const directUser = await User.findById(userDoc._id);
                        if (directUser) {
                            const dObj = directUser.toObject({ virtuals: true });
                            name = dObj.name || name;
                        }
                    }
                } else {
                    // It's just an ID, fetch and decrypt
                    const directUser = await User.findById(userDoc);
                    if (directUser) {
                        const dObj = directUser.toObject({ virtuals: true });
                        name = dObj.name || 'Unknown';
                        userDoc = directUser; // Update for ID reference
                    }
                }
            }

            alerts.push({
                userId: userDoc?._id || userDoc,
                userName: name,
                messageId: msg._id,
                content: msg.content,
                reason: msg.flag_reason,
                createdAt: msg.created_at,
                receiverId: msg.receiver_id
            });
        }

        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// MESSAGE REQUEST ROUTES
// ============================================================

// GET pending message requests for the current user
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.id;

        // Step 1: Get raw pending request documents
        const rawRequests = await MessageRequest.find({
            receiver_id: currentUserId,
            status: 'pending'
        }).then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        console.log('[REQUESTS] Raw requests found:', rawRequests.length);

        if (rawRequests.length === 0) {
            return res.json([]);
        }

        // Step 2: Filter out stale requests where real chat history already exists.
        // These are requests created erroneously — the users already have an established relationship.
        const validRequests = [];
        for (const r of rawRequests) {
            // Check if the current user (receiver) has visible history
            const receiverHasHistory = await Message.countDocuments({
                $or: [
                    { user_id: new mongoose.Types.ObjectId(r.sender_id), receiver_id: new mongoose.Types.ObjectId(currentUserId) },
                    { user_id: new mongoose.Types.ObjectId(currentUserId), receiver_id: new mongoose.Types.ObjectId(r.sender_id) }
                ],
                deleted_for: { $ne: new mongoose.Types.ObjectId(currentUserId) }
            });

            // Also check if the sender has visible history. 
            // If the sender has no history, they are starting fresh — so we MUST show the request.
            const senderHasHistoryCount = await Message.countDocuments({
                $or: [
                    { user_id: new mongoose.Types.ObjectId(r.sender_id), receiver_id: new mongoose.Types.ObjectId(currentUserId) },
                    { user_id: new mongoose.Types.ObjectId(currentUserId), receiver_id: new mongoose.Types.ObjectId(r.sender_id) }
                ],
                deleted_for: { $ne: new mongoose.Types.ObjectId(r.sender_id) }
            });

            if (receiverHasHistory > 0 && senderHasHistoryCount > 0) {
                // Both have history — request is definitely stale (likely from a bug or old state)
                await MessageRequest.updateOne({ _id: r._id }, { status: 'accepted', updated_at: new Date() });
                console.log(`[REQUESTS] Auto-accepted stale request ${r._id} (both sides have history)`);
            } else {
                // Either sender or receiver (or both) have NO history — treat as valid fresh start/new contact
                validRequests.push(r);
            }
        }

        if (validRequests.length === 0) {
            return res.json([]);
        }

        // Step 3: Fetch sender users manually using the sender_id values
        const senderIds = validRequests.map(r => r.sender_id).filter(Boolean);
        const senders = await User.find({ _id: { $in: senderIds } })
            .select('name email mobile __enc_name __enc_email __enc_mobile')
            .then(r => Array.isArray(r) ? r.map(d => d.toObject()) : (r ? r.toObject() : null));

        // Build lookup map
        const senderMap = {};
        senders.forEach(s => { senderMap[String(s._id)] = s; });

        // Step 4: Build response
        const formatted = validRequests.map(r => {
            const sender = senderMap[String(r.sender_id)];
            return {
                _id: r._id,
                fromUserId: sender ? {
                    _id: sender._id,
                    name: sender.name,
                    email: sender.email,
                    mobile: sender.mobile,
                } : { _id: r.sender_id, name: 'Unknown User' },
                messagePreview: null,
                status: r.status,
                created_at: r.created_at
            };
        });

        console.log('[REQUESTS] Final response:', formatted.map(f => ({ id: f._id, name: f.fromUserId?.name })));
        res.json(formatted);
    } catch (err) {
        console.error('[REQUESTS] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST accept a message request
router.post('/requests/accept', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.body;
        const currentUserId = req.user.id;

        const request = await MessageRequest.findById(requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (String(request.receiver_id) !== String(currentUserId)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        request.status = 'accepted';
        request.updated_at = new Date();
        await request.save();

        // Notify the sender that their request was accepted
        if (req.io) {
            const receiver = await User.findById(currentUserId).select('name __enc_name');
            req.io.to(String(request.sender_id)).emit('request_accepted', {
                requestId: request._id,
                receiverName: receiver ? receiver.name : 'User'
            });
        }

        res.json({ status: 'accepted', requestId });
    } catch (err) {
        console.error('[REQUESTS] Accept error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST reject a message request — applies 24-hour ban; 3 strikes = account locked
router.post('/requests/reject', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.body;
        const currentUserId = req.user.id;

        const request = await MessageRequest.findById(requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (String(request.receiver_id) !== String(currentUserId)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        request.status = 'rejected';
        request.updated_at = new Date();
        await request.save();

        // Apply penalty to sender
        const sender = await User.findById(request.sender_id);
        if (!sender) return res.status(404).json({ error: 'Sender not found' });

        sender.rejectionCount = (sender.rejectionCount || 0) + 1;

        if (sender.rejectionCount >= 6) {
            // Six strikes (including 6th) — lock account
            sender.adminLock = true;
            await sender.save();

            if (req.io) {
                req.io.to(String(sender._id)).emit('account_locked', {
                    message: 'Your account has been locked due to multiple rejections.'
                });
                req.io.to('admins').emit('account_locked_notify', {
                    userId: sender._id,
                    userName: sender.name,
                    rejectionCount: sender.rejectionCount
                });
            }
        } else {
            // Temporary 24-hour ban
            sender.bannedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await sender.save();

            if (req.io) {
                req.io.to(String(sender._id)).emit('account_banned', {
                    bannedUntil: sender.bannedUntil,
                    message: 'You have been temporarily restricted from sending requests for 24 hours.'
                });
            }
        }

        if (req.io) {
            req.io.to(String(request.sender_id)).emit('message_restriction_updated', {
                targetId: currentUserId,
                status: 'rejected',
                updatedAt: request.updated_at,
                rejectedBy: currentUserId
            });
            req.io.to(String(currentUserId)).emit('message_restriction_updated', {
                targetId: request.sender_id,
                status: 'rejected',
                updatedAt: request.updated_at,
                rejectedBy: currentUserId
            });
        }

        res.json({ status: 'rejected', requestId, rejectionCount: sender.rejectionCount });
    } catch (err) {
        console.error('[REQUESTS] Reject error:', err);
        res.status(500).json({ error: err.message });
    }
});

// React to a message (P2P or Group)
router.post('/messages/:messageId/react', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji, isGroup } = req.body;
        const userId = req.user.id;

        const Model = isGroup ? GroupMessage : Message;
        const message = await Model.findById(messageId);

        if (!message) return res.status(404).json({ error: 'Message not found' });

        // Check if user already reacted with ANY emoji in this message
        const reactions = message.reactions || [];
        const existingIndex = reactions.findIndex(r => String(r.user_id) === String(userId));
        let logAction = 'added';
        let logEmoji = emoji;

        let historyEvents = [];
        if (existingIndex > -1) {
            const previousEmoji = message.reactions[existingIndex].emoji;
            if (previousEmoji === emoji) {
                // Case 1: Simple Removal
                message.reactions.splice(existingIndex, 1);
                historyEvents.push({ emoji: emoji, action: 'removed' });
            } else {
                // Case 2: Replacement (Update)
                message.reactions[existingIndex].emoji = emoji;
                message.reactions[existingIndex].created_at = new Date();
                historyEvents.push({ emoji: previousEmoji, action: 'removed' });
                historyEvents.push({ emoji: emoji, action: 'added' });
            }
        } else {
            // Case 3: Initial Addition
            message.reactions.push({ user_id: userId, emoji, created_at: new Date() });
            historyEvents.push({ emoji: emoji, action: 'added' });
        }

        await message.save();

        // --- Permanent Audit Logging & Socket Notifications ---
        for (const event of historyEvents) {
            try {
                await ReactionLog.create({
                    message_id: messageId,
                    user_id: userId,
                    emoji: event.emoji,
                    action: event.action,
                    isGroup: isGroup === true || isGroup === 'true',
                    timestamp: new Date()
                });

                if (req.io) {
                    req.io.to('admins').emit('reaction_audit_log', {
                        messageId,
                        user_id: { _id: userId, name: req.user.name }, // Pass basic user info
                        emoji: event.emoji,
                        action: event.action,
                        timestamp: new Date()
                    });
                }
            } catch (auditErr) {
                console.error('[REACTION_AUDIT] Failed to log/emit event:', auditErr);
            }
        }

        if (req.io) {
            const reactionData = { messageId, reactions: message.reactions, isGroup };
            req.io.to('admins').emit('message_reaction_updated', reactionData);

            if (isGroup) {
                const group = await Group.findById(message.group_id);
                if (group) {
                    group.members.forEach(mId => {
                        req.io.to(String(mId)).emit('message_reaction_updated', reactionData);
                    });
                }
            } else {
                [String(message.user_id), String(message.receiver_id)].forEach(pId => {
                    if (pId && pId !== 'null') {
                        req.io.to(pId).emit('message_reaction_updated', reactionData);
                    }
                });
            }
        }

        res.json({ status: 'success', reactions: message.reactions });
    } catch (err) {
        console.error('[REACTIONS] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Send Event (P2P)
router.post('/event/send', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { toUserId, eventData } = req.body;

    if (!toUserId || !eventData || !eventData.name) {
        return res.status(400).json({ error: 'Missing toUserId or eventData' });
    }

    try {
        const msg = await Message.create({
            user_id: userId,
            receiver_id: toUserId,
            role: 'user',
            content: eventData.name,
            type: 'event',
            event: {
                ...eventData,
                participants: [userId] // Creator is participant
            }
        });

        const populated = await Message.findById(msg._id).populate('user_id', 'name _id');
        const msgObj = populated.toObject();

        if (req.io) {
            req.io.to(String(toUserId)).emit('receive_message', msgObj);
        }

        res.json({ status: 'sent', message: msgObj });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Join Event (P2P)
router.post('/event/:messageId/join', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        if (!msg.event.participants) msg.event.participants = [];
        const index = msg.event.participants.indexOf(userId);
        if (index === -1) {
            msg.event.participants.push(userId);
        } else {
            msg.event.participants.splice(index, 1);
        }

        msg.markModified('event');
        await msg.save();

        const msgObj = msg.toObject();

        if (req.io) {
            [String(msg.user_id), String(msg.receiver_id)].forEach(pId => {
                req.io.to(pId).emit('event_updated', {
                    messageId: msg._id,
                    event: msgObj.event
                });
            });
        }

        res.json({ status: 'success', event: msgObj.event });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit Event (P2P)
router.post('/event/:messageId/edit', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        // Only creator can edit for now
        if (String(msg.user_id) !== String(userId)) return res.status(403).json({ error: 'Not allowed' });

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
            [String(msg.user_id), String(msg.receiver_id)].forEach(pId => {
                if (pId && pId !== 'null') req.io.to(pId).emit('event_updated', { messageId: msg._id, event: msgObj.event });
            });
        }

        res.json({ status: 'success', event: msgObj.event });
    } catch (err) {
        console.error('[EVENT EDIT P2P] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Cancel Event (P2P)
router.post('/event/:messageId/cancel', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg || msg.type !== 'event') return res.status(404).json({ error: 'Event not found' });

        // Only creator can cancel for now
        if (String(msg.user_id) !== String(userId)) return res.status(403).json({ error: 'Not allowed' });

        msg.event = msg.event || {};
        msg.event.cancelled = true;
        msg.event.cancelledBy = userId;
        msg.event.cancelledAt = new Date();
        msg.markModified('event');
        await msg.save();

        const msgObj = msg.toObject();

        // Emit update
        if (req.io) {
            [String(msg.user_id), String(msg.receiver_id)].forEach(pId => {
                if (pId && pId !== 'null') req.io.to(pId).emit('event_updated', { messageId: msg._id, event: msgObj.event });
            });
        }

        // Create a system message informing about cancellation
        const otherId = String(msg.user_id) === String(userId) ? String(msg.receiver_id) : String(msg.user_id);
        const sys = await Message.create({
            user_id: userId,
            receiver_id: otherId,
            role: 'system',
            type: 'system',
            is_system: true,
            content: `cancelled the event: ${msg.event.name}`
        });

        const sysRes = await Message.findById(sys._id);
        const sysObj = sysRes ? sysRes.toObject() : sys.toObject();
        if (req.io) {
            [String(msg.user_id), String(msg.receiver_id)].forEach(pId => {
                if (pId && pId !== 'null') req.io.to(pId).emit('receive_message', sysObj);
            });
        }

        res.json({ status: 'success', event: msgObj.event, system: sysObj });
    } catch (err) {
        console.error('[EVENT CANCEL P2P] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
