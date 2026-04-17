require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const User = require('./models/User');
const fs = require('fs');

async function debugData() {
    const logFile = 'debug_results.log';
    fs.writeFileSync(logFile, ''); // Clear file

    function log(msg) {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\r\n');
    }

    try {
        await mongoose.connect(process.env.MONGO_URI);
        log('Connected to MongoDB.\n');

        const users = await User.find().lean();
        log(`Total Users: ${users.length}`);

        for (const user of users) {
            const aiMsgCount = await Message.countDocuments({ user_id: user._id, receiver_id: null });
            const p2pCount = await Message.countDocuments({ user_id: user._id, receiver_id: { $ne: null } });

            log(`User: ${user.name} (${user.email}) [ID: ${user._id}]`);
            log(`   - AI Messages: ${aiMsgCount}`);
            log(`   - P2P Messages: ${p2pCount}`);

            if (aiMsgCount > 0) {
                const last = await Message.findOne({ user_id: user._id, receiver_id: null }).sort({ created_at: -1 });
                log(`   - Last AI Interaction: ${last.created_at} - "${last.content ? last.content.substring(0, 30) : 'NO CONTENT'}..."`);
            }
            if (user.email.includes("jyotsna")) {
                log("   *** THIS IS THE JYOTSNA ACCOUNT ***");
            }
            log('--------------------------------------------------');
        }

        process.exit();
    } catch (err) {
        log('Error: ' + err.message);
        process.exit(1);
    }
}

debugData();
