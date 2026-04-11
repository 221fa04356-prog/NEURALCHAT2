require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./database');

const http = require('http');
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'neural_secret_77';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL, "http://localhost:5173"] : true,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Connect to Database
connectDB().then(async () => {
    try {
        const User = require('./models/User');
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
});

const corsOptions = {
    origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL, "http://localhost:5173"] : true,
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
app.use('/api/chat', require('./routes/chat'));
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
            io.emit('user_status_change', { userId: userId, isOnline: true });
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
        console.log(`Socket: Message from ${userId} to ${data.receiverId}`);
        const secureData = {
            ...data,
            sender_id: userId,
            user_id: userId
        };

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
                // Accepted — relay message normally
                io.to(receiverId).emit('receive_message', secureData);
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
            // Fallback: relay message anyway to avoid breaking chat
            io.to(data.receiverId).emit('receive_message', secureData);
        }
    });

    socket.on('typing', async (data) => {
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
    });

    socket.on('stop_typing', async (data) => {
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
    });

    socket.on('disconnect', async (reason) => {
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
                io.emit('user_status_change', { userId: userId, isOnline: false, lastSeen });
            } catch (err) { console.error("Error updating offline status:", err); }
        } else {
            userSocketCount.set(userId, newCount);
        }
    });
});

const getLocalIp = require('./utils/getLocalIp');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const localIp = getLocalIp();
    console.log(`Server running on port ${PORT}`);
    console.log(`> Local:   http://localhost:${PORT}`);
    console.log(`> Network: http://${localIp}:${PORT}`);
});
