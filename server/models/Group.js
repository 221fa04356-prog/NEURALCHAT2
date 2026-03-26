const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: { type: String, default: '' }, // Optional group name
    icon: { type: String, default: null }, // Base64 or URL of group icon
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    removedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Creator
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Additional admins
    permissions: {
        editSettings: { type: Boolean, default: true },
        sendMessages: { type: Boolean, default: true },
        addMembers: { type: Boolean, default: true },
        inviteLink: { type: Boolean, default: false },
        approveMembers: { type: Boolean, default: false }
    },
    isAnnouncementGroup: { type: Boolean, default: false },
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



groupSchema.virtual('isAnnouncement').get(function() {
    return this.isAnnouncementGroup;
});

module.exports = mongoose.model('Group', groupSchema);
