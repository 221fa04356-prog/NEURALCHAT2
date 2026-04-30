const mongoose = require('mongoose');

const chatActionLogSchema = new mongoose.Schema({
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    target_type: { type: String, enum: ['p2p', 'group', 'community'], required: true },
    action: { type: String, enum: ['block', 'report'], required: true },
    target_name: { type: String, default: '' },
    reason: { type: String, default: '' },
    created_at: { type: Date, default: Date.now }
});

chatActionLogSchema.index({ action: 1, created_at: 1 });
chatActionLogSchema.index({ actor_id: 1, action: 1 });
chatActionLogSchema.index({ target_id: 1, target_type: 1, action: 1 });

module.exports = mongoose.model('ChatActionLog', chatActionLogSchema);
