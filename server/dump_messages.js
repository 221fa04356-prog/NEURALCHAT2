const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function dump() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const messages = await Message.find().sort({ created_at: -1 }).limit(3);
        console.log('Latest 3 messages:');
        messages.forEach(m => {
            console.log('ID:', m._id);
            console.log('Encrypted status:', m.__enc_content || m.__enc_file_path || "No flags");
            console.log('Content (before toObject):', m.content);
            console.log('Object:', m.toObject());
        });

        mongoose.connection.close();
    } catch (e) {
        console.error('Dump error:', e);
        process.exit(1);
    }
}

dump();
