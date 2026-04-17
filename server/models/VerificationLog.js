const mongoose = require('mongoose');

const verificationLogSchema = new mongoose.Schema({
    identifier: {
        type: String,
        required: true,
        index: true
    },
    otp: {
        type: String,
        required: true
    },
    context: {
        type: String,
        required: true
    },
    maskedMobile: {
        type: String
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 0 // TTL index: document will be automatically deleted when expiresAt time is reached
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'expired'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
