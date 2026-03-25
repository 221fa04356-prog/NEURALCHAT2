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
        content: 'Test Manual Decrypt ' + Date.now()
    });
    
    await msg.save();
    console.log('After save (content):', msg.content); // Probably hash
    
    // Check if decrypt() exists and works
    if (typeof msg.decrypt === 'function') {
        msg.decrypt();
        console.log('After manual decrypt():', msg.content);
    } else {
        console.log('decrypt() method not found on document');
    }
    
    mongoose.connection.close();
}
test();
