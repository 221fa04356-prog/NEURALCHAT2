const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');

// Define Schema
const testSchema = new mongoose.Schema({
    content: { type: String }
});

const { fieldEncryption } = require('mongoose-field-encryption');
testSchema.plugin(fieldEncryption, {
    fields: ["content"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

// Explicitly add flag with select: true
testSchema.add({
    __enc_content: { type: Boolean, select: true }
});

const TestModel = mongoose.model('TestSelection', testSchema);

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('--- CONNECTED ---');

    const msg = new TestModel({ content: 'Secret Data ' + Date.now() });
    await msg.save();
    console.log('Saved with __enc_content:', msg.__enc_content);

    // Try selecting ONLY content
    const found = await TestModel.findById(msg._id).select('content');
    console.log('Found with select("content"):', found.toJSON());
    console.log('Decrypted?', found.content.startsWith('Secret Data'));

    mongoose.connection.close();
}
test();
