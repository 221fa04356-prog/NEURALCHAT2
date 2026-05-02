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
        const partnerId = process.argv[4];
        if (!partnerId) {
            console.log('\n⚠️ For P2P, you must provide TWO IDs to isolate a specific chat.');
            console.log('Usage: node test_hash_chain.js p2p <your-id> <partner-id>');
            process.exit(1);
        }
        messages = await Message.find({
            $or: [
                { user_id: id, receiver_id: partnerId },
                { user_id: partnerId, receiver_id: id }
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

    // Filter out legacy messages (sent before the blockchain update)
    const securedMessages = messages.filter(m => m.message_hash);
    
    if (securedMessages.length === 0) {
        console.log('Only legacy (unsecured) messages found. No blockchain messages to verify.');
        return;
    }

    console.log(`Found ${messages.length - securedMessages.length} legacy messages (skipped).`);
    console.log(`Verifying ${securedMessages.length} blockchain-secured messages...`);

    let isValid = true;
    for (let i = 0; i < securedMessages.length; i++) {
        const msg = securedMessages[i];
        
        // The first secured message might link back to a legacy message (undefined hash) or GENESIS_BLOCK
        const prevHash = i === 0 ? msg.previous_message_hash : securedMessages[i - 1].message_hash;

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
        console.log('\n✅ CHAIN VERIFIED: All secured messages are authentic and untampered.');
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
