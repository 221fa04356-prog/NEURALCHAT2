require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const User = require('./models/User');

async function checkHistory() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        const userCount = await User.countDocuments();
        console.log(`Total Users: ${userCount}`);

        const msgCount = await Message.countDocuments();
        console.log(`Total Messages: ${msgCount}`);

        // Check specifically for AI messages
        const aiMsgCount = await Message.countDocuments({ role: { $in: ['model', 'ai'] } });
        console.log(`AI Messages: ${aiMsgCount}`);

        if (msgCount > 0) {
            const lastMsg = await Message.findOne().sort({ created_at: -1 });
            console.log("Latest Message Date:", lastMsg.created_at);
        }

        process.exit();
    } catch (err) {
        console.error('DB Error:', err.message);
        process.exit(1);
    }
}

checkHistory();
