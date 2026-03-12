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
        origin: ["https://chatneural2-frontend.onrender.com"], // Client URLs
        methods: ["GET", "POST"]
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
app.use(cors());
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

    socket.on('send_message', (data) => {
        console.log(`Socket: Message from ${userId} to ${data.receiverId}`);
        const secureData = {
            ...data,
            sender_id: userId,
            user_id: userId
        };
        io.to(data.receiverId).emit('receive_message', secureData);
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
