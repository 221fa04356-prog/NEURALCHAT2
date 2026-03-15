const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const MessageRequest = require('./models/MessageRequest');

const cleanup = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Delete all message requests
        const dr = await MessageRequest.deleteMany({});
        console.log(`Deleted ${dr.deletedCount} message requests`);

        // Reset user penalties
        const ur = await User.updateMany({}, {
            $set: {
                rejectionCount: 0,
                bannedUntil: null,
                adminLock: false
            }
        });
        console.log(`Reset penalties for ${ur.modifiedCount} users`);

        await mongoose.disconnect();
        console.log('Done');
        process.exit(0);
    } catch (err) {
        console.error('Cleanup failed:', err);
        process.exit(1);
    }
};

cleanup();
