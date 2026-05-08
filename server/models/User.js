const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const privacyVisibilitySchema = new mongoose.Schema({
    mode: {
        type: String,
        enum: ['everyone', 'everyone_except', 'no_one'],
        default: 'everyone'
    },
    exceptUserIds: {
        type: [String],
        default: []
    }
}, { _id: false });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, default: '' },
    email: { type: String, unique: true, required: true },
    email_signature: { type: String, unique: true, sparse: true, select: true },
    mobile: { type: String, unique: true, required: true },
    mobile_signature: { type: String, unique: true, sparse: true, select: true },
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
    rejectionCount: { type: Number, default: 0 },     // Strike counter (banned after each rejection, locked after 5)
    adminLock: { type: Boolean, default: false },       // Locked by admin after 5 strikes
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    customLists: [{
        _id: { type: String }, // Flexible to support timestamp or UUID strings
        name: { type: String, required: true },
        members: [{ type: String }] // Storing IDs as strings to match frontend implementation (could be User, Group, or Community IDs)
    }],
    
    // Unethical Messaging Features
    unethicalCount: { type: Number, default: 0 },
    messagingBlocked: { type: Boolean, default: false },
    unblockRequested: { type: Boolean, default: false },
    unblockRequestReason: { type: String },

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
    },
    // Per-account name overrides (aliases)
    // Key: targetUserId (string), Value: custom name
    nameOverrides: {
        type: Map,
        of: String,
        default: () => new Map()
    },
    privacySettings: {
        lastSeen: {
            type: privacyVisibilitySchema,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        onlineStatus: {
            type: privacyVisibilitySchema,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        profilePhoto: {
            type: privacyVisibilitySchema,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        about: {
            type: privacyVisibilitySchema,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        status: {
            type: privacyVisibilitySchema,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        readReceipts: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({ mode: 'everyone', exceptUserIds: [] })
        },
        typingIndicator: { type: Boolean, default: true },
        whoCanMessageMe: {
            type: String,
            enum: ['Everyone', 'My Contacts', 'No One'],
            default: 'Everyone'
        },
        messageRequestsRequired: { type: Boolean, default: true },
        blockUnknown: { type: Boolean, default: false },
        whoCanAddMeToGroups: {
            type: String,
            enum: ['Everyone', 'My Contacts', 'No One'],
            default: 'Everyone'
        },
        requireConsentBeforeForward: { type: Boolean, default: false },
        forwardLimit: {
            type: Number,
            enum: [1, 3, 5, 10],
            default: 5
        },
        notifyOnForward: { type: Boolean, default: false },
        screenshotDetection: { type: Boolean, default: true },
        notifyOnScreenshot: { type: Boolean, default: true },
        blurOnScreenshot: { type: Boolean, default: false },
        addWatermark: { type: Boolean, default: false },
        autoArchiveConversations: { type: Boolean, default: false },
        clearChatDataEnabled: { type: Boolean, default: false }
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure user profile flags are always selected
userSchema.add({
    __enc_name: { type: Boolean, select: true, default: false },
    __enc_displayName: { type: Boolean, select: true, default: false },
    __enc_email: { type: Boolean, select: true, default: false },
    __enc_mobile: { type: Boolean, select: true, default: false },
    __enc_about: { type: Boolean, select: true, default: false },
    __enc_designation: { type: Boolean, select: true, default: false }
});

// App-level Field Encryption
userSchema.plugin(fieldEncryption, {
    fields: ["name", "displayName", "email", "mobile", "about", "designation"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

module.exports = mongoose.model('User', userSchema);
