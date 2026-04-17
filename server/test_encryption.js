const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const testMsg = await Message.create({
            user_id: new mongoose.Types.ObjectId(),
            role: 'user',
            content: 'Hello World Test'
        });
        console.log('Created message:', testMsg.content);

        const retrieved = await Message.findById(testMsg._id);
        console.log('Retrieved message content:', retrieved.content);
        console.log('Retrieved message object:', retrieved.toObject());

        await Message.deleteOne({ _id: testMsg._id });
        mongoose.connection.close();
    } catch (e) {
        console.error('Test error:', e);
        process.exit(1);
    }
}

test();
