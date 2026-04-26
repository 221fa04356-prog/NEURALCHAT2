require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const connectDB = require('./database');

const http = require('http');
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

const isDevClientOrigin = (origin = '') => {
    if (!origin) return false;
    try {
        const parsed = new URL(origin);
        const host = String(parsed.hostname || '').toLowerCase();
        const port = String(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
        if (port !== '5173') return false;
        return host === 'localhost'
            || host === '127.0.0.1'
            || /^10\./.test(host)
            || /^192\.168\./.test(host)
            || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    } catch (_) {
        return false;
    }
};

const buildAllowedOrigins = () => {
    const fromEnv = String(process.env.CLIENT_URL || '').trim();
    if (!fromEnv) return null;
    return [
        fromEnv,
        'http://localhost:5173',
        'https://localhost:5173',
        'http://127.0.0.1:5173',
        'https://127.0.0.1:5173'
    ];
};

const strictAllowedOrigins = buildAllowedOrigins();
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (strictAllowedOrigins) return strictAllowedOrigins.includes(origin) || isDevClientOrigin(origin);
    return true;
};

const corsOrigin = (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
};

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const startWindowsOpenHelper = () => {
    if (process.platform !== 'win32') return;
    if (process.env.NEURALCHAT_DISABLE_OPEN_HELPER === '1') return;

    try {
        const child = spawn(process.execPath, [path.join(__dirname, 'scripts', 'windows-open-helper.js')], {
            cwd: __dirname,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
    } catch (error) {
        console.error('[STARTUP] Failed to start Windows open helper:', error.message || error);
    }
};

startWindowsOpenHelper();

const corsOptions = {
    origin: corsOrigin,
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware to pass io to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);
// Backward-compatible alias: some clients may hit /chat/* directly.
app.use('/chat', chatRoutes);
app.use('/api/groups', require('./routes/groups'));
app.use('/api/communities', require('./routes/communities'));

// Socket.io Logic
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return next(new Error("Authentication error"));

        try {
            // Check for Single Session (Token Version)
            const User = require('./models/User'); // Lazy load
            const user = await User.findById(decoded.id);

            if (!user) return next(new Error("User not found"));

            // If token has version, check it. (Old tokens might not have it yet, handle gracefully or strictly)
            if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
                return next(new Error("Session expired. Logged in on another device."));
            }

            socket.userId = decoded.id; // Attach userId to socket
            socket.role = user.role;    // Attach role to socket
            next();
        } catch (dbErr) {
            console.error(dbErr);
            return next(new Error("Server error"));
        }
    });
});

const User = require('./models/User'); // Import User model
const MessageRequest = require('./models/MessageRequest'); // Import MessageRequest model

// Track active connections per user
const userSocketCount = new Map();

io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`[SOCKET] User connected: ${userId} (Socket ID: ${socket.id})`);
    const userRole = socket.role;
    console.log('User connected:', userId, 'Role:', userRole);
    socket.join(userId);

    if (userRole === 'admin') {
        socket.join('admins');
        console.log(`Admin ${userId} joined admins room`);
    }

    // Increment connection count
    const currentCount = userSocketCount.get(userId) || 0;
    userSocketCount.set(userId, currentCount + 1);
    console.log(`[SOCKET] User ${userId} connection count: ${currentCount + 1}`);

    // Only update status to online if this is the first connection
    if (currentCount === 0) {
        try {
            await User.findByIdAndUpdate(userId, { isOnline: true });
            console.log(`[STATUS] User ${userId} is now ONLINE. Emitting status change.`);
            io.emit('user_status_change', { userId: userId, isOnline: true, status: 'online' });
        } catch (err) { console.error("Error updating online status:", err); }
    }

    socket.emit('debug_hello', { message: 'Hello from server' });

    socket.on('join_room', (roomUserId) => {
        if (roomUserId !== userId) {
            console.log(`User ${userId} attempted to join unauthorized room ${roomUserId}`);
            return;
        }
        socket.join(roomUserId);
        console.log(`User ${userId} joined room ${roomUserId}`);
    });

    socket.on('send_message', async (data) => {
        const receiverId = data.receiverId;
        console.log(`Socket: Message from ${userId} to ${receiverId}`);
        const secureData = {
            ...data,
            sender_id: userId,
            user_id: userId
        };

        // Send to receiver instantly (CORE REAL-TIME CHAT FLOW)
        io.to(receiverId).emit('receive_message', secureData);

        // Notify Admins for real-time review
        io.to('admins').emit('receive_message', secureData);

        try {
            const receiverId = data.receiverId;

            // Check if there is an accepted request (either direction)
            const acceptedRequest = await MessageRequest.findOne({
                $or: [
                    { sender_id: userId, receiver_id: receiverId, status: 'accepted' },
                    { sender_id: receiverId, receiver_id: userId, status: 'accepted' }
                ]
            });

            if (acceptedRequest) {
                // Accepted — relay message normally processed
                return;
            }

            // Check if a pending request already exists from this sender to this receiver
            const existingRequest = await MessageRequest.findOne({
                sender_id: userId,
                receiver_id: receiverId
            });

            if (!existingRequest) {
                // First message — create the request and notify receiver
                await MessageRequest.create({
                    sender_id: userId,
                    receiver_id: receiverId,
                    status: 'pending'
                });

                const senderUser = await User.findById(userId).select('name __enc_name');
                const senderName = senderUser ? senderUser.name : 'Someone';

                io.to(receiverId).emit('new_message_request', {
                    senderId: userId,
                    senderName,
                    requestCreated: true
                });

                console.log(`[MSG_REQUEST] New request from ${userId} to ${receiverId}`);
            } else if (existingRequest.status === 'rejected') {
                // Check if ban is still active
                const sender = await User.findById(userId).select('bannedUntil adminLock name __enc_name');
                
                if (sender.adminLock) {
                     socket.emit('account_locked', { message: 'Your account is permanently locked from messaging.' });
                     return;
                }

                if (sender.bannedUntil && new Date() < new Date(sender.bannedUntil)) {
                    // Still banned
                    socket.emit('account_banned', { 
                        bannedUntil: sender.bannedUntil,
                        message: 'You are temporarily restricted from messaging.' 
                    });
                    console.log(`[MSG_REQUEST] User ${userId} is still banned until ${sender.bannedUntil}`);
                    return;
                } else {
                    // Ban expired! Allow them to re-request (reset status to pending)
                    existingRequest.status = 'pending';
                    existingRequest.created_at = new Date();
                    await existingRequest.save();

                    io.to(receiverId).emit('new_message_request', {
                        senderId: userId,
                        senderName: sender.name,
                        requestCreated: true
                    });
                    console.log(`[MSG_REQUEST] Ban expired for ${userId}, request reset to pending.`);
                }
            } else {
                console.log(`[MSG_REQUEST] Request already exists (status: ${existingRequest.status}), not relaying.`);
            }
            // Do NOT relay message — receiver must accept first
        } catch (err) {
            console.error('[MSG_REQUEST] Error in send_message handler:', err);
        }
    });

    socket.on('group_message', async (data) => {
        try {
            const { groupId, message } = data;
            const Group = require('./models/Group');
            const group = await Group.findById(groupId);
            if (group) {
                // Relay to all members
                group.members.forEach(memberId => {
                    io.to(memberId.toString()).emit('receive_group_message', {
                        groupId: groupId,
                        message: message
                    });
                });
                // Notify admins
                io.to('admins').emit('receive_group_message', {
                    groupId: groupId,
                    message: message
                });
            }
        } catch (err) {
            console.error('[SOCKET group_message ERROR]', err);
        }
    });

    socket.on('typing', async (data) => {
        try {
            const { receiverId, isGroup } = data;
            // Notify Admins
            io.to('admins').emit('user_typing', { userId, receiverId, isGroup });

            if (isGroup) {
                const Group = require('./models/Group');
                const group = await Group.findById(receiverId);
                if (group) {
                    group.members.forEach(memberId => {
                        if (memberId.toString() !== userId) {
                            io.to(memberId.toString()).emit('user_typing', { userId, groupId: receiverId });
                        }
                    });
                }
            } else {
                io.to(receiverId).emit('user_typing', { userId });
            }
        } catch (err) {
            console.error('[SOCKET typing ERROR]', err);
        }
    });

    socket.on('stop_typing', async (data) => {
        try {
            const { receiverId, isGroup } = data;
            // Notify Admins
            io.to('admins').emit('user_stop_typing', { userId, receiverId, isGroup });

            if (isGroup) {
                const Group = require('./models/Group');
                const group = await Group.findById(receiverId);
                if (group) {
                    group.members.forEach(memberId => {
                        if (memberId.toString() !== userId) {
                            io.to(memberId.toString()).emit('user_stop_typing', { userId, groupId: receiverId });
                        }
                    });
                }
            } else {
                io.to(receiverId).emit('user_stop_typing', { userId });
            }
        } catch (err) {
            console.error('[SOCKET stop_typing ERROR]', err);
        }
    });

    socket.on('disconnect', async (reason) => {
        try {
            console.log(`[SOCKET] User disconnected: ${userId} (Reason: ${reason})`);
 
            // Decrement connection count
            const newCount = (userSocketCount.get(userId) || 1) - 1;
            console.log(`[SOCKET] User ${userId} remaining connections: ${newCount}`);
 
            if (newCount <= 0) {
                userSocketCount.delete(userId);
                const lastSeen = new Date();
                try {
                    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
                    console.log(`[STATUS] User ${userId} is now OFFLINE. Last seen: ${lastSeen}`);
                    io.emit('user_status_change', { userId: userId, isOnline: false, status: 'offline', lastSeen });
                } catch (err) {
                    console.error('Error updating offline status:', err);
                }
            } else {
                userSocketCount.set(userId, newCount);
            }
        } catch (err) {
            console.error('[SOCKET disconnect ERROR]', err);
        }
    });
});

const getLocalIp = require('./utils/getLocalIp');

const PORT = process.env.PORT || 3000;
const bootstrap = async () => {
    await connectDB();

    try {
        // Reset anyone who was stuck "Online" due to a server crash/restart
        const result = await User.updateMany(
            { isOnline: true },
            { isOnline: false, lastSeen: new Date() }
        );
        if (result.modifiedCount > 0) {
            console.log(`[STARTUP] Reset ${result.modifiedCount} stuck users to offline status`);
        } else {
            console.log('[STARTUP] All users were already offline');
        }
    } catch (err) {
        console.error('[STARTUP] Error resetting user statuses on startup:', err);
    }

    server.listen(PORT, () => {
        const localIp = getLocalIp();
        console.log(`Server running on port ${PORT}`);
        console.log(`> Local:   http://localhost:${PORT}`);
        console.log(`> Network: http://${localIp}:${PORT}`);
    });
};

bootstrap().catch((err) => {
    console.error('[STARTUP FATAL]', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});
