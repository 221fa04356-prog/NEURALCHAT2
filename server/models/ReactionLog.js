const mongoose = require('mongoose');

const reactionLogSchema = new mongoose.Schema({
    message_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    action: { type: String, enum: ['added', 'removed', 'updated'], required: true },
    isGroup: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReactionLog', reactionLogSchema);
