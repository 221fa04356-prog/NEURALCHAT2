const mongoose = require('mongoose');

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
    created_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('Community', communitySchema, 'chatcommunities');

