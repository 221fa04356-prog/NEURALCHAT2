const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target_type: { type: String, enum: ['user', 'group'], required: true },
    target_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    scheduled_at: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'sending', 'sent', 'failed', 'cancelled'], default: 'scheduled' },
    sent_message_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    sent_at: { type: Date, default: null },
    error: { type: String, default: '' },
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

scheduledMessageSchema.index({ status: 1, scheduled_at: 1 });
scheduledMessageSchema.index({ sender_id: 1, created_at: -1 });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
