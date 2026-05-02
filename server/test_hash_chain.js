require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');
const GroupMessage = require('./models/GroupMessage');
const User = require('./models/User');
const { calculateMessageHash } = require('./utils/messageHash');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const verifyChain = async (type, id) => {
    console.log(`\n--- Verifying ${type} Chain for ID: ${id} ---`);
    
    let messages = [];
    if (type === 'p2p') {
        messages = await Message.find({
            $or: [
                { user_id: id },
                { receiver_id: id }
            ]
        }).sort({ created_at: 1 });
    } else if (type === 'group') {
        messages = await GroupMessage.find({ group_id: id }).sort({ created_at: 1 });
    } else if (type === 'ai') {
        messages = await Message.find({ user_id: id, receiver_id: null }).sort({ created_at: 1 });
    }

    if (messages.length === 0) {
        console.log('No messages found for this target.');
        return;
    }

    let isValid = true;
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const prevHash = i === 0 ? 'GENESIS_BLOCK' : messages[i - 1].message_hash;

        // Verify previous hash link
        if (msg.previous_message_hash !== prevHash) {
            console.error(`[INVALID LINK] Message ${msg._id} has broken link!`);
            console.log(`Expected Prev: ${prevHash}`);
            console.log(`Actual Prev:   ${msg.previous_message_hash}`);
            isValid = false;
        }

        // Verify current hash integrity
        const senderId = msg.role === 'model' ? 'AI_MODEL' : msg.user_id || msg.sender_id;
        const receiverId = (type === 'p2p' || type === 'ai') ? (msg.receiver_id || (msg.role === 'model' ? msg.user_id : 'AI_MODEL')) : null;
        const groupId = type === 'group' ? msg.group_id : null;

        const calculatedHash = calculateMessageHash({
            previousHash: msg.previous_message_hash,
            senderId,
            receiverId,
            groupId,
            content: msg.content,
            ciphertext: msg.ciphertext,
            timestamp: msg.created_at
        });

        if (msg.message_hash !== calculatedHash) {
            console.error(`[INTEGRITY FAILURE] Message ${msg._id} content was tampered with!`);
            console.log(`Stored Hash:     ${msg.message_hash}`);
            console.log(`Calculated Hash: ${calculatedHash}`);
            isValid = false;
        } else {
            console.log(`[OK] Message ${msg._id} verified.`);
        }
    }

    if (isValid) {
        console.log('\n✅ CHAIN VERIFIED: All messages are authentic and untampered.');
    } else {
        console.log('\n❌ CHAIN CORRUPTED: Evidence of tampering or missing blocks detected.');
    }
};

const runTest = async () => {
    await connectDB();
    
    // You can pass IDs as arguments if you want to test specific chats
    const targetId = process.argv[3];
    const type = process.argv[2] || 'ai'; // ai, p2p, group

    if (!targetId && type !== 'list') {
        console.log('Usage: node test_hash_chain.js [ai|p2p|group] [ID]');
        console.log('Example: node test_hash_chain.js ai 65f1234567890');
        console.log('\nListing some users to test AI chat:');
        const users = await mongoose.model('User').find().limit(5);
        users.forEach(u => console.log(`${u.name}: ${u._id}`));
        process.exit(0);
    }

    await verifyChain(type, targetId);
    process.exit(0);
};

runTest();
