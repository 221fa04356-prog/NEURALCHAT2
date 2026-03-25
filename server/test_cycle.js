const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('--- CONNECTED ---');

    const originalContent = 'HELLO WORLD TEST ' + Date.now();
    const msg = new Message({
        user_id: new mongoose.Types.ObjectId(),
        receiver_id: new mongoose.Types.ObjectId(),
        role: 'user',
        content: originalContent
    });

    console.log('1. Initial content:', msg.content);
    await msg.save();
    console.log('2. After save (in memory content):', msg.content);
    console.log('3. After save (in memory enc flag):', msg.__enc_content);

    const found = await Message.findById(msg._id);
    console.log('4. After findById (content):', found.content);
    console.log('5. After findById (enc flag):', found.__enc_content);

    const raw = await mongoose.connection.db.collection('messages').findOne({ _id: msg._id });
    console.log('6. Raw DB Content:', raw.content);
    console.log('7. Raw DB enc flag:', raw.__enc_content);

    if (raw.content !== originalContent) {
        console.log('SUCCESS: Content is encrypted in DB');
    } else {
        console.log('FAILURE: Content is NOT encrypted in DB');
    }

    if (found.content === originalContent) {
        console.log('SUCCESS: Content is decrypted in Mongoose');
    } else {
        console.log('FAILURE: Content is NOT decrypted in Mongoose');
    }

    mongoose.connection.close();
}

test();
