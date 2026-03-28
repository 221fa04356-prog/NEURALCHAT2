const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    mobile: { type: String, unique: true, required: true },
    countryCode: { type: String, required: true, default: '+91' },
    designation: { type: String },
    about: { type: String, default: 'Available' },
    login_id: { type: String, unique: true, sparse: true }, // sparse allows null/undefined to not clash
    password: { type: String },
    password_signature: { type: String, select: false }, // For uniqueness check (SHA256 + Pepper)
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
    token_version: { type: Number, default: 0 },
    is_temporary_password: { type: Boolean, default: false },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
    bannedUntil: { type: Date, default: null },       // Temporary ban on sending requests
    rejectionCount: { type: Number, default: 0 },     // Strike counter (banned after each rejection, locked after 3)
    adminLock: { type: Boolean, default: false },       // Locked by admin after 3 strikes
    
    // E2EE (Signal Protocol) Keys
    signal_keys: {
        identityKey: { type: String },
        signedPreKey: {
            id: { type: Number },
            publicKey: { type: String },
            signature: { type: String }
        },
        oneTimePreKeys: [{
            id: { type: Number },
            publicKey: { type: String }
        }]
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure user profile flags are always selected
userSchema.add({
    __enc_name: { type: Boolean, select: true, default: false },
    __enc_email: { type: Boolean, select: true, default: false },
    __enc_mobile: { type: Boolean, select: true, default: false },
    __enc_about: { type: Boolean, select: true, default: false },
    __enc_designation: { type: Boolean, select: true, default: false }
});

// App-level Field Encryption
userSchema.plugin(fieldEncryption, {
    fields: ["name", "email", "mobile", "about", "designation"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

module.exports = mongoose.model('User', userSchema);
