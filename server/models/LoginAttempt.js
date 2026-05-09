const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    role: { type: String, enum: ['user', 'admin'], required: true },
    identifier: { type: String, required: true },
    ip: { type: String, required: true },
    count: { type: Number, default: 0 },
    firstFailureAt: { type: Date, default: Date.now },
    lastFailureAt: { type: Date, default: Date.now },
    blockedUntil: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
});

loginAttemptSchema.index({ blockedUntil: 1 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
