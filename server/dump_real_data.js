const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

async function dump() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const messages = await Message.find().sort({ created_at: -1 }).limit(10);
        console.log('Messages count:', messages.length);

        messages.forEach(m => {
            console.log('--- Message', m._id, '---');
            console.log('Role:', m.role);
            console.log('Has Content:', !!m.content);
            console.log('Raw Content:', m.content);
            console.log('Enc status:', m.__enc_content);
            console.log('Object Keys:', Object.keys(m.toObject()));
        });

        mongoose.connection.close();
    } catch (e) {
        console.error('Dump error:', e);
        process.exit(1);
    }
}

dump();
