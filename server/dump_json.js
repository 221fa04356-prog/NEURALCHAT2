const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const fs = require('fs');

async function dump() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const messages = await Message.find().sort({ created_at: -1 }).limit(10);
        const data = messages.map(m => ({
            _id: m._id,
            role: m.role,
            content: m.content,
            __enc_content: m.__enc_content,
            obj: m.toObject()
        }));
        fs.writeFileSync('real_dump.json', JSON.stringify(data, null, 2));
        mongoose.connection.close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

dump();
