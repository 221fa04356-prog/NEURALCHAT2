const mongoose = require('mongoose');
const { fieldEncryption } = require('mongoose-field-encryption');

const communitySchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: null },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    removedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
    announcements: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    whoCanAddGroups: { type: String, enum: ['everyone', 'admins'], default: 'admins' },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    userHistory: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date },
        visibleFrom: { type: Date, default: Date.now }
    }],
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// App-level Field Encryption
communitySchema.plugin(fieldEncryption, {
    fields: ["name", "description"],
    secret: process.env.DEFAULT_ENCRYPTION_SECRET,
    salt: process.env.DEFAULT_ENCRYPTION_SALT
});

module.exports = mongoose.model('Community', communitySchema, 'chatcommunities');

