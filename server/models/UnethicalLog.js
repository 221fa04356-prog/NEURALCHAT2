const mongoose = require('mongoose');

const unethicalLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    reason: { type: String },
    type: { type: String, enum: ['direct', 'indirect'], default: 'direct' },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UnethicalLog', unethicalLogSchema);
