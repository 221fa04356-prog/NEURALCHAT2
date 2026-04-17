const mongoose = require('mongoose');

const messageRequestSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initialMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

messageRequestSchema.index({ sender_id: 1, receiver_id: 1 }, { unique: true });

module.exports = mongoose.model('MessageRequest', messageRequestSchema);
