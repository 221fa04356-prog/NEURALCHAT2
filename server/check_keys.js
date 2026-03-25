const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    const msg = new Message({
        user_id: new mongoose.Types.ObjectId(),
        role: 'user',
        content: 'Testing Encryption Keys ' + Date.now()
    });
    await msg.save();
    
    const raw = await mongoose.connection.db.collection('messages').findOne({ _id: msg._id });
    console.log('Raw keys for NEW message:', Object.keys(raw));
    console.log('__enc_content value:', raw.__enc_content);
    
    mongoose.connection.close();
}
test();
