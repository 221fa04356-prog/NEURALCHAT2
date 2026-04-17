const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatNeural2';
const Group = require('./models/Group');

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const result = await Group.updateMany(
            { name: 'Announcements' },
            { $set: { isAnnouncementGroup: true } }
        );
        console.log(`Updated ${result.modifiedCount} announcement groups by name.`);
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
run();
